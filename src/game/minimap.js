// The minimap: a square of the country you are standing in, north up, in the
// top right under the dev badge.
//
// WHY IT EXISTS. The Greenwold is being laid out by hand, space by space, on a
// flat sculpt world (docs/mmo/22-GREENWOLD-SPACES.md, and the editor in
// ED1-EDITOR.md and ED3-SCULPT.md). A flat world has no landmark to steer by
// and the editor takes the whole screen, so the one question the editor cannot
// answer about itself is "which part of the zone am I in". The map window
// answers it, and closing the map to keep sculpting loses the answer again.
// This is that answer, kept on the screen: in play mode it is a piece of the
// gameplay HUD, and in editor mode it is the one gameplay widget that stays up.
//
// ---- what is on it --------------------------------------------------------
//
//   the ground     the field's own sample, painted the way map_paint paints a
//                  chart: BIOME_PAINT under REALM_PAINT by the realm's weight,
//                  GROUND_PAINT over both wherever a brush has painted the
//                  ground, WATER_SHALLOW to WATER_DEEP by depth on open water,
//                  and a hillshade off the sampled heights so a ridge somebody
//                  raised an hour ago reads as a ridge
//   the realm      the edge of the realm circle (ZONE.greenwold: 2200 m), as a
//                  faint line, and only where the line really crosses the square
//   the tiles      the editor's 256 m lattice, faint, in editor mode only,
//                  because in play mode it is furniture nobody asked for
//   the marks      every authored space and every editor tile space in view,
//                  with its name in small caps, and the named places the world
//                  already stands on where a `places` hook is handed over
//   you            a gold arrow at your own point on the map, turned to the
//                  camera's yaw through compass.headingOf, so the arrow and the
//                  compass strip can never disagree about which way is north
//   the waypoint   the mark win_map.js sets, held to the edge when it is off
//   the furniture  an N at the top, a scale bar whose number is worked out from
//                  the span and never typed, and a readout line under the map
//
// ---- what it costs --------------------------------------------------------
//
// THE GROUND IS THE EXPENSIVE HALF and it is on a leash: at most twice a
// second, and only when the player has moved more than MINIMAP.moveM metres,
// the terrain version has changed, or the zoom has. Everything else is the
// second layer: the arrow and the waypoint, cleared and redrawn, and only when
// the yaw or the position they were drawn at has actually moved.
//
// The numbers are measured by `src/game/minimap.test.mjs` against the real
// world field and printed there, so a repaint that gets slower says so.
//
// ---- the controls ---------------------------------------------------------
//
//   wheel     zoom, MINIMAP.minSpan to MINIMAP.maxSpan metres across
//   click     in dev mode, warp to that point through the `onWarp` hook, and
//             say where it went. Outside dev mode a click says why not.
//   hover     the world coordinates under the cursor, in the readout line
//
// Every one of those says something in the readout line, because a control
// that does its work in silence is indistinguishable from a broken one.

import { theme } from './ui_theme.js';
import { headingOf, coordsText, markerName } from './compass.js';
import {
  BIOME_PAINT, REALM_PAINT, WATER_SHALLOW, WATER_DEEP, WATER_FLOOR,
  labelFor, blur,
  paintGuideArt, paintGuideZones, GUIDE_MINIMAP_ALPHA,
} from './map_paint.js';
import { GUIDE_ZONES, guideArt, loadGuideArt, onGuideArt } from '../mmo/greenwold_guide.js';
import { BIOMES, SEA_LEVEL, PAINT_BIOME } from '../world/field.js';
import { GROUND_WORDS } from '../world/terrain_edits.js';
import { ZONE, weightOf } from '../world/zones.js';
import { SPACES } from '../mmo/spaces/index.js';
import {isDestination} from '../mmo/greenwold/navigation.js';

/**
 * Every number the minimap is built out of, in one place, because the CSS, the
 * editor's top dock and the tests all have to agree about the same box.
 *
 * `top` is under the dev badge and not beside it: hud.js's DEV_BADGE_H says the
 * badge is 30.2 px tall from a top of 14, so 52 leaves 7.8 px of air. hud.js
 * proves the two boxes do not touch rather than trusting this comment.
 */
export const MINIMAP = {
  /** the drawing itself, square, in CSS pixels. */
  size: 220,
  /** the frame around it. */
  border: 1, padX: 5, padTop: 4, padBottom: 4, footer: 15,
  /** where it sits, px from the top right of the HUD. */
  top: 52, right: 14,

  /** how much world it shows across, and the two ends of the wheel. */
  span: 1000, minSpan: 500, maxSpan: 4000,
  /** one notch of the wheel. */
  zoomStep: 1.25,

  /**
   * The ground grid: cells across the square, and draw cells per cell.
   *
   * COUNTED, NOT CHOSEN. `field.sampleAt` is three quarters of the cost of a
   * repaint and it runs about 2.5 microseconds on the generated world, so a 4 ms
   * budget buys somewhere near a thousand samples in total. Measured on the real
   * field over 57 repaints at places the field had never been asked about:
   *
   *   cells 24   median 2.15 ms   worst 3.62 ms
   *   cells 26   median 2.05 ms   worst 3.09 ms      <- this
   *   cells 28   median 2.35 ms   worst 3.60 ms
   *   cells 30   median 2.75 ms   worst 3.98 ms
   *
   * 26 cells is 729 samples, 38 m of ground each at the opening zoom and 19 m at
   * the closest. `minimap.test.mjs` measures it again on every run and fails at
   * 4 ms, so raising this is a measurement and not an opinion.
   */
  cells: 20, drawScale: 2,
  /** how much two composed colours may differ and still merge into one run. */
  colourStep: 5,

  /** the leash on the ground repaint: seconds, and metres of movement. */
  paintEvery: 0.5, moveM: 8,

  /** the editor's own lattice, from editor.js's TILE_M. Faint, editor only. */
  tile: 256,

  /**
   * How many marks a 220 px square holds before the names start writing over
   * one another. Counted: a name is about 60 px wide and a row is about 12 px
   * tall, so fourteen of them is already a busy square, and the world offers
   * eighty within a 2 km reach at the widest zoom.
   */
  maxMarks: 14,

  /** how far the arrow's yaw or point may move before layer two is redrawn. */
  yawEps: 0.004, moveEps: 0.25,

  /** type. Small caps is uppercase at a small size, the way the chart writes. */
  nameFont: 8.5, furnitureFont: 9,
};
/** The whole widget's box, borders and readout line included. */
MINIMAP.outerW = MINIMAP.size + MINIMAP.padX * 2 + MINIMAP.border * 2;
MINIMAP.outerH = MINIMAP.padTop + MINIMAP.size + MINIMAP.footer
  + MINIMAP.padBottom + MINIMAP.border * 2;

/**
 * How far from the right edge of the screen anything else must stay to leave
 * the minimap's column free. `editor/panel.js` reads this for its top dock.
 */
export const MINIMAP_CLEAR = MINIMAP.right + MINIMAP.outerW + 10;

/**
 * Pure. The widget's box on a screen `screenW` wide, px from the top left of
 * the HUD, in the same shape hud.js's `placeBox` hands back.
 */
export function minimapBox(screenW = 1280) {
  const left = screenW - MINIMAP.right - MINIMAP.outerW;
  return {
    left, right: left + MINIMAP.outerW,
    top: MINIMAP.top, bottom: MINIMAP.top + MINIMAP.outerH,
    width: MINIMAP.outerW, height: MINIMAP.outerH,
  };
}

// ------------------------------------------------------------- the paints --

/**
 * The chart colour of the ground brushes that carry no biome of their own.
 *
 * `field.sampleAt` carries a painted word out as `sample.ground`, and four of
 * the ten take a biome with them (`field.PAINT_BIOME`: grass, sand, rock,
 * snow). Those four need nothing here, because BIOME_PAINT already answers for
 * them and giving them a second colour would draw a seam where a grass brush
 * was laid over meadow and nothing on the ground had changed.
 *
 * The other six have no biome anywhere in the engine, so a map that reads the
 * biome alone shows a dirt yard, a mud wallow, a gravel bed, an ash flat, a
 * cobbled square and a worn path as whatever the country under them was: six of
 * the ten brushes painting nothing a player could see.
 *
 * DERIVED, NOT CHOSEN. Each one is `editor/modes.groundColour(word)`, which is
 * itself derived from the word's own `PAINT_MIX` layer weights, lifted
 * GROUND_LIFT of the way toward map_paint's PAPER so a name written over it
 * still reads. They are MIRRORED here rather than imported because modes.js
 * reaches terrain_material.js, which imports THREE, and the map has to run in
 * node with no renderer, exactly as map_paint mirrors CANOPY_DENSITY out of
 * arbor.js for the same reason. `minimap.test.mjs` imports the real
 * `groundColour` and fails if the two ever drift by more than a rounding.
 */
export const GROUND_PAINT = {
  dirt: [145, 126, 97],      // #6e5a41
  mud: [155, 135, 104],      // #7b674c
  gravel: [150, 135, 111],   // #756755
  ash: [152, 133, 106],      // #77654e
  cobble: [148, 136, 113],   // #726859
  path: [148, 129, 99],      // #725e44
};
/** How far a ground swatch is lifted toward the paper to become chart paint. */
export const GROUND_LIFT = 0.30;
/** The paper every chart colour is lifted toward. map_paint's own PAPER. */
export const GROUND_PAPER = [228, 209, 170];

/** How much of a realm's own colour a minimap takes. A chart takes all of it. */
export const REALM_TINT = 0.55;

/** How far a hillshade may lighten or darken the ground it is over. */
export const SHADE = 0.30;
/** The least relief, in metres, a view is allowed to stretch its shading over. */
export const RELIEF_FLOOR = 2;

/**
 * Everything this file promises about its own tables, checked at import.
 *
 * A brush with no colour paints nothing and says nothing, and a colour for a
 * brush that does not exist is a line nobody will ever delete. Both directions,
 * because a check that only runs one way passes when the list is emptied.
 */
export function auditMinimap() {
  const bad = [];
  for (const w of GROUND_WORDS) {
    const byBiome = !!PAINT_BIOME[w];
    const byPaint = !!GROUND_PAINT[w];
    if (!byBiome && !byPaint) bad.push(`the ground brush "${w}" paints nothing on the minimap: it has no biome and no colour`);
    if (byBiome && byPaint) bad.push(`the ground brush "${w}" has two colours on the minimap, its biome's and its own`);
  }
  for (const w of Object.keys(GROUND_PAINT)) if (!GROUND_WORDS.includes(w)) bad.push(`the minimap paints "${w}", which no ground brush lays down`);
  for (const b of Object.values(PAINT_BIOME)) if (!BIOME_PAINT[b]) bad.push(`a ground brush takes the biome "${b}", which has no paint`);
  for (const b of BIOMES) if (!BIOME_PAINT[b]) bad.push(`the biome "${b}" has no paint`);
  if (MINIMAP.minSpan > MINIMAP.span || MINIMAP.span > MINIMAP.maxSpan) bad.push('the opening span is outside the two ends of the wheel');
  if (bad.length) throw new Error(`minimap: ${bad.join('; ')}`);
  return {
    grounds: GROUND_WORDS.length, byBiome: Object.keys(PAINT_BIOME).length,
    byPaint: Object.keys(GROUND_PAINT).length, biomes: BIOMES.length, cells: MINIMAP.cells,
  };
}

// -------------------------------------------------------------- the maths --

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const mix = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/**
 * The rectangle of world the square is showing. `mpp` is metres per pixel and
 * is the ONE number both directions of the mapping go through, so a pixel that
 * has been turned into metres comes back to the pixel it started at.
 */
export function viewOf(cx, cz, span = MINIMAP.span, size = MINIMAP.size) {
  return { cx, cz, span, size, half: size / 2, mpp: span / size };
}

/** World point to pixel, north up: +x right, +z down, so -z is up. */
export const pxOf = (v, x, z) => [v.half + (x - v.cx) / v.mpp, v.half + (z - v.cz) / v.mpp];

/** Pixel back to world point. The inverse of `pxOf`, through the same `mpp`. */
export const worldOf = (v, px, py) => [v.cx + (px - v.half) * v.mpp, v.cz + (py - v.half) * v.mpp];

/** Is this pixel inside the square, with `m` px of margin taken off each side? */
export const inSquare = (v, px, py, m = 0) => px >= m && px <= v.size - m && py >= m && py <= v.size - m;

/**
 * Which way the arrow points, in canvas radians, for an arrow drawn pointing up
 * at rotation zero. It IS the compass bearing: rotating (0, -1) by a bearing b
 * gives (sin b, -cos b), and compass.headingOf turns player.js's forward
 * (sin yaw, cos yaw) into exactly that bearing. So the arrow and the strip read
 * the same heading out of the same function and cannot drift apart.
 */
export const arrowAngle = (yaw) => headingOf(yaw);

/** One notch of the wheel, clamped to the two ends. Whole metres, so it settles. */
export function zoomTo(span, deltaY) {
  const k = deltaY > 0 ? MINIMAP.zoomStep : 1 / MINIMAP.zoomStep;
  return clamp(Math.round(span * k), MINIMAP.minSpan, MINIMAP.maxSpan);
}

/** The rounds a scale bar is allowed to be, shortest first. */
export const SCALE_LADDER = [25, 50, 100, 250, 500, 1000, 2000];

/**
 * The bar under the map: the longest round distance that is no more than a
 * quarter of the span, and how many pixels of it that is. The number is worked
 * out from the span every time and is never typed beside the drawing.
 */
export function scaleBarFor(span = MINIMAP.span, size = MINIMAP.size) {
  const want = span / 4;
  let m = SCALE_LADDER[0];
  for (const v of SCALE_LADDER) if (v <= want) m = v;
  return { metres: m, px: (m / span) * size, label: m < 1000 ? `${m} m` : `${m / 1000} km` };
}

/**
 * The pieces of a circle's edge that really cross the square, as runs of
 * pixel points, so nothing is drawn outside the drawing and a circle nowhere
 * near the view costs one hypot and stops.
 *
 * The angular window is worked out first from the law of cosines against the
 * square's own circumscribed circle, so a 2200 m realm rim seen 900 m away is
 * a few dozen points and not the fourteen kilometres of its whole edge.
 */
export function circleRuns(v, cx, cz, r, margin = 0) {
  const runs = [];
  if (!(r > 0)) return runs;
  // the direction is FROM the circle's centre TOWARD the view, because the
  // angles below are angles about the circle's centre. Written the other way
  // round it sampled the far side of the realm and drew nothing at all.
  const dx = v.cx - cx, dz = v.cz - cz;
  const d = Math.hypot(dx, dz);
  const R = (v.span / 2) * Math.SQRT2;            // the square's own reach
  if (Math.abs(d - r) > R) return runs;           // the edge is nowhere near
  let a0 = 0, a1 = Math.PI * 2;
  if (d > 1e-6) {
    const cosw = (r * r + d * d - R * R) / (2 * r * d);
    if (cosw > 1) return runs;
    if (cosw >= -1) {
      const w = Math.acos(clamp(cosw, -1, 1));
      const mid = Math.atan2(dz, dx);
      a0 = mid - w; a1 = mid + w;
    }
  }
  // one point every two pixels along the arc, and never fewer than a degree
  const steps = clamp(Math.ceil(((a1 - a0) * r) / (v.mpp * 2)), 8, 2048);
  let run = null;
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    const [px, py] = pxOf(v, cx + Math.cos(a) * r, cz + Math.sin(a) * r);
    if (inSquare(v, px, py, margin)) {
      (run ||= []).push([px, py]);
    } else if (run) { if (run.length > 1) runs.push(run); run = null; }
  }
  if (run && run.length > 1) runs.push(run);
  return runs;
}

/**
 * Where a lattice of `step` metres crosses the square, in pixels. The lines are
 * the world's own multiples of the step, so they stand still under the map as
 * you fly rather than sliding with you.
 */
export function gridLines(v, step = MINIMAP.tile) {
  const out = { xs: [], zs: [], step };
  const hx = v.span / 2;
  for (let x = Math.ceil((v.cx - hx) / step) * step; x <= v.cx + hx; x += step) {
    const [px] = pxOf(v, x, v.cz);
    if (px >= 0 && px <= v.size) out.xs.push(px);
  }
  for (let z = Math.ceil((v.cz - hx) / step) * step; z <= v.cz + hx; z += step) {
    const [, py] = pxOf(v, v.cx, z);
    if (py >= 0 && py <= v.size) out.zs.push(py);
  }
  return out;
}

/** A name short enough to write on a 220 px square. */
export const shortName = (name, max = 16) => {
  const s = labelFor(String(name == null ? '' : name).trim());
  if (!s) return '';
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}.` : s;
};

/**
 * Where a centred label of width `w` may be written so no letter of it leaves
 * the square. A name too wide for the square at all is centred and trimmed by
 * the caller, which is why this clamps rather than throwing.
 */
export function labelX(px, w, size = MINIMAP.size, pad = 2) {
  const lo = pad + w / 2, hi = size - pad - w / 2;
  if (lo > hi) return size / 2;
  return clamp(px, lo, hi);
}

/**
 * Every mark that stands inside the square: the authored spaces and the
 * editor's tile spaces first, then whatever a `places` hook offers that is not
 * already one of them.
 *
 * A mark whose centre is outside the square is dropped rather than clamped to
 * the rim, because a name pinned to the edge of a map is a lie about where the
 * place is.
 *
 * THE SQUARE HAS A CAPACITY, and it is counted rather than found out later.
 * Two hundred and twenty pixels hold about fourteen names before they are
 * writing over one another; at the widest zoom the world offers eighty. So the
 * places are taken nearest first up to `MINIMAP.maxMarks` and the rest are
 * counted, never silently lost: `paintMinimap` hands the number back and the
 * readout can say it. The spaces are never thinned, because a space is a thing
 * somebody put there by hand and is the reason the map is on the screen.
 */
export function marksIn(v, spaces, places = null, cap = MINIMAP.maxMarks, editor = true) {
  const out = [];
  const seen = new Set();
  let dropped = 0;
  const make = (id, name, x, z, r, isSpace) => {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return null;
    if (id && seen.has(id)) return null;
    const [px, py] = pxOf(v, x, z);
    if (!inSquare(v, px, py)) return null;
    if (id) seen.add(id);
    return { id, name: name || id, x, z, px, py, r: r || 0, isSpace, d: Math.hypot(x - v.cx, z - v.cz) };
  };
  for (const sp of Object.values(spaces || {})) {
    if (!sp || !sp.at) continue;
    if (!editor && !isDestination(sp)) continue;
    const m = make(sp.id, sp.name, sp.at.x, sp.at.z, sp.radius || 0, true);
    if (m) out.push(m);
  }
  const rest = [];
  for (const s of places || []) {
    if (!s || s.kind === 'space') continue;
    const m = make(s.id, s.name, s.x, s.z, 0, false);
    if (m) rest.push(m);
  }
  rest.sort((a, b) => a.d - b.d);
  for (const m of rest) {
    if (out.length >= cap) { dropped++; continue; }
    out.push(m);
  }
  out.dropped = dropped;
  return out;
}

// ------------------------------------------------------------ the sampling --

/** Bilinear read of a grid at fractional cell coordinates. */
function bilin(a, n, u, w) {
  let i = Math.floor(u), j = Math.floor(w);
  if (i < 0) i = 0; else if (i > n - 2) i = n - 2;
  if (j < 0) j = 0; else if (j > n - 2) j = n - 2;
  const fu = u - i, fw = w - j;
  const o = j * n + i;
  const a0 = a[o] + (a[o + 1] - a[o]) * fu;
  const a1 = a[o + n] + (a[o + n + 1] - a[o + n]) * fu;
  return a0 + (a1 - a0) * fw;
}

/**
 * The ground under the square, as three colour grids, sampled from the field
 * itself and from nothing else. Every hop it takes is one map_paint takes.
 *
 * @returns { n, r, g, b, samples, painted, wet, hi, lo }
 */
export function sampleMinimap(field, v, cells = MINIMAP.cells) {
  const n = cells + 1;
  const d = v.span / cells;
  const x0 = v.cx - v.span / 2, z0 = v.cz - v.span / 2;
  const N = n * n;
  const r = new Float32Array(N), g = new Float32Array(N), b = new Float32Array(N);
  const h = new Float32Array(N);
  let painted = 0, wet = 0, hi = -Infinity, lo = Infinity;

  for (let j = 0; j < n; j++) {
    const wz = z0 + j * d;
    for (let i = 0; i < n; i++) {
      const wx = x0 + i * d;
      const s = field.sampleAt(wx, wz);
      const o = j * n + i;
      h[o] = s.h;
      if (s.h > hi) hi = s.h;
      if (s.h < lo) lo = s.h;
      // OPEN WATER IS `biome === 'ocean'`, the same rule map_paint's own header
      // sets out: `s.water` is only `h < SEA_LEVEL`, and every river bed in the
      // world is carved under that, so reading it paints the rivers as sea.
      const open = s.biome === 'ocean';
      let c;
      if (open) {
        wet++;
        c = mix(WATER_SHALLOW, WATER_DEEP, clamp01((SEA_LEVEL - s.h) / WATER_FLOOR));
      } else {
        const brush = s.ground ? GROUND_PAINT[s.ground] : null;
        if (brush) painted++;
        c = brush || BIOME_PAINT[s.biome] || BIOME_PAINT.meadow;
        const zn = s.realm ? ZONE[s.realm] : null;
        const rp = zn ? REALM_PAINT[zn.id] : null;
        if (rp) {
          const w = weightOf(zn, wx, wz);
          if (w > 0) c = mix(c, rp.paint, rp.mix * w * REALM_TINT);
        }
      }
      r[o] = c[0]; g[o] = c[1]; b[o] = c[2];
    }
  }

  // The relief. A hillshade off the sampled heights with the light in the north
  // west, plus a little lightening with height, so that on the flat world the
  // Greenwold is being sculpted on a raised ridge reads as a ridge and dead
  // level ground reads as one colour rather than as noise. The stretch has a
  // floor (RELIEF_FLOOR) so a view with two metres in it is not amplified into
  // a mountain range.
  const relief = Math.max(RELIEF_FLOOR, hi - lo);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const o = j * n + i;
      const xa = h[o - (i > 0 ? 1 : 0)], xb = h[o + (i < n - 1 ? 1 : 0)];
      const za = h[o - (j > 0 ? n : 0)], zb = h[o + (j < n - 1 ? n : 0)];
      const gx = (xb - xa) / (d * ((i > 0 ? 1 : 0) + (i < n - 1 ? 1 : 0)) || d);
      const gz = (zb - za) / (d * ((j > 0 ? 1 : 0) + (j < n - 1 ? 1 : 0)) || d);
      const lam = (-gx - gz) / Math.SQRT2;
      const shade = 1 + SHADE * Math.tanh(lam * 3);
      const tone = 0.90 + 0.20 * clamp01((h[o] - lo) / relief);
      const k = shade * tone;
      r[o] = clamp(r[o] * k, 0, 255);
      g[o] = clamp(g[o] * k, 0, 255);
      b[o] = clamp(b[o] * k, 0, 255);
    }
  }
  // one soft pass, so the sample lattice does not show through as squares
  blur(r, n, n, 1, 1); blur(g, n, n, 1, 1); blur(b, n, n, 1, 1);
  return { n, r, g, b, samples: N, painted, wet, hi, lo, relief };
}

/**
 * The ground, drawn. One `fillRect` per run of equal colour along a row, which
 * on the flat world the editor makes is a handful of rectangles for the whole
 * square and on broken country is a few hundred.
 */
export function composeMinimap(ctx, v, grid, ds = MINIMAP.drawScale) {
  const cells = grid.n - 1;
  const dw = cells * ds;
  const cell = v.size / dw;
  const q = MINIMAP.colourStep;
  const step = (x) => Math.min(255, Math.round(x / q) * q);
  let rects = 0;
  for (let j = 0; j < dw; j++) {
    const w = (j + 0.5) / ds;
    const y = j * cell;
    let runAt = 0, runCol = null;
    for (let i = 0; i <= dw; i++) {
      let col = null;
      if (i < dw) {
        const u = (i + 0.5) / ds;
        col = `rgb(${step(bilin(grid.r, grid.n, u, w))},${step(bilin(grid.g, grid.n, u, w))},${step(bilin(grid.b, grid.n, u, w))})`;
      }
      if (col !== runCol) {
        if (runCol !== null) {
          ctx.fillStyle = runCol;
          // the last cell of a row runs to the edge exactly, so no seam of
          // background shows down the right hand side of the square
          const x0 = runAt * cell;
          const x1 = i >= dw ? v.size : i * cell;
          ctx.fillRect(x0, y, x1 - x0, j === dw - 1 ? v.size - y : cell);
          rects++;
        }
        runCol = col; runAt = i;
      }
    }
  }
  return rects;
}

// ---------------------------------------------------------------- the draw --

const face = (size, weight = '') => `${weight ? weight + ' ' : ''}${size.toFixed(1)}px ${theme.fonts.display}`;

function tracking(g, px) {
  if (!('letterSpacing' in g)) return false;
  try { g.letterSpacing = `${px.toFixed(2)}px`; return true; } catch { return false; }
}

/** A word with a dark halo behind it. One fillText per label, never two. */
function haloText(g, text, x, y, fill, halo = 'rgba(8,7,5,.85)', width = 3) {
  g.lineWidth = width;
  g.lineJoin = 'round';
  g.strokeStyle = halo;
  g.strokeText(text, x, y);
  g.fillStyle = fill;
  g.fillText(text, x, y);
}

/** The name, trimmed until it fits inside the square with room to spare. */
function fitName(g, name, maxPx) {
  let s = shortName(name);
  while (s.length > 3 && g.measureText(s).width > maxPx) s = `${s.slice(0, s.length - 2).trimEnd()}.`;
  return s;
}

/**
 * Everything that does not move: the ground, the realm edge, the lattice, the
 * marks, the N and the scale bar. This is the half on the leash.
 *
 * @returns a small report, so the test and the dev console can count what
 *          landed rather than take the drawing on trust.
 */
export function paintMinimap(ctx, opts = {}) {
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const v = opts.view;
  const field = opts.field;
  if (!field) throw new Error('minimap: no field. Pass the world field from createWorldField.');
  ctx.save();
  // THE BACKING STORE IS BIGGER THAN THE BOX on a retina screen, and every
  // coordinate below is in CSS pixels, so the whole drawing is scaled once
  // here. Eight and a half pixel type at half the screen's resolution is a
  // grey smudge, and this square is nothing but small type.
  if (opts.dpr && opts.dpr !== 1) ctx.scale(opts.dpr, opts.dpr);
  const grid = opts.grid || sampleMinimap(field, v, opts.cells ?? MINIMAP.cells);
  const tSampled = (typeof performance !== 'undefined' ? performance.now() : Date.now());

  // ---- the painting, under everything -------------------------------------
  //
  // The user's hand painted Greenwold, laid down through the guide's own frame
  // so this square and the zone map agree about where the painted village is.
  // The composed ground then goes over it at GUIDE_MINIMAP_ALPHA, so the ground
  // somebody sculpted an hour ago is still readable and the picture is still
  // there under it. With no picture the alpha is 1 and this is the square as it
  // was. `src/mmo/greenwold_guide.js` and docs/mmo/wiring/MAP3-GUIDE.md.
  const at = (x, z) => pxOf(v, x, z);
  const art = opts.art !== undefined ? opts.art : guideArt();
  const wantArt = !!(art && art.state === 'ready' && typeof ctx.drawImage === 'function');
  if (wantArt) {
    // An opaque backdrop under the sheet, because the sheet does not cover the
    // whole square at every zoom and the ground over it is only half there.
    // Without it the country beyond the painting's edge is the last frame with
    // half of this one over it, and it darkens on every repaint.
    ctx.fillStyle = `rgb(${GROUND_PAPER[0]},${GROUND_PAPER[1]},${GROUND_PAPER[2]})`;
    ctx.fillRect(0, 0, v.size, v.size);
  }
  const painting = paintGuideArt(ctx, { art, at, w: v.size, h: v.size });
  if (painting.drawn) ctx.globalAlpha = GUIDE_MINIMAP_ALPHA;
  const rects = composeMinimap(ctx, v, grid, opts.drawScale ?? MINIMAP.drawScale);
  if (painting.drawn) ctx.globalAlpha = 1;

  // ---- the editor's lattice, in editor mode only -------------------------
  let gridLinesDrawn = 0;
  if (opts.editor) {
    const g = gridLines(v, MINIMAP.tile);
    ctx.setLineDash([]);
    ctx.strokeStyle = 'rgba(20,16,10,.20)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const px of g.xs) { ctx.moveTo(px, 0); ctx.lineTo(px, v.size); gridLinesDrawn++; }
    for (const py of g.zs) { ctx.moveTo(0, py); ctx.lineTo(v.size, py); gridLinesDrawn++; }
    if (gridLinesDrawn) ctx.stroke();
  }

  // ---- the realm's own edge ----------------------------------------------
  let realmRuns = 0;
  const zone = opts.zone;
  if (zone && Number.isFinite(zone.x) && Number.isFinite(zone.r)) {
    const runs = circleRuns(v, zone.x, zone.z, zone.r);
    if (runs.length) {
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = 'rgba(46,34,18,.42)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (const run of runs) {
        ctx.moveTo(run[0][0], run[0][1]);
        for (let i = 1; i < run.length; i++) ctx.lineTo(run[i][0], run[i][1]);
        realmRuns++;
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // ---- the guide ----------------------------------------------------------
  //
  // The same twelve boundaries and the same twelve names the zone map draws,
  // out of the same function, so the two can never disagree about where a
  // space is. `centresOnly` is this square's own rule: a space whose middle is
  // off the square is not drawn, because a name pinned to the rim is a lie
  // about where the place is, which is `marksIn`'s rule as well.
  //
  // The traced roads and the river are NOT drawn here: 220 pixels of small type
  // and hairlines has room for the boundaries or for the lines, and the
  // boundaries are what the square is for.
  const guide = opts.guide === false
    ? { drawn: 0, named: 0, rings: 0 }
    : paintGuideZones(ctx, {
      at, mpp: v.mpp, w: v.size, h: v.size, centresOnly: true,
      nameSize: MINIMAP.nameFont, zones: opts.guideZones || GUIDE_ZONES,
      clampX: (px, w) => labelX(px, w, v.size),
    });

  // ---- the marks ----------------------------------------------------------
  const marks = marksIn(v, opts.spaces, opts.places, MINIMAP.maxMarks, !!opts.editor);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = face(MINIMAP.nameFont, '600');
  tracking(ctx, 0.6);
  let named = 0, rings = 0;
  for (const m of marks) {
    // a space says how far it reaches, because that is the ground the editor
    // has taken hold of and nothing random stands inside it
    if (m.isSpace && m.r > 0) {
      const rr = m.r / v.mpp;
      if (rr > 2 && rr < v.size) {
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = 'rgba(201,164,74,.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(m.px, m.py, rr, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        rings++;
      }
    }
    ctx.beginPath();
    ctx.arc(m.px, m.py, m.isSpace ? 2.6 : 2, 0, Math.PI * 2);
    ctx.fillStyle = m.isSpace ? theme.gold : 'rgba(74,54,32,.92)';
    ctx.fill();
    const text = fitName(ctx, m.name, v.size - 8);
    if (!text) continue;
    const w = ctx.measureText(text).width;
    // under the dot, unless there is no room under it, and then over it
    const below = m.py + 9 <= v.size - 3;
    haloText(ctx, text, labelX(m.px, w, v.size), below ? m.py + 9 : m.py - 5,
      m.isSpace ? theme.goldBright : theme.parchment);
    named++;
  }

  // ---- the furniture ------------------------------------------------------
  ctx.font = face(MINIMAP.furnitureFont, '700');
  tracking(ctx, 1);
  haloText(ctx, 'N', v.size / 2, 12, theme.gold);
  const bar = scaleBarFor(v.span, v.size);
  const by = v.size - 8, bx = 8;
  ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(8,7,5,.85)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(bx, by); ctx.lineTo(bx + bar.px, by);
  ctx.moveTo(bx, by - 3); ctx.lineTo(bx, by + 3);
  ctx.moveTo(bx + bar.px, by - 3); ctx.lineTo(bx + bar.px, by + 3);
  ctx.stroke();
  ctx.strokeStyle = theme.goldBright;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.font = face(MINIMAP.furnitureFont - 1);
  tracking(ctx, 0.5);
  ctx.textAlign = 'left';
  haloText(ctx, bar.label, bx, by - 5, theme.parchment);
  tracking(ctx, 0);
  ctx.restore();

  const t1 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  return {
    ms: t1 - t0, msField: tSampled - t0,
    rects, marks: marks.length, dropped: marks.dropped || 0, named, rings, realmRuns,
    gridLines: gridLinesDrawn,
    art: art ? art.state : 'idle', painting: painting.drawn,
    guide: guide.drawn, guideNamed: guide.named, guideRings: guide.rings,
    samples: grid.samples, painted: grid.painted, wet: grid.wet,
    scale: bar, view: v,
  };
}

/**
 * The live half: you, and your mark. Cleared and drawn on its own layer, so
 * turning on the spot never touches the ground underneath.
 */
export function paintLive(ctx, opts = {}) {
  const v = opts.view;
  ctx.save();
  if (opts.dpr && opts.dpr !== 1) ctx.scale(opts.dpr, opts.dpr);
  ctx.clearRect(0, 0, v.size, v.size);
  let waypoint = null;
  const wp = opts.waypoint;
  if (wp && Number.isFinite(wp.x) && Number.isFinite(wp.z)) {
    let [px, py] = pxOf(v, wp.x, wp.z);
    const off = !inSquare(v, px, py, 7);
    px = clamp(px, 7, v.size - 7); py = clamp(py, 7, v.size - 7);
    ctx.save();
    ctx.translate(px, py);
    ctx.beginPath();
    ctx.moveTo(0, -5); ctx.lineTo(4.4, 0); ctx.lineTo(0, 5); ctx.lineTo(-4.4, 0);
    ctx.closePath();
    ctx.fillStyle = off ? 'rgba(143,224,255,.55)' : '#8fe0ff';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(8,7,5,.9)';
    ctx.stroke();
    ctx.restore();
    waypoint = { px, py, off, name: markerName(wp.name) };
  }

  // you, at your own point on the painted ground and not at the middle of the
  // square: between two repaints the ground is up to MINIMAP.moveM metres stale
  // and the arrow walks across it, which is what makes movement visible at all
  const [ax, ay] = pxOf(v, opts.x, opts.z);
  const a = arrowAngle(opts.yaw || 0);
  ctx.save();
  ctx.translate(clamp(ax, 6, v.size - 6), clamp(ay, 6, v.size - 6));
  ctx.rotate(a);
  ctx.beginPath();
  ctx.moveTo(0, -7.5);
  ctx.lineTo(5, 6);
  ctx.lineTo(0, 3);
  ctx.lineTo(-5, 6);
  ctx.closePath();
  ctx.fillStyle = theme.gold;
  ctx.fill();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = 'rgba(8,7,5,.92)';
  ctx.stroke();
  ctx.restore();
  ctx.restore();
  return { arrow: { px: ax, py: ay, angle: a }, waypoint };
}

// ----------------------------------------------------------------- the CSS --

const CSS = `
#bw-minimap, #bw-minimap * { box-sizing: border-box; }
#bw-hud #bw-minimap {
  position: absolute; top: ${MINIMAP.top}px; right: ${MINIMAP.right}px;
  width: ${MINIMAP.outerW}px; height: ${MINIMAP.outerH}px;
  padding: ${MINIMAP.padTop}px ${MINIMAP.padX}px ${MINIMAP.padBottom}px;
  background: linear-gradient(180deg, rgba(23,19,15,.88), rgba(9,8,6,.92));
  border: ${MINIMAP.border}px solid ${theme.goldDim}aa;
  box-shadow: 0 6px 24px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.06);
  pointer-events: auto; cursor: crosshair; z-index: 4;
}
/* z-index 4 is WITHIN THE HUD and does nothing about the editor. The HUD root
   is itself a stacking context at z 40 and the editor's screen is at z 60, so
   no number here can put the square over an editor dock. What keeps the two
   apart is editor/panel.js's TOP_DOCK_RIGHT, which is MINIMAP_CLEAR, and the
   boxes are measured in minimap.test.mjs rather than hoped for. The editor's
   root takes no pointer events and only its docks do, so with the docks out of
   this column the wheel and the click reach the square in editor mode. */
#bw-hud #bw-minimap::before, #bw-hud #bw-minimap::after {
  content: ''; position: absolute; width: 9px; height: 9px; pointer-events: none;
  border: 1px solid ${theme.gold};
}
#bw-hud #bw-minimap::before { left: -1px; top: -1px; border-right: 0; border-bottom: 0; }
#bw-hud #bw-minimap::after { right: -1px; bottom: -1px; border-left: 0; border-top: 0; }
#bw-minimap .face { position: relative; width: ${MINIMAP.size}px; height: ${MINIMAP.size}px; }
#bw-minimap canvas { position: absolute; left: 0; top: 0; width: ${MINIMAP.size}px; height: ${MINIMAP.size}px; display: block; }
#bw-minimap .rd {
  height: ${MINIMAP.footer}px; line-height: ${MINIMAP.footer}px;
  font-family: ${theme.fonts.display}; font-size: 9.5px; letter-spacing: .10em;
  text-transform: uppercase; color: ${theme.parchmentFaint};
  font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden;
  text-overflow: ellipsis; text-shadow: 0 1px 3px rgba(0,0,0,.9);
}
#bw-minimap .rd.said { color: ${theme.goldBright}; }
#bw-minimap.off { display: none; }
`;

/** What the frame says when you rest on it. Every control, in one breath. */
export const MINIMAP_TITLE = 'the minimap: north is up, you are the gold arrow. '
  + 'Wheel to zoom between 500 m and 4 km across. In dev mode, click to warp there. '
  + 'The dotted line is the edge of the realm; in the editor the faint lattice is the 256 m tiles. '
  + 'The dashed gold circles are the twelve spaces of the painted guide, and the painting itself is '
  + 'the ground under the terrain once it is at public/maps/greenwold.png.';

/**
 * Build the square and hand back an `update(dt)` to call once a frame.
 *
 * @param root  the node to mount into. hud.js mounts it in the HUD root.
 * @param opts  { field, player, camera, spaces, zone, onWarp,
 *                dirty, isDev, isEditor, waypoint, places, span, size, doc }
 *
 * `field`, `spaces`, `zone`, `waypoint` and `places` may each be a value or a
 * function returning one, because the runtime hands some of them over before
 * they exist and swaps others out underneath (a sculpt world is a new field).
 */
export function createMinimap(root, opts = {}) {
  const doc = opts.doc || (typeof document !== 'undefined' ? document : null);
  const call = (v, ...a) => (typeof v === 'function' ? v(...a) : v);
  const fieldOf = () => call(opts.field);
  const spacesOf = () => call(opts.spaces) || SPACES;
  const zoneOf = () => call(opts.zone) ?? ZONE.greenwold;
  const wpOf = () => call(opts.waypoint) || null;
  const isDev = () => !!call(opts.isDev);
  const isEditor = () => !!call(opts.isEditor);
  const dirtyOf = () => { const d = call(opts.dirty); return Number.isFinite(d) ? d : 0; };
  const atOf = () => (opts.player && opts.player.pos) || { x: 0, z: 0 };
  const yawOf = () => {
    const c = opts.camera;
    if (c && Number.isFinite(c.forwardYaw)) return c.forwardYaw;
    return opts.player && Number.isFinite(opts.player.yaw) ? opts.player.yaw : 0;
  };
  const placesOf = (x, z, r) => {
    if (typeof opts.places !== 'function') return opts.places || null;
    try { return opts.places(x, z, r) || null; } catch { return null; }
  };

  const size = opts.size ?? MINIMAP.size;
  let span = clamp(opts.span ?? MINIMAP.span, MINIMAP.minSpan, MINIMAP.maxSpan);
  // The device pixel ratio, capped at two. The square is 220 px of nothing but
  // small type and hairlines, and at one backing pixel per CSS pixel on a
  // retina screen every letter of it is drawn at half the resolution the screen
  // can show. Capped, because past two the compose is paying for detail no eye
  // will find. Everything below is written in CSS pixels; the painters scale.
  const screenDpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
  const dpr = Math.max(1, Math.min(2, opts.dpr ?? screenDpr));

  let el = null, faceEl = null, groundCv = null, liveCv = null, ground = null, live = null, rd = null;
  if (doc && root) {
    if (!doc.getElementById('bw-minimap-css')) {
      const st = doc.createElement('style');
      st.id = 'bw-minimap-css';
      st.textContent = CSS;
      doc.head.appendChild(st);
    }
    el = doc.createElement('div');
    el.id = 'bw-minimap';
    el.title = MINIMAP_TITLE;
    faceEl = doc.createElement('div');
    faceEl.className = 'face';
    el.appendChild(faceEl);
    groundCv = doc.createElement('canvas');
    groundCv.width = Math.round(size * dpr); groundCv.height = Math.round(size * dpr);
    faceEl.appendChild(groundCv);
    liveCv = doc.createElement('canvas');
    liveCv.width = Math.round(size * dpr); liveCv.height = Math.round(size * dpr);
    faceEl.appendChild(liveCv);
    rd = doc.createElement('div');
    rd.className = 'rd';
    el.appendChild(rd);
    root.appendChild(el);
    ground = groundCv.getContext ? groundCv.getContext('2d') : null;
    live = liveCv.getContext ? liveCv.getContext('2d') : null;
  }

  // ---- the state the leash is made of -------------------------------------
  let view = viewOf(atOf().x, atOf().z, span, size);
  let clock = 0;                 // seconds, from the frame's own dt
  let paintedAt = -1e9;          // when the ground was last painted
  let paintX = NaN, paintZ = NaN, paintSpan = 0, paintVersion = -1, paintEditor = null;
  let force = true;              // the first frame always paints
  let paints = 0, lives = 0, frames = 0;
  let lastGround = null, lastLive = null;
  // A FLAG AND NOT A SENTINEL. This was `liveYaw = NaN` meaning "redraw", and
  // every comparison against NaN is false, so the arrow was never drawn once in
  // the whole life of the widget. minimap.test.mjs caught it by counting the
  // redraws rather than by looking at the square.
  let liveDirty = true;
  // The picture is loaded once for the whole game, and this square repaints
  // when it lands. Without this the minimap would show the painting only after
  // the next time the player walked eight metres.
  let artOff = null;
  let liveYaw = 0, liveX = 0, liveZ = 0, liveWp = '';
  let said = '', saidFor = 0, hoverAt = null;
  let shown = true;

  const say = (text, sticky = 2.5) => {
    said = text || '';
    saidFor = said ? sticky : 0;
    writeReadout();
  };

  function readoutText() {
    if (said) return said;
    if (hoverAt) return `${coordsText({ x: hoverAt[0], z: hoverAt[1] })}`;
    const at = atOf();
    const here = coordsText(at) || '0, 0';
    // A THINNED MAP SAYS SO. `marksIn` keeps the nearest fourteen places and
    // counts the rest off; a square that quietly showed nine of thirty three
    // would be telling the player there are nine.
    const off = lastGround && lastGround.dropped > 0 ? `   and ${lastGround.dropped} more` : '';
    return here + off;
  }
  function writeReadout() {
    if (!rd) return;
    const t = readoutText();
    if (t !== rd.textContent) rd.textContent = t;
    rd.classList.toggle('said', !!said);
  }

  /** Where a pointer event landed, in the square's own pixels. */
  function pixelOf(ev) {
    if (!groundCv) return null;
    const box = typeof groundCv.getBoundingClientRect === 'function' ? groundCv.getBoundingClientRect() : null;
    if (box) return [(ev.clientX - box.left) * (size / (box.width || size)), (ev.clientY - box.top) * (size / (box.height || size))];
    if (Number.isFinite(ev.offsetX)) return [ev.offsetX, ev.offsetY];
    return null;
  }

  if (el) {
    artOff = onGuideArt(() => { force = true; });
    loadGuideArt();
    el.addEventListener('wheel', (ev) => {
      if (ev.preventDefault) ev.preventDefault();
      if (ev.stopPropagation) ev.stopPropagation();
      const want = zoomTo(span, ev.deltaY || 0);
      if (want === span) {
        say(want === MINIMAP.minSpan ? 'closest in: 500 m across' : 'furthest out: 4 km across');
        return;
      }
      span = want;
      force = true;
      say(`${span < 1000 ? `${span} m` : `${(span / 1000).toFixed(1)} km`} across`);
    }, { passive: false });
    el.addEventListener('pointermove', (ev) => {
      const p = pixelOf(ev);
      if (!p) return;
      hoverAt = worldOf(view, p[0], p[1]);
      if (!said) writeReadout();
    });
    el.addEventListener('pointerleave', () => { hoverAt = null; if (!said) writeReadout(); });
    el.addEventListener('pointerdown', (ev) => {
      if (ev.stopPropagation) ev.stopPropagation();
      const p = pixelOf(ev);
      if (!p) return;
      const [wx, wz] = worldOf(view, p[0], p[1]);
      if (!isDev()) { say('the minimap only warps in dev mode', 3); return; }
      if (typeof opts.onWarp !== 'function') { say('nothing is wired to warp to', 3); return; }
      const res = opts.onWarp(wx, wz);
      if (res && res.ok === false) say(res.text || 'that warp did not happen', 4);
      else say(`warped to ${Math.round(wx)}, ${Math.round(wz)}`, 3);
      force = true;
    });
  }

  /** Paint the ground now, whatever the leash says. Returns the report. */
  function repaint() {
    const field = fieldOf();
    if (!ground || !field) return null;
    const at = atOf();
    view = viewOf(at.x, at.z, span, size);
    const editor = isEditor();
    lastGround = paintMinimap(ground, {
      view, field, editor, dpr,
      spaces: spacesOf(),
      zone: zoneOf(),
      // exactly the ground the square covers, and no wider: a bigger reach is
      // cells the world has not rolled yet, which is the one thing here that can
      // cost more than the sampling does
      places: placesOf(at.x, at.z, span / 2),
    });
    paints++;
    paintedAt = clock;
    paintX = at.x; paintZ = at.z; paintSpan = span; paintEditor = editor;
    paintVersion = dirtyOf();
    // the arrow was drawn against the old view, so it is redrawn against this one
    liveDirty = true;
    return lastGround;
  }

  return {
    el, canvas: groundCv, liveCanvas: liveCv,

    /** The view the ground was last painted with. Pixels map through this. */
    get view() { return view; },
    get span() { return span; },
    /** How many ground repaints and how many live redraws have happened. */
    get paints() { return paints; },
    get lives() { return lives; },
    get frames() { return frames; },
    /** What the last ground paint and the last live draw put down. */
    get last() { return lastGround; },
    get live() { return lastLive; },
    get readout() { return rd ? rd.textContent : readoutText(); },

    /** The world point under a pixel of the square, and back again. */
    worldAt: (px, py) => worldOf(view, px, py),
    pixelAt: (x, z) => pxOf(view, x, z),

    /**
     * Once a frame, with the frame's own dt in seconds. The clock is dt and not
     * performance.now, so a test drives the leash instead of sleeping.
     */
    update(dt = 0) {
      frames++;
      clock += Number.isFinite(dt) ? dt : 0;
      if (saidFor > 0) {
        saidFor -= Number.isFinite(dt) ? dt : 0;
        if (saidFor <= 0) { said = ''; writeReadout(); }
      }
      if (!shown) return null;
      const at = atOf();
      const version = dirtyOf();
      const moved = Math.hypot(at.x - paintX, at.z - paintZ);
      const why = force ? 'forced'
        : !(paintVersion === version) ? 'terrain'
          : paintSpan !== span ? 'zoom'
            : paintEditor !== isEditor() ? 'mode'
              : !(moved <= MINIMAP.moveM) ? 'moved'
                : null;
      // The leash: a reason AND the half second.
      //
      // Two reasons jump it, and both of them are a thing the person just did
      // with their own hand: the wheel (which sets `force`) and stepping into
      // or out of the editor, where the lattice has to be there when the screen
      // changes rather than a third of a second later. Walking and sculpting go
      // on the leash, because those happen every frame.
      if (why && (force || why === 'mode' || clock - paintedAt >= MINIMAP.paintEvery)) {
        force = false;
        repaint();
      }
      if (!live) return lastGround;
      const yaw = yawOf();
      const wp = wpOf();
      const wpKey = wp ? `${wp.x},${wp.z},${wp.name || ''}` : '';
      if (liveDirty
        || Math.abs(yaw - liveYaw) > MINIMAP.yawEps
        || Math.abs(at.x - liveX) > MINIMAP.moveEps
        || Math.abs(at.z - liveZ) > MINIMAP.moveEps
        || wpKey !== liveWp) {
        lastLive = paintLive(live, { view, x: at.x, z: at.z, yaw, waypoint: wp, dpr });
        liveYaw = yaw; liveX = at.x; liveZ = at.z; liveWp = wpKey;
        liveDirty = false;
        lives++;
      }
      if (!said && !hoverAt) writeReadout();
      return lastGround;
    },

    /** Paint the ground on the next update whatever the leash would have said. */
    invalidate() { force = true; },

    /** Say a line in the readout, for a caller that did the warp itself. */
    say,

    /**
     * Show or hide the whole square. THERE IS NO SETTINGS TOGGLE FOR THIS YET:
     * its only caller today is a person at the console through
     * `window.__bw.minimap.setShown(false)`, and saying so here is cheaper than
     * somebody hunting the settings window for a switch that is not in it.
     */
    setShown(on) {
      shown = !!on;
      if (el) el.classList.toggle('off', !shown);
      if (shown) force = true;
    },
    get shown() { return shown; },

    dispose() {
      if (artOff) { artOff(); artOff = null; }
      if (el && el.parentNode) el.parentNode.removeChild(el);
    },
  };
}

export const MINIMAP_AUDIT = auditMinimap();

export default createMinimap;
