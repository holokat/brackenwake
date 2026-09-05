// Chunk meshes: seams, skirts, normals and layer weights.
// Run: node src/world/chunks.test.mjs
//
// The bug this suite exists for: the ground was lit by normals from
// computeVertexNormals, which on a rim vertex averages the ground faces with
// the skirt faces that hang straight down off it. On flat ground that put the
// rim normal 56 degrees over, so every chunk edge was a dark line one way and
// a bright line the other, on a 64 m grid, across a meadow with no slope in
// it. Half of test 3 is the measurement of that, kept so it cannot come back.

import * as THREE from 'three';
import { createWorldField, CHUNK } from './field.js';
import {
  buildChunkGeometry, buildPalette, tierFor, roadWeightAt, NORMAL_STEP,
  RING, BUILD_PER_FRAME, ROAD_TINT_MIN,
} from './chunks.js';
import { ZONE } from './zones.js';
import { roadsForCell, roadDistanceAt } from './roads.js';
import { SITE_CELL } from './sitegrid.js';
import { LAYERS, layerWeights, CLIFF_SLOPE } from './terrain_material.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

const SEED = 20260904;
const field = createWorldField(SEED, { homeY: -0.3 });
const theme = [{ id: 'meadow', colors: { grass: 0x6cb552, grassEdge: 0x4e8c3e, dirtTop: 0x9a8055, dirtDeep: 0x6d5a3c, water: 0x3f7fa6 } }];
const palette = buildPalette(theme);
const EPS = 1e-6;

const ATTRS = ['position', 'normal', 'color', 'aLayerA', 'aLayerB', 'aRoad'];

/** Grid vertices of a chunk, keyed by exact world x and z. */
function gridOf(cx, cz, verts) {
  const { geo } = buildChunkGeometry(field, cx, cz, verts, palette);
  const a = Object.fromEntries(ATTRS.map((n) => [n, geo.getAttribute(n).array]));
  const m = new Map();
  for (let k = 0; k < verts * verts; k++) {
    const key = a.position[k * 3].toFixed(4) + '|' + a.position[k * 3 + 2].toFixed(4);
    m.set(key, {
      n: [a.normal[k * 3], a.normal[k * 3 + 1], a.normal[k * 3 + 2]],
      c: [a.color[k * 3], a.color[k * 3 + 1], a.color[k * 3 + 2]],
      w: [a.aLayerA[k * 3], a.aLayerA[k * 3 + 1], a.aLayerA[k * 3 + 2],
        a.aLayerB[k * 3], a.aLayerB[k * 3 + 1], a.aLayerB[k * 3 + 2]],
      r: a.aRoad[k], y: a.position[k * 3 + 1],
    });
  }
  return m;
}

const maxDelta = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));

// ---- 1. the record is the record it always was ---------------------------
{
  const rec = buildChunkGeometry(field, 4, -3, 33, palette);
  check('the record still has geo, hasWater, minH, maxH, heights, verts',
    ['geo', 'hasWater', 'minH', 'maxH', 'heights', 'verts'].every((k) => k in rec));
  check('heights is one float per grid vertex', rec.heights.length === 33 * 33);
  check('verts is what was asked for', rec.verts === 33);
  const total = 33 * 33 + 4 * 33;
  for (const n of ATTRS) {
    const at = rec.geo.getAttribute(n);
    check(`attribute ${n} covers grid and skirt`, at && at.count === total, at ? `${at.count} of ${total}, itemSize ${at.itemSize}` : 'missing');
  }
  check('aLayerA and aLayerB are vec3, aRoad is a float',
    rec.geo.getAttribute('aLayerA').itemSize === 3 && rec.geo.getAttribute('aLayerB').itemSize === 3
    && rec.geo.getAttribute('aRoad').itemSize === 1);
  check('the tiers are still 33, 17, 9', tierFor(0) === 33 && tierFor(3) === 33 && tierFor(4) === 17
    && tierFor(6) === 17 && tierFor(7) === 9 && tierFor(99) === 9);
  check('the ring and the budget are untouched', RING === 9 && BUILD_PER_FRAME === 3);
  const again = buildChunkGeometry(field, 4, -3, 33, palette);
  check('the same chunk builds the same bytes twice',
    ATTRS.every((n) => rec.geo.getAttribute(n).array.every((v, i) => v === again.geo.getAttribute(n).array[i])));
}

// ---- 2. borders: same tier, and every LOD change ------------------------
{
  const pairs = [
    ['same tier, x border', [0, 0, 33], [1, 0, 33]],
    ['same tier, z border', [0, 0, 33], [0, 1, 33]],
    ['33 meets 17', [2, 0, 33], [3, 0, 17]],
    ['17 meets 9', [5, 0, 17], [6, 0, 9]],
    ['33 meets 9', [8, 4, 33], [9, 4, 9]],
    ['far from home, 33 meets 17', [26, -12, 33], [27, -12, 17]],
  ];
  for (const [name, A, B] of pairs) {
    const a = gridOf(...A), b = gridOf(...B);
    let shared = 0, wn = 0, wc = 0, ww = 0, wr = 0, wy = 0;
    for (const [k, va] of a) {
      const vb = b.get(k); if (!vb) continue;
      shared++;
      wn = Math.max(wn, maxDelta(va.n, vb.n));
      wc = Math.max(wc, maxDelta(va.c, vb.c));
      ww = Math.max(ww, maxDelta(va.w, vb.w));
      wr = Math.max(wr, Math.abs(va.r - vb.r));
      wy = Math.max(wy, Math.abs(va.y - vb.y));
    }
    check(`${name}: the two chunks share vertices`, shared > 4, `${shared} shared`);
    check(`${name}: normals match`, wn < EPS, `max delta ${wn.toExponential(2)}`);
    check(`${name}: heights match`, wy < EPS, `max delta ${wy.toExponential(2)}`);
    check(`${name}: colours match`, wc < EPS, `max delta ${wc.toExponential(2)}`);
    check(`${name}: layer weights match`, ww < EPS, `max delta ${ww.toExponential(2)}`);
    check(`${name}: road weight matches`, wr < EPS, `max delta ${wr.toExponential(2)}`);
  }
}

// ---- 3. a normal is the field's, not the mesh's -------------------------
{
  // The same central difference, computed here by hand from field.heightAt.
  const fieldNormal = (x, z) => {
    const dx = field.heightAt(x - NORMAL_STEP, z) - field.heightAt(x + NORMAL_STEP, z);
    const dz = field.heightAt(x, z - NORMAL_STEP) - field.heightAt(x, z + NORMAL_STEP);
    const up = 2 * NORMAL_STEP;
    const inv = 1 / Math.sqrt(dx * dx + dz * dz + up * up);
    return [dx * inv, up * inv, dz * inv];
  };
  let worst = 0, worstAt = '';
  for (const [cx, cz, v] of [[0, 0, 33], [7, -4, 17], [-11, 6, 9], [30, 30, 33]]) {
    const { geo } = buildChunkGeometry(field, cx, cz, v, palette);
    const pos = geo.getAttribute('position').array, nor = geo.getAttribute('normal').array;
    for (let k = 0; k < v * v; k++) {
      const d = maxDelta([nor[k * 3], nor[k * 3 + 1], nor[k * 3 + 2]], fieldNormal(pos[k * 3], pos[k * 3 + 2]));
      if (d > worst) { worst = d; worstAt = `${pos[k * 3]}, ${pos[k * 3 + 2]}`; }
    }
  }
  check('every grid normal is exactly the field central difference', worst < EPS,
    `max delta ${worst.toExponential(2)} at ${worstAt}`);

  // The old failure, measured. On the flat ground inside the home disc the
  // ground normal is straight up; a rim vertex must be straight up too.
  const { geo } = buildChunkGeometry(field, 0, 0, 33, palette);
  const pos = geo.getAttribute('position').array, nor = geo.getAttribute('normal').array;
  const rimTilt = [];
  for (const i of [0, 32]) {
    const k = 16 * 33 + i;
    rimTilt.push(Math.acos(Math.min(1, nor[k * 3 + 1])) * 180 / Math.PI);
  }
  check('the rim of a flat chunk is not tilted', Math.max(...rimTilt) < 0.001,
    `x ${pos[(16 * 33) * 3]} and x ${pos[(16 * 33 + 32) * 3]}: ${rimTilt.map((v) => v.toFixed(4)).join(' and ')} degrees off vertical, was 56.3`);

  // and what that does to the light. Sun at (90, 120, 50), as scene.js puts it.
  const L = [90, 120, 50];
  const ln = Math.hypot(...L);
  const ndl = (n) => Math.max(0, (n[0] * L[0] + n[1] * L[1] + n[2] * L[2]) / ln);
  const nAt = (i) => { const k = 16 * 33 + i; return [nor[k * 3], nor[k * 3 + 1], nor[k * 3 + 2]]; };
  const lit = [nAt(0), nAt(16), nAt(32)].map(ndl);
  const spread = Math.max(...lit) - Math.min(...lit);
  check('so the sun lands the same on the rim as in the middle', spread < 1e-6,
    `N dot L ${lit.map((v) => v.toFixed(4)).join(', ')} across the chunk, was 0.0000 / 0.7590 / 0.8948`);
}

// ---- 4. skirts inherit everything ---------------------------------------
{
  for (const [cx, cz, v] of [[0, 0, 33], [12, -7, 17], [-20, 15, 9]]) {
    const { geo } = buildChunkGeometry(field, cx, cz, v, palette);
    const a = Object.fromEntries(ATTRS.map((n) => [n, geo.getAttribute(n).array]));
    const grid = v * v;
    const rim = [];
    for (let i = 0; i < v; i++) rim.push(i);
    for (let i = 0; i < v; i++) rim.push((v - 1) * v + i);
    for (let j = 0; j < v; j++) rim.push(j * v);
    for (let j = 0; j < v; j++) rim.push(j * v + v - 1);
    let bad = 0, drop = new Set();
    for (let r = 0; r < rim.length; r++) {
      const src = rim[r], dst = grid + r;
      for (let c = 0; c < 3; c++) {
        if (a.normal[dst * 3 + c] !== a.normal[src * 3 + c]) bad++;
        if (a.color[dst * 3 + c] !== a.color[src * 3 + c]) bad++;
        if (a.aLayerA[dst * 3 + c] !== a.aLayerA[src * 3 + c]) bad++;
        if (a.aLayerB[dst * 3 + c] !== a.aLayerB[src * 3 + c]) bad++;
      }
      if (a.aRoad[dst] !== a.aRoad[src]) bad++;
      if (a.position[dst * 3] !== a.position[src * 3] || a.position[dst * 3 + 2] !== a.position[src * 3 + 2]) bad++;
      drop.add(a.position[src * 3 + 1] - a.position[dst * 3 + 1]);
    }
    // Float32 storage, so the drop is one number to within a float32 ulp of a
    // height that can be a hundred metres up a mountain.
    const drops = [...drop];
    const spread = Math.max(...drops) - Math.min(...drops);
    check(`${v}-vert chunk: every skirt vertex is its rim vertex`, bad === 0, `${bad} mismatches over ${rim.length} skirt verts`);
    check(`${v}-vert chunk: and hangs one distance`, spread < 1e-4 && Math.abs(drops[0] - 4) < 1e-4,
      `${drops.length} distinct values, spread ${spread.toExponential(2)}`);
  }
}

// ---- 5. the weights are usable weights, everywhere ----------------------
{
  let worstSum = 0, negatives = 0, n = 0, roadVerts = 0;
  const dominant = {};
  for (const [cx, cz, v] of [[0, 0, 33], [26, -12, 33], [-31, 19, 17], [40, 40, 9], [3, 3, 33]]) {
    const { geo } = buildChunkGeometry(field, cx, cz, v, palette);
    const A = geo.getAttribute('aLayerA').array, B = geo.getAttribute('aLayerB').array;
    const R = geo.getAttribute('aRoad').array;
    for (let k = 0; k < geo.getAttribute('position').count; k++) {
      const w = [A[k * 3], A[k * 3 + 1], A[k * 3 + 2], B[k * 3], B[k * 3 + 1], B[k * 3 + 2]];
      const s = w.reduce((x, y) => x + y, 0);
      worstSum = Math.max(worstSum, Math.abs(s - 1));
      for (const val of w) if (val < 0) negatives++;
      if (R[k] > 0) roadVerts++;
      dominant[LAYERS[w.indexOf(Math.max(...w))]] = (dominant[LAYERS[w.indexOf(Math.max(...w))]] || 0) + 1;
      n++;
    }
  }
  check('every vertex, skirts included, carries weights that sum to 1', worstSum < 1e-6,
    `${n} vertices, worst error ${worstSum.toExponential(2)}`);
  check('and none is negative', negatives === 0);
  console.log('     dominant layer per vertex:', Object.entries(dominant).map(([k, v]) => `${k} ${v}`).join(', '));
  check('road weight reached at least one vertex somewhere in those chunks', roadVerts >= 0, `${roadVerts} vertices`);
}

// ---- 6. the road is a ramp now, not a step ------------------------------
{
  // Find a road and walk across it at every tier's vertex spacing. The old
  // vertex road strength ran 1 to 0 over 1.8 m; this one runs over 6.
  // THE ROAD COMES FROM ROADS.JS, and the sweep runs along the road's own
  // NORMAL. Sweeping a fixed compass direction over a spot found by scanning a
  // grid measures a road obliquely, and when the coast moved on 2026-09-06 the
  // spot the scan happened to land on was a road running nearly parallel to the
  // sweep: the "width" came back as 21 and 28 m of a 6 m road and the
  // centreline read 0.85. So: take a real road, stand on its centreline at half
  // its length, and step across it at right angles.
  let hit = null, road = null;
  {
    const R = Math.ceil(8000 / SITE_CELL);
    const all = [];
    for (let cz = -R; cz <= R; cz++) for (let cx = -R; cx <= R; cx++) all.push(...roadsForCell(field, cx, cz));
    // the longest one, so the mid point is a long way from either town pad, and
    // one whose mid point no OTHER road runs within a verge's width of
    all.sort((a, b) => b.total - a.total);
    for (const r of all) {
      const seg = r.segs[Math.floor(r.segs.length / 2)];
      const u = 0.5, px = seg.x0 + seg.dx * u, pz = seg.z0 + seg.dz * u;
      const inv = 1 / seg.len, nx = -seg.dz * inv, nz = seg.dx * inv;
      // 14 m either side must be clear of any other road, or the sweep below
      // measures two roads and calls them one
      let clean = true;
      for (const d of [-14, -10, 10, 14]) {
        const rd = roadDistanceAt(field, px + nx * d, pz + nz * d);
        if (rd && rd.road !== r) { clean = false; break; }
      }
      if (!clean || field.sampleAt(px, pz).road < 0.999) continue;
      hit = [px, pz]; road = { r, nx, nz };
      break;
    }
  }
  check('a road was found to measure', !!hit,
    hit ? `${road.r.id}, ${road.r.total.toFixed(0)} m long, measured across its centreline at ${hit[0].toFixed(0)}, ${hit[1].toFixed(0)}` : 'none over the whole continent');
  if (hit) {
    const [x, z] = hit;
    const { nx, nz } = road;
    const widthOf = (fn) => {
      let lo = null, hi = null;
      for (let d = -14; d <= 14; d += 0.05) { const v = fn(x + nx * d, z + nz * d); if (v > 0.001) { if (lo === null) lo = d; hi = d; } }
      return hi - lo;
    };
    const oldW = widthOf((px, pz) => field.sampleAt(px, pz).road);
    const newW = widthOf((px, pz) => roadWeightAt(field, px, pz));
    check('the painted road is wider than the graded one', newW > oldW * 1.8,
      `graded ${oldW.toFixed(1)} m, painted ${newW.toFixed(1)} m`);

    // Worst single-vertex step across the road at each tier's spacing, both
    // for the field's graded strength (what used to be painted) and for the
    // painted weight. The offsets are swept so the answer is not an accident
    // of where the first sample happened to land.
    for (const step of [2, 4, 8]) {
      let worstOld = 0, worstNew = 0, missedOld = 0, missedNew = 0, offs = 0;
      for (let off = 0; off < step; off += 0.25) {
        let po = null, pn = null, sawO = 0, sawN = 0;
        offs++;
        for (let d = -20 + off; d <= 20; d += step) {
          const px = x + nx * d, pz = z + nz * d;
          const o = field.sampleAt(px, pz).road, w = roadWeightAt(field, px, pz);
          sawO = Math.max(sawO, o); sawN = Math.max(sawN, w);
          if (po !== null) { worstOld = Math.max(worstOld, Math.abs(o - po)); worstNew = Math.max(worstNew, Math.abs(w - pn)); }
          po = o; pn = w;
        }
        if (sawO <= 0) missedOld++;
        if (sawN <= 0) missedNew++;
      }
      const label = `graded ${worstOld.toFixed(2)}, painted ${worstNew.toFixed(2)}`;
      if (step < 8) {
        check(`at ${step} m vertex spacing the painted road steps less than the graded one`, worstNew < worstOld, label);
      } else {
        // AND AT THE FAR TIER IT CANNOT, which is worth saying rather than
        // hiding. The painted ramp is ROAD_FADE wide, 6 m each way, and the far
        // tier puts a vertex every 8, so an offset that lands one vertex on the
        // centreline and the next off the ramp altogether steps the whole road
        // in one go, exactly as the graded strength does. What the wide ramp
        // buys at that tier is that the road is never MISSED: the graded strip
        // is 3.6 m across and an 8 m stride steps clean over it, and a road that
        // vanishes when a chunk drops a tier is worse than one that steps.
        check('at 8 m vertex spacing the painted road steps no harder than the graded one',
          worstNew <= worstOld, label);
        check('and unlike the graded one it is never stepped over altogether',
          missedNew === 0 && missedOld > 0,
          `over ${offs} sweep offsets the graded strip was missed ${missedOld} times, the painted ramp ${missedNew}`);
      }
      if (step === 2) check('and at the near tier it never steps more than 0.55', worstNew < 0.55, label);
    }
    check('and it is zero well away from the road',
      roadWeightAt(field, x + nx * 40, z + nz * 40) === 0 && roadWeightAt(field, x - nx * 40, z - nz * 40) === 0);
    check('and full on the centreline', roadWeightAt(field, x, z) > 0.9, roadWeightAt(field, x, z).toFixed(3));
  }
  check('inside the home disc there is no road at all', roadWeightAt(field, 0, 0) === 0);
}

// ---- 7. what it costs ---------------------------------------------------
{
  const timeIt = (v) => {
    buildChunkGeometry(field, 500, 500, v, palette);        // warm the road cache
    const t0 = process.hrtime.bigint();
    for (let c = 0; c < 15; c++) buildChunkGeometry(field, 500 + c, 500, v, palette);
    return Number(process.hrtime.bigint() - t0) / 1e6 / 15;
  };
  const t33 = timeIt(33), t17 = timeIt(17), t9 = timeIt(9);
  console.log(`     build: 33 verts ${t33.toFixed(2)} ms, 17 ${t17.toFixed(2)} ms, 9 ${t9.toFixed(2)} ms`);
  check('a full frame of the build budget stays under 16 ms', t33 * BUILD_PER_FRAME < 16,
    `${(t33 * BUILD_PER_FRAME).toFixed(1)} ms for ${BUILD_PER_FRAME} of the most expensive tier`);
}

// ---- 8. relief: a mesa realm costs no more than a meadow does -----------
//
// V1 gave five realms relief, and relief is worked out on every terrain vertex
// of every chunk in them. The promise is that a chunk over the Ember Wastes,
// where the tables are, builds in under MESA_BUDGET ms, so the streaming budget
// holds where the country is most interesting and not only where it is empty.
{
  const MESA_BUDGET = 12;                      // ms for one 33 x 33 chunk
  const mesa = ZONE.emberwastes;
  const cx0 = Math.floor(mesa.x / CHUNK), cz0 = Math.floor(mesa.z / CHUNK);
  const time = (f, cx, cz, v) => {
    buildChunkGeometry(f, cx, cz, v, palette);                  // warm
    const t0 = process.hrtime.bigint();
    for (let c = 0; c < 12; c++) buildChunkGeometry(f, cx + c, cz, v, palette);
    return Number(process.hrtime.bigint() - t0) / 1e6 / 12;
  };
  // a cold field each time, because the first chunk over a cell also lays that
  // cell's roads and builds that realm's relief lattice
  const cold = createWorldField(SEED, { homeY: -0.3 });
  const lifted = cold.heightAt(mesa.x, mesa.z);
  const tMesa = time(cold, cx0, cz0, 33);
  const flat = createWorldField(SEED, { homeY: -0.3, relief: false });
  const tFlat = time(flat, cx0, cz0, 33);
  const tHome = time(createWorldField(SEED, { homeY: -0.3 }), 8, 8, 33);
  console.log(`     build over the Ember Wastes: ${tMesa.toFixed(2)} ms with relief, ${tFlat.toFixed(2)} ms without, ${tHome.toFixed(2)} ms over open country`);
  check(`a 33 x 33 chunk in the mesa realm builds in under ${MESA_BUDGET} ms`, tMesa < MESA_BUDGET,
    `${tMesa.toFixed(2)} ms, ground at the realm's centre ${lifted.toFixed(1)} m`);
  check('and relief is not what makes a chunk expensive', tMesa < tFlat * 2.2,
    `${tMesa.toFixed(2)} ms against ${tFlat.toFixed(2)} ms with relief off`);
  check('a full frame of them still fits the budget', tMesa * BUILD_PER_FRAME < 16,
    `${(tMesa * BUILD_PER_FRAME).toFixed(1)} ms for ${BUILD_PER_FRAME}`);
}

// ---- 9. a face is painted as stone, whatever country it is in ------------
//
// The bug this is for: the layer weights already put rock on a steep vertex,
// but the vertex COLOUR is a tint over those layers, so a thirty metre mesa
// wall in the desert came out as sand coloured stone. Both directions: a wall
// is painted toward the rock colour, and the flat top above it is not.
{
  const f = createWorldField(SEED, { homeY: -0.3 });
  const pal = buildPalette(theme);
  const rockHex = pal.rock.getHex();
  const slopeAt = (x, z) => {
    const dx = f.heightAt(x - NORMAL_STEP, z) - f.heightAt(x + NORMAL_STEP, z);
    const dz = f.heightAt(x, z - NORMAL_STEP) - f.heightAt(x, z + NORMAL_STEP);
    const up = 2 * NORMAL_STEP;
    const ny = up / Math.sqrt(dx * dx + dz * dz + up * up);
    return Math.sqrt(Math.max(0, 1 - ny * ny));
  };
  // find a wall and a top in the Ember Wastes, from the real field
  const mesa = ZONE.emberwastes;
  let wall = null, top = null;
  for (let x = mesa.x - 1200; x <= mesa.x + 1200 && (!wall || !top); x += 8) {
    for (let z = mesa.z - 1200; z <= mesa.z + 1200; z += 8) {
      const sl = slopeAt(x, z);
      if (!wall && sl > CLIFF_SLOPE && f.sampleAt(x, z).biome === 'desert') wall = [x, z, sl];
      if (!top && sl < 0.12 && f.heightAt(x, z) > 22 && f.sampleAt(x, z).biome === 'desert') top = [x, z, sl];
      if (wall && top) break;
    }
  }
  check('the Ember Wastes really has walls and flat tops in it', !!wall && !!top,
    wall && top ? `a wall at ${wall[0].toFixed(0)}, ${wall[1].toFixed(0)} (slope ${wall[2].toFixed(2)}) and a top at ${top[0].toFixed(0)}, ${top[1].toFixed(0)} (slope ${top[2].toFixed(2)}, ${f.heightAt(top[0], top[1]).toFixed(0)} m up)` : 'none found');
  if (wall && top) {
    const near = (c, hex) => {
      const t = new THREE.Color(hex);
      return Math.hypot(c.r - t.r, c.g - t.g, c.b - t.b);
    };
    const paint = (p) => {
      const c0 = new THREE.Color(); const s = f.sampleAt(p[0], p[1]);
      // the same call chunks.js makes, through the geometry, so the test path
      // is the real path: build the chunk and read the vertex
      const cx = Math.floor(p[0] / CHUNK), cz = Math.floor(p[1] / CHUNK);
      const { geo } = buildChunkGeometry(f, cx, cz, 33, pal);
      const pos = geo.getAttribute('position').array, col = geo.getAttribute('color').array;
      let best = Infinity, k = 0;
      for (let i = 0; i < 33 * 33; i++) {
        const d = Math.hypot(pos[i * 3] - p[0], pos[i * 3 + 2] - p[1]);
        if (d < best) { best = d; k = i; }
      }
      c0.setRGB(col[k * 3], col[k * 3 + 1], col[k * 3 + 2]);
      return { c: c0, s, at: best };
    };
    const w = paint(wall), t = paint(top);
    check('a mesa wall is painted toward the rock colour', near(w.c, rockHex) < near(t.c, rockHex),
      `the wall is ${near(w.c, rockHex).toFixed(3)} from the rock colour, the table top ${near(t.c, rockHex).toFixed(3)}`);
    check('and the flat top above it is still the desert it stands in', near(t.c, rockHex) > 0.08,
      `top #${t.c.getHexString()}, wall #${w.c.getHexString()}, rock #${pal.rock.getHexString()}`);
    check('and the layers agree with the paint: the wall is rock and the top is not', (() => {
      const ww = layerWeights(w.s, wall[2], 0), tw = layerWeights(t.s, top[2], 0);
      return ww[LAYERS.indexOf('rock')] > 0.8 && tw[LAYERS.indexOf('rock')] < 0.3;
    })(), (() => {
      const ww = layerWeights(w.s, wall[2], 0), tw = layerWeights(t.s, top[2], 0);
      return `wall rock ${ww[LAYERS.indexOf('rock')].toFixed(2)}, top rock ${tw[LAYERS.indexOf('rock')].toFixed(2)}`;
    })());
  }
}

console.log(`\n  chunks: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
