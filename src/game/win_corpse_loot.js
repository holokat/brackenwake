// The small, close-range window for a dead monster's held rewards.

import { itemTipLines, colourOf, labelOf } from './inventory.js';
import { attachTip } from './windows.js';
import { theme, icon, itemGlyph } from './ui_theme.js';

const CSS = `
.bw-corpse-loot { min-width: min(390px, 88vw); display: flex; flex-direction: column; gap: 12px; }
.bw-corpse-loot-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.bw-corpse-loot-title { margin: 0; font-family: ${theme.fonts.display}; color: ${theme.goldBright}; font-size: 19px; text-wrap: balance; }
.bw-corpse-loot-note { margin: 0; color: ${theme.parchmentDim}; font-size: 13px; text-wrap: pretty; }
.bw-corpse-loot-list { display: grid; gap: 7px; }
.bw-corpse-loot-row { min-height: 44px; display: grid; grid-template-columns: 38px 1fr auto; gap: 9px; align-items: center; padding: 6px 8px; background: rgba(0,0,0,.22); box-shadow: inset 0 1px 0 rgba(255,255,255,.05); }
.bw-corpse-loot-glyph { display: grid; place-items: center; width: 34px; height: 34px; }
.bw-corpse-loot-glyph svg { width: 28px; height: 28px; }
.bw-corpse-loot-name { font-family: ${theme.fonts.display}; font-size: 14px; }
.bw-corpse-loot-actions { display: flex; justify-content: flex-end; gap: 8px; }
.bw-corpse-loot-actions button { min-height: 40px; }
`;

const h = (tag, cls, text) => {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text != null) el.textContent = text;
  return el;
};

function css() {
  if (typeof document === 'undefined' || document.getElementById('bw-corpse-loot-css')) return;
  const style = document.createElement('style');
  style.id = 'bw-corpse-loot-css';
  style.textContent = CSS;
  document.head.appendChild(style);
}

export const panel = {
  id: 'corpseLoot', title: 'Loot',

  build(el, ctx) {
    css();
    let corpse = null;
    const loot = ctx.corpseLoot;
    const root = h('section', 'bw-corpse-loot');
    el.appendChild(root);

    const draw = () => {
      root.textContent = '';
      const contents = loot?.contentsOf?.(corpse) || { items: [], gold: 0 };
      const name = String(corpse?.name || corpse?.row?.name || 'Corpse');
      const head = h('div', 'bw-corpse-loot-head');
      head.appendChild(h('h3', 'bw-corpse-loot-title', `${name}'s loot`));
      root.appendChild(head);
      const gate = loot?.canTake?.(corpse) || { ok: false, reason: 'there is no loot here' };
      root.appendChild(h('p', 'bw-corpse-loot-note', gate.ok ? 'Take one thing, or take everything your pack can hold.' : gate.reason));
      const list = h('div', 'bw-corpse-loot-list');
      root.appendChild(list);
      const take = (fn) => {
        const result = fn();
        if (result?.emptied) ctx.windows?.close?.('corpseLoot');
        else draw();
      };
      for (const item of contents.items) {
        const row = h('div', 'bw-corpse-loot-row');
        const glyph = h('span', 'bw-corpse-loot-glyph');
        glyph.innerHTML = itemGlyph(item, 28);
        row.appendChild(glyph);
        const label = h('span', 'bw-corpse-loot-name', labelOf(item));
        label.style.color = colourOf(item);
        row.appendChild(label);
        const button = h('button', null, 'Take'); button.type = 'button'; button.disabled = !gate.ok;
        button.addEventListener('click', () => take(() => loot.takeItem(corpse, item)));
        row.appendChild(button);
        attachTip(row, () => ({ lines: itemTipLines(item), colour: colourOf(item) }));
        list.appendChild(row);
      }
      if (contents.gold) {
        const row = h('div', 'bw-corpse-loot-row');
        const glyph = h('span', 'bw-corpse-loot-glyph'); glyph.innerHTML = icon('coin', theme.gold, 27); row.appendChild(glyph);
        row.appendChild(h('span', 'bw-corpse-loot-name', `${contents.gold} gold`));
        const button = h('button', null, 'Take'); button.type = 'button'; button.disabled = !gate.ok;
        button.addEventListener('click', () => take(() => loot.takeGold(corpse)));
        row.appendChild(button); list.appendChild(row);
      }
      if (!contents.items.length && !contents.gold) list.appendChild(h('p', 'bw-corpse-loot-note', 'The body carries nothing else.'));
      const actions = h('div', 'bw-corpse-loot-actions');
      const all = h('button', null, 'Take all'); all.type = 'button'; all.disabled = !gate.ok || (!contents.items.length && !contents.gold);
      all.addEventListener('click', () => take(() => loot.takeAll(corpse)));
      actions.appendChild(all); root.appendChild(actions);
    };
    draw();
    const signature = () => {
      const contents = loot?.contentsOf?.(corpse) || { items: [], gold: 0 };
      const gate = loot?.canTake?.(corpse) || { ok: false, reason: 'there is no loot here' };
      return [loot?.isActive?.(corpse) ? 1 : 0, gate.ok ? 1 : 0, gate.reason || '', contents.gold,
        contents.items.map((item) => `${item?.id || item?.base || ''}:${item?.count || 1}`).join('|')].join('~');
    };
    this._setCorpse = (next) => { corpse = next || null; this._corpse = corpse; this._signature = signature(); draw(); };
    this._draw = draw;
    this._signatureFor = signature;
  },

  open(ctx, extra = {}) { this._setCorpse?.(extra.corpse); },

  tick(_dt, ctx) {
    if (!this._corpse) return;
    if (!ctx.corpseLoot?.isActive?.(this._corpse)) { ctx.windows?.close?.('corpseLoot'); return; }
    const next = this._signatureFor?.();
    if (next !== this._signature) { this._signature = next; this._draw?.(); }
  },

  close() { this._corpse = null; this._signature = null; },
};

export default panel;
