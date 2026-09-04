// Streams the endless ground around a moving point.
//
//   const world = createWorldStream(scene, field, { palettes, waterMap });
//   world.update(centerVec3, dt)     // every frame: loads, unloads, budgets
//   world.heightAt(x, z)             // the same field the meshes were built from
//
// One mesh per chunk (64 x 64 world units), vertex coloured from the biome at
// each vertex, with a skirt hanging down its rim so neighbouring chunks at
// different resolutions never show a crack of sky. Resolution falls with
// distance: 33 verts a side near the player, 17 in the middle ring, 9 far out.
// A chunk that has any ground near or below sea level also gets a water plane.
//
// Budgeted: at most BUILD_PER_FRAME chunks are meshed per frame, nearest first,
// and a chunk further than the ring plus a margin is disposed, geometry and
// all, so memory returns when you walk away. Chunks are rebuilt only when their
// resolution tier changes.

import * as THREE from 'three';
import { CHUNK, SEA_LEVEL } from './field.js';
import { hash2 } from './noise.js';

export const RING = 9;              // chunks kept in each direction: 19 x 19 = 361
export const UNLOAD_MARGIN = 2;     // chunks beyond RING before disposal
export const BUILD_PER_FRAME = 3;
const TIERS = [[3, 33], [6, 17], [Infinity, 9]];   // [max chunk distance, verts per side]
const SKIRT = 4;                    // how far the rim skirt hangs, world units
const WATER_Y = SEA_LEVEL - 0.06;

// Ground colours per biome, above and below the waterline. Themes supply the
// living greens so a meadow here is the meadow the farm already wears; the
// rest are the colours a painter would reach for next to them.
export function buildPalette(themes) {
  const c = (id) => themes.find((t) => t.id === id)?.colors || themes[0].colors;
  const meadow = c('meadow'), boreal = c('boreal'), desert = c('desert'), sakura = c('sakura'), ocean = c('oceanside');
  return {
    ocean:    { top: new THREE.Color(0x3a5f6a), deep: new THREE.Color(0x24414d) },
    beach:    { top: new THREE.Color(ocean.dirtTop), deep: new THREE.Color(ocean.dirtDeep) },
    meadow:   { top: new THREE.Color(meadow.grass), deep: new THREE.Color(meadow.grassEdge) },
    boreal:   { top: new THREE.Color(boreal.grass), deep: new THREE.Color(boreal.grassEdge) },
    desert:   { top: new THREE.Color(desert.dirtTop), deep: new THREE.Color(desert.dirtDeep) },
    sakura:   { top: new THREE.Color(sakura.grass), deep: new THREE.Color(sakura.grassEdge) },
    mountain: { top: new THREE.Color(0x8b8580), deep: new THREE.Color(0x605955) },
    snow:     { top: new THREE.Color(0xeef2f5), deep: new THREE.Color(0xc9d3dc) },
    rock:     new THREE.Color(0x77706a),
    riverbed: new THREE.Color(0x6f6a56),
    water:    new THREE.Color(meadow.water),
  };
}

export function tierFor(chunkDist) {
  for (const [max, verts] of TIERS) if (chunkDist <= max) return verts;
  return TIERS[TIERS.length - 1][1];
}

// Build the geometry for one chunk at a resolution. Exported so a node test can
// check seams and skirts without a renderer.
export function buildChunkGeometry(field, cx, cz, verts, palette) {
  const n = verts, step = CHUNK / (n - 1);
  const x0 = cx * CHUNK, z0 = cz * CHUNK;
  // grid + skirt: 4 rim strips of n verts each, hung SKIRT below the rim
  const gridCount = n * n, skirtCount = 4 * n;
  const pos = new Float32Array((gridCount + skirtCount) * 3);
  const col = new Float32Array((gridCount + skirtCount) * 3);
  const heights = new Float32Array(gridCount);
  let hasWater = false, minH = Infinity, maxH = -Infinity;
  const tmp = new THREE.Color();

  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = x0 + i * step, z = z0 + j * step;
      const s = field.sampleAt(x, z);
      const k = j * n + i;
      heights[k] = s.h;
      pos[k * 3] = x; pos[k * 3 + 1] = s.h; pos[k * 3 + 2] = z;
      if (s.h < SEA_LEVEL + 0.2) hasWater = true;
      if (s.h < minH) minH = s.h; if (s.h > maxH) maxH = s.h;
      colourAt(tmp, s, x, z, palette);
      col[k * 3] = tmp.r; col[k * 3 + 1] = tmp.g; col[k * 3 + 2] = tmp.b;
    }
  }
  // skirt verts copy their rim vertex, dropped by SKIRT, in a darker colour
  const rim = [];
  for (let i = 0; i < n; i++) rim.push(i);                       // top row j=0
  for (let i = 0; i < n; i++) rim.push((n - 1) * n + i);         // bottom row
  for (let j = 0; j < n; j++) rim.push(j * n);                   // left col
  for (let j = 0; j < n; j++) rim.push(j * n + n - 1);           // right col
  for (let r = 0; r < skirtCount; r++) {
    const src = rim[r], dst = gridCount + r;
    pos[dst * 3] = pos[src * 3]; pos[dst * 3 + 1] = pos[src * 3 + 1] - SKIRT; pos[dst * 3 + 2] = pos[src * 3 + 2];
    col[dst * 3] = col[src * 3] * 0.55; col[dst * 3 + 1] = col[src * 3 + 1] * 0.55; col[dst * 3 + 2] = col[src * 3 + 2] * 0.55;
  }

  const idx = [];
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < n - 1; i++) {
    const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
    // alternate the diagonal so slopes do not stripe
    if ((i + j) & 1) idx.push(a, c, b, b, c, d); else idx.push(a, c, d, a, d, b);
  }
  // skirt quads: rim vertex pairs to their dropped twins. Winding faces outward.
  const quad = (r0, r1, out) => {
    const s0 = gridCount + r0, s1 = gridCount + r1;
    const a = rim[r0], b = rim[r1];
    if (out) idx.push(a, s0, b, b, s0, s1); else idx.push(a, b, s0, b, s1, s0);
  };
  for (let i = 0; i < n - 1; i++) quad(i, i + 1, false);                     // top edge (z = z0), faces -z
  for (let i = 0; i < n - 1; i++) quad(n + i, n + i + 1, true);              // bottom edge, faces +z
  for (let j = 0; j < n - 1; j++) quad(2 * n + j, 2 * n + j + 1, true);      // left edge, faces -x
  for (let j = 0; j < n - 1; j++) quad(3 * n + j, 3 * n + j + 1, false);     // right edge, faces +x

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return { geo, hasWater, minH, maxH, heights, verts: n };
}

function colourAt(out, s, x, z, palette) {
  const p = palette[s.biome] || palette.meadow;
  // higher ground within a biome runs paler, lower runs into the deep tone
  const t = Math.max(0, Math.min(1, (s.h - 2) / 40));
  out.copy(p.deep).lerp(p.top, 0.35 + 0.65 * t);
  if (s.river > 0.55 && s.h < SEA_LEVEL + 0.5) out.lerp(palette.riverbed, 0.7);
  if (s.h > 20 && s.biome !== 'snow' && s.biome !== 'mountain') out.lerp(palette.rock, Math.min(0.5, (s.h - 20) / 50));
  // per-vertex jitter so flat facets differ, deterministic from position
  const j = (hash2(Math.round(x * 2), Math.round(z * 2), 9) & 255) / 255 - 0.5;
  out.offsetHSL(0, 0, j * 0.05);
}

export function createWorldStream(scene, field, opts = {}) {
  const palette = opts.palette;
  const landMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0 });
  const waterMat = new THREE.MeshStandardMaterial({
    color: palette.water, transparent: true, opacity: 0.72, roughness: 0.25, metalness: 0.05,
    map: opts.waterMap || null, depthWrite: false,
  });
  const group = new THREE.Group();
  group.name = 'world-stream';
  scene.add(group);

  const chunks = new Map();      // key -> { cx, cz, verts, mesh, water }
  const key = (cx, cz) => cx + ',' + cz;
  const stats = { loaded: 0, built: 0, disposed: 0, rebuilt: 0, lastCenter: [0, 0] };
  let centerCx = null, centerCz = null;
  const queue = [];

  function plan(cx0, cz0) {
    queue.length = 0;
    for (let dz = -RING; dz <= RING; dz++) for (let dx = -RING; dx <= RING; dx++) {
      const cx = cx0 + dx, cz = cz0 + dz;
      const dist = Math.max(Math.abs(dx), Math.abs(dz));
      const want = tierFor(dist);
      const have = chunks.get(key(cx, cz));
      if (!have || have.verts !== want) queue.push({ cx, cz, want, dist });
    }
    queue.sort((a, b) => a.dist - b.dist);
    // unload what fell out of the ring
    for (const [k, c] of chunks) {
      if (Math.abs(c.cx - cx0) > RING + UNLOAD_MARGIN || Math.abs(c.cz - cz0) > RING + UNLOAD_MARGIN) dispose(k, c);
    }
  }

  function dispose(k, c) {
    group.remove(c.mesh); c.mesh.geometry.dispose();
    if (c.water) { group.remove(c.water); c.water.geometry.dispose(); }
    chunks.delete(k); stats.loaded--; stats.disposed++;
  }

  function build(cx, cz, verts) {
    const k = key(cx, cz);
    const old = chunks.get(k);
    const { geo, hasWater } = buildChunkGeometry(field, cx, cz, verts, palette);
    const mesh = new THREE.Mesh(geo, landMat);
    mesh.receiveShadow = true;
    mesh.userData.chunk = [cx, cz];
    mesh.userData.ground = true;
    group.add(mesh);
    let water = null;
    if (hasWater) {
      const wg = new THREE.PlaneGeometry(CHUNK, CHUNK, 1, 1);
      wg.rotateX(-Math.PI / 2);
      water = new THREE.Mesh(wg, waterMat);
      water.position.set(cx * CHUNK + CHUNK / 2, WATER_Y, cz * CHUNK + CHUNK / 2);
      water.userData.water = true;
      group.add(water);
    }
    if (old) { dispose(k, old); stats.rebuilt++; }
    chunks.set(k, { cx, cz, verts, mesh, water });
    stats.loaded++; stats.built++;
  }

  function update(center) {
    const [cx, cz] = field.chunkOf(center.x, center.z);
    if (cx !== centerCx || cz !== centerCz) {
      centerCx = cx; centerCz = cz; stats.lastCenter = [cx, cz];
      plan(cx, cz);
    }
    let n = 0;
    while (queue.length && n < BUILD_PER_FRAME) {
      const job = queue.shift();
      const have = chunks.get(key(job.cx, job.cz));
      if (have && have.verts === job.want) continue;
      build(job.cx, job.cz, job.want);
      n++;
    }
  }

  return {
    update,
    heightAt: (x, z) => field.heightAt(x, z),
    sampleAt: (x, z) => field.sampleAt(x, z),
    get pending() { return queue.length; },
    stats, group, field,
    /** Distance the ring reaches, for fog and the camera far plane. */
    viewRadius: RING * CHUNK,
    dispose() {
      for (const [k, c] of [...chunks]) dispose(k, c);
      scene.remove(group); landMat.dispose(); waterMat.dispose();
    },
  };
}
