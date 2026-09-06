// The shape of the world, and Kaldera laid over it: nine realms, ninety five
// places inside them, and the Caldera Sea in the east. Pure data and pure
// functions: no THREE, no DOM.
//
// Read `docs/mmo/09-WORLD-ZONES.md` first; this file is that document as code.
// The realms themselves live in `src/mmo/realms.js`, which is the sheet the
// codex, the painted map and this table are all read from. THIS FILE INVENTS NO
// PLACE. Every row below is one row of that sheet, turned into a disc.
//
// ---- the bounded continent ----------------------------------------------
//
// The field in field.js is endless. That is a property of the noise, not a
// promise to the player, and an endless world cannot be mapped, cannot be
// authored and cannot say where the dangerous part is. So the world is bounded:
// one continent inside a 16 km square, the origin at its centre, ringed by an
// ocean that no boat crosses.
//
// The boundary is a COAST, not a seam and not a wall. Past `coastRadiusAt` the
// ground slides smoothly down to OCEAN_FLOOR, so the last thing you walk to is
// a beach and the last thing you see is water. Nothing wraps. A wrap would put
// the same hill in front of you twice and tell the player the world is a lie;
// a shoreline tells the truth, which is that the world has an edge and it is
// over there.
//
//   WORLD_HALF          8000 m: at this radius the ground is at OCEAN_FLOOR
//   coastRadiusAt(x,z)  where the ground starts sinking, wobbled by angle so
//                       the coast is not a drawn circle
//   oceanBeyond(x, z)   0 inland, 1 at and past WORLD_HALF, smooth between
//   insideWorld(x, z)   within WORLD_HALF of the origin
//   clampToWorld(x, z)  the same point, pulled back to the last dry radius
//
// ---- the Caldera Sea -----------------------------------------------------
//
// The world has a second shore, and it is inland. `SEA` is a disc east of the
// origin, taken from the Sunken Kingdom's own centre and radius, where the
// ground falls to SEA.floor and the land mask fades exactly the way it does at
// the outer coast, so the sea ends in a beach on its landward side too. `REEFS`
// are the handful of points where the drowned city's towers break the surface,
// and they are dry ground standing in open water. `SEA.edge` stands well
// outside HEART_SAFE, so nothing the sea does can reach a save's own ground.
//
// ---- zones ---------------------------------------------------------------
//
// A zone is a disc: a centre, a radius it owns outright and a soft edge over
// which it lets go. There are two ranks of them:
//
//   a REALM     one of the nine, `parent: null`. It carries the bias: a biome
//               override, a climate nudge, the danger band and the ore band.
//   a SUBZONE   one place inside a realm, `parent: <realm id>`. It carries a
//               name, a line and a footprint, and no bias of its own at all.
//
// `zoneAt` returns the DEEPEST zone at a point, so standing on the Glass Road
// says the Glass Road and hands you the Ashen Throne through `parent`.
// `zoneBias` resolves the bias up the chain, so a subzone can never punch a
// hole in the realm it stands in: the desert stays a desert inside the Salt
// Pans, and the weight the override is gated on is always the REALM's weight.
//
// ---- the promise about the heart ----------------------------------------
//
// Saves already exist. A character standing near the origin must find that
// ground unmoved after this file lands. So:
//
//   No zone carrying a biome override or a climate nudge may WIN anywhere
//   within HEART_SAFE (1500 m) of the origin, no authored site may stand there,
//   and the Caldera Sea's outermost reach must stay outside it. `auditZones()`
//   measures all three at import, on a grid, rather than inferring them from
//   radii: once realms nest and overlap, a radial rule is wrong in both
//   directions.
//
// The Greenwold, which holds the heart, carries neither a biome nor a climate.
// It is a name, a danger band and an ore band over ground the field already
// made. `field.test.mjs` samples a 2 km square about the origin and proves the
// ground did not move: the digest is the one taken before zones.js existed.

import { smoothstep } from './noise.js';
import { REALMS, REALM_BY_ID, PLACES } from '../mmo/realms.js';

// --------------------------------------------------------------- the edge --

/** Half the world's width. The ground is at OCEAN_FLOOR at this radius. */
export const WORLD_HALF = 8000;
/** How deep the ring ocean is. Deeper than any shelf the field makes. */
export const OCEAN_FLOOR = -30;
/** The mean radius at which land begins to fall away. */
export const COAST_INNER = 7100;
/** Inside this radius `oceanBeyond` is exactly 0 and returns without any maths. */
export const COAST_MIN = 6500;
/** No bias may win nearer the origin than this, and no site may stand there. */
export const HEART_SAFE = 1500;
/** A realm's centre must stand at least this far inside the world's edge. */
export const COAST_KEEP = 1000;
/** A subzone's centre may go nearer the rim than that, but not past this. */
export const SUB_COAST_KEEP = 500;

// The coast wobble: three harmonics of the bearing, so the shoreline bulges and
// bays instead of ruling a circle. The amplitudes sum to COAST_WOBBLE, which is
// what keeps the innermost possible coast outside COAST_MIN.
const WOBBLE = [[0.030, 3, 0.7], [0.020, 5, -1.9], [0.012, 8, 2.6]];
export const COAST_WOBBLE = WOBBLE.reduce((a, w) => a + w[0], 0);

/** Where the ground starts falling away, along the bearing of (x, z). */
export function coastRadiusAt(x, z) {
  const a = Math.atan2(z, x);
  let w = 0;
  for (const [amp, k, ph] of WOBBLE) w += amp * Math.sin(k * a + ph);
  return COAST_INNER * (1 + w);
}

/**
 * How much of this point is ring ocean: 0 inland, 1 at and beyond WORLD_HALF.
 * field.js lerps the ground toward OCEAN_FLOOR by exactly this much, and fades
 * the land mask and the rivers out by the same amount so the world ends in a
 * beach and then in water.
 */
export function oceanBeyond(x, z) {
  const r2 = x * x + z * z;
  if (r2 < COAST_MIN * COAST_MIN) return 0;          // the whole inland world, free
  return smoothstep(coastRadiusAt(x, z), WORLD_HALF, Math.sqrt(r2));
}

/** Within the world's own radius. */
export function insideWorld(x, z) {
  return x * x + z * z <= WORLD_HALF * WORLD_HALF;
}

/**
 * The same point, pulled back onto the continent. A point already inside comes
 * back untouched, so this is free to call every frame.
 * `margin` is how far inside WORLD_HALF the clamp lands.
 */
export function clampToWorld(x, z, margin = 60) {
  const r2 = x * x + z * z;
  const lim = WORLD_HALF - margin;
  if (r2 <= lim * lim) return { x, z, moved: false };
  const r = Math.sqrt(r2) || 1;
  return { x: (x / r) * lim, z: (z / r) * lim, moved: true };
}

// --------------------------------------------------------- the Caldera Sea --

const SEA_REALM = REALM_BY_ID.sunkenkingdom;

/**
 * The inland sea, taken from the Sunken Kingdom's own disc.
 *
 *   full   inside this radius the ground is the sea floor outright
 *   edge   outside this radius NOTHING is touched, and the code that would
 *          touch it does not run: the same contract COAST_MIN keeps
 *   floor  how deep it is, shallower than the ring ocean because the drowned
 *          city is meant to be visible from a boat
 */
export const SEA = Object.freeze({
  x: SEA_REALM.x, z: SEA_REALM.z,
  full: SEA_REALM.r - 500,
  edge: SEA_REALM.r + 100,
  floor: -18,
});

/** How much of this point is the Caldera Sea: 1 in the deep, 0 outside SEA.edge. */
export function seaWithin(x, z) {
  const dx = x - SEA.x, dz = z - SEA.z;
  const d2 = dx * dx + dz * dz;
  if (d2 >= SEA.edge * SEA.edge) return 0;           // the whole rest of the world, free
  return 1 - smoothstep(SEA.full, SEA.edge, Math.sqrt(d2));
}

/**
 * The reefs: where the drowned city's tallest towers break the surface. Dry
 * ground standing in open water, and the only ground in the Sunken Kingdom a
 * player can stand on before the deep is taken. `top` is metres above sea level
 * at the middle, `core` how much of the reef is flat before it falls away.
 */
// A reef's top is kept UNDER the 2.2 m the biome chain calls a beach, on
// purpose: a reef is coral, sand and the stump of a tower, not a green hill in
// the middle of a sea. `core` is small enough that there is real slope between
// the flat middle and the water, which is what lets a mine stand on one with
// its cuts up the hill from its yard.
export const REEFS = Object.freeze([
  { id: 'reefstair', x: SEA.x - 430, z: SEA.z - 250, r: 280, core: 165, top: 2.05 },
  { id: 'pearlreef', x: SEA.x + 250, z: SEA.z - 560, r: 320, core: 190, top: 2.10 },
  { id: 'palacereef', x: SEA.x + 70, z: SEA.z + 480, r: 280, core: 165, top: 2.05 },
  { id: 'bellreef', x: SEA.x - 650, z: SEA.z + 400, r: 190, core: 110, top: 1.95 },
  { id: 'glowreef', x: SEA.x + 620, z: SEA.z + 120, r: 260, core: 150, top: 1.95 },
].map(Object.freeze));

/** How much of this point is reef: 1 on the flat top, 0 off it. */
export function reefWithin(x, z) {
  let w = 0;
  for (let i = 0; i < REEFS.length; i++) {
    const r = REEFS[i];
    const dx = x - r.x, dz = z - r.z;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r.r * r.r) continue;
    const k = 1 - smoothstep(r.core, r.r, Math.sqrt(d2));
    if (k > w) w = k;
  }
  return w;
}

/** The height a reef lifts its middle to. field.js lerps toward this. */
export function reefTopAt(x, z) {
  let best = 0, top = 0;
  for (let i = 0; i < REEFS.length; i++) {
    const r = REEFS[i];
    const dx = x - r.x, dz = z - r.z;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r.r * r.r) continue;
    const k = 1 - smoothstep(r.core, r.r, Math.sqrt(d2));
    if (k > best) { best = k; top = r.top; }
  }
  return { w: best, top };
}

/** The reef the point stands on, or null. Used by the audits and the tests. */
export function reefAt(x, z) {
  for (const r of REEFS) if (Math.hypot(x - r.x, z - r.z) < r.r) return r;
  return null;
}

/**
 * The Thousand Isles: the Saltmarch's seaward half is an archipelago rather
 * than a shore. It is a noise driven island field, alive only where the
 * Saltmarch's own disc and the Caldera Sea overlap, which is a lens about a
 * kilometre wide between the fen and the open water.
 *
 *   top   an islet's height, kept UNDER the field's 2.2 m beach line on
 *         purpose, so an islet is sand and palm and not a meadow with a coast
 */
const MARCH = REALM_BY_ID.saltmarch;
export const ARCHIPELAGO = Object.freeze({
  x: MARCH.x, z: MARCH.z,
  near: MARCH.r, far: MARCH.r + 1000,
  wave: 130, lo: 0.02, hi: 0.40, top: 1.9, shoal: -4,
});

/**
 * How much of the Saltmarch's archipelago reaches this point, before the noise.
 * It is the overlap of two falloffs and nothing else: how much of the point is
 * the Caldera Sea, and how near it is to the Saltmarch. The band that comes out
 * is a crescent of shallow water on the sea's fen side, which is exactly where
 * the sheet puts the Thousand Isles, and the open water in the middle of the
 * sea, over the drowned city, is left alone.
 */
export function archipelagoWithin(x, z) {
  const dx = x - ARCHIPELAGO.x, dz = z - ARCHIPELAGO.z;
  const d2 = dx * dx + dz * dz;
  if (d2 >= ARCHIPELAGO.far * ARCHIPELAGO.far) return 0;
  const sea = seaWithin(x, z);
  if (sea <= 0) return 0;
  return sea * (1 - smoothstep(ARCHIPELAGO.near, ARCHIPELAGO.far, Math.sqrt(d2)));
}

// -------------------------------------------------------------- the bands --

// Danger and ore bands are shared frozen arrays, never rebuilt, because
// `field.sampleAt` hands one back on every sample and a fresh array per terrain
// vertex would be tens of thousands of allocations a chunk.
const bandCache = new Map();
const band = (...t) => {
  const k = t.join(',');
  let v = bandCache.get(k);
  if (!v) { v = Object.freeze(t); bandCache.set(k, v); }
  return v;
};

/** The tier band of open country that no zone claims: it rises with distance. */
export const WILD_BANDS = Object.freeze([
  [2000, band(1, 1)],
  [3600, band(1, 2)],
  [5200, band(2, 3)],
  [6600, band(3, 4)],
  [Infinity, band(4, 5)],
]);

/** What ore unclaimed ground carries. The low three, as the ore document says. */
export const WILD_ORE = band('copper', 'tin', 'iron');

/** The ore ladder, poorest first. Every one of these has to be reachable. */
export const ORE_LADDER = Object.freeze(['copper', 'tin', 'iron', 'silver', 'coldiron', 'emberite', 'rimesteel', 'verdite', 'voidrock', 'starfall']);

/** The danger band of open country at this radius from the origin. */
export function wildDanger(x, z) {
  const r = Math.hypot(x, z);
  for (const [lim, b] of WILD_BANDS) if (r < lim) return b;
  return WILD_BANDS[WILD_BANDS.length - 1][1];
}

// ------------------------------------------------------------- the realms --

// One row per realm of Kaldera, keyed by the id in realms.js. The realm's
// centre, radius, name, danger band and places all come from that sheet; what
// lives here is only what the ENGINE needs and the sheet does not carry: how
// soft the edge is, which of the engine's eight biomes the realm's own biome
// word means, the climate nudge, the ore band, and the three word name the
// banner puts in small caps under a subzone.
//
// THE ENGINE HAS EIGHT BIOMES: ocean, beach, meadow, boreal, desert, sakura,
// mountain, snow. The sheet asks for `fen`, `graveyard` and `crater`, which are
// none of them and would each need a palette, a tree mix, a grass row, a map
// colour and a terrain layer set in five files this table does not own. Until
// somebody writes those:
//
//   fen        no override at all. A warm wet climate nudge, and the Caldera
//              Sea's own shore does the rest: the Saltmarch's seaward half is
//              genuinely beach because it genuinely stands at a waterline.
//   graveyard  `desert`, whose tree mix is three quarters dead trees, under a
//              cold dry climate. A grey plain with bone white trees on it.
//   crater     `mountain`, the only override that gives bare rock at sea level,
//              under the hottest driest climate in the world.
//
// Both approximations are named in `docs/mmo/09-WORLD-ZONES.md` so that nobody
// reports them as finished.
//
// ---- relief ---------------------------------------------------------------
//
// Five of the nine realms are not the ground the noise made. The Ember Wastes
// are tables with cliff sides, the Stormpeaks are terraces, the Ashen Throne is
// a crater with a rim around it, Frostreach rises onto a glacier shelf and the
// Sunken Kingdom's coast has stacks standing out of the water. Each of those is
// declared here, on the realm's own row, as a `relief`; `field.js` is the only
// file that reads it and the only file that knows where the ground is.
//
// A relief row is read by `field.js` as:
//
//   kind     mesa | cliffs | crater | glacier | karst
//   h        metres the relief lifts, a number or a [lo, hi] band
//   cell     metres between one table and the next, and `chance` how often a
//            cell holds one at all
//   r        the radius of a table, [lo, hi]
//   bare     the realm's own biome override outranks the snow line. An ash rim
//            80 m up is black rock and not a snow cap
//
// How steep a wall is is NOT declared here. `field.RELIEF_GRADE` decides it for
// every realm at once, in metres of rise per metre of ground, and the run of a
// wall is its own height over that number, so a 15 m terrace and an 80 m crater
// rim are exactly as steep as each other and the world has one figure to hold
// to. `field.RAMP_GRADE` does the same for the one way up each of them has.
//
// Nothing here reaches the heart: `heartFade` is zero inside HEART_SAFE, and
// the nearest of these five realms starts 1688 m from the origin anyway. The
// digest in `field.test.mjs` is the proof, and it is unchanged.
const REALM_RELIEF = {
  emberwastes: {
    kind: 'mesa', h: [20, 40], cell: 600, r: [105, 195], chance: 0.62,
  },
  stormpeaks: {
    // Two lattices of one terrace each, so the ground steps 0, 15, 30 m up.
    kind: 'cliffs', step: 15, cell: 700, r: [190, 340], chance: 0.62,
    // and the riders' hall stands on its own plateau, sixty metres up, with the
    // landing steps cut into the south face
    plateau: { place: 'eyrie', r: 175, h: 60, run: 14, ramp: 190, bearing: 0 },
  },
  ashenthrone: {
    // A ring about the throne, wide enough that the Ashen Gate stands on it and
    // the Legion's outer works stand below it on the outside.
    kind: 'crater', at: 'throneofash', rim: 1432, crest: 34, h: 80,
    // the way up is the bearing of the gate: on that heading the outer face is
    // stretched from a wall into a road, and it is the only way onto the rim
    rampAt: 'ashengate', rampArc: 0.30, bare: true,
  },
  frostreach: {
    // No walls at all: a shelf that rises toward the far side of the realm.
    kind: 'glacier', h: 46,
  },
  sunkenkingdom: {
    // Stacks, and only in the band where the Caldera Sea is letting go of the
    // shore. Inside SEA.full the water stays open over the drowned city.
    kind: 'karst', h: [9, 16], cell: 195, r: [18, 32], chance: 0.30,
  },
};

const REALM_STYLE = {
  greenwold: {
    // The Greenwold is farmland: its own biome, since 2026-09-06 when the heart
    // moved with the coast. Before that it carried nothing so old saves' ground
    // would not change; desert and pine patches from the climate noise sat in
    // the wheat.
    edge: 600, biome: 'meadow', climate: null,
    ore: band('copper', 'tin'), short: 'the Greenwold',
  },
  verdant: {
    edge: 500, biome: 'sakura', climate: { temp: 0.04, moist: 0.22 },
    ore: band('copper', 'tin', 'iron', 'verdite'), short: 'Verdant Deep',
  },
  saltmarch: {
    edge: 550, biome: null, climate: { temp: 0.16, moist: 0.34 },
    ore: band('copper', 'tin', 'iron'), short: 'the Saltmarch',
  },
  emberwastes: {
    edge: 550, biome: 'desert', climate: { temp: 0.30, moist: -0.34 },
    ore: band('iron', 'silver', 'coldiron'), short: 'Ember Wastes',
  },
  stormpeaks: {
    // The override AND a hard cold nudge. The ground under the Stormpeaks is
    // not mountainous in this seed (its own centre stands at 18 m), so without
    // `mountain` the realm of the dragonriders' peak would be heath. The nudge
    // is what makes the country AROUND the override read as highland: the
    // climate speaks at any weight, the override only at half the realm's, so
    // the outer ring is black pine and the middle is granite.
    edge: 550, biome: 'mountain', climate: { temp: -0.30, moist: 0.10 },
    ore: band('iron', 'silver', 'coldiron'), short: 'the Stormpeaks',
  },
  boneyard: {
    edge: 550, biome: 'desert', climate: { temp: -0.06, moist: -0.34 },
    ore: band('iron', 'silver', 'coldiron'), short: 'the Boneyard',
  },
  frostreach: {
    edge: 550, biome: 'snow', climate: { temp: -0.42, moist: 0 },
    ore: band('coldiron', 'rimesteel'), short: 'Frostreach',
  },
  sunkenkingdom: {
    // No bias at all: the sea disc in field.js already makes this water, and a
    // climate nudge under a sea would be a key nothing could ever read.
    edge: 450, biome: null, climate: null,
    ore: band('silver', 'coldiron'), short: 'the Sunken Kingdom',
  },
  ashenthrone: {
    edge: 550, biome: 'mountain', climate: { temp: 0.34, moist: -0.30 },
    ore: band('emberite', 'voidrock', 'starfall'), short: 'the Ashen Throne',
  },
};

// ----------------------------------------------------------- the subzones --

// Where each of the ninety five places stands and how much ground it owns:
// `[x, z, r]` in metres. EVERY ONE OF THESE WAS MEASURED, NOT CHOSEN. A probe
// laid them out by kind (a hub near the middle of its realm, mega structures
// and landmarks in the second ring, open country in the third, dungeons, mines
// and camps out toward the rim), then walked the real field and moved any that
// fell in water, in a river, into a sibling by more than a third of its own
// area, or out of reach of a hundred metre flood fill from the origin.
// `zones.test.mjs` walks the same ground again and fails if one moves.
//
// Two exceptions, both deliberate and both driven the other way: the Sunken
// Kingdom's places stand in the Caldera Sea, and the Saltmarch's seaward places
// stand among the Thousand Isles. Those are reached by boat, so the flood fill
// has nothing to say about them; what is checked instead is that every building
// among them is DRY, which in the sea means standing on a named reef.
const LAYOUT = {
  // The Greenwold
  hearthhome: [749, 1579, 330],       // hub
  // Moved by V1. The Mill Run stood 1100 m from the origin, inside the heart
  // and inside a cell a rolled cave already held: giving it the water mill its
  // own sentence promises would have taken that cave's mound out of the ground
  // a save is standing on. It now stands on a river bank 16 m from the water,
  // 1834 m out, on ground a walk from home reaches, in a cell nothing wanted.
  millrun: [-1660, 780, 330],         // landmark
  oldcellars: [363, 1603, 330],       // dungeon
  beechhangar: [-1319, 55, 330],      // wild
  kingsroad: [-727, -1276, 330],      // road
  greenwoldpits: [-108, 1720, 330],   // mine
  waystones: [231, 804, 330],         // megastructure
  highwaymanshollow: [353, -1801, 330],// camp
  sunkenchapel: [-124, -1755, 330],   // ruin
  // Verdant Deep
  canopycourt: [1329, 3585, 300],     // hub
  templeoffaces: [703, 3974, 300],    // megastructure
  templeoffaces_deep: [2697, 3600, 300],// dungeon
  blossomfall: [213, 2513, 300],      // wild
  rootriver: [2071, 3906, 300],       // wild
  sunkenshrine: [1272, 1814, 300],    // shrine
  verditehollow: [1139, 4592, 300],   // mine
  hanginggardens: [-101, 3533, 300],    // landmark
  moonpool: [2021, 3243, 300],        // landmark
  spiderwells: [2209, 2538, 300],     // cave
  // The Saltmarch and the Thousand Isles
  // Moved by R1, 2026-09-06, when the continent mask changed and the fen it
  // stood on became dry land. A pirate port has to stand on the sea: the water
  // it faced was 114 m off and it was a RIVER, so `seawardOf` found a channel
  // and the quay stood on a bank looking at it. It now stands on the north
  // shore of the Caldera Sea, water 90 m out east south east, on the bearing
  // the spec was written for. 992 m, into a cell nothing else wanted.
  // Moved by R1, 2026-09-06, when the continent mask changed and the fen this
  // stood in became dry land. A pirate port has to stand on the sea. The water
  // `seawardOf` found off the old spot was 114 m away and it was a RIVER, so
  // the quay looked across a bank at a channel. It stands on the Caldera Sea's
  // north shore now, eleven metres of water 90 m out east south east, which is
  // the bearing the port spec was written for, seven degrees off it. 992 m,
  // into a cell nothing else wanted. Its subzone came in from 330 m to 260 so
  // that the whole of it still fits inside the Saltmarch's own disc.
  redqueensharbour: [4660, 720, 260],// megastructure
  drownedmill: [4462, 2508, 330],     // hub
  sedgesea: [5657, 1587, 330],        // wild
  leviathansrest: [3966, 2185, 330],  // dungeon
  thousandisles: [6164, 2623, 330],   // sea
  wreckward: [4553, 4177, 330],       // ruin
  saltcut: [4430, 1081, 330],         // mine
  tidewalk: [5657, 3717, 330],        // road
  smugglerscays: [3170, 3252, 330],   // camp
  wisplanterns: [3980, 3581, 330],    // wild
  krakenshoals: [3199, 2443, 330],    // sea
  // Ember Wastes
  lastwell: [5165, -3175, 315],       // hub
  // Moved 152 m by V1: the walking city knelt at 0.49 m, which is the
  // waterline, on a spit no walk from the Last Well reaches.
  brasscity: [4196, -3029, 315],      // megastructure
  brasscity_works: [5874, -1661, 315],// dungeon
  firstfire: [3691, -3478, 315],      // dungeon
  glassroad: [6408, -3406, 315],      // road
  saltpans: [5433, -4549, 315],       // wild
  embercut: [4459, -1802, 315],       // mine
  cultistcamp: [6606, -2622, 315],    // camp
  miragepalace: [4905, -3955, 315],   // landmark
  buriedlibrary: [6110, -4177, 315],  // dungeon
  banditridge: [4056, -4070, 315],    // camp
  singingdunes: [5196, -2032, 315],   // wild
  // The Stormpeaks
  cairnfoot: [1175, -4556, 315],      // hub
  cairnroad: [227, -3191, 315],       // road
  legionpass: [359, -5614, 315],      // camp
  eyrie: [1611, -3944, 315],          // megastructure
  eyrieroost: [1579, -5906, 315],     // dungeon
  blacklochs: [1316, -2945, 315],     // wild
  thundershaft: [2258, -4489, 315],   // mine
  skybridge: [2141, -3469, 315],      // landmark
  stormanvil: [590, -4941, 315],      // landmark
  echochasm: [1074, -5321, 315],      // wild
  drownedhall: [-223, -4191, 315],    // ruin
  // The Boneyard
  // Moved 280 m west by V1: the nine skeletons stood on mud at -0.4 m, which
  // reads as a tideline and not as a place to lie down. This is the nearest dry
  // ground of the same country.
  ninefall: [-5000, 2197, 315],       // landmark
  skulllodge: [-3944, 2034, 315],     // megastructure
  skulllodge_throat: [-3223, 112, 315],// dungeon
  ridersrest: [-3704, 1238, 315],     // hamlet
  ridertombs: [-5414, 302, 315],      // ruin
  ashsea: [-5293, 1490, 315],         // wild
  marrowmine: [-2652, 1654, 315],     // mine
  ribcathedral: [-4649, 376, 315],    // megastructure
  hunterscamps: [-4210, -322, 315],   // camp
  boneorchard: [-3121, 1129, 315],    // wild
  // Frostreach
  coldseat: [-2186, -5171, 330],      // hub
  icevault: [-1337, -5588, 330],      // megastructure
  icevault_deep: [-3248, -4651, 330], // dungeon
  whitepines: [-686, -4244, 330],     // wild
  frozenfleet: [-1703, -3472, 330],   // ruin
  rimecut: [-2117, -5966, 330],       // mine
  longnightcamp: [-2995, -3734, 330], // camp
  aurorashelf: [-1061, -5004, 330],    // landmark
  icefall: [-802, -6131, 330],        // cave
  hotsprings: [-2502, -4443, 330],    // landmark
  mammothsteppe: [-3048, -5522, 330], // wild
  // The Sunken Kingdom
  // Swapped with the Coliseum by V1. The sheet says the Reef Stair is steps
  // climbing out of the sea ONTO A REEF and that the Coliseum is an arena ON
  // THE SEA FLOOR; the table had them the other way round, the stair in
  // eighteen metres of water and the arena dry on the reef. Now each stands on
  // the ground its own sentence asks for, and they have only exchanged cells.
  reefstair: [3512, -721, 225],       // landmark
  drownedpalace: [4200, 107, 225],    // dungeon
  coliseum: [3735, -1260, 225],       // megastructure
  theglow: [5178, 102, 225],           // landmark
  avenues: [4711, -1219, 225],        // wild
  pearlreef: [4195, -846, 225],       // hamlet
  pearlbeds: [4694, -114, 225],       // mine
  airgardens: [3492, 178, 225],       // landmark
  drownedbell: [4696, -665, 225],     // megastructure
  whaleroad: [5255, -543, 225],       // sea
  // The Ashen Throne
  // Moved by R1 for the same reason and on the same day. The Legion's harbour
  // faced a river 112 m away to the south west; it now stands on the Caldera
  // Sea's east shore with sixteen metres of water 86 m out to the west, which
  // is the bearing the spec measured. 1154 m, and it is still the realm's own
  // ground and alone in its cell.
  // Moved by R1 for the same reason and on the same day: the water off the old
  // spot was a river 112 m to the south west. The Legion's harbour now stands
  // on the Caldera Sea's east shore with sixteen metres of water 86 m out due
  // west, thirty eight degrees off the bearing the spec measured and inside
  // the arc it allows. 1154 m, still the realm's own ground, alone in its cell.
  cinderport: [5520, -640, 255],      // town
  outerworks: [5874, -376, 255],      // landmark
  ashengate: [5982, 178, 255],        // megastructure
  throneofash: [7372, -168, 255],     // dungeon
  glassslopes: [6049, -1223, 255],    // wild
  cindercut: [6966, -254, 255],       // mine
  steamingshore: [6825, -857, 255],   // landmark
  lavafalls: [7379, -683, 255],       // landmark
  slagcamps: [7314, -1223, 255],      // camp
  // Moved 242 m by V1: the arch stood on ground cut off from the rest of the
  // crater by water, so nobody could ever have walked onto it.
  obsidianbridge: [6909, 601, 255],   // landmark
  heartcages: [6344, 722, 255],       // landmark
};

// The engine site kinds each place kind becomes. A place of a kind not in here
// is a region and nothing else: it has a subzone, a name and a line, and no
// building stands in it.
//
// `megastructure` and `landmark` are here because V1 gave them bodies: a
// megalith you can see from a kilometre at every megastructure place, and a
// body of its own kind at every landmark (a mill at the Mill Run, a cairn at
// Ninefall, a well, a pool, an anvil). `site_models.buildSiteMarker` hands both
// kinds to `megalith_models.buildMegalith`.
const SITE_KIND = {
  hub: 'town', town: 'town', hamlet: 'hamlet', dungeon: 'dungeon',
  mine: 'mine', cave: 'cave', ruin: 'ruin', shrine: 'shrine', camp: 'camp',
  megastructure: 'megastructure', landmark: 'landmark',
};

// A place whose sheet kind is not the kind it is built as. The Red Queen's
// Harbour is written down as a mega structure because it is one, a pirate city
// across a dozen islets; it is also the only town on the isles, so it is a town
// here, and this table is consulted FIRST for that reason. It is why the
// Saltmarch has no megalith and the Sunken Kingdom has two.
const EXTRA_SITE = {
  redqueensharbour: 'town',
  // P1: a wild or a road place with a painting needs a site row to be handed
  // to site_models at all; pad-less landmarks, built from their plans
  beechhangar: 'landmark', kingsroad: 'landmark',
};

/**
 * The seven the programme calls towns, which get a precinct rather than a
 * village green: room for walls, a castle and a shop district later.
 * `FLAT_R.town` (46 m) is the old rolled town and stays what it was.
 */
export const TOWN_PRECINCT_R = 120;
const PRECINCT = new Set([
  'hearthhome', 'canopycourt', 'redqueensharbour', 'lastwell',
  'cairnfoot', 'coldseat', 'cinderport',
]);

// A mine takes its ore from the sheet's own sentence about it and not from the
// realm's band, which is why the Verdite Hollow carries verdite in a realm
// whose open country mostly does not, and why every one of the ten ores is on
// the surface of some hillside somewhere.
const MINE_ORE = {
  greenwoldpits: ['copper', 'tin'],
  verditehollow: ['iron', 'verdite'],
  saltcut: ['iron', 'silver'],
  embercut: ['iron', 'emberite'],
  thundershaft: ['silver', 'coldiron'],
  marrowmine: ['coldiron', 'voidrock'],
  rimecut: ['coldiron', 'rimesteel'],
  pearlbeds: ['silver', 'coldiron'],
  cindercut: ['emberite', 'voidrock', 'starfall'],
};

/**
 * The pad a named place lays, where the kind's own default is the wrong number.
 *
 * Most of the twenty seven megaliths and landmarks V1 built stand on the ground
 * as they found it and lay no pad at all: a bridge, a shelf, a mirage, a ring
 * of stones, a tower rising out of the sea. A pad of 0 means field.js does not
 * touch a metre of ground under them, which is what lets the Standing Hedge
 * stand inside the heart without moving it.
 *
 * A pad must fit inside its own site cell, because `field.sampleAt` asks the
 * point's own cell and nothing else (the one exception is the seven town
 * precincts, which field.js carries a short list of). Several of these places
 * stand near a cell border, so the numbers below are not a matter of taste:
 * `zones.test.mjs` measures every pad against the distance to its cell's edge.
 */
const SITE_FLAT_R = {
  // the painted places (P1): the ground each plan stands on, measured in P1.md
  millrun: 40, oldcellars: 16, greenwoldpits: 30, highwaymanshollow: 26, sunkenchapel: 32,
  beechhangar: 0, kingsroad: 0,
  // the megaliths
  waystones: 0,          // the Standing Hedge: nine stones on natural ground
  templeoffaces: 0,      // a cliff carved with faces; the cliff is the ground
  brasscity: 8,          // the yard the walking city kneels in
  eyrie: 12,             // the landing at the top of the plateau steps
  skulllodge: 10,
  ribcathedral: 12,
  icevault: 10,
  coliseum: 0,           // tiers standing in the sea off the reef
  drownedbell: 0,        // a tower rising out of the water
  ashengate: 14,         // the road under the gate, on the crater rim
  // the landmarks
  millrun: 8,            // the mill yard on the river bank
  hanginggardens: 0,
  moonpool: 6,
  miragepalace: 0,
  skybridge: 0,
  stormanvil: 6,
  ninefall: 0,
  aurorashelf: 0,
  hotsprings: 8,
  reefstair: 0,
  theglow: 0,
  airgardens: 0,
  outerworks: 10,
  steamingshore: 0,
  lavafalls: 0,
  obsidianbridge: 0,
  heartcages: 8,
};

/**
 * How far a place's BODY reaches from its own centre, where that is further
 * than the site marker system would keep it alive on the strength of the pad.
 *
 * Two of the twenty seven V1 built are wider than the ring of chunks the world
 * streams: the Standing Hedge is a ring of stones a mile across, which is the
 * sheet's own measurement, and the Obsidian Bridge is an arch two hundred
 * metres long. A player standing between two stones of the hedge is 805 m from
 * the site's centre and would see nothing at all.
 *
 * `authoredSites()` puts this on the row as `bodyR`, `megalith_models` builds
 * to exactly it, and `megalith_models.test.mjs` proves the two agree. The one
 * line in `sites.sitesNear` that makes a marker live that far out is quoted in
 * `docs/mmo/wiring/V1.md`; until it lands, both bodies still build, they simply
 * come and go with their centres.
 */
export const BODY_R = Object.freeze({ waystones: 811, obsidianbridge: 107 });

/**
 * The places that stand IN the water on purpose, and the only ones allowed to.
 *
 * The Sunken Kingdom is a drowned city under eighteen metres of the Caldera
 * Sea. Four of its places are written down as being on the sea floor or rising
 * out of it, and a rule that every authored site stands on dry ground would
 * either throw them out or drag them onto a reef where the sheet does not put
 * them. So they are named here, once, and `zones.test.mjs` drives the rule both
 * ways: these four are wet, and every other authored site in the world is not.
 */
export const STANDS_IN_WATER = Object.freeze(['coliseum', 'theglow', 'airgardens', 'drownedbell']);

/**
 * Whether the heart will have this site standing in it.
 *
 * The rule is the PAD and not the distance. A pad levels the ground under it,
 * and the ground under a save may not move; a site with `flatR` 0 lays nothing
 * down at all (field.js does not run the pad code for one), so it is a name and
 * a body on the hillside the seed made. The Standing Hedge is the one that
 * needs this, and it needs it because the sheet has always had the ring of
 * boundary stones in the Greenwold, 836 m from the origin.
 *
 * A pure predicate on purpose: `authoredSites()` is built once and frozen, so
 * `zones.test.mjs` drives this both ways here rather than by editing the table
 * under the audit.
 */
export const heartAllows = (site) => Math.hypot(site.x, site.z) >= HEART_SAFE || !(site.flatR > 0);

/** A biome override needs at least this much of its REALM's weight. */
export const BIOME_OVERRIDE_W = 0.5;

/** How much of a subzone's radius its soft edge is. */
export const SUB_EDGE = 0.35;

function buildZones() {
  const out = [];
  for (const realm of REALMS) {
    const st = REALM_STYLE[realm.id];
    if (!st) throw new Error(`zones: the realm "${realm.id}" has no style row`);
    out.push({
      id: realm.id, name: realm.name, short: st.short,
      x: realm.x, z: realm.z, r: realm.r, edge: st.edge,
      parent: null, ring: realm.ring, kind: 'realm',
      biome: st.biome, climate: st.climate,
      // the shape the realm insists on, or null. field.js is the only reader.
      relief: REALM_RELIEF[realm.id] || null,
      danger: band(realm.danger[0], realm.danger[1]),
      ore: st.ore,
      sites: [],
      line: realm.line,
    });
  }
  const byId = Object.fromEntries(out.map((z) => [z.id, z]));
  for (const pl of PLACES) {
    const lay = LAYOUT[pl.id];
    if (!lay) throw new Error(`zones: the place "${pl.id}" has no measured position in LAYOUT`);
    const parent = byId[pl.realm];
    const [x, z, r] = lay;
    out.push({
      id: pl.id, name: pl.name, short: parent.short,
      x, z, r, edge: Math.round(r * SUB_EDGE),
      parent: parent.id, ring: parent.ring, kind: pl.kind,
      // A subzone carries no bias of its own, ever. `zoneBias` resolves both of
      // these up the chain, so a subzone cannot punch a hole in its realm.
      // Relief belongs to the realm for the same reason.
      biome: null, climate: null, relief: null,
      danger: parent.danger, ore: parent.ore,
      sites: [],
      line: pl.geography,
    });
    const siteKind = EXTRA_SITE[pl.id] || SITE_KIND[pl.kind];
    if (!siteKind) continue;
    parent.sites.push({
      place: pl.id, kind: siteKind, name: pl.name, x, z,
      // undefined here means "whatever FLAT_R says for this kind"; that table
      // is declared below and authoredSites() is the one that resolves it
      flatR: PRECINCT.has(pl.id) ? TOWN_PRECINCT_R : SITE_FLAT_R[pl.id],
      ore: pl.kind === 'mine' ? band(...(MINE_ORE[pl.id] || parent.ore)) : null,
      levels: pl.levels || null,
      line: pl.geography,
    });
  }
  return out;
}

export const ZONES = buildZones();
export const ZONE = Object.fromEntries(ZONES.map((z) => [z.id, z]));
/** How many zones there are, so a caller can say the number without counting. */
export const ZONE_COUNT = ZONES.length;
/** The nine realms, in the sheet's order. */
export const REALM_ZONES = ZONES.filter((z) => !z.parent);
/** Every subzone, in the sheet's order. */
export const SUB_ZONES = ZONES.filter((z) => z.parent);

/**
 * The realms that reshape their own ground. `field.js` walks this and nothing
 * else, so a world with no relief pays for one empty loop.
 */
export const RELIEF_ZONES = REALM_ZONES.filter((z) => z.relief);

/** How much relief is allowed here: 0 inside the heart, 1 outside HEART_FADE. */
export const HEART_FADE = 400;
/**
 * The heart's own guard, and the only reason it can be stated in one line:
 * whatever a realm asks for, it is multiplied by this, and this is exactly zero
 * for every point a save could be standing on. The five realms that carry
 * relief start 1688 m from the origin, so this never even fires; it is here so
 * that a realm moved tomorrow cannot move the ground under a character.
 */
export function heartFade(x, z) {
  const d2 = x * x + z * z;
  if (d2 <= HEART_SAFE * HEART_SAFE) return 0;
  const reach = HEART_SAFE + HEART_FADE;
  if (d2 >= reach * reach) return 1;
  return smoothstep(HEART_SAFE, reach, Math.sqrt(d2));
}

const CHILDREN = new Map(REALM_ZONES.map((z) => [z.id, []]));
for (const z of SUB_ZONES) CHILDREN.get(z.parent).push(z);
/** The subzones of one realm, in the sheet's order. */
export const subZonesOf = (id) => CHILDREN.get(id) || [];

// ---------------------------------------------------------------- lookups --

/** How much of a zone this point is inside: 1 within r, 0 at r + edge. */
export function weightOf(zn, x, z) {
  const dx = x - zn.x, dz = z - zn.z;
  const d = Math.hypot(dx, dz);
  if (d <= zn.r) return 1;
  const reach = zn.r + zn.edge;
  if (d >= reach) return 0;
  return 1 - smoothstep(zn.r, reach, d);
}

/**
 * The zone (x, z) belongs to, and how strongly.
 *
 * Overlaps are settled by DEPTH, not by table order: the zone you are furthest
 * inside RELATIVE TO ITS OWN SIZE wins, so a small zone laid over a big one
 * takes the middle of itself and gives the big one back its rim. A subzone is
 * always smaller than its realm and always inside it, so the deepest zone at a
 * point inside a subzone is that subzone, and `hit.zone.parent` is the realm.
 *
 * The scan is two deep rather than flat: the nine realms, and then only the
 * subzones of a realm whose reach the point is already inside. `auditZones`
 * proves every subzone's reach is inside its realm's reach, which is what makes
 * that exact and not merely fast.
 *
 * `out` is an optional object to fill, so `field.sampleAt` can ask this on
 * every terrain vertex without allocating. With no `out` a fresh object comes
 * back, which is what a test or a one-off caller wants.
 */
export function zoneAt(x, z, out) {
  let best = null, bestScore = -Infinity, bestW = 0;
  for (let i = 0; i < REALM_ZONES.length; i++) {
    const zn = REALM_ZONES[i];
    const dx = x - zn.x, dz = z - zn.z;
    const reach = zn.r + zn.edge;
    const d2 = dx * dx + dz * dz;
    if (d2 >= reach * reach) continue;
    const d = Math.sqrt(d2);
    const score = 1 - d / reach;
    if (score > bestScore) {
      bestScore = score;
      best = zn;
      bestW = d <= zn.r ? 1 : 1 - smoothstep(zn.r, reach, d);
    }
    const kids = CHILDREN.get(zn.id);
    for (let j = 0; j < kids.length; j++) {
      const k = kids[j];
      const kx = x - k.x, kz = z - k.z;
      const kreach = k.r + k.edge;
      const kd2 = kx * kx + kz * kz;
      if (kd2 >= kreach * kreach) continue;
      const kd = Math.sqrt(kd2);
      const ks = 1 - kd / kreach;
      if (ks <= bestScore) continue;
      bestScore = ks;
      best = k;
      bestW = kd <= k.r ? 1 : 1 - smoothstep(k.r, kreach, kd);
    }
  }
  if (!out) return best ? { zone: best, weight: bestW } : null;
  out.zone = best; out.weight = best ? bestW : 0;
  return out;
}

/** The realm a point stands in, whatever subzone is over it. Null in the wild. */
export function realmAt(x, z) {
  const hit = zoneAt(x, z);
  if (!hit || !hit.zone) return null;
  return hit.zone.parent ? ZONE[hit.zone.parent] : hit.zone;
}

/**
 * Everything the world field and the monster layer need to know about a point.
 * Never null: unclaimed ground gets the wild band for its distance from home
 * and the three low ores.
 *
 *   { id, name, weight, biasWeight, biome, climate, danger, ore, line,
 *     zone, parent }
 *
 * `weight` is the DEEPEST zone's weight, which is what discovery and the banner
 * mean by being in a place. `biasWeight` is the REALM's weight, which is what
 * the climate is scaled by and what the override is gated on, so walking into a
 * subzone can never soften or cancel the country round it. In the wild both are
 * zero and both biases are null.
 *
 * `biome` is already gated on BIOME_OVERRIDE_W, so a caller that has one may
 * apply it without a second thought about how deep in the realm it is. It still
 * must not be applied over water or a river: that rule belongs to field.js,
 * which is the only thing that knows.
 */
export function zoneBias(x, z, out) {
  const o = out || {};
  const hit = zoneAt(x, z, SCRATCH);
  const zn = hit.zone;
  const realm = zn ? (zn.parent ? ZONE[zn.parent] : zn) : null;
  o.zone = zn;
  o.parent = realm && realm !== zn ? realm : null;
  o.id = zn ? zn.id : null;
  o.name = zn ? zn.name : null;
  o.weight = hit.weight;
  const bw = realm ? (realm === zn ? hit.weight : weightOf(realm, x, z)) : 0;
  o.biasWeight = bw;
  o.biome = realm && realm.biome && bw >= BIOME_OVERRIDE_W ? realm.biome : null;
  o.climate = realm ? realm.climate : null;
  o.danger = zn ? zn.danger : wildDanger(x, z);
  o.ore = zn ? zn.ore : WILD_ORE;
  o.line = zn ? zn.line : null;
  return o;
}
const SCRATCH = { zone: null, weight: 0 };

// -------------------------------------------------------- authored places --

let authored = null;

/**
 * Every site written down by hand, flattened out of the table.
 *
 * Each row is the shape sitegrid.js hands the rest of the game, minus the parts
 * only the terrain can answer (y, facing, and a mine's mouths and seams):
 *
 *   { id, zone, realm, sub, kind, name, x, z, article, flatR, oreBand, levels,
 *     line, authored }
 *
 * The list is built once and frozen. The id is the PLACE's own id out of
 * realms.js rather than an index, so a place may be moved, or another added
 * beside it, without silently renaming somebody's saved discovery.
 */
export function authoredSites() {
  if (authored) return authored;
  const out = [];
  for (const zn of REALM_ZONES) {
    for (const s of zn.sites) {
      out.push(Object.freeze({
        id: `z:${s.place}`,
        zone: zn.id, realm: zn.id, sub: s.place,
        kind: s.kind,
        name: s.name,
        x: s.x, z: s.z,
        article: articleFor(s.kind),
        flatR: s.flatR ?? FLAT_R[s.kind] ?? 14,
        oreBand: s.ore || zn.ore,
        levels: s.levels || null,
        line: s.line || null,
        bodyR: BODY_R[s.place] || 0,
        authored: true,
      }));
    }
  }
  authored = Object.freeze(out);
  return authored;
}

/**
 * The banner's subtitle. `hud.zone(name, sub)` sets that line in 13px small
 * caps at .3em letter spacing, which is a slot for three or four words and not
 * for a sentence: a zone's `line` is a sentence and belongs in a toast.
 *
 * A REALM says how dangerous it is, because that is the thing you need on
 * arriving. A SUBZONE says which realm it is in, because the realm already told
 * you how dangerous it was and what you do not know now is where you are.
 */
export const DANGER_WORD = {
  1: 'quiet country',
  2: 'not quiet',
  3: 'dangerous',
  4: 'very dangerous',
  5: 'nothing here is fair',
};
export const zoneSub = (zone) => {
  if (!zone) return '';
  if (zone.parent) return (ZONE[zone.parent] && ZONE[zone.parent].short) || '';
  return DANGER_WORD[zone.danger[1]] || 'dangerous';
};

/** How a toast announces each kind. 'mine' is the kind this file adds. */
export const ARTICLE = {
  mine: 'an open mine, cut into the hill',
  hamlet: 'a hamlet', town: 'a town', ruin: 'a ruin',
  shrine: 'a wayside shrine', dungeon: 'a dungeon mouth',
  cave: 'a cave in the hillside', camp: 'a camp, recently left',
  // V1's two kinds, and A3's eleven wild structures (their articles are the
  // same words sitegrid.WILD_KINDS carries), so the map's word audit and the
  // discovery toast read from one table
  megastructure: 'something you can see from a mile off',
  landmark: 'a landmark',
  watchtower: 'a watchtower, a brazier on the top of it',
  burned_farm: 'a farm that burned, and is burning still',
  bandit_camp: 'a camp with a fire in it, and men around the fire',
  graveyard: 'a graveyard, and a chapel with no roof',
  gate: 'a gate standing on its own',
  fountain: 'a fountain, and water still in it',
  tower: 'a stone tower, one window lit',
  tomb: 'a tomb, and a door in the side of it',
  castle: 'a keep behind a curtain wall',
  temple: 'a temple, its braziers burning',
  arena: 'a ring of stone tiers around a floor of sand',
};

/**
 * The two kinds V1 added, waiting in a table of their own.
 *
 * `win_map.js` walks the keys of ARTICLE at import and refuses to load unless
 * every one of them has a colour in SITE_COLOUR and a word in KIND_WORD. That
 * audit is right and V1 does not own `win_map.js`, so the two new kinds are
 * announced from here until the map has drawn them. `authoredSites` reads both
 * tables, so a player is told what they walked up to either way.
 *
 * The three lines that merge them are quoted in `docs/mmo/wiring/V1.md`.
 */
export const EXTRA_ARTICLE = {};   // merged into ARTICLE once win_map.js drew the two kinds; kept for callers

/** The article for a site kind, whichever of the two tables holds it. */
export const articleFor = (kind) => ARTICLE[kind] || EXTRA_ARTICLE[kind] || 'a place';

/**
 * Radius of ground a site levels under itself. The seven old kinds keep the
 * numbers sitegrid.js has always used; a mine's yard is the widest thing in the
 * world outside a town because it has to hold several mouths and the seams
 * between them, and the seven towns carry TOWN_PRECINCT_R, which is wider than
 * a site cell's own margin and is the reason field.js looks at the neighbouring
 * cells for a pad and not only at its own.
 */
export const FLAT_R = {
  mine: 20, hamlet: 26, town: 46, ruin: 14, shrine: 6, dungeon: 10, cave: 12, camp: 7,
  // A megalith or a landmark that SITE_FLAT_R says nothing about takes these,
  // which are small on purpose: most of these bodies belong on the ground the
  // world already made and only a few of them want a yard under them.
  megastructure: 10, landmark: 6,
};

/** The widest pad any authored site lays down. field.js reads this. */
export const MAX_FLAT_R = TOWN_PRECINCT_R;

/**
 * The widest pad that still fits inside the site cell that holds it.
 *
 * sitegrid.js keeps every site inside the middle 60% of its own 480 m cell, so
 * a pad of 96 m or less can never cross a cell border and field.sampleAt only
 * has to ask the point's OWN cell. A town precinct is wider than that, which is
 * why field.js also carries the short list of sites whose pads reach out of
 * their cell and checks it on every sample. The number is SITE_CELL * 0.2;
 * zones.test.mjs proves it still is, because sitegrid.js cannot be imported
 * here without a cycle.
 */
export const CELL_PAD_MAX = 96;

/** How much of the smaller of two discs the other may cover before it is one place. */
export const SIBLING_OVERLAP = 0.30;

/** The fraction of the SMALLER disc's area that the two discs share, 0 to 1. */
export function discOverlap(a, b) {
  const d = Math.hypot(a.x - b.x, a.z - b.z);
  const ra = a.r, rb = b.r, small = Math.min(ra, rb);
  if (d >= ra + rb) return 0;
  if (d <= Math.abs(ra - rb)) return 1;
  const cl = (v) => Math.max(-1, Math.min(1, v));
  const area = ra * ra * Math.acos(cl((d * d + ra * ra - rb * rb) / (2 * d * ra)))
    + rb * rb * Math.acos(cl((d * d + rb * rb - ra * ra) / (2 * d * rb)))
    - 0.5 * Math.sqrt(Math.max(0, (-d + ra + rb) * (d + ra - rb) * (d - ra + rb) * (d + ra + rb)));
  return area / (Math.PI * small * small);
}

// ----------------------------------------------------------------- audits --

/**
 * Every structural claim this table makes, checked at import. Throws with the
 * whole list, not the first line of it. The terrain claims (every centre on
 * land, every site out of the water, every place reachable on foot) need a
 * field and so live in `zones.test.mjs`.
 */
export function auditZones() {
  const bad = [];
  const seen = new Set(), siteNames = new Set(), names = new Set();
  const kinds = new Set([...Object.keys(ARTICLE), ...Object.keys(EXTRA_ARTICLE)]);

  if (COAST_MIN >= COAST_INNER * (1 - COAST_WOBBLE)) {
    bad.push(`COAST_MIN ${COAST_MIN} is not under the innermost possible coast ${(COAST_INNER * (1 - COAST_WOBBLE)).toFixed(0)}`);
  }
  if (COAST_INNER * (1 + COAST_WOBBLE) >= WORLD_HALF) {
    bad.push(`the coast can bulge to ${(COAST_INNER * (1 + COAST_WOBBLE)).toFixed(0)}, past WORLD_HALF ${WORLD_HALF}`);
  }

  // 1. nine parents, and one subzone for every place in the sheet
  if (REALM_ZONES.length !== 9) bad.push(`${REALM_ZONES.length} realms, not nine`);
  if (SUB_ZONES.length !== PLACES.length) bad.push(`${SUB_ZONES.length} subzones for ${PLACES.length} places in realms.js`);
  for (const z of SUB_ZONES) {
    if (!ZONE[z.parent] || ZONE[z.parent].parent) bad.push(`subzone ${z.id}: parent "${z.parent}" is not a realm`);
  }

  for (const zn of ZONES) {
    const atZ = `${zn.parent ? 'subzone' : 'realm'} ${zn.id}`;
    if (seen.has(zn.id)) bad.push(`${atZ}: duplicate id`);
    seen.add(zn.id);
    if (names.has(zn.name)) bad.push(`${atZ}: two zones are called "${zn.name}"`);
    names.add(zn.name);
    if (!zn.name || !zn.line) bad.push(`${atZ}: a zone needs a name and a line`);
    if (!(zn.r > 0) || !(zn.edge > 0)) bad.push(`${atZ}: r ${zn.r} edge ${zn.edge}`);
    if (/—/.test(zn.name) || /—/.test(zn.line)) bad.push(`${atZ}: em dash`);
    const reach = zn.r + zn.edge, home = Math.hypot(zn.x, zn.z);
    // A rim realm may spill out over the ring ocean, which is where a coast
    // realm belongs. Its CENTRE has to be well inside, or the realm is mostly
    // water and its name lands on nothing a player can stand on. A subzone gets
    // the looser version of the same rule: it may sit on the shore, but its
    // middle may not be out at sea past the world's own edge.
    const keep = zn.parent ? SUB_COAST_KEEP : COAST_KEEP;
    if (home > WORLD_HALF - keep) bad.push(`${atZ}: its centre stands ${home.toFixed(0)} m out, inside ${keep} m of the world edge ${WORLD_HALF}`);
    if (!Array.isArray(zn.danger) || zn.danger.length !== 2 || zn.danger[0] > zn.danger[1]) bad.push(`${atZ}: danger ${JSON.stringify(zn.danger)}`);
    else if (zn.danger[0] < 1 || zn.danger[1] > 5) bad.push(`${atZ}: danger ${zn.danger.join(' to ')} is off the 1 to 5 tier ladder`);
    if (!Array.isArray(zn.ore) || zn.ore.length === 0) bad.push(`${atZ}: no ore band`);
    if (zn.climate) {
      for (const k of Object.keys(zn.climate)) {
        if (k !== 'temp' && k !== 'moist') bad.push(`${atZ}: climate key "${k}" is neither temp nor moist`);
        else if (Math.abs(zn.climate[k]) > 0.5) bad.push(`${atZ}: climate ${k} ${zn.climate[k]} is more than half the whole scale`);
      }
    }
    // 2. a subzone carries no bias of its own, and lies wholly inside its realm
    if (zn.parent) {
      if (zn.biome || zn.climate) bad.push(`${atZ}: a subzone must carry no bias; the realm owns the bias`);
      const p = ZONE[zn.parent];
      if (p) {
        const d = Math.hypot(zn.x - p.x, zn.z - p.z);
        if (d + zn.r > p.r) bad.push(`${atZ}: it reaches ${(d + zn.r).toFixed(0)} m from ${p.id}'s centre, past that realm's own radius ${p.r}`);
        if (d + reach > p.r + p.edge) bad.push(`${atZ}: its soft edge reaches ${(d + reach).toFixed(0)} m, past ${p.id}'s reach ${p.r + p.edge}`);
      }
    }
    for (const s of zn.sites) {
      if (!kinds.has(s.kind)) bad.push(`${atZ}: site "${s.name}" is of unknown kind "${s.kind}"`);
      if (!s.name || !s.line) bad.push(`${atZ}: an authored site needs a name and a line`);
      if (siteNames.has(s.name)) bad.push(`${atZ}: two authored sites are called "${s.name}"`);
      siteNames.add(s.name);
      const d = Math.hypot(s.x - zn.x, s.z - zn.z);
      if (d > zn.r) bad.push(`${atZ}: "${s.name}" stands ${d.toFixed(0)} m out, past the realm's own radius ${zn.r}`);
      if (s.kind === 'mine' && (!s.ore || !s.ore.length)) bad.push(`${atZ}: mine "${s.name}" has no ore band`);
    }
  }

  // 3. every place of a building kind in realms.js has a site, no other place
  //    has one, and each one stands at the middle of its own subzone
  {
    const want = new Set(PLACES.filter((p) => SITE_KIND[p.kind] || EXTRA_SITE[p.id]).map((p) => p.id));
    const got = new Set(authoredSites().map((s) => s.sub));
    for (const id of want) if (!got.has(id)) bad.push(`the place "${id}" is of a building kind and has no authored site`);
    for (const id of got) if (!want.has(id)) bad.push(`the site at "${id}" answers no place of a building kind`);
    for (const s of authoredSites()) {
      const sub = ZONE[s.sub];
      if (!sub) { bad.push(`the site "${s.name}" names no subzone`); continue; }
      if (sub.x !== s.x || sub.z !== s.z) bad.push(`the site "${s.name}" does not stand at the middle of its own subzone`);
      if (s.flatR + 4 > sub.r) bad.push(`the site "${s.name}" lays a ${s.flatR} m pad inside a ${sub.r} m subzone`);
    }
  }

  // 4. no two subzones of one realm overlap by more than SIBLING_OVERLAP of the
  //    smaller one's area. Two named places that are mostly the same ground are
  //    one place with two names.
  for (const realm of REALM_ZONES) {
    const kids = subZonesOf(realm.id);
    for (let i = 0; i < kids.length; i++) {
      for (let j = i + 1; j < kids.length; j++) {
        const f = discOverlap(kids[i], kids[j]);
        if (f > SIBLING_OVERLAP) bad.push(`${realm.id}: ${kids[i].id} and ${kids[j].id} overlap by ${(100 * f).toFixed(0)}% of the smaller, over ${(100 * SIBLING_OVERLAP).toFixed(0)}%`);
      }
    }
  }

  // 5. THE HEART, measured rather than inferred from radii. A 50 m grid over
  //    the whole HEART_SAFE disc, every point asked which zone wins there and
  //    whether that zone's realm carries a bias at all. A radial rule was a
  //    proxy, and once realms nest and overlap it is wrong in both directions.
  {
    let biased = null;
    for (let zz = -HEART_SAFE; zz <= HEART_SAFE && !biased; zz += 50) {
      for (let xx = -HEART_SAFE; xx <= HEART_SAFE; xx += 50) {
        if (xx * xx + zz * zz > HEART_SAFE * HEART_SAFE) continue;
        const b = zoneBias(xx, zz);
        // the Greenwold's own meadow is the heart's ground now; nobody else's bias may reach it
        if ((b.biome || b.climate) && b.biasWeight > 0 && (b.parent ? b.parent.id : b.id) !== 'greenwold') { biased = `${b.id} at ${xx}, ${zz}`; break; }
      }
    }
    if (biased) bad.push(`another realm's bias reaches the heart: ${biased}, inside HEART_SAFE ${HEART_SAFE}`);

    const seaGap = Math.hypot(SEA.x, SEA.z) - SEA.edge;
    if (seaGap < HEART_SAFE) bad.push(`the Caldera Sea reaches to ${seaGap.toFixed(0)} m of the origin, inside HEART_SAFE ${HEART_SAFE}`);
    for (const r of REEFS) {
      if (Math.hypot(r.x, r.z) - r.r < HEART_SAFE) bad.push(`the reef ${r.id} reaches inside HEART_SAFE`);
      if (seaWithin(r.x, r.z) < 0.99) bad.push(`the reef ${r.id} does not stand in the deep of the Caldera Sea`);
    }
    // A PAD inside the heart is what was always forbidden, and still is: a pad
    // levels the ground under it, and the ground under a save may not move.
    // A pad-less site (flatR 0) lays nothing down at all. field.js skips the
    // shaping for it outright, so it is a name and a body standing on the
    // hillside the seed made, and the Standing Hedge is one: nine stones on a
    // ring a mile across, in the Greenwold, 836 m from the origin, which is
    // where the sheet puts them. `field.test.mjs` measures that the ground
    // under it is the raw ground and that the cell it took was empty.
    for (const s of authoredSites()) {
      if (heartAllows(s)) continue;
      bad.push(`"${s.name}" lays a ${s.flatR} m pad ${Math.hypot(s.x, s.z).toFixed(0)} m from the origin, inside HEART_SAFE ${HEART_SAFE}`);
    }
  }

  // 6. every monster tier and every ore tier occurs somewhere, or the ladder is
  //    written and never climbed
  const tiers = new Set(), ores = new Set();
  for (const zn of REALM_ZONES) {
    for (let t = zn.danger[0]; t <= zn.danger[1]; t++) tiers.add(t);
    for (const o of zn.ore) ores.add(o);
  }
  for (const s of authoredSites()) for (const o of s.oreBand) ores.add(o);
  for (let t = 1; t <= 5; t++) if (!tiers.has(t)) bad.push(`no realm carries monster tier ${t}`);
  for (let t = 1; t <= 5; t++) if (!DANGER_WORD[t]) bad.push(`tier ${t} has no word for the banner`);
  for (const o of ORE_LADDER) if (!ores.has(o)) bad.push(`no realm and no mine carries ${o}`);

  // A mine is the only reason the last four ore tiers are reachable on the
  // surface, so at least one mine must carry each of them.
  const mineOre = new Set();
  for (const s of authoredSites()) if (s.kind === 'mine') for (const o of s.oreBand) mineOre.add(o);
  for (const o of ['emberite', 'rimesteel', 'voidrock', 'starfall']) {
    if (!mineOre.has(o)) bad.push(`no authored mine carries ${o}, so it can only ever be found underground`);
  }

  // 7. every place named as standing in the water is a real authored site in
  //    the drowned realm, and it lays no pad, because there is nothing there to
  //    level. Driven the other way in zones.test.mjs, against the real field.
  {
    const byId = Object.fromEntries(authoredSites().map((s) => [s.sub, s]));
    for (const id of STANDS_IN_WATER) {
      const s = byId[id];
      if (!s) { bad.push(`"${id}" is named as standing in the water and is not an authored site`); continue; }
      if (s.realm !== 'sunkenkingdom') bad.push(`"${s.name}" stands in the water and is not in the Sunken Kingdom`);
      if (s.flatR > 0) bad.push(`"${s.name}" stands in the water and lays a ${s.flatR} m pad on the sea floor`);
    }
  }

  if (bad.length) throw new Error(`auditZones: ${bad.length} problem(s)\n  ${bad.join('\n  ')}`);
  const sites = authoredSites();
  return {
    zones: ZONES.length, realms: REALM_ZONES.length, subzones: SUB_ZONES.length,
    sites: sites.length, mines: sites.filter((s) => s.kind === 'mine').length,
    megaliths: sites.filter((s) => s.kind === 'megastructure').length,
    landmarks: sites.filter((s) => s.kind === 'landmark').length,
    relief: RELIEF_ZONES.length,
  };
}

auditZones();
