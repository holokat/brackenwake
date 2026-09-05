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
// What a prop is never allowed to stand on, in the order the gate asks:
// open water, the surf line, a graded road, a site's pad, the home clear
// around the origin, and ground steeper than its own kind will take. The gate
// is one function, `openAt`, and the placement and the test both call it, so
// the test path is the real path.

import { CHUNK, HOME_RADIUS, SEA_LEVEL } from './field.js';
import { rand2 } from './noise.js';
import { REALM_ZONES, weightOf } from './zones.js';
import { sitesNear as sitesNearField } from './sites.js';
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

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

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
});

const A = (kind, build, size, o = {}) => K(kind, build, size, { tier: 'anchor', ...o });

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
    A('hedgerow', 'hedge', 3.4, { weight: 3, slope: 0.5, run: { n: [6, 14], gap: 3.0, wander: 0.14 } }),
    A('drystone_wall', 'wall', 3.2, { weight: 2, slope: 0.5, run: { n: [5, 12], gap: 3.0, wander: 0.10 } }),
    A('hay_rick', 'rick', 4.2, { weight: 2, slope: 0.16 }),
    A('wayside_shrine', 'shrine', 2.6, { weight: 1, slope: 0.2, near: 'road' }),
    A('cart', 'cart', 3.4, { weight: 1, slope: 0.14, near: 'road' }),
    K('field_gate', 'gate', 2.8, { weight: 2, slope: 0.32 }),
    K('milestone', 'stele', 1.1, { weight: 2, slope: 0.45, near: 'road' }),
    K('signpost', 'signpost', 2.8, { weight: 1, slope: 0.4, near: 'road' }),
    K('beehive', 'hive', 0.9, { weight: 2, slope: 0.3 }),
    K('sheaf', 'sheaf', 1.4, { weight: 3, slope: 0.28 }),
    K('stile', 'stile', 1.5, { weight: 1, slope: 0.4 }),
    K('sarsen', 'boulder', 1.9, { weight: 3, slope: RUGGED, sink: 0.3 }),
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
    A('buried_wall', 'burywall', 6.0, { weight: 2, slope: 0.24, sink: 0.9, run: { n: [3, 7], gap: 5.0, wander: 0.12 } }),
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
    A('post_fence', 'fence', 2.6, { weight: 3, slope: 0.6, run: { n: [5, 11], gap: 2.6, wander: 0.18 } }),
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
 * May this kind stand here?
 *
 * One function, called by the placement and by the test, so what the test
 * proves about the gate is what the world does. `sites` is the short list of
 * sites near this chunk; the sample's own site is checked as well, so the gate
 * is right even with no list at all.
 *
 * Returns { ok, why, s, slope }. `why` names the first rule that refused.
 */
export function openAt(field, x, z, spec, sites = null) {
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

/** A site's pad plus its margin. A mine's mouths keep their own room too. */
export function inPad(site, x, z) {
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
  const sites = opts.sites
    || (opts.sitesNear ? opts.sitesNear(x0 + CHUNK / 2, z0 + CHUNK / 2, CHUNK + NEAR_SITE)
      : sitesNearField(field, x0 + CHUNK / 2, z0 + CHUNK / 2, CHUNK + NEAR_SITE));

  for (let az = 0; az < per; az++) for (let ax = 0; ax < per; ax++) {
    const cellX = cx * per + ax, cellZ = cz * per + az;
    const midX = cellX * ANCHOR + ANCHOR / 2, midZ = cellZ * ANCHOR + ANCHOR / 2;
    const realm = realmAt(midX, midZ);
    const anchors = tierOf(realm.id, 'anchor');
    const scatters = tierOf(realm.id, 'scatter');
    // Each try moves the candidate AND rolls a different kind, because the
    // ground refuses a kind, not a place: a cell too steep for a wreck may
    // still take a stack of reeds. When four tries have all been refused the
    // cell falls back to whichever of its realm's kinds tolerates the most
    // slope, so an anchor cell only ever stands empty over water, a road, a
    // pad or the home clear.
    let hit = null, near = null;
    for (let t = 0; t < TRIES && !hit; t++) {
      const jx = (rand2(cellX, cellZ * 7 + t, seed + 11) - 0.5) * 2 * JITTER * ANCHOR;
      const jz = (rand2(cellX * 7 + t, cellZ, seed + 12) - 0.5) * 2 * JITTER * ANCHOR;
      const x = midX + jx, z = midZ + jz;
      const probe = openAt(field, x, z, null, sites);
      if (t === 0) near = nearWhat(probe, midX, midZ, sites);
      const spec = pickWeighted(anchors, rand2(cellX, cellZ * 13 + t, seed + 13), near);
      const gate = openAt(field, x, z, spec, sites);
      if (!gate.ok) continue;
      hit = { spec, x, z, gate };
    }
    if (!hit) hit = stubborn(field, realm.id, cellX, cellZ, midX, midZ, seed, sites);
    if (hit) emit(out, field, hit.spec, hit.x, hit.z, cellX, cellZ, seed, realm.id, chunk, sites);

    // the scatter under this anchor cell, thickened where a road or a place is
    const dens = densityAt(realm.id, realm.weight) * (near === 'road' ? 1.9 : near === 'site' ? 1.6 : 1);
    for (let sz = 0; sz < sub; sz++) for (let sx = 0; sx < sub; sx++) {
      const scX = cellX * sub + sx, scZ = cellZ * sub + sz;
      if (rand2(scX, scZ, seed + 21) > SCATTER_CHANCE * dens) continue;
      const jx = (rand2(scX, scZ, seed + 22) - 0.5) * 2 * JITTER * SCATTER;
      const jz = (rand2(scX, scZ, seed + 23) - 0.5) * 2 * JITTER * SCATTER;
      const x = scX * SCATTER + SCATTER / 2 + jx, z = scZ * SCATTER + SCATTER / 2 + jz;
      const spec = pickWeighted(scatters, rand2(scX, scZ, seed + 24), near);
      const gate = openAt(field, x, z, spec, sites);
      if (!gate.ok) continue;
      emit(out, field, spec, x, z, scX, scZ, seed, realm.id, chunk, sites);
    }
  }
  return out;
}


const stubbornCache = new Map();
/** A realm's kinds, the most slope tolerant first, with the fussy ones dropped. */
function stubbornList(realm) {
  let list = stubbornCache.get(realm);
  if (!list) {
    list = kitFor(realm).filter((k) => !k.require).slice()
      .sort((a, b) => (b.slope - a.slope) || (a.kind < b.kind ? -1 : 1));
    stubbornCache.set(realm, list);
  }
  return list;
}

/**
 * The last word on an anchor cell that has refused four rolls. Walks the
 * realm's kinds from the most slope tolerant down, at the centre and then two
 * offsets, and takes the first that stands. Returns null only when the ground
 * itself is closed: water, a road, a pad, or the clear around home.
 */
function stubborn(field, realm, cellX, cellZ, midX, midZ, seed, sites) {
  const list = stubbornList(realm);
  const spots = [[0, 0], [ANCHOR * 0.22, -ANCHOR * 0.22], [-ANCHOR * 0.22, ANCHOR * 0.22]];
  const spec = list[0];       // the list is sorted, so nothing else could pass
  for (const [ox, oz] of spots) {
    const x = midX + ox, z = midZ + oz;
    const gate = openAt(field, x, z, spec, sites);
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

function record(field, spec, x, z, u, v, realm, chunk, run) {
  const s = spec.scale[0] + u * (spec.scale[1] - spec.scale[0]);
  return {
    kind: spec.kind, build: spec.build, realm, chunk,
    x, z,
    y: field.heightAt(x, z) - spec.sink * s,
    s,
    ry: v * Math.PI * 2,
    tilt: (u - 0.5) * 2 * spec.tilt,
    run,
  };
}

/** One prop, or the whole chain when the kind runs. */
function emit(out, field, spec, x, z, cellX, cellZ, seed, realm, chunk, sites) {
  const u = rand2(cellX, cellZ, seed + 31);
  const v = rand2(cellX, cellZ, seed + 32);
  if (!spec.run) { out.push(record(field, spec, x, z, u, v, realm, chunk, null)); return; }
  const { n, gap, wander } = spec.run;
  const count = n[0] + Math.floor(rand2(cellX, cellZ, seed + 33) * (n[1] - n[0] + 1));
  const runId = `${chunk}:${cellX},${cellZ}`;
  let a = v * Math.PI * 2, px = x, pz = z;
  for (let i = 0; i < count; i++) {
    const gate = openAt(field, px, pz, spec, sites);
    if (gate.ok) {
      const ru = rand2(cellX * 31 + i, cellZ, seed + 34);
      out.push({
        ...record(field, spec, px, pz, ru, v, realm, chunk, runId),
        // every segment of a run faces the way the run goes, or it is a heap
        ry: a,
        // which step of the run this is. A refused step leaves a gap, and the
        // index is what says a gap is a gap and not a jump
        ri: i,
      });
    } else if (i === 0) return;   // a run that cannot start does not start
    a += (rand2(cellX, cellZ * 31 + i, seed + 35) - 0.5) * 2 * wander;
    px += Math.sin(a) * gap; pz += Math.cos(a) * gap;
  }
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
  for (const [id, list] of Object.entries(kits)) {
    if (list.length < 8 || list.length > 12) bad.push(`${id}: ${list.length} kinds, wanted eight to twelve`);
    const seen = new Set();
    let anchors = 0, scatters = 0;
    for (const k of list) {
      if (seen.has(k.kind)) bad.push(`${id}: two kinds called ${k.kind}`);
      seen.add(k.kind);
      if (k.size < 0.5 || k.size > 12) bad.push(`${id}:${k.kind}: ${k.size} m, wanted 0.5 to 12`);
      if (!(k.weight > 0)) bad.push(`${id}:${k.kind}: no weight`);
      if (!(k.slope > 0)) bad.push(`${id}:${k.kind}: no slope limit`);
      if (!(k.scale[0] > 0) || k.scale[1] < k.scale[0]) bad.push(`${id}:${k.kind}: bad scale band`);
      if (bodies && !bodies[k.build]) bad.push(`${id}:${k.kind}: names a body "${k.build}" that does not exist`);
      if (k.tier === 'anchor') anchors++; else scatters++;
    }
    if (anchors < 2) bad.push(`${id}: ${anchors} anchor kinds, wanted at least two`);
    if (scatters < 4) bad.push(`${id}: ${scatters} scatter kinds, wanted at least four`);
  }
  if (bad.length) throw new Error(`dressing: ${bad.length} problem(s)\n  ${bad.join('\n  ')}`);
  return ALL_KINDS.length;
}

auditKits();
