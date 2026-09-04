// What grows on the ground: trees, boulders and grass for the endless world.
//
// The farm's TreeField (src/farm/tree_edit.js) is the mechanism: plain records
// in, one InstancedMesh per part out, a raycast back-index so the axe and the
// pickaxe work on it, chop, mine and regrow already written. Here there is one
// field per KIND for the whole world (oak, spruce, palm, cactus, sakura, rock),
// and chunks add and remove their records as they stream in and out. Draw calls
// stay at one per part per kind no matter how many chunks are loaded.
//
// What grows where is decided per 8 m cell from the world field (biome, height,
// slope, water, rivers, roads) and a hash of the cell, so every player sees the same
// forest and a chunk that unloads comes back identical. Sites keep a clearing.
//
//   const flora = createFlora(scene, field, { sitesNear, homeClear });
//   chunks.js calls flora.onChunk(cx, cz, verts) and flora.offChunk(cx, cz)
//   farm.js calls flora.update(nowMs) each frame (throttled rebuilds)

import * as THREE from 'three';
import { createTreeField } from '../farm/tree_edit.js';
import { mat, P } from '../farm/assets.js';
import { CHUNK } from './field.js';
import { hash2, rand2 } from './noise.js';

export const CELL = 8;                       // one candidate per 8 m cell
export const TREE_TIER = 17;                 // chunks at this many verts or more get trees
export const GRASS_RING = 2;                 // grass only within this many chunks
export const REBUILD_MS = 200;               // at most one field rebuild per kind per this
const HOME_CLEAR = 125;                      // the farm keeps its own surroundings
const SITE_CLEAR = 34;                       // clearing when a site has no flatR of its own
const clearingOf = (st) => (st.flatR != null ? st.flatR + 6 : SITE_CLEAR);
export const ORE_RING = [9, 22];               // ore rocks stand this far from a cave mouth
export const ORE_COUNT = 8;

// Chance per candidate cell that a kind grows there, by biome. 64 cells per
// chunk, so 0.15 is about ten of a kind per chunk.
export const DENSITY = {
  meadow:   { oak: 0.16, rock: 0.03 },
  boreal:   { spruce: 0.55, rock: 0.06 },
  desert:   { cactus: 0.14, rock: 0.09 },
  beach:    { palm: 0.12, rock: 0.03 },
  sakura:   { sakura: 0.30, oak: 0.05 },
  mountain: { spruce: 0.08, rock: 0.24 },
  snow:     { rock: 0.08 },
  ocean:    {},
};
const TREE_LINE = 66;      // no trees above this height
const MAX_SLOPE = 0.9;     // metres of rise over 2 m; steeper is bare rock for trees
const MAX_SLOPE_ROCK = 2.0; // boulders sit on slopes; that is where they came from

// The seasonal pass in farm.js recolours anything tagged foliage.
const tagFoliage = (col, autumnCol, snowAmt = 0.5) => (im) => {
  im.userData.foliage = col;
  if (autumnCol != null) im.userData.autumnCol = autumnCol;
  im.userData.snowAmt = snowAmt;
};

// Kind specs: the same part layouts the themes use for their own forests, so a
// world oak is the meadow's oak. `of(t)` maps a record to one instance.
function buildKinds(parent) {
  const kinds = {};
  const canGeo = new THREE.SphereGeometry(1.5, 8, 7);
  const oakShades = [0x6fb85a, 0x5ea64c, 0x7cc268];
  kinds.oak = createTreeField({
    name: 'world:oak', kind: 'tree', parent,
    layers: [
      { geo: new THREE.CylinderGeometry(0.28, 0.42, 2.4, 6), mat: mat(P.wood),
        of: (t) => ({ x: t.x, y: t.gy + 1.2 * t.s, z: t.z, s: t.s, ry: t.ry }) },
      ...oakShades.map((col, i) => ({
        geo: canGeo, mat: mat(col), tag: tagFoliage(col, 0xc9863a),
        of: (t) => ((t.alt | 0) % 3 === i ? { x: t.x, y: t.gy + 3.0 * t.s, z: t.z, s: t.s, sy: 0.85, ry: t.ry } : null),
      })),
    ],
  });
  const tier = (r, h) => new THREE.ConeGeometry(r, h, 7);
  kinds.spruce = createTreeField({
    name: 'world:spruce', kind: 'tree', parent,
    layers: [
      { geo: new THREE.CylinderGeometry(0.18, 0.3, 1.6, 6), mat: mat(P.woodDark),
        of: (t) => ({ x: t.x, y: t.gy + 0.7 * t.s, z: t.z, s: t.s, ry: t.ry }) },
      { geo: tier(1.9, 2.6), mat: mat(0x2f6b3f), tag: tagFoliage(0x2f6b3f, null, 0.7),
        of: (t) => ({ x: t.x, y: t.gy + 2.4 * t.s, z: t.z, s: t.s, ry: t.ry }) },
      { geo: tier(1.4, 2.2), mat: mat(0x35784a), tag: tagFoliage(0x35784a, null, 0.7),
        of: (t) => ({ x: t.x, y: t.gy + 3.9 * t.s, z: t.z, s: t.s, ry: t.ry }) },
      { geo: tier(0.8, 1.8), mat: mat(0x3d8553), tag: tagFoliage(0x3d8553, null, 0.7),
        of: (t) => ({ x: t.x, y: t.gy + 5.2 * t.s, z: t.z, s: t.s, ry: t.ry }) },
    ],
  });
  const frondGeo = new THREE.ConeGeometry(2.2, 1.1, 6);
  kinds.palm = createTreeField({
    name: 'world:palm', kind: 'tree', parent,
    layers: [
      { geo: new THREE.CylinderGeometry(0.2, 0.32, 5.2, 6), mat: mat(0x9a7247),
        of: (t) => ({ x: t.x, y: t.gy + 2.6 * t.s, z: t.z, s: t.s, ry: t.ry, rz: 0.08 }) },
      { geo: frondGeo, mat: mat(0x3f8f52), tag: tagFoliage(0x3f8f52, null, 0.2),
        of: (t) => ({ x: t.x, y: t.gy + 5.3 * t.s, z: t.z, s: t.s, sy: 0.9, ry: t.ry }) },
      { geo: frondGeo, mat: mat(0x4fa25f), tag: tagFoliage(0x4fa25f, null, 0.2),
        of: (t) => ({ x: t.x, y: t.gy + 5.0 * t.s, z: t.z, s: t.s * 0.78, sy: 0.8, ry: t.ry + 0.8 }) },
    ],
  });
  const cactusMat = mat(0x4f9a4a);
  kinds.cactus = createTreeField({
    name: 'world:cactus', kind: 'tree', parent,
    layers: [
      { geo: new THREE.CylinderGeometry(0.42, 0.5, 3.4, 8), mat: cactusMat,
        of: (t) => ({ x: t.x, y: t.gy + 1.7 * t.s, z: t.z, s: t.s, ry: t.ry }) },
      { geo: new THREE.SphereGeometry(0.42, 7, 6), mat: cactusMat,
        of: (t) => ({ x: t.x, y: t.gy + 3.4 * t.s, z: t.z, s: t.s }) },
      { geo: new THREE.CylinderGeometry(0.22, 0.26, 1.4, 7), mat: cactusMat,
        of: (t) => (t.alt ? { x: t.x + 0.7 * t.s, y: t.gy + 2.4 * t.s, z: t.z, s: t.s, ry: t.ry } : null) },
    ],
  });
  const blossomGeo = new THREE.SphereGeometry(1.75, 8, 7);
  kinds.sakura = createTreeField({
    name: 'world:sakura', kind: 'tree', parent,
    layers: [
      { geo: new THREE.CylinderGeometry(0.22, 0.36, 2.8, 6), mat: mat(0x5a4032),
        of: (t) => ({ x: t.x, y: t.gy + 1.4 * t.s, z: t.z, s: t.s, ry: t.ry }) },
      { geo: blossomGeo, mat: mat(0xf2aac8), tag: tagFoliage(0xf2aac8, 0xd98a7a, 0.6),
        of: (t) => ({ x: t.x, y: t.gy + 3.4 * t.s, z: t.z, s: t.s, sy: 0.82, ry: t.ry }) },
      { geo: new THREE.SphereGeometry(1.15, 7, 6), mat: mat(0xf7c2d8), tag: tagFoliage(0xf7c2d8, 0xe0a08a, 0.6),
        of: (t) => ({ x: t.x + Math.cos(t.oa) * 1.2 * t.s, y: t.gy + 3.0 * t.s, z: t.z + Math.sin(t.oa) * 1.2 * t.s, s: t.s * 0.72, ry: t.ry }) },
    ],
  });
  // ore: darker stone with a copper seam, around cave mouths, harder to break
  kinds.ore = createTreeField({
    name: 'world:ore', kind: 'rock', hits: 5, yield: 'ore', parent,
    layers: [
      { geo: new THREE.DodecahedronGeometry(1, 0), mat: mat(0x4e5a63),
        of: (t) => ({ x: t.x, y: t.gy + 0.5 * t.s, z: t.z, s: t.s, sy: 0.9, ry: t.ry }) },
      { geo: new THREE.DodecahedronGeometry(0.4, 0), mat: mat(0xc47a3a, { metalness: 0.35, roughness: 0.5 }),
        of: (t) => ({ x: t.x + 0.5 * t.s, y: t.gy + 0.9 * t.s, z: t.z + 0.3 * t.s, s: t.s * 0.6, ry: -t.ry }) },
    ],
  });
  kinds.rock = createTreeField({
    name: 'world:rock', kind: 'rock', hits: 4, parent,
    layers: [
      { geo: new THREE.DodecahedronGeometry(1, 0), mat: mat(0x8b8478),
        of: (t) => ({ x: t.x, y: t.gy + 0.45 * t.s, z: t.z, s: t.s, sy: 0.85, ry: t.ry }) },
      { geo: new THREE.DodecahedronGeometry(0.55, 0), mat: mat(0x9a9287),
        of: (t) => ({ x: t.x + 0.9 * t.s, y: t.gy + 0.25 * t.s, z: t.z + 0.5 * t.s, s: t.s * 0.7, sy: 0.8, ry: -t.ry }) },
    ],
  });
  return kinds;
}

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
      (out.ore ||= []).push({ x, z, gy: s.h - 0.2, s: 1.0 + rand2(i, st.cx + st.cz, seed + 43) * 0.7, ry: rand2(i, st.cx - st.cz, seed + 44) * Math.PI, alt: 0, oa: 0, chunk: chunkKey, ore: true });
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
    const slope = Math.max(Math.abs(field.heightAt(x + 1, z) - field.heightAt(x - 1, z)), Math.abs(field.heightAt(x, z + 1) - field.heightAt(x, z - 1)));
    if (slope > MAX_SLOPE_ROCK) continue;
    let near = false;
    for (const st of sites) if (Math.hypot(st.x - x, st.z - z) < clearingOf(st)) { near = true; break; }
    if (near) continue;
    // one roll picks at most one kind per cell
    let roll = rand2(gx, gz, seed + 23), kind = null;
    for (const [k, p] of Object.entries(table)) { if (roll < p) { kind = k; break; } roll -= p; }
    if (!kind) continue;
    if (kind !== 'rock' && (s.h > TREE_LINE || slope > MAX_SLOPE)) continue;
    const size = kind === 'rock' ? 1.1 + rand2(gx, gz, seed + 24) * 1.1
      : kind === 'oak' ? 1.5 + rand2(gx, gz, seed + 24) * 1.2
      : 0.85 + rand2(gx, gz, seed + 24) * 0.6;
    (out[kind] ||= []).push({
      x, z, gy: s.h - 0.15, s: size, ry: rand2(gx, gz, seed + 25) * Math.PI,
      alt: hash2(gx, gz, seed + 26) % 3, oa: rand2(gx, gz, seed + 27) * Math.PI * 2,
      chunk: chunkKey,
    });
  }
  return out;
}

export function createFlora(scene, field, opts = {}) {
  const group = new THREE.Group();
  group.name = 'world-flora';
  scene.add(group);
  const kinds = buildKinds(group);
  const dirty = new Set();
  const lastBuilt = {};
  const have = new Map();          // chunk key -> true when its records are in
  const stats = { chunks: 0, records: 0, rebuilds: 0, grassChunks: 0 };

  function addChunk(cx, cz) {
    const key = cx + ',' + cz;
    if (have.has(key)) return;
    const recs = recordsFor(field, cx, cz, opts);
    for (const [k, list] of Object.entries(recs)) {
      for (const r of list) kinds[k].trees.push(r);
      if (list.length) dirty.add(k);
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

  // ---- grass: near ring only, one instanced mesh, not clickable ----------
  const tuftGeo = new THREE.ConeGeometry(0.22, 0.9, 4);
  tuftGeo.translate(0, 0.45, 0);
  const tuftMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: false, roughness: 1, flatShading: true });
  let grass = null;
  let grassCenter = null;
  const GRASS_BIOMES = { meadow: 0x6cb552, sakura: 0x78bf60, boreal: 0x5c9a68 };
  function rebuildGrass(ccx, ccz) {
    const places = [];
    const seed = field.seed;
    for (let dz = -GRASS_RING; dz <= GRASS_RING; dz++) for (let dx = -GRASS_RING; dx <= GRASS_RING; dx++) {
      const cx = ccx + dx, cz = ccz + dz;
      for (let i = 0; i < 90; i++) {
        const x = (cx + rand2(cx * 97 + i, cz, seed + 31)) * CHUNK;
        const z = (cz + rand2(cx, cz * 89 + i, seed + 32)) * CHUNK;
        if (Math.hypot(x, z) < HOME_CLEAR) continue;
        const s = field.sampleAt(x, z);
        const col = GRASS_BIOMES[s.biome];
        if (!col || s.water || s.river > 0.2 || s.road > 0.15) continue;   // no tufts down the middle of a road
        places.push({ x, y: s.h - 0.05, z, s: 0.7 + rand2(i, cx + cz, seed + 33) * 0.8, ry: rand2(i, cx - cz, seed + 34) * Math.PI, col });
      }
    }
    if (grass) { group.remove(grass); grass.dispose(); grass = null; }
    if (!places.length) { stats.grassChunks = 0; return; }
    const im = new THREE.InstancedMesh(tuftGeo, tuftMat, places.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3(), c = new THREE.Color();
    for (let i = 0; i < places.length; i++) {
      const t = places[i];
      e.set(0, t.ry, 0); q.setFromEuler(e); p.set(t.x, t.y, t.z); sc.set(t.s, t.s * (0.8 + 0.4 * ((i * 7) % 5) / 5), t.s);
      m4.compose(p, q, sc); im.setMatrixAt(i, m4);
      im.setColorAt(i, c.setHex(t.col).offsetHSL(0, 0, ((i * 13) % 7) / 7 * 0.08 - 0.04));
    }
    im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true;
    im.receiveShadow = true;
    group.add(im); grass = im;
    stats.grassChunks = (GRASS_RING * 2 + 1) ** 2;
  }

  return {
    kinds, group, stats,
    /** chunks.js: a chunk was built (or rebuilt at a new tier). */
    onChunk(cx, cz, verts) {
      if (verts >= TREE_TIER) addChunk(cx, cz); else removeChunk(cx, cz);
    },
    offChunk(cx, cz) { removeChunk(cx, cz); },
    /** Every frame. Rebuilds dirty kinds, at most one pass per REBUILD_MS each. */
    update(nowMs, centerX, centerZ) {
      for (const k of [...dirty]) {
        if (nowMs - (lastBuilt[k] || 0) < REBUILD_MS) continue;
        kinds[k].rebuild(); lastBuilt[k] = nowMs; dirty.delete(k); stats.rebuilds++;
      }
      if (centerX !== undefined) {
        const [cx, cz] = field.chunkOf(centerX, centerZ);
        if (!grassCenter || grassCenter[0] !== cx || grassCenter[1] !== cz) { grassCenter = [cx, cz]; rebuildGrass(cx, cz); }
      }
    },
    get pending() { return dirty.size; },
    dispose() {
      for (const f of Object.values(kinds)) for (const m of f.meshes) { group.remove(m); m.dispose?.(); }
      if (grass) { group.remove(grass); grass.dispose(); }
      scene.remove(group);
    },
  };
}
