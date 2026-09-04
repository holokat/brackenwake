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

// ---------------------------------------------------------------- the paint

/** Tier to colour. The five bands of 05-WORLD-CONTENT, plus bosses. */
export const TIER_COLOUR = {
  0: 0x9a8f7a,   // critters. This file never builds one; fauna.js owns them.
  1: 0x8d9099,   // grey
  2: 0x5f9e58,   // green
  3: 0xc9b04a,   // yellow
  4: 0xcc7a33,   // orange
  5: 0xb03a34,   // red
  6: 0x5e1b18,   // a boss: the red gone almost black
};

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
 * a row; the audit below proves it. Tier 0 is deliberately absent: rabbits and
 * deer already have real models in `src/farm/`, and `fauna.js` spawns them.
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

/** The shape a monster id wears, or null when nothing builds it (tier 0). */
export function shapeFor(id) {
  const m = MONSTERS[id];
  if (!m) return null;
  if (m.tier === 0) return null;
  return SHAPE_FOR[id] || null;
}

/**
 * Every monster above tier 0 has a silhouette, and every silhouette named is
 * one this file can actually build. Runs at load, like the audits in
 * `fauna.js` and in the top half of `combat.js`: a monster with no shape would
 * otherwise spawn, walk, hit you and be invisible.
 */
export function auditMonsterShapes() {
  const bad = [];
  for (const m of MONSTER_LIST) {
    if (m.tier === 0) { if (SHAPE_FOR[m.id]) bad.push(`${m.id} is a critter and fauna.js already has a model for it`); continue; }
    const s = SHAPE_FOR[m.id];
    if (!s) bad.push(`${m.id} has no silhouette`);
    else if (!BUILDERS[s]) bad.push(`${m.id} wears "${s}", which nothing builds`);
  }
  for (const id of Object.keys(SHAPE_FOR)) if (!MONSTERS[id]) bad.push(`a silhouette for "${id}", which is not a monster`);
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
  const colour = TIER_COLOUR[m.tier] ?? TIER_COLOUR[1];
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
  const s = pinned ? base * (0.95 + 0.1 * k) : base * (0.85 + 0.3 * k);

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
  const m = MONSTERS[id];
  const box = buildBoxMonster(id);
  if (!box) return null;

  const glbId = glbModelFor(id);
  let model = box;
  if (glbId) {
    const colour = TIER_COLOUR[m.tier] ?? TIER_COLOUR[1];
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
  // as fauna.js does for its animals, so a rat is as easy to select as an ogre.
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
