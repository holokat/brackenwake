// The context: everything a system may reach, in one place.
//
// A system never imports another system. It asks the context for it by name,
// at the moment it needs it, which is why a system created early can still
// call one created late. The core services below exist before any system does,
// because the character creation screen needs a scene, a HUD and an ear before
// there is a character to play.
//
// The shape, in full:
//
//   ctx = {
//     container, hudRoot,          // the two DOM roots index.html provides
//     THREE,                       // so a console has the same THREE the game has
//     sc,                          // scene.js: renderer, scene, camera, lights, day
//     state,                       // state.js, already loaded from storage
//     hud, audio, floaters,        // the three things that talk to the player
//     input, camera,               // the keys and the rig that follows them
//     get character(),             // the document, once one has been chosen
//     frame,                       // the live frame record, see FRAME below
//     aim(),                       // the one raycaster, set from the cursor now
//     isNight(nowMs),              // the world's own night flag
//     register(name, system), get(name), has(name), names(),
//   }
//
// FRAME is the record every per frame hook is handed. It is one object, reused
// every frame and mutated by the loop, so nothing may keep a reference to it
// past the phase it was handed in.
//
//   frame = { dt, now, nowS, day, night, centre,
//             worldDt, worldNow, worldNowS, timeScale }
//
// Two clocks, as ever: `now` is performance.now() milliseconds and `nowS` is
// the same instant in seconds. combat.js and the world take ms; abilities and
// everything W4 wrote take seconds. Nothing else is ever passed.
//
// TWO CLOCKS AGAIN, FOR A DIFFERENT REASON. Boss phase scripts can slow the
// world without slowing the player. So the frame carries a SECOND pair of
// numbers, and which one a call reads is the whole of what slow time is:
//
//   now / dt / nowS              the player, the player's own projectiles,
//                                cooldowns, casts and the HUD
//   worldNow / worldDt / worldNowS   monsters, their swings and shots, the
//                                world streaming, the day, the water, the npcs
//
// In ordinary time the two are the same number. `ctx.clock` is the one thing
// that may set them apart, and `docs/mmo/wiring/D2.md` lists every call site
// by name. The world clock is MONOTONIC and never runs ahead of the player's:
// it falls behind while the world is slowed and is paid back over the half
// second of the end pulse, which is why the swings queued in slow time all
// land at once when time resumes.

import * as THREE from 'three';
import { createScene } from '../scene.js';
import { createState } from '../state.js';
import { createHud } from '../hud.js';
import { createAudio } from '../audio.js';
import { createFloaters } from '../floaters.js';
import { createInput } from '../input.js';
import { createFollowCamera } from '../camera.js';

/** The world's night flag, the same threshold world_runtime hands fauna. */
export const NIGHT_BELOW = 0.4;

/**
 * The world clock: one number, and the rate it advances at.
 *
 * `scale` is the fraction of real time the world gets. 1 is ordinary time.
 *
 * Three rules it will not break, because each of them was a bug waiting:
 *
 *   MONOTONIC. It never goes backwards, so a job already in combat.js's
 *   pending list can never become un-landed.
 *   NEVER AHEAD. It is clamped to the player's clock, so the world cannot be
 *   handed a `now` from the future and settle a swing before it was thrown.
 *   PAID BACK. Time the world did not get is a DEBT, and `catchUp(ms)` pays
 *   the whole of it over that many milliseconds of real time. That is the end
 *   pulse: the swings and breaths queued while the world was slow all land as
 *   the clock runs them down, in the order they were queued.
 *
 * `sync(frame)` is idempotent per `frame.now`: the runner calls it at the top
 * of every phase and only the first call of a frame moves anything, so a test
 * that drives `update` alone gets the same clock the game does.
 */
export function createWorldClock(startNow = 0) {
  let worldNow = startNow;
  let seenNow = null;
  let scale = 1;
  let catching = null;              // { t0, ms, debt }
  const num = (v) => (Number.isFinite(v) ? v : 0);

  const api = {
    /** The fraction of real time the world is getting right now. */
    get scale() { return scale; },
    setScale(v) {
      const s = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1;
      scale = s;
      return scale;
    },
    /** Milliseconds the world is behind the player. */
    get debt() { return seenNow == null ? 0 : Math.max(0, seenNow - worldNow); },
    get now() { return worldNow; },
    /** Pay the whole debt back over `ms` of real time, then run level again. */
    catchUp(ms = 500, atNow = seenNow) {
      const t0 = num(atNow);
      const debt = Math.max(0, t0 - worldNow);
      scale = 1;
      catching = debt > 0 ? { t0, ms: Math.max(1, num(ms)), debt } : null;
      return debt;
    },
    get catchingUp() { return !!catching; },
    /** Forget the lag entirely: a teleport, a death, a dungeon change. */
    reset(atNow = seenNow) {
      worldNow = num(atNow);
      catching = null;
      scale = 1;
      return worldNow;
    },

    /**
     * Advance the world clock to this frame and write the four world numbers
     * onto the frame record. Called once per frame however many phases run.
     */
    sync(frame) {
      if (!frame) return frame;
      if (seenNow === frame.now) return frame;
      const first = seenNow == null;
      seenNow = frame.now;
      if (first) worldNow = frame.now;
      const prev = worldNow;
      let target;
      if (catching) {
        const p = Math.min(1, (frame.now - catching.t0) / catching.ms);
        target = frame.now - catching.debt * (1 - p);
        if (p >= 1) catching = null;
      } else if (scale >= 1) {
        // AT FULL SPEED THE TWO CLOCKS ARE ONE NUMBER, and this line is why:
        // integrating `dt` instead would make the world lose whatever a hitch
        // cost, for ever, because main.js clamps `dt` to 50 ms and does not
        // clamp `now`. A tab left in the background for a minute would come
        // back with a world a minute behind the player and every queued swing
        // stranded in the pending list. Debt exists ONLY while the world is
        // deliberately slowed, and only `catchUp` pays it.
        target = frame.now;
      } else {
        target = worldNow + num(frame.dt) * 1000 * scale;
      }
      if (target > frame.now) target = frame.now;       // never ahead of the player
      if (target < prev) target = prev;                 // never backwards
      worldNow = target;
      frame.worldNow = worldNow;
      // The same 50 ms ceiling main.js puts on `dt`: no frame of the world is
      // ever allowed to step further than one of the player's, so the catch up
      // pays its debt in CLOCK time (which is what makes the swings land) and
      // not in one enormous step of monster movement.
      frame.worldDt = Math.min(0.05, (worldNow - prev) / 1000);
      frame.worldNowS = worldNow / 1000;
      frame.timeScale = num(frame.dt) > 0 ? (worldNow - prev) / (frame.dt * 1000) : scale;
      return frame;
    },
  };
  return api;
}

export function createContext({ container, hudRoot } = {}) {
  const sc = createScene(container);
  const state = createState();
  state.load();

  const hud = createHud(hudRoot);

  // Sound. Browsers refuse audio until the player clicks or presses a key;
  // createAudio listens for that itself, so there is nothing to unlock here.
  const audio = createAudio();
  // numbers that fly off things; gains, damage and falls all go through here.
  // The size follows the settings window's text scale.
  const floaters = createFloaters(sc, hudRoot, { textScale: () => state.character?.settings?.textScale ?? 1 });

  // input comes before the camera: createFollowCamera takes it, so the boot
  // order in the contract is read as "the camera rig, and the input it needs"
  const input = createInput(sc.renderer.domElement);
  const camera = createFollowCamera(sc.camera, input);

  // one raycaster for the whole game: the click router and the cursor hints
  // both aim it at the pointer, at their own moment in the frame, and the
  // camera has moved between those two moments
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  const registry = new Map();
  // Level until a boss phase slows it; see the frame split below.
  const clock = createWorldClock(performance.now());

  const ctx = {
    container, hudRoot, THREE,
    sc, state, hud, audio, floaters, input, camera,
    get character() { return state.character; },

    clock,

    frame: {
      dt: 0, now: performance.now(), nowS: performance.now() / 1000,
      day: 1, night: false, centre: null,
      // slow time: equal to the three above until ctx.clock is slowed
      worldDt: 0, worldNow: performance.now(), worldNowS: performance.now() / 1000, timeScale: 1,
    },

    aim() {
      ndc.set(input.pointer?.x ?? 0, input.pointer?.y ?? 0);
      raycaster.setFromCamera(ndc, sc.camera);
      return raycaster;
    },

    isNight: (nowMs) => sc.dayFactor(nowMs) < NIGHT_BELOW,

    /**
     * Hand a built system to everyone else under its name. A name is taken
     * once and never again: two systems answering to one name is the bug that
     * looks like a system quietly doing nothing.
     */
    register(name, system) {
      if (typeof name !== 'string' || !name) throw new Error('a system needs a name to be registered under');
      if (registry.has(name)) throw new Error(`the system name "${name}" is already taken; a name is registered once`);
      registry.set(name, system);
      return system;
    },

    /** The system, or a clear death rather than a silent undefined. */
    get(name) {
      if (!registry.has(name)) {
        throw new Error(`no system named "${name}" (have: ${[...registry.keys()].join(', ') || 'none'})`);
      }
      return registry.get(name);
    },

    has: (name) => registry.has(name),
    names: () => [...registry.keys()],
  };

  // what the console gets before any system has been built
  ctx.bw = {
    sc, state, hud, audio, input, camera, floaters, THREE, clock,
    get character() { return state.character; },
  };

  return ctx;
}
