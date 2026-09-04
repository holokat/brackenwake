// Places worth finding, decided by the world seed and nothing else.
//
// The world is cut into SITE_CELL squares. Each cell rolls once, from its
// coordinates and the seed, for whether it holds a site, what kind, where in the
// cell it stands and what it is called. Because the roll is a hash, a site is
// in the same place for everyone, forever, without a list anywhere.
//
// Sites only land on dry ground that is not the farm, not a river and not a
// mountainside, and they keep out of each other's way by living one to a cell.
// Discovery is the player coming within DISCOVER_RADIUS; the game remembers
// what you have found in localStorage and tells you only the first time.

import { hash2, rand2 } from './noise.js';

export const SITE_CELL = 480;
export const DISCOVER_RADIUS = 70;
const STORE = 'brackenwake-discovered';

export const KINDS = [
  // weight, kind, how the toast announces it
  [5, 'hamlet',  'a hamlet'],
  [3, 'town',    'a town'],
  [3, 'ruin',    'a ruin'],
  [2, 'shrine',  'a wayside shrine'],
  [2, 'dungeon', 'a dungeon mouth'],
  [1, 'camp',    'a camp, recently left'],
];
const KIND_TOTAL = KINDS.reduce((a, k) => a + k[0], 0);

// Names from work, weather, land and mistakes, never from a fantasy word list.
const FIRST = ['Bracken', 'Ash', 'Fern', 'Miller', 'Long', 'Cold', 'Salt', 'Tanner', 'Red', 'Low', 'Grey', 'Kiln', 'Fallow', 'Weir', 'Crook', 'Slate', 'Marl', 'Rye', 'Hollow', 'Carter'];
const LAST_TOWN = ['wake', 'ford', 'stead', 'bridge', 'mere', 'field', 'thorpe', 'cross', 'hithe', 'gate', 'moor', 'well'];
const LAST_RUIN = ['Tower', 'Hall', 'Mill', 'Gate', 'Bridge', 'Barrow', 'Steps'];
const LAST_DUNGEON = ['Workings', 'Cellars', 'Cut', 'Shaft', 'Hollow', 'Sink'];

export function nameFor(kind, cx, cz, seed) {
  const a = FIRST[hash2(cx, cz, seed + 11) % FIRST.length];
  if (kind === 'ruin') return `the ${a} ${LAST_RUIN[hash2(cx, cz, seed + 13) % LAST_RUIN.length]}`;
  if (kind === 'dungeon') return `the ${a} ${LAST_DUNGEON[hash2(cx, cz, seed + 17) % LAST_DUNGEON.length]}`;
  if (kind === 'shrine') return `${a}'s Stone`;
  if (kind === 'camp') return `a cold fire`;
  return a + LAST_TOWN[hash2(cx, cz, seed + 19) % LAST_TOWN.length];
}

/** The site in cell (cx, cz), or null. Pure: same inputs, same site. */
export function siteInCell(field, cx, cz) {
  const seed = field.seed;
  if (rand2(cx, cz, seed + 1) > 0.62) return null;         // not every cell
  // position inside the cell, kept off the borders so neighbours never touch
  const x = (cx + 0.2 + 0.6 * rand2(cx, cz, seed + 2)) * SITE_CELL;
  const z = (cz + 0.2 + 0.6 * rand2(cx, cz, seed + 3)) * SITE_CELL;
  const s = field.sampleAt(x, z);
  if (s.water || s.river > 0.2 || s.h > 40 || field.homeFactor(x, z) < 1) return null;
  let roll = rand2(cx, cz, seed + 4) * KIND_TOTAL, kind = KINDS[0];
  for (const k of KINDS) { if (roll < k[0]) { kind = k; break; } roll -= k[0]; }
  return { id: `${cx},${cz}`, cx, cz, x, z, y: s.h, kind: kind[1], article: kind[2], name: nameFor(kind[1], cx, cz, seed), biome: s.biome };
}

/** Every site within `radius` world units of (x, z). */
export function sitesNear(field, x, z, radius) {
  const out = [];
  const c0 = Math.floor((x - radius) / SITE_CELL), c1 = Math.floor((x + radius) / SITE_CELL);
  const d0 = Math.floor((z - radius) / SITE_CELL), d1 = Math.floor((z + radius) / SITE_CELL);
  for (let cz = d0; cz <= d1; cz++) for (let cx = c0; cx <= c1; cx++) {
    const s = siteInCell(field, cx, cz);
    if (s && Math.hypot(s.x - x, s.z - z) <= radius) out.push(s);
  }
  return out;
}

export function createDiscovery(field, opts = {}) {
  const storeKey = opts.storeKey || STORE;
  let found;
  try { found = new Set(JSON.parse(localStorage.getItem(storeKey) || '[]')); } catch { found = new Set(); }
  const save = () => { try { localStorage.setItem(storeKey, JSON.stringify([...found])); } catch { /* private window */ } };
  let lastCheck = -1e9;

  return {
    /** Call often; it only looks every 400 ms. Returns a newly found site or null. */
    check(x, z, nowMs) {
      if (nowMs - lastCheck < 400) return null;
      lastCheck = nowMs;
      for (const s of sitesNear(field, x, z, DISCOVER_RADIUS)) {
        if (found.has(s.id)) continue;
        found.add(s.id); save();
        return s;
      }
      return null;
    },
    has: (id) => found.has(id),
    get count() { return found.size; },
    sitesNear: (x, z, r) => sitesNear(field, x, z, r),
  };
}
