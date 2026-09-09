import {assetWork} from './streaming/work_queue.js';
import {gltfAssets} from './streaming/gltf_assets.js';
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
import { rosterAsked, clearRosterAsk } from './state.js';
import { normalise as normaliseSettings } from './win_settings.js';
import { WORLD_FOG } from './scene.js';
import { runBoot } from './app/boot_lifecycle.js';

const SAVE_EVERY_MS = 5000;

/**
 * Which screen the boot puts up, and the whole of that decision.
 *
 * Three answers, and every one of them is somebody's real situation:
 *
 *   roster     somebody has been made, so there is a choice to offer. The note
 *              the settings window leaves can force this screen only when a
 *              completed row exists for the roster to list.
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

  // The ground is raised before the character is chosen, and the world is
  // expensive enough to want the head start. The second call below finds it
  // standing and keeps it.
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
  // The game HUD is built with the context, before anyone has chosen a
  // character, and it showed through the roster for a moment (the user,
  // 2026-09-08: "i temporarily see the resource bar"). It stays hidden until
  // the world starts; the roster and creation draw on the same root beside it.
  function hudHidden(on) { if (ctx.hud && ctx.hud.el) ctx.hud.el.hidden = on; }

  // The welcome page (welcome/index.html) stands before the roster: a first
  // visit to / goes there, and its one button comes back with ?play, which is
  // remembered for the session so a reload lands on the roster (the user,
  // 2026-09-08: "put that up before the character creation step").
  function welcomeFirst() {
    try {
      const params = new URLSearchParams(location.search);
      if (params.has('play') || params.has('solo') || params.has('dev') || params.has('editor')) { sessionStorage.setItem('bw-entered', '1'); return false; }
      if (sessionStorage.getItem('bw-entered')) return false;
      if (location.pathname !== '/' && location.pathname !== '/index.html') return false;
      location.replace('/welcome/');
      return true;
    } catch { return false; }
  }

  function showRoster() {
    if (welcomeFirst()) return null;
    hudHidden(true);
    audio.music.setContext({ screen: 'roster' });
    createRoster(ctx.hudRoot, {
      state,
      onPlay: (id) => {
        const opened = state.openSlot(id);
        // A stale row that still points at a draft is cleaned by the roster,
        // then shown again. It never reaches the world as a blank character.
        if (!opened || state.needsCreation) showRoster(); else startGame();
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
    hudHidden(true);
    // The making of a character has its own theme; BEGIN was the gesture that
    // lets the browser play it.
    audio.music.setContext({ screen: 'creation' });
    audio.music.start();
    createCreation(ctx.hudRoot, {
      onDone: (character) => {
        state.setCharacter(character);
        state.save();
        startGame();
      },
      onCancel: () => { state.discardDraft?.(); showRoster(); },
    });
    window.__bw = { sc, state, hud: ctx.hud, audio, input, camera: ctx.camera, THREE: ctx.THREE, creating: true };
    return window.__bw;
  }

  function startGame() {
    hudHidden(false);
    audio.music.setContext({ screen: null });
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
      const frameStarted = performance.now();
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
      assetWork.reportFrame(performance.now() - frameStarted);

      if (now - lastSave > SAVE_EVERY_MS) { lastSave = now; saveNow(); }
    }
    const saveNow = () => { systems.save(); state.save(); };
    requestAnimationFrame(frame);
    window.addEventListener('beforeunload', saveNow);
    window.addEventListener('pagehide', saveNow);

    // The console's handle. Every system says what it wants on here through its
    // own `bw`, and the getters on those survive the merge.
    window.__bw = { step: (ms = 16.7) => frame(last + ms, true), get now() { return last; }, get assetLoading() { return {assets:gltfAssets.stats, work:assetWork.stats}; } };
    for (const bag of [ctx.bw, ...systems.order.map((name) => ctx.get(name).bw)]) {
      if (bag) Object.defineProperties(window.__bw, Object.getOwnPropertyDescriptors(bag));
    }
    return window.__bw;
  }
}

// The boot runs itself in a browser and nowhere else. `bootStage` above is
// exported so a test can drive the decision; importing this file to reach it
// must not try to raise a scene in node, and a node process has no document.
if (typeof document !== 'undefined' && typeof document.getElementById === 'function') {
  runBoot(boot).catch(error => console.error('[Brackenwake] Boot failed:', error));
}
