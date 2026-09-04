// The Blender models, loaded once and instanced many times.
//
// Built by tools/blender/build_human.py and build_monsters.py, checked by
// tools/validate-glb.mjs, which is what guarantees the promises this module
// makes about them: feet on y = 0, forward +z, metres, exactly one skin, and
// every clip present under the name the game asks for.
//
// The shape of the thing you get back:
//
//   const a = instantiate('human-medium');
//   scene.add(a.group);
//   a.setSpeed(player.speed);      // blends idle, walk and run by ground speed
//   a.play('swing');               // a one shot over the top, then back
//   a.setTint('tunic', 0x7a3b2e);  // recolour one material slot
//   a.update(dt);                  // every frame
//   a.dispose();
//
// LOCOMOTION IS A BLEND TREE, not a switch. idle, walk and run all run at once
// with weights that are continuous in speed, so walking up to a run is a
// crossfade and never a pop. The walk and run clips also change rate with
// speed so the feet keep up with the ground instead of skating. A one shot
// (swing, cast, hurt, die, attack, special, jump) ducks the whole locomotion
// set to zero over `fade` seconds and brings it back when the clip ends, which
// is one gain on a group rather than three fades that can get out of step.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';

export const MODEL_DIR = '/models/mmo/';

export const MODEL_IDS = [
  'human-slim', 'human-medium', 'human-heavy',
  'monster-skeleton', 'monster-goblin', 'monster-rat',
  'monster-zombie', 'monster-spider', 'monster-bat',
];

// The clips each family carries. Asking for one that is not here is a
// programming error and says so rather than silently doing nothing.
export const CLIPS = {
  human: ['idle', 'walk', 'run', 'swing', 'cast', 'hurt', 'die', 'jump'],
  monster: ['idle', 'walk', 'attack', 'hurt', 'die', 'special'],
};

// Ground speed in metres a second. walk and run are the speeds the clips were
// built to cover, and they are player.js's WALK_SPEED and RUN_SPEED, so a
// character moving at 7 plays the walk at rate 1. rateMin and rateMax stop a
// crawl or a sprint turning the legs into a blur or a slideshow.
export const SPEEDS = {
  idle: 0.2,
  walk: 7,
  run: 18,
  // rateMin has to sit below half, or a character ambling at half walking
  // speed plays the walk clip faster than it is moving and skates. It exists
  // only to stop a near stationary crawl freezing the clip, and at those
  // speeds the walk carries almost no weight anyway.
  rateMin: 0.3,
  rateMax: 1.8,
};

export const LOCOMOTION = ['idle', 'walk', 'run'];

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// The blend tree, as a pure function so it can be tested without a GPU.
// Weights always sum to 1 and are continuous in mps, which is what makes the
// transition a crossfade rather than a switch.
export function locomotionWeights(mps) {
  const s = Number.isFinite(mps) ? Math.max(0, mps) : 0;
  if (s <= SPEEDS.idle) return { idle: 1, walk: 0, run: 0 };
  if (s < SPEEDS.walk) {
    const t = (s - SPEEDS.idle) / (SPEEDS.walk - SPEEDS.idle);
    return { idle: 1 - t, walk: t, run: 0 };
  }
  if (s < SPEEDS.run) {
    const t = (s - SPEEDS.walk) / (SPEEDS.run - SPEEDS.walk);
    return { idle: 0, walk: 1 - t, run: t };
  }
  return { idle: 0, walk: 0, run: 1 };
}

// How fast to play each locomotion clip at this ground speed.
export function locomotionRates(mps) {
  const s = Number.isFinite(mps) ? Math.max(0, mps) : 0;
  return {
    idle: 1,
    walk: clamp(s / SPEEDS.walk, SPEEDS.rateMin, SPEEDS.rateMax),
    run: clamp(s / SPEEDS.run, SPEEDS.rateMin, SPEEDS.rateMax),
  };
}

// poseCharacter in player.js reaches for head, torso, armL, armR, legL, legR.
// Every rig here can offer those six, even the ones with no arms: the spider
// lends its front and back legs, the bat its wings and wing tips. A joint that
// genuinely has no counterpart comes back null rather than as something that
// would move the wrong part.
const BIPED = { head: 'head', torso: 'chest', armL: 'upperarm_L', armR: 'upperarm_R', legL: 'upperleg_L', legR: 'upperleg_R' };
export const RIGS = {
  'human-slim': BIPED,
  'human-medium': BIPED,
  'human-heavy': BIPED,
  'monster-skeleton': BIPED,
  'monster-goblin': BIPED,
  'monster-zombie': BIPED,
  'monster-rat': { head: 'head', torso: 'chest', armL: 'legF_L', armR: 'legF_R', legL: 'legB_L', legR: 'legB_R' },
  'monster-spider': { head: 'body', torso: 'abdomen', armL: 'leg1_L', armR: 'leg1_R', legL: 'leg4_L', legR: 'leg4_R' },
  'monster-bat': { head: 'head', torso: 'body', armL: 'wing_L', armR: 'wing_R', legL: 'tip_L', legR: 'tip_R' },
};

export function clipsFor(id) {
  return id.startsWith('human-') ? CLIPS.human : CLIPS.monster;
}

// monster_models.js keys its placeholder rigs by shape family, not by monster
// id, so this is the one place that says which Blender model wears which
// family. Five of the six line up by name; the sixth is 'flyer', which is the
// cave bat, the harpy and the wyvern. 'biped' gets a human body, which is what
// a bandit or an orc is.
export const FAMILY_MODEL = {
  skeleton: 'monster-skeleton',
  goblin: 'monster-goblin',
  rat: 'monster-rat',
  zombie: 'monster-zombie',
  spider: 'monster-spider',
  flyer: 'monster-bat',
  biped: 'human-heavy',
};

export function modelForFamily(family) {
  return FAMILY_MODEL[family] || null;
}

// The two families keep different clip names: a human swings and casts, a
// monster attacks and has a special, and no monster has a run. A caller that
// thinks in one vocabulary can pass a name through here and get one the model
// on screen actually carries, rather than a warning and a frozen pose.
const ALIAS = {
  attack: ['attack', 'swing'],
  special: ['special', 'cast', 'swing'],
  swing: ['swing', 'attack'],
  cast: ['cast', 'special', 'attack'],
  run: ['run', 'walk'],
  jump: ['jump', 'idle'],
};

export function clipAlias(id, name) {
  const have = clipsFor(id);
  if (have.includes(name)) return name;
  for (const candidate of ALIAS[name] || []) if (have.includes(candidate)) return candidate;
  return null;
}

export function urlFor(id) {
  return MODEL_DIR + id + '.glb';
}

// --- loading --------------------------------------------------------------

const cache = new Map();     // id -> { scene, clips: Map<name, AnimationClip> }
const pending = new Map();   // id -> Promise
let loader = null;

function gltfLoader() {
  if (!loader) loader = new GLTFLoader();
  return loader;
}

export function isLoaded(id) {
  return cache.has(id);
}

export function loadModel(id) {
  if (cache.has(id)) return Promise.resolve(cache.get(id));
  if (pending.has(id)) return pending.get(id);
  const p = new Promise((resolve, reject) => {
    gltfLoader().load(urlFor(id), (gltf) => {
      const clips = new Map();
      for (const c of gltf.animations) clips.set(c.name, c);
      const want = clipsFor(id);
      const missing = want.filter((c) => !clips.has(c));
      if (missing.length) console.warn(`models: ${id} is missing clips ${missing.join(', ')}`);
      const entry = { id, scene: gltf.scene, clips, animations: gltf.animations };
      cache.set(id, entry);
      pending.delete(id);
      resolve(entry);
    }, undefined, (err) => {
      pending.delete(id);
      console.warn('models: failed to load', id, err);
      reject(err);
    });
  });
  pending.set(id, p);
  return p;
}

export function preloadModels(ids = MODEL_IDS) {
  return Promise.all(ids.map((id) => loadModel(id).catch(() => null)));
}

// --- what the file says before anything animates it ------------------------
//
// rig_glb.js hangs its anchors off bones, and to do that it needs each bone's
// BIND transform in the model's own space: where the wrist is before a single
// clip has touched it. Reading that off a live instance would be a race with
// the mixer, so it is read off `entry.scene`, the untouched original that
// `skeletonClone` copies from and that nothing ever animates.

const RESTS = new Map();   // id -> Map<boneName, { pos, quat, parent }>

/**
 * Every bone's rest position and rotation in the model root's frame, by name.
 * Cached; the returned map is shared, so treat the vectors as read only.
 */
export function restFrames(id) {
  if (RESTS.has(id)) return RESTS.get(id);
  const entry = cache.get(id);
  if (!entry) return null;
  const out = new Map();
  entry.scene.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(entry.scene.matrixWorld).invert();
  entry.scene.traverse((o) => {
    if (!o.isBone) return;
    const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scl = new THREE.Vector3();
    m.decompose(pos, quat, scl);
    out.set(o.name, { pos, quat, parent: o.parent && o.parent.isBone ? o.parent.name : null });
  });
  RESTS.set(id, out);
  return out;
}

/** How long a clip runs in this model, in seconds. 0 when the model has no such clip. */
export function clipDuration(id, name) {
  const entry = cache.get(id);
  const c = entry && entry.clips.get(name);
  return c ? c.duration : 0;
}

/** The bind-pose bounding box of a loaded model, in its own metres. */
export function modelBounds(id) {
  const entry = cache.get(id);
  if (!entry) return null;
  entry.scene.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(entry.scene);
}

/** Triangles in one loaded model, counted off the index or position buffers. */
export function modelTriangles(id) {
  const entry = cache.get(id);
  if (!entry) return 0;
  let n = 0;
  entry.scene.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const g = o.geometry;
    n += g.index ? g.index.count / 3 : (g.attributes.position ? g.attributes.position.count / 3 : 0);
  });
  return Math.round(n);
}

// --- instancing -----------------------------------------------------------

// instantiate returns SYNCHRONOUSLY, the way landmarks.js places a landmark:
// an empty group now, filled in when the file arrives. Everything called in
// the meantime (play, setSpeed, setTint) is remembered and applied on arrival,
// so a caller never has to know whether the model had loaded yet. `ready` is
// the promise for anyone who does.
export function instantiate(id) {
  const group = new THREE.Group();
  group.name = id;
  const queued = { clip: null, speed: 0, tints: [] };
  const inst = {
    id,
    group,
    mixer: null,
    bones: null,
    materials: null,
    loaded: false,
    disposed: false,
    ready: null,
    _actions: new Map(),
    _loco: {},
    _oneShot: null,
    _locoGain: 1,
    _locoTarget: 1,
    _fadeRate: 8,
    _speed: 0,
  };

  // A model already in the cache is built RIGHT NOW rather than on a
  // microtask. rig_glb.js leans on that: with preloadRigs awaited at boot, a
  // rig is a glb from the first frame and no player ever sees the fallback
  // body blink past. Nothing else changes; an uncached id still arrives late
  // and everything asked of it in the meantime is still queued.
  const cached = cache.get(id);
  if (cached) {
    build(inst, cached);
    startLocomotion(inst);
    inst.ready = Promise.resolve(inst);
  } else {
    inst.ready = loadModel(id).then((entry) => {
      if (inst.disposed) return inst;
      build(inst, entry);
      for (const [slot, hex, opts] of queued.tints) inst.setTint(slot, hex, opts);
      inst.setSpeed(queued.speed);
      if (queued.clip) inst.play(queued.clip.name, queued.clip.opts);
      else startLocomotion(inst);
      return inst;
    }).catch(() => inst);
  }

  inst.play = (name, opts = {}) => {
    if (!inst.loaded) {
      queued.clip = { name, opts };
      return inst;
    }
    return playClip(inst, name, opts);
  };

  inst.setSpeed = (mps) => {
    inst._speed = Number.isFinite(mps) ? Math.max(0, mps) : 0;
    if (!inst.loaded) {
      queued.speed = inst._speed;
      return inst;
    }
    applyLocomotion(inst);
    return inst;
  };

  inst.setTint = (slot, hex, opts = {}) => {
    if (!inst.loaded) {
      queued.tints.push([slot, hex, opts]);
      return inst;
    }
    const m = inst.materials.get(slot);
    if (!m) {
      console.warn(`models: ${id} has no material slot ${slot}; it has ${[...inst.materials.keys()].join(', ')}`);
      return inst;
    }
    if (hex === null || hex === undefined) {
      // back to the colour the model shipped with
      m.color.copy(m.userData.baseColor);
      m.vertexColors = m.userData.baseVertexColors;
    } else if (opts.mode === 'multiply') {
      // keep the vertex colours and shade them, for a wash rather than a change
      m.color.setHex(hex);
      m.vertexColors = m.userData.baseVertexColors;
    } else {
      // replace: the slot becomes exactly this colour. The vertex colours have
      // to come off or the flat colour would be multiplied by them and a red
      // tunic on green wool would arrive brown.
      m.color.setHex(hex);
      m.vertexColors = false;
    }
    m.needsUpdate = true;
    return inst;
  };

  inst.partsLike = () => {
    const map = RIGS[id] || BIPED;
    const out = {};
    for (const [key, bone] of Object.entries(map)) out[key] = (inst.bones && inst.bones.get(bone)) || null;
    return out;
  };

  inst.bone = (name) => (inst.bones ? inst.bones.get(name) || null : null);

  /** How long one clip runs, in seconds, or 0 if this model has no such clip. */
  inst.clipDuration = (name) => clipDuration(id, name);

  inst.update = (dt) => {
    if (!inst.loaded || inst.disposed) return inst;
    const step = Number.isFinite(dt) ? Math.max(0, Math.min(dt, 0.1)) : 0;
    if (inst._locoGain !== inst._locoTarget) {
      const d = inst._fadeRate * step;
      inst._locoGain = inst._locoTarget > inst._locoGain
        ? Math.min(inst._locoTarget, inst._locoGain + d)
        : Math.max(inst._locoTarget, inst._locoGain - d);
      applyLocomotion(inst);
    }
    inst.mixer.update(step);
    return inst;
  };

  inst.dispose = () => {
    inst.disposed = true;
    if (inst.mixer) inst.mixer.stopAllAction();
    if (inst.group.parent) inst.group.parent.remove(inst.group);
    if (inst.materials) for (const m of inst.materials.values()) m.dispose();
    inst.group.clear();
    inst._actions.clear();
    return inst;
  };

  return inst;
}

function build(inst, entry) {
  const root = skeletonClone(entry.scene);
  inst.group.add(root);
  inst.mixer = new THREE.AnimationMixer(root);
  inst.bones = new Map();
  inst.materials = new Map();
  root.traverse((o) => {
    if (o.isBone) inst.bones.set(o.name, o);
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    // A skinned mesh's bounding sphere is the BIND pose. The die clip lays the
    // body out flat well outside it, so a culled character vanishes mid death.
    o.frustumCulled = false;
    const src = o.material;
    const m = src.clone();
    m.userData = { ...(src.userData || {}), baseColor: src.color ? src.color.clone() : new THREE.Color(0xffffff), baseVertexColors: !!src.vertexColors };
    m.flatShading = false;   // the normals are already per face, baked by Blender
    o.material = m;
    if (m.name) inst.materials.set(m.name, m);
  });
  for (const [name, clip] of entry.clips) {
    const action = inst.mixer.clipAction(clip);
    inst._actions.set(name, action);
  }
  for (const name of LOCOMOTION) {
    const a = inst._actions.get(name);
    if (a) {
      a.setLoop(THREE.LoopRepeat, Infinity);
      inst._loco[name] = a;
    }
  }
  inst.mixer.addEventListener('finished', (e) => {
    if (inst._oneShot && e.action === inst._oneShot.action && !inst._oneShot.hold) {
      inst._oneShot = null;
      inst._locoTarget = 1;
    }
  });
  inst.loaded = true;
}

function startLocomotion(inst) {
  for (const name of LOCOMOTION) {
    const a = inst._loco[name];
    if (a && !a.isRunning()) a.reset().play();
  }
  applyLocomotion(inst);
}

function applyLocomotion(inst) {
  const w = { ...locomotionWeights(inst._speed) };
  const r = locomotionRates(inst._speed);
  // No monster has a run clip. Without this a wolf at 9 m/s would have all its
  // weight on an action that does not exist, every clip at weight zero, and
  // the whole animal frozen mid stride while it slid across the ground. The
  // walk carries that weight instead, and locomotionRates already speeds the
  // walk up with the ground so the legs keep pace.
  if (!inst._loco.run && w.run) { w.walk += w.run; w.run = 0; }
  if (!inst._loco.walk && w.walk) { w.idle += w.walk; w.walk = 0; }
  for (const name of LOCOMOTION) {
    const a = inst._loco[name];
    if (!a) continue;
    if (!a.isRunning()) a.reset().play();
    a.setEffectiveWeight(w[name] * inst._locoGain);
    a.setEffectiveTimeScale(r[name]);
  }
}

function playClip(inst, name, opts = {}) {
  const action = inst._actions.get(name);
  if (!action) {
    console.warn(`models: ${inst.id} has no clip ${name}; it has ${[...inst._actions.keys()].join(', ')}`);
    return inst;
  }
  const fade = opts.fade === undefined ? 0.15 : Math.max(0.001, opts.fade);
  inst._fadeRate = 1 / fade;
  if (LOCOMOTION.includes(name)) {
    // asking for a locomotion clip by name means "go back to moving"
    if (inst._oneShot) {
      inst._oneShot.action.fadeOut(fade);
      inst._oneShot = null;
    }
    inst._locoTarget = 1;
    startLocomotion(inst);
    return inst;
  }
  if (inst._oneShot && inst._oneShot.action !== action) inst._oneShot.action.fadeOut(fade);
  const loop = opts.loop === true;
  const hold = opts.hold === undefined ? name === 'die' : !!opts.hold;
  action.reset();
  action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
  action.clampWhenFinished = hold;
  action.setEffectiveWeight(1);
  action.setEffectiveTimeScale(opts.rate || 1);
  action.fadeIn(fade).play();
  inst._oneShot = { action, name, hold: hold || loop };
  inst._locoTarget = 0;
  applyLocomotion(inst);
  return inst;
}
