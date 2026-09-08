// The painted map: the world's own data, painted the way a chart is painted.
//
// The map window (`win_map.js`) draws a schematic: one flat rectangle per field
// sample, a circle per zone, a dot per place. It is honest and it is unlovely,
// and nothing about it says this is a country. This file is the painter that
// goes UNDER that draw: parchment, a coast with a line on it, biome washes that
// bleed into one another, hachured ridges and drawn mountains, canopy stipple
// where the trees really are, blue rivers, dashed roads, a soft border round
// each realm, a glyph and a name for every place, a banner and an ornate edge.
//
// EVERY MARK ON IT COMES OUT OF THE GAME. There is no hand placed hill and no
// invented coast: the ground is `field.sampleAt`, the rivers are the field's
// own river field filtered by `sampleAt().river`, the roads are the polylines
// `roads.js` already built, the realms are the shape `zones.zoneAt` gives them
// on the ground, and the places are `zones.authoredSites()` and the rolled
// sites in `field.siteInCell`. Move a realm and the map moves with it. That is
// the point of painting it rather than drawing it: this is the guide the user
// paints over, and a guide that lies is worse than no guide.
//
// ---- how it is used -------------------------------------------------------
//
//   paintMap(ctx2d, { field, x, z, w, h, px, py, known })   the whole picture
//   paintMap(ctx2d, { field, realm: 'boneyard', px: 1400 }) one realm, close up
//
// `x, z, w, h` are world metres (the centre and the extent), `px, py` the size
// of the drawing in pixels. `realm` sets all four from the realm's own disc.
//
// The three layers are separately callable, because a repaint after a discovery
// must not cost another thirty thousand field samples:
//
//   paintGround(ctx, opts)  paper, water, land, relief, forest, rivers, roads,
//                           realm washes and realm names. Cached on `opts.cache`
//   paintMarks(ctx, opts)   the places and their names. This is what changes
//   paintFrame(ctx, opts)   the border, the banner, the rose and the scale
//
// ---- discovery ------------------------------------------------------------
//
// `opts.known` is `{ zones, places }`, each a Set, an array, or `true` for all
// of it. The game's rule is kept exactly: a realm nobody has walked into is
// blank parchment with a faint hatch over it and no name, and a place nobody
// has found is not drawn at all. The blanking is done in the ground compose, so
// an unwalked realm has no coast, no forest and no river either: it is paper.
//
// ---- how it is smooth -----------------------------------------------------
//
// Nothing here is clipped and nothing is blurred by the canvas, because neither
// a node canvas nor an SVG writer can be relied on for either. The ground is
// composed IN JAVASCRIPT: every field (the tint, the water, the wash, the
// blanking) is sampled on a coarse grid, box blurred, then read back bilinearly
// at twice the resolution and mixed into ONE colour per draw cell, which is
// emitted as one `fillRect`. Runs of equal colour along a row are merged, so a
// thousand miles of open sea is one rectangle. Soft edges come out of the blur
// and not out of a filter, which is why this draws the same on every context.
//
// The one thing the compose cannot give is a LINE, and a chart is made of
// lines. Those come from marching squares over the same grids: the coast, the
// two echo lines that run parallel to it, the rim of each realm.

import { createNoise, clamp01, lerp, smoothstep, hash2 } from '../world/noise.js';
import { BIOMES, SEA_LEVEL } from '../world/field.js';
import {
  REALM_ZONES, SUB_ZONES, ZONE, WORLD_HALF, weightOf, authoredSites,
  ARTICLE, EXTRA_ARTICLE, DANGER_WORD,
} from '../world/zones.js';
import { roadsForCell } from '../world/roads.js';
import { SITE_CELL, ALL_KINDS } from '../world/sitegrid.js';
import { SPACES } from '../mmo/spaces/index.js';
import {
  GUIDE_ZONES, GUIDE_ROADS, GUIDE_RIVER, GUIDE_ART, artRect, guideArt,
} from '../mmo/greenwold_guide.js';
import { theme } from './ui_theme.js';

// ------------------------------------------------------------- the numbers --

/** Samples along the longer side of the view. 192 over 16 km is 83 m a sample. */
export const MAP_SAMPLES = 192;
/** Draw cells per sample cell. The compose reads the grid back bilinearly. */
export const DRAW_SCALE = 2;
/** Box blur radius, in sample cells, over the land tint. */
export const TINT_BLUR = 1;
/** Box blur radius over the water mask. This is how soft the shoreline is. */
export const WATER_BLUR = 1;
/** How far into a realm its border wash reaches, in sample cells. */
export const WASH_BLUR = 7;
/** How dark a realm's border wash gets at the rim. */
export const WASH_MAX = 0.62;
/** Metres of fall per metre of run before the ground is hachured. */
export const RIDGE_SLOPE = 0.10;
/** Metres above the sea before a mountain may be drawn on the ground. */
export const PEAK_HEIGHT = 42;
/** Metres a peak must stand above the ground two cells away to be drawn. */
export const PEAK_RELIEF = 9;
/** Pixels between two drawn mountains, so a range is a range and not a smear. */
export const PEAK_SPACING = 34;
/** How much river the field must have under a traced line before it is drawn. */
export const RIVER_MIN = 0.10;
/** Pixels of run a traced river must have before it is worth drawing. */
export const RIVER_MIN_RUN = 14;
/** Metres between the points a traced river is checked and drawn at. */
export const RIVER_STEP = 26;
/** Pixels between canopy stipple clumps. */
export const CANOPY_SPACING = 8.5;
/** Pixels between hachure strokes. */
export const HATCH_SPACING = 7.5;
/** The colour step the compose quantises to. Invisible, and it merges runs. */
export const COLOUR_STEP = 9;

// ------------------------------------------------------------- the relief --
//
// A chart says what the ground DOES, and until MAP2 this one only said what the
// ground was made of: eight biome washes, a hachure where it was steep and a
// drawn mountain where it was high. On a sculpted world that is nearly nothing,
// because a hand cut world is one biome and one climate, and the whole of what
// the user has made is in the HEIGHTS. So the compose reads the heights twice
// more: once for how high the ground stands, and once for which way it leans.
//
// The light comes from the north west, which is where a chart's light has come
// from since the first hachured survey, and it is a CONSTANT, so a ridge read at
// one zoom leans the same way at the next.

/** Where the sun stands, as a unit vector in world metres: north west. */
export const SUN_DIR = [-Math.SQRT1_2, -Math.SQRT1_2];
/** How far the sun lightens a lit face and darkens a shaded one. */
export const HILLSHADE = 0.34;
/** Metres of fall per metre of run that reads as a fully lit or fully dark face. */
export const SHADE_SLOPE = 0.35;
/** The sun on the paper, and the shadow under it. Both warm: a hill is not water. */
export const SUN_INK = [255, 248, 228];
export const SHADE_INK = [56, 40, 22];
/** Metres above the sea at which the ground takes all of RELIEF_LIGHT. */
export const RELIEF_REF = 260;
/** How much the highest ground is lightened, so a raised hill reads as raised. */
export const RELIEF_LIGHT = 0.30;

// --------------------------------------------------------------- the paper --

/** Warm paper, the colour every other colour is mixed down toward. */
export const PAPER = [228, 209, 170];
/** The foxing and the shadow in the paper's own grain. */
export const PAPER_INK = [150, 118, 70];
/** The umber the frame's edge is burnt to. */
export const EDGE_INK = [82, 56, 30];
/** Sepia, the colour of every line that is not water. */
export const INK = '#4a3620';
export const INK_SOFT = 'rgba(74,54,32,.55)';
export const INK_FAINT = 'rgba(74,54,32,.26)';
/** The gold the border and the banner are ruled in. */
export const GILT = theme.gold;

/** Shallow water and deep water. Everything between is a mix of the two. */
export const WATER_SHALLOW = [134, 166, 174];
export const WATER_DEEP = [58, 92, 112];
/** Metres of depth at which the sea is fully WATER_DEEP. */
export const WATER_FLOOR = 16;
/** The line along the shore, and the two echoes that run outside it. */
export const COAST_INK = 'rgba(46,62,74,.88)';
export const COAST_ECHO = 'rgba(72,104,124,.40)';
export const WAVE_INK = 'rgba(70,102,122,.50)';
/** A river: a pale blue thread with a darker bank drawn under it. */
export const RIVER_INK = '#7ba5c4';
export const RIVER_BANK = 'rgba(48,72,94,.72)';
/** A road: tan, dashed, on a paler casing. */
export const ROAD_INK = '#8d6c3c';
export const ROAD_CASE = 'rgba(232,214,178,.85)';
/** The two greens a canopy clump is stippled in. */
export const CANOPY_DARK = 'rgba(58,84,50,.80)';
export const CANOPY_LIGHT = 'rgba(104,132,74,.72)';
/** Hachures, and the ink a drawn mountain is outlined and shaded with. */
export const HACHURE_INK = 'rgba(72,52,30,.62)';
export const PEAK_LINE = 'rgba(58,42,26,.88)';
export const PEAK_SHADE = 'rgba(96,80,58,.55)';
export const PEAK_SNOW = 'rgba(246,242,232,.90)';

/**
 * The paint each of the engine's eight biomes takes.
 *
 * These are not `win_map.BIOME_COLOUR`, which are the colours of the ground
 * seen from above at night. A chart is painted on paper: every one of these is
 * light, warm and low in chroma, so that ink drawn over it still reads.
 */
export const BIOME_PAINT = {
  ocean: [146, 172, 184],
  beach: [223, 203, 158],
  meadow: [165, 173, 108],
  boreal: [112, 130, 92],
  desert: [212, 185, 128],
  sakura: [199, 165, 166],
  mountain: [170, 160, 142],
  snow: [226, 228, 226],
};

/**
 * The paint each realm of Brackenwake lays over the biome under it, and how much.
 *
 * The sheet in `realms.js` names three kinds of country the engine has no biome
 * for (`fen`, `graveyard`, `crater`), and `zones.js` says so out loud: the fen
 * is a warm wet nudge with no override, the graveyard is desert under a cold
 * dry one, the crater is mountain under the hottest one in the world. On the
 * ground those three read as beach, pale desert and grey rock. On the map they
 * are allowed to be what the sheet calls them, because a map is a picture of
 * what a place IS: olive for the fen, ash for the graveyard, black red for the
 * crater. The mix is by the realm's own weight, so the colour fades out exactly
 * where the realm does.
 */
export const REALM_PAINT = {
  greenwold: { paint: [140, 170, 84], mix: 0.55 },
  verdant: { paint: [198, 146, 164], mix: 0.62 },
  saltmarch: { paint: [126, 142, 84], mix: 0.62 },
  emberwastes: { paint: [222, 178, 100], mix: 0.62 },
  stormpeaks: { paint: [150, 148, 148], mix: 0.58 },
  boneyard: { paint: [198, 190, 168], mix: 0.68 },
  frostreach: { paint: [230, 236, 242], mix: 0.60 },
  sunkenkingdom: { paint: [128, 168, 180], mix: 0.46 },
  ashenthrone: { paint: [112, 66, 56], mix: 0.72 },
};

/**
 * How thick the forest stands on each biome.
 *
 * The words are `arbor.FOREST_TYPES[biome].density`, which is what actually
 * decides how many trees a chunk grows. They are MIRRORED here rather than
 * imported because `arbor.js` imports THREE and the map must run in node with
 * no renderer; `auditMapPaint()` fails if a biome ever loses its row, which is
 * the only way the two can drift without anybody noticing.
 */
export const CANOPY_DENSITY = {
  ocean: 0, beach: 0.16, meadow: 0.62, boreal: 0.95,
  desert: 0.16, sakura: 0.62, mountain: 0.16, snow: 0.16,
};

/** The colour a place's glyph is inked and filled with, by kind. */
export const SITE_PAINT = {
  town: ['#5a3c1c', '#c9862f'], hamlet: ['#5a3c1c', '#d3a660'],
  ruin: ['#4a4038', '#b0a08c'], shrine: ['#3e3a52', '#c0b8d4'],
  dungeon: ['#1c1410', '#3a2418'], cave: ['#1c1410', '#4a3626'],
  camp: ['#5a3018', '#c4652c'], mine: ['#3c2c14', '#b8892c'],
  megastructure: ['#3a2a14', '#a8792a'], landmark: ['#4a3620', '#8f6f2a'],
  watchtower: ['#4a3c2a', '#a89468'], burned_farm: ['#3a2a1c', '#7a5236'],
  bandit_camp: ['#5a2a18', '#b4522c'], graveyard: ['#40404a', '#9aa0aa'],
  gate: ['#4a3c2a', '#a08a60'], fountain: ['#3a4a54', '#8fb6c4'],
  tower: ['#4a3c2a', '#b0a078'], tomb: ['#3c3830', '#8e8478'],
  castle: ['#4a3420', '#b08a4a'], temple: ['#4a4034', '#c2b48e'],
  arena: ['#4a4034', '#c0ac84'],
};

/** How big a place's glyph is drawn, relative to the map's own glyph scale. */
export const SITE_SIZE = {
  town: 1.55, hamlet: 0.95, castle: 1.45, temple: 1.30, megastructure: 1.60,
  arena: 1.20, graveyard: 1.10, dungeon: 1.15, mine: 1.10, ruin: 1.00,
  landmark: 0.85, shrine: 0.80, cave: 0.90, camp: 0.95, gate: 0.90,
  tower: 1.05, watchtower: 1.00, tomb: 0.95, fountain: 0.85,
  burned_farm: 1.00, bandit_camp: 1.00,
};

/** The order the places are drawn in, so a town's name is never under a dot. */
const KIND_RANK = {
  megastructure: 0, town: 1, castle: 2, temple: 3, hamlet: 4, dungeon: 5,
  mine: 6, arena: 7, ruin: 8, graveyard: 9, tomb: 10, tower: 11, cave: 12,
  landmark: 13, watchtower: 14, camp: 15, bandit_camp: 16, shrine: 17,
  gate: 18, fountain: 19, burned_farm: 20,
};

/** Every kind of place the world can put on the ground, in one list. */
export const PAINTED_KINDS = (() => {
  const s = new Set(ALL_KINDS.map((k) => k[1]));
  for (const k of Object.keys(ARTICLE)) s.add(k);
  for (const k of Object.keys(EXTRA_ARTICLE)) s.add(k);
  s.add('mine');
  return Object.freeze([...s].sort());
})();

/**
 * Everything this file promises, checked at import.
 *
 * The map already shipped once with five biomes and three tool cells. A kind of
 * place with no glyph draws nothing and says nothing, and a biome with no paint
 * draws as bare paper, and neither of those fails: they just quietly go
 * missing. So they fail here instead, loudly, at import, both directions.
 */
export function auditMapPaint() {
  const bad = [];
  for (const b of BIOMES) {
    if (!BIOME_PAINT[b]) bad.push(`the field can return the biome "${b}" and the map has no paint for it`);
    if (CANOPY_DENSITY[b] === undefined) bad.push(`the biome "${b}" has no canopy density, so its forest would never be stippled`);
  }
  for (const b of Object.keys(BIOME_PAINT)) if (!BIOMES.includes(b)) bad.push(`the map paints "${b}", which the field never returns`);
  for (const b of Object.keys(CANOPY_DENSITY)) if (!BIOMES.includes(b)) bad.push(`the map stipples "${b}", which the field never returns`);
  for (const zn of REALM_ZONES) {
    if (!REALM_PAINT[zn.id]) bad.push(`the realm "${zn.id}" has no paint, so its country would read as open wild`);
  }
  for (const id of Object.keys(REALM_PAINT)) if (!ZONE[id]) bad.push(`the map paints a realm "${id}" that zones.js does not have`);
  for (const k of PAINTED_KINDS) {
    if (!GLYPH[k]) bad.push(`a ${k} can stand in the world and has no glyph on the map`);
    if (!SITE_PAINT[k]) bad.push(`a ${k} can stand in the world and has no colour on the map`);
    if (!SITE_SIZE[k]) bad.push(`a ${k} can stand in the world and has no size on the map`);
    if (KIND_RANK[k] === undefined) bad.push(`a ${k} has no place in the draw order`);
  }
  for (const k of Object.keys(GLYPH)) if (!PAINTED_KINDS.includes(k)) bad.push(`the map has a glyph for "${k}", which the world never builds`);
  if (bad.length) throw new Error(`auditMapPaint: ${bad.length} problem(s)\n  ${bad.join('\n  ')}`);
  return { biomes: BIOMES.length, realms: REALM_ZONES.length, kinds: PAINTED_KINDS.length };
}

// ------------------------------------------------------------ small things --

const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;
const q = (v) => {
  const n = v < 0 ? 0 : v > 255 ? 255 : v | 0;
  return Math.min(255, Math.round(n / COLOUR_STEP) * COLOUR_STEP);
};
const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/** A deterministic number in [0, 1) from two integers. Never Math.random. */
export const rnd = (a, b, s = 0) => hash2(a | 0, b | 0, s) / 4294967296;

/** A place's name, the way a map writes it: display face, small capitals. */
export const labelFor = (name) => String(name || '').toUpperCase();

/**
 * How big every letter on the map is. Not linear in the canvas: a 640 pixel map
 * with 18 pixel labels is unreadable and a 2048 pixel one with 12 pixel labels
 * is a blank sheet, so the scale starts at half and climbs at half.
 */
export const fontScale = (px) => 0.5 + 0.5 * (px / 1000);

const face = (size, weight = '') => `${weight ? weight + ' ' : ''}${size.toFixed(1)}px ${theme.fonts.display}`;

/** Letter spacing, where the context has it. Canvas and SVG do; node may not. */
function tracking(g, em) {
  if (!('letterSpacing' in g)) return false;
  try { g.letterSpacing = `${em.toFixed(2)}px`; return true; } catch { return false; }
}

/**
 * A word with a dark halo behind it, which is the only way small type survives
 * on a painted ground. The halo is a STROKE and not a second fill, so a caller
 * counting `fillText` calls counts one per label and not two.
 */
function haloText(g, text, x, y, fill, halo = 'rgba(236,224,198,.85)', width = 3) {
  g.lineWidth = width;
  g.lineJoin = 'round';
  g.strokeStyle = halo;
  g.strokeText(text, x, y);
  g.fillStyle = fill;
  g.fillText(text, x, y);
}

// ---------------------------------------------------------------- the view --

/**
 * The rectangle of world this map covers and the pixels it covers it with.
 * `realm` fills all four from the realm's own disc plus a quarter of its reach
 * as margin, so a realm close up shows the country it stands in.
 */
export function viewFor(opts = {}) {
  const px = opts.px ?? opts.size ?? 1024;
  const py = opts.py ?? px;
  let { x = 0, z = 0 } = opts;
  let w = opts.w, h = opts.h;
  let title = opts.title || null;
  let subtitle = opts.subtitle ?? null;
  if (opts.realm) {
    const zn = ZONE[opts.realm];
    if (!zn || zn.parent) throw new Error(`paintMap: "${opts.realm}" is not one of the nine realms`);
    const reach = (zn.r + zn.edge) * 2.5;
    x = zn.x; z = zn.z; w = reach; h = reach;
    if (!title) title = zn.name;
    if (subtitle === null) subtitle = DANGER_WORD[zn.danger[1]] || null;
  }
  if (!(w > 0)) w = 2 * WORLD_HALF;
  if (!(h > 0)) h = w * (py / px);
  return {
    x, z, w, h, px, py,
    x0: x - w / 2, z0: z - h / 2,
    title: title || 'Brackenwake',
    subtitle: subtitle === null ? undefined : subtitle,
    fs: fontScale(Math.min(px, py)),
    // the border's own width plus a little: no word may be written under it
    margin: Math.min(px, py) * 0.028,
    pad: Math.min(px, py) * 0.028 + 13 * fontScale(Math.min(px, py)),
  };
}

/** World point to pixel, for a view. */
export const toPx = (v, x, z) => [((x - v.x0) / v.w) * v.px, ((z - v.z0) / v.h) * v.py];

/** Anything with `has`, an array, `true`, or nothing at all, as one predicate. */
export function asKnown(d) {
  if (d === true) return () => true;
  if (typeof d?.has === 'function') return (id) => d.has(id);
  if (Array.isArray(d)) { const s = new Set(d); return (id) => s.has(id); }
  return () => false;
}

// ------------------------------------------------------------ grid working --

/** A separable box blur over a grid, in place. `r` in cells, `passes` times. */
export function blur(a, gw, gh, r, passes = 2) {
  if (r < 1) return a;
  const tmp = new Float32Array(a.length);
  const n = 2 * r + 1;
  // A running sum, not a window: the sum for cell i + 1 is the sum for cell i
  // plus one value and minus one value, so a wide blur costs what a narrow one
  // costs. Nine realm washes at radius seven over forty thousand cells was
  // twenty three million adds a map before this and is now half a million. The
  // edges clamp, exactly as the window version did.
  for (let p = 0; p < passes; p++) {
    for (let j = 0; j < gh; j++) {
      const o = j * gw;
      let s = a[o] * (r + 1);
      for (let k = 1; k <= r; k++) s += a[o + (k >= gw ? gw - 1 : k)];
      for (let i = 0; i < gw; i++) {
        tmp[o + i] = s / n;
        const hi = i + r + 1, lo = i - r;
        s += a[o + (hi >= gw ? gw - 1 : hi)] - a[o + (lo < 0 ? 0 : lo)];
      }
    }
    for (let i = 0; i < gw; i++) {
      let s = tmp[i] * (r + 1);
      for (let k = 1; k <= r; k++) s += tmp[(k >= gh ? gh - 1 : k) * gw + i];
      for (let j = 0; j < gh; j++) {
        a[j * gw + i] = s / n;
        const hi = j + r + 1, lo = j - r;
        s += tmp[(hi >= gh ? gh - 1 : hi) * gw + i] - tmp[(lo < 0 ? 0 : lo) * gw + i];
      }
    }
  }
  return a;
}

/**
 * How many draw cells one sample cell is split into.
 *
 * The number that matters is the SIZE OF A DRAW CELL IN PIXELS: under about
 * four and a half pixels the compose is paying for detail no eye will find and
 * the run merging stops firing, and over about twelve the sample lattice starts
 * to show through the blur as squares. So it is worked out, not chosen.
 */
export function drawScaleFor(view, grid, opts = {}) {
  const asked = opts.drawScale;
  if (typeof asked === 'number' && asked >= 1) return Math.round(asked);
  const perSample = view.px / (grid.gw - 1);
  return Math.max(1, Math.min(3, Math.round(perSample / 4.6)));
}

/** Bilinear read of a grid at fractional cell coordinates. */
function bilin(a, gw, gh, u, v) {
  let i = Math.floor(u), j = Math.floor(v);
  if (i < 0) i = 0; else if (i > gw - 2) i = gw - 2;
  if (j < 0) j = 0; else if (j > gh - 2) j = gh - 2;
  const fu = u - i, fv = v - j;
  const o = j * gw + i;
  const a0 = a[o] + (a[o + 1] - a[o]) * fu;
  const a1 = a[o + gw] + (a[o + gw + 1] - a[o + gw]) * fu;
  return a0 + (a1 - a0) * fv;
}

/**
 * Marching squares: every line where a grid crosses `level`, stitched into
 * polylines. `at(i, j)` turns a grid node into the pixel the line is drawn in.
 *
 * The stitch is by rounded endpoint, which is exact here because two segments
 * that meet were built from the same interpolated point on the same cell edge.
 * A contour that runs off the view comes back as an open polyline, which is
 * what a coast that leaves the frame is, and nothing downstream closes it.
 */
export function contour(a, gw, gh, level, at) {
  const segs = [];
  const ip = (x0, y0, v0, x1, y1, v1) => {
    const t = (level - v0) / ((v1 - v0) || 1e-9);
    return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
  };
  for (let j = 0; j < gh - 1; j++) {
    for (let i = 0; i < gw - 1; i++) {
      const v0 = a[j * gw + i], v1 = a[j * gw + i + 1];
      const v2 = a[(j + 1) * gw + i + 1], v3 = a[(j + 1) * gw + i];
      let c = 0;
      if (v0 > level) c |= 1;
      if (v1 > level) c |= 2;
      if (v2 > level) c |= 4;
      if (v3 > level) c |= 8;
      if (c === 0 || c === 15) continue;
      const p0 = at(i, j), p1 = at(i + 1, j), p2 = at(i + 1, j + 1), p3 = at(i, j + 1);
      const top = () => ip(p0[0], p0[1], v0, p1[0], p1[1], v1);
      const right = () => ip(p1[0], p1[1], v1, p2[0], p2[1], v2);
      const bottom = () => ip(p3[0], p3[1], v3, p2[0], p2[1], v2);
      const left = () => ip(p0[0], p0[1], v0, p3[0], p3[1], v3);
      switch (c) {
        case 1: case 14: segs.push([left(), top()]); break;
        case 2: case 13: segs.push([top(), right()]); break;
        case 3: case 12: segs.push([left(), right()]); break;
        case 4: case 11: segs.push([right(), bottom()]); break;
        case 6: case 9: segs.push([top(), bottom()]); break;
        case 7: case 8: segs.push([left(), bottom()]); break;
        case 5: segs.push([left(), top()]); segs.push([right(), bottom()]); break;
        case 10: segs.push([top(), right()]); segs.push([left(), bottom()]); break;
        default: break;
      }
    }
  }
  // stitch: a point is a key, and a segment joins the two chains at its ends
  const key = (p) => `${Math.round(p[0] * 16)},${Math.round(p[1] * 16)}`;
  const ends = new Map();
  const lines = [];
  const attach = (line) => { ends.set(key(line[0]), line); ends.set(key(line[line.length - 1]), line); };
  const detach = (line) => { ends.delete(key(line[0])); ends.delete(key(line[line.length - 1])); };
  for (const [a0, b0] of segs) {
    const ka = key(a0), kb = key(b0);
    const la = ends.get(ka), lb = ends.get(kb);
    if (la && lb && la === lb) { detach(la); la.push(la[0]); lines.push(la); continue; }
    if (la && lb) {
      detach(la); detach(lb);
      const aEnd = key(la[la.length - 1]) === ka;
      const bStart = key(lb[0]) === kb;
      const A = aEnd ? la : la.slice().reverse();
      const B = bStart ? lb : lb.slice().reverse();
      const j = A.concat(B.slice(1));
      lines.splice(lines.indexOf(la), 1);
      lines.splice(lines.indexOf(lb), 1);
      lines.push(j); attach(j);
      continue;
    }
    if (la) {
      detach(la);
      if (key(la[la.length - 1]) === ka) la.push(b0); else la.unshift(b0);
      attach(la);
      continue;
    }
    if (lb) {
      detach(lb);
      if (key(lb[lb.length - 1]) === kb) lb.push(a0); else lb.unshift(a0);
      attach(lb);
      continue;
    }
    const line = [a0, b0];
    lines.push(line); attach(line);
  }
  return lines.filter((l) => l.length > 2);
}

/** Chaikin, twice: the corners a grid puts in a coast, taken back out of it. */
export function smoothLine(pts, passes = 2) {
  let out = pts;
  for (let p = 0; p < passes && out.length > 2; p++) {
    const next = [out[0]];
    for (let i = 0; i < out.length - 1; i++) {
      const a = out[i], b = out[i + 1];
      next.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
      next.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    next.push(out[out.length - 1]);
    out = next;
  }
  return out;
}

/** A polyline as a path on the context. Nothing is filled and nothing closed. */
function pathLine(g, pts) {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
}

// ------------------------------------------------------------ the sampling --

/** How thick the canopy stands at one sample. Biome, height, wet and worked. */
export function canopyAt(s) {
  if (s.water) return 0;
  let d = CANOPY_DENSITY[s.biome] ?? 0;
  if (s.biome === 'meadow' || s.biome === 'sakura') d *= 0.55 + 0.75 * smoothstep(0.42, 0.72, s.moist);
  d *= 1 - smoothstep(46, 78, s.h);          // thinning to the rock line, as arbor does
  d *= 1 - clamp01(s.road * 1.2);            // nothing grows on the road
  d *= 1 - clamp01(s.river * 1.6);           // nor in the river
  return clamp01(d);
}

/**
 * The whole ground of one view, sampled once.
 *
 * Everything downstream reads this and nothing calls the field again, which is
 * what lets a repaint after a discovery cost nothing: the grid is the expensive
 * thing (a world map is thirty seven thousand `sampleAt` calls) and it does not
 * change when a player walks up to a hut.
 */
export function sampleGround(field, view, opts = {}) {
  const n = Math.max(16, opts.samples ?? MAP_SAMPLES);
  const long = Math.max(view.w, view.h);
  const gw = Math.max(8, Math.round(n * (view.w / long))) + 1;
  const gh = Math.max(8, Math.round(n * (view.h / long))) + 1;
  const dx = view.w / (gw - 1), dz = view.h / (gh - 1);
  const knownZone = asKnown(opts.known?.zones);
  const N = gw * gh;

  const h = new Float32Array(N);
  const water = new Float32Array(N);
  const depth = new Float32Array(N);
  const river = new Float32Array(N);
  const road = new Float32Array(N);
  const canopy = new Float32Array(N);
  const known = new Float32Array(N);
  const tr = new Float32Array(N), tg = new Float32Array(N), tb = new Float32Array(N);
  const realmIdx = new Int16Array(N).fill(-1);
  const realmW = new Float32Array(N);
  const biome = new Uint8Array(N);

  for (let j = 0; j < gh; j++) {
    const wz = view.z0 + j * dz;
    for (let i = 0; i < gw; i++) {
      const wx = view.x0 + i * dx;
      const s = field.sampleAt(wx, wz);
      const o = j * gw + i;
      h[o] = s.h;
      // OPEN WATER IS `biome === 'ocean'`, NOT `s.water`.
      //
      // `s.water` is only `h < SEA_LEVEL`, and field.js carves every river bed
      // to -1.8, which is under it. Reading `s.water` paints every river in the
      // world as a piece of sea, and it painted the rivers out of existence
      // here as well, because the river tracer below was throwing away every
      // point it found on the grounds that the point was in the sea. The field
      // itself settles it one line later: water with a river in it is a river,
      // and water without one is the ocean.
      const open = s.biome === 'ocean';
      water[o] = open ? 1 : 0;
      depth[o] = open ? clamp01((SEA_LEVEL - s.h) / WATER_FLOOR) : 0;
      river[o] = s.river;
      road[o] = s.road;
      biome[o] = Math.max(0, BIOMES.indexOf(s.biome));
      canopy[o] = canopyAt(s);
      // the realm this ground belongs to, and how much of it this is
      const zn = s.realm ? ZONE[s.realm] : null;
      let rw = 0;
      if (zn) {
        realmIdx[o] = REALM_ZONES.indexOf(zn);
        rw = weightOf(zn, wx, wz);
        realmW[o] = rw;
      }
      // open country nobody claims has no name to withhold, so it is always known
      known[o] = zn ? (knownZone(zn.id) ? 1 : 0) : 1;
      // the paint: the biome, then the realm's own colour over it by weight
      let c = BIOME_PAINT[s.biome] || BIOME_PAINT.meadow;
      const rp = zn ? REALM_PAINT[zn.id] : null;
      if (rp && rw > 0) c = mix(c, rp.paint, rp.mix * rw);
      tr[o] = c[0]; tg[o] = c[1]; tb[o] = c[2];
    }
  }

  // slope, in metres per metre, from the heights either side of each node, and
  // the hillshade off the same two gradients: how much of the north west sun a
  // face takes, +1 full on, -1 in its own shadow.
  //
  // The sign, worked out rather than guessed. The gradient points UPHILL, so a
  // node where the ground rises toward +x has its downhill toward -x and faces
  // WEST; one where it rises toward +z faces NORTH, because -z is north on this
  // map. The sun stands north west, so both of those are lit and the dot of the
  // gradient with -SUN_DIR is gx + gz over root two.
  const slope = new Float32Array(N);
  const shade = new Float32Array(N);
  for (let j = 0; j < gh; j++) {
    for (let i = 0; i < gw; i++) {
      const o = j * gw + i;
      const xa = h[o - (i > 0 ? 1 : 0)], xb = h[o + (i < gw - 1 ? 1 : 0)];
      const za = h[o - (j > 0 ? gw : 0)], zb = h[o + (j < gh - 1 ? gw : 0)];
      const gx = (xb - xa) / (dx * ((i > 0 ? 1 : 0) + (i < gw - 1 ? 1 : 0)) || dx);
      const gz = (zb - za) / (dz * ((j > 0 ? 1 : 0) + (j < gh - 1 ? 1 : 0)) || dz);
      slope[o] = Math.hypot(gx, gz);
      const lit = -(gx * SUN_DIR[0] + gz * SUN_DIR[1]) / SHADE_SLOPE;
      shade[o] = lit > 1 ? 1 : lit < -1 ? -1 : lit;
    }
  }

  // the fields the compose reads back, each blurred so its edge is paint
  // the foxing in the sheet, on the SAMPLE grid rather than per drawn cell: a
  // value that changes every pixel would leave the compose with no two cells
  // the same colour, and the run merging that makes an ocean one rectangle
  // would never fire once. The fine grain is strokes, drawn afterwards.
  const mottle = new Float32Array(N);
  {
    const mn = createNoise((opts.seed ?? 1) + 913);
    for (let j = 0; j < gh; j++) {
      for (let i = 0; i < gw; i++) {
        const wx = view.x0 + i * dx, wz = view.z0 + j * dz;
        mottle[j * gw + i] = clamp01(0.5 + 0.5 * mn.fbm(wx / (view.w * 0.16), wz / (view.h * 0.16), 3));
      }
    }
  }
  const wa = Float32Array.from(water); blur(wa, gw, gh, WATER_BLUR, 2);
  // the same mask blurred much further out, which is how the map knows how far
  // from the shore it is: the wave hatch and the two echo lines both read it
  const waFar = Float32Array.from(water); blur(waFar, gw, gh, 3, 2);
  const da = Float32Array.from(depth); blur(da, gw, gh, WATER_BLUR, 2);
  const ka = Float32Array.from(known); blur(ka, gw, gh, 1, 2);
  const cn = Float32Array.from(canopy); blur(cn, gw, gh, 1, 1);
  const sl = Float32Array.from(slope); blur(sl, gw, gh, 1, 1);
  const sd = Float32Array.from(shade); blur(sd, gw, gh, 1, 1);
  const hb = Float32Array.from(h); blur(hb, gw, gh, 1, 2);
  blur(tr, gw, gh, TINT_BLUR, 2); blur(tg, gw, gh, TINT_BLUR, 2); blur(tb, gw, gh, TINT_BLUR, 2);

  // the realm washes: a realm's own mask, minus a blurred copy of itself, is a
  // dark band that lies inside the rim and fades to nothing in the middle. One
  // pass per realm, summed, so an overlap darkens once for each side of it
  const wash = new Float32Array(N);
  const mask = new Float32Array(N);
  const soft = new Float32Array(N);
  for (let r = 0; r < REALM_ZONES.length; r++) {
    let any = false;
    for (let o = 0; o < N; o++) {
      const m = realmIdx[o] === r ? 1 : 0;
      mask[o] = m;
      if (m) any = true;
    }
    if (!any) continue;
    soft.set(mask); blur(soft, gw, gh, WASH_BLUR, 2);
    for (let o = 0; o < N; o++) if (mask[o]) wash[o] += (1 - soft[o]) * WASH_MAX;
  }
  blur(wash, gw, gh, 1, 1);

  return {
    gw, gh, dx, dz, x0: view.x0, z0: view.z0,
    h, hb, water, depth, river, road, slope: sl, rawSlope: slope,
    shade: sd, rawShade: shade, canopy, known,
    biome, realmIdx, realmW, tr, tg, tb, wa, waFar, da, ka, cn, wash, mottle,
    at: (i, j) => [((i * dx) / view.w) * view.px, ((j * dz) / view.h) * view.py],
    world: (i, j) => [view.x0 + i * dx, view.z0 + j * dz],
    samples: N,
  };
}

// ----------------------------------------------------------------- paper ----

/** Three octaves of value noise on a PIXEL lattice: the grain in the sheet. */
export function paperAt(px, py, seed) {
  let v = 0, amp = 1, norm = 0, sc = 1 / 57;
  for (let o = 0; o < 3; o++) {
    const x = px * sc, y = py * sc;
    const i = Math.floor(x), j = Math.floor(y);
    const fx = x - i, fy = y - j;
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const s = seed + o * 977;
    const a = rnd(i, j, s), b = rnd(i + 1, j, s);
    const c = rnd(i, j + 1, s), d = rnd(i + 1, j + 1, s);
    v += amp * lerp(lerp(a, b, sx), lerp(c, d, sx), sy);
    norm += amp; amp *= 0.52; sc *= 2.7;
  }
  return v / norm;
}

/**
 * The fine grain in the sheet: fibres and foxing, drawn as strokes over the
 * composed ground rather than mixed into it, so a thousand miles of open sea is
 * still one rectangle underneath.
 */
function paintFibre(g, view, opts) {
  const seed = (opts.seed ?? 1) + 5;
  const fs = view.fs;
  const n = Math.round((view.px * view.py) / 1500);
  g.setLineDash([]);
  g.lineCap = 'round';
  g.strokeStyle = 'rgba(140,108,60,.13)';
  g.lineWidth = 0.8 * fs;
  g.beginPath();
  for (let i = 0; i < n; i++) {
    const x = rnd(i, 1, seed) * view.px, y = rnd(i, 2, seed) * view.py;
    const a = rnd(i, 3, seed) * Math.PI * 2;
    const len = (2 + 12 * rnd(i, 4, seed)) * fs;
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len * 0.35);
  }
  g.stroke();
  g.lineCap = 'butt';
  // foxing: the brown blooms an old sheet grows where it was damp
  const blots = Math.round(n / 34);
  for (let i = 0; i < blots; i++) {
    const x = rnd(i, 11, seed) * view.px, y = rnd(i, 12, seed) * view.py;
    const r = (5 + 26 * rnd(i, 13, seed)) * fs;
    g.fillStyle = 'rgba(146,100,44,.075)';
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  return n + blots;
}

/**
 * The ground, composed and laid down.
 *
 * One pass over the draw cells. Every layer is mixed into one colour here
 * rather than painted over the last one, and runs of equal colour along a row
 * come out as a single `fillRect`, which is why an ocean costs almost nothing.
 */
function composeGround(g, view, grid, opts) {
  const scale = drawScaleFor(view, grid, opts);
  const dw = (grid.gw - 1) * scale, dh = (grid.gh - 1) * scale;
  const cw = view.px / dw, ch = view.py / dh;
  const seed = opts.seed ?? 1;
  const { gw, gh } = grid;
  const halfD = Math.hypot(view.px, view.py) / 2;
  const edgeBand = Math.min(view.px, view.py) * 0.048;
  let rects = 0;
  let runX = 0, runN = 0, runCol = '';

  const flush = (j) => {
    if (!runN) return;
    g.fillStyle = runCol;
    g.fillRect(runX * cw, j * ch, runN * cw + 0.6, ch + 0.6);
    rects++;
    runN = 0;
  };

  for (let dj = 0; dj < dh; dj++) {
    const v = (dj + 0.5) / scale;
    const py = (dj + 0.5) * ch;
    for (let di = 0; di < dw; di++) {
      const u = (di + 0.5) / scale;
      const px = (di + 0.5) * cw;

      const kA = bilin(grid.ka, gw, gh, u, v);
      const wA = bilin(grid.wa, gw, gh, u, v);
      const dA = bilin(grid.da, gw, gh, u, v);
      const slp = bilin(grid.slope, gw, gh, u, v);
      const wsh = bilin(grid.wash, gw, gh, u, v);
      const pn = bilin(grid.mottle, gw, gh, u, v);

      // the sheet itself, foxed
      let c = mix(PAPER, PAPER_INK, 0.10 * pn + 0.03);
      // the land, tinted by biome and realm, but never opaque: the sheet the
      // whole thing is painted on has to be in every colour on it
      const landA = (1 - wA) * kA;
      if (landA > 0.002) {
        const t = [bilin(grid.tr, gw, gh, u, v), bilin(grid.tg, gw, gh, u, v), bilin(grid.tb, gw, gh, u, v)];
        c = mix(c, t, landA * 0.84);
        if (slp > 0.02) c = mix(c, [80, 62, 38], landA * 0.26 * clamp01(slp / 0.50));
        // how high it stands: the raised ground of a sculpted world is the only
        // thing on it that has changed, so it is the thing the eye is given
        const hh = bilin(grid.hb, gw, gh, u, v);
        if (hh > 0) c = mix(c, SUN_INK, landA * RELIEF_LIGHT * clamp01(hh / RELIEF_REF));
        // and which way it leans, under a north west sun
        const sd = bilin(grid.shade, gw, gh, u, v);
        if (sd > 0.004) c = mix(c, SUN_INK, landA * HILLSHADE * sd);
        else if (sd < -0.004) c = mix(c, SHADE_INK, landA * HILLSHADE * -sd);
      }
      // the water
      if (wA > 0.002) c = mix(c, mix(WATER_SHALLOW, WATER_DEEP, clamp01(dA)), wA * kA * (0.80 + 0.18 * clamp01(dA)));
      // the realm's own border, washed inward
      if (wsh > 0.002) c = mix(c, [62, 42, 24], wsh * kA);
      // country nobody has walked: paper, gone grey, and nothing else on it
      if (kA < 0.998) c = mix(c, [203, 195, 180], (1 - kA) * 0.48);
      // one warm glaze over the whole sheet, which is what makes a map painted
      // in nine colours read as one picture
      c = mix(c, [206, 176, 122], 0.09);
      // the burnt vignette, and the torn edge under it
      const r = Math.hypot(px - view.px / 2, py - view.py / 2) / halfD;
      const vg = smoothstep(0.40, 1.06, r) * 0.34;
      if (vg > 0) c = mix(c, EDGE_INK, vg);
      const eDist = Math.min(px, view.px - px, py, view.py - py);
      const torn = edgeBand * (0.55 + 0.85 * paperAt(px * 0.30, py * 0.30, seed + 41));
      if (eDist < torn) c = mix(c, EDGE_INK, 0.72 * (1 - eDist / torn) ** 1.5);

      const col = `rgb(${q(c[0])},${q(c[1])},${q(c[2])})`;
      if (runN && col === runCol) { runN++; continue; }
      flush(dj);
      runX = di; runN = 1; runCol = col;
    }
    flush(dj);
  }
  return rects;
}

// ------------------------------------------------------------ the sea line --

/**
 * The coast: the line itself, two echoes running outside it, and the wave
 * hatch. The line is where the field stops saying water; the echoes are the
 * same mask blurred further, which is exactly the "one more line, a little way
 * out" an old chart draws by hand.
 */
function paintSea(g, view, grid, opts) {
  const fs = view.fs;
  const at = grid.at;
  let waves = 0;

  g.setLineDash([]);
  // the echoes first, so the coast line lands on top of them
  for (const [level, alpha, wide] of [[0.72, 0.30, 1.0], [0.40, 0.20, 0.9]]) {
    for (const raw of contour(grid.waFar, grid.gw, grid.gh, level, at)) {
      const pts = smoothLine(raw, 2);
      if (pts.length < 3) continue;
      g.strokeStyle = COAST_ECHO;
      g.globalAlpha = alpha;
      g.lineWidth = wide * fs;
      pathLine(g, pts);
      g.stroke();
    }
  }
  g.globalAlpha = 1;

  // the shore itself: one line, and nothing behind it. A pale halo under the
  // coast reads as a glow round every island rather than as a beach; the beach
  // is the field's own `beach` biome and it is already painted.
  const coast = contour(grid.wa, grid.gw, grid.gh, 0.5, at).map((l) => smoothLine(l, 2));
  for (const pts of coast) {
    g.strokeStyle = COAST_INK;
    g.lineWidth = 1.5 * fs;
    pathLine(g, pts);
    g.stroke();
  }

  // the wave hatch, on the sea side only and only where the shore is in sight
  // (the realm rims are drawn by paintRealmRims, further down)
  const step = 26 * fs;
  const { gw, gh } = grid;
  const wave = [];
  g.strokeStyle = WAVE_INK;
  g.lineWidth = 1.1 * fs;
  for (let py = step * 0.6; py < view.py; py += step) {
    for (let px = step * 0.6; px < view.px; px += step) {
      const u = (px / view.px) * (gw - 1), v = (py / view.py) * (gh - 1);
      const wA = bilin(grid.wa, gw, gh, u, v);
      const far = bilin(grid.waFar, gw, gh, u, v);
      const kA = bilin(grid.ka, gw, gh, u, v);
      if (wA < 0.92 || kA < 0.6) continue;
      const jx = (rnd(px | 0, py | 0, 7) - 0.5) * step * 0.7;
      const jy = (rnd(px | 0, py | 0, 8) - 0.5) * step * 0.7;
      // thick near the shore, thinning to nothing in the deep, which is where
      // an old chart stops drawing water and starts drawing sea monsters
      if (rnd(px | 0, py | 0, 9) > 0.34 + 0.60 * (1 - far)) continue;
      wave.push(px + jx, py + jy);
      waves++;
    }
  }
  if (wave.length) {
    const a = 4.4 * fs;
    g.beginPath();
    for (let i = 0; i < wave.length; i += 2) {
      const x = wave[i], y = wave[i + 1];
      g.moveTo(x - a * 2, y);
      g.quadraticCurveTo(x - a, y - a * 0.9, x, y);
      g.quadraticCurveTo(x + a, y + a * 0.9, x + a * 2, y);
    }
    g.stroke();
  }
  return { coast: coast.length, waves };
}

// -------------------------------------------------------------- the rivers --

/**
 * Metres of wavelength in the field's own river noise. MIRRORED from
 * `field.js`'s private `W_RIVER`, because the zero set of that noise is the
 * only cheap way to find a ten metre river in a sixteen kilometre square.
 *
 * The mirror cannot lie about where a river IS, because nothing traced here is
 * drawn until `field.sampleAt(x, z).river` agrees at that exact point. If the
 * wavelength ever changes, this stops FINDING rivers rather than starting to
 * invent them, and `map_paint.test.mjs` measures how many of the field's own
 * river cells ended up within a stride of a drawn line.
 */
export const RIVER_WAVELENGTH = 900;

/** The field's river noise at a world point. Zero is the middle of a river. */
export function riverNoiseAt(noise, x, z) {
  const [rx, rz] = noise.warp(x / RIVER_WAVELENGTH + 77, z / RIVER_WAVELENGTH - 77, 0.25, 2.3);
  return noise.fbm(rx, rz, 3);
}

/**
 * One Newton step onto the middle of the river.
 *
 * A river is about twenty metres wide and the tracing grid steps eighty, so the
 * point marching squares interpolates onto the cell edge can sit ten or fifteen
 * metres off the channel: far enough that `sampleAt` there says there is no
 * river, which is how the first draft of this file drew none at all. One step
 * down the noise's own gradient puts the point back in the water, and it costs
 * five noise reads rather than another grid.
 */
export function refineToChannel(noise, x, z, e = 7) {
  // Forward differences, three reads and not five. One Newton step is already
  // an approximation and the field has the last word on every point anyway, so
  // the second decimal place of the gradient is not worth forty per cent of the
  // cost of tracing every river in the world.
  const v = riverNoiseAt(noise, x, z);
  const gx = (riverNoiseAt(noise, x + e, z) - v) / e;
  const gz = (riverNoiseAt(noise, x, z + e) - v) / e;
  const g2 = gx * gx + gz * gz;
  if (g2 < 1e-14) return [x, z];
  return [x - (v * gx) / g2, z - (v * gz) / g2];
}

/**
 * Every river in the view, as pixel polylines, each one proved against the
 * field at every point on it before it is kept.
 */
export function riverLines(field, view, opts = {}) {
  const noise = createNoise(field.seed);
  const long = Math.max(view.w, view.h);
  const stride = Math.max(32, Math.min(90, long / 260));
  const gw = Math.max(8, Math.round(view.w / stride)) + 1;
  const gh = Math.max(8, Math.round(view.h / stride)) + 1;
  const dx = view.w / (gw - 1), dz = view.h / (gh - 1);
  const a = new Float32Array(gw * gh);
  for (let j = 0; j < gh; j++) {
    for (let i = 0; i < gw; i++) a[j * gw + i] = riverNoiseAt(noise, view.x0 + i * dx, view.z0 + j * dz);
  }
  const knownZone = asKnown(opts.known?.zones);
  const out = [];
  let tested = 0, skipped = 0;
  // The cheap refusal. `sampleAt` costs two microseconds and the tracer wants
  // thirty thousand of them; seven points in eight of the contour of a warped
  // noise are in the sea or up a mountain, where field.js's own river block
  // multiplies the river out to nothing. The ground grid is already sampled by
  // the time this runs, so those are thrown out for the price of an array read.
  // The thresholds are generous on purpose: this may only ever LOSE a river,
  // never invent one, and the coverage figure in map_paint.test.mjs is what
  // says whether it is losing too many.
  const grid = opts.grid || null;
  const cheapNo = grid
    ? (wx, wz) => {
      const u = ((wx - view.x0) / view.w) * (grid.gw - 1);
      const v = ((wz - view.z0) / view.h) * (grid.gh - 1);
      if (u < 0 || v < 0 || u > grid.gw - 1 || v > grid.gh - 1) return true;
      if (bilin(grid.wa, grid.gw, grid.gh, u, v) > 0.80) return true;   // the open sea
      if (bilin(grid.hb, grid.gw, grid.gh, u, v) > 42) return true;     // well above the valleys
      return false;
    }
    : () => false;
  for (const line of contour(a, gw, gh, 0, (i, j) => [view.x0 + i * dx, view.z0 + j * dz])) {
    // Walk the RAW contour and ask the field, which is the only authority on
    // whether there is a river here. Nothing is smoothed before the asking:
    // Chaikin cuts the corners of a wiggling line by ten or twenty metres, and
    // twenty metres is the whole width of a river.
    let run = null;
    let carried = 0;
    for (let i = 0; i < line.length; i++) {
      const [cx, cz] = line[i];
      if (i > 0) carried += Math.hypot(cx - line[i - 1][0], cz - line[i - 1][1]);
      if (i > 0 && i < line.length - 1 && carried < RIVER_STEP) continue;
      carried = 0;
      if (cheapNo(cx, cz)) { skipped++; run = null; continue; }
      const [wx, wz] = refineToChannel(noise, cx, cz);
      const s = field.sampleAt(wx, wz);
      tested++;
      const zn = s.realm ? ZONE[s.realm] : null;
      const ok = s.river >= RIVER_MIN && s.biome !== 'ocean' && (!zn || knownZone(zn.id));
      if (ok) {
        if (!run) { run = []; out.push(run); }
        run.push([...toPx(view, wx, wz), s.river]);
      } else run = null;
    }
  }
  // A river two points long is a crumb of the contour, not a river, and forty
  // of them scattered over a moor read as dirt on the paper. `RIVER_MIN_RUN`
  // is measured in the pixels the line will actually occupy.
  const kept = [];
  for (const l of out) {
    if (l.length < 3) continue;
    let run = 0;
    for (let i = 1; i < l.length; i++) run += Math.hypot(l[i][0] - l[i - 1][0], l[i][1] - l[i - 1][1]);
    if (run >= RIVER_MIN_RUN * view.fs) kept.push(l);
  }
  return { lines: kept, tested, skipped, stride };
}

/** Rivers: a dark bank under a pale blue thread, both tapering with the flow. */
function paintRivers(g, view, lines) {
  const fs = view.fs;
  g.setLineDash([]);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const raw of lines) {
    const pts = smoothLine(raw.map((p) => [p[0], p[1]]), 1);
    let flow = 0;
    for (const p of raw) flow += p[2];
    flow /= raw.length;
    g.strokeStyle = RIVER_BANK;
    g.lineWidth = (1.6 + 2.2 * flow) * fs;
    pathLine(g, pts); g.stroke();
    g.strokeStyle = RIVER_INK;
    g.lineWidth = (0.8 + 1.4 * flow) * fs;
    pathLine(g, pts); g.stroke();
  }
  g.lineCap = 'butt';
}

// -------------------------------------------------------------- the relief --

/**
 * Hachures: a short stroke straight down the slope, wherever the ground falls
 * faster than RIDGE_SLOPE. Thick and close where it is steep, thin and sparse
 * where it is not, which is exactly what a hachure is for and why it does not
 * need a light source to read as a mountainside.
 */
function paintHachures(g, view, grid, opts) {
  const fs = view.fs;
  const { gw, gh } = grid;
  const step = HATCH_SPACING * fs;
  let drawn = 0, tested = 0;
  // Four weights, and every stroke of one weight goes into one path. A hachure
  // field is thousands of strokes; thousands of ELEMENTS is megabytes of file
  // and thousands of state changes on a canvas, for the same picture.
  const BANDS = 4;
  const band = [];
  for (let i = 0; i < BANDS; i++) band.push([]);
  g.setLineDash([]);
  g.strokeStyle = HACHURE_INK;
  g.lineCap = 'round';
  for (let py = step * 0.5; py < view.py; py += step) {
    for (let px = step * 0.5; px < view.px; px += step) {
      const u = (px / view.px) * (gw - 1), v = (py / view.py) * (gh - 1);
      tested++;
      const slp = bilin(grid.slope, gw, gh, u, v);
      if (slp < RIDGE_SLOPE) continue;
      if (bilin(grid.wa, gw, gh, u, v) > 0.4) continue;
      if (bilin(grid.ka, gw, gh, u, v) < 0.6) continue;
      // downhill, from the blurred heights either side of this point
      const e = 0.6;
      const hx = bilin(grid.hb, gw, gh, u + e, v) - bilin(grid.hb, gw, gh, u - e, v);
      const hy = bilin(grid.hb, gw, gh, u, v + e) - bilin(grid.hb, gw, gh, u, v - e);
      const m = Math.hypot(hx, hy) || 1;
      const dx = hx / m, dy = hy / m;
      const k = clamp01((slp - RIDGE_SLOPE) / 0.5);
      const len = (2.6 + 7.0 * k) * fs;
      const jx = (rnd(px | 0, py | 0, 21) - 0.5) * step * 0.75;
      const jy = (rnd(px | 0, py | 0, 22) - 0.5) * step * 0.75;
      const b = Math.min(BANDS - 1, Math.floor(k * BANDS));
      band[b].push(px + jx, py + jy, px + jx + dx * len, py + jy + dy * len);
      drawn++;
    }
  }
  for (let i = 0; i < BANDS; i++) {
    const pts = band[i];
    if (!pts.length) continue;
    const k = (i + 0.5) / BANDS;
    g.globalAlpha = 0.45 + 0.50 * k;
    g.lineWidth = (0.6 + 1.1 * k) * fs;
    g.beginPath();
    for (let j = 0; j < pts.length; j += 4) {
      g.moveTo(pts[j], pts[j + 1]);
      g.lineTo(pts[j + 2], pts[j + 3]);
    }
    g.stroke();
  }
  g.globalAlpha = 1;
  g.lineCap = 'butt';
  return { drawn, tested, bands: band.filter((b) => b.length).length };
}

/**
 * The peaks worth drawing: the local maxima of the blurred height field above
 * PEAK_HEIGHT, taken tallest first and never nearer than PEAK_SPACING to one
 * already taken, so a range comes out as a row of mountains and not as a blot.
 */
export function peaksIn(view, grid, opts = {}) {
  const { gw, gh } = grid;
  const cand = [];
  for (let j = 1; j < gh - 1; j++) {
    for (let i = 1; i < gw - 1; i++) {
      const o = j * gw + i;
      const v = grid.hb[o];
      if (v < PEAK_HEIGHT) continue;
      if (grid.wa[o] > 0.25 || grid.ka[o] < 0.6) continue;
      let top = true;
      for (let b = -1; b <= 1 && top; b++) for (let a = -1; a <= 1; a++) {
        if (!a && !b) continue;
        if (grid.hb[(j + b) * gw + i + a] > v) { top = false; break; }
      }
      if (!top) continue;
      // and it has to STAND OUT: a broad swell forty metres up is high ground
      // and the hachures say so, but it is not a mountain and drawing one there
      // put a range across the Greenwold's wheat
      let low = v;
      for (let b = -2; b <= 2; b++) {
        const jj = j + b; if (jj < 0 || jj >= gh) continue;
        for (let a = -2; a <= 2; a++) {
          const ii = i + a; if (ii < 0 || ii >= gw) continue;
          const t = grid.hb[jj * gw + ii];
          if (t < low) low = t;
        }
      }
      if (v - low < PEAK_RELIEF) continue;
      const [px, py] = grid.at(i, j);
      cand.push({ px, py, h: v, relief: v - low, i, j });
    }
  }
  cand.sort((a, b) => (b.h - a.h) || (a.i - b.i) || (a.j - b.j));
  const spacing = (opts.spacing ?? PEAK_SPACING) * view.fs;
  const kept = [];
  for (const c of cand) {
    let ok = true;
    for (const k of kept) if (Math.hypot(k.px - c.px, k.py - c.py) < spacing) { ok = false; break; }
    if (ok) kept.push(c);
  }
  return kept;
}

/** One drawn mountain: a peak, a shaded face, hatch on the light one, a cap. */
function mountainGlyph(g, x, y, s, tall, snow) {
  const wide = s * 1.35;
  g.beginPath();
  g.moveTo(x - wide, y);
  g.lineTo(x - s * 0.18, y - tall);
  g.lineTo(x + s * 0.34, y - tall * 0.72);
  g.lineTo(x + wide, y);
  g.closePath();
  g.fillStyle = 'rgba(222,208,178,.70)';
  g.fill();
  // the shaded face, from the apex down the right side to the foot
  g.beginPath();
  g.moveTo(x - s * 0.18, y - tall);
  g.lineTo(x + s * 0.34, y - tall * 0.72);
  g.lineTo(x + wide, y);
  g.lineTo(x - s * 0.18, y);
  g.closePath();
  g.fillStyle = PEAK_SHADE;
  g.fill();
  if (snow) {
    g.beginPath();
    g.moveTo(x - s * 0.18, y - tall);
    g.lineTo(x + s * 0.10, y - tall * 0.80);
    g.lineTo(x - s * 0.02, y - tall * 0.70);
    g.lineTo(x - s * 0.40, y - tall * 0.74);
    g.closePath();
    g.fillStyle = PEAK_SNOW;
    g.fill();
  }
  g.strokeStyle = PEAK_LINE;
  g.lineWidth = Math.max(0.7, s * 0.17);
  g.lineJoin = 'round';
  g.beginPath();
  g.moveTo(x - wide, y);
  g.lineTo(x - s * 0.18, y - tall);
  g.lineTo(x + s * 0.34, y - tall * 0.72);
  g.lineTo(x + wide, y);
  g.stroke();
  g.beginPath();
  g.moveTo(x - s * 0.18, y - tall);
  g.lineTo(x - s * 0.06, y);
  g.stroke();
  // three strokes down the shaded face, which is what turns a triangle into a
  // hillside: they start on the ridge and run to the foot, fanning as they go
  g.lineWidth = Math.max(0.5, s * 0.085);
  g.strokeStyle = 'rgba(58,42,26,.50)';
  for (let i = 1; i <= 3; i++) {
    const t = i / 4;
    const rx = x - s * 0.18 + (x + s * 0.34 - (x - s * 0.18)) * t;
    const ry = y - tall + (tall - tall * 0.72) * t;
    g.beginPath();
    g.moveTo(rx, ry);
    g.lineTo(x - s * 0.06 + s * (0.34 + 0.36 * i), y);
    g.stroke();
  }
}

/** The mountains, drawn where the ground is high. */
function paintPeaks(g, view, grid, opts) {
  const fs = view.fs;
  const peaks = peaksIn(view, grid, opts);
  g.setLineDash([]);
  for (const p of peaks) {
    const k = clamp01((p.h - PEAK_HEIGHT) / 90);
    const s = (7.0 + 11.0 * k) * fs;
    // the shoulders first, so the tallest of the group stands in front of them
    const side = rnd(p.i, p.j, 32) > 0.5 ? 1 : -1;
    const s2 = s * (0.55 + 0.16 * rnd(p.i, p.j, 33));
    mountainGlyph(g, p.px + side * s * 1.55, p.py - s * 0.14, s2, s2 * 1.6, p.h > 90);
    if (k > 0.28) {
      const s3 = s * (0.44 + 0.18 * rnd(p.i, p.j, 34));
      mountainGlyph(g, p.px - side * s * 1.40, p.py + s * 0.10, s3, s3 * 1.6, false);
    }
    const tall = s * (1.55 + 0.55 * rnd(p.i, p.j, 31));
    mountainGlyph(g, p.px, p.py, s, tall, p.h > 74);
  }
  return peaks.length;
}

// ------------------------------------------------------------- the canopy --

/** Forest, stippled: clumps of small circles in two greens where trees stand. */
function paintCanopy(g, view, grid, opts) {
  const fs = view.fs;
  const { gw, gh } = grid;
  const step = CANOPY_SPACING * fs;
  let clumps = 0, dots = 0;
  g.setLineDash([]);
  for (let py = step * 0.5; py < view.py; py += step) {
    for (let px = step * 0.5; px < view.px; px += step) {
      const u = (px / view.px) * (gw - 1), v = (py / view.py) * (gh - 1);
      const d = bilin(grid.cn, gw, gh, u, v);
      if (d <= 0.04) continue;
      if (bilin(grid.ka, gw, gh, u, v) < 0.6) continue;
      const key = (px | 0) * 7919 + (py | 0);
      if (rnd(px | 0, py | 0, 51) > d) continue;
      const jx = (rnd(px | 0, py | 0, 52) - 0.5) * step;
      const jy = (rnd(px | 0, py | 0, 53) - 0.5) * step;
      const cx = px + jx, cy = py + jy;
      const n = 3 + Math.floor(rnd(key, 1, 54) * 3);
      clumps++;
      for (let t = 0; t < n; t++) {
        const a = rnd(key, t, 55) * Math.PI * 2;
        const rr = rnd(key, t, 56) * step * 0.42;
        const r = (0.9 + 1.3 * rnd(key, t, 57)) * fs * (0.7 + 0.5 * d);
        g.fillStyle = rnd(key, t, 58) > 0.45 ? CANOPY_DARK : CANOPY_LIGHT;
        g.beginPath();
        g.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, r, 0, Math.PI * 2);
        g.fill();
        dots++;
      }
    }
  }
  return { clumps, dots };
}

// --------------------------------------------------------------- the roads --

/** Every site cell the view covers. The same walk `win_map.cellsIn` makes. */
export function cellsOf(view) {
  const c0 = Math.floor(view.x0 / SITE_CELL), c1 = Math.floor((view.x0 + view.w) / SITE_CELL);
  const d0 = Math.floor(view.z0 / SITE_CELL), d1 = Math.floor((view.z0 + view.h) / SITE_CELL);
  const out = [];
  for (let z = d0; z <= d1; z++) for (let x = c0; x <= c1; x++) out.push([x, z]);
  return out;
}

/** The road polylines that reach this view, from roads.js and nowhere else. */
export function roadLines(field, view) {
  const out = [];
  const seen = new Set();
  for (const [cx, cz] of cellsOf(view)) {
    let list;
    try { list = roadsForCell(field, cx, cz); } catch { list = []; }
    for (const road of list) {
      if (!road.pts || road.pts.length < 2 || seen.has(road.id)) continue;
      seen.add(road.id);
      out.push({ id: road.id, pts: road.pts.map((p) => toPx(view, p.x, p.z)) });
    }
  }
  return out;
}

/** Roads: a pale casing under a dashed tan line, the way a chart draws a way. */
function paintRoads(g, view, roads, opts) {
  const fs = view.fs;
  let drawn = 0;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  for (const road of roads) {
    const pts = smoothLine(road.pts, 2);
    g.setLineDash([]);
    g.strokeStyle = ROAD_CASE;
    g.lineWidth = 3.4 * fs;
    pathLine(g, pts); g.stroke();
    g.setLineDash([4.2 * fs, 3.4 * fs]);
    g.strokeStyle = ROAD_INK;
    g.lineWidth = 1.5 * fs;
    pathLine(g, pts); g.stroke();
    drawn++;
  }
  g.setLineDash([]);
  g.lineCap = 'butt';
  return drawn;
}

// ------------------------------------------------------------- the country --

/**
 * Where a realm's name goes: the middle of the ground it actually holds in this
 * view, weighted by how deep in the realm each sample is. A realm cut off by
 * the frame gets its name in the part of it you can see, which is the only
 * place a name is any use.
 */
export function realmLabels(view, grid, opts = {}) {
  const knownZone = asKnown(opts.known?.zones);
  const { gw, gh } = grid;
  const sx = new Float64Array(REALM_ZONES.length);
  const sy = new Float64Array(REALM_ZONES.length);
  const sw = new Float64Array(REALM_ZONES.length);
  for (let j = 0; j < gh; j++) {
    for (let i = 0; i < gw; i++) {
      const o = j * gw + i;
      const r = grid.realmIdx[o];
      if (r < 0) continue;
      const w = grid.realmW[o] ** 2;
      if (w <= 0) continue;
      const [px, py] = grid.at(i, j);
      sx[r] += px * w; sy[r] += py * w; sw[r] += w;
    }
  }
  const out = [];
  for (let r = 0; r < REALM_ZONES.length; r++) {
    if (sw[r] <= 0) continue;
    const zn = REALM_ZONES[r];
    if (!knownZone(zn.id)) continue;
    const px = sx[r] / sw[r], py = sy[r] / sw[r];
    if (px < 0 || py < 0 || px > view.px || py > view.py) continue;
    out.push({ id: zn.id, name: zn.name, px, py, weight: sw[r] });
  }
  return out;
}

/**
 * The regions inside a realm that have no building in them: open country, a
 * road, a stretch of sea. They are places with names and no marks, so they are
 * written straight onto the ground the way a chart writes a moor.
 */
export function regionLabels(view, opts = {}) {
  const knownZone = asKnown(opts.known?.zones);
  const out = [];
  for (const zn of SUB_ZONES) {
    if (zn.kind !== 'wild' && zn.kind !== 'road' && zn.kind !== 'sea') continue;
    if (!knownZone(zn.id)) continue;
    const [px, py] = toPx(view, zn.x, zn.z);
    if (px < 0 || py < 0 || px > view.px || py > view.py) continue;
    out.push({ id: zn.id, name: zn.name, px, py, kind: zn.kind });
  }
  return out;
}



/**
 * The marks a hand makes on ground it has already painted: tufts on a meadow, a
 * dune stroke on sand, dots on a snowfield, shingle on a beach.
 *
 * This is the difference between a map and a chart of biome colours. Nothing
 * here invents country: the mark at a point is decided by the biome the field
 * returns there, and open water, roads and rivers get none.
 */
function paintGroundTexture(g, view, grid, opts) {
  const fs = view.fs;
  const { gw, gh } = grid;
  const step = 13 * fs;
  const iMeadow = BIOMES.indexOf('meadow'), iDesert = BIOMES.indexOf('desert');
  const iSnow = BIOMES.indexOf('snow'), iBeach = BIOMES.indexOf('beach');
  const iSakura = BIOMES.indexOf('sakura');
  let marks = 0;
  // one path per kind of mark, for the same reason the hachures have four
  const tuft = [], dune = [], flake = [], shingle = [];
  g.setLineDash([]);
  g.lineCap = 'round';
  for (let py = step * 0.5; py < view.py; py += step) {
    for (let px = step * 0.5; px < view.px; px += step) {
      const u = (px / view.px) * (gw - 1), v = (py / view.py) * (gh - 1);
      if (bilin(grid.wa, gw, gh, u, v) > 0.28) continue;
      if (bilin(grid.ka, gw, gh, u, v) < 0.6) continue;
      if (bilin(grid.cn, gw, gh, u, v) > 0.45) continue;     // the forest has its own mark
      if (bilin(grid.slope, gw, gh, u, v) > RIDGE_SLOPE) continue;  // so has the hillside
      const b = grid.biome[Math.round(v) * gw + Math.round(u)];
      const r = rnd(px | 0, py | 0, 71);
      const x = px + (rnd(px | 0, py | 0, 72) - 0.5) * step * 0.9;
      const y = py + (rnd(px | 0, py | 0, 73) - 0.5) * step * 0.9;
      const a = 2.2 * fs;
      if (b === iMeadow || b === iSakura) {
        if (r > 0.42) continue;
        tuft.push(x, y, a);
      } else if (b === iDesert) {
        if (r > 0.50) continue;
        dune.push(x, y, a);
      } else if (b === iSnow) {
        if (r > 0.30) continue;
        flake.push(x, y, a);
      } else if (b === iBeach) {
        if (r > 0.34) continue;
        shingle.push(x, y, a);
      } else continue;
      marks++;
    }
  }
  if (tuft.length) {
    g.strokeStyle = 'rgba(84,92,44,.42)'; g.lineWidth = 0.8 * fs;
    g.beginPath();
    for (let i = 0; i < tuft.length; i += 3) {
      const x = tuft[i], y = tuft[i + 1], a = tuft[i + 2];
      g.moveTo(x - a * 0.7, y); g.lineTo(x - a * 0.2, y - a);
      g.moveTo(x + a * 0.7, y); g.lineTo(x + a * 0.2, y - a);
    }
    g.stroke();
  }
  if (dune.length) {
    g.strokeStyle = 'rgba(140,106,52,.40)'; g.lineWidth = 0.9 * fs;
    g.beginPath();
    for (let i = 0; i < dune.length; i += 3) {
      const x = dune[i], y = dune[i + 1], a = dune[i + 2];
      g.moveTo(x - a * 1.5, y);
      g.quadraticCurveTo(x, y - a * 0.9, x + a * 1.5, y);
    }
    g.stroke();
  }
  if (flake.length) {
    g.strokeStyle = 'rgba(126,146,166,.40)'; g.lineWidth = 1.4 * fs;
    g.beginPath();
    for (let i = 0; i < flake.length; i += 3) {
      const x = flake[i], y = flake[i + 1], a = flake[i + 2];
      g.moveTo(x - a * 0.5, y); g.lineTo(x + a * 0.5, y);
      g.moveTo(x + a * 0.9, y + a); g.lineTo(x + a * 1.9, y + a);
    }
    g.stroke();
  }
  if (shingle.length) {
    g.strokeStyle = 'rgba(150,124,74,.36)'; g.lineWidth = 1.5 * fs;
    g.beginPath();
    for (let i = 0; i < shingle.length; i += 3) {
      const x = shingle[i], y = shingle[i + 1];
      g.moveTo(x - 0.6 * fs, y); g.lineTo(x + 0.6 * fs, y);
    }
    g.stroke();
  }
  g.lineCap = 'butt';
  return marks;
}

/**
 * The boxes the furniture will take: the banner, the rose and the scale bar.
 *
 * They are put in the list BEFORE any name is placed, because the frame is
 * painted last and a realm's name written under the banner is a realm with no
 * name on it. The numbers are the ones `paintFrame` uses, which is the only way
 * the two can never drift apart.
 */
export function furnitureBoxes(view, opts = {}) {
  const fs = view.fs;
  const m = view.margin ?? Math.min(view.px, view.py) * 0.028;
  const out = [];
  if (opts.banner !== false) {
    const bw = Math.min(view.px - 2 * m - 26 * fs, labelFor(view.title).length * 24 * fs * 0.72 + 62 * fs);
    const bh = (view.subtitle ? 50 : 38) * fs;
    out.push([view.px / 2 - bw / 2 - 20 * fs, m + 6 * fs, view.px / 2 + bw / 2 + 20 * fs, m + 11 * fs + bh + 4 * fs]);
  }
  if (opts.rose !== false) {
    out.push([m + 16 * fs, view.py - m - 78 * fs, m + 76 * fs, view.py - m - 18 * fs]);
  }
  if (opts.scale !== false) {
    out.push([view.px - m - 16 * fs - 0.24 * view.px, view.py - m - 34 * fs, view.px - m - 10 * fs, view.py - m - 6 * fs]);
  }
  return out;
}

/**
 * The rim of each realm, drawn as a line as well as washed.
 *
 * The wash alone is a smudge: a reader can see that the country darkens without
 * being able to say where one realm stops. `zoneAt` settles overlaps by depth,
 * so the shape a realm actually holds on the ground is an irregular thing with
 * bites out of it where its neighbours reach in, and that shape is what this
 * traces. It is the same contour machinery the coast uses, over a mask of
 * "which realm won here".
 */
function paintRealmRims(g, view, grid, opts) {
  const fs = view.fs;
  const knownZone = asKnown(opts.known?.zones);
  const { gw, gh } = grid;
  const mask = new Float32Array(gw * gh);
  let drawn = 0;
  g.lineCap = 'round';
  for (let r = 0; r < REALM_ZONES.length; r++) {
    const zn = REALM_ZONES[r];
    if (!knownZone(zn.id)) continue;
    let any = false;
    for (let o = 0; o < mask.length; o++) {
      const m = grid.realmIdx[o] === r && grid.realmW[o] > 0.02 ? 1 : 0;
      mask[o] = m;
      if (m) any = true;
    }
    if (!any) continue;
    blur(mask, gw, gh, 1, 1);
    for (const raw of contour(mask, gw, gh, 0.5, grid.at)) {
      const pts = smoothLine(raw, 2);
      if (pts.length < 4) continue;
      g.setLineDash([]);
      g.strokeStyle = 'rgba(226,208,168,.26)';
      g.lineWidth = 2.6 * fs;
      pathLine(g, pts); g.stroke();
      g.setLineDash([1.1 * fs, 4.6 * fs]);
      g.strokeStyle = 'rgba(86,60,30,.50)';
      g.lineWidth = 1.3 * fs;
      pathLine(g, pts); g.stroke();
      drawn++;
    }
  }
  g.setLineDash([]);
  g.lineCap = 'butt';
  return drawn;
}

/**
 * Where a word will sit, and whether anything is already sitting there.
 *
 * Every name on this map goes through here, in one order: the realms first
 * because they are the biggest thing being said, then the places, then the open
 * country. A name with nowhere to go is not drawn. Two names on top of each
 * other are two names nobody can read, and the map already shipped once with
 * COLDSEAT written through the middle of FROSTREACH.
 */
function placeLabel(g, text, x, y, size, taken, view, spots) {
  const w = (g.measureText(text)?.width || text.length * size * 0.56) + size * 0.4;
  const h = size * 1.3;
  const pad = view.pad ?? 2;
  // A name that would run under the border is PULLED INSIDE it, not dropped.
  // Dropping it is what left the Saltmarch and the Ashen Throne, both of whose
  // middles sit near the rim of the world, with no name at all on the world
  // map, and the test that counts nine names is why anybody knows.
  const loX = pad + w / 2, hiX = view.px - pad - w / 2;
  const loY = pad + h / 2, hiY = view.py - pad - h / 2;
  if (loX > hiX || loY > hiY) return null;                 // wider than the sheet
  for (const [sx, sy] of spots || [[x, y]]) {
    const lx = sx < loX ? loX : sx > hiX ? hiX : sx;
    const ly = sy < loY ? loY : sy > hiY ? hiY : sy;
    const box = [lx - w / 2, ly - h / 2, lx + w / 2, ly + h / 2];
    let clash = false;
    for (const t of taken) {
      if (box[0] < t[2] && box[2] > t[0] && box[1] < t[3] && box[3] > t[1]) { clash = true; break; }
    }
    if (clash) continue;
    taken.push(box);
    return [lx, ly];
  }
  return null;
}

/** The names of the nine realms, large and letter spaced across their ground. */
function paintRealmNames(g, view, grid, opts, taken) {
  const fs = view.fs;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const size = 21 * fs;
  const realms = realmLabels(view, grid, opts).sort((a, b) => b.weight - a.weight);
  let drawn = 0;
  g.font = face(size, '600');
  tracking(g, 6 * fs);
  for (const r of realms) {
    const text = labelFor(r.name);
    const put = placeLabel(g, text, r.px, r.py, size, taken, view,
      [[r.px, r.py], [r.px, r.py - size * 1.6], [r.px, r.py + size * 1.6]]);
    if (!put) continue;
    haloText(g, text, put[0], put[1], 'rgba(92,64,30,.86)', 'rgba(240,229,204,.72)', 5 * fs);
    drawn++;
  }
  tracking(g, 0);
  return { realms: drawn, offered: realms.length };
}

/** The open country inside a realm: a moor, a road, a stretch of sea. */
function paintRegionNames(g, view, opts, taken) {
  const fs = view.fs;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const size = 8.2 * fs;
  g.font = face(size);
  tracking(g, 1.6 * fs);
  let drawn = 0;
  for (const r of regionLabels(view, opts)) {
    const text = labelFor(r.name);
    const put = placeLabel(g, text, r.px, r.py, size, taken, view,
      [[r.px, r.py], [r.px, r.py + size * 1.5], [r.px, r.py - size * 1.5]]);
    if (!put) continue;
    haloText(g, text, put[0], put[1], 'rgba(80,60,34,.82)', 'rgba(236,224,198,.66)', 2.4 * fs);
    drawn++;
  }
  tracking(g, 0);
  return drawn;
}

// --------------------------------------------------------------- the marks --

/** A little house: a body and a roof. Every settlement glyph is made of these. */
function house(g, x, y, s, ink, fill) {
  g.beginPath();
  g.moveTo(x - s * 0.5, y);
  g.lineTo(x - s * 0.5, y - s * 0.55);
  g.lineTo(x + s * 0.5, y - s * 0.55);
  g.lineTo(x + s * 0.5, y);
  g.closePath();
  g.fillStyle = fill; g.fill();
  g.strokeStyle = ink; g.lineWidth = Math.max(0.55, s * 0.12); g.stroke();
  g.beginPath();
  g.moveTo(x - s * 0.68, y - s * 0.52);
  g.lineTo(x, y - s * 1.10);
  g.lineTo(x + s * 0.68, y - s * 0.52);
  g.closePath();
  g.fillStyle = ink; g.fill();
}

/** A tower: a shaft, a crenellated head. */
function towerBody(g, x, y, s, ink, fill, tall = 1.9) {
  g.beginPath();
  g.moveTo(x - s * 0.34, y);
  g.lineTo(x - s * 0.34, y - s * tall);
  g.lineTo(x + s * 0.34, y - s * tall);
  g.lineTo(x + s * 0.34, y);
  g.closePath();
  g.fillStyle = fill; g.fill();
  g.strokeStyle = ink; g.lineWidth = Math.max(0.55, s * 0.12); g.stroke();
  g.fillStyle = ink;
  for (let i = -1; i <= 1; i++) {
    g.beginPath();
    g.rect(x + i * s * 0.30 - s * 0.11, y - s * (tall + 0.28), s * 0.22, s * 0.30);
    g.fill();
  }
}

/** A hole in the ground: a black arch with a shadow under it. */
function mouth(g, x, y, s, ink, fill, framed) {
  if (framed) {
    g.beginPath();
    g.moveTo(x - s * 0.95, y);
    g.lineTo(x - s * 0.95, y - s * 0.35);
    g.quadraticCurveTo(x, y - s * 1.45, x + s * 0.95, y - s * 0.35);
    g.lineTo(x + s * 0.95, y);
    g.closePath();
    g.fillStyle = fill; g.fill();
    g.strokeStyle = ink; g.lineWidth = Math.max(0.6, s * 0.14); g.stroke();
  }
  g.beginPath();
  g.moveTo(x - s * 0.56, y);
  g.lineTo(x - s * 0.56, y - s * 0.30);
  g.quadraticCurveTo(x, y - s * 1.02, x + s * 0.56, y - s * 0.30);
  g.lineTo(x + s * 0.56, y);
  g.closePath();
  g.fillStyle = '#140f0b'; g.fill();
}

/** A tent: two poles and a flap. */
function tent(g, x, y, s, ink, fill) {
  g.beginPath();
  g.moveTo(x - s * 0.78, y);
  g.lineTo(x, y - s * 1.10);
  g.lineTo(x + s * 0.78, y);
  g.closePath();
  g.fillStyle = fill; g.fill();
  g.strokeStyle = ink; g.lineWidth = Math.max(0.55, s * 0.13); g.stroke();
  g.beginPath();
  g.moveTo(x, y - s * 1.10); g.lineTo(x, y);
  g.stroke();
}

/** A column, standing or broken off. */
function column(g, x, y, s, ink, fill, tall) {
  g.beginPath();
  g.rect(x - s * 0.16, y - s * tall, s * 0.32, s * tall);
  g.fillStyle = fill; g.fill();
  g.strokeStyle = ink; g.lineWidth = Math.max(0.5, s * 0.11); g.stroke();
}

/**
 * One glyph per kind of place the world can build. Each draws on the ground at
 * (x, y) with `s` as its unit, and none of them writes the name: that is the
 * caller's, so a label can be moved out of another label's way.
 */
export const GLYPH = {
  town(g, x, y, s, ink, fill) {
    // a wall, then three roofs inside it
    g.beginPath();
    g.arc(x, y - s * 0.34, s * 1.55, Math.PI * 0.08, Math.PI * 0.92, true);
    g.strokeStyle = ink; g.lineWidth = Math.max(0.6, s * 0.16); g.stroke();
    house(g, x - s * 0.82, y, s * 0.72, ink, fill);
    house(g, x + s * 0.72, y - s * 0.06, s * 0.66, ink, fill);
    house(g, x - s * 0.02, y - s * 0.42, s * 0.88, ink, fill);
  },
  hamlet(g, x, y, s, ink, fill) {
    house(g, x - s * 0.36, y, s * 0.80, ink, fill);
    house(g, x + s * 0.48, y - s * 0.10, s * 0.60, ink, fill);
  },
  castle(g, x, y, s, ink, fill) {
    towerBody(g, x - s * 0.85, y, s * 0.62, ink, fill, 2.2);
    towerBody(g, x + s * 0.85, y, s * 0.62, ink, fill, 2.2);
    g.beginPath();
    g.rect(x - s * 0.85, y - s * 0.95, s * 1.70, s * 0.95);
    g.fillStyle = fill; g.fill();
    g.strokeStyle = ink; g.lineWidth = Math.max(0.55, s * 0.12); g.stroke();
  },
  temple(g, x, y, s, ink, fill) {
    column(g, x - s * 0.70, y, s, ink, fill, 1.15);
    column(g, x, y, s, ink, fill, 1.15);
    column(g, x + s * 0.70, y, s, ink, fill, 1.15);
    g.beginPath();
    g.moveTo(x - s * 1.05, y - s * 1.15);
    g.lineTo(x, y - s * 1.80);
    g.lineTo(x + s * 1.05, y - s * 1.15);
    g.closePath();
    g.fillStyle = ink; g.fill();
  },
  megastructure(g, x, y, s, ink, fill) {
    // two piers and a lintel, and a star over it: the thing seen from a mile
    g.beginPath();
    g.rect(x - s * 1.00, y - s * 1.55, s * 0.42, s * 1.55);
    g.rect(x + s * 0.58, y - s * 1.55, s * 0.42, s * 1.55);
    g.fillStyle = fill; g.fill();
    g.strokeStyle = ink; g.lineWidth = Math.max(0.6, s * 0.13); g.stroke();
    g.beginPath();
    g.moveTo(x - s * 1.25, y - s * 1.55);
    g.lineTo(x + s * 1.25, y - s * 1.55);
    g.lineTo(x + s * 1.05, y - s * 1.92);
    g.lineTo(x - s * 1.05, y - s * 1.92);
    g.closePath();
    g.fillStyle = ink; g.fill();
    const r = s * 0.42, cy = y - s * 2.45;
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      const rr = i % 2 ? r * 0.38 : r;
      const fx = x + Math.cos(a) * rr, fy = cy + Math.sin(a) * rr;
      if (i === 0) g.moveTo(fx, fy); else g.lineTo(fx, fy);
    }
    g.closePath();
    g.fillStyle = ink; g.fill();
  },
  landmark(g, x, y, s, ink, fill) {
    g.beginPath();
    g.arc(x, y - s * 0.42, s * 0.30, 0, Math.PI * 2);
    g.fillStyle = ink; g.fill();
    g.beginPath();
    g.arc(x, y - s * 0.42, s * 0.78, 0, Math.PI * 2);
    g.strokeStyle = ink; g.lineWidth = Math.max(0.5, s * 0.13); g.stroke();
  },
  dungeon(g, x, y, s, ink, fill) { mouth(g, x, y, s, ink, fill, true); },
  cave(g, x, y, s, ink, fill) { mouth(g, x, y, s, ink, fill, false); },
  mine(g, x, y, s, ink, fill) {
    mouth(g, x, y, s * 0.9, ink, fill, true);
    // a pick laid across the mouth
    g.strokeStyle = ink; g.lineWidth = Math.max(0.6, s * 0.16); g.lineCap = 'round';
    g.beginPath();
    g.moveTo(x - s * 0.30, y - s * 1.55); g.lineTo(x + s * 0.34, y - s * 0.62);
    g.stroke();
    g.beginPath();
    g.moveTo(x - s * 0.92, y - s * 1.02);
    g.quadraticCurveTo(x - s * 0.12, y - s * 1.66, x + s * 0.66, y - s * 1.24);
    g.stroke();
    g.lineCap = 'butt';
  },
  ruin(g, x, y, s, ink, fill) {
    column(g, x - s * 0.60, y, s, ink, fill, 1.15);
    column(g, x + s * 0.10, y, s, ink, fill, 0.60);
    g.beginPath();
    g.moveTo(x - s * 1.05, y); g.lineTo(x + s * 0.95, y);
    g.strokeStyle = ink; g.lineWidth = Math.max(0.6, s * 0.16); g.stroke();
    g.beginPath();
    g.moveTo(x + s * 0.55, y - s * 0.42); g.lineTo(x + s * 0.90, y - s * 0.20);
    g.stroke();
  },
  shrine(g, x, y, s, ink, fill) {
    g.strokeStyle = ink; g.lineWidth = Math.max(0.6, s * 0.20);
    g.beginPath();
    g.moveTo(x, y - s * 0.16); g.lineTo(x, y - s * 1.30);
    g.moveTo(x - s * 0.46, y - s * 0.96); g.lineTo(x + s * 0.46, y - s * 0.96);
    g.stroke();
    g.beginPath();
    g.rect(x - s * 0.40, y - s * 0.18, s * 0.80, s * 0.18);
    g.fillStyle = ink; g.fill();
  },
  camp(g, x, y, s, ink, fill) {
    tent(g, x - s * 0.30, y, s * 0.95, ink, fill);
    g.beginPath();
    g.arc(x + s * 0.80, y - s * 0.18, s * 0.24, 0, Math.PI * 2);
    g.fillStyle = fill; g.fill();
  },
  bandit_camp(g, x, y, s, ink, fill) {
    tent(g, x - s * 0.55, y, s * 0.90, ink, fill);
    tent(g, x + s * 0.55, y - s * 0.05, s * 0.72, ink, fill);
    g.beginPath();
    g.moveTo(x, y - s * 0.10);
    g.lineTo(x + s * 0.16, y - s * 0.54);
    g.lineTo(x - s * 0.12, y - s * 0.44);
    g.closePath();
    g.fillStyle = fill; g.fill();
  },
  watchtower(g, x, y, s, ink, fill) { towerBody(g, x, y, s * 0.9, ink, fill, 2.1); },
  tower(g, x, y, s, ink, fill) {
    towerBody(g, x, y, s * 0.95, ink, fill, 2.4);
    g.beginPath();
    g.rect(x - s * 0.13, y - s * 1.90, s * 0.26, s * 0.30);
    g.fillStyle = '#f4e6b6'; g.fill();
  },
  gate(g, x, y, s, ink, fill) {
    g.beginPath();
    g.rect(x - s * 0.78, y - s * 1.20, s * 0.30, s * 1.20);
    g.rect(x + s * 0.48, y - s * 1.20, s * 0.30, s * 1.20);
    g.fillStyle = fill; g.fill();
    g.strokeStyle = ink; g.lineWidth = Math.max(0.55, s * 0.13); g.stroke();
    g.beginPath();
    g.rect(x - s * 0.95, y - s * 1.50, s * 1.90, s * 0.30);
    g.fillStyle = ink; g.fill();
  },
  fountain(g, x, y, s, ink, fill) {
    g.beginPath();
    g.ellipse ? g.ellipse(x, y - s * 0.20, s * 0.78, s * 0.32, 0, 0, Math.PI * 2)
      : g.arc(x, y - s * 0.20, s * 0.60, 0, Math.PI * 2);
    g.fillStyle = fill; g.fill();
    g.strokeStyle = ink; g.lineWidth = Math.max(0.5, s * 0.12); g.stroke();
    g.beginPath();
    g.moveTo(x, y - s * 0.30); g.lineTo(x, y - s * 1.10);
    g.stroke();
  },
  graveyard(g, x, y, s, ink, fill) {
    for (const [ox, hh] of [[-0.70, 0.95], [0, 1.20], [0.70, 0.85]]) {
      g.strokeStyle = ink; g.lineWidth = Math.max(0.55, s * 0.16);
      g.beginPath();
      g.moveTo(x + s * ox, y); g.lineTo(x + s * ox, y - s * hh);
      g.moveTo(x + s * ox - s * 0.28, y - s * (hh - 0.30));
      g.lineTo(x + s * ox + s * 0.28, y - s * (hh - 0.30));
      g.stroke();
    }
  },
  tomb(g, x, y, s, ink, fill) {
    g.beginPath();
    g.moveTo(x - s * 1.00, y);
    g.quadraticCurveTo(x, y - s * 1.40, x + s * 1.00, y);
    g.closePath();
    g.fillStyle = fill; g.fill();
    g.strokeStyle = ink; g.lineWidth = Math.max(0.55, s * 0.13); g.stroke();
    g.beginPath();
    g.rect(x - s * 0.24, y - s * 0.62, s * 0.48, s * 0.62);
    g.fillStyle = '#140f0b'; g.fill();
  },
  arena(g, x, y, s, ink, fill) {
    for (const r of [1.15, 0.78]) {
      g.beginPath();
      if (g.ellipse) g.ellipse(x, y - s * 0.30, s * r, s * r * 0.52, 0, 0, Math.PI * 2);
      else g.arc(x, y - s * 0.30, s * r, 0, Math.PI * 2);
      g.strokeStyle = ink; g.lineWidth = Math.max(0.5, s * 0.13); g.stroke();
    }
    g.beginPath();
    if (g.ellipse) g.ellipse(x, y - s * 0.30, s * 0.50, s * 0.26, 0, 0, Math.PI * 2);
    else g.arc(x, y - s * 0.30, s * 0.50, 0, Math.PI * 2);
    g.fillStyle = fill; g.fill();
  },
  burned_farm(g, x, y, s, ink, fill) {
    house(g, x - s * 0.20, y, s * 0.90, ink, fill);
    g.strokeStyle = 'rgba(60,48,40,.75)';
    g.lineWidth = Math.max(0.5, s * 0.13);
    g.beginPath();
    g.moveTo(x + s * 0.10, y - s * 1.05);
    g.quadraticCurveTo(x + s * 0.75, y - s * 1.45, x + s * 0.40, y - s * 1.95);
    g.stroke();
  },
};

// ------------------------------------------------------------ the spaces --
//
// What the user has authored with the editor, on the map they authored it from.
//
// A SPACE is one of two things (`src/mmo/spaces/index.js`). A NAMED space
// stands where it says it stands and reaches `radius` metres. An AUTOMATIC one
// is a TILE: the editor cuts the world into 256 m squares and the first thing
// put down in a square makes `tile_3_-2`, centred on that square. So a tile is
// drawn as the square it is and a named space as the circle it is, because
// drawing a tile as a circle would say the ground it owns is round and it is
// not: the next tile begins at its edge.
//
// The centre and the reach come off the space's own record, never off the
// constant below, so a space written by a different editor still lands where it
// says it lands. `auditSpaceTiles` is the guard: it measures every tile on disk
// against the constant and names the ones that disagree, and the test fails on
// it rather than the game throwing at import while somebody is mid stroke.

/** How wide an automatic tile is, in metres. `editor.js` TILE_M is the source. */
export const SPACE_TILE_M = 256;
/** How far a tile space reaches: the half diagonal. `editor.js` TILE_R. */
export const SPACE_TILE_R = Math.ceil((SPACE_TILE_M / 2) * Math.SQRT2);
const TILE_ID = /^tile_(-?\d+)_(-?\d+)$/;

/** What a space looks like on a map: a square for a tile, a circle otherwise. */
export function spaceShape(space) {
  if (!space || !space.at) return null;
  const m = TILE_ID.exec(String(space.id || ''));
  const r = Number.isFinite(space.radius) ? space.radius : SPACE_TILE_R;
  return {
    id: space.id,
    landmark: space.landmark === true,
    name: space.name || space.id,
    tile: !!m,
    tx: m ? +m[1] : null,
    tz: m ? +m[2] : null,
    x: space.at.x, z: space.at.z,
    r,
    // a tile's side comes back out of its own reach, so a tile written by an
    // editor with a different TILE_M is still drawn the size it really is
    w: m ? Math.round(r * Math.SQRT2) : 2 * r,
  };
}

/**
 * Every space whose footprint touches this rectangle of world, nearest last so
 * the smallest name is written over the largest.
 *
 * @param rect { x, z, w, h } world metres, the centre and the extent
 */
export function spacesIn(rect, spaces = SPACES) {
  const { x = 0, z = 0, w = 0, h = w } = rect || {};
  const x0 = x - w / 2, x1 = x + w / 2, z0 = z - h / 2, z1 = z + h / 2;
  const out = [];
  for (const id of Object.keys(spaces)) {
    const sh = spaceShape(spaces[id]);
    if (!sh) continue;
    const half = sh.tile ? sh.w / 2 : sh.r;
    if (sh.x + half < x0 || sh.x - half > x1 || sh.z + half < z0 || sh.z - half > z1) continue;
    out.push(sh);
  }
  out.sort((a, b) => b.r - a.r);
  return out;
}

/**
 * Every tile space on disk whose own record disagrees with the constant above,
 * as a list of sentences. Empty is green. The test calls this and fails the
 * build on it; nothing throws at import, because a user mid sculpt should not
 * lose the game over a space file that is one metre out.
 */
export function auditSpaceTiles(spaces = SPACES) {
  const bad = [];
  let tiles = 0;
  for (const id of Object.keys(spaces)) {
    const sp = spaces[id];
    const m = TILE_ID.exec(String(sp?.id || ''));
    if (!m) continue;
    tiles++;
    const wantX = +m[1] * SPACE_TILE_M + SPACE_TILE_M / 2;
    const wantZ = +m[2] * SPACE_TILE_M + SPACE_TILE_M / 2;
    if (sp.at.x !== wantX || sp.at.z !== wantZ) {
      bad.push(`${id} stands at ${sp.at.x},${sp.at.z} and its own name says ${wantX},${wantZ}: editor.js TILE_M has moved off SPACE_TILE_M ${SPACE_TILE_M}`);
    }
    if (sp.radius !== SPACE_TILE_R) {
      bad.push(`${id} reaches ${sp.radius} m and a ${SPACE_TILE_M} m tile reaches ${SPACE_TILE_R} m`);
    }
  }
  return { tiles, named: Object.keys(spaces).length - tiles, bad };
}

/** Every place on this map, in the order it is drawn. */
export function placesIn(field, view, opts = {}) {
  const knownPlace = asKnown(opts.known?.places);
  const seen = new Map();
  const margin = Math.max(view.w, view.h) * 0.02;
  for (const s of authoredSites()) {
    if (s.x < view.x0 - margin || s.x > view.x0 + view.w + margin) continue;
    if (s.z < view.z0 - margin || s.z > view.z0 + view.h + margin) continue;
    seen.set(s.id, s);
  }
  if (opts.rolled !== false && typeof field.siteInCell === 'function') {
    for (const [cx, cz] of cellsOf(view)) {
      const s = field.siteInCell(cx, cz);
      if (s && !seen.has(s.id)) seen.set(s.id, s);
    }
  }
  const out = [];
  for (const s of seen.values()) {
    if (!knownPlace(s.id)) continue;
    if (!GLYPH[s.kind]) continue;
    const [px, py] = toPx(view, s.x, s.z);
    out.push({ id: s.id, kind: s.kind, name: s.name, x: s.x, z: s.z, px, py });
  }
  out.sort((a, b) => (KIND_RANK[a.kind] - KIND_RANK[b.kind]) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return out;
}

/**
 * The places, drawn and named.
 *
 * The label goes under the glyph if it fits, then over it, then beside it. A
 * label that fits nowhere is dropped and the glyph stays, because a mark with
 * no name is a thing you have not read yet and two names on top of each other
 * are two things you can never read.
 */
export function paintMarks(g, opts = {}) {
  const t0 = now();
  const view = opts.view || viewFor(opts);
  const fs = view.fs;
  const places = opts.places || placesIn(opts.field, view, opts);
  const unit = 5.2 * fs;
  const taken = opts.labelBoxes || [];
  let labelled = 0;

  g.save();
  g.setLineDash([]);
  g.textBaseline = 'middle';
  g.textAlign = 'center';
  for (const p of places) {
    const [ink, fill] = SITE_PAINT[p.kind];
    const s = unit * (SITE_SIZE[p.kind] || 1);
    GLYPH[p.kind](g, p.px, p.py, s, ink, fill);
  }
  for (const p of places) {
    const s = unit * (SITE_SIZE[p.kind] || 1);
    const big = p.kind === 'town' || p.kind === 'megastructure';
    const size = (big ? 10.5 : 8.6) * fs;
    g.font = face(size, big ? '600' : '');
    const text = labelFor(p.name);
    tracking(g, 0.8 * fs);
    const w = (g.measureText(text)?.width || text.length * size * 0.56) + 3 * fs;
    const put = placeLabel(g, text, p.px, p.py, size, taken, view, [
      [p.px, p.py + s * 0.9 + size * 0.9],
      [p.px, p.py - s * 2.1 - size * 0.7],
      [p.px + s * 1.4 + w / 2, p.py - s * 0.4],
      [p.px - s * 1.4 - w / 2, p.py - s * 0.4],
    ]);
    if (put) {
      haloText(g, text, put[0], put[1], '#3a2a14', 'rgba(240,230,206,.86)', 2.8 * fs);
      labelled++;
    }
    tracking(g, 0);
  }
  const regions = opts.regions === false || opts.names === false ? 0 : paintRegionNames(g, view, opts, taken);
  g.restore();
  return { ms: now() - t0, places: places.length, labelled, regions };
}

// --------------------------------------------------------------- the frame --

/** A rounded scroll corner, drawn four times, once into each corner. */
function flourish(g, x, y, s, sx, sy) {
  g.beginPath();
  g.moveTo(x + sx * s * 2.6, y);
  g.quadraticCurveTo(x + sx * s * 0.9, y, x + sx * s * 0.55, y + sy * s * 0.55);
  g.quadraticCurveTo(x, y + sy * s * 0.9, x, y + sy * s * 2.6);
  g.stroke();
  g.beginPath();
  g.arc(x + sx * s * 0.72, y + sy * s * 0.72, s * 0.26, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.moveTo(x + sx * s * 1.55, y + sy * s * 0.10);
  g.quadraticCurveTo(x + sx * s * 1.05, y + sy * s * 1.05, x + sx * s * 0.10, y + sy * s * 1.55);
  g.stroke();
}

/** The compass rose, eight points and a north. Gold on the sea, as charts are. */
function rose(g, x, y, r, fs) {
  g.setLineDash([]);
  for (const [len, wide, col] of [[1, 0.16, INK], [0.62, 0.26, GILT]]) {
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 - Math.PI / 2;
      const ax = Math.cos(a), ay = Math.sin(a);
      const bx = -ay, by = ax;
      g.beginPath();
      g.moveTo(x + ax * r * len, y + ay * r * len);
      g.lineTo(x + bx * r * wide, y + by * r * wide);
      g.lineTo(x - ax * r * wide * 0.6, y - ay * r * wide * 0.6);
      g.lineTo(x - bx * r * wide, y - by * r * wide);
      g.closePath();
      g.fillStyle = i === 0 && len === 1 ? '#7a2a20' : col;
      g.fill();
      g.strokeStyle = INK; g.lineWidth = 0.7 * fs; g.stroke();
    }
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 - Math.PI / 4;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62);
    g.strokeStyle = INK_SOFT; g.lineWidth = 0.9 * fs; g.stroke();
  }
  g.beginPath();
  g.arc(x, y, r * 1.22, 0, Math.PI * 2);
  g.strokeStyle = INK_SOFT; g.lineWidth = 1.1 * fs; g.stroke();
  g.font = face(9 * fs, '700');
  g.textAlign = 'center'; g.textBaseline = 'middle';
  haloText(g, 'N', x, y - r * 1.52, INK, 'rgba(238,226,200,.9)', 2.6 * fs);
}

/** The scale bar, in the paces the world is actually measured in. */
function scaleBar(g, view, x, y) {
  const fs = view.fs;
  // a round number of metres that is between a fifth and a third of the frame
  const want = view.w * 0.24;
  const pow = 10 ** Math.floor(Math.log10(want));
  const metres = [1, 2, 5, 10].map((m) => m * pow).find((m) => m >= want * 0.62) || pow;
  const wide = (metres / view.w) * view.px;
  const tall = 4.5 * fs;
  g.setLineDash([]);
  for (let i = 0; i < 4; i++) {
    g.beginPath();
    g.rect(x + (wide / 4) * i, y, wide / 4, tall);
    g.fillStyle = i % 2 ? 'rgba(238,226,200,.92)' : INK;
    g.fill();
    g.strokeStyle = INK; g.lineWidth = 0.8 * fs; g.stroke();
  }
  g.font = face(8.5 * fs, '600');
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const word = metres >= 1000 ? `${(metres / 1000).toFixed(metres % 1000 ? 1 : 0)} KM` : `${metres} M`;
  haloText(g, word, x + wide / 2, y - tall * 1.5, INK, 'rgba(238,226,200,.9)', 2.6 * fs);
}

/**
 * The border, the banner and the two instruments.
 *
 * Drawn last, over everything, because a frame that a mountain can stand in
 * front of is not a frame.
 */
export function paintFrame(g, opts = {}) {
  const view = opts.view || viewFor(opts);
  const fs = view.fs;
  const m = Math.min(view.px, view.py) * 0.028;
  g.save();
  g.setLineDash([]);
  g.textBaseline = 'middle';
  g.textAlign = 'center';

  // the two rules
  g.strokeStyle = INK;
  g.lineWidth = 2.6 * fs;
  g.beginPath(); g.rect(m, m, view.px - 2 * m, view.py - 2 * m); g.stroke();
  g.strokeStyle = GILT;
  g.lineWidth = 1.1 * fs;
  g.beginPath(); g.rect(m + 4.5 * fs, m + 4.5 * fs, view.px - 2 * m - 9 * fs, view.py - 2 * m - 9 * fs); g.stroke();
  g.strokeStyle = INK_FAINT;
  g.lineWidth = 0.9 * fs;
  g.beginPath(); g.rect(m + 9 * fs, m + 9 * fs, view.px - 2 * m - 18 * fs, view.py - 2 * m - 18 * fs); g.stroke();

  // the corners
  const s = 13 * fs;
  g.strokeStyle = GILT; g.fillStyle = GILT; g.lineWidth = 1.6 * fs;
  flourish(g, m + 4.5 * fs, m + 4.5 * fs, s, 1, 1);
  flourish(g, view.px - m - 4.5 * fs, m + 4.5 * fs, s, -1, 1);
  flourish(g, m + 4.5 * fs, view.py - m - 4.5 * fs, s, 1, -1);
  flourish(g, view.px - m - 4.5 * fs, view.py - m - 4.5 * fs, s, -1, -1);

  // the banner
  if (opts.banner !== false) {
    const title = labelFor(view.title);
    g.font = face(24 * fs, '700');
    tracking(g, 7 * fs);
    const tw = (g.measureText(title)?.width || title.length * 24 * fs * 0.62);
    tracking(g, 0);
    const bw = Math.min(view.px - 2 * m - 26 * fs, tw + 62 * fs);
    const bh = (view.subtitle ? 50 : 38) * fs;
    const bx = view.px / 2 - bw / 2, by = m + 11 * fs;
    const tail = 16 * fs;
    g.beginPath();
    g.moveTo(bx - tail, by + bh * 0.5);
    g.lineTo(bx, by);
    g.lineTo(bx + bw, by);
    g.lineTo(bx + bw + tail, by + bh * 0.5);
    g.lineTo(bx + bw, by + bh);
    g.lineTo(bx, by + bh);
    g.closePath();
    g.fillStyle = 'rgba(238,224,192,.94)';
    g.fill();
    g.strokeStyle = INK; g.lineWidth = 1.8 * fs; g.stroke();
    g.beginPath();
    g.rect(bx + 4 * fs, by + 4 * fs, bw - 8 * fs, bh - 8 * fs);
    g.strokeStyle = GILT; g.lineWidth = 0.9 * fs; g.stroke();
    g.font = face(24 * fs, '700');
    tracking(g, 7 * fs);
    g.fillStyle = '#3a2a14';
    g.fillText(title, view.px / 2 + 3.5 * fs, by + (view.subtitle ? bh * 0.40 : bh * 0.52));
    tracking(g, 0);
    if (view.subtitle) {
      g.font = face(10 * fs, '600');
      tracking(g, 3.4 * fs);
      g.fillStyle = 'rgba(96,70,36,.9)';
      g.fillText(labelFor(view.subtitle), view.px / 2 + 1.7 * fs, by + bh * 0.75);
      tracking(g, 0);
    }
  }

  if (opts.rose !== false) rose(g, m + 46 * fs, view.py - m - 48 * fs, 20 * fs, fs);
  if (opts.scale !== false) scaleBar(g, view, view.px - m - 16 * fs - (0.24 * view.px), view.py - m - 20 * fs);

  g.restore();
  return { frame: true };
}

// --------------------------------------------------------------- the guide --
//
// The Greenwold's hand painted map, laid under the chart, and the twelve spaces
// of `src/mmo/greenwold_guide.js` outlined over it.
//
// This is a GUIDE and not a layer of the world. Nothing here reads the field
// and nothing here changes it: it is the picture the user painted, drawn where
// the picture says it is, with the boundaries they need in order to know where
// an object goes. See docs/mmo/wiring/MAP3-GUIDE.md.
//
// All three take an `at(x, z) -> [px, py]` rather than a view, because the zone
// map and the minimap hold their views in two different shapes and there must
// be exactly ONE piece of code that decides what a guide zone looks like. Give
// them the mapping and they draw the same outline on both.

/** The gold a guide outline is dashed in, and the gold under the cursor. */
export const GUIDE_INK = 'rgba(201,164,74,.72)';
export const GUIDE_INK_HOT = theme.goldBright;
/** The name at a space's middle, in small capitals. */
export const GUIDE_NAME_INK = theme.goldBright;
/** The traced lane and the traced river, faint, because they are not the road. */
export const GUIDE_ROAD_INK = 'rgba(120,94,52,.55)';
export const GUIDE_RIVER_INK = 'rgba(96,142,178,.55)';
/** A space is dashed; the ring is dotted, so the two never read as one thing. */
export const GUIDE_DASH = [5, 4];
export const GUIDE_RING_DASH = [3, 5];
/** Under this many pixels of radius an outline is a smudge, so it is not drawn. */
export const GUIDE_MIN_PX = 3;
/** And under this many, its name would not fit inside it. */
export const GUIDE_NAME_PX = 9;
/** How much of the live terrain shows through on the zone map's "both". */
export const GUIDE_TERRAIN_ALPHA = 0.35;
/** And how much of the ground shows over the painting on the minimap. */
export const GUIDE_MINIMAP_ALPHA = 0.5;

/**
 * The painting, drawn through the guide's own frame so the picture and the
 * world agree: the sheet's top left corner lands on the world point
 * `imageToWorld(0, 0)` and its bottom right on `imageToWorld(1, 1)`.
 *
 * The sheet is 16:9 and the realm is square, so this STRETCHES the picture.
 * That is the mapping the user gave and it is what makes the player arrow
 * stand on the painted village when the player is at the village.
 *
 * @param opts { art, at, w, h }  the loaded picture, the mapping, the canvas
 */
export function paintGuideArt(g, opts = {}) {
  const art = opts.art || guideArt();
  const at = opts.at;
  if (typeof at !== 'function') return { drawn: 0, why: 'no mapping was handed over' };
  if (!art || art.state !== 'ready' || !art.img) return { drawn: 0, why: art ? art.state : 'no picture' };
  // A context that cannot draw an image says so and the caller carries on with
  // the terrain, rather than throwing in a node test or an SVG writer.
  if (typeof g.drawImage !== 'function') return { drawn: 0, why: 'this context cannot draw an image' };
  const r = artRect();
  const [x0, y0] = at(r.x0, r.z0);
  const [x1, y1] = at(r.x1, r.z1);
  const w = x1 - x0, h = y1 - y0;
  if (!(w > 0) || !(h > 0)) return { drawn: 0, why: 'the picture has no room on this map' };
  const cw = Number.isFinite(opts.w) ? opts.w : Infinity;
  const ch = Number.isFinite(opts.h) ? opts.h : Infinity;
  if (x1 < 0 || y1 < 0 || x0 > cw || y0 > ch) return { drawn: 0, why: 'the picture is off this map' };
  g.drawImage(art.img, x0, y0, w, h);
  return { drawn: 1, x: x0, y: y0, w, h, url: GUIDE_ART.url };
}

/** One traced polyline, clipped to nothing and drawn in whatever ink is asked. */
function guideWay(g, at, pts, colour, width) {
  if (!pts || pts.length < 2) return 0;
  g.setLineDash([]);
  g.strokeStyle = colour;
  g.lineWidth = width;
  g.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const [px, py] = at(pts[i].x, pts[i].z);
    if (i === 0) g.moveTo(px, py); else g.lineTo(px, py);
  }
  g.stroke();
  return pts.length;
}

/**
 * The lane, the Kingsroad and the river, as the painting has them. Faint, and
 * under the outlines, because they are where to paint a road and not a road.
 */
export function paintGuideWays(g, opts = {}) {
  const at = opts.at;
  if (typeof at !== 'function') return { roads: 0, river: 0, points: 0 };
  const scale = Number.isFinite(opts.scale) ? opts.scale : 1;
  let roads = 0, points = 0;
  for (const road of opts.roads || GUIDE_ROADS) {
    const n = guideWay(g, at, road.pts, GUIDE_ROAD_INK, 2.2 * scale);
    if (n) { roads++; points += n; }
  }
  const river = opts.river === null ? null : (opts.river || GUIDE_RIVER);
  let rivers = 0;
  if (river) {
    const n = guideWay(g, at, river.pts, GUIDE_RIVER_INK, 2.6 * scale);
    if (n) { rivers++; points += n; }
  }
  return { roads, river: rivers, points };
}

/**
 * The twelve boundaries, dashed, with their names in small capitals at their
 * middles.
 *
 * The Standing Hedge is an ANNULUS and is drawn as two circles, `r` and
 * `r - band`, because the ring itself is its boundary: the stones stand on the
 * circle and the village stands inside it, so a filled disc would say the whole
 * middle of the realm is one space.
 *
 * `centresOnly` is the minimap's rule: a space whose middle is off the square
 * is not drawn at all, because half an outline with no name on it is furniture.
 * The zone map's rule is the looser one: draw anything whose circle touches
 * the picture.
 */
export function paintGuideZones(g, opts = {}) {
  const at = opts.at;
  const mpp = opts.mpp;
  if (typeof at !== 'function' || !(mpp > 0)) return { drawn: 0, named: 0, rings: 0, off: 0, small: 0 };
  const zones = opts.zones || GUIDE_ZONES;
  const cw = Number.isFinite(opts.w) ? opts.w : Infinity;
  const ch = Number.isFinite(opts.h) ? opts.h : Infinity;
  const centresOnly = !!opts.centresOnly;
  const wantNames = opts.names !== false;
  const nameSize = Number.isFinite(opts.nameSize) ? opts.nameSize : 10;
  const hover = opts.hover || null;
  let drawn = 0, named = 0, rings = 0, off = 0, small = 0;
  for (const zn of zones) {
    const [px, py] = at(zn.x, zn.z);
    const rpx = zn.r / mpp;
    if (centresOnly) {
      if (px < 0 || py < 0 || px > cw || py > ch) { off++; continue; }
    } else if (px + rpx < 0 || py + rpx < 0 || px - rpx > cw || py - rpx > ch) { off++; continue; }
    if (rpx < GUIDE_MIN_PX) { small++; continue; }
    const hot = hover === zn.id;
    g.setLineDash(zn.annulus ? GUIDE_RING_DASH : GUIDE_DASH);
    g.strokeStyle = hot ? GUIDE_INK_HOT : GUIDE_INK;
    g.lineWidth = hot ? 2 : 1.2;
    g.beginPath();
    g.arc(px, py, rpx, 0, Math.PI * 2);
    g.stroke();
    drawn++;
    if (zn.annulus && zn.band > 0) {
      const inner = (zn.r - zn.band) / mpp;
      if (inner >= GUIDE_MIN_PX) {
        g.beginPath();
        g.arc(px, py, inner, 0, Math.PI * 2);
        g.stroke();
        rings++;
      }
    }
    g.setLineDash([]);
    if (!wantNames || rpx < GUIDE_NAME_PX) continue;
    g.font = `600 ${nameSize.toFixed(1)}px ${theme.fonts.display}`;
    g.textAlign = 'center';
    tracking(g, nameSize * 0.09);
    const text = labelFor(zn.name);
    // `clampX` is the minimap's rule: no letter of a name may leave the square.
    // The zone map hands none over, because its picture is 640 px and a name
    // running a little past the edge of a scrolling map is what a map does.
    let tx = px;
    if (typeof opts.clampX === 'function' && typeof g.measureText === 'function') {
      tx = opts.clampX(px, g.measureText(text).width);
    }
    haloText(g, text, tx, py, hot ? GUIDE_INK_HOT : GUIDE_NAME_INK, 'rgba(18,14,8,.80)', 3);
    tracking(g, 0);
    named++;
  }
  return { drawn, named, rings, off, small };
}

// ---------------------------------------------------------------- the pass --

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** A cache for the ground. Hand the same one back on every repaint. */
export function makeCache() { return { key: null, grid: null, rivers: null, roads: null }; }

/**
 * What the ground the field gives back depends on. A place being found is not
 * on this list; THE HAND CUT GROUND IS.
 *
 * `terrain_edits.js` moves `version` on every stroke, every undo, every redo,
 * every load and every change of base, and `field.terrainEdits` is that list.
 * Without it in the key, a map painted once while the user is sculpting is the
 * map they get for the rest of the session: the cache is keyed on the view, and
 * the view does not move when a hill does. `sculpt` goes in beside it because a
 * change of base height or ground word is a different world under the same
 * strokes and does not always touch a stroke to say so.
 *
 * Read off the FIELD and not off the options, so every caller of paintGround
 * gets this and not just the one that remembered to pass it.
 */
export function terrainKey(field) {
  const ed = field && field.terrainEdits;
  const sc = field && field.sculpt;
  return `${ed && Number.isFinite(ed.version) ? ed.version : -1}/`
    + (sc ? `${sc.height},${sc.ground},${sc.snowLine},${sc.beachLine}` : '-');
}

function groundKey(field, view, opts) {
  const kz = opts.known?.zones;
  let zk = '';
  if (kz === true) zk = '*';
  else if (Array.isArray(kz)) zk = kz.slice().sort().join('|');
  else if (kz && typeof kz.forEach === 'function') { const a = []; kz.forEach((v) => a.push(v)); zk = a.sort().join('|'); }
  return [
    field.seed, view.x, view.z, view.w, view.h, view.px, view.py,
    opts.samples ?? MAP_SAMPLES, opts.drawScale ?? DRAW_SCALE, opts.seed ?? 1, zk,
    terrainKey(field),
  ].join(':');
}

/** The faint hatch over country nobody has walked into. */
function paintUnknown(g, view, grid) {
  const fs = view.fs;
  const { gw, gh } = grid;
  const step = 7 * fs;
  let strokes = 0;
  g.setLineDash([]);
  g.strokeStyle = 'rgba(120,104,80,.30)';
  g.lineWidth = 0.8 * fs;
  const d = step * 0.62;
  for (let py = 0; py < view.py + step; py += step) {
    for (let px = 0; px < view.px + step; px += step) {
      const u = (Math.min(px, view.px) / view.px) * (gw - 1);
      const v = (Math.min(py, view.py) / view.py) * (gh - 1);
      if (bilin(grid.ka, gw, gh, u, v) > 0.42) continue;
      if (!strokes) g.beginPath();
      g.moveTo(px - d, py + d);
      g.lineTo(px + d, py - d);
      strokes++;
    }
  }
  if (strokes) g.stroke();
  return strokes;
}

/**
 * The ground: everything that does not change when a player finds a hut.
 *
 * `opts.cache` from `makeCache()` keeps the sampled grid, the rivers and the
 * roads, so a repaint on a discovery re-issues the draw calls with no field
 * work at all. The stats say `cached: true` when it did.
 */
export function paintGround(g, opts = {}) {
  const t0 = now();
  const view = opts.view || viewFor(opts);
  const field = opts.field;
  if (!field) throw new Error('paintMap: no field. Pass the world field from createWorldField.');
  const cache = opts.cache || null;
  const key = groundKey(field, view, opts);
  let grid, rivers, roads, cached = false;
  if (cache && cache.key === key && cache.grid) {
    grid = cache.grid; rivers = cache.rivers; roads = cache.roads; cached = true;
  } else {
    grid = sampleGround(field, view, opts);
    rivers = opts.rivers === false ? { lines: [], tested: 0 } : riverLines(field, view, { ...opts, grid });
    roads = opts.roads === false ? [] : roadLines(field, view);
    if (cache) { cache.key = key; cache.grid = grid; cache.rivers = rivers; cache.roads = roads; }
  }
  const tSampled = now();

  g.save();
  const rects = composeGround(g, view, grid, opts);
  const fibres = paintFibre(g, view, opts);
  const sea = paintSea(g, view, grid, opts);
  const river = paintRivers(g, view, rivers.lines);
  const texture = paintGroundTexture(g, view, grid, opts);
  const hatch = paintHachures(g, view, grid, opts);
  const peaks = paintPeaks(g, view, grid, opts);
  const canopy = paintCanopy(g, view, grid, opts);
  const roadsDrawn = paintRoads(g, view, roads, opts);
  const rims = opts.rims === false ? 0 : paintRealmRims(g, view, grid, opts);
  const blank = paintUnknown(g, view, grid);
  const labelBoxes = opts.labelBoxes || furnitureBoxes(view, opts);
  // `names: false` is for a caller that writes its own: win_map.js already has
  // a zone list and a click target for every name it draws, and two sets of
  // realm names on one map is worse than either set alone.
  const country = opts.names === false
    ? { realms: 0, offered: 0 }
    : paintRealmNames(g, view, grid, opts, labelBoxes);
  g.restore();

  return {
    ms: now() - t0, msField: tSampled - t0, cached,
    samples: grid.samples, rects, fibres, drawScale: drawScaleFor(view, grid, opts),
    rivers: rivers.lines.length, riverProbes: rivers.tested,
    roads: roadsDrawn, coast: sea.coast, waves: sea.waves,
    hachures: hatch.drawn, hachureSites: hatch.tested, peaks,
    canopy: canopy.clumps, canopyDots: canopy.dots, texture, blankStrokes: blank,
    realms: country.realms, rims, labelBoxes,
    view,
  };
}

/**
 * The whole map: the ground, the places, the frame.
 *
 * @param g     a 2D context, or anything with the same calls. No filter, no
 *              clip, no pattern and no gradient is ever asked of it.
 * @param opts  { field, x, z, w, h, px, py, realm, known, samples, drawScale,
 *                cache, rolled, seed, title, subtitle, banner, rose, scale }
 */
export function paintMap(g, opts = {}) {
  const t0 = now();
  const view = opts.view || viewFor(opts);
  const o = { ...opts, view };
  const ground = paintGround(g, o);
  const marks = paintMarks(g, { ...o, labelBoxes: ground.labelBoxes });
  const frame = opts.frame === false ? null : paintFrame(g, o);
  return {
    ms: now() - t0,
    msGround: ground.ms, msMarks: marks.ms, msField: ground.msField,
    cached: ground.cached,
    ...ground, places: marks.places, labelled: marks.labelled,
    regions: marks.regions, framed: !!frame,
    view,
  };
}

export const MAP_PAINT_AUDIT = auditMapPaint();
