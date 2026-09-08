// The monsters that are actually standing there. Run: node src/game/monsters.test.mjs
//
// Two halves, and the seam between them is on purpose.
//
// The AI and the spawn maths are driven as PURE FUNCTIONS over plain objects,
// with no scene, no models and no THREE: a fake player at 5.9 m and the same
// fake player at 6.1 m, a hundred frames of walking measured in metres, a leash
// driven past its six seconds and then not quite past them. Every gate is
// driven both ways.
//
// The runtime half then builds real bodies over a stub field, kills them
// through the real `createCombat`, and counts what came out. `actor.js` is
// agent W1's and is being written at the same time, so the actor here is
// `makeMonsterActor`, the stand-in that ships in monsters.js for exactly this
// reason. Everything else, the rules, the resolver, the loot roll and the
// models, is the real thing.

import * as THREE from 'three';
import { CHUNK } from '../world/field.js';
import { MONSTERS, HABITAT, HABITAT_BY_PLACE, NOTE_TAGS } from '../mmo/monsters.js';
import { aggroRadius, LEASH_MS, attackSkill, defenceSkill, swingSeconds, parryChance } from '../mmo/combat_rules.js';
import { createCombat, SWING_LAND_S, actorDistance } from './combat.js';
import { createLootDrops } from './loot_drops.js';
import { buildMonsterModel, auditMonsterShapes, DIE_SECONDS } from './monster_models.js';
import { spawnMonster, WEAKNESS } from './actor.js';
import { generateDungeon, clampToWalkable, walkable, gridOf } from '../world/dungeon_gen.js';
import { CRITTERS } from '../world/fauna.js';
import {
  createMonsters, makeMonsterActor, stepMonster, stepToward, stepAway, speedOf,
  spawnsForChunk, placeFor, blockedAt, poisonLevelOf, sharesAggro, naturalWeapon,
  ALIVE_CAP, SPAWN_KEEP, GROUP_AGGRO_M, GROUP_CHANCE, NEAR_RING, WANDER_R, FLEE_BREAK_M,
  groupsForChunk, GROUPS_PER_CHUNK_MAX, GROUP_SPREAD,
  PROJECTILE_S, DUNGEON_CAP,
  // M3: the twenty one tags of wave A
  TAG_RULES, auditTagRules,
  WALL_M, WALL_MIN, WALL_AR, HEAL_ALLIES_M, HOWL_M,
  DIVE_EVERY_S, DIVE_TRIGGER_M, DIVE_MULT, GRAB_CHANCE, GRAB_SECONDS,
  AMBUSH_M, AMBUSH_MULT, AWAKEN_M, BURROW_EVERY_S, BURROW_UNDER_S, BURROW_MIN_M, BURROW_OUT_M,
  DROP_HEIGHT_M, DROP_UNDER_M, HEX_EVERY_S, HEX_POINTS, HEX_SECONDS, ASH_POINTS, ASH_SECONDS,
  SWEEP_EVERY, SWEEP_RANGE, SWEEP_HALF_ANGLE, DRAGON_SWING, DRAGON_RUN, DRAGON_PLAYER_SCALE,
  SUMMON_AT, SUMMON_COOLDOWN_S,
  // F1: the world's animals through the monster layer
  BIRD_BAND, SPOOK_M,
} from './monsters.js';
import {
  attackModeOf, isFlyer, isBoss, spellFor, coneTargets, castBroken, hoverHeight,
  bossPlanFor, phaseIndexFor, plateText, weaknessMultiplier, rangedWeaponFor,
  dungeonSpawns, normalizeDungeonLayout, dungeonHabitat, groupsForRoom, bossRowsFor,
  auditRangedRows, RANGED_FAR, HOVER_MIN, HOVER_MAX,
  ENRAGE_SWING, SLAM_WARN_S, SLAM_RADIUS, BREATH_RANGE, BREATH_HALF_ANGLE, SUMMON_COUNT,
  BOSS_PLANS, PHASE_WORDS, RANGED_TAGS,
  STORM_WARN_S, STORM_RADIUS, POWDER_WARN_S, POWDER_RADIUS, POWDER_EVERY_S,
} from './monster_ai.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

// ------------------------------------------------------------------- stubs --

function stubField(o = {}) {
  const biome = o.biome || (() => 'meadow');
  const sampleAt = (x, z) => ({
    h: 3, biome: biome(x, z), water: !!(o.water && o.water(x, z)), river: 0,
    land: 1, temp: 0.5, moist: 0.5, site: null,
    zone: o.zone ? o.zone(x, z) : undefined, danger: o.danger || undefined,
  });
  return {
    seed: o.seed ?? 4242, seaLevel: -0.8, chunk: CHUNK,
    sampleAt, heightAt: () => 3, biomeAt: (x, z) => sampleAt(x, z).biome,
    chunkOf: (x, z) => [Math.floor(x / CHUNK), Math.floor(z / CHUNK)],
  };
}

const stubRuntime = (field, o = {}) => ({
  field,
  heightAt: o.heightAt || (() => 3),
  sitesNear: o.sitesNear || (() => []),
  get inDungeon() { return !!o.inDungeon; },
});

/** A fake player: the few fields aggro, leash and the swing actually read. */
const fakePlayer = (x = 0, z = 0) => ({
  id: 'player', kind: 'player', name: 'you',
  pos: { x, y: 0, z }, yaw: 0,
  stats: { str: 20, dex: 20, int: 10, con: 20, wis: 10 },
  skills: { wrestling: 20, tactics: 0, parrying: 0 }, bonuses: {},
  ar: 0, resists: {}, weapon: null, shield: null,
  health: 100, maxHealth: 100, mana: 0, maxMana: 0, stamina: 100, maxStamina: 100,
  buffs: [], status: {}, lastSwingAt: -Infinity, faction: 'player', ai: null, anim: 'idle',
});

/**
 * The same player with no DEX at all. `dodgeChance` is DEX * 0.002, so 20 DEX
 * dodges 4% of everything, and a test driven by a constant rng of 0.01 would
 * see every single blow dodged and read as "monsters do no damage". Taking the
 * DEX out is how a fixed roll can be used to prove the damage path at all.
 */
const noDodge = (p) => { p.stats.dex = 0; return p; };

const seeded = (n) => { let s = n >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };
const gap = (a, b) => Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);

// ================================================================= the aggro
// "vermin 6 m". A giant rat's radius is 6, so 5.9 turns it and 6.1 does not.
{
  const rat = makeMonsterActor('giantRat', { pos: { x: 0, y: 0, z: 0 } });
  check('a giant rat carries the 6 m vermin radius', aggroRadius(rat) === 6, `${aggroRadius(rat)} m`);

  const near = makeMonsterActor('giantRat', { pos: { x: 0, y: 0, z: 0 } });
  const r1 = stepMonster(near, 1 / 60, { player: fakePlayer(5.9, 0), now: 0, rng: seeded(1) });
  check('at 5.9 m it turns and comes', near.ai.target !== null && r1.state === 'chase', r1.state);

  const far = makeMonsterActor('giantRat', { pos: { x: 0, y: 0, z: 0 } });
  const r2 = stepMonster(far, 1 / 60, { player: fakePlayer(6.1, 0), now: 0, rng: seeded(1) });
  check('at 6.1 m it does not', far.ai.target === null && r2.state === 'idle', r2.state);

  // and the boundary itself, which the rule says is inclusive
  const on = makeMonsterActor('giantRat', { pos: { x: 0, y: 0, z: 0 } });
  stepMonster(on, 1 / 60, { player: fakePlayer(6, 0), now: 0, rng: seeded(1) });
  check('at exactly 6 m it comes', on.ai.target !== null);

  // a hunter reaches further, from the same rule and no new number
  const wolf = makeMonsterActor('direWolf', { pos: { x: 0, y: 0, z: 0 } });
  stepMonster(wolf, 1 / 60, { player: fakePlayer(15, 0), now: 0, rng: seeded(1) });
  check('a dire wolf at 15 m comes, on its own tabled 16', wolf.ai.target !== null, `radius ${aggroRadius(wolf)}`);
  const wolf2 = makeMonsterActor('direWolf', { pos: { x: 0, y: 0, z: 0 } });
  stepMonster(wolf2, 1 / 60, { player: fakePlayer(17, 0), now: 0, rng: seeded(1) });
  check('and at 17 m it does not', wolf2.ai.target === null);

  // nothing turns on a corpse, and nothing turns while it is one
  const dead = makeMonsterActor('giantRat', { pos: { x: 0, y: 0, z: 0 } });
  dead.health = 0;
  const rd = stepMonster(dead, 1 / 60, { player: fakePlayer(1, 0), now: 0, rng: seeded(1) });
  check('a dead rat does not aggro', rd.state === 'dead' && dead.ai.target == null);
  const live2 = makeMonsterActor('giantRat', { pos: { x: 0, y: 0, z: 0 } });
  const corpse = fakePlayer(1, 0); corpse.health = 0;
  stepMonster(live2, 1 / 60, { player: corpse, now: 0, rng: seeded(1) });
  check('and nothing aggroes on a corpse', live2.ai.target === null);
}

// ============================================================== the walking
// A hundred frames at 60 Hz is 1.6667 s. A giant rat runs 5.5 m/s, so it should
// close 9.17 m and no more.
{
  // A bone dragon: aggro 24 m, run 9 m/s. Its radius is the one that leaves
  // room for a hundred frames of walking before it is close enough to swing,
  // which is why this is not the giant rat: a rat sees you at 6 m and is inside
  // its own reach two thirds of a second later.
  const dragon = makeMonsterActor('boneDragon', { pos: { x: 0, y: 0, z: 0 } });
  const player = fakePlayer(24, 0);
  const before = gap(dragon, player);
  const rng2 = seeded(2);
  for (let f = 0; f < 100; f++) stepMonster(dragon, 1 / 60, { player, now: f * (1000 / 60), heightAt: () => 3, rng: rng2 });
  const after = gap(dragon, player);
  const closed = before - after;
  const want = 9 * (100 / 60);
  check('100 frames closes the gap at exactly its run speed',
    Math.abs(closed - want) < 1e-6, `closed ${closed.toFixed(3)} m of ${before} at 9 m/s, wanted ${want.toFixed(3)} m`);
  check('and it is walking on the ground it was given', dragon.pos.y === 3, `y ${dragon.pos.y}`);
  check('and facing the way it is going', Math.abs(dragon.yaw - Math.PI / 2) < 1e-6, `yaw ${dragon.yaw.toFixed(3)}`);

  // it stops at reach rather than walking into him
  const close = makeMonsterActor('giantRat', { pos: { x: 0, y: 0, z: 0 } });
  const p2 = fakePlayer(6, 0);
  const rng3 = seeded(3);
  let swings = 0;
  for (let f = 0; f < 600; f++) {
    // the same ground as the fake player, who stands at y 0: three metres of
    // rise would rightly count against reach now and it would close further
    const r = stepMonster(close, 1 / 60, { player: p2, now: f * (1000 / 60), heightAt: () => 0, reach: 2.4, rng: rng3 });
    if (r.wantSwing) swings++;
  }
  const stood = gap(close, p2);
  check('it closes to its reach and stops there', stood <= 2.4 + 1e-6 && stood > 2.0, `${stood.toFixed(3)} m`);

  // on a mountainside it closes until the swing can land: the player stands
  // 2.5 m above the ground the monster walks on, and combat measures the rise
  // past a shoulder, so stopping at 2.4 m flat left both sides hitting nothing
  const slope = makeMonsterActor('giantRat', { pos: { x: 0, y: 0, z: 0 } });
  const up = fakePlayer(6, 0); up.pos.y = 2.5;
  const rng4 = seeded(4);
  let slopeSwings = 0;
  for (let f = 0; f < 600; f++) {
    const r = stepMonster(slope, 1 / 60, { player: up, now: f * (1000 / 60), heightAt: () => 0, reach: 2.4, rng: rng4 });
    if (r.wantSwing) slopeSwings++;
  }
  const flat = gap(slope, up);
  const air = actorDistance(slope, up);
  check('on a slope it closes until combat would let the swing land', air <= 2.4 + 1e-6 && slopeSwings > 0,
    `${flat.toFixed(2)} m flat, ${air.toFixed(2)} m as combat measures it, ${slopeSwings} swings wanted`);
  check('and once there it wants to swing every frame', swings > 500, `${swings} of 600 frames`);

  // Pure movement, measured on its own. dt is clamped at 0.1 s, which is what
  // stops a frame that took a second from teleporting everything a second's
  // worth of ground: 5 m/s over a dt of 0.1 is half a metre, not five.
  const s = stepToward({ x: 0, y: 0, z: 0 }, { x: 10, z: 0 }, 5, 0.1, () => 7);
  check('stepToward moves speed times dt and samples the ground', s.x === 0.5 && s.moved === 0.5 && s.y === 7, `${s.x} m`);
  check('and a one second frame moves no further than a tenth of one',
    stepToward({ x: 0, y: 0, z: 0 }, { x: 10, z: 0 }, 5, 1).x === 0.5);
  check('and never overshoots the point it was aimed at', stepToward({ x: 0, y: 0, z: 0 }, { x: 0.1, z: 0 }, 100, 0.1).x === 0.1);
  const away = stepAway({ x: 0, y: 0, z: 0 }, { x: 1, z: 0 }, 5, 0.1);
  check('stepAway goes the other way', Math.abs(away.x + 0.5) < 1e-9, `${away.x}`);
}

// ================================================================ the leash
{
  const rat = makeMonsterActor('giantRat', { pos: { x: 0, y: 0, z: 0 } });
  const player = fakePlayer(3, 0);
  stepMonster(rat, 1 / 60, { player, now: 0, heightAt: () => 3, rng: seeded(4) });
  check('it is on him', rat.ai.target === player);

  // 2.5 x 6 = 15 m of leash, measured from the monster's HOME to the player.
  // Stand at 40 and wait. The rat is carried out to 20 first so that walking
  // home is a real walk and not a state it passes through in one frame.
  player.pos.x = 40;
  rat.pos.x = 20;
  stepMonster(rat, 1 / 60, { player, now: 1000, heightAt: () => 3, rng: seeded(4) });
  check('one second past the leash it is still coming', rat.ai.target === player, `state ${rat.ai.state}`);
  stepMonster(rat, 1 / 60, { player, now: 1000 + LEASH_MS - 1, heightAt: () => 3, rng: seeded(4) });
  check('a millisecond short of six seconds it is still coming', rat.ai.target === player);
  stepMonster(rat, 1 / 60, { player, now: 1000 + LEASH_MS, heightAt: () => 3, rng: seeded(4) });
  check('at six seconds it gives up and walks home', rat.ai.target === null && rat.ai.state === 'return', rat.ai.state);

  // and standing inside the leash for ten seconds never breaks it
  const stayer = makeMonsterActor('giantRat', { pos: { x: 0, y: 0, z: 0 } });
  const p2 = fakePlayer(3, 0);
  for (let t = 0; t <= 10000; t += 200) {
    p2.pos.x = 3;
    stayer.pos.x = 0; stayer.pos.z = 0;      // hold it still so only the clock moves
    stepMonster(stayer, 0.2, { player: p2, now: t, heightAt: () => 3, rng: seeded(5) });
  }
  check('ten seconds inside the leash never breaks it', stayer.ai.target === p2);
}

// ================================================================= no flee
{
  const wolf = makeMonsterActor('wolf', { pos: { x: 0, y: 0, z: 0 } });
  const player = fakePlayer(5, 0);
  stepMonster(wolf, 1 / 60, { player, now: 0, heightAt: () => 3, rng: seeded(6) });
  check('a wolf at full health comes at you', wolf.ai.state === 'chase' || wolf.ai.state === 'attack', wolf.ai.state);
  wolf.health = wolf.maxHealth * 0.16;
  stepMonster(wolf, 1 / 60, { player, now: 100, heightAt: () => 3, rng: seeded(6) });
  check('at 16% health it is still coming', wolf.ai.state !== 'flee', wolf.ai.state);
  wolf.health = wolf.maxHealth * 0.05;
  stepMonster(wolf, 1 / 60, { player, now: 200, heightAt: () => 3, rng: seeded(6) });
  check('at 5% it still does not break', wolf.ai.state !== 'flee', wolf.ai.state);
  const startGap = gap(wolf, player);
  for (let f = 0; f < 120; f++) {
    stepMonster(wolf, 1 / 60, { player, now: 300 + f * 16.7, heightAt: () => 3, rng: seeded(6) });
  }
  check('and it keeps closing or striking instead of opening a flee gap',
    wolf.ai.state !== 'flee' && gap(wolf, player) <= startGap + 0.2,
    `${startGap.toFixed(1)} m to ${gap(wolf, player).toFixed(1)} m, ${wolf.ai.state}`);

  const skel = makeMonsterActor('skeleton', { pos: { x: 0, y: 0, z: 0 } });
  const p2 = fakePlayer(5, 0);
  skel.health = 1;
  stepMonster(skel, 1 / 60, { player: p2, now: 0, heightAt: () => 3, rng: seeded(7) });
  check('a skeleton on one health does not flee', skel.ai.state !== 'flee', skel.ai.state);
  const golem = makeMonsterActor('ironGolem', { pos: { x: 0, y: 0, z: 0 } });
  golem.health = 1;
  stepMonster(golem, 1 / 60, { player: fakePlayer(5, 0), now: 0, heightAt: () => 3, rng: seeded(7) });
  check('nor does an iron golem', golem.ai.state !== 'flee', golem.ai.state);
}

// ============================================================== the wandering
{
  const rat = makeMonsterActor('giantRat', { pos: { x: 100, y: 0, z: 100 } });
  let maxDrift = 0;
  // ONE generator for the whole minute. A fresh seeded() every frame hands back
  // the same first number every time, and the rat picks the same wander point
  // for ever and shuffles on the spot: an artifact of the test, not of the AI,
  // and worth a comment because it looked exactly like a bug.
  const rng8 = seeded(8);
  for (let f = 0; f < 60 * 60; f++) {
    stepMonster(rat, 1 / 60, { player: null, now: f * 16.7, heightAt: () => 3, rng: rng8 });
    maxDrift = Math.max(maxDrift, Math.hypot(rat.pos.x - 100, rat.pos.z - 100));
  }
  check('a minute of idling never leaves home by more than WANDER_R', maxDrift <= WANDER_R + 1e-6, `${maxDrift.toFixed(2)} m of ${WANDER_R}`);
  check('and it did wander, rather than standing still', maxDrift > 0.5, `${maxDrift.toFixed(2)} m`);
}

// ============================================================ root, stun, slow
{
  const rat = makeMonsterActor('giantRat', { pos: { x: 0, y: 0, z: 0 } });
  check('a clean rat moves at 5.5', speedOf(rat, 0) === 5.5);
  rat.status = { root: { until: 1000, level: 1 } };
  check('a rooted one does not move at all', speedOf(rat, 0) === 0);
  check('and moves again once the root runs out', speedOf(rat, 1000) === 5.5);
  rat.status = { slow: { until: 1000, factor: 0.5 } };
  check('a slow of half is half', speedOf(rat, 0) === 2.75);
  rat.status = { stun: { until: 1000 } };
  const player = fakePlayer(1, 0);
  const r = stepMonster(rat, 1 / 60, { player, now: 0, heightAt: () => 3, reach: 2.4, rng: seeded(9) });
  check('a stunned thing in reach does not swing', r.wantSwing === false);
  rat.status = {};
  const r2 = stepMonster(rat, 1 / 60, { player, now: 1000, heightAt: () => 3, reach: 2.4, rng: seeded(9) });
  check('and swings the moment the stun is over', r2.wantSwing === true);
}

// =============================================================== the spawning
{
  const field = stubField();
  const spawnPoint = { x: 0, z: 0 };
  const near = [];
  const all = [];
  for (let cz = -6; cz <= 6; cz++) {
    for (let cx = -6; cx <= 6; cx++) {
      for (const rec of spawnsForChunk(field, cx, cz, { night: true, spawnPoint, chance: 1 })) {
        all.push(rec);
        const d = Math.hypot(rec.x - spawnPoint.x, rec.z - spawnPoint.z);
        if (d < SPAWN_KEEP) near.push({ rec, d });
      }
    }
  }
  check('the roll put a real number of monsters on the ground', all.length > 100, `${all.length} across 169 chunks`);
  check(`nothing spawned within ${SPAWN_KEEP} m of the start`, near.length === 0,
    `${all.length} placed, closest ${Math.min(...all.map((r) => Math.hypot(r.x, r.z))).toFixed(1)} m`);

  // the other direction: with the keep switched off, some of them ARE in there
  let inside = 0;
  for (let cz = -1; cz <= 1; cz++) {
    for (let cx = -1; cx <= 1; cx++) {
      for (const rec of spawnsForChunk(field, cx, cz, { night: true, spawnKeep: 0, chance: 1 })) {
        if (Math.hypot(rec.x, rec.z) < SPAWN_KEEP) inside++;
      }
    }
  }
  check('and with the keep switched off they do stand there', inside > 0, `${inside} inside 60 m`);

  // a town's ground
  const town = { x: 200, z: 200, kind: 'town', flatR: 46, name: 'Ashford' };
  const sitesNear = () => [town];
  let inTown = 0, total = 0;
  for (let cz = 2; cz <= 4; cz++) {
    for (let cx = 2; cx <= 4; cx++) {
      for (const rec of spawnsForChunk(field, cx, cz, { night: true, sitesNear, chance: 1, spawnPoint })) {
        total++;
        if (Math.hypot(rec.x - town.x, rec.z - town.z) < town.flatR) inTown++;
      }
    }
  }
  check('nothing spawns inside a town', inTown === 0, `${total} placed around Ashford, ${inTown} in it`);

  // deterministic: the same chunk rolls the same camp twice
  const a = spawnsForChunk(field, 12, 7, { night: false, spawnPoint, chance: 1 });
  const b = spawnsForChunk(field, 12, 7, { night: false, spawnPoint, chance: 1 });
  check('the same chunk rolls the same camp every time',
    JSON.stringify(a) === JSON.stringify(b) && a.length > 0, `${a.length} of ${a[0]?.id}`);
  const c = spawnsForChunk(stubField({ seed: 99 }), 12, 7, { night: false, spawnPoint, chance: 1 });
  check('a different seed rolls a different one', JSON.stringify(a) !== JSON.stringify(c), `${a[0]?.id} against ${c[0]?.id}`);

  // night and day are different rosters
  const dayIds = new Set(), nightIds = new Set();
  for (let cz = -6; cz <= 6; cz++) for (let cx = -6; cx <= 6; cx++) {
    for (const r of spawnsForChunk(field, cx, cz, { night: false, spawnPoint, chance: 1 })) dayIds.add(r.id);
    for (const r of spawnsForChunk(field, cx, cz, { night: true, spawnPoint, chance: 1 })) nightIds.add(r.id);
  }
  // M2 put the Legion on the Kingsroad, so the meadow holds more than these four by day; the four must still be there
  check('the meadow by day still holds rats, boars, bandits and goblin scouts',
    ['bandit', 'boar', 'giantRat', 'goblinScout'].every((id) => dayIds.has(id)), [...dayIds].join(', '));
  check('and by night it is wolves, skeletons and zombies',
    nightIds.has('wolf') && nightIds.has('skeleton') && nightIds.has('zombie') && !nightIds.has('boar'), [...nightIds].join(', '));

  // the density interpretation, measured rather than asserted.
  //
  // M5 made GROUP_CHANCE an EXPECTED COUNT and not a probability: at the night
  // spacing of 60 m it is 1.07, and the count is what has to be measured, since
  // a fraction of chunks can never come to more than 1. Groups, not chunks, so
  // the second camp in a chunk is counted.
  let dayGroups = 0, nightGroups = 0, n = 0;
  const groupsIn = (recs) => new Set(recs.map((r) => r.groupKey)).size;
  for (let cz = -20; cz <= 20; cz++) for (let cx = -20; cx <= 20; cx++) {
    n++;
    dayGroups += groupsIn(spawnsForChunk(field, cx, cz, { night: false, spawnPoint }));
    nightGroups += groupsIn(spawnsForChunk(field, cx, cz, { night: true, spawnPoint }));
  }
  const dayRate = dayGroups / n, nightRate = nightGroups / n;
  check('a chunk holds GROUP_CHANCE.day groups by day', Math.abs(dayRate - GROUP_CHANCE.day) < 0.05, `${dayRate.toFixed(3)} against ${GROUP_CHANCE.day.toFixed(3)}`);
  check('and GROUP_CHANCE.night by night', Math.abs(nightRate - GROUP_CHANCE.night) < 0.05, `${nightRate.toFixed(3)} against ${GROUP_CHANCE.night.toFixed(3)}`);
  check('the night is denser than the day, and by the ratio of the two spacings',
    nightRate > dayRate && Math.abs((nightRate / dayRate) - (GROUP_CHANCE.night / GROUP_CHANCE.day)) < 0.15,
    `${(nightRate / dayRate).toFixed(2)}x against ${(GROUP_CHANCE.night / GROUP_CHANCE.day).toFixed(2)}x`);
  // and the roll that makes a fraction of a group real, both directions
  check('a chance of 1.5 is one group always and a second half the time',
    groupsForChunk(1.5, 0) === 2 && groupsForChunk(1.5, 0.49) === 2 && groupsForChunk(1.5, 0.5) === 1 && groupsForChunk(1.5, 0.99) === 1);
  check('a chance under 1 is nothing at all some of the time',
    groupsForChunk(0.58, 0.1) === 1 && groupsForChunk(0.58, 0.9) === 0);
  check('and nothing rolls more than GROUPS_PER_CHUNK_MAX', groupsForChunk(99, 0.99) === GROUPS_PER_CHUNK_MAX);

  // water, and the ocean, which nothing walks on
  check('a hoof in the water is refused', blockedAt(0, 0, { water: true, river: 0 }, {}) === 'water');
  check('a river is refused too', blockedAt(0, 0, { water: false, river: 0.4 }, {}) === 'water');
  check('dry ground away from everything is allowed', blockedAt(500, 500, { water: false, river: 0 }, { spawnPoint }) === null);
  const sea = stubField({ biome: () => 'ocean' });
  let onWater = 0;
  for (let cz = -4; cz <= 4; cz++) for (let cx = -4; cx <= 4; cx++) onWater += spawnsForChunk(sea, cx, cz, { night: true, chance: 1 }).length;
  check('nothing stands on the open sea', onWater === 0);

  // a ruin overrules the biome it stands in
  const ruin = { x: 32, z: 32, kind: 'ruin', flatR: 14 };
  check('a ruin reads as a ruin, not as the meadow round it', placeFor(field, [ruin], 32, 32) === 'ruin');
  check('and ten metres past its ground it is the meadow again', placeFor(field, [ruin], 32 + 40, 32) === 'meadow');
}

// ================================================================== the cap
{
  const field = stubField();
  const scene = new THREE.Group();
  const runtime = stubRuntime(field);
  // Three groups a chunk, which is over any spacing the game ships, because the
  // point of this block is the cap and not the density: at one group a chunk
  // the 49 chunks of the near ring want about 110 bodies and a cap of 140 would
  // never be reached, so nothing would be proved.
  const monsters = createMonsters(scene, runtime, { groupChance: 3, rng: seeded(11), spawnPoint: { x: 1e6, z: 1e6 } });
  const player = fakePlayer(20 * CHUNK, 20 * CHUNK);
  monsters.update(1 / 60, 1000, player, true);
  const wanted = monsters.stats.capped + monsters.count;
  check('the near ring wanted more than the cap', wanted > ALIVE_CAP, `${wanted} wanted`);
  check(`and exactly ${ALIVE_CAP} are standing`, monsters.count === ALIVE_CAP, `${monsters.count}`);
  check('the near ring is 7 x 7 chunks', monsters.stats.chunks === (NEAR_RING * 2 + 1) ** 2, `${monsters.stats.chunks}`);

  // every one of them is a body in the scene with a place on the ground
  const bodies = monsters.targets();
  check('every one of them has a body in the scene', bodies.length === monsters.count && bodies.every((b) => b.parent === monsters.group));
  check('and all of them are standing on the ground the runtime gave', monsters.all().every((m) => m.actor.pos.y === 3));

  // walking a long way re-rolls the ring and the cap still holds
  for (let i = 1; i <= 6; i++) {
    player.pos.x += CHUNK * 3;
    monsters.update(1 / 60, 1000 + i * 1000, player, true);
  }
  // The cap is a SWEEP cap and not a hard ceiling, and it never was: rescan()
  // refuses to vanish a body that has a target, because a wolf disappearing
  // out of a fight is worse than a wolf over the cap. So the claim is the cap
  // plus whatever is mid fight, and both halves are counted here rather than
  // assumed. Before M5 this passed at a cap of 80 by luck, with nothing in the
  // ring fighting at the moment it was asked.
  const fighting = monsters.all().filter((m) => m.actor.ai && m.actor.ai.target).length;
  check('and it still holds after walking 18 chunks, but for the ones mid fight',
    monsters.count <= ALIVE_CAP + fighting,
    `${monsters.count} standing, ${fighting} in a fight, cap ${ALIVE_CAP}`);
  monsters.dispose();
  check('disposing takes every body out of the scene', scene.children.length === 0);
}

// ============================================== one of each one of a kind (M5)
//
// A place's roster is rolled per chunk and a boss is written into his own
// lair's table, so the roll wants one of him per chunk that lands on him. The
// Old Cellars are forty six chunks wide. Both directions: the boss is deduped
// and the giant rat, which is a kind of animal and not an animal, is not.
{
  const field = stubField({ zone: () => 'oldcellars' });
  const scene = new THREE.Group();
  const monsters = createMonsters(scene, stubRuntime(field), {
    groupChance: 3, rng: seeded(31), spawnPoint: { x: 1e6, z: 1e6 },
  });
  const player = fakePlayer(40 * CHUNK, 40 * CHUNK);
  monsters.update(1 / 60, 1000, player, false);
  const count = (id) => monsters.all().filter((m) => m.row.id === id).length;
  check('the roll wanted more than one Sergeant Oram Blackhand', monsters.stats.doubles > 0,
    `${monsters.stats.doubles} second copies thrown away`);
  check('and exactly one of him is standing', count('oramBlackhand') === 1, `${count('oramBlackhand')}`);
  check('while the giant rats, a kind and not a creature, are not touched', count('giantRat') > 1,
    `${count('giantRat')} rats`);

  // and he stays the SAME one across a sweep: an already standing boss wins
  // over a nearer record, so nobody watches him blink out and back in.
  const was = monsters.all().find((m) => m.row.id === 'oramBlackhand');
  const key = was && was.key;
  player.pos.x += CHUNK;
  monsters.update(1 / 60, 2000, player, false);
  const now2 = monsters.all().find((m) => m.row.id === 'oramBlackhand');
  check('and he is still the same body after the player has walked a chunk',
    !!now2 && now2.key === key, `${key} then ${now2 && now2.key}`);
  monsters.dispose();
}

// ======================================================== the group, the aggro
{
  const field = stubField();
  const scene = new THREE.Group();
  const monsters = createMonsters(scene, stubRuntime(field), { groupChance: 0, rng: seeded(12) });
  // build a private camp by hand: three skeletons in a line, 7 m apart
  const line = [0, 7, 14].map((z) => {
    const a = makeMonsterActor('skeleton', { pos: { x: 0, y: 3, z } });
    return a;
  });
  check('skeletons share aggro, a thorn grub does not',
    sharesAggro(MONSTERS.skeleton) === true && sharesAggro(MONSTERS.thornGrub) === false);

  // the sharing rule itself, measured on distance
  const player = fakePlayer(0, -9);        // 9 m from the first, 16 from the second
  stepMonster(line[0], 1 / 60, { player, now: 0, heightAt: () => 3, rng: seeded(13) });
  check('the near one aggroes at 9 m, inside a skeleton\'s 10', line[0].ai.target === player);
  stepMonster(line[1], 1 / 60, { player, now: 0, heightAt: () => 3, rng: seeded(13) });
  check('the one at 16 m does not, on its own', line[1].ai.target === null);
  check(`and it is ${GROUP_AGGRO_M} m away from its friend, which is inside the sharing radius`,
    Math.abs(line[1].pos.z - line[0].pos.z) <= GROUP_AGGRO_M);
  monsters.dispose();
}

// ================================================================ packs (M5)
//
// "A wolf pack, a dog pack and a goblin band spawn together." Measured on the
// roll itself and then on the pull, because a pack that spawns in one place and
// then fights one at a time is not a pack.
{
  const field = stubField({ zone: () => 'beechhangar' });
  const spawnPoint = { x: 1e6, z: 1e6 };
  const packs = { wolf: [], wildDog: [], goblinScout: [] };
  let spread = 0, biggest = 0;
  for (let cz = -30; cz <= 30; cz++) for (let cx = -30; cx <= 30; cx++) {
    const recs = spawnsForChunk(field, cx, cz, { night: true, spawnPoint, chance: 1 });
    const byGroup = new Map();
    for (const r of recs) {
      if (!byGroup.has(r.groupKey)) byGroup.set(r.groupKey, []);
      byGroup.get(r.groupKey).push(r);
    }
    for (const members of byGroup.values()) {
      if (packs[members[0].id]) packs[members[0].id].push(members.length);
      if (members.length > biggest) biggest = members.length;
      for (const a of members) for (const b of members) {
        const d = Math.hypot(a.x - b.x, a.z - b.z);
        if (d > spread) spread = d;
      }
    }
  }
  const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
  check('a wolf group is three to four bodies, never one and never two',
    packs.wolf.length > 20 && Math.min(...packs.wolf) >= 3 && Math.max(...packs.wolf) <= 4,
    `${packs.wolf.length} packs, ${mean(packs.wolf).toFixed(2)} wolves each`);
  // Each member is the anchor plus or minus GROUP_SPREAD in x AND in z, so the
  // furthest two members of a group can be that box's diagonal apart and no
  // more. Measured, because "they spawn together" is worth nothing as a claim.
  const maxApart = GROUP_SPREAD * 2 * Math.SQRT2;
  check(`and no two members of any group stand more than ${maxApart.toFixed(1)} m apart`,
    spread <= maxApart + 0.001, `${spread.toFixed(1)} m at the widest, over groups of up to ${biggest}`);
  check('the roster says a wolf pack is 3 to 4, a dog pack 3 to 5 and a goblin band 2 to 3',
    MONSTERS.wolf.group.join() === '3,4' && MONSTERS.wildDog.group.join() === '3,5' && MONSTERS.goblinScout.group.join() === '2,3');
  check('and all three hunt together, while a boar and a thorn grub do not',
    sharesAggro(MONSTERS.wolf) && sharesAggro(MONSTERS.wildDog) && sharesAggro(MONSTERS.goblinScout)
    && !sharesAggro(MONSTERS.boar) && !sharesAggro(MONSTERS.thornGrub));

  // The pull, through the real update loop. The pack stands as it really spawns,
  // a cluster inside GROUP_SPREAD, and the player is put JUST outside every
  // member's own aggro but for one, so what is being measured is alertGroup and
  // not five monsters each noticing him separately.
  const cluster = [[0, 0], [5, 0], [0, 5], [5, 5], [-5, 0]];
  const pull = (id, n, standOff) => {
    const sc2 = new THREE.Group();
    const pack = createMonsters(sc2, stubRuntime(stubField()), { groupChance: 0, rng: seeded(77) });
    for (let i = 0; i < n; i++) pack.spawnAt(id, cluster[i][0], cluster[i][1]);
    const p2 = fakePlayer(0, -standOff);
    p2.pos.y = 3;
    pack.update(1 / 60, 1000, p2, true);
    pack.update(1 / 60, 1016, p2, true);
    const onIt = pack.all().filter((m) => m.actor.ai && m.actor.ai.target === p2).length;
    pack.dispose();
    return onIt;
  };
  const alone = (id, n, standOff) => {
    // the same stand off, with the sharing switched off by distance: every
    // member moved out past GROUP_AGGRO_M of the one that sees him
    const sc2 = new THREE.Group();
    const pack = createMonsters(sc2, stubRuntime(stubField()), { groupChance: 0, rng: seeded(78) });
    for (let i = 0; i < n; i++) pack.spawnAt(id, i * (GROUP_AGGRO_M + 4), 0);
    const p2 = fakePlayer(0, -standOff);
    p2.pos.y = 3;
    pack.update(1 / 60, 1000, p2, true);
    pack.update(1 / 60, 1016, p2, true);
    const onIt = pack.all().filter((m) => m.actor.ai && m.actor.ai.target === p2).length;
    pack.dispose();
    return onIt;
  };
  for (const [id, n, standOff, word] of [['wolf', 4, 13.5, 'pack'], ['wildDog', 5, 11.5, 'pack'], ['goblinScout', 3, 11, 'band']]) {
    const came = pull(id, n, standOff);
    check(`pulling one of a ${word} of ${n} ${MONSTERS[id].name} pulls all of it`, came === n, `${came} of ${n} came`);
    const solo = alone(id, n, standOff);
    check(`and spread past ${GROUP_AGGRO_M} m only the one that saw you comes`, solo === 1, `${solo} of ${n} came`);
  }
}

// ============================================== the fight, the sack, the list
{
  const field = stubField();
  const scene = new THREE.Group();
  const combat = createCombat({ rng: seeded(21) });
  const loot = createLootDrops(scene, {});
  const deadUntil = [];
  let clock = 1_000_000;
  const monsters = createMonsters(scene, stubRuntime(field), {
    combat, loot, deadUntil, groupChance: 1, rng: seeded(22),
    clock: () => clock, spawnPoint: { x: 1e6, z: 1e6 },
  });
  const player = fakePlayer(20 * CHUNK, 20 * CHUNK);
  monsters.update(1 / 60, 1000, player, true);
  const before = monsters.count;
  check('a camp is standing', before > 0, `${before} of them`);

  const victim = monsters.all()[0];
  const key = victim.key;
  combat.kill(victim.actor, player);
  check('killing one takes it out of the live list', monsters.count === before - 1);
  check('and writes it into the character\'s dead list', deadUntil.length === 1 && deadUntil[0].key === key);
  const wait = (deadUntil[0].until - clock) / 1000;
  check('with a return between eight and fifteen minutes', wait >= 480 && wait <= 900, `${(wait / 60).toFixed(1)} minutes`);
  check('a sack is on the ground where it fell', loot.count === 1, `${loot.count} bag`);
  const bag = loot.bags()[0];
  check('and the sack is where the body was',
    Math.abs(bag.pos.x - victim.actor.pos.x) < 1e-6 && Math.abs(bag.pos.z - victim.actor.pos.z) < 1e-6);

  // The body topples, then goes. Counted on THIS body and not on the layer's
  // total: the cap immediately promotes the forty-first candidate into the dead
  // one's place, so the number of bodies standing does not change at all and a
  // count would go green over a corpse that never left.
  check('the body is still there while it falls over', victim.model.group.parent === monsters.group);
  check('and it is lying down', victim.model.anim === 'die');
  for (let f = 0; f < 120; f++) monsters.update(1 / 60, 1000 + f * 16.7, player, true);
  // the topple is done in two seconds, but the body lies there as long as its
  // sack does (CORPSE_KEEP_S), so a knife has something to skin
  check('the body lies still once it has fallen over, and is still there for the knife',
    victim.model.group.parent === monsters.group && victim.model.dieDone === true
    && monsters.corpsesNear(victim.actor.pos, 1).length === 1 && monsters.corpsesNear(victim.actor.pos, 1)[0].skinned === false);
  for (let f = 0; f < 90 * 60; f++) monsters.update(1 / 60, 3000 + f * 16.7, player, true);
  check('and it is taken away after ninety seconds',
    victim.model.group.parent === null && monsters.corpsesNear(victim.actor.pos, 1).length === 0);

  // it does not come back while you are standing on it
  clock += 1000 * 1000;                                 // long past its return
  player.pos.x = victim.rec.x; player.pos.z = victim.rec.z;
  monsters.rescan(player.pos.x, player.pos.z, true);
  check('it does not come back while you are standing there', deadUntil.some((e) => e.key === key));
  // and it does the moment you leave
  player.pos.x = victim.rec.x + 200;
  monsters.rescan(player.pos.x, player.pos.z, true);
  check('and its slot is freed once you walk away', !deadUntil.some((e) => e.key === key));
  monsters.dispose();
  loot.dispose();
}

// ============================================= a monster hits you, through combat
{
  const field = stubField();
  const scene = new THREE.Group();
  const combat = createCombat({ rng: () => 0.01 });        // every swing connects
  const monsters = createMonsters(scene, stubRuntime(field), {
    combat, groupChance: 0, rng: seeded(31), spawnPoint: { x: 1e6, z: 1e6 },
  });
  const player = noDodge(fakePlayer(0, 0));
  const before = player.health;
  // one rat, put down by hand at 3 m, and then thirty seconds of frames
  const rec = { id: 'giantRat', key: 'test:0', groupKey: 'test', cx: 0, cz: 0, i: 0, x: 3, z: 0, y: 3 };
  monsters.rescan(0, 0, false);
  const mon = monsters.all()[0] || null;
  check('nothing spawned with the chance at zero', mon === null && monsters.count === 0);

  // so drive the AI and combat directly, which is the same path update() takes
  const rat = makeMonsterActor('giantRat', { pos: { x: 3, y: 0, z: 0 } });
  let swings = 0;
  for (let f = 0; f < 60 * 30; f++) {
    const now = f * (1000 / 60);
    const r = stepMonster(rat, 1 / 60, { player, now, heightAt: () => 0, reach: combat.reachBetween(rat, player), rng: seeded(32) });
    if (r.wantSwing) { if (combat.queueSwing(rat, player, { now }).queued) swings++; }
    combat.update(1 / 60, now);
  }
  const secs = 30, expect = Math.floor(secs / 2.0);
  check('thirty seconds of a giant rat is fifteen swings at its 2.0 s speed', swings === expect, `${swings}`);
  check('and the player is down real health', player.health < before, `${before - player.health} taken of ${before}`);
  check('a rat cannot kill a fresh character in thirty seconds', player.health > 0);
  monsters.dispose();
}

// ============================================================== the poison
{
  check('a zombie\'s touch is poison 1', poisonLevelOf(MONSTERS.zombie) === 1);
  check('a giant spider is poison 2', poisonLevelOf(MONSTERS.giantSpider) === 2);
  check('a bandit carries none', poisonLevelOf(MONSTERS.bandit) === 0);

  const combat = createCombat({ rng: () => 0.01 });
  const zombie = makeMonsterActor('zombie', { pos: { x: 0, y: 0, z: 0 } });
  const player = noDodge(fakePlayer(1, 0));
  combat.queueSwing(zombie, player, { now: 0, poison: poisonLevelOf(MONSTERS.zombie) });
  combat.update(0, 400);
  check('and a landed touch really poisons you', !!player.status.poison, JSON.stringify(player.status.poison || {}));
  const health = player.health;
  combat.update(1, 1400);
  check('which then takes 2 a second', health - player.health === 2, `${health - player.health}`);
}

// =============================================================== the models
{
  check('every monster above tier 0 has a silhouette', auditMonsterShapes() === true);
  let built = 0, critters = 0, tallest = null;
  const missing = [];
  for (const m of Object.values(MONSTERS)) {
    const model = buildMonsterModel(m.id);
    // F1: tier 0 used to be counted as a failure HERE, with a bare `fail++` and
    // no line printed, so eleven animals gaining bodies read as eleven silent
    // failures with nothing to say what they were. Now they are counted.
    if (!model) { missing.push(m.id); continue; }
    if (m.tier === 0) { critters++; model.dispose(); continue; }
    built++;
    if (!tallest || model.height > tallest.h) tallest = { id: m.id, h: model.height };
    if (model.radius <= 0 || model.height <= 0) check(`${m.id} has a real size`, false);
  }
  check('every monster in the roster builds a body', missing.length === 0 && built === Object.values(MONSTERS).filter((m) => m.tier > 0).length,
    missing.length ? `no body for ${missing.join(', ')}` : `${built} bodies`);
  check('and every tier 0 animal builds one too, which is what makes it a thing you can click',
    critters === Object.values(MONSTERS).filter((m) => m.tier === 0).length, `${critters} animals`);
  check('and the biggest of them is a boss', MONSTERS[tallest.id].tier >= 5, `${tallest.id} at ${tallest.h.toFixed(1)} m`);
  // F1: a critter used to build NOTHING here, and that was the user's bug. A
  // null body made `monsters.spawn` refuse to stand a rabbit up, so no animal
  // in the world was ever an actor and none of them could be clicked. Every
  // tier 0 row has a procedural body now, and the bodies are measured in
  // src/game/monster_models.test.mjs.
  const bunny = buildMonsterModel('rabbit');
  check('a critter builds a body too, which is what makes it targetable',
    !!bunny && !!bunny.parts.hit, bunny ? `${bunny.height.toFixed(2)} m tall` : 'null');
  bunny?.dispose();
  check('an unknown id builds nothing rather than a grey cube', buildMonsterModel('grue') === null);

  const rat = buildMonsterModel('giantRat');
  check('a rat is low and long, and on four legs', rat.height < 0.8 && Object.keys(rat.studioActor.rig.joints).filter(k=>/^(front|rear)[LR]$/.test(k)).length === 4, `${rat.height.toFixed(2)} m`);
  const spider = buildMonsterModel('giantSpider');
  check('a spider has eight', Object.keys(spider.studioActor.rig.joints).filter(k=>/^leg[LR][0-3]$/.test(k)).length === 8);
  const skel = buildMonsterModel('skeleton');
  check('a skeleton is thinner than a zombie of the same tier',
    skel.radius < buildMonsterModel('zombie').radius, `${skel.radius.toFixed(2)} against ${buildMonsterModel('zombie').radius.toFixed(2)}`);

  // the gait is a function of ground covered, not of time
  const walker = buildMonsterModel('wolf');
  walker.setAnim('walk');
  walker.update(1 / 60, 0);
  const legs = Object.values(walker.studioActor.rig.joints).filter(b=>/^(front|rear)[LR]$/.test(b.name));
  const rest = legs.map(b=>b.quaternion.clone());
  walker.update(1/60,0);
  check('a walking clip freezes when the wolf covers no ground', legs.every((b,i)=>b.quaternion.angleTo(rest[i])<1e-6));
  let moved=0;for(let f=0;f<30;f++){walker.update(1/60,8.5);legs.forEach((b,i)=>moved=Math.max(moved,b.quaternion.angleTo(rest[i])));}
  check('covering ground advances the native leg bones', moved>.05, `${moved.toFixed(3)} rad`);

  // die is a one way door, and it finishes
  const dying = buildMonsterModel('skeleton');
  const head=dying.studioActor.rig.joints.head,headUp=head.getWorldPosition(new THREE.Vector3()).y;
  dying.setAnim('die');
  check('the topple has not finished on the first frame', dying.dieDone === false);
  for (let f = 0; f < Math.ceil(DIE_SECONDS * 60) + 2; f++) dying.update(1 / 60, 0);
  check('and it has after DIE_SECONDS', dying.dieDone === true);
  check('and the native head settles substantially below its standing height', head.getWorldPosition(new THREE.Vector3()).y<headUp*.7);
  dying.setAnim('walk');
  check('a dead thing does not get up', dying.anim === 'die');
}

// ================================================== the natural weapon and reach
{
  const w = naturalWeapon(MONSTERS.giantRat);
  // the row is written 2 to 5 and carries MONSTER_DAMAGE_FACTOR (combat_pace.js) on the way in
  check('a giant rat swings its own row, 2 to 5 scaled by the damage factor, every 2.0 s', w.minDamage === MONSTERS.giantRat.damage[0] && w.maxDamage === MONSTERS.giantRat.damage[1] && MONSTERS.giantRat.baseDamage[0] === 2 && MONSTERS.giantRat.baseDamage[1] === 5 && w.speed === 2.0, JSON.stringify(MONSTERS.giantRat.damage));
  const ogre = naturalWeapon(MONSTERS.ogre);
  check('and an ogre reaches further than a rat', ogre.reach > w.reach, `${ogre.reach} against ${w.reach}`);
}

// ============================================================ picking targets
{
  const field = stubField();
  const scene = new THREE.Group();
  const monsters = createMonsters(scene, stubRuntime(field), { groupChance: 1, rng: seeded(41), spawnPoint: { x: 1e6, z: 1e6 } });
  const player = fakePlayer(20 * CHUNK, 20 * CHUNK);
  monsters.update(1 / 60, 1000, player, true);
  const any = monsters.all()[0];

  // straight in front, within range
  const to = any.actor.pos;
  const yaw = Math.atan2(to.x - player.pos.x, to.z - player.pos.z);
  const d = Math.hypot(to.x - player.pos.x, to.z - player.pos.z);
  const found = monsters.nearestHostile(player.pos, yaw, d + 1, Math.PI / 8);
  check('the nearest hostile in front is found', found !== null, found ? found.name : 'none');
  check('and looking the other way finds nothing', monsters.nearestHostile(player.pos, yaw + Math.PI, d + 1, Math.PI / 8) === null);
  check('and neither does looking at it from just out of range', monsters.nearestHostile(player.pos, yaw, d - 0.5, Math.PI / 8) === null);
  check('an actor can be looked up from its record', monsters.forActor(any.actor) === any);
  monsters.dispose();
}

// ============================================ the row's numbers reach the rules
//
// makeMonsterActor is a stand-in for W1's spawnMonster, but a stand-in that
// hands the resolver the wrong numbers is worse than none: every fight in the
// game would be off and nothing would say so. So every row is checked through
// combat_rules' own readers.
{
  let badHit = [], badDef = [], badSwing = [], badDamage = [];
  for (const row of Object.values(MONSTERS)) {
    if (row.tier === 0) continue;
    const a = makeMonsterActor(row.id, { pos: { x: 0, y: 0, z: 0 } });
    if (Math.abs(attackSkill(a) - row.hit) > 1e-9) badHit.push(row.id);
    if (Math.abs(defenceSkill(a) - row.def) > 1e-9) badDef.push(`${row.id} ${defenceSkill(a)} not ${row.def}`);
    if (Math.abs(swingSeconds(a) - Math.max(0.9, row.speed)) > 1e-9) badSwing.push(row.id);
    const w = a.weapon;
    if (w.minDamage !== row.damage[0] || w.maxDamage !== row.damage[1]) badDamage.push(row.id);
  }
  check('every monster attacks at exactly its tabled hit', badHit.length === 0, badHit.join(', '));
  check('and defends at exactly its tabled def', badDef.length === 0, badDef.slice(0, 3).join('; '));
  check('and swings at exactly its tabled speed', badSwing.length === 0, badSwing.join(', '));
  check('and hits for exactly its tabled range', badDamage.length === 0, badDamage.join(', '));

  // the ones the document says parry, and the ones it does not
  const sw = makeMonsterActor('skeletonWarrior', { pos: { x: 0, y: 0, z: 0 } });
  const rat = makeMonsterActor('giantRat', { pos: { x: 0, y: 0, z: 0 } });
  check('a skeleton warrior parries, because it has a sword and a shield', parryChance(sw) > 0, `${(parryChance(sw) * 100).toFixed(0)}%`);
  check('and a giant rat does not', parryChance(rat) === 0);
  check('and both still defend at their tabled numbers',
    defenceSkill(sw) === MONSTERS.skeletonWarrior.def && defenceSkill(rat) === MONSTERS.giantRat.def);

  // a vampire knight's 30% life leech, which its notes promise
  const vk = makeMonsterActor('vampireKnight', { pos: { x: 0, y: 0, z: 0 } });
  check('a vampire knight really carries its 30% leech', vk.bonuses.lifeLeech === 30);
  check('and a bone knight carries none', makeMonsterActor('boneKnight', { pos: { x: 0, y: 0, z: 0 } }).bonuses.lifeLeech === 0);
}

// ###########################################################################
// G3: underground, ranged and casting, bosses, flying, weaknesses.
//
// Same seam as above. The placement maths, the standoff, the cone, the phase
// thresholds and the weakness multiplier are driven as pure functions; the
// layer, the projectiles, the casts and the phase announcements are driven
// through the real `update()` with a real `createCombat` under it.
// ###########################################################################

// ---------------------------------------------------------------- stubs ---

/** A level in the shape world_runtime.js has to hand over. Three rooms. */
const threeRooms = (o = {}) => ({
  kind: 'dungeon', level: o.level ?? 1, top: 3, bottom: !!o.bottom,
  cellSize: 2, w: 24, h: 24, id: o.id || 'shaft',
  rooms: [{ x: 2, z: 2, w: 4, h: 4 }, { x: 10, z: 2, w: 4, h: 4 }, { x: 2, z: 12, w: 4, h: 4 }],
});

/** Six rooms, for the tests that need a particular monster to be down there. */
const sixRooms = (o = {}) => ({
  kind: 'dungeon', level: o.level ?? 1, top: 3, bottom: !!o.bottom,
  cellSize: 2, w: 40, h: 40, id: o.id || 'deep',
  rooms: [
    { x: 2, z: 2, w: 5, h: 5 }, { x: 12, z: 2, w: 5, h: 5 }, { x: 24, z: 2, w: 5, h: 5 },
    { x: 2, z: 14, w: 5, h: 5 }, { x: 14, z: 16, w: 5, h: 5 }, { x: 28, z: 24, w: 5, h: 5 },
  ],
});

/** A runtime standing in a level. `inside` and `layout` are both mutable. */
function dungeonRuntime(field, layout, o = {}) {
  const st = {
    field, inside: true, layout,
    heightAt: () => 0,
    sitesNear: () => [],
    get inDungeon() { return st.inside; },
    get dungeonLevel() { return st.layout.level; },
    get dungeonSite() { return { id: st.layout.id, kind: st.layout.kind }; },
    dungeonLayout: () => st.layout,
    clampWalkable: o.clampWalkable || ((x, z) => [x, z]),
  };
  return st;
}

/** The world seed that puts `id` in this level at all. Deterministic, and it says so. */
function seedWith(layout, id, max = 3000) {
  const L = normalizeDungeonLayout(layout);
  for (let s = 1; s <= max; s++) {
    const recs = dungeonSpawns(L, { seed: s });
    const rec = recs.find((r) => r.id === id);
    if (rec) return { seed: s, rec, recs };
  }
  return null;
}

// ================================================== the roster reads as ranged
{
  check('the ranged table covers every note tag in the roster', auditRangedRows() === true);
  check('a goblin scout throws', attackModeOf(MONSTERS.goblinScout) === 'thrown', attackModeOf(MONSTERS.goblinScout));
  check('a manticore throws its spikes', attackModeOf(MONSTERS.manticore) === 'thrown');
  check('a cyclops throws a boulder', attackModeOf(MONSTERS.cyclops) === 'thrown');
  check('a cultist casts', attackModeOf(MONSTERS.cultist) === 'cast');
  check('a lich casts', attackModeOf(MONSTERS.lich) === 'cast');
  check('a wyvern breathes, and breath beats the poison it carries', attackModeOf(MONSTERS.wyvern) === 'breath');
  check('a bone dragon breathes', attackModeOf(MONSTERS.boneDragon) === 'breath');
  // and the other direction, which is the half that is usually skipped
  check('a wolf does not', attackModeOf(MONSTERS.wolf) === 'melee');
  check('nor does an ogre, whose slam is not a thing it throws', attackModeOf(MONSTERS.ogre) === 'melee');
  check('nor a frost giant, whose nova is around itself', attackModeOf(MONSTERS.frostGiant) === 'melee');

  const ranged = Object.values(MONSTERS).filter((m) => attackModeOf(m) !== 'melee').map((m) => m.id);
  // M2's Legion archers and casters took this from eight to twenty five; the rule, not the count, is the promise
  check('every row that attacks at range does it through a mode the table knows', ranged.length >= 8 && ranged.every((id) => ['thrown', 'shot', 'cast', 'breath'].includes(attackModeOf(MONSTERS[id]))), `${ranged.length} rows: ${ranged.join(', ')}`);

  const cultist = spellFor(MONSTERS.cultist);
  check('a cultist throws a fireball for its own 8 to 14, scaled by the damage factor',
    cultist.damageType === 'fire' && cultist.base[0] === MONSTERS.cultist.damage[0] && cultist.base[1] === MONSTERS.cultist.damage[1] && MONSTERS.cultist.baseDamage.join() === '8,14', JSON.stringify(cultist.base));
  const lich = spellFor(MONSTERS.lich);
  check('a lich throws a bolt of energy for its own 30 to 50, scaled by the damage factor',
    lich.damageType === 'energy' && lich.base[0] === MONSTERS.lich.damage[0] && lich.base[1] === MONSTERS.lich.damage[1] && MONSTERS.lich.baseDamage.join() === '30,50', `${lich.damageType} ${JSON.stringify(lich.base)}`);
  const wyvern = spellFor(MONSTERS.wyvern);
  check('a wyvern breathes poison in a 6 m cone',
    wyvern.damageType === 'poison' && wyvern.cone.range === 6, `${wyvern.damageType} ${wyvern.cone?.range} m`);
  check('and a wolf has no spell at all', spellFor(MONSTERS.wolf) === null);

  // the reach trap: a knife thrown 12 m with a reach of 1.5 is queued and then
  // binned by landSwing's REACH_SLACK gate 300 ms later, silently
  const w = rangedWeaponFor({ weapon: naturalWeapon(MONSTERS.goblinScout) }, MONSTERS.goblinScout);
  check('a thrown weapon carries its range as its reach, or the blow is binned in the air',
    w.ranged === true && w.reach === RANGED_FAR, `reach ${w.reach}`);
  check('and keeps the row\'s own skill, damage and speed',
    w.skill === 'wrestling' && w.minDamage === MONSTERS.goblinScout.damage[0] && w.maxDamage === MONSTERS.goblinScout.damage[1] && MONSTERS.goblinScout.baseDamage.join() === '3,7' && w.speed === 2.4, JSON.stringify(MONSTERS.goblinScout.damage));
}

// ================================================================ the cone
{
  const at = { x: 0, y: 0, z: 0 };
  const infront = { pos: { x: 0, y: 0, z: 5 }, health: 10 };
  const behind = { pos: { x: 0, y: 0, z: -5 }, health: 10 };
  const far = { pos: { x: 0, y: 0, z: 9 }, health: 10 };
  const wide = { pos: { x: 5, y: 0, z: 1 }, health: 10 };
  const dead = { pos: { x: 0, y: 0, z: 2 }, health: 0 };
  const got = coneTargets(at, 0, BREATH_RANGE, BREATH_HALF_ANGLE, [infront, behind, far, wide, dead]);
  check('a breath catches what is in front of it', got.includes(infront));
  check('and not what is behind it', !got.includes(behind));
  check('and not what is past its 6 m', !got.includes(far), `${BREATH_RANGE} m`);
  check('and not what is out to the side of a 60 degree cone', !got.includes(wide));
  check('and never a corpse', !got.includes(dead));
  check('so one of five is caught', got.length === 1, `${got.length}`);
}

// =============================================== it never gives ground, measured
//
// The full drive, at twelve metres, three and one, with the flee rules driven
// both ways, is `monster_ai.test.mjs`. What is here is the shape of it against
// the same helpers the rest of this file uses.
{
  // A goblin scout: aggro 12 m, throws. Put the player at 11 m and hold him
  // still for five seconds. It has no band to keep any more, so it should not
  // move at all.
  const goblin = makeMonsterActor('goblinScout', { pos: { x: 0, y: 0, z: 0 } });
  goblin.weapon = rangedWeaponFor(goblin, MONSTERS.goblinScout);
  const player = fakePlayer(11, 0);
  let lo = Infinity, hi = 0, throws = 0;
  const rngA = seeded(51);
  for (let f = 0; f < 300; f++) {
    const r = stepMonster(goblin, 1 / 60, {
      player, now: f * (1000 / 60), heightAt: () => 0, mode: 'thrown', rng: rngA,
    });
    if (r.wantSwing) throws++;
    const g = gap(goblin, player);
    lo = Math.min(lo, g); hi = Math.max(hi, g);
  }
  check('at 11 m, inside its 14 m reach, it stands still for 300 frames',
    Math.abs(hi - lo) < 1e-6 && Math.abs(lo - 11) < 1e-6, `${lo.toFixed(3)} m to ${hi.toFixed(3)} m`);
  check('and it wanted to throw the whole time', throws > 290, `${throws} of 300 frames`);

  // now walk him in to 3 m and let go. It used to walk backwards here.
  player.pos.x = 3;
  const started = gap(goblin, player);
  let moved = 0, wanted = 0, inMelee = 0;
  for (let f = 0; f < 300; f++) {
    const r = stepMonster(goblin, 1 / 60, {
      player, now: 6000 + f * (1000 / 60), heightAt: () => 0, mode: 'thrown', rng: rngA,
    });
    if (r.moved > 0) moved++;
    if (r.wantSwing) wanted++;
    if (r.melee) inMelee++;
  }
  const ended = gap(goblin, player);
  check('closed to 3 m it does not walk backwards', ended <= started + 1e-9,
    `${started.toFixed(2)} m to ${ended.toFixed(2)} m`);
  check('and it did not move a step in 300 frames', moved === 0, `${moved} moving frames`);
  check('and it kept throwing at 3 m', wanted > 290, `${wanted} of 300 frames`);
  check('and 3 m is not melee reach, so it is still the knife', inMelee === 0, `${inMelee} melee frames`);
  check('and it is still facing him',
    Math.abs(Math.atan2(player.pos.x - goblin.pos.x, player.pos.z - goblin.pos.z) - goblin.yaw) < 1e-6);

  // walk him all the way in: it fights with its hands rather than giving ground
  player.pos.x = 1;
  let handsy = 0, gaveGround = 0;
  let last = gap(goblin, player);
  for (let f = 0; f < 300; f++) {
    const r = stepMonster(goblin, 1 / 60, {
      player, now: 12000 + f * (1000 / 60), heightAt: () => 0, mode: 'thrown', rng: rngA,
    });
    if (r.melee && r.wantSwing) handsy++;
    const g = gap(goblin, player);
    if (g > last + 1e-9) gaveGround++;
    last = g;
  }
  check('at 1 m it swings with its hands instead of throwing', handsy > 290, `${handsy} of 300 frames`);
  check('and it never opened the gap by so much as a millimetre', gaveGround === 0, `${gaveGround} frames`);

  // a melee row is untouched by any of it
  const wolf = makeMonsterActor('wolf', { pos: { x: 0, y: 0, z: 0 } });
  const p2 = fakePlayer(12, 0);
  for (let f = 0; f < 300; f++) stepMonster(wolf, 1 / 60, { player: p2, now: f * 16.7, heightAt: () => 0, rng: seeded(52) });
  check('a wolf still walks all the way in', gap(wolf, p2) < 3, `${gap(wolf, p2).toFixed(2)} m`);
}

// ============================================ a wall is no longer a special case
{
  // The old code had a `cornered` flag: backed against a wall for 0.6 s a
  // thrower gave up backing away and used its hands. Nothing backs away now, so
  // the wall changes nothing at all and the flag is gone. Both are measured.
  const wall = (x, z) => [Math.min(9, x), z];
  const goblin = makeMonsterActor('goblinScout', { pos: { x: 8, y: 0, z: 0 } });
  goblin.weapon = rangedWeaponFor(goblin, MONSTERS.goblinScout);
  const player = fakePlayer(5, 0);
  const at0 = goblin.pos.x;
  let sawCornered = false;
  for (let f = 0; f < 120; f++) {
    const r = stepMonster(goblin, 1 / 60, {
      player, now: f * (1000 / 60), heightAt: () => 0, clampXZ: wall, mode: 'thrown', rng: seeded(53),
    });
    if (r.cornered) sawCornered = true;
  }
  check('a thrower with a wall behind it does not move', Math.abs(goblin.pos.x - at0) < 1e-9,
    `x ${goblin.pos.x.toFixed(3)}`);
  check('and no step of it reports a cornered flag any more', sawCornered === false);
  check('and ai.cornered is never written', goblin.ai.cornered === undefined);
}

// ================================================================== flying
{
  const bat = makeMonsterActor('caveBat', { pos: { x: 0, y: 0, z: 0 } });
  check('a cave bat is a flyer, and a wolf is not', isFlyer(MONSTERS.caveBat) && !isFlyer(MONSTERS.wolf));
  const flyers = Object.values(MONSTERS).filter(isFlyer).map((m) => m.id);
  // eleven since M2 (hawks, gulls, storm wyverns); each says so in its row
  check('every flyer carries the flying tag or the flying kind', flyers.length >= 4 && flyers.every((id) => (MONSTERS[id].notes || []).includes('flying') || MONSTERS[id].kind === 'flying'), `${flyers.length} rows: ${flyers.join(', ')}`);

  const ground = 3;
  let lo = Infinity, hi = -Infinity, moved = 0;
  const rngF = seeded(61);
  for (let f = 0; f < 200; f++) {
    const r = stepMonster(bat, 1 / 60, {
      player: null, now: f * (1000 / 60), heightAt: () => ground, flying: true, rng: rngF,
    });
    lo = Math.min(lo, r.altitude); hi = Math.max(hi, r.altitude);
    moved += r.moved;
  }
  check(`a hovering bat holds ${HOVER_MIN} to ${HOVER_MAX} m over the ground for 200 frames`,
    lo >= HOVER_MIN - 1e-9 && hi <= HOVER_MAX + 1e-9, `${lo.toFixed(3)} m to ${hi.toFixed(3)} m`);
  check('and it really bobbed rather than sitting at one height', hi - lo > 0.2, `${(hi - lo).toFixed(3)} m of bob`);
  check('and its y is the ground plus that, not the ground', bat.pos.y > ground + HOVER_MIN - 1e-9, `y ${bat.pos.y.toFixed(2)}`);
  check('and it drifted about like everything else does', moved > 0.5, `${moved.toFixed(2)} m`);

  // the swoop: it comes down to be hit, and goes back up
  const p = fakePlayer(1, 0);
  let low = Infinity;
  for (let f = 0; f < 60; f++) {
    const r = stepMonster(bat, 1 / 60, { player: p, now: 5000 + f * 16.7, heightAt: () => ground, flying: true, reach: 2.4, rng: rngF });
    low = Math.min(low, r.altitude);
  }
  check('attacking, it swoops to the floor where a sword can reach it', low < 0.4, `${low.toFixed(3)} m`);
  bat.ai.target = null; bat.ai.state = 'idle';        // as a leash break would leave it
  let back = 0, lowest = Infinity;
  for (let f = 0; f < 300; f++) {
    const r = stepMonster(bat, 1 / 60, { player: null, now: 12000 + f * 16.7, heightAt: () => ground, flying: true, rng: rngF });
    back = r.altitude;
    if (f > 120) lowest = Math.min(lowest, r.altitude);
  }
  check('and once it is done it goes back up', back >= HOVER_MIN - 1e-9, `${back.toFixed(3)} m`);
  check('and stays up', lowest >= HOVER_MIN - 1e-9, `lowest ${lowest.toFixed(3)} m`);
}

// ================================ the named places spawn what the sheet says
// Before this, placeFor answered a biome and HABITAT_BY_PLACE was read by
// nothing: eighty three place tables were decoration. Both directions here.
{
  const road = stubField({ zone: () => 'kingsroad', danger: [1, 1] });
  const ids = new Set();
  for (let k = 0; k < 40; k++) for (const rec of spawnsForChunk(road, k, 3, { night: false, chance: 1 })) ids.add(rec.id);
  const want = new Set(HABITAT_BY_PLACE.kingsroad.day);
  check('placeFor answers the named place the field sample carries', placeFor(road, [], 10, 10) === 'kingsroad');
  check('a Kingsroad chunk spawns from the Kingsroad table by day', ids.size > 0 && [...ids].every((id) => want.has(id)), [...ids].join(', ') || 'nothing');
  check('and the Legion, tier 2, stands there in spite of the realm band of 1 to 1', [...ids].some((id) => MONSTERS[id].tier === 2), [...ids].map((id) => id + ':' + MONSTERS[id].tier).join(', '));
  const nightIds = new Set();
  for (let k = 0; k < 40; k++) for (const rec of spawnsForChunk(road, k, 3, { night: true, chance: 1 })) nightIds.add(rec.id);
  check('by night the road table changes', [...nightIds].every((id) => HABITAT_BY_PLACE.kingsroad.night.includes(id)) && nightIds.size > 0, [...nightIds].join(', '));

  // the other way: open Greenwold between the places is a realm zone with no table, and the band holds
  const open = stubField({ zone: () => 'greenwold', danger: [1, 1] });
  const openIds = new Set();
  for (let k = 0; k < 60; k++) for (const rec of spawnsForChunk(open, k, 5, { night: true, chance: 1 })) openIds.add(rec.id);
  check('open Greenwold ground falls back to the meadow table', placeFor(open, [], 10, 10) === 'meadow');
  check('and nothing above tier 1 spawns on it', openIds.size > 0 && [...openIds].every((id) => MONSTERS[id].tier <= 1), [...openIds].map((id) => id + ':' + MONSTERS[id].tier).join(', '));
  const noZone = stubField();
  check('a field with no zone at all still answers the biome', placeFor(noZone, [], 10, 10) === 'meadow');
}

// ======================================= F1: critters, the spook and the perch
// Through the REAL path: createMonsters asks runtime.critterSpawns for a chunk's
// animals, update() spooks them, stepMonster flies the bird. No stepMonster
// driven by hand here, so what is measured is what a player would see.
{
  const field = stubField();
  const scene = new THREE.Group();
  const ground = 3;
  const recs = [
    { id: 'gull', key: 'critter:0,0:gull:0', groupKey: 'critter:0,0:gull', cx: 0, cz: 0, i: 0, x: 3, z: 0, y: ground },
    { id: 'deer', key: 'critter:0,0:deer:0', groupKey: 'critter:0,0:deer', cx: 0, cz: 0, i: 0, x: 0, z: 40, y: ground },
  ];
  let asked = 0;
  const runtime = { ...stubRuntime(field), critterSpawns: (cx, cz) => { asked++; return (cx === 0 && cz === 0) ? recs : []; } };
  const monsters = createMonsters(scene, runtime, { groupChance: 0, rng: seeded(77), spawnPoint: { x: 1e6, z: 1e6 } });
  const player = fakePlayer(30, 0);                       // 27 m from the gull, 50 from the deer
  let t = 1000;
  const run = (frames) => { for (let f = 0; f < frames; f++) { t += 1000 / 60; monsters.update(1 / 60, t, player, false); } };
  run(2);
  const gull = monsters.all().find((m) => m.row.id === 'gull') || null;
  const deer = monsters.all().find((m) => m.row.id === 'deer') || null;
  check('chunkFor asked the runtime for critters and both stood up through the sweep', asked > 0 && gull && deer, `asked ${asked}, ${monsters.all().map((m) => m.row.id).join(', ')}`);
  if (gull && deer) {
    // perched: nobody near, so the bird sits on the ground for five seconds
    let hi = -Infinity;
    for (let f = 0; f < 300; f++) { run(1); hi = Math.max(hi, gull.actor.pos.y - ground); }
    check('a gull nobody is near stays on the ground for 300 frames', hi <= 0.01, `highest ${hi.toFixed(3)} m`);
    check('and the deer 50 m off is idle, not spooked', deer.actor.ai.state !== 'flee', deer.actor.ai.state);

    // approach: inside the old spook range no longer makes animals bolt
    player.pos.x = gull.actor.pos.x + SPOOK_M - 1; player.pos.z = gull.actor.pos.z;   // it drifts while idle, so measure from where it is
    run(1);
    check(`walk inside ${SPOOK_M} m and the gull does not bolt`, gull.actor.ai.state !== 'flee', gull.actor.ai.state);
    let lo = Infinity; hi = -Infinity;
    run(240);
    for (let f = 0; f < 120; f++) { run(1); const alt = gull.actor.pos.y - ground; lo = Math.min(lo, alt); hi = Math.max(hi, alt); }
    check('and it stays on the ground rather than climbing into a flee band',
      hi <= 0.05, `${lo.toFixed(2)} to ${hi.toFixed(2)} m`);
    check('a bird still has the flying flag the model reads for its wings', !!gull.flyer);

    // the deer: the same old spook range, still on the ground
    player.pos.x = deer.actor.pos.x; player.pos.z = deer.actor.pos.z - SPOOK_M + 1;
    run(1);
    check('the deer does not bolt either', deer.actor.ai.state !== 'flee', deer.actor.ai.state);
    const dz0 = deer.actor.pos.z;
    run(60);
    check('and it does not open a flee gap', deer.actor.ai.state !== 'flee' && deer.actor.pos.z <= dz0 + 0.5,
      `${(deer.actor.pos.z - dz0).toFixed(2)} m along +z`);
    // both directions of the flying flag: every animal fauna.js flies is a flyer in the roster, and no walker is
    const flyMismatch = Object.entries(CRITTERS).filter(([id, c]) => MONSTERS[id] && !!c.flying !== isFlyer(MONSTERS[id])).map(([id]) => id);
    check('fauna.js and the roster agree on which animals fly', flyMismatch.length === 0, flyMismatch.join(', ') || Object.keys(CRITTERS).filter((id) => CRITTERS[id].flying).join(', ') + ' fly');

    // walk off: the bird is still settled
    player.pos.x = 0; player.pos.z = -60;
    run(60 * 20);
    check('twenty seconds after you leave the gull is still on the ground', Math.abs(gull.actor.pos.y - ground) <= 0.05 && gull.actor.ai.state !== 'flee', `${(gull.actor.pos.y - ground).toFixed(3)} m, ${gull.actor.ai.state}`);
  }
  monsters.dispose();
}

// =================================================== weaknesses, measured twice
{
  const golem = spawnMonster('ironGolem', { x: 0, y: 0, z: 0 });
  check('an iron golem is weak to energy and carries the vulnerability',
    golem.weakTo.includes('energy') && golem.vulnerability.energy === WEAKNESS, JSON.stringify(golem.vulnerability));
  const energy = { weapon: { damageType: 'energy', minDamage: 40, maxDamage: 40, speed: 2, skill: 'wrestling' } };
  const steel = { weapon: { damageType: 'physical', minDamage: 40, maxDamage: 40, speed: 2, skill: 'wrestling' } };
  check('an energy blow on it multiplies by 1.25', weaknessMultiplier(energy, golem) === 1.25, `${weaknessMultiplier(energy, golem)}`);
  check('and a steel one by 1.0, which is the other half of the test', weaknessMultiplier(steel, golem) === 1, `${weaknessMultiplier(steel, golem)}`);
  const wolf = spawnMonster('wolf', { x: 0, y: 0, z: 0 });
  check('and nothing at all applies to a wolf', weaknessMultiplier(energy, wolf) === 1);
  const skel = spawnMonster('skeleton', { x: 0, y: 0, z: 0 });
  check('a skeleton is weak to holy', weaknessMultiplier({ weapon: { damageType: 'holy' } }, skel) === 1.25);
  const wolfman = spawnMonster('werewolf', { x: 0, y: 0, z: 0 });
  check('a werewolf is weak to silver, which is a MATERIAL and not a damage type',
    weaknessMultiplier({ weapon: { damageType: 'physical', material: 'silver' } }, wolfman) === 1.25);
  check('and a plain iron sword does nothing extra to it',
    weaknessMultiplier({ weapon: { damageType: 'physical', material: 'iron' } }, wolfman) === 1);

  // and now through the real resolver, twice, with the same rolls
  const bigHitter = () => ({
    id: 'p', kind: 'player', name: 'you', pos: { x: 0, y: 0, z: 0 }, yaw: 0,
    stats: { str: 0, dex: 0, int: 0, con: 0, wis: 0 },
    skills: { wrestling: 100, tactics: 0, anatomy: 0, parrying: 0 }, bonuses: {},
    ar: 0, resists: {}, shield: null,
    weapon: { skill: 'wrestling', minDamage: 200, maxDamage: 200, speed: 2, weight: 0, damageType: 'energy', ranged: false, reach: 3 },
    health: 100, maxHealth: 100, mana: 0, maxMana: 0, stamina: 100, maxStamina: 100,
    buffs: [], status: {}, lastSwingAt: -Infinity, faction: 'player', ai: null, anim: 'idle',
  });
  const run = (useWeakness) => {
    const scene = new THREE.Group();
    const combat = createCombat({ rng: seeded(71) });
    const field = stubField();
    const monsters = createMonsters(scene, stubRuntime(field), { combat, groupChance: 0, rng: seeded(72), spawnPoint: { x: 1e6, z: 1e6 } });
    const target = spawnMonster('ironGolem', { x: 1, y: 0, z: 0 });
    const me = bigHitter();
    const before = target.health;
    if (useWeakness) monsters.swingAt(me, target, { now: 0 });
    else combat.queueSwing(me, target, { now: 0 });
    combat.update(0, 400);
    monsters.dispose();
    return before - target.health;
  };
  const plain = run(false), weak = run(true);
  check('the same swing on an energy-weak golem does more through swingAt', weak > plain, `${plain} then ${weak}`);
  check('and it does exactly a quarter more, not some other number',
    Math.abs(weak / plain - 1.25) < 0.01, `${(weak / plain).toFixed(4)}x`);
}

// ====================================================== the level, room by room
{
  const L = normalizeDungeonLayout(threeRooms());
  check('a three room level normalises', !!L && L.rooms.length === 3);
  check('and room zero is the one you walk in through', L.entry === 0, `entry ${L.entry}`);
  check('and the deepest room is the far one, not the near one', L.deepest === 2, `deepest ${L.deepest}`);

  const recs = dungeonSpawns(L, { seed: 4242 });
  const rooms = new Set(recs.map((r) => r.room));
  check('nothing at all stands in the entry room', !rooms.has(0), [...rooms].join(', '));
  check('and rooms one and two both hold a group', rooms.has(1) && rooms.has(2), [...rooms].join(', '));
  check('so two of the three rooms are occupied', rooms.size === 2, `${recs.length} monsters in ${rooms.size} rooms`);
  check('every one of them is a real monster', recs.every((r) => !!MONSTERS[r.id]));
  check('and every one of them is a dungeon1 monster',
    recs.every((r) => HABITAT.dungeon1.day.includes(r.id)), [...new Set(recs.map((r) => r.id))].join(', '));

  // it is a function of the site and the depth and nothing else
  const again = dungeonSpawns(normalizeDungeonLayout(threeRooms()), { seed: 4242 });
  check('the same level rolls the same monsters every time', JSON.stringify(recs) === JSON.stringify(again));
  const deeper = dungeonSpawns(normalizeDungeonLayout(threeRooms({ level: 2 })), { seed: 4242 });
  check('and level two of the same shaft is not level one of it',
    JSON.stringify(recs) !== JSON.stringify(deeper), `${recs.length} then ${deeper.length}`);
  const other = dungeonSpawns(normalizeDungeonLayout(threeRooms({ id: 'other' })), { seed: 4242 });
  check('and another shaft is another level again', JSON.stringify(recs) !== JSON.stringify(other));

  // metres, not cells. Room one spans grid x 10..13 on a 24 wide grid at 2 m.
  const inRoom1 = recs.filter((r) => r.room === 1);
  const x0 = (10 - 11.5) * 2, x1 = (13 - 11.5) * 2;
  check('a monster in room one is standing inside room one, in metres',
    inRoom1.every((r) => r.x >= x0 - 1e-9 && r.x <= x1 + 1e-9), inRoom1.map((r) => r.x.toFixed(1)).join(', '));

  // room size decides how many groups
  check('a 64 square metre room earns one group', groupsForRoom({ area: 64 }) === 1);
  check('and a 200 square metre room earns two', groupsForRoom({ area: 200 }) === 2);
  check('and nothing earns more than three', groupsForRoom({ area: 100000 }) === 3);

  // a level with no grid width cannot be turned into metres, and says so
  check('a layout with no grid is refused rather than misplaced',
    normalizeDungeonLayout({ rooms: [{ x: 1, z: 1, w: 3, h: 3 }], level: 1, kind: 'dungeon' }) === null);
  check('and so is one with no rooms', normalizeDungeonLayout({ w: 20, h: 20, rooms: [], level: 1 }) === null);
}

// ================================================================ the boss room
{
  check('dungeon3 is the habitat with the bosses in it', bossRowsFor('dungeon3').length === 4, `${bossRowsFor('dungeon3').length}`);
  check('and dungeon1 has none', bossRowsFor('dungeon1').length === 0);
  check('dungeon level 2 reads the dungeon2 roster', dungeonHabitat('dungeon', 2) === 'dungeon2');
  check('and a cave reads the cave roster whatever its depth', dungeonHabitat('cave', 1) === 'cave');

  const bottom = dungeonSpawns(normalizeDungeonLayout(threeRooms({ level: 3, bottom: true })), { seed: 4242 });
  const bosses = bottom.filter((r) => r.boss);
  check('at the bottom of a shaft there is exactly one boss', bosses.length === 1, `${bosses.length}`);
  check('and it is standing in the deepest room', bosses[0].room === 2, `room ${bosses[0].room}`);
  check('and it is a boss row', isBoss(MONSTERS[bosses[0].id]), bosses[0].id);
  check('and the boss room holds nothing but the boss',
    bottom.filter((r) => r.room === 2).length === 1);
  check('and the other room still holds its group', bottom.some((r) => r.room === 1 && !r.boss));

  const notBottom = dungeonSpawns(normalizeDungeonLayout(threeRooms({ level: 3, bottom: false })), { seed: 4242 });
  check('one floor short of the bottom there is no boss at all',
    notBottom.every((r) => !r.boss), notBottom.filter((r) => r.boss).map((r) => r.id).join(', '));
  check('and the deepest room holds an ordinary group instead', notBottom.some((r) => r.room === 2));
  check('and no ordinary room anywhere ever rolls a boss',
    bottom.every((r) => r.room === 2 || !isBoss(MONSTERS[r.id])));
}

// ============================================ the layer: on, off, and back again
{
  const field = stubField();
  const scene = new THREE.Group();
  const combat = createCombat({ rng: seeded(81) });
  const layout = sixRooms();
  const rt = dungeonRuntime(field, layout);
  const deadUntil = [];
  let clock = 2_000_000;
  const monsters = createMonsters(scene, rt, {
    actorFactory: (id, o) => spawnMonster(id, o.pos),
    combat, deadUntil, rng: seeded(82), clock: () => clock, groupChance: 0,
  });
  const player = fakePlayer(0, 0);

  monsters.update(1 / 60, 1000, player, false);
  const recs = monsters.levelSpawns();
  check('a level underground rolls a roster', recs.length > 0, `${recs.length} in six rooms`);
  check('and bodies are standing in it', monsters.count > 0, `${monsters.count} of ${recs.length}`);
  check('and the layer says which level it is', monsters.layer === 'deep:1', String(monsters.layer));
  check('none of them is in the entry room', recs.every((r) => r.room !== 0));
  check('every body is on the dungeon floor, not on a hillside', monsters.all().every((m) => m.actor.pos.y === 0 || m.flyer));

  // climb out: the level empties
  rt.inside = false;
  monsters.update(1 / 60, 2000, player, false);
  check('climbing out takes every one of them away', monsters.count === 0, `${monsters.count}`);
  check('and the layer is the surface again', monsters.layer === null);

  // go back down: the same roll comes back
  rt.inside = true;
  monsters.update(1 / 60, 3000, player, false);
  check('going back down rolls exactly the same roster',
    JSON.stringify(monsters.levelSpawns()) === JSON.stringify(recs), `${monsters.levelSpawns().length}`);

  // a room cleared before you left is still clear when you come back
  const victim = monsters.all().find((m) => !m.boss);
  const key = victim.key;
  combat.kill(victim.actor, player);
  check('killing one writes its key, which carries the site, the level and the room',
    deadUntil.some((e) => e.key === key) && key.startsWith('deep:1:r'), key);
  rt.inside = false; monsters.update(1 / 60, 4000, player, false);
  rt.inside = true; monsters.update(1 / 60, 5000, player, false);
  check('and it is not standing there when you come back down',
    !monsters.all().some((m) => m.key === key), key);
  check('while the rest of its room is', monsters.all().some((m) => m.rec.room === victim.rec.room));

  // a deeper level is a different roster and a different set of keys
  rt.layout = sixRooms({ level: 2 });
  monsters.update(1 / 60, 6000, player, false);
  check('the stair down builds a new layer', monsters.layer === 'deep:2', String(monsters.layer));
  check('and its monsters are the dungeon2 roster, not the dungeon1 one',
    monsters.levelSpawns().every((r) => HABITAT.dungeon2.day.includes(r.id)),
    [...new Set(monsters.levelSpawns().map((r) => r.id))].join(', '));
  monsters.dispose();
}

// ================================================ nothing walks through the rock
{
  // The REAL generator and the REAL clamp, not a stand-in for either.
  const site = { id: 'realshaft', name: 'Real Shaft', cx: 3, cz: 5, kind: 'dungeon' };
  const real = generateDungeon(4242, site, 1);
  const asLayout = {
    kind: real.kind, level: real.level, top: real.top, cellSize: real.cellSize,
    w: real.w, h: real.h, id: site.id, entrance: real.entrance,
    rooms: real.rooms.map((r) => ({ x: r.x, z: r.z, w: r.w, h: r.h, cx: r.cx, cz: r.cz })),
    bottom: false,
  };
  const field = stubField();
  const scene = new THREE.Group();
  const combat = createCombat({ rng: seeded(91) });
  const rt = dungeonRuntime(field, asLayout, {
    clampWalkable: (x, z) => { const c = clampToWalkable(real, x, z); return [c.x, c.z]; },
  });
  const monsters = createMonsters(scene, rt, {
    actorFactory: (id, o) => spawnMonster(id, o.pos), combat, rng: seeded(92), groupChance: 0,
  });
  const ent = { gx: real.entrance.gx, gz: real.entrance.gz };
  const px = (ent.gx - (real.w - 1) / 2) * real.cellSize;
  const pz = (ent.gz - (real.h - 1) / 2) * real.cellSize;
  const player = fakePlayer(px, pz);

  monsters.update(1 / 60, 1000, player, false);
  check('a real generated level holds a real roster', monsters.count > 0, `${monsters.count} bodies`);
  const startedOnFloor = monsters.all().every((m) => {
    const g = gridOf(real, m.actor.pos.x, m.actor.pos.z);
    return walkable(real, g.gx, g.gz);
  });
  check('every one of them is placed on a floor cell', startedOnFloor);

  // walk the player round the level and let them chase him for ten seconds
  let offFloor = 0, steps = 0;
  for (let f = 0; f < 600; f++) {
    const t = f / 60;
    player.pos.x = px + Math.sin(t) * 14;
    player.pos.z = pz + Math.cos(t * 0.7) * 14;
    const c = clampToWalkable(real, player.pos.x, player.pos.z);
    player.pos.x = c.x; player.pos.z = c.z;
    monsters.update(1 / 60, 1000 + f * 16.7, player, false);
    combat.update(1 / 60, 1000 + f * 16.7);
    for (const m of monsters.all()) {
      steps++;
      const g = gridOf(real, m.actor.pos.x, m.actor.pos.z);
      if (!walkable(real, g.gx, g.gz)) offFloor++;
    }
  }
  check('and ten seconds of chasing never puts one inside the rock',
    offFloor === 0, `${offFloor} of ${steps} monster frames off the floor`);
  check('and they really did move rather than standing still', steps > 1000, `${steps} monster frames`);
  monsters.dispose();
}

// ==================================================== a knife, and when it lands
{
  const layout = sixRooms();
  const found = seedWith(layout, 'goblinScout');
  check('a level that holds a goblin scout can be found', !!found, found ? `seed ${found.seed}` : 'none in 3000 seeds');
  const field = stubField({ seed: found.seed });
  const scene = new THREE.Group();
  const combat = createCombat({ rng: () => 0.01 });          // every throw connects
  const rt = dungeonRuntime(field, layout);
  const monsters = createMonsters(scene, rt, {
    actorFactory: (id, o) => spawnMonster(id, o.pos), combat, rng: seeded(101), groupChance: 0,
  });
  // stand ten metres from the goblin, which is inside its band and its aggro
  const player = noDodge(fakePlayer(found.rec.x + 10, found.rec.z));
  monsters.update(1 / 60, 0, player, false);
  const goblin = monsters.all().find((m) => m.id === 'goblinScout');
  check('the goblin scout is standing in the level', !!goblin);
  // clear the room, so every number below is the goblin's and nobody else's
  for (const m of monsters.all()) if (m !== goblin) combat.kill(m.actor, player);
  check('and it is the only thing left alive down there', monsters.count === 1, `${monsters.count}`);
  check('and its weapon reaches as far as it throws', goblin.actor.weapon.reach === RANGED_FAR, `${goblin.actor.weapon.reach} m`);

  // A goblin scout swings every 2.4 s, and combat.queueSwing holds it to that,
  // so the first knife cannot leave the hand before frame 144 at 60 Hz.
  // Its gap to the player is watched every frame: it may close, and it may not
  // open, because nothing in the game gives ground except a flee.
  const gap0 = gap(goblin.actor, player);
  let launched = -1, opened = 0, widest = gap0, last = gap0;
  for (let f = 0; f < 400 && launched < 0; f++) {
    monsters.update(1 / 60, f * (1000 / 60), player, false);
    combat.update(1 / 60, f * (1000 / 60));
    const g = gap(goblin.actor, player);
    if (g > last + 1e-9) opened++;
    if (g > widest) widest = g;
    last = g;
    if (monsters.projectiles().length) launched = f;
  }
  check('it throws rather than walking up to you', launched >= 0, `first knife on frame ${launched}`);
  check('and it never gave ground on the way, not on one frame', opened === 0,
    `${opened} frames wider, from ${gap0.toFixed(2)} m to ${last.toFixed(2)} m, widest ${widest.toFixed(2)} m`);
  const start = { ...monsters.projectiles()[0].pos };

  // it must not be there before its time, and must be there at its time
  let early = 0, arrivedAt = -1;
  for (let f = 1; f <= 30; f++) {
    monsters.update(1 / 60, (launched + f) * (1000 / 60), player, false);
    combat.update(1 / 60, (launched + f) * (1000 / 60));
    const p = monsters.projectiles()[0];
    if (!p) { if (arrivedAt < 0) arrivedAt = -2; break; }
    if (p.arrived && arrivedAt < 0) arrivedAt = f;
    if (!p.arrived) {
      const gone = Math.hypot(p.pos.x - start.x, p.pos.z - start.z);
      const whole = Math.hypot(p.to.x - start.x, p.to.z - start.z);
      if (gone > whole * 0.999) early++;
    }
  }
  const wantFrames = Math.round(PROJECTILE_S * 60);
  check('the knife is never at the target before its flight time is up', early === 0, `${early} early frames`);
  check(`and it arrives on frame ${wantFrames}, which is ${PROJECTILE_S} s at 60 Hz`,
    arrivedAt === wantFrames, `frame ${arrivedAt}`);
  check('and the player is down real health from a knife thrown ten metres',
    player.health < player.maxHealth, `${player.maxHealth - player.health} off`);
  check('and the throw went through combat, once, at the row\'s own speed',
    monsters.stats.shots >= 1, `${monsters.stats.shots} thrown`);
  monsters.dispose();
}

// ============================================================= a cast, and a blow
{
  const layout = sixRooms({ level: 2 });
  const found = seedWith(layout, 'cultist');
  check('a level that holds a cultist can be found', !!found, found ? `seed ${found.seed}` : 'none');
  const lines = [];
  const hud = { log: (t) => lines.push(t) };

  /** The cultist alone in the level, and the frame its cast starts on. */
  const build = () => {
    const field = stubField({ seed: found.seed });
    const scene = new THREE.Group();
    const combat = createCombat({ rng: () => 0.01 });
    const rt = dungeonRuntime(field, layout);
    const monsters = createMonsters(scene, rt, {
      actorFactory: (id, o) => spawnMonster(id, o.pos), combat, hud, rng: seeded(111), groupChance: 0,
    });
    const player = noDodge(fakePlayer(found.rec.x + 10, found.rec.z));
    player.maxHealth = 100000; player.health = 100000;
    monsters.update(1 / 60, 0, player, false);
    const cultist = monsters.all().find((m) => m.id === 'cultist');
    for (const m of monsters.all()) if (m !== cultist) combat.kill(m.actor, player);
    // stand ten metres off THAT cultist, which is inside its band and its aggro
    if (cultist) { player.pos.x = cultist.actor.pos.x + 10; player.pos.z = cultist.actor.pos.z; }
    let started = -1;
    for (let f = 1; f < 600 && started < 0; f++) {
      monsters.update(1 / 60, f * (1000 / 60), player, false);
      combat.update(1 / 60, f * (1000 / 60));
      if (cultist.cast) started = f;
    }
    return { combat, monsters, player, cultist, started };
  };

  // 1. left alone, the cast goes off and the player takes a fireball
  {
    const { combat, monsters, player, cultist, started } = build();
    check('the cultist is standing in the level, alone', !!cultist && monsters.count === 1, `${monsters.count} alive`);
    check('and it does not close to melee', gap(cultist.actor, player) >= 10 - 1e-6, `${gap(cultist.actor, player).toFixed(2)} m`);
    check('and it begins a cast rather than swinging', started > 0, `frame ${started}`);
    check('and it said what it was doing', lines.some((l) => l.includes('begins a fireball')));
    const before = player.health;
    // run on until the SECOND cast starts: the gap between them is the row's own
    // tabled 2.6 s and not a second number invented for casting
    let again = -1;
    for (let f = started + 1; f < started + 400 && again < 0; f++) {
      monsters.update(1 / 60, f * (1000 / 60), player, false);
      combat.update(1 / 60, f * (1000 / 60));
      if (monsters.stats.casts >= 2 && cultist.cast) again = f;
    }
    const seconds = (again - started) / 60;
    check('and the next cast comes at the row\'s own 2.6 s speed, not on some other clock',
      Math.abs(seconds - swingSeconds(cultist.actor)) < 0.05, `${seconds.toFixed(2)} s against ${swingSeconds(cultist.actor).toFixed(2)} s`);
    check('and the fireball lands, from the only thing alive down there',
      player.health < before, `${before - player.health} off`);
    check('and nothing was interrupted', monsters.stats.interrupted === 0);
    monsters.dispose();
  }

  // 2. hit hard while casting and it loses the words
  {
    const { combat, monsters, player, cultist, started } = build();
    check('the cast is running', !!cultist.cast, `started frame ${started}`);
    // Drive either side of ten percent using the tuned live health.
    const under=Math.floor(cultist.actor.maxHealth*.1)-1,over=Math.floor(cultist.actor.maxHealth*.1)+1;
    const t7 = (started + 1) * (1000 / 60);
    combat.hurt(cultist.actor, under, { now: t7 });
    monsters.update(1 / 60, t7, player, false);
    check('a blow below ten percent does not break the cast',
      !!cultist.cast && monsters.stats.interrupted === 0, `${monsters.stats.interrupted}`);
    check('and that blow is below a tenth of its health', castBroken(under, cultist.actor.maxHealth) === false);
    const t9 = (started + 2) * (1000 / 60);
    combat.hurt(cultist.actor, over, { now: t9 });
    monsters.update(1 / 60, t9, player, false);
    check('and a blow above ten percent does break it', monsters.stats.interrupted === 1 && !cultist.cast, `${monsters.stats.interrupted}`);
    check('and that blow is above a tenth of its health', castBroken(over, cultist.actor.maxHealth) === true);
    check('and it said so', lines.some((l) => l.includes('loses the words')));
    monsters.dispose();
  }
}

// ================================================================== the boss
{
  check('every boss has two phases with a line each',
    Object.values(MONSTERS).filter(isBoss).every((m) => bossPlanFor(m).length === 2 && bossPlanFor(m).every((p) => p.line)));
  const kinds = new Set(Object.values(MONSTERS).filter(isBoss).flatMap((m) => bossPlanFor(m).map((p) => p.kind)));
  check('and all four behaviours are reachable in play', kinds.size === 4, [...kinds].sort().join(', '));

  const king = MONSTERS.ashenKing;
  check('a boss at full health is in phase 0', phaseIndexFor(king, 3200, 3200) === 0);
  check('at exactly 66% it is still phase 0, the same reading fleeCheck gives',
    phaseIndexFor(king, 3200 * 0.66, 3200) === 0, `${phaseIndexFor(king, 3200 * 0.66, 3200)}`);
  check('a hair under 66% it is phase 1', phaseIndexFor(king, 3200 * 0.6599, 3200) === 1);
  check('at 50% it is phase 1', phaseIndexFor(king, 1600, 3200) === 1, `${phaseIndexFor(king, 1600, 3200)}`);
  check('and under 33% it is phase 2', phaseIndexFor(king, 3200 * 0.32, 3200) === 2);
  check('the plate says the name and what it is doing',
    plateText(king, 1600, 3200).name === 'the Ashen King' && plateText(king, 1600, 3200).phase === 'calling for help',
    JSON.stringify(plateText(king, 1600, 3200)));

  // and now through the real runtime
  const layout = sixRooms({ level: 3, bottom: true });
  const field = stubField();
  const scene = new THREE.Group();
  const combat = createCombat({ rng: seeded(121) });
  const lines = [];
  const rt = dungeonRuntime(field, layout);
  const monsters = createMonsters(scene, rt, {
    actorFactory: (id, o) => spawnMonster(id, o.pos), combat,
    hud: { log: (t) => lines.push(t) }, rng: seeded(122), groupChance: 0,
  });
  const bossRec = dungeonSpawns(normalizeDungeonLayout(layout), { seed: field.seed }).find((r) => r.boss);
  check('the bottom of the shaft has a boss in it', !!bossRec, bossRec?.id);
  const player = noDodge(fakePlayer(bossRec.x + 6, bossRec.z));
  monsters.update(1 / 60, 0, player, false);
  const boss = monsters.all().find((m) => m.boss);
  check('and it is standing there', !!boss, boss?.name);
  check('and it starts in phase 0 and says nothing', boss.phase === 0 && monsters.stats.phases === 0);

  boss.actor.health = boss.actor.maxHealth * 0.5;
  monsters.update(1 / 60, 100, player, false);
  check('at 50% health it announces its first phase', monsters.stats.phases === 1, `${monsters.stats.phases}`);
  const said = lines.filter((l) => l === boss.plan[0].line).length;
  check('and it says the line once', said === 1, `${said} times`);
  const before = monsters.count;
  for (let f = 0; f < 120; f++) monsters.update(1 / 60, 200 + f * 16.7, player, false);
  check('and it does not announce it again over the next two seconds', monsters.stats.phases === 1, `${monsters.stats.phases}`);
  check('and it says the line exactly once, still', lines.filter((l) => l === boss.plan[0].line).length === 1);

  // whatever the first phase was, it really happened
  const kind1 = boss.plan[0].kind;
  if (kind1 === 'summon') {
    check(`${boss.name} summoned ${SUMMON_COUNT} of its own`, monsters.stats.summoned === SUMMON_COUNT, `${monsters.stats.summoned}`);
    check('and they are standing there', monsters.count > before, `${before} then ${monsters.count}`);
    check('and none of them is written into the character\'s dead list on death',
      monsters.all().filter((m) => m.ephemeral).length === SUMMON_COUNT);
  } else if (kind1 === 'slam') {
    check(`${boss.name} put a warning ring on the floor`, monsters.stats.slams >= 1, `${monsters.stats.slams}`);
  }

  // the second phase, and it is a different one
  boss.actor.health = boss.actor.maxHealth * 0.2;
  const swingBefore = swingSeconds(boss.actor);
  monsters.update(1 / 60, 3000, player, false);
  check('under a third it announces its second phase', monsters.stats.phases === 2, `${monsters.stats.phases}`);
  const kind2 = boss.plan[1].kind;
  if (kind2 === 'enrage') {
    check('and an enrage really speeds its swing up',
      swingSeconds(boss.actor) < swingBefore, `${swingBefore.toFixed(2)} s to ${swingSeconds(boss.actor).toFixed(2)} s`);
    check(`and by exactly ${ENRAGE_SWING * 100}%`,
      Math.abs(swingSeconds(boss.actor) - swingBefore * (1 - ENRAGE_SWING)) < 1e-9);
  } else if (kind2 === 'retreat') {
    const hp = boss.actor.health;
    for (let f = 0; f < 60; f++) monsters.update(1 / 60, 3100 + f * 16.7, player, false);
    check('and a retreating boss heals as it goes', boss.actor.health > hp, `${hp} to ${boss.actor.health}`);
  }
  monsters.dispose();
}

// ==================================================== the slam, and stepping out
{
  // The Warden of the Cut slams at 66%. Two runs of the same fight: in the
  // first the player stands in the ring, in the second he walks out of it.
  const layout = sixRooms({ level: 3, bottom: true });
  const run = (stepOut) => {
    let field = stubField();
    // find a seed whose boss is the one that slams
    for (let s = 1; s <= 3000; s++) {
      const L = normalizeDungeonLayout({ ...layout });
      const b = dungeonSpawns(L, { seed: s }).find((r) => r.boss && bossPlanFor(MONSTERS[r.id])[0].kind === 'slam');
      if (b) { field = stubField({ seed: s }); break; }
    }
    const scene = new THREE.Group();
    const combat = createCombat({ rng: () => 0.5 });
    const rt = dungeonRuntime(field, layout);
    const monsters = createMonsters(scene, rt, {
      actorFactory: (id, o) => spawnMonster(id, o.pos), combat, rng: seeded(131), groupChance: 0,
    });
    const rec = dungeonSpawns(normalizeDungeonLayout(layout), { seed: field.seed }).find((r) => r.boss);
    const player = noDodge(fakePlayer(rec.x + 4, rec.z));
    player.maxHealth = 100000; player.health = 100000;   // so the slam is the only thing measured
    monsters.update(1 / 60, 0, player, false);
    const boss = monsters.all().find((m) => m.boss);
    if (!boss || bossPlanFor(boss.row)[0].kind !== 'slam') return null;
    boss.actor.health = boss.actor.maxHealth * 0.5;
    monsters.update(1 / 60, 100, player, false);
    const rings = monsters.warnings().length;
    if (stepOut) { player.pos.x = rec.x + SLAM_RADIUS + 12; }
    const before = player.health;
    for (let f = 0; f < 180; f++) {
      monsters.update(1 / 60, 200 + f * 16.7, player, false);
      combat.update(1 / 60, 200 + f * 16.7);
    }
    const took = before - player.health;
    monsters.dispose();
    return { rings, took, name: boss.name };
  };
  const stood = run(false), walked = run(true);
  check('a slamming boss puts a ring on the floor first', stood && stood.rings === 1, `${stood?.rings} rings`);
  check(`and the warning is ${SLAM_WARN_S} s long, which is time to move`, SLAM_WARN_S >= 1);
  check('standing in the ring costs you', stood && stood.took > 0, `${stood?.took} off`);
  check('and stepping out of it costs you nothing', walked && walked.took === 0, `${walked?.took} off`);
}

// ==================================================== the summon, and its minions
{
  const layout = sixRooms({ level: 3, bottom: true });
  let seed = 0;
  for (let sd = 1; sd <= 3000 && !seed; sd++) {
    const b = dungeonSpawns(normalizeDungeonLayout(layout), { seed: sd })
      .find((r) => r.boss && bossPlanFor(MONSTERS[r.id])[0].kind === 'summon');
    if (b) seed = sd;
  }
  check('a shaft whose boss summons can be found', seed > 0, `seed ${seed}`);
  const field = stubField({ seed });
  const scene = new THREE.Group();
  const combat = createCombat({ rng: seeded(141) });
  const deadUntil = [];
  const rt = dungeonRuntime(field, layout);
  const monsters = createMonsters(scene, rt, {
    actorFactory: (id, o) => spawnMonster(id, o.pos), combat, deadUntil, rng: seeded(142), groupChance: 0,
  });
  const rec = dungeonSpawns(normalizeDungeonLayout(layout), { seed }).find((r) => r.boss);
  const player = noDodge(fakePlayer(rec.x + 6, rec.z));
  player.maxHealth = 100000; player.health = 100000;
  monsters.update(1 / 60, 0, player, false);
  const boss = monsters.all().find((m) => m.boss);
  check('and it is standing at the bottom of it', !!boss && bossPlanFor(boss.row)[0].kind === 'summon', boss?.name);
  const before = monsters.count;
  boss.actor.health = boss.actor.maxHealth * 0.5;
  monsters.update(1 / 60, 100, player, false);
  check(`it calls ${SUMMON_COUNT} of its habitat's own out of the dark`,
    monsters.stats.summoned === SUMMON_COUNT, `${monsters.stats.summoned}`);
  check('and they are standing there', monsters.count === before + SUMMON_COUNT, `${before} then ${monsters.count}`);
  const minions = monsters.all().filter((m) => m.ephemeral);
  check('and every one of them is a dungeon3 monster and not another boss',
    minions.every((m) => HABITAT.dungeon3.night.includes(m.id) && !m.boss),
    minions.map((m) => m.id).join(', '));
  check('and they came down within a few metres of the boss',
    minions.every((m) => Math.hypot(m.actor.pos.x - boss.actor.pos.x, m.actor.pos.z - boss.actor.pos.z) < 8));
  const wasDead = deadUntil.length;
  combat.kill(minions[0].actor, player);
  check('and killing a summoned one writes nothing into the character\'s save',
    deadUntil.length === wasDead, `${deadUntil.length - wasDead} entries`);
  const bossKey = boss.key;
  combat.kill(boss.actor, player);
  check('while killing the boss itself does', deadUntil.some((e) => e.key === bossKey));
  monsters.dispose();
}

// ====================================================================== a cave
{
  const cave = {
    kind: 'cave', level: 1, top: 1, bottom: true, cellSize: 2, w: 26, h: 26, id: 'hole',
    rooms: [{ x: 2, z: 2, w: 4, h: 4 }, { x: 10, z: 4, w: 5, h: 5 }, { x: 4, z: 14, w: 4, h: 4 }],
  };
  const L = normalizeDungeonLayout(cave);
  check('a cave normalises as a cave', L.kind === 'cave' && L.bottom === true);
  const recs = dungeonSpawns(L, { seed: 4242 });
  check('and it fills from the cave roster, not a dungeon one',
    recs.length > 0 && recs.every((r) => HABITAT.cave.day.includes(r.id)),
    [...new Set(recs.map((r) => r.id))].join(', '));
  check('and a cave has no boss even at its bottom, because none lives there',
    recs.every((r) => !r.boss), `${bossRowsFor('cave').length} cave bosses exist`);
  check('and still nothing in the room you climb down into', recs.every((r) => r.room !== 0));
}

// ====================================== a runtime that cannot say what a level is
{
  const field = stubField();
  const scene = new THREE.Group();
  const warn = console.warn;
  const warnings = [];
  console.warn = (t) => warnings.push(t);
  const rt = {
    field, heightAt: () => 0, sitesNear: () => [],
    get inDungeon() { return true; },
    dungeonLevel: 1, dungeonSite: { id: 'blind' },
    clampWalkable: (x, z) => [x, z],
    // no dungeonLayout at all: this is world_runtime.js as it stands today
  };
  const monsters = createMonsters(scene, rt, { groupChance: 1, rng: seeded(151), spawnPoint: { x: 1e6, z: 1e6 } });
  const player = fakePlayer(0, 0);
  for (let f = 0; f < 10; f++) monsters.update(1 / 60, f * 16.7, player, false);
  console.warn = warn;
  check('with no layout to read, no dungeon layer is guessed at', monsters.count === 0, `${monsters.count}`);
  check('and no overworld monster leaks in through the roof', monsters.levelSpawns().length === 0);
  check('and it says so once, naming the wiring doc',
    warnings.length === 1 && warnings[0].includes('G3.md'), `${warnings.length} warnings`);
  monsters.dispose();
}

// ===========================================================================
// M3: the twenty one tags of wave A, every one driven true AND false
// ===========================================================================
//
// One bench per case, and it is the REAL path in every one: `monsters.spawnAt`
// is the same `spawn()` the world's own sweep calls, `spawnMonster` is W1's
// real actor, and `createCombat` is the real resolver. Nothing here previews.
//
// The player is given a hundred thousand health on purpose, so that what is
// being measured is what the monster did and not how long the player lived.

/** A world with nothing in it but what a test puts there. */
function bench(o = {}) {
  const field = stubField({ seed: o.seed ?? 4242 });
  const scene = new THREE.Group();
  const lines = [];
  const hud = { log: (t) => lines.push(t) };
  const combat = createCombat({ rng: o.crng || (() => 0.5), hud });
  const monsters = createMonsters(scene, stubRuntime(field), {
    actorFactory: (id, p) => spawnMonster(id, p.pos),
    combat, groupChance: 0, hud, cap: o.cap,
    rng: o.rng || seeded(o.seed ?? 901),
    spawnPoint: { x: 1e6, z: 1e6 },
  });
  let now = 0;
  return {
    field, combat, monsters, lines, get now() { return now; },
    /** Frames of the real loop, in the real order: monsters, then combat. */
    run(frames, player, step = 1 / 60) {
      for (let f = 0; f < frames; f++) {
        now += step * 1000;
        monsters.update(step, now, player, false);
        combat.update(step, now);
      }
      return now;
    },
    said: (re) => lines.filter((l) => re.test(l)),
  };
}
/** The bench's player: no DEX, so a fixed roll is not eaten by a dodge. */
const benchPlayer = (x = 0, z = 0) => {
  const p = noDodge(fakePlayer(x, z));
  p.pos.y = 3;                      // stubField's ground, so actorDistance is flat
  p.health = 100000; p.maxHealth = 100000;
  return p;
};
const GROUND = 3;

// ------------------------------------------------- every tag has a written rule
{
  const counts = auditTagRules();
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  check('every note tag on the roster has a row saying what reads it',
    total === NOTE_TAGS.size, `${total} rows for ${NOTE_TAGS.size} tags: ${JSON.stringify(counts)}`);
  const wave = ['shieldWall', 'healsAllies', 'howl', 'summons', 'dives', 'grab', 'ambush', 'awakens',
    'burrows', 'dropsFromAbove', 'stormCall', 'powderCharge', 'hex', 'ashCloud', 'tailSweep', 'dragonTime'];
  const here = wave.filter((t) => TAG_RULES[t] && TAG_RULES[t][0] === 'monsters.js');
  check('and the sixteen wave A tags that need a rule in this file have one',
    here.length === wave.length, `${here.length} of ${wave.length}`);
  check('fireImmune is a resist in actor.js and not a rule in here',
    TAG_RULES.fireImmune[0] === 'actor.js');
  check('bow, powderCharge and stormCall reach the ranged table',
    RANGED_TAGS.bow === 'shot' && RANGED_TAGS.powderCharge === 'thrown' && RANGED_TAGS.stormCall === 'cast');
  // The honest half: what is still carried and read by nothing.
  const unwired = Object.entries(TAG_RULES).filter(([, r]) => r[0] === 'unwired').map(([t]) => t);
  // 23 before M5, which wired `coinPurse` into loot_drops.js.
  check(`${unwired.length} tags are still carried by rows and read by nothing`, unwired.length === 22,
    unwired.join(', '));
  check('coinPurse is one of the ones that got wired', TAG_RULES.coinPurse[0] === 'loot_drops.js', TAG_RULES.coinPurse.join(': '));
}

// ------------------------------------------------------------- the boss plans
{
  const bosses = Object.values(MONSTERS).filter(isBoss);
  check('all sixteen bosses have a plan of their own rather than the default',
    bosses.every((m) => BOSS_PLANS[m.id]), bosses.filter((m) => !BOSS_PLANS[m.id]).map((m) => m.id).join(', ') || 'none fall through');
  check('and every phase of every one of them says a line, with no em dash',
    bosses.every((m) => bossPlanFor(m).every((p) => p.line && !p.line.includes('—'))));
  check('and every phase kind has a word for the plate',
    bosses.every((m) => bossPlanFor(m).every((p) => PHASE_WORDS[p.kind])));
  // The thresholds, driven either side of both of them for all sixteen.
  const above = bosses.every((m) => phaseIndexFor(m, 100 * 0.67, 100) === 0);
  const first = bosses.every((m) => phaseIndexFor(m, 100 * 0.65, 100) === 1);
  const onTheLine = bosses.every((m) => phaseIndexFor(m, 66, 100) === 0);
  const second = bosses.every((m) => phaseIndexFor(m, 32, 100) === 2);
  check('at 67% every boss is in phase 0, at 65% in phase 1', above && first);
  check('at exactly 66% none of them has turned yet', onTheLine);
  check('and under 33% every one of them is in phase 2', second);
  check('the twelve new bosses carry the M2 lines word for word',
    BOSS_PLANS.malachar[1].line === 'Malachar stops fighting like a knight of the Eyrie, and the room slows around him.'
    && BOSS_PLANS.noon[0].line === 'Noon comes down off the rock, and the glass road cracks under him.'
    && BOSS_PLANS.thalassa[1].kind === 'retreat');
  // A boss whose row names what it summons puts down exactly that.
  const named = bosses.filter((m) => m.summons);
  check(`${named.length} bosses name what they call, and each names a real lesser row`,
    named.length === 8 && named.every((m) => MONSTERS[m.summons.id] && MONSTERS[m.summons.id].tier < m.tier),
    named.map((m) => `${m.id} -> ${m.summons.count} ${m.summons.id}`).join(', '));
}

// ------------------------------------------------------ summons, on a real row
{
  const b = bench({ rng: () => 0.5 });
  const witch = b.monsters.spawnAt('fenWitch', 0, 0);
  const p = benchPlayer(9, 0);
  b.run(30, p);
  check('the Fen Witch is standing there and has turned on you',
    !!witch && !!witch.actor.ai.target && b.monsters.count === 1, `${b.monsters.count} bodies`);
  witch.actor.health = witch.actor.maxHealth * 0.6;
  b.run(5, p);
  check('at 60% health she calls nothing', b.monsters.stats.summoned === 0, `${b.monsters.stats.summoned}`);
  witch.actor.health = witch.actor.maxHealth * 0.4;
  b.run(5, p);
  const wisps = b.monsters.all().filter((m) => m.id === 'wisp');
  check('the first time she drops under half she calls exactly two',
    b.monsters.stats.summoned === 2 && wisps.length === 2, `${b.monsters.stats.summoned} summoned, ${wisps.length} standing`);
  check('and they are the two her row names, not a habitat roll',
    wisps.every((m) => m.id === MONSTERS.fenWitch.summons.id));
  check('and she says so, and says what came',
    b.said(/2 will o' wisps come out of the dark/).length === 1, b.said(/come out of the dark/)[0]);
  check('and they are ephemeral, so no summon is written into the save',
    wisps.every((m) => m.ephemeral));
  // and not twice
  witch.actor.health = witch.actor.maxHealth * 0.9;
  b.run(5, p);
  witch.actor.health = witch.actor.maxHealth * 0.3;
  b.run(5, p);
  check('crossing half again inside the cooldown calls nothing more',
    b.monsters.stats.summoned === 2, `${b.monsters.stats.summoned}`);
  // and they go out with her
  const before = b.monsters.count;
  b.combat.kill(witch.actor, p);
  check('killing the witch takes her wisps with her',
    b.monsters.count === 0, `${before} bodies, then ${b.monsters.count}`);
  check('and it says how many went out', b.said(/goes out with|go out with/).length === 1, b.said(/out with/)[0]);
  b.monsters.dispose();
}
{
  // the body cap is real, and being eaten by it is said out loud
  const b = bench({ rng: () => 0.5, cap: 1 });
  const witch = b.monsters.spawnAt('fenWitch', 0, 0);
  const p = benchPlayer(9, 0);
  b.run(30, p);
  witch.actor.health = witch.actor.maxHealth * 0.4;
  b.run(5, p);
  check('with the world already full she calls and nothing comes',
    b.monsters.stats.summoned === 0, `${b.monsters.stats.summoned}`);
  check('and the log says so rather than looking broken',
    b.said(/no room in the world/).length === 1, b.said(/no room/)[0]);
  b.monsters.dispose();
}

// ------------------------------------------------------------- the shield wall
{
  const b = bench({ rng: () => 0.5 });
  const one = b.monsters.spawnAt('legionSoldier', 0, 0);
  const p = benchPlayer(60, 0);
  b.run(2, p);
  const base = MONSTERS.legionSoldier.ar;
  check('one Legion Soldier alone carries its row armour and nothing more',
    one.wall === 0 && one.actor.ar === base, `ar ${one.actor.ar} against a row ${base}`);
  const two = b.monsters.spawnAt('legionSoldier', 2, 0);
  b.run(2, p);
  check(`two of them within ${WALL_M} m each carry ${WALL_AR} more`,
    one.wall === WALL_AR && two.wall === WALL_AR && one.actor.ar === base + WALL_AR,
    `ar ${one.actor.ar} and ${two.actor.ar}`);
  check('and it says so once, counting them', b.said(/lock shields/).length === 1, b.said(/lock shields/)[0]);
  two.actor.pos.x = WALL_M + 3;
  b.run(2, p);
  check(`at ${WALL_M + 3} m apart the wall is off both of them`,
    one.wall === 0 && two.wall === 0 && one.actor.ar === base, `ar ${one.actor.ar}`);
  check('and the break is said too', b.said(/wall breaks/).length === 1);
  // the other direction: a wall forming two hundred metres off is not your fight and says nothing
  {
    const far = bench({ rng: () => 0.5 });
    far.monsters.spawnAt('legionSoldier', 200, 0); far.monsters.spawnAt('legionSoldier', 202, 0);
    far.run(2, benchPlayer(0, 0));
    check('a wall forming 200 m away locks in silence', far.said(/lock shields/).length === 0, far.said(/lock shields/).join(' | '));
    far.monsters.dispose();
  }
  // and it is really armour: the same blow costs less through a wall
  const hitFor = (apart) => {
    const t = bench({ rng: () => 0.5, crng: () => 0.5 });
    const a = t.monsters.spawnAt('legionSoldier', 0, 0);
    t.monsters.spawnAt('legionSoldier', apart ? 40 : 2, 0);
    // A player who can actually mark a man in mail, standing in reach of one.
    const q = benchPlayer(1.2, 0);
    q.skills.swordsmanship = 100;
    q.weapon = { id: 'test', skill: 'swordsmanship', minDamage: 60, maxDamage: 60, speed: 2, weight: 4, damageType: 'physical', ranged: false, reach: 2 };
    t.run(2, q);
    const hp = a.actor.health;
    t.combat.queueSwing(q, a.actor, { now: t.now, immediate: true });
    t.run(40, q);
    t.monsters.dispose();
    return hp - a.actor.health;
  };
  const alone = hitFor(true), walled = hitFor(false);
  check('and the wall really turns blades: the same swing costs less through it',
    walled < alone, `${alone} alone against ${walled} in the wall`);
  b.monsters.dispose();
}

// ------------------------------------------------------- the chaplain's chant
{
  const b = bench({ rng: () => 0.5 });
  b.monsters.spawnAt('legionChaplain', 0, 0);
  const hurt = b.monsters.spawnAt('legionSoldier', 3, 0);
  const full = b.monsters.spawnAt('legionSoldier', 4, 0);
  const far = b.monsters.spawnAt('legionSoldier', 0, HEAL_ALLIES_M + 12);
  const injured=Math.ceil(hurt.actor.maxHealth*.4);
  hurt.actor.health = injured;
  far.actor.health = injured;
  const p = benchPlayer(10, 0);
  b.run(400, p);
  check('the chaplain chants at least once', b.monsters.stats.heals >= 1, `${b.monsters.stats.heals}`);
  check(`a hurt ally inside ${HEAL_ALLIES_M} m is healed`, hurt.actor.health > injured, `${injured} to ${hurt.actor.health}`);
  check('an ally at full health is not, and is not counted',
    full.actor.health === full.actor.maxHealth, `${full.actor.health}`);
  check(`a hurt ally past ${HEAL_ALLIES_M} m gets nothing`, far.actor.health === injured, `${far.actor.health}`);
  check('and the chant says what went where',
    b.said(/lifts the cup, and the wall closes up\. \d+ health back across \d+ of them/).length >= 1,
    b.said(/lifts the cup/)[0]);
  b.monsters.dispose();
}

// ---------------------------------------------------------------- the howl
{
  const b = bench({ rng: () => 0.5 });
  const alpha = b.monsters.spawnAt('boneHound', 0, 0);
  // inside the howl's thirty, outside the hound's own sixteen from the player
  const near = b.monsters.spawnAt('boneHound', 28, 0);
  const far = b.monsters.spawnAt('boneHound', 0, HOWL_M + 30);
  const p = benchPlayer(6, 0);
  b.run(3, p);
  check('the far hounds have not turned on their own',
    !near.actor.ai.target && !far.actor.ai.target);
  alpha.actor.health -= 10;
  b.run(3, p);
  check('the first blow it takes brings the one inside thirty metres',
    b.monsters.stats.howls === 1 && !!near.actor.ai.target, `${b.monsters.stats.howls} howls`);
  check(`and not the one at ${HOWL_M + 30} m`, !far.actor.ai.target);
  check('and the line counts what actually came',
    b.said(/throws its head back, and 1 more come/).length === 1, b.said(/head back/)[0]);
  alpha.actor.health -= 10;
  b.run(3, p);
  check('and it only ever howls once', b.monsters.stats.howls === 1, `${b.monsters.stats.howls}`);
  b.monsters.dispose();
}
{
  // and nothing to call is said too, rather than being silent
  const b = bench({ rng: () => 0.5 });
  const lone = b.monsters.spawnAt('boneHound', 0, 0);
  const p = benchPlayer(6, 0);
  b.run(3, p);
  lone.actor.health -= 10;
  b.run(3, p);
  check('a hound with no pack says that nothing answered',
    b.said(/nothing answers/).length === 1, b.said(/head back/)[0]);
  b.monsters.dispose();
}

// ---------------------------------------------------------------- the stoop
{
  const b = bench({ rng: () => 0.5 });
  const harpy = b.monsters.spawnAt('canopyHarpy', 0, 0);
  const p = benchPlayer(DIVE_TRIGGER_M + 4, 0);
  let low = 99, high = 0;
  for (let f = 0; f < 200; f++) {
    b.run(1, p);
    const alt = harpy.actor.pos.y - GROUND;
    low = Math.min(low, alt); high = Math.max(high, alt);
    p.pos.x = harpy.actor.pos.x + DIVE_TRIGGER_M + 4;      // held out of reach
  }
  check(`a harpy held at ${DIVE_TRIGGER_M + 4} m stoops`, b.monsters.stats.dives === 1, `${b.monsters.stats.dives}`);
  check('and it really comes down out of the hover to the floor',
    high >= HOVER_MIN && low <= 0.01, `${low.toFixed(2)} m to ${high.toFixed(2)} m`);
  check('and it says it is coming', b.said(/folds its wings/).length === 1);
  const c = bench({ rng: () => 0.5 });
  const h2 = c.monsters.spawnAt('canopyHarpy', 0, 0);
  const q = benchPlayer(5, 0);
  for (let f = 0; f < 200; f++) { c.run(1, q); q.pos.x = h2.actor.pos.x + 5; }
  check(`and one held at 5 m, inside the ${DIVE_TRIGGER_M} m trigger, never does`,
    c.monsters.stats.dives === 0, `${c.monsters.stats.dives}`);
  b.monsters.dispose(); c.monsters.dispose();
}

// ------------------------------------------------------------- the kraken's hold
{
  const b = bench({ rng: () => 0.1, crng: () => 0.5 });      // 0.1 < GRAB_CHANCE
  const k = b.monsters.spawnAt('kraken', 0, 0);
  const p = benchPlayer(2, 0);
  let f = 0;
  for (; f < 600 && !b.monsters.holds().length; f++) { b.run(1, p); p.pos.x = k.actor.pos.x + 2; }
  const held = b.monsters.holds();
  check('a landed kraken blow takes hold of you', held.length === 1, `after ${f} frames`);
  check('and it is a real root, the same one a web writes',
    !!p.status.root && p.status.root.until > b.now, JSON.stringify(p.status.root));
  check('and it says it has you, and for how long',
    b.said(/has you\. 2 seconds of it/).length === 1, b.said(/has you/)[0]);
  const at = b.now, hp = p.health;
  let ticks = 0, prev = p.health;
  for (let g = 0; g < 200 && b.monsters.holds().length; g++) {
    b.run(1, p);
    if (p.health < prev) { ticks++; prev = p.health; }
  }
  const heldFor = (b.now - at) / 1000;
  check(`and it lets go after ${GRAB_SECONDS}.0 s`,
    Math.abs(heldFor - GRAB_SECONDS) < 0.12, `${heldFor.toFixed(2)} s`);
  check('and it squeezed for the row\'s low damage each second while it held',
    ticks >= GRAB_SECONDS && hp - p.health >= MONSTERS.kraken.damage[0] * GRAB_SECONDS,
    `${ticks} ticks, ${hp - p.health} off`);
  check('and the root goes with it', !p.status.root, JSON.stringify(p.status.root));
  check('and it says it let go', b.said(/lets go of you/).length >= 1);
  b.monsters.dispose();
}
{
  const b = bench({ rng: () => 0.9, crng: () => 0.5 });      // 0.9 > GRAB_CHANCE
  const k = b.monsters.spawnAt('kraken', 0, 0);
  const p = benchPlayer(2, 0);
  for (let f = 0; f < 600; f++) { b.run(1, p); p.pos.x = k.actor.pos.x + 2; }
  check('and a roll over one in four never takes hold at all',
    b.monsters.stats.grabs === 0 && k.swings > 0, `${k.swings} swings, ${b.monsters.stats.grabs} grabs`);
  b.monsters.dispose();
}
{
  // killing the holder breaks it, which is M2's own "broken by killing the holder"
  const b = bench({ rng: () => 0.1, crng: () => 0.5 });
  const k = b.monsters.spawnAt('kraken', 0, 0);
  const p = benchPlayer(2, 0);
  for (let f = 0; f < 600 && !b.monsters.holds().length; f++) { b.run(1, p); p.pos.x = k.actor.pos.x + 2; }
  check('it has you', b.monsters.holds().length === 1);
  b.combat.kill(k.actor, p);
  b.run(1, p);
  check('and killing it lets you go before its two seconds are up',
    b.monsters.holds().length === 0 && !p.status.root, JSON.stringify(p.status.root));
  check('and says why', b.said(/lets go of you, because it is dead|lets go of you as it goes down/).length >= 1);
  b.monsters.dispose();
}

// ---------------------------------------------------------------- the ambush
{
  const b = bench({ rng: () => 0.5 });
  const stalker = b.monsters.spawnAt('reedStalker', 0, 0);
  const p = benchPlayer(AMBUSH_M + 4, 0);
  b.run(5, p);
  check(`at ${AMBUSH_M + 4} m it is not there at all`,
    stalker.hidden && stalker.dormant && !stalker.actor.ai.target, `hidden ${stalker.hidden}`);
  check('and there is nothing to click on and nothing for an area effect to catch',
    b.monsters.targets().length === 0 && b.monsters.actors().length === 0);
  p.pos.x = AMBUSH_M - 1;
  b.run(2, p);
  check(`and at ${AMBUSH_M - 1} m it is`,
    !stalker.hidden && !stalker.dormant && b.monsters.targets().length === 1);
  check('and it says where it was', b.said(/was in the reeds the whole time/).length === 1);
  b.monsters.dispose();
}
{
  // The doubled first blow, measured against the SAME monster's next one. The
  // Cairn Wight and not the Reed Stalker, because the stalker also carries
  // poison1 and a two point tick landing on the same frame as a swing reads as
  // one larger blow and would make this measurement a lie.
  const b = bench({ rng: () => 0.5, crng: () => 0.5 });
  const wight = b.monsters.spawnAt('cairnWight', 0, 0);
  const p = benchPlayer(AMBUSH_M - 1, 0);
  const blows = [];
  let prev = p.health;
  for (let f = 0; f < 1600; f++) {
    b.run(1, p);
    p.pos.x = wight.actor.pos.x + 1.2;
    if (p.health !== prev) { blows.push(prev - p.health); prev = p.health; }
  }
  check('and the first blow out of an ambush is worth exactly two of the next',
    blows.length >= 2 && blows[0] === blows[1] * AMBUSH_MULT,
    `${blows.slice(0, 3).join(' then ')}`);
  check('and only the first one', blows.length < 3 || blows[2] === blows[1], blows.slice(0, 3).join(' then '));
  check('and it says the first one is doubled', b.said(/worth two of them/).length === 1);
  b.monsters.dispose();
}

// -------------------------------------------------------------- the statue
{
  const b = bench({ rng: () => 0.5 });
  const g = b.monsters.spawnAt('templeGuardian', 0, 0);
  const p = benchPlayer(AWAKEN_M + 2, 0);
  b.run(20, p);
  check(`at ${AWAKEN_M + 2} m the guardian is a statue: no target, and it has not moved`,
    g.dormant && !g.actor.ai.target && Math.hypot(g.actor.pos.x, g.actor.pos.z) < 1e-6,
    `${Math.hypot(g.actor.pos.x, g.actor.pos.z).toFixed(4)} m from where it was put`);
  check('and unlike an ambusher you can see it the whole time',
    !g.hidden && b.monsters.targets().length === 1);
  check('and its own aggro radius does not wake it', MONSTERS.templeGuardian.aggro > AWAKEN_M + 2,
    `the row says ${MONSTERS.templeGuardian.aggro} m`);
  p.pos.x = AWAKEN_M - 0.5;
  b.run(2, p);
  check(`and at ${AWAKEN_M - 0.5} m it steps down`, !g.dormant && !!g.actor.ai.target);
  check('and says so', b.said(/steps down off its plinth/).length === 1);
  b.monsters.dispose();
}

// -------------------------------------------------------------- the sandworm
{
  const b = bench({ rng: () => 0.5 });
  const worm = b.monsters.spawnAt('sandworm', 0, 0);
  const p = benchPlayer(10, 0);
  p.yaw = Math.PI;                                  // facing (0, -1)
  const seen = [];
  for (let f = 0; f < 300; f++) { b.run(1, p); p.pos.x = 10; p.pos.z = 0; seen.push(worm.hidden); }
  const down = seen.indexOf(true), up = seen.indexOf(false, down);
  check('a sandworm further than five metres off goes under the ground',
    b.monsters.stats.burrows === 1 && down >= 0, `${b.monsters.stats.burrows} burrows, at frame ${down}`);
  check(`and it is gone for ${BURROW_UNDER_S}.0 s`,
    Math.abs((up - down) / 60 - BURROW_UNDER_S) < 0.06, `${((up - down) / 60).toFixed(2)} s`);
  const d = Math.hypot(worm.actor.pos.x - p.pos.x, worm.actor.pos.z - p.pos.z);
  const dot = ((worm.actor.pos.x - p.pos.x) * Math.sin(p.yaw) + (worm.actor.pos.z - p.pos.z) * Math.cos(p.yaw)) / (d || 1);
  check(`and it comes up within ${BURROW_OUT_M} m of you`, d <= BURROW_OUT_M + 0.05, `${d.toFixed(2)} m`);
  check('and BEHIND you, which is the whole of the trick', dot < 0, `dot ${dot.toFixed(2)} with your facing`);
  check('and the leash timer is cleared, so it does not walk home from where it surfaced',
    worm.actor.ai.leashSince == null && !!worm.actor.ai.target);
  check('and both halves of it are said',
    b.said(/goes down into the ground/).length === 1 && b.said(/ground opens behind you/).length === 1);
  b.monsters.dispose();
}
{
  // and one that is already on top of you does not burrow at all
  const b = bench({ rng: () => 0.5 });
  const worm = b.monsters.spawnAt('sandworm', 0, 0);
  const p = benchPlayer(2, 0);
  for (let f = 0; f < 300; f++) { b.run(1, p); p.pos.x = worm.actor.pos.x + 2; }
  check(`and one held inside ${BURROW_MIN_M} m never goes under`,
    b.monsters.stats.burrows === 0 && !!worm.actor.ai.target, `${b.monsters.stats.burrows}`);
  b.monsters.dispose();
}

// ------------------------------------------------------------ the canopy
{
  const b = bench({ rng: () => 0.5 });
  const spider = b.monsters.spawnAt('blossomSpider', 0, 0);
  const p = benchPlayer(DROP_UNDER_M + 4, 0);
  b.run(5, p);
  check(`a blossom spider waits ${DROP_HEIGHT_M} m over the path`,
    spider.dormant && Math.abs(spider.actor.pos.y - GROUND - DROP_HEIGHT_M) < 1e-6,
    `${(spider.actor.pos.y - GROUND).toFixed(2)} m up`);
  check('and it does not come down for someone walking past it',
    !spider.actor.ai.target, `${DROP_UNDER_M + 4} m away`);
  const hp = p.health;
  p.pos.x = 0;
  b.run(2, p);
  check('walking underneath it lets go', !spider.dormant);
  b.run(60, p);
  check('and it is on the ground a second later',
    spider.aloft === 0 && Math.abs(spider.actor.pos.y - GROUND) < 1e-6, `${(spider.actor.pos.y - GROUND).toFixed(2)} m up`);
  check('and the drop itself costs the player nothing', p.health === hp || p.health < hp,
    `${hp - p.health} off, which is the spider fighting and not the fall`);
  check('and it says what the blossom was', b.said(/blossom above the path/).length === 1);
  b.monsters.dispose();
}

// ---------------------------------------------------- the storm, and stepping out
{
  const storm = (stepOut) => {
    const b = bench({ rng: () => 0.5 });
    b.monsters.spawnAt('reefEel', 0, 0);
    const p = benchPlayer(5, 0);
    let w = [];
    for (let f = 0; f < 900 && !w.length; f++) { b.run(1, p); w = b.monsters.warnings(); }
    const mark = w[0] ? { ...w[0] } : null;
    const hp = p.health;
    if (stepOut && mark) p.pos.x = mark.x + STORM_RADIUS + 20;
    b.run(200, p);
    const out = { mark, took: hp - p.health, storms: b.monsters.stats.storms, said: b.said(/sky answers/) };
    b.monsters.dispose();
    return out;
  };
  const stood = storm(false), walked = storm(true);
  check('a reef eel calls the storm down on the ground you are standing on',
    stood.storms >= 1 && stood.mark && stood.mark.kind === 'stormcall', JSON.stringify(stood.mark));
  check(`and the mark is ${STORM_RADIUS} m across with ${STORM_WARN_S} s of warning`,
    stood.mark.radius === STORM_RADIUS && stood.mark.left <= STORM_WARN_S && stood.mark.left > STORM_WARN_S - 0.2,
    `${stood.mark.radius} m, ${stood.mark.left.toFixed(2)} s left`);
  check('standing in it costs you the row\'s damage as energy',
    stood.took >= MONSTERS.reefEel.damage[0], `${stood.took} off`);
  check('and walking out of it costs you nothing', walked.took === 0, `${walked.took} off`);
  check('and it says which of the two happened',
    stood.said.some((l) => /lands on you/.test(l)) && walked.said.some((l) => /where you were/.test(l)));
}

// ------------------------------------------------- the charge, and stepping out
{
  const powder = (stepOut) => {
    const b = bench({ rng: () => 0.5 });
    b.monsters.spawnAt('legionSapper', 0, 0);
    const p = benchPlayer(10, 0);
    let w = [];
    for (let f = 0; f < 400 && !w.length; f++) { b.run(1, p); w = b.monsters.warnings(); }
    const mark = w[0] ? { ...w[0] } : null;
    const hp = p.health;
    if (stepOut && mark) p.pos.x = mark.x + POWDER_RADIUS + 20;
    b.run(200, p);
    const out = { mark, took: hp - p.health, charges: b.monsters.stats.charges, said: b.said(/charge goes off/) };
    b.monsters.dispose();
    return out;
  };
  const stood = powder(false), walked = powder(true);
  check('a Legion Sapper puts a charge at your feet',
    stood.charges >= 1 && stood.mark.kind === 'powdercharge', JSON.stringify(stood.mark));
  check(`and it lies there ${POWDER_WARN_S} s, ${POWDER_RADIUS} m across`,
    stood.mark.radius === POWDER_RADIUS && stood.mark.left > POWDER_WARN_S - 0.2);
  check('standing over it costs you', stood.took >= MONSTERS.legionSapper.damage[0], `${stood.took} off`);
  check('and stepping off it costs you nothing', walked.took === 0, `${walked.took} off`);
  check('and the fuse is announced before it goes off',
    stood.said.length >= 1 && walked.said.some((l) => /where you were standing/.test(l)));
}

// ------------------------------------------------------------------- the hex
{
  const b = bench({ rng: () => 0.5 });
  b.monsters.spawnAt('cultistAdept', 0, 0);
  const p = benchPlayer(10, 0);
  const hit0 = p.bonuses.hit || 0;
  let f = 0;
  for (; f < 900 && !b.monsters.curses().length; f++) b.run(1, p);
  const c = b.monsters.curses()[0];
  check('a Cultist Adept curses as well as burning', !!c && c.kind === 'hex', `after ${f} frames`);
  check(`and it takes ${HEX_POINTS} points off your hit`,
    c.points === HEX_POINTS && (p.bonuses.hit || 0) === hit0 - HEX_POINTS, `bonuses.hit ${p.bonuses.hit}`);
  check('and it is carried as a real buff, so a recompute cannot lose it',
    p.buffs.some((x) => x.kind === 'hex' && x.effect.bonuses.hit === -HEX_POINTS));
  check('and it says the number and the seconds',
    b.said(new RegExp(`${HEX_POINTS} off your hit for ${HEX_SECONDS} seconds`)).length >= 1);
  b.run(HEX_SECONDS * 60 + 40, p);
  check(`and after ${HEX_SECONDS} s it comes off again, exactly`,
    b.monsters.curses().length === 0 && (p.bonuses.hit || 0) === hit0 && p.buffs.length === 0,
    `bonuses.hit ${p.bonuses.hit}, ${p.buffs.length} buffs`);
  check('and it says so', b.said(/curse comes off you/).length >= 1);
  b.monsters.dispose();
}

// -------------------------------------------------------------- the ash cloud
{
  const b = bench({ rng: () => 0.5 });
  b.monsters.spawnAt('riderWraith', 0, 0);
  const p = benchPlayer(2, 0);
  let f = 0;
  for (; f < 1200 && !b.monsters.curses().length; f++) b.run(1, p);
  const c = b.monsters.curses()[0];
  check('a Rider Wraith blinds what it hits', !!c && c.kind === 'ashCloud', `after ${f} frames`);
  check(`and it is ${ASH_POINTS} points for ${ASH_SECONDS} s`,
    c.points === ASH_POINTS && (p.bonuses.hit || 0) === -ASH_POINTS, `bonuses.hit ${p.bonuses.hit}`);
  // it re-blinds you every time it connects, so the wraith has to be gone
  // before the clock on this can be read at all
  for (const m of b.monsters.all()) b.combat.kill(m.actor, p);
  b.run(ASH_SECONDS * 60 + 40, p);
  check(`and ${ASH_SECONDS} s after the last of it the air clears again`,
    b.monsters.curses().length === 0 && (p.bonuses.hit || 0) === 0, `bonuses.hit ${p.bonuses.hit}`);
  check('and it says so', b.said(/ash settles/).length >= 1);
  b.monsters.dispose();
}
{
  const b = bench({ rng: () => 0.5 });
  b.monsters.spawnAt('marrowGhoul', 0, 0);            // same tier, no ashCloud
  const p = benchPlayer(2, 0);
  b.run(1200, p);
  check('and a row without the tag never blinds anybody',
    b.monsters.curses().length === 0 && !(p.bonuses.hit < 0), `hit ${p.bonuses.hit}`);
  b.monsters.dispose();
}

// -------------------------------------------------------------- the tail sweep
{
  const b = bench({ rng: () => 0.5 });
  const k = b.monsters.spawnAt('kraken', 0, 0);
  const p = benchPlayer(2, 0);
  for (let f = 0; f < 3000; f++) { b.run(1, p); p.pos.x = k.actor.pos.x + 2; }
  check(`every ${SWEEP_EVERY}th swing of a kraken is the tail and not the arm`,
    k.swings >= 8 && b.monsters.stats.sweeps === Math.floor(k.swings / SWEEP_EVERY),
    `${k.swings} swings, ${b.monsters.stats.sweeps} sweeps`);
  check('and the sweep costs the swing rather than being a free fifth attack',
    b.monsters.stats.sweeps < k.swings);
  check('and it says whether it caught you', b.said(/brings the tail round/).length === b.monsters.stats.sweeps);
  // the cone itself, both ways, at the numbers the sweep uses
  const at = { x: 0, z: 0 };
  const front = { pos: { x: 0, z: 3 }, health: 1 };
  const behind = { pos: { x: 0, z: -3 }, health: 1 };
  const beyond = { pos: { x: 0, z: SWEEP_RANGE + 1 }, health: 1 };
  check(`the ${SWEEP_RANGE} m, ${Math.round(SWEEP_HALF_ANGLE * 360 / Math.PI)} degree cone catches what is in front`,
    coneTargets(at, 0, SWEEP_RANGE, SWEEP_HALF_ANGLE, [front]).length === 1);
  check('and nothing behind it and nothing past its reach',
    coneTargets(at, 0, SWEEP_RANGE, SWEEP_HALF_ANGLE, [behind]).length === 0
    && coneTargets(at, 0, SWEEP_RANGE, SWEEP_HALF_ANGLE, [beyond]).length === 0);
  b.monsters.dispose();
}

// ------------------------------------------------------------- Malachar's time
{
  const b = bench({ rng: () => 0.5 });
  const m = b.monsters.spawnAt('malachar', 0, 0);
  const p = benchPlayer(6, 0);
  b.run(3, p);
  const row = MONSTERS.malachar;
  const plain = { ...m.actor, bonuses: { ...m.actor.bonuses, swingSpeed: 0 } };
  check('Malachar swings at half his seconds from the first frame',
    m.actor.bonuses.swingSpeed === DRAGON_SWING
    && Math.abs(swingSeconds(m.actor) - swingSeconds(plain) * (1 - DRAGON_SWING)) < 1e-9,
    `${swingSeconds(plain).toFixed(2)} s becomes ${swingSeconds(m.actor).toFixed(2)} s`);
  check(`and comes on at ${DRAGON_RUN} times his tabled run`,
    Math.abs(m.actor.run - row.run * DRAGON_RUN) < 1e-9, `${row.run} becomes ${m.actor.run}`);
  check('and nothing yet wants your own clock slowed',
    b.monsters.wantsPlayerSlow().active === false);
  m.actor.health = m.actor.maxHealth * 0.5;
  b.run(3, p);
  check('at half health he is in his first phase and still quick',
    m.phase === 1 && m.dragonOn === true && b.monsters.wantsPlayerSlow().active === false, `phase ${m.phase}`);
  m.actor.health = m.actor.maxHealth * 0.2;
  b.run(3, p);
  check('under a third his own speed comes off, exactly',
    m.dragonOn === false && Math.abs(m.actor.run - row.run) < 1e-9
    && Math.abs(m.actor.bonuses.swingSpeed - ENRAGE_SWING) < 1e-9,
    `run ${m.actor.run}, swingSpeed ${m.actor.bonuses.swingSpeed.toFixed(2)}`);
  const want = b.monsters.wantsPlayerSlow();
  check('and it is the PLAYER\'s clock he wants now, asked for and not taken',
    want.active === true && want.scale === DRAGON_PLAYER_SCALE && want.source === 'malachar', JSON.stringify(want));
  check('and he says the room slowed', b.said(/room slows down around him/).length === 1);
  b.combat.kill(m.actor, p);
  check('and a dead Wyrmking wants nothing', b.monsters.wantsPlayerSlow().active === false);
  b.monsters.dispose();
  // and he is the only row in the game that may ask
  const asks = Object.values(MONSTERS).filter((r) => (r.notes || []).includes('dragonTime'));
  check('and he is the only row that carries dragonTime at all',
    asks.length === 1 && asks[0].id === 'malachar', asks.map((r) => r.id).join(', '));
}

// --------------------------------------- nothing lent is left on a player
{
  const b = bench({ rng: () => 0.5 });
  b.monsters.spawnAt('cultistAdept', 0, 0);
  const p = benchPlayer(10, 0);
  for (let f = 0; f < 900 && !b.monsters.curses().length; f++) b.run(1, p);
  check('the player is carrying a curse', b.monsters.curses().length === 1);
  b.monsters.dispose();
  check('and disposing the whole runtime gives the points back rather than leaving them on him',
    (p.bonuses.hit || 0) === 0 && p.buffs.length === 0, `bonuses.hit ${p.bonuses.hit}, ${p.buffs.length} buffs`);
}


// ------------------------------------ every row that carries one, not just one
//
// "One case is never the case." Twenty one tags were added and each rule above
// is proved on ONE row that carries it. This drives EVERY row that carries any
// of them through three hundred frames of the real loop with a real player, and
// fails loudly on the day a rule works for a harpy and throws for a wyvern.
{
  const WAVE = ['shieldWall', 'healsAllies', 'howl', 'summons', 'dives', 'grab', 'ambush',
    'awakens', 'burrows', 'dropsFromAbove', 'stormCall', 'powderCharge', 'hex', 'ashCloud',
    'tailSweep', 'dragonTime', 'fireImmune', 'bow', 'shield', 'wanders', 'noonOnly'];
  const carriers = Object.values(MONSTERS).filter((m) => (m.notes || []).some((n) => WAVE.includes(n)));
  const broke = [];
  let fought = 0, dormantEnd = 0, critters = 0;
  for (const row of carriers) {
    try {
      const b = bench({ rng: () => 0.3, crng: () => 0.5, seed: 4242 });
      const mon = b.monsters.spawnAt(row.id, 0, 0);
      if (!mon) { broke.push(`${row.id}: no body`); continue; }
      const p = benchPlayer(3, 0);
      for (let f = 0; f < 300; f++) { b.run(1, p); p.pos.x = mon.actor.pos.x + 3; p.pos.z = mon.actor.pos.z; }
      // it either turned on the player or is legitimately still asleep
      if (mon.actor.ai.target) fought++;
      else if (mon.dormant) dormantEnd++;
      // a critter's aggro radius is zero by the temperament table, so the hawk
      // never turns on anybody and is right not to
      else if (row.temperament === 'critter') critters++;
      else broke.push(`${row.id}: three hundred frames at 3 m and it never turned`);
      // nothing it lent may be left on the player when it goes
      b.monsters.dispose();
      if ((p.bonuses.hit || 0) !== 0) broke.push(`${row.id}: left ${p.bonuses.hit} on the player's hit`);
      if (p.status.root) broke.push(`${row.id}: left the player rooted`);
    } catch (e) { broke.push(`${row.id}: ${e.message}`); }
  }
  check(`all ${carriers.length} rows carrying a wave A tag survive three hundred frames of the real loop`,
    broke.length === 0, broke.length ? broke.slice(0, 5).join(' | ') : `${fought} fought, ${dormantEnd} still asleep at 3 m, ${critters} critters that never turn on anyone`);
  // and every one of the twenty one tags is carried by at least one row, so no
  // rule above is a branch that can never run
  const missing = WAVE.filter((t) => !Object.values(MONSTERS).some((m) => (m.notes || []).includes(t)));
  check('and every tag a rule was written for is carried by a real row',
    missing.length === 0, missing.join(', ') || `${WAVE.length} tags, ${carriers.length} rows`);
}

console.log('monsters: a sculpt world rolls nothing wild');
{
  const F = await import('../world/field.js');
  const plain = F.createWorldField(7);
  const before = spawnsForChunk(plain, 3, -2, { night: true, chance: 1 });
  const sculpt = Object.create(plain); Object.defineProperty(sculpt, 'sculpt', { value: { height: 6, ground: 'grass' } });
  const after = spawnsForChunk(sculpt, 3, -2, { night: true, chance: 1 });
  check('the generating world rolls a group at chance 1', before.length > 0, `${before.length} bodies`);
  check('and the same chunk in a sculpt world rolls none', after.length === 0, `${after.length} bodies`);
}

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
