import {buildStudioCreature} from './studio/creatures.js';
import {buildStudioCaster} from './studio/hostile-casters.js';
// The bodies of everything that wants to kill you.
//
// Six families now wear a real Blender skeleton out of `rig_glb.js`; the rest
// still wear the box rig below, which is also what every family falls back to
// while its glb is still on the wire. `GLB_FAMILY` and `glbModelFor(id)` are
// the whole policy and `monsterModelPlan()` prints it, so which monster is
// which is a thing you can read rather than a thing you have to guess.
//
// WHICH FAMILIES FALL BACK TO BOXES, AND WHY
//
//   wolf, grub          no Blender model exists for either. Wolves, boars,
//                       bears, dire wolves, manticores and the hydra; grubs
//                       and crabs.
//   biped, tier 5 and 6 `biped` has no model of its own and borrows
//                       human-heavy. A bandit or an orc reads as a big man and
//                       that is fine. A cyclops, a frost giant, an elder
//                       treant or the Warden of the Cut does not: a 4 m human
//                       is a lie about what you are fighting, so above tier 4
//                       a biped keeps the box silhouette until it has a model.
//
// THE BOX RIG
//
// These are boxes. They are not meant to be good, they are meant to be HONEST:
// a thing on the ground at the right height, facing the right way, with legs
// that move at the speed it is actually travelling, an arm that comes round
// when it swings, a flinch when it is hit and a topple when it dies. Everything
// else in the game only ever talks to the contract, so a family moving from
// boxes to a glb changes nothing outside this file and rig_glb.js.
//
//   const model = buildMonsterModel('giantRat');
//   scene.add(model.group);
//   model.setAnim('walk');
//   model.update(dt, speed);        // speed in m/s, which is what drives the gait
//
// The contract is the player rig's, from `player.js`: a `group` to put in the
// scene, a `parts` map of the named pieces, and a poser. The player's poser is
// a free function over a gait state; a monster's is closed over its own clock,
// because a monster has no controller writing that state for it. As in
// `poseCharacter`, the gait phase is advanced by DISTANCE TRAVELLED and not by
// time, so a wolf at 8.5 m/s takes long fast strides and a zombie at 3 m/s
// shuffles, without either being given a number of its own.
//
// Colour is the tier, and only the tier: grey 1, green 2, yellow 3, orange 4,
// red 5, and a boss is red gone almost black. A player who has learned five
// colours can read the danger of a silhouette at fifty metres, which is the
// whole reason the tier is in the paint and not in a name plate.
//
// Six kinds have a silhouette written by hand, because they are the six a new
// character actually meets: the giant rat (low and long), the skeleton (thin),
// the wolf (four legs), the goblin (short), the zombie (slumped) and the giant
// spider (eight legs). Everything else falls back to the shape its family
// suggests, and `auditMonsterShapes()` throws at load if any monster id has no
// shape at all, so a forty-ninth monster cannot ship invisible.

import * as THREE from 'three';
import { MONSTERS, MONSTER_LIST } from '../mmo/monsters.js';
import { buildGlbRig } from './rig_glb.js';
import { isLoaded, MODEL_IDS } from './models.js';
import { countTriangles as countTris, disposeModel as freeModel } from './weapon_models.js';

// ---------------------------------------------------------------- the paint

/** Tier to colour. The five bands of 05-WORLD-CONTENT, plus bosses. */
export const TIER_COLOUR = {
  0: 0x9a8f7a,   // critters, and only the fallback: see CRITTER_BODY, which paints an animal like the animal it is.
  1: 0x8d9099,   // grey
  2: 0x5f9e58,   // green
  3: 0xc9b04a,   // yellow
  4: 0xcc7a33,   // orange
  5: 0xb03a34,   // red
  6: 0x5e1b18,   // a boss: the red gone almost black
};

/**
 * A VARIANT'S own paint, where the tier's colour would make it a twin.
 *
 * The tier colour is the danger read and it stays the default for every row.
 * These are the rows that share a silhouette with something else in the same
 * band and would otherwise be told apart by nothing at all: a wild dog beside a
 * wolf, a highwayman beside a bandit. Nothing here changes what a row IS, and
 * the name plate's con colour, which is the thing a player actually reads
 * danger off, is untouched. See docs/mmo/wiring/M5-MORE-MONSTERS.md.
 */
export const MONSTER_TINT = {
  wildDog: 0x8b6a45,        // farm dog: sand and liver, not wolf grey
  badger: 0x3f4044,         // near black, and the head stripe is the shape's job
  banditArcher: 0x55603c,   // hedgerow green over brown
  highwayman: 0x2f3a4a,     // a good dark coat off a merchant
  scarecrow: 0xa98a4a,      // straw and sacking
};

/**
 * A VARIANT'S own size, as a multiple of what its tier and health work out to.
 *
 * 1 for everything not named, so the sizing rule below is unchanged for every
 * row that had one before. A badger is not a small wolf and a wild dog is not a
 * young one; the size is most of what tells them apart at forty metres.
 */
export const MONSTER_SCALE = {
  wildDog: 0.78,
  badger: 0.50,
  banditArcher: 0.97,
  scarecrow: 1.06,
};

/** The colour a body is painted: the row's own where it names one, else its tier's. */
export function bodyColourFor(id) {
  const m = MONSTERS[id];
  if (!m) return TIER_COLOUR[1];
  return MONSTER_TINT[id] ?? TIER_COLOUR[m.tier] ?? TIER_COLOUR[1];
}

/** The multiplier on a body's worked out size. 1 unless the row is a variant. */
export const bodyScaleFor = (id) => MONSTER_SCALE[id] ?? 1;

/** Shoulder height in metres by tier, before a shape stretches or squashes it. */
export const TIER_HEIGHT = { 0: 0.5, 1: 1.1, 2: 1.5, 3: 1.9, 4: 2.4, 5: 3.2, 6: 4.0 };
/** Body types with a real height in metres, tier or no tier. */
export const FAMILY_HEIGHT = { skeleton: 1.8, zombie: 1.8, goblin: 1.35, biped: 1.85, rat: 0.5, spider: 0.8 };

/** Seconds each one-shot animation runs for. `die` is what monsters.js waits on. */
export const SWING_SECONDS = 0.45;
export const HURT_SECONDS = 0.25;
export const DIE_SECONDS = 1.1;

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const shade = (hex, k) => {
  const r = Math.round(((hex >> 16) & 255) * k), g = Math.round(((hex >> 8) & 255) * k), b = Math.round((hex & 255) * k);
  return (r << 16) | (g << 8) | b;
};

// One material per colour, shared by every body wearing it. Forty monsters on
// screen is forty draw calls' worth of geometry and one material each way.
const MATS = new Map();
function mat(hex) {
  if (!MATS.has(hex)) MATS.set(hex, new THREE.MeshStandardMaterial({ color: hex, roughness: 0.95, metalness: 0, flatShading: true }));
  return MATS.get(hex);
}

function put(w, h, d, m, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  o.position.set(x, y, z);
  o.castShadow = true;
  o.receiveShadow = true;
  return o;
}

// ---------------------------------------------------------------- the shapes

/**
 * Which silhouette each monster wears. Every id in `MONSTERS` above tier 0 has
 * a row here or names a buildable `family` on its own row; the audit below
 * proves it. Tier 0 is deliberately absent: the animals of the world go down
 * the `CRITTER_SHAPE` path further down this file and wear a body of their own.
 */
export const SHAPE_FOR = {
  // tier 1
  giantRat: 'rat', caveBat: 'flyer', skeleton: 'skeleton', zombie: 'zombie',
  goblinScout: 'goblin', thornGrub: 'grub', crab: 'grub',
  // tier 2
  wolf: 'wolf', boar: 'wolf', skeletonWarrior: 'skeleton', goblinWarrior: 'goblin',
  bandit: 'biped', giantSpider: 'spider', bogCrawler: 'grub', drowned: 'zombie',
  // tier 3
  direWolf: 'wolf', orc: 'biped', ghoul: 'zombie', hobgoblin: 'biped',
  harpy: 'flyer', stonebackBear: 'wolf', cultist: 'biped', mireTroll: 'biped',
  // tier 4
  ogre: 'biped', wraith: 'skeleton', ironGolem: 'biped', wyvern: 'flyer',
  werewolf: 'biped', boneKnight: 'skeleton', manticore: 'wolf', vampireKnight: 'biped',
  // tier 5
  cyclops: 'biped', elderTreant: 'biped', lich: 'skeleton', frostGiant: 'biped',
  hydra: 'wolf', boneDragon: 'flyer',
  // bosses
  ashenKing: 'skeleton', motherOfSpiders: 'spider', wardenOfTheCut: 'biped', drownedKnight: 'zombie',
};

/**
 * The shape a monster id wears, or null when nothing builds it (tier 0, which
 * goes down the critter path below instead).
 *
 * `SHAPE_FOR` wins where it has a row, so nothing that already had a body has
 * moved. Where it does not, the MONSTER ROW'S OWN `family` field is read: the
 * programme's line for the roster was "each row names the family it borrows a
 * body from until then", and forty eight new monsters arrived naming one of the
 * nine families this file builds. Reading it here rather than copying forty
 * eight names into the table above means a forty ninth cannot ship shapeless.
 * A `family` naming something nothing builds is still null, and the audit still
 * throws on it.
 */
export function shapeFor(id) {
  const m = MONSTERS[id];
  if (!m) return null;
  if (m.tier === 0) return null;
  if (SHAPE_FOR[id]) return SHAPE_FOR[id];
  return m.family && BUILDERS[m.family] ? m.family : null;
}

/**
 * Every monster above tier 0 has a silhouette, and every silhouette named is
 * one this file can actually build. Runs at load, like `auditSpawnTable` in
 * `fauna.js`: a monster with no shape would otherwise spawn, walk, hit you and
 * be invisible. `auditCritterModels` below does the same for tier 0.
 */
export function auditMonsterShapes() {
  const bad = [];
  for (const m of MONSTER_LIST) {
    if (m.tier === 0) { if (SHAPE_FOR[m.id]) bad.push(`${m.id} is a critter and belongs in CRITTER_SHAPE, not here`); continue; }
    // shapeFor, not SHAPE_FOR: a row may name its own family instead of having
    // a line in the table, and a row that names nothing buildable still fails.
    const s = shapeFor(m.id);
    if (!s) bad.push(`${m.id} has no silhouette and its row names no family this file builds`);
    else if (!BUILDERS[s]) bad.push(`${m.id} wears "${s}", which nothing builds`);
  }
  for (const id of Object.keys(SHAPE_FOR)) if (!MONSTERS[id]) bad.push(`a silhouette for "${id}", which is not a monster`);
  // A variant's paint and size are read by id, so a typo in either is a body
  // that never gets the thing that tells it from its family. Both tables are
  // checked against the roster, and the size is checked for being a size.
  for (const id of Object.keys(MONSTER_TINT)) if (!MONSTERS[id]) bad.push(`a tint for "${id}", which is not a monster`);
  for (const [id, k] of Object.entries(MONSTER_SCALE)) {
    if (!MONSTERS[id]) bad.push(`a scale for "${id}", which is not a monster`);
    if (!(k > 0.2 && k <= 3)) bad.push(`${id} is scaled by ${k}, which is not a size`);
  }
  for (const t of [1, 2, 3, 4, 5, 6]) if (TIER_COLOUR[t] == null) bad.push(`tier ${t} has no colour`);
  if (bad.length) throw new Error(`monster_models: ${bad.join('; ')}`);
  return true;
}

// ------------------------------------------------------------- the builders
//
// Each builder is handed the body colour and a scale in metres and returns
// { group, parts, radius, height }. `parts.root` is the one thing the poser
// leans, dips and topples, so `group.rotation.y` stays free for facing.
//
// Legs are groups pivoting at the hip with the meat hanging below, so a
// rotation.x is a stride. Arms are the same the other way up.

function rig(colour) {
  const group = new THREE.Group();
  const root = new THREE.Group();
  group.add(root);
  return { group, root, body: mat(colour), trim: mat(shade(colour, 0.72)), dark: mat(shade(colour, 0.5)) };
}

function limb(parent, w, h, d, x, y, z, m) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.add(put(w, h, d, m, 0, -h / 2, 0));
  parent.add(g);
  return g;
}

/** A person shape: two legs, two arms, a head. The fallback for anything upright. */
function buildBiped(colour, s) {
  const { group, root, body, trim, dark } = rig(colour);
  const hipY = s * 0.52, torsoH = s * 0.34, headR = s * 0.16;
  const torso = new THREE.Group();
  torso.position.y = hipY;
  root.add(torso);
  torso.add(put(s * 0.36, torsoH, s * 0.22, body, 0, torsoH / 2, 0));
  const head = new THREE.Group();
  head.position.y = torsoH + headR * 0.55;
  torso.add(head);
  head.add(put(headR * 1.3, headR * 1.3, headR * 1.2, trim, 0, 0, 0));
  const arms = [
    limb(torso, s * 0.1, s * 0.36, s * 0.1, -s * 0.24, torsoH * 0.92, 0, trim),
    limb(torso, s * 0.1, s * 0.36, s * 0.1, s * 0.24, torsoH * 0.92, 0, trim),
  ];
  const legs = [
    limb(root, s * 0.12, hipY, s * 0.13, -s * 0.1, hipY, 0, dark),
    limb(root, s * 0.12, hipY, s * 0.13, s * 0.1, hipY, 0, dark),
  ];
  return { group, parts: { root, torso, head, arms, legs }, radius: s * 0.28, height: s * 0.9 };
}

/** Thin, and it rattles. Skeletons, wraiths, liches, bone knights. */
function buildSkeleton(colour, s) {
  const r = buildBiped(colour, s);
  const { root, torso, head, arms, legs } = r.parts;
  torso.children[0].scale.set(0.6, 1, 0.55);
  head.children[0].scale.set(0.85, 0.95, 0.85);
  for (const a of arms) a.children[0].scale.set(0.55, 1.05, 0.55);
  for (const l of legs) l.children[0].scale.set(0.6, 1, 0.6);
  // ribs, so a skeleton is not a thin person at a distance
  const ribs = new THREE.Group();
  ribs.position.y = s * 0.2;
  torso.add(ribs);
  for (let i = 0; i < 3; i++) ribs.add(put(s * 0.26, s * 0.02, s * 0.16, r.parts.head.children[0].material, 0, i * s * 0.07, 0));
  root.userData.gaunt = true;
  return { ...r, radius: s * 0.2 };
}

/** Short, wide, and it leans in. Goblins. */
function buildGoblin(colour, s) {
  const r = buildBiped(colour, s * 0.78);
  r.parts.torso.children[0].scale.set(1.15, 0.9, 1.15);
  r.parts.head.children[0].scale.set(1.25, 1.1, 1.15);
  r.parts.head.position.y *= 0.94;
  for (const l of r.parts.legs) l.children[0].scale.set(1.1, 0.85, 1.1);
  r.parts.root.rotation.x = 0.12;      // it walks bent forward
  return { ...r, radius: s * 0.24, height: s * 0.72 };
}

/** Upright and wrong: one shoulder low, arms hanging, feet dragging. */
function buildZombie(colour, s) {
  const r = buildBiped(colour, s);
  r.parts.root.rotation.x = 0.16;
  r.parts.arms[0].rotation.x = -0.5;
  r.parts.arms[1].rotation.x = -0.62;
  r.parts.torso.rotation.z = 0.1;
  r.parts.head.rotation.z = -0.18;
  r.parts.slump = true;
  return r;
}

/** Low and long, on four short legs, with a tail. Rats. */
function buildRat(colour, s) {
  const { group, root, body, trim, dark } = rig(colour);
  const bodyY = s * 0.34, len = s * 0.95;
  const torso = new THREE.Group();
  torso.position.y = bodyY;
  root.add(torso);
  torso.add(put(s * 0.34, s * 0.3, len, body, 0, 0, 0));
  const head = new THREE.Group();
  head.position.set(0, s * 0.02, len * 0.55);
  torso.add(head);
  head.add(put(s * 0.24, s * 0.22, s * 0.3, trim, 0, 0, 0));
  head.add(put(s * 0.1, s * 0.12, s * 0.02, dark, -s * 0.09, s * 0.14, 0));
  head.add(put(s * 0.1, s * 0.12, s * 0.02, dark, s * 0.09, s * 0.14, 0));
  const tail = limb(torso, s * 0.06, len * 0.8, s * 0.06, 0, 0, -len * 0.5, dark);
  tail.rotation.x = -Math.PI / 2.3;
  const lz = len * 0.3, lx = s * 0.16;
  const legs = [
    limb(root, s * 0.09, bodyY, s * 0.09, -lx, bodyY, lz, dark),
    limb(root, s * 0.09, bodyY, s * 0.09, lx, bodyY, lz, dark),
    limb(root, s * 0.09, bodyY, s * 0.09, -lx, bodyY, -lz, dark),
    limb(root, s * 0.09, bodyY, s * 0.09, lx, bodyY, -lz, dark),
  ];
  return { group, parts: { root, torso, head, arms: [head], legs, tail, quadruped: true }, radius: s * 0.32, height: s * 0.55 };
}

/** Four legs, a deep chest, a head carried forward. Wolves, boars, bears. */
function buildWolf(colour, s) {
  const { group, root, body, trim, dark } = rig(colour);
  const backY = s * 0.62, len = s * 0.9;
  const torso = new THREE.Group();
  torso.position.y = backY;
  root.add(torso);
  torso.add(put(s * 0.34, s * 0.36, len, body, 0, 0, 0));
  const neck = new THREE.Group();
  neck.position.set(0, s * 0.08, len * 0.48);
  torso.add(neck);
  const head = new THREE.Group();
  head.position.set(0, 0, s * 0.18);
  neck.add(head);
  head.add(put(s * 0.22, s * 0.22, s * 0.34, trim, 0, 0, 0));
  head.add(put(s * 0.07, s * 0.11, s * 0.03, dark, -s * 0.07, s * 0.15, -s * 0.04));
  head.add(put(s * 0.07, s * 0.11, s * 0.03, dark, s * 0.07, s * 0.15, -s * 0.04));
  const tail = limb(torso, s * 0.07, s * 0.4, s * 0.07, 0, s * 0.06, -len * 0.5, trim);
  tail.rotation.x = -2.4;
  const lz = len * 0.33, lx = s * 0.17;
  const legs = [
    limb(root, s * 0.1, backY, s * 0.11, -lx, backY, lz, dark),
    limb(root, s * 0.1, backY, s * 0.11, lx, backY, lz, dark),
    limb(root, s * 0.1, backY, s * 0.11, -lx, backY, -lz, dark),
    limb(root, s * 0.1, backY, s * 0.11, lx, backY, -lz, dark),
  ];
  return { group, parts: { root, torso, head, neck, arms: [neck], legs, tail, quadruped: true }, radius: s * 0.34, height: s * 0.85 };
}

/** Eight legs around a low body, and they move in two fours. */
function buildSpider(colour, s) {
  const { group, root, body, trim, dark } = rig(colour);
  const bodyY = s * 0.42;
  const torso = new THREE.Group();
  torso.position.y = bodyY;
  root.add(torso);
  torso.add(put(s * 0.44, s * 0.3, s * 0.5, body, 0, 0, -s * 0.12));    // abdomen
  const head = new THREE.Group();
  head.position.set(0, 0, s * 0.26);
  torso.add(head);
  head.add(put(s * 0.3, s * 0.24, s * 0.28, trim, 0, 0, 0));
  const legs = [];
  for (let i = 0; i < 8; i++) {
    const side = i < 4 ? -1 : 1;
    const k = i % 4;
    const g = limb(root, s * 0.055, bodyY * 1.15, s * 0.055, side * s * 0.2, bodyY, (1.5 - k) * s * 0.16, dark);
    g.rotation.z = side * 0.75;         // knees out, the way a spider stands
    g.userData.rest = g.rotation.z;
    legs.push(g);
  }
  return { group, parts: { root, torso, head, arms: [head], legs, spider: true }, radius: s * 0.4, height: s * 0.5 };
}

/** A fat grub or a crab: no legs worth animating, so the body itself humps along. */
function buildGrub(colour, s) {
  const { group, root, body, trim, dark } = rig(colour);
  const torso = new THREE.Group();
  torso.position.y = s * 0.26;
  root.add(torso);
  for (let i = 0; i < 3; i++) {
    torso.add(put(s * (0.4 - i * 0.05), s * (0.32 - i * 0.04), s * 0.24, i === 0 ? trim : body, 0, 0, (1 - i) * s * 0.22));
  }
  const head = new THREE.Group();
  head.position.set(0, 0, s * 0.34);
  torso.add(head);
  head.add(put(s * 0.24, s * 0.2, s * 0.16, dark, 0, 0, 0));
  const legs = [
    limb(root, s * 0.07, s * 0.2, s * 0.07, -s * 0.2, s * 0.2, s * 0.1, dark),
    limb(root, s * 0.07, s * 0.2, s * 0.07, s * 0.2, s * 0.2, s * 0.1, dark),
    limb(root, s * 0.07, s * 0.2, s * 0.07, -s * 0.2, s * 0.2, -s * 0.12, dark),
    limb(root, s * 0.07, s * 0.2, s * 0.07, s * 0.2, s * 0.2, -s * 0.12, dark),
  ];
  return { group, parts: { root, torso, head, arms: [head], legs, quadruped: true, humps: true }, radius: s * 0.3, height: s * 0.4 };
}

/** Wings, and it hangs a body between them. Bats, harpies, wyverns, the dragon. */
function buildFlyer(colour, s) {
  const { group, root, body, trim, dark } = rig(colour);
  const bodyY = s * 0.7;
  const torso = new THREE.Group();
  torso.position.y = bodyY;
  root.add(torso);
  torso.add(put(s * 0.24, s * 0.34, s * 0.44, body, 0, 0, 0));
  const head = new THREE.Group();
  head.position.set(0, s * 0.16, s * 0.2);
  torso.add(head);
  head.add(put(s * 0.2, s * 0.18, s * 0.24, trim, 0, 0, 0));
  const wings = [
    limb(torso, s * 0.7, s * 0.06, s * 0.34, -s * 0.12, s * 0.1, 0, trim),
    limb(torso, s * 0.7, s * 0.06, s * 0.34, s * 0.12, s * 0.1, 0, trim),
  ];
  wings[0].children[0].position.set(-s * 0.35, 0, 0);
  wings[1].children[0].position.set(s * 0.35, 0, 0);
  const legs = [
    limb(root, s * 0.07, bodyY * 0.5, s * 0.07, -s * 0.09, bodyY * 0.55, 0, dark),
    limb(root, s * 0.07, bodyY * 0.5, s * 0.07, s * 0.09, bodyY * 0.55, 0, dark),
  ];
  return { group, parts: { root, torso, head, arms: wings, wings, legs, flying: true }, radius: s * 0.3, height: s * 0.95 };
}

const BUILDERS = {
  biped: buildBiped, skeleton: buildSkeleton, goblin: buildGoblin, zombie: buildZombie,
  rat: buildRat, wolf: buildWolf, spider: buildSpider, grub: buildGrub, flyer: buildFlyer,
};

// --------------------------------------------------------------- the poser

/** Metres of ground per full gait cycle, per shape. Short legs, short stride. */
const STRIDE = { rat: 0.9, grub: 0.8, spider: 1.1, wolf: 2.0, goblin: 1.0, zombie: 1.1, skeleton: 1.4, biped: 1.6, flyer: 2.0 };

/**
 * One monster's body, and everything that moves it.
 *
 * @param id a key of `MONSTERS`. An unknown id, or a tier 0 critter, returns
 *   null rather than a default box: an animal with no monster behind it is a
 *   bug in the caller, and a silent grey cube would hide it.
 */
export function buildBoxMonster(id) {
  const m = MONSTERS[id];
  const shape = shapeFor(id);
  if (!m || !shape) return null;
  const colour = bodyColourFor(id);
  // size rides the tier, nudged by how much health the thing has inside its own
  // tier, so an ogre of 320 is visibly bigger than a wraith of 180
  // A humanoid is human sized whatever its tier: a tier 1 skeleton at 1.0 m
  // read as a toy in the browser. FAMILY_HEIGHT pins the body types that have a
  // real size; everything else rides the tier as before.
  const pinned = FAMILY_HEIGHT[shape] ?? FAMILY_HEIGHT[m.kind];
  const base = pinned ?? TIER_HEIGHT[m.tier] ?? 1.5;
  const peers = MONSTER_LIST.filter((x) => x.tier === m.tier);
  const hi = Math.max(...peers.map((x) => x.hp)), lo = Math.min(...peers.map((x) => x.hp));
  const k = hi > lo ? (m.hp - lo) / (hi - lo) : 0.5;
  const s = (pinned ? base * (0.95 + 0.1 * k) : base * (0.85 + 0.3 * k)) * bodyScaleFor(id);

  const built = BUILDERS[shape](colour, s);
  const { group, parts } = built;
  group.name = `monster:${id}`;

  const stride = STRIDE[shape] || 1.4;
  const state = { t: 0, phase: 0, anim: 'idle', locomotion: 'idle', oneShot: null, oneShotT: 0, dieT: 0, speed: 0 };

  const legAmp = shape === 'spider' ? 0.35 : shape === 'zombie' ? 0.35 : 0.55;

  function setAnim(name) {
    if (name === state.anim) return;
    if (name === 'die') { state.anim = 'die'; state.oneShot = null; state.dieT = 0; return; }
    if (state.anim === 'die') return;                       // dead things do not get up
    if (name === 'swing' || name === 'hurt' || name === 'cast') {
      state.oneShot = name === 'cast' ? 'swing' : name;
      state.oneShotT = 0;
      state.anim = name;
      return;
    }
    state.locomotion = name;
    state.anim = name;
  }

  function pose() {
    const { root, legs, arms, torso, head } = parts;
    const dead = state.anim === 'die';
    if (dead) {
      const p = clamp(state.dieT / DIE_SECONDS, 0, 1);
      const e = 1 - Math.pow(1 - p, 3);
      root.rotation.z = e * Math.PI / 2;
      root.rotation.x = 0;
      root.position.y = -e * built.height * 0.12;
      for (const l of legs) l.rotation.x = 0;
      return;
    }

    const moving = state.speed > 0.15;
    const swing = Math.sin(state.phase);
    const amp = moving ? legAmp : 0;
    if (parts.spider) {
      // eight legs in two fours, the way a spider actually walks
      for (let i = 0; i < legs.length; i++) {
        const alt = (i % 2 === 0) !== (i < 4);
        legs[i].rotation.x = Math.sin(state.phase + (alt ? 0 : Math.PI)) * amp * 0.5;
        legs[i].rotation.z = legs[i].userData.rest + Math.cos(state.phase + (alt ? 0 : Math.PI)) * amp * 0.25;
      }
    } else if (parts.quadruped) {
      // diagonal pairs: front left with back right
      const off = [0, Math.PI, Math.PI, 0];
      for (let i = 0; i < legs.length; i++) legs[i].rotation.x = Math.sin(state.phase + off[i]) * amp;
    } else {
      for (let i = 0; i < legs.length; i++) legs[i].rotation.x = Math.sin(state.phase + (i ? Math.PI : 0)) * amp;
      for (let i = 0; i < arms.length; i++) {
        if (parts.slump || parts.flying) continue;
        arms[i].rotation.x = -Math.sin(state.phase + (i ? Math.PI : 0)) * amp * 0.7;
      }
    }
    if (parts.wings) {
      const flap = Math.sin(state.t * (moving ? 14 : 6));
      parts.wings[0].rotation.z = -0.2 - flap * 0.6;
      parts.wings[1].rotation.z = 0.2 + flap * 0.6;
    }

    // the body itself: a bob while walking, a breath while standing, a hump for
    // the things with no legs worth the name
    const bob = moving ? Math.abs(swing) * built.height * 0.03 : 0;
    const breathe = moving ? 0 : Math.sin(state.t * 1.6) * built.height * 0.012;
    root.position.y = bob + breathe + (parts.humps && moving ? Math.abs(Math.sin(state.phase)) * built.height * 0.08 : 0);
    if (torso) torso.rotation.x = (parts.slump ? 0.16 : 0) + (moving ? 0.06 : 0);
    if (head && !parts.quadruped) head.rotation.x = -(moving ? 0.05 : 0) + Math.sin(state.t * 0.9) * 0.03;

    // the one-shots ride on top of all of it
    if (state.oneShot === 'swing') {
      const p = clamp(state.oneShotT / SWING_SECONDS, 0, 1);
      // back over the shoulder for the first third, through in the last two
      const a = p < 0.35 ? -2.0 * (p / 0.35) : -2.0 + 2.8 * ((p - 0.35) / 0.65);
      if (arms.length && !parts.quadruped && !parts.flying) { arms[0].rotation.x = a; arms[arms.length - 1].rotation.x = a * 0.5; }
      else { root.rotation.x = -Math.sin(p * Math.PI) * 0.35; root.position.z = Math.sin(p * Math.PI) * built.radius * 0.4; }
    } else if (state.oneShot === 'hurt') {
      const p = clamp(state.oneShotT / HURT_SECONDS, 0, 1);
      root.rotation.x = -Math.sin(p * Math.PI) * 0.3;
    } else {
      root.rotation.x = 0;
      root.rotation.z = 0;
      root.position.z = 0;
    }
  }

  return {
    group,
    parts,
    radius: built.radius,
    height: built.height,
    /** Sole to crown of the box silhouette, measured. The glb is scaled to it. */
    silhouette: silhouetteHeight(group),
    shape,
    setAnim,
    get anim() { return state.anim; },
    /** True once the topple has finished, which is when monsters.js removes it. */
    get dieDone() { return state.anim === 'die' && state.dieT >= DIE_SECONDS; },
    /**
     * @param dt seconds
     * @param speed metres a second the body is actually travelling. The gait is
     *   a function of ground covered, so a slowed monster shuffles rather than
     *   moonwalking at its full stride.
     */
    update(dt, speed = 0) {
      const d = clamp(Number.isFinite(dt) ? dt : 0, 0, 0.1);
      state.t += d;
      state.speed = Math.max(0, Number.isFinite(speed) ? speed : 0);
      state.phase = (state.phase + (state.speed * d / stride) * TAU) % (TAU * 1e6);
      if (state.anim === 'die') { state.dieT += d; pose(); return; }
      if (state.oneShot) {
        state.oneShotT += d;
        const limit = state.oneShot === 'swing' ? SWING_SECONDS : HURT_SECONDS;
        if (state.oneShotT >= limit) { state.oneShot = null; state.anim = state.locomotion; }
      }
      pose();
    },
    dispose() {
      group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      if (group.parent) group.parent.remove(group);
    },
  };
}



// ===========================================================================
// TIER 0: THE ANIMALS OF THE WORLD
// ===========================================================================
//
// A rabbit is not a monster with small numbers, but it IS a monster row: tier
// 0, aggro 0, `flees: 'always'`, and therefore targetable, killable, skinnable
// and one day tamable, which is the whole point of retiring the decorative
// fauna layer. What it is not is a grey box. These bodies are built in the
// language `dragon_models.js` established: generated fur, feather and keratin
// as DataTextures, lofted tubes rather than stacked boxes, and named parts a
// poser drives.
//
// COLOUR IS THE EXCEPTION HERE, AND DELIBERATELY. Everything above tier 0 is
// painted by its tier, because the paint is how a player reads danger at fifty
// metres. A tier 0 animal carries no danger to read, so it is painted like the
// animal it is: a fawn deer, a black crow, a grey and white gull. `TIER_COLOUR[0]`
// stays as the fallback for a critter with no palette of its own, and
// `auditCritterModels()` proves there is no such critter.
//
// PROPORTION IS MEASURED, NOT CLAIMED. `CRITTER_BODY` is metres, and the audit
// builds every body at load and measures the bounding box against the table: a
// deer that stops standing 1.4 m at the shoulder fails the import.
//
// TRIANGLES. Under CRITTER_TRIANGLE_BUDGET each, counted with the same
// `countTriangles` the weapons and the dragon are held to.
//
// THE CLICK COLUMN. A field mouse is nine centimetres long. Its true radius and
// height go to `combat.js` and to the name plate, because those have to be
// honest, but the invisible column the raycaster hits is floored at
// CLICK_MIN_R / CLICK_MIN_H, or the smallest animals in the game would be
// targetable only by accident.



// ------------------------------------------------------------- the noise ---
// Value noise with fbm over it, deterministic from the seed, wrapping on
// `period` so every map tiles. The same three functions dragon_models.js runs
// on, kept here for the same reason it keeps its own copy of them: a fur
// texture should not be a hostage to a change made for a dragon.

function h2c(x, y, s) {
  let n = (x | 0) * 374761393 + (y | 0) * 668265263 + (s | 0) * 1274126177;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
const smoothc = (t) => t * t * (3 - 2 * t);

function vnoisec(x, y, s, period) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const w = (v) => ((v % period) + period) % period;
  const x0 = w(xi), x1 = w(xi + 1), y0 = w(yi), y1 = w(yi + 1);
  const a = h2c(x0, y0, s), b = h2c(x1, y0, s), c = h2c(x0, y1, s), d = h2c(x1, y1, s);
  const u = smoothc(xf), v = smoothc(yf);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

function fbmc(x, y, s, period, octaves = 4, gain = 0.5) {
  let sum = 0, amp = 1, norm = 0, f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * vnoisec(x * f, y * f, s + i * 977, period * f);
    norm += amp;
    amp *= gain;
    f *= 2;
  }
  return sum / norm;
}

// ---------------------------------------------------------- the textures ---

/** 96 squared. Three families, three maps each: about 330 KB and 30 ms, once. */
export const CRITTER_TEX_SIZE = 96;

/**
 * (u, v) -> { l, r, m, h, tintG, tintB }, exactly as the dragon's families are:
 * `l` multiplies material.color, `r` and `m` modulate roughness and metalness,
 * `h` is the height the normal map is differenced out of.
 */
export const CRITTER_FAMILIES = {
  // Fur: fine hairs lying down the length of the animal, over a slow mottle of
  // guard hair and undercoat, with a few darker hairs breaking the run.
  fur(u, v) {
    const lie = fbmc(u * 5, v * 5, 13, 5, 3);
    const hairs = Math.sin((v * 96 + lie * 5) * Math.PI * 2) * 0.5 + 0.5;
    const fine = Math.sin((v * 220 + lie * 9) * Math.PI * 2) * 0.5 + 0.5;
    const mottle = fbmc(u * 7, v * 7, 41, 7, 3);
    const l = 0.44 + hairs * 0.16 + fine * 0.07 + mottle * 0.24;
    return { l, tintG: 0.96, tintB: 0.90, r: 0.86 + mottle * 0.12 - hairs * 0.06, m: 0, h: hairs * 0.9 + fine * 0.35 + mottle * 0.5 };
  },
  // Feather: overlapping vanes in offset rows, each with a quill down the
  // middle and the barbs combed away from it.
  feather(u, v) {
    const rows = 14;
    const ry = v * rows, row = Math.floor(ry), fy = ry - row;
    const rx = u * rows * 0.55 + (row % 2) * 0.5, fx = rx - Math.floor(rx);
    const across = (fx - 0.5) * 2;
    const vane = Math.max(0, 1 - Math.hypot(across * 1.15, (fy - 0.35) * 1.7 * (fy > 0.35 ? 0.72 : 1.5)));
    const quill = Math.max(0, 1 - Math.abs(across) * 9) * vane;
    const barbs = Math.sin((across * 26 + fy * 6) * Math.PI) * 0.5 + 0.5;
    const dust = fbmc(u * 11, v * 11, 61, 11, 3);
    const l = 0.42 + vane * 0.30 + quill * 0.16 + barbs * 0.06 * vane + dust * 0.14;
    return { l, tintG: 0.99, tintB: 0.97, r: 0.66 + dust * 0.18 + (1 - vane) * 0.14, m: 0.03, h: vane * 1.3 + quill * 0.9 - (1 - vane) * 0.5 };
  },
  // Keratin: antler, hoof, beak, claw. Streaks down the length with growth
  // rings across, and a pearled surface where an antler has been rubbed.
  keratin(u, v) {
    const streak = fbmc(u * 90, v * 5, 3, 90, 3, 0.55);
    const rings = Math.abs(Math.sin(v * Math.PI * 16 + fbmc(u * 4, v * 4, 29, 4, 2) * 2));
    const pearl = fbmc(u * 34, v * 34, 71, 34, 2);
    const l = 0.48 + streak * 0.22 + rings * 0.12 + pearl * 0.10;
    return { l, tintG: 0.96, tintB: 0.86, r: 0.56 + streak * 0.22 + rings * 0.10, m: 0.05, h: streak * 1.0 + rings * 0.45 + pearl * 0.4 };
  },
};
CRITTER_FAMILIES.fur.strength = 1.9;
CRITTER_FAMILIES.feather.strength = 2.4;
CRITTER_FAMILIES.keratin.strength = 1.7;

const CRIT_TEX = new Map();

function critterDataTexture(size, bytes) {
  const t = new THREE.DataTexture(bytes, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

/** The three maps of one family, cached: every animal in the world shares one set. */
export function critterTextures(name, repeat = 1) {
  const key = repeat === 1 ? name : `${name}@${repeat}`;
  const hit = CRIT_TEX.get(key);
  if (hit) return hit;
  if (repeat !== 1) {
    const base = critterTextures(name, 1);
    const set = {};
    for (const k of Object.keys(base)) {
      const t = base[k].clone();
      t.repeat.set(repeat, repeat);
      t.needsUpdate = true;
      set[k] = t;
    }
    CRIT_TEX.set(key, set);
    return set;
  }
  const fn = CRITTER_FAMILIES[name];
  if (!fn) throw new Error(`monster_models: no critter texture family "${name}"`);
  const n = CRITTER_TEX_SIZE;
  const alb = new Uint8Array(n * n * 4);
  const orm = new Uint8Array(n * n * 4);
  const hgt = new Float32Array(n * n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      const s = fn(x / n, y / n);
      const l = Math.max(0, Math.min(1, s.l));
      alb[i * 4] = (l * 255) | 0;
      alb[i * 4 + 1] = (l * (s.tintG == null ? 1 : s.tintG) * 255) | 0;
      alb[i * 4 + 2] = (l * (s.tintB == null ? 1 : s.tintB) * 255) | 0;
      alb[i * 4 + 3] = 255;
      orm[i * 4] = 255;
      orm[i * 4 + 1] = (Math.max(0, Math.min(1, s.r)) * 255) | 0;
      orm[i * 4 + 2] = (Math.max(0, Math.min(1, s.m || 0)) * 255) | 0;
      orm[i * 4 + 3] = 255;
      hgt[i] = s.h;
    }
  }
  const nrm = new Uint8Array(n * n * 4);
  const at = (x, y) => hgt[(((y % n) + n) % n) * n + (((x % n) + n) % n)];
  const strength = fn.strength == null ? 2.0 : fn.strength;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(-dx, -dy, 1);
      const i = (y * n + x) * 4;
      nrm[i] = (((-dx / len) * 0.5 + 0.5) * 255) | 0;
      nrm[i + 1] = (((-dy / len) * 0.5 + 0.5) * 255) | 0;
      nrm[i + 2] = (((1 / len) * 0.5 + 0.5) * 255) | 0;
      nrm[i + 3] = 255;
    }
  }
  const set = { map: critterDataTexture(n, alb), ormMap: critterDataTexture(n, orm), normalMap: critterDataTexture(n, nrm) };
  CRIT_TEX.set(key, set);
  return set;
}

const CRIT_MAT = new Map();

/** A physically based material over one of the three families. Cached by look. */
export function critterMaterial(family, colour, o = {}) {
  const key = `${family}|${colour}|${o.rough ?? ''}|${o.metal ?? ''}|${o.repeat ?? ''}|${o.side ?? ''}|${o.emissive ?? ''}|${o.normalScale ?? ''}`;
  const had = CRIT_MAT.get(key);
  if (had) return had;
  const t = critterTextures(family, o.repeat || 1);
  const m = new THREE.MeshPhysicalMaterial({
    color: colour,
    map: t.map,
    roughnessMap: t.ormMap,
    metalnessMap: t.ormMap,
    normalMap: t.normalMap,
    roughness: o.rough == null ? 1 : o.rough,
    metalness: o.metal == null ? 0.05 : o.metal,
    side: o.side == null ? THREE.FrontSide : o.side,
  });
  m.normalScale = new THREE.Vector2(o.normalScale ?? 1, o.normalScale ?? 1);
  if (o.sheen) { m.sheen = o.sheen; m.sheenColor = new THREE.Color(0xffffff); m.sheenRoughness = 0.6; }
  if (o.emissive != null) { m.emissive = new THREE.Color(o.emissive); m.emissiveIntensity = o.emissiveIntensity ?? 1; }
  CRIT_MAT.set(key, m);
  return m;
}

// ---------------------------------------------------------- the geometry ---
//
// One builder does the barrel, the neck, the skull, the muzzle, every leg bone,
// every ear, the tail, the antler beams and the beak: a closed ring profile
// swept along a spine of { z, y, r } stations, running along +z because that is
// the way the rig faces. It is `dragon_models.tube` by another name, and it is
// here rather than imported for the same reason the noise is.

function ringPts(n) {
  const p = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    p.push([Math.cos(a), Math.sin(a)]);
  }
  return p;
}

/**
 * Sweep a ring along a spine.
 *
 * @param prof  points in the ring
 * @param spine [{ z, y, r, flat?, dx? }, ...] back first, front last
 */
export function loft(prof, spine, opts = {}) {
  const P = ringPts(prof);
  const n = P.length, m = spine.length;
  const pos = [], uv = [], idx = [];
  for (let j = 0; j < m; j++) {
    const s = spine[j];
    const flat = s.flat == null ? 1 : s.flat;
    for (let i = 0; i <= n; i++) {
      const p = P[i % n];
      pos.push(p[0] * s.r * flat + (s.dx || 0), p[1] * s.r + s.y, s.z);
      uv.push(i / n, j / (m - 1));
    }
  }
  for (let j = 0; j < m - 1; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i, b = a + 1, c = a + n + 1, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const cap = (j, front) => {
    const s = spine[j];
    const flat = s.flat == null ? 1 : s.flat;
    const centre = pos.length / 3;
    pos.push(s.dx || 0, s.y, s.z);
    uv.push(0.5, 0.5);
    const first = pos.length / 3;
    for (let i = 0; i < n; i++) {
      const p = P[i];
      pos.push(p[0] * s.r * flat + (s.dx || 0), p[1] * s.r + s.y, s.z);
      uv.push(0.5 + p[0] * 0.5, 0.5 + p[1] * 0.5);
    }
    for (let i = 0; i < n; i++) {
      const a = first + i, b = first + ((i + 1) % n);
      if (front) idx.push(centre, a, b); else idx.push(centre, b, a);
    }
  };
  if (opts.capBack !== false) cap(0, false);
  if (opts.capFront !== false) cap(m - 1, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A mesh that casts and takes a shadow, which is every mesh below. */
function part(geometry, material, name) {
  const o = new THREE.Mesh(geometry, material);
  o.castShadow = true;
  o.receiveShadow = true;
  if (name) o.name = name;
  return o;
}

/**
 * One leg: an upper bone from the shoulder, a knee, a lower bone and a foot.
 * The group pivots at the top, so `rotation.x` on it is a stride and
 * `userData.knee.rotation.x` is the joint folding under it.
 */
function critterLeg(name, len, girth, mats, hoof) {
  const g = new THREE.Group();
  g.name = name;
  g.add(part(loft(4, [
    { z: 0, y: 0, r: girth * 1.15 },
    { z: 0, y: -len * 0.30, r: girth * 0.82 },
    { z: 0, y: -len * 0.54, r: girth * 0.58 },
  ], { capFront: false }), mats.hide, 'upper'));
  const knee = new THREE.Group();
  knee.name = `${name}Knee`;
  knee.position.y = -len * 0.54;
  knee.add(part(loft(4, [
    { z: 0, y: 0, r: girth * 0.56 },
    { z: 0, y: -len * 0.42, r: girth * 0.36 },
  ]), mats.hide, 'lower'));
  const foot = part(loft(4, [
    { z: -girth * 0.5, y: 0, r: girth * 0.44, flat: 1.3 },
    { z: girth * 1.6, y: 0, r: girth * 0.34, flat: 1.5 },
  ]), hoof ? mats.horn : mats.hide, 'foot');
  foot.position.y = -len * 0.44;
  knee.add(foot);
  g.add(knee);
  g.userData.knee = knee;
  return g;
}

/**
 * The pose a body was built in, remembered on every joint the poser touches.
 * Without this the poser's "at rest, everything is zero" would straighten a
 * frog's folded hind legs and put its heels through the ground, which is
 * exactly what it did before this line existed.
 */
function rememberRest(built) {
  for (const l of built.parts.legs || []) {
    l.userData.rest = l.rotation.x;
    if (l.userData.knee) l.userData.restKnee = l.userData.knee.rotation.x;
  }
  return built;
}

/** Two eyes, dark and a little glossy, set on the sides of a skull. */
function critterEyes(head, r, out, fwd, up, mats) {
  const eyes = [];
  for (const s of [-1, 1]) {
    const e = part(new THREE.SphereGeometry(r, 5, 3), mats.eye, s < 0 ? 'eyeL' : 'eyeR');
    e.castShadow = false;
    e.position.set(s * out, up, fwd);
    head.add(e);
    eyes.push(e);
  }
  return eyes;
}

// ------------------------------------------------------------ the bodies ---
//
// Every builder is handed a `CRITTER_BODY` row in metres and returns
// { group, parts, radius, height, stride }. `parts.root` is the one thing the
// poser leans, dips and topples, so `group.rotation.y` stays free for facing.

/** The palette a body wears, as materials, from the row's own colours. */
function critterMats(b) {
  const repeat = Math.max(1, Math.round(b.length * 1.6));
  return {
    hide: critterMaterial(b.feathered ? 'feather' : 'fur', b.hide, { rough: b.feathered ? 0.72 : 0.94, metal: 0.02, repeat }),
    belly: critterMaterial(b.feathered ? 'feather' : 'fur', b.belly ?? b.hide, { rough: b.feathered ? 0.74 : 0.96, metal: 0.02, repeat }),
    horn: critterMaterial('keratin', b.horn ?? 0x9a8a6a, { rough: 0.58, metal: 0.06, repeat: 2 }),
    eye: critterMaterial('keratin', b.eye ?? 0x120e0a, { rough: 0.18, metal: 0.1 }),
  };
}

/**
 * A four legged animal: barrel, neck, skull, muzzle, ears, tail, four legs, and
 * antlers where the row asks for them. Deer, fox, hare, squirrel, mouse are all
 * this one shape with different numbers, which is the honest way to say that a
 * fox is a small deer with a brush on the back of it.
 */
function buildQuadrupedCritter(b) {
  const mats = critterMats(b);
  const group = new THREE.Group();
  const root = new THREE.Group();
  root.name = 'root';
  group.add(root);

  const L = b.length;                     // nose to rump, the head-body length
  const girth = L * b.girth * 0.5;        // half the barrel's depth at the chest
  const legGirth = girth * (b.legGirth ?? 0.30);
  // THE SHOULDER IS THE TOP OF THE BACK, and the feet are on the floor, and
  // those two together decide the leg. `shoulder` in CRITTER_BODY is the
  // withers, so the barrel's axis hangs a girth below it; the drop from there
  // to the sole is the hip's offset, the upper bone, the lower bone and the
  // foot's thickness, which is the arithmetic critterLeg lays out. Solving for
  // the leg rather than tuning it is what keeps a mouse and a deer both
  // standing ON the ground at the height the table claims.
  const hipY = b.shoulder - girth * 1.02;
  const legLen = Math.max(0.01, (hipY - girth * 0.30 - legGirth * 0.44) / 0.98);
  const bodyL = L * (b.body ?? 0.52);
  const neckL = L * (b.neck ?? 0.16);
  const headL = L * (b.head ?? 0.20);
  root.position.y = hipY;

  // the barrel: hips behind, shoulders in front, deepest just behind the elbow
  const torso = new THREE.Group();
  torso.name = 'torso';
  root.add(torso);
  torso.add(part(loft(8, [
    { z: -bodyL * 0.50, y: girth * 0.02, r: girth * 0.80, flat: 1.02 },
    { z: -bodyL * 0.16, y: 0, r: girth * (b.rump ?? 1.00), flat: 1.06 },
    { z: bodyL * 0.16, y: girth * 0.03, r: girth * 0.96, flat: 1.04 },
    { z: bodyL * 0.50, y: girth * 0.02, r: girth * 0.74, flat: 1.00 },
  ], { capBack: false, capFront: false }), mats.hide, 'barrel'));
  // the underside is its own shell so a pale belly reads under a dark back
  torso.add(part(loft(6, [
    { z: -bodyL * 0.44, y: -girth * 0.34, r: girth * 0.52, flat: 1.25 },
    { z: 0, y: -girth * 0.38, r: girth * 0.62, flat: 1.30 },
    { z: bodyL * 0.44, y: -girth * 0.34, r: girth * 0.50, flat: 1.22 },
  ]), mats.belly, 'belly'));

  // the neck, rising out of the shoulders
  const neck = new THREE.Group();
  neck.name = 'neck';
  neck.position.set(0, girth * 0.24, bodyL * 0.48);
  neck.rotation.x = -(b.carry ?? 0.5);         // how high the head is carried
  const neckSpine = [];
  const rings = 4;
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    neckSpine.push({ z: neckL * t, y: 0, r: girth * (0.56 - 0.20 * t) });
  }
  neck.add(part(loft(6, neckSpine, { capBack: false }), mats.hide, 'neckMesh'));
  torso.add(neck);

  // the skull, and the muzzle drawn out of the front of it
  const head = new THREE.Group();
  head.name = 'head';
  head.position.set(0, 0, neckL);
  head.rotation.x = (b.carry ?? 0.5);          // level again at the end of the neck
  neck.add(head);
  const headR = girth * (b.skull ?? 0.55);
  head.add(part(loft(6, [
    { z: -headL * 0.28, y: 0, r: headR * 0.72 },
    { z: 0, y: headL * 0.03, r: headR },
    { z: headL * 0.44, y: 0, r: headR * (b.snout ?? 0.52), flat: 0.92 },
    { z: headL * 0.86, y: -headL * 0.06, r: headR * (b.nose ?? 0.30), flat: 0.88 },
  ]), mats.hide, 'skull'));
  const eyes = critterEyes(head, headR * 0.24, headR * 0.74, headL * 0.16, headR * 0.34, mats);

  // ears: a pair of cones on the back of the skull, pivoting so they can flick
  const ears = [];
  const earL = headL * (b.ear ?? 0.5);
  for (const s of [-1, 1]) {
    const e = new THREE.Group();
    e.name = s < 0 ? 'earL' : 'earR';
    e.position.set(s * headR * 0.56, headR * 0.62, -headL * 0.12);
    e.rotation.z = s * (b.earOut ?? 0.35);
    e.add(part(loft(3, [
      { z: 0, y: 0, r: headR * 0.22, flat: 0.6 },
      { z: 0, y: earL * 0.55, r: headR * 0.24, flat: 0.5 },
      { z: -earL * 0.10, y: earL, r: headR * 0.03, flat: 0.5 },
    ]), mats.hide, 'ear'));
    head.add(e);
    ears.push(e);
  }

  // antlers, where the row asks for them: a beam sweeping up and back with
  // tines off the front of it
  const antlers = [];
  if (b.antlers) {
    for (const s of [-1, 1]) {
      const a = new THREE.Group();
      a.name = s < 0 ? 'antlerL' : 'antlerR';
      a.position.set(s * headR * 0.44, headR * 0.78, -headL * 0.06);
      const beamL = headL * (b.antlerLen ?? 1.5);
      a.add(part(loft(3, [
        { z: 0, y: 0, r: headR * 0.16 },
        { z: -beamL * 0.24, y: beamL * 0.44, r: headR * 0.11 },
        { z: -beamL * 0.52, y: beamL * 0.78, r: headR * 0.07 },
        { z: -beamL * 0.72, y: beamL * 1.0, r: headR * 0.02 },
      ]), mats.horn, 'beam'));
      for (let i = 0; i < b.antlers; i++) {
        const t = 0.24 + (i / Math.max(1, b.antlers)) * 0.56;
        const tine = part(loft(3, [
          { z: 0, y: 0, r: headR * 0.07 },
          { z: beamL * 0.22, y: beamL * 0.20, r: headR * 0.015 },
        ]), mats.horn, 'tine');
        tine.position.set(s * headR * 0.06, beamL * t * 1.3, -beamL * t * 0.62);
        a.add(tine);
      }
      head.add(a);
      antlers.push(a);
    }
  }

  // the tail: a pivot at the rump. `bushy` widens it into a squirrel's plume.
  const tail = new THREE.Group();
  tail.name = 'tail';
  tail.position.set(0, girth * 0.30, -bodyL * 0.50);
  tail.rotation.x = b.tailUp ?? 0.6;
  const tailL = L * (b.tail ?? 0.2);
  const tw = b.bushy ?? 0.18;
  tail.add(part(loft(5, [
    { z: 0, y: 0, r: girth * 0.26 },
    { z: -tailL * 0.35, y: 0, r: girth * (0.22 + tw) },
    { z: -tailL * 0.72, y: 0, r: girth * (0.16 + tw * 1.1) },
    { z: -tailL, y: 0, r: girth * 0.05 },
  ]), mats.hide, 'tailMesh'));
  torso.add(tail);

  // four legs, front pair then back pair, which is the order the diagonal
  // gait below is written against
  const legs = [];
  const names = ['legFL', 'legFR', 'legBL', 'legBR'];
  let li = 0;
  for (const z of [bodyL * 0.34, -bodyL * 0.34]) {
    for (const s of [-1, 1]) {
      const leg = critterLeg(names[li++], legLen, legGirth, mats, !!b.hoof);
      leg.position.set(s * girth * 0.70, -girth * 0.30, z);
      root.add(leg);
      legs.push(leg);
    }
  }
  const [legFL, legFR, legBL, legBR] = legs;

  return rememberRest({
    group,
    parts: {
      root, torso, neck, head, ears, antlers, tail, eyes,
      legs, legFL, legFR, legBL, legBR,
      arms: [neck], quadruped: true, hops: !!b.hops,
    },
    radius: Math.max(girth * 1.1, L * 0.16),
    stride: Math.max(0.25, L * (b.hops ? 1.1 : 0.85)),
  });
}

/**
 * A frog. No neck, no ears, a wide flat body, eyes standing off the top of the
 * skull and hind legs folded into a Z, which is the whole silhouette.
 */
function buildFrogCritter(b) {
  const mats = critterMats(b);
  const group = new THREE.Group();
  const root = new THREE.Group();
  root.name = 'root';
  group.add(root);
  const L = b.length;
  const girth = L * 0.30;
  const hipY = b.shoulder - girth * 0.92;
  root.position.y = hipY;

  const torso = new THREE.Group();
  torso.name = 'torso';
  root.add(torso);
  torso.add(part(loft(7, [
    { z: -L * 0.44, y: 0, r: girth * 0.52, flat: 1.15 },
    { z: -L * 0.08, y: 0, r: girth * 0.92, flat: 1.30 },
    { z: L * 0.26, y: girth * 0.06, r: girth * 0.78, flat: 1.25 },
    { z: L * 0.50, y: girth * 0.02, r: girth * 0.36, flat: 1.20 },
  ]), mats.hide, 'barrel'));
  torso.add(part(loft(5, [
    { z: -L * 0.34, y: -girth * 0.42, r: girth * 0.40, flat: 1.4 },
    { z: L * 0.28, y: -girth * 0.44, r: girth * 0.42, flat: 1.4 },
  ]), mats.belly, 'belly'));

  // the head is the front of the body, so the "neck" is a hinge with no length
  const neck = new THREE.Group();
  neck.name = 'neck';
  neck.position.set(0, girth * 0.10, L * 0.30);
  torso.add(neck);
  const head = new THREE.Group();
  head.name = 'head';
  neck.add(head);
  head.add(part(loft(6, [
    { z: -L * 0.06, y: 0, r: girth * 0.60, flat: 1.25 },
    { z: L * 0.10, y: 0, r: girth * 0.46, flat: 1.20 },
  ]), mats.hide, 'skull'));
  const eyes = critterEyes(head, girth * 0.24, girth * 0.46, 0, girth * 0.34, mats);

  const legs = [];
  const names = ['legFL', 'legFR', 'legBL', 'legBR'];
  const legGirth = girth * 0.20;
  const legLen = Math.max(0.01, (hipY - girth * 0.20 - legGirth * 0.44) / 0.98);
  let li = 0;
  for (const z of [L * 0.24, -L * 0.24]) {
    for (const s of [-1, 1]) {
      const back = li >= 2;
      const leg = critterLeg(names[li++], legLen * (back ? 2.1 : 1.0), legGirth, mats, false);
      leg.position.set(s * girth * 0.80, -girth * 0.20, z);
      if (back) { leg.rotation.x = 1.15; leg.userData.knee.rotation.x = -2.0; }
      root.add(leg);
      legs.push(leg);
    }
  }
  const [legFL, legFR, legBL, legBR] = legs;
  const tail = new THREE.Group();       // a frog has none; the part exists so the poser is one poser
  tail.name = 'tail';
  torso.add(tail);
  return rememberRest({
    group,
    parts: { root, torso, neck, head, ears: [], antlers: [], tail, eyes, legs, legFL, legFR, legBL, legBR, arms: [neck], quadruped: true, hops: true },
    radius: Math.max(girth * 1.3, 0.12),
    stride: 0.3,
  });
}

/**
 * A bird: a lofted body, a neck and skull with a beak drawn out of it, two
 * wings whose shoulder a flap drives, a tail fan, and two legs it stands on.
 *
 * The wings are three parts each so a flap reads as a wing and not as a plank:
 * a humerus off the shoulder, a forearm hinged at the wrist, and a sheet of
 * primaries fanned off the wrist. `parts.wings[i].userData.wrist` is the hinge
 * and `.tips` is the sheet, and the poser and the tests both drive them by name.
 */
function buildBirdCritter(b) {
  const mats = critterMats(b);
  const group = new THREE.Group();
  const root = new THREE.Group();
  root.name = 'root';
  group.add(root);

  const L = b.length;                         // beak to tail tip
  const girth = L * (b.girth ?? 0.30) * 0.5;
  const legGirth = girth * 0.16;
  // `stand` is the top of the back, as `shoulder` is for the four legged ones
  const hipY = b.stand - girth;
  const legLen = Math.max(0.01, (hipY - girth * 0.46 - legGirth * 0.44) / 0.98);
  root.position.y = hipY;

  const torso = new THREE.Group();
  torso.name = 'torso';
  root.add(torso);
  const bodyL = L * 0.46;
  torso.add(part(loft(8, [
    { z: -bodyL * 0.52, y: girth * 0.10, r: girth * 0.34, flat: 0.9 },
    { z: -bodyL * 0.18, y: 0, r: girth * 0.86, flat: 0.94 },
    { z: bodyL * 0.20, y: girth * 0.02, r: girth * 1.00, flat: 0.92 },
    { z: bodyL * 0.52, y: girth * 0.10, r: girth * 0.56, flat: 0.90 },
  ], { capBack: false, capFront: false }), mats.hide, 'barrel'));
  torso.add(part(loft(6, [
    { z: -bodyL * 0.42, y: -girth * 0.42, r: girth * 0.36, flat: 1.15 },
    { z: bodyL * 0.10, y: -girth * 0.48, r: girth * 0.52, flat: 1.20 },
    { z: bodyL * 0.46, y: -girth * 0.38, r: girth * 0.34, flat: 1.10 },
  ]), mats.belly, 'belly'));

  // neck and skull; a goose's neck is most of the animal, a crow's is nothing
  const neck = new THREE.Group();
  neck.name = 'neck';
  neck.position.set(0, girth * 0.34, bodyL * 0.48);
  neck.rotation.x = -(b.carry ?? 0.7);
  const neckL = L * (b.neck ?? 0.14);
  neck.add(part(loft(5, [
    { z: 0, y: 0, r: girth * 0.44 },
    { z: neckL * 0.5, y: 0, r: girth * 0.32 },
    { z: neckL, y: 0, r: girth * 0.28 },
  ], { capBack: false }), mats.hide, 'neckMesh'));
  torso.add(neck);

  const head = new THREE.Group();
  head.name = 'head';
  head.position.set(0, 0, neckL);
  head.rotation.x = (b.carry ?? 0.7);
  neck.add(head);
  const headR = girth * 0.40;
  const headL = L * 0.11;
  head.add(part(loft(6, [
    { z: -headL * 0.5, y: 0, r: headR * 0.72 },
    { z: 0, y: 0, r: headR },
    { z: headL * 0.55, y: -headR * 0.05, r: headR * 0.62 },
  ]), mats.hide, 'skull'));
  const beak = part(loft(4, [
    { z: 0, y: 0, r: headR * 0.55, flat: 0.9 },
    { z: L * (b.beak ?? 0.09) * 0.6, y: -headR * 0.10, r: headR * 0.30, flat: 0.85 },
    { z: L * (b.beak ?? 0.09), y: -headR * 0.20, r: headR * 0.05, flat: 0.8 },
  ]), mats.horn, 'beak');
  beak.position.z = headL * 0.5;
  head.add(beak);
  const eyes = critterEyes(head, headR * 0.26, headR * 0.72, headL * 0.06, headR * 0.22, mats);

  // the wings. `span` is the whole span, so one wing reaches half of it out
  // from the shoulder, and the shoulder sits a little proud of the flank.
  const half = b.span * 0.5;
  const wings = [];
  for (const s of [-1, 1]) {
    const w = new THREE.Group();
    w.name = s < 0 ? 'wingL' : 'wingR';
    w.position.set(s * girth * 0.80, girth * 0.30, bodyL * 0.10);
    w.userData.side = s;
    // The shoulder already sits girth * 0.80 out from the middle, so the bones
    // reach the REST of the way to half the span. Splitting the whole half span
    // into three instead put a goose's tips 11 cm past its own tabled span.
    const reach = Math.max(0.01, half - girth * 0.80) / 3;
    const humerusL = reach;
    w.add(part(loft(4, [
      { z: 0, y: 0, r: girth * 0.30, flat: 1.5 },
      { z: humerusL * 0.6, y: 0, r: girth * 0.22, flat: 1.8 },
      { z: humerusL, y: 0, r: girth * 0.16, flat: 1.9 },
    ]), mats.hide, 'humerus'));
    // the wrist, and the forearm past it
    const wrist = new THREE.Group();
    wrist.name = s < 0 ? 'wristL' : 'wristR';
    wrist.position.z = humerusL;
    const foreL = reach;
    wrist.add(part(loft(4, [
      { z: 0, y: 0, r: girth * 0.16, flat: 1.9 },
      { z: foreL, y: 0, r: girth * 0.09, flat: 2.0 },
    ]), mats.hide, 'forearm'));
    // the primaries: one double sided sheet fanned off the wrist, which is
    // eight triangles of feather rather than ten separate quills
    const tipL = reach;
    const pos = [0, 0, 0], uv = [0.5, 0];
    const fan = [
      { z: tipL * 1.00, y: 0.00, x: 0.00 },
      { z: tipL * 0.92, y: -0.02, x: 0.10 },
      { z: tipL * 0.74, y: -0.04, x: 0.20 },
      { z: tipL * 0.48, y: -0.05, x: 0.26 },
      { z: tipL * 0.16, y: -0.05, x: 0.26 },
    ];
    const idx = [];
    fan.forEach((f, i) => {
      pos.push(f.x * tipL * -s, f.y * tipL, f.z);
      uv.push(i / (fan.length - 1), 1);
    });
    for (let i = 1; i < fan.length; i++) idx.push(0, i, i + 1);
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    fg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    fg.setIndex(idx);
    fg.computeVertexNormals();
    const tips = part(fg, critterMaterial('feather', b.wing ?? b.hide, { rough: 0.7, metal: 0.02, side: THREE.DoubleSide, repeat: 1 }), 'primaries');
    tips.castShadow = false;
    tips.position.z = foreL;
    wrist.add(tips);
    w.add(wrist);
    w.userData.wrist = wrist;
    w.userData.tips = tips;
    root.add(w);
    wings.push(w);
  }

  // the tail: a fan off the rump, one sheet, double sided
  const tail = new THREE.Group();
  tail.name = 'tail';
  tail.position.set(0, girth * 0.20, -bodyL * 0.50);
  {
    const tl = L * (b.tailLen ?? 0.26), tw = tl * 0.55;
    const pos = [0, 0, 0, -tw, 0, -tl * 0.82, -tw * 0.5, 0, -tl, tw * 0.5, 0, -tl, tw, 0, -tl * 0.82];
    const uv = [0.5, 0, 0, 1, 0.35, 1, 0.65, 1, 1, 1];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex([0, 1, 2, 0, 2, 3, 0, 3, 4]);
    g.computeVertexNormals();
    const fan = part(g, critterMaterial('feather', b.wing ?? b.hide, { rough: 0.7, metal: 0.02, side: THREE.DoubleSide }), 'tailFan');
    fan.castShadow = false;
    tail.add(fan);
  }
  torso.add(tail);

  // two legs, under the middle of the body where a bird's actually are
  const legs = [];
  for (const s of [-1, 1]) {
    const leg = critterLeg(s < 0 ? 'legL' : 'legR', legLen, legGirth, mats, true);
    leg.position.set(s * girth * 0.42, -girth * 0.46, -bodyL * 0.04);
    root.add(leg);
    legs.push(leg);
  }

  return rememberRest({
    group,
    parts: {
      root, torso, neck, head, beak, tail, eyes, wings,
      wingL: wings[0], wingR: wings[1], legs, legL: legs[0], legR: legs[1],
      arms: wings, ears: [], antlers: [], bird: true,
    },
    radius: Math.max(girth * 1.2, L * 0.18),
    stride: Math.max(0.3, L * 0.6),
  });
}

// ------------------------------------------------------------- the table ---
//
// Metres, and real ones. A red deer stands 1.4 m at the shoulder and a grey
// squirrel is a quarter of a metre nose to rump; those are the numbers here and
// `auditCritterModels()` measures the built body against them rather than
// taking the table's word for it.
//
// `shape` names the builder. `hide`, `belly`, `horn` and `wing` are the animal's
// own colours, which is the one place in this file where the tier does not
// decide the paint: see the note at the head of this section.

export const CRITTER_BODY = {
  deer: {
    shape: 'quadruped', shoulder: 1.40, length: 1.95, girth: 0.34, body: 0.63, neck: 0.25, head: 0.25,
    tail: 0.09, tailUp: 0.9, ear: 0.62, carry: 0.85, skull: 0.46, snout: 0.44, nose: 0.26, hoof: true,
    antlers: 3, antlerLen: 1.5, hide: 0x8f6a44, belly: 0xd6c6ad, horn: 0x9d8c68,
  },
  rabbit: {
    shape: 'quadruped', shoulder: 0.22, length: 0.42, girth: 0.44, body: 0.68, neck: 0.10, head: 0.29,
    tail: 0.12, tailUp: 1.5, bushy: 0.30, ear: 1.5, earOut: 0.18, carry: 0.55, skull: 0.62, snout: 0.60, nose: 0.34,
    hops: true, legGirth: 0.24, hide: 0x9b8a72, belly: 0xe2dccd, horn: 0x8a7a63,
  },
  squirrel: {
    shape: 'quadruped', shoulder: 0.13, length: 0.25, girth: 0.46, body: 0.68, neck: 0.10, head: 0.30,
    tail: 0.90, tailUp: 2.1, bushy: 0.70, ear: 0.55, carry: 0.75, skull: 0.60, snout: 0.56, nose: 0.32,
    hops: true, legGirth: 0.24, hide: 0x8a5f38, belly: 0xe4d9c6, horn: 0x7a5b3c,
  },
  fox: {
    shape: 'quadruped', shoulder: 0.40, length: 0.72, girth: 0.28, body: 0.64, neck: 0.15, head: 0.28,
    tail: 0.55, tailUp: 0.25, bushy: 0.42, ear: 0.95, carry: 0.55, skull: 0.52, snout: 0.40, nose: 0.20,
    legGirth: 0.26, hide: 0xb35f28, belly: 0xe8e1d4, horn: 0x2a231c,
  },
  fieldMouse: {
    shape: 'quadruped', shoulder: 0.045, length: 0.095, girth: 0.42, body: 0.62, neck: 0.09, head: 0.36,
    tail: 0.95, tailUp: 0.5, bushy: 0.02, ear: 1.1, earOut: 0.5, carry: 0.5, skull: 0.64, snout: 0.54, nose: 0.26,
    hops: true, legGirth: 0.22, hide: 0x8b7355, belly: 0xdcd2c0, horn: 0xc9a68c,
  },
  frog: {
    shape: 'frog', shoulder: 0.045, length: 0.095,
    hide: 0x5d7a3a, belly: 0xcfd8a6, horn: 0x3f5228, eye: 0x1a1206,
  },
  gull: {
    shape: 'bird', feathered: true, length: 0.45, span: 1.10, stand: 0.30, girth: 0.34, neck: 0.14,
    beak: 0.11, carry: 0.75, tailLen: 0.24, hide: 0xe6e6e2, belly: 0xf3f2ee, wing: 0x9aa3ab, horn: 0xd8a13a,
  },
  crow: {
    shape: 'bird', feathered: true, length: 0.47, span: 0.95, stand: 0.28, girth: 0.32, neck: 0.12,
    beak: 0.13, carry: 0.7, tailLen: 0.30, hide: 0x22242a, belly: 0x2c2f36, wing: 0x14161a, horn: 0x191b1f,
  },
  goose: {
    shape: 'bird', feathered: true, length: 0.85, span: 1.60, stand: 0.52, girth: 0.32, neck: 0.30,
    beak: 0.08, carry: 1.05, tailLen: 0.20, hide: 0x7d7364, belly: 0xe7e2d6, wing: 0x5a5347, horn: 0x241f1a,
  },
  hawk: {
    shape: 'bird', feathered: true, length: 0.50, span: 1.05, stand: 0.32, girth: 0.34, neck: 0.11,
    beak: 0.08, carry: 0.65, tailLen: 0.28, hide: 0x6b4b31, belly: 0xdfd2bb, wing: 0x513824, horn: 0xe0b23a,
  },
  // Twenty five metres, which is the one number in the roster this file cannot
  // shrink to fit: a whale that reads as a whale has to dwarf the boat.
  whale: {
    shape: 'whale', length: 25, girth: 0.17, shoulder: 4.25,
    hide: 0x36414a, belly: 0xb9bcb4, horn: 0x2a3138, eye: 0x0d0f12,
  },
};

/**
 * Which body each tier 0 row wears.
 *
 * A key with no monster row behind it is allowed and is NOT a bug: the bodies
 * for the fox, the goose and the hawk are built and audited here so that adding
 * their rows to `src/mmo/monsters.js` is one line of data and not a modelling
 * job. `critterModelPlan()` prints which of them is still waiting for a row,
 * and `auditCritterModels()` fails on the case that would actually hurt: a tier
 * 0 row with no body.
 */
export const CRITTER_SHAPE = {
  rabbit: 'rabbit', squirrel: 'squirrel', deer: 'deer', gull: 'gull',
  frog: 'frog', crow: 'crow', fieldMouse: 'fieldMouse',
  // built, audited, and waiting on a row in src/mmo/monsters.js (docs/mmo/wiring/F1.md)
  fox: 'fox', goose: 'goose', hawk: 'hawk',
  // M2's, and it has a body here rather than a placeholder, because a tier 0
  // row with no body does not appear at all: `spawn()` refuses it silently.
  whale: 'whale',
};


/**
 * A whale. Twenty five metres of it, and none of it stands up.
 *
 * One lofted tube from a blunt head to a narrow stock, a fluke across the end
 * of it, two pectoral flippers, a small dorsal and a blowhole. There are no
 * legs, so `parts.legs` is empty and the poser's gait branches all fall
 * through: what moves a whale is the fluke, which beats VERTICALLY, and the
 * whole body rolling a little with it.
 *
 * It is built with its belly at y = 0 like everything else here, so whatever
 * puts it in the water decides how deep it sits. `M2` owns that; this owns the
 * animal.
 */
function buildWhaleCritter(b) {
  const mats = critterMats(b);
  const group = new THREE.Group();
  const root = new THREE.Group();
  root.name = 'root';
  group.add(root);

  const L = b.length;
  const girth = L * b.girth * 0.5;
  root.position.y = girth;

  const torso = new THREE.Group();
  torso.name = 'torso';
  root.add(torso);
  torso.add(part(loft(9, [
    { z: -L * 0.50, y: girth * 0.10, r: girth * 0.06, flat: 1.0 },
    { z: -L * 0.42, y: girth * 0.06, r: girth * 0.16, flat: 0.7 },
    { z: -L * 0.26, y: girth * 0.02, r: girth * 0.34, flat: 0.8 },
    { z: -L * 0.06, y: 0, r: girth * 0.72, flat: 1.0 },
    { z: L * 0.12, y: 0, r: girth * 0.98, flat: 1.05 },
    { z: L * 0.30, y: girth * 0.02, r: girth * 0.92, flat: 1.05 },
    { z: L * 0.44, y: girth * 0.06, r: girth * 0.62, flat: 1.10 },
    { z: L * 0.50, y: girth * 0.08, r: girth * 0.30, flat: 1.15 },
  ]), mats.hide, 'barrel'));
  // the pale underside, throat to navel
  torso.add(part(loft(6, [
    { z: -L * 0.10, y: -girth * 0.58, r: girth * 0.40, flat: 1.30 },
    { z: L * 0.22, y: -girth * 0.62, r: girth * 0.48, flat: 1.30 },
    { z: L * 0.46, y: -girth * 0.44, r: girth * 0.22, flat: 1.20 },
  ]), mats.belly, 'belly'));

  // a whale has no neck; the head is the front of it, hinged so it can turn
  const neck = new THREE.Group();
  neck.name = 'neck';
  neck.position.set(0, 0, L * 0.30);
  torso.add(neck);
  const head = new THREE.Group();
  head.name = 'head';
  neck.add(head);
  head.add(part(loft(6, [
    { z: 0, y: 0, r: girth * 0.70, flat: 1.05 },
    { z: L * 0.12, y: girth * 0.04, r: girth * 0.40, flat: 1.10 },
  ]), mats.hide, 'skull'));
  const blow = part(loft(4, [
    { z: 0, y: 0, r: girth * 0.09 },
    { z: 0, y: girth * 0.07, r: girth * 0.05 },
  ]), mats.horn, 'blowhole');
  blow.position.set(0, girth * 0.66, L * 0.04);
  head.add(blow);
  const eyes = critterEyes(head, girth * 0.05, girth * 0.62, -girth * 0.1, -girth * 0.12, mats);

  // the fluke: one sheet across the end of the stock, and the thing that swims
  const tail = new THREE.Group();
  tail.name = 'tail';
  tail.position.set(0, girth * 0.10, -L * 0.46);
  {
    const w = L * 0.11, len = L * 0.09;
    const pos = [0, 0, 0, -w, 0, -len, -w * 0.35, 0, -len * 0.35, w * 0.35, 0, -len * 0.35, w, 0, -len];
    const uv = [0.5, 0, 0, 1, 0.4, 1, 0.6, 1, 1, 1];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex([0, 1, 2, 0, 3, 4]);
    g.computeVertexNormals();
    const fluke = part(g, critterMaterial('fur', b.hide, { rough: 0.6, metal: 0.02, side: THREE.DoubleSide }), 'fluke');
    fluke.castShadow = false;
    tail.add(fluke);
  }
  torso.add(tail);

  // two pectoral flippers, swept back off the shoulder
  const wings = [];
  for (const s of [-1, 1]) {
    const f = new THREE.Group();
    f.name = s < 0 ? 'wingL' : 'wingR';
    f.position.set(s * girth * 0.78, -girth * 0.24, L * 0.14);
    f.rotation.y = s * 2.3;
    const wrist = new THREE.Group();
    wrist.name = s < 0 ? 'wristL' : 'wristR';
    f.add(part(loft(4, [
      { z: 0, y: 0, r: girth * 0.16, flat: 1.6 },
      { z: L * 0.05, y: 0, r: girth * 0.11, flat: 2.0 },
      { z: L * 0.09, y: 0, r: girth * 0.03, flat: 2.2 },
    ]), mats.hide, 'flipper'));
    f.add(wrist);
    f.userData.side = s;
    f.userData.wrist = wrist;
    f.userData.tips = null;
    root.add(f);
    wings.push(f);
  }

  // a small dorsal, two thirds of the way back
  const fin = part(loft(3, [
    { z: 0, y: 0, r: girth * 0.12 },
    { z: -L * 0.02, y: girth * 0.22, r: girth * 0.02 },
  ]), mats.hide, 'dorsal');
  fin.position.set(0, girth * 0.92, -L * 0.10);
  root.add(fin);

  return rememberRest({
    group,
    parts: {
      root, torso, neck, head, tail, eyes, legs: [], ears: [], antlers: [],
      wings, wingL: wings[0], wingR: wings[1], fin, blowhole: blow,
      arms: [neck], whale: true,
    },
    radius: girth * 1.2,
    stride: L * 0.9,
  });
}

const CRITTER_BUILDERS = { quadruped: buildQuadrupedCritter, frog: buildFrogCritter, bird: buildBirdCritter, whale: buildWhaleCritter };

/** The body a tier 0 id wears, or null for anything that is not a critter. */
export function critterShapeFor(id) {
  const m = MONSTERS[id];
  if (m && m.tier !== 0) return null;
  return CRITTER_SHAPE[id] || null;
}

/** Triangles no animal may go over. Measured at load, not promised. */
export const CRITTER_TRIANGLE_BUDGET = 900;

/** A body this small would be unclickable, so the invisible column is floored. */
export const CLICK_MIN_R = 0.34;
export const CLICK_MIN_H = 0.95;

/** Seconds of one wing beat at the slowest. Bigger birds beat slower. */
export const FLAP_HZ = { goose: 3.2, gull: 3.6, hawk: 4.0, crow: 4.6 };
/** Metres of altitude over which a bird's wings go from folded to spread. */
export const AIRBORNE_OVER_M = 1.2;

// ------------------------------------------------------------ the animal ---

/**
 * One animal's body, and everything that moves it.
 *
 * The contract is `buildBoxMonster`'s, to the letter, because `monsters.js`
 * must not know the difference: `group`, `parts`, `radius`, `height`, `shape`,
 * `anim`, `setAnim`, `dieDone`, `update(dt, speed)`, `dispose()`.
 *
 * Two things are added for the birds, and both are optional:
 *
 *   `setAltitude(metres)`  how far off the ground it is. 0 is perched: wings
 *                          folded, feet down, legs taking the weight. Past
 *                          AIRBORNE_OVER_M the wings are out and beating.
 *                          Nothing calls it yet; docs/mmo/wiring/F1.md carries
 *                          the one line in monsters.js that will.
 *   `setGlide(0..1)`       1 holds the wings out and stops the beat, which is
 *                          the pose a gull rides a thermal in.
 *
 * A bird that is never told its altitude stands on the ground, which is the
 * honest failure: it does not pretend to fly with its wings shut.
 */
export function buildCritterModel(id) {
  const shape = critterShapeFor(id);
  if (!shape) return null;
  const b = CRITTER_BODY[shape];
  if (!b) return null;
  const built = CRITTER_BUILDERS[b.shape](b);
  const { group, parts } = built;
  group.name = `critter:${id}`;

  // THE FEET GO ON THE GROUND, MEASURED. Every body above computes its leg
  // length from its shoulder height, and every one of them is a little out
  // because a foot has a thickness and a knee has a bend. Rather than four
  // hand-tuned fudges, the body is posed once and the whole root is dropped by
  // however far the lowest vertex missed by. `baseY` is then what the poser
  // bobs around, so nothing later can undo it.
  let baseY = parts.root.position.y;

  const flapHz = FLAP_HZ[shape] ?? 4.0;
  const state = {
    t: 0, phase: 0, anim: 'idle', locomotion: 'idle', oneShot: null, oneShotT: 0,
    dieT: 0, speed: 0, alt: 0, glide: 0,
  };

  function setAnim(name) {
    if (name === state.anim) return;
    if (name === 'die') { state.anim = 'die'; state.oneShot = null; state.dieT = 0; return; }
    if (state.anim === 'die') return;                     // dead things do not get up
    if (name === 'swing' || name === 'hurt' || name === 'cast') {
      state.oneShot = name === 'cast' ? 'swing' : name;
      state.oneShotT = 0;
      state.anim = name;
      return;
    }
    state.locomotion = name;
    state.anim = name;
  }

  function pose() {
    const { root, torso, neck, head, ears, tail, legs, wings } = parts;
    if (state.anim === 'die') {
      const p = clamp(state.dieT / DIE_SECONDS, 0, 1);
      const e = 1 - Math.pow(1 - p, 3);
      root.rotation.z = e * Math.PI / 2;
      root.rotation.x = 0;
      root.position.y = baseY - e * baseY * 0.55;
      for (const l of legs) {
        l.rotation.x = (l.userData.rest || 0) * (1 - e) + e * 0.4;
        if (l.userData.knee) l.userData.knee.rotation.x = (l.userData.restKnee || 0) * (1 - e) - e * 0.8;
      }
      if (wings) for (const w of wings) {
        const s = w.userData.side;
        w.rotation.z = 0;
        w.rotation.y = s * (Math.PI / 2 + 1.05);
        w.userData.wrist.rotation.y = s * -1.9;
        w.userData.wrist.rotation.z = 0;
      }
      if (neck) neck.rotation.x = -(b.carry ?? 0.5) + e * 0.7;
      return;
    }
    root.rotation.z = 0;
    root.position.y = baseY;

    const moving = state.speed > 0.15;
    const sw = Math.sin(state.phase);
    const air = parts.bird ? clamp(state.alt / AIRBORNE_OVER_M, 0, 1) : 0;

    // -- the legs ------------------------------------------------------------
    if (parts.bird) {
      // On the ground it walks: two legs, out of phase. In the air they fold
      // back under the tail, which is what a gull actually does with them.
      const amp = moving ? 0.5 * (1 - air) : 0;
      for (let i = 0; i < legs.length; i++) {
        const rest = legs[i].userData.rest || 0, restKnee = legs[i].userData.restKnee || 0;
        legs[i].rotation.x = rest + Math.sin(state.phase + (i ? Math.PI : 0)) * amp + air * 0.9;
        if (legs[i].userData.knee) legs[i].userData.knee.rotation.x = restKnee - air * 1.5 - Math.max(0, Math.sin(state.phase + (i ? Math.PI : 0))) * amp * 0.6;
      }
    } else if (parts.hops) {
      // A rabbit does not walk, it bounds: both hind legs together, both front
      // legs together, and the whole animal comes off the ground between them.
      const hop = moving ? Math.max(0, Math.sin(state.phase)) : 0;
      for (let i = 0; i < legs.length; i++) {
        const back = i >= 2;
        const rest = legs[i].userData.rest || 0, restKnee = legs[i].userData.restKnee || 0;
        legs[i].rotation.x = rest + (back ? -1 : 1) * hop * 0.9;
        if (legs[i].userData.knee) legs[i].userData.knee.rotation.x = restKnee - hop * (back ? 1.3 : 0.5);
      }
      root.position.y = baseY + hop * built.radius * 0.55;
      if (torso) torso.rotation.x = -hop * 0.28;
    } else {
      // diagonal pairs: front left with back right
      const amp = moving ? 0.55 : 0;
      const off = [0, Math.PI, Math.PI, 0];
      for (let i = 0; i < legs.length; i++) {
        const a = Math.sin(state.phase + off[i]) * amp;
        legs[i].rotation.x = (legs[i].userData.rest || 0) + a;
        if (legs[i].userData.knee) legs[i].userData.knee.rotation.x = (legs[i].userData.restKnee || 0) - Math.max(0, a) * 0.6;
      }
      root.position.y = baseY + (moving ? Math.abs(sw) * built.radius * 0.05 : 0);
    }

    // -- a whale, which has no legs and no wings ------------------------------
    if (parts.whale) {
      // The fluke beats VERTICALLY, which is the one thing that separates a
      // whale from a fish, and the body rolls a little with it. Phase by
      // distance travelled, as everything else here is.
      const beat = Math.sin(state.phase);
      if (tail) { tail.rotation.x = beat * 0.30; tail.rotation.y = 0; }
      if (torso) torso.rotation.z = beat * 0.05;
      if (neck) neck.rotation.y = Math.sin(state.t * 0.24) * 0.10;
      if (head) { head.rotation.x = Math.sin(state.t * 0.31) * 0.05; head.rotation.y = 0; }
      for (const w of wings) {
        const sd = w.userData.side;
        w.rotation.y = sd * 2.3;
        w.rotation.z = sd * (0.05 + Math.sin(state.t * 0.5 + sd) * 0.10);
      }
      root.position.y = baseY + Math.sin(state.t * 0.4) * built.radius * 0.03;
    // -- the wings -----------------------------------------------------------
    } else if (wings) {
      // Folded they sweep BACK along the flanks, which is a rotation about y,
      // and they sit a little down off the shoulder, which is one about z.
      // Spread they come out square, and the beat is a z rotation on the
      // shoulder with the wrist following a quarter beat behind it, which is
      // what makes the tip lag and the wing read as a wing.
      const beat = state.glide >= 1 || air <= 0 ? 0 : Math.sin(state.t * flapHz * TAU) * (1 - state.glide) * air;
      const fold = 1 - air;
      const lag = state.glide >= 1 || air <= 0 ? 0
        : Math.sin(state.t * flapHz * TAU - Math.PI * 0.5) * (1 - state.glide) * air;
      for (let i = 0; i < wings.length; i++) {
        const s = wings[i].userData.side;
        // A wing is lofted along +z, so SPREAD is a quarter turn about y that
        // swings it out along its own side, and FOLDED is that turn carried
        // another radian so the wing lies back along the flank. Getting those
        // two the wrong way round left a gull with a 19 cm span and its wings
        // pointing at its own beak; the span in the audit is what caught it.
        wings[i].rotation.y = s * (Math.PI / 2 + fold * 1.05);
        wings[i].rotation.z = s * (-0.04 - fold * 0.45 + air * 0.08) + s * beat * 0.80;
        wings[i].userData.wrist.rotation.y = s * (-1.9 * fold + lag * 0.22);
        wings[i].userData.wrist.rotation.z = s * lag * 0.30;
      }
      // the tail fans in the air and closes on the ground
      if (tail) { tail.rotation.x = -air * 0.35; tail.scale.set(0.55 + air * 0.45, 1, 1); }
    } else if (tail) {
      tail.rotation.y = moving ? -sw * 0.30 : Math.sin(state.t * 0.8) * 0.12;
      tail.rotation.x = (b.tailUp ?? 0.6) + (moving ? Math.abs(sw) * 0.18 : Math.sin(state.t * 0.6) * 0.06);
    }

    // -- the head, the ears, the breath --------------------------------------
    if (neck) {
      // grazing: standing still, a herbivore's head comes down and goes back up
      const graze = !moving && !parts.bird ? Math.max(0, Math.sin(state.t * 0.32)) : 0;
      neck.rotation.x = -(b.carry ?? 0.5) + graze * ((b.carry ?? 0.5) + 0.55) + Math.sin(state.t * 0.9) * 0.03;
    }
    if (head) {
      head.rotation.x = (b.carry ?? 0.5) * (parts.bird ? 1 : 1) + Math.sin(state.t * 1.1) * 0.04;
      // a bird's head snaps rather than drifts, which is most of what makes a
      // crow read as a crow
      head.rotation.y = parts.bird
        ? Math.round(Math.sin(state.t * 0.45) * 2.2) * 0.28
        : (moving ? 0 : Math.sin(state.t * 0.4) * 0.18);
    }
    for (let i = 0; i < ears.length; i++) {
      const flick = Math.max(0, Math.sin(state.t * 1.7 + i * 2.1) - 0.93) * 9;
      ears[i].rotation.x = -flick * 0.5;
      ears[i].rotation.z = (i ? 1 : -1) * ((b.earOut ?? 0.35) + flick * 0.2);
    }
    if (torso && !parts.hops) torso.rotation.x = moving ? 0.04 : Math.sin(state.t * 1.4) * 0.012;

    // -- the one shots, on top of all of it ----------------------------------
    if (state.oneShot === 'swing') {
      const p = clamp(state.oneShotT / SWING_SECONDS, 0, 1);
      const lunge = Math.sin(p * Math.PI);
      root.position.z = lunge * built.radius * 0.5;
      root.rotation.x = -lunge * 0.22;
      if (neck) neck.rotation.x -= lunge * 0.5;
    } else if (state.oneShot === 'hurt') {
      const p = clamp(state.oneShotT / HURT_SECONDS, 0, 1);
      root.rotation.x = -Math.sin(p * Math.PI) * 0.3;
      root.position.z = 0;
    } else {
      root.rotation.x = 0;
      root.position.z = 0;
    }
  }

  // The settle, in the pose the animal actually stands in. Measuring before
  // posing measured the bind pose, which for a frog is a frog doing the splits.
  pose();
  group.updateMatrixWorld(true);
  const settle = new THREE.Box3().setFromObject(group);
  if (Number.isFinite(settle.min.y)) { baseY -= settle.min.y; parts.root.position.y = baseY; }
  pose();
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  const measured = {
    height: box.max.y - box.min.y,
    length: box.max.z - box.min.z,
    width: box.max.x - box.min.x,
  };

  return {
    group,
    parts,
    shape,
    critter: id,
    /** The animal's own size, honest: combat and the name plate read these. */
    radius: built.radius,
    height: measured.height,
    /** Nose to tail and across the wings, measured off the built body. */
    length: measured.length,
    width: measured.width,
    silhouette: measured.height,
    triangles: countTris(group),
    /** Bigger than the animal where the animal is tiny. See CLICK_MIN_R. */
    clickRadius: Math.max(built.radius, CLICK_MIN_R),
    clickHeight: Math.max(measured.height, CLICK_MIN_H),
    setAnim,
    get anim() { return state.anim; },
    get dieDone() { return state.anim === 'die' && state.dieT >= DIE_SECONDS; },
    /** 0 perched, AIRBORNE_OVER_M and up fully flying. Birds only. */
    setAltitude(m) { state.alt = Math.max(0, Number.isFinite(m) ? m : 0); },
    get altitude() { return state.alt; },
    /** 0 beating, 1 held out and riding. Birds only. */
    setGlide(k) { state.glide = clamp(Number.isFinite(k) ? k : 0, 0, 1); },
    get gliding() { return state.glide; },
    update(dt, speed = 0, altitude) {
      const d = clamp(Number.isFinite(dt) ? dt : 0, 0, 0.1);
      state.t += d;
      state.speed = Math.max(0, Number.isFinite(speed) ? speed : 0);
      if (Number.isFinite(altitude)) state.alt = Math.max(0, altitude);
      state.phase = (state.phase + (state.speed * d / built.stride) * TAU) % (TAU * 1e6);
      if (state.anim === 'die') { state.dieT += d; pose(); return; }
      if (state.oneShot) {
        state.oneShotT += d;
        const limit = state.oneShot === 'swing' ? SWING_SECONDS : HURT_SECONDS;
        if (state.oneShotT >= limit) { state.oneShot = null; state.anim = state.locomotion; }
      }
      pose();
    },
    dispose() { freeModel(group); group.clear(); },
  };
}

// -------------------------------------------------------------- the audit ---

/** Every part the poser, monsters.js and the tests reach for by name. */
export const CRITTER_PARTS = ['root', 'torso', 'neck', 'head', 'tail', 'legs', 'eyes'];
export const BIRD_PARTS = ['wingL', 'wingR', 'wings', 'beak'];

/**
 * Which tier 0 row wears what, and which body is built but has no row yet.
 * Printed by the test, so "is a squirrel still a box" is measured, not claimed.
 */
export function critterModelPlan() {
  const out = [];
  for (const [id, shape] of Object.entries(CRITTER_SHAPE)) {
    const row = MONSTERS[id];
    out.push({
      id, shape, kind: CRITTER_BODY[shape]?.shape || null,
      row: !!row,
      why: row ? 'procedural body' : 'body built, awaiting a row in src/mmo/monsters.js',
    });
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : 1));
}

/**
 * Builds every animal at load and measures it: the triangles against the
 * budget, the parts against the names the poser uses, the shoulder height and
 * the length against `CRITTER_BODY`, and the feet against the ground. A tier 0
 * row with no body fails the import rather than shipping invisible, which is
 * exactly what shipped before this file was written.
 */
export function auditCritterModels(o = {}) {
  const bad = [];
  const report = {};
  // A tier 0 row with no body here does not appear in the world: buildMonsterModel
  // returns null and `monsters.spawn` refuses to stand it up. That has to be
  // loud. It is a WARNING at import and an ERROR in the suite rather than a
  // throw at import, on purpose: the roster is another agent's file, and a new
  // animal added there should fail the tests, not brick the game while its
  // model is being made.
  const bodyless = MONSTER_LIST.filter((m) => m.tier === 0 && !CRITTER_SHAPE[m.id]).map((m) => m.id);
  if (bodyless.length) {
    const line = `monster_models: no body for tier 0 ${bodyless.join(', ')}; nothing will spawn for ${bodyless.length === 1 ? 'it' : 'them'}`;
    if (o.warnOnly) console.warn(line);
    else bad.push(line);
  }
  for (const [id, shape] of Object.entries(CRITTER_SHAPE)) {
    if (!CRITTER_BODY[shape]) { bad.push(`${id} wears "${shape}", which has no row in CRITTER_BODY`); continue; }
    if (!CRITTER_BUILDERS[CRITTER_BODY[shape].shape]) bad.push(`${id} is a "${CRITTER_BODY[shape].shape}", which nothing builds`);
  }
  if (bad.length) throw new Error(`monster_models: ${bad.join('; ')}`);

  for (const id of Object.keys(CRITTER_SHAPE)) {
    let m = null;
    try { m = buildCritterModel(id); } catch (e) { bad.push(`${id} threw while building: ${e.message}`); continue; }
    const b = CRITTER_BODY[CRITTER_SHAPE[id]];
    if (m.triangles > CRITTER_TRIANGLE_BUDGET) bad.push(`${id} is ${m.triangles} triangles, over the ${CRITTER_TRIANGLE_BUDGET} budget`);
    for (const p of CRITTER_PARTS) if (m.parts[p] === undefined) bad.push(`${id} has no part called "${p}"`);
    if (b.shape === 'bird') for (const p of BIRD_PARTS) if (m.parts[p] === undefined) bad.push(`${id} has no part called "${p}"`);

    // the feet are on the ground, which is what the settle exists for
    m.group.updateMatrixWorld(true);
    const whole = new THREE.Box3().setFromObject(m.group);
    if (Math.abs(whole.min.y) > 0.02) bad.push(`${id} stands ${whole.min.y.toFixed(3)} m off the ground`);

    // the height at the withers: the top of the barrel, measured in the world
    const stands = measure(m, 'withers');
    const want = b.shape === 'bird' ? b.stand : b.shoulder;
    if (Math.abs(stands - want) > Math.max(0.012, want * 0.12)) {
      bad.push(`${id} stands ${stands.toFixed(3)} m at the shoulder and the table says ${want} m`);
    }

    // the length: head and body for a four legged one (the tail is not part of
    // a head-body length), beak to tail tip for a bird (the wings are not)
    const long = measure(m, 'length');
    if (b.length && Math.abs(long - b.length) > b.length * 0.15) {
      bad.push(`${id} measures ${long.toFixed(3)} m long and the table says ${b.length} m`);
    }

    if (b.span) {
      const spread = measure(m, 'span');
      if (Math.abs(spread - b.span) > b.span * 0.15) bad.push(`${id} spans ${spread.toFixed(2)} m and the table says ${b.span} m`);
      const folded = measure(m, 'folded');
      if (folded >= spread * 0.75) bad.push(`${id} folds its wings to ${folded.toFixed(2)} m of a ${spread.toFixed(2)} m span, which is not folding them`);
      report[id] = { triangles: m.triangles, stand: round2(stands), length: round2(long), span: round2(spread), folded: round2(folded) };
    } else {
      report[id] = { triangles: m.triangles, shoulder: round2(stands), length: round2(long), height: round2(m.height) };
    }
    m.dispose();
  }
  if (bad.length) throw new Error(`auditCritterModels: ${bad.length} problem(s)\n  ${bad.join('\n  ')}`);
  return report;
}

/**
 * One measurement off a built animal, in metres, with the parts that would lie
 * about it hidden for the duration.
 *
 *   withers  the top of the barrel: "height at the shoulder"
 *   length   head and body, tail hidden; for a bird beak to tail, wings hidden
 *   span     wing tip to wing tip with the wings spread, which is the only pose
 *            in which a span means anything
 *   folded   the same across, perched
 */
export function measure(model, what) {
  const parts = model.parts;
  const box = () => { model.group.updateMatrixWorld(true); return new THREE.Box3().setFromObject(model.group); };
  if (what === 'withers') {
    const barrel = parts.torso && parts.torso.getObjectByName('barrel');
    if (!barrel) return 0;
    return new THREE.Box3().setFromObject(barrel).max.y;
  }
  if (what === 'span' || what === 'folded') {
    if (!parts.wings) return 0;
    const was = model.altitude;
    model.setAltitude(what === 'span' ? 9 : 0);
    model.update(0, 0);
    const b = box();
    model.setAltitude(was);
    model.update(0, 0);
    return b.max.x - b.min.x;
  }
  // length. The parts are DETACHED and put back, not hidden: THREE.Box3
  // traverses invisible children too, so hiding a squirrel's tail measured the
  // squirrel with its tail on and made every length in the table a lie.
  const off = parts.bird ? (parts.wings || []) : (parts.tail ? [parts.tail] : []);
  const homes = off.map((o) => o.parent);
  off.forEach((o) => o.parent && o.parent.remove(o));
  const b = box();
  off.forEach((o, i) => homes[i] && homes[i].add(o));
  model.group.updateMatrixWorld(true);
  return b.max.z - b.min.z;
}

const round2 = (v) => Math.round(v * 100) / 100;

// ------------------------------------------------- which family gets a model

/** Sole to crown of a built body, measured rather than guessed. */
function silhouetteHeight(group) {
  const box = new THREE.Box3().setFromObject(group);
  const h = box.max.y - box.min.y;
  return Number.isFinite(h) ? h : 0;
}

/**
 * The Blender model each shape family wears. `biped` has none of its own and
 * borrows the heavy human, which is why `glbModelFor` refuses it above tier 4.
 * `wolf` and `grub` are absent because nothing has been built for them.
 */
export const GLB_FAMILY = {
  skeleton: 'monster-skeleton',
  goblin: 'monster-goblin',
  rat: 'monster-rat',
  zombie: 'monster-zombie',
  spider: 'monster-spider',
  flyer: 'monster-bat',
  biped: 'human-heavy',
};

/** Families with no glb of any kind. They keep the box rig until one is built. */
export const BOX_ONLY_FAMILIES = ['wolf', 'grub'];

/** A family wearing a model that is not its own. Held to tiers 1 to 4. */
export const STANDIN_FAMILIES = ['biped'];

/** Above this tier a stand-in body is worse than no body. */
export const STANDIN_MAX_TIER = 4;

/**
 * The Blender model a monster wears, or null when it keeps the box rig.
 * Everything about the policy is here; nothing else in the file decides it.
 */
export function glbModelFor(id) {
  const m = MONSTERS[id];
  const shape = shapeFor(id);
  if (!m || !shape) return null;
  const model = GLB_FAMILY[shape];
  if (!model) return null;
  if (STANDIN_FAMILIES.includes(shape) && m.tier > STANDIN_MAX_TIER) return null;
  return model;
}

/**
 * Every monster, the shape it wears, the model behind it and why. Printed by
 * the test, so "which of these is still a box" is measured and not claimed.
 */
export function monsterModelPlan() {
  const out = [];
  for (const m of MONSTER_LIST) {
    if (m.tier === 0) continue;
    const shape = shapeFor(m.id);
    const model = glbModelFor(m.id);
    let why = 'glb';
    if (!model) {
      why = BOX_ONLY_FAMILIES.includes(shape) ? 'no model for this family'
        : STANDIN_FAMILIES.includes(shape) ? `stand-in refused above tier ${STANDIN_MAX_TIER}`
          : 'no model';
    } else if (STANDIN_FAMILIES.includes(shape)) why = 'stand-in';
    out.push({ id: m.id, tier: m.tier, shape, model, why });
  }
  return out;
}

/** The glb ids monsters will ask for. Hand these to preloadRigs at boot. */
export function monsterModelIds() {
  const ids = new Set();
  for (const row of monsterModelPlan()) if (row.model) ids.add(row.model);
  return [...ids].filter((id) => MODEL_IDS.includes(id));
}

// -------------------------------------------------------------- the monster

/**
 * One monster's body: a Blender rig where its family has one, the box rig
 * where it does not, and the same contract either way.
 *
 * The box rig is built first in both cases. It is the stand-in while the file
 * is on the wire, it is where `radius` and `height` come from so nothing
 * downstream (the name plate lift, the click column, the bolt height in
 * monsters.js) moves when a family gains a model, and its measured silhouette
 * is what the glb is scaled to. src/mmo/monsters.js carries no size of its
 * own: the size is TIER_HEIGHT nudged by hit points within the tier, exactly
 * as it was.
 */
export function buildMonsterModel(id) {
  const studio = buildStudioCreature(id) || buildStudioCaster(id); return studio || buildLegacyMonsterModel(id);
}

/** Retained bodies for game species not yet present in the studio catalog. */
export function buildLegacyMonsterModel(id) {
  const m = MONSTERS[id];

  // Tier 0 is not a box and never was one: the animals of the world wear the
  // procedural bodies above, and they carry the same contract, so monsters.js
  // cannot tell a rabbit from an ogre except by what it does. Before this they
  // returned null here and `spawn()` refused to stand one up at all, which is
  // why a squirrel was not targetable.
  const critter = buildCritterModel(id);
  if (critter) {
    const hit = new THREE.Mesh(
      new THREE.CylinderGeometry(critter.clickRadius, critter.clickRadius, critter.clickHeight, 6),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    hit.position.y = critter.clickHeight * 0.5;
    critter.group.add(hit);
    critter.parts.hit = hit;
    return critter;
  }

  const box = buildBoxMonster(id);
  if (!box) return null;

  const glbId = glbModelFor(id);
  let model = box;
  if (glbId) {
    const colour = bodyColourFor(id);
    const ready = isLoaded(glbId);
    if (ready) box.dispose();          // it was only ever the measuring stick
    const rig = buildGlbRig(glbId, {
      height: box.silhouette,
      // multiply, not replace: the tier still paints the danger, and the
      // model keeps the shading Blender baked into its vertex colours instead
      // of going flat the way the box rig has to.
      tint: colour,
      tintMode: 'multiply',
      dieSeconds: DIE_SECONDS,
      fallback: ready ? null : () => box,
    });
    rig.group.name = `monster:${id}`;
    rig.radius = box.radius;
    rig.height = box.height;
    rig.shape = box.shape;
    rig.monster = id;
    rig.silhouette = box.silhouette;
    model = rig;
  }

  // A body is a poor thing to click on when it is a stick figure at fifty
  // metres. This invisible column is what the raycaster actually hits, exactly
  // as the critter bodies above do, so a rat is as easy to select as an ogre.
  // It hangs off the OUTER group, which survives the glb swapping in.
  const hit = new THREE.Mesh(
    new THREE.CylinderGeometry(box.radius * 1.15, box.radius * 1.15, box.height * 1.1, 6),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  hit.position.y = box.height * 0.55;
  model.group.add(hit);
  model.parts.hit = hit;
  return model;
}

auditMonsterShapes();
auditCritterModels({ warnOnly: true });
