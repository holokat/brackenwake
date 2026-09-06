// How much of the Greenwold there is, measured. Run:
//   node src/world/dressing_density.test.mjs
//
// D4. The user, looking out of the window: "campfire looking stone circles
// everywhere" and "so many rocks that look so bad". Both were true, and this
// is the number that says so. Over a 31 by 31 chunk square on the world seed,
// which is 3.94 square kilometres of the farmed country, the placement carried
//
//   sarsen      467 a square kilometre        a low poly rock blob
//   hay_rick    296                           hay under a cap
//   sheep_fold  230   \  285 rings a square   a ring of stones
//   dew_pond     55   /  kilometre, one       a ring of stones
//                        every sixty metres
//   beehive     110
//
// A sheep fold and a dew pond are both a low ring of stones on the grass, so
// at that spacing every one of them read as somebody's fire pit, and there
// were three hundred fire pits to the square kilometre.
//
// WHAT THIS FILE IS FOR, and it is two things:
//
//   1. the five kinds are under their targets, per square kilometre, measured
//      the way the complaint was measured and not somewhere convenient.
//   2. NOTHING ELSE MOVED. The hedgerows, the walls, the gates, the stiles,
//      the crop rows, the sheaves and the road furniture are all within a
//      fifth of what they were. This half is not decoration: the first cut of
//      D4 asked its veto BEFORE the ground gate, which took the second and
//      third tries away from every cell that rolled a rick on a slope, and
//      21 per cent of the Greenwold's hedgerows went with the ricks. The
//      table below is what caught it.
//
// The before column is the placement as it stood at the commit before D4,
// measured in one process against the same field and the same seed, so the
// two columns are the same measurement of two versions and not two
// measurements. It is a fixed record: the terrain, the zones and the roads
// under it can all move it, and if they do, the honest answer is to measure
// the old module again rather than to widen the band.

globalThis.performance ||= { now: () => Date.now() };

import { createWorldField, CHUNK } from './field.js';
import {
  dressingFor, realmAt, kitFor, wanted, ringOpen, ringNominee,
  RING_APART, RING_CELLS, RING_CELL, RING_GUARD, ANCHOR,
} from './dressing.js';
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const ck = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };
const f1 = (v) => Number(v).toFixed(1);

const SEED = 20260904;
const RADIUS = 15;                      // chunks either side of the origin: a 31 by 31 square
const field = createWorldField(SEED, { homeY: -0.3 });

/** At most this many a square kilometre, after D4. The user's own numbers. */
const TARGET = {
  sarsen: 40,
  sheep_fold: 12,
  dew_pond: 6,
  hay_rick: 60,
  beehive: 30,
};

/**
 * The same square, measured against the placement as it stood before D4.
 * Props a square kilometre. Everything not named in TARGET is a kind D4 was
 * asked to leave alone, and the twenty per cent band below is that promise.
 */
const BEFORE = {
  hedgerow: 1617.5,
  drystone_wall: 1216.9,
  sarsen: 467.7,
  hay_rick: 296.0,
  sheep_fold: 229.7,
  sheaf: 157.3,
  beehive: 110.5,
  field_gate: 79.5,
  dew_pond: 54.9,
  rail_fence: 51.8,
  cabbage_row: 37.3,
  stile: 30.5,
  field_hedge: 12.2,
  wheat_row: 10.2,
  furrow: 9.7,
  scarecrow: 1.3,
  cart: 0.5,
};

/** Every prop of a square of chunks, counted by kind, with the rings kept. */
function sweep(cx0, cz0, r) {
  const kinds = {}, rings = [];
  let chunks = 0, props = 0;
  for (let cz = -r; cz <= r; cz++) for (let cx = -r; cx <= r; cx++) {
    chunks++;
    for (const p of dressingFor(field, cx0 + cx, cz0 + cz)) {
      props++;
      kinds[p.kind] = (kinds[p.kind] || 0) + 1;
      if (p.kind === 'sheep_fold' || p.kind === 'dew_pond') rings.push(p);
    }
  }
  return { kinds, rings, chunks, props, km2: chunks * CHUNK * CHUNK / 1e6 };
}

// ------------------------------------------------- the Greenwold, counted --

console.log('\nthe open Greenwold, 31 by 31 chunks on the world seed');
const gw = sweep(0, 0, RADIUS);
{
  console.log(`  ..  ${gw.chunks} chunks, ${gw.km2.toFixed(2)} km2, ${gw.props} props, seed ${SEED}`);
  console.log('  ..  kind                  before/km2   after/km2    change   target');
  const all = [...new Set([...Object.keys(BEFORE), ...Object.keys(gw.kinds)])]
    .sort((a, b) => (BEFORE[b] || 0) - (BEFORE[a] || 0));
  for (const kind of all) {
    const b = BEFORE[kind] ?? 0, a = (gw.kinds[kind] || 0) / gw.km2;
    const pct = b ? `${((a / b - 1) * 100).toFixed(1)}%` : 'new';
    console.log(`  ..  ${kind.padEnd(20)} ${f1(b).padStart(9)} ${f1(a).padStart(11)} ${pct.padStart(9)}`
      + `${TARGET[kind] ? String(TARGET[kind]).padStart(9) : ''}`);
  }

  const over = [];
  for (const [kind, cap] of Object.entries(TARGET)) {
    const per = (gw.kinds[kind] || 0) / gw.km2;
    if (per > cap) over.push(`${kind} ${f1(per)} against ${cap}`);
  }
  ck('every kind the user asked for fewer of is under its own target',
    over.length === 0,
    over.join(', ') || Object.keys(TARGET).map((k) => `${k} ${f1((gw.kinds[k] || 0) / gw.km2)}/${TARGET[k]}`).join(', '));

  // and it really is the fall the complaint asked for, not a rounding of it
  const worstKept = Object.entries(TARGET)
    .map(([k, cap]) => [k, (gw.kinds[k] || 0) / gw.km2 / BEFORE[k], cap]).sort((a, b) => b[1] - a[1])[0];
  ck('and every one of them is down by at least half from what it was',
    worstKept[1] < 0.5, `the least of the five falls is ${worstKept[0]}, ${(worstKept[1] * 100).toFixed(1)}% of what it was`);

  const moved = [];
  for (const [kind, was] of Object.entries(BEFORE)) {
    if (TARGET[kind]) continue;
    const now = (gw.kinds[kind] || 0) / gw.km2;
    if (Math.abs(now / was - 1) > 0.2) moved.push(`${kind} ${f1(was)} to ${f1(now)}`);
  }
  ck('and nothing else moved by more than a fifth: the hedge, the wall, the gate, the crop and the road furniture',
    moved.length === 0,
    moved.join(', ') || `${Object.keys(BEFORE).length - Object.keys(TARGET).length} kinds inside the band`);

  const gone = Object.entries(TARGET).filter(([k]) => !gw.kinds[k]);
  ck('and none of the five was thinned out of the world altogether',
    gone.length === 0, gone.map(([k]) => k).join(', ') || 'all five still stand in the square');
}

// -------------------------------------------- a fold is a landmark, not a --
//                                               pattern
//
// The promise is RING_APART between any two ring shaped things, and it is
// asked of the PROPS that really stand, at their real coordinates, which is
// the only version of the promise a player can see.

console.log('\ntwo hundred metres between one ring of stones and the next');
{
  const rings = gw.rings;
  let worst = Infinity, pair = null;
  for (let i = 0; i < rings.length; i++) for (let j = i + 1; j < rings.length; j++) {
    const d = Math.hypot(rings[i].x - rings[j].x, rings[i].z - rings[j].z);
    if (d < worst) { worst = d; pair = [rings[i], rings[j]]; }
  }
  ck('there are folds and ponds in the square to measure at all', rings.length >= 8,
    `${gw.kinds.sheep_fold || 0} folds and ${gw.kinds.dew_pond || 0} ponds, `
    + `${f1(rings.length / gw.km2)} rings a square kilometre against 285 before`);
  ck(`and no two of them stand within ${RING_APART} m of each other`, worst >= RING_APART,
    pair ? `closest two are ${f1(worst)} m apart: ${pair[0].kind} at ${pair[0].x.toFixed(0)}, ${pair[0].z.toFixed(0)} `
      + `and ${pair[1].kind} at ${pair[1].x.toFixed(0)}, ${pair[1].z.toFixed(0)}` : 'no pair to measure');

  // THE RULE ITSELF, both directions. A lattice cell nominates one anchor
  // cell; the nominee stands only if no neighbouring nominee within RING_GUARD
  // claims the ground more loudly. So: every nominee that survives is clear of
  // every other by the guard, AND the rule really refuses somebody, or it
  // would be a promise made by doing nothing.
  const L = Math.ceil((RADIUS * CHUNK) / RING_CELL) + 1;
  const kept = [], lost = [];
  for (let lz = -L; lz <= L; lz++) for (let lx = -L; lx <= L; lx++) {
    const n = ringNominee(lx, lz, SEED);
    (ringOpen(n.cellX, n.cellZ, SEED) ? kept : lost).push(n);
  }
  let tooClose = 0, worstCentres = Infinity;
  for (let i = 0; i < kept.length; i++) for (let j = i + 1; j < kept.length; j++) {
    const d = Math.hypot(kept[i].x - kept[j].x, kept[i].z - kept[j].z);
    if (d < worstCentres) worstCentres = d;
    if (d < RING_GUARD) tooClose++;
  }
  ck('the surviving nominees are all clear of each other by the guard',
    tooClose === 0,
    `${kept.length} kept over ${kept.length + lost.length} lattice cells, closest two centres `
    + `${f1(worstCentres)} m apart, against a ${f1(RING_GUARD)} m guard`);
  ck('and the rule refuses somebody: it is not a promise kept by never firing',
    lost.length > kept.length * 0.2, `${lost.length} nominees lost the ground to a louder neighbour`);
  ck('and the guard is the promise plus the whole of the jitter two props could spend closing it',
    RING_GUARD > RING_APART && RING_CELL === RING_CELLS * ANCHOR,
    `${RING_APART} m promise, ${f1(RING_GUARD)} m between centres, on a ${RING_CELL} m lattice`);

  // and every other cell of that nominee's own lattice block is refused,
  // which is the other half of the rule and the half a player walks through:
  // forty eight cells of grass with no ring of stones in any of them
  const one = kept[Math.floor(kept.length / 2)];
  const fold = kitFor('greenwold').find((k) => k.kind === 'sheep_fold');
  const sheaf = kitFor('greenwold').find((k) => k.kind === 'sheaf');
  const blockX = Math.floor(one.cellX / RING_CELLS) * RING_CELLS;
  const blockZ = Math.floor(one.cellZ / RING_CELLS) * RING_CELLS;
  let refusedInBlock = 0;
  for (let j = 0; j < RING_CELLS; j++) for (let i = 0; i < RING_CELLS; i++) {
    const cx = blockX + i, cz = blockZ + j;
    if (cx === one.cellX && cz === one.cellZ) continue;
    if (!wanted(fold, cx, cz, SEED, SEED + 26)) refusedInBlock++;
  }
  ck('wanted() lets the ring kind stand in the nominated cell and refuses every other cell of its lattice block',
    wanted(fold, one.cellX, one.cellZ, SEED, SEED + 26)
    && refusedInBlock === RING_CELLS * RING_CELLS - 1,
    `anchor cell ${one.cellX}, ${one.cellZ} holds it and the other ${refusedInBlock} cells of the block do not`);
  ck('and a kind that asks for neither spacing nor rarity is never refused',
    [0, 1, 2, 3, 4].every((i) => wanted(sheaf, one.cellX + i, one.cellZ - i, SEED, SEED + 28)),
    'a sheaf is a sheaf, and there are meant to be a lot of them');

  // the rarity roll, both ways, on the kind it was written for
  const sarsen = kitFor('greenwold').find((k) => k.kind === 'sarsen');
  let put = 0, held = 0;
  for (let i = 0; i < 4000; i++) (wanted(sarsen, i, -i * 3 + 7, SEED, SEED + 28) ? put++ : held++);
  ck('and the rarity roll puts down about as many as the kit asked for',
    Math.abs(put / 4000 - sarsen.rare) < 0.02 && held > 0,
    `${put} of 4000 cells kept a sarsen, ${(put / 40).toFixed(1)}%, against the ${(sarsen.rare * 100).toFixed(0)}% the kit asks`);
}

// ----------------------------------- and no other realm moved by an inch --
//
// `wanted`, `ringOpen` and the veto in `stubborn` are shared code, so the
// question is not whether the Greenwold came down but whether the Boneyard
// came down with it. No kit outside the Greenwold declares `rare` or `spaced`,
// so every other realm should be the same to the prop, and this is that
// measured rather than argued: the numbers below were taken from the module as
// it stood before D4, in the same process, and every one of them held.

console.log('\nthe Boneyard, which was not asked to change');
{
  const BONE = {
    spine: 2257.5, bone_shard: 469.7, bone_stake: 278.7, ash_drift: 241.3, rib_arch: 169.2,
    bone_cairn: 163.6, tomb_slab: 154.7, rib_cage: 148.4, dragon_skull: 120.9, bone_tree: 92.7,
    half_giant: 88.7,
  };
  const bone = sweep(-66, 19, RADIUS);
  const off = [];
  for (const [kind, was] of Object.entries(BONE)) {
    const now = (bone.kinds[kind] || 0) / bone.km2;
    if (Math.abs(now - was) > 0.05) off.push(`${kind} ${f1(was)} to ${f1(now)}`);
  }
  ck('every kind of the Boneyard stands exactly where it stood before D4',
    off.length === 0, off.join(', ') || `${Object.keys(BONE).length} kinds, ${bone.props} props, unmoved`);
  ck('and no kit outside the Greenwold asks for rarity or spacing at all',
    ['boneyard', 'stormpeaks', 'verdant', 'saltmarch', 'emberwastes', 'frostreach', 'sunkenkingdom', 'ashenthrone']
      .every((r) => kitFor(r).every((k) => k.rare === 1 && !k.spaced)),
    'the Greenwold is the only realm D4 touched');
}

// -------------------------------------------------------------- the words --

console.log('\nthe words');
{
  for (const f of ['src/world/dressing.js', 'src/world/dressing_density.test.mjs']) {
    ck(`${f} has no em dashes`, !readFileSync(f, 'utf8').includes('\u2014'));
  }
  ck('the realm under the square really is the Greenwold', realmAt(0, 0).id === 'greenwold');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
