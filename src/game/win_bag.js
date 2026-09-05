// The inventory page of the codex: the pack as a grid of gilded slots, what
// each thing weighs, what is in the purse, and the four things you do to an
// item. Key B.
//
// DOUBLE CLICK IS THE VERB. One click on a mystery identifies it, as it always
// did; two clicks put a sword on, drink a potion, eat the venison. Anything
// that is neither says so out loud, because a double click that does nothing
// and says nothing is indistinguishable from a broken grid. `actionFor(item)`
// is the whole decision, it is pure, and win_bag.test.mjs drives every branch
// of it without a browser.
//
// Clicking an unidentified item identifies it for real. The roll is done
// first, through inventory.identify, and the spinning glyphs are drawn over an
// item that has already changed; a flourish that gated the state change would
// lose the item the moment the window closed.

import { baseFor, RARITY_WORD, BASES } from '../mmo/items.js';
import { itemTipLines, colourOf, labelOf } from './inventory.js';
import { attachTip, dragSource, dropTarget, hideTip } from './windows.js';
import { theme, icon, itemGlyph } from './ui_theme.js';

/** How long the glyphs spin over an item that has already been identified. */
export const ROLL_MS = 450;
const ROLL_GLYPHS = ['?', '/', '|', '\\', '*', '+'];

// What a double click consumes is asked of items.js, not listed here. Anything
// with a `use` on its base, and anything items.js calls food or a meal, is
// eaten or drunk; the two stacking oddments that are neither are named, and
// auditUsable() fails loudly if items.js ever stops carrying them.
export const USE_KINDS = ['food', 'meal'];
export const USE_IDS = ['potion', 'bandage'];

/** True when a double click would consume this base. */
export function usable(base) {
  if (!base) return false;
  if (base.use) return true;
  if (USE_KINDS.includes(base.kind)) return true;
  return USE_IDS.includes(base.id);
}

/** The named oddments are real bases, or the pack would refuse to drink a potion. */
export function auditUsable() {
  for (const id of USE_IDS) {
    if (!BASES[id]) throw new Error(`win_bag: "${id}" is drunk or applied and items.js has no such base`);
  }
  let n = 0;
  for (const b of Object.values(BASES)) if (usable(b)) n++;
  if (n < USE_IDS.length) throw new Error('win_bag: nothing in the game can be eaten or drunk');
  return n;
}

export const USABLE = auditUsable();

/** The filter row, in the order it is drawn. `all` is first and is the default. */
export const CATEGORIES = [
  { id: 'all', label: 'all', mark: 'gem' },
  { id: 'weapons', label: 'weapons', mark: 'sword' },
  { id: 'armour', label: 'armour', mark: 'shield' },
  { id: 'consumables', label: 'consumables', mark: 'flask' },
  { id: 'materials', label: 'materials', mark: 'coin' },
];

/**
 * Pure. Which shelf an item belongs on. Anything that does not fit one of the
 * four is `other`, which only `all` shows, so nothing can go invisible.
 */
export function categoryOf(item) {
  const b = baseFor(item);
  if (!b) return 'other';
  if (b.kind === 'weapon' || b.kind === 'shield') return 'weapons';
  if (b.kind === 'armour' || b.kind === 'jewellery' || b.kind === 'offhand' || b.kind === 'instrument') return 'armour';
  if (usable(b)) return 'consumables';
  if (b.kind === 'material') return 'materials';
  return 'other';
}

/** Pure. Whether this category shows this item. */
export const inCategory = (item, cat) => cat === 'all' || categoryOf(item) === cat;

/**
 * Pure. What a double click does with this item, and what to say when it does
 * nothing. `kind` is 'equip', 'use' or 'none'.
 */
export function actionFor(item) {
  const b = baseFor(item);
  if (!b) return { kind: 'none', reason: 'there is nothing there' };
  if (b.slot) return { kind: 'equip', slot: b.slot, reason: null };
  if (usable(b)) return { kind: 'use', reason: null };
  if (b.kind === 'tool') {
    return { kind: 'none', reason: `${b.name.toLowerCase()} works in your hands, not on your body` };
  }
  return { kind: 'none', reason: `${b.name.toLowerCase()} is a material. It goes into something, it does not go on you` };
}

const CSS = `
.bw-bag { display: flex; flex-direction: column; gap: 12px; }
.bw-bag-head { display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap; }
.bw-bag-filters { display: flex; gap: 4px; }
.bw-bag-filters .bw-btn { display: inline-flex; align-items: center; gap: 6px; }
.bw-bag-purse { display: flex; gap: 18px; align-items: center; }
.bw-bag-purse .bw-cell-line { display: inline-flex; align-items: center; gap: 7px; }
.bw-bag-purse .bw-v { font-family: ${theme.fonts.display}; font-variant-numeric: tabular-nums; font-size: 15px; }
.bw-bag-purse .bw-v.bw-heavy { color: #ff8f7a; }
.bw-bag-grid { display: grid; grid-template-columns: repeat(auto-fill, 52px); gap: 7px; }
.bw-bag-grid .bw-slot { width: 52px; height: 52px; }
.bw-bag-grid .bw-slot.bw-filtered { opacity: .22; }
.bw-bag-foot { font-style: italic; color: ${theme.parchmentDim}; }
.bw-menu {
  position: fixed; z-index: 80; min-width: 140px; padding: 5px;
  background: linear-gradient(180deg, ${theme.stoneUp}, ${theme.stone});
  border: 1px solid ${theme.goldDim};
  box-shadow: 0 14px 44px rgba(0,0,0,.7);
  font-family: ${theme.fonts.body}; font-size: 14px; color: ${theme.parchment};
}
.bw-menu[hidden] { display: none; }
.bw-menu .bw-menu-item { padding: 5px 10px; cursor: pointer; }
.bw-menu .bw-menu-item:hover { background: rgba(201,164,74,.16); color: ${theme.goldBright}; }
.bw-menu .bw-menu-head {
  font-family: ${theme.fonts.display}; font-size: 10.5px; letter-spacing: .16em;
  text-transform: uppercase; color: ${theme.gold};
  padding: 4px 10px 7px; border-bottom: 1px solid ${theme.goldDim}66; margin-bottom: 5px;
}
`;

const h = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

function css() {
  if (typeof document === 'undefined' || document.getElementById('bw-bag-css')) return;
  const s = document.createElement('style');
  s.id = 'bw-bag-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

/** What a cell shows: the art, the count, the colour, and the mystery. */
export function cellOf(item) {
  if (!item) return { empty: true, text: '', count: 0, colour: null, mystery: false, rarity: null };
  const b = baseFor(item);
  const mystery = !item.identified && item.rarity !== 'common';
  return {
    empty: false,
    text: mystery ? `${RARITY_WORD[item.rarity]} ${b.name.toLowerCase()}` : (b?.name || labelOf(item)),
    count: b && b.stack ? (item.count || 1) : 0,
    colour: colourOf(item),
    rarity: item.rarity || 'common',
    mystery,
    base: b,
  };
}

export const panel = {
  id: 'bag',
  title: 'Inventory',
  key: 'b',

  build(el, ctx) {
    css();
    const character = () => (ctx.character && ctx.character.pack ? ctx.character : ctx.inventory?.character) || { pack: { slots: 0, items: [] } };
    const inv = () => ctx.inventory;
    const say = (t, kind) => (ctx.hud?.log ? ctx.hud.log(t, kind) : ctx.hud?.toast?.(t, kind));

    let filter = 'all';

    const root = h('div', 'bw-bag');
    el.appendChild(root);

    const head = h('div', 'bw-bag-head');
    const filters = h('div', 'bw-bag-filters');
    const purse = h('div', 'bw-bag-purse');
    head.appendChild(filters); head.appendChild(purse);
    root.appendChild(head);

    const grid = h('div', 'bw-bag-grid');
    root.appendChild(grid);

    const foot = h('div', 'bw-bag-foot');
    root.appendChild(foot);

    const buttons = new Map();
    for (const c of CATEGORIES) {
      const b = h('button', 'bw-btn' + (c.id === 'all' ? ' on' : ''));
      b.type = 'button';
      const i = h('span');
      i.innerHTML = icon(c.mark, 'currentColor', 13);
      b.appendChild(i);
      b.appendChild(h('span', null, c.label));
      b.addEventListener('click', () => {
        filter = c.id;
        for (const [id, el2] of buttons) el2.classList.toggle('on', id === filter);
        draw();
        const n = character().pack.items.filter((it) => it && inCategory(it, filter)).length;
        say(filter === 'all' ? `the whole pack, ${n} things in it` : `${n} ${c.label} in the pack`);
      });
      filters.appendChild(b);
      buttons.set(c.id, b);
    }

    const coinLine = h('span', 'bw-cell-line');
    const coinIcon = h('span'); coinIcon.innerHTML = icon('coin', theme.gold, 15);
    const coinNum = h('span', 'bw-v');
    coinLine.appendChild(coinIcon); coinLine.appendChild(coinNum);
    const loadLine = h('span', 'bw-cell-line');
    const loadIcon = h('span'); loadIcon.innerHTML = icon('scale', theme.gold, 15);
    const loadNum = h('span', 'bw-v');
    loadLine.appendChild(loadIcon); loadLine.appendChild(loadNum);
    purse.appendChild(coinLine); purse.appendChild(loadLine);

    const menu = h('div', 'bw-menu bw-ui');
    menu.hidden = true;
    document.body.appendChild(menu);
    const closeMenu = () => { menu.hidden = true; };
    window.addEventListener('pointerdown', (e) => { if (!menu.hidden && !menu.contains(e.target)) closeMenu(); });

    let cells = [];
    // Cells mid roll are left alone by draw(), or the four times a second
    // redraw would wipe the glyphs off an item it just identified.
    const rolling = new Set();

    function openMenu(i, x, y) {
      const item = character().pack.items[i];
      if (!item) return;
      menu.textContent = '';
      menu.appendChild(h('div', 'bw-menu-head', labelOf(item)));
      const add = (label, fn) => {
        const row = h('div', 'bw-menu-item', label);
        row.addEventListener('click', () => { closeMenu(); fn(); draw(); });
        menu.appendChild(row);
      };
      if (!item.identified && item.rarity !== 'common') add('identify', () => identify(i));
      const act = actionFor(item);
      if (act.kind === 'equip') add('equip', () => doubleClick(i));
      if (act.kind === 'use') add('use', () => doubleClick(i));
      add('sell', () => inv()?.sell({ pack: i }));
      add('drop', () => inv()?.drop({ pack: i }));
      menu.hidden = false;
      const w = menu.offsetWidth || 140, hh = menu.offsetHeight || 110;
      menu.style.left = `${Math.min(x, window.innerWidth - w - 6)}px`;
      menu.style.top = `${Math.min(y, window.innerHeight - hh - 6)}px`;
    }

    /**
     * The double click. Equip, use, or say why neither. Equipping goes through
     * inventory.equip, which speaks for itself; the other two branches speak
     * here, and nothing is silent.
     */
    function doubleClick(i) {
      const item = character().pack.items[i];
      if (!item) return { kind: 'none' };
      const act = actionFor(item);
      if (act.kind === 'equip') {
        inv()?.equip(i);
        draw();
        return act;
      }
      if (act.kind === 'use') {
        if (typeof ctx.useItem === 'function') {
          ctx.useItem(item, { pack: i });
        } else {
          say(`nothing has been written yet that uses ${labelOf(item).toLowerCase()}`, 'bad');
        }
        draw();
        return act;
      }
      say(act.reason, 'bad');
      return act;
    }

    /**
     * The real identify, then the flourish. `roll` only animates the cell that
     * already holds the identified item.
     */
    function identify(i) {
      const before = character().pack.items[i];
      if (!before || before.identified) { inv()?.identify({ pack: i }); return; }
      const res = inv()?.identify({ pack: i });
      draw();
      if (!res || !res.ok) return;
      const cell = cells[i];
      if (!cell) return;
      rolling.add(i);
      const started = Date.now();
      const glyph = h('span', 'bw-q');
      glyph.style.color = colourOf(res.item);
      cell.textContent = '';
      cell.appendChild(glyph);
      const spin = setInterval(() => {
        const t = Date.now() - started;
        if (t >= ROLL_MS) { clearInterval(spin); rolling.delete(i); draw(); return; }
        glyph.textContent = ROLL_GLYPHS[Math.floor(t / 60) % ROLL_GLYPHS.length];
      }, 60);
    }

    function build() {
      grid.textContent = '';
      cells = [];
      const n = character().pack.slots;
      for (let i = 0; i < n; i++) {
        const cell = h('div', 'bw-slot');
        cell.dataset.index = String(i);
        grid.appendChild(cell);
        cells.push(cell);
        attachTip(cell, () => {
          const it = character().pack.items[i];
          return it ? { lines: itemTipLines(it), colour: colourOf(it) } : null;
        });
        dragSource(cell, () => (character().pack.items[i] ? { pack: i } : null));
        dropTarget(cell, (from) => { inv()?.move(from, { pack: i }); draw(); });
        cell.addEventListener('click', () => {
          const it = character().pack.items[i];
          if (!it) return;
          if (!it.identified && it.rarity !== 'common') identify(i);
        });
        cell.addEventListener('dblclick', (e) => {
          e.preventDefault();
          hideTip();
          doubleClick(i);
        });
        cell.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          hideTip();
          openMenu(i, e.clientX, e.clientY);
        });
      }
    }

    function draw() {
      const c = character();
      if (cells.length !== c.pack.slots) build();
      let full = 0, shown = 0;
      for (let i = 0; i < cells.length; i++) {
        const item = c.pack.items[i] || null;
        if (item) full++;
        if (rolling.has(i)) continue;
        const v = cellOf(item);
        const cell = cells[i];
        cell.textContent = '';
        cell.classList.toggle('bw-empty', v.empty);
        const hidden = !v.empty && !inCategory(item, filter);
        cell.classList.toggle('bw-filtered', hidden);
        if (v.empty) { cell.removeAttribute('data-rarity'); continue; }
        if (!hidden) shown++;
        cell.dataset.rarity = v.rarity;
        if (v.mystery) {
          const q = h('span', 'bw-q', '?');
          q.style.color = v.colour;
          cell.appendChild(q);
        } else {
          const g = h('span');
          g.innerHTML = itemGlyph(v.base, 28);
          cell.appendChild(g);
        }
        if (v.count > 1) cell.appendChild(h('span', 'bw-count', String(v.count)));
        cell.title = v.text;
      }

      const i2 = inv();
      coinNum.textContent = String(c.gold ?? 0);
      if (i2) {
        loadNum.textContent = `${i2.weight()} of ${i2.carry()} stones`;
        loadNum.classList.toggle('bw-heavy', i2.overweight());
      }
      const room = c.pack.slots - full;
      foot.textContent = filter === 'all'
        ? `${full} of ${c.pack.slots} slots hold something. Double click a thing to put it on or use it, one click to look closer at a mystery.`
        : `${shown} of the ${full} things in the pack are ${filter}. The rest are still there, only faded.`;
      if (room === 0) foot.textContent += ' There is no room left.';
    }

    build();
    draw();
    this._draw = draw;
    this._closeMenu = closeMenu;
    this._doubleClick = doubleClick;
  },

  open() { if (this._draw) this._draw(); },
  close() { if (this._closeMenu) this._closeMenu(); hideTip(); },

  tick(dt) {
    this._since = (this._since || 0) + (dt || 0);
    if (this._since < 0.25) return;
    this._since = 0;
    if (this._draw) this._draw();
  },
};

export default panel;
