// The way down, as a grid. Pure, no THREE, runs in node.
//
// A dungeon mouth and a cave mouth both open onto a level: a grid of 2 m cells
// where a cell is either solid rock or floor you can stand on. The layout is a
// function of the site and the depth, exactly like the surface is a function of
// the seed, so the same shaft always has the same first level and a level that
// is thrown away when you climb out comes back identical when you go down again.
// Nothing about a level is saved.
//
//   generateDungeon(seed, site, depthLevel) -> layout
//   cellAt(layout, gx, gz)   'rock' | 'floor' | 'entrance' | 'stair' | 'ore' | 'chest'
//   walkable(layout, gx, gz) true for anything but rock and off the grid
//   clampToWalkable(layout, x, z) -> { x, z } in metres: a point in the rock is
//                                    pushed to the centre of the nearest floor
//                                    cell, a point already on floor is left alone
//
// Rooms are placed first and then chained centre to centre with L corridors, so
// every room is reachable from the room before it and therefore from the
// entrance. That is a property of the construction, and dungeon_gen.test.mjs
// proves it by flood fill rather than taking it on trust.
//
// Depth: a dungeon has three levels, a cave has one. The deepest level has no
// stair down and says so by carrying `stair: null`. A staircase that leads
// nowhere is the same lie as a door that does not open.
//
// ---- how big, and why ----------------------------------------------------
// The first cut of this file drew rooms 3 to 8 cells a side on a 26 to 48 cell
// grid. Six by six metres is a cupboard: a player and two skeletons filled it,
// and the follow camera at nine metres saw the whole level at once. Rooms are
// now 6 to 14 cells a side (12 to 28 m) for a dungeon and 8 to 18 for a cave,
// corridors are two cells wide so two bodies pass, and the grid grew to match:
// see GRID_BASE. The far room of every level is a hall, and on the bottom level
// that hall is grown into the great hall the boss stands in, labelled
// `kind: 'boss'` so monster_ai.js finds it by name instead of by guessing which
// room is furthest from the door.
//
// Room `kind` is part of the contract with monster_ai.js normalizeDungeonLayout:
// 'entry' is the room you arrive in and holds nothing, 'boss' is the deep room.
// The values it does not know ('hall', 'room') fall through harmlessly. The
// labelled room is the SAME room that file would have chosen by distance, so
// the label changes no placement; it only stops the label and the geometry
// disagreeing about which room is deep.

import { hash2, mulberry32 } from './noise.js';

export const CELL = 2;        // metres across one grid cell
export const MAX_GRID = 96;   // no level is ever wider or deeper than this
export const ROCK = 0, FLOOR = 1;

/** Corridors are this many cells across, so two bodies pass in one. */
export const CORRIDOR_W = 2;

/** Room side length in cells, [min, max]. A cell is 2 m. */
export const ROOM_SIDE = { dungeon: [6, 14], cave: [8, 18] };
/** Grid side in cells: base + up to spread, plus PER_LEVEL for every level down. */
export const GRID_BASE = { dungeon: 64, cave: 62 };
export const GRID_SPREAD = { dungeon: 14, cave: 12 };
export const GRID_PER_LEVEL = 6;
/** How many cells of rock must stand between two rooms. */
export const ROOM_GAP = { dungeon: 2, cave: 5 };   // a cave's caverns bulge outward
/** How far a cave cavern may bulge past its recorded rectangle. */
export const CAVE_BULGE = 2;
/** The far room grows by up to this many cells a side on the bottom level. */
export const HALL_GROW = 3;
/** A room this wide and this deep reads as a hall even if it is not the far one. */
export const HALL_SIDE = 11;

const ADJ = [[1, 0], [-1, 0], [0, 1], [0, -1]];

/** How deep this kind of place goes. */
export const maxLevel = (kind) => (kind === 'cave' ? 1 : 3);

const ri = (rng, n) => Math.floor(rng() * n);          // integer in [0, n)
const idx = (layout, gx, gz) => gz * layout.w + gx;
const inside = (layout, gx, gz) => gx >= 0 && gz >= 0 && gx < layout.w && gz < layout.h;

/**
 * A level. `seed` is the world seed, `site` needs cx, cz and kind, `depthLevel`
 * counts from 1 at the mouth.
 */
export function generateDungeon(seed, site, depthLevel = 1) {
  const kind = site.kind === 'cave' ? 'cave' : 'dungeon';
  const top = maxLevel(kind);
  const level = Math.max(1, Math.min(top, depthLevel | 0));
  // one rng for the whole level, seeded by the site cell and the depth, so
  // level 2 of a shaft is not level 1 of it shifted
  const rng = mulberry32((hash2(site.cx, site.cz, seed) ^ Math.imul(level, 0x9e3779b1)) >>> 0);

  // deeper is bigger, and nothing is ever bigger than MAX_GRID
  const grow = (level - 1) * GRID_PER_LEVEL;
  const w = Math.min(MAX_GRID, GRID_BASE[kind] + ri(rng, GRID_SPREAD[kind]) + grow);
  const h = Math.min(MAX_GRID, GRID_BASE[kind] + ri(rng, GRID_SPREAD[kind]) + grow);

  const layout = {
    kind, level, top, w, h, cellSize: CELL, corridorW: CORRIDOR_W,
    id: site.id, name: site.name, cx: site.cx, cz: site.cz, seed,
    cells: new Array(w * h).fill(ROCK),
    rooms: [], entrance: null, stair: null, tags: {}, ore: [], chests: [],
    // the zone's ore band (zones.js) picks this level's metal; null means the
    // old depth ladder (veinsFor) for a level whose site carries no band
    oreBand: site.oreBand || null,
    oreTier: site.oreBand ? site.oreBand[hash2(site.cx ?? 0, site.cz ?? 0, (seed | 0) + level * 7919) % site.oreBand.length] : null,
  };
  const set = (gx, gz) => {
    // a one cell rim of rock is never carved: every level is sealed
    if (gx < 1 || gz < 1 || gx > w - 2 || gz > h - 2) return;
    layout.cells[gz * w + gx] = FLOOR;
  };
  const isFloor = (gx, gz) => inside(layout, gx, gz) && layout.cells[gz * w + gx] === FLOOR;

  // ---- rooms -------------------------------------------------------------
  const [minR, maxR] = ROOM_SIDE[kind];
  const gap = ROOM_GAP[kind];
  const inset = 1 + (kind === 'cave' ? CAVE_BULGE : 0);
  const want = (kind === 'cave' ? 5 : 7) + ri(rng, 3) + (level - 1);
  const clear = (r, skip) => !layout.rooms.some((o) => o !== skip
    && r.x - gap <= o.x + o.w && o.x - gap <= r.x + r.w
    && r.z - gap <= o.z + o.h && o.z - gap <= r.z + r.h);
  for (let t = 0; t < 400 && layout.rooms.length < want; t++) {
    const rw = minR + ri(rng, maxR - minR + 1), rh = minR + ri(rng, maxR - minR + 1);
    if (w - rw - inset * 2 <= 0 || h - rh - inset * 2 <= 0) continue;
    const r = { x: inset + ri(rng, w - rw - inset * 2), z: inset + ri(rng, h - rh - inset * 2), w: rw, h: rh, kind: 'room' };
    r.cx = r.x + (r.w >> 1); r.cz = r.z + (r.h >> 1);
    if (!clear(r)) continue;
    layout.rooms.push(r);
  }
  // A level with one room has no stair that is not the entrance. Four hundred
  // tries on a 62 cell grid have never produced fewer than four, but a level
  // that came out unusable must say so rather than ship a staircase under the
  // player.
  if (layout.rooms.length < 2) throw new Error(`dungeon ${site.id} level ${level}: only ${layout.rooms.length} room(s) placed`);

  // ---- the hall, and the great hall at the bottom ------------------------
  const ent0 = layout.rooms[0];
  ent0.kind = 'entry';
  let hall = null, hallD = -1;
  for (let i = 1; i < layout.rooms.length; i++) {
    const r = layout.rooms[i];
    const d = Math.hypot(r.cx - ent0.cx, r.cz - ent0.cz);
    if (d > hallD) { hallD = d; hall = r; }
  }
  const bottom = level >= top;
  if (bottom) {
    // grow it a side at a time, stopping at the grid edge or at another room
    for (const [dx, dz, dw, dh] of [[-1, 0, 1, 0], [0, 0, 1, 0], [0, -1, 0, 1], [0, 0, 0, 1]]) {
      for (let k = 0; k < HALL_GROW; k++) {
        const t = { x: hall.x + dx, z: hall.z + dz, w: hall.w + dw, h: hall.h + dh };
        if (t.x < inset || t.z < inset || t.x + t.w > w - inset || t.z + t.h > h - inset) break;
        if (!clear(t, hall)) break;
        hall.x = t.x; hall.z = t.z; hall.w = t.w; hall.h = t.h;
      }
    }
    hall.cx = hall.x + (hall.w >> 1); hall.cz = hall.z + (hall.h >> 1);
  }
  hall.kind = bottom ? 'boss' : 'hall';
  for (const r of layout.rooms) {
    if (r.kind === 'room' && Math.min(r.w, r.h) >= HALL_SIDE) r.kind = 'hall';
  }

  // ---- carve the rooms ---------------------------------------------------
  for (const r of layout.rooms) {
    for (let z = r.z; z < r.z + r.h; z++) for (let x = r.x; x < r.x + r.w; x++) set(x, z);
    if (kind !== 'cave') continue;
    // A cavern is not a box. Two rings of growth outward from what is already
    // carved, weighted by a lobed function of the angle from the room centre,
    // so the wall comes and goes. Growth only ever takes a cell that already
    // has a carved neighbour, so a bulge can never be a sealed pocket, and it
    // stays inside CAVE_BULGE, which ROOM_GAP and `inset` already reserved.
    // The recorded rectangle is carved WHOLE and never eroded, because
    // monster_ai.js picks spawn cells inside it and a hole there would put a
    // body in the rock for the clamp to drag out.
    const phase = rng() * 6.283;
    for (let ring = 1; ring <= CAVE_BULGE; ring++) {
      const add = [];
      for (let z = r.z - ring; z < r.z + r.h + ring; z++) {
        for (let x = r.x - ring; x < r.x + r.w + ring; x++) {
          if (!inside(layout, x, z) || isFloor(x, z)) continue;
          if (!ADJ.some(([dx, dz]) => isFloor(x + dx, z + dz))) continue;
          const a = Math.atan2(z - r.cz, x - r.cx);
          const lobe = 0.5 + 0.5 * Math.sin(a * 3 + phase) * Math.cos(a * 2 - phase);
          if (rng() < 0.18 + lobe * 0.5) add.push([x, z]);
        }
      }
      for (const [x, z] of add) set(x, z);
    }
  }

  // ---- corridors ---------------------------------------------------------
  // room i to room i-1, so the chain is connected by construction. Two cells
  // wide: a horizontal run carves the band { z, z+1 }, a vertical run the band
  // { x, x+1 }, and the corner between them is filled as a 2 x 2 block so the
  // elbow is not a one cell pinch. A cave's passages swell now and then.
  const swell = (x, z) => { if (kind === 'cave' && rng() < 0.3) set(x, z); };
  const carveH = (x0, x1, z) => {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
      set(x, z); set(x, z + 1);
      swell(x, z - 1); swell(x, z + 2);
    }
  };
  const carveV = (z0, z1, x) => {
    for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) {
      set(x, z); set(x + 1, z);
      swell(x - 1, z); swell(x + 2, z);
    }
  };
  const block2 = (x, z) => { set(x, z); set(x + 1, z); set(x, z + 1); set(x + 1, z + 1); };
  const join = (a, b) => {
    if (rng() < 0.5) { carveH(a.cx, b.cx, a.cz); block2(b.cx, a.cz); carveV(a.cz, b.cz, b.cx); }
    else { carveV(a.cz, b.cz, a.cx); block2(a.cx, b.cz); carveH(a.cx, b.cx, b.cz); }
  };
  for (let i = 1; i < layout.rooms.length; i++) join(layout.rooms[i - 1], layout.rooms[i]);
  // a loop or two so a dungeon is not a corridor you walk back down
  if (kind === 'dungeon' && layout.rooms.length > 3) {
    join(layout.rooms[0], layout.rooms[layout.rooms.length - 1]);
    if (rng() < 0.6) join(layout.rooms[1], layout.rooms[layout.rooms.length - 2]);
  }

  // ---- the way in and the way on ----------------------------------------
  const ent = layout.rooms[0];
  layout.entrance = { gx: ent.cx, gz: ent.cz };
  // the far room, so the stair is a walk and never the cell you arrived on
  if (level < top) layout.stair = { gx: hall.cx, gz: hall.cz };

  // ---- what is in the rock ----------------------------------------------
  const taken = (gx, gz) => (layout.entrance.gx === gx && layout.entrance.gz === gz)
    || (layout.stair && layout.stair.gx === gx && layout.stair.gz === gz);
  const tag = (gx, gz, what) => {
    if (!inside(layout, gx, gz) || layout.cells[gz * w + gx] !== FLOOR || taken(gx, gz) || layout.tags[gz * w + gx]) return false;
    layout.tags[gz * w + gx] = what;
    (what === 'ore' ? layout.ore : layout.chests).push(what === 'ore' ? { gx, gz, ore: layout.oreTier } : { gx, gz });
    return true;
  };
  // ore sits against a wall, where a seam would show. Ore cells stay walkable:
  // the rock stands on the tile, and a pocket that blocked the floor could wall
  // off a corridor the flood fill has already called reachable.
  if (kind === 'cave') {
    for (const r of layout.rooms) {
      const edge = [];
      for (let z = r.z - CAVE_BULGE; z < r.z + r.h + CAVE_BULGE; z++) {
        for (let x = r.x - CAVE_BULGE; x < r.x + r.w + CAVE_BULGE; x++) {
          if (!walkable(layout, x, z)) continue;
          if (ADJ.some(([dx, dz]) => !walkable(layout, x + dx, z + dz))) edge.push([x, z]);
        }
      }
      const pool = edge.length ? edge : [[r.cx, r.cz]];
      const n = 3 + ri(rng, 4);
      for (let i = 0; i < n; i++) { const p = pool[ri(rng, pool.length)]; tag(p[0], p[1], 'ore'); }
    }
    // a cave with nothing in it is a cave with no reason to be entered
    for (let guard = 0; layout.ore.length < 8 && guard < 400; guard++) {
      const r = layout.rooms[ri(rng, layout.rooms.length)];
      tag(r.x + ri(rng, r.w), r.z + ri(rng, r.h), 'ore');
    }
  } else {
    // the great hall is worth the walk, so the deep room is always paid for
    tag(hall.cx + 1, hall.cz + 1, 'chest');
    const n = 3 + ri(rng, 3);
    for (let guard = 0; layout.chests.length < n && guard < 400; guard++) {
      const r = layout.rooms[ri(rng, layout.rooms.length)];
      tag(r.x + ri(rng, r.w), r.z + ri(rng, r.h), 'chest');
    }
  }
  return layout;
}

/** What stands at a grid cell. Off the grid is rock: a level is sealed. */
export function cellAt(layout, gx, gz) {
  if (!inside(layout, gx, gz)) return 'rock';
  const i = idx(layout, gx, gz);
  if (layout.cells[i] !== FLOOR) return 'rock';
  const e = layout.entrance, s = layout.stair;
  if (e && e.gx === gx && e.gz === gz) return 'entrance';
  if (s && s.gx === gx && s.gz === gz) return 'stair';
  return layout.tags[i] || 'floor';
}

/** Can the player stand here? Everything but rock, and never off the grid. */
export function walkable(layout, gx, gz) {
  return inside(layout, gx, gz) && layout.cells[idx(layout, gx, gz)] === FLOOR;
}

/**
 * The room a cell belongs to, or null for a corridor. A cave bulge outside the
 * recorded rectangle reads as null too, which is what the ceiling wants: the
 * dome sits over the rectangle and the bulge is its low, ragged rim.
 */
export function roomAt(layout, gx, gz) {
  for (const r of layout.rooms) {
    if (gx >= r.x && gx < r.x + r.w && gz >= r.z && gz < r.z + r.h) return r;
  }
  return null;
}

/** Grid cell -> the metres of its centre. The grid is centred on the origin. */
export function worldOf(layout, gx, gz) {
  return { x: (gx - (layout.w - 1) / 2) * CELL, z: (gz - (layout.h - 1) / 2) * CELL };
}

/** Metres -> the grid cell containing them. */
export function gridOf(layout, x, z) {
  return { gx: Math.round(x / CELL + (layout.w - 1) / 2), gz: Math.round(z / CELL + (layout.h - 1) / 2) };
}

/**
 * Keep a point out of the rock. A point already standing on floor is returned
 * untouched, so walking across an open room is free; a point that has crossed
 * into rock is put at the centre of the nearest floor cell, searched outward in
 * rings so "nearest" means nearest and not "the first one I found".
 */
export function clampToWalkable(layout, x, z) {
  const { gx, gz } = gridOf(layout, x, z);
  if (walkable(layout, gx, gz)) return { x, z, moved: false };
  const span = Math.max(layout.w, layout.h);
  let best = null, bestD = Infinity;
  for (let r = 1; r <= span; r++) {
    // square rings are not distance order past r = 2: a diagonal three cells
    // out is farther than a straight four. So the search does not stop at the
    // first ring with a floor cell in it, it stops once no later ring can beat
    // what it already has.
    if (best && (r - 1) * CELL > bestD) break;
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;   // the ring, not the block
      const cx = gx + dx, cz = gz + dz;
      if (!walkable(layout, cx, cz)) continue;
      const p = worldOf(layout, cx, cz);
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bestD) { bestD = d; best = p; }
    }
  }
  if (best) return { x: best.x, z: best.z, moved: true };
  const e = worldOf(layout, layout.entrance.gx, layout.entrance.gz);
  return { x: e.x, z: e.z, moved: true };
}

/** Every cell reachable on foot from (gx, gz), as a Set of grid indices. */
export function floodFrom(layout, gx, gz) {
  const seen = new Set();
  if (!walkable(layout, gx, gz)) return seen;
  const stack = [[gx, gz]];
  seen.add(idx(layout, gx, gz));
  while (stack.length) {
    const [x, z] = stack.pop();
    for (const [dx, dz] of ADJ) {
      const nx = x + dx, nz = z + dz;
      if (!walkable(layout, nx, nz)) continue;
      const i = idx(layout, nx, nz);
      if (seen.has(i)) continue;
      seen.add(i); stack.push([nx, nz]);
    }
  }
  return seen;
}
