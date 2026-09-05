// The compass: a strip across the top of the HUD, under the place plate.
//
// Eight cardinal letters and, if you have set one, the waypoint, all sliding
// sideways as you turn. The middle of the strip is where you are looking. It
// answers one question and only one: which way is the thing I said I was going
// to, and how far.
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

/**
 * Everything the strip needs for one frame, worked out with no DOM at all, so
 * the arithmetic is tested and the drawing is only placement.
 *
 * @returns { heading, points: [{ label, x }], waypoint: { name, x, dist, behind } | null }
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
      dist: Math.hypot(dx, dz),
      x: markerX(rel, span),
      // off the strip: the arrow at the near edge says which way to turn
      behind: markerX(rel, span) === null ? (rel < 0 ? 'left' : 'right') : null,
    };
  }
  return { heading, points, waypoint: wp };
}

// ---------------------------------------------------------------------------

const CSS = `
#bw-compass{
  position:absolute; left:50%; top:38px; transform:translateX(-50%);
  width:${COMPASS_W}px; height:20px; pointer-events:none; display:none;
  background:linear-gradient(180deg, rgba(10,9,7,.72), rgba(10,9,7,.42));
  border:1px solid ${theme.goldDim}88; border-radius:2px; overflow:hidden;
}
#bw-compass.on{ display:block; }
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
#bw-compass .bw-c-dist{
  position:absolute; right:4px; top:3px;
  font-family:${theme.fonts.display}; font-size:10px; letter-spacing:.08em;
  color:#8fe0ff; font-variant-numeric:tabular-nums;
}
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
  const yawOf = () => {
    const y = camera && Number.isFinite(camera.forwardYaw) ? camera.forwardYaw
      : (player && Number.isFinite(player.yaw) ? player.yaw : 0);
    return y;
  };
  const atOf = () => (player && player.pos) || { x: 0, z: 0 };

  let el = null, mid = null, dist = null;
  const ticks = new Map();          // label -> node
  let wpNode = null;
  let last = null;

  if (typeof document !== 'undefined' && root) {
    if (!document.getElementById('bw-compass-css')) {
      const st = document.createElement('style');
      st.id = 'bw-compass-css';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    el = document.createElement('div');
    el.id = 'bw-compass';
    mid = document.createElement('div');
    mid.className = 'bw-c-mid';
    el.appendChild(mid);
    for (const [label] of POINTS) {
      const t = document.createElement('div');
      t.className = 'bw-c-tick' + (label.length === 1 ? ' card' : '');
      t.textContent = label;
      t.style.display = 'none';
      el.appendChild(t);
      ticks.set(label, t);
    }
    wpNode = document.createElement('div');
    wpNode.className = 'bw-c-wp';
    wpNode.style.display = 'none';
    el.appendChild(wpNode);
    dist = document.createElement('div');
    dist.className = 'bw-c-dist';
    el.appendChild(dist);
    root.appendChild(el);
    el.classList.add('on');
  }

  const place = (node, x) => { node.style.left = `${(0.5 + 0.5 * x) * 100}%`; };

  return {
    el,
    /** The frame just drawn, so a test or the dev bench can read it. */
    get frame() { return last; },

    /** Call once a frame. Cheap: nine placements and one string. */
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
      if (!w) {
        wpNode.style.display = 'none';
        dist.textContent = '';
      } else if (w.x === null) {
        // behind you: the marker sits at the near edge and points the way round
        wpNode.style.display = '';
        wpNode.textContent = w.behind === 'left' ? `◀ ${w.name}` : `${w.name} ▶`;
        place(wpNode, w.behind === 'left' ? -0.94 : 0.94);
        dist.textContent = distanceText(w.dist);
      } else {
        wpNode.style.display = '';
        wpNode.textContent = `◆ ${w.name}`;
        place(wpNode, w.x);
        dist.textContent = distanceText(w.dist);
      }
      return f;
    },

    /** Show or hide the whole strip, for the settings window. */
    setShown(on) { if (el) el.classList.toggle('on', !!on); },

    dispose() { if (el && el.parentNode) el.parentNode.removeChild(el); },
  };
}

export default createCompass;
