// Places worth finding, regions worth naming, and the memory of both.
//
// The roll for where a site is lives in sitegrid.js; whether the ground allows
// it is field.siteInCell (the terrain is flattened under every site it allows,
// so a town always stands on level ground and a cave always sits in a mound).
// The regions live in zones.js. This module only asks those two and remembers
// what has been found, in localStorage.
//
// TWO KINDS OF DISCOVERY, AND THEY ARE NOT THE SAME EVENT.
//
//   a site   you walked within DISCOVER_RADIUS of a thing you can point at: a
//            town, a mine, a dungeon mouth. `check()` returns it once.
//   a zone   you walked into a named region and are at least ZONE_ENTER_W into
//            it. `checkZone()` returns it once. Firing on the outermost fringe
//            would announce The Frostcrown from a mile of meadow, so half in is
//            the rule, and half in is also where the zone's own bias reaches
//            half strength, which is the first place the country looks changed.
//
// Both are throttled to CHECK_MS, both fire once and never again, and both are
// saved. The two lists are separate keys, so a save from before zones existed
// keeps every site it had found.

import { SITE_CELL } from './sitegrid.js';
import { zoneAt, ZONE } from './zones.js';

export { SITE_CELL };
export const DISCOVER_RADIUS = 70;
/** How much of a zone you have to be inside before it counts as entered. */
export const ZONE_ENTER_W = 0.5;
/** Neither check runs more often than this. */
export const CHECK_MS = 400;
const STORE = 'brackenwake-discovered';
const ZONE_STORE = 'brackenwake-zones';

/** Every site within `radius` world units of (x, z). */
export function sitesNear(field, x, z, radius) {
  const out = [];
  const c0 = Math.floor((x - radius) / SITE_CELL), c1 = Math.floor((x + radius) / SITE_CELL);
  const d0 = Math.floor((z - radius) / SITE_CELL), d1 = Math.floor((z + radius) / SITE_CELL);
  for (let cz = d0; cz <= d1; cz++) for (let cx = c0; cx <= c1; cx++) {
    const s = field.siteInCell(cx, cz);
    if (s && Math.hypot(s.x - x, s.z - z) <= radius) out.push(s);
  }
  return out;
}

/**
 * Every mine mouth within `radius` of (x, z), flattened out of the mines near
 * it. A mouth is a cave shaped site the runtime can hand straight to
 * enterDungeon; it does not own a cell, so nothing else will find one.
 */
export function mouthsNear(field, x, z, radius) {
  const out = [];
  for (const s of sitesNear(field, x, z, radius + 40)) {
    if (!s.mouths) continue;
    for (const m of s.mouths) if (Math.hypot(m.x - x, m.z - z) <= radius) out.push(m);
  }
  return out;
}

export function createDiscovery(field, opts = {}) {
  const storeKey = opts.storeKey || STORE;
  const zoneKey = opts.zoneKey || ZONE_STORE;
  const load = (key) => {
    try { return new Set(JSON.parse(localStorage.getItem(key) || '[]')); } catch { return new Set(); }
  };
  let found = load(storeKey);
  let zones = load(zoneKey);
  // Once a character has been adopted, the character's own document is the
  // store and the two browser-wide keys are left alone: with more than one
  // character in the roster (S1), a shared key meant the second one booted
  // having found everything the first had.
  let persist = true;
  const save = (key, set) => {
    if (!persist) return;
    try { localStorage.setItem(key, JSON.stringify([...set])); } catch { /* private window */ }
  };
  let lastCheck = -1e9, lastZone = -1e9;

  return {
    /** Call often; it only looks every CHECK_MS. Returns a newly found site or null. */
    check(x, z, nowMs) {
      if (nowMs - lastCheck < CHECK_MS) return null;
      lastCheck = nowMs;
      for (const s of sitesNear(field, x, z, DISCOVER_RADIUS)) {
        if (found.has(s.id)) continue;
        found.add(s.id); save(storeKey, found);
        return s;
      }
      return null;
    },

    /**
     * Call often; it only looks every CHECK_MS. Returns the zone you have just
     * walked into, ONCE, and null every other time, including every later visit
     * to the same zone.
     */
    checkZone(x, z, nowMs) {
      if (nowMs - lastZone < CHECK_MS) return null;
      lastZone = nowMs;
      const hit = zoneAt(x, z);
      if (!hit || hit.weight < ZONE_ENTER_W) return null;
      if (zones.has(hit.zone.id)) return null;
      zones.add(hit.zone.id); save(zoneKey, zones);
      return hit.zone;
    },

    /** The zone you are in right now, half in or better, or null. For the HUD. */
    zoneNow(x, z) {
      const hit = zoneAt(x, z);
      return hit && hit.weight >= ZONE_ENTER_W ? hit.zone : null;
    },

    has: (id) => found.has(id),
    hasZone: (id) => zones.has(id),
    get count() { return found.size; },
    /**
     * Take a character's own record as the truth: the sets become what the
     * document says, and nothing is written to the browser-wide keys again.
     * The world system pushes every new find into the same arrays, so the save
     * and this stay one list.
     */
    adopt(foundIds = [], zoneIds = []) {
      found = new Set((foundIds || []).filter((d) => typeof d === 'string'));
      zones = new Set((zoneIds || []).filter((d) => typeof d === 'string'));
      persist = false;
      lastCheck = -1e9; lastZone = -1e9;
    },
    get persists() { return persist; },
    get zoneCount() { return zones.size; },
    /** The set of zone ids found, which win_map and the character document read. */
    get zonesFound() { return zones; },
    /** Every zone found, as rows. */
    zonesList: () => [...zones].map((id) => ZONE[id]).filter(Boolean),
    sitesNear: (x, z, r) => sitesNear(field, x, z, r),
    mouthsNear: (x, z, r) => mouthsNear(field, x, z, r),
  };
}
