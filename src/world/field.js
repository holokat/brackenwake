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
//   caldera sea  an inland sea east of the origin, taken from the Sunken
//                Kingdom's own disc in zones.js. The ground falls to SEA.floor
//                and the land mask fades exactly as it does at the outer coast,
//                so the sea has a beach on its landward side; five reefs and
//                the Saltmarch's Thousand Isles stand back out of it. Outside
//                SEA.edge the block does not run at all
//   world edge   past the coast radius in zones.js the ground slides down to
//                OCEAN_FLOOR and the land mask and the rivers fade out with it,
//                so the continent ends in a beach and then in deep water. The
//                falloff is exactly 0 inside COAST_MIN and the code that
//                applies it does not run there at all, so nothing inland is
//                touched by so much as a rounding step
//   zones        zones.js may nudge the climate of a region or override its
//                biome outright, which is what makes the rim frost and the far
//                east a volcanic coast. No zone that carries a bias comes
//                within HEART_SAFE of the origin, so the ground a save already
//                stands on is bit for bit what it was
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

import { createNoise, rand2, clamp01, lerp, smoothstep } from './noise.js';
import { cellRoll, siteAllowed, cellOf, mineParts, MINE_MOUTH_CELL, MINE_MOUTH_ARC, MINE_MOUTH_D, SITE_CELL } from './sitegrid.js';
import {
  zoneBias, oceanBeyond, OCEAN_FLOOR, WORLD_HALF,
  SEA, seaWithin, reefTopAt, ARCHIPELAGO, archipelagoWithin,
  authoredSites, CELL_PAD_MAX, RELIEF_ZONES, heartFade, weightOf, ZONE,
} from './zones.js';
import { roadDistanceAt, roadHeightAt, roadStrength, roadSurface, fordFade, ROAD_HALF_WIDTH } from './roads.js';

// The farm pad top is y 0 and the ground under it is homeY (-0.3). The sea has
// to sit below both or the home disc counts as flooded and gets a water sheet.
export const SEA_LEVEL = -0.8;
/**
 * Where the continent function stops being sea. The old pair (-0.20, 0.06) left
 * 55% of the world as water: the Greenwold read as a green archipelago, the
 * Boneyard's hamlet stood on a beach and the Brass City walked in the surf.
 * A zone is a bowl of land with the Caldera Sea in the middle of the world and
 * the ocean past the rim; inland water is the rivers and the lakes the sheet
 * asks for, not the continent falling away every kilometre. Measured in
 * field.test.mjs: land per realm.
 */
export const LAND_LO = -0.62;
export const LAND_HI = -0.34;
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
/** Bearings tried when a mine's yard is turned to face away from its own cuts. */
const MINE_AIM_STEPS = 32;

// ---------------------------------------------------------------- relief ---
//
// Five realms are not the ground the noise made, and `zones.js` says which and
// how much (`REALM_RELIEF`). This is where that is turned into metres.
//
// EVERY WALL IN HERE IS BUILT OUT OF A DISTANCE, never out of a noise value,
// and that is the whole reason the world still meshes. A smoothstep over a
// noise field has a gradient you cannot bound: the same band of noise is a
// forty metre ramp in one place and a three metre cliff in another, because
// fbm's own gradient varies threefold across the world (measured: 0.0052 per
// metre on average at a 520 m wavelength, 0.0171 at the worst). A smoothstep
// over a DISTANCE has a gradient of exactly 1.5 * height / run, everywhere,
// because the gradient of a distance is 1. So a table, a terrace, a plateau and
// a crater rim are all discs and rings, and the number that decides how steep
// they are is `grade`, in metres of rise per metre of ground.
//
//   RELIEF_GRADE      the steepest face relief may cut, before the smoothstep
//   RELIEF_MAX_STEP   what that becomes at the middle of the face, which is
//                     1.5 x RELIEF_GRADE, and what `field.test.mjs` measures
//   RAMP_GRADE        the ONE way up every table, plateau and rim has, so
//                     relief adds places to stand and not places to look at.
//                     Every ramp in the world stands at exactly this: a table
//                     that cannot fit one inside RAMP_FIT of its own radius is
//                     SHORTENED, rather than having its ramp steepened to fit
//
// `field.test.mjs` drives both: the steepest step anywhere in the world stays
// under the 8 m per metre the mesher can show, and the way up every named climb
// is walkable at every metre of it.
export const RELIEF_GRADE = 2.0;
export const RELIEF_MAX_STEP = 1.5 * RELIEF_GRADE;
export const RAMP_GRADE = 0.34;
/** What a ramp becomes at the middle of its own smoothstep, as RELIEF_MAX_STEP. */
export const RAMP_MAX_STEP = 1.5 * RAMP_GRADE;
/** Radians of a table's rim that the ramp takes. */
export const RAMP_ARC = 1.15;
/** How much of a table's own radius its ramp may take, so the top does not sag. */
export const RAMP_FIT = 0.82;
/** Metres past its own pad that a site holds the relief around it level. */
export const RELIEF_HOLD = 34;
/** How much of its relief a table, a rim or a shelf gives up where the ground it
 * stands on is already ridge. Asked once per thing: see `reliefKeep`. */
export const RELIEF_ON_MOUNTAIN = 0.8;
/** Metres of lift that leave a river bed with no river in it. */
export const RIVER_LIFT = 3;

const TAU = Math.PI * 2;
/** The smaller of the two ways round from a to b, in radians. */
function angleGap(a, b) {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return Math.abs(d);
}
/** 1 inside `r - run`, 0 at `r`, smooth between: the wall of a table. */
const wallOf = (d, r, run) => 1 - smoothstep(r - run, r, d);

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

  // ---- relief: the shape five realms insist on --------------------------
  //
  // Built once per field. Each row here is one realm of `RELIEF_ZONES`, with
  // its lattice cache, the sites whose ground it must leave level, and, for the
  // crater, the two places the sheet measures it from.
  //
  // `holds` is the reason an authored site never wakes up halfway down a cliff.
  // Relief is worked out first, then held at the value it has at the site's own
  // centre for `flatR + RELIEF_HOLD` metres around it, so the pad the site lays
  // afterwards has level relief under it and the shoulder is a shoulder and not
  // a step. Without it a mesa wall crossing the Brass City's yard would have
  // put twenty metres of cliff through the middle of it.
  const reliefOn = opts.relief !== false;         // off only so a test can weigh it
  const ramps = opts.ramps !== false;             // off only so a test can prove the ramp is the way up
  const RELIEF = reliefOn ? RELIEF_ZONES.map((zn) => {
    const rl = zn.relief;
    const row = { zn, rl, kind: rl.kind, reach: zn.r + zn.edge, cache: new Map(), wet: rl.kind === 'karst' };
    if (rl.kind === 'crater') {
      const at = ZONE[rl.at], gate = ZONE[rl.rampAt];
      row.cx = at.x; row.cz = at.z;
      row.gate = Math.atan2(gate.z - at.z, gate.x - at.x);
      // ONE number for the whole ring, taken at the throne the ring is drawn
      // about. See reliefKeep: asking the mountain mask at every point made the
      // rim anything between 17 and 80 m round its own circumference, which is
      // a fence and not a rim, and gave eighty metres of ground the gradient of
      // a noise field.
      row.h = rl.h * reliefKeep(at.x, at.z);
      row.run = row.h / RELIEF_GRADE;
      row.ramp = row.h / RAMP_GRADE;
    }
    if (rl.kind === 'glacier') row.h = rl.h * reliefKeep(zn.x, zn.z);
    if (rl.plateau) {
      const at = ZONE[rl.plateau.place];
      const h = rl.plateau.h * reliefKeep(at.x, at.z);
      row.plateau = {
        x: at.x, z: at.z, r: rl.plateau.r, h,
        run: h / RELIEF_GRADE, ramp: h / RAMP_GRADE,
        a: rl.plateau.bearing,
      };
    }
    return row;
  }) : [];
  const RELIEF_DRY = RELIEF.filter((r) => !r.wet);
  const RELIEF_WET = RELIEF.filter((r) => r.wet);

  /** The table standing in lattice cell (i, j) of this realm's relief, or null. */
  function tableOf(row, i, j) {
    const key = i * 65537 + j;
    let t = row.cache.get(key);
    if (t !== undefined) return t;
    const rl = row.rl;
    const cell = Array.isArray(rl.cell) ? rl.cell[0] : rl.cell;
    if (rand2(i, j, seed + 811) > rl.chance) t = null;
    else {
      const x = (i + 0.5 + (rand2(i, j, seed + 814) - 0.5) * 0.62) * cell;
      const z = (j + 0.5 + (rand2(i, j, seed + 815) - 0.5) * 0.62) * cell;
      // A terrace realm stacks its tables: half of them are one step up and
      // half are two, so the ground reads 0, 15 and 30 m without ever needing
      // two walls in the same place.
      const asked = rl.step
        ? rl.step * (rand2(i, j, seed + 817) < 0.5 ? 1 : 2)
        : rl.h[0] + rand2(i, j, seed + 812) * (rl.h[1] - rl.h[0]);
      // the mountain mask, asked ONCE, here, at this table's own centre
      let h = asked * reliefKeep(x, z);
      const r = rl.r[0] + rand2(i, j, seed + 813) * (rl.r[1] - rl.r[0]);
      // A TABLE IS ONLY AS TALL AS ITS OWN RAMP CAN CLIMB.
      //
      // The ramp's run is its height over RAMP_GRADE, and it has to fit inside
      // the table: `RAMP_FIT` of the radius, so the top does not sag. What used
      // to happen when it did not fit was that the RUN was cut and the ramp got
      // steeper, quietly, by as much as the roll asked: a 34.5 m table on a
      // 106 m radius came out at 0.397 a metre against the 0.34 it promised,
      // and nothing said so. It is the height that gives way now, so every ramp
      // in the world stands at exactly RAMP_GRADE and the way up a table is a
      // number in this file rather than a thing the roll happened to allow.
      // Measured in field.test.mjs over the tables of both lattice realms.
      const fit = r * RAMP_FIT * RAMP_GRADE;
      if (h > fit) h = fit;
      // `ramps: false` takes the ramp away and leaves the cliff: the table is
      // then walled the whole way round, which is what field.test.mjs drives
      // the walkability guard false with
      t = {
        x, z, h, r, run: h / RELIEF_GRADE,
        ramp: ramps ? h / RAMP_GRADE : h / RELIEF_GRADE,
        a: rand2(i, j, seed + 816) * TAU,
      };
    }
    row.cache.set(key, t);
    return t;
  }

  /**
   * Every table of one relief realm whose lattice cell falls in a box: where it
   * stands, how tall and how wide it is, the run of its wall, the run of its
   * ramp and the bearing that ramp is cut on.
   *
   * It exists so `field.test.mjs` can ask the world what its tables are instead
   * of hunting for them with probes, and so the walk that proves every table
   * has a way up can be driven false by a field built with `ramps: false`.
   */
  function tablesIn(zoneId, x0, z0, x1, z1) {
    const row = RELIEF.find((r) => r.zn.id === zoneId);
    // only the two lattice reliefs have tables: the crater is a ring, the shelf
    // is a slope, and the karst has its own stacks that never go through tableOf
    if (!row || row.wet || row.kind === 'crater' || row.kind === 'glacier') return [];
    const cell = Array.isArray(row.rl.cell) ? row.rl.cell[0] : row.rl.cell;
    const out = [];
    for (let j = Math.floor(z0 / cell); j <= Math.floor(z1 / cell); j++) {
      for (let i = Math.floor(x0 / cell); i <= Math.floor(x1 / cell); i++) {
        const t = tableOf(row, i, j);
        if (t) out.push(t);
      }
    }
    return out;
  }

  /**
   * How high the tables of one realm stand at (x, z). The tallest wins rather
   * than the sum, so two tables that touch become one wider table instead of a
   * sixty metre stack, and the gradient of a maximum is the gradient of
   * whichever one won.
   */
  function tablesAt(row, x, z) {
    const cell = Array.isArray(row.rl.cell) ? row.rl.cell[0] : row.rl.cell;
    const ci = Math.floor(x / cell), cj = Math.floor(z / cell);
    let best = 0;
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const t = tableOf(row, ci + di, cj + dj);
        if (!t) continue;
        const dx = x - t.x, dz = z - t.z;
        const d2 = dx * dx + dz * dz;
        if (d2 >= t.r * t.r) continue;
        const d = Math.sqrt(d2);
        // one side of every table is a long ramp, so a table is somewhere to
        // walk up and not a wall with a view
        const w = 1 - smoothstep(RAMP_ARC * 0.5, RAMP_ARC, angleGap(Math.atan2(dz, dx), t.a));
        const v = t.h * lerp(wallOf(d, t.r, t.run), wallOf(d, t.r, t.ramp), w);
        if (v > best) best = v;
      }
    }
    return best;
  }

  /** The Ashen Throne's rim: a ring about the throne, with one way up it. */
  function craterAt(row, x, z) {
    const rl = row.rl;
    const dx = x - row.cx, dz = z - row.cz;
    const d = Math.hypot(dx, dz);
    const inner = rl.rim - rl.crest, outer = rl.rim + rl.crest;
    if (d <= inner - row.ramp || d >= outer + row.ramp) return 0;
    const w = 1 - smoothstep(rl.rampArc * 0.5, rl.rampArc, angleGap(Math.atan2(dz, dx), row.gate));
    // the inner face is the crater wall and is never graded; the outer face is
    // the way in, and on the gate's bearing it is stretched into a road
    const up = smoothstep(inner - row.run, inner, d);
    const down = (run) => 1 - smoothstep(outer, outer + run, d);
    const v = Math.min(up, lerp(down(row.run), down(row.ramp), w));
    return row.h * v;
  }

  /** Frostreach's shelf: no wall anywhere, just ground that rises outward. */
  function glacierAt(row, x, z) {
    const zn = row.zn;
    const home = Math.hypot(zn.x, zn.z) || 1;
    // outward means away from the world's centre, so the shelf climbs as you
    // walk out of the kingdom and not as you walk back into it
    const t = clamp01(0.5 + ((x - zn.x) * (zn.x / home) + (z - zn.z) * (zn.z / home)) / (2 * zn.r));
    return row.h * smoothstep(0, 1, t);
  }

  /**
   * The Sunken Kingdom's stacks, which are the one relief that belongs in the
   * water. They live only in the band where the Caldera Sea is letting go of
   * the shore, so the open water over the drowned city is never touched.
   * Returned as a target height and a weight, the way a reef is.
   */
  function karstAt(row, x, z, lake) {
    const band = smoothstep(0, 0.30, lake) * (1 - smoothstep(0.78, 1.0, lake));
    if (band <= 0) return 0;
    const rl = row.rl, cell = rl.cell;
    const ci = Math.floor(x / cell), cj = Math.floor(z / cell);
    let best = 0, top = 0;
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        const i = ci + di, j = cj + dj;
        if (rand2(i, j, seed + 831) > rl.chance) continue;
        const h = rl.h[0] + rand2(i, j, seed + 832) * (rl.h[1] - rl.h[0]);
        const r = rl.r[0] + rand2(i, j, seed + 833) * (rl.r[1] - rl.r[0]);
        const tx = (i + 0.5 + (rand2(i, j, seed + 834) - 0.5) * 0.6) * cell;
        const tz = (j + 0.5 + (rand2(i, j, seed + 835) - 0.5) * 0.6) * cell;
        const d = Math.hypot(x - tx, z - tz);
        if (d >= r) continue;
        // the run counts the whole rise, sea floor to crown, so a stack's face
        // is the same steepness as every other face in the world
        const run = Math.min(r * 0.9, (h - SEA.floor) / RELIEF_GRADE);
        const w = wallOf(d, r, run) * band;
        if (w > best) { best = w; top = h; }
      }
    }
    return best > 0 ? { w: best, top } : 0;
  }

  /**
   * How much of its relief a THING keeps where it stands.
   *
   * A fifteen metre terrace laid on the side of a ridge is a wall on a wall,
   * and the Stormpeaks are the one realm that is both a terrace country and a
   * mountain one. So relief gives way where the mountain mask says the ground
   * is already ridge. The mask is the mountain noise WITHOUT its land factor,
   * because `land` swings by 0.17 in a metre at an islet's edge and sixty
   * metres of relief through that would be a cliff of its own.
   *
   * IT IS ASKED ONCE PER THING AND NEVER PER POINT, and that is the whole of
   * why it is safe. Until 2026-09-06 `shapeOf` multiplied the finished relief
   * by this mask at every sample, which is the one thing the header of this
   * section forbids: a smoothstep over a noise field has a gradient nobody can
   * bound. Measured over the Stormpeaks, the mask itself moves by up to 0.0154
   * in a metre, so a sixty metre plateau carried 0.92 m of noise-shaped slope
   * in every metre of it, laid straight on top of whatever the ground was
   * already doing. It is what made the steepest metre in the world with relief
   * (7.60 m at 741, -3854, on the flat top of a terrace) steeper than the same
   * metre without it (7.51 m), and it made the Ashen Throne's rim anything
   * between 17 and 80 m round its own circumference.
   *
   * So a table asks it at the table's centre, the crater at the throne, the
   * plateau at the Eyrie and the shelf at Frostreach's own middle, once each,
   * for ever. What comes out is folded into the thing's HEIGHT, which means its
   * run and its ramp shrink with it and every face in the world still stands at
   * exactly RELIEF_GRADE.
   */
  function reliefKeep(x, z) {
    const mtnN = smoothstep(0.22, 0.58, N.fbm(x / W_MTN_MASK + 55, z / W_MTN_MASK + 55, 3));
    return 1 - RELIEF_ON_MOUNTAIN * mtnN;
  }

  function shapeOf(row, x, z) {
    if (row.kind === 'crater') return craterAt(row, x, z);
    if (row.kind === 'glacier') return glacierAt(row, x, z);
    let v = tablesAt(row, x, z);
    if (row.plateau) {
      const p = row.plateau;
      const dx = x - p.x, dz = z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < p.r) {
        const w = 1 - smoothstep(RAMP_ARC * 0.5, RAMP_ARC, angleGap(Math.atan2(dz, dx), p.a));
        const pv = p.h * lerp(wallOf(d, p.r, p.run), wallOf(d, p.r, p.ramp), w);
        if (pv > v) v = pv;
      }
    }
    return v;
  }

  // Every authored site that stands where any relief realm reaches, with the
  // relief its own centre stands on, so the ground under it can be held level.
  //
  // NOT just the sites of that realm: realms overlap, and the Legion Pass
  // stands in the Stormpeaks and inside Frostreach's shelf as well, so a hold
  // that only knew its own realm left a metre of shelf tilted across the camp.
  // What is held is the WHOLE relief at the point, realm weights and all, and
  // it is held at the number the site's own centre gets, so the pad has one
  // flat surface under it and not a sum of five sloping ones.
  //
  // Filled lazily on the first sample, because `authoredSites()` and the shape
  // functions are both ready by then and building it here would run before the
  // field is assembled.
  let holdsReady = false;
  const HOLDS = [];
  function buildHolds() {
    holdsReady = true;
    for (const st of authoredSites()) {
      let touched = false;
      for (const row of RELIEF) {
        const dx = st.x - row.zn.x, dz = st.z - row.zn.z;
        if (dx * dx + dz * dz < row.reach * row.reach) { touched = true; break; }
      }
      if (!touched) continue;
      HOLDS.push({
        x: st.x, z: st.z,
        // level all the way across the pad, then fading over RELIEF_HOLD metres
        // outside it, so the pad's own shoulder has flat relief to blend into
        r0: st.flatR + 4, r: st.flatR + 4 + RELIEF_HOLD,
        // FILLED ON FIRST NEED, not here. `reliefRaw` at a site's centre builds
        // every table of every lattice within a kilometre of it, and there are
        // forty four such sites: doing all of them on the first sample the field
        // ever takes cost 242 ms of stall on one chunk, most of it for tables
        // nobody was standing anywhere near. A hold's PLACE is known without
        // asking the ground anything; only its level needs a table built, and
        // only a sample that falls inside the hold's own disc needs that.
        y: null,
      });
    }
  }
  /** The level one site holds its relief at, worked out the first time it is asked. */
  function holdY(hd) {
    if (hd.y === null) hd.y = reliefRaw(hd.x, hd.z);
    return hd.y;
  }

  /** The relief at a point before any site holds it level. */
  function reliefRaw(x, z) {
    const heart = heartFade(x, z);
    if (heart <= 0) return 0;
    let out = 0;
    for (let i = 0; i < RELIEF_DRY.length; i++) {
      const row = RELIEF_DRY[i];
      const dx = x - row.zn.x, dz = z - row.zn.z;
      if (dx * dx + dz * dz >= row.reach * row.reach) continue;
      const w = weightOf(row.zn, x, z);
      if (w <= 0) continue;
      out += shapeOf(row, x, z) * w * heart;
    }
    return out;
  }

  /**
   * Metres of relief at (x, z), 0 everywhere no realm asks for any.
   *
   * Three things shape it, and only three: the realm's own weight, so relief
   * ends where the realm ends; `heartFade`, which is exactly zero inside
   * HEART_SAFE and is why the digest in field.test.mjs did not move; and the
   * level ground every authored site holds across its own pad, so nothing the
   * world builds ever wakes up halfway down a cliff.
   */
  function reliefAt(x, z) {
    if (!RELIEF_DRY.length) return 0;
    if (!holdsReady) buildHolds();
    let inReach = false;
    for (let i = 0; i < RELIEF_DRY.length && !inReach; i++) {
      const row = RELIEF_DRY[i];
      const dx = x - row.zn.x, dz = z - row.zn.z;
      if (dx * dx + dz * dz < row.reach * row.reach) inReach = true;
    }
    if (!inReach) return 0;              // no relief here, so nothing to hold
    let v = reliefRaw(x, z);
    for (let k = 0; k < HOLDS.length; k++) {
      const hd = HOLDS[k];
      const hx = x - hd.x, hz = z - hd.z;
      const d2 = hx * hx + hz * hz;
      if (d2 >= hd.r * hd.r) continue;
      v = lerp(v, holdY(hd), 1 - smoothstep(hd.r0, hd.r, Math.sqrt(d2)));
    }
    return v;
  }

  /**
   * How much of a WET relief a point may keep: 0 across an authored site's own
   * pad, rising to 1 over RELIEF_HOLD past its rim.
   *
   * The dry reliefs are held level across a pad by `reliefAt` above. The karst
   * is not, because it is laid inside the sea block, after the sea, where the
   * dry ones have already been and gone. That was fine while no authored site
   * stood on the shore. When R1 moved Cinderport onto the Caldera Sea on
   * 2026-09-06 a sea stack came up 4.3 m through the middle of the town's
   * precinct, which the pad then flattened, leaving a step at the pad's rim
   * instead of a shoulder. A stack is a thing that stands in open water; it
   * does not stand in a harbour.
   */
  function holdFade(x, z) {
    if (!holdsReady) buildHolds();
    let k = 1;
    for (let i = 0; i < HOLDS.length && k > 0; i++) {
      const hd = HOLDS[i];
      const hx = x - hd.x, hz = z - hd.z;
      const d2 = hx * hx + hz * hz;
      if (d2 >= hd.r * hd.r) continue;
      const w = smoothstep(hd.r0, hd.r, Math.sqrt(d2));
      if (w < k) k = w;
    }
    return k;
  }

  // Raw terrain before the home flattening, so the flattening can be tested
  // independently and so tools can look at the world "as if the farm were not
  // there".
  function raw(x, z) {
    // continents, domain warped so coasts wander
    const [wx, wz] = N.warp(x / W_CONT, z / W_CONT, 0.35, 1.7);
    const cont = N.fbm(wx, wz, 4);                       // -1..1
    const landMask = smoothstep(LAND_LO, LAND_HI, cont);   // 0 ocean .. 1 land; see LAND_LO

    // islands where the continent function says ocean
    const isle = N.fbm(x / W_ISLE + 900, z / W_ISLE - 300, 3);
    const isleMask = smoothstep(0.52, 0.70, isle) * (1 - landMask);
    let land = Math.max(landMask, isleMask);

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

    // relief: the tables, terraces, plateau and crater rim that five realms of
    // Kaldera carry, laid on top of the ground the noise made.
    //
    // AFTER the rivers, and that is not a detail. The river block carves toward
    // a fixed bed at -1.8 and fades itself out between 12 and 24 m of height,
    // so relief applied before it fed a fast changing height into a lever with
    // a fifteen metre arm: measured at 2632, -4041, ten metres of relief turned
    // a 0.31 m step in the world without it into a 12.43 m one, which is over
    // the 8 m the mesher can show. Laid on afterwards, a river rides up with
    // the ground it is cut into, and a table with a river across it is a table
    // with a canyon in it, which is what a table with a river across it is.
    //
    // Before the climate, though, so that a crater rim eighty metres up is as
    // cold as any other ground eighty metres up.
    const lift = reliefAt(x, z);
    if (lift !== 0) {
      h += lift;
      // A river carried up onto a table is not a river any more. The channel
      // stays, because it was cut into the ground the table is made of and a
      // canyon across a mesa is a good thing to find; what goes is the CLAIM
      // that there is water in it. Nothing downstream would have been right
      // otherwise: the sheet in water.js floods every bed carved below sea
      // level and this one is forty metres above it, the ground would have been
      // painted as a river bed, and roads.js would have forded thin air.
      if (lift > RIVER_LIFT * 0.05 && river > 0) river *= 1 - clamp01(lift / RIVER_LIFT);
    }

    // climate: temperature falls with height, moisture rises toward the sea
    const temp = clamp01(0.5 + 0.5 * N.fbm(x / W_TEMP - 1000, z / W_TEMP + 1000, 3) - Math.max(0, h) * 0.0045);
    const moist = clamp01(0.5 + 0.5 * N.fbm(x / W_MOIST + 2000, z / W_MOIST + 2000, 3) + (1 - land) * 0.25 + river * 0.2);

    // The Caldera Sea: the inland shore, east of the origin. It works exactly
    // the way the world's rim does, and for the same reason, so the fen ends in
    // a beach and then in water rather than in a cut. Outside SEA.edge
    // `seaWithin` returns 0 without any arithmetic and this block does not run,
    // so the heart, which is 2.5 km away from that edge, cannot be touched.
    const lake = seaWithin(x, z);
    if (lake > 0) {
      h = lerp(h, SEA.floor, lake);
      land *= 1 - lake;
      river *= 1 - lake;
      // and two kinds of ground stand back up out of it.
      //
      // The Thousand Isles: a noise driven island field in the lens where the
      // Saltmarch's disc and the sea overlap. An islet's top is kept under the
      // 2.2 m the biome chain calls a beach, so an islet is sand and palm.
      const arch = archipelagoWithin(x, z);
      if (arch > 0) {
        // shoals first: the water among the isles is four metres deep and not
        // eighteen, which is what makes an islet a small rise and not a spike
        // out of a trench, and what keeps the ground continuous between them
        h = lerp(h, ARCHIPELAGO.shoal, arch);
        const n = N.fbm(x / ARCHIPELAGO.wave + 3100, z / ARCHIPELAGO.wave - 2400, 3);
        const isle = smoothstep(ARCHIPELAGO.lo, ARCHIPELAGO.hi, n) * arch;
        if (isle > 0) {
          h = lerp(h, ARCHIPELAGO.top, isle);
          land = Math.max(land, isle * 0.92);
        }
      }
      // The reefs: the five points where the drowned city breaks the surface.
      const reef = reefTopAt(x, z);
      if (reef.w > 0) {
        h = lerp(h, reef.top, reef.w);
        land = Math.max(land, reef.w * 0.92);
      }
      // and the Sunken Kingdom's stacks, which stand in the water on purpose
      // and only where the sea is already letting go of the shore, so the open
      // water over the drowned city is never touched. This is the one relief
      // applied here, after the sea, rather than with the dry ones above.
      for (let i = 0; i < RELIEF_WET.length; i++) {
        const row = RELIEF_WET[i];
        const dxr = x - row.zn.x, dzr = z - row.zn.z;
        if (dxr * dxr + dzr * dzr >= row.reach * row.reach) continue;
        const rw = weightOf(row.zn, x, z) * heartFade(x, z) * holdFade(x, z);
        if (rw <= 0) continue;
        const stack = karstAt(row, x, z, lake);
        if (!stack) continue;
        // a stack rises out of the water; it never pulls ground down onto its
        // own crown, which is what a plain lerp did where the Ember Wastes'
        // tables reach into the same lens (measured: 16.3 m of table removed)
        const up = (stack.top - h) * stack.w * rw;
        if (up > 0) h += up;
        land = Math.max(land, stack.w * rw * 0.9);
      }
    }

    // The world's edge. Inside COAST_MIN `oceanBeyond` returns 0 without any
    // arithmetic and this block does not run, so every point inland is the
    // number it was before this file knew the world had a rim.
    const sea = oceanBeyond(x, z);
    if (sea > 0) {
      h = lerp(h, OCEAN_FLOOR, sea);
      land *= 1 - sea;      // so the last dry ground reads as beach, not meadow
      river *= 1 - sea;     // a river does not run out into the ring ocean
    }

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
        // a cave and a mine both open downhill, out of the slope, never into
        // the mountain: the mouth faces whichever of eight directions has the
        // lowest ground 15 m out
        if (site.kind === 'cave' || site.kind === 'mine') {
          let best = -Infinity, bestA = site.facing;
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            const drop = r.h - raw(site.x + Math.sin(a) * 15, site.z + Math.cos(a) * 15).h;
            if (drop > best) { best = drop; bestA = a; }
          }
          site.facing = bestA;
        }
        // What a vein or a seam here can be. An authored site brought its own
        // band; anything else takes the band of the zone it stands in, which
        // outside a mine zone is the three low ores and nothing else. This is
        // the value `dungeon_gen.js` reads as `site.oreBand`.
        if (site.kind === 'cave' || site.kind === 'mine') {
          if (!site.oreBand) site.oreBand = zoneBias(site.x, site.z).ore;
        }
        // A mine is a yard with several cuts on the hill above it, and the
        // seams that made anyone dig here still showing between them. sitegrid
        // gives the angles; only this file knows where the ground is.
        if (site.kind === 'mine') buildMine(site);
      }
    }
    siteCache.set(key, site);
    return site;
  }
  /**
   * Resolve a mine's mouths and seams onto the real hillside.
   *
   *   site.mouths  every cut, each one a complete cave shaped site the runtime
   *                can hand straight to enterDungeon: its own id, its own
   *                generator cell so two cuts are not one level twice, its own
   *                name, and the mine's ore band
   *   site.seams   surface ore on the yard, each with a tier from that band
   *
   * The mouths stand up the hill (site.facing is downhill) and each one opens
   * back down toward the yard, which is where the barrows went.
   */
  function buildMine(site) {
    // Aim the yard before the cuts are cut.
    //
    // A mine's promise is that every cut stands up the hill from the yard, and
    // the eight direction probe that picked `facing` above asks about ONE point
    // fifteen metres out. The cuts stand twenty one metres out across an arc up
    // to 1.4 radians wide, so a bearing that is downhill in the middle can be
    // uphill at its edges. When the coast moved, three of the nine mines had a
    // cut standing BELOW their own yard for exactly that reason: the Salt Cut by
    // 1.15 m, the Rime Cut by 0.90 m, the Marrow Mine by 0.36 m.
    //
    // So the bearing is chosen on the cuts themselves. Thirty two bearings, and
    // the one whose LOWEST cut stands highest wins, ties to the first, which
    // keeps it a pure function of the seed. `zones.test.mjs` measures the rise
    // of every cut of every mine in the world, both directions.
    const aim = mineParts(site, seed).mouths.length;
    let bestA = site.facing, bestLow = -Infinity;
    for (let i = 0; i < MINE_AIM_STEPS; i++) {
      const a = (i / MINE_AIM_STEPS) * Math.PI * 2;
      let low = Infinity;
      for (let k = 0; k < aim; k++) {
        const b = a + Math.PI + (k - (aim - 1) / 2) * MINE_MOUTH_ARC;
        const h = raw(site.x + Math.sin(b) * MINE_MOUTH_D, site.z + Math.cos(b) * MINE_MOUTH_D).h;
        if (h < low) low = h;
      }
      if (low > bestLow) { bestLow = low; bestA = a; }
    }
    site.facing = bestA;
    const parts = mineParts(site, seed);
    // the same shoulder sampleAt grades a pad with, so a reported y is the
    // ground a player will actually stand on and not the hillside under it
    const padded = (x, z, d) => {
      const w = 1 - smoothstep(site.flatR * 0.55, site.flatR + 4, d);
      // the dish too, for the same reason: this is a copy of the pad and a copy
      // that knows one less thing than the original is how a mouth ends up
      // reported at a height nobody stands at. No mine asks for one today.
      return lerp(raw(x, z).h, site.y, w) - (site.dish > 0 ? site.dish * w : 0);
    };
    site.mouths = parts.mouths.map((m) => {
      const x = site.x + Math.sin(m.a) * m.d;
      const z = site.z + Math.cos(m.a) * m.d;
      return {
        id: `${site.id}#m${m.i}`, mine: site.id, zone: site.zone || null,
        kind: 'cave', authored: true,
        cx: site.cx + MINE_MOUTH_CELL * (m.i + 1), cz: site.cz,
        x, z, y: padded(x, z, m.d), flatR: 6,
        facing: m.a + Math.PI,
        name: m.name, article: 'a mine mouth',
        oreBand: site.oreBand,
      };
    });
    site.seams = parts.seams.map((s) => {
      const x = site.x + Math.sin(s.a) * s.d;
      const z = site.z + Math.cos(s.a) * s.d;
      return { i: s.i, x, z, y: padded(x, z, s.d), ore: s.ore, mine: site.id };
    });
  }

  function siteAt(x, z) {
    const [cx, cz] = cellOf(x, z);
    return siteInCell(cx, cz);
  }

  // ---- pads that reach out of their own cell -------------------------------
  //
  // sitegrid keeps every site inside the middle 60% of its 480 m cell, so any
  // pad of CELL_PAD_MAX (96 m) or less is wholly inside that cell and a point
  // only ever has to ask its own cell what it stands on. That was true of
  // every kind in the game until the seven towns took a 120 m precinct.
  //
  // A precinct crosses cell borders, and a pad that a neighbouring cell cannot
  // see is a pad cut off square at the border: a cliff on three sides of every
  // town. So the handful of sites wide enough to do that are listed once, from
  // the authored table, and every sample checks that short list by distance.
  // There are seven of them, the check is seven squared distances, and for a
  // world with none of them this costs one loop that does not run.
  const WIDE = authoredSites().filter((s) => s.flatR > CELL_PAD_MAX);
  function wideSiteAt(x, z) {
    for (let i = 0; i < WIDE.length; i++) {
      const b = WIDE[i];
      const dx = x - b.x, dz = z - b.z, reach = b.flatR + 4;
      if (dx * dx + dz * dz < reach * reach) {
        return siteInCell(Math.floor(b.x / SITE_CELL), Math.floor(b.z / SITE_CELL));
      }
    }
    return null;
  }

  /**
   * The ground before any road touches it: the raw world, the home disc, and
   * whatever pad stands here.
   *
   * THIS IS THE ONE PLACE THE PAD IS APPLIED. `roads.js` grades toward a
   * profile and then judges whether what it left is walkable, and it used to
   * work that judgement out on its own copy of this arithmetic, which knew
   * about the road's own two settlements and nothing else and did not know
   * that a pad takes the road's authority away as it takes its ground. So the
   * judgement said 0.49 where the field laid 0.64. One function now, called by
   * both, and the road a test measures is the road the field lays.
   *
   * Fills `out` rather than allocating, because a terrain vertex may not
   * allocate. The caller passes its OWN scratch: `sampleAt` calls this and then
   * asks `roads.js` for a road, and `roads.js` may call this again while laying
   * one out, so a single shared scratch would be clobbered mid sample.
   *
   *   h      metres, the surface with the pad on it and no road
   *   river  river strength after the home disc and the pad have had their say
   *   pad    0 to 1, how much of this point the pad owns
   *   site   the site whose pad that is, or the site standing here, or null
   *   k      the home factor
   *   r      the raw sample, so a caller that has one need not take two
   */
  function groundNoRoads(x, z, out) {
    const r = raw(x, z);
    const k = homeFactor(x, z);
    let h = lerp(homeY, r.h, k);
    let river = k <= 0 ? 0 : r.river * k;
    // What stands here: the site in this point's own cell, unless the point is
    // out of that site's pad and inside the pad of a town precinct next door.
    let site = siteAt(x, z);
    if (!site || (x - site.x) ** 2 + (z - site.z) ** 2 >= (site.flatR + 4) ** 2) {
      const wide = wideSiteAt(x, z);
      if (wide) site = wide;
    }
    let pad = 0;
    // A PAD OF ZERO IS NO PAD, and not a four metre one. The shoulder below
    // reaches `flatR + 4`, so a site with `flatR` 0 used to level a four metre
    // disc under itself: measured, 0.057 m of the hillside under the Standing
    // Hedge, which stands in the heart where nothing may move. A place that
    // asks for no ground gets none.
    if (site && site.flatR > 0) {
      const d = Math.hypot(x - site.x, z - site.z);
      if (d < site.flatR + 4) {
        // 1 at the centre, 0 at the rim, soft shoulder
        const w = 1 - smoothstep(site.flatR * 0.55, site.flatR + 4, d);
        const target = site.kind === 'cave'
          ? site.y - CAVE_MOUND * smoothstep(3, site.flatR, d)   // a mound that peaks at the mouth
          : site.y;
        h = lerp(h, target, w);
        // A DISH: the pad's floor under its own rim, for a place that is a
        // hollow and not a table. `zones.SITE_DISH` says how deep, in metres,
        // and it is taken off by the pad's OWN weight, so the floor is the full
        // depth down across the flat middle (where `w` is exactly 1) and comes
        // back up to the rim over the same shoulder the pad already blends on.
        // That is deliberate: the shoulder's grade is the one this file has
        // always laid at a pad edge, so the side of a dish is exactly as
        // walkable as the side of every pad in the world, and a player walks
        // down into the Sunken Chapel's flooded meadow and back out of it.
        // `site.dish` is 0 on every site but that one and this line is then
        // arithmetic that does not run.
        if (site.dish > 0) h -= site.dish * w;
        river *= 1 - w;
        pad = w;
      }
    }
    out.h = h; out.river = river; out.pad = pad; out.site = site; out.k = k; out.r = r;
    return out;
  }
  // sampleAt's own scratch, never handed out and never shared with roads.js
  const GB = { h: 0, river: 0, pad: 0, site: null, k: 0, r: null };

  function sampleAt(x, z) {
    groundNoRoads(x, z, GB);
    const r = GB.r, k = GB.k, site = GB.site, pad = GB.pad;
    let h = GB.h, river = GB.river;
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

    // The zone this point belongs to, filled into one scratch object so a
    // terrain vertex costs no allocation. `zb.climate` nudges the climate the
    // biome is decided from; `zb.biome`, when a zone has one, replaces the
    // answer outright.
    // `biasWeight` and not `weight`: the bias belongs to the REALM, and the
    // weight it is scaled by has to be the realm's own. Using the deepest
    // zone's weight would let a subzone standing in the middle of a desert
    // fade the desert out, which is a hole in the country, not a place.
    const zb = zoneBias(x, z, ZB);
    let temp = r.temp, moist = r.moist;
    if (zb.climate && zb.biasWeight > 0) {
      if (zb.climate.temp) temp = clamp01(temp + zb.climate.temp * zb.biasWeight);
      if (zb.climate.moist) moist = clamp01(moist + zb.climate.moist * zb.biasWeight);
    }

    // A zone's override is allowed to say what kind of country this is. It is
    // NOT allowed to say the sea is a mountain, to pave over a river, or to
    // flatten real relief: open water, a river, the snow line and the rock line
    // all answer first, and the override takes what is left, which is every
    // ordinary hillside and shore in the zone.
    let biome;
    if (k < 0.5) biome = homeBiome;
    else if (water && river < 0.4) biome = 'ocean';
    else if (h >= SNOW_LINE) biome = 'snow';
    else if (h >= ROCK_LINE) biome = 'mountain';
    else if (zb.biome && river < 0.3) biome = zb.biome;
    else if (h < 2.2 && r.land < 0.97 && river < 0.3) biome = 'beach';
    else if (temp < 0.30) biome = 'boreal';
    else if (temp > 0.58 && moist < 0.47) biome = 'desert';
    else if (moist > 0.62 && temp > 0.42 && temp < 0.66 && N.fbm(x / W_SAKURA + 5000, z / W_SAKURA - 5000, 2) > 0.38) biome = 'sakura';
    else biome = 'meadow';
    // `zone` is the deepest zone's id or null, `realm` the id of the realm of
    // Kaldera it belongs to, and `danger` the monster tier band [lo, hi]: the
    // one number monsters.js should roll a spawn against (docs/mmo/wiring/Z1.md).
    return {
      h, biome, water, river, land, temp, moist, site, road,
      zone: zb.id, realm: zb.parent ? zb.parent.id : zb.id, danger: zb.danger,
    };
  }
  // one scratch per field, never handed out, only ever read inside sampleAt
  const ZB = {};

  const heightAt = (x, z) => sampleAt(x, z).h;
  const biomeAt = (x, z) => sampleAt(x, z).biome;

  /** Chunk coordinates of a world point. */
  const chunkOf = (x, z) => [Math.floor(x / CHUNK), Math.floor(z / CHUNK)];

  return Object.assign(self, {
    seed, heightAt, biomeAt, sampleAt, raw, homeFactor, chunkOf, siteInCell, siteAt,
    groundNoRoads, tablesIn,
    seaLevel: SEA_LEVEL, chunk: CHUNK, homeRadius, homeY, biomes: BIOMES,
    roadHalfWidth: ROAD_HALF_WIDTH,
    // the world's own half width, so a caller with a field does not need to
    // reach into zones.js to know where the map and the ocean end
    worldHalf: WORLD_HALF, oceanFloor: OCEAN_FLOOR,
  });
}
