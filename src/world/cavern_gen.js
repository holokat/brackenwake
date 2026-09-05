// A cavern, as a grid with a third dimension. Pure, no THREE, runs in node.
//
// dungeon_gen.js builds rooms and corridors on one flat floor. This builds the
// other kind of underground: big irregular chambers on ledges two to six metres
// apart, ramps between them, a span or two over a gorge, still water in the low
// halls, boxes worth opening, and on the last level a hall the boss stands in.
//
//   generateCavern(seed, site, level, spec) -> layout
//
// The layout is the SAME object dungeon_gen's is, so everything already written
// against it works untouched: `cells`, `rooms`, `entrance`, `stair`, `tags`,
// `w`, `h`, `cellSize`, `kind`, `level`, `top`, `id`, and therefore `cellAt`,
// `walkable`, `roomAt`, `worldOf`, `gridOf`, `clampToWalkable` and `floodFrom`
// out of dungeon_gen.js. It adds five things:
//
//   heights   Float32Array, one floor height in metres per cell
//   bridges   [{ cells, x0, z0, x1, z1, y, dir, w }] spans over a gorge
//   gorge     Set of cell indices that are a hole in the floor, not rock
//   water     [{ gx, gz }] cells with a pool standing in them
//   chests    [{ i, gx, gz, x, z, y, kind, locked, trapped, tier, key }]
//   arena     the room index of the boss hall, or null off the last level
//
// `kind` stays 'dungeon' or 'cave', because monster_ai.js reads it to pick a
// habitat and dungeon.js reads it to pick a palette. What says a level was
// built here rather than there is `gen`, which is 'cavern'.
//
// ---- why a step is never a cliff -----------------------------------------
//
// A player walks on the cell height under his feet, so two neighbouring cells
// three metres apart in y are a wall he steps up in one frame. The generator
// therefore never produces one. Heights are not painted on and then checked:
// they are DERIVED from a function that cannot break the rule.
//
//   1. Every chamber is given a target height T in whole metres, a random walk
//      of two to six metres up or down from the chamber before it.
//   2. Those targets are put through a min-plus closure against the real grid
//      distance between the chambers, so a pair joined by a short passage has
//      its difference cut to what that passage can ramp.
//   3. The height of every cell is then a multi-source Dijkstra from all the
//      chamber cells at once, each seeded at its own T, with unit cost a cell.
//
// The result is 1-Lipschitz on the walk grid BY CONSTRUCTION: two adjacent
// walkable cells differ by at most one step, STEP_M, which is one metre and
// therefore under the 1.2 m a player may climb. Every chamber comes out exactly
// flat at its own T, because step 2 made every other chamber too far away to
// pull it. The corridors between them are the ramps.
//
// A gorge is the one place a drop is allowed to be a drop, and it is not a step
// at all: a gorge cell is NOT WALKABLE. The only way across is the bridge deck,
// which is ordinary floor at the height of the two ends.

import { hash2, mulberry32 } from './noise.js';
import { CELL, ROCK, FLOOR, MAX_GRID, walkable, worldOf, floorAt } from './dungeon_gen.js';

// `floorAt` lives with the other layout readers in dungeon_gen.js, because a
// caller that holds a layout should not have to know which generator made it.
// It is re-exported here so a reader of this file finds it where it expects to.
export { CELL, ROCK, FLOOR, floorAt };

/** The most a floor may rise between two neighbouring cells, in metres. */
export const STEP_M = 1.0;
/** The most a player may climb without a ramp. The test measures against this. */
export const MAX_STEP_M = 1.2;
/** How far apart two ledges are, in metres, before the closure cuts it back. */
export const LEDGE_DROP = [2, 6];
/** A cavern never rises or falls more than this from the mouth. */
export const HEIGHT_SPAN = 12;

/** Chamber side in cells. A cell is 2 m, so 10 to 22 m across. */
export const CHAMBER_SIDE = [5, 11];
/** Cells of rock between two chambers' rectangles. Wide enough that a bulge never joins them. */
export const CHAMBER_GAP = 6;
/** How far a chamber's wall may wander outside its rectangle. */
export const BULGE = 2;
/** Chambers per level, before the depth bonus. */
export const CHAMBERS = [6, 9];
/** Grid side in cells: base, plus spread, plus one step per level down. */
export const GRID_BASE = 62;
export const GRID_SPREAD = 12;
export const GRID_PER_LEVEL = 6;
/** Passages are two cells across, so two bodies pass. */
export const CORRIDOR_W = 2;
/** The boss hall grows by up to this many cells a side. */
export const ARENA_GROW = 4;
/** How deep a gorge is under its bridge, in metres. */
export const GORGE_DEPTH = 7;
/** A bridge deck is this many cells long, and there are at most BRIDGES of them. */
export const BRIDGE_LEN = [4, 8];
export const BRIDGES = [1, 2];
/** A pool is this many cells across at the widest. */
export const POOL_R = [1.6, 3.6];

const ADJ = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const ri = (rng, n) => Math.floor(rng() * n);
const inside = (L, gx, gz) => gx >= 0 && gz >= 0 && gx < L.w && gz < L.h;
const idx = (L, gx, gz) => gz * L.w + gx;

/** Is this cell a hole rather than floor or rock? */
export const isGorge = (layout, gx, gz) => !!layout?.gorge?.has(gz * layout.w + gx);

/**
 * Can a body walk from one cell to the one beside it? Walkable at both ends and
 * no more than MAX_STEP_M between the two floors. The reachability test uses
 * this, and so does anything that wants to know whether a ledge is a ledge.
 */
export function stepOk(layout, ax, az, bx, bz) {
  if (!walkable(layout, ax, az) || !walkable(layout, bx, bz)) return false;
  return Math.abs(floorAt(layout, bx, bz) - floorAt(layout, ax, az)) <= MAX_STEP_M + 1e-9;
}

/**
 * One level of a cavern. `site` needs `cx`, `cz`, `id`, `kind` and `name`;
 * `spec` is the row out of src/mmo/dungeons.js and may be omitted, in which
 * case the level is one of one with no boss and a modest number of boxes.
 */
export function generateCavern(seed, site, level = 1, spec = null) {
  const kind = site.kind === 'cave' ? 'cave' : 'dungeon';
  const top = Math.max(1, Math.round(spec?.levels || (kind === 'cave' ? 1 : 3)));
  const lv = Math.max(1, Math.min(top, level | 0));
  const tier = Math.max(1, Math.min(6, Math.round(spec?.tier || 1)));
  const rng = mulberry32((hash2(site.cx | 0, site.cz | 0, seed) ^ Math.imul(lv, 0x85ebca6b)) >>> 0);

  const grow = (lv - 1) * GRID_PER_LEVEL;
  const w = Math.min(MAX_GRID, GRID_BASE + ri(rng, GRID_SPREAD) + grow);
  const h = Math.min(MAX_GRID, GRID_BASE + ri(rng, GRID_SPREAD) + grow);

  const L = {
    gen: 'cavern', kind, level: lv, top, w, h, cellSize: CELL, corridorW: CORRIDOR_W,
    id: site.id, siteId: site.sub || site.id, name: site.name,
    cx: site.cx, cz: site.cz, seed, theme: spec?.theme || 'granite', tier,
    cells: new Array(w * h).fill(ROCK),
    rooms: [], entrance: null, stair: null, tags: {}, ore: [], chests: [],
    heights: null, bridges: [], gorge: new Set(), water: [], arena: null,
    oreBand: site.oreBand || null, oreTier: null,
  };
  const set = (gx, gz) => {
    if (gx < 1 || gz < 1 || gx > w - 2 || gz > h - 2) return;   // the rim is never carved
    L.cells[gz * w + gx] = FLOOR;
  };
  const isFloor = (gx, gz) => inside(L, gx, gz) && L.cells[gz * w + gx] === FLOOR;

  // ---- the chambers ------------------------------------------------------
  const [minS, maxS] = CHAMBER_SIDE;
  const inset = 1 + BULGE;
  const want = CHAMBERS[0] + ri(rng, CHAMBERS[1] - CHAMBERS[0] + 1) + (lv - 1);
  const clear = (r, skip) => !L.rooms.some((o) => o !== skip
    && r.x - CHAMBER_GAP <= o.x + o.w && o.x - CHAMBER_GAP <= r.x + r.w
    && r.z - CHAMBER_GAP <= o.z + o.h && o.z - CHAMBER_GAP <= r.z + r.h);
  for (let t = 0; t < 600 && L.rooms.length < want; t++) {
    const rw = minS + ri(rng, maxS - minS + 1), rh = minS + ri(rng, maxS - minS + 1);
    if (w - rw - inset * 2 <= 0 || h - rh - inset * 2 <= 0) continue;
    const r = {
      i: L.rooms.length,
      x: inset + ri(rng, w - rw - inset * 2), z: inset + ri(rng, h - rh - inset * 2),
      w: rw, h: rh, kind: 'room',
    };
    r.cx = r.x + (r.w >> 1); r.cz = r.z + (r.h >> 1);
    if (!clear(r)) continue;
    L.rooms.push(r);
  }
  if (L.rooms.length < 3) throw new Error(`cavern ${site.id} level ${lv}: only ${L.rooms.length} chamber(s) placed`);

  // ---- the entry, the far hall and the arena -----------------------------
  const ent = L.rooms[0];
  ent.kind = 'entry';
  let far = L.rooms[1], farD = -1;
  for (let i = 1; i < L.rooms.length; i++) {
    const r = L.rooms[i];
    const d = Math.hypot(r.cx - ent.cx, r.cz - ent.cz);
    if (d > farD) { farD = d; far = r; }
  }
  const bottom = lv >= top;
  if (bottom) {
    // the boss hall is grown a side at a time, stopping at the grid or at a neighbour
    for (const [dx, dz, dw, dh] of [[-1, 0, 1, 0], [0, 0, 1, 0], [0, -1, 0, 1], [0, 0, 0, 1]]) {
      for (let k = 0; k < ARENA_GROW; k++) {
        const t = { x: far.x + dx, z: far.z + dz, w: far.w + dw, h: far.h + dh };
        if (t.x < inset || t.z < inset || t.x + t.w > w - inset || t.z + t.h > h - inset) break;
        if (!clear({ ...t }, far)) break;
        far.x = t.x; far.z = t.z; far.w = t.w; far.h = t.h;
      }
    }
    far.cx = far.x + (far.w >> 1); far.cz = far.z + (far.h >> 1);
  }
  far.kind = bottom ? 'boss' : 'hall';
  if (bottom && spec?.arena !== false) L.arena = far.i;
  for (const r of L.rooms) if (r.kind === 'room' && Math.min(r.w, r.h) >= 10) r.kind = 'hall';

  // ---- carve them --------------------------------------------------------
  // The rectangle is carved whole and never eroded: monster_ai.js picks spawn
  // cells inside it and a hole there would put a body in the rock. Outside it
  // the wall wanders, and a bulge only ever takes a cell that already touches
  // carved ground, so it can never be a sealed pocket.
  for (const r of L.rooms) {
    for (let z = r.z; z < r.z + r.h; z++) for (let x = r.x; x < r.x + r.w; x++) set(x, z);
    const phase = rng() * 6.283;
    for (let ring = 1; ring <= BULGE; ring++) {
      const add = [];
      for (let z = r.z - ring; z < r.z + r.h + ring; z++) {
        for (let x = r.x - ring; x < r.x + r.w + ring; x++) {
          if (!inside(L, x, z) || isFloor(x, z)) continue;
          if (!ADJ.some(([dx, dz]) => isFloor(x + dx, z + dz))) continue;
          const a = Math.atan2(z - r.cz, x - r.cx);
          const lobe = 0.5 + 0.5 * Math.sin(a * 3 + phase) * Math.cos(a * 2 - phase);
          if (rng() < 0.20 + lobe * 0.55) add.push([x, z]);
        }
      }
      for (const [x, z] of add) set(x, z);
    }
  }

  // ---- the passages ------------------------------------------------------
  // Chamber i to chamber i-1, so the whole level is connected by construction,
  // and a loop or two so a cavern is not a corridor walked twice.
  const runs = [];                       // every straight run, for the bridges
  const carveH = (x0, x1, z) => {
    const a = Math.min(x0, x1), b = Math.max(x0, x1);
    for (let x = a; x <= b; x++) { set(x, z); set(x, z + 1); }
    if (b - a >= BRIDGE_LEN[0] + 2) runs.push({ dir: 'h', a, b, at: z });
  };
  const carveV = (z0, z1, x) => {
    const a = Math.min(z0, z1), b = Math.max(z0, z1);
    for (let z = a; z <= b; z++) { set(x, z); set(x + 1, z); }
    if (b - a >= BRIDGE_LEN[0] + 2) runs.push({ dir: 'v', a, b, at: x });
  };
  const block2 = (x, z) => { set(x, z); set(x + 1, z); set(x, z + 1); set(x + 1, z + 1); };
  const join = (a, b) => {
    if (rng() < 0.5) { carveH(a.cx, b.cx, a.cz); block2(b.cx, a.cz); carveV(a.cz, b.cz, b.cx); }
    else { carveV(a.cz, b.cz, a.cx); block2(a.cx, b.cz); carveH(a.cx, b.cx, b.cz); }
  };
  for (let i = 1; i < L.rooms.length; i++) join(L.rooms[i - 1], L.rooms[i]);
  join(L.rooms[0], L.rooms[L.rooms.length - 1]);
  if (rng() < 0.7 && L.rooms.length > 4) join(L.rooms[1], L.rooms[L.rooms.length - 2]);

  // ---- the ledges --------------------------------------------------------
  heightsFor(L, rng);

  // ---- the gorges and the spans -----------------------------------------
  carveBridges(L, runs, rng);

  // ---- what stands in the water and what stands in a box -----------------
  const takenCell = new Set();
  L.entrance = { gx: ent.cx, gz: ent.cz };
  takenCell.add(idx(L, ent.cx, ent.cz));
  if (lv < top) {
    L.stair = { gx: far.cx, gz: far.cz };
    takenCell.add(idx(L, far.cx, far.cz));
  }
  poolsFor(L, rng, takenCell);
  oreFor(L, rng, takenCell);
  chestsFor(L, rng, spec, takenCell);

  return L;
}

// ---------------------------------------------------------------------------
// The ledges
// ---------------------------------------------------------------------------

/**
 * Give every cell a floor height. See the header for why this cannot produce a
 * step a player may not climb.
 */
function heightsFor(L, rng) {
  const n = L.rooms.length;
  const cellsOf = L.rooms.map(() => []);
  const owner = new Int16Array(L.w * L.h).fill(-1);
  for (const r of L.rooms) {
    for (let z = r.z; z < r.z + r.h; z++) for (let x = r.x; x < r.x + r.w; x++) {
      if (!walkable(L, x, z)) continue;
      const i = idx(L, x, z);
      if (owner[i] >= 0) continue;
      owner[i] = r.i; cellsOf[r.i].push(i);
    }
  }

  // 1. what each chamber would like to be, as a walk from the mouth
  const T = new Array(n).fill(0);
  const [lo, hi] = LEDGE_DROP;
  for (let i = 1; i < n; i++) {
    const d = lo + ri(rng, hi - lo + 1);
    // downward twice as often as up: you are going into the ground
    const dir = rng() < 0.68 ? -1 : 1;
    T[i] = Math.max(-HEIGHT_SPAN, Math.min(HEIGHT_SPAN, T[i - 1] + dir * d));
  }

  // 2. how far apart the chambers really are on the walk grid, and the closure
  //    that cuts a difference back to what the passage between them can ramp
  const D = [];
  for (let i = 0; i < n; i++) D.push(distFrom(L, cellsOf[i], owner, n));
  for (let pass = 0; pass < n; pass++) {
    let moved = false;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const reach = D[j][i];
      if (!Number.isFinite(reach)) continue;
      if (T[i] > T[j] + reach) { T[i] = T[j] + reach; moved = true; }
    }
    if (!moved) break;
  }

  // 3. the two envelopes, and the floor between them.
  //
  //    The upper envelope is min(T_i + distance to chamber i): the highest a
  //    floor may be and still be climbable from every chamber. The lower is
  //    max(T_i - distance): the lowest. Either alone is wrong. The upper one
  //    peaks in the middle of a long passage, so a corridor between two rooms
  //    would come out as a hill; the lower one digs the same corridor into a
  //    trench. Their AVERAGE is 1-Lipschitz like both of them, arrives at
  //    exactly T on a chamber cell where the two agree, and reads as what it
  //    should read as: flat ground either side of a ramp.
  const up = envelope(L, cellsOf, T, +1);
  const down = envelope(L, cellsOf, T, -1);
  const H = new Float32Array(L.w * L.h);
  for (let i = 0; i < H.length; i++) {
    if (!Number.isFinite(up[i]) || !Number.isFinite(down[i])) continue;
    H[i] = ((up[i] + down[i]) / 2) * STEP_M;
  }
  L.heights = H;
  L.roomOf = owner;
}

/**
 * One envelope over the walk grid. `sign` +1 gives min(T_i + d_i), the highest
 * a cell may be; -1 gives max(T_i - d_i), the lowest. Unit edges, so a queue
 * that re-visits a cell whenever it falls is a Dijkstra with no heap.
 */
function envelope(L, cellsOf, T, sign) {
  const val = new Float64Array(L.w * L.h).fill(Infinity);
  const queue = [];
  for (let i = 0; i < cellsOf.length; i++) {
    for (const c of cellsOf[i]) {
      const v = sign > 0 ? T[i] : -T[i];
      if (v < val[c]) { val[c] = v; queue.push(c); }
    }
  }
  for (let head = 0; head < queue.length; head++) {
    const c = queue[head];
    const gx = c % L.w, gz = (c - gx) / L.w;
    const next = val[c] + 1;
    for (const [dx, dz] of ADJ) {
      const nx = gx + dx, nz = gz + dz;
      if (!walkable(L, nx, nz)) continue;
      const j = idx(L, nx, nz);
      if (next < val[j] - 1e-9) { val[j] = next; queue.push(j); }
    }
  }
  if (sign < 0) for (let i = 0; i < val.length; i++) val[i] = Number.isFinite(val[i]) ? -val[i] : Infinity;
  return val;
}

/** Grid distance in cells from a set of cells to every chamber, or Infinity. */
function distFrom(L, from, owner, n) {
  const out = new Array(n).fill(Infinity);
  const seen = new Uint8Array(L.w * L.h);
  let q = [...from];
  for (const c of q) seen[c] = 1;
  let d = 0;
  while (q.length) {
    const next = [];
    for (const c of q) {
      const o = owner[c];
      if (o >= 0 && d < out[o]) out[o] = d;
      const gx = c % L.w, gz = (c - gx) / L.w;
      for (const [dx, dz] of ADJ) {
        const nx = gx + dx, nz = gz + dz;
        if (!walkable(L, nx, nz)) continue;
        const j = idx(L, nx, nz);
        if (seen[j]) continue;
        seen[j] = 1; next.push(j);
      }
    }
    q = next; d++;
  }
  return out;
}

// ---------------------------------------------------------------------------
// The spans
// ---------------------------------------------------------------------------

/**
 * Cut a hole under a stretch of passage and call what is left a bridge.
 *
 * Only ROCK becomes gorge, never floor, so nothing that was walkable stops
 * being walkable and the level's connectivity is exactly what the passages
 * made it. The deck itself is ordinary floor at the height it already had.
 */
function carveBridges(L, runs, rng) {
  const want = BRIDGES[0] + ri(rng, BRIDGES[1] - BRIDGES[0] + 1);
  const pool = runs.slice().sort(() => (rng() < 0.5 ? -1 : 1));
  for (const run of pool) {
    if (L.bridges.length >= want) break;
    const len = BRIDGE_LEN[0] + ri(rng, BRIDGE_LEN[1] - BRIDGE_LEN[0] + 1);
    const span = run.b - run.a;
    if (span < len + 2) continue;
    const start = run.a + 1 + ri(rng, Math.max(1, span - len - 1));
    const deck = [];
    let flat = true, y0 = null;
    for (let k = 0; k < len; k++) {
      const gx = run.dir === 'h' ? start + k : run.at;
      const gz = run.dir === 'h' ? run.at : start + k;
      const pair = run.dir === 'h' ? [[gx, gz], [gx, gz + 1]] : [[gx, gz], [gx + 1, gz]];
      for (const [x, z] of pair) {
        if (!walkable(L, x, z)) { flat = false; break; }
        const y = floorAt(L, x, z);
        if (y0 == null) y0 = y;
        // a deck is level: a span that climbs is a ramp and not a bridge
        if (Math.abs(y - y0) > 0.51) { flat = false; break; }
        deck.push([x, z]);
      }
      if (!flat) break;
    }
    if (!flat || deck.length < len) continue;

    // the hole: the two bands beside the deck, and only where they are rock
    const holes = [];
    for (let k = -1; k <= len; k++) {
      const gx = run.dir === 'h' ? start + k : run.at;
      const gz = run.dir === 'h' ? run.at : start + k;
      for (let off = -3; off <= 4; off++) {
        const x = run.dir === 'h' ? gx : gx + off;
        const z = run.dir === 'h' ? gz + off : gz;
        if (run.dir === 'h' && off >= 0 && off <= 1) continue;   // that is the deck
        if (run.dir === 'v' && off >= 0 && off <= 1) continue;
        if (!inside(L, x, z) || walkable(L, x, z)) continue;
        holes.push(idx(L, x, z));
      }
    }
    if (holes.length < len * 2) continue;                        // nothing to fall into
    for (const i of holes) L.gorge.add(i);
    const p0 = worldOf(L, deck[0][0], deck[0][1]);
    const p1 = worldOf(L, deck[deck.length - 1][0], deck[deck.length - 1][1]);
    L.bridges.push({
      dir: run.dir, cells: deck.map(([x, z]) => ({ gx: x, gz: z })),
      x0: p0.x, z0: p0.z, x1: p1.x, z1: p1.z, y: y0, depth: GORGE_DEPTH,
    });
  }
}

// ---------------------------------------------------------------------------
// The water and the boxes
// ---------------------------------------------------------------------------

/** Still pools in the low chambers. Never in the room you arrive in. */
function poolsFor(L, rng, taken) {
  const heights = L.rooms.map((r) => floorAt(L, r.cx, r.cz));
  const sorted = [...heights].sort((a, b) => a - b);
  const median = sorted[sorted.length >> 1];
  for (const r of L.rooms) {
    if (r.kind === 'entry' || r.kind === 'boss') continue;
    if (floorAt(L, r.cx, r.cz) > median) continue;              // water lies low
    if (rng() < 0.35) continue;
    const px = r.x + 1 + ri(rng, Math.max(1, r.w - 2));
    const pz = r.z + 1 + ri(rng, Math.max(1, r.h - 2));
    const rad = POOL_R[0] + rng() * (POOL_R[1] - POOL_R[0]);
    for (let gz = r.z; gz < r.z + r.h; gz++) for (let gx = r.x; gx < r.x + r.w; gx++) {
      if (!walkable(L, gx, gz)) continue;
      const i = idx(L, gx, gz);
      if (taken.has(i)) continue;
      if (Math.hypot(gx - px, gz - pz) > rad) continue;
      taken.add(i);
      L.water.push({ gx, gz, room: r.i });
    }
  }
  L.waterSet = new Set(L.water.map((c) => idx(L, c.gx, c.gz)));
}

/**
 * Seams, in a cave and nowhere else.
 *
 * A cave is entered for the ore in it, and both of the sheet's caves promise
 * some by name, so a cavern built for a cave carries exactly what the old
 * generator carried: eight or more seams against the walls, tagged 'ore', at
 * the zone's own metal. A dungeon has none, as it never did.
 */
function oreFor(L, rng, taken) {
  if (L.kind !== 'cave') return;
  if (L.oreBand && L.oreBand.length) {
    L.oreTier = L.oreBand[hash2(L.cx | 0, L.cz | 0, (L.seed | 0) + L.level * 7919) % L.oreBand.length];
  }
  const tag = (gx, gz) => {
    const i = idx(L, gx, gz);
    if (!walkable(L, gx, gz) || taken.has(i) || L.tags[i]) return false;
    if (L.waterSet && L.waterSet.has(i)) return false;
    L.tags[i] = 'ore';
    L.ore.push({ gx, gz, ore: L.oreTier });
    return true;
  };
  for (const r of L.rooms) {
    const edge = [];
    for (let gz = r.z - BULGE; gz < r.z + r.h + BULGE; gz++) {
      for (let gx = r.x - BULGE; gx < r.x + r.w + BULGE; gx++) {
        if (!walkable(L, gx, gz)) continue;
        if (ADJ.some(([dx, dz]) => !walkable(L, gx + dx, gz + dz))) edge.push([gx, gz]);
      }
    }
    const pool = edge.length ? edge : [[r.cx, r.cz]];
    const n = 3 + ri(rng, 4);
    for (let k = 0; k < n; k++) { const p = pool[ri(rng, pool.length)]; tag(p[0], p[1]); }
  }
  for (let guard = 0; L.ore.length < 8 && guard < 400; guard++) {
    const r = L.rooms[ri(rng, L.rooms.length)];
    tag(r.x + ri(rng, r.w), r.z + ri(rng, r.h));
  }
}

/**
 * The boxes. A chest is locked, sometimes trapped, and worth the realm's tier;
 * a cache is neither and holds one thing.
 *
 * Never in the room you arrive in, never on the entrance or the stair, never
 * over water, and never within three cells of another box, so a chamber does
 * not come out with a row of them against one wall.
 */
function chestsFor(L, rng, spec, taken) {
  const range = (pair, dflt) => {
    const [lo, hi] = Array.isArray(pair) ? pair : dflt;
    return lo + ri(rng, Math.max(1, hi - lo + 1));
  };
  const wantChest = range(spec?.chests, [1, 2]);
  const wantCache = range(spec?.caches, [2, 4]);
  const rooms = L.rooms.filter((r) => r.kind !== 'entry');
  if (!rooms.length) return;
  const placed = [];
  const far = (gx, gz) => placed.every((p) => Math.abs(p.gx - gx) >= 3 || Math.abs(p.gz - gz) >= 3);

  const put = (kind) => {
    for (let t = 0; t < 300; t++) {
      const r = rooms[ri(rng, rooms.length)];
      const gx = r.x + ri(rng, r.w), gz = r.z + ri(rng, r.h);
      const i = idx(L, gx, gz);
      if (!walkable(L, gx, gz) || taken.has(i) || L.tags[i]) continue;
      if (L.waterSet && L.waterSet.has(i)) continue;
      if (L.gorge.has(i)) continue;
      if (!far(gx, gz)) continue;
      taken.add(i);
      L.tags[i] = 'chest';
      const p = worldOf(L, gx, gz);
      const index = L.chests.length;
      const rec = {
        i: index, gx, gz, x: p.x, z: p.z, y: floorAt(L, gx, gz),
        room: r.i, kind,
        locked: kind === 'chest',
        // a trap is on rather more than half the locked boxes, and never on a cache
        trapped: kind === 'chest' && rng() < 0.55,
        tier: L.tier,
        key: `${L.siteId}:${L.level}:${index}`,
      };
      L.chests.push(rec);
      placed.push(rec);
      return rec;
    }
    return null;
  };
  for (let k = 0; k < wantChest; k++) put('chest');
  for (let k = 0; k < wantCache; k++) put('cache');
}

// ---------------------------------------------------------------------------
// What a caller may check for itself
// ---------------------------------------------------------------------------

/**
 * Every cell reachable on foot from the entrance, counting a step of more than
 * MAX_STEP_M as a wall. Used by the test and by anything that wants to know
 * whether a ledge stranded something.
 */
export function reachableFrom(layout, gx, gz) {
  const seen = new Set();
  if (!walkable(layout, gx, gz)) return seen;
  const stack = [[gx, gz]];
  seen.add(idx(layout, gx, gz));
  while (stack.length) {
    const [x, z] = stack.pop();
    for (const [dx, dz] of ADJ) {
      const nx = x + dx, nz = z + dz;
      if (!stepOk(layout, x, z, nx, nz)) continue;
      const i = idx(layout, nx, nz);
      if (seen.has(i)) continue;
      seen.add(i); stack.push([nx, nz]);
    }
  }
  return seen;
}
