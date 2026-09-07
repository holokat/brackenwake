// What grows on the ground: trees, boulders, turf and ground cover.
//
// The forest is now Arbor's (src/world/arbor.js, the Arbor Forest Studio
// generator). The infrastructure is still flora's and V2's: the farm's
// TreeField (src/farm/tree_edit.js) keeps the authoritative list of trees as
// plain records and rebuilds one InstancedMesh per layer from it, with a
// raycast back-index so the axe and the pickaxe work, chop, mine, stumps and
// regrowth already written. What changed is what a layer draws and where the
// trees stand:
//
//   * a layer draws one Arbor PROTOTYPE at one detail band. Five prototypes are
//     grown per species from seeds derived from the world seed, one per settled
//     frame so no chunk load ever pays for a tree that has to be grown.
//   * the mix comes from arbor.FOREST_TYPES: the biome names a forest type, the
//     forest type names the species and their weights, and its default density
//     (Open / Natural / Dense) sets the spacing.
//   * the positions come from arbor.placeTrees: its jittered grid, its four
//     rolls per cell, its fbm thinning. flora's own exclusions (water, rivers,
//     roads, site clearings, the home clearing, the per species tree line) go
//     on top through placeTrees' `keep` hook, which is drawn from no rng, so a
//     rejected tree never shifts the ones around it.
//
// The record contract is unchanged. `of(t)` still reads x, z, gy, s, ry and
// returns { x, y, z, s, sy, ry }, so chopTree's topple, shudder's pivot,
// treeCopy, the raycast back-index, stumps and regrowth all work untouched.
// `t.vi`, the variant index, is still filled in from the record's own position
// when it is missing, so a record dumped by the tree editor and reloaded comes
// back as the same tree. `variants[i].baseR` still means the trunk radius at
// the base, which is what the stumps and `treesFor` read.
//
//   const flora = createFlora(scene, field, { sitesNear, homeClear });
//   chunks.js calls flora.onChunk(cx, cz, verts) and flora.offChunk(cx, cz)
//   main.js calls flora.update(nowMs, x, z) each frame: it ticks the wind
//   clock, feeds the grass tiler, grows one prototype when the world is quiet
//   and rebuilds any dirty species field.
//   foraging calls flora.treesFor(cx, cz) for the trunks in one chunk.

import { authoredResources } from './authored_resources.js';
import * as THREE from 'three';
import { createTreeField } from '../farm/tree_edit.js';
import { CHUNK, BIOMES } from './field.js';
import { roadsForCell, roadDistanceAt, ROAD_HALF_WIDTH, ROAD_REACH } from './roads.js';
import { SITE_CELL } from './sitegrid.js';
import { ZONE } from './zones.js';
import { hash2, rand2 } from './noise.js';
import {
  SPECIES as GEN_SPECIES, growTreeVariant, materialsFor, growBoulder, rockMaterial,
  tickWind, setWindStrength, stumpGeometry, stumpMaterial, LODS, LOD_RANGE,
  lodForDistance, geometryVariant,
} from './tree_gen.js';
import * as arbor from './arbor.js';
import { createGrass } from './grass.js';

export const CELL = 8;                       // one boulder candidate per 8 m cell
export const TREE_TIER = 17;                 // chunks at this many verts or more get trees
export const REBUILD_MS = 200;               // at most one field rebuild per kind per this
export const VARIANTS = 5;                   // Arbor prototypes grown per species
export const ROCK_VARIANTS = 5;
export const REBAND_M = 24;                  // the player moves this far and the bands are re-read
const HOME_CLEAR = 125;                      // the farm keeps its own surroundings
const SITE_CLEAR = 34;                       // clearing when a site has no flatR of its own
const clearingOf = (st) => (st.flatR != null ? st.flatR + 6 : SITE_CLEAR);
export const ORE_RING = [9, 22];             // ore rocks stand this far from a cave mouth
export const ORE_COUNT = 8;
export const STUMP_CAP = 512;                // felled trees on screen at once
export const STUMP_MS = 400;                 // how often the felled list is re-read
export const BIOME_PROBE = 9;                // samples a side when asking which biomes a chunk holds

// ---------------------------------------------------------------------------
// Roads, and the trees along them
// ---------------------------------------------------------------------------

/**
 * Metres from a road's centreline that no tree may stand inside.
 *
 * The old rule was `sampleAt().road > 0.15`, and that is not a distance. Road
 * strength is 1 on the centreline and 0 at ROAD_HALF_WIDTH, so 0.15 works out
 * at about 2.7 m and, worse, it is 0 everywhere a road has not been graded yet.
 * `roadDistanceAt` gives metres, so the rule can be metres.
 */
export const ROAD_CLEAR = Math.max(4, ROAD_HALF_WIDTH + 1);

/** Realms whose roads are planted on both sides. The Greenwold is the king's. */
export const AVENUE_REALMS = ['greenwold'];
export const AVENUE_STEP = 18;               // metres between one tree and the next
// Metres from the centreline to the line of trunks, and how far a trunk may
// wander off it so the line reads as a road and not a fence. The two together
// keep every avenue tree between ROAD_CLEAR and roads.ROAD_REACH of the centre:
// clear of the carriageway by a metre and a half of verge, and still close
// enough that roadDistanceAt can see it, which is what lets a test prove the
// avenue is beside the road rather than take it on trust.
export const AVENUE_OFFSET = ROAD_CLEAR + 1.2;
export const AVENUE_JITTER = 0.35;
export const AVENUE_MAX_SLOPE = 1.1;         // an avenue does not climb a cliff

/**
 * Which kind an avenue is planted with, per realm. One species to a road, so a
 * road reads as a road from a distance and not as forest that happens to be in
 * a line. The kind must be in the realm's own biome mix, and auditBiomeHarvest
 * checks that it is.
 */
export const AVENUE_KIND = { greenwold: 'beech' };

// ---------------------------------------------------------------------------
// Species: which Arbor recipe each kind of tree in this world is grown from.
//
// The KIND is the game's name for the tree and is what everything downstream
// keys on: the TreeField is `world:<kind>`, and interact.js's NOUNS reads the
// last segment of that name to decide what to call the thing under the cursor.
// So every kind that existed before still exists, and `spruce`, which NOUNS
// knew about and nothing produced, is now a real tree again.
//
//   kind      Arbor species        was
//   oak       oak                  oak
//   beech     beech                new: the third of Arbor's temperate mix
//   birch     birch                birch
//   pine      pine                 pine
//   fir       spruce               fir      (the conifers share the one recipe)
//   spruce    spruce               a dead entry in interact.js NOUNS
//   willow    willow               willow
//   palm      palm                 palm
//   sakura    sakura               sakura
//   dead      dead                 dead
//   cactus    (tree_gen's)         cactus   Arbor has no cactus; tree_gen keeps it
// ---------------------------------------------------------------------------

export const ARBOR_SPECIES = {
  oak: 'oak', beech: 'beech', birch: 'birch', pine: 'pine',
  spruce: 'spruce', fir: 'spruce',
  willow: 'willow', palm: 'palm', sakura: 'sakura', dead: 'dead',
};

/** Kinds still grown by tree_gen.js rather than by Arbor. */
export const GEN_KINDS = ['cactus'];

/**
 * A mix entry naming an Arbor species becomes one or more kinds. Only `spruce`
 * splits: the game has always called its conifer a fir, and NOUNS knows both
 * words, so the one recipe is grown twice under two names at different seeds.
 * A boreal forest then has two conifer silhouettes in it instead of one.
 */
export const SPLIT = { spruce: [['fir', 0.5], ['spruce', 0.5]] };

/**
 * Kinds spliced into a biome's mix that Arbor does not grow. The weight is
 * taken off the top and the Arbor weights are scaled down to make room, so the
 * mix still sums to 1.
 */
export const EXTRA = { desert: [['cactus', 0.34]] };

/**
 * `detail` per kind, the one lever arbor.js adds over the reference: it scales
 * the ring segment count and how many of the leaves a tree draws actually get
 * built, and 1.0 IS the reference. It does not move a branch: the growth rng
 * draws the same numbers at every detail, so the tree measured in a test is the
 * tree that ships. arbor.test.mjs proves that both ways.
 *
 * These are not taste, they are the budget: the near band of a chunk has to
 * stay under 250,000 triangles at Natural and under 500,000 at Dense, and
 * flora.test.mjs measures it per biome and fails if it drifts.
 *
 * A1 raised every one of them. The forest is laid out in stands now, so a
 * Natural chunk of meadow carries about two trees where it used to carry
 * twelve, and the near band went from 306,000 triangles, which was over the
 * budget it was supposed to be inside, to 57,000. Spending some of that back on
 * the trees the player is standing next to is the whole point of having it: a
 * canopy at 0.5 has half its leaves and shows the sticks through it. The
 * measured numbers per biome are in the near band table in flora.test.mjs.
 */
export const DETAIL = {
  oak: 0.9, beech: 0.9, birch: 0.85, pine: 0.85, spruce: 0.7, fir: 0.7,
  willow: 0.6, sakura: 0.75, palm: 1.0, dead: 0.9,
};

/**
 * The tree line and the slope limit, per kind, in metres and metres per 2 m.
 * The rule is per species and not one global TREE_LINE: an oak stops at 66 m, a
 * fir climbs to 95, dead wood stands to 110. The numbers for the kinds that
 * existed before are tree_gen's own, unchanged.
 */
export const LIMITS = {
  oak: { maxH: 66, maxSlope: 0.9 }, beech: { maxH: 66, maxSlope: 0.9 },
  birch: { maxH: 66, maxSlope: 0.9 }, pine: { maxH: 95, maxSlope: 1.35 },
  fir: { maxH: 95, maxSlope: 1.35 }, spruce: { maxH: 95, maxSlope: 1.35 },
  willow: { maxH: 40, maxSlope: 0.8 }, palm: { maxH: 24, maxSlope: 0.7 },
  sakura: { maxH: 50, maxSlope: 0.9 }, dead: { maxH: 110, maxSlope: 1.6 },
  cactus: { maxH: 40, maxSlope: 0.9 },
};

/**
 * Growing one prototype costs 2 to 13 ms, and rasterising a species' bark and
 * leaf sheets costs more again the first time. Paid on the frame a player first
 * walks into a boreal forest, five of those in a row is a visible stall. So a
 * field is created with ONE prototype and update() grows one more whenever the
 * world around the player has settled, in this order, until every kind has all
 * five.
 */
export const WARM_ORDER = [
  'oak', 'rock', 'birch', 'beech', 'fir', 'spruce', 'pine',
  'sakura', 'willow', 'palm', 'dead', 'cactus', 'ore',
];

/**
 * Chance per 8 m cell that a boulder stands there, by biome. Arbor grows no
 * rocks, so boulders keep flora's own per cell roll: a biome with nothing to
 * mine hands the player a pickaxe that does nothing, and `auditBiomeHarvest`
 * throws on any biome whose number reaches zero.
 *
 * D5, and it is the larger half of "way too many stones everywhere". The
 * dressing's own sarsen was the kind everybody blamed, at 28 to the square
 * kilometre; the boulders on THIS grid were 425 to the square kilometre of
 * Greenwold meadow, measured over the same 31 by 31 chunk square, because one
 * candidate falls in every 8 m cell and 0.03 of them stood. Fifteen boulders
 * to the hectare is a rockery, not a meadow.
 *
 * The three biomes cut are the three the farmed country is made of and shows
 * its edges in: the meadow itself, the shore it runs down to, and the blossom
 * ground between. The mountain keeps every stone it had, because a mountain is
 * made of them and it is where a pickaxe is meant to be swung; so do the
 * boreal, the desert and the snow, which are other realms' ground and were not
 * what the user was looking at.
 */
export const ROCK_DENSITY = {
  meadow: 0.0025, boreal: 0.06, desert: 0.09, beach: 0.006,
  sakura: 0.008, mountain: 0.24, snow: 0.08, ocean: 0,
};

/**
 * How much of a stand is its own species.
 *
 * 1 would be a plantation and 0 would be the scatter the world had before. At
 * 0.8 a grove of oak is a grove of oak with a beech or two in it, which is what
 * a wood looks like and, more to the point, what a wood looks like FROM
 * OUTSIDE: one shape repeated is what makes a stand read as a stand at 200 m.
 */
export const STAND_PURITY = 0.8;

/** Species that will only grow with their feet near water. */
export const WATER_SPECIES = new Set(['willow', 'palm']);
/** A palm needs warmth: below this temperature a beach or a wet desert grows a snag instead, so the Stormpeaks' shore is not Hawaii. */
 export const PALM_TEMP = 0.5;
const WET_H = 3.2;                   // this close to sea level counts as wet ground
const WET_RIVER = 0.05;
const MAX_SLOPE_ROCK = 2.0;          // boulders sit on slopes; that is where they came from

/** How big a boulder of this kind is. Trees take their scale from placeTrees. */
const SIZE = { rock: [1.00, 1.10], ore: [1.00, 0.70] };

// ---------------------------------------------------------------------------
// The mix
// ---------------------------------------------------------------------------

const mixCache = new Map();

/**
 * The kinds a biome grows and their weights, summing to 1. Derived from
 * arbor.FOREST_TYPES: the biome id IS a forest type id, its `mix` is the dry
 * mix and its `wetMix`, where it has one, is what grows with water near.
 * Willows are in the sakura type's wetMix and palms in the desert's, so a
 * riverbank grows something different from the ground fifty metres away.
 */
export function mixFor(biome, wet = false) {
  const key = biome + (wet ? ':wet' : '');
  const hit = mixCache.get(key);
  if (hit) return hit;
  const type = arbor.FOREST_TYPES[biome];
  const base = (wet && type?.wetMix) ? type.wetMix : (type?.mix || []);
  const extra = base.length ? (EXTRA[biome] || []) : [];
  const eSum = extra.reduce((a, e) => a + e[1], 0);
  const acc = new Map();
  const add = (k, w) => acc.set(k, (acc.get(k) || 0) + w);
  for (const [sp, w] of base) {
    for (const [k, f] of (SPLIT[sp] || [[sp, 1]])) add(k, w * f * (1 - eSum));
  }
  for (const [k, w] of extra) add(k, w);
  const out = [...acc.entries()];
  mixCache.set(key, out);
  return out;
}

/** Draw a kind out of a weighted mix with one roll in [0, 1). */
export function pickFrom(mix, u) {
  let t = u;
  for (const [k, w] of mix) { t -= w; if (t <= 0) return k; }
  return mix.length ? mix[mix.length - 1][0] : null;
}

/** Every kind any biome can produce, plus boulders and the cave-mouth ore. */
export const ALL_KINDS = (() => {
  const s = new Set(['rock', 'ore']);
  for (const b of BIOMES) for (const wet of [false, true]) for (const [k] of mixFor(b, wet)) s.add(k);
  return [...s];
})();

/** Is this kind grown by Arbor, or by tree_gen? */
export const isArborKind = (k) => !!ARBOR_SPECIES[k];
export const isGenKind = (k) => GEN_KINDS.includes(k);

/**
 * Every biome a player can stand in owes them both tools working. A biome with
 * nothing to chop hands you an axe that does nothing; a biome with nothing to
 * break hands you a pickaxe that does nothing. This is the guard that catches
 * it, and it also catches this merge's own failure modes: a mix naming a kind
 * no generator can grow, a kind with no tree line, a kind with no detail
 * setting, and a kind the warm order would never get round to building.
 */
export function auditBiomeHarvest() {
  const bad = [];
  for (const b of BIOMES) {
    if (!arbor.FOREST_TYPES[b]) { bad.push(`${b} has no forest type in arbor.js`); continue; }
    if (b === 'ocean') continue;
    if (!(ROCK_DENSITY[b] > 0)) bad.push(`${b} has nothing to mine`);
    for (const wet of [false, true]) {
      const mix = mixFor(b, wet);
      if (!mix.length) { bad.push(`${b} has nothing to chop${wet ? ' on wet ground' : ''}`); continue; }
      const sum = mix.reduce((a, m) => a + m[1], 0);
      if (Math.abs(sum - 1) > 1e-6) bad.push(`${b}${wet ? ' wet' : ''} mix sums to ${sum.toFixed(3)}, not 1`);
      for (const [k] of mix) {
        if (!isArborKind(k) && !isGenKind(k)) bad.push(`${b} grows "${k}", which no generator has a recipe for`);
        if (isGenKind(k) && !GEN_SPECIES[k]) bad.push(`${b} grows "${k}", which tree_gen has no recipe for`);
      }
    }
  }
  for (const k of ALL_KINDS) {
    if (k === 'rock' || k === 'ore') continue;
    if (!LIMITS[k]) bad.push(`"${k}" has no tree line`);
    if (isArborKind(k) && DETAIL[k] == null) bad.push(`"${k}" has no detail setting`);
    if (!WARM_ORDER.includes(k)) bad.push(`"${k}" is never warmed`);
  }
  for (const k of WARM_ORDER) if (!ALL_KINDS.includes(k)) bad.push(`the warm order builds "${k}", which nothing grows`);
  // The avenues. A realm that is planted has to exist, and the tree it is
  // planted with has to be one this world can actually grow, or a road through
  // the Greenwold is lined with nothing at all and nobody finds out until they
  // walk it.
  for (const realm of AVENUE_REALMS) {
    if (!ZONE[realm]) bad.push(`avenues are planted in "${realm}", which zones.js does not have`);
    const k = AVENUE_KIND[realm];
    if (!k) bad.push(`"${realm}" is planted with nothing`);
    else if (!ALL_KINDS.includes(k)) bad.push(`"${realm}" is planted with "${k}", which no biome grows`);
    else if (!LIMITS[k]) bad.push(`"${realm}" is planted with "${k}", which has no tree line`);
  }
  for (const realm of Object.keys(AVENUE_KIND)) {
    if (!AVENUE_REALMS.includes(realm)) bad.push(`"${realm}" has an avenue tree and is not on the avenue list`);
  }
  // The line of trunks has to fit between the two numbers roads.js owns: clear
  // of the carriageway, and inside the distance roadDistanceAt can see, or half
  // the avenue would be unmeasurable and the other half would be in the ruts.
  // If A2 ever widens a road, this is where it says so.
  if (AVENUE_OFFSET - AVENUE_JITTER < ROAD_CLEAR) {
    bad.push(`an avenue trunk can stand ${(AVENUE_OFFSET - AVENUE_JITTER).toFixed(2)} m off the centreline, `
      + `inside the ${ROAD_CLEAR} m nothing may stand in`);
  }
  if (AVENUE_OFFSET + AVENUE_JITTER > ROAD_REACH) {
    bad.push(`an avenue trunk can stand ${(AVENUE_OFFSET + AVENUE_JITTER).toFixed(2)} m off the centreline, `
      + `past the ${ROAD_REACH} m roadDistanceAt looks`);
  }
  if (bad.length) throw new Error(`flora: broken forest (${bad.join('; ')})`);
  return BIOMES.length;
}
auditBiomeHarvest();

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------

/**
 * Which grown prototype a record wears. Derived from where it stands, so it
 * survives a dump and reload of the tree editor's store, which only writes
 * x, z, gy, s, ry and alt. Memoised onto the record so dragging one in the
 * editor does not turn it into a different tree halfway across the field.
 *
 * Always ask for VARIANTS, never for however many prototypes have been grown so
 * far: a record repaired against a half built stand would keep the wrong index
 * for good. The layers take `vi % grown` instead, so a tree drawn before its own
 * prototype exists borrows one and changes to its own once, in the first second.
 */
export function variantOf(t, n) {
  if (t.vi == null || t.vi >= n || t.vi < 0) {
    t.vi = hash2(Math.round(t.x * 8), Math.round(t.z * 8), 9901) % n;
  }
  return t.vi;
}

const hexNum = (s) => parseInt(String(s).replace('#', ''), 16);

/**
 * The axe reaches six metres. Anything past the near band can therefore never
 * be chopped, so it has no business in a raycast: leaving it there made every
 * click test thousands of far instances, and a click on the sky through a
 * distant canopy came back "too far to chop" instead of passing through.
 * `pickTree` walks `field.meshes` and calls `raycast` on each, so a no-op
 * raycast takes a mesh out of the pick without taking it out of the scene.
 *
 * Shadows go the same way: only the near band casts, or the shadow pass costs
 * as much again as the colour pass for a shadow that is a pixel wide.
 */
const tagBand = (im, band, shadow) => {
  im.receiveShadow = true;
  im.castShadow = shadow;
  im.userData.lod = band;
  im.userData.pickable = band === 0;
  if (band !== 0) im.raycast = () => {};
};

// ---------------------------------------------------------------------------
// An Arbor species field
// ---------------------------------------------------------------------------

/**
 * One kind of tree: up to VARIANTS Arbor prototypes, each at three bands, as
 * TreeField layers.
 *
 * A layer draws one (prototype, band) pair and `of(t)` hands a record to
 * exactly one of them: the prototype its `vi` was born with, at the band its
 * distance from `centre` asks for. Empty layers cost nothing, because
 * tree_edit's rebuild skips a layer no record chose.
 *
 * `centre` is the live object flora.update writes the player position into, so
 * a rebuild re-reads the bands without anything having to be passed down.
 * `grow()` adds one prototype and relays the layers; it is the whole of the
 * lazy build, and it is what keeps growing a tree off the streaming path.
 */
function arborField(parent, kind, seed, centre) {
  const species = ARBOR_SPECIES[kind];
  const f = createTreeField({ name: 'world:' + kind, kind: 'tree', parent, layers: [] });
  f.species = species;
  f.kindId = kind;
  f.variants = [];
  f.barkColor = hexNum(arbor.SPECIES[species].bark);
  f.generator = 'arbor';
  // ONE bark material, one leaf material and one depth material for the whole
  // kind, taken from its first prototype. buildPrototype makes a set per tree,
  // and five identical MeshStandardMaterials over the same cached bark sheet
  // are five sets of uniforms and five chances for three to break a batch, for
  // no difference on screen: the sheet, the alphaTest and the wind hook are the
  // same for every prototype of a species.
  let mats = null;

  function relayer() {
    const n = f.variants.length;
    const layers = [];
    for (let band = 0; band < arbor.LOD_BANDS.length; band++) {
      const B = arbor.LOD_BANDS[band];
      // at distance several prototypes share one shape, so the layer count
      // falls from five a band to three and then two
      const seen = new Set();
      for (let slot = 0; slot < n; slot++) {
        const gv = geometryVariant(slot, band);
        if (seen.has(gv)) continue;
        seen.add(gv);
        const v = f.variants[gv];
        const of = (t) => {
          const m = f.variants.length;
          if (!m) return null;
          const s = variantOf(t, VARIANTS) % m;
          if (geometryVariant(s, band) !== gv) return null;
          if (lodForDistance(Math.hypot(t.x - centre.x, t.z - centre.z)) !== band) return null;
          return { x: t.x, y: t.gy, z: t.z, s: t.s, sy: t.sy, ry: t.ry };
        };
        layers.push({
          geo: v.bands[band].bark, mat: mats.bark, variant: gv, lod: band, part: 'bark',
          tag: (im) => tagBand(im, band, B.shadow), of,
        });
        if (v.bands[band].leaf) {
          layers.push({
            geo: v.bands[band].leaf, mat: mats.leaf, variant: gv, lod: band, part: 'leaf',
            tag: (im) => {
              // an alpha cut canopy with no depth material of its own casts the
              // shadow of a solid box, which is exactly what a naive alphaTest
              // tree looks like on the ground at noon
              if (B.shadow) im.customDepthMaterial = mats.depth;
              tagBand(im, band, B.shadow);
              // Arbor leaves carry their colour per vertex, not in
              // material.color, so a seasonal pass that tints the material
              // would do nothing to them. Leave `foliage` unset rather than tag
              // it and assume it worked; autumn belongs in buildPrototype.
              im.userData.foliage = null;
              im.userData.snowAmt = species === 'spruce' || species === 'pine' ? 0.7 : 0.45;
            },
            of,
          });
        }
      }
    }
    f.layers = layers;
  }

  /** Grow one more prototype. Returns false when the stand is already full. */
  f.grow = () => {
    const i = f.variants.length;
    if (i >= VARIANTS) return false;
    // arbor.forestPrototypes draws each tree's maturity at random over eight
    // draws, which over five comes out narrow often enough to be a stand of one
    // age. So the same 0.55 to 1.25 range is STRATIFIED across the five and
    // jittered inside its own stratum: a stand always has a sapling and an old
    // tree in it, and no two stands are the same stand.
    const s = hash2(i, kind.length * 37 + i, seed + 700);
    const t = (i + rand2(i, kind.length, seed + 701)) / VARIANTS;
    const maturity = Math.min(1, arbor.PROTO_DEFAULTS.maturity * (0.55 + t * 0.7));
    const proto = arbor.prototypeFor(species, s, { detail: DETAIL[kind], maturity });
    mats ||= { bark: proto.barkMat, leaf: proto.leafMat, depth: proto.depthMat };
    const bands = arbor.LOD_BANDS.map((B) => ({
      bark: arbor.barkLod(proto, B.barkDepth),
      leaf: proto.hasLeaves ? arbor.leafForBand(proto.leaf, B) : null,
    }));
    f.variants.push({
      proto, bands,
      baseR: proto.radius, height: proto.height, crownRadius: proto.crownRadius,
      // triangles this prototype draws at each band. Every field's variants
      // carry this under the same name whichever generator grew them, so a
      // budget measurement never has to ask which one it is looking at.
      bandTris: bands.map((b) => (b.bark.index.count / 3) + (b.leaf ? b.leaf.index.count / 3 : 0)),
    });
    relayer();
    return true;
  };
  f.grow();
  return f;
}

/**
 * A kind Arbor has no recipe for. cactus is the only one, and it is grown by
 * tree_gen exactly as it was: the same three tiers, the same materials, the
 * same sharing with distance. Nothing about the cactus changed in this merge.
 */
function genField(parent, kind, seed, centre) {
  const M = materialsFor(kind);
  const f = createTreeField({ name: 'world:' + kind, kind: 'tree', parent, layers: [] });
  f.species = kind;
  f.kindId = kind;
  f.variants = [];
  f.barkColor = GEN_SPECIES[kind]?.bark.base ?? 0x8a7358;
  f.generator = 'tree_gen';

  function relayer() {
    const n = f.variants.length;
    const layers = [];
    for (let lod = 0; lod < LODS.length; lod++) {
      const seen = new Set();
      for (let slot = 0; slot < n; slot++) {
        const gv = geometryVariant(slot, lod);
        if (seen.has(gv)) continue;
        seen.add(gv);
        const of = (t) => {
          const m = f.variants.length;
          if (!m) return null;
          if (geometryVariant(variantOf(t, VARIANTS) % m, lod) !== gv) return null;
          if (lodForDistance(Math.hypot(t.x - centre.x, t.z - centre.z)) !== lod) return null;
          return { x: t.x, y: t.gy, z: t.z, s: t.s, sy: t.sy, ry: t.ry };
        };
        const g = f.variants[gv].lods[lod];
        layers.push({
          geo: g.trunk, mat: M.bark, variant: gv, lod, part: 'bark',
          tag: (im) => tagBand(im, lod, LODS[lod].shadow), of,
        });
        if (g.leaves) {
          layers.push({
            geo: g.leaves, mat: M.leaf, variant: gv, lod, part: 'leaf',
            tag: (im) => {
              if (LODS[lod].shadow && M.leafDepth) im.customDepthMaterial = M.leafDepth;
              tagBand(im, lod, LODS[lod].shadow);
              im.userData.foliage = 0x4f9a4a;
              im.userData.snowAmt = 0.45;
            },
            of,
          });
        }
      }
    }
    f.layers = layers;
  }

  f.grow = () => {
    const i = f.variants.length;
    if (i >= VARIANTS) return false;
    const v = growTreeVariant(kind, seed, i);
    v.bandTris = v.lods.map((l) => l.tris.bark + l.tris.leaf);
    f.variants.push(v);
    relayer();
    return true;
  };
  f.grow();
  return f;
}

function boulderField(parent, name, opts) {
  const mat = rockMaterial(opts.ore ? 'ore' : 'stone');
  const f = createTreeField({
    name, kind: 'rock', hits: opts.hits, yield: opts.yield, parent, layers: [],
  });
  f.variants = [];
  f.generator = 'tree_gen';
  f.barkColor = null;

  f.grow = () => {
    const i = f.variants.length;
    if (i >= ROCK_VARIANTS) return false;
    const v = growBoulder((opts.seed + i * 7717) >>> 0, {
      detail: 2,
      squash: 0.58 + rand2(i, opts.seed, 71) * 0.30,
      lump: (opts.ore ? 0.24 : 0.19) + rand2(i, opts.seed, 72) * 0.14,
    });
    v.bandTris = [v.geo.index.count / 3, v.geo.index.count / 3, v.geo.index.count / 3];
    f.variants.push(v);
    f.layers = f.variants.map((vv, k) => ({
      geo: vv.geo, mat, variant: k, lod: 0, part: 'rock', tag: (im) => tagBand(im, 0, true),
      of: (t) => {
        const m = f.variants.length;
        return (variantOf(t, ROCK_VARIANTS) % m === k
          ? { x: t.x, y: t.gy, z: t.z, s: t.s, ry: t.ry }
          : null);
      },
    }));
    return true;
  };
  f.grow();
  return f;
}

// ---------------------------------------------------------------------------
// Placement. Pure, no THREE, so the node test drives it directly.
// ---------------------------------------------------------------------------

/** Wet ground: a riverbank, or low enough that the water table is near. */
export const isWet = (s) => s.river > WET_RIVER || s.h < WET_H;

/**
 * recordsFor pairs each spot placeTrees returned with the ground sample its
 * `keep` predicate took for it, BY POSITION IN THE LIST. That is only sound
 * because placeTrees calls `keep` exactly once per spot it goes on to return.
 * If that ever stopped being true, every tree in the chunk would be sampled at
 * the wrong place and nothing would look broken, so it throws rather than
 * drifting. Exported so the throw can be driven from a test without a seam in
 * the real path.
 */
export function pairCheck(spots, kept, biome = '?') {
  if (kept.length !== spots.length) {
    throw new Error(`flora: placeTrees over ${biome} kept ${kept.length} ground samples `
      + `for ${spots.length} spots; the pairing is by position and would be wrong`);
  }
  return spots.length;
}

/**
 * The nearest road to (x, z) within `m` metres of its centreline.
 *
 * roadDistanceAt looks no further than ROAD_REACH, which is twice the road's
 * half width, so anything past that is null and counts as open ground. A field
 * built with roads off has no roads to find and this is always false.
 */
export function roadWithin(field, x, z, m) {
  const rd = roadDistanceAt(field, x, z);
  return !!rd && rd.d < m;
}

/**
 * Every road that reaches into chunk (cx, cz).
 *
 * A road belongs to the site cell of the settlement at its lexically smaller
 * end and runs to a settlement in a touching cell, so the nine site cells about
 * this chunk hold every road that can possibly cross it. roads.js caches per
 * cell, so this is a map lookup after the first chunk of a cell.
 */
export function roadsNear(field, cx, cz) {
  const x0 = cx * CHUNK, z0 = cz * CHUNK;
  const sx = Math.floor(x0 / SITE_CELL), sz = Math.floor(z0 / SITE_CELL);
  const sx1 = Math.floor((x0 + CHUNK) / SITE_CELL), sz1 = Math.floor((z0 + CHUNK) / SITE_CELL);
  const out = [];
  const seen = new Set();
  for (let j = sz - 1; j <= sz1 + 1; j++) for (let i = sx - 1; i <= sx1 + 1; i++) {
    for (const r of roadsForCell(field, i, j)) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      if (r.maxX < x0 || r.minX > x0 + CHUNK || r.maxZ < z0 || r.minZ > z0 + CHUNK) continue;
      out.push(r);
    }
  }
  return out;
}

/**
 * The avenue: one tree each side of the road every AVENUE_STEP metres, in the
 * realms that plant them.
 *
 * The road is walked in metres from its own start, not per chunk, so the rhythm
 * carries across a chunk line and two chunks never plant the same tree twice:
 * a tree belongs to the chunk its trunk stands in and to no other. The realm is
 * read at the trunk, so an avenue stops where the Greenwold does.
 *
 * Every reason a tree is refused is the same list the wild trees pass: water, a
 * river, a site pad, the home clearing, a slope, and the species' own tree
 * line. An avenue tree that cannot stand is simply missing from the line, which
 * is what a gap in an avenue looks like.
 */
export function avenueFor(field, cx, cz, opts = {}) {
  const out = [];
  const roads = roadsNear(field, cx, cz);
  if (!roads.length) return out;
  const seed = field.seed;
  const x0 = cx * CHUNK, z0 = cz * CHUNK;
  const chunkKey = cx + ',' + cz;
  const homeClear = opts.homeClear ?? HOME_CLEAR;
  const sitesNear = opts.sitesNear || (() => []);
  const sites = sitesNear(x0 + CHUNK / 2, z0 + CHUNK / 2, CHUNK + 60);
  const slopeAt = (x, z) => Math.max(
    Math.abs(field.heightAt(x + 1, z) - field.heightAt(x - 1, z)),
    Math.abs(field.heightAt(x, z + 1) - field.heightAt(x, z - 1)));
  for (const road of roads) {
    const n = Math.floor(road.total / AVENUE_STEP);
    for (let k = 1; k < n; k++) {
      const along = k * AVENUE_STEP;
      // the segment this distance falls in, and the point and bearing on it
      let seg = road.segs[road.segs.length - 1];
      for (const sg of road.segs) if (along < sg.cum + sg.len) { seg = sg; break; }
      const u = Math.max(0, Math.min(1, (along - seg.cum) / seg.len));
      const px = seg.x0 + seg.dx * u, pz = seg.z0 + seg.dz * u;
      const inv = 1 / Math.max(1e-6, seg.len);
      const nx = -seg.dz * inv, nz = seg.dx * inv;          // the normal to the road
      for (const side of [-1, 1]) {
        const j = rand2(k, side + 2, seed + 8801) - 0.5;
        const off = AVENUE_OFFSET + j * AVENUE_JITTER * 2;
        const tx = px + nx * side * off, tz = pz + nz * side * off;
        if (tx < x0 || tx >= x0 + CHUNK || tz < z0 || tz >= z0 + CHUNK) continue;  // another chunk's tree
        const s = field.sampleAt(tx, tz);
        const kind = AVENUE_KIND[s.realm];
        if (!kind || !AVENUE_REALMS.includes(s.realm)) continue;
        if (s.water || s.river > 0.1) continue;
        if (Math.hypot(tx, tz) < homeClear) continue;
        if (roadWithin(field, tx, tz, ROAD_CLEAR)) continue;   // a bend that swung the tree back over the road
        const slope = slopeAt(tx, tz);
        if (slope > AVENUE_MAX_SLOPE) continue;
        const L = LIMITS[kind];
        if (!L || s.h > L.maxH || slope > L.maxSlope) continue;
        let onPad = false;
        for (const st of sites) if (Math.hypot(st.x - tx, st.z - tz) < clearingOf(st)) { onPad = true; break; }
        if (onPad) continue;
        out.push({
          x: tx, z: tz, gy: s.h - 0.15,
          // a planted tree is a planted tree: they are of an age and they are
          // upright, so the scale range is narrow and there is no lean
          s: 0.92 + rand2(k, side, seed + 8802) * 0.26,
          sy: 0.98 + rand2(k, side + 7, seed + 8803) * 0.14,
          ry: rand2(k, side + 11, seed + 8804) * Math.PI * 2,
          alt: hash2(Math.round(tx), Math.round(tz), seed + 26) % 3,
          oa: rand2(Math.round(tx), Math.round(tz), seed + 27) * Math.PI * 2,
          chunk: chunkKey, kind, avenue: true,
        });
      }
    }
  }
  return out;
}

/** Which biomes a chunk actually holds. A sliver at a border still grows its own. */
export function biomesIn(field, cx, cz, n = BIOME_PROBE) {
  const out = new Set();
  const x0 = cx * CHUNK, z0 = cz * CHUNK, step = CHUNK / (n - 1);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    out.add(field.biomeAt(x0 + i * step, z0 + j * step));
  }
  return [...out];
}

/**
 * Pure: the records a chunk contributes, by kind. Exported for the node test
 * and for roads.test.mjs.
 *
 * Trees come from arbor.placeTrees, once per biome the chunk holds so that each
 * biome's own spacing and thinning apply on its own ground. Every rejection
 * goes through `keep`, which placeTrees calls only after it has drawn all four
 * rolls for that cell, so a road or a lake is a hole in the forest rather than
 * a different forest.
 *
 * Boulders and the ore rings around cave mouths keep flora's own per cell roll.
 */
export function recordsFor(field, cx, cz, opts = {}) {
  const sitesNear = opts.sitesNear || (() => []);
  const seed = field.seed;
  const out = {};
  const x0 = cx * CHUNK, z0 = cz * CHUNK, n = CHUNK / CELL;
  const chunkKey = cx + ',' + cz;
  const sites = sitesNear(x0 + CHUNK / 2, z0 + CHUNK / 2, CHUNK + 60);
  const homeClear = opts.homeClear ?? HOME_CLEAR;

  // ore rings around cave mouths, placed by the cave's own hash so the ring is
  // whole across chunk borders and each chunk only keeps the rocks inside it
  for (const st of sites) {
    // a mine's surface seams come with their places and their metals worked
    // out by the zone (zones.js); the chunk keeps the ones inside it
    if (st.kind === 'mine' && Array.isArray(st.seams)) {
      st.seams.forEach((sm, i) => {
        if (sm.x < x0 || sm.x >= x0 + CHUNK || sm.z < z0 || sm.z >= z0 + CHUNK) return;
        (out.ore ||= []).push({
          x: sm.x, z: sm.z, gy: (sm.y ?? field.sampleAt(sm.x, sm.z).h) - 0.2,
          s: SIZE.ore[0] + rand2(i, st.cx + st.cz, seed + 47) * SIZE.ore[1],
          ry: rand2(i, st.cx - st.cz, seed + 48) * Math.PI,
          alt: 0, oa: 0, chunk: chunkKey, ore: true, tier: sm.ore || null,
        });
      });
      continue;
    }
    if (st.kind !== 'cave') continue;
    for (let i = 0; i < ORE_COUNT; i++) {
      const a = rand2(st.cx * 31 + i, st.cz, seed + 41) * Math.PI * 2;
      const d = ORE_RING[0] + rand2(st.cx, st.cz * 31 + i, seed + 42) * (ORE_RING[1] - ORE_RING[0]);
      const x = st.x + Math.cos(a) * d, z = st.z + Math.sin(a) * d;
      if (x < x0 || x >= x0 + CHUNK || z < z0 || z >= z0 + CHUNK) continue;
      const s = field.sampleAt(x, z);
      if (s.water) continue;
      (out.ore ||= []).push({
        x, z, gy: s.h - 0.2,
        s: SIZE.ore[0] + rand2(i, st.cx + st.cz, seed + 43) * SIZE.ore[1],
        ry: rand2(i, st.cx - st.cz, seed + 44) * Math.PI,
        alt: 0, oa: 0, chunk: chunkKey, ore: true,
        tier: Array.isArray(st.oreBand) && st.oreBand.length ? st.oreBand[i % st.oreBand.length] : null,
      });
    }
  }

  // A SCULPT WORLD GROWS NOTHING AND CARRIES NO STONES (ED3). "clear all the
  // rocks and just reset all the terrain": every tree and every boulder below
  // this line is the generator scattering on ground it also made, and none of
  // it belongs in a world somebody is cutting by hand.
  //
  // ABOVE this line, and deliberately, are the ore rocks that ring a cave mouth
  // and stud a mine's yard. Those are not scatter: they belong to a PLACE, and
  // in a sculpt world the only caves are the ones a person cut themselves with
  // a `cave` stroke, so their ore ring is part of what that stroke placed. With
  // no cave strokes cut there are none, which is what world_runtime.test.mjs
  // measures at boot.
  if (field.sculpt) {
    const authored = authoredResources(field, cx, cz, opts.spaces);
    for (const [kind, rows] of Object.entries(authored)) (out[kind] ||= []).push(...rows);
    return out;
  }

  const slopeAt = (x, z) => Math.max(
    Math.abs(field.heightAt(x + 1, z) - field.heightAt(x - 1, z)),
    Math.abs(field.heightAt(x, z + 1) - field.heightAt(x, z - 1)));

  // shared by trees and boulders: everything that is true of the ground itself
  const groundOk = (x, z, s, slope) => {
    if (Math.hypot(x, z) < homeClear) return false;
    if (s.water || s.river > 0.15) return false;
    // the road, in metres rather than in strength. A road is ROAD_HALF_WIDTH
    // wide, so ROAD_CLEAR of 4 leaves a metre of verge each side with nothing
    // standing in it, and a cart can pass.
    if (roadWithin(field, x, z, ROAD_CLEAR)) return false;
    if (slope > MAX_SLOPE_ROCK) return false;
    for (const st of sites) if (Math.hypot(st.x - x, st.z - z) < clearingOf(st)) return false;
    return true;
  };

  // --- trees, one placeTrees pass per biome in the chunk ---------------------
  for (const biome of biomesIn(field, cx, cz)) {
    if (!mixFor(biome, false).length) continue;                     // ocean
    // `keep` is called once per surviving spot, in the order placeTrees returns
    // them, so the samples it takes line up one for one with the spots and the
    // field is never asked about the same square metre twice
    const kept = [];
    const spots = arbor.placeTrees(biome, cx, cz, CHUNK, seed, {
      heightAt: field.heightAt,
      keep: (x, z) => {
        if (field.biomeAt(x, z) !== biome) return false;            // this biome's ground only
        const s = field.sampleAt(x, z);
        const slope = slopeAt(x, z);
        if (!groundOk(x, z, s, slope)) return false;
        kept.push({ s, slope });
        return true;
      },
    });
    pairCheck(spots, kept, biome);
    for (let i = 0; i < spots.length; i++) {
      const spot = spots[i], { s, slope } = kept[i];
      const wet = isWet(s);
      // A stand is a stand OF something. Most trees inside one take the roll
      // arbor drew for the whole stand, so a grove is one species with a few
      // others through it; a tree standing alone, and any tree on wet ground,
      // draws for itself, because a bank grows what banks grow whatever the
      // wood behind it is.
      const roll = (wet || !spot.standId || spot.mixRoll >= STAND_PURITY) ? spot.pick : spot.standRoll;
      let kind = pickFrom(mixFor(biome, wet), roll);
      if (!kind) continue;
      if (kind === 'palm' && s.temp < PALM_TEMP) kind = 'dead';    // a cold shore grows driftwood snags, not palms
      const L = LIMITS[kind];
      if (!L || s.h > L.maxH || slope > L.maxSlope) continue;       // the tree line is per species
      if (WATER_SPECIES.has(kind) && !isWet(s)) continue;           // a willow away from water is not a willow
      (out[kind] ||= []).push({
        x: spot.x, z: spot.z, gy: s.h - 0.15,
        s: spot.scale, sy: spot.yScale, ry: spot.yaw,
        alt: hash2(Math.round(spot.x), Math.round(spot.z), seed + 26) % 3,
        oa: rand2(Math.round(spot.x), Math.round(spot.z), seed + 27) * Math.PI * 2,
        chunk: chunkKey,
      });
    }
  }

  // --- the avenues, where a realm plants its roads --------------------------
  for (const rec of avenueFor(field, cx, cz, opts)) {
    const { kind, ...t } = rec;
    (out[kind] ||= []).push(t);
  }

  // --- boulders, on flora's own 8 m grid ------------------------------------
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const gx = cx * n + i, gz = cz * n + j;
    const x = x0 + (i + 0.15 + 0.7 * rand2(gx, gz, seed + 21)) * CELL;
    const z = z0 + (j + 0.15 + 0.7 * rand2(gx, gz, seed + 22)) * CELL;
    if (rand2(gx, gz, seed + 23) >= (ROCK_DENSITY[field.biomeAt(x, z)] || 0)) continue;
    const s = field.sampleAt(x, z);
    if (!groundOk(x, z, s, slopeAt(x, z))) continue;
    (out.rock ||= []).push({
      x, z, gy: s.h - 0.15,
      s: SIZE.rock[0] + rand2(gx, gz, seed + 24) * SIZE.rock[1],
      ry: rand2(gx, gz, seed + 25) * Math.PI,
      alt: hash2(gx, gz, seed + 26) % 3, oa: rand2(gx, gz, seed + 27) * Math.PI * 2,
      chunk: chunkKey,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Stumps
//
// tree_edit.js skips a felled record entirely when it rebuilds, so a chopped
// tree leaves nothing behind: the axe lands, the tree topples, and the ground
// where it stood is bare until it regrows minutes later. That reads as a bug.
// This is the cut stump, drawn outside the TreeField so it is not itself
// choppable and does not take part in the raycast back-index: one instanced
// mesh, one draw call, every kind, tinted per instance from the species' own
// bark colour and sized from the prototype's own trunk radius.
// ---------------------------------------------------------------------------

function createStumps(parent) {
  const mesh = new THREE.InstancedMesh(stumpGeometry(), stumpMaterial(), STUMP_CAP);
  mesh.name = 'flora:stumps';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.setColorAt(0, new THREE.Color(0xffffff));
  mesh.count = 0;
  parent.add(mesh);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const p3 = new THREE.Vector3(), s3 = new THREE.Vector3(), col = new THREE.Color();

  /** Re-read every field's felled records. Cheap: a filter over plain objects. */
  function refresh(kinds) {
    let n = 0;
    for (const f of Object.values(kinds)) {
      if ((f.kind || 'tree') !== 'tree' || !f.variants?.length) continue;
      const bark = f.barkColor ?? 0x8a7358;
      for (const t of f.trees) {
        if (!t.felledUntil || n >= STUMP_CAP) continue;
        const v = f.variants[variantOf(t, VARIANTS) % f.variants.length];
        const r = (v?.baseR ?? 0.35) * t.s * 1.10;
        const h = 0.40 * t.s * (0.75 + 0.5 * rand2(Math.round(t.x), Math.round(t.z), 5150));
        e.set(0, t.ry, 0); q.setFromEuler(e);
        p3.set(t.x, t.gy, t.z);
        s3.set(r, h, r);
        m4.compose(p3, q, s3);
        mesh.setMatrixAt(n, m4);
        mesh.setColorAt(n, col.setHex(bark));
        n++;
      }
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    // Three caches an InstancedMesh's bounding sphere the first time a ray
    // asks, and never looks again. A refill moves every instance, so a click on
    // any tree in a refilled chunk was rejected at the sphere and never
    // reached a triangle: the streamer's second pass over a chunk made its
    // trees unclickable. Dropping the cache makes the next ray recompute it.
    mesh.boundingSphere = null;
    return n;
  }
  return {
    mesh, refresh,
    get count() { return mesh.count; },
    dispose() { parent.remove(mesh); mesh.dispose(); mesh.material.dispose(); },
  };
}

export function createFlora(scene, field, opts = {}) {
  const group = new THREE.Group();
  group.name = 'world-flora';
  scene.add(group);
  const seed = field.seed;
  const kinds = {};
  const dirty = new Set();
  const lastBuilt = {};
  const have = new Map();          // chunk key -> true when its records are in
  const stats = {
    chunks: 0, records: 0, rebuilds: 0, species: 0, drawCalls: 0, stumps: 0,
    lastRebuildMs: 0, lastRebuild: null, tris: 0, prototypes: 0,
    buildMs: {}, grass: null,
  };
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  // where the bands are measured from; `of` reads it during a rebuild
  const centre = { x: 0, z: 0 };
  let bandedAt = null;
  let nowS = 0;

  function countPrototypes() {
    let n = 0;
    for (const f of Object.values(kinds)) n += f.variants.length;
    stats.prototypes = n;
  }

  /**
   * A kind's field is built the first time a record of it appears, with ONE
   * prototype in it. The other four arrive one per settled frame.
   */
  function fieldFor(kind) {
    if (kinds[kind]) return kinds[kind];
    const t0 = now();
    if (kind === 'rock') {
      kinds.rock = boulderField(group, 'world:rock', { seed: seed + 601, hits: 4 });
    } else if (kind === 'ore') {
      kinds.ore = boulderField(group, 'world:ore', { seed: seed + 602, hits: 5, yield: 'ore', ore: true });
    } else if (isArborKind(kind)) {
      kinds[kind] = arborField(group, kind, seed, centre);
    } else {
      kinds[kind] = genField(group, kind, seed + 700, centre);
    }
    stats.buildMs[kind] = +(now() - t0).toFixed(1);
    stats.species = Object.keys(kinds).length;
    countPrototypes();
    return kinds[kind];
  }

  /** One more prototype for the least finished stand, in WARM_ORDER. */
  function growOne() {
    for (const k of WARM_ORDER) {
      const f = kinds[k];
      if (!f) continue;
      if (f.variants.length >= ((f.kind || 'tree') === 'rock' ? ROCK_VARIANTS : VARIANTS)) continue;
      const t0 = now();
      if (!f.grow()) continue;
      stats.buildMs[k] = +((stats.buildMs[k] || 0) + (now() - t0)).toFixed(1);
      dirty.add(k);
      countPrototypes();
      return k;
    }
    const next = WARM_ORDER.find((k) => !kinds[k]);
    if (next) { fieldFor(next); return next; }
    return null;
  }

  function addChunk(cx, cz) {
    const key = cx + ',' + cz;
    if (have.has(key)) return;
    const recs = recordsFor(field, cx, cz, opts);
    for (const [k, list] of Object.entries(recs)) {
      if (!list.length) continue;
      const f = fieldFor(k);
      for (const r of list) f.trees.push(r);
      dirty.add(k);
      stats.records += list.length;
    }
    have.set(key, true); stats.chunks++;
  }
  function removeChunk(cx, cz) {
    const key = cx + ',' + cz;
    if (!have.has(key)) return;
    for (const [k, f] of Object.entries(kinds)) {
      const before = f.trees.length;
      f.trees = f.trees.filter((t) => t.chunk !== key);
      if (f.trees.length !== before) { dirty.add(k); stats.records -= before - f.trees.length; }
    }
    have.delete(key); stats.chunks--;
  }

  const grass = createGrass(group, field, { homeClear: 0 });
  stats.grass = grass.stats;
  const stumps = createStumps(group);
  let lastStumps = 0;

  function countDrawCalls() {
    let n = 0, tris = 0;
    for (const f of Object.values(kinds)) {
      n += f.meshes.length;
      for (const m of f.meshes) tris += (m.geometry.index.count / 3) * m.count;
    }
    stats.tris = tris;
    return n + grass.meshes.length + (stumps.count ? 1 : 0);
  }

  return {
    kinds, group, stats, grass, stumps,

    /** chunks.js: a chunk was built (or rebuilt at a new tier). */
    onChunk(cx, cz, verts) {
      if (verts >= TREE_TIER) addChunk(cx, cz); else removeChunk(cx, cz);
    },
    offChunk(cx, cz) { removeChunk(cx, cz); },

    /**
     * Every frame. Advances the one wind clock every leaf, needle and blade
     * reads, refills a few grass tiles, rebuilds dirty species fields at most
     * one pass per REBUILD_MS each, and grows one more tree when nothing else
     * wants the frame.
     */
    update(nowMs, centerX, centerZ) {
      nowS = nowMs / 1000;
      tickWind(nowS);          // tree_gen's clock: the grass and the cactus
      arbor.tick(nowS);        // arbor's clock: every leaf on every tree
      if (centerX !== undefined) {
        centre.x = centerX; centre.z = centerZ;
        // the detail bands are measured from the player, so they go stale as
        // the player walks. Re-read them every REBAND_M, not every frame: a
        // rebuild is the expensive part and 24 m of drift at a 55 m boundary
        // is not something anyone can see.
        if (!bandedAt || Math.hypot(centerX - bandedAt[0], centerZ - bandedAt[1]) > REBAND_M) {
          bandedAt = [centerX, centerZ];
          for (const k of Object.keys(kinds)) if ((kinds[k].kind || 'tree') === 'tree') dirty.add(k);
        }
      }
      // one field a frame at most, so a rebanding wave never lands as one hitch
      for (const k of dirty) {
        if (nowMs - (lastBuilt[k] || 0) < REBUILD_MS) continue;
        const t0 = now();
        kinds[k].rebuild();
        lastBuilt[k] = nowMs; dirty.delete(k); stats.rebuilds++;
        stats.lastRebuildMs = +(now() - t0).toFixed(2);
        stats.lastRebuild = k;
        break;
      }
      if (centerX !== undefined) grass.update(nowMs, centerX, centerZ);
      // the world is quiet: grow one more tree before the player walks into the
      // biome that needs it
      if (!dirty.size && !grass.queued) growOne();
      // a felled tree owes the player a stump; chopTree rebuilds the field on
      // its own clock, so the felled list is re-read on ours
      if (nowMs - lastStumps >= STUMP_MS) { lastStumps = nowMs; stats.stumps = stumps.refresh(kinds); }
      stats.drawCalls = countDrawCalls();
    },

    /**
     * The trunks standing in one chunk, for the forage layer: mushrooms by the
     * trunks, honey on the bark. `radius` is the trunk radius at the base in
     * metres, which is the prototype's own measured radius times the record's
     * scale. A felled tree is not in the list; a regrown one is again.
     */
    treesFor(cx, cz) {
      const key = cx + ',' + cz;
      const out = [];
      for (const f of Object.values(kinds)) {
        if ((f.kind || 'tree') !== 'tree' || !f.variants.length) continue;
        const n = f.variants.length;
        for (const t of f.trees) {
          if (t.chunk !== key || t.felledUntil) continue;
          const v = f.variants[variantOf(t, VARIANTS) % n];
          out.push({ x: t.x, z: t.z, radius: (v?.baseR ?? 0.35) * (t.s ?? 1) });
        }
      }
      return out;
    },

    /** The settings window's Grass density, 0 to 1. */
    setGrass(v) { grass.setDensity(v); },
    get grassDensity() { return grass.density; },

    /**
     * The settings window's Wind, and anything a storm ever wants to pull. 0 is
     * dead calm, 0.5 the studio's default, 1.5 a gale. Both generators are set,
     * so the grass and the cactus lean with the forest.
     */
    setWind(v) { arbor.setWind(v); setWindStrength(v); },
    get wind() { return arbor.getWind(); },
    /** Turn the world-space gust off and fall back to one flat wind everywhere. */
    setWindVariation(on) { arbor.setWindVariation(on); },

    /**
     * The wind at a place and a time, for gameplay: a falling leaf, wind audio,
     * a sail. The same expression the vertex shader evaluates, so a leaf and the
     * tree it fell off agree about which way the air is going.
     * `t` defaults to the clock update() last ticked.
     */
    windAt(x, z, t) { return arbor.windField(x, z, t ?? nowS); },

    get pending() { return dirty.size; },
    /** True once every kind has its field and every stand is full. */
    get warm() {
      return WARM_ORDER.every((k) => kinds[k])
        && Object.values(kinds).every((f) => f.variants.length
          >= ((f.kind || 'tree') === 'rock' ? ROCK_VARIANTS : VARIANTS));
    },
    dispose() {
      for (const f of Object.values(kinds)) for (const m of f.meshes) { group.remove(m); m.dispose?.(); }
      grass.dispose();
      stumps.dispose();
      scene.remove(group);
    },
  };
}

export { LOD_RANGE };
