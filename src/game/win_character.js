// The character page of the codex: who you are, what you are wearing, and
// what all of it adds up to. Key C.
//
// Three columns, after the reference sheet:
//
//   left    the name in a serif, a title taken from the skill you are best at,
//           a line of your own, then ATTRIBUTES and COMBAT STATS as icon rows
//   centre  an arched frame with the LIVE rig standing in it, wearing exactly
//           what is equipped, with seven slots down each side of the arch
//   right   RESISTANCES, the purse and the load, and a parchment note that is
//           written out of the numbers rather than made up
//
// The doll has fourteen cells because the game has fourteen slots, and
// auditDoll() counts them at load rather than trusting the layout. The
// reference sheet flanks its arch with six and six; this game wears fourteen
// pieces, so it is seven and seven and the audit is what says so.
//
// Every number here is asked of the rules layer. Pools and carry come from
// stats.derived, armour and resists from the same sums actor.js makes, attack,
// defence, dodge, parry and the crits from combat_rules itself. Nothing is
// recomputed a second way, so the sheet and the fight cannot disagree.
//
// There is no level anywhere, because the game has none.

import { SLOTS, baseFor } from '../mmo/items.js';
import { derived, STATS } from '../mmo/stats.js';
import { SKILLS, SKILL_BY_ID } from '../mmo/skills.js';
import {
  attackSkill, defenceSkill, dodgeChance, parryChance, critChance,
  CRIT_BASE_MULT,
} from '../mmo/combat_rules.js';
import { weaponFrom } from './actor.js';
import {
  itemTipLines, colourOf, labelOf, weightOfCharacter, carryOfCharacter,
  armourOfCharacter, resistsOfCharacter, RESIST_TYPES,
} from './inventory.js';
import { attachTip, dropTarget, dragSource } from './windows.js';
import { theme, icon, itemGlyph, archUrl, parchmentUrl, STAT_ICONS, STAT_WORDS } from './ui_theme.js';
import { createPaperdoll } from './paperdoll.js';

/**
 * Which side of the arch each slot hangs on, top to bottom. Worn from the head
 * down on the left, the lower body and everything held on the right.
 */
export const DOLL = {
  left: ['head', 'neck', 'back', 'chest', 'wrists', 'hands', 'waist'],
  right: ['legs', 'feet', 'ring1', 'ring2', 'mainHand', 'offHand', 'ranged'],
};

/** What the label under an empty cell says. */
export const SLOT_LABELS = {
  head: 'head', neck: 'neck', chest: 'chest', back: 'cloak', hands: 'hands',
  wrists: 'wrists', waist: 'waist', legs: 'legs', feet: 'feet',
  ring1: 'ring', ring2: 'ring', mainHand: 'main', offHand: 'off', ranged: 'bow',
};

export const STAT_LABELS = { str: 'STR', dex: 'DEX', int: 'INT', con: 'CON', wis: 'WIS' };

/** The mark each resistance wears, and the word for it. */
export const RESIST_ICONS = { physical: 'shield', fire: 'flame', cold: 'snow', poison: 'drop', energy: 'bolt' };

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
export function auditDoll() {
  const cells = [...DOLL.left, ...DOLL.right];
  if (cells.length !== SLOTS.length) {
    throw new Error(`auditDoll: the doll has ${cells.length} cells and the game has ${SLOTS.length} slots`);
  }
  if (new Set(cells).size !== cells.length) throw new Error('auditDoll: a slot appears in two cells');
  for (const s of SLOTS) if (!cells.includes(s)) throw new Error(`auditDoll: no cell for the ${s} slot`);
  for (const s of cells) {
    if (!SLOTS.includes(s)) throw new Error(`auditDoll: ${s} is a cell and not a slot`);
    if (!SLOT_LABELS[s]) throw new Error(`auditDoll: the ${s} cell has no label`);
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
const pct = (v) => `${Math.round(v * 1000) / 10}%`;

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
 * sheet and the fight read the same record; otherwise a stand in built from
 * the document, with stamina filled in, because combat_rules docks an
 * exhausted fighter twenty points of attack and a document that simply has not
 * recorded its stamina yet is not exhausted.
 */
export function fighterFor(character, actor) {
  if (actor && actor.stats) return actor;
  const stats = character?.stats || {};
  const skills = character?.skills || {};
  const d = derived(stats, skills);
  const eq = character?.equipment || {};
  const weapon = weaponFrom(eq.mainHand) || weaponFrom(eq.ranged) || null;
  const shieldBase = eq.offHand ? baseFor(eq.offHand) : null;
  return {
    stats, skills, bonuses: {},
    weapon,
    shield: shieldBase && shieldBase.kind === 'shield' ? shieldBase : null,
    stamina: isNum(character?.stamina) ? character.stamina : d.maxStamina,
  };
}

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
  const f = fighterFor(character, actor);
  const pack = character?.pack || { slots: 0, items: [] };
  const used = (pack.items || []).filter(Boolean).length;
  return {
    name: character?.name || 'unnamed',
    title: titleOf(character),
    quote: quoteOf(character),
    motto: mottoOf(character),
    stats: STATS.map((k) => ({
      id: k, label: STAT_LABELS[k], word: STAT_WORDS[k], mark: STAT_ICONS[k],
      value: isNum(stats[k]) ? stats[k] : 0,
    })),
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
    /**
     * Hit chance is a question about two fighters, and a sheet only knows one,
     * so what is printed is the two numbers the roll is actually made of.
     */
    fight: [
      { label: 'attack', value: Math.round(attackSkill(f)), mark: 'sword' },
      { label: 'defence', value: Math.round(defenceSkill(f)), mark: 'shield' },
      { label: 'dodge', value: pct(dodgeChance(f)), mark: 'boot' },
      { label: 'parry', value: pct(parryChance(f)), mark: 'shield' },
      { label: 'critical chance', value: pct(critChance(f)), mark: 'crossed' },
      { label: 'critical damage', value: `${CRIT_BASE_MULT + (f.bonuses?.critDamage || 0)}x`, mark: 'crossed' },
    ],
    resists: RESIST_TYPES.map((t) => ({ label: t, value: Math.round(resists[t] || 0), mark: RESIST_ICONS[t] })),
    weight, carry, over: weight > carry,
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

const CSS = `
.bw-sheet { display: grid; grid-template-columns: minmax(240px, 300px) auto minmax(230px, 300px); gap: 18px; align-items: start; }
@media (max-width: 1080px) { .bw-sheet { grid-template-columns: 1fr; } }
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
.bw-purse { display: grid; grid-template-columns: 20px 1fr auto; gap: 9px; align-items: center; padding: 4px 0; }
.bw-purse .bw-v { font-family: ${theme.fonts.display}; font-variant-numeric: tabular-nums; }
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

/** One icon, name, value row. */
function row(mark, label, value, over) {
  const d = h('div', `bw-row${over ? ' bw-over' : ''}`);
  const i = h('span');
  i.innerHTML = icon(mark, theme.gold, 15);
  d.appendChild(i);
  d.appendChild(h('span', 'bw-k', label));
  d.appendChild(h('span', 'bw-v', String(value)));
  return d;
}

export const panel = {
  id: 'character',
  title: 'Character',
  key: 'c',

  build(el, ctx) {
    css();
    const character = () => (ctx.character && ctx.character.pack ? ctx.character : ctx.inventory?.character) || {};
    const inv = () => ctx.inventory;

    const root = h('div', 'bw-sheet');
    el.appendChild(root);

    // ---- left: who you are, and what you are made of --------------------
    const left = h('div', 'bw-panel');
    const who = h('div', 'bw-who');
    const name = h('div', 'bw-title');
    const sub = h('div', 'bw-subtitle');
    const quote = h('div', 'bw-quote');
    who.appendChild(name); who.appendChild(sub); who.appendChild(quote);
    left.appendChild(who);
    const attrs = h('div');
    left.appendChild(h('div', 'bw-hdr', 'Attributes'));
    left.appendChild(attrs);
    left.appendChild(h('div', 'bw-hdr', 'Combat stats'));
    const combat = h('div');
    left.appendChild(combat);
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
    if (ctx.paperdoll) doll = ctx.paperdoll;
    else if (ctx.sc && ctx.player) {
      try {
        doll = createPaperdoll(ctx.sc, () => ctx.player, { width: 244, height: 400 });
      } catch (e) { console.error('[character] the doll would not build', e); doll = null; }
    }
    if (doll && doll.canvas) inner.appendChild(doll.canvas);
    else inner.appendChild(h('div', 'bw-arch-none', 'no likeness to draw'));
    this._doll = doll;

    // ---- right: what stops a blow, and what you are carrying -------------
    const right = h('div', 'bw-panel');
    right.appendChild(h('div', 'bw-hdr', 'Resistances'));
    const resists = h('div');
    right.appendChild(resists);
    right.appendChild(h('div', 'bw-hdr', 'The purse'));
    const purse = h('div');
    right.appendChild(purse);
    const note = h('div', 'bw-note');
    right.appendChild(note);
    root.appendChild(right);

    // ---- the slots -------------------------------------------------------
    const cells = new Map();
    const addCell = (col, slot) => {
      const cell = h('div', 'bw-slot');
      cell.dataset.slot = slot;
      col.appendChild(cell);
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

      attrs.textContent = '';
      for (const st of s.stats) attrs.appendChild(row(st.mark, st.word, st.value));

      combat.textContent = '';
      for (const p of s.pools) combat.appendChild(row(p.label === 'health' ? 'heart' : p.label === 'mana' ? 'book' : 'boot', p.label, p.value));
      combat.appendChild(row('helm', 'armour', s.ar));
      for (const f of s.fight) combat.appendChild(row(f.mark, f.label, f.value));

      resists.textContent = '';
      for (const r of s.resists) resists.appendChild(row(r.mark, `${r.label} resist`, `${r.value}%`));

      purse.textContent = '';
      const money = h('div', 'bw-purse');
      const ci = h('span'); ci.innerHTML = icon('coin', theme.gold, 16);
      money.appendChild(ci);
      money.appendChild(h('span', 'bw-k', 'gold'));
      money.appendChild(h('span', 'bw-v', String(s.gold)));
      purse.appendChild(money);
      purse.appendChild(row('scale', 'carried', `${s.weight} of ${s.carry} stones`, s.over));
      purse.appendChild(row('gem', 'pack', `${s.packUsed} of ${s.packSlots} slots`));

      note.textContent = noteOf(s);
      drawCells(c);
    }

    draw();
    this._draw = draw;
  },

  open() {
    this._since = 0;
    if (this._draw) this._draw();
    if (this._doll) this._doll.setVisible(true);
  },

  close() {
    if (this._doll) this._doll.setVisible(false);
  },

  // The doll turns every frame; the numbers are rebuilt four times a second.
  // Every frame would rebuild fifty nodes sixty times over for a health bar
  // that moves once a second.
  tick(dt) {
    if (this._doll) this._doll.update(dt);
    this._since = (this._since || 0) + (dt || 0);
    if (this._since < 0.25) return;
    this._since = 0;
    if (this._draw) this._draw();
  },
};

export default panel;
