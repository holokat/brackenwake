// Seeded 2D noise for an endless world. Pure functions, no THREE, runs in node.
//
// Simplex noise after Gustavson, with the permutation table shuffled from the
// seed so two worlds with different seeds share nothing. fbm layers octaves,
// ridged() makes mountain spines, warp() bends the input domain so coastlines
// and rivers stop looking like contour lines of a single function.
//
// Everything here is deterministic: the same (seed, x, z) gives the same number
// on every machine, which is what lets a chunk be rebuilt after unloading and
// come back identical, and what a future server relies on to agree with clients.

const GRAD = [
  [1, 1], [-1, 1], [1, -1], [-1, -1],
  [1, 0], [-1, 0], [0, 1], [0, -1],
];
const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;

// Same generator assets.js uses, duplicated here so src/world has no import
// into src/farm: the world field must stay loadable without the game.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer hash of two ints and a seed, for per-cell decisions (scatter, sites). */
export function hash2(x, z, seed = 0) {
  let h = (x | 0) * 374761393 + (z | 0) * 668265263 + (seed | 0) * 2147483647;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}
/** hash2 as a float in [0, 1). */
export const rand2 = (x, z, seed = 0) => hash2(x, z, seed) / 4294967296;

export function createNoise(seed = 1) {
  const rnd = mulberry32(seed);
  const perm = new Uint8Array(512);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const t = p[i]; p[i] = p[j]; p[j] = t;
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];

  /** 2D simplex noise in [-1, 1]. */
  function noise2(xin, yin) {
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t);
    const y0 = yin - (j - t);
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;
    let n = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) { const g = GRAD[perm[ii + perm[jj]] & 7]; t0 *= t0; n += t0 * t0 * (g[0] * x0 + g[1] * y0); }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) { const g = GRAD[perm[ii + i1 + perm[jj + j1]] & 7]; t1 *= t1; n += t1 * t1 * (g[0] * x1 + g[1] * y1); }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) { const g = GRAD[perm[ii + 1 + perm[jj + 1]] & 7]; t2 *= t2; n += t2 * t2 * (g[0] * x2 + g[1] * y2); }
    return 70 * n;
  }

  /** Fractal sum in roughly [-1, 1]. `x, y` already divided by the wavelength. */
  function fbm(x, y, octaves = 4, lacunarity = 2.0, gain = 0.5) {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let o = 0; o < octaves; o++) {
      sum += amp * noise2(x * freq + o * 17.3, y * freq - o * 11.7);
      norm += amp;
      amp *= gain; freq *= lacunarity;
    }
    return sum / norm;
  }

  /** Ridged multifractal in [0, 1]: sharp crests, good for mountain spines. */
  function ridged(x, y, octaves = 4, lacunarity = 2.0, gain = 0.5) {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let o = 0; o < octaves; o++) {
      const n = 1 - Math.abs(noise2(x * freq + o * 5.1, y * freq + o * 3.7));
      sum += amp * n * n;
      norm += amp;
      amp *= gain; freq *= lacunarity;
    }
    return sum / norm;
  }

  /** Domain warp: returns [x', y'] displaced by low-frequency noise. */
  function warp(x, y, strength = 0.3, scale = 1) {
    const dx = fbm(x * scale + 31.4, y * scale + 7.2, 2);
    const dy = fbm(x * scale - 12.9, y * scale + 44.8, 2);
    return [x + dx * strength, y + dy * strength];
  }

  return { noise2, fbm, ridged, warp, seed };
}

export const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export function smoothstep(e0, e1, v) {
  const t = clamp01((v - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}
