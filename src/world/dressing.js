// What lies on the ground of a realm, and where.
//
// The Boneyard was a flat grey plain with pebbles on it. The sheet says it is
// a graveyard of nine dragons, ribs like cathedral vaults, and none of that
// was in the world. This file is the placement half of the answer: for every
// chunk, the props of the realm that chunk stands in, seeded, deterministic,
// off the ground the field already describes. `dressing_models.js` gives them
// bodies.
//
// The pattern is flora's, on purpose. A chunk comes into the streamed ring,
// `dressingFor(field, cx, cz)` says what stands in it, the runtime pushes
// those records into one InstancedMesh per kind, and when the chunk leaves the
// ring its records go with it. Nothing here touches THREE, so the whole of the
// placement runs in node and `dressing.test.mjs` drives it.
//
// Two grids, and they do different jobs:
//
//   ANCHOR   32 m. One attempt per cell at a large thing: a rib cage, a
//            sandstone arch, a hedgerow run. This grid is the promise that
//            open country is never empty. Any point on the map is within
//            22.6 m of an anchor centre, and an anchor stands within JITTER of
//            its centre, so from anywhere in open country something authored
//            is inside 60 m. dressing.test.mjs measures that, per realm, and
//            does not take it on faith.
//   SCATTER  16 m. Small things at a per realm density, denser where a road or
//            a place is near, which is what makes a road read as travelled and
//            a hamlet as lived beside.
//
//   FIELD    a farm's own ground, laid out around a settlement rather than on
//            a grid. A field is a rectangle of crop with a boundary round it,
//            a gate in the boundary, a scarecrow in the middle of it, and a
//            rick or a cart if the roll says so. Two to four of them share
//            their boundaries, so the land round a village reads as farmed and
//            the open country between two villages stays open.
//
// What a prop is never allowed to stand on, in the order the gate asks:
// open water, the surf line, a graded road, a site's pad, the home clear
// around the origin, a field's own ground, and ground steeper than its own
// kind will take. The gate is one function, `openAt`, and the placement and
// the test both call it, so the test path is the real path.
//
// TWO THINGS Z4 TOOK AWAY, because the Greenwold read as a joke shop.
//
//   A GATE STANDING IN GRASS. `field_gate` was a scatter kind, so the meadow
//   grew field gates the way it grew beehives: a dozen of them in sight, each
//   one leading from open grass into open grass. A gate is now placed by ONE
//   piece of code, `emitRun`, in the gap a hedgerow or a wall leaves for it,
//   and by the field boundaries which are runs of the same shape. There is no
//   other way for one to reach the world, and `dressing.test.mjs` walks four
//   hundred chunks to say so.
//
//   A CART IN THE MIDDLE OF NOWHERE. A cart, a signpost, a milestone and a
//   wayside shrine are things that stand BESIDE A ROAD. They now carry
//   `only: 'road'` and are struck out of the pool anywhere else, and the small
//   loose scatter of the open Greenwold is thinned by OPEN_THIN on top of that.

import { inPlannedPlace } from '../mmo/plans/index.js';
import { CHUNK, HOME_RADIUS, SEA_LEVEL } from './field.js';
import { rand2 } from './noise.js';
import { REALM_ZONES, weightOf } from './zones.js';
import { sitesNear as sitesNearField } from './sites.js';
import { roadsOverlapping, ROAD_HALF_WIDTH } from './roads.js';
import { standAt } from './arbor.js';
import { REALMS } from '../mmo/realms.js';

/** Metres per anchor cell. One large prop is attempted in each. */
export const ANCHOR = 32;
/** Metres per scatter cell. Four of these sit under every anchor cell. */
export const SCATTER = 16;
/** How far from its cell centre a prop may wander, as a fraction of the cell. */
export const JITTER = 0.36;
/** Attempts per anchor cell before the cell gives up and stands empty. */
export const TRIES = 4;
/** The base chance a scatter cell holds anything, before the realm's density. */
export const SCATTER_CHANCE = 0.30;
/** Road strength above which the ground counts as the road itself. */
export const ROAD_KEEP = 0.02;
/** Metres of clear ground kept outside a site's pad. */
export const PAD_MARGIN = 8;
/** A site with no pad of its own still keeps this much room. */
export const SITE_CLEAR = 34;
/** Nothing stands closer to sea level than this: that is the surf, not a shore. */
export const SHORE_LINE = SEA_LEVEL + 0.45;
/** Metres either side used to read the slope under a candidate. */
export const SLOPE_STEP = 3;
/** A road or a place within this many metres thickens the scatter. */
export const NEAR_ROAD = 26;
export const NEAR_SITE = 150;

// ------------------------------------------------------------- the fields --

/** Metres from a settlement's centre inside which its fields lie. */
export const FIELD_REACH = 400;
/** The shortest and the longest side a field may have, in metres. */
export const FIELD_MIN = 30;
export const FIELD_MAX = 80;
/**
 * The steepest ground a field is laid on, as the GRADE ACROSS THE WHOLE FIELD:
 * the rise from its lowest sampled corner to its highest, over its own longest
 * side. That is what "flat enough to plough" means for a rectangle; the six
 * metre slope `openAt` measures under a single prop is a different number and
 * would refuse every meadow in the world at 0.12.
 */
export const FIELD_GRADE = 0.12;
/** Bearings tried around a settlement before it is left without a farm. */
export const FIELD_TRIES = 14;
/** Samples a side taken inside a candidate field. */
export const FIELD_PROBE = 5;
/**
 * Samples a side taken for the WOOD, which is denser because it is cheap.
 * `arbor.standAt` is a fifth the price of a ground sample, so the stand can be
 * asked on a nine by nine grid out to the field's own edge for less than the
 * ground costs on five, and the promise "no field lies over a stand" is then
 * proof against a test that looks harder than the placement did.
 */
export const FIELD_WOOD_PROBE = 9;
/**
 * The half sides a field may be laid out at, in metres, and the guard that
 * keeps them inside the promise. A village rolls which one it works.
 */
export const FIELD_SIZES = [16, 19, 24, 30];
for (const h of FIELD_SIZES) {
  if (h * 2 < FIELD_MIN || h * 2 > FIELD_MAX) {
    throw new Error(`dressing: a field of ${h * 2} m, outside the ${FIELD_MIN} to ${FIELD_MAX} m promise`);
  }
}

/** The most whole-rectangle gates one settlement's search is allowed. */
export const FIELD_GATES = 260;
/** Distance bands out from a settlement the search walks, nearest first. */
export const FIELD_BANDS = 4;
/** Clear ground kept between a settlement's pad and the first of its fields. */
export const FIELD_STANDOFF = 24;
/** Metres a prop keeps out of a field that is not its own. */
export const FIELD_KEEP = 2.5;
/**
 * How far out of a field's own edge the ground still counts as WORKED.
 *
 * D5. The user, looking out of the window: "reduce weird fences and objects all
 * throughout the world, just looks like garbage". A hedgerow and a drystone
 * wall are the boundary of SOMETHING. Rolled on the anchor grid with nothing
 * but a `chance` in front of them they were the boundary of nothing at all,
 * and they were the two biggest kinds in the world by a wide margin: 1609 and
 * 1200 segments to the square kilometre of open Greenwold, which is a wall or
 * a hedge every twenty metres of open grass in every direction.
 *
 * So they carry `only: 'worked'` now, and worked ground is a farm field's own
 * ground grown by this much, or a roadside. A hedge in the farmed country
 * round a village is a hedge between two plots; the same hedge four hundred
 * metres out in the meadow is the garbage. A hundred and ten metres is a run's
 * own longest length, so a hedge that starts on worked ground can reach out of
 * it and still be a line that came from somewhere.
 */
export const WORKED_REACH = 110;
/** Metres between one crop row and the next. */
export const ROW_GAP = 3.2;
/** Metres of row one instanced body covers. */
export const ROW_SEG = 8;
/** Metres between one boundary segment and the next. */
export const BOUND_GAP = 3.0;
/** The kinds of place that farm. A ruin does not sow anything. */
export const FARM_KINDS = new Set(['hamlet', 'town']);
/**
 * How many fields a realm's settlements lay out.
 *
 * The Greenwold is the farmed country and gets the most. Verdant Deep, the
 * Stormpeaks and the Sunken Kingdom's islands keep a couple of plots by their
 * villages. The desert, the snow and the fen grow nothing: Ember Wastes,
 * Frostreach and the Saltmarch are zero, and so are the Boneyard's ash and the
 * Ashen Throne's slag, where nobody has sown anything for a long time.
 */
export const FIELDS_PER = {
  greenwold: 4,
  verdant: 2,
  stormpeaks: 2,
  sunkenkingdom: 2,
  saltmarch: 0,
  emberwastes: 0,
  frostreach: 0,
  boneyard: 0,
  ashenthrone: 0,
};
/** The realms that farm, as a set, for the kit builder and the audit. */
export const FARM_REALMS = new Set(Object.keys(FIELDS_PER).filter((r) => FIELDS_PER[r] > 0));
/**
 * What the small loose scatter of open Greenwold is multiplied by.
 *
 * Only in the open: away from a road, away from a place, and outside a farm.
 * A roadside keeps every prop it had. Set to 1 to get the world as it stood
 * before Z4, which is how `dressing.test.mjs` measures the drop rather than
 * asserting it.
 */
export const OPEN_THIN = 0.45;
/** The realms whose open country is thinned. Only the farmed one, so far. */
export const THIN_REALMS = new Set(['greenwold']);

// ------------------------------------------------- one fold to a parish --
//
// D4. The Greenwold read as a rockery with camp fires in it. Measured over a
// 31 by 31 chunk square on the world seed, 3.94 square kilometres, it carried
// 473 sarsens, 296 hay ricks, 230 sheep folds, 116 beehives and 55 dew ponds
// to the square kilometre. A sheep fold and a dew pond are both a low ring of
// stones on the grass, so 285 rings a square kilometre is one every sixty
// metres, and every one of them looked like somebody's fire pit.
//
// The ricks, the hives and the sarsens are thinned by `rare`, which is a roll
// drawn after the kind is picked, so the cell stands empty instead of handing
// its turn to a hedgerow. The two RING SHAPED kinds are not thinned at all;
// they are SPACED, which is a different promise and the one the user asked
// for: a fold or a pond is a landmark, so there is at most one of them in a
// lattice cell RING_CELLS anchor cells a side, and the lattice cell only keeps
// its own if no neighbouring cell's is close and higher priority.
//
// WHY THE CENTRES AND NOT THE PROPS. A nominated anchor cell puts its prop
// down within JITTER of its own centre, and which of the four tries lands is
// not known without sampling the ground, which the spacing test cannot afford
// to do for every neighbour. So the CENTRES are compared, at RING_GUARD, which
// is the promise plus the whole of the jitter both props could spend closing
// the gap. Whatever the two props then do inside their cells, they are
// RING_APART or more from each other.

/** Metres between one ring shaped landmark and the next. The promise. */
export const RING_APART = 200;
/** The lattice a ring landmark is nominated on, in ANCHOR cells a side. */
export const RING_CELLS = 7;
/** That lattice cell's side, in metres. */
export const RING_CELL = RING_CELLS * ANCHOR;
/**
 * The distance two nominated CELL CENTRES keep, so the two props keep
 * RING_APART however far each one jitters towards the other.
 */
export const RING_GUARD = RING_APART + 2 * JITTER * ANCHOR;
// The 3 by 3 neighbourhood has to be the whole of the question. Two nominees
// two lattice cells apart are at least this far apart whatever they roll, so
// if that is already over the guard, nothing outside the ring of eight can
// ever be the one that refuses. Thrown here rather than left to a test,
// because a wider RING_APART with the same lattice would quietly start
// missing the neighbour that mattered.
{
  const farthestApartInACell = (RING_CELLS - 1) * ANCHOR;
  const twoCellsOut = 2 * RING_CELL - farthestApartInACell;
  if (twoCellsOut < RING_GUARD) {
    throw new Error(`dressing: a ${RING_CELL} m ring lattice guards only ${twoCellsOut.toFixed(1)} m `
      + `at two cells out, under the ${RING_GUARD.toFixed(1)} m guard`);
  }
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

// THE SEED IS THE WORLD'S SEED, and there is nothing between them any more.
//
// Z4 found, on 2026-09-06, that `noise.hash2` mixed its seed in as
// `seed * 2147483647` in a double: with the world seed 20260904 that product is
// 4.35e16, past the 2^53 where a double stops holding every integer, so the low
// bits of the seed's contribution were rounded away and two salts of the same
// cell came out correlated. The kind roll that wanted 22 / 33 / 44 per cent
// beehive, sheaf and boundary stone gave 72 / 26 / 1.5, and the Greenwold's
// meadow was very nearly all beehives.
//
// Z4 could not touch `noise.js`, so it cut the seed to twenty bits in this file
// alone (`dressSeed`) and the mix came back. `hash2` uses `Math.imul` on all
// three terms now and loses nothing, so the cut is not only redundant, it is a
// second thing between the dressing and the world seed that every other file
// does without. It is gone. `dressing.test.mjs` measures the mix on the world
// seed itself, and against the old arithmetic rebuilt in the test, so what was
// fixed is still visible.

// ---------------------------------------------------------------- the kits --
//
// Eight to twelve kinds a realm, drawn from the realm's own `geography` line in
// src/mmo/realms.js. `size` is the prop's largest dimension in metres at scale
// 1, and dressing_models.js builds a body to that size: `auditKits` measures
// the built geometry against this number, so the two files cannot drift.
//
//   tier     'anchor' is the large thing one per 32 m cell; 'scatter' is the
//            small thing that fills between them
//   slope    the steepest ground the kind will stand on, rise per metre
//   sink     metres the body is pushed into the ground, so a half buried
//            giant is half buried and a rib cage is footed
//   run      a chain: n segments, gap metres apart, wandering by wander
//            radians a step. Hedgerows run; so does a dragon's spine
//   require  'steep' wants a slope, 'shore' wants low ground near the water
//   near     'road' or 'site' doubles the kind's weight where one is close
//   only     'road' strikes the kind out of the pool anywhere else. A cart, a
//            signpost, a milestone and a wayside shrine are things that stand
//            BESIDE A ROAD, and the meadow was full of them. 'worked' is the
//            same rule for the things that belong to FARMED GROUND: a
//            hedgerow, a drystone wall and a sheaf are kept where a field is
//            within WORKED_REACH or a road is near, and struck out of every
//            other cell in the world. That is D5, and it is what takes a wall
//            or a hedge every twenty metres of open meadow down to none
//   chance   the kind is in a cell's pool only this often. A hedgerow is now
//            forty to a hundred and twenty metres long, so it has to START in
//            far fewer cells than it did at eighteen metres, or the country
//            fills up with hedge
//   openChance
//            the same roll, asked instead of `chance` on ground that is
//            neither worked nor beside a road. This is D5, and it is what a
//            hedgerow and a drystone wall needed that `only` could not give
//            them. `only: 'worked'` took them out of the open country
//            altogether, which is honest about where a hedge belongs and
//            leaves the meadow with one authored thing every hundred and
//            eighty metres, measured. A hedgerow is not garbage because it
//            stands in open grass; it is garbage at sixty four runs to the
//            square kilometre, which is a run every hundred and twenty five
//            metres in every direction. At `openChance` it is about six runs
//            to the square kilometre, one every four hundred metres, which is
//            a field boundary seen across a valley and is the thing the
//            hedgerow was put in the world to be
//   rare     the kind is really put down only this often, and the roll is
//            drawn AFTER the pick, so the cell stands empty rather than
//            handing its turn to the next kind along. That is the whole
//            difference between `rare` and `chance`, and it is why D4 uses
//            it: `chance` takes a kind out of the pool and its weight goes
//            to the rest, so thinning the sarsens with `chance` would have
//            grown the sheaves and the hedgerows to fill the hole. `rare`
//            thins one kind and moves nothing else
//   spaced   'ring' says no two of these stand within RING_APART of each
//            other. A sheep fold and a dew pond are both a ring of stones
//            on the grass, and a dozen of them in sight read as a dozen
//            camp fires. Anchor tier only, and `auditKits` says so
//   along    'x' says the body's long axis is its own local X. A run then
//            turns each segment to lie ALONG the run instead of across it,
//            which is the difference between a hedgerow and a comb.
//            `auditBodies` measures every declared axis against the built
//            geometry, so the two files cannot drift
//   tier     'field' is neither anchor nor scatter: the kind is placed only by
//            the farm layout, never by either grid

const K = (kind, build, size, o = {}) => ({
  kind, build, size,
  tier: o.tier || 'scatter',
  slope: o.slope ?? 0.35,
  scale: o.scale || [0.85, 1.25],
  weight: o.weight ?? 1,
  sink: o.sink ?? 0.15,
  tilt: o.tilt ?? 0.05,
  run: o.run || null,
  require: o.require || null,
  near: o.near || null,
  only: o.only || null,
  chance: o.chance ?? 1,
  openChance: o.openChance ?? null,
  rare: o.rare ?? 1,
  spaced: o.spaced || null,
  along: o.along || null,
});

const A = (kind, build, size, o = {}) => K(kind, build, size, { tier: 'anchor', ...o });
/** A kind the farm layout places and neither grid ever rolls. */
const F = (kind, build, size, o = {}) => K(kind, build, size, { tier: 'field', slope: 1.4, tilt: 0.02, ...o });

/**
 * The nine kinds a farm is built out of, shared by every realm that farms.
 *
 * They are appended to those realms' kits rather than kept in a table of their
 * own, so `kitFor`, `specOf`, `bodyFor`, `auditBodies`, `paletteFor` and the
 * streaming layer all go on working with no idea that a field is different
 * from a rib cage. A Greenwold hedge and a Stormpeaks hedge are the same body
 * and two colours, exactly as a cart already was.
 *
 * `field_gate` and `stile` live here and NOT in the Greenwold's own list,
 * which is the whole point of Z4: neither grid can roll one, so neither can
 * ever stand alone in grass. The only code that places them is `emitRun`.
 */
export const FIELD_KIT = [
  F('field_hedge', 'hedge', 3.4, { sink: 0.2, along: 'x' }),
  F('rail_fence', 'railfence', 3.0, { sink: 0.14, along: 'x' }),
  F('field_gate', 'gate', 2.8, { sink: 0.12, along: 'x' }),
  F('stile', 'stile', 1.5, { sink: 0.1, along: 'x' }),
  F('wheat_row', 'wheatrow', 8, { scale: [0.94, 1.06], sink: 0.1, along: 'x' }),
  F('cabbage_row', 'cabbagerow', 8, { scale: [0.94, 1.06], sink: 0.06, along: 'x' }),
  F('furrow', 'furrow', 8, { scale: [0.96, 1.04], sink: 0.05, along: 'x' }),
  F('scarecrow', 'scarecrow', 2.4, { scale: [0.92, 1.08], sink: 0.12 }),
  F('crowed_scarecrow', 'crowedscarecrow', 2.4, { scale: [0.92, 1.08], sink: 0.12 }),
];

/** The three crops a field may be sown with, and how often each one is. */
export const CROPS = [['wheat_row', 0.5], ['cabbage_row', 0.26], ['furrow', 0.24]];
/** The two boundaries a field may be closed with. */
export const BOUNDS = [['field_hedge', 0.62], ['rail_fence', 0.38]];

/**
 * The slope one kind a realm will stand on, so a mountainside is never bare.
 * Measured, not guessed: the median slope over a hundred metres of open ground
 * in the Boneyard's hills is 1.0 rise per metre and in the Saltmarch's 0.77,
 * so a limit of 0.35 would have left every hillside in the world empty. The
 * rugged kind of a realm is a loose thing that lies where it fell: a boulder, a
 * shard, a bone, a knot of driftwood.
 */
export const RUGGED = 1.4;

export const KITS = {
  // Hedged fields, orchards, a slow river with a mill on it. The heart looks
  // farmed because it is farmed.
  greenwold: [
    // A hedgerow is forty to a hundred and twenty metres now, it turns one
    // corner on the way, and it leaves a gap with a gate or a stile in it. It
    // starts in one cell in five, because at eighteen metres it could start in
    // half of them and at a hundred and twenty it cannot.
    A('hedgerow', 'hedge', 3.4, { weight: 4, slope: 0.5, chance: 0.34, openChance: 0.020, along: 'x',
      run: { n: [14, 40], gap: 3.0, wander: 0.035, corner: true, gate: true } }),
    A('drystone_wall', 'wall', 3.2, { weight: 4, slope: 0.5, chance: 0.28, openChance: 0.016, along: 'x',
      run: { n: [13, 34], gap: 3.0, wander: 0.03, corner: true, gate: true } }),
    // What the anchor grid puts down in the OPEN Greenwold, now that a cart
    // and a shrine are road furniture and a hedgerow starts in one cell in
    // five. All three are things that stand alone in a field and mean
    // something standing there: hay under a cap, a fold for the sheep, and a
    // dew pond dug where the ground already held water.
    //
    // D4: and all three were EVERYWHERE, which is the opposite of meaning
    // something. A rick is one in seven of the cells that roll one now, and
    // the fold and the pond are spaced two hundred metres apart, so each one
    // is the fold, on the hill above the village, and not a pattern.
    A('hay_rick', 'rick', 4.2, { weight: 3, slope: 0.16, rare: 0.055 }),
    A('sheep_fold', 'fold', 7.0, { weight: 2, slope: 0.22, sink: 0.12, spaced: 'ring' }),
    A('dew_pond', 'pond', 6.0, { weight: 1, slope: 0.09, sink: 0.3, spaced: 'ring' }),
    A('wayside_shrine', 'shrine', 2.6, { weight: 1, slope: 0.2, near: 'road', only: 'road' }),
    A('cart', 'cart', 3.4, { weight: 1, slope: 0.14, near: 'road', only: 'road' }),
    K('milestone', 'stele', 1.1, { weight: 2, slope: 0.45, near: 'road', only: 'road' }),
    K('signpost', 'signpost', 2.8, { weight: 1, slope: 0.4, near: 'road', only: 'road' }),
    // The loose scatter. A sheaf is a sheaf and there are meant to be a lot of
    // them; the hive and the sarsen are thinned by `rare` and their weights
    // are untouched, so the roll that picks between the three is the same roll
    // it always was and the sheaves did not grow to fill the gap.
    //
    // The sarsen is cut hardest because it was the worst of it: a low poly
    // rock blob at 467 a square kilometre. And it was the FALLBACK as well,
    // since it is the one kind of the Greenwold that stands on any slope at
    // all and `stubborn` walks its list slope first. Counted over the 31 by 31
    // chunk square, 742 of the 1841 sarsens standing there came through
    // `stubborn` and not off the scatter grid, which is why the veto had to be
    // asked in both places.
    K('beehive', 'hive', 0.9, { weight: 2, slope: 0.3, rare: 0.095 }),
    K('sheaf', 'sheaf', 1.4, { weight: 3, slope: 0.28, only: 'worked' }),
    K('sarsen', 'boulder', 1.9, { weight: 4, slope: RUGGED, sink: 0.3, rare: 0.008 }),
  ],
  // A jungle of flowering giants. Nothing straight, everything overgrown.
  verdant: [
    A('fallen_giant', 'log', 12, { weight: 3, slope: 0.3, sink: 0.5 }),
    A('root_arch', 'roots', 6.5, { weight: 3, slope: 0.4 }),
    A('giant_mushroom', 'mushroom', 4.0, { weight: 2, slope: 0.3 }),
    A('carved_face', 'face', 3.2, { weight: 2, slope: 0.5, sink: 0.4 }),
    A('rope_bridge_stub', 'bridgestub', 5.0, { weight: 1, slope: 0.45 }),
    K('buttress_root', 'buttress', 3.6, { weight: 3, slope: 0.6 }),
    K('vine_curtain', 'vines', 4.6, { weight: 3, slope: 0.75 }),
    K('mushroom_ring', 'mushroom', 1.2, { weight: 3, slope: 0.5 }),
    K('moss_boulder', 'boulder', 2.0, { weight: 3, slope: RUGGED, sink: 0.3 }),
    K('court_lantern', 'lantern', 2.6, { weight: 1, slope: 0.3, near: 'site' }),
  ],
  // Fen inland, a thousand islets seaward. Everything here is fishing tackle
  // or the wreck of something that went fishing.
  saltmarch: [
    A('wreck', 'wreck', 10, { weight: 3, slope: 0.22, sink: 0.8 }),
    A('upturned_boat', 'boat', 5.2, { weight: 2, slope: 0.24, sink: 0.25 }),
    A('jetty', 'jetty', 8.0, { weight: 2, slope: 0.10, require: 'shore' }),
    A('salt_pan', 'flat', 7.0, { weight: 2, slope: 0.06, sink: 0.05 }),
    A('reed_bed', 'reeds', 2.4, { weight: 3, slope: 0.2, run: { n: [5, 12], gap: 2.6, wander: 0.3 } }),
    K('net_stake', 'stake', 2.0, { weight: 3, slope: 0.4 }),
    K('drying_rack', 'rack', 3.2, { weight: 2, slope: 0.26 }),
    K('crab_pot', 'pot', 0.9, { weight: 3, slope: 0.45 }),
    K('mooring_post', 'post', 1.6, { weight: 2, slope: 0.4 }),
    K('driftwood', 'drift', 2.8, { weight: 3, slope: RUGGED, sink: 0.2 }),
  ],
  // Red rock, white sand, a sun too big, and the old people's work half
  // swallowed by both.
  emberwastes: [
    A('wind_stack', 'stack', 12, { weight: 3, slope: 0.45, sink: 0.6 }),
    A('sandstone_arch', 'arch', 11, { weight: 2, slope: 0.3, sink: 0.5 }),
    A('sandstone_pillar', 'pillar', 9.0, { weight: 3, slope: 0.4, sink: 0.5 }),
    A('obelisk', 'obelisk', 7.0, { weight: 2, slope: 0.2, sink: 0.4 }),
    A('buried_wall', 'burywall', 6.0, { weight: 2, slope: 0.24, sink: 0.9, along: 'x', run: { n: [3, 7], gap: 5.0, wander: 0.12 } }),
    K('dead_tree', 'deadtree', 4.4, { weight: 2, slope: 0.45 }),
    K('bleached_bones', 'bones', 2.4, { weight: 3, slope: 0.5, sink: 0.2 }),
    K('sun_skull', 'skull', 1.8, { weight: 2, slope: 0.45, sink: 0.2 }),
    K('waste_cairn', 'cairn', 1.4, { weight: 2, slope: RUGGED, near: 'road' }),
    K('broken_cart', 'cart', 3.2, { weight: 1, slope: 0.26, near: 'road' }),
  ],
  // Heather moor into granite, weather crossing in walls, a cairn for every
  // rider who did not come back.
  stormpeaks: [
    A('rider_cairn', 'cairn', 3.4, { weight: 3, slope: 0.55, near: 'road' }),
    A('totem', 'totem', 5.2, { weight: 2, slope: 0.4 }),
    A('broken_column', 'pillar', 4.6, { weight: 2, slope: 0.45, sink: 0.4 }),
    A('eyrie_nest', 'nest', 3.4, { weight: 1, slope: 0.7, require: 'steep' }),
    A('post_fence', 'fence', 2.6, { weight: 3, slope: 0.6, along: 'x', run: { n: [5, 11], gap: 2.6, wander: 0.18 } }),
    K('cairn', 'cairn', 2.2, { weight: 3, slope: 0.8 }),
    K('prayer_stone', 'stele', 1.6, { weight: 3, slope: 0.7 }),
    K('slate_slab', 'slab', 2.4, { weight: 3, slope: 0.8, sink: 0.3 }),
    K('scree_boulder', 'boulder', 2.8, { weight: 3, slope: RUGGED, sink: 0.35 }),
    K('banner_pole', 'banner', 4.6, { weight: 1, slope: 0.45, near: 'site' }),
  ],
  // Nine dragons fell here and nothing has moved them. Every point of this
  // realm has to read as a graveyard, so the anchors are the bones themselves
  // and the scatter is what the wind has uncovered.
  boneyard: [
    A('rib_cage', 'ribcage', 12, { weight: 4, slope: 0.26, sink: 0.7 }),
    A('rib_arch', 'ribarch', 10, { weight: 4, slope: 0.34, sink: 0.5 }),
    A('dragon_skull', 'skull', 6.5, { weight: 3, slope: 0.3, sink: 0.6 }),
    A('spine', 'vertebra', 2.6, { weight: 4, slope: 0.45, sink: 0.35, run: { n: [10, 18], gap: 2.9, wander: 0.09 } }),
    A('half_giant', 'mound', 5.4, { weight: 2, slope: 0.4, sink: 1.1 }),
    A('bone_tree', 'deadtree', 5.6, { weight: 2, slope: 0.5 }),
    K('bone_stake', 'bonestake', 2.6, { weight: 3, slope: 0.6 }),
    K('ash_drift', 'drift', 6.0, { weight: 3, slope: 0.3, sink: 0.5 }),
    K('bone_shard', 'bones', 1.6, { weight: 4, slope: RUGGED, sink: 0.2 }),
    K('tomb_slab', 'slab', 2.2, { weight: 2, slope: 0.55, sink: 0.3 }),
    K('bone_cairn', 'cairn', 1.8, { weight: 2, slope: 0.7, near: 'road' }),
  ],
  // Glaciers to the waterline, black pine under white, and everything the
  // cold caught in the middle of doing something.
  frostreach: [
    A('ice_shard', 'shard', 6.5, { weight: 3, slope: 0.55, sink: 0.5 }),
    A('frozen_pine', 'pine', 7.5, { weight: 3, slope: 0.55 }),
    A('snowed_wreck', 'wreck', 8.5, { weight: 2, slope: 0.24, sink: 1.0 }),
    A('frozen_fall', 'fall', 10, { weight: 2, slope: 0.9, sink: 0.4, require: 'steep' }),
    A('iced_standing_stone', 'icestone', 4.2, { weight: 2, slope: 0.5, sink: 0.4 }),
    A('mammoth_ribs', 'ribarch', 5.4, { weight: 1, slope: 0.34, sink: 0.6 }),
    K('ice_splinter', 'shard', 2.2, { weight: 4, slope: RUGGED, sink: 0.3 }),
    K('snow_drift', 'drift', 5.0, { weight: 3, slope: 0.4, sink: 0.6 }),
    K('frozen_stake', 'stake', 2.2, { weight: 2, slope: 0.55 }),
    K('rime_cairn', 'cairn', 1.8, { weight: 2, slope: 0.7, near: 'road' }),
  ],
  // A city under clear water, and its marble washed up on every reef.
  sunkenkingdom: [
    A('marble_column', 'pillar', 8.0, { weight: 3, slope: 0.34, sink: 0.5 }),
    A('marble_arch', 'arch', 9.0, { weight: 2, slope: 0.3, sink: 0.5 }),
    A('fallen_column', 'drums', 2.8, { weight: 3, slope: 0.3, sink: 0.4, run: { n: [3, 6], gap: 2.4, wander: 0.06 } }),
    A('drowned_statue', 'statue', 4.4, { weight: 2, slope: 0.32, sink: 0.4 }),
    A('broken_pediment', 'slab', 4.2, { weight: 2, slope: 0.35, sink: 0.5 }),
    K('coral_head', 'coral', 2.6, { weight: 3, slope: RUGGED, sink: 0.2 }),
    K('sea_glass', 'glass', 0.8, { weight: 3, slope: 0.5, sink: 0.1 }),
    K('amphora', 'amphora', 1.3, { weight: 3, slope: 0.4 }),
    K('mosaic_slab', 'flat', 3.2, { weight: 2, slope: 0.12, sink: 0.1 }),
    K('anchor_stone', 'boulder', 1.7, { weight: 2, slope: 0.6, sink: 0.3 }),
  ],
  // Black glass, rivers of red, and the Legion's leavings rusting on both.
  ashenthrone: [
    A('obsidian_spire', 'shard', 10, { weight: 3, slope: 0.6, sink: 0.6 }),
    A('black_pillar', 'pillar', 8.0, { weight: 3, slope: 0.4, sink: 0.5 }),
    A('brass_pipe', 'pipe', 6.0, { weight: 2, slope: 0.45, sink: 0.4 }),
    A('legion_banner', 'banner', 5.2, { weight: 2, slope: 0.4, near: 'road' }),
    A('slag_heap', 'mound', 4.4, { weight: 3, slope: 0.45, sink: 0.5 }),
    A('cinder_cone', 'cone', 3.6, { weight: 2, slope: 0.45, sink: 0.3 }),
    K('obsidian_shard', 'shard', 4.0, { weight: 4, slope: RUGGED, sink: 0.4 }),
    K('lava_vent', 'vent', 2.2, { weight: 3, slope: 0.45, sink: 0.3 }),
    K('brass_wreck', 'brasswreck', 3.4, { weight: 3, slope: 0.5, sink: 0.3 }),
    K('charred_bones', 'bones', 1.6, { weight: 3, slope: 0.55, sink: 0.2 }),
  ],
};

// Every realm that farms carries the nine field kinds on the end of its own
// kit. Done here, once, so a tenth realm added to FIELDS_PER cannot forget
// them and `auditKits` fails loudly if one ever goes missing.
for (const realm of FARM_REALMS) {
  if (!KITS[realm]) throw new Error(`dressing: FIELDS_PER names ${realm}, which has no kit`);
  KITS[realm] = KITS[realm].concat(FIELD_KIT.map((k) => ({ ...k })));
}

/** How thick a realm's scatter is, on top of SCATTER_CHANCE. */
export const DENSITY = {
  greenwold: 1.0,
  verdant: 1.15,
  saltmarch: 1.0,
  emberwastes: 0.9,
  stormpeaks: 1.0,
  boneyard: 1.15,
  frostreach: 0.9,
  sunkenkingdom: 0.85,
  ashenthrone: 1.0,
};

/** Every kind in the world, once, as `realm:kind`. */
export const ALL_KINDS = Object.entries(KITS).flatMap(([r, list]) => list.map((k) => `${r}:${k.kind}`));

/** The kit of a realm. Falls back to the Greenwold's, which is the world's default country. */
export function kitFor(realm) { return KITS[realm] || KITS.greenwold; }

const anchorCache = new Map(), scatterCache = new Map();
const tierOf = (realm, tier) => {
  const cache = tier === 'anchor' ? anchorCache : scatterCache;
  let list = cache.get(realm);
  if (!list) { list = kitFor(realm).filter((k) => k.tier === tier); cache.set(realm, list); }
  return list;
};

// ------------------------------------------------------------- the realm --

/**
 * Which realm's things lie here, and how much of that realm this point is in.
 *
 * Inside a realm this is the realm and its weight. Outside every realm, on the
 * wild ground between them, it is the realm whose own reach this point is
 * least far outside, at weight 0, so the country between the Boneyard and
 * Frostreach thins out of bones and into ice rather than stopping dead at a
 * line.
 */
export function realmAt(x, z) {
  let best = REALM_ZONES[0], bestScore = -Infinity, bestW = 0;
  for (let i = 0; i < REALM_ZONES.length; i++) {
    const zn = REALM_ZONES[i];
    const reach = zn.r + zn.edge;
    const d = Math.hypot(x - zn.x, z - zn.z);
    const score = 1 - d / reach;
    if (score > bestScore) { bestScore = score; best = zn; bestW = weightOf(zn, x, z); }
  }
  return { id: best.id, weight: bestW };
}

/** Density falls off outside a realm rather than stopping. */
export const densityAt = (realm, weight) => (DENSITY[realm] ?? 1) * (0.45 + 0.55 * clamp01(weight));

// --------------------------------------------------------------- the gate --

/**
 * Everything the gate asks that is NOT about slope, in the order it asks it.
 *
 * Split out of `openAt` for one reason and it is a real one: a field's gate
 * takes sixteen probes and does not want the slope under any of them, because
 * a field is judged on its GRADE from corner to corner and not on the six
 * metre rise under one point of it. Reading the slope anyway costs four more
 * height samples a probe, which is two thirds of the whole cost of laying a
 * farm out. `openAt` is this plus the slope rules, so there is one rule set
 * and two ways in, and no chance of the two drifting.
 *
 * Returns { ok, why, s, slope } with slope 0: the caller that wants a slope
 * asks `openAt`.
 */
export function probeAt(field, x, z, sites = null, fields = null) {
  const s = field.sampleAt(x, z);
  if (s.water) return { ok: false, why: 'water', s, slope: 0 };
  if (s.h < SHORE_LINE) return { ok: false, why: 'surf', s, slope: 0 };
  if (x * x + z * z < HOME_RADIUS * HOME_RADIUS) return { ok: false, why: 'home', s, slope: 0 };
  // The pad is asked before the road, because a road runs INTO a town and
  // `sample.road` is still the raw strength on a town square. Both refuse; the
  // pad is the truer answer and the one worth reporting.
  const own = s.site;
  if (own && inPad(own, x, z)) return { ok: false, why: 'pad', s, slope: 0 };
  if (sites) for (let i = 0; i < sites.length; i++) if (inPad(sites[i], x, z)) return { ok: false, why: 'pad', s, slope: 0 };
  if (s.road > ROAD_KEEP) return { ok: false, why: 'road', s, slope: 0 };
  if (fields) for (let i = 0; i < fields.length; i++) if (inField(fields[i], x, z, FIELD_KEEP)) return { ok: false, why: 'field', s, slope: 0 };
  return { ok: true, why: null, s, slope: 0 };
}

/**
 * May this kind stand here?
 *
 * One function, called by the placement and by the test, so what the test
 * proves about the gate is what the world does. `sites` is the short list of
 * sites near this chunk; the sample's own site is checked as well, so the gate
 * is right even with no list at all.
 *
 * `fields` is the short list of farm fields near this chunk. A prop that is
 * not part of a field keeps out of one, so nothing stands in the standing corn.
 *
 * Returns { ok, why, s, slope }. `why` names the first rule that refused.
 */
export function openAt(field, x, z, spec, sites = null, fields = null) {
  const p = probeAt(field, x, z, sites, fields);
  if (!p.ok) return p;
  const s = p.s;
  const e = SLOPE_STEP;
  const hx = field.heightAt(x + e, z) - field.heightAt(x - e, z);
  const hz = field.heightAt(x, z + e) - field.heightAt(x, z - e);
  const slope = Math.hypot(hx, hz) / (2 * e);
  if (spec) {
    if (slope > spec.slope) return { ok: false, why: 'slope', s, slope };
    if (spec.require === 'steep' && slope < 0.32) return { ok: false, why: 'flat', s, slope };
    if (spec.require === 'shore' && s.h > 3.0) return { ok: false, why: 'inland', s, slope };
  }
  return { ok: true, why: null, s, slope };
}

/**
 * Is any farm field within WORKED_REACH of this point?
 *
 * The one question `only: 'worked'` turns on, and it is asked of the FIELDS a
 * chunk already laid out, so it costs a rectangle test a field and nothing at
 * all out in the open country, where the list is empty.
 */
export function workedAt(fields, x, z) {
  if (!fields) return false;
  for (let i = 0; i < fields.length; i++) if (inField(fields[i], x, z, WORKED_REACH)) return true;
  return false;
}

/** Is (x, z) inside this field, grown by `pad` metres on every side? */
export function inField(f, x, z, pad = 0) {
  const dx = x - f.x, dz = z - f.z;
  const u = dx * f.ca + dz * f.sa, v = -dx * f.sa + dz * f.ca;
  return Math.abs(u) <= f.hw + pad && Math.abs(v) <= f.hh + pad;
}

/** A site's pad plus its margin. A mine's mouths keep their own room too. */
export function inPad(site, x, z) {
  if (inPlannedPlace(site, x, z)) return true;   // P1: a painted place dresses itself
  const r = (site.flatR != null ? site.flatR : SITE_CLEAR) + PAD_MARGIN;
  if ((x - site.x) ** 2 + (z - site.z) ** 2 < r * r) return true;
  if (site.mouths) {
    for (const m of site.mouths) {
      const mr = (m.flatR != null ? m.flatR : 6) + PAD_MARGIN;
      if ((x - m.x) ** 2 + (z - m.z) ** 2 < mr * mr) return true;
    }
  }
  return false;
}

// ------------------------------------------------------------- the farms --
//
// A field is not rolled on a grid. It is laid out AROUND A SETTLEMENT, which
// is the only way the rule "every village has farmland and the country between
// two villages does not" can be true of both halves at once.
//
// One settlement gets one BLOCK: a grid of two to four equal rectangles on one
// bearing, sharing their boundaries, standing clear of the village's own pad
// and wholly inside FIELD_REACH of it. The block is tried on FIELD_TRIES
// bearings, shrinking as it goes, and the first bearing that keeps a field
// wins. A cell that the ground refuses is simply dropped, so a block of four
// against a wood comes out as a block of two, which is what a real farm does.
//
// WHAT THE GROUND HAS TO BE, and all of it is measured, none of it assumed:
//
//   meadow        `sampleAt().biome` at every probe. Not the desert, not the
//                 snow, not the fen, not the beach and not the rock
//   dry           no probe in water, in the surf, or in a river
//   flat          FIELD_GRADE across the whole rectangle, corner to corner
//   nobody's      no probe on a site's pad or in the home clear
//   no road       measured against the ROAD GEOMETRY and not against a grid of
//                 samples: `roadCrosses` walks every segment of every road
//                 whose box touches the field and asks whether it passes
//                 through the rectangle. A road is six metres wide and a probe
//                 grid twenty metres across would step over one
//   no wood       `arbor.standAt(biome, x, z, seed).cover` is 0 at every probe.
//                 That is flora's OWN function, the one that decides where a
//                 tree may grow, imported rather than copied: a tree stands
//                 where its cell's roll comes in under that cover, so a cover
//                 of zero everywhere inside the rectangle means no stand of
//                 trees reaches into the field. What CAN still stand in one is
//                 flora's lone tree, at most one to a sixty metre square of
//                 open ground, which is an oak in the middle of a field and is
//                 the right answer anyway
//
// The layout is cached per (seed, settlement), because a field is four hundred
// metres across and something like a hundred and fifty chunks can see one.

/** A world direction as the yaw that lays a body's local +X along it. */
export const ryAlong = (dx, dz) => Math.atan2(-dz, dx);

/** Pick from a [[id, weight], ...] table with a roll in [0, 1). */
function pickTable(table, u) {
  let total = 0;
  for (const row of table) total += row[1];
  let t = u * total;
  for (const row of table) { t -= row[1]; if (t <= 0) return row[0]; }
  return table[table.length - 1][0];
}

/**
 * Does any road pass through this rectangle?
 *
 * Exact, and it has to be: `sampleAt().road` is above ROAD_KEEP only within
 * about three metres of a centreline, so a probe grid coarse enough to be
 * affordable would step clean over a road and lay a field across it. So the
 * road's own segments are walked instead, each one tested against the
 * rectangle in the rectangle's own frame, grown by the road's half width and a
 * verge.
 */
export function roadCrosses(field, f) {
  const reach = Math.hypot(f.hw, f.hh) + ROAD_HALF_WIDTH + 2;
  const roads = roadsOverlapping(field, f.x - reach, f.z - reach, f.x + reach, f.z + reach);
  if (!roads.length) return false;
  const hw = f.hw + ROAD_HALF_WIDTH + 1, hh = f.hh + ROAD_HALF_WIDTH + 1;
  const local = (x, z) => {
    const dx = x - f.x, dz = z - f.z;
    return [dx * f.ca + dz * f.sa, -dx * f.sa + dz * f.ca];
  };
  for (const r of roads) {
    for (const g of r.segs) {
      const [ax, az] = local(g.x0, g.z0);
      const [bx, bz] = local(g.x0 + g.dx, g.z0 + g.dz);
      if (segHitsBox(ax, az, bx, bz, hw, hh)) return true;
    }
  }
  return false;
}

/** Does the segment (ax, az)-(bx, bz) touch the box [-hw, hw] x [-hh, hh]? */
function segHitsBox(ax, az, bx, bz, hw, hh) {
  if (Math.abs(ax) <= hw && Math.abs(az) <= hh) return true;
  if (Math.abs(bx) <= hw && Math.abs(bz) <= hh) return true;
  if ((ax < -hw && bx < -hw) || (ax > hw && bx > hw)) return false;
  if ((az < -hh && bz < -hh) || (az > hh && bz > hh)) return false;
  // the slab test: the segment's parameter range that lies inside each slab
  const dx = bx - ax, dz = bz - az;
  let t0 = 0, t1 = 1;
  for (const [p, q0, q1] of [[dx, -hw - ax, hw - ax], [dz, -hh - az, hh - az]]) {
    if (Math.abs(p) < 1e-9) { if (q0 > 0 || q1 < 0) return false; continue; }
    let lo = q0 / p, hi = q1 / p;
    if (lo > hi) { const t = lo; lo = hi; hi = t; }
    if (lo > t0) t0 = lo;
    if (hi < t1) t1 = hi;
    if (t0 > t1) return false;
  }
  return true;
}

/**
 * May a field lie on this rectangle? The one gate, called by the layout and by
 * the test, so what the test proves is what the world does.
 *
 * Returns `{ ok, why, grade, lo, hi }`.
 */
export function fieldGate(field, f, sites = null, n = FIELD_PROBE) {
  // A PAD IS NOT ASKED ON THE PROBE GRID. `inPad` is a circle and a field is a
  // rectangle, so a grid of sixteen probes can step round the edge of a pad
  // and leave a corner of the field inside the village green: three of the
  // Greenwold's own farms did exactly that, by less than a metre. The circle
  // the field is inscribed in is compared against the pad's circle instead,
  // which is a little conservative and exactly right, and needs no probes.
  const reachR = Math.hypot(f.hw, f.hh);
  if (sites) {
    for (let i = 0; i < sites.length; i++) {
      const st = sites[i];
      const padR = (st.flatR != null ? st.flatR : SITE_CLEAR) + PAD_MARGIN;
      if (Math.hypot(st.x - f.x, st.z - f.z) < padR + reachR) return { ok: false, why: 'pad', grade: 0 };
      if (st.mouths) for (const m of st.mouths) {
        const mr = (m.flatR != null ? m.flatR : 6) + PAD_MARGIN;
        if (Math.hypot(m.x - f.x, m.z - f.z) < mr + reachR) return { ok: false, why: 'pad', grade: 0 };
      }
    }
  }
  // THE WOOD IS ASKED FIRST, and the order is a measurement and not a habit.
  // `arbor.standAt` is a fifth the price of a ground sample, and a stand of
  // trees is what refuses most candidate rectangles by a wide margin: 556 of
  // 800 refusals in the first sweep of the Greenwold. Asking it first turns
  // most failures into six microseconds instead of thirty.
  //
  // It is asked as 'meadow' because the rectangle has to BE meadow to pass at
  // all, and the ground pass below refuses anything that is not. Using the
  // real biome here would cost a ground sample to find out what it was, which
  // is the sample this pass exists to avoid.
  const w = Math.max(n, FIELD_WOOD_PROBE);
  for (let j = 0; j < w; j++) for (let i = 0; i < w; i++) {
    const u = (i / (w - 1) - 0.5) * 2 * f.hw;
    const v = (j / (w - 1) - 0.5) * 2 * f.hh;
    const x = f.x + u * f.ca - v * f.sa, z = f.z + u * f.sa + v * f.ca;
    if (standAt('meadow', x, z, field.seed).cover > 0) return { ok: false, why: 'wood', grade: 0 };
  }
  let lo = Infinity, hi = -Infinity;
  const span = Math.max(f.hw, f.hh) * 2;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const u = (i / (n - 1) - 0.5) * 2 * (f.hw - 1.5);
    const v = (j / (n - 1) - 0.5) * 2 * (f.hh - 1.5);
    const x = f.x + u * f.ca - v * f.sa, z = f.z + u * f.sa + v * f.ca;
    const g = probeAt(field, x, z, sites);
    if (!g.ok) return { ok: false, why: g.why, grade: 0 };
    if (g.s.biome !== 'meadow') return { ok: false, why: 'biome', grade: 0 };
    if (g.s.river > 0.05) return { ok: false, why: 'river', grade: 0 };
    if (g.s.h < lo) lo = g.s.h;
    if (g.s.h > hi) hi = g.s.h;
    // the grade can only grow, so a rectangle that is already too steep is
    // refused now rather than after the other twelve probes
    if (hi - lo > FIELD_GRADE * span) return { ok: false, why: 'grade', grade: (hi - lo) / span };
  }
  const grade = (hi - lo) / span;
  if (roadCrosses(field, f)) return { ok: false, why: 'road', grade, lo, hi };
  return { ok: true, why: null, grade, lo, hi };
}

const farmCache = new Map();
/** How many farm layouts are held before the oldest are let go. */
export const FARM_CACHE = 192;

/** Is this a place that farms, in a realm that farms? */
export function farms(site, realm) {
  return !!site && FARM_KINDS.has(site.kind) && (FIELDS_PER[realm] || 0) > 0;
}

/**
 * The fields of one settlement, and every prop standing in them.
 *
 * Deterministic in (seed, settlement) and nothing else, so every chunk that
 * can see a field builds the same field. Cached, because it costs real samples
 * and a hundred and fifty chunks ask for it.
 *
 * Returns `{ fields, props }`. A prop is `{ kind, x, z, ry, run, ri }` with no
 * height on it: the chunk that owns it takes the ground under it as it emits.
 */
export function farmFor(field, site, realm) {
  const key = `${field.seed}:${site.id}`;
  const had = farmCache.get(key);
  if (had) return had;
  const built = buildFarm(field, site, realm);
  if (farmCache.size >= FARM_CACHE) { const k = farmCache.keys().next().value; farmCache.delete(k); }
  farmCache.set(key, built);
  return built;
}

/** Throw away every remembered farm. For a test that changes the world. */
export function clearFarms() { farmCache.clear(); }
/** How many farms are remembered. */
export const farmsHeld = () => farmCache.size;

const EMPTY_FARM = Object.freeze({ fields: [], props: [] });

function buildFarm(field, site, realm) {
  const seed = field.seed;
  // The layout asks the world for its OWN neighbours rather than taking the
  // chunk's list. A field lies four hundred metres from its village and a
  // chunk's list reaches two hundred, so a layout built off the caller's list
  // would come out differently depending on which chunk asked for it first.
  // That is the whole of determinism, so it is not a shortcut worth taking.
  const sites = sitesNearField(field, site.x, site.z, FIELD_REACH + 160);
  const h = (salt) => rand2(site.cx ?? Math.round(site.x), site.cz ?? Math.round(site.z), seed + salt);
  const want = FIELDS_PER[realm] || 0;
  if (!want) return EMPTY_FARM;
  const pad = (site.flatR != null ? site.flatR : SITE_CLEAR) + PAD_MARGIN + FIELD_STANDOFF;
  const base = h(71) * Math.PI * 2;
  // THE SEARCH GROWS A FARM, it does not roll one.
  //
  // The first draft rolled a whole two by two block on one bearing and took
  // the first bearing that kept anything. Two things were wrong with that and
  // both showed up in the measurement: a block a hundred and thirty six metres
  // across almost never fits, so the search fell down its ladder to a single
  // small plot, and a bearing that kept one cell of four still counted as a
  // win, so the search stopped there and nothing ever clustered. Fourteen of
  // sixteen Greenwold villages got a farm and thirteen of those farms were one
  // field.
  //
  // So: find ONE field, which is a small ask and nearly always possible, then
  // GROW it. A neighbour is the same rectangle one field over on the same
  // bearing, which is why they share a boundary rather than lie near each
  // other. Ground that refuses simply stops the growth on that side.
  // The seed field is looked for on every bearing, at three distances out, at
  // four sizes, biggest first. The distances matter: a village ringed by wood
  // at a hundred metres often has open ground at two hundred and fifty.
  //
  // TWO THINGS KEEP THE COST DOWN, and both are measured rather than assumed.
  // A screen probe at the candidate's own centre throws out the sea, the
  // mountain, the road and everything that is not meadow for one sample rather
  // than sixteen. And FIELD_GATES caps the whole rectangle gates one
  // settlement may run, so a village on impossible ground gives up instead of
  // walking the whole ladder.
  // How big this village's fields are is ITS OWN roll, so one place works
  // thirty two metre plots and the next works sixty. The rest of the ladder
  // follows in ascending order, because a small rectangle is easier to fit and
  // easier to GROW a neighbour onto: seeding with the biggest size first found
  // one big field and then failed to grow it, and the Greenwold came out with
  // 31 fields over 16 villages instead of 46.
  // FIELD_MIN and FIELD_MAX are the promise, and this is the ladder that has to
  // keep it. Thrown here rather than left to a test, so a fifth size added by
  // somebody in a hurry cannot ship a twenty metre plot.
  const SIZES = FIELD_SIZES;
  const first = SIZES[Math.floor(h(85) * SIZES.length) % SIZES.length];
  const halves = [first, ...SIZES.filter((v) => v !== first)];
  let seed0 = null, spent = 0;
  for (let b = 0; b < FIELD_BANDS && !seed0; b++) {
    for (let t = 0; t < FIELD_TRIES && !seed0 && spent < FIELD_GATES; t++) {
      const a = base + t * 2.3999632;                  // the golden angle, so no two tries share a bearing
      const ca = Math.cos(a), sa = Math.sin(a);
      for (const half of halves) {
        const hd = half * Math.SQRT2;
        // the band spans the whole ground the promise allows: from the edge of
        // the village's own standoff out to where the far corner would leave
        // FIELD_REACH. Tannerford's only open ground is three hundred and
        // sixty five metres out, and a search that only ever looked at the
        // near two hundred left the town with no farm at all
        const d0 = pad + hd, d1 = FIELD_REACH - hd;
        if (d1 < d0) continue;
        const d = FIELD_BANDS > 1 ? d0 + (d1 - d0) * (b / (FIELD_BANDS - 1)) : d0;
        const bx = site.x + ca * d, bz = site.z + sa * d;
        const screen = probeAt(field, bx, bz, sites);
        // the screen point moves with the size, because a small field sits
        // closer in, so a refusal is a refusal of THIS rectangle and not of
        // the bearing: the next size down is still worth asking
        if (!screen.ok || screen.s.biome !== 'meadow') continue;
        spent++;
        const f = { id: `${site.id}:0,0`, i: 0, j: 0, hw: half, hh: half, a, ca, sa, x: bx, z: bz };
        if (!fieldGate(field, f, sites).ok) continue;
        seed0 = { a, ca, sa, bx, bz, half, f };
        break;
      }
    }
  }
  if (!seed0) return EMPTY_FARM;

  const { a, ca, sa, bx, bz, half } = seed0;
  const kept = [seed0.f];
  const taken = new Set(['0,0']);
  // sideways first, then the corner that closes a two by two, then back the
  // other way: a farm grows along the contour before it grows across it
  const GROW = [[1, 0], [0, 1], [1, 1], [-1, 0], [0, -1], [-1, 1], [1, -1], [-1, -1]];
  for (const [gi, gj] of GROW) {
    if (kept.length >= want) break;
    const key = gi + ',' + gj;
    if (taken.has(key)) continue;
    const u = gi * half * 2, v = gj * half * 2;
    const f = {
      id: `${site.id}:${key}`, i: gi, j: gj, hw: half, hh: half, a, ca, sa,
      x: bx + u * ca - v * sa, z: bz + u * sa + v * ca,
    };
    if (Math.hypot(f.x - site.x, f.z - site.z) + half * Math.SQRT2 > FIELD_REACH) continue;
    // a farm grows outward and sideways, never back over the village green
    if (Math.hypot(f.x - site.x, f.z - site.z) - half * Math.SQRT2 < pad) continue;
    if (!fieldGate(field, f, sites).ok) continue;
    taken.add(key);
    kept.push(f);
  }
  const best = { a, ca, sa, bx, bz, half, kept };

  const fields = best.kept;
  const props = [];
  const gated = new Set();

  // --- the boundaries. One run per EDGE of the block's lattice, so a wall two
  // fields share is built once and the two fields really do share it.
  const edges = [];
  const edgeOf = (key, x0, z0, x1, z1, fid) => { if (!edges.some((e) => e.key === key)) edges.push({ key, x0, z0, x1, z1, fid }); };
  const world = (u, v) => [best.bx + u * best.ca - v * best.sa, best.bz + u * best.sa + v * best.ca];
  const bhalf = best.half;
  for (const f of fields) {
    const u0 = f.i * bhalf * 2 - bhalf, u1 = u0 + bhalf * 2;
    const v0 = f.j * bhalf * 2 - bhalf, v1 = v0 + bhalf * 2;
    const [ax, az] = world(u0, v0), [bx2, bz2] = world(u1, v0);
    const [cx2, cz2] = world(u1, v1), [dx2, dz2] = world(u0, v1);
    edgeOf(`h:${f.j}:${f.i}`, ax, az, bx2, bz2, f.id);
    edgeOf(`h:${f.j + 1}:${f.i}`, dx2, dz2, cx2, cz2, f.id);
    edgeOf(`v:${f.i}:${f.j}`, ax, az, dx2, dz2, f.id);
    edgeOf(`v:${f.i + 1}:${f.j}`, bx2, bz2, cx2, cz2, f.id);
  }

  const bound = pickTable(BOUNDS, h(73));
  const runs = new Map();
  for (const e of edges) {
    const dx = e.x1 - e.x0, dz = e.z1 - e.z0;
    const len = Math.hypot(dx, dz);
    const n = Math.max(3, Math.round(len / BOUND_GAP));
    const ux = dx / len, uz = dz / len;
    const ry = ryAlong(ux, uz);
    const runId = `f:${site.id}:${e.key}`;
    const steps = [];
    for (let i = 0; i <= n; i++) {
      const x = e.x0 + ux * (len * i / n), z = e.z0 + uz * (len * i / n);
      steps.push([x, z]);
      props.push({ kind: bound, x, z, ry, run: runId, ri: i, fid: e.fid });
    }
    runs.set(e.key, { runId, steps, n, ry });
  }

  // --- the gate. One a field, in the boundary that faces the village, and it
  // is a GAP IN A RUN and never a thing standing on its own: the boundary
  // segment at that step is taken out and the gate put in its place.
  for (const f of fields) {
    const toward = Math.atan2(site.z - f.z, site.x - f.x);
    const sides = [
      [`h:${f.j}:${f.i}`, best.a + Math.PI / 2],
      [`h:${f.j + 1}:${f.i}`, best.a - Math.PI / 2],
      [`v:${f.i}:${f.j}`, best.a + Math.PI],
      [`v:${f.i + 1}:${f.j}`, best.a],
    ];
    // the side whose outward bearing points nearest the village, first
    sides.sort((p, q) => Math.abs(angleGap(p[1], toward)) - Math.abs(angleGap(q[1], toward)));
    let put = null;
    for (const [key] of sides) {
      if (gated.has(key)) continue;
      const R = runs.get(key);
      if (!R || R.n < 4) continue;
      put = { key, R };
      break;
    }
    if (!put) continue;
    gated.add(put.key);
    const R = put.R;
    const gi = 1 + Math.floor(rand2(f.i * 17 + 3, f.j * 23 + 5, seed + 74) * (R.n - 2));
    const [ax, az] = R.steps[gi - 1], [bx2, bz2] = R.steps[gi + 1];
    const kind = rand2(f.i * 5 + 1, f.j * 7 + 2, seed + 75) < 0.72 ? 'field_gate' : 'stile';
    // the boundary segment that stood here goes, and the gate takes its index
    const at = props.findIndex((q) => q.run === R.runId && q.ri === gi);
    if (at >= 0) props.splice(at, 1);
    props.push({ kind, x: (ax + bx2) / 2, z: (az + bz2) / 2, ry: R.ry, run: R.runId, ri: gi, gap: true, fid: f.id });
    f.gate = { x: (ax + bx2) / 2, z: (az + bz2) / 2, ry: R.ry };
  }

  // --- the crop, in rows along the field's own long axis
  for (const f of fields) {
    const crop = pickTable(CROPS, rand2(f.i * 11 + 1, f.j * 13 + 1, seed + 76));
    const rows = Math.max(2, Math.floor((f.hh * 2 - 4) / ROW_GAP));
    const segs = Math.max(1, Math.floor((f.hw * 2 - 4) / ROW_SEG));
    const ry = ryAlong(f.ca, f.sa);
    for (let rI = 0; rI < rows; rI++) {
      const v = -f.hh + 2.4 + rI * ROW_GAP;
      if (v > f.hh - 2.4) break;
      for (let sI = 0; sI < segs; sI++) {
        const u = -f.hw + 2.2 + (sI + 0.5) * ROW_SEG;
        if (u > f.hw - 2.2) break;
        props.push({ kind: crop, x: f.x + u * f.ca - v * f.sa, z: f.z + u * f.sa + v * f.ca, ry, run: null, ri: 0, fid: f.id });
      }
    }
    f.crop = crop;

    // --- the scarecrow: one a field, near the middle, a crow on its arm one
    // time in three
    const su = (rand2(f.i * 3 + 7, f.j * 3 + 9, seed + 77) - 0.5) * f.hw * 0.7;
    const sv = (rand2(f.i * 3 + 11, f.j * 3 + 13, seed + 78) - 0.5) * f.hh * 0.7;
    const crow = rand2(f.i * 19 + 2, f.j * 29 + 4, seed + 79) < 1 / 3;
    props.push({
      kind: crow ? 'crowed_scarecrow' : 'scarecrow',
      x: f.x + su * f.ca - sv * f.sa, z: f.z + su * f.sa + sv * f.ca,
      ry: ryAlong(-f.ca, -f.sa), run: null, ri: 0, scare: true, fid: f.id,
    });
    f.scarecrow = true;

    // --- a rick in one corner, one time in two
    if (rand2(f.i * 31 + 6, f.j * 37 + 8, seed + 80) < 0.5) {
      const cu = (rand2(f.i, f.j, seed + 81) < 0.5 ? -1 : 1) * (f.hw - 4.5);
      const cv = (rand2(f.j, f.i, seed + 82) < 0.5 ? -1 : 1) * (f.hh - 4.5);
      props.push({
        kind: 'hay_rick', x: f.x + cu * f.ca - cv * f.sa, z: f.z + cu * f.sa + cv * f.ca,
        ry: rand2(f.i + 3, f.j + 5, seed + 83) * Math.PI * 2, run: null, ri: 0, fid: f.id,
      });
    }

    // --- a cart by the gate, one time in three, and OUTSIDE the boundary so
    // it stands in the lane and not in the corn
    if (f.gate && rand2(f.i * 41 + 3, f.j * 43 + 7, seed + 84) < 1 / 3) {
      const outX = f.gate.x - f.x, outZ = f.gate.z - f.z;
      const m = Math.hypot(outX, outZ) || 1;
      props.push({
        kind: 'cart', x: f.gate.x + (outX / m) * 3.4, z: f.gate.z + (outZ / m) * 3.4,
        ry: f.gate.ry + Math.PI / 2, run: null, ri: 0, fid: f.id,
      });
    }
  }

  return { fields, props };
}

/** The signed difference between two bearings, in [-PI, PI]. */
function angleGap(a, b) {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Every farm whose fields could reach into this chunk, laid out.
 *
 * The list is the settlements the chunk's own site query already handed over,
 * cut down to the ones that farm and are near enough for a field to touch the
 * chunk at all, so a chunk in open country pays one distance test a site.
 */
export function farmsNear(field, sites, x0, z0) {
  const midX = x0 + CHUNK / 2, midZ = z0 + CHUNK / 2;
  const reach = FIELD_REACH + CHUNK;
  const out = [];
  for (let i = 0; i < sites.length; i++) {
    const st = sites[i];
    if (!FARM_KINDS.has(st.kind)) continue;
    if ((st.x - midX) ** 2 + (st.z - midZ) ** 2 > reach * reach) continue;
    const realm = realmAt(st.x, st.z).id;
    if (!((FIELDS_PER[realm] || 0) > 0)) continue;
    const farm = farmFor(field, st, realm);
    if (farm.fields.length) out.push({ site: st, realm, farm });
  }
  return out;
}

// ---------------------------------------------------------------- placing --

function pickWeighted(list, u, near) {
  let total = 0;
  for (const k of list) total += k.weight * (k.near && k.near === near ? 2 : 1);
  let t = u * total;
  for (const k of list) {
    t -= k.weight * (k.near && k.near === near ? 2 : 1);
    if (t <= 0) return k;
  }
  return list[list.length - 1];
}

/**
 * The one anchor cell of a ring lattice cell that may hold a fold or a pond,
 * its centre, and how loudly it claims the ground.
 *
 * Pure arithmetic on the lattice coordinates and the seed: four hashes, no
 * ground sampled, so any chunk can work out any neighbour's nominee for less
 * than a height read costs. That is what makes the spacing rule local.
 */
export function ringNominee(lx, lz, seed) {
  const ax = Math.floor(rand2(lx, lz, seed + 41) * RING_CELLS) % RING_CELLS;
  const az = Math.floor(rand2(lx * 7 + 1, lz * 5 + 3, seed + 42) * RING_CELLS) % RING_CELLS;
  const cellX = lx * RING_CELLS + ax, cellZ = lz * RING_CELLS + az;
  return {
    cellX, cellZ,
    x: cellX * ANCHOR + ANCHOR / 2,
    z: cellZ * ANCHOR + ANCHOR / 2,
    pri: rand2(lx * 3 + 5, lz * 11 + 7, seed + 43),
  };
}

/**
 * May a ring shaped landmark stand in this anchor cell?
 *
 * Only the nominee of its own lattice cell, and only if no neighbouring
 * nominee within RING_GUARD claims the ground more loudly. Two survivors
 * within the guard would each have to be louder than the other, so there
 * cannot be two: the promise is proved by the rule and not by a sweep, and
 * `dressing_density.test.mjs` measures it anyway.
 *
 * A cell the ground then refuses is simply lost. The loser next door is not
 * promoted, because promotion is not local: it would have to know whether the
 * winner's ground was any good, which is the sampling this rule exists to
 * avoid. A parish with one fewer fold is the right price.
 */
export function ringOpen(cellX, cellZ, seed) {
  const lx = Math.floor(cellX / RING_CELLS), lz = Math.floor(cellZ / RING_CELLS);
  const me = ringNominee(lx, lz, seed);
  if (me.cellX !== cellX || me.cellZ !== cellZ) return false;
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dz) continue;
    const o = ringNominee(lx + dx, lz + dz, seed);
    if (Math.hypot(o.x - me.x, o.z - me.z) >= RING_GUARD) continue;
    // louder wins, and a dead heat is settled by the lattice coordinates so
    // that both cells come to the same answer about which of them it was
    if (o.pri > me.pri) return false;
    if (o.pri === me.pri && (dz < 0 || (dz === 0 && dx < 0))) return false;
  }
  return true;
}

/**
 * Is the kind this cell rolled really put down here?
 *
 * The two vetoes that run AFTER the pick, so a cell that refuses its own roll
 * stands empty instead of handing the ground to whatever was next in the pool.
 * `salt` differs per caller: the anchor roll, the fallback and the scatter all
 * ask this of the same cell coordinates, and one roll shared between them
 * would make the fallback's answer a reading of the roll's.
 */
export function wanted(spec, cellX, cellZ, seed, salt) {
  if (spec.spaced === 'ring' && !ringOpen(cellX, cellZ, seed)) return false;
  if (spec.rare < 1 && rand2(cellX * 5 + 3, cellZ * 3 + 7, salt) >= spec.rare) return false;
  return true;
}

/**
 * Every prop standing in one chunk.
 *
 * Deterministic in (seed, cx, cz) and nothing else: the same chunk builds the
 * same props every time, whichever direction the player walked in from.
 *
 * A record is `{ kind, realm, build, x, z, y, s, ry, tilt, run, ri, chunk }`, in
 * the shape dressing_models.js instances straight off. `y` is the ground under
 * the prop less its own sink, so a half buried giant is already half buried.
 */
export function dressingFor(field, cx, cz, opts = {}) {
  const seed = field.seed;
  const out = [];
  const chunk = cx + ',' + cz;
  const x0 = cx * CHUNK, z0 = cz * CHUNK;
  const per = CHUNK / ANCHOR;                 // anchor cells a side
  const sub = ANCHOR / SCATTER;               // scatter cells a side inside one
  const thin = opts.openThin ?? OPEN_THIN;
  // The site list reaches far enough to hold a village whose FIELDS reach this
  // chunk, which is further than the pad check ever needed. It is only widened
  // where something could actually farm: a wider radius touches more site
  // cells, and the FIRST chunk to touch a site cell pays for rolling it, so
  // the Boneyard would have paid for four hundred metres of ash it can grow
  // nothing in. The five points are the chunk's own centre and the four
  // compass points a field could reach it from; `realmAt` is pure arithmetic
  // over nine discs and costs nothing to ask five times.
  const midX0 = x0 + CHUNK / 2, midZ0 = z0 + CHUNK / 2;
  let sows = false;
  const R2 = FIELD_REACH * 0.7071;
  for (const [ox, oz] of [[0, 0], [FIELD_REACH, 0], [-FIELD_REACH, 0], [0, FIELD_REACH], [0, -FIELD_REACH],
    [R2, R2], [R2, -R2], [-R2, R2], [-R2, -R2]]) {
    if ((FIELDS_PER[realmAt(midX0 + ox, midZ0 + oz).id] || 0) > 0) { sows = true; break; }
  }
  const wide = sows ? CHUNK + FIELD_REACH : CHUNK + NEAR_SITE;
  const sites = opts.sites
    || (opts.sitesNear ? opts.sitesNear(x0 + CHUNK / 2, z0 + CHUNK / 2, wide)
      : sitesNearField(field, x0 + CHUNK / 2, z0 + CHUNK / 2, wide));

  // --- the farms. Laid out first, because everything else keeps out of them.
  const nearby = farmsNear(field, sites, x0, z0);
  const fields = [];
  for (const n of nearby) for (const f of n.farm.fields) fields.push(f);
  for (const n of nearby) emitFarm(out, field, n, cx, cz, chunk, sites);

  for (let az = 0; az < per; az++) for (let ax = 0; ax < per; ax++) {
    const cellX = cx * per + ax, cellZ = cz * per + az;
    const midX = cellX * ANCHOR + ANCHOR / 2, midZ = cellZ * ANCHOR + ANCHOR / 2;
    const realm = realmAt(midX, midZ);
    // What is near decides the pool BEFORE any kind is rolled, because a cart
    // and a signpost belong beside a road and nowhere else, and a hedgerow may
    // only START in one cell in five now that it is a hundred metres long.
    const j0x = (rand2(cellX, cellZ * 7, seed + 11) - 0.5) * 2 * JITTER * ANCHOR;
    const j0z = (rand2(cellX * 7, cellZ, seed + 12) - 0.5) * 2 * JITTER * ANCHOR;
    const probe0 = probeAt(field, midX + j0x, midZ + j0z, sites);
    const near = nearWhat(probe0, midX, midZ, sites);
    // D5: and whether this cell is on FARMED ground, which is the other half of
    // the pool question now. Free in open country, where `fields` is empty.
    const worked = workedAt(fields, midX, midZ);
    const anchors = poolFor(tierOf(realm.id, 'anchor'), near, cellX, cellZ, seed, worked);
    const scatters = poolFor(tierOf(realm.id, 'scatter'), near, cellX, cellZ, seed, worked);
    // Each try moves the candidate AND rolls a different kind, because the
    // ground refuses a kind, not a place: a cell too steep for a wreck may
    // still take a stack of reeds. When four tries have all been refused the
    // cell falls back to whichever of the kinds its pool still holds tolerates
    // the most slope, so an anchor cell stands empty over water, a road, a
    // pad, a field, the home clear, or because it rolled a kind that is meant
    // to be rare here and would rather leave the grass alone.
    //
    // THAT LAST ONE IS D4, and it is the difference between a thinner
    // Greenwold and the same Greenwold with different clutter in it. A cell
    // that rolls a hay rick and then loses the `rare` roll does NOT go round
    // again and it does NOT fall through to `stubborn`: it puts nothing down.
    // Rolling again would only hand the ground to the next kind along, which
    // is how the meadow filled up in the first place.
    //
    // AND THE VETO IS ASKED AFTER THE GROUND, not before it. Ask it first and
    // a cell that rolls a rick on ground too steep for one never gets to its
    // second try, so the hedgerows and the walls that used to win those tries
    // quietly go with the ricks: 21 per cent of the Greenwold's hedge, in the
    // first cut of D4, for a change that was supposed to be about ricks. Held
    // until the gate has passed, the veto takes away exactly the prop that
    // would have stood there and touches nothing else's turn.
    //
    // The cell the ring lattice nominated works the ring kinds and nothing
    // else. It was chosen to hold a fold or a pond, and leaving it to the
    // weighted roll threw six of every ten of them away on a hedgerow that
    // could have started in any of the other forty eight cells.
    const rings = anchors.filter((k) => k.spaced === 'ring');
    const ringCell = rings.length > 0 && ringOpen(cellX, cellZ, seed);
    let hit = null, refused = false;
    for (let t = 0; t < TRIES && !hit; t++) {
      const jx = t === 0 ? j0x : (rand2(cellX, cellZ * 7 + t, seed + 11) - 0.5) * 2 * JITTER * ANCHOR;
      const jz = t === 0 ? j0z : (rand2(cellX * 7 + t, cellZ, seed + 12) - 0.5) * 2 * JITTER * ANCHOR;
      const x = midX + jx, z = midZ + jz;
      const spec = pickWeighted(ringCell ? rings : anchors, rand2(cellX, cellZ * 13 + t, seed + 13), near);
      if (!spec) break;
      const gate = openAt(field, x, z, spec, sites, fields);
      if (!gate.ok) continue;
      if (!wanted(spec, cellX, cellZ, seed, seed + 26)) { refused = true; break; }
      hit = { spec, x, z, gate };
    }
    if (!hit && !refused) hit = stubborn(field, realm.id, cellX, cellZ, midX, midZ, seed, sites, near, fields, worked);
    if (hit) emit(out, field, hit.spec, hit.x, hit.z, cellX, cellZ, seed, realm.id, chunk, sites, fields, near);

    // the scatter under this anchor cell, thickened where a road or a place is
    // and thinned where neither is, which is the open country the user found
    // too full of things
    const dens = densityAt(realm.id, realm.weight) * (near === 'road' ? 1.9 : near === 'site' ? 1.6 : 1);
    const open = near === null && THIN_REALMS.has(realm.id) ? thin : 1;
    for (let sz = 0; sz < sub; sz++) for (let sx = 0; sx < sub; sx++) {
      const scX = cellX * sub + sx, scZ = cellZ * sub + sz;
      if (rand2(scX, scZ, seed + 21) > SCATTER_CHANCE * dens) continue;
      const jx = (rand2(scX, scZ, seed + 22) - 0.5) * 2 * JITTER * SCATTER;
      const jz = (rand2(scX, scZ, seed + 23) - 0.5) * 2 * JITTER * SCATTER;
      const x = scX * SCATTER + SCATTER / 2 + jx, z = scZ * SCATTER + SCATTER / 2 + jz;
      const spec = pickWeighted(scatters, rand2(scX, scZ, seed + 24), near);
      if (!spec) continue;
      // Both of these are drawn AFTER the kind, and for the same reason: a
      // veto here leaves the cell empty, where taking the kind out of the pool
      // would only have moved its share onto the sheaves. The first thins the
      // whole of the open country, the second thins one kind of it wherever it
      // stands, and D4 needed the second because the sarsens were four in nine
      // of every scatter cell in the realm and had to come down to one in
      // twenty without the sheaves growing at all.
      if (open < 1 && rand2(scX, scZ, seed + 25) > open) continue;
      if (!wanted(spec, scX, scZ, seed, seed + 28)) continue;
      const gate = openAt(field, x, z, spec, sites, fields);
      if (!gate.ok) continue;
      emit(out, field, spec, x, z, scX, scZ, seed, realm.id, chunk, sites, fields, near);
    }
  }
  return out;
}

/**
 * Does this cell's ground answer this kind's `only`?
 *
 * 'road' and 'site' are the scalar `near` the cell was placed under. 'worked'
 * is the D5 rule and it takes either: a farm field within WORKED_REACH, or a
 * road. A hedge belongs to a field and it also belongs to a lane, and there is
 * no third place in the Greenwold where a hundred metres of hedge means
 * anything.
 */
export const onlyOk = (only, near, worked) => (only === 'worked' ? (worked || near === 'road') : only === near);

/**
 * The kinds a cell may roll, out of a tier's list.
 *
 * Two filters, and both are the answer to something the user saw. `only`
 * strikes out the things that belong beside a road wherever there is no road,
 * and the things that belong to farmed ground wherever no field is near.
 * `chance` strikes out a kind in most cells, which is how a hedgerow can be a
 * hundred and twenty metres long without the country turning into a maze: it
 * starts in one cell in five instead of every other one.
 *
 * Never returns an empty list where the tier had anything at all: a pool with
 * nothing in it would leave the cell to `stubborn`, and the fallback is for
 * ground that refuses, not for a roll that came up short.
 */
export function poolFor(list, near, cellX, cellZ, seed, worked = false) {
  let out = null;
  for (let i = 0; i < list.length; i++) {
    const k = list[i];
    if (k.only && !onlyOk(k.only, near, worked)) continue;
    // the open country gets its own, much smaller chance where the kind names
    // one: a hedgerow is a field boundary on farmed ground and a landmark out
    // in the meadow, and it cannot be as common in the second as in the first
    const ch = (k.openChance != null && !worked && near !== 'road') ? k.openChance : k.chance;
    if (ch < 1 && rand2(cellX * 3 + 1, cellZ * 5 + 2, seed + 61 + i) >= ch) continue;
    (out ||= []).push(k);
  }
  if (out) return out;
  // nothing survived: fall back to whatever belongs nowhere in particular, so
  // a cell in the open still has something honest to put down
  const bare = list.filter((k) => !k.only);
  return bare.length ? bare : list;
}

/**
 * Every prop of one farm that stands in this chunk.
 *
 * The layout is built in world metres and cached whole; the chunk keeps the
 * props whose own feet are inside it, so a field that lies across a chunk line
 * is built once by each of them and never twice by either. Each prop is put
 * through the real gate before it is kept, which is why no crop row ever
 * stands in a stream that threads the field and no boundary is ever laid over
 * a ford.
 */
function emitFarm(out, field, near, cx, cz, chunk, sites) {
  const x0 = cx * CHUNK, z0 = cz * CHUNK;
  const kit = kitFor(near.realm);
  const props = near.farm.props;
  for (let i = 0; i < props.length; i++) {
    const p = props[i];
    if (p.x < x0 || p.x >= x0 + CHUNK || p.z < z0 || p.z >= z0 + CHUNK) continue;
    if (p.gap) continue;                       // the gate goes last, once its neighbours are known
    const spec = kit.find((k) => k.kind === p.kind);
    if (!spec) continue;
    const g = probeAt(field, p.x, p.z, sites);
    if (!g.ok) continue;
    out.push(farmRecord(field, spec, p, g.s.h, near.realm, chunk));
  }
  // The gate is the last thing placed and the only thing that can refuse
  // itself: it stands only where the two boundary segments it stands between
  // stand. A gate with no run either side of it is the thing Z4 exists to get
  // rid of, so it is not built rather than built and hoped for.
  for (let i = 0; i < props.length; i++) {
    const p = props[i];
    if (!p.gap) continue;
    if (p.x < x0 || p.x >= x0 + CHUNK || p.z < z0 || p.z >= z0 + CHUNK) continue;
    if (!runHasNeighbours(field, near, p, sites)) continue;
    const spec = kit.find((k) => k.kind === p.kind);
    if (!spec) continue;
    const g = probeAt(field, p.x, p.z, sites);
    if (!g.ok) continue;
    out.push(farmRecord(field, spec, p, g.s.h, near.realm, chunk));
  }
}

/**
 * Do the boundary segments either side of this gap stand?
 *
 * Asked of the WHOLE run and not of this chunk, because a gate can sit within
 * three metres of a chunk line with one of its neighbours in the next chunk
 * along. The two neighbours are gated exactly as they are when they are built,
 * so the answer is the same one the other chunk will come to.
 */
function runHasNeighbours(field, near, gate, sites) {
  let a = null, b = null;
  for (const q of near.farm.props) {
    if (q.run !== gate.run) continue;
    if (q.ri === gate.ri - 1) a = q;
    else if (q.ri === gate.ri + 1) b = q;
  }
  if (!a || !b) return false;
  return probeAt(field, a.x, a.z, sites).ok && probeAt(field, b.x, b.z, sites).ok;
}

/** One farm prop, at a height the caller already sampled. */
function farmRecord(field, spec, p, h, realm, chunk) {
  const u = rand2(Math.round(p.x), Math.round(p.z), 991);
  const s = spec.scale[0] + u * (spec.scale[1] - spec.scale[0]);
  return {
    kind: spec.kind, build: spec.build, realm, chunk,
    x: p.x, z: p.z,
    y: h - spec.sink * s,
    s,
    ry: p.ry,
    tilt: (u - 0.5) * 2 * spec.tilt,
    run: p.run || null,
    ...(p.run ? { ri: p.ri } : null),
    ...(p.gap ? { gap: true } : null),
    near: null,
    farm: true,
    fid: p.fid || null,
  };
}


const stubbornCache = new Map();
/**
 * A realm's kinds, the most slope tolerant first, with the fussy ones dropped.
 *
 * Tier 'field' is dropped outright: a row of standing corn is placed by a farm
 * and by nothing else, and a fallback that could put one on a hillside would
 * be exactly the "a gate in the middle of a meadow" bug wearing a hat.
 */
function stubbornList(realm) {
  let list = stubbornCache.get(realm);
  if (!list) {
    list = kitFor(realm).filter((k) => !k.require && k.tier !== 'field').slice()
      .sort((a, b) => (b.slope - a.slope) || (a.kind < b.kind ? -1 : 1));
    stubbornCache.set(realm, list);
  }
  return list;
}

/**
 * The last word on an anchor cell that has refused four rolls. Walks the
 * realm's kinds from the most slope tolerant down, at the centre and then two
 * offsets, and takes the first that stands. Returns null only when the ground
 * itself is closed: water, a road, a pad, a field, or the clear around home.
 *
 * The list is cut by the same pool the roll used, so the fallback cannot put
 * down a cart where the roll was not allowed to.
 */
function stubborn(field, realm, cellX, cellZ, midX, midZ, seed, sites, near = null, fields = null, worked = false) {
  const list = poolFor(stubbornList(realm), near, cellX, cellZ, seed, worked);
  const spots = [[0, 0], [ANCHOR * 0.22, -ANCHOR * 0.22], [-ANCHOR * 0.22, ANCHOR * 0.22]];
  // the pool is still in slope order, so nothing behind the first could pass
  // where the first could not
  const spec = list[0];
  if (!spec) return null;
  // AND THE FALLBACK IS THINNED TOO. The most slope tolerant kind of the
  // Greenwold is the sarsen, so every anchor cell whose four rolls the ground
  // refused put down another boulder: 742 of the 1841 sarsens over the 31 by
  // 31 chunk square came through here and not off the scatter grid, which is
  // two of every five of them. A rare kind is rare
  // wherever it is placed from, or the word means nothing. The salt is its
  // own, so this answer is not a reading of the roll's.
  if (!wanted(spec, cellX, cellZ, seed, seed + 27)) return null;
  for (const [ox, oz] of spots) {
    const x = midX + ox, z = midZ + oz;
    const gate = openAt(field, x, z, spec, sites, fields);
    if (gate.ok) return { spec, x, z, gate };
  }
  return null;
}

/** Which of a road and a place is near enough to matter here. Road wins. */
function nearWhat(probe, x, z, sites) {
  if (probe.s.road > 0) return 'road';
  for (let i = 0; i < sites.length; i++) {
    const st = sites[i];
    if ((x - st.x) ** 2 + (z - st.z) ** 2 < NEAR_SITE * NEAR_SITE) return 'site';
  }
  return null;
}

function record(field, spec, x, z, u, v, realm, chunk, run, near = null) {
  const s = spec.scale[0] + u * (spec.scale[1] - spec.scale[0]);
  return {
    kind: spec.kind, build: spec.build, realm, chunk,
    x, z,
    y: field.heightAt(x, z) - spec.sink * s,
    s,
    ry: v * Math.PI * 2,
    tilt: (u - 0.5) * 2 * spec.tilt,
    run,
    // what was near the cell that put this down: 'road', 'site' or null. It is
    // the one number the thinning and the `only` rule both turn on, so a test
    // that wants to prove a roadside kept what it had can ask the prop itself
    // instead of guessing from where it stands.
    near,
  };
}

/** One prop, or the whole chain when the kind runs. */
function emit(out, field, spec, x, z, cellX, cellZ, seed, realm, chunk, sites, fields = null, near = null) {
  const u = rand2(cellX, cellZ, seed + 31);
  const v = rand2(cellX, cellZ, seed + 32);
  if (!spec.run) { out.push(record(field, spec, x, z, u, v, realm, chunk, null, near)); return; }
  emitRun(out, field, spec, x, z, u, v, cellX, cellZ, seed, realm, chunk, sites, fields, near);
}

/**
 * A run: a hedgerow, a wall, a reed bed, a dragon's spine.
 *
 * Three things Z4 changed, and each one is a thing the user could see out of
 * the window.
 *
 * THE SEGMENTS LIE ALONG THE RUN. A hedge body is authored along its own local
 * X and every segment used to be turned to `a`, the bearing the run walks,
 * which points a body's long axis ACROSS the line. Forty of those in a row is
 * a comb and not a hedgerow. A kind that declares `along: 'x'` is now turned
 * by `ryAlong` instead, and `auditBodies` measures the declared axis against
 * the geometry so the two files cannot drift apart again.
 *
 * IT TURNS A CORNER. A run that goes straight for a hundred metres and stops
 * is a line ending in nothing. A run with `corner` turns a right angle
 * somewhere in its middle third, so it reads as two sides of a field.
 *
 * IT LEAVES A GAP, AND THE GAP IS THE ONLY PLACE A GATE EXISTS. `gate` takes
 * one step out of the middle of the run and puts a field gate or a stile in
 * its place, and only if both of the steps either side of it stand. That is
 * the whole answer to a dozen gates in open grass: there is no other code path
 * that can make one.
 */
function emitRun(out, field, spec, x, z, u, v, cellX, cellZ, seed, realm, chunk, sites, fields, near = null) {
  const { n, gap, wander } = spec.run;
  const count = n[0] + Math.floor(rand2(cellX, cellZ, seed + 33) * (n[1] - n[0] + 1));
  const runId = `${chunk}:${cellX},${cellZ}`;
  const bend = spec.run.corner && count >= 8
    ? Math.floor(count * (0.35 + rand2(cellX, cellZ, seed + 37) * 0.3)) : -1;
  const turn = rand2(cellX, cellZ, seed + 38) < 0.5 ? -Math.PI / 2 : Math.PI / 2;
  let gi = -1;
  if (spec.run.gate && count >= 7) {
    gi = 2 + Math.floor(rand2(cellX, cellZ, seed + 36) * (count - 4));
    if (gi === bend) gi = gi === count - 3 ? gi - 1 : gi + 1;   // never open a gap on the corner
  }
  let a = v * Math.PI * 2, px = x, pz = z;
  const at = [], placed = new Set();
  for (let i = 0; i < count; i++) {
    at.push([px, pz]);
    if (i !== gi) {
      const g = openAt(field, px, pz, spec, sites, fields);
      if (g.ok) {
        const ru = rand2(cellX * 31 + i, cellZ, seed + 34);
        out.push({
          ...record(field, spec, px, pz, ru, v, realm, chunk, runId, near),
          // every segment of a run lies ALONG the way the run goes, or it is a comb
          ry: spec.along === 'x' ? ryAlong(Math.sin(a), Math.cos(a)) : a,
          // which step of the run this is. A refused segment leaves a gap, and
          // the index is what says a gap is a gap and not a jump
          ri: i,
        });
        placed.add(i);
      } else if (i === 0) return;   // a run that cannot start does not start
    }
    if (i === bend) a += turn;
    a += (rand2(cellX, cellZ * 31 + i, seed + 35) - 0.5) * 2 * wander;
    px += Math.sin(a) * gap; pz += Math.cos(a) * gap;
  }
  if (gi < 1 || !placed.has(gi - 1) || !placed.has(gi + 1)) return;
  const kit = kitFor(realm);
  const which = rand2(cellX * 7 + 1, cellZ * 11 + 3, seed + 39) < 0.72 ? 'field_gate' : 'stile';
  const gspec = kit.find((k) => k.kind === which) || kit.find((k) => k.kind === 'field_gate');
  if (!gspec) return;
  const [ax, az] = at[gi - 1], [bx, bz] = at[gi + 1];
  const gx = (ax + bx) / 2, gz = (az + bz) / 2;
  const g = openAt(field, gx, gz, gspec, sites, fields);
  if (!g.ok) return;
  const gu = rand2(cellX * 13 + 5, cellZ * 17 + 7, seed + 40);
  out.push({
    ...record(field, gspec, gx, gz, gu, v, realm, chunk, runId, near),
    ry: ryAlong(bx - ax, bz - az),
    ri: gi,
    gap: true,
  });
}

// ---------------------------------------------------------------- the audit --

/**
 * The kits, checked against the sheet and against themselves. Thrown at import,
 * so a tenth realm or a kind with no body cannot ship quietly.
 *
 * `bodies` is dressing_models.js's build table when the caller has it, which is
 * what closes the loop between a kind naming a body and a body existing.
 */
export function auditKits(kits = KITS, bodies = null) {
  const bad = [];
  const realmIds = REALMS.map((r) => r.id);
  for (const id of realmIds) if (!kits[id]) bad.push(`${id}: no kit`);
  for (const id of Object.keys(kits)) if (!realmIds.includes(id)) bad.push(`${id}: a kit for no realm`);
  const fieldKinds = FIELD_KIT.map((k) => k.kind);
  for (const [id, list] of Object.entries(kits)) {
    const grid = list.filter((k) => k.tier !== 'field');
    const farm = list.filter((k) => k.tier === 'field');
    if (grid.length < 8 || grid.length > 12) bad.push(`${id}: ${grid.length} kinds on the two grids, wanted eight to twelve`);
    const seen = new Set();
    let anchors = 0, scatters = 0;
    for (const k of list) {
      if (seen.has(k.kind)) bad.push(`${id}: two kinds called ${k.kind}`);
      seen.add(k.kind);
      if (k.size < 0.5 || k.size > 12) bad.push(`${id}:${k.kind}: ${k.size} m, wanted 0.5 to 12`);
      if (!(k.weight > 0)) bad.push(`${id}:${k.kind}: no weight`);
      if (!(k.slope > 0)) bad.push(`${id}:${k.kind}: no slope limit`);
      if (!(k.scale[0] > 0) || k.scale[1] < k.scale[0]) bad.push(`${id}:${k.kind}: bad scale band`);
      if (!(k.chance > 0) || k.chance > 1) bad.push(`${id}:${k.kind}: a chance of ${k.chance}`);
      // An open chance ABOVE the worked chance would mean a hedge was rarer on
      // farmed ground than in the middle of nowhere, which is the world upside
      // down and would read as a bug long before anybody found the row.
      if (k.openChance != null && (!(k.openChance > 0) || k.openChance > k.chance)) {
        bad.push(`${id}:${k.kind}: an open chance of ${k.openChance} against a chance of ${k.chance}`);
      }
      if (!(k.rare > 0) || k.rare > 1) bad.push(`${id}:${k.kind}: rare ${k.rare}, which is never or more than always`);
      if (k.spaced && k.spaced !== 'ring') bad.push(`${id}:${k.kind}: spaced "${k.spaced}", which is no lattice`);
      // A spaced kind is nominated on the ANCHOR lattice, so a scatter kind
      // that asked to be spaced would be asking `ringOpen` a question about a
      // sixteen metre cell in a thirty two metre lattice, and would answer it
      // wrongly and quietly.
      if (k.spaced && k.tier !== 'anchor') bad.push(`${id}:${k.kind}: spaced and tier ${k.tier}, and only an anchor can be spaced`);
      if (k.only && k.only !== 'road' && k.only !== 'site' && k.only !== 'worked') bad.push(`${id}:${k.kind}: only "${k.only}", which is nothing`);
      // A kind that belongs to farmed ground in a realm that grows nothing has
      // no ground to belong to, so it would be struck out of every cell of that
      // realm and never reach the world at all. D5 puts `only: 'worked'` on
      // three Greenwold kinds; this is the guard that catches the tenth realm
      // that copies the row without copying the farm.
      if (k.only === 'worked' && !FARM_REALMS.has(id)) bad.push(`${id}:${k.kind}: only "worked" in a realm that farms nothing`);
      if (k.along && k.along !== 'x' && k.along !== 'z') bad.push(`${id}:${k.kind}: along "${k.along}", which is no axis`);
      if (bodies && !bodies[k.build]) bad.push(`${id}:${k.kind}: names a body "${k.build}" that does not exist`);
      if (k.tier === 'anchor') anchors++; else if (k.tier === 'scatter') scatters++;
    }
    if (anchors < 2) bad.push(`${id}: ${anchors} anchor kinds, wanted at least two`);
    if (scatters < 4) bad.push(`${id}: ${scatters} scatter kinds, wanted at least four`);
    // A realm either farms and has every one of the field kinds, or does not
    // farm and has none of them. Half a farm is a field with no gate in it.
    const wants = FARM_REALMS.has(id);
    if (wants && farm.length !== fieldKinds.length) {
      bad.push(`${id} farms and carries ${farm.length} of the ${fieldKinds.length} field kinds`);
    }
    if (!wants && farm.length) bad.push(`${id} does not farm and carries ${farm.length} field kinds`);
    if (wants) for (const want of fieldKinds) {
      if (!farm.some((k) => k.kind === want)) bad.push(`${id} farms and has no ${want}`);
    }
    // A gate reaches the world only through a run's gap, so a realm whose runs
    // open one has to have a gate to put in it, and a realm with a gate has to
    // have a run that opens for it. Both directions, or the kit can drift into
    // exactly the bug Z4 is here to fix.
    const opens = list.some((k) => k.run && k.run.gate);
    const hasGate = list.some((k) => k.kind === 'field_gate');
    if (opens && !hasGate) bad.push(`${id}: a run leaves a gap and the realm has no gate for it`);
    if (hasGate && !opens && !wants) bad.push(`${id}: a field gate with no run to stand in`);
  }
  if (bad.length) throw new Error(`dressing: ${bad.length} problem(s)\n  ${bad.join('\n  ')}`);
  return ALL_KINDS.length;
}

auditKits();
