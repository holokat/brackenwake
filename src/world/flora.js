// What grows on the ground: trees, boulders, turf and ground cover.
//
// The farm's TreeField (src/farm/tree_edit.js) is still the mechanism: plain
// records in, one InstancedMesh per layer out, a raycast back-index so the axe
// and the pickaxe work on it, chop, mine and regrow already written. What
// changed is what a layer draws. A layer used to be a cone or a sphere; now it
// is one baked variant of a grown tree from tree_gen.js, so a species field
// holds `variants * 2` layers (bark, leaves) and every record picks the variant
// it was always going to pick from a hash of where it stands.
//
// The record contract is unchanged. `of(t)` still reads x, z, gy, s, ry and
// still returns { x, y, z, s, ry }, so chopTree's topple, shudder's pivot,
// treeCopy, the raycast back-index, stumps and regrowth all work untouched. The
// one addition is `t.vi`, the variant index, which `of` fills in from the
// record's own position if it is missing. A record dumped by the tree editor
// and reloaded therefore comes back as the same tree.
//
// What grows where is decided per 8 m cell from the world field (biome, height,
// slope, water, rivers, roads) and a hash of the cell, so every player sees the
// same forest and a chunk that unloads comes back identical. Sites keep a
// clearing. Willows and palms want water and will not grow away from it.
//
//   const flora = createFlora(scene, field, { sitesNear, homeClear });
//   chunks.js calls flora.onChunk(cx, cz, verts) and flora.offChunk(cx, cz)
//   main.js calls flora.update(nowMs, x, z) each frame: it ticks the wind
//   clock, feeds the grass tiler and rebuilds any dirty species field.

import * as THREE from 'three';
import { createTreeField } from '../farm/tree_edit.js';
import { CHUNK, BIOMES } from './field.js';
import { hash2, rand2 } from './noise.js';
import {
  SPECIES, buildTreeVariants, materialsFor, growBoulder, rockMaterial, tickWind,
  stumpGeometry, stumpMaterial, LODS, lodForDistance, geometryVariant,
} from './tree_gen.js';
import { createGrass } from './grass.js';

export const CELL = 8;                       // one candidate per 8 m cell
export const TREE_TIER = 17;                 // chunks at this many verts or more get trees
export const REBUILD_MS = 200;               // at most one field rebuild per kind per this
export const VARIANTS = 6;                   // grown trees baked per species
export const ROCK_VARIANTS = 5;
export const REBAND_M = 24;                  // the player moves this far and the tiers are re-read
const HOME_CLEAR = 125;                      // the farm keeps its own surroundings
const SITE_CLEAR = 34;                       // clearing when a site has no flatR of its own
const clearingOf = (st) => (st.flatR != null ? st.flatR + 6 : SITE_CLEAR);
export const ORE_RING = [9, 22];             // ore rocks stand this far from a cave mouth
export const ORE_COUNT = 8;
export const STUMP_CAP = 512;                // felled trees on screen at once
export const STUMP_MS = 400;                 // how often the felled list is re-read

/**
 * Growing six variants of a species and rasterising its bark and leaf maps
 * costs 100 to 185 ms, measured in node. Paid on the frame a player first walks
 * into a boreal forest, that is a visible stall. So once the world around the
 * player has settled (nothing dirty, no grass tiles waiting) update() builds
 * one species that is not built yet, in this order, until they all are. The
 * work is identical either way; only when it lands changes.
 */
export const WARM_ORDER = ['oak', 'rock', 'birch', 'fir', 'pine', 'sakura', 'willow', 'palm', 'dead', 'cactus', 'ore'];

// Chance per candidate cell that a kind grows there, by biome. 64 cells per
// chunk, so 0.15 is about ten of a kind per chunk. One roll picks at most one
// kind, so the entries in a row are drawn from in order and must sum under 1.
export const DENSITY = {
  meadow:   { oak: 0.13, birch: 0.06, rock: 0.03 },
  boreal:   { pine: 0.26, fir: 0.28, rock: 0.06 },
  desert:   { palm: 0.05, cactus: 0.09, dead: 0.05, rock: 0.09 },
  beach:    { palm: 0.12, rock: 0.03 },
  sakura:   { sakura: 0.24, willow: 0.09, oak: 0.04, rock: 0.05 },
  mountain: { fir: 0.07, dead: 0.03, rock: 0.24 },
  snow:     { fir: 0.09, rock: 0.08 },
  ocean:    {},
};

/** Species that will only grow with their feet near water. */
export const WATER_SPECIES = new Set(['willow', 'palm']);
const WET_H = 3.2;                   // this close to sea level counts as wet ground
const WET_RIVER = 0.05;
const MAX_SLOPE_ROCK = 2.0;          // boulders sit on slopes; that is where they came from

/** How big a record of this kind is, before the tree's own baked variation. */
const SIZE = {
  rock:   [1.00, 1.10], ore: [1.00, 0.70],
  oak:    [0.86, 0.30], birch: [0.86, 0.30], pine: [0.88, 0.26], fir: [0.88, 0.26],
  willow: [0.86, 0.30], palm:  [0.86, 0.34], sakura: [0.86, 0.32],
  dead:   [0.80, 0.40], cactus: [0.90, 0.50],
};

/**
 * Every biome a player can stand in owes them both tools working. A biome with
 * nothing to chop hands you an axe that does nothing; a biome with nothing to
 * break hands you a pickaxe that does nothing. This is the guard that catches
 * it: sakura shipped with three species of tree and no boulders at all.
 */
export function auditBiomeHarvest() {
  const bad = [];
  for (const b of BIOMES) {
    if (b === 'ocean') continue;
    const row = DENSITY[b];
    if (!row) { bad.push(`${b} has no density row at all`); continue; }
    const trees = Object.keys(row).filter((k) => k !== 'rock' && k !== 'ore');
    const rocks = Object.keys(row).filter((k) => k === 'rock' || k === 'ore');
    if (!trees.length) bad.push(`${b} has nothing to chop`);
    if (!rocks.length) bad.push(`${b} has nothing to mine`);
    for (const k of trees) {
      if (!SPECIES[k]) bad.push(`${b} grows "${k}", which tree_gen has no recipe for`);
    }
    const total = Object.values(row).reduce((a, p) => a + p, 0);
    if (total > 1) bad.push(`${b} density sums to ${total.toFixed(2)}, so the last kinds can never roll`);
  }
  if (bad.length) throw new Error(`flora: biomes without harvestables (${bad.join('; ')})`);
  return BIOMES.length;
}
auditBiomeHarvest();

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------

/**
 * Which baked variant a record wears. Derived from where it stands, so it
 * survives a dump and reload of the tree editor's store, which only writes
 * x, z, gy, s, ry and alt. Memoised onto the record so dragging one in the
 * editor does not turn it into a different tree halfway across the field.
 */
export function variantOf(t, n) {
  if (t.vi == null || t.vi >= n || t.vi < 0) {
    t.vi = hash2(Math.round(t.x * 8), Math.round(t.z * 8), 9901) % n;
  }
  return t.vi;
}

/** A hex for the seasonal pass to read; the real colour lives in vertex data. */
const FOLIAGE_HEX = {
  oak: 0x6fb85a, birch: 0x7ec269, pine: 0x3d7a4c, fir: 0x35704a,
  willow: 0x6cb06a, palm: 0x4fa25f, sakura: 0xf2aac8, cactus: 0x4f9a4a,
};

/**
 * Leaves need a depth material of their own or an alpha-cut canopy casts the
 * shadow of a solid box, which is exactly what a naive alphaTest canopy looks
 * like on the ground at noon.
 */
/**
 * The axe reaches six metres. Anything past the near tier can therefore never
 * be chopped, so it has no business in a raycast: leaving it there made every
 * click test five thousand far instances, and a click on the sky through a
 * distant canopy came back "too far to chop" instead of passing through.
 * `pickTree` walks `field.meshes` and calls `raycast` on each, so a no-op
 * raycast takes a mesh out of the pick without taking it out of the scene.
 */
const tagTier = (im, lod) => {
  im.receiveShadow = true;
  // only the near tier casts: a shadow pass over every tree in the ring costs
  // as much again as the colour pass, and a shadow from 300 m away is a pixel
  im.castShadow = LODS[lod].shadow;
  im.userData.lod = lod;
  im.userData.pickable = lod === 0;
  if (lod !== 0) im.raycast = () => {};
};
const tagLeaves = (species, lod = 0) => (im) => {
  const M = materialsFor(species);
  if (M.leafDepth) im.customDepthMaterial = M.leafDepth;
  tagTier(im, lod);
  im.userData.foliage = FOLIAGE_HEX[species] || 0x6fb85a;
  im.userData.snowAmt = species === 'fir' || species === 'pine' ? 0.7 : 0.45;
};
const tagBark = (lod = 0) => (im) => { tagTier(im, lod); };

/**
 * One species: every variant, at every detail level, as TreeField layers.
 *
 * A layer draws one (variant, tier) pair, and `of(t)` hands a record to exactly
 * one of them: the variant it was born with, at the tier its distance from
 * `centre` asks for. Empty layers cost nothing, because tree_edit's rebuild
 * skips a layer no record chose.
 *
 * `centre` is the live object flora.update writes the player position into, so
 * a rebuild re-reads the tiers without anything having to be passed down.
 */
function speciesField(parent, species, seed, variants, centre) {
  const vs = buildTreeVariants(species, seed, variants);
  const M = materialsFor(species);
  const n = vs.length;
  const layers = [];
  for (let lod = 0; lod < LODS.length; lod++) {
    // at distance several variants share one shape, so the layer count falls
    // from six a tier to three and then two
    const seen = new Set();
    for (let i = 0; i < n; i++) {
      const gv = geometryVariant(i, lod);
      if (seen.has(gv)) continue;
      seen.add(gv);
      const pick = (t) => (geometryVariant(variantOf(t, n), lod) === gv
        && lodForDistance(Math.hypot(t.x - centre.x, t.z - centre.z)) === lod
        ? { x: t.x, y: t.gy, z: t.z, s: t.s, ry: t.ry }
        : null);
      const g = vs[gv].lods[lod];
      layers.push({ geo: g.trunk, mat: M.bark, variant: gv, lod, tag: tagBark(lod), of: pick });
      if (g.leaves) {
        layers.push({ geo: g.leaves, mat: M.leaf, variant: gv, lod, tag: tagLeaves(species, lod), of: pick });
      }
    }
  }
  const f = createTreeField({ name: 'world:' + species, kind: 'tree', parent, layers });
  f.species = species;
  f.variants = vs;
  return f;
}

function boulderField(parent, name, opts) {
  const mat = rockMaterial(opts.ore ? 'ore' : 'stone');
  const vs = [];
  for (let i = 0; i < ROCK_VARIANTS; i++) {
    vs.push(growBoulder((opts.seed + i * 7717) >>> 0, {
      detail: 2,
      squash: 0.58 + rand2(i, opts.seed, 71) * 0.30,
      lump: (opts.ore ? 0.24 : 0.19) + rand2(i, opts.seed, 72) * 0.14,
    }));
  }
  const n = vs.length;
  const layers = vs.map((v, i) => ({
    geo: v.geo, mat, variant: i, lod: 0, tag: tagBark(0),
    of: (t) => (variantOf(t, n) === i
      ? { x: t.x, y: t.gy, z: t.z, s: t.s, ry: t.ry }
      : null),
  }));
  const f = createTreeField({
    name, kind: 'rock', hits: opts.hits, yield: opts.yield, parent, layers,
  });
  f.variants = vs;
  return f;
}

// ---------------------------------------------------------------------------
// Placement. Pure, no THREE, so the node test drives it directly.
// ---------------------------------------------------------------------------

/** Wet ground: a riverbank, or low enough that the water table is near. */
export const isWet = (s) => s.river > WET_RIVER || s.h < WET_H;

/** Pure: the records a chunk contributes, by kind. Exported for the node test. */
export function recordsFor(field, cx, cz, opts = {}) {
  const sitesNear = opts.sitesNear || (() => []);
  const seed = field.seed;
  const out = {};
  const x0 = cx * CHUNK, z0 = cz * CHUNK, n = CHUNK / CELL;
  const chunkKey = cx + ',' + cz;
  const sites = sitesNear(x0 + CHUNK / 2, z0 + CHUNK / 2, CHUNK + 60);
  // ore rings around cave mouths, placed by the cave's own hash so the ring is
  // whole across chunk borders and each chunk only keeps the rocks inside it
  for (const st of sites) {
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
      });
    }
  }
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const gx = cx * n + i, gz = cz * n + j;
    const x = x0 + (i + 0.15 + 0.7 * rand2(gx, gz, seed + 21)) * CELL;
    const z = z0 + (j + 0.15 + 0.7 * rand2(gx, gz, seed + 22)) * CELL;
    if (Math.hypot(x, z) < (opts.homeClear ?? HOME_CLEAR)) continue;
    const s = field.sampleAt(x, z);
    if (s.water || s.river > 0.15 || s.road > 0.15) continue;   // the verge keeps its trees, the road does not
    const table = DENSITY[s.biome];
    if (!table) continue;
    const slope = Math.max(
      Math.abs(field.heightAt(x + 1, z) - field.heightAt(x - 1, z)),
      Math.abs(field.heightAt(x, z + 1) - field.heightAt(x, z - 1)));
    if (slope > MAX_SLOPE_ROCK) continue;
    let near = false;
    for (const st of sites) if (Math.hypot(st.x - x, st.z - z) < clearingOf(st)) { near = true; break; }
    if (near) continue;
    // one roll picks at most one kind per cell
    let roll = rand2(gx, gz, seed + 23), kind = null;
    for (const [k, p] of Object.entries(table)) { if (roll < p) { kind = k; break; } roll -= p; }
    if (!kind) continue;
    if (kind !== 'rock') {
      const P = SPECIES[kind];
      if (!P) continue;                                     // audited at load; belt and braces
      if (s.h > P.maxH || slope > P.maxSlope) continue;     // the tree line is per species
      if (WATER_SPECIES.has(kind) && !isWet(s)) continue;   // a willow away from water is not a willow
    }
    const size = SIZE[kind] || SIZE.oak;
    (out[kind] ||= []).push({
      x, z, gy: s.h - 0.15,
      s: size[0] + rand2(gx, gz, seed + 24) * size[1],
      ry: rand2(gx, gz, seed + 25) * Math.PI,
      alt: hash2(gx, gz, seed + 26) % 3, oa: rand2(gx, gz, seed + 27) * Math.PI * 2,
      chunk: chunkKey,
    });
  }
  return out;
}

/** Every kind any biome can produce, plus the cave-mouth ore. */
export const ALL_KINDS = [...new Set([...Object.values(DENSITY).flatMap(Object.keys), 'ore'])];

// ---------------------------------------------------------------------------
// Stumps
//
// tree_edit.js skips a felled record entirely when it rebuilds, so a chopped
// tree leaves nothing behind: the axe lands, the tree topples, and the ground
// where it stood is bare until it regrows minutes later. That reads as a bug.
// This is the cut stump, drawn outside the TreeField so it is not itself
// choppable and does not take part in the raycast back-index: one instanced
// mesh, one draw call, every species, tinted per instance from the species'
// own bark colour.
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
      if ((f.kind || 'tree') !== 'tree' || !f.variants) continue;
      const bark = SPECIES[f.species]?.bark.base ?? 0x8a7358;
      for (const t of f.trees) {
        if (!t.felledUntil || n >= STUMP_CAP) continue;
        const v = f.variants[variantOf(t, f.variants.length)];
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
    lastRebuildMs: 0, lastRebuild: null, tris: 0,
    buildMs: {}, grass: null,
  };
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  // where the tiers are measured from; `of` reads it during a rebuild
  const centre = { x: 0, z: 0 };
  let bandedAt = null;

  /**
   * Species fields are built the first time a record of that species appears.
   * Growing six variants and rasterising three 512 px bark maps is not free, so
   * building all eleven kinds at boot would stall the first frame; building the
   * four or five a region actually uses spreads that over the walk out of the
   * valley, one species at a time.
   */
  function fieldFor(kind) {
    if (kinds[kind]) return kinds[kind];
    const t0 = now();
    if (kind === 'rock') {
      kinds.rock = boulderField(group, 'world:rock', { seed: seed + 601, hits: 4 });
    } else if (kind === 'ore') {
      kinds.ore = boulderField(group, 'world:ore', { seed: seed + 602, hits: 5, yield: 'ore', ore: true });
    } else {
      kinds[kind] = speciesField(group, kind, seed + 700, VARIANTS, centre);
    }
    stats.buildMs[kind] = +(now() - t0).toFixed(1);
    stats.species = Object.keys(kinds).length;
    return kinds[kind];
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
     * reads, refills a few grass tiles, and rebuilds dirty species fields at
     * most one pass per REBUILD_MS each.
     */
    update(nowMs, centerX, centerZ) {
      tickWind(nowMs / 1000);
      if (centerX !== undefined) {
        centre.x = centerX; centre.z = centerZ;
        // the detail tiers are measured from the player, so they go stale as
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
      // the world is quiet: get one more species out of the way before the
      // player walks into the biome that needs it
      if (!dirty.size && !grass.queued) {
        const next = WARM_ORDER.find((k) => !kinds[k]);
        if (next) fieldFor(next);
      }
      // a felled tree owes the player a stump; chopTree rebuilds the field on
      // its own clock, so the felled list is re-read on ours
      if (nowMs - lastStumps >= STUMP_MS) { lastStumps = nowMs; stats.stumps = stumps.refresh(kinds); }
      stats.drawCalls = countDrawCalls();
    },

    /** The settings window's Grass density, 0 to 1. */
    setGrass(v) { grass.setDensity(v); },
    get grassDensity() { return grass.density; },

    get pending() { return dirty.size; },
    dispose() {
      for (const f of Object.values(kinds)) for (const m of f.meshes) { group.remove(m); m.dispose?.(); }
      grass.dispose();
      stumps.dispose();
      scene.remove(group);
    },
  };
}
