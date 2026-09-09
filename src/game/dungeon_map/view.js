import { MINIMAP, paintLive, viewOf, pxOf, worldOf as pointOf } from '../minimap.js';
import { theme } from '../ui_theme.js';
import { createExploration, validLayout } from './exploration.js';
import { paintDungeonMap } from './paint.js';

const TITLE = 'Dungeon map. North is up; you are the gold arrow. Walk to map nearby rooms and passages. '
  + 'Gold dots mark unexplored routes. Stairs appear when found. Wheel to zoom.';
const CSS = `
#bw-minimap .dungeon-map { position: absolute; inset: 4px 5px; cursor: default; }
#bw-minimap .dungeon-map[hidden] { display: none; }
#bw-minimap .dungeon-map .map-face { position: relative; width: 220px; height: 220px; overflow: hidden; border-radius: 4px; }
#bw-minimap .dungeon-map canvas { position: absolute; inset: 0; width: 220px; height: 220px; }
#bw-minimap .dungeon-map .map-name { position: absolute; top: 0; left: 0; right: 0; padding: 5px 8px 6px;
  font: 11px ${theme.fonts.plain}; color: #ded9c7; background: linear-gradient(#0c1014, #0c1014e8, #0c101400);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; pointer-events: none; }
#bw-minimap .dungeon-map .map-legend { padding-top: 3px; font: 9px ${theme.fonts.plain}; line-height: 12px;
  color: #c4ba9d; white-space: nowrap; font-variant-numeric: tabular-nums; }
`;

export function createDungeonMap(root, opts = {}) {
  const doc = opts.doc || globalThis.document, size = MINIMAP.size;
  const dpr = Math.max(1, Math.min(2, opts.dpr ?? globalThis.devicePixelRatio ?? 1));
  let el, canvas, liveCanvas, name, legend, ground, liveCtx;
  if (doc && root) {
    if (!doc.getElementById('bw-dungeon-map-css')) {
      const style = doc.createElement('style'); style.id = 'bw-dungeon-map-css'; style.textContent = CSS; doc.head.appendChild(style);
    }
    el = doc.createElement('div'); el.className = 'dungeon-map'; el.title = TITLE; el.hidden = true;
    const face = doc.createElement('div'); face.className = 'map-face'; el.appendChild(face);
    for (let i = 0; i < 2; i++) {
      const c = doc.createElement('canvas'); c.width = size * dpr; c.height = size * dpr; face.appendChild(c);
      if (i === 0) { canvas = c; ground = c.getContext?.('2d'); }
      else { liveCanvas = c; liveCtx = c.getContext?.('2d'); }
    }
    name = doc.createElement('div'); name.className = 'map-name'; face.appendChild(name);
    legend = doc.createElement('div'); legend.className = 'map-legend'; el.appendChild(legend);
    el.setAttribute('role', 'img'); el.setAttribute('aria-label', TITLE); root.appendChild(el);
    // Stop dungeon input before the outdoor map's warp/zoom handlers receive it.
    el.addEventListener('pointerdown', e => { e.stopPropagation(); });
    el.addEventListener('pointermove', e => e.stopPropagation());
    el.addEventListener('wheel', e => {
      e.preventDefault(); e.stopPropagation();
      if (!e.deltaY) return;
      span = Math.max(48, Math.min(maxSpan, Math.round(span * (e.deltaY > 0 ? 1.25 : .8))));
      force = true;
    }, { passive: false });
  }
  let exploration = null, owner = null, cells = null, level = null, identity = null;
  let span = 96, maxSpan = 512, view = viewOf(0, 0, span, size), shown = false;
  let clock = 0, lastPaint = -1, revision = -1, force = true;
  let paintX = NaN, paintZ = NaN, yaw = NaN, liveX = NaN, liveZ = NaN;
  let last = null, live = null, paints = 0, lives = 0;
  const call = v => typeof v === 'function' ? v() : v;
  const fallbackCharacter = {};
  return {
    el, canvas, liveCanvas,
    get shown() { return shown; },
    setShown(value) { shown = !!value; if (el) el.hidden = !shown; force = true; },
    get view() { return view; }, get span() { return span; },
    get last() { return last; }, get live() { return live; },
    get paints() { return paints; }, get lives() { return lives; },
    get exploration() { return exploration; },
    get readout() { return legend?.textContent || ''; },
    pixelAt: (x, z) => pxOf(view, x, z), worldAt: (x, z) => pointOf(view, x, z),
    invalidate() { force = true; },
    update(dt, layout) {
      clock += Math.max(0, Number.isFinite(dt) ? dt : 0);
      if (!validLayout(layout)) return null;
      const character = call(opts.character) || fallbackCharacter;
      if (cells !== layout.cells || owner !== character || level !== layout.level || identity !== layout.id) {
        exploration = createExploration(layout, character);
        cells = layout.cells; owner = character; level = layout.level; identity = layout.id;
        maxSpan = Math.max(96, Math.max(layout.w, layout.h) * 2 + 24);
        span = 96; force = true;
        const label = `${layout.name || call(opts.dungeonName) || 'Dungeon'} · Level ${layout.level || 1}`;
        if (name) { name.textContent = label; name.title = label; }
        if (legend) legend.textContent = 'Gold dots lead into unmapped ground';
        if (el) el.setAttribute('aria-label', `${label}. ${TITLE}`);
      }
      const at = opts.player?.pos;
      if (!at) return null;
      // Exploration follows walking even when the player has hidden the widget.
      exploration.reveal(at.x, at.z);
      if (!shown) return null;
      const moved = Math.hypot(at.x - paintX, at.z - paintZ);
      const changed = revision !== exploration.revision;
      if (force || ((changed || !(moved < .5)) && clock - lastPaint >= .1)) {
        view = viewOf(at.x, at.z, span, size);
        if (ground) last = paintDungeonMap(ground, exploration, view, dpr);
        paintX = at.x; paintZ = at.z; revision = exploration.revision;
        lastPaint = clock; paints++; force = false; yaw = NaN;
      }
      const heading = Number.isFinite(opts.camera?.forwardYaw) ? opts.camera.forwardYaw : opts.player?.yaw || 0;
      if (liveCtx && (!(Math.abs(heading - yaw) < .004) || !(Math.hypot(at.x - liveX, at.z - liveZ) < .05))) {
        live = paintLive(liveCtx, { view, x: at.x, z: at.z, yaw: heading, dpr });
        yaw = heading; liveX = at.x; liveZ = at.z; lives++;
      }
      return last;
    },
    dispose() { el?.remove(); },
  };
}
