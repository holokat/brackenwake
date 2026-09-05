// The world's calendar: the things that move on the clock rather than standing
// where the sheet put them.
//
// docs/mmo/14-KALDERA.md names all of them, one or two to a realm, under "Out
// in the open". docs/mmo/wiring/WAVE-B.md's E2 section is the brief. This file
// is the DATA and the pure schedule; `src/game/events_runtime.js` is the thing
// that spawns bodies and says words, and `src/game/app/systems/events.js` is
// the four lines that put it in the frame.
//
// ---- the clock -----------------------------------------------------------
//
// One in-game day is one day cycle, `DAY_CYCLE_MS` in `src/game/dayclock.js`,
// which is 25 real minutes. An in-game hour is a twenty fourth of that, 62.5
// real seconds. Midnight is where the dev bench's own slider says it is:
// `win_dev.js` reads the clock as `(now / cycle + 0.12) - 0.5`, so the first
// midnight after t = 0 falls 0.38 of a cycle in, and every day boundary in this
// file is that instant. Set the bench's clock to 12:00 and `hourAt` returns 12.
//
// Everything below is stated in in-game hours, never in real minutes, because
// the copy says "at dusk" and "over an hour" and the code has to mean the same
// thing the copy does.
//
// ---- what a schedule row is ----------------------------------------------
//
//   scheduleAt(t, opts) -> [{ id, key, name, realm, kind, x, z, r, phase,
//                             from, until, line, article }]
//
// `id` is the event, stable forever. `key` is this occurrence of it, so the log
// line that says an event has begun is said once and not once a frame. `x, z`
// is where it is AT t, which for five of the eight moves while you watch, and
// `r` is how far its middle reaches: standing inside that circle is being in
// it. `phase` runs 0 at the first instant to 1 at the last.
//
// The whole thing is a pure function of t, which is what makes a week of it
// testable in a second in node (`src/mmo/events.test.mjs`) and what lets the
// map draw an event nobody has walked to yet.
//
// ---- what needs the field ------------------------------------------------
//
// Two of them ride real roads, and roads are rolled out of the terrain seed, so
// they are not knowable from the sheet alone. `scheduleAt(t, { field })` takes
// the world field and the routes are cached against it in a WeakMap; with no
// field the wagon still runs, on the straight line the sheet's own places draw,
// and says so through `route.onRoad`.

import { DAY_CYCLE_MS, dayFactorAt } from '../game/dayclock.js';
import { REALMS, REALM_BY_ID, PLACES } from './realms.js';
import { MONSTER_LIST } from './monsters.js';
import { ZONE, REALM_ZONES } from '../world/zones.js';
import { roadsForCell, roadDistanceAt, ROAD_REACH } from '../world/roads.js';
import { SITE_CELL } from '../world/sitegrid.js';

// ------------------------------------------------------------------ the clock

/** One in-game day. The day cycle and the calendar are the same clock. */
export const DAY_MS = DAY_CYCLE_MS;
/** One in-game hour: 62.5 real seconds. */
export const HOUR_MS = DAY_MS / 24;
/**
 * Cycles past t = 0 at which the first midnight falls. dayclock.js puts noon at
 * phase 0.12 of the cycle and midnight half a cycle later, which is 0.62; the
 * midnight BEFORE that is 0.38 of a cycle in, and day 0 starts there.
 */
export const MIDNIGHT_PHASE = 0.38;

const num = (v) => (Number.isFinite(v) ? v : 0);
const frac = (v) => v - Math.floor(v);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, k) => a + (b - a) * k;

/**
 * The first midnight, in milliseconds. Everything below counts from HERE and
 * never from t = 0, because `t / DAY_MS - MIDNIGHT_PHASE` is one subtraction of
 * two fractions and lands a hair over or under a whole hour: at six in the
 * morning it gave 6.000000000000001 and at seven 6.999999999999999, so two
 * different hours floored to the same one and a wandering boss stood still for
 * two of them. Subtracting the epoch in milliseconds is exact.
 */
export const EPOCH_MS = MIDNIGHT_PHASE * DAY_CYCLE_MS;
/** The in-game day number at t. Day 0 begins at the first midnight after t = 0. */
export const dayNumberAt = (t) => Math.floor((num(t) - EPOCH_MS) / DAY_MS);
/** The instant an in-game day begins, in the same milliseconds the frame carries. */
export const dayStartAt = (day) => EPOCH_MS + num(day) * DAY_MS;
/** How far through its day t is: 0 at midnight, 0.5 at noon. */
export const dayFractionAt = (t) => frac((num(t) - EPOCH_MS) / DAY_MS);
/** The hour of the in-game day at t, 0 to 24, midnight at both ends. */
export const hourAt = (t) => dayFractionAt(t) * 24;
/** The instant an hour of a given day falls on. Hours past 24 run into the next day. */
export const atHour = (day, hour) => dayStartAt(day) + num(hour) * HOUR_MS;

/**
 * The threshold the whole game calls night: `NIGHT_BELOW` in
 * `src/game/app/context.js`, which is what the monster runtime rolls its night
 * rows against and what `world_runtime` hands the fauna. Stated here rather
 * than imported, because that file raises a renderer and this one runs in node.
 */
export const NIGHT_BELOW = 0.4;

/**
 * Dusk and dawn, SOLVED off the day clock rather than guessed.
 *
 * The naive answer is the clock's own `NIGHT_FRACTION`, a fifth of the cycle
 * centred on midnight, and it is wrong by an hour and a quarter at each end:
 * `dayFactorAt` puts its raw curve through `raw * 1.4 - 0.2`, so the light is
 * already under the world's night threshold well before the sun is under the
 * horizon. The Ghost Tide has to rise when the game says it is night, not when
 * an unused constant says so, so this walks the day and finds the crossings.
 */
function solveNight() {
  const isNight = (h) => dayFactorAt(atHourRaw(h)) < NIGHT_BELOW;
  const find = (lo, hi, round) => {
    let a = lo, b = hi;
    for (let i = 0; i < 40; i++) {
      const m = (a + b) / 2;
      if (isNight(m) === isNight(a)) a = m; else b = m;
    }
    // rounded INTO the dark at both ends, to a thousandth of an hour, so an
    // event that runs from dusk to dawn is night at its first millisecond and
    // at its last and never straddles the crossing by a rounding error
    return round(((a + b) / 2) * 1000) / 1000;
  };
  return { dusk: find(12, 24, Math.ceil), dawn: find(12, 0, Math.floor) };
}
/** Only used by solveNight, before atHour is safe to call. Same arithmetic. */
const atHourRaw = (hour) => (MIDNIGHT_PHASE + hour / 24) * DAY_MS;
const NIGHT = solveNight();

/** The hour the light drops under the world's night threshold. */
export const DUSK_H = NIGHT.dusk;
/** The hour it comes back up, the morning after. */
export const DAWN_H = NIGHT.dawn;
/** How many in-game hours the dark lasts. The Long Night doubles it. */
export const NIGHT_HOURS = 24 - DUSK_H + DAWN_H;

/** The hours the sun stands highest, which is the whole of the manticore's legend. */
export const NOON_FROM_H = 11;
export const NOON_TO_H = 13;
/** Is t one of the noon hours? `noonOnly` rows exist then and at no other hour. */
export const isNoonHour = (t) => { const h = hourAt(t); return h >= NOON_FROM_H && h < NOON_TO_H; };

/** The moon is eight in-game days round; a moonless night is every fourth. */
export const MOON_DAYS = 8;
export const moonPhaseAt = (t) => ((dayNumberAt(t) % MOON_DAYS) + MOON_DAYS) % MOON_DAYS;
export const isMoonlessDay = (day) => ((day % MOON_DAYS) + MOON_DAYS) % MOON_DAYS === 0;
export const isFullMoonDay = (day) => ((day % MOON_DAYS) + MOON_DAYS) % MOON_DAYS === MOON_DAYS / 2;

// ------------------------------------------------------------------- places

const place = (id) => {
  const z = ZONE[id];
  if (!z) throw new Error(`events: "${id}" is not a place in zones.js`);
  return z;
};
/** Where a place stands, out of the zone table, which is the sheet measured. */
export const pointOf = (id) => { const z = place(id); return { x: z.x, z: z.z }; };
/** The realm a place belongs to. */
export const realmOf = (id) => place(id).parent;

// ------------------------------------------------------------------- routes
//
// A route is a polyline the walker is carried along. `pointOn` reads it at a
// fraction of its whole length, so a wagon that is halfway through its window
// is halfway along its road and not halfway along whichever leg it is on.

/** Turn a list of points into a route with its leg lengths measured. */
export function makeRoute(pts, extra = {}) {
  const clean = (pts || []).filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.z));
  const legs = [];
  let total = 0;
  for (let i = 0; i < clean.length - 1; i++) {
    const len = Math.hypot(clean[i + 1].x - clean[i].x, clean[i + 1].z - clean[i].z) || 1e-6;
    legs.push({ from: clean[i], to: clean[i + 1], len, cum: total });
    total += len;
  }
  return { pts: clean, legs, total, ...extra };
}

/** The point a fraction of the way along a route, both ends clamped. */
export function pointOn(route, k) {
  if (!route || !route.pts.length) return { x: 0, z: 0 };
  if (route.pts.length === 1 || route.total <= 0) return { ...route.pts[0] };
  const want = clamp01(k) * route.total;
  for (const leg of route.legs) {
    if (want <= leg.cum + leg.len || leg === route.legs[route.legs.length - 1]) {
      const u = clamp01((want - leg.cum) / leg.len);
      return { x: lerp(leg.from.x, leg.to.x, u), z: lerp(leg.from.z, leg.to.z, u) };
    }
  }
  return { ...route.pts[route.pts.length - 1] };
}

/** A point on a road's own centreline, at a fraction of the road's length. */
export function roadPointAt(road, t) {
  const want = clamp01(t) * road.total;
  for (let i = 0; i < road.segs.length; i++) {
    const s = road.segs[i];
    if (want <= s.cum + s.len || i === road.segs.length - 1) {
      const u = clamp01((want - s.cum) / s.len);
      return { x: s.x0 + s.dx * u, z: s.z0 + s.dz * u };
    }
  }
  return { x: road.segs[0].x0, z: road.segs[0].z0 };
}

/** How much of a zone a point is inside: 1 within its radius, 0 past its edge. */
function insideZone(zn, x, z) {
  const d = Math.hypot(x - zn.x, z - zn.z);
  if (d <= zn.r) return 1;
  const reach = zn.r + zn.edge;
  return d >= reach ? 0 : 1 - (d - zn.r) / (reach - zn.r);
}

/** How finely a road chain is walked when its cells are collected. */
const ROAD_STEP = 24;

/**
 * Every road whose two ends both stand inside a realm, chained where they share
 * a settlement, longest chain first.
 *
 * A road in this world runs between two rolled settlements in touching cells
 * (`src/world/roads.js`), so a realm has as many or as few as the terrain gave
 * it. The Kingsroad is not drawn on the sheet: the sheet says the Legion's road
 * enters the Greenwold and the terrain says where a road can actually lie, so
 * the Kingsroad is the longest run of real road inside the Greenwold and the
 * wagon rides that. Where a realm has no road at all the caller falls back to
 * the sheet's own places, and says so.
 */
export function roadChainsIn(field, realmId) {
  const zn = ZONE[realmId];
  if (!field || !zn || typeof roadsForCell !== 'function') return [];
  const reach = zn.r + zn.edge;
  const c0 = Math.floor((zn.x - reach) / SITE_CELL), c1 = Math.floor((zn.x + reach) / SITE_CELL);
  const d0 = Math.floor((zn.z - reach) / SITE_CELL), d1 = Math.floor((zn.z + reach) / SITE_CELL);
  const roads = [];
  for (let cz = d0; cz <= d1; cz++) {
    for (let cx = c0; cx <= c1; cx++) {
      let list;
      try { list = roadsForCell(field, cx, cz); } catch { list = []; }
      for (const r of list) {
        // both ends inside the realm outright, so a road that merely grazes the
        // rim is not called this realm's road
        if (insideZone(zn, r.a.x, r.a.z) < 1 || insideZone(zn, r.b.x, r.b.z) < 1) continue;
        roads.push(r);
      }
    }
  }
  if (!roads.length) return [];

  // chain by shared settlement, greedily, longest first. Two roads that meet at
  // one town are one road as far as anything walking them is concerned.
  const byEnd = new Map();
  for (const r of roads) {
    for (const s of [r.a, r.b]) {
      if (!byEnd.has(s.id)) byEnd.set(s.id, []);
      byEnd.get(s.id).push(r);
    }
  }
  const used = new Set();
  const chains = [];
  // A road is a polyline with one or two bends in it, not the straight line
  // between its two towns, so a chain carries every bend point. A wagon that
  // walked the straight line would be off the road for most of its length,
  // which is exactly what `field.sampleAt(x, z).road` would then say.
  const ptsOf = (r) => r.pts.map((p) => ({ x: p.x, z: p.z }));
  for (const seed of roads) {
    if (used.has(seed.id)) continue;
    used.add(seed.id);
    let pts = ptsOf(seed);
    let headId = seed.a.id, tailId = seed.b.id;
    let grew = true;
    while (grew) {
      grew = false;
      for (const atTail of [true, false]) {
        const endId = atTail ? tailId : headId;
        for (const r of byEnd.get(endId) || []) {
          if (used.has(r.id)) continue;
          const far = r.a.id === endId ? r.b : r.b.id === endId ? r.a : null;
          if (!far) continue;
          used.add(r.id);
          // the new road's points, running away from the end we are joining
          const line = r.a.id === endId ? ptsOf(r) : ptsOf(r).reverse();
          if (atTail) { pts = pts.concat(line.slice(1)); tailId = far.id; }
          else { pts = line.slice(0, -1).reverse().concat(pts); headId = far.id; }
          grew = true;
          break;
        }
        if (grew) break;
      }
    }
    chains.push(makeRoute(pts, { onRoad: true, realm: realmId }));
  }
  chains.sort((a, b) => b.total - a.total);
  return chains;
}

/**
 * The point on the nearest road, or the point itself where no road runs.
 *
 * The Legion's column walks between the places its realm holds, and where that
 * walk crosses a real road it walks on it. `ROAD_REACH` is roads.js's own look
 * radius, so this asks exactly the question `field.sampleAt` asks.
 */
export function snapToRoad(field, x, z) {
  if (!field) return { x, z, onRoad: false };
  let rd = null;
  try { rd = roadDistanceAt(field, x, z); } catch { rd = null; }
  if (!rd || rd.d > ROAD_REACH) return { x, z, onRoad: false };
  const p = roadPointAt(rd.road, rd.t);
  return { x: p.x, z: p.z, onRoad: true };
}

// ------------------------------------------------- the Kingsroad and the march

/** Routes are a pure function of the field, so one field is one answer. */
const ROUTES = new WeakMap();
const routeCache = (field) => {
  if (!field) return null;
  let m = ROUTES.get(field);
  if (!m) { m = new Map(); ROUTES.set(field, m); }
  return m;
};

/**
 * The Kingsroad the Tithe Wagon rides: the longest run of real road inside the
 * Greenwold. With no field, the line the sheet draws from the Kingsroad's own
 * marker to the Mill Run, which is where the sheet says the wagon crosses.
 */
export function kingsroadRoute(field) {
  const cache = routeCache(field);
  if (cache && cache.has('kingsroad')) return cache.get('kingsroad');
  const chains = roadChainsIn(field, 'greenwold');
  const route = chains.length
    ? chains[0]
    : makeRoute([pointOf('kingsroad'), pointOf('millrun')], { onRoad: false, realm: 'greenwold' });
  if (cache) cache.set('kingsroad', route);
  return route;
}

/**
 * The places a realm's Legion holds, in the order a column would walk them.
 *
 * WAVE-B asked for "the Legion camps of a realm", and the sheet does not call
 * them all camps: the Legion holds a road in the Greenwold, a ford in the Deep,
 * a pass in the Stormpeaks and a whole harbour town at the Throne. So this is a
 * written table, and `auditEvents()` refuses any place whose own row in
 * realms.js does not name the Legion, and refuses to let a realm with two or
 * more such places be left out of it. Both directions, measured at import.
 */
export const LEGION_HOLDS = {
  greenwold: ['kingsroad', 'oldcellars'],
  verdant: ['rootriver', 'templeoffaces_deep'],
  emberwastes: ['cultistcamp', 'glassroad', 'brasscity'],
  stormpeaks: ['legionpass', 'cairnroad'],
  frostreach: ['icevault', 'icevault_deep'],
  ashenthrone: ['cinderport', 'outerworks'],
};
/** The realms that see a march. Six of the nine; three hold no Legion at all. */
export const MARCH_REALMS = Object.keys(LEGION_HOLDS);

/**
 * The column's route through a realm: the holds in order, each pulled onto a
 * road where a road runs under it, which is what "on the roads where roads
 * exist" means with a terrain that decides for itself where roads can lie.
 */
export function marchRoute(realmId, field) {
  const cache = routeCache(field);
  const key = `march:${realmId}`;
  if (cache && cache.has(key)) return cache.get(key);
  const holds = LEGION_HOLDS[realmId] || [];
  let onRoad = false;
  const pts = holds.map((id) => {
    const p = pointOf(id);
    const s = snapToRoad(field, p.x, p.z);
    if (s.onRoad) onRoad = true;
    return { x: s.x, z: s.z };
  });
  const route = makeRoute(pts, { onRoad, realm: realmId, holds });
  if (cache) cache.set(key, route);
  return route;
}

// -------------------------------------------------------------- the Brass City

/**
 * The Brass City's four wells, a ring about where the sheet stands it.
 *
 * The sheet says the city walks a circuit of the wells and kneels to drink, so
 * the stations are the four points of the compass about its own marker at
 * `BRASS_STATION_R`, which keeps every one of them well inside the Ember
 * Wastes. V1 builds the body and reads `brassCityAt` for where to put it.
 */
export const BRASS_STATION_R = 800;   // 900 put the West Well past the realm edge, the city stands 1218 m west of the centre
export const BRASS_STATIONS = (() => {
  const c = pointOf('brasscity');
  const names = ['the North Well', 'the East Well', 'the South Well', 'the West Well'];
  return names.map((name, i) => {
    const a = (i / 4) * Math.PI * 2;
    return { name, x: c.x + Math.sin(a) * BRASS_STATION_R, z: c.z - Math.cos(a) * BRASS_STATION_R };
  });
})();
/** It stands for twenty three hours and walks for one, four days to the circuit. */
export const BRASS_MOVE_H = 1;
export const BRASS_CIRCUIT_DAYS = BRASS_STATIONS.length;

/**
 * Where the Brass City is at t: at a well, or between two of them.
 *
 * @returns { x, z, station, stationIndex, next, moving, k, until }
 *   `k` is 0 to 1 across the walk and is 0 the whole time it stands.
 */
export function brassCityAt(t) {
  const day = dayNumberAt(t);
  const i = ((day % BRASS_CIRCUIT_DAYS) + BRASS_CIRCUIT_DAYS) % BRASS_CIRCUIT_DAYS;
  const j = (i + 1) % BRASS_CIRCUIT_DAYS;
  const h = hourAt(t);
  const from = BRASS_STATIONS[i], to = BRASS_STATIONS[j];
  const moveFrom = 24 - BRASS_MOVE_H;
  if (h < moveFrom) {
    return {
      x: from.x, z: from.z, station: from.name, stationIndex: i,
      next: to.name, moving: false, k: 0, until: atHour(day, moveFrom),
    };
  }
  const k = clamp01((h - moveFrom) / BRASS_MOVE_H);
  return {
    x: lerp(from.x, to.x, k), z: lerp(from.z, to.z, k),
    station: null, stationIndex: i, next: to.name,
    moving: true, k, until: atHour(day, 24),
  };
}

// -------------------------------------------------------- the wandering bosses

/**
 * The rows that do not sit in a lair. `wanders` says there is a route in
 * `src/mmo/monsters.js`; `noonOnly` says the hour of the day decides whether it
 * is anywhere at all. Both tags are declared unwired in that file's TAG_RULES,
 * and this is the layer that wires them.
 */
export const WANDER_HOURS = 1;      // in-game hours at each place on the route

/** Build the roster from the monster rows, so a third wanderer needs no edit here. */
function buildWanderers(rows) {
  const out = [];
  for (const m of rows) {
    if (!Array.isArray(m.route) || !m.route.length) continue;
    const realm = realmOf(m.route[0]);
    out.push({
      id: m.id, name: m.name, realm,
      noonOnly: (m.notes || []).includes('noonOnly'),
      route: m.route.map((id) => ({ place: id, name: ZONE[id].name, ...pointOf(id) })),
    });
  }
  return out;
}

let WANDERERS = [];
/** Called once at import, and by the test with its own rows. */
export function loadWanderers(rows) { WANDERERS = buildWanderers(rows); return WANDERERS; }
export const wanderers = () => WANDERERS;
export const wandererById = (id) => WANDERERS.find((w) => w.id === id) || null;

/**
 * Where a wandering boss stands at t, or null when it is nowhere.
 *
 * It moves one place along its route every in-game hour and stands at that
 * place. A `noonOnly` row is only anywhere at all in the noon hours, which is
 * why `noon` is a sundial the Ashwalkers set their day by.
 */
export function wanderPointAt(id, t) {
  const w = wandererById(id);
  if (!w) return null;
  if (w.noonOnly && !isNoonHour(t)) return null;
  // hours counted from midnight, so a boss moves ON the hour and not 9.12
  // hours after it, which is where counting from t = 0 would put every step
  const hour = Math.floor((num(t) - EPOCH_MS) / (HOUR_MS * WANDER_HOURS));
  const i = ((hour % w.route.length) + w.route.length) % w.route.length;
  const at = w.route[i];
  const until = EPOCH_MS + (hour + 1) * WANDER_HOURS * HOUR_MS;
  return {
    id: w.id, name: w.name, realm: w.realm, place: at.place, placeName: at.name,
    x: at.x, z: at.z, index: i, until, noonOnly: w.noonOnly,
  };
}

// ------------------------------------------------------------------ the events
//
// Hours are in-game hours of the in-game day. `every` is a period in in-game
// days and `on` the day of that period it falls on, so a reader can see at a
// glance how often a thing happens without running it.

/**
 * How wide a thing has to be before standing in it is being in it, in metres.
 *
 * `blossom` and `longnight` are 0 because those two are not a place you walk
 * into, they are weather over a whole realm: `positionOf` gives them their
 * realm's own radius, which for the Verdant Deep is 2000 m and for Frostreach
 * 2200 m, and that is what a schedule row carries.
 */
export const EVENT_R = {
  wagon: 70, march: 70, tide: 260, wind: 100, blossom: 0, longnight: 0, brass: 220,
};

export const EVENTS = [
  {
    id: 'tithewagon', name: 'The Tithe Wagon', realm: 'greenwold', kind: 'wagon',
    every: 3, on: 0, fromH: 7, toH: 17, r: EVENT_R.wagon,
    article: 'a Legion wagon on the road',
    line: 'The Legion\'s tax wagon is on the Kingsroad, four soldiers and an archer walking it.',
    spawns: [['legionSoldier', 4], ['legionArcher', 1]],
  },
  {
    id: 'ghosttide', name: 'The Ghost Tide', realm: 'sunkenkingdom', kind: 'tide',
    every: MOON_DAYS, on: 0, fromH: DUSK_H, toH: 24 + DAWN_H, r: EVENT_R.tide,
    article: 'the drowned, walking up out of the sea',
    line: 'The sea has gone quiet and the drowned are walking out of it in ranks, the way they did when there was a king.',
    spawns: [['drowned', 4], ['drownedMarine', 2]],
  },
  {
    id: 'bonewind', name: 'The Bone Wind', realm: 'boneyard', kind: 'wind',
    every: 1, on: 0, fromH: 15, toH: 16, r: EVENT_R.wind,
    article: 'a wall of ash crossing the plain',
    line: 'The ash is up. Somewhere inside it the nine dead dragons are standing, and nothing out here can see to swing straight.',
    spawns: [['boneHound', 3], ['ashWraith', 1]],
  },
  {
    id: 'blossomfall', name: 'The Blossom Fall', realm: 'verdant', kind: 'blossom',
    every: 4, on: 1, fromH: 5, toH: 6, r: EVENT_R.blossom,
    article: 'the whole canopy shedding at once',
    line: 'The canopy is shedding. The river is running pink, everything hidden is showing, and the ground is giving twice what it has.',
    spawns: [],
  },
  {
    id: 'longnight', name: 'The Long Night', realm: 'frostreach', kind: 'longnight',
    every: 7, on: 2, fromH: DUSK_H, toH: 24 + DAWN_H + NIGHT_HOURS, r: EVENT_R.longnight,
    article: 'a night that does not end',
    line: 'The sun is not coming up over Frostreach. The giants have lit the glacier from inside, and what hunts at night is hunting anyway.',
    spawns: [['frostWolf', 3], ['direWolf', 1]],
  },
];

/** The march is one row per realm that holds the Legion, built from the table. */
export const MARCH_EVENTS = MARCH_REALMS.map((realm) => ({
  id: `legionmarch:${realm}`, name: 'The Legion\'s March', realm, kind: 'march',
  every: 1, on: 0, fromH: 9, toH: 15, r: EVENT_R.march,
  article: 'a column of Legion soldiers on the march',
  line: `A Legion column is on the march across ${REALM_BY_ID[realm].name}, and it is not going round you.`,
  spawns: [['legionSoldier', 6], ['legionKnight', 1]],
}));

/** Every timed row, the five named ones and the six marches. */
export const ALL_EVENTS = [...EVENTS, ...MARCH_EVENTS];
export const EVENT_BY_ID = Object.fromEntries(ALL_EVENTS.map((e) => [e.id, e]));

/** How many soldiers a march is: six to ten, decided by the realm and the day. */
export function marchStrength(realm, day) {
  let h = 2166136261;
  const s = `${realm}:${day}`;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return 6 + (h % 5);
}

/** The day of the period a row falls on, and whether this day is that day. */
const runsOnDay = (row, day) => (((day - row.on) % row.every) + row.every) % row.every === 0;

/**
 * Where a row's occurrence stands at t, and how it got there.
 *
 * Each kind moves in its own way, and every one of them is a pure function of
 * `k`, the fraction of the way through the window:
 *
 *   wagon    end to end of the Kingsroad and back is too far for one day, so it
 *            rides it one way, the direction alternating with the occurrence
 *   march    along the realm's holds, on the road where a road runs under it
 *   tide     up the shore from the Coliseum to the Reef Stair
 *   wind     from the Rib Cathedral straight across the Boneyard and out
 *   blossom  the whole of the Verdant Deep, which is what "in the realm" means
 *   longnight the whole of Frostreach, the same
 */
function positionOf(row, day, k, field) {
  switch (row.kind) {
    case 'wagon': {
      const route = kingsroadRoute(field);
      const backwards = (Math.floor(day / row.every) % 2) === 1;
      const p = pointOn(route, backwards ? 1 - k : k);
      return { ...p, r: row.r, onRoad: !!route.onRoad };
    }
    case 'march': {
      const route = marchRoute(row.realm, field);
      const backwards = (day % 2) === 1;
      const p = pointOn(route, backwards ? 1 - k : k);
      const snapped = snapToRoad(field, p.x, p.z);
      return { x: snapped.x, z: snapped.z, r: row.r, onRoad: snapped.onRoad };
    }
    case 'tide': {
      const a = pointOf('coliseum'), b = pointOf('reefstair');
      return { x: lerp(a.x, b.x, k), z: lerp(a.z, b.z, k), r: row.r, onRoad: false };
    }
    case 'wind': {
      // out of the Rib Cathedral, through the middle of the plain, and away
      const start = pointOf('ribcathedral');
      const zn = ZONE[row.realm];
      const dx = zn.x - start.x, dz = zn.z - start.z;
      const d = Math.hypot(dx, dz) || 1;
      const end = { x: zn.x + (dx / d) * zn.r, z: zn.z + (dz / d) * zn.r };
      return { x: lerp(start.x, end.x, k), z: lerp(start.z, end.z, k), r: row.r, onRoad: false };
    }
    default: {
      const zn = ZONE[row.realm];
      return { x: zn.x, z: zn.z, r: row.r || zn.r, onRoad: false };
    }
  }
}

/**
 * Every event that is live at t, where it is and how far through it is.
 *
 * Deterministic: the same t and the same field give the same list, every time,
 * on any machine. A row whose window crosses midnight is found by looking at
 * yesterday as well as today, which is what makes the Ghost Tide one night and
 * not two halves of two.
 */
export function scheduleAt(t, opts = {}) {
  const now = num(t);
  const field = opts.field || null;
  const today = dayNumberAt(now);
  const out = [];
  for (const row of ALL_EVENTS) {
    for (const day of [today - 2, today - 1, today]) {
      if (!runsOnDay(row, day)) continue;
      const from = atHour(day, row.fromH);
      const until = atHour(day, row.toH);
      if (now < from || now >= until) continue;
      const k = clamp01((now - from) / (until - from));
      const at = positionOf(row, day, k, field);
      out.push({
        id: row.id, key: `${row.id}@${day}`, name: row.name, realm: row.realm,
        kind: row.kind, day,
        x: at.x, z: at.z, r: at.r, onRoad: at.onRoad,
        phase: k, from, until,
        line: row.line, article: row.article,
        spawns: row.kind === 'march'
          ? [['legionSoldier', marchStrength(row.realm, day)], ['legionKnight', 1]]
          : row.spawns,
      });
    }
  }
  return out;
}

/** One event at one instant, or null when it is not running. */
export function at(id, t, opts = {}) {
  for (const e of scheduleAt(t, opts)) if (e.id === id) return e;
  return null;
}

/** The next instant an event begins, at or after t. Null if it never does. */
export function nextAt(id, t, opts = {}) {
  const row = EVENT_BY_ID[id];
  if (!row) return null;
  const from = dayNumberAt(num(t));
  for (let day = from - 2; day <= from + row.every * 2 + 2; day++) {
    if (!runsOnDay(row, day)) continue;
    const start = atHour(day, row.fromH);
    if (start >= num(t)) return start;
  }
  return null;
}

// -------------------------------------------------------------------- the audit

/**
 * Every promise this file makes, checked at import.
 *
 * The class of bug this is here to stop is the one CLAUDE.md names: a table of
 * ids that match no place, a window that reads one duration and means another,
 * a realm named in the copy that the schedule never visits.
 */
export function auditEvents() {
  const bad = [];
  const names = (pl) => `${pl.geography} ${pl.contains}`;
  const byPlace = Object.fromEntries(PLACES.map((pl) => [pl.id, pl]));

  for (const [realm, holds] of Object.entries(LEGION_HOLDS)) {
    if (!REALM_BY_ID[realm]) bad.push(`LEGION_HOLDS names "${realm}", which is not a realm`);
    if (holds.length < 2) bad.push(`${realm}: a march between ${holds.length} place(s) is not a march`);
    for (const id of holds) {
      const pl = byPlace[id];
      if (!pl) { bad.push(`${realm}: "${id}" is not a place in realms.js`); continue; }
      if (pl.realm !== realm) bad.push(`${realm}: "${id}" stands in ${pl.realm}`);
      if (!/Legion/.test(names(pl))) bad.push(`${realm}: the sheet's row for "${id}" does not name the Legion`);
    }
  }
  // and the other direction: a realm the sheet says the Legion holds in two
  // places or more has a march, or the table has forgotten it
  for (const r of REALMS) {
    const held = r.places.filter((pl) => /Legion/.test(names(pl)));
    if (held.length >= 2 && !LEGION_HOLDS[r.id]) {
      bad.push(`${r.id}: the sheet names the Legion at ${held.length} places and there is no march`);
    }
    if (held.length < 2 && LEGION_HOLDS[r.id]) {
      bad.push(`${r.id}: a march where the sheet names the Legion ${held.length} time(s)`);
    }
  }

  for (const row of ALL_EVENTS) {
    const where = `event ${row.id}`;
    if (!ZONE[row.realm] || ZONE[row.realm].parent) bad.push(`${where}: "${row.realm}" is not a realm`);
    if (!(row.every >= 1)) bad.push(`${where}: every ${row.every} days`);
    if (!(row.on >= 0 && row.on < row.every)) bad.push(`${where}: falls on day ${row.on} of ${row.every}`);
    if (!(row.toH > row.fromH)) bad.push(`${where}: hour ${row.fromH} to ${row.toH} is not a window`);
    if (row.toH - row.fromH > 24) bad.push(`${where}: a window of ${row.toH - row.fromH} hours is longer than a day`);
    if (!row.line || !row.article) bad.push(`${where}: nothing to say when it begins`);
    for (const text of [row.name, row.line, row.article]) if (/—/.test(text)) bad.push(`${where}: em dash`);
    for (const [id, n] of row.spawns || []) {
      if (typeof id !== 'string' || !(n >= 1)) bad.push(`${where}: spawns ${n} of ${id}`);
    }
  }
  const ids = new Set();
  for (const row of ALL_EVENTS) {
    if (ids.has(row.id)) bad.push(`two events are called "${row.id}"`);
    ids.add(row.id);
  }

  if (BRASS_STATIONS.length !== 4) bad.push(`the Brass City has ${BRASS_STATIONS.length} stations, not four`);
  for (const s of BRASS_STATIONS) {
    const w = insideZone(ZONE.emberwastes, s.x, s.z);
    if (w < 1) bad.push(`the Brass City's ${s.name} stands outside the Ember Wastes`);
  }

  for (const w of WANDERERS) {
    if (w.route.length < 2) bad.push(`${w.id}: a route of ${w.route.length} place(s)`);
    for (const p of w.route) {
      if (realmOf(p.place) !== w.realm) bad.push(`${w.id}: ${p.place} is in ${realmOf(p.place)} and not ${w.realm}`);
    }
  }

  if (bad.length) throw new Error(`events: ${bad.length} problem(s)\n  ${bad.join('\n  ')}`);
  return {
    events: ALL_EVENTS.length, marches: MARCH_EVENTS.length,
    wanderers: WANDERERS.length, stations: BRASS_STATIONS.length,
  };
}

loadWanderers(MONSTER_LIST);
auditEvents();
