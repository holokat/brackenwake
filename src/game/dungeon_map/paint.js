import { CELL, worldOf, walkable } from '../../world/dungeon_gen.js';
import { pxOf } from '../minimap.js';
import { unexploredEdges } from './exploration.js';

export const MAP_COLOURS = {
  unknown: '#0c1014', remembered: '#555957', visible: '#929080',
  wall: '#252e32', outline: '#c3bb97', stair: '#a8d9d3',
};

/** Paint only remembered geometry. Unknown rooms, loot and enemies are omitted. */
export function paintDungeonMap(ctx, exploration, view, dpr = 1) {
  const { layout: L, seen, visible } = exploration, size = view.size;
  ctx.save(); ctx.scale(dpr, dpr);
  ctx.fillStyle = MAP_COLOURS.unknown; ctx.fillRect(0, 0, size, size);
  ctx.beginPath(); ctx.rect(0, 0, size, size); ctx.clip();
  const cellPx = CELL / view.mpp;
  const minX = Math.max(0, Math.floor((view.cx - view.span / 2) / CELL + L.w / 2));
  const minZ = Math.max(0, Math.floor((view.cz - view.span / 2) / CELL + L.h / 2));
  const maxX = Math.min(L.w - 1, Math.ceil((view.cx + view.span / 2) / CELL + L.w / 2));
  const maxZ = Math.min(L.h - 1, Math.ceil((view.cz + view.span / 2) / CELL + L.h / 2));
  let floorCells = 0;
  const frontiers = [], walls = [];
  for (let gz = minZ; gz <= maxZ; gz++) for (let gx = minX; gx <= maxX; gx++) {
    const i = gz * L.w + gx;
    if (!seen[i]) continue;
    const p = worldOf(L, gx, gz), [x, z] = pxOf(view, p.x - CELL / 2, p.z - CELL / 2);
    const floor = walkable(L, gx, gz);
    ctx.fillStyle = floor ? visible[i] ? MAP_COLOURS.visible : MAP_COLOURS.remembered : MAP_COLOURS.wall;
    ctx.fillRect(x, z, cellPx + .3, cellPx + .3);
    if (floor) {
      floorCells++;
      for (const [dx, dz] of unexploredEdges(exploration, gx, gz))
        frontiers.push([x + (1 + dx) * cellPx / 2, z + (1 + dz) * cellPx / 2]);
    } else walls.push([x, z]);
  }
  if (frontiers.length) {
    const radius = Math.max(2, Math.min(24, cellPx * 2.5));
    // Overlapping radial gradients soften both straight and stair-stepped edges.
    // Their centres meet the unknown, with clear floor toward the interior.
    for (const [x, z] of frontiers) {
      const fade = ctx.createRadialGradient(x, z, 0, x, z, radius);
      fade.addColorStop(0, MAP_COLOURS.unknown);
      fade.addColorStop(.22, MAP_COLOURS.unknown);
      fade.addColorStop(.5, `${MAP_COLOURS.unknown}80`);
      fade.addColorStop(1, `${MAP_COLOURS.unknown}00`);
      ctx.fillStyle = fade;
      ctx.fillRect(x - radius, z - radius, radius * 2, radius * 2);
    }
    // The fade matches the opaque unknown background, so it cannot reveal it.
    // Restore known walls once instead of clipping every gradient to a large path.
    ctx.fillStyle = MAP_COLOURS.wall;
    for (const [x, z] of walls) ctx.fillRect(x, z, cellPx + .3, cellPx + .3);
  }
  // Draw edges after floors, so neighbouring cells cannot paint over them.
  for (let gz = minZ; gz <= maxZ; gz++) for (let gx = minX; gx <= maxX; gx++) {
    const i = gz * L.w + gx;
    if (!seen[i] || !walkable(L, gx, gz)) continue;
    const p = worldOf(L, gx, gz), [x, z] = pxOf(view, p.x, p.z), half = cellPx / 2;
    for (const [dx, dz] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const nx = gx + dx, nz = gz + dz;
      if (walkable(L, nx, nz) || !seen[nz * L.w + nx]) continue;
      ctx.strokeStyle = MAP_COLOURS.outline; ctx.lineWidth = .7;
      ctx.beginPath();
      ctx.moveTo(x + dx * half - dz * half, z + dz * half - dx * half);
      ctx.lineTo(x + dx * half + dz * half, z + dz * half + dx * half);
      ctx.stroke();
    }
  }
  const stairs = [];
  for (const [kind, cell] of [['up', L.entrance], ['down', L.stair]]) {
    if (!cell || !seen[cell.gz * L.w + cell.gx]) continue;
    const p = worldOf(L, cell.gx, cell.gz), [x, z] = pxOf(view, p.x, p.z);
    if (x < 9 || z < 26 || x > size - 9 || z > size - 8) continue;
    ctx.fillStyle = MAP_COLOURS.unknown; ctx.fillRect(x - 7, z - 7, 14, 14);
    ctx.strokeStyle = MAP_COLOURS.stair; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x - 5, z + 4); ctx.lineTo(x - 2, z + 4);
    ctx.lineTo(x - 2, z + 1); ctx.lineTo(x + 1, z + 1); ctx.lineTo(x + 1, z - 2);
    ctx.lineTo(x + 5, z - 2); ctx.stroke();
    ctx.font = '10px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = MAP_COLOURS.stair;
    ctx.fillText(kind === 'up' ? '↑' : '↓', x + 9, z + 3);
    stairs.push(kind);
  }
  ctx.font = '10px sans-serif'; ctx.fillStyle = '#b8c0c4'; ctx.textAlign = 'left';
  ctx.fillText('N', 8, 36);
  const metres = view.span >= 200 ? 50 : view.span >= 100 ? 20 : 10;
  const bar = metres / view.mpp;
  ctx.strokeStyle = '#899597'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(8, size - 10); ctx.lineTo(8 + bar, size - 10); ctx.stroke();
  ctx.font = '9px sans-serif'; ctx.fillText(`${metres} m`, 8, size - 15);
  ctx.restore();
  return { floorCells, frontiers: frontiers.length, stairs, view };
}
