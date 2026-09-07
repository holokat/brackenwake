// The editor's own drawings: one mark per mode, one per brush, one per tray.
//
// Inline svg on a 24 by 24 field, stroked in whatever colour is handed in, so
// a 48 px sidebar cell and a 56 px tile are the same drawing at two sizes and
// nothing loads over the network. `src/game/ui_theme.js` owns the game's marks
// and this owns the editor's; neither reads the other's table.
//
// A MARK THAT IS NOT HERE IS NOT A HOLE. `editorIcon` falls back to the brush
// mark rather than drawing nothing, because a kind the terrain half grows
// tomorrow has to be clickable today, and an empty square is indistinguishable
// from a broken one.

/** Every mark, as the body of an svg. Stroked, never filled. */
export const MARKS = {
  // the nine modes
  sculpt: '<path d="M3 19 L9 9 l4 5 3 -4 5 9 z M12 3 v3 M9 5 l1.5 2 M15 5 l-1.5 2" />',
  paint: '<path d="M6 3 h12 v5 H6 z M12 8 v4 M10 12 h4 v4 h-4 z M12 16 v5" />',
  foliage: '<path d="M12 21 v-7 M12 14 L7 9 M12 14 l5 -5 M12 9 L9 5 M12 9 l3 -4 M4 21 c1 -3 2 -3 3 0 M17 21 c1 -3 2 -3 3 0" />',
  objects: '<path d="M4 19 l3 -7 5 -2 4 4 -1 5 z M8 12 l4 2 M16 14 l-4 0" />',
  buildings: '<path d="M4 21 V10 l8 -6 8 6 v11 z M9 21 v-6 h6 v6 M6 12 h2 M16 12 h2" />',
  creatures: '<path d="M5 20 c0 -5 3 -8 7 -8 s7 3 7 8 M9 12 L7 6 l3 2 M15 12 l2 -6 -3 2 M10 17 h.01 M14 17 h.01" />',
  people: '<circle cx="12" cy="7" r="3" /><path d="M5 21 c0 -5 3 -7 7 -7 s7 2 7 7" />',
  markers: '<path d="M7 21 V3 M7 4 h11 l-3 4 3 4 H7" />',
  water: '<path d="M3 9 c3 -3 6 3 9 0 s6 -3 9 0 M3 15 c3 -3 6 3 9 0 s6 -3 9 0" />',

  // the trays' own marks, for tiles that are not brushes
  tree: '<path d="M12 21 v-6 M12 15 L6 9 h3 L6 5 h4 L12 2 l2 3 h4 l-3 4 h3 z" />',
  rock: '<path d="M3 19 l4 -8 5 -3 6 4 1 7 z M7 11 l5 8 M12 8 l6 4" />',
  prop: '<path d="M6 8 h12 v12 H6 z M6 8 l3 -4 h6 l3 4 M10 12 h4" />',
  monster: '<path d="M4 18 c0 -6 4 -9 8 -9 s8 3 8 9 M8 9 L6 3 l4 3 M16 9 l2 -6 -4 3 M9 14 h.01 M15 14 h.01 M9 18 l1.5 -2 1.5 2 1.5 -2 1.5 2" />',
  critter: '<path d="M6 18 c0 -4 3 -6 6 -6 s6 2 6 6 M8 12 c-2 -2 -2 -5 0 -6 M16 12 c2 -2 2 -5 0 -6 M10 16 h.01 M14 16 h.01" />',
  grass: '<path d="M6 21 c0 -5 -1 -7 -2 -9 2 1 3 3 3 6 M12 21 c0 -7 -1 -10 -2 -13 3 3 4 7 4 13 M18 21 c0 -5 1 -7 2 -9 -2 1 -3 3 -3 6" />',

  // the brushes, in the terrain half's own vocabulary
  raise: '<path d="M12 20 V5 M6 11 l6 -6 6 6 M4 22 h16" />',
  lower: '<path d="M12 4 v15 M6 13 l6 6 6 -6 M4 2 h16" />',
  flatten: '<path d="M3 14 h18 M6 9 v4 M12 7 v6 M18 10 v3" />',
  smooth: '<path d="M3 15 c4 0 4 -7 8 -7 s5 7 10 5" />',
  pit: '<path d="M3 8 h5 l4 9 4 -9 h5" />',
  cliff: '<path d="M3 8 h8 v12 h10" />',
  cave: '<path d="M3 20 h18 M6 20 c0 -6 3 -9 6 -9 s6 3 6 9 M9 20 c0 -3 1.5 -4.5 3 -4.5 s3 1.5 3 4.5" />',
  mountain: '<path d="M2 20 L9 7 l4 6 3 -4 6 11 z M9 7 l2 3 -3 2" />',
  ridge: '<path d="M2 18 L8 8 l4 5 4 -7 6 12" />',
  valley: '<path d="M2 6 L8 16 l4 -5 4 7 6 -12" />',
  plateau: '<path d="M2 20 L7 9 h9 l5 11 z" />',
  terrace: '<path d="M3 20 h5 v-4 h5 v-4 h5 v-4 h3" />',
  noise: '<path d="M2 15 l3 -4 2 5 3 -7 2 6 3 -5 2 4 3 -3 2 4" />',
  erode: '<path d="M4 6 v6 M9 4 v9 M14 6 v6 M19 5 v8 M3 17 c4 -2 6 2 9 0 s6 -3 9 -1" />',
  lake: '<path d="M4 10 c4 -4 12 -4 16 0 -2 7 -14 7 -16 0 z M8 16 c2 2 6 2 8 0" />',
  ground: '<path d="M3 15 h18 M5 19 h14 M7 11 c2 -3 4 -3 6 0 M13 11 c2 -3 3 -2 4 0" />',

  // the sidebar's actions
  undo: '<path d="M4 10 h9 a5 5 0 0 1 0 10 H8 M4 10 l4 -4 M4 10 l4 4" />',
  redo: '<path d="M20 10 h-9 a5 5 0 0 0 0 10 h5 M20 10 l-4 -4 M20 10 l-4 4" />',
  save: '<path d="M4 4 h13 l3 3 v13 H4 z M8 4 v6 h8 V4 M8 20 v-6 h8 v6" />',
  leave: '<path d="M14 4 H5 v16 h9 M11 12 h9 M17 8 l4 4 -4 4" />',
  brush: '<path d="M8 21 c-3 0 -4 -3 -4 -5 3 0 4 -2 4 -4 l3 3 c-1 2 0 6 -3 6 z M11 12 L20 3 l1 1 -9 9" />',
  filter: '<circle cx="11" cy="11" r="6" /><path d="M20 20 l-4.5 -4.5" />',
  night: '<path d="M20 14 a8 8 0 0 1 -10 -10 6 6 0 1 0 10 10 z" />',
  day: '<circle cx="12" cy="12" r="4" /><path d="M12 2 v3 M12 19 v3 M2 12 h3 M19 12 h3 M5 5 l2 2 M17 17 l2 2 M19 5 l-2 2 M7 17 l-2 2" />',
  bin: '<path d="M5 7 h14 M9 7 V4 h6 v3 M7 7 l1 14 h8 l1 -14 M11 11 v6 M13 11 v6" />',
};

/** Whether a mark exists under that name, without drawing it. */
export const hasMark = (name) => Object.prototype.hasOwnProperty.call(MARKS, name);

/**
 * One mark as an svg string, at a size, in a colour.
 *
 * A name with no drawing gets the brush, so a kind added to the terrain half
 * tomorrow is a square with a mark on it and not an empty hole.
 */
export function editorIcon(name, colour = 'currentColor', size = 24) {
  const body = MARKS[name] || MARKS.brush;
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="${colour}"
    stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}

/** A flat square of one colour, for a ground swatch. Filled, not stroked. */
export function swatch(colour, size = 24) {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}">
    <rect x="2" y="2" width="20" height="20" rx="3" fill="${colour}" stroke="rgba(0,0,0,.45)" stroke-width="1" />
    <path d="M4 16 c3 -3 5 1 8 -1 s5 -2 8 1" fill="none" stroke="rgba(0,0,0,.22)" stroke-width="1.4" /></svg>`;
}
