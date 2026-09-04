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
import { MONSTERS } from '../mmo/monsters.js';
import { aggroRadius, LEASH_MS, attackSkill, defenceSkill, swingSeconds, parryChance } from '../mmo/combat_rules.js';
import { createCombat } from './combat.js';
import { createLootDrops } from './loot_drops.js';
import { buildMonsterModel, auditMonsterShapes, DIE_SECONDS } from './monster_models.js';
import {
  createMonsters, makeMonsterActor, stepMonster, stepToward, stepAway, speedOf,
  spawnsForChunk, placeFor, blockedAt, poisonLevelOf, sharesAggro, naturalWeapon,
  ALIVE_CAP, SPAWN_KEEP, GROUP_AGGRO_M, GROUP_CHANCE, NEAR_RING, WANDER_R, FLEE_BREAK_M,
} from './monsters.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

// ------------------------------------------------------------------- stubs --

function stubField(o = {}) {
  const biome = o.biome || (() => 'meadow');
  const sampleAt = (x, z) => ({
    h: 3, biome: biome(x, z), water: !!(o.water && o.water(x, z)), river: 0,
    land: 1, temp: 0.5, moist: 0.5, site: null,
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
    const r = stepMonster(close, 1 / 60, { player: p2, now: f * (1000 / 60), heightAt: () => 3, reach: 2.4, rng: rng3 });
    if (r.wantSwing) swings++;
  }
  const stood = gap(close, p2);
  check('it closes to its reach and stops there', stood <= 2.4 + 1e-6 && stood > 2.0, `${stood.toFixed(3)} m`);
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

// ================================================================= the flee
{
  // "Vermin and beasts flee below 25% health and return healed."
  const wolf = makeMonsterActor('wolf', { pos: { x: 0, y: 0, z: 0 } });
  const player = fakePlayer(5, 0);
  stepMonster(wolf, 1 / 60, { player, now: 0, heightAt: () => 3, rng: seeded(6) });
  check('a wolf at full health comes at you', wolf.ai.state === 'chase' || wolf.ai.state === 'attack', wolf.ai.state);
  wolf.health = wolf.maxHealth * 0.26;
  stepMonster(wolf, 1 / 60, { player, now: 100, heightAt: () => 3, rng: seeded(6) });
  check('at 26% health it is still coming', wolf.ai.state !== 'flee', wolf.ai.state);
  wolf.health = wolf.maxHealth * 0.24;
  stepMonster(wolf, 1 / 60, { player, now: 200, heightAt: () => 3, rng: seeded(6) });
  check('at 24% it breaks', wolf.ai.state === 'flee', wolf.ai.state);

  const startGap = gap(wolf, player);
  for (let f = 0; f < 600 && wolf.ai.state === 'flee'; f++) {
    stepMonster(wolf, 1 / 60, { player, now: 300 + f * 16.7, heightAt: () => 3, rng: seeded(6) });
  }
  check('and it runs until it is clear', gap(wolf, player) >= FLEE_BREAK_M - 0.2 && gap(wolf, player) > startGap,
    `${startGap.toFixed(1)} m to ${gap(wolf, player).toFixed(1)} m`);
  // "and return healed"
  for (let f = 0; f < 4000 && wolf.ai.state !== 'idle'; f++) {
    stepMonster(wolf, 1 / 60, { player: null, now: 20000 + f * 16.7, heightAt: () => 3, rng: seeded(6) });
  }
  check('it walks home and comes back whole', wolf.ai.state === 'idle' && wolf.health === wolf.maxHealth,
    `${wolf.health} of ${wolf.maxHealth}`);

  // "Undead and constructs never flee."
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
  check('the meadow by day is rats, boars, bandits and goblin scouts',
    [...dayIds].sort().join(',') === 'bandit,boar,giantRat,goblinScout', [...dayIds].join(', '));
  check('and by night it is wolves, skeletons and zombies',
    nightIds.has('wolf') && nightIds.has('skeleton') && nightIds.has('zombie') && !nightIds.has('boar'), [...nightIds].join(', '));

  // the density interpretation, measured rather than asserted
  let dayChunks = 0, nightChunks = 0, n = 0;
  for (let cz = -20; cz <= 20; cz++) for (let cx = -20; cx <= 20; cx++) {
    n++;
    if (spawnsForChunk(field, cx, cz, { night: false, spawnPoint }).length) dayChunks++;
    if (spawnsForChunk(field, cx, cz, { night: true, spawnPoint }).length) nightChunks++;
  }
  const dayRate = dayChunks / n, nightRate = nightChunks / n;
  check('about one chunk in six holds a group by day', Math.abs(dayRate - GROUP_CHANCE.day) < 0.05, `${(dayRate * 100).toFixed(1)}% against ${(GROUP_CHANCE.day * 100).toFixed(1)}%`);
  check('and better than two in five at night', Math.abs(nightRate - GROUP_CHANCE.night) < 0.05, `${(nightRate * 100).toFixed(1)}% against ${(GROUP_CHANCE.night * 100).toFixed(1)}%`);

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
  const monsters = createMonsters(scene, runtime, { groupChance: 1, rng: seeded(11), spawnPoint: { x: 1e6, z: 1e6 } });
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
  check('and it still holds after walking 18 chunks', monsters.count <= ALIVE_CAP, `${monsters.count}`);
  monsters.dispose();
  check('disposing takes every body out of the scene', scene.children.length === 0);
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
  check('the body is taken away once it has fallen over',
    victim.model.group.parent === null && victim.model.dieDone === true);

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
  let built = 0, tallest = null;
  for (const m of Object.values(MONSTERS)) {
    const model = buildMonsterModel(m.id);
    if (m.tier === 0) { if (model !== null) fail++; continue; }
    if (!model) { check(`${m.id} builds a body`, false); continue; }
    built++;
    if (!tallest || model.height > tallest.h) tallest = { id: m.id, h: model.height };
    if (model.radius <= 0 || model.height <= 0) check(`${m.id} has a real size`, false);
  }
  check('every monster in the roster builds a body', built === Object.values(MONSTERS).filter((m) => m.tier > 0).length, `${built} bodies`);
  check('and the biggest of them is a boss', MONSTERS[tallest.id].tier >= 5, `${tallest.id} at ${tallest.h.toFixed(1)} m`);
  check('a critter builds nothing here, because fauna.js already has one', buildMonsterModel('rabbit') === null);
  check('an unknown id builds nothing rather than a grey cube', buildMonsterModel('grue') === null);

  const rat = buildMonsterModel('giantRat');
  check('a rat is low and long, and on four legs', rat.height < 0.8 && rat.parts.legs.length === 4, `${rat.height.toFixed(2)} m`);
  const spider = buildMonsterModel('giantSpider');
  check('a spider has eight', spider.parts.legs.length === 8);
  const skel = buildMonsterModel('skeleton');
  check('a skeleton is thinner than a zombie of the same tier',
    skel.radius < buildMonsterModel('zombie').radius, `${skel.radius.toFixed(2)} against ${buildMonsterModel('zombie').radius.toFixed(2)}`);

  // the gait is a function of ground covered, not of time
  const walker = buildMonsterModel('wolf');
  walker.setAnim('walk');
  walker.update(1 / 60, 0);
  const still = walker.parts.legs[0].rotation.x;
  for (let f = 0; f < 30; f++) walker.update(1 / 60, 8.5);
  check('a standing wolf keeps its legs still', still === 0, `${still}`);
  check('and a running one does not', Math.abs(walker.parts.legs[0].rotation.x) > 0.05, `${walker.parts.legs[0].rotation.x.toFixed(3)}`);

  // die is a one way door, and it finishes
  const dying = buildMonsterModel('skeleton');
  dying.setAnim('die');
  check('the topple has not finished on the first frame', dying.dieDone === false);
  for (let f = 0; f < Math.ceil(DIE_SECONDS * 60) + 2; f++) dying.update(1 / 60, 0);
  check('and it has after DIE_SECONDS', dying.dieDone === true);
  check('and it is lying down', Math.abs(dying.parts.root.rotation.z - Math.PI / 2) < 0.05, `${dying.parts.root.rotation.z.toFixed(2)} rad`);
  dying.setAnim('walk');
  check('a dead thing does not get up', dying.anim === 'die');
}

// ================================================== the natural weapon and reach
{
  const w = naturalWeapon(MONSTERS.giantRat);
  check('a giant rat swings 2 to 5 every 2.0 s, which is its own row', w.minDamage === 2 && w.maxDamage === 5 && w.speed === 2.0);
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

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
