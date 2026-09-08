// The window manager: the codex, the standalone windows, the hotkeys, Escape,
// the tooltip and the drag.
//
// It used to be one window at a time with a Bag and Character exception. The
// six panels a player lives in are now tabs of ONE frame, the codex, so that
// switching from the sheet to the pack is a tab and not a window dance:
//
//   codex tabs   Character (C and B), Skills (K), Abilities (P), Crafting (V),
//                Map (M). One tab is up at a time; its key opens the codex on
//                it, and pressing that key again closes the codex.
//   standalone   Talk and Trade (opened by code), Settings (Escape when
//                nothing is open), Dev (F2). Each keeps its own themed frame.
//
// There is no Inventory tab any more. The pack lives in the right hand column
// of the Character page, because swapping a sword and watching what it does to
// your attack is one act and was two windows. `bag` and `inventory` are kept
// as ALIASES of `character`, so main.js's `windows.register(bagPanel)` still
// binds B, `windows.open('bag')` still lands somewhere sensible, and every
// caller written against the old id goes on working. B carries a `focus` so
// the page can light the grid up; C opens the same page plain.
//
// A is never a window key again. It is strafe left, and a window that stole it
// made walking left open a panel. `RESERVED_KEYS` is the class fix: the
// manager refuses ANY key the world drives, says which panel asked for it, and
// registers the panel with no key rather than silently shadowing movement.
//
// The panel contract is unchanged, so W5's panels and win_dev need no edit:
//
//   panel = { id, title, key, build(el, ctx), open(ctx, extra)?, close()?,
//             tick(dt, ctx)?, keys?: ['1','2'] }
//
// The rules run without a document. `createWindows(null, input, ctx)` in node
// registers, opens, closes, switches tabs and reads keys with no DOM at all,
// which is what windows.test.mjs drives: the test path is the real path.

import { injectTheme, theme, itemGlyph, cornerUrl } from './ui_theme.js';
import { tabIcon } from './icon_art.js';

/** The one frame the six everyday panels live in. */
export const CODEX_ID = 'codex';

/**
 * The tabs, in the order they are drawn. The KEY IS NOT HERE: each panel
 * carries its own, and the strip reads it off the registration, so the tab
 * label and the hotkey can never drift apart.
 */
export const CODEX_TABS = [
  { id: 'character', label: 'Character' },
  { id: 'skills', label: 'Skills' },
  { id: 'abilities', label: 'Abilities' },
  { id: 'crafting', label: 'Crafting' },
  { id: 'map', label: 'Map' },
];

export const CODEX_IDS = CODEX_TABS.map((t) => t.id);

/**
 * Pixel measurements from public/ui/codex-frame.webp, 1536 x 1024. Fractions
 * are kept here so the tab hit areas and page layout cannot drift apart.
 */
export const CODEX_FRAME = {
  image: { src: '/ui/codex-frame.webp', width: 1536, height: 1024, aspect: 1.5 },
  tabs: {
    character: { x: 151 / 1536, y: 39 / 1024, w: 220 / 1536, h: 139 / 1024 },
    skills: { x: 390 / 1536, y: 73 / 1024, w: 168 / 1536, h: 79 / 1024 },
    abilities: { x: 570 / 1536, y: 73 / 1024, w: 178 / 1536, h: 79 / 1024 },
    crafting: { x: 760 / 1536, y: 73 / 1024, w: 178 / 1536, h: 79 / 1024 },
    map: { x: 950 / 1536, y: 73 / 1024, w: 176 / 1536, h: 79 / 1024 },
  },
  close: { x: 1333 / 1536, y: 43 / 1024, w: 121 / 1536, h: 143 / 1024 },
  panels: {
    left: { x: 145 / 1536, y: 186 / 1024, w: 344 / 1536, h: 698 / 1024 },
    right: { x: 1046 / 1536, y: 186 / 1024, w: 418 / 1536, h: 698 / 1024 },
    middle: { x: 145 / 1536, y: 186 / 1024, w: 1319 / 1536, h: 698 / 1024 },
  },
  arch: { x: 600 / 1536, y: 173 / 1024, w: 340 / 1536, h: 547 / 1024 },
  dais: { x: 494 / 1536, y: 697 / 1024, w: 548 / 1536, h: 226 / 1024, topX: 768 / 1536, topY: 763 / 1024 },
  slots: {
    mainHand: { x: 500 / 1536, y: 281 / 1024, w: 88 / 1536, h: 119 / 1024 },
    offHand: { x: 500 / 1536, y: 429 / 1024, w: 88 / 1536, h: 117 / 1024 },
    ring1: { x: 500 / 1536, y: 579 / 1024, w: 88 / 1536, h: 112 / 1024 },
    neck: { x: 949 / 1536, y: 281 / 1024, w: 88 / 1536, h: 119 / 1024 },
    outfit: { x: 949 / 1536, y: 429 / 1024, w: 88 / 1536, h: 117 / 1024 },
    ring2: { x: 949 / 1536, y: 579 / 1024, w: 88 / 1536, h: 112 / 1024 },
  },
};

/**
 * Ids that are not pages of their own any more and land on the page that
 * swallowed them. The value is where they go; the key is remembered and handed
 * to the page as `extra.focus`, so Character can tell B from C.
 */
export const TAB_ALIAS = { bag: 'character', inventory: 'character' };

/** The page an id really opens. Anything with no alias is itself. */
export const resolveTab = (id) => TAB_ALIAS[String(id)] || String(id);

/** True when this panel is a page of the codex rather than a window of its own. */
export const isCodexTab = (id) => CODEX_IDS.includes(resolveTab(id));

/**
 * Keys the world drives and no window may ever take. WASD walks, space jumps,
 * shift runs, E goes in, Q and E fly in dev mode, Tab cycles targets.
 */
export const RESERVED_KEYS = ['w', 'a', 's', 'd', 'q', 'e', ' ', 'shift', 'control', 'tab'];

/**
 * Which ids share a frame. The codex tabs share one; nothing else shares with
 * anything. Kept as an export because it is the rule two panels are checked
 * against, and the test drives it directly.
 */
export const PAIRS = [[...CODEX_IDS, ...Object.keys(TAB_ALIAS)]];

export const ESCAPE_KEY = 'escape';

/** Where the first standalone window lands, and how far each next one steps. */
export const CASCADE = { x: 30, y: 26 };

const CSS = `
#bw-windows, #bw-windows * { box-sizing: border-box; }
#bw-windows {
  position: fixed; inset: 0; z-index: 50; pointer-events: none;
  color: ${theme.parchment};
}
#bw-windows .bw-win { position: absolute; pointer-events: auto; }
#bw-windows .bw-win[hidden] { display: none; }
#bw-windows .bw-win-plain { min-width: 300px; max-width: min(820px, 94vw); }
#bw-windows .bw-win-codex {
  width: min(1536px, 96vw, calc((100vh - 120px) * 1.5));
  aspect-ratio: 3 / 2;
}

#bw-windows .bw-win-title {
  display: flex; align-items: stretch; justify-content: space-between; gap: 14px;
  cursor: move; user-select: none; -webkit-user-select: none;
  padding: 4px 4px 0; margin: -18px -14px 14px;
  background: linear-gradient(180deg, ${theme.stoneUp}, ${theme.stone});
  border: 1px solid ${theme.goldDim}66;
  border-radius: 7px 7px 4px 4px;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.05), inset 0 -12px 18px rgba(0,0,0,.22);
}
#bw-windows .bw-win-name {
  font-family: ${theme.fonts.display}; font-size: 15px; font-weight: 600;
  letter-spacing: .2em; font-variant-caps: small-caps; color: ${theme.gold};
}
#bw-windows .bw-win-key { font-family: ${theme.fonts.display}; font-size: 10px; letter-spacing: .16em; color: ${theme.goldDim}; }
#bw-windows .bw-win-x {
  min-width: 42px; min-height: 40px;
  font-family: ${theme.fonts.display}; font-size: 20px; line-height: 1; letter-spacing: 0;
  padding: 6px 10px 9px; cursor: pointer; color: ${theme.parchment};
  background: linear-gradient(180deg, ${theme.plateUp}, ${theme.plate});
  border: 1px solid ${theme.gold};
  border-radius: 0 0 6px 6px;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.08), 0 4px 12px rgba(0,0,0,.35);
}
#bw-windows .bw-win-x:hover { color: ${theme.goldBright}; border-color: ${theme.gold}; }
#bw-windows .bw-win-body {
  overflow: auto; max-height: min(74vh, 820px);
  background: linear-gradient(180deg, rgba(255,255,255,.025), rgba(0,0,0,.18)), ${theme.stoneDeep};
  border: 1px solid ${theme.goldDim}44;
  border-radius: 7px;
}
#bw-windows .bw-codex-frame {
  position: relative; width: 100%; height: 100%;
  background: url("${CODEX_FRAME.image.src}") 0 0 / 100% 100% no-repeat;
  filter: drop-shadow(0 24px 50px rgba(0,0,0,.74));
}
#bw-windows .bw-codex-title {
  position: absolute; inset: 0; margin: 0; padding: 0;
  display: block; background: transparent; border: 0; box-shadow: none;
  cursor: move; min-height: 0; z-index: 4;
}
#bw-windows .bw-codex-tabs { display: contents; }
#bw-windows .bw-codex-tabs .bw-tab {
  position: absolute; min-width: 40px; min-height: 40px;
  display: flex; align-items: center; justify-content: center;
  padding: 0; border: 0; border-radius: 0; color: transparent;
  background: transparent; box-shadow: none; opacity: 1;
}
#bw-windows .bw-codex-tabs .bw-tab .bw-tab-word { display: none; }
#bw-windows .bw-codex-tabs .bw-tab .bw-tab-i { display: none; filter: drop-shadow(0 2px 1px rgba(0,0,0,.65)); }
#bw-windows .bw-codex-tabs .bw-tab.on:not([data-tab="character"]) {
  color: ${theme.parchment};
  background: linear-gradient(180deg, ${theme.plateUp}, ${theme.plate});
  border: 1px solid ${theme.gold};
  box-shadow: inset 0 1px 0 rgba(255,255,255,.12), 0 7px 16px rgba(0,0,0,.36);
}
#bw-windows .bw-codex-tabs .bw-tab.on:not([data-tab="character"]) .bw-tab-i { display: block; }
#bw-windows .bw-codex-tabs .bw-tab:hover { outline: 1px solid rgba(242,220,156,.36); outline-offset: -2px; }
#bw-windows .bw-codex-tabs .bw-tab.on { transform: none; padding-bottom: 0; border-radius: 0 0 7px 7px; }
#bw-windows .bw-codex-close {
  position: absolute; min-width: 40px; min-height: 40px; padding: 0;
  border: 0; background: transparent; box-shadow: none; color: transparent;
}
#bw-windows .bw-codex-close:hover { outline: 1px solid rgba(242,220,156,.4); outline-offset: -2px; }
#bw-windows .bw-codex-bodies { position: absolute; inset: 0; pointer-events: none; z-index: 1; }
#bw-windows .bw-codex-body {
  position: absolute; inset: 0; overflow: visible; max-height: none; padding: 0;
  background: transparent; border: 0; border-radius: 0; pointer-events: auto;
}
#bw-windows .bw-codex-body:not([data-tab="character"]) {
  left: ${CODEX_FRAME.panels.middle.x * 100}%;
  top: ${CODEX_FRAME.panels.middle.y * 100}%;
  width: ${CODEX_FRAME.panels.middle.w * 100}%;
  height: ${CODEX_FRAME.panels.middle.h * 100}%;
  right: auto; bottom: auto; overflow: auto;
  padding: 16px 18px;
  background: linear-gradient(180deg, rgba(255,255,255,.035), rgba(0,0,0,.18)), ${theme.stoneDeep};
  border: 1px solid ${theme.goldDim}66; border-radius: 7px;
  background-image:
    ${cornerUrl()}, ${cornerUrl()}, ${cornerUrl()}, ${cornerUrl()},
    linear-gradient(180deg, rgba(255,255,255,.035), rgba(0,0,0,.18));
  background-repeat: no-repeat;
  background-position: left 2px top 2px, right 2px top 2px, left 2px bottom 2px, right 2px bottom 2px, 0 0;
  background-size: 18px 18px, 18px 18px, 18px 18px, 18px 18px, auto;
}
#bw-windows .bw-codex-body[hidden] { display: none; }

#bw-windows h3 {
  font-family: ${theme.fonts.display};
  margin: 14px 0 8px; font-size: 11px; letter-spacing: .2em;
  font-variant-caps: small-caps; color: ${theme.gold}; font-weight: 600;
}
#bw-windows h3:first-child { margin-top: 0; }
/* Every panel's buttons take the frame's colours. They are NOT put in small
   caps: a vendor button reads "buy 5 for 20 gold" and shouting it helps
   nobody. Small caps are for headers, tabs and the .bw-btn row of filters. */
#bw-windows button:not(.bw-tab):not(.bw-win-x):not(.bw-btn) {
  font-family: ${theme.fonts.body}; font-size: 14px; padding: 4px 11px; cursor: pointer;
  border: 1px solid ${theme.goldDim}; color: ${theme.parchment};
  background: linear-gradient(180deg, rgba(255,255,255,.06), rgba(0,0,0,.4));
}
#bw-windows button:not(.bw-tab):not(.bw-win-x):hover:not(:disabled) { border-color: ${theme.gold}; color: ${theme.goldBright}; }
#bw-windows button:disabled { opacity: .45; cursor: default; }
#bw-windows input, #bw-windows select, #bw-windows textarea { font-family: ${theme.fonts.body}; font-size: 14px; }

#bw-tip {
  position: fixed; z-index: 70; pointer-events: none; max-width: 340px;
  padding: 9px 12px 10px;
  background: linear-gradient(180deg, ${theme.stoneUp}, ${theme.stone});
  border: 1px solid ${theme.goldDim};
  box-shadow: 0 14px 44px rgba(0,0,0,.7), inset 0 0 26px rgba(0,0,0,.6);
  font-family: ${theme.fonts.body}; font-size: 14px; line-height: 1.4;
  color: ${theme.parchment};
}
#bw-tip { display: flex; align-items: flex-start; gap: 11px; max-width: 660px; }
#bw-tip[hidden] { display: none; }
#bw-tip .bw-tip-main { max-width: 320px; }
#bw-tip .bw-tip-name {
  font-family: ${theme.fonts.display}; font-size: 13.5px; font-weight: 600;
  letter-spacing: .05em; margin-bottom: 4px;
}
#bw-tip .bw-tip-line { color: ${theme.parchmentDim}; }
/* the second card: what you are already wearing where this would go */
#bw-tip .bw-tip-cmp {
  max-width: 300px; padding-left: 11px; align-self: stretch;
  border-left: 1px solid ${theme.goldDim}88;
}
#bw-tip .bw-tip-cmp-head {
  font-family: ${theme.fonts.display}; font-size: 9.5px; letter-spacing: .2em;
  font-variant-caps: small-caps; color: ${theme.gold}; margin-bottom: 6px;
}
#bw-tip .bw-tip-blk { margin-bottom: 8px; }
#bw-tip .bw-tip-blk:last-child { margin-bottom: 0; }
#bw-tip .bw-tip-blk-top { display: flex; align-items: center; gap: 7px; }
#bw-tip .bw-tip-slot {
  font-family: ${theme.fonts.display}; font-size: 9px; letter-spacing: .16em;
  font-variant-caps: small-caps; color: ${theme.goldDim}; margin: 1px 0 3px;
}
#bw-tip .bw-tip-empty { color: ${theme.parchmentFaint}; font-style: italic; }
#bw-tip .bw-tip-warn { color: #ff8f7a; margin-top: 5px; }
#bw-windows .bw-drop-hot { outline: 2px solid ${theme.goldBright}; outline-offset: -2px; }
`;

// --------------------------------------------------------------- the tooltip
// One element for the whole window layer. Panels hand it lines and a colour;
// what those lines say is affixes.describe's business, not this file's.

let tipEl = null;

function ensureCss() {
  if (typeof document === 'undefined' || !document) return false;
  injectTheme(document);
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
  tipEl.className = 'bw-ui';
  tipEl.hidden = true;
  document.body.appendChild(tipEl);
  return tipEl;
}

/** One block of lines, the first of which is the name and takes the colour. */
function tipLines(into, lines, colour) {
  (lines || []).forEach((line, i) => {
    const d = document.createElement('div');
    d.className = i === 0 ? 'bw-tip-name' : 'bw-tip-line';
    if (i === 0 && colour) d.style.color = colour;
    if (typeof line === 'object' && line) {
      d.textContent = line.text;
      if (line.colour) d.style.color = line.colour;
    } else d.textContent = String(line);
    into.appendChild(d);
  });
}

/**
 * The card that hangs beside a tooltip: what is already worn where the hovered
 * item would go. One block per slot, so a two handed weapon shows the sword in
 * your hand and the shield it would take off your arm, and an empty slot says
 * "nothing worn there" rather than being left out.
 *
 * `card` is compare.js's `equippedCard` shape:
 *   { head, blocks: [{ slot, slotLabel, name, colour, base, lines, empty }],
 *     warn }
 */
function compareCard(card) {
  const wrap = document.createElement('div');
  wrap.className = 'bw-tip-cmp';
  const head = document.createElement('div');
  head.className = 'bw-tip-cmp-head';
  head.textContent = card.head || 'Equipped';
  wrap.appendChild(head);
  for (const b of card.blocks || []) {
    const blk = document.createElement('div');
    blk.className = 'bw-tip-blk';
    const top = document.createElement('div');
    top.className = 'bw-tip-blk-top';
    if (b.base) {
      const g = document.createElement('span');
      g.innerHTML = itemGlyph(b.base, 26);
      top.appendChild(g);
    }
    const name = document.createElement('span');
    name.className = b.empty ? 'bw-tip-empty' : 'bw-tip-name';
    name.textContent = b.name;
    if (b.colour) name.style.color = b.colour;
    top.appendChild(name);
    blk.appendChild(top);
    const slot = document.createElement('div');
    slot.className = 'bw-tip-slot';
    slot.textContent = b.slotLabel || b.slot || '';
    blk.appendChild(slot);
    if (!b.empty) tipLines(blk, (b.lines || []).slice(1), null);
    wrap.appendChild(blk);
  }
  if (card.warn) {
    const w = document.createElement('div');
    w.className = 'bw-tip-warn';
    w.textContent = card.warn;
    wrap.appendChild(w);
  }
  return wrap;
}

/**
 * Show lines at a point. `colour` tints the first line, which is the name.
 * `compare` is optional and draws the EQUIPPED card beside them.
 */
export function showTip(lines, colour, x, y, compare = null) {
  const el = tipNode();
  if (!el || !lines || !lines.length) return;
  el.textContent = '';
  const main = document.createElement('div');
  main.className = 'bw-tip-main';
  tipLines(main, lines, colour);
  el.appendChild(main);
  if (compare && Array.isArray(compare.blocks) && compare.blocks.length) {
    el.appendChild(compareCard(compare));
  }
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
export function attachTip(el, getter, hooks = null) {
  if (!el || !el.addEventListener) return () => {};
  const move = (e) => {
    const got = getter();
    if (!got || !got.lines || !got.lines.length) { hideTip(); return; }
    showTip(got.lines, got.colour, e ? e.clientX : 0, e ? e.clientY : 0, got.compare || null);
  };
  const enter = (e) => {
    if (hooks && typeof hooks.onEnter === 'function') {
      try { hooks.onEnter(e); } catch (err) { console.error('[windows] a hover hook threw', err); }
    }
    move(e);
  };
  const leave = (e) => {
    hideTip();
    if (hooks && typeof hooks.onLeave === 'function') {
      try { hooks.onLeave(e); } catch (err) { console.error('[windows] a hover hook threw', err); }
    }
  };
  el.addEventListener('pointerenter', enter);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerleave', leave);
  return () => {
    el.removeEventListener('pointerenter', enter);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerleave', leave);
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
const pct = (v) => `${v * 100}%`;

function placeByFraction(el, r) {
  if (!el || !r) return;
  el.style.left = pct(r.x);
  el.style.top = pct(r.y);
  el.style.width = pct(r.w);
  el.style.height = pct(r.h);
}

/** True when the two ids are allowed on screen together. */
export function sharesScreen(a, b) {
  if (a === b) return true;
  return PAIRS.some((p) => p.includes(a) && p.includes(b));
}

/** The word a key cap wears. */
export function keyCap(key) {
  if (!key) return '';
  if (key === ESCAPE_KEY) return 'esc';
  if (key === ' ') return 'space';
  return String(key).toUpperCase();
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
  const frames = new Map();          // id -> { el, body } for standalone panels
  const tabBodies = new Map();       // id -> the codex page for that tab
  const tabButtons = new Map();      // id -> the tab in the strip
  const built = new Set();           // ids whose build() has run
  const stack = [];                  // open ids, most recently opened last
  let el = null;
  let codex = null;                  // { el, tabs, bodies }
  let zTop = 1;
  let cascade = 0;
  let lastTab = null;

  if (hasDom) ensureCss();
  if (hasDom) {
    el = document.createElement('div');
    el.id = 'bw-windows';
    el.className = 'bw-ui';
    (root || document.body).appendChild(el);
  }

  const say = (text, kind) => {
    const hud = ctx.hud;
    if (hud && isFn(hud.log)) hud.log(text, kind);
    else if (hud && isFn(hud.toast)) hud.toast(text, kind);
  };

  const openTab = () => stack.find((id) => isCodexTab(id)) || null;

  /** True when this id is an alias AND the page it points at is registered. */
  const aliased = (id) => !!TAB_ALIAS[String(id)] && panels.has(TAB_ALIAS[String(id)]);
  /** The id that really answers to this one, here, with these panels. */
  const here = (id) => (aliased(id) ? TAB_ALIAS[String(id)] : String(id));

  // --------------------------------------------------------------- dragging
  // Both kinds of window drag by their top bar, and both stop pointer events
  // at the window so the camera, which listens on the canvas, never sees them.

  function makeDraggable(win, handle, id) {
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
    handle.addEventListener('pointerdown', (e) => {
      if (e.target && (e.target.tagName === 'BUTTON' || (e.target.closest && e.target.closest('button')))) return;
      e.stopPropagation();
      // A centred window has no left and top of its own yet. Take the box it
      // is actually in, so it does not jump on the first pixel of the drag.
      if (!win.style.left || win.style.transform) {
        const r = win.getBoundingClientRect ? win.getBoundingClientRect() : { left: win.offsetLeft, top: win.offsetTop };
        win.style.left = `${Math.round(r.left)}px`;
        win.style.top = `${Math.round(r.top)}px`;
        win.style.transform = '';
      }
      drag = { x: e.clientX, y: e.clientY, left: win.offsetLeft, top: win.offsetTop };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      raise(id);
    });
    win.addEventListener('pointerdown', (e) => { e.stopPropagation(); raise(id); });
  }

  // ------------------------------------------------------------ the codex

  function makeCodex() {
    const win = document.createElement('div');
    win.className = 'bw-win bw-win-codex bw-ui';
    win.hidden = true;
    win.style.left = '50%';
    win.style.top = '50%';
    win.style.transform = 'translate(-50%, -50%)';

    const frame = document.createElement('div');
    frame.className = 'bw-codex-frame';
    win.appendChild(frame);

    const top = document.createElement('div');
    top.className = 'bw-win-title bw-codex-title';
    const tabs = document.createElement('div');
    tabs.className = 'bw-codex-tabs';
    const x = document.createElement('button');
    x.className = 'bw-win-x bw-codex-close';
    x.type = 'button';
    x.textContent = '×';
    x.title = 'close';
    placeByFraction(x, CODEX_FRAME.close);
    x.addEventListener('click', (e) => { e.stopPropagation(); const t = openTab(); if (t) close(t); });
    top.appendChild(tabs);
    top.appendChild(x);
    const bodies = document.createElement('div');
    bodies.className = 'bw-codex-bodies';
    frame.appendChild(bodies);
    frame.appendChild(top);

    el.appendChild(win);
    makeDraggable(win, top, CODEX_ID);
    codex = { el: win, tabs, bodies };
    return codex;
  }

  /** The tab strip, in CODEX_TABS order, skipping tabs nobody registered. */
  function drawTabs() {
    if (!codex) return;
    codex.tabs.textContent = '';
    tabButtons.clear();
    const here = openTab();
    for (const t of CODEX_TABS) {
      const p = panels.get(t.id);
      if (!p) continue;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'bw-tab' + (here === t.id ? ' on' : '');
      b.dataset.tab = t.id;
      placeByFraction(b, CODEX_FRAME.tabs[t.id]);
      b.innerHTML = `${tabIcon(t.id, 'currentColor', 17)}<span class="bw-tab-word">${t.label}</span>`;
      // Every key that lands on this page, not just the page's own: B is an
      // alias of Character now and the cap has to say so.
      const keys = [p.key, ...Object.keys(TAB_ALIAS)
        .filter((a) => TAB_ALIAS[a] === t.id)
        .map((a) => panels.get(a)?.key)].filter(Boolean);
      if (keys.length) b.title = `${t.label}, key ${[...new Set(keys)].map(keyCap).join(' or ')}`;
      b.addEventListener('click', (e) => { e.stopPropagation(); open(t.id); });
      codex.tabs.appendChild(b);
      tabButtons.set(t.id, b);
    }
  }

  function tabBody(id) {
    if (!hasDom) return null;
    let body = tabBodies.get(id);
    if (body) return body;
    if (!codex) makeCodex();
    body = document.createElement('div');
    body.className = 'bw-win-body bw-codex-body';
    body.dataset.tab = id;
    body.hidden = true;
    codex.bodies.appendChild(body);
    tabBodies.set(id, body);
    return body;
  }

  // ------------------------------------------------------ standalone frames

  function makeFrame(panel) {
    const win = document.createElement('div');
    win.className = `bw-win bw-win-plain bw-ui bw-win-${panel.id}`;
    win.hidden = true;

    const frame = document.createElement('div');
    frame.className = 'bw-frame';
    win.appendChild(frame);

    const title = document.createElement('div');
    title.className = 'bw-win-title';
    const name = document.createElement('span');
    name.className = 'bw-win-name';
    name.textContent = panel.title || panel.id;
    const right = document.createElement('span');
    right.style.display = 'flex';
    right.style.alignItems = 'center';
    right.style.gap = '10px';
    if (panel.key) {
      const k = document.createElement('span');
      k.className = 'bw-win-key';
      k.textContent = keyCap(panel.key);
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

    frame.appendChild(title);
    frame.appendChild(body);

    const n = cascade++;
    win.style.left = `${Math.round(90 + n * CASCADE.x)}px`;
    win.style.top = `${Math.round(70 + n * CASCADE.y)}px`;

    el.appendChild(win);
    makeDraggable(win, title, panel.id);
    return { el: win, body, title: name };
  }

  function raise(id) {
    if (isCodexTab(id) || id === CODEX_ID) { if (codex) codex.el.style.zIndex = String(++zTop); return; }
    const f = frames.get(here(id));
    if (f) f.el.style.zIndex = String(++zTop);
  }

  // --------------------------------------------------------------- register

  /**
   * Take a panel. Refuses a second panel under the same id or the same key
   * rather than quietly letting one shadow the other, and refuses any key the
   * world drives, because a window bound to A turned walking left into a
   * window that opened and closed under the player's hands.
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
    let key = panel.key ? lower(panel.key) : null;
    if (key && RESERVED_KEYS.includes(key)) {
      console.warn(`[windows] "${panel.id}" asked for the ${key} key, which the world drives; it is registered with no key`);
      key = null;
    }
    if (key) {
      for (const p of panels.values()) {
        if (p.key && p.key === key) {
          console.warn(`[windows] "${panel.id}" and "${p.id}" both want the ${key} key; it stays with ${p.id}`);
          key = null;
          break;
        }
      }
    }
    panels.set(panel.id, { ...panel, key });
    if (hasDom && isCodexTab(panel.id)) { if (!codex) makeCodex(); drawTabs(); }
    return true;
  }

  const isOpen = (id) => (id === CODEX_ID ? openTab() !== null : stack.includes(here(id)));
  const list = () => [...panels.values()];

  // ------------------------------------------------------------- open/close

  /** Fill a page once. Returns whether the panel's own build ran clean. */
  function buildInto(id, body) {
    const panel = panels.get(id);
    if (!panel || built.has(id) || !isFn(panel.build)) return false;
    built.add(id);
    try { panel.build(body, ctx); return true; }
    catch (e) { console.error(`[windows] ${id} failed to build`, e); return false; }
  }

  function open(id, extra) {
    if (id === CODEX_ID) {
      const want = lastTab || CODEX_IDS.find((t) => panels.has(t));
      return want ? open(want, extra) : false;
    }
    // An alias is not a page. `open('bag')` is `open('character')` with a note
    // saying which door it came through, so the page can light the pack up.
    // The alias only bites when the page it points at is actually registered:
    // an embedder that registers the pack and not the sheet gets its pack,
    // rather than a warning about a panel it never asked for.
    if (aliased(id)) {
      const ex = (extra && typeof extra === 'object') ? { ...extra } : {};
      ex.focus = String(id);
      return open(TAB_ALIAS[String(id)], ex);
    }
    const panel = panels.get(id);
    if (!panel) { console.warn(`[windows] no panel called "${id}"`); return false; }
    if (stack.includes(id)) { raise(id); return true; }

    // The one-open rule: everything that cannot share the screen with this
    // goes, newest first so the closes read in the order a player would.
    for (const other of [...stack].reverse()) if (!sharesScreen(other, id)) close(other);
    // Two codex tabs cannot both be up: the codex shows one page at a time.
    if (isCodexTab(id)) { const t = openTab(); if (t) close(t); }

    if (hasDom) {
      if (isCodexTab(id)) buildInto(id, tabBody(id));
      else if (!frames.has(id)) {
        const f = makeFrame(panel);
        frames.set(id, f);
        buildInto(id, f.body);
      }
    }

    stack.push(id);
    if (isCodexTab(id)) lastTab = id;

    if (hasDom) {
      if (isCodexTab(id)) {
        if (codex) codex.el.hidden = false;
        for (const [tid, body] of tabBodies) body.hidden = tid !== id;
        drawTabs();
      } else {
        const f = frames.get(id);
        if (f) f.el.hidden = false;
      }
      raise(id);
    }

    if (isFn(panel.open)) {
      try { panel.open(ctx, extra); } catch (e) { console.error(`[windows] ${id} failed to open`, e); }
    }
    return true;
  }

  function close(id) {
    if (id === CODEX_ID) { const t = openTab(); return t ? close(t) : false; }
    if (aliased(id)) return close(TAB_ALIAS[String(id)]);
    const i = stack.indexOf(id);
    if (i < 0) return false;
    stack.splice(i, 1);
    if (isCodexTab(id)) {
      const body = tabBodies.get(id);
      if (body) body.hidden = true;
      if (codex && !openTab()) codex.el.hidden = true;
      drawTabs();
    } else {
      const f = frames.get(id);
      if (f) f.el.hidden = true;
    }
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
    hideTip();
    return n;
  }

  /**
   * Escape. With something open it closes the top one. With nothing open it
   * hands the key to whichever panel claimed it, which is Settings.
   */
  function escape() {
    if (stack.length) {
      const top = stack[stack.length - 1];
      close(top);
      hideTip();
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

  function bodyOf(id) {
    if (isCodexTab(id)) return tabBodies.get(here(id)) || null;
    return frames.get(id)?.body || null;
  }

  /** Rebuild a panel's body, for when the document changed underneath. */
  function refresh(id) {
    const real = here(id);
    const p = panels.get(real);
    const body = bodyOf(real);
    if (!p || !body || !isFn(p.build)) return false;
    body.textContent = '';
    built.delete(real);
    return buildInto(real, body);
  }

  function frameOf(id) {
    if (isCodexTab(id)) return codex ? codex.el : null;
    return frames.get(here(id))?.el || null;
  }

  function dispose() {
    closeAll();
    hideTip();
    if (el) el.remove();
    panels.clear();
    frames.clear();
    tabBodies.clear();
    tabButtons.clear();
    built.clear();
    codex = null;
  }

  return {
    el, ctx, register, open, close, toggle, isOpen, closeAll, escape, consumes,
    update, refresh, dispose, say, raise,
    bodyOf, frameOf,
    /** Which codex page is up, or null. */
    get tab() { return openTab(); },
    get codexEl() { return codex ? codex.el : null; },
    get anyOpen() { return stack.length > 0; },
    get top() { return stack.length ? stack[stack.length - 1] : null; },
    get openIds() { return [...stack]; },
    get panels() { return list(); },
    /** The key a panel ended up with, which is not always the key it asked for. */
    keyOf: (id) => panels.get(id)?.key || null,
  };
}
