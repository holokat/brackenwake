// A Blender body behind the rig contract.
//
// `buildGlbRig(id, opts)` hands back exactly what `buildCharacter(appearance)`
// in player.js hands back, and exactly what `buildMonsterModel(id)` hands
// back: a group whose feet are on y = 0 and which faces +z, a `parts` map of
// anchors, `setAnim`, `update(dt, speedMps)`, `setAppearance`, `dispose`. The
// insides are a skinned glb with an AnimationMixer instead of a pile of boxes
// with a poser, and nothing outside this file has to know which it got.
//
// THREE THINGS THIS FILE HAD TO SOLVE
//
// 1. The additive rotation contract.
//
//    effects.js writes `parts.armR.rotation.x += a.armR` every frame, AFTER
//    the gait has run, and relies on the gait having written that channel
//    ABSOLUTELY so the addition cannot accumulate. A mixer writes bones
//    absolutely too, so the naive answer is "make parts.armR the bone". That
//    breaks on one line: `resetOwned` in effects.js sets
//    `parts.hips.rotation.x = 0` and `parts.torso.rotation.y = 0` outright,
//    which on a bone would throw away the mixer's pose for those channels for
//    that frame.
//
//    So `parts.X` is not the bone. It is an ANCHOR: an Object3D parented to
//    the bone whose `position` and `rotation` are a pure additive delta,
//    zeroed at the top of every `update` and read back at render time, when
//    the delta is composed onto the bone:
//
//        bone.quaternion = gait * (B0^-1 * delta * B0)
//        bone.position   = gait + P0^-1 * deltaPos
//
//    B0 is the bone's rest rotation in the character's frame, so a delta
//    written about the anchor's x reads as a forward pitch of the limb no
//    matter which way the bone points. That is the same conjugation
//    tools/blender/rigkit.py `pose()` uses to author the clips, so the runtime
//    layer and the baked clips agree about what "forward" means.
//
//    The anchor's own matrix is NOT its position and rotation: `updateMatrix`
//    is overridden to emit the anchor's REST frame only. Gear parented to the
//    anchor therefore takes the delta once, through the bone, instead of twice.
//    The rest frame is chosen so the anchor is character-aligned (identity
//    rotation relative to the group when nothing is moving), which is the frame
//    gear_visuals.js's HOLD table and every armour piece were built in.
//
// 2. Left and right are mirrored between the two rigs.
//
//    A body facing +z with +y up has its anatomical right at -x. The Blender
//    models are named that way: `upperarm_R` sits at x = -0.27. player.js is
//    not: its `armR` sits at x = +0.27. The contract says handR is where the
//    weapon goes, and buildCharacter is the reference implementation, so this
//    file matches the reference and maps the contract's R to the glb's _L.
//    Measured: contract handR against glb hand_L is 0.060 m apart, against glb
//    hand_R it is 0.542 m apart. See MIRROR below and the test.
//
// 3. The file may not have arrived yet.
//
//    `buildGlbRig` returns synchronously with the procedural body inside it
//    (buildCharacter for a human, the box rig for a monster) and swaps the glb
//    in when the load lands, keeping the SAME `group` object and the SAME
//    `parts` objects. Anchors are reparented rather than rebuilt, so gear that
//    dressRig already hung on a hand stays on that hand across the swap.
//    `preloadRigs(ids)` awaited at boot makes the fallback a thing no player
//    ever sees; models.js builds a cached model synchronously.

import * as THREE from 'three';
import {
  instantiate, isLoaded, loadModel, preloadModels, MODEL_IDS,
  clipAlias, restFrames, clipDuration, modelBounds, modelTriangles,
} from './models.js';
import {
  buildCharacter, BODY, APPEARANCE_FALLBACK, SKIN_COLOURS, HAIR_COLOURS,
  MARKS, HAIR_STYLES, GRIP_POSES, stepPlayer, STRIDE_WALK, WALK_SPEED,
} from './player.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** The contract's anchors, in the order the rig builds them. */
export const PART_KEYS = [
  'hips', 'torso', 'head',
  'armL', 'armR', 'handL', 'handR',
  'legL', 'legR', 'shinL', 'shinR', 'footL', 'footR',
  'back',
];

/** Which human body an appearance's build wears, when there is no studio body. */
export const BUILD_MODEL = { slight: 'human-slim', average: 'human-medium', heavy: 'human-heavy' };

/**
 * Which body a gender wears. These are the studio bodies: one male, one
 * female, both 1.8 m and both on the same 51 joints, and neither of them built
 * to a build. GENDERS in player.js is the list this is keyed by.
 */
export const GENDER_MODEL = { male: 'human-male', female: 'human-female' };

/**
 * The body an appearance wears. The gender wins when its body is in the cache,
 * because it is the choice the creation screen actually shows; the build is
 * the fallback, and is what the three Blender bodies were always chosen by. A
 * player whose studio body has not loaded gets the body he has always had
 * rather than an empty group, and setAppearance moves him onto the studio one
 * the moment it lands.
 */
export function modelForBuild(build, gender) {
  const studio = GENDER_MODEL[gender];
  if (studio && isLoaded(studio)) return studio;
  return BUILD_MODEL[build] || BUILD_MODEL.average;
}

/**
 * The same choice, made from a whole appearance record. A record with no
 * gender in it takes APPEARANCE_FALLBACK's, exactly as every other reader of
 * an appearance in this file does, so a half filled record cannot mean one
 * body here and another one two lines later.
 */
export function modelForAppearance(look) {
  const a = { ...APPEARANCE_FALLBACK, ...(look || {}) };
  return modelForBuild(a.build, a.gender);
}

/**
 * The contract's left is the glb's _R. See the header: the models are named
 * anatomically and player.js is not, and player.js is the reference the gear
 * tables were tuned against.
 */
export const MIRROR = { L: '_R', R: '_L' };

/**
 * Which bone each anchor rides, in preference order. The first name a model
 * actually carries wins; a model that carries none of them puts that anchor on
 * its root bone rather than dropping it, because `dressRig` skips a missing
 * anchor silently and a missing anchor is how a helmet stops existing.
 */
// The studio bodies are named the Mixamo way, and the mirror above is why
// armL asks for RightArm: the contract's left is the body's own right. Both
// naming schemes are in one list per anchor because a model carries one or the
// other and never both, and a single list is one thing to keep in step.
export const BONE_CANDIDATES = {
  hips: ['hips', 'body', 'Hips'],
  torso: ['spine', 'chest', 'abdomen', 'body', 'Spine1', 'Spine', 'Hips'],
  head: ['head', 'body', 'Head', 'Neck'],
  armL: ['upperarm_R', 'wing_R', 'legF_R', 'leg1_R', 'RightArm', 'RightShoulder'],
  armR: ['upperarm_L', 'wing_L', 'legF_L', 'leg1_L', 'LeftArm', 'LeftShoulder'],
  handL: ['hand_R', 'lowerarm_R', 'tip_R', 'legF_R', 'foot1_R', 'RightHand', 'RightForeArm'],
  handR: ['hand_L', 'lowerarm_L', 'tip_L', 'legF_L', 'foot1_L', 'LeftHand', 'LeftForeArm'],
  legL: ['upperleg_R', 'legB_R', 'leg4_R', 'RightUpLeg'],
  legR: ['upperleg_L', 'legB_L', 'leg4_L', 'LeftUpLeg'],
  shinL: ['lowerleg_R', 'legB_R', 'foot4_R', 'RightLeg'],
  shinR: ['lowerleg_L', 'legB_L', 'foot4_L', 'LeftLeg'],
  footL: ['foot_R', 'legB_R', 'foot4_R', 'RightFoot'],
  footR: ['foot_L', 'legB_L', 'foot4_L', 'LeftFoot'],
  back: ['chest', 'spine', 'body', 'Spine2', 'Spine1'],
};

/**
 * The bones that are a wrist, so a hand anchor knows it is on one. Everything
 * else that a hand can land on is an elbow or a paw, and anchorTarget drops
 * the anchor a forearm below it to find the fist. A studio body's LeftHand IS
 * the wrist; without this the sword would hang a forearm below the hand.
 */
export const WRIST_BONES = ['hand_L', 'hand_R', 'LeftHand', 'RightHand'];

/**
 * Resolve every anchor to a bone name from a rest frame map (a Map of bone
 * name to { pos, quat, parent }, which is what models.restFrames hands back).
 * Pure, so a rig that has never been loaded can still be checked.
 */
export function boneMapFrom(rest) {
  const names = [...rest.keys()];
  const root = names.find((n) => !rest.get(n).parent) || names[0];
  const out = {};
  for (const key of PART_KEYS) {
    out[key] = (BONE_CANDIDATES[key] || []).find((n) => rest.has(n)) || root;
  }
  return out;
}

/**
 * Resolve every anchor to a bone name for one loaded model.
 * @returns {object|null} null when the model is not loaded yet.
 */
export function boneMapFor(id) {
  const rest = restFrames(id);
  if (!rest) return null;
  return boneMapFrom(rest);
}

/** An upper arm and an upper leg, under either naming scheme. */
const ARM_BONES = ['upperarm_L', 'upperarm_R', 'LeftArm', 'RightArm'];
const LEG_BONES = ['upperleg_L', 'upperleg_R', 'LeftUpLeg', 'RightUpLeg'];

/** True when a model has the arms and legs a humanoid needs to be dressed. */
export function isHumanoid(id) {
  const rest = restFrames(id);
  if (!rest) return false;
  return ARM_BONES.some((n) => rest.has(n)) && LEG_BONES.some((n) => rest.has(n));
}

/** Load the glb files behind the rigs. Awaited at boot, the fallback never shows. */
export function preloadRigs(ids = MODEL_IDS) {
  return preloadModels(ids);
}

// --- the anchor ------------------------------------------------------------

const ONE = new THREE.Vector3(1, 1, 1);

/**
 * One `parts` entry. `position` and `rotation` are the additive channel that
 * effects.js writes and `update` zeroes; the matrix it contributes to the
 * scene graph is its REST frame and nothing else, so a sword parented to it
 * takes the swing once, through the bone.
 */
function makeAnchor(key) {
  const a = new THREE.Object3D();
  a.name = 'anchor:' + key;
  const rest = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
  a.userData.rigAnchor = key;
  a.userData.rest = rest;
  a.updateMatrix = function updateMatrix() {
    this.matrix.compose(rest.pos, rest.quat, ONE);
    this.matrixWorldNeedsUpdate = true;
  };
  return a;
}

// --- hair and marks --------------------------------------------------------
//
// The three human glbs carry one baked head of hair each, in a `hair` material
// slot. The twelve styles openings.js offers are NOT modelled: what a style
// gets here is a tinted cap over the baked hair plus, where the silhouette
// needs one, a braid, a tail or a bun. `shaved` hides the baked mesh instead.
// A mark is a coloured quad standing a millimetre off the face rather than a
// decal in the skin texture, because these models ship with no textures at all
// and the validator holds them to that. Both are approximations and both are
// listed as such in docs/mmo/wiring/V5.md.

const HAIR_SEGMENTS = 12;

/** The extra silhouette a hair style needs, or null when the cap is enough. */
export function hairCap(style, colourHex, scale = 1) {
  if (style === 'shaved') return null;
  const mat = new THREE.MeshStandardMaterial({ color: colourHex, roughness: 0.85, metalness: 0 });
  const g = new THREE.Group();
  g.name = 'hair:' + style;
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(0.108, HAIR_SEGMENTS, 8, 0, Math.PI * 2, 0, Math.PI * 0.62),
    mat,
  );
  cap.position.y = 0.010;
  cap.scale.set(1, 1.15, 1.02);
  g.add(cap);

  const tail = (x, y, z, len, r, tilt) => {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r, len, 8), mat);
    t.position.set(x, y - len / 2, z);
    t.rotation.x = tilt;
    g.add(t);
  };
  const fall = (depth, drop) => {
    const f = new THREE.Mesh(new THREE.CylinderGeometry(0.112, 0.096, drop, HAIR_SEGMENTS, 1, true), mat);
    f.position.set(0, 0.02 - drop / 2, -depth);
    f.scale.z = 0.62;
    g.add(f);
  };
  if (style === 'bob') fall(0.014, 0.22);
  if (style === 'long' || style === 'wild') fall(0.030, 0.42);
  if (style === 'braid') tail(0, 0.16, -0.100, 0.34, 0.030, 0.22);
  if (style === 'twin braids') { tail(-0.072, 0.15, -0.070, 0.29, 0.024, 0.20); tail(0.072, 0.15, -0.070, 0.29, 0.024, 0.20); }
  if (style === 'ponytail') tail(0, 0.19, -0.105, 0.27, 0.034, 0.30);
  if (style === 'topknot') {
    const bun = new THREE.Mesh(new THREE.SphereGeometry(0.048, 10, 8), mat);
    bun.position.set(0, 0.148, -0.030);
    g.add(bun);
  }
  if (style === 'tousled' || style === 'wild') {
    for (let i = 0; i < 5; i++) {
      const tuft = new THREE.Mesh(new THREE.SphereGeometry(0.030, 8, 6), mat);
      const a = (i / 5) * Math.PI * 2;
      tuft.position.set(Math.cos(a) * 0.062, 0.100 + (i % 2) * 0.014, Math.sin(a) * 0.058 - 0.010);
      g.add(tuft);
    }
  }
  g.scale.setScalar(scale);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.userData.rigHair = true; } });
  return g;
}

/** The face mark, as MARKS in player.js describes it, on a quad off the cheek. */
export function markDecal(markId, scale = 1) {
  const m = MARKS[markId];
  if (!m) return null;
  const mat = new THREE.MeshStandardMaterial({ color: m.colour, roughness: 1, metalness: 0 });
  const g = new THREE.Group();
  g.name = 'mark:' + markId;
  const face = 0.088;
  const quad = (w, h, x, y, tilt) => {
    const o = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    o.position.set(x, y, face);
    o.rotation.z = tilt || 0;
    g.add(o);
  };
  // MARKS is written in the procedural head's frame, whose origin is the neck
  // joint; the glb head bone sits about 0.03 m higher, so the whole set drops
  // by that much and lands on the same face.
  const dy = -0.030;
  if (m.kind === 'dots') {
    for (let i = 0; i < 9; i++) {
      quad(0.009, 0.009, (-0.5 + (i % 3) / 2) * m.w, m.y + dy + Math.floor(i / 3) * (m.h / 3) - m.h / 3, 0);
    }
  } else if (m.kind === 'line') {
    quad(m.w, m.h, m.x || 0, m.y + dy, m.tilt || 0);
  } else {
    quad(m.w, m.h, m.x || 0, m.y + dy, 0);
  }
  g.scale.setScalar(scale);
  g.traverse((o) => { if (o.isMesh) o.userData.rigMark = true; });
  return g;
}

// --- the rig ---------------------------------------------------------------

/**
 * @param {string} modelId one of models.js MODEL_IDS
 * @param {object} opts
 *   appearance  the openings.js record, for a human body
 *   fallback    () => a rig-shaped object to stand in until the file lands.
 *               Left out, a human gets buildCharacter(appearance) and anything
 *               else gets an empty group.
 *   height      metres, sole to crown, to scale the loaded model to. Left out,
 *               a human takes appearance.height and a monster stays native.
 *   tint        one hex washed over every material slot the model has
 *   tintMode    'multiply' (default, the model keeps its own shading under the
 *               wash) or 'replace' (the slot becomes exactly that colour)
 *   tintSlots   { slot: hex } for a named slot, applied after the wash
 *   body        body-plan overrides handed on as rig.body for gear_visuals
 *   dieSeconds  how long `die` should take; the clip is rate-scaled to fit
 */
export function buildGlbRig(modelId, opts = {}) {
  const group = new THREE.Group();
  group.name = 'rig:' + modelId;

  const anchors = {};
  for (const key of PART_KEYS) anchors[key] = makeAnchor(key);

  // Every anchor that shares a bone shares one entry here, so two anchors on
  // one bone add their deltas instead of the second one erasing the first.
  let targets = [];       // { node, restQuat, restQuatInv, parentQuatInv, gaitQ, gaitP, anchors: [] }
  let live = null;        // the glb instance, once it has arrived
  let fallback = null;    // the procedural stand-in, until then
  let currentId = modelId;
  let scaleNode = null;   // what the model hangs from, so group.scale stays free
  let hairNode = null, markNode = null;
  let disposed = false;
  const borrowed = [];    // keys lent to `parts` by the stand-in, taken back on the swap

  const st = {
    anim: 'idle', locomotion: 'idle', oneShot: null, oneShotT: 0, oneShotLimit: 0,
    dieT: 0, speed: 0, t: 0, gripMix: 0,
  };
  const dieSeconds = opts.dieSeconds || 0;

  const rig = {
    group,
    parts: anchors,
    body: opts.body ? { ...BODY, ...opts.body } : null,
    grip: null,
    appearance: opts.appearance ? { ...APPEARANCE_FALLBACK, ...opts.appearance } : null,
    state: st,
    modelId,
    triangles: 0,
    get loaded() { return !!live; },
    get disposed() { return disposed; },
    get anim() { return st.anim; },
    get dieDone() {
      return st.anim === 'die' && st.dieT >= (dieSeconds || clipDuration(currentId, 'die') || 1.2);
    },
    ready: null,
    setAnim, update, setAppearance, dispose,
  };

  // ---- binding the anchors to whatever body is inside the group right now

  const tmpQ = new THREE.Quaternion();
  const tmpQ2 = new THREE.Quaternion();
  const tmpV = new THREE.Vector3();

  function bind(spec) {
    // spec: key -> { node, restQuat, restPos, target, parentQuat } all in the
    // frame the node's own metres are in, which for a glb is the model's own
    // and for the stand-in is the group's.
    const byNode = new Map();
    for (const key of PART_KEYS) {
      const s = spec[key];
      if (!s || !s.node) continue;
      const a = anchors[key];
      const invQ = s.restQuat.clone().invert();
      // the anchor's rest frame: character aligned, at the wanted point
      a.userData.rest.quat.copy(invQ);
      a.userData.rest.pos.copy(s.target).sub(s.restPos).applyQuaternion(invQ);
      a.matrixWorldNeedsUpdate = true;
      s.node.add(a);           // add() detaches from the old parent, gear rides along
      let t = byNode.get(s.node);
      if (!t) {
        t = {
          node: s.node,
          restQuat: s.restQuat.clone(),
          restQuatInv: invQ.clone(),
          parentQuatInv: (s.parentQuat ? s.parentQuat.clone() : new THREE.Quaternion()).invert(),
          gaitQ: s.node.quaternion.clone(),
          gaitP: s.node.position.clone(),
          anchors: [],
        };
        byNode.set(s.node, t);
      }
      t.anchors.push(a);
    }
    targets = [...byNode.values()];
  }

  /**
   * Put every driven node back to the pose the gait last wrote, BEFORE the
   * gait runs again. Without it a channel the gait does not write (the
   * procedural poser sets an arm's x and z but never its y) would keep the
   * composed delta from last frame and add this frame's on top of it, and the
   * arm would wind up like a clock spring. Measured on the stand-in body.
   */
  function restoreGait() {
    for (const t of targets) { t.node.quaternion.copy(t.gaitQ); t.node.position.copy(t.gaitP); }
  }

  /** Remember what the gait or the mixer just wrote, so the delta can ride it. */
  function snapshot() {
    for (const t of targets) { t.gaitQ.copy(t.node.quaternion); t.gaitP.copy(t.node.position); }
  }

  /** Put the additive layer back to nothing. The gait writes absolutely. */
  function zeroDelta() {
    for (const key of PART_KEYS) {
      const a = anchors[key];
      a.position.set(0, 0, 0);
      a.rotation.set(0, 0, 0);
    }
  }

  /** Read the additive layer and lay it over the pose. Runs at render time. */
  function compose() {
    for (const t of targets) {
      tmpQ.copy(t.gaitQ);
      tmpV.set(0, 0, 0);
      for (const a of t.anchors) {
        if (a.quaternion.x || a.quaternion.y || a.quaternion.z || a.quaternion.w !== 1) {
          tmpQ.multiply(tmpQ2.copy(t.restQuatInv).multiply(a.quaternion).multiply(t.restQuat));
        }
        if (a.position.lengthSq()) tmpV.add(a.position);
      }
      t.node.quaternion.copy(tmpQ);
      if (tmpV.lengthSq()) t.node.position.copy(t.gaitP).add(tmpV.applyQuaternion(t.parentQuatInv));
      else t.node.position.copy(t.gaitP);
    }
  }

  // the one hook that guarantees the additive layer lands AFTER effects.js has
  // written it: three walks the scene once per render and this group is on the
  // way down.
  const baseUpdateMatrixWorld = THREE.Object3D.prototype.updateMatrixWorld;
  group.updateMatrixWorld = function (force) {
    compose();
    baseUpdateMatrixWorld.call(this, force);
  };

  // ---- the procedural stand-in

  function mountFallback() {
    const made = opts.fallback ? opts.fallback() : (modelId.startsWith('human-') ? buildCharacter(rig.appearance || undefined) : null);
    if (!made) { bind({}); return; }
    fallback = made;
    group.add(made.group);
    made.group.updateMatrixWorld(true);
    group.updateWorldMatrix(true, false);
    const gInv = new THREE.Quaternion().copy(worldQuat(group)).invert();
    const spec = {};
    const fp = made.parts || {};
    const pick = (...names) => { for (const n of names) if (fp[n]) return fp[n]; return null; };
    const NODE = {
      hips: () => pick('hips', 'root'), torso: () => pick('torso', 'root'), head: () => pick('head', 'torso', 'root'),
      armL: () => pick('armL') || (fp.arms && fp.arms[0]), armR: () => pick('armR') || (fp.arms && fp.arms[fp.arms.length - 1]),
      handL: () => pick('handL', 'armL') || (fp.arms && fp.arms[0]), handR: () => pick('handR', 'armR') || (fp.arms && fp.arms[fp.arms.length - 1]),
      legL: () => pick('legL') || (fp.legs && fp.legs[0]), legR: () => pick('legR') || (fp.legs && fp.legs[1]),
      shinL: () => pick('shinL', 'legL') || (fp.legs && fp.legs[0]), shinR: () => pick('shinR', 'legR') || (fp.legs && fp.legs[1]),
      footL: () => pick('footL', 'shinL', 'legL') || (fp.legs && fp.legs[0]), footR: () => pick('footR', 'shinR', 'legR') || (fp.legs && fp.legs[1]),
      back: () => pick('back', 'torso', 'root'),
    };
    for (const key of PART_KEYS) {
      const node = NODE[key] ? NODE[key]() : null;
      if (!node) continue;
      const q = new THREE.Quaternion().copy(gInv).multiply(worldQuat(node));
      const p = node.getWorldPosition(new THREE.Vector3());
      spec[key] = { node, restQuat: q, restPos: p, target: p.clone(), parentQuat: node.parent ? new THREE.Quaternion().copy(gInv).multiply(worldQuat(node.parent)) : new THREE.Quaternion() };
    }
    bind(spec);
    if (!rig.body && fallback.body) rig.body = { ...BODY, ...fallback.body };
    rig.triangles = fallback.triangles || 0;
    // Everything the stand-in's own parts map carries beyond the contract
    // (`root`, `legs`, `arms`, `quadruped` and the rest of the box rig's
    // introspection) stays reachable while the stand-in is the body, so code
    // and tests that reach for it are not broken by a file arriving. They are
    // taken back off in mountGlb, because a bone rig has no such thing and a
    // stale handle to a disposed box is worse than a missing one.
    borrowed.length = 0;
    for (const [k, v] of Object.entries(fp)) {
      if (PART_KEYS.includes(k) || k === 'hit') continue;
      anchors[k] = v;
      borrowed.push(k);
    }
  }

  function worldQuat(o) {
    const q = new THREE.Quaternion();
    o.getWorldQuaternion(q);
    return q;
  }

  // ---- the glb

  function mountGlb(id) {
    const rest = restFrames(id);
    if (!rest) return false;
    const inst = instantiate(id);
    if (!inst.loaded) { inst.dispose(); return false; }

    const map = boneMapFor(id);
    const hipsName = rest.has('hips') ? 'hips' : (map.hips);
    const hipsRest = rest.get(hipsName);
    const bounds = modelBounds(id);
    const native = bounds ? bounds.max.y - bounds.min.y : BODY.HEIGHT;
    const wantH = Number.isFinite(opts.height) ? opts.height : 0;
    const k = wantH > 0 && native > 0 ? wantH / native : 1;
    rig.nativeHeight = native;
    rig.modelScale = k;

    scaleNode = new THREE.Group();
    scaleNode.name = 'glbScale';
    scaleNode.scale.setScalar(k);
    scaleNode.add(inst.group);
    group.add(scaleNode);

    // The body plan armour is sized against. It is in the MODEL's own metres,
    // not the world's: every anchor lives under scaleNode, so a piece built to
    // this plan is scaled by k on the way to the screen and would be scaled
    // twice if k were folded in here as well.
    const bodyScale = hipsRest && hipsRest.pos.y > 0 ? hipsRest.pos.y / BODY.STAND_HIP : 1;
    rig.body = opts.body ? { ...scaledBody(bodyScale), ...opts.body } : scaledBody(bodyScale);

    const spec = {};
    for (const key of PART_KEYS) {
      const boneName = map[key];
      const bone = inst.bone(boneName);
      const r = rest.get(boneName);
      if (!bone || !r) continue;
      const restPos = r.pos.clone();
      const parentRest = r.parent ? rest.get(r.parent) : null;
      spec[key] = {
        node: bone,
        restQuat: r.quat.clone(),
        restPos,
        target: anchorTarget(key, boneName, rest, map, hipsRest, restPos),
        parentQuat: parentRest ? parentRest.quat.clone() : new THREE.Quaternion(),
      };
    }

    if (fallback) {
      group.remove(fallback.group);
      fallback.dispose();
      fallback = null;
    }
    for (const k of borrowed) delete anchors[k];
    borrowed.length = 0;
    anchors.bones = map;
    bind(spec);
    live = inst;
    currentId = id;
    rig.modelId = id;
    rig.triangles = modelTriangles(id);
    applyTints();
    applyLook();
    // pick the animation state back up where the stand-in left it
    if (st.anim === 'die') playOneShot('die', true);
    else if (st.oneShot) playOneShot(st.oneShot, false);
    else live.play(locomotionClip());
    live.setSpeed(st.speed);
    snapshot();
    return true;
  }

  /** Where an anchor wants to sit, in the model's own metres. */
  function anchorTarget(key, boneName, rest, map, hipsRest, restPos) {
    const hipsW = hipsRest ? hipsRest.pos.clone() : new THREE.Vector3();
    if (key === 'torso') return hipsW;                                  // gear is built in the hip frame
    if (key === 'back') {
      const s = hipsW.y > 0 ? hipsW.y / BODY.STAND_HIP : 1;
      return new THREE.Vector3(hipsW.x, hipsW.y + BODY.BACK_Y * s, hipsW.z + BODY.BACK_Z * s);
    }
    if ((key === 'handL' || key === 'handR') && !WRIST_BONES.includes(boneName)) {
      // no wrist bone: the fist goes one forearm past the elbow
      const armName = map[key === 'handL' ? 'armL' : 'armR'];
      const arm = rest.get(armName);
      const here = rest.get(boneName);
      if (arm && here) {
        const len = arm.pos.distanceTo(here.pos);
        return restPos.clone().setY(restPos.y - len);
      }
    }
    return restPos.clone();
  }

  function scaledBody(s) {
    const out = { ...BODY };
    const LINEAR = ['THIGH', 'SHIN', 'ANKLE_Y', 'LEG', 'STAND_HIP', 'IDLE_HIP', 'HIP_HALF',
      'SHOULDER_Y', 'SHOULDER_X', 'TORSO_H', 'HAND_Y', 'ELBOW_Y', 'HEAD_Y', 'BACK_Y', 'BACK_Z',
      'HEIGHT', 'TORSO_HALF', 'TORSO_DEEP', 'ARM_R', 'FOREARM_R', 'HAND_R', 'THIGH_R', 'SHIN_R',
      'FOOT_L', 'SKULL_R', 'SKULL_TOP', 'HAIR_TOP'];
    for (const key of LINEAR) out[key] = BODY[key] * s;
    return out;
  }

  // ---- appearance

  function applyTints() {
    if (!live) return;
    const mode = opts.tintMode || 'multiply';
    if (Number.isFinite(opts.tint) && live.materials) {
      for (const slot of live.materials.keys()) live.setTint(slot, opts.tint, { mode });
    }
    for (const [slot, hex] of Object.entries(opts.tintSlots || {})) live.setTint(slot, hex, { mode });
    const look = rig.appearance;
    if (!look) return;
    if (live.materials && live.materials.has('skin')) live.setTint('skin', SKIN_COLOURS[look.skin] ?? null);
    if (live.materials && live.materials.has('hair')) live.setTint('hair', HAIR_COLOURS[look.hairColour] ?? null);
  }

  /**
   * True when this body is one the hair cap and the mark decal were built for:
   * the procedural stand-in, or a glb with a 'hair' material slot. False for a
   * studio body, whose hair is painted into its one texture.
   */
  function wearsHairCap() {
    return !live || !!(live.materials && live.materials.has('hair'));
  }

  function applyLook() {
    const look = rig.appearance;
    if (!look) return;
    const head = anchors.head;
    for (const node of [hairNode, markNode]) {
      if (!node) continue;
      node.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
      if (node.parent) node.parent.remove(node);
    }
    hairNode = null; markNode = null;
    const s = rig.body ? rig.body.SKULL_R / BODY.SKULL_R : 1;
    const colour = HAIR_COLOURS[look.hairColour] ?? HAIR_COLOURS.chestnut;
    // The cap and the decal were built for a body with a 'hair' material slot
    // and a box for a head: the cap tints the baked hair and the decal stands a
    // millimetre off a flat face. A studio body has its hair and its face in
    // one texture and no slot to hide, so a cap there would be a second head of
    // hair sitting on top of the first. Both are skipped on such a body rather
    // than laid over it, and H1-STUDIO-BODIES.md says so.
    if (wearsHairCap()) {
      hairNode = hairCap(look.hairStyle, colour, s);
      if (hairNode) head.add(hairNode);
      markNode = markDecal(look.mark, s);
      if (markNode) head.add(markNode);
    }
    // shaved means the baked head of hair goes too
    if (live) {
      live.group.traverse((o) => {
        if (o.isMesh && o.material && o.material.name === 'hair') o.visible = look.hairStyle !== 'shaved';
      });
    }
    group.scale.setScalar((Number.isFinite(look.height) ? look.height : BODY.HEIGHT) / BODY.HEIGHT);
  }

  function setAppearance(a) {
    if (disposed) return rig;
    const next = { ...APPEARANCE_FALLBACK, ...(a || {}) };
    rig.appearance = next;
    const wantId = modelId.startsWith('human-') ? modelForAppearance(next) : currentId;
    if (wantId !== currentId) {
      if (isLoaded(wantId)) {
        // mount the new body BEFORE taking the old one down, so a build that
        // cannot be mounted leaves the player looking at the body he had
        // rather than at an empty group
        const oldLive = live, oldScale = scaleNode;
        if (mountGlb(wantId) && oldLive) { group.remove(oldScale); oldLive.dispose(); }
      } else {
        rig.ready = loadModel(wantId).then(() => {
          if (disposed || currentId === wantId) return rig;
          const oldLive = live, oldScale = scaleNode;
          if (mountGlb(wantId) && oldLive) { group.remove(oldScale); oldLive.dispose(); }
          return rig;
        }).catch(() => rig);
      }
    }
    if (fallback && fallback.setAppearance) fallback.setAppearance(next);
    applyTints();
    applyLook();
    return rig;
  }

  // ---- animation

  function locomotionClip() {
    const want = st.locomotion === 'run' ? 'run' : st.locomotion === 'walk' ? 'walk' : 'idle';
    return clipAlias(currentId, want) || 'idle';
  }

  function playOneShot(name, hold) {
    if (!live) return;
    const clip = clipAlias(currentId, name === 'air' ? 'jump' : name);
    if (!clip) return;
    const dur = clipDuration(currentId, clip) || 0.5;
    const rate = name === 'die' && dieSeconds > 0 ? dur / dieSeconds : 1;
    live.play(clip, { hold: !!hold, rate });
    st.oneShotLimit = rate > 0 ? dur / rate : dur;
  }

  function setAnim(name) {
    const want = name || 'idle';
    if (want === st.anim) return rig;
    if (want === 'die') {
      st.anim = 'die'; st.oneShot = null; st.dieT = 0;
      playOneShot('die', true);
      if (fallback && fallback.setAnim) fallback.setAnim('die');
      return rig;
    }
    if (st.anim === 'die') return rig;                       // dead things do not get up
    if (want === 'swing' || want === 'hurt' || want === 'cast' || want === 'air') {
      st.oneShot = want; st.oneShotT = 0; st.anim = want;
      playOneShot(want, false);
      if (!live) st.oneShotLimit = want === 'hurt' ? 0.3 : want === 'cast' ? 0.8 : 0.5;
      if (fallback && fallback.setAnim) fallback.setAnim(want);
      return rig;
    }
    st.locomotion = want; st.anim = want;
    if (live) live.play(locomotionClip());
    if (fallback && fallback.setAnim) fallback.setAnim(want);
    return rig;
  }

  function update(dt, speedMps) {
    const d = clamp(Number.isFinite(dt) ? dt : 0, 0, 0.1);
    const sp = Math.max(0, Number.isFinite(speedMps) ? speedMps : 0);
    st.t += d;
    st.speed = sp;

    // the additive layer is the gait's to overwrite, exactly as poseCharacter
    // overwrites the procedural rig every frame
    restoreGait();
    zeroDelta();

    if (st.anim === 'die') st.dieT += d;
    else if (st.oneShot) {
      st.oneShotT += d;
      if (st.oneShotT >= (st.oneShotLimit || 0.5)) {
        st.oneShot = null;
        st.anim = st.locomotion;
        if (live) live.play(locomotionClip());
        if (fallback && fallback.setAnim) fallback.setAnim(st.locomotion);
      }
    }

    if (live) { live.setSpeed(sp); live.update(d); }
    else if (fallback && fallback.update) fallback.update(d, sp);

    snapshot();
    applyGrip(d);
    return rig;
  }

  /**
   * The hands close on what they are holding. gear_visuals writes `rig.grip`;
   * this lays GRIP_POSES into the additive layer as part of the gait, before
   * effects.js adds a swing on top of it, which is the same order player.js's
   * poseCharacter uses.
   */
  function applyGrip(d) {
    const pose = GRIP_POSES[rig.grip];
    st.gripMix += ((pose ? 1 : 0) - st.gripMix) * (1 - Math.exp(-9 * d));
    if (!pose || st.gripMix < 0.001) return;
    for (const side of ['armL', 'armR']) {
      const p = pose[side];
      if (!p) continue;
      const a = anchors[side];
      a.rotation.x += p[0] * st.gripMix;
      a.rotation.y += p[1] * st.gripMix;
      a.rotation.z += p[2] * st.gripMix;
    }
  }

  function dispose() {
    disposed = true;
    if (live) live.dispose();
    if (fallback) fallback.dispose();
    for (const node of [hairNode, markNode]) {
      if (node) node.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
    }
    live = null; fallback = null;
    if (group.parent) group.parent.remove(group);
    group.clear();
    return rig;
  }

  // ---- build now, or build a stand-in and swap later

  if (isLoaded(modelId) && mountGlb(modelId)) {
    rig.ready = Promise.resolve(rig);
  } else {
    mountFallback();
    rig.ready = loadModel(modelId).then(() => {
      if (!disposed) mountGlb(modelId);
      return rig;
    }).catch(() => rig);
  }
  if (rig.appearance) applyLook();

  return rig;
}

/**
 * The player, on a Blender body. Same surface as `createPlayer` in player.js,
 * same controller (`stepPlayer`, imported, not copied), same `parts` and
 * `grip`; only the body and the animation are different. main.js swaps one
 * import to move the player onto a glb and swaps it back to move him off.
 *
 * @param scene       anything with .add
 * @param appearance  the openings.js record
 * @param opts        passed on to buildGlbRig
 */
export function createGlbPlayer(scene, appearance, opts = {}) {
  const look = { ...APPEARANCE_FALLBACK, ...(appearance || {}) };
  const rig = buildGlbRig(modelForAppearance(look), { ...opts, appearance: look });
  // The studio body for this gender is chosen only when it is already in the
  // cache, so a player built before preloadRigs finished would otherwise keep
  // the Blender body for the whole session. Ask for the file, and let
  // setAppearance make the same choice again once it is there.
  const wanted = GENDER_MODEL[look.gender];
  if (wanted && rig.modelId !== wanted) {
    loadModel(wanted).then(() => { if (!rig.disposed) rig.setAppearance(rig.appearance || look); }).catch(() => {});
  }
  const { group, parts } = rig;
  if (scene && scene.add) scene.add(group);

  const s = {
    x: 0, y: 0, z: 0, vx: 0, vz: 0, vy: 0, speed: 0, yaw: 0, phase: 0,
    stride: STRIDE_WALK, t: 0, anim: 'idle', idleMix: 1, blocked: false,
    airborne: false, peakY: 0, landed: null,
  };
  const pos = group.position;

  const api = {
    group, pos, parts, state: s, rig,
    /** gear_visuals writes this; the rig reads it every frame. */
    grip: null,
    setAppearance(a) { rig.setAppearance(a); return api; },
    get appearance() { return rig.appearance; },
    setAnim(name) { s.anim = name || s.anim; return api; },
    get yaw() { return s.yaw; },
    get speed() { return s.speed; },
    get anim() { return s.anim; },
    get airborne() { return s.airborne; },
    get landed() { return s.landed; },
    get loaded() { return rig.loaded; },
    ready: rig.ready,
    update(dt, move, heightAt) {
      // someone else may have shoved him between frames; see createPlayer
      if (pos.x !== s.x || pos.z !== s.z) {
        const dx = pos.x - s.x, dz = pos.z - s.z;
        const d = Math.hypot(dx, dz);
        s.x = pos.x; s.z = pos.z;
        if (d > 1e-9) {
          const ux = dx / d, uz = dz / d;
          const into = s.vx * ux + s.vz * uz;
          if (into < 0) { s.vx -= ux * into; s.vz -= uz * into; }
        }
      }
      stepPlayer(s, dt, move, heightAt);
      pos.set(s.x, s.y, s.z);
      group.rotation.y = s.yaw;
      rig.grip = api.grip || null;
      // one shots (a swing, a cast, a death) are set through rig.setAnim by
      // whoever plays them; the ground state is a function of the controller
      if (rig.anim !== 'die' && rig.anim !== 'swing' && rig.anim !== 'cast' && rig.anim !== 'hurt') {
        rig.setAnim(s.airborne ? 'air' : s.speed < 0.2 ? 'idle' : s.speed > WALK_SPEED + 0.5 ? 'run' : 'walk');
      }
      rig.update(dt, s.speed);
    },
    setVisible(v) { group.visible = !!v; },
    teleport(x, z, heightAt) {
      s.x = x; s.z = z; s.vx = 0; s.vz = 0; s.vy = 0; s.speed = 0; s.airborne = false; s.landed = null;
      s.y = typeof heightAt === 'function' ? heightAt(x, z) : 0;
      s.peakY = s.y;
      pos.set(s.x, s.y, s.z);
    },
    dispose() { rig.dispose(); },
  };
  return api;
}

/**
 * Every anchor a glb model resolves, and how far each sits from the same
 * anchor on `buildCharacter()`. Used by the test and by anyone checking a new
 * model before it ships.
 */
export function anchorReport(id) {
  const rig = buildGlbRig(id, {});
  // the BIND pose, deliberately: `update` would run one frame of the idle clip
  // and the comparison would be against a body mid breath rather than against
  // the rest the anchors were placed from.
  rig.group.updateMatrixWorld(true);
  const ref = buildCharacter();
  ref.group.updateMatrixWorld(true);
  const out = {};
  for (const key of PART_KEYS) {
    const a = rig.parts[key].getWorldPosition(new THREE.Vector3());
    const b = ref.parts[key] ? ref.parts[key].getWorldPosition(new THREE.Vector3()) : null;
    out[key] = { at: a, ref: b, d: b ? a.distanceTo(b) : null };
  }
  rig.dispose();
  ref.dispose();
  return out;
}
