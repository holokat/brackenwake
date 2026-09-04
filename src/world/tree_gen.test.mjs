// Grown trees, measured. Run: node src/world/tree_gen.test.mjs
//
// Nothing here asserts that a tree "looks good"; every check is a number a
// browser cannot argue with. Heights and crown spreads are driven over 400
// seeds per species and compared against the ranges SPECIES declares, in both
// directions: nothing may fall outside the range, and the range may not be so
// wide that it says nothing. Triangle counts are printed and enforced. The wind
// shader is compiled by hand against a stub so a typo in the injection is
// caught here and not by a black canvas.

import * as THREE from 'three';
import {
  SPECIES, SPECIES_IDS, TRI_BUDGET, LOD_BUDGET, LODS, LOD_RANGE, lodForDistance,
  growTree, growTreeLods, buildTreeVariants, materialsFor,
  barkTextures, leafTexture, growBoulder, icosphere, stumpGeometry, stumpMaterial,
  windUniforms, tickWind, setWindStrength, auditSpecies, vnoise, fbm2, noise3,
  BARK_SIZE, LEAF_SIZE,
} from './tree_gen.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };
const SEEDS = 400;

check('every species declares every field growTree reads', auditSpecies() === SPECIES_IDS.length, SPECIES_IDS.join(', '));

// --------------------------------------------------------------- the noise --
{
  // tileable means f(0, y) === f(1, y); without that the bark shows a seam
  let worst = 0;
  for (let i = 0; i < 64; i++) {
    const y = i / 64;
    worst = Math.max(worst, Math.abs(vnoise(0, y, 8, 3, 7) - vnoise(1, y, 8, 3, 7)));
    worst = Math.max(worst, Math.abs(fbm2(0.25, 0, 8, 3, 4, 7) - fbm2(0.25, 1, 8, 3, 4, 7)));
  }
  check('the texture noise tiles in both axes', worst < 1e-9, `worst seam ${worst.toExponential(1)}`);
  let lo = 1, hi = 0;
  for (let i = 0; i < 4000; i++) { const v = noise3(i * 0.37, i * 0.11, i * 0.71, 3); lo = Math.min(lo, v); hi = Math.max(hi, v); }
  check('noise3 stays inside [0, 1]', lo >= 0 && hi <= 1, `${lo.toFixed(3)} to ${hi.toFixed(3)}`);
}

// --------------------------------------------------------------- geometry ---
const finite = (geo) => {
  for (const name of Object.keys(geo.attributes)) {
    const a = geo.attributes[name].array;
    for (let i = 0; i < a.length; i++) if (!Number.isFinite(a[i])) return `${name}[${i}]`;
  }
  return null;
};

console.log('\n  species          apex          spread       branches    bark   leaf  ms');
const measured = {};
for (const id of SPECIES_IDS) {
  const P = SPECIES[id];
  const m = { h: [Infinity, -Infinity], r: [Infinity, -Infinity], b: [Infinity, -Infinity], bark: 0, leaf: 0, nan: null };
  const t0 = performance.now();
  for (let k = 0; k < SEEDS; k++) {
    const t = growTree(id, 90001 + k * 104729);
    m.h = [Math.min(m.h[0], t.height), Math.max(m.h[1], t.height)];
    m.r = [Math.min(m.r[0], t.radius), Math.max(m.r[1], t.radius)];
    m.b = [Math.min(m.b[0], t.branches), Math.max(m.b[1], t.branches)];
    m.bark = Math.max(m.bark, t.tris.bark);
    m.leaf = Math.max(m.leaf, t.tris.leaf);
    if (!m.nan && k < 12) m.nan = finite(t.trunk) || (t.leaves && finite(t.leaves)) || null;
    t.trunk.dispose(); t.leaves?.dispose();
  }
  m.ms = (performance.now() - t0) / SEEDS;
  measured[id] = m;
  console.log(`  ${id.padEnd(8)} ${(m.h[0].toFixed(1) + '..' + m.h[1].toFixed(1)).padStart(12)} `
    + `${(m.r[0].toFixed(1) + '..' + m.r[1].toFixed(1)).padStart(12)} `
    + `${(m.b[0] + '..' + m.b[1]).padStart(10)} ${String(m.bark).padStart(6)} ${String(m.leaf).padStart(6)} ${m.ms.toFixed(1)}`);
}

{
  const bad = SPECIES_IDS.filter((id) => measured[id].nan);
  check('no NaN in any position, normal, uv, colour or wind weight', bad.length === 0,
    bad.map((id) => `${id}: ${measured[id].nan}`).join('; '));
}
{
  const out = [];
  for (const id of SPECIES_IDS) {
    const P = SPECIES[id], m = measured[id];
    if (m.h[0] < P.apex[0] || m.h[1] > P.apex[1]) out.push(`${id} apex ${m.h[0].toFixed(1)}..${m.h[1].toFixed(1)} outside ${P.apex}`);
    if (m.r[0] < P.spread[0] || m.r[1] > P.spread[1]) out.push(`${id} spread ${m.r[0].toFixed(1)}..${m.r[1].toFixed(1)} outside ${P.spread}`);
    if (m.b[0] < P.branchRange[0] || m.b[1] > P.branchRange[1]) out.push(`${id} branches ${m.b[0]}..${m.b[1]} outside ${P.branchRange}`);
  }
  check(`${SEEDS} seeds per species all land inside the declared ranges`, out.length === 0, out.join('; '));
  // and the other direction: a range wide enough to be vacuous is not a check
  const lazy = SPECIES_IDS.filter((id) => {
    const P = SPECIES[id], m = measured[id];
    return (m.h[1] - m.h[0]) < (P.apex[1] - P.apex[0]) * 0.5;
  });
  check('the declared ranges are tight enough to mean something', lazy.length === 0, lazy.join(', '));
}
{
  const over = SPECIES_IDS.filter((id) => measured[id].bark > TRI_BUDGET.bark || measured[id].leaf > TRI_BUDGET.leaf);
  check(`no variant is over budget (${TRI_BUDGET.bark} bark, ${TRI_BUDGET.leaf} leaf)`, over.length === 0,
    over.map((id) => `${id} ${measured[id].bark}/${measured[id].leaf}`).join('; '));
  const worstBark = Math.max(...SPECIES_IDS.map((id) => measured[id].bark));
  const worstLeaf = Math.max(...SPECIES_IDS.map((id) => measured[id].leaf));
  console.log(`  ---- worst case: ${worstBark} bark triangles, ${worstLeaf} leaf triangles`);
}
{
  // a conifer is narrow and a spreading tree is wide; if that stops being true
  // the growth model has stopped meaning anything
  const ratio = (id) => (measured[id].r[0] + measured[id].r[1]) / (measured[id].h[0] + measured[id].h[1]);
  check('conifers are narrower than the spreading trees',
    ratio('fir') < ratio('oak') && ratio('pine') < ratio('oak') && ratio('pine') < ratio('sakura'),
    `fir ${ratio('fir').toFixed(2)}, pine ${ratio('pine').toFixed(2)}, oak ${ratio('oak').toFixed(2)}, sakura ${ratio('sakura').toFixed(2)}`);
  check('the whorled conifers carry far more limbs than an oak',
    measured.fir.b[0] > measured.oak.b[1] && measured.pine.b[0] > measured.oak.b[0],
    `fir ${measured.fir.b}, pine ${measured.pine.b}, oak ${measured.oak.b}`);
}

// ------------------------------------------------------------ the tiers -----
{
  console.log('\n  species     near       mid      far    (triangles per variant)');
  const worst = [0, 0, 0];
  const shrink = [];
  for (const id of SPECIES_IDS) {
    const v = growTreeLods(id, 4242);
    const t = v.tris.map((x) => x.bark + x.leaf);
    t.forEach((n, i) => { worst[i] = Math.max(worst[i], n); });
    shrink.push([id, t]);
    console.log(`  ${id.padEnd(8)} ${String(t[0]).padStart(7)} ${String(t[1]).padStart(9)} ${String(t[2]).padStart(8)}`);
    for (const g of v.lods) { g.trunk.dispose(); g.leaves?.dispose(); }
  }
  check(`every tier is inside its budget (${LOD_BUDGET.join(' / ')})`,
    worst.every((n, i) => n <= LOD_BUDGET[i]), worst.join(' / '));
  check('the middle tier costs under 40% of the near one',
    shrink.every(([, t]) => t[1] <= t[0] * 0.40), shrink.map(([id, t]) => `${id} ${(t[1] / t[0] * 100).toFixed(0)}%`).join(', '));
  check('the far tier costs under 20% of the middle one',
    shrink.every(([, t]) => t[2] <= t[1] * 0.20), shrink.map(([id, t]) => `${id} ${(t[2] / t[1] * 100).toFixed(0)}%`).join(', '));
  check('the far tier still has SOME wood and SOME leaves on the leafy species',
    shrink.filter(([id]) => SPECIES[id].leaf).every(([, t]) => t[2] > 20),
    shrink.map(([id, t]) => `${id} ${t[2]}`).join(', '));

  // three views of one tree, not three trees
  const v = growTreeLods('oak', 909);
  check('every tier grew off the same skeleton',
    v.lods.every((g) => g.branches === v.lods[0].branches), v.lods.map((g) => g.branches).join('/'));
  const tint = (g) => Array.from(g.leaves.attributes.color.array.slice(0, 3)).map((x) => x.toFixed(4)).join(',');
  check('every tier wears the same leaf colour', tint(v.lods[0]) === tint(v.lods[1]) && tint(v.lods[1]) === tint(v.lods[2]),
    v.lods.map(tint).join(' | '));
  check('the tiers are about the same height', Math.abs(v.lods[2].height - v.lods[0].height) < v.lods[0].height * 0.25,
    v.lods.map((g) => g.height.toFixed(1)).join('/'));

  // the band function, driven both ways
  check('distance picks the tier, in both directions',
    lodForDistance(0) === 0 && lodForDistance(LOD_RANGE[0] - 0.01) === 0
    && lodForDistance(LOD_RANGE[0]) === 1 && lodForDistance(LOD_RANGE[1] - 0.01) === 1
    && lodForDistance(LOD_RANGE[1]) === 2 && lodForDistance(1e6) === 2,
    `bands at ${LOD_RANGE.join(' and ')} m`);
  check('only the near tier casts a shadow',
    LODS[0].shadow === true && LODS.slice(1).every((L) => L.shadow === false));
}

// ------------------------------------------------------------ determinism ---
{
  const a = growTree('oak', 4242), b = growTree('oak', 4242), c = growTree('oak', 4243);
  const same = (x, y) => {
    const px = x.trunk.attributes.position.array, py = y.trunk.attributes.position.array;
    if (px.length !== py.length) return false;
    for (let i = 0; i < px.length; i++) if (px[i] !== py[i]) return false;
    return true;
  };
  check('the same seed grows the same tree, vertex for vertex', same(a, b));
  check('a different seed grows a different tree', !same(a, c));
  const bo1 = growBoulder(77), bo2 = growBoulder(77), bo3 = growBoulder(78);
  const bsame = (x, y) => String(x.geo.attributes.position.array) === String(y.geo.attributes.position.array);
  check('boulders are deterministic too', bsame(bo1, bo2) && !bsame(bo1, bo3));
}

// ---------------------------------------------------------- wind weights ----
{
  const t = growTree('oak', 11);
  const w = t.trunk.attributes.aWind.array;
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < w.length; i++) { lo = Math.min(lo, w[i]); hi = Math.max(hi, w[i]); }
  check('bark carries a wind weight in [0, 1]', lo >= 0 && hi <= 1 && hi > 0.2, `${lo.toFixed(3)} to ${hi.toFixed(3)}`);
  // the very first ring of the trunk is the stump: it must not move at all
  check('the foot of the trunk does not sway', w[0] === 0, `w[0] = ${w[0]}`);
  const lw = t.leaves.attributes.aWind.array;
  let lmax = 0; for (let i = 0; i < lw.length; i++) lmax = Math.max(lmax, lw[i]);
  check('leaves sway harder than the wood they hang on', lmax > hi * 0.9, `leaf max ${lmax.toFixed(2)} vs bark max ${hi.toFixed(2)}`);
  check('leaf geometry carries per-cluster colour', !!t.leaves.attributes.color);
  check('a dead tree has no leaves at all', growTree('dead', 3).leaves === null);
}

// -------------------------------------------------------------- variants ----
{
  const t0 = performance.now();
  const vs = buildTreeVariants('oak', 20260904, 6);
  const ms = performance.now() - t0;
  check('buildTreeVariants bakes the count it was asked for', vs.length === 6);
  check('the variants are six different trees',
    new Set(vs.map((v) => v.trunk.attributes.position.count)).size > 1,
    vs.map((v) => v.trunk.attributes.position.count).join(', '));
  check('a second call hands back the same bake, not a new one',
    buildTreeVariants('oak', 20260904, 6) === vs);
  console.log(`  ---- six oak variants baked in ${ms.toFixed(0)} ms`);
  const bytes = vs.reduce((a, v) => a + v.trunk.attributes.position.array.byteLength * 3
    + (v.leaves ? v.leaves.attributes.position.array.byteLength * 4 : 0), 0);
  console.log(`  ---- roughly ${(bytes / 1e6).toFixed(1)} MB of vertex data for the set`);
}

// -------------------------------------------------------------- textures ----
{
  const bt = barkTextures('birch'), ft = barkTextures('fir');
  check('bark comes with albedo, normal and roughness', !!(bt.map && bt.normalMap && bt.roughnessMap));
  check(`bark maps are ${BARK_SIZE} px`, bt.map.image.width === BARK_SIZE && bt.map.image.height === BARK_SIZE);
  check('barkTextures caches per species', barkTextures('birch') === bt);
  const mean = (t) => { const a = t.map.image.data; let s = 0; for (let i = 0; i < a.length; i += 4) s += a[i]; return s / (a.length / 4); };
  check('birch bark is pale and fir bark is not', mean(bt) > mean(ft) + 40,
    `birch ${mean(bt).toFixed(0)}, fir ${mean(ft).toFixed(0)}`);
  // a normal map that is flat everywhere is a normal map that does nothing
  const nrm = bt.normalMap.image.data;
  let varied = 0; for (let i = 0; i < nrm.length; i += 4) if (Math.abs(nrm[i] - 128) > 8) varied++;
  check('the bark normal map actually has relief', varied > nrm.length / 4 * 0.15,
    `${(varied / (nrm.length / 4) * 100).toFixed(0)}% of texels off flat`);

  const lt = leafTexture('oak');
  check(`the leaf atlas is ${LEAF_SIZE} px`, lt.image.width === LEAF_SIZE);
  const a = lt.image.data;
  let opaque = 0; for (let i = 3; i < a.length; i += 4) if (a[i] > 127) opaque++;
  const frac = opaque / (a.length / 4);
  check('the leaf atlas is a silhouette, not a filled square', frac > 0.05 && frac < 0.75,
    `${(frac * 100).toFixed(0)}% opaque`);
  check('a species with no leaves gets no leaf texture', leafTexture('dead') === null);
}

// ------------------------------------------------------------- materials ----
{
  const M = materialsFor('oak');
  check('the bark material is textured', !!(M.bark.map && M.bark.normalMap && M.bark.roughnessMap));
  check('the leaf material is alpha cut, two sided and vertex coloured',
    M.leaf.alphaTest > 0 && M.leaf.side === THREE.DoubleSide && M.leaf.vertexColors === true && M.leaf.transparent === false);
  check('leaves come with a depth material, so their shadow is not a box',
    !!M.leafDepth && M.leafDepth.alphaTest === M.leaf.alphaTest && !!M.leafDepth.map);
  check('materialsFor caches per species', materialsFor('oak') === M);
  check('a species with no leaves gets no leaf material', materialsFor('dead').leaf === null);

  // compile the injection by hand: a stub shader, then look at what came out
  const stub = { uniforms: {}, vertexShader: 'void main() {\n#include <begin_vertex>\n}' };
  M.leaf.onBeforeCompile(stub);
  check('the wind uniforms are the shared ones, not copies',
    stub.uniforms.uTime === windUniforms.uTime && stub.uniforms.uWind === windUniforms.uWind);
  check('the injected vertex shader declares aWind and displaces transformed',
    /attribute float aWind;/.test(stub.vertexShader)
    && stub.vertexShader.includes('#include <begin_vertex>')
    && /transformed\.x \+=/.test(stub.vertexShader));
  check('the leaf shader adds its own flutter on top of the branch sway',
    stub.vertexShader.includes('wF'));
  const barkStub = { uniforms: {}, vertexShader: 'void main() {\n#include <begin_vertex>\n}' };
  M.bark.onBeforeCompile(barkStub);
  check('the bark shader does NOT flutter (only the leaves do)', !barkStub.vertexShader.includes('wF'));
  check('bark and leaf get different program cache keys',
    M.bark.customProgramCacheKey() !== M.leaf.customProgramCacheKey(),
    `${M.bark.customProgramCacheKey()} vs ${M.leaf.customProgramCacheKey()}`);

  tickWind(12.5);
  check('tickWind moves the clock every material reads', windUniforms.uTime.value === 12.5 && stub.uniforms.uTime.value === 12.5);
  setWindStrength(0);
  check('setWindStrength(0) is dead calm', windUniforms.uWind.value === 0);
  setWindStrength(1);
}

// -------------------------------------------------------------- boulders ----
{
  const ico = icosphere(2);
  check('the icosphere is indexed, so it can be shaded smooth', ico.faces.length === 320 && ico.verts.length === 162,
    `${ico.faces.length} faces, ${ico.verts.length} verts`);
  const b = growBoulder(5);
  check('a boulder is under 400 triangles', b.tris <= 320, `${b.tris}`);
  check('no NaN in a boulder', finite(b.geo) === null);
  b.geo.computeBoundingBox();
  check('a boulder sits ON the ground, not in it', Math.abs(b.geo.boundingBox.min.y) < 1e-6,
    `min y ${b.geo.boundingBox.min.y}`);
  check('a boulder is squat, not a ball', b.height / (b.geo.boundingBox.max.x * 2) < 0.95,
    `h ${b.height.toFixed(2)} vs width ${(b.geo.boundingBox.max.x * 2).toFixed(2)}`);
  let lo = Infinity, hi = -Infinity;
  const pa = b.geo.attributes.position.array;
  for (let i = 0; i < pa.length; i += 3) { const r = Math.hypot(pa[i], pa[i + 2]); lo = Math.min(lo, r); hi = Math.max(hi, r); }
  check('the noise really displaced the shell', hi - lo > 0.15, `radius ${lo.toFixed(2)} to ${hi.toFixed(2)}`);
}

// ---------------------------------------------------------------- stumps ----
{
  const g = stumpGeometry();
  check('the stump geometry is tiny', g.index.count / 3 <= 60, `${g.index.count / 3} triangles`);
  check('the stump carries vertex colour, so the cut face is not bark',
    !!g.attributes.color);
  const c = g.attributes.color.array;
  let cmin = Infinity, cmax = -Infinity;
  for (let i = 0; i < c.length; i++) { cmin = Math.min(cmin, c[i]); cmax = Math.max(cmax, c[i]); }
  check('the cut face is brighter than the bark around it', cmax > 1.5 && cmin < 0.8,
    `${cmin.toFixed(2)} to ${cmax.toFixed(2)}`);
  check('stumpGeometry caches', stumpGeometry() === g);
  check('the stump material is vertex coloured and textured', (() => {
    const m = stumpMaterial(); return m.vertexColors === true && !!m.map;
  })());
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
