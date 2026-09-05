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
// ---- the right hand column ----------------------------------------------
//
// The map was 640 pixels of picture beside 640 pixels of nothing, and a footer
// that said three numbers. A picture cannot tell you which way a place is, or
// how far, or what the country is called, so the other half of the page is the
// index to the map, in the codex's own hand:
//
//   WHERE YOU STAND   the zone you are in and its line, the ground under your
//                     feet in words, the way to the nearest town, and the way
//                     to your mark with a button to drop it
//   REGIONS           all twenty one, nearest first. Walked: its name and its
//                     danger band in the game's own words. Not walked: the way,
//                     the distance and the word "unwalked", and NOT the name,
//                     which is exactly what the hatching on the map means
//   PLACES FOUND      every site the character has walked up to, nearest first
//   the key           one swatch for every colour the draw above actually uses
//
// Every row of the last two lists is a click that sets the waypoint, and every
// one of those clicks says so in the line under the map and in a toast.
//
// `sideModel()` works all of it out with no DOM, so what is tested is what is
// shown, and the places it lists come out of `foundPlaces()`, which is the same
// call the draw itself makes: the list and the footer's count cannot disagree.
// The bearings and the distances are compass.js's `bearingOf` and
// `distanceText`, not a second copy of the same arithmetic in another frame.
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
import { BIOMES } from '../world/field.js';
import {
  ZONES, WORLD_HALF, zoneAt, wildDanger, DANGER_WORD, ARTICLE,
} from '../world/zones.js';
import { ZONE_ENTER_W } from '../world/sites.js';
import { bearingOf, distanceText, POINTS } from './compass.js';
import { theme } from './ui_theme.js';

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
/**
 * What is happening right now, and who is walking about.
 *
 * An event is a ring the size of the thing itself with a diamond at its middle;
 * a wandering boss is a triangle where it is standing this hour. Both move
 * between one redraw and the next, which is the point of them: E2 owns the
 * schedule (`src/mmo/events.js`) and this draws where it says they are.
 */
export const EVENT_COLOUR = '#ff9d4d';
export const BOSS_COLOUR = '#ff6b8a';
export const EDGE_COLOUR = '#7fa8c8';
export const WAYPOINT_COLOUR = '#8fe0ff';
/** The arrow that is you. The draw and the key take the same value. */
export const PLAYER_COLOUR = '#ffe08a';
/** The wash and the strokes over country nobody has walked into. */
export const HATCH_INK = 'rgba(150,160,175,.30)';
export const HATCH_WASH = 'rgba(10,12,16,.55)';

/**
 * The word for the ground under a point. These are the words the place plate
 * says as you walk, so the map and the HUD call the same field the same thing.
 */
export const GROUND_WORD = {
  ocean: 'open water', beach: 'the shore', meadow: 'open meadow',
  boreal: 'pine woods', desert: 'dry country', sakura: 'blossom country',
  mountain: 'high ground', snow: 'the snowline',
};

/**
 * The short word a place's kind wears in a row. `ARTICLE` in zones.js is the
 * sentence a toast says on arriving; this is the label a list can hold.
 */
export const KIND_WORD = {
  town: 'town', hamlet: 'hamlet', ruin: 'ruin', shrine: 'shrine',
  dungeon: 'dungeon', cave: 'cave', camp: 'camp', mine: 'mine',
};

/** The eight compass points, written out. compass.js owns the bearings. */
export const POINT_WORD = {
  N: 'north', NE: 'north east', E: 'east', SE: 'south east',
  S: 'south', SW: 'south west', W: 'west', NW: 'north west',
};

/**
 * The key under the lists: one row per thing the draw above actually paints.
 * `swatch` says how the mark is drawn, not what it means.
 */
export const LEGEND = [
  { id: 'ocean', label: 'sea', swatch: 'biome' },
  { id: 'beach', label: 'shore', swatch: 'biome' },
  { id: 'meadow', label: 'meadow', swatch: 'biome' },
  { id: 'boreal', label: 'forest', swatch: 'biome' },
  { id: 'sakura', label: 'blossom', swatch: 'biome' },
  { id: 'desert', label: 'desert', swatch: 'biome' },
  { id: 'mountain', label: 'mountain', swatch: 'biome' },
  { id: 'snow', label: 'snow', swatch: 'biome' },
  { id: 'road', label: 'road', swatch: 'line', colour: ROAD_COLOUR },
  { id: 'unwalked', label: 'unwalked', swatch: 'hatch', colour: HATCH_INK },
  { id: 'event', label: 'happening now', swatch: 'ring', colour: EVENT_COLOUR },
  { id: 'wanderer', label: 'a boss on its round', swatch: 'arrow', colour: BOSS_COLOUR },
  { id: 'waypoint', label: 'your mark', swatch: 'ring', colour: WAYPOINT_COLOUR },
  { id: 'you', label: 'you', swatch: 'arrow', colour: PLAYER_COLOUR },
];

/** The css colour a key row's swatch takes. Biomes come out of the palette. */
export function legendColour(row) {
  if (row.swatch === 'biome') {
    const c = BIOME_COLOUR[row.id];
    return c ? `rgb(${c[0]},${c[1]},${c[2]})` : '#888888';
  }
  return row.colour || '#888888';
}

/**
 * Every word this panel promises, checked at import.
 *
 * A ninth biome, a ninth kind of place or a ninth compass point would otherwise
 * be drawn with no name, no swatch and no row, which is the class of bug that
 * shipped four biomes with a pickaxe that did nothing.
 */
export function auditMapWords() {
  const bad = [];
  for (const b of BIOMES) {
    if (!BIOME_COLOUR[b]) bad.push(`the field can return "${b}" and the map has no colour for it`);
    if (!GROUND_WORD[b]) bad.push(`the field can return "${b}" and the map has no word for it`);
    if (!LEGEND.some((r) => r.swatch === 'biome' && r.id === b)) bad.push(`"${b}" is drawn on the map and is not in the key`);
  }
  for (const r of LEGEND) {
    if (!r.label) bad.push(`a key row has no label`);
    if (r.swatch === 'biome' && !BIOME_COLOUR[r.id]) bad.push(`the key has a swatch for "${r.id}", which the map never draws`);
    if (r.swatch !== 'biome' && !r.colour) bad.push(`the "${r.id}" key row has no colour`);
  }
  for (const k of Object.keys(ARTICLE)) {
    if (!SITE_COLOUR[k]) bad.push(`a ${k} is a place in the world and has no colour on the map`);
    if (!KIND_WORD[k]) bad.push(`a ${k} is a place in the world and has no word for the list`);
  }
  for (const k of Object.keys(KIND_WORD)) if (!ARTICLE[k]) bad.push(`"${k}" is a word for a kind of place the world never makes`);
  for (const [label] of POINTS) if (!POINT_WORD[label]) bad.push(`the compass has a ${label} point and the map has no word for it`);
  for (let t = 1; t <= 5; t++) if (!DANGER_WORD[t]) bad.push(`monster tier ${t} has no word for a region row`);
  if (bad.length) throw new Error(`auditMapWords: ${bad.length} problem(s)\n  ${bad.join('\n  ')}`);
  return { biomes: BIOMES.length, kinds: Object.keys(KIND_WORD).length, key: LEGEND.length };
}

auditMapWords();

/** The compass point a direction is nearest, in words: "north east". */
export function bearingWord(dx, dz) {
  if (!dx && !dz) return 'here';
  const step = (Math.PI * 2) / POINTS.length;
  const i = Math.round(bearingOf(dx, dz) / step) % POINTS.length;
  return POINT_WORD[POINTS[i][0]];
}

/**
 * How a row says where a thing is: the point of the compass and the distance,
 * both in compass.js's own words, so the strip across the top of the screen and
 * the list in the codex never round the same walk two different ways.
 */
export function wayText(dx, dz) {
  const d = Math.hypot(dx, dz);
  if (d < 20) return 'right here';
  return `${bearingWord(dx, dz)}, ${distanceText(d)}`;
}

/**
 * A danger band in the game's own words. A band of one tier is the word the
 * arrival banner uses; a band of two says both ends, because "3 to 4" is a
 * number a player has never been shown and cannot read.
 */
export function dangerWords(danger) {
  if (!Array.isArray(danger)) return '';
  const [lo, hi] = danger;
  const a = DANGER_WORD[lo], b = DANGER_WORD[hi];
  if (!a || !b) return '';
  return lo === hi ? a : `${a} at best, ${b} at worst`;
}

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

/**
 * Every site on this map the character has found, in cell order.
 *
 * The draw calls this and so does the list beside it, which is the whole point
 * of it being a function: the footer says "two places found" because this
 * returned two rows, and the list under PLACES FOUND holds those same two rows.
 * Two loops over the same cells would eventually disagree and the player would
 * be the one who noticed.
 */
export function foundPlaces(opts) {
  const { field, cx = 0, cz = 0 } = opts;
  const span = opts.span ?? MAP_SPAN;
  const has = asHas(opts.discovered);
  const out = [];
  if (!field) return out;
  for (const [ccx, ccz] of cellsIn(cx, cz, span)) {
    const s = field.siteInCell(ccx, ccz);
    if (!s || !has(s.id)) continue;
    out.push(s);
  }
  return out;
}

/**
 * The marks the events layer wants drawn, cleaned up so the draw never has to
 * check anything twice.
 *
 * `src/game/events_runtime.js` `marks()` is the source: every live event, and
 * every wandering boss the character has been within 200 m of. Anything without
 * a place on the map is dropped here rather than drawn at the origin, which is
 * where a missing number ends up.
 */
export function eventMarks(list) {
  const out = [];
  for (const m of Array.isArray(list) ? list : []) {
    if (!m || !Number.isFinite(m.x) || !Number.isFinite(m.z)) continue;
    out.push({
      kind: m.kind === 'boss' ? 'boss' : 'event',
      id: m.id || null, name: m.name || '', x: m.x, z: m.z,
      r: Number.isFinite(m.r) ? m.r : 0,
    });
  }
  return out;
}

/** What a panel context hands the map: the live marks, or nothing at all. */
export function marksOf(ctx) {
  try { return eventMarks(ctx?.events?.marks?.()); } catch { return []; }
}

/** A row of any list: what it is, where it is, and how a player says so. */
function wayRow(x, z, cx, cz) {
  const dx = x - cx, dz = z - cz;
  return { x, z, dist: Math.hypot(dx, dz), way: wayText(dx, dz), bearing: bearingWord(dx, dz) };
}

const byDist = (a, b) => a.dist - b.dist;

/**
 * Everything the column beside the map says, worked out with no DOM at all.
 *
 * @param opts { field, cx, cz, span, discovered, zonesFound, waypoint }
 * @returns {{
 *   here: { zone, name, line, danger, ground, wild },
 *   town: object | null,
 *   waypoint: object | null,
 *   regions: object[], walked: number,
 *   places: object[],
 *   key: object[],
 * }}
 *
 * A region a player has not walked into comes back with `name: null` and
 * `id: null`. The name is the thing the hatching on the map is withholding, and
 * a model that carried it would put it one careless `textContent` away from the
 * screen.
 */
export function sideModel(opts = {}) {
  const { field = null, cx = 0, cz = 0 } = opts;
  const span = opts.span ?? MAP_SPAN;
  const foundZone = asHas(opts.zonesFound);

  // where you stand. Half inside is what discovery calls being in a zone, so
  // the header and the arrival banner agree about which country this is.
  const hit = zoneAt(cx, cz);
  const zone = hit && hit.weight >= ZONE_ENTER_W ? hit.zone : null;
  let ground = null;
  if (field && typeof field.sampleAt === 'function') {
    const s = field.sampleAt(cx, cz);
    ground = GROUND_WORD[s.biome] || s.biome || null;
  }
  const here = {
    zone,
    name: zone ? zone.name : null,
    line: zone ? zone.line : null,
    danger: dangerWords(zone ? zone.danger : wildDanger(cx, cz)),
    ground,
    wild: !zone,
  };

  // the places, out of the same call the draw makes
  const places = foundPlaces({ field, cx, cz, span, discovered: opts.discovered })
    .map((s) => ({
      id: s.id, kind: s.kind, kindWord: KIND_WORD[s.kind] || s.kind, name: s.name,
      ...wayRow(s.x, s.z, cx, cz),
    }))
    .sort(byDist);

  // the nearest town you have found. A hamlet is not a town and is not called
  // one, but it is the nearest thing with a roof and it is better than a blank.
  const town = places.find((p) => p.kind === 'town')
    || places.find((p) => p.kind === 'hamlet')
    || null;

  // A region's row is walked exactly when the MAP says it is walked, so the
  // list and the hatching can never say two different things about one zone.
  const regions = ZONES.map((zn) => {
    const known = foundZone(zn.id);
    return {
      id: known ? zn.id : null,
      name: known ? zn.name : null,
      known: !!known,
      danger: known ? dangerWords(zn.danger) : null,
      here: !!(zone && zone.id === zn.id),
      ...wayRow(zn.x, zn.z, cx, cz),
    };
  }).sort(byDist);

  // what is happening right now, nearest first, in the same words every other
  // list on this page uses. A boss says where it is standing; an event says
  // whether you are inside it, because that is the only fact about it that
  // changes what you should do next.
  const events = eventMarks(opts.events)
    .map((m) => {
      const row = { ...m, ...wayRow(m.x, m.z, cx, cz) };
      row.inside = m.kind === 'event' && m.r > 0 && row.dist <= m.r;
      row.sub = m.kind === 'boss' ? 'on its round' : row.inside ? 'you are in it' : 'happening now';
      return row;
    })
    .sort(byDist);

  const wp = opts.waypoint;
  const waypoint = wp && Number.isFinite(wp.x) && Number.isFinite(wp.z)
    ? { name: wp.name || 'your mark', ...wayRow(wp.x, wp.z, cx, cz) }
    : null;

  return {
    here,
    town,
    waypoint,
    regions,
    walked: regions.filter((r) => r.known).length,
    places,
    events,
    key: LEGEND.map((r) => ({ ...r, colour: legendColour(r) })),
  };
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
        g2d.fillStyle = HATCH_WASH;
        g2d.fillRect(zx - rpx, zy - rpx, rpx * 2, rpx * 2);
        hatch(g2d, zx - rpx, zy - rpx, zx + rpx, zy + rpx, 7, HATCH_INK);
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
  // document keeps an array and sites.js keeps a Set behind a `has`. The list
  // is `foundPlaces`, which is what the column beside the map lists, so the
  // count in the footer and the rows under PLACES FOUND are one answer.
  const sites = foundPlaces({ field, cx, cz, span, discovered: opts.discovered });
  for (const s of sites) {
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

  // 5b. what is happening right now, and who is walking about.
  //
  // These are drawn OVER the places and UNDER the waypoint, because an event is
  // news and a mark is yours. An event's ring is its own radius, so the Bone
  // Wind is a small circle crossing the Boneyard and the Blossom Fall is the
  // whole of the Verdant Deep, which is what each of them actually is.
  const marks = eventMarks(opts.events);
  for (const m of marks) {
    const [px, py] = toPixel(m.x, m.z, cx, cz, size, span);
    const colour = m.kind === 'boss' ? BOSS_COLOUR : EVENT_COLOUR;
    if (m.kind === 'event' && m.r > 0) {
      const rr = Math.max(3, (m.r / span) * size);
      g2d.strokeStyle = colour;
      g2d.lineWidth = 1.2;
      g2d.beginPath();
      g2d.arc(px, py, rr, 0, Math.PI * 2);
      g2d.stroke();
    }
    g2d.fillStyle = colour;
    g2d.beginPath();
    if (m.kind === 'boss') {
      g2d.moveTo(px, py - 5);
      g2d.lineTo(px + 4.5, py + 4);
      g2d.lineTo(px - 4.5, py + 4);
    } else {
      g2d.moveTo(px, py - 5);
      g2d.lineTo(px + 5, py);
      g2d.lineTo(px, py + 5);
      g2d.lineTo(px - 5, py);
    }
    g2d.closePath();
    g2d.fill();
    g2d.strokeStyle = 'rgba(0,0,0,.7)';
    g2d.lineWidth = 1;
    g2d.stroke();
    if (m.name) {
      g2d.font = '600 11px ui-sans-serif, system-ui, sans-serif';
      g2d.textAlign = 'center';
      g2d.fillStyle = 'rgba(0,0,0,.75)';
      g2d.fillText(m.name, px + 1, py + 17);
      g2d.fillStyle = colour;
      g2d.fillText(m.name, px, py + 16);
    }
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
  g2d.fillStyle = PLAYER_COLOUR;
  g2d.fill();
  g2d.strokeStyle = '#241d10';
  g2d.lineWidth = 1.2;
  g2d.stroke();
  g2d.restore();
  g2d.restore();

  const ms = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
  return { ms, samples: n * n, sites: sites.length, roads, zones: zonesDrawn, named, stride, marks: marks.length };
}

/** Where the arrow tip lands for a heading, which is what the rotation means. */
export function arrowTip(yaw, len = 8) {
  const a = Math.PI - yaw;
  return [len * Math.sin(a), -len * Math.cos(a)];
}

// ---------------------------------------------------------------------------
// The panel.
//
// Two columns: the picture on the left with its footer and its one gold line of
// speech, the index on the right in the codex's own furniture. The headers are
// `bw-hdr`, which is the rule under THE PACK on the character page, and the
// rows sit on the same hairline gold border a stat row does, so the map reads
// as another page of the same book and not as a screenshot with a list beside
// it.

const CSS = `
.bw-win-map .bw-map-cols{
  display:grid; gap:16px; align-items:start;
  grid-template-columns:min(640px,78vh) minmax(300px,1fr);
}
@media (max-width:1080px){ .bw-win-map .bw-map-cols{ grid-template-columns:1fr; } }
.bw-win-map .bw-map-wrap{position:relative;width:100%;max-width:min(640px,78vh)}
.bw-win-map canvas{display:block;width:100%;height:auto;border-radius:8px;border:1px solid ${theme.goldDim}66;background:#0d1014;cursor:crosshair}
.bw-win-map .bw-map-foot{
  display:flex;justify-content:space-between;gap:10px;margin-top:8px;
  font-family:${theme.fonts.display};font-size:11px;letter-spacing:.1em;
  text-transform:uppercase;color:${theme.parchmentFaint};
}
.bw-win-map .bw-map-say{
  color:${theme.gold};font-size:13.5px;font-style:italic;margin-top:5px;min-height:19px;
}

.bw-win-map .bw-map-side{ min-width:0; }
.bw-win-map .bw-map-hint{
  color:${theme.parchmentFaint};font-size:12.5px;font-style:italic;margin:-2px 0 9px;
}
.bw-win-map .bw-map-here{ margin-bottom:9px; }
.bw-win-map .bw-map-here .zn{
  font-family:${theme.fonts.display};font-size:18px;font-weight:700;letter-spacing:.04em;
  color:${theme.parchment};
}
.bw-win-map .bw-map-here .dg{
  font-family:${theme.fonts.display};font-size:10.5px;letter-spacing:.2em;
  text-transform:uppercase;color:${theme.gold};margin-top:1px;
}
.bw-win-map .bw-map-here .ln{
  font-size:14px;font-style:italic;line-height:1.45;color:${theme.parchmentDim};
  border-left:2px solid ${theme.goldDim}88;padding-left:9px;margin:6px 0 2px;
}
.bw-win-map .bw-map-fact{
  display:grid;grid-template-columns:1fr auto;gap:2px 10px;align-items:baseline;
  padding:3px 0;border-bottom:1px solid rgba(201,164,74,.14);font-size:14px;
}
.bw-win-map .bw-map-fact .k{color:${theme.parchmentDim};}
.bw-win-map .bw-map-fact .v{
  font-family:${theme.fonts.display};font-size:13px;font-weight:600;
  font-variant-numeric:tabular-nums;color:${theme.parchment};text-align:right;
}
.bw-win-map .bw-map-fact .v.none{font-weight:400;font-style:italic;color:${theme.parchmentFaint};}
.bw-win-map .bw-map-clear{margin-top:7px;}

.bw-win-map .bw-map-row{
  display:grid;grid-template-columns:1fr auto;gap:0 10px;align-items:baseline;
  padding:4px 5px;border-bottom:1px solid rgba(201,164,74,.14);
}
.bw-win-map .bw-map-row:last-child{border-bottom:0;}
.bw-win-map .bw-map-row.pick{cursor:pointer;}
.bw-win-map .bw-map-row.pick:hover{background:rgba(201,164,74,.10);}
.bw-win-map .bw-map-row.off{opacity:.6;}
.bw-win-map .bw-map-row.here{background:rgba(201,164,74,.07);}
.bw-win-map .bw-map-row .nm{
  font-family:${theme.fonts.display};font-size:14px;color:${theme.parchment};
}
.bw-win-map .bw-map-row.off .nm{
  font-family:${theme.fonts.display};font-size:10.5px;letter-spacing:.2em;
  text-transform:uppercase;color:${theme.parchmentFaint};
}
.bw-win-map .bw-map-row .ds{
  font-family:${theme.fonts.display};font-size:12.5px;font-variant-numeric:tabular-nums;
  color:${theme.gold};text-align:right;white-space:nowrap;
}
.bw-win-map .bw-map-row .sub{font-size:13px;font-style:italic;color:${theme.parchmentDim};}
.bw-win-map .bw-map-row .wy{
  font-size:12px;color:${theme.parchmentFaint};text-align:right;white-space:nowrap;
}
.bw-win-map .bw-map-none{
  font-size:13.5px;font-style:italic;line-height:1.45;color:${theme.parchmentDim};padding:3px 0;
}

.bw-win-map .bw-map-key{display:flex;flex-wrap:wrap;gap:5px 14px;padding-top:2px;}
.bw-win-map .bw-map-key .k{
  display:flex;align-items:center;gap:6px;font-size:12.5px;color:${theme.parchmentDim};
}
.bw-win-map .bw-map-key .sw{
  width:15px;height:11px;flex:0 0 auto;border:1px solid rgba(0,0,0,.55);
}
.bw-win-map .bw-map-key .sw.hatch{
  background-color:${HATCH_WASH};
  background-image:repeating-linear-gradient(45deg, ${HATCH_INK} 0 1px, rgba(0,0,0,0) 1px 4px);
}
.bw-win-map .bw-map-key .sw.line{height:4px;border:0;}
.bw-win-map .bw-map-key .sw.ring{
  width:12px;height:12px;border-radius:50%;background:none;border-width:2px;
}
.bw-win-map .bw-map-key .sw.arrow{
  border:0;width:12px;height:13px;clip-path:polygon(50% 0,100% 100%,50% 74%,0 100%);
}
`;

/** Where the panel thinks you are. redraw and render must never disagree. */
function playerAt(ctx) {
  return ctx?.player?.pos || ctx?.actor?.pos || ctx?.character?.pos || { x: 0, z: 0 };
}

/** The character document is the record; the runtime's sets are the fallback. */
function discoveredOf(ctx) { return ctx?.character?.discovered || ctx?.runtime?.discovery || []; }
function zonesFoundOf(ctx) { return ctx?.character?.zones || ctx?.runtime?.discovery?.zonesFound || []; }

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

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

    const cols = el('div', 'bw-map-cols');
    const left = el('div', 'bw-map-left');
    const wrap = el('div', 'bw-map-wrap');
    this._canvas = document.createElement('canvas');
    this._canvas.width = 640;
    this._canvas.height = 640;
    this._canvas.addEventListener('click', (e) => this.clickAt(e));
    wrap.appendChild(this._canvas);
    this._foot = el('div', 'bw-map-foot');
    this._say = el('div', 'bw-map-say');
    left.appendChild(wrap);
    left.appendChild(this._foot);
    left.appendChild(this._say);

    this._side = el('div', 'bw-map-side bw-panel');
    cols.appendChild(left);
    cols.appendChild(this._side);
    root.appendChild(cols);
    this._since = 0;
    this.render();
  },

  open(ctx) {
    this._ctx = ctx || this._ctx;
    this._since = 0;
    // with no world loaded yet the draw bows out, and the column still has to
    // say something rather than leaving the half of the page it owns black
    if (this.redraw() === null) this.render();
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
    const p = playerAt(ctx);
    const hit = pickAt(px, py, {
      field, cx: p.x, cz: p.z, size: this._canvas.width,
      discovered: discoveredOf(ctx),
      zonesFound: zonesFoundOf(ctx),
    });
    if (!hit) {
      this.setSay('Nothing there you have been to. Click a place or a region you have found.');
      return null;
    }
    return this.setWaypoint(hit);
  },

  /**
   * The one way a waypoint is ever written. The map's click lands here and so
   * does every row of the two lists, so a row and a click cannot write to two
   * different fields, and neither can forget to tell `state` to save it.
   */
  setWaypoint(hit) {
    if (!hit || !Number.isFinite(hit.x) || !Number.isFinite(hit.z)) return null;
    const ctx = this._ctx;
    const p = playerAt(ctx);
    const wp = { x: hit.x, z: hit.z, name: hit.name };
    if (ctx?.character) ctx.character.waypoint = wp;
    ctx?.state?.touch?.('waypoint');
    const d = Math.round(Math.hypot(hit.x - p.x, hit.z - p.z));
    this.setSay(`Waypoint set on ${hit.name}, ${d} m off. The compass has it.`);
    ctx?.hud?.toast?.(`waypoint set on <b>${hit.name}</b>, ${d} m off`);
    this.redraw();
    return wp;
  },

  /** The mark comes off, and the panel says which mark came off. */
  clearWaypoint() {
    const ctx = this._ctx;
    const had = ctx?.character?.waypoint || null;
    if (!had) {
      this.setSay('There is no mark on the map to clear.');
      return null;
    }
    if (ctx?.character) ctx.character.waypoint = null;
    ctx?.state?.touch?.('waypoint');
    const name = had.name || 'the map';
    this.setSay(`The mark on ${name} is cleared. The compass has nothing to point at now.`);
    ctx?.hud?.toast?.(`waypoint on <b>${name}</b> cleared`);
    this.redraw();
    return had;
  },

  setSay(text) { if (this._say) this._say.textContent = text || ''; },

  /** Every draw goes through here, so the number in the footer is the real one. */
  redraw() {
    const ctx = this._ctx;
    const field = ctx?.runtime?.field;
    if (!this._canvas || !field) return null;
    const g2d = this._canvas.getContext('2d');
    if (!g2d) return null;
    const p = playerAt(ctx);
    const res = drawMap(g2d, {
      field,
      cx: p.x, cz: p.z,
      size: this._canvas.width,
      yaw: ctx?.player?.yaw ?? 0,
      discovered: discoveredOf(ctx),
      zonesFound: zonesFoundOf(ctx),
      waypoint: ctx?.character?.waypoint || null,
      events: marksOf(ctx),
    });
    this._last = res;
    if (this._foot) {
      this._foot.textContent = '';
      const left = el('span', null, `${(MAP_SPAN / 1000).toFixed(0)} km across, ${res.sites} place${res.sites === 1 ? '' : 's'} found, ${res.named} of ${ZONES.length} regions walked`);
      const right = el('span', null, `${Math.round(p.x)}, ${Math.round(p.z)}`);
      this._foot.appendChild(left);
      this._foot.appendChild(right);
    }
    // the column beside the map is a reading of the same state, so it is
    // rebuilt with the picture and never a walk behind it
    this.render();
    return res;
  },

  /**
   * The right hand column, rebuilt out of `sideModel`. Returns the model it
   * drew, so a test can count what a player would count.
   */
  render() {
    if (typeof document === 'undefined' || !this._side) return null;
    const ctx = this._ctx;
    const p = playerAt(ctx);
    const m = sideModel({
      field: ctx?.runtime?.field || null,
      cx: p.x, cz: p.z,
      discovered: discoveredOf(ctx),
      zonesFound: zonesFoundOf(ctx),
      waypoint: ctx?.character?.waypoint || null,
      events: marksOf(ctx),
    });
    this._model = m;
    const side = this._side;
    side.textContent = '';

    // ---- where you stand ------------------------------------------------
    side.appendChild(el('div', 'bw-hdr', 'Where you stand'));
    side.appendChild(el('div', 'bw-map-hint', 'Click anywhere on the map, or any row below, to set your mark. The compass at the top of the screen points at it.'));

    const here = el('div', 'bw-map-here');
    here.appendChild(el('div', 'zn', m.here.name || 'Open country'));
    if (m.here.danger) here.appendChild(el('div', 'dg', m.here.danger));
    here.appendChild(el('div', 'ln', m.here.line || 'Nobody has written this part of the world down. It is yours to walk.'));
    side.appendChild(here);

    const fact = (k, v, none) => {
      const row = el('div', 'bw-map-fact');
      row.appendChild(el('span', 'k', k));
      row.appendChild(el('span', none ? 'v none' : 'v', v));
      side.appendChild(row);
      return row;
    };
    fact('the ground here', m.here.ground || 'not known yet', !m.here.ground);
    fact(m.town ? `the nearest ${m.town.kindWord}, ${m.town.name}` : 'the nearest town',
      m.town ? m.town.way : 'none found yet', !m.town);
    fact(m.waypoint ? `your mark, ${m.waypoint.name}` : 'your mark',
      m.waypoint ? m.waypoint.way : 'not set', !m.waypoint);
    if (m.waypoint) {
      const b = el('button', 'bw-btn bw-map-clear', 'clear waypoint');
      b.addEventListener('click', () => this.clearWaypoint());
      side.appendChild(b);
    }

    // ---- the regions ----------------------------------------------------
    side.appendChild(el('div', 'bw-hdr', `Regions, ${m.walked} of ${m.regions.length} walked`));
    for (const r of m.regions) {
      const row = el('div', `bw-map-row bw-map-region${r.known ? ' pick' : ' off'}${r.here ? ' here' : ''}`);
      row.appendChild(el('span', 'nm', r.known ? r.name : 'unwalked'));
      row.appendChild(el('span', 'ds', distanceText(r.dist)));
      row.appendChild(el('span', 'sub', r.known ? r.danger : ''));
      row.appendChild(el('span', 'wy', r.bearing));
      if (r.known) {
        row.dataset.zone = r.id;
        row.addEventListener('click', () => this.setWaypoint({ x: r.x, z: r.z, name: r.name }));
      }
      side.appendChild(row);
    }

    // ---- the places -----------------------------------------------------
    side.appendChild(el('div', 'bw-hdr', `Places found, ${m.places.length}`));
    if (!m.places.length) {
      side.appendChild(el('div', 'bw-map-none', 'You have walked up to nowhere yet. Get close to a town, a mine or a hole in a hillside and it is written down here, with the way back to it.'));
    }
    for (const s of m.places) {
      const row = el('div', 'bw-map-row bw-map-place pick');
      row.appendChild(el('span', 'nm', s.name));
      row.appendChild(el('span', 'ds', distanceText(s.dist)));
      row.appendChild(el('span', 'sub', s.kindWord));
      row.appendChild(el('span', 'wy', s.bearing));
      row.dataset.site = s.id;
      row.addEventListener('click', () => this.setWaypoint({ x: s.x, z: s.z, name: s.name }));
      side.appendChild(row);
    }

    // ---- what is happening ----------------------------------------------
    if (m.events.length) {
      side.appendChild(el('div', 'bw-hdr', `Happening now, ${m.events.length}`));
      for (const e of m.events) {
        const row = el('div', 'bw-map-row bw-map-event pick');
        row.appendChild(el('span', 'nm', e.name));
        row.appendChild(el('span', 'ds', distanceText(e.dist)));
        row.appendChild(el('span', 'sub', e.sub));
        row.appendChild(el('span', 'wy', e.bearing));
        if (e.id) row.dataset.event = e.id;
        row.addEventListener('click', () => this.setWaypoint({ x: e.x, z: e.z, name: e.name }));
        side.appendChild(row);
      }
    }

    // ---- the key --------------------------------------------------------
    side.appendChild(el('div', 'bw-hdr', 'What the colours mean'));
    const key = el('div', 'bw-map-key');
    for (const k of m.key) {
      const row = el('div', 'k');
      const sw = el('span', `sw ${k.swatch}`);
      if (k.swatch === 'hatch') sw.style.borderColor = k.colour;
      else if (k.swatch === 'ring') sw.style.borderColor = k.colour;
      else sw.style.background = k.colour;
      row.appendChild(sw);
      row.appendChild(el('span', 'lb', k.label));
      key.appendChild(row);
    }
    side.appendChild(key);
    return m;
  },

  /** The model the column last drew, for a test or the dev bench. */
  get lastSide() { return this._model || null; },

  get lastDraw() { return this._last || null; },
};

export default panel;
