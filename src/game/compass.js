// The compass: a strip across the top of the HUD, under the place plate.
//
// Eight cardinal letters and, if you have set one, the waypoint, all sliding
// sideways as you turn. The middle of the strip is where you are looking. It
// answers one question and only one: which way is the thing I said I was going
// to, and how far.
//
// It is three cells wide: the distance, the bordered track, and where you are
// standing, right aligned at the far end. Everything with a number in it lives
// in a side cell, because the middle of the track is where the marker sits
// when you face the thing, and the middle of the track is directly under the
// name of the place you are in.
//
// ---- which way is north -------------------------------------------------
//
// The map draws +x to the right and +z DOWNWARD, so up the map is world -z, and
// -z is therefore north. Everything in this file is a bearing in that frame:
// clockwise from north, so N 0, E 90, S 180, W 270 degrees.
//
// player.js says forward is (sin yaw, cos yaw). At yaw 0 that is +z, which is
// SOUTH. `headingOf` does that conversion once and nothing else in the game has
// to hold both conventions in its head.
//
//   bearingOf(dx, dz)          the bearing of a direction, [0, 2 PI)
//   headingOf(yaw)             the bearing the player is facing
//   relativeAngle(b, h)        b as seen from h, wrapped to (-PI, PI]
//   markerX(rel, span)         where on the strip that lands, -1 left to 1
//                              right, or null when it is off the strip
//
// A worked case, which `compass.test.mjs` drives: a waypoint due north while
// you are facing east. The waypoint's bearing is 0, the heading is PI / 2, so
// the relative angle is -PI / 2 and, on a 180 degree strip, markerX is exactly
// -1: hard left. Face it and the marker walks to the middle.
//
// ---- what it reads ------------------------------------------------------
//
//   createCompass(root, { player, camera, character })
//
// `camera.forwardYaw` is preferred over `player.yaw` because the strip should
// follow where you are LOOKING, and in third person the camera turns before the
// body does. `character.waypoint` is { x, z, name }, which win_map.js writes
// when you click a place you have found. Nothing here writes anything.

import { theme } from './ui_theme.js';

/** How much of the world the strip shows, in radians. 180 degrees. */
export const COMPASS_SPAN = Math.PI;
/** The strip's own width, in pixels. */
export const COMPASS_W = 300;
/** The eight points, in bearing order from north. */
export const POINTS = [
  ['N', 0], ['NE', 45], ['E', 90], ['SE', 135],
  ['S', 180], ['SW', 225], ['W', 270], ['NW', 315],
].map(([n, d]) => [n, (d * Math.PI) / 180]);

const TAU = Math.PI * 2;

/** The bearing of a direction (dx, dz), clockwise from north (-z). [0, 2 PI). */
export function bearingOf(dx, dz) {
  const a = Math.atan2(dx, -dz);
  return a < 0 ? a + TAU : a;
}

/** The bearing the player faces, from player.js's forward = (sin yaw, cos yaw). */
export function headingOf(yaw) {
  return bearingOf(Math.sin(yaw), Math.cos(yaw));
}

/** Bearing `b` as seen from heading `h`, wrapped to (-PI, PI]. Left is negative. */
export function relativeAngle(b, h) {
  let d = b - h;
  while (d <= -Math.PI) d += TAU;
  while (d > Math.PI) d -= TAU;
  return d;
}

/**
 * The slack at the strip's two ends. `headingOf` runs a sine and a cosine and
 * an atan2 over them, which lands a heading of exactly east two ulps past
 * PI / 2. Without this a waypoint at exactly ninety degrees off, which is the
 * most ordinary reading a compass ever gives, falls off the end of the strip.
 * A billionth of a radian is a hundred thousandth of a pixel on the strip.
 */
export const EDGE_EPS = 1e-9;

/**
 * Where a relative angle lands on the strip: -1 hard left, 0 dead ahead, 1 hard
 * right. `null` when it is off the strip and must not be drawn, because a
 * marker pinned to the edge is a lie about where the thing is.
 */
export function markerX(rel, span = COMPASS_SPAN) {
  const half = span / 2;
  if (rel < -half - EDGE_EPS || rel > half + EDGE_EPS) return null;
  const x = rel / half;
  return x < -1 ? -1 : x > 1 ? 1 : x;
}

/** Metres, as the strip writes them: 940 m under a kilometre, 2.4 km over it. */
export function distanceText(m) {
  if (!Number.isFinite(m)) return '';
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

/** Where you are standing, as the strip writes it: `1209, -226`. */
export function coordsText(at) {
  if (!at || !Number.isFinite(at.x) || !Number.isFinite(at.z)) return '';
  return `${Math.round(at.x)}, ${Math.round(at.z)}`;
}

/**
 * A trailing pair of coordinates, which `context_menu.js` puts on the end of
 * every waypoint it names: "the ground at 1209, -226".
 */
const COORD_TAIL = /\s*(?:,|\bat)\s+-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*$/i;

/**
 * The name the marker prints, which is not the name the waypoint has.
 *
 * `context_menu.js` calls a mark on open ground "the ground at 1209, -226",
 * and the marker sits in the middle of the strip when you are facing it, which
 * is directly under the place plate. Twenty four characters of it ran straight
 * through MARLFIELD. The coordinates have their own corner of the strip now, so
 * the marker drops them and keeps the words, and long names are cut rather than
 * allowed to reach across the whole top of the screen.
 */
export function markerName(name, max = 18) {
  const s = String(name == null ? '' : name).trim().replace(COORD_TAIL, '').trim();
  if (!s) return 'your mark';
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

/**
 * Everything the strip needs for one frame, worked out with no DOM at all, so
 * the arithmetic is tested and the drawing is only placement.
 *
 * @returns { heading, coords, points: [{ label, x }],
 *            waypoint: { name, short, x, dist, behind } | null }
 */
export function compassFrame(yaw, at, waypoint, span = COMPASS_SPAN) {
  const heading = headingOf(yaw);
  const points = [];
  for (const [label, b] of POINTS) {
    const x = markerX(relativeAngle(b, heading), span);
    if (x !== null) points.push({ label, x });
  }
  // left to right, which is how a strip is read: the table is in bearing order
  // and a strip that straddles north would otherwise hand back N, NE, E, W, NW
  points.sort((a, b) => a.x - b.x);
  let wp = null;
  if (waypoint && Number.isFinite(waypoint.x) && Number.isFinite(waypoint.z) && at) {
    const dx = waypoint.x - at.x, dz = waypoint.z - at.z;
    const rel = relativeAngle(bearingOf(dx, dz), heading);
    wp = {
      name: waypoint.name || 'your mark',
      // what the marker actually prints: the words, without the coordinates
      short: markerName(waypoint.name),
      dist: Math.hypot(dx, dz),
      x: markerX(rel, span),
      // off the strip: the arrow at the near edge says which way to turn
      behind: markerX(rel, span) === null ? (rel < 0 ? 'left' : 'right') : null,
    };
  }
  return { heading, coords: coordsText(at), points, waypoint: wp };
}

// ---------------------------------------------------------------------------

// ---- the shape of the thing, in pixels -------------------------------------
//
// The strip is three cells in a row: a side cell, the bordered track, and
// another side cell the same width, so the TRACK stays centred on the screen
// and the middle of the track is still exactly where you are looking. The two
// side cells are transparent and hold the numbers.
//
// The coordinates used to have no cell at all: they were part of the
// waypoint's NAME, printed by the marker in the middle of the track, which is
// where the marker sits when you are facing the thing. "the ground at 1209,
// -226" therefore ran straight through the place plate above it. They are a
// readout at the right end now, and the marker keeps the words only.

/** The strip's own height, in pixels. */
export const COMPASS_H = 20;
/** Each side cell, in pixels. Wide enough for `-1209, -1226` at 10px. */
export const COMPASS_SIDE_W = 96;
/** The whole row: the track with a cell either side of it. */
export const COMPASS_STRIP_W = COMPASS_W + COMPASS_SIDE_W * 2;

/**
 * Pure. The box the coordinates readout occupies, px from the top left of the
 * HUD, on a screen `screenW` wide with the strip's own top at `top`. Right
 * aligned to the far end of the row.
 */
export function coordBox(screenW = 1280, top = 38) {
  const right = screenW / 2 + COMPASS_STRIP_W / 2;
  return {
    left: right - COMPASS_SIDE_W, right, top, bottom: top + COMPASS_H,
    width: COMPASS_SIDE_W, height: COMPASS_H,
  };
}

/**
 * Pure. The bordered track's own box: the letters, the middle line and the
 * marker. Centred on the screen, because the middle of it is where you look.
 */
export function trackBox(screenW = 1280, top = 38) {
  return {
    left: screenW / 2 - COMPASS_W / 2, right: screenW / 2 + COMPASS_W / 2,
    top, bottom: top + COMPASS_H, width: COMPASS_W, height: COMPASS_H,
  };
}

const CSS = `
#bw-compass{
  position:absolute; left:50%; top:38px; transform:translateX(-50%);
  width:${COMPASS_STRIP_W}px; height:${COMPASS_H}px; pointer-events:none; display:none;
  align-items:stretch;
}
#bw-compass.on{ display:flex; }
/* mounted into the HUD's top centre column, where the layout places it under
   the place plate instead of a guessed offset floating it over one */
#bw-compass.flow{ position:relative; left:auto; top:auto; transform:none; }
#bw-compass .bw-c-track{
  position:relative; width:${COMPASS_W}px; flex:none; overflow:hidden;
  background:linear-gradient(180deg, rgba(10,9,7,.72), rgba(10,9,7,.42));
  border:1px solid ${theme.goldDim}88; border-radius:2px;
}
#bw-compass .bw-c-side{
  width:${COMPASS_SIDE_W}px; flex:none; display:flex; align-items:center;
  font-family:${theme.fonts.display}; font-size:10px; letter-spacing:.08em;
  font-variant-numeric:tabular-nums; white-space:nowrap;
  text-shadow:0 1px 3px rgba(0,0,0,.95);
}
#bw-compass .bw-c-side.left{ justify-content:flex-end; padding-right:7px; }
#bw-compass .bw-c-side.right{ justify-content:flex-end; padding-left:7px; }
#bw-compass .bw-c-tick{
  position:absolute; top:3px; transform:translateX(-50%);
  font-family:${theme.fonts.display}; font-size:10px; font-weight:600;
  letter-spacing:.14em; color:${theme.parchmentDim}; white-space:nowrap;
}
#bw-compass .bw-c-tick.card{ color:${theme.gold}; }
#bw-compass .bw-c-mid{
  position:absolute; left:50%; top:0; bottom:0; width:1px;
  background:${theme.gold}aa; transform:translateX(-50%);
}
#bw-compass .bw-c-wp{
  position:absolute; top:2px; transform:translateX(-50%);
  font-family:${theme.fonts.display}; font-size:10px; font-weight:700;
  letter-spacing:.06em; color:#8fe0ff; white-space:nowrap; text-shadow:0 0 6px rgba(0,0,0,.9);
}
#bw-compass .bw-c-dist{ color:#8fe0ff; }
#bw-compass .bw-c-at{ color:${theme.goldDim}; }
`;

/**
 * Build the strip and hand back an update() to call once a frame.
 *
 * It draws nothing and shows nothing until there is a heading to draw, and it
 * costs one text write per visible tick per frame, which is at most nine.
 */
export function createCompass(root, opts = {}) {
  const { player = null, camera = null, character = null } = opts;
  const span = opts.span ?? COMPASS_SPAN;
  // `flow: true` when the root is the HUD's own compass slot, which lays the
  // strip out in the top centre column instead of floating it over the plate
  const flow = !!opts.flow;
  const yawOf = () => {
    const y = camera && Number.isFinite(camera.forwardYaw) ? camera.forwardYaw
      : (player && Number.isFinite(player.yaw) ? player.yaw : 0);
    return y;
  };
  const atOf = () => (player && player.pos) || { x: 0, z: 0 };

  let el = null, track = null, mid = null, dist = null, coords = null;
  const ticks = new Map();          // label -> node
  let wpNode = null;
  let last = null;
  let lastDist = '', lastCoords = '';

  if (typeof document !== 'undefined' && root) {
    if (!document.getElementById('bw-compass-css')) {
      const st = document.createElement('style');
      st.id = 'bw-compass-css';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    el = document.createElement('div');
    el.id = 'bw-compass';
    if (flow) el.classList.add('flow');

    // left cell: how far the mark is, out of the middle where the plate is
    const leftCell = document.createElement('div');
    leftCell.className = 'bw-c-side left';
    dist = document.createElement('span');
    dist.className = 'bw-c-dist';
    leftCell.appendChild(dist);
    el.appendChild(leftCell);

    track = document.createElement('div');
    track.className = 'bw-c-track';
    el.appendChild(track);
    mid = document.createElement('div');
    mid.className = 'bw-c-mid';
    track.appendChild(mid);
    for (const [label] of POINTS) {
      const t = document.createElement('div');
      t.className = 'bw-c-tick' + (label.length === 1 ? ' card' : '');
      t.textContent = label;
      t.style.display = 'none';
      track.appendChild(t);
      ticks.set(label, t);
    }
    wpNode = document.createElement('div');
    wpNode.className = 'bw-c-wp';
    wpNode.style.display = 'none';
    track.appendChild(wpNode);

    // right cell: where you are standing, right aligned at the far end
    const rightCell = document.createElement('div');
    rightCell.className = 'bw-c-side right';
    coords = document.createElement('span');
    coords.className = 'bw-c-at';
    rightCell.appendChild(coords);
    el.appendChild(rightCell);

    root.appendChild(el);
    el.classList.add('on');
  }

  // three decimals is a tenth of a pixel on a 300px track, and it keeps the
  // string stable: dead ahead is "50.000%" and not 49.99999999999999%
  const place = (node, x) => { node.style.left = `${((0.5 + 0.5 * x) * 100).toFixed(3)}%`; };

  return {
    el,
    /** The frame just drawn, so a test or the dev bench can read it. */
    get frame() { return last; },

    /**
     * Call once a frame. Cheap: nine placements, and the two readouts in the
     * side cells are written only when their string actually changes, which
     * for the coordinates is about once a metre rather than sixty times a
     * second.
     */
    update() {
      const f = compassFrame(yawOf(), atOf(), character && character.waypoint, span);
      last = f;
      if (!el) return f;
      for (const [label, node] of ticks) {
        const p = f.points.find((q) => q.label === label);
        if (!p) { node.style.display = 'none'; continue; }
        node.style.display = '';
        place(node, p.x);
      }
      const w = f.waypoint;
      // the marker prints the WORDS of the name. Its coordinates, if it had
      // any, are the readout at the right end of the row.
      if (!w) {
        wpNode.style.display = 'none';
      } else if (w.x === null) {
        // behind you: the marker sits at the near edge and points the way round
        wpNode.style.display = '';
        wpNode.textContent = w.behind === 'left' ? `◀ ${w.short}` : `${w.short} ▶`;
        place(wpNode, w.behind === 'left' ? -0.94 : 0.94);
      } else {
        wpNode.style.display = '';
        wpNode.textContent = `◆ ${w.short}`;
        place(wpNode, w.x);
      }
      const d = w ? distanceText(w.dist) : '';
      if (d !== lastDist) { dist.textContent = d; lastDist = d; }
      if (f.coords !== lastCoords) { coords.textContent = f.coords; lastCoords = f.coords; }
      return f;
    },

    /** Show or hide the whole strip, for the settings window. */
    setShown(on) { if (el) el.classList.toggle('on', !!on); },

    dispose() { if (el && el.parentNode) el.parentNode.removeChild(el); },
  };
}

export default createCompass;
