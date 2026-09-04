// Places worth finding, and the memory of having found them.
//
// The roll for where a site is lives in sitegrid.js; whether the ground allows
// it is field.siteInCell (the terrain is flattened under every site it allows,
// so a town always stands on level ground and a cave always sits in a mound).
// This module only asks the field and remembers discoveries in localStorage.

import { SITE_CELL } from './sitegrid.js';

export { SITE_CELL };
export const DISCOVER_RADIUS = 70;
const STORE = 'brackenwake-discovered';

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
