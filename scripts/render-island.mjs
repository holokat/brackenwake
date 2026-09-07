// A top down picture of the island world, for judging its shape before a
// walk: ground by paint word, sand under the beach line, water blue, a
// hillshade, and the spaces' trees, pieces and spawns as dots.
//   node scripts/render-island.mjs [out.png]
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createTerrainEdits } from '../src/world/terrain_edits.js';
import { createWorldField } from '../src/world/field.js';
import { SPACES } from '../src/mmo/spaces/index.js';
const OUT = process.argv[2] || 'island.png';
const T = JSON.parse(readFileSync('public/terrain/island.json', 'utf8'));
const f = createWorldField(20260908, { homeBiome: 'meadow', homeY: -0.3 });
const E = createTerrainEdits({ baseHeight: (x, z) => f.heightAt(x, z) }); E.load(T); f.setTerrainEdits(E);
const HALF = 720, W = 720, MPP = (2 * HALF) / W;
const hs = new Float32Array(W * W), wet = new Uint8Array(W * W), word = new Array(W * W);
for (let py = 0; py < W; py++) for (let px = 0; px < W; px++) {
  const x = -HALF + (px + 0.5) * MPP, z = -HALF + (py + 0.5) * MPP;
  const s = f.sampleAt(x, z); const i = py * W + px; hs[i] = s.h; wet[i] = s.water ? 1 : 0; word[i] = s.ground || (s.h < (T.base.beachLine ?? 1) ? 'sand' : 'grass');
}
const C = { grass: [111, 154, 60], path: [184, 160, 106], cobble: [143, 138, 128], dirt: [139, 106, 63], mud: [94, 74, 48], rock: [138, 132, 120], sand: [217, 198, 138], gravel: [163, 154, 136] };
const rgb = new Uint8Array(W * W * 3);
const hAt = (px, py) => hs[Math.min(W - 1, Math.max(0, py)) * W + Math.min(W - 1, Math.max(0, px))];
for (let py = 0; py < W; py++) for (let px = 0; px < W; px++) {
  const i = py * W + px; const c = wet[i] ? (hs[i] < -3 ? [40, 90, 150] : [70, 135, 190]) : (C[word[i]] || C.grass);
  const dx = 3 * (hAt(px + 1, py) - hAt(px - 1, py)) / (2 * MPP), dz = 3 * (hAt(px, py + 1) - hAt(px, py - 1)) / (2 * MPP);
  const nl = Math.hypot(dx, 1, dz); const lit = Math.max(0, (dx * 0.5 + 0.7 - dz * 0.5) / (nl * Math.hypot(0.5, 0.7, 0.5)));
  const sh = wet[i] ? 1 : 0.45 + 0.75 * lit; const tint = wet[i] ? 0 : Math.min(30, hs[i]) * 1.2;
  rgb[i * 3] = Math.min(255, c[0] * sh + tint); rgb[i * 3 + 1] = Math.min(255, c[1] * sh + tint); rgb[i * 3 + 2] = Math.min(255, c[2] * sh + tint * 0.6);
}
const dot = (x, z, col, r = 1) => { const cx = Math.round((x + HALF) / MPP), cy = Math.round((z + HALF) / MPP); for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) { const px = cx + dx, py = cy + dy; if (px < 0 || py < 0 || px >= W || py >= W) continue; const i = (py * W + px) * 3; rgb[i] = col[0]; rgb[i + 1] = col[1]; rgb[i + 2] = col[2]; } };
let n = { trees: 0, pieces: 0, spawns: 0 };
for (const s of Object.values(SPACES)) {
  if (!/^island_/.test(s.id)) continue;
  for (const t of s.trees || []) { dot(s.at.x + t.x, s.at.z + t.z, [30, 80, 35], 1); n.trees++; }
  for (const p of s.pieces || []) { dot(s.at.x + p.x, s.at.z + p.z, [160, 69, 42], 1); n.pieces++; }
  for (const r of s.runs || []) { const a = r.from, b = r.to; for (let k = 0; k <= 10; k++) dot(s.at.x + a.x + (b.x - a.x) * k / 10, s.at.z + a.z + (b.z - a.z) * k / 10, [120, 118, 112], 0); }
  for (const q of s.spawns || []) { dot(s.at.x + q.x, s.at.z + q.z, q.night ? [120, 40, 200] : [230, 40, 40], 2); n.spawns++; }
  for (const k of s.rocks || []) dot(s.at.x + k.x, s.at.z + k.z, /wheat|furrow/.test(k.kind) ? [215, 182, 74] : [110, 100, 90], 0);
}
writeFileSync('/tmp/island.ppm', Buffer.concat([Buffer.from(`P6\n${W} ${W}\n255\n`), Buffer.from(rgb)]));
spawnSync('magick', ['/tmp/island.ppm', OUT], { stdio: 'inherit' });
console.log(`wrote ${OUT}: ${MPP.toFixed(1)} m a pixel, ${n.trees} trees, ${n.pieces} pieces, ${n.spawns} placed spawns (red day, purple night)`);
