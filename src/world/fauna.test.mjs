// Where the animals of the world stand, and what happens to them once the
// monster layer stands them up. Run: node src/world/fauna.test.mjs
//
// THIS SUITE WAS REWRITTEN, and the reason matters. The old one drove
// `createFauna` as a thing that built deer out of THREE and walked them itself:
// eighty six checks about a hit column, a roam record shaped like farm.js's, an
// hp table, a flee timer and a body that sank into the ground. None of that
// exists now. The animals are tier 0 monster rows, so the hp, the flee, the
// death and the corpse are `src/game/monsters.js`'s and are tested there; what
// is left for this file is placement, which is the half fauna was always for.
//
// Everything below is measured on the REAL world field or driven through the
// REAL monster runtime. The one thing that is stubbed is named and explained
// where it happens.

import * as THREE from 'three';
import { createWorldField, BIOMES, CHUNK } from './field.js';
import {
  createFauna, spawnsFor, countsFor, blockedAt, isForestEdge, neighbourHas,
  auditSpawnTable, SPAWN, CRITTERS, EDGES, siteClear, SITE_PAD, HOME_KEEP, RIVER_MAX,
} from './fauna.js';
import { MONSTERS } from '../mmo/monsters.js';
import {
  createMonsters, spawnsForChunk, stepMonster, makeMonsterActor,
  blockedAt as monsterBlockedAt, ALIVE_CAP, NEAR_RING, SETTLEMENT_PAD,
} from '../game/monsters.js';
import { buildMonsterModel } from '../game/monster_models.js';
import { createCombat } from '../game/combat.js';
import { hoverHeight, HOVER_MIN, HOVER_MAX, SWOOP_SECONDS } from '../game/monster_ai.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };
const f = createWorldField(20260904, { homeY: -0.3 });

/** A field that answers whatever a test needs, with createFauna's own surface. */
function stubField(o = {}) {
  const biome = o.biome || (() => 'meadow');
  const water = o.water || (() => false);
  const river = o.river || (() => 0);
  const height = o.height || (() => 3);
  const sampleAt = (x, z) => ({
    h: height(x, z), biome: biome(x, z), water: water(x, z), river: river(x, z),
    land: 1, temp: 0.5, moist: 0.5, site: null, danger: null,
  });
  return {
    seed: o.seed ?? 4242, seaLevel: -0.8, chunk: CHUNK,
    sampleAt, heightAt: (x, z) => sampleAt(x, z).h, biomeAt: (x, z) => sampleAt(x, z).biome,
    chunkOf: (x, z) => [Math.floor(x / CHUNK), Math.floor(z / CHUNK)],
  };
}

// ===========================================================================
console.log('fauna: the table, both directions');
{
  check('the spawn table passes', auditSpawnTable() === true);
  let threw = 0;
  const row = SPAWN.snow;
  delete SPAWN.snow;
  try { auditSpawnTable(); } catch { threw++; }
  SPAWN.snow = row;

  SPAWN.desert.push({ id: 'gull', p: 1, n: [1, 1] });          // a gull in a desert
  try { auditSpawnTable(); } catch { threw++; }
  SPAWN.desert.pop();

  SPAWN.meadow.push({ id: 'basilisk', p: 1, n: [1, 1] });      // a species that does not exist
  try { auditSpawnTable(); } catch { threw++; }
  SPAWN.meadow.pop();

  const keptBiomes = CRITTERS.crow.biomes;
  CRITTERS.crow = { ...CRITTERS.crow, biomes: ['nowhere'] };    // a biome that does not exist
  try { auditSpawnTable(); } catch { threw++; }
  CRITTERS.crow.biomes = keptBiomes;

  const kept = CRITTERS.rabbit;
  CRITTERS.wolf = { biomes: ['boreal'] };                       // a tier 2 monster in a tier 0 table
  SPAWN.boreal.push({ id: 'wolf', p: 1, n: [1, 1] });
  try { auditSpawnTable(); } catch { threw++; }
  SPAWN.boreal.pop();
  delete CRITTERS.wolf;
  CRITTERS.rabbit = kept;

  check('a missing biome, a misplaced species, an unknown species, an unknown biome and a tier 2 row all throw',
    threw === 5, `${threw} of 5`);
  check('and the table is whole again', auditSpawnTable() === true);
  check('every biome the field can return has a row', BIOMES.every((b) => SPAWN[b]), BIOMES.join(', '));
  check('every species placed is a real tier 0 monster',
    Object.keys(CRITTERS).every((id) => MONSTERS[id] && MONSTERS[id].tier === 0),
    Object.keys(CRITTERS).map((id) => `${id} t${MONSTERS[id]?.tier}`).join(', '));
}

// ===========================================================================
console.log('\nfauna: the record is the monster layer\'s own record');
{
  // Find a chunk that actually rolls something, then compare its records field
  // for field against a REAL record out of monsters.spawnsForChunk. If the two
  // shapes ever drift, the concatenation in monsters.chunkFor would hand the
  // cap a record it cannot rank and nothing would say so.
  let mine = [];
  for (let cx = 0; cx < 400 && !mine.length; cx++) mine = spawnsFor(f, cx, 17);
  check('there is a chunk with animals in it to compare', mine.length > 0, `${mine.length} placed`);

  let theirs = [];
  for (let cx = 0; cx < 600 && !theirs.length; cx++) theirs = spawnsForChunk(f, cx, 23, { night: true, chance: 1 });
  check('and a chunk with monsters in it', theirs.length > 0, `${theirs.length} rolled`);

  const keysOf = (r) => Object.keys(r).sort().join(',');
  check('a critter record carries exactly the fields a monster record does',
    keysOf(mine[0]) === keysOf(theirs[0]), `${keysOf(mine[0])}\n            vs ${keysOf(theirs[0])}`);
  check('and every value is of the type the monster layer reads',
    mine.every((r) => typeof r.id === 'string' && typeof r.key === 'string' && typeof r.groupKey === 'string'
      && Number.isFinite(r.x) && Number.isFinite(r.z) && Number.isFinite(r.y)
      && Number.isInteger(r.i) && Number.isInteger(r.cx) && Number.isInteger(r.cz) && typeof r.night === 'boolean'));
  check('every id is a monster the roster knows', mine.every((r) => !!MONSTERS[r.id]));

  // the keys are what the character's dead list matches on: unique, stable, and
  // never equal to a monster key rolled on the same chunk
  const allKeys = [];
  for (let cx = 0; cx < 60; cx++) for (let cz = 0; cz < 12; cz++) allKeys.push(...spawnsFor(f, cx, cz).map((r) => r.key));
  check('keys are unique across 720 chunks', new Set(allKeys).size === allKeys.length, `${allKeys.length} keys`);
  const monsterKeys = new Set();
  for (let cx = 0; cx < 60; cx++) for (let cz = 0; cz < 12; cz++) {
    for (const r of spawnsForChunk(f, cx, cz, { night: true, chance: 1 })) monsterKeys.add(r.key);
  }
  check('and not one of them collides with a monster key on the same ground',
    allKeys.every((k) => !monsterKeys.has(k)), `${monsterKeys.size} monster keys rolled`);
  check('a key says what it is, so a save can be read by eye', allKeys.every((k) => k.startsWith('critter:')));
}

// ===========================================================================
console.log('\nfauna: the same ground gives the same animals');
{
  const a = JSON.stringify(spawnsFor(f, 12, 17)), b = JSON.stringify(spawnsFor(f, 12, 17));
  check('same chunk, same animals', a === b);
  const other = createWorldField(20260905, { homeY: -0.3 });
  let same = 0, looked = 0;
  for (let i = 0; i < 400; i++) {
    const cx = 12 + (i % 20) - 10, cz = 17 + ((i / 20) | 0) - 10;
    const A = spawnsFor(f, cx, cz), B = spawnsFor(other, cx, cz);
    if (!A.length && !B.length) continue;
    looked++;
    if (JSON.stringify(A) === JSON.stringify(B)) same++;
  }
  check('there were populated chunks to compare', looked > 20, `${looked}`);
  check('another seed, another world', same === 0, `${same} of ${looked} agreed`);
}

// ===========================================================================
console.log('\nfauna: a 3 by 3 chunk block of real ground, per biome');
//
// 3 x 3 chunks is 192 m square, which is 36,864 square metres of world. The
// counts are printed rather than asserted against a number pulled out of the
// air; what IS asserted is that every biome the world has produces animals over
// a large enough sample, and that none of them is standing anywhere it may not.
{
  // Up to twenty solid 3 x 3 blocks per biome, not one: a single block of nine
  // chunks at these densities comes up empty more often than not, and reporting
  // the first one found would say "the meadow holds no animals", which is a lie
  // about the distribution rather than a fact about the world.
  const blocks = {};
  for (const b of BIOMES) blocks[b] = [];
  for (let cz = -70; cz <= 70; cz++) {
    for (let cx = -70; cx <= 70; cx++) {
      const b = f.biomeAt((cx + 0.5) * CHUNK, (cz + 0.5) * CHUNK);
      if (!blocks[b] || blocks[b].length >= 20) continue;
      let whole = true;
      for (let dz = -1; dz <= 1 && whole; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (f.biomeAt((cx + dx + 0.5) * CHUNK, (cz + dz + 0.5) * CHUNK) !== b) { whole = false; break; }
      }
      if (!whole) continue;
      const recs = [];
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) recs.push(...spawnsFor(f, cx + dx, cz + dz));
      blocks[b].push({ at: `${cx},${cz}`, recs });
      cx += 2;                                   // do not count the same ground twice
    }
  }
  // How many solid 3 x 3 blocks a biome HAS is the world's business, not this
  // file's: a beach is a strip and a mountain range can be a scatter of single
  // chunks, and both move whenever zones.js does. So the assertion is on the
  // size of the sample overall, and the per biome density that a thin biome
  // cannot report is reported by the wide single chunk sweep below instead.
  const sampled = BIOMES.filter((b) => blocks[b].length >= 12);
  check('the 3 by 3 sample is large enough to mean something',
    Object.values(blocks).reduce((n, x) => n + x.length, 0) >= 80 && sampled.length >= 5,
    BIOMES.map((b) => `${b} ${blocks[b].length}`).join(', '));

  const perBiome = {};
  for (const b of BIOMES) {
    const bs = blocks[b];
    if (!bs.length) continue;
    const all = bs.flatMap((x) => x.recs);
    const byId = {};
    for (const r of all) byId[r.id] = (byId[r.id] || 0) + 1;
    const busiest = bs.reduce((w, x) => (x.recs.length > w.recs.length ? x : w));
    perBiome[b] = { recs: all, byId };
    console.log(`       ${b.padEnd(9)} ${String(all.length).padStart(3)} animals over ${bs.length} blocks of 9 chunks`
      + ` (${(all.length / bs.length).toFixed(1)} a block, busiest ${busiest.recs.length} at ${busiest.at})`
      + (all.length ? `: ${Object.entries(byId).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${v} ${k}`).join(', ')}` : ''));
  }
  // A block of ocean that is solid ocean is by definition NOT coast, and gulls
  // keep the coast, so the zero above is the rule working rather than a hole.
  // The wide sample below is where the ocean's gulls turn up.
  check('a 3 by 3 block of meadow holds animals about half the time',
    blocks.meadow.filter((x) => x.recs.length).length >= blocks.meadow.length * 0.4,
    `${blocks.meadow.filter((x) => x.recs.length).length} of ${blocks.meadow.length} blocks were not empty`);

  // and the same over a much wider sample, which is what the density really is
  const wide = {};
  for (let cz = -70; cz <= 70; cz += 1) for (let cx = -70; cx <= 70; cx += 3) {
    const b = f.biomeAt((cx + 0.5) * CHUNK, (cz + 0.5) * CHUNK);
    wide[b] = wide[b] || { chunks: 0, n: 0, ids: new Set() };
    wide[b].chunks++;
    for (const r of spawnsFor(f, cx, cz)) { wide[b].n++; wide[b].ids.add(r.id); }
  }
  for (const b of BIOMES) {
    const w = wide[b];
    if (!w) continue;
    console.log(`       ${b.padEnd(9)} ${w.n} animals over ${w.chunks} single chunks (${(w.n / w.chunks).toFixed(2)} a chunk): ${[...w.ids].sort().join(' ') || 'none'}`);
  }
  check('every biome in the world holds animals, including the dry and the cold',
    BIOMES.every((b) => !wide[b] || wide[b].n > 0),
    BIOMES.filter((b) => wide[b] && !wide[b].n).join(', ') || 'all of them');

  // and the negatives, or the positives would pass on an empty world
  check('a gull never stands inland', !(wide.meadow?.ids.has('gull')) && !(wide.boreal?.ids.has('gull')));
  check('a squirrel never stands on a beach', !(wide.beach?.ids.has('squirrel')));
  check('open water holds gulls and nothing else',
    [...(wide.ocean?.ids || [])].every((id) => id === 'gull'), [...(wide.ocean?.ids || [])].join(' '));

  // nothing is in the water and nothing is up a river, on real ground
  let wet = 0, total = 0;
  for (const b of BIOMES) {
    for (const r of perBiome[b]?.recs || []) {
      total++;
      const s = f.sampleAt(r.x, r.z);
      if (CRITTERS[r.id].flying) continue;             // a gull may be over the sea
      if (s.water || s.river > RIVER_MAX) wet++;
    }
  }
  check('not one animal on legs is standing in water or in a river', wet === 0, `${wet} of ${total}`);
}

// ===========================================================================
console.log('\nfauna: the forest edge and the coast, both directions');
{
  let interiorDeer = 0, edgeDeer = 0, interior = 0, edge = 0;
  for (let cz = -50; cz < 50; cz++) for (let cx = -50; cx < 50; cx++) {
    if (f.biomeAt((cx + 0.5) * CHUNK, (cz + 0.5) * CHUNK) !== 'boreal') continue;
    const isEdge = isForestEdge(f, cx, cz);
    if (isEdge) edge++; else interior++;
    const n = countsFor(f, cx, cz).deer || 0;
    if (isEdge) edgeDeer += n; else interiorDeer += n;
  }
  check('deep boreal and edge boreal chunks both exist', interior > 20 && edge > 20, `${interior} deep, ${edge} edge`);
  check('no deer deep in the forest', interiorDeer === 0, `${interiorDeer}`);
  check('deer along the forest edge', edgeDeer > 0, `${edgeDeer}`);

  let openSeaGulls = 0, coastGulls = 0, openSea = 0, coast = 0;
  for (let cz = -50; cz < 50; cz++) for (let cx = -50; cx < 50; cx++) {
    if (f.biomeAt((cx + 0.5) * CHUNK, (cz + 0.5) * CHUNK) !== 'ocean') continue;
    const isCoast = neighbourHas(f, cx, cz, EDGES.coast);
    if (isCoast) coast++; else openSea++;
    const n = countsFor(f, cx, cz).gull || 0;
    if (isCoast) coastGulls += n; else openSeaGulls += n;
  }
  check('open sea and coast chunks both exist', openSea > 20 && coast > 20, `${openSea} open, ${coast} coast`);
  check('no gulls out over the open sea', openSeaGulls === 0, `${openSeaGulls}`);
  check('gulls along the coast', coastGulls > 0, `${coastGulls}`);
}

// ===========================================================================
console.log('\nfauna: nothing stands where it may not');
{
  // water and river, on a field that is half wet
  const wet = stubField({ water: (x) => x > 0 });
  let wetSide = 0, drySide = 0;
  for (let cz = 3; cz < 22; cz++) for (let cx = -22; cx < 22; cx++) {
    for (const r of spawnsFor(wet, cx, cz)) {
      if (CRITTERS[r.id].flying) continue;
      if (r.x > 0) wetSide++; else drySide++;
    }
  }
  check('nothing on legs spawns on water', wetSide === 0, `${wetSide}`);
  check('and the same rolls do spawn on the dry half', drySide > 20, `${drySide}`);

  const streamy = stubField({ river: (x) => (Math.abs(x % 200) < 40 ? 0.9 : 0) });
  let inRiver = 0, outRiver = 0;
  for (let cz = 3; cz < 26; cz++) for (let cx = 3; cx < 26; cx++) {
    for (const r of spawnsFor(streamy, cx, cz)) {
      if (CRITTERS[r.id].flying) continue;
      if (Math.abs(r.x % 200) < 40) inRiver++; else outRiver++;
    }
  }
  check('nothing on legs spawns in a river', inRiver === 0, `${inRiver}`);
  check('and the same rolls do spawn off it', outRiver > 20, `${outRiver}`);

  // A SITE'S FLAT GROUND. Find ground that DOES hold animals, then put a town
  // on it and roll it again: the same rolls, one site's worth of difference.
  const plain = stubField({});
  let site = null, thereWithout = 0, inTown = 0;
  for (let gz = 4; gz <= 40 && !site; gz++) for (let gx = 4; gx <= 40 && !site; gx++) {
    const c = { x: gx * CHUNK + 32, z: gz * CHUNK + 32, flatR: 46, kind: 'town' };
    const near = (r) => Math.hypot(r.x - c.x, r.z - c.z) < siteClear(c);
    let n = 0;
    for (let cz = gz - 1; cz <= gz + 1; cz++) for (let cx = gx - 1; cx <= gx + 1; cx++) {
      for (const r of spawnsFor(plain, cx, cz)) if (near(r)) n++;
    }
    if (n > 0) { site = c; thereWithout = n; }
  }
  check('found open ground that holds animals', !!site, site ? `${thereWithout} standing on it` : 'none');
  if (site) {
    const near = (r) => Math.hypot(r.x - site.x, r.z - site.z) < siteClear(site);
    const gx = Math.floor(site.x / CHUNK), gz = Math.floor(site.z / CHUNK);
    for (let cz = gz - 1; cz <= gz + 1; cz++) for (let cx = gx - 1; cx <= gx + 1; cx++) {
      for (const r of spawnsFor(plain, cx, cz, { sitesNear: () => [site] })) if (near(r)) inTown++;
    }
  }
  check('a town clears every animal off its own flat ground', inTown === 0, `${thereWithout} -> ${inTown}`);
  check('and the clearing is the flat radius plus the pad, not a guess',
    siteClear({ flatR: 46 }) === 46 + SITE_PAD, `${siteClear({ flatR: 46 })} m`);
  check('and the pad is at least the monster layer\'s own settlement pad',
    SITE_PAD >= SETTLEMENT_PAD, `fauna ${SITE_PAD}, monsters ${SETTLEMENT_PAD}`);

  // The site rule and the monster layer's own settlement rule have to agree, or
  // a rabbit stands in a market square that a wolf may not walk into.
  const sq = { x: site.x, z: site.z, flatR: 46, kind: 'town' };
  const recs = [];
  const gx = Math.floor(site.x / CHUNK), gz = Math.floor(site.z / CHUNK);
  for (let cz = gz - 8; cz <= gz + 8; cz++) for (let cx = gx - 8; cx <= gx + 8; cx++) {
    recs.push(...spawnsFor(plain, cx, cz, { sitesNear: () => [sq] }));
  }
  check('and the monster layer agrees that every one of the placed animals may stand there',
    recs.length > 20 && recs.every((r) => monsterBlockedAt(r.x, r.z, plain.sampleAt(r.x, r.z), { sites: [sq], spawnKeep: 0 }) === null),
    `${recs.length} placed, ${recs.filter((r) => monsterBlockedAt(r.x, r.z, plain.sampleAt(r.x, r.z), { sites: [sq], spawnKeep: 0 })).length} refused`);

  // the predicate itself, one reason at a time, both ways
  const dry = { h: 4, biome: 'meadow', water: false, river: 0 };
  check('blockedAt: open meadow is fine', blockedAt(900, 900, dry, { sites: [] }) === null);
  check('blockedAt: water is not', blockedAt(900, 900, { ...dry, water: true }, { sites: [] }) === 'water');
  check('blockedAt: a river is not', blockedAt(900, 900, { ...dry, river: 0.9 }, { sites: [] }) === 'water');
  check('blockedAt: a site clearing is not', blockedAt(site.x + 10, site.z, dry, { sites: [site] }) === 'site');
  check('blockedAt: just outside that clearing is fine', blockedAt(site.x + siteClear(site) + 1, site.z, dry, { sites: [site] }) === null);
  check('blockedAt: a bird may be over water', blockedAt(900, 900, { ...dry, water: true }, { sites: [], flying: true }) === null);
  check('blockedAt: but not over a town', blockedAt(site.x, site.z, dry, { sites: [site], flying: true }) === 'site');
  check('blockedAt: the wrong biome is refused', blockedAt(900, 900, dry, { sites: [], biomes: ['boreal'] }) === 'biome');
  check('blockedAt: a quiet ring is kept when one is asked for', blockedAt(20, 20, dry, { sites: [], homeKeep: 130 }) === 'home');
  check('and there is no quiet ring by default, because there is no farm any more',
    HOME_KEEP === 0 && blockedAt(20, 20, dry, { sites: [] }) === null);
}

// ===========================================================================
console.log('\nfauna: the near ring, and what it costs the monster cap');
{
  const fauna = createFauna(f, {});
  // walk a line and measure what the ring actually asks for at each step
  const counts = [];
  for (let i = 0; i < 24; i++) {
    fauna.forget();
    counts.push(fauna.ringSpawns(6 + i * 3, 17, NEAR_RING, false).length);
  }
  const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
  const worst = Math.max(...counts);
  console.log(`       the near ring wants ${counts.join(', ')} critters as you walk`);
  check(`the near ring averages under a quarter of the ${ALIVE_CAP} body cap`,
    avg < ALIVE_CAP * 0.25, `${avg.toFixed(1)} on average, ${worst} at the worst`);
  check('but it is not empty either, or there would be nothing to look at',
    avg > 3, `${avg.toFixed(1)}`);

  // THE NUMBER THAT ACTUALLY MATTERS is not how many critters the ring wants,
  // it is how many MONSTERS survive the shared cap once the two lists are
  // ranked together, because that is the thing a player would notice going
  // wrong. So it is measured rather than argued about: the real monster roll,
  // the real critter roll, ranked by distance the way `rescan` ranks them, and
  // counted. At night the roster alone already wants more than the cap, which
  // is the worst case for a rabbit taking a wolf's slot.
  const kept = [];
  for (let i = 0; i < 24; i++) {
    const px = (6 + i * 3) * CHUNK + 32, pz = 17 * CHUNK + 32;
    const [pcx, pcz] = f.chunkOf(px, pz);
    const all = [];
    fauna.forget();
    for (let dz = -NEAR_RING; dz <= NEAR_RING; dz++) for (let dx = -NEAR_RING; dx <= NEAR_RING; dx++) {
      all.push(...spawnsForChunk(f, pcx + dx, pcz + dz, { night: true }));
      all.push(...fauna.spawnsFor(pcx + dx, pcz + dz, true));
    }
    all.sort((a, b) => ((a.x - px) ** 2 + (a.z - pz) ** 2) - ((b.x - px) ** 2 + (b.z - pz) ** 2));
    const top = all.slice(0, ALIVE_CAP);
    kept.push({
      monsters: top.filter((r) => !r.key.startsWith('critter:')).length,
      critters: top.filter((r) => r.key.startsWith('critter:')).length,
      wanted: all.length,
    });
  }
  const saturated = kept.filter((k) => k.wanted >= ALIVE_CAP);
  // only the steps where the cap actually had to turn something away: a step in
  // the middle of the sea keeps no monsters because there were none to keep
  const worstNight = saturated.reduce((w, k) => (k.monsters < w.monsters ? k : w), { monsters: Infinity });
  console.log(`       at night the cap keeps ${kept.map((k) => `${k.monsters}+${k.critters}`).join(' ')} (monsters + critters)`);
  check('the merged night ring is genuinely over the cap somewhere, or this proves nothing',
    saturated.length > 0, `${saturated.length} of 24 steps want more than ${ALIVE_CAP} bodies`);
  check('and even at the worst of them the monsters keep well over half the cap',
    worstNight.monsters >= ALIVE_CAP * 0.55,
    `worst step keeps ${worstNight.monsters} monsters and ${worstNight.critters} critters of ${worstNight.wanted} wanted`);

  // the memo answers the same question the same way and does not grow for ever
  const one = fauna.spawnsFor(9, 17, false);
  check('asking twice gives the same records', fauna.spawnsFor(9, 17, false) === one);
  check('and day and night are two different questions',
    fauna.spawnsFor(9, 17, true) !== one);
  for (let i = 0; i < 900; i++) fauna.spawnsFor(i, 3, false);
  check('the memo is a cache, not a world', fauna.stats.chunks > 900, `${fauna.stats.chunks} chunks rolled`);
  fauna.dispose();
}

// ===========================================================================
console.log('\nfauna: the seam, and the one line that is not written yet');
//
// STUB, AND SAID SO. `monsters.chunkFor` does not read `runtime.critterSpawns`
// yet: docs/mmo/wiring/F1.md quotes the one line that makes it. What is checked
// here is the property that line depends on, which is the risky half: that the
// two lists really can be concatenated and ranked as one.
{
  const fauna = createFauna(f, {});
  let merged = 0, ranked = 0;
  for (let cx = 0; cx < 80; cx++) {
    const own = spawnsForChunk(f, cx, 17, { night: true });
    const critters = fauna.spawnsFor(cx, 17, true);
    const all = own.concat(critters);
    merged += critters.length;
    // this is what rescan does with them: rank by distance, keep the cap
    const wanted = all.map((rec) => ({ rec, d2: (rec.x - 0) ** 2 + (rec.z - 0) ** 2 }));
    wanted.sort((a, b) => a.d2 - b.d2 || (a.rec.key < b.rec.key ? -1 : 1));
    ranked += wanted.length;
    if (new Set(all.map((r) => r.key)).size !== all.length) { check('keys stay unique through the merge', false, `chunk ${cx}`); break; }
  }
  check('eighty chunks of both lists concatenate with no key collision', merged > 0 && ranked > merged,
    `${merged} critters into ${ranked} records`);
  check('and every merged record ranks, which is all the cap asks of it', ranked > 0);
  fauna.dispose();
}

// ===========================================================================
console.log('\nfauna: a critter is a monster now, driven through the real runtime');
{
  // THE BUG THE USER FOUND. `buildMonsterModel` returned null for every tier 0
  // row, so `monsters.spawn` refused to stand one up and a squirrel was not
  // there to click.
  for (const id of ['rabbit', 'squirrel', 'deer', 'gull', 'crow', 'frog', 'fieldMouse']) {
    const m = buildMonsterModel(id);
    if (!m) { check(`${id} builds a body`, false); continue; }
    m.dispose();
  }
  check('every tier 0 row in the roster builds a body', true, 'rabbit, squirrel, deer, gull, crow, frog, fieldMouse');

  const scene = new THREE.Group();
  const runtime = {
    field: f,
    heightAt: (x, z) => f.heightAt(x, z),
    sitesNear: () => [],
    inDungeon: false,
    critterSpawns: (cx, cz, night) => spawnsFor(f, cx, cz, { night }),
  };
  const monsters = createMonsters(scene, runtime, { rng: () => 0.5, deadUntil: [], spawnPoint: { x: 0, z: 0 } });
  const mon = monsters.spawnAt('squirrel', 400, 400);
  check('the monster layer stands a squirrel up', !!mon, mon ? mon.name : 'nothing');
  check('and it is an actor with health, a tier and a temperament',
    mon.actor.health > 0 && mon.actor.tier === 0 && mon.actor.temperament === 'critter',
    `${mon.actor.health} hp, tier ${mon.actor.tier}, ${mon.actor.temperament}`);
  check('it has a body in the scene', monsters.group.children.includes(mon.model.group));
  check('IT IS TARGETABLE: a click column on the group the raycaster tests',
    !!mon.model.parts.hit && mon.model.parts.hit.userData.monster === mon);
  check('and the column is big enough to hit even on a small animal',
    mon.model.parts.hit.geometry.parameters.radiusTop >= 0.34
    && mon.model.parts.hit.geometry.parameters.height >= 0.95,
    `r ${mon.model.parts.hit.geometry.parameters.radiusTop.toFixed(2)} m, h ${mon.model.parts.hit.geometry.parameters.height.toFixed(2)} m`);
  check('it is in targets(), which is what the cursor tests against', monsters.targets().includes(mon.model.group));
  check('and in actors(), which is what an area effect sweeps', monsters.actors().includes(mon.actor));

  // the raycaster, for real: a ray straight down onto the column
  const ray = new THREE.Raycaster();
  monsters.group.updateMatrixWorld(true);
  const p = mon.actor.pos;
  ray.set(new THREE.Vector3(p.x, p.y + 30, p.z), new THREE.Vector3(0, -1, 0));
  check('a ray from overhead picks the squirrel', monsters.pick(ray) === mon, `${monsters.pick(ray)?.name}`);
  const miss = new THREE.Raycaster();
  miss.set(new THREE.Vector3(p.x + 20, p.y + 30, p.z), new THREE.Vector3(0, -1, 0));
  check('and a ray twenty metres to the side picks nothing', miss.pick === undefined && monsters.pick(miss) === null);

  // it is skinnable, which is the other half of "it is a real animal"
  check('its row carries a hide for the knife', (MONSTERS.squirrel.lootTable || []).includes('hide'),
    (MONSTERS.squirrel.lootTable || []).join(', '));

  // it never attacks first: aggro 0 is the whole of "critters never aggro"
  const player = { kind: 'player', health: 100, maxHealth: 100, pos: { x: p.x + 0.5, y: p.y, z: p.z }, yaw: 0 };
  for (let i = 0; i < 60; i++) monsters.update(1 / 60, 1000 + i * 16, player, false);
  check('a squirrel stood on your boot never turns on you',
    !mon.actor.ai.target && mon.actor.ai.state !== 'chase' && mon.actor.ai.state !== 'attack',
    `state ${mon.actor.ai.state}`);
  check('and the player took nothing off it', player.health === 100, `${player.health}`);
  monsters.dispose();
}

// ===========================================================================
console.log('\nfauna: killing one, through the real resolver');
//
// The other half of the user's complaint. An animal you cannot kill and cannot
// skin is scenery whatever it looks like, so the kill goes through the REAL
// createCombat, into the REAL monsters.died, and the body is looked for through
// the REAL corpsesNear, which is the call skinning.js uses.
{
  const scene = new THREE.Group();
  const runtime = {
    field: f, heightAt: () => 0, sitesNear: () => [], inDungeon: false,
    critterSpawns: () => [],
  };
  const said = [];
  const combat = createCombat({ rng: () => 0, hud: { log: (t) => said.push(String(t)) } });
  const deadUntil = [];
  const monsters = createMonsters(scene, runtime, {
    combat, rng: () => 0.5, deadUntil, spawnPoint: { x: 0, z: 0 },
    hud: { log: (t) => said.push(String(t)) },
    clock: () => 1000000,
  });
  const deer = monsters.spawnAt('deer', 200, 200);
  check('a deer stands up', !!deer && deer.actor.health > 0, `${deer?.actor.health} hp`);

  const hunter = {
    id: 'you', kind: 'player', name: 'you', pos: { x: 200.5, y: 0, z: 200 }, yaw: 0,
    stats: { str: 0, dex: 0, int: 0, con: 0, wis: 0 },
    skills: { swordsmanship: 100, tactics: 0, anatomy: 0, parrying: 0 },
    bonuses: {}, ar: 0, resists: {},
    weapon: { skill: 'swordsmanship', minDamage: 60, maxDamage: 60, speed: 0.2, weight: 3, damageType: 'physical', reach: 3 },
    shield: null, health: 100, maxHealth: 100, mana: 0, maxMana: 0, stamina: 100, maxStamina: 100,
    buffs: [], status: {}, lastSwingAt: -Infinity, casting: null, faction: 'player', ai: null, anim: 'idle',
  };
  let now = 1000, swings = 0;
  while (deer.actor.health > 0 && swings < 40) {
    const q = combat.queueSwing(hunter, deer.actor, { now });
    if (q.queued) swings++;
    for (let i = 0; i < 40 && deer.actor.health > 0; i++) { now += 16; combat.update(1 / 60, now); }
  }
  check('a sword really takes its health off', deer.actor.health <= 0, `${swings} swings, ${deer.actor.health} hp left`);
  check('and the monster layer heard about it and made a body',
    monsters.corpses().length === 1, `${monsters.corpses().length} corpses`);
  const body = monsters.corpsesNear({ x: 200, z: 200 }, 3)[0];
  check('the body answers corpsesNear, which is what skinning.js asks',
    !!body && body.id === 'deer' && body.skinned === false, body ? `${body.name}, skinned ${body.skinned}` : 'nothing');
  check('and it carries the row the knife reads its hide off',
    !!body && (body.row.lootTable || []).includes('hide'), body ? (body.row.lootTable || []).join(', ') : '');
  check('the kill said something, rather than a silent state change',
    said.some((t) => /deer/i.test(t)), said.join(' | ').slice(0, 90));
  check('a corpse is not a target any more', !monsters.actors().includes(deer.actor));
  // The dead list is deliberately NOT written for this one: `spawnAt` is the dev
  // bench's door and marks its spawns `ephemeral`, and an ephemeral body is not
  // a slot in the world's roll, so an entry for it would sit in the save
  // matching nothing. That rule is monsters.js's and is right.
  check('a bench spawn writes no dead list entry, because it was never a slot',
    deadUntil.length === 0, JSON.stringify(deadUntil));
  // What decides whether a REAL critter goes into the dead list is one field on
  // the record, and fauna does not set it, so once the merge in F1.md section 2
  // lands a killed rabbit stays killed for eight to fifteen minutes exactly as a
  // wolf does. That is the field, checked; the eight to fifteen minutes
  // themselves are monsters.js's `respawnDelay` and are tested there.
  const wild = [];
  for (let cx = 0; cx < 200 && !wild.length; cx++) wild.push(...spawnsFor(f, cx, 17));
  check('and a real critter record is not ephemeral, so it will go in',
    wild.length > 0 && wild.every((r) => !r.ephemeral), `${wild.length} records, none ephemeral`);
  monsters.dispose();
}

// ===========================================================================
console.log('\nfauna: a bird, driven through the real stepMonster');
{
  // The flyer path monsters.js already runs for bats and harpies, driven here
  // with a critter actor. `ctx.flying` is what monsters.js passes for a row
  // whose notes carry 'flying'.
  const gull = makeMonsterActor('gull', { pos: { x: 0, y: 0, z: 0 } });
  const ground = () => 0;
  const ctx = { player: null, now: 0, heightAt: ground, rng: () => 0.5, flying: true };

  check('it starts on the ground', gull.pos.y === 0, `${gull.pos.y}`);
  let took = 0, top = 0;
  for (let i = 0; i < 240; i++) {
    ctx.now = i * 16.7;
    const out = stepMonster(gull, 1 / 60, ctx);
    top = Math.max(top, out.altitude);
    if (out.altitude > 0.5 && !took) took = i;
  }
  check('IT TAKES OFF: the altitude climbs off the floor', took > 0 && top > HOVER_MIN * 0.9,
    `airborne by frame ${took}, ${top.toFixed(2)} m at the top`);
  const band = [];
  for (let i = 0; i < 600; i++) {
    ctx.now = 4000 + i * 16.7;
    band.push(stepMonster(gull, 1 / 60, ctx).altitude);
  }
  const lo = Math.min(...band), hi = Math.max(...band);
  check('IT CIRCLES: ten seconds of hovering stays inside the band monster_ai gives it',
    lo >= HOVER_MIN - 0.01 && hi <= HOVER_MAX + 0.01, `${lo.toFixed(2)} to ${hi.toFixed(2)} m, band ${HOVER_MIN} to ${HOVER_MAX}`);
  check('and it moves while it does, rather than hanging on a wire',
    band.some((v, i) => i && Math.abs(v - band[i - 1]) > 1e-4));
  console.log(`       NOTE: that band is HOVER_MIN..HOVER_MAX in src/game/monster_ai.js, which is ${HOVER_MIN} to ${HOVER_MAX} m.`);
  console.log('       The brief asks for 6 to 12 m for a bird. docs/mmo/wiring/F1.md carries the patch.');

  // IT LANDS. `hoverHeight(t, true)` is zero, which is the swoop, and it is the
  // only thing in the existing flyer path that puts a flyer on the floor.
  check('the flyer path has a pose that is on the ground', hoverHeight(0, true) === 0);
  gull.ai.swoopUntil = 20000 + SWOOP_SECONDS * 1000;
  let landed = null;
  for (let i = 0; i < 240 && landed == null; i++) {
    ctx.now = 20000 + i * 16.7;
    const out = stepMonster(gull, 1 / 60, ctx);
    if (out.altitude <= 0.02) landed = i;
  }
  check('IT LANDS: driven to the swoop it comes all the way down to the floor',
    landed != null, landed != null ? `on the ground by frame ${landed}` : `still at ${gull.pos.y.toFixed(2)} m`);
  check('and the body is at ground level when it is down', Math.abs(gull.pos.y - ground()) < 0.03, `${gull.pos.y.toFixed(3)}`);
  // and back up again when the swoop is over
  let up = 0;
  for (let i = 0; i < 300; i++) {
    ctx.now = 24000 + i * 16.7;
    up = stepMonster(gull, 1 / 60, ctx).altitude;
  }
  check('and it goes back up when the swoop is over', up > HOVER_MIN - 0.01, `${up.toFixed(2)} m`);
  console.log('       NOTE: nothing sets swoopUntil for a critter today, because a critter never attacks.');
  console.log('       "lands when idle, takes off when approached" is the second patch in F1.md.');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
