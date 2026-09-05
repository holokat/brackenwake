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
//   frame = { dt, now, nowS, day, night, centre }
//
// Two clocks, as ever: `now` is performance.now() milliseconds and `nowS` is
// the same instant in seconds. combat.js and the world take ms; abilities and
// everything W4 wrote take seconds. Nothing else is ever passed.

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

  const ctx = {
    container, hudRoot, THREE,
    sc, state, hud, audio, floaters, input, camera,
    get character() { return state.character; },

    frame: { dt: 0, now: performance.now(), nowS: performance.now() / 1000, day: 1, night: false, centre: null },

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
    sc, state, hud, audio, input, camera, floaters, THREE,
    get character() { return state.character; },
  };

  return ctx;
}
