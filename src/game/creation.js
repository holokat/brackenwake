// Character creation: the eleven openings, the points, the face, the name, and
// the document the whole game is then played out of.
//
// The rules are openings.js's. This file moves points around, asks
// applyCustomisation whether that was allowed, and refuses in its words. It
// invents no budget, no cap and no floor of its own.
//
// TWO HONEST SEAMS, both measured rather than hidden:
//
// 1. The kits in 04-CLASSES-ABILITIES.md name things 03-ITEMS-LOOT.md has no
//    row for. KIT_BASES below maps every kit base to an item base, marks the
//    four that are stand ins, and leaves six as null because no honest
//    substitute exists (a lute is not a rapier). A missing one is shown on the
//    card, greyed, and said out loud when you begin, because a kit that
//    silently hands over five of six items is the jam-and-bread failure again.
//
// 2. `buildCharacter()` takes no appearance. Height scales the rig; build,
//    skin, hair and marks are written to the document and shown nowhere until
//    the Blender rigs land. The card says so rather than implying a model that
//    changes.

import {
  OPENINGS, OPENINGS_BY_ID, STAT_IDS, STAT_LABELS, STAT_NAMES, SKILL_NAMES, SKILL_IDS,
  APPEARANCE, APPEARANCE_DEFAULT, validateAppearance, applyCustomisation,
  CUSTOM_STAT_POINTS, CUSTOM_SKILL_POINTS, BLANK_STAT_POINTS, ITEM_BASES,
} from '../mmo/openings.js';
import { derived, validateSpread } from '../mmo/stats.js';
import { SKILLS, SKILL_GROUPS } from '../mmo/skills.js';
import { BASES, makeItem, baseFor } from '../mmo/items.js';
import { createInventory, PACK_SLOTS } from './inventory.js';
import { BAR_SLOTS } from './win_abilities.js';
import { defaultSettings } from './win_settings.js';

// ---------------------------------------------------------------- the kits

/** openings.js material ids to items.js material ids. */
const MATERIAL_MAP = {
  cloth: 'cloth', leather: 'leather', studdedLeather: 'studded',
  ringmail: 'ring', chainmail: 'chain', platemail: 'plate',
};
const PIECES = ['head', 'chest', 'hands', 'wrists', 'waist', 'legs', 'feet', 'back'];

/**
 * The item base each kit base is preferred to be made from. Any of these that
 * items.js does not have is resolved to FALLBACK below instead, so the pure
 * layer growing a Pickaxe row upgrades this file without an edit and the
 * shortfall list shrinks on its own.
 */
export const PREFERRED = {
  longsword: 'longsword', dagger: 'dagger', rapier: 'rapier', mace: 'mace',
  quarterstaff: 'quarterstaff', shortbow: 'shortbow', axe: 'axe',
  buckler: 'buckler', kiteShield: 'kite', towerShield: 'tower',
  clothRobe: 'cloth_chest',
  arrow: 'arrow', ironIngot: 'ingot', potionMana: 'potion', bandage: 'bandage',
  reagentPouch: 'reagent_pouch',
  pickaxe: 'pickaxe', tongs: 'tongs', smithHammer: 'smith_hammer', lockpick: 'lockpick',
  holyBook: 'holy_book', skull: 'skull', lute: 'lute',
  boneStaff: 'bone_staff', darkRobe: 'dark_robe', leatherApron: 'leather_apron',
};

/**
 * What to make instead when the preferred base does not exist. A fallback is a
 * stand in under another word, not a substitute for a different thing: there is
 * no honest stand in for a lute, so there is no entry for one.
 */
export const FALLBACK = {
  reagentPouch: 'reagent',
  holyBook: 'tome',
  boneStaff: 'quarterstaff',
  darkRobe: 'cloth_chest',
  leatherApron: 'leather_chest',
};

/** What each kit base actually resolves to, and whether that took a stand in. */
export const KIT_BASES = {};
export const STAND_INS = {};
for (const id of Object.keys(ITEM_BASES)) {
  const want = PREFERRED[id];
  if (want && BASES[want]) { KIT_BASES[id] = want; continue; }
  const instead = FALLBACK[id];
  if (instead && BASES[instead]) {
    KIT_BASES[id] = instead;
    STAND_INS[id] = `a ${BASES[instead].name.toLowerCase()}`;
    continue;
  }
  KIT_BASES[id] = null;
}
for (const [from, to] of Object.entries(MATERIAL_MAP)) {
  for (const p of PIECES) {
    const id = `${from}${p[0].toUpperCase()}${p.slice(1)}`;
    KIT_BASES[id] = `${to}_${p}`;
  }
}

/** Kit bases the item tables still cannot make. Counted, not guessed. */
export const MISSING_BASES = Object.keys(KIT_BASES).filter((k) => KIT_BASES[k] == null).sort();

/**
 * Every kit base has a decision recorded, and every decision points at a real
 * item base. Runs at load, so a twelfth opening naming a new thing fails here
 * instead of handing a player an empty hand.
 */
export function auditKits() {
  for (const id of Object.keys(ITEM_BASES)) {
    if (!(id in KIT_BASES)) throw new Error(`auditKits: the kits name "${id}" and creation.js has no mapping for it`);
  }
  for (const [id, to] of Object.entries(KIT_BASES)) {
    if (to == null) continue;
    if (!BASES[to]) throw new Error(`auditKits: "${id}" maps to "${to}", which is not an item base`);
  }
  // A stand in is only a stand in while the real thing is missing.
  for (const id of Object.keys(STAND_INS)) {
    if (PREFERRED[id] && BASES[PREFERRED[id]]) throw new Error(`auditKits: "${id}" is marked a stand in and ${PREFERRED[id]} exists`);
  }
  // Nothing is listed missing that the tables could actually make.
  for (const id of MISSING_BASES) {
    if (PREFERRED[id] && BASES[PREFERRED[id]]) throw new Error(`auditKits: "${id}" is listed missing and ${PREFERRED[id]} exists`);
  }
  for (const o of OPENINGS) {
    const made = o.kit.map((e) => KIT_BASES[e.base]).filter(Boolean);
    if (!made.length) throw new Error(`auditKits: ${o.name} would start with nothing at all`);
  }
  return { mapped: Object.values(KIT_BASES).filter(Boolean).length, standIns: Object.keys(STAND_INS).length, missing: MISSING_BASES.length };
}

auditKits();

/**
 * What an opening actually hands over: the item records that will be made, and
 * the entries nothing can be made for.
 */
export function kitFor(opening, seed = 1) {
  const op = typeof opening === 'string' ? OPENINGS_BY_ID[opening] : opening;
  if (!op) return { items: [], missing: [] };
  const items = [];
  const missing = [];
  let k = 0;
  for (const entry of op.kit) {
    const to = KIT_BASES[entry.base];
    if (!to) { missing.push(entry.base); continue; }
    const b = BASES[to];
    if (b.stack) {
      items.push({ item: makeItem({ base: to, seed: (seed + (k++) * 7919) >>> 0, count: entry.count }), from: entry.base });
    } else {
      for (let n = 0; n < entry.count; n++) {
        items.push({ item: makeItem({ base: to, seed: (seed + (k++) * 7919) >>> 0 }), from: entry.base });
      }
    }
  }
  return { items, missing };
}

// -------------------------------------------------------------- the points

/**
 * Turn "these are the numbers I want" into the moves applyCustomisation
 * checks. Donors are drained in order; when they run dry and a pool is
 * allowed (Blank's skills) the rest is drawn from it.
 */
export function movesFrom(base, target, ids, pool = false) {
  const donors = [];
  const gainers = [];
  for (const id of ids) {
    const d = (target[id] || 0) - (base[id] || 0);
    if (d < 0) donors.push({ id, left: -d });
    else if (d > 0) gainers.push({ id, need: d });
  }
  const moves = [];
  let di = 0;
  for (const g of gainers) {
    let need = g.need;
    while (need > 0 && di < donors.length) {
      const take = Math.min(need, donors[di].left);
      if (take > 0) moves.push({ from: donors[di].id, to: g.id, amount: take });
      donors[di].left -= take;
      need -= take;
      if (donors[di].left === 0) di++;
    }
    if (need > 0) {
      if (!pool) return { moves: null, error: `${need} more points have to come out of something else first` };
      moves.push({ from: 'pool', to: g.id, amount: need });
    }
  }
  const spare = donors.slice(di).reduce((t, d) => t + d.left, 0);
  return { moves, error: null, spare };
}

/** INVENTED. Nothing writes down a name rule, and a nameless save is worse. */
export const NAME_MIN = 2;
export const NAME_MAX = 20;
const NAME_OK = /^[A-Za-z][A-Za-z '-]*$/;

export function validateName(name) {
  const n = String(name == null ? '' : name).trim();
  if (n.length < NAME_MIN) return { ok: false, name: n, error: `a name wants at least ${NAME_MIN} letters` };
  if (n.length > NAME_MAX) return { ok: false, name: n, error: `${NAME_MAX} letters is the most a name can be` };
  if (!NAME_OK.test(n)) return { ok: false, name: n, error: 'letters, spaces, apostrophes and hyphens, and it starts with a letter' };
  return { ok: true, name: n, error: null };
}

/**
 * The settings block a new character is saved with. 07-RUNTIME-CONTRACT.md
 * names the keys and no values, and the settings window owns what each one
 * means, so the defaults are taken from its table rather than written a second
 * time here. Two lists of defaults would drift, and the one that lost would be
 * the one the first save was written from.
 */
export const DEFAULT_SETTINGS = defaultSettings();

/** A number from the name, so two characters called the same thing roll alike. */
function seedFrom(name) {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) { h ^= name.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/**
 * The whole of creation as one pure function: what the player chose in, a
 * character document out, or every complaint at once.
 *
 * Nothing here is a preview. The kit goes in through the same inventory.js the
 * game uses, so a kit that would not fit says so here rather than at the first
 * time the player opens their bag.
 */
export function planCharacter(choice = {}) {
  const errors = [];
  const op = OPENINGS_BY_ID[choice.opening] || null;
  if (!op) return { ok: false, errors: [`${choice.opening ? `"${choice.opening}" is not one of the openings` : 'pick an opening first'}`] };

  const nameCheck = validateName(choice.name);
  if (!nameCheck.ok) errors.push(nameCheck.error);

  const look = validateAppearance({ ...APPEARANCE_DEFAULT, ...(choice.appearance || {}) });
  if (!look.ok) errors.push(look.error);

  const isBlank = op.id === 'blank';
  const wantStats = { ...op.stats, ...(choice.stats || {}) };
  const wantSkills = { ...op.skills, ...(choice.skills || {}) };

  const sm = movesFrom(op.stats, wantStats, STAT_IDS, false);
  if (sm.error) errors.push(`stats: ${sm.error}`);
  const km = movesFrom(op.skills, wantSkills, SKILL_IDS, isBlank);
  if (km.error) errors.push(`skills: ${km.error}`);

  let applied = null;
  if (sm.moves && km.moves) {
    applied = applyCustomisation(op, sm.moves, km.moves);
    if (applied.error) errors.push(applied.error);
  }
  if (errors.length || !applied || applied.error) return { ok: false, errors, opening: op };

  const spread = validateSpread(applied.stats);
  if (!spread.ok) return { ok: false, errors: spread.errors, opening: op };

  const d = derived(applied.stats, applied.skills);
  const seed = seedFrom(nameCheck.name);
  const character = {
    v: 2,
    name: nameCheck.name,
    appearance: look.appearance,
    opening: op.id,
    stats: applied.stats,
    statLocks: {},
    skills: applied.skills,
    skillLocks: {},
    pos: { x: 0, z: 0 },
    health: Math.floor(d.maxHealth),
    mana: Math.floor(d.maxMana),
    stamina: Math.floor(d.maxStamina),
    gold: op.coins,
    pack: { slots: PACK_SLOTS, items: new Array(PACK_SLOTS).fill(null) },
    equipment: {},
    bar: new Array(BAR_SLOTS).fill(null),
    discovered: [],
    deadUntil: [],
    settings: defaultSettings(),
  };

  // The kit goes in through the real pack, so anything that will not fit is
  // known now and said now.
  const notes = [];
  const inv = createInventory({
    character,
    hud: { log: (t) => notes.push(t) },
  });
  const { items, missing } = kitFor(op, seed);
  const refused = [];
  for (const { item } of items) {
    const r = inv.add(item, { quiet: true });
    if (!r.ok) refused.push(item);
  }
  // Wear what can be worn: armour, then the weapon, then the shield, then the
  // oddments. Nothing displaces anything, so a paladin's holy book cannot
  // shoulder his buckler into the pack the moment he is made; a second dagger
  // and a tome that arrive after both hands are full stay in the pack and are
  // named out loud.
  const order = (it) => {
    const b = baseFor(it);
    return b.kind === 'armour' ? 0 : b.kind === 'weapon' ? 1 : b.kind === 'shield' ? 2 : 3;
  };
  const wearable = character.pack.items
    .map((it) => it)
    .filter((it) => it && baseFor(it).slot)
    .sort((a, b) => order(a) - order(b));
  const notWorn = [];
  // A kit with a bow draws the bow: a ranged ability needs the main hand empty
  // (abilities.weaponCheck), so the ranger's dagger rides in the pack and is
  // named among what stayed behind rather than blocking every shot.
  const drawsBow = wearable.some((it) => baseFor(it).slot === 'ranged');
  for (const it of wearable) {
    const i = character.pack.items.indexOf(it);
    if (i < 0) continue;
    const slot = inv.chooseSlot(it, null);
    const twoHandBusy = slot === 'mainHand' && character.equipment.offHand && baseFor(it).hands === 2;
    const handBusyForBow = drawsBow && slot === 'mainHand';
    if (!slot || character.equipment[slot] || twoHandBusy || handBusyForBow) { notWorn.push(it); continue; }
    const r = inv.equip(i, slot);
    if (!r.ok) notWorn.push(it);
  }

  return {
    ok: true,
    character,
    opening: op,
    missing,
    refused,
    notWorn,
    derived: d,
    spent: applied.spent,
    remaining: applied.remaining,
    notes,
  };
}

/** The line that admits what the kit could not hand over. Empty when it could. */
export function shortfallLine(plan) {
  const parts = [];
  if (plan.missing && plan.missing.length) {
    const words = plan.missing.map((m) => m.replace(/([A-Z])/g, ' $1').toLowerCase());
    parts.push(`${words.join(', ')} ${plan.missing.length === 1 ? 'is' : 'are'} not in the item tables yet, so ${plan.missing.length === 1 ? 'it is' : 'they are'} not in your pack`);
  }
  if (plan.refused && plan.refused.length) parts.push(`${plan.refused.length} of the kit would not fit in the pack`);
  if (plan.notWorn && plan.notWorn.length) {
    parts.push(`${plan.notWorn.map((i) => baseFor(i).name.toLowerCase()).join(', ')} stayed in the pack rather than going on`);
  }
  return parts.join('. ');
}

// ------------------------------------------------------------------- the DOM

const CSS = `
#bw-creation, #bw-creation * { box-sizing: border-box; }
#bw-creation {
  position: fixed; inset: 0; z-index: 90; display: flex; align-items: stretch;
  background: linear-gradient(90deg, rgba(8,10,12,.94) 0%, rgba(8,10,12,.86) 46%, rgba(8,10,12,0) 62%);
  font: 13px/1.45 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: #f2ede2; text-shadow: 0 1px 2px rgba(0,0,0,.7);
}
#bw-creation[hidden] { display: none; }
#bw-creation .bw-cr-panel {
  width: min(720px, 60vw); padding: 22px 26px; overflow: auto;
  display: flex; flex-direction: column; gap: 4px;
}
#bw-creation h1 { margin: 0 0 2px; font-size: 22px; font-weight: 600; letter-spacing: .01em; }
#bw-creation h2 { margin: 16px 0 8px; font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: #8fa387; }
#bw-creation p { margin: 0 0 8px; color: #b6bfb0; }
#bw-creation .bw-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 7px; }
#bw-creation .bw-card {
  padding: 8px 10px; border-radius: 7px; cursor: pointer;
  background: rgba(255,255,255,.04); border: 1px solid rgba(255,255,255,.14);
}
#bw-creation .bw-card:hover { background: rgba(255,255,255,.08); }
#bw-creation .bw-card.on { border-color: #ffd479; background: rgba(255,212,121,.10); }
#bw-creation .bw-card b { display: block; font-size: 13.5px; margin-bottom: 2px; }
#bw-creation .bw-card small { color: #95a08f; line-height: 1.35; display: block; }
#bw-creation .bw-row { display: grid; grid-template-columns: 128px 1fr 60px; gap: 10px; align-items: center; padding: 2px 0; }
#bw-creation .bw-row .bw-v { text-align: right; font-variant-numeric: tabular-nums; }
#bw-creation input[type=range] { width: 100%; }
#bw-creation input[type=text], #bw-creation select {
  font: inherit; padding: 5px 8px; border-radius: 6px; color: #eee8dc;
  background: rgba(255,255,255,.06); border: 1px solid rgba(255,255,255,.18);
}
#bw-creation .bw-two { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 22px; }
#bw-creation .bw-budget { color: #ffd479; font-variant-numeric: tabular-nums; }
#bw-creation .bw-budget.spent { color: #95a08f; }
#bw-creation .bw-kit li.gone { color: #7f887d; text-decoration: line-through; }
#bw-creation ul { margin: 0; padding-left: 18px; color: #b6bfb0; }
#bw-creation .bw-err { color: #ff8f7a; min-height: 18px; }
#bw-creation .bw-go {
  margin-top: 14px; font: inherit; font-size: 14px; padding: 9px 16px; border-radius: 7px;
  border: 1px solid #6f8a5f; background: #35492f; color: #eef5e6; cursor: pointer;
}
#bw-creation .bw-go:disabled { opacity: .5; cursor: default; }
#bw-creation .bw-skill-scroll { max-height: 220px; overflow: auto; padding-right: 6px; }
#bw-creation .bw-step { display: flex; gap: 4px; }
#bw-creation .bw-step button {
  font: inherit; width: 24px; padding: 2px 0; border-radius: 5px; cursor: pointer;
  border: 1px solid rgba(255,255,255,.18); background: rgba(255,255,255,.06); color: #eee8dc;
}
#bw-creation .bw-step button:disabled { opacity: .35; cursor: default; }
`;

const h = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

/**
 * The screen. Over a darkened scene with the rig turning, if a scene was
 * handed in; without one it is still a working creation screen, which is what
 * lets it be opened from settings later.
 *
 * @param {HTMLElement} root
 * @param {{ sc?, buildCharacter?, onDone?, THREE? }} deps
 */
export function createCreation(root, deps = {}) {
  const { sc, buildCharacter, onDone } = deps;
  const state = {
    opening: 'warrior',
    stats: { ...OPENINGS_BY_ID.warrior.stats },
    skills: { ...OPENINGS_BY_ID.warrior.skills },
    appearance: { ...APPEARANCE_DEFAULT },
    name: '',
  };

  if (typeof document === 'undefined') {
    return { el: null, state, plan: () => planCharacter(state), destroy() {} };
  }
  if (!document.getElementById('bw-creation-css')) {
    const s = document.createElement('style');
    s.id = 'bw-creation-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  const el = h('div');
  el.id = 'bw-creation';
  const panel = h('div', 'bw-cr-panel');
  el.appendChild(panel);
  (root || document.body).appendChild(el);

  panel.appendChild(h('h1', null, 'Who walks out of the trees'));
  const blurb = h('p');
  panel.appendChild(blurb);

  panel.appendChild(h('h2', null, 'Opening'));
  const cards = h('div', 'bw-cards');
  panel.appendChild(cards);

  panel.appendChild(h('h2', null, 'Kit'));
  const kitList = h('ul', 'bw-kit');
  panel.appendChild(kitList);

  const statsHead = h('h2', null, 'Stats');
  panel.appendChild(statsHead);
  const statBudget = h('div', 'bw-budget');
  panel.appendChild(statBudget);
  const statRows = h('div');
  panel.appendChild(statRows);

  panel.appendChild(h('h2', null, 'What that comes to'));
  const derivedEl = h('div', 'bw-two');
  panel.appendChild(derivedEl);

  panel.appendChild(h('h2', null, 'Skills'));
  const skillBudget = h('div', 'bw-budget');
  panel.appendChild(skillBudget);
  const skillScroll = h('div', 'bw-skill-scroll');
  panel.appendChild(skillScroll);

  panel.appendChild(h('h2', null, 'Appearance'));
  const lookEl = h('div', 'bw-two');
  panel.appendChild(lookEl);

  panel.appendChild(h('h2', null, 'Name'));
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.maxLength = NAME_MAX;
  nameInput.placeholder = 'a name';
  nameInput.addEventListener('input', () => { state.name = nameInput.value; refresh(); });
  panel.appendChild(nameInput);

  const err = h('div', 'bw-err');
  panel.appendChild(err);
  const go = h('button', 'bw-go', 'Begin');
  panel.appendChild(go);
  const shortfall = h('div', 'bw-dim');
  shortfall.style.color = '#95a08f';
  panel.appendChild(shortfall);

  // --- the opening cards
  for (const op of OPENINGS) {
    const card = h('div', 'bw-card');
    card.dataset.opening = op.id;
    card.appendChild(h('b', null, op.name));
    card.appendChild(h('small', null, op.blurb));
    card.addEventListener('click', () => pick(op.id));
    cards.appendChild(card);
  }

  function pick(id) {
    const op = OPENINGS_BY_ID[id];
    if (!op) return;
    state.opening = id;
    state.stats = { ...op.stats };
    state.skills = { ...op.skills };
    build();
    refresh();
  }

  // --- stats and skills, rebuilt when the opening changes because the budgets do
  let statInputs = new Map();
  let skillRows = new Map();

  function build() {
    const op = OPENINGS_BY_ID[state.opening];
    const isBlank = op.id === 'blank';

    statRows.textContent = '';
    statInputs = new Map();
    for (const id of STAT_IDS) {
      const row = h('div', 'bw-row');
      row.appendChild(h('span', null, STAT_NAMES[id]));
      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = '10';
      slider.max = '100';
      slider.step = '1';
      slider.value = String(state.stats[id]);
      slider.addEventListener('input', () => {
        state.stats[id] = Number(slider.value);
        refresh();
      });
      row.appendChild(slider);
      const v = h('span', 'bw-v');
      row.appendChild(v);
      statRows.appendChild(row);
      statInputs.set(id, { slider, v });
    }

    skillScroll.textContent = '';
    skillRows = new Map();
    for (const group of SKILL_GROUPS) {
      skillScroll.appendChild(h('h2', null, group));
      for (const sk of SKILLS.filter((s) => s.group === group)) {
        const row = h('div', 'bw-row');
        row.appendChild(h('span', null, SKILL_NAMES[sk.id] || sk.name));
        // Four buttons rather than a slider: fifty two sliders is a wall, and
        // points move whole, so five and one between them reach any number.
        const step = h('div', 'bw-step');
        const buttons = [-5, -1, 1, 5].map((by) => {
          const b = h('button', null, by > 0 ? `+${by}` : String(by));
          b.addEventListener('click', () => nudge(sk.id, by));
          step.appendChild(b);
          return { by, b };
        });
        row.appendChild(step);
        const v = h('span', 'bw-v');
        row.appendChild(v);
        skillScroll.appendChild(row);
        skillRows.set(sk.id, { v, buttons });
      }
    }
    if (isBlank) skillScroll.scrollTop = 0;

    lookEl.textContent = '';
    const choose = (label, field, list) => {
      const row = h('div', 'bw-row');
      row.appendChild(h('span', null, label));
      const sel = document.createElement('select');
      for (const opt of list) {
        const o = document.createElement('option');
        o.value = opt; o.textContent = opt;
        sel.appendChild(o);
      }
      sel.value = state.appearance[field];
      sel.addEventListener('change', () => { state.appearance[field] = sel.value; refresh(); });
      row.appendChild(sel);
      row.appendChild(h('span'));
      lookEl.appendChild(row);
    };
    choose('build', 'build', APPEARANCE.builds);
    choose('skin', 'skin', APPEARANCE.skins);
    choose('hair', 'hairStyle', APPEARANCE.hairStyles);
    choose('hair colour', 'hairColour', APPEARANCE.hairColours);
    choose('marks', 'mark', APPEARANCE.marks);
    const hRow = h('div', 'bw-row');
    hRow.appendChild(h('span', null, 'height'));
    const hSlider = document.createElement('input');
    hSlider.type = 'range';
    hSlider.min = String(APPEARANCE.height.min);
    hSlider.max = String(APPEARANCE.height.max);
    hSlider.step = String(APPEARANCE.height.step);
    hSlider.value = String(state.appearance.height);
    const hVal = h('span', 'bw-v');
    hSlider.addEventListener('input', () => {
      state.appearance.height = Number(hSlider.value);
      if (rig) rig.group.scale.setScalar(state.appearance.height / 1.8);
      refresh();
    });
    hRow.appendChild(hSlider); hRow.appendChild(hVal);
    lookEl.appendChild(hRow);
    lookEl._height = hVal;
  }

  /** Move a skill, clamped to what the rules would take. */
  function nudge(id, by) {
    const op = OPENINGS_BY_ID[state.opening];
    const cap = op.maxSkillAtStart;
    const now = state.skills[id] || 0;
    const next = Math.max(0, Math.min(cap, now + by));
    if (next === now) return;
    state.skills[id] = next;
    const check = planPoints();
    if (check.error) { state.skills[id] = now; err.textContent = check.error; return; }
    refresh();
  }

  /** Just the points half, so the sliders can be refused before the name is typed. */
  function planPoints() {
    const op = OPENINGS_BY_ID[state.opening];
    const isBlank = op.id === 'blank';
    const sm = movesFrom(op.stats, state.stats, STAT_IDS, false);
    if (sm.error) return { error: `stats: ${sm.error}` };
    const km = movesFrom(op.skills, state.skills, SKILL_IDS, isBlank);
    if (km.error) return { error: `skills: ${km.error}` };
    const applied = applyCustomisation(op, sm.moves, km.moves);
    if (applied.error) return { error: applied.error };
    return { error: null, applied, sm, km };
  }

  function refresh() {
    const op = OPENINGS_BY_ID[state.opening];
    const isBlank = op.id === 'blank';
    blurb.textContent = op.blurb;
    for (const card of cards.children) card.classList.toggle('on', card.dataset.opening === state.opening);

    const { items, missing } = kitFor(op, 1);
    kitList.textContent = '';
    for (const { item, from } of items) {
      const b = baseFor(item);
      const n = item.count && item.count > 1 ? `${item.count} ` : '';
      const li = h('li', null, `${n}${b.name.toLowerCase()}${STAND_INS[from] ? ` (the kit says ${from.replace(/([A-Z])/g, ' $1').toLowerCase()}, and ${STAND_INS[from]} is what the tables have)` : ''}`);
      kitList.appendChild(li);
    }
    for (const m of missing) {
      kitList.appendChild(h('li', 'gone', `${m.replace(/([A-Z])/g, ' $1').toLowerCase()}, which the item tables do not have yet`));
    }

    const points = planPoints();
    const statMoved = points.applied ? points.applied.spent.stat : null;
    const skillMoved = points.applied ? points.applied.spent.skill : null;
    const statCap = isBlank ? BLANK_STAT_POINTS : CUSTOM_STAT_POINTS;
    const skillCap = isBlank ? op.freeSkillPoints : CUSTOM_SKILL_POINTS;
    statBudget.textContent = `${statMoved == null ? '?' : statCap - statMoved} of ${statCap} stat points left to move`;
    statBudget.classList.toggle('spent', statMoved === statCap);
    skillBudget.textContent = isBlank
      ? `${skillMoved == null ? '?' : skillCap - skillMoved} of ${skillCap} skill points left to place, none above ${op.maxSkillAtStart}`
      : `${skillMoved == null ? '?' : skillCap - skillMoved} of ${skillCap} skill points left to move`;
    skillBudget.classList.toggle('spent', skillMoved === skillCap);

    for (const [id, ref] of statInputs) {
      ref.slider.value = String(state.stats[id]);
      ref.v.textContent = `${state.stats[id]} ${STAT_LABELS[id]}`;
    }
    for (const [id, ref] of skillRows) {
      const v = state.skills[id] || 0;
      ref.v.textContent = v.toFixed(1);
      // A button that would go nowhere is dead, and looks it.
      for (const { by, b } of ref.buttons) {
        b.disabled = by < 0 ? v <= 0 : v >= op.maxSkillAtStart;
      }
    }
    if (lookEl._height) lookEl._height.textContent = `${state.appearance.height.toFixed(2)} m`;

    const d = derived(state.stats, state.skills);
    derivedEl.textContent = '';
    const dline = (label, value) => {
      const row = h('div', 'bw-row');
      row.style.gridTemplateColumns = '1fr auto';
      row.appendChild(h('span', 'bw-dim', label));
      row.appendChild(h('b', null, String(value)));
      derivedEl.appendChild(row);
    };
    dline('health', Math.floor(d.maxHealth));
    dline('mana', Math.floor(d.maxMana));
    dline('stamina', Math.floor(d.maxStamina));
    dline('carry', `${Math.round(d.carry)} stones`);
    dline('mana regen', `${d.manaRegen.toFixed(2)} a second`);
    dline('stamina regen', `${d.staminaRegen.toFixed(2)} a second`);

    const plan = planCharacter(state);
    err.textContent = plan.ok ? '' : plan.errors.join('. ');
    go.disabled = !plan.ok;
    shortfall.textContent = plan.ok ? shortfallLine(plan) : '';
  }

  go.addEventListener('click', () => {
    const plan = planCharacter(state);
    if (!plan.ok) { err.textContent = plan.errors.join('. '); return; }
    destroy();
    if (typeof onDone === 'function') onDone(plan.character, plan);
  });

  // --- the rig, turning, over a darkened scene
  let rig = null;
  let raf = 0;
  let stopped = false;
  if (sc && typeof buildCharacter === 'function') {
    try {
      rig = buildCharacter();
      rig.group.position.set(0, 0, 0);
      rig.group.scale.setScalar(state.appearance.height / 1.8);
      sc.scene.add(rig.group);
      sc.camera.position.set(1.4, 1.5, 2.9);
      sc.camera.lookAt(0, 1.0, 0);
      sc.setDay?.(0.28);
      sc.setFog?.(40, 90);
      const spin = () => {
        if (stopped) return;
        rig.group.rotation.y += 0.006;
        try { sc.render(); } catch { /* a lost context is not worth a crash here */ }
        raf = requestAnimationFrame(spin);
      };
      raf = requestAnimationFrame(spin);
    } catch (e) {
      console.warn('[creation] no turning model', e);
      rig = null;
    }
  }

  function destroy() {
    stopped = true;
    if (raf) cancelAnimationFrame(raf);
    if (rig && sc) sc.scene.remove(rig.group);
    el.remove();
  }

  build();
  pick(state.opening);
  nameInput.focus?.();

  return {
    el, state,
    plan: () => planCharacter(state),
    pick,
    destroy,
    get rig() { return rig; },
  };
}

export default createCreation;
