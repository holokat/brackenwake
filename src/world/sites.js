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
//            would announce Frostreach from a mile of meadow, so half in is the
//            rule, and half in is also where the realm's own bias reaches half
//            strength, which is the first place the country looks changed.
//
//            Zones NEST: a realm of Kaldera and the places inside it. Both are
//            offered, realm first, because a subzone's weight is not its
//            realm's and announcing only the deepest one would tell a player
//            about the Glass Road without ever telling them they had walked
//            into the Ashen Throne. See `zoneChain`.
//
// Both are throttled to CHECK_MS, both fire once and never again, and both are
// saved. The two lists are separate keys, so a save from before zones existed
// keeps every site it had found.

import { SITE_CELL } from './sitegrid.js';
import { zoneAt, weightOf, ZONE } from './zones.js';
import { SPACES } from '../mmo/spaces/index.js';

export { SITE_CELL };
export const DISCOVER_RADIUS = 70;
/** How much of a zone you have to be inside before it counts as entered. */
export const ZONE_ENTER_W = 0.5;
/** Neither check runs more often than this. */
export const CHECK_MS = 400;
const STORE = 'brackenwake-discovered';
const ZONE_STORE = 'brackenwake-zones';

/**
 * A SPACE as a site row.
 *
 * A space (src/mmo/spaces/) is a place somebody laid out by hand with the
 * editor, standing at an absolute point rather than in a cell the grid rolled.
 * It becomes a site row here, and one row is the whole of the wiring: the
 * marker streamer builds it, the dressing stops scattering inside it, the
 * monster layer stands its spawns and the npc layer stands its people, all
 * because those four already walk this list.
 *
 * `sub` is the space's id, which is the key `plans/index.js` looks a layout up
 * under, so a space answers `peopleFor`, `spawnsFor` and `inPlannedPlace`
 * exactly as a planned place does.
 */
export function spaceSiteRow(space, field) {
  const x = space.at.x, z = space.at.z;
  return {
    id: `s:${space.id}`,
    zone: null, realm: null, sub: space.id, space: space.id,
    kind: 'space',
    name: space.name || space.id,
    x, z,
    y: typeof field?.heightAt === 'function' ? field.heightAt(x, z) : 0,
    cx: Math.floor(x / SITE_CELL), cz: Math.floor(z / SITE_CELL),
    facing: 0,
    article: 'a place laid out by hand',
    // Nothing here asks the terrain for a pad. A space is authored ON the
    // ground it is authored on, and the terrain half of the editor is what
    // raises or carves that ground; a flatR here would fight it.
    flatR: 0, dish: 0, oreBand: [], levels: null,
    line: space.note || null,
    bodyR: space.radius || 0,
    radius: space.radius || 0,
    authored: true,
  };
}

/** Every space whose ground reaches within `radius` of (x, z). */
/** A space the editor made on its own, one per 256 m tile of a sculpt world. */
export const isTileSpace = (id) => /^tile_-?\d+_-?\d+$/.test(String(id || ''));
/**
 * A space that belongs to the sculpt world alone: a tile, or one of the
 * Greenwold spaces `scripts/sculpt-greenwold.mjs` traces off the painting.
 * Those stand where the painting's frame puts them, which means nothing in
 * the generated world, whose Greenwold is laid by zones.js and the sheet; at
 * seventy six of them they covered the generated farmland and swept its
 * hedges and furrows away (dressing_density.test caught it).
 */
export const isSculptSpace = (id) => isTileSpace(id) || /^greenwold_/.test(String(id || ''));

export function spaceSitesNear(x, z, radius, field, spaces = SPACES) {
  const out = [];
  const sculpt = !!(field && field.sculpt);
  for (const space of Object.values(spaces)) {
    if (!space || !space.at) continue;
    // A tile space is the sculpt canvas's own: the editor makes one wherever
    // the user paints, at the tile's centre, in the blank world. In the
    // generated world it would stand on ground the sheet laid (three of them
    // sat on Hearthhome's roads and took the roadside with them), so it is
    // the sculpt world's alone. A NAMED space is authored for either.
    if (!sculpt && isSculptSpace(space.id)) continue;
    if (Math.hypot(space.at.x - x, space.at.z - z) > radius + (space.radius || 0)) continue;
    out.push(spaceSiteRow(space, field));
  }
  return out;
}

/** Every site within `radius` world units of (x, z). */
export function sitesNear(field, x, z, radius) {
  const out = [];
  const c0 = Math.floor((x - radius) / SITE_CELL), c1 = Math.floor((x + radius) / SITE_CELL);
  const d0 = Math.floor((z - radius) / SITE_CELL), d1 = Math.floor((z + radius) / SITE_CELL);
  for (let cz = d0; cz <= d1; cz++) for (let cx = c0; cx <= c1; cx++) {
    const s = field.siteInCell(cx, cz);
    // `bodyR` (V1): the Standing Hedge is a mile across and the Obsidian Bridge
    // 214 m, so a body stays alive while any of it is inside the radius
    if (s && Math.hypot(s.x - x, s.z - z) <= radius + (s.bodyR || 0)) out.push(s);
  }
  // The hand authored spaces stand outside the grid entirely: they own no cell,
  // so nothing above would ever find one.
  for (const s of spaceSitesNear(x, z, radius, field)) out.push(s);
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

/**
 * The realm and then the subzone you are standing in, each with its own weight,
 * outermost first.
 *
 * `zoneAt` hands back the deepest zone only, and a subzone's weight is not its
 * realm's: you can be half inside the Ashen Throne and only a fringe inside the
 * Glass Road that lies over it. Announcing the deepest zone alone would then
 * skip the realm entirely, and the player would be told the Glass Road without
 * ever being told which country it runs through. So both are offered, the realm
 * first, because that is the order they are walked into.
 */
export function zoneChain(x, z) {
  const hit = zoneAt(x, z);
  if (!hit || !hit.zone) return [];
  if (!hit.zone.parent) return [hit];
  const parent = ZONE[hit.zone.parent];
  return parent ? [{ zone: parent, weight: weightOf(parent, x, z) }, hit] : [hit];
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
      const chain = zoneChain(x, z);
      for (const c of chain) {
        if (c.weight < ZONE_ENTER_W || zones.has(c.zone.id)) continue;
        zones.add(c.zone.id); save(zoneKey, zones);
        return c.zone;
      }
      return null;
    },

    /**
     * The zone you are in right now, half in or better, or null. For the HUD.
     * The DEEPEST one you are half inside: standing in the Salt Pans says the
     * Salt Pans, and standing in Ember Wastes country between them says Ember
     * Wastes.
     */
    zoneNow(x, z) {
      const chain = zoneChain(x, z);
      for (let i = chain.length - 1; i >= 0; i--) if (chain[i].weight >= ZONE_ENTER_W) return chain[i].zone;
      return null;
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
