// The editor's window, its cursor and its keys.
//
// Buttons, and nothing else: every one of them calls `createEditor(ctx)`, which
// is the file next door and has no DOM in it. That is the same split the dev
// bench keeps, for the same reason. What the tests drive is what the buttons
// press.
//
// THE THREE THINGS THAT ARE NOT BUTTONS
//
//   THE CURSOR. While something is armed, the pointer's ray is marched against
//   `runtime.heightAt` until it goes under the ground, so the ghost sits on the
//   real terrain and not on a plane at the player's feet. That matters here
//   more than anywhere: the editor is used in fly mode, a hundred metres up,
//   looking down a hillside.
//
//   THE CLICK. A left press on the canvas is swallowed in the capture phase
//   while a tool is armed, so `input.js` never sees it and the game neither
//   swings nor walks. A RIGHT drag still turns the camera, which is why the
//   swallow is left button only. Escape drops the tool and gives the left
//   button back.
//
//   THE KEYS. R and shift R turn, the brackets scale, Delete removes, ctrl Z
//   and ctrl Y walk the stack, ctrl S saves. On the Terrain tab 1 to 9 pick a
//   brush, plus and minus widen and narrow it, and ctrl Z walks the GROUND's
//   stack instead of the space's, because the ground is what is being made
//   there. They are taken in the capture phase while the window is open, and
//   they are NOT taken while the caret is in one of this window's own text
//   boxes, because a space called "Reedy" is otherwise unnameable.

import * as THREE from 'three';
import { createEditor } from './editor.js';
import { TABS, TAB_IDS, MARKER_KINDS, ANGLE_NAMES } from './palette.js';
import { ghostFor, radiusRing, selectionBox, disposeGhost, lineGhost } from './ghost.js';
import { LIST_WORD, TURN_DEG, SCALE_STEP, labelOf, pointOf } from './space_doc.js';
import { setMarkersVisible } from '../../world/plan_models.js';

/** How far the pointer may move between press and release and still be a click. */
export const CLICK_SLOP = 5;
/**
 * What the panel says when the Terrain tab has no brushes to show.
 *
 * How often a held brush lays a stroke, and how far apart, is NOT here: that is
 * `DRAG_MS` and `DRAG_SPACING` in editor.js, because the editor is what the
 * test drives and a spacing rule kept in the panel would be a rule no test
 * could reach.
 */
export const NO_BRUSHES = 'the terrain tools name no brushes, so there is nothing to sculpt with yet.';
/** How far the ground march looks, in metres, and how fine it gets. */
export const MARCH_MAX = 900;
export const MARCH_FINE = 0.05;

const h = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

/**
 * Where the pointer's ray meets the ground.
 *
 * A march, not a plane: the ray is walked outward in steps that grow with
 * distance until the sample is below the height field, then bisected. `heightAt`
 * is the runtime's, so a ground the terrain half has just raised is the ground
 * this lands on.
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
.bw-win-editor{min-width:600px;max-width:760px}
.bw-win-editor .bw-e{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:5px 2px;border-top:1px solid #2a332a}
.bw-win-editor .bw-e .n{flex:0 0 108px;color:#cbd8c2}
.bw-win-editor .bw-e small{color:#8b9686;font-size:11.5px}
.bw-win-editor input[type=text],.bw-win-editor input[type=number]{font:inherit;font-size:12.5px;padding:3px 7px;border-radius:5px;
  border:1px solid #3f4c3b;background:#1a201a;color:#e8f0e2}
.bw-win-editor input[type=text]{width:150px}
.bw-win-editor input[type=number]{width:74px}
.bw-win-editor input[type=range]{width:150px}
.bw-win-editor select{font:inherit;font-size:12.5px;padding:3px 6px;border-radius:5px;border:1px solid #3f4c3b;background:#1a201a;color:#e8f0e2}
.bw-win-editor button{font:inherit;font-size:12px;padding:3px 9px;border-radius:6px;
  border:1px solid #4f6349;background:#2c3a2b;color:#e8f0e2;cursor:pointer}
.bw-win-editor button.on{background:#3a5030;border-color:#7c9c6c}
.bw-win-editor button.armed{background:#5b4416;border-color:#c9a44a;color:#f2dc9c}
.bw-win-editor h3{margin:12px 0 3px;font-size:12px;letter-spacing:.09em;text-transform:uppercase;color:#8fa387}
.bw-win-editor .bw-tabs{display:flex;gap:4px;flex-wrap:wrap;margin:4px 0}
.bw-win-editor .bw-list{max-height:210px;overflow:auto;border:1px solid #2a332a;border-radius:6px;padding:4px;width:100%}
.bw-win-editor .bw-list.short{max-height:132px}
.bw-win-editor .bw-list .r{display:flex;align-items:center;gap:8px;padding:2px 4px;border-radius:4px;cursor:pointer}
.bw-win-editor .bw-list .r:hover{background:rgba(255,255,255,.06)}
.bw-win-editor .bw-list .r.here{background:rgba(201,167,90,.16);outline:1px solid rgba(201,167,90,.45)}
.bw-win-editor .bw-list .r .nm{flex:1 1 auto}
.bw-win-editor .bw-list .r .d{color:#95a08f;font-size:11.5px}
.bw-win-editor .bw-list .r .tag{flex:0 0 auto;font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:#8fa387}
.bw-win-editor .bw-list .r.real .tag{color:#c9a44a}
.bw-win-editor .bw-read{position:sticky;top:0;z-index:2;margin:0 0 4px;padding:5px 6px;border:1px solid #2a332a;border-radius:6px;
  background:#161c16;color:#9fb096;font-variant-numeric:tabular-nums;font-size:12px;line-height:1.5}
.bw-win-editor .bw-read b{color:#dff0d4;font-weight:600}
.bw-win-editor .bw-say{max-height:120px;overflow:auto;border-left:2px solid #4f6349;background:rgba(0,0,0,.25);
  padding:4px 8px;margin:6px 0 0;border-radius:0 4px 4px 0;font-size:12px;line-height:1.45}
.bw-win-editor .bw-say .l{color:#cbd8c2}
.bw-win-editor .bw-say .l.bad{color:#e0a08a}
.bw-win-editor .bw-list .r.bw-brush{flex-wrap:wrap;gap:6px;padding:4px}
.bw-win-editor .bw-list .r.bw-brush .nm{flex:0 0 132px;color:#dff0d4}
.bw-win-editor .bw-list .r.bw-brush .p{display:inline-flex;align-items:center;gap:4px}
.bw-win-editor .bw-list .r.bw-brush .p input[type=range]{width:104px}
.bw-win-editor .bw-list .r.bw-brush .p .d{min-width:58px;text-align:right;font-variant-numeric:tabular-nums}
`;

function css() {
  if (typeof document === 'undefined' || document.getElementById('bw-editor-css')) return;
  const s = document.createElement('style');
  s.id = 'bw-editor-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

let builtEditor = null;
/** The editor the open window built, for the console and the harness. */
export const editorOf = () => builtEditor;

export const panel = {
  id: 'editor',
  title: 'Editor',
  key: 'l',

  build(root, ctx) {
    if (typeof document === 'undefined') return;
    css();
    root.classList.add('bw-win-editor');
    root.textContent = '';
    const ed = createEditor(ctx);
    this._ed = ed;
    this._ctx = ctx;
    builtEditor = ed;

    const row = (label, hint) => {
      const r = h('div', 'bw-e');
      const n = h('span', 'n', label);
      if (hint) n.appendChild(h('small', null, ` ${hint}`));
      r.appendChild(n);
      root.appendChild(r);
      return r;
    };
    const btn = (parent, label, fn) => {
      const b = h('button', null, label);
      b.type = 'button';
      b.addEventListener('click', () => { fn(b); });
      parent.appendChild(b);
      return b;
    };

    const read = h('div', 'bw-read');
    root.appendChild(read);

    // ------------------------------------------------------------ spaces --
    root.appendChild(h('h3', null, 'Space'));
    const spaceRow = row('Open', 'a space already on disk');
    const spaceSel = h('select');
    spaceRow.appendChild(spaceSel);
    btn(spaceRow, 'open', () => { ed.open(spaceSel.value); drawAll(); });
    btn(spaceRow, 'reload from disk', () => { ed.reload(); drawAll(); });
    btn(spaceRow, 'what is on disk', async () => { await ed.list(); drawSpaces(); drawSay(); });

    const newRow = row('New space here', 'centred where you are looking');
    const newName = h('input'); newName.type = 'text'; newName.placeholder = 'the name of the place';
    const newR = h('input'); newR.type = 'number'; newR.value = '60'; newR.min = '8'; newR.step = '2';
    newRow.appendChild(newName); newRow.appendChild(newR);
    btn(newRow, 'make it', () => { ed.newSpace(newName.value, Number(newR.value)); drawAll(); });

    const aboutRow = row('This space', 'name, note and how far it reaches');
    const spName = h('input'); spName.type = 'text';
    const spNote = h('input'); spNote.type = 'text'; spNote.placeholder = 'a sentence about the place';
    const spR = h('input'); spR.type = 'number'; spR.min = '8'; spR.step = '2';
    aboutRow.appendChild(spName); aboutRow.appendChild(spNote); aboutRow.appendChild(spR);
    btn(aboutRow, 'write it', () => {
      ed.setSpace({ name: spName.value, note: spNote.value, radius: Number(spR.value) });
      drawAll();
    });
    btn(aboutRow, 'save (ctrl S)', async () => { await ed.save(); await ed.list(); drawAll(); });

    // ----------------------------------------------------------- palette --
    root.appendChild(h('h3', null, 'Palette'));
    const tabs = h('div', 'bw-tabs');
    root.appendChild(tabs);
    const tabBtns = new Map();
    for (const t of TABS) {
      const b = h('button', null, t.label);
      b.type = 'button';
      b.addEventListener('click', () => { ed.setTab(t.id); drawAll(); });
      tabs.appendChild(b);
      tabBtns.set(t.id, b);
    }

    const findRow = row('Find', 'name, or what it is');
    const find = h('input'); find.type = 'text'; find.placeholder = 'inn, boss, stand-in, beech';
    find.addEventListener('input', () => { ed.setQuery(find.value); drawRows(); });
    findRow.appendChild(find);
    btn(findRow, 'drop the tool (Esc)', () => { ed.disarm(); drawAll(); });

    // the knobs the ghost carries into whatever is placed next
    const knobRow = row('Placing', 'turn, size, and the rest');
    const yawIn = h('input'); yawIn.type = 'number'; yawIn.value = '0'; yawIn.step = String(TURN_DEG);
    const sclIn = h('input'); sclIn.type = 'number'; sclIn.value = '1'; sclIn.step = '0.1'; sclIn.min = '0.2';
    yawIn.addEventListener('change', () => { ed.setGhost({ yaw: Number(yawIn.value) }); rebuildGhost(); });
    sclIn.addEventListener('change', () => { ed.setGhost({ scale: Number(sclIn.value) }); rebuildGhost(); });
    knobRow.appendChild(h('small', null, 'yaw')); knobRow.appendChild(yawIn);
    knobRow.appendChild(h('small', null, 'scale')); knobRow.appendChild(sclIn);
    const nightBox = h('input'); nightBox.type = 'checkbox';
    nightBox.addEventListener('change', () => { ed.setGhost({ night: nightBox.checked }); drawRead(); });
    const nightLbl = h('label', null, ' only after dark');
    nightLbl.prepend(nightBox);
    knobRow.appendChild(nightLbl);
    const whoIn = h('input'); whoIn.type = 'text'; whoIn.placeholder = 'a person’s name, or blank';
    whoIn.addEventListener('input', () => ed.setGhost({ name: whoIn.value }));
    knobRow.appendChild(whoIn);

    // the marker form, which is the whole point of the Markers tab
    const markRow = row('Marker', 'what belongs here that we have not made');
    const mLabel = h('input'); mLabel.type = 'text'; mLabel.placeholder = 'a watchtower goes here';
    const mNote = h('input'); mNote.type = 'text'; mNote.placeholder = 'two storeys, a brazier on top';
    const mKind = h('select');
    for (const k of MARKER_KINDS) { const o = h('option', null, k); o.value = k; mKind.appendChild(o); }
    mLabel.addEventListener('input', () => ed.setGhost({ label: mLabel.value }));
    mNote.addEventListener('input', () => ed.setGhost({ note: mNote.value }));
    mKind.addEventListener('change', () => { ed.setGhost({ kind: mKind.value }); rebuildGhost(); });
    markRow.appendChild(mLabel); markRow.appendChild(mNote); markRow.appendChild(mKind);

    const rowsList = h('div', 'bw-list');
    root.appendChild(rowsList);

    // ----------------------------------------------------------- terrain --
    //
    // NOT ONE BRUSH IS NAMED HERE. Every row below the World line is built out
    // of what `window.__bw.terrain.kinds()` answered, and every slider takes
    // its min, max, step and starting value from the knob the contract
    // described. That is why a mountain gets a 600 m radius and a 400 m lift
    // while a smooth gets 40 m, with nothing in this file to keep up to date.

    // The list is rebuilt only when the contract's own answer changes, because
    // rebuilding it under a slider the user is dragging takes the slider away.
    let brushSig = null;
    const brushCells = new Map();

    const worldRow = row('World', 'the floor every stroke is cut into');
    const worldMode = h('span', 'd', '');
    const baseH = h('input'); baseH.type = 'number'; baseH.step = '1'; baseH.placeholder = 'height';
    const baseG = h('input'); baseG.type = 'text'; baseG.placeholder = 'grass'; baseG.style.width = '90px';
    const baseS = h('input'); baseS.type = 'number'; baseS.step = '5'; baseS.placeholder = 'snow line';
    worldRow.appendChild(worldMode);
    worldRow.appendChild(h('small', null, 'height')); worldRow.appendChild(baseH);
    worldRow.appendChild(h('small', null, 'ground')); worldRow.appendChild(baseG);
    worldRow.appendChild(h('small', null, 'snow line')); worldRow.appendChild(baseS);
    btn(worldRow, 'set the floor', () => {
      ed.setTerrainBase({ height: Number(baseH.value), ground: baseG.value, snowLine: Number(baseS.value) });
      drawAll();
    });
    const resetBtn = btn(worldRow, 'reset terrain', () => { ed.terrainReset(); drawAll(); });

    const groundRow = row('Ground', 'undo takes back a whole drag, not a dot of it');
    btn(groundRow, 'undo ground (ctrl Z)', () => { ed.terrainUndo(); drawAll(); });
    btn(groundRow, 'redo ground (ctrl Y)', () => { ed.terrainRedo(); drawAll(); });
    btn(groundRow, 'save ground', async () => { await ed.terrainSave(); drawAll(); });
    btn(groundRow, 'read the brushes again', () => { ed.refreshKinds(); brushSig = null; drawAll(); });
    const groundWords = h('span', 'd', '');
    groundRow.appendChild(groundWords);

    const keysRow = row('Keys', 'while the Terrain tab is up');
    keysRow.appendChild(h('small', null,
      '1 to 9 pick a brush. + and - widen and narrow it. Hold the left button and drag to paint; '
      + 'shift while you drag turns the brush over where it has an other way round. A ridge or a valley takes two clicks, '
      + 'and Escape lets a half drawn one go. Ctrl Z takes back a whole drag at once.'));

    const brushList = h('div', 'bw-list');
    root.appendChild(brushList);
    this._brushList = brushList;
    this._worldRow = worldRow;

    function brushSigOf(rows) {
      // With no brushes the signature still has to say WHICH nothing this is,
      // or a terrain half that arrives half wired never redraws the line that
      // names the half that is missing.
      if (!rows) return ed.terrainReady() ? 'no kinds' : 'no terrain';
      return rows.map((r) => `${r.id}/${r.label}/${r.words.join('|')}/`
        + r.params.map((p) => `${p.name}:${p.min}:${p.max}:${p.step}:${p.default}`).join(',')).join(';');
    }

    function buildBrushes(rows) {
      brushList.textContent = '';
      brushCells.clear();
      if (!rows || !rows.length) {
        brushList.appendChild(h('div', 'r', ed.terrainReady()
          ? 'the terrain tools are there but they answer no kinds(), so there is nothing to sculpt with. Nothing on this tab will move any ground.'
          : 'the terrain tools are not in yet: nothing answers window.__bw.terrain. Nothing on this tab will move any ground.'));
        return;
      }
      rows.forEach((brow, i) => {
        const r = h('div', 'r bw-brush');
        r.appendChild(h('span', 'nm', `${i < 9 ? `${i + 1}. ` : ''}${brow.label}${brow.line ? ' (two clicks)' : ''}`));
        r.addEventListener('click', () => { ed.arm(brow.id); rebuildGhost(); drawAll(); });
        const outs = [];
        // A bearing knob on a brush that is not drawn between two points is
        // not sent until it is moved, so its readout says who is deciding it
        // rather than showing a number that is going nowhere.
        const loose = (p) => ANGLE_NAMES.includes(p.name.toLowerCase()) && !brow.line;
        for (const p of brow.params) {
          const wrap = h('span', 'p');
          wrap.appendChild(h('small', null, `${p.name} `));
          const s = h('input');
          s.type = 'range';
          s.min = String(p.min); s.max = String(p.max); s.step = String(p.step);
          s.value = String(ed.brushValue(brow.id, p.name));
          const out = h('span', 'd', '');
          const show = () => {
            const v = ed.brushValue(brow.id, p.name);
            s.value = String(v);
            out.textContent = loose(p) && !ed.brushTouched(brow.id, p.name)
              ? 'the ground decides'
              : `${v}${p.unit ? ` ${p.unit}` : ''}`;
          };
          show();
          s.addEventListener('input', () => {
            ed.setBrushParam(brow.id, p.name, Number(s.value));
            show();
            if (brow.id === ed.brush.kind) rebuildGhost();
          });
          wrap.appendChild(s); wrap.appendChild(out);
          r.appendChild(wrap);
          outs.push(show);
        }
        let wordSel = null;
        if (brow.words.length) {
          wordSel = h('select');
          for (const w of brow.words) { const o = h('option', null, w); o.value = w; wordSel.appendChild(o); }
          wordSel.value = ed.brushWord(brow.id) || brow.words[0];
          wordSel.addEventListener('change', () => { ed.setBrushWord(brow.id, wordSel.value); drawSay(); });
          r.appendChild(wordSel);
        }
        brushList.appendChild(r);
        brushCells.set(brow.id, { r, outs, wordSel });
      });
    }

    function drawBrushes() {
      const rows = ed.terrainKinds();
      const sig = brushSigOf(rows);
      if (sig !== brushSig) { brushSig = sig; buildBrushes(rows); }
      const held = ed.brush;
      for (const [id, cell] of brushCells) {
        cell.r.classList.toggle('here', id === held.kind);
        for (const f of cell.outs) f();
        if (cell.wordSel) cell.wordSel.value = ed.brushWord(id) || cell.wordSel.value;
      }
      const mode = ed.terrainMode();
      const base = ed.terrainBase();
      const count = ed.terrainCount();
      worldMode.textContent = mode ? `${mode} mode` : (ed.terrainReady() ? 'no mode() yet' : 'no terrain tools');
      if (base) {
        if (document.activeElement !== baseH) baseH.value = Number.isFinite(base.height) ? String(base.height) : '';
        if (document.activeElement !== baseG) baseG.value = typeof base.ground === 'string' ? base.ground : '';
        if (document.activeElement !== baseS) baseS.value = Number.isFinite(base.snowLine) ? String(base.snowLine) : '';
      }
      const depth = ed.terrainDepth;
      groundWords.textContent = [
        count && Number.isFinite(count.strokes) ? `${count.strokes} ${count.strokes === 1 ? 'stroke' : 'strokes'} on the ground` : '',
        depth.done ? `${depth.done} ${depth.done === 1 ? 'drag' : 'drags'} to undo` : 'nothing to undo',
        depth.undone ? `${depth.undone} to put back` : '',
        ed.lineAt() ? `a line is open at ${ed.lineAt().x}, ${ed.lineAt().z}` : '',
      ].filter(Boolean).join(', ');
      resetBtn.classList.toggle('armed', ed.resetAsked());
      resetBtn.textContent = ed.resetAsked() ? 'reset terrain: press again' : 'reset terrain';
    }

    // ---------------------------------------------------------- contents --
    root.appendChild(h('h3', null, 'What stands in this space'));
    const editRow = row('Selected', 'R turns, shift R the other way, brackets size, Delete removes');
    btn(editRow, 'turn right (R)', () => { ed.turn(TURN_DEG); drawAll(); });
    btn(editRow, 'turn left', () => { ed.turn(-TURN_DEG); drawAll(); });
    btn(editRow, 'bigger (])', () => { ed.grow(SCALE_STEP); drawAll(); });
    btn(editRow, 'smaller ([)', () => { ed.grow(1 / SCALE_STEP); drawAll(); });
    btn(editRow, 'remove (Del)', () => { ed.del(); drawAll(); });
    btn(editRow, 'undo (ctrl Z)', () => { ed.undo(); drawAll(); });
    btn(editRow, 'redo (ctrl Y)', () => { ed.redo(); drawAll(); });
    const contents = h('div', 'bw-list short');
    root.appendChild(contents);

    const say = h('div', 'bw-say');
    root.appendChild(say);

    // ------------------------------------------------------------- draws --

    function drawSpaces() {
      const have = new Set(ed.spaces);
      for (const s of ed.disk) have.add(s.id);
      const want = [...have].sort();
      spaceSel.textContent = '';
      if (!want.length) { const o = h('option', null, 'no spaces yet'); o.value = ''; spaceSel.appendChild(o); }
      for (const id of want) { const o = h('option', null, id); o.value = id; spaceSel.appendChild(o); }
      if (ed.space) spaceSel.value = ed.space.id;
    }

    function drawRows() {
      // The Terrain tab has a list of its own, built from the contract, so the
      // palette list is not drawn twice over the same brushes.
      if (ed.tab === 'terrain') { rowsList.textContent = ''; return; }
      const list = ed.rows();
      rowsList.textContent = '';
      if (!list.length) { rowsList.appendChild(h('div', 'r', 'nothing here matches that')); return; }
      for (const e of list.slice(0, 400)) {
        const r = h('div', 'r' + (e.real ? ' real' : '') + (ed.pick === e.id || (ed.tab === 'terrain' && ed.brush.kind === e.id) ? ' here' : ''));
        r.appendChild(h('span', 'nm', e.label));
        r.appendChild(h('span', 'd', e.hint || ''));
        if (ed.tab === 'structures') r.appendChild(h('span', 'tag', e.real ? 'modelled' : 'stand-in'));
        r.addEventListener('click', () => { ed.arm(e.id); rebuildGhost(); drawAll(); });
        rowsList.appendChild(r);
      }
      if (list.length > 400) rowsList.appendChild(h('div', 'r', `${list.length - 400} more; narrow the search`));
    }

    function drawContents() {
      contents.textContent = '';
      const list = ed.contents();
      const sel = ed.selection();
      if (!list.length) { contents.appendChild(h('div', 'r', ed.space ? 'nothing in it yet' : 'no space is open')); return; }
      for (const c of list) {
        const r = h('div', 'r' + (sel && sel.list === c.list && sel.index === c.index ? ' here' : ''));
        r.appendChild(h('span', 'nm', c.label));
        r.appendChild(h('span', 'd', `${LIST_WORD[c.list]}${c.x == null ? '' : ` at ${c.x}, ${c.z}`}`));
        r.addEventListener('click', () => { ed.select({ list: c.list, index: c.index }); drawAll(); });
        contents.appendChild(r);
      }
    }

    function drawSay() {
      say.textContent = '';
      for (const l of ed.status.slice(0, 12)) say.appendChild(h('div', 'l' + (l.kind === 'bad' ? ' bad' : ''), l.text));
    }

    function drawRead() {
      const s = ed.space;
      const c = ed.count();
      const g = ed.ghost;
      const bits = [];
      if (!s) bits.push({ text: 'no space is open' });
      else {
        bits.push({ text: s.name, bold: true });
        bits.push({ text: `at ${Math.round(s.at.x)}, ${Math.round(s.at.z)}, ${s.radius} m` });
        bits.push({ text: `${c.total} in it` });
        bits.push({ text: ed.dirty ? 'unsaved' : 'saved' });
      }
      const b = ed.brush;
      bits.push({ text: ed.pick ? `holding ${ed.pick}` : (ed.tab === 'terrain' ? `${b.kind}, ${b.r} m${b.word ? `, ${b.word}` : ''}` : 'nothing in hand') });
      bits.push({ text: `yaw ${Math.round(g.yaw)}, scale ${g.scale}` });
      bits.push({ text: ed.terrainReady() ? `${(ed.terrainKinds() || []).length} brushes` : 'no terrain tools' });
      read.textContent = '';
      bits.forEach((b, i) => {
        if (i) read.appendChild(document.createTextNode('   '));
        if (b.bold) read.appendChild(h('b', null, b.text));
        else read.appendChild(document.createTextNode(b.text));
      });
      spName.value = s ? s.name : '';
      spNote.value = s ? (s.note || '') : '';
      spR.value = s ? s.radius : '';
      yawIn.value = String(Math.round(g.yaw));
      sclIn.value = String(g.scale);
      for (const [id, b] of tabBtns) b.classList.toggle('on', id === ed.tab);
      const onTerrain = ed.tab === 'terrain';
      markRow.style.display = ed.tab === 'markers' ? '' : 'none';
      knobRow.style.display = onTerrain ? 'none' : '';
      for (const el of [worldRow, groundRow, keysRow, brushList]) el.style.display = onTerrain ? '' : 'none';
      rowsList.style.display = onTerrain ? 'none' : '';
    }

    function drawAll() { drawSpaces(); drawRows(); drawBrushes(); drawContents(); drawRead(); drawSay(); syncSelectionBox(); syncLineGhost(); }
    this._drawAll = drawAll;

    // ------------------------------------------------------- the cursor --
    //
    // Everything below this line is the canvas, and it is torn down in `close`.

    const sc = ctx.sc;
    const canvas = sc && sc.renderer && sc.renderer.domElement;
    const scene = sc && sc.scene;
    const camera = sc && sc.camera;
    const heightAt = (x, z) => (typeof ctx.runtime?.heightAt === 'function' ? ctx.runtime.heightAt(x, z) : 0);
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    let ghost = null, ghostAt = null, ghostKey = '';
    let ring = null;
    let selBox = null;
    let lineDraw = null;
    let press = null, dragging = null;
    // The window is built once and never taken down (windows.js has no dispose
    // hook for a panel), so the canvas and key listeners live for the life of
    // the page and are made inert here instead. A listener that stayed armed
    // after the window closed would eat the player's clicks.
    let live = false;

    function ndcOf(e) {
      const r = canvas.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1));
      return ndc;
    }

    function rebuildGhost() {
      if (!scene) return;
      const g = ed.ghost;
      const key = `${ed.tab}:${ed.pick || (ed.tab === 'terrain' ? ed.brush.kind : '')}:${g.scale}:${g.kind}:${ed.brush.r}`;
      if (key === ghostKey) return;
      ghostKey = key;
      if (ghost) { scene.remove(ghost); disposeGhost(ghost); ghost = null; }
      const id = ed.tab === 'terrain' ? ed.brush.kind : ed.pick;
      if (!id) return;
      const made = ghostFor(ed.tab, id, { scale: g.scale, kind: g.kind, label: g.label, r: ed.brush.r, realm: 'greenwold' });
      if (!made) return;
      ghost = made.group;
      ghost.visible = false;
      scene.add(ghost);
    }
    this._rebuildGhost = rebuildGhost;

    /**
     * The line a ridge or a valley is about to be cut along.
     *
     * It is drawn from the click that started it to wherever the pointer is
     * now, sampled onto the ground, so the length and the bearing are seen
     * before the second click and not read off the status line after it.
     */
    function syncLineGhost() {
      if (!scene) return;
      const from = ed.tab === 'terrain' ? ed.lineAt() : null;
      if (!from || !live) { if (lineDraw) lineDraw.visible = false; return; }
      if (!lineDraw) { lineDraw = lineGhost(); scene.add(lineDraw); }
      const to = ghostAt || from;
      lineDraw.set(from, to, heightAt);
      lineDraw.visible = true;
    }

    function syncRing() {
      if (!scene) return;
      if (!live) { if (ring) { scene.remove(ring); ring = null; } return; }
      if (ring) { scene.remove(ring); ring = null; }
      const s = ed.space;
      if (!s) return;
      ring = radiusRing(s.radius);
      ring.position.set(s.at.x, heightAt(s.at.x, s.at.z) + 0.4, s.at.z);
      scene.add(ring);
    }

    function syncSelectionBox() {
      syncRing();
      if (!scene) return;
      if (!selBox) { selBox = selectionBox(); scene.add(selBox); }
      const sel = ed.selection();
      const s = ed.space;
      if (!sel || !s) { selBox.visible = false; return; }
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

    const armed = () => !!ed.pick || ed.tab === 'terrain';

    function onMove(e) {
      if (!live) return;
      if (!canvas || !camera) return;
      const p = groundUnder(camera, ndcOf(e), heightAt, ray);
      ghostAt = p;
      ed.setLookAt(p);
      if (ghost) {
        ghost.visible = !!p && armed();
        if (p) { ghost.position.set(p.x, p.y, p.z); ghost.rotation.y = ed.ghost.yaw * Math.PI / 180; }
      }
      // a gizmo drag: the selection follows the ground under the pointer
      if (dragging && p) {
        ed.moveTo(p.x, p.z);
        drawAll();
      }
      // a half drawn ridge follows the cursor to its far end
      if (ed.tab === 'terrain' && ed.lineAt()) syncLineGhost();
      // A HELD BRUSH. The spacing and the interval are the editor's, not this
      // file's: it is handed every move and answers whether that move was far
      // enough and late enough to be worth a stroke.
      if (press && press.brush && !press.line && p) {
        const res = ed.dragStroke(p.x, p.z, { now: Date.now() });
        if (res.ok) ed.rebuildGround(p.x, p.z, ed.brush.r + 8);
        else if (res.text) { press.brush = false; drawSay(); }
      }
    }

    function onDown(e) {
      if (!live) return;
      if (!canvas || e.button !== 0) return;      // the right button still turns the camera
      const p = groundUnder(camera, ndcOf(e), heightAt, ray);
      const sel = selectionPoint();
      const onGizmo = sel && screenDist(sel, e) < 26;
      if (!armed() && !onGizmo) return;           // nothing in hand: the game keeps the click
      // Swallowed in the capture phase, so input.js never records a press and
      // therefore never publishes a click for main.js to route.
      e.preventDefault();
      e.stopPropagation();
      const onBrush = ed.tab === 'terrain' && !onGizmo;
      press = { x: e.clientX, y: e.clientY, brush: onBrush, line: onBrush && ed.brush.line };
      if (onGizmo && !ed.pick) dragging = true;
      // A line tool is two clicks and is settled on the way up. A painting
      // brush starts here, so the first stroke lands under the press itself.
      if (press.brush && !press.line) {
        // A press that laid nothing drops the press entirely rather than
        // leaving one behind for `onUp` to read as a click on the palette,
        // which would answer a second refusal for a tool nobody is holding.
        if (!p) { press = null; ed.say('the cursor is not on any ground, so the brush had nothing to take hold of.', 'bad'); drawSay(); return; }
        const res = ed.dragBegin(p.x, p.z, { shift: e.shiftKey, now: Date.now() });
        if (res.ok) ed.rebuildGround(p.x, p.z, ed.brush.r + 8);
        else { press = null; drawSay(); }
      }
    }

    function onUp(e) {
      if (!live || !press) return;
      const moved = Math.hypot(e.clientX - press.x, e.clientY - press.y);
      const wasDrag = dragging, wasBrush = press.brush, wasLine = press.line;
      press = null; dragging = null;
      if (wasBrush && wasLine) {
        if (moved > CLICK_SLOP) return;           // a drag with a line tool is not a click
        const p = groundUnder(camera, ndcOf(e), heightAt, ray);
        if (!p) { ed.say('the cursor is not on any ground, so the line has no end there.', 'bad'); drawSay(); return; }
        const from = ed.lineAt();
        const res = from ? ed.lineEnd(p.x, p.z, { shift: e.shiftKey }) : ed.lineStart(p.x, p.z);
        if (from && res.ok) {
          const mid = { x: (from.x + p.x) / 2, z: (from.z + p.z) / 2 };
          ed.rebuildGround(mid.x, mid.z, Math.hypot(p.x - from.x, p.z - from.z) / 2 + ed.brush.r + 8);
        }
        drawAll();
        return;
      }
      if (wasBrush) { ed.dragEnd(); drawAll(); return; }
      if (wasDrag) { drawAll(); return; }
      if (moved > CLICK_SLOP) return;
      const p = groundUnder(camera, ndcOf(e), heightAt, ray);
      if (!p) { ed.say('the cursor is not on any ground, so nothing was placed.', 'bad'); drawSay(); return; }
      ed.placeAt(p.x, p.z);
      drawAll();
    }

    const editing = (t) => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');

    function onKey(e) {
      if (!live) return;
      if (editing(e.target)) return;
      const k = e.key.toLowerCase();
      const mod = e.ctrlKey || e.metaKey;
      let took = true;
      const onTerrain = ed.tab === 'terrain';
      // On the Terrain tab ctrl Z is the ground, because the ground is what is
      // being made there. Everywhere else it is the space, as it always was.
      if (mod && k === 's') { e.preventDefault(); ed.save().then(() => ed.list()).then(drawAll); }
      else if (mod && k === 'z' && !e.shiftKey) { if (onTerrain) ed.terrainUndo(); else ed.undo(); }
      else if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) { if (onTerrain) ed.terrainRedo(); else ed.redo(); }
      else if (!mod && onTerrain && /^[1-9]$/.test(k)) {
        const list = ed.terrainKinds() || [];
        const row = list[Number(k) - 1];
        if (row) { ed.arm(row.id); rebuildGhost(); }
        else ed.say(list.length ? `there is no ${k}th brush; there are ${list.length}.` : NO_BRUSHES, 'bad');
      }
      else if (!mod && onTerrain && (k === '+' || k === '=')) { ed.bumpRadius(1); rebuildGhost(); }
      else if (!mod && onTerrain && (k === '-' || k === '_')) { ed.bumpRadius(-1); rebuildGhost(); }
      else if (!mod && k === 'r') ed.turn(e.shiftKey ? -TURN_DEG : TURN_DEG);
      else if (!mod && k === ']') ed.grow(SCALE_STEP);
      else if (!mod && k === '[') ed.grow(1 / SCALE_STEP);
      else if (!mod && (k === 'delete' || k === 'backspace')) ed.del();
      else if (!mod && k === 'escape' && (armed() || ed.lineAt())) { ed.disarm(); rebuildGhost(); syncLineGhost(); }
      else took = false;
      if (!took) return;
      e.stopPropagation();
      drawAll();
    }

    if (canvas) {
      canvas.addEventListener('pointerdown', onDown, true);
      canvas.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    }
    window.addEventListener('keydown', onKey, true);

    this._setLive = (on) => {
      live = !!on;
      if (!live) {
        press = null; dragging = null;
        ed.lineCancel();
        if (ghost) ghost.visible = false;
        if (lineDraw) lineDraw.visible = false;
        if (selBox) selBox.visible = false;
        if (ring) { scene.remove(ring); ring = null; }
      } else { syncSelectionBox(); syncLineGhost(); }
      return live;
    };

    this._teardown = () => {
      if (canvas) {
        canvas.removeEventListener('pointerdown', onDown, true);
        canvas.removeEventListener('pointermove', onMove);
      }
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKey, true);
      if (ghost && scene) { scene.remove(ghost); disposeGhost(ghost); ghost = null; }
      if (lineDraw && scene) { scene.remove(lineDraw); lineDraw.geometry.dispose(); lineDraw.material.dispose(); lineDraw = null; }
      if (ring && scene) { scene.remove(ring); ring = null; }
      if (selBox && scene) { scene.remove(selBox); selBox = null; }
    };

    // What is on disk, the moment the window is built, so the chooser is real.
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
    if (this._setLive) this._setLive(true);
    ctx?.hud?.toast?.('the editor is open. Pick something out of the palette, then left click the ground. Escape drops the tool, R turns, brackets size, Delete removes, ctrl Z undoes, ctrl S saves. On the Terrain tab 1 to 9 pick a brush, plus and minus widen it, and a held drag paints. Right drag still turns the camera. Close this window to leave.');
    if (this._drawAll) this._drawAll();
  },

  close(ctx) {
    if (this._setLive) this._setLive(false);
    if (this._ed) this._ed.disarm();
    if (this._rebuildGhost) this._rebuildGhost();
    setMarkersVisible(!!(ctx && ctx.dev && ctx.dev.on), ctx && ctx.sc && ctx.sc.scene);
  },

  dispose() { if (this._teardown) this._teardown(); },
};

export default panel;
