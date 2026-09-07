// The editor's screen: a sidebar of marks, a tray of tiles, a brush on the
// ground, and a strip along the bottom saying what is under the cursor.
//
// WHAT THIS IS NOT. It is not a window. There is no title bar, no close button,
// no rows of text fields to fill in before anything can be done, and nothing on
// it has to be typed into before the first click. The user's words were "i want
// a paintbrush style world editor, not whatever weirdness we have here" and "an
// actual sidebar with visual icons to click ... a full visual editor HUD open at
// all times not like a settings window". So the editor is a MODE: L in dev mode
// takes the gameplay HUD off the screen and puts this in its place, and L or
// Escape puts the HUD back exactly as it was.
//
// It is still registered with the window manager under the id `editor`, because
// that is what already owns the L key, the one-open rule and the "close when dev
// mode goes off" wiring in `app/systems/dev.js`. Its frame is styled out of
// existence and everything below is mounted on the body as a full screen
// instrument. So `windows.open('editor')` and `windows.close('editor')` still
// mean what they always meant.
//
// FOUR THINGS ARE NOT BUTTONS
//
//   THE CURSOR. The pointer's ray is marched against `runtime.heightAt` until
//   it goes under the ground, so the ring sits on the real hillside and not on
//   a plane at the player's feet. The editor is used flying, a hundred metres
//   up, looking down a slope.
//
//   THE HELD BUTTON. A left press on the canvas is swallowed in the capture
//   phase, and while it is held the brush lays strokes along the drag. The
//   spacing and the interval are `editor.js`'s, not this file's. A RIGHT drag
//   still turns the camera, because the swallow is left button only.
//
//   THE WHEEL. Over the world it widens and narrows the brush, and with shift
//   it changes how much the brush does. Over a dock it does nothing, because
//   the docks take their own pointer events and the canvas never hears them.
//
//   THE KEYS. 1 to 9 pick a mode. Shift turns a brush over, or rubs a scatter
//   out. R turns, the brackets size, Delete removes, ctrl Z and ctrl Y walk the
//   right stack for the mode, ctrl S writes everything now.

import * as THREE from 'three';
import { createEditor } from './editor.js';
import { MODES, MODE_IDS, ACTIONS, modeOf, toolsFor, filterTools, auditTools } from './modes.js';
import { editorIcon, swatch } from './icons.js';
import { theme } from '../ui_theme.js';
import { ghostFor, brushRing, radiusRing, selectionBox, disposeGhost, lineGhost } from './ghost.js';
import { TURN_DEG, SCALE_STEP, labelOf, pointOf } from './space_doc.js';
import { setMarkersVisible } from '../../world/plan_models.js';

/** How far the pointer may move between press and release and still be a click. */
export const CLICK_SLOP = 5;
/** What the tray says when the terrain half names no brushes. */
export const NO_BRUSHES = 'the terrain tools name no brushes, so there is nothing to sculpt with yet.';
/** How far the ground march looks, in metres, and how fine it gets. */
export const MARCH_MAX = 900;
export const MARCH_FINE = 0.05;
/** How near a click has to land on a thing to take hold of it, in metres. */
export const PICK_R = 6;
/** The sidebar's cell, and the tray's tile, in pixels. */
export const CELL = 48;
export const TILE = 56;
/**
 * How far the world floor's two sliders reach.
 *
 * The terrain contract gives a range for every BRUSH knob and none at all for
 * the floor, so these are the editor's own and are named here rather than
 * buried. The height is taken off the contract where it can be: a kind with a
 * `height` knob has already said how far up and down the world may go, and
 * `floorRange` uses it. The snow line has no such knob anywhere, so 0 to 500 m
 * is a guess, and a guess is what it says it is.
 */
export const FLOOR_H = { min: -200, max: 400, step: 1 };
export const SNOW_MAX = 500;

const h = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const mark = (el, name, colour, size) => { el.innerHTML = editorIcon(name, colour, size); return el; };

/**
 * Where the pointer's ray meets the ground.
 *
 * A march, not a plane: the ray is walked outward in steps that grow with
 * distance until the sample is below the height field, then bisected.
 * `heightAt` is the runtime's, so ground the terrain half has just raised is
 * the ground this lands on.
 */
export function groundUnder(camera, ndc, heightAt, raycaster = new THREE.Raycaster()) {
  raycaster.setFromCamera(ndc, camera);
  const o = raycaster.ray.origin, d = raycaster.ray.direction;
  const at = (t) => ({ x: o.x + d.x * t, y: o.y + d.y * t, z: o.z + d.z * t });
  let prev = 0;
  let above = at(0).y - heightAt(o.x, o.z) > 0;
  for (let t = 0.5; t <= MARCH_MAX; t += Math.max(0.5, t * 0.035)) {
    const p = at(t);
    const under = p.y - heightAt(p.x, p.z) <= 0;
    if (under && above) {
      let lo = prev, hi = t;
      while (hi - lo > MARCH_FINE) {
        const mid = (lo + hi) / 2;
        const q = at(mid);
        if (q.y - heightAt(q.x, q.z) <= 0) hi = mid; else lo = mid;
      }
      const q = at(hi);
      return { x: q.x, y: heightAt(q.x, q.z), z: q.z, dist: hi };
    }
    above = !under;
    prev = t;
  }
  return null;
}

const CSS = `
/* The window frame this panel is registered under is not drawn at all. The
   registration is what owns the L key and the close-with-dev-mode wiring; the
   editor itself is the full screen instrument below. */
#bw-windows .bw-win-editor { display: none !important; }

#bw-editor, #bw-editor * { box-sizing: border-box; }
#bw-editor {
  position: fixed; inset: 0; z-index: 60; pointer-events: none;
  font-family: ${theme.fonts.plain}; font-size: 12px; color: ${theme.parchment};
  -webkit-user-select: none; user-select: none;
}
#bw-editor .dock {
  pointer-events: auto; position: absolute;
  background: linear-gradient(180deg, rgba(23,19,15,.96), rgba(13,11,9,.98));
  border: 1px solid ${theme.goldDim}; box-shadow: 0 6px 26px rgba(0,0,0,.55);
}
#bw-editor .rail { left: 0; top: 0; bottom: 0; width: 76px; border-left: 0; border-top: 0; border-bottom: 0;
  display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 8px 0; overflow: auto; }
#bw-editor .rail .sep { width: 46px; height: 1px; margin: 6px 0; background: ${theme.goldDim}; opacity: .6; }
#bw-editor .cell {
  width: 64px; padding: 5px 0 3px; display: flex; flex-direction: column; align-items: center; gap: 2px;
  cursor: pointer; border: 1px solid transparent; background: transparent; color: ${theme.parchmentDim};
}
#bw-editor .cell .g { width: ${CELL}px; height: ${CELL}px; display: flex; align-items: center; justify-content: center;
  border: 1px solid ${theme.goldDim}88; background: rgba(255,255,255,.03); }
#bw-editor .cell .n { font-size: 9.5px; letter-spacing: .06em; text-transform: uppercase; }
#bw-editor .cell:hover { color: ${theme.goldBright}; }
#bw-editor .cell:hover .g { border-color: ${theme.gold}; }
#bw-editor .cell.on { color: ${theme.goldBright}; }
#bw-editor .cell.on .g { border-color: ${theme.gold}; background: rgba(201,164,74,.20); box-shadow: inset 0 0 12px rgba(201,164,74,.28); }
#bw-editor .cell.off { opacity: .35; }
#bw-editor .cell .k { font-size: 8.5px; color: ${theme.goldDim}; }

#bw-editor .strip { left: 76px; top: 0; bottom: 0; width: 232px; border-top: 0; border-bottom: 0;
  display: flex; flex-direction: column; }
#bw-editor .strip .head { padding: 9px 10px 7px; border-bottom: 1px solid ${theme.goldDim}66; }
#bw-editor .strip .head .t { font-family: ${theme.fonts.display}; font-size: 13px; letter-spacing: .16em;
  text-transform: uppercase; color: ${theme.gold}; }
#bw-editor .strip .head .s { font-size: 11px; color: ${theme.parchmentFaint}; margin-top: 2px; }
#bw-editor .strip .find { display: flex; align-items: center; gap: 6px; padding: 6px 10px; border-bottom: 1px solid ${theme.goldDim}44; }
#bw-editor input[type=text], #bw-editor input[type=number] {
  font: inherit; flex: 1 1 auto; min-width: 0; padding: 3px 7px; color: ${theme.parchment};
  background: rgba(0,0,0,.45); border: 1px solid ${theme.goldDim}88;
}
#bw-editor input[type=text]:focus, #bw-editor input[type=number]:focus { outline: none; border-color: ${theme.gold}; }
#bw-editor .grid { flex: 1 1 auto; overflow: auto; padding: 8px; display: flex; flex-wrap: wrap; gap: 6px; align-content: flex-start; }
#bw-editor .tile {
  width: ${TILE}px; padding: 4px 2px 3px; display: flex; flex-direction: column; align-items: center; gap: 3px;
  cursor: pointer; border: 1px solid ${theme.goldDim}66; background: rgba(255,255,255,.03); color: ${theme.parchmentDim};
}
#bw-editor .tile .g { width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; }
#bw-editor .tile .n { font-size: 8.5px; line-height: 1.15; text-align: center; word-break: break-word; }
#bw-editor .tile .tag { font-size: 7.5px; letter-spacing: .06em; text-transform: uppercase; color: ${theme.goldDim}; }
#bw-editor .tile.real .tag { color: ${theme.gold}; }
#bw-editor .tile:hover { border-color: ${theme.gold}; color: ${theme.goldBright}; }
#bw-editor .tile.on { border-color: ${theme.gold}; background: rgba(201,164,74,.22); color: ${theme.goldBright}; }
#bw-editor .tile.off { opacity: .38; cursor: default; }
#bw-editor .knobs { border-top: 1px solid ${theme.goldDim}66; padding: 7px 10px 9px; max-height: 46%; overflow: auto; }
#bw-editor .knob { display: flex; align-items: center; gap: 6px; padding: 2px 0; }
#bw-editor .knob .n { flex: 0 0 62px; font-size: 10px; letter-spacing: .05em; text-transform: uppercase; color: ${theme.parchmentFaint}; }
#bw-editor .knob input[type=range] { flex: 1 1 auto; min-width: 0; accent-color: ${theme.gold}; }
#bw-editor .knob .v { flex: 0 0 58px; text-align: right; font-variant-numeric: tabular-nums; color: ${theme.parchment}; }
#bw-editor .knobs .say { font-size: 11px; color: ${theme.parchmentFaint}; line-height: 1.45; margin-top: 4px; }
#bw-editor .toggle { display: flex; align-items: center; gap: 6px; padding: 3px 0; cursor: pointer; color: ${theme.parchmentDim}; }
#bw-editor .toggle.on { color: ${theme.goldBright}; }
#bw-editor .knobs button {
  font: inherit; font-size: 11px; margin-top: 5px; padding: 3px 9px; cursor: pointer; width: 100%;
  color: ${theme.parchment}; background: linear-gradient(180deg, rgba(255,255,255,.06), rgba(0,0,0,.4));
  border: 1px solid ${theme.goldDim};
}
#bw-editor .knobs button:hover { border-color: ${theme.gold}; color: ${theme.goldBright}; }
#bw-editor .knobs button.armed { border-color: ${theme.gold}; color: ${theme.goldBright}; background: rgba(122,42,32,.55); }

#bw-editor .top { right: 0; top: 0; padding: 6px 8px; display: flex; align-items: center; gap: 6px; border-right: 0; border-top: 0; }
#bw-editor select { font: inherit; padding: 3px 6px; color: ${theme.parchment}; background: rgba(0,0,0,.55); border: 1px solid ${theme.goldDim}88; }
#bw-editor .top button, #bw-editor .card button {
  font: inherit; font-size: 11px; padding: 3px 9px; cursor: pointer; color: ${theme.parchment};
  background: linear-gradient(180deg, rgba(255,255,255,.06), rgba(0,0,0,.4)); border: 1px solid ${theme.goldDim};
}
#bw-editor .top button:hover, #bw-editor .card button:hover { border-color: ${theme.gold}; color: ${theme.goldBright}; }

#bw-editor .card { left: 316px; top: 12px; width: 236px; padding: 9px 10px 10px; }
#bw-editor .card .t { font-family: ${theme.fonts.display}; font-size: 12px; letter-spacing: .12em;
  text-transform: uppercase; color: ${theme.gold}; margin-bottom: 5px; }
#bw-editor .card .f { display: flex; align-items: center; gap: 6px; padding: 2px 0; }
#bw-editor .card .f .n { flex: 0 0 46px; font-size: 10px; text-transform: uppercase; color: ${theme.parchmentFaint}; }
#bw-editor .card .w { font-size: 11px; color: ${theme.parchmentFaint}; margin: 5px 0; line-height: 1.4; }

#bw-editor .status { left: 76px; right: 0; bottom: 0; padding: 5px 12px; display: flex; align-items: center; gap: 14px;
  border-right: 0; border-bottom: 0; font-variant-numeric: tabular-nums; }
#bw-editor .status .b { color: ${theme.goldBright}; }
#bw-editor .status .d { color: ${theme.parchmentFaint}; }
#bw-editor .status .last { flex: 1 1 auto; text-align: right; color: ${theme.parchmentDim};
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#bw-editor .status .last.bad { color: ${theme.down}; }
`;

function css() {
  if (typeof document === 'undefined' || document.getElementById('bw-editor-css')) return;
  const s = document.createElement('style');
  s.id = 'bw-editor-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

let builtEditor = null;
/** The editor the screen built, for the console and the harness. */
export const editorOf = () => builtEditor;

export const panel = {
  id: 'editor',
  title: 'Editor',
  key: 'l',

  build(root, ctx) {
    if (typeof document === 'undefined') return;
    css();
    root.className = 'bw-editor-host';
    root.textContent = '';
    const ed = createEditor(ctx);
    this._ed = ed;
    this._ctx = ctx;
    builtEditor = ed;

    // ------------------------------------------------------------ the screen

    const face = h('div');
    face.id = 'bw-editor';
    face.style.display = 'none';
    document.body.appendChild(face);
    this._face = face;

    const rail = h('div', 'dock rail');
    const strip = h('div', 'dock strip');
    const top = h('div', 'dock top');
    const card = h('div', 'dock card');
    const status = h('div', 'dock status');
    for (const d of [rail, strip, top, card, status]) face.appendChild(d);
    card.style.display = 'none';
    this._rail = rail; this._strip = strip; this._status = status; this._card = card;

    // ---- the rail: one cell per mode, then the four that are not modes ----
    let mode = MODE_IDS[0];
    const toolIds = new Map();     // mode -> the tile last taken in hand
    const queries = new Map();     // mode -> what is typed in its filter box
    const modeCells = new Map();
    const actionCells = new Map();

    const cell = (parent, name, icon, key) => {
      const b = h('div', 'cell');
      b.appendChild(mark(h('div', 'g'), icon, theme.gold, CELL - 16));
      b.appendChild(h('div', 'n', name));
      if (key) b.appendChild(h('div', 'k', key));
      parent.appendChild(b);
      return b;
    };

    MODES.forEach((m, i) => {
      const b = cell(rail, m.label, m.icon, String(i + 1));
      b.title = m.hint;
      b.addEventListener('click', () => setMode(m.id));
      modeCells.set(m.id, b);
    });
    rail.appendChild(h('div', 'sep'));
    for (const a of ACTIONS) {
      const b = cell(rail, a.label, a.icon, null);
      b.addEventListener('click', () => doAction(a.id));
      actionCells.set(a.id, b);
    }

    // ---- the tray -------------------------------------------------------
    const head = h('div', 'head');
    const headT = h('div', 't', '');
    const headS = h('div', 's', '');
    head.appendChild(headT); head.appendChild(headS);
    strip.appendChild(head);

    const findRow = h('div', 'find');
    findRow.appendChild(mark(h('span'), 'filter', theme.goldDim, 14));
    const find = h('input');
    find.type = 'text';
    find.placeholder = 'narrow the tray';
    find.addEventListener('input', () => { queries.set(mode, find.value); drawGrid(); });
    findRow.appendChild(find);
    strip.appendChild(findRow);

    const grid = h('div', 'grid');
    strip.appendChild(grid);
    const knobs = h('div', 'knobs');
    strip.appendChild(knobs);
    this._grid = grid; this._knobs = knobs;

    // ---- the top right: the named spaces already on disk -----------------
    const spaceSel = h('select');
    top.appendChild(spaceSel);
    const openBtn = h('button', null, 'open');
    openBtn.type = 'button';
    openBtn.addEventListener('click', () => { if (spaceSel.value) { ed.open(spaceSel.value); drawAll(); } });
    top.appendChild(openBtn);
    // The open space's own name and reach. A tile space names itself `Tile 3,
    // -2` and this is where it gets called Cold Spring instead. Nothing has to
    // be typed here before anything can be done, which is the whole point.
    const spName = h('input');
    spName.type = 'text';
    spName.placeholder = 'name this place';
    spName.style.width = '150px';
    spName.addEventListener('change', () => { ed.setSpace({ name: spName.value }); drawAll(); });
    top.appendChild(spName);
    const spNote = h('input');
    spNote.type = 'text';
    spNote.placeholder = 'a sentence about this place';
    spNote.style.width = '180px';
    spNote.addEventListener('change', () => { ed.setSpace({ note: spNote.value }); drawAll(); });
    top.appendChild(spNote);
    const spR = h('input');
    spR.type = 'number';
    spR.min = '8'; spR.step = '2';
    spR.style.width = '70px';
    spR.addEventListener('change', () => { ed.setSpace({ radius: Number(spR.value) }); drawAll(); });
    top.appendChild(spR);
    const backBtn = h('button', null, 'back to disk');
    backBtn.type = 'button';
    backBtn.addEventListener('click', () => { ed.reload(); drawAll(); });
    top.appendChild(backBtn);

    // ---- the bottom strip ------------------------------------------------
    const sMode = h('span', 'b', '');
    const sTool = h('span', 'b', '');
    const sSize = h('span', 'd', '');
    const sWhere = h('span', 'd', '');
    const sSpace = h('span', 'd', '');
    const sLast = h('span', 'last', '');
    for (const s of [sMode, sTool, sSize, sWhere, sSpace, sLast]) status.appendChild(s);

    // ---- the selection card ---------------------------------------------
    const cardT = h('div', 't', '');
    card.appendChild(cardT);
    const cardField = (name, type) => {
      const f = h('div', 'f');
      f.appendChild(h('span', 'n', name));
      const i = h('input');
      i.type = type;
      f.appendChild(i);
      card.appendChild(f);
      return { row: f, input: i };
    };
    const fYaw = cardField('turn', 'number');
    const fScale = cardField('size', 'number');
    const fName = cardField('name', 'text');
    const fNote = cardField('note', 'text');
    fYaw.input.step = String(TURN_DEG);
    fScale.input.step = '0.1';
    const commit = () => {
      ed.setSelected({
        yaw: Number(fYaw.input.value), scale: Number(fScale.input.value),
        name: fName.input.value, label: fName.input.value, note: fNote.input.value,
      });
      drawAll();
    };
    for (const f of [fYaw, fScale, fName, fNote]) f.input.addEventListener('change', commit);
    const cardWords = h('div', 'w', '');
    card.appendChild(cardWords);
    const cardRow = h('div', 'f');
    const dropBtn = h('button', null, 'remove');
    dropBtn.type = 'button';
    dropBtn.addEventListener('click', () => { ed.del(); drawAll(); });
    const letBtn = h('button', null, 'let go');
    letBtn.type = 'button';
    letBtn.addEventListener('click', () => { ed.deselect(); drawAll(); });
    cardRow.appendChild(dropBtn); cardRow.appendChild(letBtn);
    card.appendChild(cardRow);

    // ------------------------------------------------------- what is in hand

    /** The tiles of the mode that is up, before the filter box narrows them. */
    function tilesNow() {
      return toolsFor(mode, { kinds: ed.terrainKinds() || [], has: ctx.hasProp });
    }
    /** The tile in hand, or the first one the mode has. */
    function toolNow() {
      const tiles = tilesNow();
      if (!tiles.length) return null;
      const want = toolIds.get(mode);
      return tiles.find((t) => t.id === want) || tiles.find((t) => t.placeable !== false) || null;
    }
    /**
     * What a held button does with this tile: move the ground, scatter many, or
     * put one down and take hold of it.
     */
    function actOf(t) {
      if (!t) return 'none';
      if (t.what === 'brush' || t.what === 'word') return 'terrain';
      const m = modeOf(mode);
      return m && m.scatter ? 'scatter' : 'place';
    }
    /** The ring the ground wears under the cursor, in metres. 0 for none. */
    function ringR() {
      const t = toolNow();
      const act = actOf(t);
      if (act === 'terrain') return ed.brush.r;
      if (act === 'scatter') return ed.scatter.r;
      return 0;
    }

    function setMode(id, opts = {}) {
      if (!MODE_IDS.includes(id)) return false;
      mode = id;
      find.value = queries.get(mode) || '';
      // A brush tray that is empty asks the contract again before it says so.
      // The terrain half is wired after the editor as often as before it, and a
      // tray that only fills on a page reload is a tray that reads as broken.
      const m = modeOf(mode);
      if (m && m.brush && !(ed.terrainKinds() || []).length) ed.refreshKinds();
      const t = toolNow();
      if (t) applyTool(t, { quiet: true });
      if (!opts.quiet) ed.say(`${modeOf(mode).label}: ${modeOf(mode).hint}.`);
      drawAll();
      return true;
    }
    this._setMode = setMode;
    this._modeNow = () => mode;
    this._toolNow = toolNow;
    this._tilesNow = tilesNow;
    this._actOf = actOf;

    function applyTool(t) {
      if (!t) return false;
      if (t.placeable === false) { ed.say(`${t.label} cannot be put down: ${t.hint}.`, 'bad'); return false; }
      toolIds.set(mode, t.id);
      if (t.what === 'brush') { ed.setTab('terrain'); ed.arm(t.brush); }
      else if (t.what === 'word') { ed.setTab('terrain'); ed.arm(t.brush); ed.setBrushWord(t.brush, t.word); }
      else { ed.setTab(t.tab); ed.arm(t.id); }
      rebuildGhost();
      return true;
    }
    this._applyTool = applyTool;

    function doAction(id) {
      if (id === 'undo') { if (actOf(toolNow()) === 'terrain') ed.terrainUndo(); else ed.undo(); }
      else if (id === 'redo') { if (actOf(toolNow()) === 'terrain') ed.terrainRedo(); else ed.redo(); }
      else if (id === 'save') { ed.saveAll().then(() => ed.list()).then(drawAll).catch(() => drawAll()); }
      else if (id === 'leave') { ctx?.windows?.close?.('editor'); return; }
      drawAll();
    }
    this._doAction = doAction;

    // ------------------------------------------------------------- drawing

    let gridSig = '';
    const tileCells = new Map();

    function drawRail() {
      for (const [id, b] of modeCells) b.classList.toggle('on', id === mode);
      const onGround = actOf(toolNow()) === 'terrain';
      actionCells.get('undo').classList.toggle('off', !(onGround ? ed.terrainDepth.done : ed.canUndo));
      actionCells.get('redo').classList.toggle('off', !(onGround ? ed.terrainDepth.undone : ed.canRedo));
      actionCells.get('save').classList.toggle('off', !ed.autosaveWaiting().length && !ed.groundDirty);
    }

    function buildGrid(tiles) {
      grid.textContent = '';
      tileCells.clear();
      if (!tiles.length) {
        const m = modeOf(mode);
        grid.appendChild(h('div', 'n', m && m.brush && !(ed.terrainKinds() || []).length
          ? (ed.terrainReady() ? NO_BRUSHES : 'the terrain tools are not in yet: nothing answers window.__bw.terrain.')
          : 'nothing here matches that'));
        return;
      }
      for (const t of tiles) {
        const b = h('div', 'tile' + (t.real ? ' real' : '') + (t.placeable === false ? ' off' : ''));
        const g = h('div', 'g');
        // A ground word is drawn as the colour it paints, mixed out of the
        // terrain material's own layers. Everything else gets its mark.
        if (t.colour) g.innerHTML = swatch(t.colour, 28);
        else mark(g, t.icon, theme.gold, 26);
        b.appendChild(g);
        b.appendChild(h('div', 'n', t.label));
        if (t.tag) b.appendChild(h('div', 'tag', t.tag));
        b.title = t.hint || t.label;
        b.addEventListener('click', () => { if (applyTool(t)) drawAll(); });
        grid.appendChild(b);
        tileCells.set(t.id, b);
      }
    }

    function drawGrid() {
      const tiles = filterTools(tilesNow(), queries.get(mode) || '');
      const sig = `${mode}|${tiles.map((t) => t.id).join(',')}`;
      if (sig !== gridSig) { gridSig = sig; buildGrid(tiles); }
      const t = toolNow();
      for (const [id, b] of tileCells) b.classList.toggle('on', !!t && id === t.id);
      const m = modeOf(mode);
      headT.textContent = m.label;
      headS.textContent = m.hint;
    }

    // The knobs are rebuilt only when WHICH knobs there are changes, because
    // rebuilding a slider under the hand that is dragging it takes it away.
    let knobSig = '';
    const knobShow = [];

    function knobsFor() {
      const t = toolNow();
      const act = actOf(t);
      if (act === 'terrain') {
        const row = ed.brushRow(t.brush);
        return (row ? row.params : []).map((p) => ({
          name: p.name, min: p.min, max: p.max, step: p.step, unit: p.unit,
          get: () => ed.brushValue(t.brush, p.name),
          set: (v) => ed.setBrushParam(t.brush, p.name, v),
        }));
      }
      if (act === 'scatter') {
        return [
          { name: 'size', min: 1, max: 120, step: 1, unit: 'm', get: () => ed.scatter.r, set: (v) => ed.setScatter({ r: v }).r },
          { name: 'density', min: 0, max: 20, step: 0.5, unit: 'per 100 sq m', get: () => ed.scatter.density, set: (v) => ed.setScatter({ density: v }).density },
        ];
      }
      return [];
    }

    /** One named slider with its value printed beside it. */
    function slider(parent, k, on = 'input') {
      const line = h('div', 'knob');
      line.appendChild(h('span', 'n', k.name));
      const s = h('input');
      s.type = 'range';
      s.min = String(k.min); s.max = String(k.max); s.step = String(k.step);
      const v = h('span', 'v', '');
      const show = () => {
        const now = k.get();
        s.value = String(now);
        v.textContent = `${now}${k.unit ? ` ${k.unit}` : ''}`;
      };
      s.addEventListener(on, () => { k.set(Number(s.value)); show(); rebuildGhost(); drawStatus(); });
      show();
      line.appendChild(s); line.appendChild(v);
      parent.appendChild(line);
      knobShow.push(show);
      return line;
    }

    /**
     * How far up and down the world floor may be set.
     *
     * Off the contract where the contract has said: a kind with a `height` knob
     * has already declared how far the ground may go either way. Only when no
     * kind has one does it fall back to this file's own FLOOR_H.
     */
    function floorRange() {
      let lo = null, hi = null;
      for (const row of ed.terrainKinds() || []) {
        for (const p of row.params) {
          if (p.name.toLowerCase() !== 'height') continue;
          lo = lo === null ? p.min : Math.min(lo, p.min);
          hi = hi === null ? p.max : Math.max(hi, p.max);
        }
      }
      if (lo === null || hi === null || hi <= lo) return { ...FLOOR_H };
      return { min: lo, max: hi, step: FLOOR_H.step };
    }

    /**
     * The floor everything is cut into, under the brush's own knobs.
     *
     * Two sliders and two buttons, and not one field to type in: the height and
     * the snow line move by dragging, the ground the whole world is made of is
     * whichever swatch is in hand in Paint, and the reset asks before it acts.
     * On `change` and not on `input`, because every one of these rebuilds every
     * chunk that is loaded.
     */
    function buildFloor(t) {
      const base = ed.terrainBase();
      if (!base) {
        knobs.appendChild(h('div', 'say', ed.terrainReady()
          ? 'the terrain tools answer no base(), so the world floor cannot be read or set.'
          : ''));
        return;
      }
      knobs.appendChild(h('div', 'say', `the floor everything is cut into: ${base.ground || 'no ground'}${ed.terrainMode() ? `, ${ed.terrainMode()} mode` : ''}`));
      const r = floorRange();
      slider(knobs, {
        name: 'floor', min: r.min, max: r.max, step: r.step, unit: 'm',
        get: () => { const b = ed.terrainBase(); return b && Number.isFinite(b.height) ? b.height : 0; },
        set: (v) => ed.setTerrainBase({ height: v }),
      }, 'change');
      slider(knobs, {
        name: 'snow line', min: 0, max: SNOW_MAX, step: 5, unit: 'm',
        get: () => { const b = ed.terrainBase(); return b && Number.isFinite(b.snowLine) ? b.snowLine : 0; },
        set: (v) => ed.setTerrainBase({ snowLine: v }),
      }, 'change');
      if (t && t.what === 'word') {
        const b = h('button', null, `make the whole world ${t.word}`);
        b.type = 'button';
        b.addEventListener('click', () => { ed.setTerrainBase({ ground: t.word }); knobSig = ''; drawAll(); });
        knobs.appendChild(b);
      }
      const reset = h('button', null, ed.resetAsked() ? 'press again to drop every stroke' : 'drop every stroke');
      reset.type = 'button';
      reset.classList.toggle('armed', ed.resetAsked());
      reset.addEventListener('click', () => { ed.terrainReset(); knobSig = ''; drawAll(); });
      knobs.appendChild(reset);
    }

    function buildKnobs(rows) {
      knobs.textContent = '';
      knobShow.length = 0;
      for (const k of rows) slider(knobs, k);
      // Creatures alone carry a question that is not a number: whether the
      // thing only comes up after dark.
      if (mode === 'creatures') {
        const tog = h('div', 'toggle');
        tog.appendChild(mark(h('span'), ed.ghost.night ? 'night' : 'day', theme.gold, 15));
        tog.appendChild(h('span', null, 'only after dark'));
        tog.classList.toggle('on', ed.ghost.night);
        tog.addEventListener('click', () => {
          const on = !ed.ghost.night;
          ed.setGhost({ night: on });
          ed.say(on ? 'what goes down next comes up only after dark.' : 'what goes down next comes up at any hour.');
          knobSig = '';
          drawAll();
        });
        knobs.appendChild(tog);
      }
      const t = toolNow();
      const m = modeOf(mode);
      const words = !t
        ? 'Nothing in this tray yet.'
        : (m.place
          ? 'Click the ground to put one down. It is taken hold of the moment it lands: drag to move it, R to turn, brackets to size, Delete to remove.'
          : (m.scatter
            ? 'Hold the left button and sweep. Shift rubs out what the same tile put down.'
            : (t.line
              ? 'Click where it starts, then click where it ends. Escape lets a half drawn one go.'
              : 'Hold the left button and paint. Shift turns the brush over.')));
      knobs.appendChild(h('div', 'say', words));
      if (actOf(t) === 'terrain') buildFloor(t);
    }

    function drawKnobs() {
      const rows = knobsFor();
      const t = toolNow();
      const sig = `${mode}|${t ? t.id : ''}|${rows.map((k) => `${k.name}:${k.min}:${k.max}:${k.step}`).join(',')}`;
      if (sig !== knobSig) { knobSig = sig; buildKnobs(rows); }
      for (const show of knobShow) show();
    }

    function drawSpaces() {
      const have = new Set(ed.spaces);
      for (const s of ed.disk) have.add(s.id);
      for (const s of ed.openSpaces) have.add(s);
      const want = [...have].sort();
      const sig = want.join(',');
      if (spaceSel.dataset.sig !== sig) {
        spaceSel.dataset.sig = sig;
        spaceSel.textContent = '';
        if (!want.length) { const o = h('option', null, 'no spaces yet'); o.value = ''; spaceSel.appendChild(o); }
        for (const id of want) { const o = h('option', null, id); o.value = id; spaceSel.appendChild(o); }
      }
      if (ed.space) spaceSel.value = ed.space.id;
      const busy = typeof document !== 'undefined' ? document.activeElement : null;
      if (busy !== spName) spName.value = ed.space ? ed.space.name : '';
      if (busy !== spNote) spNote.value = ed.space ? (ed.space.note || '') : '';
      if (busy !== spR) spR.value = ed.space ? String(ed.space.radius) : '';
    }

    function drawCard() {
      const sel = ed.selection();
      const m = modeOf(mode);
      const e = sel && ed.doc ? ed.doc.at(sel) : null;
      const show = !!e && !!m && !!m.place;
      card.style.display = show ? '' : 'none';
      if (!show) return;
      cardT.textContent = labelOf(sel.list, e);
      const has = (k) => k in e;
      fYaw.row.style.display = has('yaw') ? '' : 'none';
      fScale.row.style.display = has('scale') ? '' : 'none';
      fName.row.style.display = (has('name') || has('label')) ? '' : 'none';
      fNote.row.style.display = has('note') ? '' : 'none';
      const busy = typeof document !== 'undefined' ? document.activeElement : null;
      if (busy !== fYaw.input) fYaw.input.value = String(e.yaw ?? 0);
      if (busy !== fScale.input) fScale.input.value = String(e.scale ?? 1);
      if (busy !== fName.input) fName.input.value = String(e.label ?? e.name ?? '');
      if (busy !== fNote.input) fNote.input.value = String(e.note ?? '');
      const p = pointOf(sel.list, e);
      cardWords.textContent = `${ed.space.name}, ${p ? `${p.x}, ${p.z}` : 'no point of its own'} in its own frame.`;
    }

    function drawStatus() {
      const t = toolNow();
      const act = actOf(t);
      const m = modeOf(mode);
      sMode.textContent = m ? m.label : mode;
      sTool.textContent = t ? t.label : 'nothing in the tray';
      if (act === 'terrain') {
        const b = ed.brush;
        sSize.textContent = `${b.r} m${b.amount ? `, ${b.amount} m of it` : ''}${b.word ? `, ${b.word}` : ''}`;
      } else if (act === 'scatter') {
        const s = ed.scatter;
        sSize.textContent = `${s.r} m, ${s.density} per 100 sq m, about ${ed.scatterCount(s.r, s.density)} a sweep`;
      } else sSize.textContent = 'one at a time';
      sWhere.textContent = hover
        ? `${Math.round(hover.x)}, ${Math.round(hover.z)} at ${hover.y.toFixed(1)} m`
        : 'the cursor is off the ground';
      const waiting = ed.autosaveWaiting().length;
      sSpace.textContent = ed.space
        ? `${ed.space.name}${waiting || ed.groundDirty ? ', unsaved' : ', saved'}`
        : 'no space yet';
      const line = ed.status[0];
      sLast.textContent = line ? line.text : '';
      sLast.classList.toggle('bad', !!(line && line.kind === 'bad'));
    }
    this._drawStatus = drawStatus;

    function drawAll() { drawRail(); drawGrid(); drawKnobs(); drawSpaces(); drawCard(); drawStatus(); syncSelectionBox(); syncLineGhost(); }
    this._drawAll = drawAll;

    // ------------------------------------------------------- the cursor --

    const sc = ctx.sc;
    const canvas = sc && sc.renderer && sc.renderer.domElement;
    const scene = sc && sc.scene;
    const camera = sc && sc.camera;
    const heightAt = (x, z) => (typeof ctx.runtime?.heightAt === 'function' ? ctx.runtime.heightAt(x, z) : 0);
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let ghost = null, hover = null, ghostKey = '';
    let spaceRing = null, selBox = null, lineDraw = null;
    let press = null, dragging = null;
    let live = false;

    function ndcOf(e) {
      const r = canvas.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1));
      return ndc;
    }

    /**
     * The ring, and the ghost of what is about to be put down.
     *
     * A brush and a scatter both wear a ring of their own radius, because the
     * ring is the ground the next press will take. A single placement wears the
     * footprint of the thing itself.
     */
    function rebuildGhost() {
      if (!scene) return;
      const t = toolNow();
      const act = actOf(t);
      const r = ringR();
      const key = `${mode}:${t ? t.id : ''}:${act}:${r}:${ed.ghost.scale}:${ed.ghost.kind}`;
      if (key === ghostKey) return;
      ghostKey = key;
      if (ghost) { scene.remove(ghost); disposeGhost(ghost); ghost = null; }
      if (act === 'terrain' || act === 'scatter') {
        ghost = brushRing(r);
      } else if (act === 'place' && t) {
        const made = ghostFor(t.tab, t.id, { scale: ed.ghost.scale, kind: ed.ghost.kind, label: ed.ghost.label, r, realm: 'greenwold' });
        ghost = made ? made.group : null;
      }
      if (ghost) { ghost.visible = false; scene.add(ghost); }
    }
    this._rebuildGhost = rebuildGhost;

    function syncLineGhost() {
      if (!scene) return;
      const from = ed.lineAt();
      if (!from || !live) { if (lineDraw) lineDraw.visible = false; return; }
      if (!lineDraw) { lineDraw = lineGhost(); scene.add(lineDraw); }
      lineDraw.set(from, hover || from, heightAt);
      lineDraw.visible = true;
    }

    function syncRing() {
      if (!scene) return;
      if (spaceRing) { scene.remove(spaceRing); spaceRing = null; }
      if (!live) return;
      const s = ed.space;
      if (!s) return;
      spaceRing = radiusRing(s.radius);
      spaceRing.position.set(s.at.x, heightAt(s.at.x, s.at.z) + 0.4, s.at.z);
      scene.add(spaceRing);
    }

    function syncSelectionBox() {
      syncRing();
      if (!scene) return;
      if (!selBox) { selBox = selectionBox(); scene.add(selBox); }
      const sel = ed.selection();
      const s = ed.space;
      if (!sel || !s || !live) { selBox.visible = false; return; }
      const e = ed.doc.at(sel);
      const p = pointOf(sel.list, e);
      if (!p) { selBox.visible = false; return; }
      const wx = s.at.x + p.x, wz = s.at.z + p.z;
      const y = heightAt(wx, wz);
      selBox.box.set(new THREE.Vector3(wx - 2, y - 0.5, wz - 2), new THREE.Vector3(wx + 2, y + 4, wz + 2));
      selBox.visible = true;
    }
    this._syncSelectionBox = syncSelectionBox;

    /** What is selected, in world metres, or null. */
    function selectionPoint() {
      const sel = ed.selection(); const s = ed.space;
      if (!sel || !s) return null;
      const p = pointOf(sel.list, ed.doc.at(sel));
      return p ? { x: s.at.x + p.x, z: s.at.z + p.z } : null;
    }

    /** How far a world point is from the pointer on screen, in pixels. */
    function screenDist(world, e) {
      const v = new THREE.Vector3(world.x, heightAt(world.x, world.z) + 1, world.z).project(camera);
      const r = canvas.getBoundingClientRect();
      const px = ((v.x + 1) / 2) * r.width + r.left, py = ((1 - v.y) / 2) * r.height + r.top;
      return Math.hypot(px - e.clientX, py - e.clientY);
    }

    function onMove(e) {
      if (!live || !canvas || !camera) return;
      const p = groundUnder(camera, ndcOf(e), heightAt, ray);
      hover = p;
      ed.setLookAt(p);
      if (ghost) {
        ghost.visible = !!p;
        if (p) { ghost.position.set(p.x, p.y, p.z); ghost.rotation.y = ed.ghost.yaw * Math.PI / 180; }
      }
      if (dragging && p) { ed.moveTo(p.x, p.z); drawAll(); }
      if (ed.lineAt()) syncLineGhost();
      // A HELD BUTTON. The spacing and the interval are the editor's, not this
      // file's: it is handed every move and answers whether that move was far
      // enough and late enough to be worth a stroke.
      if (press && p && !press.line) {
        if (press.act === 'terrain') {
          const res = ed.dragStroke(p.x, p.z, { now: Date.now() });
          if (res.ok) ed.rebuildGround(p.x, p.z, ed.brush.r + 8);
          else if (res.text) { press.act = 'none'; }
        } else if (press.act === 'scatter') {
          // A CLICK IS ONE THING AND A DRAG IS A SWEEP. The sweep begins on the
          // first movement, not on the press, so a single click in Objects puts
          // down a single rock rather than a ring full of them.
          const res = press.began
            ? ed.sweepStroke(p.x, p.z, { now: Date.now() })
            : ed.sweepBegin(p.x, p.z, { shift: press.shift, now: Date.now() });
          press.began = true;
          if (!res.ok && res.text) press.act = 'none';
        }
      }
      drawStatus();
    }

    function onDown(e) {
      if (!live || !canvas || e.button !== 0) return;     // the right button still turns the camera
      const p = groundUnder(camera, ndcOf(e), heightAt, ray);
      const sel = selectionPoint();
      const onGizmo = sel && screenDist(sel, e) < 26;
      // In the editor the left button belongs to the editor, always: there is
      // no swing and no walk to give it back to while the mode is up.
      if (e.preventDefault) e.preventDefault();
      if (e.stopPropagation) e.stopPropagation();
      const t = toolNow();
      const act = onGizmo ? 'move' : actOf(t);
      press = { x: e.clientX, y: e.clientY, act, shift: !!e.shiftKey, began: false, line: act === 'terrain' && ed.brush.line };
      if (onGizmo) { dragging = true; return; }
      if (!p) {
        press = null;
        ed.say('the cursor is not on any ground, so the brush had nothing to take hold of.', 'bad');
        drawStatus();
        return;
      }
      if (act === 'terrain' && !press.line) {
        const res = ed.dragBegin(p.x, p.z, { shift: e.shiftKey, now: Date.now() });
        if (res.ok) ed.rebuildGround(p.x, p.z, ed.brush.r + 8);
        else { press = null; drawStatus(); }
      }
      // A scatter waits for the pointer to move. See onMove.

    }

    function onUp(e) {
      if (!live || !press) return;
      const moved = Math.hypot(e.clientX - press.x, e.clientY - press.y);
      const act = press.act, wasLine = press.line, began = press.began, shift = press.shift;
      press = null; dragging = null;
      if (act === 'terrain' && wasLine) {
        if (moved > CLICK_SLOP) return;
        const p = groundUnder(camera, ndcOf(e), heightAt, ray);
        if (!p) { ed.say('the cursor is not on any ground, so the line has no end there.', 'bad'); drawStatus(); return; }
        const from = ed.lineAt();
        const res = from ? ed.lineEnd(p.x, p.z, { shift: e.shiftKey }) : ed.lineStart(p.x, p.z);
        if (from && res.ok) {
          const mid = { x: (from.x + p.x) / 2, z: (from.z + p.z) / 2 };
          ed.rebuildGround(mid.x, mid.z, Math.hypot(p.x - from.x, p.z - from.z) / 2 + ed.brush.r + 8);
        }
        drawAll();
        return;
      }
      if (act === 'terrain') { ed.dragEnd(); drawAll(); return; }
      if (act === 'scatter') {
        if (began) { ed.sweepEnd(); drawAll(); return; }
        // Never moved: a click. One thing, or with shift one rub of the ring.
        const p = groundUnder(camera, ndcOf(e), heightAt, ray);
        if (!p) { ed.say('the cursor is not on any ground, so nothing was placed.', 'bad'); drawStatus(); return; }
        if (shift) ed.eraseAt(p.x, p.z, { r: ed.scatter.r });
        else ed.placeAt(p.x, p.z);
        drawAll();
        return;
      }
      if (act === 'move') { drawAll(); return; }
      if (moved > CLICK_SLOP) return;
      const p = groundUnder(camera, ndcOf(e), heightAt, ray);
      if (!p) { ed.say('the cursor is not on any ground, so nothing was placed.', 'bad'); drawStatus(); return; }
      // A click in a placing mode takes hold of what is already standing there
      // before it adds another. That is how a building is moved rather than
      // doubled by a second click on its own roof.
      if (ed.nearestTo(p.x, p.z, PICK_R)) ed.selectAt(p.x, p.z, PICK_R);
      else ed.placeAt(p.x, p.z);
      drawAll();
    }

    /**
     * The wheel over the world, which is the brush and not the camera.
     *
     * `stopImmediatePropagation` and not `stopPropagation`, because input.js
     * listens on this same canvas, and stopping propagation alone leaves a
     * listener on the same node to run and zoom the camera under the brush.
     */
    function onWheel(e) {
      if (!live) return;
      if (e.preventDefault) e.preventDefault();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      else if (e.stopPropagation) e.stopPropagation();
      const dir = (e.deltaY || 0) > 0 ? -1 : 1;
      const t = toolNow();
      const act = actOf(t);
      if (act === 'terrain') {
        if (e.shiftKey) {
          const row = ed.brushRow(t.brush);
          if (!row || !row.amount) { ed.say(`${t.label} has no amount to change.`, 'bad'); drawStatus(); return; }
          const was = ed.brushValue(t.brush, row.amount.name);
          const step = Math.max(row.amount.step, Math.abs(was) * 0.15);
          const next = ed.setBrushParam(t.brush, row.amount.name, was + step * dir);
          ed.say(`${t.label} is set to ${next}.`);
        } else ed.bumpRadius(dir);
      } else if (act === 'scatter') {
        if (e.shiftKey) {
          const next = ed.setScatter({ density: ed.scatter.density + 0.5 * dir }).density;
          ed.say(`${next} of them per 100 square metres, about ${ed.scatterCount(ed.scatter.r, next)} a sweep.`);
        } else {
          const was = ed.scatter.r;
          const next = ed.setScatter({ r: was + Math.max(1, was * 0.15) * dir }).r;
          ed.say(`the sweep is ${next} m across.`);
        }
      } else return;
      rebuildGhost();
      knobSig = '';
      drawAll();
    }

    const editing = (t) => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');

    function onKey(e) {
      if (!live) return;
      if (editing(e.target)) return;
      const k = String(e.key || '').toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      const t = toolNow();
      const onGround = actOf(t) === 'terrain';
      let took = true;
      if (mod && k === 's') { if (e.preventDefault) e.preventDefault(); ed.saveAll().then(() => ed.list()).then(drawAll).catch(() => drawAll()); }
      else if (mod && k === 'z' && !e.shiftKey) { if (onGround) ed.terrainUndo(); else ed.undo(); }
      else if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) { if (onGround) ed.terrainRedo(); else ed.redo(); }
      else if (!mod && /^[1-9]$/.test(k)) { setMode(MODE_IDS[Number(k) - 1]); }
      else if (!mod && (k === '+' || k === '=')) { if (onGround) ed.bumpRadius(1); else ed.setScatter({ r: ed.scatter.r * 1.15 }); rebuildGhost(); knobSig = ''; }
      else if (!mod && (k === '-' || k === '_')) { if (onGround) ed.bumpRadius(-1); else ed.setScatter({ r: ed.scatter.r / 1.15 }); rebuildGhost(); knobSig = ''; }
      else if (!mod && k === 'r') ed.turn(e.shiftKey ? -TURN_DEG : TURN_DEG);
      else if (!mod && k === ']') ed.grow(SCALE_STEP);
      else if (!mod && k === '[') ed.grow(1 / SCALE_STEP);
      else if (!mod && (k === 'delete' || k === 'backspace')) ed.del();
      else if (!mod && k === 'escape' && (ed.lineAt() || ed.selection())) {
        // Escape lets go of what is held FIRST. Only a press with nothing held
        // leaves the editor, and that one is the window manager's: this press
        // is taken out of the frame so the same key is not read twice.
        if (ed.lineAt()) ed.lineCancel(); else ed.deselect();
        ctx?.input?.swallow?.('escape');
        syncLineGhost();
      }
      else took = false;
      if (!took) return;
      if (e.stopPropagation) e.stopPropagation();
      drawAll();
    }

    if (canvas) {
      canvas.addEventListener('pointerdown', onDown, true);
      canvas.addEventListener('pointermove', onMove);
      canvas.addEventListener('wheel', onWheel, { capture: true, passive: false });
      window.addEventListener('pointerup', onUp);
    }
    window.addEventListener('keydown', onKey, true);

    this._setLive = (on) => {
      live = !!on;
      face.style.display = live ? '' : 'none';
      if (!live) {
        press = null; dragging = null;
        ed.lineCancel();
        if (ghost) ghost.visible = false;
        if (lineDraw) lineDraw.visible = false;
        if (selBox) selBox.visible = false;
        if (spaceRing && scene) { scene.remove(spaceRing); spaceRing = null; }
      } else { rebuildGhost(); syncSelectionBox(); syncLineGhost(); }
      return live;
    };

    this._teardown = () => {
      if (canvas) {
        canvas.removeEventListener('pointerdown', onDown, true);
        canvas.removeEventListener('pointermove', onMove);
        canvas.removeEventListener('wheel', onWheel, true);
      }
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKey, true);
      if (ghost && scene) { scene.remove(ghost); disposeGhost(ghost); ghost = null; }
      if (lineDraw && scene) { scene.remove(lineDraw); lineDraw.geometry.dispose(); lineDraw.material.dispose(); lineDraw = null; }
      if (spaceRing && scene) { scene.remove(spaceRing); spaceRing = null; }
      if (selBox && scene) { scene.remove(selBox); selBox = null; }
      if (face && face.remove) face.remove();
    };

    // Every brush the terrain half offers has to be reachable from some tray.
    // A kind that landed nowhere is a kind nobody can take in hand, and that is
    // the class of bug this rebuild was meant to end, so it is said out loud at
    // build time rather than found by a user a week later.
    try { auditTools(ed.terrainKinds() || [], { has: ctx.hasProp }); }
    catch (err) { ed.say(String(err && err.message), 'bad'); }

    setMode(MODE_IDS[0], { quiet: true });
    ed.list().then(drawAll).catch(() => drawAll());
    drawAll();
  },

  open(ctx) {
    const on = ctx && ctx.dev && ctx.dev.on;
    if (!on) {
      ctx?.hud?.toast?.('the editor only opens in dev mode. Press the key under Escape first.', 'bad');
      ctx?.windows?.close?.('editor');
      return;
    }
    setMarkersVisible(true, ctx.sc && ctx.sc.scene);
    // The gameplay HUD goes off the screen for as long as the editor is up.
    const put = ctx?.hud?.setMode?.('editor');
    if (this._setLive) this._setLive(true);
    ctx?.hud?.toast?.('the editor is open. The sidebar is the mode, 1 to 9 pick one, the tray beside it is what goes down. '
      + 'Hold the left button to paint, shift turns a brush over or rubs a scatter out, the wheel widens it. '
      + 'Right drag still turns the camera. Everything writes itself a second after you stop. L or Escape leaves.');
    if (this._ed && put) this._ed.say(`the gameplay HUD is put away, ${put.hidden} ${put.hidden === 1 ? 'piece' : 'pieces'} of it, and it comes back when you leave.`);
    if (this._drawAll) this._drawAll();
  },

  close(ctx) {
    if (this._setLive) this._setLive(false);
    if (this._ed) this._ed.disarm();
    if (this._rebuildGhost) this._rebuildGhost();
    ctx?.hud?.setMode?.('play');
    setMarkersVisible(!!(ctx && ctx.dev && ctx.dev.on), ctx && ctx.sc && ctx.sc.scene);
  },

  /**
   * Every frame the editor is open. The autosave is a clock and nothing else,
   * so it is driven from here rather than from a timer nobody can measure.
   */
  tick(dt, ctx) {
    const ed = this._ed;
    if (!ed || !ed.autosaveDue(Date.now())) return;
    ed.tickAutosave(Date.now()).then((res) => {
      if (res && res.ok && this._drawAll) this._drawAll();
    }).catch(() => {});
  },

  dispose() { if (this._teardown) this._teardown(); },
};

export default panel;
