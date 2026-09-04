// Trees that were grown, not assembled.
//
// A sphere on a cylinder is a diagram of a tree. This module grows one: a
// tapered trunk that leans and wanders, branches that split off it in a
// phyllotactic spiral (or in whorls, for the conifers), each generation
// shorter and thinner than its parent, each segment pulled up by light and
// down by its own weight, and leaves hung on the outer wood as crossed quads
// carrying a generated alpha texture of real leaf silhouettes.
//
//   const t = growTree('oak', 12345);
//   t.trunk   BufferGeometry: position, normal, uv, aWind
//   t.leaves  BufferGeometry: position, normal, uv, color, aWind  (or null)
//   t.height / t.radius / t.canopyY / t.tris
//
//   const vs = buildTreeVariants('oak', seed, 6);   // baked, ready to instance
//   const m  = materialsFor('oak');                 // { bark, leaf, leafDepth }
//   tickWind(seconds)                               // once a frame, anywhere
//
// Everything here runs in node. There is no canvas: bark and leaf textures are
// rasterised into typed arrays and handed to THREE.DataTexture, so the same
// code that ships is the code the test measures. `npm test` counts the
// triangles of every species and fails if one grows past its budget.
//
// Origin and orientation: the base of the trunk sits at (0, 0, 0) and the tree
// grows up +y, so an instance matrix only has to place the ground point. That
// is the contract flora.js relies on.

import * as THREE from 'three';
import { mulberry32, rand2, clamp01, lerp, smoothstep } from './noise.js';

const UP = new THREE.Vector3(0, 1, 0);
const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
/** Golden angle: what a real shoot puts between one bud and the next. */
export const PHYLLOTAXIS = 137.507764 * DEG;

// ---------------------------------------------------------------------------
// Tileable value noise, for the textures. Separate periods in x and y so bark
// fibres can run twenty times as far along the trunk as they do around it.
// ---------------------------------------------------------------------------

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const wrap = (i, n) => ((i % n) + n) % n;

/** Value noise in [0, 1), tileable over one unit with periods gx by gy. */
export function vnoise(x, y, gx, gy, seed) {
  const fx = x * gx, fy = y * gy;
  const xi = Math.floor(fx), yi = Math.floor(fy);
  const u = fade(fx - xi), v = fade(fy - yi);
  const x0 = wrap(xi, gx), x1 = wrap(xi + 1, gx);
  const y0 = wrap(yi, gy), y1 = wrap(yi + 1, gy);
  const a = rand2(x0, y0, seed), b = rand2(x1, y0, seed);
  const c = rand2(x0, y1, seed), d = rand2(x1, y1, seed);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

/** Octaves of vnoise, still tileable. Returns roughly [0, 1]. */
export function fbm2(x, y, gx, gy, octaves, seed) {
  let amp = 1, sum = 0, norm = 0, ax = gx, ay = gy;
  for (let o = 0; o < octaves; o++) {
    sum += amp * vnoise(x, y, ax, ay, seed + o * 131);
    norm += amp;
    amp *= 0.5; ax *= 2; ay *= 2;
  }
  return sum / norm;
}

/** Value noise in 3D, for boulders and for anything that is not a plane. */
export function noise3(x, y, z, seed = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const u = fade(x - xi), v = fade(y - yi), w = fade(z - zi);
  const at = (i, j, k) => rand2(i * 73856093 ^ k * 19349663, j, seed);
  const c000 = at(xi, yi, zi), c100 = at(xi + 1, yi, zi);
  const c010 = at(xi, yi + 1, zi), c110 = at(xi + 1, yi + 1, zi);
  const c001 = at(xi, yi, zi + 1), c101 = at(xi + 1, yi, zi + 1);
  const c011 = at(xi, yi + 1, zi + 1), c111 = at(xi + 1, yi + 1, zi + 1);
  return lerp(
    lerp(lerp(c000, c100, u), lerp(c010, c110, u), v),
    lerp(lerp(c001, c101, u), lerp(c011, c111, u), v), w);
}

/** Octaves of noise3 in [0, 1]. */
export function fbm3(x, y, z, octaves = 4, seed = 0) {
  let amp = 1, f = 1, sum = 0, norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise3(x * f + o * 13.1, y * f - o * 7.7, z * f + o * 3.3, seed + o * 977);
    norm += amp; amp *= 0.5; f *= 2;
  }
  return sum / norm;
}

/**
 * fbm2 rendered once into a coarse grid, to be read back bilinearly.
 *
 * A 512 px bark map that called fbm2 twice per texel cost 160 to 260 ms per
 * species, which is a quarter of a second of frozen frame the first time a
 * player walks into a new forest. The low octaves carry no detail a 512 px
 * grid could show anyway, so they are rendered at `n` and upsampled; only the
 * finest grain stays at full resolution. Measured: 250 ms down to 80.
 */
function fbmField(n, gx, gy, octaves, seed) {
  const out = new Float32Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) out[y * n + x] = fbm2(x / n, y / n, gx, gy, octaves, seed);
  return out;
}

/** Bilinear read of a wrapping field at (u, v) in [0, 1). */
function readField(f, n, u, v) {
  const fx = u * n, fy = v * n;
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const a = fx - x0, b = fy - y0;
  const xa = wrap(x0, n), xb = wrap(x0 + 1, n), ya = wrap(y0, n), yb = wrap(y0 + 1, n);
  return lerp(lerp(f[ya * n + xa], f[ya * n + xb], a), lerp(f[yb * n + xa], f[yb * n + xb], a), b);
}

// ---------------------------------------------------------------------------
// Texture synthesis. No canvas: RGBA bytes into a DataTexture.
// ---------------------------------------------------------------------------

function dataTexture(rgba, size, { srgb = false, repeat = true } = {}) {
  const t = new THREE.DataTexture(rgba, size, size, THREE.RGBAFormat);
  if (srgb && THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

/**
 * A height field turned into a tangent-space normal map. `h` is a Float32Array
 * of size*size in [0, 1]; `strength` is how many height units a pixel step is
 * worth. Wraps, so the normal map tiles with the albedo it came from.
 */
function normalFromHeight(h, size, strength) {
  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const l = h[y * size + wrap(x - 1, size)], r = h[y * size + wrap(x + 1, size)];
      const d = h[wrap(y - 1, size) * size + x], u = h[wrap(y + 1, size) * size + x];
      let nx = (l - r) * strength, ny = (d - u) * strength, nz = 1;
      const inv = 1 / Math.hypot(nx, ny, nz);
      nx *= inv; ny *= inv; nz *= inv;
      const k = (y * size + x) * 4;
      out[k] = (nx * 0.5 + 0.5) * 255;
      out[k + 1] = (ny * 0.5 + 0.5) * 255;
      out[k + 2] = (nz * 0.5 + 0.5) * 255;
      out[k + 3] = 255;
    }
  }
  return out;
}

/**
 * Linear light to an sRGB byte.
 *
 * three's ColorManagement is on, so `new THREE.Color(0x6b5240)` holds LINEAR
 * values, and a DataTexture tagged SRGBColorSpace is decoded again on the GPU.
 * Writing `c.r * 255` therefore darkened every generated texture twice over:
 * fir bark came out at a mean red of 10 instead of 107. Blend in linear, encode
 * on the way into the byte array.
 */
const SRGB_LUT = (() => {
  const n = 1024, t = new Uint8Array(n + 1);
  for (let i = 0; i <= n; i++) {
    const c = i / n;
    t[i] = Math.round((c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055) * 255);
  }
  return t;
})();
export const encodeSRGB = (v) => SRGB_LUT[v <= 0 ? 0 : v >= 1 ? 1024 : (v * 1024 + 0.5) | 0];

const hsl = (h, s, l) => {
  const c = new THREE.Color();
  c.setHSL(h, s, l);
  return c;
};

/**
 * Bark for one species: albedo, normal and roughness at BARK_SIZE, generated
 * once and shared by every variant and every instance.
 *
 * UV convention set by addTube: u runs around the trunk, v runs along it. Bark
 * fibres therefore have a short period in u and a long one in v.
 */
export const BARK_SIZE = 512;
const barkCache = new Map();

export function barkTextures(species) {
  if (barkCache.has(species)) return barkCache.get(species);
  const P = SPECIES[species];
  if (!P) throw new Error(`tree_gen: no species "${species}"`);
  const S = BARK_SIZE, seed = P.texSeed, H = S >> 1;
  const fFibre = fbmField(H, P.bark.fibreU, P.bark.fibreV, 4, seed);
  const fPlate = fbmField(H, P.bark.plateU, P.bark.plateV, 3, seed + 811);
  const fBleach = P.bark.marks === 'bleach' ? fbmField(H, 4, 6, 3, seed + 99) : null;
  const alb = new Uint8Array(S * S * 4);
  const rough = new Uint8Array(S * S * 4);
  const height = new Float32Array(S * S);
  const base = new THREE.Color(P.bark.base);
  const dark = new THREE.Color(P.bark.dark);
  const c = new THREE.Color();
  // allocated once: these used to be `new THREE.Color(...)` inside the texel
  // loop, which is 262,144 allocations and colour-space conversions per map
  const MARK = new THREE.Color(0x201b16);
  const PEEL = new THREE.Color(0xf4f1e8);
  const BLEACH = new THREE.Color(0xb9b4a6);

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S;
      // long vertical fibres, then coarse plates, then fine grain
      const fibre = readField(fFibre, H, u, v);
      const plate = readField(fPlate, H, u, v);
      const grain = vnoise(u, v, 96, 24, seed + 1301);
      // ridges: the zero set of the fibre field, sharpened, is a crack
      const crack = Math.pow(1 - Math.abs(fibre * 2 - 1), P.bark.crackPow);
      let hgt = clamp01(0.42 + (plate - 0.5) * 0.9 + (fibre - 0.5) * 0.7 - crack * P.bark.crackDepth);
      hgt = clamp01(hgt + (grain - 0.5) * 0.12);

      let k = clamp01(hgt * 0.9 + (grain - 0.5) * 0.25);
      c.copy(dark).lerp(base, k);
      // species marks: birch lenticels, palm ring scars, dead-wood bleaching
      if (P.bark.marks === 'lenticel') {
        const band = vnoise(u, v, 5, 34, seed + 77);
        const dash = vnoise(u, v, 20, 90, seed + 78);
        const m = smoothstep(0.62, 0.80, band) * smoothstep(0.55, 0.72, dash);
        c.lerp(MARK, m * 0.92);
        hgt -= m * 0.25;
        // papery peel highlights
        c.lerp(PEEL, smoothstep(0.70, 0.95, plate) * 0.5);
      } else if (P.bark.marks === 'ring') {
        const ring = Math.abs(Math.sin(v * Math.PI * P.bark.ringCount + fibre * 1.4));
        const m = 1 - smoothstep(0.05, 0.35, ring);
        c.lerp(dark, m * 0.7);
        hgt -= m * 0.3;
      } else if (P.bark.marks === 'bleach') {
        const bl = readField(fBleach, H, u, v);
        c.lerp(BLEACH, smoothstep(0.45, 0.85, bl) * 0.65);
      }

      const i = (y * S + x) * 4;
      alb[i] = encodeSRGB(c.r); alb[i + 1] = encodeSRGB(c.g); alb[i + 2] = encodeSRGB(c.b); alb[i + 3] = 255;
      height[y * S + x] = hgt;
      // deep cracks are rougher and darker than raised plates
      const rg = clamp01(P.bark.rough - hgt * 0.30 + (grain - 0.5) * 0.10);
      rough[i] = 255; rough[i + 1] = rg * 255; rough[i + 2] = 0; rough[i + 3] = 255;
    }
  }
  const out = {
    map: dataTexture(alb, S, { srgb: true }),
    normalMap: dataTexture(normalFromHeight(height, S, P.bark.normalStrength), S),
    roughnessMap: dataTexture(rough, S),
  };
  barkCache.set(species, out);
  return out;
}

/**
 * Leaves for one species: a 2 by 2 atlas of sprigs, each a stem with a handful
 * of leaves on it, alpha cut. The texture is deliberately pale: the hue comes
 * from the per-cluster vertex colour, so one texture dresses a summer oak, an
 * autumn oak and a sakura in bloom.
 */
export const LEAF_SIZE = 512;
export const LEAF_CELLS = 2;              // 2 x 2 sprigs in the atlas
const leafCache = new Map();

export function leafTexture(species) {
  if (leafCache.has(species)) return leafCache.get(species);
  const P = SPECIES[species];
  if (!P || !P.leaf) return null;
  const S = LEAF_SIZE, C = LEAF_CELLS, cell = S / C;
  const px = new Uint8Array(S * S * 4);      // starts fully transparent
  const rng = mulberry32(P.texSeed ^ 0x5eaf);
  const L = P.leaf;

  // one sprig into cell (cx, cy)
  for (let cy = 0; cy < C; cy++) for (let cx = 0; cx < C; cx++) {
    const ox = cx * cell, oy = cy * cell;
    const shapes = [];                       // { x, y, ang, len, wid, tint, kind }
    const n = L.perSprig[0] + Math.floor(rng() * (L.perSprig[1] - L.perSprig[0] + 1));
    const stemLen = cell * (0.70 + rng() * 0.22);
    const bow = (rng() * 2 - 1) * cell * 0.14;
    const stemAt = (t) => ({ x: cell * 0.5 + bow * t * t, y: cell * 0.06 + stemLen * t });
    for (let i = 0; i < n; i++) {
      const t = L.fromBase + (1 - L.fromBase) * ((i + 0.5) / n) + (rng() - 0.5) * 0.06;
      const s = stemAt(t);
      const side = i % 2 === 0 ? 1 : -1;
      const spread = L.spread[0] + rng() * (L.spread[1] - L.spread[0]);
      shapes.push({
        x: s.x, y: s.y,
        ang: side * spread * DEG + (rng() - 0.5) * 0.25,
        len: cell * L.len * (0.72 + rng() * 0.5) * (L.taperUp ? 1 - t * 0.35 : 1),
        wid: L.wid * (0.85 + rng() * 0.3),
        tint: 0.78 + rng() * 0.22,
        hue: (rng() - 0.5) * L.hueJitter,
      });
    }
    if (L.kind === 'blossom') {
      // a few open flowers instead of a leaf at every node
      for (const sh of shapes) sh.petals = 5;
    }

    const put = (x, y, r, g, b, a) => {
      if (x < 0 || y < 0 || x >= cell || y >= cell) return;
      const i = ((oy + (cell - 1 - (y | 0))) * S + ox + (x | 0)) * 4;
      if (px[i + 3] >= a * 255) return;
      px[i] = encodeSRGB(r); px[i + 1] = encodeSRGB(g); px[i + 2] = encodeSRGB(b); px[i + 3] = a * 255;
    };

    // the stem, drawn first so leaves cover its joints
    if (L.stem) {
      for (let s = 0; s <= 220; s++) {
        const t = s / 220, p = stemAt(t), w = L.stemW * (1.2 - t * 0.8);
        for (let dx = -w; dx <= w; dx += 0.6) for (let dy = -w; dy <= w; dy += 0.6) {
          put(p.x + dx, p.y + dy, 0.42, 0.34, 0.22, 1);
        }
      }
    }

    for (const sh of shapes) {
      // the leaf's own colour, computed once: hsl() inside the texel loop was
      // an allocation and an HSL conversion per pixel of every leaf
      const leafCol = hsl(clamp01(L.baseHue + sh.hue), L.baseSat, L.baseLum);
      const ca = Math.cos(sh.ang), sa = Math.sin(sh.ang);
      const half = sh.len * sh.wid;
      const bb = Math.ceil(sh.len + half) + 2;
      for (let dy = -bb; dy <= bb; dy++) for (let dx = -bb; dx <= bb; dx++) {
        const X = sh.x + dx, Y = sh.y + dy;
        // into leaf-local space: `a` along the leaf, `b` across it
        const lx = dx, ly = dy;
        const a = lx * sa + ly * ca;              // ang measured from +y
        const b = lx * ca - ly * sa;
        const t = a / sh.len;
        if (t < 0 || t > 1) continue;
        const hw = halfWidth(L.kind, t, sh) * sh.len;
        if (hw <= 0 || Math.abs(b) > hw) continue;
        const edge = Math.abs(b) / hw;
        // midrib bright, edges a shade darker, tip paler
        const shade = sh.tint * (1 - edge * edge * 0.22) * (0.88 + 0.18 * t);
        put(X, Y, leafCol.r * shade, leafCol.g * shade, leafCol.b * shade, 1);
      }
    }
  }
  const t = dataTexture(px, S, { srgb: true, repeat: false });
  leafCache.set(species, t);
  return t;
}

/** Leaf outline: half width at t along the leaf, as a fraction of its length. */
function halfWidth(kind, t, sh) {
  const s = Math.sin(Math.PI * clamp01(t));
  switch (kind) {
    case 'lobed':                                    // oak: five or so lobes a side
      return sh.wid * Math.pow(s, 0.55) * (0.78 + 0.34 * Math.abs(Math.sin(t * Math.PI * 3.5)));
    case 'ovate':                                    // birch, sakura leaves
      return sh.wid * Math.pow(s, 0.62) * (1 - t * 0.18);
    case 'lanceolate':                               // willow: long and narrow
      return sh.wid * Math.pow(s, 1.35);
    case 'needle':                                   // pine, fir
      return sh.wid * (t < 0.9 ? 1 : (1 - t) * 10);
    case 'pinnate':                                  // palm frond leaflet
      return sh.wid * (t < 0.85 ? 0.6 + 0.4 * s : (1 - t) * 6);
    case 'blossom': {                                // five petals about a centre
      const petal = Math.abs(Math.cos((t * 0.5 + 0.25) * Math.PI * 2));
      return sh.wid * Math.pow(s, 0.5) * (0.6 + 0.7 * petal);
    }
    default:
      return sh.wid * s;
  }
}

// ---------------------------------------------------------------------------
// Species. Every number here is read by growTree; nothing is decorative.
// ---------------------------------------------------------------------------

export const SPECIES = {
  oak: {
    height: [7.0, 11.0], trunkR: 0.052, levels: 3,
    segs: [9, 6, 5, 4], radial: [10, 7, 5, 4], taper: [0.30, 0.42, 0.5, 0.6],
    children: [4, 3, 3], lenRatio: [[0.46, 0.58], [0.42, 0.54], [0.36, 0.48]], radRatio: 0.66,
    angle: [[38, 62], [40, 66], [42, 70]], startAt: 0.36,
    light: [0.55, 0.34, 0.22], droop: [0.10, 0.42, 0.62], crook: 0.34,
    lean: 0.10, whorl: 0,
    leafFrom: 1, leafQuads: 3000, leafSize: [0.62, 1.00], leafStart: 0.10,
    canopyLift: 1.0,
    tint: [[0.255, 0.44, 0.34], [0.245, 0.40, 0.30], [0.275, 0.38, 0.38]],
    autumn: [[0.070, 0.62, 0.42], [0.035, 0.58, 0.36], [0.105, 0.55, 0.44]],
    autumnChance: 0.45,
    bark: { base: 0x8a7358, dark: 0x3b2f24, fibreU: 7, fibreV: 2, plateU: 4, plateV: 3,
      crackPow: 2.6, crackDepth: 0.42, rough: 0.95, normalStrength: 7, marks: null },
    leaf: { kind: 'lobed', perSprig: [5, 7], len: 0.30, wid: 0.30, spread: [42, 74],
      fromBase: 0.18, stem: true, stemW: 1.6, taperUp: true,
      baseHue: 0.26, baseSat: 0.28, baseLum: 0.90, hueJitter: 0.05 },
    // measured over 400 seeds by tree_gen.test.mjs; it fails if growth drifts out
    apex: [8.5, 20.0], spread: [3.5, 10.5], branchRange: [20, 100],
    texSeed: 101, maxH: 66, maxSlope: 0.9,
  },
  birch: {
    height: [7.5, 12.0], trunkR: 0.030, levels: 3,
    segs: [10, 6, 5, 4], radial: [9, 6, 5, 4], taper: [0.34, 0.45, 0.55, 0.6],
    children: [4, 3, 3], lenRatio: [[0.36, 0.48], [0.36, 0.48], [0.32, 0.44]], radRatio: 0.60,
    angle: [[30, 52], [34, 58], [38, 64]], startAt: 0.50,
    light: [0.70, 0.40, 0.16], droop: [0.06, 0.34, 0.72], crook: 0.20,
    lean: 0.14, whorl: 0,
    leafFrom: 1, leafQuads: 2600, leafSize: [0.44, 0.72], leafStart: 0.06,
    canopyLift: 1.0,
    tint: [[0.235, 0.46, 0.40], [0.225, 0.42, 0.44], [0.250, 0.40, 0.36]],
    autumn: [[0.130, 0.72, 0.50], [0.115, 0.66, 0.46], [0.145, 0.60, 0.52]],
    autumnChance: 0.5,
    bark: { base: 0xe7e3d8, dark: 0x9c9384, fibreU: 6, fibreV: 3, plateU: 3, plateV: 4,
      crackPow: 2.0, crackDepth: 0.18, rough: 0.72, normalStrength: 3.5, marks: 'lenticel' },
    leaf: { kind: 'ovate', perSprig: [6, 9], len: 0.22, wid: 0.42, spread: [50, 82],
      fromBase: 0.14, stem: true, stemW: 1.2, taperUp: true,
      baseHue: 0.25, baseSat: 0.26, baseLum: 0.94, hueJitter: 0.04 },
    // measured over 400 seeds by tree_gen.test.mjs; it fails if growth drifts out
    apex: [9.0, 20.0], spread: [2.8, 7.5], branchRange: [20, 95],
    texSeed: 202, maxH: 66, maxSlope: 0.9,
  },
  pine: {
    height: [11, 16.5], trunkR: 0.036, levels: 2,
    segs: [12, 5, 4], radial: [9, 6, 4], taper: [0.16, 0.40, 0.5],
    children: [30, 3], lenRatio: [[0.16, 0.24], [0.34, 0.48]], radRatio: 0.42,
    angle: [[62, 84], [30, 55]], startAt: 0.42,
    light: [0.85, 0.16], droop: [0.04, 0.30], crook: 0.10,
    lean: 0.05, whorl: 5,                       // branches come in rings of five
    conical: 0.88,                              // upper whorls are shorter
    leafFrom: 1, leafQuads: 2900, leafSize: [0.55, 0.85], leafStart: 0.02,
    canopyLift: 1.0,
    tint: [[0.330, 0.34, 0.26], [0.345, 0.30, 0.22], [0.315, 0.32, 0.29]],
    autumn: null, autumnChance: 0,
    bark: { base: 0x8f5f3c, dark: 0x40281a, fibreU: 5, fibreV: 4, plateU: 6, plateV: 5,
      crackPow: 3.0, crackDepth: 0.55, rough: 0.96, normalStrength: 8, marks: null },
    leaf: { kind: 'needle', perSprig: [12, 16], len: 0.40, wid: 0.035, spread: [24, 46],
      fromBase: 0.05, stem: true, stemW: 1.1, taperUp: false,
      baseHue: 0.31, baseSat: 0.24, baseLum: 0.86, hueJitter: 0.03 },
    // measured over 400 seeds by tree_gen.test.mjs; it fails if growth drifts out
    apex: [10.5, 19.0], spread: [1.9, 4.5], branchRange: [70, 175],
    texSeed: 303, maxH: 95, maxSlope: 1.35,
  },
  fir: {
    height: [9.5, 15], trunkR: 0.032, levels: 2,
    segs: [12, 5, 4], radial: [8, 5, 4], taper: [0.12, 0.38, 0.5],
    children: [42, 3], lenRatio: [[0.15, 0.23], [0.32, 0.46]], radRatio: 0.40,
    angle: [[70, 92], [40, 66]], startAt: 0.14,
    light: [0.90, 0.10], droop: [0.03, 0.40], crook: 0.08,
    lean: 0.03, whorl: 6,
    conical: 0.95,                              // a proper spire
    leafFrom: 1, leafQuads: 3000, leafSize: [0.50, 0.80], leafStart: 0.0,
    canopyLift: 1.0,
    tint: [[0.375, 0.30, 0.24], [0.390, 0.27, 0.20], [0.360, 0.32, 0.27]],
    autumn: null, autumnChance: 0,
    bark: { base: 0x6b5240, dark: 0x2e2118, fibreU: 6, fibreV: 5, plateU: 5, plateV: 6,
      crackPow: 2.4, crackDepth: 0.40, rough: 0.95, normalStrength: 6, marks: null },
    leaf: { kind: 'needle', perSprig: [14, 18], len: 0.34, wid: 0.045, spread: [40, 70],
      fromBase: 0.04, stem: true, stemW: 1.1, taperUp: false,
      baseHue: 0.36, baseSat: 0.22, baseLum: 0.82, hueJitter: 0.03 },
    // measured over 400 seeds by tree_gen.test.mjs; it fails if growth drifts out
    apex: [9.0, 17.0], spread: [1.9, 4.8], branchRange: [110, 240],
    texSeed: 404, maxH: 95, maxSlope: 1.35,
  },
  willow: {
    height: [6, 9.5], trunkR: 0.062, levels: 3,
    segs: [7, 6, 8, 6], radial: [10, 6, 4, 4], taper: [0.34, 0.46, 0.55, 0.6],
    children: [5, 4, 3], lenRatio: [[0.50, 0.64], [0.44, 0.58], [0.52, 0.76]], radRatio: 0.58,
    angle: [[34, 60], [40, 70], [56, 88]], startAt: 0.34,
    light: [0.55, 0.30, -0.55], droop: [0.12, 0.60, 1.55], crook: 0.28,
    lean: 0.12, whorl: 0,
    leafFrom: 2, leafQuads: 3300, leafSize: [0.42, 0.74], leafStart: 0.0,
    canopyLift: 1.0,
    tint: [[0.255, 0.34, 0.42], [0.240, 0.30, 0.46], [0.270, 0.32, 0.38]],
    autumn: [[0.150, 0.58, 0.52]], autumnChance: 0.3,
    bark: { base: 0x7a6a52, dark: 0x33291d, fibreU: 8, fibreV: 2, plateU: 4, plateV: 3,
      crackPow: 3.2, crackDepth: 0.50, rough: 0.94, normalStrength: 7, marks: null },
    leaf: { kind: 'lanceolate', perSprig: [8, 12], len: 0.34, wid: 0.11, spread: [58, 86],
      fromBase: 0.06, stem: true, stemW: 1.0, taperUp: false,
      baseHue: 0.24, baseSat: 0.22, baseLum: 0.92, hueJitter: 0.04 },
    // measured over 400 seeds by tree_gen.test.mjs; it fails if growth drifts out
    apex: [8.0, 18.5], spread: [3.5, 9.5], branchRange: [40, 140],
    texSeed: 505, maxH: 40, maxSlope: 0.8,
  },
  palm: {
    height: [7, 12], trunkR: 0.024, levels: 1,
    segs: [14, 6], radial: [10, 5], taper: [0.72, 0.35],
    children: [11], lenRatio: [[0.30, 0.40]], radRatio: 0.30,
    angle: [[24, 78]], startAt: 0.985,          // every frond off the crown
    light: [0.30, -0.55], droop: [0.02, 1.30], crook: 0.05,
    lean: 0.30, whorl: 0,
    leafFrom: 1, leafQuads: 1500, leafSize: [1.05, 1.55], leafStart: 0.06,
    canopyLift: 1.0,
    tint: [[0.290, 0.42, 0.34], [0.275, 0.46, 0.30], [0.305, 0.40, 0.36]],
    autumn: null, autumnChance: 0,
    bark: { base: 0x9a8161, dark: 0x4d3d2a, fibreU: 4, fibreV: 6, plateU: 3, plateV: 8,
      crackPow: 2.0, crackDepth: 0.30, rough: 0.93, normalStrength: 6, marks: 'ring', ringCount: 14 },
    leaf: { kind: 'pinnate', perSprig: [16, 20], len: 0.46, wid: 0.055, spread: [58, 80],
      fromBase: 0.05, stem: true, stemW: 1.8, taperUp: false,
      baseHue: 0.28, baseSat: 0.26, baseLum: 0.88, hueJitter: 0.03 },
    // measured over 400 seeds by tree_gen.test.mjs; it fails if growth drifts out
    apex: [8.5, 16.5], spread: [3.0, 8.2], branchRange: [8, 16],
    texSeed: 606, maxH: 24, maxSlope: 0.7,
  },
  sakura: {
    height: [6, 9], trunkR: 0.058, levels: 3,
    segs: [7, 6, 5, 4], radial: [10, 7, 5, 4], taper: [0.32, 0.44, 0.52, 0.6],
    children: [4, 3, 3], lenRatio: [[0.48, 0.62], [0.44, 0.58], [0.40, 0.52]], radRatio: 0.64,
    angle: [[46, 74], [48, 78], [50, 82]], startAt: 0.30,
    light: [0.42, 0.22, 0.10], droop: [0.14, 0.34, 0.48], crook: 0.40,
    lean: 0.16, whorl: 0,
    leafFrom: 1, leafQuads: 3200, leafSize: [0.55, 0.92], leafStart: 0.08,
    canopyLift: 1.0,
    tint: [[0.955, 0.62, 0.80], [0.930, 0.55, 0.84], [0.975, 0.50, 0.78]],
    autumn: [[0.020, 0.55, 0.62]], autumnChance: 0.2,
    bark: { base: 0x6c4b3c, dark: 0x2f2018, fibreU: 6, fibreV: 3, plateU: 3, plateV: 9,
      crackPow: 2.2, crackDepth: 0.26, rough: 0.88, normalStrength: 5, marks: 'ring', ringCount: 22 },
    leaf: { kind: 'blossom', perSprig: [6, 9], len: 0.24, wid: 0.42, spread: [40, 80],
      fromBase: 0.16, stem: true, stemW: 1.3, taperUp: false,
      baseHue: 0.94, baseSat: 0.10, baseLum: 0.96, hueJitter: 0.03 },
    // measured over 400 seeds by tree_gen.test.mjs; it fails if growth drifts out
    apex: [6.0, 15.5], spread: [3.6, 10.5], branchRange: [18, 100],
    texSeed: 707, maxH: 50, maxSlope: 0.9,
  },
  dead: {
    height: [5.5, 10], trunkR: 0.048, levels: 3,
    segs: [8, 5, 4, 3], radial: [9, 6, 4, 4], taper: [0.22, 0.30, 0.35, 0.4],
    children: [4, 3, 2], lenRatio: [[0.40, 0.54], [0.36, 0.50], [0.30, 0.44]], radRatio: 0.56,
    angle: [[40, 78], [44, 84], [48, 88]], startAt: 0.30,
    light: [0.40, 0.24, 0.10], droop: [0.16, 0.40, 0.60], crook: 0.60,
    lean: 0.22, whorl: 0,
    leafFrom: 99, leafQuads: 0, leafSize: [0, 0], leafStart: 1,
    canopyLift: 0.75,
    tint: null, autumn: null, autumnChance: 0,
    bark: { base: 0x9d968a, dark: 0x4a453e, fibreU: 9, fibreV: 2, plateU: 4, plateV: 3,
      crackPow: 3.4, crackDepth: 0.62, rough: 0.97, normalStrength: 9, marks: 'bleach' },
    leaf: null,
    // measured over 400 seeds by tree_gen.test.mjs; it fails if growth drifts out
    apex: [5.0, 16.0], spread: [2.2, 9.0], branchRange: [16, 78],
    texSeed: 808, maxH: 110, maxSlope: 1.6,
  },
  cactus: {
    // A columnar cactus is a tree with two branches and no leaves. Its flutes
    // come from the tube builder's ripple, its spines from leaf quads.
    height: [2.6, 4.6], trunkR: 0.150, levels: 1,
    segs: [7, 6], radial: [14, 10], taper: [0.80, 0.85],
    children: [2], lenRatio: [[0.38, 0.52]], radRatio: 0.62,
    angle: [[74, 96]], startAt: 0.34,
    light: [0.30, 1.35], droop: [0.02, 0.02], crook: 0.05,
    lean: 0.02, whorl: 0, flute: 0.09,
    leafFrom: 0, leafQuads: 260, leafSize: [0.16, 0.26], leafStart: 0.05,
    canopyLift: 0.6,
    tint: [[0.30, 0.10, 0.86], [0.28, 0.12, 0.82]],
    autumn: null, autumnChance: 0,
    bark: { base: 0x4f8f4a, dark: 0x2c5c31, fibreU: 14, fibreV: 2, plateU: 5, plateV: 3,
      crackPow: 2.0, crackDepth: 0.30, rough: 0.72, normalStrength: 5, marks: null },
    leaf: { kind: 'needle', perSprig: [7, 10], len: 0.36, wid: 0.05, spread: [60, 96],
      fromBase: 0.10, stem: false, stemW: 0, taperUp: false,
      baseHue: 0.11, baseSat: 0.14, baseLum: 0.95, hueJitter: 0.02 },
    // measured over 400 seeds by tree_gen.test.mjs; it fails if growth drifts out
    apex: [2.4, 6.3], spread: [0.8, 2.4], branchRange: [2, 5],
    texSeed: 909, maxH: 40, maxSlope: 0.9,
  },
};

export const SPECIES_IDS = Object.keys(SPECIES);

/**
 * What one baked variant may cost, per detail level. Measured and enforced by
 * the node test, which prints the worst case for every species.
 */
export const TRI_BUDGET = { bark: 12000, leaf: 20000 };
export const LOD_BUDGET = [14000, 4000, 600];

/** Fails loudly if a species is missing a field growTree will read. */
export function auditSpecies() {
  const need = ['height', 'trunkR', 'levels', 'segs', 'radial', 'taper', 'children',
    'lenRatio', 'radRatio', 'angle', 'startAt', 'light', 'droop', 'crook',
    'leafFrom', 'leafQuads', 'leafSize', 'bark', 'texSeed', 'maxH', 'maxSlope',
    'apex', 'spread', 'branchRange'];
  const bad = [];
  for (const [id, P] of Object.entries(SPECIES)) {
    for (const k of need) if (P[k] === undefined) bad.push(`${id} has no ${k}`);
    if (P.levels + 1 > P.segs.length) bad.push(`${id}: segs has ${P.segs.length} entries for ${P.levels + 1} depths`);
    if (P.levels + 1 > P.radial.length) bad.push(`${id}: radial has ${P.radial.length} entries for ${P.levels + 1} depths`);
    if (P.levels > P.children.length) bad.push(`${id}: children has ${P.children.length} entries for ${P.levels} splits`);
    if (P.levels > P.angle.length) bad.push(`${id}: angle has ${P.angle.length} entries for ${P.levels} splits`);
    if (P.leafQuads > 0 && !P.leaf) bad.push(`${id} wants ${P.leafQuads} leaf quads and has no leaf recipe`);
    if (P.leafQuads > 0 && !P.tint) bad.push(`${id} has leaves and no tint palette`);
  }
  if (bad.length) throw new Error(`tree_gen: broken species (${bad.join('; ')})`);
  return SPECIES_IDS.length;
}
auditSpecies();

// ---------------------------------------------------------------------------
// Geometry: tapered tubes with parallel transport frames.
// ---------------------------------------------------------------------------

function newSink() {
  return { pos: [], nor: [], uv: [], wind: [], col: [], idx: [], n: 0 };
}

function sinkToGeometry(s, withColor) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(s.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(s.nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(s.uv, 2));
  g.setAttribute('aWind', new THREE.Float32BufferAttribute(s.wind, 1));
  if (withColor) g.setAttribute('color', new THREE.Float32BufferAttribute(s.col, 3));
  g.setIndex(s.idx);
  g.computeBoundingSphere();
  return g;
}

const _t = new THREE.Vector3(), _n = new THREE.Vector3(), _b = new THREE.Vector3();
const _q = new THREE.Quaternion(), _v = new THREE.Vector3();

/**
 * A tapered tube through `pts` with radius `radii[i]` at each point, ringed
 * with `radial` sides. `windOf(i)` gives the sway weight at ring i.
 *
 * The frame is parallel transported, so a branch that curves twice does not
 * twist its bark texture. The seam column is duplicated so u can run 0 to 1
 * around without the texture mirroring back on itself.
 */
function addTube(sink, pts, radii, radial, windOf, flute = 0) {
  const rings = pts.length;
  if (rings < 2) return;
  // tangents
  const tan = [];
  for (let i = 0; i < rings; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(rings - 1, i + 1)];
    tan.push(new THREE.Vector3().subVectors(b, a).normalize());
  }
  // an initial normal perpendicular to the first tangent
  const seed0 = Math.abs(tan[0].y) > 0.9 ? new THREE.Vector3(1, 0, 0) : UP;
  const nor = [new THREE.Vector3().crossVectors(tan[0], seed0).normalize()];
  for (let i = 1; i < rings; i++) {
    const prev = nor[i - 1].clone();
    _v.crossVectors(tan[i - 1], tan[i]);
    if (_v.lengthSq() > 1e-12) {
      const ang = Math.acos(Math.max(-1, Math.min(1, tan[i - 1].dot(tan[i]))));
      _q.setFromAxisAngle(_v.normalize(), ang);
      prev.applyQuaternion(_q);
    }
    // re-orthogonalise against drift
    prev.addScaledVector(tan[i], -prev.dot(tan[i])).normalize();
    nor.push(prev);
  }

  // arc length for v
  const len = [0];
  for (let i = 1; i < rings; i++) len.push(len[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const total = len[rings - 1] || 1;
  const circ = TAU * Math.max(...radii);
  const uRep = Math.max(1, Math.round(circ / 1.15));
  const vRep = Math.max(1, Math.round(total / 1.6));

  const base = sink.n;
  const cols = radial + 1;                       // duplicated seam column
  for (let i = 0; i < rings; i++) {
    _b.crossVectors(tan[i], nor[i]).normalize();
    const w = windOf(i / (rings - 1));
    const dr = i < rings - 1 ? (radii[i + 1] - radii[i]) / Math.max(1e-4, len[i + 1] - len[i]) : 0;
    for (let j = 0; j < cols; j++) {
      const a = (j % radial) / radial * TAU;
      const ca = Math.cos(a), sa = Math.sin(a);
      // flutes: a cactus is a ribbed column, not a smooth one
      const rr = radii[i] * (1 + (flute ? flute * Math.cos(a * radial * 0.5) : 0));
      _n.set(nor[i].x * ca + _b.x * sa, nor[i].y * ca + _b.y * sa, nor[i].z * ca + _b.z * sa);
      sink.pos.push(pts[i].x + _n.x * rr, pts[i].y + _n.y * rr, pts[i].z + _n.z * rr);
      // taper tilts the surface normal off the pure radial direction
      _v.copy(_n).addScaledVector(tan[i], -dr).normalize();
      sink.nor.push(_v.x, _v.y, _v.z);
      sink.uv.push((j / radial) * uRep, (len[i] / total) * vRep);
      sink.wind.push(w);
    }
  }
  for (let i = 0; i < rings - 1; i++) {
    for (let j = 0; j < radial; j++) {
      const a = base + i * cols + j, b = a + 1, c = a + cols, d = c + 1;
      sink.idx.push(a, c, b, b, c, d);
    }
  }
  sink.n += rings * cols;
}

/** One leaf quad: a plane through `centre`, spanning `right` and `up`. */
function addQuad(sink, centre, right, up, size, cell, colour, wind) {
  const hx = size * 0.5, hy = size * 0.5;
  const nrm = _v.crossVectors(right, up).normalize().clone();
  const c = LEAF_CELLS, w = 1 / c;
  // half a texel of inset, or linear filtering and the mip chain drag the
  // neighbouring sprig's leaves in across the cell border
  const inset = 1.5 / LEAF_SIZE;
  const u0 = (cell % c) * w + inset, v0 = Math.floor(cell / c) * w + inset;
  const base = sink.n;
  const w2 = w - inset * 2;
  const corners = [[-hx, -hy, u0, v0], [hx, -hy, u0 + w2, v0], [hx, hy, u0 + w2, v0 + w2], [-hx, hy, u0, v0 + w2]];
  for (const [dx, dy, u, v] of corners) {
    sink.pos.push(centre.x + right.x * dx + up.x * dy,
      centre.y + right.y * dx + up.y * dy,
      centre.z + right.z * dx + up.z * dy);
    sink.nor.push(nrm.x, nrm.y, nrm.z);
    sink.uv.push(u, v);
    sink.col.push(colour.r, colour.g, colour.b);
    sink.wind.push(wind);
  }
  sink.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  sink.n += 4;
}

// ---------------------------------------------------------------------------
// Growth
// ---------------------------------------------------------------------------

const at = (arr, i) => arr[Math.min(i, arr.length - 1)];

/**
 * How much of a tree survives at each distance.
 *
 * A grown fir is about 12,000 triangles. A boreal chunk ring holds 3,087 tree
 * records, measured, which at full detail is 28 million triangles a frame: not
 * a forest, a slideshow. So each variant is baked three times off the SAME
 * skeleton, and a record draws the one its distance asks for.
 *
 *   radial     sides around each branch, as a fraction of the species' own
 *   rings      how many points of each branch path survive
 *   leaf       fraction of the leaf clusters
 *   leafSize   bigger sprigs at distance, so a thinned canopy still covers
 *   barkDepth  the deepest branch generation that still gets wood; leaves are
 *              hung on the skeleton, not on the bark, so twigs can go and
 *              their foliage stays
 *   shadow     only the near tier casts, or the shadow pass costs as much as
 *              the colour pass
 */
export const LODS = [
  { name: 'near', radial: 1.00, rings: 1.00, leaf: 1.00, leafSize: 1.00, barkDepth: 99, shadow: true },
  { name: 'mid', radial: 0.50, rings: 0.60, leaf: 0.40, leafSize: 1.40, barkDepth: 1, shadow: false },
  { name: 'far', radial: 0.34, rings: 0.34, leaf: 0.05, leafSize: 2.60, barkDepth: 0, shadow: false },
];

/** Metres at which the tiers change hands. */
export const LOD_RANGE = [55, 140];

/**
 * How many variants share one baked geometry at each tier.
 *
 * Six variants times three tiers times two materials is 36 instanced meshes
 * per species, and five species in view was 123 draw calls, measured. Distance
 * is the answer: at 55 m every tree needs its own silhouette, at 140 m two
 * different ones are enough, so the mid tier draws three shapes and the far
 * tier two. 36 layers a species becomes 22.
 */
export const LOD_SHARE = [1, 2, 3];
/** Which baked variant supplies the geometry for variant `v` at tier `lod`. */
export const geometryVariant = (v, lod) => Math.floor(v / LOD_SHARE[lod]) * LOD_SHARE[lod];
export const lodForDistance = (d) => (d < LOD_RANGE[0] ? 0 : d < LOD_RANGE[1] ? 1 : 2);

/** Keep `frac` of a path's points, always both ends. */
function decimate(pts, radii, frac) {
  if (frac >= 0.999) return [pts, radii];
  const n = Math.max(2, Math.round((pts.length - 1) * frac) + 1);
  const op = [], or = [];
  for (let i = 0; i < n; i++) {
    const k = Math.round(i * (pts.length - 1) / (n - 1));
    op.push(pts[k]); or.push(radii[k]);
  }
  return [op, or];
}

/**
 * The tree itself: where every branch runs and how thick it is. No geometry,
 * so the three detail levels are three views of one tree rather than three
 * different trees.
 */
function growSkeleton(species, seed, opts = {}) {
  const P = SPECIES[species];
  if (!P) throw new Error(`tree_gen: no species "${species}"`);
  const rng = mulberry32((seed >>> 0) ^ P.texSeed);
  const scale = opts.scale ?? 1;
  const trunkLen = lerp(P.height[0], P.height[1], rng()) * scale;
  const baseR = trunkLen * P.trunkR;
  const branches = [];

  function grow(start, dir, length, radius, depth) {
    const steps = at(P.segs, depth);
    const radial = at(P.radial, depth);
    const taper = at(P.taper, depth);
    const light = at(P.light, depth);
    const droop = at(P.droop, depth);
    const crook = P.crook * (depth === 0 ? 1 : 1.4);
    const stepLen = length / steps;
    const d = dir.clone().normalize();
    const pts = [start.clone()];
    const radii = [radius];
    let cur = start.clone();
    for (let i = 1; i <= steps; i++) {
      const f = i / steps;
      // light pulls the shoot toward the sky, its own weight pulls it down and
      // harder the further out it already is
      d.addScaledVector(UP, (light - droop * f) * stepLen * 0.30);
      d.x += (rng() * 2 - 1) * crook * stepLen * 0.22;
      d.z += (rng() * 2 - 1) * crook * stepLen * 0.22;
      d.normalize();
      cur = cur.clone().addScaledVector(d, stepLen);
      pts.push(cur);
      radii.push(Math.max(0.006, radius * (1 - (1 - taper) * f)));
    }
    branches.push({ depth, pts, radii, radial, length });
    if (depth >= P.levels) return;

    // no two trees of a species carry the same number of limbs
    const count = Math.max(1, at(P.children, depth) + Math.floor(rng() * 3) - 1);
    const angRange = at(P.angle, depth);
    const places = [];
    if (P.whorl && depth === 0) {
      // conifers: rings of branches up the trunk, each ring shorter than the last
      const rings = Math.max(2, Math.round(count / P.whorl) + Math.floor(rng() * 3) - 1);
      for (let r = 0; r < rings; r++) {
        const t = P.startAt + (0.985 - P.startAt) * (rings === 1 ? 0.5 : r / (rings - 1));
        for (let k = 0; k < P.whorl; k++) {
          places.push({ t, phi: (k / P.whorl) * TAU + r * 1.13 + rng() * 0.18 });
        }
      }
    } else {
      for (let k = 0; k < count; k++) {
        const t = P.startAt + (0.985 - P.startAt) * ((k + 0.5) / count) + (rng() - 0.5) * 0.05;
        places.push({ t: clamp01(t), phi: k * PHYLLOTAXIS + rng() * 0.25 });
      }
    }

    for (const pl of places) {
      const fi = pl.t * (pts.length - 1);
      const i0 = Math.min(pts.length - 2, Math.floor(fi)), ft = fi - i0;
      const p = pts[i0].clone().lerp(pts[i0 + 1], ft);
      const pr = lerp(radii[i0], radii[i0 + 1], ft);
      const tanv = _t.subVectors(pts[i0 + 1], pts[i0]).normalize().clone();
      // a frame about the parent axis, so phi means the same thing all the way up
      const nseed = Math.abs(tanv.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : UP;
      const nA = new THREE.Vector3().crossVectors(tanv, nseed).normalize();
      const nB = new THREE.Vector3().crossVectors(tanv, nA).normalize();
      const ang = lerp(angRange[0], angRange[1], rng()) * DEG;
      const side = nA.clone().multiplyScalar(Math.cos(pl.phi)).addScaledVector(nB, Math.sin(pl.phi));
      const cdir = tanv.clone().multiplyScalar(Math.cos(ang)).addScaledVector(side, Math.sin(ang)).normalize();
      // conical crowns: the higher up the trunk, the shorter the branch
      const shorten = P.conical && depth === 0 ? 1 - P.conical * Math.pow(pl.t, 1.25) : 1;
      const lr = at(P.lenRatio, depth);
      const clen = length * lerp(lr[0], lr[1], rng()) * Math.max(0.12, shorten);
      const crad = Math.max(0.008, pr * P.radRatio * (0.85 + rng() * 0.3));
      grow(p, cdir, clen, crad, depth + 1);
    }
  }

  const lean = new THREE.Vector3((rng() * 2 - 1) * P.lean, 1, (rng() * 2 - 1) * P.lean).normalize();
  grow(new THREE.Vector3(0, 0, 0), lean, trunkLen, baseR, 0);
  return { P, branches, trunkLen, baseR, scale };
}

/** One detail level of one skeleton. */
function emitLod(sk, L, seed, opts = {}) {
  const { P, branches, scale } = sk;

  // ------------------------------------------------------------------ bark --
  const bark = newSink();
  for (const br of branches) {
    if (br.depth > L.barkDepth) continue;
    const wBase = Math.min(1, br.depth / Math.max(1, P.levels));
    const [pts, radii] = decimate(br.pts, br.radii, L.rings);
    addTube(bark, pts, radii, Math.max(3, Math.round(br.radial * L.radial)),
      (f) => (br.depth === 0 ? 0.10 * f * f : lerp(wBase * 0.35, wBase * 0.75 + 0.15, f)) * 0.9,
      br.depth === 0 ? (P.flute || 0) : 0);
  }
  const trunk = sinkToGeometry(bark, false);

  // ----------------------------------------------------------------- leaves --
  // its own random stream, so every detail level of one tree wears the same
  // colour and the same autumn: those are the first draws off it
  const rng = mulberry32(((seed >>> 0) ^ 0x1eaf7) >>> 0);
  let leaves = null;
  let canopySum = 0, canopyN = 0;
  let radius = 0;
  for (const br of branches) for (const p of br.pts) radius = Math.max(radius, Math.hypot(p.x, p.z));

  const want = Math.round((opts.leafQuads ?? P.leafQuads) * L.leaf);
  if (want > 0 && P.leaf) {
    const pal = P.tint[Math.floor(rng() * P.tint.length)];
    const aut = P.autumn ? P.autumn[Math.floor(rng() * P.autumn.length)] : null;
    const autumnAmt = clamp01(opts.autumn ?? 0) * (rng() < P.autumnChance ? 1 : 0.25);
    const treeCol = hsl(pal[0], pal[1], pal[2]);
    if (aut && autumnAmt > 0) treeCol.lerp(hsl(aut[0], aut[1], aut[2]), autumnAmt);

    const eligible = branches.filter((b) => b.depth >= P.leafFrom);
    const totalLen = eligible.reduce((a, b) => a + b.length, 0) || 1;
    const sink = newSink();
    const right = new THREE.Vector3(), up = new THREE.Vector3();
    const col = new THREE.Color();
    for (const br of eligible) {
      const share = Math.max(want > eligible.length * 3 ? 1 : 0,
        Math.round(want * (br.length / totalLen) / 3));   // clusters, three quads each
      for (let c = 0; c < share; c++) {
        const t = P.leafStart + (1 - P.leafStart) * ((c + rng()) / share);
        const fi = t * (br.pts.length - 1);
        const i0 = Math.min(br.pts.length - 2, Math.floor(fi)), ft = fi - i0;
        const p = br.pts[i0].clone().lerp(br.pts[i0 + 1], ft);
        const size = lerp(P.leafSize[0], P.leafSize[1], rng()) * scale * L.leafSize;
        p.x += (rng() * 2 - 1) * size * 0.35;
        p.y += (rng() * 2 - 1) * size * 0.30;
        p.z += (rng() * 2 - 1) * size * 0.35;
        canopySum += p.y; canopyN++;
        radius = Math.max(radius, Math.hypot(p.x, p.z) + size * 0.5);
        // three quads through the cluster centre, crossed, so it has volume
        // from any angle without ever being a billboard
        const yaw = rng() * TAU, pitch = (rng() - 0.5) * 1.1;
        const wind = lerp(0.55, 1.0, t) * (br.depth / Math.max(1, P.levels));
        const shade = 0.82 + rng() * 0.34;
        col.copy(treeCol).multiplyScalar(shade);
        col.offsetHSL((rng() - 0.5) * 0.02, 0, (rng() - 0.5) * 0.05);
        for (let q = 0; q < 3; q++) {
          const a = yaw + q * (Math.PI / 3);
          right.set(Math.cos(a), 0, Math.sin(a));
          up.set(0, 1, 0).applyAxisAngle(right, pitch + (q - 1) * 0.5);
          addQuad(sink, p, right, up, size, Math.floor(rng() * (LEAF_CELLS * LEAF_CELLS)), col, wind);
        }
      }
    }
    if (sink.n) leaves = sinkToGeometry(sink, true);
  }

  // `height` is what a player would measure: the top of the standing tree, not
  // the length of the trunk's own wandering path. Read it off the geometry.
  let apex = 0;
  const bp = trunk.attributes.position.array;
  for (let i = 1; i < bp.length; i += 3) if (bp[i] > apex) apex = bp[i];
  if (leaves) {
    const lp = leaves.attributes.position.array;
    for (let i = 1; i < lp.length; i += 3) if (lp[i] > apex) apex = lp[i];
  }
  return {
    trunk, leaves, height: apex, trunkLen: sk.trunkLen, radius, baseR: sk.baseR,
    canopyY: canopyN ? canopySum / canopyN : apex * P.canopyLift,
    branches: branches.length,
    tris: { bark: trunk.index.count / 3, leaf: leaves ? leaves.index.count / 3 : 0 },
  };
}

/**
 * Grow one tree at one detail level.
 *
 * @param species one of SPECIES_IDS
 * @param seed    any integer; the same seed always grows the same tree
 * @param opts    { scale, autumn (0..1), leafQuads, lod (0, 1 or 2) }
 * @returns { trunk, leaves, height, radius, canopyY, baseR, branches, tris }
 */
export function growTree(species, seed, opts = {}) {
  const sk = growSkeleton(species, seed, opts);
  const out = emitLod(sk, LODS[opts.lod ?? 0], seed, opts);
  out.lod = opts.lod ?? 0;
  return out;
}

/** All three detail levels of one tree, off one skeleton. */
export function growTreeLods(species, seed, opts = {}) {
  const sk = growSkeleton(species, seed, opts);
  const lods = LODS.map((L) => emitLod(sk, L, seed, opts));
  const near = lods[0];
  return {
    lods,
    height: near.height, trunkLen: near.trunkLen, radius: near.radius,
    canopyY: near.canopyY, baseR: near.baseR, branches: near.branches,
    tris: lods.map((l) => l.tris),
    // the near tier answers as the tree itself, so callers that only want one
    // geometry pair (the felling animation, the node tests) need not care
    trunk: near.trunk, leaves: near.leaves,
  };
}

// ---------------------------------------------------------------------------
// Variants
// ---------------------------------------------------------------------------

const variantCache = new Map();

/**
 * Bake `count` grown trees of one species. The result is the thing flora.js
 * instances: one geometry pair per variant, kept for the life of the process.
 */
export function buildTreeVariants(species, seed, count = 6) {
  const key = `${species}:${seed}:${count}`;
  if (variantCache.has(key)) return variantCache.get(key);
  const out = [];
  for (let i = 0; i < count; i++) {
    const s = (seed * 2654435761 + i * 40503) >>> 0;
    out.push(growTreeLods(species, s, {
      scale: 0.86 + rand2(i, seed, 5501) * 0.30,
      autumn: rand2(i, seed, 5502),
    }));
  }
  variantCache.set(key, out);
  return out;
}

export function disposeVariants() {
  for (const list of variantCache.values()) {
    for (const v of list) for (const g of v.lods) { g.trunk.dispose(); g.leaves?.dispose(); }
  }
  variantCache.clear();
}

// ---------------------------------------------------------------------------
// Materials and wind
// ---------------------------------------------------------------------------

/** Ticked once a frame by flora.js. Every leaf and every blade reads it. */
export const windUniforms = {
  uTime: { value: 0 },
  uWind: { value: 1 },      // 0 dead calm, 1 a normal breeze
};

/** Advance the wind clock. `seconds` is absolute, not a delta. */
export function tickWind(seconds) { windUniforms.uTime.value = seconds; }
export function setWindStrength(k) { windUniforms.uWind.value = Math.max(0, k); }

const WIND_VERT = `
  #include <begin_vertex>
  #ifdef USE_INSTANCING
    float wPhase = instanceMatrix[3].x * 0.21 + instanceMatrix[3].z * 0.17;
  #else
    float wPhase = 0.0;
  #endif
  float wT = uTime + wPhase;
  float wS = aWind * uWind;
  transformed.x += sin(wT * 1.45 + transformed.y * 0.30) * 0.34 * wS;
  transformed.z += sin(wT * 1.13 + transformed.y * 0.24 + 1.7) * 0.28 * wS;
  transformed.y -= abs(sin(wT * 1.45)) * 0.05 * wS;
`;
const LEAF_EXTRA = `
  float wF = sin(wT * 4.3 + transformed.x * 2.1 + transformed.z * 1.7) * 0.055 * wS;
  transformed.x += wF;
  transformed.y += wF * 0.5;
`;

function applyWind(material, extra = '') {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniforms.uTime;
    shader.uniforms.uWind = windUniforms.uWind;
    shader.vertexShader = 'uniform float uTime;\nuniform float uWind;\nattribute float aWind;\n'
      + shader.vertexShader.replace('#include <begin_vertex>', WIND_VERT + extra);
  };
  // two materials with different injected code must not share a program
  material.customProgramCacheKey = () => 'tree_gen:wind' + (extra ? ':leaf' : '');
  return material;
}

const matCache = new Map();

/**
 * The two materials every variant of a species shares, plus the depth material
 * that keeps alpha-cut leaves casting the right shadow instead of a solid box.
 */
export function materialsFor(species) {
  if (matCache.has(species)) return matCache.get(species);
  const P = SPECIES[species];
  if (!P) throw new Error(`tree_gen: no species "${species}"`);
  const bt = barkTextures(species);
  const bark = applyWind(new THREE.MeshStandardMaterial({
    map: bt.map, normalMap: bt.normalMap, roughnessMap: bt.roughnessMap,
    normalScale: new THREE.Vector2(1.1, 1.1),
    roughness: 1, metalness: 0,
  }));
  let leaf = null, leafDepth = null;
  const lt = leafTexture(species);
  if (lt) {
    leaf = applyWind(new THREE.MeshStandardMaterial({
      map: lt, alphaTest: 0.42, side: THREE.DoubleSide, vertexColors: true,
      roughness: 0.86, metalness: 0, transparent: false,
    }), LEAF_EXTRA);
    leafDepth = applyWind(new THREE.MeshDepthMaterial({
      depthPacking: THREE.RGBADepthPacking, map: lt, alphaTest: 0.42,
    }), LEAF_EXTRA);
  }
  const out = { bark, leaf, leafDepth };
  matCache.set(species, out);
  return out;
}

export function disposeMaterials() {
  for (const m of matCache.values()) { m.bark.dispose(); m.leaf?.dispose(); m.leafDepth?.dispose(); }
  matCache.clear();
  for (const t of barkCache.values()) { t.map.dispose(); t.normalMap.dispose(); t.roughnessMap.dispose(); }
  barkCache.clear();
  for (const t of leafCache.values()) t?.dispose();
  leafCache.clear();
}

// ---------------------------------------------------------------------------
// Boulders. Same toolkit, no branches: an icosphere pushed about by 3D noise,
// with a granite texture off the same generator the bark uses.
// ---------------------------------------------------------------------------

/** An indexed icosphere, so computeVertexNormals gives a smooth shell. */
export function icosphere(detail = 2) {
  const t = (1 + Math.sqrt(5)) / 2;
  let verts = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ].map((v) => { const l = Math.hypot(...v); return [v[0] / l, v[1] / l, v[2] / l]; });
  let faces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  for (let d = 0; d < detail; d++) {
    const mid = new Map();
    const next = [];
    const midpoint = (a, b) => {
      const k = a < b ? `${a}_${b}` : `${b}_${a}`;
      if (mid.has(k)) return mid.get(k);
      const va = verts[a], vb = verts[b];
      const m = [va[0] + vb[0], va[1] + vb[1], va[2] + vb[2]];
      const l = Math.hypot(...m);
      verts.push([m[0] / l, m[1] / l, m[2] / l]);
      mid.set(k, verts.length - 1);
      return verts.length - 1;
    };
    for (const [a, b, c] of faces) {
      const ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a);
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = next;
  }
  return { verts, faces };
}

/**
 * One boulder. `seed` picks the lumps; `squash` flattens it so it sits on the
 * ground rather than balancing on it. Radius 1 before the record's own scale.
 */
export function growBoulder(seed, opts = {}) {
  const detail = opts.detail ?? 2;
  const { verts, faces } = icosphere(detail);
  const rng = mulberry32((seed >>> 0) ^ 0xb0d1);
  const off = rng() * 40, off2 = rng() * 40;
  const squash = opts.squash ?? (0.62 + rng() * 0.26);
  const lump = opts.lump ?? (0.20 + rng() * 0.14);
  const pos = new Float32Array(verts.length * 3);
  const uv = new Float32Array(verts.length * 2);
  for (let i = 0; i < verts.length; i++) {
    const [x, y, z] = verts[i];
    const big = fbm3(x * 1.5 + off, y * 1.5, z * 1.5 + off2, 3, seed);
    const fine = fbm3(x * 5.5 + off2, y * 5.5, z * 5.5 + off, 2, seed + 31);
    const r = 1 + (big - 0.5) * 2 * lump + (fine - 0.5) * 2 * lump * 0.30;
    pos[i * 3] = x * r;
    pos[i * 3 + 1] = y * r * squash;
    pos[i * 3 + 2] = z * r;
    uv[i * 2] = (Math.atan2(z, x) / TAU + 0.5) * 2.4;
    uv[i * 2 + 1] = (Math.asin(clamp01(y * 0.5 + 0.5) * 2 - 1) / Math.PI + 0.5) * 1.6;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(faces.flat());
  g.computeVertexNormals();
  // sit the lowest point at y = 0, so a record's gy is the ground under it
  g.computeBoundingBox();
  g.translate(0, -g.boundingBox.min.y, 0);
  g.computeBoundingSphere();
  return { geo: g, tris: faces.length, height: g.boundingBox.max.y - g.boundingBox.min.y };
}

const rockTexCache = new Map();

/** Granite: albedo, normal and roughness, one set shared by every boulder. */
export function rockTextures(kind = 'stone') {
  if (rockTexCache.has(kind)) return rockTexCache.get(kind);
  const S = 512, H = S >> 1;
  const alb = new Uint8Array(S * S * 4), rough = new Uint8Array(S * S * 4);
  const h = new Float32Array(S * S);
  const seed = kind === 'ore' ? 6101 : 6102;
  const base = new THREE.Color(kind === 'ore' ? 0x5b6169 : 0x8e887c);
  const dark = new THREE.Color(kind === 'ore' ? 0x2b3138 : 0x4a453d);
  const vein = new THREE.Color(kind === 'ore' ? 0xc97a36 : 0xbdb6a6);
  const c = new THREE.Color();
  const fCoarse = fbmField(H, 5, 5, 4, seed);
  const fGrit = fbmField(H, 40, 40, 3, seed + 13);
  const fCrack = fbmField(H, 3, 3, 3, seed + 29);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S;
    const coarse = readField(fCoarse, H, u, v);
    const grit = readField(fGrit, H, u, v);
    const crack = Math.pow(1 - Math.abs(readField(fCrack, H, u, v) * 2 - 1), 5);
    const hgt = clamp01(0.5 + (coarse - 0.5) * 0.9 + (grit - 0.5) * 0.35 - crack * 0.55);
    c.copy(dark).lerp(base, clamp01(hgt * 1.1 + (grit - 0.5) * 0.4));
    // mineral speckle, and for ore a copper seam that follows the cracks
    c.lerp(vein, kind === 'ore' ? crack * 0.85 : smoothstep(0.78, 0.95, grit) * 0.5);
    const i = (y * S + x) * 4;
    alb[i] = encodeSRGB(c.r); alb[i + 1] = encodeSRGB(c.g); alb[i + 2] = encodeSRGB(c.b); alb[i + 3] = 255;
    h[y * S + x] = hgt;
    const rg = clamp01(0.92 - hgt * 0.25 + (grit - 0.5) * 0.12);
    rough[i] = 255; rough[i + 1] = rg * 255; rough[i + 2] = 0; rough[i + 3] = 255;
  }
  const out = {
    map: dataTexture(alb, S, { srgb: true }),
    normalMap: dataTexture(normalFromHeight(h, S, 6), S),
    roughnessMap: dataTexture(rough, S),
  };
  rockTexCache.set(kind, out);
  return out;
}

export function rockMaterial(kind = 'stone') {
  const t = rockTextures(kind);
  return new THREE.MeshStandardMaterial({
    map: t.map, normalMap: t.normalMap, roughnessMap: t.roughnessMap,
    normalScale: new THREE.Vector2(1.2, 1.2),
    roughness: 1, metalness: kind === 'ore' ? 0.18 : 0.02,
  });
}


// ---------------------------------------------------------------------------
// Stumps. A felled tree that simply vanishes reads as a bug; a cut stump is the
// confirmation that the swing landed. One geometry and one material serve every
// species: the sides carry a dark vertex colour and the cut face a pale one, and
// the instance colour supplies the species' own bark tone on top of both.
// Radius 1 and height 1 before the instance matrix scales it.
// ---------------------------------------------------------------------------

let stumpGeo = null;

export function stumpGeometry(sides = 12) {
  if (stumpGeo) return stumpGeo;
  const pos = [], nor = [], uv = [], col = [], wind = [], idx = [];
  const SIDE = [0.72, 0.68, 0.60];     // multiplied by the instance's bark colour
  const FACE = [1.95, 1.78, 1.42];     // sapwood: brighter than any bark
  const rTop = 0.86;
  // shell
  for (let ring = 0; ring < 2; ring++) {
    const y = ring, r = ring ? rTop : 1;
    for (let j = 0; j <= sides; j++) {
      const a2 = (j % sides) / sides * TAU;
      const cx = Math.cos(a2), cz = Math.sin(a2);
      pos.push(cx * r, y, cz * r);
      nor.push(cx, 0.16, cz);
      uv.push(j / sides * 3, y * 0.6);
      col.push(SIDE[0], SIDE[1], SIDE[2]);
      wind.push(0);
    }
  }
  for (let j = 0; j < sides; j++) {
    const a2 = j, b2 = j + 1, c2 = j + sides + 1, d2 = c2 + 1;
    idx.push(a2, c2, b2, b2, c2, d2);
  }
  // the cut face: a ragged disc, splintered a little so it is not a lid
  const centre = pos.length / 3;
  pos.push(0, 1.03, 0); nor.push(0, 1, 0); uv.push(0.5, 0.5);
  col.push(FACE[0], FACE[1], FACE[2]); wind.push(0);
  const rim = pos.length / 3;
  for (let j = 0; j <= sides; j++) {
    const a2 = (j % sides) / sides * TAU;
    const jag = 1 + (rand2(j % sides, 7, 4242) - 0.5) * 0.22;
    pos.push(Math.cos(a2) * rTop * jag, 1 + (rand2(j % sides, 9, 4243) - 0.5) * 0.14, Math.sin(a2) * rTop * jag);
    nor.push(0, 1, 0);
    uv.push(0.5 + Math.cos(a2) * 0.5, 0.5 + Math.sin(a2) * 0.5);
    col.push(FACE[0], FACE[1], FACE[2]); wind.push(0);
  }
  for (let j = 0; j < sides; j++) idx.push(centre, rim + j, rim + j + 1);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aWind', new THREE.Float32BufferAttribute(wind, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  stumpGeo = g;
  return g;
}

/** One material for every stump in the world: one more draw call, not eleven. */
export function stumpMaterial() {
  const t = barkTextures('oak');
  return new THREE.MeshStandardMaterial({
    map: t.map, normalMap: t.normalMap, roughnessMap: t.roughnessMap,
    vertexColors: true, roughness: 1, metalness: 0,
  });
}
