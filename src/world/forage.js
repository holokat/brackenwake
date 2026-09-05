// What you can pick up off the forest floor.
//
// The table is the FORAGE table of `docs/reference/arbor-forest-optimized.html`,
// twenty two things that grow in a wood, ported as data: seasons, per-forest
// weights, where each one sits (near a trunk, on a trunk, in a clearing,
// anywhere), how many clusters a chunk gets and how big a cluster is, and a
// builder that assembles the thing out of spheres, cylinders, cones and quads
// into one merged vertex coloured geometry.
//
//   const forage = createForageField(sc, { field, treesFor, seed });
//   forage.update(player.x, player.z, seasonAt(Date.now()));   // each frame
//   const hit = forage.pick(raycaster);        // { rec, id } or null
//   forage.remove(hit.rec, now);               // harvested; comes back later
//
// A CLUSTER IS ONE THING. A bunch of dandelions is drawn as the seven separate
// plants the reference scatters, and it is ONE pickable: one record, one click,
// one stack, one Foraging lesson. `placeForage` returns
// `{ id, x, y, z, count, onTrunk, members: [{ x, y, z, yaw, scale }] }` and
// `count` is how many plants stand in the bunch. The instancing draws every
// member; the raycast back-index maps every member back to its cluster, so
// clicking any one dandelion picks the whole patch, and `remove` hides all
// seven in the same frame.
//
// Three things this file does NOT do, on purpose:
//
//   * It does not import flora.js, tree_gen.js or arbor.js. Trees arrive as
//     `[{ x, z, radius }]` from `opts.treesFor(cx, cz)`, so whoever owns the
//     forest can change its record shape without breaking foraging.
//   * It does not decide what a picked mushroom is worth. That is
//     `src/game/foraging.js`, which owns the skill roll, the pack and the words.
//   * It does not read the clock. `update()` is told the season, so a test can
//     stand in April and then in January without waiting three days.
//
// ---------------------------------------------------------------------------
// WHAT WAS CHANGED ON THE WAY OVER, AND WHY
// ---------------------------------------------------------------------------
//
// 1. BIOMES. The reference has five forest types and this game has eight
//    biomes. `BIOME_FROM` is the whole mapping and `mapBio` is the only thing
//    that applies it, so no entry can drift from the port:
//
//      Temperate broadleaf -> meadow
//      Boreal conifer      -> boreal, and snow at half
//      Birch grove         -> sakura
//      Mediterranean pine  -> mountain
//      Tropical wet        -> the wettest meadow band (moisture >= WET_MOIST)
//
//    Desert and beach are in no reference forest, so anything growing there is
//    an addition and is listed by hand in `extra`, with a reason each. They are
//    thin on purpose: a beach rose really does hold a dune, and a bee really
//    does nest in a dead desert snag, but nothing in this table is a cactus
//    fruit and pretending otherwise would put chanterelles in the sand.
//
// 2. WINTER. The reference has three seasons and this game has four. Not one
//    of the twenty two entries lists Winter, so the winter wood is bare: zero
//    clusters, in every biome. That is the reference's table told honestly
//    rather than a fourth season invented for it. `auditForage()` counts the
//    winter entries out loud so the day somebody adds one, the number moves.
//
// 3. CLEARINGS. The reference tests a clearing with the same fbm its own tree
//    layout uses. This module is not given that noise, and it IS given the
//    trees, so a clearing here is what a clearing is: a spot no tree's crown
//    reaches. `CLEARING_GAP` metres clear of every trunk radius.
//
// 4. BERRY COST. The reference builds every berry from an 8x6 sphere, which is
//    80 triangles each. Elderberry's ninety eight berries came to 7,840
//    triangles for one prototype. Small round things are built from a 6x4
//    sphere (36 triangles) here and elder carries four umbels of nine instead
//    of seven of fourteen. Every prototype is under 2,000 triangles, measured
//    in forage.test.mjs, which prints the real number for each.
//
// 5. DENSITY. Every `per` was thinned when the cluster became the pickable.
//    A dandelion patch used to be seven separate clicks, seven separate stacks
//    and seven separate Foraging lessons, which is why a player crossing a
//    meadow trained faster than one clearing a dungeon. The pickables in a 64 m
//    meadow chunk, measured in forage.test.mjs and printed there both ways:
//
//      Spring 267 -> 31,  Summer 282 -> 43,  Autumn 139 -> 32
//
//    Autumn lands on a quarter. Spring and Summer land lower, at an eighth and
//    a seventh, and that is arithmetic rather than a choice: a Spring cluster
//    holds 6.1 plants on average and an Autumn one 3.0, so the same `per` buys
//    a smaller share of the old pickable count in Spring, and thinning only
//    ever moves that share further down.
//
//    The thin is per entry rather than one multiplier, so the scarce things
//    (wild honey at 0.7 a chunk, an elder bush at 1.5) were left alone and the
//    carpets (dandelion 10 -> 7, wild garlic 8 -> 5) took it. Every forageable
//    that grows in a biome still shows up somewhere in a 3x3 ring in its
//    season, which forage.test.mjs drives for all seven biomes, both moisture
//    bands and all four seasons: 120 rings, 825 claims, none missing.

import * as THREE from 'three';
import { CHUNK } from './field.js';
import { hash2, mulberry32 } from './noise.js';

// ---------------------------------------------------------------------------
// The clock
// ---------------------------------------------------------------------------

/** A day and a night is six minutes, the same 360 s `sky.js` DAY_CYCLE_S runs. */
export const DAY_MS = 360_000;

/** Four seasons, in order. Winter is last and, today, empty. */
export const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];

/** A season is three real days, which is the homestead game's rule. */
export const SEASON_MS = 3 * 24 * 60 * 60 * 1000;      // 259,200,000
export const YEAR_MS = SEASON_MS * SEASONS.length;     // 1,036,800,000

/** Where in the year a moment falls, 0 at the first instant of Spring. */
export function seasonIndexAt(nowMs, epoch = 0) {
  const t = Number.isFinite(nowMs) ? nowMs : 0;
  const e = Number.isFinite(epoch) ? epoch : 0;
  const into = (((t - e) % YEAR_MS) + YEAR_MS) % YEAR_MS;
  return Math.floor(into / SEASON_MS);
}

/** 'Spring' | 'Summer' | 'Autumn' | 'Winter'. */
export const seasonAt = (nowMs, epoch = 0) => SEASONS[seasonIndexAt(nowMs, epoch)];

/** How far through the current season, 0 to 1, for a HUD dial. */
export function seasonProgress(nowMs, epoch = 0) {
  const t = Number.isFinite(nowMs) ? nowMs : 0;
  const e = Number.isFinite(epoch) ? epoch : 0;
  const into = (((t - e) % SEASON_MS) + SEASON_MS) % SEASON_MS;
  return into / SEASON_MS;
}

/** The millisecond the next season starts. */
export function nextSeasonAt(nowMs, epoch = 0) {
  const t = Number.isFinite(nowMs) ? nowMs : 0;
  return t + SEASON_MS * (1 - seasonProgress(t, epoch));
}

/**
 * A picked cluster is gone for three of this game's days, which is eighteen
 * real minutes. Long enough that a patch is not a vending machine, short
 * enough that a player who cleared the valley finds it grown back after a
 * dungeon.
 */
export const REGROW_MS = DAY_MS * 3;                   // 1,080,000

/**
 * TWO CLOCKS ARE ONE CLOCK TOO MANY.
 *
 * `remove` is called from a click and `regrow` from the frame loop, and until
 * this constant existed the two were driven by different clocks. main.js hands
 * `foraging.harvest` the requestAnimationFrame stamp (`performance.now()`,
 * tens of thousands of milliseconds after the page opened) and hands
 * `forage.update` no clock at all, so regrowth ran on `Date.now()`, about
 * 1.79e12. Measured before this was written: a chanterelle picked at 42,000
 * was stamped to grow back at 1,122,000, and the very next `update` in the
 * SAME FRAME read 1.79e12 >= 1,122,000, grew it back and redrew it. The pack
 * got the mushroom and the mushroom never left the wood.
 *
 * So the field owns one clock (`opts.now`, `Date.now` by default) and every
 * `now` handed in at the door is measured against it. A reading more than a
 * month from the field's own is not this clock's time at all: it is ignored,
 * the field's own reading is used, and `stats.foreignClock` counts it so the
 * miswiring is visible rather than silent.
 */
export const CLOCK_SKEW_MS = 30 * 86_400_000;          // a month of real time

// ---------------------------------------------------------------------------
// Biome mapping
// ---------------------------------------------------------------------------

/**
 * The wettest meadow reads as the reference's Tropical wet. field.js gives
 * sakura to moisture over 0.62 when the temperature and a noise agree, so a
 * meadow above that line is the wet, close, fig-and-ginger corner of the map.
 */
export const WET_MOIST = 0.62;

/** Every game biome a reference forest type lands on, and at what strength. */
export const BIOME_FROM = {
  'Temperate broadleaf': [['meadow', 1]],
  'Boreal conifer': [['boreal', 1], ['snow', 0.5]],
  'Birch grove': [['sakura', 1]],
  'Mediterranean pine': [['mountain', 1]],
  'Tropical wet': [['meadowWet', 1]],
};

/** The pseudo biome the wet band uses. Not a field.js biome; `weightFor` folds it in. */
export const WET_KEY = 'meadowWet';

/** Turn a reference `bio` row into this game's weights, plus any hand additions. */
export function mapBio(src, extra = null) {
  const out = {};
  for (const [type, w] of Object.entries(src)) {
    const targets = BIOME_FROM[type];
    if (!targets) throw new Error(`forage: "${type}" is not a forest type the reference has`);
    for (const [biome, mul] of targets) out[biome] = Math.max(out[biome] || 0, w * mul);
  }
  if (extra) for (const [biome, w] of Object.entries(extra)) out[biome] = w;
  return out;
}

/** All five reference types at 1, the reference's ALLB. */
const ALLB = {
  'Temperate broadleaf': 1, 'Boreal conifer': 1, 'Tropical wet': 1,
  'Birch grove': 1, 'Mediterranean pine': 1,
};

/**
 * How much of a thing this ground grows. The wet band is folded into meadow
 * here and nowhere else, so a caller only ever asks about a real biome.
 */
export function weightFor(f, biome, moist = 0) {
  if (!f || !f.bio) return 0;
  const base = f.bio[biome] || 0;
  if (biome !== 'meadow') return base;
  const wet = (Number.isFinite(moist) ? moist : 0) >= WET_MOIST ? (f.bio[WET_KEY] || 0) : 0;
  return Math.max(base, wet);
}

// ---------------------------------------------------------------------------
// Geometry builders, straight out of the reference
// ---------------------------------------------------------------------------

const SPH = new THREE.SphereGeometry(1, 8, 6);       // 80 triangles: caps, bodies
const NUT = new THREE.SphereGeometry(1, 6, 4);       // 36 triangles: berries, spots, nuts
const CYL = new THREE.CylinderGeometry(1, 1, 1, 8, 1);
const CONE = new THREE.CylinderGeometry(0.02, 1, 1, 8, 1);
const QUAD = new THREE.PlaneGeometry(1, 1);
QUAD.translate(0, 0.5, 0);

/** A geometry buffer: positions, normals and one colour per vertex. */
export const GB = () => ({ p: [], n: [], c: [] });

const _m4 = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const YUP = new THREE.Vector3(0, 1, 0);

/** Position, scale and Euler rotation as one matrix. `sy`/`sz` default to `sx`. */
function T(x, y, z, sx, sy, sz, rx, ry, rz) {
  _v.set(x, y, z);
  _e.set(rx || 0, ry || 0, rz || 0);
  _q.setFromEuler(_e);
  _s.set(sx, sy == null ? sx : sy, sz == null ? sx : sz);
  return _m4.compose(_v, _q, _s).clone();
}

/** A colour, optionally darkened. */
const C = (hex, v) => {
  const c = new THREE.Color(hex);
  if (v) c.multiplyScalar(v);
  return c;
};

/** Stamp one primitive into the buffer at a matrix, in one flat colour. */
export function gbAdd(gb, geo, m, col) {
  const g = geo.toNonIndexed();
  g.applyMatrix4(m);
  const pa = g.attributes.position, na = g.attributes.normal;
  for (let i = 0; i < pa.count; i++) {
    gb.p.push(pa.getX(i), pa.getY(i), pa.getZ(i));
    gb.n.push(na.getX(i), na.getY(i), na.getZ(i));
    gb.c.push(col.r, col.g, col.b);
  }
  g.dispose();
}

/** Close the buffer into one BufferGeometry. */
/** Vertex colour lift for every forage prototype; measured against the grass in the browser. */
export const COLOUR_LIFT = 1.9;
export function gbGeo(gb) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(gb.p, 3));
  // Lit like the ground it grows on. The assembled normals pointed every way,
  // and with DoubleSide a leaf whose winding disagreed with its normal was lit
  // from below and drew black; the grass takes the same straight-up normal.
  const up = new Float32Array(gb.n.length);
  for (let i = 0; i < up.length; i += 3) { up[i] = 0; up[i + 1] = 1; up[i + 2] = 0; }
  g.setAttribute('normal', new THREE.BufferAttribute(up, 3));
  // The reference's leaf greens were authored under a plain lit scene; under
  // this game's ACES curve and hemisphere they read as near black in the
  // browser. Lifted the way the grass was (V8): brighter, and never over one.
  const lifted = new Float32Array(gb.c.length);
  for (let i = 0; i < lifted.length; i++) lifted[i] = Math.min(1, gb.c[i] * COLOUR_LIFT);
  g.setAttribute('color', new THREE.BufferAttribute(lifted, 3));
  g.computeBoundingSphere();
  return g;
}

/** Triangles in a buffer, for the budget check. */
export const gbTriangles = (gb) => gb.p.length / 9;

// -- the eight shapes -------------------------------------------------------

export function mushroom(gb, r, h, capR, capCol, stemCol, shape, spots) {
  const tx = (r() - 0.5) * 0.35, tz = (r() - 0.5) * 0.35;
  gbAdd(gb, CYL, T(0, h * 0.5, 0, capR * 0.3, h, capR * 0.3, tx, 0, tz), stemCol);
  if (shape === 'funnel') gbAdd(gb, CONE, T(0, h + capR * 0.3, 0, capR, capR * 0.6, capR, Math.PI + tx, 0, tz), capCol);
  else if (shape === 'cone') gbAdd(gb, CONE, T(0, h + capR * 0.9, 0, capR * 0.8, capR * 1.9, capR * 0.8, tx, 0, tz), capCol);
  else gbAdd(gb, SPH, T(0, h, 0, capR, capR * (shape === 'dome' ? 0.55 : 0.8), capR, tx, 0, tz), capCol);
  for (let i = 0; i < spots; i++) {
    const a = r() * 6.28, d = r() * capR * 0.75;
    gbAdd(gb, NUT, T(Math.cos(a) * d, h + capR * 0.55 * Math.sqrt(1 - (d / capR) * (d / capR)), Math.sin(a) * d, capR * 0.11), C('#f4f0e6'));
  }
}

export function leaves(gb, r, n, rad, hMin, hMax, size, col, tilt) {
  for (let i = 0; i < n; i++) {
    const a = r() * 6.28, d = Math.pow(r(), 0.6) * rad, y = hMin + r() * (hMax - hMin);
    const c = col.clone().multiplyScalar(0.8 + r() * 0.4);
    gbAdd(gb, QUAD, T(Math.cos(a) * d, y, Math.sin(a) * d, size * (0.8 + r() * 0.4), size * (0.8 + r() * 0.4), 1,
      -(tilt + r() * 0.6), a + r() * 1.5, (r() - 0.5) * 0.4), c);
  }
}

export function berries(gb, r, n, rad, hMin, hMax, br, col, sy) {
  for (let i = 0; i < n; i++) {
    const a = r() * 6.28, d = Math.pow(r(), 0.5) * rad;
    gbAdd(gb, NUT, T(Math.cos(a) * d, hMin + r() * (hMax - hMin), Math.sin(a) * d, br, br * (sy || 1), br),
      col.clone().multiplyScalar(0.85 + r() * 0.3));
  }
}

export function shrub(gb, r, rad, h, leafCol, leafN, leafSize, berryCol, berryN, br, sy) {
  for (let i = 0; i < 3; i++) {
    const a = r() * 6.28;
    gbAdd(gb, CYL, T(Math.cos(a) * rad * 0.2, h * 0.4, Math.sin(a) * rad * 0.2, 0.012, h * 0.8, 0.012,
      (r() - 0.5) * 0.5, 0, (r() - 0.5) * 0.5), C('#5a4a30'));
  }
  leaves(gb, r, leafN, rad, h * 0.25, h, leafSize, leafCol, 0.4);
  if (berryN) berries(gb, r, berryN, rad * 0.95, h * 0.4, h * 1.02, br, berryCol, sy);
}

export function herb(gb, r, n, h, size, leafCol, flowerCol, fr) {
  leaves(gb, r, n, 0.05, 0.0, 0.02, size, leafCol, 0.9);
  if (flowerCol) {
    gbAdd(gb, CYL, T(0, h * 0.5, 0, 0.006, h, 0.006), C('#5f8a3a'));
    gbAdd(gb, NUT, T(0, h, 0, fr), flowerCol);
  }
}

export function shelf(gb, r, n, col) {
  for (let i = 0; i < n; i++) {
    const rr = 0.07 + r() * 0.07;
    gbAdd(gb, SPH, T((r() - 0.5) * 0.12, i * 0.06 + (r() - 0.5) * 0.03, rr * 0.55, rr, rr * 0.16, rr, 0.25 + r() * 0.3, 0, 0),
      col.clone().multiplyScalar(0.85 + r() * 0.3));
  }
}

export function hive(gb, r) {
  gbAdd(gb, SPH, T(0, 0, 0.1, 0.16, 0.26, 0.13), C('#4a3320'));
  for (let i = 0; i < 4; i++) gbAdd(gb, NUT, T((r() - 0.5) * 0.16, -0.2 - r() * 0.12, 0.14 + r() * 0.04, 0.03 + r() * 0.02, 0.06, 0.03), C('#e8a820'));
  for (let i = 0; i < 8; i++) gbAdd(gb, NUT, T((r() - 0.5) * 0.7, (r() - 0.5) * 0.7, 0.2 + r() * 0.4, 0.012), C('#f0c030'));
}

export function scatter(gb, r, n, col, sx, sy, capCol) {
  for (let i = 0; i < n; i++) {
    const x = (r() - 0.5) * 0.9, z = (r() - 0.5) * 0.9;
    gbAdd(gb, NUT, T(x, sy * 0.8, z, sx, sy, sx, (r() - 0.5) * 1.5, r() * 6.28, (r() - 0.5) * 1.5), col);
    if (capCol) gbAdd(gb, NUT, T(x, sy * 1.2, z, sx * 0.85, sy * 0.4, sx * 0.85), capCol);
  }
}

// ---------------------------------------------------------------------------
// The table
// ---------------------------------------------------------------------------
//
// `id` is the id `items.js` gives the base and `recipes.js` asks for by name,
// so a chanterelle picked in a wood and a chanterelle in a stew are the same
// string in both directions.
//
// `difficulty` is the number Foraging learns from. It is not in the reference,
// which has no skills: it is set from how hard the thing is to find and to know,
// which is roughly the inverse of `per`. A dandelion is 3 and a morel is 35.

const F = (o) => ({ ...o, bio: mapBio(o.src, o.extra) });

export const FORAGE = [
  F({
    id: 'chanterelle', name: 'Chanterelle', many: 'chanterelles', tag: 'edible', colour: '#e9a825', difficulty: 18,
    seasons: ['Summer', 'Autumn'],
    src: { 'Temperate broadleaf': 1, 'Boreal conifer': 0.9, 'Birch grove': 0.8, 'Mediterranean pine': 0.3 },
    place: 'nearTree', per: 5, cluster: [3, 8],
    build: (gb, r) => mushroom(gb, r, 0.05 + r() * 0.03, 0.03 + r() * 0.02, C('#e9a825'), C('#f0c465'), 'funnel', 0),
  }),
  F({
    id: 'porcini', name: 'Porcini', many: 'porcini', tag: 'edible', colour: '#8a5a2b', difficulty: 25,
    seasons: ['Summer', 'Autumn'],
    src: { 'Temperate broadleaf': 1, 'Boreal conifer': 1, 'Birch grove': 0.6, 'Mediterranean pine': 0.7 },
    place: 'nearTree', per: 3, cluster: [1, 3],
    build: (gb, r) => mushroom(gb, r, 0.07 + r() * 0.04, 0.05 + r() * 0.03, C('#8a5a2b'), C('#e8dcc0'), 'dome', 0),
  }),
  F({
    id: 'fly_agaric', name: 'Fly agaric', many: 'fly agarics', tag: 'toxic', colour: '#d23a2a', difficulty: 12,
    seasons: ['Autumn'],
    src: { 'Birch grove': 1, 'Boreal conifer': 1, 'Temperate broadleaf': 0.5 },
    place: 'nearTree', per: 2, cluster: [1, 4],
    build: (gb, r) => mushroom(gb, r, 0.09 + r() * 0.05, 0.06 + r() * 0.03, C('#d23a2a'), C('#f2eee4'), 'dome', 7),
  }),
  F({
    id: 'morel', name: 'Morel', many: 'morels', tag: 'edible', colour: '#a08050', difficulty: 35,
    seasons: ['Spring'],
    src: { 'Temperate broadleaf': 1, 'Birch grove': 0.8, 'Boreal conifer': 0.4, 'Mediterranean pine': 0.5 },
    place: 'nearTree', per: 2.5, cluster: [1, 3],
    build: (gb, r) => mushroom(gb, r, 0.04 + r() * 0.02, 0.025 + r() * 0.012, C('#8a7048'), C('#e4dcc8'), 'cone', 0),
  }),
  F({
    id: 'oyster_mushroom', name: 'Oyster mushroom', many: 'oyster mushrooms', tag: 'edible', colour: '#d8d2c4', difficulty: 22,
    seasons: ['Spring', 'Autumn'],
    src: { 'Temperate broadleaf': 1, 'Birch grove': 1, 'Tropical wet': 0.8, 'Boreal conifer': 0.3 },
    place: 'trunk', hgt: [0.3, 1.6], per: 2, cluster: [1, 1],
    build: (gb, r) => shelf(gb, r, 4 + Math.floor(r() * 4), C('#d8d2c4')),
  }),
  F({
    // The reference calls this Wild honey. The item it becomes is `honey`, and
    // there is exactly one of it, so the recipe that wants honey and the hive
    // in the tree are the same string.
    id: 'honey', name: 'Wild honey', many: 'wild honey', tag: 'edible', colour: '#e0a020', difficulty: 40,
    seasons: ['Summer', 'Autumn'],
    src: ALLB,
    // Bees keep a nest in whatever stands: a dune pine, a desert snag.
    extra: { beach: 0.5, desert: 0.3 },
    place: 'trunk', hgt: [2.5, 5], per: 0.7, cluster: [1, 1],
    build: (gb, r) => hive(gb, r),
  }),
  F({
    id: 'blueberry', name: 'Blueberry', many: 'blueberries', tag: 'edible', colour: '#3b4a9a', difficulty: 8,
    seasons: ['Summer'],
    src: { 'Boreal conifer': 1, 'Birch grove': 1, 'Temperate broadleaf': 0.6 },
    place: 'any', per: 7, cluster: [2, 6],
    build: (gb, r) => shrub(gb, r, 0.28, 0.3, C('#3f7a2c'), 26, 0.07, C('#3b4a9a'), 14, 0.014),
  }),
  F({
    id: 'lingonberry', name: 'Lingonberry', many: 'lingonberries', tag: 'edible', colour: '#b8202a', difficulty: 8,
    seasons: ['Autumn'],
    src: { 'Boreal conifer': 1, 'Birch grove': 0.6 },
    place: 'any', per: 7, cluster: [3, 8],
    build: (gb, r) => shrub(gb, r, 0.22, 0.14, C('#2f5a24'), 22, 0.05, C('#b8202a'), 12, 0.012),
  }),
  F({
    id: 'blackberry', name: 'Blackberry', many: 'blackberries', tag: 'edible', colour: '#2a1b30', difficulty: 10,
    seasons: ['Summer', 'Autumn'],
    src: { 'Temperate broadleaf': 1, 'Mediterranean pine': 0.8, 'Birch grove': 0.5 },
    // Bramble is the first scrub to take dune sand behind the tideline.
    extra: { beach: 0.3 },
    place: 'clearing', per: 3.5, cluster: [1, 3],
    build: (gb, r) => shrub(gb, r, 0.7, 0.75, C('#356a28'), 44, 0.13, C('#2a1b30'), 24, 0.018),
  }),
  F({
    id: 'raspberry', name: 'Raspberry', many: 'raspberries', tag: 'edible', colour: '#d0305a', difficulty: 10,
    seasons: ['Summer'],
    src: { 'Temperate broadleaf': 1, 'Boreal conifer': 0.7, 'Birch grove': 0.9 },
    place: 'clearing', per: 3.5, cluster: [2, 4],
    build: (gb, r) => shrub(gb, r, 0.4, 0.9, C('#4f8a35'), 30, 0.11, C('#d0305a'), 16, 0.016, 1.2),
  }),
  F({
    id: 'wild_strawberry', name: 'Wild strawberry', many: 'wild strawberries', tag: 'edible', colour: '#d83030', difficulty: 12,
    seasons: ['Spring', 'Summer'],
    src: { 'Temperate broadleaf': 1, 'Birch grove': 1, 'Boreal conifer': 0.5, 'Mediterranean pine': 0.5 },
    place: 'clearing', per: 6, cluster: [3, 9],
    build: (gb, r) => { herb(gb, r, 7, 0.05, 0.06, C('#3f7a2c'), null); berries(gb, r, 4, 0.08, 0.02, 0.05, 0.012, C('#d83030'), 1.3); },
  }),
  F({
    id: 'elderberry', name: 'Elderberry', many: 'elderberries', tag: 'caution', colour: '#3a2a4a', difficulty: 20,
    seasons: ['Autumn'],
    src: { 'Temperate broadleaf': 1, 'Birch grove': 0.6 },
    place: 'clearing', per: 1.5, cluster: [1, 1],
    build: (gb, r) => {
      shrub(gb, r, 0.9, 1.5, C('#3c6e2c'), 50, 0.16, null, 0, 0);
      // Four umbels of nine. The reference builds seven of fourteen, which is
      // 98 berries and 7,840 triangles on its own; see note 4 at the top.
      for (let i = 0; i < 4; i++) berries(gb, r, 9, 0.09, 1.1 + r() * 0.4, 1.25 + r() * 0.4, 0.011, C('#2c1e3a'));
    },
  }),
  F({
    id: 'rosehip', name: 'Rosehip', many: 'rosehips', tag: 'edible', colour: '#c8402a', difficulty: 12,
    seasons: ['Autumn'],
    src: { 'Temperate broadleaf': 1, 'Mediterranean pine': 1, 'Birch grove': 0.7 },
    // Rosa rugosa is the beach rose. It holds a dune where nothing else will.
    extra: { beach: 0.8 },
    place: 'clearing', per: 2.5, cluster: [1, 2],
    build: (gb, r) => shrub(gb, r, 0.6, 1.1, C('#3f6e2a'), 36, 0.1, C('#c8402a'), 18, 0.014, 1.5),
  }),
  F({
    id: 'hazelnut', name: 'Hazelnut', many: 'hazelnuts', tag: 'edible', colour: '#8a6a3a', difficulty: 15,
    seasons: ['Autumn'],
    src: { 'Temperate broadleaf': 1, 'Birch grove': 0.8, 'Mediterranean pine': 0.5 },
    place: 'any', per: 1.5, cluster: [1, 1],
    build: (gb, r) => shrub(gb, r, 0.9, 1.7, C('#4a7d2f'), 52, 0.17, C('#8a6a3a'), 16, 0.014, 1.2),
  }),
  F({
    id: 'wild_garlic', name: 'Wild garlic', many: 'wild garlic', tag: 'edible', colour: '#e8f0e0', difficulty: 10,
    seasons: ['Spring'],
    src: { 'Temperate broadleaf': 1, 'Birch grove': 0.8 },
    place: 'nearTree', per: 5, cluster: [6, 16],
    build: (gb, r) => herb(gb, r, 6, 0.22, 0.16, C('#3d8a30'), C('#eef2e4'), 0.03),
  }),
  F({
    id: 'nettle', name: 'Nettle', many: 'nettles', tag: 'caution', colour: '#3f6a2a', difficulty: 5,
    seasons: ['Spring', 'Summer', 'Autumn'],
    src: { 'Temperate broadleaf': 1, 'Birch grove': 1, 'Boreal conifer': 0.5, 'Tropical wet': 0.4 },
    // Nettle wants disturbed ground with nitrogen in it, which is the strand
    // line behind a beach as reliably as it is a field gate.
    extra: { beach: 0.3 },
    place: 'any', per: 4, cluster: [4, 10],
    build: (gb, r) => {
      gbAdd(gb, CYL, T(0, 0.3, 0, 0.006, 0.6, 0.006), C('#4a7a30'));
      leaves(gb, r, 10, 0.08, 0.1, 0.6, 0.09, C('#355e24'), 0.5);
    },
  }),
  F({
    id: 'fiddlehead', name: 'Fiddlehead fern', many: 'fiddlehead ferns', tag: 'edible', colour: '#4f8a3a', difficulty: 14,
    seasons: ['Spring', 'Summer', 'Autumn'],
    src: { 'Temperate broadleaf': 1, 'Tropical wet': 1.3, 'Boreal conifer': 0.8, 'Birch grove': 0.8 },
    place: 'nearTree', per: 4, cluster: [2, 5],
    build: (gb, r) => {
      for (let i = 0; i < 9; i++) {
        const a = i / 9 * 6.28 + r() * 0.4;
        gbAdd(gb, QUAD, T(Math.cos(a) * 0.06, 0.05, Math.sin(a) * 0.06, 0.12, 0.55 + r() * 0.25, 1, -(0.7 + r() * 0.4), a + 1.57, 0),
          C('#4f8a3a').multiplyScalar(0.8 + r() * 0.4));
      }
      gbAdd(gb, NUT, T(0, 0.28, 0, 0.02, 0.03, 0.02), C('#7fae4a'));
    },
  }),
  F({
    // The reference calls the scatter "Acorns & chestnuts". What goes in the
    // pack is a chestnut, and the id is `nut`, because that is the word a
    // nut bread recipe asks for.
    id: 'nut', name: 'Chestnuts', many: 'chestnuts', tag: 'edible', colour: '#6a4a2a', difficulty: 8,
    seasons: ['Autumn'],
    src: { 'Temperate broadleaf': 1, 'Mediterranean pine': 0.5 },
    place: 'nearTree', per: 4, cluster: [1, 1],
    build: (gb, r) => scatter(gb, r, 9, C('#6a4a2a'), 0.012, 0.017, C('#4a3420')),
  }),
  F({
    id: 'dandelion', name: 'Dandelion', many: 'dandelions', tag: 'edible', colour: '#f0c020', difficulty: 3,
    seasons: ['Spring', 'Summer'],
    src: { 'Temperate broadleaf': 1, 'Birch grove': 1, 'Mediterranean pine': 0.7, 'Boreal conifer': 0.4 },
    // A dandelion takes a sand verge as happily as a lawn.
    extra: { beach: 0.4 },
    place: 'clearing', per: 7, cluster: [3, 9],
    build: (gb, r) => herb(gb, r, 8, 0.16 + r() * 0.08, 0.09, C('#4a8a32'), C('#f0c020'), 0.022),
  }),
  F({
    id: 'fig', name: 'Wild figs', many: 'wild figs', tag: 'edible', colour: '#6a3a5a', difficulty: 16,
    seasons: ['Summer', 'Autumn'],
    src: { 'Tropical wet': 1 },
    // A fig at an oasis is the one fruit a desert honestly grows, and the
    // desert forest type's wet mix is palm, so there is a tree to drop it.
    extra: { desert: 0.5 },
    place: 'nearTree', per: 4, cluster: [1, 1],
    build: (gb, r) => scatter(gb, r, 8, C('#6a3a5a'), 0.02, 0.024, null),
  }),
  F({
    id: 'wild_ginger', name: 'Wild ginger', many: 'wild ginger', tag: 'edible', colour: '#d8503a', difficulty: 28,
    seasons: ['Spring', 'Summer', 'Autumn'],
    src: { 'Tropical wet': 1 },
    place: 'any', per: 4, cluster: [2, 5],
    build: (gb, r) => herb(gb, r, 7, 0.35, 0.22, C('#2f7a2a'), C('#d8503a'), 0.04),
  }),
  F({
    id: 'cacao', name: 'Cacao pods', many: 'cacao pods', tag: 'edible', colour: '#c87a2a', difficulty: 30,
    seasons: ['Summer', 'Autumn'],
    src: { 'Tropical wet': 1 },
    place: 'trunk', hgt: [0.6, 2.2], per: 1.5, cluster: [1, 1],
    build: (gb, r) => {
      for (let i = 0; i < 3; i++) {
        gbAdd(gb, SPH, T((r() - 0.5) * 0.2, (r() - 0.5) * 0.3, 0.08, 0.05, 0.09, 0.05, 0, 0, (r() - 0.5) * 0.6),
          C(r() < 0.5 ? '#c87a2a' : '#a8c03a'));
      }
    },
  }),
];

export const FORAGE_IDS = FORAGE.map((f) => f.id);
export const FORAGE_BY_ID = Object.fromEntries(FORAGE.map((f) => [f.id, f]));
export const FORAGE_TAGS = ['edible', 'toxic', 'caution'];

/** Which biomes grow anything at all, in this season. Empty in Winter. */
export function idsIn(biome, season, moist = 0) {
  return FORAGE.filter((f) => f.seasons.includes(season) && weightFor(f, biome, moist) > 0).map((f) => f.id);
}

/**
 * Every claim this table makes, checked at load. A forageable with no biome, a
 * cluster that counts backwards, a trunk sitter with no height band or a tag
 * nothing knows would each ship something a player could never pick or could
 * pick and never eat.
 */
export function auditForage() {
  const bad = [];
  const seen = new Set();
  const biomes = new Set(['meadow', 'boreal', 'sakura', 'mountain', 'snow', 'desert', 'beach', WET_KEY]);
  for (const f of FORAGE) {
    const at = `forage ${f.id}`;
    if (seen.has(f.id)) bad.push(`${at}: two of them share an id`);
    seen.add(f.id);
    if (!f.name) bad.push(`${at}: no name`);
    // `many` is what a bunch is called: "a patch of dandelions, seven of them".
    // No rule can turn "Wild garlic" into a plural that reads, so every entry
    // carries its own, and a twenty third forageable cannot ship without one.
    if (!f.many || typeof f.many !== 'string') bad.push(`${at}: no plural, so a patch of them has no name`);
    else if (f.many !== f.many.toLowerCase()) bad.push(`${at}: plural "${f.many}" is capitalised; it sits mid sentence`);
    if (!FORAGE_TAGS.includes(f.tag)) bad.push(`${at}: tag "${f.tag}" is not one of ${FORAGE_TAGS.join(', ')}`);
    if (!/^#[0-9a-f]{6}$/i.test(f.colour)) bad.push(`${at}: colour ${f.colour} is not a hex`);
    if (!f.seasons.length) bad.push(`${at}: grows in no season, so nothing will ever place it`);
    for (const s of f.seasons) if (!SEASONS.includes(s)) bad.push(`${at}: season "${s}" is not one of the four`);
    const w = Object.entries(f.bio);
    if (!w.length) bad.push(`${at}: grows in no biome`);
    for (const [b, v] of w) {
      if (!biomes.has(b)) bad.push(`${at}: biome "${b}" is not one this world has`);
      if (!(v > 0)) bad.push(`${at}: biome "${b}" weight ${v}`);
    }
    if (!['any', 'clearing', 'nearTree', 'trunk'].includes(f.place)) bad.push(`${at}: place "${f.place}" is not a rule`);
    if (f.place === 'trunk' && (!f.hgt || f.hgt[1] <= f.hgt[0])) bad.push(`${at}: sits on a trunk with no height band`);
    if (!(f.per > 0)) bad.push(`${at}: per is ${f.per}, so no chunk ever gets one`);
    if (!Array.isArray(f.cluster) || f.cluster.length !== 2 || f.cluster[1] < f.cluster[0] || f.cluster[0] < 1) {
      bad.push(`${at}: cluster ${JSON.stringify(f.cluster)}`);
    }
    if (typeof f.build !== 'function') bad.push(`${at}: has no builder`);
    if (!(f.difficulty >= 1 && f.difficulty <= 95)) bad.push(`${at}: difficulty ${f.difficulty} is off the ladder`);
  }
  // "One case is never the case": every biome that has ground to stand on owes
  // the player something to pick in at least one season, or a Foraging skill is
  // a skill you cannot train where you live.
  for (const b of ['meadow', 'boreal', 'sakura', 'mountain', 'snow', 'desert', 'beach']) {
    const seasons = SEASONS.filter((s) => idsIn(b, s, 1).length > 0);
    if (!seasons.length) bad.push(`biome ${b} grows nothing in any season`);
  }
  if (bad.length) throw new Error(`auditForage: ${bad.length} problem(s)\n  ${bad.join('\n  ')}`);
  const winter = FORAGE.filter((f) => f.seasons.includes('Winter')).length;
  return {
    entries: FORAGE.length,
    winter,                                   // 0 today; the wood is bare in Winter
    byTag: Object.fromEntries(FORAGE_TAGS.map((t) => [t, FORAGE.filter((f) => f.tag === t).length])),
    byBiome: Object.fromEntries(['meadow', 'boreal', 'sakura', 'mountain', 'snow', 'desert', 'beach']
      .map((b) => [b, FORAGE.filter((f) => (f.bio[b] || 0) > 0).length])),
  };
}
auditForage();

// ---------------------------------------------------------------------------
// Prototypes
// ---------------------------------------------------------------------------

const protoCache = new Map();

/** The merged geometry for one forageable. Seeded, so it is the same every run. */
export function forageGeometry(id, seed = 900) {
  const key = `${id}:${seed}`;
  if (protoCache.has(key)) return protoCache.get(key);
  const f = FORAGE_BY_ID[id];
  if (!f) throw new Error(`forageGeometry: "${id}" is not a forageable`);
  const gb = GB();
  f.build(gb, mulberry32(seed + FORAGE_IDS.indexOf(id)));
  const g = gbGeo(gb);
  g.userData.forage = id;
  g.userData.triangles = gbTriangles(gb);
  protoCache.set(key, g);
  return g;
}

/** Triangles in each prototype, for the budget check. Builds them all. */
export function forageTriangles(seed = 900) {
  return Object.fromEntries(FORAGE_IDS.map((id) => [id, forageGeometry(id, seed).userData.triangles]));
}

export function clearForageCache() {
  for (const g of protoCache.values()) g.dispose();
  protoCache.clear();
}

/** One material for the whole layer: vertex colours, two sided for the quads. */
export function forageMaterial() {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide });
  // Every plant normal points up (gbGeo), but three flips a normal on a back
  // facing triangle, so a leaf seen from behind was lit from below and drew
  // black; seen in the browser as black nettles beside bright ones. The grass
  // takes the same cure: the un-flip lands after three's flip.
  m.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_begin>',
      '#include <normal_fragment_begin>\n  normal = normalize( vNormal );\n  nonPerturbedNormal = normal;\n',
    );
  };
  m.customProgramCacheKey = () => 'forage:upright';
  return m;
}

// ---------------------------------------------------------------------------
// Placement
// ---------------------------------------------------------------------------

/** How much of a trunk radius a clearing wants clear of it, in metres. */
export const CLEARING_GAP = 2.5;
/** The reference's forageScale default. */
export const FORAGE_SCALE = 1.4;
/** The reference's `forage` abundance slider default. */
export const ABUNDANCE = 1;

/**
 * Where the forageables in one 64 m chunk stand.
 *
 * @param sample   `{ biome, moist }` from `field.sampleAt` at the chunk centre
 * @param cx,cz    chunk coordinates
 * @param trees    `[{ x, z, radius }]` in and around this chunk, from whoever
 *                 owns the forest. May be empty: trunk and nearTree dwellers
 *                 then place nothing, which is the reference's own rule.
 * @param season   'Spring' | 'Summer' | 'Autumn' | 'Winter'
 * @param seed     the world seed
 * @param opts     `{ abundance, scale, heightAt(x, z), only }`
 * @returns `[{ id, x, y, z, count, onTrunk, members: [{ x, y, z, yaw, scale }] }]`
 *
 * ONE RECORD PER CLUSTER. The reference scatters a bunch of dandelions as
 * seven plants and this still places all seven, in `members`, because that is
 * what the eye wants. What the hand gets is one thing: `count` plants, one
 * click, one stack. `x, y, z` is the middle of the bunch, which is what a
 * hover line and a pickup sound want; the reach check in `foraging.js` measures
 * to the NEAREST member, because standing over the edge of a patch is standing
 * over the patch.
 *
 * `y` is a world height when `heightAt` is given and an offset above zero when
 * it is not, so a caller that has no terrain still gets usable records and a
 * caller that has one never has to add the ground back on.
 */
export function placeForage(sample, cx, cz, trees, season, seed = 1, opts = {}) {
  const out = [];
  if (!sample || !SEASONS.includes(season)) return out;
  const biome = sample.biome;
  if (!biome || biome === 'ocean') return out;
  const moist = Number.isFinite(sample.moist) ? sample.moist : 0;
  const list = Array.isArray(trees) ? trees : [];
  const abundance = opts.abundance ?? ABUNDANCE;
  const scale = opts.scale ?? FORAGE_SCALE;
  const groundAt = typeof opts.heightAt === 'function' ? opts.heightAt : () => 0;
  const only = opts.only ? new Set(opts.only) : null;

  const ox = cx * CHUNK, oz = cz * CHUNK;
  // The reference's own chunk seed, with the world seed folded in so two worlds
  // do not grow the same mushrooms in the same place.
  const r = mulberry32(hash2(cx * 5 + 3, cz * 5 + 9, seed));

  for (const f of FORAGE) {
    if (only && !only.has(f.id)) continue;
    if (!f.seasons.includes(season)) continue;
    const bf = weightFor(f, biome, moist);
    if (bf <= 0) continue;
    const base = f.per * abundance * bf;
    let nCl = Math.floor(base) + (r() < base - Math.floor(base) ? 1 : 0);
    const wantsTree = f.place === 'nearTree' || f.place === 'trunk';
    if (wantsTree && !list.length) nCl = 0;
    if (nCl <= 0) continue;

    for (let c = 0; c < nCl; c++) {
      let cx0, cz0, cy0 = null, yaw = null, onTrunk = false;
      if (wantsTree) {
        const t = list[Math.floor(r() * list.length)];
        const a = r() * 6.28;
        const br = Math.max(0.1, t.radius || 0.35);
        if (f.place === 'trunk') {
          cx0 = t.x + Math.cos(a) * br * 0.92;
          cz0 = t.z + Math.sin(a) * br * 0.92;
          const hh = f.hgt || [0.4, 1.5];
          cy0 = groundAt(t.x, t.z) + hh[0] + r() * (hh[1] - hh[0]);
          // Face out of the bark: the shelf and the hive hang off the side.
          yaw = Math.atan2(Math.cos(a), Math.sin(a));
          onTrunk = true;
        } else {
          const d = br + 0.25 + r() * 1.6;
          cx0 = t.x + Math.cos(a) * d;
          cz0 = t.z + Math.sin(a) * d;
        }
      } else {
        // A clearing is a spot no crown reaches. Six tries, then give up on
        // this cluster, which is the reference's own budget.
        let ok = false;
        for (let tries = 0; tries < 6 && !ok; tries++) {
          cx0 = ox + r() * CHUNK;
          cz0 = oz + r() * CHUNK;
          ok = f.place === 'any' || !list.some((t) => Math.hypot(t.x - cx0, t.z - cz0) < (t.radius || 0.35) + CLEARING_GAP);
        }
        if (!ok) continue;
      }
      const n = f.cluster[0] + Math.floor(r() * (f.cluster[1] - f.cluster[0] + 1));
      const members = [];
      let sx = 0, sy = 0, sz = 0;
      for (let k = 0; k < n; k++) {
        let px = cx0, pz = cz0;
        if (n > 1) {
          const a = r() * 6.28, d = 0.15 + r() * 0.9;
          px += Math.cos(a) * d;
          pz += Math.sin(a) * d;
        }
        const sc = (0.7 + r() * 0.6) * scale;
        const py = cy0 != null ? cy0 : groundAt(px, pz) - 0.01;
        members.push({ x: px, y: py, z: pz, yaw: yaw != null ? yaw : r() * 6.28, scale: sc });
        sx += px; sy += py; sz += pz;
      }
      // The middle of the bunch, not the first plant in it: a patch of seven
      // reads as one thing standing in one place.
      out.push({
        id: f.id,
        x: sx / n, y: sy / n, z: sz / n,
        count: n,
        onTrunk,
        members,
      });
    }
  }
  return out;
}

/** How many plants stand in a pickable. One for anything that is not a bunch. */
export const plantsIn = (rec) => (rec && Number.isFinite(rec.count) ? rec.count
  : rec && Array.isArray(rec.members) ? rec.members.length : 1);

/**
 * How far a point is from the NEAREST plant in a bunch. Standing over the edge
 * of a patch is standing over the patch, so the reach is not measured to the
 * centre: a wild garlic cluster is over two metres across and the reach is 2.5.
 */
export function distanceToForage(rec, x, z) {
  if (!rec) return Infinity;
  const ms = Array.isArray(rec.members) && rec.members.length ? rec.members : [rec];
  let best = Infinity;
  for (const m of ms) {
    const d = Math.hypot(m.x - x, m.z - z);
    if (d < best) best = d;
  }
  return best;
}

// ---------------------------------------------------------------------------
// The field
// ---------------------------------------------------------------------------

/** How far out the ring of loaded forage chunks reaches. The reference's 3x3. */
export const RING = 1;

/**
 * The live forage layer: one InstancedMesh per forageable per chunk, a
 * back-index from a raycast hit to the record it came from, and a regrowth
 * clock on anything picked.
 *
 * `opts`:
 *   field       a world field, for `sampleAt` and `heightAt` (required)
 *   treesFor    `(cx, cz) -> [{ x, z, radius }]`. Without it nothing that wants
 *               a trunk will ever place, and `stats.treeless` counts the chunks
 *               it happened in, so the wiring being missing is visible.
 *   season      the season to start in; `update` changes it
 *   seed        defaults to `field.seed`
 *   abundance, scale, parent
 */
export function createForageField(sc, opts = {}) {
  const field = opts.field;
  if (!field) throw new Error('createForageField: there is no world field to grow on');
  const parent = opts.parent || sc?.scene || sc;
  if (!parent || typeof parent.add !== 'function') throw new Error('createForageField: there is nowhere to put the forage');

  const group = new THREE.Group();
  group.name = 'world-forage';
  parent.add(group);

  const seed = opts.seed ?? field.seed ?? 1;
  const treesFor = typeof opts.treesFor === 'function' ? opts.treesFor : null;
  const material = forageMaterial();
  const chunks = new Map();          // 'cx,cz' -> { group, meshes: Map(id -> mesh), recs: [] }
  const clock = typeof opts.now === 'function' ? opts.now : () => Date.now();
  let season = SEASONS.includes(opts.season) ? opts.season : seasonAt(clock());
  let lastCX = null, lastCZ = null;
  const stats = { chunks: 0, records: 0, plants: 0, harvested: 0, rebuilds: 0, drawCalls: 0, treeless: 0, foreignClock: 0 };

  /**
   * The one door every `now` comes through. See CLOCK_SKEW_MS. A reading on
   * the field's own clock is used exactly as it was given. A reading from
   * somewhere else is not refused, which would throw away the caller's
   * intended elapsed time: it is TRANSLATED. The field learns the offset the
   * first time it sees a foreign clock, by pinning that first reading to its
   * own reading of the same instant, and applies the same offset to every
   * reading afterwards. So a caller who picks at 42,000 and asks again at
   * 43,000 gets one second of elapsed time, exactly as it meant to, and it is
   * one second on the same clock the regrowth sweep uses.
   *
   * `stats.foreignClock` counts the translations, so the miswiring is visible.
   */
  let clockOffset = null;
  function at(now) {
    const mine = clock();
    if (!Number.isFinite(now)) return mine;
    if (Math.abs(now - mine) <= CLOCK_SKEW_MS) return now;
    if (clockOffset === null) clockOffset = mine - now;
    stats.foreignClock++;
    return now + clockOffset;
  }

  const heightAt = (x, z) => field.heightAt(x, z);
  const _mm = new THREE.Matrix4(), _pp = new THREE.Vector3(), _qq = new THREE.Quaternion(), _ss = new THREE.Vector3();

  /** One plant's transform, written into instance slot `i` of `im`. */
  function writeMatrix(im, i, m) {
    _pp.set(m.x, m.y, m.z);
    _qq.setFromAxisAngle(YUP, m.yaw);
    _ss.setScalar(m.scale);
    _mm.compose(_pp, _qq, _ss);
    im.setMatrixAt(i, _mm);
  }

  /** Swap two instance slots, both maps and both matrices, in one move. */
  function swapSlots(im, a, b) {
    if (a === b) return;
    const own = im.userData.forageMap, mem = im.userData.forageMembers;
    const or = own[a], om = mem[a];
    own[a] = own[b]; mem[a] = mem[b];
    own[b] = or; mem[b] = om;
    writeMatrix(im, a, mem[a]);
    writeMatrix(im, b, mem[b]);
  }

  /**
   * Draw one chunk. Every PLANT of a kind gets an instance slot, the plants of
   * live clusters FIRST, and `im.count` is set to how many are standing. That
   * is what lets a pick hide a whole patch in place (see `hideInstance`)
   * instead of throwing away and rebuilding every InstancedMesh in the chunk,
   * and it is what lets regrowth put the same patch back without a rebuild
   * either. Three's InstancedMesh honours `count` in both `raycast` and
   * `computeBoundingSphere`, so a hidden slot is neither drawn nor picked.
   *
   * `forageMap[i]` is the CLUSTER that owns slot i, so a raycast onto any one
   * dandelion hands back the patch. `forageMembers[i]` is that slot's own
   * transform, because the cluster no longer has one of its own.
   */
  function drawChunk(entry) {
    for (const m of entry.meshes.values()) { entry.group.remove(m); m.dispose?.(); }
    entry.meshes.clear();
    const byId = new Map();
    for (const rec of entry.recs) {
      if (!byId.has(rec.id)) byId.set(rec.id, { live: [], picked: [] });
      byId.get(rec.id)[rec.harvestedUntil ? 'picked' : 'live'].push(rec);
    }
    for (const [id, both] of byId) {
      const owners = [], members = [];
      let live = 0;
      for (const rec of both.live.concat(both.picked)) {
        for (const m of rec.members) { owners.push(rec); members.push(m); }
        if (!rec.harvestedUntil) live += rec.members.length;
      }
      if (!owners.length) continue;
      const geo = forageGeometry(id, 900);
      const im = new THREE.InstancedMesh(geo, material, owners.length);
      for (let i = 0; i < owners.length; i++) writeMatrix(im, i, members[i]);
      im.count = live;
      im.instanceMatrix.needsUpdate = true;
      im.castShadow = true;
      im.receiveShadow = true;
      im.frustumCulled = true;
      im.computeBoundingSphere();
      im.name = `forage:${id}`;
      im.userData.forageId = id;
      im.userData.forageMap = owners;        // instanceId -> the cluster it belongs to
      im.userData.forageMembers = members;   // instanceId -> that plant's transform
      entry.group.add(im);
      entry.meshes.set(id, im);
    }
    stats.rebuilds++;
  }

  /**
   * Take one whole cluster out of the drawing, this instant and without a
   * rebuild. Every plant in the patch is swapped down to the end of the live
   * range and the count comes down by all of them, so the bunch stops being
   * drawn AND stops being raycast on the very frame it was picked. Returns
   * false when the mesh does not hold the whole patch, which is the caller's
   * signal to fall back to `drawChunk`.
   */
  function hideInstance(entry, rec) {
    const im = entry.meshes.get(rec.id);
    if (!im) return false;
    const map = im.userData.forageMap;
    const mine = [];
    for (let i = 0; i < im.count; i++) if (map[i] === rec) mine.push(i);
    if (mine.length !== rec.members.length) return false;
    let last = im.count - 1;
    for (let k = mine.length - 1; k >= 0; k--) { swapSlots(im, mine[k], last); last--; }
    im.count = last + 1;
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    return true;
  }

  /** The same move backwards: a regrown patch takes back the first free slots. */
  function showInstance(entry, rec) {
    const im = entry.meshes.get(rec.id);
    if (!im) return false;
    const map = im.userData.forageMap;
    const mine = [];
    for (let j = im.count; j < map.length; j++) if (map[j] === rec) mine.push(j);
    if (mine.length !== rec.members.length) return false;
    let slot = im.count;
    for (const j of mine) { swapSlots(im, j, slot); slot++; }
    im.count = slot;
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    return true;
  }

  function addChunk(cx, cz) {
    const key = `${cx},${cz}`;
    if (chunks.has(key)) return chunks.get(key);
    const sample = field.sampleAt(cx * CHUNK + CHUNK / 2, cz * CHUNK + CHUNK / 2);
    const trees = treesFor ? (treesFor(cx, cz) || []) : [];
    if (!trees.length) stats.treeless++;
    const placed = placeForage(sample, cx, cz, trees, season, seed, {
      abundance: opts.abundance, scale: opts.scale, heightAt,
    });
    const g = new THREE.Group();
    g.name = `forage:${key}`;
    const entry = { key, cx, cz, group: g, meshes: new Map(), recs: [] };
    for (const p of placed) entry.recs.push({ ...p, key, chunk: key, harvestedUntil: 0 });
    group.add(g);
    chunks.set(key, entry);
    stats.chunks = chunks.size;
    stats.records += entry.recs.length;
    for (const rec of entry.recs) stats.plants += rec.count;
    drawChunk(entry);
    return entry;
  }

  function dropChunk(key) {
    const entry = chunks.get(key);
    if (!entry) return;
    for (const m of entry.meshes.values()) { entry.group.remove(m); m.dispose?.(); }
    entry.meshes.clear();
    group.remove(entry.group);
    stats.records -= entry.recs.length;
    for (const rec of entry.recs) stats.plants -= rec.count;
    chunks.delete(key);
    stats.chunks = chunks.size;
  }

  function rebuildAll() {
    const keys = [...chunks.keys()].map((k) => k.split(',').map(Number));
    for (const [a, b] of keys) dropChunk(`${a},${b}`);
    for (const [a, b] of keys) addChunk(a, b);
  }

  /**
   * A mesh whose whole kind has been picked has `count` 0, and three's buffer
   * renderer returns before issuing a draw for an instance count of zero. So
   * an empty mesh is not a draw call and is not counted as one.
   */
  function drawCalls() {
    let n = 0;
    for (const e of chunks.values()) for (const m of e.meshes.values()) if (m.count > 0) n++;
    return n;
  }

  return {
    group, stats, material,
    get season() { return season; },

    /** Pickables standing: one per bunch, which is what a click can take. */
    get count() { return [...chunks.values()].reduce((n, e) => n + e.recs.filter((r) => !r.harvestedUntil).length, 0); },

    /** Plants standing, which is what the eye sees and the instancing draws. */
    get plants() {
      let n = 0;
      for (const e of chunks.values()) for (const r of e.recs) if (!r.harvestedUntil) n += r.count;
      return n;
    },
    get chunkCount() { return chunks.size; },

    /** Every live pickable, for a test or a minimap. */
    records() {
      const out = [];
      for (const e of chunks.values()) for (const r of e.recs) if (!r.harvestedUntil) out.push(r);
      return out;
    },

    /**
     * How many of each kind are standing right now, for the HUD. Pickables by
     * default; `tally({ plants: true })` counts the plants inside them, which
     * is a bigger number and a different question.
     */
    tally(o = {}) {
      const out = {};
      for (const e of chunks.values()) {
        for (const r of e.recs) {
          if (r.harvestedUntil) continue;
          out[r.id] = (out[r.id] || 0) + (o.plants ? r.count : 1);
        }
      }
      return out;
    },

    /**
     * Stream the 3x3 ring around the player, and rebuild the whole layer when
     * the season turns. Cheap when nothing moved: two integer compares.
     */
    update(px, pz, nextSeason = null, now = undefined) {
      let changed = false;
      if (nextSeason && SEASONS.includes(nextSeason) && nextSeason !== season) {
        season = nextSeason;
        rebuildAll();
        changed = true;
      }
      this.regrow(now);
      const cx = Math.floor(px / CHUNK), cz = Math.floor(pz / CHUNK);
      if (!changed && cx === lastCX && cz === lastCZ) { stats.drawCalls = drawCalls(); return false; }
      lastCX = cx; lastCZ = cz;
      const need = new Set();
      for (let i = -RING; i <= RING; i++) for (let j = -RING; j <= RING; j++) need.add(`${cx + i},${cz + j}`);
      for (const key of [...chunks.keys()]) if (!need.has(key)) dropChunk(key);
      for (const key of need) {
        if (chunks.has(key)) continue;
        const [a, b] = key.split(',').map(Number);
        addChunk(a, b);
      }
      stats.drawCalls = drawCalls();
      return true;
    },

    /**
     * What is under the ray. Returns `{ rec, id, point, distance }`, never a
     * bare instance id: the record IS the identity, so a rebuild between the
     * hover and the click cannot make the two disagree.
     */
    pick(raycaster) {
      if (!raycaster || typeof raycaster.intersectObjects !== 'function') return null;
      const meshes = [];
      for (const e of chunks.values()) for (const m of e.meshes.values()) meshes.push(m);
      if (!meshes.length) return null;
      const hits = raycaster.intersectObjects(meshes, false);
      for (const h of hits) {
        const map = h.object.userData.forageMap;
        if (!map || h.instanceId == null) continue;
        const rec = map[h.instanceId];
        if (!rec || rec.harvestedUntil) continue;
        return { rec, id: rec.id, point: h.point, distance: h.distance };
      }
      return null;
    },

    /** The nearest live record within `r` metres of a point. For a keyboard pick. */
    nearest(x, z, r = 3) {
      let best = null, bd = r * r;
      for (const e of chunks.values()) {
        for (const rec of e.recs) {
          if (rec.harvestedUntil) continue;
          const d = (rec.x - x) ** 2 + (rec.z - z) ** 2;
          if (d < bd) { bd = d; best = rec; }
        }
      }
      return best;
    },

    /**
     * Picked. The record is not deleted: it is marked, so the same patch grows
     * back in the same place, which is what makes a valley worth remembering.
     *
     * It stops being drawn and stops being picked THIS FRAME, through
     * `hideInstance`, which swaps its instance slot with the last live one and
     * takes the count down. `drawChunk` is only the fallback for a record whose
     * mesh has since been rebuilt without it.
     */
    remove(rec, now = undefined) {
      if (!rec || rec.harvestedUntil) return false;
      const entry = chunks.get(rec.chunk);
      rec.harvestedUntil = at(now) + REGROW_MS;
      stats.harvested++;
      if (entry && !hideInstance(entry, rec)) drawChunk(entry);
      stats.drawCalls = drawCalls();
      return true;
    },

    /**
     * Anything whose clock has run out comes back, the same way it went: its
     * instance slot is handed back and the count goes up by one. Cheap to call
     * every frame, and it rebuilds a chunk only when a record's mesh has gone.
     */
    regrow(now = undefined) {
      const t = at(now);
      let back = 0;
      for (const e of chunks.values()) {
        let rebuild = false;
        for (const rec of e.recs) {
          if (!rec.harvestedUntil || t < rec.harvestedUntil) continue;
          rec.harvestedUntil = 0;
          back++;
          if (!showInstance(e, rec)) rebuild = true;
        }
        if (rebuild) drawChunk(e);
      }
      if (back) stats.drawCalls = drawCalls();
      return back;
    },

    /** Force the season, for the dev bench. */
    setSeason(s) {
      if (!SEASONS.includes(s) || s === season) return false;
      season = s;
      rebuildAll();
      stats.drawCalls = drawCalls();
      return true;
    },

    dispose() {
      for (const key of [...chunks.keys()]) dropChunk(key);
      group.parent?.remove(group);
      material.dispose();
    },
  };
}
