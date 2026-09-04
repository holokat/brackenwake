// The monsters that are actually standing there.
//
// `src/mmo/monsters.js` is the roster: forty-eight rows of health and damage
// and aggro, where each of them lives, and the rules for a spawn roll. It is
// pure and it is finished. THIS file is the other half: the part that decides
// which chunk of ground holds which of them right now, puts a body on that
// ground, walks it at you, asks `combat.js` to swing, leaves a sack when it
// dies, and remembers not to put it back for eight to fifteen minutes.
//
//   const monsters = createMonsters(sc, runtime, { actorFactory, combat, rng, deadUntil });
//   monsters.update(dt, now, playerActor, night);      // in the frame, before combat.update
//   const hit = monsters.pick(raycaster);              // what the cursor means
//   monsters.nearestHostile(pos, yaw, 20, Math.PI / 4) // what an ability means
//
// The shape is `fauna.js`'s, on purpose, because it is the shape that already
// works in this world: a deterministic roll per chunk from the seed, the near
// ring only, a hard cap on how many may stand at once, and a rank by distance
// so the cap is spent on the things a player could actually meet. Walk away and
// come back and the same wolves are in the same wood.
//
// Three things it does that fauna does not:
//
//   * It fights. Every swing goes out through `combat.queueSwing`, which is the
//     same call the player's click makes, into the same resolver. There is no
//     monster damage formula in this file and there never will be.
//   * It remembers being killed. A dead monster's slot goes into the
//     character's `deadUntil` list with the wall clock time it comes back, so
//     clearing a camp stays cleared across a reload.
//   * It keeps out of the town. Nothing spawns inside a settlement's ground,
//     and nothing spawns within SPAWN_KEEP of where the player begins, because
//     a giant rat on the doorstep of a new character is not a difficulty
//     curve, it is an accident.
//
// The AI and the spawn maths are pure functions with no THREE in them, tested
// against fake actors in `monsters.test.mjs`. THREE only appears where a body
// has to exist.

import * as THREE from 'three';
import { CHUNK } from '../world/field.js';
import { rand2 } from '../world/noise.js';
import {
  MONSTERS, HABITAT, spawnRollFor, resolvePlace, respawnDelay,
  NO_RESPAWN_RADIUS, SPAWN_SPACING_M,
} from '../mmo/monsters.js';
import { aggroCheck, leashCheck, fleeCheck, UNARMED } from '../mmo/combat_rules.js';
import { buildMonsterModel, DIE_SECONDS } from './monster_models.js';

// --------------------------------------------------------------- constants

export const NEAR_RING = 3;          // chunks each way that may hold monsters, as fauna
export const ALIVE_CAP = 40;         // never more than this many bodies at once
export const SPAWN_KEEP = 60;        // metres of quiet around where the player starts
export const SETTLEMENT_PAD = 12;    // added to a town's flat radius; nothing spawns inside
export const GROUP_SPREAD = 8;       // metres a group scatters from its anchor
export const GROUP_AGGRO_M = 8;      // "pull one and its friends within 8 m come too"
export const WANDER_R = 6;           // how far an idle monster drifts from home
export const WANDER_MIN_MS = 3000, WANDER_MAX_MS = 7000;
export const SCAN_MS = 400;          // between spawn sweeps
export const RIVER_MAX = 0.15;       // river strength nothing will stand in
export const FLEE_BREAK_M = 25;      // a fleeing thing that gets this far away calms down
export const RETURN_HEAL_S = 6;      // "flee below 25% health and return healed": full in six seconds
export const IDLE_SPEED = 0.35;      // fraction of run speed while wandering
export const FLEE_SPEED = 1.1;       // a bolting thing is quicker than a charging one
export const SLOW_DEFAULT = 0.3;     // fraction of speed a `slow` with no factor takes off
export const CORPSE_LINGER_S = DIE_SECONDS + 0.4;   // the topple, and a moment after it
const PLACE_TRIES = 10;

/**
 * The chance a chunk holds a group at all.
 *
 * 05-WORLD-CONTENT gives density as a distance: "one per 150 m of wild land at
 * night, one per 400 m by day". A chunk is CHUNK metres across, so walking over
 * one covers CHUNK metres of wild land, and the chance it holds the group is
 * CHUNK / that distance. At CHUNK = 64 that is 0.427 at night and 0.16 by day,
 * which across the 49 chunks of the near ring is about 21 groups at night and 8
 * by day before the cap has anything to say. THIS IS AN INTERPRETATION of a
 * sentence that does not name a chunk, and it is written down here rather than
 * buried so it can be argued with.
 */
export const GROUP_CHANCE = {
  night: CHUNK / SPAWN_SPACING_M.wildNight,
  day: CHUNK / SPAWN_SPACING_M.wildDay,
};

const SALT_GROUP = 0x9e37;
const SALT_PICK = 0x85eb;
const SALT_PLACE = 0xc2b2;

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const dist2D = (a, b) => Math.hypot(num(a?.x) - num(b?.x), num(a?.z) - num(b?.z));

/** A deterministic [0, 1) stream for one chunk, so a re-roll gives the same camp. */
export function chunkRng(cx, cz, seed) {
  let i = 0;
  return () => rand2(cx * 73856093 + i, cz * 19349663 + (i++ * 31), seed + SALT_PICK);
}

// ------------------------------------------------------------- where they go

/** A settlement's ground, which nothing hostile stands on. Towns and hamlets only. */
export const settlementClear = (site) => (site.flatR != null ? site.flatR : 26) + SETTLEMENT_PAD;
const isSettlement = (site) => site && (site.kind === 'town' || site.kind === 'hamlet');

/**
 * Which HABITAT list this spot reads from.
 *
 * The biome, except where a ruin stands: 05-WORLD-CONTENT says of ruins
 * "always something: skeletons, cultists, a wraith in the old ones", and a
 * ruin's own roster is a better answer than the meadow it happens to sit in.
 * A cave mouth reads as a cave for the same reason. Everything else is the
 * biome, which HABITAT has a row for in every case.
 */
export function placeFor(field, sites, x, z) {
  for (const s of sites || []) {
    if (!s) continue;
    const r = (s.flatR != null ? s.flatR : 14) + 10;
    if (dist2D(s, { x, z }) > r) continue;
    if (s.kind === 'ruin') return 'ruin';
    if (s.kind === 'cave') return 'cave';
  }
  const biome = field.biomeAt(x, z);
  return HABITAT[resolvePlace(biome)] ? resolvePlace(biome) : 'meadow';
}

/**
 * May a monster stand here? Null when it may, otherwise the reason. The same
 * call guards placement and every step, so nothing can walk into a town it
 * could not have spawned in.
 */
export function blockedAt(x, z, sample, ctx = {}) {
  if (sample && (sample.water || num(sample.river) > RIVER_MAX)) return 'water';
  const keep = ctx.spawnKeep ?? SPAWN_KEEP;
  if (ctx.spawnPoint && keep > 0 && dist2D(ctx.spawnPoint, { x, z }) < keep) return 'spawn';
  for (const s of ctx.sites || []) {
    if (isSettlement(s) && dist2D(s, { x, z }) < settlementClear(s)) return 'settlement';
  }
  return null;
}

/**
 * Everything one chunk holds, as plain records. No THREE, no scene, no actors,
 * so the whole spawn table is testable in node.
 *
 * @param opts { night, sitesNear, spawnPoint, spawnKeep, chance }
 * @returns [] or the members of one group, each
 *   { id, key, cx, cz, i, x, z, y, groupKey, night }
 */
export function spawnsForChunk(field, cx, cz, opts = {}) {
  const seed = num(field.seed);
  const night = !!opts.night;
  const x0 = cx * CHUNK, z0 = cz * CHUNK, mid = CHUNK / 2;
  const chance = opts.chance != null ? opts.chance : (night ? GROUP_CHANCE.night : GROUP_CHANCE.day);
  if (rand2(cx, cz, seed + SALT_GROUP + (night ? 1 : 0)) >= chance) return [];

  const sitesNear = opts.sitesNear || (() => []);
  const sites = sitesNear(x0 + mid, z0 + mid, CHUNK + 160) || [];
  const place = placeFor(field, sites, x0 + mid, z0 + mid);
  const roll = spawnRollFor(place, night, chunkRng(cx, cz, seed));
  if (!roll) return [];

  const ctx = { sites, spawnPoint: opts.spawnPoint, spawnKeep: opts.spawnKeep };
  const groupKey = `${cx},${cz}:${roll.id}`;
  const out = [];
  let anchor = null;
  for (let i = 0; i < roll.count; i++) {
    let placed = null;
    for (let t = 0; t < PLACE_TRIES; t++) {
      const ra = rand2(cx * 131 + i * 17 + t, cz * 97 + t * 5, seed + SALT_PLACE);
      const rb = rand2(cx * 89 + t * 11, cz * 149 + i * 23 + t, seed + SALT_PLACE + 1);
      const x = anchor ? anchor.x + (ra - 0.5) * 2 * GROUP_SPREAD : x0 + 6 + ra * (CHUNK - 12);
      const z = anchor ? anchor.z + (rb - 0.5) * 2 * GROUP_SPREAD : z0 + 6 + rb * (CHUNK - 12);
      const s = field.sampleAt(x, z);
      if (blockedAt(x, z, s, ctx)) continue;
      placed = { x, z, y: s.h };
      break;
    }
    if (!placed) continue;
    if (!anchor) anchor = placed;
    out.push({
      id: roll.id, cx, cz, i, groupKey, night,
      key: `${groupKey}:${i}`,
      x: placed.x, z: placed.z, y: placed.y,
    });
  }
  return out;
}

// ------------------------------------------------------------------ the AI

/** The poison a monster's touch carries, from its notes. 0 for a clean bite. */
export function poisonLevelOf(row) {
  const notes = (row && row.notes) || [];
  if (notes.includes('poison3')) return 3;
  if (notes.includes('poison2') || notes.includes('poisonBreath')) return 2;
  if (notes.includes('poison1') || notes.includes('poisonTouch')) return 1;
  return 0;
}

/** Does this thing bring its friends? Wolves hunt in packs; a grub does not. */
export const sharesAggro = (row) => {
  const notes = (row && row.notes) || [];
  return notes.includes('sharesAggro') || notes.includes('group') || notes.includes('alpha');
};

/** How fast this actor may move right now, after root, stun and slow. */
export function speedOf(m, now = 0) {
  const st = m.status || {};
  if (st.stun && num(st.stun.until) > now) return 0;
  if (st.root && num(st.root.until) > now) return 0;
  const run = num(m.run) || num(m.ai?.run) || 3;
  if (st.slow && num(st.slow.until) > now) {
    const f = Number.isFinite(st.slow.factor) ? st.slow.factor : SLOW_DEFAULT;
    return run * clamp(1 - f, 0.1, 1);
  }
  return run;
}

/**
 * Walk one step toward a point, following the ground. Pure: it is handed a
 * position and returns the new one, which is what lets a test drive a hundred
 * frames of it with no world at all.
 *
 * @returns { x, y, z, moved, dist, arrived }
 */
export function stepToward(pos, to, speed, dt, heightAt) {
  const dx = num(to.x) - num(pos.x), dz = num(to.z) - num(pos.z);
  const d = Math.hypot(dx, dz);
  const step = Math.max(0, num(speed)) * clamp(num(dt), 0, 0.1);
  if (d < 1e-6 || step <= 0) return { x: num(pos.x), y: num(pos.y), z: num(pos.z), moved: 0, dist: d, arrived: d < 1e-6 };
  const take = Math.min(step, d);
  const x = num(pos.x) + (dx / d) * take;
  const z = num(pos.z) + (dz / d) * take;
  const y = typeof heightAt === 'function' ? num(heightAt(x, z)) : num(pos.y);
  return { x, y, z, moved: take, dist: d - take, arrived: take >= d - 1e-9 };
}

/** Away from a point instead of toward it. Fleeing, and only fleeing. */
export function stepAway(pos, from, speed, dt, heightAt) {
  const dx = num(pos.x) - num(from.x), dz = num(pos.z) - num(from.z);
  const d = Math.hypot(dx, dz) || 1;
  const to = { x: num(pos.x) + (dx / d) * 100, z: num(pos.z) + (dz / d) * 100 };
  return stepToward(pos, to, speed, dt, heightAt);
}

/**
 * One monster, one frame. Pure enough to drive with a plain object: it reads
 * and writes `m.pos`, `m.yaw`, `m.health` and `m.ai`, and nothing else.
 *
 * Every decision in it is `combat_rules.js`'s: `aggroCheck` turns it, and it
 * cannot turn on a critter or a corpse; `leashCheck` sends it home after six
 * seconds past two and a half times its aggro radius; `fleeCheck` breaks it at
 * a quarter health unless it is undead or a construct.
 *
 * @param ctx { player, now, reach, heightAt }
 * @returns { state, moved, wantSwing, dist } and never throws on a missing
 *   player, because between a death and a respawn there genuinely is not one.
 */
export function stepMonster(m, dt, ctx = {}) {
  const now = num(ctx.now);
  const d = clamp(num(dt), 0, 0.1);
  const ai = m.ai || (m.ai = { home: { x: num(m.pos.x), z: num(m.pos.z) }, state: 'idle' });
  const out = { state: ai.state, moved: 0, wantSwing: false, dist: Infinity };

  if (num(m.health) <= 0) { ai.state = out.state = 'dead'; return out; }
  const player = ctx.player && num(ctx.player.health) > 0 ? ctx.player : null;
  const home = ai.home || (ai.home = { x: num(m.pos.x), z: num(m.pos.z) });
  const speed = speedOf(m, now);

  // -- who it is on ---------------------------------------------------------
  if (ai.state !== 'flee' && ai.state !== 'return') {
    if (ai.target && num(ai.target.health) <= 0) ai.target = null;
    if (!ai.target && player && aggroCheck(m, player.pos)) { ai.target = player; ai.alerted = now; }
  }

  // -- has it had enough ----------------------------------------------------
  if (ai.target && ai.state !== 'flee' && fleeCheck(m)) {
    ai.state = 'flee';
    ai.fleeFrom = ai.target;
    ai.target = null;
  }

  // -- has it been pulled too far from home ---------------------------------
  if (ai.target && ai.state !== 'flee') {
    // leashCheck reads `leashSince` off the monster or off its `ai`, and ours
    // lives on `ai`, so it can be handed the actor itself with nothing copied.
    const l = leashCheck(m, home, ai.target.pos, now);
    ai.leashSince = l.leashSince;
    if (l.broken) { ai.target = null; ai.leashSince = null; ai.state = 'return'; }
  } else {
    ai.leashSince = null;
  }

  const move = (to, sp) => {
    const s = stepToward(m.pos, to, sp, d, ctx.heightAt);
    if (s.moved > 0) {
      m.yaw = Math.atan2(s.x - num(m.pos.x), s.z - num(m.pos.z));
      m.pos.x = s.x; m.pos.z = s.z; m.pos.y = s.y;
    }
    out.moved = s.moved;
    return s;
  };

  switch (ai.state === 'dead' ? 'dead' : (ai.target ? 'chase' : ai.state)) {
    case 'chase': {
      const target = ai.target;
      const gap = dist2D(m.pos, target.pos);
      out.dist = gap;
      const reach = num(ctx.reach) || (num(UNARMED.reach) + 0.9);
      if (gap <= reach) {
        // stand and swing, facing what it is hitting. A stunned thing may not:
        // combat.queueSwing would refuse it anyway, and asking every frame for
        // something that is always refused is how a log fills up with nothing.
        m.yaw = Math.atan2(num(target.pos.x) - num(m.pos.x), num(target.pos.z) - num(m.pos.z));
        const st = m.status || {};
        out.wantSwing = !(st.stun && num(st.stun.until) > now);
        ai.state = 'attack';
      } else {
        move(target.pos, speed);
        ai.state = 'chase';
      }
      break;
    }
    case 'flee': {
      const from = ai.fleeFrom || player;
      if (!from) { ai.state = 'return'; break; }
      const gap = dist2D(m.pos, from.pos);
      out.dist = gap;
      if (gap >= FLEE_BREAK_M) { ai.state = 'return'; ai.fleeFrom = null; }
      else {
        const s = stepAway(m.pos, from.pos, speed * FLEE_SPEED, d, ctx.heightAt);
        if (s.moved > 0) {
          m.yaw = Math.atan2(s.x - num(m.pos.x), s.z - num(m.pos.z));
          m.pos.x = s.x; m.pos.z = s.z; m.pos.y = s.y;
        }
        out.moved = s.moved;
      }
      break;
    }
    case 'return': {
      const s = move(home, speed);
      out.dist = s.dist;
      // "flee below 25% health and return healed": the walk home is the healing
      if (num(m.maxHealth) > 0) m.health = Math.min(num(m.maxHealth), num(m.health) + num(m.maxHealth) * d / RETURN_HEAL_S);
      if (s.dist < 0.6) { ai.state = 'idle'; m.health = num(m.maxHealth) || m.health; ai.wanderAt = 0; }
      break;
    }
    case 'dead':
      break;
    default: {
      // idle: a slow drift around home, a new spot every three to seven seconds
      if (!ai.wanderTo || now >= num(ai.wanderAt)) {
        const rng = typeof ctx.rng === 'function' ? ctx.rng : Math.random;
        const a = rng() * Math.PI * 2, r = rng() * WANDER_R;
        ai.wanderTo = { x: home.x + Math.cos(a) * r, z: home.z + Math.sin(a) * r };
        ai.wanderAt = now + WANDER_MIN_MS + rng() * (WANDER_MAX_MS - WANDER_MIN_MS);
      }
      const s = move(ai.wanderTo, speed * IDLE_SPEED);
      if (s.arrived) ai.wanderTo = null;
      ai.state = 'idle';
      break;
    }
  }

  out.state = ai.state;
  return out;
}

// -------------------------------------------------------- the stand-in actor
//
// `src/game/actor.js` is agent W1's, and `spawnMonster` there is the real
// builder: it will sum bonuses, resists and pools the way `stats.js` and
// `items.js` say. Until it lands, and in every node test, this makes an actor
// of the shape 07-RUNTIME-CONTRACT describes straight off the monster row. It
// is deliberately thin, it is NOT a second implementation of W1's job, and
// `main.js` must pass W1's `spawnMonster` as `actorFactory` so that only one of
// them is ever used in the running game.

/** The natural weapon a row swings: its damage range and its swing speed. */
export function naturalWeapon(row) {
  const [lo, hi] = row.damage || [1, 3];
  return {
    skill: 'wrestling', minDamage: lo, maxDamage: hi, speed: row.speed || 2.2,
    weight: 0, damageType: 'physical', ranged: false,
    reach: row.tier >= 4 ? 2.4 : row.tier >= 2 ? 1.8 : 1.5,
  };
}

/** Does this row hold something it can turn a blade with? */
const parries = (row) => (row.notes || []).some((n) => n === 'parries' || n === 'swordAndShield' || n === 'shield');

export function makeMonsterActor(id, opts = {}) {
  const row = MONSTERS[id];
  if (!row) throw new Error(`monsters: no monster "${id}"`);
  const pos = opts.pos || { x: 0, y: 0, z: 0 };
  // The row's `hit` and `def` are on the player's own 0 to 100 scale, and both
  // have to come back out of `combat_rules` as exactly those numbers.
  //
  //   attackSkill  = weaponSkill + Tactics * 0.25 + hitBonus
  //   defenceSkill = weaponSkill * 0.5 + Parrying * 0.5 + DEX * 0.4 + defence
  //
  // With no Tactics and no DEX the attack is the weapon skill, so `hit` goes
  // straight in there. The defence is then whatever is left over once the
  // weapon skill and Parrying have had their halves, which is what makes
  // `defenceSkill(actor)` return the tabled `def` and not some larger number
  // nobody wrote down. A row that parries carries the Parrying and a shield;
  // one that does not has neither, and parryChance is zero for it.
  const parrying = parries(row) ? row.def : 0;
  const defence = row.def - row.hit * 0.5 - parrying * 0.5;
  return {
    id: opts.key || `${id}-${Math.random().toString(36).slice(2, 8)}`,
    monsterId: id, kind: 'monster', name: row.name, tier: row.tier,
    pos: { x: num(pos.x), y: num(pos.y), z: num(pos.z) }, yaw: 0,
    stats: { str: 0, dex: 0, int: 0, con: 0, wis: 0 },
    skills: { wrestling: row.hit, tactics: 0, anatomy: 0, parrying },
    bonuses: { defence, lifeLeech: (row.notes || []).includes('lifeLeech30') ? 30 : 0 },
    ar: row.ar, resists: {},
    weapon: naturalWeapon(row), shield: parries(row) ? { parryFactor: 1 } : null,
    health: row.hp, maxHealth: row.hp, mana: 0, maxMana: 0, stamina: 100, maxStamina: 100,
    buffs: [], status: {},
    lastSwingAt: -Infinity, casting: null,
    // What this thing is worth as a lesson to whoever is fighting it. The row's
    // own skill number, which is what 05 tiers the whole roster by.
    faction: 'hostile', difficulty: row.hit,
    family: row.kind, temperament: row.temperament,
    run: row.run,
    ai: { home: { x: num(pos.x), z: num(pos.z) }, aggro: row.aggro, leash: row.aggro * 2.5, state: 'idle', target: null },
    anim: 'idle',
  };
}

// ----------------------------------------------------------------- runtime

/**
 * @param sc      the object from `createScene`, or a bare THREE scene
 * @param runtime the object from `createWorldRuntime`: field, heightAt,
 *                sitesNear, inDungeon
 * @param opts {
 *   actorFactory,   W1's spawnMonster(id, { pos, key, row }). Falls back to
 *                   makeMonsterActor above, which is a stand-in, not a rival.
 *   combat,         the object from createCombat. Every swing goes through it.
 *   rng,            [0, 1), for respawn delays and wander points
 *   deadUntil,      the character document's own array. Mutated in place.
 *   spawnPoint,     { x, z } the player's start, kept clear by SPAWN_KEEP
 *   loot, floaters, hud, audio
 * }
 */
export function createMonsters(sc, runtime, opts = {}) {
  const scene = sc && sc.scene ? sc.scene : sc;
  const group = new THREE.Group();
  group.name = 'monsters';
  scene?.add?.(group);

  const field = runtime?.field;
  const rng = typeof opts.rng === 'function' ? opts.rng : Math.random;
  const combat = opts.combat || null;
  const loot = opts.loot || null;
  const actorFactory = typeof opts.actorFactory === 'function' ? opts.actorFactory : makeMonsterActor;
  const heightAt = (x, z) => (typeof runtime?.heightAt === 'function' ? runtime.heightAt(x, z) : 0);
  const sitesNear = (x, z, r) => (typeof runtime?.sitesNear === 'function' ? runtime.sitesNear(x, z, r) : []);
  const cap = opts.cap ?? ALIVE_CAP;
  const ring = opts.ring ?? NEAR_RING;
  const spawnPoint = opts.spawnPoint || { x: 0, z: 0 };
  const spawnKeep = opts.spawnKeep ?? SPAWN_KEEP;
  // The respawn clock is the WALL clock, not the frame clock: `now` in the
  // frame is performance.now(), which starts again at zero every reload, and a
  // camp cleared before lunch has to still be clear after it.
  const wallClock = typeof opts.clock === 'function' ? opts.clock : () => Date.now();
  const deadUntil = Array.isArray(opts.deadUntil) ? opts.deadUntil : [];

  const say = (text, kind) => {
    if (!text) return;
    if (typeof opts.hud?.log === 'function') opts.hud.log(text, kind);
    else opts.hud?.toast?.(text, kind);
  };

  const chunks = new Map();     // "cx,cz" -> { cx, cz, recs, night }
  const live = new Map();       // key -> monster record
  const corpses = [];           // toppling bodies, waiting to be taken away
  let lastScan = -1e9, lastChunk = null, lastNight = null;
  let lastNow = 0;
  const stats = { alive: 0, spawned: 0, despawned: 0, killed: 0, capped: 0, chunks: 0 };

  // -- the dead list --------------------------------------------------------
  const deadEntry = (key) => deadUntil.find((e) => e && e.key === key) || null;

  /**
   * Is this slot still empty? A slot whose time has come stays empty while the
   * player is inside NO_RESPAWN_RADIUS of it, which is 05-WORLD-CONTENT's
   * "unless a player is within 30 m": a monster must never appear in front of
   * someone who is looking at the ground it appears on.
   */
  function stillDead(rec, playerPos) {
    const e = deadEntry(rec.key);
    if (!e) return false;
    if (wallClock() < num(e.until)) return true;
    if (playerPos && dist2D(rec, playerPos) < NO_RESPAWN_RADIUS) return true;
    const i = deadUntil.indexOf(e);
    if (i >= 0) deadUntil.splice(i, 1);
    return false;
  }

  // -- bodies ---------------------------------------------------------------
  function spawn(rec) {
    const row = MONSTERS[rec.id];
    if (!row) return null;
    const model = buildMonsterModel(rec.id);
    if (!model) return null;               // a tier 0 critter; fauna.js has it
    const y = heightAt(rec.x, rec.z);
    const actor = actorFactory(rec.id, { pos: { x: rec.x, y, z: rec.z }, key: rec.key, row, rec });
    if (!actor) return null;

    // Defensive filling, and only of things `combat_rules.js` reads by name.
    // W1's spawnMonster owns these; if it already set them nothing here fires.
    actor.pos = actor.pos || { x: rec.x, y, z: rec.z };
    actor.pos.x = rec.x; actor.pos.y = y; actor.pos.z = rec.z;
    if (actor.temperament == null) actor.temperament = row.temperament;
    if (actor.family == null) actor.family = row.kind;
    if (actor.run == null) actor.run = row.run;
    if (actor.tier == null) actor.tier = row.tier;
    actor.ai = actor.ai || {};
    actor.ai.home = { x: rec.x, z: rec.z };
    if (actor.ai.aggro == null) actor.ai.aggro = row.aggro;
    if (actor.ai.leash == null) actor.ai.leash = row.aggro * 2.5;
    actor.ai.state = 'idle';
    actor.ai.target = null;
    actor.radius = model.radius;
    actor.model = model.group;

    model.group.position.set(rec.x, y, rec.z);
    group.add(model.group);

    const mon = {
      key: rec.key, rec, row, actor, model, id: rec.id, name: row.name,
      poison: poisonLevelOf(row), shares: sharesAggro(row),
      groupKey: rec.groupKey, lastSpeed: 0,
    };
    model.group.userData.monster = mon;
    model.parts.hit.userData.monster = mon;
    live.set(rec.key, mon);
    stats.alive++; stats.spawned++;
    return mon;
  }

  function despawn(key) {
    const mon = live.get(key);
    if (!mon) return;
    live.delete(key);
    stats.alive--; stats.despawned++;
    // a swing already in the air belongs to a body that is about to stop
    // existing, and it must not land out of nowhere a third of a second later
    combat?.forget?.(mon.actor);
    mon.model.dispose();
  }

  /**
   * It died. The sack goes down where the body fell, the slot goes into the
   * character's dead list with the wall clock it comes back, and the body
   * stays long enough to topple.
   */
  function died(mon, killer) {
    if (!live.has(mon.key)) return;
    live.delete(mon.key);
    stats.alive--; stats.killed++;
    mon.model.setAnim('die');
    corpses.push({ mon, t: 0 });
    deadUntil.push({ key: mon.key, id: mon.id, until: wallClock() + respawnDelay(rng) * 1000 });

    const drop = loot?.rollFor ? loot.rollFor(mon.row, { luck: num(killer?.bonuses?.luck), seed: hashKey(mon.key) }) : null;
    const bag = drop && loot?.drop ? loot.drop(mon.actor.pos, drop) : null;
    if (killer && killer.kind === 'player') {
      say(bag
        ? `the ${mon.name.toLowerCase()} goes down, and leaves a sack`
        : `the ${mon.name.toLowerCase()} goes down, and leaves nothing`);
    }
  }

  const hashKey = (key) => {
    let h = 2166136261;
    for (let i = 0; i < key.length; i++) { h ^= key.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  };

  // -- the sweep ------------------------------------------------------------
  function chunkFor(cx, cz, night) {
    const k = `${cx},${cz}`;
    const had = chunks.get(k);
    if (had && had.night === night) return had;
    const entry = {
      cx, cz, night,
      recs: field ? spawnsForChunk(field, cx, cz, { night, sitesNear, spawnPoint, spawnKeep, chance: opts.groupChance }) : [],
    };
    chunks.set(k, entry);
    return entry;
  }

  function rescan(px, pz, night) {
    const [pcx, pcz] = field.chunkOf(px, pz);
    for (const [k, e] of [...chunks]) {
      if (Math.abs(e.cx - pcx) > ring || Math.abs(e.cz - pcz) > ring) chunks.delete(k);
    }
    const wanted = [];
    for (let dz = -ring; dz <= ring; dz++) {
      for (let dx = -ring; dx <= ring; dx++) {
        const e = chunkFor(pcx + dx, pcz + dz, night);
        for (const rec of e.recs) {
          if (stillDead(rec, { x: px, z: pz })) continue;
          wanted.push({ rec, d2: (rec.x - px) ** 2 + (rec.z - pz) ** 2 });
        }
      }
    }
    stats.chunks = chunks.size;
    wanted.sort((a, b) => a.d2 - b.d2 || (a.rec.key < b.rec.key ? -1 : 1));
    const keep = wanted.slice(0, cap);
    stats.capped = wanted.length - keep.length;
    const keepKeys = new Set(keep.map((w) => w.rec.key));
    // anything not in the keep set, and not currently fighting, goes away
    for (const [key, mon] of [...live]) {
      if (keepKeys.has(key)) continue;
      if (mon.actor.ai?.target) continue;      // never vanish mid fight
      despawn(key);
    }
    for (const w of keep) if (!live.has(w.rec.key)) spawn(w.rec);
  }

  // -- the frame ------------------------------------------------------------

  /**
   * @param dt seconds
   * @param now milliseconds, the same clock combat.update is given
   * @param playerActor the actor monsters aggro on, or null
   * @param night true while the night roster is out
   */
  function update(dt, now, playerActor, night = false) {
    lastNow = Number.isFinite(now) ? now : lastNow;
    const d = clamp(num(dt), 0, 0.1);

    // Underground the overworld is switched off. Its monsters are standing in
    // memory at coordinates directly over your head, and stepping them would
    // walk a wolf through the roof of the dungeon at you.
    if (runtime?.inDungeon) {
      if (live.size) { for (const key of [...live.keys()]) despawn(key); chunks.clear(); }
      group.visible = false;
      stepCorpses(d);
      return;
    }
    group.visible = true;

    const px = num(playerActor?.pos?.x), pz = num(playerActor?.pos?.z);
    if (playerActor && field) {
      const [pcx, pcz] = field.chunkOf(px, pz);
      const moved = !lastChunk || lastChunk[0] !== pcx || lastChunk[1] !== pcz;
      if (moved || night !== lastNight || lastNow - lastScan >= SCAN_MS) {
        lastScan = lastNow; lastChunk = [pcx, pcz]; lastNight = night;
        rescan(px, pz, night);
      }
    }

    for (const mon of [...live.values()]) {
      const a = mon.actor;
      if (num(a.health) <= 0) continue;                  // combat's onDeath will take it
      const before = a.ai?.target || null;
      const res = stepMonster(a, d, {
        player: playerActor, now: lastNow, heightAt,
        reach: combat ? combat.reachBetween(a, playerActor || a) : undefined,
        rng,
      });
      if (!before && a.ai.target) alertGroup(mon, a.ai.target);

      mon.model.group.position.set(a.pos.x, a.pos.y, a.pos.z);
      mon.model.group.rotation.y = num(a.yaw);
      const speed = d > 0 ? res.moved / d : 0;
      mon.lastSpeed = speed;

      if (res.wantSwing && combat && playerActor && a.ai.target === playerActor) {
        const swing = combat.queueSwing(a, playerActor, { now: lastNow, poison: mon.poison || undefined });
        if (swing.queued) mon.model.setAnim('swing');
      }
      // the animation follows the actor, which combat.js writes on a hit
      if (a.anim === 'hurt' && mon.model.anim !== 'hurt') { mon.model.setAnim('hurt'); a.anim = res.state === 'idle' ? 'idle' : 'walk'; }
      else if (mon.model.anim !== 'swing' && mon.model.anim !== 'hurt') {
        mon.model.setAnim(speed > 0.15 ? (speed > num(a.run) * 0.75 ? 'run' : 'walk') : 'idle');
      }
      mon.model.update(d, speed);
    }

    stepCorpses(d);
  }

  function stepCorpses(d) {
    for (let i = corpses.length - 1; i >= 0; i--) {
      const c = corpses[i];
      c.t += d;
      c.mon.model.update(d, 0);
      if (c.t >= CORPSE_LINGER_S) { c.mon.model.dispose(); corpses.splice(i, 1); }
    }
  }

  /** "pull one and its friends within 8 m come too". Only the ones that hunt together. */
  function alertGroup(mon, target) {
    for (const other of live.values()) {
      if (other === mon || other.actor.ai?.target) continue;
      if (!(other.shares || other.groupKey === mon.groupKey)) continue;
      if (dist2D(other.actor.pos, mon.actor.pos) > GROUP_AGGRO_M) continue;
      other.actor.ai.target = target;
      other.actor.ai.state = 'chase';
    }
  }

  // combat is the only thing that decides a monster is dead; this is how we
  // hear about it, so there is exactly one death rule in the game
  const offDeath = combat?.onDeath ? combat.onDeath((actor, killer) => {
    for (const mon of live.values()) if (mon.actor === actor) { died(mon, killer); return; }
  }) : null;

  // -- what the cursor and the abilities ask ---------------------------------

  /** Every live body, for picking. The models, as `fauna.targets()` returns models. */
  function targets() {
    const out = [];
    for (const mon of live.values()) if (num(mon.actor.health) > 0) out.push(mon.model.group);
    return out;
  }

  /** What is under the ray, as the monster record, or null. */
  function pick(raycaster) {
    if (!raycaster || !live.size) return null;
    const hits = raycaster.intersectObjects(group.children, true);
    for (const h of hits) {
      let o = h.object;
      for (let n = 0; o && n < 6; n++, o = o.parent) {
        const mon = o.userData && o.userData.monster;
        if (mon && live.has(mon.key) && num(mon.actor.health) > 0) return mon;
      }
    }
    return null;
  }

  /**
   * The nearest living hostile in a cone in front of a point: what an ability
   * means by "the target" when the cursor is not on anything. `yaw` is the
   * facing, `halfAngle` the half width of the cone in radians.
   */
  function nearestHostile(pos, yaw, range = 20, halfAngle = Math.PI / 4) {
    let best = null, bd = range;
    const fx = Math.sin(num(yaw)), fz = Math.cos(num(yaw));
    for (const mon of live.values()) {
      const a = mon.actor;
      if (num(a.health) <= 0) continue;
      const dx = num(a.pos.x) - num(pos?.x), dz = num(a.pos.z) - num(pos?.z);
      const d = Math.hypot(dx, dz);
      if (d > bd || d < 1e-6) continue;
      const cos = (dx * fx + dz * fz) / d;
      if (cos < Math.cos(clamp(halfAngle, 0, Math.PI))) continue;
      bd = d; best = mon;
    }
    return best;
  }

  return {
    group, stats, update, targets, pick, nearestHostile,
    /** Every live actor, for area effects and the cone. targets() is the meshes for picking. */
    actors: () => [...live.values()].filter((m) => num(m.actor.health) > 0).map((m) => m.actor),
    /** Every live monster record. Debug, the HUD and the tests. */
    all: () => [...live.values()],
    get count() { return live.size; },
    /** The record a given actor belongs to, for the target frame. */
    forActor(actor) { for (const m of live.values()) if (m.actor === actor) return m; return null; },
    /** The dead list this runtime is writing into: the character's own array. */
    deadUntil,
    /** Force a sweep now, rather than waiting out SCAN_MS. A teleport wants this. */
    rescan(px, pz, night) { if (field) rescan(px, pz, !!night); },
    dispose() {
      offDeath?.();
      for (const key of [...live.keys()]) despawn(key);
      for (const c of corpses) c.mon.model.dispose();
      corpses.length = 0;
      chunks.clear();
      scene?.remove?.(group);
    },
  };
}
