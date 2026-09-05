// The plan of a town, before anything is drawn. Pure: no THREE, no field, no
// terrain, no randomness that is not this file's own.
//
// WHY A PLAN AT ALL.
//
//   `site_models.settlement()` scatters houses on a ring around a well, which
//   is a village and reads as one. The seven precinct towns are the places the
//   sheet writes cast lists for, and a cast needs doors to stand in. So the
//   geometry is decided here, once, as numbers, and three different consumers
//   read the same numbers: `town_models.js` builds the bodies, and
//   `npcs_runtime.streetFor` stands the innkeeper at the inn's door rather
//   than at an angle on a circle.
//
// THE ONE NUMBER EVERYTHING HANGS OFF.
//
//   `zones.TOWN_PRECINCT_R` is 120 m, and `field.js` grades a pad by blending
//   the raw ground into the site's height between `flatR * 0.55` and
//   `flatR + 4`. So the ground is DEAD flat only out to 66 m, and measured on
//   the real field at seed 20260904 the spread across the ring at 70 m is at
//   most 1.1 m and at 96 m it is up to 42.9 m at Cairnfoot. A wall laid at 96
//   would be a wall on a cliff. `WALL_R` is therefore 66: the town proper
//   stands on flat ground and the rest of the precinct is its approach.
//
// WHAT A LOT IS.
//
//   `{ kind, x, z, w, d, yaw, r }` where `w` is the width across the front,
//   `d` the depth back from it, `yaw` the world angle its front faces (the
//   same convention the rest of the world uses: forward is (sin yaw, cos yaw)),
//   and `r` the half diagonal, which is only the early out.
//
//   Two lots are kept apart by `lotsOverlap`, a separating axis test on the two
//   real rectangles at their two real angles. Half diagonals alone would have
//   been simpler and would also have made it impossible to moor a twenty metre
//   ship alongside a twenty metre jetty, because their circles overlap while
//   the hulls are seven metres apart. Every check in `fits` is on the four
//   corners for the same reason: the packing is proved, not eyeballed.
//
//   The dressing goes through the same packer. A trunk, a palm, a stack of cut
//   ice and the ring of standing stones round Hearthhome are all lots with
//   `prop: true`, so `plan.props` is a view of `plan.lots` and the overlap
//   proof already covers them. Dressing laid out by hand beside a packer is
//   dressing standing in somebody's kitchen.
//
// GATES.
//
//   The contract asks for gates facing the roads where they can be read. They
//   cannot be read here: `roads.linksForCell` wants a field and this file has
//   none, and `site_models.buildSiteMarker(site, heightAt)` has none either.
//   Measured on the real field, six of the seven towns have NO road links at
//   all and Cinderport and the Canopy Court have one each, so the cardinal
//   points are not a poor fallback but very nearly the whole truth. Pass
//   `opts.bearings` and they are used instead; `docs/mmo/wiring/T1.md` carries
//   the one line that would supply them.

import { mulberry32, hash2 } from './noise.js';

// ---------------------------------------------------------------- numbers --

/** Radius of the wall, metres. Inside the pad's flat core; see the note above. */
export const WALL_R = 66;
/** The open square at the middle, metres. Nothing is built inside it. */
export const SQUARE_R = 12;
/** The ring street runs round the square at this radius, metres. */
export const RING_R = SQUARE_R + 3.5;
/** Widths of the two kinds of street, metres. */
export const AVENUE_W = 6;
export const RING_W = 5;
/** Metres of daylight left between two buildings. */
export const LOT_GAP = 1.6;
/** Metres a lot keeps off the edge of a street. */
export const STREET_GAP = 0.8;
/** Metres a lot keeps inside the wall, and inside the precinct. */
export const WALL_GAP = 3.5;
export const PRECINCT_GAP = 5;
/** The waystone: a standing stone four metres tall at the square's edge. */
export const WAYSTONE_H = 4;
/**
 * Metres of doorstep kept clear in front of every named building, which has to
 * be at least `npcs_runtime.DOOR_STAND` or the person who keeps that door ends
 * up standing inside whatever the packer put there.
 */
export const DOOR_CLEAR = 2.2;
/** Rings the packer tries, metres from the middle. */
const STALL_RING = 22;
const CIVIC_RING = 31;
const EXTRA_RING = 34;
const HOUSE_RING = 43;
/** How far out the packer will walk from a wanted ring before giving up. */
const RING_REACH = 22;
const RING_STEP = 2.5;
/** How finely it walks round the ring looking for a gap. */
const ANG_STEP = 0.05;

/**
 * The buildings every one of the seven has, exactly once. `npcs_runtime` reads
 * this list to prove that every role it anchors has somewhere to stand.
 */
export const REQUIRED_LOTS = ['inn', 'smith', 'forge', 'healer', 'stable', 'pens', 'bank'];

// --------------------------------------------------------------- palettes --
//
// One palette per realm, read off `site.realm`. Every colour is used by
// `town_models.js` and nothing else, and a town's whole body is built from
// these plus four colours shared by every realm, which is what keeps the draw
// count down: `mergeByMaterial` buckets by colour, so a palette of fourteen is
// a town of about fourteen draws.
//
// Every realm in the sheet has one, including the two with no precinct town,
// because a fifth biome with no axe is how this project has been bitten before.

const P = (id, name, o) => ({ id, name, ...o });
export const PALETTES = {
  greenwold: P('greenwold', 'limewash and thatch', {
    wall: 0xe3dac6, wallDark: 0xc2b69c, roof: 0xb99a5e, roofDark: 0x8b7040,
    timber: 0x5b4530, trim: 0xf2ead7, stone: 0x8d8880, stoneDark: 0x5f5b56,
    dark: 0x2a2622, metal: 0x4a4640, glow: 0xffb44a, banner: 0x7a3f36, ground: 0x6f7f4a,
  }),
  verdant: P('verdant', 'pale wood and blossom', {
    wall: 0xd9caa9, wallDark: 0xb5a488, roof: 0xd98fa8, roofDark: 0xa8657c,
    timber: 0x6a5236, trim: 0xefe4cc, stone: 0x7c7f72, stoneDark: 0x545a4e,
    dark: 0x241f1b, metal: 0x50584c, glow: 0xffd27a, banner: 0x9d5f86, ground: 0x4d6b3c,
  }),
  saltmarch: P('saltmarch', 'weathered plank and tar', {
    wall: 0x9aa39a, wallDark: 0x77806f, roof: 0x4b4744, roofDark: 0x322f2d,
    timber: 0x6b5a44, trim: 0xc9c0aa, stone: 0x7d8078, stoneDark: 0x565a52,
    dark: 0x1c1a18, metal: 0x5a5248, glow: 0xff9a3a, banner: 0x9c2f2f, ground: 0x7c7a5c,
  }),
  emberwastes: P('emberwastes', 'mud brick and awning', {
    wall: 0xd2a97a, wallDark: 0xae8659, roof: 0xbb8f60, roofDark: 0x8e6b45,
    timber: 0x8a6a44, trim: 0xe8d3ad, stone: 0xc0a888, stoneDark: 0x94795c,
    dark: 0x322418, metal: 0x6a5c48, glow: 0xffc463, banner: 0x2f6f74, ground: 0xd9c69a,
  }),
  stormpeaks: P('stormpeaks', 'granite, turf and slate', {
    wall: 0x8a8b86, wallDark: 0x6a6b66, roof: 0x5c6f42, roofDark: 0x3f4d2e,
    timber: 0x5f4a34, trim: 0xa9aaa4, stone: 0x767a7e, stoneDark: 0x4d5155,
    dark: 0x24262a, metal: 0x484c50, glow: 0xffbe6a, banner: 0x3b5878, ground: 0x6b6a4e,
  }),
  frostreach: P('frostreach', 'pale timber and ice', {
    wall: 0xb9a888, wallDark: 0x938467, roof: 0xa9c6d8, roofDark: 0x74919f,
    timber: 0x6a5540, trim: 0xdce6ec, stone: 0x7f8790, stoneDark: 0x585f66,
    dark: 0x1e242a, metal: 0x545a60, glow: 0x9fd8ff, banner: 0x2f5a6e, ground: 0xd6dee6,
  }),
  ashenthrone: P('ashenthrone', 'black stone and brass', {
    wall: 0x35322f, wallDark: 0x232120, roof: 0x9a7b3a, roofDark: 0x6f5828,
    timber: 0x4a3d33, trim: 0xb99a52, stone: 0x413c39, stoneDark: 0x2c2926,
    dark: 0x100e0d, metal: 0x7a6a3e, glow: 0xff6a2a, banner: 0x8c2018, ground: 0x2a2624,
  }),
  boneyard: P('boneyard', 'bone and grey timber', {
    wall: 0xcfc7b0, wallDark: 0xa8a08b, roof: 0x6e6a60, roofDark: 0x4b4842,
    timber: 0x5a544a, trim: 0xe3dcc8, stone: 0x8b877c, stoneDark: 0x5e5b53,
    dark: 0x201e1c, metal: 0x4f4c46, glow: 0xd8e2a0, banner: 0x4a4340, ground: 0x9c968a,
  }),
  sunkenkingdom: P('sunkenkingdom', 'white marble and coral', {
    wall: 0xe4e0d4, wallDark: 0xc0bcae, roof: 0x6f9aa2, roofDark: 0x4a6f77,
    timber: 0x7a6a52, trim: 0xf4f1e8, stone: 0xc8c4b6, stoneDark: 0x8f8b7e,
    dark: 0x1b2226, metal: 0x5a6a6e, glow: 0x8fe0d8, banner: 0x2f6f8a, ground: 0xbcc6b8,
  }),
};

/** The colours every realm shares, because they are the same thing everywhere. */
export const COMMON = { water: 0x2c4c58, gold: 0xd8b25a, coal: 0x3a1c10, sand: 0xcbbb96 };

// ------------------------------------------------------------- the seven ---
//
// One row per precinct town, keyed by the place id in realms.js. Every row is
// written from that place's own `geography` line and nothing else. The `note`
// is what the place is in one breath, and it is what the marker says.

const S = (o) => o;
export const TOWN_SPECS = {
  hearthhome: S({
    realm: 'greenwold', wall: 'drystone', gates: 4, wallR: WALL_R,
    inn: [18, 12, 'gabled'], centre: 'well', houses: 16, stalls: 6,
    extras: [['church', 14, 10], ['granary', 7, 7], ['smokehouse', 8, 7]],
    props: [['ringstone', 1.6, 1.1, 9, 104, 'beyond'], ['haystack', 3.2, 3.2, 4, 76, 'beyond']],
    note: 'A village on a green inside the ring of stones, with a church, an inn and a smith.',
  }),
  canopycourt: S({
    realm: 'verdant', wall: 'thorn', gates: 3, wallR: WALL_R,
    inn: [17, 12, 'gabled'], centre: 'fountain', houses: 14, stalls: 7,
    extras: [['court', 17, 12], ['butts', 11, 4], ['loom', 9, 7]],
    // Eight giants in the streets and the ninth inside the castle: the
    // Speaker's Tree is a trunk like the rest of them with a hall built round
    // its bole. Measured: with the keep taking a quarter of the walled ground
    // the ninth trunk had nowhere left to stand, and a giant standing in the
    // keep is a better answer than a giant the packer quietly dropped.
    props: [['trunk', 4.6, 4.6, 8, 30, 'inside']],
    note: 'A court under the blossom crowns, lantern lit, rope walks between the trunks.',
  }),
  redqueensharbour: S({
    realm: 'saltmarch', wall: 'palisade', gates: 3, wallR: WALL_R,
    inn: [19, 12, 'gabled'], centre: 'well', houses: 12, stalls: 6,
    extras: [['warehouse', 15, 9], ['warehouse', 13, 9], ['warehouse', 12, 8], ['gallows', 4, 4], ['salvage', 10, 8]],
    props: [['netrack', 3.0, 2.2, 6, 27, 'inside'], ['tarbarrels', 2.4, 2.4, 4, 40, 'inside']],
    // measured on the real field at seed 20260904: the ground falls away east
    // south east and crosses SEA_LEVEL at about 114 m. town_models measures it
    // again at build time and overrides this.
    port: { bearing: 1.963, shoreR: 114, jetties: 3, hulls: 3, mole: true },
    note: 'The pirate port: jetties over the flats, hulls at anchor, warehouses and a gallows.',
  }),
  lastwell: S({
    realm: 'emberwastes', wall: 'mudbrick', gates: 3, wallR: WALL_R,
    inn: [20, 13, 'flat'], centre: 'sweetwell', houses: 14, stalls: 7,
    extras: [['caravanserai', 17, 11], ['cistern', 8, 8], ['palmyard', 10, 10]],
    props: [['palm', 3.2, 3.2, 10, 26, 'inside']],
    note: 'A walled oasis town around the one sweet well, awnings over a market that moves.',
  }),
  cairnfoot: S({
    realm: 'stormpeaks', wall: 'drystone', gates: 3, wallR: WALL_R,
    inn: [17, 12, 'gabled'], centre: 'well', houses: 15, stalls: 5,
    extras: [['brewhouse', 13, 9], ['fold', 15, 11], ['cairn', 3, 3]],
    props: [['ridgecairn', 2.2, 2.0, 7, 80, 'beyond']],
    note: 'Stone and turf under the cliff, sheep in the fold and a brewhouse going.',
  }),
  coldseat: S({
    realm: 'frostreach', wall: 'palisade', gates: 3, wallR: WALL_R,
    inn: [25, 14, 'hall'], centre: 'well', houses: 12, stalls: 5,
    extras: [['forgehouse', 13, 10], ['drying', 11, 6], ['icehouse', 9, 8]],
    props: [['icecut', 2.0, 2.0, 12, 25, 'inside']],
    note: 'The giants\' hall at the glacier\'s mouth, whale ribs over the roof, fires big as houses.',
  }),
  cinderport: S({
    realm: 'ashenthrone', wall: 'blackstone', gates: 3, wallR: WALL_R,
    inn: [18, 12, 'flat'], centre: 'fountain', houses: 12, stalls: 5,
    extras: [['barracks', 19, 11], ['warehouse', 14, 9], ['warehouse', 13, 9], ['block', 5, 5]],
    props: [['stack', 2.8, 2.8, 8, 37, 'inside']],
    // measured the same way: the sea is deep off the west north west and the
    // shore crosses SEA_LEVEL at about 86 m.
    port: { bearing: 5.367, shoreR: 86, jetties: 3, hulls: 3, mole: false },
    note: 'The Legion\'s harbour town on black sand, brass on every roof, barges at the quay.',
  }),
};

// ------------------------------------------------------------------ maths --

const TAU = Math.PI * 2;
const norm = (a) => { let v = a % TAU; if (v < 0) v += TAU; return v; };
/** The signed angle from a to b, in (-PI, PI]. */
export function angDiff(a, b) { let d = norm(b) - norm(a); while (d > Math.PI) d -= TAU; while (d <= -Math.PI) d += TAU; return d; }
const fwd = (yaw) => [Math.sin(yaw), Math.cos(yaw)];

/** Metres from the point (px, pz) to the segment (x1, z1)-(x2, z2). */
export function segDist(px, pz, x1, z1, x2, z2) {
  const dx = x2 - x1, dz = z2 - z1;
  const len2 = dx * dx + dz * dz;
  let t = len2 > 1e-9 ? ((px - x1) * dx + (pz - z1) * dz) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(px - (x1 + dx * t), pz - (z1 + dz * t));
}

/** The half diagonal of a w by d rectangle: the circle that always holds it. */
export const lotRadius = (w, d) => Math.hypot(w, d) / 2;

/**
 * The four corners of a lot in world space. `w` runs across the front and `d`
 * runs back from it along the way the lot faces, which is the convention the
 * whole world uses: forward is (sin yaw, cos yaw).
 */
export function lotCorners(lot, grow = 0) {
  const [fx, fz] = fwd(lot.yaw);
  const rx = fz, rz = -fx;                 // the lot's own right hand
  const hw = lot.w / 2 + grow, hd = lot.d / 2 + grow;
  const out = [];
  for (const [sw, sd] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) {
    out.push([lot.x + rx * hw * sw + fx * hd * sd, lot.z + rz * hw * sw + fz * hd * sd]);
  }
  return out;
}

/**
 * Whether two lots overlap once each is grown by half of `gap`.
 *
 * Two rectangles at any two angles: the separating axis test on their four
 * edge normals, which is exact. The half diagonals are the early out, because
 * most pairs in a town are nowhere near each other and this runs a few thousand
 * times while a town is packed.
 */
export function lotsOverlap(a, b, gap = 0) {
  const g = gap / 2;
  if (Math.hypot(a.x - b.x, a.z - b.z) > lotRadius(a.w + gap, a.d + gap) + lotRadius(b.w + gap, b.d + gap)) return false;
  const ca = lotCorners(a, g), cb = lotCorners(b, g);
  for (const [p, q] of [[ca, cb], [cb, ca]]) {
    for (let i = 0; i < 2; i++) {
      const ax = p[i + 1][0] - p[i][0], az = p[i + 1][1] - p[i][1];
      const nx = -az, nz = ax;
      let lo1 = Infinity, hi1 = -Infinity, lo2 = Infinity, hi2 = -Infinity;
      for (const c of p) { const v = c[0] * nx + c[1] * nz; if (v < lo1) lo1 = v; if (v > hi1) hi1 = v; }
      for (const c of q) { const v = c[0] * nx + c[1] * nz; if (v < lo2) lo2 = v; if (v > hi2) hi2 = v; }
      if (hi1 < lo2 || hi2 < lo1) return false;
    }
  }
  return true;
}

/** Where somebody stands to be at this building's door, and which way they look. */
export function doorOf(lot, out = 1.7) {
  const [fx, fz] = fwd(lot.yaw);
  return { x: lot.x + fx * (lot.d / 2 + out), z: lot.z + fz * (lot.d / 2 + out), yaw: lot.yaw };
}

/** Whether (x, z) stands on this lot's rectangle, grown by `grow` metres. */
export function pointInLot(lot, x, z, grow = 0) {
  const [fx, fz] = fwd(lot.yaw);
  const u = (x - lot.x) * fz - (z - lot.z) * fx;   // across the front
  const v = (x - lot.x) * fx + (z - lot.z) * fz;   // back from it
  return Math.abs(u) <= lot.w / 2 + grow && Math.abs(v) <= lot.d / 2 + grow;
}

// ------------------------------------------------------------------- keep --
//
// THE CASTLE AT THE BACK OF THE TOWN.
//
//   Rule 5 of the look book asks for a castle with a keep, and rule 9 asks for
//   a tower above the roofline. Before this there were five castles in the
//   world, all of them rolled, and the nearest was five kilometres from the
//   start, because `structures.js` only rolls a `castle` beside a rolled
//   village. The seven authored towns are the seats the sheet writes rulers
//   for, so each of them now holds one.
//
//   The keep is a PRECINCT and not a building: an annular sector of the walled
//   town, from just outside the ring street to the town wall itself, at the
//   back, which is the arc opposite the main gate. Its own inner wall closes
//   it off from the streets and its gate opens onto the street that runs from
//   the square. Every other lot is forbidden the ground inside it and the
//   keep's own lots are forbidden the ground outside it, both by `keepFit` in
//   the packer, so the exclusion is proved by the same separating axis work
//   that keeps two houses apart.
//
// HOW WIDE.
//
//   The target is a quarter of the walled area. The area of the sector is
//   `half * (rOut^2 - rIn^2)`, so the half angle a quarter wants is
//   `0.25 * PI * wallR^2 / (rOut^2 - rIn^2)`, which is 49.6 degrees at the
//   seven's numbers. It is then clamped so the keep's side walls never cross
//   an avenue: the avenue nearest the back, less the angle its own kerb takes
//   at the keep's inner radius. Six of the seven have a gate 60 degrees away
//   on each side and lose half a degree to that; Hearthhome has four gates and
//   one of them stands dead at the back.
//
// THE GATE THAT THE KEEP SWALLOWS.
//
//   Where a town gate already points at the keep's ground (Hearthhome's north
//   gate, and the Red Queen's harbour mouth) the keep does not fight it: that
//   gate becomes the castle's own outer gate, its avenue runs through the
//   courtyard, and the great tower stands to one side of the road rather than
//   across it. Everywhere else the keep is closed at the back by the town wall
//   and a new `keepway` street is cut from the square to its gate.

/** The share of the walled area a keep precinct wants. */
export const KEEP_TARGET = 0.25;
/** Metres of daylight between the keep's wall line and anything either side. */
export const KEEP_GAP = 1.6;
/** A precinct narrower than this is not a castle; the town says so and has none. */
export const KEEP_MIN_HALF = 0.45;
/** A wall smaller than this has no room for a keep behind the ring street. */
export const KEEP_MIN_WALL_R = 46;
/** The open court inside the keep's gate, metres. */
export const KEEP_COURT_R = 8;
/** Half the width of the keep's own gate, in radians at its inner wall. */
const KEEP_GATE_W = 7;

/** The seven ways a keep is built. `town_models` has a body for each. */
export const KEEP_STYLES = ['manor', 'greattree', 'seafort', 'wellkeep', 'cragkeep', 'icehall', 'citadel'];

/**
 * One row per town, written off that place's own line in `realms.js` and the
 * story in `docs/mmo/14-KALDERA.md`. `towerH` is the height of the great
 * tower's shaft in metres and is what makes it show over the roofs; the bodies
 * add a roof, a dome or a mast on top of it.
 *
 * Every footprint here is smaller than that town's inn, because the inn is the
 * largest building on the town's streets and the test says so. The great hall
 * stands behind the castle's own wall and is not on a street.
 */
export const KEEP_SPECS = {
  hearthhome: {
    style: 'manor', name: 'The Manor', towerH: 19,
    tower: [10, 10], hall: [14, 10], corner: [5, 5],
    note: 'A stone manor with one tower, a hall and a walled yard, which is all a village that has never lost anything has ever needed.',
  },
  canopycourt: {
    style: 'greattree', name: 'The Speaker\'s Tree', towerH: 28,
    tower: [11, 11], hall: [15, 11], corner: [5, 5],
    note: 'The Court\'s seat is a tree: a hall built round the bole of the oldest giant, platforms up it, lanterns to the crown.',
  },
  redqueensharbour: {
    style: 'seafort', name: 'The Red Fort', towerH: 22,
    tower: [13, 13], hall: [15, 11], corner: [6, 6],
    note: 'A sea fort across the harbour mouth with a ship\'s mast for a lighthouse, and every load that lands passes under it.',
  },
  lastwell: {
    style: 'wellkeep', name: 'The Wellkeep', towerH: 24,
    tower: [12, 12], hall: [16, 11], corner: [6, 6],
    note: 'A mudbrick tower standing on four piers over a shaft to the same sweet water, so whoever holds the keep can close the well.',
  },
  cairnfoot: {
    style: 'cragkeep', name: 'The Crag Keep', towerH: 25,
    tower: [12, 12], hall: [14, 10], corner: [5, 5],
    note: 'Half a tower and half a cliff: the keep is cut into the crag at the town\'s back and the rock is the other two walls.',
  },
  coldseat: {
    style: 'icehall', name: 'The Cold Seat', towerH: 24,
    tower: [13, 13], hall: [18, 12], corner: [6, 6],
    note: 'The seat the town is named for: a timber tower packed with cut glacier ice, blue at night, with the Thane\'s hall beside it.',
  },
  cinderport: {
    style: 'citadel', name: 'The Black Citadel', towerH: 26,
    tower: [14, 14], hall: [15, 11], corner: [6, 6],
    note: 'The Legion\'s citadel in black stone and brass, nine skulls over the gate and a banner for each of them.',
  },
};

/**
 * How deep inside the keep the point (x, z) stands, in metres. Negative is
 * outside it. It is the smallest of the three clearances the sector has: to
 * the inner arc, to the town wall, and sideways to the nearer radial wall.
 */
export function keepDepth(keep, x, z) {
  const dx = x - keep.x, dz = z - keep.z;
  const r = Math.hypot(dx, dz);
  const da = Math.abs(angDiff(keep.bearing, Math.atan2(dx, dz)));
  const t = keep.half - da;
  // beyond a quarter turn the chord is no longer the distance to the side wall,
  // and the point is a long way outside anyway
  const dAng = Math.abs(t) >= Math.PI / 2 ? (t > 0 ? r : -r) : Math.sin(t) * r;
  return Math.min(r - keep.rIn, keep.rOut - r, dAng);
}

/** The keep's own wall line, as points about `step` metres apart. */
export function keepRim(keep, step = 2) {
  const out = [];
  for (const r of [keep.rIn, keep.rOut]) {
    const n = Math.max(2, Math.ceil((2 * keep.half * r) / step));
    for (let i = 0; i <= n; i++) {
      const a = keep.bearing - keep.half + (i / n) * 2 * keep.half;
      out.push([keep.x + Math.sin(a) * r, keep.z + Math.cos(a) * r]);
    }
  }
  for (const s of [-1, 1]) {
    const a = keep.bearing + s * keep.half;
    const n = Math.max(2, Math.ceil((keep.rOut - keep.rIn) / step));
    for (let i = 0; i <= n; i++) {
      const r = keep.rIn + (i / n) * (keep.rOut - keep.rIn);
      out.push([keep.x + Math.sin(a) * r, keep.z + Math.cos(a) * r]);
    }
  }
  return out;
}

const RIMS = new WeakMap();
const rimOf = (keep) => { let r = RIMS.get(keep); if (!r) { r = keepRim(keep); RIMS.set(keep, r); } return r; };

/** Corners, edge midpoints and quarter points of a lot: what `keepFit` reads. */
function lotSamples(lot) {
  const c = lotCorners(lot);
  const out = [[lot.x, lot.z]];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    out.push(c[i]);
    for (const t of [0.25, 0.5, 0.75]) {
      out.push([c[i][0] + (c[j][0] - c[i][0]) * t, c[i][1] + (c[j][1] - c[i][1]) * t]);
    }
  }
  return out;
}

/**
 * Whether a lot stands wholly inside the keep (1), wholly outside it (-1), or
 * across its wall (0). Both answers are load bearing: a keep lot has to be 1
 * and every other lot has to be -1, and a lot that straddles the wall is
 * refused whichever it belongs to.
 *
 * The lot is read at thirteen points and the keep's wall line at ninety odd,
 * because a long thin building can step over the sector's corner with all four
 * of its own corners outside.
 */
export function keepFit(keep, lot) {
  const dc = keepDepth(keep, lot.x, lot.z);
  const reach = lot.r + KEEP_GAP + 0.5;
  if (dc > reach) return 1;
  if (dc < -reach) return -1;
  let lo = Infinity, hi = -Infinity;
  for (const [x, z] of lotSamples(lot)) {
    const d = keepDepth(keep, x, z);
    if (d < lo) lo = d;
    if (d > hi) hi = d;
  }
  if (lo >= KEEP_GAP) return 1;
  if (hi <= -KEEP_GAP) {
    for (const [x, z] of rimOf(keep)) if (pointInLot(lot, x, z, KEEP_GAP)) return 0;
    return -1;
  }
  return 0;
}

// ----------------------------------------------------------------- layout --

/**
 * The plan of one authored precinct town, or null for anything else.
 *
 * @param site  an authored site: needs `sub`, `realm`, `x`, `z`, `flatR` and
 *              (for the seed) `cx`, `cz`. A rolled town has no `sub` and gets
 *              null back, which is what makes `site_models` fall through to the
 *              village it has always built.
 * @param seed  the world seed, so two clients lay the same town out
 * @param opts.bearings  world angles the gates face, if a caller can read the
 *              roads. Cardinal points when it cannot.
 * @param opts.port      { bearing, shoreR } measured off the real ground, for
 *              the two harbour towns. The spec's own measurement stands in.
 */
export function layoutTown(site, seed = 0, opts = {}) {
  if (!site || !site.authored) return null;
  const spec = TOWN_SPECS[site.sub];
  if (!spec) return null;

  const cx = site.x, cz = site.z;
  const precinctR = site.flatR || 120;
  const wallR = Math.min(spec.wallR, precinctR - 30);
  const palette = PALETTES[site.realm] || PALETTES.greenwold;
  const rng = mulberry32((hash2(site.cx | 0, site.cz | 0, 0x7047) ^ (seed >>> 0)) >>> 0);
  /** A stream of its own for house heights, so adding them moved nothing. */
  const hrng = mulberry32((hash2(site.cx | 0, site.cz | 0, 0x7051) ^ (seed >>> 0)) >>> 0);

  // ---- the port, if this is one ------------------------------------------
  let port = null;
  if (spec.port) {
    const bearing = opts.port?.bearing ?? spec.port.bearing;
    const shoreR = opts.port?.shoreR ?? spec.port.shoreR;
    // The quay stands back from the water line, and the jetties reach out past
    // it. Both are clamped inside the precinct, because a jetty that leaves the
    // pad is a jetty hanging over whatever the world put there.
    const quayR = Math.max(wallR + 8, Math.min(shoreR - 8, precinctR - 26));
    const reach = Math.min(precinctR - PRECINCT_GAP - quayR, 22);
    port = { bearing: norm(bearing), shoreR, quayR, reach, half: 0.95, mole: !!spec.port.mole };
  }

  // ---- gates --------------------------------------------------------------
  const nGates = spec.gates;
  let bearings;
  if (Array.isArray(opts.bearings) && opts.bearings.length) {
    bearings = opts.bearings.slice(0, 4).map(norm);
  } else {
    // The cardinal points, turned a quarter step for a town of three so that
    // no gate ever opens straight onto the harbour mouth by accident.
    const turn = nGates === 4 ? 0 : Math.PI / 4;
    bearings = [];
    for (let i = 0; i < nGates; i++) bearings.push(norm(turn + (i / nGates) * TAU));
  }
  // A harbour town's water side is a mouth in the wall, not a gate with doors,
  // and no land gate is allowed to sit in it.
  if (port) {
    bearings = bearings.filter((b) => Math.abs(angDiff(b, port.bearing)) > port.half + 0.35);
    while (bearings.length < 2) bearings.push(norm(port.bearing + Math.PI + (bearings.length - 1) * 0.9));
  }

  const gates = bearings.map((b, i) => ({
    kind: 'gate', i, bearing: b, w: 7,
    x: cx + Math.sin(b) * wallR, z: cz + Math.cos(b) * wallR,
    yaw: norm(b + Math.PI),                    // the gate looks back into the town
  }));
  if (port) {
    gates.push({
      kind: 'harbour', i: gates.length, bearing: port.bearing, w: 2 * wallR * Math.sin(port.half),
      x: cx + Math.sin(port.bearing) * wallR, z: cz + Math.cos(port.bearing) * wallR,
      yaw: norm(port.bearing + Math.PI),
    });
  }

  const wall = {
    kind: spec.wall, r: wallR,
    thickness: spec.wall === 'blackstone' ? 2.2 : spec.wall === 'palisade' || spec.wall === 'thorn' ? 1.0 : 1.4,
    height: spec.wall === 'blackstone' ? 7 : spec.wall === 'drystone' ? 2.6 : spec.wall === 'mudbrick' ? 5 : 4.2,
    gaps: gates.map((g) => ({
      kind: g.kind, bearing: g.bearing,
      half: g.kind === 'harbour' ? port.half : Math.asin(Math.min(1, (g.w / 2) / wallR)),
    })),
  };

  // ---- the square ---------------------------------------------------------
  const square = {
    x: cx, z: cz, r: SQUARE_R,
    centre: { kind: spec.centre, x: cx, z: cz, r: spec.centre === 'sweetwell' ? 3.2 : 2.2 },
  };

  // The outer edge of the ring street, which is the first radius a lot may use
  // and the radius the keep's inner wall stands two metres beyond.
  const CHORDS = 18;
  const ringOuter = RING_R + RING_W / 2 + (RING_R * (1 - Math.cos(Math.PI / CHORDS)));

  // ---- the keep precinct ---------------------------------------------------
  const keepSpec = KEEP_SPECS[site.sub];
  let keep = null;
  let keepNote = '';
  if (!keepSpec) {
    keepNote = `${site.sub} has no row in KEEP_SPECS, so it has no castle`;
  } else if (wallR < KEEP_MIN_WALL_R) {
    keepNote = `${site.name || site.sub}: the wall stands at ${wallR.toFixed(1)} m and a keep needs ${KEEP_MIN_WALL_R} m, so there is no castle here`;
  } else {
    const rIn = ringOuter + 2;
    const rOut = wallR;
    const back = norm(gates[0].bearing + Math.PI);
    // A gate that already points at the keep's ground becomes the castle's own
    // outer gate rather than something the castle has to dodge.
    let own = null;
    for (const g of gates) {
      const d = Math.abs(angDiff(g.bearing, back));
      if (d < 0.22 && (!own || d < Math.abs(angDiff(own.bearing, back)))) own = g;
    }
    // Otherwise the castle sits in the middle of the ground the streets leave
    // at the back, which is not always dead opposite the main gate: Cinderport
    // has its harbour mouth 45 degrees off the back, and a keep centred on the
    // back would have had a fifth of the room a keep centred in the gap has.
    let bearing = back;
    if (!own) {
      let lo = -Math.PI, hi = Math.PI;
      for (const g of gates) {
        const d = angDiff(back, g.bearing);
        if (d >= 0 && d < hi) hi = d;
        if (d < 0 && d > lo) lo = d;
      }
      bearing = norm(back + (lo + hi) / 2);
    }
    // as wide as a quarter of the walled area wants, and no wider than the
    // nearest avenue's kerb allows
    const kerb = Math.asin(Math.min(0.9, (AVENUE_W / 2 + STREET_GAP) / rIn));
    let halfMax = Math.PI;
    for (const g of gates) {
      if (own && g === own) continue;
      const d = Math.abs(angDiff(g.bearing, bearing)) - kerb;
      if (d < halfMax) halfMax = d;
    }
    const halfArea = (KEEP_TARGET * Math.PI * wallR * wallR) / (rOut * rOut - rIn * rIn);
    const half = Math.min(halfMax, halfArea);
    if (half < KEEP_MIN_HALF) {
      keepNote = `${site.name || site.sub}: the widest precinct the streets leave at the back is ${(half * 2 * 180 / Math.PI).toFixed(0)} degrees, which is no castle, so there is none`;
    } else {
      const axis = own ? own.bearing : bearing;
      keep = {
        kind: 'keep', style: keepSpec.style, name: keepSpec.name, note: keepSpec.note,
        x: cx, z: cz, bearing, axis, half, rIn, rOut,
        from: norm(bearing - half), to: norm(bearing + half),
        /** The gate that lets the town in, on the street that runs to the square. */
        gate: {
          kind: 'keepgate', bearing: axis, w: KEEP_GATE_W,
          half: Math.asin(Math.min(1, (KEEP_GATE_W / 2) / rIn)),
          x: cx + Math.sin(axis) * rIn, z: cz + Math.cos(axis) * rIn,
          yaw: norm(axis + Math.PI),
        },
        /** The gate through the town wall the castle keeps for itself, or null. */
        outerGate: own ? own.i : null,
        through: !!own,
        courtyard: {
          x: cx + Math.sin(axis) * (rIn + KEEP_COURT_R + 2.5),
          z: cz + Math.cos(axis) * (rIn + KEEP_COURT_R + 2.5),
          r: KEEP_COURT_R,
        },
        towerH: keepSpec.towerH,
        area: half * (rOut * rOut - rIn * rIn),
        fraction: (half * (rOut * rOut - rIn * rIn)) / (Math.PI * wallR * wallR),
        /** Where the keep's outer arc is open water instead of town wall. */
        sea: null,
      };
      if (port) {
        const off = angDiff(bearing, port.bearing);
        const lo = Math.max(-half, off - port.half);
        const hi = Math.min(half, off + port.half);
        if (hi > lo + 0.02) keep.sea = { from: norm(bearing + lo), to: norm(bearing + hi), lo, hi };
      }
    }
  }

  // ---- the streets ---------------------------------------------------------
  const streets = [];
  for (const g of gates) {
    const [sx, sz] = fwd(g.bearing);
    const from = SQUARE_R + 1.5;
    // Every street stops just outside the wall. The ground between the wall and
    // the quay is the town's own and the jetties beyond it are not streets, so
    // running the quay way further would only forbid the jetties their water.
    const to = wallR + 5;
    streets.push({
      kind: g.kind === 'harbour' ? 'quayway' : 'avenue', bearing: g.bearing, w: AVENUE_W,
      x1: cx + sx * from, z1: cz + sz * from, x2: cx + sx * to, z2: cz + sz * to,
    });
  }
  // The way to the castle: the square's main street, carried on to the keep's
  // gate. Where a town gate stands at the back its avenue is already that
  // street and runs on through the courtyard, so nothing is added.
  if (keep && !keep.through) {
    const [sx, sz] = fwd(keep.axis);
    streets.push({
      kind: 'keepway', bearing: keep.axis, w: AVENUE_W,
      x1: cx + sx * (SQUARE_R + 1.5), z1: cz + sz * (SQUARE_R + 1.5),
      x2: keep.gate.x, z2: keep.gate.z,
    });
  }
  for (let i = 0; i < CHORDS; i++) {
    const a1 = (i / CHORDS) * TAU, a2 = ((i + 1) / CHORDS) * TAU;
    streets.push({
      kind: 'ring', w: RING_W,
      x1: cx + Math.sin(a1) * RING_R, z1: cz + Math.cos(a1) * RING_R,
      x2: cx + Math.sin(a2) * RING_R, z2: cz + Math.cos(a2) * RING_R,
    });
  }

  // ---- the waystone --------------------------------------------------------
  // At the square's edge, between two avenues so it never stands in a street.
  const wsA = norm(gates[0].bearing + Math.PI / nGates + 0.18);
  const waystone = {
    x: cx + Math.sin(wsA) * (SQUARE_R - 0.4), z: cz + Math.cos(wsA) * (SQUARE_R - 0.4),
    yaw: norm(wsA + Math.PI), h: WAYSTONE_H, r: 1.4,
  };

  // ---- the packer ----------------------------------------------------------
  const lots = [];
  const blocked = [{ x: waystone.x, z: waystone.z, r: waystone.r + 1.2 }];
  // A gate's own arch is a place nothing may be built. A harbour mouth is not
  // an arch, it is open water a hundred metres across, and blocking it would
  // forbid the jetties the very ground they are for.
  for (const g of gates) if (g.kind !== 'harbour') blocked.push({ x: g.x, z: g.z, r: g.w / 2 + 2 });
  // The castle's court and the arch of its gate: open ground, the way the
  // square is open ground, and the keep's own bodies keep off it too.
  if (keep) {
    blocked.push({ x: keep.courtyard.x, z: keep.courtyard.z, r: keep.courtyard.r });
    blocked.push({ x: keep.gate.x, z: keep.gate.z, r: keep.gate.w / 2 + 2 });
  }

  /**
   * Whether a lot may stand where it has been put. Every test is on the lot's
   * four real corners, so nothing here is a guess about a rotated rectangle.
   */
  function fits(lot) {
    const corners = lotCorners(lot);
    let near = Infinity, far = -Infinity;
    for (const [x, z] of corners) {
      const d = Math.hypot(x - cx, z - cz);
      if (d < near) near = d;
      if (d > far) far = d;
    }
    if (far > precinctR - PRECINCT_GAP) return false;
    if (near < ringOuter + 1) return false;
    if (lot.beyond) {
      // Open country between the wall and the precinct's edge: the ring of
      // stones Hearthhome stands inside, the cairns on the road to Cairnfoot.
      // It crosses no wall because it never touches one.
      if (near < wallR + 5) return false;
    } else if (!lot.outside) {
      if (far > wallR - WALL_GAP) return false;
    } else {
      if (near < wallR + 2) return false;
      // Anything outside the wall stands in the harbour mouth, corner for
      // corner. A land gate's arch is seven metres wide and is a road, not a
      // berth, so it does not count: without that a jetty drifts round the ring
      // and moors itself in the front door.
      for (const [x, z] of corners) {
        const a = Math.atan2(x - cx, z - cz);
        let inGap = false;
        for (const gp of wall.gaps) if (gp.kind === 'harbour' && Math.abs(angDiff(a, gp.bearing)) <= gp.half) inGap = true;
        if (!inGap) return false;
      }
    }
    for (const s of streets) {
      // a street's own clearance is measured off the lot's corners as well
      for (const [x, z] of corners) {
        if (segDist(x, z, s.x1, s.z1, s.x2, s.z2) < s.w / 2 + STREET_GAP) return false;
      }
      // and off its middle, for a lot short enough to straddle a narrow street
      if (segDist(lot.x, lot.z, s.x1, s.z1, s.x2, s.z2) < s.w / 2 + STREET_GAP) return false;
    }
    for (const b of blocked) {
      if (lotsOverlap(lot, { x: b.x, z: b.z, w: b.r * 2, d: b.r * 2, yaw: 0 }, LOT_GAP)) return false;
    }
    // The castle's ground is the castle's. A keep lot has to be wholly inside
    // the precinct and everything else wholly outside it, and a body lying
    // across the keep's wall belongs to neither.
    if (keep) {
      const side = keepFit(keep, lot);
      if (lot.keep ? side !== 1 : side !== -1) return false;
    }
    for (const l of lots) if (lotsOverlap(lot, l, LOT_GAP)) return false;
    return true;
  }

  /**
   * Put one building down at the first free spot at or near `ring`, starting
   * from the angle `want` and walking both ways. Deterministic, and it answers
   * null rather than overlapping anything.
   */
  function place(kind, w, d, ring, want, o = {}) {
    const steps = Math.ceil(Math.PI / ANG_STEP);
    for (let dr = 0; dr <= RING_REACH; dr += RING_STEP) {
      for (const rs of dr === 0 ? [0] : [dr, -dr]) {
        const r = ring + rs;
        if (r < 4) continue;
        for (let k = 0; k <= steps; k++) {
          for (const as of k === 0 ? [0] : [1, -1]) {
            const a = want + as * k * ANG_STEP;
            const x = cx + Math.sin(a) * r, z = cz + Math.cos(a) * r;
            const yaw = o.yaw != null ? o.yaw : norm(Math.atan2(cx - x, cz - z));
            const lot = { kind, x, z, w, d, yaw: o.radial ? norm(a + Math.PI) : yaw, r: lotRadius(w, d), ring: r, bearing: norm(a) };
            if (o.outside) lot.outside = true;
            if (o.beyond) lot.beyond = true;
            if (o.prop) lot.prop = true;
            if (o.keep) lot.keep = true;
            if (o.h) lot.h = o.h;
            if (o.name) lot.name = o.name;
            if (!fits(lot)) continue;
            lots.push(lot);
            return lot;
          }
        }
      }
    }
    return null;
  }

  // ---- what goes down, and in what order ----------------------------------
  // The order is the order of importance: the inn takes the best frontage on
  // the square, then the trades, then the extras this realm brings, then the
  // stalls in the gaps, then houses out to the wall.
  /**
   * The doorstep of a building somebody keeps is not building ground.
   * `npcs_runtime` stands the innkeeper, the smith, the healer, the
   * stablemaster and the banker `DOOR_STAND` = 2.0 m out from their own front
   * wall, and the packer only leaves `LOT_GAP` = 1.6 m of daylight between two
   * lots, so without this a town can pack something into a doorway and put the
   * person who keeps it inside. It did: the Last Well grew a palm tree in the
   * inn's door the first time the castle moved anything.
   */
  const doorstep = (lot) => {
    if (!lot) return lot;
    const at = doorOf(lot, DOOR_CLEAR);
    blocked.push({ x: at.x, z: at.z, r: DOOR_CLEAR * 0.55 });
    return lot;
  };

  // The castle goes down first, because it is the one thing here whose place
  // is decided by the town's shape and not by what is left over.
  if (keep) {
    const axis = keep.axis;
    const side = Math.min(0.62, keep.half * 0.52);
    const backR = Math.min(keep.rIn + 28, keep.rOut - 14);
    const tower = doorstep(place('keeptower', keepSpec.tower[0], keepSpec.tower[1],
      keep.through ? Math.min(keep.rIn + 24, keep.rOut - 14) : backR,
      keep.through ? axis + side : axis, { keep: true, h: keep.towerH }));
    const hall = doorstep(place('greathall', keepSpec.hall[0], keepSpec.hall[1],
      Math.min(keep.rIn + 19, keep.rOut - 12), axis - side, { keep: true, h: 8.5 }));
    const corners = [];
    for (const s of [-1, 1]) {
      const c = place('keeptowerlet', keepSpec.corner[0], keepSpec.corner[1],
        keep.rOut - 8, norm(keep.bearing + s * (keep.half - 0.17)), { keep: true, h: 12 });
      if (c) corners.push(c);
    }
    // Nothing is skipped in silence: a castle that could not be stood up says
    // so, and the town goes on without one rather than with half of one.
    if (!tower || !hall || corners.length < 2) {
      const short = [!tower && 'the great tower', !hall && 'the great hall',
        corners.length < 2 && `${2 - corners.length} of the two corner towers`].filter(Boolean);
      keepNote = `${site.name || site.sub}: the keep could not be stood up, ${short.join(' and ')} would not fit inside its wall`;
      for (let i = lots.length - 1; i >= 0; i--) if (lots[i].keep) lots.splice(i, 1);
      for (let i = streets.length - 1; i >= 0; i--) if (streets[i].kind === 'keepway') streets.splice(i, 1);
      keep = null;
    } else {
      keep.tower = { x: tower.x, z: tower.z, yaw: tower.yaw, w: tower.w, d: tower.d, h: tower.h };
      keepNote = `${keepSpec.name} holds ${(keep.fraction * 100).toFixed(1)}% of the walled ground`;
    }
  }

  const seat = norm(gates[0].bearing + Math.PI / Math.max(2, nGates + 1));
  const [iw, id, istyle] = spec.inn;
  const inn = doorstep(place('inn', iw, id, CIVIC_RING, seat));
  if (inn) inn.style = istyle;

  const smith = doorstep(place('smith', 13, 10, CIVIC_RING, seat + 1.15));
  if (smith) {
    // The forge stands beside the smithy, on the side away from the square, so
    // the fire is never between a customer and the door.
    doorstep(place('forge', 5.5, 5, smith.ring + 8, smith.bearing + 0.1));
  }
  doorstep(place('healer', 11, 9, CIVIC_RING, seat - 1.15));
  const stable = doorstep(place('stable', 13, 10, CIVIC_RING, seat + 2.3));
  if (stable) doorstep(place('pens', 15, 12, stable.ring + 12, stable.bearing + 0.12));
  doorstep(place('bank', 11, 10, CIVIC_RING, seat - 2.3));

  for (let i = 0; i < spec.extras.length; i++) {
    const [kind, w, d] = spec.extras[i];
    place(kind, w, d, EXTRA_RING, seat + Math.PI + (i - (spec.extras.length - 1) / 2) * 0.62);
  }

  for (let i = 0; i < spec.stalls; i++) {
    const a = seat + 0.4 + (i / spec.stalls) * TAU;
    place('stall', 3.6 + (i % 2) * 0.6, 2.6, STALL_RING, a);
  }

  for (let i = 0; i < spec.houses; i++) {
    const w = 8 + Math.floor(rng() * 3);
    const d = 6 + Math.floor(rng() * 3);
    const ring = HOUSE_RING + (i % 2) * 9;
    const a = seat + 0.3 + (i / spec.houses) * TAU + (rng() - 0.5) * 0.2;
    // The eaves height is decided here rather than in the builder, so that the
    // thing that measures whether the keep shows over the roofs is reading the
    // same number the thing that draws the roofs reads. It comes off its own
    // stream, so adding it moved no other building by a millimetre.
    const lot = place('house', w, d, ring, a, { h: 4.6 + hrng() * 1.4 });
    if (lot) lot.style = ['a', 'b', 'c'][Math.floor(rng() * 3)];
  }

  // ---- what the realm puts between the buildings --------------------------
  // The trunks of the Canopy Court, the palms of the Last Well, the ice cut at
  // Coldseat, the stacks of Cinderport, the ring of stones round Hearthhome.
  // All of it goes through the packer, because dressing laid down by hand is
  // dressing standing inside somebody's kitchen.
  for (const [kind, pw, pd, count, ring, mode] of (spec.props || [])) {
    for (let i = 0; i < count; i++) {
      const a = seat + 0.7 + (i / count) * TAU;
      place(kind, pw, pd, ring + (i % 3) * 6, a, {
        prop: true, outside: false, beyond: mode === 'beyond', yaw: norm(a),
      });
    }
  }

  // ---- the water side ------------------------------------------------------
  if (port) {
    // Jetties run out along the radius and ships moor alongside them, which is
    // how a ship is moored and also the only way three hulls and three jetties
    // fit in the water this precinct has: the long axis of everything on the
    // water points the same way, so they cost tangential room and not reach.
    const mid = port.quayR + port.reach / 2;
    const jn = spec.port.jetties, hn = spec.port.hulls;
    const jettyD = Math.max(10, port.reach - 2);
    const hullD = Math.max(12, Math.min(20, port.reach - 3));
    for (let i = 0; i < jn; i++) {
      const a = norm(port.bearing + (i - (jn - 1) / 2) * 0.34);
      place('jetty', 4.5, jettyD, mid, a, { outside: true, radial: true });
    }
    for (let i = 0; i < hn; i++) {
      // one hull between each pair of jetties, and the last one outboard
      const a = norm(port.bearing + ((i - (hn - 1) / 2) * 0.34) + 0.17);
      place('hull', 6.5, hullD, mid, a, { outside: true, radial: true });
    }
    if (port.mole) {
      const a = norm(port.bearing - port.half * 0.86);
      place('mole', 4.5, Math.max(14, port.reach), mid, a, { outside: true, radial: true });
    }
    port.quay = {
      from: norm(port.bearing - port.half), to: norm(port.bearing + port.half),
      r: port.quayR, half: port.half,
    };
  }

  return {
    id: site.id, sub: site.sub, realm: site.realm, kind: 'town', name: site.name,
    x: cx, z: cz, precinctR, palette, spec, note: spec.note,
    wall, gates, square, streets, waystone, port,
    /** The castle precinct, or null with `keepNote` saying why there is none. */
    keep, keepNote,
    lots,
    /** The castle's own bodies: the great tower, the hall, two corner towers. */
    keepLots: lots.filter((l) => l.keep),
    /** The dressing, packed with everything else so none of it stands on a wall. */
    props: lots.filter((l) => l.prop),
    /** The buildings, which is `lots` without the dressing and without the water. */
    buildings: lots.filter((l) => !l.prop && !l.outside),
  };
}

/** Every lot of one kind, in the order they were laid out. */
export const lotsOfKind = (plan, kind) => (plan ? plan.lots.filter((l) => l.kind === kind) : []);
/** The one lot of a kind there is only ever one of, or null. */
export const lotOf = (plan, kind) => lotsOfKind(plan, kind)[0] || null;

// ------------------------------------------------------------------ audit --

/**
 * Everything this file claims about its own tables, checked at load. It does
 * NOT lay any town out; `town_layout.test.mjs` does that for all seven and
 * measures the result, because an audit that builds seven towns on every page
 * load is a tax nobody agreed to pay.
 */
export function auditTownSpecs() {
  const bad = [];
  const realms = new Set();
  for (const [id, s] of Object.entries(TOWN_SPECS)) {
    const at = `town ${id}`;
    if (!PALETTES[s.realm]) bad.push(`${at}: the realm "${s.realm}" has no palette`);
    realms.add(s.realm);
    if (!(s.gates >= 2 && s.gates <= 4)) bad.push(`${at}: ${s.gates} gates, wanted two to four`);
    if (!(s.houses > 0)) bad.push(`${at}: no houses`);
    if (!(s.stalls > 0)) bad.push(`${at}: no stalls in the market square`);
    if (!s.note || s.note.includes('—')) bad.push(`${at}: no note, or an em dash in it`);
    if (!Array.isArray(s.inn) || s.inn.length !== 3) bad.push(`${at}: the inn has no size`);
    if (s.port && !(s.port.shoreR > WALL_R)) bad.push(`${at}: the water line is inside the wall`);
    if (!Array.isArray(s.props) || s.props.length === 0) bad.push(`${at}: nothing at all between the buildings`);
    for (const row of s.props || []) {
      if (row.length !== 6) bad.push(`${at}: a props row of ${row.length}, wanted kind, w, d, count, ring, mode`);
      if (!['inside', 'beyond'].includes(row[5])) bad.push(`${at}: the ${row[0]} stands "${row[5]}", which is not a place`);
    }
  }
  if (Object.keys(TOWN_SPECS).length !== 7) bad.push(`there are seven precinct towns, this table has ${Object.keys(TOWN_SPECS).length}`);
  // Every town is a seat, so every town has a castle, and no two of them are
  // built the same way. The fifth biome with no axe is how this project has
  // been bitten before.
  for (const id of Object.keys(TOWN_SPECS)) {
    const k = KEEP_SPECS[id];
    if (!k) { bad.push(`town ${id}: no keep`); continue; }
    const at = `keep of ${id}`;
    if (!KEEP_STYLES.includes(k.style)) bad.push(`${at}: "${k.style}" is not a way a keep is built`);
    if (!(k.towerH >= 18 && k.towerH <= 30)) bad.push(`${at}: a tower of ${k.towerH} m, wanted 18 to 30`);
    if (!k.name || !k.note || k.note.includes('—') || k.name.includes('—')) bad.push(`${at}: no name, no note, or an em dash in one`);
    for (const part of ['tower', 'hall', 'corner']) {
      if (!Array.isArray(k[part]) || k[part].length !== 2) bad.push(`${at}: the ${part} has no size`);
    }
    const innArea = TOWN_SPECS[id].inn[0] * TOWN_SPECS[id].inn[1];
    for (const part of ['tower', 'hall']) {
      if (k[part][0] * k[part][1] > innArea) bad.push(`${at}: the ${part} is bigger than the inn, which the inn is not allowed to be`);
    }
  }
  for (const id of Object.keys(KEEP_SPECS)) {
    if (!TOWN_SPECS[id]) bad.push(`there is a keep for "${id}", which is not one of the seven towns`);
  }
  if (new Set(Object.values(KEEP_SPECS).map((k) => k.style)).size !== Object.keys(KEEP_SPECS).length) {
    bad.push('two keeps are built the same way, and a realm you cannot tell from another realm is not a realm');
  }
  if (KEEP_MIN_WALL_R >= WALL_R) bad.push(`a keep needs ${KEEP_MIN_WALL_R} m of wall and the wall is ${WALL_R} m, so no town could have one`);
  // The inn is the largest building in every town, which is what the contract
  // says it is and what makes it findable from the square.
  for (const [id, s] of Object.entries(TOWN_SPECS)) {
    const innArea = s.inn[0] * s.inn[1];
    for (const [kind, w, d] of s.extras) {
      if (w * d > innArea) bad.push(`town ${id}: the ${kind} is bigger than the inn`);
    }
    for (const [kind, w, d] of s.props || []) {
      if (w * d > innArea) bad.push(`town ${id}: the ${kind} is bigger than the inn`);
    }
  }
  for (const p of Object.values(PALETTES)) {
    const keys = ['wall', 'wallDark', 'roof', 'roofDark', 'timber', 'trim', 'stone', 'stoneDark', 'dark', 'metal', 'glow', 'banner', 'ground'];
    for (const k of keys) if (typeof p[k] !== 'number') bad.push(`palette ${p.id}: no ${k}`);
    if (new Set(keys.map((k) => p[k])).size !== keys.length) bad.push(`palette ${p.id}: two of its colours are the same, which merges two materials into one`);
  }
  // field.js grades a pad from `flatR * 0.55` outward, so the wall has to sit
  // at or inside that radius or it is a wall laid on a hillside.
  if (WALL_R > 120 * 0.55) {
    bad.push(`the wall at ${WALL_R} m stands outside the pad's flat core, which ends at ${120 * 0.55} m`);
  }
  if (bad.length) throw new Error(`auditTownSpecs: ${bad.length} problem(s)\n  ${bad.join('\n  ')}`);
  return { towns: Object.keys(TOWN_SPECS).length, palettes: Object.keys(PALETTES).length, realms: realms.size };
}

auditTownSpecs();
