import {LIVING_FOOTPRINTS} from '../living_catalog.js';
import {STRONGHOLD_FOOTPRINTS} from '../stronghold_assets.js';
// What each piece of the Greenwold is, as numbers.
//
// PURE. No THREE, no DOM. The bodies that these numbers drive live in
// `src/world/plan_models.js`, which imports this file and re-exports every
// table in it, so `plan_models.FOOTPRINT` is this table and there is only ever
// one of it. The split exists so that `src/mmo/plans/index.js` stays pure and
// the four files that have to read a plan (`site_models.js`, `dressing.js`,
// `npcs_runtime.js` and `monsters.js`) can do it without one of them dragging a
// renderer into a data module. `docs/mmo/wiring/P1.md` has the lines.

// ---------------------------------------------------------------- footprints
//
// [w, d, h] in metres: w across the piece's own front, d back from it, h to the
// top of the tallest part of it. `w` and `d` are what the audit tests overlap
// with, so they are the ground the piece really takes and not the ground the
// painting suggests. `h` is what the stand-in is built to and what the modelled
// glb is expected to match.
//
// Read off `docs/concepts/greenwold/MODELS.md` where it gives a size, and off
// `PLANS.md` where the plan does ("the inn ... 14 by 9 m footprint"). Where
// neither says, the number is measured against a 1.8 m person in the painting
// and is written down here so a model can be checked against it.
//
// FOR A RUN MODEL, `w` IS THE LENGTH ALONG THE LINE. A wall segment is 4 m of
// wall by 0.7 m of thickness, a road slab is 2 m of road by 6 m of width, and
// `auditPlanModels` refuses a run whose span is longer than its own `w`, which
// is what a fence with gaps in it looks like from the data.
export const FOOTPRINT = {
  ...LIVING_FOOTPRINTS,
  ...STRONGHOLD_FOOTPRINTS,
  // -- Hearthhome ------------------------------------------------------------
  inn: [14, 9, 9],
  smithy: [9, 7, 6],
  manor: [18, 10, 16],
  chapel: [12, 7, 18],
  bank: [8, 8, 6.5],
  stable: [12, 8, 6.5],
  stable_pen: [10, 8, 1.4],
  healer: [8, 7, 5.5],
  cottage_a: [8, 6, 5.5],
  cottage_b: [7, 7, 5.5],
  cottage_c: [9, 6, 5.5],
  well_pavilion: [4.2, 4.2, 3.6],
  stall_a: [3, 2.4, 2.8],
  stall_b: [3, 2.4, 2.8],
  stall_c: [3, 2.4, 2.8],
  waystone_village: [1.2, 0.9, 4],
  gate_tower: [7, 6, 9],
  stone_bridge_10m: [10, 4, 2.2],
  // 0.75 high, not 1: the user's Blender panel is 0.73 m (2 by 0.24 by 0.73,
  // measured from the glb), and fitting it to a metre would stretch the posts
  // by a third. The model is the authored look; the footprint follows it.
  mound_fence: [2, 0.24, 0.75],
  bench: [1.8, 0.5, 0.9],
  barrel: [0.8, 0.8, 1],
  crate: [0.9, 0.9, 0.8],
  sack: [0.7, 0.7, 0.6],
  flower_box: [1.2, 0.4, 0.4],
  hay_rick: [3, 3, 3],
  flint_wall_4m: [4, 0.7, 3],
  // the user's Blender corner: an L with two 2.7 m arms, measured from the glb.
  // Nothing places it yet (Hearthhome's wall is a ring with no right angle);
  // it is here so a plan with a walled yard can name it and the loader fetches it.
  flint_wall_corner: [5.4, 3.2, 3],
  lane_slab: [4, 4, 0.06],
  // -- the Mill Run ----------------------------------------------------------
  mill: [12, 8, 9],
  mill_wheel: [1.2, 6, 6],
  millers_house: [10, 7, 6],
  granary: [5, 5, 5],
  eel_weir: [6, 0.5, 1.6],
  footbridge: [8, 1.6, 1.2],
  stepping_stones: [4, 1.2, 0.3],
  cart_laden: [3.2, 1.8, 2],
  cart_empty: [3.2, 1.8, 1.4],
  willow: [10, 10, 12],
  lamp_post_iron: [0.5, 0.5, 4],
  // -- the Kingsroad ---------------------------------------------------------
  fingerpost: [1.6, 0.3, 3],
  milestone: [0.5, 0.4, 1],
  road_slab_2m: [2, 6, 0.08],
  road_kerb: [2, 0.3, 0.2],
  legion_tent: [4, 5, 2.6],
  legion_standard: [0.6, 0.6, 6],
  spear_rack: [2.2, 0.7, 1.8],
  brazier: [0.9, 0.9, 1.2],
  legion_crate: [1.2, 1, 0.9],
  camp_fence: [3, 0.25, 1.1],
  hedge_4m: [4, 1.4, 2.2],
  // -- the Standing Hedge ----------------------------------------------------
  boundary_stone: [0.6, 0.6, 0.7],
  offerings: [1.6, 1.6, 0.5],
  // -- the Old Cellars -------------------------------------------------------
  cellar_arch: [4, 3, 3.5],
  [OLD_CELLARS_EXTERIOR.id]: OLD_CELLARS_EXTERIOR.footprint,
  chain_lantern: [0.4, 0.4, 0.6],
  legion_banner: [0.8, 0.8, 3.2],
  cart_broken: [3, 2, 1.6],
  // -- the Chalk Pits --------------------------------------------------------
  chalk_face_4m: [4, 3, 12],
  headframe: [5, 5, 8],
  mine_mouth: [4, 2, 3.2],
  ore_cart: [2, 1.4, 1.5],
  rail_2m: [2, 1.6, 0.2],
  spoil_heap: [5, 5, 2.2],
  pick: [1, 0.3, 0.3],
  barrow: [1.6, 0.8, 0.8],
  foremans_hut: [5, 4, 3.2],
  // -- Highwayman's Hollow ---------------------------------------------------
  palisade_stake_3m: [3, 0.5, 3],
  lookout_platform: [3, 3, 6],
  tent_ragged: [3, 3.6, 2.2],
  campfire: [2.4, 2.4, 0.6],
  weapons_rack: [2.2, 0.7, 1.9],
  target_dummy: [1.2, 0.8, 2],
  loot_sack: [0.8, 0.8, 0.8],
  sheep_skeleton: [1.4, 0.8, 0.5],
  tarp_cart: [3.4, 2.2, 2.4],
  // -- the Beech Hangar ------------------------------------------------------
  beech_a: [10, 10, 22],
  beech_b: [9, 9, 20],
  beech_c: [8, 8, 18],
  fallen_beech: [14, 1.6, 1.6],
  badger_sett: [2.4, 2, 1.2],
  rooting_patch: [2.5, 2.5, 0.15],
  // -- the Sunken Chapel -----------------------------------------------------
  chapel_sunken: [7, 12, 10],
  headstone_a: [0.7, 0.25, 1],
  headstone_b: [0.6, 0.25, 1.1],
  headstone_c: [0.8, 0.3, 0.9],
  headstone_d: [0.6, 0.22, 1.2],
  headstone_e: [0.75, 0.28, 0.95],
  rowing_boat_rotten: [4, 1.5, 0.9],
  lily_pad_patch: [3, 3, 0.06],
  // -- the country between ---------------------------------------------------
  oak_a: [9, 9, 13],
  oak_b: [8, 8, 11],
  oak_c: [10, 10, 15],
  stone_wall_4m: [4, 0.6, 1.2],
  fence_rail_3m: [3, 0.2, 1.1],
  boulder_a: [1.6, 1.4, 1.1],
};

/**
 * The models that may be laid along a line, and how much of that line one piece
 * covers. A run is a wall, a hedge, a fence, a rail or a road: pieces made to
 * touch end to end, which is why the overlap rule does not apply to them and
 * why they carry a span here and nothing else does.
 */
export const RUN_SPAN = {
  flint_wall_4m: 4,
  stone_wall_4m: 4,
  hedge_4m: 4,
  fence_rail_3m: 3,
  camp_fence: 3,
  palisade_stake_3m: 3,
  mound_fence: 2,
  road_slab_2m: 2,
  lane_slab: 4,
  rail_2m: 2,
  chalk_face_4m: 4,
  eel_weir: 6,
};
export const isRunKind = (id) => Object.prototype.hasOwnProperty.call(RUN_SPAN, id);

/** The ground treatments a plan may lay. `lane` is a strip; the rest are areas. */
export const AREA_KINDS = ['lane', 'water', 'mud', 'bare', 'wheat'];

// ---------------------------------------------------- the stand-in per model
//
// One row per model id in `MODELS.md`. `body` is the builder above and `opts` is
// how that builder is dressed for this piece. `auditPlans` refuses a plan that
// names a model with no row here, so a typo in a JSON is a load error and not a
// hole in a village.

const S = (body, opts) => ({ body, opts: opts || {} });
export const STANDIN = {
  occult_tower: S('towered', { towerW: 10, spire: true, wall: 'stone', hallH: 17 }),
  ritual_altar: S('prop', { stone: 'stone' }),
  ...Object.fromEntries(Object.keys(LIVING_FOOTPRINTS).map(id=>[id,S('block')])),
  inn: S('house', { chimney: true, wallShare: 0.72 }),
  smithy: S('openShed'),
  manor: S('towered', { towerW: 6, steps: true, wall: 'stone', hallH: 10 }),
  chapel: S('towered', { towerW: 5, spire: true, wall: 'stone', hallH: 8 }),
  bank: S('house', { wall: 'stone', roof: 'roofDark', wallShare: 0.7 }),
  stable: S('stable'),
  stable_pen: S('pen'),
  healer: S('house', { chimney: true }),
  cottage_a: S('house', { chimney: true }),
  cottage_b: S('house', { chimney: true }),
  cottage_c: S('house', { chimney: true }),
  well_pavilion: S('well'),
  stall_a: S('stall', { awning: 'banner' }),
  stall_b: S('stall', { awning: 'metal' }),
  stall_c: S('stall', { awning: 'leafDark' }),
  waystone_village: S('stone'),
  gate_tower: S('gateTower'),
  stone_bridge_10m: S('bridge', { arch: true, parapet: true, deck: 'stone' }),
  mound_fence: S('fenceSeg'),
  bench: S('bench'),
  barrel: S('prop', { round: true }),
  crate: S('prop'),
  sack: S('prop', { round: true, stone: 'canvas' }),
  flower_box: S('prop', { flowers: true }),
  hay_rick: S('heap', { stone: 'roof' }),
  flint_wall_4m: S('wallSeg', { cap: true }),
  flint_wall_corner: S('wallSeg', { cap: true }),
  lane_slab: S('slab', { stone: 'earth' }),

  mill: S('mill'),
  mill_wheel: S('wheel'),
  millers_house: S('house', { chimney: true }),
  granary: S('granary'),
  eel_weir: S('weir'),
  footbridge: S('bridge', { rails: true }),
  stepping_stones: S('stepping'),
  cart_laden: S('cart', { load: 'canvas', shafts: true }),
  cart_empty: S('cart', { shafts: true }),
  willow: S('tree', { weeping: true, trunkShare: 0.35 }),
  lamp_post_iron: S('post', { head: 'lamp' }),

  fingerpost: S('post', { head: 'boards', pole: 'timber' }),
  milestone: S('stone', { stone: 'stoneDark' }),
  road_slab_2m: S('slab', { stone: 'stoneDark' }),
  road_kerb: S('slab', { stone: 'stone' }),
  legion_tent: S('tent', { canvas: 'dark', finial: true }),
  legion_standard: S('post', { head: 'sun', pole: 'dark' }),
  spear_rack: S('frame', { arms: true }),
  brazier: S('light'),
  legion_crate: S('prop', { stone: 'dark' }),
  camp_fence: S('fenceSeg'),
  hedge_4m: S('hedgeSeg'),

  boundary_stone: S('stone', { stone: 'stoneDark' }),
  offerings: S('offerings'),

  cellar_arch: S('arch'),
  [OLD_CELLARS_EXTERIOR.id]: S('arch'),
  chain_lantern: S('light', { hung: true }),
  legion_banner: S('post', { head: 'banner', pole: 'timber' }),
  cart_broken: S('cart', { broken: true }),

  chalk_face_4m: S('wallSeg', { stone: 'chalk', seams: true }),
  headframe: S('frame', { wheel: true, taper: true }),
  mine_mouth: S('arch', { timber: true, stone: 'timber' }),
  ore_cart: S('cart', { wheels: 4, load: 'chalk' }),
  rail_2m: S('slab', { stone: 'timber', rails: true }),
  spoil_heap: S('heap', { stone: 'chalk', ore: true }),
  pick: S('prop', { tool: true, stone: 'metal' }),
  barrow: S('barrow'),
  foremans_hut: S('house', { wall: 'timber', wallShare: 0.66 }),

  palisade_stake_3m: S('fenceSeg', { stakes: true }),
  lookout_platform: S('frame', { deck: true, deckAt: 5, rail: true, ladder: true }),
  tent_ragged: S('tent', { canvas: 'wallDark' }),
  campfire: S('fire'),
  weapons_rack: S('frame', { arms: true }),
  target_dummy: S('frame', { straw: true }),
  loot_sack: S('prop', { round: true, stone: 'canvas' }),
  sheep_skeleton: S('bones'),
  tarp_cart: S('cart', { load: 'canvas', wheels: 4 }),

  beech_a: S('tree', { trunkShare: 0.55, trunkR: 0.6 }),
  beech_b: S('tree', { trunkShare: 0.55, trunkR: 0.55 }),
  beech_c: S('tree', { trunkShare: 0.55, trunkR: 0.5 }),
  fallen_beech: S('fallen'),
  badger_sett: S('heap', { stone: 'earth', hole: true }),
  rooting_patch: S('slab', { stone: 'mud' }),

  chapel_sunken: S('towered', { towerW: 4, front: true, wall: 'stone', hallH: 7 }),
  headstone_a: S('stone', { stone: 'stoneDark', lean: 0.12 }),
  headstone_b: S('stone', { stone: 'stoneDark', lean: -0.16 }),
  headstone_c: S('stone', { stone: 'stoneDark', lean: 0.2 }),
  headstone_d: S('stone', { stone: 'stoneDark', lean: -0.1 }),
  headstone_e: S('stone', { stone: 'stoneDark', lean: 0.08 }),
  rowing_boat_rotten: S('boat'),
  lily_pad_patch: S('slab', { stone: 'leaf' }),

  oak_a: S('tree'),
  oak_b: S('tree'),
  oak_c: S('tree'),
  stone_wall_4m: S('wallSeg'),
  fence_rail_3m: S('fenceSeg'),
  boulder_a: S('heap', { stone: 'stoneDark' }),
};

export const hasStandIn = (id) => Object.prototype.hasOwnProperty.call(STANDIN, id);

/**
 * The pieces that keep their own name through the merge.
 *
 * Everything else shares one bucket, which is what holds the draw count down.
 * A piece is here when a player would point at it and say a word: a building,
 * the well, the gate, the standing stone, the mill, the chapel, the arch.
 */
export const SOLO = new Set([
  'inn', 'smithy', 'manor', 'chapel', 'bank', 'stable', 'healer',
  'well_pavilion', 'gate_tower', 'waystone_village',
  'mill', 'millers_house', 'granary', 'foremans_hut',
  'headframe', 'cellar_arch', 'chapel_sunken', 'lookout_platform',
  OLD_CELLARS_EXTERIOR.id,
  'mine_mouth', 'fingerpost', 'loot_sack',
]);
// The three cottages are NOT here on purpose. Every name in SOLO costs a draw
// call for every colour it is built out of, and Hearthhome measured 59 of a
// budget of 60 with them in and 47 with them out. A cottage is a cottage: the
// click still names the village, and nobody was ever going to need to know
// which of the three they were pointing at. Every building somebody KEEPS is
// still named, which is what the doors and the plates want.

/** The piece that is a waystone, and the piece that is a keep. */
export const WAYSTONE_MODEL = 'waystone_village';
export const KEEP_MODEL = 'manor';


/** How much clear ground a planned place keeps outside its own radius, metres. */
export const PLAN_MARGIN = 8;

/** The footprint a piece really takes, its own scale applied. */
/**
 * What a body can get over. A hedge stands 2.2 m to the eye but a jump clears
 * it: the support it offers the feet is capped here, so a field with four
 * hedges and no gate is not a cell (2026-09-08). Everything else supports at
 * its full height.
 */
export const VAULT_HEIGHT = { hedge_4m: 1.0 };
export function vaultHeightOf(model, height) {
  const v = VAULT_HEIGHT[model];
  return Number.isFinite(v) ? Math.min(v, height) : height;
}

export function footprintOf(piece) {
  const f = FOOTPRINT[piece.model];
  if (!f) return null;
  const s = piece.scale ?? 1;
  return [f[0] * s, f[1] * s, f[2] * s];
}

/**
 * Where a plan's composition really stands in the world.
 *
 * Eight of the nine stand once, at the place's centre. The Standing Hedge
 * stands nine times, on a ring a mile across, so anything that asks "is this
 * point inside the planned place" has to ask about all nine stops and not about
 * the middle of an empty field. `buildPlan` walks the same list.
 */
export function stopsOf(plan, site) {
  const rep = plan && plan.repeat;
  if (!rep || rep.kind !== 'ring' || !(rep.count > 0)) return [{ x: site.x, z: site.z, rot: 0 }];
  const out = [];
  for (let i = 0; i < rep.count; i++) {
    const a = (i / rep.count) * Math.PI * 2;
    out.push({
      x: site.x + Math.sin(a) * rep.radius,
      z: site.z + Math.cos(a) * rep.radius,
      rot: rep.face === 'in' ? a + Math.PI : a,
    });
  }
  return out;
}

/** Whether a world point falls inside a plan's ground, plus a margin. */
export function insidePlan(plan, site, x, z, margin = PLAN_MARGIN) {
  if (!plan) return false;
  const r = plan.radius + margin;
  for (const s of stopsOf(plan, site)) {
    if ((x - s.x) ** 2 + (z - s.z) ** 2 < r * r) return true;
  }
  return false;
}
import {OLD_CELLARS_EXTERIOR} from '../old_cellars_exterior.js';
