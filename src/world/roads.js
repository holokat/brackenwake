// Dirt roads between neighbouring settlements. Pure, no THREE, runs in node.
//
// A town or a hamlet looks at the eight cells around it and takes the nearest
// two towns or hamlets it can actually reach as its road neighbours. A road
// exists if either end picked the other, and it belongs to the end with the
// lexically smaller site id, so `roadsForCell` emits every road exactly once
// and two cells never build the same road twice with different bends.
//
// A road is a polyline: the two sites with one or two bend points between them,
// each shoved sideways by a hashed offset, so roads wander instead of ruling a
// straight line across the map. Along it runs a height profile, sampled from
// the ground every ANCHOR_STEP and then smoothed, which is what field.js grades
// the ground toward. The profile is pinned to the two town pads at its ends so
// a road meets a town at the town's own level, and it is smoothed rather than
// straightened so a road climbs a hill instead of tunnelling it.
//
// Not every neighbour is reachable. Settlements stand on any dry ground up to
// 40 m, which puts plenty of them on opposite shores of a bay, and joining two
// of those with a road lays it along the sea bed. So a road is built first and
// judged afterwards: the surface the road would actually leave is walked, and
// the road is thrown away if any of it drowns, if it climbs more than
// ROAD_CLIMB above its higher end, or if the grading cannot get it under a
// slope of ROAD_GRADE. A settlement then takes the nearest two neighbours that
// survive, which is why a town on a headland can have no roads at all while an
// inland town has two. Fords are exempt from all three: a river is carved to
// -1.8 and a road crosses it without grading anything, so the bank there is the
// river's and not the road's.
//
//   roadsForCell(field, cx, cz)   the roads this cell owns
//   roadDistanceAt(field, x, z)   { d, t, road } for the nearest road, or null
//   roadHeightAt(road, t)         the graded height the road wants at t
//
// Cost matters: field.sampleAt calls roadDistanceAt for every vertex of every
// chunk. Roads are built once per pair and cached, each cell keeps the list of
// roads whose bounding box actually reaches it (usually empty), and the last
// cell asked for is remembered, so the common case is one string compare.

import { hash2, rand2, lerp, smoothstep } from './noise.js';
import { SITE_CELL } from './sitegrid.js';

export const ROAD_HALF_WIDTH = 3;      // metres from the centreline to the verge
export const ROAD_CUT = 1.5;           // deepest a road may dig into a slope
export const ROAD_FILL = 1.5;          // highest a road may stand above the ground
export const ROAD_LINKS = 2;           // road neighbours a settlement takes
export const ROAD_REACH = ROAD_HALF_WIDTH * 2;   // roadDistanceAt looks no further
export const ROAD_CLIMB = 45;          // metres a road may rise above its higher end
export const ROAD_DRY = 0.2;           // metres of road surface kept above sea level
export const ROAD_GRADE = 0.5;         // steepest the graded surface may ever be
const BEND_MAX = 45;                   // metres a bend point may swing sideways
const ANCHOR_STEP = 35;                // metres between height profile anchors
const GRADE_STEP = 4;                  // metres between grade checks along the road
const SMOOTH_PASSES = 3;               // 1-2-1 passes over the profile
const FORD = 0.2;                      // river strength that counts as a crossing

const isSettlement = (s) => !!s && (s.kind === 'town' || s.kind === 'hamlet');

// Caches live per field object, so two seeds never share a road and a test can
// throw a field away. Nothing is stored between runs; it is all a pure function
// of the seed, rebuilt on demand.
const CACHE = new WeakMap();
function stateOf(field) {
  let st = CACHE.get(field);
  if (!st) {
    st = { links: new Map(), owned: new Map(), near: new Map(), pair: new Map(), lastKey: null, lastList: null };
    CACHE.set(field, st);
  }
  return st;
}
/**
 * Throw this field's roads away, because the ground under them moved.
 *
 * A road is laid out ONCE and kept for the life of the field, which was safe
 * while a field was a pure function of its seed. ED3's sculpt header is a thing
 * a person changes at runtime, and every road in the cache was laid on the
 * hillsides the old header made. `field.setTerrainEdits` calls this whenever
 * that header moves, and it is the only caller.
 */
export function resetRoads(field) {
  CACHE.delete(field);
  return true;
}

/**
 * A SCULPT WORLD HAS NO ROADS.
 *
 * The request was a world cleared of everything the generator put in it, and a
 * road is the generator joining two places it also rolled. It is refused at the
 * two functions that BUILD one, rather than only where field.js grades the
 * ground, so nothing downstream sees a road either: flora's avenues ask
 * `roadsNear`, dressing stands its carts and signposts beside a road, and
 * wayside hangs the lamps and the bridges on one. All three come through here.
 * A person who wants a road paints `cobble` or `path` and gets one that goes
 * where they said it should.
 */
const NO_ROADS = Object.freeze([]);

// The ground a road's profile is sampled from and judged against: the raw
// terrain, the home disc, and whatever pad stands here. It cannot call
// field.sampleAt, because sampleAt is what asks for roads.
//
// IT IS FIELD.JS'S OWN FUNCTION and no longer a copy of it. The copy that lived
// here knew about the road's own two settlements and about nothing else, and it
// did not know that a pad takes the road's AUTHORITY as well as its ground:
// field.js grades a road by `road * (1 - pad) * fordFade(river)`, so where a
// town's shoulder owns the ground the road moves none of it. Judged with the
// full weight, the last twelve metres of the road into a hamlet standing on a
// bank read 0.49 to this file and 0.64 to the world. One function, one weight,
// and what a road is judged on is what a road does.
//
// The readings come back in a scratch rather than a fresh object, because
// raw() is the expensive call in this module and asking it twice for one point
// doubled the cost of laying a road. The scratch is this module's own: field.js
// keeps a separate one, so a sampleAt that asks for a road while a road asks
// for the ground cannot clobber either.
const G = { h: 0, river: 0, pad: 0, site: null, k: 0, r: null };
function groundUnder(field, x, z) {
  field.groundNoRoads(x, z, G);
  return G.h;
}

/**
 * The weight field.sampleAt gives a road ON ITS CENTRELINE at this point: the
 * home factor, less whatever the pad owns, less whatever a ford gives back to
 * the river. `roadStrength(0)` is 1, so this is the whole of it.
 */
const roadWeight = () => G.k * (1 - G.pad) * fordFade(G.river);

/** World point at arc-length fraction t along a segment list. */
function pointAlong(segs, total, t) {
  const want = t * total;
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    if (want <= s.cum + s.len || i === segs.length - 1) {
      const u = want <= s.cum ? 0 : Math.min(1, (want - s.cum) / s.len);
      return [s.x0 + s.dx * u, s.z0 + s.dz * u];
    }
  }
  return [segs[0].x0, segs[0].z0];
}

/** The graded height a road wants at arc-length fraction t. */
export function roadHeightAt(road, t) {
  const n = road.prof.length;
  const u = (t < 0 ? 0 : t > 1 ? 1 : t) * (n - 1);
  let i = Math.floor(u);
  if (i > n - 2) i = n - 2;
  if (i < 0) i = 0;
  return lerp(road.prof[i], road.prof[i + 1], u - i);
}

/**
 * The surface a road leaves over ground `g` when it wants to be at `want` and
 * `w` of it is here. This is the whole earthwork, and field.sampleAt and the
 * usability check both go through it, so what a road is judged on is what a
 * road does.
 */
export function roadSurface(g, want, w = 1) {
  const d = (want - g) * w;
  return g + (d < -ROAD_CUT ? -ROAD_CUT : d > ROAD_FILL ? ROAD_FILL : d);
}

/** How much of the earthwork survives where a river runs: none, in the end. */
export const fordFade = (river) => (river > 0 ? 1 - smoothstep(0.02, 0.2, river) : 1);

/**
 * The road between two settlements, built and then judged. Cached per pair, so
 * a pair is built once no matter which of its two ends asks. `a` and `b` are
 * put in id order first, which is what makes a road's bends the same whichever
 * end you approach it from.
 */
function roadFor(field, p, q) {
  const [a, b] = p.id < q.id ? [p, q] : [q, p];
  const st = stateOf(field), key = a.id + '>' + b.id;
  const had = st.pair.get(key);
  if (had) return had;

  const kx = a.cx * 31 + b.cx, kz = a.cz * 31 + b.cz, hs = field.seed + 61;
  const dx = b.x - a.x, dz = b.z - a.z;
  const span = Math.hypot(dx, dz) || 1;
  const px = -dz / span, pz = dx / span;          // unit perpendicular
  const bends = 1 + (hash2(kx, kz, hs) % 2);      // 1 or 2 bend points
  const pts = [{ x: a.x, z: a.z }];
  for (let i = 1; i <= bends; i++) {
    const u = i / (bends + 1);
    const off = (rand2(kx + i * 101, kz - i * 57, hs + i) * 2 - 1) * BEND_MAX;
    pts.push({ x: a.x + dx * u + px * off, z: a.z + dz * u + pz * off });
  }
  pts.push({ x: b.x, z: b.z });

  const segs = [];
  let total = 0, minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const pt of pts) {
    if (pt.x < minX) minX = pt.x;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.z < minZ) minZ = pt.z;
    if (pt.z > maxZ) maxZ = pt.z;
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const sx = pts[i].x, sz = pts[i].z;
    const ex = pts[i + 1].x - sx, ez = pts[i + 1].z - sz;
    const len = Math.hypot(ex, ez) || 1e-6;
    segs.push({ x0: sx, z0: sz, dx: ex, dz: ez, len, len2: len * len, cum: total });
    total += len;
  }

  // height profile: the ground every ANCHOR_STEP, smoothed, ends pinned to the
  // two town pads. Smoothing is what makes the road smoother than the ground
  // beside it; pinning is what stops it stepping off the town square.
  //
  // River anchors are lifted out first. A river is carved to -1.8 and a road
  // fords it rather than damming it, so if the profile were allowed to follow
  // the river bed down, the whole approach to the crossing would be dragged
  // into the water. The profile spans the crossing at the level of the dry
  // ground either side and field.js leaves the ford itself alone.
  const n = Math.max(2, Math.round(total / ANCHOR_STEP) + 1);
  const prof = new Float64Array(n), ground = new Float64Array(n);
  const wetAnchor = new Uint8Array(n);
  // how much of each anchor the road is actually allowed to move, which is what
  // field.sampleAt will give it there and nothing more
  const wAnchor = new Float64Array(n);
  const ceiling = Math.max(a.y, b.y) + ROAD_CLIMB;
  const dry = field.seaLevel + ROAD_DRY;
  for (let i = 0; i < n; i++) {
    const [x, z] = pointAlong(segs, total, i / (n - 1));
    ground[i] = groundUnder(field, x, z);
    wetAnchor[i] = G.river > FORD ? 1 : 0;
    wAnchor[i] = roadWeight();
    prof[i] = ground[i];
  }
  for (let i = 1; i < n - 1; i++) {
    if (!wetAnchor[i]) continue;
    let lo = i - 1, hi = i + 1;
    while (lo > 0 && wetAnchor[lo]) lo--;
    while (hi < n - 1 && wetAnchor[hi]) hi++;
    prof[i] = lerp(prof[lo], ground[hi], (i - lo) / (hi - lo));
  }
  prof[0] = a.y; prof[n - 1] = b.y;
  const tmp = new Float64Array(n);
  for (let s = 0; s < SMOOTH_PASSES; s++) {
    tmp.set(prof);
    for (let i = 1; i < n - 1; i++) prof[i] = 0.25 * tmp[i - 1] + 0.5 * tmp[i] + 0.25 * tmp[i + 1];
  }

  const road = {
    id: key, a, b, pts, segs, total, prof, usable: false,
    minX: minX - ROAD_REACH, maxX: maxX + ROAD_REACH,
    minZ: minZ - ROAD_REACH, maxZ: maxZ + ROAD_REACH,
  };

  // The judgement, made on the surface this road would actually leave rather
  // than on the straight line between two dots. The coarse pass throws out the
  // pairs that face each other across a bay, which is most of what is thrown
  // out; the fine pass then walks the surface at GRADE_STEP and refuses a road
  // the grading cannot make walkable, because a road is only smoother than the
  // ground beside it if it was laid where the ground would let it be.
  let usable = true;
  for (let i = 0; i < n && usable; i++) {
    if (wetAnchor[i]) continue;                        // a ford, not the sea
    const s = roadSurface(ground[i], prof[i], wAnchor[i]);
    if (s < dry || s > ceiling) usable = false;
  }
  if (usable) {
    const m = Math.max(2, Math.round(total / GRADE_STEP));
    const step = total / m;
    let prev = a.y;
    for (let i = 1; i <= m && usable; i++) {
      const t = i / m;
      const [x, z] = pointAlong(segs, total, t);
      const g = groundUnder(field, x, z);
      const rv = G.river;
      const s = roadSurface(g, roadHeightAt(road, t), roadWeight());
      // a ford is the river's bank, not the road's grade: the crossing is not
      // judged, and neither is the step back out of it onto dry ground
      if (rv > 0) { prev = null; continue; }
      if (s < dry || s > ceiling) usable = false;
      else if (prev !== null && Math.abs(s - prev) / step > ROAD_GRADE) usable = false;
      prev = s;
    }
  }
  road.usable = usable;
  st.pair.set(key, road);
  return road;
}

/** The up to ROAD_LINKS nearest usable neighbours in the 8 cells around a cell. */
export function linksForCell(field, cx, cz) {
  if (field.sculpt) return NO_ROADS;
  const st = stateOf(field), key = cx + ',' + cz;
  const had = st.links.get(key);
  if (had) return had;
  const a = field.siteInCell(cx, cz);
  const out = [];
  st.links.set(key, out);
  if (isSettlement(a)) {
    const cand = [];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dz === 0) continue;
      const b = field.siteInCell(cx + dx, cz + dz);
      if (isSettlement(b)) cand.push(b);
    }
    // nearest first; ties broken by id so the answer never depends on scan
    // order. Sorting before asking whether a road would work matters: laying a
    // road out costs a few hundred terrain samples, and a settlement with four
    // neighbours only ever needs the two nearest that hold up.
    cand.sort((m, o) => {
      const dm = (m.x - a.x) ** 2 + (m.z - a.z) ** 2;
      const doo = (o.x - a.x) ** 2 + (o.z - a.z) ** 2;
      return dm !== doo ? dm - doo : (m.id < o.id ? -1 : 1);
    });
    for (let i = 0; i < cand.length && out.length < ROAD_LINKS; i++) {
      if (roadFor(field, a, cand[i]).usable) out.push(cand[i]);
    }
  }
  return out;
}

/**
 * The roads owned by cell (cx, cz): one per settlement pair where this cell's
 * site has the lexically smaller id and either end picked the other.
 */
export function roadsForCell(field, cx, cz) {
  if (field.sculpt) return NO_ROADS;
  const st = stateOf(field), key = cx + ',' + cz;
  const had = st.owned.get(key);
  if (had) return had;
  const a = field.siteInCell(cx, cz);
  const out = [];
  st.owned.set(key, out);
  if (isSettlement(a)) {
    const mine = linksForCell(field, cx, cz);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dz === 0) continue;
      const b = field.siteInCell(cx + dx, cz + dz);
      if (!isSettlement(b) || a.id >= b.id) continue;        // b owns that one
      // whoever picked this pair has already laid it out, so this is a cache
      // hit; asking the other way round would lay out roads nobody wanted
      if (mine.indexOf(b) < 0 && linksForCell(field, cx + dx, cz + dz).indexOf(a) < 0) continue;
      const road = roadFor(field, a, b);
      if (road.usable) out.push(road);
    }
  }
  return out;
}

/**
 * The roads that meet at a settlement, in id order.
 *
 * A road is owned by the cell of its smaller end, and both its ends stand in
 * touching cells, so every road that touches this site is owned by this site's
 * own cell or by one of the eight around it. That is the whole search.
 *
 * `wayside.js` asks this to know a junction from a road's end: a settlement
 * with two roads is a fork and gets the sign with two fingers on it, and the
 * settlement that owns a piece of furniture is the one whose smallest road id
 * claims it, so a fork's signpost is built once and not once per road.
 */
export function roadsAtSite(field, site) {
  if (!isSettlement(site)) return [];
  const out = [];
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    for (const r of roadsForCell(field, site.cx + dx, site.cz + dz)) {
      if (r.a.id === site.id || r.b.id === site.id) out.push(r);
    }
  }
  out.sort((m, o) => (m.id < o.id ? -1 : m.id > o.id ? 1 : 0));
  return out;
}

/**
 * Every road whose reach overlaps the rectangle (x0, z0) to (x1, z1), in id
 * order, each one once.
 *
 * `roadsNearCell` answers the same question for a whole site cell and is what
 * `roadDistanceAt` uses; a chunk is 64 m and may straddle a cell border, so a
 * caller streaming chunks needs the rectangle and not the cell. The scan is the
 * cells the rectangle touches and the ring around them, which is exact because
 * a road never bends outside its owner cell and the eight around it
 * (`roads.test.mjs` measures that).
 */
export function roadsOverlapping(field, x0, z0, x1, z1) {
  const c0 = Math.floor(x0 / SITE_CELL) - 1, c1 = Math.floor(x1 / SITE_CELL) + 1;
  const d0 = Math.floor(z0 / SITE_CELL) - 1, d1 = Math.floor(z1 / SITE_CELL) + 1;
  const seen = new Set(), out = [];
  for (let cz = d0; cz <= d1; cz++) for (let cx = c0; cx <= c1; cx++) {
    for (const r of roadsForCell(field, cx, cz)) {
      if (r.maxX < x0 || r.minX > x1 || r.maxZ < z0 || r.minZ > z1) continue;
      if (seen.has(r.id)) continue;
      seen.add(r.id); out.push(r);
    }
  }
  out.sort((m, o) => (m.id < o.id ? -1 : m.id > o.id ? 1 : 0));
  return out;
}

/**
 * The world point and the unit normal at arc-length fraction t along a road.
 *
 * Everything that stands beside a road is placed from this: a lamp post is the
 * point plus the normal times the verge, and the two verges are the two signs
 * of that one number. It is here rather than in wayside.js because the segment
 * list is this file's own shape and nothing outside it should have to walk one.
 */
export function roadPointAt(road, t) {
  const want = (t < 0 ? 0 : t > 1 ? 1 : t) * road.total;
  const segs = road.segs;
  let s = segs[segs.length - 1], u = 1;
  for (let i = 0; i < segs.length; i++) {
    const q = segs[i];
    if (want <= q.cum + q.len || i === segs.length - 1) {
      s = q; u = want <= q.cum ? 0 : Math.min(1, (want - q.cum) / q.len);
      break;
    }
  }
  const dx = s.dx / s.len, dz = s.dz / s.len;
  return { x: s.x0 + s.dx * u, z: s.z0 + s.dz * u, dx, dz, nx: -dz, nz: dx };
}

/**
 * Every road that reaches into cell (cx, cz). A road runs between settlements
 * in touching cells and never swings more than BEND_MAX aside, so it can only
 * be owned by this cell or one of the eight around it.
 */
function roadsNearCell(field, cx, cz) {
  const st = stateOf(field), key = cx + ',' + cz;
  const had = st.near.get(key);
  if (had) return had;
  const x0 = cx * SITE_CELL, x1 = x0 + SITE_CELL;
  const z0 = cz * SITE_CELL, z1 = z0 + SITE_CELL;
  const out = [];
  st.near.set(key, out);
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    for (const r of roadsForCell(field, cx + dx, cz + dz)) {
      if (r.maxX < x0 || r.minX > x1 || r.maxZ < z0 || r.minZ > z1) continue;
      out.push(r);
    }
  }
  return out;
}

/**
 * The nearest road to (x, z) within ROAD_REACH: `d` metres from its centreline
 * and `t` the fraction along it, or null where no road runs.
 */
export function roadDistanceAt(field, x, z) {
  const st = stateOf(field);
  const cx = Math.floor(x / SITE_CELL), cz = Math.floor(z / SITE_CELL);
  const key = cx + ',' + cz;
  let list;
  if (key === st.lastKey) list = st.lastList;
  else { list = roadsNearCell(field, cx, cz); st.lastKey = key; st.lastList = list; }
  if (list.length === 0) return null;
  let best = null, bd2 = ROAD_REACH * ROAD_REACH, bt = 0;
  for (let i = 0; i < list.length; i++) {
    const r = list[i];
    if (x < r.minX || x > r.maxX || z < r.minZ || z > r.maxZ) continue;
    const segs = r.segs;
    for (let j = 0; j < segs.length; j++) {
      const s = segs[j];
      let u = ((x - s.x0) * s.dx + (z - s.z0) * s.dz) / s.len2;
      if (u < 0) u = 0; else if (u > 1) u = 1;
      const ex = s.x0 + s.dx * u - x, ez = s.z0 + s.dz * u - z;
      const d2 = ex * ex + ez * ez;
      if (d2 < bd2) { bd2 = d2; best = r; bt = (s.cum + u * s.len) / r.total; }
    }
  }
  return best ? { d: Math.sqrt(bd2), t: bt, road: best } : null;
}

/** How much road is under a point d metres off it: 1 on the centreline, 0 at the verge. */
export const roadStrength = (d) => 1 - smoothstep(ROAD_HALF_WIDTH * 0.4, ROAD_HALF_WIDTH, d);
