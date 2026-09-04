// The ground, as a surface rather than a colour.
//
//   import { createTerrainMaterial, layerWeights, packWeights } from './terrain_material.js';
//   const ground = createTerrainMaterial();          // needs a WebGL context
//   ground.material                                   // give it to the chunk meshes
//   ground.setQuality('high' | 'medium' | 'low')
//
// Six layers (grass, dry grass, dirt, rock, sand, snow), each a generated
// tileable set of albedo + roughness + normal + height, uploaded once as two
// sampler2DArrays. chunks.js decides how much of each layer a vertex is and
// writes that into two vec3 attributes; the fragment shader blends the six by
// those weights AND by the layers' own heights, so gravel pokes through thin
// grass instead of dissolving into it.
//
// Nothing here downloads anything. The textures are noise, evaluated in plain
// JavaScript into typed arrays, which is why `buildLayer` runs in node and has
// a test.
//
// Three things the material does that a plain vertex-coloured MeshStandard
// cannot:
//
//   two scales      the same layer sampled at TILE_A and TILE_B metres and
//                   crossfaded by a very low frequency mask, so the eye never
//                   finds the repeat
//   triplanar       on anything steeper than about 35 degrees the world-space
//                   projection switches from top-down to the two side planes,
//                   so a cliff has rock on it instead of smeared rock
//   road as wear    the road weight arrives already faded over ROAD_FADE
//                   metres (chunks.js widens it), reads as packed dirt, damps
//                   the normal detail and lifts the roughness. A footpath, not
//                   a painted band. There are no tyre ruts: nothing in this
//                   world has wheels.
//
// setQuality('medium') drops the second scale. 'low' drops the normal maps and
// the height blend as well, which leaves one array fetch per layer.

import * as THREE from 'three';

export const LAYERS = ['grass', 'dryGrass', 'dirt', 'rock', 'sand', 'snow'];
export const LAYER_INDEX = Object.fromEntries(LAYERS.map((n, i) => [n, i]));

/** Metres one tile of a layer covers, at the two scales. */
export const TILE_A = 3.5;
export const TILE_B = 17.0;
/** Metres over which the road weight reaches zero. chunks.js honours this. */
export const ROAD_FADE = 6;
/** Height in metres at which snow has fully taken over on flat ground. */
export const SNOW_FULL = 84;
export const SNOW_START = 64;
/** Edge of the texture set, in pixels. */
export const TEX_SIZE = 512;

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, t) => a + (b - a) * t;
function smoothstep(e0, e1, v) {
  const t = clamp01((v - e0) / (e1 - e0 || 1e-9));
  return t * t * (3 - 2 * t);
}

// ---------------------------------------------------------------------------
// Layer weights. Pure: no THREE, no textures, and the only thing chunks.js and
// the test both call.
// ---------------------------------------------------------------------------

// The mix a biome starts from, before climate, water, slope, height and roads
// argue. Rows sum to 1, in LAYERS order.
//
// field.js decides a biome with a chain of hard comparisons: boreal below
// temp 0.30, desert above temp 0.58, and so on. A hard comparison in a
// continuous world draws a line, and a line drawn by a threshold on a noise
// field wanders across a flat meadow exactly the way the screenshot showed.
// Measured on the transect at x 1680, the meadow-to-boreal switch at
// z -576 moved the grass weight 0.24 in one tenth of a metre.
//
// So the four vegetated rows are deliberately almost the same, and what
// actually makes a boreal floor stony and a desert sandy is `climate` below,
// which reads the same temperature and moisture the classifier read but with
// no threshold in it anywhere. The row is identity; the continuum is the look.
const BIOME_BASE = {
  ocean:    [0.00, 0.00, 0.42, 0.06, 0.52, 0.00],
  beach:    [0.16, 0.06, 0.12, 0.02, 0.64, 0.00],
  meadow:   [0.82, 0.05, 0.10, 0.03, 0.00, 0.00],
  boreal:   [0.80, 0.04, 0.11, 0.05, 0.00, 0.00],
  desert:   [0.79, 0.07, 0.09, 0.05, 0.00, 0.00],
  sakura:   [0.83, 0.04, 0.10, 0.03, 0.00, 0.00],
  mountain: [0.12, 0.05, 0.18, 0.65, 0.00, 0.00],
  snow:     [0.04, 0.02, 0.06, 0.24, 0.00, 0.64],
};
const ROAD_MIX = [0.00, 0.08, 0.80, 0.06, 0.06, 0.00];
const ROCK_ONLY = [0.00, 0.00, 0.06, 0.94, 0.00, 0.00];
const SNOW_ONLY = [0.00, 0.00, 0.00, 0.08, 0.00, 0.92];
const BED_MIX = [0.00, 0.00, 0.55, 0.08, 0.37, 0.00];
const SAND_ONLY = [0.02, 0.04, 0.08, 0.02, 0.84, 0.00];
const STONY = [0.34, 0.06, 0.36, 0.24, 0.00, 0.00];

const mixInto = (w, target, t) => { for (let i = 0; i < 6; i++) w[i] = lerp(w[i], target[i], t); };

/**
 * What the ground would be if nobody had drawn a biome map: cold ground thin
 * and stony, hot dry ground burnt then sanded over. Continuous in temperature
 * and moisture, with the ramps placed so that most of the change has already
 * happened by the time field.js's classifier flips, which is what keeps the
 * flip from showing.
 *
 * Written in place into `w`. Exported so the test can drive it on its own.
 */
export function climate(w, temp, moist) {
  const cold = smoothstep(0.44, 0.16, temp);
  const hot = smoothstep(0.40, 0.64, temp);
  const arid = smoothstep(0.62, 0.36, moist);
  if (cold > 0) mixInto(w, STONY, cold * 0.62);
  const burn = hot * arid;
  if (burn > 0) {
    // first the green goes, then the sand arrives over it
    const gone = w[0] * burn * 0.92;
    w[0] -= gone; w[1] += gone;
    mixInto(w, SAND_ONLY, burn * burn * 0.80);
  }
  // damp ground anywhere is greener than dry ground
  const damp = smoothstep(0.44, 0.78, moist);
  const back = w[1] * damp * 0.55;
  w[1] -= back; w[0] += back;
  return w;
}

/**
 * How much of each layer is at this point.
 *
 * Order of authority, outermost last, and every one of them a smoothstep:
 * biome row, climate, shoreline, river bed, slope, snow line, road.
 *
 * @param {{h:number, biome:string, moist?:number, temp?:number, river?:number, land?:number}} s
 *        a field.sampleAt result
 * @param {number} slope  sin of the ground angle: 0 flat, 1 vertical.
 *        chunks.js passes sqrt(1 - ny*ny) from the normal it just computed.
 * @param {number} road   0..1, already faded over ROAD_FADE metres
 * @param {Float64Array|number[]} [out]  written in place if given
 * @returns {number[]} six weights, summing to 1, in LAYERS order
 */
export function layerWeights(s, slope = 0, road = 0, out = new Array(6)) {
  const base = BIOME_BASE[s.biome] || BIOME_BASE.meadow;
  for (let i = 0; i < 6; i++) out[i] = base[i];

  const moist = s.moist == null ? 0.5 : s.moist;
  const temp = s.temp == null ? 0.5 : s.temp;
  climate(out, temp, moist);

  // The shore. field.js calls it a beach below 2.2 m where the land mask has
  // not quite closed. Both ramps are placed so that they have all but finished
  // by the moment the classifier flips: at h 2.2 the height ramp reads 0.99,
  // and at land 0.97 the land ramp reads 0.98. That is what makes the flip
  // cost 0.02 instead of 0.35.
  const land = s.land == null ? 1 : s.land;
  const shore = smoothstep(3.6, 2.1, s.h) * smoothstep(0.990, 0.968, land);
  if (shore > 0) mixInto(out, SAND_ONLY, shore);

  // Below the waterline it is all bed.
  const under = smoothstep(0.4, -1.6, s.h);
  if (under > 0) mixInto(out, BED_MIX, under * 0.9);

  // A river bed is gravel and silt, not meadow.
  const river = s.river || 0;
  if (river > 0) mixInto(out, BED_MIX, smoothstep(0.25, 0.75, river) * 0.85);

  // Above the rock line the mountain shows through whatever grew on it.
  const alpine = smoothstep(34, 54, s.h);
  if (alpine > 0) mixInto(out, ROCK_ONLY, alpine * 0.86);

  // Slope shows rock. 0.42 is about 25 degrees, 0.78 about 51.
  if (slope > 0.42) mixInto(out, ROCK_ONLY, smoothstep(0.42, 0.78, slope));

  // Snow settles by height, and slides off anything steep.
  const snow = smoothstep(SNOW_START, SNOW_FULL, s.h) * (1 - smoothstep(0.55, 0.88, slope) * 0.85);
  if (snow > 0) mixInto(out, SNOW_ONLY, snow);

  // The road last, over whatever the ground had become.
  if (road > 0) mixInto(out, ROAD_MIX, clamp01(road) * 0.92);

  let sum = 0;
  for (let i = 0; i < 6; i++) { if (out[i] < 0) out[i] = 0; sum += out[i]; }
  if (sum <= 1e-9) { out[2] = 1; return out; }
  for (let i = 0; i < 6; i++) out[i] /= sum;
  return out;
}

/**
 * The biggest single-step change in any weight that a biome switch can cause,
 * measured across every pair of biome rows at the climate that switch happens
 * at. Everything else in layerWeights is a smoothstep, so this is the whole of
 * the discontinuity budget. A guard, so a row edited to look better cannot
 * quietly put a hard line back across the meadow.
 */
export function biomeStepBudget() {
  const names = Object.keys(BIOME_BASE);
  let worst = 0, pair = '';
  // Only pairs the classifier can actually put next to each other on flat
  // vegetated ground. Ocean, beach, mountain and snow sit at terrain features
  // that the shore, under, alpine and snow ramps have already covered.
  const adjacent = [['meadow', 'boreal'], ['meadow', 'desert'], ['meadow', 'sakura'],
    ['boreal', 'sakura'], ['desert', 'sakura'], ['boreal', 'desert']];
  for (const [a, b] of adjacent) {
    for (let i = 0; i < 6; i++) {
      const d = Math.abs(BIOME_BASE[a][i] - BIOME_BASE[b][i]);
      if (d > worst) { worst = d; pair = `${a}/${b} ${LAYERS[i]}`; }
    }
  }
  return { worst, pair, biomes: names.length };
}

/**
 * The two vec3 attributes the shader reads: A is (grass, dryGrass, dirt),
 * B is (rock, sand, snow). Split this way so six weights fit two attributes
 * with no packing tricks and no precision loss.
 */
export function packWeights(w) {
  return { a: [w[0], w[1], w[2]], b: [w[3], w[4], w[5]] };
}

/**
 * The blend the shader does, in JavaScript, so it can be checked in node.
 * Weights argue with the layers' own surface heights: a layer standing proud
 * wins the pixel even at a smaller weight, which is what stops a linear
 * crossfade looking like a dissolve.
 *
 * @param {number[]} w  six weights
 * @param {number[]} h  six heights, 0..1, from the layer textures
 * @param {number} k    blend sharpness in height units
 * @returns {number[]} six blend factors summing to 1
 */
export function heightBlend(w, h, k = 0.35) {
  let peak = -Infinity;
  for (let i = 0; i < 6; i++) { const v = w[i] + h[i] * k; if (v > peak) peak = v; }
  const out = new Array(6);
  let sum = 0;
  for (let i = 0; i < 6; i++) {
    const v = w[i] * Math.max(w[i] + h[i] * k - peak + k, 0);
    out[i] = v; sum += v;
  }
  if (sum <= 1e-9) { out.fill(0); out[0] = 1; return out; }
  for (let i = 0; i < 6; i++) out[i] /= sum;
  return out;
}

// ---------------------------------------------------------------------------
// Texture generation. Tileable by construction: every lattice index is taken
// modulo the number of cells across the texture, so the left edge and the
// right edge read the same hash.
// ---------------------------------------------------------------------------

function vhash(ix, iy, cx, cy, seed) {
  const i = ((ix % cx) + cx) % cx, j = ((iy % cy) + cy) % cy;
  let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(seed, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) | 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Value noise on a wrapping lattice. u, v in [0, 1). */
function vnoise(u, v, cx, cy, seed) {
  const x = u * cx, y = v * cy;
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const a = vhash(ix, iy, cx, cy, seed), b = vhash(ix + 1, iy, cx, cy, seed);
  const c = vhash(ix, iy + 1, cx, cy, seed), d = vhash(ix + 1, iy + 1, cx, cy, seed);
  const t = a + (b - a) * sx;
  return t + ((c + (d - c) * sx) - t) * sy;
}

/** Octaves of vnoise. cx, cy are the base cell counts and must divide the size. */
export function fbm2(u, v, cx, cy, oct, seed) {
  let sum = 0, amp = 1, norm = 0, fx = cx, fy = cy;
  for (let o = 0; o < oct; o++) {
    sum += amp * vnoise(u, v, fx, fy, seed + o * 101);
    norm += amp; amp *= 0.5; fx *= 2; fy *= 2;
  }
  return sum / norm;
}
const fbm = (u, v, cells, oct, seed) => fbm2(u, v, cells, cells, oct, seed);

/** Wrapping Worley. Returns [F1, F2 - F1], both in cell units. */
export function worley(u, v, cells, seed) {
  const x = u * cells, y = v * cells;
  const ix = Math.floor(x), iy = Math.floor(y);
  let f1 = 9, f2 = 9;
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    const gx = ix + di, gy = iy + dj;
    const px = gx + vhash(gx, gy, cells, cells, seed);
    const py = gy + vhash(gx, gy, cells, cells, seed + 7717);
    const dx = px - x, dy = py - y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
  }
  return [f1, f2 - f1];
}

// Each layer: two colours it runs between, a roughness range, and a shape
// function returning [height 0..1, colour mix 0..1].
const RECIPES = {
  grass: {
    a: [0x39, 0x55, 0x24], b: [0x82, 0xa0, 0x4a], rough: [0.94, 0.80], bump: 1.5,
    shape(u, v, s) {
      const blade = fbm2(u, v, 192, 64, 3, s);          // strokes, 3 to 1, not fur
      const clump = fbm(u, v, 16, 4, s + 7);
      const dead = fbm(u, v, 64, 3, s + 23);
      return [clamp01(0.30 + 0.52 * blade + 0.34 * (clump - 0.5)),
        clamp01(0.46 + 1.15 * (clump - 0.5) + 0.55 * (blade - 0.5) + 0.25 * (dead - 0.5))];
    },
  },
  dryGrass: {
    a: [0x7c, 0x6f, 0x3b], b: [0xc4, 0xb0, 0x6c], rough: [0.96, 0.86], bump: 1.4,
    shape(u, v, s) {
      const blade = fbm2(u, v, 160, 48, 3, s);
      const clump = fbm(u, v, 10, 4, s + 13);
      return [clamp01(0.28 + 0.48 * blade + 0.42 * (clump - 0.5)),
        clamp01(0.42 + 1.35 * (clump - 0.5) + 0.45 * (blade - 0.5))];
    },
  },
  dirt: {
    a: [0x46, 0x35, 0x25], b: [0x8a, 0x71, 0x53], rough: [0.98, 0.88], bump: 2.2,
    shape(u, v, s) {
      const grain = fbm(u, v, 192, 4, s);
      const [f1] = worley(u, v, 32, s + 3);
      const peb = clamp01(1 - f1 * 1.9);
      const clod = fbm(u, v, 24, 3, s + 11);
      return [clamp01(0.26 + 0.30 * grain + 0.50 * peb * peb + 0.24 * (clod - 0.5)),
        clamp01(0.44 + 1.05 * (clod - 0.5) + 0.60 * peb + 0.30 * (grain - 0.5))];
    },
  },
  rock: {
    a: [0x4a, 0x47, 0x44], b: [0x9c, 0x97, 0x8f], rough: [0.90, 0.62], bump: 3.4,
    shape(u, v, s) {
      const [, edge] = worley(u, v, 12, s);
      const crack = clamp01(1 - edge * 5.5);            // 1 on a plate boundary
      const ridged = 1 - Math.abs(2 * fbm(u, v, 48, 5, s + 5) - 1);
      const fine = fbm(u, v, 320, 3, s + 9);
      return [clamp01(0.58 + 0.34 * ridged - 0.62 * crack + 0.16 * (fine - 0.5)),
        clamp01(0.38 + 1.25 * (ridged - 0.5) + 0.35 * (fine - 0.5) - 0.35 * crack)];
    },
  },
  sand: {
    a: [0xa8, 0x8f, 0x62], b: [0xe0, 0xcd, 0xa2], rough: [0.92, 0.78], bump: 1.2,
    shape(u, v, s) {
      const warp = fbm(u, v, 8, 2, s) - 0.5;
      const ripple = 0.5 + 0.5 * Math.sin((u * 14 + v * 3 + warp * 1.6) * Math.PI * 2);
      const grain = fbm(u, v, 384, 3, s + 2);
      const dune = fbm(u, v, 6, 3, s + 17);
      return [clamp01(0.34 + 0.34 * ripple * ripple + 0.20 * (grain - 0.5) + 0.28 * (dune - 0.5)),
        clamp01(0.48 + 0.9 * (dune - 0.5) + 0.5 * (ripple - 0.5))];
    },
  },
  snow: {
    a: [0xc4, 0xd2, 0xe4], b: [0xff, 0xff, 0xff], rough: [0.72, 0.40], bump: 1.0,
    shape(u, v, s) {
      const dune = fbm(u, v, 9, 3, s);
      const grain = fbm(u, v, 288, 3, s + 4);
      const [f1] = worley(u, v, 160, s + 8);
      const sparkle = clamp01(1 - f1 * 3.2);
      return [clamp01(0.44 + 0.46 * (dune - 0.5) + 0.14 * (grain - 0.5) + 0.10 * sparkle),
        clamp01(0.52 + 1.5 * (dune - 0.5) + 0.5 * sparkle)];
    },
  },
};

/**
 * One layer's height and colour-mix fields. Pure, runs in node, and is what
 * the texture bytes are derived from.
 */
export function buildLayer(name, size = TEX_SIZE, seed = 1) {
  const r = RECIPES[name];
  if (!r) throw new Error(`terrain_material: no recipe for layer "${name}"`);
  const px = size * size;
  const h = new Float32Array(px), m = new Float32Array(px);
  for (let j = 0; j < size; j++) {
    const v = j / size;
    for (let i = 0; i < size; i++) {
      const k = j * size + i;
      const o = r.shape(i / size, v, seed);
      h[k] = o[0]; m[k] = o[1];
    }
  }
  return { name, size, h, m };
}

/**
 * The two RGBA byte planes for one layer.
 *   albedo: rgb sRGB colour, a = roughness
 *   normal: rgb tangent-space normal (z up), a = surface height
 * Both wrap, because the height field wraps and the derivative is taken
 * modulo the size.
 */
export function layerTextures(name, size = TEX_SIZE, seed = 1) {
  const { h, m } = buildLayer(name, size, seed);
  const r = RECIPES[name];
  const alb = new Uint8Array(size * size * 4);
  const nrm = new Uint8Array(size * size * 4);
  const [ar, ag, ab] = r.a, [br, bg, bb] = r.b;
  const [r0, r1] = r.rough;
  const bump = r.bump * size / 512;      // keep the slope constant across sizes
  for (let j = 0; j < size; j++) {
    const jm = ((j - 1) + size) % size, jp = (j + 1) % size;
    for (let i = 0; i < size; i++) {
      const k = j * size + i, o = k * 4;
      const im = ((i - 1) + size) % size, ip = (i + 1) % size;
      const t = m[k], hh = h[k];
      const shade = 0.70 + 0.44 * hh;
      alb[o] = Math.min(255, Math.round(lerp(ar, br, t) * shade));
      alb[o + 1] = Math.min(255, Math.round(lerp(ag, bg, t) * shade));
      alb[o + 2] = Math.min(255, Math.round(lerp(ab, bb, t) * shade));
      alb[o + 3] = Math.round(clamp01(lerp(r0, r1, t)) * 255);
      const dx = (h[j * size + im] - h[j * size + ip]) * bump;
      const dz = (h[jm * size + i] - h[jp * size + i]) * bump;
      const inv = 1 / Math.sqrt(dx * dx + dz * dz + 1);
      nrm[o] = Math.round((dx * inv * 0.5 + 0.5) * 255);
      nrm[o + 1] = Math.round((dz * inv * 0.5 + 0.5) * 255);
      nrm[o + 2] = Math.round((inv * 0.5 + 0.5) * 255);
      nrm[o + 3] = Math.round(hh * 255);
    }
  }
  return { albedo: alb, normal: nrm, size };
}

/** Every layer, packed into the two array-texture payloads, in LAYERS order. */
export function buildTextureArrays(size = TEX_SIZE, seed = 1) {
  const per = size * size * 4;
  const albedo = new Uint8Array(per * LAYERS.length);
  const normal = new Uint8Array(per * LAYERS.length);
  LAYERS.forEach((name, i) => {
    const t = layerTextures(name, size, seed + i * 977);
    albedo.set(t.albedo, per * i);
    normal.set(t.normal, per * i);
  });
  return { albedo, normal, size, depth: LAYERS.length };
}

// ---------------------------------------------------------------------------
// The shader.
// ---------------------------------------------------------------------------

const VERT_HEAD = /* glsl */`
attribute vec3 aLayerA;
attribute vec3 aLayerB;
attribute float aRoad;
varying vec3 vLayA;
varying vec3 vLayB;
varying float vRoad;
varying vec3 vWPos;
varying vec3 vWNrm;
`;

const VERT_BODY = /* glsl */`
vLayA = aLayerA;
vLayB = aLayerB;
vRoad = aRoad;
vWPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
vWNrm = normalize( mat3( modelMatrix ) * objectNormal );
`;

const FRAG_HEAD = /* glsl */`
uniform sampler2DArray uTerAlbedo;
uniform sampler2DArray uTerNormal;
uniform vec2 uTerTile;         // metres per tile, scale A then scale B
uniform float uTerDetail;      // normal strength
uniform float uTerTint;        // how much of the biome vertex colour survives
uniform float uTerBlend;       // height blend sharpness
uniform vec2 uTerFade;         // metres over which the fine scale fades out
varying vec3 vLayA;
varying vec3 vLayB;
varying float vRoad;
varying vec3 vWPos;
varying vec3 vWNrm;

void terLayers( vec2 uv, out vec3 alb, out float rgh, out vec3 nrm ) {
  float w[6];
  w[0] = vLayA.x; w[1] = vLayA.y; w[2] = vLayA.z;
  w[3] = vLayB.x; w[4] = vLayB.y; w[5] = vLayB.z;
  float b[6];
  #ifdef TER_HEIGHT_BLEND
    float peak = -1e9;
    vec4 n[6];
    for ( int i = 0; i < 6; i ++ ) {
      n[ i ] = texture2D( uTerNormal, vec3( uv, float( i ) ) );
      peak = max( peak, w[ i ] + n[ i ].a * uTerBlend );
    }
    float tot = 0.0;
    for ( int i = 0; i < 6; i ++ ) {
      b[ i ] = w[ i ] * max( w[ i ] + n[ i ].a * uTerBlend - peak + uTerBlend, 0.0 );
      tot += b[ i ];
    }
    if ( tot < 1e-5 ) { b[0] = 1.0; tot = 1.0; }
    nrm = vec3( 0.0 );
    for ( int i = 0; i < 6; i ++ ) {
      b[ i ] /= tot;
      nrm += ( n[ i ].xyz * 2.0 - 1.0 ) * b[ i ];
    }
  #else
    float tot = 0.0;
    for ( int i = 0; i < 6; i ++ ) { b[ i ] = w[ i ]; tot += w[ i ]; }
    if ( tot < 1e-5 ) { b[0] = 1.0; tot = 1.0; }
    for ( int i = 0; i < 6; i ++ ) b[ i ] /= tot;
    nrm = vec3( 0.0, 0.0, 1.0 );
  #endif
  alb = vec3( 0.0 );
  rgh = 0.0;
  for ( int i = 0; i < 6; i ++ ) {
    vec4 a = texture2D( uTerAlbedo, vec3( uv, float( i ) ) );
    alb += a.rgb * b[ i ];
    rgh += a.a * b[ i ];
  }
}

// Whiteout blend: fold three tangent-space normals onto the geometric normal
// without ever needing a tangent attribute.
vec3 terWhiteout( vec3 g, vec3 nx, vec3 ny, vec3 nz, vec3 bw ) {
  vec3 tx = vec3( nx.xy + g.zy, abs( nx.z ) * g.x );
  vec3 ty = vec3( ny.xy + g.xz, abs( ny.z ) * g.y );
  vec3 tz = vec3( nz.xy + g.xy, abs( nz.z ) * g.z );
  return normalize( tx.zyx * bw.x + ty.xzy * bw.y + tz.xyz * bw.z );
}

void terSurface( out vec3 alb, out float rgh, out vec3 wn ) {
  vec3 g = normalize( vWNrm );
  vec3 bw = pow( abs( g ), vec3( 5.0 ) );
  bw /= max( bw.x + bw.y + bw.z, 1e-5 );

  float dist = length( vViewPosition );
  float fine = 1.0 - smoothstep( uTerFade.x, uTerFade.y, dist );

  vec3 aY, aX, aZ, nY, nX, nZ;
  float rY, rX, rZ;
  terLayers( vWPos.xz / uTerTile.x, aY, rY, nY );
  alb = aY * bw.y; rgh = rY * bw.y;
  vec3 nyv = nY, nxv = vec3( 0.0, 0.0, 1.0 ), nzv = vec3( 0.0, 0.0, 1.0 );
  if ( bw.x > 0.004 ) {
    terLayers( vWPos.zy / uTerTile.x, aX, rX, nX );
    alb += aX * bw.x; rgh += rX * bw.x; nxv = nX;
  }
  if ( bw.z > 0.004 ) {
    terLayers( vWPos.xy / uTerTile.x, aZ, rZ, nZ );
    alb += aZ * bw.z; rgh += rZ * bw.z; nzv = nZ;
  }

  #ifdef TER_TWO_SCALE
    // The same ground much larger, crossfaded by a very slow mask, so the
    // TILE_A repeat never resolves into a grid.
    vec3 bAlb; float bRgh; vec3 bNrm;
    terLayers( vWPos.xz / uTerTile.y, bAlb, bRgh, bNrm );
    // The mask is the dirt layer's HEIGHT channel, at about 80 m a tile.
    // The albedo array would have been the obvious thing to read, and was,
    // and was wrong: it is an sRGB texture, so the sampler decodes it and a
    // mid brown comes back as 0.03 to 0.32 linear, which never crosses a
    // threshold placed at 0.5 and left the second scale contributing exactly
    // nothing. The height channel is in the normal array, which is linear.
    float mask = texture2D( uTerNormal, vec3( vWPos.xz / ( uTerTile.y * 4.7 ), 2.0 ) ).a;
    float k = smoothstep( 0.34, 0.62, mask ) * 0.55 * bw.y;
    alb = mix( alb, bAlb, k );
    rgh = mix( rgh, bRgh, k );
    nyv = mix( nyv, bNrm, k );
  #endif

  vec3 detail = terWhiteout( g, nxv, nyv, nzv, bw );
  float strength = uTerDetail * fine * mix( 1.0, 0.35, vRoad );
  wn = normalize( mix( g, detail, clamp( strength, 0.0, 1.0 ) ) );

  // A worn track: the dirt is already in the weights, this is what feet do to
  // it. Darker, flatter, duller. No ruts; nothing here has wheels.
  alb *= mix( 1.0, 0.80, vRoad );
  rgh = mix( rgh, 0.95, vRoad * 0.55 );
}
`;

const FRAG_MAP = /* glsl */`
vec3 terAlb; float terRgh; vec3 terWN;
terSurface( terAlb, terRgh, terWN );
#ifdef USE_COLOR
  // The biome tint, divided by its own luminance so it shifts the hue and
  // leaves the brightness to the layer textures. A straight multiply by a
  // vertex colour would darken a meadow by two thirds and undo the whole
  // point of authoring an albedo.
  //
  // And none of it on a road. chunks.js still paints the field's own narrow
  // road strength into the vertex colour, because that is the contract the
  // rest of the world reads; it aliases over 1.8 m against a 2 to 8 m vertex
  // spacing, which was half of what made the bands. Fading the tint out
  // wherever aRoad is anything at all takes that path off the screen and
  // leaves the road to the dirt layer, which is smooth.
  // three declares vColor as a vec4 whether or not alpha is in use, so .rgb
  // and never the bare name. It compiled as a vec3 in older revisions, which
  // is exactly the kind of thing only a real compile catches.
  float terLum = dot( vColor.rgb, vec3( 0.2126, 0.7152, 0.0722 ) );
  vec3 terHue = vColor.rgb / max( terLum, 1e-4 );
  float terTintK = uTerTint * ( 1.0 - smoothstep( 0.0, 0.25, vRoad ) );
  terAlb *= mix( vec3( 1.0 ), terHue, terTintK );
#endif
diffuseColor.rgb *= terAlb;
`;

const FRAG_ROUGH = /* glsl */`
float roughnessFactor = clamp( roughness * terRgh, 0.04, 1.0 );
`;

const FRAG_NORMAL = /* glsl */`
normal = normalize( ( viewMatrix * vec4( terWN, 0.0 ) ).xyz );
nonPerturbedNormal = normal;
`;

/** Every string this material replaces, so a test can prove they still exist. */
export const SHADER_HOOKS = {
  vertex: ['#include <common>', '#include <project_vertex>'],
  fragment: ['#include <common>', '#include <color_fragment>', '#include <map_fragment>',
    '#include <roughnessmap_fragment>', '#include <normal_fragment_maps>'],
};

export const QUALITY = ['low', 'medium', 'high'];

/**
 * The ground material. Needs a document only for nothing at all: the textures
 * are typed arrays, so this constructs in node too, which is how the test
 * checks the uniforms and the defines.
 *
 * @param {object} opts
 * @param {number} [opts.size]     texture edge in pixels, default TEX_SIZE
 * @param {number} [opts.seed]
 * @param {string} [opts.quality]  'low' | 'medium' | 'high'
 * @param {number} [opts.tint]     0..1 how much biome vertex colour tints
 */
export function createTerrainMaterial(opts = {}) {
  const size = opts.size ?? TEX_SIZE;
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const data = buildTextureArrays(size, opts.seed ?? 1);
  const genMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;

  const albedoTex = new THREE.DataArrayTexture(data.albedo, size, size, data.depth);
  albedoTex.format = THREE.RGBAFormat;
  albedoTex.type = THREE.UnsignedByteType;
  albedoTex.colorSpace = THREE.SRGBColorSpace;
  const normalTex = new THREE.DataArrayTexture(data.normal, size, size, data.depth);
  normalTex.format = THREE.RGBAFormat;
  normalTex.type = THREE.UnsignedByteType;
  normalTex.colorSpace = THREE.NoColorSpace;
  for (const t of [albedoTex, normalTex]) {
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = opts.anisotropy ?? 8;
    t.needsUpdate = true;
  }

  const uniforms = {
    uTerAlbedo: { value: albedoTex },
    uTerNormal: { value: normalTex },
    uTerTile: { value: new THREE.Vector2(TILE_A, TILE_B) },
    uTerDetail: { value: opts.detail ?? 0.85 },
    uTerTint: { value: opts.tint ?? 0.42 },
    uTerBlend: { value: 0.35 },
    uTerFade: { value: new THREE.Vector2(140, 320) },
  };

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 1, metalness: 0, color: 0xffffff,
  });
  material.name = 'terrain';
  material.userData.terrain = uniforms;

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_HEAD)
      .replace('#include <project_vertex>', '#include <project_vertex>\n' + VERT_BODY);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_HEAD)
      .replace('#include <color_fragment>', '')
      .replace('#include <map_fragment>', FRAG_MAP)
      .replace('#include <roughnessmap_fragment>', FRAG_ROUGH)
      .replace('#include <normal_fragment_maps>', FRAG_NORMAL);
    material.userData.shader = shader;
  };

  let quality = null;
  function setQuality(q) {
    if (!QUALITY.includes(q)) throw new Error(`terrain_material: unknown quality "${q}"`);
    if (q === quality) return quality;
    quality = q;
    const two = q === 'high';
    const heights = q !== 'low';
    if (two) material.defines.TER_TWO_SCALE = ''; else delete material.defines.TER_TWO_SCALE;
    if (heights) material.defines.TER_HEIGHT_BLEND = ''; else delete material.defines.TER_HEIGHT_BLEND;
    uniforms.uTerDetail.value = heights ? (opts.detail ?? 0.85) : 0;
    material.needsUpdate = true;
    return quality;
  }
  material.defines = material.defines || {};
  setQuality(opts.quality ?? 'high');

  return {
    material, uniforms, genMs, size,
    get quality() { return quality; },
    setQuality,
    /** Metres per tile at the two scales, for anything that wants to match. */
    tiles: [TILE_A, TILE_B],
    dispose() { material.dispose(); albedoTex.dispose(); normalTex.dispose(); },
  };
}
