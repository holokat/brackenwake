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
//              graded profile, which is the line the ford dives out of, and it
//              follows the road's own bends rather than cutting the corner
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
// Nothing stands on a site's pad, nothing stands in water, nothing stands in a
// river, and no two pieces a chunk builds stand within the larger of their two
// `clear` radii. A bridge is the one thing allowed over water, and a bridge and
// a border gate are the two things allowed on the graded road itself.
//
// EVERY kind goes through the same gate, `probeAt().ok`, including the border
// gate, which for a while did not: it stands on the road rather than on the
// verge, and standing on the road was taken for permission to stand anywhere
// the road went. Two gates ended up in river water and three on a settlement's
// pad. A gate now walks the road looking for ground like everything else does,
// and `wayside.test.mjs` counts both to zero over the whole network.
//
// ---- what it costs --------------------------------------------------------
//
// The expensive question on a road is where the water is: the road has to be
// walked at WALK_STEP with a terrain sample at every step, and on a kilometre
// of road that is three hundred samples. A2 paid it whole road on the first
// chunk that touched the road, which cost 2.4 ms on the worst chunk of the
// bigger network and was over its own budget.
//
// So a road is no longer laid out all at once. Its state is a set of probes
// along the road, filled lazily, and:
//
//   the bridges   found from those probes over an arc window, widened either
//                 side to a CUT, which is two probes running that are neither
//                 in a river nor under the deck. No river band and no abutment
//                 walk can reach across a cut, so a window's answer is the
//                 answer the whole road would have given. Cached per road by
//                 the probe the span starts at, so the same bridge found from
//                 two chunks is one bridge
//   the lamps     per station, and a station is a point on a cheap walk that
//                 asks the site grid for the spacing and never asks the terrain
//   the spine     the border gates, the signposts, the shrines, the benches,
//                 the hitching posts and the milestones. These are FEW, a dozen
//                 on a long road, and each one looks at the terrain in one
//                 place, so the spine is worked out whole road and costs
//                 almost nothing
//
// The ground under a piece is worked out from `field.raw` rather than from
// `field.sampleAt`, and the graded road surface is rebuilt here with roads.js's
// own `roadSurface`, which is EXACTLY what field.js does at the centreline: the
// same arithmetic, at half the price, because raw is the expensive half of a
// sample and the zone lookup and the biome chain are no part of this question.
// `wayside.test.mjs` measures every placed piece against `sampleAt` and fails
// on a nanometre, so the two cannot drift apart.

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
 * Metres a signpost walks at a time past a settlement's gate, and the furthest
 * it will go before it gives up.
 *
 * A road leaves some towns straight onto a bridge: Tannerford's road is over
 * water from 42 m past the pad to 162 m past it, and Lowthorpe's leaves into a
 * river bank with a border gate on the far side of it. Neither post could stand
 * anywhere in the first forty four metres, and A2's five fixed offsets gave up
 * there and left two of the world's settlements with no board on them at all.
 * The post now walks until it finds ground, both verges at every step, and the
 * walk stops at the road's own halfway mark so a sign never wanders into the
 * next settlement's half of the road.
 */
export const SIGN_STEP = 9;
export const SIGN_WALK = 300;
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
 * Measured on this world at a metre's resolution: a hundred and sixteen river
 * bands lie across a road, a hundred and seven of them carry the road under the
 * water sheet or drop it well below the deck, and the other nine take it down
 * by a tenth of a metre or less. The first sort gets a bridge; the second is a
 * wet patch in the road and gets nothing, which is the honest answer.
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
/** Metres of arc either side of a piece that are searched for a bridge under it. */
export const BRIDGE_LOOK = 24;
/** Metres from a deck's centreline that still count as standing on the deck. */
export const DECK_HALF = ROAD_HALF_WIDTH + 0.4;
/** Metres of arc past an abutment that `deckAt` still answers over. */
export const DECK_END = 0.25;
/** Metres between points when a road's arc is matched against a chunk's box. */
export const ARC_SCAN = 8;

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

// ------------------------------------------------------------- the questions --

const CONTEXT = new WeakMap();
const NEAR_PLACE = new WeakMap();      // field -> Map(24 m cell -> boolean)

const isSettlement = (s) => !!s && (s.kind === 'town' || s.kind === 'hamlet');

/**
 * What one road has to know about the ground it runs over: every pad near
 * enough to reach it.
 *
 * `field.sampleAt` asks a point's own cell and carries a short list of the
 * seven town precincts too wide to fit in one. A road is a line rather than a
 * point, so it asks once for the lot and then tests a handful of distances per
 * probe, which is cheaper than a cell lookup per probe and, unlike one, sees
 * the 120 m precincts as well.
 *
 * A site with no pad (`flatR` 0) levels no ground and is not in this list: the
 * Standing Hedge is a ring of stones a mile across standing on the hillside the
 * seed made, and refusing every lamp post inside `bodyR` would take the light
 * off eight hundred metres of the Greenwold's road for a ring that is empty in
 * the middle. `bodyR` is a body's reach and not a pad, and `wayside.test.mjs`
 * counts what stands inside one rather than assuming nothing does.
 */
export function contextFor(field, road) {
  const had = CONTEXT.get(road);
  if (had) return had;
  const mid = roadPointAt(road, 0.5);
  const reach = road.total / 2 + 300;
  const near = sitesNear(field, mid.x, mid.z, reach);
  const ctx = { pads: near.filter((s) => s && s.flatR > 0), bodies: near.filter((s) => s && s.bodyR > 0), seed: field.seed };
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
 * Where a road crosses the middle of a realm's edge band.
 *
 * A realm is a disc with a soft edge (`zones.js`): full strength inside `r`,
 * gone at `r + edge`. Half way through that band is where the realm's bias
 * reaches half, which is where `sites.js` says you have entered it, and it is
 * where a border gate belongs. One gate per crossing, carrying the name of the
 * realm whose band it is. A road that goes into a realm and out of it again
 * crosses twice and carries two gates, which is why the crossing's index is in
 * the gate's id.
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

// ------------------------------------------------------ a road's own state --
//
// One of these per road object, and roads are cached per field (roads.js), so
// keying on the road keys on the field as well and two seeds never share a
// lamp post. Everything in it is filled in on demand.

const ROAD_STATE = new WeakMap();

function roadState(field, road) {
  let st = ROAD_STATE.get(road);
  if (st) return st;
  const n = Math.max(2, Math.ceil(road.total / WALK_STEP));
  st = {
    field, road, n, ctx: contextFor(field, road),
    px: new Float64Array(n + 1), pz: new Float64Array(n + 1),
    deck: new Float64Array(n + 1), surf: new Float64Array(n + 1),
    river: new Uint8Array(n + 1), low: new Uint8Array(n + 1),
    filled: new Uint8Array(n + 1), scanned: new Uint8Array(n + 1),
    wet: new Map(),           // first probe of a river run -> whether it wants a bridge
    spans: new Map(),         // first probe of a span -> the bridge record
    spine: null, stations: null, all: null,
    lamps: new Map(),         // station index -> its lamp records
    abut: new Map(),          // bridge id -> the two abutment lamps
  };
  ROAD_STATE.set(road, st);
  return st;
}

/**
 * One probe on the road, worked out once.
 *
 *   river  the road is in water here, and not on a pad where a river is held off
 *   low    the graded surface is more than DECK_CLEAR under what the road's own
 *          profile wants, which is a ravine and not a road
 *   surf   exactly what field.js leaves at the centreline: the graded surface,
 *          with the earthwork faded out by the ford
 */
function fill(st, i) {
  if (st.filled[i]) return;
  const road = st.road;
  const t = i / st.n;
  const p = roadPointAt(road, t);
  const r = st.field.raw(p.x, p.z);
  const d = roadHeightAt(road, t);
  const s = roadSurface(r.h, d, fordFade(r.river));
  st.px[i] = p.x; st.pz[i] = p.z;
  st.deck[i] = d; st.surf[i] = s;
  st.river[i] = r.river > FORD_RIVER && !onPad(st.ctx, p.x, p.z) ? 1 : 0;
  st.low[i] = s < d - DECK_CLEAR ? 1 : 0;
  st.filled[i] = 1;
}

/**
 * Whether probe p is a CUT: p and p + 1 are both out of the water and both up
 * at the level the road wants.
 *
 * This is the whole reason a window of road can be asked about its bridges
 * without walking the road it belongs to. A river run cannot cross a cut, and
 * neither can the walk out to an abutment, which only ever moves while the
 * surface is under the deck. So the spans found by scanning from one cut to the
 * next are exactly the spans a walk of the whole road would have found, and
 * `wayside.test.mjs` proves it by walking the roads again at a metre.
 */
function isCut(st, p) {
  if (p < 0 || p >= st.n) return false;
  fill(st, p); fill(st, p + 1);
  return !st.river[p] && !st.low[p] && !st.river[p + 1] && !st.low[p + 1];
}

/**
 * Whether a river run wants a bridge, measured at REFINE_STEP inside it.
 *
 * A river the road runs level through is a wet patch and not a crossing, and
 * that is decided on a walk of its own rather than on the coarse probes. A band
 * three metres wide gets one coarse probe and it lands wherever it lands:
 * measured, a crossing whose road is 2.4 m under the deck at its middle read
 * 1.09 m at the one probe inside it, which is under BRIDGE_DROP, and the bridge
 * over it would have gone missing.
 */
function wantsBridge(st, start, end) {
  const had = st.wet.get(start);
  if (had !== undefined) return had;
  const road = st.road, n = st.n;
  let deepest = 0, bed = Infinity;
  const t0 = Math.max(0, (start - 1) / n), t1 = Math.min(1, (end + 1) / n);
  const fine = Math.max(2, Math.ceil((t1 - t0) * road.total / REFINE_STEP));
  for (let k = 0; k <= fine; k++) {
    const t = t0 + (t1 - t0) * (k / fine);
    const q = roadPointAt(road, t);
    const r = st.field.raw(q.x, q.z);
    // the depth of the RIVER, not of the ground beside it: the window reaches a
    // coarse step past the band on either side so that a band narrower than one
    // step is measured at all, and a point outside the water has nothing to say
    // about how deep the water is
    if (r.river <= FORD_RIVER || onPad(st.ctx, q.x, q.z)) continue;
    const d = roadHeightAt(road, t);
    const sf = roadSurface(r.h, d, fordFade(r.river));
    if (d - sf > deepest) deepest = d - sf;
    if (sf < bed) bed = sf;
  }
  const want = !(deepest <= BRIDGE_DROP && bed >= SEA_LEVEL);
  st.wet.set(start, want);
  return want;
}

/** The deck's own line: the road's points across the span, ends and every bend. */
export function deckPath(road, t0, t1) {
  const at = (t) => {
    const p = roadPointAt(road, t);
    return { x: p.x, z: p.z, y: roadHeightAt(road, t) };
  };
  const out = [at(t0)];
  const s0 = t0 * road.total, s1 = t1 * road.total;
  for (const s of road.segs) {
    if (s.cum > s0 + 0.05 && s.cum < s1 - 0.05) out.push(at(s.cum / road.total));
  }
  out.push(at(t1));
  return out;
}

/**
 * One bridge, from the probes it spans.
 *
 * A ford in this terrain is a ravine: measured, the graded road falls seven
 * metres in four, crosses a stream and climbs out. The terrain is not changed
 * to fix that and it cannot be, because `roadSurface` clamps the earthwork to
 * 1.5 m either way and lifting the ground would fill in the river the bridge is
 * over. So the DECK is the road's own profile, and `deckAt` hands it to
 * `world_runtime.heightAt` as ground.
 *
 * The deck follows the road's bends. A2 laid it along the straight line between
 * the two abutments, which on the world's longest span, 182 m over an inlet of
 * the Caldera Sea, left the deck twelve metres off the road it is carrying: the
 * body was a beam beside the road, and `deckAt` answered null in the middle of
 * it because the point was out of the road's reach. `path` is the road's own
 * corners across the span and the body is built along it.
 */
function bridgeAt(st, i0, i1) {
  const had = st.spans.get(i0);
  if (had) return had;
  const road = st.road, n = st.n;
  const t0 = i0 / n, t1 = i1 / n;
  let bed = Infinity;
  for (let i = i0; i <= i1; i++) { fill(st, i); if (st.surf[i] < bed) bed = st.surf[i]; }
  const path = deckPath(road, t0, t1);
  const a = path[0], b = path[path.length - 1];
  const tm = (t0 + t1) / 2;
  const mid = roadPointAt(road, tm);
  const zn = realmAt(a.x, a.z);
  const realm = zn ? zn.id : 'wild';
  const style = styleFor(realm);
  const rec = {
    id: `${road.id}#bridge@${i0}`, kind: 'bridge', road: road.id, t: tm,
    // the arc the deck covers, which is what says whether a point on the road
    // is on the bridge: `deckAt`, the placement and the test all read it
    t0, t1,
    realm, style: style.bridge, glow: style.glow,
    x: mid.x, z: mid.z, y: roadHeightAt(road, tm),
    yaw: Math.atan2(b.x - a.x, b.z - a.z),
    x0: a.x, z0: a.z, y0: a.y, x1: b.x, z1: b.z, y1: b.y,
    path, span: (t1 - t0) * road.total, bed,
    width: ROAD_HALF_WIDTH * 2, clear: CLEAR.bridge,
  };
  st.spans.set(i0, rec);
  return rec;
}

/**
 * Every bridge whose span touches probes i0 to i1, worked out from the cuts
 * either side of that window.
 *
 * The scan is A2's own: a maximal run of river probes, thrown out if the road
 * runs level through it, then the walk out to the last ground either side that
 * comes back within DECK_CLEAR of the deck, then two runs whose walks reach
 * into each other made into one bridge. What is new is that it starts and ends
 * at a cut instead of at the ends of the road.
 */
function scanSpans(st, i0, i1) {
  const n = st.n;
  let lo = Math.max(0, Math.min(i0, n - 1));
  while (lo > 0 && !isCut(st, lo)) lo--;
  let hi = Math.max(1, Math.min(i1, n - 1));
  while (hi < n - 1 && !isCut(st, hi)) hi++;
  hi = Math.min(n, hi + 1);
  let last = null;
  for (let i = lo; i <= hi; i++) {
    fill(st, i);
    if (!st.river[i]) continue;
    const start = i;
    let j = i;
    while (j + 1 <= hi && (fill(st, j + 1), st.river[j + 1])) j++;
    i = j;
    if (!wantsBridge(st, start, j)) continue;
    let a = start;
    while (a > 0 && (fill(st, a), st.low[a])) a--;
    let b = j;
    while (b < n && (fill(st, b), st.low[b])) b++;
    if (last !== null && a <= last.i1) {
      // two crossings that reach into each other are one bridge, so the first
      // one's record is replaced by the wider one under the same key
      st.spans.delete(last.i0);
      last.i1 = Math.max(last.i1, b);
      bridgeAt(st, last.i0, last.i1);
    } else {
      last = { i0: a, i1: b };
      bridgeAt(st, a, b);
    }
  }
  for (let i = lo; i <= hi; i++) st.scanned[i] = 1;
}

/** Every bridge on this road whose span touches probes i0 to i1. */
function spansIn(st, i0, i1) {
  const a = Math.max(0, i0), b = Math.min(st.n, i1);
  let all = true;
  for (let i = a; i <= b && all; i++) if (!st.scanned[i]) all = false;
  if (!all) scanSpans(st, a, b);
  const out = [];
  for (const rec of st.spans.values()) {
    if (rec.t1 * st.n < a || rec.t0 * st.n > b) continue;
    out.push(rec);
  }
  out.sort((m, o) => m.t0 - o.t0);
  return out;
}

/** Every bridge whose span touches the arc from s0 to s1 metres. */
function spansAtArc(st, s0, s1) {
  const k = st.n / st.road.total;
  return spansIn(st, Math.floor(s0 * k) - 1, Math.ceil(s1 * k) + 1);
}

/** Whether the road at arc fraction t is on a bridge. */
function onBridgeAt(st, t) {
  const s = t * st.road.total;
  for (const rec of spansAtArc(st, s, s)) {
    if (t >= rec.t0 - 1e-6 && t <= rec.t1 + 1e-6) return true;
  }
  return false;
}

/** Every bridge on the road, which is what the sweep and the tests ask for. */
function spansAll(st) { return spansIn(st, 0, st.n); }

/**
 * Where a road is over water. Kept as an export because it is the question the
 * whole bridge idea is built on, and `wayside.test.mjs` drives it whole road
 * against its own independent walk at a metre.
 */
export function crossingsOf(field, road) {
  return spansAll(roadState(field, road));
}

// -------------------------------------------------------------- placement --

/**
 * Whether a piece may stand where it wants to, given what is already there and
 * the bridges under it.
 *
 * The largest room any kind keeps is CLEAR.gate, nine metres, so a piece can
 * only ever be blocked by something within nine metres of it, and the bridges
 * are asked for over BRIDGE_LOOK of arc either side, which is more than that.
 */
function blocked(st, list, rec) {
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    const room = Math.max(t.clear, rec.clear);
    if (room > 0 && (t.x - rec.x) ** 2 + (t.z - rec.z) ** 2 < room * room) return true;
  }
  const s = rec.t * st.road.total;
  for (const b of spansAtArc(st, s - BRIDGE_LOOK, s + BRIDGE_LOOK)) {
    const room = Math.max(b.clear, rec.clear);
    if (room > 0 && (b.x - rec.x) ** 2 + (b.z - rec.z) ** 2 < room * room) return true;
  }
  return false;
}

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
 * The border gates, the signposts, the shrines, the benches, the hitching
 * posts and the milestones: everything on a road that is not a bridge and not a
 * lamp. A long road carries about a dozen of them, each of them looking at the
 * terrain in one place, so this is worked out whole road and cached.
 */
function spineOf(field, road) {
  const st = roadState(field, road);
  if (st.spine) return st.spine;
  const out = [];
  st.spine = out;
  const ctx = st.ctx;
  const place = (rec) => {
    if (blocked(st, out, rec)) return null;
    out.push(rec);
    return rec;
  };

  // ---- the realm's own border
  //
  // A gate stands ON the road, so it walks along it until it finds a length of
  // road with ground under it, nothing else on it and no bridge under it. A
  // border that falls in the middle of a river gets its gate on the near bank
  // instead of not at all, which is where a real one would be. The gate goes
  // through `probeAt` like every other kind: standing on the road is not
  // permission to stand in the river the road fords.
  realmCrossingsOf(field, road).forEach((g, gi) => {
    const style = styleFor(g.realm);
    for (const step of GATE_STEPS) {
      const t = g.t + step / road.total;
      if (t < 0 || t > 1 || onBridgeAt(st, t)) continue;
      const q = roadPointAt(road, t);
      const ground = probeAt(field, ctx, q.x, q.z);
      if (!ground.ok) continue;
      const put = place({
        id: `${road.id}#gate${gi}:${g.realm}`, kind: 'gate', road: road.id, t,
        realm: g.realm, style: style.gate, glow: style.glow, label: g.name,
        x: q.x, z: q.z, y: roadHeightAt(road, t), yaw: Math.atan2(q.dx, q.dz),
        height: GATE_H, half: ROAD_HALF_WIDTH + 1.2, clear: CLEAR.gate,
        // the crossing this gate marks, so the test can ask a gate what it is
        // for rather than guessing from how near it landed
        crossing: gi, crossingT: g.t,
      });
      if (put) break;
    }
  });

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
      // thing this whole file exists to stop. So the post walks down the road
      // from the town's gate, both verges at every step, until it finds ground
      // it is allowed to stand on with room to stand in, and it walks as far as
      // SIGN_WALK or the road's own halfway mark, whichever comes first.
      let spot = null;
      const reach = Math.min(SIGN_WALK, road.total / 2);
      for (let step = 0; step <= reach && !spot; step += SIGN_STEP) {
        for (const sgn of [side, -side]) {
          const s1 = gate + inward * step;
          if (s1 < 0 || s1 > road.total) continue;
          const t1 = s1 / road.total;
          if (onBridgeAt(st, t1)) continue;
          const p1 = roadPointAt(road, t1);
          const x1 = p1.x + p1.nx * OFF_ROAD * sgn, z1 = p1.z + p1.nz * OFF_ROAD * sgn;
          const g1 = probeAt(field, ctx, x1, z1);
          if (!g1.ok) continue;
          const style = styleFor(g1.realm);
          const sign = place({
            id: `${site.id}#sign`, kind: 'sign', road: road.id, t: t1,
            realm: g1.realm, style: style.lamp, glow: style.glow,
            x: x1, z: z1, y: g1.h, yaw: Math.atan2(p1.dx, p1.dz),
            fork: mine.length > 1, at: site.name, walked: step,
            fingers: fingersAt(field, site, mine), clear: CLEAR.sign,
          });
          if (sign) { spot = { t: t1, p: p1, sgn }; break; }
        }
      }
      // one sign spot in three keeps a shrine on the other side of the road
      if (spot && hash2(site.cx, site.cz, field.seed + 93) % SHRINE_IN === 0) {
        const { p, sgn } = spot;
        const sx = p.x - p.nx * OFF_ROAD * sgn, sz = p.z - p.nz * OFF_ROAD * sgn;
        const sg = probeAt(field, ctx, sx, sz);
        if (sg.ok) {
          const style = styleFor(sg.realm);
          place({
            id: `${site.id}#shrine`, kind: 'shrine', road: road.id, t: spot.t,
            realm: sg.realm, style: style.lamp, glow: style.glow,
            x: sx, z: sz, y: sg.h, yaw: Math.atan2(-p.dx, -p.dz),
            at: site.name, clear: CLEAR.shrine,
          });
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
      if (onBridgeAt(st, t)) continue;
      const p = roadPointAt(road, t);
      const sx = off * side;
      const x = p.x + p.nx * OFF_ROAD * sx, z = p.z + p.nz * OFF_ROAD * sx;
      const g = probeAt(field, ctx, x, z);
      if (!g.ok) continue;
      const style = styleFor(g.realm);
      place({
        id: `${road.id}#${kind}:${end}`, kind, road: road.id, t,
        realm: g.realm, style: style.lamp, glow: style.glow,
        x, z, y: g.h,
        yaw: kind === 'bench' ? Math.atan2(-p.nx * sx, -p.nz * sx) : Math.atan2(p.dx, p.dz),
        at: site.name, clear: CLEAR[kind],
      });
    }
  }

  // ---- the milestones, counted from the road's own settlement
  for (let m = MILESTONE, i = 1; m < road.total; m += MILESTONE, i++) {
    const t = m / road.total;
    if (onBridgeAt(st, t)) continue;
    const p = roadPointAt(road, t);
    const side = hash2(Math.round(p.x), Math.round(p.z), field.seed + 95) % 2 ? 1 : -1;
    const x = p.x + p.nx * OFF_ROAD * side, z = p.z + p.nz * OFF_ROAD * side;
    const g = probeAt(field, ctx, x, z);
    if (!g.ok) continue;
    const style = styleFor(g.realm);
    place({
      id: `${road.id}#mile${i}`, kind: 'milestone', road: road.id, t,
      realm: g.realm, style: style.lamp, glow: style.glow,
      x, z, y: g.h, yaw: Math.atan2(-p.nx * side, -p.nz * side),
      metres: m, from: road.a.name, clear: CLEAR.milestone,
    });
  }

  out.sort(byKindThenId);
  return out;
}

/**
 * The lamp stations along a road: where a post would stand if the ground let
 * it. The walk asks the site grid for the local spacing and never asks the
 * terrain, so a road of forty stations is worked out in the time one terrain
 * sample takes, and a chunk can then pay for the two or three stations that
 * stand in it and no more.
 */
function stationsOf(field, road) {
  const st = roadState(field, road);
  if (st.stations) return st.stations;
  const out = [];
  st.stations = out;
  let s = 0;
  while (s <= road.total) {
    const t = s / road.total;
    const p = roadPointAt(road, t);
    out.push({ i: out.length, s, t, x: p.x, z: p.z, nx: p.nx, nz: p.nz });
    s += spacingAt(field, p.x, p.z);
  }
  return out;
}

/** One lamp post beside the road, or null where the ground refuses it. */
function lampRec(field, st, id, t, x, z, nx, nz, sideSign) {
  const g = probeAt(field, st.ctx, x, z);
  if (!g.ok) return null;
  const style = styleFor(g.realm);
  const rec = {
    id, kind: 'lamp', road: st.road.id, t, realm: g.realm,
    style: style.lamp, glow: style.glow, x, z, y: g.h,
    yaw: Math.atan2(-nx * sideSign, -nz * sideSign), side: sideSign,
    clear: CLEAR.lamp,
  };
  return blocked(st, spineOf(field, st.road), rec) ? null : rec;
}

/**
 * The two lamps of one station, cached.
 *
 * A lamp is checked against the road's spine and against the bridges under it
 * and against nothing else. Two lamps of one road cannot stand in each other's
 * way: the stations are LAMP_NEAR apart along the road and the two verges are
 * 2 * VERGE apart across it, both of them far outside CLEAR.lamp, and
 * `wayside.test.mjs` measures the closest pair in the world rather than taking
 * that on trust. Where a bridge's own abutment lamp does land on a station lamp
 * the chunk's overlap pass settles it, which is the pass's whole job.
 */
function lampsAtStation(field, road, k) {
  const st = roadState(field, road);
  const had = st.lamps.get(k);
  if (had) return had;
  const out = [];
  st.lamps.set(k, out);
  const stn = stationsOf(field, road)[k];
  if (!stn || onBridgeAt(st, stn.t)) return out;
  for (const sideSign of [1, -1]) {
    const x = stn.x + stn.nx * VERGE * sideSign, z = stn.z + stn.nz * VERGE * sideSign;
    const rec = lampRec(field, st, `${road.id}#lamp${k}${sideSign > 0 ? '+' : '-'}`,
      stn.t, x, z, stn.nx, stn.nz, sideSign);
    if (rec) out.push(rec);
  }
  return out;
}

/** A lamp at each end of a bridge, so a span has a light at both abutments. */
function abutmentLamps(field, road, bridge) {
  const st = roadState(field, road);
  const had = st.abut.get(bridge.id);
  if (had) return had;
  const out = [];
  st.abut.set(bridge.id, out);
  const off = 3 / road.total;
  for (const [t, sideSign, tag] of [
    [Math.max(0, bridge.t0 - off), 1, 'lampA'],
    [Math.min(1, bridge.t1 + off), -1, 'lampB'],
  ]) {
    const p = roadPointAt(road, t);
    const x = p.x + p.nx * VERGE * sideSign, z = p.z + p.nz * VERGE * sideSign;
    const rec = lampRec(field, st, `${bridge.id}${tag}`, t, x, z, p.nx, p.nz, sideSign);
    if (rec) out.push(rec);
  }
  return out;
}

function byKindThenId(a, b) {
  const ka = KIND_ORDER.indexOf(a.kind), kb = KIND_ORDER.indexOf(b.kind);
  return ka !== kb ? ka - kb : (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/**
 * Every piece of furniture one road carries, worked out once and cached.
 *
 * This is the whole road, which is what `waysideSweep`, `wayside.test.mjs` and
 * an audit want. A chunk does NOT ask for it: `waysideFor` asks for the spine,
 * which is cheap, and then for the bridges and the lamps of the arc it can
 * actually see. Both go through the same three functions, so a piece is the
 * same piece whichever way it was reached.
 */
export function waysideForRoad(field, road) {
  const st = roadState(field, road);
  if (st.all) return st.all;
  const out = [];
  st.all = out;
  const spans = spansAll(st);
  out.push(...spans);
  out.push(...spineOf(field, road));
  const stations = stationsOf(field, road);
  for (let k = 0; k < stations.length; k++) out.push(...lampsAtStation(field, road, k));
  for (const b of spans) out.push(...abutmentLamps(field, road, b));
  out.sort(byKindThenId);
  return out;
}

/**
 * The stretches of a road that a box can see, in metres of arc.
 *
 * A road can enter a chunk's box, leave it round a bend and come back, so this
 * gives the runs rather than one span from the first touch to the last. The
 * walk is pure geometry at ARC_SCAN and asks the terrain nothing.
 */
function arcRunsIn(road, x0, z0, x1, z1) {
  const pad = OFF_ROAD + ARC_SCAN;
  const n = Math.max(2, Math.ceil(road.total / ARC_SCAN));
  const runs = [];
  let open = null;
  for (let i = 0; i <= n; i++) {
    const s = (i / n) * road.total;
    const p = roadPointAt(road, s / road.total);
    const near = p.x >= x0 - pad && p.x <= x1 + pad && p.z >= z0 - pad && p.z <= z1 + pad;
    if (near) {
      if (!open) open = { s0: s, s1: s };
      open.s1 = s;
    } else if (open) { runs.push(open); open = null; }
  }
  if (open) runs.push(open);
  return runs;
}

/** Every piece one road puts anywhere near the box, and no more of the road than that. */
function waysideNear(field, road, x0, z0, x1, z1) {
  const st = roadState(field, road);
  const out = [...spineOf(field, road)];
  const stations = stationsOf(field, road);
  for (const run of arcRunsIn(road, x0, z0, x1, z1)) {
    const s0 = run.s0 - ARC_SCAN, s1 = run.s1 + ARC_SCAN;
    for (const b of spansAtArc(st, s0, s1)) {
      out.push(b);
      out.push(...abutmentLamps(field, road, b));
    }
    for (const stn of stations) {
      if (stn.s < s0 || stn.s > s1) continue;
      out.push(...lampsAtStation(field, road, stn.i));
    }
  }
  return out;
}

/**
 * The overlap pass: what is left when every piece that stands inside another
 * one's room has given way, in KIND_ORDER and then in id order.
 *
 * Two roads leaving the same town can each put a lamp on the same square metre,
 * and so can a bridge's own abutment lamp and the station lamp beside it. A
 * road works its furniture out on its own and knows nothing about the road next
 * to it, so this is where that is settled, over a box wider than the largest
 * clearance, which is what makes the two chunks either side of a border settle
 * a pair the same way.
 */
export function settleOverlaps(list) {
  const box = [...list].sort(byKindThenId);
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
  return kept;
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
  const gx0 = x0 - GATHER, gz0 = z0 - GATHER, gx1 = x1 + GATHER, gz1 = z1 + GATHER;
  const roads = roadsOverlapping(field, gx0, gz0, gx1, gz1);
  if (!roads.length) return [];
  const box = [];
  const seen = new Set();
  for (const r of roads) {
    for (const rec of waysideNear(field, r, gx0, gz0, gx1, gz1)) {
      if (rec.x < gx0 || rec.x > gx1 || rec.z < gz0 || rec.z > gz1) continue;
      if (seen.has(rec.id)) continue;
      seen.add(rec.id);
      box.push(rec);
    }
  }
  return settleOverlaps(box).filter((r) => r.x >= x0 && r.x < x1 && r.z >= z0 && r.z < z1);
}

/**
 * The height of a bridge deck over (x, z), or null where no bridge is.
 *
 * This is the whole reason a bridge is more than a picture. A ford in this
 * world is a ravine: the graded road dives to the river bed and climbs out, so
 * a player walking a bridged crossing would swim under his own bridge unless
 * the ground he is given there is the deck. `world_runtime.heightAt` asks this
 * first and falls back to the terrain, and `docs/mmo/wiring/A2.md` quotes the
 * line.
 *
 * The answer is the road's own profile at the point, which IS the deck, so a
 * bridge over a bend carries the player round the bend. It costs one
 * `roadDistanceAt`, which is roads.js's own cached lookup and the same question
 * `field.sampleAt` asks for every terrain vertex, and then the bridges of the
 * few probes around the point, which are worked out once and kept.
 *
 * The road the point is nearest is taken to be the road whose deck it is on.
 * That is true of every one of the deck points `wayside.test.mjs` walks, and
 * the test asserts it rather than assuming it: two roads would have to run
 * within a deck's width of each other over a river to break it.
 */
export function deckAt(field, x, z) {
  const rd = roadDistanceAt(field, x, z);
  if (!rd || rd.d > DECK_HALF) return null;
  const st = roadState(field, rd.road);
  const s = rd.t * rd.road.total;
  const pad = DECK_END / rd.road.total;
  for (const rec of spansAtArc(st, s, s)) {
    if (rd.t < rec.t0 - pad || rd.t > rec.t1 + pad) continue;
    return roadHeightAt(rd.road, rd.t);
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
