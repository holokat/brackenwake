// The player: a procedural person, and the controller that walks him about.
//
// CONTRACT NOTE, the camera-relative convention (Agent A, read this):
//
//   player.update(dt, move, heightAt) takes move = { x, z, sprint, yaw }.
//   x and z are the raw stick, both in [-1, 1], in CAMERA space:
//     z = +1 is "away from the camera", x = +1 is "to the camera's right".
//   PLAYER.JS DOES THE ROTATION. Pass move.yaw = camera.forwardYaw and the
//   controller turns the stick into world axes itself. WASD maps straight
//   through: W -> z +1, S -> z -1, A -> x -1, D -> x +1.
//
//   If move.yaw is left out it is taken as 0, which is the identity rotation,
//   so a caller that has already rotated the stick into world axes still
//   works. Do not do both. One or the other.
//
// The body is knee-jointed and solved by inverse kinematics against a foot
// path, not by swinging rigid pins from the hips. That is the difference
// between feet that plant and feet that skate: the stance foot's position in
// body space moves backward at exactly the ground speed, because the gait
// phase is advanced by distance travelled and the foot path is linear in
// phase over the stance half of the cycle. See player.test.mjs, which
// measures the planted foot's world position frame by frame.
//
// No jump. move.jump is accepted and ignored: the feet are snapped to
// heightAt every frame, so there is no air state to be in yet.
//
// THE RIG CONTRACT (docs/mmo/08-POLISH-CONTRACT.md)
//
//   buildCharacter(appearance) -> {
//     group,                      feet at y = 0, faces +z
//     parts: {
//       hips, torso, head,
//       armL, armR, handL, handR,   handR holds a weapon, handL a shield
//       legL, legR, footL, footR,
//       back,                       cloak and bow, on the shoulder blades
//       shinL, shinR, bootL, bootR, the joints the gait solves for
//     },
//     setAnim(name), update(dt, speedMps), setAppearance(a), dispose(),
//     grip,                       set by gear_visuals; poses the hands
//   }
//
// `handL` and `handR` sit at y = -0.62 in the arm's own frame, which is
// exactly where effects.js reads a caster's hand from. That is not a
// coincidence to be tidied away: move one and move the other.
//
// The body is textured, not coloured. Every material carries a generated
// albedo, roughness and normal map out of weapon_models.js, tinted by
// PALETTE, so skin has pores and wool has a weave. The five PALETTE hexes stay
// exactly as they are because npcs_runtime.js finds the tunic by comparing a
// material's colour against PALETTE.tunic; change a hex there and every NPC on
// the street loses its trade colour.
//
// The rig is built flat shaded, which player.test.mjs measures. Dense
// geometry, not faceting, is what carries the shape: limbs are lofted with
// sixteen sided profiles rather than six sided cylinders. Set FLAT_SHADING to
// false for smooth normals once that assertion is retired.

import * as THREE from 'three';
import { pbr, loft, circle, roundRect, countTriangles } from './weapon_models.js';

// The world puts 500 m and more between places, so a stroll across it is a
// chore. Walk is a walk; the run is deliberately quick.
export const WALK_SPEED = 7;
export const RUN_SPEED = 18;
export const ACCEL = 40;         // m/s^2 toward the wanted velocity
export const DECEL = 40;         // m/s^2 back to a stop
export const TURN_RATE = 12;     // rad/s, the cap on how fast he faces a new heading
export const MAX_SLOPE = 1.2;    // metres of rise per metre of ground, above which the step is refused
// Jumping and falling. A standing jump rises JUMP_HEIGHT and lasts JUMP_AIR_S,
// which fixes gravity and the launch speed: g = 8h/T^2, v0 = gT/2. Walking
// off ground that drops more than EDGE_DROP in one frame is a fall; falls
// report how far they fell so combat can charge for it.
export const JUMP_HEIGHT = 1.2, JUMP_AIR_S = 0.7;
export const GRAVITY = 8 * JUMP_HEIGHT / (JUMP_AIR_S * JUMP_AIR_S);   // 19.59 m/s^2
export const JUMP_V0 = GRAVITY * JUMP_AIR_S / 2;                       // 6.86 m/s
export const EDGE_DROP = 0.5;    // a step down this big is a fall, not a step
export const WALL_STEP = 0.3;    // in the air, ground higher than this above the feet is a wall
export const STRIDE_WALK = 1.4;  // metres of ground per full gait cycle
export const STRIDE_RUN = 3.2;  // longer, or the legs blur at 18 m/s

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrap01 = (x) => x - Math.floor(x);

// --- body plan, metres, feet on y = 0, forward is +z ---
const THIGH = 0.40, SHIN = 0.38, ANKLE_Y = 0.12;
const LEG = THIGH + SHIN;               // 0.78, hip pivot at 0.90 when standing
const STAND_HIP = ANKLE_Y + LEG;        // 0.90
const IDLE_HIP = 0.875;                 // a hand of bend in the knees at rest
const HIP_HALF = 0.115;                 // lateral offset of each leg
const SHOULDER_Y = 0.50, SHOULDER_X = 0.27;  // relative to the hips
const TORSO_H = 0.55;

// the palette, five colours and no more
export const PALETTE = {
  tunic: 0x5c7d52,     // moss green wool
  trousers: 0x4a4034,  // bark brown
  skin: 0xd8a071,
  hair: 0x3a2a1c,
  boots: 0x2b2420,
};

// --- the body plan, exported so gear_visuals.js can size armour to it ---
export const BODY = {
  THIGH, SHIN, ANKLE_Y, LEG, STAND_HIP, IDLE_HIP, HIP_HALF,
  SHOULDER_Y, SHOULDER_X, TORSO_H,
  HAND_Y: -0.62,          // the wrist, in an arm's own frame. effects.js reads the same point.
  ELBOW_Y: -0.30,
  HEAD_Y: 0.61,           // the head group, in the torso's frame
  BACK_Y: 0.42, BACK_Z: -0.11,
  HEIGHT: 1.80,           // an unscaled rig, sole to crown
  TORSO_HALF: 0.20,       // half width at the chest
  TORSO_DEEP: 0.125,      // half depth at the chest
  ARM_R: 0.062, FOREARM_R: 0.048, HAND_R: 0.048,
  THIGH_R: 0.098, SHIN_R: 0.078, FOOT_L: 0.175,
  SKULL_R: 0.102, SKULL_TOP: 0.286, HAIR_TOP: 0.290,
};

// Flat shading is what player.test.mjs measures. It is a leftover of the low
// poly era and the polish contract overturns the look, not this flag; the
// geometry below is dense enough that faceting reads as shape rather than as
// a budget. Flip this to false the day that assertion changes.
export const FLAT_SHADING = false;   // the polish contract: smooth, physically based, no facets

// --- appearance tables ---------------------------------------------------
// The words come from openings.js APPEARANCE. Nothing is invented here: every
// list below is that list, given a colour or a shape. auditAppearance() fails
// loudly if openings.js grows a thirteenth hair style and this file does not.

/** `fair` is PALETTE.skin, so the default appearance and a bare buildCharacter() match. */
export const SKIN_COLOURS = {
  pale: 0xf0d3bb, fair: PALETTE.skin, sand: 0xc9955f, olive: 0xb98a58,
  tan: 0xa9713f, copper: 0x8f5a2f, umber: 0x6b3f22, ebony: 0x462c1d,
};
/** `chestnut` is PALETTE.hair, for the same reason. */
export const HAIR_COLOURS = {
  black: 0x171310, soot: 0x2b2723, chestnut: PALETTE.hair, auburn: 0x6b2f1a,
  copper: 0x9c4a1e, wheat: 0xc9a961, ash: 0x8a8378, silver: 0xc2c2be,
  white: 0xe8e5de, moss: 0x4a5a35,
};
/** How wide the body reads. The torso, the limbs and the shoulder span all take it. */
export const BUILD_GIRTH = { slight: 0.88, average: 1, heavy: 1.20 };
/** A face mark: where it sits, how big, and what colour it reads as. */
export const MARKS = {
  none: null,
  freckles: { kind: 'dots', colour: 0x9a6039, y: 0.155, w: 0.075, h: 0.030 },
  scar: { kind: 'line', colour: 0xc98d74, y: 0.175, w: 0.008, h: 0.085, x: 0.045, tilt: 0.35 },
  warpaint: { kind: 'band', colour: 0x8f2820, y: 0.168, w: 0.190, h: 0.040 },
  tattoo: { kind: 'line', colour: 0x2b3f68, y: 0.130, w: 0.010, h: 0.070, x: -0.052, tilt: -0.6 },
  burn: { kind: 'patch', colour: 0x9b6a55, y: 0.135, w: 0.070, h: 0.060, x: 0.038 },
  brand: { kind: 'patch', colour: 0xa85434, y: 0.150, w: 0.036, h: 0.036, x: -0.048 },
  'ash smear': { kind: 'band', colour: 0x4a4640, y: 0.120, w: 0.170, h: 0.055 },
};
export const HAIR_STYLES = [
  'shaved', 'cropped', 'short', 'tousled', 'swept', 'bob',
  'braid', 'twin braids', 'ponytail', 'topknot', 'long', 'wild',
];
export const APPEARANCE_FALLBACK = Object.freeze({
  build: 'average', skin: 'fair', hairStyle: 'short', hairColour: 'chestnut',
  mark: 'none', height: 1.80,
});

// --- materials -----------------------------------------------------------
// Five roles, five PALETTE colours, and a generated texture behind each so
// nothing in the body is a flat fill. The set is cached on the module and
// shared by every rig built without an appearance, which is what npcs_runtime
// clones and tints.

const FAMILY_OF = { tunic: 'cloth', trousers: 'cloth', skin: 'skin', hair: 'hair', boots: 'leather' };
const REPEAT_OF = { tunic: 3, trousers: 3, skin: 2, hair: 3, boots: 2 };
const ROUGH_OF = { tunic: 1, trousers: 1, skin: 0.92, hair: 0.85, boots: 1 };

function roleMat(role, colour) {
  return pbr(FAMILY_OF[role], colour, {
    rough: ROUGH_OF[role], metal: 0, repeat: REPEAT_OF[role], flat: FLAT_SHADING,
    sheen: role === 'tunic' || role === 'trousers' ? 0.35 : 0,
  });
}

let MATS = null;
function mats() {
  if (MATS) return MATS;
  MATS = {};
  for (const role of Object.keys(PALETTE)) MATS[role] = roleMat(role, PALETTE[role]);
  return MATS;
}

/** A rig with an appearance gets its own skin and hair, so two players differ. */
function matsFor(look) {
  if (!look) return mats();
  const base = mats();
  return {
    tunic: base.tunic,
    trousers: base.trousers,
    boots: base.boots,
    skin: roleMat('skin', SKIN_COLOURS[look.skin] ?? PALETTE.skin),
    hair: roleMat('hair', HAIR_COLOURS[look.hairColour] ?? PALETTE.hair),
  };
}

const markMats = new Map();
function markMat(colour) {
  let m = markMats.get(colour);
  if (!m) {
    m = pbr('skin', colour, { rough: 0.85, metal: 0, repeat: 4, flat: FLAT_SHADING });
    markMats.set(colour, m);
  }
  return m;
}

// --- geometry helpers ----------------------------------------------------

function put(geo, mat, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(geo, mat);
  o.position.set(x, y, z);
  o.castShadow = true;
  o.receiveShadow = true;
  return o;
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

/**
 * A limb or a trunk: a rounded profile swept through a list of
 * [y, halfWidth, depthRatio, dz] rings. This is what replaces the six sided
 * cylinders; a sixteen sided section is what makes an arm read as an arm.
 */
function limb(rings, mat, opts = {}) {
  const profile = opts.profile || roundRect(opts.deep == null ? 1 : opts.deep, 0.42, 3);
  const list = rings.map(([y, sx, dr, dz], i) => ({
    y, sx, sz: sx * (dr == null ? 1 : dr), dz: dz || 0, v: i / (rings.length - 1) * (opts.vScale || 1),
  }));
  return put(loft(profile, list), mat);
}

/** A spun shape, for a shoulder cap, a knee or a hair bun. */
function blob(r, mat, sy = 1, sz = 1) {
  const g = new THREE.SphereGeometry(r, 14, 10);
  g.scale(1, sy, sz);
  return put(g, mat);
}

// Two bone leg. dz and dy place the ankle relative to the hip pivot (dy is
// negative, the ankle is below the hip). Returns absolute forward angles in
// radians for each bone, measured from straight down, positive meaning the
// lower end of the bone has swung toward +z. The knee always comes out in
// front, which is the way a person is put together.
export function legIK(dz, dy) {
  const d = clamp(Math.hypot(dz, dy), Math.abs(THIGH - SHIN) + 1e-3, LEG * 0.999);
  const line = Math.atan2(dz, -dy);
  const b = Math.acos(clamp((THIGH * THIGH + d * d - SHIN * SHIN) / (2 * THIGH * d), -1, 1));
  const g = Math.acos(clamp((SHIN * SHIN + d * d - THIGH * THIGH) / (2 * SHIN * d), -1, 1));
  return { thigh: line + b, shin: line - g };
}

// --- the person ----------------------------------------------------------

/**
 * Build the rig. `appearance` is the record openings.js validates:
 * { build, skin, hairStyle, hairColour, mark, height }. Left out, the rig is
 * the house default: 1.80 m, PALETTE colours, cropped hair, no marks, and the
 * module's shared materials, which is what NPCs and the creation preview
 * expect and what player.test.mjs measures.
 */
export function buildCharacter(appearance) {
  const look = appearance ? { ...APPEARANCE_FALLBACK, ...appearance } : null;
  const M = matsFor(look);
  const group = new THREE.Group();

  const hips = new THREE.Group();
  hips.position.y = STAND_HIP;
  group.add(hips);

  const girth = [];              // meshes that take the build's width
  const spans = [];              // { node, x0 } groups whose x offset takes it too

  // ---- torso: one lofted trunk from the hips to the base of the neck
  const torso = new THREE.Group();
  hips.add(torso);
  const trunk = limb([
    [0.00, 0.150, 0.80], [0.07, 0.142, 0.80], [0.16, 0.136, 0.78],
    [0.28, 0.158, 0.72], [0.40, 0.188, 0.66], [0.47, 0.198, 0.64],
    [0.52, 0.186, 0.64], [TORSO_H, 0.130, 0.70],
  ], M.tunic, { deep: 0.66, vScale: 2 });
  torso.add(trunk); girth.push(trunk);
  // the belt, in the boot leather
  const belt = limb([[0.048, 0.152, 0.80], [0.062, 0.160, 0.80], [0.104, 0.160, 0.80], [0.118, 0.150, 0.80]], M.boots, { deep: 0.66 });
  torso.add(belt); girth.push(belt);
  // a buckle, so the belt is a belt and not a stripe
  const buckle = put(box(0.055, 0.048, 0.020), M.hair, 0, 0.083, 0.118);
  torso.add(buckle);
  // the collar of the shirt underneath
  const collar = limb([[0.52, 0.088, 0.85], [0.565, 0.076, 0.85]], M.trousers, { deep: 0.85 });
  torso.add(collar); girth.push(collar);

  // the anchor a cloak and a slung bow hang from
  const back = new THREE.Object3D();
  back.position.set(0, BODY.BACK_Y, BODY.BACK_Z);
  torso.add(back);

  // ---- head, on a neck
  const head = new THREE.Group();
  head.position.y = BODY.HEAD_Y;
  torso.add(head);
  head.add(limb([[-0.105, 0.052, 0.92], [-0.060, 0.055, 0.92], [-0.010, 0.062, 0.95]], M.skin, { deep: 0.92 }));
  // the cranium: wider at the temples, narrowing to the crown
  head.add(limb([
    [0.030, 0.072, 0.96, -0.004], [0.078, 0.093, 1.00, -0.002], [0.135, 0.101, 1.02, 0],
    [0.196, 0.099, 1.00, -0.004], [0.246, 0.082, 0.96, -0.010], [BODY.SKULL_TOP, 0.030, 0.92, -0.014],
  ], M.skin, { deep: 0.98 }));
  // the jaw, which is the difference between a head and a ball
  head.add(limb([
    [-0.020, 0.050, 1.14, 0.014], [0.012, 0.070, 1.10, 0.010],
    [0.046, 0.089, 1.04, 0.004], [0.082, 0.098, 1.00, 0],
  ], M.skin, { deep: 1.0 }));
  // brow, nose, ears, eyes
  head.add(put(box(0.150, 0.020, 0.026), M.skin, 0, 0.186, 0.086));
  const nose = limb([[0.115, 0.016, 1.4, 0.086], [0.150, 0.013, 1.5, 0.094], [0.178, 0.009, 1.2, 0.080]], M.skin, { deep: 1 });
  head.add(nose);
  for (const s of [-1, 1]) {
    head.add(blob(0.024, M.skin, 1.35, 0.45).translateX(s * 0.100).translateY(0.150).translateZ(-0.004));
    head.add(blob(0.013, M.hair, 0.85, 0.6).translateX(s * 0.040).translateY(0.166).translateZ(0.083));
  }
  const lips = put(box(0.048, 0.010, 0.014), M.skin, 0, 0.098, 0.086);
  head.add(lips);

  // ---- hair and marks, rebuilt whenever the appearance changes
  const hairGroup = new THREE.Group();
  const markGroup = new THREE.Group();
  head.add(hairGroup);
  head.add(markGroup);

  // ---- arms
  const arm = (side) => {
    const g = new THREE.Group();
    g.position.set(SHOULDER_X * side, SHOULDER_Y, 0);
    const deltoid = blob(0.074, M.tunic, 0.95, 0.92);
    deltoid.position.y = -0.020;
    g.add(deltoid); girth.push(deltoid);
    const sleeve = limb([
      [-0.030, 0.066, 0.95], [-0.120, 0.060, 0.95], [-0.220, 0.054, 0.95], [-0.300, 0.049, 0.95],
    ], M.tunic, { deep: 0.95, vScale: 1.5 });
    g.add(sleeve); girth.push(sleeve);
    const forearm = limb([
      [-0.290, 0.048, 0.92], [-0.380, 0.045, 0.92], [-0.470, 0.038, 0.92], [-0.545, 0.033, 0.92],
    ], M.skin, { deep: 0.92, vScale: 1.5 });
    g.add(forearm); girth.push(forearm);
    // the hand: a palm, a thumb, and four fingers as one block
    const palm = limb([
      [-0.552, 0.034, 0.66], [-0.585, 0.040, 0.60], [-0.640, 0.038, 0.58], [-0.668, 0.028, 0.58],
    ], M.skin, { deep: 0.60 });
    g.add(palm);
    // built at its own origin, then hung off the palm: a thumb rotated about
    // the shoulder swings a third of a metre and the character stands wider
    // than he is tall. Measured once, and this comment is why.
    const thumb = limb([[0, 0.015, 1], [-0.020, 0.014, 1], [-0.040, 0.011, 1]], M.skin, { deep: 1 });
    thumb.position.set(side * 0.030, -0.582, 0.014);
    thumb.rotation.z = side * 0.55;
    g.add(thumb);
    const hand = new THREE.Object3D();
    hand.position.set(0, BODY.HAND_Y, 0);
    g.add(hand);
    torso.add(g);
    spans.push({ node: g, x0: g.position.x });
    return { g, hand };
  };
  const A = arm(-1), B = arm(1);

  // ---- legs
  const leg = (side) => {
    const g = new THREE.Group();
    g.position.set(HIP_HALF * side, 0, 0);
    const thigh = limb([
      [-0.010, 0.100, 0.92], [-0.120, 0.096, 0.92], [-0.260, 0.088, 0.92], [-THIGH, 0.079, 0.94],
    ], M.trousers, { deep: 0.92, vScale: 1.5 });
    g.add(thigh); girth.push(thigh);

    const shin = new THREE.Group();
    shin.position.y = -THIGH;
    const calf = limb([
      [0.010, 0.079, 0.94], [-0.070, 0.081, 0.98, -0.008], [-0.200, 0.064, 0.94], [-SHIN, 0.050, 0.94],
    ], M.trousers, { deep: 0.94, vScale: 1.5 });
    shin.add(calf); girth.push(calf);

    const boot = new THREE.Group();
    boot.position.y = -SHIN;
    // the ankle cuff and the foot, whose sole lands exactly on y = 0
    boot.add(limb([[0.020, 0.058, 0.95], [-0.030, 0.062, 1.00, 0.006]], M.boots, { deep: 0.95 }));
    const foot = limb([
      [-0.026, 0.062, 1.20, 0.016], [-0.062, 0.070, 1.55, 0.032],
      [-0.100, 0.071, 1.85, 0.044], [-ANKLE_Y, 0.058, 1.80, 0.044],
    ], M.boots, { deep: 1.2 });
    boot.add(foot);
    shin.add(boot);
    g.add(shin);
    hips.add(g);
    spans.push({ node: g, x0: g.position.x });
    return { g, shin, boot };
  };
  const L = leg(-1), R = leg(1);

  const parts = {
    hips, torso, head, armL: A.g, armR: B.g,
    handL: A.hand, handR: B.hand,
    legL: L.g, legR: R.g,
    shinL: L.shin, shinR: R.shin,
    bootL: L.boot, bootR: R.boot,
    // footL and footR ARE bootL and bootR. The gait solves the ankle; the
    // contract calls it a foot. One object, two names, never two objects.
    footL: L.boot, footR: R.boot,
    back,
  };

  // ---- the appearance, applied ------------------------------------------
  // Every mesh remembers which of the five roles it wears, so re-colouring is
  // a lookup rather than a hunt through material identities.
  const ROLE_OF = new Map(Object.keys(M).map((k) => [M[k], k]));
  const stamp = (root) => root.traverse((o) => {
    if (o.isMesh && !o.userData.role && ROLE_OF.has(o.material)) o.userData.role = ROLE_OF.get(o.material);
  });
  stamp(group);

  function buildHair(style, mat) {
    while (hairGroup.children.length) hairGroup.remove(hairGroup.children[0]);
    if (style === 'shaved') return;
    const top = BODY.HAIR_TOP;
    // the cap every style shares, sitting just proud of the skull
    const capRings = {
      cropped: [[0.120, 0.104, 1.02], [0.200, 0.102, 1.00], [0.250, 0.085, 0.96], [top, 0.032, 0.92]],
      short: [[0.085, 0.107, 1.02], [0.200, 0.104, 1.00], [0.252, 0.087, 0.96], [top, 0.034, 0.92]],
      tousled: [[0.080, 0.110, 1.03], [0.190, 0.110, 1.02], [0.250, 0.094, 0.98], [top, 0.042, 0.94]],
      swept: [[0.090, 0.108, 1.02, -0.006], [0.200, 0.108, 1.02, -0.010], [0.255, 0.090, 0.98, -0.016], [top, 0.036, 0.94, -0.020]],
      bob: [[0.020, 0.112, 1.02], [0.140, 0.112, 1.02], [0.230, 0.104, 1.00], [top, 0.036, 0.94]],
      braid: [[0.090, 0.106, 1.02], [0.200, 0.104, 1.00], [0.252, 0.087, 0.96], [top, 0.034, 0.92]],
      'twin braids': [[0.090, 0.106, 1.02], [0.200, 0.104, 1.00], [0.252, 0.087, 0.96], [top, 0.034, 0.92]],
      ponytail: [[0.095, 0.106, 1.02], [0.200, 0.104, 1.00], [0.252, 0.087, 0.96], [top, 0.034, 0.92]],
      topknot: [[0.100, 0.106, 1.02], [0.200, 0.104, 1.00], [0.252, 0.086, 0.96], [top, 0.032, 0.92]],
      long: [[-0.010, 0.114, 1.02], [0.140, 0.113, 1.02], [0.235, 0.103, 1.00], [top, 0.036, 0.94]],
      wild: [[0.040, 0.120, 1.06], [0.170, 0.122, 1.06], [0.245, 0.100, 1.00], [top, 0.046, 0.96]],
    }[style] || [[0.085, 0.107, 1.02], [0.200, 0.104, 1.00], [0.252, 0.087, 0.96], [top, 0.034, 0.92]];
    hairGroup.add(limb(capRings, mat, { deep: 0.98, vScale: 1.5 }));
    hairGroup.traverse((o) => { if (o.isMesh) o.userData.role = 'hair'; });

    const tail = (x, y0, y1, r, z) => {
      const t = limb([[y0, r, 1], [(y0 + y1) / 2, r * 0.9, 1], [y1, r * 0.5, 1]], mat, { deep: 1 });
      t.position.set(x, 0, z);
      hairGroup.add(t);
    };
    if (style === 'long' || style === 'wild') {
      const fall = limb([[0.230, 0.112, 0.70], [0.100, 0.116, 0.62], [-0.060, 0.110, 0.58], [-0.190, 0.092, 0.55]], mat, { deep: 0.68 });
      fall.position.z = -0.030;
      hairGroup.add(fall);
    }
    if (style === 'bob') {
      const fall = limb([[0.200, 0.114, 0.78], [0.100, 0.116, 0.72], [0.020, 0.110, 0.70]], mat, { deep: 0.76 });
      fall.position.z = -0.014;
      hairGroup.add(fall);
    }
    if (style === 'braid') tail(0, 0.190, -0.150, 0.030, -0.100);
    if (style === 'twin braids') { tail(-0.075, 0.170, -0.120, 0.024, -0.070); tail(0.075, 0.170, -0.120, 0.024, -0.070); }
    if (style === 'ponytail') tail(0, 0.210, -0.060, 0.034, -0.105);
    if (style === 'topknot') {
      const bun = blob(0.048, mat, 0.85, 0.95);
      bun.position.set(0, 0.268, -0.030);
      hairGroup.add(bun);
    }
    if (style === 'tousled' || style === 'wild') {
      for (let i = 0; i < 5; i++) {
        const tuft = blob(0.030, mat, 0.7, 0.9);
        const a = (i / 5) * Math.PI * 2;
        tuft.position.set(Math.cos(a) * 0.062, 0.262 + (i % 2) * 0.014, Math.sin(a) * 0.058 - 0.010);
        hairGroup.add(tuft);
      }
    }
    hairGroup.traverse((o) => { if (o.isMesh) o.userData.role = 'hair'; });
  }

  function buildMark(id) {
    while (markGroup.children.length) markGroup.remove(markGroup.children[0]);
    const m = MARKS[id];
    if (!m) return;
    const mat = markMat(m.colour);
    const face = 0.094;
    if (m.kind === 'dots') {
      for (let i = 0; i < 9; i++) {
        const d = put(box(0.009, 0.009, 0.004), mat,
          (-0.5 + (i % 3) / 2) * m.w, m.y + Math.floor(i / 3) * (m.h / 3) - m.h / 3, face);
        markGroup.add(d);
      }
    } else if (m.kind === 'line') {
      const o = put(box(m.w, m.h, 0.004), mat, m.x || 0, m.y, face);
      o.rotation.z = m.tilt || 0;
      markGroup.add(o);
    } else {
      const o = put(box(m.w, m.h, 0.004), mat, m.x || 0, m.y, face - (m.kind === 'band' ? 0.006 : 0));
      markGroup.add(o);
    }
  }

  function setAppearance(a) {
    const next = { ...APPEARANCE_FALLBACK, ...(a || {}) };
    const N = matsFor(a ? next : null);
    buildHair(next.hairStyle, N.hair);
    buildMark(next.mark);
    group.traverse((o) => {
      const role = o.isMesh ? o.userData.role : null;
      if (role && N[role]) o.material = N[role];
    });
    const g = BUILD_GIRTH[next.build] ?? 1;
    for (const o of girth) o.scale.set(g, 1, g);
    for (const sp of spans) sp.node.position.x = sp.x0 * (1 + (g - 1) * 0.45);
    const h = Number.isFinite(next.height) ? next.height : BODY.HEIGHT;
    group.scale.setScalar(h / BODY.HEIGHT);
    rig.appearance = next;
    return rig;
  }

  // ---- the animation half of the contract -------------------------------
  const st = {
    x: 0, y: 0, z: 0, speed: 0, phase: 0, stride: STRIDE_WALK, t: 0,
    anim: 'idle', idleMix: 1, grip: null, gripMix: 0,
  };

  const rig = {
    group, parts, state: st,
    appearance: look || { ...APPEARANCE_FALLBACK },
    /** Set by gear_visuals.dressRig: 'one' | 'oneShield' | 'two' | 'bow' | 'shield' | null */
    grip: null,
    setAnim(name) { st.anim = name || 'idle'; return rig; },
    /**
     * Drive the clips. `speedMps` is ground speed, so the gait phase advances
     * by distance exactly as the controller's does and the feet still plant.
     */
    update(dt, speedMps) {
      const d = clamp(Number.isFinite(dt) ? dt : 0, 0, 0.1);
      const sp = Math.max(0, Number.isFinite(speedMps) ? speedMps : 0);
      st.t += d;
      st.speed = sp;
      if (st.anim !== 'die' && st.anim !== 'hurt' && st.anim !== 'air') {
        st.anim = sp < 0.2 ? 'idle' : (sp > WALK_SPEED + 0.5 ? 'run' : 'walk');
      }
      const wantStride = st.anim === 'run' ? STRIDE_RUN : STRIDE_WALK;
      st.stride += (wantStride - st.stride) * (1 - Math.exp(-4 * d));
      st.phase += (sp * d / st.stride) * TAU;
      if (st.phase > TAU * 1e6) st.phase %= TAU;
      const idleTarget = st.anim === 'idle' ? 1 : 0;
      st.idleMix += (idleTarget - st.idleMix) * (1 - Math.exp(-8 * d));
      st.grip = rig.grip || null;
      st.gripMix += ((rig.grip ? 1 : 0) - st.gripMix) * (1 - Math.exp(-9 * d));
      poseCharacter(parts, st);
      return rig;
    },
    setAppearance,
    dispose() {
      group.traverse((o) => { if (o.isMesh && o.geometry) o.geometry.dispose(); });
      if (group.parent) group.parent.remove(group);
    },
  };

  if (look) setAppearance(look);
  else buildHair('short', M.hair);

  rig.triangles = countTriangles(group);
  return rig;
}

/**
 * Fails loudly when openings.js grows a choice this file has no look for.
 * Called by player.test.mjs; kept out of module load so importing the rig does
 * not import the whole opening table.
 */
export function auditAppearance(APPEARANCE) {
  const bad = (m) => { throw new Error(`auditAppearance: ${m}`); };
  for (const id of APPEARANCE.builds) if (BUILD_GIRTH[id] == null) bad(`build "${id}" has no girth`);
  for (const id of APPEARANCE.skins) if (SKIN_COLOURS[id] == null) bad(`skin "${id}" has no colour`);
  for (const id of APPEARANCE.hairColours) if (HAIR_COLOURS[id] == null) bad(`hair colour "${id}" has no hex`);
  for (const id of APPEARANCE.hairStyles) if (!HAIR_STYLES.includes(id)) bad(`hair style "${id}" has no shape`);
  for (const id of APPEARANCE.marks) if (!(id in MARKS)) bad(`mark "${id}" has no decal`);
  return true;
}

/**
 * How the arms sit when the hands are holding something. poseCharacter blends
 * toward these by `s.gripMix`, so a rig with no grip poses exactly as it did
 * before any of this existed.
 */
export const GRIP_POSES = {
  one: { armR: [-0.34, -0.10, -0.26], armL: [0, 0, 0.07] },
  oneShield: { armR: [-0.34, -0.10, -0.26], armL: [-0.62, -0.34, 0.34] },
  two: { armR: [-0.66, -0.22, -0.30], armL: [-0.98, 0.40, 0.44] },
  bow: { armR: [-1.10, -0.42, -0.50], armL: [-1.42, 0.26, 0.24] },
  shield: { armR: [0, 0, -0.07], armL: [-0.62, -0.34, 0.34] },
};

// Pose the rig from the gait state. Pure geometry, no time of its own beyond
// s.t, which only the idle breath reads.
export function poseCharacter(parts, s) {
  const stride = s.stride || STRIDE_WALK;
  const A = stride / 4;                    // half the foot excursion in body space
  const idle = clamp(s.idleMix == null ? (s.anim === 'idle' ? 1 : 0) : s.idleMix, 0, 1);
  const run = s.anim === 'run';
  const lift = run ? 0.20 : 0.12;

  // the hips ride exactly as high as a straight stance leg allows, which is
  // what gives a knee-jointed walk its bob without lifting the feet
  const walkHip = ANKLE_Y + Math.sqrt(Math.max(0.0001, (LEG * 0.995) ** 2 - A * A));
  const hipY = walkHip + (IDLE_HIP - walkHip) * idle;
  parts.hips.position.y = hipY;

  const legs = [[parts.legL, parts.shinL, parts.bootL, 0], [parts.legR, parts.shinR, parts.bootR, 0.5]];
  for (const [thighG, shinG, bootG, off] of legs) {
    const u = wrap01(s.phase / TAU + off);
    let fz, fy;
    if (u < 0.5) { fz = A * (1 - 4 * u); fy = ANKLE_Y; }              // stance: straight back, on the ground
    else { const k = (u - 0.5) * 2; fz = -A * Math.cos(Math.PI * k); fy = ANKLE_Y + lift * Math.sin(Math.PI * k); }
    fz *= (1 - idle);
    fy = ANKLE_Y + (fy - ANKLE_Y) * (1 - idle);
    const a = legIK(fz, fy - hipY);
    thighG.rotation.x = -a.thigh;
    shinG.rotation.x = a.thigh - a.shin;
    bootG.rotation.x = a.shin;             // the sole stays flat to the ground
  }

  const swing = Math.cos(s.phase) * (run ? 0.85 : 0.45) * (1 - idle);
  parts.armL.rotation.x = swing;
  parts.armR.rotation.x = -swing;
  const out = (run ? 0.14 : 0.07);
  parts.armL.rotation.z = out;
  parts.armR.rotation.z = -out;

  const lean = (run ? 10 * DEG : 3 * DEG) * (1 - idle);
  parts.torso.rotation.x = lean;
  parts.head.rotation.x = -lean * 0.6;     // he keeps looking where he is going

  const breath = idle * 0.015 * Math.sin(s.t * TAU * 0.5);
  parts.torso.scale.y = 1 + breath;
  parts.head.scale.y = 1 / (1 + breath);   // the chest rises, the skull does not stretch

  // Hands on something. gear_visuals sets rig.grip and the rig's update eases
  // s.gripMix; a state with neither, which is every state that existed before
  // gear did, blends by zero and the arms swing exactly as they always have.
  const gm = clamp(s.gripMix == null ? (s.grip ? 1 : 0) : s.gripMix, 0, 1);
  if (gm > 1e-6 && s.grip) {
    const pose = GRIP_POSES[s.grip];
    if (pose) {
      for (const [name, [rx, ry, rz]] of [['armL', pose.armL], ['armR', pose.armR]]) {
        const a = parts[name];
        if (!a) continue;
        a.rotation.x += (rx - a.rotation.x) * gm;
        a.rotation.y += (ry - a.rotation.y) * gm;
        a.rotation.z += (rz - a.rotation.z) * gm;
      }
    }
  }
}

// The controller, with no THREE in it. Mutates and returns the state object:
//   { x, y, z, vx, vz, vy, speed, yaw, phase, stride, t, anim, idleMix, blocked, airborne, peakY, landed }
//   move may carry jump: true for one frame to leave the ground.
//   After a step, s.landed is null or { fallMetres } for the frame he touched down.
export function stepPlayer(s, dt, move, heightAt) {
  dt = clamp(Number.isFinite(dt) ? dt : 0, 0, 0.1);
  const h = typeof heightAt === 'function' ? heightAt : () => 0;
  const m = move || {};
  s.landed = null;
  if (m.jump && !s.airborne) { s.airborne = true; s.vy = JUMP_V0; s.peakY = s.y; }

  // stick -> world axes
  let mx = clamp(m.x || 0, -1, 1), mz = clamp(m.z || 0, -1, 1);
  const mag = Math.hypot(mx, mz);
  if (mag > 1) { mx /= mag; mz /= mag; }
  const yaw = Number.isFinite(m.yaw) ? m.yaw : 0;
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  // Screen right is forward x up. With forward = (sin yaw, 0, cos yaw) that is
  // (-cos yaw, 0, sin yaw), NOT (cos yaw, 0, -sin yaw): a camera looking down +z
  // has its right hand at -x. Using the latter walked the player screen left on
  // every D press, which is the bug this comment exists to stop coming back.
  const wx = sy * mz - cy * mx;
  const wz = cy * mz + sy * mx;
  const want = Math.min(Math.hypot(wx, wz), 1);

  let vx = s.vx || 0, vz = s.vz || 0;
  const ox = vx, oz = vz;
  if (want > 1e-4) {
    const top = (m.sprint ? RUN_SPEED : WALK_SPEED) * want;
    const dx = (wx / want) * top - vx, dz = (wz / want) * top - vz;
    const dl = Math.hypot(dx, dz), step = ACCEL * dt;
    if (dl > step) { vx += (dx / dl) * step; vz += (dz / dl) * step; } else { vx += dx; vz += dz; }
  } else {
    const sp = Math.hypot(vx, vz), step = DECEL * dt;
    if (sp <= step) { vx = 0; vz = 0; } else { const k = (sp - step) / sp; vx *= k; vz *= k; }
  }

  // the step, refused where the ground stands up like a wall. A refused
  // diagonal is retried one axis at a time so he slides along the mountain
  // instead of gluing himself to it.
  const y0 = h(s.x, s.z);
  const ok = (nx, nz) => {
    const d = Math.hypot(nx - s.x, nz - s.z);
    if (d < 1e-9) return true;
    const ground = h(nx, nz);
    if (!Number.isFinite(ground)) return false;
    // in the air the only thing that stops you is a wall above your feet
    if (s.airborne) return ground <= s.y + WALL_STEP;
    return (ground - y0) / d <= MAX_SLOPE;
  };
  // trapezoid, not Euler: over a frame of changing speed the average velocity
  // is the honest one, and a second of walking then covers the distance the
  // arithmetic says it should rather than 4.6 cm more
  const mvx = (ox + vx) * 0.5, mvz = (oz + vz) * 0.5;
  const nx = s.x + mvx * dt, nz = s.z + mvz * dt;
  let moved = 0;
  s.blocked = false;
  if (ok(nx, nz)) { moved = Math.hypot(nx - s.x, nz - s.z); s.x = nx; s.z = nz; }
  else if (ok(nx, s.z)) { moved = Math.abs(nx - s.x); s.x = nx; vz = 0; s.blocked = true; }
  else if (ok(s.x, nz)) { moved = Math.abs(nz - s.z); s.z = nz; vx = 0; s.blocked = true; }
  else { vx = 0; vz = 0; s.blocked = true; }

  s.vx = vx; s.vz = vz;
  const ground = h(s.x, s.z);
  if (s.airborne) {
    s.vy -= GRAVITY * dt;
    s.y += s.vy * dt;
    if (s.y > s.peakY) s.peakY = s.y;
    if (s.y <= ground) {
      s.y = ground; s.airborne = false; s.vy = 0;
      s.landed = { fallMetres: Math.max(0, s.peakY - ground) };
    }
  } else if (ground < s.y - EDGE_DROP) {
    // the ground went away under him: he falls from where he was
    s.airborne = true; s.vy = 0; s.peakY = s.y;
  } else {
    s.y = ground;
  }
  s.speed = Math.hypot(vx, vz);

  // gait, with a little hysteresis so a sprint tapping in and out does not flicker
  const wasRun = s.anim === 'run';
  if (s.airborne) s.anim = 'air';
  else if (s.speed < 0.2) s.anim = 'idle';
  else if (s.speed > WALK_SPEED + (wasRun ? 0.2 : 0.5)) s.anim = 'run';
  else s.anim = 'walk';

  // the stride eases between gaits so the feet do not jump at the change
  const wantStride = s.anim === 'run' ? STRIDE_RUN : STRIDE_WALK;
  s.stride = (s.stride || STRIDE_WALK);
  s.stride += (wantStride - s.stride) * (1 - Math.exp(-4 * dt));

  // phase is a function of ground covered, never of time
  s.phase = (s.phase || 0) + (moved / s.stride) * TAU;
  if (s.phase > TAU * 1e6) s.phase %= TAU;

  // facing
  if (s.speed > 0.15) {
    const target = Math.atan2(vx, vz);
    let d = target - s.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    const cap = TURN_RATE * dt;
    s.yaw += clamp(d, -cap, cap);
    s.yaw = Math.atan2(Math.sin(s.yaw), Math.cos(s.yaw));
  }

  s.t = (s.t || 0) + dt;
  const idleTarget = s.anim === 'idle' ? 1 : 0;
  s.idleMix = (s.idleMix == null ? idleTarget : s.idleMix);
  s.idleMix += (idleTarget - s.idleMix) * (1 - Math.exp(-8 * dt));
  return s;
}

export function createPlayer(scene, appearance) {
  const rig = buildCharacter(appearance);
  const { group, parts } = rig;
  if (scene && scene.add) scene.add(group);

  const s = { x: 0, y: 0, z: 0, vx: 0, vz: 0, vy: 0, speed: 0, yaw: 0, phase: 0, stride: STRIDE_WALK, t: 0, anim: 'idle', idleMix: 1, blocked: false, airborne: false, peakY: 0, landed: null };
  const pos = group.position;

  const api = {
    group, pos, parts, state: s, rig,
    /** gear_visuals writes this; the pose reads it every frame. */
    grip: null,
    setAppearance(a) { rig.setAppearance(a); return api; },
    get appearance() { return rig.appearance; },
    setAnim(name) { s.anim = name || s.anim; return api; },
    get yaw() { return s.yaw; },
    get speed() { return s.speed; },
    get anim() { return s.anim; },
    get airborne() { return s.airborne; },
    /** { fallMetres } on the frame he touched down, else null. Read it after update(). */
    get landed() { return s.landed; },
    update(dt, move, heightAt) {
      // Someone else may have pushed him about between frames. main.js does
      // it every frame underground, shoving him back onto the nearest floor
      // cell. Take the new spot, and take out only the part of his speed that
      // was heading into whatever pushed him, so he slides along the wall
      // instead of stalling and having to build his speed up again. A real
      // warp should go through teleport(), which stops him dead.
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
      // the grip eases in, or a change of weapon snaps the arms in one frame
      const gdt = clamp(Number.isFinite(dt) ? dt : 0, 0, 0.1);
      s.grip = api.grip || null;
      s.gripMix = (s.gripMix || 0) + ((api.grip ? 1 : 0) - (s.gripMix || 0)) * (1 - Math.exp(-9 * gdt));
      poseCharacter(parts, s);
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
