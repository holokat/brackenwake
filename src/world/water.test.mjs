// The water, driven both ways. Run: node src/world/water.test.mjs
//
// The wave maths, the grid warp and the quality presets are pure, so they run
// here as themselves. The surface itself is built with real THREE objects and
// driven by a fake renderer that records what was asked of it, which is how
// the refraction pass can be checked without a GPU: that the water was hidden
// while the scene was drawn, that the previous render target came back, and
// that the shader was told the truth about the resolution afterwards.

globalThis.performance ||= { now: () => Date.now() };
globalThis.window ||= { addEventListener() {}, removeEventListener() {}, devicePixelRatio: 1 };

import * as THREE from 'three';
import {
  WAVES, AMPLITUDE_SUM, WAVE_DEFAULTS, QUALITY, WATER_FAR, WATER_WARP,
  gerstnerAt, waveHeightAt, gridWarp, spacingAt,
  WAVE_GLSL, OCEAN_VERT, PLANE_VERT, WATER_FRAG,
  createWaterUniforms, buildOceanGeometry, createWater,
} from './water.js';
import { createSkyUniforms, SKY_GLSL } from '../game/sky.js';
import { createWorldField, SEA_LEVEL } from './field.js';

let pass = 0, fail = 0;
const ck = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };
const f3 = (v) => Number(v).toFixed(3);

// ------------------------------------------------ one wave table, not two --

const glslWaves = [...WAVE_GLSL.matchAll(/ang\s*=\s*(-?[\d.]+);\s*len\s*=\s*(-?[\d.]+);\s*amp\s*=\s*(-?[\d.]+);/g)]
  .map((m) => [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3])]);

ck('the shader declares six waves', glslWaves.length === 6, `${glslWaves.length}`);
ck('the JS table declares six waves', WAVES.length === 6);
ck('the shader table and the JS table are the same numbers',
  JSON.stringify(glslWaves) === JSON.stringify(WAVES),
  JSON.stringify(glslWaves) === JSON.stringify(WAVES) ? '' : `glsl ${JSON.stringify(glslWaves)}`);
ck('amplitudes sum to what AMPLITUDE_SUM says',
  Math.abs(AMPLITUDE_SUM - glslWaves.reduce((a, w) => a + w[2], 0)) < 1e-12, f3(AMPLITUDE_SUM));
ck('the wavelengths run from a swell to a ripple',
  Math.max(...WAVES.map((w) => w[1])) === 42 && Math.min(...WAVES.map((w) => w[1])) === 3.2);

// ------------------------------------------------------------ wave maths --

// With the steepness at zero there is no horizontal pull and the height is a
// plain sum of sines, which the test computes from the SHADER's table with its
// own arithmetic. If gerstnerAt and the shader ever disagree, this is where.
{
  const p = { ...WAVE_DEFAULTS, steep: 0 };
  let worst = 0;
  for (let i = 0; i < 200; i++) {
    const x = (i * 37.7) % 900 - 450, z = (i * 13.3) % 900 - 450, t = i * 0.37;
    let want = 0;
    for (let j = 0; j < 6; j++) {
      const ang = glslWaves[j][0] + p.windDir;
      const len = glslWaves[j][1] * p.scale;
      const amp = glslWaves[j][2] * p.height;
      const k = 6.2831853 / len;
      const w = Math.sqrt(9.81 * k) * p.speed;
      want += amp * Math.sin(k * (Math.cos(ang) * x + Math.sin(ang) * z) - w * t + j * 1.7);
    }
    worst = Math.max(worst, Math.abs(want - waveHeightAt(x, z, t, p)));
  }
  ck('the height is the sum of the six sines the shader lists', worst < 1e-12, `worst ${worst.toExponential(1)}`);
  ck('with no steepness there is no fold and no horizontal pull', (() => {
    const g = gerstnerAt(11, -7, 3, p);
    return g.J === 1 && g.dx === 0 && g.dz === 0;
  })());
}

ck('the same place at the same moment gives the same wave', (() => {
  const a = gerstnerAt(120.5, -33.25, 9.75), b = gerstnerAt(120.5, -33.25, 9.75);
  return a.dy === b.dy && a.dx === b.dx && a.J === b.J;
})());

{
  let mx = -9, mn = 9, moved = 0;
  for (let i = 0; i < 4000; i++) {
    const x = (i * 17.3) % 400 - 200, z = (i * 7.9) % 400 - 200;
    const h = waveHeightAt(x, z, 4.0);
    mx = Math.max(mx, h); mn = Math.min(mn, h);
    if (Math.abs(waveHeightAt(x, z, 4.0) - waveHeightAt(x, z, 4.4)) > 1e-4) moved++;
  }
  const cap = AMPLITUDE_SUM * WAVE_DEFAULTS.height;
  ck('no crest is taller than the sum of the amplitudes', mx <= cap + 1e-9 && mn >= -cap - 1e-9,
    `${f3(mn)} .. ${f3(mx)} m, cap ${f3(cap)}`);
  ck('the coast is calm: peak to trough under 1.6 m', mx - mn < 1.6, `${f3(mx - mn)} m over 4000 points`);
  ck('the sea moves: 0.4 s later almost every point has changed', moved > 3900, `${moved} of 4000`);
}

ck('a flat sea is exactly flat', waveHeightAt(3, 5, 7, { ...WAVE_DEFAULTS, height: 0 }) === 0);

{
  const t0 = performance.now();
  let n = 0;
  for (let i = 0; i < 200000; i++) { gerstnerAt(i * 0.31, i * 0.17, 1.0); n++; }
  const ms = performance.now() - t0;
  console.log(`  ..   gerstnerAt: ${n} calls in ${ms.toFixed(1)} ms = ${Math.round(n / (ms / 1000) / 1000)}k/s`);
  ck('the CPU wave is cheap enough to float things on', n / (ms / 1000) > 500000);
}

// ------------------------------------------------------------- the grid --

ck('the grid warp is centred and reaches the far edge',
  gridWarp(0) === 0 && Math.abs(gridWarp(1) - WATER_FAR) < 1e-9 && Math.abs(gridWarp(-1) + WATER_FAR) < 1e-9);
ck('the warp only ever grows outward', (() => {
  let prev = -1;
  for (let g = 0; g <= 1; g += 0.01) { const d = gridWarp(g); if (d < prev) return false; prev = d; }
  return true;
})());

for (const q of ['high', 'medium', 'low']) {
  const grid = QUALITY[q].grid;
  const row = [5, 10, 25, 50, 100, 250, 500].map((d) => `${d}m:${spacingAt(d, grid).toFixed(2)}`).join('  ');
  console.log(`  ..   ${q} grid ${grid}x${grid} = ${grid * grid} verts, spacing  ${row}`);
}
ck('the near water is finer than the longest wave', spacingAt(25, QUALITY.high.grid) < 42 / 4,
  `${spacingAt(25, QUALITY.high.grid).toFixed(2)} m at 25 m out`);
ck('and the grid gets coarser with distance',
  spacingAt(10, QUALITY.high.grid) < spacingAt(100, QUALITY.high.grid));

// ---------------------------------------------------------- the presets --

ck('low halves the high grid', QUALITY.low.grid * 2 === QUALITY.high.grid,
  `${QUALITY.high.grid} -> ${QUALITY.low.grid}`);
ck('low does no refraction pass', QUALITY.low.refraction === false && QUALITY.low.rtScale === 0);
ck('high refracts at half resolution', QUALITY.high.refraction === true && QUALITY.high.rtScale === 0.5);
ck('medium is cheaper than high in both directions',
  QUALITY.medium.grid < QUALITY.high.grid && QUALITY.medium.rtScale < QUALITY.high.rtScale);
ck('detail falls with quality', QUALITY.high.detail > QUALITY.medium.detail && QUALITY.medium.detail > QUALITY.low.detail);

// ------------------------------------------------------------- the glsl --

{
  const src = SKY_GLSL + WAVE_GLSL + OCEAN_VERT + PLANE_VERT + WATER_FRAG;
  const declared = new Set();
  for (const m of src.matchAll(/uniform\s+\w+\s+([^;]+);/g)) {
    for (const name of m[1].split(',')) declared.add(name.trim());
  }
  const provided = new Set([...Object.keys(createSkyUniforms()), ...Object.keys(createWaterUniforms(-0.8))]);
  ck('every uniform the water shaders declare is provided',
    [...declared].every((u) => provided.has(u)),
    [...declared].filter((u) => !provided.has(u)).join(', ') || `${declared.size} uniforms`);
  ck('and nothing is provided that no shader declares',
    [...provided].every((u) => declared.has(u)),
    [...provided].filter((u) => !declared.has(u)).join(', ') || 'none spare');

  for (const [name, s] of [['WAVE_GLSL', WAVE_GLSL], ['OCEAN_VERT', OCEAN_VERT], ['PLANE_VERT', PLANE_VERT], ['WATER_FRAG', WATER_FRAG]]) {
    const bal = (a, b) => s.split(a).length === s.split(b).length;
    ck(`${name} has balanced braces and parens`, bal('{', '}') && bal('(', ')'));
  }
  ck('the water reflects the sky through the shared skyCol', WATER_FRAG.includes('skyCol('));
  ck('the water finishes on three\'s tone curve', WATER_FRAG.includes('#include <tonemapping_fragment>'));
  ck('both vertex shaders hand the fragment its eye depth',
    OCEAN_VERT.includes('vViewZ') && PLANE_VERT.includes('vViewZ') && WATER_FRAG.includes('vViewZ'));
  ck('the ocean grid follows the camera, the pool wears its own matrix',
    OCEAN_VERT.includes('uCamPos.xz') && PLANE_VERT.includes('modelMatrix') && !OCEAN_VERT.includes('modelMatrix'));
  ck('the refraction sample refuses anything in front of the surface',
    /if\s*\(\s*sceneEyeDepth\(\s*ruv\s*\)\s*<\s*vViewZ\s*\)/.test(WATER_FRAG));
}

// ------------------------------------------------------ where water goes --
//
// This is the claim V1.md makes about lakes and rivers, measured against the
// real field rather than assumed.
{
  const field = createWorldField(20260904, { homeY: -0.3 });
  let cores = 0, aboveSea = 0, deepest = 0;
  for (let x = -4000; x <= 4000; x += 17) for (let z = -4000; z <= 4000; z += 17) {
    const s = field.sampleAt(x, z);
    if (s.river > 0.95 && s.land > 0.9) {
      cores++;
      if (s.h > SEA_LEVEL) aboveSea++;
      deepest = Math.min(deepest, s.h);
    }
  }
  ck('every river core is below sea level, so one sheet floods them all',
    cores > 100 && aboveSea === 0, `${cores} cores sampled, ${aboveSea} above ${SEA_LEVEL}, deepest ${f3(deepest)}`);

  // how wide a foam band the shore gets: where the water is shallower than
  // uShoreDepth (1.6 m) along a transect out from a beach
  let found = null;
  outer: for (let x = 0; x < 3000 && !found; x += 29) {
    for (let z = 0; z < 3000; z += 29) {
      if (field.heightAt(x, z) > 0.5 && field.heightAt(x + 60, z) < SEA_LEVEL - 2) { found = [x, z]; break outer; }
    }
  }
  if (found) {
    let band = 0;
    for (let d = 0; d < 120; d += 0.5) {
      const h = field.heightAt(found[0] + d, found[1]);
      const depth = SEA_LEVEL - h;
      if (depth > 0 && depth < 1.6) band += 0.5;
    }
    ck('a beach has a shallow band for the foam to sit in', band > 2, `${band.toFixed(1)} m wide at ${found[0]},${found[1]}`);
  } else {
    ck('a beach has a shallow band for the foam to sit in', false, 'no beach transect found');
  }
}

// -------------------------------------------------------- the real thing --

function fakeRenderer(w, h, watch) {
  let target = null;
  const log = [];
  return {
    log,
    shadowMap: { autoUpdate: true, needsUpdate: false },
    getDrawingBufferSize(v) { v.set(w, h); return v; },
    getRenderTarget() { return target; },
    setRenderTarget(t) { target = t; log.push({ op: 'target', t }); },
    render() { log.push({ op: 'render', target, waterVisible: watch(), shadowAuto: this.shadowMap.autoUpdate }); },
  };
}

{
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x8899aa, 90, 536);
  const field = createWorldField(20260904, { homeY: -0.3 });
  const water = createWater({ scene }, field);

  ck('the sheet is in the scene under a group named water',
    scene.children.includes(water.group) && water.group.name === 'water');
  ck('it takes its sea level from the field', water.seaLevel === field.seaLevel && water.uniforms.uSeaY.value === SEA_LEVEL);
  ck('it is double sided, so you can look up at it from below', water.material.side === THREE.DoubleSide);
  ck('it is never frustum culled, because the shader moves it', water.mesh.frustumCulled === false);
  ck('the sheet has the grid the quality asked for',
    water.mesh.geometry.attributes.position.count === QUALITY.high.grid ** 2,
    `${water.mesh.geometry.attributes.position.count} verts`);
  ck('a standalone water writes the sky uniforms itself', water.writesSky === true);

  const cam = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 1800);
  cam.position.set(0, 20, 0);
  water.update(0.016, cam.position, { x: 0.3, y: 0.8, z: 0.5 }, null, 12.5);
  ck('update takes the clock it is handed', water.time === 12.5);
  ck('update copies the scene fog, so sea and land vanish together',
    water.uniforms.uFogNear.value === 90 && water.uniforms.uFogFar.value === 536);
  ck('update puts the camera in the shader', water.uniforms.uCamPos.value.y === 20);

  const r = fakeRenderer(1600, 900, () => water.group.visible);
  const did = water.beforeRender(r, scene, cam);
  ck('beforeRender ran a pass', did === true);
  const rendered = r.log.filter((e) => e.op === 'render');
  ck('exactly one extra scene render', rendered.length === 1);
  ck('the water was hidden while the scene was drawn', rendered[0].waterVisible === false);
  ck('and it is visible again afterwards', water.group.visible === true);
  ck('the pass went into the water\'s own target', rendered[0].target === water.target);
  ck('the previous render target came back', r.getRenderTarget() === null);
  ck('the target is half the drawing buffer',
    water.target.width === 800 && water.target.height === 450, `${water.target.width}x${water.target.height}`);
  ck('the shader divides by the MAIN buffer size, not the target',
    water.uniforms.uResolution.value.x === 1600 && water.uniforms.uResolution.value.y === 900);
  ck('the depth texture is attached and handed over',
    water.uniforms.uSceneDepth.value === water.target.depthTexture && water.uniforms.uHasDepth.value === 1);
  ck('the camera planes go with it',
    water.uniforms.uCamNear.value === 0.1 && water.uniforms.uCamFar.value === 1800);
  console.log(`  ..   refraction pass: ${water.stats.rtPixels} target pixels for ${water.stats.mainPixels} on screen`
    + ` = ${(water.stats.rtPixels / water.stats.mainPixels * 100).toFixed(0)}% of a full extra pass`);

  // the shadow map is built once for the two passes, not once each
  ck('the extra pass builds the shadow map', rendered[0].shadowAuto === true);
  ck('and the main pass is told to reuse it, not rebuild it',
    r.shadowMap.autoUpdate === false && r.shadowMap.needsUpdate === false && water.shadowsHeld === true);
  water.beforeRender(r, scene, cam);
  ck('the next frame turns it back on for its own pass',
    r.log.filter((e) => e.op === 'render').pop().shadowAuto === true);

  // switched off underground, the pass must not run at all
  water.setVisible(false);
  const before = water.stats.passes;
  const skipped = water.beforeRender(r, scene, cam);
  ck('hidden water costs nothing: no pass, no depth',
    skipped === false && water.stats.passes === before && water.uniforms.uHasDepth.value === 0);
  ck('and it hands the shadow map back so shadows do not freeze underground',
    r.shadowMap.autoUpdate === true && water.shadowsHeld === false);
  water.setVisible(true);

  // quality
  ck('setQuality low halves the grid and drops the pass', (() => {
    water.setQuality('low');
    return water.mesh.geometry.attributes.position.count === QUALITY.low.grid ** 2 && water.target === null;
  })(), `${water.mesh.geometry.attributes.position.count} verts`);
  water.uniforms.uHasDepth.value = 1;
  ck('and low really does skip the pass', water.beforeRender(r, scene, cam) === false && water.uniforms.uHasDepth.value === 0);
  ck('setQuality medium brings the pass back at a smaller target', (() => {
    water.setQuality('medium');
    water.beforeRender(r, scene, cam);
    return water.target && water.target.width === Math.floor(1600 * QUALITY.medium.rtScale);
  })(), water.target ? `${water.target.width}x${water.target.height}` : 'no target');
  ck('an unknown quality is ignored', water.setQuality('ultra') === 'medium');
  water.setQuality('high');

  // underwater, both directions
  const surf = water.surfaceAt(0, 0);
  ck('the surface sits at sea level plus the wave', Math.abs(surf - (SEA_LEVEL + water.waveHeightAt(0, 0))) < 1e-12,
    `${f3(surf)} m`);
  ck('a camera above the surface is not underwater', water.isUnderwater({ x: 0, y: surf + 0.5, z: 0 }) === false);
  ck('a camera below it is', water.isUnderwater({ x: 0, y: surf - 0.5, z: 0 }) === true);
  water.update(0, { x: 0, y: surf - 2, z: 0 }, null, null, water.time);
  ck('and the shader is told', water.underwater === true && water.uniforms.uUnder.value === 1);
  water.update(0, { x: 0, y: surf + 20, z: 0 }, null, null, water.time);
  ck('and told again on the way out', water.underwater === false && water.uniforms.uUnder.value === 0);

  ck('sea level is settable', water.setSeaLevel(-2.5) === -2.5 && water.uniforms.uSeaY.value === -2.5);
  water.setSeaLevel(SEA_LEVEL);
  ck('the waves are settable', (() => {
    water.setWaves({ height: 0.6, speed: 1.4 });
    return water.uniforms.uWaveH.value === 0.6 && water.waves.height === 0.6 && water.uniforms.uSpeed.value === 1.4;
  })());
  water.setWaves(WAVE_DEFAULTS);

  // pools and rivers
  const nChildren = water.group.children.length;
  const pool = water.addPool(500, -300, 12, 4.5);
  ck('addPool adds a surface at its own height',
    water.group.children.length === nChildren + 1 && pool.position.y === 4.5
    && pool.material.uniforms.uSeaY.value === 4.5);
  ck('a pool does not disturb the ocean\'s own sea level', water.uniforms.uSeaY.value === SEA_LEVEL);
  const river = water.riverMaterial({ x: 0.6, z: -0.2 });
  ck('riverMaterial is the same shader with the waves down and a flow',
    river.uniforms.uWaveH.value < 0.1 && river.uniforms.uFlowX.value === 0.6 && river.uniforms.uFlowZ.value === -0.2
    && river.fragmentShader === water.material.fragmentShader,
    `waveH ${river.uniforms.uWaveH.value}`);
  ck('a river shares the ocean\'s scene texture slot, so one writer feeds all',
    river.uniforms.uScene === water.uniforms.uScene && river.uniforms.uCamPos === water.uniforms.uCamPos);

  water.dispose();
  ck('dispose takes the group out of the scene and empties it',
    !scene.children.includes(water.group) && water.group.children.length === 0);
}

// a water handed a sky leaves the sky's uniforms alone
{
  const scene = new THREE.Scene();
  const skyU = createSkyUniforms();
  const water = createWater({ scene }, { seaLevel: -0.8 }, { skyUniforms: skyU });
  ck('a shared sky is not written twice', water.writesSky === false);
  skyU.uTime.value = 99;
  water.update(0.5, { x: 0, y: 5, z: 0 }, { x: 0, y: 1, z: 0 }, null, 3.0);
  ck('so the time the sky set survives', skyU.uTime.value === 99 && water.uniforms.uTime === skyU.uTime);
  ck('but the water still tracks its own clock', water.time === 3.0);
  water.dispose();
}

// geometry helper
ck('buildOceanGeometry lies flat and spans the unit square', (() => {
  const g = buildOceanGeometry(4);
  const p = g.attributes.position;
  let flat = true, minx = 9, maxx = -9;
  for (let i = 0; i < p.count; i++) {
    if (Math.abs(p.getY(i)) > 1e-9) flat = false;
    minx = Math.min(minx, p.getX(i)); maxx = Math.max(maxx, p.getX(i));
  }
  g.dispose();
  return flat && minx === -1 && maxx === 1 && p.count === 16;
})());

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
