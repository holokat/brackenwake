#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { cornersOf, rectOf } from '../src/mmo/plans/plan_schema.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const spacePath = resolve(ROOT, process.argv[2] || 'src/mmo/spaces/island_town.json');
const within = Number(process.argv[3] || 10);
const space = JSON.parse(readFileSync(spacePath, 'utf8'));

const round = (n) => Math.round(n * 100) / 100;
const fmt = (n) => Number.isFinite(n) ? n.toFixed(2) : 'n/a';
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

function pointToSegmentDistance(p, a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len2 = dx * dx + dz * dz;
  if (!len2) return dist(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / len2));
  return Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t));
}

function pointToRectDistance(p, r) {
  const c = Math.cos(-r.a);
  const s = Math.sin(-r.a);
  const dx = p.x - r.x;
  const dz = p.z - r.z;
  const lx = dx * c + dz * s;
  const lz = dz * c - dx * s;
  const ox = Math.max(Math.abs(lx) - r.hw, 0);
  const oz = Math.max(Math.abs(lz) - r.hd, 0);
  return Math.hypot(ox, oz);
}

function pointInPoly(p, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = { x: pts[i][0], z: pts[i][1] };
    const b = { x: pts[j][0], z: pts[j][1] };
    const crosses = (a.z > p.z) !== (b.z > p.z);
    if (crosses) {
      const x = (b.x - a.x) * (p.z - a.z) / (b.z - a.z) + a.x;
      if (p.x < x) inside = !inside;
    }
  }
  return inside;
}

function pointToAreaDistance(p, area) {
  const pts = area.points || [];
  if (!pts.length) return Infinity;
  if (area.kind !== 'lane' && pts.length >= 3 && pointInPoly(p, pts)) return 0;
  let best = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) {
    best = Math.min(best, pointToSegmentDistance(p, { x: pts[i][0], z: pts[i][1] }, { x: pts[i + 1][0], z: pts[i + 1][1] }));
  }
  if (area.kind !== 'lane' && pts.length > 2) {
    best = Math.min(best, pointToSegmentDistance(p, { x: pts.at(-1)[0], z: pts.at(-1)[1] }, { x: pts[0][0], z: pts[0][1] }));
  }
  return Math.max(0, best - ((area.kind === 'lane' ? area.w : 0) || 0) / 2);
}

const gateIndex = (space.pieces || []).findIndex((p) => p.model === 'gate_tower');
if (gateIndex < 0) throw new Error(`${space.id}: no gate_tower piece`);
const gate = space.pieces[gateIndex];
const gatePoint = { x: gate.x, z: gate.z };

const rows = [];
function add(row) {
  const clearM = row.clearM ?? row.centerM;
  if (row.centerM <= within || clearM <= within) rows.push({ ...row, clearM });
}

for (const [i, piece] of (space.pieces || []).entries()) {
  const r = rectOf(piece);
  const centerM = dist(gatePoint, piece);
  const clearM = r ? pointToRectDistance(gatePoint, r) : centerM;
  add({
    kind: 'piece',
    index: i,
    name: piece.model,
    x: piece.x,
    z: piece.z,
    yaw: piece.yaw || 0,
    centerM,
    clearM,
  });
}

for (const [i, run] of (space.runs || []).entries()) {
  const center = { x: (run.from.x + run.to.x) / 2, z: (run.from.z + run.to.z) / 2 };
  add({
    kind: 'run',
    index: i,
    name: run.model,
    x: round(center.x),
    z: round(center.z),
    yaw: null,
    centerM: dist(gatePoint, center),
    clearM: pointToSegmentDistance(gatePoint, run.from, run.to),
  });
}

for (const [i, area] of (space.areas || []).entries()) {
  const pts = area.points || [];
  const center = pts.reduce((a, p) => ({ x: a.x + p[0] / pts.length, z: a.z + p[1] / pts.length }), { x: 0, z: 0 });
  add({
    kind: 'area',
    index: i,
    name: area.kind,
    x: round(center.x),
    z: round(center.z),
    yaw: null,
    centerM: dist(gatePoint, center),
    clearM: pointToAreaDistance(gatePoint, area),
  });
}

for (const [list, label] of [['people', 'person'], ['trees', 'tree'], ['rocks', 'rock'], ['markers', 'marker'], ['stations', 'station']]) {
  for (const [i, item] of (space[list] || []).entries()) {
    const name = item.label || item.role || item.species || item.kind || item.id || list;
    add({
      kind: label,
      index: i,
      name,
      x: item.x,
      z: item.z,
      yaw: item.yaw ?? null,
      centerM: dist(gatePoint, item),
    });
  }
}

rows.sort((a, b) => a.clearM - b.clearM || a.centerM - b.centerM || a.kind.localeCompare(b.kind));

console.log(`${space.id}: gate_tower at (${gate.x}, ${gate.z}), yaw ${gate.yaw}`);
console.log(`Listing placed things within ${within} m by center distance or footprint/segment clearance.`);
for (const row of rows) {
  const yaw = row.yaw == null ? '' : ` yaw=${fmt(row.yaw)}`;
  console.log(`${row.kind}[${row.index}] ${row.name} at (${fmt(row.x)}, ${fmt(row.z)}) center=${fmt(row.centerM)}m clear=${fmt(row.clearM)}m${yaw}`);
}
console.log(`${rows.length} placed things listed.`);

