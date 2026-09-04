// The character window: the paper doll, the sheet, and what the numbers add
// up to. Key C.
//
// The doll has fourteen cells because the game has fourteen slots, and
// auditDoll() counts them at load rather than trusting the layout. The farm's
// HUD shipped five tools into three painted cells and ate every click for a
// week; a layout that knows its own capacity is the fix for that class, not
// for that bug.
//
// Every number here is asked of the rules layer. Pools and carry come from
// stats.derived, AR and resists from the same sums actor.js makes (through
// inventory.js), and an item's lines from affixes.describe. Nothing is
// recomputed a second way, so the sheet and the fight cannot disagree.

import { SLOTS, baseFor } from '../mmo/items.js';
import { derived, STATS } from '../mmo/stats.js';
import {
  itemTipLines, colourOf, labelOf, weightOfCharacter, carryOfCharacter,
  armourOfCharacter, resistsOfCharacter, RESIST_TYPES,
} from './inventory.js';
import { attachTip, dropTarget, dragSource } from './windows.js';

/** Which cell each slot sits in. Three columns: worn, worn, held. */
export const DOLL = {
  left: ['head', 'neck', 'chest', 'back', 'wrists', 'hands'],
  right: ['waist', 'legs', 'feet', 'ring1', 'ring2'],
  hands: ['mainHand', 'offHand', 'ranged'],
};

/** What the label under an empty cell says. */
export const SLOT_LABELS = {
  head: 'head', neck: 'neck', chest: 'chest', back: 'back', hands: 'hands',
  wrists: 'wrists', waist: 'waist', legs: 'legs', feet: 'feet',
  ring1: 'ring', ring2: 'ring', mainHand: 'main hand', offHand: 'off hand', ranged: 'ranged',
};

export const STAT_LABELS = { str: 'STR', dex: 'DEX', int: 'INT', con: 'CON', wis: 'WIS' };

/**
 * The doll shows every slot, once. Runs at load: a fifteenth slot added to
 * items.js and forgotten here fails here instead of vanishing from the screen.
 */
export function auditDoll() {
  const cells = [...DOLL.left, ...DOLL.right, ...DOLL.hands];
  if (cells.length !== SLOTS.length) {
    throw new Error(`auditDoll: the doll has ${cells.length} cells and the game has ${SLOTS.length} slots`);
  }
  if (new Set(cells).size !== cells.length) throw new Error('auditDoll: a slot appears in two cells');
  for (const s of SLOTS) if (!cells.includes(s)) throw new Error(`auditDoll: no cell for the ${s} slot`);
  for (const s of cells) {
    if (!SLOTS.includes(s)) throw new Error(`auditDoll: ${s} is a cell and not a slot`);
    if (!SLOT_LABELS[s]) throw new Error(`auditDoll: the ${s} cell has no label`);
  }
  return cells.length;
}

auditDoll();

const CSS = `
.bw-sheet { display: flex; gap: 18px; align-items: flex-start; }
.bw-doll { display: grid; grid-template-columns: repeat(3, 58px); gap: 6px; }
.bw-doll .bw-cell {
  width: 58px; height: 58px; border-radius: 6px; position: relative; cursor: pointer;
  background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.14);
  display: flex; align-items: center; justify-content: center; text-align: center;
  font-size: 10.5px; line-height: 1.2; color: #8d968a; padding: 2px; overflow: hidden;
}
.bw-doll .bw-cell.filled { color: #ece6da; font-size: 10px; }
.bw-doll .bw-cell .bw-q { font-size: 26px; font-weight: 700; }
.bw-doll .bw-cell .bw-tag {
  position: absolute; left: 0; right: 0; bottom: 0; font-size: 9px; letter-spacing: .04em;
  color: #7f887d; background: rgba(0,0,0,.35);
}
.bw-sheet-cols { display: flex; gap: 22px; flex: 1 1 auto; min-width: 210px; }
.bw-sheet .bw-line { display: flex; justify-content: space-between; gap: 14px; padding: 1px 0; }
.bw-sheet .bw-line b { font-weight: 600; font-variant-numeric: tabular-nums; }
.bw-sheet .bw-line.over b { color: #ff8f7a; }
.bw-sheet .bw-who { margin-bottom: 8px; }
.bw-sheet .bw-who .bw-name { font-size: 15px; font-weight: 600; }
`;

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const one = (v) => (Math.round(v * 10) / 10).toFixed(1);

function css() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('bw-sheet-css')) return;
  const s = document.createElement('style');
  s.id = 'bw-sheet-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

const h = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

/**
 * Every number the sheet prints, as data. Node reads this; the DOM only
 * arranges it, which is why the numbers can be tested without a browser.
 */
export function sheetOf(character, actor) {
  const stats = character?.stats || {};
  const d = derived(stats, character?.skills || {});
  const ar = actor && isNum(actor.ar) ? Math.round(actor.ar) : armourOfCharacter(character);
  const resists = actor && actor.resists ? actor.resists : resistsOfCharacter(character);
  const weight = weightOfCharacter(character);
  const carry = carryOfCharacter(character);
  return {
    stats: STATS.map((k) => ({ id: k, label: STAT_LABELS[k], value: isNum(stats[k]) ? stats[k] : 0 })),
    pools: [
      { label: 'health', value: `${Math.floor(isNum(character?.health) ? character.health : d.maxHealth)} / ${Math.floor(d.maxHealth)}` },
      { label: 'mana', value: `${Math.floor(isNum(character?.mana) ? character.mana : d.maxMana)} / ${Math.floor(d.maxMana)}` },
      { label: 'stamina', value: `${Math.floor(isNum(character?.stamina) ? character.stamina : d.maxStamina)} / ${Math.floor(d.maxStamina)}` },
    ],
    regen: [
      { label: 'health regen', value: `${one(d.healthRegen)} a second` },
      { label: 'mana regen', value: `${one(d.manaRegen)} a second` },
      { label: 'stamina regen', value: `${one(d.staminaRegen)} a second` },
    ],
    ar,
    resists: RESIST_TYPES.map((t) => ({ label: t, value: Math.round(resists[t] || 0) })),
    weight, carry, over: weight > carry,
    gold: isNum(character?.gold) ? character.gold : 0,
  };
}

/** The tooltip a cell shows, or null when the cell is empty. */
export const tipFor = (item) => (item ? { lines: itemTipLines(item), colour: colourOf(item) } : null);

export const panel = {
  id: 'character',
  title: 'Character',
  key: 'c',

  build(el, ctx) {
    css();
    const character = () => (ctx.character && ctx.character.pack ? ctx.character : ctx.inventory?.character) || {};
    const inv = () => ctx.inventory;

    const root = h('div', 'bw-sheet');
    const dollWrap = h('div');
    const who = h('div', 'bw-who');
    const name = h('div', 'bw-name');
    const sub = h('div', 'bw-dim');
    who.appendChild(name); who.appendChild(sub);
    dollWrap.appendChild(who);
    const doll = h('div', 'bw-doll');
    dollWrap.appendChild(doll);
    root.appendChild(dollWrap);

    const cols = h('div', 'bw-sheet-cols');
    const colA = h('div'); colA.style.flex = '1 1 0';
    const colB = h('div'); colB.style.flex = '1 1 0';
    cols.appendChild(colA); cols.appendChild(colB);
    root.appendChild(cols);
    el.appendChild(root);

    // The doll: three columns, read across, so the grid order is a row at a time.
    const rows = Math.max(DOLL.left.length, DOLL.right.length, DOLL.hands.length);
    const cells = new Map();
    for (let r = 0; r < rows; r++) {
      for (const col of [DOLL.left, DOLL.right, DOLL.hands]) {
        const slot = col[r];
        const cell = h('div', 'bw-cell');
        if (!slot) { cell.style.visibility = 'hidden'; doll.appendChild(cell); continue; }
        cell.dataset.slot = slot;
        doll.appendChild(cell);
        cells.set(slot, cell);
        attachTip(cell, () => tipFor(character().equipment?.[slot]));
        dragSource(cell, () => (character().equipment?.[slot] ? { slot } : null));
        dropTarget(cell, (from) => { inv()?.move(from, { slot }); draw(); });
        // A click takes it off, which is the fastest thing a player wants here.
        cell.addEventListener('click', () => {
          if (!character().equipment?.[slot]) return;
          inv()?.unequip(slot);
          draw();
        });
      }
    }

    const line = (label, value, over) => {
      const d = h('div', `bw-line${over ? ' over' : ''}`);
      d.appendChild(h('span', 'bw-dim', label));
      d.appendChild(h('b', null, String(value)));
      return d;
    };

    function draw() {
      const c = character();
      const s = sheetOf(c, ctx.actor);
      name.textContent = c.name || 'unnamed';
      const op = c.opening ? `${c.opening}` : 'no opening on record';
      sub.textContent = `${op}, ${s.gold} gold`;

      for (const [slot, cell] of cells) {
        const item = c.equipment?.[slot] || null;
        cell.textContent = '';
        cell.classList.toggle('filled', !!item);
        if (!item) {
          cell.appendChild(h('span', null, SLOT_LABELS[slot]));
          cell.style.borderColor = 'rgba(255,255,255,.14)';
          continue;
        }
        const colour = colourOf(item);
        cell.style.borderColor = colour;
        if (!item.identified && item.rarity !== 'common') {
          const q = h('span', 'bw-q', '?');
          q.style.color = colour;
          cell.appendChild(q);
        } else {
          const n = h('span', null, baseFor(item)?.name || labelOf(item));
          n.style.color = colour;
          cell.appendChild(n);
        }
        cell.appendChild(h('span', 'bw-tag', SLOT_LABELS[slot]));
      }

      colA.textContent = '';
      colA.appendChild(h('h3', null, 'Stats'));
      for (const st of s.stats) colA.appendChild(line(st.label, st.value));
      colA.appendChild(h('h3', null, 'Pools'));
      for (const p of s.pools) colA.appendChild(line(p.label, p.value));
      for (const r of s.regen) colA.appendChild(line(r.label, r.value));

      colB.textContent = '';
      colB.appendChild(h('h3', null, 'Defence'));
      colB.appendChild(line('armour', s.ar));
      for (const r of s.resists) colB.appendChild(line(`${r.label} resist`, `${r.value}%`));
      colB.appendChild(h('h3', null, 'Load'));
      colB.appendChild(line('weight', `${s.weight} of ${s.carry} stones`, s.over));
      if (s.over) colB.appendChild(h('div', 'bw-dim', 'over the limit, so you walk and cannot run'));
    }

    draw();
    this._draw = draw;
  },

  open() { this._since = 0; if (this._draw) this._draw(); },

  // Live numbers, four times a second. Every frame would rebuild forty nodes
  // sixty times over for a health bar that moves once a second.
  tick(dt) {
    this._since = (this._since || 0) + (dt || 0);
    if (this._since < 0.25) return;
    this._since = 0;
    if (this._draw) this._draw();
  },
};

export default panel;
