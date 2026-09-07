// The sky: one analytic dome, driven by the shared 25 minute day.
//
// Ported from the shaders in docs/reference/aqua-ocean-studio.jsx (the zenith
// and horizon gradient, the sun disc and its glare, the fbm cloud deck, the
// tone curve) and grown the rest of the way into a whole day: the sun rides an
// arc from below the horizon at midnight to high at noon, the palette runs
// night, dawn, gold, noon and back, stars come out in the shader, and the moon
// hangs opposite the sun.
//
//   const sky = createSky(sc);
//   sky.update(dayFactor, camera.position, dt, now);   // every frame
//   sc.scene.fog.color.copy(sky.colours.fog);
//
// Two things in here are shared on purpose:
//
//   SKY_GLSL   the glsl `skyCol(dir, withClouds)` the water reflects. water.js
//              concatenates this exact string, so there is one sky and not two
//              that drift apart.
//   skyColours a pure function of the day factor, no THREE and no renderer, so
//              the fog colour, the hemisphere light and any test can read the
//              palette without a canvas. src/game/sky.test.mjs drives it.
//
// The dome and the water both write `gl_FragColor` and then run three's own
// `<tonemapping_fragment>` and `<colorspace_fragment>` chunks, so they go
// through the SAME ACES curve and the SAME `renderer.toneMappingExposure` as
// the terrain's MeshStandardMaterial. Do not add a second tone curve in here.

import * as THREE from 'three';
import { DAY_CYCLE_MS, phaseAt } from './dayclock.js';
import { REALM_ZONES, weightOf, realmAt } from '../world/zones.js';
import { weatherPalette, weatherLighting } from './weather/atmosphere.js';

/**
 * One full day. This has to equal scene.js's DAY_CYCLE_MS or the sun will
 * drift out of step with the light. sky.test.mjs imports both and compares.
 */
export const DAY_CYCLE_S = DAY_CYCLE_MS / 1000;   // 1500: twenty minutes of day and five of night

/** How high the sun climbs at noon, and how far below it sinks at midnight. */
export const MAX_ELEVATION = 1.05;      // radians, 60 degrees

/** Which way is noon. 0 puts the noon sun over +z, so it rises toward +x. */
export const NOON_AZIMUTH = 0.35;

/** Radius of the dome. Must stay inside scene.js's camera far plane (1800). */
export const SKY_RADIUS = 1500;

/**
 * The lowest the shadow casting light is allowed to sit. sin(0.25) is about
 * 14 degrees; below that a 2 m post throws an 8 m shadow, and scene.js's
 * shadow box is 55 m each way, so it starts to clip.
 */
export const SHADOW_MIN_Y = 0.25;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const clamp01 = (v) => clamp(v, 0, 1);
const TAU = Math.PI * 2;

// ---------------------------------------------------------------- palette --
//
// Keyframes on the day factor. scene.js's curve is a clamped cosine, so the
// day factor and the sun's elevation are one and the same number rescaled:
//
//   elevation = MAX_ELEVATION * ((d + 0.2) / 0.7 - 1)
//
// which is exactly 0 at d = 0.5. That is why the gold sits on 0.5: it is the
// moment the sun is on the horizon, not a guess.

const hx = (h) => ({ r: ((h >> 16) & 255) / 255, g: ((h >> 8) & 255) / 255, b: (h & 255) / 255 });

export const SKY_KEYS = [
  // d,    zenith,     horizon,    sun / moon, fog
  [0.00, 0x05070e, 0x0d1424, 0xaebbdd, 0x0a0f1c],
  [0.35, 0x16203c, 0x4a3a52, 0xff9a54, 0x23253c],
  [0.50, 0x3a4270, 0xffab5e, 0xff8a3c, 0x8a6a63],
  [0.65, 0x3f74b8, 0xffd9a8, 0xffc389, 0xb79f95],
  [1.00, 0x2f79d6, 0xdfefff, 0xfff3d6, 0xcfe0ee],
].map(([d, z, h, s, f]) => ({ d, zenith: hx(z), horizon: hx(h), sun: hx(s), fog: hx(f) }));

const mixc = (a, b, t) => ({ r: a.r + (b.r - a.r) * t, g: a.g + (b.g - a.g) * t, b: a.b + (b.b - a.b) * t });

// ------------------------------------------------------------ the realms --
//
// Nine realms, nine skies. The Boneyard under the Greenwold's blue was the
// bug: a grey ash plain where nine dragons fell, lit like a meadow at noon.
//
// A row is the same five stops SKY_KEYS is, in the same order and at the same
// day factors, so the whole of the day is authored per realm and not guessed
// from two colours. Beside them:
//
//   ground     the colour under everything, by day and by night. scene.js
//              turns the pair into a RATIO against the Greenwold's, which is
//              what lets the calibrated hemisphere light stand and still read
//              as red rock in the Wastes and as bone in the Boneyard
//   fogNear    where the fog starts and ends, in metres. scene.js scales the
//   fogFar     caller's own fog by these over the Greenwold's, so the numbers
//              here are absolute and the Greenwold is exactly a no-op
//   sun        a multiplier on the sun's colour, and on its strength
//   hemi       the same for the sky half of the hemisphere light
//   ambient    the same for the ambient
//   haze       0 clear, 1 thick. Washes the zenith toward the horizon and puts
//              a floor under the cloud cover, which is what an ash storm and a
//              desert noon have in common
//
// THE GREENWOLD IS UNCHANGED. Its keys ARE SKY_KEYS, every multiplier is 1 and
// its haze is 0, so `skyColours(d)` returns exactly what it returned before
// this table existed. sky.test.mjs pins its noon and midnight to the numbers
// the game shipped with and fails if a single component moves.

const keys = (rows) => rows.map(([d, z, h, s, f]) => ({ d, zenith: hx(z), horizon: hx(h), sun: hx(s), fog: hx(f) }));
const one = [1, 1, 1];

export const REALM_SKY = {
  greenwold: {
    name: 'The Greenwold',
    keys: SKY_KEYS,
    ground: { day: 0x756349, night: 0x11141c },
    fogNear: 90, fogFar: 536,
    sun: one, sunStrength: 1, hemi: one, hemiStrength: 1, ambient: one,
    haze: 0,
  },
  verdant: {
    name: 'Verdant Deep',
    keys: keys([
      [0.00, 0x06100c, 0x102019, 0xa8c4b0, 0x0c1712],
      [0.35, 0x18301f, 0x46503a, 0xffb070, 0x243026],
      [0.50, 0x3a5a44, 0xffc06a, 0xffa050, 0x7d7a52],
      [0.65, 0x4a8a5e, 0xffe0a8, 0xffd08a, 0xa8b184],
      [1.00, 0x4a94c0, 0xe8f0c0, 0xfff0c0, 0xbfd3a4],
    ]),
    ground: { day: 0x3a4a28, night: 0x0e1410 },
    fogNear: 40, fogFar: 320,
    sun: [0.98, 1.00, 0.86], sunStrength: 0.90,
    hemi: [0.90, 1.05, 0.85], hemiStrength: 1.00,
    ambient: [0.95, 1.00, 0.85],
    haze: 0.25,
  },
  saltmarch: {
    name: 'The Saltmarch',
    keys: keys([
      [0.00, 0x080b12, 0x131a24, 0xb2bcd0, 0x0e131b],
      [0.35, 0x1a2436, 0x4e4a52, 0xf0a072, 0x252a34],
      [0.50, 0x415068, 0xf5c090, 0xf0a26a, 0x8a8a86],
      [0.65, 0x5a86b0, 0xf0dcc4, 0xf5d4b0, 0xb4b8b2],
      [1.00, 0x5a8ec0, 0xdfe8ea, 0xf6f2e6, 0xcdd6d4],
    ]),
    ground: { day: 0x6a6c58, night: 0x11151a },
    fogNear: 55, fogFar: 420,
    sun: [0.98, 0.99, 1.00], sunStrength: 0.92,
    hemi: [0.98, 1.00, 1.02], hemiStrength: 1.05,
    ambient: [0.98, 1.00, 1.02],
    haze: 0.40,
  },
  emberwastes: {
    name: 'Ember Wastes',
    keys: keys([
      [0.00, 0x0a0910, 0x171522, 0xc0b8d0, 0x120f18],
      [0.35, 0x261a2c, 0x6a4038, 0xffa050, 0x35262a],
      [0.50, 0x574054, 0xffab4e, 0xff7a28, 0xa07a58],
      [0.65, 0x6a7ea8, 0xffd08a, 0xffc070, 0xc9a583],
      [1.00, 0x7a9ac0, 0xf2dcae, 0xfff0c8, 0xd8c49a],
    ]),
    ground: { day: 0x8a6a42, night: 0x1a1512 },
    fogNear: 200, fogFar: 536,
    sun: [1.00, 0.96, 0.86], sunStrength: 1.14,
    hemi: [1.02, 0.98, 0.90], hemiStrength: 1.05,
    ambient: [1.00, 0.95, 0.85],
    haze: 0.55,
  },
  stormpeaks: {
    name: 'The Stormpeaks',
    keys: keys([
      [0.00, 0x03050c, 0x0a1020, 0xb4c0e0, 0x070c18],
      [0.35, 0x101a34, 0x3a3450, 0xf09a68, 0x1c2034],
      [0.50, 0x2c3a6a, 0xf0a878, 0xf08a4a, 0x6a6a80],
      [0.65, 0x2f6ec0, 0xd8dcf0, 0xf0c8a0, 0x9aabc4],
      [1.00, 0x1c62d8, 0xcfe4ff, 0xfff6e6, 0xbcd4ee],
    ]),
    ground: { day: 0x5e6458, night: 0x0d1118 },
    fogNear: 140, fogFar: 536,
    sun: [0.99, 0.99, 1.00], sunStrength: 1.06,
    hemi: [0.96, 0.99, 1.06], hemiStrength: 1.05,
    ambient: [0.97, 0.99, 1.05],
    haze: 0.05,
  },
  boneyard: {
    name: 'The Boneyard',
    keys: keys([
      [0.00, 0x0a0a09, 0x1a1815, 0xc4bfae, 0x141210],
      [0.35, 0x241f19, 0x4a3f31, 0xd8a878, 0x2e2820],
      [0.50, 0x4a443a, 0x9a7448, 0xd8a060, 0x6e5c44],
      [0.65, 0x76776c, 0xbfa47c, 0xe0c49a, 0x968874],
      [1.00, 0x8a908c, 0xd8cdb4, 0xf0ecdc, 0xb0a898],
    ]),
    ground: { day: 0x6b6357, night: 0x14120f },
    fogNear: 60, fogFar: 400,
    sun: [0.97, 0.96, 0.94], sunStrength: 0.88,
    hemi: [0.98, 0.97, 0.94], hemiStrength: 0.95,
    ambient: [0.98, 0.97, 0.94],
    haze: 0.60,
  },
  frostreach: {
    name: 'Frostreach',
    keys: keys([
      [0.00, 0x040a18, 0x0c1a30, 0xc8d8f0, 0x0a1424],
      [0.35, 0x123054, 0x2e4a70, 0xd8b0a0, 0x1e3450],
      [0.50, 0x36568c, 0xd0c8d8, 0xe8b898, 0x7a8aa0],
      [0.65, 0x4a86c8, 0xeaf2fa, 0xf0dcd0, 0xb4c8dc],
      [1.00, 0x4a90d8, 0xf2f8ff, 0xfffaf0, 0xdce8f2],
    ]),
    ground: { day: 0x9aa8b0, night: 0x152030 },
    fogNear: 70, fogFar: 430,
    sun: [0.98, 0.99, 1.00], sunStrength: 1.05,
    hemi: [0.98, 1.00, 1.05], hemiStrength: 1.10,
    ambient: [0.98, 1.00, 1.04],
    haze: 0.35,
  },
  sunkenkingdom: {
    name: 'The Sunken Kingdom',
    keys: keys([
      [0.00, 0x04100e, 0x0a1c1c, 0xa8ccc8, 0x081614],
      [0.35, 0x123028, 0x2e4a44, 0xd8a878, 0x1e332e],
      [0.50, 0x2e5a52, 0xd8c084, 0xe8a060, 0x6a8074],
      [0.65, 0x3a8a90, 0xd8ecd8, 0xf0d0a8, 0x9ac0b4],
      [1.00, 0x2f8ab4, 0xd4f0e4, 0xf4fae8, 0xa8d4c4],
    ]),
    ground: { day: 0x4a7a68, night: 0x0d1a18 },
    fogNear: 30, fogFar: 250,
    sun: [0.94, 1.00, 0.96], sunStrength: 0.94,
    hemi: [0.90, 1.02, 0.98], hemiStrength: 1.00,
    ambient: [0.92, 1.00, 0.96],
    haze: 0.30,
  },
  ashenthrone: {
    name: 'The Ashen Throne',
    keys: keys([
      [0.00, 0x0a0406, 0x2a0a06, 0xd88a5a, 0x140806],
      [0.35, 0x1c0a0a, 0x5a1408, 0xff6a20, 0x2a0e08],
      [0.50, 0x361418, 0x9a2c0a, 0xff5a1a, 0x4e1c10],
      [0.65, 0x4a2a30, 0xc4562a, 0xff8a40, 0x6e3220],
      [1.00, 0x5a3a48, 0xd8724a, 0xffb070, 0x8a4a30],
    ]),
    ground: { day: 0x3a2420, night: 0x140a08 },
    fogNear: 45, fogFar: 330,
    sun: [1.00, 0.82, 0.66], sunStrength: 0.95,
    hemi: [1.02, 0.90, 0.82], hemiStrength: 0.95,
    ambient: [1.00, 0.86, 0.74],
    haze: 0.50,
  },
};

/** The sky the world falls back to: the heart's own, and the one it always had. */
export const DEFAULT_REALM = 'greenwold';

/** Every key a realm row has to carry. `auditSky` and the test both read it. */
export const SKY_FIELDS = ['name', 'keys', 'ground', 'fogNear', 'fogFar', 'sun', 'sunStrength', 'hemi', 'hemiStrength', 'ambient', 'haze'];

/**
 * The nine rows, checked. Thrown at import, so a tenth realm with no sky, or a
 * row missing its fog, cannot ship quietly behind a blue one.
 */
export function auditSky(table = REALM_SKY, realms = REALM_ZONES) {
  const bad = [];
  for (const zn of realms) if (!table[zn.id]) bad.push(`${zn.id}: no sky`);
  for (const [id, row] of Object.entries(table)) {
    for (const f of SKY_FIELDS) if (row[f] === undefined) bad.push(`${id}: no ${f}`);
    if (!Array.isArray(row.keys) || row.keys.length !== SKY_KEYS.length) {
      bad.push(`${id}: ${row.keys?.length} stops, wanted ${SKY_KEYS.length}`);
    } else {
      for (let i = 0; i < row.keys.length; i++) {
        const k = row.keys[i];
        if (k.d !== SKY_KEYS[i].d) bad.push(`${id}: stop ${i} sits at ${k.d}, not ${SKY_KEYS[i].d}`);
        for (const c of ['zenith', 'horizon', 'sun', 'fog']) if (!k[c]) bad.push(`${id}: stop ${i} has no ${c}`);
      }
    }
    if (!(row.fogNear > 0) || !(row.fogFar > row.fogNear)) bad.push(`${id}: fog ${row.fogNear} to ${row.fogFar}`);
    if (row.fogFar > REALM_SKY.greenwold.fogFar) bad.push(`${id}: fog reaches ${row.fogFar} m, past the streamed ring`);
    if (row.haze < 0 || row.haze > 1) bad.push(`${id}: haze ${row.haze}`);
    for (const f of ['sun', 'hemi', 'ambient']) {
      if (!Array.isArray(row[f]) || row[f].length !== 3) { bad.push(`${id}: ${f} is not three numbers`); continue; }
      for (const v of row[f]) if (!(v >= 0.5 && v <= 1.6)) bad.push(`${id}: ${f} multiplier ${v} is out of hand`);
    }
    for (const f of ['sunStrength', 'hemiStrength']) if (!(row[f] >= 0.7 && row[f] <= 1.4)) bad.push(`${id}: ${f} ${row[f]} is out of hand`);
  }
  const g = table[DEFAULT_REALM];
  if (g && g.keys !== SKY_KEYS) bad.push('the Greenwold no longer uses SKY_KEYS, so the heart\'s sky has moved');
  if (bad.length) throw new Error(`sky: ${bad.length} problem(s)\n  ${bad.join('\n  ')}`);
  return Object.keys(table).length;
}

// ------------------------------------------------------------ the blend --

const DEFAULT_MIX = [[DEFAULT_REALM, 1]];

/**
 * How much of each realm's sky is over this point.
 *
 * The realms' discs overlap, so on the border between two of them both weigh
 * 1 and the answer is half of each: crossing is a fade over the edge band and
 * not a cut. Ground claimed by nobody takes the default sky by the share it
 * has left over, so walking out of the Boneyard thins the ash out of the air
 * rather than switching it off.
 *
 * `out` is an optional array to fill, so the frame loop allocates nothing.
 */
/** Metres either side of a realm line over which the two skies blend. */
export const REALM_BLEND_M = 240;

/**
 * Which realms colour the sky here, and how much each. The realm discs overlap
 * on purpose (a subzone can sit in two), so the raw weights of every realm a
 * point is inside gave a 50/50 sky in the middle of the Greenwold. The sky
 * follows the ground: the realm `zones.realmAt` gives the point owns the sky,
 * and the only blend is within REALM_BLEND_M of the line where realmAt changes
 * its answer, found by probing toward the nearest other realm and bisecting.
 * Six zoneAt calls a frame at most. Fable, 2026-09-06, after Hearthhome's sky
 * read as half Verdant Deep.
 */
export function realmMixAt(x, z, out = []) {
  out.length = 0;
  const win = realmAt(x, z);
  if (!win) { out.push([DEFAULT_REALM, 1]); return out; }
  // the neighbour to probe toward: the other realm this point is nearest to, by its reach
  let other = null, best = Infinity;
  for (const zn of REALM_ZONES) {
    if (zn.id === win.id) continue;
    const u = Math.hypot(x - zn.x, z - zn.z) / (zn.r + (zn.edge || 0));
    if (u < best) { best = u; other = zn; }
  }
  if (!other) { out.push([win.id, 1]); return out; }
  const len = Math.hypot(other.x - x, other.z - z) || 1;
  const dx = (other.x - x) / len, dz = (other.z - z) / len;
  const far = realmAt(x + dx * REALM_BLEND_M, z + dz * REALM_BLEND_M);
  if (!far || far.id === win.id) { out.push([win.id, 1]); return out; }
  // the line is inside the blend reach: find how far off it is
  let lo = 0, hi = REALM_BLEND_M;
  for (let i = 0; i < 5; i++) {
    const m = (lo + hi) / 2;
    const r = realmAt(x + dx * m, z + dz * m);
    if (r && r.id === win.id) lo = m; else hi = m;
  }
  const dist = (lo + hi) / 2;                         // metres to the line
  const t = 0.5 * (1 - dist / REALM_BLEND_M);         // half at the line, nothing at the reach
  out.push([win.id, 1 - t]);
  out.push([far.id, t]);
  return out;
}

/** The mix a caller asked for: an explicit one, a single realm, or the default. */
function mixOf(opts) {
  if (opts.mix && opts.mix.length) return opts.mix;
  if (opts.realm) return REALM_SKY[opts.realm] ? [[opts.realm, 1]] : DEFAULT_MIX;
  return DEFAULT_MIX;
}

const rowOf = (id) => REALM_SKY[id] || REALM_SKY[DEFAULT_REALM];

/** The four colours of one realm's sky at a moment of its day. */
function stopsAt(rows, d) {
  let i = 0;
  while (i < rows.length - 2 && d > rows[i + 1].d) i++;
  const a = rows[i], b = rows[i + 1];
  const t = b.d === a.d ? 0 : clamp01((d - a.d) / (b.d - a.d));
  return {
    zenith: mixc(a.zenith, b.zenith, t),
    horizon: mixc(a.horizon, b.horizon, t),
    sun: mixc(a.sun, b.sun, t),
    fog: mixc(a.fog, b.fog, t),
  };
}

const ZERO3 = () => ({ r: 0, g: 0, b: 0 });
const acc = (o, c, w) => { o.r += c.r * w; o.g += c.g * w; o.b += c.b * w; };


/** Rec. 709 luminance of an { r, g, b }. Used by the tests and by nothing else. */
export const luminance = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

/** How warm a colour reads: red over blue. Positive is warm. */
export const warmth = (c) => c.r - c.b;

/**
 * The sun's elevation for a day factor, in radians, negative below the
 * horizon. Saturates on the day and night plateaus, where the day factor has
 * stopped moving but the sun has not; sunPhase gives the unsaturated angle.
 */
export function elevationForDay(dayFactor) {
  const d = clamp01(dayFactor);
  return MAX_ELEVATION * clamp((d + 0.2) / 0.7 - 1, -1, 1);
}

/**
 * The palette at a moment of the day, over whichever realms the player is
 * standing between. Pure: numbers in, plain colours out, no THREE, no
 * renderer, no DOM. Components are sRGB in 0..1.
 *
 *   skyColours(d)                                  the Greenwold, exactly as before
 *   skyColours(d, { realm: 'boneyard' })           one realm's own
 *   skyColours(d, { mix: realmMixAt(x, z) })       the blend at a place
 *
 * With no realm and no mix this is the Greenwold's row, whose keys ARE
 * SKY_KEYS, so every number this returned before the realms existed it still
 * returns. sky.test.mjs pins that.
 */
export function skyColours(dayFactor, opts = {}) {
  const d = clamp01(dayFactor);
  const mix = mixOf(opts);
  const zenith = ZERO3(), horizon = ZERO3(), sun = ZERO3(), fog = ZERO3();
  let haze = 0, fogNear = 0, fogFar = 0;
  for (let i = 0; i < mix.length; i++) {
    const row = rowOf(mix[i][0]), w = mix[i][1];
    const st = stopsAt(row.keys, d);
    acc(zenith, st.zenith, w); acc(horizon, st.horizon, w);
    acc(sun, st.sun, w); acc(fog, st.fog, w);
    haze += row.haze * w; fogNear += row.fogNear * w; fogFar += row.fogFar * w;
  }
  // Haze washes the top of the sky down toward the horizon and puts a floor
  // under the cloud, which is what an ash storm and a desert noon share. At
  // haze 0 both lines are exactly the identity, so the Greenwold does not move.
  if (haze > 0) {
    const k = haze * 0.32;
    zenith.r += (horizon.r - zenith.r) * k;
    zenith.g += (horizon.g - zenith.g) * k;
    zenith.b += (horizon.b - zenith.b) * k;
  }
  // Glare peaks where the sun sits on the horizon and the air is long.
  const gold = 1 - Math.min(1, Math.abs(d - 0.5) / 0.28);
  const cloud = opts.cloud ?? 0.45;
  return weatherPalette({
    zenith, horizon, sun, fog,
    glare: 0.45 + 0.35 * d + 0.5 * gold * gold,
    cloud: haze > 0 ? Math.max(cloud, 0.35 + haze * 0.45) : cloud,
    // stars are gone by the time the sun is a quarter of the way up
    star: 1 - smooth(0.02, 0.45, d),
    moon: 1 - smooth(0.12, 0.62, d),
    sunUp: smooth(0.42, 0.56, d),
    elevation: elevationForDay(d),
    day: d,
    haze, fogNear, fogFar,
  }, opts.weather);
}

/**
 * What the realms under the player do to the four lights, as MULTIPLIERS on
 * scene.js's own calibrated day curve.
 *
 * Multipliers and not colours on purpose. The curve in scene.js was measured in
 * the browser against a dark cloak in shade and a meadow at noon, and replacing
 * it per realm would throw that away. A realm tints it instead, and the
 * Greenwold's tint is 1 in every channel, so the heart is bit for bit the day
 * it always was.
 *
 * `ground` is the one that comes from colours rather than from a number: each
 * realm names the ground it stands on by day and by night, and the multiplier
 * is that colour over the Greenwold's at the same hour. The Greenwold over
 * itself is 1.
 */
export function skyLighting(dayFactor, opts = {}) {
  const d = clamp01(dayFactor);
  const mix = mixOf(opts);
  const sun = [0, 0, 0], hemi = [0, 0, 0], ambient = [0, 0, 0];
  const ground = ZERO3();
  let sunI = 0, hemiI = 0;
  for (let i = 0; i < mix.length; i++) {
    const row = rowOf(mix[i][0]), w = mix[i][1];
    for (let k = 0; k < 3; k++) { sun[k] += row.sun[k] * w; hemi[k] += row.hemi[k] * w; ambient[k] += row.ambient[k] * w; }
    sunI += row.sunStrength * w; hemiI += row.hemiStrength * w;
    acc(ground, groundAt(row, d), w);
  }
  const base = groundAt(REALM_SKY[DEFAULT_REALM], d);
  const gr = [
    clamp(ground.r / Math.max(base.r, 1e-4), 0.35, 2.4),
    clamp(ground.g / Math.max(base.g, 1e-4), 0.35, 2.4),
    clamp(ground.b / Math.max(base.b, 1e-4), 0.35, 2.4),
  ];
  return weatherLighting({ sun, sunI, hemi, hemiI, ambient, ground: gr, day: d }, opts.weather);
}

/** A realm's ground colour at an hour: its night, its day, and the day between. */
function groundAt(row, d) {
  return mixc(hx(row.ground.night), hx(row.ground.day), d);
}

function smooth(e0, e1, x) {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

// ------------------------------------------------------------------ phase --
//
// The day factor alone cannot say whether it is morning or evening: the curve
// is symmetric, and it is flat for a quarter of the cycle at each end. The
// phase is the real clock position, 0 at midnight and 0.5 at noon, and it is
// what the sun's arc is drawn from.

/**
 * Phase straight off the game clock, which is the honest path: it agrees with
 * scene.js's dayFactorAt by construction because it inverts the same offset.
 */
export function phaseFromClock(nowMs, cycleS = DAY_CYCLE_S) {
  return phaseAt(nowMs, cycleS * 1000);   // the shared warp: 80% of the cycle above the horizon
}

/**
 * Phase from the day factor alone, given which way the curve is going.
 * Exact wherever the curve is moving; on a plateau it returns the plateau
 * edge, which is why createSky integrates dt across the flat parts.
 */
export function phaseFromDay(dayFactor, rising) {
  const raw = clamp((clamp01(dayFactor) + 0.2) / 1.4, 0, 1);
  const a = Math.acos(clamp(2 * raw - 1, -1, 1)) / TAU;            // 0..0.5 from noon
  const tphase = rising ? 1 - a : a;
  return (tphase + 0.5) % 1;
}

/** The hour angle: 0 at noon, +-PI at midnight, positive in the afternoon. */
export function hourAngle(phase) {
  let t = (phase - 0.5) * TAU;
  while (t > Math.PI) t -= TAU;
  while (t < -Math.PI) t += TAU;
  return t;
}

/** Where the sun is. A unit vector pointing from the ground at the sun. */
export function sunDirectionAt(phase, maxEl = MAX_ELEVATION, noonAz = NOON_AZIMUTH) {
  const ha = hourAngle(phase);
  const el = maxEl * Math.cos(ha);
  const az = noonAz + ha;
  const ce = Math.cos(el);
  return { x: ce * Math.sin(az), y: Math.sin(el), z: ce * Math.cos(az), elevation: el, azimuth: az };
}

// ------------------------------------------------------------------- glsl --
//
// Shared with water.js. Everything here is a function of the uniforms below,
// so a material that concatenates this string and hands over these uniforms
// gets the same sky the dome paints.

export const SKY_GLSL = /* glsl */`
precision highp float;

uniform vec3 uZenith, uHorizon, uSunColor, uMoonColor, uSunDir, uMoonDir, uCamPos;
uniform float uGlare, uCloud, uTime, uDay, uStars, uMoonUp, uSunUp;
uniform vec2 uCloudWind;

float hash21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }

float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i), b = hash21(i + vec2(1.0, 0.0)), c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 4; i++) { v += a * vnoise(p); p = m * p; a *= 0.5; }
  return v;
}

// One star per cell of a grid laid on the cube around the viewer, so the field
// is fixed to the sky and not to the screen. Ten cells in a hundred hold a
// star; the rest are empty black.
float starField(vec3 d){
  vec3 a = abs(d);
  vec2 uv; float face;
  if (a.x >= a.y && a.x >= a.z) { uv = d.yz / a.x; face = 0.0; }
  else if (a.y >= a.z) { uv = d.zx / a.y; face = 7.0; }
  else { uv = d.xy / a.z; face = 13.0; }
  vec2 g = uv * 110.0 + face * 31.0;
  vec2 ip = floor(g), fp = fract(g);
  float h = hash21(ip);
  if (h < 0.90) return 0.0;
  vec2 c = vec2(hash21(ip + 11.3), hash21(ip + 27.7));
  float mag = (h - 0.90) / 0.10;
  float tw = 0.72 + 0.28 * sin(uTime * (1.4 + mag * 3.1) + h * 40.0);
  // reversed-edge smoothstep is undefined in the spec, so it is written out
  return (1.0 - smoothstep(0.0, 0.17, length(fp - c))) * mag * tw;
}

vec3 skyCol(vec3 d, float withClouds){
  d = normalize(d);
  float t = clamp(d.y, 0.0, 1.0);
  vec3 c = mix(uHorizon, uZenith, pow(t, 0.38));
  if (d.y < 0.0) c = mix(uHorizon, uHorizon * 0.45, clamp(-d.y * 3.0, 0.0, 1.0));

  if (uStars > 0.002 && d.y > 0.0) {
    c += vec3(0.92, 0.95, 1.0) * starField(d) * uStars * smoothstep(0.0, 0.07, d.y);
  }

  vec3 M = normalize(uMoonDir);
  float m = max(dot(d, M), 0.0);
  c += uMoonColor * pow(m, 220.0) * 0.35 * uMoonUp;
  c += uMoonColor * smoothstep(0.9988, 0.9995, m) * 2.6 * uMoonUp;

  vec3 L = normalize(uSunDir);
  float s = max(dot(d, L), 0.0);
  c += uSunColor * pow(s, 6.0) * 0.22 * uGlare * uSunUp;
  c += uSunColor * pow(s, 64.0) * 0.35 * uGlare * uSunUp;
  c += uSunColor * smoothstep(0.9994, 0.9999, s) * 12.0 * uSunUp;

  if (withClouds > 0.5 && d.y > 0.0) {
    vec2 p = d.xz / (d.y + 0.15) * 1.6 + uTime * uCloudWind;
    float n = fbm(p);
    float th = 0.78 - uCloud * 0.5;
    float cov = smoothstep(th, th + 0.22, n) * smoothstep(0.0, 0.12, d.y);
    vec3 lit = mix(vec3(1.0, 1.0, 1.02) * 1.1, vec3(0.62, 0.66, 0.74), smoothstep(th + 0.05, th + 0.42, n));
    // a cloud is only ever as bright as the day is, and it catches the low sun
    lit = mix(uHorizon * 0.55 + uMoonColor * 0.06 * uMoonUp, lit, 0.25 + 0.75 * uDay);
    lit *= (0.85 + 0.35 * pow(s, 2.0) * uSunUp);
    lit *= 1.0 - smoothstep(.65,1.0,uCloud)*.35;
    c = mix(c, lit, cov);
  }
  return c;
}
`;

export const SKY_VERT = /* glsl */`
varying vec3 vDir;
void main(){
  vDir = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const SKY_FRAG = /* glsl */`
varying vec3 vDir;
void main(){
  gl_FragColor = vec4(skyCol(vDir, 1.0), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/** Every uniform SKY_GLSL declares. water.js builds on top of this block. */
export function createSkyUniforms() {
  return {
    uZenith: { value: new THREE.Color(0x2f79d6) },
    uHorizon: { value: new THREE.Color(0xdfefff) },
    uSunColor: { value: new THREE.Color(0xfff3d6) },
    uMoonColor: { value: new THREE.Color(0xb9c6e6) },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
    uCamPos: { value: new THREE.Vector3() },
    uGlare: { value: 0.6 },
    uCloud: { value: 0.45 },
    uCloudWind: { value: new THREE.Vector2(.006,.003) },
    uTime: { value: 0 },
    uDay: { value: 1 },
    uStars: { value: 0 },
    uMoonUp: { value: 0 },
    uSunUp: { value: 1 },
  };
}

/** sRGB components in, a THREE.Color in the renderer's working space out. */
function setSRGB(col, c) {
  col.setRGB(c.r, c.g, c.b, THREE.SRGBColorSpace);
  return col;
}

// ------------------------------------------------------------------ build --

/**
 * The dome.
 *
 * `sc` is scene.js's return: this uses `sc.scene`, and `sc.sky` if it is there
 * (so the group world_runtime.js already hides on the way underground is the
 * one the dome lives in). scene.js's own two gradient domes, its sun ball, its
 * glow sprite and its moon have to be switched off by the caller: they sit at
 * radius 1500 and would paint straight over this one.
 */
export function createSky(sc, opts = {}) {
  const scene = sc.scene || sc;
  const radius = opts.radius ?? SKY_RADIUS;
  const uniforms = opts.uniforms || createSkyUniforms();
  let cloudCover = opts.cloud ?? 0.45;

  const geo = new THREE.SphereGeometry(radius, 48, 24);
  const material = new THREE.ShaderMaterial({
    vertexShader: SKY_VERT,
    fragmentShader: SKY_GLSL + SKY_FRAG,
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.name = 'sky-dome';
  mesh.frustumCulled = false;
  // first thing drawn, nothing in front of it, nothing writes depth
  mesh.renderOrder = -1000;

  // The name matters: world_runtime.js hides scene children called 'sky' when
  // you go underground, and it matches by name, not by identity.
  const group = new THREE.Group();
  group.name = opts.name ?? 'sky';
  group.add(mesh);
  scene.add(group);

  const colours = {
    zenith: new THREE.Color(), horizon: new THREE.Color(),
    sun: new THREE.Color(), fog: new THREE.Color(), moon: new THREE.Color(0xb9c6e6),
  };
  const sunDir = new THREE.Vector3(0, 1, 0);
  const moonDir = new THREE.Vector3(0, -1, 0);
  const lightDir = new THREE.Vector3(0, 1, 0);
  // The shadow light cannot follow the sun all the way down: a directional
  // light lying on the horizon throws shadows longer than scene.js's 55 m
  // shadow box, and they clip. This is the same direction with the elevation
  // floored, which is what sun.position should be placed along.
  const shadowDir = new THREE.Vector3(0, 1, 0);

  let time = opts.time ?? 0;
  let phase = 0.5;
  let lastDay = null;
  let rising = true;
  let palette = skyColours(1, { cloud: cloudCover });

  function setPhase(p) { phase = ((p % 1) + 1) % 1; }

  /**
   * dayFactor is scene.js's clamped cosine; camPos is the camera, not the
   * player, so the dome never gets closer on one side; dt is seconds; nowMs is
   * the same clock scene.js hands dayFactor, and giving it is the accurate
   * path. Without it the phase is inverted off the curve where the curve is
   * moving and integrated with dt across the flat noon and midnight, which
   * drifts if frames are dropped.
   */
  function update(dayFactor, camPos, dt = 0, nowMs = null) {
    const d = clamp01(dayFactor);
    time += Math.max(0, dt);

    if (nowMs != null && Number.isFinite(nowMs)) {
      // the scene's clock offset (the dev bench's time of day) moves the sun too
      const shifted = nowMs + (Number.isFinite(sc?.clockOffset) ? sc.clockOffset : 0);
      setPhase(phaseFromClock(shifted, opts.cycleS ?? DAY_CYCLE_S));
      // Event darkness moves the visible light source below the horizon too.
      if(sc?.dayScale < 1) setPhase(d===0?0:phaseFromDay(d,phase<.5));
    } else {
      if (lastDay != null && Math.abs(d - lastDay) > 1e-7) rising = d > lastDay;
      if (d > 1e-6 && d < 1 - 1e-6) setPhase(phaseFromDay(d, rising));
      else setPhase(phase + Math.max(0, dt) / (opts.cycleS ?? DAY_CYCLE_S));
    }
    lastDay = d;

    const s = sunDirectionAt(phase, opts.maxElevation ?? MAX_ELEVATION, opts.noonAzimuth ?? NOON_AZIMUTH);
    sunDir.set(s.x, s.y, s.z);
    moonDir.set(-s.x, -s.y, -s.z);
    lightDir.copy(sunDir.y > 0 ? sunDir : moonDir);
    shadowDir.copy(lightDir);
    if (shadowDir.y < SHADOW_MIN_Y) {
      // raise it and shorten the horizontal part to match, so the result is
      // still a unit vector and its elevation really is the floor
      const h = Math.hypot(shadowDir.x, shadowDir.z) || 1;
      const want = Math.sqrt(1 - SHADOW_MIN_Y * SHADOW_MIN_Y) / h;
      shadowDir.set(shadowDir.x * want, SHADOW_MIN_Y, shadowDir.z * want);
    }

    // The realms under the player. scene.js keeps this up to date as it
    // follows, so the dome and the fog and the lights all read one blend and
    // never disagree by a frame's worth of walking.
    palette = skyColours(d, { cloud: cloudCover, mix: opts.mix || sc?.realmMix, weather: sc?.weather });
    setSRGB(colours.zenith, palette.zenith);
    setSRGB(colours.horizon, palette.horizon);
    setSRGB(colours.sun, palette.sun);
    setSRGB(colours.fog, palette.fog);

    uniforms.uZenith.value.copy(colours.zenith);
    uniforms.uHorizon.value.copy(colours.horizon);
    uniforms.uSunColor.value.copy(colours.sun);
    uniforms.uMoonColor.value.copy(colours.moon);
    uniforms.uSunDir.value.copy(sunDir);
    uniforms.uMoonDir.value.copy(moonDir);
    uniforms.uGlare.value = palette.glare;
    uniforms.uCloud.value = palette.cloud;
    if(uniforms.uCloudWind)uniforms.uCloudWind.value.set(.004+(sc?.weather?.windX??.4)*.008,.002+(sc?.weather?.windZ??.2)*.008);
    uniforms.uTime.value = time;
    uniforms.uDay.value = d;
    uniforms.uStars.value = palette.star;
    uniforms.uMoonUp.value = palette.moon * clamp01(moonDir.y * 4 + 0.25);
    uniforms.uSunUp.value = clamp01(sunDir.y * 6 + 0.28) * (palette.sunVeil ?? 1);

    if (camPos) {
      uniforms.uCamPos.value.set(camPos.x, camPos.y, camPos.z);
      // the group may be parented anywhere; put the dome on the camera in
      // whatever space the group is in
      group.updateWorldMatrix(true, false);
      group.worldToLocal(mesh.position.set(camPos.x, camPos.y, camPos.z));
    }
    return api;
  }

  const api = {
    group, mesh, material, uniforms, colours, sunDir, moonDir, lightDir, shadowDir,
    update,
    /** The palette as plain numbers, for the settings window and for tests. */
    get palette() { return palette; },
    /** Which realms' skies are being blended right now, for the dev bench. */
    get mix() { return opts.mix || sc?.realmMix || null; },
    get phase() { return phase; },
    get time() { return time; },
    setPhase,
    /** Cloud cover, 0 clear to 1 solid. The settings window turns this. */
    setCloud(v) {
      cloudCover = clamp01(v);
      update(lastDay ?? 1, null, 0, null);
      return cloudCover;
    },
    get cloud() { return cloudCover; },
    dispose() {
      group.remove(mesh);
      if (group.parent) group.parent.remove(group);
      geo.dispose();
      material.dispose();
    },
  };
  update(1, null, 0, null);
  return api;
}

auditSky();
