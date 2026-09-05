// The Dragon window. Key N.
//
// One page, in the codex's own language: who it is, how old it is, the Bond,
// whether it is hungry, what it eats at this age, the nine gifts of
// 14-KALDERA.md section 3 with the ones it has taken back lit, and a slot to
// feed it out of the pack.
//
// It is a standalone window and not a codex tab because the codex's five tabs
// are a fixed list in `windows.js`, which this agent does not own. Nothing else
// about it differs: the same frame, the same gold rules, the same drag payload
// the pack uses, so a drop here is `inventory.remove` and not a second way of
// naming a slot.
//
// THE NAMING. A dragon with no name opens this window by itself at hatching
// with the name field focused, and nothing else in the game is blocked while it
// stands there. The rule is `dragon.validateDragonName`, which is creation.js's
// own rule with a shorter cap. Once the Boneyard has given it its TRUE name the
// field goes read only, because a true name is not a nickname.
//
// EVERY BUTTON SAYS WHAT IT DID. `dragon.feed` writes its own lines to the log;
// this file adds the line under the slot so the answer is where the cursor is.

import { theme, parchmentUrl } from './ui_theme.js';
import { dropTarget } from './windows.js';
import {
  AGE_LABEL, AGE_LINE, hungerWord, validateDragonName, DRAGON_NAME_MAX,
  HUNGRY_AT, WAKE_BOND,
} from './dragon.js';
import { baseFor } from '../mmo/items.js';

const CSS = `
.bw-dragon { display: grid; gap: 14px; min-width: 380px; max-width: 560px; }
.bw-dragon .bw-dname { display: flex; align-items: baseline; gap: 10px; }
.bw-dragon .bw-dname input {
  flex: 1 1 auto; min-width: 0; background: rgba(0,0,0,.45); color: ${theme.parchment};
  border: 1px solid ${theme.goldDim}88; padding: 6px 9px;
  font-family: ${theme.fonts.display}; font-size: 16px; letter-spacing: .06em;
}
.bw-dragon .bw-dname input:disabled { color: ${theme.goldBright}; border-color: ${theme.goldDim}44; }
.bw-dragon .bw-dage { font-family: ${theme.fonts.body}; font-size: 14.5px; color: ${theme.parchmentDim}; font-style: italic; }
.bw-dragon .bw-derr { color: ${theme.down}; font-size: 13px; min-height: 16px; }

.bw-dragon .bw-label {
  font-family: ${theme.fonts.display}; font-size: 10px; letter-spacing: .18em;
  text-transform: uppercase; color: ${theme.goldDim}; margin-bottom: 5px;
}
.bw-dragon .bw-bond-track {
  position: relative; height: 14px; border: 1px solid ${theme.goldDim}88;
  background: linear-gradient(180deg, rgba(0,0,0,.6), rgba(0,0,0,.35));
}
.bw-dragon .bw-bond-fill {
  position: absolute; inset: 1px auto 1px 1px; width: 0;
  background: linear-gradient(180deg, ${theme.goldBright}, ${theme.gold} 55%, ${theme.goldDim});
}
.bw-dragon .bw-bond-full .bw-bond-fill { box-shadow: 0 0 10px ${theme.goldBright}; }
.bw-dragon .bw-bond-num { font-family: ${theme.fonts.display}; font-variant-numeric: tabular-nums; font-size: 12px; color: ${theme.parchmentDim}; margin-top: 4px; }

.bw-dragon .bw-gifts { display: grid; grid-template-columns: 1fr 1fr; gap: 3px 12px; }
.bw-dragon .bw-gift { font-size: 13.5px; color: ${theme.parchmentFaint}; }
.bw-dragon .bw-gift.on { color: ${theme.goldBright}; }
.bw-dragon .bw-gift .bw-realm { font-family: ${theme.fonts.display}; font-size: 10px; letter-spacing: .12em; text-transform: uppercase; }

.bw-dragon .bw-feed { display: flex; align-items: center; gap: 12px; }
.bw-dragon .bw-feed-slot {
  width: 62px; height: 62px; flex: 0 0 auto; display: flex; align-items: center; justify-content: center;
  text-align: center; font-size: 10px; letter-spacing: .1em; text-transform: uppercase;
  font-family: ${theme.fonts.display}; color: ${theme.goldDim};
  border: 1px solid ${theme.goldDim}88; background: linear-gradient(180deg, rgba(255,255,255,.04), rgba(0,0,0,.45));
}
.bw-dragon .bw-feed-slot.bw-drop-hot { border-color: ${theme.goldBright}; color: ${theme.goldBright}; }
.bw-dragon button.bw-feed-go {
  font-family: ${theme.fonts.display}; font-size: 11px; letter-spacing: .14em; text-transform: uppercase;
  padding: 8px 14px; cursor: pointer; color: ${theme.parchment};
  background: linear-gradient(180deg, rgba(255,255,255,.05), rgba(0,0,0,.4));
  border: 1px solid ${theme.goldDim}88;
}
.bw-dragon button.bw-feed-go:hover { color: ${theme.goldBright}; border-color: ${theme.gold}; }
.bw-dragon .bw-note {
  padding: 10px 12px; font-style: italic; line-height: 1.5; color: ${theme.parchmentDim};
  background: ${parchmentUrl()} center / cover; border: 1px solid ${theme.goldDim}66;
}
`;

const h = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

function css() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('bw-dragon-css')) return;
  const s = document.createElement('style');
  s.id = 'bw-dragon-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

/**
 * The line under the Bond bar. Pure, so the test can read it without a DOM.
 * It says the number, and it says what the number is FOR, which is the thing a
 * bare bar never tells anybody.
 */
export function bondLine(bond, fallen) {
  const n = Math.round(Number.isFinite(bond) ? bond : 0);
  if (fallen) return `${n} of 100. It is down; at ${WAKE_BOND} it gets up.`;
  if (n >= 100) return `${n} of 100. Full: Wyrmsoul will answer.`;
  return `${n} of 100. Wyrmsoul answers at 100.`;
}

/** The hunger sentence, in words rather than a number. */
export function hungerLine(hunger) {
  const w = hungerWord(hunger);
  return hunger > HUNGRY_AT
    ? `${w}, and fighting at half speed until it is fed`
    : w;
}

/** What this age eats, as a sentence, out of the base names items.js gives. */
export function foodLine(foods) {
  const words = foods.map((id) => (baseFor(id)?.name || id.replace(/_/g, ' ')).toLowerCase());
  if (!words.length) return 'nothing at all';
  if (words.length === 1) return words[0];
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

export const panel = {
  id: 'dragon',
  title: 'Dragon',
  key: 'n',

  build(root, ctx) {
    if (typeof document === 'undefined') return;
    css();
    this._ctx = ctx;
    this._root = root;
    root.classList.add('bw-dragon');
    root.textContent = '';

    // ---- the name -------------------------------------------------------
    const nameRow = h('div', 'bw-dname');
    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = DRAGON_NAME_MAX;
    input.placeholder = 'name it';
    input.spellcheck = false;
    const save = h('button', 'bw-feed-go', 'Name');
    nameRow.append(input, save);
    this._name = input;
    this._nameBtn = save;

    const err = h('div', 'bw-derr', '');
    const age = h('div', 'bw-dage', '');
    this._err = err;
    this._age = age;

    const commit = () => {
      const d = this.dragon();
      if (!d) return;
      const v = validateDragonName(input.value);
      if (!v.ok) { err.textContent = v.error; return; }
      err.textContent = '';
      d.rename(v.name);
      this.render();
    };
    save.addEventListener('click', commit);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.stopPropagation(); commit(); } });
    // the window layer reads raw keys; a name being typed must not toggle panels
    input.addEventListener('keyup', (e) => e.stopPropagation());

    // ---- the Bond -------------------------------------------------------
    const bondWrap = h('div');
    bondWrap.append(h('div', 'bw-label', 'Bond'));
    const track = h('div', 'bw-bond-track');
    const fill = h('div', 'bw-bond-fill');
    track.append(fill);
    const bondNum = h('div', 'bw-bond-num', '');
    bondWrap.append(track, bondNum);
    this._track = track; this._fill = fill; this._bondNum = bondNum;

    // ---- hunger and food -------------------------------------------------
    const hungerWrap = h('div');
    hungerWrap.append(h('div', 'bw-label', 'Hunger'));
    const hungerText = h('div', null, '');
    const foodText = h('div', 'bw-dage', '');
    hungerWrap.append(hungerText, foodText);
    this._hunger = hungerText; this._food = foodText;

    // ---- the feed slot ---------------------------------------------------
    const feedWrap = h('div');
    feedWrap.append(h('div', 'bw-label', 'Feed'));
    const feedRow = h('div', 'bw-feed');
    const slot = h('div', 'bw-feed-slot', 'drop food here');
    const go = h('button', 'bw-feed-go', 'Feed');
    const said = h('div', null, '');
    feedRow.append(slot, go, said);
    feedWrap.append(feedRow);
    this._said = said;

    dropTarget(slot, (where) => {
      const d = this.dragon();
      if (!d) return;
      const r = d.feed(where);
      said.textContent = this.lastSaid(r);
      this.render();
    });
    go.addEventListener('click', () => {
      const d = this.dragon();
      if (!d) return;
      const r = d.feed();
      said.textContent = this.lastSaid(r);
      this.render();
    });

    // ---- the gifts -------------------------------------------------------
    const giftWrap = h('div');
    giftWrap.append(h('div', 'bw-label', 'The nine gifts'));
    const gifts = h('div', 'bw-gifts');
    giftWrap.append(gifts);
    this._gifts = gifts;

    const note = h('div', 'bw-note', '');
    this._note = note;

    root.append(nameRow, err, age, bondWrap, hungerWrap, feedWrap, giftWrap, note);
    this.render();
  },

  /** The entity, wherever the boot put it. Null before the system has built it. */
  dragon() {
    return this._ctx?.dragon || null;
  },

  /** The one line the feed slot shows, said in the slot as well as in the log. */
  lastSaid(r) {
    if (!r) return '';
    if (r.ok) {
      const food = (baseFor(r.base)?.name || String(r.base).replace(/_/g, ' ')).toLowerCase();
      return r.gained > 0
        ? `it ate the ${food}. Bond +${r.gained}.`
        : `it ate the ${food}. Fed too recently for the Bond to move.`;
    }
    const why = {
      no_pack: 'there is no pack to feed it out of.',
      not_carried: 'you are not carrying that.',
      nothing_it_eats: 'nothing in your pack is food it will take.',
      empty: 'that slot is empty.',
      wrong_food: 'it will not eat that at this age.',
      fallen: 'it is down, and it will not eat.',
      remove_failed: 'the food would not come out of the pack.',
    };
    return why[r.reason] || 'nothing happened.';
  },

  open(ctx) {
    this._ctx = ctx || this._ctx;
    this.render();
    const d = this.dragon();
    if (d && !d.named && this._name) {
      try { this._name.focus(); this._name.select(); } catch { /* no focus in a headless build */ }
    }
  },

  /** The Bond and the hunger move every frame, so the page is redrawn on a tick. */
  tick(dt, ctx) {
    if (ctx) this._ctx = ctx;
    this._sinceDraw = (this._sinceDraw || 0) + (Number.isFinite(dt) ? dt : 0);
    if (this._sinceDraw < 0.2) return;
    this._sinceDraw = 0;
    this.render();
  },

  render() {
    if (!this._root || typeof document === 'undefined') return;
    const d = this.dragon();
    if (!d) {
      this._age.textContent = 'There is no dragon yet.';
      return;
    }
    const rec = d.record;
    const named = !!rec.name;
    const trueName = !!rec.trueName;

    if (document.activeElement !== this._name) this._name.value = rec.trueName || rec.name || '';
    this._name.disabled = trueName;
    this._nameBtn.disabled = trueName;
    this._nameBtn.textContent = trueName ? 'True name' : named ? 'Rename' : 'Name';

    const who = rec.trueName || rec.name || 'the hatchling';
    this._age.textContent = trueName
      ? `${who}, a ${AGE_LABEL[rec.age]}: ${AGE_LINE[rec.age]}. It knows its true name now.`
      : named
        ? `${who}, a ${AGE_LABEL[rec.age]}: ${AGE_LINE[rec.age]}.`
        : `A ${AGE_LABEL[rec.age]}, ${AGE_LINE[rec.age]}. It has no name yet.`;

    const bond = Math.max(0, Math.min(100, rec.bond));
    this._fill.style.width = `calc(${bond}% - 2px)`;
    this._track.classList.toggle('bw-bond-full', bond >= 100);
    this._bondNum.textContent = bondLine(bond, rec.fallen);

    this._hunger.textContent = hungerLine(rec.hunger);
    this._food.textContent = `At this age it eats ${foodLine(d.foods())}.`;

    this._gifts.textContent = '';
    for (const g of d.gifts()) {
      const row = h('div', `bw-gift${g.held ? ' on' : ''}`);
      row.append(h('span', 'bw-realm', `${g.realm}: `));
      row.append(document.createTextNode(g.held ? g.gift : 'not taken back'));
      this._gifts.append(row);
    }

    this._note.textContent = rec.fallen
      ? `${who} is down. It cannot die, and it cannot be left behind either. Fight where it fell and it will get its feet under it again.`
      : named
        ? `${who} follows you into every dungeon and onto every boat. It cannot be sold, stabled or left behind.`
        : 'It came out of the shell on your arm and it has not been called anything yet. Give it a name, and it will look at you when you say it.';
  },
};

export default panel;
