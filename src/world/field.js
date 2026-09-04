// The world field: the one function everything reads to know what the ground is
// at (x, z). Endless in every direction, deterministic from a seed, no THREE.
//
//   const field = createWorldField(seed);
//   field.heightAt(x, z)      metres above sea level (sea level is 0)
//   field.sampleAt(x, z)      { h, biome, water, river, land, temp, moist, slopeHint }
//
// Composition, outermost first:
//   continents   very low frequency, warped: where land is, where ocean is
//   islands      mid frequency bumps that rise out of the ocean
//   hills        gentle relief on land
//   mountains    ridged noise where a mountain mask says so, up to ~120 m
//   rivers       narrow valleys along the zero set of a warped noise, carved
//                below sea level so the water plane fills them; only on land
//                and only below the mountain line
//   home         within HOME_RADIUS of the origin the ground is flattened to 0
//                and rivers are suppressed, so the farm pad sits on solid
//                ground and the first steps off it are gentle
//   roads        dirt roads between neighbouring settlements (roads.js) grade
//                the ground toward a smoothed profile, by at most ROAD_CUT
//                down or ROAD_FILL up, so a road climbs a hill rather than
//                tunnelling it. A site's pad wins over a road and a river wins
//                over both, so a road crosses a river as a ford
//
// Biomes are decided from height, temperature and moisture, in that order of
// authority. Ids match the theme palettes the game already has (meadow, boreal,
// desert, sakura, oceanside as beach) plus ocean, mountain and snow.
//
// Units are the game's world units, which the farm treats as roughly metres.

import { createNoise, clamp01, lerp, smoothstep } from './noise.js';
import { cellRoll, siteAllowed, cellOf } from './sitegrid.js';
import { roadDistanceAt, roadHeightAt, roadStrength, roadSurface, fordFade, ROAD_HALF_WIDTH } from './roads.js';

// The farm pad top is y 0 and the ground under it is homeY (-0.3). The sea has
// to sit below both or the home disc counts as flooded and gets a water sheet.
export const SEA_LEVEL = -0.8;
export const HOME_RADIUS = 110;      // flat ground around the farm pad
export const HOME_BLEND = 90;        // metres over which the world takes over
export const CHUNK = 64;             // world units per chunk edge

export const BIOMES = ['ocean', 'beach', 'meadow', 'boreal', 'desert', 'sakura', 'mountain', 'snow'];

// Wavelengths in world units. Bigger is broader.
const W_CONT = 2600;    // continents
const W_ISLE = 420;     // islands
const W_HILL = 300;     // rolling relief
const W_MTN_MASK = 1500;
const W_MTN = 520;      // broader ridges: at 380 the slopes hit 10 m per metre
const W_RIVER = 900;
const W_TEMP = 1800;
const W_MOIST = 1400;
const W_SAKURA = 700;

const RIVER_HALF_WIDTH = 0.045;   // in noise units; wider rivers, raise it
const SNOW_LINE = 78;
const CAVE_MOUND = 6;             // how far a cave's mound rises above the hillside
const ROCK_LINE = 46;

export function createWorldField(seed = 1, opts = {}) {
  // The field is built onto one object so sampleAt can hand it to roads.js,
  // which needs raw, homeFactor and siteInCell back. One object also means one
  // road cache per field, which is what keeps two seeds apart.
  const self = {};
  const homeRadius = opts.homeRadius ?? HOME_RADIUS;
  const homeBlend = opts.homeBlend ?? HOME_BLEND;
  const homeBiome = opts.homeBiome ?? 'meadow';
  const homeY = opts.homeY ?? 0;          // ground level under the farm pad
  const roadsOn = opts.roads !== false;   // off only so a test can weigh the difference
  const N = createNoise(seed);

  // Raw terrain before the home flattening, so the flattening can be tested
  // independently and so tools can look at the world "as if the farm were not
  // there".
  function raw(x, z) {
    // continents, domain warped so coasts wander
    const [wx, wz] = N.warp(x / W_CONT, z / W_CONT, 0.35, 1.7);
    const cont = N.fbm(wx, wz, 4);                       // -1..1
    const landMask = smoothstep(-0.20, 0.06, cont);       // 0 ocean .. 1 land; shifted so ~55% is land

    // islands where the continent function says ocean
    const isle = N.fbm(x / W_ISLE + 900, z / W_ISLE - 300, 3);
    const isleMask = smoothstep(0.52, 0.70, isle) * (1 - landMask);
    const land = Math.max(landMask, isleMask);

    // ocean floor to lowland plateau, then hills
    let h = lerp(-14, 5, land);
    const hill = N.fbm(x / W_HILL - 200, z / W_HILL + 450, 5);
    h += hill * 9 * land;

    // mountains: a mask picks ranges, ridged noise shapes them
    const mtnMask = smoothstep(0.22, 0.58, N.fbm(x / W_MTN_MASK + 55, z / W_MTN_MASK + 55, 3)) * land;
    const ridge = N.ridged(x / W_MTN + 10, z / W_MTN - 10, 5);
    h += ridge * 112 * mtnMask;

    // rivers: the zero set of a warped noise, carved below sea level
    const [rx, rz] = N.warp(x / W_RIVER + 77, z / W_RIVER - 77, 0.25, 2.3);
    const rn = N.fbm(rx, rz, 3);
    let river = clamp01(1 - Math.abs(rn) / RIVER_HALF_WIDTH);
    river *= smoothstep(0.55, 0.9, land);                 // not in the sea
    // Rivers run through lowland. Cutting a channel to -1.8 through 30 m of
    // ground made a 12 m per metre gorge wall; fading the river out above ~15 m
    // keeps it in valleys, which is also where rivers are.
    river *= 1 - smoothstep(12, 24, h);
    if (river > 0) {
      const bed = -1.8;
      const carve = river * river * (3 - 2 * river);      // soft banks
      h = lerp(h, Math.min(h, bed), carve);
    }

    // climate: temperature falls with height, moisture rises toward the sea
    const temp = clamp01(0.5 + 0.5 * N.fbm(x / W_TEMP - 1000, z / W_TEMP + 1000, 3) - Math.max(0, h) * 0.0045);
    const moist = clamp01(0.5 + 0.5 * N.fbm(x / W_MOIST + 2000, z / W_MOIST + 2000, 3) + (1 - land) * 0.25 + river * 0.2);

    return { h, land, river, temp, moist, cont };
  }

  function homeFactor(x, z) {
    const d = Math.hypot(x, z);
    // Snapped: at d = homeRadius float error leaves a 1e-32 residue, and a river
    // scaled by that is still "a river" to any strict comparison.
    const k = smoothstep(homeRadius, homeRadius + homeBlend, d);
    return k < 1e-9 ? 0 : k;                                      // 0 at home .. 1 world
  }

  // Sites shape the ground: a town stands on a levelled pad, a cave sits in a
  // mound. The roll is sitegrid's; the terrain check uses the RAW sample at
  // the site's centre, so flattening can never talk itself into existence.
  const siteCache = new Map();
  function siteInCell(cx, cz) {
    const key = cx + ',' + cz;
    if (siteCache.has(key)) return siteCache.get(key);
    let site = cellRoll(seed, cx, cz);
    if (site) {
      const r = raw(site.x, site.z);
      if (!siteAllowed(site, r, homeFactor(site.x, site.z))) site = null;
      else {
        site.y = site.kind === 'cave' ? r.h + CAVE_MOUND : r.h;
        site.biome = null;
        // a cave opens downhill, out of the slope, never into the mountain: the
        // mouth faces whichever of eight directions has the lowest ground 15 m out
        if (site.kind === 'cave') {
          let best = -Infinity, bestA = site.facing;
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            const drop = r.h - raw(site.x + Math.sin(a) * 15, site.z + Math.cos(a) * 15).h;
            if (drop > best) { best = drop; bestA = a; }
          }
          site.facing = bestA;
        }
      }
    }
    siteCache.set(key, site);
    return site;
  }
  function siteAt(x, z) {
    const [cx, cz] = cellOf(x, z);
    return siteInCell(cx, cz);
  }

  function sampleAt(x, z) {
    const r = raw(x, z);
    const k = homeFactor(x, z);
    let h = lerp(homeY, r.h, k);
    let river = k <= 0 ? 0 : r.river * k;
    const site = siteAt(x, z);
    let pad = 0;
    if (site) {
      const d = Math.hypot(x - site.x, z - site.z);
      if (d < site.flatR + 4) {
        // 1 at the centre, 0 at the rim, soft shoulder
        const w = 1 - smoothstep(site.flatR * 0.55, site.flatR + 4, d);
        const target = site.kind === 'cave'
          ? site.y - CAVE_MOUND * smoothstep(3, site.flatR, d)   // a mound that peaks at the mouth
          : site.y;
        h = lerp(h, target, w);
        river *= 1 - w;
        pad = w;
      }
    }
    // roads: a dirt strip graded toward the road's own smoothed profile. The
    // farm disc, a site's pad and a river each hold it off, in that order, so
    // the home ground stays clean, a town square stays level, and a road meets
    // a river as a ford instead of damming it.
    let road = 0;
    if (roadsOn && k > 0) {
      const rd = roadDistanceAt(self, x, z);
      if (rd) {
        road = roadStrength(rd.d) * k;
        if (road > 0) {
          const w = road * (1 - pad) * fordFade(river);
          if (w > 0) h = roadSurface(h, roadHeightAt(rd.road, rd.t), w);
        }
      }
    }
    const land = lerp(1, r.land, k);
    const water = h < SEA_LEVEL - 0.05;
    let biome;
    if (k < 0.5) biome = homeBiome;
    else if (water && river < 0.4) biome = 'ocean';
    else if (h >= SNOW_LINE) biome = 'snow';
    else if (h >= ROCK_LINE) biome = 'mountain';
    else if (h < 2.2 && r.land < 0.97 && river < 0.3) biome = 'beach';
    else if (r.temp < 0.30) biome = 'boreal';
    else if (r.temp > 0.58 && r.moist < 0.47) biome = 'desert';
    else if (r.moist > 0.62 && r.temp > 0.42 && r.temp < 0.66 && N.fbm(x / W_SAKURA + 5000, z / W_SAKURA - 5000, 2) > 0.38) biome = 'sakura';
    else biome = 'meadow';
    return { h, biome, water, river, land, temp: r.temp, moist: r.moist, site, road };
  }

  const heightAt = (x, z) => sampleAt(x, z).h;
  const biomeAt = (x, z) => sampleAt(x, z).biome;

  /** Chunk coordinates of a world point. */
  const chunkOf = (x, z) => [Math.floor(x / CHUNK), Math.floor(z / CHUNK)];

  return Object.assign(self, {
    seed, heightAt, biomeAt, sampleAt, raw, homeFactor, chunkOf, siteInCell, siteAt,
    seaLevel: SEA_LEVEL, chunk: CHUNK, homeRadius, homeY, biomes: BIOMES,
    roadHalfWidth: ROAD_HALF_WIDTH,
  });
}
