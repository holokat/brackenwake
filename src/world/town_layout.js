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
    props: [['trunk', 4.6, 4.6, 9, 30, 'inside']],
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

  // ---- the square and its streets -----------------------------------------
  const square = {
    x: cx, z: cz, r: SQUARE_R,
    centre: { kind: spec.centre, x: cx, z: cz, r: spec.centre === 'sweetwell' ? 3.2 : 2.2 },
  };

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
  const CHORDS = 18;
  for (let i = 0; i < CHORDS; i++) {
    const a1 = (i / CHORDS) * TAU, a2 = ((i + 1) / CHORDS) * TAU;
    streets.push({
      kind: 'ring', w: RING_W,
      x1: cx + Math.sin(a1) * RING_R, z1: cz + Math.cos(a1) * RING_R,
      x2: cx + Math.sin(a2) * RING_R, z2: cz + Math.cos(a2) * RING_R,
    });
  }
  // The outer edge of the ring street, which is the first radius a lot may use.
  const ringOuter = RING_R + RING_W / 2 + (RING_R * (1 - Math.cos(Math.PI / CHORDS)));

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
  const seat = norm(gates[0].bearing + Math.PI / Math.max(2, nGates + 1));
  const [iw, id, istyle] = spec.inn;
  const inn = place('inn', iw, id, CIVIC_RING, seat);
  if (inn) inn.style = istyle;

  const smith = place('smith', 13, 10, CIVIC_RING, seat + 1.15);
  if (smith) {
    // The forge stands beside the smithy, on the side away from the square, so
    // the fire is never between a customer and the door.
    place('forge', 5.5, 5, smith.ring + 8, smith.bearing + 0.1);
  }
  place('healer', 11, 9, CIVIC_RING, seat - 1.15);
  const stable = place('stable', 13, 10, CIVIC_RING, seat + 2.3);
  if (stable) place('pens', 15, 12, stable.ring + 12, stable.bearing + 0.12);
  place('bank', 11, 10, CIVIC_RING, seat - 2.3);

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
    const lot = place('house', w, d, ring, a);
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
    lots,
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
