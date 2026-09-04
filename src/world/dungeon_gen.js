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

import { hash2, mulberry32 } from './noise.js';

export const CELL = 2;        // metres across one grid cell
export const MAX_GRID = 48;   // no level is ever wider or deeper than this
export const ROCK = 0, FLOOR = 1;

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
  const grow = (level - 1) * 3;
  const w = Math.min(MAX_GRID, (kind === 'cave' ? 26 : 30) + ri(rng, kind === 'cave' ? 8 : 12) + grow);
  const h = Math.min(MAX_GRID, (kind === 'cave' ? 26 : 30) + ri(rng, kind === 'cave' ? 8 : 12) + grow);

  const layout = {
    kind, level, top, w, h, cellSize: CELL,
    id: site.id, name: site.name, cx: site.cx, cz: site.cz, seed,
    cells: new Array(w * h).fill(ROCK),
    rooms: [], entrance: null, stair: null, tags: {}, ore: [], chests: [],
  };
  const set = (gx, gz) => {
    // a one cell rim of rock is never carved: every level is sealed
    if (gx < 1 || gz < 1 || gx > w - 2 || gz > h - 2) return;
    layout.cells[gz * w + gx] = FLOOR;
  };

  // ---- rooms -------------------------------------------------------------
  const minR = 3, maxR = kind === 'cave' ? 6 : 8;
  const want = (kind === 'cave' ? 5 : 6) + ri(rng, 4) + (level - 1);
  const fits = (r) => !layout.rooms.some((o) =>
    r.x - 1 <= o.x + o.w && o.x - 1 <= r.x + r.w && r.z - 1 <= o.z + o.h && o.z - 1 <= r.z + r.h);
  for (let t = 0; t < 90 && layout.rooms.length < want; t++) {
    const rw = minR + ri(rng, maxR - minR + 1), rh = minR + ri(rng, maxR - minR + 1);
    const r = { x: 1 + ri(rng, w - rw - 2), z: 1 + ri(rng, h - rh - 2), w: rw, h: rh };
    r.cx = r.x + (r.w >> 1); r.cz = r.z + (r.h >> 1);
    if (!fits(r)) continue;
    layout.rooms.push(r);
  }
  // A level with one room has no stair that is not the entrance. Ninety tries
  // on a 26 m grid have never produced fewer than four, but a level that came
  // out unusable must say so rather than ship a staircase under the player.
  if (layout.rooms.length < 2) throw new Error(`dungeon ${site.id} level ${level}: only ${layout.rooms.length} room(s) placed`);
  for (const r of layout.rooms) for (let z = r.z; z < r.z + r.h; z++) for (let x = r.x; x < r.x + r.w; x++) set(x, z);

  // ---- corridors ---------------------------------------------------------
  // room i to room i-1, so the chain is connected by construction. A cave's
  // corridors wander a cell wide and swell now and then; a dungeon's are square.
  const carveH = (x0, x1, z) => { for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) { set(x, z); if (kind === 'cave' && rng() < 0.35) set(x, z + (rng() < 0.5 ? 1 : -1)); } };
  const carveV = (z0, z1, x) => { for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) { set(x, z); if (kind === 'cave' && rng() < 0.35) set(x + (rng() < 0.5 ? 1 : -1), z); } };
  const join = (a, b) => {
    if (rng() < 0.5) { carveH(a.cx, b.cx, a.cz); carveV(a.cz, b.cz, b.cx); }
    else { carveV(a.cz, b.cz, a.cx); carveH(a.cx, b.cx, b.cz); }
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
  if (level < top) {
    // the far room, so the stair is a walk and never the cell you arrived on
    let best = null, bestD = -1;
    for (let i = 1; i < layout.rooms.length; i++) {
      const r = layout.rooms[i];
      const d = Math.hypot(r.cx - ent.cx, r.cz - ent.cz);
      if (d > bestD) { bestD = d; best = r; }
    }
    layout.stair = { gx: best.cx, gz: best.cz };
  }

  // ---- what is in the rock ----------------------------------------------
  const taken = (gx, gz) => (layout.entrance.gx === gx && layout.entrance.gz === gz)
    || (layout.stair && layout.stair.gx === gx && layout.stair.gz === gz);
  const tag = (gx, gz, what) => {
    if (!inside(layout, gx, gz) || layout.cells[gz * w + gx] !== FLOOR || taken(gx, gz) || layout.tags[gz * w + gx]) return false;
    layout.tags[gz * w + gx] = what;
    (what === 'ore' ? layout.ore : layout.chests).push({ gx, gz });
    return true;
  };
  // ore sits against a wall, where a seam would show. Ore cells stay walkable:
  // the rock stands on the tile, and a pocket that blocked the floor could wall
  // off a corridor the flood fill has already called reachable.
  if (kind === 'cave') {
    for (const r of layout.rooms) {
      const edge = [];
      for (let z = r.z; z < r.z + r.h; z++) for (let x = r.x; x < r.x + r.w; x++) {
        if (!walkable(layout, x - 1, z) || !walkable(layout, x + 1, z) || !walkable(layout, x, z - 1) || !walkable(layout, x, z + 1)) edge.push([x, z]);
      }
      const pool = edge.length ? edge : [[r.cx, r.cz]];
      const n = 2 + ri(rng, 3);
      for (let i = 0; i < n; i++) { const p = pool[ri(rng, pool.length)]; tag(p[0], p[1], 'ore'); }
    }
    // a cave with nothing in it is a cave with no reason to be entered
    for (let guard = 0; layout.ore.length < 6 && guard < 200; guard++) {
      const r = layout.rooms[ri(rng, layout.rooms.length)];
      tag(r.x + ri(rng, r.w), r.z + ri(rng, r.h), 'ore');
    }
  } else {
    const n = 2 + ri(rng, 2);
    for (let guard = 0; layout.chests.length < n && guard < 200; guard++) {
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
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      if (!walkable(layout, nx, nz)) continue;
      const i = idx(layout, nx, nz);
      if (seen.has(i)) continue;
      seen.add(i); stack.push([nx, nz]);
    }
  }
  return seen;
}
