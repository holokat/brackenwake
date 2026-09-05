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
import { BAR_SLOTS, GROUP_COLOUR } from './win_abilities.js';
import { defaultSettings } from './win_settings.js';
import {
  injectTheme, theme, icon, itemGlyph, ruleUrl, cornerUrl, parchmentUrl,
} from './ui_theme.js';

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
  // W7's two foci. Without these two lines the kit resolves them to null, the
  // mage's staff is silently never made, and the shortfall line is the only
  // thing that says so.
  wand: 'wand', staff: 'staff',
  buckler: 'buckler', kiteShield: 'kite', towerShield: 'tower',
  clothRobe: 'cloth_chest',
  arrow: 'arrow', ironIngot: 'iron_ingot', potionMana: 'potion', bandage: 'bandage',
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
    // And the same rule the other way round. inventory.equip now sends a two
    // hander to the pack when something is raised in the off hand, which is
    // right for a player who chooses it and wrong here: the necromancer's kit
    // is a bone staff and a skull, and the skull was quietly taking the staff
    // out of his hands the moment he was made, leaving the only caster in the
    // game who could not cast. The skull stays in the pack and is named among
    // what stayed behind, exactly as the paladin's holy book is.
    const twoHanderUp = slot === 'offHand' && baseFor(character.equipment.mainHand)?.hands === 2;
    const handBusyForBow = drawsBow && slot === 'mainHand';
    if (!slot || character.equipment[slot] || twoHandBusy || twoHanderUp || handBusyForBow) { notWorn.push(it); continue; }
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

// ------------------------------------------------------- the look of a hero

/**
 * Which ability group each opening's spells and strikes come out of, so the
 * card wears the colour the codex already uses for that archetype rather than
 * a second palette invented here.
 *
 * Two are not archetypes at all. The paladin has no group of his own: every
 * chivalry ability in abilities.js is filed under `healer`, so that is the
 * colour honestly owed him. The artisan and Blank take `everyone`, which is
 * the parchment neutral, because neither is an archetype and a red or a blue
 * would be a promise about abilities they do not have.
 */
export const OPENING_GROUP = {
  warrior: 'warrior', paladin: 'healer', ranger: 'ranger', rogue: 'rogue',
  mage: 'mage', sorcerer: 'sorcerer', necromancer: 'necromancer',
  healer: 'healer', bard: 'bard', artisan: 'everyone', blank: 'everyone',
};

/** The colour a card is banded and barred in. win_abilities.js's, never a copy. */
export function openingColour(id) {
  return GROUP_COLOUR[OPENING_GROUP[id]] || theme.parchmentDim;
}

/**
 * One drawing per opening, on the same 24 x 24 field ui_theme.js's GLYPHS use,
 * filled in the class colour rather than stroked, so a card reads as a hero at
 * a glance instead of as a row in a list.
 *
 * These are markup fragments, not whole documents: `emblemSvg` wraps them.
 */
/**
 * The open palm four of these are built on, so the mage's hand and the
 * healer's are the same hand and only what is done to it differs. Four
 * fingers, a thumb, and a palm that ends in a round heel; the fingers stop on
 * the palm's top edge rather than overlapping it, which is what lets the
 * healer punch the wrapping through the whole shape with one fill rule.
 */
const PALM = `M7.6 10.6 a1.1 1.1 0 0 1 2.2 0 V14.2 h-2.2 Z
  M10.4 8.4 a1.1 1.1 0 0 1 2.2 0 V14.2 h-2.2 Z
  M13.2 9 a1.1 1.1 0 0 1 2.2 0 V14.2 h-2.2 Z
  M16 11 a1.1 1.1 0 0 1 2.2 0 V14.2 h-2.2 Z
  M7.6 14.6 L4.4 16.6 L5.7 18.9 L7.6 17.9 Z
  M7.6 14.2 H18.2 V17.4 a5.3 5.3 0 0 1 -10.6 0 Z`;

/**
 * One drawing per opening, on the same 24 x 24 field ui_theme.js's GLYPHS use,
 * filled in the class colour rather than stroked, so a card reads as a hero at
 * a glance instead of as a row in a list.
 *
 * These are markup fragments, not whole documents: `emblemSvg` wraps them.
 */
export const EMBLEMS = {
  // a sword laid over a shield
  warrior: `<path d="M2.2 4.6 L6.8 2.8 L11.4 4.6 v7.1 c0 4.4 -3.1 6.3 -4.6 7.4 -1.5 -1.1 -4.6 -3 -4.6 -7.4 Z"/>
    <g transform="rotate(35 17 12)">
      <path d="M17 1.6 L18.4 4.4 V13.6 H15.6 V4.4 Z"/>
      <path d="M13.2 13.8 H20.8 V15.4 H13.2 Z"/>
      <path d="M16.1 15.4 H17.9 V19.9 H16.1 Z"/>
      <path d="M15.4 19.9 H18.6 V21.4 H15.4 Z"/>
    </g>`,
  // an armoured fist, knuckles up, under a light
  paladin: `<path d="M12 .8 l.9 2.3 2.3 .9 -2.3 .9 -.9 2.3 -.9 -2.3 -2.3 -.9 2.3 -.9 Z"/>
    <path d="M4.8 4 l.6 1.5 1.5 .6 -1.5 .6 -.6 1.5 -.6 -1.5 -1.5 -.6 1.5 -.6 Z"/>
    <path d="M19.4 4.6 l.5 1.3 1.3 .5 -1.3 .5 -.5 1.3 -.5 -1.3 -1.3 -.5 1.3 -.5 Z"/>
    <path d="M6.8 13.4 a1.5 1.5 0 0 1 3 0 a1.5 1.5 0 0 1 3 0 a1.5 1.5 0 0 1 3 0
      a1.5 1.5 0 0 1 3 0 V17.4 a4.3 4.3 0 0 1 -4.3 4.3 H11.1 a4.3 4.3 0 0 1 -4.3 -4.3 Z
      M7.6 16.7 L17.6 16.7 L17.6 17.7 L7.6 17.7 Z" fill-rule="evenodd"/>`,
  // a bow, drawn, with the arrow on the string
  ranger: `<path d="M15.2 2 C8 6.2 8 17.8 15.2 22 L13.2 22 C6 17.8 6 6.2 13.2 2 Z"/>
    <path d="M14.6 2.2 h.9 V21.8 h-.9 Z"/>
    <path d="M11.6 11.3 H20.4 v1.4 H11.6 Z"/>
    <path d="M19.6 9.2 L23.2 12 L19.6 14.8 Z"/>
    <path d="M10.4 9.8 L13.2 12 L10.4 14.2 Z"/>`,
  // two daggers, crossed
  rogue: `<g transform="rotate(-26 12 12)">
      <path d="M8.6 2.4 L10.4 6 V12.6 H6.8 V6 Z"/>
      <path d="M5.4 12.8 H11.8 V14.2 H5.4 Z"/>
      <path d="M7.8 14.2 H9.4 V19 H7.8 Z"/>
      <path d="M7 19 H10.2 V20.6 H7 Z"/>
    </g>
    <g transform="rotate(26 12 12)">
      <path d="M15.4 2.4 L17.2 6 V12.6 H13.6 V6 Z"/>
      <path d="M12.2 12.8 H18.6 V14.2 H12.2 Z"/>
      <path d="M14.6 14.2 H16.2 V19 H14.6 Z"/>
      <path d="M13.8 19 H17 V20.6 H13.8 Z"/>
    </g>`,
  // an open hand under a rune
  mage: `<path d="M12 .6 L15.4 4.4 L12 8.2 L8.6 4.4 Z M12 2.8 L10.4 4.4 L12 6 L13.6 4.4 Z" fill-rule="evenodd"/>
    <path d="${PALM}"/>`,
  // an eye inside a ring
  sorcerer: `<path d="M12 1.6 a10.4 10.4 0 1 0 .1 0 Z m0 2.4 a8 8 0 1 1 -.1 0 Z"/>
    <path d="M6 12 C8.6 8.6 15.4 8.6 18 12 C15.4 15.4 8.6 15.4 6 12 Z M8.2 12 C10.1 9.9 13.9 9.9 15.8 12 C13.9 14.1 10.1 14.1 8.2 12 Z" fill-rule="evenodd"/>
    <path d="M12 10.1 a1.9 1.9 0 1 0 .1 0 Z"/>`,
  // a skull, the same one the pack draws
  necromancer: `<path d="M12 2 a8 8 0 0 1 8 8 v4 l-3 2 v3 H7 v-3 l-3 -2 v-4 a8 8 0 0 1 8 -8 Z
    M9 10 a2 2 0 1 0 .1 0 Z M15 10 a2 2 0 1 0 .1 0 Z
    M12 12.6 L10.6 15.4 L13.4 15.4 Z
    M10.4 16.9 L10.4 18.9 L11.4 18.9 L11.4 16.9 Z
    M12.6 16.9 L12.6 18.9 L13.6 18.9 L13.6 16.9 Z"/>`,
  // the same hand, with the wrapping cut through it
  healer: `<path d="${PALM}
    M8.6 18.4 L17.2 15 L17.2 16.4 L8.6 19.8 Z
    M9.4 20.6 L17.2 17.6 L17.2 19 L10.2 21.7 Z" fill-rule="evenodd"/>`,
  // a lute: a round body with its hole, a neck, and the head bent back
  bard: `<path d="M8.4 11.2 a5.2 5.2 0 1 0 .1 0 Z M6.8 13.4 a1.5 1.5 0 1 1 -.1 0 Z"/>
    <path d="M10.6 13.6 L18.2 4.6 L19.8 5.9 L12.2 14.9 Z"/>
    <path d="M17 1.6 L21.8 5.6 L20 7.8 L15.2 3.8 Z"/>`,
  // a hammer raised over an anvil
  artisan: `<g transform="rotate(-26 11 6)">
      <path d="M6.6 2.2 H15.4 V5.4 H6.6 Z"/>
      <path d="M10.2 5.4 H12.2 V11.4 H10.2 Z"/>
    </g>
    <path d="M2.6 14.8 L5.2 13.4 H20.2 V16.8 h-4 l1.2 2.6 h2 V22 H6.6 v-2.6 h2 l1.2 -2.6 H5.2 Z"/>`,
  // a rune stone with nothing cut into it
  blank: `<path d="M12 1.6 L18.6 5 v14 L12 22.4 L5.4 19 V5 Z M12 4 L7.6 6.3 v11.4 L12 20 l4.4 -2.3 V6.3 Z" fill-rule="evenodd"/>`,
};

/** One opening's emblem as an inline svg string, at `size` px. */
export function emblemSvg(id, size = 26, colour = null) {
  const body = EMBLEMS[id];
  if (!body) return '';
  return `<svg class="bw-cr-e" viewBox="0 0 24 24" width="${size}" height="${size}"
    fill="${colour || openingColour(id)}" stroke="none">${body}</svg>`;
}

/** How far along its range a stat sits, as a percentage of the bar. */
export const STAT_FLOOR = 10;
export const STAT_CEIL = 100;
export function statPct(v) {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : STAT_FLOOR;
  const clamped = Math.max(STAT_FLOOR, Math.min(STAT_CEIL, n));
  return Math.round(((clamped - STAT_FLOOR) / (STAT_CEIL - STAT_FLOOR)) * 100);
}

/** How many kit icons a card shows before it starts counting the rest. */
export const KIT_ICONS_SHOWN = 8;

/**
 * Every opening has a colour, an emblem, and an emblem made of drawings that
 * a browser will actually paint. Runs at import, so a twelfth opening arrives
 * with a blank square here rather than on the first screen a player sees.
 */
export function auditEmblems() {
  const bad = [];
  for (const op of OPENINGS) {
    if (!OPENING_GROUP[op.id]) bad.push(`${op.id} is in no ability group`);
    else if (!GROUP_COLOUR[OPENING_GROUP[op.id]]) bad.push(`${op.id}'s group has no colour`);
    if (!EMBLEMS[op.id]) bad.push(`${op.id} has no emblem`);
    else if (!/<path\b[^>]*\bd="/.test(EMBLEMS[op.id])) bad.push(`${op.id}'s emblem draws nothing`);
  }
  for (const id of Object.keys(EMBLEMS)) {
    if (!OPENINGS_BY_ID[id]) bad.push(`"${id}" has an emblem and is not an opening`);
  }
  if (bad.length) throw new Error(`creation: ${bad.length} openings are not drawn. ${bad[0]}`);
  return OPENINGS.length;
}

auditEmblems();

// ------------------------------------------------------------------- the DOM

const enc = (s) => `url("data:image/svg+xml,${encodeURIComponent(s.replace(/\s+/g, ' ').trim())}")`;

const CARET = enc(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 8" width="12" height="8">
  <path d="M1.4 1.8 L6 6.2 L10.6 1.8" fill="none" stroke="${theme.gold}" stroke-width="1.6"
    stroke-linecap="round" stroke-linejoin="round"/></svg>`);

const CSS = `
#bw-creation, #bw-creation * { box-sizing: border-box; }
#bw-creation {
  position: fixed; inset: 0; z-index: 90; display: flex; align-items: stretch;
  background: linear-gradient(90deg, rgba(6,5,4,.97) 0%, rgba(6,5,4,.93) 50%, rgba(6,5,4,.55) 66%, rgba(6,5,4,0) 78%);
  font-family: ${theme.fonts.body}; font-size: 15px; line-height: 1.4;
  color: ${theme.parchment};
}
#bw-creation[hidden] { display: none; }

/* the sheet: dark parchment, a gold rule down its open edge, corner marks */
#bw-creation .bw-cr-panel {
  position: relative;
  width: min(880px, 52vw); min-width: 520px; max-width: 100vw;
  padding: 24px 30px 34px; overflow-y: auto; overflow-x: hidden;
  display: flex; flex-direction: column;
  /* The sheet is taller than the window and scrolls. Without this every
     section is a flex item the browser is free to squeeze, and the skills box
     with its own max-height was the one that squeezed to nothing at all. */
  background-image:
    ${cornerUrl(theme.gold)}, ${cornerUrl(theme.gold)},
    ${parchmentUrl()},
    linear-gradient(100deg, rgba(0,0,0,.55), rgba(0,0,0,.15));
  background-repeat: no-repeat, no-repeat, repeat, no-repeat;
  background-position: left 8px top 8px, right 8px top 8px, 0 0, 0 0;
  background-size: 18px 18px, 18px 18px, 140px 90px, auto;
  border-right: 1px solid ${theme.goldDim}88;
  box-shadow: 14px 0 44px rgba(0,0,0,.6);
}
#bw-creation .bw-cr-panel > * { flex: 0 0 auto; }
@media (min-width: 1700px) { #bw-creation .bw-cr-panel { width: min(940px, 50vw); } }

#bw-creation .bw-cr-top { margin-bottom: 4px; }
#bw-creation h1 {
  margin: 0; font-family: ${theme.fonts.display}; font-size: 27px; font-weight: 700;
  letter-spacing: .05em; color: ${theme.parchment}; text-shadow: 0 2px 12px rgba(0,0,0,.85);
}
#bw-creation .bw-cr-lede {
  margin: 6px 0 2px; font-style: italic; font-size: 16px; line-height: 1.45;
  color: ${theme.parchmentDim}; border-left: 2px solid ${theme.goldDim}88; padding-left: 11px;
}

/* headers: the codex's small caps in Cinzel over its thin gold rule */
#bw-creation .bw-hdr {
  font-family: ${theme.fonts.display}; font-size: 11.5px; font-weight: 600;
  letter-spacing: .22em; text-transform: uppercase; color: ${theme.gold};
  margin: 20px 0 9px; padding-bottom: 9px;
  background: ${ruleUrl()} bottom center / 100% 9px no-repeat;
}

/* --- the hero cards ------------------------------------------------------ */
#bw-creation .bw-cr-cards {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(248px, 1fr)); gap: 9px;
}
#bw-creation .bw-cr-card {
  position: relative; padding: 10px 11px 11px 15px; cursor: pointer;
  background: linear-gradient(150deg, rgba(30,25,18,.88), rgba(10,9,7,.92));
  border: 1px solid ${theme.goldDim}55;
  transition: border-color .12s ease;
}
#bw-creation .bw-cr-card .bw-cr-band {
  position: absolute; left: 0; top: 0; bottom: 0; width: 4px;
}
#bw-creation .bw-cr-card:hover { border-color: ${theme.gold}; }
#bw-creation .bw-cr-card.on { border-color: ${theme.gold}; box-shadow: inset 3px 0 0 ${theme.gold}; }
#bw-creation .bw-cr-card.on .bw-cr-band { width: 0; }

#bw-creation .bw-cr-head { display: grid; grid-template-columns: 34px 1fr; gap: 9px; align-items: center; }
#bw-creation .bw-cr-emblem {
  width: 34px; height: 34px; display: flex; align-items: center; justify-content: center;
  background: radial-gradient(circle at 50% 38%, rgba(255,255,255,.09), rgba(0,0,0,.5));
  border: 1px solid ${theme.goldDim}77;
}
#bw-creation .bw-cr-name {
  font-family: ${theme.fonts.display}; font-size: 17px; font-weight: 600;
  letter-spacing: .03em; color: ${theme.parchment}; line-height: 1.1;
}
#bw-creation .bw-cr-card.on .bw-cr-name, #bw-creation .bw-cr-card:hover .bw-cr-name { color: ${theme.goldBright}; }
#bw-creation .bw-cr-group {
  font-family: ${theme.fonts.display}; font-size: 9px; letter-spacing: .18em;
  text-transform: uppercase; margin-top: 2px;
}
#bw-creation .bw-cr-blurb {
  margin: 7px 0 8px; font-size: 14px; line-height: 1.32; color: ${theme.parchmentDim};
}

#bw-creation .bw-cr-bars { display: grid; gap: 2px; margin-bottom: 8px; }
#bw-creation .bw-cr-bar { display: grid; grid-template-columns: 26px 1fr 22px; gap: 6px; align-items: center; }
#bw-creation .bw-cr-bk {
  font-family: ${theme.fonts.display}; font-size: 8.5px; letter-spacing: .1em;
  color: ${theme.parchmentFaint};
}
#bw-creation .bw-cr-bt {
  display: block; height: 4px; background: rgba(0,0,0,.55);
  border: 1px solid ${theme.goldDim}44; overflow: hidden;
}
#bw-creation .bw-cr-bf { display: block; height: 100%; }
#bw-creation .bw-cr-bv {
  font-family: ${theme.fonts.display}; font-size: 10px; font-variant-numeric: tabular-nums;
  text-align: right; color: ${theme.parchmentDim};
}

#bw-creation .bw-cr-kitrow {
  display: flex; flex-wrap: wrap; gap: 3px; align-items: center;
  padding-top: 7px; border-top: 1px solid ${theme.goldDim}33;
}
#bw-creation .bw-cr-kit-i {
  width: 26px; height: 26px; display: flex; align-items: center; justify-content: center;
  background: linear-gradient(160deg, rgba(255,255,255,.06), rgba(0,0,0,.42));
  border: 1px solid ${theme.goldDim}55;
}
#bw-creation .bw-cr-kit-i img { display: block; }
#bw-creation .bw-cr-kit-more {
  font-family: ${theme.fonts.display}; font-size: 9.5px; letter-spacing: .1em;
  text-transform: uppercase; color: ${theme.parchmentFaint}; padding-left: 3px;
}

/* --- the kit, spelled out ------------------------------------------------ */
#bw-creation .bw-cr-kit { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 2px 18px; }
#bw-creation .bw-cr-kitline {
  display: grid; grid-template-columns: 26px 1fr; gap: 9px; align-items: center;
  padding: 3px 0; border-bottom: 1px solid rgba(201,164,74,.13); font-size: 14.5px;
}
#bw-creation .bw-cr-kitline .bw-cr-kg { display: flex; align-items: center; justify-content: center; }
#bw-creation .bw-cr-kitline .bw-cr-kn { color: ${theme.parchment}; }
#bw-creation .bw-cr-kitline .bw-cr-kwhy { color: ${theme.parchmentFaint}; font-style: italic; font-size: 13px; }
#bw-creation .bw-cr-kitline.gone { opacity: .55; }
#bw-creation .bw-cr-kitline.gone .bw-cr-kn { color: ${theme.parchmentFaint}; text-decoration: line-through; }

/* --- rows, sliders, steppers, selects ------------------------------------ */
#bw-creation .bw-cr-two { display: grid; grid-template-columns: 1fr 1fr; gap: 0 26px; }
/* The control is capped rather than left on 1fr: at 1920 a 1fr slider for a
   number that runs 10 to 100 was eight hundred pixels long. */
#bw-creation .bw-row {
  display: grid; grid-template-columns: 108px minmax(130px, 330px) 76px; gap: 11px;
  align-items: center; justify-content: start;
  padding: 3px 0; border-bottom: 1px solid rgba(201,164,74,.13); font-size: 14.5px;
}
#bw-creation .bw-row .bw-k { color: ${theme.parchmentDim}; }
#bw-creation .bw-row .bw-v {
  text-align: right; font-family: ${theme.fonts.display}; font-size: 13px; font-weight: 600;
  font-variant-numeric: tabular-nums; color: ${theme.parchment};
}

#bw-creation input[type=range] {
  -webkit-appearance: none; appearance: none; width: 100%; height: 16px;
  background: transparent; cursor: pointer; margin: 0;
}
#bw-creation input[type=range]::-webkit-slider-runnable-track {
  height: 3px; border: 0;
  background: linear-gradient(90deg, ${theme.goldDim}, ${theme.gold});
  box-shadow: inset 0 0 0 1px rgba(0,0,0,.65);
}
#bw-creation input[type=range]::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none; width: 13px; height: 13px; margin-top: -5px;
  border-radius: 50%; border: 1px solid ${theme.goldDim};
  background: radial-gradient(circle at 38% 32%, #fff8e6, ${theme.parchment} 58%, ${theme.parchmentDim});
  box-shadow: 0 1px 3px rgba(0,0,0,.85);
}
#bw-creation input[type=range]::-moz-range-track {
  height: 3px; border: 0;
  background: linear-gradient(90deg, ${theme.goldDim}, ${theme.gold});
}
#bw-creation input[type=range]::-moz-range-thumb {
  width: 12px; height: 12px; border-radius: 50%; border: 1px solid ${theme.goldDim};
  background: radial-gradient(circle at 38% 32%, #fff8e6, ${theme.parchment} 58%, ${theme.parchmentDim});
}

#bw-creation select, #bw-creation input[type=text] {
  font-family: ${theme.fonts.body}; font-size: 14.5px; color: ${theme.parchment};
  padding: 5px 9px; border: 1px solid ${theme.goldDim}66;
  background: linear-gradient(180deg, rgba(255,255,255,.05), rgba(0,0,0,.45));
}
#bw-creation select {
  -webkit-appearance: none; appearance: none; width: 100%; padding-right: 26px; cursor: pointer;
  background-image: ${CARET}, linear-gradient(180deg, rgba(255,255,255,.05), rgba(0,0,0,.45));
  background-repeat: no-repeat, no-repeat;
  background-position: right 8px center, 0 0;
  background-size: 12px 8px, auto;
}
#bw-creation select:focus, #bw-creation input[type=text]:focus { outline: none; border-color: ${theme.gold}; }
#bw-creation select option { background: #100d09; color: ${theme.parchment}; }
#bw-creation input[type=text] { width: 300px; max-width: 100%; letter-spacing: .02em; }

#bw-creation .bw-cr-budget {
  font-family: ${theme.fonts.display}; font-size: 11px; letter-spacing: .1em;
  text-transform: uppercase; color: ${theme.gold}; font-variant-numeric: tabular-nums;
  margin-bottom: 6px;
}
#bw-creation .bw-cr-budget.spent { color: ${theme.parchmentFaint}; }

#bw-creation .bw-cr-skills {
  max-height: 280px; overflow-y: auto; padding: 4px 10px 4px 11px;
  border: 1px solid ${theme.goldDim}44; background: rgba(0,0,0,.25);
}
#bw-creation .bw-cr-skills .bw-cr-grp {
  font-family: ${theme.fonts.display}; font-size: 10px; letter-spacing: .18em;
  text-transform: uppercase; color: ${theme.goldDim}; margin: 11px 0 3px;
  border-bottom: 1px solid ${theme.goldDim}44; padding-bottom: 3px;
}
#bw-creation .bw-cr-skills .bw-cr-grp:first-child { margin-top: 0; }
#bw-creation .bw-step { display: flex; gap: 3px; justify-content: flex-end; }
#bw-creation .bw-step button {
  font-family: ${theme.fonts.display}; font-size: 10px; letter-spacing: .04em;
  width: 26px; padding: 3px 0; cursor: pointer; color: ${theme.parchmentDim};
  border: 1px solid ${theme.goldDim}66;
  background: linear-gradient(180deg, rgba(255,255,255,.05), rgba(0,0,0,.4));
}
#bw-creation .bw-step button:hover:not(:disabled) { color: ${theme.goldBright}; border-color: ${theme.gold}; }
#bw-creation .bw-step button:disabled { opacity: .3; cursor: default; }

/* --- what that comes to -------------------------------------------------- */
#bw-creation .bw-cr-derived { display: grid; grid-template-columns: 1fr 1fr; gap: 0 26px; }
#bw-creation .bw-cr-drow {
  display: grid; grid-template-columns: 18px 1fr auto; gap: 8px; align-items: center;
  padding: 3px 0; border-bottom: 1px solid rgba(201,164,74,.13); font-size: 14.5px;
}
#bw-creation .bw-cr-drow .bw-i { display: block; opacity: .85; }
#bw-creation .bw-cr-drow .bw-cr-dk {
  font-family: ${theme.fonts.display}; font-size: 10.5px; letter-spacing: .13em;
  text-transform: uppercase; color: ${theme.gold};
}
#bw-creation .bw-cr-drow .bw-cr-dv {
  font-family: ${theme.fonts.display}; font-size: 13.5px; font-weight: 600;
  font-variant-numeric: tabular-nums; color: ${theme.parchment};
}

/* --- begin --------------------------------------------------------------- */
#bw-creation .bw-cr-go {
  margin-top: 18px; align-self: flex-start;
  font-family: ${theme.fonts.display}; font-size: 15px; font-weight: 600;
  letter-spacing: .26em; text-transform: uppercase; color: ${theme.goldBright};
  padding: 12px 42px; cursor: pointer;
  border: 1px solid ${theme.gold};
  background: linear-gradient(180deg, rgba(201,164,74,.22), rgba(0,0,0,.55));
  box-shadow: 0 2px 14px rgba(0,0,0,.6), inset 0 1px 0 rgba(255,255,255,.09);
}
#bw-creation .bw-cr-go:hover:not(:disabled) {
  background: linear-gradient(180deg, rgba(201,164,74,.34), rgba(0,0,0,.5));
}
#bw-creation .bw-cr-go:disabled {
  opacity: .42; cursor: default; color: ${theme.parchmentFaint}; border-color: ${theme.goldDim};
}
#bw-creation .bw-cr-err {
  margin-top: 9px; min-height: 19px; font-size: 14.5px; color: ${theme.down};
}
#bw-creation .bw-cr-short { font-size: 13.5px; font-style: italic; color: ${theme.parchmentFaint}; }

#bw-creation ::-webkit-scrollbar { width: 9px; height: 9px; }
#bw-creation ::-webkit-scrollbar-track { background: rgba(0,0,0,.45); }
#bw-creation ::-webkit-scrollbar-thumb { background: linear-gradient(180deg, ${theme.goldDim}, #4a3818); border: 1px solid #000; }
#bw-creation ::-webkit-scrollbar-thumb:hover { background: ${theme.gold}; }
`;

const h = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
/** The same, with a drawing inside it. */
const hs = (tag, cls, svgText) => {
  const e = h(tag, cls);
  e.innerHTML = svgText;
  return e;
};

/**
 * The line under a card's name. Naming the archetype there put WARRIOR under
 * Warrior on five of the eleven cards, which is a line that says nothing, so
 * it says the thing the opening is best at instead: its highest starting
 * skill, read off openings.js rather than typed here. Blank has no skill above
 * zero, and what it has instead is the pool, so that is what its card says.
 */
export function leadSkillLine(op) {
  let bestId = null, best = 0;
  for (const [id, v] of Object.entries(op.skills || {})) {
    if (v > best) { best = v; bestId = id; }
  }
  if (!bestId) return `${op.freeSkillPoints} skill points to place`;
  return `${SKILL_NAMES[bestId] || bestId} ${best}`;
}

/** The mark beside each derived number, from the codex's own icon set. */
const DERIVED_ICON = {
  health: 'heart', mana: 'book', stamina: 'boot',
  carry: 'scale', 'mana regen': 'drop', 'stamina regen': 'bolt',
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
  // The fonts and the shared tokens come from the same sheet the HUD and the
  // codex use, and this is the first screen, so it puts them in itself rather
  // than waiting for a HUD that does not exist yet.
  injectTheme(document);
  if (!document.getElementById('bw-creation-css')) {
    const s = document.createElement('style');
    s.id = 'bw-creation-css';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  const el = h('div');
  el.id = 'bw-creation';
  el.className = 'bw-ui';
  const panel = h('div', 'bw-cr-panel');
  el.appendChild(panel);
  (root || document.body).appendChild(el);

  const top = h('div', 'bw-cr-top');
  top.appendChild(h('h1', null, 'Who walks out of the trees'));
  const blurb = h('div', 'bw-cr-lede');
  top.appendChild(blurb);
  panel.appendChild(top);

  panel.appendChild(h('div', 'bw-hdr', 'Choose your opening'));
  const cards = h('div', 'bw-cr-cards');
  panel.appendChild(cards);

  panel.appendChild(h('div', 'bw-hdr', 'The kit'));
  const kitList = h('div', 'bw-cr-kit');
  panel.appendChild(kitList);

  panel.appendChild(h('div', 'bw-hdr', 'Stats'));
  const statBudget = h('div', 'bw-cr-budget');
  panel.appendChild(statBudget);
  const statRows = h('div');
  panel.appendChild(statRows);

  panel.appendChild(h('div', 'bw-hdr', 'What that comes to'));
  const derivedEl = h('div', 'bw-cr-derived');
  panel.appendChild(derivedEl);

  panel.appendChild(h('div', 'bw-hdr', 'Skills'));
  const skillBudget = h('div', 'bw-cr-budget');
  panel.appendChild(skillBudget);
  const skillScroll = h('div', 'bw-cr-skills');
  panel.appendChild(skillScroll);

  panel.appendChild(h('div', 'bw-hdr', 'Appearance'));
  const lookEl = h('div', 'bw-cr-two');
  panel.appendChild(lookEl);

  panel.appendChild(h('div', 'bw-hdr', 'Name'));
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.maxLength = NAME_MAX;
  nameInput.placeholder = 'a name';
  nameInput.addEventListener('input', () => { state.name = nameInput.value; refresh(); });
  panel.appendChild(nameInput);

  const go = h('button', 'bw-cr-go', 'Begin');
  panel.appendChild(go);
  const err = h('div', 'bw-cr-err');
  panel.appendChild(err);
  const shortfall = h('div', 'bw-cr-short');
  panel.appendChild(shortfall);

  // --- the opening cards
  // Built once. Nothing on a card depends on the points a player then moves,
  // so only the lit border changes when the choice does.
  for (const op of OPENINGS) {
    const colour = openingColour(op.id);
    const card = h('div', 'bw-cr-card');
    card.dataset.opening = op.id;

    const band = h('div', 'bw-cr-band');
    band.style.background = colour;
    card.appendChild(band);

    const head = h('div', 'bw-cr-head');
    const emblem = hs('div', 'bw-cr-emblem', emblemSvg(op.id, 24, colour));
    emblem.dataset.emblem = op.id;
    head.appendChild(emblem);
    const names = h('div');
    names.appendChild(h('div', 'bw-cr-name', op.name));
    const grp = h('div', 'bw-cr-group', leadSkillLine(op));
    grp.style.color = colour;
    names.appendChild(grp);
    head.appendChild(names);
    card.appendChild(head);

    card.appendChild(h('div', 'bw-cr-blurb', op.blurb));

    const bars = h('div', 'bw-cr-bars');
    for (const id of STAT_IDS) {
      const v = op.stats[id];
      const bar = h('div', 'bw-cr-bar');
      bar.dataset.stat = id;
      bar.appendChild(h('span', 'bw-cr-bk', STAT_LABELS[id]));
      const track = h('span', 'bw-cr-bt');
      const fill = h('i', 'bw-cr-bf');
      fill.style.width = `${statPct(v)}%`;
      fill.style.background = colour;
      fill.dataset.pct = String(statPct(v));
      track.appendChild(fill);
      bar.appendChild(track);
      bar.appendChild(h('span', 'bw-cr-bv', String(v)));
      bars.appendChild(bar);
    }
    card.appendChild(bars);

    // What the kit hands over, in pictures. `itemGlyph` prefers the painting
    // and falls back to the drawn glyph, so a base with no painting still
    // shows a thing rather than a hole.
    const kitRow = h('div', 'bw-cr-kitrow');
    const made = kitFor(op, 1).items;
    kitRow.dataset.kit = String(made.length);
    for (const { item } of made.slice(0, KIT_ICONS_SHOWN)) {
      const b = baseFor(item);
      const cell = hs('span', 'bw-cr-kit-i', itemGlyph(b, 22, null, { count: item.count, material: item.material }));
      cell.title = b.name;
      kitRow.appendChild(cell);
    }
    if (made.length > KIT_ICONS_SHOWN) {
      kitRow.appendChild(h('span', 'bw-cr-kit-more', `+${made.length - KIT_ICONS_SHOWN} more`));
    }
    card.appendChild(kitRow);

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
      row.appendChild(h('span', 'bw-k', STAT_NAMES[id]));
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
      skillScroll.appendChild(h('div', 'bw-cr-grp', group));
      for (const sk of SKILLS.filter((s) => s.group === group)) {
        const row = h('div', 'bw-row');
        row.appendChild(h('span', 'bw-k', SKILL_NAMES[sk.id] || sk.name));
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
      row.appendChild(h('span', 'bw-k', label));
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
    hRow.appendChild(h('span', 'bw-k', 'height'));
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
      const line = h('div', 'bw-cr-kitline');
      line.appendChild(hs('span', 'bw-cr-kg', itemGlyph(b, 22, null, { count: item.count, material: item.material })));
      const n = item.count && item.count > 1 ? `${item.count} ` : '';
      const words = h('span');
      words.appendChild(h('span', 'bw-cr-kn', `${n}${b.name.toLowerCase()}`));
      if (STAND_INS[from]) {
        words.appendChild(h('span', 'bw-cr-kwhy',
          ` (the kit says ${from.replace(/([A-Z])/g, ' $1').toLowerCase()}, and ${STAND_INS[from]} is what the tables have)`));
      }
      line.appendChild(words);
      kitList.appendChild(line);
    }
    // What the kit named and the tables cannot make, greyed, with the reason.
    for (const m of missing) {
      const line = h('div', 'bw-cr-kitline gone');
      line.appendChild(hs('span', 'bw-cr-kg', itemGlyph(null, 22, theme.parchmentFaint)));
      const words = h('span');
      words.appendChild(h('span', 'bw-cr-kn', m.replace(/([A-Z])/g, ' $1').toLowerCase()));
      words.appendChild(h('span', 'bw-cr-kwhy', ', which the item tables do not have yet'));
      line.appendChild(words);
      kitList.appendChild(line);
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
      const row = h('div', 'bw-cr-drow');
      row.appendChild(hs('span', null, icon(DERIVED_ICON[label] || 'crossed', theme.gold, 14)));
      row.appendChild(h('span', 'bw-cr-dk', label));
      row.appendChild(h('span', 'bw-cr-dv', String(value)));
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
  // Taking the caret is worth it; taking the caret and dragging the sheet down
  // to the name field, past the eleven cards the player came here to look at,
  // is not. The scroll is put back either way, because preventScroll is not
  // honoured everywhere.
  try { nameInput.focus?.({ preventScroll: true }); } catch { nameInput.focus?.(); }
  panel.scrollTop = 0;

  return {
    el, state,
    plan: () => planCharacter(state),
    pick,
    destroy,
    get rig() { return rig; },
  };
}

export default createCreation;
