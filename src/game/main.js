// Brackenwake boots here.
//
// This file no longer knows all the modules. It raises the scene, loads the
// save, asks WHO is playing and then whether they need making, and then hands a
// list of systems to the runner. Each system is one file under
// src/game/app/systems/, says what it needs by name, and is the only thing that
// knows its own modules.
//
//   src/game/app/context.js   what every system may reach, and the frame record
//   src/game/app/system.js    the contract, the build order, the frame phases
//   src/game/app/systems/     one file per concern, listed in index.js
//   docs/mmo/wiring/R1.md     how to add one, and where the old file went
//   docs/mmo/wiring/S1.md     the save slots and the roster screen
//
// Three screens, in this order, and each takes itself off before the next one
// goes up: the roster, the making of a character, then the game.
//
// The frame is the one in docs/mmo/07-RUNTIME-CONTRACT.md: keys, then the
// click, then whoever is moving the eye, then the world and the fight, then
// everything that reads what the fight decided, then the picture.

import { createContext, NIGHT_BELOW } from './app/context.js';
import { createSystems } from './app/system.js';
import { SYSTEMS, world } from './app/systems/index.js';
import { createCreation } from './creation.js';
import { createRoster } from './roster.js';
import { buildStudioCharacter as buildCharacter } from './studio/body.js';
import { rosterAsked, clearRosterAsk } from './state.js';
import { normalise as normaliseSettings } from './win_settings.js';
import { WORLD_FOG } from './scene.js';

const SAVE_EVERY_MS = 5000;

/**
 * Which screen the boot puts up, and the whole of that decision.
 *
 * Three answers, and every one of them is somebody's real situation:
 *
 *   roster     somebody has been made, so there is a choice to offer. The note
 *              the settings window leaves forces this screen even for a slot
 *              that was begun and never finished, because that is the screen
 *              it asked for and the player is standing in front of it.
 *   creation   nobody has been made and the document in hand asks to be, which
 *              is a brand new install, and a v1 save that has just moved in.
 *   game       nothing to choose between and nothing to make: a whole
 *              character in memory that no roster lists, which is what a
 *              storage that refuses to be written leaves behind.
 *
 * Pure, and exported, so all three are driven in wiring.test.mjs rather than
 * read off the page.
 */
export function bootStage(state, flags = {}) {
  const rows = typeof state?.roster === 'function' ? state.roster() : [];
  if (flags.roster && rows.length) return 'roster';
  if (rows.some((s) => !s.needsCreation)) return 'roster';
  return state?.needsCreation ? 'creation' : 'game';
}

async function boot() {
  const ctx = createContext({
    container: document.getElementById('game') || document.body,
    hudRoot: document.getElementById('hud') || document.body,
  });
  const { sc, state, input, audio } = ctx;

  // The ground is raised before the character is chosen: creation.js turns its
  // rig over real terrain, and the world is expensive enough to want the head
  // start. The second call below finds it standing and keeps it.
  createSystems(ctx, [world]);
  // Birth, people, forage and combat must all start on the saved landscape.
  // Starting them before the fetch finished cached the generated world's
  // village and resources, even after the terrain switched to Greenwold.
  const loaded = await ctx.get('world').runtime.ready;
  if(!loaded){
    ctx.hud.toast('Greenwold could not be loaded. Reload to try again.');
    window.__bw={sc,state,hud:ctx.hud,loadingError:true};
    return window.__bw;
  }

  const stage = bootStage(state, { roster: rosterAsked() });
  // The roster takes the note down itself the moment it is on screen. When the
  // answer is any other screen the note is taken down here instead, so a note
  // nobody could act on cannot follow the player around for the rest of the
  // session and send them somewhere they did not ask to go.
  if (stage !== 'roster') clearRosterAsk();
  if (stage === 'roster') return showRoster();
  if (stage === 'creation') return showCreation();
  return startGame();

  /**
   * Who is playing. Only reached when there is somebody to choose, so the
   * first boot of a new install never sees it. The screen runs its own render
   * loop over the world that is already standing and removes itself before it
   * calls back, exactly as creation.js does.
   */
  function showRoster() {
    createRoster(ctx.hudRoot, {
      sc, state,
      onPlay: (id) => {
        state.openSlot(id);
        // A slot that was begun and never finished goes back to the making of
        // them rather than into a world with a blank standing in it.
        if (state.needsCreation) showCreation(); else startGame();
      },
      onNew: () => { state.newSlot(); showCreation(); },
    });
    window.__bw = { sc, state, hud: ctx.hud, audio, input, camera: ctx.camera, THREE: ctx.THREE, roster: true };
    return window.__bw;
  }

  // A player who has never chosen anything, or one migrated from the old save,
  // picks an opening first. creation.js runs its own render loop over the
  // scene and removes itself before onDone, so the game loop waits for it.
  function showCreation() {
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

  function startGame() {
    sc.setFog(WORLD_FOG.near,WORLD_FOG.far);
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

// The boot runs itself in a browser and nowhere else. `bootStage` above is
// exported so a test can drive the decision; importing this file to reach it
// must not try to raise a scene in node, and a node process has no document.
if (typeof document !== 'undefined' && typeof document.getElementById === 'function') boot();
