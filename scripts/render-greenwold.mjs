// Render the sculpted Greenwold in the painting's own frame, so the two can
// be laid side by side and judged zone by zone.
//
//   node scripts/render-greenwold.mjs [outDir]
//
// Reads public/terrain/greenwold.json and every src/mmo/spaces/greenwold_*
// space through the same field and edit list the game uses, samples the ground
// at every pixel of a half-size sheet (836 by 471, one pixel is 5.6 m), and
// writes:
//
//   <outDir>/greenwold.render.png      the sculpt, top down, north up
//   <outDir>/greenwold.painting.png    the painting at the same size
//   <outDir>/zone-<id>.png             painting | render, cropped to the zone
//   <outDir>/REPORT.md                 what was measured per zone
//
// Colour: ground by its painted word, water blue, hillshade from the sampled
// heights with the light in the north west. Over that, the spaces: trees as
// dark green dots (conifers darker), wheat rows as gold, other pieces as rust,
// wall and fence runs as grey lines, lanes as tan lines, markers as magenta.
//
// The PNG work is ImageMagick's (`magick`), because node has no image codec
// and the point of this file is a picture a person can look at, not a number.
// Without `magick` on the path it still writes the PPMs and the report.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createTerrainEdits } from '../src/world/terrain_edits.js';
import { createWorldField } from '../src/world/field.js';
import { SPACES } from '../src/mmo/spaces/index.js';
import { GUIDE_ART, GUIDE_ZONES, GUIDE_RIVER, GUIDE_ROADS, imageToWorld, worldToImage } from '../src/mmo/greenwold_guide.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUT = resolve(process.argv[2] || join(ROOT, 'docs', 'concepts', 'greenwold', 'render'));
mkdirSync(OUT, { recursive: true });

const SEED = 20260904;
const TERRAIN = JSON.parse(readFileSync(join(ROOT, 'public', 'terrain', 'greenwold.json'), 'utf8'));
const field = createWorldField(SEED, { homeBiome: 'meadow', homeY: -0.3 });
const EDITS = createTerrainEdits({ baseHeight: (x, z) => field.heightAt(x, z) });
EDITS.load(TERRAIN);
field.setTerrainEdits(EDITS);

// half the sheet: the painting is 1672 by 941
const W = 836, H = 471;
const uOf = (px) => (px + 0.5) / W, vOf = (py) => (py + 0.5) / H;
const pxOf = (u) => u * W, pyOf = (v) => v * H;
const M_PER_PX = (GUIDE_ART.metresPerPixel.x * 2 + GUIDE_ART.metresPerPixel.z * 2) / 2;

// ---- sample the ground ------------------------------------------------------
const hs = new Float32Array(W * H);
const wet = new Uint8Array(W * H);
const word = new Array(W * H);
const t0 = Date.now();
for (let py = 0; py < H; py++) {
  for (let px = 0; px < W; px++) {
    const [x, z] = imageToWorld(uOf(px), vOf(py));
    const s = field.sampleAt(x, z);
    const i = py * W + px;
    hs[i] = s.h;
    wet[i] = s.water ? 1 : 0;
    word[i] = s.ground || 'grass';
  }
}
const sampleMs = Date.now() - t0;

// ---- paint it ---------------------------------------------------------------
const GROUND = {
  grass: [111, 154, 60], path: [184, 160, 106], cobble: [143, 138, 128], dirt: [139, 106, 63],
  mud: [94, 74, 48], rock: [138, 132, 120], sand: [217, 198, 138], gravel: [163, 154, 136],
  snow: [242, 242, 240], ash: [85, 85, 85],
};
const WATER = [63, 127, 184];
const rgb = new Uint8Array(W * H * 3);
const hAt = (px, py) => hs[Math.min(H - 1, Math.max(0, py)) * W + Math.min(W - 1, Math.max(0, px))];
let hMin = Infinity, hMax = -Infinity;
for (let i = 0; i < W * H; i++) { if (hs[i] < hMin) hMin = hs[i]; if (hs[i] > hMax) hMax = hs[i]; }
for (let py = 0; py < H; py++) {
  for (let px = 0; px < W; px++) {
    const i = py * W + px;
    let c = wet[i] ? WATER : (GROUND[word[i]] || GROUND.grass);
    // hillshade: light from the north west, normal from the height gradient
    // the slope is exaggerated four times, the way a relief map does it, so a
    // sixty metre down reads as a down and not as a blush
    const dx = 4 * (hAt(px + 1, py) - hAt(px - 1, py)) / (2 * M_PER_PX);
    const dz = 4 * (hAt(px, py + 1) - hAt(px, py - 1)) / (2 * M_PER_PX);
    const nx = -dx, ny = 1, nz = -dz;
    const nl = Math.hypot(nx, ny, nz);
    const lx = -0.5, ly = 0.7, lz = -0.5;
    const ll = Math.hypot(lx, ly, lz);
    const lit = Math.max(0, (nx * lx + ny * ly + nz * lz) / (nl * ll));
    const shade = wet[i] ? 1 : 0.45 + 0.75 * lit;
    // a hint of the height itself, so a plateau reads paler than a hollow
    const tint = wet[i] ? 0 : ((hs[i] - hMin) / Math.max(1, hMax - hMin)) * 28;
    rgb[i * 3] = Math.min(255, c[0] * shade + tint);
    rgb[i * 3 + 1] = Math.min(255, c[1] * shade + tint);
    rgb[i * 3 + 2] = Math.min(255, c[2] * shade + tint * 0.6);
  }
}

// ---- the spaces on top ------------------------------------------------------
function dot(x, z, col, r = 1) {
  const [u, v] = worldToImage(x, z);
  const cx = Math.round(pxOf(u)), cy = Math.round(pyOf(v));
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (dx * dx + dy * dy > r * r + 0.5) continue;
    const px = cx + dx, py = cy + dy;
    if (px < 0 || py < 0 || px >= W || py >= H) continue;
    const i = (py * W + px) * 3;
    rgb[i] = col[0]; rgb[i + 1] = col[1]; rgb[i + 2] = col[2];
  }
}
function line(x0, z0, x1, z1, col) {
  const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / (M_PER_PX * 0.5)));
  for (let k = 0; k <= n; k++) dot(x0 + (x1 - x0) * k / n, z0 + (z1 - z0) * k / n, col, 0);
}
const CONIFER = /pine|spruce|fir|yew|cedar/i;
const counts = { spaces: 0, trees: 0, pieces: 0, wheat: 0, runs: 0, areas: 0, markers: 0 };
for (const s of Object.values(SPACES)) {
  if (!s || !s.at || !/^greenwold_/.test(s.id)) continue;
  counts.spaces++;
  const at = s.at;
  for (const a of s.areas || []) {
    const pts = a.points || [];
    for (let k = 1; k < pts.length; k++) line(at.x + pts[k - 1][0], at.z + pts[k - 1][1], at.x + pts[k][0], at.z + pts[k][1], a.kind === 'lane' ? [200, 176, 120] : [150, 140, 100]);
    counts.areas++;
  }
  for (const r of s.runs || []) { line(at.x + r.from.x, at.z + r.from.z, at.x + r.to.x, at.z + r.to.z, [120, 118, 112]); counts.runs++; }
  for (const p of s.pieces || []) {
    const isWheat = /wheat|barley|furrow|hay/.test(p.model || '');
    dot(at.x + p.x, at.z + p.z, isWheat ? [215, 182, 74] : [160, 69, 42], isWheat ? 1 : 1);
    counts.pieces++; if (isWheat) counts.wheat++;
  }
  for (const t of s.trees || []) { dot(at.x + t.x, at.z + t.z, CONIFER.test(t.species || '') ? [26, 62, 30] : [38, 92, 40], 1); counts.trees++; }
  for (const k of s.rocks || []) {
    const crop = /wheat|barley|furrow/.test(k.kind || '');
    dot(at.x + k.x, at.z + k.z, crop ? [215, 182, 74] : /reed/.test(k.kind || '') ? [120, 140, 60] : [110, 100, 90], 0);
    if (crop) counts.wheat++;
  }
  for (const m of s.markers || []) { dot(at.x + m.x, at.z + m.z, [220, 40, 200], 1); counts.markers++; }
}

// ---- the guide's own lines, faint, so a drift shows ---------------------------
for (const road of GUIDE_ROADS) {
  const pts = road.pts || [];
  for (let k = 1; k < pts.length; k++) {
    const a = pts[k - 1], b = pts[k];
    const ax = a.x ?? a[0], az = a.z ?? a[1], bx = b.x ?? b[0], bz = b.z ?? b[1];
    if ([ax, az, bx, bz].every(Number.isFinite)) line(ax, az, bx, bz, [255, 230, 170]);
  }
}

// ---- write the sheet ---------------------------------------------------------
const ppm = join(OUT, 'greenwold.render.ppm');
writeFileSync(ppm, Buffer.concat([Buffer.from(`P6\n${W} ${H}\n255\n`), Buffer.from(rgb)]));
const magick = spawnSync('magick', ['-version']).status === 0;
const run = (args) => { const r = spawnSync('magick', args, { stdio: 'inherit' }); if (r.status !== 0) throw new Error(`magick ${args[0]} failed`); };
const painting = join(ROOT, GUIDE_ART.file);
// a label needs a font file magick can open; without one the crop is unlabelled
const FONT = ['/System/Library/Fonts/Supplemental/Arial.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'].find((f) => existsSync(f));
const report = [];
report.push('# The sculpt beside the painting');
report.push('');
report.push(`Rendered ${new Date().toISOString().slice(0, 10)} by scripts/render-greenwold.mjs from public/terrain/greenwold.json (${TERRAIN.strokes.length} strokes) and ${counts.spaces} greenwold spaces: ${counts.trees} trees, ${counts.pieces} pieces (${counts.wheat} of them crop), ${counts.runs} runs, ${counts.areas} areas, ${counts.markers} markers. ${W} by ${H}, ${M_PER_PX.toFixed(1)} m a pixel, sampled in ${(sampleMs / 1000).toFixed(1)} s. Heights ${hMin.toFixed(1)} to ${hMax.toFixed(1)} m.`);
report.push('');
if (magick) {
  run([ppm, join(OUT, 'greenwold.render.png')]);
  if (existsSync(painting)) run([painting, '-resize', `${W}x${H}!`, join(OUT, 'greenwold.painting.png')]);
} else {
  report.push('ImageMagick was not on the path, so only the PPM and this report were written.');
}

// ---- per zone: painting | render, and the numbers -----------------------------
report.push('| zone | centre (x, z) | height at centre | water within r | ground words within r | trees | pieces |');
report.push('|---|---|---|---|---|---|---|');
for (const g of GUIDE_ZONES) {
  const r = g.annulus ? 1100 : g.r;
  const cx = pxOf(g.u), cy = pyOf(g.v);
  const rp = Math.max(30, Math.round(r / M_PER_PX));
  const x0 = Math.max(0, Math.round(cx - rp)), y0 = Math.max(0, Math.round(cy - rp));
  const x1 = Math.min(W, Math.round(cx + rp)), y1 = Math.min(H, Math.round(cy + rp));
  const cw = x1 - x0, ch = y1 - y0;
  // measure inside the disc
  let n = 0, wetN = 0; const words = new Map();
  for (let py = y0; py < y1; py++) for (let px = x0; px < x1; px++) {
    if (Math.hypot(px - cx, py - cy) > rp) continue;
    const i = py * W + px; n++; if (wet[i]) wetN++;
    words.set(word[i], (words.get(word[i]) || 0) + 1);
  }
  const wordList = [...words.entries()].sort((a, b) => b[1] - a[1]).map(([w, c]) => `${w} ${Math.round(100 * c / n)}%`).join(', ');
  let trees = 0, pieces = 0;
  for (const s of Object.values(SPACES)) {
    if (!s || !s.at || !/^greenwold_/.test(s.id)) continue;
    for (const t of s.trees || []) if (Math.hypot(s.at.x + t.x - g.x, s.at.z + t.z - g.z) <= r) trees++;
    for (const p of s.pieces || []) if (Math.hypot(s.at.x + p.x - g.x, s.at.z + p.z - g.z) <= r) pieces++;
  }
  report.push(`| ${g.name} | ${g.x.toFixed(0)}, ${g.z.toFixed(0)} | ${field.heightAt(g.x, g.z).toFixed(1)} m | ${(100 * wetN / Math.max(1, n)).toFixed(1)}% | ${wordList} | ${trees} | ${pieces} |`);
  if (magick && existsSync(painting)) {
    const scale = Math.max(1, Math.round(400 / cw));
    const geom = `${cw}x${ch}+${x0}+${y0}`;
    run([
      '(', join(OUT, 'greenwold.painting.png'), '-crop', geom, '+repage', '-scale', `${scale * 100}%`, ')',
      '(', join(OUT, 'greenwold.render.png'), '-crop', geom, '+repage', '-scale', `${scale * 100}%`, ')',
      '+append', '-gravity', 'North', '-background', '#222', '-splice', '0x26',
      ...(FONT ? ['-font', FONT, '-fill', 'white', '-pointsize', '18', '-annotate', '+0+4', `${g.name}: painting (left) and sculpt (right), ${(2 * r).toFixed(0)} m across`] : []),
      join(OUT, `zone-${g.id}.png`),
    ]);
  }
}
report.push('');
report.push('Each zone-<id>.png is the painting on the left and the sculpt on the right, the same crop of the same frame. North is up on both.');
writeFileSync(join(OUT, 'REPORT.md'), report.join('\n') + '\n');
console.log(report.join('\n'));
