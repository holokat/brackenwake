// The shape of the world, and the twenty one places in it that were written
// down rather than rolled. Pure data and pure functions: no THREE, no DOM, and
// the only import is the maths helpers in noise.js.
//
// Read `docs/mmo/09-WORLD-ZONES.md` first; this file is that document as code.
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
// ---- zones ---------------------------------------------------------------
//
// A zone is a disc: a centre, a radius it owns outright and a soft edge over
// which it lets go. It carries what an author wants said about that part of the
// world and nothing else:
//
//   biome      a hard override ('mountain', 'snow', 'desert'), or null
//   climate    a soft nudge to temperature and moisture, or null
//   danger     the monster tier band, [lo, hi]
//   ore        the ore ids a vein or a seam here may be, poorest first
//   sites      places written down by hand, at fixed coordinates
//   line       one line a player could be told on arriving
//
// Everything between the zones is the procedural field, untouched. Twenty one
// discs do not tile 200 square kilometres and are not meant to: they are the
// places worth naming, and the road between two of them is the world's own.
//
// ---- the promise about the heart ----------------------------------------
//
// Saves already exist. A character standing in a town two hundred metres from
// the origin must find that town in the same place after this file lands. So:
//
//   No zone that carries a biome override or a climate nudge may reach within
//   HEART_SAFE (1500 m) of the origin, and `auditZones()` throws at import if
//   one ever does.
//
// The Bracken Vale, which is the heart, carries neither. It is a name, a danger
// band and an ore band over ground the field already made. `field.test.mjs`
// samples a 2 km square about the origin and proves the ground did not move.

import { clamp01, smoothstep } from './noise.js';

// --------------------------------------------------------------- the edge --

/** Half the world's width. The ground is at OCEAN_FLOOR at this radius. */
export const WORLD_HALF = 8000;
/** How deep the ring ocean is. Deeper than any shelf the field makes. */
export const OCEAN_FLOOR = -30;
/** The mean radius at which land begins to fall away. */
export const COAST_INNER = 7100;
/** Inside this radius `oceanBeyond` is exactly 0 and returns without any maths. */
export const COAST_MIN = 6500;
/** No zone with a bias may reach nearer the origin than this. */
export const HEART_SAFE = 1500;
/** A zone's centre must stand at least this far inside the world's edge. */
export const COAST_KEEP = 1000;

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

/** The danger band of open country at this radius from the origin. */
export function wildDanger(x, z) {
  const r = Math.hypot(x, z);
  for (const [lim, b] of WILD_BANDS) if (r < lim) return b;
  return WILD_BANDS[WILD_BANDS.length - 1][1];
}

// -------------------------------------------------------------- the table --

// One row is one zone. To add a zone, add a row: nothing else in the game has
// to be told. `auditZones()` checks the row at import and `zones.test.mjs`
// checks it against the terrain.
//
//   id        stable, saved in the character's discovered list, never renamed
//   name      what the banner says
//   x, z      the centre, in metres
//   r         the radius it owns outright (weight 1)
//   edge      metres over which the weight falls to 0
//   biome     a hard biome override, or null. Applied only where the weight is
//             at least BIOME_OVERRIDE_W and the ground is not water or river
//   climate   { temp, moist } added to the field's climate, scaled by weight
//   danger    the monster tier band [lo, hi]
//   ore       ore ids, poorest first: what a vein or a surface seam may be
//   sites     authored sites, at fixed coordinates measured against the terrain
//   line      the one line under the banner
//
// Every coordinate below was measured, not chosen: `scripts/` style probes
// walked the real field, took a 100 m flood fill from the origin, and every
// centre and every site here sits on ground that fill reached.

/** A biome override needs at least this much of the zone's weight. */
export const BIOME_OVERRIDE_W = 0.5;

const mine = (name, x, z, ore, line) => ({ kind: 'mine', name, x, z, ore: band(...ore), line });
const at = (kind, name, x, z, line) => ({ kind, name, x, z, line });

export const ZONES = [
  {
    id: 'vale', name: 'The Bracken Vale', x: 0, z: 0, r: 1500, edge: 600,
    biome: null, climate: null, danger: band(1, 1), ore: band('copper', 'tin'),
    sites: [],
    line: 'Hedged fields, a slow river, and nobody in a hurry. Whatever the rest of the world turns out to be, it starts here.',
  },
  // ---- the inner ring: a day's walk out, and the first thing that bites ----
  {
    id: 'millrun', name: 'The Mill Run', x: 0, z: -3000, r: 950, edge: 400,
    biome: null, climate: null, danger: band(1, 2), ore: band('copper', 'tin', 'iron'),
    sites: [
      mine('the Millrun Adit', -118, -3076, ['copper', 'tin', 'iron'], 'Three cuts in a green hill, and a yard trodden flat by a century of barrows.'),
      at('hamlet', 'Millrun', 118, -3075, 'Four roofs, a mill wheel, and the smell of hot iron off the smithy.'),
    ],
    line: 'Wheat, a water mill, and the first hole in the ground anyone will let you into.',
  },
  {
    id: 'saltmere', name: 'Saltmere', x: 3000, z: -2000, r: 950, edge: 400,
    biome: null, climate: { temp: 0, moist: 0.16 }, danger: band(2, 2), ore: band('copper', 'tin', 'iron'),
    sites: [at('ruin', 'the Weir Steps', 3018, -2139, 'Steps into water that used to be a floor.')],
    line: 'A shallow sound that is half land at low tide and none of it at high.',
  },
  {
    id: 'sedgeflats', name: 'The Sedge Flats', x: 1600, z: 2700, r: 950, edge: 400,
    biome: null, climate: { temp: 0.05, moist: 0.20 }, danger: band(1, 2), ore: band('copper', 'tin', 'iron'),
    sites: [at('ruin', 'the Drowned Mill', 1549, 2570, 'The wheel is still there. The river moved.')],
    line: 'Standing water to the knee and sedge to the shoulder, and something in it that is not a frog.',
  },
  {
    id: 'kilnheath', name: 'Kiln Heath', x: -100, z: 3100, r: 950, edge: 400,
    biome: null, climate: { temp: 0.15, moist: -0.18 }, danger: band(2, 2), ore: band('copper', 'tin', 'iron'),
    sites: [at('cave', "Fallow's Adit", -221, 2615, 'A hole in a dry hill, propped with timber that has not been sound for years.')],
    line: 'Gorse, dry sand and the brick kilns that gave it the name, all of them cold.',
  },
  {
    id: 'greybarrow', name: 'The Grey Barrows', x: -2700, z: 1700, r: 950, edge: 400,
    biome: null, climate: { temp: 0, moist: 0.10 }, danger: band(2, 3), ore: band('copper', 'tin', 'iron'),
    sites: [
      at('ruin', 'the Long Barrow', -2989, 1618, 'One stone still standing, and it is not the biggest one.'),
      at('dungeon', 'the Barrow Cellars', -2678, 2039, 'A stair under a mound, cut by people who expected to be visited.'),
    ],
    line: 'Grass mounds in rows, and the rows go on past where anyone bothered to count.',
  },
  {
    id: 'thornwood', name: 'Thornwood', x: -2500, z: -1500, r: 950, edge: 400,
    biome: null, climate: { temp: -0.22, moist: 0.06 }, danger: band(2, 2), ore: band('copper', 'tin', 'iron'),
    sites: [at('camp', 'a cold fire', -2600, -1598, 'Somebody sat here and then did not.')],
    line: 'Spruce close enough together that the light gives up two paces in.',
  },
  // ---- the middle: where the ore ladder starts to be worth the walk -------
  {
    id: 'strand', name: 'The Broken Strand', x: 4600, z: -300, r: 1500, edge: 500,
    biome: null, climate: { temp: 0, moist: 0.16 }, danger: band(3, 3), ore: band('iron', 'silver'),
    sites: [at('cave', "Crook's Delve", 5060, -287, 'The sea got into it once. The tide mark is above your head.')],
    line: 'A coast that came apart. Half of it is islands now and the other half is deciding.',
  },
  {
    id: 'emberflats', name: 'The Ember Flats', x: 3200, z: 3100, r: 1500, edge: 500,
    biome: null, climate: { temp: 0.24, moist: -0.26 }, danger: band(3, 4), ore: band('iron', 'emberite'),
    sites: [
      mine('the Ember Cut', 3246, 3477, ['iron', 'emberite'], 'The rock is red where it is broken and warm where it is not.'),
      at('ruin', 'the Kiln Hall', 3250, 3231, 'A roof of nothing over a floor of glass.'),
    ],
    line: 'Sand, red stone and heat off the ground at noon. The ore here burns.',
  },
  {
    id: 'hollowhills', name: 'The Hollow Hills', x: 0, z: 4300, r: 1500, edge: 500,
    biome: null, climate: null, danger: band(3, 3), ore: band('iron', 'silver'),
    sites: [
      at('dungeon', 'the Hollow Workings', -126, 4429, 'Somebody mined this and then somebody else lived in it.'),
      at('ruin', 'the Weir Tower', -107, 4209, 'It watched the road. The road is gone and it is still watching.'),
    ],
    line: 'Green hills with the sound wrong under them, and doors in the sides.',
  },
  {
    id: 'witchwood', name: 'Witchwood', x: -3100, z: 3100, r: 1500, edge: 500,
    biome: null, climate: { temp: 0.04, moist: 0.24 }, danger: band(3, 3), ore: band('iron', 'verdite'),
    sites: [at('shrine', "Fern's Stone", -3118, 3239, 'Somebody keeps the moss off it. Nobody has ever been seen doing it.')],
    line: 'Blossom out of season and no birds in any of it.',
  },
  {
    id: 'ironshoulder', name: 'The Iron Shoulder', x: -4400, z: 0, r: 1500, edge: 500,
    biome: 'mountain', climate: null, danger: band(3, 4), ore: band('iron', 'silver', 'coldiron'),
    sites: [
      mine('the Deep Shoulder', -4628, 124, ['iron', 'silver', 'coldiron'], 'Four mouths on one hillside, and a yard between them worn down to bare rock.'),
      mine('the Low Shoulder', -4924, 129, ['silver', 'coldiron'], 'The older cut. Colder, and the seams run bluer.'),
      at('hamlet', 'Slatehithe', -4483, -113, 'Everyone here works the Shoulder or feeds somebody who does.'),
    ],
    line: 'Bare stone shoulders with the ore showing on the outside of them, which is why anybody came.',
  },
  {
    id: 'longdark', name: 'The Long Dark', x: -3100, z: -3200, r: 1500, edge: 500,
    biome: null, climate: { temp: -0.28, moist: 0.08 }, danger: band(3, 4), ore: band('iron', 'verdite'),
    sites: [at('cave', "Marl's Seam", -2762, -3233, 'Green gold in the wall of it, if the light is right and you are not.')],
    line: 'Old forest, and old means the trees were here before the word for them.',
  },
  {
    id: 'ashenmoor', name: 'Ashen Moor', x: -100, z: -4300, r: 1500, edge: 500,
    biome: null, climate: { temp: -0.12, moist: 0.12 }, danger: band(3, 4), ore: band('iron', 'silver'),
    sites: [
      at('dungeon', 'the Ashen Steps', -201, -4203, 'Down, and then down again, and the second flight is wider than the first.'),
      at('ruin', 'the Grey Hall', -244, -4517, 'Long enough to have held a hundred people and empty enough to prove it did not help.'),
    ],
    line: 'Peat, standing water and burnt heather that never grew back.',
  },
  {
    id: 'stonegarden', name: 'The Stone Garden', x: 3100, z: -3100, r: 1500, edge: 500,
    biome: 'mountain', climate: null, danger: band(4, 4), ore: band('silver', 'coldiron'),
    sites: [at('dungeon', "the Warden's Cut", 3223, -3033, 'The door is the size of a barn and it was not built for people.')],
    line: 'Standing rocks in rows nobody planted, and the Warden at the bottom of the cut.',
  },
  // ---- the rim: the far ring, and the only place the last four tiers are --
  {
    id: 'cinderreach', name: 'Cinderreach', x: 6100, z: 2700, r: 2300, edge: 700,
    biome: null, climate: { temp: 0.34, moist: -0.30 }, danger: band(4, 5), ore: band('emberite', 'voidrock'),
    sites: [
      mine('the Cinder Cut', 5968, 3550, ['emberite', 'voidrock'], 'The yard is black glass and it rings when you walk on it.'),
      at('dungeon', "the Ashen King's Hall", 6354, 2755, 'He is still on the chair. That is the problem.'),
    ],
    line: 'A coast of black glass and red rock, and the sea steams where it meets it.',
  },
  {
    id: 'sallowwastes', name: 'The Sallow Wastes', x: 1100, z: 6500, r: 2300, edge: 700,
    biome: 'desert', climate: { temp: 0.28, moist: -0.34 }, danger: band(4, 5), ore: band('voidrock', 'starfall'),
    sites: [mine('the Sallow Fall', 818, 6602, ['voidrock', 'starfall'], 'They are not mining the hill. They are mining what landed in it.')],
    line: 'Nothing grows and something fell here, and the second fact explains the first.',
  },
  {
    id: 'frostcrown', name: 'The Frostcrown', x: -5100, z: 4200, r: 2300, edge: 700,
    biome: 'snow', climate: { temp: -0.40, moist: 0 }, danger: band(4, 5), ore: band('coldiron', 'rimesteel'),
    sites: [
      mine('the Rime Cut', -5095, 4460, ['coldiron', 'rimesteel'], 'The mouths breathe out cold. The yard has never once thawed.'),
      at('dungeon', 'the Frostcrown Shaft', -5034, 4076, 'It goes down until it is warm, and that is worse.'),
    ],
    line: 'Snow to the waterline, and the giants here do not care that you are cold too.',
  },
  {
    id: 'theteeth', name: 'The Teeth', x: -6000, z: -2300, r: 2300, edge: 700,
    biome: 'mountain', climate: { temp: -0.10, moist: 0 }, danger: band(5, 5), ore: band('voidrock', 'starfall'),
    sites: [at('dungeon', "the Mother's Deep", -6018, -2161, 'Web across the mouth of it, and the web is load bearing.')],
    line: 'Black rock standing up out of the ground in rows, and nothing between the rows.',
  },
  {
    id: 'nightmarch', name: 'The Night March', x: -1100, z: -6500, r: 2300, edge: 700,
    biome: null, climate: { temp: -0.34, moist: 0.10 }, danger: band(4, 5), ore: band('rimesteel', 'verdite'),
    sites: [
      at('cave', 'the Cold Adit', -851, -6113, 'Ice on the walls a hand thick, and it is not winter.'),
      at('dungeon', 'the Night Shaft', -1073, -6363, 'Whatever walks up out of this does it at dusk and in order.'),
    ],
    line: 'Dark trees on frozen ground, and the things in them keep step.',
  },
  {
    id: 'drownedcoast', name: 'The Drowned Coast', x: 5100, z: -4200, r: 2300, edge: 700,
    biome: null, climate: { temp: 0, moist: 0.22 }, danger: band(4, 5), ore: band('coldiron', 'voidrock'),
    sites: [at('dungeon', "the Drowned Knight's Steps", 5096, -4060, 'He walks up them every night and finds the sea still there.')],
    line: 'Half a kingdom under the tide, and its owner still doing his rounds.',
  },
];

export const ZONE = Object.fromEntries(ZONES.map((z) => [z.id, z]));
/** How many zones there are, so a caller can say the number without counting. */
export const ZONE_COUNT = ZONES.length;

// ---------------------------------------------------------------- lookups --

/**
 * The zone (x, z) belongs to, and how strongly.
 *
 * Overlaps are settled by DEPTH, not by table order: the zone you are furthest
 * inside RELATIVE TO ITS OWN SIZE wins, so a small zone laid over a big one
 * takes the middle of itself and gives the big one back its rim. Ties fall to
 * the earlier row, which only matters for two identical discs.
 *
 * `out` is an optional object to fill, so `field.sampleAt` can ask this on
 * every terrain vertex without allocating. With no `out` a fresh object comes
 * back, which is what a test or a one-off caller wants.
 */
export function zoneAt(x, z, out) {
  let best = null, bestScore = -Infinity, bestW = 0;
  for (let i = 0; i < ZONES.length; i++) {
    const zn = ZONES[i];
    const dx = x - zn.x, dz = z - zn.z;
    const reach = zn.r + zn.edge;
    const d2 = dx * dx + dz * dz;
    if (d2 >= reach * reach) continue;
    const d = Math.sqrt(d2);
    const score = 1 - d / reach;
    if (score <= bestScore) continue;
    bestScore = score;
    best = zn;
    bestW = d <= zn.r ? 1 : 1 - smoothstep(zn.r, reach, d);
  }
  if (!out) return best ? { zone: best, weight: bestW } : null;
  out.zone = best; out.weight = best ? bestW : 0;
  return out;
}

/**
 * Everything the world field and the monster layer need to know about a point.
 * Never null: unclaimed ground gets the wild band for its distance from home
 * and the three low ores.
 *
 *   { id, name, weight, biome, climate, danger, ore, line, zone }
 *
 * `biome` is already gated on BIOME_OVERRIDE_W, so a caller that has one may
 * apply it without a second thought about how deep in the zone it is. It still
 * must not be applied over water or a river: that rule belongs to field.js,
 * which is the only thing that knows.
 */
export function zoneBias(x, z, out) {
  const o = out || {};
  const hit = zoneAt(x, z, SCRATCH);
  const zn = hit.zone;
  o.zone = zn;
  o.id = zn ? zn.id : null;
  o.name = zn ? zn.name : null;
  o.weight = hit.weight;
  o.biome = zn && zn.biome && hit.weight >= BIOME_OVERRIDE_W ? zn.biome : null;
  o.climate = zn ? zn.climate : null;
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
 *   { id, zone, kind, name, x, z, article, flatR, oreBand, line, authored }
 *
 * The list is built once and frozen. The ids are stable and are what a
 * character's discovered list holds, so a row may be moved but never renamed.
 */
export function authoredSites() {
  if (authored) return authored;
  const out = [];
  for (const zn of ZONES) {
    for (let i = 0; i < zn.sites.length; i++) {
      const s = zn.sites[i];
      out.push(Object.freeze({
        id: `z:${zn.id}:${i}`,
        zone: zn.id,
        kind: s.kind,
        name: s.name,
        x: s.x, z: s.z,
        article: ARTICLE[s.kind] || 'a place',
        flatR: FLAT_R[s.kind] ?? 14,
        oreBand: s.ore || zn.ore,
        line: s.line || null,
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
 * for a sentence: a zone's `line` is a sentence and belongs in a toast. This is
 * what goes under the name, and it says the one thing a player arriving needs.
 */
export const DANGER_WORD = {
  1: 'quiet country',
  2: 'not quiet',
  3: 'dangerous',
  4: 'very dangerous',
  5: 'nothing here is fair',
};
export const zoneSub = (zone) => (zone ? DANGER_WORD[zone.danger[1]] || 'dangerous' : '');

/** How a toast announces each kind. 'mine' is the kind this file adds. */
export const ARTICLE = {
  mine: 'an open mine, cut into the hill',
  hamlet: 'a hamlet', town: 'a town', ruin: 'a ruin',
  shrine: 'a wayside shrine', dungeon: 'a dungeon mouth',
  cave: 'a cave in the hillside', camp: 'a camp, recently left',
};

/**
 * Radius of ground a site levels under itself. The seven old kinds keep the
 * numbers sitegrid.js has always used; a mine's yard is the widest thing in the
 * world outside a town because it has to hold several mouths and the seams
 * between them.
 */
export const FLAT_R = {
  mine: 20, hamlet: 26, town: 46, ruin: 14, shrine: 6, dungeon: 10, cave: 12, camp: 7,
};

// ----------------------------------------------------------------- audits --

/**
 * Every structural claim this table makes, checked at import. Throws with the
 * whole list, not the first line of it. The terrain claims (every centre on
 * land, every site out of the water, every zone reachable on foot) need a field
 * and so live in `zones.test.mjs`.
 */
export function auditZones() {
  const bad = [];
  const seen = new Set(), siteIds = new Set(), names = new Set();
  const kinds = new Set(Object.keys(ARTICLE));

  if (COAST_MIN >= COAST_INNER * (1 - COAST_WOBBLE)) {
    bad.push(`COAST_MIN ${COAST_MIN} is not under the innermost possible coast ${(COAST_INNER * (1 - COAST_WOBBLE)).toFixed(0)}`);
  }
  if (COAST_INNER * (1 + COAST_WOBBLE) >= WORLD_HALF) {
    bad.push(`the coast can bulge to ${(COAST_INNER * (1 + COAST_WOBBLE)).toFixed(0)}, past WORLD_HALF ${WORLD_HALF}`);
  }

  for (const zn of ZONES) {
    const atZ = `zone ${zn.id}`;
    if (seen.has(zn.id)) bad.push(`${atZ}: duplicate id`);
    seen.add(zn.id);
    if (names.has(zn.name)) bad.push(`${atZ}: two zones are called "${zn.name}"`);
    names.add(zn.name);
    if (!zn.name || !zn.line) bad.push(`${atZ}: a zone needs a name and a line`);
    if (!(zn.r > 0) || !(zn.edge > 0)) bad.push(`${atZ}: r ${zn.r} edge ${zn.edge}`);
    const reach = zn.r + zn.edge, home = Math.hypot(zn.x, zn.z);
    // A rim zone is allowed to spill out over the ring ocean, which is where a
    // coast zone belongs. Its CENTRE has to be well inside, or the zone is
    // mostly water and the name lands on nothing a player can stand on.
    if (home > WORLD_HALF - COAST_KEEP) bad.push(`${atZ}: its centre stands ${home.toFixed(0)} m out, inside ${COAST_KEEP} m of the world edge ${WORLD_HALF}`);
    if ((zn.biome || zn.climate) && home - reach < HEART_SAFE) {
      bad.push(`${atZ}: carries a bias and reaches to ${(home - reach).toFixed(0)} m of the origin, inside HEART_SAFE ${HEART_SAFE}`);
    }
    if (!Array.isArray(zn.danger) || zn.danger.length !== 2 || zn.danger[0] > zn.danger[1]) bad.push(`${atZ}: danger ${JSON.stringify(zn.danger)}`);
    else if (zn.danger[0] < 1 || zn.danger[1] > 5) bad.push(`${atZ}: danger ${zn.danger.join(' to ')} is off the 1 to 5 tier ladder`);
    if (!Array.isArray(zn.ore) || zn.ore.length === 0) bad.push(`${atZ}: no ore band`);
    if (zn.climate) {
      for (const k of Object.keys(zn.climate)) {
        if (k !== 'temp' && k !== 'moist') bad.push(`${atZ}: climate key "${k}" is neither temp nor moist`);
        else if (Math.abs(zn.climate[k]) > 0.5) bad.push(`${atZ}: climate ${k} ${zn.climate[k]} is more than half the whole scale`);
      }
    }
    for (const s of zn.sites) {
      if (!kinds.has(s.kind)) bad.push(`${atZ}: site "${s.name}" is of unknown kind "${s.kind}"`);
      if (!s.name || !s.line) bad.push(`${atZ}: an authored site needs a name and a line`);
      if (siteIds.has(s.name)) bad.push(`${atZ}: two authored sites are called "${s.name}"`);
      siteIds.add(s.name);
      const d = Math.hypot(s.x - zn.x, s.z - zn.z);
      if (d > zn.r) bad.push(`${atZ}: "${s.name}" stands ${d.toFixed(0)} m out, past the zone's own radius ${zn.r}`);
      if (s.kind === 'mine' && (!s.ore || !s.ore.length)) bad.push(`${atZ}: mine "${s.name}" has no ore band`);
    }
  }

  // Every zone that owns the deep tiers must be somewhere a player has to walk
  // to, and every tier of monster and of ore has to occur in at least one zone,
  // or the ladder is written and never climbed.
  const tiers = new Set(), ores = new Set();
  for (const zn of ZONES) {
    for (let t = zn.danger[0]; t <= zn.danger[1]; t++) tiers.add(t);
    for (const o of zn.ore) ores.add(o);
  }
  for (let t = 1; t <= 5; t++) if (!tiers.has(t)) bad.push(`no zone carries monster tier ${t}`);
  for (let t = 1; t <= 5; t++) if (!DANGER_WORD[t]) bad.push(`tier ${t} has no word for the banner`);
  for (const o of ['copper', 'tin', 'iron', 'silver', 'coldiron', 'emberite', 'rimesteel', 'verdite', 'voidrock', 'starfall']) {
    if (!ores.has(o)) bad.push(`no zone carries ${o}`);
  }

  // A mine is the only reason the last four ore tiers are reachable on the
  // surface, so at least one mine must carry each of them.
  const mineOre = new Set();
  for (const s of authoredSites()) if (s.kind === 'mine') for (const o of s.oreBand) mineOre.add(o);
  for (const o of ['emberite', 'rimesteel', 'voidrock', 'starfall']) {
    if (!mineOre.has(o)) bad.push(`no authored mine carries ${o}, so it can only ever be found underground`);
  }

  if (bad.length) throw new Error(`auditZones: ${bad.length} problem(s)\n  ${bad.join('\n  ')}`);
  return { zones: ZONES.length, sites: authoredSites().length, mines: authoredSites().filter((s) => s.kind === 'mine').length };
}

auditZones();
