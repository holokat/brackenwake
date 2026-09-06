// The events, running. Run: node src/game/events_runtime.test.mjs
//
// The schedule is proved in `src/mmo/events.test.mjs`. This suite drives the
// thing that meets the player, against a monster runtime that records rather
// than builds, so every claim is a count:
//
//   spawns     bodies at 600 m and none at 601, and none at all underground
//   words      each line said once however many frames it is in view for
//   the walk    the escort's `ai.home` moves with the wagon, which is how
//               `stepMonster`'s return case walks it
//   the ash    ten points off `bonuses.hit` while you stand in the Bone Wind
//              and exactly back when you leave, both directions
//   the sky    the daylight the events ask for, and what happens with no hook
//   the map    the marks, and a wandering boss on it only once found

import { createWorldField } from '../world/field.js';
import { recompute } from './actor.js';
import { attackSkill } from '../mmo/combat_rules.js';
import { at, atHour, dayStartAt, HOUR_MS, wanderPointAt, brassCityAt } from '../mmo/events.js';
import { createEvents, LOG_M, SPAWN_M, DISCOVER_M, SEE_M, WIND_HIT, BLOSSOM_YIELD } from './events_runtime.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

const field = createWorldField(20260904, { homeBiome: 'meadow', homeY: -0.3 });

/** A monster runtime that records instead of building. Every call is counted. */
function fakeMonsters() {
  const live = new Map();
  let n = 0;
  return {
    calls: [], despawned: [],
    spawnAt(id, x, z) {
      this.calls.push({ id, x, z });
      const key = `dev:${id}:${++n}`;
      const rec = {
        key, id, name: id,
        actor: {
          id: key, kind: 'monster', pos: { x, y: 0, z }, health: 100, maxHealth: 100,
          buffs: [], bonuses: {}, baseStats: {}, baseSkills: { wrestling: 50 }, equipment: {},
          skills: { wrestling: 50 }, stats: {},
          ai: { home: { x, z }, state: 'idle', target: null },
        },
      };
      live.set(key, rec);
      return rec;
    },
    all: () => [...live.values()],
    forActor(a) { for (const m of live.values()) if (m.actor === a) return m; return null; },
    despawn(key) { this.despawned.push(key); return live.delete(key); },
    get count() { return live.size; },
  };
}

function fakeHud() {
  return { logs: [], toasts: [], log(t) { this.logs.push(String(t)); }, toast(t) { this.toasts.push(String(t)); } };
}

function player() {
  const a = {
    id: 'you', kind: 'player', pos: { x: 0, y: 0, z: 0 },
    baseStats: { str: 40, dex: 40, int: 20, con: 40, wis: 20 },
    baseSkills: { swordsmanship: 60, tactics: 40 },
    equipment: {}, buffs: [], bonuses: {}, skills: {}, stats: {},
    health: 100, maxHealth: 100, mana: 0, maxMana: 0, stamina: 100, maxStamina: 100,
  };
  recompute(a);
  return a;
}

const world = (over = {}) => ({ field, heightAt: (x, z) => field.heightAt(x, z), inDungeon: false, ...over });
const build = (mon, hud, actor, over = {}, sky = null) =>
  createEvents(world(over), mon, hud, { offset: () => 0 }, { actor: () => actor, sky });

console.log('events_runtime: bodies land inside 600 m and nowhere else');
{
  const t = atHour(0, 12);
  const wagon = at('tithewagon', t, { field });
  check('the wagon is on the road at noon of a wagon day', !!wagon, wagon && `${Math.round(wagon.x)}, ${Math.round(wagon.z)}`);

  const far = fakeMonsters(), farHud = fakeHud();
  const evFar = build(far, farHud, player());
  evFar.update(0.05, t, { x: wagon.x + SPAWN_M + 1, z: wagon.z });
  check(`nothing is spawned at ${SPAWN_M + 1} m`, far.calls.length === 0, `${far.calls.length} spawnAt calls`);

  const near = fakeMonsters(), nearHud = fakeHud();
  const evNear = build(near, nearHud, player());
  evNear.update(0.05, t, { x: wagon.x + SPAWN_M - 1, z: wagon.z });
  check(`and five are spawned at ${SPAWN_M - 1} m`, near.calls.length === 5, near.calls.map((c) => c.id).join(', '));
  check('four soldiers and an archer, which is what the sheet says walks with it',
    near.calls.filter((c) => c.id === 'legionSoldier').length === 4 && near.calls.filter((c) => c.id === 'legionArcher').length === 1);
  check('every one of them within ten metres of the wagon',
    near.calls.every((c) => Math.hypot(c.x - wagon.x, c.z - wagon.z) <= 10),
    `furthest ${Math.max(...near.calls.map((c) => Math.hypot(c.x - wagon.x, c.z - wagon.z))).toFixed(1)} m`);

  // a hundred more frames at the same instant must not spawn a second escort
  for (let i = 0; i < 100; i++) evNear.update(0.016, t, { x: wagon.x + 20, z: wagon.z });
  check('a hundred more frames spawn nothing more', near.calls.length === 5, `${near.calls.length} spawnAt calls after 101 frames`);

  // underground, nothing happens at all
  const under = fakeMonsters(), underHud = fakeHud();
  const evUnder = build(under, underHud, player(), { inDungeon: true });
  evUnder.update(0.05, t, { x: wagon.x, z: wagon.z });
  check('and underground nothing is spawned and nothing is said',
    under.calls.length === 0 && underHud.logs.length === 0 && underHud.toasts.length === 0);
}

console.log('events_runtime: the words, once each');
{
  const t = atHour(0, 12);
  const wagon = at('tithewagon', t, { field });
  const mon = fakeMonsters(), hud = fakeHud();
  const ev = build(mon, hud, player());

  // stand just inside the log radius and just outside the wagon itself
  ev.update(0.05, t, { x: wagon.x + LOG_M - 5, z: wagon.z });
  const began = hud.logs.filter((l) => /The Tithe Wagon/.test(l) && /tax wagon/.test(l)).length;
  check(`an event beginning inside ${LOG_M} m says so in the log`, began === 1, `${began} line(s)`);
  check('and it is not a toast, because you are not in it yet', hud.toasts.length === 0);

  for (let i = 0; i < 60; i++) ev.update(0.016, t + i, { x: wagon.x + LOG_M - 5, z: wagon.z });
  const still = hud.logs.filter((l) => /tax wagon/.test(l)).length;
  check('sixty more frames do not say it again', still === 1, `${still} line(s) after 61 frames`);

  // walk into it
  ev.update(0.05, t, { x: wagon.x + 20, z: wagon.z });
  const walked = hud.toasts.filter((l) => /you are in/.test(l)).length;
  check('walking into it is a toast', walked === 1, hud.toasts[0]);
  for (let i = 0; i < 40; i++) ev.update(0.016, t, { x: wagon.x + 20, z: wagon.z });
  check('and forty more frames inside it do not toast again',
    hud.toasts.filter((l) => /you are in/.test(l)).length === 1);

  // and the wagon speaks, which is a nearer thing than walking into it
  const m2 = fakeMonsters(), h2 = fakeHud();
  const ev2 = build(m2, h2, player());
  for (let i = 0; i < 10; i++) ev2.update(0.016, t, { x: wagon.x + SEE_M + 10, z: wagon.z });
  check(`it has not spoken at ${SEE_M + 10} m`, h2.logs.filter((l) => /Off the road/.test(l)).length === 0,
    `${h2.logs.length} lines said so far`);
  for (let i = 0; i < 30; i++) ev2.update(0.016, t, { x: wagon.x + SEE_M - 5, z: wagon.z });
  const spoke = h2.logs.filter((l) => /Off the road/.test(l)).length;
  check('the wagon speaks when it sees you, once', spoke === 1, `${spoke} line(s) over 30 frames inside ${SEE_M} m`);
  check('and every line it says is free of em dashes',
    [...hud.logs, ...hud.toasts, ...h2.logs, ...h2.toasts].every((l) => !/—/.test(l)));
}

console.log('events_runtime: the escort walks with the wagon');
{
  const row = { fromH: 8, toH: 14 };
  const t0 = atHour(0, row.fromH + 0.5);
  const mon = fakeMonsters(), hud = fakeHud();
  const ev = build(mon, hud, player());
  const a0 = at('tithewagon', t0, { field });
  ev.update(0.05, t0, { x: a0.x, z: a0.z });
  check('the escort is standing', mon.count === 5, `${mon.count} bodies`);
  const escort = mon.all().map((m) => m.key);
  const home0 = mon.all().map((m) => ({ ...m.actor.ai.home }));

  const t1 = atHour(0, row.toH);
  const a1 = at('tithewagon', t1, { field });
  ev.update(0.05, t1, { x: a1.x, z: a1.z });
  const home1 = mon.all().map((m) => ({ ...m.actor.ai.home }));
  const moved = home0.map((h, i) => Math.hypot(home1[i].x - h.x, home1[i].z - h.z));
  check('every one of their homes moved with the wagon',
    moved.every((d) => d > 100), `homes moved ${Math.round(Math.min(...moved))} to ${Math.round(Math.max(...moved))} m`);
  check('and the wagon itself moved that far',
    Math.abs(Math.hypot(a1.x - a0.x, a1.z - a0.z) - moved[0]) < 12,
    `${Math.round(Math.hypot(a1.x - a0.x, a1.z - a0.z))} m along the road`);
  check('they are put in the state stepMonster walks home in',
    mon.all().every((m) => m.actor.ai.state === 'return'), mon.all()[0].actor.ai.state);

  // one that is fighting keeps its fight
  mon.all()[0].actor.ai.target = { pos: { x: 0, z: 0 }, health: 50 };
  mon.all()[0].actor.ai.state = 'chase';
  ev.update(0.05, t1 + 1000, { x: a1.x, z: a1.z });
  check('but one that has found a fight is not marched back into line',
    mon.all()[0].actor.ai.state === 'chase');

  // the window closes and the bodies go
  ev.update(0.05, atHour(0, 18), { x: a1.x, z: a1.z });
  // THE ESCORT'S OWN FIVE, by key, and not "five bodies were despawned". The
  // player stands on the wagon for the whole of this block, and whatever else
  // the clock has running near the Kingsroad at hour 14 spawns there too: the
  // corrected hash of 2026-09-06 moved the roads and a Legion march came within
  // range, so sixteen bodies came and went and the count said the wrong thing
  // about the right outcome.
  const gone = escort.filter((k) => mon.despawned.includes(k));
  check('when the window shuts the escort is taken away',
    gone.length === escort.length && mon.count === 0,
    `${gone.length} of the wagon's ${escort.length}, and ${mon.despawned.length - gone.length} other bodies `
    + 'that came and went with the rest of the day\'s events');
  check('and the log says the event is over', hud.logs.some((l) => /is over/.test(l)), hud.logs[hud.logs.length - 1]);
}

console.log('events_runtime: the Bone Wind takes ten points off, both directions');
{
  const t = atHour(0, 15.5);
  const wind = at('bonewind', t, { field });
  check('the Bone Wind is up over the Boneyard at half past three', !!wind, wind && `r ${wind.r} m, ${Math.round(wind.phase * 100)}% across`);
  const mon = fakeMonsters(), hud = fakeHud();
  const you = player();
  const before = attackSkill(you);
  const ev = build(mon, hud, you);

  ev.update(0.05, t, { x: wind.x + wind.r + 50, z: wind.z });
  check('standing outside the dust costs nothing',
    attackSkill(you) === before && !you.bonuses.hit, `${attackSkill(you)} against ${before}`);

  ev.update(0.05, t, { x: wind.x, z: wind.z });
  const inside = attackSkill(you);
  check(`standing in it is ${-WIND_HIT} points off what you swing at`,
    inside === before + WIND_HIT, `${inside} against ${before}`);
  check('and it is said out loud, once', hud.logs.filter((l) => /Ten points off/.test(l)).length === 1);
  for (let i = 0; i < 30; i++) ev.update(0.016, t, { x: wind.x, z: wind.z });
  check('thirty more frames neither stack it nor say it again',
    attackSkill(you) === before + WIND_HIT && hud.logs.filter((l) => /Ten points off/.test(l)).length === 1,
    `${you.buffs.length} buff(s) on the actor`);

  ev.update(0.05, t, { x: wind.x + wind.r + 50, z: wind.z });
  check('walking out gives it back exactly', attackSkill(you) === before, `${attackSkill(you)} against ${before}`);
  check('and says so', hud.logs.filter((l) => /ash thins out/.test(l)).length === 1);

  // the monsters standing in it lose the same ten points
  const m2 = fakeMonsters(), h2 = fakeHud(), you2 = player();
  const ev2 = build(m2, h2, you2);
  ev2.update(0.05, t, { x: wind.x, z: wind.z });
  const bodies = m2.all().map((m) => m.actor);
  check('the ash does not care who is standing in it', bodies.length > 0 && bodies.every((a) => a.bonuses.hit === WIND_HIT),
    `${bodies.length} bodies, hit bonus ${bodies.map((a) => a.bonuses.hit).join(', ')}`);
  ev2.update(0.05, atHour(0, 17), { x: wind.x, z: wind.z });
  check('and gives it back to them too when it passes', bodies.every((a) => !a.bonuses.hit));
}

console.log('events_runtime: the sky, the blossom, and the walking city');
{
  const t = atHour(0, 15.5);
  const wind = at('bonewind', t, { field });
  const sky = { asked: [], setDayScale(v) { this.asked.push(v); } };
  const mon = fakeMonsters(), hud = fakeHud(), you = player();
  const ev = createEvents(world(), mon, hud, 0, { actor: () => you, sky });
  ev.update(0.05, t, { x: wind.x, z: wind.z });
  check('the dust darkens the sky through the hook scene.js needs',
    ev.dayScale() < 1 && sky.asked[sky.asked.length - 1] === ev.dayScale(), `dayScale ${ev.dayScale()}`);
  ev.update(0.05, t, { x: wind.x + 2000, z: wind.z });
  check('and gives the daylight back on the way out', ev.dayScale() === 1, `dayScale ${ev.dayScale()}`);

  // the Long Night holds the dark over Frostreach and nowhere else
  const night = at('longnight', atHour(2, 23), { field });
  check('the Long Night falls on the seventh day', !!night, night && `${night.realm}, r ${Math.round(night.r)} m`);
  ev.update(0.05, atHour(2, 23), { x: night.x, z: night.z });
  check('standing in Frostreach on that night the sun does not come up', ev.dayScale() === 0, `dayScale ${ev.dayScale()}`);
  ev.update(0.05, atHour(2, 23), { x: 0, z: 0 });
  check('and standing at home it is an ordinary night', ev.dayScale() === 1);

  // the blossom
  const fall = at('blossomfall', atHour(1, 5.5), { field });
  check('the Blossom Fall falls at dawn every fourth day', !!fall, fall && `${fall.realm} at hour 5.5`);
  const m3 = fakeMonsters(), h3 = fakeHud(), you3 = player();
  const ev3 = build(m3, h3, you3);
  ev3.update(0.05, atHour(1, 5.5), { x: fall.x, z: fall.z });
  check('standing in it doubles what the ground gives',
    you3.bonuses.harvestYield === BLOSSOM_YIELD, `harvestYield ${you3.bonuses.harvestYield}`);
  check('and says so, once', h3.logs.filter((l) => /comes up double/.test(l)).length === 1);
  ev3.update(0.05, atHour(1, 8), { x: fall.x, z: fall.z });
  check('when it is over the ground gives what it gives', !you3.bonuses.harvestYield,
    `harvestYield ${you3.bonuses.harvestYield || 0}`);

  // the Brass City, which is a position and not a spawn
  const city = ev.brassCity(atHour(0, 12));
  check('the walking city is where the schedule says it is',
    city.x === brassCityAt(atHour(0, 12)).x && !!city.station, city.station);
}

console.log('events_runtime: the wandering bosses, and the map');
{
  const t = atHour(0, 6);
  const p = wanderPointAt('rimemouth', t);
  check('Rimemouth is standing somewhere at six in the morning', !!p, p && p.placeName);

  const far = fakeMonsters(), farHud = fakeHud();
  const evFar = build(far, farHud, player());
  evFar.update(0.05, t, { x: p.x + SPAWN_M + 1, z: p.z });
  check(`no body at ${SPAWN_M + 1} m`, far.calls.length === 0);
  check('and it is not on the map, because it has not been found', evFar.marks().every((m) => m.kind !== 'boss'));

  const mon = fakeMonsters(), hud = fakeHud();
  const ev = build(mon, hud, player());
  ev.update(0.05, t, { x: p.x + DISCOVER_M + 10, z: p.z });
  check(`at ${DISCOVER_M + 10} m it is a body but not yet found`,
    mon.calls.length === 1 && ev.found().length === 0, `${mon.calls.length} spawn, found ${ev.found().join(',')}`);
  ev.update(0.05, t, { x: p.x + DISCOVER_M - 10, z: p.z });
  check(`inside ${DISCOVER_M} m it is found, and said once`,
    ev.found().includes('rimemouth') && hud.logs.filter((l) => /walks a round/.test(l)).length === 1);
  for (let i = 0; i < 20; i++) ev.update(0.016, t, { x: p.x, z: p.z });
  check('twenty more frames do not find it again',
    hud.logs.filter((l) => /walks a round/.test(l)).length === 1 && mon.calls.length === 1,
    `${mon.calls.length} spawnAt calls`);

  const mark = ev.marks(t).find((m) => m.kind === 'boss');
  check('and now it is on the map, by name, where it stands',
    !!mark && mark.name === 'Rimemouth' && mark.x === p.x && mark.z === p.z, mark && `${mark.name} at ${Math.round(mark.x)}, ${Math.round(mark.z)}`);

  // an hour later it has walked on, and the body's home walks with it
  const body = mon.all()[0];
  const t2 = t + HOUR_MS;
  const p2 = wanderPointAt('rimemouth', t2);
  check('an hour on, it is at the next place on its route', p2.place !== p.place, `${p.place} to ${p2.place}`);
  ev.update(0.05, t2, { x: p2.x, z: p2.z });
  check('and the body is sent after it rather than teleported',
    body.actor.ai.home.x === p2.x && body.actor.ai.home.z === p2.z && body.actor.ai.state === 'return',
    `home now ${Math.round(body.actor.ai.home.x)}, ${Math.round(body.actor.ai.home.z)}`);

  // Noon exists only at noon, so the body goes when the hour passes
  const noonT = atHour(0, 12);
  const np = wanderPointAt('noon', noonT);
  const m2 = fakeMonsters(), h2 = fakeHud();
  const ev2 = build(m2, h2, player());
  ev2.update(0.05, noonT, { x: np.x, z: np.z });
  check('Noon stands on his rock at midday', m2.calls.some((c) => c.id === 'noon'), m2.calls.map((c) => c.id).join(', '));
  ev2.update(0.05, atHour(0, 14), { x: np.x, z: np.z });
  check('and is gone by two, body and all',
    m2.despawned.length >= 1 && !wanderPointAt('noon', atHour(0, 14)), `${m2.despawned.length} despawned`);

  // the marks the map draws are the live schedule
  const marks = ev.marks(t);
  const live = at('bonewind', t, { field });
  check('every live event is a mark', marks.filter((m) => m.kind === 'event').length > 0 && !live,
    `${marks.length} marks at six in the morning`);
  check('and every mark has a name and a place', marks.every((m) => m.name && Number.isFinite(m.x) && Number.isFinite(m.z)));
}

console.log('events_runtime: nothing is left behind');
{
  const t = atHour(0, 12);
  const wagon = at('tithewagon', t, { field });
  const mon = fakeMonsters(), hud = fakeHud(), you = player();
  const before = attackSkill(you);
  const ev = build(mon, hud, you);
  const wind = at('bonewind', atHour(0, 15.5), { field });
  ev.update(0.05, atHour(0, 15.5), { x: wind.x, z: wind.z });
  const inAsh = attackSkill(you);
  check('the ash has him while he stands in it', inAsh === before + WIND_HIT, `${inAsh} against ${before}`);
  // and the clock goes BACKWARDS, which is what the dev bench's slider does
  ev.update(0.05, t, { x: wagon.x, z: wagon.z });
  check('winding the clock back ends what was running', mon.count === 5 && mon.despawned.length === 4,
    `${mon.count} standing, ${mon.despawned.length} taken away`);
  const standing = mon.count;
  ev.dispose();
  check('dispose takes every body away', mon.count === 0 && mon.despawned.length === ev.stats.spawned,
    `${mon.despawned.length} despawned of ${ev.stats.spawned} spawned, ${standing} still standing before it`);
  check('and gives the player back every point it borrowed', attackSkill(you) === before, `${attackSkill(you)} against ${before}`);
  check('and hands the sky back', ev.dayScale() === 1);
  check('the counters counted what happened', ev.stats.spawned === 9 && ev.stats.logged >= 1,
    JSON.stringify(ev.stats));
  void dayStartAt;
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
