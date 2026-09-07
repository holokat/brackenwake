// The ground material, driven both ways. Run: node src/world/terrain_material.test.mjs
//
// Everything here is the real module. The shader test runs the real
// onBeforeCompile against the real THREE.ShaderLib.standard source, so if three
// renames an include the suite goes red instead of the ground going black.

import * as THREE from 'three';
import { createWorldField } from './field.js';
import {
  LAYERS, LAYER_INDEX, TILE_A, TILE_B, ROAD_FADE, TEX_SIZE, SNOW_START, SNOW_FULL,
  layerWeights, packWeights, heightBlend, buildLayer, layerTextures, buildTextureArrays,
  createTerrainMaterial, SHADER_HOOKS, QUALITY, worley, fbm2, climate, biomeStepBudget, CLIFF_SLOPE,
  PAINT_MIX, PAINT_STRENGTH,
} from './terrain_material.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };
const sum = (a) => a.reduce((x, y) => x + y, 0);
const top = (w) => LAYERS[w.indexOf(Math.max(...w))];

const field = createWorldField(20260904, { homeY: -0.3 });

// ---- 1. the layer list is the shape everything else assumes ---------------
check('six layers, in the order the attributes pack them', LAYERS.length === 6 && LAYERS[0] === 'grass' && LAYERS[5] === 'snow', LAYERS.join(', '));
check('every layer has an index', LAYERS.every((n, i) => LAYER_INDEX[n] === i));
check('the two tile scales are different enough to hide the repeat', TILE_B / TILE_A > 3, `${TILE_A} m and ${TILE_B} m`);
check('the road fade is metres, not centimetres', ROAD_FADE >= 5, `${ROAD_FADE} m`);

// ---- 2. weights over the real world --------------------------------------
{
  let worstSum = 0, negatives = 0, over = 0, n = 0;
  const seen = {};
  for (let z = -4000; z <= 4000; z += 97) for (let x = -4000; x <= 4000; x += 89) {
    const s = field.sampleAt(x, z);
    const slope = Math.min(1, Math.abs(field.heightAt(x + 2, z) - field.heightAt(x - 2, z)) / 4);
    const w = layerWeights(s, slope, 0);
    n++;
    worstSum = Math.max(worstSum, Math.abs(sum(w) - 1));
    for (const v of w) { if (v < 0) negatives++; if (v > 1.0000001) over++; }
    seen[top(w)] = (seen[top(w)] || 0) + 1;
  }
  check('every weight set sums to 1', worstSum < 1e-12, `${n} samples, worst error ${worstSum.toExponential(2)}`);
  check('no weight is negative and none exceeds 1', negatives === 0 && over === 0);
  console.log('     dominant layer counts:', Object.entries(seen).map(([k, v]) => `${k} ${v}`).join(', '));
  check('more than one layer ever wins', Object.keys(seen).length >= 3, Object.keys(seen).join(', '));
}

// ---- 3. each rule fires, and each rule stays off when it should -----------
{
  const flat = { h: 4, biome: 'meadow', moist: 0.7, temp: 0.5, river: 0 };
  const w = layerWeights(flat, 0, 0);
  check('flat wet meadow is grass', top(w) === 'grass', `grass ${w[0].toFixed(2)}`);

  const dry = layerWeights({ ...flat, moist: 0.12, temp: 0.75 }, 0, 0);
  check('the same meadow, hot and dry, burns to dry grass', dry[1] > w[1] * 5 && dry[1] > dry[0],
    `dryGrass ${w[1].toFixed(2)} -> ${dry[1].toFixed(2)}`);
  const wet = layerWeights({ ...flat, moist: 0.9, temp: 0.5 }, 0, 0);
  check('and does not burn when it is wet', wet[1] <= w[1] + 1e-9, `dryGrass ${wet[1].toFixed(3)}`);

  const steep = layerWeights(flat, 0.85, 0);
  check('a steep meadow face shows rock', top(steep) === 'rock', `rock ${steep[3].toFixed(2)}`);
  const gentle = layerWeights(flat, 0.30, 0);
  check('a gentle one does not', gentle[3] < 0.05 && top(gentle) === 'grass', `rock ${gentle[3].toFixed(3)}`);

  const high = layerWeights({ ...flat, h: SNOW_FULL + 6, biome: 'mountain' }, 0.1, 0);
  check('flat ground above the snow line is snow', top(high) === 'snow', `snow ${high[5].toFixed(2)}`);
  const low = layerWeights({ ...flat, h: SNOW_START - 6, biome: 'mountain' }, 0.1, 0);
  check('and below it is not', low[5] === 0, `snow ${low[5].toFixed(3)}`);
  const cliff = layerWeights({ ...flat, h: SNOW_FULL + 6, biome: 'mountain' }, 0.95, 0);
  check('snow slides off a cliff at the same height', cliff[5] < high[5] * 0.4 && top(cliff) === 'rock',
    `snow ${high[5].toFixed(2)} flat, ${cliff[5].toFixed(2)} on the cliff`);

  const road = layerWeights(flat, 0, 1);
  check('a road is dirt', top(road) === 'dirt' && road[0] < 0.1, `dirt ${road[2].toFixed(2)}, grass ${road[0].toFixed(2)}`);
  const verge = layerWeights(flat, 0, 0);
  check('the verge beside it is not', top(verge) === 'grass', `dirt ${verge[2].toFixed(2)}`);

  const bed = layerWeights({ ...flat, river: 0.9, h: -1.5 }, 0, 0);
  check('a river bed is gravel and silt', bed[2] + bed[4] > 0.7, `dirt ${bed[2].toFixed(2)} sand ${bed[4].toFixed(2)}`);
  check('and a dry meadow is not', w[2] + w[4] < 0.3, `dirt ${w[2].toFixed(2)} sand ${w[4].toFixed(2)}`);

  check('a beach is sand', top(layerWeights({ ...flat, biome: 'beach' }, 0, 0)) === 'sand');
  check('a desert is sand', top(layerWeights({ ...flat, biome: 'desert', moist: 0.2, temp: 0.8 }, 0, 0)) === 'sand');
  check('an unknown biome falls back to meadow instead of throwing',
    top(layerWeights({ ...flat, biome: 'nowhere' }, 0, 0)) === 'grass');
}

// ---- 4. continuity: a step in the weights is a line on the ground ---------
{
  // First the function on its own, and the only question worth asking of it:
  // is it continuous? Sweep every argument at one resolution and again at
  // twice that. A continuous function halves its worst single step when the
  // sampling halves; a function with a jump in it does not move at all. This
  // is unit free, so h in metres and moisture in nothing can be judged the
  // same way. A transect through the world cannot answer this, because a real
  // cliff is supposed to change fast.
  const states = [
    { h: 4, biome: 'meadow', moist: 0.5, temp: 0.5, river: 0, land: 1 },
    { h: 30, biome: 'boreal', moist: 0.3, temp: 0.25, river: 0, land: 1 },
    { h: 1.5, biome: 'beach', moist: 0.6, temp: 0.6, river: 0, land: 0.95 },
    { h: 70, biome: 'mountain', moist: 0.4, temp: 0.2, river: 0, land: 1 },
  ];
  const axes = [
    ['h', -6, 100], ['temp', 0, 1], ['moist', 0, 1], ['river', 0, 1], ['land', 0.8, 1],
    ['slope', 0, 1], ['road', 0, 1],
  ];
  const sweep = (n) => {
    let worst = 0, at = '';
    for (const st of states) for (const [key, lo, hi] of axes) {
      const dv = (hi - lo) / n;
      let prev = null;
      for (let k = 0; k <= n; k++) {
        const v = lo + k * dv;
        const w = key === 'slope' ? layerWeights(st, v, 0)
          : key === 'road' ? layerWeights(st, 0.2, v)
            : layerWeights({ ...st, [key]: v }, 0.2, 0);
        if (prev) for (let i = 0; i < 6; i++) {
          const d = Math.abs(w[i] - prev[i]);
          if (d > worst) { worst = d; at = `${st.biome} ${key} ${v.toFixed(4)}`; }
        }
        prev = w;
      }
    }
    return { worst, at };
  };
  const coarse = sweep(2000), fine = sweep(4000);
  const ratio = fine.worst / (coarse.worst || 1e-12);
  check('every argument moves the weights continuously: halving the step halves the jump',
    ratio < 0.6, `${coarse.worst.toFixed(5)} at ${coarse.at} -> ${fine.worst.toFixed(5)}, ratio ${ratio.toFixed(3)}`);

  // Then the world, where the only thing that can actually step is field.js
  // deciding the biome changed. Eight 600 m transects at 0.1 m.
  let jump = 0, jumpAt = '', crossings = 0, steps = 0;
  for (let t = 0; t < 8; t++) {
    const x = 1400 + t * 260;
    let prev = null, prevB = null;
    for (let d = 0; d <= 600; d += 0.1) {
      const z = -900 + d;
      const s = field.sampleAt(x, z);
      const slope = Math.min(1, Math.abs(field.heightAt(x + 2, z) - field.heightAt(x - 2, z)) / 4);
      const w = layerWeights(s, slope, 0);
      if (prev) {
        steps++;
        if (s.biome !== prevB) {
          crossings++;
          for (let i = 0; i < 6; i++) {
            const dv = Math.abs(w[i] - prev[i]);
            if (dv > jump) { jump = dv; jumpAt = `${x}, ${z.toFixed(1)} ${prevB} to ${s.biome}`; }
          }
        }
      }
      prev = w; prevB = s.biome;
    }
  }
  console.log(`     ${steps} steps of 0.1 m, ${crossings} of them across a biome boundary`);
  check('a biome boundary costs less than 0.06 of any weight', jump < 0.06,
    `worst ${jump.toFixed(4)} at ${jumpAt || 'no crossing found'}`);

  const b = biomeStepBudget();
  check('the biome rows stay within 0.06 of each other on vegetated ground',
    b.worst < 0.06, `worst ${b.worst.toFixed(3)} on ${b.pair}, ${b.biomes} rows`);
}

// ---- 5. packing ----------------------------------------------------------
{
  const w = [0.1, 0.2, 0.3, 0.15, 0.15, 0.1];
  const p = packWeights(w);
  check('A carries grass, dry grass, dirt', p.a.join() === '0.1,0.2,0.3');
  check('B carries rock, sand, snow', p.b.join() === '0.15,0.15,0.1');
}

// ---- 6. the height blend -------------------------------------------------
{
  const w = [1, 0, 0, 0, 0, 0];
  const b = heightBlend(w, [0.2, 0.9, 0.9, 0.9, 0.9, 0.9]);
  check('a layer with no weight contributes nothing, however tall its texture',
    b[0] === 1 && sum(b.slice(1)) === 0, b.map((v) => v.toFixed(3)).join(' '));

  const even = [0, 0, 0.5, 0.5, 0, 0];
  const tall = heightBlend(even, [0, 0, 0.9, 0.1, 0, 0]);
  check('at equal weight the taller texture takes most of the pixel',
    tall[2] > tall[3] * 2, `dirt ${tall[2].toFixed(3)} rock ${tall[3].toFixed(3)}`);
  const flatH = heightBlend(even, [0, 0, 0.5, 0.5, 0, 0]);
  check('and at equal height they split it', Math.abs(flatH[2] - flatH[3]) < 1e-9,
    `${flatH[2].toFixed(3)} / ${flatH[3].toFixed(3)}`);
  check('the blend always sums to 1', Math.abs(sum(tall) - 1) < 1e-12 && Math.abs(sum(flatH) - 1) < 1e-12);

  // continuity: sweep one weight from 0 to 1 and check the blend never steps
  let worst = 0, prev = null;
  for (let t = 0; t <= 1; t += 0.001) {
    const b2 = heightBlend([0, 0, 1 - t, t, 0, 0], [0, 0, 0.85, 0.15, 0, 0]);
    if (prev) worst = Math.max(worst, ...b2.map((v, i) => Math.abs(v - prev[i])));
    prev = b2;
  }
  check('the blend is continuous as a weight crosses zero', worst < 0.02, `worst step ${worst.toFixed(4)}`);
}

// ---- 7. the noise wraps, so the textures tile ----------------------------
{
  const [f1, fd] = worley(0.25, 0.4, 8, 3);
  check('worley returns F1 and the gap to F2', f1 > 0 && fd >= 0, `F1 ${f1.toFixed(3)} F2-F1 ${fd.toFixed(3)}`);
  check('fbm2 stays inside 0..1', (() => {
    let lo = 1, hi = 0;
    for (let i = 0; i < 4000; i++) { const v = fbm2(i / 4000, (i * 7 % 4000) / 4000, 16, 16, 4, 5); lo = Math.min(lo, v); hi = Math.max(hi, v); }
    return lo >= 0 && hi <= 1;
  })());

  const size = 128;
  for (const name of LAYERS) {
    const { h } = buildLayer(name, size, 11);
    let interior = 0, seam = 0;
    for (let j = 0; j < size; j++) {
      seam += Math.abs(h[j * size + size - 1] - h[j * size]);
      interior += Math.abs(h[j * size + 1] - h[j * size]);
      seam += Math.abs(h[(size - 1) * size + j] - h[j]);
      interior += Math.abs(h[size + j] - h[j]);
    }
    const ratio = seam / (interior || 1e-9);
    check(`${name} wraps: the seam step is the same size as an interior step`, ratio < 1.5, `ratio ${ratio.toFixed(3)}`);
  }
  let threw = false;
  try { buildLayer('lava', 8, 1); } catch { threw = true; }
  check('an unknown layer throws instead of shipping a blank texture', threw);
}

// ---- 8. the texture bytes -------------------------------------------------
{
  const size = 64;
  const t = layerTextures('rock', size, 3);
  check('albedo and normal are both RGBA at the asked size',
    t.albedo.length === size * size * 4 && t.normal.length === size * size * 4);
  let flipped = 0, flat = 0, roughLo = 255, roughHi = 0;
  for (let k = 0; k < size * size; k++) {
    if (t.normal[k * 4 + 2] <= 128) flipped++;           // z must point out of the surface
    if (t.normal[k * 4 + 2] === 255) flat++;
    roughLo = Math.min(roughLo, t.albedo[k * 4 + 3]);
    roughHi = Math.max(roughHi, t.albedo[k * 4 + 3]);
  }
  check('no normal points into the surface', flipped === 0);
  check('and the map is not all flat', flat < size * size * 0.5, `${flat} of ${size * size} perfectly flat`);
  check('roughness varies and stays in range', roughHi > roughLo && roughLo >= 0 && roughHi <= 255,
    `${(roughLo / 255).toFixed(2)} .. ${(roughHi / 255).toFixed(2)}`);

  const arr = buildTextureArrays(32, 1);
  check('the array texture holds one slice per layer', arr.depth === LAYERS.length && arr.albedo.length === 32 * 32 * 4 * 6);
  let empty = 0;
  for (let i = 0; i < 6; i++) {
    let s = 0;
    for (let k = 0; k < 32 * 32 * 4; k++) s += arr.albedo[i * 32 * 32 * 4 + k];
    if (s === 0) empty++;
  }
  check('no slice is blank', empty === 0);
}

// ---- 9. the shader hooks are still in three's source ---------------------
{
  const v = THREE.ShaderLib.standard.vertexShader, f = THREE.ShaderLib.standard.fragmentShader;
  for (const s of SHADER_HOOKS.vertex) check(`vertex hook ${s} exists`, v.includes(s));
  for (const s of SHADER_HOOKS.fragment) check(`fragment hook ${s} exists`, f.includes(s));
  check('vViewPosition is declared for us to measure distance with', f.includes('varying vec3 vViewPosition;'));
  check('normal_fragment_begin still declares nonPerturbedNormal',
    THREE.ShaderChunk.normal_fragment_begin.includes('nonPerturbedNormal'));
  // map_fragment must run before roughnessmap_fragment and normal_fragment_maps,
  // because our replacement for the first declares what the other two read.
  check('map_fragment comes before roughnessmap_fragment',
    f.indexOf('#include <map_fragment>') < f.indexOf('#include <roughnessmap_fragment>'));
  check('and before normal_fragment_maps',
    f.indexOf('#include <map_fragment>') < f.indexOf('#include <normal_fragment_maps>'));
}

// ---- 10. the real onBeforeCompile, on the real shader source -------------
{
  const t0 = Date.now();
  const ground = createTerrainMaterial({ size: 32, quality: 'high' });
  console.log(`     a 32 px set generated in ${Date.now() - t0} ms`);
  check('the material is a MeshStandard with vertex colours on',
    ground.material.isMeshStandardMaterial === true && ground.material.vertexColors === true);
  check('it starts at the quality it was asked for', ground.quality === 'high');

  const shader = {
    uniforms: {},
    vertexShader: THREE.ShaderLib.standard.vertexShader,
    fragmentShader: THREE.ShaderLib.standard.fragmentShader,
  };
  ground.material.onBeforeCompile(shader, null);

  for (const s of SHADER_HOOKS.fragment) {
    if (s === '#include <common>') continue;    // kept, ours is appended to it
    check(`fragment ${s} was actually replaced`, !shader.fragmentShader.includes(s));
  }
  check('the vertex shader carries our attributes',
    shader.vertexShader.includes('attribute vec3 aLayerA') && shader.vertexShader.includes('attribute float aRoad'));
  check('and writes the world position and normal varyings',
    shader.vertexShader.includes('vWPos = ( modelMatrix') && shader.vertexShader.includes('vWNrm = normalize'));
  check('the fragment shader declares both sampler arrays',
    shader.fragmentShader.includes('uniform sampler2DArray uTerAlbedo') && shader.fragmentShader.includes('uniform sampler2DArray uTerNormal'));
  check('it calls terSurface and writes the view-space normal',
    shader.fragmentShader.includes('terSurface( terAlb, terRgh, terWN )') && shader.fragmentShader.includes('normal = normalize( ( viewMatrix'));
  // The vColor trap: three declares it vec4, and did not always. If that ever
  // flips back, this fails here instead of turning the ground black in a
  // browser nobody is looking at.
  check('vColor is a vec4 in this three, and we read it as one',
    THREE.ShaderChunk.color_pars_fragment.includes('vec4 vColor')
    && shader.fragmentShader.includes('vColor.rgb')
    && !/vColor\s*[,)/*]/.test(shader.fragmentShader.replace(/vColor\.rgb/g, '')),
    'color_pars_fragment: ' + THREE.ShaderChunk.color_pars_fragment.trim().split('\n')[1].trim());
  check('every uniform we declare is bound to the shader',
    Object.keys(ground.uniforms).every((k) => shader.uniforms[k] === ground.uniforms[k]),
    Object.keys(ground.uniforms).join(', '));

  const balanced = (src, open, close) => {
    let n = 0;
    for (const c of src) { if (c === open) n++; else if (c === close) n--; if (n < 0) return false; }
    return n === 0;
  };
  for (const [name, src] of [['vertex', shader.vertexShader], ['fragment', shader.fragmentShader]]) {
    check(`${name} braces balance after injection`, balanced(src, '{', '}'));
    check(`${name} parens balance after injection`, balanced(src, '(', ')'));
  }

  // quality, both directions
  check('high compiles the second scale and the height blend',
    'TER_TWO_SCALE' in ground.material.defines && 'TER_HEIGHT_BLEND' in ground.material.defines);
  ground.setQuality('medium');
  check('medium drops the second scale and keeps the height blend',
    !('TER_TWO_SCALE' in ground.material.defines) && 'TER_HEIGHT_BLEND' in ground.material.defines);
  check('and keeps the normal detail on', ground.uniforms.uTerDetail.value > 0);
  ground.setQuality('low');
  check('low drops both', !('TER_TWO_SCALE' in ground.material.defines) && !('TER_HEIGHT_BLEND' in ground.material.defines));
  check('and turns the normal detail off', ground.uniforms.uTerDetail.value === 0);
  ground.setQuality('high');
  check('and it comes all the way back', 'TER_TWO_SCALE' in ground.material.defines && ground.uniforms.uTerDetail.value > 0);
  check('STANDARD survives every one of those', ground.material.defines.STANDARD === '');
  let threw = false;
  try { ground.setQuality('ultra'); } catch { threw = true; }
  check('an unknown quality throws', threw && QUALITY.length === 3);

  ground.dispose();
}

// ---- a relief wall is a rock face, and a table top is not ---------------
//
// V1 cuts faces at `field.RELIEF_GRADE` metres of rise per metre of ground,
// which is a slope of 0.89, and leaves table tops flat. Both cases are driven
// here against the layer rows rather than against the world, so the claim is
// about the rule and not about where a table happens to have landed.
console.log('terrain_material: the cliff line');
{
  const desert = { h: 26, biome: 'desert', moist: 0.2, temp: 0.72, river: 0, land: 1 };
  const face = layerWeights(desert, 0.89, 0);
  const flat = layerWeights(desert, 0.05, 0);
  const brow = layerWeights(desert, CLIFF_SLOPE - 0.02, 0);
  check('CLIFF_SLOPE is about fifty one degrees, steeper than anything holds on to',
    CLIFF_SLOPE > 0.7 && CLIFF_SLOPE < 0.85, `${CLIFF_SLOPE}, ${(Math.asin(CLIFF_SLOPE) * 180 / Math.PI).toFixed(0)} degrees`);
  check('a mesa wall in the desert is bare stone', top(face) === 'rock' && face[3] > 0.95,
    `rock ${face[3].toFixed(3)}, sand ${face[4].toFixed(3)}`);
  check('and the table top above it is still desert', top(flat) !== 'rock' && flat[3] < 0.1,
    `${top(flat)} ${Math.max(...flat).toFixed(2)}, rock ${flat[3].toFixed(3)}`);
  check('and the cliff term only adds past the line it names', face[3] > brow[3],
    `rock ${brow[3].toFixed(3)} just under CLIFF_SLOPE, ${face[3].toFixed(3)} past it`);
  // the same both ways in a realm with a different biome under the wall
  {
    const snowy = { h: 40, biome: 'snow', moist: 0.5, temp: 0.1, river: 0, land: 1 };
    const w = layerWeights(snowy, 0.89, 0), t2 = layerWeights(snowy, 0.05, 0);
    check('a face in Frostreach is stone and the shelf beside it is snow',
      top(w) === 'rock' && t2[5] > w[5], `face rock ${w[3].toFixed(2)}, shelf snow ${t2[5].toFixed(2)}`);
  }
}


// ---- ED5: a painted MIX, and a rim that reads as a blend -------------------
//
// `sample.groundMix` is the weight of every word a `ground` stroke left at a
// point (src/world/terrain_edits.js). A feathered rim is part one word and part
// the country under it, and the whole point of it is that it LOOKS like that,
// so this drives the weights at 0, 0.3 and 1 and asks for a monotone blend.
{
  const plain = { h: 20, biome: 'meadow', moist: 0.5, temp: 0.5, river: 0, land: 1 };
  const bare = layerWeights({ ...plain }, 0, 0).slice();
  const full = layerWeights({ ...plain, groundMix: { snow: 1 } }, 0, 0).slice();
  const some = layerWeights({ ...plain, groundMix: { snow: 0.3 } }, 0, 0).slice();
  const i = LAYER_INDEX.snow;
  check('a point washed with 0.3 of snow is snowier than bare meadow and less snowy than snow',
    some[i] > bare[i] + 0.05 && some[i] < full[i] - 0.05,
    `bare ${bare[i].toFixed(3)}, 0.3 ${some[i].toFixed(3)}, full ${full[i].toFixed(3)}`);
  check('and the grass under it is still there in proportion, which is what a blend is',
    some[LAYER_INDEX.grass] > full[LAYER_INDEX.grass] + 0.1 && some[LAYER_INDEX.grass] < bare[LAYER_INDEX.grass],
    `grass ${bare[LAYER_INDEX.grass].toFixed(3)} bare, ${some[LAYER_INDEX.grass].toFixed(3)} washed, ${full[LAYER_INDEX.grass].toFixed(3)} under full snow`);
  check('the weights still sum to one, whatever the wash',
    Math.abs(sum(some) - 1) < 1e-9 && Math.abs(sum(full) - 1) < 1e-9, `${sum(some).toFixed(9)}`);
  // and it is monotone all the way up, which is what "blended" has to mean
  let last = -1, monotone = true;
  for (let w = 0; w <= 1.0001; w += 0.1) {
    const v = layerWeights({ ...plain, groundMix: { snow: w } }, 0, 0)[i];
    if (v < last - 1e-12) monotone = false;
    last = v;
  }
  check('and every step from no snow to all snow is a step up, with no jump in it', monotone,
    `eleven steps, ending at ${last.toFixed(3)}`);
  // two words at once, which is what a rim painted over paint really is
  const both = layerWeights({ ...plain, groundMix: { snow: 0.3, rock: 0.7 } }, 0, 0);
  check('two words in one mix land between the two of them, by weight',
    both[LAYER_INDEX.rock] > both[i] && both[i] > 0.02,
    `rock ${both[LAYER_INDEX.rock].toFixed(3)}, snow ${both[i].toFixed(3)}`);
  // THE OLD PATH IS THE SAME PATH. One word at full weight has to be bit for
  // bit the single word line this replaced, or every file written before ED5
  // would draw differently.
  const wasWay = layerWeights({ ...plain, ground: 'snow' }, 0, 0);
  check('one word at full weight is exactly the single word the material always drew',
    full.every((v, k) => v === wasWay[k]),
    `${full.map((v) => v.toFixed(4)).join(' ')} against ${wasWay.map((v) => v.toFixed(4)).join(' ')}`);
  check('and the mix is read in preference to the word, so nothing reads two truths',
    layerWeights({ ...plain, ground: 'snow', groundMix: { rock: 1 } }, 0, 0)[LAYER_INDEX.rock]
      === layerWeights({ ...plain, groundMix: { rock: 1 } }, 0, 0)[LAYER_INDEX.rock]);
  check('a word the material has never heard of is ignored rather than drawn as nothing',
    (() => {
      const odd = layerWeights({ ...plain, groundMix: { tarmac: 1 } }, 0, 0);
      return odd.every((v, k) => Math.abs(v - bare[k]) < 1e-12);
    })(), 'the ground is the country it was');
  check('and the scratch row it sums into is left clean, so the next sample is not the last one twice',
    (() => {
      layerWeights({ ...plain, groundMix: { rock: 1 } }, 0, 0);
      const again = layerWeights({ ...plain, groundMix: { snow: 1 } }, 0, 0);
      return again.every((v, k) => v === full[k]);
    })(), 'a snow point after a rock point is still a snow point');
  check('PAINT_STRENGTH is what holds the country faintly through it, at any weight',
    PAINT_STRENGTH < 1 && full[LAYER_INDEX.grass] > 0 && !!PAINT_MIX.snow,
    `${PAINT_STRENGTH} of the way to the word`);
}

console.log(`\n  terrain_material: ${pass} passed, ${fail} failed   (default texture size ${TEX_SIZE} px)`);
process.exit(fail ? 1 : 0);
