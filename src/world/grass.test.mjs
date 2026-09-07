// Grass blades, measured. Run: node src/world/grass.test.mjs
//
// The three claims this file exists to prove, because all three were guesses
// before it:
//
//   1. grass is THERE before you arrive. The ring is 80 m and the fade holds
//      full height to 62.4 m, a tile inside 40 m is never bare for more than a
//      frame or two at a dead run, and a teleport fills the inner disc in one
//      synchronous call rather than over a second and a half.
//   2. a blade is lit like the ground it stands in. Its normal is up, on both
//      faces, and its sprite starts light at the root.
//   3. none of that cost anything. Two draw calls, the same slot arithmetic,
//      and a per frame budget that never starts more than TILE_BUDGET tiles.
//
// A NOTE ON THE CLOCK. Wall clock numbers are printed, not asserted, wherever
// one field.sampleAt can dominate them: sampleAt builds a road cell on its
// first touch, and on a loaded machine a single tile fill has been seen at
// 100 ms and at 0.4 ms in two runs of the same script. What this file asserts
// about cost is what this file controls: how many tiles a frame starts.

import * as THREE from 'three';
import { createWorldField, BIOMES } from './field.js';
import {
  createGrass, clumpGeometry, grassTextures, spriteLuminance, auditGrass, ringCounts,
  fillBudgetMs, bandAt, TURF, TILE, RADIUS, NEAR, BLADES_PER_TILE, COVER_PER_TILE,
  OUTER_FILL, TILE_MS, TILE_MS_MAX, TILE_BUDGET, CATCHUP_QUEUE,
  NEAR_TILES, OUTER_TILES, MAX_TILES, PREFILL_R, FADE_IN_S, BLADE_BASE_L,
} from './grass.js';
import { windUniforms, tickWind } from './tree_gen.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };
const f = createWorldField(20260904, { homeY: -0.3 });

// ------------------------------------------------------------ the turf table
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

  // the audit runs at module load; drive it both ways rather than trusting that
  const ok = auditGrass(BIOMES);
  check('auditGrass passes on the real biome list', !!ok && ok.near > 0,
    `near ${ok.near} of ${ok.nearPool}, outer ${ok.outer} of ${ok.outerPool}`);
  let threw = '';
  try { auditGrass([...BIOMES, 'tundra']); } catch (e) { threw = e.message; }
  check('and throws the moment a biome has no turf', threw.includes('tundra'), threw || 'it did not throw');
}

// -------------------------------------------------------------- slot pools --
// "count the slots before adding to a container". The pools are not estimated
// from the area of a disc: how many tile CENTRES land inside one depends on
// where in its own tile the player stands, so the peak is brute forced.
{
  const want = ringCounts(48);
  console.log(`  the ring wants at most ${want.near} near tiles and ${want.outer} outer, ${want.total} in all`);
  check('the near pool holds every near tile the ring can want', NEAR_TILES >= want.near,
    `${NEAR_TILES} slots for ${want.near} tiles`);
  check('and the outer pool every outer one', OUTER_TILES >= want.outer,
    `${OUTER_TILES} slots for ${want.outer} tiles`);
  check('the peak does not move when the offsets are sampled four times finer',
    JSON.stringify(ringCounts(12)) === JSON.stringify(ringCounts(48)), JSON.stringify(want));
  check('the near band really is only part of the ring', NEAR < RADIUS && want.outer > want.near,
    `${NEAR} m of ${RADIUS} m`);
}

// ---------------------------------------------------------------- budget ----
// The budget is a curve, so drive it at both ends rather than describing it.
{
  check('a calm frame with nothing waiting spends the calm budget', fillBudgetMs(0) === TILE_MS, `${fillBudgetMs(0)} ms`);
  check('a frame with a full backlog spends the catch up budget', fillBudgetMs(CATCHUP_QUEUE) === TILE_MS_MAX, `${fillBudgetMs(CATCHUP_QUEUE)} ms`);
  check('and an absurd backlog buys not one millisecond more', fillBudgetMs(100000) === TILE_MS_MAX);
  check('halfway is halfway', Math.abs(fillBudgetMs(CATCHUP_QUEUE / 2) - (TILE_MS + TILE_MS_MAX) / 2) < 1e-9,
    `${fillBudgetMs(CATCHUP_QUEUE / 2).toFixed(2)} ms`);
  check('the curve rises with the backlog and never falls',
    [0, 5, 20, 40, 61, 200].every((q, i, a) => i === 0 || fillBudgetMs(q) >= fillBudgetMs(a[i - 1])));
  check('a tile just inside NEAR is near and just outside is outer',
    bandAt(NEAR - 0.01) === 'near' && bandAt(NEAR + 0.01) === 'outer');
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

  // THE FIX FOR "DARK". A card normal points sideways and gets almost nothing
  // from a sun overhead; the back face, whose normal three flips for
  // DoubleSide, gets less than nothing. Every blade takes the ground's normal.
  for (const [name, geo] of [['blades', two], ['cover', three]]) {
    const n = geo.attributes.normal.array;
    let wrong = 0;
    for (let i = 0; i < n.length; i += 3) if (n[i] !== 0 || n[i + 1] !== 1 || n[i + 2] !== 0) wrong++;
    check(`every ${name} vertex carries the ground's normal, straight up`, wrong === 0,
      `${wrong} of ${n.length / 3} still point sideways`);
  }
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

  // the other half of "dark": the sprite itself. The root used to be 0.55.
  const lum = spriteLuminance(bladeTex);
  console.log(`  blade sprite mean luminance ${lum.toFixed(3)} (sRGB byte), root ${BLADE_BASE_L}`);
  check('the blade sprite reads as grass in sun, not grass in shade', lum > 0.85 && BLADE_BASE_L >= 0.75,
    `${lum.toFixed(3)}`);
  // and no lit pixel of it is dark, which is what a 0.55 root looked like once
  // the instance colour had multiplied it down again
  let darkest = 1;
  for (let i = 0; i < ba.length; i += 4) if (ba[i + 3] > 200) darkest = Math.min(darkest, ba[i] / 255);
  check('and not one lit pixel of it is dark', darkest > 0.55, `darkest lit pixel ${darkest.toFixed(3)}`);
}

// -------------------------------------------------- placement and slots -----
const parent = new THREE.Group();
const g = createGrass(parent, f, {});
const [blades, cover] = g.meshes;

{
  check('grass is two instanced meshes and no more', parent.children.length === 2);
  const cap = g.capacity;
  const bl = cap.instances.find((i) => i.name === 'blades');
  const cv = cap.instances.find((i) => i.name === 'cover');
  console.log(`  ${bl.total} blade slots and ${cv.total} cover slots `
    + `(${cap.nearTiles} near tiles of ${bl.per}, ${cap.outerTiles} outer of ${bl.outerPer})`);
  check('the instance buffers are the two pools added up, not a guess',
    blades.count === cap.nearTiles * bl.per + cap.outerTiles * bl.outerPer
    && cover.count === cap.nearTiles * cv.per + cap.outerTiles * cv.outerPer,
    `${blades.count} blade slots, ${cover.count} cover slots`);
  check('an outer tile really is coarser than a near one',
    bl.outerPer === Math.max(1, Math.round(BLADES_PER_TILE * OUTER_FILL)) && bl.outerPer < bl.per
    && cv.per === COVER_PER_TILE,
    `${bl.outerPer} of ${bl.per}`);
  check('the meshes are not frustum culled (one mesh covers the whole ring)',
    blades.frustumCulled === false);
  check('the material is alpha cut, two sided and per instance coloured',
    blades.material.alphaTest > 0 && blades.material.side === THREE.DoubleSide
    && !!blades.instanceColor);
  check('the blades receive shadow and cast none', blades.receiveShadow === true && blades.castShadow === false);
  check('every instance carries a birth time, so a tile can grow in',
    blades.geometry.attributes.aBorn?.count === blades.count
    && cover.geometry.attributes.aBorn?.count === cover.count);
  // the class, not the case: three declares `attribute vec3 color` whenever a
  // material says vertexColors, and an unbound attribute reads as (0, 0, 0),
  // so any mesh that claims vertex colours it does not carry renders black
  const wrong = g.meshes.filter((m) => !!m.material.vertexColors !== !!m.geometry.attributes.color);
  check('no mesh claims vertex colours it does not carry', wrong.length === 0,
    wrong.map((m) => m.name).join(', '));
}

// the shader injection, compiled by hand against a stub
{
  const stub = {
    uniforms: {},
    vertexShader: 'void main() {\n#include <begin_vertex>\n}',
    fragmentShader: 'void main() {\n#include <clipping_planes_fragment>\n#include <normal_fragment_begin>\n}',
  };
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
    `${stub.uniforms.uFadeStart.value.toFixed(1)} to ${stub.uniforms.uFadeEnd.value}`);
  check('full height holds well past where a runner is looking',
    stub.uniforms.uFadeStart.value > 55, `${stub.uniforms.uFadeStart.value.toFixed(1)} m`);
  check('a new tile grows in over FADE_IN_S rather than popping',
    /attribute float aBorn;/.test(stub.vertexShader)
    && /uTime - aBorn/.test(stub.vertexShader)
    && stub.uniforms.uFadeIn.value === FADE_IN_S,
    `${stub.uniforms.uFadeIn.value} s`);
  check('and the grow in is a screen space dither, so nothing has to be sorted',
    /varying float vGrow;/.test(stub.fragmentShader) && /discard;/.test(stub.fragmentShader));
  // THE OTHER HALF OF THE DARK FIX. Geometry normals alone are not enough:
  // three flips the normal on the back face of a DoubleSided material, so the
  // fragment stage has to put it back or half of every clump is lit from below.
  check('the fragment stage un-flips the normal, so no face of a clump goes dark',
    /normal = normalize\( vNormal \);/.test(stub.fragmentShader));
}

// THE STUB IS NOT THE SHADER. Every injection above is a string replace against
// a chunk name, and a chunk name three does not use any more replaces nothing,
// silently, and the grass ships dark with a green test. So run the same
// onBeforeCompile over three's OWN MeshStandardMaterial source and check that
// the injections landed in it.
{
  const src = THREE.ShaderLib.physical;
  check('three\'s standard material really has the chunks this file injects into',
    src.vertexShader.includes('#include <begin_vertex>')
    && src.fragmentShader.includes('#include <clipping_planes_fragment>')
    && src.fragmentShader.includes('#include <normal_fragment_begin>'));
  const real = { uniforms: {}, vertexShader: src.vertexShader, fragmentShader: src.fragmentShader };
  blades.material.onBeforeCompile(real);
  check('the wind, the fade and the grow in land in the real vertex shader',
    real.vertexShader.includes('attribute float aBorn;')
    && real.vertexShader.includes('transformed.y *= gFade')
    && real.vertexShader.includes('vGrow = gGrow;')
    && real.vertexShader.length > src.vertexShader.length);
  check('the dither and the normal both land in the real fragment shader',
    real.fragmentShader.includes('if (gH > vGrow) discard;')
    && real.fragmentShader.includes('normal = normalize( vNormal );'));
  check('and the un-flip comes AFTER three\'s own faceDirection flip, or it would do nothing',
    real.fragmentShader.indexOf('normal = normalize( vNormal );')
      > real.fragmentShader.indexOf('#include <normal_fragment_begin>'));
  // vNormal only exists when the material is NOT flat shaded, and three's own
  // chunk is where that is decided. A flat shaded grass material would not
  // just look wrong, it would fail to compile on the line injected above.
  check('three declares vNormal for a smooth shaded material, which is what the un-flip reads',
    THREE.ShaderChunk.normal_pars_fragment.includes('varying vec3 vNormal')
    && THREE.ShaderChunk.normal_fragment_begin.includes('normal *= faceDirection;'));
  check('and the grass materials are smooth shaded, so vNormal is there for them',
    g.meshes.every((m) => !m.material.flatShading));
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
      if (s.y > 1e-6) { p.setFromMatrixPosition(m4); out.push({ x: p.x, y: p.y, z: p.z, s: s.y }); }
    }
  }
  return out;
};
/** Every tile centre inside `r` of (x, z), and which of them the tiler has grown. */
function coverage(x, z, r) {
  const keys = g.activeKeys();
  const cx = Math.floor(x / TILE), cz = Math.floor(z / TILE);
  const span = Math.ceil(r / TILE) + 1;
  const missing = [];
  let want = 0;
  for (let dz = -span; dz <= span; dz++) for (let dx = -span; dx <= span; dx++) {
    const tx = cx + dx, tz = cz + dz;
    if (Math.hypot((tx + 0.5) * TILE - x, (tz + 0.5) * TILE - z) > r) continue;
    want++;
    if (!keys.has(tx + ',' + tz)) missing.push(tx + ',' + tz);
  }
  return { want, have: want - missing.length, missing };
}

// ------------------------------------------------------ arriving from cold ---
// The whole point of the prefill: the FIRST frame the player exists has grass
// on it. The old code took 65 frames to lay the ring and the middle of it came
// in a handful of tiles at a time.
{
  g.update(1000, home[0], home[1]);
  const c = coverage(home[0], home[1], PREFILL_R);
  console.log(`  the first update prefilled ${g.stats.lastPrefillTiles} tiles in `
    + `${g.stats.lastPrefillMs.toFixed(1)} ms (a cold sampleAt, so a ceiling not a typical)`);
  check('the inner disc is complete on the very first frame', c.missing.length === 0,
    `${c.have} of ${c.want} tiles inside ${PREFILL_R} m`);
  check('and it took exactly one prefill to do it', g.stats.prefills === 1, `${g.stats.prefills}`);

  let frames = 1;
  while (g.queued && frames < 400) { g.update(1000 + frames * 16, home[0], home[1]); frames++; }
  const l = live();
  console.log(`  the rest of the ${RADIUS} m ring filled in ${frames} frames, `
    + `${g.stats.tiles} tiles (${g.stats.near} near, ${g.stats.outer} outer), ${l.length} blades standing`);
  check('a meadow around the player is thick with blades', l.length > 3000, `${l.length}`);
  check('no frame started more tiles than the budget allows',
    g.stats.maxFrameTiles <= TILE_BUDGET, `${g.stats.maxFrameTiles} of ${TILE_BUDGET}`);
  check('the whole ring is up in under two seconds of frames', frames < 120, `${frames} frames`);

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

  // the coarse band, on the ground rather than in the table
  const near = l.filter((b) => Math.hypot(b.x - home[0], b.z - home[1]) < NEAR - TILE);
  const far = l.filter((b) => Math.hypot(b.x - home[0], b.z - home[1]) > NEAR + TILE);
  const dNear = near.length / (Math.PI * (NEAR - TILE) ** 2);
  const dFar = far.length / (Math.PI * (RADIUS ** 2 - (NEAR + TILE) ** 2));
  console.log(`  ${(dNear * 100).toFixed(1)} blades per 100 m2 inside ${NEAR} m, `
    + `${(dFar * 100).toFixed(1)} outside it`);
  check('the outer band really is thinner on the ground', dFar < dNear * 0.7,
    `${dFar.toFixed(3)} against ${dNear.toFixed(3)} per m2`);
  const avgNear = near.reduce((a, b) => a + b.s, 0) / Math.max(1, near.length);
  const avgFar = far.reduce((a, b) => a + b.s, 0) / Math.max(1, far.length);
  check('and its clumps are bigger, so the turf still reads as cover',
    avgFar > avgNear * 1.3, `${avgFar.toFixed(2)} m tall out there against ${avgNear.toFixed(2)} m in close`);
  check('every tile beyond NEAR is banded outer and every one inside is near',
    [...g.activeKeys()].every((k) => {
      const [tx, tz] = k.split(',').map(Number);
      const d = Math.hypot((tx + 0.5) * TILE - home[0], (tz + 0.5) * TILE - home[1]);
      return g.bandOf(k) === bandAt(d);
    }));
}

// ------------------------------------------------------------- the run ------
// 20 m/s for 10 s at 60 fps, which is the case the user was complaining about.
// The claim is a number of frames, so count frames.
{
  const DT = 1 / 60, SPEED = 20, FRAMES = 600;
  let x = home[0];
  const z = home[1];
  const missingSince = new Map();
  let worstGap = 0, worstTile = '', worstTilesInAFrame = 0;
  const prefills = g.stats.prefills;
  let minFrac = 1, sum = 0;
  for (let fr = 0; fr < FRAMES; fr++) {
    x += SPEED * DT;
    g.update(30000 + fr * 16, x, z);
    worstTilesInAFrame = Math.max(worstTilesInAFrame, g.stats.lastFrameTiles);
    const c = coverage(x, z, PREFILL_R);
    const gone = new Set(c.missing);
    for (const k of gone) if (!missingSince.has(k)) missingSince.set(k, fr);
    for (const k of [...missingSince.keys()]) {
      if (!gone.has(k)) { missingSince.delete(k); continue; }
      const gap = fr - missingSince.get(k) + 1;
      if (gap > worstGap) { worstGap = gap; worstTile = k; }
    }
    const frac = c.have / c.want;
    minFrac = Math.min(minFrac, frac); sum += frac;
  }
  console.log(`  running ${SPEED} m/s for ${(FRAMES * DT).toFixed(0)} s: the inner ${PREFILL_R} m held `
    + `${(minFrac * 100).toFixed(1)}% at worst, ${(sum / FRAMES * 100).toFixed(1)}% on average`);
  console.log(`  worst wait for any tile inside ${PREFILL_R} m: ${worstGap} frame(s)`
    + `${worstTile ? ` (${worstTile})` : ''}; busiest frame started ${worstTilesInAFrame} tiles; `
    + `${g.stats.rebanded} tiles re-banded`);
  check('no tile inside the inner disc is ever bare for more than 3 frames', worstGap <= 3,
    `worst ${worstGap} frames`);
  check('and the disc never drops below 95% filled', minFrac > 0.95, `${(minFrac * 100).toFixed(1)}%`);
  check('a plain run never trips the teleport prefill', g.stats.prefills === prefills,
    `${g.stats.prefills - prefills} prefills during the run`);
  check('no frame of the run started more tiles than the budget allows',
    worstTilesInAFrame <= TILE_BUDGET, `${worstTilesInAFrame} of ${TILE_BUDGET}`);
  check('the pools never ran dry', g.stats.starved === 0, `${g.stats.starved} starved`);
  // rebanding is the price of a coarse outer band; it should be paid, and it
  // should be small
  check('tiles crossing the band line were re-grown rather than left coarse', g.stats.rebanded > 0,
    `${g.stats.rebanded}`);
}

// ------------------------------------------------------------ the teleport ---
// A dungeon exit or a dev bench Teleport. The old code showed a bare ring and
// filled it over about a second; this fills the inner disc before the frame is
// drawn, and says how long it took.
{
  // A long way from home, but still ON the continent: the world is bounded now
  // (src/world/zones.js) and chunk 200 is 12.8 km out, which is open ocean and
  // has no meadow in it at all. 60 to 118 is 3.8 to 7.6 km, the outer half of
  // the land.
  let far = null;
  for (let cz = 60; cz <= 118 && !far; cz++) for (let cx = 60; cx <= 118; cx++) {
    if (f.biomeAt((cx + 0.5) * 64, (cz + 0.5) * 64) === 'meadow') { far = [(cx + 0.5) * 64, (cz + 0.5) * 64]; break; }
  }
  if (!far) throw new Error('grass.test: no meadow chunk found on the far half of the continent');
  const before = g.stats.prefills;
  g.update(60000, far[0], far[1]);
  const c = coverage(far[0], far[1], PREFILL_R);
  console.log(`  teleported ${(Math.hypot(far[0] - home[0], far[1] - home[1]) / 1000).toFixed(1)} km: `
    + `${g.stats.lastPrefillTiles} tiles prefilled in ${g.stats.lastPrefillMs.toFixed(1)} ms`);
  check('a jump of more than a tile prefills', g.stats.prefills === before + 1);
  check('and the inner disc has grass on it the same frame', c.missing.length === 0,
    `${c.have} of ${c.want} tiles`);
  check('the prefill really did the work, rather than the frame budget',
    g.stats.lastPrefillTiles >= c.want * 0.9, `${g.stats.lastPrefillTiles} tiles for ${c.want} wanted`);

  // the other direction: a step of one tile is not a teleport
  const p2 = g.stats.prefills;
  for (let i = 0; i < 30; i++) g.update(61000 + i * 16, far[0] + TILE * 0.2 * i, far[1]);
  check('and walking one tile at a time never prefills', g.stats.prefills === p2,
    `${g.stats.prefills - p2}`);

  // setCentre is the same path a teleport should call, and it says what it did
  const r = g.setCentre(home[0], home[1], 70000);
  const c2 = coverage(home[0], home[1], PREFILL_R);
  console.log(`  setCentre back to the meadow: ${r.tiles} tiles in ${r.ms.toFixed(1)} ms`);
  check('setCentre fills the inner disc in one call and reports it',
    r.tiles > 0 && c2.missing.length === 0 && Number.isFinite(r.ms),
    `${r.tiles} tiles, ${c2.have} of ${c2.want}`);
  for (let i = 0; i < 300 && g.queued; i++) g.update(70000 + i * 16, home[0], home[1]);
}

// ------------------------------------------------------------- the grow in ---
{
  // a tile filled at t seconds is born at t seconds, which is the clock the
  // leaves read; a shader comparing against anything else would grow the grass
  // in at boot and never again
  const now = 123456;
  g.setCentre(home[0] + 4000, home[1] + 4000, now);
  const arr = g.meshes[0].geometry.attributes.aBorn.array;
  let fresh = 0;
  for (let i = 0; i < arr.length; i++) if (Math.abs(arr[i] - now / 1000) < 1e-3) fresh++;
  check('a tile filled this frame is stamped with this frame\'s second', fresh > 0,
    `${fresh} instances stamped ${(now / 1000).toFixed(1)} s`);
  tickWind(now / 1000);
  check('the wind clock and the birth clock are the same seconds',
    windUniforms.uTime.value === now / 1000);
  const growAt = (t) => Math.max(0, Math.min(1, (t - now / 1000) / FADE_IN_S));
  check('a blade is nothing at birth, half up halfway, and whole after FADE_IN_S',
    growAt(now / 1000) === 0 && Math.abs(growAt(now / 1000 + FADE_IN_S / 2) - 0.5) < 1e-6
    && growAt(now / 1000 + FADE_IN_S) === 1,
    `${growAt(now / 1000)}, ${growAt(now / 1000 + FADE_IN_S / 2).toFixed(3)}, ${growAt(now / 1000 + FADE_IN_S)}`);
  g.setCentre(home[0], home[1], 80000);
  for (let i = 0; i < 300 && g.queued; i++) g.update(80000 + i * 16, home[0], home[1]);
}

// walking: tiles are recycled, not rebuilt from nothing
{
  const before = g.stats.filled;
  const l0 = live().length;
  for (let i = 0; i < 200; i++) g.update(90000 + i * 16, home[0] + TILE * 1.2, home[1]);
  const filledAfterOneTile = g.stats.filled - before;
  check(`walking one tile refills only the tiles that changed, not all ${MAX_TILES}`,
    filledAfterOneTile > 0 && filledAfterOneTile < MAX_TILES * 0.3, `${filledAfterOneTile} tiles refilled`);
  const l1 = live().length;
  check('the ring stays about as full while walking', Math.abs(l1 - l0) / l0 < 0.25, `${l0} then ${l1}`);
  check('the slot pool never overflows', g.stats.tiles <= MAX_TILES, `${g.stats.tiles} tiles live of ${MAX_TILES}`);
  // walk back: the same ground grows the same blades
  for (let i = 0; i < 300; i++) g.update(120000 + i * 16, home[0], home[1]);
  const there = live();
  const key = (b) => `${b.x.toFixed(3)},${b.z.toFixed(3)}`;
  const setA = new Set(there.map(key));
  for (let i = 0; i < 300; i++) g.update(160000 + i * 16, home[0] + TILE * 3, home[1] + TILE * 3);
  for (let i = 0; i < 300; i++) g.update(200000 + i * 16, home[0], home[1]);
  const back = live();
  const same = back.filter((b) => setA.has(key(b))).length;
  check('walking away and back grows the same blades in the same places',
    back.length > 0 && same / back.length > 0.99, `${same} of ${back.length} identical`);
}

// a long walk: the pools are a fixed size container, and this is the only way
// to find out whether they are big enough on real ground rather than on paper
{
  const startedStarved = g.stats.starved;
  let peakNear = 0, peakOuter = 0, x = home[0];
  const N = 5400, STEP = 20 / 60;             // 20 m/s at 60 fps, 1.8 km of it
  for (let i = 0; i < N; i++) {
    x += STEP;
    g.update(300000 + i * 16, x, home[1] + Math.sin(i / 400) * 300);
    peakNear = Math.max(peakNear, g.stats.near);
    peakOuter = Math.max(peakOuter, g.stats.outer);
  }
  console.log(`  ${(N * STEP / 1000).toFixed(1)} km at 20 m/s across biomes: peak ${peakNear} near tiles `
    + `of ${NEAR_TILES}, ${peakOuter} outer of ${OUTER_TILES}`);
  check('neither pool ever ran dry over 1.8 km of running', g.stats.starved === startedStarved,
    `${g.stats.starved - startedStarved} starved fills`);
  check('and both peaks sit inside the capacity the audit predicted',
    peakNear <= NEAR_TILES && peakOuter <= OUTER_TILES);

  // and the other end of the same knob: a speed no player can reach. The ring
  // is allowed to fall behind there, but it may never overflow a pool, and it
  // must come back the moment the sprint stops.
  const s2 = g.stats.starved;
  let absurdNear = 0, absurdOuter = 0;
  for (let i = 0; i < 900; i++) {
    x += 4;                                    // 240 m/s
    g.update(400000 + i * 16, x, home[1]);
    absurdNear = Math.max(absurdNear, g.stats.near);
    absurdOuter = Math.max(absurdOuter, g.stats.outer);
  }
  console.log(`  and at 240 m/s: peak ${absurdNear} near, ${absurdOuter} outer, `
    + `${g.stats.starved - s2} starved fills`);
  check('an impossible speed never overflows a pool either',
    absurdNear <= NEAR_TILES && absurdOuter <= OUTER_TILES);
  for (let i = 0; i < 400 && (i < 2 || g.queued); i++) g.update(430000 + i * 16, x, home[1]);
  const back = coverage(x, home[1], PREFILL_R);
  check('and the ring is whole again once the sprint stops', back.missing.length === 0,
    `${back.have} of ${back.want} tiles`);
}

// the ocean grows nothing, which is the other direction on the turf table
{
  let sea = null;
  for (let cz = -60; cz <= 60 && !sea; cz++) for (let cx = -60; cx <= 60; cx++) {
    if (f.biomeAt((cx + 0.5) * 64, (cz + 0.5) * 64) === 'ocean'
      && f.biomeAt(cx * 64 + 8, cz * 64 + 8) === 'ocean') { sea = [(cx + 0.5) * 64, (cz + 0.5) * 64]; break; }
  }
  for (let i = 0; i < 400; i++) g.update(500000 + i * 16, sea[0], sea[1]);
  const l = live();
  const near = l.filter((b) => Math.hypot(b.x - sea[0], b.z - sea[1]) < RADIUS);
  // a blade may legitimately stand on a spit of beach inside the ring; what it
  // may never do is stand on the water itself
  const afloat = near.filter((b) => { const sp = f.sampleAt(b.x, b.z); return sp.water || sp.biome === 'ocean'; });
  check('standing at sea, not one blade is growing out of the water', afloat.length === 0,
    `${afloat.length} afloat of ${near.length} within the ring`);
}

// density, which is the settings window's slider and flora's setGrass
{
  g.setCentre(home[0], home[1], 600000);
  for (let i = 0; i < 300 && g.queued; i++) g.update(600000 + i * 16, home[0], home[1]);
  const full = live().length;
  g.setDensity(0);
  for (let i = 0; i < 30; i++) g.update(610000 + i * 16, home[0], home[1]);
  check('density 0 turns the grass off', g.meshes.every((m) => m.visible === false) && g.density === 0);
  check('and stops the tiler dead rather than filling an invisible ring',
    g.queued === 0 && g.stats.tiles === 0, `${g.stats.tiles} tiles, ${g.queued} queued`);
  g.setDensity(0.5);
  // the queue is empty until the first update replans, so pump at least once
  // rather than reading g.queued before anything has asked for a tile
  for (let i = 0; i < 500 && (i < 2 || g.queued); i++) g.update(620000 + i * 16, home[0], home[1]);
  const half = live().length;
  check('density 0.5 puts back about half the blades', half > full * 0.3 && half < full * 0.75,
    `${half} at half density against ${full} at full`);
  g.setDensity(1);
  for (let i = 0; i < 500 && (i < 2 || g.queued); i++) g.update(640000 + i * 16, home[0], home[1]);
  check('and 1 puts them all back', Math.abs(live().length - full) / full < 0.05,
    `${live().length} against ${full}`);
}

// ------------------------------------------------------- hand painted ground
//
// A `ground` stroke (src/world/terrain_edits.js) paints a word over a disc and
// field.sampleAt carries it out as `sample.ground`. Nothing grows out of dirt,
// rock, sand or mud. Driven both ways: the same point, the same seed, the same
// grass, with and without the paint over it.
{
  const { createTerrainEdits } = await import('./terrain_edits.js');
  const at = home;
  const bare = new THREE.Group();
  const clean = createGrass(bare, f, {});
  clean.update(900000, at[0], at[1]);
  for (let i = 0; i < 400 && clean.queued; i++) clean.update(900000 + i * 16, at[0], at[1]);
  const placedClean = clean.stats.placed;
  clean.dispose();

  const f2 = createWorldField(20260904, { homeY: -0.3 });
  const edits = createTerrainEdits({ baseHeight: (x, z) => f2.heightAt(x, z) });
  f2.setTerrainEdits(edits);
  edits.stroke({ kind: 'ground', x: at[0], z: at[1], r: 220, word: 'dirt' });
  const yard = new THREE.Group();
  const painted = createGrass(yard, f2, {});
  painted.update(900000, at[0], at[1]);
  for (let i = 0; i < 400 && painted.queued; i++) painted.update(900000 + i * 16, at[0], at[1]);
  check('grass grows on this meadow when nobody has painted it', placedClean > 0,
    `${placedClean} blades in the last tile filled at ${at[0].toFixed(0)}, ${at[1].toFixed(0)}`);
  check('and not one blade grows out of painted dirt',
    painted.stats.placed === 0 && painted.stats.dropped > 0,
    `${painted.stats.placed} placed, ${painted.stats.dropped} dropped in the same tile`);
  painted.dispose();

  // ---- ED5: a wash of paint is not a yard ---------------------------------
  //
  // Paint carries a weight per word now, and `sample.ground` is the word over
  // half of it. That is the whole reason it is the DOMINANT word and not any
  // word at all: a light wash of snow over a meadow has to leave the meadow a
  // meadow, blades and all, and a heavy one has to bury it. Driven both ways,
  // on the same seed and the same tile, so the only thing that differs is how
  // much snow was laid.
  const wash = (opacity) => {
    const fw = createWorldField(20260904, { homeY: -0.3 });
    const ed = createTerrainEdits({ baseHeight: (x, z) => fw.heightAt(x, z) });
    fw.setTerrainEdits(ed);
    ed.stroke({ kind: 'ground', x: at[0], z: at[1], r: 220, word: 'snow', hardness: 1, opacity });
    const g = new THREE.Group();
    const grass = createGrass(g, fw, {});
    grass.update(900000, at[0], at[1]);
    for (let i = 0; i < 400 && grass.queued; i++) grass.update(900000 + i * 16, at[0], at[1]);
    const out = { placed: grass.stats.placed, ground: fw.sampleAt(at[0], at[1]).ground, mix: fw.sampleAt(at[0], at[1]).groundMix };
    grass.dispose();
    return out;
  };
  const light = wash(0.3), heavy = wash(0.8);
  check('a 0.3 wash of snow leaves the meadow a meadow, and the blades still grow',
    light.ground === null && Math.abs(light.mix.snow - 0.3) < 1e-9 && light.placed > 0,
    `${light.placed} blades under ${light.mix.snow.toFixed(2)} of snow, ground ${light.ground}`);
  check('and a 0.8 wash buries it: not one blade in the same tile',
    heavy.ground === 'snow' && heavy.placed === 0,
    `${heavy.placed} blades under ${heavy.mix.snow.toFixed(2)} of snow, ground ${heavy.ground}`);
  check('and it is the same tile and the same seed both times, so the snow is the only difference',
    light.placed > 0 && Math.abs(light.placed - placedClean) / placedClean < 0.05,
    `${light.placed} against ${placedClean} with no paint at all`);
}

g.dispose();
check('dispose takes both meshes out of the scene', parent.children.length === 0, `${parent.children.length}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
