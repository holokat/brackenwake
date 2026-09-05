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
  MONSTERS, HABITAT, HABITAT_BY_PLACE, spawnRollFor, resolvePlace, respawnDelay,
  NO_RESPAWN_RADIUS, SPAWN_SPACING_M, NOTE_TAGS,
} from '../mmo/monsters.js';
import { aggroCheck, leashCheck, fleeCheck, swingSeconds, UNARMED } from '../mmo/combat_rules.js';
import { buildMonsterModel, DIE_SECONDS } from './monster_models.js';
import { SWING_LAND_S, actorDistance } from './combat.js';
import {
  attackModeOf, isFlyer, isBoss, rangedWeaponFor, spellFor, coneTargets,
  castBroken, hoverHeight, approachHeight, bossPlanFor, phaseIndexFor, plateText,
  weaknessMultiplier, dungeonSpawns, normalizeDungeonLayout, dungeonHabitat,
  RANGED_FAR, RANGED_BACKOFF, CORNER_MOVE_FRACTION, CORNER_SECONDS, UNCORNER_M,
  SWOOP_SECONDS, HOVER_HZ, ENRAGE_SWING, SUMMON_COUNT, SUMMON_RING_M,
  SLAM_WARN_S, SLAM_RADIUS, RETREAT_HEAL_PS, RETREAT_SECONDS,
  STORM_WARN_S, STORM_RADIUS, POWDER_WARN_S, POWDER_RADIUS, POWDER_EVERY_S,
} from './monster_ai.js';

// --------------------------------------------------------------- constants

export const NEAR_RING = 3;          // chunks each way that may hold monsters, as fauna
export const ALIVE_CAP = 80;         // never more than this many bodies at once; 40 read as an empty world
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
/**
 * A world animal (temperament `critter`, aggro 0) bolts when you come this
 * close, before you touch it: a deer that stands while you walk up and swing
 * is a target dummy, not a deer. The flee is the same `flee` state a hurt
 * thing takes, so it breaks at FLEE_BREAK_M and walks home the same way, and a
 * bird in it is in the air (see BIRD_BAND). Measured in monsters.test.mjs.
 */
export const SPOOK_M = 7;
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

// -- the twenty one tags of wave A ------------------------------------------
//
// Every number below is `docs/mmo/wiring/M2.md` section 2's, and where M2 gives
// none it says INVENTED and why. Nothing here is a second copy of a number that
// already lives in `monster_ai.js`: the slam's radius, the swoop's seconds, the
// summon ring and the storm's warning are all imported from there.
//
// THE RULE ALL OF THEM SHARE: a tag that changes state says a line. An audit of
// this project's own story system found fifty silent effects and this is the
// answer to it. `say` is the one door and it is not optional.

/** `shieldWall`: metres, and how many of a row it takes. The roster's own words. */
export const WALL_M = 4;
export const WALL_MIN = 2;
/** Armour rating each of them gains while the wall holds. M2's +10. */
export const WALL_AR = 10;

/** `healsAllies`: metres the chant reaches. */
export const HEAL_ALLIES_M = 8;

/** `howl`: metres it calls across, once, the first time it is hurt. */
export const HOWL_M = 30;

/** `dives`: seconds between stoops, and the metres of gap that earns one. */
export const DIVE_EVERY_S = 6;          // INVENTED: M2 gives no cadence
export const DIVE_TRIGGER_M = 8;        // M2's "more than 8 m from its target"
export const DIVE_MULT = 2;             // M2's "one blow at double damage"

/**
 * `grab`: one blow in four takes hold.
 *
 * SECONDS: M2 section 2 writes 3 s in its own sentence and then says the rule
 * "is `webRoot2` with damage on it and it should reuse that root". `webRoot2`
 * is two seconds by its own name and by NOTE_TAG_MEANING's words for it, and
 * the M3 brief asks for two, so two is what this is. One constant to change if
 * the three was meant literally.
 */
export const GRAB_CHANCE = 0.25;
export const GRAB_SECONDS = 2;

/** `ambush`: metres of approach that reveals it, and what its first blow is worth. */
export const AMBUSH_M = 6;
export const AMBUSH_MULT = 2;

/**
 * `awakens`: metres. Four, which is NOTE_TAG_MEANING's own "never aggros at all
 * until you come inside four metres of it" and M2's. The M3 brief says eight;
 * the roster is the source of truth for a number the roster states.
 */
export const AWAKEN_M = 4;

/** `burrows`: seconds under, seconds between, and how far out it comes up. */
export const BURROW_EVERY_S = 12;
export const BURROW_UNDER_S = 2;
export const BURROW_MIN_M = 5;          // it only goes under if the gap is this wide
export const BURROW_OUT_M = 3;          // and comes up inside this of the target

/** `dropsFromAbove`: metres up it waits, and how near underneath sets it off. */
export const DROP_HEIGHT_M = 6;
export const DROP_UNDER_M = 2.5;
/** Metres a second it comes down. INVENTED; six metres in half a second.
 *  It takes NO fall damage, which is M2's own word: nothing calls applyFall. */
export const DROP_FALL_MPS = 12;

/** `hex`: seconds of cooldown, skill points off the target's hit, seconds held. */
export const HEX_EVERY_S = 15;
export const HEX_POINTS = 15;
export const HEX_SECONDS = 10;

/** `ashCloud`: the same shape on a landed blow rather than on a cast. */
export const ASH_POINTS = 20;
export const ASH_SECONDS = 6;

/** `tailSweep`: every fourth swing, and the cone it opens. M2's 4 m and 90 degrees. */
export const SWEEP_EVERY = 4;
export const SWEEP_RANGE = 4;
export const SWEEP_HALF_ANGLE = Math.PI / 4;    // 45 degrees each side is a 90 degree cone

/**
 * `dragonTime`: Malachar, and nothing else, ever.
 *
 * Above the last threshold his swing timer runs at half its seconds and his
 * approach at one and a half times, which are both his own actor's numbers and
 * are applied here. Below it the world slows instead, and THIS FILE DOES NOT DO
 * THAT: the world clock is `app/context.js`'s and the wyrmsoul system owns it.
 * `monsters.wantsPlayerSlow()` is the hook it reads. See M3.md.
 */
export const DRAGON_SWING = 0.5;        // fraction off his swing timer
export const DRAGON_RUN = 1.5;          // multiplier on his approach
export const DRAGON_PLAYER_SCALE = 0.5; // the fraction wantsPlayerSlow asks for

/** Seconds a row that carries `summons` and is not a boss waits before calling. */
export const SUMMON_AT = 0.5;           // M2's "the first time it drops below half health"
export const SUMMON_COOLDOWN_S = 30;    // INVENTED: M2 says once, this is the guard on "once"

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
  // A NAMED PLACE FIRST. The field's sample carries the deepest zone at the
  // point, and the roster's HABITAT_BY_PLACE is keyed by those same realms.js
  // ids, so the Kingsroad spawns Legion patrols and the Beech Hangar spawns
  // boar because the sheet says so, not because the ground is a meadow. Before
  // this line the eighty three place tables were written and read by nothing.
  const zone = typeof field.sampleAt === 'function' ? field.sampleAt(x, z)?.zone : null;
  if (zone && HABITAT_BY_PLACE[zone]) return zone;
  for (const s of sites || []) {
    if (!s) continue;
    const r = (s.flatR != null ? s.flatR : 14) + 10;
    if (dist2D(s, { x, z }) > r) continue;
    if (s.kind === 'ruin') return 'ruin';
    if (s.kind === 'cave') return 'cave';
    // A3's wild structures. A graveyard and a burned farm read as the tables
    // they already have; a bandit camp, an arena and a tomb have their own.
    if (s.kind === 'bandit_camp') return 'bandit_camp';
    if (s.kind === 'arena') return 'arena';
    if (s.kind === 'tomb') return 'tomb';
    if (s.kind === 'graveyard') return 'graveyard';
    if (s.kind === 'burned_farm') return 'ruin';
    if (s.kind === 'castle') return 'ruin';
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
  // An authored place's table is deliberate (wolves at night in the Beech
  // Hangar, the Legion on the Kingsroad), so the realm's band does not cut it;
  // open country between the places keeps the cap.
  const band = HABITAT_BY_PLACE[place] ? null : (field.sampleAt(x0 + mid, z0 + mid).danger || null);
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

  // -- is it in the world yet -----------------------------------------------
  //
  // `dormant` is the runtime saying this one has not started existing as far as
  // a player is concerned: an ambusher still down in the reeds, a spider still
  // on the branch, a statue in a niche you have walked past twice, a sandworm
  // under the sand. It does not turn on anything, it does not drift, and it
  // holds exactly where it was put, which is the whole point of all four.
  //
  // The runtime owns the trigger (six metres, four metres, standing underneath
  // it, two seconds of being buried) because only the runtime knows where every
  // body is. The moment it clears the flag the row's OWN aggro radius takes
  // over with nothing else changed, so there is one aggro rule and not two.
  if (ctx.dormant) {
    ai.target = null;
    ai.leashSince = null;
    ai.state = 'dormant';
    out.state = 'dormant';
    if (player) out.dist = ctx.flying ? dist2D(m.pos, player.pos) : actorDistance(m, player);
    return out;
  }

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
    // A BIRD PERCHES. A bat hangs in the air because a bat is a fight; a gull
    // stands on the sand until something walks at it, and takes off when it
    // does. `ctx.perches` is true for a tier 0 flyer and false for everything
    // else, so a harpy is untouched by this. `ctx.hoverBand` is the height a
    // perching bird flies at once it is up, well above a sword's reach, since
    // a gull that circles at three metres reads as a gull that cannot be
    // bothered. See docs/mmo/wiring/F1.md section 4.
    const band = ctx.hoverBand || null;
    if (ai.alt == null) ai.alt = ctx.perches ? 0 : hoverHeight(0, false);
    ai.hoverT = num(ai.hoverT) + d;
    if (ai.state === 'attack') ai.swoopUntil = now + SWOOP_SECONDS * 1000;
    const swooping = num(ai.swoopUntil) > now;
    const settled = !!ctx.perches && !ai.target && ai.state !== 'flee' && ai.state !== 'return';
    let want;
    if (swooping || settled) want = 0;
    else if (band) want = band[0] + (band[1] - band[0]) * (0.5 + 0.5 * Math.sin(num(ai.hoverT) * HOVER_HZ * Math.PI * 2));
    else want = hoverHeight(ai.hoverT, false);
    ai.alt = approachHeight(ai.alt, want, d);
    m.pos.y = ground + ai.alt;
    out.altitude = ai.alt;
    out.perched = settled && ai.alt <= 0.01;
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
/**
 * The height band a perching bird flies in once it is up, in metres over the
 * ground: six to twelve, so a spooked gull is out of a sword's reach and reads
 * as a bird in the air and not a bat. A tier 0 flyer gets this; every other
 * flyer keeps monster_ai's hoverHeight band. See docs/mmo/wiring/F1.md.
 */
export const BIRD_BAND = [6, 12];

export function createMonsters(sc, runtime, opts = {}) {
  const scene = sc && sc.scene ? sc.scene : sc;
  const group = new THREE.Group();
  group.name = 'monsters';
  scene?.add?.(group);

  const field = runtime?.field;
  const rng = typeof opts.rng === 'function' ? opts.rng : Math.random;
  const combat = opts.combat || null;
  const loot = opts.loot || null;
  /**
   * effects.js, when a caller hands one in. GARNISH ONLY, and deliberately so:
   * every call to it below is optional-chained, nothing reads a return value,
   * and the rule each one decorates is complete without it. `app/systems/
   * combat.js` does not pass one today; M3.md carries the one line that would.
   */
  const effects = opts.effects || null;
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
  const playerCharacter = (opts.character && typeof opts.character === 'object') ? opts.character : null;   // L1: the class the drops steer toward

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
  const marks = [];             // a ring on the ground, and what happens under it
  const blows = [];             // swings in the air, and whether they landed
  const grabs = [];             // what a kraken is holding, and until when
  const penalties = [];         // hexes and ash clouds, and when each comes off
  const wallOn = new Set();     // row ids whose shield wall is up, so it says so once
  let lastScan = -1e9, lastChunk = null, lastNight = null;
  let lastNow = 0;
  // null above ground, "siteId:level" below it. A change is a whole new layer.
  let layerKey = null;
  let levelRecs = [];
  let levelL = null;            // the normalised layout of the level standing
  const stats = {
    alive: 0, spawned: 0, despawned: 0, killed: 0, capped: 0, chunks: 0,
    shots: 0, casts: 0, interrupted: 0, slams: 0, summoned: 0, phases: 0,
    // wave A. Every one of these is incremented by exactly one branch below and
    // is what monsters.test.mjs counts instead of taking a mechanism on trust.
    marks: 0, storms: 0, charges: 0, dives: 0, grabs: 0, sweeps: 0,
    hexes: 0, ambushes: 0, wakings: 0, burrows: 0, howls: 0, heals: 0, walls: 0,
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

    const tags = new Set(row.notes || []);
    const mon = {
      key: rec.key, rec, row, actor, model, id: rec.id, name: row.name,
      poison: poisonLevelOf(row), shares: sharesAggro(row),
      groupKey: rec.groupKey, lastSpeed: 0,
      mode, flyer: isFlyer(row), boss: isBoss(row), spell: spellFor(row),
      cast: null, lastHealth: num(actor.health),
      phase: 0, plan: isBoss(row) ? bossPlanFor(row) : [], plate: null,
      slamAt: 0, retreatUntil: 0, ephemeral: !!rec.ephemeral,
      // --- wave A's tags. One record per monster, every clock zeroed, so no
      // branch below ever reads undefined and no tag can half exist.
      tags,
      wall: 0,                  // armour currently lent by a shield wall
      swings: 0,                // for tailSweep, which is every fourth
      diving: false, diveAt: 0, diveUntil: 0,
      hexAt: 0, powderAt: 0,
      howled: false,
      summonReady: true, summonAt: 0,
      hidden: false, dormant: false,
      burrowAt: 0, burrowUntil: 0,
      ambushBlow: false,
      aloft: 0,                 // metres above the floor it is still hanging
      dragonOn: false, playerSlow: false,
    };
    if (mon.boss) mon.plate = makePlate(mon);

    // The four tags that decide what a monster IS before a player ever sees it.
    // `dormant` is stepMonster's flag: no aggro, no drift, no wander.
    if (tags.has('ambush')) { mon.dormant = true; setHidden(mon, true); }
    else if (tags.has('awakens')) { mon.dormant = true; }
    else if (tags.has('dropsFromAbove')) {
      mon.dormant = true;
      mon.aloft = DROP_HEIGHT_M;
      actor.pos.y = y + DROP_HEIGHT_M;
      model.group.position.y = y + DROP_HEIGHT_M;
    }
    // Malachar's own half speed swing and his one and a half times approach are
    // on from the first frame and come off at his last threshold. See stepBoss.
    if (tags.has('dragonTime')) dragonTime(mon, true);
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
    // A body that stops existing gives back everything it had lent or taken.
    if (mon.wall) { mon.actor.ar = num(mon.actor.ar) - mon.wall; mon.wall = 0; }
    mon.playerSlow = false;
    for (let i = grabs.length - 1; i >= 0; i--) {
      if (grabs[i].mon !== mon) continue;
      releaseGrab(grabs.splice(i, 1)[0], null);
    }
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

    // the player's own character steers the roll toward what they practise (L1);
    // a kill by the dragon or by another monster is nobody's class and spends no unique
    const drop = loot?.rollFor ? loot.rollFor(mon.row, { luck: num(killer?.bonuses?.luck), seed: hashKey(mon.key), character: killer?.kind === 'player' ? playerCharacter : null }) : null;
    const bag = drop && loot?.drop ? loot.drop(mon.actor.pos, drop) : null;
    if (killer && killer.kind === 'player') {
      say(bag
        ? `the ${mon.name.toLowerCase()} goes down, and leaves a sack`
        : `the ${mon.name.toLowerCase()} goes down, and leaves nothing`);
    }

    // M2: "the summoned monsters ... are cleaned up with their summoner's
    // group, not left standing". A ring of wisps still circling a dead witch is
    // a fight that never ends, and they were never a slot in the world's roll.
    const mine = `${mon.key}:summon`;
    const orphans = [...live.values()].filter((m) => m.groupKey === mine);
    for (const m of orphans) despawn(m.key);
    if (orphans.length) {
      say(`What ${mon.name} called goes out with ${orphans.length === 1 ? 'it' : 'them'}. ${orphans.length} of them.`);
    }
    // Anything it was holding or had lent: the hold on your legs, the points off
    // your hit, and Malachar's claim on your clock.
    for (let i = grabs.length - 1; i >= 0; i--) {
      if (grabs[i].mon !== mon) continue;
      const g = grabs.splice(i, 1)[0];
      releaseGrab(g, `${mon.name} lets go of you as it goes down.`);
    }
    mon.playerSlow = false;
    if (mon.wall) { mon.actor.ar = num(mon.actor.ar) - mon.wall; mon.wall = 0; }
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

  // -- what lands on the ground and waits ------------------------------------
  //
  // Three things in the game are the same machine: a boss's ground slam, the
  // reef eel's and the storm wyvern's `stormCall`, and the Legion Sapper's
  // `powderCharge`. Each of them puts a ring on the floor, waits a stated
  // number of seconds, and then hits whatever is still standing in it. They
  // differ in radius, in how long the warning is, in the damage type and in
  // what is said, and in nothing else, so there is one implementation and three
  // specs rather than three copies of the same twenty lines.
  //
  // Every one goes out through `combat.queueSpell` and not `queueSwing`, for
  // the reason written on `startSlam` before this was generalised: `landSwing`
  // bins a blow whose distance has grown past `reachBetween * REACH_SLACK`, so
  // a six metre ring queued as a swing would be silently thrown away for every
  // target but the one under its feet. The cost is that `resolveSpell` has no
  // armour term, so none of the three is reduced by AR.

  const RING_GEO = new THREE.RingGeometry(SLAM_RADIUS * 0.9, SLAM_RADIUS, 40);
  const RING_MAT = new THREE.MeshBasicMaterial({ color: 0xff6a3a, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false });

  /** The slam, unchanged: a boss's own weight, physical, six metres, one second. */
  const SLAM_SPEC = {
    id: 'slam', name: 'the slam', radius: SLAM_RADIUS, warn: SLAM_WARN_S,
    damageType: 'physical', colour: 0xff6a3a, stat: 'slams',
    warnLine: (mon) => `${mon.name} brings it down where you are standing. Move.`,
    hitLine: () => 'The floor comes up and catches you.',
    missLine: () => 'The floor comes up where you were.',
  };
  /** The storm call: three metres of energy, a second and a half of warning. */
  const STORM_SPEC = {
    id: 'stormcall', name: 'the storm', radius: STORM_RADIUS, warn: STORM_WARN_S,
    damageType: 'energy', colour: 0xb98cff, stat: 'storms',
    warnLine: (mon) => `${mon.name} calls it down onto the ground you are standing on. Move.`,
    hitLine: () => 'The sky answers, and it lands on you.',
    missLine: () => 'The sky answers, and it lands where you were.',
  };
  /** The powder charge: three metres of fire, two seconds of it lying there. */
  const POWDER_SPEC = {
    id: 'powdercharge', name: 'the charge', radius: POWDER_RADIUS, warn: POWDER_WARN_S,
    damageType: 'fire', colour: 0xff7a2a, stat: 'charges',
    warnLine: (mon) => `${mon.name} lobs a charge at your feet. Two seconds of fuse.`,
    hitLine: () => 'The charge goes off under you.',
    missLine: () => 'The charge goes off where you were standing.',
  };

  /**
   * Put a ring on the floor at `at`, and hit whatever is still in it later.
   *
   * `effects` is optional and is only ever asked for a flash: nothing here
   * depends on it, so a headless run and a run before app/systems/combat.js
   * hands one in both behave identically. See M3.md.
   */
  function startMark(mon, at, spec) {
    const s = {
      mon, spec, x: num(at.x), z: num(at.z), y: num(at.y), t: 0, mesh: null,
      radius: spec.radius, warn: spec.warn,
    };
    const mesh = new THREE.Mesh(RING_GEO, RING_MAT.clone());
    mesh.material.color.setHex(spec.colour);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(s.x, s.y + 0.06, s.z);
    const k = spec.radius / SLAM_RADIUS;
    mesh.scale.set(k, k, 1);
    group.add(mesh);
    s.mesh = mesh;
    marks.push(s);
    stats.marks++;
    if (spec.stat && stats[spec.stat] != null) stats[spec.stat]++;
    effects?.ring?.({ x: s.x, y: s.y, z: s.z }, spec.radius, spec.colour, spec.warn, 0.45);
    say(spec.warnLine(mon), 'bad');
    return s;
  }

  /** The slam, by the name the rest of this file already calls it. */
  function startSlam(mon, at) { return startMark(mon, at, SLAM_SPEC); }

  function stepMarks(d, playerActor) {
    for (let i = marks.length - 1; i >= 0; i--) {
      const s = marks[i];
      s.t += d;
      const u = clamp(s.t / s.warn, 0, 1);
      s.mesh.material.opacity = 0.25 + 0.45 * u;
      if (s.t < s.warn) continue;
      s.mesh.parent?.remove(s.mesh);
      s.mesh.material.dispose();
      marks.splice(i, 1);
      const row = s.mon.row;
      const spell = {
        base: [row.damage[0], row.damage[1]], damageType: s.spec.damageType,
        id: s.spec.id, name: s.spec.name,
      };
      const caught = [];
      for (const who of [playerActor, ...[...live.values()].map((m) => m.actor)]) {
        if (!who || who === s.mon.actor || num(who.health) <= 0) continue;
        if (who.kind !== 'player') continue;                 // the boss's own do not take it
        if (Math.hypot(num(who.pos.x) - s.x, num(who.pos.z) - s.z) > s.radius) continue;
        caught.push(who);
        combat?.queueSpell?.(s.mon.actor, spell, who, { now: lastNow, travel: 0 });
      }
      effects?.burst?.({ x: s.x, y: s.y + 0.4, z: s.z }, s.spec.colour, s.radius / 3);
      say(caught.length ? s.spec.hitLine(s.mon) : s.spec.missLine(s.mon), caught.length ? 'bad' : null);
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
    // The world's own animals. src/world/fauna.js decides where a rabbit
    // belongs (biome, forest edge, off the water, out of the towns); this layer
    // stands it up. The records are this file's own record shape, so the cap
    // ranks them, `deadUntil` remembers them and the sweep despawns them
    // exactly as it does a wolf. See docs/mmo/wiring/F1.md.
    if (typeof runtime?.critterSpawns === 'function') entry.recs = entry.recs.concat(runtime.critterSpawns(cx, cz, night));
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
    for (const s of marks) { s.mesh.parent?.remove(s.mesh); s.mesh.material.dispose(); }
    marks.length = 0;
    // A hex or a hold belongs to a body that has just stopped existing, and a
    // player who walked down a stair with fifteen points off his hit and no
    // monster left alive to take them back off is the silent effect this whole
    // file is written against. Everything outstanding is released here.
    releaseAll('The last of them is gone, and it comes off you.');
    blows.length = 0;
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

    // The shield wall is a fact about a GROUP and not about one body, so it is
    // recomputed once for the whole field before anybody swings, not inside the
    // per monster loop where each of four soldiers would read a different half
    // finished answer.
    stepWall();

    for (const mon of [...live.values()]) {
      const a = mon.actor;
      if (num(a.health) <= 0) continue;                  // combat's onDeath will take it
      const before = a.ai?.target || null;

      // What came off it since the last frame, which is what breaks a cast.
      const took = Math.max(0, num(mon.lastHealth) - num(a.health));
      mon.lastHealth = num(a.health);
      if (mon.boss) stepBoss(mon, d, playerActor);

      // Is it in the world yet? An ambusher in the reeds, a statue nobody has
      // walked up to, a spider on the branch, a worm two seconds under the
      // sand. `stepDormant` owns the trigger and stepMonster is handed the flag.
      const dormant = stepDormant(mon, d, playerActor);

      // A critter bolts from you before you have touched it, and from the
      // dragon too, since a hawk on your shoulder is still a hawk to a rabbit.
      if (mon.row.temperament === 'critter' && a.ai.state !== 'flee' && a.ai.state !== 'dead' && num(a.health) > 0) {
        const threats = [playerActor, ...(typeof opts.allies === 'function' ? (opts.allies() || []) : [])];
        const near = threats.find((t) => t && num(t.health) > 0 && dist2D(a.pos, t.pos) <= SPOOK_M);
        if (near) { a.ai.state = 'flee'; a.ai.fleeFrom = near; a.ai.target = null; }
      }

      // A stoop overrides the standoff: a harpy that shoots does not shoot on
      // the way down, and the swoop is forced so the altitude actually reaches
      // the floor rather than waiting for `state === 'attack'` to get there.
      if (mon.diving) a.ai.swoopUntil = lastNow + SWOOP_SECONDS * 1000;

      const settled = a.ai && a.ai.target && num(a.ai.target.health) > 0 ? a.ai.target : playerActor;
      const res = stepMonster(a, d, {
        player: playerActor, now: lastNow, heightAt,
        allies: typeof opts.allies === 'function' ? opts.allies() : undefined,
        clampXZ: under ? clampXZ : undefined,
        // the reach to whoever it settled on, not always the player: a wolf on
        // the dragon measures its bite against the dragon's body
        reach: combat ? combat.reachBetween(a, settled || a) : undefined,
        mode: mon.diving ? 'melee' : mon.mode,
        flying: mon.flyer,
        perches: mon.flyer && mon.row.tier === 0,
        hoverBand: mon.flyer && mon.row.tier === 0 ? BIRD_BAND : null,
        dormant,
        rng,
      });
      mon.cornered = !!res.cornered;
      if (!before && a.ai.target) alertGroup(mon, a.ai.target);

      // Anything still hanging above the floor, and the fall when it lets go.
      stepAloft(mon, d);
      if (!dormant) stepSpecials(mon, d, playerActor, took);

      mon.model.group.position.set(a.pos.x, a.pos.y, a.pos.z);
      mon.model.group.rotation.y = num(a.yaw);
      const speed = d > 0 ? res.moved / d : 0;
      mon.lastSpeed = speed;

      const onPlayer = combat && playerActor && a.ai.target === playerActor;
      stepCast(mon, took, res, playerActor, onPlayer);

      if (res.wantSwing && onPlayer) {
        // A stoop is hands and feet whatever the row usually does at range: a
        // glass wyvern coming down does not also throw a spike on the way.
        const ranged = !mon.diving && (mon.mode === 'thrown' || mon.mode === 'shot');
        // Every fourth swing of a row that sweeps is the arc instead of the
        // blow. It costs the same swing, so it is not a free fifth attack.
        const sweeping = mon.tags.has('tailSweep') && (mon.swings + 1) % SWEEP_EVERY === 0;
        if (sweeping) {
          if (tailSweep(mon, playerActor)) mon.swings++;
        } else {
          const o = { now: lastNow, poison: mon.poison || undefined };
          // A stoop is worth two, and so is the first blow out of an ambush.
          let mult = 1;
          if (mon.diving) mult *= DIVE_MULT;
          if (mon.ambushBlow) mult *= AMBUSH_MULT;
          if (mult !== 1) o.multiplier = mult;
          const swing = combat.queueSwing(a, playerActor, o);
          if (swing.queued) {
            mon.swings++;
            // Remembered so `grab` and `ashCloud` can ask, one frame after it
            // was due, whether it actually took health off. See stepBlows.
            blows.push({ mon, target: playerActor, at: swing.at, health: num(playerActor.health) });
            if (mon.ambushBlow) {
              mon.ambushBlow = false;
              say(`It was waiting for you, and the first blow is worth two of them.`, 'bad');
            }
            if (mon.diving) {
              mon.diving = false;
              say(`${mon.name} strikes on the way past, twice as hard for the height, and climbs again.`, 'bad');
            }
            mon.model.setAnim('swing');
            if (ranged) throwShot(mon, playerActor);
          }
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
    stepMarks(d, playerActor);
    stepBlows();
    stepGrabs();
    stepPenalties();
    stepCorpses(d);
  }

  /**
   * One frame of a cast. A cast is started when the AI asks for one and the
   * row's own swing rhythm allows it, held for the spell's seconds with the
   * model in its cast pose, and broken by a single blow worth more than a tenth
   * of the caster's health, which is 04-CLASSES-ABILITIES' rule for the player
   * and is not given a second, softer version here.
   */
  /** The hex, as a spell record so it goes through exactly the same cast path. */
  const HEX_SPELL = { id: 'hex', name: 'a hex', base: [0, 0], damageType: 'energy', cone: null, seconds: 1.5, travel: 0, hex: true };

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
      // `healsAllies`: it lands as health on its own side rather than as damage
      // on yours. The chaplain is the whole of this branch.
      if (mon.tags.has('healsAllies')) { chantHeal(mon); return; }
      // `hex`: no damage at all, points off the target's hit and a word for it.
      if (spell.hex) {
        hitPenalty(target, 'hex', HEX_POINTS, HEX_SECONDS,
          `${mon.name} puts a hex on you. ${HEX_POINTS} off your hit for ${HEX_SECONDS} seconds.`);
        effects?.burst?.(target.pos, 0xc07aff, 1.0);
        return;
      }
      // `stormCall`: not a missile. A mark on the ground the target is standing
      // on now, and the sky answers it STORM_WARN_S later, which is time to move.
      if (spell.ground) {
        startMark(mon, { x: target.pos.x, y: heightAt(target.pos.x, target.pos.z), z: target.pos.z }, STORM_SPEC);
        return;
      }
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
    // `hex` is the SECOND cast of a row that already casts, on its own fifteen
    // second cooldown: when it is up, this cast is the curse instead of the
    // fireball. One cast at a time, so the hold and the interrupt still hold.
    let spell = mon.spell;
    if (mon.tags.has('hex') && lastNow >= mon.hexAt) {
      spell = HEX_SPELL;
      mon.hexAt = lastNow + HEX_EVERY_S * 1000;
    }
    mon.actor.lastSwingAt = lastNow;
    mon.cast = { until: lastNow + spell.seconds * 1000, spell, target: playerActor };
    mon.actor.anim = 'cast';
    mon.model.setAnim('cast');
    stats.casts++;
    say(`${mon.name} begins ${spell.name}.`);
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
    // `dragonTime`: Malachar, and nothing else, ever. His half speed swing and
    // his one and a half times approach hold WHILE HE IS ABOVE THE LAST
    // THRESHOLD; under it they come off and the world is meant to slow instead,
    // which is `wantsPlayerSlow()` and is not this file's to do.
    if (mon.tags.has('dragonTime')) {
      const last = mon.plan.length;
      const above = mon.phase < last;
      if (mon.dragonOn !== above) {
        dragonTime(mon, above);
        if (!above) {
          mon.playerSlow = true;
          say(`${mon.name} stops hurrying, and the room slows down around him. It is you who is slow now.`, 'bad');
        }
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
    // What it calls, in one of two ways and never a third.
    //
    // A row that carries `summons: { id, count }` calls exactly that: the Fen
    // Witch's two wisps, Gallow's two bone hounds, Ossory's two knights. The
    // roster's own audit has already proved the id is a real row of a lower
    // tier, so nothing here can put down a thing that does not exist.
    //
    // A row with no `summons` field falls back to what the document's four
    // bosses have always done: the level's own night roster, minus its bosses,
    // SUMMON_COUNT of it. That path is unchanged.
    const named = mon.row.summons && MONSTERS[mon.row.summons.id] ? mon.row.summons : null;
    const habitat = levelL ? dungeonHabitat(levelL.kind, levelL.level) : 'dungeon3';
    const list = named ? [named.id] : (HABITAT[habitat]?.night || []).filter((id) => MONSTERS[id] && !MONSTERS[id].boss);
    const want = named ? Math.max(1, Math.round(num(named.count)) || 1) : SUMMON_COUNT;
    if (!list.length) { say(`${mon.name} calls, and nothing here answers.`); return 0; }
    let made = 0, capped = 0;
    for (let i = 0; i < want; i++) {
      // A summon is a body like any other and counts against the same ceiling.
      // Saying so matters: a boss that calls two and puts down none looks like
      // a broken boss rather than a full world.
      if (live.size >= cap) { capped = want - made; break; }
      const id = named ? named.id : list[Math.min(list.length - 1, Math.floor(rng() * list.length))];
      const ang = (i / want) * Math.PI * 2 + rng();
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
    effects?.burst?.(mon.actor.pos, 0x7a5ea8, 1.6);
    if (!made) say(`${mon.name} calls, and nothing comes.`);
    else if (named) {
      const what = MONSTERS[named.id].name.toLowerCase();
      say(`${mon.name} calls, and ${made} ${what}${made === 1 ? '' : 's'} come out of the dark for it.`, 'bad');
    } else say(`${made} of them come out of the dark.`, 'bad');
    if (capped) say(`${capped} more would have come, and there is no room in the world for them.`);
    return made;
  }

  // ==========================================================================
  // Wave A's tags: the rules M2.md section 2 asks for.
  // ==========================================================================
  //
  // Read this before adding a twenty second one. Four things are true of every
  // rule below and none of them is optional:
  //
  //   1. IT SAYS SOMETHING. A summon says how many came, a grab says it has
  //      you, a wall says how many are in it, a heal says what went where. It
  //      also says what did NOT happen: a howl nothing answered, a sweep you
  //      were behind, a summon the body cap ate. A silent real effect is
  //      indistinguishable from a broken one.
  //   2. THE NUMBER IS COUNTED. Every line that names a count reads it off live
  //      state on the frame it is said.
  //   3. IT COMES OFF AGAIN. Anything lent to an actor (armour to a shield
  //      wall, points off a player's hit, a hold on his legs, Malachar's half
  //      speed swing) is tracked as a delta and given back, and `releaseAll`
  //      gives back everything outstanding when the layer changes.
  //   4. IT GOES THROUGH THE EXISTING DOOR. Damage is `combat.queueSpell` or
  //      `combat.hurt`, a root is `combat.applyStatus`, a body is `spawn`, and
  //      there is no second damage formula anywhere in here.

  /** No body, no plate, nothing to click. An ambusher, or a worm under the sand. */
  function setHidden(mon, hidden) {
    mon.hidden = !!hidden;
    if (mon.model && mon.model.group) mon.model.group.visible = !mon.hidden;
    if (mon.plate && mon.plate.sprite) mon.plate.sprite.visible = !mon.hidden;
  }

  /** actor.js's recompute, if main.js handed one in. True when it really ran. */
  function recomputeActor(a) {
    if (typeof combat?.recompute !== 'function' || !a) return false;
    combat.recompute(a);
    return true;
  }

  // -- points off a hit: `hex` and `ashCloud` --------------------------------
  //
  // Both tags do the same thing to a target and differ only in how many points,
  // for how long, and what set it off. The points come off `bonuses.hit`, which
  // is what `combat_rules.attackSkill` adds to the weapon skill, so a hexed
  // player genuinely misses more and the number is in the same unit the row's
  // own `hit` is in: skill points.
  //
  // HOW IT IS CARRIED, and why it is not simply written onto `bonuses.hit`:
  // `actor.recompute` REPLACES `actor.bonuses` wholesale out of gear and buffs,
  // so a number written straight onto it disappears the moment the player puts
  // a ring on. It is carried as a real buff instead, in the list recompute
  // already reads. The buff carries NO `until` field on purpose: that field is
  // in SECONDS over in abilities_runtime.js and in wall-clock milliseconds in
  // recompute, and a curse expiring against the wrong clock is the units bug
  // this project has already paid for once. The clock is `penalties` below, in
  // the same milliseconds every other timer in this file uses, and it is the
  // only thing that takes the buff off again.
  function hitPenalty(target, kind, points, seconds, line) {
    if (!target || num(target.health) <= 0) return null;
    const had = penalties.find((x) => x.actor === target && x.kind === kind);
    if (had) {
      had.until = Math.max(had.until, lastNow + seconds * 1000);
      return had;
    }
    const p = { actor: target, kind, points, until: lastNow + seconds * 1000, direct: false, buff: null };
    target.buffs = Array.isArray(target.buffs) ? target.buffs : [];
    p.buff = { name: kind, kind, source: 'monster', effect: { bonuses: { hit: -points } } };
    target.buffs.push(p.buff);
    if (!recomputeActor(target)) {
      // No recompute in this tree: the points go on the live record instead and
      // are added back by hand. Either path is real; neither is a no-op.
      target.bonuses = target.bonuses || {};
      target.bonuses.hit = num(target.bonuses.hit) - points;
      p.direct = true;
    }
    penalties.push(p);
    stats.hexes++;
    combat?.float?.(target, `hit -${points}`, 'miss');
    say(line, 'bad');
    return p;
  }

  function dropPenalty(p, line) {
    const at = Array.isArray(p.actor.buffs) ? p.actor.buffs.indexOf(p.buff) : -1;
    if (at >= 0) p.actor.buffs.splice(at, 1);
    if (p.direct) {
      p.actor.bonuses = p.actor.bonuses || {};
      p.actor.bonuses.hit = num(p.actor.bonuses.hit) + p.points;
    } else recomputeActor(p.actor);
    combat?.float?.(p.actor, `${p.kind} gone`, 'heal');
    if (line) say(line);
  }

  function stepPenalties() {
    for (let i = penalties.length - 1; i >= 0; i--) {
      const p = penalties[i];
      if (lastNow < p.until && num(p.actor.health) > 0) continue;
      penalties.splice(i, 1);
      dropPenalty(p, p.kind === 'hex'
        ? 'The curse comes off you.'
        : 'The ash settles, and you can see to swing again.');
    }
  }

  // -- `grab`: the kraken has you --------------------------------------------
  //
  // One landed blow in four takes hold: the target is rooted for GRAB_SECONDS
  // through `combat.applyStatus`, which is the same root a spider's web writes
  // and is read by `speedOf` and by the player's own movement, and it takes the
  // row's LOW damage every second while it holds. Killing the holder ends it,
  // which is the answer to "what do I do about this".
  function grabHold(mon, target) {
    if (!combat || !target || num(target.health) <= 0) return null;
    combat.applyStatus(target, 'root', { seconds: GRAB_SECONDS }, lastNow);
    const g = {
      mon, target, until: lastNow + GRAB_SECONDS * 1000,
      nextTick: lastNow + 1000, per: num(mon.row.damage?.[0]) || 1,
    };
    grabs.push(g);
    stats.grabs++;
    effects?.burst?.(target.pos, 0xe8e2d4, 0.8);
    say(`${mon.name} has you. ${GRAB_SECONDS} seconds of it, and ${g.per} a second while it squeezes.`, 'bad');
    return g;
  }

  function releaseGrab(g, line) {
    combat?.clearStatus?.(g.target, 'root');
    if (line) say(line);
  }

  function stepGrabs() {
    for (let i = grabs.length - 1; i >= 0; i--) {
      const g = grabs[i];
      const holderGone = !live.has(g.mon.key) || num(g.mon.actor.health) <= 0;
      if (holderGone) {
        grabs.splice(i, 1);
        releaseGrab(g, `${g.mon.name} lets go of you, because it is dead.`);
        continue;
      }
      while (lastNow >= g.nextTick && g.nextTick <= g.until && num(g.target.health) > 0) {
        g.nextTick += 1000;
        combat?.hurt?.(g.target, g.per, { now: lastNow, kind: 'damage', killer: g.mon.actor });
      }
      if (lastNow >= g.until || num(g.target.health) <= 0) {
        grabs.splice(i, 1);
        releaseGrab(g, num(g.target.health) > 0 ? `${g.mon.name} lets go of you.` : null);
      }
    }
  }

  /** Everything lent out, given back. A layer change, a dispose, a death screen. */
  function releaseAll(line) {
    const held = grabs.length + penalties.length;
    for (const g of grabs.splice(0)) releaseGrab(g, null);
    for (const p of penalties.splice(0)) dropPenalty(p, null);
    wallOn.clear();
    if (line && held) say(line);
    return held;
  }

  // -- a blow, and whether it landed -----------------------------------------
  //
  // `grab` and `ashCloud` both fire ON A LANDED BLOW, and nothing in combat.js
  // tells this file about one: `onHit` fires for weapon effects and thorns, not
  // for every swing. So a queued swing is remembered with the target's health
  // as it left, and asked about one frame after it was due, which is exactly
  // the trick `throwShot` already uses to decide whether a knife stops in a
  // chest or carries on past an ear. `monsters.update` runs BEFORE
  // `combat.update` in the frame, so at any `now` past `at` the resolver has
  // already spoken.
  function stepBlows() {
    for (let i = blows.length - 1; i >= 0; i--) {
      const b = blows[i];
      if (lastNow <= b.at) continue;
      // ONE FRAME LATER, NOT THIS ONE. `monsters.update` runs BEFORE
      // `combat.update`, so on the first frame past `at` the resolver has not
      // spoken yet and the target's health has not moved. Asking here would
      // read every landed blow as a miss, which is exactly what it did until
      // this line existed. `stepShots` waits the same frame for the same reason.
      if (!b.seen) { b.seen = true; continue; }
      blows.splice(i, 1);
      if (!live.has(b.mon.key)) continue;
      if (!(num(b.target.health) < b.health)) continue;      // a miss, a parry, a dodge
      if (b.mon.tags.has('grab') && rng() < GRAB_CHANCE) grabHold(b.mon, b.target);
      if (b.mon.tags.has('ashCloud')) {
        hitPenalty(b.target, 'ashCloud', ASH_POINTS, ASH_SECONDS,
          `${b.mon.name} comes apart into ash around your head, and you cannot see to swing. ${ASH_POINTS} off your hit for ${ASH_SECONDS} seconds.`);
      }
    }
  }

  // -- `shieldWall`: they lock up ---------------------------------------------
  //
  // While WALL_MIN or more live monsters of the SAME ROW stand within WALL_M of
  // each other, each of them carries WALL_AR more armour. Recomputed every
  // frame from live positions, which is what makes it come off the moment the
  // second one dies or walks away, and it is lent as a tracked delta so the
  // armour a monster ends with is the armour its row says it has.
  function stepWall() {
    // Row first, not body first. A row whose last walled body despawns has to
    // be forgotten, or the next two of its kind lock shields in silence.
    const rows = new Set();
    for (const mon of live.values()) if (mon.tags.has('shieldWall')) rows.add(mon.id);
    for (const id of [...wallOn]) if (!rows.has(id)) wallOn.delete(id);
    for (const id of rows) {
      const members = [];
      for (const m of live.values()) {
        if (m.id === id && num(m.actor.health) > 0 && !m.hidden) members.push(m);
      }
      let most = 0;
      for (const mon of members) {
        let n = 0;
        for (const other of members) if (dist2D(other.actor.pos, mon.actor.pos) <= WALL_M) n++;
        if (n > most) most = n;
        const want = n >= WALL_MIN ? WALL_AR : 0;
        if (want === mon.wall) continue;
        // lent as a tracked delta, so what it ends with is what its row says
        mon.actor.ar = num(mon.actor.ar) - mon.wall + want;
        mon.wall = want;
      }
      const up = members.some((m) => m.wall > 0);
      // One line per ROW, not one per body: four soldiers locking up is one
      // thing happening, and four identical lines in the log is a bug report.
      if (up && !wallOn.has(id)) {
        wallOn.add(id);
        stats.walls++;
        say(`${most} of them lock shields. That is ${WALL_AR} more armour on each while they hold.`, 'bad');
      } else if (!up && wallOn.has(id)) {
        wallOn.delete(id);
        say('The shield wall breaks.', 'good');
      }
    }
  }

  // -- `healsAllies`: the chaplain's chant ------------------------------------
  //
  // A cast, using the caster path that already exists, because the chaplain
  // also carries `casts` and so `attackModeOf` gives her `cast` and the hold
  // and the interrupt are free. What is different is only what happens when it
  // lands: nothing at the player, and the row's own damage range as health to
  // every hurt ally within HEAL_ALLIES_M, herself included.
  function chantHeal(mon) {
    const [lo, hi] = mon.row.damage || [1, 3];
    const amount = Math.round(lo + rng() * Math.max(0, hi - lo));
    let n = 0, given = 0;
    for (const other of live.values()) {
      if (num(other.actor.health) <= 0 || other.hidden) continue;
      if (num(other.actor.health) >= num(other.actor.maxHealth)) continue;
      if (dist2D(other.actor.pos, mon.actor.pos) > HEAL_ALLIES_M) continue;
      const got = combat?.heal?.(other.actor, amount) || 0;
      if (got > 0) { n++; given += got; }
    }
    stats.heals++;
    effects?.burst?.(mon.actor.pos, 0x8ef0a0, 1.2);
    say(n
      ? `${mon.name} lifts the cup, and the wall closes up. ${given} health back across ${n} of them.`
      : `${mon.name} lifts the cup, and nobody standing near her needs it.`);
    return { n, given };
  }

  // -- `howl`: the alpha calls the pack ---------------------------------------
  //
  // On the first blow it takes, once and never again, every monster of its own
  // row within HOWL_M comes. It is `sharesAggro` with a bigger radius and a
  // line, and the line counts what actually turned rather than promising a pack
  // that is not there.
  function howl(mon, target) {
    mon.howled = true;
    let n = 0;
    for (const other of live.values()) {
      if (other === mon || other.id !== mon.id) continue;
      if (num(other.actor.health) <= 0 || other.dormant || other.hidden) continue;
      if (other.actor.ai?.target) continue;
      if (dist2D(other.actor.pos, mon.actor.pos) > HOWL_M) continue;
      other.actor.ai.target = target;
      other.actor.ai.state = 'chase';
      n++;
    }
    stats.howls++;
    say(n
      ? `The ${mon.name.toLowerCase()} throws its head back, and ${n} more come out of the dark for it.`
      : `The ${mon.name.toLowerCase()} throws its head back, and nothing answers.`, 'bad');
    return n;
  }

  // -- `dives`: the stoop -----------------------------------------------------
  //
  // A flyer holding at hover height with its target more than DIVE_TRIGGER_M
  // away drops to the floor over SWOOP_SECONDS, lands one blow worth
  // DIVE_MULT, and climbs again. While it is diving it walks in as a melee row
  // whatever its own mode is, which is what a stoop is: a harpy that shoots
  // does not shoot on the way down.
  function planDive(mon) {
    if (!mon.tags.has('dives')) return;
    const a = mon.actor;
    const t = a.ai?.target;
    if (!t || num(t.health) <= 0) { mon.diving = false; return; }
    if (mon.diving) {
      // it never got there: give up rather than hang in the swoop for ever
      if (lastNow >= mon.diveUntil) {
        mon.diving = false;
        say(`${mon.name} misses its stoop and climbs again.`);
      }
      return;
    }
    if (lastNow < mon.diveAt) return;
    if (dist2D(a.pos, t.pos) <= DIVE_TRIGGER_M) return;
    mon.diving = true;
    mon.diveAt = lastNow + DIVE_EVERY_S * 1000;
    mon.diveUntil = lastNow + (SWOOP_SECONDS + 4) * 1000;
    stats.dives++;
    say(`${mon.name} folds its wings and comes down at you.`, 'bad');
  }

  // -- `tailSweep`: every fourth swing is a cone -------------------------------
  //
  // Not a blow at one target: `coneTargets` at SWEEP_RANGE and SWEEP_HALF_ANGLE
  // and the row's damage to everything inside it. It costs the row's swing, so
  // the cooldown gate `queueSwing` would have applied is applied here instead
  // rather than being a free fifth attack. Like the slam, the boss's own do not
  // take it.
  function tailSweep(mon, target) {
    const a = mon.actor;
    const wait = num(a.lastSwingAt) + swingSeconds(a) * 1000 - lastNow;
    if (Number.isFinite(a.lastSwingAt) && wait > 0) return false;
    a.lastSwingAt = lastNow;
    a.anim = 'swing';
    mon.model.setAnim('swing');
    const row = mon.row;
    const spell = { base: [row.damage[0], row.damage[1]], damageType: 'physical', id: 'tailsweep', name: 'the tail' };
    const caught = coneTargets(a.pos, a.yaw, SWEEP_RANGE, SWEEP_HALF_ANGLE, [target]);
    for (const who of caught) combat?.queueSpell?.(a, spell, who, { now: lastNow, travel: 0 });
    stats.sweeps++;
    effects?.burst?.(a.pos, 0xe8e2d4, 1.4);
    say(caught.length
      ? `${mon.name} brings the tail round in an arc, and it catches you.`
      : `${mon.name} brings the tail round in an arc, and you are outside it.`, caught.length ? 'bad' : null);
    return true;
  }

  // -- `dragonTime`: Malachar's, and nothing else's ---------------------------
  //
  // Above his last threshold his swing timer runs at half its seconds and his
  // approach at DRAGON_RUN, both of them on HIS OWN actor and both tracked so
  // they come off exactly. Below it they come off and the world is supposed to
  // slow instead, which this file does not do and must not: the world clock is
  // `app/context.js`'s and the wyrmsoul system owns it. `wantsPlayerSlow()` on
  // the returned api is the hook that system reads. See M3.md section 4.
  function dragonTime(mon, on) {
    if (!!on === !!mon.dragonOn) return;
    const a = mon.actor;
    mon.dragonOn = !!on;
    a.bonuses = a.bonuses || {};
    a.bonuses.swingSpeed = num(a.bonuses.swingSpeed) + (on ? DRAGON_SWING : -DRAGON_SWING);
    a.run = on ? num(a.run) * DRAGON_RUN : num(a.run) / DRAGON_RUN;
  }

  // -- the four that decide whether a monster is there at all -----------------
  //
  // `ambush`, `awakens`, `dropsFromAbove` and `burrows`. Each returns true while
  // the monster is still dormant, and `stepMonster` is handed that flag: no
  // aggro, no drift, no wander, holds exactly where it was put.
  function stepDormant(mon, d, playerActor) {
    const a = mon.actor;
    const p = playerActor && num(playerActor.health) > 0 ? playerActor : null;
    const gap = p ? dist2D(a.pos, p.pos) : Infinity;

    if (mon.tags.has('ambush') && mon.dormant) {
      if (gap > AMBUSH_M) return true;
      mon.dormant = false;
      setHidden(mon, false);
      a.ai.state = 'idle';
      mon.ambushBlow = true;
      stats.ambushes++;
      effects?.burst?.(a.pos, 0x86e05a, 1.0);
      say(`The ${mon.name.toLowerCase()} was in the reeds the whole time, and it is beside you now.`, 'bad');
      return false;
    }

    if (mon.tags.has('awakens') && mon.dormant) {
      // Visible the whole time. That is the entire difference from an ambush:
      // this is a statue you have already walked past, not a thing in the grass.
      if (gap > AWAKEN_M) return true;
      mon.dormant = false;
      a.ai.state = 'idle';
      stats.wakings++;
      say(`The carving you walked past is a ${mon.name.toLowerCase()}, and it steps down off its plinth.`, 'bad');
      return false;
    }

    if (mon.tags.has('dropsFromAbove') && mon.dormant) {
      if (gap > DROP_UNDER_M) return true;
      mon.dormant = false;
      a.ai.state = 'idle';
      stats.ambushes++;
      say(`The blossom above the path is a ${mon.name.toLowerCase()}, and it drops on you.`, 'bad');
      return false;                                  // mon.aloft falls in stepAloft
    }

    if (mon.tags.has('burrows')) {
      if (mon.dormant) {
        if (lastNow < mon.burrowUntil) return true;
        surface(mon);
        return false;
      }
      const t = a.ai?.target;
      if (t && num(t.health) > 0 && lastNow >= mon.burrowAt && dist2D(a.pos, t.pos) > BURROW_MIN_M) {
        mon.dormant = true;
        setHidden(mon, true);
        mon.burrowUntil = lastNow + BURROW_UNDER_S * 1000;
        mon.burrowAt = lastNow + BURROW_EVERY_S * 1000;
        mon.burrowTarget = t;
        stats.burrows++;
        say(`The ${mon.name.toLowerCase()} goes down into the ground, and the shaking stops.`, 'bad');
        return true;
      }
    }
    return mon.dormant;
  }

  /**
   * Up again, behind whoever it went down after.
   *
   * BEHIND is the target's own facing: `yaw` faces (sin yaw, cos yaw), so the
   * point BURROW_OUT_M along the negative of that is at its back. Two things it
   * must not do, both of them named in M2: come up inside geometry, and break
   * the leash. The first is `blockedAt` and `clampWalkable`, tried at eight
   * angles round the target before it gives up and stays where it was; the
   * second is a clamp of the emergence point to the row's own leash radius from
   * home, plus clearing `leashSince`, so a worm that surfaces at the far edge
   * is not immediately sent back by the timer that was already running.
   */
  function surface(mon) {
    const a = mon.actor;
    const t = (mon.burrowTarget && num(mon.burrowTarget.health) > 0) ? mon.burrowTarget : (a.ai?.target || null);
    setHidden(mon, false);
    mon.dormant = false;
    a.ai.state = 'idle';
    if (!t) { say(`The ${mon.name.toLowerCase()} comes up out of the ground where it went down.`); return null; }

    const home = a.ai.home || { x: num(a.pos.x), z: num(a.pos.z) };
    const leash = num(a.ai.leash) || num(a.ai.aggro) * 2.5 || 30;
    const back = num(t.yaw);
    let placed = null;
    for (let k = 0; k < 8 && !placed; k++) {
      // straight behind first, then round the compass from there
      const ang = back + Math.PI + (k === 0 ? 0 : (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 4));
      let x = num(t.pos.x) + Math.sin(ang) * BURROW_OUT_M;
      let z = num(t.pos.z) + Math.cos(ang) * BURROW_OUT_M;
      if (runtime?.inDungeon) { const c = clampXZ(x, z); x = num(c[0]); z = num(c[1]); }
      // never further from home than the leash: coming up out of bounds would
      // put it straight into `leashCheck` and it would walk away from the fight
      const dh = Math.hypot(x - home.x, z - home.z);
      if (dh > leash) {
        const f = leash / dh;
        x = home.x + (x - home.x) * f;
        z = home.z + (z - home.z) * f;
      }
      const sample = field ? field.sampleAt(x, z) : null;
      if (blockedAt(x, z, sample, { sites: sitesNear(x, z, 60), spawnPoint, spawnKeep })) continue;
      placed = { x, z };
    }
    if (!placed) { say(`The ${mon.name.toLowerCase()} comes back up where it went down. There was nowhere else.`); return null; }
    a.pos.x = placed.x;
    a.pos.z = placed.z;
    a.pos.y = heightAt(placed.x, placed.z);
    mon.model.group.position.set(a.pos.x, a.pos.y, a.pos.z);
    a.ai.leashSince = null;
    a.ai.target = t;
    a.ai.state = 'chase';
    a.yaw = Math.atan2(num(t.pos.x) - a.pos.x, num(t.pos.z) - a.pos.z);
    effects?.burst?.(a.pos, 0xd8c58a, 1.4);
    say(`The ground opens behind you and the ${mon.name.toLowerCase()} comes up out of it.`, 'bad');
    return placed;
  }

  /** A thing still hanging above the floor, and the fall when it lets go. */
  function stepAloft(mon, d) {
    if (mon.aloft <= 0) return;
    if (!mon.dormant) mon.aloft = Math.max(0, mon.aloft - DROP_FALL_MPS * d);
    const ground = heightAt(mon.actor.pos.x, mon.actor.pos.z);
    mon.actor.pos.y = ground + mon.aloft;
    mon.model.group.position.y = mon.actor.pos.y;
  }

  /**
   * The tags that fire on their own clock rather than off a blow: `summons` on
   * a row that is not a boss, `hex`'s second cast, `powderCharge`, and the
   * stoop. Called once per monster per frame, after `stepMonster` has moved it.
   */
  function stepSpecials(mon, d, playerActor, took) {
    const a = mon.actor;
    const t = a.ai?.target && num(a.ai.target.health) > 0 ? a.ai.target : null;

    // `howl`: the first blow it takes, once.
    if (took > 0 && mon.tags.has('howl') && !mon.howled) howl(mon, t || playerActor);

    // `summons` on a row that is not a boss: the first time it drops below half
    // health it calls what its row names, and it may not call again for
    // SUMMON_COOLDOWN_S even if it heals back over the line and falls again,
    // which a row that flees and returns healed genuinely can do.
    if (mon.tags.has('summons') && !mon.boss && mon.row.summons) {
      const half = num(a.maxHealth) * SUMMON_AT;
      if (num(a.health) > half) mon.summonReady = true;
      else if (mon.summonReady && lastNow >= mon.summonAt && t) {
        mon.summonReady = false;
        mon.summonAt = lastNow + SUMMON_COOLDOWN_S * 1000;
        summonFor(mon);
      }
    }

    if (!t) return;

    // `powderCharge`: a charge at the target's feet on a ten second cooldown.
    if (mon.tags.has('powderCharge') && lastNow >= mon.powderAt && dist2D(a.pos, t.pos) <= RANGED_FAR) {
      mon.powderAt = lastNow + POWDER_EVERY_S * 1000;
      startMark(mon, { x: t.pos.x, y: heightAt(t.pos.x, t.pos.z), z: t.pos.z }, POWDER_SPEC);
    }

    planDive(mon);
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
      // A dormant one keeps its own trigger: an ambusher given a target by a
      // friend would have it cleared again on the next frame and would look
      // like a monster that flickers rather than one that is waiting.
      if (other.dormant || other.hidden) continue;
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
    // A hidden one is genuinely not there: an ambusher you could put a cursor on
    // is not an ambush, it is a monster with an invisible skin.
    for (const mon of live.values()) if (num(mon.actor.health) > 0 && !mon.hidden) out.push(mon.model.group);
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
        if (mon && live.has(mon.key) && num(mon.actor.health) > 0 && !mon.hidden) return mon;
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
      if (num(a.health) <= 0 || mon.hidden) continue;
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
    /** Take one spawned body away by its key: an event's escort when the event ends (E2). */
    despawn(key) { return despawn(key); },
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
    actors: () => [...live.values()].filter((m) => num(m.actor.health) > 0 && !m.hidden).map((m) => m.actor),
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
    warnings: () => marks.map((s) => ({
      x: s.x, z: s.z, radius: s.radius, kind: s.spec.id,
      left: Math.max(0, s.warn - s.t),
    })),
    /**
     * Does something standing here want the PLAYER'S clock slowed, and by how
     * much? `{ active, scale, source, name }`, and `{ active: false, scale: 1 }`
     * when nothing does.
     *
     * This is the one ability in the game that is allowed to touch the player's
     * own time, and it is Malachar's last third and nothing else, ever. THIS
     * FILE DOES NOT APPLY IT. The world clock lives in `app/context.js` as
     * `ctx.clock`, the wyrmsoul system is the only thing that sets its scale,
     * and two systems writing one clock is how a dragon call and a boss phase
     * end up fighting over the same number and neither of them looks broken.
     *
     * So this is a QUESTION, asked every frame by whoever owns that clock, and
     * it is a hook with NO CONSUMER YET: nothing in the tree reads it today.
     * `docs/mmo/wiring/M3.md` section 4 carries the exact lines that would, and
     * says outright that until they land Malachar's last phase is his half
     * speed swing coming OFF and a line saying the room slowed, which is
     * honest and half a boss.
     */
    wantsPlayerSlow() {
      for (const mon of live.values()) {
        if (!mon.playerSlow || num(mon.actor.health) <= 0) continue;
        return { active: true, scale: DRAGON_PLAYER_SCALE, source: mon.id, name: mon.name };
      }
      return { active: false, scale: 1, source: null, name: null };
    },
    /** Which of the twenty one tags this monster is actually running. Debug. */
    tagsOf(mon) { return mon && mon.tags ? [...mon.tags] : []; },
    /** What is being held right now, and what has points off its hit. Tests. */
    holds: () => grabs.map((g) => ({ by: g.mon.id, until: g.until, per: g.per })),
    curses: () => penalties.map((p) => ({ kind: p.kind, points: p.points, until: p.until, direct: p.direct })),
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
      for (const s of marks) { s.mesh.parent?.remove(s.mesh); s.mesh.material.dispose(); }
      marks.length = 0;
      releaseAll(null);
      blows.length = 0;
      chunks.clear();
      levelRecs = [];
      scene?.remove?.(group);
    },
  };
}


// ===========================================================================
// The guard: every note tag, and what actually reads it
// ===========================================================================
//
// M2 added twenty one tags at once and the roster could not tell which of them
// were behaviour and which were decoration, because nothing in the tree wrote
// that down. This table writes it down, one row per tag, and `auditTagRules`
// throws at load if `NOTE_TAG_MEANING` and this table ever stop agreeing. A
// twenty second tag added to the roster now takes this file out on import
// rather than shipping as a sentence nobody reads, which is the whole of the
// twenty-modifier-keys failure in one line.
//
// `where` is one of six, and only two of them mean "a player can feel this":
//
//   'monsters.js'    this file, named function
//   'monster_ai.js'  the ranged table, the spells, the boss plans
//   'actor.js'       a resist, a weakness, a natural guard, a regeneration
//   'roster'         src/mmo/monsters.js itself: spawn tables and its audits
//   'descriptive'    a TRUE statement about a number already on the row. There
//                    is nothing to read and nothing missing.
//   'unwired'        carried by rows and read by NOTHING. Not a lie on the
//                    row, but not a thing that happens either. Counted, so the
//                    number is known instead of assumed.
export const TAG_RULES = {
  // --- where and when it lives
  flying: ['monsters.js', 'isFlyer puts it at hoverHeight and stepMonster brings it down to swing'],
  erratic: ['unwired', 'the approach is a straight line for everything; nothing wanders it'],
  night: ['roster', 'spawnRollFor reads the day and the night list'],
  nightOnly: ['roster', 'it is only written into night lists'],
  snowOnly: ['roster', 'the habitat audit keeps it out of every list that is not snow'],
  fenOnly: ['roster', 'the same, for the fen'],
  coastOnly: ['roster', 'the same, for the coast'],
  noonOnly: ['events.js', 'wanderPointAt returns nothing outside NOON_FROM_H to NOON_TO_H, so the row is nowhere at any other hour'],
  wanders: ['events.js', 'the row route is walked one place an in-game hour; events_runtime spawns it within 600 m and moves ai.home along it'],
  huge: ['roster', 'auditMonsters exempts it from the tier 0 health band'],
  // --- how it moves and swings
  slow: ['unwired', 'the row already carries its own run speed; nothing reads the word'],
  charges: ['unwired', 'no run up and no harder blow at the end of one'],
  parries: ['actor.js', 'spawnMonster gives it a natural guard and Parrying at the row def'],
  swordAndShield: ['descriptive', 'the row AR holds the shield; actor.js gives a parry to `parries` only'],
  plate: ['descriptive', 'the row AR holds the plate'],
  shield: ['descriptive', 'the row AR holds the shield'],
  tailSweep: ['monsters.js', 'tailSweep(): every fourth swing is a cone at SWEEP_RANGE, SWEEP_HALF_ANGLE'],
  dives: ['monsters.js', 'planDive(): the stoop from hover, DIVE_MULT on the blow, then it climbs'],
  // --- groups
  group: ['monsters.js', 'the roster rolls the count; alertGroup pulls the rest of it'],
  sharesAggro: ['monsters.js', 'alertGroup, at GROUP_AGGRO_M'],
  alpha: ['monsters.js', 'sharesAggro() counts it, so a pack comes together'],
  leadsGoblins: ['unwired', 'no goblin spawns around one and none fights better for it'],
  warCry: ['unwired', 'nothing is lifted by a shout'],
  shieldWall: ['monsters.js', 'stepWall(): WALL_MIN of a row within WALL_M carry WALL_AR more'],
  howl: ['monsters.js', 'howl(): the first blow it takes calls its own row within HOWL_M, once'],
  healsAllies: ['monsters.js', 'chantHeal(): the cast lands as health on every hurt ally in HEAL_ALLIES_M'],
  summons: ['monsters.js', 'summonFor(): the row summons block, or the habitat for the four that carry none'],
  // --- what it throws, shoots, casts or breathes
  throwsKnives: ['monster_ai.js', 'RANGED_TAGS: the thrown mode'],
  bow: ['monster_ai.js', 'RANGED_TAGS: the shot mode'],
  boulder: ['monster_ai.js', 'RANGED_TAGS: the thrown mode'],
  rangedSpikes: ['monster_ai.js', 'RANGED_TAGS: the thrown mode'],
  breath: ['monster_ai.js', 'RANGED_TAGS and spellFor: a cone of fire'],
  poisonBreath: ['monster_ai.js', 'spellFor makes the cone poison; poisonLevelOf makes it level 2'],
  casts: ['monster_ai.js', 'RANGED_TAGS and spellFor: a bolt or a fireball'],
  hex: ['monsters.js', 'stepCast: a second cast on HEX_EVERY_S that takes HEX_POINTS off the target hit'],
  stormCall: ['monsters.js', 'stepCast plus startMark(STORM_SPEC): a mark, STORM_WARN_S, then energy'],
  powderCharge: ['monsters.js', 'stepSpecials plus startMark(POWDER_SPEC), every POWDER_EVERY_S'],
  ashCloud: ['monsters.js', 'stepBlows: a landed blow takes ASH_POINTS off the target hit'],
  // --- what it does when it reaches you
  poison1: ['monsters.js', 'poisonLevelOf, onto combat.queueSwing'],
  poison2: ['monsters.js', 'poisonLevelOf, onto combat.queueSwing'],
  poison3: ['monsters.js', 'poisonLevelOf, onto combat.queueSwing'],
  poisonTouch: ['monsters.js', 'poisonLevelOf, level 1'],
  disease10: ['unwired', 'there is no disease in the tree at all'],
  stun: ['unwired', 'combat.js has the stun STATUS; no monster blow applies one off this tag'],
  paralyse15: ['unwired', 'nothing holds you still one blow in seven'],
  silence3: ['unwired', 'nothing stops a cast for three seconds'],
  knockback: ['unwired', 'abilities_runtime has doKnockback for the PLAYER; no monster can push'],
  groundSlam: ['unwired', 'the boss slam is a BOSS PHASE and does not read this tag'],
  webRoot2: ['unwired', 'the root exists (combat.applyStatus, and `grab` uses it) and no web writes one'],
  roots: ['unwired', 'nothing comes out of the ground'],
  frostNova: ['unwired', 'no ring of cold around anything'],
  grab: ['monsters.js', 'stepBlows and grabHold(): GRAB_CHANCE of a landed blow, GRAB_SECONDS of root and damage'],
  ambush: ['monsters.js', 'stepDormant: hidden until AMBUSH_M, then AMBUSH_MULT on the first blow'],
  burrows: ['monsters.js', 'stepDormant and surface(): under for BURROW_UNDER_S, up behind the target'],
  awakens: ['monsters.js', 'stepDormant: visible and inert until AWAKEN_M'],
  dropsFromAbove: ['monsters.js', 'stepDormant and stepAloft: DROP_HEIGHT_M up until you walk under it'],
  dragonTime: ['monsters.js', 'dragonTime() on his own actor; wantsPlayerSlow() is the hook for the rest'],
  // --- what it is made of
  undead: ['actor.js', 'the family, which combat_rules.fleeCheck reads as never fleeing'],
  holyWeak: ['actor.js', 'NOTE_WEAKNESS, applied by monster_ai.weaknessMultiplier'],
  silverWeak: ['actor.js', 'NOTE_WEAKNESS, applied by monster_ai.weaknessMultiplier'],
  fireWeak: ['actor.js', 'NOTE_WEAKNESS, applied by monster_ai.weaknessMultiplier'],
  energyWeak: ['actor.js', 'NOTE_WEAKNESS, applied by monster_ai.weaknessMultiplier'],
  immunePoison: ['actor.js', 'NOTE_RESISTS at RESIST_CAP'],
  coldImmune: ['actor.js', 'NOTE_RESISTS at RESIST_CAP'],
  fireImmune: ['actor.js', 'NOTE_RESISTS at RESIST_CAP. M3 added this one'],
  incorporeal50: ['actor.js', 'NOTE_RESISTS, physical 50'],
  thickHide: ['descriptive', 'the row AR holds the hide'],
  // --- what it does over time
  regen3: ['actor.js', 'spawnMonster writes healthRegen 3'],
  burnStopsRegen: ['unwired', 'nothing burns and nothing stops regenerating'],
  regrows: ['unwired', 'nothing is severed, so nothing grows back'],
  threeHeads: ['unwired', 'one head, one attack'],
  healsInDaylight: ['unwired', 'the sun is on nothing'],
  lifeLeech30: ['unwired', 'makeMonsterActor (the node stand-in) reads it; actor.js spawnMonster, which is what the game runs, does not'],
  manaDrain: ['unwired', 'no monster takes mana'],
  phylactery: ['unwired', 'nothing stands back up'],
  // --- what it leaves
  coinPurse: ['unwired', 'the gold is the tier band or the row gold; the word adds nothing'],
  lootTwice: ['descriptive', 'loot.js rolls twice off the TIER and off boss, not off this word'],
  purpleFloor: ['descriptive', 'loot.js floors a boss at epic off boss, not off this word'],
  champion: ['unwired', 'only isBoss gets a name plate; a champion gets none'],
};

/** Where each tag is dealt with, counted rather than claimed. */
export function tagRuleCounts() {
  const out = {};
  for (const [where] of Object.values(TAG_RULES)) out[where] = (out[where] || 0) + 1;
  return out;
}

/**
 * The roster and this table agree, or the file does not load.
 *
 * Both directions, because both have failed in this project: a tag with no rule
 * is a sentence a player never sees, and a rule for a tag nobody carries is a
 * branch that can never run and will rot.
 */
export function auditTagRules() {
  const bad = [];
  const wheres = new Set(['monsters.js', 'monster_ai.js', 'actor.js', 'events.js', 'roster', 'descriptive', 'unwired']);
  for (const tag of NOTE_TAGS) {
    const rule = TAG_RULES[tag];
    if (!rule) { bad.push(`note tag "${tag}" has no row in TAG_RULES: say where it is acted on, or say 'unwired'`); continue; }
    if (!wheres.has(rule[0])) bad.push(`"${tag}": "${rule[0]}" is not one of ${[...wheres].join(', ')}`);
    if (!rule[1]) bad.push(`"${tag}": no sentence saying how`);
  }
  for (const tag of Object.keys(TAG_RULES)) {
    if (!NOTE_TAGS.has(tag)) bad.push(`TAG_RULES has a rule for "${tag}", which no row carries`);
  }
  if (bad.length) throw new Error(`monsters: ${bad.length} problem(s)\n  ${bad.join('\n  ')}`);
  return tagRuleCounts();
}

auditTagRules();

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
