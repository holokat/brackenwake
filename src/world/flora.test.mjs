// Flora placement and the whole path from a record to a felled tree.
// Run: node src/world/flora.test.mjs
//
// `recordsFor` is pure, so the placement rules are driven directly. The rest is
// the real path: a real scene graph, real TreeFields, real chopTree, so that
// "grown trees are instanced by flora.js" is a measurement and not a claim.

import * as THREE from 'three';
import { createWorldField, BIOMES } from './field.js';
import {
  recordsFor, createFlora, DENSITY, WATER_SPECIES, isWet, variantOf,
  auditBiomeHarvest, VARIANTS, ALL_KINDS, REBAND_M,
} from './flora.js';
import { SPECIES, LODS, LOD_RANGE, LOD_SHARE, lodForDistance, geometryVariant } from './tree_gen.js';
import { chopTree, regrowTrees, clearTreeFields, treeFieldsFor } from '../farm/tree_edit.js';

// chopTree animates the topple with requestAnimationFrame. In node there is
// none, and a felling that silently did nothing would be exactly the kind of
// bug this file exists to catch, so shim it rather than skip the test.
let framesRun = 0;
globalThis.requestAnimationFrame = (fn) => { framesRun++; return setTimeout(() => fn(performance.now()), 0); };
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };
const f = createWorldField(20260904, { homeY: -0.3 });

check('every biome has something to chop and something to mine', auditBiomeHarvest() === BIOMES.length,
  BIOMES.filter((b) => b !== 'ocean').map((b) => `${b}: ${Object.keys(DENSITY[b]).join('+')}`).join(' | '));

// find a chunk dominated by each biome, so the rules can be checked per biome
const byBiome = {};
for (let cz = -60; cz <= 60 && Object.keys(byBiome).length < BIOMES.length; cz++) for (let cx = -60; cx <= 60; cx++) {
  const b = f.biomeAt((cx + 0.5) * 64, (cz + 0.5) * 64);
  if (!byBiome[b] && f.biomeAt(cx * 64 + 8, cz * 64 + 8) === b && f.biomeAt(cx * 64 + 56, cz * 64 + 56) === b) byBiome[b] = [cx, cz];
}
console.log('  chunks found per biome:', Object.keys(byBiome).join(', '));

// determinism
{
  const [cx, cz] = byBiome.meadow;
  const a = JSON.stringify(recordsFor(f, cx, cz)), b = JSON.stringify(recordsFor(f, cx, cz));
  check('same chunk, same records', a === b);
}

// ------------------------------------------------------------- placement ----
//
// A sparse grid over the whole map under-samples the rare biomes: a global
// every-third-chunk sweep found 22 records of sakura and 3 of snow, which is
// not enough to say anything about either. So each biome gets its own census,
// walked outward from its anchor chunk until CENSUS chunks of it are found.
const CENSUS = 40;
function censusOf(biome, anchor) {
  const [ax, az] = anchor;
  const row = { chunks: 0 };
  for (let r = 0; r <= 24 && row.chunks < CENSUS; r++) {
    for (let dz = -r; dz <= r && row.chunks < CENSUS; dz++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;      // the new ring only
      const cx = ax + dx, cz = az + dz;
      if (f.biomeAt((cx + 0.5) * 64, (cz + 0.5) * 64) !== biome) continue;
      row.chunks++;
      for (const [k, list] of Object.entries(recordsFor(f, cx, cz))) {
        for (const rec of list) if (f.biomeAt(rec.x, rec.z) === biome) row[k] = (row[k] || 0) + 1;
      }
    }
  }
  return row;
}
const perBiome = {};
for (const [b, anchor] of Object.entries(byBiome)) perBiome[b] = censusOf(b, anchor);
for (const [b, row] of Object.entries(perBiome)) {
  console.log(`    ${b.padEnd(9)} ${row.chunks} chunks: `
    + (Object.entries(row).filter(([k]) => k !== 'chunks').map(([k, n]) => `${k} ${n}`).join(', ') || 'nothing'));
}
{
  let bad = 0, total = 0;
  for (let cz = -30; cz < 30; cz += 3) for (let cx = -30; cx < 30; cx += 3) {
    for (const [k, list] of Object.entries(recordsFor(f, cx, cz))) for (const rec of list) {
      total++;
      const b = f.biomeAt(rec.x, rec.z);
      if (k !== 'ore' && (!DENSITY[b] || DENSITY[b][k] == null)) bad++;
    }
  }
  check('every record is a kind its own cell allows', bad === 0, `${bad} of ${total} out of place`);
}
{
  const kindsOf = (b) => Object.keys(perBiome[b]).filter((k) => k !== 'chunks');
  const trees = (b) => kindsOf(b).filter((k) => k !== 'rock' && k !== 'ore');
  const rocks = (b) => kindsOf(b).filter((k) => k === 'rock' || k === 'ore');
  const m = perBiome.mountain;
  check('mountain cells are mostly rock', (m.rock || 0) >= (m.fir || 0) + (m.dead || 0), JSON.stringify(m));
  check('boreal cells are a pine and fir forest',
    (perBiome.boreal.pine || 0) > 100 && (perBiome.boreal.fir || 0) > 100, JSON.stringify(perBiome.boreal));
  check('meadow cells grow oak and birch',
    (perBiome.meadow.oak || 0) > 50 && (perBiome.meadow.birch || 0) > 20, JSON.stringify(perBiome.meadow));
  check('desert cells grow cacti and dead wood',
    (perBiome.desert.cactus || 0) > 10 && (perBiome.desert.dead || 0) > 5, JSON.stringify(perBiome.desert));
  check('beach cells grow palms', (perBiome.beach.palm || 0) > 10, JSON.stringify(perBiome.beach));
  check('sakura cells grow cherry and willow',
    (perBiome.sakura.sakura || 0) > 50 && (perBiome.sakura.willow || 0) > 3, JSON.stringify(perBiome.sakura));
  check('snow cells still hold a stand of fir', (perBiome.snow.fir || 0) > 5, JSON.stringify(perBiome.snow));
  check('ocean cells grow nothing', trees('ocean').length === 0 && rocks('ocean').length === 0,
    JSON.stringify(perBiome.ocean));
  // both directions on the harvest rule: it is not enough that the table says
  // a biome has both, the placement has to actually put both on the ground
  const noRock = Object.keys(perBiome).filter((b) => b !== 'ocean' && !rocks(b).length);
  const noTree = Object.keys(perBiome).filter((b) => b !== 'ocean' && !trees(b).length);
  check(`every biome puts a boulder on the ground within ${CENSUS} of its own chunks`,
    noRock.length === 0, noRock.join(', '));
  check(`every biome puts a tree on the ground within ${CENSUS} of its own chunks`,
    noTree.length === 0, noTree.join(', '));
}

// water species, both directions
{
  let dry = 0, wet = 0;
  for (let cz = -40; cz < 40; cz += 2) for (let cx = -40; cx < 40; cx += 2) {
    for (const [k, list] of Object.entries(recordsFor(f, cx, cz))) {
      if (!WATER_SPECIES.has(k)) continue;
      for (const t of list) (isWet(f.sampleAt(t.x, t.z)) ? wet++ : dry++);
    }
  }
  check('every willow and palm stands on wet ground', dry === 0 && wet > 0, `${wet} wet, ${dry} dry`);
  // and the negative: the dry desert cells grew something else instead, so the
  // rule is doing work rather than being vacuous
  let dryDesertPalms = 0, dryDesertOther = 0;
  for (let cz = -40; cz < 40; cz += 2) for (let cx = -40; cx < 40; cx += 2) {
    for (const [k, list] of Object.entries(recordsFor(f, cx, cz))) for (const t of list) {
      const s = f.sampleAt(t.x, t.z);
      if (s.biome !== 'desert' || isWet(s)) continue;
      if (k === 'palm') dryDesertPalms++; else dryDesertOther++;
    }
  }
  check('a dry desert grows no palms at all, and does grow other things',
    dryDesertPalms === 0 && dryDesertOther > 20, `${dryDesertPalms} palms, ${dryDesertOther} others`);
}

// the tree line is per species: an oak stops well below where a fir does
{
  const high = {};
  let overOak = 0, firHigh = 0;
  for (let cz = -60; cz < 60; cz += 2) for (let cx = -60; cx < 60; cx += 2) {
    for (const [k, list] of Object.entries(recordsFor(f, cx, cz))) {
      if (k === 'rock' || k === 'ore') continue;
      for (const t of list) {
        const h = f.sampleAt(t.x, t.z).h;
        high[k] = Math.max(high[k] ?? -Infinity, h);
        if (k === 'oak' && h > SPECIES.oak.maxH) overOak++;
        if ((k === 'fir' || k === 'pine') && h > SPECIES.oak.maxH) firHigh++;
      }
    }
  }
  check('no species stands above its own declared tree line',
    Object.entries(high).every(([k, h]) => h <= SPECIES[k].maxH),
    Object.entries(high).map(([k, h]) => `${k} ${h.toFixed(0)}/${SPECIES[k].maxH}`).join(', '));
  check('no oak above the oak line', overOak === 0, `${overOak}`);
  check('conifers DO climb above the oak line (the rule is per species, not global)',
    firHigh > 0, `${firHigh} conifers above ${SPECIES.oak.maxH} m`);
}

// nothing stands in water, in a river, on a cliff, or inside a site clearing
{
  let wet = 0, steep = 0, total = 0, inSite = 0;
  const fakeSite = { x: 4000, z: 4000, flatR: 28, kind: 'hamlet' };
  for (let cz = 0; cz < 40; cz++) for (let cx = 0; cx < 40; cx++) {
    const r = recordsFor(f, cx + 50, cz + 50, { sitesNear: () => [fakeSite] });
    for (const list of Object.values(r)) for (const t of list) {
      total++;
      const s = f.sampleAt(t.x, t.z);
      if (s.water || s.river > 0.15) wet++;
      const slope = Math.max(Math.abs(f.heightAt(t.x + 1, t.z) - f.heightAt(t.x - 1, t.z)), Math.abs(f.heightAt(t.x, t.z + 1) - f.heightAt(t.x, t.z - 1)));
      if (slope > 2.0) steep++;
      if (Math.hypot(t.x - fakeSite.x, t.z - fakeSite.z) < 34) inSite++;
    }
  }
  check('records placed over 1600 chunks', total > 2000, `${total}`);
  check('none in water or river', wet === 0, `${wet}`);
  check('none on slopes over 2.0 per 2 m (rocks may sit on steeper ground than trees)', steep === 0, `${steep}`);
  check('none inside a site clearing', inSite === 0, `${inSite}`);
  let there = 0;
  for (let cz = 61; cz <= 63; cz++) for (let cx = 61; cx <= 63; cx++) for (const l of Object.values(recordsFor(f, cx, cz))) for (const t of l) if (Math.hypot(t.x - 4000, t.z - 4000) < 34) there++;
  check('the clearing is the site\'s doing (trees there without it)', there > 0 || f.sampleAt(4000, 4000).water, `${there} trees, water=${f.sampleAt(4000, 4000).water}`);
}
{
  let home = 0;
  for (let cz = -2; cz <= 1; cz++) for (let cx = -2; cx <= 1; cx++) for (const l of Object.values(recordsFor(f, cx, cz))) for (const t of l) if (Math.hypot(t.x, t.z) < 125) home++;
  check('nothing grows within 125 m of the farm', home === 0, `${home}`);
}
{
  const t0 = performance.now();
  for (let i = 0; i < 50; i++) recordsFor(f, 10 + i, 7);
  const ms = (performance.now() - t0) / 50;
  check('a chunk places in under 3 ms', ms < 3, `${ms.toFixed(2)} ms`);
}

// -------------------------------------------------------- variant choice ----
{
  const spread = new Array(VARIANTS).fill(0);
  let n = 0;
  for (let cz = -20; cz < 20; cz++) for (let cx = -20; cx < 20; cx++) {
    for (const [k, list] of Object.entries(recordsFor(f, cx, cz))) {
      if (k === 'rock' || k === 'ore') continue;
      for (const t of list) { spread[variantOf(t, VARIANTS)]++; n++; }
    }
  }
  const lo = Math.min(...spread), hi = Math.max(...spread);
  check('all six variants are used, and none dominates', lo > 0 && hi / lo < 1.4,
    `${spread.join('/')} over ${n} trees`);
  // the variant survives a round trip through the tree editor's dump format,
  // which only writes x, z, gy, s, ry and alt
  const one = { x: 1234.5, z: -876.25, gy: 3, s: 1, ry: 0 };
  const first = variantOf(one, VARIANTS);
  const reloaded = { x: 1234.5, z: -876.25, gy: 3, s: 1, ry: 0 };
  check('a record reloaded without its variant index picks the same tree',
    variantOf(reloaded, VARIANTS) === first, `${first}`);
  const stale = { x: 1234.5, z: -876.25, gy: 3, s: 1, ry: 0, vi: 99 };
  check('a stale variant index is repaired, not trusted', variantOf(stale, VARIANTS) === first);
}

// ============================================================================
// The real path: a scene, real fields, real meshes, a real axe.
// ============================================================================

clearTreeFields();
const scene = new THREE.Scene();
const tBoot = performance.now();
const flora = createFlora(scene, f, {});
const bootMs = performance.now() - tBoot;

const [mcx, mcz] = byBiome.meadow;
const HX = (mcx + 0.5) * 64, HZ = (mcz + 0.5) * 64;
// flora.update rebuilds at most one field a frame, on a REBUILD_MS clock, so
// settling the world means pumping it, not calling it once
let clock = 1000;
const settle = (n = 60) => { for (let i = 0; i < n && (flora.pending || i < 2); i++) { clock += 250; flora.update(clock, HX, HZ); } };
const tBuild = performance.now();
for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) flora.onChunk(mcx + dx, mcz + dz, 33);
settle();
const buildMs = performance.now() - tBuild;

console.log(`\n  createFlora ${bootMs.toFixed(0)} ms, then 25 meadow chunks in ${buildMs.toFixed(0)} ms`);
console.log('  per species first build (ms):', JSON.stringify(flora.stats.buildMs));

{
  const kinds = Object.keys(flora.kinds);
  check('only the species this region needs were built', kinds.length > 0 && kinds.length < ALL_KINDS.length,
    kinds.join(', '));
  const counts = {};
  let instances = 0, calls = 0;
  for (const [k, fld] of Object.entries(flora.kinds)) {
    counts[k] = fld.trees.length;
    calls += fld.meshes.length;
    for (const m of fld.meshes) instances += m.count;
  }
  console.log('  records per kind:', JSON.stringify(counts));
  console.log(`  ${calls} tree and rock draw calls, ${flora.grass.meshes.length} grass, `
    + `${flora.stats.drawCalls} in total for 25 chunks`);
  check('a 25 chunk meadow really has instanced trees on it', instances > 100, `${instances} instances`);
  // the whole point of instancing: the call count is bounded by species times
  // variants times tiers, and does not grow with the number of trees
  const perSpecies = LOD_SHARE.reduce((a, share) => a + Math.ceil(VARIANTS / share) * 2, 0);
  const bound = Object.keys(flora.kinds).length * perSpecies + 3;
  check('the draw calls are bounded by the bake, not by the tree count',
    flora.stats.drawCalls <= bound, `${flora.stats.drawCalls} of at most ${bound} for ${instances} instances`);
  // the layer/record contract: every instanced mesh maps every instance back
  // to a record, or the axe hits the wrong tree
  let mismatched = 0, wrongVariant = 0;
  for (const fld of Object.values(flora.kinds)) {
    const n = fld.variants.length;
    for (const m of fld.meshes) {
      if (m.userData.treeMap.length !== m.count) mismatched++;
      const want = m.userData.layer.variant, lod = m.userData.layer.lod;
      for (const idx of m.userData.treeMap) {
        if (geometryVariant(variantOf(fld.trees[idx], n), lod) !== want) wrongVariant++;
      }
    }
  }
  check('every instance maps back to exactly one record', mismatched === 0, `${mismatched} meshes off`);
  // three declares `attribute vec3 color` whenever a material says
  // vertexColors, and an unbound attribute reads as (0, 0, 0): a mesh that
  // claims vertex colours it does not carry renders black
  const miscoloured = [];
  for (const fld of Object.values(flora.kinds)) {
    for (const m of fld.meshes) if (!!m.material.vertexColors !== !!m.geometry.attributes.color) miscoloured.push(fld.name);
  }
  if (!!flora.stumps.mesh.material.vertexColors !== !!flora.stumps.mesh.geometry.attributes.color) miscoloured.push('stumps');
  check('no mesh claims vertex colours it does not carry', miscoloured.length === 0,
    [...new Set(miscoloured)].join(', '));
  check('every instance is drawn with the variant its record asked for', wrongVariant === 0, `${wrongVariant} wrong`);
  check('the raycast back-index reaches every field', treeFieldsFor().length === Object.keys(flora.kinds).length,
    `${treeFieldsFor().length} registered`);

  // the detail tier a record is drawn at has to be the one its distance asks
  // for, or the LOD is decoration
  const byLod = [0, 0, 0];
  let wrongLod = 0;
  for (const fld of Object.values(flora.kinds)) {
    if ((fld.kind || 'tree') !== 'tree') continue;
    for (const m of fld.meshes) {
      const lod = m.userData.layer.lod;
      byLod[lod] += m.count;
      for (const idx of m.userData.treeMap) {
        const t = fld.trees[idx];
        if (lodForDistance(Math.hypot(t.x - HX, t.z - HZ)) !== lod) wrongLod++;
      }
    }
  }
  check('every tree is drawn at the tier its distance asks for', wrongLod === 0, `${wrongLod} wrong`);
  // the axe reaches six metres, so only the near tier belongs in a pick
  const base = THREE.InstancedMesh.prototype.raycast;
  let pickable = 0, notPickable = 0, wrong = 0;
  for (const fld of Object.values(flora.kinds)) {
    for (const m of fld.meshes) {
      const near = m.userData.layer.lod === 0;
      if (m.raycast === base) { pickable++; if (!near) wrong++; } else { notPickable++; if (near) wrong++; }
    }
  }
  check('only the near tier answers a raycast', wrong === 0 && notPickable > 0 && pickable > 0,
    `${pickable} pickable meshes, ${notPickable} deaf to the axe, ${wrong} on the wrong side`);
  check('all three tiers are in use at once', byLod.every((n) => n > 0),
    `near ${byLod[0]}, mid ${byLod[1]}, far ${byLod[2]} instances (bark and leaves counted apart)`);
  check('the far tier carries most of the forest', byLod[2] > byLod[0],
    `${byLod[2]} far vs ${byLod[0]} near`);
  console.log(`  triangles drawn by the whole flora group: ${(flora.stats.tris / 1e6).toFixed(2)} M`);
  check('the whole forest fits in a couple of million triangles', flora.stats.tris < 3e6,
    `${(flora.stats.tris / 1e6).toFixed(2)} M`);
}

// -------------------------------------------------------------- rebanding ---
{
  const before = flora.stats.rebuilds;
  // a step shorter than REBAND_M must not cost a rebuild
  clock += 250; flora.update(clock, HX + REBAND_M * 0.4, HZ);
  clock += 250; flora.update(clock, HX + REBAND_M * 0.4, HZ);
  check('walking a few metres does not re-band the forest', flora.stats.rebuilds === before,
    `${flora.stats.rebuilds - before} rebuilds`);
  // a step past it must
  clock += 250; flora.update(clock, HX + REBAND_M * 2, HZ);
  check('walking past the re-band distance does', flora.pending > 0 || flora.stats.rebuilds > before,
    `${flora.pending} fields queued`);
  let worst = 0;
  for (let i = 0; i < 40 && flora.pending; i++) {
    clock += 250;
    const t = performance.now();
    flora.update(clock, HX + REBAND_M * 2, HZ);
    worst = Math.max(worst, performance.now() - t);
  }
  console.log(`  worst re-band frame ${worst.toFixed(2)} ms `
    + `(one field, ${flora.stats.lastRebuild}, took ${flora.stats.lastRebuildMs} ms)`);
  check('no single re-band frame costs more than 12 ms', worst < 12, `${worst.toFixed(2)} ms`);
  // put the player back where the rest of the file expects them
  for (let i = 0; i < 40; i++) { clock += 250; flora.update(clock, HX, HZ); }
}

// ------------------------------------------------------------- the axe ------
{
  const oak = flora.kinds.oak;
  check('the meadow gave us an oak field to swing at', !!oak && oak.trees.length > 0, `${oak?.trees.length} oaks`);
  const before = oak.meshes.reduce((a, m) => a + m.count, 0);
  const idx = oak.trees.findIndex((t) => !t.felledUntil);
  const rec = oak.trees[idx];
  const one = chopTree(oak, idx);
  const two = chopTree(oak, idx);
  const three = chopTree(oak, idx);
  check('an oak takes three swings, and the first two only shake it',
    one?.hit === true && two?.hit === true && three?.felled === true,
    `${JSON.stringify(one)} ${JSON.stringify(two)} ${JSON.stringify(three)}`);
  check('felling it yields wood', three.wood >= 2 && three.wood <= 4, `${three.wood}`);
  check('the record is marked as felled, not deleted', rec.felledUntil > Date.now() && oak.trees.includes(rec));
  const after = oak.meshes.reduce((a, m) => a + m.count, 0);
  check('the field rebuilt without it', after === before - 2, `${before} instances before, ${after} after`);
  check('the topple actually started animating', framesRun > 0, `${framesRun} frames requested`);
  check('a fourth swing at a felled tree does nothing', chopTree(oak, idx) === null);

  // the stump: a felled tree that leaves bare ground reads as a broken button
  settle();
  check('a stump stands where the oak did', flora.stumps.count === 1, `${flora.stumps.count} stumps`);
  const m4 = new THREE.Matrix4(), p = new THREE.Vector3();
  flora.stumps.mesh.getMatrixAt(0, m4);
  p.setFromMatrixPosition(m4);
  check('the stump is where the tree was',
    Math.hypot(p.x - rec.x, p.z - rec.z) < 0.01 && Math.abs(p.y - rec.gy) < 0.01,
    `stump ${p.x.toFixed(1)},${p.z.toFixed(1)} vs tree ${rec.x.toFixed(1)},${rec.z.toFixed(1)}`);

  rec.felledUntil = Date.now() - 1;
  check('regrowTrees brings it back', regrowTrees() === true && !rec.felledUntil);
  const back = oak.meshes.reduce((a, m) => a + m.count, 0);
  check('and the instances come back with it', back === before, `${back} vs ${before}`);
  settle();
  check('the stump goes when the tree returns', flora.stumps.count === 0, `${flora.stumps.count}`);
}

// ----------------------------------------------------------- the pickaxe ----
{
  const rock = flora.kinds.rock;
  check('the meadow gave us boulders to break', !!rock && rock.trees.length > 0, `${rock?.trees.length} boulders`);
  const idx = rock.trees.findIndex((t) => !t.felledUntil);
  let last = null;
  for (let i = 0; i < 4; i++) last = chopTree(rock, idx);
  check('a boulder takes four swings and gives stone', last?.felled === true && last.stone >= 2 && last.stone <= 4,
    JSON.stringify(last));
  settle();
  check('a broken boulder leaves no stump', flora.stumps.count === 0, `${flora.stumps.count}`);
}

// -------------------------------------------------------- streaming out -----
{
  const before = Object.values(flora.kinds).reduce((a, fld) => a + fld.trees.length, 0);
  for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) flora.offChunk(mcx + dx, mcz + dz);
  settle();
  const left = Object.values(flora.kinds).reduce((a, fld) => a + fld.trees.length, 0);
  check('unloading the chunks takes every record with it', left === 0, `${before} in, ${left} left`);
  for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) flora.onChunk(mcx + dx, mcz + dz, 33);
  const again = Object.values(flora.kinds).reduce((a, fld) => a + fld.trees.length, 0);
  check('walking back gives the same forest', again === before, `${before} then ${again}`);
}

// -------------------------------------------------------------- the grass ---
{
  const g = flora.grass;
  const cx = HX, cz = HZ;
  let worst = 0;
  for (let i = 0; i < 200; i++) {
    const t = performance.now();
    g.update(6000 + i * 16, cx, cz);
    worst = Math.max(worst, performance.now() - t);
  }
  console.log(`  grass: ${g.stats.tiles} tiles live, worst frame ${worst.toFixed(2)} ms, `
    + `last tile fill ${g.stats.lastFillMs.toFixed(2)} ms`);
  check('the grass ring fills up', g.stats.tiles > 40, `${g.stats.tiles} tiles`);
  check('no frame of grass work costs more than 4 ms', worst < 4, `${worst.toFixed(2)} ms`);
  const m4 = new THREE.Matrix4(), s = new THREE.Vector3();
  const liveCount = () => {
    let n = 0;
    for (const mesh of g.meshes) for (let i = 0; i < mesh.count; i++) { mesh.getMatrixAt(i, m4); s.setFromMatrixScale(m4); if (s.y > 0) n++; }
    return n;
  };
  const live = liveCount();
  console.log(`  ${live} live blade and cover instances around the player`);
  check('there are thousands of blades standing', live > 3000, `${live}`);
  check('grass is two draw calls, whatever the blade count', g.meshes.length === 2);

  g.setDensity(0);
  for (let i = 0; i < 60; i++) g.update(9000 + i * 16, cx, cz);
  check('density 0 turns the grass off', g.meshes.every((m) => m.visible === false) && g.density === 0);
  g.setDensity(0.5);
  for (let i = 0; i < 300; i++) g.update(12000 + i * 16, cx, cz);
  const half = liveCount();
  check('density 0.5 puts back about half the blades', half > live * 0.3 && half < live * 0.75,
    `${half} at half density vs ${live} at full`);
  g.setDensity(1);
}

flora.dispose();
clearTreeFields();
check('dispose leaves nothing in the scene', scene.children.length === 0, `${scene.children.length} left`);

// ============================================================================
// The worst case the streamer can actually produce: a boreal forest with the
// whole tree ring loaded. chunks.js meshes 13 by 13 chunks at TREE_TIER or
// better, and boreal is the densest table there is, so this is the frame the
// budget has to survive.
// ============================================================================
{
  const scene2 = new THREE.Scene();
  const flora2 = createFlora(scene2, f, {});
  const [bcx, bcz] = byBiome.boreal;
  const BX = (bcx + 0.5) * 64, BZ = (bcz + 0.5) * 64;
  let c2 = 1000, chunks = 0;
  for (let dz = -6; dz <= 6; dz++) for (let dx = -6; dx <= 6; dx++) {
    flora2.onChunk(bcx + dx, bcz + dz, Math.max(Math.abs(dx), Math.abs(dz)) <= 3 ? 33 : 17);
    chunks++;
  }
  for (let i = 0; i < 200 && (flora2.pending || i < 3); i++) { c2 += 250; flora2.update(c2, BX, BZ); }
  const trees = Object.entries(flora2.kinds)
    .filter(([, fld]) => (fld.kind || 'tree') === 'tree')
    .reduce((a, [, fld]) => a + fld.trees.length, 0);
  const byLod = [0, 0, 0];
  let rocks = 0;
  for (const fld of Object.values(flora2.kinds)) {
    for (const m of fld.meshes) {
      if ((fld.kind || 'tree') === 'rock') rocks += m.count; else byLod[m.userData.layer.lod] += m.count;
    }
  }
  console.log(`\n  WORST CASE  ${chunks} chunks of boreal forest, ${trees} standing trees`);
  console.log(`  species built: ${Object.keys(flora2.kinds).join(', ')}`);
  console.log(`  tree instances by tier: near ${byLod[0]}, mid ${byLod[1]}, far ${byLod[2]} `
    + `(bark and leaves apart), plus ${rocks} boulders`);
  console.log(`  ${flora2.stats.drawCalls} draw calls, ${(flora2.stats.tris / 1e6).toFixed(2)} M triangles a frame`);
  check('the densest forest the streamer can build stays under 4 M triangles',
    flora2.stats.tris < 4e6, `${(flora2.stats.tris / 1e6).toFixed(2)} M for ${trees} trees`);
  check('and under 140 draw calls', flora2.stats.drawCalls < 140, `${flora2.stats.drawCalls}`);
  // what it would have cost with no tiers at all, for the record
  let flat = 0;
  for (const fld of Object.values(flora2.kinds)) {
    if ((fld.kind || 'tree') !== 'tree') continue;
    const near = fld.variants[0].lods[0];
    flat += fld.trees.length * (near.tris.bark + near.tris.leaf);
  }
  console.log(`  the same forest at full detail throughout would be ${(flat / 1e6).toFixed(1)} M triangles`);
  check('the tiers are earning their keep', flat > flora2.stats.tris * 4,
    `${(flat / 1e6).toFixed(1)} M without them, ${(flora2.stats.tris / 1e6).toFixed(2)} M with`);
  flora2.dispose();
  clearTreeFields();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
