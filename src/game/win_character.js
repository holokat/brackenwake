// The character page of the codex: who you are, what you are wearing, what is
// in your pack, and what all of it adds up to. Keys C and B.
//
// It used to be two pages. Swapping a sword meant opening the pack, double
// clicking, closing the pack and opening the sheet to find out whether that
// was an improvement, which is four acts for one decision. There is one page
// now, in three columns, after the reference sheet:
//
//   left    the name in a serif, a title taken from the skill you are best at,
//           a line of your own, then ATTRIBUTES, COMBAT STATS and RESISTANCES
//           as icon rows, and a parchment note written out of those numbers
//   centre  an arched frame with the LIVE rig standing in it, wearing exactly
//           what is equipped, with seven slots down each side of the arch
//   right   the pack: the filter row, the grid of gilded squares, and the
//           purse and the load underneath it
//
// THE HOVER IS THE POINT. Put the cursor on anything in the pack or on the
// doll and three things happen at once: the item's own tooltip, a second card
// beside it holding what you are already wearing in that slot, and every
// number in the sheet that would move turns green or red AT ITS NEW VALUE with
// the difference after it. Take the cursor away and the numbers go plain
// again; put the thing on and they stay at the new value, plain, because they
// are the truth now.
//
// None of that arithmetic is here. `compare.js` does it by cloning the
// document, equipping through inventory.js's own `equip`, and running
// actor.js's own `recompute`, so the preview cannot promise a number the game
// would not give. This file only paints what it is handed.
//
// The doll has fourteen cells because the game has fourteen slots, and
// auditDoll() counts them at load rather than trusting the layout.
//
// There is no level anywhere, because the game has none.

import { SLOTS, baseFor } from '../mmo/items.js';
import { STATS } from '../mmo/stats.js';
import { SKILLS, SKILL_BY_ID } from '../mmo/skills.js';
import {
  itemTipLines, colourOf, labelOf, weightOfCharacter, RESIST_TYPES,
} from './inventory.js';
import {
  previewEquip, equippedCard, readNumbers, actorFor, formatValue, deltaText,
  RESIST_ID,
} from './compare.js';
import { attachTip, dropTarget, dragSource, hideTip } from './windows.js';
import { theme, icon, itemGlyph, archUrl, parchmentUrl, STAT_ICONS, STAT_WORDS } from './ui_theme.js';
import { createPaperdoll } from './paperdoll.js';
import { buildBag } from './win_bag.js';

/**
 * Which side of the arch each slot hangs on, top to bottom. Worn from the head
 * down on the left, the lower body and everything held on the right.
 */
export const DOLL = {
  left: ['head', 'neck', 'back', 'chest', 'wrists', 'hands', 'waist'],
  right: ['legs', 'feet', 'ring1', 'ring2', 'mainHand', 'offHand'],   // bows are main hand weapons; the old `ranged` cell is gone
};

/** What the label under an empty cell says. */
export const SLOT_LABELS = {
  head: 'head', neck: 'neck', chest: 'chest', back: 'cloak', hands: 'hands',
  wrists: 'wrists', waist: 'waist', legs: 'legs', feet: 'feet',
  ring1: 'ring', ring2: 'ring', mainHand: 'main', offHand: 'off', ranged: 'bow',
};

/** The longer word the tooltip's second card uses: "on your first ring hand". */
export const SLOT_WORDS = {
  head: 'on your head', neck: 'around your neck', chest: 'on your chest',
  back: 'over your shoulders', hands: 'on your hands', wrists: 'on your wrists',
  waist: 'at your waist', legs: 'on your legs', feet: 'on your feet',
  ring1: 'on your first ring hand', ring2: 'on your second ring hand',
  mainHand: 'in your main hand', offHand: 'in your off hand', ranged: 'slung on your back',
};

export const STAT_LABELS = { str: 'STR', dex: 'DEX', int: 'INT', con: 'CON', wis: 'WIS' };

/** The mark each resistance wears, and the word for it. */
export const RESIST_ICONS = { physical: 'shield', fire: 'flame', cold: 'snow', poison: 'drop', energy: 'bolt' };

/** How long the pack stays lit when B was the key that opened the page. */
export const FOCUS_SECONDS = 1.6;

/** How high a skill has to stand before it names you. */
export const TITLE_AT = 30;

/**
 * The word a skill makes of a person. Every one of the fifty two has one, and
 * auditTitles() proves it, so a fifty third skill fails here rather than
 * leaving somebody with no title and no explanation.
 */
export const TITLES = {
  swordsmanship: 'Swordsman', macefighting: 'Hammerhand', fencing: 'Duellist',
  wrestling: 'Brawler', polearms: 'Pikeman', tactics: 'Tactician',
  anatomy: 'Anatomist', parrying: 'Shieldbearer',
  archery: 'Archer', marksmanship: 'Marksman', tracking: 'Tracker',
  magery: 'Mage', evaluatingIntelligence: 'Scholar', meditation: 'Adept',
  resistingSpells: 'Warded', necromancy: 'Necromancer', spiritSpeak: 'Spirit Speaker',
  chivalry: 'Knight', mysticism: 'Mystic', inscription: 'Scribe',
  healing: 'Healer', veterinary: 'Beast Healer', poisoning: 'Poisoner',
  musicianship: 'Musician', provocation: 'Provoker', peacemaking: 'Peacemaker',
  discordance: 'Discordant',
  mining: 'Miner', lumberjacking: 'Woodcutter', foraging: 'Forager',
  fishing: 'Fisher', skinning: 'Skinner',
  blacksmithing: 'Smith', tailoring: 'Tailor', carpentry: 'Carpenter',
  tinkering: 'Tinker', alchemy: 'Alchemist', cooking: 'Cook',
  fletching: 'Fletcher', masonry: 'Mason',
  stealth: 'Prowler', hiding: 'Lurker', lockpicking: 'Picklock',
  detectHidden: 'Watcher', stealing: 'Thief', removeTrap: 'Trapbreaker',
  animalTaming: 'Tamer', animalLore: 'Beastfriend', herding: 'Herder',
  camping: 'Wayfarer', swimming: 'Swimmer', focus: 'Steadfast',
};

/** A line of the character's own, by the opening they took. */
export const QUOTES = {
  warrior: 'The first blow settles most arguments. I try to make it mine.',
  paladin: 'I keep the oath in the morning so it keeps me at night.',
  ranger: 'Roads are for people in a hurry. I take the ridge.',
  rogue: 'Everything worth having is behind something worth picking.',
  mage: 'Fire is only patient until you learn its name.',
  sorcerer: 'The circles are a ladder. I have climbed two.',
  necromancer: 'The dead are poor company and excellent labour.',
  healer: 'Anyone can open a man. Closing him again is the trick.',
  bard: 'A wolf that is listening is a wolf that is not biting.',
  artisan: 'I would rather make the sword than swing it.',
  blank: 'Nobody wrote anything down about me. I am seeing to that.',
};

export const MOTTOES = {
  warrior: 'Steel answers first', paladin: 'The oath holds', ranger: 'The ridge road',
  rogue: 'Quietly, then gone', mage: 'By the first circle', sorcerer: 'The ladder climbs',
  necromancer: 'The grave is a door', healer: 'Close what is open', bard: 'Play them down',
  artisan: 'Made by hand', blank: 'Unwritten',
};

export const DEFAULT_QUOTE = 'What is behind me is walked. What is ahead is not.';
export const DEFAULT_MOTTO = 'What you carry, you earned';

/**
 * The doll shows every slot, once. Runs at load: a fifteenth slot added to
 * items.js and forgotten here fails here instead of vanishing from the screen.
 */
/** The one slot nothing files under any more: bows went to the main hand, and the save loader empties it. */
export const RETIRED_SLOTS = ['ranged'];
export function auditDoll() {
  const cells = [...DOLL.left, ...DOLL.right];
  const live = SLOTS.filter((s) => !RETIRED_SLOTS.includes(s));
  if (cells.length !== live.length) {
    throw new Error(`auditDoll: the doll has ${cells.length} cells and the game has ${live.length} live slots`);
  }
  if (new Set(cells).size !== cells.length) throw new Error('auditDoll: a slot appears in two cells');
  for (const s of live) if (!cells.includes(s)) throw new Error(`auditDoll: no cell for the ${s} slot`);
  for (const s of RETIRED_SLOTS) if (cells.includes(s)) throw new Error(`auditDoll: the ${s} slot is retired and still has a cell`);
  for (const s of cells) {
    if (!SLOTS.includes(s)) throw new Error(`auditDoll: ${s} is a cell and not a slot`);
    if (!SLOT_LABELS[s]) throw new Error(`auditDoll: the ${s} cell has no label`);
    if (!SLOT_WORDS[s]) throw new Error(`auditDoll: the ${s} cell has no sentence for the tooltip`);
  }
  if (Math.abs(DOLL.left.length - DOLL.right.length) > 1) {
    throw new Error(`auditDoll: ${DOLL.left.length} cells on one side of the arch and ${DOLL.right.length} on the other`);
  }
  return cells.length;
}

/** Every skill names a person, and no title names a skill that is not there. */
export function auditTitles() {
  for (const s of SKILLS) if (!TITLES[s.id]) throw new Error(`auditTitles: ${s.name} makes nobody`);
  for (const id of Object.keys(TITLES)) {
    if (!SKILL_BY_ID.has(id)) throw new Error(`auditTitles: "${id}" is a title for a skill that does not exist`);
  }
  return SKILLS.length;
}

auditDoll();
auditTitles();

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const one = (v) => (Math.round(v * 10) / 10).toFixed(1);

/**
 * The best skill you have, and what it makes of you. Under TITLE_AT nothing is
 * good enough to be a name, so the opening stands instead, and with no opening
 * on record you are a Wanderer rather than a blank.
 */
export function titleOf(character) {
  const skills = character?.skills || {};
  let bestId = null, best = 0;
  for (const s of SKILLS) {
    const v = isNum(skills[s.id]) ? skills[s.id] : 0;
    if (v > best) { best = v; bestId = s.id; }
  }
  if (bestId && best >= TITLE_AT) return { text: TITLES[bestId], from: bestId, at: best };
  const op = character?.opening;
  if (op && typeof op === 'string') {
    return { text: op.charAt(0).toUpperCase() + op.slice(1), from: 'opening', at: best };
  }
  return { text: 'Wanderer', from: null, at: best };
}

export const quoteOf = (character) => QUOTES[character?.opening] || DEFAULT_QUOTE;
export const mottoOf = (character) => MOTTOES[character?.opening] || DEFAULT_MOTTO;

/**
 * The fighter combat_rules wants. The live actor when there is one, so the
 * sheet and the fight read one record; otherwise actor.js builds a real player
 * actor out of a COPY of the document, which fills in stamina, the weapon in
 * hand and every affix sum exactly as the game would. It is compare.js's
 * `actorFor` under the name this file has always used.
 */
export const fighterFor = (character, actor) => actorFor(character, actor);

/**
 * Every number the sheet prints, as data. Node reads this; the DOM only
 * arranges it, which is why the numbers can be tested without a browser.
 *
 * `nums` is compare.js's twenty one, and every value below is taken from it
 * rather than worked out a second way, so the plain sheet and the previewed
 * sheet are the same arithmetic.
 */
export function sheetOf(character, actor) {
  const f = fighterFor(character, actor);
  const n = readNumbers(f, character);
  const weight = weightOfCharacter(character);
  const pack = character?.pack || { slots: 0, items: [] };
  const used = (pack.items || []).filter(Boolean).length;
  const pool = (id, label, cur) => {
    const now = Math.floor(isNum(cur) ? cur : n[id]);
    return { id, label, cur: now, max: n[id], value: `${now} / ${n[id]}` };
  };
  return {
    name: character?.name || 'unnamed',
    title: titleOf(character),
    quote: quoteOf(character),
    motto: mottoOf(character),
    nums: n,
    stats: STATS.map((k) => ({
      id: k, label: STAT_LABELS[k], word: STAT_WORDS[k], mark: STAT_ICONS[k],
      value: n[k],
    })),
    pools: [
      pool('maxHealth', 'health', character?.health),
      pool('maxMana', 'mana', character?.mana),
      pool('maxStamina', 'stamina', character?.stamina),
    ],
    regen: [
      { label: 'health regen', value: `${one(f?.healthRegen || 0)} a second` },
      { label: 'mana regen', value: `${one(f?.manaRegen || 0)} a second` },
      { label: 'stamina regen', value: `${one(f?.staminaRegen || 0)} a second` },
    ],
    ar: n.armour,
    /**
     * Hit chance is a question about two fighters, and a sheet only knows one,
     * so what is printed is the two numbers the roll is actually made of.
     */
    fight: [
      { id: 'attack', label: 'attack', value: n.attack, mark: 'sword' },
      { id: 'defence', label: 'defence', value: n.defence, mark: 'shield' },
      { id: 'dodge', label: 'dodge', value: formatValue('dodge', n.dodge), mark: 'boot' },
      { id: 'parry', label: 'parry', value: formatValue('parry', n.parry), mark: 'shield' },
      { id: 'critChance', label: 'critical chance', value: formatValue('critChance', n.critChance), mark: 'crossed' },
      { id: 'critDamage', label: 'critical damage', value: formatValue('critDamage', n.critDamage), mark: 'crossed' },
    ],
    resists: RESIST_TYPES.map((t) => ({
      id: RESIST_ID[t], label: t, value: n[RESIST_ID[t]], mark: RESIST_ICONS[t],
    })),
    weight, carry: n.carry, over: weight > n.carry,
    gold: isNum(character?.gold) ? character.gold : 0,
    packUsed: used,
    packSlots: pack.slots || 0,
  };
}

/**
 * The note in the corner, written out of what was just counted. Every clause
 * is a number this sheet already has, so the parchment cannot say a thing the
 * numbers do not.
 */
export function noteOf(s) {
  const parts = [];
  parts.push(`${s.name} carries ${s.weight} of ${s.carry} stones`);
  parts.push(s.gold === 1 ? 'and one gold coin' : `and ${s.gold} gold`);
  const line = `${parts.join(' ')}.`;
  const room = s.packSlots - s.packUsed;
  const second = s.over
    ? 'That is over the limit, so you walk where you would rather run.'
    : room <= 0
      ? 'The pack has no room left in it.'
      : room === 1
        ? 'One slot of the pack is still empty.'
        : `${room} slots of the pack are still empty.`;
  return `${line} ${second}`;
}

/** The tooltip a cell shows, or null when the cell is empty. */
export const tipFor = (item) => (item ? { lines: itemTipLines(item), colour: colourOf(item) } : null);

/**
 * The second tooltip card, with the slot said in words. compare.js decides
 * which slots the item would take; this only puts the sentence on them and
 * hangs the refusal or the penalty underneath, so a plate chest you cannot
 * lift says so while you are still looking at it and not after you click.
 */
export function compareCardFor(character, item, hint, preview) {
  const card = equippedCard(character, item, hint);
  if (!card) return null;
  for (const b of card.blocks) b.slotLabel = SLOT_WORDS[b.slot] || b.slot;
  if (preview && preview.reason) card.warn = preview.reason;
  return card;
}

const CSS = `
.bw-sheet {
  display: grid; gap: 16px; align-items: start;
  grid-template-columns: minmax(226px, 280px) auto minmax(300px, 400px);
}
@media (max-width: 1120px) { .bw-sheet { grid-template-columns: 1fr; } }
.bw-sheet .bw-who { margin-bottom: 10px; }
.bw-sheet .bw-quote { border-left: 2px solid ${theme.goldDim}88; padding-left: 10px; }

.bw-doll-wrap { display: grid; grid-template-columns: 54px 300px 54px; gap: 8px; justify-content: center; }
.bw-doll-col { display: flex; flex-direction: column; gap: 6px; padding-top: 96px; }
.bw-arch { position: relative; width: 300px; height: 460px; }
.bw-arch-art { position: absolute; inset: 0; background: ${archUrl()} center / 100% 100% no-repeat; }
.bw-arch-inner { position: absolute; left: 28px; right: 28px; top: 30px; bottom: 30px; overflow: hidden; }
.bw-arch-none {
  position: absolute; inset: auto 0 42% 0; text-align: center;
  font-family: ${theme.fonts.display}; font-size: 11px; letter-spacing: .16em;
  text-transform: uppercase; color: ${theme.goldDim};
}
.bw-doll-motto { margin: 10px auto 0; width: 300px; }

.bw-note {
  margin-top: 12px; padding: 11px 13px; font-style: italic; line-height: 1.5;
  color: ${theme.parchmentDim};
  background: ${parchmentUrl()} center / cover;
  border: 1px solid ${theme.goldDim}66;
}

/* the preview. A number that is about to change is shown AT ITS NEW VALUE,
   green up or red down, with the difference after it. Leaving the hover puts
   the plain number back; equipping makes the new one plain. */
.bw-row .bw-v .bw-vnum { font-family: ${theme.fonts.display}; font-variant-numeric: tabular-nums; }
.bw-vd { font-family: ${theme.fonts.body}; font-size: 12.5px; }
`;

const h = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

function css() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('bw-sheet-css')) return;
  const s = document.createElement('style');
  s.id = 'bw-sheet-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

export const panel = {
  id: 'character',
  title: 'Character',
  key: 'c',

  build(el, ctx) {
    css();
    const character = () => (ctx.character && ctx.character.pack ? ctx.character : ctx.inventory?.character) || {};
    const inv = () => ctx.inventory;
    const say = (t, kind) => (ctx.hud?.log ? ctx.hud.log(t, kind) : ctx.hud?.toast?.(t, kind));

    const root = h('div', 'bw-sheet');
    el.appendChild(root);

    // Every previewable number, by id, to the one or more elements that print
    // it. A list rather than a single element because `carry` is printed in
    // the sheet's own row and again under the pack, and a number that lit up
    // in one place and stayed plain in the other would be worse than not
    // lighting up at all.
    const nums = new Map();
    const addNum = (id, target) => {
      if (!nums.has(id)) nums.set(id, []);
      nums.get(id).push(target);
    };

    /** One icon, name, value row whose value can be previewed. */
    function numRow(mark, label, id, pre = '', post = '') {
      const d = h('div', 'bw-row');
      const i = h('span');
      i.innerHTML = icon(mark, theme.gold, 15);
      d.appendChild(i);
      d.appendChild(h('span', 'bw-k', label));
      const v = h('span', 'bw-v');
      const preEl = h('span', 'bw-vpre', pre);
      const numEl = h('span', 'bw-vnum');
      numEl.dataset.num = id;
      const postEl = h('span', 'bw-vpost', post);
      const dEl = h('span', 'bw-vd');
      v.appendChild(preEl); v.appendChild(numEl); v.appendChild(postEl); v.appendChild(dEl);
      d.appendChild(v);
      addNum(id, { row: d, pre: preEl, num: numEl, post: postEl, delta: dEl });
      return d;
    }

    // ---- left: who you are, and what you are made of --------------------
    const left = h('div', 'bw-panel');
    const who = h('div', 'bw-who');
    const name = h('div', 'bw-title');
    const sub = h('div', 'bw-subtitle');
    const quote = h('div', 'bw-quote');
    who.appendChild(name); who.appendChild(sub); who.appendChild(quote);
    left.appendChild(who);

    left.appendChild(h('div', 'bw-hdr', 'Attributes'));
    for (const k of STATS) left.appendChild(numRow(STAT_ICONS[k], STAT_WORDS[k], k));

    left.appendChild(h('div', 'bw-hdr', 'Combat stats'));
    const poolRows = [
      { id: 'maxHealth', label: 'health', mark: 'heart' },
      { id: 'maxMana', label: 'mana', mark: 'book' },
      { id: 'maxStamina', label: 'stamina', mark: 'boot' },
    ];
    for (const p of poolRows) left.appendChild(numRow(p.mark, p.label, p.id));
    for (const f of [
      { id: 'armour', label: 'armour', mark: 'helm' },
      { id: 'attack', label: 'attack', mark: 'sword' },
      { id: 'defence', label: 'defence', mark: 'shield' },
      { id: 'dodge', label: 'dodge', mark: 'boot' },
      { id: 'parry', label: 'parry', mark: 'shield' },
      { id: 'critChance', label: 'critical chance', mark: 'crossed' },
      { id: 'critDamage', label: 'critical damage', mark: 'crossed' },
    ]) left.appendChild(numRow(f.mark, f.label, f.id));

    left.appendChild(h('div', 'bw-hdr', 'Resistances'));
    for (const t of RESIST_TYPES) left.appendChild(numRow(RESIST_ICONS[t], `${t} resist`, RESIST_ID[t]));

    const note = h('div', 'bw-note');
    left.appendChild(note);
    root.appendChild(left);

    // ---- centre: the arch, the rig, and the fourteen slots ---------------
    const mid = h('div');
    const wrap = h('div', 'bw-doll-wrap');
    const colL = h('div', 'bw-doll-col');
    const arch = h('div', 'bw-arch');
    const colR = h('div', 'bw-doll-col');
    wrap.appendChild(colL); wrap.appendChild(arch); wrap.appendChild(colR);
    mid.appendChild(wrap);
    const motto = h('div', 'bw-motto bw-doll-motto');
    mid.appendChild(motto);
    root.appendChild(mid);

    arch.appendChild(h('div', 'bw-arch-art'));
    const inner = h('div', 'bw-arch-inner');
    arch.appendChild(inner);

    // The doll is the live rig. Without a scene or a player it says so once
    // rather than leaving a black rectangle nobody can explain.
    let doll = null;
    let ownDoll = false;
    if (ctx.paperdoll) doll = ctx.paperdoll;
    else if (ctx.sc && ctx.player) {
      try {
        doll = createPaperdoll(ctx.sc, () => ctx.player, { width: 244, height: 400 });
        ownDoll = true;
      } catch (e) { console.error('[character] the doll would not build', e); doll = null; }
    }
    if (doll && doll.canvas) inner.appendChild(doll.canvas);
    else inner.appendChild(h('div', 'bw-arch-none', 'no likeness to draw'));
    this._doll = doll;
    // main.js runs `ctx.paperdoll.update(dt)` every frame for the HUD portrait,
    // which shares this canvas. Driving it a second time from here would turn
    // the figure at twice the speed it was written for, so the page only winds
    // the clock on a doll it built itself.
    this._ownDoll = ownDoll;

    // ---- right: the pack -------------------------------------------------
    const right = h('div', 'bw-panel');
    right.appendChild(h('div', 'bw-hdr', 'The pack'));
    root.appendChild(right);

    // ---- the preview -----------------------------------------------------
    // `preview` is the whole of the hover state. draw() writes the plain
    // numbers into `plain` and then paint() decides, per number, whether to
    // show the plain one or the previewed one. That order is what lets the
    // quarter second redraw run underneath a hover without wiping it.
    let preview = null;
    let plain = null;
    // The card is worked out ONCE, when the cursor arrives, and kept. The
    // tooltip's getter runs on every pointermove, and cloning the document to
    // decide which slot a ring goes in sixty times a second for an answer that
    // cannot have changed is work nobody asked for.
    let hoverItem = null;
    let hoverCard = null;

    function paint() {
      if (!plain) return;
      const d = preview && preview.ok ? preview.deltas : null;
      for (const [id, targets] of nums) {
        const dd = d ? d[id] : null;
        const lit = !!(dd && dd.changed);
        for (const t of targets) {
          t.num.textContent = formatValue(id, lit ? dd.after : plain[id]);
          t.num.className = `bw-vnum${lit ? (dd.better ? ' bw-up' : ' bw-down') : ''}`;
          t.delta.textContent = lit ? ` ${deltaText(id, dd.delta)}` : '';
          t.delta.className = `bw-vd${lit ? (dd.better ? ' bw-up' : ' bw-down') : ''}`;
        }
      }
    }

    function setHover(item, hint) {
      hoverItem = item || null;
      hoverCard = null;
      if (!item) { if (preview) { preview = null; paint(); } return; }
      try {
        preview = previewEquip(character(), ctx.actor, item, hint || null);
      } catch (e) {
        console.error('[character] the preview threw', e);
        preview = null;
      }
      try { hoverCard = compareCardFor(character(), item, hint || null, preview); }
      catch (e) { console.error('[character] the equipped card threw', e); hoverCard = null; }
      paint();
    }

    const clearHover = () => {
      hoverItem = null;
      hoverCard = null;
      if (preview) { preview = null; paint(); }
    };

    const compareFor = (item, hint) => {
      if (item && item === hoverItem) return hoverCard;
      try { return compareCardFor(character(), item, hint || null, null); }
      catch (e) { console.error('[character] the equipped card threw', e); return null; }
    };

    // ---- the pack, built into the right hand column ----------------------
    const bag = buildBag(right, ctx, {
      compareFor: (item) => compareFor(item, null),
      onHover: (item) => setHover(item, null),
      onLeave: () => clearHover(),
      onChange: () => { clearHover(); draw(); },
    });
    this._bag = bag;
    // The pack's carry limit is the same number the sheet prints, so it lights
    // up with it rather than sitting plain beside a green one.
    if (bag.carryNum && bag.carryDelta) addNum('carry', { num: bag.carryNum, delta: bag.carryDelta });

    // ---- the slots -------------------------------------------------------
    const cells = new Map();
    const addCell = (col, slot) => {
      const cell = h('div', 'bw-slot');
      cell.dataset.slot = slot;
      col.appendChild(cell);
      cells.set(slot, cell);
      attachTip(cell, () => {
        const item = character().equipment?.[slot];
        if (!item) return null;
        return { lines: itemTipLines(item), colour: colourOf(item), compare: compareFor(item, slot) };
      }, {
        onEnter: () => setHover(character().equipment?.[slot] || null, slot),
        onLeave: () => clearHover(),
      });
      dragSource(cell, () => (character().equipment?.[slot] ? { slot } : null));
      dropTarget(cell, (from) => {
        const i = inv();
        if (!i) { say('there is nothing here to move things with', 'bad'); return; }
        if (from && from.slot === slot) return;
        const had = i.at(from).item;
        const r = i.move(from, { slot });
        // inventory.move speaks for equip, for unequip and for the ring swap.
        // Anything it considered unremarkable is spoken for here, because a
        // silent drag is indistinguishable from one that failed.
        if (r && r.ok && !r.text && had) say(`${labelOf(had).toLowerCase()} goes ${SLOT_WORDS[slot] || `on your ${slot}`}`);
        clearHover();
        hideTip();
        draw();
      });
      // A click takes it off, which is the fastest thing a player wants here.
      cell.addEventListener('click', () => {
        if (!character().equipment?.[slot]) return;
        inv()?.unequip(slot);
        clearHover();
        hideTip();
        draw();
      });
    };
    for (const slot of DOLL.left) addCell(colL, slot);
    for (const slot of DOLL.right) addCell(colR, slot);

    function drawCells(c) {
      for (const [slot, cell] of cells) {
        const item = c.equipment?.[slot] || null;
        cell.textContent = '';
        cell.classList.toggle('bw-empty', !item);
        if (!item) {
          cell.removeAttribute('data-rarity');
          cell.appendChild(h('span', 'bw-tag', SLOT_LABELS[slot]));
          continue;
        }
        cell.dataset.rarity = item.rarity || 'common';
        const base = baseFor(item);
        if (!item.identified && item.rarity !== 'common') {
          const q = h('span', 'bw-q', '?');
          q.style.color = colourOf(item);
          cell.appendChild(q);
        } else {
          const g = h('span');
          g.innerHTML = itemGlyph(base, 30);
          cell.appendChild(g);
        }
        cell.appendChild(h('span', 'bw-tag', SLOT_LABELS[slot]));
        cell.title = labelOf(item);
      }
    }

    function draw() {
      const c = character();
      const s = sheetOf(c, ctx.actor);

      name.textContent = s.name;
      sub.textContent = s.title.text;
      quote.textContent = s.quote;
      motto.textContent = s.motto;

      plain = s.nums;
      // The three pools print what is left in front of the maximum, and only
      // the maximum can be previewed.
      for (const p of s.pools) {
        for (const t of (nums.get(p.id) || [])) t.pre.textContent = `${p.cur} / `;
      }

      note.textContent = noteOf(s);
      drawCells(c);
      // The pack draws BEFORE the paint. It writes the plain carry limit into
      // the line under the grid, and paint() is what turns that number green
      // or red; the other order would put the plain number back every quarter
      // second and make the load line the one place the preview did not show.
      bag.draw();
      paint();
    }

    draw();
    this._draw = draw;
    this._clearHover = clearHover;
    this._setFocus = (on) => bag.setFocus(on);
  },

  /**
   * B and C both land here. B carries `focus: 'bag'`, which lights the pack
   * for a second and a half, so the key that was pressed is answered on the
   * screen rather than looking like it did nothing.
   */
  open(ctx, extra) {
    this._since = 0;
    if (this._clearHover) this._clearHover();
    if (this._draw) this._draw();
    if (this._doll) this._doll.setVisible(true);
    const wanted = extra && typeof extra === 'object' ? extra.focus : null;
    this._focusLeft = (wanted === 'bag' || wanted === 'inventory') ? FOCUS_SECONDS : 0;
    if (this._setFocus) this._setFocus(this._focusLeft > 0);
  },

  close() {
    if (this._doll) this._doll.setVisible(false);
    if (this._clearHover) this._clearHover();
    if (this._bag) this._bag.closeMenu();
    if (this._setFocus) this._setFocus(false);
    this._focusLeft = 0;
    hideTip();
  },

  // The doll turns every frame; the numbers are rebuilt four times a second.
  // Every frame would rebuild fifty nodes sixty times over for a health bar
  // that moves once a second.
  tick(dt) {
    if (this._doll && this._ownDoll) this._doll.update(dt);
    if (this._focusLeft > 0) {
      this._focusLeft -= (dt || 0);
      if (this._focusLeft <= 0) { this._focusLeft = 0; if (this._setFocus) this._setFocus(false); }
    }
    this._since = (this._since || 0) + (dt || 0);
    if (this._since < 0.25) return;
    this._since = 0;
    if (this._draw) this._draw();
  },
};

export default panel;
