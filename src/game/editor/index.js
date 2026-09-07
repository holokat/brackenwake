// The in game editor, in one import.
//
// docs/mmo/wiring/ED1-EDITOR.md is the whole of it: what it does, what it
// writes, which keys it takes, and how to use it.

export { panel, panel as default, editorOf, groundUnder, NO_BRUSHES, CLICK_SLOP, PICK_R, CELL, TILE } from './panel.js';
export {
  createEditor, SPACE_PATH, SAVE_URL, LIST_URL, NEW_RADIUS,
  BRUSH_R, BRUSH_AMOUNT, DRAG_MS, DRAG_SPACING, RESET_ASK_MS, RADIUS_STEP,
  TILE_M, TILE_R, AUTOSAVE_MS, SCATTER_R, SCATTER_DENSITY, tileOf, tileIdFor, tileCentre,
} from './editor.js';
export { createSpaceDoc, LISTS, LIST_WORD, TURN_DEG, SCALE_STEP, labelOf, pointOf } from './space_doc.js';
export {
  MODES, MODE_IDS, ACTIONS, modeOf, toolsFor, filterTools, auditTools,
  brushModeOf, shiftTwins, groundColour, auditTints, PROP_HEIGHT, heightOf,
} from './modes.js';
export { MARKS, editorIcon, swatch, hasMark } from './icons.js';
export {
  TABS, TAB_IDS, BRUSHES, BRUSH_IDS, paletteFor, entryFor, search, MARKER_KINDS,
  brushRow, brushRows, brushParam, brushHint, unitFor, OPPOSITE, RADIUS_NAMES, AMOUNT_NAMES, SECOND_POINT,
} from './palette.js';
export { ghostFor, radiusRing, brushRing, lineGhost, BRUSH_COLOUR, LINE_SAMPLES } from './ghost.js';
