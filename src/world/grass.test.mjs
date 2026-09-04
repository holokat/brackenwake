// Grass blades, measured. Run: node src/world/grass.test.mjs

import * as THREE from 'three';
import { createWorldField, BIOMES } from './field.js';
import {
  createGrass, clumpGeometry, grassTextures, TURF, TILE, RADIUS,
  BLADES_PER_TILE, COVER_PER_TILE, TILE_BUDGET, TILE_MS, MAX_TILES,
} from './grass.js';
import { windUniforms } from './tree_gen.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };
const f = createWorldField(20260904, { homeY: -0.3 });

// one case is never the case: a biome added to field.js with no turf entry
// would grow nothing and say nothing about it
{
  const missing = BIOMES.filter((b) => !TURF[b]);
  check('every biome in field.js has a turf entry', missing.length === 0, missing.join(', '));
  const bad = BIOMES.filter((b) => TURF[b] && (TURF[b].d == null || TURF[b].cover == null || TURF[b].col == null));
  check('every turf entry names a density, a cover density and a colour', bad.length === 0, bad.join(', '));
  check('the ocean has no turf', TURF.ocean.d === 0 && TURF.ocean.cover === 0);
  check('a meadow is thicker turf than a snowfield', TURF.meadow.d > TURF.snow.d * 5,
    `${TURF.meadow.d} vs ${TURF.snow.d}`);
}

// ------------------------------------------------------------- geometry -----
{
  const two = clumpGeometry(2), three = clumpGeometry(3);
  check('a two quad clump is 8 verts and 4 triangles',
    two.attributes.position.count === 8 && two.index.count / 3 === 4);
  check('a three quad clump is 12 verts and 6 triangles',
    three.attributes.position.count === 12 && three.index.count / 3 === 6);
  const w = two.attributes.aWind.array;
  let lo = Infinity, hi = -Infinity, atRoot = 0;
  const y = two.attributes.position.array;
  for (let i = 0; i < w.length; i++) {
    lo = Math.min(lo, w[i]); hi = Math.max(hi, w[i]);
    if (y[i * 3 + 1] === 0 && w[i] !== 0) atRoot++;
  }
  check('the wind weight runs 0 at the roots to 1 at the tips', lo === 0 && hi === 1, `${lo} to ${hi}`);
  check('no vertex on the ground moves', atRoot === 0, `${atRoot} roots would slide`);
}

// ------------------------------------------------------------- textures -----
{
  const { bladeTex, coverTex } = grassTextures();
  check('grassTextures caches', grassTextures().bladeTex === bladeTex);
  for (const [name, t] of [['blade', bladeTex], ['cover', coverTex]]) {
    const a = t.image.data;
    let opaque = 0;
    for (let i = 3; i < a.length; i += 4) if (a[i] > 127) opaque++;
    const frac = opaque / (a.length / 4);
    check(`the ${name} sprite is blades against nothing, not a filled square`,
      frac > 0.01 && frac < 0.6, `${(frac * 100).toFixed(1)}% opaque`);
  }
  const ca = coverTex.image.data, ba = bladeTex.image.data;
  const cov = (a) => { let n = 0; for (let i = 3; i < a.length; i += 4) if (a[i] > 127) n++; return n; };
  check('ground cover is a fuller clump than a grass tuft', cov(ca) > cov(ba), `${cov(ca)} vs ${cov(ba)}`);
}

// -------------------------------------------------- placement and slots -----
const parent = new THREE.Group();
const g = createGrass(parent, f, {});
const [blades, cover] = g.meshes;

{
  check('grass is two instanced meshes and no more', parent.children.length === 2);
  check('the instance buffers are sized to the tile budget',
    blades.count === cover.count / COVER_PER_TILE * BLADES_PER_TILE,
    `${blades.count} blade slots, ${cover.count} cover slots`);
  check('the meshes are not frustum culled (one mesh covers the whole ring)',
    blades.frustumCulled === false);
  check('the material is alpha cut, two sided and per instance coloured',
    blades.material.alphaTest > 0 && blades.material.side === THREE.DoubleSide
    && !!blades.instanceColor);
  // the class, not the case: three declares `attribute vec3 color` whenever a
  // material says vertexColors, and an unbound attribute reads as (0, 0, 0),
  // so any mesh that claims vertex colours it does not carry renders black
  const wrong = g.meshes.filter((m) => !!m.material.vertexColors !== !!m.geometry.attributes.color);
  check('no mesh claims vertex colours it does not carry', wrong.length === 0,
    wrong.map((m) => m.name).join(', '));
}

// the shader injection, compiled by hand against a stub
{
  const stub = { uniforms: {}, vertexShader: 'void main() {\n#include <begin_vertex>\n}' };
  blades.material.onBeforeCompile(stub);
  check('the blade shader shares the one wind clock with the leaves',
    stub.uniforms.uTime === windUniforms.uTime && stub.uniforms.uWind === windUniforms.uWind);
  check('it declares aWind, sways, and fades with camera distance',
    /attribute float aWind;/.test(stub.vertexShader)
    && /transformed\.x \+= sin/.test(stub.vertexShader)
    && /cameraPosition/.test(stub.vertexShader)
    && /transformed\.y \*= gFade/.test(stub.vertexShader));
  check('the fade uniforms are real numbers, not undefined',
    Number.isFinite(stub.uniforms.uFadeStart.value) && stub.uniforms.uFadeEnd.value === RADIUS,
    `${stub.uniforms.uFadeStart.value} to ${stub.uniforms.uFadeEnd.value}`);
}

// find open meadow to stand in
let home = null;
for (let cz = -60; cz <= 60 && !home; cz++) for (let cx = -60; cx <= 60; cx++) {
  if (f.biomeAt((cx + 0.5) * 64, (cz + 0.5) * 64) === 'meadow') { home = [(cx + 0.5) * 64, (cz + 0.5) * 64]; break; }
}

const m4 = new THREE.Matrix4(), p = new THREE.Vector3(), s = new THREE.Vector3();
const live = () => {
  const out = [];
  for (const mesh of g.meshes) {
    for (let i = 0; i < mesh.count; i++) {
      mesh.getMatrixAt(i, m4);
      s.setFromMatrixScale(m4);
      if (s.y > 1e-6) { p.setFromMatrixPosition(m4); out.push({ x: p.x, y: p.y, z: p.z }); }
    }
  }
  return out;
};

{
  let worst = 0, first = 0, frames = 0;
  while (g.queued || frames < 5) {
    const t = performance.now();
    g.update(1000 + frames * 16, home[0], home[1]);
    const ms = performance.now() - t;
    if (frames === 0) first = ms; else worst = Math.max(worst, ms);
    if (++frames > 400) break;
  }
  console.log(`  filled the ring in ${frames} frames, first frame ${first.toFixed(2)} ms `
    + `(it lays out the whole ring), steady worst ${worst.toFixed(2)} ms, `
    + `at most ${TILE_BUDGET} tiles or ${TILE_MS} ms a frame`);
  const l = live();
  console.log(`  ${l.length} blades and clumps standing, ${g.stats.tiles} tiles`);
  check('a meadow around the player is thick with blades', l.length > 3000, `${l.length}`);
  check('after the first frame no frame of tiling costs more than 2 ms', worst < 2, `${worst.toFixed(2)} ms`);
  check('even the first frame, which plans the whole ring, is under 6 ms', first < 6, `${first.toFixed(2)} ms`);
  // a tile is kept if its CENTRE is inside the ring, so a blade may stand up
  // to half a tile diagonal past it
  const reach = RADIUS + TILE * 1.62;
  check('nothing stands further out than the ring plus a tile',
    l.every((b) => Math.hypot(b.x - home[0], b.z - home[1]) <= reach),
    `worst ${Math.max(...l.map((b) => Math.hypot(b.x - home[0], b.z - home[1]))).toFixed(1)} m of ${reach.toFixed(1)}`);
  // the blades stand ON the ground: each one asked the field for its own
  // height, so there is nothing left to interpolate wrong
  let worstDrop = 0;
  for (const b of l) worstDrop = Math.max(worstDrop, Math.abs(b.y - (f.heightAt(b.x, b.z) - 0.05)));
  check('every blade stands exactly on the field, to the millimetre',
    worstDrop < 0.001, `worst ${(worstDrop * 1000).toFixed(2)} mm`);
  let wet = 0, road = 0;
  for (const b of l) {
    const sp = f.sampleAt(b.x, b.z);
    if (sp.water || sp.river > 0.25) wet++;
    if (sp.road > 0.30) road++;
  }
  check('no grass in the water', wet === 0, `${wet}`);
  check('no grass down the middle of a road', road === 0, `${road}`);
}

// walking: tiles are recycled, not rebuilt from nothing
{
  const before = g.stats.filled;
  const l0 = live().length;
  for (let i = 0; i < 200; i++) g.update(20000 + i * 16, home[0] + TILE * 1.2, home[1]);
  const filledAfterOneTile = g.stats.filled - before;
  check(`walking one tile refills only the tiles that changed, not all ${MAX_TILES}`,
    filledAfterOneTile > 0 && filledAfterOneTile < MAX_TILES * 0.3, `${filledAfterOneTile} tiles refilled`);
  const l1 = live().length;
  check('the ring stays about as full while walking', Math.abs(l1 - l0) / l0 < 0.25, `${l0} then ${l1}`);
  check('the slot pool never overflows', g.stats.tiles <= MAX_TILES, `${g.stats.tiles} tiles live of ${MAX_TILES}`);
  // walk back: the same ground grows the same blades
  for (let i = 0; i < 300; i++) g.update(40000 + i * 16, home[0], home[1]);
  const there = live();
  const key = (b) => `${b.x.toFixed(3)},${b.z.toFixed(3)}`;
  const setA = new Set(there.map(key));
  for (let i = 0; i < 300; i++) g.update(60000 + i * 16, home[0] + TILE * 3, home[1] + TILE * 3);
  for (let i = 0; i < 300; i++) g.update(80000 + i * 16, home[0], home[1]);
  const back = live();
  const same = back.filter((b) => setA.has(key(b))).length;
  check('walking away and back grows the same blades in the same places',
    back.length > 0 && same / back.length > 0.99, `${same} of ${back.length} identical`);
}

// the ocean grows nothing, which is the other direction on the turf table
{
  let sea = null;
  for (let cz = -60; cz <= 60 && !sea; cz++) for (let cx = -60; cx <= 60; cx++) {
    if (f.biomeAt((cx + 0.5) * 64, (cz + 0.5) * 64) === 'ocean'
      && f.biomeAt(cx * 64 + 8, cz * 64 + 8) === 'ocean') { sea = [(cx + 0.5) * 64, (cz + 0.5) * 64]; break; }
  }
  for (let i = 0; i < 400; i++) g.update(100000 + i * 16, sea[0], sea[1]);
  const l = live();
  const near = l.filter((b) => Math.hypot(b.x - sea[0], b.z - sea[1]) < RADIUS);
  // a blade may legitimately stand on a spit of beach inside the ring; what it
  // may never do is stand on the water itself
  const afloat = near.filter((b) => { const sp = f.sampleAt(b.x, b.z); return sp.water || sp.biome === 'ocean'; });
  check('standing at sea, not one blade is growing out of the water', afloat.length === 0,
    `${afloat.length} afloat of ${near.length} within the ring`);
}

g.dispose();
check('dispose takes both meshes out of the scene', parent.children.length === 0, `${parent.children.length}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
