// The events, running. `src/mmo/events.js` says what is where and when; this
// file is the part a player meets: bodies in the world, words in the log, the
// hit they take standing in the ash, and the marks the map draws.
//
// docs/mmo/wiring/E2.md is the note. The rules it keeps:
//
//   THE SCHEDULE IS THE TRUTH. Nothing here decides when anything happens. It
//   asks `scheduleAt(t)` and reacts, so what a test proves about the schedule
//   is what the game does, and setting the dev bench's clock to 15:00 puts the
//   Bone Wind up over the Boneyard because the bench moves the same number.
//
//   EVERY STATE CHANGE OWES THE PLAYER WORDS. An event beginning within
//   `LOG_M` says so in the log. One you walk into says so in a toast. The
//   wagon speaks when it sees you. The hit penalty in the ash is said when it
//   lands and said again when it lifts, because a silent ten points off is
//   indistinguishable from bad luck.
//
//   ONCE, NOT EVERY FRAME. Every line and every spawn is keyed by the
//   OCCURRENCE (`key` is `<event>@<day>`), so the same wagon on the same day
//   greets you once however many frames it is in view for.
//
//   THE BODIES ARE THE MONSTER RUNTIME'S. Nothing here builds a monster. It
//   calls `monsters.spawnAt(id, x, z)` and then walks what came back by moving
//   `actor.ai.home` and putting the thing in its `return` state, which is the
//   state `stepMonster` already walks home in. There is no second AI.

import {
  scheduleAt, at as eventAt, brassCityAt, wanderers, wanderPointAt,
  EVENT_BY_ID, HOUR_MS,
} from '../mmo/events.js';
import { recompute } from './actor.js';

/** An event that begins nearer than this is worth a line in the log. */
export const LOG_M = 400;
/** Bodies are put in the world when the player is this near the event's middle. */
export const SPAWN_M = 600;
/** A wandering boss found once inside this is on the map from then on. */
export const DISCOVER_M = 200;
/** The wagon's escort can see this far, and the sergeant says so. */
export const SEE_M = 45;
/** The schedule is worked out this often. It is pure and cheap; this is manners. */
export const SCHEDULE_MS = 250;
/** How much daylight is left inside the Bone Wind's dust. */
export const WIND_DAY = 0.35;
/** Hit chance lost by everything standing in the ash, on the 0 to 100 scale. */
export const WIND_HIT = -10;
/** What the Blossom Fall does to what the ground gives: one whole extra share. */
export const BLOSSOM_YIELD = 1;

const num = (v) => (Number.isFinite(v) ? v : 0);
const dist = (a, b) => Math.hypot(num(a.x) - num(b.x), num(a.z) - num(b.z));

/** Said once per process, not once per frame, when a wire is missing. */
const warned = new Set();
function warnOnce(key, text) {
  if (warned.has(key)) return;
  warned.add(key);
  console.warn(text);
}

/**
 * @param runtime  createWorldRuntime: `field`, `heightAt`, `inDungeon`
 * @param monsters createMonsters: `spawnAt(id, x, z)`, `all()`, `forActor`,
 *                 and `despawn(key)` when Fable has wired it (see E2.md)
 * @param hud      `log(text, kind)` and `toast(text, kind)`
 * @param clock    the dev bench's hold on the day: `{ offset() }` or a number.
 *                 The bench shifts the sky with `sc.setClockOffset(ms)`, so the
 *                 events read the same offset and the wagon is on the road at
 *                 the hour the slider says it is.
 * @param opts     { actor, sky, rng }: the player's actor for the buffs the
 *                 events hang on it, and the scene for the sky hooks.
 */
export function createEvents(runtime, monsters, hud, clock, opts = {}) {
  const field = runtime?.field || null;
  const actorOf = typeof opts.actor === 'function' ? opts.actor : () => opts.actor || null;
  const sky = opts.sky || null;
  const offsetOf = () => {
    if (typeof clock === 'number') return clock;
    if (typeof clock === 'function') return num(clock());
    if (clock && typeof clock.offset === 'function') return num(clock.offset());
    return num(clock?.offset);
  };

  // one record per live occurrence, keyed by `<event>@<day>`
  const live = new Map();
  // one record per wandering boss that is standing somewhere
  const roaming = new Map();
  /** Wandering bosses the player has been within DISCOVER_M of, ever. */
  const found = new Set(Array.isArray(opts.found) ? opts.found : []);

  const stats = { logged: 0, toasted: 0, spawned: 0, despawned: 0, spoke: 0, penalties: 0 };
  let listed = [];
  let listedAt = -1e9;
  let nowT = 0;
  let daySet = null;          // what this file last told the sky to do
  let windOn = false;
  let blossomOn = false;
  const buffed = new Set();   // actors carrying the ash penalty right now

  const say = (text, kind) => { if (text) hud?.log?.(text, kind); return text; };
  const shout = (text, kind) => { if (text) hud?.toast?.(text, kind); return text; };

  // ------------------------------------------------------------------ bodies

  function despawn(key) {
    if (typeof monsters?.despawn === 'function') { monsters.despawn(key); stats.despawned++; return true; }
    warnOnce('despawn', 'events: monsters.despawn(key) is not wired, so an event\'s escort stays where it fell out of the event. See docs/mmo/wiring/E2.md.');
    return false;
  }

  /** Put an event's own bodies in a ring about its middle and remember them. */
  function spawnFor(rec, entry) {
    const out = [];
    let i = 0;
    const total = (entry.spawns || []).reduce((a, s) => a + s[1], 0) || 1;
    for (const [id, n] of entry.spawns || []) {
      for (let k = 0; k < n; k++, i++) {
        const a = (i / total) * Math.PI * 2;
        const r = 4 + (i % 3) * 2.5;
        const mon = monsters?.spawnAt?.(id, entry.x + Math.cos(a) * r, entry.z + Math.sin(a) * r);
        if (!mon) continue;
        stats.spawned++;
        out.push(mon);
      }
    }
    rec.bodies = out;
    return out;
  }

  /**
   * Walk what an event brought with it.
   *
   * `stepMonster`'s `return` case walks a monster to `ai.home` and does nothing
   * else, so moving the home along the route IS the column marching. A body
   * that has found something to fight keeps its target: an escort you pulled
   * off the wagon does not teleport back into formation.
   */
  function walk(rec, entry) {
    let i = 0;
    const total = rec.bodies.length || 1;
    for (const mon of rec.bodies) {
      const a = (i / total) * Math.PI * 2;
      const r = 4 + (i % 3) * 2.5;
      i++;
      const ai = mon?.actor?.ai;
      if (!ai || num(mon.actor.health) <= 0) continue;
      ai.home = { x: entry.x + Math.cos(a) * r, z: entry.z + Math.sin(a) * r };
      if (!ai.target && ai.state !== 'flee') ai.state = 'return';
    }
  }

  // ------------------------------------------------------------------ effects

  /** The ash takes ten points off everything standing in it, and says so. */
  function penalise(actor, on) {
    if (!actor) return false;
    const has = buffed.has(actor);
    if (on === has) return false;
    actor.buffs = Array.isArray(actor.buffs) ? actor.buffs : [];
    const at = actor.buffs.findIndex((b) => b && b.abilityId === 'event:bonewind');
    if (at >= 0) actor.buffs.splice(at, 1);
    if (on) actor.buffs.push({ abilityId: 'event:bonewind', kind: 'event', effect: { bonuses: { hit: WIND_HIT } } });
    recompute(actor);
    if (on) { buffed.add(actor); stats.penalties++; } else buffed.delete(actor);
    return true;
  }

  /** One share more of everything the ground gives, while the blossom falls. */
  function blossom(actor, on) {
    if (!actor) return false;
    actor.buffs = Array.isArray(actor.buffs) ? actor.buffs : [];
    const at = actor.buffs.findIndex((b) => b && b.abilityId === 'event:blossomfall');
    if ((at >= 0) === !!on) return false;
    if (at >= 0) actor.buffs.splice(at, 1);
    if (on) actor.buffs.push({ abilityId: 'event:blossomfall', kind: 'event', effect: { bonuses: { harvestYield: BLOSSOM_YIELD } } });
    recompute(actor);
    return true;
  }

  /**
   * What the events are doing to the daylight.
   *
   * `scene.js` needs `setDayScale(v)` for this to reach the sky and the lights
   * (E2.md quotes the four lines). Until it does, the number is still worked
   * out and still readable through `dayScale()`, and nothing else pretends.
   */
  function setDay(scale) {
    const v = scale == null ? 1 : scale;
    if (daySet === v) return false;
    daySet = v;
    if (typeof sky?.setDayScale === 'function') sky.setDayScale(v);
    else if (v !== 1) warnOnce('dayscale', 'events: scene.js has no setDayScale(v), so the Bone Wind and the Long Night do not darken the sky. See docs/mmo/wiring/E2.md.');
    return true;
  }

  // ------------------------------------------------------------------- update

  function update(dt, worldNow, playerPos) {
    const t = num(worldNow) + offsetOf();
    nowT = t;
    const pos = playerPos || { x: 0, z: 0 };
    // absolute, not signed: the dev bench's clock can move the world backwards
    // by most of a day, and a signed test would hold a stale list for ever
    if (Math.abs(t - listedAt) >= SCHEDULE_MS || !listed.length) {
      listed = scheduleAt(t, { field });
      listedAt = t;
    }
    const seen = new Set();
    const inDungeon = !!runtime?.inDungeon;

    let wantDay = 1;
    let inWind = false;
    let inBlossom = false;

    for (const entry of listed) {
      seen.add(entry.key);
      let rec = live.get(entry.key);
      const d = dist(pos, entry);
      if (!rec) {
        rec = { key: entry.key, id: entry.id, bodies: [], said: false, walkedIn: false, spoke: false };
        live.set(entry.key, rec);
        // it has begun, and it is near enough that a player could see it begin
        if (d <= LOG_M && !inDungeon) {
          stats.logged++;
          say(`${entry.name}. ${entry.line}`, 'good');
          rec.said = true;
        }
      }
      // walked into it: inside the middle, which is what `r` means
      if (!rec.walkedIn && d <= entry.r && !inDungeon) {
        rec.walkedIn = true;
        stats.toasted++;
        shout(`you are in ${entry.name}, ${entry.article}`, entry.kind === 'blossom' ? 'good' : undefined);
        if (!rec.said) { rec.said = true; say(entry.line); }
      }

      if (!inDungeon && d <= SPAWN_M && !rec.bodies.length && (entry.spawns || []).length) {
        spawnFor(rec, entry);
        if (rec.bodies.length) {
          say(`${entry.name}: ${rec.bodies.length} of them, and they have not seen you yet.`);
        }
      }
      if (rec.bodies.length) walk(rec, entry);

      // the wagon speaks. Not the whole escort: the sergeant on the box.
      if (entry.kind === 'wagon' && !rec.spoke && d <= SEE_M && !inDungeon) {
        rec.spoke = true;
        stats.spoke++;
        say('The wagon\'s driver stands up on the box. "Off the road. This is the Wyrmking\'s tithe and you are standing in it."', 'bad');
      }

      if (entry.kind === 'wind' && d <= entry.r) { inWind = true; wantDay = Math.min(wantDay, WIND_DAY); }
      if (entry.kind === 'longnight' && d <= entry.r) wantDay = 0;
      if (entry.kind === 'blossom' && d <= entry.r) inBlossom = true;
    }

    // what has finished: the bodies go, the words say so, the buffs lift
    for (const [key, rec] of [...live]) {
      if (seen.has(key)) continue;
      live.delete(key);
      const row = EVENT_BY_ID[rec.id];
      // whatever it lent them goes back before they go, so a body that is
      // somehow still referenced is not carrying an event's penalty for ever
      for (const mon of rec.bodies) {
        if (mon?.actor) penalise(mon.actor, false);
        if (mon?.key) despawn(mon.key);
      }
      if (rec.said || rec.walkedIn) say(`${row ? row.name : rec.id} is over.`);
    }

    // the ash, on the player and on everything else standing in it
    const you = actorOf();
    if (windOn !== inWind) {
      windOn = inWind;
      say(inWind
        ? 'The ash closes over you. Ten points off everything you swing at until it passes.'
        : 'The ash thins out and you can see what you are hitting again.', inWind ? 'bad' : 'good');
    }
    if (you) penalise(you, inWind);
    // the ash does not care who you are: everything standing in it swings worse
    const winds = listed.filter((e) => e.kind === 'wind');
    if (typeof monsters?.all === 'function' && (winds.length || buffed.size)) {
      for (const mon of monsters.all()) {
        const a = mon?.actor;
        if (!a || !a.pos) continue;
        const near = winds.some((e) => dist(a.pos, e) <= e.r);
        if (near !== buffed.has(a)) penalise(a, near);
      }
    }
    if (blossomOn !== inBlossom) {
      blossomOn = inBlossom;
      say(inBlossom
        ? 'Petals to the knee. Anything you pick while this lasts comes up double.'
        : 'The last of the blossom is down and the ground gives what it usually gives.', inBlossom ? 'good' : undefined);
      if (you) blossom(you, inBlossom);
    } else if (you && inBlossom) blossom(you, true);

    setDay(wantDay);

    // ------------------------------------------------------------ wanderers
    for (const w of wanderers()) {
      const point = wanderPointAt(w.id, t);
      const rec = roaming.get(w.id);
      if (!point) {
        if (rec) {
          roaming.delete(w.id);
          if (rec.body?.key) despawn(rec.body.key);
          if (rec.seen) say(`${w.name} is gone from the ${rec.placeName}.`);
        }
        continue;
      }
      const d = dist(pos, point);
      if (d <= DISCOVER_M && !found.has(w.id)) {
        found.add(w.id);
        say(`${w.name} walks a round of this country, and the map has it now.`, 'good');
      }
      if (!rec) {
        roaming.set(w.id, { body: null, index: point.index, placeName: point.placeName, seen: false });
      }
      const r2 = roaming.get(w.id);
      r2.placeName = point.placeName;
      if (!inDungeon && d <= SPAWN_M && !r2.body) {
        r2.body = monsters?.spawnAt?.(w.id, point.x, point.z) || null;
        if (r2.body) {
          stats.spawned++;
          r2.seen = true;
          say(`${w.name} is standing at ${point.placeName}.`, 'bad');
        }
      }
      // the route is walked by the thing itself: the hour moves its home and
      // `stepMonster`'s return case does the walking
      if (r2.body?.actor?.ai && num(r2.body.actor.health) > 0) {
        const ai = r2.body.actor.ai;
        if (r2.index !== point.index) {
          r2.index = point.index;
          ai.home = { x: point.x, z: point.z };
          if (!ai.target && ai.state !== 'flee') ai.state = 'return';
        } else if (!ai.home) ai.home = { x: point.x, z: point.z };
      }
      // out of range: it goes back to being a schedule row rather than a body
      if (r2.body && d > SPAWN_M * 1.5) {
        if (r2.body.key) despawn(r2.body.key);
        r2.body = null;
      }
    }
    void dt;
    return listed;
  }

  // ------------------------------------------------------------------- reads

  /** Every event live at the instant `update` last ran. */
  const active = () => listed.slice();

  /**
   * What the map draws: every live event, and every wandering boss the player
   * has found, where it is standing now. A boss nobody has met is not on it.
   */
  function marks(t = nowT) {
    const out = listed.map((e) => ({
      kind: 'event', id: e.id, key: e.key, name: e.name, x: e.x, z: e.z, r: e.r,
      realm: e.realm, event: e.kind,
    }));
    for (const w of wanderers()) {
      if (!found.has(w.id)) continue;
      const p = wanderPointAt(w.id, t);
      if (!p) continue;
      out.push({
        kind: 'boss', id: w.id, key: `boss:${w.id}`, name: w.name,
        x: p.x, z: p.z, r: 0, realm: w.realm, place: p.placeName,
      });
    }
    return out;
  }

  function dispose() {
    for (const rec of live.values()) for (const mon of rec.bodies) if (mon?.key) despawn(mon.key);
    for (const rec of roaming.values()) if (rec.body?.key) despawn(rec.body.key);
    for (const a of [...buffed]) penalise(a, false);
    const you = actorOf();
    if (you) blossom(you, false);
    setDay(1);
    live.clear();
    roaming.clear();
  }

  return {
    update, active, marks, dispose, stats,
    /** One event at one instant, the pure call, with this world's field. */
    at: (id, t) => eventAt(id, t, { field }),
    /** Where the walking city is. V1 reads this for the body's position. */
    brassCity: (t = nowT) => brassCityAt(t),
    /** Wandering bosses the player has met. Persist this: see E2.md. */
    found: () => [...found],
    /** What the events want the daylight to be, whether or not the sky reads it. */
    dayScale: () => (daySet == null ? 1 : daySet),
    /** The hour of the in-game day the events are running on. */
    now: () => nowT,
    get hourMs() { return HOUR_MS; },
  };
}
