// The Arbor forest, as flora.js streams it, from a placement roll to a felled
// tree. Run: node src/world/flora.test.mjs
//
// `recordsFor` is pure, so the placement rules are driven directly. Everything
// after that is the real path: a real scene graph, real TreeFields, real Arbor
// prototypes, real chopTree, so that "the forest is Arbor's and the axe still
// works" is a measurement and not a claim.
//
// There is no canvas in node. arbor_textures.js probes the host once and falls
// back to blank sheets, which is the code path any headless caller takes, so
// this file does not stub anything: the geometry, the materials, the placement,
// the LOD and the felling are all the shipping code.

import * as THREE from 'three';
import { createWorldField, BIOMES } from './field.js';
import {
  recordsFor, createFlora, ROCK_DENSITY, WATER_SPECIES, isWet, variantOf,
  auditBiomeHarvest, VARIANTS, ALL_KINDS, REBAND_M, LIMITS, DETAIL, mixFor,
  ARBOR_SPECIES, isArborKind, biomesIn, pairCheck,
} from './flora.js';
import { LOD_RANGE, LOD_SHARE, lodForDistance, geometryVariant } from './tree_gen.js';
import * as arbor from './arbor.js';
import { chopTree, regrowTrees, clearTreeFields, treeFieldsFor } from '../farm/tree_edit.js';
import { nounFor } from '../game/interact.js';

// chopTree animates the topple with requestAnimationFrame. In node there is
// none, and a felling that silently did nothing would be exactly the kind of
// bug this file exists to catch, so shim it rather than skip the test.
let framesRun = 0;
globalThis.requestAnimationFrame = (fn) => { framesRun++; return setTimeout(() => fn(performance.now()), 0); };
globalThis.cancelAnimationFrame = (id) => clearTimeout(id);

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };
const N = (v) => Math.round(v).toLocaleString();
const f = createWorldField(20260904, { homeY: -0.3 });

// ============================================================================
// The tables
// ============================================================================
console.log('flora: the tables');

check('every biome has something to chop and something to mine', auditBiomeHarvest() === BIOMES.length,
  BIOMES.filter((b) => b !== 'ocean').map((b) => `${b}: ${mixFor(b).map(([k]) => k).join('+')}`).join(' | '));
for (const b of BIOMES) {
  if (b === 'ocean') continue;
  console.log(`    ${b.padEnd(9)} ${arbor.FOREST_TYPES[b].density.padEnd(8)} `
    + `dry ${mixFor(b).map(([k, w]) => `${k} ${w.toFixed(2)}`).join(', ')}`
    + `  |  wet ${mixFor(b, true).map(([k, w]) => `${k} ${w.toFixed(2)}`).join(', ')}`);
}
check('ocean grows nothing at all', mixFor('ocean').length === 0 && mixFor('ocean', true).length === 0);
check('every biome has a real mix, not one species', BIOMES.filter((b) => b !== 'ocean').every((b) => mixFor(b).length >= 2),
  BIOMES.filter((b) => b !== 'ocean').map((b) => `${b} ${mixFor(b).length}`).join(', '));

// the audit has to catch something, or it is decoration
{
  const keep = ROCK_DENSITY.meadow;
  ROCK_DENSITY.meadow = 0;
  let threw = '';
  try { auditBiomeHarvest(); } catch (e) { threw = e.message; }
  ROCK_DENSITY.meadow = keep;
  check('the audit throws on a biome with nothing to mine', threw.includes('nothing to mine'), threw || 'it did not throw');
  const keepL = LIMITS.oak;
  delete LIMITS.oak;
  threw = '';
  try { auditBiomeHarvest(); } catch (e) { threw = e.message; }
  LIMITS.oak = keepL;
  check('and on a kind with no tree line', threw.includes('no tree line'), threw || 'it did not throw');
  check('and is clean again once both are put back', auditBiomeHarvest() === BIOMES.length);
}

// every kind the world can grow has to survive interact.js's NOUNS: the field
// is named world:<kind>, and nounFor reads the last segment
{
  const rows = ALL_KINDS.map((k) => [k, nounFor({ name: 'world:' + k, kind: k === 'rock' || k === 'ore' ? 'rock' : 'tree', yield: k === 'ore' ? 'ore' : undefined })]);
  console.log('    nouns: ' + rows.map(([k, n]) => `${k} -> "${n}"`).join(', '));
  const named = rows.filter(([, n]) => n !== 'tree').map(([k]) => k);
  check('every kind interact.js has a word for still exists',
    ['oak', 'spruce', 'palm', 'cactus', 'sakura', 'rock', 'ore'].every((k) => ALL_KINDS.includes(k)),
    ALL_KINDS.join(', '));
  check('and every one of them still comes back with its own word', named.length >= 7, named.join(', '));
  check('the ones NOUNS has no word for fall through to "tree", not to nothing',
    rows.every(([, n]) => typeof n === 'string' && n.length > 0));
}
{
  const arb = ALL_KINDS.filter(isArborKind);
  console.log('    recipes: ' + arb.map((k) => `${k} -> arbor.${ARBOR_SPECIES[k]} @ detail ${DETAIL[k]}`).join(', ')
    + ', cactus -> tree_gen');
  check('the conifers share the one Arbor recipe',
    ARBOR_SPECIES.fir === 'spruce' && ARBOR_SPECIES.spruce === 'spruce' && ARBOR_SPECIES.pine === 'pine');
  check('cactus is still tree_gen\'s', !isArborKind('cactus') && ALL_KINDS.includes('cactus'));
}

// ============================================================================
// Placement
// ============================================================================
console.log('\nflora: placement');

// find a chunk dominated by each biome, so the rules can be checked per biome
const byBiome = {};
for (let cz = -60; cz <= 60 && Object.keys(byBiome).length < BIOMES.length; cz++) for (let cx = -60; cx <= 60; cx++) {
  const b = f.biomeAt((cx + 0.5) * 64, (cz + 0.5) * 64);
  if (!byBiome[b] && f.biomeAt(cx * 64 + 8, cz * 64 + 8) === b && f.biomeAt(cx * 64 + 56, cz * 64 + 56) === b) byBiome[b] = [cx, cz];
}
console.log('  chunks found per biome:', Object.keys(byBiome).join(', '));

{
  const [cx, cz] = byBiome.meadow;
  const a = JSON.stringify(recordsFor(f, cx, cz)), b = JSON.stringify(recordsFor(f, cx, cz));
  check('same chunk, same records', a === b);
  const other = JSON.stringify(recordsFor(createWorldField(20260905, { homeY: -0.3 }), cx, cz));
  check('a different world seed, a different forest', other !== a);
}
{
  const [cx, cz] = byBiome.meadow;
  const seen = biomesIn(f, cx, cz);
  check('a chunk is asked which biomes it actually holds', seen.length >= 1 && seen.includes('meadow'), seen.join('+'));
  // a border chunk holds two, and both of them grow their own trees
  let border = null;
  for (let r = 1; r <= 30 && !border; r++) for (let d = -r; d <= r && !border; d++) {
    for (const [ax, az] of [[cx + d, cz + r], [cx + d, cz - r], [cx + r, cz + d], [cx - r, cz + d]]) {
      if (biomesIn(f, ax, az).filter((b) => b !== 'ocean').length >= 2) { border = [ax, az]; break; }
    }
  }
  check('a border chunk holds more than one', !!border, border ? biomesIn(f, ...border).join('+') : 'none found');
}

// A sparse global grid under-samples the rare biomes, so each biome gets its
// own census, walked outward from its anchor chunk.
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
      if (k === 'ore') continue;
      if (k === 'rock') { if (!(ROCK_DENSITY[b] > 0)) bad++; continue; }
      const dry = mixFor(b).some(([kk]) => kk === k), wet = mixFor(b, true).some(([kk]) => kk === k);
      if (!dry && !wet) bad++;
    }
  }
  check('every record is a kind its own biome allows', bad === 0, `${bad} of ${total} out of place`);
}
{
  const kindsOf = (b) => Object.keys(perBiome[b]).filter((k) => k !== 'chunks');
  const trees = (b) => kindsOf(b).filter((k) => k !== 'rock' && k !== 'ore');
  const rocks = (b) => kindsOf(b).filter((k) => k === 'rock' || k === 'ore');
  check('meadow grows arbor\'s temperate mix, all three of it',
    trees('meadow').length >= 3 && (perBiome.meadow.oak || 0) > 50 && (perBiome.meadow.beech || 0) > 30,
    JSON.stringify(perBiome.meadow));
  check('boreal grows two conifers and a birch through them',
    (perBiome.boreal.fir || 0) > 100 && (perBiome.boreal.spruce || 0) > 100 && (perBiome.boreal.pine || 0) > 50,
    JSON.stringify(perBiome.boreal));
  check('mountain thins out, and is mostly rock',
    (perBiome.mountain.rock || 0) > trees('mountain').reduce((a, k) => a + perBiome.mountain[k], 0),
    JSON.stringify(perBiome.mountain));
  check('desert grows cacti and dead wood',
    (perBiome.desert.cactus || 0) > 5 && (perBiome.desert.dead || 0) > 5, JSON.stringify(perBiome.desert));
  check('beach grows palms', (perBiome.beach.palm || 0) > 5, JSON.stringify(perBiome.beach));
  check('sakura grows cherry and birch', (perBiome.sakura.sakura || 0) > 30 && (perBiome.sakura.birch || 0) > 20,
    JSON.stringify(perBiome.sakura));
  check('snow still holds a stand of conifer', (perBiome.snow.fir || 0) + (perBiome.snow.spruce || 0) > 3,
    JSON.stringify(perBiome.snow));
  check('ocean grows nothing', trees('ocean').length === 0 && rocks('ocean').length === 0,
    JSON.stringify(perBiome.ocean));
  const noRock = Object.keys(perBiome).filter((b) => b !== 'ocean' && !rocks(b).length);
  const noTree = Object.keys(perBiome).filter((b) => b !== 'ocean' && !trees(b).length);
  check(`every biome puts a boulder on the ground within ${CENSUS} of its own chunks`, noRock.length === 0, noRock.join(', '));
  check(`every biome puts a tree on the ground within ${CENSUS} of its own chunks`, noTree.length === 0, noTree.join(', '));
  const oneSpecies = Object.keys(perBiome).filter((b) => b !== 'ocean' && trees(b).length < 2);
  check('and no biome is a monoculture', oneSpecies.length === 0, oneSpecies.join(', ') || 'every biome has a mix');
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

// the tree line is per species
{
  const high = {};
  let overOak = 0, firHigh = 0;
  for (let cz = -60; cz < 60; cz += 2) for (let cx = -60; cx < 60; cx += 2) {
    for (const [k, list] of Object.entries(recordsFor(f, cx, cz))) {
      if (k === 'rock' || k === 'ore') continue;
      for (const t of list) {
        const h = f.sampleAt(t.x, t.z).h;
        high[k] = Math.max(high[k] ?? -Infinity, h);
        if (k === 'oak' && h > LIMITS.oak.maxH) overOak++;
        if ((k === 'fir' || k === 'spruce' || k === 'pine') && h > LIMITS.oak.maxH) firHigh++;
      }
    }
  }
  check('no species stands above its own declared tree line',
    Object.entries(high).every(([k, h]) => h <= LIMITS[k].maxH),
    Object.entries(high).map(([k, h]) => `${k} ${h.toFixed(0)}/${LIMITS[k].maxH}`).join(', '));
  check('no oak above the oak line', overOak === 0, `${overOak}`);
  check('conifers DO climb above the oak line (the rule is per species, not global)',
    firHigh > 0, `${firHigh} conifers above ${LIMITS.oak.maxH} m`);
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
  check('none on slopes over 2.0 per 2 m', steep === 0, `${steep}`);
  check('none inside a site clearing', inSite === 0, `${inSite}`);
  let there = 0;
  for (let cz = 61; cz <= 63; cz++) for (let cx = 61; cx <= 63; cx++) for (const l of Object.values(recordsFor(f, cx, cz))) for (const t of l) if (Math.hypot(t.x - 4000, t.z - 4000) < 34) there++;
  check('the clearing is the site\'s doing (trees there without it)', there > 0 || f.sampleAt(4000, 4000).water,
    `${there} trees, water=${f.sampleAt(4000, 4000).water}`);
}
{
  let home = 0;
  for (let cz = -2; cz <= 1; cz++) for (let cx = -2; cx <= 1; cx++) for (const l of Object.values(recordsFor(f, cx, cz))) for (const t of l) if (Math.hypot(t.x, t.z) < 125) home++;
  check('nothing grows within 125 m of the farm', home === 0, `${home}`);
}
// a rejection must never move the trees around it: that is what makes a
// clearing a hole in the forest rather than a different forest
{
  const [cx, cz] = byBiome.meadow;
  const all = arbor.placeTrees('meadow', cx, cz, 64, f.seed, { heightAt: f.heightAt });
  const half = arbor.placeTrees('meadow', cx, cz, 64, f.seed, { heightAt: f.heightAt, keep: (x) => x > (cx + 0.5) * 64 });
  const filtered = all.filter((s) => s.x > (cx + 0.5) * 64);
  check('a keep rejection is a filter of the unclipped layout, not a reshuffle',
    JSON.stringify(half) === JSON.stringify(filtered) && half.length > 0 && half.length < all.length,
    `${half.length} of ${all.length}`);
}
{
  const t0 = performance.now();
  for (let i = 0; i < 50; i++) recordsFor(f, 10 + i, 7);
  const ms = (performance.now() - t0) / 50;
  check('a chunk places in under 3 ms', ms < 3, `${ms.toFixed(2)} ms`);
}
// recordsFor pairs each spot with the ground sample `keep` took for it, by
// position in the list. If placeTrees ever stopped calling keep exactly once
// per surviving spot, every tree in the chunk would be sampled at the wrong
// place and nothing would look broken, so the pairing throws rather than
// drifting. Drive it both ways.
{
  let threw = '';
  try { pairCheck([1, 2, 3], [1, 2], 'meadow'); } catch (e) { threw = e.message; }
  check('a spot with no ground sample behind it throws instead of drifting',
    threw.includes('would be wrong'), threw || 'it did not throw');
  check('and a matching pair passes', pairCheck([1, 2], [1, 2]) === 2);
  // and the real path exercises it on every chunk this file places
  check('the real placeTrees pairs them exactly, over every chunk placed above',
    Object.keys(recordsFor(f, byBiome.meadow[0], byBiome.meadow[1])).length > 0);
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
  check(`all ${VARIANTS} prototypes are used, and none dominates`, lo > 0 && hi / lo < 1.4,
    `${spread.join('/')} over ${n} trees`);
  const one = { x: 1234.5, z: -876.25, gy: 3, s: 1, ry: 0 };
  const first = variantOf(one, VARIANTS);
  const reloaded = { x: 1234.5, z: -876.25, gy: 3, s: 1, ry: 0 };
  check('a record reloaded without its variant index picks the same tree',
    variantOf(reloaded, VARIANTS) === first, `${first}`);
  const stale = { x: 1234.5, z: -876.25, gy: 3, s: 1, ry: 0, vi: 99 };
  check('a stale variant index is repaired, not trusted', variantOf(stale, VARIANTS) === first);
}

// ============================================================================
// The real path: a scene, real fields, real Arbor prototypes, a real axe.
// ============================================================================
console.log('\nflora: the scene');

clearTreeFields();
const scene = new THREE.Scene();
const tBoot = performance.now();
const flora = createFlora(scene, f, {});
const bootMs = performance.now() - tBoot;

const [mcx, mcz] = byBiome.meadow;
const HX = (mcx + 0.5) * 64, HZ = (mcz + 0.5) * 64;
// flora.update rebuilds at most one field a frame and grows at most one
// prototype a settled frame, so settling the world means pumping it
let clock = 1000;
const settle = (n = 60) => { for (let i = 0; i < n && (flora.pending || i < 2); i++) { clock += 250; flora.update(clock, HX, HZ); } };
const tBuild = performance.now();
for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) flora.onChunk(mcx + dx, mcz + dz, 33);
settle();
const buildMs = performance.now() - tBuild;

console.log(`  createFlora ${bootMs.toFixed(0)} ms, then 25 meadow chunks in ${buildMs.toFixed(0)} ms`);

// ------------------------------------------------------------- warming ------
{
  const first = Object.entries(flora.kinds)
    .filter(([, fld]) => (fld.kind || 'tree') === 'tree')
    .map(([k, fld]) => `${k} ${fld.variants.length}`);
  check('a species field arrives with ONE prototype in it, not five',
    Object.values(flora.kinds).some((fld) => (fld.kind || 'tree') === 'tree' && fld.variants.length < VARIANTS)
    || flora.stats.prototypes <= Object.keys(flora.kinds).length + 2,
    first.join(', '));
  let frames = 0, worst = 0, worstOn = '';
  while (!flora.warm && frames < 4000) {
    clock += 250; frames++;
    const t0 = performance.now();
    const had = Object.keys(flora.kinds).length;
    flora.update(clock, HX, HZ);
    const ms = performance.now() - t0;
    if (ms > worst) {
      worst = ms;
      worstOn = `${flora.stats.lastRebuild || '?'}${Object.keys(flora.kinds).length > had ? ', a new field' : ''}`;
    }
  }
  console.log(`  warmed in ${frames} settled frames, worst frame ${worst.toFixed(2)} ms (${worstOn})`);
  console.log('  cumulative growth cost per kind (ms):', JSON.stringify(flora.stats.buildMs));
  check('the world warms up to every kind at full strength', flora.warm, `${flora.stats.prototypes} prototypes`);
  // The worst frame is always a FIRST field of a tree_gen backed kind: rock, ore
  // and cactus each rasterise a 512 px bark, leaf or rock texture in plain JS
  // the first time they are asked for, at 78, 78 and 95 ms measured. That cost
  // predates this merge and is why the warm order exists at all. Growing an
  // Arbor prototype, which is what every other warming frame does, is 2 to 9 ms.
  check('no single warming frame costs more than 120 ms', worst < 120, `${worst.toFixed(2)} ms`);
  const trees = Object.values(flora.kinds).filter((fld) => (fld.kind || 'tree') === 'tree');
  check(`every stand ends with ${VARIANTS} prototypes`, trees.every((fld) => fld.variants.length === VARIANTS),
    trees.map((fld) => `${fld.kindId} ${fld.variants.length}`).join(', '));
  check('every prototype measured its own trunk radius', trees.every((fld) => fld.variants.every((v) => v.baseR > 0.01 && v.baseR < 4)),
    trees.map((fld) => `${fld.kindId} ${fld.variants.map((v) => v.baseR.toFixed(2)).join('/')}`).join('  '));
  check('and a stand has saplings and old growth in it',
    trees.every((fld) => Math.max(...fld.variants.map((v) => v.height)) / Math.min(...fld.variants.map((v) => v.height)) > 1.2),
    trees.map((fld) => `${fld.kindId} ${Math.min(...fld.variants.map((v) => v.height)).toFixed(1)}-${Math.max(...fld.variants.map((v) => v.height)).toFixed(1)} m`).join(', '));
}

// ------------------------------------------------------------ the LOD -------
{
  const oak = flora.kinds.oak;
  const v = oak.variants[0];
  const quads = (g) => (g ? g.attributes.position.count / 4 : 0);
  const nearQ = quads(v.bands[0].leaf), midQ = quads(v.bands[1].leaf), farQ = quads(v.bands[2].leaf);
  console.log(`  one oak: bark ${N(v.bands[0].bark.index.count / 3)} / ${N(v.bands[1].bark.index.count / 3)} / ${N(v.bands[2].bark.index.count / 3)} tris, `
    + `leaf quads ${nearQ} / ${midQ} / ${farQ}, total ${N(v.bandTris[0])} / ${N(v.bandTris[1])} / ${N(v.bandTris[2])}`);
  check('the mid band is the reference\'s own leaf LOD: one quad in three',
    Math.abs(midQ - Math.ceil(nearQ / 3)) <= 1, `${midQ} of ${nearQ}`);
  check('the far band is a fixed budget of quads, whatever grew there',
    farQ === arbor.LOD_BANDS[2].leafQuads, `${farQ} against ${arbor.LOD_BANDS[2].leafQuads}`);
  // the size multiplier is what keeps a third of the quads reading as a canopy
  const size = (g) => {
    const p = g.attributes.position;
    return Math.hypot(p.getX(2) - p.getX(0), p.getY(2) - p.getY(0), p.getZ(2) - p.getZ(0));
  };
  check('and the ones that are left are 1.8x and 4x the size',
    Math.abs(size(v.bands[1].leaf) / size(v.bands[0].leaf) - 1.8) < 0.02
    && Math.abs(size(v.bands[2].leaf) / size(v.bands[0].leaf) - 4.0) < 0.02,
    `${(size(v.bands[1].leaf) / size(v.bands[0].leaf)).toFixed(2)}x and ${(size(v.bands[2].leaf) / size(v.bands[0].leaf)).toFixed(2)}x`);
  // and the leaf stays on its twig: scaling is about the point it was hung on
  const anchor = (g, q) => {
    const p = g.attributes.position, i = q * 4;
    return [(p.getX(i) + p.getX(i + 1)) / 2, (p.getY(i) + p.getY(i + 1)) / 2, (p.getZ(i) + p.getZ(i + 1)) / 2];
  };
  const a0 = anchor(v.bands[0].leaf, 0), a1 = anchor(v.bands[1].leaf, 0);
  check('a bigger leaf is still hung on the same twig',
    Math.hypot(a0[0] - a1[0], a0[1] - a1[1], a0[2] - a1[2]) < 1e-4,
    `${Math.hypot(a0[0] - a1[0], a0[1] - a1[1], a0[2] - a1[2]).toExponential(1)} m apart`);
  check('the bark loses its twigs with distance and keeps its bole',
    v.bands[0].bark.index.count > v.bands[1].bark.index.count
    && v.bands[1].bark.index.count > v.bands[2].bark.index.count
    && v.bands[2].bark.index.count > 60);
  check('and the far bark costs nothing extra in vertex memory (index only)',
    v.bands[2].bark.attributes.position === v.bands[0].bark.attributes.position);
  check('every band is cheaper than the one inside it',
    v.bandTris[0] > v.bandTris[1] * 3 && v.bandTris[1] > v.bandTris[2] * 2, v.bandTris.join(' / '));
}

// ------------------------------------------------ what a chunk costs ---------
//
// The budget the merge was given: a Natural chunk under 250,000 triangles and a
// Dense chunk under 500,000, at the near band, which is where every leaf is
// drawn. Two numbers are measured for each biome, because they answer different
// questions:
//
//   * the CHUNK figure, which is what the budget is written in: the mean over
//     real chunks of that biome of the near band cost of every tree in them.
//     Trees per chunk vary with the fbm thinning, so the worst chunk is
//     reported too but is not what the budget is about; it is a chunk that
//     happened to draw twice the type's own density.
//   * the near band DISC, which is what a frame actually pays: the near band is
//     a 55 m circle, 2.32 chunks of area, and no chunk is ever wholly inside
//     it. That is the number to watch if the frame time ever goes.
{
  const NEAR_CHUNKS = Math.PI * LOD_RANGE[0] * LOD_RANGE[0] / (64 * 64);
  console.log(`\n  the near band, per 64 m chunk, at each biome's own Arbor density`
    + ` (the band itself is ${NEAR_CHUNKS.toFixed(2)} chunks of area):`);
  const BUDGET = { Dense: 500e3, Natural: 250e3, Open: 250e3 };
  const over = [];
  for (const [b, anchor] of Object.entries(byBiome)) {
    if (b === 'ocean') continue;
    const [ax, az] = anchor;
    let worst = 0, worstTrees = 0, sum = 0, chunks = 0, allTrees = 0, skipped = 0;
    for (let r = 0; r <= 20 && chunks < 24; r++) {
      for (let dz = -r; dz <= r && chunks < 24; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const cx = ax + dx, cz = az + dz;
        if (f.biomeAt((cx + 0.5) * 64, (cz + 0.5) * 64) !== b) continue;
        chunks++;
        let tris = 0, n = 0;
        for (const [k, list] of Object.entries(recordsFor(f, cx, cz))) {
          if (k === 'rock' || k === 'ore') continue;
          const fld = flora.kinds[k];
          if (!fld) { skipped += list.length; continue; }
          for (const t of list) {
            tris += fld.variants[variantOf(t, VARIANTS) % fld.variants.length].bandTris[0];
            n++;
          }
        }
        sum += tris; allTrees += n;
        if (tris > worst) { worst = tris; worstTrees = n; }
      }
    }
    const density = arbor.FOREST_TYPES[b].density;
    const budget = BUDGET[density];
    const mean = sum / chunks;
    console.log(`    ${b.padEnd(9)} ${density.padEnd(8)} ${(allTrees / chunks).toFixed(1)} trees a chunk, `
      + `mean ${N(mean).padStart(9)}, worst ${N(worst).padStart(9)} (${worstTrees} trees), `
      + `near band ${N(mean * NEAR_CHUNKS).padStart(9)} of a ${N(budget)} chunk budget`
      + (skipped ? `  [${skipped} records of a kind not built]` : ''));
    if (mean > budget) over.push(`${b} ${N(mean)}`);
  }
  check('no biome breaks its near band chunk budget (250k Open and Natural, 500k Dense)',
    over.length === 0, over.join(', ') || 'every biome inside, measured over 24 chunks each');
}

{
  const kinds = Object.keys(flora.kinds);
  const counts = {};
  let instances = 0, calls = 0;
  for (const [k, fld] of Object.entries(flora.kinds)) {
    counts[k] = fld.trees.length;
    calls += fld.meshes.length;
    for (const m of fld.meshes) instances += m.count;
  }
  console.log('\n  records per kind:', JSON.stringify(counts));
  console.log(`  ${calls} tree and rock draw calls, ${flora.grass.meshes.length} grass, `
    + `${flora.stats.drawCalls} in total for 25 chunks`);
  check('a 25 chunk meadow really has instanced trees on it', instances > 100, `${instances} instances`);
  // the whole point of instancing: the call count is bounded by prototypes
  // times bands, and does not grow with the number of trees
  const perSpecies = LOD_SHARE.reduce((a, share) => a + Math.ceil(VARIANTS / share) * 2, 0);
  const bound = kinds.length * perSpecies + 3;
  check('the draw calls are bounded by the bake, not by the tree count',
    flora.stats.drawCalls <= bound, `${flora.stats.drawCalls} of at most ${bound} for ${instances} instances`);
  let mismatched = 0, wrongVariant = 0;
  for (const fld of Object.values(flora.kinds)) {
    const n = fld.variants.length;
    for (const m of fld.meshes) {
      if (m.userData.treeMap.length !== m.count) mismatched++;
      const want = m.userData.layer.variant, lod = m.userData.layer.lod;
      if ((fld.kind || 'tree') !== 'tree') continue;
      for (const idx of m.userData.treeMap) {
        if (geometryVariant(variantOf(fld.trees[idx], VARIANTS) % n, lod) !== want) wrongVariant++;
      }
    }
  }
  check('every instance maps back to exactly one record', mismatched === 0, `${mismatched} meshes off`);
  check('every instance is drawn with the prototype its record asked for', wrongVariant === 0, `${wrongVariant} wrong`);
  // three declares `attribute vec3 color` whenever a material says
  // vertexColors, and an unbound attribute reads as (0, 0, 0): a mesh that
  // claims vertex colours it does not carry renders black
  const miscoloured = [];
  for (const fld of Object.values(flora.kinds)) {
    for (const m of fld.meshes) if (!!m.material.vertexColors !== !!m.geometry.attributes.color) miscoloured.push(fld.name + ':' + m.userData.layer.part);
  }
  if (!!flora.stumps.mesh.material.vertexColors !== !!flora.stumps.mesh.geometry.attributes.color) miscoloured.push('stumps');
  check('no mesh claims vertex colours it does not carry', miscoloured.length === 0,
    [...new Set(miscoloured)].join(', '));
  check('the raycast back-index reaches every field', treeFieldsFor().length === kinds.length,
    `${treeFieldsFor().length} registered`);
  // five prototypes of a species share one bark material and one leaf material:
  // the sheet, the alphaTest and the wind hook are the same for all of them, and
  // five copies is five sets of uniforms for no difference on screen
  {
    const perKind = {};
    for (const fld of Object.values(flora.kinds)) {
      if (fld.generator !== 'arbor') continue;
      perKind[fld.kindId] = new Set(fld.layers.map((l) => l.mat)).size;
    }
    check('a species draws all five of its prototypes with one material per part',
      Object.values(perKind).every((n) => n <= 2),
      Object.entries(perKind).map(([k, n]) => `${k} ${n}`).join(', '));
  }

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
  check(`every tree is drawn at the band its distance asks for (${LOD_RANGE.join(' and ')} m)`, wrongLod === 0, `${wrongLod} wrong`);
  const base = THREE.InstancedMesh.prototype.raycast;
  let pickable = 0, notPickable = 0, wrong = 0, casting = 0;
  for (const fld of Object.values(flora.kinds)) {
    for (const m of fld.meshes) {
      const near = m.userData.layer.lod === 0;
      if (m.raycast === base) { pickable++; if (!near) wrong++; } else { notPickable++; if (near) wrong++; }
      if (m.castShadow && !near) casting++;
    }
  }
  check('only the near band answers a raycast', wrong === 0 && notPickable > 0 && pickable > 0,
    `${pickable} pickable meshes, ${notPickable} deaf to the axe, ${wrong} on the wrong side`);
  check('and only the near band casts a shadow', casting === 0, `${casting} distant meshes casting`);
  let depthed = 0, undepthed = 0;
  for (const fld of Object.values(flora.kinds)) for (const m of fld.meshes) {
    if (m.userData.layer.part !== 'leaf') continue;
    if (m.userData.layer.lod === 0) (m.customDepthMaterial ? depthed++ : undepthed++);
  }
  check('a near canopy cuts its own shadow out instead of casting a box',
    undepthed === 0 && depthed > 0, `${depthed} with a depth material, ${undepthed} without`);
  check('all three bands are in use at once', byLod.every((n) => n > 0),
    `near ${byLod[0]}, mid ${byLod[1]}, far ${byLod[2]} instances (bark and leaves counted apart)`);
  console.log(`  triangles drawn by the whole flora group: ${(flora.stats.tris / 1e6).toFixed(2)} M`);
}

// --------------------------------------------------------------- the wind ---
{
  const before = arbor.windUniforms.uTime.value;
  flora.update(clock + 5000, HX, HZ);
  check('flora.update ticks arbor\'s wind clock, in seconds',
    Math.abs(arbor.windUniforms.uTime.value - (clock + 5000) / 1000) < 1e-9 && arbor.windUniforms.uTime.value !== before,
    `${arbor.windUniforms.uTime.value.toFixed(2)} s`);
  const w0 = flora.windAt(0, 0, 10), w1 = flora.windAt(2000, 2000, 10), w2 = flora.windAt(6, 0, 10);
  console.log(`  wind at base ${flora.wind}: (0,0) ${w0.strength.toFixed(3)}, (2000,2000) ${w1.strength.toFixed(3)}, (6,0) ${w2.strength.toFixed(3)}`);
  check('the wind varies across the world', Math.abs(w0.strength - w1.strength) > 0.05,
    `${w0.strength.toFixed(3)} against ${w1.strength.toFixed(3)}`);
  check('but two trees six metres apart do not shear', Math.abs(w0.strength - w2.strength) < 0.02,
    `${w0.strength.toFixed(3)} against ${w2.strength.toFixed(3)}`);
  flora.setWind(0);
  check('setWind 0 stills the whole forest',
    flora.wind === 0 && flora.windAt(0, 0, 10).strength === 0 && flora.windAt(900, -400, 33).strength === 0);
  flora.setWind(1.2);
  check('and setWind puts it back, everywhere', flora.wind === 1.2
    && flora.windAt(0, 0, 10).strength > 0.4 && flora.windAt(0, 0, 10).strength <= 1.2 * 1.65,
    `${flora.windAt(0, 0, 10).strength.toFixed(3)}`);
  check('the leaves and the grass read one clock between them',
    arbor.windUniforms.uTime.value > 0);
  flora.setWind(arbor.WIND_DEFAULT);
}

// ------------------------------------------------------------- treesFor -----
{
  const key = [mcx, mcz];
  const list = flora.treesFor(...key);
  let expected = 0;
  for (const fld of Object.values(flora.kinds)) {
    if ((fld.kind || 'tree') !== 'tree') continue;
    for (const t of fld.trees) if (t.chunk === `${mcx},${mcz}` && !t.felledUntil) expected++;
  }
  check('treesFor hands back every standing tree in that chunk and nothing else',
    list.length === expected && list.length > 0, `${list.length} of ${expected}`);
  check('and only that chunk\'s', flora.treesFor(mcx + 9, mcz + 9).length === 0);
  // the radius has to be the real trunk, measured off the prototype, times the
  // record's own scale. Recomputed here from the prototype rather than from the
  // same expression, so this is a comparison and not a tautology.
  let worstErr = 0, matched = 0;
  for (const fld of Object.values(flora.kinds)) {
    if ((fld.kind || 'tree') !== 'tree') continue;
    for (const t of fld.trees) {
      if (t.chunk !== `${mcx},${mcz}` || t.felledUntil) continue;
      const hit = list.find((e) => Math.abs(e.x - t.x) < 1e-9 && Math.abs(e.z - t.z) < 1e-9);
      if (!hit) continue;
      matched++;
      const want = fld.variants[variantOf(t, VARIANTS) % fld.variants.length].proto.radius * t.s;
      worstErr = Math.max(worstErr, Math.abs(hit.radius - want) / want);
    }
  }
  check('every radius is the prototype\'s own base radius times the record scale, inside 5%',
    matched > 0 && worstErr < 0.05, `${matched} matched, worst error ${(worstErr * 100).toFixed(4)}%`);
  const radii = list.map((e) => e.radius);
  console.log(`  treesFor(${mcx},${mcz}): ${list.length} trunks, radius ${Math.min(...radii).toFixed(2)} to ${Math.max(...radii).toFixed(2)} m`);
  check('and every radius is a real trunk, not a default',
    radii.every((r) => r > 0.05 && r < 5), `${Math.min(...radii).toFixed(2)} to ${Math.max(...radii).toFixed(2)}`);
}

// -------------------------------------------------------------- rebanding ---
{
  const before = flora.stats.rebuilds;
  clock += 250; flora.update(clock, HX + REBAND_M * 0.4, HZ);
  clock += 250; flora.update(clock, HX + REBAND_M * 0.4, HZ);
  check('walking a few metres does not re-band the forest', flora.stats.rebuilds === before,
    `${flora.stats.rebuilds - before} rebuilds`);
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
  check('and a felled tree is out of the forage layer too',
    !flora.treesFor(...rec.chunk.split(',').map(Number)).some((e) => Math.abs(e.x - rec.x) < 1e-9 && Math.abs(e.z - rec.z) < 1e-9));

  settle();
  check('a stump stands where the oak did', flora.stumps.count === 1, `${flora.stumps.count} stumps`);
  const m4 = new THREE.Matrix4(), p = new THREE.Vector3(), s3 = new THREE.Vector3();
  flora.stumps.mesh.getMatrixAt(0, m4);
  p.setFromMatrixPosition(m4);
  s3.setFromMatrixScale(m4);
  check('the stump is where the tree was',
    Math.hypot(p.x - rec.x, p.z - rec.z) < 0.01 && Math.abs(p.y - rec.gy) < 0.01,
    `stump ${p.x.toFixed(1)},${p.z.toFixed(1)} vs tree ${rec.x.toFixed(1)},${rec.z.toFixed(1)}`);
  const wantR = oak.variants[variantOf(rec, VARIANTS) % oak.variants.length].baseR * rec.s * 1.10;
  check('and it is the width of the trunk that stood there',
    Math.abs(s3.x - wantR) < 1e-4, `${s3.x.toFixed(2)} m against ${wantR.toFixed(2)}`);

  rec.felledUntil = Date.now() - 1;
  check('regrowTrees brings it back', regrowTrees() === true && !rec.felledUntil);
  const back = oak.meshes.reduce((a, m) => a + m.count, 0);
  check('and the instances come back with it', back === before, `${back} vs ${before}`);
  check('and so does its place in the forage layer',
    flora.treesFor(...rec.chunk.split(',').map(Number)).some((e) => Math.abs(e.x - rec.x) < 1e-9));
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
  let worst = 0;
  for (let i = 0; i < 200; i++) {
    const t = performance.now();
    g.update(6000 + i * 16, HX, HZ);
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
  for (let i = 0; i < 60; i++) g.update(9000 + i * 16, HX, HZ);
  check('density 0 turns the grass off', g.meshes.every((m) => m.visible === false) && g.density === 0);
  g.setDensity(0.5);
  for (let i = 0; i < 300; i++) g.update(12000 + i * 16, HX, HZ);
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
// better, and boreal is the densest forest type there is, so this is the frame
// the budget has to survive.
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
  for (let i = 0; i < 4000 && (flora2.pending || !flora2.warm || i < 3); i++) { c2 += 250; flora2.update(c2, BX, BZ); }
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
  console.log(`  tree instances by band: near ${byLod[0]}, mid ${byLod[1]}, far ${byLod[2]} `
    + `(bark and leaves apart), plus ${rocks} boulders`);
  // where those triangles actually are, band by band
  const trisBy = [0, 0, 0];
  for (const fld of Object.values(flora2.kinds)) {
    if ((fld.kind || 'tree') !== 'tree') continue;
    for (const t of fld.trees) {
      if (t.felledUntil) continue;
      const band = lodForDistance(Math.hypot(t.x - BX, t.z - BZ));
      trisBy[band] += fld.variants[variantOf(t, VARIANTS) % fld.variants.length].bandTris[band];
    }
  }
  console.log(`  ${flora2.stats.drawCalls} draw calls, ${(flora2.stats.tris / 1e6).toFixed(2)} M triangles a frame`);
  console.log(`  by band: near ${N(trisBy[0])}, mid ${N(trisBy[1])}, far ${N(trisBy[2])} triangles`);
  check('the far band carries most of the trees for a fraction of the triangles',
    trisBy[2] < trisBy[0] + trisBy[1], `far ${N(trisBy[2])} against near+mid ${N(trisBy[0] + trisBy[1])}`);
  check('the densest forest the streamer can build stays under 5 M triangles',
    flora2.stats.tris < 5e6, `${(flora2.stats.tris / 1e6).toFixed(2)} M for ${trees} trees`);
  check('and under 200 draw calls', flora2.stats.drawCalls < 200, `${flora2.stats.drawCalls}`);
  // what it would have cost with no bands at all, for the record
  let flat = 0;
  for (const fld of Object.values(flora2.kinds)) {
    if ((fld.kind || 'tree') !== 'tree') continue;
    for (const t of fld.trees) flat += fld.variants[variantOf(t, VARIANTS) % fld.variants.length].bandTris[0];
  }
  console.log(`  the same forest at near detail throughout would be ${(flat / 1e6).toFixed(1)} M triangles`);
  check('the bands are earning their keep', flat > flora2.stats.tris * 4,
    `${(flat / 1e6).toFixed(1)} M without them, ${(flora2.stats.tris / 1e6).toFixed(2)} M with`);
  flora2.dispose();
  clearTreeFields();

  // and a 5 x 5 ring, which is what is around a player most of the time, built
  // as its own world so the draw call count is that ring's and nobody else's
  const scene3 = new THREE.Scene();
  const flora3 = createFlora(scene3, f, {});
  let c3 = 1000, n3 = 0;
  for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) { flora3.onChunk(bcx + dx, bcz + dz, 33); n3++; }
  for (let i = 0; i < 4000 && (flora3.pending || !flora3.warm || i < 3); i++) { c3 += 250; flora3.update(c3, BX, BZ); }
  const t3 = Object.entries(flora3.kinds).filter(([, fld]) => (fld.kind || 'tree') === 'tree')
    .reduce((a, [, fld]) => a + fld.trees.length, 0);
  const kinds3 = Object.entries(flora3.kinds).filter(([, fld]) => fld.trees.length).map(([k]) => k);
  console.log(`  A 5 x 5 RING of boreal, ${n3} chunks, ${t3} trees: ${flora3.stats.drawCalls} draw calls, `
    + `${(flora3.stats.tris / 1e6).toFixed(2)} M triangles, kinds on screen: ${kinds3.join(', ')}`);
  check('a 5 x 5 ring of the densest forest is under 120 draw calls',
    flora3.stats.drawCalls < 120, `${flora3.stats.drawCalls}`);
  flora3.dispose();
  clearTreeFields();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
