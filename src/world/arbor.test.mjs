// The Arbor forest generator, measured. Run: node src/world/arbor.test.mjs
//
// Nothing here is asserted on the strength of having been written. Every tree
// is grown, its triangles counted, its height measured off the vertices rather
// than off the parameter that asked for it, and every array swept for NaN. The
// gates are driven both ways: the height thinning is shown to keep trees low
// down AND to clear them high up, the audit is shown to pass on the real tables
// AND to throw on a broken one, `dead` is shown to have no leaves while every
// other species has some.
//
// It runs in node because arbor_textures.js takes an injectable canvas factory.
// The geometry, the materials and the placement are the real code paths; only
// the pixels are stubbed.

import * as THREE from 'three';
import { setCanvasFactory, stubCanvasFactory, makeBark, makeLeafTex, LEAF_KINDS, textureStats } from './arbor_textures.js';
import * as A from './arbor.js';

setCanvasFactory(stubCanvasFactory);

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };
const num = (v, w = 6) => String(v).padStart(w);

const arraysOf = (geo) => Object.values(geo.attributes).map((a) => a.array).concat(geo.index ? [geo.index.array] : []);
function anyNaN(geo) {
  for (const arr of arraysOf(geo)) for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i])) return true;
  return false;
}
const bytesOf = (geo) => arraysOf(geo).reduce((a, arr) => a + arr.byteLength, 0);
function extent(geo, axis) {
  const a = geo.attributes.position?.array;
  if (!a || !a.length) return null;
  let lo = Infinity, hi = -Infinity;
  for (let i = axis; i < a.length; i += 3) { if (a[i] < lo) lo = a[i]; if (a[i] > hi) hi = a[i]; }
  return [lo, hi];
}

// ---------------------------------------------------------------------------
console.log('arbor: the tables');
check('audit passes on the shipped tables', A.auditForestTypes() === true);
check('every game biome has a forest type', A.GAME_BIOMES.every((b) => A.FOREST_TYPES[b]), A.GAME_BIOMES.join(' '));
check('the reference five are still here',
  ['Temperate broadleaf', 'Boreal conifer', 'Tropical wet', 'Birch grove', 'Mediterranean pine'].every((k) => A.FOREST_TYPES[k]));
check('the reference seven species are still here',
  ['oak', 'beech', 'birch', 'spruce', 'pine', 'kapok', 'fig'].every((k) => A.SPECIES[k]));
check('the four new species are here', ['willow', 'palm', 'sakura', 'dead'].every((k) => A.SPECIES[k]));
check('oak still has the reference numbers',
  A.SPECIES.oak.h[0] === 13 && A.SPECIES.oak.h[1] === 20 && A.SPECIES.oak.trunk === 0.055 && A.SPECIES.oak.spread === 52);
check('spruce still has the reference numbers',
  A.SPECIES.spruce.levels === 3 && A.SPECIES.spruce.lat === 6 && A.SPECIES.spruce.habit === 'conical');
// and the other direction: the audit has to actually catch something
{
  const keep = A.FOREST_TYPES.meadow.mix;
  A.FOREST_TYPES.meadow.mix = [['nosuchtree', 1.0]];
  let threw = '';
  try { A.auditForestTypes(); } catch (e) { threw = e.message; }
  A.FOREST_TYPES.meadow.mix = keep;
  check('audit throws on a species that does not exist', threw.includes('nosuchtree'), threw || 'it did not throw');
}
{
  const keep = A.FOREST_TYPES.snow.mix;
  A.FOREST_TYPES.snow.mix = [['spruce', 0.4]];
  let threw = '';
  try { A.auditForestTypes(); } catch (e) { threw = e.message; }
  A.FOREST_TYPES.snow.mix = keep;
  check('audit throws on a mix that does not sum to 1', threw.includes('sums to'), threw || 'it did not throw');
}
{
  const keep = A.SPECIES.oak.leaf;
  A.SPECIES.oak.leaf = 'holly';
  let threw = '';
  try { A.auditForestTypes(); } catch (e) { threw = e.message; }
  A.SPECIES.oak.leaf = keep;
  check('audit throws on a leaf kind with no recipe', threw.includes('holly'), threw || 'it did not throw');
}
check('audit is clean again after the three breaks', A.auditForestTypes() === true);

// ---------------------------------------------------------------------------
console.log('\narbor: every species grows, at maturity 0.75 (the studio default)');
const built = {};
let worst = 0, totalTris = 0, totalBytes = 0;
for (const id of A.SPECIES_IDS) {
  const p = A.buildPrototype(id, 1, {});
  built[id] = p;
  const barkT = p.bark.index.count / 3, leafT = p.leaf.index ? p.leaf.index.count / 3 : 0;
  const kb = (bytesOf(p.bark) + bytesOf(p.leaf)) / 1024;
  totalTris += p.triangles; totalBytes += bytesOf(p.bark) + bytesOf(p.leaf);
  if (p.triangles > worst) worst = p.triangles;
  console.log(`       ${id.padEnd(7)} ${num(Math.round(p.triangles))} tris (bark ${num(barkT)}, leaf ${num(leafT)})  ${kb.toFixed(0).padStart(4)} KB  top ${p.height.toFixed(1).padStart(5)} m  crown r ${p.crownRadius.toFixed(1)} m  ${p.axes} axes`);
}
check('every species is under 40,000 triangles at maturity 0.75', worst < 40000, `worst is ${Math.round(worst)}`);
check('no species is empty', Object.values(built).every((p) => p.bark.index.count > 0));
check('no NaN in any bark geometry', Object.values(built).every((p) => !anyNaN(p.bark)));
check('no NaN in any leaf geometry', Object.values(built).every((p) => !anyNaN(p.leaf)));
check('no NaN in any measured number', Object.values(built).every((p) =>
  Number.isFinite(p.height) && Number.isFinite(p.radius) && Number.isFinite(p.crownRadius) && Number.isFinite(p.grownHeight)));
console.log(`       eleven species together: ${Math.round(totalTris)} tris, ${(totalBytes / 1024 / 1024).toFixed(2)} MB of vertex data`);

// ---------------------------------------------------------------------------
console.log('\narbor: heights land inside the species range');
for (const [id, sp] of Object.entries(A.SPECIES)) {
  let lo = Infinity, hi = -Infinity, bad = 0;
  for (const hs of [1.0, 1.4]) {
    for (let s = 1; s <= 12; s++) {
      const p = A.buildPrototype(id, s * 977, { heightScale: hs, maturity: 1 });
      const min = sp.h[0] * hs, max = sp.h[1] * hs;
      if (p.grownHeight < min - 1e-6 || p.grownHeight > max + 1e-6) bad++;
      if (hs === 1) { lo = Math.min(lo, p.grownHeight); hi = Math.max(hi, p.grownHeight); }
    }
  }
  check(`${id} grows inside [${sp.h[0]}, ${sp.h[1]}] x heightScale`, bad === 0,
    `24 trees, seen ${lo.toFixed(1)} to ${hi.toFixed(1)} m at scale 1`);
}
// maturity is the other half of the height formula, and it has to bite
{
  const young = A.buildPrototype('oak', 4242, { maturity: 0 });
  const old = A.buildPrototype('oak', 4242, { maturity: 1 });
  check('maturity 0 is half the height of maturity 1', Math.abs(young.grownHeight / old.grownHeight - 0.5) < 1e-9,
    `${young.grownHeight.toFixed(2)} m vs ${old.grownHeight.toFixed(2)} m`);
  check('a sapling is cheaper than an old tree', young.triangles < old.triangles,
    `${Math.round(young.triangles)} vs ${Math.round(old.triangles)} tris`);
}
// the mesh has to actually reach the height the parameters claim, or the number
// is decoration. palm was the case that caught this: with levels 1 there is no
// chain of apical continuations, so the bole had to be lengthened by hand.
{
  const short = [];
  for (const [id, p] of Object.entries(built)) if (p.height < p.grownHeight * 0.6) short.push(`${id} ${p.height.toFixed(1)}/${p.grownHeight.toFixed(1)}`);
  check('every species reaches 60% of its nominal height in real vertices', short.length === 0, short.join(', ') || 'all of them do');
}

// ---------------------------------------------------------------------------
console.log('\narbor: seeds');
{
  let differ = 0;
  for (const id of A.SPECIES_IDS) {
    const a = A.buildPrototype(id, 1, {}), b = A.buildPrototype(id, 2, {});
    const pa = a.bark.attributes.position.array, pb = b.bark.attributes.position.array;
    if (pa.length !== pb.length || !Buffer.from(pa.buffer, pa.byteOffset, pa.byteLength).equals(Buffer.from(pb.buffer, pb.byteOffset, pb.byteLength))) differ++;
  }
  check('all 11 species differ between seed 1 and seed 2', differ === A.SPECIES_IDS.length, `${differ} of ${A.SPECIES_IDS.length}`);
}
{
  let same = 0, checked = 0;
  for (const id of A.SPECIES_IDS) {
    const a = A.buildPrototype(id, 7, {}), b = A.buildPrototype(id, 7, {});
    let ok = true;
    for (const g of ['bark', 'leaf']) {
      const A1 = arraysOf(a[g]), B1 = arraysOf(b[g]);
      if (A1.length !== B1.length) { ok = false; break; }
      for (let i = 0; i < A1.length; i++) {
        const x = A1[i], y = B1[i];
        if (x.byteLength !== y.byteLength || !Buffer.from(x.buffer, x.byteOffset, x.byteLength).equals(Buffer.from(y.buffer, y.byteOffset, y.byteLength))) { ok = false; break; }
      }
      if (!ok) break;
    }
    checked++; if (ok) same++;
  }
  check('one seed rebuilds byte for byte, every attribute and index', same === checked, `${same} of ${checked} species`);
}
{
  const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
  const base = [...A.buildPrototype('oak', 7, {}).bark.attributes.position.array];
  const moved = {};
  for (const [k, v] of Object.entries({ gnarl: 0.9, crownSpread: 80, trunkRadius: 1.8, heightScale: 1.5, maturity: 1 })) {
    moved[k] = !same(base, [...A.buildPrototype('oak', 7, { [k]: v }).bark.attributes.position.array]);
  }
  check('every architecture option changes the tree', Object.values(moved).every(Boolean), JSON.stringify(moved));
  check('an option the tree does not use leaves it alone',
    same(base, [...A.buildPrototype('oak', 7, { autumn: 1 }).bark.attributes.position.array]),
    'autumn recolours the leaves and must not move the bark');
}

// ---------------------------------------------------------------------------
console.log('\narbor: what the four new species are for');
check('dead has no leaves', built.dead.hasLeaves === false && built.dead.leaf.attributes.position.count === 0);
check('every other species has leaves', Object.entries(built).every(([id, p]) => id === 'dead' || p.hasLeaves));
check('dead is grey bark', A.SPECIES.dead.bark === '#8d8880' && A.SPECIES.dead.leaf === null);
{
  // droop, measured: the willow's lowest foliage hangs below the foot of the
  // tree, the oak's sits a fifth of the way up
  const wf = extent(built.willow.leaf, 1), of = extent(built.oak.leaf, 1);
  check('willow foliage hangs lower than oak foliage, relative to height',
    wf[0] / built.willow.height < of[0] / built.oak.height - 0.1,
    `willow ${(wf[0] / built.willow.height).toFixed(2)} of its height, oak ${(of[0] / built.oak.height).toFixed(2)}`);
  check('willow foliage reaches the ground', wf[0] < 0.5, `lowest leaf at y ${wf[0].toFixed(2)} m`);
}
{
  const p = built.palm;
  check('palm is one bole and a crown', p.axes <= 12, `${p.axes} axes (trunk, tip and ${A.SPECIES.palm.lat} fronds)`);
  const lf = extent(p.leaf, 1);
  check('every palm frond is in the top half of the tree', lf[0] > p.height * 0.35,
    `lowest frond at ${lf[0].toFixed(1)} m of ${p.height.toFixed(1)} m`);
  check('palm is the cheapest tree here', p.triangles === Math.min(...Object.values(built).map((q) => q.triangles)),
    `${Math.round(p.triangles)} tris`);
}
{
  check('sakura wears blossom', A.SPECIES.sakura.leaf === 'blossom');
  check('sakura spreads wider than it is tall', built.sakura.crownRadius * 2 > built.sakura.height,
    `crown ${(built.sakura.crownRadius * 2).toFixed(1)} m across, ${built.sakura.height.toFixed(1)} m tall`);
  // autumn takes sakura to its own colours, not the generic brown
  const a0 = A.buildPrototype('sakura', 3, { autumn: 0 }).leaf.attributes.color.array;
  const a1 = A.buildPrototype('sakura', 3, { autumn: 1 }).leaf.attributes.color.array;
  let moved = 0; for (let i = 0; i < a0.length; i++) if (Math.abs(a0[i] - a1[i]) > 0.01) moved++;
  check('autumn 1 recolours the blossom', moved > a0.length * 0.5, `${moved} of ${a0.length} colour channels moved`);
}
{
  const bare = A.buildPrototype('oak', 5, { foliage: 0 });
  const full = A.buildPrototype('oak', 5, { foliage: 1 });
  check('foliage 0 strips the leaves, foliage 1 puts them back',
    bare.hasLeaves === false && full.hasLeaves === true,
    `${bare.leaf.attributes.position.count} verts vs ${full.leaf.attributes.position.count}`);
}

// ---------------------------------------------------------------------------
console.log('\narbor: prototypes and the mix');
check('spacingFor is the reference: Open 21, Natural 13, Dense 8',
  A.spacingFor('Open') === 21 && A.spacingFor('Natural') === 13 && A.spacingFor('Dense') === 8);
check('thresholdFor is the reference: Open 0.44, Natural 0.34, Dense 0.24',
  A.thresholdFor('Open') === 0.44 && A.thresholdFor('Natural') === 0.34 && A.thresholdFor('Dense') === 0.24);
{
  // pickSpecies has to reproduce the weights it was given
  const mix = A.FOREST_TYPES.meadow.mix;
  const seen = {};
  let r = 0; const rng = () => { r = (r + 0.0001) % 1; return r; };
  for (let i = 0; i < 10000; i++) { const s = A.pickSpecies(mix, rng); seen[s] = (seen[s] || 0) + 1; }
  const off = mix.map(([id, w]) => Math.abs((seen[id] || 0) / 10000 - w));
  check('pickSpecies follows the mix weights', Math.max(...off) < 0.01,
    mix.map(([id, w]) => `${id} ${(((seen[id] || 0) / 10000) * 100).toFixed(1)}% want ${(w * 100).toFixed(0)}%`).join(', '));
}
{
  const protos = A.forestPrototypes('meadow', 42017);
  check('a forest type builds 8 prototypes', protos.length === A.PROTO_COUNT, `${protos.length}`);
  const allowed = new Set(A.FOREST_TYPES.meadow.mix.map((m) => m[0]));
  check('every prototype is a species the mix allows', protos.every((p) => allowed.has(p.species)),
    protos.map((p) => p.species).join(' '));
  const mats = new Set(protos.map((p) => p.grownHeight.toFixed(2)));
  check('the stand has trees of different ages', mats.size >= 5, `${mats.size} distinct heights: ${[...mats].join(', ')}`);
  const again = A.forestPrototypes('meadow', 42017);
  check('the same seed builds the same stand', again.every((p, i) => p === protos[i] || p.species === protos[i].species));
  check('prototypeFor caches', A.prototypeFor('oak', 99) === A.prototypeFor('oak', 99));
  check('prototypeFor does not cache across seeds', A.prototypeFor('oak', 99) !== A.prototypeFor('oak', 100));
  check('buildPrototype does not cache (it is the raw builder)', A.buildPrototype('oak', 99) !== A.buildPrototype('oak', 99));
  const tri = protos.reduce((a, p) => a + p.triangles, 0);
  console.log(`       a meadow stand: ${Math.round(tri)} tris across 8 prototypes, ${protos.length * 2} draw calls if each is instanced whole`);
}
{
  // aliased types must share one prototype cache entry, or the world holds two
  // identical stands and pays twice for them
  check('meadow and Temperate broadleaf are one forest under two names',
    A.canonicalType('meadow') === 'Temperate broadleaf' && A.canonicalType('boreal') === 'Boreal conifer'
    && A.canonicalType('mountain') === 'Mediterranean pine');
  check('a type with no alias is its own key', A.canonicalType('sakura') === 'sakura' && A.canonicalType('desert') === 'desert');
  check('an alias really is the same mix',
    JSON.stringify(A.FOREST_TYPES.meadow.mix) === JSON.stringify(A.FOREST_TYPES['Temperate broadleaf'].mix)
    && JSON.stringify(A.FOREST_TYPES.boreal.mix) === JSON.stringify(A.FOREST_TYPES['Boreal conifer'].mix)
    && JSON.stringify(A.FOREST_TYPES.mountain.mix) === JSON.stringify(A.FOREST_TYPES['Mediterranean pine'].mix));
  check('and the same stand comes out of both names',
    A.forestPrototypes('meadow', 5).every((p, i) => p === A.forestPrototypes('Temperate broadleaf', 5)[i]));
}
check('ocean has no species at all', A.FOREST_TYPES.ocean.mix.length === 0);
check('forestPrototypes on ocean returns nothing', A.forestPrototypes('ocean', 1).length === 0);
check('an unknown forest type throws', (() => { try { A.forestPrototypes('swamp', 1); return false; } catch { return true; } })());
check('an unknown species throws', (() => { try { A.buildPrototype('yew', 1); return false; } catch { return true; } })());

// ---------------------------------------------------------------------------
console.log('\narbor: placement over a 64 m chunk (the game\'s CHUNK), Natural density');
{
  let empty = 0;
  for (const id of A.FOREST_TYPE_IDS) {
    let total = 0, chunks = 0;
    for (let cz = 0; cz < 6; cz++) for (let cx = 0; cx < 6; cx++) { total += A.placeTrees(id, cx, cz, 64, 42017, { density: 'Natural' }).length; chunks++; }
    let own = 0;
    for (let cz = 0; cz < 6; cz++) for (let cx = 0; cx < 6; cx++) own += A.placeTrees(id, cx, cz, 64, 42017).length;
    const per = total / chunks;
    console.log(`       ${id.padEnd(21)} Natural ${per.toFixed(1).padStart(5)} trees per 64 m chunk (${(per / (64 * 64) * 10000).toFixed(0)}/ha)   at its own '${A.FOREST_TYPES[id].density}' default ${(own / chunks).toFixed(1)}`);
    if (id !== 'ocean' && total === 0) empty++;
  }
  check('every forest type but ocean places trees', empty === 0, `${empty} came back empty`);
  check('ocean places nothing', A.placeTrees('ocean', 3, 4, 64, 42017).length === 0);
}
{
  const open = A.placeTrees('meadow', 5, 5, 64, 1, { density: 'Open' }).length;
  const nat = A.placeTrees('meadow', 5, 5, 64, 1, { density: 'Natural' }).length;
  const dense = A.placeTrees('meadow', 5, 5, 64, 1, { density: 'Dense' }).length;
  check('density orders Open < Natural < Dense', open < nat && nat < dense, `${open} / ${nat} / ${dense} in one chunk`);
}
{
  const a = JSON.stringify(A.placeTrees('boreal', -3, 11, 64, 42017));
  const b = JSON.stringify(A.placeTrees('boreal', -3, 11, 64, 42017));
  check('a chunk places identically every time', a === b, `${JSON.parse(a).length} trees`);
  const c = JSON.stringify(A.placeTrees('boreal', -3, 11, 64, 42018));
  check('a different world seed places differently', a !== c);
}
{
  const t = A.placeTrees('meadow', 2, 2, 64, 42017);
  const inside = t.every((s) => s.x >= 2 * 64 && s.x < 3 * 64 + 12 && s.z >= 2 * 64 && s.z < 3 * 64 + 12);
  check('every tree lands in or just over its own chunk', inside, `${t.length} trees`);
  check('scale and yaw are in the reference ranges',
    t.every((s) => s.scale >= 0.55 && s.scale <= 1.5 && s.yScale >= 0.9 && s.yScale <= 1.15 && s.yaw >= 0 && s.yaw <= 6.28));
  check('protoIndex is a valid index into the 8 prototypes',
    t.every((s) => Number.isInteger(s.protoIndex) && s.protoIndex >= 0 && s.protoIndex < 8));
  check('no NaN in any placement', t.every((s) => Number.isFinite(s.x) && Number.isFinite(s.z) && Number.isFinite(s.scale) && Number.isFinite(s.yScale) && Number.isFinite(s.yaw)));
}
{
  // a rejection must not shuffle the survivors: the reference draws every roll
  // before any rejection, and that is what makes a clearing a hole rather than
  // a different forest
  const all = A.placeTrees('meadow', 0, 0, 64, 42017);
  const clipped = A.placeTrees('meadow', 0, 0, 64, 42017, { clearRadius: 40 });
  const survivors = all.filter((s) => Math.hypot(s.x, s.z) >= 40);
  check('clearRadius removes trees without moving the rest',
    JSON.stringify(clipped) === JSON.stringify(survivors), `${all.length} down to ${clipped.length}`);
  check('clearRadius actually cleared something', clipped.length < all.length, `${all.length - clipped.length} removed`);
  const kept = A.placeTrees('meadow', 0, 0, 64, 42017, { keep: (x) => x > 20 });
  check('a keep predicate filters, both ways',
    kept.length > 0 && kept.length < all.length && kept.every((s) => s.x > 20),
    `${kept.length} of ${all.length} kept`);
}
{
  // mountain thins with height, and has to be shown to do all of it: full stand
  // below the rock line, thinning through the middle, bare above the snow line
  const at = (y) => A.placeTrees('mountain', 4, 4, 64, 42017, { density: 'Natural', heightAt: () => y }).length;
  const ys = [0, 20, 46, 55, 62, 70, 78, 90];
  const n = ys.map(at);
  console.log('       mountain trees by ground height: ' + ys.map((y, i) => `${y}m ${n[i]}`).join(', '));
  check('the stand is full anywhere below the rock line', n[0] === n[1] && n[1] === n[2] && n[0] > 0, `${n[0]} trees at 0, 20 and 46 m`);
  check('it only ever thins as the ground rises', n.every((v, i) => i === 0 || v <= n[i - 1]), n.join(' > '));
  check('it is bare at and above the snow line', n[6] === 0 && n[7] === 0, `${n[6]} at 78 m, ${n[7]} at 90 m`);
  check('halfway up, some trees are left', n[4] > 0 && n[4] < n[0], `${n[4]} at 62 m of ${n[0]} at 0 m`);
  check('a type with no thinByHeight ignores heightAt',
    A.placeTrees('meadow', 4, 4, 64, 42017, { heightAt: () => 900 }).length === A.placeTrees('meadow', 4, 4, 64, 42017).length);
}
{
  // desert swaps its mix where there is water
  const dry = A.forestPrototypes('desert', 9).map((p) => p.species);
  const wet = A.forestPrototypes('desert', 9, { wet: true }).map((p) => p.species);
  check('desert is mostly snags away from water', dry.filter((s) => s === 'dead').length > dry.filter((s) => s === 'palm').length, dry.join(' '));
  check('desert is mostly palm by water', wet.filter((s) => s === 'palm').length > wet.filter((s) => s === 'dead').length, wet.join(' '));
}
{
  const t0 = performance.now();
  for (let i = 0; i < 200; i++) A.placeTrees('meadow', 100 + i, 7, 64, 42017);
  const ms = (performance.now() - t0) / 200;
  check('a chunk places in under 0.5 ms', ms < 0.5, `${ms.toFixed(3)} ms`);
}

// ---------------------------------------------------------------------------
console.log('\narbor: wind');
{
  let lo = Infinity, hi = -Infinity, aLo = Infinity, aHi = -Infinity, bad = 0;
  A.setWind(1.0);
  for (let t = 0; t < 600; t += 7) {
    for (let x = -4000; x <= 4000; x += 311) for (let z = -4000; z <= 4000; z += 397) {
      const w = A.windField(x, z, t);
      if (!Number.isFinite(w.strength) || !Number.isFinite(w.angle) || !Number.isFinite(w.dirX) || !Number.isFinite(w.dirZ)) bad++;
      if (w.strength < lo) lo = w.strength; if (w.strength > hi) hi = w.strength;
      if (w.angle < aLo) aLo = w.angle; if (w.angle > aHi) aHi = w.angle;
    }
  }
  check('the wind field never produces a NaN', bad === 0, `${bad} bad samples`);
  check('strength stays inside [0.35, 1.65] x base at base 1', lo >= 0.35 - 1e-9 && hi <= 1.65 + 1e-9,
    `seen ${lo.toFixed(3)} to ${hi.toFixed(3)} over 22 million square metres and 600 s`);
  check('direction stays within 0.55 rad of the prevailing',
    Math.abs(aLo - A.PREVAILING) <= 0.551 && Math.abs(aHi - A.PREVAILING) <= 0.551,
    `${(aLo * 180 / Math.PI).toFixed(0)} to ${(aHi * 180 / Math.PI).toFixed(0)} degrees`);
  check('the field actually varies across space', hi - lo > 0.5, `spread ${(hi - lo).toFixed(2)}`);
  const near = A.windField(0, 0, 10), far = A.windField(1500, 1500, 10);
  check('two stands 2 km apart do not sway in lockstep', Math.abs(near.strength - far.strength) > 0.05,
    `${near.strength.toFixed(2)} against ${far.strength.toFixed(2)}`);
  const same = A.windField(0, 0, 10), also = A.windField(6, 6, 10);
  check('two trees six metres apart do sway together', Math.abs(same.strength - also.strength) < 0.02,
    `${same.strength.toFixed(3)} against ${also.strength.toFixed(3)}`);
  A.setWind(0);
  check('base 0 stills the whole field', A.windField(123, 456, 78).strength === 0);
  A.setWind(A.WIND_DEFAULT);
  check('setWind writes the shared uniform', A.windUniforms.uWind.value === A.WIND_DEFAULT);
  A.tick(12.5);
  check('tick writes the shared clock', A.windUniforms.uTime.value === 12.5);
}
{
  const fake = () => ({ uniforms: {}, vertexShader: 'void main(){\n#include <begin_vertex>\n}', fragmentShader: 'void main(){\n#include <color_fragment>\n}' });
  const leaf = fake(); A.windHook(leaf, 0.06, false);
  check('windHook shares the uniforms rather than copying them',
    leaf.uniforms.uTime === A.windUniforms.uTime && leaf.uniforms.uWind === A.windUniforms.uWind);
  check('the leaf hook declares both uniforms and displaces x and z',
    leaf.vertexShader.includes('uniform float uWind') && leaf.vertexShader.includes('transformed.x+=') && leaf.vertexShader.includes('transformed.z+='));
  check('the leaf hook guards the instanceMatrix read', leaf.vertexShader.includes('#ifdef USE_INSTANCING'));
  check('the leaf hook carries the world-space gust term', leaf.vertexShader.includes('aGust') && leaf.vertexShader.includes('aSwing'));
  check('no GLSL integer literal slipped into a float slot',
    !/[*+]\s*\d+\s*\*position\.y/.test(leaf.vertexShader) && /0\.0750\*position\.y/.test(leaf.vertexShader),
    'amp 0.06 x 1.25 becomes 0.0750');
  const grass = fake(); A.windHook(grass, 0, true);
  check('the grass hook fades blades out with camera distance', grass.vertexShader.includes('smoothstep(70.0,48.0,dcam)'));
  check('the grass hook darkens the root in the fragment shader', grass.fragmentShader.includes('mix(0.38,1.15,vMapUv.y)'));
  A.setWindVariation(false);
  const flat = fake(); A.windHook(flat, 0.06, false);
  check('setWindVariation(false) falls back to the reference\'s flat wind',
    !flat.vertexShader.includes('aGust') && flat.vertexShader.includes('float wStr=uWind;'));
  A.setWindVariation(true);
  check('setWindVariation(true) brings the field back', A.windHook(fake(), 0.06, false).vertexShader.includes('aGust'));
}
check('every leaf material carries the wind hook',
  Object.values(built).every((p) => typeof p.leafMat.onBeforeCompile === 'function'));
{
  const sh = { uniforms: {}, vertexShader: '#include <begin_vertex>', fragmentShader: '#include <color_fragment>' };
  built.oak.leafMat.onBeforeCompile(sh);
  check('a prototype\'s leaf material really hooks the wind on compile', sh.uniforms.uWind === A.windUniforms.uWind && sh.vertexShader.includes('wStr'));
}

// ---------------------------------------------------------------------------
console.log('\narbor: materials and textures, with the canvas stubbed');
{
  const p = built.oak;
  check('bark material has an albedo and a normal map', !!p.barkMat.map && !!p.barkMat.normalMap);
  check('leaf material is alpha tested and double sided', p.leafMat.alphaTest === 0.45 && p.leafMat.side === THREE.DoubleSide);
  check('leaf material takes its colour from the vertices', p.leafMat.vertexColors === true);
  check('there is a depth material so shadows are cut out too',
    p.depthMat.isMeshDepthMaterial === true && p.depthMat.alphaTest === 0.45 && p.depthMat.map === p.leafMat.map);
  const spruce = built.spruce;
  check('two species have two different bark sheets', p.barkMat.map !== spruce.barkMat.map);
  check('two species with the same bark style and colour share one sheet',
    makeBark('rough', '#4a3a28').map === p.barkMat.map, 'the cache is doing its job');
  check('every leaf kind draws', LEAF_KINDS.every((k) => !!makeLeafTex(k)), LEAF_KINDS.join(' '));
  check('leaf sheets are cached per kind', makeLeafTex('oval') === makeLeafTex('oval'));
  const st = textureStats();
  console.log(`       texture cache: ${st.bark} bark pairs, ${st.leaf} leaf sheets`);
  check('one bark sheet per species, not one per tree', st.bark === A.SPECIES_IDS.length, `${st.bark} sheets for ${A.SPECIES_IDS.length} species`);
  const before = textureStats().bark;
  A.forestPrototypes('meadow', 777);
  check('eight more prototypes of the same species draw no new sheets', textureStats().bark === before, `still ${before}`);
  check('at most one sheet per leaf kind', st.leaf <= LEAF_KINDS.length, `${st.leaf} of ${LEAF_KINDS.length}`);
}

// ---------------------------------------------------------------------------
console.log('\narbor: grass');
{
  const { geo, mat } = A.buildGrassAssets();
  check('the blade cross is three quads merged', geo.attributes.position.count === 24 && geo.index.count === 54,
    `${geo.attributes.position.count} verts, ${geo.index.count / 3} tris`);
  check('grass assets are built once and shared', A.buildGrassAssets().geo === geo && A.buildGrassAssets().mat === mat);
  const g = A.grassChunk('meadow', 0, 0, { heightAt: (x, z) => Math.sin(x * 0.1) * 2, seed: 42017 });
  check('a meadow grass chunk is one instanced mesh', g && g.isInstancedMesh === true);
  check('it holds the reference count: 24 x 24 x 7 x under', g.count === Math.floor(24 * 24 * 7 * A.FOREST_TYPES.meadow.under), `${g.count} blades`);
  check('every blade sits on the ground the caller described', (() => {
    const m = new THREE.Matrix4(), p = new THREE.Vector3();
    for (let i = 0; i < g.count; i += 37) { g.getMatrixAt(i, m); p.setFromMatrixPosition(m); if (Math.abs(p.y - (Math.sin(p.x * 0.1) * 2 - 0.03)) > 1e-4) return false; }
    return true;
  })());
  check('the same chunk is the same grass', (() => {
    const h = (x) => x * 0;
    const a = A.grassChunk('meadow', 2, 3, { heightAt: h, seed: 1 });
    const b = A.grassChunk('meadow', 2, 3, { heightAt: h, seed: 1 });
    const ok = Buffer.from(a.instanceMatrix.array.buffer).equals(Buffer.from(b.instanceMatrix.array.buffer));
    a.dispose(); b.dispose(); return ok;
  })());
  check('boreal is sparser than meadow', A.grassChunk('boreal', 0, 0, {}).count < g.count,
    `${A.grassChunk('boreal', 0, 0, {}).count} against ${g.count}`);
  check('ocean grows no grass', A.grassChunk('ocean', 0, 0, {}) === null);
  check('grass density 0 grows no grass', A.grassChunk('meadow', 0, 0, { grass: 0 }) === null);
  check('a keep predicate that says no everywhere grows no grass', A.grassChunk('meadow', 0, 0, { keep: () => false }) === null);
  const half = A.grassChunk('meadow', 0, 0, { keep: (x) => x < 12 });
  check('a keep predicate that says no in half the chunk halves the blades',
    half.count > g.count * 0.3 && half.count < g.count * 0.7, `${half.count} of ${g.count}`);
  check('no NaN in the grass matrices', [...g.instanceMatrix.array].every(Number.isFinite));
  g.dispose(); half.dispose();
}

// ---------------------------------------------------------------------------
console.log('\narbor: what a chunk of forest costs');
{
  const protos = A.forestPrototypes('boreal', 42017);
  const spots = A.placeTrees('boreal', 12, 12, 64, 42017);
  const perProto = new Array(protos.length).fill(0);
  for (const s of spots) perProto[s.protoIndex]++;
  const drawn = perProto.filter((n) => n > 0).length;
  const tris = spots.reduce((a, s) => a + protos[s.protoIndex].triangles, 0);
  const unique = protos.reduce((a, p) => a + p.triangles, 0);
  const bytes = protos.reduce((a, p) => a + bytesOf(p.bark) + bytesOf(p.leaf), 0);
  console.log(`       a boreal chunk at Dense, detail 1: ${spots.length} trees, ${Math.round(tris).toLocaleString()} triangles drawn, ${drawn} prototypes used`);
  console.log(`       the stand itself: ${Math.round(unique).toLocaleString()} unique triangles, ${(bytes / 1024 / 1024).toFixed(2)} MB, ${protos.length * 2} draw calls when instanced world wide`);
  // and the same for every type, because one measured type is not the case
  let worstMB = 0, worstId = '';
  for (const id of A.FOREST_TYPE_IDS) {
    const mb = A.forestPrototypes(id, 42017).reduce((a, p) => a + bytesOf(p.bark) + bytesOf(p.leaf), 0) / 1024 / 1024;
    if (mb > worstMB) { worstMB = mb; worstId = id; }
  }
  check('the heaviest stand of any forest type stays under 12 MB of vertex data', worstMB < 12,
    `${worstId} is the worst at ${worstMB.toFixed(2)} MB; boreal is ${(bytes / 1024 / 1024).toFixed(2)} MB`);
  check('8 prototypes is 16 draw calls for a whole forest type, however many chunks', protos.length * 2 === 16);
  // that number is too big for a ring of chunks, so the detail lever has to buy
  // back a real amount, and it has to be measured, not asserted
  const cost = (d) => {
    const ps = A.forestPrototypes('boreal', 42017, { detail: d });
    return A.placeTrees('boreal', 12, 12, 64, 42017).reduce((a, s) => a + ps[s.protoIndex].triangles, 0);
  };
  const c1 = cost(1), c07 = cost(0.7), c05 = cost(0.5), c035 = cost(0.35);
  console.log(`       detail 1 / 0.7 / 0.5 / 0.35: ${[c1, c07, c05, c035].map((v) => Math.round(v).toLocaleString()).join('  ')} triangles for the same chunk`);
  check('detail is monotone: less detail is fewer triangles', c1 > c07 && c07 > c05 && c05 > c035);
  check('detail 0.5 costs under 60% of detail 1', c05 < c1 * 0.6, `${(c05 / c1 * 100).toFixed(0)}%`);
  check('detail 1 is exactly the reference (nothing is lost by default)',
    A.buildPrototype('oak', 3, { detail: 1 }).triangles === A.buildPrototype('oak', 3, {}).triangles);
  // what flora.js can actually afford: a Natural stand at half detail
  const psHalf = A.forestPrototypes('meadow', 42017, { detail: 0.5 });
  const nat = A.placeTrees('meadow', 12, 12, 64, 42017, { density: 'Natural' });
  const natTris = nat.reduce((a, s) => a + psHalf[s.protoIndex].triangles, 0);
  console.log(`       a Natural meadow chunk at detail 0.5: ${nat.length} trees, ${Math.round(natTris).toLocaleString()} triangles`);
  check('a Natural chunk at detail 0.5 stays under 250,000 triangles', natTris < 250000, `${Math.round(natTris).toLocaleString()}`);
}

// ---------------------------------------------------------------------------
console.log('\narbor: the LOD bands flora.js draws');
{
  check('three bands, near mid far', A.LOD_BANDS.length === 3 && A.LOD_BANDS[0].name === 'near');
  check('only the near band casts a shadow',
    A.LOD_BANDS[0].shadow === true && A.LOD_BANDS.slice(1).every((b) => !b.shadow));
  check('the mid band is the optimised reference\'s own numbers: stride 3 at 1.8x',
    A.LOD_BANDS[1].leafStride === 3 && A.LOD_BANDS[1].leafSize === 1.8);

  const rows = [];
  for (const id of ['oak', 'spruce', 'birch', 'palm', 'willow', 'dead']) {
    const p = A.buildPrototype(id, 4242, { detail: 0.6 });
    const per = A.LOD_BANDS.map((B) => {
      const bark = A.barkLod(p, B.barkDepth);
      const leaf = p.hasLeaves ? A.leafForBand(p.leaf, B) : null;
      return { bark: bark.index.count / 3, leaf: leaf ? leaf.index.count / 3 : 0, geoBark: bark, geoLeaf: leaf };
    });
    rows.push({ id, p, per });
    console.log(`       ${id.padEnd(7)} ${per.map((b) => `${num(b.bark, 6)}+${num(b.leaf, 5)}`).join('   ')}`);
  }
  check('every band is strictly cheaper than the one inside it, for every species',
    rows.every((r) => r.per[0].bark + r.per[0].leaf > r.per[1].bark + r.per[1].leaf
      && r.per[1].bark + r.per[1].leaf > r.per[2].bark + r.per[2].leaf),
    rows.map((r) => `${r.id} ${r.per.map((b) => b.bark + b.leaf).join('/')}`).join('  '));
  check('a bare tree stays bare at every band', rows.find((r) => r.id === 'dead').per.every((b) => b.leaf === 0));
  check('and dead has no leaf geometry to build one from',
    A.leafForBand(A.buildPrototype('dead', 1).leaf, A.LOD_BANDS[1]) === null);

  // leafLod: the count, the size and the anchor, all measured off the vertices
  const oak = rows.find((r) => r.id === 'oak').p;
  const quads = (g) => (g ? g.attributes.position.count / 4 : 0);
  const full = oak.leaf, mid = A.leafLod(full, 3, 1.8);
  check('one leaf quad in three survives the mid band',
    quads(mid) === Math.ceil(quads(full) / 3), `${quads(mid)} of ${quads(full)}`);
  const edge = (g, q) => {
    const p = g.attributes.position, i = q * 4;
    return Math.hypot(p.getX(i + 2) - p.getX(i), p.getY(i + 2) - p.getY(i), p.getZ(i + 2) - p.getZ(i));
  };
  check('and it is 1.8 times the size, to the fourth decimal',
    Math.abs(edge(mid, 0) / edge(full, 0) - 1.8) < 1e-4, `${(edge(mid, 0) / edge(full, 0)).toFixed(5)}x`);
  const anchor = (g, q) => {
    const p = g.attributes.position, i = q * 4;
    return [(p.getX(i) + p.getX(i + 1)) / 2, (p.getY(i) + p.getY(i + 1)) / 2, (p.getZ(i) + p.getZ(i + 1)) / 2];
  };
  let worstMove = 0;
  for (let q = 0; q < quads(mid); q++) {
    const a = anchor(full, q * 3), b = anchor(mid, q);
    worstMove = Math.max(worstMove, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));
  }
  check('every enlarged leaf is still hung on the twig it grew on', worstMove < 1e-4,
    `worst ${worstMove.toExponential(1)} m over ${quads(mid)} leaves`);
  check('a capped band takes exactly that many quads, whatever the species',
    ['oak', 'spruce', 'birch', 'willow'].every((id) => {
      const pr = A.buildPrototype(id, 7, { detail: 0.6 });
      return quads(A.leafForBand(pr.leaf, A.LOD_BANDS[2])) === A.LOD_BANDS[2].leafQuads;
    }), `${A.LOD_BANDS[2].leafQuads} quads at ${A.LOD_BANDS[2].leafSize}x`);
  check('no NaN anywhere in a band geometry',
    rows.every((r) => r.per.every((b) => !anyNaN(b.geoBark) && (!b.geoLeaf || !anyNaN(b.geoLeaf)))));

  // barkLod: an index only view, so the twigs cost nothing in vertex memory
  const b99 = A.barkLod(oak, 99), b1 = A.barkLod(oak, 1), b0 = A.barkLod(oak, 0);
  check('barkLod 99 is the prototype geometry itself, untouched', b99 === oak.bark);
  check('the bole survives at every depth', b0.index.count >= 60, `${b0.index.count / 3} triangles`);
  check('a shallower bark is a strict subset of the deeper one',
    b0.index.count < b1.index.count && b1.index.count < b99.index.count,
    `${b0.index.count / 3} / ${b1.index.count / 3} / ${b99.index.count / 3} triangles`);
  check('and shares its vertices, so it costs one index buffer and no upload',
    b0.attributes.position === oak.bark.attributes.position
    && b1.attributes.normal === oak.bark.attributes.normal);
  // the order tag has to be real: order 0 is one axis, so its rings must all
  // be near the trunk in xz, and the full bark must reach the crown
  const xz = (g) => {
    const idx = g.index.array, p = g.attributes.position;
    let m = 0;
    for (let i = 0; i < idx.length; i++) m = Math.max(m, Math.hypot(p.getX(idx[i]), p.getZ(idx[i])));
    return m;
  };
  check('the far bark is the bole and the full bark is the whole crown',
    xz(b0) < xz(b99) * 0.35, `${xz(b0).toFixed(2)} m against ${xz(b99).toFixed(2)} m of reach`);
}

// ---------------------------------------------------------------------------
console.log('\narbor: placeTrees hands back the roll it drew');
{
  const spots = A.placeTrees('meadow', 3, 5, 64, 42017);
  check('every spot carries the raw pick as well as the prototype slot',
    spots.length > 0 && spots.every((s) => s.pick >= 0 && s.pick < 1
      && s.protoIndex === Math.floor(s.pick * 8)), `${spots.length} spots`);
  // that roll is what flora.js draws the SPECIES from, so it has to spread
  const buckets = [0, 0, 0, 0];
  for (let cz = 0; cz < 10; cz++) for (let cx = 0; cx < 10; cx++) {
    for (const s of A.placeTrees('boreal', cx, cz, 64, 42017)) buckets[Math.floor(s.pick * 4)]++;
  }
  const lo = Math.min(...buckets), hi = Math.max(...buckets);
  check('and it is flat enough to draw a mix from', lo > 0 && hi / lo < 1.15,
    buckets.join('/'));
  check('sakura has a wet mix, so a bank in a cherry wood grows willow',
    A.FOREST_TYPES.sakura.wetMix.some((m) => m[0] === 'willow'));
  check('and every wet mix names species that exist',
    A.FOREST_TYPE_IDS.every((id) => (A.FOREST_TYPES[id].wetMix || []).every((m) => A.SPECIES[m[0]])));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
