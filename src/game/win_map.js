// The Map panel: the Greenwold, close up, and the world it stands in.
//
// 06-ECONOMY-UI.md asked for "the world map from the field at 8 km, discovered
// sites named", and until MAP2 that was the whole of it: one fixed picture of
// all 16 km, at 125 m to the sample, on which the realm a player actually lives
// in was a coin at the middle. Then the user began sculpting the Greenwold by
// hand on a blank world (docs/mmo/wiring/ED3-SCULPT.md) and asked for the two
// things that picture could not do: "I need to be able to zoom in on our
// starter map to see exactly where we are, and have the terrain reflected in
// the zone map. hide all other zones for now."
//
// So the map is a VIEW now, not a frame: a centre and a span, and it opens on
// the Greenwold at 5 km across. See MAP2-ZOOM.md.
//
//   the wheel   zooms about the cursor, between MAP_MIN_SPAN and the whole world
//   a drag      pans; a press that moves less than DRAG_PX is still a click
//   + and -     zoom about the middle; 0 goes back to the Greenwold
//   you         a button that recentres on the player without changing the span
//
// The ground under all of it is `map_paint.paintGround` over the SAME
// `field.sampleAt` the game walks on, at a resolution that follows the zoom
// (`samplesFor`), so a hill raised with the editor's brush, a snow field
// painted on, a lake cut in, all of them show. `map_paint.terrainKey` puts the
// stroke list's own version into the ground cache's key, which is what makes
// the picture follow the hand: without it the map painted once at boot is the
// map you have for the session.
//
// What is drawn, in order:
//
//   1. the ground, painted from the field at the view's own resolution, shaded
//      by height and hillshaded from the north west so relief reads at a glance
//   2. roads, from the polylines roads.js already holds
//   3. the veil: everything outside the realms `release.OPEN_REALMS` names is
//      taken down to FADE_ALPHA, one even-odd fill, so the country that is not
//      finished yet is there and is plainly not the subject
//   4. the world's edge, a thin ring at WORLD_HALF, so the boundary reads as
//      deliberate and not as the place the samples ran out
//   5. the zones. An OPEN one is tinted by danger and named once it is walked,
//      hatched and anonymous until then. A CLOSED one is a faint rim and no
//      name at all, and its places are not drawn either
//   6. the open realm's own line, gold, where the release gate turns you back
//   7. the spaces and tiles the editor has made, outlined and named, at
//      SPACE_SPAN or closer
//   8. sites you have found, named, a way into the ground drawn as a square
//   9. what is happening now, then the waypoint, then you, pointing where you
//      are facing, at your TRUE place on the map and not at the middle of it
//  10. the scale bar, which says the same span the footer says
//
// Click any discovered site or zone to set a waypoint. compass.js reads it, and
// the pixel it is read from goes through `toWorld` with the view's own centre
// and span, so a click means the same thing at every zoom.
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
  ZONES, ZONE, WORLD_HALF, zoneAt, wildDanger, DANGER_WORD, ARTICLE,
} from '../world/zones.js';
import { ZONE_ENTER_W, worldOf } from '../world/sites.js';
import { authoredZoneAt } from '../mmo/greenwold/places.js';
import {isDestination} from '../mmo/greenwold/navigation.js';
import { ROUTES as GREENWOLD_ROUTES } from '../mmo/greenwold/routes.js';
import { openAt, isOpen, OPEN_REALMS } from '../mmo/release.js';
import { authoredSites } from '../world/zones.js';
import { bearingOf, distanceText, POINTS } from './compass.js';
import { theme } from './ui_theme.js';
import {
  paintGround, makeCache, spacesIn, terrainKey,
  paintGuideArt, paintGuideWays, paintGuideZones,
  GUIDE_INK, GUIDE_ROAD_INK, GUIDE_RIVER_INK, GUIDE_TERRAIN_ALPHA, PAPER,
} from './map_paint.js';
import {
  GUIDE_ZONES, GUIDE_ART, guideArt, loadGuideArt, onGuideArt, guideZoneAt,
} from '../mmo/greenwold_guide.js';

/** The whole world, plus its ocean rim: the furthest out the map will go. */
export const MAP_SPAN = 2 * WORLD_HALF;
/** As close as it will go. A kilometre across is 1.6 m to the pixel at 640 px. */
export const MAP_MIN_SPAN = 1000;
export const MAP_MAX_SPAN = MAP_SPAN;
/** Where the map opens: the Greenwold, this many metres across. */
export const HOME_SPAN = 3000;
/** What one notch of the wheel, or one press of plus, multiplies the span by. */
export const ZOOM_RATE = 1.25;
/** Pixels a press may move and still count as a click and not a pan. */
export const DRAG_PX = 4;
/**
 * The shortest gap between two repaints WHILE A DRAG IS RUNNING, in ms.
 *
 * A pointermove arrives far oftener than a map can be painted: the measured
 * cost of the ground at the closest zoom is about 36 ms in node, and repainting
 * on every move would put a queue of whole maps behind the pointer. So a drag
 * paints at most fifteen times a second and always paints once more when the
 * button comes up, so what is left on the screen is where the drag ended and
 * never one frame short of it.
 */
export const DRAG_PAINT_MS = 66;
/** At this span or closer, the editor's spaces are outlined and named. */
export const SPACE_SPAN = 2000;
/** What is left of a realm the release gate has not opened yet. */
export const FADE_ALPHA = 0.15;
/** The paper the closed country is veiled with: the sheet at 1 - FADE_ALPHA. */
export const VEIL_COLOUR = `rgba(224,212,184,${1 - FADE_ALPHA})`;
/** The line round the open realm, where the gate turns a player back. */
export const OPEN_LINE = '#e6c76a';

/**
 * What the ground of this map is made of. See docs/mmo/wiring/MAP3-GUIDE.md.
 *
 *   painting   the user's hand painted sheet and nothing else
 *   both       the painting with the live terrain over it at GUIDE_TERRAIN_ALPHA,
 *              so a mountain sculpted with the brush shows on the painting
 *   terrain    the map as it was before the painting existed
 *
 * `both` is where the button opens, and `terrain` is what every one of them
 * comes to when the painting is not in yet, because there is nothing else to
 * show. `layerFor` is the one place that decides, so the button, the draw and
 * the footer cannot disagree about which of the three is really on the screen.
 */
export const LAYERS = ['painting', 'both', 'terrain'];
export const LAYER_WORD = {
  painting: 'the painting',
  both: 'the painting under the terrain',
  terrain: 'the terrain',
};
export const LAYER_TITLE = {
  painting: 'The hand painted sheet on its own, with nothing of the sculpted ground over it.',
  terrain: 'The ground as the field really is, with the painting taken off. This is the map as it was before the painting.',
};
LAYER_TITLE.both = `The painting with the live terrain over it at ${Math.round(GUIDE_TERRAIN_ALPHA * 100)} percent, so a hill raised with the brush shows through onto the painting.`;

/** Which of the three is really drawn, given what the picture is doing. */
export function layerFor(want, artState) {
  const w = LAYERS.includes(want) ? want : 'both';
  return artState === 'ready' ? w : 'terrain';
}

/** A hover within this many pixels of a guide boundary still counts as on it. */
export const GUIDE_PICK_PX = 6;

/**
 * Samples per side, at the closest zoom and at the whole world.
 *
 * MEASURED, not chosen, through a recording context in node, worst of five
 * warm runs each. At the near end, on the sculpted Greenwold the user is
 * building: 1 km costs 37 ms at 144 samples and 58 at 160, against a 60 ms
 * budget, so the near end is 144. At the far end, on the generated world, which
 * is far dearer a sample because every cell of it rolls a site: 16 km costs
 * 177 ms at 128 samples and 154 at 112, so the far end is 112.
 *
 * What the zoom buys is METRES PER SAMPLE, and that is where its work is done:
 * 143 m a sample over the whole world, 6.9 m a sample at a kilometre across,
 * twenty times finer.
 */
export const MAP_SAMPLES_NEAR = 144;
export const MAP_SAMPLES_FAR = 112;
/** The whole world's count, which is what MAP_STRIDE is a stride of. */
export const MAP_SAMPLES = MAP_SAMPLES_FAR;
/** Metres between samples, at the whole world. */
export const MAP_STRIDE = MAP_SPAN / MAP_SAMPLES;
/** A draw that takes longer than this is a bug, and the test says so. */
export const MAP_BUDGET_MS = 260;   // the painted ground is 168 ms cold at 640 px and 18 ms cached (M4); 130 was the flat fill's number
/** A repaint at the closest zoom is allowed this long. MAP2 measures it. */
export const NEAR_BUDGET_MS = 60;
/** Redrawn this often while the window is open. */
export const REDRAW_S = 2;
/** And no oftener than this, however fast the ground is moving under the brush. */
export const REPAINT_S = 0.5;
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
  // V1: the bodies seen from a mile off, and the smaller named things
  megastructure: '#f4e6b0', landmark: '#d0c8b0',
  // A3: the wild structures between the places
  tower: '#b0a0d8', temple: '#e8dcc0', castle: '#d8b0a0', bandit_camp: '#c86050',
  graveyard: '#9098a8', tomb: '#8a8078', arena: '#d0a870', fountain: '#8fd0e0',
  gate: '#c0b8a0', burned_farm: '#8a6050', watchtower: '#b8a878',
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
/** The dashed outline and the name of a space the editor has made. */
export const SPACE_INK = 'rgba(120,150,190,.55)';
export const SPACE_NAME = 'rgba(186,206,232,.90)';
/** The scale bar under the bottom left corner. */
export const SCALE_INK = '#f2ede2';

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
  megastructure: 'mega structure', landmark: 'landmark',
  tower: 'tower', temple: 'temple', castle: 'castle', bandit_camp: 'bandit camp',
  graveyard: 'graveyard', tomb: 'tomb', arena: 'arena', fountain: 'fountain',
  gate: 'gate', burned_farm: 'burned farm', watchtower: 'watchtower',
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
  { id: 'openline', label: 'as far as the road goes', swatch: 'line', colour: OPEN_LINE },
  { id: 'closed', label: 'not open yet', swatch: 'veil', colour: VEIL_COLOUR },
  { id: 'space', label: 'a space you have laid out', swatch: 'dash', colour: SPACE_INK },
  { id: 'guide', label: 'a space of the painted guide', swatch: 'dash', colour: GUIDE_INK },
  { id: 'guideway', label: 'the painted road and lane', swatch: 'line', colour: GUIDE_ROAD_INK },
  { id: 'guideriver', label: 'the painted river', swatch: 'line', colour: GUIDE_RIVER_INK },
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

/**
 * The line the map draws round the open country and the line release.js keeps
 * are one line, measured on the ground at import. See `auditOpenDiscs` below.
 */
export const OPEN_AUDIT = auditOpenDiscs();

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

// ------------------------------------------------------------- the view ----
//
// A view is three numbers, `{ cx, cz, span }`, and every one of the functions
// below is pure and returns a new one. The panel holds ONE of these and hands
// it to the draw, to the click and to the column, so there is no second copy of
// the arithmetic to drift: what a pixel means is `toWorld` with this view's own
// centre and span, at every zoom, in the draw and in the click alike.

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** The span, held between the closest zoom and the whole world. */
export const clampSpan = (s) => clamp(Number.isFinite(s) ? s : HOME_SPAN, MAP_MIN_SPAN, MAP_MAX_SPAN);

/**
 * A view with its span held and its centre kept inside the world, so no amount
 * of dragging can leave the player looking at a rectangle of nothing.
 */
export function clampView(v) {
  return {
    cx: clamp(Number.isFinite(v?.cx) ? v.cx : 0, -WORLD_HALF, WORLD_HALF),
    cz: clamp(Number.isFinite(v?.cz) ? v.cz : 0, -WORLD_HALF, WORLD_HALF),
    span: clampSpan(v?.span),
  };
}

/** Where the map opens: the Greenwold's own centre, HOME_SPAN across. */
export function homeView() {
  const zn = ZONE.greenwold;
  return clampView({ cx: zn.x, cz: zn.z, span: HOME_SPAN });
}

/**
 * Zoom by `factor`, holding the world point under (px, py) where it is.
 *
 * That is the whole of what "zoom on the cursor" means, and it is one line of
 * algebra: the new centre is the world point under the cursor, less the offset
 * from the middle the cursor stands at, in the NEW span. The clamp can still
 * move the centre at the world's edge, which is why the test drives it both in
 * the middle of the world, where the point does not move at all, and at the
 * rim, where it does and the view stays inside the world.
 */
export function zoomView(view, factor, px, py, size) {
  const v = clampView(view);
  const span = clampSpan(v.span * (Number.isFinite(factor) && factor > 0 ? factor : 1));
  const [wx, wz] = toWorld(px, py, v.cx, v.cz, size, v.span);
  return clampView({ cx: wx - (px / size - 0.5) * span, cz: wz - (py / size - 0.5) * span, span });
}

/** Zoom about the middle of the map, which is what the plus and minus keys do. */
export const zoomCentre = (view, factor, size) => zoomView(view, factor, size / 2, size / 2, size);

/** Drag: the ground follows the pointer, so the centre goes the other way. */
export function panView(view, dpx, dpy, size) {
  const v = clampView(view);
  const per = v.span / (size || 1);
  return clampView({ cx: v.cx - dpx * per, cz: v.cz - dpy * per, span: v.span });
}

/**
 * How finely the ground is sampled at this span. See MAP_SAMPLES_NEAR: this
 * interpolates in the LOG of the span, because the zoom itself is multiplicative
 * and a linear ramp would spend nearly all of its range on the outer half.
 */
export function samplesFor(span) {
  const s = clampSpan(span);
  const t = clamp(Math.log(s / MAP_MIN_SPAN) / Math.log(MAP_MAX_SPAN / MAP_MIN_SPAN), 0, 1);
  return Math.round(MAP_SAMPLES_NEAR + (MAP_SAMPLES_FAR - MAP_SAMPLES_NEAR) * t);
}

/** The span in the words the footer and the window's own title use. */
export function spanText(span) {
  const s = clampSpan(span);
  if (s < 1000) return `${Math.round(s)} m across`;
  const km = s / 1000;
  return `${km >= 10 ? km.toFixed(0) : km.toFixed(1)} km across`;
}

/** The rungs a scale bar is allowed to land on, in metres. */
export const SCALE_STEPS = [50, 100, 200, 250, 500, 1000, 2000, 2500, 5000];

/**
 * The scale bar: the longest round distance that fits in a third of the map,
 * how many pixels it is, and what to write under it. Pure, so the bar and the
 * footer cannot disagree about how wide a kilometre is.
 */
export function scaleBarFor(span, size) {
  const s = clampSpan(span);
  const want = s / 3;
  let metres = SCALE_STEPS[0];
  for (const step of SCALE_STEPS) if (step <= want) metres = step;
  return {
    metres,
    px: (metres / s) * size,
    label: metres >= 1000 ? `${metres / 1000} km` : `${metres} m`,
  };
}

// ---------------------------------------------------------- what is open ---
//
// The release gate (`src/mmo/release.js`) says which realms a player may stand
// in, and it is ONE list. The map reads that list rather than naming the
// Greenwold, so the day a second realm opens it comes back on this map on its
// own, with its name, its places and its rows, and nobody has to remember this
// file exists.

/** The realm a zone belongs to: itself, if it is one of the nine. */
export const realmOf = (zn) => (zn && zn.parent ? zn.parent : zn && zn.id) || null;
/** Whether the gate has opened the realm this zone stands in. */
export const zoneOpen = (zn) => isOpen(realmOf(zn));

/**
 * The discs the veil is cut out of: every open realm, out to the same reach
 * `release.openAt` calls open ground. Drawing a different circle from the one
 * the gate enforces would put a line on the map where there is none underfoot.
 */
export function openDiscs() {
  return OPEN_REALMS.map((id) => ZONE[id]).filter(Boolean)
    .map((zn) => ({ id: zn.id, name: zn.name, x: zn.x, z: zn.z, r: zn.r + (zn.edge || 0) * 0.5 }));
}

/** Is this point on open ground? release.js owns the answer. */
export const onOpenGround = (x, z) => openAt(x, z);

/**
 * The circle this file draws is the line release.js enforces, measured on the
 * ground rather than inferred from the radii, in BOTH directions: a metre
 * inside every disc is open and a metre outside every disc, and away from the
 * others, is not.
 */
export function auditOpenDiscs() {
  const bad = [];
  const discs = openDiscs();
  if (!discs.length) bad.push('the release gate opens no realm at all, so the whole map would be veiled');
  for (const d of discs) {
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
      const inx = d.x + Math.cos(a) * (d.r - 1), inz = d.z + Math.sin(a) * (d.r - 1);
      if (!openAt(inx, inz)) bad.push(`${d.id}: the map draws ${Math.round(inx)},${Math.round(inz)} inside its line and release.js calls it closed`);
      const ox = d.x + Math.cos(a) * (d.r + 1), oz = d.z + Math.sin(a) * (d.r + 1);
      if (openAt(ox, oz) && !discs.some((o) => o !== d && Math.hypot(ox - o.x, oz - o.z) <= o.r)) {
        bad.push(`${d.id}: the map draws ${Math.round(ox)},${Math.round(oz)} outside its line and release.js calls it open`);
      }
    }
  }
  if (bad.length) throw new Error(`auditOpenDiscs: ${bad.length} problem(s)\n  ${bad.slice(0, 6).join('\n  ')}`);
  return { discs: discs.length, realms: OPEN_REALMS.length };
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
  const openOnly = opts.openOnly !== false;
  const hasZone = asHas(opts.zonesFound);

  let best = null, bestD = PICK_PX;
  for (const s of foundPlaces({ field, cx, cz, span, discovered: opts.discovered, openOnly })) {
    const [sx, sy] = toPixel(s.x, s.z, cx, cz, size, span);
    const d = Math.hypot(sx - px, sy - py);
    if (d <= bestD) { bestD = d; best = { kind: 'site', id: s.id, name: s.name, x: s.x, z: s.z }; }
  }
  if (best) return best;

  const [wx, wz] = toWorld(px, py, cx, cz, size, span);
  const hit = zoneAt(wx, wz);
  // a realm the gate has not opened is unnamed on the map and unclickable on
  // it, which is the same rule the veil draws: nothing on this map offers a
  // player a mark on ground they will be turned back from
  if (hit && hasZone(hit.zone.id) && (!openOnly || zoneOpen(hit.zone))) {
    return { kind: 'zone', id: hit.zone.id, name: hit.zone.name, x: hit.zone.x, z: hit.zone.z };
  }
  return null;
}

/**
 * The guide space under a pixel, or null.
 *
 * Pure, and the same arithmetic the draw uses, so what the cursor picks is what
 * the outline under it says. The slack is GUIDE_PICK_PX of SCREEN, turned into
 * metres by the view's own scale, so a space that is eight pixels across at 16
 * km is still hoverable and a space that is half the picture at 1 km does not
 * grow a fifty metre skirt.
 */
export function pickGuideAt(px, py, opts = {}) {
  const { cx = 0, cz = 0, size = 640 } = opts;
  const span = opts.span ?? MAP_SPAN;
  const [wx, wz] = toWorld(px, py, cx, cz, size, span);
  return guideZoneAt(wx, wz, GUIDE_PICK_PX * (span / size));
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
  const openOnly = opts.openOnly !== false;
  const has = asHas(opts.discovered);
  const out = [];
  if (!field) return out;
  for (const [ccx, ccz] of cellsIn(cx, cz, span)) {
    const s = field.siteInCell(ccx, ccz);
    if (!s || !has(s.id)) continue;
    // "no names and no places" outside the open realms. `homeKnown` already
    // keeps the first morning's places to the open realm, but a rolled place
    // walked to before the gate existed would still be in the character's own
    // list, so the rule is enforced here as well as there.
    if (openOnly && !onOpenGround(s.x, s.z)) continue;
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
  const openOnly = opts.openOnly !== false;
  // Where you STAND and what is ON THE MAP are two different rectangles now.
  // Every distance and every bearing below is from the player, because that is
  // what a way to a place means; the list of places is what the VIEW covers,
  // because a list of places that are not on the picture beside it is a list
  // about somewhere else. Panning the map to Hearthhome lists Hearthhome's
  // places, and still says how far each of them is from where you are standing.
  const view = clampView(opts.view || { cx, cz, span: opts.span ?? MAP_SPAN });
  const span = view.span;
  const foundZone = asHas(opts.zonesFound);

  // where you stand. Half inside is what discovery calls being in a zone, so
  // the header and the arrival banner agree about which country this is.
  const hit = field?.sculpt ? {zone:authoredZoneAt(cx,cz),weight:1} : zoneAt(cx, cz);
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
  const places = foundPlaces({ field, cx: view.cx, cz: view.cz, span, discovered: opts.discovered, openOnly })
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
  //
  // And only the OPEN realms have rows at all. A hundred and four rows, of
  // which a hundred and three said "unwalked" and could not be walked to, was a
  // list about a game that does not exist yet; the rule is the release gate's,
  // so the rows come back on their own when a realm opens.
  const regions = ZONES.filter((zn) => !openOnly || zoneOpen(zn)).map((zn) => {
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
    .filter((m) => !openOnly || onOpenGround(m.x, m.z))
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

  // what the editor has authored inside the view, when the view is close
  // enough to write a name on one. The same list and the same threshold the
  // draw uses, so the picture and the column cannot disagree about how many
  // spaces there are.
  const spaces = span <= SPACE_SPAN
    ? spacesIn({ x: view.cx, z: view.cz, w: span, h: span })
      .filter(sp=>opts.editor||isDestination(sp))
      .map((sp) => ({ ...sp, ...wayRow(sp.x, sp.z, cx, cz) }))
      .sort(byDist)
    : [];

  // The guide: the twelve painted spaces, nearest first, and whichever one the
  // cursor is over. The hovered one carries its line and its models, which is
  // the whole reason the guide is on the map: it is the answer to "what do I
  // put here". `art` is what the picture is doing, so the column can say the
  // painting is missing and where it goes rather than looking simply empty.
  const art = opts.guideArt !== undefined ? opts.guideArt : guideArt();
  const hoverId = opts.guideHover || null;
  const guide = {
    art: { state: art ? art.state : 'idle', url: GUIDE_ART.url, file: GUIDE_ART.file, missing: GUIDE_ART.missing },
    layer: layerFor(opts.layers, art && art.state),
    want: LAYERS.includes(opts.layers) ? opts.layers : 'both',
    zones: GUIDE_ZONES.map((g) => ({
      id: g.id, name: g.name, line: g.line, landmark: g.landmark,
      r: g.r, annulus: g.annulus,
      models: g.models.slice(), wanted: g.wanted.slice(),
      hover: g.id === hoverId,
      ...wayRow(g.x, g.z, cx, cz),
    })).sort(byDist),
  };
  guide.hover = guide.zones.find((g) => g.hover) || null;

  return {
    here,
    town,
    waypoint,
    view,
    span,
    guide,
    spanText: spanText(span),
    regions,
    walked: regions.filter((r) => r.known).length,
    places,
    spaces,
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
 * @param opts   { field, cx, cz, span, size, yaw, player, discovered, zonesFound,
 *                 waypoint, events, paintCache, roads, zones, spaces, openOnly }
 * @returns      { ms, span, samples, stride, sites, roads, zones, named, faded,
 *                 spaces, marks, scale }
 */
export function drawMap(g2d, opts) {
  const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const { field, cx = 0, cz = 0, size = 640, yaw = 0 } = opts;
  const span = opts.span ?? MAP_SPAN;
  const n = opts.samples ?? samplesFor(span);
  const stride = span / n;
  const openOnly = opts.openOnly !== false;
  const at = (x, z) => toPixel(x, z, cx, cz, size, span);
  // WHERE YOU ARE IS NOT THE MIDDLE OF THE MAP ANY MORE. The view has a centre
  // of its own that a drag moves, so the arrow is drawn at the player's own
  // world point and goes off the edge of the picture when the map is panned
  // away from them, which is the honest thing for it to do.
  const you = Number.isFinite(opts.player?.x) && Number.isFinite(opts.player?.z)
    ? opts.player : { x: cx, z: cz };

  g2d.save();

  // 0. THE PAINTING. The user's own sheet, laid down through the guide's frame
  // so the picture and the world agree at every zoom: the arrow stands on the
  // painted village when the player stands in the village. It goes UNDER
  // everything, and when it is not there `layerFor` falls back to the terrain
  // and the footer says where to put the file.
  // The painting and the twelve are the GREENWOLD's. Another sculpt world (the
  // island) draws its own terrain and none of the guide, or the village would
  // be painted over the sea.
  const guideWorld = worldOf(opts.field) === 'greenwold';
  const art = !guideWorld ? null : opts.guideArt !== undefined ? opts.guideArt : guideArt();
  const layer = layerFor(opts.layers, art && art.state);
  const guide = { layer, art: art ? art.state : 'idle', drawn: 0, zones: 0, named: 0, rings: 0, ways: 0 };
  if (layer !== 'terrain') {
    // AN OPAQUE BACKDROP FIRST, always. The sheet does not cover the whole
    // canvas at every zoom, and neither `painting` (which paints no ground at
    // all) nor `both` (which paints it at a third) lays down anything opaque
    // outside it. Without this, the country beyond the painting's edge is the
    // LAST frame with a third of this one over it, and it darkens on every
    // repaint until it is black.
    g2d.fillStyle = `rgb(${PAPER[0]},${PAPER[1]},${PAPER[2]})`;
    g2d.fillRect(0, 0, size, size);
    guide.drawn = paintGuideArt(g2d, { art, at, w: size, h: size }).drawn;
  }

  // 1. the ground, painted. map_paint.js reads the same field on the same grid
  // and lays it down as a chart: parchment, coast, rivers, relief, forest,
  // roads, and a soft border round each realm. It reads the same discovery this
  // panel does, so unwalked country comes back as blank hatched paper.
  // docs/mmo/wiring/M4.md and MAP2-ZOOM.md. `names: false` because the zone loop
  // below already writes every name this panel is willing to say, and each of
  // those is a click target. The cache is the panel's own, and its key carries
  // the terrain stroke list's version, so a repaint costs the marks and nothing
  // else UNTIL the ground itself moves under the brush, and then it costs the
  // field again, which is the point.
  //
  // At `both` the whole of it is laid down at GUIDE_TERRAIN_ALPHA, so the
  // sculpted ground reads as relief over the painting rather than replacing it.
  // At `painting` the field is not read at all, which is also the cheapest the
  // map ever is.
  let ground = { cached: true, msField: 0, samples: 0, rivers: 0, roads: 0, peaks: 0 };
  if (layer !== 'painting') {
    if (layer === 'both') g2d.globalAlpha = GUIDE_TERRAIN_ALPHA;
    ground = paintGround(g2d, {
      field, x: cx, z: cz, w: span, h: span, px: size, py: size,
      known: { zones: opts.zonesFound, places: opts.discovered },
      cache: opts.paintCache, samples: n, names: false, rolled: false,
    });
    if (layer === 'both') g2d.globalAlpha = 1;
  }

  // 2. roads, from the polylines roads.js already holds. Under the veil, so a
  // road running out into country the gate has shut fades away with the country.
  let roads = 0;
  if (opts.roads !== false) {
    g2d.strokeStyle = ROAD_COLOUR;
    g2d.lineWidth = Math.max(1, size / 500);
    if(field?.sculpt)for(const road of GREENWOLD_ROUTES){
      g2d.beginPath();road.points.forEach(([x,z],i)=>{const[px,py]=at(x,z);if(i===0)g2d.moveTo(px,py);else g2d.lineTo(px,py);});g2d.stroke();roads++;
    }
    for (const [ccx, ccz] of field?.sculpt ? [] : cellsIn(cx, cz, span)) {
      let list;
      try { list = roadsForCell(field, ccx, ccz); } catch { list = []; }
      for (const road of list) {
        if (!road.pts || road.pts.length < 2) continue;
        roads++;
        g2d.beginPath();
        for (let i = 0; i < road.pts.length; i++) {
          const [px, py] = at(road.pts[i].x, road.pts[i].z);
          if (i === 0) g2d.moveTo(px, py); else g2d.lineTo(px, py);
        }
        g2d.stroke();
      }
    }
  }

  // 3. the veil over everything the release gate has not opened.
  //
  // ONE PATH, filled even odd: the whole canvas, then one circle per open realm
  // wound into it, so the paper lands everywhere except on the ground a player
  // may stand on. That is why it is a fill rule and not a clip: neither a node
  // context nor an SVG writer can be relied on for a clip, and this map is
  // measured through a recorder.
  const discs = openDiscs();
  let veiled = 0;
  if (openOnly && discs.length) {
    g2d.beginPath();
    g2d.rect(0, 0, size, size);
    for (const d of discs) {
      const [dx, dy] = at(d.x, d.z);
      const rpx = (d.r / span) * size;
      g2d.moveTo(dx + rpx, dy);
      g2d.arc(dx, dy, rpx, 0, Math.PI * 2);
      veiled++;
    }
    g2d.fillStyle = VEIL_COLOUR;
    g2d.fill('evenodd');
  }

  // 4. the world's edge
  {
    const [ex, ey] = at(0, 0);
    const rpx = (WORLD_HALF / span) * size;
    g2d.strokeStyle = EDGE_COLOUR;
    g2d.lineWidth = 1;
    g2d.beginPath();
    g2d.arc(ex, ey, rpx, 0, Math.PI * 2);
    g2d.stroke();
  }

  // 5. the zones
  const foundZone = asHas(opts.zonesFound);
  let zonesDrawn = 0, named = 0, faded = 0;
  if (opts.zones !== false) {
    for (const zn of ZONES) {
      const [zx, zy] = at(zn.x, zn.z);
      const rpx = (zn.r / span) * size;
      if (zx + rpx < 0 || zy + rpx < 0 || zx - rpx > size || zy - rpx > size) continue;
      zonesDrawn++;
      // A realm behind the gate keeps its shape and loses everything else: no
      // tint, no hatch, no name. The veil above has already taken its ground
      // down to FADE_ALPHA, and this rim is drawn at the same weight, so what
      // is left is an outline you can orient by and cannot read.
      if (openOnly && !zoneOpen(zn)) {
        faded++;
        g2d.strokeStyle = `rgba(150,160,175,${FADE_ALPHA})`;
        g2d.lineWidth = 1;
        g2d.beginPath();
        g2d.arc(zx, zy, rpx, 0, Math.PI * 2);
        g2d.stroke();
        continue;
      }
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

  // 6. the line the gate keeps. This is release.openAt drawn, not a decoration:
  // step over it in the world and you are put back inside it.
  if (openOnly) {
    g2d.strokeStyle = OPEN_LINE;
    g2d.lineWidth = 2;
    for (const d of discs) {
      const [dx, dy] = at(d.x, d.z);
      g2d.beginPath();
      g2d.arc(dx, dy, (d.r / span) * size, 0, Math.PI * 2);
      g2d.stroke();
    }
  }

  // 6b. THE GUIDE: the twelve spaces of the painting, their names, and the
  // traced river and roads. This is the half of the map that says WHERE THINGS
  // GO: nothing in the world is built from it, and it is drawn over the ground
  // and under the editor's own spaces so that what has been laid out already
  // sits on top of the plan for it.
  //
  // It is drawn whether or not the painting loaded, because the boundaries and
  // the names are the point and the picture is the backing for them. The ways
  // go under the outlines: a lane is where to paint a lane, not a road.
  if (opts.guide !== false && guideWorld) {
    const ways = paintGuideWays(g2d, { at, scale: Math.max(0.6, size / 640) });
    guide.ways = ways.roads + ways.river;
    const zn = paintGuideZones(g2d, {
      at, mpp: span / size, w: size, h: size, hover: opts.guideHover || null,
      nameSize: 10.5,
    });
    guide.zones = zn.drawn; guide.named = zn.named; guide.rings = zn.rings;
  }

  // 7. what the editor has authored: a dashed square for every automatic tile
  // and a dashed circle for every named space, with its name under it. Close in
  // only, because at 8 km these are specks and the names are a wall of ink.
  let spaces = 0;
  if (opts.spaces !== false && span <= SPACE_SPAN) {
    for (const sp of spacesIn({ x: cx, z: cz, w: span, h: span })) {
      if (!opts.editor && !isDestination(sp)) continue;
      const [sx, sy] = at(sp.x, sp.z);
      g2d.setLineDash([3, 3]);
      g2d.strokeStyle = SPACE_INK;
      g2d.lineWidth = 1;
      g2d.beginPath();
      let below;
      if (sp.tile) {
        const w = (sp.w / span) * size;
        g2d.rect(sx - w / 2, sy - w / 2, w, w);
        below = sy + w / 2 + 12;
      } else {
        const r = (sp.r / span) * size;
        g2d.arc(sx, sy, r, 0, Math.PI * 2);
        below = sy + r + 12;
      }
      g2d.stroke();
      g2d.setLineDash([]);
      g2d.font = '10px ui-sans-serif, system-ui, sans-serif';
      g2d.textAlign = 'center';
      g2d.fillStyle = 'rgba(0,0,0,.65)';
      g2d.fillText(sp.name, sx + 1, below + 1);
      g2d.fillStyle = SPACE_NAME;
      g2d.fillText(sp.name, sx, below);
      spaces++;
    }
  }

  // 8. sites the character has found, named
  // `discovered` is a list, a Set, or anything with `has`: the character
  // document keeps an array and sites.js keeps a Set behind a `has`. The list
  // is `foundPlaces`, which is what the column beside the map lists, so the
  // count in the footer and the rows under PLACES FOUND are one answer.
  const sites = foundPlaces({ field, cx, cz, span, discovered: opts.discovered, openOnly });
  for (const s of sites) {
    const [px, py] = at(s.x, s.z);
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

  // 9. what is happening right now, and who is walking about.
  //
  // These are drawn OVER the places and UNDER the waypoint, because an event is
  // news and a mark is yours. An event's ring is its own radius, so the Bone
  // Wind is a small circle crossing the Boneyard and the Blossom Fall is the
  // whole of the Verdant Deep, which is what each of them actually is. One in
  // country the gate has shut is dropped with the rest of that country: a name
  // on grey paper for a fight nobody can walk to is worse than a blank.
  const marks = eventMarks(opts.events).filter((m) => !openOnly || onOpenGround(m.x, m.z));
  for (const m of marks) {
    const [px, py] = at(m.x, m.z);
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

  // 10. the waypoint
  const wp = opts.waypoint;
  if (wp && Number.isFinite(wp.x) && Number.isFinite(wp.z)) {
    const [px, py] = at(wp.x, wp.z);
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

  // 11. you, pointing where you are facing, at your OWN place on the map.
  //
  // The map is +x right and +z DOWN, so canvas up is world -z. player.js says
  // forward is (sin yaw, cos yaw), so at yaw 0 the player faces +z, which is
  // DOWN this map. The arrow is drawn tip up, so it needs rotating by PI - yaw:
  // canvas rotate(a) takes (0, -8) to (8 sin a, -8 cos a), and that equals the
  // forward direction (8 sin yaw, 8 cos yaw) exactly when a = PI - yaw. The old
  // code rotated by -yaw, which pointed the arrow the opposite way at every
  // heading; `win_map.test.mjs` now drives all four cardinals against it.
  const [px, py] = at(you.x, you.z);
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

  // 12. the scale bar. The map has a zoom now, so a distance on it is no longer
  // a number a player can carry in their head from one look to the next, and a
  // picture that does not say its own scale is a picture of nowhere in
  // particular. `scaleBarFor` is the same call the footer's words come out of.
  const bar = scaleBarFor(span, size);
  {
    const bx = 14, by = size - 16;
    const rule = () => {
      g2d.beginPath();
      g2d.moveTo(bx, by); g2d.lineTo(bx + bar.px, by);
      g2d.moveTo(bx, by - 4); g2d.lineTo(bx, by + 4);
      g2d.moveTo(bx + bar.px, by - 4); g2d.lineTo(bx + bar.px, by + 4);
      g2d.stroke();
    };
    g2d.strokeStyle = 'rgba(20,16,10,.75)';
    g2d.lineWidth = 3.4;
    rule();
    g2d.strokeStyle = SCALE_INK;
    g2d.lineWidth = 1.3;
    rule();
    g2d.font = '600 11px ui-sans-serif, system-ui, sans-serif';
    g2d.textAlign = 'left';
    g2d.fillStyle = 'rgba(0,0,0,.75)';
    g2d.fillText(bar.label, bx + 1, by - 8 + 1);
    g2d.fillStyle = SCALE_INK;
    g2d.fillText(bar.label, bx, by - 8);
  }

  g2d.restore();

  const ms = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
  return {
    // At `painting` the field is not read at all, so the count is nought and
    // says so: a stat that reported the samples it WOULD have taken would hide
    // the one thing that layer is for.
    ms, span, samples: layer === 'painting' ? 0 : n * n, perSide: n, stride,
    // straight off the painter, so a test asking whether the ground was
    // re-sampled is reading the painter's own answer and not a second guess
    cached: ground.cached, msField: ground.msField,
    sites: sites.length, roads, zones: zonesDrawn, named, faded, veiled, spaces,
    marks: marks.length, scale: bar, player: { x: you.x, z: you.z },
    guide,
  };
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
.bw-win-map canvas{display:block;width:100%;height:auto;border-radius:8px;border:1px solid ${theme.goldDim}66;background:#0d1014;cursor:crosshair;touch-action:none}
.bw-win-map canvas.dragging{cursor:grabbing}
.bw-win-map .bw-map-tools{
  display:flex;align-items:center;gap:6px;margin-top:8px;flex-wrap:wrap;
}
.bw-win-map .bw-map-tools .bw-btn{padding:3px 9px;font-size:12px;}
.bw-win-map .bw-map-tools .zoomnow{
  font-family:${theme.fonts.display};font-size:11px;letter-spacing:.1em;
  font-variant-caps:small-caps;color:${theme.gold};margin-left:2px;
  font-variant-numeric:tabular-nums;
}
.bw-win-map .bw-map-foot{
  display:flex;justify-content:space-between;gap:10px;margin-top:8px;
  font-family:${theme.fonts.display};font-size:11px;letter-spacing:.1em;
  font-variant-caps:small-caps;color:${theme.gold};
  font-variant-numeric:tabular-nums;
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
  font-variant-caps:small-caps;color:${theme.gold};margin-top:1px;
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
  font-variant-caps:small-caps;color:${theme.parchmentFaint};
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

.bw-win-map .bw-map-guide{
  border-left:2px solid ${theme.gold}88;padding:4px 0 4px 9px;margin:4px 0 8px;
}
.bw-win-map .bw-map-guide .gn{
  font-family:${theme.fonts.display};font-size:15px;font-weight:700;letter-spacing:.06em;
  color:${theme.goldBright};
}
.bw-win-map .bw-map-guide .gl{
  font-size:13.5px;font-style:italic;line-height:1.45;color:${theme.parchmentDim};margin-top:3px;
}
.bw-win-map .bw-map-guide .gk{
  font-family:${theme.fonts.display};font-size:10px;letter-spacing:.2em;
  font-variant-caps:small-caps;color:${theme.gold};margin-top:7px;
}
.bw-win-map .bw-map-guide .gm{
  font-size:12.5px;line-height:1.5;color:${theme.parchment};
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-word;
}
.bw-win-map .bw-map-guide .gw{font-size:12.5px;font-style:italic;color:${theme.parchmentFaint};}
.bw-win-map .bw-map-row.guide.hot{background:rgba(201,164,74,.16);}

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
.bw-win-map .bw-map-key .sw.veil{border-color:rgba(120,110,90,.6);}
.bw-win-map .bw-map-key .sw.dash{
  background:none;border:1px dashed ${SPACE_INK};
}
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
/**
 * What the map counts as found: what the character has walked to, PLUS the
 * authored places of the open realm, on the map from the first morning. A
 * character was born in Hearthhome and every villager knows where the Chalk
 * Pits and the Old Cellars are. Rolled places (a hamlet the world made up)
 * still have to be walked to, and so does every place in a realm the release
 * gate keeps shut. `foundPlaces` and `pickAt` stay pure: they ask has(id).
 */
let homeKnownIds = null;
export function homeKnown() {
  if (!homeKnownIds) homeKnownIds = new Set(authoredSites().filter((s) => openAt(s.x, s.z)).map((s) => s.id));
  return homeKnownIds;
}
export function knownOf(discovered) {
  const has = asHas(discovered);
  const home = homeKnown();
  return { has: (id) => has(id) || home.has(id) };
}
function discoveredOf(ctx) { return knownOf(ctx?.character?.discovered || ctx?.runtime?.discovery || []); }
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
  // Declared so windows.js stops the world acting on them while the map is up.
  // Zooming the map must not also be a keypress the game underneath answers.
  keys: ['+', '=', '-', '_', '0'],

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
    this._view = this.viewNow();

    const cols = el('div', 'bw-map-cols');
    const left = el('div', 'bw-map-left');
    const wrap = el('div', 'bw-map-wrap');
    this._canvas = document.createElement('canvas');
    this._paintCache = makeCache();   // the painted ground survives between redraws (M4)
    this._canvas.width = 640;
    this._canvas.height = 640;
    this._canvas.title = 'Wheel to zoom on the cursor, drag to move the map, click a place or a region to set your mark. Plus and minus zoom, 0 goes back to the Greenwold.';
    this._canvas.addEventListener('click', (e) => this.clickAt(e));
    this._canvas.addEventListener('wheel', (e) => this.wheelAt(e));
    this._canvas.addEventListener('pointerdown', (e) => this.dragStart(e));
    this._canvas.addEventListener('pointermove', (e) => this.dragMove(e));
    this._canvas.addEventListener('pointerup', (e) => this.dragEnd(e));
    this._canvas.addEventListener('pointercancel', (e) => this.dragEnd(e));
    this._canvas.addEventListener('pointerleave', (e) => this.dragEnd(e));
    // The hover is what tells the user what goes in a space, so it is a real
    // listener and not a tooltip: it lands in `_guideHover`, and the map and
    // the column are redrawn ONLY when the space under the cursor CHANGES. A
    // repaint on every pointermove would be a whole map behind every pixel.
    this._canvas.addEventListener('pointermove', (e) => this.hoverAt(e));
    this._canvas.addEventListener('pointerleave', () => this.setHover(null));
    wrap.appendChild(this._canvas);

    // The controls, and every one of them says on hover what it will do and
    // what it will leave alone. A button whose only label is a glyph is a
    // button a player has to press to find out about.
    this._tools = el('div', 'bw-map-tools');
    const tool = (label, title, fn) => {
      const b = el('button', 'bw-btn', label);
      b.title = title;
      b.addEventListener('click', fn);
      this._tools.appendChild(b);
      return b;
    };
    tool('you', 'Put the map back over where you are standing. The zoom does not change.', () => this.goToPlayer());
    tool('-', 'Zoom out one step, about the middle of the map. The minus key does the same.', () => this.zoomBy(ZOOM_RATE));
    tool('+', 'Zoom in one step, about the middle of the map. The plus key does the same.', () => this.zoomBy(1 / ZOOM_RATE));
    tool('the Greenwold', `Back to where the map opens: the Greenwold, ${spanText(HOME_SPAN)}. The 0 key does the same.`, () => this.goHome());
    tool('the whole world', `The whole of Kaldera at once, ${spanText(MAP_MAX_SPAN)}, ocean and all.`, () => this.setView({ ...this._view, span: MAP_MAX_SPAN }, 'The whole world.'));
    // The ground under the guide: the painting, the terrain, or both. One
    // button that cycles, and it says on hover what all three of them are and
    // what it will do next, because a button whose label is its current state
    // is a button nobody knows the effect of.
    this._layers = 'both';
    this._layerBtn = tool('ground', '', () => this.cycleLayers());
    this._zoomNow = el('span', 'zoomnow');
    this._zoomNow.title = 'How much of the world the picture above is showing. The bar in its corner is the same measure.';
    this._tools.appendChild(this._zoomNow);

    this._foot = el('div', 'bw-map-foot');
    this._say = el('div', 'bw-map-say');
    left.appendChild(wrap);
    left.appendChild(this._tools);
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
    this._guideHover = null;
    // Ask for the painting once. When it lands, or when it is found not to be
    // there, the map is drawn again, so a picture that arrives after the panel
    // is open still becomes the ground without the user touching anything.
    if (!this._artWatch) {
      this._artWatch = onGuideArt(() => { this.redraw(); });
      loadGuideArt();
    }
    // Opening the map puts it back over the player. A view left where a drag
    // left it three windows ago is a map of somewhere the player has walked
    // away from, and the first thing anybody wants of a map is where they are.
    this._view = this.viewNow();
    this._terrain = null;
    // with no world loaded yet the draw bows out, and the column still has to
    // say something rather than leaving the half of the page it owns black
    if (this.redraw() === null) this.render();
  },

  close() { this._drag = null; },

  /** The view this panel is holding, made if it has none yet. */
  viewNow() {
    if (this._view) return this._view;
    const p = playerAt(this._ctx);
    // on the Greenwold, at HOME_SPAN, over the player if the player is in it
    const home = homeView();
    return clampView({ cx: Number.isFinite(p?.x) ? p.x : home.cx, cz: Number.isFinite(p?.z) ? p.z : home.cz, span: HOME_SPAN });
  },

  /** The version the terrain strokes are on, or null when there are none. */
  terrainVersion() {
    const ed = this._ctx?.runtime?.field?.terrainEdits || this._ctx?.runtime?.terrainEdits;
    return ed && Number.isFinite(ed.version) ? ed.version : null;
  },

  /**
   * The frame.
   *
   * TWO CLOCKS, and they are not the same clock. REDRAW_S is the slow one that
   * keeps the arrow and the marks honest while nothing much is happening.
   * REPAINT_S is the fast one, and it only runs when the GROUND HAS MOVED:
   * `terrain_edits.version` steps on every stroke, so a user laying down a
   * ridge sees it arrive on the map within half a second, and a user doing
   * nothing pays for two redraws a minute.
   */
  tick(dt, ctx) {
    if (ctx) this._ctx = ctx;
    this._since += (Number.isFinite(dt) ? dt : 0);
    this.readKeys();
    const v = this.terrainVersion();
    if (v !== null && v !== this._terrain && this._since >= REPAINT_S) {
      this._since = 0;
      this.redraw();
      return;
    }
    if (this._since >= REDRAW_S) { this._since = 0; this.redraw(); }
  },

  /**
   * Plus, minus and 0, off the same input the world reads, so the map answers
   * a key the same frame the world would have. `panel.keys` above is what stops
   * the world answering it too.
   */
  readKeys() {
    const input = this._ctx?.input;
    if (!input || typeof input.pressed !== 'function') return null;
    let did = null;
    if (input.pressed('+') || input.pressed('=')) { input.swallow?.('+'); input.swallow?.('='); did = this.zoomBy(1 / ZOOM_RATE); }
    else if (input.pressed('-') || input.pressed('_')) { input.swallow?.('-'); input.swallow?.('_'); did = this.zoomBy(ZOOM_RATE); }
    else if (input.pressed('0')) { input.swallow?.('0'); did = this.goHome(); }
    return did;
  },

  // ------------------------------------------------------------ the view --

  /**
   * The one way the view is ever written. Every zoom, every pan, every button
   * and every key lands here, so the picture, the click arithmetic, the column
   * and the footer are always reading one set of three numbers, and every one
   * of them says out loud what it did.
   */
  setView(v, say) {
    this._view = clampView(v);
    if (say) this.setSay(say);
    this.redraw();
    return this._view;
  },

  /** Zoom about the middle, which is what the buttons and the keys do. */
  zoomBy(factor) {
    const before = this.viewNow().span;
    const size = this._canvas?.width || 640;
    const v = zoomCentre(this.viewNow(), factor, size);
    if (v.span === before) {
      this.setSay(factor < 1
        ? `As close as the map goes, ${spanText(before)}.`
        : `As far out as the map goes, ${spanText(before)}.`);
      return this._view;
    }
    return this.setView(v, `${spanText(v.span)}.`);
  },

  // -------------------------------------------------------- the guide ----

  /**
   * The space under the pointer. Nothing is redrawn unless the answer has
   * CHANGED, so moving across one space costs one repaint and not sixty.
   */
  hoverAt(ev) {
    if (!this._canvas || this._drag) return this._guideHover || null;
    const [px, py] = this.pixelOf(ev);
    const v = this.viewNow();
    const hit = pickGuideAt(px, py, { cx: v.cx, cz: v.cz, span: v.span, size: this._canvas.width });
    return this.setHover(hit ? hit.id : null);
  },

  /** The one way the hover is ever written, and it says what it found. */
  setHover(id) {
    const was = this._guideHover || null;
    const now = id || null;
    if (was === now) return now;
    this._guideHover = now;
    if (now) {
      const g = GUIDE_ZONES.find((z) => z.id === now);
      if (g) this.setSay(`${g.name}. ${g.line} What goes here is listed on the right.`);
    }
    this.redraw();
    return now;
  },

  /**
   * The ground: the painting, both, or the terrain, round and round. Says which
   * one it landed on, and says so plainly when the painting is not in yet and
   * the answer is the terrain whatever the button was pressed for.
   */
  cycleLayers() {
    const art = guideArt();
    const i = LAYERS.indexOf(this._layers);
    const want = LAYERS[(i + 1) % LAYERS.length];
    this._layers = want;
    const got = layerFor(want, art.state);
    if (got !== want) this.setSay(`${GUIDE_ART.missing}`);
    else this.setSay(`The ground is ${LAYER_WORD[got]}.`);
    this.redraw();
    return got;
  },

  /** What the ground button says and what it promises. Both, in one place. */
  layerLabel() {
    const got = layerFor(this._layers, guideArt().state);
    const next = LAYERS[(LAYERS.indexOf(this._layers) + 1) % LAYERS.length];
    return {
      label: `ground: ${LAYER_WORD[got]}`,
      title: `${LAYER_TITLE[got]} Press to show ${LAYER_WORD[next]}.`
        + (guideArt().state === 'ready' ? '' : ` ${GUIDE_ART.missing}`),
    };
  },

  /** Put the map back over the player without changing how much it shows. */
  goToPlayer() {
    const p = playerAt(this._ctx);
    const v = this.viewNow();
    return this.setView({ cx: p.x, cz: p.z, span: v.span },
      `The map is over you again, ${spanText(v.span)}.`);
  },

  /** Back to where the map opens. */
  goHome() {
    const v = homeView();
    return this.setView(v, `${ZONE.greenwold.name}, ${spanText(v.span)}.`);
  },

  /** The pixel a pointer event landed on, in the canvas's own pixels. */
  pixelOf(ev) {
    const c = this._canvas;
    if (!c) return [0, 0];
    const rect = c.getBoundingClientRect
      ? c.getBoundingClientRect()
      : { left: 0, top: 0, width: c.width, height: c.height };
    const scale = c.width / (rect.width || c.width);
    return [((ev?.clientX ?? 0) - rect.left) * scale, ((ev?.clientY ?? 0) - rect.top) * scale];
  },

  /**
   * The wheel: one notch is one ZOOM_RATE, about the point under the cursor.
   * A trackpad sends many small deltas, so the sign is what is read and not the
   * size: every event is one step, which is the only way a wheel and a trackpad
   * feel like the same control.
   */
  wheelAt(ev) {
    if (!this._canvas) return null;
    ev?.preventDefault?.();
    const dy = Number.isFinite(ev?.deltaY) ? ev.deltaY : 0;
    if (!dy) return null;
    const [px, py] = this.pixelOf(ev);
    const v = zoomView(this.viewNow(), dy > 0 ? ZOOM_RATE : 1 / ZOOM_RATE, px, py, this._canvas.width);
    if (v.span === this.viewNow().span && v.cx === this.viewNow().cx && v.cz === this.viewNow().cz) {
      this.setSay(dy > 0 ? `As far out as the map goes, ${spanText(v.span)}.` : `As close as the map goes, ${spanText(v.span)}.`);
      return this._view;
    }
    return this.setView(v, `${spanText(v.span)}.`);
  },

  /** A press. Nothing moves yet: it is still a click until it has travelled. */
  dragStart(ev) {
    const [px, py] = this.pixelOf(ev);
    this._drag = { px, py, moved: 0, view: this.viewNow() };
    if (ev && this._canvas?.setPointerCapture && Number.isFinite(ev.pointerId)) {
      try { this._canvas.setPointerCapture(ev.pointerId); } catch { /* not every pointer can be captured */ }
    }
    return this._drag;
  },

  dragMove(ev) {
    const d = this._drag;
    if (!d || !this._canvas) return null;
    const [px, py] = this.pixelOf(ev);
    d.moved = Math.max(d.moved, Math.hypot(px - d.px, py - d.py));
    if (d.moved < DRAG_PX) return null;
    this._canvas.classList?.add('dragging');
    // panned from the view the press STARTED in, so a slow drag does not
    // accelerate: the ground under the finger stays under the finger
    this._view = panView(d.view, px - d.px, py - d.py, this._canvas.width);
    const t = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    if (t - (this._paintedAt || 0) >= DRAG_PAINT_MS) {
      this._paintedAt = t;
      d.pending = false;
      this.redraw();
    } else {
      d.pending = true;         // caught by dragEnd, so the last move is drawn
    }
    return this._view;
  },

  dragEnd(ev) {
    const d = this._drag;
    this._drag = null;
    this._canvas?.classList?.remove('dragging');
    if (ev && this._canvas?.releasePointerCapture && Number.isFinite(ev.pointerId)) {
      try { this._canvas.releasePointerCapture(ev.pointerId); } catch { /* nothing was captured */ }
    }
    if (d && d.moved >= DRAG_PX) {
      // whatever the throttle above skipped is drawn now, so the picture left
      // on the screen is where the drag ended and not one move short of it
      if (d.pending) { this._paintedAt = 0; this.redraw(); }
      // a pan is a real change and owes the player words, same as everything
      // else on this page. The click that follows it is not a click.
      this._dragged = true;
      this.setSay(`The map moved. ${spanText(this._view.span)}, the "you" button brings it back.`);
    }
    return d;
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
    // A drag ends in a click event on every browser there is. One that moved
    // the map is not a click on a place, and setting a waypoint under the
    // finger that just panned the map would be a mark nobody asked for.
    if (this._dragged) { this._dragged = false; return null; }
    const [px, py] = this.pixelOf(ev);
    const v = this.viewNow();
    const hit = pickAt(px, py, {
      field, cx: v.cx, cz: v.cz, span: v.span, size: this._canvas.width,
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
    const v = this.viewNow();
    const res = drawMap(g2d, {
      field,
      cx: v.cx, cz: v.cz, span: v.span,
      player: { x: p.x, z: p.z },
      size: this._canvas.width,
      paintCache: this._paintCache,
      yaw: ctx?.player?.yaw ?? 0,
      discovered: discoveredOf(ctx),
      zonesFound: zonesFoundOf(ctx),
      waypoint: ctx?.character?.waypoint || null,
      events: marksOf(ctx),
      layers: this._layers,
      guideHover: this._guideHover || null,
      editor: !!ctx?.dev?.on,
    });
    this._last = res;
    // remembered AFTER the draw, so a stroke laid down between the two is
    // caught on the next tick rather than being counted as already painted
    this._terrain = this.terrainVersion();
    const model = this.render();
    if (this._zoomNow) this._zoomNow.textContent = spanText(v.span);
    if (this._layerBtn) {
      const lab = this.layerLabel();
      this._layerBtn.textContent = lab.label;
      this._layerBtn.title = lab.title;
    }
    if (this._foot) {
      this._foot.textContent = '';
      const rows = model ? model.regions.length : 0;
      // The painting is either the ground or it is not there, and a footer that
      // said nothing about it would leave the user guessing whether the file
      // was in the wrong place or the map was ignoring it.
      const art = res.guide ? res.guide.art : 'idle';
      const zones = res.guide ? res.guide.zones : 0;
      const left = el('span', null,
        `${spanText(v.span)}, ${Math.round(res.stride)} m a sample, ${zones} guide space${zones === 1 ? '' : 's'}, ${res.sites} place${res.sites === 1 ? '' : 's'} found, ${res.named} of ${rows} regions walked`
        + (art === 'ready' ? '' : `. ${GUIDE_ART.missing}`));
      left.title = art === 'ready'
        ? `The picture above covers ${Math.round(v.span)} m of world and reads the ground every ${Math.round(res.stride)} m. ${res.faded} region${res.faded === 1 ? '' : 's'} behind the release gate are faded out.`
        : `The map is drawing the terrain and the guide outlines over it. Put the painting at ${GUIDE_ART.file} and it becomes the ground at every zoom.`;
      const right = el('span', null, `${Math.round(p.x)}, ${Math.round(p.z)}`);
      right.title = 'Where you are standing, in world metres east and south of the origin.';
      this._foot.appendChild(left);
      this._foot.appendChild(right);
    }
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
      view: this.viewNow(),
      discovered: discoveredOf(ctx),
      zonesFound: zonesFoundOf(ctx),
      waypoint: ctx?.character?.waypoint || null,
      events: marksOf(ctx),
      layers: this._layers,
      guideHover: this._guideHover || null,
      editor: !!ctx?.dev?.on,
    });
    this._model = m;
    const side = this._side;
    side.textContent = '';

    // ---- where you stand ------------------------------------------------
    side.appendChild(el('div', 'bw-hdr', 'Where you stand'));
    const hint = el('div', 'bw-map-hint', 'Click anywhere on the map, or any row below, to set your mark. The compass at the top of the screen points at it. Roll the wheel over the map to zoom, drag to move it about.');
    hint.title = 'The wheel zooms on whatever is under the cursor. Plus and minus zoom about the middle, and 0 goes back to the Greenwold.';
    side.appendChild(hint);

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
    const rHdr = el('div', 'bw-hdr', `Regions, ${m.walked} of ${m.regions.length} walked`);
    rHdr.title = `The regions of the realms that are open. The rest of Kaldera is on the map at ${Math.round(FADE_ALPHA * 100)} percent and has no rows here until it opens.`;
    side.appendChild(rHdr);
    for (const r of m.regions) {
      const row = el('div', `bw-map-row bw-map-region${r.known ? ' pick' : ' off'}${r.here ? ' here' : ''}`);
      row.title = r.known ? `Set your mark on ${r.name}, ${r.way}.` : 'You have not walked into this one yet, so the map does not name it.';
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
      row.title = `Set your mark on ${s.name}, ${s.way}.`;
      row.appendChild(el('span', 'nm', s.name));
      row.appendChild(el('span', 'ds', distanceText(s.dist)));
      row.appendChild(el('span', 'sub', s.kindWord));
      row.appendChild(el('span', 'wy', s.bearing));
      row.dataset.site = s.id;
      row.addEventListener('click', () => this.setWaypoint({ x: s.x, z: s.z, name: s.name }));
      side.appendChild(row);
    }

    // ---- the painted guide ------------------------------------------------
    //
    // THE POINT OF THE WHOLE FEATURE. The map draws twelve boundaries; this is
    // what is inside them. Rest on a space on the picture, or on a row here,
    // and this block says what the space is for, what you walk toward in it,
    // and every model that goes in it, so the user can put objects down
    // without reading the doc in another window.
    const gHdr = el('div', 'bw-hdr', `The painted Greenwold, ${m.guide.zones.length} spaces`);
    gHdr.title = 'The user\'s hand painted map, turned into world metres. These are a GUIDE: nothing in the world is built from them. Rest on one to see what goes in it.';
    side.appendChild(gHdr);
    if (m.guide.art.state !== 'ready') {
      const miss = el('div', 'bw-map-none', m.guide.art.missing);
      miss.title = `The map is drawing the outlines over the terrain until the picture is there. It is loaded from ${m.guide.art.url}.`;
      side.appendChild(miss);
    }
    const gb = el('div', 'bw-map-guide');
    if (m.guide.hover) {
      const h = m.guide.hover;
      gb.appendChild(el('div', 'gn', h.name));
      gb.appendChild(el('div', 'gl', h.line));
      if (h.landmark) gb.appendChild(el('div', 'gl', `You walk toward ${h.landmark}.`));
      gb.appendChild(el('div', 'gl', `${h.way}, ${h.annulus ? `a ring ${Math.round(h.r)} m out from its middle` : `about ${Math.round(h.r)} m across from the middle`}.`));
      gb.appendChild(el('div', 'gk', `What goes here, ${h.models.length} model${h.models.length === 1 ? '' : 's'}`));
      gb.appendChild(el('div', 'gm', h.models.join('  ')));
      if (h.wanted.length) {
        gb.appendChild(el('div', 'gk', 'and these are not models yet'));
        gb.appendChild(el('div', 'gw', h.wanted.join(', ')));
      }
    } else {
      gb.appendChild(el('div', 'gl', 'Rest on a space, on the map or in the list below, and what goes in it is written here.'));
    }
    gb.title = 'What the doc says stands in the space under the cursor.';
    side.appendChild(gb);
    for (const g of m.guide.zones) {
      const row = el('div', `bw-map-row guide pick${g.hover ? ' hot' : ''}`);
      row.title = `${g.line} ${g.models.length} model${g.models.length === 1 ? '' : 's'} go here. Click to set your mark on it.`;
      row.appendChild(el('span', 'nm', g.name));
      row.appendChild(el('span', 'ds', distanceText(g.dist)));
      row.appendChild(el('span', 'sub', g.annulus ? `a ring ${Math.round(g.r)} m out` : `${Math.round(g.r)} m across`));
      row.appendChild(el('span', 'wy', g.bearing));
      row.dataset.guide = g.id;
      row.addEventListener('mouseenter', () => this.setHover(g.id));
      row.addEventListener('click', () => this.setWaypoint({ x: g.x, z: g.z, name: g.name }));
      side.appendChild(row);
    }

    // ---- what you have laid out ------------------------------------------
    //
    // The spaces the editor has written, which is the half of this map that
    // only exists while somebody is building. It appears at SPACE_SPAN and says
    // so when it does not, rather than simply not being there.
    if (m.span <= SPACE_SPAN) {
      const sHdr = el('div', 'bw-hdr', `Spaces here, ${m.spaces.length}`);
      sHdr.title = 'What the editor has laid out inside the picture above. A square is one of its automatic tiles; a circle is a space with a name of its own.';
      side.appendChild(sHdr);
      if (!m.spaces.length) {
        side.appendChild(el('div', 'bw-map-none', 'Nothing is laid out inside this view yet. Put something down with the editor and its tile is outlined here.'));
      }
      for (const sp of m.spaces) {
        const row = el('div', 'bw-map-row bw-map-space pick');
        row.title = `Set your mark on ${sp.name}, ${sp.way}.`;
        row.appendChild(el('span', 'nm', sp.name));
        row.appendChild(el('span', 'ds', distanceText(sp.dist)));
        row.appendChild(el('span', 'sub', sp.tile ? `tile, ${Math.round(sp.w)} m square` : `${Math.round(sp.r)} m across`));
        row.appendChild(el('span', 'wy', sp.bearing));
        row.dataset.space = sp.id;
        row.addEventListener('click', () => this.setWaypoint({ x: sp.x, z: sp.z, name: sp.name }));
        side.appendChild(row);
      }
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
      if (k.swatch === 'hatch' || k.swatch === 'ring' || k.swatch === 'dash') sw.style.borderColor = k.colour;
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
