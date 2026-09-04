// Where places are, before the ground is asked. Pure, no terrain, no THREE.
//
// The world is cut into SITE_CELL squares. A cell rolls once, from its
// coordinates and the seed, for whether it holds a site, what kind, where in
// the cell it stands and what it is called. field.js uses the same roll to
// flatten the ground under a site (or raise a mound for a cave) and sites.js
// uses it to decide which sites exist once the terrain has had its say, so the
// two can never disagree about where a town is.
//
// Sites keep off the cell borders (20% margin), so a site's footprint never
// crosses into a neighbouring cell and a point only needs to ask its own cell.

import { hash2, rand2 } from './noise.js';

export const SITE_CELL = 480;

// weight, kind, how the toast announces it, radius of flattened ground
export const KINDS = [
  [5, 'hamlet',  'a hamlet', 26],
  [3, 'town',    'a town', 46],
  [3, 'ruin',    'a ruin', 14],
  [2, 'shrine',  'a wayside shrine', 6],
  [2, 'dungeon', 'a dungeon mouth', 10],
  [3, 'cave',    'a cave in the hillside', 12],
  [1, 'camp',    'a camp, recently left', 7],
];
const KIND_TOTAL = KINDS.reduce((a, k) => a + k[0], 0);

// Names from work, weather, land and mistakes, never from a fantasy word list.
const FIRST = ['Bracken', 'Ash', 'Fern', 'Miller', 'Long', 'Cold', 'Salt', 'Tanner', 'Red', 'Low', 'Grey', 'Kiln', 'Fallow', 'Weir', 'Crook', 'Slate', 'Marl', 'Rye', 'Hollow', 'Carter'];
const LAST_TOWN = ['wake', 'ford', 'stead', 'bridge', 'mere', 'field', 'thorpe', 'cross', 'hithe', 'gate', 'moor', 'well'];
const LAST_RUIN = ['Tower', 'Hall', 'Mill', 'Gate', 'Bridge', 'Barrow', 'Steps'];
const LAST_DUNGEON = ['Workings', 'Cellars', 'Cut', 'Shaft', 'Hollow', 'Sink'];
const LAST_CAVE = ['Delve', 'Seam', 'Pocket', 'Hole', 'Adit'];

export function nameFor(kind, cx, cz, seed) {
  const a = FIRST[hash2(cx, cz, seed + 11) % FIRST.length];
  if (kind === 'ruin') return `the ${a} ${LAST_RUIN[hash2(cx, cz, seed + 13) % LAST_RUIN.length]}`;
  if (kind === 'dungeon') return `the ${a} ${LAST_DUNGEON[hash2(cx, cz, seed + 17) % LAST_DUNGEON.length]}`;
  if (kind === 'cave') return `${a}'s ${LAST_CAVE[hash2(cx, cz, seed + 23) % LAST_CAVE.length]}`;
  if (kind === 'shrine') return `${a}'s Stone`;
  if (kind === 'camp') return 'a cold fire';
  return a + LAST_TOWN[hash2(cx, cz, seed + 19) % LAST_TOWN.length];
}

/** The roll for cell (cx, cz): a site candidate or null. Terrain not consulted. */
export function cellRoll(seed, cx, cz) {
  if (rand2(cx, cz, seed + 1) > 0.62) return null;
  const x = (cx + 0.2 + 0.6 * rand2(cx, cz, seed + 2)) * SITE_CELL;
  const z = (cz + 0.2 + 0.6 * rand2(cx, cz, seed + 3)) * SITE_CELL;
  let roll = rand2(cx, cz, seed + 4) * KIND_TOTAL, kind = KINDS[0];
  for (const k of KINDS) { if (roll < k[0]) { kind = k; break; } roll -= k[0]; }
  return { id: `${cx},${cz}`, cx, cz, x, z, kind: kind[1], article: kind[2], flatR: kind[3], name: nameFor(kind[1], cx, cz, seed), facing: rand2(cx, cz, seed + 5) * Math.PI * 2 };
}

/**
 * Whether the terrain lets this site stand. `r` is the RAW field sample at the
 * site centre (before any flattening) and `homeK` the home factor there.
 * Caves want a hillside; everything else wants dry, low, river-free ground.
 */
export function siteAllowed(site, r, homeK) {
  if (homeK < 1) return false;                       // not on the farm's disc
  if (r.h < -0.2 || r.river > 0.2) return false;     // not in the sea, not in a river
  if (site.kind === 'cave') return r.h >= 16 && r.h <= 48 && r.land > 0.9;
  return r.h <= 40;
}

/** Cell coordinates of a world point. */
export const cellOf = (x, z) => [Math.floor(x / SITE_CELL), Math.floor(z / SITE_CELL)];
