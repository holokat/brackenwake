// The Starting Island: a small world where everything the game does can be met
// in an hour, laid by script so it can be argued with and laid again.
//
//   node scripts/sculpt-island.mjs
//
// Writes public/terrain/island.json (the terrain, header `world: 'island'`)
// and src/mmo/spaces/island_*.json, and prints what it measured. The island
// is about 1.2 km across in a sea: a walled town on a south facing bay, three
// wheat fields and a pasture behind it, a chalk hill in the north with a mine
// cut into its face and a second working on its east shoulder, a wood in the
// west with a bandit camp in it, a headland of standing graves in the east
// where the skeletons walk, and the door to Oram Blackhand's cellars at the
// hill's foot. Lanes join them. The header asks for the wild back, so the
// meadow habitat rolls packs across the open country by day and by night.
//
// WHAT IS REUSED. The plans in src/mmo/plans (hearthhome, greenwoldpits,
// highwaymanshollow, oldcellars) are laid as spaces, turned and moved; the
// terrain kinds, the paint words and the species are the game's own. Nothing
// here is a new system except the header flags the world switch reads.
//
// THE SEA. The base is a seabed at -6 m with no coast of its own (`sea:
// false`, so the generated continent does not leak in), and one `sea` stroke
// lays the surface at 0 over everything the eye can reach. The island is a
// plateau grid raised to its shore line, with mountains, ridges and noise on
// top, so it is never flat and never the same twice across.

import { readFileSync, unlinkSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTerrainEdits, SEA_MAX_R } from '../src/world/terrain_edits.js';
import { createWorldField } from '../src/world/field.js';
import { auditSpaces, rectOf, rectsOverlap } from '../src/mmo/plans/plan_schema.js';
import { saveEditorFile, writeSpaceIndex, spaceIdsOnDisk } from '../tools/editor_save.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PLAN_DIR = join(ROOT, 'src/mmo/plans');
const SPACE_DIR = join(ROOT, 'src/mmo/spaces');
const SEED = 20260908;
const WORLD = 'island';
const TERRAIN_PATH = 'public/terrain/island.json';

// ------------------------------------------------------------------ helpers
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(SEED);
const rand = (lo, hi) => lo + rng() * (hi - lo);
function hash2(ix, iz, s) {
  let h = Math.imul(ix | 0, 374761393) ^ Math.imul(iz | 0, 668265263) ^ Math.imul(s | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, z, wave, s) {
  const fx = x / wave, fz = z / wave;
  const ix = Math.floor(fx), iz = Math.floor(fz);
  const tx = fx - ix, tz = fz - iz;
  const sx = tx * tx * (3 - 2 * tx), sz = tz * tz * (3 - 2 * tz);
  const a = hash2(ix, iz, s), b = hash2(ix + 1, iz, s), c = hash2(ix, iz + 1, s), d = hash2(ix + 1, iz + 1, s);
  return (a + (b - a) * sx) * (1 - sz) + (c + (d - c) * sx) * sz;
}
const r2 = (v) => Math.round(v * 100) / 100;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (e0, e1, v) => { const t = clamp01((v - e0) / (e1 - e0 || 1e-9)); return t * t * (3 - 2 * t); };
const norm360 = (d) => ((d % 360) + 360) % 360;
const lerp = (a, b, t) => a + (b - a) * t;
const D2R = Math.PI / 180;
function rotBy(deg) {
  const a = deg * D2R, c = Math.cos(a), s = Math.sin(a);
  return (x, z) => ({ x: r2(x * c + z * s), z: r2(z * c - x * s) });
}
const polyLength = (pts) => { let n = 0; for (let i = 0; i + 1 < pts.length; i++) n += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); return n; };
function polyAt(pts, s) {
  let run = 0;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const seg = Math.hypot(bx - ax, bz - az);
    if (run + seg >= s || i + 2 === pts.length) {
      const t = seg > 1e-9 ? clamp01((s - run) / seg) : 0;
      const L = seg || 1;
      return { x: ax + (bx - ax) * t, z: az + (bz - az) * t, tx: (bx - ax) / L, tz: (bz - az) / L, s };
    }
    run += seg;
  }
  const [x, z] = pts[pts.length - 1];
  return { x, z, tx: 1, tz: 0, s };
}
function polyDist(pts, x, z) {
  let best = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz;
    const t = len2 > 1e-12 ? clamp01(((x - ax) * dx + (z - az) * dz) / len2) : 0;
    best = Math.min(best, Math.hypot(ax + dx * t - x, az + dz * t - z));
  }
  return best;
}
/** Every vertex of a polyline and no gap longer than `step` between them. */
function samples(pts, step) {
  const out = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const parts = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / step));
    for (let k = 0; k < parts; k++) out.push({ x: ax + (bx - ax) * (k / parts), z: az + (bz - az) * (k / parts) });
  }
  const last = pts[pts.length - 1];
  out.push({ x: last[0], z: last[1] });
  return out;
}
function inPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

// ------------------------------------------------------------- the ground
// grass to the shore, and the beach line paints the sand under 1.5 m by itself
const BASE = { height: -6, ground: 'grass', snowLine: 180, beachLine: 1.5, sea: false, places: false, world: WORLD, wild: true, open: { x: 0, z: 0, r: 700 } };
const field = createWorldField(SEED, { homeBiome: 'meadow', homeY: -0.3 });
const EDITS = createTerrainEdits({ mode: 'sculpt', base: BASE, baseHeight: (x, z) => field.heightAt(x, z) });
field.setTerrainEdits(EDITS);
const stroke = (s) => EDITS.stroke(s);
const heightAt = (x, z) => field.heightAt(x, z);
const sampleAt = (x, z) => field.sampleAt(x, z);

// The shoreline: a radius by bearing, 560 m with a slow wobble, pulled in on
// the south for the bay and pushed out on the east for the headland.
function shoreR(a) {
  const wob = (vnoise(Math.cos(a) * 300 + 700, Math.sin(a) * 300 + 700, 140, 5) - 0.5) * 140;
  const south = ((norm360(a / D2R) + 180) % 360) - 180;                           // degrees off due south (+z is bearing 0)
  const bay = -150 * Math.exp(-Math.pow(south / 40, 2));                          // the bay the town faces
  const head = 110 * Math.exp(-Math.pow((norm360(a / D2R) - 80) / 22, 2));      // the east headland
  return 560 + wob + bay + head;
}
const bearingOf = (x, z) => Math.atan2(x, z);                                    // 0 is +z (south), 90 deg is +x (east)
const insideShore = (x, z, margin = 0) => Math.hypot(x, z) < shoreR(bearingOf(x, z)) - margin;

// 1. the land: a grid of plateaus to the shore line, the height rising inland
const SHORE_H = 3.0;
let nLand = 0;
for (let gz = -760; gz <= 760; gz += 40) {
  for (let gx = -760; gx <= 760; gx += 40) {
    const d = Math.hypot(gx, gz), R = shoreR(bearingOf(gx, gz));
    if (d > R + 30) continue;
    const t = clamp01((R - d) / R);                        // 0 at the shore, 1 at the middle
    const h = d > R - 26 ? lerp(-1.5, SHORE_H, clamp01((R - d + 26) / 52)) : SHORE_H + 9 * Math.pow(t, 1.3) + (vnoise(gx, gz, 170, 9) - 0.5) * 4;
    stroke({ kind: 'plateau', x: gx, z: gz, r: 44, height: r2(h), skirt: 0.35 });
    nLand++;
  }
}
// 2. the hills
const HILL = { x: -40, z: -300 };                           // the chalk hill, the mine in its south face
stroke({ kind: 'mountain', ...HILL, r: 250, amount: 52, roughness: 0.7 });
stroke({ kind: 'mountain', x: 120, z: -380, r: 160, amount: 26, roughness: 0.6 });
stroke({ kind: 'ridge', x: 360, z: -120, r: 110, amount: 18, yaw: 0.35, length: 260 });   // the headland's spine
stroke({ kind: 'mountain', x: -330, z: 60, r: 200, amount: 16, roughness: 0.5 });        // the wood's knoll
stroke({ kind: 'raise', x: 40, z: 260, r: 170, amount: 3, hardness: 0.3 });              // the town's gentle rise off the bay
// 3. the roughening, so no field is a table
for (const [x, z] of [[-200, -100], [200, 0], [0, 100], [-100, 300], [250, 250], [-350, -200], [300, -300]]) {
  stroke({ kind: 'noise', x, z, r: 220, amount: 1.8, wave: 70 });
}
// 4. the sea: one surface at 0 over everything, and a drain under the island's
// middle so a hollow inland never fills with sea
stroke({ kind: 'sea', x: 0, z: 0, r: SEA_MAX_R, level: 0 });
// 5. the flats the places stand on
const TOWN = { x: 40, z: 300, deg: 180 };                 // the gate and the bridge face south, to the bay
const MINE = { x: -40, z: -140 };                          // the yard at the hill's south foot
const MINE2 = { x: 190, z: -320 };                         // the east shoulder working, on the second hill's flank
const CAMP = { x: -330, z: 40 };                           // the bandit camp in the wood
const BARROW = { x: 400, z: -60 };                         // the graves on the headland
const CELLARS = { x: 120, z: -110 };                       // the door at the hill's east foot
stroke({ kind: 'flatten', x: TOWN.x, z: TOWN.z, r: 100 });
stroke({ kind: 'pit', x: MINE.x, z: MINE.z, r: 60, amount: 8 });
stroke({ kind: 'cliff', x: MINE.x, z: MINE.z - 40, r: 50, amount: 16, yaw: Math.PI });
stroke({ kind: 'flatten', x: MINE2.x, z: MINE2.z, r: 40 });
stroke({ kind: 'cliff', x: MINE2.x, z: MINE2.z - 30, r: 34, amount: 9, yaw: Math.PI });
stroke({ kind: 'pit', x: CAMP.x, z: CAMP.z, r: 46, amount: 4 });
stroke({ kind: 'flatten', x: BARROW.x, z: BARROW.z, r: 50 });
stroke({ kind: 'raise', x: BARROW.x, z: BARROW.z, r: 18, amount: 3 });   // the barrow itself
stroke({ kind: 'flatten', x: CELLARS.x, z: CELLARS.z, r: 36 });
// a pond in the pasture and a tarn under the hill
const POND = { x: 250, z: 150 };
stroke({ kind: 'pit', x: POND.x, z: POND.z, r: 34, amount: 2.5 });
stroke({ kind: 'pond', x: POND.x, z: POND.z, r: 22, level: r2(heightAt(POND.x, POND.z) - 0.4), depth: 2 });
const TARN = { x: -200, z: -160 };
stroke({ kind: 'pit', x: TARN.x, z: TARN.z, r: 48, amount: 3 });
stroke({ kind: 'lake', x: TARN.x, z: TARN.z, r: 34, level: r2(heightAt(TARN.x, TARN.z) - 0.5), depth: 3 });

// ------------------------------------------------------------- the fields
const FIELDS = [
  { id: 'eastfield', name: 'The East Field', x: 210, z: 300, halfW: 70, halfD: 55, deg: 8, wheat: true },
  { id: 'westfield', name: 'The West Field', x: -130, z: 270, halfW: 75, halfD: 55, deg: 352, wheat: true },
  { id: 'hillfield', name: 'The Hill Field', x: 40, z: 120, halfW: 65, halfD: 50, deg: 4, wheat: true },
  { id: 'pasture', name: 'The Pasture', x: 230, z: 100, halfW: 60, halfD: 55, deg: 0, wheat: false },
];
for (const f of FIELDS) {
  const rot = rotBy(f.deg);
  f.quad = [[-f.halfW, -f.halfD], [f.halfW, -f.halfD], [f.halfW, f.halfD], [-f.halfW, f.halfD]].map(([x, z]) => { const q = rot(x, z); return [r2(f.x + q.x), r2(f.z + q.z)]; });
  f.radius = Math.round(Math.hypot(f.halfW, f.halfD) + 6);
}
const inAnyField = (x, z) => FIELDS.some((f) => inPoly(x, z, f.quad));

// -------------------------------------------------------------- the lanes
const LANES = [
  { id: 'lane_mine', word: 'path', width: 4, pts: [[TOWN.x - 30, TOWN.z - 70], [20, 120], [-10, 0], [MINE.x + 10, MINE.z + 70]] },
  { id: 'lane_cellars', word: 'path', width: 3, pts: [[-10, 0], [60, -60], [CELLARS.x - 20, CELLARS.z + 30]] },
  { id: 'lane_wood', word: 'path', width: 3, pts: [[TOWN.x - 70, TOWN.z - 30], [-120, 160], [-230, 110], [CAMP.x + 40, CAMP.z + 30]] },
  { id: 'lane_head', word: 'path', width: 3, pts: [[TOWN.x + 60, TOWN.z - 50], [200, 30], [300, -20], [BARROW.x - 40, BARROW.z + 20]] },
  { id: 'lane_mine2', word: 'path', width: 3, pts: [[300, -20], [250, -160], [MINE2.x + 10, MINE2.z + 50]] },
  { id: 'quay', word: 'cobble', width: 5, pts: [[TOWN.x, TOWN.z + 70], [TOWN.x, TOWN.z + 135]] },
];
const laneNear = (x, z) => Math.min(...LANES.map((l) => polyDist(l.pts, x, z)));

// -------------------------------------------------------------- the paint
let nPaint = 0;
const paint = (word, x, z, r, opts = {}) => { stroke({ kind: 'ground', word, x: r2(x), z: r2(z), r, hardness: opts.hardness ?? 1, opacity: opts.opacity ?? 1 }); nPaint++; };
for (const f of FIELDS) {
  if (!f.wheat) continue;
  const rot = rotBy(f.deg);
  const iw = f.halfW - 10, id = f.halfD - 10;
  const nx = Math.max(1, Math.round(iw * 2 / 40)), nz = Math.max(1, Math.round(id * 2 / 40));
  for (let iz = 0; iz <= nz; iz++) for (let ix = 0; ix <= nx; ix++) { const q = rot(-iw + (ix / nx) * 2 * iw, -id + (iz / nz) * 2 * id); paint('dirt', f.x + q.x, f.z + q.z, 30, { hardness: 0.75, opacity: 0.9 }); }
}
// the chalk: the hill's face and the mine yards
for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; paint('rock', MINE.x + Math.sin(a) * 40, MINE.z - 30 + Math.cos(a) * 20, 22, { hardness: 0.5, opacity: 0.95 }); }
for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; paint('sand', MINE.x + Math.sin(a) * 28, MINE.z + 8 + Math.cos(a) * 16, 20, { hardness: 0.5, opacity: 0.85 }); }
paint('gravel', MINE.x, MINE.z + 30, 24, { hardness: 0.5, opacity: 0.8 });
for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; paint('rock', MINE2.x + Math.sin(a) * 24, MINE2.z - 20 + Math.cos(a) * 12, 16, { hardness: 0.5, opacity: 0.9 }); }
paint('gravel', MINE2.x, MINE2.z + 10, 18, { hardness: 0.5, opacity: 0.8 });
for (const p of samples([[HILL.x - 120, HILL.z + 20], [HILL.x - 40, HILL.z - 40], [HILL.x + 60, HILL.z - 60], [HILL.x + 150, HILL.z - 20]], 30)) {
  paint('sand', p.x + rand(-8, 8), p.z + rand(-8, 8), 22, { hardness: 0.35, opacity: 0.5 });
  if (rng() < 0.5) paint('rock', p.x + rand(-12, 12), p.z + rand(-12, 12), 12, { hardness: 0.5, opacity: 0.7 });
}
paint('dirt', CAMP.x, CAMP.z, 26, { hardness: 0.5, opacity: 0.9 });
for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; paint('rock', BARROW.x + Math.sin(a) * 26, BARROW.z + Math.cos(a) * 26, 10, { hardness: 0.6, opacity: 0.6 }); }
// The town's lanes are the terrain's, not flat brown meshes: the plan's `lane`
// areas are painted into the ground as dragged path strokes and taken off the
// space, so Haven's lanes read like every other lane on the island ("no idea
// what these are in the center of the city").
const townLanes = [];
{
  const p = JSON.parse(readFileSync(join(PLAN_DIR, 'hearthhome.json'), 'utf8'));
  const R = rotBy(TOWN.deg);
  for (const a of p.areas || []) {
    if (a.kind !== 'lane') continue;
    townLanes.push({ id: 'town_lane', word: 'path', width: Math.min(3, a.w || 3), pts: a.points.map(([x, z]) => { const q = R(x, z); return [r2(TOWN.x + q.x), r2(TOWN.z + q.z)]; }) });
  }
}
// the lanes, dragged
for (const l of [...LANES, ...townLanes]) {
  const brushR = r2(l.width / 2 + 0.4);
  const pts = samples(l.pts, 40);
  for (let i = 0; i + 1 < pts.length; i++) { stroke({ kind: 'ground', word: l.word, x: r2(pts[i].x), z: r2(pts[i].z), x2: r2(pts[i + 1].x), z2: r2(pts[i + 1].z), r: brushR, hardness: 1, opacity: 1 }); nPaint++; }
}
const TERRAIN = EDITS.serialize();

// ------------------------------------------------------------- the spaces
const SPACES = {};
function space(id, name, at, radius, note, extra = {}) {
  const s = { id, name, note, at: { x: r2(at.x), z: r2(at.z) }, radius, pieces: [], runs: [], areas: [], people: [], spawns: [], trees: [], rocks: [], markers: [], ...extra };
  SPACES[id] = s;
  return s;
}
const rel = (s, x, z) => ({ x: r2(x - s.at.x), z: r2(z - s.at.z) });
const addPiece = (s, model, x, z, yaw = 0, extra = {}) => { s.pieces.push({ model, ...rel(s, x, z), yaw: r2(norm360(yaw)), ...extra }); };
function addPieceClear(s, model, x, z, yaw = 0) {
  for (const step of [0, 5, 9, 14, 20]) {
    for (let i = 0; i < (step ? 12 : 1); i++) {
      const a = (i / 12) * Math.PI * 2;
      const at = rel(s, x + Math.sin(a) * step, z + Math.cos(a) * step);
      if (Math.hypot(at.x, at.z) > s.radius - 3) continue;
      const want = rectOf({ model, x: at.x, z: at.z, yaw });
      if (!want) return null;
      if (s.pieces.some((q) => rectsOverlap(want, rectOf(q)))) continue;
      s.pieces.push({ model, x: at.x, z: at.z, yaw: r2(norm360(yaw)) });
      return at;
    }
  }
  return null;
}
const addRock = (s, kind, x, z, yaw = 0, scale = 1) => { s.rocks.push({ kind, ...rel(s, x, z), yaw: r2(norm360(yaw)), scale: r2(scale) }); };
const addTree = (s, species, x, z, yaw, scale) => { s.trees.push({ species, ...rel(s, x, z), yaw: r2(norm360(yaw)), scale: r2(scale) }); };
const addMarker = (s, label, note, kind, x, z) => { s.markers.push({ ...rel(s, x, z), label, note, kind }); };
const addSpawn = (s, id, x, z, night = false) => { const row = { id, ...rel(s, x, z) }; if (night) row.night = true; s.spawns.push(row); };
const addPerson = (s, role, x, z, yaw) => { s.people.push({ name: null, role, ...rel(s, x, z), yaw: r2(norm360(yaw)) }); };
const planOf = (id) => JSON.parse(readFileSync(join(PLAN_DIR, id + '.json'), 'utf8'));
function fromPlan(planId, id, name, at, deg = 0, radius = null, extra = {}) {
  const p = planOf(planId);
  const R = rotBy(deg);
  const s = space(id, name, at, radius || p.radius, p.notes, extra);
  s.pieces = (p.pieces || []).map((q) => ({ ...q, ...R(q.x, q.z), yaw: r2(norm360((q.yaw || 0) + deg)) }));
  s.runs = (p.runs || []).map((r) => ({ ...r, from: R(r.from.x, r.from.z), to: R(r.to.x, r.to.z) }));
  s.areas = (p.areas || []).map((a) => ({ ...a, points: a.points.map(([x, z]) => { const q = R(x, z); return [q.x, q.z]; }) }));
  s.people = (p.people || []).map((q) => ({ ...q, name: null, ...R(q.x, q.z), yaw: r2(norm360((q.yaw || 0) + deg)) }));
  s.spawns = (p.spawns || []).map((q) => ({ ...q, ...R(q.x, q.z) }));
  if (p.arrival) s.arrival = { ...R(p.arrival.x, p.arrival.z), yaw: r2(norm360((p.arrival.yaw || 0) + deg)) };
  return s;
}
const CAST = { bram: 'Bram Haywood', wynn: 'Old Wynn Ashby', pip: 'Pip', nan: 'Nan Ockley', cobb: 'Cobb Ashby', alys: 'Alys Fenn', ivy: 'Ivy Weir', vane: 'Captain Serle Vane', millersson: 'The Miller\'s Son', sexton: 'The Skeleton Sexton' };
function castMarkers(s, planId, deg = 0) {
  const R = rotBy(deg);
  for (const q of planOf(planId).people || []) {
    if (!q.name || !CAST[q.name]) continue;
    const at = R(q.x, q.z);
    s.markers.push({ x: at.x, z: at.z, label: CAST[q.name], kind: 'other', note: `the plan stands ${CAST[q.name]} here; a space may not name one of the story's cast, so the role alone is stood and this says who it is meant to be.` });
  }
}
const WET_ON_PURPOSE = new Set(['stone_bridge_10m', 'footbridge', 'stepping_stones', 'eel_weir', 'mill_wheel', 'rowing_boat_rotten', 'lily_pad_patch', 'willow', 'headstone_a', 'headstone_b', 'headstone_c', 'headstone_d', 'headstone_e']);
const WET_ROCKS = new Set(['reed_bed', 'dew_pond']);
function dryOff(s) {
  const moved = [], gone = [];
  const wet = (x, z) => sampleAt(s.at.x + x, s.at.z + z).water;
  const walk = (q, allow) => {
    if (allow.has(q.model || q.kind) || !wet(q.x, q.z)) return true;
    for (const step of [5, 10, 15, 20, 25]) for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2, x = r2(q.x + Math.sin(a) * step), z = r2(q.z + Math.cos(a) * step);
      if (Math.hypot(x, z) > s.radius - 3 || wet(x, z)) continue;
      moved.push(`${q.model || q.kind || q.species} ${step} m`); q.x = x; q.z = z; return true;
    }
    gone.push(q.model || q.kind || q.species); return false;
  };
  s.pieces = s.pieces.filter((q) => { if (WET_ON_PURPOSE.has(q.model) || !wet(q.x, q.z)) return true; gone.push(q.model); return false; });
  s.rocks = s.rocks.filter((q) => walk(q, WET_ROCKS));
  s.trees = s.trees.filter((q) => walk(q, new Set(['willow'])));
  for (const list of ['pieces', 'rocks', 'trees', 'spawns', 'people', 'markers']) {
    const before = (s[list] || []).length;
    s[list] = (s[list] || []).filter((q) => Math.hypot(q.x, q.z) <= s.radius - 1);
    for (let i = before; i > s[list].length; i--) gone.push(`${list.slice(0, -1)} beyond ${s.radius} m`);
  }
  return { moved, gone };
}

// ---- the town: Hearthhome's plan, its gate to the bay
const TOWNSPACE = fromPlan('hearthhome', 'island_town', 'Haven', TOWN, TOWN.deg, 76);
TOWNSPACE.areas = TOWNSPACE.areas.filter((a) => a.kind !== 'lane');   // the lanes are paint now, see above
castMarkers(TOWNSPACE, 'hearthhome', TOWN.deg);
TOWNSPACE.note = 'The one town on the island: a flint wall, a green with a well, the inn, the smith, the healer, the chapel and the manor, and the quay at the gate where the boats come in. Nothing hunts here.';
addMarker(TOWNSPACE, 'the green', 'nothing hunts here, and the well is the middle of everything', 'other', TOWN.x + 5, TOWN.z + 5);
addPiece(TOWNSPACE, 'waystone_village', TOWN.x - 30, TOWN.z + 20, 90);
addPiece(TOWNSPACE, 'offerings', TOWN.x - 28, TOWN.z + 22, 0);
// the quay: a jetty out into the bay, boats at it
const QUAY = space('island_quay', 'The Quay', { x: TOWN.x, z: TOWN.z + 145 }, 56, 'The jetty the island lives by: two boats, nets, barrels, and the water under the planks. The boats do not sail; the sea is the edge of the world for now.');
addPiece(QUAY, 'footbridge', TOWN.x, TOWN.z + 152, 90, { scale: 3.5 });   // the jetty, 28 m, its end in the water
addPiece(QUAY, 'rowing_boat_rotten', TOWN.x + 18, TOWN.z + 168, 20);
addPiece(QUAY, 'barrel', TOWN.x - 6, TOWN.z + 128, 0);
addPiece(QUAY, 'barrel', TOWN.x - 7.5, TOWN.z + 129.5, 30);
addPiece(QUAY, 'crate', TOWN.x + 6, TOWN.z + 130, 10);
addRock(QUAY, 'reed_bed', TOWN.x - 30, TOWN.z + 148, 0, 1.2);
addRock(QUAY, 'reed_bed', TOWN.x + 34, TOWN.z + 146, 40, 1.1);
addSpawn(QUAY, 'goose', TOWN.x - 20, TOWN.z + 134);
addSpawn(QUAY, 'goose', TOWN.x - 24, TOWN.z + 130);
addMarker(QUAY, 'the fishing spot', 'the slack water off the end of the jetty', 'other', TOWN.x + 4, TOWN.z + 166);

// ---- the mine: the Chalk Pits' plan in the hill's face, and the second working
const PITS = fromPlan('greenwoldpits', 'island_mine', 'The Chalk Cut', MINE, 0, 44);
addMarker(PITS, 'the copper seam', 'the green seam in the chalk, and the first ore', 'other', MINE.x - 18, MINE.z - 14);
addMarker(PITS, 'the tin seam', 'the grey seam under the copper', 'other', MINE.x + 14, MINE.z - 14);
addSpawn(PITS, 'giantRat', MINE.x - 16, MINE.z + 6);
addSpawn(PITS, 'giantRat', MINE.x - 20, MINE.z + 10);
addSpawn(PITS, 'thornGrub', MINE.x + 18, MINE.z + 4);
addSpawn(PITS, 'wildDog', MINE.x + 2, MINE.z + 22);
addSpawn(PITS, 'skeleton', MINE.x + 12, MINE.z + 22, true);
addSpawn(PITS, 'skeleton', MINE.x + 16, MINE.z + 26, true);
addSpawn(PITS, 'giantSpider', MINE.x - 14, MINE.z + 18, true);
const MINE2SPACE = space('island_mine_east', 'The Shoulder Working', MINE2, 40, 'A second, smaller cut on the hill\'s east shoulder: one mouth, a cart, a spoil heap and a hut. The foreman moved his men here when the rats took the lower yard.');
addPiece(MINE2SPACE, 'mine_mouth', MINE2.x, MINE2.z - 14, 0);
addPiece(MINE2SPACE, 'ore_cart', MINE2.x + 8, MINE2.z - 4, 20);
addPiece(MINE2SPACE, 'spoil_heap', MINE2.x + 16, MINE2.z + 8, 0);
addPiece(MINE2SPACE, 'foremans_hut', MINE2.x - 16, MINE2.z + 8, 160);
addPiece(MINE2SPACE, 'barrow', MINE2.x - 6, MINE2.z + 4, 70);
addPiece(MINE2SPACE, 'lamp_post_iron', MINE2.x + 4, MINE2.z - 8, 0);
MINE2SPACE.runs.push({ model: 'rail_2m', from: rel(MINE2SPACE, MINE2.x, MINE2.z - 12), to: rel(MINE2SPACE, MINE2.x + 8, MINE2.z - 2) });
addPerson(MINE2SPACE, 'provisioner', MINE2.x - 10, MINE2.z + 2, 20);   // the foreman, who sells picks
addMarker(MINE2SPACE, 'the copper seam', 'copper in the shoulder, and the pick to get it', 'other', MINE2.x + 2, MINE2.z - 18);
addSpawn(MINE2SPACE, 'giantRat', MINE2.x + 14, MINE2.z + 18);
addSpawn(MINE2SPACE, 'thornGrub', MINE2.x - 14, MINE2.z - 6);
addSpawn(MINE2SPACE, 'skeleton', MINE2.x + 8, MINE2.z + 20, true);

// ---- the bandit camp in the wood
const HOLLOW = fromPlan('highwaymanshollow', 'island_bandit_camp', 'The Cutthroats\' Camp', CAMP, 0);
castMarkers(HOLLOW, 'highwaymanshollow', 0);
HOLLOW.note = 'The bandits\' camp under the wood\'s knoll: tents and a fire, a lookout in an oak over the lane, a palisade on the town side. They rob the lane to the mine and they are the first fight worth the name.';
addMarker(HOLLOW, 'the map on the table', 'it marks the barrow on the headland', 'prop', CAMP.x + 9, CAMP.z - 5);
addSpawn(HOLLOW, 'bandit', CAMP.x - 12, CAMP.z + 10);
addSpawn(HOLLOW, 'bandit', CAMP.x - 8, CAMP.z + 14);
addSpawn(HOLLOW, 'banditArcher', CAMP.x - 10, CAMP.z - 8);
addSpawn(HOLLOW, 'highwayman', CAMP.x + 5, CAMP.z - 9);
addSpawn(HOLLOW, 'goblinScout', CAMP.x - 2, CAMP.z + 8, true);
addSpawn(HOLLOW, 'raider', CAMP.x + 12, CAMP.z + 12, true);

// ---- the barrow: standing graves on the headland, the skeletons' ground
const GRAVES = space('island_barrow', 'The Drowned Kings\' Barrow', BARROW, 52, 'A barrow on the headland ringed with leaning stones and old graves, the sea on three sides. The dead here do not stay down after dark, and by day two of them never went down at all.', { landmark: true });
addPiece(GRAVES, 'waystone_village', BARROW.x, BARROW.z - 2, 180);
for (let i = 0; i < 9; i++) {
  const a = (i / 9) * Math.PI * 2;
  addPiece(GRAVES, 'boundary_stone', BARROW.x + Math.sin(a) * 30, BARROW.z + Math.cos(a) * 30, r2(norm360(a / D2R)));
}
const HEADSTONES = ['headstone_a', 'headstone_b', 'headstone_c', 'headstone_d', 'headstone_e'];
for (let i = 0; i < 14; i++) {
  const a = rand(0, Math.PI * 2), d = rand(8, 24);
  addPiece(GRAVES, HEADSTONES[i % 5], BARROW.x + Math.sin(a) * d, BARROW.z + Math.cos(a) * d, rand(0, 360));
}
addPiece(GRAVES, 'legion_banner', BARROW.x + 20, BARROW.z + 30, 200);
addPiece(GRAVES, 'cart_broken', BARROW.x - 26, BARROW.z + 26, 300);
addMarker(GRAVES, 'the kings under the barrow', 'nine stones, fourteen graves, and something that hums under all of it', 'other', BARROW.x + 3, BARROW.z + 6);
addSpawn(GRAVES, 'skeleton', BARROW.x - 14, BARROW.z + 10);
addSpawn(GRAVES, 'skeleton', BARROW.x - 18, BARROW.z + 6);
addSpawn(GRAVES, 'zombie', BARROW.x + 16, BARROW.z - 12);
addSpawn(GRAVES, 'skeleton', BARROW.x + 10, BARROW.z + 18, true);
addSpawn(GRAVES, 'skeleton', BARROW.x + 14, BARROW.z + 22, true);
addSpawn(GRAVES, 'drowned', BARROW.x + 30, BARROW.z - 20, true);
addSpawn(GRAVES, 'wraith', BARROW.x, BARROW.z + 4, true);

// ---- the door: the Old Cellars' plan, and the dungeon under it
const DOOR = fromPlan('oldcellars', 'island_cellars', 'The Old Cellars', CELLARS, 20, 26, { kind: 'dungeon', dungeon: 'oldcellars' });
DOOR.note = 'A brick arch half sunk in the hill\'s foot with a Legion banner planted crooked over it and a stair going down. The arch is the door to Oram Blackhand\'s cellars, and the island\'s whole dungeon is under it.';
addMarker(DOOR, 'the stair down', 'the arch is enterable and Oram Blackhand is below it', 'structure', CELLARS.x, CELLARS.z + 2);
addSpawn(DOOR, 'banditArcher', CELLARS.x - 10, CELLARS.z - 6);
addSpawn(DOOR, 'goblinWarrior', CELLARS.x + 9, CELLARS.z + 8);
addSpawn(DOOR, 'giantSpider', CELLARS.x + 10, CELLARS.z - 7, true);

// ---- the fields
for (const f of FIELDS) {
  const s = space(`island_${f.id}`, f.name, { x: f.x, z: f.z }, f.radius, f.wheat
    ? 'Wheat inside a thorn hedge, the rows running with the slope, a gate on the lane side and a scarecrow that is only a scarecrow by day.'
    : 'Hedged grass with a fold in the corner and a dew pond, and a stile where the footpath goes over.');
  const q = f.quad;
  // four hedges, and a 6 m gap in the one that faces Haven: a field with no
  // way out was a cell (2026-09-08), and the note had promised a gate
  const hedges = [];
  for (let i = 0; i < 4; i++) hedges.push([q[i], q[(i + 1) % 4]]);
  let gate = 0, gd = Infinity;
  hedges.forEach(([a, b], i) => { const d = Math.hypot((a[0] + b[0]) / 2 - TOWN.x, (a[1] + b[1]) / 2 - TOWN.z); if (d < gd) { gd = d; gate = i; } });
  hedges.forEach(([a, b], i) => {
    if (i !== gate) { s.runs.push({ model: 'hedge_4m', from: rel(s, a[0], a[1]), to: rel(s, b[0], b[1]) }); return; }
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L, mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    s.runs.push({ model: 'hedge_4m', from: rel(s, a[0], a[1]), to: rel(s, mx - ux * 3, mz - uz * 3) });
    s.runs.push({ model: 'hedge_4m', from: rel(s, mx + ux * 3, mz + uz * 3), to: rel(s, b[0], b[1]) });
  });
  s.areas.push({ kind: f.wheat ? 'wheat' : 'bare', points: q.map(([x, z]) => { const p = rel(s, x, z); return [p.x, p.z]; }) });
  const rot = rotBy(f.deg);
  const world = (lx, lz) => { const p = rot(lx, lz); return { x: f.x + p.x, z: f.z + p.z }; };
  if (f.wheat) {
    const iw = f.halfW - 12, id = f.halfD - 12;
    const nx = Math.max(1, Math.round(iw * 2 / 14)), nz = Math.max(1, Math.round(id * 2 / 14));
    for (let iz = 0; iz <= nz; iz++) for (let ix = 0; ix <= nx; ix++) {
      const p = world(-iw + (ix / nx) * 2 * iw + rand(-1.5, 1.5), -id + (iz / nz) * 2 * id + rand(-1.5, 1.5));
      addRock(s, iz % 5 === 0 ? 'furrow' : 'wheat_row', p.x, p.z, f.deg, rand(0.92, 1.08));
    }
    const sc = world(rand(-20, 20), rand(-20, 20));
    addRock(s, 'scarecrow', sc.x, sc.z, rand(0, 360), 1.1);
    addSpawn(s, 'scarecrow', sc.x, sc.z, true);
  } else {
    const fold = world(f.halfW - 30, f.halfD - 30); addRock(s, 'sheep_fold', fold.x, fold.z, f.deg, 1.2);
    const st = world(0, -f.halfD); addRock(s, 'stile', st.x, st.z, f.deg, 1);
    addSpawn(s, 'boar', world(-20, 10).x, world(-20, 10).z);
  }
  const gate = world(f.halfW, 0); addRock(s, 'field_gate', gate.x, gate.z, norm360(f.deg + 90), 1);
  for (let i = 0; i < 4; i++) for (const t of [0.2, 0.55, 0.85]) {
    if (rng() > 0.5) continue;
    const ax = lerp(q[i][0], q[(i + 1) % 4][0], t), az = lerp(q[i][1], q[(i + 1) % 4][1], t);
    const nx = ax - f.x, nz = az - f.z, n = Math.hypot(nx, nz) || 1;
    const tx = ax + (nx / n) * 3.4, tz = az + (nz / n) * 3.4;
    if (Math.hypot(tx - f.x, tz - f.z) > f.radius - 6 || laneNear(tx, tz) < 6) continue;
    addTree(s, 'oak', tx, tz, rand(0, 360), rand(0.85, 1.25));
  }
}

// ---- the wood: a polygon on the knoll, cut into parts, with the camp kept clear
function plantable(x, z) {
  if (!insideShore(x, z, 14)) return false;
  if (laneNear(x, z) < 7) return false;
  if (inAnyField(x, z)) return false;
  // the PLACES keep trees out; the wood's own parts, the copses and the open
  // downs are where the trees go, so they do not count against themselves
  for (const s of Object.values(SPACES)) {
    if (/^island_(wood_|copse_|downs|pond|tarn|bandit_camp)/.test(s.id)) continue;
    if (Math.hypot(x - s.at.x, z - s.at.z) < s.radius + 4) return false;
  }
  if (Math.hypot(x - CAMP.x, z - CAMP.z) < 40) return false;
  if (sampleAt(x, z).water) return false;
  return true;
}
const WOOD = [[-480, -60], [-380, -140], [-260, -100], [-190, 20], [-220, 150], [-320, 220], [-450, 180], [-520, 60]];
const CELL = 200;
let woodTrees = 0, woodCells = 0;
{
  const xs = WOOD.map((p) => p[0]), zs = WOOD.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), z0 = Math.min(...zs), z1 = Math.max(...zs);
  const cols = Math.ceil((x1 - x0) / CELL), rows = Math.ceil((z1 - z0) / CELL);
  const cw = (x1 - x0) / cols, cd = (z1 - z0) / rows;
  const cells = new Map();
  for (let gz = z0; gz <= z1; gz += 12) for (let gx = x0; gx <= x1; gx += 12) {
    const x = gx + rand(-3.6, 3.6), z = gz + rand(-3.6, 3.6);
    if (!inPoly(x, z, WOOD) || !plantable(x, z)) continue;
    const ci = Math.min(cols - 1, Math.floor((x - x0) / cw)), cj = Math.min(rows - 1, Math.floor((z - z0) / cd));
    const key = `${ci}_${cj}`;
    let cell = cells.get(key);
    if (!cell) { woodCells++; cell = { s: space(`island_wood_${woodCells}`, `The Knoll Wood, part ${woodCells}`, { x: r2(x0 + (ci + 0.5) * cw), z: r2(z0 + (cj + 0.5) * cd) }, Math.round(Math.hypot(cw, cd) / 2 + 4), 'Old oak and beech over the knoll, the bandits\' cover and the boars\' ground; wolves after dark.'), list: [] }; cells.set(key, cell); }
    if (cell.list.some((p) => Math.hypot(p[0] - x, p[1] - z) < 8)) continue;
    cell.list.push([x, z]);
    addTree(cell.s, rng() < 0.55 ? 'oak' : rng() < 0.7 ? 'beech' : 'birch', x, z, rand(0, 360), rand(0.85, 1.4));
    woodTrees++;
  }
  let k = 0;
  for (const cell of cells.values()) {
    if (cell.list.length < 10) continue;
    const t = cell.list[Math.floor(cell.list.length / 2)];
    if (k++ % 2 === 0) addSpawn(cell.s, 'wolf', t[0] + 6, t[1] + 6, true);
    else addSpawn(cell.s, 'boar', t[0] - 6, t[1] + 4);
  }
}
// copses and lone trees in the open, so the fields have edges
const COPSES = [{ x: 180, z: -40, r: 40 }, { x: -60, z: 340, r: 36 }, { x: 330, z: 60, r: 34 }, { x: -220, z: -300, r: 38 }, { x: 120, z: -260, r: 34 }];
COPSES.forEach((c, i) => {
  const s = space(`island_copse_${i + 1}`, `A copse`, { x: c.x, z: c.z }, c.r + 6, 'A stand of oak and birch on the open ground, the kind a fox lives in.');
  for (let gz = -c.r; gz <= c.r; gz += 11) for (let gx = -c.r; gx <= c.r; gx += 11) {
    const x = c.x + gx + rand(-3, 3), z = c.z + gz + rand(-3, 3);
    if (Math.hypot(x - c.x, z - c.z) > c.r - 6 || !plantable(x, z)) continue;
    addTree(s, rng() < 0.7 ? 'oak' : 'birch', x, z, rand(0, 360), rand(0.8, 1.3));
  }
  addSpawn(s, 'fox', c.x + 10, c.z + 8);
  if (i % 2) addSpawn(s, 'wolf', c.x - 10, c.z + 6, true);
});
// willows at the pond and the tarn
{
  const s = space('island_pond', 'The Pasture Pond', POND, 40, 'A round pond in the pasture with willows over it and geese on it.');
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; addTree(s, 'willow', POND.x + Math.sin(a) * 30, POND.z + Math.cos(a) * 30, rand(0, 360), rand(0.9, 1.3)); }
  addRock(s, 'reed_bed', POND.x - 24, POND.z + 6, 0, 1.2);
  addSpawn(s, 'goose', POND.x + 10, POND.z - 12); addSpawn(s, 'frog', POND.x - 16, POND.z + 12); addSpawn(s, 'wisp', POND.x, POND.z - 20, true);
  const t = space('island_tarn', 'The Hill Tarn', TARN, 60, 'A cold tarn under the chalk hill, reeds at its edge, and the mine\'s spoil coming down to it.');
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2 + 0.3; addTree(t, 'willow', TARN.x + Math.sin(a) * 44, TARN.z + Math.cos(a) * 44, rand(0, 360), rand(0.9, 1.3)); }
  addRock(t, 'reed_bed', TARN.x + 30, TARN.z - 20, 0, 1.3);
  addSpawn(t, 'giantSpider', TARN.x - 30, TARN.z + 30, true); addSpawn(t, 'wisp', TARN.x, TARN.z, true);
}
// lone oaks on the open downs
{
  const s = space('island_downs', 'The Open Downs', { x: 0, z: -20 }, 260, 'The open grass between everything, where the packs walk.');
  let n = 0;
  for (let i = 0; i < 400 && n < 40; i++) {
    const x = rand(-260, 260), z = rand(-280, 240);
    if (Math.hypot(x, z + 20) > 250 || !plantable(x, z) || heightAt(x, z) > 30) continue;
    if (s.trees.some((t) => Math.hypot(t.x - x, t.z - (z + 20)) < 22)) continue;
    addTree(s, rng() < 0.6 ? 'oak' : 'birch', x, z, rand(0, 360), rand(0.9, 1.4));
    n++;
  }
  addRock(s, 'moss_boulder', -80, -60, 20, 1.2); addRock(s, 'moss_boulder', 150, -180, 90, 1.1);
  addSpawn(s, 'wildDog', -120, 30); addSpawn(s, 'wildDog', -116, 34); addSpawn(s, 'wildDog', -124, 36);
  addSpawn(s, 'boar', 140, -60);
  addSpawn(s, 'wolf', 40, -200, true); addSpawn(s, 'wolf', 44, -204, true); addSpawn(s, 'wolf', 36, -208, true);
  addSpawn(s, 'hawk', 0, -40);
}

// ------------------------------------------------------------------ write
const DRIED = { moved: [], gone: [] };
for (const s of Object.values(SPACES)) { const did = dryOff(s); DRIED.moved.push(...did.moved.map((m) => `${m} in ${s.id}`)); DRIED.gone.push(...did.gone.map((g) => `${g} in ${s.id}`)); }
let removed = 0;
for (const id of spaceIdsOnDisk(ROOT)) { if (!id.startsWith('island_') || SPACES[id]) continue; unlinkSync(join(SPACE_DIR, id + '.json')); removed++; }
const AUDIT = auditSpaces(SPACES);
const written = [];
for (const [id, s] of Object.entries(SPACES)) { const out = saveEditorFile(ROOT, `src/mmo/spaces/${id}.json`, s); if (!out.ok) throw new Error(`${id}: ${out.text}`); written.push({ id, bytes: out.bytes }); }
const terrainOut = saveEditorFile(ROOT, TERRAIN_PATH, TERRAIN);
if (!terrainOut.ok) throw new Error(terrainOut.text);
writeSpaceIndex(ROOT);

// -------------------------------------------------------------- measure
const say = (...a) => console.log(...a);
const pad = (v, n) => String(v).padEnd(n);
const num = (v, n = 8, dp = 1) => String(Number(v).toFixed(dp)).padStart(n);
say(`\nsculpt-island: seed ${SEED}, world "${WORLD}"`);
say(`STROKES: ${TERRAIN.strokes.length} (${nLand} land plateaus, ${nPaint} paints)`);
say('\nTHE PLACES: the ground under each, and what is painted there');
const CENTRES = [['Haven, the green', TOWN], ['the quay', { x: TOWN.x, z: TOWN.z + 135 }], ['the jetty end', { x: TOWN.x, z: TOWN.z + 166 }], ['the Chalk Cut', MINE], ['the Shoulder Working', MINE2], ['the bandit camp', CAMP], ['the barrow', BARROW], ['the Old Cellars', CELLARS], ['the pond', POND], ['the tarn', TARN]];
for (const [name, p] of CENTRES) { const sm = sampleAt(p.x, p.z); say(`  ${pad(name, 24)}${num(p.x, 7, 0)} ${num(p.z, 7, 0)} ${num(sm.h, 7, 1)} m  ${pad(sm.ground || 'grass', 8)}${sm.water ? `wet at ${Number(sm.waterLevel).toFixed(1)}` : 'dry'}`); }
{
  let land = 0, sea = 0, beach = 0, above = 0, hi = -Infinity;
  for (let z = -800; z <= 800; z += 10) for (let x = -800; x <= 800; x += 10) { const s = sampleAt(x, z); if (s.water && Number(s.waterLevel) === 0) sea++; else { land++; if (s.h < 1.2) beach++; } if (s.h > 0.5) above++; hi = Math.max(hi, s.h); }
  say(`\nTHE SHORE: ${land} of ${land + sea} 10 m samples are dry land (${(land / 100).toFixed(1)} ha of ${((land + sea) / 100).toFixed(0)}), ${beach} of them under the beach line; the hill tops out at ${hi.toFixed(0)} m`);
  const R = []; for (let a = 0; a < 360; a += 45) R.push(`${a}:${shoreR(a * D2R).toFixed(0)}`); say(`  shore radius by bearing (0 is south, 90 east): ${R.join(' ')}`);
}
say('\nTHE LANES: painted under the middle, end to end');
for (const l of LANES) { const pts = samples(l.pts, 8); const hit = pts.filter((p) => sampleAt(p.x, p.z).ground === l.word).length; say(`  ${pad(l.id, 14)}${num(polyLength(l.pts), 6, 0)} m  ${hit}/${pts.length} ${l.word}`); }
say('\nTHE SPACES');
let tot = { pieces: 0, runs: 0, trees: 0, rocks: 0, spawns: 0, people: 0 };
for (const s of Object.values(SPACES)) { for (const k of Object.keys(tot)) tot[k] += (s[k] || []).length; }
say(`  ${Object.keys(SPACES).length} spaces: ${tot.pieces} pieces, ${tot.runs} runs, ${tot.trees} trees (${woodTrees} in the wood's ${woodCells} parts), ${tot.rocks} rocks, ${tot.spawns} placed spawns (${Object.values(SPACES).reduce((n, s) => n + s.spawns.filter((q) => q.night).length, 0)} of them by night), ${tot.people} people`);
say(`  walked ashore: ${DRIED.moved.length ? DRIED.moved.join(', ') : 'nothing'}`);
say(`  dropped: ${DRIED.gone.length ? DRIED.gone.join(', ') : 'nothing'}`);
say(`  the door: kind ${SPACES.island_cellars.kind}, dungeon ${SPACES.island_cellars.dungeon}`);
say(`\nFILES\n  ${TERRAIN_PATH}  ${(terrainOut.bytes / 1024).toFixed(0)} kB, ${TERRAIN.strokes.length} strokes, header ${JSON.stringify(TERRAIN.base)}\n  src/mmo/spaces/  ${written.length} island_* written, ${removed} stale removed; list.js regenerated for ${spaceIdsOnDisk(ROOT).length} spaces`);
say(`  audit: ${JSON.stringify(AUDIT)}`);
