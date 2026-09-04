// The window manager: the shell every panel lives in, the hotkeys, the
// one-open rule, Escape, and the drag.
//
// Panels are separate files so two hands can write two windows without
// touching each other. This file owns everything they share and nothing they
// do not:
//
//   panel = { id, title, key, build(el, ctx), open(ctx)?, close()?, tick(dt, ctx)?,
//             keys?: ['1','2'] }
//
// Three rules the contract in docs/mmo/07-RUNTIME-CONTRACT.md sets, and how
// they are kept honest:
//
//   One window at a time, except Bag and Character, which may share the
//   screen. Opening anything else closes what is up.
//
//   Escape closes the top window, meaning the one opened most recently. With
//   nothing open, Escape opens whichever panel registered under that key,
//   which is how Settings gets to be both "Escape" and "closes on Escape".
//
//   The world keeps WASD and the mouse. This manager reads keys through
//   `input.pressed` and never calls preventDefault, and its layer is
//   pointer-events: none except on the windows themselves, so a click beside a
//   window still reaches the ground. A key is taken from the world only when
//   an open panel declares it in `keys`, which `consumes(key)` answers.
//
// The rules run without a document. `createWindows(null, input, ctx)` in node
// registers, opens, closes and reads keys exactly as the browser does, which
// is what windows.test.mjs drives: the test path is the real path.

/** Windows that may share the screen. Everything else is exclusive. */
export const PAIRS = [['bag', 'character']];

export const ESCAPE_KEY = 'escape';

/** Where the first window lands, and how far each next one steps. */
export const CASCADE = { x: 30, y: 26 };

const CSS = `
#bw-windows, #bw-windows * { box-sizing: border-box; }
#bw-windows {
  position: fixed; inset: 0; z-index: 50; pointer-events: none;
  font: 13px/1.45 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: #f2ede2;
}
#bw-windows .bw-win {
  position: absolute; pointer-events: auto; display: flex; flex-direction: column;
  min-width: 260px; max-width: min(760px, 94vw); max-height: 86vh;
  background: rgba(20,23,26,.94); border: 1px solid rgba(255,255,255,.16);
  border-radius: 8px; box-shadow: 0 18px 60px rgba(0,0,0,.5);
  text-shadow: 0 1px 2px rgba(0,0,0,.6);
}
#bw-windows .bw-win[hidden] { display: none; }
#bw-windows .bw-win-title {
  display: flex; align-items: center; justify-content: space-between; gap: 12px;
  padding: 7px 8px 7px 12px; cursor: move; user-select: none; -webkit-user-select: none;
  border-bottom: 1px solid rgba(255,255,255,.12);
  font-size: 12px; letter-spacing: .09em; text-transform: uppercase; color: #cfd6c8;
}
#bw-windows .bw-win-title .bw-win-key { opacity: .5; letter-spacing: .04em; }
#bw-windows .bw-win-x {
  font: inherit; font-size: 13px; line-height: 1; padding: 3px 8px 4px; cursor: pointer;
  background: transparent; border: 1px solid rgba(255,255,255,.18); border-radius: 5px; color: #e6e0d4;
}
#bw-windows .bw-win-x:hover { background: rgba(255,255,255,.10); }
#bw-windows .bw-win-body { padding: 12px 14px 14px; overflow: auto; }
#bw-windows h3 {
  margin: 14px 0 7px; font-size: 11px; letter-spacing: .09em; text-transform: uppercase; color: #8fa387;
}
#bw-windows h3:first-child { margin-top: 0; }
#bw-windows button {
  font: inherit; font-size: 12.5px; padding: 4px 10px; border-radius: 6px;
  border: 1px solid #4f6349; background: #2c3a2b; color: #e8f0e2; cursor: pointer;
}
#bw-windows button:hover:not(:disabled) { background: #38492f; }
#bw-windows button:disabled { opacity: .5; cursor: default; border-color: #37402f; color: #9aa394; }
#bw-windows .bw-dim { color: #95a08f; }
#bw-windows .bw-num { font-variant-numeric: tabular-nums; }
#bw-tip {
  position: fixed; z-index: 70; pointer-events: none; max-width: 320px;
  padding: 8px 10px; border-radius: 7px;
  background: rgba(12,14,16,.96); border: 1px solid rgba(255,255,255,.2);
  box-shadow: 0 12px 40px rgba(0,0,0,.55);
  font: 12.5px/1.45 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: #e8e2d6;
}
#bw-tip[hidden] { display: none; }
#bw-tip .bw-tip-name { font-weight: 600; margin-bottom: 2px; }
#bw-tip .bw-tip-line { color: #cfd6c8; }
#bw-tip .bw-tip-affix { color: inherit; }
#bw-windows .bw-drop-hot { outline: 2px solid #ffd479; outline-offset: -2px; }
`;

// --------------------------------------------------------------- the tooltip
// One element for the whole window layer. Panels hand it lines and a colour;
// what those lines say is affixes.describe's business, not this file's.

let tipEl = null;

function ensureCss() {
  if (typeof document === 'undefined' || !document) return false;
  if (!document.getElementById('bw-windows-css')) {
    const style = document.createElement('style');
    style.id = 'bw-windows-css';
    style.textContent = CSS;
    document.head.appendChild(style);
  }
  return true;
}

function tipNode() {
  if (!ensureCss()) return null;
  if (tipEl && tipEl.isConnected) return tipEl;
  tipEl = document.createElement('div');
  tipEl.id = 'bw-tip';
  tipEl.hidden = true;
  document.body.appendChild(tipEl);
  return tipEl;
}

/** Show lines at a point. `colour` tints the first line, which is the name. */
export function showTip(lines, colour, x, y) {
  const el = tipNode();
  if (!el || !lines || !lines.length) return;
  el.textContent = '';
  lines.forEach((line, i) => {
    const d = document.createElement('div');
    d.className = i === 0 ? 'bw-tip-name' : 'bw-tip-line';
    if (i === 0 && colour) d.style.color = colour;
    if (typeof line === 'object' && line) {
      d.textContent = line.text;
      if (line.colour) d.style.color = line.colour;
    } else d.textContent = String(line);
    el.appendChild(d);
  });
  el.hidden = false;
  const w = el.offsetWidth || 260, h = el.offsetHeight || 80;
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 720;
  el.style.left = `${Math.max(4, Math.min(x + 16, vw - w - 8))}px`;
  el.style.top = `${Math.max(4, Math.min(y + 14, vh - h - 8))}px`;
}

export function hideTip() {
  if (tipEl) tipEl.hidden = true;
}

/**
 * Hover this element for a tooltip. `getter()` returns
 * `{ lines, colour }` or null when there is nothing to say, so a slot that
 * empties while the cursor sits on it stops talking about what used to be there.
 */
export function attachTip(el, getter) {
  if (!el || !el.addEventListener) return () => {};
  const move = (e) => {
    const got = getter();
    if (!got || !got.lines || !got.lines.length) { hideTip(); return; }
    showTip(got.lines, got.colour, e.clientX, e.clientY);
  };
  el.addEventListener('pointerenter', move);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerleave', hideTip);
  return () => {
    el.removeEventListener('pointerenter', move);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerleave', hideTip);
  };
}

// ----------------------------------------------------------------- dragging
// One item, one address. The payload is the same `where` shape inventory.js
// parses, so a drop is literally `inventory.move(from, to)` and no panel has
// to invent a second way of naming a slot.

export const DRAG_MIME = 'text/plain';

/** Make this element draggable. `getPayload()` returns a `where`, or null. */
export function dragSource(el, getPayload) {
  if (!el || !el.addEventListener) return () => {};
  el.draggable = true;
  const start = (e) => {
    const where = getPayload();
    if (where == null) { if (e.preventDefault) e.preventDefault(); return; }
    try { e.dataTransfer.setData(DRAG_MIME, JSON.stringify(where)); e.dataTransfer.effectAllowed = 'move'; } catch { /* some browsers refuse a mime */ }
  };
  el.addEventListener('dragstart', start);
  return () => el.removeEventListener('dragstart', start);
}

/** Accept a drop. `onDrop(where)` gets the payload the source set. */
export function dropTarget(el, onDrop) {
  if (!el || !el.addEventListener) return () => {};
  const over = (e) => { e.preventDefault(); el.classList.add('bw-drop-hot'); };
  const leave = () => el.classList.remove('bw-drop-hot');
  const drop = (e) => {
    e.preventDefault();
    el.classList.remove('bw-drop-hot');
    let where = null;
    try { where = JSON.parse(e.dataTransfer.getData(DRAG_MIME)); } catch { where = null; }
    if (where != null) onDrop(where, e);
  };
  el.addEventListener('dragover', over);
  el.addEventListener('dragleave', leave);
  el.addEventListener('drop', drop);
  return () => {
    el.removeEventListener('dragover', over);
    el.removeEventListener('dragleave', leave);
    el.removeEventListener('drop', drop);
  };
}

const isFn = (f) => typeof f === 'function';
const lower = (k) => String(k == null ? '' : k).toLowerCase();

/** True when the two ids are allowed on screen together. */
export function sharesScreen(a, b) {
  if (a === b) return true;
  return PAIRS.some((p) => p.includes(a) && p.includes(b));
}

/**
 * @param {HTMLElement|null} root  where the layer is appended; null or no
 *   document at all runs the manager headless, rules and all.
 * @param {object} input  createInput's api; only `pressed` is used
 * @param {object} ctx    handed to every panel's build/open/tick
 */
export function createWindows(root, input, ctx = {}) {
  const hasDom = typeof document !== 'undefined' && document && isFn(document.createElement);
  const panels = new Map();          // id -> panel
  const frames = new Map();          // id -> { el, body, title }
  const stack = [];                  // open ids, most recently opened last
  let el = null;
  let zTop = 1;
  let built = 0;

  if (hasDom) ensureCss();
  if (hasDom) {
    el = document.createElement('div');
    el.id = 'bw-windows';
    (root || document.body).appendChild(el);
  }

  const say = (text, kind) => {
    const hud = ctx.hud;
    if (hud && isFn(hud.log)) hud.log(text, kind);
    else if (hud && isFn(hud.toast)) hud.toast(text, kind);
  };

  // ------------------------------------------------------------------ frame

  function makeFrame(panel) {
    const win = document.createElement('div');
    win.className = `bw-win bw-win-${panel.id}`;
    win.hidden = true;

    const title = document.createElement('div');
    title.className = 'bw-win-title';
    const name = document.createElement('span');
    name.textContent = panel.title || panel.id;
    const right = document.createElement('span');
    right.style.display = 'flex';
    right.style.alignItems = 'center';
    right.style.gap = '10px';
    if (panel.key) {
      const k = document.createElement('span');
      k.className = 'bw-win-key';
      k.textContent = panel.key === ESCAPE_KEY ? 'esc' : panel.key.toUpperCase();
      right.appendChild(k);
    }
    const x = document.createElement('button');
    x.className = 'bw-win-x';
    x.type = 'button';
    x.textContent = 'close';
    x.addEventListener('click', (e) => { e.stopPropagation(); close(panel.id); });
    right.appendChild(x);
    title.appendChild(name);
    title.appendChild(right);

    const body = document.createElement('div');
    body.className = 'bw-win-body';

    win.appendChild(title);
    win.appendChild(body);

    // Cascade so two windows are never exactly on top of each other, and the
    // pair that may share the screen is offset furthest.
    const n = built++;
    win.style.left = `${Math.round(90 + n * CASCADE.x)}px`;
    win.style.top = `${Math.round(70 + n * CASCADE.y)}px`;

    // Dragging by the title bar. Pointer events are stopped at the window so
    // the camera, which listens on the canvas, never sees them.
    let drag = null;
    const onMove = (e) => {
      if (!drag) return;
      win.style.left = `${drag.left + (e.clientX - drag.x)}px`;
      win.style.top = `${Math.max(0, drag.top + (e.clientY - drag.y))}px`;
    };
    const onUp = () => {
      if (!drag) return;
      drag = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    title.addEventListener('pointerdown', (e) => {
      if (e.target && e.target.tagName === 'BUTTON') return;
      e.stopPropagation();
      drag = { x: e.clientX, y: e.clientY, left: win.offsetLeft, top: win.offsetTop };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      raise(panel.id);
    });
    win.addEventListener('pointerdown', (e) => { e.stopPropagation(); raise(panel.id); });

    el.appendChild(win);
    return { el: win, body, title: name };
  }

  function raise(id) {
    const f = frames.get(id);
    if (f) f.el.style.zIndex = String(++zTop);
  }

  // --------------------------------------------------------------- register

  /**
   * Take a panel. Refuses a second panel under the same id or the same key
   * rather than quietly letting one shadow the other, which is how a key stops
   * working for a week without anybody knowing why.
   */
  function register(panel) {
    if (!panel || typeof panel !== 'object' || !panel.id) {
      console.warn('[windows] a panel needs an id');
      return false;
    }
    if (panels.has(panel.id)) {
      console.warn(`[windows] two panels claim the id "${panel.id}"; the second is ignored`);
      return false;
    }
    const key = panel.key ? lower(panel.key) : null;
    if (key) {
      for (const p of panels.values()) {
        if (p.key && lower(p.key) === key) {
          console.warn(`[windows] "${panel.id}" and "${p.id}" both want the ${key} key; ${panel.id} keeps its own but the key stays with ${p.id}`);
          panel = { ...panel, key: null };
          break;
        }
      }
    }
    panels.set(panel.id, { ...panel, key: panel.key ? lower(panel.key) : null });
    return true;
  }

  const isOpen = (id) => stack.includes(id);
  const list = () => [...panels.values()];

  // ------------------------------------------------------------- open/close

  function open(id, extra) {
    const panel = panels.get(id);
    if (!panel) { console.warn(`[windows] no panel called "${id}"`); return false; }
    if (isOpen(id)) { raise(id); return true; }

    // The one-open rule: everything that cannot share the screen with this
    // goes, newest first so the closes read in the order a player would.
    for (const other of [...stack].reverse()) if (!sharesScreen(other, id)) close(other);

    if (hasDom && !frames.has(id)) {
      const f = makeFrame(panel);
      frames.set(id, f);
      if (isFn(panel.build)) {
        try { panel.build(f.body, ctx); } catch (e) { console.error(`[windows] ${id} failed to build`, e); }
      }
    }
    stack.push(id);
    const f = frames.get(id);
    if (f) { f.el.hidden = false; raise(id); }
    if (isFn(panel.open)) {
      try { panel.open(ctx, extra); } catch (e) { console.error(`[windows] ${id} failed to open`, e); }
    }
    return true;
  }

  function close(id) {
    const i = stack.indexOf(id);
    if (i < 0) return false;
    stack.splice(i, 1);
    const f = frames.get(id);
    if (f) f.el.hidden = true;
    const panel = panels.get(id);
    if (panel && isFn(panel.close)) {
      try { panel.close(ctx); } catch (e) { console.error(`[windows] ${id} failed to close`, e); }
    }
    return true;
  }

  const toggle = (id, extra) => (isOpen(id) ? (close(id), false) : open(id, extra));

  function closeAll() {
    let n = 0;
    for (const id of [...stack].reverse()) if (close(id)) n++;
    return n;
  }

  /**
   * Escape. With something open it closes the top one and nothing else, so a
   * player with Bag and Character up presses it twice. With nothing open it
   * hands the key to whichever panel claimed it, which is Settings.
   */
  function escape() {
    if (stack.length) {
      const top = stack[stack.length - 1];
      close(top);
      return { closed: top, opened: null };
    }
    for (const p of panels.values()) {
      if (p.key === ESCAPE_KEY) { open(p.id); return { closed: null, opened: p.id }; }
    }
    return { closed: null, opened: null };
  }

  /**
   * Whether an open panel has claimed this key, which is the only case where
   * the world should not also act on it. WASD and the mouse are never claimed.
   */
  function consumes(key) {
    const k = lower(key);
    if (!k) return false;
    for (const id of stack) {
      const p = panels.get(id);
      if (!p) continue;
      if (Array.isArray(p.keys) && p.keys.some((x) => lower(x) === k)) return true;
    }
    return false;
  }

  // ------------------------------------------------------------------ frame

  /** Read the hotkeys and run the open panels' live numbers. */
  function update(dt) {
    if (input && isFn(input.pressed)) {
      if (input.pressed(ESCAPE_KEY)) escape();
      else {
        for (const p of panels.values()) {
          if (!p.key || p.key === ESCAPE_KEY) continue;
          if (input.pressed(p.key)) toggle(p.id);
        }
      }
    }
    for (const id of stack) {
      const p = panels.get(id);
      if (p && isFn(p.tick)) {
        try { p.tick(dt, ctx); } catch (e) { console.error(`[windows] ${id} failed to tick`, e); }
      }
    }
  }

  /** Rebuild an open panel's body, for when the document changed underneath. */
  function refresh(id) {
    const p = panels.get(id);
    const f = frames.get(id);
    if (!p || !f || !isFn(p.build)) return false;
    f.body.textContent = '';
    try { p.build(f.body, ctx); } catch (e) { console.error(`[windows] ${id} failed to rebuild`, e); return false; }
    return true;
  }

  function dispose() {
    closeAll();
    hideTip();
    if (el) el.remove();
    panels.clear();
    frames.clear();
  }

  return {
    el, ctx, register, open, close, toggle, isOpen, closeAll, escape, consumes,
    update, refresh, dispose, say, raise,
    bodyOf: (id) => frames.get(id)?.body || null,
    frameOf: (id) => frames.get(id)?.el || null,
    get anyOpen() { return stack.length > 0; },
    get top() { return stack.length ? stack[stack.length - 1] : null; },
    get openIds() { return [...stack]; },
    get panels() { return list(); },
  };
}
