// The ten modes down the side of the editor, and what is in each one's tray.
//
// PURE. No DOM, no THREE, no fetch. `panel.js` draws what this answers and
// `editor.test.mjs` counts it against `palette.js` both ways, so a species
// added to arbor, a model added to FOOTPRINT or a brush added to
// `terrain_edits.js` lands in a tray with nothing here to keep up to date.
//
// NOTHING IN THIS FILE IS A LIST OF THINGS TO PLACE. Every tile comes out of
// `palette.js`, which is itself a view of the modules that own the things. What
// this file decides is only WHICH TRAY a row goes in, and that decision is made
// off the brush's own row, in this order:
//
//   a brush that paints a word           is the Paint tray
//   a brush that says it erases          is the Erase tray (ED5)
//   a brush the terrain half calls water  is the Water tray (ED4)
//   a brush with a `floor` knob          is the Water tray
//   a brush named in BRUSH_MODE          is whatever that says (ED5: erase)
//   every other brush                    is the Sculpt tray
//
// The fall through is deliberate: a kind nobody here has heard of turns up in
// Sculpt rather than vanishing, and `auditTools` fails loudly when a kind lands
// in no tray at all or in two.
//
// THE ONE BRUSH WITH NO TILE is the one shift already reaches. `lower` takes
// exactly the same knobs as `raise`, with the same ranges and the same
// defaults, and `OPPOSITE` in palette.js says shift on raise lays it, so it is
// not given a square of its own: it IS the raise square with shift held. A
// valley is NOT hidden that way, because a valley's knobs default differently
// from a ridge's, and a kind whose knobs differ is a kind with its own feel.

import { FOOTPRINT } from '../../mmo/plans/footprints.js';
import { LAYERS, PAINT_MIX } from '../../world/terrain_material.js';
import { WATER_KINDS } from '../../world/terrain_edits.js';
import { paletteFor, search, OPPOSITE } from './palette.js';

/**
 * The kinds that go in the Water tray, READ OFF THE TERRAIN HALF (ED4).
 *
 * Not a list typed out here: `terrain_edits.WATER_KINDS` is the same array
 * `field.js` builds `waterAt` out of and `water.js` draws bodies for, so a
 * sixth water brush lands in this tray with nothing in this file to change.
 */
const WATER = new Set(WATER_KINDS);

/**
 * The sidebar, top to bottom. `brush` means the ground under the cursor wears a
 * ring and a held button paints; `place` means one click puts one thing down
 * and selects it; `scatter` means a held button lays many at a density.
 */
export const MODES = [
  { id: 'sculpt', label: 'Sculpt', icon: 'sculpt', brush: true, hint: 'move the ground itself' },
  { id: 'paint', label: 'Paint', icon: 'paint', brush: true, hint: 'what the ground is made of' },
  { id: 'foliage', label: 'Foliage', icon: 'foliage', brush: true, scatter: true, hint: 'grass, and the trees that grow out of it' },
  { id: 'objects', label: 'Objects', icon: 'objects', brush: true, scatter: true, hint: 'rocks and the small things people leave about' },
  { id: 'buildings', label: 'Buildings', icon: 'buildings', place: true, hint: 'anything three metres and over' },
  { id: 'creatures', label: 'Creatures', icon: 'creatures', brush: true, scatter: true, hint: 'where the living things come up' },
  { id: 'people', label: 'People', icon: 'people', place: true, hint: 'who keeps this place' },
  { id: 'markers', label: 'Markers', icon: 'markers', place: true, hint: 'a note to ourselves, standing in the world' },
  { id: 'water', label: 'Water', icon: 'water', brush: true, hint: 'lakes, rivers and the sea, each at its own level' },
  // ED5. LAST, and it is the one mode that reaches into both halves of this
  // editor: the ring takes the ground back to the blank canvas AND takes away
  // everything standing on it. Last down the rail because it is where you go
  // when something is wrong, and because the nine before it keep their keys.
  { id: 'erase', label: 'Erase', icon: 'erase', brush: true, hint: 'the blank canvas back: ground, paint, water and everything standing on it' },
];
export const MODE_IDS = MODES.map((m) => m.id);
export const modeOf = (id) => MODES.find((m) => m.id === id) || null;

/** The sidebar's own buttons under the modes, which are not modes. */
export const ACTIONS = [
  { id: 'undo', label: 'Undo', icon: 'undo' },
  { id: 'redo', label: 'Redo', icon: 'redo' },
  { id: 'save', label: 'Save', icon: 'save' },
  { id: 'leave', label: 'Leave', icon: 'leave' },
];

/**
 * How tall a thing has to be before it is a building rather than a prop.
 *
 * `FOOTPRINT[id]` is `[w, d, h]` in metres and is the only source: a barrel is
 * 1 m and a keep is 14, and neither is written down twice.
 */
export const PROP_HEIGHT = 3;
export const heightOf = (id) => (FOOTPRINT[id] ? FOOTPRINT[id][2] : 0);

/**
 * The last resort, for a brush the questions above cannot place.
 *
 * `lake` is here because a terrain half that calls its knob `depth` rather than
 * `floor` still means water, and it is kept even though ED4's WATER_KINDS names
 * it too: this file has to keep working against a terrain half that answers
 * `kinds` and nothing else. Anything not named here and not answering any of
 * the questions is Sculpt, so a kind added tomorrow appears rather than
 * vanishing.
 *
 * ED5's `erase` is here BY NAME and not by a question, and the reason is that
 * there is no question to ask: an eraser's row looks exactly like a sculpt
 * brush's, a radius and the two feathering knobs, and it is only what the
 * terrain half DOES with it that makes it an eraser. So it is named, and
 * `auditTools` fails loudly if it ever stops landing in a tray of its own.
 */
export const BRUSH_MODE = { lake: 'water', erase: 'erase' };

/** Which tray a brush belongs in, decided off the brush's own row. */
export function brushModeOf(row) {
  if (!row) return null;
  if (Array.isArray(row.words) && row.words.length) return 'paint';
  if (row.erases) return 'erase';
  if (WATER.has(row.id)) return 'water';
  if ((row.params || []).some((p) => p.name.toLowerCase() === 'floor')) return 'water';
  return BRUSH_MODE[row.id] || 'sculpt';
}

/**
 * The brushes that get no square, because shift on another brush already lays
 * them. Both halves have to be in `kinds()`, and their knobs have to be the
 * same knobs with the same ranges and the same defaults.
 */
export function shiftTwins(rows = []) {
  const sig = (r) => (r.params || []).map((p) => `${p.name}:${p.min}:${p.max}:${p.step}:${p.default}`).join(',');
  const byId = new Map(rows.map((r) => [r.id, r]));
  const out = new Set();
  for (const r of rows) {
    const other = byId.get(OPPOSITE[r.id]);
    if (!other || out.has(other.id)) continue;
    if (rows.indexOf(other) > rows.indexOf(r)) continue;   // the first of a pair keeps the square
    if (sig(other) !== sig(r)) continue;
    out.add(r.id);
  }
  return out;
}

const brushTile = (row, mode) => ({
  id: row.id, label: row.label, hint: row.hint, mode,
  what: 'brush', tab: 'terrain', brush: row.id, word: null,
  real: true, placeable: true, params: row.params, line: !!row.line, icon: row.id,
});

/**
 * The colour a swatch of one ground word is painted.
 *
 * DERIVED, not chosen: `PAINT_MIX[word]` is the six layer weights that word
 * lays down, and the six colours below are the midpoints of the six layers'
 * own `a` and `b` in `terrain_material.js`. So a word added to `PAINT_MIX`
 * gets a swatch with nothing here to add, and `auditTints` fails loudly if the
 * material ever grows a seventh layer this table has never heard of.
 */
export const LAYER_TINT = {
  grass: [[0x39, 0x55, 0x24], [0x82, 0xa0, 0x4a]],
  dryGrass: [[0x7c, 0x6f, 0x3b], [0xc4, 0xb0, 0x6c]],
  dirt: [[0x46, 0x35, 0x25], [0x8a, 0x71, 0x53]],
  rock: [[0x45, 0x43, 0x41], [0x8e, 0x8a, 0x84]],
  sand: [[0xa8, 0x8f, 0x62], [0xe0, 0xcd, 0xa2]],
  snow: [[0xc4, 0xd2, 0xe4], [0xff, 0xff, 0xff]],
};

/** Throws when the material's layers and the swatch table have drifted apart. */
export function auditTints() {
  const mine = Object.keys(LAYER_TINT).sort().join(',');
  const theirs = [...LAYERS].sort().join(',');
  if (mine !== theirs) throw new Error(`the ground swatches know ${mine} and terrain_material has ${theirs}`);
  return LAYERS.length;
}

const hex = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');

/** One ground word, as the colour a person would recognise it by. */
export function groundColour(word) {
  const mix = PAINT_MIX[word];
  const mid = (name) => {
    const [a, b] = LAYER_TINT[name] || [[128, 128, 128], [128, 128, 128]];
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  };
  if (!mix) return '#7a7a7a';
  const out = [0, 0, 0];
  let total = 0;
  LAYERS.forEach((name, i) => {
    const w = mix[i] || 0;
    total += w;
    const c = mid(name);
    for (let k = 0; k < 3; k++) out[k] += c[k] * w;
  });
  if (total <= 0) return '#7a7a7a';
  return `#${out.map((v) => hex(v / total)).join('')}`;
}

/** Every ground word one paint brush lays, as a tile each. */
function wordTiles(row, mode) {
  return (row.words || []).map((w) => ({
    id: w, label: w, hint: `paint ${w} over the ground`, mode,
    what: 'word', tab: 'terrain', brush: row.id, word: w,
    real: true, placeable: true, params: row.params, line: false,
    colour: groundColour(w), icon: 'paint',
  }));
}

const entryTile = (row, mode, tab, icon) => ({
  id: row.id, label: row.label, hint: row.hint, mode,
  what: 'entry', tab, brush: null, word: null,
  real: row.real, placeable: row.placeable !== false, params: [], line: false,
  icon: icon || tab,
  tag: tab === 'structures' ? (row.real ? 'modelled' : 'stand-in') : '',
});

/**
 * Every tile of one mode, in the order it is drawn.
 *
 * `opts.kinds` is `brushRows(terrain.kinds())` and `opts.has` is the model
 * cache's own answer, exactly as `palette.paletteFor` takes it. With no kinds
 * the three brush trays are EMPTY and the panel says why, rather than showing
 * squares that would move no ground.
 */
export function toolsFor(mode, opts = {}) {
  const rows = Array.isArray(opts.kinds) ? opts.kinds : [];
  const twins = shiftTwins(rows);
  const paintRow = rows.find((r) => brushModeOf(r) === 'paint') || null;
  switch (mode) {
    case 'sculpt':
      return rows.filter((r) => brushModeOf(r) === 'sculpt' && !twins.has(r.id)).map((r) => brushTile(r, 'sculpt'));
    case 'water':
      return rows.filter((r) => brushModeOf(r) === 'water' && !twins.has(r.id)).map((r) => brushTile(r, 'water'));
    // ED5: one brush, and it is the terrain half's own. If that half ever
    // offers a second eraser this tray shows it, with nothing here to change.
    case 'erase':
      return rows.filter((r) => brushModeOf(r) === 'erase' && !twins.has(r.id)).map((r) => brushTile(r, 'erase'));
    case 'paint':
      return rows.filter((r) => brushModeOf(r) === 'paint').flatMap((r) => wordTiles(r, 'paint'));
    case 'foliage': {
      // Grass is not a plant this editor plants: `grass.js` grows blades only
      // where the ground word is 'grass', so painting grass IS the paint brush
      // with that word, and shift lays bare dirt, which is the absence of it.
      const grass = paintRow && (paintRow.words || []).includes('grass')
        ? [{
          ...wordTiles(paintRow, 'foliage').find((t) => t.id === 'grass'),
          label: 'grass', hint: 'paint grass on, hold shift to wear it back to dirt',
          off: (paintRow.words || []).includes('dirt') ? 'dirt' : null, icon: 'grass',
        }]
        : [];
      return [...grass, ...paletteFor('trees').map((r) => entryTile(r, 'foliage', 'trees', 'tree'))];
    }
    case 'objects':
      return [
        ...paletteFor('rocks').map((r) => entryTile(r, 'objects', 'rocks', 'rock')),
        ...paletteFor('structures', { has: opts.has }).filter((r) => heightOf(r.id) < PROP_HEIGHT)
          .map((r) => entryTile(r, 'objects', 'structures', 'prop')),
      ];
    case 'buildings':
      return paletteFor('structures', { has: opts.has }).filter((r) => heightOf(r.id) >= PROP_HEIGHT)
        .map((r) => entryTile(r, 'buildings', 'structures', 'buildings'));
    case 'creatures':
      return [
        ...paletteFor('monsters').map((r) => entryTile(r, 'creatures', 'monsters', 'monster')),
        ...paletteFor('creatures').map((r) => entryTile(r, 'creatures', 'creatures', 'critter')),
      ];
    case 'people':
      return paletteFor('people').map((r) => entryTile(r, 'people', 'people', 'people'));
    case 'markers':
      return paletteFor('markers').map((r) => entryTile(r, 'markers', 'markers', 'markers'));
    default:
      return [];
  }
}

/** The tiles of a mode that match what was typed into the filter box. */
export const filterTools = (tiles, query) => search(tiles, query);

/**
 * Every brush `kinds()` named, and where it went.
 *
 * Throws when one landed nowhere or in two trays, and when one is neither on a
 * tile nor reachable by shift from a tile. That is the guard against the class
 * of bug this editor was rebuilt out of: a brush the terrain half offers that
 * no square in the editor can take in hand.
 */
export function auditTools(rows = [], opts = {}) {
  const twins = shiftTwins(rows);
  const seen = new Map();
  for (const mode of MODE_IDS) {
    for (const t of toolsFor(mode, { ...opts, kinds: rows })) {
      if (t.what === 'entry') continue;
      const key = t.brush;
      const at = seen.get(key) || new Set();
      at.add(mode);
      seen.set(key, at);
    }
  }
  const lost = [];
  for (const r of rows) {
    if (twins.has(r.id)) continue;
    const at = seen.get(r.id);
    if (!at || !at.size) lost.push(`${r.id} is in no tray`);
  }
  // Paint's words live in two trays on purpose: grass is in Foliage as well.
  for (const [id, at] of seen) {
    const row = rows.find((r) => r.id === id);
    const mine = brushModeOf(row);
    for (const m of at) {
      if (m !== mine && !(mine === 'paint' && m === 'foliage')) lost.push(`${id} is in ${m} as well as ${mine}`);
    }
  }
  if (lost.length) throw new Error(`the editor trays and the terrain contract have drifted: ${lost.join('; ')}`);
  return { kinds: rows.length, twins: [...twins] };
}
