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
import { aggroCheck, leashCheck, fleeCheck, swingSeconds, UNARMED } from '../mmo/combat_rules.js';
import { buildMonsterModel, DIE_SECONDS } from './monster_models.js';
import { SWING_LAND_S, actorDistance } from './combat.js';
import {
  attackModeOf, isFlyer, isBoss, rangedWeaponFor, spellFor, coneTargets,
  castBroken, hoverHeight, approachHeight, bossPlanFor, phaseIndexFor, plateText,
  weaknessMultiplier, dungeonSpawns, normalizeDungeonLayout, dungeonHabitat,
  RANGED_FAR, RANGED_BACKOFF, CORNER_MOVE_FRACTION, CORNER_SECONDS, UNCORNER_M,
  SWOOP_SECONDS, ENRAGE_SWING, SUMMON_COUNT, SUMMON_RING_M,
  SLAM_WARN_S, SLAM_RADIUS, RETREAT_HEAL_PS, RETREAT_SECONDS,
} from './monster_ai.js';

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
// A body stays as long as its sack does, so a knife has something to skin.
// skinning.js reads corpsesNear and pickCorpse and writes `skinned` on the record.
export const CORPSE_KEEP_S = 90;
const PLACE_TRIES = 10;

// -- underground ------------------------------------------------------------
/** Bodies a level may hold at once. A ring of chunks has no meaning down there:
 *  a level is at most 96 m across, so it is held whole and ranked by distance. */
export const DUNGEON_CAP = 24;

// -- what a thing that shoots throws ----------------------------------------
/** Seconds a thrown or shot thing is in the air. The blow lands with it. */
export const PROJECTILE_S = SWING_LAND_S;
/** Metres a miss carries on past the head it was aimed at. */
export const PROJECTILE_OVERSHOOT_M = 4;
/** Radius of the little mesh. Small: it is a knife, not a boulder. */
export const PROJECTILE_R = 0.14;

// -- bosses -----------------------------------------------------------------
/** Seconds between one ground slam and the next, once a boss has unlocked it. */
export const SLAM_EVERY_S = 9;
/** Metres over the head the name plate floats. */
export const PLATE_LIFT = 1.1;

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
  // the zone says how hard the ground is: field.sampleAt carries a danger band
  // of monster tiers, and a roll above it is rolled again from the same rng,
  // then dropped if the habitat has nothing that tame. Below the band is fine.
  const rng = chunkRng(cx, cz, seed);
  const band = field.sampleAt(x0 + mid, z0 + mid).danger || null;
  let roll = spawnRollFor(place, night, rng);
  if (band) {
    for (let k = 0; k < 6 && roll && (MONSTERS[roll.id]?.tier ?? 1) > band[1]; k++) roll = spawnRollFor(place, night, rng);
    if (roll && (MONSTERS[roll.id]?.tier ?? 1) > band[1]) roll = null;
  }
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
export function stepToward(pos, to, speed, dt, heightAt, clampXZ) {
  const dx = num(to.x) - num(pos.x), dz = num(to.z) - num(pos.z);
  const d = Math.hypot(dx, dz);
  const step = Math.max(0, num(speed)) * clamp(num(dt), 0, 0.1);
  if (d < 1e-6 || step <= 0) return { x: num(pos.x), y: num(pos.y), z: num(pos.z), moved: 0, dist: d, arrived: d < 1e-6, want: 0 };
  const take = Math.min(step, d);
  let x = num(pos.x) + (dx / d) * take;
  let z = num(pos.z) + (dz / d) * take;
  // Underground this is `runtime.clampWalkable`, and it is asked on EVERY step
  // and not only at placement, because a corridor turns and a monster walking
  // straight at you would otherwise walk through the rock between you.
  if (typeof clampXZ === 'function') {
    const c = clampXZ(x, z);
    if (Array.isArray(c)) { x = num(c[0]); z = num(c[1]); }
    else if (c && typeof c === 'object') { x = num(c.x); z = num(c.z); }
  }
  const moved = Math.hypot(x - num(pos.x), z - num(pos.z));
  const y = typeof heightAt === 'function' ? num(heightAt(x, z)) : num(pos.y);
  return { x, y, z, moved, dist: Math.hypot(num(to.x) - x, num(to.z) - z), arrived: take >= d - 1e-9, want: take };
}

/** Away from a point instead of toward it. Fleeing, backing off, and nothing else. */
export function stepAway(pos, from, speed, dt, heightAt, clampXZ) {
  const dx = num(pos.x) - num(from.x), dz = num(pos.z) - num(from.z);
  const d = Math.hypot(dx, dz) || 1;
  const to = { x: num(pos.x) + (dx / d) * 100, z: num(pos.z) + (dz / d) * 100 };
  return stepToward(pos, to, speed, dt, heightAt, clampXZ);
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
 * A row that shoots, throws, casts or breathes does not walk into reach at all.
 * It keeps the standoff band, backs away when you close on it, and only puts
 * its hands up when it has backed into a wall and cannot go further, which is
 * `cornered`. `ctx.mode` decides which of the two it is, and a melee row with
 * no mode behaves exactly as it did before this was written.
 *
 * @param ctx { player, now, reach, heightAt, clampXZ, rng, mode, flying }
 * @returns { state, moved, wantSwing, wantCast, cornered, altitude, dist } and
 *   never throws on a missing player, because between a death and a respawn
 *   there genuinely is not one.
 */
export function stepMonster(m, dt, ctx = {}) {
  const now = num(ctx.now);
  const d = clamp(num(dt), 0, 0.1);
  const ai = m.ai || (m.ai = { home: { x: num(m.pos.x), z: num(m.pos.z) }, state: 'idle' });
  const mode = ctx.mode || 'melee';
  const ranged = mode !== 'melee';
  const out = { state: ai.state, moved: 0, wantSwing: false, wantCast: false, cornered: !!ai.cornered, dist: Infinity, altitude: 0 };

  if (num(m.health) <= 0) { ai.state = out.state = 'dead'; return out; }
  const player = ctx.player && num(ctx.player.health) > 0 ? ctx.player : null;
  const home = ai.home || (ai.home = { x: num(m.pos.x), z: num(m.pos.z) });
  const speed = speedOf(m, now);

  // -- who it is on ---------------------------------------------------------
  if (ai.state !== 'flee' && ai.state !== 'return') {
    if (ai.target && num(ai.target.health) <= 0) ai.target = null;
    // who it is on: the player, or an ally of theirs standing closer (the
    // dragon, D1); the first that is alive and inside the aggro radius
    if (!ai.target) {
      for (const cand of [player, ...(ctx.allies || [])]) {
        if (cand && num(cand.health) > 0 && aggroCheck(m, cand.pos)) { ai.target = cand; ai.alerted = now; break; }
      }
    }
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
    const s = stepToward(m.pos, to, sp, d, ctx.heightAt, ctx.clampXZ);
    if (s.moved > 0) {
      m.yaw = Math.atan2(s.x - num(m.pos.x), s.z - num(m.pos.z));
      m.pos.x = s.x; m.pos.z = s.z; m.pos.y = s.y;
    }
    out.moved = s.moved;
    return s;
  };
  const back = (from, sp) => {
    const s = stepAway(m.pos, from, sp, d, ctx.heightAt, ctx.clampXZ);
    if (s.moved > 0) { m.pos.x = s.x; m.pos.z = s.z; m.pos.y = s.y; }
    out.moved = s.moved;
    return s;
  };
  /** It wanted to go somewhere and the world would not let it. */
  const stuck = (s) => s.want > 0 && s.moved < s.want * CORNER_MOVE_FRACTION;
  const faceThe = (p) => { m.yaw = Math.atan2(num(p.x) - num(m.pos.x), num(p.z) - num(m.pos.z)); };
  const canAct = () => { const st = m.status || {}; return !(st.stun && num(st.stun.until) > now); };

  switch (ai.state === 'dead' ? 'dead' : (ai.target ? 'chase' : ai.state)) {
    case 'chase': {
      const target = ai.target;
      // The same measure combat.queueSwing will use on the swing, flat with the
      // rise past a shoulder counted. Measured flat here and through the air
      // there, a wolf on a mountainside stopped two metres from a player two
      // and a half metres above it and both stood swinging at nothing.
      // A flyer measures flat: its height is its own to give up, and it
      // swoops to the floor when it decides to strike.
      const gap = ctx.flying ? dist2D(m.pos, target.pos) : actorDistance(m, target);
      out.dist = gap;
      const reach = num(ctx.reach) || (num(UNARMED.reach) + 0.9);

      if (ranged && !ai.cornered) {
        // The standoff. Too far and it comes; too close and it walks backwards
        // still facing you; in the band it stands and throws. It never turns its
        // back, which is why this is stepAway and not a walk to a point behind.
        faceThe(target.pos);
        if (gap > RANGED_FAR) { move(target.pos, speed); ai.state = 'chase'; faceThe(target.pos); break; }
        if (gap < RANGED_BACKOFF) {
          const s = back(target.pos, speed);
          faceThe(target.pos);
          // against a wall for CORNER_SECONDS and it gives up backing away
          if (stuck(s)) {
            ai.cornerFor = num(ai.cornerFor) + d;
            if (ai.cornerFor >= CORNER_SECONDS) { ai.cornered = true; ai.cornerFor = 0; }
          } else ai.cornerFor = 0;
          ai.state = 'chase';
          out.cornered = !!ai.cornered;
          break;
        }
        ai.cornerFor = 0;
        ai.state = 'attack';
        if (canAct()) { if (mode === 'cast' || mode === 'breath') out.wantCast = true; else out.wantSwing = true; }
        break;
      }

      // cornered, or a melee row: the old behaviour, unchanged
      if (ranged && ai.cornered && gap > UNCORNER_M) { ai.cornered = false; ai.cornerFor = 0; }
      if (gap <= reach) {
        // stand and swing, facing what it is hitting. A stunned thing may not:
        // combat.queueSwing would refuse it anyway, and asking every frame for
        // something that is always refused is how a log fills up with nothing.
        faceThe(target.pos);
        out.wantSwing = canAct();
        ai.state = 'attack';
      } else {
        move(target.pos, speed);
        ai.state = 'chase';
      }
      out.cornered = !!ai.cornered;
      break;
    }
    case 'flee': {
      const from = ai.fleeFrom || player;
      if (!from) { ai.state = 'return'; break; }
      const gap = dist2D(m.pos, from.pos);
      out.dist = gap;
      if (gap >= FLEE_BREAK_M) { ai.state = 'return'; ai.fleeFrom = null; }
      else {
        const s = stepAway(m.pos, from.pos, speed * FLEE_SPEED, d, ctx.heightAt, ctx.clampXZ);
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

  // -- the ones that do not touch the ground --------------------------------
  // Every branch above wrote `m.pos.y` from `heightAt`, which is the floor. A
  // flyer's height is put back on top of that here, in one place, so no branch
  // can forget it. It comes down to swoop and holds low for SWOOP_SECONDS,
  // which is the window a swordsman has to hit it back: combat.actorDistance is
  // three dimensional, so a harpy three metres up is genuinely unreachable and
  // the swoop is the whole of the answer to that.
  if (ctx.flying) {
    const ground = typeof ctx.heightAt === 'function' ? num(ctx.heightAt(m.pos.x, m.pos.z)) : 0;
    // The height is kept on `ai`, not read back off `m.pos.y`: every movement
    // branch above writes pos.y from `heightAt`, so a height derived from it
    // would be knocked back to the floor on every frame the thing moved and the
    // bat would spend its life climbing the same six centimetres.
    if (ai.alt == null) ai.alt = hoverHeight(0, false);
    ai.hoverT = num(ai.hoverT) + d;
    if (ai.state === 'attack') ai.swoopUntil = now + SWOOP_SECONDS * 1000;
    const swooping = num(ai.swoopUntil) > now;
    ai.alt = approachHeight(ai.alt, hoverHeight(ai.hoverT, swooping), d);
    m.pos.y = ground + ai.alt;
    out.altitude = ai.alt;
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
  let devSpawnN = 0;            // keys for the dev bench's spawns
  const shots = [];             // knives, spikes and boulders in the air
  const slams = [];             // a ring on the ground, and what happens under it
  let lastScan = -1e9, lastChunk = null, lastNight = null;
  let lastNow = 0;
  // null above ground, "siteId:level" below it. A change is a whole new layer.
  let layerKey = null;
  let levelRecs = [];
  let levelL = null;            // the normalised layout of the level standing
  const stats = {
    alive: 0, spawned: 0, despawned: 0, killed: 0, capped: 0, chunks: 0,
    shots: 0, casts: 0, interrupted: 0, slams: 0, summoned: 0, phases: 0,
  };

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

    const mode = attackModeOf(row);
    // A thing that throws needs a weapon whose REACH is its range, or
    // `combat.landSwing` bins the blow three hundred milliseconds later for
    // being out of a reach nobody meant it to have. See rangedWeaponFor.
    if ((mode === 'thrown' || mode === 'shot') && actor.weapon) {
      actor.weapon = rangedWeaponFor(actor, row);
    }

    const mon = {
      key: rec.key, rec, row, actor, model, id: rec.id, name: row.name,
      poison: poisonLevelOf(row), shares: sharesAggro(row),
      groupKey: rec.groupKey, lastSpeed: 0,
      mode, flyer: isFlyer(row), boss: isBoss(row), spell: spellFor(row),
      cast: null, lastHealth: num(actor.health),
      phase: 0, plan: isBoss(row) ? bossPlanFor(row) : [], plate: null,
      slamAt: 0, retreatUntil: 0, ephemeral: !!rec.ephemeral,
    };
    if (mon.boss) mon.plate = makePlate(mon);
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
    dropPlate(mon);
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
    mon.cast = null;
    dropPlate(mon);
    corpses.push({
      mon, t: 0, key: mon.key, id: mon.id, actor: mon.actor, row: mon.row, name: mon.name,
      get pos() { return mon.actor.pos; },
      skinned: false,
    });
    // A summoned minion is not a slot in the world and must not be written into
    // the character's dead list: it was never in the level's own roll, so an
    // entry for it would sit in the save for ever matching nothing.
    if (!mon.ephemeral) deadUntil.push({ key: mon.key, id: mon.id, until: wallClock() + respawnDelay(rng) * 1000 });

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

  // -- the boss's name plate ------------------------------------------------
  //
  // A canvas sprite over the head, which is the only label in the game and is
  // deliberately not the HUD's: a boss can be one of several things on screen
  // and the words belong over the right one. Node has no `document`, so a
  // headless run gets no plate and everything else still works; `plateText` is
  // pure and is what the tests measure.

  function drawPlate(mon) {
    const cv = mon.plate?.canvas;
    if (!cv) return null;
    const t = plateText(mon.row, mon.actor.health, mon.actor.maxHealth);
    const g = cv.getContext('2d');
    g.clearRect(0, 0, cv.width, cv.height);
    g.textAlign = 'center';
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.fillRect(0, 0, cv.width, cv.height);
    g.fillStyle = '#ffd23a';
    g.font = 'bold 44px serif';
    g.fillText(t.name, cv.width / 2, 52);
    g.fillStyle = '#e8e2d6';
    g.font = '30px serif';
    g.fillText(t.phase, cv.width / 2, 92);
    if (mon.plate.texture) mon.plate.texture.needsUpdate = true;
    mon.plate.text = t;
    return t;
  }

  function makePlate(mon) {
    if (typeof document === 'undefined' || !document.createElement) return null;
    const canvas = document.createElement('canvas');
    canvas.width = 512; canvas.height = 112;
    const texture = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
    sprite.scale.set(3.2, 0.7, 1);
    sprite.position.y = (mon.model?.height || 2) + PLATE_LIFT;
    sprite.renderOrder = 10;
    mon.model.group.add(sprite);
    mon.plate = { canvas, texture, sprite, text: null };
    drawPlate(mon);
    return mon.plate;
  }

  function dropPlate(mon) {
    const p = mon.plate;
    if (!p || !p.sprite) return;
    p.sprite.parent?.remove(p.sprite);
    p.sprite.material?.map?.dispose?.();
    p.sprite.material?.dispose?.();
    mon.plate = null;
  }

  // -- what leaves the hand -------------------------------------------------

  const SHOT_GEO = new THREE.SphereGeometry(PROJECTILE_R, 6, 5);
  const SHOT_MAT = new THREE.MeshBasicMaterial({ color: 0xd8cfae });

  /**
   * A knife, a spike or a boulder, in the air.
   *
   * It reaches the target at exactly PROJECTILE_S, which is combat.js's own
   * SWING_LAND_S, so the number over the head and the thing that caused it
   * arrive together. Whether it HIT is not known when it is thrown: the roll
   * happens in `combat.update`, one call after this one. So the shot notes the
   * defender's health as it leaves, and on the frame after it lands it asks
   * whether that number moved. It did not, so it was a miss, and the knife
   * carries on past the ear instead of stopping in the chest.
   */
  function throwShot(mon, target) {
    const from = mon.actor.pos, to = target.pos;
    const mesh = new THREE.Mesh(SHOT_GEO, SHOT_MAT);
    const y0 = num(from.y) + (mon.model.height || 1) * 0.65;
    const y1 = num(to.y) + 1.0;
    mesh.position.set(num(from.x), y0, num(from.z));
    group.add(mesh);
    const s = {
      mesh, target, life: PROJECTILE_S, t: 0, arrived: false, past: 0, born: lastNow,
      from: { x: num(from.x), y: y0, z: num(from.z) },
      to: { x: num(to.x), y: y1, z: num(to.z) },
      health: num(target.health),
    };
    shots.push(s);
    stats.shots++;
    return s;
  }

  function stepShots(d) {
    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i];
      // not on the frame it left the hand: it is thrown inside the monster loop
      // and this runs at the end of the same update, so stepping it here would
      // make its flight one frame shorter than the blow it travels with.
      if (s.born === lastNow) continue;
      if (!s.arrived) {
        s.t += d;
        const u = clamp(s.t / s.life, 0, 1);
        s.mesh.position.set(
          s.from.x + (s.to.x - s.from.x) * u,
          s.from.y + (s.to.y - s.from.y) * u,
          s.from.z + (s.to.z - s.from.z) * u,
        );
        if (s.t >= s.life) s.arrived = true;
        continue;
      }
      // one frame after arrival the resolver has spoken
      if (s.past === 0 && num(s.target.health) < s.health) { drop(i); continue; }
      s.past += d;
      const dx = s.to.x - s.from.x, dz = s.to.z - s.from.z;
      const len = Math.hypot(dx, dz) || 1;
      const carry = (s.past / s.life) * PROJECTILE_OVERSHOOT_M;
      s.mesh.position.set(s.to.x + (dx / len) * carry, s.to.y, s.to.z + (dz / len) * carry);
      if (carry >= PROJECTILE_OVERSHOOT_M) drop(i);
    }
    function drop(i) {
      const s = shots[i];
      s.mesh.parent?.remove(s.mesh);
      shots.splice(i, 1);
    }
  }

  // -- the ground slam ------------------------------------------------------

  const RING_GEO = new THREE.RingGeometry(SLAM_RADIUS * 0.9, SLAM_RADIUS, 40);
  const RING_MAT = new THREE.MeshBasicMaterial({ color: 0xff6a3a, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });

  /**
   * A ring on the floor for SLAM_WARN_S, then everything still standing in it.
   *
   * It goes out through `combat.queueSpell` and not `queueSwing`, and the
   * reason is worth writing down: `combat.landSwing` throws away any blow whose
   * distance has grown past `reachBetween * REACH_SLACK`, which for a boss is
   * under five metres, so a six metre slam queued as a swing would be silently
   * binned for every target but the one under its feet. queueSpell has no reach
   * gate and takes an exact `travel`. The cost is that `resolveSpell` has no
   * armour term, so a slam is not reduced by AR: the ground going out from
   * under you is not a thing a breastplate stops, and it is said here rather
   * than discovered later.
   */
  function startSlam(mon, at) {
    const s = { mon, x: num(at.x), z: num(at.z), y: num(at.y), t: 0, mesh: null };
    const mesh = new THREE.Mesh(RING_GEO, RING_MAT.clone());
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(s.x, s.y + 0.06, s.z);
    group.add(mesh);
    s.mesh = mesh;
    slams.push(s);
    stats.slams++;
    say(`${mon.name} brings it down where you are standing. Move.`);
    return s;
  }

  function stepSlams(d, playerActor) {
    for (let i = slams.length - 1; i >= 0; i--) {
      const s = slams[i];
      s.t += d;
      const u = clamp(s.t / SLAM_WARN_S, 0, 1);
      s.mesh.material.opacity = 0.25 + 0.45 * u;
      if (s.t < SLAM_WARN_S) continue;
      s.mesh.parent?.remove(s.mesh);
      s.mesh.material.dispose();
      slams.splice(i, 1);
      const row = s.mon.row;
      const spell = { base: [row.damage[0], row.damage[1]], damageType: 'physical', id: 'slam', name: 'the slam' };
      const caught = [];
      for (const who of [playerActor, ...[...live.values()].map((m) => m.actor)]) {
        if (!who || who === s.mon.actor || num(who.health) <= 0) continue;
        if (who.kind !== 'player') continue;                 // the boss's own do not take it
        if (Math.hypot(num(who.pos.x) - s.x, num(who.pos.z) - s.z) > SLAM_RADIUS) continue;
        caught.push(who);
        combat?.queueSpell?.(s.mon.actor, spell, who, { now: lastNow, travel: 0 });
      }
      say(caught.length ? 'The floor comes up and catches you.' : 'The floor comes up where you were.');
    }
  }

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
      if (mon.ephemeral) continue;             // a summon or a bench spawn is not in the roll and is not the sweep's to take
      despawn(key);
    }
    for (const w of keep) if (!live.has(w.rec.key)) spawn(w.rec);
  }

  // -- underground ----------------------------------------------------------
  //
  // A level is not streamed. It is small enough to hold whole, so the roll
  // happens once when you arrive and again only when the level changes. The
  // keys carry the site and the depth and the room, which is what makes a room
  // you cleared before you took the stair down still clear when you climb back
  // up: `deadUntil` matched it, and `deadUntil` is the character's own list.

  /** null above ground, "siteId:level" below it. Two reads, no allocation. */
  function layerKeyNow() {
    if (!runtime?.inDungeon) return null;
    return `${runtime.dungeonSite?.id ?? '?'}:${runtime.dungeonLevel ?? 0}`;
  }

  /** `{ rooms, level, bottom, ... }` for the level you are standing in, or null. */
  function levelLayout() {
    if (!runtime?.inDungeon) { levelL = null; return null; }
    const raw = typeof runtime.dungeonLayout === 'function' ? runtime.dungeonLayout() : null;
    levelL = raw ? normalizeDungeonLayout(raw, {
      siteId: runtime.dungeonSite?.id,
      level: runtime.dungeonLevel,
    }) : null;
    if (!levelL && raw) warnOnce('monsters: runtime.dungeonLayout() has no room grid, so no dungeon layer (see docs/mmo/wiring/G3.md)');
    else if (!raw) warnOnce('monsters: runtime.dungeonLayout() is missing, so no dungeon layer (see docs/mmo/wiring/G3.md)');
    return levelL;
  }

  let warned = false;
  function warnOnce(text) {
    if (warned) return;
    warned = true;
    console.warn(text);
  }

  /** Identity above ground, the nearest floor cell below it. Every step asks. */
  const clampXZ = (x, z) => (typeof runtime?.clampWalkable === 'function' ? runtime.clampWalkable(x, z) : [x, z]);

  function buildLevel(L) {
    levelRecs = L ? dungeonSpawns(L, { seed: num(field?.seed) }) : [];
    return levelRecs;
  }

  function dungeonRescan(px, pz) {
    const wanted = [];
    for (const rec of levelRecs) {
      if (stillDead(rec, { x: px, z: pz })) continue;
      wanted.push({ rec, d2: (rec.x - px) ** 2 + (rec.z - pz) ** 2 });
    }
    wanted.sort((a, b) => a.d2 - b.d2 || (a.rec.key < b.rec.key ? -1 : 1));
    const room = opts.dungeonCap ?? DUNGEON_CAP;
    const keep = wanted.slice(0, room);
    stats.capped = wanted.length - keep.length;
    const keepKeys = new Set(keep.map((w) => w.rec.key));
    for (const [key, mon] of [...live]) {
      if (keepKeys.has(key) || mon.ephemeral) continue;
      if (mon.actor.ai?.target) continue;
      despawn(key);
    }
    for (const w of keep) if (!live.has(w.rec.key)) spawn(w.rec);
  }

  /** Everything goes: a level left, a level entered, or the surface come back. */
  function clearLayer() {
    for (const key of [...live.keys()]) despawn(key);
    for (let i = shots.length - 1; i >= 0; i--) { shots[i].mesh.parent?.remove(shots[i].mesh); }
    shots.length = 0;
    for (const s of slams) { s.mesh.parent?.remove(s.mesh); s.mesh.material.dispose(); }
    slams.length = 0;
    chunks.clear();
    levelRecs = [];
    levelL = null;
    lastChunk = null; lastNight = null; lastScan = -1e9;
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

    // Which layer is this? Above ground it is the streamed ring; below it is
    // one level, held whole. A change of either direction empties the other,
    // because the overworld's monsters are standing at coordinates directly
    // over your head and stepping them would walk a wolf through the roof.
    // The key is two cheap reads and is asked every frame; the layout itself is
    // read, normalised and rolled only when the key moves.
    const wantKey = layerKeyNow();
    if (wantKey !== layerKey) {
      clearLayer();
      layerKey = wantKey;
      if (wantKey != null) buildLevel(levelLayout());
    }
    group.visible = true;

    const px = num(playerActor?.pos?.x), pz = num(playerActor?.pos?.z);
    const under = runtime?.inDungeon;

    if (under) {
      // A level with no layout to read is not guessed at: the layer stays empty
      // and G3.md names the one export world_runtime.js has to add.
      if (levelRecs.length && playerActor && (lastNow - lastScan >= SCAN_MS || lastScan < 0)) {
        lastScan = lastNow;
        dungeonRescan(px, pz);
      }
    } else if (playerActor && field) {
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

      // What came off it since the last frame, which is what breaks a cast.
      const took = Math.max(0, num(mon.lastHealth) - num(a.health));
      mon.lastHealth = num(a.health);
      if (mon.boss) stepBoss(mon, d, playerActor);

      const settled = a.ai && a.ai.target && num(a.ai.target.health) > 0 ? a.ai.target : playerActor;
      const res = stepMonster(a, d, {
        player: playerActor, now: lastNow, heightAt,
        allies: typeof opts.allies === 'function' ? opts.allies() : undefined,
        clampXZ: under ? clampXZ : undefined,
        // the reach to whoever it settled on, not always the player: a wolf on
        // the dragon measures its bite against the dragon's body
        reach: combat ? combat.reachBetween(a, settled || a) : undefined,
        mode: mon.mode,
        flying: mon.flyer,
        rng,
      });
      mon.cornered = !!res.cornered;
      if (!before && a.ai.target) alertGroup(mon, a.ai.target);

      mon.model.group.position.set(a.pos.x, a.pos.y, a.pos.z);
      mon.model.group.rotation.y = num(a.yaw);
      const speed = d > 0 ? res.moved / d : 0;
      mon.lastSpeed = speed;

      const onPlayer = combat && playerActor && a.ai.target === playerActor;
      stepCast(mon, took, res, playerActor, onPlayer);

      if (res.wantSwing && onPlayer) {
        const ranged = mon.mode === 'thrown' || mon.mode === 'shot';
        const swing = combat.queueSwing(a, playerActor, { now: lastNow, poison: mon.poison || undefined });
        if (swing.queued) {
          mon.model.setAnim('swing');
          if (ranged) throwShot(mon, playerActor);
        }
      }
      // the animation follows the actor, which combat.js writes on a hit
      if (a.anim === 'hurt' && mon.model.anim !== 'hurt') { mon.model.setAnim('hurt'); a.anim = res.state === 'idle' ? 'idle' : 'walk'; }
      else if (mon.cast) mon.model.setAnim('cast');
      else if (mon.model.anim !== 'swing' && mon.model.anim !== 'hurt') {
        mon.model.setAnim(speed > 0.15 ? (speed > num(a.run) * 0.75 ? 'run' : 'walk') : 'idle');
      }
      mon.model.update(d, speed);
      if (mon.plate) mon.plate.sprite.position.y = (mon.model.height || 2) + PLATE_LIFT;
    }

    stepShots(d);
    stepSlams(d, playerActor);
    stepCorpses(d);
  }

  /**
   * One frame of a cast. A cast is started when the AI asks for one and the
   * row's own swing rhythm allows it, held for the spell's seconds with the
   * model in its cast pose, and broken by a single blow worth more than a tenth
   * of the caster's health, which is 04-CLASSES-ABILITIES' rule for the player
   * and is not given a second, softer version here.
   */
  function stepCast(mon, took, res, playerActor, onPlayer) {
    if (!combat) return;
    if (mon.cast) {
      if (num(mon.actor.health) <= 0 || !onPlayer) { mon.cast = null; return; }
      if (castBroken(took, mon.actor.maxHealth)) {
        stats.interrupted++;
        say(`${mon.name} loses the words.`);
        mon.cast = null;
        mon.model.setAnim('hurt');
        return;
      }
      if (lastNow < mon.cast.until) return;
      const spell = mon.cast.spell;
      const target = mon.cast.target;
      mon.cast = null;
      if (!target || num(target.health) <= 0) return;
      if (spell.cone) {
        // "hitting everything in a 6 m cone": the cone is aimed where the thing
        // is facing, and it is measured, not assumed.
        const caught = coneTargets(mon.actor.pos, mon.actor.yaw, spell.cone.range, spell.cone.halfAngle, [target]);
        for (const who of caught) combat.queueSpell(mon.actor, spell, who, { now: lastNow, travel: 0, poison: mon.poison || undefined });
        say(caught.length ? `${mon.name} breathes, and it catches you.` : `${mon.name} breathes, and you are out of it.`);
      } else {
        combat.queueSpell(mon.actor, spell, target, { now: lastNow, travel: spell.travel, poison: mon.poison || undefined });
      }
      return;
    }
    if (!res.wantCast || !onPlayer || !mon.spell) return;
    // the row's tabled speed is its casting rhythm too, so no second number
    const wait = num(mon.actor.lastSwingAt) + swingSeconds(mon.actor) * 1000 - lastNow;
    if (Number.isFinite(mon.actor.lastSwingAt) && wait > 0) return;
    mon.actor.lastSwingAt = lastNow;
    mon.cast = { until: lastNow + mon.spell.seconds * 1000, spell: mon.spell, target: playerActor };
    mon.actor.anim = 'cast';
    mon.model.setAnim('cast');
    stats.casts++;
    say(`${mon.name} begins ${mon.spell.name}.`);
  }

  /**
   * A boss crossing a threshold. `BOSS_PHASES` gives 66% and 33%; the behaviour
   * at each and the line it says are `monster_ai.BOSS_PLANS`. A phase fires
   * once and only once, and it says so out loud, because a boss that quietly
   * doubled its swing speed would read as the game misbehaving.
   */
  function stepBoss(mon, d, playerActor) {
    const a = mon.actor;
    const want = phaseIndexFor(mon.row, a.health, a.maxHealth);
    while (mon.phase < want) {
      const step = mon.plan[mon.phase];
      mon.phase++;
      if (!step) break;
      stats.phases++;
      say(step.line, 'bad');
      if (mon.plate) drawPlate(mon);
      if (step.kind === 'enrage') {
        a.bonuses = a.bonuses || {};
        a.bonuses.swingSpeed = num(a.bonuses.swingSpeed) + ENRAGE_SWING;
      } else if (step.kind === 'summon') {
        summonFor(mon);
      } else if (step.kind === 'slam') {
        mon.slamAt = lastNow;                    // the first one goes now
      } else if (step.kind === 'retreat') {
        mon.retreatUntil = lastNow + RETREAT_SECONDS * 1000;
        a.ai.state = 'flee';
        a.ai.fleeFrom = a.ai.target || playerActor;
        a.ai.target = null;
      }
    }
    if (mon.retreatUntil > lastNow && combat?.heal) combat.heal(a, RETREAT_HEAL_PS * d, { quiet: true });
    if (mon.retreatUntil && lastNow >= mon.retreatUntil) {
      mon.retreatUntil = 0;
      if (a.ai.state === 'flee') { a.ai.state = 'return'; a.ai.fleeFrom = null; }
    }
    if (mon.slamAt && lastNow >= mon.slamAt && playerActor && num(playerActor.health) > 0
        && dist2D(a.pos, playerActor.pos) <= SLAM_RADIUS * 2.5) {
      mon.slamAt = lastNow + SLAM_EVERY_S * 1000;
      startSlam(mon, playerActor.pos);
    }
  }

  /**
   * "a summon of its habitat's minions". They are the level's own roster, put
   * down in a ring around the boss, and they are `ephemeral`: they never go
   * into the character's dead list, because they were never a slot in the
   * world's roll and an entry for them would sit in the save matching nothing.
   */
  function summonFor(mon) {
    const habitat = levelL ? dungeonHabitat(levelL.kind, levelL.level) : 'dungeon3';
    const list = (HABITAT[habitat]?.night || []).filter((id) => MONSTERS[id] && !MONSTERS[id].boss);
    if (!list.length) return 0;
    let made = 0;
    for (let i = 0; i < SUMMON_COUNT; i++) {
      const id = list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
      const ang = (i / SUMMON_COUNT) * Math.PI * 2 + rng();
      let x = num(mon.actor.pos.x) + Math.cos(ang) * SUMMON_RING_M;
      let z = num(mon.actor.pos.z) + Math.sin(ang) * SUMMON_RING_M;
      if (runtime?.inDungeon) { const c = clampXZ(x, z); x = num(c[0]); z = num(c[1]); }
      const rec = {
        id, key: `${mon.key}:summon:${stats.summoned + i}`, groupKey: `${mon.key}:summon`,
        x, z, y: heightAt(x, z), cx: 0, cz: 0, i, night: false, ephemeral: true, underground: !!runtime?.inDungeon,
      };
      if (spawn(rec)) made++;
    }
    stats.summoned += made;
    say(made ? `${made} of them come out of the dark.` : 'Nothing answers.');
    return made;
  }

  function stepCorpses(d) {
    for (let i = corpses.length - 1; i >= 0; i--) {
      const c = corpses[i];
      c.t += d;
      if (c.t < CORPSE_LINGER_S) c.mon.model.update(d, 0);   // the topple; then it lies still
      if (c.t >= CORPSE_KEEP_S) { c.mon.model.dispose(); corpses.splice(i, 1); }
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
    /** Dead bodies within r of pos, nearest first: { key, id, actor, row, pos, skinned }. */
    corpsesNear(pos, r = 3) {
      const out = [];
      for (const c of corpses) {
        const d = Math.hypot(c.pos.x - pos.x, c.pos.z - pos.z);
        if (d <= r) out.push({ c, d });
      }
      return out.sort((a, b) => a.d - b.d).map((e) => e.c);
    },
    /** The corpse under the ray, or null. */
    pickCorpse(raycaster) {
      if (!raycaster || !corpses.length) return null;
      const hits = raycaster.intersectObjects(corpses.map((c) => c.mon.model.group), true);
      for (const h of hits) {
        let o = h.object;
        while (o && !o.userData.monster) o = o.parent;
        const mon = o && o.userData.monster;
        const c = mon && corpses.find((x) => x.mon === mon);
        if (c) return c;
      }
      return null;
    },
    corpses: () => corpses.slice(),
    /** The dev bench's Clear spawned: every dev: keyed body goes, no corpse, no sack, no dead list entry. */
    despawnDev() {
      let n = 0;
      for (const key of [...live.keys()]) if (key.startsWith('dev:')) { despawn(key); n++; }
      return n;
    },
    /** The dev bench: one monster of this id at x, z, outside the world's own roll. */
    spawnAt(id, x, z) {
      if (!MONSTERS[id]) return null;
      devSpawnN++;
      const key = `dev:${id}:${devSpawnN}`;
      return spawn({ id, x, z, key, groupKey: key, ephemeral: true });
    },
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
    rescan(px, pz, night) {
      if (runtime?.inDungeon) {
        const key = layerKeyNow();
        if (key !== layerKey) { clearLayer(); layerKey = key; buildLevel(levelLayout()); }
        dungeonRescan(px, pz);
        return;
      }
      if (layerKey != null) { clearLayer(); layerKey = null; }
      if (field) rescan(px, pz, !!night);
    },

    /**
     * A swing at a monster, with the monster's weaknesses on it.
     *
     * THE ONE CALL main.js AND abilities_runtime.js HAVE TO SWAP IN. Everything
     * a swing already carried is passed straight through; the only thing added
     * is `multiplier`, which `combat.landSwing` puts back through
     * `combat_rules.damage` with the same roll and the same crit. There is no
     * second damage formula here and there is no arithmetic: the multiplier is
     * read off `defender.vulnerability`, which `actor.js` built and which
     * nothing else in the tree was reading.
     */
    swingAt(attacker, defender, o = {}) {
      if (!combat) return { queued: false, reason: 'no_combat' };
      const w = weaknessMultiplier(attacker, defender, o);
      const mult = num(o.multiplier) || 1;
      return combat.queueSwing(attacker, defender, w === 1 ? o : { ...o, multiplier: mult * w });
    },
    /** The same number on its own, for a caller that queues its own swing. */
    weaknessMultiplier,

    /** What is in the air right now: the shots, for the tests and the overlay. */
    projectiles: () => shots.map((s) => ({
      t: s.t, life: s.life, arrived: s.arrived, past: s.past,
      pos: { x: s.mesh.position.x, y: s.mesh.position.y, z: s.mesh.position.z },
      to: { ...s.to },
    })),
    /** The warning rings on the floor, and how long each has left. */
    warnings: () => slams.map((s) => ({ x: s.x, z: s.z, radius: SLAM_RADIUS, left: Math.max(0, SLAM_WARN_S - s.t) })),
    /** The level's roll as records, before the cap. Empty above ground. */
    levelSpawns: () => levelRecs.slice(),
    /** Which layer is standing: null above ground, "siteId:level" below it. */
    get layer() { return layerKey; },

    dispose() {
      offDeath?.();
      for (const key of [...live.keys()]) despawn(key);
      for (const c of corpses) c.mon.model.dispose();
      corpses.length = 0;
      for (const s of shots) s.mesh.parent?.remove(s.mesh);
      shots.length = 0;
      for (const s of slams) { s.mesh.parent?.remove(s.mesh); s.mesh.material.dispose(); }
      slams.length = 0;
      chunks.clear();
      levelRecs = [];
      scene?.remove?.(group);
    },
  };
}

// What `monsters.test.mjs` and the debug overlay reach for without having to
// know that the AI moved into its own file. One import, one surface.
export {
  attackModeOf, isRanged, isFlyer, isBoss, spellFor, coneTargets, castBroken,
  hoverHeight, approachHeight, bossPlanFor, phaseIndexFor, plateText,
  weaknessMultiplier, dungeonSpawns, normalizeDungeonLayout, dungeonHabitat,
  rangedWeaponFor, groupsForRoom, bossRowsFor, auditRangedRows,
  RANGED_NEAR, RANGED_FAR, RANGED_BACKOFF, SWOOP_SECONDS,
  ENRAGE_SWING, SLAM_WARN_S, SLAM_RADIUS, SUMMON_COUNT,
} from './monster_ai.js';
