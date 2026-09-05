// Brackenwake boots here.
//
// This file no longer knows all the modules. It raises the scene, loads the
// save, asks for a character if there is none, and then hands a list of systems
// to the runner. Each system is one file under src/game/app/systems/, says what
// it needs by name, and is the only thing that knows its own modules.
//
//   src/game/app/context.js   what every system may reach, and the frame record
//   src/game/app/system.js    the contract, the build order, the frame phases
//   src/game/app/systems/     one file per concern, listed in index.js
//   docs/mmo/wiring/R1.md     how to add one, and where the old file went
//
// The frame is the one in docs/mmo/07-RUNTIME-CONTRACT.md: keys, then the
// click, then whoever is moving the eye, then the world and the fight, then
// everything that reads what the fight decided, then the picture.

import { createContext, NIGHT_BELOW } from './app/context.js';
import { createSystems } from './app/system.js';
import { SYSTEMS, world } from './app/systems/index.js';
import { createCreation } from './creation.js';
import { buildCharacter } from './player.js';
import { normalise as normaliseSettings } from './win_settings.js';

const SAVE_EVERY_MS = 5000;

function boot() {
  const ctx = createContext({
    container: document.getElementById('game') || document.body,
    hudRoot: document.getElementById('hud') || document.body,
  });
  const { sc, state, input, audio } = ctx;

  // The ground is raised before the character is chosen: creation.js turns its
  // rig over real terrain, and the world is expensive enough to want the head
  // start. The second call below finds it standing and keeps it.
  createSystems(ctx, [world]);

  // A player who has never chosen anything, or one migrated from the old save,
  // picks an opening first. creation.js runs its own render loop over the
  // scene and removes itself before onDone, so the game loop waits for it.
  if (state.needsCreation) {
    createCreation(ctx.hudRoot, {
      sc, buildCharacter,
      onDone: (character) => {
        state.setCharacter(character);
        state.save();
        startGame();
      },
    });
    window.__bw = { sc, state, hud: ctx.hud, audio, input, camera: ctx.camera, THREE: ctx.THREE, creating: true };
    return window.__bw;
  }
  return startGame();

  function startGame() {
    // an old save's settings are filled in and clamped before anything reads them
    ctx.character.settings = normaliseSettings(ctx.character.settings);
    const systems = createSystems(ctx, SYSTEMS);
    systems.ready();

    const f = ctx.frame;
    let last = performance.now();
    let lastSave = last;
    let dead = false;

    // `manual` is the harness: __bw.step(ms) runs this same function with a
    // synthetic clock and no rAF, so a hidden tab can still be driven a frame at
    // a time. There is no second code path; the test path is the frame.
    function frame(now, manual = false) {
      if (dead) return;
      if (!manual) requestAnimationFrame(frame);
      f.dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      f.now = now;
      f.nowS = now / 1000;
      f.day = sc.dayFactor(now);
      f.night = f.day < NIGHT_BELOW;

      systems.hotkeys(f);
      if (input.click) systems.click(ctx.aim(), f);
      systems.move(f);
      f.centre = ctx.get('player').eye();
      audio.setListener(f.centre.x, f.centre.z);   // the ear moves before anything can fire a cue
      systems.update(f);
      systems.late(f);
      systems.render(f);
      input.endFrame();

      if (now - lastSave > SAVE_EVERY_MS) { lastSave = now; saveNow(); }
    }
    const saveNow = () => { systems.save(); state.save(); };
    requestAnimationFrame(frame);
    window.addEventListener('beforeunload', saveNow);
    window.addEventListener('pagehide', saveNow);

    // The console's handle. Every system says what it wants on here through its
    // own `bw`, and the getters on those survive the merge.
    window.__bw = { step: (ms = 16.7) => frame(last + ms, true), get now() { return last; } };
    for (const bag of [ctx.bw, ...systems.order.map((name) => ctx.get(name).bw)]) {
      if (bag) Object.defineProperties(window.__bw, Object.getOwnPropertyDescriptors(bag));
    }
    return window.__bw;
  }
}

boot();
