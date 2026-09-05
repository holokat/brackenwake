// What stands beside a road, and what carries a road over a river. Pure, no
// THREE, runs in node.
//
// The roads in this world were graded strips of packed earth and nothing else:
// no light on them at night, no word at a fork about where the fork goes, and
// at every river a ford, which in this terrain means the road dives into a
// ravine, crosses a stream and climbs out the other side. `wayside.js` says
// where the furniture stands; `wayside_models.js` gives it bodies.
//
// The pattern is flora's, on purpose. A chunk comes into the streamed ring,
// `waysideFor(field, cx, cz)` says what stands in it, the runtime builds one
// group for that chunk, and when the chunk leaves the ring the group is
// disposed. Nothing here touches THREE, so the whole of the placement runs in
// node and `wayside.test.mjs` drives it against the real field.
//
// ---- what is placed -------------------------------------------------------
//
//   lamp       both verges, every LAMP_NEAR within PLACE_NEAR of a settlement
//              or an authored place, every LAMP_FAR elsewhere, plus one at each
//              abutment of every bridge. Realm styled. Lit through the chunk's
//              own `setNight`, never with a light of its own
//   sign       one at every settlement a road touches, standing just outside
//              the pad where the road leaves it, with two to four fingers
//   milestone  every MILESTONE metres along a road from the settlement that
//              owns it
//   bridge     wherever the road is over a river. The deck is the road's own
//              graded profile, which is the line the ford dives out of
//   gate       where a road crosses the middle of a realm's edge band, with
//              that realm's name on the lintel
//   bench      at the road, within GATE_ROOM of where it leaves a settlement
//   hitch      the hitching post, the same
//   shrine     one sign spot in SHRINE_IN
//
// ---- who owns a piece -----------------------------------------------------
//
// Everything is owned by ONE road, and a piece anchored at a settlement is
// owned by that settlement's lexically smallest road (`roadsAtSite` sorts
// them), so a fork's signpost is built once and not once per road that meets
// there. A chunk then keeps the pieces whose own point falls inside it, which
// is what makes a piece exist exactly once in the world however the chunks are
// walked.
//
// ---- what is never placed -------------------------------------------------
//
// Nothing stands on a site's pad, nothing stands in water except a bridge,
// nothing stands in a river, nothing stands on the graded road itself except a
// bridge and a gate, and no two pieces stand within the larger of their two
// `clear` radii. The overlap pass runs over a box wider than the largest
// clearance, so the same piece is kept or dropped identically in every chunk
// that can see it.
//
// ---- what it costs --------------------------------------------------------
//
// A road's furniture is worked out once, on the first chunk that touches the
// road, and read by every chunk after it. The walk is done on `field.raw`
// rather than on `field.sampleAt`, and the graded road surface is rebuilt from
// it here with roads.js's own `roadSurface`, which is EXACTLY what field.js
// does at the centreline: the same arithmetic, at half the price, because raw
// is the expensive half of a sample and the zone lookup and the biome chain
// are no part of this question. `sampleAt` is still asked for the final ground
// under every piece that is actually placed, because a verge within reach of a
// second road is graded by that road and a lamp post owes the player its feet
// on the ground.

import { SEA_LEVEL, CHUNK } from './field.js';
import { hash2 } from './noise.js';
import { sitesNear } from './sites.js';
import { SITE_CELL } from './sitegrid.js';
import { REALM_ZONES, realmAt } from './zones.js';
import {
  roadsOverlapping, roadsAtSite, roadPointAt, roadHeightAt, roadDistanceAt,
  roadSurface, roadStrength, fordFade, ROAD_HALF_WIDTH,
} from './roads.js';

// ------------------------------------------------------------- the numbers --

/** Metres between lamp posts on a verge near a settlement or authored place. */
export const LAMP_NEAR = 24;
/** Metres between lamp posts on open road. */
export const LAMP_FAR = 60;
/** A settlement or an authored place within this many metres makes a road lit. */
export const PLACE_NEAR = 600;
/** Metres from the centreline to a lamp post: off the road, on the verge. */
export const VERGE = ROAD_HALF_WIDTH + 0.9;
/** Metres from the centreline to a sign, a bench, a milestone or a shrine. */
export const OFF_ROAD = ROAD_HALF_WIDTH + 1.6;
/** Metres between milestones, counted from the road's own settlement. */
export const MILESTONE = 500;
/** How far a signpost looks for a place to name. */
export const SIGN_REACH = 1400;
/** The rings it looks over, nearest first, so it stops as soon as it can. */
export const SIGN_RINGS = [SITE_CELL, SIGN_REACH];
/**
 * Metres past a settlement's gate a signpost will walk before it gives up.
 * A road leaves some towns straight into a river bank, and a post in the water
 * is refused; the answer is to stand it a little further on, not to leave the
 * road unsigned.
 */
export const SIGN_STEPS = [0, 9, 18, 30, 44];
/** The widest angle a finger may be wrong by, in radians. 45 degrees. */
export const SIGN_ARC = Math.PI / 4;
/** Fingers on one post: never fewer than the first, never more than the last. */
export const FINGERS = [2, 4];
/** One sign spot in this many carries a shrine as well. */
export const SHRINE_IN = 3;
/** How tall a realm's border gate stands, in metres. */
export const GATE_H = 8;
/** Metres along the road a gate will walk to find room to stand. */
export const GATE_STEPS = [0, 12, -12, 26, -26, 44, -44];
/** Metres past the pad that a bench and a hitching post stand. */
export const BENCH_AT = 13;
export const HITCH_AT = 24;
/** The bench and the post have to be inside this of the settlement's gate. */
export const GATE_ROOM = 40;
/** River strength above which `fordFade` is below 1 and the road is in water. */
export const FORD_RIVER = 0.02;
/** Ground this far under the deck is ground a bridge has to span. */
export const DECK_CLEAR = 0.8;
/**
 * How far the road has to fall below its own deck inside a river band before
 * that band is a crossing and not a damp dip.
 *
 * Measured on this world at a metre's resolution: thirty two river bands lie
 * across a road, twenty six of them carry the road under the water sheet or
 * drop it between 1.9 and 10.7 m below the deck, and the other six take it
 * down by a tenth of a metre or less. The first sort gets a bridge; the second
 * is a wet patch in the road and gets nothing, which is the honest answer.
 * `wayside.test.mjs` drives both sides of that line.
 */
export const BRIDGE_DROP = 1.2;
/**
 * Metres between probes when a road is walked for rivers and realm borders.
 * The narrowest wet run any road in this world crosses is measured in
 * `wayside.test.mjs`; this has to stay well under it or a bridge goes missing.
 */
export const WALK_STEP = 3;
/**
 * Metres between probes when a river band that HAS been found is measured for
 * depth. Only a few metres of any road are ever walked at this, so it is fine
 * where it matters and costs nothing where it does not.
 */
export const REFINE_STEP = 1;
/** Metres of clear ground kept outside a site's pad. */
export const PAD_MARGIN = 5;
/** Nothing but a bridge stands nearer sea level than this. */
export const SHORE_LINE = SEA_LEVEL + 0.35;
/**
 * Metres a chunk's gather box is grown by before the overlap pass. It has to
 * be wider than the largest `clear` below, or two pieces would settle their
 * overlap differently in the two chunks either side of a border.
 */
export const GATHER = 24;

/** How much room each kind keeps to itself, in metres. */
export const CLEAR = {
  lamp: 1.6, sign: 3, milestone: 1.6, bench: 1.6, hitch: 1.6,
  shrine: 3, gate: 9, bridge: 0,
};
/** The order pieces are settled in: the kind earlier in this list wins. */
export const KIND_ORDER = ['bridge', 'gate', 'sign', 'shrine', 'bench', 'hitch', 'milestone', 'lamp'];
/** Every kind this file places. `wayside_models.js` audits its builders against it. */
export const KINDS = Object.freeze([...KIND_ORDER]);

// -------------------------------------------------------------- the styles --
//
// One row per realm, and one for the open country no realm claims. `lamp`,
// `bridge` and `gate` are words `wayside_models.js` has a builder for, and it
// audits this table against its own three at import, both directions, so a
// realm can never name a lamp nobody can build and a builder can never sit
// here unread. A gate is masonry wherever masonry is what the realm builds
// with: the Stormpeaks hang their bridges on rope and still cut their border
// posts out of the mountain.

export const WAYSIDE_STYLE = Object.freeze({
  // iron and glass on an oak post, in the country the game starts in
  greenwold: { lamp: 'iron', bridge: 'stone', gate: 'stone', glow: 0xffca7a, wood: 0x6b4a2e, stone: 0x8d8578, metal: 0x3b3a38 },
  // rope and paper, hung from cane
  verdant: { lamp: 'paper', bridge: 'timber', gate: 'timber', glow: 0xfff0b4, wood: 0x6d5a37, stone: 0x6f7a55, metal: 0x8a7b4e },
  // whale oil in a driftwood post, the light the fen walks home by
  saltmarch: { lamp: 'whale', bridge: 'timber', gate: 'timber', glow: 0xffd68a, wood: 0x7d6f5c, stone: 0x7d7f76, metal: 0x5d5a52 },
  // brass, because the wastes make everything out of what the city left
  emberwastes: { lamp: 'brass', bridge: 'stone', gate: 'stone', glow: 0xffb45a, wood: 0x8a6a42, stone: 0xa08b62, metal: 0xb08a3c },
  // a cairn with a lamp set into it, which is what stands up to that wind
  stormpeaks: { lamp: 'cairn', bridge: 'rope', gate: 'stone', glow: 0xffdca0, wood: 0x584a3c, stone: 0x6d6f74, metal: 0x4a4a4c },
  // bone and tallow, and a bridge of ribs
  boneyard: { lamp: 'bone', bridge: 'bone', gate: 'bone', glow: 0xfff0c8, wood: 0x9c9382, stone: 0xbdb59c, metal: 0x7c7566 },
  // a lantern cut from ice, with the flame a long way inside it
  frostreach: { lamp: 'ice', bridge: 'timber', gate: 'timber', glow: 0x9fd8ff, wood: 0x5d5346, stone: 0x9fb0bd, metal: 0x6c7078 },
  // drowned marble, and the light in it is not a flame
  sunkenkingdom: { lamp: 'marble', bridge: 'stone', gate: 'stone', glow: 0x8fe6d8, wood: 0x6b6b63, stone: 0xa9b3ad, metal: 0x5f6b68 },
  // brass again at the Throne, over black stone
  ashenthrone: { lamp: 'brass', bridge: 'stone', gate: 'stone', glow: 0xff8a4a, wood: 0x3a322c, stone: 0x4b4744, metal: 0xb08a3c },
  // and the open country, which is the Greenwold's kit on a timber bridge
  wild: { lamp: 'iron', bridge: 'timber', gate: 'stone', glow: 0xffca7a, wood: 0x6b4a2e, stone: 0x8d8578, metal: 0x3b3a38 },
});

/** The style of a realm id, and the open country's own where there is none. */
export const styleFor = (realm) => WAYSIDE_STYLE[realm] || WAYSIDE_STYLE.wild;

/**
 * Every realm has a style and every style is a realm. Called at import, so a
 * tenth realm added to zones.js fails here and not in the dark at midnight.
 */
export function auditWaysideStyles() {
  const bad = [];
  for (const zn of REALM_ZONES) if (!WAYSIDE_STYLE[zn.id]) bad.push(`the realm "${zn.id}" has no wayside style`);
  const ids = new Set(REALM_ZONES.map((z) => z.id));
  for (const id of Object.keys(WAYSIDE_STYLE)) {
    if (id !== 'wild' && !ids.has(id)) bad.push(`the wayside style "${id}" belongs to no realm`);
  }
  if (bad.length) throw new Error('wayside: ' + bad.join('; '));
  return REALM_ZONES.length;
}
auditWaysideStyles();

// ---------------------------------------------------------------- the cache --
//
// A road's furniture is a pure function of the road and the field, so it is
// worked out once for the road and read by every chunk the road passes
// through. Roads are themselves cached per field object (roads.js), so keying
// on the road object keys on the field as well and two seeds never share a
// lamp post.

const BY_ROAD = new WeakMap();
const CONTEXT = new WeakMap();
const NEAR_PLACE = new WeakMap();      // field -> Map(24 m cell -> boolean)

const isSettlement = (s) => !!s && (s.kind === 'town' || s.kind === 'hamlet');

// ------------------------------------------------------------ the questions --

/**
 * What one road has to know about the ground it runs over: every pad near
 * enough to reach it.
 *
 * `field.sampleAt` asks a point's own cell and carries a short list of the
 * seven town precincts too wide to fit in one. A road is a line rather than a
 * point, so it asks once for the lot and then tests a handful of distances per
 * probe, which is cheaper than a cell lookup per probe and, unlike one, sees
 * the 120 m precincts as well.
 */
export function contextFor(field, road) {
  const had = CONTEXT.get(road);
  if (had) return had;
  const mid = roadPointAt(road, 0.5);
  const reach = road.total / 2 + 300;
  const pads = sitesNear(field, mid.x, mid.z, reach).filter((s) => s && s.flatR > 0);
  const ctx = { pads, seed: field.seed };
  CONTEXT.set(road, ctx);
  return ctx;
}

/** Whether a point stands on the levelled pad of any site. */
export function onPad(ctx, x, z) {
  for (let i = 0; i < ctx.pads.length; i++) {
    const s = ctx.pads[i];
    const keep = s.flatR + PAD_MARGIN;
    if ((x - s.x) ** 2 + (z - s.z) ** 2 < keep * keep) return true;
  }
  return false;
}

/**
 * The ground at a point, and whether anything may stand on it.
 *
 * `h` IS `field.sampleAt(x, z).h` and not an approximation of it. Off the farm
 * disc and off every pad, both of which are refused here, the only thing
 * `sampleAt` adds to the raw ground is the road's own earthwork, and that is
 * the three lines below: the same `roadStrength`, the same `fordFade`, the
 * same `roadSurface`, off the same road. It is written here rather than asked
 * for because asking would sample the terrain a second time at a point this
 * function has already paid for, and the terrain is the expensive half.
 * `wayside.test.mjs` measures every placed piece against `sampleAt` and fails
 * on a difference of a nanometre, so the two cannot drift apart.
 *
 * `ok` is the whole gate: out of the water, out of a river, off every pad, off
 * the farm's own disc. The placement and the test both call it, so the test
 * path is the real path.
 */
export function probeAt(field, ctx, x, z) {
  const r = field.raw(x, z);
  const ok = r.h >= SHORE_LINE && r.river <= FORD_RIVER
    && field.homeFactor(x, z) >= 1 && !onPad(ctx, x, z);
  let h = r.h;
  const rd = roadDistanceAt(field, x, z);
  if (rd) {
    const w = roadStrength(rd.d) * fordFade(r.river);
    if (w > 0) h = roadSurface(h, roadHeightAt(rd.road, rd.t), w);
  }
  const zn = realmAt(x, z);
  return { h, river: r.river, realm: zn ? zn.id : 'wild', ok };
}

/**
 * Whether a point is near enough to a settlement or an authored place for the
 * road there to be town lit. Cached on a 24 m grid, which is the lamp spacing
 * itself, so a road of forty stations asks the site grid forty times and not
 * once per verge.
 */
export function nearPlace(field, x, z) {
  let m = NEAR_PLACE.get(field);
  if (!m) { m = new Map(); NEAR_PLACE.set(field, m); }
  const key = Math.round(x / LAMP_NEAR) + ',' + Math.round(z / LAMP_NEAR);
  const had = m.get(key);
  if (had !== undefined) return had;
  let near = false;
  for (const s of sitesNear(field, x, z, PLACE_NEAR)) {
    if (isSettlement(s) || s.authored) { near = true; break; }
  }
  m.set(key, near);
  return near;
}

/** Metres to the next lamp post at this point: LAMP_NEAR in town, LAMP_FAR out. */
export const spacingAt = (field, x, z) => (nearPlace(field, x, z) ? LAMP_NEAR : LAMP_FAR);

/**
 * Where a road is over water, and what a bridge there has to span.
 *
 * A river is carved to -1.8 and a road fords it: `fordFade` takes the whole
 * earthwork away at the crossing, so the graded surface IS the river bed there
 * while the road's own profile carries straight across at the level of the dry
 * ground either side. That profile is the deck. The span then reaches out from
 * the wet run to the last point either side where the surface comes back
 * within DECK_CLEAR of the deck, which is the abutment, so a bridge lands on
 * solid ground and not on a bank it is still hanging over.
 *
 *   { t0, t1, tMid, len, x0, z0, x1, z1, y0, y1, deckY, bed }
 */
export function crossingsOf(field, road, ctx = contextFor(field, road)) {
  const n = Math.max(2, Math.ceil(road.total / WALK_STEP));
  const surf = new Float64Array(n + 1), deck = new Float64Array(n + 1);
  const river = new Uint8Array(n + 1);
  const px = new Float64Array(n + 1), pz = new Float64Array(n + 1);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const p = roadPointAt(road, t);
    const r = field.raw(p.x, p.z);
    px[i] = p.x; pz[i] = p.z;
    deck[i] = roadHeightAt(road, t);
    // exactly what field.js leaves at the centreline: the graded surface, with
    // the earthwork faded out by the ford
    surf[i] = roadSurface(r.h, deck[i], fordFade(r.river));
    river[i] = r.river > FORD_RIVER && !onPad(ctx, p.x, p.z) ? 1 : 0;
  }
  const runs = [];
  for (let i = 0; i <= n; i++) {
    if (!river[i]) continue;
    const start = i;
    let j = i;
    while (j + 1 <= n && river[j + 1]) j++;
    i = j;
    // A river the road runs level through is a wet patch and not a crossing,
    // and that is decided on a walk of its own at REFINE_STEP rather than on
    // the coarse probes. A band three metres wide gets one coarse probe and it
    // lands wherever it lands: measured, a crossing whose road is 2.4 m under
    // the deck at its middle read 1.09 m at the one probe inside it, which is
    // under BRIDGE_DROP, and the bridge over it would have gone missing.
    let deepest = 0, bed = Infinity;
    const t0 = Math.max(0, (start - 1) / n), t1 = Math.min(1, (j + 1) / n);
    const fine = Math.max(2, Math.ceil((t1 - t0) * road.total / REFINE_STEP));
    for (let k = 0; k <= fine; k++) {
      const t = t0 + (t1 - t0) * (k / fine);
      const q = roadPointAt(road, t);
      const r = field.raw(q.x, q.z);
      // the depth of the RIVER, not of the ground beside it: the window
      // reaches a coarse step past the band on either side so that a band
      // narrower than one step is measured at all, and a point outside the
      // water has nothing to say about how deep the water is
      if (r.river <= FORD_RIVER || onPad(ctx, q.x, q.z)) continue;
      const d = roadHeightAt(road, t);
      const sf = roadSurface(r.h, d, fordFade(r.river));
      if (d - sf > deepest) deepest = d - sf;
      if (sf < bed) bed = sf;
    }
    if (deepest <= BRIDGE_DROP && bed >= SEA_LEVEL) continue;
    // out to the abutments: the last ground either side that reaches the deck
    let a = start;
    while (a > 0 && surf[a] < deck[a] - DECK_CLEAR) a--;
    let b = j;
    while (b < n && surf[b] < deck[b] - DECK_CLEAR) b++;
    // two crossings that reach into each other are one bridge
    const last = runs[runs.length - 1];
    if (last && a <= last.i1) last.i1 = Math.max(last.i1, b);
    else runs.push({ i0: a, i1: b });
  }
  return runs.map((c) => {
    const t0 = c.i0 / n, t1 = c.i1 / n;
    let bed = Infinity;
    for (let i = c.i0; i <= c.i1; i++) if (surf[i] < bed) bed = surf[i];
    return {
      t0, t1, tMid: (t0 + t1) / 2, len: (t1 - t0) * road.total,
      x0: px[c.i0], z0: pz[c.i0], x1: px[c.i1], z1: pz[c.i1],
      y0: deck[c.i0], y1: deck[c.i1], deckY: (deck[c.i0] + deck[c.i1]) / 2, bed,
    };
  });
}

/**
 * Where a road crosses the middle of a realm's edge band.
 *
 * A realm is a disc with a soft edge (`zones.js`): full strength inside `r`,
 * gone at `r + edge`. Half way through that band is where the realm's bias
 * reaches half, which is where `sites.js` says you have entered it, and it is
 * where a border gate belongs. One gate per crossing, carrying the name of the
 * realm whose band it is.
 */
export function realmCrossingsOf(field, road) {
  const n = Math.max(2, Math.ceil(road.total / WALK_STEP));
  const out = [];
  for (const zn of REALM_ZONES) {
    const mid = zn.r + zn.edge / 2;
    // the road's own bounding box against the realm's disc: nine realms times
    // two hundred probes is a lot of arithmetic for a border a road is nowhere
    // near, and every road in this world is nowhere near eight of them
    if (road.minX - mid > zn.x || road.maxX + mid < zn.x
      || road.minZ - mid > zn.z || road.maxZ + mid < zn.z) continue;
    let prev = null;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const p = roadPointAt(road, t);
      const inside = Math.hypot(p.x - zn.x, p.z - zn.z) < mid;
      if (prev !== null && inside !== prev) {
        const tc = (i - 0.5) / n;
        const q = roadPointAt(road, tc);
        out.push({ t: tc, x: q.x, z: q.z, dx: q.dx, dz: q.dz, realm: zn.id, name: zn.name, entering: inside });
      }
      prev = inside;
    }
  }
  out.sort((a, b) => a.t - b.t);
  return out;
}

/**
 * The named places a signpost at (x, z) can point at, nearest first.
 *
 * Everything the site grid holds has a name: a hamlet, a town, a ruin, a
 * wayside shrine, a cave, a tower, and the authored places on top of them. A
 * finger names one of these and says how far, rounded to a hundred metres,
 * which is the honest precision for a board of painted wood.
 */
export function placesNear(field, x, z, reach = SIGN_REACH) {
  const out = [];
  for (const s of sitesNear(field, x, z, reach)) {
    if (!s.name) continue;
    const d = Math.hypot(s.x - x, s.z - z);
    if (d < 30) continue;                       // the place you are standing in
    out.push({ id: s.id, name: s.name, x: s.x, z: s.z, d, bearing: Math.atan2(s.x - x, s.z - z) });
  }
  out.sort((a, b) => (a.d !== b.d ? a.d - b.d : (a.id < b.id ? -1 : 1)));
  return out;
}

/** The smaller of the two ways round from a to b, in radians, always positive. */
export function angleGap(a, b) {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return Math.abs(d);
}

/** Metres, to the nearest hundred, and never zero. */
export const roundDist = (d) => Math.max(100, Math.round(d / 100) * 100);

// -------------------------------------------------------------- placement --

/** Arc length at which a road leaves a settlement's own pad, in metres. */
export function gateArc(road, site, end) {
  const keep = (site.flatR || 20) + PAD_MARGIN;
  const n = Math.max(2, Math.ceil(road.total / 2));
  for (let i = 0; i <= n; i++) {
    const s = end === 'a' ? (i / n) * road.total : road.total - (i / n) * road.total;
    const p = roadPointAt(road, s / road.total);
    if (Math.hypot(p.x - site.x, p.z - site.z) >= keep) return s;
  }
  return road.total * 0.5;
}

/**
 * The fingers on one signpost.
 *
 * A leg finger names the settlement at the far end of one of the roads that
 * meet here and points along that road as it leaves, which is the thing a
 * traveller wants to read. The rest name the nearest places in directions no
 * leg has taken, so the end of a road is not a post with one arm on it.
 */
export function fingersAt(field, site, roads) {
  const out = [];
  for (const r of roads) {
    if (out.length >= FINGERS[1]) break;
    const far = r.a.id === site.id ? r.b : r.a;
    const mine = r.a.id === site.id;
    const p = roadPointAt(r, mine ? 0.03 : 0.97);
    const away = mine ? 1 : -1;
    out.push({
      name: far.name,
      dist: roundDist(Math.hypot(far.x - site.x, far.z - site.z)),
      bearing: Math.atan2(far.x - site.x, far.z - site.z),
      dir: Math.atan2(p.dx * away, p.dz * away),
      leg: true,
    });
  }
  // The rest name the nearest places in directions no leg has taken. The
  // search widens only as far as it has to: a sign is usually finished by the
  // nine cells around it, and every ring further out is another twenty five
  // cells of terrain rolled for a name that was already in hand.
  const taken = out.map((f) => f.dir);
  const want = Math.min(FINGERS[1], Math.max(FINGERS[0], roads.length + 1));
  for (const reach of SIGN_RINGS) {
    if (out.length >= want) break;
    for (const pl of placesNear(field, site.x, site.z, reach)) {
      if (out.length >= want) break;
      if (out.some((f) => f.name === pl.name)) continue;
      if (taken.some((d) => angleGap(d, pl.bearing) < SIGN_ARC * 0.8)) continue;
      out.push({ name: pl.name, dist: roundDist(pl.d), bearing: pl.bearing, dir: pl.bearing, leg: false });
      taken.push(pl.bearing);
    }
  }
  // a post with one arm is not a signpost: take the nearest place there is,
  // whatever angle it stands at, rather than putting up half a sign
  if (out.length < FINGERS[0]) {
    for (const pl of placesNear(field, site.x, site.z, SIGN_REACH * 2)) {
      if (out.some((f) => f.name === pl.name)) continue;
      out.push({ name: pl.name, dist: roundDist(pl.d), bearing: pl.bearing, dir: pl.bearing, leg: false });
      if (out.length >= FINGERS[0]) break;
    }
  }
  return out;
}

/**
 * Every piece of furniture one road carries, worked out once and cached.
 *
 * The list comes back in KIND_ORDER, which is also the order overlaps are
 * settled in: a bridge and a border gate own the road they stand on, a
 * signpost owns its corner of a settlement, and a lamp post gives way to all
 * of them.
 */
export function waysideForRoad(field, road) {
  const had = BY_ROAD.get(road);
  if (had) return had;
  const out = [];
  BY_ROAD.set(road, out);
  const ctx = contextFor(field, road);
  const taken = [];

  function place(rec) {
    for (let i = 0; i < taken.length; i++) {
      const t = taken[i];
      const room = Math.max(t.clear, rec.clear);
      if (room > 0 && (t.x - rec.x) ** 2 + (t.z - rec.z) ** 2 < room * room) return null;
    }
    taken.push(rec); out.push(rec);
    return rec;
  }

  // ---- the bridges, first, because a bridge takes the road away from
  // everything else that would have stood on it
  const spans = crossingsOf(field, road, ctx);
  spans.forEach((c, i) => {
    const zn = realmAt(c.x0, c.z0);
    const realm = zn ? zn.id : 'wild';
    const st = styleFor(realm);
    place({
      id: `${road.id}#bridge${i}`, kind: 'bridge', road: road.id, t: c.tMid,
      // the arc the deck covers, which is what says whether a point on the
      // road is on the bridge: `onBridge`, `deckAt` and the test all read it
      t0: c.t0, t1: c.t1,
      realm, style: st.bridge, glow: st.glow,
      x: (c.x0 + c.x1) / 2, z: (c.z0 + c.z1) / 2, y: c.deckY,
      yaw: Math.atan2(c.x1 - c.x0, c.z1 - c.z0),
      x0: c.x0, z0: c.z0, y0: c.y0, x1: c.x1, z1: c.z1, y1: c.y1,
      span: c.len, bed: c.bed, width: ROAD_HALF_WIDTH * 2, clear: CLEAR.bridge,
    });
  });
  const onBridge = (t) => spans.some((c) => t >= c.t0 - 1e-6 && t <= c.t1 + 1e-6);

  // ---- the realm's own border
  //
  // A gate stands ON the road, so it walks along it until it finds a length of
  // road with nothing else on it and no bridge under it. A border that falls
  // in the middle of a river gets its gate on the near bank instead of not at
  // all, which is where a real one would be.
  for (const g of realmCrossingsOf(field, road)) {
    const st = styleFor(g.realm);
    for (const step of GATE_STEPS) {
      const t = g.t + step / road.total;
      if (t < 0 || t > 1 || onBridge(t)) continue;
      const q = roadPointAt(road, t);
      const put = place({
        id: `${road.id}#gate:${g.realm}`, kind: 'gate', road: road.id, t,
        realm: g.realm, style: st.gate, glow: st.glow, label: g.name,
        x: q.x, z: q.z, y: roadHeightAt(road, t), yaw: Math.atan2(q.dx, q.dz),
        height: GATE_H, half: ROAD_HALF_WIDTH + 1.2, clear: CLEAR.gate,
      });
      if (put) break;
    }
  }

  // ---- what stands at each end: the sign, the shrine, the bench, the post
  for (const end of ['a', 'b']) {
    const site = end === 'a' ? road.a : road.b;
    const mine = roadsAtSite(field, site);
    const owner = mine.length ? mine[0].id === road.id : true;
    const gate = gateArc(road, site, end);
    const inward = end === 'a' ? 1 : -1;
    const side = hash2(site.cx, site.cz, field.seed + 91) % 2 ? 1 : -1;

    if (owner) {
      // A signpost is not optional: a road end with no board on it is the one
      // thing this whole file exists to stop. So if the first spot is in the
      // river, on a neighbour's pad or in the water, the post walks on down
      // the road and tries the other verge, and only gives up after that.
      let spot = null;
      for (const step of SIGN_STEPS) {
        for (const sgn of [side, -side]) {
          const s1 = gate + inward * step;
          if (s1 < 0 || s1 > road.total) continue;
          const t1 = s1 / road.total;
          if (onBridge(t1)) continue;
          const p1 = roadPointAt(road, t1);
          const x1 = p1.x + p1.nx * OFF_ROAD * sgn, z1 = p1.z + p1.nz * OFF_ROAD * sgn;
          const g1 = probeAt(field, ctx, x1, z1);
          if (g1.ok) { spot = { t: t1, p: p1, x: x1, z: z1, g: g1, sgn }; break; }
        }
        if (spot) break;
      }
      if (spot) {
        const { t, p, x, z, g } = spot;
        const st = styleFor(g.realm);
        const sign = place({
          id: `${site.id}#sign`, kind: 'sign', road: road.id, t,
          realm: g.realm, style: st.lamp, glow: st.glow,
          x, z, y: g.h, yaw: Math.atan2(p.dx, p.dz),
          fork: mine.length > 1, at: site.name,
          fingers: fingersAt(field, site, mine), clear: CLEAR.sign,
        });
        // one sign spot in three keeps a shrine on the other side of the road
        if (sign && hash2(site.cx, site.cz, field.seed + 93) % SHRINE_IN === 0) {
          const sx = p.x - p.nx * OFF_ROAD * spot.sgn, sz = p.z - p.nz * OFF_ROAD * spot.sgn;
          const sg = probeAt(field, ctx, sx, sz);
          if (sg.ok) {
            const sst = styleFor(sg.realm);
            place({
              id: `${site.id}#shrine`, kind: 'shrine', road: road.id, t,
              realm: sg.realm, style: sst.lamp, glow: sst.glow,
              x: sx, z: sz, y: sg.h, yaw: Math.atan2(-p.dx, -p.dz),
              at: site.name, clear: CLEAR.shrine,
            });
          }
        }
      }
    }

    // the bench and the hitching post belong to the road that arrives here, so
    // a fork gets a pair for each road and not one pair for the settlement
    for (const [kind, at, off] of [['bench', BENCH_AT, -1], ['hitch', HITCH_AT, 1]]) {
      if (at > GATE_ROOM) continue;                   // the rule, not a hope
      const s0 = gate + inward * at;
      if (s0 < 0 || s0 > road.total) continue;
      const t = s0 / road.total;
      if (onBridge(t)) continue;
      const p = roadPointAt(road, t);
      const sx = off * side;
      const x = p.x + p.nx * OFF_ROAD * sx, z = p.z + p.nz * OFF_ROAD * sx;
      const g = probeAt(field, ctx, x, z);
      if (!g.ok) continue;
      const st = styleFor(g.realm);
      place({
        id: `${road.id}#${kind}:${end}`, kind, road: road.id, t,
        realm: g.realm, style: st.lamp, glow: st.glow,
        x, z, y: g.h,
        yaw: kind === 'bench' ? Math.atan2(-p.nx * sx, -p.nz * sx) : Math.atan2(p.dx, p.dz),
        at: site.name, clear: CLEAR[kind],
      });
    }
  }

  // ---- the milestones, counted from the road's own settlement
  for (let m = MILESTONE, i = 1; m < road.total; m += MILESTONE, i++) {
    const t = m / road.total;
    if (onBridge(t)) continue;
    const p = roadPointAt(road, t);
    const side = hash2(Math.round(p.x), Math.round(p.z), field.seed + 95) % 2 ? 1 : -1;
    const x = p.x + p.nx * OFF_ROAD * side, z = p.z + p.nz * OFF_ROAD * side;
    const g = probeAt(field, ctx, x, z);
    if (!g.ok) continue;
    const st = styleFor(g.realm);
    place({
      id: `${road.id}#mile${i}`, kind: 'milestone', road: road.id, t,
      realm: g.realm, style: st.lamp, glow: st.glow,
      x, z, y: g.h, yaw: Math.atan2(-p.nx * side, -p.nz * side),
      metres: m, from: road.a.name, clear: CLEAR.milestone,
    });
  }

  // ---- the lamps: both verges, at the spacing the country asks for
  const lampAt = (t, sideSign, id) => {
    const p = roadPointAt(road, t);
    const x = p.x + p.nx * VERGE * sideSign, z = p.z + p.nz * VERGE * sideSign;
    const g = probeAt(field, ctx, x, z);
    if (!g.ok) return null;
    const st = styleFor(g.realm);
    return place({
      id, kind: 'lamp', road: road.id, t, realm: g.realm,
      style: st.lamp, glow: st.glow, x, z, y: g.h,
      yaw: Math.atan2(-p.nx * sideSign, -p.nz * sideSign), side: sideSign,
      clear: CLEAR.lamp,
    });
  };
  let s = 0, i = 0;
  while (s <= road.total) {
    const t = s / road.total;
    const p = roadPointAt(road, t);
    if (!onBridge(t)) {
      lampAt(t, 1, `${road.id}#lamp${i}+`);
      lampAt(t, -1, `${road.id}#lamp${i}-`);
      s += spacingAt(field, p.x, p.z);
    } else {
      s += LAMP_NEAR;                                 // the bridge carries its own
    }
    i++;
  }
  // and one at each abutment, so a bridge has a light at both ends of it
  spans.forEach((c, k) => {
    lampAt(Math.max(0, c.t0 - 3 / road.total), 1, `${road.id}#bridge${k}lampA`);
    lampAt(Math.min(1, c.t1 + 3 / road.total), -1, `${road.id}#bridge${k}lampB`);
  });

  out.sort(byKindThenId);
  return out;
}

function byKindThenId(a, b) {
  const ka = KIND_ORDER.indexOf(a.kind), kb = KIND_ORDER.indexOf(b.kind);
  return ka !== kb ? ka - kb : (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/**
 * Every piece of road furniture standing in chunk (cx, cz).
 *
 * The gather box is the chunk grown by GATHER, so the overlap pass sees every
 * piece that could reach in and settles it the same way for both chunks either
 * side of a border. The chunk then keeps what actually stands in it.
 */
export function waysideFor(field, cx, cz) {
  const x0 = cx * CHUNK, z0 = cz * CHUNK, x1 = x0 + CHUNK, z1 = z0 + CHUNK;
  const roads = roadsOverlapping(field, x0 - GATHER, z0 - GATHER, x1 + GATHER, z1 + GATHER);
  if (!roads.length) return [];
  const box = [];
  for (const r of roads) {
    for (const rec of waysideForRoad(field, r)) {
      if (rec.x < x0 - GATHER || rec.x > x1 + GATHER || rec.z < z0 - GATHER || rec.z > z1 + GATHER) continue;
      box.push(rec);
    }
  }
  box.sort(byKindThenId);
  const kept = [];
  for (const rec of box) {
    let clash = false;
    for (let i = 0; i < kept.length; i++) {
      const k = kept[i];
      const room = Math.max(k.clear, rec.clear);
      if (room > 0 && (k.x - rec.x) ** 2 + (k.z - rec.z) ** 2 < room * room) { clash = true; break; }
    }
    if (!clash) kept.push(rec);
  }
  return kept.filter((r) => r.x >= x0 && r.x < x1 && r.z >= z0 && r.z < z1);
}

/**
 * The height of a bridge deck over (x, z), or null where no bridge is.
 *
 * This is the whole reason a bridge is more than a picture. A ford in this
 * world is a ravine: the graded road dives to the river bed and climbs out, so
 * a player walking a bridged crossing would swim under his own bridge unless
 * the ground he is given there is the deck. `world_runtime.heightAt` asks this
 * first and falls back to the terrain, and `docs/mmo/wiring/A2.md` quotes the
 * line. It is one call into roads.js's own cache, which is the same question
 * `field.sampleAt` already asks for every terrain vertex, so it is cheap
 * enough to ask for every body in the world every frame.
 */
export function deckAt(field, x, z) {
  const rd = roadDistanceAt(field, x, z);
  if (!rd) return null;
  for (const rec of waysideForRoad(field, rd.road)) {
    if (rec.kind !== 'bridge') continue;
    const dx = rec.x1 - rec.x0, dz = rec.z1 - rec.z0;
    const len2 = dx * dx + dz * dz || 1;
    let u = ((x - rec.x0) * dx + (z - rec.z0) * dz) / len2;
    if (u < -0.03 || u > 1.03) continue;
    u = u < 0 ? 0 : u > 1 ? 1 : u;
    const px = rec.x0 + dx * u, pz = rec.z0 + dz * u;
    if (Math.hypot(x - px, z - pz) > rec.width / 2 + 0.4) continue;
    return rec.y0 + (rec.y1 - rec.y0) * u;
  }
  return null;
}

/**
 * Every piece in the world, for a test or an audit, once each. Not for the
 * runtime: this walks the whole continent.
 */
export function waysideSweep(field, c0 = -17, c1 = 17) {
  const out = [];
  const seen = new Set();
  for (let cz = c0; cz < c1; cz++) {
    for (let cx = c0; cx < c1; cx++) {
      for (const r of roadsOverlapping(field, cx * SITE_CELL, cz * SITE_CELL,
        (cx + 1) * SITE_CELL, (cz + 1) * SITE_CELL)) {
        if (seen.has(r.id)) continue;
        seen.add(r.id);
        out.push(...waysideForRoad(field, r));
      }
    }
  }
  return out;
}
