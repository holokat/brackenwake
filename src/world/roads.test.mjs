// Roads between settlements, driven both ways. Run: node src/world/roads.test.mjs
//
// Every number printed here was measured in this file. Where a bound is
// asserted, the same measurement is also taken somewhere the bound does not
// hold, so passing means something.
import { createWorldField, CHUNK } from './field.js';
import {
  roadsForCell, roadDistanceAt, roadHeightAt, linksForCell,
  ROAD_HALF_WIDTH, ROAD_CUT, ROAD_FILL, ROAD_GRADE, ROAD_LINKS, ROAD_REACH,
} from './roads.js';
import { recordsFor } from './flora.js';
import { buildChunkGeometry, buildPalette } from './chunks.js';
import { SITE_CELL } from './sitegrid.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

const SEED = 20260904;
const f = createWorldField(SEED, { homeY: -0.3 });
const g = createWorldField(SEED, { homeY: -0.3 });
const other = createWorldField(7, { homeY: -0.3 });
const bare = createWorldField(SEED, { homeY: -0.3, roads: false });   // the same world, roads never laid
const R0 = -16, R1 = 16;      // the cell square everything is surveyed over
// 16 cells of 480 m is 7.68 km, which is inside WORLD_HALF (src/world/zones.js).
// The survey used to run to 12 km; the world is bounded now and everything past
// 8 km is the ring ocean, where no settlement stands and so no road is laid.
const isSettlement = (s) => !!s && (s.kind === 'town' || s.kind === 'hamlet');
// the same smoothstep the field uses, so the falloff can be predicted here
const smooth = (e0, e1, v) => { const t = Math.max(0, Math.min(1, (v - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

// A point and its unit normal at arc-length fraction t along a road.
function alongRoad(r, t) {
  const want = t * r.total;
  let s = r.segs[r.segs.length - 1], u = 1;
  for (const q of r.segs) if (want <= q.cum + q.len) { s = q; u = Math.max(0, (want - q.cum) / q.len); break; }
  return { x: s.x0 + s.dx * u, z: s.z0 + s.dz * u, nx: -s.dz / s.len, nz: s.dx / s.len };
}

const roads = [];
for (let cz = R0; cz < R1; cz++) for (let cx = R0; cx < R1; cx++) roads.push(...roadsForCell(f, cx, cz));
console.log(`  surveying ${(R1 - R0) * (R1 - R0)} cells (${((R1 - R0) * SITE_CELL / 1000).toFixed(1)} km square): ${roads.length} roads`);
// The world is bounded (src/world/zones.js), so this is not a sample of an
// endless world any more: it is every road there is. Seventy two settlements
// stand on the continent and twelve roads join them; the survey used to run
// out to 12 km and count seventy eight.
check('the world has roads to test', roads.length >= 10, `${roads.length} roads over the whole continent`);

// ---- 1. the graph is a function of the seed -------------------------------
{
  const shape = (r) => `${r.id}|${r.pts.map((p) => p.x.toFixed(4) + ',' + p.z.toFixed(4)).join(';')}|${[...r.prof].map((v) => v.toFixed(4)).join(',')}`;
  const a = [], b = [];
  for (let cz = R0; cz < R0 + 20; cz++) for (let cx = R0; cx < R0 + 20; cx++) {
    for (const r of roadsForCell(f, cx, cz)) a.push(shape(r));
    for (const r of roadsForCell(g, cx, cz)) b.push(shape(r));
  }
  check('same seed, same roads: same ids, same bends, same profiles', a.length > 0 && a.join('\n') === b.join('\n'), `${a.length} roads compared`);
  // and asking a second time gives the same objects back, not new ones
  const twice = roadsForCell(f, R0, R0) === roadsForCell(f, R0, R0);
  check('a cell answers with the roads it already built', twice);
  let differ = 0, seen = 0;
  for (let cz = R0; cz < R0 + 20; cz++) for (let cx = R0; cx < R0 + 20; cx++) {
    const p = roadsForCell(f, cx, cz).map(shape).join(), q = roadsForCell(other, cx, cz).map(shape).join();
    seen++; if (p !== q) differ++;
  }
  check('different seed, different roads', differ > seen * 0.05, `${differ}/${seen} cells differ`);
}

// ---- 2. every road exactly once, owned by the smaller id ------------------
{
  const ids = roads.map((r) => r.id);
  const dupes = ids.length - new Set(ids).size;
  check('no road is emitted twice', dupes === 0, `${ids.length} roads, ${dupes} duplicates`);
  let wrongOwner = 0, notTouching = 0, notSettlement = 0, unusable = 0;
  for (let cz = R0; cz < R1; cz++) for (let cx = R0; cx < R1; cx++) {
    for (const r of roadsForCell(f, cx, cz)) {
      if (!(r.a.id < r.b.id) || r.a.cx !== cx || r.a.cz !== cz) wrongOwner++;
      if (Math.abs(r.a.cx - r.b.cx) > 1 || Math.abs(r.a.cz - r.b.cz) > 1) notTouching++;
      if (!isSettlement(r.a) || !isSettlement(r.b)) notSettlement++;
      if (!r.usable) unusable++;
    }
  }
  check('a road belongs to the end with the smaller id', wrongOwner === 0, String(wrongOwner));
  check('both ends of a road are in touching cells', notTouching === 0, String(notTouching));
  check('both ends of a road are a town or a hamlet', notSettlement === 0, String(notSettlement));
  check('no unusable road is emitted', unusable === 0, String(unusable));
}

// ---- 3. who gets a road, and who does not --------------------------------
{
  const incident = new Map();     // site id -> roads touching it
  for (const r of roads) {
    (incident.get(r.a.id) || incident.set(r.a.id, []).get(r.a.id)).push(r);
    (incident.get(r.b.id) || incident.set(r.b.id, []).get(r.b.id)).push(r);
  }
  let linked = 0, linkedNoRoad = 0, unlinked = 0, unlinkedWithRoad = 0, tooMany = 0, oneWay = 0;
  for (let cz = R0 + 1; cz < R1 - 1; cz++) for (let cx = R0 + 1; cx < R1 - 1; cx++) {
    const s = f.siteInCell(cx, cz);
    if (!isSettlement(s)) continue;
    const links = linksForCell(f, cx, cz);
    if (links.length > ROAD_LINKS) tooMany++;
    const mine = incident.get(s.id) || [];
    if (links.length) { linked++; if (!mine.length) linkedNoRoad++; }
    else { unlinked++; if (mine.length) unlinkedWithRoad++; }
    // a road exists when EITHER end picked the other, so count the ones this
    // settlement did not pick but that reached it anyway
    for (const r of mine) { const o = r.a.id === s.id ? r.b : r.a; if (links.indexOf(o) < 0) oneWay++; }
  }
  check('a settlement takes at most ROAD_LINKS neighbours', tooMany === 0, String(tooMany));
  check('every settlement with a reachable neighbour has a road', linked > 0 && linkedNoRoad === 0, `${linked} such settlements, ${linkedNoRoad} without`);
  check('and a settlement with no reachable neighbour has none', unlinked > 0 && unlinkedWithRoad === 0, `${unlinked} such settlements, ${unlinkedWithRoad} with one anyway`);
  // The link rule is an OR: a road exists when EITHER end picked the other. The
  // old test looked for an example of a one way pick, which this world does not
  // happen to contain now that it is bounded (all twelve roads were picked by
  // both ends). So the invariant itself is checked instead, over every road,
  // which is the claim the OR actually makes and does not depend on the sample.
  let bothWays = 0, neither = 0;
  for (const r of roads) {
    const aPicked = linksForCell(f, r.a.cx, r.a.cz).indexOf(r.b) >= 0;
    const bPicked = linksForCell(f, r.b.cx, r.b.cz).indexOf(r.a) >= 0;
    if (aPicked && bPicked) bothWays++;
    if (!aPicked && !bPicked) neither++;
  }
  check('every road exists because at least one end picked the other', roads.length > 0 && neither === 0,
    `${bothWays}/${roads.length} were picked by both ends, ${oneWay} ends took a road they did not pick`);
}

// ---- 4. what a point on a road, and beside one, reports -------------------
{
  // Roads meet at towns, so a point 3 or 10 m to the side of one road can be
  // standing on another. Those points are counted separately rather than
  // quietly dropped: the claim is about the NEAREST road.
  let onCentre = 0, tOk = 0, n = 0, shared = 0, inBend = 0;
  let atVerge = 0, vergeN = 0, at10 = 0, tenN = 0, nullAt10 = 0;
  let invariant = 0, invariantN = 0;
  for (const r of roads) {
    for (let i = 0; i <= 10; i++) {
      const t = i / 10, p = alongRoad(r, t); n++;
      const s = f.sampleAt(p.x, p.z), rd = roadDistanceAt(f, p.x, p.z);
      if (s.road > 0.999) onCentre++;
      if (rd && rd.d < 1e-6 && (rd.road !== r || Math.abs(rd.t - t) < 0.02)) tOk++;
      for (const off of [ROAD_HALF_WIDTH, 10]) {
        const x = p.x + p.nx * off, z = p.z + p.nz * off;
        const q = roadDistanceAt(f, x, z);
        if (q && q.road !== r) { shared++; continue; }       // another road is nearer here
        const road = f.sampleAt(x, z).road;
        if (off === 10) { tenN++; if (road === 0) at10++; if (!q) nullAt10++; }
        // stepping sideways off one segment lands inside the bend to the next,
        // where the road is genuinely nearer than the step was long
        else if (q && q.d < ROAD_HALF_WIDTH - 1e-9) inBend++;
        else { vergeN++; if (road === 0) atVerge++; }
      }
      // the exact rule, wherever a point lands: road is roadStrength of the
      // distance to the nearest road, and 0 where there is none
      for (const off of [0, 1, 2, 2.9, 3.1, 5, 7, 12]) {
        const x = p.x + p.nx * off, z = p.z + p.nz * off;
        if (f.homeFactor(x, z) < 1) continue;                // the farm disc fades it out
        const q = roadDistanceAt(f, x, z);
        const want = q ? Math.max(0, 1 - smooth(ROAD_HALF_WIDTH * 0.4, ROAD_HALF_WIDTH, q.d)) : 0;
        invariantN++;
        if (Math.abs(f.sampleAt(x, z).road - want) < 1e-12) invariant++;
      }
    }
  }
  check('a point on the centreline reports road 1', onCentre === n, `${onCentre}/${n}`);
  check('and roadDistanceAt puts it at d 0 and the right t', tOk === n, `${tOk}/${n}`);
  check(`a point ${ROAD_HALF_WIDTH} m from the nearest road reports road 0`, atVerge === vergeN && vergeN > 0, `${atVerge}/${vergeN}, ${inBend} more landed inside a bend and were nearer`);
  check('a point 10 m off reports road 0', at10 === tenN && tenN > 0, `${at10}/${tenN}`);
  check(`and no road at all, since roadDistanceAt reaches ${ROAD_REACH} m`, nullAt10 === tenN, `${nullAt10}/${tenN}`);
  check('points to the side that are on another road were counted apart', shared > 0, `${shared} of ${n * 2}, where two roads meet at a town`);
  check('road is exactly the falloff of the distance to the nearest road', invariant === invariantN, `${invariant}/${invariantN} points`);
  // Road falls off smoothly rather than in a step. Measured on EVERY road, not
  // on roads[0]: three of the twelve pass within a verge's width of another
  // road, and a hair of that road's strength at 3 m used to fail this outright
  // depending on which road the survey happened to put first.
  let ramps = 0, bad = [];
  for (const r of roads) {
    const p = alongRoad(r, 0.5);
    const ramp = [0, 1, 2, 2.5, 3].map((d) => f.sampleAt(p.x + p.nx * d, p.z + p.nz * d).road);
    let falls = ramp[0] === 1 && ramp[4] < 0.01;
    for (let i = 1; i < ramp.length; i++) if (ramp[i] > ramp[i - 1]) falls = false;
    if (falls) ramps++; else bad.push(`${r.id} ${ramp.map((v) => v.toFixed(3)).join(' ')}`);
  }
  check('road falls off from centreline to verge, on every road', ramps === roads.length, bad.join(' | ') || `${ramps}/${roads.length}`);
}

// ---- 5. the nine cells a point looks at are enough ------------------------
{
  // brute force: every road owned anywhere in a 7 x 7 block round the point
  function brute(x, z) {
    const cx = Math.floor(x / SITE_CELL), cz = Math.floor(z / SITE_CELL);
    let best = null;
    for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
      for (const r of roadsForCell(f, cx + dx, cz + dz)) {
        for (const s of r.segs) {
          let u = ((x - s.x0) * s.dx + (z - s.z0) * s.dz) / s.len2;
          u = u < 0 ? 0 : u > 1 ? 1 : u;
          const d = Math.hypot(s.x0 + s.dx * u - x, s.z0 + s.dz * u - z);
          if (d <= ROAD_REACH && (!best || d < best.d)) best = { d, id: r.id };
        }
      }
    }
    return best;
  }
  let checked = 0, disagree = 0, found = 0;
  for (const r of roads.slice(0, 40)) {
    for (let i = 0; i <= 12; i++) {
      const p = alongRoad(r, i / 12);
      for (const off of [0, 2, 5, 5.9, 20]) {
        const x = p.x + p.nx * off, z = p.z + p.nz * off;
        const fast = roadDistanceAt(f, x, z), slow = brute(x, z);
        checked++;
        if (!fast && !slow) continue;
        if (!fast || !slow || Math.abs(fast.d - slow.d) > 1e-9) disagree++;
        else found++;
      }
    }
  }
  check('the 9 cells a point reads find every road a 7 x 7 sweep finds', disagree === 0, `${checked} points, ${found} on a road, ${disagree} disagree`);
  // and roads never stray outside the neighbourhood their owner can be found in
  let strayed = 0;
  for (const r of roads) {
    for (const p of r.pts) {
      if (Math.abs(Math.floor(p.x / SITE_CELL) - r.a.cx) > 1 || Math.abs(Math.floor(p.z / SITE_CELL) - r.a.cz) > 1) strayed++;
    }
  }
  check('no road bends outside its owner cell and the 8 around it', strayed === 0, String(strayed));
}

// ---- 6. the earthworks: smoother on the road than beside it ---------------
const STEP = 4;   // metres between height samples along a line
function lineOf(r, off) {
  const n = Math.max(2, Math.round(r.total / STEP)), out = [];
  for (let i = 0; i <= n; i++) {
    const p = alongRoad(r, i / n);
    const s = f.sampleAt(p.x + p.nx * off, p.z + p.nz * off);
    // a river bank is the river's, not the road's: a road fords a river and
    // grades nothing there, so the bank is skipped on both lines alike
    out.push({ h: s.h, ford: s.river > 0 });
  }
  return out;
}
const maxSlope = (a) => {
  let m = 0;
  for (let i = 1; i < a.length; i++) { if (a[i].ford || a[i - 1].ford) continue; m = Math.max(m, Math.abs(a[i].h - a[i - 1].h) / STEP); }
  return m;
};
{
  const on = roads.map((r) => maxSlope(lineOf(r, 0)));
  const off = roads.map((r) => Math.max(maxSlope(lineOf(r, 12)), maxSlope(lineOf(r, -12))));
  const worstOn = Math.max(...on), worstOff = Math.max(...off);
  const med = (a) => [...a].sort((x, y) => x - y)[a.length >> 1];
  const offOver = off.filter((v) => v > ROAD_GRADE).length;
  let smoother = 0; for (let i = 0; i < on.length; i++) if (on[i] < off[i]) smoother++;
  check(`no road is ever steeper than ${ROAD_GRADE} over ${STEP} m`, worstOn <= ROAD_GRADE,
    `worst ${worstOn.toFixed(3)}, median road ${med(on).toFixed(3)}`);
  // The grading is doing work when the road is smoother than the ground beside
  // it. The old form asked for a verge steeper than ROAD_GRADE somewhere, which
  // was an example rather than a property, and the twelve roads the bounded
  // world holds happen not to contain one.
  check('and the road surface is smoother than the ground 12 m off it', worstOff > worstOn,
    `road worst ${worstOn.toFixed(3)}, verge worst ${worstOff.toFixed(3)} on ${offOver}/${off.length} verges over ${ROAD_GRADE}, verge median ${med(off).toFixed(3)}`);
  check('most roads are smoother than their own verge', smoother > roads.length * 0.8, `${smoother}/${roads.length}`);
}

// ---- 7. the earthworks: how much ground a road may move -------------------
{
  let deepest = 0, highest = 0, pts = 0, drowned = 0, drownedDry = 0;
  let padMoved = 0, padPts = 0;
  for (const r of roads) {
    const n = Math.max(2, Math.round(r.total / 2));
    for (let i = 0; i <= n; i++) {
      const p = alongRoad(r, i / n);
      const s = f.sampleAt(p.x, p.z), b = bare.sampleAt(p.x, p.z);
      const d = s.h - b.h; pts++;
      if (d < deepest) deepest = d;
      if (d > highest) highest = d;
      if (s.h < f.seaLevel) { drowned++; if (s.river === 0) drownedDry++; }
    }
    // the town pad is untouched: a road arrives at the town's own level
    for (const site of [r.a, r.b]) {
      for (let a = 0; a < 6.28; a += 0.7) {
        const x = site.x + Math.cos(a) * site.flatR * 0.4, z = site.z + Math.sin(a) * site.flatR * 0.4;
        padPts++; if (Math.abs(f.heightAt(x, z) - site.y) > 1e-9) padMoved++;
      }
    }
  }
  check(`a road never cuts more than ${ROAD_CUT} m below the roadless world`, deepest >= -ROAD_CUT - 1e-9, `deepest cut ${deepest.toFixed(3)} m over ${pts} centreline points`);
  check(`nor stands more than ${ROAD_FILL} m above it`, highest <= ROAD_FILL + 1e-9, `highest fill ${highest.toFixed(3)} m`);
  check('the flat pad wins over the road', padMoved === 0, `${padPts} points inside a town pad, ${padMoved} moved`);
  check('a road only goes under water where it fords a river', drownedDry === 0, `${drowned} points under sea level, all at a river`);
  // and the two ends sit at the two towns' levels
  let ends = 0;
  for (const r of roads) if (Math.abs(roadHeightAt(r, 0) - r.a.y) < 1e-9 && Math.abs(roadHeightAt(r, 1) - r.b.y) < 1e-9) ends++;
  check('the profile starts and ends at the two town pads', ends === roads.length, `${ends}/${roads.length}`);
}

// ---- 8. the road survives every system between the field and the player ---
{
  // flora: nothing stands on the road, and the verge still has its trees
  const withRoad = new Set(), verge = new Set();
  let onRoad = 0, nearRoad = 0, chunks = 0;
  for (const r of roads) {
    const p = alongRoad(r, 0.5);
    const cx = Math.floor(p.x / CHUNK), cz = Math.floor(p.z / CHUNK);
    const key = cx + ',' + cz;
    if (withRoad.has(key)) continue;
    withRoad.add(key); chunks++;
    for (const list of Object.values(recordsFor(f, cx, cz, { sitesNear: () => [] }))) {
      for (const rec of list) {
        const s = f.sampleAt(rec.x, rec.z);
        if (s.road > 0.15) onRoad++;
        else if (s.road > 0) nearRoad++;
        else if (roadDistanceAt(f, rec.x, rec.z)) verge.add(rec);
      }
    }
  }
  check('nothing grows where road is over 0.15', onRoad === 0, `${chunks} chunks with a road through them`);
  check('but the verge keeps its trees', nearRoad + verge.size > 0, `${nearRoad} on the shoulder, ${verge.size} within ${ROAD_REACH} m`);

  // chunks: the road actually reaches the mesh. Two palettes differing only in
  // the road colour must repaint exactly the vertices the field calls road.
  const theme = [{ id: 'meadow', colors: { grass: 0x6cb552, grassEdge: 0x4e8c3e, dirtTop: 0x9a8055, dirtDeep: 0x6d5a3c, water: 0x3f7fa6 } }];
  const pa = buildPalette(theme), pb = buildPalette(theme);
  check('the palette carries a packed-earth road colour', pa.road.getHex() === 0x8a7355, '#' + pa.road.getHexString());
  pa.road.setHex(0x000000); pb.road.setHex(0xffffff);
  let painted = 0, wrongly = 0, missed = 0, verts = 0;
  for (const key of [...withRoad].slice(0, 12)) {
    const [cx, cz] = key.split(',').map(Number);
    const A = buildChunkGeometry(f, cx, cz, 33, pa).geo.getAttribute('color').array;
    const B = buildChunkGeometry(f, cx, cz, 33, pb).geo.getAttribute('color').array;
    for (let j = 0; j < 33; j++) for (let i = 0; i < 33; i++) {
      const k = j * 33 + i; verts++;
      const x = cx * CHUNK + i * 2, z = cz * CHUNK + j * 2;
      const road = f.sampleAt(x, z).road;
      const differs = Math.abs(A[k * 3] - B[k * 3]) > 1e-6;
      if (road > 0 && differs) painted++;
      else if (road > 0) missed++;
      else if (differs) wrongly++;
    }
  }
  check('every vertex the field calls road is painted with the road colour', painted > 0 && missed === 0, `${painted} of ${verts} vertices painted`);
  check('and no vertex off the road is', wrongly === 0, String(wrongly));
}

// ---- 9. what it costs ----------------------------------------------------
{
  // A chunk that is the first to touch a site cell pays for laying out that
  // cell's roads; every later chunk reads them. Both are measured, cold on a
  // field that has never been asked anything.
  const cell = (() => { for (let cz = R0; cz < R1; cz++) for (let cx = R0; cx < R1; cx++) if (roadsForCell(f, cx, cz).length) return [cx, cz]; })();
  const ccx = Math.floor((cell[0] * SITE_CELL + SITE_CELL / 2) / CHUNK), ccz = Math.floor((cell[1] * SITE_CELL + SITE_CELL / 2) / CHUNK);
  const chunkCost = (w, cx, cz) => {
    const t0 = process.hrtime.bigint();
    for (let j = 0; j < 33; j++) for (let i = 0; i < 33; i++) w.sampleAt(cx * CHUNK + i * 2, cz * CHUNK + j * 2);
    return Number(process.hrtime.bigint() - t0) / (33 * 33) / 1000;
  };
  const warm = createWorldField(SEED, { homeY: -0.3 });
  for (let k = 0; k < 6; k++) chunkCost(warm, ccx + 40 + k, ccz + 40);      // let the JIT settle away from roads
  let worstCold = 0, sumCold = 0, cold = 0;
  for (let cz = R0; cz < R1; cz += 3) for (let cx = R0; cx < R1; cx += 3) {
    if (!roadsForCell(f, cx, cz).length) continue;
    const w = createWorldField(SEED, { homeY: -0.3 });
    const c = chunkCost(w, Math.floor((cx * SITE_CELL + SITE_CELL / 2) / CHUNK), Math.floor((cz * SITE_CELL + SITE_CELL / 2) / CHUNK));
    cold++; sumCold += c; if (c > worstCold) worstCold = c;
  }
  const hot = createWorldField(SEED, { homeY: -0.3 });
  chunkCost(hot, ccx, ccz);
  let sumWarm = 0, nWarm = 0;
  for (let d = 0; d < 6; d++) { sumWarm += chunkCost(hot, ccx, ccz); nWarm++; }
  const noRoads = createWorldField(SEED, { homeY: -0.3, roads: false });
  chunkCost(noRoads, ccx, ccz);
  let sumBare = 0; for (let d = 0; d < 6; d++) sumBare += chunkCost(noRoads, ccx, ccz);
  check('a 33 x 33 chunk over a road costs under 4 us a sample, warm',
    sumWarm / nWarm < 4, `${(sumWarm / nWarm).toFixed(3)} us vs ${(sumBare / 6).toFixed(3)} us with roads off`);
  check('and under 4 us even on the chunk that lays the cell out',
    worstCold < 4, `worst of ${cold} cold cells ${worstCold.toFixed(3)} us, mean ${(sumCold / cold).toFixed(3)} us`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
