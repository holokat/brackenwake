// Abilities: everything the skills have already bought, and the twelve slots
// they go into. Key P.
//
// It was A, which is also strafe left, so walking left flapped this window
// open and shut. windows.js now refuses every key the world drives, and P is
// what this page answers to.
//
// hud.js draws the bar the player fights from (W4). This window writes
// `character.bar[slot]` and calls `ctx.onBarChange?.()` so that bar redraws.
// It also draws its own strip of the same twelve slots, for two reasons: a
// window that can only be used by dragging onto another agent's element is a
// feature that does not exist until both halves land, and a player wants to
// see the bar while choosing what goes on it.
//
// The drag payload is `{ ability: id }` under the same mime the pack uses, so
// the real bar can accept exactly what this strip accepts.

import { ABILITIES, ABILITIES_BY_ID, GROUPS, unlockedFor, costKind, manaCostFor } from '../mmo/abilities.js';
import { dragSource, dropTarget, attachTip, hideTip } from './windows.js';
import { theme } from './ui_theme.js';

/** 06-ECONOMY-UI.md: twelve slots, keys 1 to 0 and minus and equals. */
export const BAR_SLOTS = 12;
export const BAR_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='];

if (BAR_KEYS.length !== BAR_SLOTS) {
  throw new Error(`win_abilities: ${BAR_KEYS.length} keys for ${BAR_SLOTS} slots`);
}

/**
 * The key under a slot. The settings window can rebind the twelve, so the
 * label is read off the document when it has been, and falls back to the
 * default row when it has not.
 */
export function keyFor(character, slot) {
  const bound = character && character.settings && Array.isArray(character.settings.bar) ? character.settings.bar[slot] : null;
  const k = bound || BAR_KEYS[slot];
  return k === '-' ? 'minus' : k === '=' ? 'equals' : String(k);
}

/** Fill in the bar the document may not have yet, in place. */
export function barOf(character) {
  if (!Array.isArray(character.bar)) character.bar = [];
  character.bar.length = BAR_SLOTS;
  for (let i = 0; i < BAR_SLOTS; i++) if (character.bar[i] === undefined) character.bar[i] = null;
  return character.bar;
}

/**
 * Put an ability on the bar, or take one off with `null`. Returns what
 * happened and why, in words, because a slot that silently refuses a passive
 * is indistinguishable from a broken drag.
 */
export function setBarSlot(character, slot, abilityId) {
  const bar = barOf(character);
  if (!Number.isInteger(slot) || slot < 0 || slot >= BAR_SLOTS) {
    return { ok: false, reason: `the bar has ${BAR_SLOTS} slots and that is not one of them` };
  }
  if (abilityId == null) {
    const had = bar[slot];
    if (!had) return { ok: false, reason: 'that slot is already empty' };
    bar[slot] = null;
    return { ok: true, slot, removed: had, reason: `${ABILITIES_BY_ID[had]?.name || had} comes off the bar` };
  }
  const ability = ABILITIES_BY_ID[abilityId];
  if (!ability) return { ok: false, reason: `there is no ability called ${abilityId}` };
  if (ability.passive) {
    return { ok: false, reason: `${ability.name} is passive and works on its own; it does not go on the bar` };
  }
  // The same ability twice on the bar is two cooldowns showing one truth.
  const already = bar.indexOf(abilityId);
  if (already >= 0 && already !== slot) bar[already] = null;
  const displaced = bar[slot] && bar[slot] !== abilityId ? bar[slot] : null;
  bar[slot] = abilityId;
  const words = [`${ability.name} goes on slot ${slot + 1}, key ${keyFor(character, slot)}`];
  if (displaced) words.push(`${ABILITIES_BY_ID[displaced]?.name || displaced} comes off`);
  if (already >= 0 && already !== slot) words.push(`and leaves slot ${already + 1}`);
  return { ok: true, slot, displaced, moved: already >= 0 && already !== slot, reason: words.join(', ') };
}

/** The lines the tooltip shows for an ability. */
export function abilityLines(ability, character) {
  if (!ability) return [];
  const lines = [ability.name, `${ability.group}, ${ability.passive ? 'passive' : ability.target}`];
  const kind = costKind(ability);
  if (kind === 'mana') lines.push(`${manaCostFor(ability, character || {})} mana`);
  else if (kind === 'stamina') lines.push(`${ability.cost.stamina} stamina`);
  else if (kind === 'item') lines.push(`costs ${Object.values(ability.cost)[0]}`);
  else if (!ability.passive) lines.push('costs nothing');
  if (ability.cooldown) lines.push(`${ability.cooldown} s cooldown`);
  if (ability.castTime) lines.push(`${ability.castTime} s cast${ability.moving ? ', on the move' : ', and it roots you'}`);
  if (ability.range) lines.push(`${ability.range} m`);
  lines.push(ability.description);
  return lines;
}

const CSS = `
.bw-abils { width: 100%; }
.bw-abils .bw-hint { color: ${theme.parchmentDim}; font-style: italic; margin-bottom: 10px; }
.bw-bar-strip { display: flex; gap: 5px; margin: 0 0 14px; flex-wrap: wrap; }
.bw-bar-strip .bw-slot {
  width: 54px; height: 54px; padding: 3px 3px 11px;
  font-family: ${theme.fonts.body}; font-size: 11px; line-height: 1.12; text-align: center;
  color: ${theme.parchment};
}
.bw-bar-strip .bw-slot .bw-k {
  position: absolute; left: 0; right: 0; bottom: 0;
  font-family: ${theme.fonts.display}; font-size: 8.5px; letter-spacing: .1em;
  text-transform: uppercase; color: ${theme.gold}; background: rgba(0,0,0,.55);
}
.bw-abil {
  display: grid; grid-template-columns: 190px 1fr; gap: 12px; align-items: baseline;
  padding: 4px 0; border-top: 1px solid rgba(201,164,74,.14); cursor: grab;
}
.bw-abil.passive { cursor: default; opacity: .8; }
.bw-abil .bw-abil-name { font-family: ${theme.fonts.display}; font-size: 13px; font-weight: 600; }
.bw-abil .bw-abil-line { color: ${theme.parchmentDim}; font-size: 13.5px; }
.bw-abil.on { border-left: 2px solid ${theme.gold}; padding-left: 8px; }
.bw-abil.on .bw-abil-name { color: ${theme.goldBright}; }
`;

const h = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

function css() {
  if (typeof document === 'undefined' || document.getElementById('bw-abils-css')) return;
  const s = document.createElement('style');
  s.id = 'bw-abils-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

export const panel = {
  id: 'abilities',
  title: 'Abilities',
  key: 'p',

  build(el, ctx) {
    css();
    const character = () => (ctx.character && ctx.character.skills ? ctx.character : ctx.inventory?.character) || { skills: {}, stats: {} };
    const say = (t, kind) => (ctx.hud?.log ? ctx.hud.log(t, kind) : ctx.hud?.toast?.(t, kind));
    let picked = null;      // clicked in the list, waiting for a slot

    const root = h('div', 'bw-abils');
    el.appendChild(root);

    root.appendChild(h('div', 'bw-hint', 'Drag an ability onto a slot, or click one and then a slot. Right click a slot to clear it. The bar answers to 1 to 0 and the two keys after them.'));
    const strip = h('div', 'bw-bar-strip');
    root.appendChild(strip);
    const listEl = h('div');
    root.appendChild(listEl);

    const slots = [];
    for (let i = 0; i < BAR_SLOTS; i++) {
      const cell = h('div', 'bw-slot');
      cell.appendChild(h('span', 'bw-k', keyFor(character(), i)));
      strip.appendChild(cell);
      slots.push(cell);
      dropTarget(cell, (payload) => {
        if (!payload || !payload.ability) return;
        apply(i, payload.ability);
      });
      cell.addEventListener('click', () => {
        if (picked) { apply(i, picked); picked = null; return; }
        const c = character();
        const on = barOf(c)[i];
        if (!on) { say(`slot ${i + 1} is empty, and waiting`); return; }
        say(`slot ${i + 1} holds ${ABILITIES_BY_ID[on]?.name || on}, key ${keyFor(c, i)}`);
      });
      cell.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        apply(i, null);
      });
      attachTip(cell, () => {
        const on = barOf(character())[i];
        return on ? { lines: abilityLines(ABILITIES_BY_ID[on], character()) } : null;
      });
    }

    function apply(slot, abilityId) {
      const c = character();
      const res = setBarSlot(c, slot, abilityId);
      say(res.reason, res.ok ? undefined : 'bad');
      if (res.ok) { ctx.onBarChange?.(c.bar, slot); draw(); }
    }

    function draw() {
      const c = character();
      const bar = barOf(c);
      for (let i = 0; i < BAR_SLOTS; i++) {
        const id = bar[i];
        const a = id ? ABILITIES_BY_ID[id] : null;
        slots[i].textContent = '';
        const label = h('span', null, a ? a.name : '');
        slots[i].appendChild(label);
        slots[i].appendChild(h('span', 'bw-k', keyFor(c, i)));
        slots[i].style.borderColor = a ? '#7fb069' : 'rgba(255,255,255,.16)';
      }

      const learned = unlockedFor(c.skills || {}, c.stats || {}, ABILITIES);
      listEl.textContent = '';
      if (!learned.length) {
        listEl.appendChild(h('div', 'bw-dim', 'nothing yet. Every ability comes from a skill, so raise one and it will appear here.'));
        return;
      }
      for (const group of GROUPS) {
        const mine = learned.filter((a) => a.group === group);
        if (!mine.length) continue;
        listEl.appendChild(h('h3', null, group));
        for (const a of mine) {
          const row = h('div', `bw-abil${a.passive ? ' passive' : ''}${bar.includes(a.id) ? ' on' : ''}`);
          row.appendChild(h('div', 'bw-abil-name', a.name));
          row.appendChild(h('div', 'bw-abil-line', a.description));
          listEl.appendChild(row);
          attachTip(row, () => ({ lines: abilityLines(a, c) }));
          if (!a.passive) {
            dragSource(row, () => ({ ability: a.id }));
            row.addEventListener('click', () => {
              picked = a.id;
              say(`${a.name} in hand. Click a slot to put it there.`);
            });
          } else {
            row.addEventListener('click', () => say(`${a.name} is passive and already working`));
          }
        }
      }
    }

    draw();
    this._draw = draw;
  },

  open() { if (this._draw) this._draw(); },
  close() { hideTip(); },

  tick(dt) {
    this._since = (this._since || 0) + (dt || 0);
    if (this._since < 0.5) return;
    this._since = 0;
    if (this._draw) this._draw();
  },
};

export default panel;
