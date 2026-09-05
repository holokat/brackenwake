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
//
// ---- authored sites ------------------------------------------------------
//
// zones.js writes thirty places down by hand. An authored site OWNS its cell:
// the procedural roll for that cell is never run, so a hand placed mine can
// never sit on top of a rolled town and the two can never disagree about what
// stands there.
//
// The authored kind `mine` is deliberately NOT a row of KINDS. Adding a weight
// to that table changes KIND_TOTAL, which changes the kind every cell in the
// world rolls, which moves every town in every save already on disk. A mine
// exists because an author put one somewhere, and nowhere else.

import { hash2, rand2 } from './noise.js';
import { authoredSites } from './zones.js';

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

// ---------------------------------------------------------------- authored --

let byCell = null;
/** The authored sites, indexed by the cell each one stands in. Built once. */
function authoredIndex() {
  if (byCell) return byCell;
  byCell = new Map();
  for (const s of authoredSites()) {
    const key = Math.floor(s.x / SITE_CELL) + ',' + Math.floor(s.z / SITE_CELL);
    const held = byCell.get(key);
    if (held) throw new Error(`sitegrid: "${s.name}" and "${held.name}" both stand in cell ${key}; one of them has to move`);
    byCell.set(key, s);
  }
  return byCell;
}

/** The authored site standing in this cell, or null. */
export function authoredInCell(cx, cz) {
  return authoredIndex().get(cx + ',' + cz) || null;
}

/** How many cells hold an authored site. */
export const authoredCount = () => authoredIndex().size;

// ---- a mine, laid out ------------------------------------------------------
//
// An open mine is a yard and several mouths on the hillside above it, with the
// seams that made anyone dig here still showing on the surface between them.
// Only the ANGLES and DISTANCES live here, because this file has never been
// allowed to know where the ground is: field.js turns them into world points
// and heights, and it is field.js that works out which way is downhill.

/** How many cuts one hillside carries, [min, max]. */
export const MINE_MOUTHS = [2, 4];
/** Metres from the yard's centre up the hill to a mouth. */
export const MINE_MOUTH_D = 21;
/** Radians between two neighbouring mouths. */
export const MINE_MOUTH_ARC = 0.46;
/** How many surface seams the yard carries, [min, max]. */
export const MINE_SEAMS = [4, 7];
/** Metres from the yard's centre to a seam, [min, max]. */
export const MINE_SEAM_R = [7, 16];
/**
 * The cell stride between one mine mouth's generator seed and the next. The
 * levels behind two mouths must not be the same level, and dungeon_gen.js keys
 * a level off (cx, cz), so each mouth is handed a cell far from every real one.
 */
export const MINE_MOUTH_CELL = 100003;

const ORDINAL = ['first', 'second', 'third', 'fourth', 'fifth'];

/**
 * A mine's parts, in polar offsets from its centre.
 *
 *   mouths  { i, a, d, name }   `a` is a world bearing, already pointing up the
 *                               hill, because `site.facing` is downhill
 *   seams   { i, a, d, ore }    an ore id drawn from the site's own band
 *
 * `site` needs cx, cz, name, facing and oreBand. Deterministic from those.
 */
export function mineParts(site, seed = 0) {
  const band = (site.oreBand && site.oreBand.length) ? site.oreBand : ['copper'];
  const span = (lo, hi, s) => lo + hash2(site.cx, site.cz, seed + s) % (hi - lo + 1);

  const n = span(MINE_MOUTHS[0], MINE_MOUTHS[1], 41);
  const mouths = [];
  for (let i = 0; i < n; i++) {
    // the yard is downhill of the cuts, so a mouth stands at facing + PI
    const a = site.facing + Math.PI + (i - (n - 1) / 2) * MINE_MOUTH_ARC;
    mouths.push({ i, a, d: MINE_MOUTH_D, name: `${site.name}, the ${ORDINAL[i] || i + 1} cut` });
  }

  const m = span(MINE_SEAMS[0], MINE_SEAMS[1], 43);
  const seams = [];
  for (let i = 0; i < m; i++) {
    const a = rand2(site.cx + i * 7, site.cz - i * 13, seed + 47) * Math.PI * 2;
    const d = MINE_SEAM_R[0] + rand2(site.cx - i * 11, site.cz + i * 5, seed + 53) * (MINE_SEAM_R[1] - MINE_SEAM_R[0]);
    // the richer end of the band is the rarer end, so it is the rarer roll
    const pick = hash2(site.cx + i * 3, site.cz - i * 17, seed + 59) % (band.length * 2 - 1);
    seams.push({ i, a, d, ore: band[pick < band.length ? pick : band.length - 1 - (pick - band.length)] });
  }
  return { mouths, seams };
}

/** The roll for cell (cx, cz): a site candidate or null. Terrain not consulted. */
export function cellRoll(seed, cx, cz) {
  // an authored site owns its cell outright; the roll below never runs there
  const a = authoredInCell(cx, cz);
  if (a) return { ...a, cx, cz, facing: rand2(cx, cz, seed + 5) * Math.PI * 2 };
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
 *
 * An authored site is exempt from the terrain rules, because an author already
 * looked: every coordinate in zones.js was measured against this same field.
 * The farm disc is the one rule it still obeys, and `zones.test.mjs` proves,
 * against the real terrain, that no authored site stands in water.
 */
export function siteAllowed(site, r, homeK) {
  if (homeK < 1) return false;                       // not on the farm's disc
  if (site.authored) return true;
  if (r.h < -0.2 || r.river > 0.2) return false;     // not in the sea, not in a river
  if (site.kind === 'cave') return r.h >= 16 && r.h <= 48 && r.land > 0.9;
  return r.h <= 40;
}

/** Cell coordinates of a world point. */
export const cellOf = (x, z) => [Math.floor(x / SITE_CELL), Math.floor(z / SITE_CELL)];
