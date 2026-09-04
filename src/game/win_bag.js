// The bag: a grid of the pack's slots, stacks with their counts, and the three
// things you do to an item. Key B.
//
// Clicking an unidentified item identifies it for real. The roll is done
// first, through inventory.identify, and the spinning glyphs are drawn over an
// item that has already changed; a flourish that gates the state change would
// lose the item the moment the window closed, and a preview that pretends to
// identify is the exact thing the project banned after test mode previewed
// story choices and applied none of them.

import { baseFor, RARITY_WORD } from '../mmo/items.js';
import { itemTipLines, colourOf, labelOf } from './inventory.js';
import { attachTip, dragSource, dropTarget, hideTip } from './windows.js';

/** How long the glyphs spin over an item that has already been identified. */
export const ROLL_MS = 450;
const ROLL_GLYPHS = ['?', '/', '|', '\\', '*', '+'];

const CSS = `
.bw-bag-head { display: flex; justify-content: space-between; gap: 14px; margin-bottom: 9px; }
.bw-bag-grid { display: grid; grid-template-columns: repeat(5, 56px); gap: 6px; }
.bw-bag-grid .bw-cell {
  width: 56px; height: 56px; border-radius: 6px; position: relative; cursor: pointer;
  background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.14);
  display: flex; align-items: center; justify-content: center; text-align: center;
  font-size: 10px; line-height: 1.2; padding: 2px; overflow: hidden; color: #ece6da;
}
.bw-bag-grid .bw-cell.empty { cursor: default; }
.bw-bag-grid .bw-cell .bw-q { font-size: 26px; font-weight: 700; }
.bw-bag-grid .bw-cell .bw-count {
  position: absolute; right: 3px; bottom: 2px; font-size: 10.5px; font-weight: 700;
  font-variant-numeric: tabular-nums; text-shadow: 0 1px 2px #000;
}
.bw-menu {
  position: fixed; z-index: 80; min-width: 128px; padding: 4px;
  background: rgba(16,19,21,.98); border: 1px solid rgba(255,255,255,.2); border-radius: 7px;
  box-shadow: 0 12px 40px rgba(0,0,0,.55);
  font: 12.5px/1.4 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #e8e2d6;
}
.bw-menu[hidden] { display: none; }
.bw-menu .bw-menu-item { padding: 5px 9px; border-radius: 5px; cursor: pointer; }
.bw-menu .bw-menu-item:hover { background: rgba(255,255,255,.10); }
.bw-menu .bw-menu-head { padding: 4px 9px 6px; color: #95a08f; border-bottom: 1px solid rgba(255,255,255,.12); margin-bottom: 4px; }
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

/** What a cell shows: the short name, the count, the colour, and the mystery. */
export function cellOf(item) {
  if (!item) return { empty: true, text: '', count: 0, colour: null, mystery: false };
  const b = baseFor(item);
  const mystery = !item.identified && item.rarity !== 'common';
  return {
    empty: false,
    text: mystery ? `${RARITY_WORD[item.rarity]} ${b.name.toLowerCase()}` : (b?.name || labelOf(item)),
    count: b && b.stack ? (item.count || 1) : 0,
    colour: colourOf(item),
    mystery,
  };
}

export const panel = {
  id: 'bag',
  title: 'Bag',
  key: 'b',

  build(el, ctx) {
    css();
    const character = () => (ctx.character && ctx.character.pack ? ctx.character : ctx.inventory?.character) || { pack: { slots: 0, items: [] } };
    const inv = () => ctx.inventory;
    const say = (t, kind) => (ctx.hud?.log ? ctx.hud.log(t, kind) : ctx.hud?.toast?.(t, kind));

    const head = h('div', 'bw-bag-head');
    const used = h('span');
    const load = h('span', 'bw-num');
    head.appendChild(used); head.appendChild(load);
    el.appendChild(head);

    const grid = h('div', 'bw-bag-grid');
    el.appendChild(grid);

    const menu = h('div', 'bw-menu');
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
      const b = baseFor(item);
      if (b && b.slot) add('equip', () => inv()?.equip(i));
      if (b && (b.kind === 'material' || b.stack)) {
        add('use', () => {
          if (typeof ctx.useItem === 'function') ctx.useItem(item, { pack: i });
          else say(`nothing has been written yet that uses ${labelOf(item).toLowerCase()}`, 'bad');
        });
      }
      add('sell', () => inv()?.sell({ pack: i }));
      add('drop', () => inv()?.drop({ pack: i }));
      menu.hidden = false;
      const w = menu.offsetWidth || 130, hh = menu.offsetHeight || 100;
      menu.style.left = `${Math.min(x, window.innerWidth - w - 6)}px`;
      menu.style.top = `${Math.min(y, window.innerHeight - hh - 6)}px`;
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
        const cell = h('div', 'bw-cell');
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
      let full = 0;
      for (let i = 0; i < cells.length; i++) {
        const item = c.pack.items[i] || null;
        if (item) full++;
        if (rolling.has(i)) continue;
        const v = cellOf(item);
        const cell = cells[i];
        cell.textContent = '';
        cell.classList.toggle('empty', v.empty);
        if (v.empty) { cell.style.borderColor = 'rgba(255,255,255,.14)'; continue; }
        cell.style.borderColor = v.colour;
        if (v.mystery) {
          const q = h('span', 'bw-q', '?');
          q.style.color = v.colour;
          cell.appendChild(q);
        } else {
          const n = h('span', null, v.text);
          n.style.color = v.colour;
          cell.appendChild(n);
        }
        if (v.count > 1) cell.appendChild(h('span', 'bw-count', String(v.count)));
      }
      used.textContent = `${full} of ${c.pack.slots} slots`;
      const i = inv();
      if (i) {
        load.textContent = `${i.weight()} of ${i.carry()} stones`;
        load.style.color = i.overweight() ? '#ff8f7a' : '';
      }
    }

    build();
    draw();
    this._draw = draw;
    this._closeMenu = closeMenu;
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
