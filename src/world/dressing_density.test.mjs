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
//
// D5, 2026-09-06. The user, looking out of the window again: "we have way too
// many stones everywhere, lets reduce by a lot. also reduce weird fences and
// objects all throughout the world, just looks like garbage."
//
// Two things, and D4 had only got at the first of them.
//
//   THE STONES were mostly not the dressing at all. The sarsen D4 cut to 28 a
//   square kilometre was the small half; flora.js drops one boulder candidate
//   in every 8 m cell at ROCK_DENSITY.meadow, and 425 of them stood to the
//   square kilometre of Greenwold meadow. That half is measured in
//   flora.test.mjs, which is where the grid lives. The sarsen comes down again
//   here, from 28 to 8.
//
//   THE FENCES were the hedgerow and the drystone wall, and they were the two
//   biggest kinds in the world by a factor of eight: 1515 and 1142 segments to
//   the square kilometre of OPEN meadow, sixty four runs of hedge bounding
//   nothing. They are not gone; they moved to the ground they belong on. The
//   split, before and after, is the second table below.
//
// The D5 before column is the same kind of fixed record as D4's: measured in
// one process against the same field and seed, at the commit before D5.

globalThis.performance ||= { now: () => Date.now() };

import { createWorldField, CHUNK } from './field.js';
import { sitesNear } from './sites.js';
import {
  dressingFor, realmAt, kitFor, wanted, ringOpen, ringNominee, workedAt, farmsNear,
  RING_APART, RING_CELLS, RING_CELL, RING_GUARD, ANCHOR, WORKED_REACH, FIELD_REACH,
} from './dressing.js';
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const ck = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };
const f1 = (v) => Number(v).toFixed(1);

const SEED = 20260904;
const RADIUS = 15;                      // chunks either side of the origin: a 31 by 31 square
const field = createWorldField(SEED, { homeY: -0.3 });

/**
 * At most this many a square kilometre. The user's own numbers, D4's and then
 * D5's, which cut four of the five again: "we have way too many stones
 * everywhere, lets reduce by a lot".
 */
const TARGET = {
  sarsen: 8,
  sheep_fold: 12,
  dew_pond: 6,
  hay_rick: 25,
  beehive: 15,
};

/**
 * D5's own before column: the placement as it stood at the commit before D5,
 * measured in one process against the same field and the same seed. Props a
 * square kilometre over the whole 31 by 31 chunk square.
 *
 * The four kinds D5 was asked to leave exactly alone are the FIELD BORDERS and
 * the road furniture: field_hedge, rail_fence, the three crops, the scarecrow
 * and the cart. A hedge that borders a field is the thing that was supposed to
 * be there all along, so it is pinned here at a twentieth rather than a fifth.
 */
const D5_BEFORE = {
  hedgerow: 1608.9,
  drystone_wall: 1200.4,
  sheaf: 157.3,
  field_gate: 78.2,
  rail_fence: 51.8,
  hay_rick: 44.7,
  cabbage_row: 37.3,
  stile: 30.5,
  sarsen: 28.2,
  beehive: 23.4,
  field_hedge: 12.2,
  wheat_row: 10.2,
  furrow: 9.7,
  sheep_fold: 4.3,
  dew_pond: 2.0,
  scarecrow: 1.3,
  cart: 0.5,
};

/** The kinds the farm layout places and neither grid can, which D5 did not touch. */
const FIELD_BORDERS = ['field_hedge', 'rail_fence', 'wheat_row', 'cabbage_row', 'furrow', 'scarecrow', 'cart'];

/**
 * The same square before D5, counting only the props standing on OPEN ground:
 * no field within WORKED_REACH and no road beside them. Props a square
 * kilometre of the square, so the open and the worked columns add up to the
 * table above.
 *
 * This is the complaint in one line. A hedge every twenty metres of open grass
 * in every direction, bounding nothing, and a wall beside it.
 */
const OPEN_BEFORE = {
  hedgerow: 1515.4,
  drystone_wall: 1141.7,
  sheaf: 146.1,
  field_gate: 72.7,
  hay_rick: 43.7,
  stile: 29.2,
  sarsen: 27.7,
  beehive: 22.1,
  sheep_fold: 4.3,
  dew_pond: 2.0,
};

/** How much of its old self a kind may keep out in the open meadow. */
const OPEN_KEEP = { hedgerow: 0.15, drystone_wall: 0.15 };
/** And the flat caps, per square kilometre of the square, on open ground. */
const OPEN_CAP = { sheaf: 20 };

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

/**
 * Every prop of a square of chunks, counted by kind, with the rings kept and
 * every prop split by the ground it stands on.
 *
 * `worked` is asked of the prop's OWN coordinates through `workedAt`, the same
 * function the placement asks of its cell centre, off the fields the same two
 * functions lay out. So a run that starts on farmed ground and wanders out of
 * it is counted where each of its segments really stands, which is the version
 * of the question a player can see.
 */
function sweep(cx0, cz0, r) {
  const kinds = {}, open = {}, worked = {}, rings = [], loose = [];
  let chunks = 0, props = 0;
  for (let cz = -r; cz <= r; cz++) for (let cx = -r; cx <= r; cx++) {
    chunks++;
    const gx = cx0 + cx, gz = cz0 + cz;
    const x0 = gx * CHUNK, z0 = gz * CHUNK;
    const fs = [];
    for (const n of farmsNear(field, sitesNear(field, x0 + CHUNK / 2, z0 + CHUNK / 2, CHUNK + FIELD_REACH), x0, z0)) {
      for (const f of n.farm.fields) fs.push(f);
    }
    for (const p of dressingFor(field, gx, gz)) {
      props++;
      kinds[p.kind] = (kinds[p.kind] || 0) + 1;
      const on = (p.farm || p.near === 'road' || workedAt(fs, p.x, p.z)) ? worked : open;
      on[p.kind] = (on[p.kind] || 0) + 1;
      if (p.kind === 'sheep_fold' || p.kind === 'dew_pond') rings.push(p);
      // Z4's promise, re-asked here on D5's own numbers: a gate or a stile is
      // the gap in a run and there is no other way for one to reach the world
      if ((p.kind === 'field_gate' || p.kind === 'stile') && !p.run) loose.push(p);
    }
  }
  return { kinds, open, worked, rings, loose, chunks, props, km2: chunks * CHUNK * CHUNK / 1e6 };
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
  for (const kind of FIELD_BORDERS) {
    const was = D5_BEFORE[kind], nowV = (gw.kinds[kind] || 0) / gw.km2;
    if (Math.abs(nowV / was - 1) > 0.05) moved.push(`${kind} ${f1(was)} to ${f1(nowV)}`);
  }
  ck('and the field borders and the road furniture did not move at all: D5 was not asked to touch a farm',
    moved.length === 0,
    moved.join(', ') || `${FIELD_BORDERS.join(', ')} all within a twentieth of what they were`);

  const gone = Object.entries(TARGET).filter(([k]) => !gw.kinds[k]);
  ck('and none of the five was thinned out of the world altogether',
    gone.length === 0, gone.map(([k]) => k).join(', ') || 'all five still stand in the square');
}

// ------------------------------------------- D5: the hedge and the wall --
//
// "also reduce weird fences and objects all throughout the world, just looks
// like garbage."
//
// The hedgerow and the drystone wall were the two biggest kinds in the world
// and it was not close: 1515 and 1142 segments to the square kilometre of OPEN
// Greenwold, against 94 and 59 on the farmed ground where a hedge means
// something. Sixty four runs of hedge to the square kilometre is one every
// hundred and twenty five metres in every direction, each of them bounding
// nothing at all.
//
// They are not struck out of the open country, because a hedge on a far ridge
// is a landscape. They carry an `openChance` instead: full strength on farmed
// ground and beside a lane, about a fiftieth of that in the meadow between,
// which comes to roughly six runs to the square kilometre, one every four
// hundred metres.
//
// The sheaf is a different rule and gets a different one: a sheaf is cut corn,
// so it carries `only: 'worked'` and is struck out of the open pool outright.
// The few that still stand out there are the ones whose 32 m anchor cell was
// on worked ground while the prop itself landed just outside it.

console.log('\nthe hedge, the wall and the sheaf, split by the ground they stand on');
{
  console.log('  ..  kind              open before   open after    cut     worked before/after');
  const all = [...new Set([...Object.keys(OPEN_BEFORE), ...Object.keys(gw.open)])]
    .sort((a, b) => (OPEN_BEFORE[b] || 0) - (OPEN_BEFORE[a] || 0));
  for (const kind of all) {
    const b = OPEN_BEFORE[kind] ?? 0, a = (gw.open[kind] || 0) / gw.km2;
    const w = (gw.worked[kind] || 0) / gw.km2;
    const wb = (D5_BEFORE[kind] ?? 0) - b;
    const cut = b ? `${((1 - a / b) * 100).toFixed(1)}%` : 'new';
    console.log(`  ..  ${kind.padEnd(16)} ${f1(b).padStart(11)} ${f1(a).padStart(12)} ${cut.padStart(8)}`
      + `     ${f1(wb)} / ${f1(w)}`);
  }

  const short = [];
  for (const [kind, keep] of Object.entries(OPEN_KEEP)) {
    const b = OPEN_BEFORE[kind], a = (gw.open[kind] || 0) / gw.km2;
    if (a > b * keep) short.push(`${kind} kept ${((a / b) * 100).toFixed(1)}% against ${keep * 100}%`);
  }
  ck('a hedgerow and a drystone wall in open meadow are down by at least eighty five per cent',
    short.length === 0,
    short.join(', ') || Object.keys(OPEN_KEEP).map((k) =>
      `${k} ${f1(OPEN_BEFORE[k])} to ${f1((gw.open[k] || 0) / gw.km2)}, `
      + `${((1 - (gw.open[k] || 0) / gw.km2 / OPEN_BEFORE[k]) * 100).toFixed(1)}% fewer`).join('; '));

  const capped = [];
  for (const [kind, cap] of Object.entries(OPEN_CAP)) {
    const a = (gw.open[kind] || 0) / gw.km2;
    if (a > cap) capped.push(`${kind} ${f1(a)} against ${cap}`);
  }
  ck('and a sheaf is a thing of farmed ground: at most twenty a square kilometre stand in the open',
    capped.length === 0,
    capped.join(', ') || Object.keys(OPEN_CAP).map((k) =>
      `${k} ${f1(OPEN_BEFORE[k])} to ${f1((gw.open[k] || 0) / gw.km2)} in the open, `
      + `${f1((gw.worked[k] || 0) / gw.km2)} on farmed ground`).join('; '));

  // AND THE FARMED COUNTRY DID NOT GO WITH IT. The whole point of `openChance`
  // over `only` is that a village keeps its hedges, so this is the half that
  // has to go UP.
  const hedgeWorked = (gw.worked.hedgerow || 0) / gw.km2 + (gw.worked.drystone_wall || 0) / gw.km2;
  const hedgeWorkedWas = (D5_BEFORE.hedgerow - OPEN_BEFORE.hedgerow)
    + (D5_BEFORE.drystone_wall - OPEN_BEFORE.drystone_wall);
  ck('and the farmed country carries MORE hedge and wall than it did, not less',
    hedgeWorked > hedgeWorkedWas,
    `${f1(hedgeWorkedWas)} to ${f1(hedgeWorked)} segments a square kilometre on worked ground`);

  ck('and no gate and no stile stands on its own: every one of them is the gap in a run',
    gw.loose.length === 0,
    gw.loose.length ? `${gw.loose.length} standing alone` : `${gw.kinds.field_gate || 0} gates and `
      + `${gw.kinds.stile || 0} stiles in the square, every one of them with a run behind it`);
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
  ck('and a kind that asks for neither spacing nor rarity is never refused by wanted()',
    [0, 1, 2, 3, 4].every((i) => wanted(sheaf, one.cellX + i, one.cellZ - i, SEED, SEED + 28)),
    'a sheaf declares no rarity and no lattice, so what keeps it off the open meadow is '
    + 'poolFor and its `only`, and not this veto');

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

console.log('\nthe Stormpeaks, which were not asked to change either');
{
  // D5's helpers are shared: `poolFor` grew a sixth argument, `openChance` is
  // read on every kit row and `workedAt` is asked of every anchor cell in the
  // world. The Stormpeaks farm and the Boneyard does not, so between them they
  // cover both sides of that: a realm with fields in it whose kit declares
  // neither `only: 'worked'` nor an `openChance`, and a realm with no fields at
  // all. Every number below was taken from the module as it stood before D5, in
  // the same process, and every one of them held to the prop.
  const PEAK = {
    post_fence: 1860.4, scree_boulder: 321.9, rider_cairn: 264.0, cairn: 261.9, slate_slab: 248.0,
    prayer_stone: 246.7, broken_column: 161.1, totem: 150.1, banner_pole: 109.5, eyrie_nest: 24.6,
  };
  const peak = sweep(18, -65, RADIUS);
  const off = [];
  for (const [kind, was] of Object.entries(PEAK)) {
    const now = (peak.kinds[kind] || 0) / peak.km2;
    if (Math.abs(now - was) > 0.05) off.push(`${kind} ${f1(was)} to ${f1(now)}`);
  }
  ck('every kind of the Stormpeaks stands exactly where it stood before D5',
    off.length === 0, off.join(', ') || `${Object.keys(PEAK).length} kinds, ${peak.props} props, unmoved`);
  // The square itself holds no Stormpeaks village, so it grows no crop. What
  // makes it the other side of the Boneyard is the KIT: the Stormpeaks carry
  // the nine field kinds and the Boneyard carries none, so `workedAt` and
  // `farmsNear` are asked real questions in one square and empty ones in the
  // other, and both squares came out to the prop.
  ck('and the Stormpeaks are a realm that farms, which the Boneyard is not',
    kitFor('stormpeaks').some((k) => k.tier === 'field') && kitFor('boneyard').every((k) => k.tier !== 'field'),
    `${kitFor('stormpeaks').filter((k) => k.tier === 'field').length} field kinds in the Stormpeaks kit, `
    + `${kitFor('boneyard').filter((k) => k.tier === 'field').length} in the Boneyard's`);
  ck('and no kit outside the Greenwold declares an open chance of its own',
    ['boneyard', 'stormpeaks', 'verdant', 'saltmarch', 'emberwastes', 'frostreach', 'sunkenkingdom', 'ashenthrone']
      .every((r) => kitFor(r).every((k) => k.openChance == null && k.only !== 'worked')),
    'the Greenwold is the only realm D5 touched');
}

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
