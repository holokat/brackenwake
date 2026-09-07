// Streams the endless ground around a moving point.
//
//   const world = createWorldStream(scene, field, { palette, waterMap });
//   world.update(centerVec3, dt)     // every frame: loads, unloads, budgets
//   world.heightAt(x, z)             // the same field the meshes were built from
//   world.setQuality('medium')       // shader define, no rebuild
//
// One mesh per chunk (64 x 64 world units), surfaced by terrain_material.js
// from six layers whose weights this file writes into vertex attributes, with
// a skirt hanging down its rim so neighbouring chunks at different resolutions
// never show a crack of sky. Resolution falls with distance: 33 verts a side
// near the player, 17 in the middle ring, 9 far out.
// A chunk that has any ground near or below sea level also gets a water plane.
//
// Budgeted: at most BUILD_PER_FRAME chunks are meshed per frame, nearest first,
// and a chunk further than the ring plus a margin is disposed, geometry and
// all, so memory returns when you walk away. Chunks are rebuilt only when their
// resolution tier changes.
//
// ---------------------------------------------------------------------------
// Why the normals do not come from the mesh any more
// ---------------------------------------------------------------------------
//
// They used to. `geo.computeVertexNormals()` averages the faces that touch a
// vertex, and on a rim vertex those faces are half ground and half skirt, and
// the skirt hangs straight down. Measured on flat ground at the farm, that put
// the rim normal at (-0.832, 0.555, 0) where the ground normal is (0, 1, 0):
// 56 degrees over, on ground with no slope at all. Against the sun the scene
// puts at (90, 120, 50), N dot L is 0.000 on the -x rim, 0.759 two metres
// inside it, and 0.895 on the +x rim. A dark line and a bright line on every
// chunk edge, every 64 metres, across a meadow that is geometrically flat.
// That is the grid in the screenshot.
//
// So a normal is now a property of the field, not of the mesh: central
// differences on field.heightAt at NORMAL_STEP metres, which is the same
// number everywhere. Two chunks that share a vertex compute bit-identical
// normals for it, whatever tier either of them is, and the skirt copies its
// rim vertex's normal instead of inventing one.
//
// It costs four extra height samples per vertex. Measured on this field, with
// the lattice cache below and NORMAL_STEP equal to the finest tier's vertex
// spacing so most taps are already in hand: 2.52 ms for a 33 chunk against
// 2.36 ms for the old one-sample-per-vertex build, 1.31 ms for a 17, 0.58 ms
// for a 9.

import * as THREE from 'three';
import { CHUNK, SEA_LEVEL } from './field.js';
import { hash2, smoothstep } from './noise.js';
import { roadDistanceAt } from './roads.js';
import { createTerrainMaterial, layerWeights, ROAD_FADE, CLIFF_SLOPE } from './terrain_material.js';

export const RING = 5;              // 320 m: 11 x 11 = 121 nearby chunks
export const UNLOAD_MARGIN = 2;     // chunks beyond RING before disposal
export const BUILD_PER_FRAME = 3;
const TIERS = [[3, 33], [6, 17], [Infinity, 9]];   // [max chunk distance, verts per side]
const SKIRT = 4;                    // how far the rim skirt hangs, world units
const WATER_Y = SEA_LEVEL - 0.06;

/**
 * Metres between the two taps of the central difference that makes a normal.
 * Fixed in world units, deliberately: it is what makes a normal the same on
 * both sides of a chunk border and on both sides of an LOD change. It is also
 * the finest tier's vertex spacing (64 / 32), so at that tier most taps land
 * on vertices the build has already sampled.
 */
export const NORMAL_STEP = 2;

/** The faintest road tint the ground is painted with, where any road is at all. */
export const ROAD_TINT_MIN = 1 / 512;

// Ground colours per biome, above and below the waterline. Themes supply the
// living greens so a meadow here is the meadow the farm already wears; the
// rest are the colours a painter would reach for next to them. These are now a
// tint over the layer textures rather than the whole of what you see, at
// uTerTint strength in terrain_material.js.
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
    road:     new THREE.Color(0x8a7355),
    water:    new THREE.Color(meadow.water),
  };
}

export function tierFor(chunkDist) {
  for (const [max, verts] of TIERS) if (chunkDist <= max) return verts;
  return TIERS[TIERS.length - 1][1];
}

/**
 * How much road is under a point, faded over ROAD_FADE metres instead of the
 * 1.8 the field's own `roadStrength` uses.
 *
 * The field's road strength is right for grading the ground: the earthwork
 * wants a firm edge. It is wrong for painting, because it runs from 1 to 0
 * across 1.8 m while the mesh has a vertex every 2, 4 or 8 m. Measured on the
 * road at (1680, -720): at 2 m spacing the field's strength reads
 * 0 0 0.66 1 1 0.29 0, at 4 m it reads 0 0.66 1 0, and at 8 m the entire road
 * is one vertex at 0.66. A hard band, and one that changes width and position
 * every time the tier changes. This one reaches zero at ROAD_REACH, which is
 * where roadDistanceAt stops looking, so it is smooth all the way out and
 * every tier samples the same ramp.
 *
 * Deliberately NOT multiplied by the ford fade: a road crossing a river should
 * still read as a crossing, and the river bed's own weights are laid down
 * before the road's inside layerWeights.
 */
export function roadWeightAt(field, x, z) {
  const k = field.homeFactor(x, z);
  if (k <= 0) return 0;
  const rd = roadDistanceAt(field, x, z);
  if (!rd) return 0;
  return (1 - smoothstep(0, ROAD_FADE, rd.d)) * k;
}

// Build the geometry for one chunk at a resolution. Exported so a node test can
// check seams and skirts without a renderer.
export function buildChunkGeometry(field, cx, cz, verts, palette) {
  const n = verts, step = CHUNK / (n - 1);
  const x0 = cx * CHUNK, z0 = cz * CHUNK;
  // grid + skirt: 4 rim strips of n verts each, hung SKIRT below the rim
  const gridCount = n * n, skirtCount = 4 * n;
  const total = gridCount + skirtCount;
  const pos = new Float32Array(total * 3);
  const nor = new Float32Array(total * 3);
  const col = new Float32Array(total * 3);
  const layA = new Float32Array(total * 3);
  const layB = new Float32Array(total * 3);
  const rdW = new Float32Array(total);
  const heights = new Float32Array(gridCount);
  let hasWater = false, minH = Infinity, maxH = -Infinity;
  const tmp = new THREE.Color();
  const w6 = new Array(6);
  const samples = new Array(gridCount);

  // A height lattice for this build only. Keys are local quarter-metre integer
  // indices, so there is no float compare and no hash collision: the taps run
  // from -NORMAL_STEP to CHUNK + NORMAL_STEP either way, which is 273 quarter
  // metres a side, well inside the 512 stride.
  const cache = new Map();
  const kk = (x, z) => (Math.round((x - x0) * 4) + 16) * 512 + (Math.round((z - z0) * 4) + 16);
  const H = (x, z) => {
    const k = kk(x, z);
    let v = cache.get(k);
    if (v === undefined) { v = field.heightAt(x, z); cache.set(k, v); }
    return v;
  };

  // pass 1: the ground itself, and seed the lattice with what it already knows
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = x0 + i * step, z = z0 + j * step;
      const s = field.sampleAt(x, z);
      const k = j * n + i;
      samples[k] = s;
      heights[k] = s.h;
      cache.set(kk(x, z), s.h);
      pos[k * 3] = x; pos[k * 3 + 1] = s.h; pos[k * 3 + 2] = z;
      if (s.h < SEA_LEVEL + 0.2) hasWater = true;
      if (s.h < minH) minH = s.h; if (s.h > maxH) maxH = s.h;
    }
  }

  // pass 2: normals from the field, then the layer weights those normals decide
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = x0 + i * step, z = z0 + j * step;
      const k = j * n + i, s = samples[k];
      const dx = H(x - NORMAL_STEP, z) - H(x + NORMAL_STEP, z);
      const dz = H(x, z - NORMAL_STEP) - H(x, z + NORMAL_STEP);
      const up = 2 * NORMAL_STEP;
      const inv = 1 / Math.sqrt(dx * dx + dz * dz + up * up);
      const ny = up * inv;
      nor[k * 3] = dx * inv; nor[k * 3 + 1] = ny; nor[k * 3 + 2] = dz * inv;
      const slope = Math.sqrt(Math.max(0, 1 - ny * ny));
      const road = roadWeightAt(field, x, z);
      rdW[k] = road;
      layerWeights(s, slope, road, w6);
      layA[k * 3] = w6[0]; layA[k * 3 + 1] = w6[1]; layA[k * 3 + 2] = w6[2];
      layB[k * 3] = w6[3]; layB[k * 3 + 1] = w6[4]; layB[k * 3 + 2] = w6[5];
      colourAt(tmp, s, x, z, palette, slope);
      col[k * 3] = tmp.r; col[k * 3 + 1] = tmp.g; col[k * 3 + 2] = tmp.b;
    }
  }

  // skirt verts copy their rim vertex, dropped by SKIRT
  const rim = [];
  for (let i = 0; i < n; i++) rim.push(i);                       // top row j=0
  for (let i = 0; i < n; i++) rim.push((n - 1) * n + i);         // bottom row
  for (let j = 0; j < n; j++) rim.push(j * n);                   // left col
  for (let j = 0; j < n; j++) rim.push(j * n + n - 1);           // right col
  for (let r = 0; r < skirtCount; r++) {
    const src = rim[r], dst = gridCount + r;
    pos[dst * 3] = pos[src * 3]; pos[dst * 3 + 1] = pos[src * 3 + 1] - SKIRT; pos[dst * 3 + 2] = pos[src * 3 + 2];
    // Everything else about a skirt vertex is its rim vertex's. A darker skirt
    // drew a grid of dark lines wherever a fine chunk met a coarser neighbour
    // whose surface sat a little lower; a skirt with a normal of its own drew
    // the same grid in light instead of colour.
    for (let c = 0; c < 3; c++) {
      col[dst * 3 + c] = col[src * 3 + c];
      nor[dst * 3 + c] = nor[src * 3 + c];
      layA[dst * 3 + c] = layA[src * 3 + c];
      layB[dst * 3 + c] = layB[src * 3 + c];
    }
    rdW[dst] = rdW[src];
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
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aLayerA', new THREE.BufferAttribute(layA, 3));
  geo.setAttribute('aLayerB', new THREE.BufferAttribute(layB, 3));
  geo.setAttribute('aRoad', new THREE.BufferAttribute(rdW, 1));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  return { geo, hasWater, minH, maxH, heights, verts: n };
}

function colourAt(out, s, x, z, palette, slope = 0) {
  const p = palette[s.biome] || palette.meadow;
  // higher ground within a biome runs paler, lower runs into the deep tone
  const t = Math.max(0, Math.min(1, (s.h - 2) / 40));
  out.copy(p.deep).lerp(p.top, 0.35 + 0.65 * t);
  if (s.river > 0.55 && s.h < SEA_LEVEL + 0.5) out.lerp(palette.riverbed, 0.7);
  if (s.h > 20 && s.biome !== 'snow' && s.biome !== 'mountain') out.lerp(palette.rock, Math.min(0.5, (s.h - 20) / 50));
  // A FACE IS STONE, WHATEVER COUNTRY IT IS IN. The layer weights already put
  // rock on a steep vertex (terrain_material.layerWeights), but the vertex
  // colour is a tint OVER those layers, so a thirty metre mesa wall in the
  // Ember Wastes came out as sand coloured stone: the right texture under the
  // wrong paint. Height alone cannot answer this, because the foot of a wall is
  // as low as the desert beside it. So the tint follows the slope the normal
  // just measured, over the same CLIFF_SLOPE line the layers use.
  if (slope > 0.42) out.lerp(palette.rock, 0.75 * smoothstep(0.42, CLIFF_SLOPE, slope));
  // The road last, over whatever the biome and the height had made of this
  // vertex. This is the field's own narrow road strength and it stays that way,
  // because it is what the ground was actually graded by. It is not what you
  // look at: the shader fades this whole tint out under `aRoad`, and the road
  // you see is the dirt layer, which reaches ROAD_FADE metres out.
  // A vertex the field calls road is painted as road, however faint. At the
  // outermost verge the field's own strength can be 3.4e-7, which lerps a float
  // colour by less than a millionth and reads as "not painted at all" to
  // anything measuring it: `roads.test.mjs` found exactly one such vertex, at
  // -2832, -930. ROAD_TINT_MIN is half of one step of an 8 bit channel, so it
  // is under what an eye can see and over what a test can miss.
  if (s.road > 0) out.lerp(palette.road, Math.max(s.road, ROAD_TINT_MIN) * 0.85);
  // per-vertex jitter so flat facets differ, deterministic from position
  const j = (hash2(Math.round(x * 2), Math.round(z * 2), 9) & 255) / 255 - 0.5;
  out.offsetHSL(0, 0, j * 0.02);
}

export function createWorldStream(scene, field, opts = {}) {
  const palette = opts.palette;
  // The ground material owns its own textures and is disposed with the stream.
  // A caller may hand one in: a test, or a level that wants a cheaper one.
  const terrain = opts.terrain || (opts.groundMaterial
    ? null
    : createTerrainMaterial({ quality: opts.terrainQuality || 'high', size: opts.terrainSize }));
  const landMat = opts.groundMaterial || terrain.material;
  const ownsTerrain = !opts.groundMaterial && !opts.terrain;
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
    opts.onDisposed?.(c.cx, c.cz);
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
    // farm.js's seasonal pass reads userData.ground and userData.water as HEX
    // base colours and copies them into the material every season change. A
    // boolean here became setHex(1): black land, black water. White keeps the
    // vertex colours as painted and lets the whole world gild in autumn and
    // whiten in winter for free.
    mesh.userData.ground = 0xffffff;
    group.add(mesh);
    // No per-chunk water quad: src/world/water.js draws one ocean sheet at sea
    // level that floods the sea, the lakes and every river bed (all carved
    // below SEA_LEVEL), and a flat quad here would z-fight it. `hasWater` is
    // still reported on the record for anything that asks.
    const water = null;
    if (old) { dispose(k, old); stats.rebuilt++; }
    chunks.set(k, { cx, cz, verts, mesh, water, hasWater });
    stats.loaded++; stats.built++;
    opts.onBuilt?.(cx, cz, verts);
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
    /**
     * Build every live chunk again, for the ones a predicate names.
     *
     * The stream rebuilds a chunk when its RESOLUTION changes and never
     * otherwise, because until the world could be edited the ground under a
     * built chunk could not change. It can now: a stroke out of
     * terrain_edits.js moves the field under ground that is already meshed, and
     * `world_runtime.rebuildAround` is what puts the new ground on the screen.
     *
     * It goes through `build`, which is the same call the streamer makes, so a
     * rebuilt chunk disposes its old geometry, fires `onDisposed` and then
     * `onBuilt`: the flora, the dressing and the wayside of that chunk come
     * back with it and nothing is left behind. Returns how many were rebuilt.
     */
    rebuildWhere(pred) {
      const jobs = [];
      for (const c of chunks.values()) if (pred(c.cx, c.cz)) jobs.push([c.cx, c.cz, c.verts]);
      for (const [cx, cz, verts] of jobs) build(cx, cz, verts);
      return jobs.length;
    },
    /** Every chunk the stream is holding right now, as [cx, cz, verts]. */
    live() { return [...chunks.values()].map((c) => [c.cx, c.cz, c.verts]); },
    heightAt: (x, z) => field.heightAt(x, z),
    sampleAt: (x, z) => field.sampleAt(x, z),
    get pending() { return queue.length; },
    stats, group, field, terrain,
    /** 'low' | 'medium' | 'high'. No rebuild: quality is a shader define. */
    setQuality(q) { return terrain ? terrain.setQuality(q) : null; },
    /** Distance the ring reaches, for fog and the camera far plane. */
    viewRadius: RING * CHUNK,
    dispose() {
      for (const [k, c] of [...chunks]) dispose(k, c);
      scene.remove(group); waterMat.dispose();
      if (ownsTerrain && terrain) terrain.dispose();
      else if (opts.groundMaterial) landMat.dispose();
    },
  };
}
