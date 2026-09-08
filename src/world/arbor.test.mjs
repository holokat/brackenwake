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
// this is the GROWN generator's suite; the low poly one is lowpoly_trees.test.mjs
A.setTreeStyle('grown');

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
check('oak still has the reference size and bole',
  A.SPECIES.oak.h[0] === 13 && A.SPECIES.oak.h[1] === 20 && A.SPECIES.oak.trunk === 0.055);
check('spruce still has the reference structure',
  A.SPECIES.spruce.levels === 3 && A.SPECIES.spruce.lat === 6 && A.SPECIES.spruce.habit === 'conical');
// A1 moved four numbers away from the reference on purpose, and each of them
// paid for a silhouette the world needed. They are pinned here so the next
// person to change one knows they are changing a shape, not a typo.
check('the four numbers A1 moved off the reference are still where A1 put them',
  A.SPECIES.oak.spread === 56 && A.SPECIES.spruce.bole === 0.9
  && A.SPECIES.pine.latFrom === 0.82 && A.SPECIES.beech.spread === 38,
  'oak spread 52 to 56, spruce bole 0.34 to 0.9, pine laterals from 0.72 to 0.82 of its bole, beech spread 40 to 38');
check('every species says all four silhouette numbers out loud',
  A.SPECIES_IDS.every((id) => ['bole', 'latFrom', 'latDeep', 'crownBase'].every((k) => typeof A.SPECIES[id][k] === 'number')));
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


// ===========================================================================
// The silhouette: where the leaves are, and whether they hide the sticks
//
// The bug this section exists to stop: "some have leaves on the bottom and none
// at the top, totally messed up". It was a real, measurable, one species class.
// A spruce grew a 6 m leader, hung every one of its whorls on THAT, and stacked
// the rest of its 19 m out of apical continuations, so the whorls, and with
// them every needle, lived in the bottom third. Measured on the shipped code in
// ten bands up the trunk: 70% of the needles in the bottom fifth, 8% in the top
// half, and the lowest of them 1.1 m UNDER the ground. Spruce and fir are 60%
// of the boreal mix and all of the snow, so two whole biomes were upside down.
//
// Nothing here trusts the species table. Every tree is grown, every leaf quad
// is found by its anchor (the midpoint of its first two corners, which is the
// point on the twig it hangs from) and counted into a band, at all three of the
// LOD bands flora.js draws, because a near tree and a far tree that disagree
// about where the canopy is is the same bug wearing a hat.
// ===========================================================================
console.log('\narbor: the crown, in ten bands up the trunk');

const BANDS = 10;
/** Leaf anchors per tenth of the tree's height, and the lowest of them. */
function leafBands(geo, height) {
  const pos = geo?.attributes?.position;
  const h = new Array(BANDS).fill(0);
  if (!pos || pos.count < 4) return { h, n: 0, ymin: null, ymax: null, lowVert: null };
  let ymin = Infinity, ymax = -Infinity, lowVert = Infinity;
  const quads = Math.floor(pos.count / 4);
  for (let q = 0; q < quads; q++) {
    const v = q * 4;
    const y = (pos.getY(v) + pos.getY(v + 1)) * 0.5;
    if (y < ymin) ymin = y;
    if (y > ymax) ymax = y;
    for (let k = 0; k < 4; k++) lowVert = Math.min(lowVert, pos.getY(v + k));
    h[Math.max(0, Math.min(BANDS - 1, Math.floor(y / height * BANDS)))]++;
  }
  return { h, n: quads, ymin, ymax, lowVert };
}
const share = (b) => (b.n ? b.h.map((c) => c / b.n * 100) : b.h);
const upperHalf = (b) => share(b).slice(5).reduce((a, x) => a + x, 0);
/** The height, as a fraction of the tree, that half the leaves stand below. */
function median(b) {
  if (!b.n) return 0;
  let seen = 0;
  for (let i = 0; i < BANDS; i++) { seen += b.h[i]; if (seen >= b.n / 2) return (i + 0.5) / BANDS; }
  return 1;
}

/**
 * Crown coverage: stand outside the tree, look at a branch, and ask whether a
 * leaf is in the way. Every bark triangle of order 1 or deeper that stands
 * above the lowest leaf is a candidate scaffold; a ray is fired at a sample of
 * them from three crown radii out on a random bearing and a shallow elevation,
 * and the ray counts as covered if it meets leaf geometry before it arrives.
 *
 * This is the number behind "leaves dense enough to hide the branch scaffold
 * from outside the crown". A bare armature reads as a dead tree with a green
 * cloud floating near it, which is the other half of what the player saw.
 */
function crownCoverage(proto, samples = 300, seed = 7) {
  if (!proto.hasLeaves) return null;
  const bp = proto.bark.attributes.position, bi = proto.bark.index.array;
  const ord = proto.barkOrder;
  const R = Math.max(1, proto.crownRadius) * 3 + 6;
  const mesh = new THREE.Mesh(proto.leaf, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  mesh.updateMatrixWorld();
  const base = leafBands(proto.leaf, proto.height).ymin ?? 0;
  const cand = [];
  for (let t = 0; t < ord.length; t++) {
    if (ord[t] < 1) continue;                    // the bole is meant to show
    const a = bi[t * 3], b = bi[t * 3 + 1], c = bi[t * 3 + 2];
    const y = (bp.getY(a) + bp.getY(b) + bp.getY(c)) / 3;
    if (y < base) continue;
    cand.push([(bp.getX(a) + bp.getX(b) + bp.getX(c)) / 3, y, (bp.getZ(a) + bp.getZ(b) + bp.getZ(c)) / 3]);
  }
  if (!cand.length) return null;
  let s = seed >>> 0;
  const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const rc = new THREE.Raycaster();
  const dir = new THREE.Vector3(), org = new THREE.Vector3(), tgt = new THREE.Vector3();
  let hid = 0;
  for (let i = 0; i < samples; i++) {
    const p = cand[Math.floor(rnd() * cand.length)];
    tgt.set(p[0], p[1], p[2]);
    const az = rnd() * Math.PI * 2, el = rnd() * 0.9 - 0.25;
    dir.set(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)).normalize();
    org.copy(tgt).addScaledVector(dir, R);
    rc.set(org, dir.clone().multiplyScalar(-1));
    rc.far = R + 0.5;
    const hits = rc.intersectObject(mesh, false);
    if (hits.length && hits[0].distance < R - 0.02) hid++;
  }
  return hid / samples;
}

// What each species has to be, and why, in one table. The thresholds are the
// brief: an oak round and broad, a beech tall and domed, a birch slender and
// light, a spruce a spire, a pine an umbrella on a bare trunk, a willow weeping
// to the ground, a palm a bare bole with a crown, a sakura low and spreading.
//
//   upper      the least of the leaves that must sit in the top half. A cone
//              legitimately carries most of its needle area low down, so a
//              conical habit is judged against its own number and not a
//              broadleaf's; 8% was the bug, 25% is a spire.
//   base       the fraction of the height the lowest leaf must clear, so there
//              is trunk under the crown. A willow's whips are meant to sweep
//              the grass, so its floor is the ground clearance and no more.
//   cover      the least of the scaffold rays a leaf must stop.
//   aspect     [min, max] of crown radius over height, which is the whole of
//              what a silhouette is at 100 m.
const WANT = {
  oak:    { upper: 0.55, base: 0.20, cover: 0.80, aspect: [0.45, 0.85], note: 'round and broad' },
  beech:  { upper: 0.55, base: 0.25, cover: 0.70, aspect: [0.28, 0.55], note: 'tall and domed' },
  birch:  { upper: 0.55, base: 0.25, cover: 0.60, aspect: [0.24, 0.48], note: 'slender and light' },
  spruce: { upper: 0.25, base: 0.06, cover: 0.70, aspect: [0.20, 0.42], note: 'a spire' },
  pine:   { upper: 0.70, base: 0.38, cover: 0.75, aspect: [0.35, 0.70], note: 'an umbrella on a bare trunk' },
  kapok:  { upper: 0.50, base: 0.30, cover: 0.70, aspect: [0.45, 0.85], note: 'a rainforest emergent' },
  fig:    { upper: 0.50, base: 0.18, cover: 0.80, aspect: [0.50, 0.95], note: 'low and heavy' },
  willow: { upper: 0.35, base: 0.00, cover: 0.55, aspect: [0.55, 1.00], note: 'weeping to the ground' },
  palm:   { upper: 0.90, base: 0.42, cover: 0.75, aspect: [0.30, 0.60], note: 'a bare bole and a crown' },
  sakura: { upper: 0.55, base: 0.18, cover: 0.70, aspect: [0.60, 1.15], note: 'low and spreading' },
};
const SEEDS = [1, 977, 4242, 31337];
// the detail each kind is actually shipped at by flora.js. Measuring the
// reference detail and shipping half of it is how sakura came to have a quarter
// of its blossom round its feet with nobody noticing.
const SHIP_DETAIL = {
  oak: 0.9, beech: 0.9, birch: 0.85, pine: 0.85, spruce: 0.7,
  willow: 0.6, sakura: 0.75, palm: 1.0, dead: 0.9, kapok: 1, fig: 1,
};

console.log('  species  cover  base%  aspect  tris    leaf anchors by tenth of height, foot to crown');
{
  const badUpper = [], badBase = [], badCover = [], badAspect = [], underground = [];
  for (const id of A.SPECIES_IDS) {
    const det = SHIP_DETAIL[id];
    const want = WANT[id];
    const agg = new Array(BANDS).fill(0);
    let n = 0, cov = 0, covN = 0, baseSum = 0, aspSum = 0, triSum = 0, lowest = Infinity;
    for (const sd of SEEDS) {
      const p = A.buildPrototype(id, sd, { detail: det });
      const b = leafBands(p.leaf, p.height);
      for (let i = 0; i < BANDS; i++) agg[i] += b.h[i];
      n += b.n; triSum += p.triangles;
      aspSum += p.crownRadius / p.height;
      if (b.n) {
        baseSum += b.ymin / p.height;
        lowest = Math.min(lowest, b.lowVert);
        const c = crownCoverage(p, 300, sd);
        if (c != null) { cov += c; covN++; }
      }
    }
    const pct = n ? agg.map((c) => c / n * 100) : agg;
    const up = pct.slice(5).reduce((a, x) => a + x, 0) / 100;
    const baseF = n ? baseSum / SEEDS.length : 0;
    const asp = aspSum / SEEDS.length;
    const covF = covN ? cov / covN : null;
    console.log(`  ${id.padEnd(8)} ${covF == null ? '  -  ' : (covF * 100).toFixed(0).padStart(4) + '%'} `
      + `${(baseF * 100).toFixed(0).padStart(5)}  ${asp.toFixed(2).padStart(5)}  ${String(Math.round(triSum / SEEDS.length)).padStart(6)}  `
      + pct.map((v) => v.toFixed(0).padStart(3)).join(' ') + `   ${want ? want.note : 'bare'}`);
    if (!want) continue;                                  // dead has no leaves
    if (up < want.upper) badUpper.push(`${id} ${(up * 100).toFixed(0)}% wants ${(want.upper * 100).toFixed(0)}%`);
    if (baseF < want.base) badBase.push(`${id} ${(baseF * 100).toFixed(0)}% wants ${(want.base * 100).toFixed(0)}%`);
    if (covF != null && covF < want.cover) badCover.push(`${id} ${(covF * 100).toFixed(0)}% wants ${(want.cover * 100).toFixed(0)}%`);
    if (asp < want.aspect[0] || asp > want.aspect[1]) badAspect.push(`${id} ${asp.toFixed(2)} wants ${want.aspect.join(' to ')}`);
    if (lowest < A.LEAF_GROUND_CLEARANCE - 1e-6) underground.push(`${id} at y ${lowest.toFixed(2)} m`);
  }
  check('every species carries its leaves where its habit says it should',
    badUpper.length === 0, badUpper.join(', ') || 'measured over 4 seeds each, at the detail flora.js ships');
  check('no species has a leaf below its own bole', badBase.length === 0,
    badBase.join(', ') || 'every canopy starts above bare trunk');
  check('no leaf quad anywhere reaches under the ground', underground.length === 0,
    underground.join(', ') || `the lowest vertex of every species clears ${A.LEAF_GROUND_CLEARANCE} m`);
  check('leaves hide the branch scaffold from outside the crown', badCover.length === 0,
    badCover.join(', ') || '1,200 rays a species, fired inward at its own branches');
  check('every silhouette is the shape its species is meant to be', badAspect.length === 0,
    badAspect.join(', ') || 'crown radius over height, inside the band the brief asks for');
  check('dead is the one bare silhouette', A.buildPrototype('dead', 1).hasLeaves === false);
}

// The three bands have to agree about where the canopy is, or the tree changes
// shape as the player walks toward it, which is a LOD swap you can see.
//
// The mid band keeps one leaf in three, so it can be held to the tenth. The far
// band keeps 24 quads whatever grew, so one quad is 4.2 points of any tenth and
// asking it to match tenth by tenth would only be measuring the quantisation.
// It is held to the two numbers a silhouette at 140 m is actually made of:
// how much of the canopy is in the top half, and where the bottom of it is.
{
  const drift = [], farDrift = [];
  for (const id of A.SPECIES_IDS) {
    const p = A.buildPrototype(id, 4242, { detail: SHIP_DETAIL[id] });
    if (!p.hasLeaves) continue;
    const nearB = leafBands(A.leafForBand(p.leaf, A.LOD_BANDS[0]), p.height);
    const near = share(nearB);
    const mid = share(leafBands(A.leafForBand(p.leaf, A.LOD_BANDS[1]), p.height));
    let worst = 0;
    for (let i = 0; i < BANDS; i++) worst = Math.max(worst, Math.abs(near[i] - mid[i]));
    if (worst > 6) drift.push(`${id} mid off by ${worst.toFixed(0)} points`);
    const farB = leafBands(A.leafForBand(p.leaf, A.LOD_BANDS[2]), p.height);
    const dUp = Math.abs(upperHalf(nearB) - upperHalf(farB));
    // the middle of the canopy, not its lowest leaf: one quad in a hundred is
    // the bottom of a crown and 24 quads will not reliably contain it
    const dMid = Math.abs(median(nearB) - median(farB));
    if (dUp > 15 || dMid > 0.1) {
      farDrift.push(`${id} top half off by ${dUp.toFixed(0)} points, canopy middle off by ${(dMid * 100).toFixed(0)}% of its height`);
    }
  }
  check('the mid band draws the same canopy as the near band, tenth by tenth',
    drift.length === 0, drift.join(', ') || 'no tenth more than 6 points apart, every species');
  check('and the far band keeps the same silhouette on 24 quads',
    farDrift.length === 0, farDrift.join(', ') || 'top half within 15 points, canopy middle within a tenth of the height');
}

// And the other direction: the floors have to be load bearing, not decoration.
// crownBase is driven to three values on the same seed and the lowest leaf has
// to follow it every time, which is the difference between a rule and a comment.
{
  const keep = A.SPECIES.oak.crownBase;
  const lowestAt = (v) => {
    A.SPECIES.oak.crownBase = v;
    const p = A.buildPrototype('oak', 4242, { detail: 0.6 });
    const b = leafBands(p.leaf, p.height);
    // how much of the canopy is in the lowest two fifths, which is where a
    // crown that has slipped down its own trunk shows up
    return { f: b.ymin / p.height, vert: b.lowVert, low: b.h[0] + b.h[1] + b.h[2] + b.h[3] };
  };
  const none = lowestAt(-1), ship = lowestAt(keep), high = lowestAt(0.45);
  A.SPECIES.oak.crownBase = keep;
  check('the crown floor is load bearing: raise it and the canopy climbs, drop it and the leaves fall to the foot',
    none.f < ship.f - 0.03 && ship.f < high.f - 0.03,
    `lowest leaf at ${(none.f * 100).toFixed(0)}% of the height with no floor, `
    + `${(ship.f * 100).toFixed(0)}% as shipped, ${(high.f * 100).toFixed(0)}% at crownBase 0.45`);
  check('and it clears the lower crown as it rises',
    none.low > ship.low && ship.low > high.low,
    `${none.low} quads in the lowest two fifths with no floor, ${ship.low} as shipped, ${high.low} at crownBase 0.45`);
  check('the ground clearance holds even with the species floor taken away',
    none.vert >= A.LEAF_GROUND_CLEARANCE - 1e-6, `lowest vertex ${none.vert.toFixed(3)} m`);
  const back = lowestAt(keep);
  A.SPECIES.oak.crownBase = keep;
  check('and putting it back puts the crown back', back.f === ship.f);
}
// The same, on the species the bug was actually found in: put the spruce's
// leader back to the third of its height it used to be and the needles go
// straight back round its ankles, floor and all.
{
  const keepBole = A.SPECIES.spruce.bole, keepAp = A.SPECIES.spruce.apical, keepBase = A.SPECIES.spruce.crownBase;
  const now = leafBands(A.buildPrototype('spruce', 4242, { detail: 0.5 }).leaf,
    A.buildPrototype('spruce', 4242, { detail: 0.5 }).height);
  A.SPECIES.spruce.bole = 0.34; A.SPECIES.spruce.apical = 0.72; A.SPECIES.spruce.crownBase = 0;
  const then = A.buildPrototype('spruce', 4242, { detail: 0.5 });
  const old = leafBands(then.leaf, then.height);
  A.SPECIES.spruce.bole = keepBole; A.SPECIES.spruce.apical = keepAp; A.SPECIES.spruce.crownBase = keepBase;
  check('the old spruce really was upside down, and the new one is not',
    upperHalf(old) < 20 && upperHalf(now) > 30,
    `${upperHalf(old).toFixed(0)}% of the needles in the top half on the old leader, ${upperHalf(now).toFixed(0)}% on the new one`);
}
{
  // the audit has to catch a badly set up species, both ways
  const keep = A.SPECIES.oak.crownBase;
  A.SPECIES.oak.crownBase = 0.8;                   // a crown floating over bare limbs
  let threw = '';
  try { A.auditForestTypes(); } catch (e) { threw = e.message; }
  A.SPECIES.oak.crownBase = keep;
  check('audit throws on a crown that floats over bare limbs', threw.includes('bare limbs'), threw || 'it did not throw');
  const keep2 = A.SPECIES.birch.latDeep;
  delete A.SPECIES.birch.latDeep;
  let threw2 = '';
  try { A.auditForestTypes(); } catch (e) { threw2 = e.message; }
  A.SPECIES.birch.latDeep = keep2;
  check('audit throws on a species that does not say a silhouette number', threw2.includes('latDeep'), threw2 || 'it did not throw');
  check('audit is clean again', A.auditForestTypes() === true);
}

// Detail is a cost lever and nothing else. It used to multiply the leaf loop
// count, so a tree grown at detail 0.4 consumed a different number of random
// draws and every branch after the first leaf came out somewhere else: the
// shape a test measured at detail 1 was not the shape flora.js shipped. Every
// leaf is now still DRAWN and only some of them built, so the skeleton is the
// same tree and the leaves that survive are a subset of the full canopy.
{
  const a = A.buildPrototype('sakura', 11, { detail: 1 });
  const b = A.buildPrototype('sakura', 11, { detail: 0.4 });
  check('the same tree grows at every detail: the same axes, the same height, the same reach',
    a.axes === b.axes && Math.abs(a.height - b.height) < 0.01
    && Math.abs(a.crownRadius - b.crownRadius) < a.crownRadius * 0.06,
    `${a.axes} axes at both, ${a.height.toFixed(3)} m against ${b.height.toFixed(3)} m tall, `
    + `${a.crownRadius.toFixed(2)} m against ${b.crownRadius.toFixed(2)} m of reach; `
    + 'the rings are coarser, the skeleton is the same');
  // every leaf the low detail tree kept has to be a leaf the full tree grew, in
  // the same place, or the stream diverged after all
  const anchors = (g) => {
    const p = g.attributes.position, out = new Set();
    for (let q = 0; q < p.count / 4; q++) {
      const i = q * 4;
      out.add([(p.getX(i) + p.getX(i + 1)) / 2, (p.getY(i) + p.getY(i + 1)) / 2, (p.getZ(i) + p.getZ(i + 1)) / 2]
        .map((v) => v.toFixed(4)).join(','));
    }
    return out;
  };
  const full = anchors(a.leaf), lean = anchors(b.leaf);
  let missing = 0;
  for (const k of lean) if (!full.has(k)) missing++;
  check('and every leaf on the cheap tree is a leaf the full tree has, in the same place',
    missing === 0 && lean.size < full.size,
    `${lean.size} of ${full.size} leaves kept, ${missing} of them somewhere the full tree has none`);
  check('and it still buys back triangles', b.triangles < a.triangles * 0.7,
    `${Math.round(b.triangles)} against ${Math.round(a.triangles)}`);
  const ba = share(leafBands(a.leaf, a.height)), bb = share(leafBands(b.leaf, b.height));
  let worst = 0;
  for (let i = 0; i < BANDS; i++) worst = Math.max(worst, Math.abs(ba[i] - bb[i]));
  check('and the canopy is in the same place at both details', worst < 6, `worst tenth off by ${worst.toFixed(1)} points`);
}

// the axis cap is a hard stop, and what it cuts has to be the skirt and not
// the crown. Drive it: a species with far too many laterals to fit.
{
  const keep = A.SPECIES.oak.lat;
  A.SPECIES.oak.lat = 9;
  const p = A.buildPrototype('oak', 5, {});
  A.SPECIES.oak.lat = keep;
  const b = leafBands(p.leaf, p.height);
  check('a tree that runs out of axes still has a top', p.cappedAxes && upperHalf(b) > 40,
    `${p.axes} axes, cap hit, ${upperHalf(b).toFixed(0)}% of the leaves still in the top half`);
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
  // over a block, not one chunk: a chunk that falls in a clearing places nothing
  // at any density and would order the three by accident
  const over = (d) => {
    let n = 0;
    for (let cz = 0; cz < 8; cz++) for (let cx = 0; cx < 8; cx++) n += A.placeTrees('meadow', cx, cz, 64, 1, { density: d }).length;
    return n;
  };
  const open = over('Open'), nat = over('Natural'), dense = over('Dense');
  check('density orders Open < Natural < Dense', open < nat && nat < dense, `${open} / ${nat} / ${dense} over 64 chunks`);
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
  // A rejection must not shuffle the survivors: the reference draws every roll
  // before any rejection, and that is what makes a clearing a hole rather than
  // a different forest. Both filters are driven over a block of chunks rather
  // than one, because a meadow has clearings in it now and a single chunk that
  // happened to be one would prove nothing in either direction.
  let all = 0, clipped = 0, moved = 0, kept = 0, outside = 0;
  for (let cz = 0; cz < 8; cz++) for (let cx = 0; cx < 8; cx++) {
    const a = A.placeTrees('meadow', cx, cz, 64, 42017);
    const c = A.placeTrees('meadow', cx, cz, 64, 42017, { clearRadius: 220 });
    const survivors = a.filter((s) => Math.hypot(s.x, s.z) >= 220);
    if (JSON.stringify(c) !== JSON.stringify(survivors)) moved++;
    const k = A.placeTrees('meadow', cx, cz, 64, 42017, { keep: (x) => x > 240 });
    if (JSON.stringify(k) !== JSON.stringify(a.filter((s) => s.x > 240))) moved++;
    all += a.length; clipped += c.length; kept += k.length;
    outside += k.filter((s) => s.x <= 240).length;
  }
  check('clearRadius and keep remove trees without moving the rest',
    moved === 0, `${moved} of 128 filtered layouts came back reshuffled`);
  check('clearRadius actually cleared something', clipped < all, `${all - clipped} of ${all} removed`);
  check('a keep predicate filters, both ways',
    kept > 0 && kept < all && outside === 0, `${kept} of ${all} kept, ${outside} of them on the wrong side`);
}
{
  // mountain thins with height, and has to be shown to do all of it: full stand
  // below the rock line, thinning through the middle, bare above the snow line
  // Over a block of chunks, because one Open chunk of mountain can easily hold
  // no trees at all now that a stand is a place and not a fog.
  const at = (y) => {
    let n = 0;
    for (let cz = 0; cz < 8; cz++) for (let cx = 0; cx < 8; cx++) {
      n += A.placeTrees('mountain', cx, cz, 64, 42017, { density: 'Natural', heightAt: () => y }).length;
    }
    return n;
  };
  const ys = [0, 20, 46, 55, 62, 70, 78, 90];
  const n = ys.map(at);
  console.log('       mountain trees by ground height: ' + ys.map((y, i) => `${y}m ${n[i]}`).join(', '));
  check('the stand is full anywhere below the rock line', n[0] === n[1] && n[1] === n[2] && n[0] > 0,
    `${n[0]} trees over 64 chunks at 0, 20 and 46 m`);
  check('it only ever thins as the ground rises', n.every((v, i) => i === 0 || v <= n[i - 1]), n.join(' > '));
  check('it is bare at and above the snow line', n[6] === 0 && n[7] === 0, `${n[6]} at 78 m, ${n[7]} at 90 m`);
  check('halfway up, some trees are left', n[4] > 0 && n[4] < n[0], `${n[4]} at 62 m of ${n[0]} at 0 m`);
  check('a type with no thinByHeight ignores heightAt',
    A.placeTrees('meadow', 4, 4, 64, 42017, { heightAt: () => 900 }).length === A.placeTrees('meadow', 4, 4, 64, 42017).length);
  console.log(`       and the same run with the stands turned off: `
    + [0, 62, 90].map((y) => {
      let n = 0;
      for (let cz = 0; cz < 8; cz++) for (let cx = 0; cx < 8; cx++) {
        n += A.placeTrees('mountain', cx, cz, 64, 42017, { density: 'Natural', heightAt: () => y, stands: false }).length;
      }
      return `${y}m ${n}`;
    }).join(', '));
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
// Stands: whether a forest looks placed by a hand
//
// "doesnt feel organized" is not a number, so here are the numbers it turns
// into. A forest laid out by one fbm threshold has no stand edges, no
// clearings with a shape, and one density everywhere; the stand layer is
// measured against all three, and against the reference's own scatter, which is
// still one flag away (`stands: false`) so the difference is a measurement and
// not a memory.
console.log('\narbor: stands, clearings and edges');
{
  const SEED = 42017, N = 16;
  const spotsOver = (type, n = N, opts = {}) => {
    const out = [];
    for (let cz = 0; cz < n; cz++) for (let cx = 0; cx < n; cx++) out.push(...A.placeTrees(type, cx, cz, 64, SEED, opts));
    return out;
  };
  /** The share of a square of ground with no tree standing within `m` metres. */
  const openShare = (spots, lo, hi, m, step = 8) => {
    let open = 0, n = 0;
    for (let z = lo; z < hi; z += step) for (let x = lo; x < hi; x += step) {
      let best = Infinity;
      for (const p of spots) {
        const d = (p.x - x) ** 2 + (p.z - z) ** 2;
        if (d < best) best = d;
      }
      n++;
      if (Math.sqrt(best) > m) open++;
    }
    return open / n;
  };
  const rows = [];
  for (const id of ['meadow', 'boreal', 'sakura', 'desert', 'mountain', 'snow', 'beach']) {
    const on = spotsOver(id), off = spotsOver(id, N, { stands: false });
    const open = openShare(on, 100, 900, 25);
    const openFlat = openShare(off, 100, 900, 25);
    const inStand = on.filter((s) => s.standId).length;
    const stands = new Set(on.filter((s) => s.standId).map((s) => s.standId)).size;
    rows.push({ id, on: on.length, off: off.length, open, openFlat, inStand, stands });
    console.log(`  ${id.padEnd(9)} ${(on.length / (N * N)).toFixed(1).padStart(5)} trees a chunk `
      + `(the flat scatter was ${(off.length / (N * N)).toFixed(1).padStart(5)}), `
      + `${(inStand / Math.max(1, on.length) * 100).toFixed(0).padStart(3)}% of them in one of ${stands} stands, `
      + `${(open * 100).toFixed(0).padStart(3)}% of the ground has no tree within 25 m (flat: ${(openFlat * 100).toFixed(0)}%)`);
  }
  check('every biome has clearings in it: open ground with no tree within 25 m',
    rows.every((r) => r.open > 0.05), rows.map((r) => `${r.id} ${(r.open * 100).toFixed(0)}%`).join(', '));
  check('and the stands are what put them there, not the old scatter',
    rows.filter((r) => r.open > r.openFlat + 0.05).length >= 5,
    rows.map((r) => `${r.id} ${(r.open * 100).toFixed(0)}% against ${(r.openFlat * 100).toFixed(0)}%`).join(', '));
  check('a boreal is a wood and a meadow is not',
    rows.find((r) => r.id === 'boreal').on > rows.find((r) => r.id === 'meadow').on * 5,
    `${(rows.find((r) => r.id === 'boreal').on / (N * N)).toFixed(1)} trees a chunk against `
    + `${(rows.find((r) => r.id === 'meadow').on / (N * N)).toFixed(1)}`);
  check('and a desert is sparser than a meadow',
    rows.find((r) => r.id === 'desert').on < rows.find((r) => r.id === 'meadow').on,
    `${(rows.find((r) => r.id === 'desert').on / (N * N)).toFixed(1)} against ${(rows.find((r) => r.id === 'meadow').on / (N * N)).toFixed(1)}`);
  check('most trees stand in a stand rather than alone',
    rows.every((r) => r.inStand / r.on > 0.6), rows.map((r) => `${r.id} ${(r.inStand / r.on * 100).toFixed(0)}%`).join(', '));
  check('turning the stands off gives the reference\'s own even scatter back',
    rows.every((r) => r.off > r.on) && spotsOver('meadow', 4, { stands: false }).every((s) => s.standId === null),
    'every type places more trees and none of them in a stand');

  // The edge. A wood has to thin over about 30 m, not stop at a line.
  {
    const spots = spotsOver('boreal', 20);
    const S = A.standsFor('boreal');
    const cell = S.grove * 2.2;
    // distance from a tree to the rim of the stand it is in, in metres, read
    // back out of the cover the stand handed it: cover 1 is `edge` metres in
    // or more, cover 0 is the rim itself
    const edge = Math.min(A.STAND_EDGE, S.grove * 0.62 * 0.75);
    const bins = new Array(8).fill(0);
    for (const s of spots) {
      if (!s.standId) continue;
      const m = s.standCover * edge;                       // metres inside the rim
      bins[Math.min(7, Math.floor(m / 6))]++;
    }
    const rim = bins.slice(0, 2).reduce((a, x) => a + x, 0);
    const deep = bins.slice(5).reduce((a, x) => a + x, 0);
    console.log(`  a boreal stand thins over its last ${edge.toFixed(0)} m: trees by metres inside the rim, `
      + `0 to 48 in sixes: ${bins.join(' ')}`);
    check('a wood thins into open ground rather than stopping at a line',
      rim > 0 && deep > rim, `${rim} trees in the outer 12 m, ${deep} more than 30 m in`);
    check('the thinning runs over the 30 m the brief asks for, or the stand\'s own three quarters',
      edge >= 12 && edge <= A.STAND_EDGE, `${edge.toFixed(1)} m`);
  }

  // Old growth at the heart, saplings at the edge.
  {
    const spots = spotsOver('boreal', 20).filter((s) => s.standId);
    let heart = 0, hn = 0, rim = 0, rn = 0;
    for (const s of spots) {
      if (s.standCover > 0.8) { heart += s.scale; hn++; } else if (s.standCover < 0.3) { rim += s.scale; rn++; }
    }
    check('the old trees stand at the heart of a wood and the young ones at its edge',
      hn > 20 && rn > 20 && heart / hn > rim / rn + 0.1,
      `mean scale ${(heart / hn).toFixed(2)} over ${hn} trees at the heart, ${(rim / rn).toFixed(2)} over ${rn} at the rim`);
    check('and no tree is outside the reference\'s own scale range',
      spots.every((s) => s.scale >= 0.55 && s.scale <= 1.5));
  }

  // Hedgerows: a meadow is fields, and fields have lines of trees between them.
  {
    const byStand = new Map();
    for (const s of spotsOver('meadow', 22)) {
      if (!s.standId) continue;
      if (!byStand.has(s.standId)) byStand.set(s.standId, []);
      byStand.get(s.standId).push(s);
    }
    let lines = 0, copses = 0;
    for (const list of byStand.values()) {
      if (list.length < 4) continue;
      let mx = 0, mz = 0;
      for (const p of list) { mx += p.x; mz += p.z; }
      mx /= list.length; mz /= list.length;
      let sxx = 0, szz = 0, sxz = 0;
      for (const p of list) { const a = p.x - mx, b = p.z - mz; sxx += a * a; szz += b * b; sxz += a * b; }
      const tr = sxx + szz, det = sxx * szz - sxz * sxz;
      const root = Math.sqrt(Math.max(0, tr * tr / 4 - det));
      const ratio = Math.sqrt((tr / 2 + root) / Math.max(1e-6, tr / 2 - root));
      if (ratio > 2.4) lines++; else copses++;
    }
    check('a meadow grows hedgerow lines as well as copses', lines > 8 && copses > 8,
      `${lines} stands of four or more read as a line, ${copses} as a copse, measured off the point cloud`);
  }

  // Lone trees: at most one to a lattice square of open ground.
  {
    const S = A.standsFor('meadow');
    const spacing = A.spacingFor(A.FOREST_TYPES.meadow.density);
    const cells = Math.max(1, Math.round(S.lone / spacing));
    const square = cells * spacing;
    const lone = [];
    for (let cz = 0; cz < 22; cz++) for (let cx = 0; cx < 22; cx++) {
      for (const s of A.placeTrees('meadow', cx, cz, 64, SEED)) if (!s.standId) lone.push(s);
    }
    // binned in world metres, on the lattice the rule is written in
    const per = new Map();
    for (const s of lone) {
      const gi = Math.round((s.x - spacing * 0.5) / spacing);
      const gj = Math.round((s.z - spacing * 0.5) / spacing);
      const k = Math.floor(gi / cells) + ',' + Math.floor(gj / cells);
      per.set(k, (per.get(k) || 0) + 1);
    }
    const worst = Math.max(0, ...per.values());
    const area = (22 * 64) ** 2 / 1e4;                 // hectares
    console.log(`  ${lone.length} lone trees over ${(area).toFixed(0)} ha, `
      + `${(lone.length / area).toFixed(2)} a hectare, on a ${square} m lattice`);
    check(`no lattice square of open meadow holds more than one lone tree (${square} m squares)`,
      worst <= 1, `worst square holds ${worst}`);
    check('and that is fewer than one lone tree to every 60 m of open meadow',
      lone.length / area <= 1e4 / (60 * 60), `${(lone.length / area).toFixed(2)} a hectare against ${(1e4 / 3600).toFixed(2)}`);
    check('the lattice bites, both ways: a type with no lone trees puts none in the open',
      A.standsFor('ocean').lone === 0
      && A.placeTrees('boreal', 3, 3, 64, SEED).length > 0, 'ocean plants nothing anywhere');
  }

  // Determinism, because everything above is worthless if it moves.
  {
    const a = JSON.stringify(A.placeTrees('meadow', -7, 13, 64, SEED));
    const b = JSON.stringify(A.placeTrees('meadow', -7, 13, 64, SEED));
    check('a chunk of stands places identically every time', a === b, `${JSON.parse(a).length} trees`);
    check('and a different world seed lays the stands out differently',
      a !== JSON.stringify(A.placeTrees('meadow', -7, 13, 64, SEED + 1)));
    // a stand has to be the same stand from either side of a chunk line
    const S = A.standsFor('boreal');
    let seam = 0;
    for (let k = 0; k < 400; k++) {
      const x = 64 * 5 + (k % 20) * 3.2, z = 64 * 7 + Math.floor(k / 20) * 3.2;
      const one = A.standAt('boreal', x, z, SEED), two = A.standAt('boreal', x, z, SEED);
      if (one.id !== two.id || Math.abs(one.cover - two.cover) > 1e-12) seam++;
    }
    check('and standAt is a pure function of the place, so two chunks agree along their seam', seam === 0);
    check('a type with no stands has no cover anywhere',
      A.standAt('ocean', 100, 100, SEED).cover === 0 && A.standAt('ocean', 100, 100, SEED).id === null);
  }
  {
    const t0 = performance.now();
    for (let i = 0; i < 200; i++) A.placeTrees('boreal', 300 + i, 11, 64, SEED);
    const ms = (performance.now() - t0) / 200;
    check('a chunk of stands still places in under 1 ms', ms < 1, `${ms.toFixed(3)} ms`);
  }
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
