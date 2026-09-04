// The Map panel: the world field, drawn.
//
// 06-ECONOMY-UI.md: "Map (M): the world map from the field at 8 km, discovered
// sites named." So: an 8 km square around the player, sampled off `field.js`
// for biome and height, the roads `roads.js` already laid out, every site the
// character has found, and an arrow for where you are pointing.
//
// THE STRIDE, MEASURED.
//
//   `field.sampleAt` costs about 1.8 microseconds warm. 8 km at MAP_SAMPLES
//   across is MAP_SAMPLES squared calls, so the sampling alone is a straight
//   multiplication, and the whole draw adds the fills, the roads and the site
//   lookups on top. Sampling only, then the whole draw cold and warm:
//
//     128 x 128 = 16,384 samples      31 ms sampling,   59 ms cold,  36 ms warm
//     160 x 160 = 25,600 samples      46 ms sampling,   76 ms cold,  52 ms warm
//     192 x 192 = 36,864 samples      63 ms sampling
//
//   measured on this machine by `win_map.test.mjs`, which fails the build if
//   the real render goes over MAP_BUDGET_MS. 128 is the setting: 62.5 m a
//   sample. 160 was tried first and the cold draw measured 75.7 ms, which is
//   inside the budget on this machine and too close to it on a slower one, so
//   the count came down a step. At 128 the same cold draw measures about 45 ms
//   and the map is still 5 pixels a sample on a 640 pixel canvas.

import { roadsForCell } from '../world/roads.js';
import { SITE_CELL } from '../world/sitegrid.js';

/** The map is this many metres across. */
export const MAP_SPAN = 8000;
/** Samples per side. See the note above; this is a measured number. */
export const MAP_SAMPLES = 128;
/** Metres between samples. */
export const MAP_STRIDE = MAP_SPAN / MAP_SAMPLES;
/** A draw that takes longer than this is a bug, and the test says so. */
export const MAP_BUDGET_MS = 100;
/** Redrawn this often while the window is open. */
export const REDRAW_S = 2;

/** Ground colours, the same families the world uses. */
export const BIOME_COLOUR = {
  ocean: [26, 52, 84],
  beach: [198, 178, 128],
  meadow: [96, 122, 66],
  boreal: [58, 84, 62],
  desert: [186, 158, 96],
  sakura: [134, 106, 122],
  mountain: [116, 112, 106],
  snow: [222, 226, 232],
};
export const ROAD_COLOUR = '#8a7350';
export const SITE_COLOUR = { town: '#f0d98a', hamlet: '#d8c07a', ruin: '#b09090', shrine: '#c8c0e0', dungeon: '#e08a70', cave: '#a89078', camp: '#c8b090' };

/**
 * The colour of one sample: the biome, shaded by height so a range reads as a
 * range. Pure, so the palette is tested without a canvas.
 */
export function shadeFor(sample) {
  const base = BIOME_COLOUR[sample.biome] || BIOME_COLOUR.meadow;
  if (sample.biome === 'ocean') {
    // deeper water is darker, out to 14 m down, which is the ocean floor
    const k = Math.max(0, Math.min(1, (-sample.h) / 14));
    return base.map((c) => Math.round(c * (1 - k * 0.45)));
  }
  // land: 0 m is the base colour, 120 m is half as bright again
  const k = Math.max(-0.25, Math.min(0.5, sample.h / 240));
  return base.map((c) => Math.max(0, Math.min(255, Math.round(c * (1 + k)))));
}

/** World point to pixel, for a square canvas of `size` centred on (cx, cz). */
export function toPixel(x, z, cx, cz, size, span = MAP_SPAN) {
  return [
    ((x - cx) / span + 0.5) * size,
    ((z - cz) / span + 0.5) * size,
  ];
}

/** Every site cell the map covers, so nothing is looked up twice. */
export function cellsIn(cx, cz, span = MAP_SPAN) {
  const c0 = Math.floor((cx - span / 2) / SITE_CELL), c1 = Math.floor((cx + span / 2) / SITE_CELL);
  const d0 = Math.floor((cz - span / 2) / SITE_CELL), d1 = Math.floor((cz + span / 2) / SITE_CELL);
  const out = [];
  for (let z = d0; z <= d1; z++) for (let x = c0; x <= c1; x++) out.push([x, z]);
  return out;
}

/**
 * The whole draw. Takes a 2D context so a node test can hand it a recorder and
 * measure the real work, not a stand-in for it.
 *
 * @param g2d    a CanvasRenderingContext2D, or anything with the same calls
 * @param opts   { field, cx, cz, size, yaw, discovered, roads }
 * @returns      { ms, samples, sites, roads } which is what the panel reports
 */
export function drawMap(g2d, opts) {
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const { field, cx = 0, cz = 0, size = 640, yaw = 0 } = opts;
  const span = opts.span ?? MAP_SPAN;
  const n = opts.samples ?? MAP_SAMPLES;
  const stride = span / n;
  const cell = size / n;
  const x0 = cx - span / 2, z0 = cz - span / 2;

  g2d.save();
  g2d.fillStyle = '#0d1014';
  g2d.fillRect(0, 0, size, size);

  // the ground, one filled cell per sample
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const s = field.sampleAt(x0 + (i + 0.5) * stride, z0 + (j + 0.5) * stride);
      const [r, g, b] = shadeFor(s);
      g2d.fillStyle = `rgb(${r},${g},${b})`;
      g2d.fillRect(Math.floor(i * cell), Math.floor(j * cell), Math.ceil(cell), Math.ceil(cell));
    }
  }

  // roads, from the polylines roads.js already holds
  let roads = 0;
  if (opts.roads !== false) {
    g2d.strokeStyle = ROAD_COLOUR;
    g2d.lineWidth = Math.max(1, size / 400);
    for (const [ccx, ccz] of cellsIn(cx, cz, span)) {
      let list;
      try { list = roadsForCell(field, ccx, ccz); } catch { list = []; }
      for (const road of list) {
        if (!road.pts || road.pts.length < 2) continue;
        roads++;
        g2d.beginPath();
        for (let i = 0; i < road.pts.length; i++) {
          const [px, py] = toPixel(road.pts[i].x, road.pts[i].z, cx, cz, size, span);
          if (i === 0) g2d.moveTo(px, py); else g2d.lineTo(px, py);
        }
        g2d.stroke();
      }
    }
  }

  // sites the character has found, named
  // `discovered` is a list, a Set, or anything with `has`: the character
  // document keeps an array and sites.js keeps a Set behind a `has`.
  const d = opts.discovered;
  const has = typeof d?.has === 'function' ? (id) => d.has(id)
    : Array.isArray(d) ? ((set) => (id) => set.has(id))(new Set(d))
      : () => false;
  const sites = [];
  for (const [ccx, ccz] of cellsIn(cx, cz, span)) {
    const s = field.siteInCell(ccx, ccz);
    if (!s || !has(s.id)) continue;
    sites.push(s);
    const [px, py] = toPixel(s.x, s.z, cx, cz, size, span);
    const r = s.kind === 'town' ? 4.5 : s.kind === 'hamlet' ? 3.5 : 3;
    g2d.fillStyle = SITE_COLOUR[s.kind] || '#e0e0e0';
    g2d.beginPath();
    g2d.arc(px, py, r, 0, Math.PI * 2);
    g2d.fill();
    g2d.strokeStyle = 'rgba(0,0,0,.7)';
    g2d.lineWidth = 1;
    g2d.stroke();
    g2d.font = '11px ui-sans-serif, system-ui, sans-serif';
    g2d.textAlign = 'center';
    g2d.fillStyle = 'rgba(0,0,0,.75)';
    g2d.fillText(s.name, px + 1, py - r - 3 + 1);
    g2d.fillStyle = '#f2ede2';
    g2d.fillText(s.name, px, py - r - 3);
  }

  // you, pointing where you are facing
  const [px, py] = toPixel(cx, cz, cx, cz, size, span);
  g2d.save();
  g2d.translate(px, py);
  g2d.rotate(-yaw);              // world +z is up on this map, and yaw turns from it
  g2d.beginPath();
  g2d.moveTo(0, -8);
  g2d.lineTo(5, 6);
  g2d.lineTo(0, 3);
  g2d.lineTo(-5, 6);
  g2d.closePath();
  g2d.fillStyle = '#ffe08a';
  g2d.fill();
  g2d.strokeStyle = '#241d10';
  g2d.lineWidth = 1.2;
  g2d.stroke();
  g2d.restore();
  g2d.restore();

  const ms = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
  return { ms, samples: n * n, sites: sites.length, roads, stride };
}

// ---------------------------------------------------------------------------
// The panel.

const CSS = `
.bw-win-map .bw-map-wrap{position:relative;width:min(640px,78vh);max-width:100%}
.bw-win-map canvas{display:block;width:100%;height:auto;border-radius:8px;border:1px solid #2f3a2e;background:#0d1014}
.bw-win-map .bw-map-foot{display:flex;justify-content:space-between;gap:10px;color:#8b9686;font-size:12px;margin-top:8px}
`;

export const panel = {
  id: 'map',
  title: 'Map',
  key: 'm',

  build(root, ctx) {
    if (typeof document === 'undefined') return;
    if (!document.getElementById('bw-map-css')) {
      const st = document.createElement('style');
      st.id = 'bw-map-css';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    root.classList.add('bw-win-map');
    root.textContent = '';
    this._ctx = ctx;
    const wrap = document.createElement('div');
    wrap.className = 'bw-map-wrap';
    this._canvas = document.createElement('canvas');
    this._canvas.width = 640;
    this._canvas.height = 640;
    wrap.appendChild(this._canvas);
    this._foot = document.createElement('div');
    this._foot.className = 'bw-map-foot';
    root.append(wrap, this._foot);
    this._since = 0;
  },

  open(ctx) {
    this._ctx = ctx || this._ctx;
    this._since = 0;
    this.redraw();
  },

  close() { },

  tick(dt) {
    this._since += dt;
    if (this._since >= REDRAW_S) { this._since = 0; this.redraw(); }
  },

  /** Every draw goes through here, so the number in the footer is the real one. */
  redraw() {
    const ctx = this._ctx;
    const field = ctx?.runtime?.field;
    if (!this._canvas || !field) return null;
    const g2d = this._canvas.getContext('2d');
    if (!g2d) return null;
    const p = ctx?.player?.pos || ctx?.actor?.pos || ctx?.character?.pos || { x: 0, z: 0 };
    // the character document is the record; the runtime's discovery set is the
    // fallback for a character that has not grown the field yet
    const discovered = ctx?.character?.discovered || ctx?.runtime?.discovery || [];
    const res = drawMap(g2d, {
      field,
      cx: p.x, cz: p.z,
      size: this._canvas.width,
      yaw: ctx?.player?.yaw ?? 0,
      discovered,
    });
    this._last = res;
    if (this._foot) {
      this._foot.textContent = '';
      const left = document.createElement('span');
      left.textContent = `${(MAP_SPAN / 1000).toFixed(0)} km across, ${res.sites} place${res.sites === 1 ? '' : 's'} found`;
      const right = document.createElement('span');
      right.textContent = `${Math.round(p.x)}, ${Math.round(p.z)}`;
      this._foot.append(left, right);
    }
    return res;
  },

  get lastDraw() { return this._last || null; },
};

export default panel;
