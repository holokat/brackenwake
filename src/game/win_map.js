// The Map panel: the whole continent, drawn.
//
// 06-ECONOMY-UI.md asked for "the world map from the field at 8 km, discovered
// sites named". The world is bounded now (`src/world/zones.js`), so the map is
// the whole of it: 16 km across, the origin at the centre, the ring ocean and
// the coast on every side. There is nothing off the edge of this map, and that
// is the point of it.
//
// What is drawn, in order:
//
//   1. the ground, one filled cell per field sample
//   2. the world's edge, a thin ring at WORLD_HALF, so the boundary reads as
//      deliberate and not as the place the samples ran out
//   3. the zones: a soft tint by danger, the rim stroked. A zone you have
//      walked into is named; one you have not is hatched and anonymous
//   4. roads, from the polylines roads.js already holds
//   5. sites you have found, named, a way into the ground drawn as a square
//   6. the waypoint, if you have set one
//   7. you, pointing where you are facing
//
// Click any discovered site or zone to set a waypoint. compass.js reads it.
//
// THE STRIDE, MEASURED.
//
//   `field.sampleAt` costs about 2.0 microseconds warm on this machine. The
//   draw is MAP_SAMPLES squared of those plus the fills, the roads, the zones
//   and the site lookups. `win_map.test.mjs` measures the real render and fails
//   the build if it goes over MAP_BUDGET_MS. 128 samples over 16 km is 125 m a
//   sample and 5 pixels a sample on a 640 pixel canvas; 160 costs half as much
//   again for a picture nobody reads differently at this scale.

import { roadsForCell } from '../world/roads.js';
import { SITE_CELL } from '../world/sitegrid.js';
import { ZONES, WORLD_HALF, zoneAt } from '../world/zones.js';

/** The map is this many metres across: the whole world, plus its ocean rim. */
export const MAP_SPAN = 2 * WORLD_HALF;
/** Samples per side. See the note above; this is a measured number. */
export const MAP_SAMPLES = 128;
/** Metres between samples. */
export const MAP_STRIDE = MAP_SPAN / MAP_SAMPLES;
/** A draw that takes longer than this is a bug, and the test says so. */
export const MAP_BUDGET_MS = 130;
/** Redrawn this often while the window is open. */
export const REDRAW_S = 2;
/** A click within this many pixels of a site takes the site, not the zone. */
export const PICK_PX = 9;

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
export const SITE_COLOUR = {
  town: '#f0d98a', hamlet: '#d8c07a', ruin: '#b09090', shrine: '#c8c0e0',
  dungeon: '#e08a70', cave: '#a89078', camp: '#c8b090', mine: '#e8c264',
};
/** A zone's tint follows the top of its danger band: green at home, red at the rim. */
export const DANGER_TINT = {
  1: [126, 176, 96], 2: [196, 192, 96], 3: [222, 170, 84], 4: [224, 122, 70], 5: [212, 72, 68],
};
export const EDGE_COLOUR = '#7fa8c8';
export const WAYPOINT_COLOUR = '#8fe0ff';

/**
 * The colour of one sample: the biome, shaded by height so a range reads as a
 * range. Pure, so the palette is tested without a canvas.
 */
export function shadeFor(sample) {
  const base = BIOME_COLOUR[sample.biome] || BIOME_COLOUR.meadow;
  if (sample.biome === 'ocean') {
    // deeper water is darker, out to 30 m down, which is the ring ocean's floor
    const k = Math.max(0, Math.min(1, (-sample.h) / 30));
    return base.map((c) => Math.round(c * (1 - k * 0.55)));
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

/** Pixel back to a world point: the exact inverse of toPixel. */
export function toWorld(px, py, cx, cz, size, span = MAP_SPAN) {
  return [
    (px / size - 0.5) * span + cx,
    (py / size - 0.5) * span + cz,
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

/** Anything with `has`, an array of ids, or nothing at all, as one predicate. */
export function asHas(d) {
  if (typeof d?.has === 'function') return (id) => d.has(id);
  if (Array.isArray(d)) { const s = new Set(d); return (id) => s.has(id); }
  return () => false;
}

/**
 * What a click at (px, py) landed on: a discovered site, else a discovered
 * zone, else nothing. Pure, so the panel's click handler is one line and the
 * arithmetic is tested without a DOM.
 *
 * @returns { kind: 'site' | 'zone', id, name, x, z } or null
 */
export function pickAt(px, py, opts) {
  const { field, cx = 0, cz = 0, size = 640 } = opts;
  const span = opts.span ?? MAP_SPAN;
  const has = asHas(opts.discovered);
  const hasZone = asHas(opts.zonesFound);

  let best = null, bestD = PICK_PX;
  for (const [ccx, ccz] of cellsIn(cx, cz, span)) {
    const s = field.siteInCell(ccx, ccz);
    if (!s || !has(s.id)) continue;
    const [sx, sy] = toPixel(s.x, s.z, cx, cz, size, span);
    const d = Math.hypot(sx - px, sy - py);
    if (d <= bestD) { bestD = d; best = { kind: 'site', id: s.id, name: s.name, x: s.x, z: s.z }; }
  }
  if (best) return best;

  const [wx, wz] = toWorld(px, py, cx, cz, size, span);
  const hit = zoneAt(wx, wz);
  if (hit && hasZone(hit.zone.id)) {
    return { kind: 'zone', id: hit.zone.id, name: hit.zone.name, x: hit.zone.x, z: hit.zone.z };
  }
  return null;
}

/** Diagonal hatching inside whatever path is clipped on `g2d`. */
function hatch(g2d, x0, y0, x1, y1, step, colour) {
  g2d.strokeStyle = colour;
  g2d.lineWidth = 1;
  g2d.beginPath();
  for (let d = x0 - (y1 - y0); d <= x1; d += step) {
    g2d.moveTo(d, y0);
    g2d.lineTo(d + (y1 - y0), y1);
  }
  g2d.stroke();
}

/**
 * The whole draw. Takes a 2D context so a node test can hand it a recorder and
 * measure the real work, not a stand-in for it.
 *
 * @param g2d    a CanvasRenderingContext2D, or anything with the same calls
 * @param opts   { field, cx, cz, size, yaw, discovered, zonesFound, waypoint, roads, zones }
 * @returns      { ms, samples, sites, roads, zones, named, stride }
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

  // 1. the ground, one filled cell per sample
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const s = field.sampleAt(x0 + (i + 0.5) * stride, z0 + (j + 0.5) * stride);
      const [r, g, b] = shadeFor(s);
      g2d.fillStyle = `rgb(${r},${g},${b})`;
      g2d.fillRect(Math.floor(i * cell), Math.floor(j * cell), Math.ceil(cell), Math.ceil(cell));
    }
  }

  // 2. the world's edge
  {
    const [ex, ey] = toPixel(0, 0, cx, cz, size, span);
    const rpx = (WORLD_HALF / span) * size;
    g2d.strokeStyle = EDGE_COLOUR;
    g2d.lineWidth = 1;
    g2d.beginPath();
    g2d.arc(ex, ey, rpx, 0, Math.PI * 2);
    g2d.stroke();
  }

  // 3. the zones
  const foundZone = asHas(opts.zonesFound);
  let zonesDrawn = 0, named = 0;
  if (opts.zones !== false) {
    for (const zn of ZONES) {
      const [zx, zy] = toPixel(zn.x, zn.z, cx, cz, size, span);
      const rpx = (zn.r / span) * size;
      if (zx + rpx < 0 || zy + rpx < 0 || zx - rpx > size || zy - rpx > size) continue;
      zonesDrawn++;
      const known = foundZone(zn.id);
      const [tr, tg, tb] = DANGER_TINT[zn.danger[1]] || DANGER_TINT[3];
      g2d.save();
      g2d.beginPath();
      g2d.arc(zx, zy, rpx, 0, Math.PI * 2);
      g2d.clip();
      if (known) {
        g2d.fillStyle = `rgba(${tr},${tg},${tb},.17)`;
        g2d.fillRect(zx - rpx, zy - rpx, rpx * 2, rpx * 2);
      } else {
        // country you have not walked into is hatched and says nothing
        g2d.fillStyle = 'rgba(10,12,16,.55)';
        g2d.fillRect(zx - rpx, zy - rpx, rpx * 2, rpx * 2);
        hatch(g2d, zx - rpx, zy - rpx, zx + rpx, zy + rpx, 7, 'rgba(150,160,175,.30)');
      }
      g2d.restore();
      g2d.strokeStyle = known ? `rgba(${tr},${tg},${tb},.75)` : 'rgba(150,160,175,.35)';
      g2d.lineWidth = known ? 1.4 : 1;
      g2d.beginPath();
      g2d.arc(zx, zy, rpx, 0, Math.PI * 2);
      g2d.stroke();
      if (known) {
        named++;
        g2d.font = '600 12px ui-sans-serif, system-ui, sans-serif';
        g2d.textAlign = 'center';
        g2d.fillStyle = 'rgba(0,0,0,.8)';
        g2d.fillText(zn.name, zx + 1, zy + 1);
        g2d.fillStyle = `rgb(${tr},${tg},${tb})`;
        g2d.fillText(zn.name, zx, zy);
      }
    }
  }

  // 4. roads, from the polylines roads.js already holds
  let roads = 0;
  if (opts.roads !== false) {
    g2d.strokeStyle = ROAD_COLOUR;
    g2d.lineWidth = Math.max(1, size / 500);
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

  // 5. sites the character has found, named
  // `discovered` is a list, a Set, or anything with `has`: the character
  // document keeps an array and sites.js keeps a Set behind a `has`.
  const has = asHas(opts.discovered);
  const sites = [];
  for (const [ccx, ccz] of cellsIn(cx, cz, span)) {
    const s = field.siteInCell(ccx, ccz);
    if (!s || !has(s.id)) continue;
    sites.push(s);
    const [px, py] = toPixel(s.x, s.z, cx, cz, size, span);
    const r = s.kind === 'town' ? 4.5 : s.kind === 'mine' ? 4 : s.kind === 'hamlet' ? 3.5 : 3;
    g2d.fillStyle = SITE_COLOUR[s.kind] || '#e0e0e0';
    if (s.kind === 'mine' || s.kind === 'dungeon') {
      // a way into the ground is a square, so a hole never reads as a village
      g2d.fillRect(px - r, py - r, r * 2, r * 2);
      g2d.strokeStyle = 'rgba(0,0,0,.7)';
      g2d.lineWidth = 1;
      g2d.strokeRect(px - r, py - r, r * 2, r * 2);
    } else {
      g2d.beginPath();
      g2d.arc(px, py, r, 0, Math.PI * 2);
      g2d.fill();
      g2d.strokeStyle = 'rgba(0,0,0,.7)';
      g2d.lineWidth = 1;
      g2d.stroke();
    }
    g2d.font = '11px ui-sans-serif, system-ui, sans-serif';
    g2d.textAlign = 'center';
    g2d.fillStyle = 'rgba(0,0,0,.75)';
    g2d.fillText(s.name, px + 1, py - r - 3 + 1);
    g2d.fillStyle = '#f2ede2';
    g2d.fillText(s.name, px, py - r - 3);
  }

  // 6. the waypoint
  const wp = opts.waypoint;
  if (wp && Number.isFinite(wp.x) && Number.isFinite(wp.z)) {
    const [px, py] = toPixel(wp.x, wp.z, cx, cz, size, span);
    g2d.strokeStyle = WAYPOINT_COLOUR;
    g2d.lineWidth = 2;
    g2d.beginPath();
    g2d.arc(px, py, 7, 0, Math.PI * 2);
    g2d.stroke();
    g2d.beginPath();
    g2d.moveTo(px - 11, py); g2d.lineTo(px - 4, py);
    g2d.moveTo(px + 4, py); g2d.lineTo(px + 11, py);
    g2d.moveTo(px, py - 11); g2d.lineTo(px, py - 4);
    g2d.moveTo(px, py + 4); g2d.lineTo(px, py + 11);
    g2d.stroke();
  }

  // 7. you, pointing where you are facing.
  //
  // The map is +x right and +z DOWN, so canvas up is world -z. player.js says
  // forward is (sin yaw, cos yaw), so at yaw 0 the player faces +z, which is
  // DOWN this map. The arrow is drawn tip up, so it needs rotating by PI - yaw:
  // canvas rotate(a) takes (0, -8) to (8 sin a, -8 cos a), and that equals the
  // forward direction (8 sin yaw, 8 cos yaw) exactly when a = PI - yaw. The old
  // code rotated by -yaw, which pointed the arrow the opposite way at every
  // heading; `win_map.test.mjs` now drives all four cardinals against it.
  const [px, py] = toPixel(cx, cz, cx, cz, size, span);
  g2d.save();
  g2d.translate(px, py);
  g2d.rotate(Math.PI - yaw);
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
  return { ms, samples: n * n, sites: sites.length, roads, zones: zonesDrawn, named, stride };
}

/** Where the arrow tip lands for a heading, which is what the rotation means. */
export function arrowTip(yaw, len = 8) {
  const a = Math.PI - yaw;
  return [len * Math.sin(a), -len * Math.cos(a)];
}

// ---------------------------------------------------------------------------
// The panel.

const CSS = `
.bw-win-map .bw-map-wrap{position:relative;width:min(640px,78vh);max-width:100%}
.bw-win-map canvas{display:block;width:100%;height:auto;border-radius:8px;border:1px solid #2f3a2e;background:#0d1014;cursor:crosshair}
.bw-win-map .bw-map-foot{display:flex;justify-content:space-between;gap:10px;color:#8b9686;font-size:12px;margin-top:8px}
.bw-win-map .bw-map-say{color:#c9a44a;font-size:12px;margin-top:4px;min-height:15px}
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
    this._canvas.addEventListener('click', (e) => this.clickAt(e));
    wrap.appendChild(this._canvas);
    this._foot = document.createElement('div');
    this._foot.className = 'bw-map-foot';
    this._say = document.createElement('div');
    this._say.className = 'bw-map-say';
    root.append(wrap, this._foot, this._say);
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

  /**
   * A click on the map. A discovered site or zone becomes the waypoint, and the
   * panel says so both in its own line and as a toast: a waypoint set in
   * silence is indistinguishable from a click that did nothing.
   */
  clickAt(ev) {
    const ctx = this._ctx;
    const field = ctx?.runtime?.field;
    if (!this._canvas || !field) return null;
    const rect = this._canvas.getBoundingClientRect
      ? this._canvas.getBoundingClientRect()
      : { left: 0, top: 0, width: this._canvas.width, height: this._canvas.height };
    const scale = this._canvas.width / (rect.width || this._canvas.width);
    const px = ((ev?.clientX ?? 0) - rect.left) * scale;
    const py = ((ev?.clientY ?? 0) - rect.top) * scale;
    const p = ctx?.player?.pos || { x: 0, z: 0 };
    const hit = pickAt(px, py, {
      field, cx: p.x, cz: p.z, size: this._canvas.width,
      discovered: ctx?.character?.discovered || ctx?.runtime?.discovery,
      zonesFound: ctx?.character?.zones || ctx?.runtime?.discovery?.zonesFound,
    });
    if (!hit) {
      this.setSay('Nothing there you have been to. Click a place or a region you have found.');
      return null;
    }
    const wp = { x: hit.x, z: hit.z, name: hit.name };
    if (ctx?.character) ctx.character.waypoint = wp;
    ctx?.state?.touch?.('waypoint');
    const d = Math.round(Math.hypot(hit.x - p.x, hit.z - p.z));
    this.setSay(`Waypoint set on ${hit.name}, ${d} m off. The compass has it.`);
    ctx?.hud?.toast?.(`waypoint set on <b>${hit.name}</b>, ${d} m off`);
    this.redraw();
    return wp;
  },

  setSay(text) { if (this._say) this._say.textContent = text || ''; },

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
    const zonesFound = ctx?.character?.zones || ctx?.runtime?.discovery?.zonesFound || [];
    const res = drawMap(g2d, {
      field,
      cx: p.x, cz: p.z,
      size: this._canvas.width,
      yaw: ctx?.player?.yaw ?? 0,
      discovered, zonesFound,
      waypoint: ctx?.character?.waypoint || null,
    });
    this._last = res;
    if (this._foot) {
      this._foot.textContent = '';
      const left = document.createElement('span');
      left.textContent = `${(MAP_SPAN / 1000).toFixed(0)} km across, ${res.sites} place${res.sites === 1 ? '' : 's'} found, ${res.named} of ${ZONES.length} regions walked`;
      const right = document.createElement('span');
      right.textContent = `${Math.round(p.x)}, ${Math.round(p.z)}`;
      this._foot.append(left, right);
    }
    return res;
  },

  get lastDraw() { return this._last || null; },
};

export default panel;
