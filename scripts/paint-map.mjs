#!/usr/bin/env node
// Paints the world and each of the nine realms, and writes them to docs/maps/.
//
//   node scripts/paint-map.mjs                 the world and all nine realms
//   node scripts/paint-map.mjs world           just the world
//   node scripts/paint-map.mjs boneyard 2400   one realm, at a size
//
// It draws through `src/game/map_paint.js` and nothing else, so what lands in
// docs/maps is exactly what the game's map window gets when Fable wires the
// painter under it. If the `canvas` npm package is installed it writes PNGs; it
// is not a dependency of this game and nobody should add it for this, so the
// fallback is an SVG with the SAME drawing, written by the little context
// below. Open the SVG in any browser.
//
// The SVG writer supports exactly what the painter asks for: paths, rects,
// text, dashes, letter spacing and a transform. No gradient, no clip, no
// filter, no pattern and no image, because the painter never asks for one.

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const OUT = join(ROOT, 'docs', 'maps');

const { createWorldField } = await import('../src/world/field.js');
const { WORLD_SEED } = await import('../src/game/world_runtime.js').catch(() => ({ WORLD_SEED: 20260904 }));
const { REALM_ZONES, authoredSites } = await import('../src/world/zones.js');
const paint = await import('../src/game/map_paint.js');

// ---------------------------------------------------------------- colours --

/** A canvas colour string, split into something SVG will take and an alpha. */
function colourOf(v) {
  const s = String(v ?? '#000');
  const hex = (r, g, b) => '#' + [r, g, b].map((v) => (v | 0).toString(16).padStart(2, '0')).join('');
  let m = /^rgba\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)$/.exec(s);
  if (m) return [hex(+m[1], +m[2], +m[3]), +m[4]];
  m = /^rgb\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)$/.exec(s);
  if (m) return [hex(+m[1], +m[2], +m[3]), 1];
  return [s, 1];
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const r2 = (v) => (Math.round(v * 100) / 100);
// the ground lattice is regular and huge: a tenth of a pixel is more precision
// than any eye or any printer will ever ask of it, and it is a fifth of the file
const r1 = (v) => (Math.round(v * 10) / 10);

/** `600 24.0px 'Cinzel', Georgia, serif` taken apart the way SVG wants it. */
function fontOf(f) {
  const s = String(f || '12px serif');
  const m = /^(?:(\d{3}|bold|normal)\s+)?(?:(italic|oblique)\s+)?([\d.]+)px\s+(.*)$/.exec(s);
  if (!m) return { size: 12, family: 'serif', weight: null, style: null };
  return { weight: m[1] || null, style: m[2] || null, size: +m[3], family: m[4] };
}

// ------------------------------------------------------------ the context --

function svgContext(width, height) {
  const out = [];
  const st = () => ({
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, globalAlpha: 1,
    font: '12px serif', textAlign: 'start', textBaseline: 'alphabetic',
    lineCap: 'butt', lineJoin: 'miter', letterSpacing: '0px', dash: [],
    m: [1, 0, 0, 1, 0, 0],
  });
  let s = st();
  const stack = [];
  let path = [];           // list of { cmd, pts: [[x,y], ...] } already transformed
  let cur = null;
  let circle = undefined;  // a path that is one whole circle, so it can stay one
  let last = null;         // the last rect written, for run merging

  const tp = (x, y) => [s.m[0] * x + s.m[2] * y + s.m[4], s.m[1] * x + s.m[3] * y + s.m[5]];
  const scaleOf = () => Math.sqrt(Math.abs(s.m[0] * s.m[3] - s.m[1] * s.m[2])) || 1;
  const axis = () => Math.abs(s.m[1]) < 1e-9 && Math.abs(s.m[2]) < 1e-9;

  const dOf = () => {
    let d = '';
    for (const sub of path) {
      d += `M${r2(sub.pts[0][0])} ${r2(sub.pts[0][1])}`;
      for (const seg of sub.segs) {
        if (seg.k === 'L') d += `L${r2(seg.p[0])} ${r2(seg.p[1])}`;
        else if (seg.k === 'Q') d += `Q${r2(seg.c[0])} ${r2(seg.c[1])} ${r2(seg.p[0])} ${r2(seg.p[1])}`;
        else if (seg.k === 'C') d += `C${r2(seg.c1[0])} ${r2(seg.c1[1])} ${r2(seg.c2[0])} ${r2(seg.c2[1])} ${r2(seg.p[0])} ${r2(seg.p[1])}`;
      }
      if (sub.closed) d += 'Z';
    }
    return d;
  };
  const style = (fill) => {
    const [c, a] = colourOf(fill ? s.fillStyle : s.strokeStyle);
    const al = a * s.globalAlpha;
    let out = fill
      ? `fill="${c}"${al < 1 ? ` fill-opacity="${r2(al)}"` : ''}`
      : `fill="none" stroke="${c}"${al < 1 ? ` stroke-opacity="${r2(al)}"` : ''} stroke-width="${r2(s.lineWidth * scaleOf())}"`;
    if (!fill) {
      if (s.lineCap !== 'butt') out += ` stroke-linecap="${s.lineCap}"`;
      if (s.lineJoin !== 'miter') out += ` stroke-linejoin="${s.lineJoin}"`;
      if (s.dash.length) out += ` stroke-dasharray="${s.dash.map((v) => r2(v * scaleOf())).join(' ')}"`;
    }
    return out;
  };
  // The ground is a lattice of small rectangles, tens of thousands of them, and
  // one <rect> element each is four megabytes of angle brackets. They are
  // gathered by colour instead and written as one <path> per colour, which is
  // the same picture at a quarter of the size. The gather is flushed the moment
  // anything else is drawn, so nothing ever comes out in the wrong order.
  const bucket = new Map();
  const flushRects = () => {
    if (!bucket.size) return;
    for (const [k, b] of bucket) {
      const [c, a] = k.split('|');
      out.push(`<path fill="${c}"${+a < 1 ? ` fill-opacity="${a}"` : ''} d="${b.d.join('')}"/>`);
    }
    bucket.clear();
    last = null;
  };
  const emit = (str) => { flushRects(); out.push(str); last = null; };

  const g = {
    get fillStyle() { return s.fillStyle; }, set fillStyle(v) { s.fillStyle = v; },
    get strokeStyle() { return s.strokeStyle; }, set strokeStyle(v) { s.strokeStyle = v; },
    get lineWidth() { return s.lineWidth; }, set lineWidth(v) { s.lineWidth = v; },
    get globalAlpha() { return s.globalAlpha; }, set globalAlpha(v) { s.globalAlpha = v; },
    get font() { return s.font; }, set font(v) { s.font = v; },
    get textAlign() { return s.textAlign; }, set textAlign(v) { s.textAlign = v; },
    get textBaseline() { return s.textBaseline; }, set textBaseline(v) { s.textBaseline = v; },
    get lineCap() { return s.lineCap; }, set lineCap(v) { s.lineCap = v; },
    get lineJoin() { return s.lineJoin; }, set lineJoin(v) { s.lineJoin = v; },
    get letterSpacing() { return s.letterSpacing; }, set letterSpacing(v) { s.letterSpacing = v; },

    save() { stack.push({ ...s, m: s.m.slice(), dash: s.dash.slice() }); },
    restore() { if (stack.length) s = stack.pop(); },
    translate(x, y) { s.m = [s.m[0], s.m[1], s.m[2], s.m[3], s.m[0] * x + s.m[2] * y + s.m[4], s.m[1] * x + s.m[3] * y + s.m[5]]; },
    scale(x, y) { s.m = [s.m[0] * x, s.m[1] * x, s.m[2] * y, s.m[3] * y, s.m[4], s.m[5]]; },
    rotate(a) {
      const c = Math.cos(a), n = Math.sin(a);
      s.m = [s.m[0] * c + s.m[2] * n, s.m[1] * c + s.m[3] * n, s.m[0] * -n + s.m[2] * c, s.m[1] * -n + s.m[3] * c, s.m[4], s.m[5]];
    },
    setLineDash(d) { s.dash = Array.isArray(d) ? d.slice() : []; },
    getLineDash() { return s.dash.slice(); },

    beginPath() { path = []; cur = null; circle = undefined; },
    closePath() { if (cur) cur.closed = true; },
    moveTo(x, y) { circle = null; cur = { pts: [tp(x, y)], segs: [], closed: false }; path.push(cur); },
    lineTo(x, y) { circle = null; if (!cur) return g.moveTo(x, y); cur.segs.push({ k: 'L', p: tp(x, y) }); },
    quadraticCurveTo(cx, cy, x, y) { circle = null; if (!cur) g.moveTo(cx, cy); cur.segs.push({ k: 'Q', c: tp(cx, cy), p: tp(x, y) }); },
    bezierCurveTo(a, b, c, d, x, y) { circle = null; if (!cur) g.moveTo(a, b); cur.segs.push({ k: 'C', c1: tp(a, b), c2: tp(c, d), p: tp(x, y) }); },
    rect(x, y, w, h) {
      g.moveTo(x, y); g.lineTo(x + w, y); g.lineTo(x + w, y + h); g.lineTo(x, y + h); g.closePath(); cur = null;
    },
    arc(x, y, r, a0, a1, ccw) {
      let sweep = a1 - a0;
      if (ccw) { while (sweep > 0) sweep -= Math.PI * 2; } else { while (sweep < 0) sweep += Math.PI * 2; }
      // a whole circle on an empty path is a <circle>, not two hundred bytes of
      // flattened polygon. The map stipples a forest out of tens of thousands
      // of these and the difference is eight megabytes.
      if (circle === undefined && !path.length && Math.abs(Math.abs(sweep) - Math.PI * 2) < 1e-6) {
        const c = tp(x, y);
        circle = { x: c[0], y: c[1], r: r * scaleOf() };
        return;
      }
      circle = null;
      const n = Math.max(8, Math.min(96, Math.ceil((Math.abs(sweep) * Math.max(r, 1)) / 0.55)));
      for (let i = 0; i <= n; i++) {
        const a = a0 + (sweep * i) / n;
        const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
        if (i === 0 && !cur) g.moveTo(px, py); else g.lineTo(px, py);
      }
    },
    ellipse(x, y, rx, ry, rot, a0, a1, ccw) {
      circle = null;
      let sweep = a1 - a0;
      if (ccw) { while (sweep > 0) sweep -= Math.PI * 2; } else { while (sweep < 0) sweep += Math.PI * 2; }
      const n = Math.max(10, Math.min(96, Math.ceil((Math.abs(sweep) * Math.max(rx, ry, 1)) / 0.55)));
      const cr = Math.cos(rot || 0), sr = Math.sin(rot || 0);
      for (let i = 0; i <= n; i++) {
        const a = a0 + (sweep * i) / n;
        const ex = Math.cos(a) * rx, ey = Math.sin(a) * ry;
        const px = x + ex * cr - ey * sr, py = y + ex * sr + ey * cr;
        if (i === 0 && !cur) g.moveTo(px, py); else g.lineTo(px, py);
      }
    },
    fill() {
      if (circle) { emit(`<circle cx="${r2(circle.x)}" cy="${r2(circle.y)}" r="${r2(circle.r)}" ${style(true)}/>`); return; }
      if (path.length) emit(`<path ${style(true)} d="${dOf()}"/>`);
    },
    stroke() {
      if (circle) { emit(`<circle cx="${r2(circle.x)}" cy="${r2(circle.y)}" r="${r2(circle.r)}" ${style(false)}/>`); return; }
      if (path.length) emit(`<path ${style(false)} d="${dOf()}"/>`);
    },

    fillRect(x, y, w, h) {
      const [c, a] = colourOf(s.fillStyle);
      const al = a * s.globalAlpha;
      if (!axis()) {
        const p = [tp(x, y), tp(x + w, y), tp(x + w, y + h), tp(x, y + h)];
        emit(`<path fill="${c}"${al < 1 ? ` fill-opacity="${r2(al)}"` : ''} d="M${p.map((q) => `${r2(q[0])} ${r2(q[1])}`).join('L')}Z"/>`);
        return;
      }
      const [px, py] = tp(x, y);
      const pw = w * s.m[0], ph = h * s.m[3];
      const key = `${c}|${r2(al)}`;
      let b = bucket.get(key);
      if (!b) { b = { d: [] }; bucket.set(key, b); }
      // one long run of sea is one move and one horizontal, not four hundred
      if (last && last.k === key && Math.abs(last.y - py) < 0.02
        && Math.abs(last.h - ph) < 0.02 && Math.abs(last.x + last.w - px) < 0.7) {
        last.w = px + pw - last.x;
        last.b.d[last.i] = `M${r1(last.x)} ${r1(last.y)}h${r1(last.w)}v${r1(last.h)}h${r1(-last.w)}z`;
        return;
      }
      b.d.push(`M${r1(px)} ${r1(py)}h${r1(pw)}v${r1(ph)}h${r1(-pw)}z`);
      last = { k: key, b, i: b.d.length - 1, x: px, y: py, w: pw, h: ph };
    },
    strokeRect(x, y, w, h) { g.beginPath(); g.rect(x, y, w, h); g.stroke(); },
    clearRect() {},

    measureText(t) {
      const f = fontOf(s.font);
      const track = parseFloat(s.letterSpacing) || 0;
      return { width: String(t).length * f.size * 0.56 + String(t).length * track };
    },
    fillText(t, x, y) { text(t, x, y, true); },
    strokeText(t, x, y) { text(t, x, y, false); },
  };

  function text(t, x, y, fill) {
    const f = fontOf(s.font);
    const anchor = s.textAlign === 'center' ? 'middle' : s.textAlign === 'right' || s.textAlign === 'end' ? 'end' : 'start';
    const base = s.textBaseline === 'middle' ? ' dominant-baseline="central"'
      : s.textBaseline === 'top' ? ' dominant-baseline="hanging"' : '';
    const track = parseFloat(s.letterSpacing) || 0;
    const [c, a] = colourOf(fill ? s.fillStyle : s.strokeStyle);
    const al = a * s.globalAlpha;
    const paintAttr = fill
      ? `fill="${c}"${al < 1 ? ` fill-opacity="${r2(al)}"` : ''}`
      : `fill="none" stroke="${c}"${al < 1 ? ` stroke-opacity="${r2(al)}"` : ''} stroke-width="${r2(s.lineWidth * scaleOf())}" stroke-linejoin="round"`;
    const tf = axis() && Math.abs(s.m[0] - 1) < 1e-9 && Math.abs(s.m[3] - 1) < 1e-9
      ? ''
      : ` transform="matrix(${s.m.map(r2).join(' ')})"`;
    emit(`<text x="${r2(x)}" y="${r2(y)}"${tf} text-anchor="${anchor}"${base} font-family="${esc(f.family)}" font-size="${r2(f.size)}"${f.weight ? ` font-weight="${f.weight}"` : ''}${track ? ` letter-spacing="${r2(track)}"` : ''} ${paintAttr}>${esc(t)}</text>`);
  }

  g.toSVG = () => (flushRects(), `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">
<rect width="${width}" height="${height}" fill="#e7d6b2"/>
<g shape-rendering="auto">
${out.join('\n')}
</g>
</svg>
`);
  g.elements = () => { flushRects(); return out.length; };
  return g;
}

// ------------------------------------------------------------------- draw --

let Canvas = null;
try { Canvas = (await import('canvas')).default || (await import('canvas')); } catch { Canvas = null; }

function contextFor(w, h) {
  if (Canvas && typeof Canvas.createCanvas === 'function') {
    const c = Canvas.createCanvas(w, h);
    const g = c.getContext('2d');
    return { g, kind: 'png', save: (p) => writeFileSync(p, c.toBuffer('image/png')) };
  }
  const g = svgContext(w, h);
  return { g, kind: 'svg', save: (p) => writeFileSync(p, g.toSVG()) };
}

function render(name, opts, size) {
  const { g, kind, save } = contextFor(size, size);
  const t0 = performance.now();
  const stats = paint.paintMap(g, { ...opts, px: size, py: size });
  const ms = performance.now() - t0;
  const file = join(OUT, `${name}.${kind}`);
  save(file);
  const bytes = require_size(file);
  console.log(
    `  ${name.padEnd(16)} ${String(size).padStart(5)}px  ${ms.toFixed(0).padStart(5)} ms  `
    + `${String(stats.samples).padStart(6)} samples  ${String(stats.rects).padStart(6)} rects  `
    + `${String(stats.places).padStart(3)} places  ${String(stats.peaks).padStart(4)} peaks  `
    + `${String(stats.rivers).padStart(3)} rivers  ${String(stats.roads).padStart(3)} roads  `
    + `${String(g.elements ? g.elements() : 0).padStart(7)} el  `
    + `${(bytes / 1048576).toFixed(2)} MB  ${file.replace(ROOT + '/', '')}`,
  );
  return { name, ms, stats, file, bytes };
}

function require_size(p) {
  try { return require_stat(p).size; } catch { return 0; }
}
function require_stat(p) {
  // node:fs statSync, imported lazily so the top of this file stays short
  return statSync(p);
}
import { statSync } from 'node:fs';

// ------------------------------------------------------------------- main --

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const arg = process.argv[2] || 'all';
const size = Number(process.argv[3]) || 0;
const field = createWorldField(WORLD_SEED ?? 20260904);

// Everything is known: this is the sheet the user paints over, not a save.
const known = { zones: true, places: new Set(authoredSites().map((s) => s.id)) };

console.log(`\nThe painted map of Kaldera. Seed ${field.seed}. Writing to docs/maps/.`);
console.log(Canvas ? '  canvas is installed: writing PNG.' : '  the canvas package is not installed: writing SVG with the same drawing.');
console.log('');

const jobs = [];
if (arg === 'all' || arg === 'world') {
  jobs.push(() => render('world', {
    field, x: 0, z: 0, known, title: 'Kaldera', subtitle: 'the whole of it',
    samples: 208, rolled: false,
  }, size || 2048));
}
for (const zn of REALM_ZONES) {
  if (arg !== 'all' && arg !== zn.id) continue;
  jobs.push(() => render(zn.id, {
    field, realm: zn.id, known, samples: 200, rolled: true,
  }, size || 1300));
}
if (!jobs.length) {
  console.log(`Nothing called "${arg}". Try: world, all, or one of ${REALM_ZONES.map((z) => z.id).join(', ')}.`);
  process.exit(1);
}

const done = [];
for (const j of jobs) done.push(j());
const total = done.reduce((a, d) => a + d.ms, 0);
console.log(`\n  ${done.length} map(s), ${(total / 1000).toFixed(1)} s in all.`);
if (!Canvas) {
  console.log('  To look at one as an image:');
  console.log('    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless \\');
  console.log('      --screenshot=docs/maps/world.png --window-size=2048,2048 docs/maps/world.svg');
}
console.log('');
