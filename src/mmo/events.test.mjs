// The world's calendar, measured. Run: node src/mmo/events.test.mjs
//
// `scheduleAt` is a pure function of the clock and the terrain, so a whole week
// of the game can be walked in node in under a second and every claim made
// about it can be a number. What is proved here:
//
//   the clock          midnight, noon and the hour agree with dayclock.js and
//                      with the dev bench's own slider arithmetic
//   the week           every window opens and closes on the day and the hour
//                      the table says, over 7 in-game days, both directions
//   the edges          live at the first millisecond, live at the last, dead a
//                      minute before and a minute after
//   the Kingsroad      the wagon is on real road for every metre of its ride,
//                      measured with `field.sampleAt(x, z).road`
//   the Brass City     a day at each well and an hour between, four wells
//   the wanderers      one place an in-game hour, never outside their realm,
//                      and the noon manticore only at noon

import { createWorldField } from '../world/field.js';
import { dayFactorAt, DAY_CYCLE_MS } from '../game/dayclock.js';
import { clockOffsetFor } from '../game/win_dev.js';
import {
  DAY_MS, HOUR_MS, dayNumberAt, dayStartAt, dayFractionAt, hourAt, atHour,
  DUSK_H, DAWN_H, NIGHT_HOURS, NIGHT_BELOW, NOON_FROM_H, NOON_TO_H, isNoonHour, MOON_DAYS,
  ALL_EVENTS, EVENT_BY_ID, MARCH_EVENTS, LEGION_HOLDS,
  scheduleAt, at, nextAt, auditEvents, marchStrength,
  brassCityAt, BRASS_STATIONS, BRASS_MOVE_H, BRASS_CIRCUIT_DAYS,
  kingsroadRoute, marchRoute, roadChainsIn, pointOn,
  wanderers, wanderPointAt, WANDER_HOURS,
} from './events.js';
import { ZONE } from '../world/zones.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

const field = createWorldField(20260904, { homeBiome: 'meadow', homeY: -0.3 });
/** How far a point is inside a zone: 1 within its radius, 0 past its soft edge. */
const inZone = (zn, x, z) => {
  const d = Math.hypot(x - zn.x, z - zn.z);
  return d <= zn.r ? 1 : d >= zn.r + zn.edge ? 0 : 1 - (d - zn.r) / zn.edge;
};

console.log('events: the clock the calendar keeps');
{
  const counted = auditEvents();
  check('the audit passes at import and counts what is there',
    counted.events === ALL_EVENTS.length && counted.marches === MARCH_EVENTS.length,
    `${counted.events} events, ${counted.marches} of them marches, ${counted.wanderers} wanderers, ${counted.stations} stations`);
  check('an in-game day is a day cycle, 25 real minutes', DAY_MS === DAY_CYCLE_MS && DAY_MS === 1_500_000, `${DAY_MS} ms`);
  check('an in-game hour is 62.5 real seconds', HOUR_MS === 62_500, `${HOUR_MS} ms`);

  // midnight is where the day starts, and where the sky is darkest
  const mid = dayStartAt(3);
  check('a day begins at hour 0', hourAt(mid) === 0 && dayNumberAt(mid) === 3, `day ${dayNumberAt(mid)}, hour ${hourAt(mid)}`);
  check('and the day before it ends a millisecond earlier', dayNumberAt(mid - 1) === 2);
  const noon = atHour(3, 12);
  check('noon is halfway through the day', Math.abs(dayFractionAt(noon) - 0.5) < 1e-9);
  check('and the sun is at its highest there', dayFactorAt(noon) === 1, `dayFactor ${dayFactorAt(noon).toFixed(3)}`);
  check('while midnight is dark', dayFactorAt(mid) === 0, `dayFactor ${dayFactorAt(mid).toFixed(3)}`);
  check('dusk and dawn are solved off the day clock, not guessed at',
    DUSK_H > 21 && DUSK_H < 23 && DAWN_H > 1 && DAWN_H < 3, `night runs ${DUSK_H} to ${DAWN_H}, ${NIGHT_HOURS.toFixed(3)} hours of it`);
  check('the world calls it night at dusk and day an hour before it',
    dayFactorAt(atHour(3, DUSK_H + 0.01)) < NIGHT_BELOW && dayFactorAt(atHour(3, DUSK_H - 1)) > NIGHT_BELOW,
    `${dayFactorAt(atHour(3, DUSK_H + 0.01)).toFixed(3)} against ${dayFactorAt(atHour(3, DUSK_H - 1)).toFixed(3)}, the threshold ${NIGHT_BELOW}`);
  check('and it is day again an hour after dawn',
    dayFactorAt(atHour(3, DAWN_H - 0.01)) < NIGHT_BELOW && dayFactorAt(atHour(3, DAWN_H + 1)) > NIGHT_BELOW);

  // the dev bench's slider and this file are one clock, which is the whole of
  // how a tester sees the Bone Wind by dragging Time of day to 15:00
  let worst = 0;
  for (const want of [0, 0.25, 0.5, 0.75, 0.9]) {
    const now = 987_654;
    const t = now + clockOffsetFor(want, now);
    const d = Math.abs(dayFractionAt(t) - want);
    worst = Math.max(worst, Math.min(d, 1 - d));      // 0 and 1 are the same midnight
  }
  check('the dev bench slider and hourAt read the same clock', worst < 1e-9, `worst disagreement ${worst.toExponential(2)}`);
}

console.log('events: a full week of the schedule, at one minute steps');
{
  const t0 = dayStartAt(0);
  const week = 7 * DAY_MS;
  const seen = new Map();          // event id -> Set of occurrence keys
  const doubled = [];
  const strayed = [];
  let samples = 0;
  for (let t = t0; t < t0 + week; t += 60_000) {
    samples++;
    const list = scheduleAt(t, { field });
    const perId = new Map();
    for (const e of list) {
      if (!seen.has(e.id)) seen.set(e.id, new Set());
      seen.get(e.id).add(e.key);
      perId.set(e.id, (perId.get(e.id) || 0) + 1);
      const zn = ZONE[e.realm];
      if (inZone(zn, e.x, e.z) <= 0) strayed.push(`${e.key} at ${Math.round(e.x)}, ${Math.round(e.z)} is out of ${e.realm}`);
    }
    for (const [id, n] of perId) if (n > 1) doubled.push(`${id} x${n}`);
  }
  check('a week is walked at one minute steps', samples === 175, `${samples} samples over 7 in-game days`);
  check('no event is ever running twice at once', doubled.length === 0, doubled.slice(0, 3).join(', '));
  check('and nothing ever walks out of its own realm', strayed.length === 0, strayed.slice(0, 2).join('; '));

  // the once-a-day rows are seen seven times, the every-third row twice or
  // three times, and the seven-day row once. Counted, not asserted.
  const count = (id) => (seen.get(id) ? seen.get(id).size : 0);
  check('the Legion marches once a day in each of its six realms',
    MARCH_EVENTS.every((m) => count(m.id) === 7), MARCH_EVENTS.map((m) => `${m.realm}:${count(m.id)}`).join(' '));
  check('the Bone Wind rises once a day', count('bonewind') === 7, `${count('bonewind')} in the week`);
  check('the Tithe Wagon runs every third day', count('tithewagon') === 3, `days ${[...(seen.get('tithewagon') || [])].join(', ')}`);
  check('the Blossom Fall every fourth', count('blossomfall') === 2, `${count('blossomfall')} in the week`);
  check('the Long Night once in seven', count('longnight') === 1, `${count('longnight')} in the week`);
  check('the Ghost Tide on the moonless night, one in eight',
    count('ghosttide') === 1 && MOON_DAYS === 8, `${count('ghosttide')} in the week, a moon of ${MOON_DAYS} days`);

  // a finer sweep, because a one minute step is coarser than the Bone Wind's
  // own hour and would miss a window that opened and shut between two samples
  let fine = 0, windMinutes = 0;
  for (let t = t0; t < t0 + DAY_MS; t += 2_000) {
    fine++;
    if (at('bonewind', t, { field })) windMinutes += 2_000;
  }
  check('the Bone Wind lasts one in-game hour, measured at two second steps',
    Math.abs(windMinutes - HOUR_MS) <= 2_000, `${(windMinutes / 1000).toFixed(1)} s of a ${(HOUR_MS / 1000).toFixed(1)} s hour, ${fine} samples`);
}

console.log('events: both edges of every window, and a minute outside each');
{
  const day = 0;
  const bad = [];
  for (const row of ALL_EVENTS) {
    // the first day at or after day 0 that this row falls on
    let d = day;
    while (((d - row.on) % row.every + row.every) % row.every !== 0) d++;
    const from = atHour(d, row.fromH), until = atHour(d, row.toH);
    const live = (t) => !!at(row.id, t, { field });
    if (!live(from)) bad.push(`${row.id} is not live at its first millisecond`);
    if (!live(until - 1)) bad.push(`${row.id} is not live at its last millisecond`);
    if (live(until)) bad.push(`${row.id} is still live at the instant it ends`);
    if (live(from - 60_000)) bad.push(`${row.id} is live a minute before it begins`);
    if (live(until + 60_000)) bad.push(`${row.id} is live a minute after it ends`);
    const e = at(row.id, from, { field });
    const f = at(row.id, until - 1, { field });
    if (e.phase !== 0) bad.push(`${row.id} begins at phase ${e.phase}`);
    if (f.phase < 0.999) bad.push(`${row.id} ends at phase ${f.phase}`);
    if (e.from !== from || e.until !== until) bad.push(`${row.id} reports a window it does not keep`);
  }
  check(`all ${ALL_EVENTS.length} windows open and close on the millisecond`, bad.length === 0, bad.slice(0, 3).join('; '));

  // the Ghost Tide crosses midnight, which is the case a naive "today only"
  // schedule gets wrong in exactly one direction
  const tide = EVENT_BY_ID.ghosttide;
  const nightStart = atHour(0, tide.fromH), nightEnd = atHour(0, tide.toH);
  check('the Ghost Tide is one night and not two halves of two',
    !!at('ghosttide', nightStart + 1) && !!at('ghosttide', nightEnd - 1) && dayNumberAt(nightEnd - 1) === 1,
    `from day ${dayNumberAt(nightStart)} into day ${dayNumberAt(nightEnd - 1)}`);
  let lit = 0;
  for (let t = nightStart; t < nightEnd; t += 5_000) if (dayFactorAt(t) >= NIGHT_BELOW) lit++;
  check('and the world calls it night for every second of it', lit === 0, `${lit} samples with the light up`);
  check('nextAt says when the next one begins', nextAt('ghosttide', nightEnd) === atHour(MOON_DAYS, tide.fromH),
    `${nextAt('ghosttide', nightEnd)} against ${atHour(MOON_DAYS, tide.fromH)}`);
}

console.log('events: the Tithe Wagon keeps to the road');
{
  const route = kingsroadRoute(field);
  const chains = roadChainsIn(field, 'greenwold');
  check('the Greenwold has real roads in it', chains.length > 0, `${chains.length} chain(s), the longest ${Math.round(chains[0]?.total || 0)} m`);
  check('and the Kingsroad is the longest of them', route.onRoad && route.total === chains[0].total, `${Math.round(route.total)} m over ${route.pts.length} points`);

  // every metre of it, through the field's own road reading
  let offRoad = 0, worst = 1, steps = 0;
  for (let i = 0; i <= 300; i++) {
    const p = pointOn(route, i / 300);
    const s = field.sampleAt(p.x, p.z);
    steps++;
    worst = Math.min(worst, s.road);
    if (s.road <= 0) offRoad++;
  }
  check('the route is on road at every one of 301 samples', offRoad === 0, `worst road strength ${worst.toFixed(3)} over ${steps} samples`);

  // and the wagon, at the hours it actually rides
  const wagonDay = 0;
  let wagonOff = 0, wagonSamples = 0, wagonWorst = 1;
  const row = EVENT_BY_ID.tithewagon;
  for (let h = row.fromH; h < row.toH; h += 0.1) {
    const e = at('tithewagon', atHour(wagonDay, h), { field });
    if (!e) continue;
    wagonSamples++;
    const s = field.sampleAt(e.x, e.z);
    wagonWorst = Math.min(wagonWorst, s.road);
    if (s.road <= 0) wagonOff++;
  }
  check('so the wagon is on road for every hour of its window', wagonOff === 0 && wagonSamples > 90,
    `${wagonSamples} samples, worst road strength ${wagonWorst.toFixed(3)}`);
  const head = route.pts[0], tail = route.pts[route.pts.length - 1];
  const startsAt = at('tithewagon', atHour(0, row.fromH), { field });
  const endsAt = at('tithewagon', atHour(0, row.toH) - 1, { field });
  check('it starts at one end of the road and finishes at the other',
    Math.hypot(startsAt.x - head.x, startsAt.z - head.z) < 1
    && Math.hypot(endsAt.x - tail.x, endsAt.z - tail.z) < 5,
    `${Math.round(Math.hypot(startsAt.x - head.x, startsAt.z - head.z))} m and ${Math.round(Math.hypot(endsAt.x - tail.x, endsAt.z - tail.z))} m off the two ends`);
  const nextRun = at('tithewagon', atHour(3, row.fromH), { field });
  check('and the next run comes back the other way',
    Math.hypot(nextRun.x - tail.x, nextRun.z - tail.z) < 1,
    'the third day rides it from the far end');

  check('with no field at all it still runs, on the sheet\'s own line',
    !!at('tithewagon', atHour(0, 12)) && at('tithewagon', atHour(0, 12)).onRoad === false);
}

console.log('events: the Legion\'s march');
{
  check('six of the nine realms hold the Legion in two places or more',
    Object.keys(LEGION_HOLDS).length === 6, Object.keys(LEGION_HOLDS).join(', '));
  const ROAD_SNAP_M = 8;      // roads.js's own look radius, the most a hold moves
  const bad = [];
  for (const m of MARCH_EVENTS) {
    const route = marchRoute(m.realm, field);
    const holds = LEGION_HOLDS[m.realm];
    if (route.pts.length !== holds.length) bad.push(`${m.realm}: ${route.pts.length} points for ${holds.length} holds`);
    const a = at(m.id, atHour(0, m.fromH), { field });
    const b = at(m.id, atHour(0, m.toH) - 1, { field });
    if (Math.hypot(a.x - route.pts[0].x, a.z - route.pts[0].z) > ROAD_SNAP_M) bad.push(`${m.realm}: does not start at its first hold`);
    if (Math.hypot(b.x - route.pts[route.pts.length - 1].x, b.z - route.pts[route.pts.length - 1].z) > ROAD_SNAP_M) bad.push(`${m.realm}: does not finish at its last hold`);
  }
  check('every march starts at one hold and finishes at another', bad.length === 0, bad.slice(0, 3).join('; '));
  const n = new Set();
  for (let d = 0; d < 40; d++) for (const m of MARCH_EVENTS) n.add(marchStrength(m.realm, d));
  check('a column is six to ten soldiers, and not always the same number',
    [...n].every((v) => v >= 6 && v <= 10) && n.size >= 4, `strengths seen: ${[...n].sort().join(', ')}`);
  check('the same realm on the same day is the same column every time',
    marchStrength('greenwold', 5) === marchStrength('greenwold', 5));
}

console.log('events: the Brass City walks its circuit');
{
  const day0 = dayStartAt(0);
  let standing = 0, moving = 0, steps = 0;
  const stations = new Set();
  for (let t = day0; t < day0 + BRASS_CIRCUIT_DAYS * DAY_MS; t += 5_000) {
    const c = brassCityAt(t);
    steps++;
    if (c.moving) moving += 5_000; else { standing += 5_000; stations.add(c.station); }
  }
  const circuit = BRASS_CIRCUIT_DAYS * DAY_MS;
  check('it visits all four wells in one circuit', stations.size === 4, [...stations].join(', '));
  check('it stands for twenty three hours of every day',
    Math.abs(standing / BRASS_CIRCUIT_DAYS - 23 * HOUR_MS) <= 10_000,
    `${(standing / BRASS_CIRCUIT_DAYS / HOUR_MS).toFixed(2)} in-game hours a day standing`);
  check('and walks for exactly one',
    Math.abs(moving / BRASS_CIRCUIT_DAYS - BRASS_MOVE_H * HOUR_MS) <= 10_000,
    `${(moving / BRASS_CIRCUIT_DAYS / HOUR_MS).toFixed(2)} in-game hours a day moving, ${steps} samples`);
  check('the whole circuit is four in-game days', circuit === 4 * DAY_MS, `${(circuit / 60000).toFixed(0)} real minutes`);

  const standingNow = brassCityAt(atHour(0, 12));
  const walkingNow = brassCityAt(atHour(0, 23.5));
  check('at noon it is at a well and not between them', !standingNow.moving && !!standingNow.station, standingNow.station);
  check('and in the last hour of the day it is between them', walkingNow.moving && walkingNow.station === null, `${(walkingNow.k * 100).toFixed(0)}% of the way to ${walkingNow.next}`);
  const half = Math.hypot(walkingNow.x - BRASS_STATIONS[0].x, walkingNow.z - BRASS_STATIONS[0].z);
  check('halfway through the walk it is halfway between two wells',
    Math.abs(half - Math.hypot(BRASS_STATIONS[1].x - BRASS_STATIONS[0].x, BRASS_STATIONS[1].z - BRASS_STATIONS[0].z) / 2) < 1,
    `${Math.round(half)} m from the well it left`);
  check('every well stands inside the Ember Wastes',
    BRASS_STATIONS.every((s) => inZone(ZONE.emberwastes, s.x, s.z) >= 1),
    BRASS_STATIONS.map((s) => Math.round(Math.hypot(s.x - ZONE.emberwastes.x, s.z - ZONE.emberwastes.z))).join(' m, ') + ' m out');
}

console.log('events: the wandering bosses');
{
  const list = wanderers();
  check('the roster is built from the rows that carry the wanders tag', list.length === 2, list.map((w) => w.id).join(', '));
  const bad = [];
  for (const w of list) {
    const zn = ZONE[w.realm];
    let moves = 0, lastPlace = null, hours = 0;
    for (let t = dayStartAt(0); t < dayStartAt(2); t += HOUR_MS / 8) {
      const p = wanderPointAt(w.id, t);
      if (!p) { if (!w.noonOnly) bad.push(`${w.id} is nowhere at hour ${hourAt(t).toFixed(1)}`); continue; }
      hours++;
      if (inZone(zn, p.x, p.z) <= 0) bad.push(`${w.id} at ${p.place} is outside ${w.realm}`);
      if (ZONE[p.place].parent !== w.realm) bad.push(`${w.id}: ${p.place} belongs to ${ZONE[p.place].parent}`);
      if (lastPlace !== null && p.place !== lastPlace) moves++;
      lastPlace = p.place;
    }
    // two in-game days is 48 hours; a row that is always somewhere moves 47
    // times, and one that is only there at noon moves within its own window
    if (!w.noonOnly && moves !== 47) bad.push(`${w.id} moved ${moves} times in 48 in-game hours`);
    check(`${w.name} walks its route`, true, `${hours} samples, ${moves} moves, ${w.route.length} places`);
  }
  check('and neither of them ever leaves its realm or skips an hour', bad.length === 0, bad.slice(0, 3).join('; '));

  // the noon manticore, both directions
  const noonHours = [];
  for (let h = 0; h < 24; h += 0.25) noonHours.push([h, !!wanderPointAt('noon', atHour(0, h))]);
  const inNoon = noonHours.filter(([, on]) => on).map(([h]) => h);
  check('Noon exists only in the noon hours',
    inNoon.every((h) => h >= NOON_FROM_H && h < NOON_TO_H) && inNoon.length === (NOON_TO_H - NOON_FROM_H) * 4,
    `hours ${inNoon[0]} to ${inNoon[inNoon.length - 1]}`);
  check('and is nowhere at all for the other twenty two',
    noonHours.filter(([, on]) => !on).length === (24 - (NOON_TO_H - NOON_FROM_H)) * 4);
  check('isNoonHour agrees with the schedule, both ways',
    noonHours.every(([h, on]) => on === isNoonHour(atHour(0, h))));
  check('Rimemouth, which has no such tag, is somewhere every hour',
    [0, 4, 12, 20, 23].every((h) => !!wanderPointAt('rimemouth', atHour(0, h))));
  check('a wanderer moves one place an in-game hour and no faster',
    wanderPointAt('rimemouth', atHour(0, 6)).place === wanderPointAt('rimemouth', atHour(0, 6.9)).place
    && wanderPointAt('rimemouth', atHour(0, 6)).place !== wanderPointAt('rimemouth', atHour(0, 7.1)).place,
    `${WANDER_HOURS} hour a place`);
}

console.log('events: the audit refuses what the sheet does not say');
{
  const holds = LEGION_HOLDS.greenwold.slice();
  LEGION_HOLDS.greenwold = ['hearthhome', 'millrun'];
  let threw = '';
  try { auditEvents(); } catch (e) { threw = e.message; }
  LEGION_HOLDS.greenwold = holds;
  check('a hold the sheet does not connect to the Legion is refused', /does not name the Legion/.test(threw), threw.split('\n')[1] || threw);

  const gone = LEGION_HOLDS.frostreach;
  delete LEGION_HOLDS.frostreach;
  let threw2 = '';
  try { auditEvents(); } catch (e) { threw2 = e.message; }
  LEGION_HOLDS.frostreach = gone;
  check('and a realm the Legion holds with no march is refused too', /no march/.test(threw2), threw2.split('\n')[1] || threw2);
  check('with both put back, the audit passes again', !!auditEvents());
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
