// What a level looks like from inside it.
//
// dungeon_gen.js says which cells are floor and which are rock. This turns that
// into geometry: a merged floor, merged walls, a merged CEILING, pillars along
// the hall walls, rubble and bones, braziers and wall torches, the way back up,
// the way further down, and (in a cave) real ore the pickaxe already knows how
// to break, plus still black pools of water.
//
// THREE is passed in rather than imported so this module owes nothing to a
// bundler and the generator stays the only thing node has to load.
//
// ---- why the walls were see-through --------------------------------------
// Two reasons, and both of them shipped.
//
//  1. A wall face was built only toward a neighbouring FLOOR cell, on a
//     MeshStandardMaterial at the three default of `side: FrontSide`. The face
//     between the camera and the room therefore had its one drawn side facing
//     AWAY from the camera, so the renderer culled it and you looked straight
//     through the near wall into the room. Every wall in the game was a
//     one-way mirror. Walls are `DoubleSide` now, and the test raycasts every
//     wall cell from the floor beside it AND from the rock outside it and
//     insists on a hit both ways.
//
//  2. There was no ceiling at all, on the argument that the orbit camera at six
//     metres would only ever see the underside of a slab. That is true, and the
//     answer is not to leave the level open to the sky: it is to keep the
//     camera under the roof. `cameraClamp` at the bottom of this file is that,
//     and main.js calls it. The ceiling's one drawn side faces DOWN, so a build
//     that has not called cameraClamp yet is no worse off than the roofless one
//     was: it looks in from above rather than at a black lid.
//
// ---- the roof, and how it meets the walls --------------------------------
// Ceiling height is a property of the CELL: 4 m over a corridor, 6 m over a
// room, 7 m over a hall, 8 m over the great hall at the bottom, and in a cave a
// dome that rises from the passage height at the cavern rim to the peak over
// its middle. Two neighbouring cells with different ceilings would leave a slot
// of daylight between them, so the roof is not built from cell heights at all:
// it is built from CORNER heights, `cornerCeil`, which is the lowest ceiling of
// the (up to four) floor cells that touch that corner. Adjacent cells share
// corners, so the roof is one continuous surface with no seam anywhere, and the
// top edge of a wall face reads the SAME two corner heights as the roof quad
// beside it, so wall and roof meet exactly.
//
// ---- the light budget ----------------------------------------------------
// Eight point lights, never nine, because every one of them costs a shader
// branch on every lit fragment. Six are a pool that follows the player: torch
// brackets and floor braziers stand all over the level, and each frame the six
// nearest to the player get the six lights, with a warm flicker on each. The
// other two are fixed on the entrance and on the stair down, so the two things
// you need to find are the two things always lit. Every other flame is an
// unlit, emissive mesh, which costs nothing.
//
// A light reaches TORCH_RANGE and no two light stands are closer than
// TORCH_SPACING cells, and TORCH_SPACING * CELL is larger than TORCH_RANGE, so
// at most six stands are ever within reach of the player at once and a torch
// therefore never visibly winks as the pool moves. dungeon.test.mjs measures
// the minimum separation rather than trusting this paragraph.

import { createTreeField, removeTreeField } from '../farm/tree_edit.js';
import { cellAt, walkable, worldOf, gridOf, roomAt, CELL } from './dungeon_gen.js';
import { mulberry32, hash2 } from './noise.js';

/** The lowest ceiling there is: a corridor. Kept under the old name. */
export const WALL_H = 4.0;

/** Ceiling height in metres by cell, per kind of place. */
export const CEIL = {
  dungeon: { corridor: 4.0, room: 6.0, hall: 7.0, boss: 8.0 },
  cave: { corridor: 4.0, room: 6.0, hall: 7.5, boss: 8.5 },
};

export const TORCH_POOL = 6;          // roaming lights
export const LIGHT_BUDGET = 8;        // pool + entrance + stair, and that is all
export const TORCH_RANGE = 10;        // metres a torch light reaches
export const TORCH_SPACING = 6;       // cells between light stands, so 12 m apart
export const TEX_M = 4;               // metres covered by one texture tile
export const TEX_SIZE = 512;          // pixels a side on every generated sheet

/** How the camera is kept off the rock and under the roof. See cameraClamp. */
export const CAM_MARGIN = 0.5;        // metres short of the wall it stops
export const CAM_CEIL_GAP = 0.4;      // metres it keeps below the ceiling
export const CAM_MIN_Y = 0.9;         // and above the floor

export const PALETTE = {
  dungeon: {
    floor: 0x6f675c, wallA: 0x7d7568, wallB: 0x655e54, cap: 0x4a443c,
    ceiling: 0x554f47,
    bg: 0x06060a, fog: 0x07070b, fogNear: 6, fogFar: 46,
    ambient: 0x5a6478, ambientI: 0.20,
    fill: 0x3c4a63, fillGround: 0x241d16, fillI: 0.16,
    wallTex: 'blocks', floorTex: 'flags', ceilTex: 'flags',
  },
  cave: {
    floor: 0x6b5c4c, wallA: 0x7a6858, wallB: 0x5f5145, cap: 0x453a30,
    ceiling: 0x4c4038,
    bg: 0x05060a, fog: 0x06070a, fogNear: 5, fogFar: 40,
    ambient: 0x4e5c6b, ambientI: 0.18,
    fill: 0x33465c, fillGround: 0x1e1912, fillI: 0.14,
    wallTex: 'rock', floorTex: 'gravel', ceilTex: 'rock',
  },
};

// ---------------------------------------------------------------------------
// A canvas, wherever we are.
//
// The texture sheets are drawn with fillRect and arc, which is a browser API.
// The generator has to stay loadable in node, so the canvas comes from an
// injectable factory and falls back to a stub that swallows every call and
// hands back blank pixels. Real geometry, real materials, no DOM.
// ---------------------------------------------------------------------------

let canvasFactory = null;

/** Inject a canvas maker. Pass null to go back to `document.createElement`. */
export function setDungeonCanvasFactory(fn) {
  canvasFactory = fn || null;
  TEX_CACHE.clear();
}

/** A canvas that draws nothing and reads back blank. Committed, not test-local. */
export function stubCanvasFactory(w, h) {
  const noop = () => {};
  const ctx = {
    canvas: null,
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, lineCap: 'butt', lineJoin: 'miter',
    globalCompositeOperation: 'source-over', globalAlpha: 1, filter: 'none',
    fillRect: noop, clearRect: noop, strokeRect: noop,
    beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop,
    bezierCurveTo: noop, quadraticCurveTo: noop, arc: noop, ellipse: noop,
    fill: noop, stroke: noop, save: noop, restore: noop,
    translate: noop, rotate: noop, scale: noop, setTransform: noop,
    drawImage: noop, putImageData: noop,
    createLinearGradient: () => ({ addColorStop: noop }),
    createRadialGradient: () => ({ addColorStop: noop }),
    getImageData: (x, y, gw, gh) => ({ width: gw, height: gh, data: new Uint8ClampedArray(gw * gh * 4) }),
    createImageData: (gw, gh) => ({ width: gw, height: gh, data: new Uint8ClampedArray(gw * gh * 4) }),
  };
  const c = { width: w, height: h, getContext: () => ctx, __stub: true };
  ctx.canvas = c;
  return c;
}

const CTX_NEEDS = ['fillRect', 'beginPath', 'arc', 'fill', 'stroke', 'moveTo', 'lineTo',
  'getImageData', 'createImageData', 'putImageData'];
let hostOk = null;

function canvasOf(w, h) {
  if (canvasFactory) return canvasFactory(w, h);
  if (hostOk === null) {
    hostOk = false;
    try {
      if (typeof document !== 'undefined' && document.createElement) {
        const c = document.createElement('canvas');
        c.width = 2; c.height = 2;
        const x = c.getContext && c.getContext('2d');
        if (x) hostOk = CTX_NEEDS.every((k) => typeof x[k] === 'function');
      }
    } catch { hostOk = false; }
  }
  if (!hostOk) return stubCanvasFactory(w, h);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// ---------------------------------------------------------------------------
// The stone sheets. Four families, each an albedo drawn beside a height field;
// the normal map and the roughness map are both read off the height, so a
// mortar course is recessed AND rougher than the block face beside it without
// anyone having to keep two drawings in step.
// ---------------------------------------------------------------------------

const TEX_CACHE = new Map();

/** Wrap a drawn canvas as a repeating texture. */
function texOf(THREE, c, srgb) {
  const t = new THREE.CanvasTexture(c);
  if (srgb && THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** Central-difference normal and a roughness read off the same height field. */
function mapsFromHeight(hc) {
  const n = hc.width;
  const src = hc.getContext('2d').getImageData(0, 0, n, n).data;
  const nc = canvasOf(n, n), rc = canvasOf(n, n);
  const nx = nc.getContext('2d'), rx = rc.getContext('2d');
  const nd = nx.createImageData(n, n), rd = rx.createImageData(n, n);
  const H = (i, j) => src[((((j % n) + n) % n) * n + (((i % n) + n) % n)) * 4] / 255;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const dx = (H(i + 1, j) - H(i - 1, j)) * 3.4;
    const dz = (H(i, j + 1) - H(i, j - 1)) * 3.4;
    const l = Math.hypot(dx, dz, 1);
    const o = (j * n + i) * 4;
    nd.data[o] = (-dx / l * 0.5 + 0.5) * 255;
    nd.data[o + 1] = (-dz / l * 0.5 + 0.5) * 255;
    nd.data[o + 2] = (1 / l * 0.5 + 0.5) * 255;
    nd.data[o + 3] = 255;
    // what stands proud is worn smoother; what is low is mortar and grit
    const r = 255 - H(i, j) * 64;
    rd.data[o] = 255; rd.data[o + 1] = r; rd.data[o + 2] = 0; rd.data[o + 3] = 255;
  }
  nx.putImageData(nd, 0, 0); rx.putImageData(rd, 0, 0);
  return { normal: nc, rough: rc };
}

/** Draw a rect and its wrap-around copies, so the sheet tiles. */
function wrapRect(x, w0, y, h0, n, put) {
  put(x, y, w0, h0);
  if (x + w0 > n) put(x - n, y, w0, h0);
  if (y + h0 > n) put(x, y - n, w0, h0);
  if (x + w0 > n && y + h0 > n) put(x - n, y - n, w0, h0);
}

function drawBlocks(ax, hx, n, rng) {
  ax.fillStyle = '#8a8378'; ax.fillRect(0, 0, n, n);
  hx.fillStyle = '#2a2a2a'; hx.fillRect(0, 0, n, n);           // the mortar bed, low
  const rows = 8, rowH = n / rows, mortar = 5;
  for (let r = 0; r < rows; r++) {
    const y = r * rowH;
    let x = (r % 2) * (n / 8) - rng() * 40;
    while (x < n) {
      const bw = 74 + rng() * 62;
      const shade = 0.78 + rng() * 0.30;
      const put = (px, py, pw, ph) => {
        ax.fillStyle = `rgb(${(150 * shade) | 0},${(143 * shade) | 0},${(131 * shade) | 0})`;
        ax.fillRect(px, py, pw, ph);
        hx.fillStyle = `rgb(${(180 + rng() * 40) | 0},180,180)`;
        hx.fillRect(px, py, pw, ph);
      };
      wrapRect(x + mortar, bw - mortar, y + mortar, rowH - mortar, n, put);
      // pitting, so no two blocks read the same
      for (let k = 0; k < 14; k++) {
        const px = (x + mortar + rng() * (bw - mortar)) % n, py = y + mortar + rng() * (rowH - mortar);
        const s = 2 + rng() * 7;
        ax.fillStyle = `rgba(0,0,0,${0.05 + rng() * 0.12})`;
        ax.fillRect(px, py, s, s);
        hx.fillStyle = `rgba(0,0,0,${0.15 + rng() * 0.3})`;
        hx.fillRect(px, py, s, s);
      }
      x += bw;
    }
  }
  // damp running down the face
  for (let k = 0; k < 26; k++) {
    ax.fillStyle = `rgba(40,48,42,${0.04 + rng() * 0.09})`;
    ax.fillRect(rng() * n, rng() * n, 3 + rng() * 22, 60 + rng() * 300);
  }
}

function drawFlags(ax, hx, n, rng) {
  ax.fillStyle = '#7c7568'; ax.fillRect(0, 0, n, n);
  hx.fillStyle = '#303030'; hx.fillRect(0, 0, n, n);
  const cols = 4, cell = n / cols, gap = 6;
  for (let j = 0; j < cols; j++) for (let i = 0; i < cols; i++) {
    const jx = (rng() - 0.5) * 8, jy = (rng() - 0.5) * 8;
    const shade = 0.74 + rng() * 0.36;
    const put = (px, py, pw, ph) => {
      ax.fillStyle = `rgb(${(146 * shade) | 0},${(139 * shade) | 0},${(126 * shade) | 0})`;
      ax.fillRect(px, py, pw, ph);
      hx.fillStyle = `rgb(${(175 + rng() * 45) | 0},180,180)`;
      hx.fillRect(px, py, pw, ph);
    };
    wrapRect(i * cell + gap + jx, cell - gap * 2, j * cell + gap + jy, cell - gap * 2, n, put);
  }
  // grit, wear, and a crack or two
  for (let k = 0; k < 1400; k++) {
    const px = rng() * n, py = rng() * n, s = 1 + rng() * 4;
    ax.fillStyle = `rgba(${rng() < 0.5 ? '0,0,0' : '210,204,190'},${0.03 + rng() * 0.09})`;
    ax.fillRect(px, py, s, s);
    hx.fillStyle = `rgba(0,0,0,${0.06 + rng() * 0.14})`;
    hx.fillRect(px, py, s, s);
  }
  for (let k = 0; k < 5; k++) {
    let px = rng() * n, py = rng() * n;
    ax.strokeStyle = 'rgba(0,0,0,0.30)'; hx.strokeStyle = 'rgba(0,0,0,0.6)';
    ax.lineWidth = 2; hx.lineWidth = 3;
    ax.beginPath(); hx.beginPath(); ax.moveTo(px, py); hx.moveTo(px, py);
    for (let s = 0; s < 9; s++) { px += (rng() - 0.5) * 70; py += (rng() - 0.5) * 70; ax.lineTo(px, py); hx.lineTo(px, py); }
    ax.stroke(); hx.stroke();
  }
}

function drawRock(ax, hx, n, rng) {
  ax.fillStyle = '#6d6154'; ax.fillRect(0, 0, n, n);
  hx.fillStyle = '#808080'; hx.fillRect(0, 0, n, n);
  // lumps at three scales, so the face has form as well as grain
  for (const [count, rMin, rMax, amp] of [[70, 40, 130, 0.42], [260, 12, 46, 0.28], [900, 2, 12, 0.18]]) {
    for (let k = 0; k < count; k++) {
      const px = rng() * n, py = rng() * n, r = rMin + rng() * (rMax - rMin);
      const up = rng() < 0.5;
      const a = amp * (0.4 + rng() * 0.6);
      for (const [ox, oy] of [[0, 0], [n, 0], [-n, 0], [0, n], [0, -n]]) {
        ax.beginPath(); ax.arc(px + ox, py + oy, r, 0, 6.2832);
        ax.fillStyle = `rgba(${up ? '196,184,166' : '30,25,20'},${a * 0.5})`; ax.fill();
        hx.beginPath(); hx.arc(px + ox, py + oy, r, 0, 6.2832);
        hx.fillStyle = `rgba(${up ? '255,255,255' : '0,0,0'},${a})`; hx.fill();
      }
    }
  }
  // fracture lines
  for (let k = 0; k < 22; k++) {
    let px = rng() * n, py = rng() * n;
    ax.strokeStyle = 'rgba(0,0,0,0.26)'; hx.strokeStyle = 'rgba(0,0,0,0.55)';
    ax.lineWidth = 1 + rng() * 2; hx.lineWidth = 2 + rng() * 3;
    ax.beginPath(); hx.beginPath(); ax.moveTo(px, py); hx.moveTo(px, py);
    for (let s = 0; s < 12; s++) { px += (rng() - 0.5) * 90; py += (rng() - 0.5) * 90; ax.lineTo(px, py); hx.lineTo(px, py); }
    ax.stroke(); hx.stroke();
  }
}

function drawGravel(ax, hx, n, rng) {
  drawRock(ax, hx, n, rng);
  for (let k = 0; k < 1200; k++) {
    const px = rng() * n, py = rng() * n, r = 2 + rng() * 9;
    const l = 0.5 + rng() * 0.5;
    ax.beginPath(); ax.arc(px, py, r, 0, 6.2832);
    ax.fillStyle = `rgba(${(150 * l) | 0},${(140 * l) | 0},${(124 * l) | 0},0.6)`; ax.fill();
    hx.beginPath(); hx.arc(px, py, r, 0, 6.2832);
    hx.fillStyle = `rgba(255,255,255,${0.15 + rng() * 0.3})`; hx.fill();
  }
}

const DRAW = { blocks: drawBlocks, flags: drawFlags, rock: drawRock, gravel: drawGravel };

/**
 * The three sheets a stone surface needs. Cached on the module, because a level
 * has four surfaces and the game has hundreds of levels, and every one of them
 * would otherwise redraw the same deterministic 512 x 512 pair.
 */
export function stoneSheets(THREE, family) {
  const hit = TEX_CACHE.get(family);
  if (hit) return hit;
  const draw = DRAW[family];
  if (!draw) throw new Error(`dungeon: no stone family "${family}"`);
  const n = TEX_SIZE;
  const ac = canvasOf(n, n), hc = canvasOf(n, n);
  draw(ac.getContext('2d'), hc.getContext('2d'), n, mulberry32((0x51057 ^ Math.imul(family.length, 2654435761)) >>> 0));
  const { normal, rough } = mapsFromHeight(hc);
  const made = { map: texOf(THREE, ac, true), normalMap: texOf(THREE, normal, false), roughnessMap: texOf(THREE, rough, false) };
  TEX_CACHE.set(family, made);
  return made;
}

// ---------------------------------------------------------------------------
// The roof, as a height per grid CORNER.
//
// Corner (i, j) is the -x, -z corner of cell (i, j), so it touches cells
// (i-1, j-1), (i, j-1), (i-1, j) and (i, j). Its height is the LOWEST ceiling
// of the floor cells among those four, which is what makes the roof slope down
// into a doorway instead of leaving a slot over it.
// ---------------------------------------------------------------------------

const CEIL_CACHE = new WeakMap();

/** The ceiling height over one cell in metres, or 0 where there is no floor. */
export function ceilingAt(layout, gx, gz) {
  if (gx < 0 || gz < 0 || gx >= layout.w || gz >= layout.h) return 0;
  return ceilingGrid(layout)[gz * layout.w + gx];
}

/** Every cell's ceiling height, built once per layout and memoised on it. */
export function ceilingGrid(layout) {
  const hit = CEIL_CACHE.get(layout);
  if (hit) return hit;
  const C = CEIL[layout.kind] || CEIL.dungeon;
  const g = new Float32Array(layout.w * layout.h);
  for (let gz = 0; gz < layout.h; gz++) for (let gx = 0; gx < layout.w; gx++) {
    if (!walkable(layout, gx, gz)) continue;
    const r = roomAt(layout, gx, gz);
    let y;
    if (!r) y = C.corridor;
    else {
      const peak = r.kind === 'boss' ? C.boss : r.kind === 'hall' ? C.hall : C.room;
      if (layout.kind !== 'cave') y = peak;
      else {
        // a dome over the cavern's rectangle: the peak in the middle, passage
        // height at the rim, with a hand of roughness so it is not a lens
        const u = (gx - (r.x + (r.w - 1) / 2)) / (r.w / 2);
        const v = (gz - (r.z + (r.h - 1) / 2)) / (r.h / 2);
        const d = Math.min(1, Math.hypot(u, v));
        const rough = ((hash2(gx, gz, layout.level | 0) % 128) / 128 - 0.5) * 0.7;
        y = C.corridor + (peak - C.corridor) * Math.sqrt(Math.max(0, 1 - d * d)) + rough;
      }
    }
    g[gz * layout.w + gx] = Math.max(C.corridor * 0.75, y);
  }
  CEIL_CACHE.set(layout, g);
  return g;
}

/** The roof height at grid corner (i, j): the lowest ceiling touching it. */
export function cornerCeil(layout, i, j) {
  const g = ceilingGrid(layout);
  let best = 0;
  for (const [dx, dz] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
    const x = i + dx, z = j + dz;
    if (x < 0 || z < 0 || x >= layout.w || z >= layout.h) continue;
    const y = g[z * layout.w + x];
    if (y > 0 && (best === 0 || y < best)) best = y;
  }
  return best;
}

// ---------------------------------------------------------------------------
// A tiny mesh builder: quads straight into typed arrays. A level is a few
// thousand triangles of axis-aligned boxes, so making a THREE geometry per cell
// and merging them afterwards would allocate a thousand objects to throw away.
// Every bucket carries uvs, because every stone surface is textured and a
// geometry missing an attribute its shader wants renders as nothing at all.
// ---------------------------------------------------------------------------

function bucket() { return { pos: [], nrm: [], uv: [] }; }

/**
 * One quad, wound a1-a2-a3 then a1-a3-a4. `mode` says which world plane the
 * texture is read off: 'xz' for floors and roofs, 'xy' and 'zy' for the two
 * wall orientations. One texture tile is TEX_M metres either way, so a block is
 * the same size on every surface in the level.
 *
 * The winding is REVERSED when it disagrees with `n`, and that is not a nicety.
 * The first cut of this file spanned a wall face across the cell edge with the
 * same corner order whichever way the face pointed, so the geometric front of
 * every -x and every +z face pointed into the solid rock while its normal
 * attribute pointed into the room. Under `FrontSide` that meant half of every
 * wall in the game was drawn only from inside the rock, which is most of what
 * "the walls are see-through" was; and even under `DoubleSide` the shader flips
 * the normal by `gl_FrontFacing`, so those faces would have gone on lighting as
 * if the torch were behind them. `box()` had it the other way round on all six
 * faces, which would have turned every chest and brazier inside out.
 *
 * So the check is here, once, rather than six call sites deep: a caller states
 * the normal it wants and gets geometry that agrees with it.
 */
function quad(b, a1, a2, a3, a4, n, mode) {
  const e1 = [a2[0] - a1[0], a2[1] - a1[1], a2[2] - a1[2]];
  const e2 = [a3[0] - a1[0], a3[1] - a1[1], a3[2] - a1[2]];
  const dot = (e1[1] * e2[2] - e1[2] * e2[1]) * n[0]
    + (e1[2] * e2[0] - e1[0] * e2[2]) * n[1]
    + (e1[0] * e2[1] - e1[1] * e2[0]) * n[2];
  const q = dot < 0 ? [a1, a4, a3, a1, a3, a2] : [a1, a2, a3, a1, a3, a4];
  for (const v of q) {
    b.pos.push(v[0], v[1], v[2]);
    b.nrm.push(n[0], n[1], n[2]);
    if (mode === 'xy') b.uv.push(v[0] / TEX_M, v[1] / TEX_M);
    else if (mode === 'zy') b.uv.push(v[2] / TEX_M, v[1] / TEX_M);
    else b.uv.push(v[0] / TEX_M, v[2] / TEX_M);
  }
}

/** A box, rotated about y, as six quads. Props, not the level itself. */
function box(b, cx, cy, cz, sx, sy, sz, ry = 0) {
  const c = Math.cos(ry), s = Math.sin(ry);
  const p = (dx, dy, dz) => [cx + dx * c + dz * s, cy + dy, cz - dx * s + dz * c];
  const hx = sx / 2, hy = sy / 2, hz = sz / 2;
  const v = [
    p(-hx, -hy, -hz), p(hx, -hy, -hz), p(hx, -hy, hz), p(-hx, -hy, hz),
    p(-hx, hy, -hz), p(hx, hy, -hz), p(hx, hy, hz), p(-hx, hy, hz),
  ];
  quad(b, v[4], v[5], v[6], v[7], [0, 1, 0], 'xz');
  quad(b, v[3], v[2], v[1], v[0], [0, -1, 0], 'xz');
  quad(b, v[0], v[1], v[5], v[4], [-s, 0, -c], 'xy');
  quad(b, v[2], v[3], v[7], v[6], [s, 0, c], 'xy');
  quad(b, v[1], v[2], v[6], v[5], [c, 0, -s], 'zy');
  quad(b, v[3], v[0], v[4], v[7], [-c, 0, s], 'zy');
}

/** An n-sided prism standing on the floor. Pillars, brazier bowls, skulls. */
function prism(b, cx, cz, r, y0, y1, sides = 8, taper = 1) {
  for (let i = 0; i < sides; i++) {
    const a0 = (i / sides) * 6.2832, a1 = ((i + 1) / sides) * 6.2832;
    const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    const nx = Math.cos((a0 + a1) / 2), nz = Math.sin((a0 + a1) / 2);
    quad(b,
      [cx + c0 * r, y0, cz + s0 * r],
      [cx + c0 * r * taper, y1, cz + s0 * r * taper],
      [cx + c1 * r * taper, y1, cz + s1 * r * taper],
      [cx + c1 * r, y0, cz + s1 * r],
      [nx, 0, nz], Math.abs(nx) > Math.abs(nz) ? 'zy' : 'xy');
  }
}

function meshOf(THREE, b, mat, shadow = true) {
  if (!b.pos.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(b.pos), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(b.nrm), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(b.uv), 2));
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, mat);
  m.receiveShadow = shadow;
  return m;
}

/**
 * Build a level. `layout` comes from generateDungeon.
 * Returns { group, entrancePos, stairPos, torches, update(dt, pos), dispose() }.
 */
export function createDungeonScene(THREE, layout, opts = {}) {
  const P = PALETTE[layout.kind] || PALETTE.dungeon;
  const rng = mulberry32(hash2(layout.cx, layout.cz, (layout.seed | 0) + layout.level * 101));
  const group = new THREE.Group();
  group.name = `dungeon:${layout.id}:${layout.level}`;
  const ceil = ceilingGrid(layout);
  const corner = (i, j) => cornerCeil(layout, i, j);

  const plain = (c, extra) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, ...extra });
  /** A stone surface: tinted, textured, and drawn from both sides. */
  const stone = (c, family, extra) => {
    const t = stoneSheets(THREE, family);
    const m = new THREE.MeshStandardMaterial({
      color: c, map: t.map, normalMap: t.normalMap, roughnessMap: t.roughnessMap,
      roughness: 1, metalness: 0, side: THREE.DoubleSide, ...extra,
    });
    m.normalScale = new THREE.Vector2(1.1, 1.1);
    return m;
  };
  const mats = {
    // walls are DOUBLE SIDED: this is the see-through fix, and the reason the
    // wall between the camera and the room is a wall and not a window
    floor: stone(P.floor, P.floorTex),
    wallA: stone(P.wallA, P.wallTex),
    wallB: stone(P.wallB, P.wallTex),
    // the roof's one drawn side faces DOWN, so a camera that has climbed above
    // it looks into the level instead of at a black lid
    ceiling: stone(P.ceiling, P.ceilTex, { side: THREE.FrontSide }),
    wood: plain(0x4a3524, { roughness: 0.9 }),
    iron: plain(0x35373d, { metalness: 0.55, roughness: 0.5 }),
    bone: plain(0xc9c2ac, { roughness: 0.75 }),
    rubble: stone(P.cap, P.wallTex, { side: THREE.FrontSide }),
    flame: new THREE.MeshBasicMaterial({ color: 0xffc46a, fog: false }),
    dark: new THREE.MeshBasicMaterial({ color: 0x000000, fog: false }),
    water: new THREE.MeshStandardMaterial({ color: 0x0a1418, roughness: 0.08, metalness: 0.6, transparent: true, opacity: 0.9 }),
    pale: plain(0x8b8378),
  };
  const owned = [];                                     // everything to dispose

  // ---- floor, walls and roof --------------------------------------------
  const floorB = bucket(), wallB1 = bucket(), wallB2 = bucket(), ceilB = bucket();
  const H = CELL / 2;
  let wallFaces = 0, floorCells = 0;
  for (let gz = 0; gz < layout.h; gz++) for (let gx = 0; gx < layout.w; gx++) {
    const p = worldOf(layout, gx, gz);
    if (walkable(layout, gx, gz)) {
      floorCells++;
      quad(floorB, [p.x - H, 0, p.z - H], [p.x - H, 0, p.z + H], [p.x + H, 0, p.z + H], [p.x + H, 0, p.z - H], [0, 1, 0], 'xz');
      // the roof, off the four corner heights, so it never leaves a slot
      const c00 = corner(gx, gz), c10 = corner(gx + 1, gz);
      const c11 = corner(gx + 1, gz + 1), c01 = corner(gx, gz + 1);
      quad(ceilB,
        [p.x - H, c00, p.z - H], [p.x + H, c10, p.z - H],
        [p.x + H, c11, p.z + H], [p.x - H, c01, p.z + H], [0, -1, 0], 'xz');
      continue;
    }
    // rock: only the faces that look onto a floor cell are built, so the solid
    // interior of the map costs nothing at all
    const faces = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dz]) => walkable(layout, gx + dx, gz + dz));
    if (!faces.length) continue;
    const b = hash2(gx, gz, layout.level) % 3 ? wallB1 : wallB2;
    for (const [dx, dz] of faces) {
      const cxp = p.x + dx * H, czp = p.z + dz * H;
      // the face plane, spanned across the cell edge and up to the roof. Its
      // two top corners are the SAME corners the roof quad beside it uses.
      const ux = dz === 0 ? 0 : H, uz = dz === 0 ? H : 0;
      let iA, jA, iB, jB;
      if (dx === 1) { iA = gx + 1; jA = gz; iB = gx + 1; jB = gz + 1; }
      else if (dx === -1) { iA = gx; jA = gz; iB = gx; jB = gz + 1; }
      else if (dz === 1) { iA = gx; jA = gz + 1; iB = gx + 1; jB = gz + 1; }
      else { iA = gx; jA = gz; iB = gx + 1; jB = gz; }
      quad(b,
        [cxp - ux, 0, czp - uz], [cxp - ux, corner(iA, jA), czp - uz],
        [cxp + ux, corner(iB, jB), czp + uz], [cxp + ux, 0, czp + uz],
        [dx, 0, dz], dz === 0 ? 'zy' : 'xy');
      wallFaces++;
    }
  }

  // ---- pillars, rubble and bones ----------------------------------------
  // Pillars stand HALF IN THE ROCK, as engaged columns do, so a player walking
  // the wall of a hall brushes a bulge instead of passing through a post that
  // the walk grid says is not there.
  const pillarB = bucket(), rubbleB = bucket(), boneB = bucket();
  let pillars = 0, props = 0;
  const busy = (gx, gz) => {
    const c = cellAt(layout, gx, gz);
    return c === 'entrance' || c === 'stair' || c === 'ore' || c === 'chest';
  };
  for (const r of layout.rooms) {
    const hall = r.kind === 'hall' || r.kind === 'boss';
    for (let gz = r.z; gz < r.z + r.h; gz++) for (let gx = r.x; gx < r.x + r.w; gx++) {
      if (!walkable(layout, gx, gz) || busy(gx, gz)) continue;
      const wall = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dz]) => !walkable(layout, gx + dx, gz + dz));
      const p = worldOf(layout, gx, gz);
      if (hall && wall && (gx + gz) % 3 === 0 && rng() < 0.75) {
        const top = ceil[gz * layout.w + gx];
        const cx = p.x + wall[0] * 0.62, cz = p.z + wall[1] * 0.62;
        prism(pillarB, cx, cz, 0.44, 0, top - 0.34, 8);
        prism(pillarB, cx, cz, 0.60, 0, 0.30, 8);                 // the base
        prism(pillarB, cx, cz, 0.60, top - 0.34, top, 8);         // the capital
        pillars++;
        continue;
      }
      if (rng() < 0.055) {
        // a heap of fallen stone
        const n = 2 + ((rng() * 4) | 0);
        for (let k = 0; k < n; k++) {
          const s = 0.18 + rng() * 0.30;
          box(rubbleB, p.x + (rng() - 0.5) * 1.3, s * 0.45, p.z + (rng() - 0.5) * 1.3, s * 1.6, s, s * 1.3, rng() * 3.14);
        }
        props++;
      } else if (rng() < 0.022) {
        // somebody who did not get out
        const ry = rng() * 3.14, cxp = p.x + (rng() - 0.5) * 1.0, czp = p.z + (rng() - 0.5) * 1.0;
        for (let k = 0; k < 4; k++) {
          box(boneB, cxp + (rng() - 0.5) * 0.6, 0.05, czp + (rng() - 0.5) * 0.6, 0.5 + rng() * 0.3, 0.08, 0.09, ry + rng());
        }
        prism(boneB, cxp, czp, 0.13, 0.02, 0.24, 6);              // the skull
        props++;
      }
    }
  }

  // ---- the way up and the way down --------------------------------------
  const ePos = worldOf(layout, layout.entrance.gx, layout.entrance.gz);
  const entrancePos = new THREE.Vector3(ePos.x, 0, ePos.z);
  const exits = [];

  // Hit boxes are invisible on purpose. three's raycaster does NOT skip
  // invisible objects, so an unlit, undrawn box is a free, generous target that
  // never has to be art-directed around the steps it wraps.
  const hitBox = (pos, tag) => {
    const hb = new THREE.Mesh(new THREE.BoxGeometry(2.6, 3.0, 2.6), mats.dark);
    hb.position.set(pos.x, 1.4, pos.z);
    hb.visible = false;
    hb.userData.exit = tag;
    group.add(hb); owned.push(hb); exits.push(hb);
    return hb;
  };

  // up: three steps climbing to a pale arch, so it reads as daylight-ward
  {
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.26, 0.5), mats.pale);
      s.position.set(entrancePos.x, 0.13 + i * 0.26, entrancePos.z + 0.4 - i * 0.42);
      s.userData.exit = 'up'; group.add(s); owned.push(s);
    }
    const arch = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.18, 6, 14, Math.PI), mats.pale);
    arch.position.set(entrancePos.x, 0.8, entrancePos.z - 0.75);
    arch.userData.exit = 'up'; group.add(arch); owned.push(arch);
    hitBox(entrancePos, 'up');
  }

  let stairPos = null;
  if (layout.stair) {
    const s = worldOf(layout, layout.stair.gx, layout.stair.gz);
    stairPos = new THREE.Vector3(s.x, 0, s.z);
    // a black square cut in the floor, four steps going into it
    const hole = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.9), mats.dark);
    hole.rotation.x = -Math.PI / 2; hole.position.set(s.x, 0.02, s.z);
    hole.userData.exit = 'down'; group.add(hole); owned.push(hole);
    for (let i = 0; i < 4; i++) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.22, 0.4), mats.wallA);
      st.position.set(s.x, -0.11 - i * 0.22, s.z - 0.7 + i * 0.4);
      st.userData.exit = 'down'; group.add(st); owned.push(st);
    }
    for (let i = 0; i < 2; i++) {                       // a kerb, so the hole reads as a hole
      const k = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.3, 2.1), mats.wallB);
      k.position.set(s.x + (i ? 1.0 : -1.0), 0.15, s.z);
      k.userData.exit = 'down'; group.add(k); owned.push(k);
    }
    hitBox(stairPos, 'down');
  }

  // ---- the flames --------------------------------------------------------
  // Wall brackets against the rock, iron braziers standing out in the halls.
  // Both go into ONE list, because both are light stands and the pool has to
  // see them all; and both go through the same spacing rule, because the
  // promise that a torch never winks is a promise about the distance between
  // STANDS, not about the distance between brackets.
  const torches = [];
  const ironB = bucket(), flameB = bucket();
  const used = [];
  const far = (gx, gz) => !used.some(([ux, uz]) => Math.abs(ux - gx) < TORCH_SPACING && Math.abs(uz - gz) < TORCH_SPACING);
  for (let gz = 1; gz < layout.h - 1; gz++) for (let gx = 1; gx < layout.w - 1; gx++) {
    if (!walkable(layout, gx, gz) || busy(gx, gz)) continue;
    const wall = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dz]) => !walkable(layout, gx + dx, gz + dz));
    const r = roomAt(layout, gx, gz);
    const brazier = !wall && !!r && (r.kind === 'hall' || r.kind === 'boss');
    if (!wall && !brazier) continue;
    if (rng() < (brazier ? 0.86 : 0.5)) continue;
    if (!far(gx, gz)) continue;
    used.push([gx, gz]);
    const p = worldOf(layout, gx, gz);
    if (brazier) {
      // a three legged iron bowl, waist high
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * 6.2832 + 0.4;
        box(ironB, p.x + Math.cos(a) * 0.20, 0.42, p.z + Math.sin(a) * 0.20, 0.09, 0.86, 0.09, -a);
      }
      prism(ironB, p.x, p.z, 0.46, 0.82, 1.06, 10, 1.28);
      torches.push(new THREE.Vector3(p.x, 1.16, p.z));
    } else {
      const t = new THREE.Vector3(p.x + wall[0] * 0.72, 1.95, p.z + wall[1] * 0.72);
      // a sconce: a stub arm out of the wall and a cup on the end of it
      box(ironB, (t.x + p.x + wall[0] * 0.95) / 2, 1.62, (t.z + p.z + wall[1] * 0.95) / 2, 0.11, 0.11, 0.11);
      prism(ironB, t.x, t.z, 0.10, 1.55, t.y, 6, 1.6);
      torches.push(t);
    }
  }
  for (const t of torches) {
    // the flame itself: an unlit, emissive lump that costs no light at all
    prism(flameB, t.x, t.z, 0.20, t.y + 0.02, t.y + 0.30, 6, 0.25);
    prism(flameB, t.x, t.z, 0.12, t.y + 0.30, t.y + 0.52, 6, 0.1);
  }

  // ---- chests ------------------------------------------------------------
  // A proper chest: an oak carcass, a barrel lid built as a fan of staves, two
  // iron bands over the whole of it and a lock plate on the front.
  for (const c of layout.chests) {
    const p = worldOf(layout, c.gx, c.gz);
    const ry = rng() * Math.PI * 2;
    const bodyB = bucket(), bandB = bucket();
    box(bodyB, 0, 0.26, 0, 1.02, 0.52, 0.66, 0);
    for (let i = 0; i < 7; i++) {           // the lid, as staves round a half circle
      const a = Math.PI * (i / 7) + Math.PI / 14;
      box(bodyB, 0, 0.52 + Math.sin(a) * 0.26, Math.cos(a) * 0.31, 1.02, 0.09, 0.16, 0);
    }
    for (const dx of [-0.32, 0.32]) box(bandB, dx, 0.30, 0, 0.10, 0.62, 0.70, 0);
    box(bandB, 0, 0.30, 0.35, 0.22, 0.20, 0.06, 0);            // the lock plate
    for (const [b, m] of [[bodyB, mats.wood], [bandB, mats.iron]]) {
      const mesh = meshOf(THREE, b, m);
      if (!mesh) continue;
      mesh.position.set(p.x, 0, p.z); mesh.rotation.y = ry;
      group.add(mesh); owned.push(mesh);
    }
  }

  // ---- ore (cave): the same field the surface uses, so the pickaxe that
  // works on a hillside boulder works on this without knowing where it is. It
  // declares `yield: 'ore'`, which is the name breakRock hands back and the
  // name main.js spends, exactly as world:ore does above ground ----
  let oreField = null;
  if (layout.kind === 'cave' && layout.ore.length) {
    oreField = createTreeField({
      name: `dungeon:${layout.id}:${layout.level}:ore`, kind: 'rock', hits: 5, yield: 'ore', parent: group,
      layers: [
        { geo: new THREE.DodecahedronGeometry(1, 0), mat: stone(0x6d7a84, P.wallTex, { side: THREE.FrontSide }),
          of: (t) => ({ x: t.x, y: t.gy + 0.5 * t.s, z: t.z, s: t.s, sy: 0.9, ry: t.ry }) },
        { geo: new THREE.DodecahedronGeometry(0.4, 0), mat: plain(0xc47a3a, { metalness: 0.45, roughness: 0.4, emissive: 0x2a1206 }),
          of: (t) => ({ x: t.x + 0.5 * t.s, y: t.gy + 0.9 * t.s, z: t.z + 0.3 * t.s, s: t.s * 0.6, ry: -t.ry }) },
      ],
    });
    for (const o of layout.ore) {
      const p = worldOf(layout, o.gx, o.gz);
      oreField.trees.push({ x: p.x, z: p.z, gy: 0, s: 0.5 + rng() * 0.3, ry: rng() * Math.PI, alt: 0, oa: 0 });
    }
    oreField.oreId = layout.oreTier || null;   // interact.oreBaseFor reads it: a starfall cut gives starfall
    oreField.hydrated = true;   // a level is never saved, so never load one either
    oreField.rebuild();
  }

  // ---- water (cave): still, black, and only as deep as it looks ----------
  const pools = [];
  if (layout.kind === 'cave') {
    const waterB = bucket();
    for (const r of layout.rooms) {
      if (r.kind === 'entry' || rng() < 0.45) continue;
      const px = r.x + 1 + ((rng() * (r.w - 2)) | 0), pz = r.z + 1 + ((rng() * (r.h - 2)) | 0);
      const rad = 1.6 + rng() * 2.6;
      let cells = 0;
      for (let gz = r.z; gz < r.z + r.h; gz++) for (let gx = r.x; gx < r.x + r.w; gx++) {
        if (!walkable(layout, gx, gz) || busy(gx, gz)) continue;
        if (Math.hypot(gx - px, gz - pz) > rad) continue;
        const p = worldOf(layout, gx, gz);
        quad(waterB, [p.x - H, 0.06, p.z - H], [p.x - H, 0.06, p.z + H],
          [p.x + H, 0.06, p.z + H], [p.x + H, 0.06, p.z - H], [0, 1, 0], 'xz');
        cells++;
      }
      if (cells) pools.push({ gx: px, gz: pz, cells });
    }
    const m = meshOf(THREE, waterB, mats.water, false);
    if (m) { m.renderOrder = 1; group.add(m); owned.push(m); }
  }

  // Named, so a test can raycast the walls without the props in the way and a
  // debug view can switch one surface off. The names are the contract.
  const parts = {};
  for (const [name, b, m] of [['floor', floorB, mats.floor], ['ceiling', ceilB, mats.ceiling],
    ['wallA', wallB1, mats.wallA], ['wallB', wallB2, mats.wallB], ['pillars', pillarB, mats.wallA],
    ['rubble', rubbleB, mats.rubble], ['bones', boneB, mats.bone],
    ['iron', ironB, mats.iron], ['flames', flameB, mats.flame]]) {
    const mesh = meshOf(THREE, b, m);
    if (!mesh) continue;
    mesh.name = `dungeon:${name}`;
    parts[name] = mesh;
    group.add(mesh); owned.push(mesh);
  }
  parts.walls = [parts.wallA, parts.wallB].filter(Boolean);

  // ---- light -------------------------------------------------------------
  const ambient = new THREE.AmbientLight(P.ambient, P.ambientI);
  group.add(ambient);
  // a faint fill from above, so a corner with no torch in it is dark and not
  // black. A hemisphere light is not a point light and costs the budget nothing.
  const fill = new THREE.HemisphereLight(P.fill, P.fillGround, P.fillI);
  group.add(fill);
  const pool = [];
  for (let i = 0; i < TORCH_POOL; i++) {
    const l = new THREE.PointLight(0xffb35a, 11, TORCH_RANGE, 1.4);
    l.visible = false;
    group.add(l); pool.push(l);
  }
  const entLight = new THREE.PointLight(0xffd9a8, 8, 14, 1.3);
  entLight.position.set(entrancePos.x, 2.3, entrancePos.z);
  group.add(entLight);
  const stairLight = new THREE.PointLight(0x7fc8ff, 7, 13, 1.3);
  if (stairPos) { stairLight.position.set(stairPos.x, 2.1, stairPos.z); group.add(stairLight); }

  const BASE_I = 11;
  const phase = pool.map((_, i) => i * 1.7 + rng() * 6.28);
  let clock = 0, lastX = Infinity, lastZ = Infinity, lastMs = null;

  const built = {
    group, entrancePos, stairPos, torches, exits, oreField, pools, parts,
    layout, palette: P,
    /** what the level actually cost, so a report never has to guess */
    stats: {
      floorCells, wallFaces, pillars, props, pools: pools.length,
      torches: torches.length, chests: layout.chests.length, ore: layout.ore.length,
      get triangles() {
        let t = 0;
        group.traverse((o) => { if (o.isMesh && o.geometry?.attributes?.position) t += o.geometry.attributes.position.count / 3; });
        return t;
      },
    },
    /** number of PointLights this level owns, ever. */
    get lightCount() { return pool.length + 1 + (stairPos ? 1 : 0); },
    /**
     * Hand the six roaming lights to the six nearest stands, and flicker them.
     *
     * Called either way round: `update(dt, pos)` is what main.js and
     * world_runtime.js should say, and `update(pos)` is the old one argument
     * form, which still works and takes its dt off the wall clock so the flame
     * still moves in a build that has not been rewired yet.
     */
    update(a, b) {
      let dt, pos;
      if (typeof a === 'number') { dt = a; pos = b; } else { pos = a; dt = null; }
      if (!pos) return false;
      if (dt == null) {
        const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        dt = lastMs == null ? 0 : Math.min(0.1, (now - lastMs) / 1000);
        lastMs = now;
      }
      clock += dt;
      let moved = false;
      if (Math.hypot(pos.x - lastX, pos.z - lastZ) >= 1.0) {
        lastX = pos.x; lastZ = pos.z;
        const near = torches
          .map((t, i) => [i, (t.x - pos.x) ** 2 + (t.z - pos.z) ** 2])
          .sort((x, y) => x[1] - y[1])
          .slice(0, pool.length);
        for (let i = 0; i < pool.length; i++) {
          const n = near[i];
          if (!n) { pool[i].visible = false; continue; }
          pool[i].position.copy(torches[n[0]]);
          pool[i].visible = true;
        }
        moved = true;
      }
      // the flicker: two beats out of step, so it never reads as a sine
      for (let i = 0; i < pool.length; i++) {
        if (!pool[i].visible) continue;
        const t = clock * 7 + phase[i];
        pool[i].intensity = BASE_I * (0.86 + 0.09 * Math.sin(t) + 0.05 * Math.sin(t * 2.7 + 1.3));
      }
      entLight.intensity = 8 * (0.93 + 0.07 * Math.sin(clock * 5.1));
      return moved;
    },
    dispose() {
      if (oreField) removeTreeField(oreField);
      group.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        const m = o.material;
        if (Array.isArray(m)) m.forEach((x) => x.dispose?.()); else m?.dispose?.();
        if (o !== group) o.dispose?.();     // InstancedMesh buffers, light shadow maps
      });
      // the sheets are cached on the module and shared by every level. A
      // material dispose does not touch them, and nothing here should.
      for (const m of Object.values(mats)) m.dispose?.();
      group.parent?.remove(group);
      group.clear();
    },
  };
  built.update(0, { x: entrancePos.x, z: entrancePos.z });
  return built;
}

// ---------------------------------------------------------------------------
// The camera, kept in the room.
//
// camera.js keeps the follow camera 1.2 m above whatever ground is under it and
// has no wall test at all, which above ground is right and underground is how
// the camera ends up inside the rock looking at the back of a wall, or above
// the roof looking at the top of it. This is the wall test. It is pure: plain
// objects in, a plain object out, no THREE, so main.js can call it every frame
// and dungeon.test.mjs can drive it without a renderer.
//
//   const L = runtime.dungeonLayout();
//   if (L) { const c = cameraClamp(L, camera.position, player.pos);
//            camera.position.set(c.x, c.y, c.z); camera.lookAt(target); }
//
// It walks the segment from the player to the camera on the 2 m grid and stops
// the camera CAM_MARGIN short of the first rock cell it meets, then holds it
// CAM_CEIL_GAP under the ceiling of wherever it ended up and CAM_MIN_Y above
// the floor. A camera with a clear line and headroom comes back untouched, to
// the bit, with `moved: false`.
//
// The walk is a grid DDA and not a march at some step size, because a step of
// any size skips the cells a segment only clips the corner of, and a camera
// that only sometimes clears the wall is a camera that clips through it in the
// one screenshot the user takes. `cellsCrossed` visits EVERY cell the segment
// touches, so what the test verifies at 5 cm is exactly what this decided.
// ---------------------------------------------------------------------------

/**
 * Every grid cell the segment from (x0, z0) to (x1, z1) passes through, with
 * the fraction of the segment at which it was entered. Amanatides and Woo.
 * Exported so a test can check the clamp against the same enumeration.
 */
export function cellsCrossed(layout, x0, z0, x1, z1) {
  const out = [];
  const u0 = x0 / CELL + layout.w / 2, v0 = z0 / CELL + layout.h / 2;
  const u1 = x1 / CELL + layout.w / 2, v1 = z1 / CELL + layout.h / 2;
  let gx = Math.floor(u0), gz = Math.floor(v0);
  const du = u1 - u0, dv = v1 - v0;
  const sx = Math.sign(du), sz = Math.sign(dv);
  let tx = du === 0 ? Infinity : ((sx > 0 ? gx + 1 - u0 : u0 - gx) / Math.abs(du));
  let tz = dv === 0 ? Infinity : ((sz > 0 ? gz + 1 - v0 : v0 - gz) / Math.abs(dv));
  const dtx = du === 0 ? Infinity : 1 / Math.abs(du);
  const dtz = dv === 0 ? Infinity : 1 / Math.abs(dv);
  let t = 0;
  for (let guard = 0; guard < 4096; guard++) {
    out.push({ gx, gz, t });
    if (tx > 1 && tz > 1) break;
    if (tx < tz) { t = tx; gx += sx; tx += dtx; } else { t = tz; gz += sz; tz += dtz; }
    if (t > 1) break;
  }
  return out;
}

export function cameraClamp(layout, camPos, playerPos) {
  const out = { x: camPos.x, y: camPos.y, z: camPos.z, moved: false };
  if (!layout || !layout.cells || !playerPos) return out;
  const dx = camPos.x - playerPos.x, dz = camPos.z - playerPos.z;
  const dist = Math.hypot(dx, dz);
  if (dist > 1e-6) {
    for (const c of cellsCrossed(layout, playerPos.x, playerPos.z, camPos.x, camPos.z)) {
      if (walkable(layout, c.gx, c.gz)) continue;
      const stop = Math.max(0, c.t * dist - CAM_MARGIN);
      out.x = playerPos.x + (dx / dist) * stop;
      out.z = playerPos.z + (dz / dist) * stop;
      out.moved = true;
      break;
    }
  }
  const g = gridOf(layout, out.x, out.z);
  const top = (ceilingAt(layout, g.gx, g.gz) || WALL_H) - CAM_CEIL_GAP;
  if (out.y > top) { out.y = top; out.moved = true; }
  if (out.y < CAM_MIN_Y) { out.y = CAM_MIN_Y; out.moved = true; }
  return out;
}
