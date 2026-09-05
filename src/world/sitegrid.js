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
import { authoredSites, HEART_SAFE } from './zones.js';

export const SITE_CELL = 480;

// weight, kind, how the toast announces it, radius of flattened ground
//
// THESE SEVEN ROWS MAY NEVER MOVE. `KIND_TOTAL` is the divisor every cell
// inside the heart rolls its kind against, so a weight changed here changes
// what stands in every save already on disk. A3 added eleven kinds and did NOT
// touch this table for exactly that reason; see WILD_KINDS below.
export const KINDS = [
  [5, 'hamlet',  'a hamlet', 26],
  [3, 'town',    'a town', 46],
  [3, 'ruin',    'a ruin', 14],
  [2, 'shrine',  'a wayside shrine', 6],
  [2, 'dungeon', 'a dungeon mouth', 10],
  [3, 'cave',    'a cave in the hillside', 12],
  [1, 'camp',    'a camp, recently left', 7],
];
const KIND_TOTAL = KINDS.reduce((a, k) => a + k[0], 0);   // 19

// ---- the wild structures, A3 -----------------------------------------------
//
// Between the ninety five named places the country was hamlets, towns, ruins,
// shrines, holes and cold campfires, and nothing else. These are the things
// worth crossing open ground for: a wizard's tower with one window lit, a
// temple with its braziers going, a keep above a town, a bandit camp with men
// around a fire, a graveyard, a barrow with a door in it, an arena, a
// fountain, a gate on the road, a farm that burned, a watchtower.
//
// Same four columns as KINDS. The pad is the radius of ground the body needs
// levelled under it, and `field.js` flattens it from this table without being
// told anything else, so a pad that is smaller than the body leaves the body on
// a slope.
//
// AND THE PAD IS NOT THE BODY. `field.js` levels dead flat only out to
// `flatR * 0.55` and grades from there to the hillside by `flatR + 4`, so a pad
// has to be nearly twice the widest reach of the body it carries. Every one of
// these numbers was MEASURED: `structures.test.mjs` builds each kind, walks
// every vertex of it, takes the furthest from the site's own centre, and fails
// if that reach is outside `flatR * 0.55`.
export const WILD_KINDS = [
  [1.2, 'watchtower',  'a watchtower, a brazier on the top of it', 8],
  [1.2, 'burned_farm', 'a farm that burned, and is burning still', 23],
  [1.3, 'bandit_camp', 'a camp with a fire in it, and men around the fire', 19],
  [1.0, 'graveyard',   'a graveyard, and a chapel with no roof', 36],
  [1.0, 'gate',        'a gate standing on its own', 13],
  [0.9, 'fountain',    'a fountain, and water still in it', 9],
  [0.8, 'tower',       'a stone tower, one window lit', 12],
  [0.8, 'tomb',        'a tomb, and a door in the side of it', 21],
  [0.8, 'castle',      'a keep behind a curtain wall', 54],
  [0.3, 'temple',      'a temple, its braziers burning', 44],
  [0.2, 'arena',       'a ring of stone tiers around a floor of sand', 35],
];
/** The seven old rows and the eleven new ones, which is what open country rolls. */
export const ALL_KINDS = KINDS.concat(WILD_KINDS);
const ALL_TOTAL = ALL_KINDS.reduce((a, k) => a + k[0], 0);   // 28.5
/** Kind ids A3 added, for anything that has to ask "is this one of the new ones". */
export const WILD_KIND_IDS = new Set(WILD_KINDS.map((k) => k[1]));

/**
 * How often a cell holds anything at all, inside the heart and outside it.
 *
 * A KIND table cannot change how MANY sites there are, only which kind each one
 * is: the count is this one number. So the eleven kinds above come with a
 * higher chance out in the country, and the two numbers are chosen together so
 * that the OLD kinds keep the density they have always had:
 *
 *   old kinds, before   0.62
 *   old kinds, after    WILD_CHANCE * KIND_TOTAL / ALL_TOTAL
 *                     = 0.93 * 19 / 28.5 = 0.62
 *   everything, after   0.93, which is half again as many sites
 *
 * `sitegrid.test.mjs` measures all three over the real world rather than
 * trusting the arithmetic.
 */
export const SITE_CHANCE = 0.62;
export const WILD_CHANCE = 0.93;

/**
 * THE HEART ROLLS THE OLD TABLE AND THE OLD CHANCE.
 *
 * `field.test.mjs` holds a digest of the 2 km square about the origin and it is
 * the ground every save already stands on. A new kind rolled inside it, or a
 * cell that used to hold nothing and now holds something, moves that ground.
 *
 * THE GATE IS ON THE CELL, NOT ON THE SITE. A gate on the site's own centre
 * looked right and was wrong: the digest hashes the site that NAMES each
 * sample, not only the one that shapes it, and a sample at (1000, 1000) is in
 * cell (2, 2), whose site may stand as far out as (1344, 1344), which is 1900 m
 * from the origin. Gated on its centre that site would have been wild, its kind
 * would have gone into the digest, and the heart would have moved a thousand
 * metres from where anybody was looking. So: a cell whose nearest corner is
 * within HEART_SAFE of the origin rolls exactly what it rolled before A3
 * existed, the seven kinds at 0.62, whatever it holds and wherever in itself it
 * holds it. That covers every cell the 2 km square touches, with two cells of
 * margin on every side.
 *
 * `siteAllowed` refuses a wild kind in such a cell as well, so the rule holds
 * even if something hands one in by another road. Both are driven from both
 * sides in `sitegrid.test.mjs`.
 */
export const WILD_MIN_R = HEART_SAFE;

/**
 * Metres from the origin inside which the world rolls nothing at all.
 *
 * The heart rule above is about the GROUND under a save. This one is about
 * what the player sees on the first morning: the walk out of the farm should
 * cross open country and arrive somewhere, and it cannot do that if a dungeon
 * mouth is standing three hundred metres from the gate. `world_runtime.js`
 * streams sites within 576 m of the player, so 600 puts the nearest rolled
 * thing outside the ring the spawn builds, and the first place is always a
 * walk. Authored places are exempt: the Standing Hedge stands at 837 m because
 * the sheet has always put it there, and it lays no ground down.
 */
export const SPAWN_CLEAR = 600;

/** Is any part of cell (cx, cz) within WILD_MIN_R of the origin? */
export function heartCell(cx, cz) {
  const x0 = cx * SITE_CELL, x1 = x0 + SITE_CELL;
  const z0 = cz * SITE_CELL, z1 = z0 + SITE_CELL;
  const nx = Math.min(x1, Math.max(x0, 0));
  const nz = Math.min(z1, Math.max(z0, 0));
  return nx * nx + nz * nz < WILD_MIN_R * WILD_MIN_R;
}

/**
 * How near a rolled town a keep has to stand, and where it tries to stand.
 *
 * A keep is not a thing on its own. It holds a town, it takes the town's rents
 * and it wears the town's name, so it goes on the town's own hill: the roll
 * puts it somewhere in its cell, and then it WALKS toward the town it found
 * until it is CASTLE_STAND_D away, clamped so it never leaves its own cell's
 * middle 60%. If the clamp cannot get it inside CASTLE_TOWN_R the cell rolls
 * again on the wild table with the castle taken out of it, and something else
 * stands there instead.
 */
export const CASTLE_TOWN_R = 400;
export const CASTLE_STAND_D = 300;
/** Metres inside the cell margin a moved site is held. Half a metre, for floats. */
const CELL_INSET = 0.5;

// Names from work, weather, land and mistakes, never from a fantasy word list.
const FIRST = ['Bracken', 'Ash', 'Fern', 'Miller', 'Long', 'Cold', 'Salt', 'Tanner', 'Red', 'Low', 'Grey', 'Kiln', 'Fallow', 'Weir', 'Crook', 'Slate', 'Marl', 'Rye', 'Hollow', 'Carter'];
const LAST_TOWN = ['wake', 'ford', 'stead', 'bridge', 'mere', 'field', 'thorpe', 'cross', 'hithe', 'gate', 'moor', 'well'];
const LAST_RUIN = ['Tower', 'Hall', 'Mill', 'Gate', 'Bridge', 'Barrow', 'Steps'];
const LAST_DUNGEON = ['Workings', 'Cellars', 'Cut', 'Shaft', 'Hollow', 'Sink'];
const LAST_CAVE = ['Delve', 'Seam', 'Pocket', 'Hole', 'Adit'];
// A3's tables, cut from the same cloth: what people did here, what the weather
// did to them, what the ground is, and what went wrong.
const LAST_TOWER = ['Tower', 'Spire', 'Lamp', 'Turn', 'Reckoning'];
const LAST_WATCH = ['Watch', 'Lookout', 'Post', 'Stand'];
const LAST_GRAVE = ['Ground', 'Yard', 'Acre', 'Rest', 'Field'];
const LAST_TOMB = ['Barrow', 'Tomb', 'Vault', 'Cairn', 'Mound'];
const LAST_ARENA = ['Ring', 'Pit', 'Circle', 'Sands'];
const LAST_WATER = ['Fountain', 'Basin', 'Spout', 'Waters'];
const LAST_GATE = ['Gate', 'Arch', 'Way', 'Mark'];
const LAST_BURN = ['Burning', 'Burn', 'Ashes', 'Loss'];
const LAST_BAND = ['Men', 'Lot', 'Crew', 'Company'];
// A temple is named for the thing it was raised over, and nobody ever raised
// one over a good year.
const TEMPLE_OF = ['the Long Rain', 'the Second Winter', 'the Turned Year', 'the Broken Plough', 'the Quiet Water', 'the Late Harvest', 'the Year Without Bread'];

export function nameFor(kind, cx, cz, seed) {
  const a = FIRST[hash2(cx, cz, seed + 11) % FIRST.length];
  const pick = (table, salt) => table[hash2(cx, cz, seed + salt) % table.length];
  if (kind === 'ruin') return `the ${a} ${LAST_RUIN[hash2(cx, cz, seed + 13) % LAST_RUIN.length]}`;
  if (kind === 'dungeon') return `the ${a} ${LAST_DUNGEON[hash2(cx, cz, seed + 17) % LAST_DUNGEON.length]}`;
  if (kind === 'cave') return `${a}'s ${LAST_CAVE[hash2(cx, cz, seed + 23) % LAST_CAVE.length]}`;
  if (kind === 'shrine') return `${a}'s Stone`;
  if (kind === 'camp') return 'a cold fire';
  if (kind === 'tower') return `the ${a} ${pick(LAST_TOWER, 29)}`;
  if (kind === 'watchtower') return `the ${a} ${pick(LAST_WATCH, 31)}`;
  if (kind === 'graveyard') return `the ${a} ${pick(LAST_GRAVE, 37)}`;
  if (kind === 'tomb') return `the ${a} ${pick(LAST_TOMB, 41)}`;
  if (kind === 'arena') return `the ${a} ${pick(LAST_ARENA, 43)}`;
  if (kind === 'fountain') return `${a}'s ${pick(LAST_WATER, 47)}`;
  if (kind === 'gate') return `the ${a} ${pick(LAST_GATE, 53)}`;
  if (kind === 'burned_farm') return `the ${a} ${pick(LAST_BURN, 59)}`;
  if (kind === 'bandit_camp') return `${a}'s ${pick(LAST_BAND, 61)}`;
  if (kind === 'temple') return `the Temple of ${pick(TEMPLE_OF, 67)}`;
  // a castle is named for the town it holds, and cellRoll knows which town
  if (kind === 'castle') return `${a} Keep`;
  return a + LAST_TOWN[hash2(cx, cz, seed + 19) % LAST_TOWN.length];
}

/** The word cut into a gate's lintel. The first half of its own name, shouted. */
export const gateWord = (name) => String(name || '').replace(/^the /, '').split(' ')[0].toUpperCase();

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
/**
 * The same trick for a tomb's door, and the same reason.
 *
 * A tomb is a rolled kind of its own, so the field flattens a 14 m pad under it,
 * `placeFor` can give it a habitat and the map can draw it. What the player
 * clicks is the DOOR, and the door is a site of kind 'dungeon' derived from the
 * tomb in `structures.js`, exactly as a mine's cut is a site of kind 'cave'
 * derived from the mine. So `interact.decide` reads it as enterable and
 * `world_runtime.enterDungeon` takes it with no change at all.
 *
 * THE DUNGEON ROLL IS NOT TOUCHED. 'dungeon' is still a row of KINDS with the
 * weight it has always had, and a tomb never becomes one: the derived door is
 * not in any cell, owns no cell and is never returned by `cellRoll` or
 * `sitesNear`. `dungeon_gen.js` keys a level off (cx, cz), so the door is handed
 * a cell far from every real one, as a cut is.
 */
export const TOMB_DOOR_CELL = 200003;

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

/**
 * The kind, and the point in the cell, before any of A3's rules run.
 *
 * Split out of `cellRoll` for one reason: the castle rule has to look at the
 * neighbouring cells, and a neighbour asked through `cellRoll` would run the
 * castle rule again and ask ITS neighbours, for ever. This function asks
 * nothing of anybody.
 */
function rawRoll(seed, cx, cz) {
  const x = (cx + 0.2 + 0.6 * rand2(cx, cz, seed + 2)) * SITE_CELL;
  const z = (cz + 0.2 + 0.6 * rand2(cx, cz, seed + 3)) * SITE_CELL;
  const wild = !heartCell(cx, cz);
  if (rand2(cx, cz, seed + 1) > (wild ? WILD_CHANCE : SITE_CHANCE)) return null;
  const table = wild ? ALL_KINDS : KINDS;
  let roll = rand2(cx, cz, seed + 4) * (wild ? ALL_TOTAL : KIND_TOTAL), row = table[0];
  for (const k of table) { if (roll < k[0]) { row = k; break; } roll -= k[0]; }
  return { x, z, row };
}

const ROW_BY_KIND = new Map(ALL_KINDS.map((k) => [k[1], k]));
/** The wild table with the castle struck out, and its total. */
const NO_CASTLE = WILD_KINDS.filter((k) => k[1] !== 'castle');
const NO_CASTLE_TOTAL = NO_CASTLE.reduce((a, k) => a + k[0], 0);
/**
 * What a cell that rolled a castle and found no town to hold becomes instead.
 *
 * MEASURED, and this is why the cell is mangled before it is hashed: `hash2`
 * multiplies the salt by 2^31 - 1, so two salts a few apart hand the mixer
 * inputs a few apart, and the mixer does not fully pull them back out. Rolling
 * this on a plain `rand2(cx, cz, seed + 71)` sent 95 of 106 demoted castles to
 * the last three rows of the table, because a castle is drawn from the high end
 * of the first roll and the second roll came out high as well. With the cell
 * stirred first the 106 land on the ten rows in the weights' own proportions.
 */
function rerollWild(seed, cx, cz) {
  let roll = rand2(cx * 7919 + 13, cz * 104729 - 17, seed + 71) * NO_CASTLE_TOTAL, row = NO_CASTLE[0];
  for (const k of NO_CASTLE) { if (roll < k[0]) { row = k; break; } roll -= k[0]; }
  return row;
}

/**
 * The rolled town within CASTLE_TOWN_R of (x, z), or null.
 *
 * Only the eight neighbouring cells are asked. A site two cells away is at
 * least 480 * 1.4 = 672 m off, because both ends keep to the middle 60% of
 * their own cell, and 672 is past 400. An authored town counts too.
 *
 * The terrain has not spoken yet here and cannot: this file has never been
 * allowed to know where the ground is. So the keep is beside a town the ROLL
 * made, and if the ground later refuses that town the keep stands on alone with
 * the town's name still on it, which is a keep that outlived its town and reads
 * as one. `sitegrid.test.mjs` measures how often that happens.
 */
function townNear(seed, cx, cz, x, z) {
  let best = null, bestD = Infinity;
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const nx = cx + dx, nz = cz + dz;
      const a = authoredInCell(nx, nz);
      const t = a
        ? (a.kind === 'town' ? { x: a.x, z: a.z, name: a.name } : null)
        : (() => { const c = rawRoll(seed, nx, nz); return c && c.row[1] === 'town' ? { x: c.x, z: c.z, name: nameFor('town', nx, nz, seed) } : null; })();
      if (!t) continue;
      const d = Math.hypot(t.x - x, t.z - z);
      if (d < bestD) { bestD = d; best = t; }
    }
  }
  return best;
}

/**
 * The point a keep takes up, given the town it holds: CASTLE_STAND_D from the
 * town, on the line between the two, clamped into the cell's own middle 60%.
 * Null when no such point is inside CASTLE_TOWN_R, which is the whole test.
 */
function castleStand(cx, cz, x, z, town) {
  const d = Math.hypot(town.x - x, town.z - z) || 1e-6;
  let px = x, pz = z;
  if (d > CASTLE_STAND_D) {
    const k = (d - CASTLE_STAND_D) / d;
    px = x + (town.x - x) * k;
    pz = z + (town.z - z) * k;
  }
  // half a metre inside the margin, not exactly on it: clamping to the border
  // itself lands on 0.8000000000000001 of the cell in floating point, and the
  // rule sitegrid has always kept is that a site is INSIDE the middle 60%
  const lo = (c) => (c + 0.2) * SITE_CELL + CELL_INSET, hi = (c) => (c + 0.8) * SITE_CELL - CELL_INSET;
  px = Math.min(hi(cx), Math.max(lo(cx), px));
  pz = Math.min(hi(cz), Math.max(lo(cz), pz));
  return Math.hypot(town.x - px, town.z - pz) <= CASTLE_TOWN_R ? { x: px, z: pz } : null;
}

/** The roll for cell (cx, cz): a site candidate or null. Terrain not consulted. */
export function cellRoll(seed, cx, cz) {
  // an authored site owns its cell outright; the roll below never runs there
  const a = authoredInCell(cx, cz);
  if (a) return { ...a, cx, cz, facing: rand2(cx, cz, seed + 5) * Math.PI * 2 };
  const c = rawRoll(seed, cx, cz);
  if (!c) return null;
  let { x, z } = c;
  let kind = c.row;
  let town = null;
  if (kind[1] === 'castle') {
    const t = townNear(seed, cx, cz, x, z);
    const stand = t ? castleStand(cx, cz, x, z, t) : null;
    if (stand) { town = t; x = stand.x; z = stand.z; }
    // no town within reach of any point this cell can offer: roll the wild
    // table again with the castle struck out, so the country keeps its mix
    // instead of filling up with the one thing that could not be built
    else kind = rerollWild(seed, cx, cz);
  }
  const site = {
    id: `${cx},${cz}`, cx, cz, x, z,
    kind: kind[1], article: kind[2], flatR: kind[3],
    name: town ? `${town.name} Keep` : nameFor(kind[1], cx, cz, seed),
    facing: rand2(cx, cz, seed + 5) * Math.PI * 2,
  };
  if (town) { site.town = town.name; site.townAt = { x: town.x, z: town.z }; }
  if (site.kind === 'gate') site.word = gateWord(site.name);
  return site;
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
  // Nothing the world rolls for itself stands within sight of the spawn. The
  // first place has to be a walk: a dungeon mouth three hundred metres from
  // where a character wakes up is not a discovery, it is furniture, and the
  // ground round the origin belongs to the player before it belongs to the
  // generator. `world_runtime.js` streams a 576 m ring about the player, so
  // SPAWN_CLEAR stands outside it and the ring holds nothing rolled at all.
  // Driven both ways in sitegrid.test.mjs and measured in
  // world_runtime.test.mjs.
  // Written as "not far enough" rather than "near", so a site handed in with no
  // point at all is refused instead of quietly exempted.
  if (!(site.x * site.x + site.z * site.z >= SPAWN_CLEAR * SPAWN_CLEAR)) return false;
  // No wild structure in the heart. `cellRoll` already refuses to roll one
  // there, and this is the second lock on the same door: the digest of the 2 km
  // square in field.test.mjs is the ground every save already stands on, and a
  // temple inside it moves that ground. Driven both ways in sitegrid.test.mjs.
  if (WILD_KIND_IDS.has(site.kind) && heartCell(site.cx, site.cz)) return false;
  if (r.h < -0.2 || r.river > 0.2) return false;     // not in the sea, not in a river
  if (site.kind === 'cave') return r.h >= 16 && r.h <= 48 && r.land > 0.9;
  return r.h <= 40;
}

/** Cell coordinates of a world point. */
export const cellOf = (x, z) => [Math.floor(x / SITE_CELL), Math.floor(z / SITE_CELL)];
