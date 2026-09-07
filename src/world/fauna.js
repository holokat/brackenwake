// Where the animals of the world stand.
//
// THIS MODULE USED TO DRAW THEM. It built deer and rabbits and gulls out of
// `src/farm/`, kept them in its own group, walked them itself, and gave them a
// private little combat surface (`hitTest`, `damage`, `hpFor`) that nothing in
// Brackenwake's fight ever called. The result was the thing the user found: a
// squirrel you could not target, a deer you could not skin, a gull that was
// scenery, all of them running on the farm's hunting rules in a game that no
// longer has a farm.
//
// So the drawing is gone. The animals of the world are tier 0 monster rows
// (`src/mmo/monsters.js`: Rabbit, Squirrel, Deer, Gull, Frog, Crow, Field
// Mouse), which means they are actors: targetable, killable, skinnable, and
// tamable the day Animal Taming has a runtime. What is left here is the half
// this file was always best at, and the half `src/game/monsters.js` has no
// answer for: WHERE a rabbit belongs. Biome by biome, chunk by chunk, off the
// water, out of the towns, deer along the forest edge and gulls on the coast.
//
//   const fauna = createFauna(field, { sitesNear });
//   fauna.spawnsFor(cx, cz, night)   // -> spawn records for one chunk
//
// A record is EXACTLY the shape `monsters.spawnsForChunk` returns, so the
// monster layer can concatenate the two lists and never know which is which:
// the cap ranks them together, the dead list remembers them the same way, and
// a killed rabbit stays killed for the same eight to fifteen minutes a wolf
// does. `docs/mmo/wiring/F1.md` carries the one line in monsters.js that joins
// them up, and until that line lands this module places nothing that anybody
// can see, which is a state the tests say out loud rather than hide.
//
// Nothing in here imports THREE. It is a table and some arithmetic.

import { CHUNK, BIOMES } from './field.js';
import { rand2 } from './noise.js';
import { MONSTERS } from '../mmo/monsters.js';

// A site's flat radius plus this is off limits. Twelve, not six, and the number
// is not free: `monsters.SETTLEMENT_PAD` is 12, so a monster may not stand
// within `flatR + 12` of a town. At six, fauna placed rabbits in the ring
// between the two, and the layer that stands them up would then have refused to
// let them walk anywhere. Fauna is never laxer than the monster layer;
// `fauna.test.mjs` drives every placed record through `monsters.blockedAt` and
// fails if one of them is refused.
export const SITE_PAD = 12;
export const RIVER_MAX = 0.15;     // river strength a hoof will not stand in
export const GROUP_SPREAD = 14;    // metres a group scatters from its first member
export const HOME_KEEP = 0;        // metres of quiet around the origin. See below.
const PLACE_TRIES = 8;             // candidate points per animal before giving up

// HOME_KEEP is zero on purpose, and it used to be 130. That number was the
// farm's: the homestead had its own tame deer and wild ones on the doorstep
// read as a bug. Brackenwake has no farm, and a rabbit in the first field you
// walk through is the whole point of having rabbits. The mechanism is kept
// because a caller may still want a quiet ring (a town square, a starting
// clearing) and passing `homeKeep` is how it asks.

/**
 * One row per species, and every one of them is a real tier 0 monster.
 *
 * `biomes` is where it lives, which is checked against the spawn table below in
 * both directions: a species cannot be placed in a biome it does not live in,
 * and a biome cannot list a species that does not live there.
 *
 * There is no hp, no speed, no flee multiplier and no quarry id here any more.
 * All four live on the monster row, where the fight can read them.
 */
export const CRITTERS = {
  rabbit: { biomes: ['meadow', 'sakura'] },
  squirrel: { biomes: ['boreal', 'sakura', 'meadow'] },
  deer: { biomes: ['meadow', 'sakura', 'boreal'] },
  gull: { biomes: ['beach', 'ocean'], flying: true },
  frog: { biomes: ['meadow', 'beach'] },
  crow: { biomes: ['meadow', 'sakura', 'boreal', 'beach', 'desert', 'mountain', 'snow'], flying: true },
  fieldMouse: { biomes: ['meadow', 'sakura', 'boreal', 'desert', 'mountain', 'snow'] },
};

/**
 * Which chunks hold what. `p` is the chance this chunk rolls the group at all,
 * `n` the size of it. `night` groups exist only while the night flag is set;
 * `edge` groups need a neighbouring chunk of a named kind, which is what makes
 * boreal deer a forest EDGE animal rather than a deep woods one.
 *
 * DENSITY IS DELIBERATELY LOW, and here is the arithmetic, because the number
 * is not obvious and it is not free. `monsters.js` holds ONE cap over the near
 * ring (`ALIVE_CAP`, 40 bodies across 7 x 7 chunks) and ranks by distance, so
 * every critter standing is a monster not standing. The rows below come to
 * about a quarter of an animal per chunk in a meadow, which is roughly a dozen
 * over the whole ring: enough that a walk turns up rabbits, few enough that a
 * wood at night is still mostly wolves. The first pass at these numbers was
 * twice as high and a long walk across the real field had the near ring asking
 * for 35 bodies of the 40; the suite is what caught it, and it now measures the
 * thing that actually matters instead: it merges this table's roll with the
 * roster's own night roll, ranks the two together the way `rescan` does, caps
 * them at 40 and fails if the monsters are left fewer than 22 of the slots.
 * F1.md carries the note for the day a share of the cap is worth setting aside
 * explicitly.
 *
 * `night: true` on a row is honoured and no row uses it: there is no nocturnal
 * animal in tier 0 yet. The flag is kept because the roster will get an owl
 * before this file gets another rewrite, and because the record carries `night`
 * either way, which is what the monster layer's own chunk memo keys on.
 */
export const SPAWN = {
  meadow: [
    { id: 'rabbit', p: 0.05, n: [1, 3] },
    { id: 'deer', p: 0.03, n: [1, 4] },
    { id: 'fieldMouse', p: 0.03, n: [1, 2] },
    { id: 'crow', p: 0.02, n: [1, 2] },
    { id: 'frog', p: 0.01, n: [1, 2] },
  ],
  sakura: [
    { id: 'squirrel', p: 0.05, n: [1, 2] },
    { id: 'rabbit', p: 0.04, n: [1, 3] },
    { id: 'deer', p: 0.02, n: [1, 3] },
    { id: 'crow', p: 0.02, n: [1, 2] },
  ],
  boreal: [
    { id: 'squirrel', p: 0.05, n: [1, 2] },
    { id: 'deer', p: 0.04, n: [1, 4], edge: 'open' },
    { id: 'fieldMouse', p: 0.02, n: [1, 2] },
    { id: 'crow', p: 0.02, n: [1, 2] },
  ],
  beach: [
    { id: 'gull', p: 0.08, n: [1, 4] },
    { id: 'crow', p: 0.02, n: [1, 2] },
    { id: 'frog', p: 0.01, n: [1, 2] },
  ],
  ocean: [
    { id: 'gull', p: 0.06, n: [1, 3], edge: 'coast' },
  ],
  // The dry and the cold are not empty. A crow over a dune and a mouse under a
  // stone are what a desert has, and a biome with no row at all was how five
  // biomes shipped with nothing living in them the first time round.
  desert: [
    { id: 'crow', p: 0.03, n: [1, 2] },
    { id: 'fieldMouse', p: 0.02, n: [1, 2] },
  ],
  mountain: [
    { id: 'crow', p: 0.03, n: [1, 3] },
    { id: 'fieldMouse', p: 0.02, n: [1, 2] },
  ],
  snow: [
    { id: 'crow', p: 0.02, n: [1, 2] },
    { id: 'fieldMouse', p: 0.02, n: [1, 2] },
  ],
};

// Independent roll streams, so adding a crow row never moves the deer.
const GROUP_SEED = { rabbit: 61, squirrel: 71, deer: 67, gull: 83, frog: 89, crow: 97, fieldMouse: 101 };

/**
 * Every biome the field can return needs a row here, even an empty one, or a
 * new biome would quietly ship with nothing living in it and nobody would
 * notice. Every species named has to be a real tier 0 monster row, or the
 * record would go to `monsters.spawn` and be dropped on the floor. Both
 * directions, at module load.
 */
export function auditSpawnTable() {
  const bad = [];
  for (const b of BIOMES) if (!SPAWN[b]) bad.push(`no spawn row for biome ${b}`);
  for (const [id, spec] of Object.entries(CRITTERS)) {
    const row = MONSTERS[id];
    if (!row) bad.push(`"${id}" is not a monster`);
    else if (row.tier !== 0) bad.push(`"${id}" is tier ${row.tier}, and this file only places tier 0`);
    if (!GROUP_SEED[id]) bad.push(`"${id}" has no roll stream of its own`);
    for (const b of spec.biomes) if (!BIOMES.includes(b)) bad.push(`"${id}" lives in "${b}", which is not a biome`);
  }
  for (const [b, rows] of Object.entries(SPAWN)) {
    if (!BIOMES.includes(b)) bad.push(`a spawn row for "${b}", which is not a biome`);
    for (const r of rows) {
      if (!CRITTERS[r.id]) bad.push(`${b} spawns "${r.id}", which has no species row`);
      else if (!CRITTERS[r.id].biomes.includes(b)) bad.push(`${b} spawns ${r.id}, which does not live there`);
      if (r.edge && !EDGES[r.edge]) bad.push(`${b}:${r.id} wants edge "${r.edge}", which is not an edge`);
      if (!Array.isArray(r.n) || r.n[1] < r.n[0] || r.n[0] < 1) bad.push(`${b}:${r.id} has a nonsense group size`);
    }
  }
  // and the other way: a species nothing ever places is a species that does not
  // exist, and a body was built for it for nothing
  const placed = new Set(Object.values(SPAWN).flatMap((rows) => rows.map((r) => r.id)));
  for (const id of Object.keys(CRITTERS)) if (!placed.has(id)) bad.push(`"${id}" lives nowhere: no biome places it`);
  if (bad.length) throw new Error(`fauna: ${bad.join('; ')}`);
  return true;
}

export const siteClear = (st) => (st.flatR != null ? st.flatR : 20) + SITE_PAD;

/**
 * Pure: may an animal stand at (x, z), given the field sample there?
 * Returns null when it may, otherwise the reason it may not. Water and rivers
 * are refused for anything on legs; a site's cleared ground is refused for
 * everything, birds included, because a gull standing in the market square is
 * a bug whichever way it got there.
 */
export function blockedAt(x, z, s, ctx = {}) {
  const keep = ctx.homeKeep ?? HOME_KEEP;
  if (keep > 0 && Math.hypot(x, z) < keep) return 'home';
  for (const st of ctx.sites || []) if (Math.hypot(st.x - x, st.z - z) < siteClear(st)) return 'site';
  if (!ctx.flying && (s.water || s.river > RIVER_MAX)) return 'water';
  if (ctx.biomes && !ctx.biomes.includes(s.biome)) return 'biome';
  return null;
}

/** Pure: does a chunk next door hold one of these biomes? */
export function neighbourHas(field, cx, cz, biomes) {
  const c = CHUNK, h = CHUNK / 2;
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    if (biomes.includes(field.biomeAt((cx + dx) * c + h, (cz + dz) * c + h))) return true;
  }
  return false;
}

// What each `edge` flag means. Deer want the line where the wood meets open
// country; gulls want the coast, not the middle of the sea.
export const EDGES = {
  open: ['meadow', 'sakura', 'beach'],
  coast: ['beach'],
};

/** Pure: is this boreal chunk on the edge of open country? */
export const isForestEdge = (field, cx, cz) => neighbourHas(field, cx, cz, EDGES.open);

auditSpawnTable();

/**
 * Pure: the animals this chunk holds, as SPAWN RECORDS FOR THE MONSTER LAYER.
 *
 * The shape is `monsters.spawnsForChunk`'s, field for field:
 *
 *   { id, key, groupKey, cx, cz, i, x, z, y, night }
 *
 * `key` is what the character's dead list matches on, so it has to be stable
 * across a walk away and back and unique against every monster key in the
 * world. It carries the word "critter" for exactly that reason: a chunk can
 * hold a monster group and a rabbit warren at the same index and the two keys
 * must not collide.
 *
 * @param opts { night, sitesNear, homeKeep }
 */
export function spawnsFor(field, cx, cz, opts = {}) {
  // a sculpt world grows no animals of its own (ED3): the editor places them
  if (field.sculpt && !field.sculpt.wild) return [];
  const seed = field.seed;
  const night = !!opts.night;
  const homeKeep = opts.homeKeep ?? HOME_KEEP;
  const sitesNear = opts.sitesNear || (() => []);
  const x0 = cx * CHUNK, z0 = cz * CHUNK, mid = CHUNK / 2;
  const centre = field.sampleAt(x0 + mid, z0 + mid);
  const table = SPAWN[centre.biome];
  if (!table || !table.length) return [];
  const sites = sitesNear(x0 + mid, z0 + mid, CHUNK + 120) || [];
  const out = [];
  for (const g of table) {
    if (g.night && !night) continue;
    const gs = GROUP_SEED[g.id];
    if (rand2(cx, cz, seed + gs) >= g.p) continue;
    if (g.edge && !neighbourHas(field, cx, cz, EDGES[g.edge])) continue;
    const spec = CRITTERS[g.id];
    const span = g.n[1] - g.n[0] + 1;
    const n = g.n[0] + Math.floor(rand2(cx * 7 + 13, cz * 5 + 3, seed + gs + 1) * span);
    const ctx = { sites, homeKeep, flying: !!spec.flying, biomes: spec.biomes };
    const groupKey = `critter:${cx},${cz}:${g.id}`;
    let anchor = null;
    for (let i = 0; i < n; i++) {
      let placed = null;
      for (let t = 0; t < PLACE_TRIES; t++) {
        const ra = rand2(cx * 131 + i * 17 + t, cz * 97 + t * 5, seed + gs + 2);
        const rb = rand2(cx * 89 + t * 11, cz * 149 + i * 23 + t, seed + gs + 3);
        const x = anchor ? anchor.x + (ra - 0.5) * 2 * GROUP_SPREAD : x0 + 4 + ra * (CHUNK - 8);
        const z = anchor ? anchor.z + (rb - 0.5) * 2 * GROUP_SPREAD : z0 + 4 + rb * (CHUNK - 8);
        const s = field.sampleAt(x, z);
        if (blockedAt(x, z, s, ctx)) continue;
        placed = { x, z, y: s.h };
        break;
      }
      if (!placed) continue;
      if (!anchor) anchor = placed;
      out.push({
        id: g.id, cx, cz, i, groupKey, night,
        key: `${groupKey}:${i}`,
        x: placed.x, z: placed.z, y: placed.y,
      });
    }
  }
  return out;
}

/** Pure: how many of each species a chunk holds. For tests and for stats. */
export function countsFor(field, cx, cz, opts) {
  const out = {};
  for (const r of spawnsFor(field, cx, cz, opts)) out[r.id] = (out[r.id] || 0) + 1;
  return out;
}

/**
 * The placement layer, with a small memo in front of it.
 *
 * `monsters.js` asks a chunk for its critters once, when the chunk enters the
 * near ring or when the night flag flips, which is the same rhythm it rolls its
 * own groups on. The memo is there for the second ask (a rescan forced by a
 * teleport, the debug window) and is dropped when the ring moves on.
 */
export function createFauna(field, opts = {}) {
  const sitesNear = opts.sitesNear || (() => []);
  const homeKeep = opts.homeKeep ?? HOME_KEEP;
  const memo = new Map();
  const stats = { chunks: 0, placed: 0, byId: {}, biomes: {} };

  function forChunk(cx, cz, night = false) {
    const key = `${cx},${cz}:${night ? 'n' : 'd'}`;
    const had = memo.get(key);
    if (had) return had;
    const recs = spawnsFor(field, cx, cz, { night, sitesNear, homeKeep });
    memo.set(key, recs);
    stats.chunks++;
    stats.placed += recs.length;
    for (const r of recs) stats.byId[r.id] = (stats.byId[r.id] || 0) + 1;
    const b = field.biomeAt(cx * CHUNK + CHUNK / 2, cz * CHUNK + CHUNK / 2);
    stats.biomes[b] = (stats.biomes[b] || 0) + recs.length;
    // the memo is a cache, not a world: a long walk must not grow it for ever
    if (memo.size > 400) {
      let n = 0;
      for (const k of memo.keys()) { memo.delete(k); if (++n > 200) break; }
    }
    return recs;
  }

  return {
    stats,
    /** THE ONE CALL. Spawn records for one chunk, in monsters' own record shape. */
    spawnsFor: forChunk,
    /** The same, counted by species. Debug and tests. */
    countsFor(cx, cz, night) {
      const out = {};
      for (const r of forChunk(cx, cz, night)) out[r.id] = (out[r.id] || 0) + 1;
      return out;
    },
    /** Every record the near ring would ask for, for measuring density. */
    ringSpawns(pcx, pcz, ring = 3, night = false) {
      const out = [];
      for (let dz = -ring; dz <= ring; dz++) for (let dx = -ring; dx <= ring; dx++) {
        out.push(...forChunk(pcx + dx, pcz + dz, night));
      }
      return out;
    },
    forget() { memo.clear(); },
    dispose() { memo.clear(); },
  };
}
