// The Greenwold, as the user painted it, turned into world metres.
//
// WHY THIS FILE EXISTS. The user has a hand painted parchment map of the
// Greenwold and is sculpting a blank world to match it. The one thing the game
// could not tell them was WHERE ON THE GROUND each painted place stands, so
// every object had to be put down by eye and moved again. This file is the
// answer: the painting's own layout, measured as fractions of the sheet, and
// the world coordinates those fractions mean.
//
// IT IS A GUIDE AND NOTHING ELSE. Nothing in the world is built from it. No
// terrain is cut, no plan is placed, no site is registered, no save is touched.
// It is drawn on the zone map and on the minimap so the user can see where to
// put things, and that is the whole of its job. `src/world/zones.js` LAYOUT is
// the OLD generated layout and is deliberately left alone: the two disagree,
// on purpose, because the painting is the new truth for the hand built realm
// and the generated world still has to load old saves unmoved.
//
// ---- the mapping ----------------------------------------------------------
//
// The painting is 16:9. Its green country fills the sheet from 0.03 to 0.97
// across and 0.04 to 0.96 down, and that rectangle is the realm: world x from
// -2200 to 2200 (east positive) and world z from -2200 at the TOP of the sheet
// to 2200 at the bottom. The realm itself is the circle of radius 2200 at the
// origin, `ZONE.greenwold`.
//
// WHICH WAY IS NORTH, AND WHY THE Z RUNS THE WAY IT DOES. The top of a painted
// map is north, and in Kaldera NORTH IS MINUS Z: `src/game/compass.js` takes
// its bearings as `atan2(dx, -dz)`, and both the zone map and the minimap draw
// +z DOWN the picture so that -z is up. So the top edge of the sheet is
// z = -2200 and the bottom edge is z = +2200.
//
// Written the other way round, with +2200 at the top, everything still round
// trips and the whole thing is quietly wrong: the picture is drawn upside down
// on a north up map, and the column beside it calls the Kingsroad camp south
// east of the village when the painting plainly puts it north east. Measured
// both ways in `greenwold_guide.test.mjs`, against `compass.bearingOf`, so
// nobody has to take the sign on trust.
//
// THE MAPPING IS NOT ISOTROPIC AND THAT IS MEASURED, NOT GUESSED. A square
// realm mapped onto a 16:9 sheet is 2.79 m to the image pixel across and 5.08 m
// to the image pixel down (`GUIDE_ART.metresPerPixel`), so the painting is
// drawn stretched to about 1.8 times its own height on the map. A distance
// paced off the sheet with a ruler is wrong; the world coordinates below are
// right. Everything that draws the painting draws it through `imageToWorld`,
// so the picture and the numbers cannot drift apart.
//
// `imageToWorld` and `worldToImage` are exact inverses, and
// `greenwold_guide.test.mjs` drives both at the four corners and at all twelve
// centres rather than taking the algebra on trust.
//
// ---- where the painting goes ----------------------------------------------
//
//   public/maps/greenwold.png
//
// It is served at `/maps/greenwold.png` (GUIDE_ART.url). Until it is there the
// map says so in its footer and draws the outlines over the terrain instead.
//
// ---- the roads and the river ----------------------------------------------
//
// Traced from the painting in image fractions and converted the same way, so
// the river on the map runs where the river on the sheet runs. They are lines
// to paint along, not the `roads.js` polylines the world really has.

import { ZONE } from '../world/zones.js';
import { openAt } from './release.js';
import { FOOTPRINT } from './plans/footprints.js';

/** The realm the painting is of. Its circle is the boundary every zone is inside. */
export const GUIDE_REALM = 'greenwold';

/**
 * The sheet, and what its corners mean in world metres.
 *
 * `u` runs 0 to 1 left to right, `v` runs 0 to 1 TOP TO BOTTOM, which is how an
 * image is measured. World `x` runs east and world `z` runs SOUTH, so v and z
 * run the same way: z0, the top of the sheet, is the northern edge at -2200.
 */
const FRAME = Object.freeze({
  u0: 0.03, u1: 0.97, v0: 0.04, v1: 0.96,
  x0: -2200, x1: 2200, z0: -2200, z1: 2200,
});

/** The painting's own size, as the user measured it. Only the ratio is used. */
const SHEET = Object.freeze({ w: 1676, h: 942 });

/** Image fraction to world metres. Pure, and the inverse of `worldToImage`. */
export function imageToWorld(u, v) {
  return [
    FRAME.x0 + ((u - FRAME.u0) / (FRAME.u1 - FRAME.u0)) * (FRAME.x1 - FRAME.x0),
    FRAME.z0 + ((v - FRAME.v0) / (FRAME.v1 - FRAME.v0)) * (FRAME.z1 - FRAME.z0),
  ];
}

/** World metres to image fraction. Pure, and the inverse of `imageToWorld`. */
export function worldToImage(x, z) {
  return [
    FRAME.u0 + ((x - FRAME.x0) / (FRAME.x1 - FRAME.x0)) * (FRAME.u1 - FRAME.u0),
    FRAME.v0 + ((z - FRAME.z0) / (FRAME.z1 - FRAME.z0)) * (FRAME.v1 - FRAME.v0),
  ];
}

/** Metres across an image fraction of 1, in each direction. Both positive. */
const M_PER_U = (FRAME.x1 - FRAME.x0) / (FRAME.u1 - FRAME.u0);
const M_PER_V = (FRAME.z1 - FRAME.z0) / (FRAME.v1 - FRAME.v0);

/** A width on the sheet, as a fraction of the image, in world metres. */
export const widthToMetres = (fraction) => fraction * M_PER_U;

/**
 * The WHOLE sheet in world metres, corner to corner, which is what a draw needs:
 * the green country is inset from the edges, so the picture reaches a little
 * past the realm on every side.
 */
export const artRect = () => {
  const [wx0, wz0] = imageToWorld(0, 0);      // the sheet's top left, the north west
  const [wx1, wz1] = imageToWorld(1, 1);      // the sheet's bottom right, the south east
  return { x0: wx0, z0: wz0, x1: wx1, z1: wz1, w: wx1 - wx0, h: wz1 - wz0 };
};

export const GUIDE_ART = Object.freeze({
  url: '/maps/greenwold.png',
  file: 'public/maps/greenwold.png',
  sheet: SHEET,
  frame: FRAME,
  imageToWorld,
  worldToImage,
  metresPerPixel: Object.freeze({ x: M_PER_U / SHEET.w, z: M_PER_V / SHEET.h }),
  /** What the map says when the picture is not there. One sentence, one path. */
  missing: 'The painting is not in yet. Put it at public/maps/greenwold.png and it becomes the ground under this map.',
});

/**
 * A zone of the painting: a name, a place, a rough boundary, the sentence that
 * says what it is for, and the models that go in it.
 *
 * `u, v` are read off the painting and `x, z` are computed from them, so a
 * spot moved on the sheet moves in the world and nobody has to remember to
 * change two numbers.
 *
 * `r` is a ROUGH radius in metres. It is the ground the space takes hold of,
 * not a wall: the point of it is to say where an object belongs, so a boundary
 * a hundred metres out either way is doing its job.
 *
 * `annulus` on the Standing Hedge, because the ring IS its boundary. The nine
 * stones stand ON the circle at 1000 m and the village and the cellars stand
 * inside it, so drawing it as a disc would say the whole of the middle of the
 * realm is one space, which is the opposite of true.
 *
 * `line` and `landmark` come from docs/mmo/22-GREENWOLD-SPACES.md. `models`
 * are the ids that doc names for the space, every one of them a real
 * `FOOTPRINT` key, checked by `auditGuide()`. `wanted` is what the doc names
 * for the space that is NOT a model yet, kept separate so a hover can say
 * "and these do not exist" rather than quietly dropping them.
 */
const SPACES = [
  {
    id: 'hearthhome', name: 'Hearthhome', u: 0.66, v: 0.42, r: 220,
    landmark: 'the well pavilion in the middle of the green, the manor tower behind it',
    line: 'Home, and the only place in the zone where nothing hunts.',
    models: [
      'well_pavilion', 'manor', 'smithy', 'inn', 'chapel', 'stable', 'stable_pen',
      'bank', 'healer', 'cottage_a', 'cottage_b', 'cottage_c',
      'stall_a', 'stall_b', 'stall_c', 'gate_tower', 'stone_bridge_10m',
      'flint_wall_4m', 'flint_wall_corner', 'mound_fence', 'lane_slab',
      'bench', 'barrel', 'crate',
    ],
    wanted: [],
  },
  {
    id: 'standinghedge', name: 'The Standing Hedge', u: 0.61, v: 0.47, r: 1000,
    annulus: true, band: 140,
    landmark: 'the carved sarsen, four metres, its face to the ring centre, offerings at its foot',
    line: 'The first wonder and the first quiet. The ring is a mile across, and one stone is the whole space.',
    models: ['waystone_village', 'boundary_stone', 'offerings', 'hedge_4m'],
    wanted: [],
  },
  {
    id: 'oldcellars', name: 'The Old Cellars', u: 0.52, v: 0.46, r: 140,
    landmark: 'the brick arch in the hollow with the Legion banner over it',
    line: 'The door to the second hour.',
    models: ['cellar_arch', 'chain_lantern', 'legion_banner', 'cart_broken'],
    wanted: [],
  },
  {
    id: 'chalkpits', name: 'The Chalk Pits', u: 0.29, v: 0.17, r: 260,
    landmark: 'the white scar in the green hill, the headframe over the mouth',
    line: 'The pickaxe, and the first place that is a place of work.',
    models: ['headframe', 'mine_mouth', 'ore_cart', 'rail_2m', 'spoil_heap', 'foremans_hut', 'pick', 'barrow', 'chalk_face_4m'],
    wanted: [],
  },
  {
    id: 'sunkenchapel', name: 'The Sunken Chapel', u: 0.48, v: 0.16, r: 240,
    landmark: 'the roof a foot under the water, the bell still on the beam',
    line: "The zone's ghost story.",
    models: ['chapel_sunken', 'headstone_a', 'headstone_b', 'headstone_c', 'headstone_d', 'headstone_e', 'rowing_boat_rotten', 'lily_pad_patch', 'willow'],
    wanted: [],
  },
  {
    id: 'highwaymanshollow', name: "Highwayman's Hollow", u: 0.68, v: 0.14, r: 200,
    landmark: 'the lookout platform in the oak, the fire under the overhang',
    line: 'The first camp fight, four against one, with a lookout who sees you.',
    models: ['lookout_platform', 'tent_ragged', 'tarp_cart', 'campfire', 'weapons_rack', 'loot_sack', 'target_dummy', 'sheep_skeleton', 'palisade_stake_3m'],
    wanted: [],
  },
  {
    id: 'kingsroad', name: 'The Kingsroad', u: 0.85, v: 0.12, r: 220,
    landmark: 'the paved road with its milestones, a Legion camp where it enters the realm',
    line: 'The Legion, seen before it is fought.',
    models: ['road_slab_2m', 'road_kerb', 'milestone', 'fingerpost', 'lamp_post_iron', 'legion_tent', 'legion_standard', 'spear_rack', 'brazier', 'legion_crate', 'camp_fence', 'stone_bridge_10m'],
    wanted: [],
  },
  {
    id: 'millrun', name: 'The Mill Run', u: 0.13, v: 0.38, r: 260,
    landmark: 'the mill and its wheel, the weir below it, the footbridge',
    line: 'The countryside the village lives on, and the first field.',
    models: ['mill', 'mill_wheel', 'eel_weir', 'footbridge', 'granary', 'millers_house', 'stepping_stones', 'cart_laden', 'cart_empty', 'lamp_post_iron', 'willow'],
    wanted: ['a scarecrow that walks at night'],
  },
  {
    id: 'beechhangar', name: 'The Beech Hangar', u: 0.13, v: 0.62, r: 420,
    landmark: 'the fallen beech across the path, the setts under the bank',
    line: 'The first fight and the first forage, both under trees.',
    models: ['beech_a', 'beech_b', 'beech_c', 'fallen_beech', 'badger_sett', 'rooting_patch'],
    wanted: [],
  },
  {
    id: 'longmeadow', name: 'The Long Meadow', u: 0.36, v: 0.34, r: 360,
    landmark: 'a single great oak on a rise with a hay rick under it',
    line: 'The walk: the first open country, and a fight if you want one.',
    models: ['oak_a', 'oak_b', 'oak_c', 'hay_rick'],
    wanted: [],
  },
  {
    id: 'watermeadows', name: 'The Water Meadows', u: 0.30, v: 0.51, r: 320,
    landmark: 'the footbridge and the reed beds, a heron',
    line: 'The river as a thing to follow.',
    models: ['footbridge', 'willow'],
    wanted: ['reed beds', 'a heron'],
  },
  {
    id: 'coldwake', name: 'Coldwake', u: 0.33, v: 0.77, r: 220,
    landmark: 'a green with a well and six houses, a hedge round it',
    line: 'The second village, so the first is not the only one.',
    models: ['cottage_a', 'cottage_b', 'cottage_c', 'well_pavilion', 'hedge_4m', 'mound_fence', 'fence_rail_3m', 'stone_wall_4m'],
    wanted: [],
  },
];

/** The twelve spaces, with their world coordinates worked out from the sheet. */
export const GUIDE_ZONES = Object.freeze(SPACES.map((s) => {
  const [x, z] = imageToWorld(s.u, s.v);
  return Object.freeze({
    ...s,
    x, z,
    annulus: !!s.annulus,
    band: s.band || 0,
    models: Object.freeze(s.models.slice()),
    wanted: Object.freeze((s.wanted || []).slice()),
  });
}));

/** By id, for a hover and for a test. */
export const GUIDE_BY_ID = Object.freeze(Object.fromEntries(GUIDE_ZONES.map((g) => [g.id, g])));

/** A polyline traced on the sheet, turned into world metres. */
const way = (id, name, pts) => Object.freeze({
  id, name,
  pts: Object.freeze(pts.map(([u, v]) => { const [x, z] = imageToWorld(u, v); return Object.freeze({ u, v, x, z }); })),
});

/**
 * The two ways through the realm, traced on the painting.
 *
 * The Kingsroad comes in at the north east corner, past the Legion camp, and
 * down to the village. The lane leaves the village to the south west, through
 * the ring, then west past the Long Meadow to the mill.
 */
export const GUIDE_ROADS = Object.freeze([
  way('kingsroad', 'The Kingsroad', [
    [0.985, 0.045], [0.930, 0.080], [0.850, 0.120], [0.792, 0.166],
    [0.752, 0.226], [0.722, 0.296], [0.700, 0.358], [0.680, 0.398], [0.660, 0.420],
  ]),
  way('villagelane', 'The lane to the mill', [
    [0.660, 0.420], [0.635, 0.448], [0.610, 0.470], [0.560, 0.452],
    [0.505, 0.424], [0.452, 0.392], [0.400, 0.360], [0.360, 0.340],
    [0.300, 0.338], [0.240, 0.350], [0.185, 0.362], [0.130, 0.380],
  ]),
]);

/**
 * The river: out of the chalk hills in the north west, past the mill, through
 * the water meadows, past the cellars, under the village bridge and out east.
 */
export const GUIDE_RIVER = way('greenwoldriver', 'The river', [
  [0.180, 0.070], [0.220, 0.140], [0.200, 0.220], [0.160, 0.300],
  [0.130, 0.380], [0.170, 0.440], [0.220, 0.480], [0.270, 0.508],
  [0.300, 0.510], [0.345, 0.518], [0.400, 0.500], [0.460, 0.470],
  [0.520, 0.460], [0.585, 0.448], [0.660, 0.420], [0.740, 0.422],
  [0.840, 0.444], [0.960, 0.466],
]);

/** How much two discs may share before the guide is lying about which is which. */
export const OVERLAP_MAX = 0.25;

/** The area of a circle, and the area two circles share. Both pure. */
const areaOf = (r) => Math.PI * r * r;
export function lensArea(d, r1, r2) {
  if (d >= r1 + r2) return 0;
  if (d <= Math.abs(r1 - r2)) return areaOf(Math.min(r1, r2));
  return r1 * r1 * Math.acos((d * d + r1 * r1 - r2 * r2) / (2 * d * r1))
    + r2 * r2 * Math.acos((d * d + r2 * r2 - r1 * r1) / (2 * d * r2))
    - 0.5 * Math.sqrt((-d + r1 + r2) * (d + r1 - r2) * (d - r1 + r2) * (d + r1 + r2));
}

/** Is this point inside the Standing Hedge's ring? The two exempt pairs are. */
export function insideRing(x, z) {
  const ring = GUIDE_BY_ID.standinghedge;
  return Math.hypot(x - ring.x, z - ring.z) <= ring.r;
}

/**
 * The zone under a world point, smallest first, or null.
 *
 * The ring is an ANNULUS: a point is on it when it is within `band` metres of
 * the circle itself, not when it is anywhere inside. That is what stops a
 * hover anywhere in the middle of the realm reading as "the Standing Hedge"
 * and hiding the village under it.
 *
 * `slack` is extra metres of reach, so a zone two pixels wide is still
 * hoverable at the widest zoom.
 */
export function guideZoneAt(x, z, slack = 0) {
  let best = null;
  for (const g of GUIDE_ZONES) {
    const d = Math.hypot(x - g.x, z - g.z);
    const hit = g.annulus ? Math.abs(d - g.r) <= g.band + slack : d <= g.r + slack;
    if (!hit) continue;
    // the smallest thing you are standing in is the thing you mean
    if (!best || g.r < best.r) best = g;
  }
  return best;
}

/**
 * Everything this file promises, measured at import.
 *
 * Three questions, and every one of them is a thing that has really gone wrong
 * in this project: a place put outside the ground a player may stand on, two
 * boundaries that claim the same field, and a model id that matches nothing so
 * the hover promises a prop that does not exist.
 *
 * `openAt` is the release gate's own line and not a number typed here, so the
 * realm this measures against is the realm the game enforces underfoot.
 */
export function auditGuide(zones = GUIDE_ZONES) {
  const bad = [];
  const realm = ZONE[GUIDE_REALM];
  if (!realm) bad.push(`there is no realm called "${GUIDE_REALM}" for the painting to be of`);
  const seen = new Set();
  const beyondCore = [];
  for (const g of zones) {
    if (seen.has(g.id)) bad.push(`two spaces are called "${g.id}"`);
    seen.add(g.id);
    if (!Number.isFinite(g.x) || !Number.isFinite(g.z)) bad.push(`${g.id} has no place on the ground`);
    else if (!openAt(g.x, g.z)) {
      bad.push(`${g.id} stands at ${Math.round(g.x)}, ${Math.round(g.z)}, ${Math.round(Math.hypot(g.x - realm.x, g.z - realm.z))} m out, which the release gate calls closed ground`);
    } else if (realm && Math.hypot(g.x - realm.x, g.z - realm.z) > realm.r) {
      // Not fatal, and counted rather than hidden: the Kingsroad's camp stands
      // where the road ENTERS the realm, so it is meant to be on the line.
      beyondCore.push(g.id);
    }
    if (!(g.r > 0)) bad.push(`${g.id} has no boundary at all`);
    if (g.annulus && !(g.band > 0)) bad.push(`${g.id} is a ring and has no band, so nothing could ever be inside it`);
    if (!g.line) bad.push(`${g.id} has no line, so a hover over it would say nothing`);
    if (!g.name) bad.push(`${g.id} has no name to write on the map`);
    for (const m of g.models) if (!FOOTPRINT[m]) bad.push(`${g.id} names the model "${m}", which is not a footprint and so is not a thing anybody can place`);
    if (!g.models.length && !g.wanted.length) bad.push(`${g.id} names nothing to put in it, so a hover over it cannot answer the question it is for`);
  }
  // no two discs may claim the same quarter of a field, except inside the ring
  for (let i = 0; i < zones.length; i++) {
    for (let j = i + 1; j < zones.length; j++) {
      const a = zones[i], b = zones[j];
      if (a.annulus || b.annulus) continue;             // a ring is not a disc
      if (insideRing(a.x, a.z) && insideRing(b.x, b.z)) continue;
      const d = Math.hypot(a.x - b.x, a.z - b.z);
      const share = lensArea(d, a.r, b.r) / Math.min(areaOf(a.r), areaOf(b.r));
      if (share > OVERLAP_MAX) {
        bad.push(`${a.id} and ${b.id} share ${Math.round(share * 100)} percent of the smaller one, ${Math.round(d)} m apart, so the guide cannot say which field a thing belongs in`);
      }
    }
  }
  if (bad.length) throw new Error(`auditGuide: ${bad.length} problem(s)\n  ${bad.join('\n  ')}`);
  return {
    zones: zones.length,
    models: zones.reduce((n, g) => n + g.models.length, 0),
    wanted: zones.reduce((n, g) => n + g.wanted.length, 0),
    roads: GUIDE_ROADS.length,
    riverPoints: GUIDE_RIVER.pts.length,
    beyondCore,
  };
}

export const GUIDE_AUDIT = auditGuide();

// ------------------------------------------------------------- the picture --
//
// One image, loaded once, shared by the zone map and the minimap. There is no
// `Image` in node, so out of a browser this settles on 'missing' immediately
// and every caller draws the outlines over the terrain instead. A picture that
// 404s lands in the same place, which is the state the user is in until they
// drop the file in.

const IDLE = Object.freeze({ state: 'idle', img: null, w: 0, h: 0, why: null });
let art = IDLE;
const waiting = new Set();

/** What the picture is doing: 'idle', 'loading', 'ready' or 'missing'. */
export const guideArt = () => art;

/** Called when the picture arrives or is found not to be there. */
export function onGuideArt(fn) {
  if (typeof fn === 'function') waiting.add(fn);
  return () => waiting.delete(fn);
}

function settle(next) {
  art = Object.freeze(next);
  for (const fn of [...waiting]) { try { fn(art); } catch { /* a listener must not stop the others */ } }
  return art;
}

/**
 * Start loading the painting. Safe to call from anywhere and as often as you
 * like: the second call gets the first call's answer.
 *
 * @param opts.Image  the constructor, for a test. Defaults to the browser's.
 */
export function loadGuideArt(opts = {}) {
  if (art.state !== 'idle') return art;
  const Img = opts.Image || (typeof Image !== 'undefined' ? Image : null);
  if (!Img) return settle({ ...IDLE, state: 'missing', why: 'there is no browser here to load a picture with' });
  settle({ ...IDLE, state: 'loading' });
  let im;
  try { im = new Img(); } catch (e) { return settle({ ...IDLE, state: 'missing', why: String(e && e.message || e) }); }
  im.onload = () => settle({
    state: 'ready', img: im, why: null,
    w: im.naturalWidth || im.width || SHEET.w,
    h: im.naturalHeight || im.height || SHEET.h,
  });
  im.onerror = () => settle({ ...IDLE, state: 'missing', why: GUIDE_ART.missing });
  im.src = opts.url || GUIDE_ART.url;
  return art;
}

/** Back to the beginning. For a test, and for nothing else. */
export function resetGuideArt() { art = IDLE; return art; }
