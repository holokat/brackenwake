// Hand cut ground: the list of strokes a person made, and what they do to the
// height at a point. Pure, no THREE, runs in node.
//
//   const edits = createTerrainEdits({ baseHeight });
//   edits.stroke({ kind: 'raise', x: 749, z: 1579, r: 12, amount: 2 });
//   edits.heightDelta(x, z, h)     metres to add to the ground at (x, z)
//   edits.groundOverride(x, z)     'dirt' | 'rock' | 'sand' | 'grass' | 'mud' | null
//
// The world field is a function of the seed and nothing else, and it stays that
// way: this is a SECOND function, laid over it, that is a function of a list a
// person wrote. `field.setTerrainEdits(edits)` is the only join between the two,
// and a field with no edits set is bit for bit the field that shipped.
//
// ---- why every profile is a smooth function of distance ---------------------
//
// The ground is meshed in 64 m chunks at three resolutions, and two chunks that
// share a vertex must agree about it to the last bit or the seam shows as a
// crack of sky. Nothing in here reads a chunk, a vertex, a tier or a neighbour:
// a stroke's contribution at (x, z) depends on (x, z), on the stroke, and on the
// ground height passed in. So the same point gets the same answer from either
// side of any border, at any resolution, in any order of building.
//
// Every profile also has ZERO SLOPE at its own rim, so the join with the world
// outside it is C1 and not a ridge. `(1 - t^2)^2` and `smoothstep` are the only
// two shapes used, for exactly that reason.
//
// ---- the fifteen that move ground -------------------------------------------
//
//   raise     a dome, `amount` metres at the centre, 0 at r
//   lower     the same, down
//   flatten   pulls the ground to the height the centre had when the stroke was
//             made: full inside r/2, feathered to nothing at r
//   smooth    pulls the ground a fraction of the way toward the average of a
//             ring at 1.5 r, taken once, when the stroke was made
//   pit       a flat floor `amount` metres down, a wall steeper than a roof, and
//             a lip that meets the hillside with no step in it
//   cliff     a step of `amount` metres across the line through the stroke: the
//             side the yaw points at goes up, the other side is not touched
//   cave      a cut into the hillside in front of the mouth, and a marker that
//             `field.js` turns into a cave site you can walk into
//   ground    no height at all: the word the ground is made of, inside r, which
//             grass and dressing read to keep off it
//
// ED3 added eight more, because a person given a blank world has to be able to
// build a country in it and not just dent one:
//
//   mountain  a raise up to 600 m across and 400 m tall with ridged noise laid
//             over it, `roughness` 0 (a bare dome) to 1 (all spine), seeded off
//             the stroke so the file grows the same mountain on every machine
//   ridge     a raise along the line from the stroke to a point `length` metres
//             away on `yaw`: a capsule, so a whole range is one stroke
//   valley    the same line, down
//   plateau   the ground pulled to `height` metres, flat across most of r and
//             let go over a skirt steeper than a flatten's
//   terrace   the ground rounded onto steps `step` metres apart, the riser
//             smoothed over `sharp` of a tread so it is a stair and not a tear
//   noise     `amount` metres of fbm over the disc, for roughening flat ground
//   erode     a smooth that may only take ground away, never add it
//
// ---- ED4: water is placed, never fallen into --------------------------------
//
// Until ED4 a sculpt world got its water the way the generator does: the ground
// was flooded wherever it fell under sea level. That is the generator's rule and
// it is wrong for a person sculpting by hand ("why does Valley create an ocean
// floor? we should have separate controls for water, river, lakes etc"). A
// valley, a pit, a lower stroke and the foot of a mountain are all GROUND now,
// however deep they go, and water is five brushes of its own:
//
//   lake      a disc of water at `level` metres, which digs its own bed
//             `depth` below that level where the ground stands higher
//   pond      the same, with a small radius and a shallow bed
//   river     a ribbon from the stroke to (`x2`, `z2`), `width` across, its
//             surface `level` at the head and `levelEnd` at the mouth so it can
//             run downhill, its bed cut `depth` under the surface with banks of
//             the same profile a pit's wall has. A river whose head lands on
//             another river's mouth CHAINS: it takes that river's `levelEnd` as
//             its own `level` and snaps to the joint, so a valley can be drawn
//             in a chain of strokes and the water still runs one way
//   sea       a large disc at a level, 0 by default, that cuts NO bed: it is
//             for a coast somebody has already sculpted
//   drain     water gone inside r. It moves no ground at all
//
// Every one of them only ever takes ground AWAY: a bed is never filled in, so a
// lake laid over a gorge leaves the gorge. `waterAt(x, z, h)` walks the same
// index the heights walk, in the order the strokes were made, so a drain over a
// lake is dry and a lake over a drain is wet.
//
// ---- ED5: the eraser, and the soft edge -------------------------------------
//
// TWENTY ONE: `erase`, which is the blank canvas back inside a ring.
//
// A drain takes water away and nothing else, and `reset` takes the whole world
// away and nothing less, so until ED5 there was no way to say "not here" about
// one hillside ("I need a way to erase all changes like a brush"). An `erase`
// stroke MASKS every stroke laid before it, inside its own radius: the height
// they moved is multiplied by `1 - mask`, the paint they left is multiplied by
// the same, and the water they placed is gone where the mask passes a half.
// Strokes laid AFTER it apply normally, exactly as a drain works, so the order
// of the list is the order of the picture, and an erase is undone by being a
// stroke like any other.
//
// It never moves ground on its own: with nothing under it an erase changes not
// one millimetre, and `world.js` says so out loud rather than looking busy.
//
// FEATHERING. Every brush that is not a body of water carries two more knobs:
//
//   hardness  where the full effect ends, as a share of the radius. From there
//             out to r the effect is let go on a smoothstep.
//   opacity   how much of the effect ONE stroke lays down. Paint and erase have
//             it; a sculpt brush's opacity is the `amount` it already carried,
//             and a second knob for the same thing would be a knob that lies.
//
// The two halves read hardness differently, and the difference is the ground:
//
//   paint    the weight is `opacity * (1 - smoothstep(hardness, 1, t))`. At
//            hardness 1 that is the hard disc paint has always been.
//   height   `t` is REMAPPED to `(t - core) / (1 - core)` and the kind's own
//            profile is evaluated at that, so the whole shape is squeezed into
//            the band outside the core: at hardness 0 the remap is the identity
//            and a raise is the dome it always was, at 1 it is a flat topped
//            mound. `core` is capped at `1 - SOFT_RIM / r`, so a brush that
//            moves height always keeps two metres of rim. A profile with a wall
//            at its own edge is a crack between two chunks, which is the one
//            thing this file exists to avoid.
//
// A stroke with NO hardness and NO opacity in it reads as hardness 1, opacity 1
// for paint, which is what "the last stroke over a point wins" meant, and as
// hardness 0 for everything else, which is the dome. So a file written before
// ED5 lays down the ground it always laid down, to the bit.
//
// ---- ED5: paint is a MIX, not a word ----------------------------------------
//
// One word per point was the whole of paint until ED5, and a feathered rim
// cannot be said in one word: half a metre of snow laid over grass is neither
// snow nor grass. So a point carries a WEIGHT PER WORD, composited the way a
// brush composites anywhere: every weight already there is multiplied by
// `1 - w` and the new word takes `w`. Snow at 0.3 over grass gives 0.3 snow and
// 0.7 grass, and three passes of 0.3 over bare ground reach 0.657.
//
// `groundOverride(x, z)` still answers ONE WORD, and it is the dominant one, or
// null where nothing painted stands over a half. That is what `sample.ground`
// has always meant to `grass.js` and `dressing.js` (is this patch somebody's
// yard) and it goes on meaning it. `groundMixAt(x, z)` is the weights, which is
// what `terrain_material.js` blends its layers by, and it is why a feathered
// rim reads as a blend and not as a line. See docs/mmo/wiring/ED5-ERASE-FEATHER.md.
//
// ---- what a stroke has to carry --------------------------------------------
//
// Several kinds cannot be worked out from (x, z) alone. `flatten` and `plateau`
// need the height they are pulling to, and `smooth` and `erode` need the ring
// average, so `stroke()` asks the `baseHeight` sampler for them ONCE, at the
// moment the stroke is made, and writes the answer into the stroke as `h0`.
// `lake`, `pond` and `river` do the same for the level they take when nobody
// gives one, which is the ground you clicked on. `cliff`, `cave`, `ridge` and
// `valley` need a bearing, which the caller supplies as `yaw` (world bearing:
// +x is sin, +z is cos, the same convention `site.facing` uses in field.js). A
// stroke with no yaw is treated as yaw 0, which is a step facing +z.
//
// `mountain` and `noise` need a seed, and `stroke()` writes one into the stroke
// for the same reason: a seed left to be derived at read time is a seed that
// can be derived differently.
//
// That is also why the list serialises: `h0` and `seed` are IN the stroke, so a
// saved file lays the same ground back down on a machine that never took the
// sample.
//
// ---- the header -------------------------------------------------------------
//
// A file is `{ mode, base, strokes }`. `mode: 'sculpt'` tells `field.js` to put
// the generator away and hand back a flat world at `base.height` for a person to
// cut by hand; `mode: 'generate'`, or no header at all, is the world the seed
// makes and is what every world before ED3 was. See docs/mmo/wiring/ED3-SCULPT.md.

import { createNoise } from './noise.js';

/** The twenty one things a stroke can be. */
export const STROKE_KINDS = [
  'raise', 'lower', 'flatten', 'smooth', 'pit', 'cliff', 'cave', 'ground',
  'mountain', 'ridge', 'plateau', 'valley', 'terrace', 'noise', 'erode',
  // ED4: the five that place water. They are together, because the editor's
  // Water tray is `kinds()` filtered by this list and shows them in this order.
  'lake', 'pond', 'river', 'sea', 'drain',
  // ED5: the eraser, last, because the editor's Erase tray is the tail of the
  // same list and its rail cell is the last one down the side.
  'erase',
];
/**
 * The five kinds that place water, and the only things in this file that do.
 *
 * `src/game/editor/modes.js` reads it to fill the Water tray, `field.js` reads
 * `waterAt` which is built out of it, and `water.js` draws one surface per body
 * `waterBodies()` hands over. A sixth kind added here appears in all three
 * without a second list to keep up to date.
 */
export const WATER_KINDS = ['lake', 'pond', 'river', 'sea', 'drain'];
/** The four that draw a surface. `drain` takes one away and draws nothing. */
export const SURFACE_KINDS = ['lake', 'pond', 'river', 'sea'];
const WATER_SET = new Set(WATER_KINDS);
const SURFACE_SET = new Set(SURFACE_KINDS);
/** Whether a kind places or removes water. */
export const isWaterKind = (kind) => WATER_SET.has(kind);
/**
 * ED5: the one kind that takes everything under it away.
 *
 * Its own constant rather than a string typed out in six places: `deltaOf`,
 * `heightDelta`, `groundAt`, `waterAt`, `waterBodies` and `caves` all have to
 * agree about what an eraser is, and the editor asks for it by this name.
 */
export const ERASE_KIND = 'erase';
/**
 * The kinds that take a `hardness` knob: every one that is not a body of water.
 *
 * DERIVED, so a kind added to STROKE_KINDS that is not water gets a soft edge
 * with nothing here to keep up to date, and `auditFeather()` below fails loudly
 * the moment the table and this list disagree. Water is left out on purpose: a
 * lake's edge is where its own surface meets the ground it stands on, which is
 * a shape the ground decides and not a falloff anybody feathers.
 */
export const HARD_KINDS = STROKE_KINDS.filter((k) => !WATER_SET.has(k));
/** The kinds that take an `opacity` knob: the two that lay something over the ground. */
export const OPACITY_KINDS = ['ground', ERASE_KIND];
const HARD_SET = new Set(HARD_KINDS);
const OPACITY_SET = new Set(OPACITY_KINDS);
/** The words `ground` may paint. Anything else is refused. */
export const GROUND_WORDS = ['dirt', 'rock', 'sand', 'grass', 'mud', 'snow', 'gravel', 'ash', 'cobble', 'path'];
/**
 * The words a whole world may be MADE of, which is a shorter list.
 *
 * A base word is not paint: it says what the flat world is, and the only way it
 * can say so without a second path is by taking a biome with it, because the
 * vertex colour, the texture row, the turf and the species all read the biome
 * already. `field.PAINT_BIOME` has four words with a biome in it and these are
 * they. The other six paint fine over a disc, where `sample.ground` carries
 * them, and that is what a brush is for.
 */
export const BASE_GROUNDS = ['grass', 'sand', 'rock', 'snow'];
/** The header a world with no header at all is treated as. */
export const DEFAULT_MODE = 'generate';
/** What a sculpt world is, before anybody says otherwise. */
// `sea` and `places` are false by default: a sculpt world is a blank canvas,
// grass to the world's edge with no coast, no seas and none of the sheet's
// places, until the header says otherwise ("i need to start with a blank
// canvas, just grass, no lakes no nothing").
export const DEFAULT_BASE = { height: 6, ground: 'grass', snowLine: 180, beachLine: 1, sea: false, places: false };
/** The two things a `mode` may be. */
export const MODES = ['generate', 'sculpt'];
/** Metres of a stroke's radius under which nothing is worth drawing. */
export const MIN_R = 0.5;
/** The steepest wall a pit may cut, in metres of fall per metre of ground. */
export const MAX_WALL_GRADE = 6;
/**
 * How much of a pit's radius is flat floor, when the wall does not need more.
 *
 * 0.7 and not 0.5, and it is the difference between a hollow and a bowl: at 0.5
 * a three metre pit in a nine metre radius came out at exactly 1.0 m per metre,
 * which is a hillside you can run up. At 0.7 the same pit stands at 1.67, which
 * is 59 degrees, and the floor is a floor out to 6.3 m of the 9.
 */
export const PIT_FLOOR = 0.7;
/** How deep the cut in front of a cave mouth is, in metres. */
export const CAVE_CUT = 2.0;
/** How far in front of the mouth the centre of that cut stands, as a fraction of r. */
export const CAVE_CUT_AHEAD = 0.3;
/** How much of the way a `smooth` stroke pulls, when it is not told. */
export const SMOOTH_PULL = 0.6;
/** The ring a `smooth` stroke averages over, as a multiple of its own radius. */
export const SMOOTH_RING = 1.5;
/** Metres of the spatial index's cell. A stroke goes into every cell it touches. */
export const GRID = 32;
/**
 * ONE INDEX, AND A SECOND ONE WAS TRIED AND WAS SLOWER.
 *
 * A 600 m mountain lands in 1,444 cells of the 32 m grid, and fifty of them lay
 * 72,200 entries down, which looks like the moment to put big strokes on a
 * coarse grid of their own and merge the two lists at every sample. It was
 * built that way first and measured against this one on the same 2,000 stroke
 * world: one index 1.504 us a sample, two indexes 1.806. The merge costs more
 * than the shorter lists save, because the strokes that make the list long are
 * exactly the ones that cover the point and have to be evaluated anyway.
 *
 * The other half of the measurement, and the reason this is written down rather
 * than deleted: building the index the other way round is FASTER, 0.91 ms
 * against 3.56 for the same 2,000 strokes. An index is built once per undo,
 * load or reset, and read once per vertex of every chunk in the ring, so the
 * per sample number is the one that decides.
 */
/** The widest and the tallest a mountain may be, in metres. */
export const MOUNTAIN_MAX_R = 600;
export const MOUNTAIN_MAX_AMOUNT = 400;
/**
 * Octaves of ridged noise a mountain wears, and its wavelength as a fraction of r.
 *
 * TWO OCTAVES AND NOT THREE, and it is a measured trade and not a preference.
 * Three octaves cost 3.23 us a sample on the 2,000 stroke world in
 * terrain_edits.test.mjs, where 50 of the strokes are 600 m mountains and an
 * average point stands inside 11.2 of them; two cost 2.74. The wavelength came
 * down from 0.5 of the radius to 0.4 at the same time, so the finest ridge a
 * mountain wears (a quarter of that, one octave up) is 24 m on the default
 * 240 m brush, which is finer than the three octave version had at 0.5.
 */
export const MOUNTAIN_OCTAVES = 2;
export const MOUNTAIN_WAVE = 0.4;
/**
 * How deep the ridges cut, as a fraction of the mountain's own height.
 *
 * The profile is `a * dome * (1 - m + m * ridged)` with `m = roughness * this`,
 * and `ridged` is in [0, 1], so the flanks vary by 45% of the height and THE
 * PEAK NEVER EXCEEDS `amount`. That last part is why it is written that way
 * round rather than as a plus and a minus: a mountain asked for at 400 m that
 * came out at 512 would make a liar of the slider.
 */
export const MOUNTAIN_RIDGE = 0.45;
/** How much ridge a mountain wears when nobody says. */
export const MOUNTAIN_ROUGHNESS = 0.6;
/**
 * The steepest the ridged noise itself gets, per unit of its own wavelength.
 *
 * `maxGrade` has to be an UPPER BOUND or the words a stroke says about being
 * too steep to draw are worth nothing. The dome's own gradient is analytic; the
 * noise laid over it is not, so this is a MEASURED CEILING, and it is a ceiling
 * and not a typical: over 400,000 samples of eight seeds of
 * `ridged(x, y, MOUNTAIN_OCTAVES)` the median gradient is 3.347 per unit, the
 * 99th is 9.550 and the worst seen is 14.627. Simplex noise itself reaches 7.33
 * per unit, which is where those come from. 15 is the worst with a little room.
 * `terrain_edits.test.mjs` drives the claim against the real profile and fails
 * if the claim is ever SHORT of what the ground does; it will usually be well
 * over, which is what a bound is.
 */
export const RIDGE_SLOPE = 15;
/** The same ceiling for `fbm(x, y, 3)`, which the `noise` kind uses: measured 10.459. */
export const FBM_SLOPE = 11;
/** How far a `noise` stroke's fbm repeats, in metres, when nobody says. */
export const NOISE_WAVE = 24;
/** Metres between one tread of a `terrace` and the next, when nobody says. */
export const TERRACE_STEP = 4;
/** How much of a tread the riser takes: 1 is a ramp, 0.1 is a wall. */
export const TERRACE_SHARP = 0.5;
/** How much of a `plateau`'s radius is its flat top. The rest is skirt. */
export const PLATEAU_SKIRT = 0.75;
/**
 * Where a `lake`'s floor sat before ED4, in metres.
 *
 * Kept, and exported, for one job: a file written before water had brushes of
 * its own carries `floor` on its lakes and no `level`, and `makeStroke` reads
 * that as a surface at the old sea level with the same bed under it. Nothing
 * new is measured from it.
 */
export const LAKE_FLOOR = -3;

// ---- ED4: what water is, in numbers ----------------------------------------
//
// THE LEVEL A LAKE TAKES WHEN NOBODY SAYS IS THE GROUND YOU CLICKED ON, which
// is what makes one click on the flat a lake with its own bed rather than a
// crater with a puddle six metres down it. The SLIDER's default cannot be "the
// ground", because a slider is a number, so it is `DEFAULT_BASE.height`: the
// height a blank sculpt world stands at. Those two agree on the world people
// actually build in, and the words every stroke returns quote the level it got.
/** The surface a lake, a pond or a river takes on the palette's slider, in metres. */
export const WATER_LEVEL = DEFAULT_BASE.height;
/** How far a lake cuts its bed below its own surface, in metres. */
export const LAKE_DEPTH = 4;
/** The same for a pond, which is the small one. */
export const POND_DEPTH = 2;
/** The same for a river's channel. */
export const RIVER_DEPTH = 2;
/** How wide a river is, bank to bank, when nobody says. */
export const RIVER_WIDTH = 12;
/** How wide a lake and a pond are when nobody says, as a radius in metres. */
export const LAKE_R = 24;
export const POND_R = 8;
/** How big a `sea` is when nobody says, and the widest one anybody may draw. */
export const SEA_R = 400;
export const SEA_MAX_R = 1500;
/** Where a `sea`'s surface sits when nobody says. Sea level is 0 and always was. */
export const SEA_SURFACE = 0;
/**
 * How close a river's head has to land to another river's mouth to chain, in
 * metres.
 *
 * A chain is what makes a river that bends into more than one stroke still one
 * river: the second takes the first's `levelEnd` as its own `level` and its
 * head is SNAPPED onto the joint, so the two ribbons meet with no step and the
 * water keeps running the same way downhill. Six metres is half a default
 * river's width, so a second click anywhere in the mouth chains.
 */
export const RIVER_CHAIN = 6;
/** How much of the way an `erode` pulls, when it is not told. */
export const ERODE_PULL = 0.6;

/** How many stroke seeds keep a noise table alive before the cache is dropped. */
export const NOISE_CACHE = 512;

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
function smoothstep(e0, e1, v) {
  const t = clamp01((v - e0) / (e1 - e0 || 1e-9));
  return t * t * (3 - 2 * t);
}
/** 1 at the centre, 0 at the rim, flat at both ends: the dome every raise uses. */
export function dome(t) {
  if (t >= 1) return 0;
  const u = 1 - t * t;
  return u * u;
}
/** 1 out to `hold` of the radius, 0 at it, smooth between. */
const plateau = (t, hold) => 1 - smoothstep(hold, 1, t);

/**
 * The floor, the wall and the lip of a pit, as a fraction of its depth.
 *
 * The wall starts at `t0`, and `t0` is not always 0.5: a deep pit in a small
 * radius would cut a wall the mesher cannot show (over 8 m per metre it is a
 * hole in the world rather than a hollow), so the wall is WIDENED until its
 * steepest metre is inside MAX_WALL_GRADE. `wallStart` says where that is, and
 * `stroke()` reports it, so a pit that had to be widened says so out loud.
 */
export function wallStart(amount, r) {
  const want = Math.abs(amount) * 1.5 / MAX_WALL_GRADE;      // metres of run the wall needs
  const t0 = 1 - want / Math.max(MIN_R, r);
  return Math.max(0.05, Math.min(PIT_FLOOR, t0));
}
export function pitProfile(t, amount, r) {
  const t0 = wallStart(amount, r);
  return 1 - smoothstep(t0, 1, t);
}

// ---- ED5: feathering, in numbers -------------------------------------------

/**
 * Metres of rim a height brush keeps however hard it is set.
 *
 * TWO METRES AND NOT NONE, and it is the mesher's number and not a taste. The
 * ground is meshed at three resolutions and the coarsest puts a vertex every
 * 2 m, so a profile that went from its full height to nothing in less than one
 * cell would be sampled on one side of the step and not the other, and two
 * chunks that share the vertex would disagree about it. Every profile in this
 * file has zero slope at its own rim for the same reason; hardness is allowed
 * to squeeze a profile, never to abolish its rim.
 *
 * Paint is NOT capped by it: a word is a colour, a colour cannot crack a chunk,
 * and hardness 1 on the paint brush is the hard disc paint has always been,
 * which is what makes a file written before ED5 load unchanged.
 */
export const SOFT_RIM = 2;
/** Where the paint brush's knobs stand before anybody moves them. */
export const PAINT_HARDNESS = 0.35;
export const PAINT_OPACITY = 0.7;
/** Where a height brush's hardness stands: 0, which is the profile it always had. */
export const SCULPT_HARDNESS = 0;
/** And the eraser's, which is a soft ring with a solid middle. */
export const ERASE_HARDNESS = 0.5;
export const ERASE_OPACITY = 1;
/** Under this share of a word, a point is not painted that word at all. */
export const MIX_FLOOR = 1e-4;
/** Over this share, a word is the word `sample.ground` answers. */
export const MIX_DOMINANT = 0.5;

/**
 * How hard a stroke's edge is, 0 to 1, DEFAULTED BY WHAT THE STROKE IS.
 *
 * A stroke with no `hardness` in it was written before ED5 (or by hand), and
 * the answer has to be the behaviour that file already had: for paint that is
 * 1, the hard disc, and for everything else 0, the profile's own dome. The
 * eraser is new, so there are no old erasers to keep faith with and its own
 * default is the one its slider shows.
 */
export function hardnessOf(s) {
  if (Number.isFinite(s.hardness)) return clamp01(s.hardness);
  if (s.kind === 'ground') return 1;
  if (s.kind === ERASE_KIND) return ERASE_HARDNESS;
  return SCULPT_HARDNESS;
}
/** How much of itself one stroke lays down, 0 to 1. Absent is the whole of it. */
export const opacityOf = (s) => (Number.isFinite(s.opacity) ? clamp01(s.opacity) : 1);

/**
 * Where the full effect ends, as a share of the radius.
 *
 * `cap` is what keeps SOFT_RIM metres of rim on anything that moves height. It
 * is off for paint, which is the only kind whose hard edge is harmless and the
 * only kind with an old behaviour to match.
 */
export function coreFrac(s) {
  const h = hardnessOf(s);
  if (s.kind === 'ground') return h;
  const r = Math.max(MIN_R, s.r || 0);
  return Math.min(h, Math.max(0, 1 - SOFT_RIM / r));
}
/** The same, in metres, which is what the editor's ring ghost draws. */
export const coreRadius = (s) => coreFrac(s) * Math.max(MIN_R, s.r || 0);

/**
 * 1 out to `core`, 0 at the rim, smooth between: how much of itself a stroke
 * lays at `t` of its own radius.
 *
 * `plateau` is this same shape and this is written in terms of it rather than
 * beside it, so there is one curve in the file and not two that could drift.
 */
export const edgeFall = (t, core) => plateau(t, core);

/**
 * The distance a height brush's own profile is evaluated at.
 *
 * The identity at hardness 0, which is why every stroke ever saved lays down
 * exactly the ground it laid down before: `core` is 0, `(t - 0) / (1 - 0)` is
 * `t`, and not one profile in this file sees a different number. Harder than
 * that and the whole profile is pushed out into the band between the core and
 * the rim, so its flat middle grows and its wall steepens, and because the
 * profile still has zero slope at both of its own ends the joins stay smooth.
 */
export function hardT(s, t) {
  const core = coreFrac(s);
  if (core <= 0) return t;
  if (t <= core) return 0;
  return (t - core) / (1 - core);
}
/** How much steeper hardness makes a profile: the run it squeezed it into. */
export const hardSteepen = (s) => 1 / Math.max(1e-6, 1 - coreFrac(s));

/**
 * How much of the ground under it one erase stroke takes away at (x, z).
 *
 * 0 outside its own radius, `opacity` across its core, and let go over the rim
 * on the same curve paint uses. The core is capped like every other height
 * brush's, because an erase that went from all to nothing in one vertex is the
 * same crack a wall at a rim would be.
 */
export function eraseMaskOf(s, x, z) {
  const r = Math.max(MIN_R, s.r || 0);
  const dx = x - s.x, dz = z - s.z;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return 0;
  return opacityOf(s) * edgeFall(Math.sqrt(d2) / r, coreFrac(s));
}
/**
 * How far out an erase takes MORE than half of what it finds, in metres.
 *
 * Water is a yes or a no and cannot be half taken away, so this is the one
 * radius `waterAt` treats as the edge of the erasure and the one radius
 * `waterBodies` cuts out of a surface. Both read this, so the water a player
 * swims in and the water they can see end in the same place.
 */
export function eraseHalfR(s) {
  const r = Math.max(MIN_R, s.r || 0);
  const a = opacityOf(s);
  if (a <= 0.5) return 0;                       // it never takes half of anything
  const core = coreFrac(s);
  // edgeFall is 1 - smoothstep(core, 1, t) and smoothstep(0.5) is at u = 0.5
  return r * (core + (1 - core) * halfOf(0.5 / a));
}
/** Where `smoothstep(0, 1, u)` reaches `v`, solved by bisection to a micron. */
function halfOf(v) {
  if (v <= 0) return 0;
  if (v >= 1) return 1;
  let lo = 0, hi = 1;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (mid * mid * (3 - 2 * mid) < v) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * The weight one `ground` stroke lays over (x, z), 0 to 1.
 *
 * `opacity` across the core and feathered to nothing at the rim. At the ED5
 * defaults, hardness 1 and opacity 1, it is 1 inside the disc and 0 outside it,
 * which is the hard disc the file used to paint.
 */
export function paintWeightOf(s, x, z) {
  const r = Math.max(MIN_R, s.r || 0);
  const dx = x - s.x, dz = z - s.z;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return 0;
  return opacityOf(s) * edgeFall(Math.sqrt(d2) / r, coreFrac(s));
}

/**
 * One stroke composited into a mix of words, in place. Returns the mix.
 *
 * THE COMPOSITE IS THE ONE RULE, and it is the rule a brush follows anywhere:
 * what is already there is multiplied by `1 - w` and the new word takes `w`.
 * That is what makes the total never exceed 1, what makes snow at 0.3 over
 * grass read 0.3 snow and 0.7 grass, and what makes three passes at 0.3 climb
 * 0.3, 0.51, 0.657 rather than jumping to 0.9.
 */
export function mixIn(mix, word, w) {
  if (!(w > 0)) return mix;
  const keep = 1 - w;
  for (const k in mix) {
    const v = mix[k] * keep;
    if (v < MIX_FLOOR) delete mix[k]; else mix[k] = v;
  }
  mix[word] = (mix[word] || 0) + w;
  return mix;
}
/** The word a mix is mostly made of, or null when nothing in it stands over a half. */
export function dominantOf(mix) {
  if (!mix) return null;
  let word = null, best = 0;
  for (const k in mix) if (mix[k] > best) { best = mix[k]; word = k; }
  return best > MIX_DOMINANT ? word : null;
}

// ---- the noise a mountain and a `noise` stroke are made of ------------------
//
// One table per seed, kept, because building one shuffles 256 entries and a
// terrain vertex may not do that. The seed is IN the stroke (`makeStroke`
// writes it), so a saved file grows the same mountain on any machine, and the
// cache is dropped whole rather than aged: a world with more than NOISE_CACHE
// distinct noise strokes in it is rebuilding tables either way, and a Map that
// grows without a bound is a leak.
const NOISE_TABLES = new Map();
export function noiseFor(seed) {
  const key = seed | 0;
  let n = NOISE_TABLES.get(key);
  if (!n) {
    if (NOISE_TABLES.size >= NOISE_CACHE) NOISE_TABLES.clear();
    n = createNoise(key);
    NOISE_TABLES.set(key, n);
  }
  return n;
}
/** How many noise tables are alive. Only the test asks. */
export const noiseTablesHeld = () => NOISE_TABLES.size;
/**
 * The table this stroke's own noise comes off.
 *
 * A MAP LOOKUP AND NOT A PROPERTY ON THE STROKE, which was tried and was worse:
 * hanging the table off the stroke gave the mountain strokes a different hidden
 * class from every other kind, `deltaOf`'s property reads went megamorphic, and
 * the same 10,000 samples went from 3.19 us to 3.75. The Map is the cheaper of
 * the two. Measured, both ways, 2026-09-07.
 */
export const noiseOf = (s) => noiseFor(s.seed || 1);

/** The wavelength a mountain's ridge repeats over, in metres. */
export const mountainWave = (s) => Math.max(8, (s.wave || MOUNTAIN_WAVE * Math.max(MIN_R, s.r || 0)));
/** How much ridge a mountain wears, 0 to 1. */
export const roughnessOf = (s) => (s.roughness == null ? MOUNTAIN_ROUGHNESS : clamp01(s.roughness));

/**
 * Metres from (x, z) to the line a `ridge` or a `valley` draws.
 *
 * The line runs from the stroke's own point to `length` metres away on `yaw`,
 * and the profile is the dome of that DISTANCE, so a range is a capsule: a
 * half dome cap at each end and a constant cross section between them. The
 * distance to a segment has a gradient of exactly 1 everywhere off the segment
 * itself, which is the whole reason relief in this game is built out of
 * distances, so `maxGrade` for a ridge is a raise's and no more.
 */
export function lineDist(s, x, z) {
  const len = Math.max(0, s.length || 0);
  const ux = Math.sin(s.yaw || 0), uz = Math.cos(s.yaw || 0);
  let u = (x - s.x) * ux + (z - s.z) * uz;
  if (u < 0) u = 0; else if (u > len) u = len;
  const ex = s.x + ux * u - x, ez = s.z + uz * u - z;
  return Math.sqrt(ex * ex + ez * ez);
}

// ---- ED4: the shape of a body of water --------------------------------------
//
// Four small functions, exported, because three files read them and none of
// them should be reading a stroke's raw properties and guessing at the
// defaults: `field.js` asks whether a point is wet, `water.js` builds the
// surface it draws out of exactly the same numbers, and `world.js` says them
// out loud. One answer, three readers.

/** How wide a river is on either side of its own line, in metres. */
export const riverHalf = (s) => Math.max(MIN_R, (Number.isFinite(s.width) ? s.width : RIVER_WIDTH) / 2);
/** How deep a water stroke cuts its bed, in metres. 0 for a sea and a drain. */
export function depthOf(s) {
  if (s.kind === 'sea' || s.kind === 'drain') return 0;
  if (Number.isFinite(s.depth)) return Math.max(0, s.depth);
  return s.kind === 'pond' ? POND_DEPTH : s.kind === 'river' ? RIVER_DEPTH : LAKE_DEPTH;
}
/** Where a water stroke's surface stands, in metres. Null for a drain. */
export function levelOf(s) {
  if (s.kind === 'drain') return null;
  if (Number.isFinite(s.level)) return s.level;
  if (s.kind === 'sea') return SEA_SURFACE;
  return Number.isFinite(s.h0) ? s.h0 : WATER_LEVEL;
}
/** Where a river's surface stands at its mouth. The head's level, if it has none. */
export const levelEndOf = (s) => (Number.isFinite(s.levelEnd) ? s.levelEnd : levelOf(s));

/**
 * How far along a river (0 at the head, 1 at the mouth) a point stands, and how
 * far off the line it is.
 *
 * The same projection `lineDist` does, but onto the segment between two POINTS
 * rather than a bearing and a length, because a river is drawn between two
 * clicks and its far end is a place, not an angle. A river with both ends in
 * the same spot has no line at all: `u` is 0 and the distance is the plain
 * radial one, so a degenerate river is a small round pool and not a divide by
 * zero.
 */
export function riverAt(s, x, z) {
  const ax = s.x, az = s.z;
  const bx = Number.isFinite(s.x2) ? s.x2 : s.x;
  const bz = Number.isFinite(s.z2) ? s.z2 : s.z;
  const dx = bx - ax, dz = bz - az;
  const len2 = dx * dx + dz * dz;
  let u = 0;
  if (len2 > 1e-12) {
    u = ((x - ax) * dx + (z - az) * dz) / len2;
    u = u < 0 ? 0 : u > 1 ? 1 : u;
  }
  const ex = ax + dx * u - x, ez = az + dz * u - z;
  return { u, d: Math.sqrt(ex * ex + ez * ez) };
}
/** A river's surface at `u` along its own line: the head's level, falling to the mouth's. */
export const riverLevelAt = (s, u) => levelOf(s) + (levelEndOf(s) - levelOf(s)) * u;

/**
 * The surface one stroke puts over (x, z).
 *
 *   undefined   this stroke does not reach here, or is not a water stroke
 *   null        a `drain` reaches here, so whatever was here is gone
 *   a number    the metres the surface stands at
 *
 * Three answers and not two, because a drain has to be able to say "no water"
 * as loudly as a lake says "water at 6 m": a walk that could only add would let
 * a drain do nothing at all.
 */
export function waterOf(s, x, z) {
  if (!WATER_SET.has(s.kind)) return undefined;
  if (s.kind === 'river') {
    const seg = riverAt(s, x, z);
    return seg.d >= riverHalf(s) ? undefined : riverLevelAt(s, seg.u);
  }
  const r = Math.max(MIN_R, s.r || 0);
  const dx = x - s.x, dz = z - s.z;
  if (dx * dx + dz * dz >= r * r) return undefined;
  return s.kind === 'drain' ? null : levelOf(s);
}

/**
 * The ground rounded onto steps, with the riser smoothed.
 *
 * A hard `round(h / step) * step` is a terrace with vertical risers, which is
 * a tear in a heightfield and not a stair: the mesher cannot show it and the
 * lighting reads it as a crack. So the tread is flat over `1 - sharp` of the
 * step and the riser climbs over the remaining `sharp` as a smoothstep, which
 * puts the steepest metre at 1.5 * step / (sharp * step / grade)... in plain
 * words, the smaller `sharp` the steeper the riser, and `maxGrade` cannot say
 * how steep because it is not given the ground's own slope.
 */
export function terraceOf(h, step, sharp) {
  const st = Math.max(0.05, step);
  const sh = Math.min(1, Math.max(0.02, sharp));
  const q = h / st;
  const f = Math.floor(q);
  const u = q - f;
  return (f + smoothstep(1 - sh, 1, u)) * st;
}

/**
 * The steepest metre a stroke cuts anywhere, in metres of rise per metre.
 *
 * Analytic, not probed: every profile in this file has a derivative anyone can
 * write down, and the words a stroke reports quote this so a user cutting a
 * four metre pit in a three metre radius is told it is a hole and not a hollow.
 * `terrain_edits.test.mjs` measures each one against the real profile.
 *
 *   dome      a(1 - t^2)^2, steepest at t = 1/sqrt(3): 8a / (3 sqrt(3) r)
 *   smoothstep  steepest in the middle of its own run: 1.5 * rise / run
 */
export function maxGrade(s) {
  const g = gradeOf(s);
  // ED5: hardness squeezes the whole profile into the band outside the core, so
  // whatever a profile did over `r` it now does over `r * (1 - core)` and every
  // gradient below scales by exactly that. At hardness 0 the factor is 1 and
  // every number here is the number it always was.
  if (g && HARD_SET.has(s.kind)) return g * hardSteepen(s);
  return g;
}
function gradeOf(s) {
  const r = Math.max(MIN_R, s.r || 0), a = Math.abs(s.amount || 0);
  switch (s.kind) {
    case 'raise': case 'lower': return 8 * a / (3 * Math.sqrt(3) * r);
    // A flatten and a smooth cut whatever the ground was already doing, and
    // this function is not given the ground. Null, rather than a number taken
    // from the wrong variable.
    case 'flatten': case 'smooth': return null;
    case 'pit': return 1.5 * a / ((1 - wallStart(a, r)) * r);
    case 'cliff': return 1.5 * a / (2 * Math.max(0.25, a / 4));
    case 'cave': {
      const cut = s.cut == null ? CAVE_CUT : s.cut;
      return 1.5 * cut / ((1 - wallStart(cut, r)) * r);
    }
    // A ridge is a dome of the distance to a SEGMENT, and the gradient of a
    // distance is 1 whether it is measured to a point or to a line, so a range
    // is exactly as steep as the raise that made its cap and no steeper.
    case 'ridge': case 'valley': return 8 * a / (3 * Math.sqrt(3) * r);
    /**
     * A mountain is the dome PLUS the ridged noise laid on it, and the two
     * steepest metres need not be the same metre, so this is their sum: an
     * upper bound, which is what a warning has to be. The noise term is
     * `a * roughness * |grad ridged| / wave`, and RIDGE_SLOPE is the measured
     * ceiling on that gradient in the noise's own units.
     */
    case 'mountain': {
      const dome0 = 8 * a / (3 * Math.sqrt(3) * r);
      return dome0 + a * roughnessOf(s) * MOUNTAIN_RIDGE * RIDGE_SLOPE / mountainWave(s);
    }
    case 'noise': {
      const wave = Math.max(2, s.wave || NOISE_WAVE);
      return a * FBM_SLOPE / wave + 8 * a / (3 * Math.sqrt(3) * r);
    }
    /**
     * A lake's and a pond's bed is a pit of a KNOWN depth, so unlike the pre
     * ED4 lake this needs nothing captured off the ground: `depth` is the
     * stroke's own number and the bank is the pit's own profile.
     */
    case 'lake': case 'pond': {
      const depth = depthOf(s);
      if (depth <= 0) return 0;
      return 1.5 * depth / ((1 - wallStart(depth, r)) * r);
    }
    /** The same wall, cut across a river's half width instead of a radius. */
    case 'river': {
      const depth = depthOf(s), half = riverHalf(s);
      if (depth <= 0) return 0;
      return 1.5 * depth / ((1 - wallStart(depth, half)) * half);
    }
    /** Neither of these moves so much as a millimetre of ground. */
    case 'sea': case 'drain': return 0;
    // Every one of these cuts whatever the ground was already doing, and this
    // function is not given the ground. Null, rather than a number taken from
    // the wrong variable. ED5's eraser is the same case twice over: what it
    // takes away is every stroke under it, and it is handed none of them.
    case 'plateau': case 'terrace': case 'erode': case ERASE_KIND: return null;
    default: return 0;
  }
}

/** Where a stroke reaches, in metres from its own centre. */
export function reachOf(s) {
  const r = Math.max(MIN_R, s.r || 0);
  if (s.kind === 'cave') return r * (1 + CAVE_CUT_AHEAD);
  // A capsule reaches r past the far end of its own line, and the index boxes a
  // stroke about its own point, so this is the whole of it in every direction.
  if (s.kind === 'ridge' || s.kind === 'valley') return r + Math.max(0, s.length || 0);
  // A river is the same capsule, drawn to a POINT rather than along a bearing,
  // so its reach is half its width plus the whole distance to that point.
  if (s.kind === 'river') {
    const bx = Number.isFinite(s.x2) ? s.x2 : s.x, bz = Number.isFinite(s.z2) ? s.z2 : s.z;
    return riverHalf(s) + Math.hypot(bx - s.x, bz - s.z);
  }
  return r;
}

/**
 * One stroke's contribution at (x, z), given the ground height there.
 *
 * `h` is the height the world has ALREADY, including every stroke made before
 * this one, which is what makes `flatten` on top of `raise` flatten the raised
 * ground rather than the hillside under it.
 */
export function deltaOf(s, x, z, h) {
  const r = Math.max(MIN_R, s.r || 0);
  const a = s.amount || 0;
  if (s.kind === 'ground') return 0;
  /**
   * ED5: an eraser has NO PROFILE OF ITS OWN, on purpose.
   *
   * What it does is take away what is under it, and what is under it is the
   * running total of every stroke before it, which one stroke evaluated on its
   * own cannot see. `stackDelta` is where it happens, and it is the only walk
   * of the list there is, so nothing can read the height without reading the
   * eraser. This returning 0 is the whole truth about an erase in isolation.
   */
  if (s.kind === ERASE_KIND) return 0;
  if (s.kind === 'cave') {
    // the cut stands in front of the mouth, on the mouth's own bearing
    const yaw = s.yaw || 0;
    const cx = s.x + Math.sin(yaw) * r * CAVE_CUT_AHEAD;
    const cz = s.z + Math.cos(yaw) * r * CAVE_CUT_AHEAD;
    const d = Math.hypot(x - cx, z - cz);
    if (d >= r) return 0;
    const cut = s.cut == null ? CAVE_CUT : s.cut;
    return -cut * pitProfile(hardT(s, d / r), cut, r);
  }
  // The two kinds that are a LINE and not a disc, so the plain radius check
  // below would throw away everything past the first cap.
  if (s.kind === 'ridge' || s.kind === 'valley') {
    const d = lineDist(s, x, z);
    if (d >= r) return 0;
    return (s.kind === 'ridge' ? a : -a) * dome(hardT(s, d / r));
  }
  /**
   * A river's channel: a pit's wall, cut along a line, to a floor that FALLS
   * with the surface.
   *
   * `(floor - h)` and never the other way round, and clamped so it can only
   * take ground away: a river drawn across a gorge does not fill the gorge in
   * to make itself a bed, it just runs through it. That clamp is what makes
   * the join with the ground outside the banks C1 as well: where the ground is
   * already at or under the floor the cut is exactly 0 and stays 0.
   */
  if (s.kind === 'river') {
    const half = riverHalf(s);
    const seg = riverAt(s, x, z);
    if (seg.d >= half) return 0;
    const depth = depthOf(s);
    if (depth <= 0) return 0;
    const floor = riverLevelAt(s, seg.u) - depth;
    const cut = (floor - h) * pitProfile(seg.d / half, depth, half);
    return cut < 0 ? cut : 0;
  }
  const dx = x - s.x, dz = z - s.z;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return 0;
  // ED5: hardness, and the ONE line it takes to apply it to every disc profile
  // below. `hardT` is the identity at hardness 0, which is what every stroke
  // written before ED5 reads as, so nothing under this line moved.
  const t = hardT(s, Math.sqrt(d2) / r);
  switch (s.kind) {
    case 'raise': return a * dome(t);
    case 'lower': return -a * dome(t);
    case 'pit': return -Math.abs(a) * pitProfile(t, a, r);
    case 'flatten': {
      const h0 = s.h0;
      if (h0 == null) return 0;
      return (h0 - h) * plateau(t, 0.5);
    }
    case 'smooth': {
      const h0 = s.h0;
      if (h0 == null) return 0;
      const pull = s.amount == null ? SMOOTH_PULL : clamp01(Math.abs(s.amount));
      return (h0 - h) * dome(t) * pull;
    }
    case 'cliff': {
      const yaw = s.yaw || 0;
      // metres along the yaw, so the side the bearing points at is the high side
      const u = dx * Math.sin(yaw) + dz * Math.cos(yaw);
      const b = Math.max(0.25, Math.abs(a) / 4);       // half the run of the step
      return a * smoothstep(-b, b, u) * plateau(t, 0.6);
    }
    /**
     * A mountain: the dome, with ridged noise laid over it and WINDOWED BY THE
     * SAME DOME.
     *
     * The window is not decoration. The noise has a gradient of its own and the
     * rim of a stroke has to be C1 with the world outside it, so the noise is
     * multiplied by the dome as well: at t = 1 the dome is 0 and its derivative
     * is 0, so `d/dx (dome * N)` is `dome' N + dome N'`, which is 0 too. Lay the
     * noise on unwindowed and every mountain in the world has a hairline crack
     * round it at every chunk seam.
     *
     * `1 - m + m * ridged` with `m = roughness * MOUNTAIN_RIDGE` keeps the peak
     * at `amount` and no higher, and makes roughness 0 exactly a raise, which
     * is what the test drives both ways.
     */
    case 'mountain': {
      const d0 = dome(t);
      if (d0 <= 0) return 0;
      const rough = roughnessOf(s);
      if (rough <= 0) return a * d0;
      const m = rough * MOUNTAIN_RIDGE;
      const wave = mountainWave(s);
      const n = noiseOf(s).ridged(x / wave, z / wave, MOUNTAIN_OCTAVES);
      return a * d0 * (1 - m + m * n);
    }
    /** Roughening: fbm in [-1, 1] times `amount`, windowed by the dome. */
    case 'noise': {
      const d0 = dome(t);
      if (d0 <= 0) return 0;
      const wave = Math.max(2, s.wave || NOISE_WAVE);
      return a * d0 * noiseOf(s).fbm(x / wave, z / wave, 3);
    }
    /**
     * A plateau: the ground pulled to an ABSOLUTE height, flat out to
     * PLATEAU_SKIRT of the radius and let go over the rest.
     *
     * Absolute and not captured, unlike a flatten, so a person can say "this
     * mesa is forty metres" and get forty metres. `h0` is only the fallback for
     * a stroke made with no height given, and it is written into the stroke, so
     * the file is portable either way.
     */
    case 'plateau': {
      const top = s.height == null ? s.h0 : s.height;
      if (top == null) return 0;
      const hold = s.skirt == null ? PLATEAU_SKIRT : clamp01(s.skirt);
      return (top - h) * plateau(t, hold);
    }
    /** A stair cut into whatever the ground is doing, feathered like a flatten. */
    case 'terrace': {
      const step = s.step == null ? TERRACE_STEP : s.step;
      const sharp = s.sharp == null ? TERRACE_SHARP : s.sharp;
      return (terraceOf(h, step, sharp) - h) * plateau(t, 0.5);
    }
    /** A smooth that may only take ground away. Half a smooth, on purpose. */
    case 'erode': {
      const h0 = s.h0;
      if (h0 == null) return 0;
      const pull = s.amount == null ? ERODE_PULL : clamp01(Math.abs(s.amount));
      const d = (h0 - h) * dome(t) * pull;
      return d < 0 ? d : 0;
    }
    /**
     * A lake and a pond: a bed cut `depth` under the surface, and NOTHING ELSE.
     *
     * `(floor - h)` AND NOT `-depth`, and the difference is the whole point of
     * the kind. A `pit` takes a fixed number of metres off whatever it finds,
     * so a pit dug across a hillside has a floor that slopes exactly as the
     * hillside did and holds water at one end. This pulls the ground TO a
     * height, so the floor is that height across the whole flat of the profile
     * however the ground ran before. Measured on the test's own wrinkled
     * hillside: relative, the floor came out 3.82 m off level; absolute, 0.
     *
     * IT ONLY EVER DIGS. `cut < 0 ? cut : 0` is what "only if the ground is
     * above the level" means in code: ground already under the bed is left
     * alone, a lake laid over a gorge leaves the gorge, and the rim is C1 with
     * the world outside it because the cut is exactly 0 there either way.
     */
    case 'lake': case 'pond': {
      const depth = depthOf(s);
      if (depth <= 0) return 0;
      const floor = levelOf(s) - depth;
      const cut = (floor - h) * pitProfile(t, depth, r);
      return cut < 0 ? cut : 0;
    }
    /**
     * A sea and a drain move no ground at all, on purpose.
     *
     * A sea is for a coast somebody has ALREADY sculpted: it lays a surface at
     * a level over whatever shape is there, so a bay with headlands stays a bay
     * with headlands. A drain takes water away, and water that dug a hole
     * would be strange water.
     */
    case 'sea': case 'drain': return 0;
    default: return 0;
  }
}

/**
 * A LIST of strokes applied to the ground at (x, z), in the order they were
 * made. Returns the metres to add to `h`.
 *
 * THE ONE WALK, AND EVERY READER USES IT. `heightDelta` hands it the cell's own
 * list off the index and the test hands it every stroke there is, so the fast
 * answer and the slow answer are the same code and cannot drift. That matters
 * more since ED5 than it did before: an eraser is not a profile, it is a thing
 * that happens BETWEEN two strokes, and a walk written anywhere else would be a
 * walk that quietly ignored it.
 *
 * The eraser's rule, in one line: `cur = h + (cur - h) * (1 - mask)`. `cur - h`
 * is everything the strokes before it did, `h` is the world without them, so a
 * full mask is the blank canvas back and a half mask is half way there.
 */
export function stackDelta(list, x, z, h = 0, skipKind = null) {
  let cur = h;
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    if (skipKind && s.kind === skipKind) continue;
    if (s.kind === ERASE_KIND) {
      const m = eraseMaskOf(s, x, z);
      if (m > 0) cur = h + (cur - h) * (1 - m);
      continue;
    }
    cur += deltaOf(s, x, z, cur);
  }
  return cur - h;
}

/**
 * Whether a stroke's own ground overlaps a disc, EXACTLY, kind by kind.
 *
 * `reachOf` is a bounding radius about a stroke's own point and is the right
 * thing for an index; it is the wrong thing for a count somebody reads, because
 * a 300 m ridge reaches 340 m from its head in every direction including the
 * three quarters of the compass it does not go. This is the real shape: a disc
 * for a disc, the distance to a segment for the two capsules, the cut's own
 * centre for a cave mouth. `world.js` counts what an erase masks with it.
 */
export function overlapsDisc(s, x, z, r) {
  const sr = Math.max(MIN_R, s.r || 0);
  if (s.kind === 'ridge' || s.kind === 'valley') return lineDist(s, x, z) < sr + r;
  if (s.kind === 'river') return riverAt(s, x, z).d < riverHalf(s) + r;
  if (s.kind === 'cave') {
    const yaw = s.yaw || 0;
    const cx = s.x + Math.sin(yaw) * sr * CAVE_CUT_AHEAD;
    const cz = s.z + Math.cos(yaw) * sr * CAVE_CUT_AHEAD;
    return Math.hypot(x - cx, z - cz) < sr + r;
  }
  return Math.hypot(x - s.x, z - s.z) < sr + r;
}

/**
 * A LIST of strokes composited into the words the ground is painted, at (x, z).
 *
 * Null when nothing painted reaches the point, which is every sample of a world
 * nobody has painted and is why this costs one property read there. Otherwise
 * `{ word, mix }`: the dominant word, or null where nothing stands over a half,
 * and the weights themselves.
 *
 * The eraser walks in the same order it walks in the heights, and it takes the
 * paint down by the same mask, so a rubbed out yard fades rather than blinking.
 */
export function stackGround(list, x, z) {
  let mix = null;
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    if (s.kind === ERASE_KIND) {
      if (!mix) continue;
      const m = eraseMaskOf(s, x, z);
      if (m <= 0) continue;
      const keep = 1 - m;
      for (const k in mix) {
        const v = mix[k] * keep;
        if (v < MIX_FLOOR) delete mix[k]; else mix[k] = v;
      }
      continue;
    }
    if (s.kind !== 'ground') continue;
    const w = paintWeightOf(s, x, z);
    if (w <= 0) continue;
    if (!mix) mix = {};
    mixIn(mix, s.word, w);
  }
  // A mix an eraser has taken every word out of is not a painted point at all,
  // and it has to answer the same null an unpainted point answers, or a rubbed
  // out yard would still be a yard as far as grass.js is concerned.
  if (!mix || !Object.keys(mix).length) return null;
  return { word: dominantOf(mix), mix };
}

// ---- the brush list the editor builds itself out of -------------------------
//
// THE PARAMS TABLE IS THE CONTRACT, and it is here rather than in the editor
// because it is this file that clamps, defaults and refuses. A slider built off
// a number the editor holds its own copy of is a slider that goes out of date
// the first time this file changes its mind; a slider built off this goes with
// it. `window.__bw.terrain.kinds()` hands it over unchanged.
//
// Every row is [name, min, max, step, default], in the order a brush panel
// should show them, and every name is a property `makeStroke` reads by that
// exact name. `words` is only on `ground`, and is the list it will accept.
const P = (name, min, max, step, def) => ({ name, min, max, step, default: def });
const R_PARAM = P('r', MIN_R, 600, 0.5, 12);
const YAW_PARAM = P('yaw', 0, Math.PI * 2, 0.01, 0);
/** Where a surface stands, in metres. `kinds()` copies every row, so one is enough. */
const LEVEL_PARAM = P('level', -200, MOUNTAIN_MAX_AMOUNT, 0.5, WATER_LEVEL);
export const KIND_PARAMS = {
  raise:    { label: 'raise',    params: [R_PARAM, P('amount', 0, 400, 0.1, 2)] },
  lower:    { label: 'lower',    params: [R_PARAM, P('amount', 0, 400, 0.1, 2)] },
  flatten:  { label: 'flatten',  params: [R_PARAM] },
  smooth:   { label: 'smooth',   params: [R_PARAM, P('amount', 0, 1, 0.05, SMOOTH_PULL)] },
  pit:      { label: 'pit',      params: [R_PARAM, P('amount', 0, 400, 0.1, 3)] },
  cliff:    { label: 'cliff',    params: [R_PARAM, P('amount', -400, 400, 0.1, 4), YAW_PARAM] },
  cave:     { label: 'cave mouth', params: [P('r', MIN_R, 60, 0.5, 8), P('amount', 0, 4, 0.1, 2), YAW_PARAM] },
  ground:   { label: 'paint',    params: [R_PARAM], words: GROUND_WORDS.slice() },
  mountain: { label: 'mountain', params: [P('r', MIN_R, MOUNTAIN_MAX_R, 1, 240), P('amount', 0, MOUNTAIN_MAX_AMOUNT, 1, 120), P('roughness', 0, 1, 0.05, MOUNTAIN_ROUGHNESS)] },
  ridge:    { label: 'ridge',    params: [P('r', MIN_R, 300, 0.5, 40), P('amount', 0, MOUNTAIN_MAX_AMOUNT, 0.5, 60), P('length', 0, 4000, 1, 300), YAW_PARAM] },
  plateau:  { label: 'plateau',  params: [P('r', MIN_R, 600, 0.5, 60), P('height', -200, MOUNTAIN_MAX_AMOUNT, 0.5, 20), P('skirt', 0.05, 0.95, 0.05, PLATEAU_SKIRT)] },
  valley:   { label: 'valley',   params: [P('r', MIN_R, 300, 0.5, 40), P('amount', 0, MOUNTAIN_MAX_AMOUNT, 0.5, 20), P('length', 0, 4000, 1, 300), YAW_PARAM] },
  terrace:  { label: 'terrace',  params: [P('r', MIN_R, 600, 0.5, 40), P('step', 0.5, 40, 0.5, TERRACE_STEP), P('sharp', 0.02, 1, 0.02, TERRACE_SHARP)] },
  noise:    { label: 'roughen',  params: [P('r', MIN_R, 600, 0.5, 60), P('amount', 0, 60, 0.1, 2), P('wave', 2, 400, 1, NOISE_WAVE)] },
  erode:    { label: 'erode',    params: [P('r', MIN_R, 600, 0.5, 30), P('amount', 0, 1, 0.05, ERODE_PULL)] },
  // ED4's five. `level` is the surface in metres and `depth` is how far the bed
  // is cut under it, so the two knobs read as "where the water is" and "how
  // deep it is" rather than as one absolute floor a person has to do the
  // arithmetic for.
  lake:     { label: 'lake',     params: [P('r', MIN_R, MOUNTAIN_MAX_R, 0.5, LAKE_R), LEVEL_PARAM, P('depth', 0, 200, 0.5, LAKE_DEPTH)] },
  pond:     { label: 'pond',     params: [P('r', MIN_R, 120, 0.5, POND_R), LEVEL_PARAM, P('depth', 0, 60, 0.5, POND_DEPTH)] },
  // `x2` and `z2` are what make a river a two click brush: palette.js reads the
  // pair and marks the row `line`, and the editor fills them in from the second
  // click. Their range is well past the world's own 8 km half width, because a
  // knob that clamps is a river that ends somewhere the user did not click.
  river:    { label: 'river',    params: [P('width', 1, 200, 0.5, RIVER_WIDTH), P('depth', 0, 60, 0.5, RIVER_DEPTH), LEVEL_PARAM, P('levelEnd', -200, MOUNTAIN_MAX_AMOUNT, 0.5, WATER_LEVEL), P('x2', -20000, 20000, 1, 0), P('z2', -20000, 20000, 1, 60)] },
  sea:      { label: 'sea',      params: [P('r', MIN_R, SEA_MAX_R, 5, SEA_R), P('level', -200, MOUNTAIN_MAX_AMOUNT, 0.5, SEA_SURFACE)] },
  drain:    { label: 'drain',    params: [P('r', MIN_R, MOUNTAIN_MAX_R, 0.5, LAKE_R)] },
  // ED5's one. A radius and the two feathering knobs below, and nothing else:
  // an eraser has nothing to say about how much ground to move, only about how
  // much of what is there to take away.
  erase:    { label: 'erase',    params: [P('r', MIN_R, MOUNTAIN_MAX_R, 0.5, 24)] },
};

// ---- ED5: the two knobs every brush but a body of water carries -------------
//
// ADDED OFF THE DERIVED LIST AND NOT TYPED ONTO SIXTEEN ROWS. A kind added to
// STROKE_KINDS that is not water is in HARD_KINDS the moment it is added, so it
// gets a soft edge and a slider for it with nothing here to keep up to date,
// and `auditFeather()` fails loudly if a knob and the code that reads it ever
// part company.
//
// The defaults differ by what the brush is FOR, and each one is the behaviour
// that brush had before ED5 or the one the user asked for:
//
//   paint   0.35 hard and 0.7 opaque, which is the blended rim this was opened
//           for. A stroke with no hardness at all still reads as the old hard
//           disc, so this is the new brush's default and not a change to any
//           file already written.
//   erase   0.5 hard, fully opaque: a solid middle with a soft ring round it.
//   sculpt  0 hard, which is exactly the dome, the pit and the mesa this file
//           has always cut.
const HARD_PARAM = P('hardness', 0, 1, 0.05, SCULPT_HARDNESS);
const PAINT_HARD_PARAM = P('hardness', 0, 1, 0.05, PAINT_HARDNESS);
const ERASE_HARD_PARAM = P('hardness', 0, 1, 0.05, ERASE_HARDNESS);
const PAINT_OPACITY_PARAM = P('opacity', 0.05, 1, 0.05, PAINT_OPACITY);
const ERASE_OPACITY_PARAM = P('opacity', 0.05, 1, 0.05, ERASE_OPACITY);
for (const kind of HARD_KINDS) {
  const row = KIND_PARAMS[kind];
  row.params = row.params.concat(
    kind === 'ground' ? PAINT_HARD_PARAM : kind === ERASE_KIND ? ERASE_HARD_PARAM : HARD_PARAM,
  );
  if (OPACITY_SET.has(kind)) {
    row.params = row.params.concat(kind === ERASE_KIND ? ERASE_OPACITY_PARAM : PAINT_OPACITY_PARAM);
  }
}

/**
 * Throws when a brush offers a knob nothing reads, or reads one it never offers.
 *
 * The class of bug this is here for is the one that has cost this project the
 * most: a slider written into a table with no consumer at the other end. It
 * runs at import, so a kind added without a soft edge fails the first test that
 * loads the module rather than shipping as a slider that moves nothing.
 */
export function auditFeather() {
  const bad = [];
  for (const kind of STROKE_KINDS) {
    const names = KIND_PARAMS[kind].params.map((p) => p.name);
    const hasHard = names.includes('hardness'), hasOpacity = names.includes('opacity');
    if (HARD_SET.has(kind) !== hasHard) {
      bad.push(`${kind} ${hasHard ? 'offers a hardness knob nothing reads' : 'reads hardness and offers no knob for it'}`);
    }
    if (OPACITY_SET.has(kind) !== hasOpacity) {
      bad.push(`${kind} ${hasOpacity ? 'offers an opacity knob nothing reads' : 'reads opacity and offers no knob for it'}`);
    }
  }
  if (bad.length) throw new Error(`the feathering knobs and the code have drifted: ${bad.join('; ')}`);
  return { hard: HARD_KINDS.length, opacity: OPACITY_KINDS.length };
}
auditFeather();

/**
 * The kinds that carry a bearing, DERIVED FROM THE TABLE ABOVE.
 *
 * `src/game/app/systems/world.js` fills a bearing in when the caller did not
 * give one: a cave's mouth opens out of the hillside, and a cliff, a ridge and
 * a valley take the way the player is looking. ED3 took that from two kinds to
 * four, and a hand written list is a list a fifth kind gets forgotten out of,
 * so it is read off the params table: a kind with a `yaw` slider is a kind that
 * needs a yaw. `terrain_edits.test.mjs` drives it against `deltaOf` itself.
 */
export const NEEDS_YAW = new Set(
  STROKE_KINDS.filter((k) => KIND_PARAMS[k].params.some((p) => p.name === 'yaw')),
);

/**
 * Every brush, with its sliders, for an editor to build a palette from.
 *
 * A fresh array of fresh rows every call: the caller is a UI and a UI mutates
 * what it is handed. `terrain_edits.test.mjs` checks that the list names every
 * kind in STROKE_KINDS and nothing else, and that every default the table gives
 * is inside the min and max beside it.
 */
export function kinds() {
  return STROKE_KINDS.map((kind) => {
    const row = KIND_PARAMS[kind];
    const out = { kind, label: row.label, params: row.params.map((p) => ({ ...p })) };
    if (row.words) out.words = row.words.slice();
    /**
     * ED5: THE ROW SAYS IT ERASES, so nothing downstream has to know its name.
     *
     * An eraser's knobs are a radius and a falloff, which is exactly what a
     * sculpt brush's are, so no question asked of the row could tell them
     * apart. This flag is the answer: `modes.js` puts a row that says it into
     * the Erase tray and `editor.js` takes the placed things out of the ring
     * for it, and neither of them has the word 'erase' in a condition.
     */
    if (kind === ERASE_KIND) out.erases = true;
    return out;
  });
}

/**
 * The stroke list.
 *
 * `baseHeight(x, z)` is the ground as it stands NOW, edits and all. It is asked
 * only by `stroke()`, only for the five kinds that capture a sample, and only
 * when the stroke does not already carry its own `h0` (a loaded file does).
 */
export function createTerrainEdits(opts = {}) {
  const baseHeight = typeof opts.baseHeight === 'function' ? opts.baseHeight : null;
  const strokes = [];
  // Steps, not strokes. One ordinary stroke is a step of one; `reset` is a step
  // of however many it dropped, so taking it back is one undo and not two
  // thousand. Each entry is { add: [strokes] } for something laid down or
  // { drop: [strokes] } for something taken away wholesale.
  const done = [];
  const undone = [];
  let nextId = 1;
  let version = 0;
  // The header. `baseVersion` moves only when the header does, which is what
  // field.js and world_runtime.js watch to know the whole world has to be
  // built again rather than one hillside.
  let mode = MODES.includes(opts.mode) ? opts.mode : DEFAULT_MODE;
  let base = { ...DEFAULT_BASE, ...(opts.base || null) };
  let baseVersion = 0;
  // key -> array of strokes touching that cell, in the order they were made
  let index = null;

  /**
   * THE CELL, EXACTLY, AND NOT A HASH OF IT. This changed in ED3 and it was a
   * bug fix, not a tidy up.
   *
   * The key used to be `ix * 73856093 ^ iz * 19349663`, and the reason given
   * was that a collision is safe: two cells sharing one list only ever show a
   * lookup MORE strokes than it should, and every extra one answers 0 outside
   * its own radius. That is true of a lookup. It is NOT true of the insert.
   *
   * `put` walks every cell a stroke covers and pushes the stroke into each. If
   * two of THAT STROKE'S OWN cells collide, the stroke goes into the same list
   * twice and is applied twice, so a raise raises double and a flatten pulls to
   * a height it already reached. A stroke covering four cells is not going to
   * hit that; ED3's 600 m mountain covers 1,444 of them on a 32 m grid, and it
   * did: measured on a 2,000 stroke world, a point at -128, -112 came out
   * 1,383.95 m off what a walk of every stroke gives.
   *
   * So the key is a pair packed into one double. Each axis is offset into
   * [0, 2^26) and the pair fits in 2^52, inside the 2^53 an integer keeps
   * exactly, which covers cells from -2^25 to 2^25: at the 32 m grid that is a
   * world 2.1 billion metres across, which is enough. `terrain_edits.test.mjs`
   * drives the indexed answer against a walk of all 2,000 strokes and against
   * the old hash, both.
   */
  const CELL_BIAS = 0x2000000;          // 2^25
  const CELL_SPAN = 0x4000000;          // 2^26
  const cellKey = (ix, iz) => (ix + CELL_BIAS) * CELL_SPAN + (iz + CELL_BIAS);

  function reindex() {
    index = new Map();
    for (const s of strokes) put(s);
  }
  /** One stroke into every cell it touches, in the order the strokes were made. */
  function put(s) {
    const reach = reachOf(s);
    const i0 = Math.floor((s.x - reach) / GRID), i1 = Math.floor((s.x + reach) / GRID);
    const j0 = Math.floor((s.z - reach) / GRID), j1 = Math.floor((s.z + reach) / GRID);
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const k = cellKey(i, j);
        const list = index.get(k);
        if (list) list.push(s); else index.set(k, [s]);
      }
    }
  }
  function at(x, z) {
    if (!index) reindex();
    return index.get(cellKey(Math.floor(x / GRID), Math.floor(z / GRID))) || null;
  }
  /**
   * How many water strokes are on the ground, kept rather than counted.
   *
   * `api.wet` is asked on every vertex of every chunk exactly as `api.live` is,
   * and for the same reason it has to be a property read: a world with no water
   * in it must not pay for a walk of the list to find that out. `stroke()`
   * bumps it, and every path that rewrites the list wholesale recounts.
   */
  let waterCount = 0;
  const recount = () => { waterCount = 0; for (const s of strokes) if (WATER_SET.has(s.kind)) waterCount++; };
  const mark = () => { api.live = strokes.length > 0; api.wet = waterCount > 0; };
  const touch = () => { version++; index = null; recount(); mark(); };

  /** A stroke, cleaned up, with its captured samples taken. Throws on nonsense. */
  function makeStroke(input) {
    const s = { ...input };
    if (!STROKE_KINDS.includes(s.kind)) throw new Error(`no such stroke kind: ${s.kind}`);
    if (!Number.isFinite(s.x) || !Number.isFinite(s.z)) throw new Error('a stroke needs x and z');
    s.r = Math.max(MIN_R, Number.isFinite(s.r) ? s.r : 8);
    if (!Number.isFinite(s.amount)) s.amount = s.kind === 'smooth' ? SMOOTH_PULL : s.kind === 'erode' ? ERODE_PULL : 1;
    if (s.yaw != null && !Number.isFinite(s.yaw)) s.yaw = 0;
    // THE CLAMPS ARE HERE AND NOWHERE ELSE, so the number the words report is
    // the number the ground got. A mountain asked for at 4 km wide comes back
    // at 600 m and says 600.
    if (s.kind === 'mountain') {
      s.r = Math.min(s.r, MOUNTAIN_MAX_R);
      s.amount = Math.min(Math.abs(s.amount), MOUNTAIN_MAX_AMOUNT);
      if (s.roughness != null) s.roughness = clamp01(s.roughness);
    }
    if (s.kind === 'ridge' || s.kind === 'valley') {
      s.length = Math.max(0, Number.isFinite(s.length) ? s.length : 0);
      s.amount = Math.min(Math.abs(s.amount), MOUNTAIN_MAX_AMOUNT);
      if (!Number.isFinite(s.yaw)) s.yaw = 0;
    }
    // A SEED IN THE STROKE, not derived at read time. Derived, it would be
    // derived by whatever code read it, and two readers is two mountains.
    if ((s.kind === 'mountain' || s.kind === 'noise') && !Number.isFinite(s.seed)) {
      s.seed = (Math.round(s.x) * 73856093 ^ Math.round(s.z) * 19349663 ^ (s.id || nextId) * 83492791) >>> 0;
    }
    if (s.kind === 'ground') {
      s.word = s.word || s.ground || 'dirt';
      if (!GROUND_WORDS.includes(s.word)) throw new Error(`no such ground: ${s.word}, try ${GROUND_WORDS.join(', ')}`);
    }
    if (WATER_SET.has(s.kind)) fillWater(s);
    /**
     * ED5: the two feathering knobs, clamped here and DROPPED where the kind
     * does not take them.
     *
     * Dropped, and not left on the stroke to be ignored, because a `hardness`
     * sitting on a saved lake is a number a reader might one day believe. A
     * knob left OFF is not defaulted into the stroke either: absence is what a
     * file written before ED5 looks like, and `hardnessOf` is the one place
     * that says what absence means.
     */
    if (Number.isFinite(s.hardness) && HARD_SET.has(s.kind)) s.hardness = clamp01(s.hardness);
    else delete s.hardness;
    if (Number.isFinite(s.opacity) && OPACITY_SET.has(s.kind)) s.opacity = clamp01(s.opacity);
    else delete s.opacity;
    // The kinds that are a function of the ground take their sample once, now,
    // and carry it, which is what makes the file portable.
    const wantsH0 = s.kind === 'flatten' || s.kind === 'smooth' || s.kind === 'erode'
      || (s.kind === 'plateau' && s.height == null);
    if (wantsH0 && s.h0 == null) {
      if (!baseHeight) throw new Error(`a ${s.kind} stroke needs a baseHeight sampler or its own h0`);
      s.h0 = (s.kind === 'smooth' || s.kind === 'erode') ? ringAverage(s) : baseHeight(s.x, s.z);
    }
    if (s.id == null) s.id = nextId++;
    else nextId = Math.max(nextId, (s.id | 0) + 1);
    return s;
  }

  // ---- ED4: a water stroke, filled in ---------------------------------------

  /**
   * The last river whose mouth this stroke's head lands in, or null.
   *
   * Walked backwards, so the newest wins, and only over strokes ALREADY on the
   * ground: `load()` builds the list in file order, so a saved chain rebuilds
   * itself the same way it was drawn. It never fires on a loaded file anyway,
   * because a loaded river carries its own `level`.
   */
  function riverBefore(s) {
    for (let i = strokes.length - 1; i >= 0; i--) {
      const p = strokes[i];
      if (p.kind !== 'river') continue;
      if (Math.hypot(p.x2 - s.x, p.z2 - s.z) <= RIVER_CHAIN) return p;
    }
    return null;
  }

  /** The ground here, for a level nobody gave. Refuses by name when it cannot ask. */
  function groundFor(s, x, z) {
    if (!baseHeight) {
      throw new Error(`a ${s.kind} stroke needs a level in metres, or a baseHeight sampler to take one off the ground`);
    }
    return baseHeight(x, z);
  }

  /**
   * Every knob a water stroke needs, defaulted, clamped and WRITTEN INTO THE
   * STROKE, so the file carries the whole answer and a machine that never took
   * the sample lays the same water back down.
   *
   * A `lake` written before ED4 carried an absolute `floor` and got its water
   * from the world's sea level. It is read here as a surface at that old sea
   * level with the same bed under it, and `floor` is dropped so nothing
   * downstream can read two truths.
   */
  function fillWater(s) {
    if (s.kind === 'lake' && !Number.isFinite(s.level) && Number.isFinite(s.floor)) {
      s.level = 0;
      if (!Number.isFinite(s.depth)) s.depth = Math.max(0, 0 - s.floor);
    }
    delete s.floor;
    if (s.kind === 'drain') { delete s.level; delete s.depth; return; }
    if (s.kind === 'sea') {
      s.r = Math.min(s.r, SEA_MAX_R);
      if (!Number.isFinite(s.level)) s.level = SEA_SURFACE;
      delete s.depth;
      return;
    }
    if (s.kind === 'river') {
      if (!Number.isFinite(s.x2)) s.x2 = s.x;
      if (!Number.isFinite(s.z2)) s.z2 = s.z;
      s.width = Math.max(MIN_R * 2, Number.isFinite(s.width) ? s.width : RIVER_WIDTH);
      // A CHAIN IS TAKEN BEFORE THE LEVEL IS DEFAULTED, so a river that runs on
      // from another takes the water where the other left it rather than the
      // ground it happens to be standing on.
      if (!Number.isFinite(s.level)) {
        const prev = riverBefore(s);
        if (prev) {
          s.level = levelEndOf(prev);
          s.chained = prev.id;
          // snapped onto the joint, so the two ribbons meet with no step
          s.x = prev.x2; s.z = prev.z2;
        } else s.level = groundFor(s, s.x, s.z);
      }
      if (!Number.isFinite(s.levelEnd)) s.levelEnd = groundFor(s, s.x2, s.z2);
      if (!Number.isFinite(s.depth)) s.depth = RIVER_DEPTH;
      s.depth = Math.max(0, s.depth);
      if (s.h0 == null && baseHeight) s.h0 = baseHeight(s.x, s.z);
      return;
    }
    // lake and pond
    if (!Number.isFinite(s.level)) s.level = groundFor(s, s.x, s.z);
    if (!Number.isFinite(s.depth)) s.depth = s.kind === 'pond' ? POND_DEPTH : LAKE_DEPTH;
    s.depth = Math.max(0, s.depth);
    if (s.h0 == null && baseHeight) s.h0 = baseHeight(s.x, s.z);
  }

  /** The average height of a ring at SMOOTH_RING radii out, taken once. */
  function ringAverage(s) {
    const rr = s.r * SMOOTH_RING;
    let sum = 0, n = 0;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      sum += baseHeight(s.x + Math.cos(a) * rr, s.z + Math.sin(a) * rr); n++;
    }
    sum += baseHeight(s.x, s.z); n++;
    return sum / n;
  }

  const api = {
    /**
     * A PLAIN BOOLEAN, and the reason it is not `count > 0`.
     *
     * `field.sampleAt` asks this on every vertex of every chunk of the world,
     * so the ordinary case (nobody has cut anything) has to be a property read
     * and not a call. Measured over 200,000 samples: asking `heightDelta` and
     * `groundOverride` on an empty list cost 5.2% of sampleAt, this costs 1.3%.
     * Kept true by `mark()` on every path that can change the list.
     */
    live: false,
    /**
     * Whether there is any water on the ground at all, the same kind of plain
     * boolean and for the same reason: `field.sampleAt` asks it on every vertex
     * and a world with no lake in it pays one property read to find out.
     */
    wet: false,
    get strokes() { return strokes; },
    get version() { return version; },
    /** How many strokes are on the ground, and how many are waiting to come back. */
    get count() { return strokes.length; },
    get undoneCount() { return undone.length; },

    // ---- the header (ED3) ---------------------------------------------------
    /** 'sculpt' or 'generate'. What kind of world field.js is to hand back. */
    get mode() { return mode; },
    /** The flat world's height, ground word and lines. A COPY: callers mutate. */
    base() { return { ...base }; },
    /**
     * The header when it is a sculpt world, and null when it is not.
     *
     * This is the property `field.js` reads, and it is the whole join: a field
     * whose edits say `sculpt` puts the generator away. A getter and not a
     * stored flag, so there is one truth.
     */
    get sculpt() { return mode === 'sculpt' ? base : null; },
    /** Moves only when the header moves, which is when the WHOLE world rebuilds. */
    get baseVersion() { return baseVersion; },

    /**
     * Say what the flat world is. Returns what it became, and what changed.
     *
     * Refuses a ground word that carries no biome, by name, rather than taking
     * it and painting nothing: `BASE_GROUNDS` is the short list and the reason
     * is written beside it.
     */
    setBase(patch = {}) {
      const next = { ...base };
      const changed = [];
      if (patch.height != null) {
        if (!Number.isFinite(patch.height)) throw new Error('a base height has to be a number of metres');
        if (patch.height !== next.height) changed.push(`height ${next.height} to ${patch.height} m`);
        next.height = patch.height;
      }
      if (patch.ground != null) {
        if (!BASE_GROUNDS.includes(patch.ground)) {
          throw new Error(`a world cannot be made of ${patch.ground}: try ${BASE_GROUNDS.join(', ')}. The other words paint over a disc`);
        }
        if (patch.ground !== next.ground) changed.push(`ground ${next.ground} to ${patch.ground}`);
        next.ground = patch.ground;
      }
      if (patch.snowLine != null) {
        if (!Number.isFinite(patch.snowLine)) throw new Error('a snow line has to be a number of metres');
        if (patch.snowLine !== next.snowLine) changed.push(`snow line ${next.snowLine} to ${patch.snowLine} m`);
        next.snowLine = patch.snowLine;
      }
      if (patch.sea != null) { const v = !!patch.sea; if (v !== !!next.sea) changed.push(`the sea ${v ? 'back' : 'gone'}`); next.sea = v; }
      if (patch.places != null) { const v = !!patch.places; if (v !== !!next.places) changed.push(`the sheet's places ${v ? 'back' : 'gone'}`); next.places = v; }
      if (patch.beachLine != null) {
        if (!Number.isFinite(patch.beachLine)) throw new Error('a beach line has to be a number of metres');
        if (patch.beachLine !== next.beachLine) changed.push(`beach line ${next.beachLine} to ${patch.beachLine} m`);
        next.beachLine = patch.beachLine;
      }
      if (patch.mode != null) {
        if (!MODES.includes(patch.mode)) throw new Error(`no such mode: ${patch.mode}, try ${MODES.join(' or ')}`);
        if (patch.mode !== mode) changed.push(`mode ${mode} to ${patch.mode}`);
        mode = patch.mode;
      }
      base = next;
      if (changed.length) { baseVersion++; version++; }
      return { base: { ...base }, mode, changed };
    },

    /** Lay a stroke down. Returns the stroke as it was stored. */
    stroke(input) {
      const s = makeStroke(input);
      strokes.push(s);
      if (WATER_SET.has(s.kind)) waterCount++;
      done.push({ add: [s] });
      undone.length = 0;                 // a new stroke is a new future
      if (index) put(s);                 // one stroke into a live index, not a rebuild
      version++;
      mark();
      return s;
    },

    /**
     * Take the last STEP back. Returns the stroke, or, for a step that was a
     * reset, `{ kind: 'reset', restored: n, strokes }`. Null when there is none.
     */
    undo() {
      const step = done.pop();
      if (!step) return null;
      undone.push(step);
      if (step.drop) {
        // a reset, going backwards: everything it dropped comes back
        for (const s of step.drop) strokes.push(s);
        touch();
        return { kind: 'reset', restored: step.drop.length, strokes: step.drop.slice() };
      }
      let last = null;
      for (let i = 0; i < step.add.length; i++) last = strokes.pop();
      touch();
      return last;
    },

    /** Put the last undone step back. Returns it in the same two shapes, or null. */
    redo() {
      const step = undone.pop();
      if (!step) return null;
      done.push(step);
      if (step.drop) {
        strokes.length = Math.max(0, strokes.length - step.drop.length);
        touch();
        return { kind: 'reset', dropped: step.drop.length, strokes: step.drop.slice() };
      }
      let last = null;
      for (const s of step.add) { strokes.push(s); last = s; }
      touch();
      return last;
    },

    /**
     * Every stroke gone, in ONE step that `undo` puts back.
     *
     * Returns how many it dropped, counted off the list rather than claimed, so
     * the words the contract says are a measurement.
     */
    reset() {
      if (!strokes.length) return { dropped: 0 };
      const dropped = strokes.slice();
      strokes.length = 0;
      done.push({ drop: dropped });
      undone.length = 0;
      touch();
      return { dropped: dropped.length, caves: dropped.filter((s) => s.kind === 'cave').length };
    },

    /**
     * Metres to add to the ground at (x, z).
     *
     * `h` is the world's own height there, which `flatten` and `smooth` need.
     * `skipKind` drops one kind out of the answer, which is how field.js asks
     * which way a hillside falls without the cave's own cut in the way.
     *
     * The cell's list is in the order the strokes were laid, because `put`
     * walks `strokes` in order, so a flatten made after a mountain flattens the
     * mountain and not the ground it used to stand on.
     */
    heightDelta(x, z, h = 0, skipKind = null) {
      if (!strokes.length) return 0;
      const list = at(x, z);
      if (!list) return 0;
      return stackDelta(list, x, z, h, skipKind);
    },

    /**
     * The paint at (x, z): `{ word, mix }`, or null where none reaches.
     *
     * ONE WALK FOR BOTH ANSWERS, because `field.sampleAt` wants both on every
     * vertex of every chunk and asking twice would walk the cell's list twice.
     * `word` is the dominant word or null, `mix` is the weights.
     */
    groundAt(x, z) {
      if (!strokes.length) return null;
      const list = at(x, z);
      if (!list) return null;
      return stackGround(list, x, z);
    },
    /**
     * The word painted here, or null.
     *
     * Since ED5 that is the DOMINANT word of the mix rather than the last
     * stroke to cover the point, and where nothing painted stands over a half
     * it is null. With one full strength stroke over a point, which is what
     * every stroke written before ED5 is, the two rules give the same word.
     */
    groundOverride(x, z) {
      const g = api.groundAt(x, z);
      return g ? g.word : null;
    },
    /** The weight of every word painted here, or null. What the material blends by. */
    groundMixAt(x, z) {
      const g = api.groundAt(x, z);
      return g ? g.mix : null;
    },

    /**
     * Whether there is water over (x, z), and what its surface stands at.
     *
     * `h` is the finished ground there, strokes and all, because a body of
     * water only covers the ground it is HIGHER THAN: that is what makes the
     * bank of a lake a bank and the shore of a sea a shore, without anybody
     * having to draw the outline. `was` is what the world said before the
     * strokes had their say, so a `drain` can take the generator's own ocean
     * away as readily as it takes a lake away.
     *
     * The walk is the cell's list in the order the strokes were made, exactly
     * as `heightDelta`'s is, so the last thing somebody drew wins: a drain over
     * a lake is dry, and a lake drawn over that drain is wet again.
     *
     * `level` is null wherever the water is not one of these strokes', because
     * this file has no opinion about where the generator's sea level is.
     */
    waterAt(x, z, h = 0, was = false) {
      let water = !!was, level = null;
      if (!waterCount) return { water, level };
      const list = at(x, z);
      if (!list) return { water, level };
      for (let i = 0; i < list.length; i++) {
        const s = list[i];
        /**
         * ED5: an erase takes the water with everything else, and it takes it
         * back to `was` rather than to nothing.
         *
         * `was` is the world before any stroke had its say, so an erase over a
         * lake somebody dug leaves dry ground, and an erase over the
         * generator's own ocean leaves the ocean, because there the ocean IS
         * the blank canvas and the blank canvas back is the whole promise.
         * Water is a yes or a no and cannot be half taken away, so it goes
         * where the mask passes a half, which is exactly the disc
         * `waterBodies` cuts out of the surface it draws.
         */
        if (s.kind === ERASE_KIND) {
          const half = eraseHalfR(s);
          if (half > 0 && Math.hypot(x - s.x, z - s.z) < half) { water = !!was; level = null; }
          continue;
        }
        const w = waterOf(s, x, z);
        if (w === undefined) continue;
        if (w === null) { water = false; level = null; continue; }
        if (h < w) { water = true; level = w; }
      }
      return { water, level };
    },

    /**
     * Every body of water there is to DRAW, in the order it was laid.
     *
     * `water.js` builds one surface per row and nothing else, so this is the
     * whole of what the renderer knows about water: a disc for a lake, a pond
     * and a sea, a ribbon for a river, and the drains that came AFTER each of
     * them, which is how a surface gets a hole cut in it. A drain laid before a
     * lake is not in that lake's list, because a lake drawn over a drain is
     * water again and the two halves have to agree about that.
     */
    waterBodies() {
      const out = [];
      // ONLY THE BODIES A DRAIN ACTUALLY REACHES get it in their list, and that
      // is not tidiness: `water.js` rebuilds a mesh when its body's numbers
      // move, so handing every lake in the world a drain that is nowhere near
      // it would rebuild every surface in the world for one click.
      const reaches = (b, d) => {
        if (b.kind === 'river') {
          const seg = riverAt({ x: b.x, z: b.z, x2: b.x2, z2: b.z2 }, d.x, d.z);
          return seg.d < b.width / 2 + d.r;
        }
        return Math.hypot(b.x - d.x, b.z - d.z) < b.r + d.r;
      };
      for (const s of strokes) {
        if (s.kind === 'drain') {
          const d = { x: s.x, z: s.z, r: Math.max(MIN_R, s.r || 0) };
          for (const b of out) if (reaches(b, d)) b.drains.push(d);
          continue;
        }
        /**
         * ED5: an erase is a drain as far as the picture is concerned.
         *
         * It has to be. `waterAt` says there is no water inside the erasure and
         * this is what the renderer draws, so if the surface were left whole a
         * player would see a lake, walk into it and find dry ground. The disc
         * is `eraseHalfR`, the same one `waterAt` uses, so the water you can
         * see and the water you can swim in end in the same place.
         */
        if (s.kind === ERASE_KIND) {
          const r = eraseHalfR(s);
          if (r > 0) { const d = { x: s.x, z: s.z, r }; for (const b of out) if (reaches(b, d)) b.drains.push(d); }
          continue;
        }
        if (!SURFACE_SET.has(s.kind)) continue;
        out.push(s.kind === 'river'
          ? {
            id: s.id, kind: 'river', x: s.x, z: s.z, x2: s.x2, z2: s.z2,
            width: riverHalf(s) * 2, level: levelOf(s), levelEnd: levelEndOf(s), drains: [],
          }
          : {
            id: s.id, kind: s.kind, x: s.x, z: s.z,
            r: Math.max(MIN_R, s.r || 0), level: levelOf(s), drains: [],
          });
      }
      return out;
    },

    /**
     * Every cave mouth still standing, in the order they were cut.
     *
     * ED5: a mouth an erase has since gone over is NOT in this list. The cut in
     * front of it is masked out of the ground by the same eraser, so leaving
     * the site here would give the world a cave entrance standing in flat
     * ground with no hollow behind it, which `field.js` would build, the
     * streamer would light, and E would open. The mouth is a point, so the test
     * is the point, and it is the same half mask disc the water uses.
     */
    caves() {
      const out = [];
      for (const s of strokes) {
        if (s.kind === ERASE_KIND) {
          const r = eraseHalfR(s);
          if (r > 0) {
            for (let i = out.length - 1; i >= 0; i--) {
              if (Math.hypot(out[i].x - s.x, out[i].z - s.z) < r) out.splice(i, 1);
            }
          }
          continue;
        }
        if (s.kind === 'cave') out.push(s);
      }
      return out;
    },

    /**
     * How many strokes laid BEFORE this one its ring actually reaches.
     *
     * The number the words quote after an erase, and it is counted off the list
     * rather than estimated: `overlapsDisc` is the stroke's real shape and not
     * its bounding radius, and only the strokes before it are asked, because a
     * stroke laid after an erase is not masked by it. A stroke handed in that
     * is not in the list is counted against the whole list, which is what a
     * caller asking "what would this erase reach" wants.
     */
    maskedBefore(s) {
      if (!s || !Number.isFinite(s.x)) return 0;
      const r = Math.max(MIN_R, s.r || 0);
      let n = 0;
      for (const p of strokes) {
        if (p === s) break;
        if (p.kind === ERASE_KIND) continue;
        if (overlapsDisc(p, s.x, s.z, r)) n++;
      }
      return n;
    },

    /** The box every stroke fits inside, or null if there are none. */
    bounds() {
      if (!strokes.length) return null;
      let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
      for (const s of strokes) {
        const reach = reachOf(s);
        x0 = Math.min(x0, s.x - reach); x1 = Math.max(x1, s.x + reach);
        z0 = Math.min(z0, s.z - reach); z1 = Math.max(z1, s.z + reach);
      }
      return { x0, z0, x1, z1 };
    },

    /**
     * The file. Plain JSON, no functions, no undo history.
     *
     * The header goes out on EVERY file, sculpt or not, so a world saved from a
     * generated one says `"mode": "generate"` out loud rather than relying on
     * the reader's default. A file written before ED3 has no header and loads
     * as `generate`, which is what it was.
     */
    serialize() {
      return { v: 1, mode, base: { ...base }, strokes: strokes.map((s) => ({ ...s })) };
    },

    /**
     * Take a file as the whole truth. Accepts what `serialize` wrote, or a bare
     * array of strokes. Returns how many strokes were laid down.
     *
     * THE HEADER IS PART OF THE TRUTH. A file that says `sculpt` puts this list
     * into sculpt mode and a file with no header at all puts it back to
     * `generate`, so loading the same file twice cannot leave two different
     * worlds. `baseVersion` moves whenever the header does, which is what
     * `world_runtime.js` watches to know it must rebuild everything and not
     * just the ground under the strokes.
     */
    load(json) {
      const rows = Array.isArray(json) ? json : (json && Array.isArray(json.strokes) ? json.strokes : []);
      const wasMode = mode, wasBase = base;
      mode = json && MODES.includes(json.mode) ? json.mode : DEFAULT_MODE;
      base = { ...DEFAULT_BASE, ...(json && json.base && typeof json.base === 'object' ? json.base : null) };
      if (!BASE_GROUNDS.includes(base.ground)) base.ground = DEFAULT_BASE.ground;
      if (!Number.isFinite(base.height)) base.height = DEFAULT_BASE.height;
      if (!Number.isFinite(base.snowLine)) base.snowLine = DEFAULT_BASE.snowLine;
      if (!Number.isFinite(base.beachLine)) base.beachLine = DEFAULT_BASE.beachLine;
      if (wasMode !== mode || wasBase.height !== base.height || wasBase.ground !== base.ground
        || wasBase.snowLine !== base.snowLine || wasBase.beachLine !== base.beachLine) baseVersion++;
      strokes.length = 0; undone.length = 0; done.length = 0; nextId = 1;
      for (const row of rows) {
        try { strokes.push(makeStroke(row)); } catch (err) { console.warn('a stroke would not load', row, err.message); }
      }
      touch();
      return strokes.length;
    },

    /** Everything gone, as if the field had never been touched. Not undoable. */
    clear() { strokes.length = 0; undone.length = 0; done.length = 0; touch(); return true; },
  };
  return api;
}
