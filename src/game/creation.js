// Character creation: the four openings, the points, the face, the name, and
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
// 2. THE BODY IS ONE CHOICE NOW. The screen offers no gender row, because the
//    character models are still being made and six
//    controls over a body that cannot change any of them is six lies. The other
//    five fields (build, skin, hair, hair colour, marks, height) keep their
//    defaults in openings.js and are still written into every save, so a
//    character made before this loads unchanged and the day the models land the
//    controls come back rather than the records being invented again.
//    `setAppearance` records the chosen appearance. Player drawing owns what
//    that looks like once the world starts.

import {
  OPENINGS, OPENINGS_BY_ID, STAT_IDS, STAT_LABELS, STAT_NAMES, SKILL_NAMES, SKILL_IDS,
  APPEARANCE_DEFAULT, validateAppearance, applyCustomisation,
  CUSTOM_STAT_POINTS, CUSTOM_SKILL_POINTS, ITEM_BASES,
  OPENING_GROUP,
} from '../mmo/openings.js';
import { derived, validateSpread } from '../mmo/stats.js';
import { SKILLS, SKILL_GROUPS } from '../mmo/skills.js';
import { BASES, makeItem, baseFor } from '../mmo/items.js';
import { createInventory, PACK_SLOTS } from './inventory.js';
import { BAR_SLOTS, GROUP_COLOUR } from './win_abilities.js';
import { defaultSettings } from './win_settings.js';
import {
  injectTheme, theme, icon, itemGlyph, ruleUrl, cornerUrl, parchmentUrl,
  ROSTER_FRAME, ROSTER_PANEL_ART, classPortraitUrl, rosterBgUrl, rosterPanelsUrl, installRosterFrameBox,
} from './ui_theme.js';

// ---------------------------------------------------------------- the kits

/** openings.js material ids to items.js material ids. */
const MATERIAL_MAP = {
  cloth: 'cloth', leather: 'leather', studdedLeather: 'studded',
  ringmail: 'ring', chainmail: 'chain', platemail: 'plate',
};

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
  arrow: 'arrow', ironIngot: 'iron_ingot', potionMana: 'potion', bandage: 'bandage',
  reagentPouch: 'reagent_pouch',
  pickaxe: 'pickaxe', tongs: 'tongs', smithHammer: 'smith_hammer', lockpick: 'lockpick',
  holyBook: 'holy_book', skull: 'skull', lute: 'lute',
  boneStaff: 'bone_staff',
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
  KIT_BASES[`${from}Outfit`] = `${to}_outfit`;
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

  const wantStats = { ...op.stats, ...(choice.stats || {}) };
  const wantSkills = { ...op.skills, ...(choice.skills || {}) };

  const sm = movesFrom(op.stats, wantStats, STAT_IDS, false);
  if (sm.error) errors.push(`stats: ${sm.error}`);
  const km = movesFrom(op.skills, wantSkills, SKILL_IDS, false);
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
  // oddments. Nothing displaces anything, so a second dagger that arrives after
  // both hands are full stays in the pack and is named out loud.
  const order = (it) => {
    const b = baseFor(it);
    return b.kind === 'armour' ? 0 : b.kind === 'weapon' ? 1 : b.kind === 'shield' ? 2 : 3;
  };
  const wearable = character.pack.items
    .map((it) => it)
    .filter((it) => it && baseFor(it).slot)
    .sort((a, b) => order(a) - order(b));
  const notWorn = [];
  for (const it of wearable) {
    const i = character.pack.items.indexOf(it);
    if (i < 0) continue;
    const slot = inv.chooseSlot(it, null);
    const twoHandBusy = slot === 'mainHand' && character.equipment.offHand && baseFor(it).hands === 2;
    // And the same rule the other way round. inventory.equip now sends a two
    // hander to the pack when something is raised in the off hand, which is
    // right for a player who chooses it and wrong here: starter kits should not
    // let a later off-hand item quietly put the main weapon away.
    const twoHanderUp = slot === 'offHand' && baseFor(character.equipment.mainHand)?.hands === 2;
    if (!slot || character.equipment[slot] || twoHandBusy || twoHanderUp) { notWorn.push(it); continue; }
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
 * Retired openings take `everyone`, the parchment neutral, because no card
 * should promise abilities the player cannot choose.
 */
export { OPENING_GROUP };

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
 * Wizard spellwork is built from the same open palm as the shared glyph set.
 * Four fingers, a thumb, and a palm that ends in a round heel; the fingers stop
 * on the palm's top edge rather than overlapping it.
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
/** Every kit shows whole, four to a row (asked 2026-09-08); the cap is a guard against a kit nobody wrote. */
export const KIT_ICONS_SHOWN = 16;

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

// ------------------------------------------------- what a class says of itself

/**
 * The land is Brackenwake now (docs/mmo/10-STORY.md and the map), and this is the
 * ONE place the creation screen says the name out loud. The plaque reads it
 * off this constant; nothing else in this file types a title.
 */
export const GAME_TITLE = 'Brackenwake';

/**
 * One line each, in the voice of somebody who took that opening. Short, so it
 * sits on a single line under the art at 360 px, and no two alike.
 */
export const QUOTES = {
  warrior: 'Stand where it is worst. The rest is arithmetic.',
  ranger: 'The wood told me an hour ago. You were not listening.',
  rogue: 'You will remember the door being locked.',
  mage: 'Every fire was a word first.',
};

/**
 * The sentence after the blurb: not what the class is, which the blurb says,
 * but what it is for, which is the thing a player choosing between four of
 * them wants.
 */
export const CLASS_NOTE = {
  warrior: 'The straightest road into the game, and the one that forgives most.',
  ranger: 'For fighting at the range where nothing has reached you yet.',
  rogue: 'For the way in, the way out, and the purse on the way past.',
  mage: 'The most damage in the game, and the least skin to lose it with.',
};

/**
 * The three words under the class name: its three highest stats, in full, as
 * the reference sets them. Read off openings.js, so an opening whose spread is
 * edited says something different here without an edit. Ties fall to STAT_IDS
 * order, which is the order the tables are written in.
 */
export function statWords(opening) {
  const op = typeof opening === 'string' ? OPENINGS_BY_ID[opening] : opening;
  if (!op) return [];
  return STAT_IDS
    .map((id, i) => ({ id, v: op.stats[id], i }))
    .sort((a, b) => (b.v - a.v) || (a.i - b.i))
    .slice(0, 3)
    .map((r) => STAT_NAMES[r.id]);
}

/**
 * The id the art slot wears for a given opening. Stable, one per class, and
 * exported so a painting can be dropped straight in later:
 *
 *   document.getElementById(artId('warrior')).style.backgroundImage = 'url(...)'
 *
 * Until then the frame holds the drawing `artUrl` makes below.
 */
export function artId(id) { return `bw-cr-art-${id}`; }

const enc = (s) => `url("data:image/svg+xml,${encodeURIComponent(s.replace(/\s+/g, ' ').trim())}")`;

/**
 * The placeholder inside the portrait frame, drawn in code rather than fetched:
 * a lit ground in the class colour, two ridges of dark country, and the class
 * emblem large and faint over them. It is a placeholder and looks like one; the
 * point is that the frame is never an empty rectangle while the art is painted.
 */
export function artUrl(id) {
  const c = openingColour(id);
  const body = EMBLEMS[id] || '';
  return enc(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 260" width="300" height="260">
    <defs>
      <linearGradient id="a" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#2a2318"/><stop offset="0.55" stop-color="#15110c"/>
        <stop offset="1" stop-color="#080706"/>
      </linearGradient>
      <radialGradient id="b" cx="0.5" cy="0.34" r="0.62">
        <stop offset="0" stop-color="${c}" stop-opacity="0.34"/>
        <stop offset="1" stop-color="${c}" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="300" height="260" fill="url(#a)"/>
    <rect width="300" height="260" fill="url(#b)"/>
    <g transform="translate(150 116) scale(4.4) translate(-12 -12)" fill="${c}" opacity="0.24">${body}</g>
    <path d="M0 206 L58 170 L104 200 L156 160 L206 194 L262 166 L300 188 L300 260 L0 260 Z" fill="#0b0907" opacity="0.9"/>
    <path d="M0 232 L70 206 L128 230 L188 204 L250 228 L300 210 L300 260 L0 260 Z" fill="#050403"/>
  </svg>`);
}

/**
 * Every opening is written as well as drawn. Runs at import, so a twelfth
 * opening arriving with no quote and no note fails here rather than showing a
 * blank right hand panel on the first screen a player sees. This is the same
 * guard `auditEmblems` is, for the words instead of the lines.
 */
export function auditClassText() {
  const bad = [];
  for (const op of OPENINGS) {
    if (!QUOTES[op.id]) bad.push(`${op.id} has no quote`);
    if (!CLASS_NOTE[op.id]) bad.push(`${op.id} has no note`);
    if (/[\u2014\u2013]/.test(`${QUOTES[op.id] || ''}${CLASS_NOTE[op.id] || ''}`)) bad.push(`${op.id} is written with a dash the house style forbids`);
    if (!statWords(op).length) bad.push(`${op.id} has no stat words`);
  }
  for (const id of Object.keys(QUOTES)) {
    if (!OPENINGS_BY_ID[id]) bad.push(`"${id}" has a quote and is not an opening`);
  }
  if (new Set(Object.values(QUOTES)).size !== Object.keys(QUOTES).length) bad.push('two openings share a quote');
  if (bad.length) throw new Error(`creation: ${bad.length} openings are not written. ${bad[0]}`);
  return OPENINGS.length;
}

auditClassText();

// ------------------------------------------------------------------- the DOM

const CARET = enc(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 8" width="12" height="8">
  <path d="M1.4 1.8 L6 6.2 L10.6 1.8" fill="none" stroke="${theme.gold}" stroke-width="1.6"
    stroke-linecap="round" stroke-linejoin="round"/></svg>`);

const CSS = `
#bw-creation, #bw-creation * { box-sizing: border-box; }
/* The whole viewport: the user's background is behind the contained joined
   panel frame, and the controls live inside that frame's dark interiors. */
#bw-roster, #bw-creation { isolation: isolate; }
#bw-roster > .bw-ro-video, #bw-creation > .bw-ro-video {
  position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;
  z-index: -1; pointer-events: none;
}
#bw-creation {
  position: fixed; inset: 0; z-index: 90;
  font-family: ${theme.fonts.body}; font-size: 15px; line-height: 1.4;
  color: ${theme.parchment};
  background:
    radial-gradient(62% 66% at 50% 46%, rgba(6,5,4,0) 0%, rgba(6,5,4,.28) 58%, rgba(6,5,4,.72) 100%);
}
#bw-creation[hidden] { display: none; }

#bw-creation .bw-cr-panel {
  position: absolute; inset: 0;
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr) 400px;
  grid-template-rows: auto minmax(0, 1fr) auto;
}

/* --- the two side panels ------------------------------------------------- */
#bw-creation .bw-cr-left, #bw-creation .bw-cr-right {
  grid-row: 1 / 3; min-height: 0;
  display: flex; flex-direction: column;
  overflow-y: auto; overflow-x: hidden;
  background-image:
    ${cornerUrl(theme.gold)}, ${cornerUrl(theme.gold)},
    ${parchmentUrl()},
    linear-gradient(180deg, rgba(6,5,4,.93), rgba(6,5,4,.97));
  background-repeat: no-repeat, no-repeat, repeat, no-repeat;
  background-position: left 8px top 8px, right 8px top 8px, 0 0, 0 0;
  background-size: 18px 18px, 18px 18px, 140px 90px, auto;
}
/* The CR1 bug, kept fixed: a column flex box is free to squeeze a child that
   has its own max-height, and the skills list was the one it squeezed to
   nothing at all while every count still passed. */
#bw-creation .bw-cr-left > *, #bw-creation .bw-cr-scroll > * { flex: 0 0 auto; }
#bw-creation .bw-cr-left {
  grid-column: 1; padding: 14px 15px 18px;
  border-right: 1px solid ${theme.goldDim}88;
  box-shadow: 10px 0 34px rgba(0,0,0,.55);
}
#bw-creation .bw-cr-right {
  grid-column: 3; padding: 0; display: block; overflow-y: auto; overflow-x: hidden;
  border-left: 1px solid ${theme.goldDim}88;
  box-shadow: -10px 0 34px rgba(0,0,0,.55);
}
#bw-creation .bw-cr-scroll {
  min-height: 100%; overflow: visible;
  display: flex; flex-direction: column; justify-content: center;
  padding: 14px 17px 12px;
}
/* the name and button follow the spreads inside the same centred column */
#bw-creation .bw-cr-act {
  flex: 0 0 auto; margin-top: 8px; padding: 8px 0 2px;
  border-top: 1px solid ${theme.goldDim}66;
  background: transparent;
}

/* --- the plaque ---------------------------------------------------------- */
#bw-creation .bw-cr-plaque {
  grid-column: 2; grid-row: 1; justify-self: center; align-self: start;
  margin-top: 16px; padding: 11px 44px 13px; text-align: center;
  background-image:
    ${cornerUrl(theme.gold)}, ${cornerUrl(theme.gold)},
    linear-gradient(180deg, #241d15, #100c09 60%, #060504);
  background-repeat: no-repeat, no-repeat, no-repeat;
  background-position: left 4px top 4px, right 4px top 4px, 0 0;
  background-size: 14px 14px, 14px 14px, auto;
  border: 1px solid ${theme.goldDim};
  box-shadow: 0 6px 26px rgba(0,0,0,.7), inset 0 1px 0 rgba(255,255,255,.07);
}
#bw-creation h1 {
  margin: 0; font-family: ${theme.fonts.display}; font-size: 33px; font-weight: 700;
  letter-spacing: .2em; color: #dcc68d;
  text-shadow: 0 1px 0 rgba(0,0,0,.95), 0 -1px 0 rgba(255,255,255,.10), 0 4px 18px rgba(0,0,0,.8);
}
#bw-creation .bw-cr-ask {
  margin-top: 5px; font-style: italic; font-size: 15px; color: ${theme.parchmentDim};
}

/* headers: the codex's small caps in Cinzel over its thin gold rule */
#bw-creation .bw-hdr {
  font-family: ${theme.fonts.display}; font-size: 11px; font-weight: 600;
  letter-spacing: .22em; font-variant-caps: small-caps; color: ${theme.gold};
  margin: 12px 0 7px; padding-bottom: 9px;
  background: ${ruleUrl()} bottom center / 100% 9px no-repeat;
}
#bw-creation .bw-hdr:first-child { margin-top: 2px; }

/* --- the class cards: small, two to a row -------------------------------- */
/* minmax(0, 1fr) and not 1fr: a plain 1fr track will not go below the widest
   unbreakable word in it, and NECROMANCER pushed the right hand column of
   cards clean off a 260 pixel panel at 1280. */
/* one row per opening (asked 2026-09-08): the art slot on the left is the
   size the class paintings will be, the words beside it */
#bw-creation .bw-cr-cards { display: grid; grid-template-columns: minmax(0, 1fr); gap: 6px; }
#bw-creation .bw-cr-card {
  position: relative; min-height: 74px; padding: 8px 10px 8px 13px; cursor: pointer;
  overflow: hidden;
  display: grid; grid-template-columns: 56px minmax(0, 1fr); grid-template-rows: auto auto; column-gap: 12px; row-gap: 3px; align-items: center;
  background:
    ${cornerUrl(theme.goldDim)}, ${cornerUrl(theme.goldDim)},
    linear-gradient(150deg, rgba(36,35,39,.92), rgba(14,13,16,.96));
  background-repeat: no-repeat;
  background-position: left 2px top 2px, right 2px bottom 2px, 0 0;
  background-size: 14px 14px, 14px 14px, auto;
  border: 1px solid ${theme.goldDim}55;
  border-radius: 7px;
  transition: border-color .12s ease, transform .12s ease, box-shadow .12s ease;
}
#bw-creation .bw-cr-card .bw-cr-band { position: absolute; left: 0; top: 0; bottom: 0; width: 3px; }
#bw-creation .bw-cr-card:hover { border-color: ${theme.gold}; }
#bw-creation .bw-cr-card.on {
  border-color: ${theme.gold};
  box-shadow: inset 0 1px 0 rgba(255,255,255,.08), 0 6px 18px rgba(0,0,0,.45), 0 0 18px rgba(201,164,74,.18);
  background:
    ${cornerUrl(theme.gold)}, ${cornerUrl(theme.gold)},
    linear-gradient(180deg, ${theme.plateUp}, ${theme.plate} 62%, #2c0d08);
  background-repeat: no-repeat;
  background-position: left 2px top 2px, right 2px bottom 2px, 0 0;
  background-size: 14px 14px, 14px 14px, auto;
}
#bw-creation .bw-cr-card.on .bw-cr-band { width: 0; }
#bw-creation .bw-cr-emblem {
  grid-row: 1 / span 2;
  width: 56px; height: 56px; display: flex; align-items: center; justify-content: center;
  background: radial-gradient(circle at 50% 38%, rgba(255,255,255,.09), rgba(0,0,0,.5));
  border: 1px solid ${theme.goldDim}77;
  border-radius: 7px;
}
/* 15px fits the longest current opening in a 300 pixel column's card. */
#bw-creation .bw-cr-name {
  font-family: ${theme.fonts.display}; font-size: 15px; font-weight: 600;
  letter-spacing: .02em; color: ${theme.parchment}; line-height: 1.1;
}
#bw-creation .bw-cr-card.on .bw-cr-name, #bw-creation .bw-cr-card:hover .bw-cr-name { color: ${theme.goldBright}; }
/* one line of blurb, and never a third: cards of a ragged height read
   as a list of paragraphs rather than a rack of heroes */
#bw-creation .bw-cr-blurb {
  font-size: 12.5px; line-height: 1.26; color: ${theme.parchmentDim};
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden;
}

/* CR3 kept the old appearance controls out of the document. These legacy
   selectors are inert unless a future screen adds those controls back. */
#bw-creation .bw-cr-look {
  display: flex; justify-content: center; gap: 10px;
  width: 100%; max-width: 540px;
}
#bw-creation .bw-cr-pill {
  min-width: 116px; padding: 7px 16px 8px; cursor: pointer;
  font-family: ${theme.fonts.display}; font-size: 11px; letter-spacing: .2em;
  font-variant-caps: small-caps; color: ${theme.parchmentDim};
  border: 1px solid ${theme.goldDim}66;
  background: linear-gradient(180deg, rgba(20,16,11,.86), rgba(6,5,4,.92));
}
#bw-creation .bw-cr-pill:hover { color: ${theme.goldBright}; border-color: ${theme.gold}; }
#bw-creation .bw-cr-pill.on {
  color: ${theme.goldBright}; border-color: ${theme.gold};
  background: linear-gradient(180deg, rgba(90,68,24,.55), rgba(30,22,10,.9));
  box-shadow: inset 0 0 12px rgba(201,164,74,.28);
}

/* --- the right hand panel ------------------------------------------------ */
#bw-creation .bw-cr-cname {
  font-family: ${theme.fonts.display}; font-size: 29px; font-weight: 700;
  letter-spacing: .05em; line-height: 1.05; color: ${theme.parchment};
  text-shadow: 0 2px 12px rgba(0,0,0,.8);
}
#bw-creation .bw-cr-words {
  margin-top: 4px; font-family: ${theme.fonts.display}; font-size: 10px;
  letter-spacing: .2em; font-variant-caps: small-caps; color: ${theme.gold};
}
/* the frame the class art goes in. Empty of a painting today; never empty of
   a drawing, because a blank rectangle on the first screen says "broken". */
#bw-creation .bw-cr-art {
  position: relative; width: 100%; height: min(196px, 21vh); margin-top: 9px;
  background-position: center; background-size: cover; background-repeat: no-repeat;
  border: 1px solid ${theme.goldDim};
  box-shadow: inset 0 0 0 3px rgba(0,0,0,.6), inset 0 0 34px rgba(0,0,0,.6), 0 3px 16px rgba(0,0,0,.55);
}
#bw-creation .bw-cr-art::after {
  content: ''; position: absolute; inset: 5px; pointer-events: none;
  border: 1px solid ${theme.goldDim}66;
}
#bw-creation .bw-cr-quote {
  margin: 8px 0 0; font-style: italic; font-size: 14.5px; line-height: 1.35;
  color: ${theme.parchmentDim};
  border-left: 2px solid ${theme.goldDim}88; padding-left: 10px;
}
#bw-creation .bw-cr-about { margin-top: 7px; font-size: 14px; line-height: 1.32; color: ${theme.parchmentDim}; }

#bw-creation .bw-cr-budget {
  font-family: ${theme.fonts.display}; font-size: 10.5px; letter-spacing: .1em;
  font-variant-caps: small-caps; color: ${theme.gold}; font-variant-numeric: tabular-nums;
  margin-bottom: 7px;
}
#bw-creation .bw-cr-budget.spent { color: ${theme.parchmentFaint}; }

/* --- the stat bars, which are also the sliders --------------------------- */
#bw-creation .bw-cr-bars { display: grid; gap: 3px; }
#bw-creation .bw-cr-bar { display: grid; grid-template-columns: 30px 1fr 32px; gap: 9px; align-items: center; }
#bw-creation .bw-cr-bk {
  font-family: ${theme.fonts.display}; font-size: 9.5px; letter-spacing: .12em;
  color: ${theme.parchmentFaint};
}
#bw-creation .bw-cr-bt {
  position: relative; display: block; height: 11px;
  background: rgba(0,0,0,.6); border: 1px solid ${theme.goldDim}55;
}
#bw-creation .bw-cr-bf { position: absolute; left: 0; top: 0; bottom: 0; display: block; }
#bw-creation .bw-cr-bv {
  font-family: ${theme.fonts.display}; font-size: 12.5px; font-variant-numeric: tabular-nums;
  text-align: right; color: ${theme.parchment};
}
/* the range input IS the bar: no track of its own, sat exactly over it */
#bw-creation input[type=range] {
  -webkit-appearance: none; appearance: none; margin: 0; cursor: pointer;
  position: absolute; left: -2px; top: -4px; width: calc(100% + 4px); height: 19px;
  background: transparent;
}
#bw-creation input[type=range]::-webkit-slider-runnable-track { height: 19px; background: transparent; border: 0; }
#bw-creation input[type=range]::-webkit-slider-thumb {
  -webkit-appearance: none; appearance: none; width: 11px; height: 15px; margin-top: 2px;
  border: 1px solid #2b2118;
  background: linear-gradient(180deg, #fff6e0, ${theme.parchment} 55%, ${theme.parchmentFaint});
  box-shadow: 0 1px 4px rgba(0,0,0,.9);
}
#bw-creation input[type=range]::-moz-range-track { height: 19px; background: transparent; border: 0; }
#bw-creation input[type=range]::-moz-range-thumb {
  width: 10px; height: 15px; border-radius: 0; border: 1px solid #2b2118;
  background: linear-gradient(180deg, #fff6e0, ${theme.parchment} 55%, ${theme.parchmentFaint});
}

/* --- the skills, behind a disclosure ------------------------------------- */
#bw-creation .bw-cr-disc {
  width: 100%; margin-top: 9px; text-align: left; cursor: pointer;
  font-family: ${theme.fonts.display}; font-size: 10.5px; letter-spacing: .18em;
  font-variant-caps: small-caps; color: ${theme.gold};
  padding: 7px 10px; border: 1px solid ${theme.goldDim}66;
  background: linear-gradient(180deg, rgba(255,255,255,.05), rgba(0,0,0,.42));
}
#bw-creation .bw-cr-disc:hover { color: ${theme.goldBright}; border-color: ${theme.gold}; }
#bw-creation .bw-cr-disc::after { content: ' +'; float: right; }
#bw-creation .bw-cr-disc.open::after { content: ' -'; }
#bw-creation .bw-cr-skillwrap { margin-top: 8px; }
#bw-creation .bw-cr-skillwrap[hidden] { display: none; }
#bw-creation .bw-cr-skills {
  max-height: 260px; overflow-y: auto; padding: 4px 9px 4px 10px;
  border: 1px solid ${theme.goldDim}44; background: rgba(0,0,0,.3);
}
#bw-creation .bw-cr-skills .bw-cr-grp {
  font-family: ${theme.fonts.display}; font-size: 9.5px; letter-spacing: .18em;
  font-variant-caps: small-caps; color: ${theme.goldDim}; margin: 10px 0 3px;
  border-bottom: 1px solid ${theme.goldDim}44; padding-bottom: 3px;
}
#bw-creation .bw-cr-skills .bw-cr-grp:first-child { margin-top: 0; }
#bw-creation .bw-row {
  display: grid; grid-template-columns: 1fr 106px 34px; gap: 7px; align-items: center;
  padding: 2px 0; border-bottom: 1px solid rgba(201,164,74,.13); font-size: 14px;
}
#bw-creation .bw-row .bw-k { color: ${theme.parchmentDim}; }
#bw-creation .bw-row .bw-v {
  text-align: right; font-family: ${theme.fonts.display}; font-size: 12.5px; font-weight: 600;
  font-variant-numeric: tabular-nums; color: ${theme.parchment};
}
#bw-creation .bw-step { display: flex; gap: 2px; justify-content: flex-end; }
#bw-creation .bw-step button {
  font-family: ${theme.fonts.display}; font-size: 9.5px; letter-spacing: .03em;
  width: 25px; padding: 3px 0; cursor: pointer; color: ${theme.parchmentDim};
  border: 1px solid ${theme.goldDim}66;
  background: linear-gradient(180deg, rgba(255,255,255,.05), rgba(0,0,0,.4));
}
#bw-creation .bw-step button:hover:not(:disabled) { color: ${theme.goldBright}; border-color: ${theme.gold}; }
#bw-creation .bw-step button:disabled { opacity: .3; cursor: default; }

/* --- what that comes to -------------------------------------------------- */
#bw-creation .bw-cr-derived { display: grid; grid-template-columns: 1fr 1fr; gap: 0 16px; }
#bw-creation .bw-cr-drow {
  display: grid; grid-template-columns: 16px 1fr auto; gap: 7px; align-items: center;
  padding: 2px 0; border-bottom: 1px solid rgba(201,164,74,.13); font-size: 13.5px;
}
#bw-creation .bw-cr-drow .bw-i { display: block; opacity: .85; }
#bw-creation .bw-cr-drow .bw-cr-dk {
  font-family: ${theme.fonts.display}; font-size: 9.5px; letter-spacing: .12em;
  font-variant-caps: small-caps; color: ${theme.gold};
}
#bw-creation .bw-cr-drow .bw-cr-dv {
  font-family: ${theme.fonts.display}; font-size: 12.5px; font-weight: 600;
  font-variant-numeric: tabular-nums; color: ${theme.parchment}; white-space: nowrap;
}

/* --- the gear row -------------------------------------------------------- */
#bw-creation .bw-cr-kitrow { display: grid; grid-template-columns: repeat(4, 64px); gap: 8px; align-items: center; }
#bw-creation .bw-cr-kit-i, #bw-creation .bw-cr-kit-gone {
  width: 64px; height: 64px; display: flex; align-items: center; justify-content: center;
  background: linear-gradient(180deg, rgba(255,255,255,.035), rgba(0,0,0,.2)), ${theme.slot.face};
  border: 1px solid ${theme.slot.border};
  border-radius: 7px;
  box-shadow: inset 0 1px 0 rgba(255,255,255,.10), inset 0 -6px 12px rgba(0,0,0,.45);
}
#bw-creation .bw-cr-kit-i img, #bw-creation .bw-cr-kit-gone img { display: block; }
/* a kit line the item tables cannot make yet: shown, greyed, and said again in
   words under the button. Never simply absent. */
#bw-creation .bw-cr-kit-gone { opacity: .4; border-style: dashed; }
#bw-creation .bw-cr-kit-more {
  font-family: ${theme.fonts.display}; font-size: 9.5px; letter-spacing: .1em;
  font-variant-caps: small-caps; color: ${theme.parchmentFaint}; padding-left: 3px;
}

/* --- the name, and the button -------------------------------------------- */
#bw-creation select, #bw-creation input[type=text] {
  font-family: ${theme.fonts.body}; font-size: 14px; color: ${theme.parchment};
  padding: 4px 8px; border: 1px solid ${theme.goldDim}66;
  background: linear-gradient(180deg, rgba(255,255,255,.05), rgba(0,0,0,.45));
}
#bw-creation select {
  -webkit-appearance: none; appearance: none; width: 100%; padding-right: 22px; cursor: pointer;
  background-image: ${CARET}, linear-gradient(180deg, rgba(255,255,255,.05), rgba(0,0,0,.45));
  background-repeat: no-repeat, no-repeat;
  background-position: right 6px center, 0 0;
  background-size: 12px 8px, auto;
}
#bw-creation select:focus, #bw-creation input[type=text]:focus { outline: none; border-color: ${theme.gold}; }
#bw-creation select option { background: #100d09; color: ${theme.parchment}; }
#bw-creation input[type=text] {
  width: 100%; font-size: 17px; padding: 8px 11px; letter-spacing: .04em;
  font-family: ${theme.fonts.display};
}

#bw-creation .bw-cr-go {
  width: 100%; margin-top: 14px;
  font-family: ${theme.fonts.display}; font-size: 14px; font-weight: 600;
  letter-spacing: .08em; font-variant-caps: small-caps; color: #181106;
  padding: 14px 18px; cursor: pointer;
  border: 1px solid ${theme.goldBright};
  border-radius: 7px;
  background: linear-gradient(180deg, ${theme.goldBright}, ${theme.gold} 52%, ${theme.goldDim});
  box-shadow: 0 3px 20px rgba(0,0,0,.65), inset 0 1px 0 rgba(255,255,255,.35);
}
#bw-creation .bw-cr-go:hover:not(:disabled) { filter: brightness(1.08); }
#bw-creation .bw-cr-go:active:not(:disabled) { transform: scale(.96); }
#bw-creation .bw-cr-go:disabled {
  opacity: .5; cursor: default; color: ${theme.parchmentFaint}; border-color: ${theme.goldDim};
  background: linear-gradient(180deg, #3a2018, #221009 55%, #140805);
}
#bw-creation .bw-cr-err { margin-top: 8px; min-height: 18px; font-size: 14px; color: ${theme.down}; }
#bw-creation .bw-cr-short { margin-top: 2px; font-size: 13px; font-style: italic; color: ${theme.parchmentFaint}; }

/* --- the footer ---------------------------------------------------------- */
#bw-creation .bw-cr-foot {
  grid-column: 1 / -1; grid-row: 3;
  display: flex; justify-content: space-between; align-items: center; gap: 18px;
  padding: 6px 16px; border-top: 1px solid ${theme.goldDim}44;
  background: linear-gradient(180deg, rgba(6,5,4,.6), rgba(6,5,4,.92));
  font-family: ${theme.fonts.display}; font-size: 9.5px; letter-spacing: .2em;
  font-variant-caps: small-caps; color: ${theme.parchmentFaint};
}

/* --- narrower windows ---------------------------------------------------- */
/* 1280: the three columns still stand, at 260 and 360. */
@media (max-width: 1400px) {
  #bw-creation .bw-cr-panel { grid-template-columns: 260px minmax(0, 1fr) 360px; }
  #bw-creation .bw-cr-left { padding: 14px 12px 18px; }
  #bw-creation .bw-cr-card { padding: 8px 7px 9px 11px; }
  #bw-creation .bw-cr-name { font-size: 12.5px; letter-spacing: 0; }
  #bw-creation .bw-cr-blurb { font-size: 12px; }
  #bw-creation .bw-cr-drow .bw-cr-dk { font-size: 9px; letter-spacing: .07em; }
  #bw-creation .bw-cr-drow { gap: 6px; }
  #bw-creation .bw-cr-art { height: min(174px, 19vh); }
}
/* Below 1100 there is not room for three, so they stack and the preview is on
   top, which is the thing a player is choosing between. */
@media (max-width: 1099px) {
  #bw-creation { overflow-y: auto; }
  #bw-creation .bw-cr-panel {
    position: relative; inset: auto; min-height: 100%;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto auto auto auto auto;
  }
  #bw-creation .bw-cr-plaque { grid-column: 1; grid-row: 1; }
  #bw-creation .bw-cr-left { grid-column: 1; grid-row: 2; border-right: 0; box-shadow: none; overflow: visible; }
  #bw-creation .bw-cr-right { grid-column: 1; grid-row: 3; border-left: 0; box-shadow: none; overflow: visible; }
  /* stacked, the page itself scrolls, so the right column is not a viewport
     of its own and the button rides down the page with everything else */
  #bw-creation .bw-cr-scroll { overflow: visible; padding-bottom: 4px; }
  #bw-creation .bw-cr-act { border-top: 0; background: none; }
  #bw-creation .bw-cr-left, #bw-creation .bw-cr-right { border-top: 1px solid ${theme.goldDim}88; }
  #bw-creation .bw-cr-foot { grid-column: 1; grid-row: 4; }
  #bw-creation .bw-cr-cards { grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); }
  #bw-creation .bw-cr-art { height: 200px; }
}

/* C3: the user's painting is the screen. The DOM is laid into the two dark
   painted panels in the transparent frame. */
#bw-creation {
  background-size: cover; background-position: center; background-repeat: no-repeat;
  overflow: hidden;
}
#bw-creation::before {
  content: ""; position: absolute;
  left: var(--bw-scene-x); top: var(--bw-scene-y);
  width: var(--bw-scene-w); height: var(--bw-scene-h);
  background-image: url("${rosterPanelsUrl()}");
  background-size: 100% 100%; background-position: center; background-repeat: no-repeat;
  pointer-events: none;
}
#bw-creation .bw-cr-panel {
  position: absolute; inset: 0; display: block; min-height: 100%;
}
#bw-creation .bw-cr-plaque, #bw-creation .bw-cr-foot { display: none; }
#bw-creation .bw-cr-left, #bw-creation .bw-cr-right {
  position: absolute; min-height: 0; border: 0; box-shadow: none;
  background: transparent; background-image: none;
}
#bw-creation .bw-cr-left {
  left: calc(var(--bw-scene-x) + ${ROSTER_FRAME.leftPanel.x1} * var(--bw-scene-w));
  top: calc(var(--bw-scene-y) + ${ROSTER_FRAME.leftPanel.y1} * var(--bw-scene-h));
  width: calc((${ROSTER_FRAME.leftPanel.x2} - ${ROSTER_FRAME.leftPanel.x1}) * var(--bw-scene-w));
  height: calc((${ROSTER_FRAME.leftPanel.y2} - ${ROSTER_FRAME.leftPanel.y1}) * var(--bw-scene-h));
  padding: clamp(8px, 1vw, 14px);
  display: flex; flex-direction: column; gap: 10px; overflow: hidden;
}
#bw-creation .bw-cr-right {
  left: calc(var(--bw-scene-x) + ${ROSTER_FRAME.rightPanel.x1} * var(--bw-scene-w));
  top: calc(var(--bw-scene-y) + ${ROSTER_FRAME.rightPanel.y1} * var(--bw-scene-h));
  width: calc((${ROSTER_FRAME.rightPanel.x2} - ${ROSTER_FRAME.rightPanel.x1}) * var(--bw-scene-w));
  height: calc((${ROSTER_FRAME.rightPanel.y2} - ${ROSTER_FRAME.rightPanel.y1}) * var(--bw-scene-h));
  display: block; overflow-y: auto; overflow-x: hidden;
}
#bw-creation .bw-cr-cards {
  flex: 1 1 auto; min-height: 0; overflow-y: auto; overflow-x: hidden;
  display: flex; flex-direction: column; gap: 8px; padding-right: 4px;
}
#bw-creation .bw-cr-card {
  min-height: 76px; grid-template-columns: 56px minmax(0, 1fr); grid-template-rows: auto auto;
  padding: 7px; background: rgba(9, 10, 12, .28);
  border-color: rgba(201,164,74,.16); border-radius: 6px;
  transition-property: background-color, border-color, box-shadow, transform;
}
#bw-creation .bw-cr-card.on {
  background: linear-gradient(180deg, rgba(122,42,32,.58), rgba(91,29,22,.5));
  border-color: ${theme.gold};
}
#bw-creation .bw-cr-card-img {
  grid-row: 1 / span 2; width: 56px; height: 62px; object-fit: contain;
  object-position: bottom center; align-self: stretch;
  filter: drop-shadow(0 2px 2px rgba(0,0,0,.5));
}
#bw-creation .bw-cr-card .bw-cr-band, #bw-creation .bw-cr-emblem { display: none; }
#bw-creation .bw-cr-name {
  font-size: clamp(14px, 1.05vw, 18px); letter-spacing: 0; text-wrap: balance;
}
#bw-creation .bw-cr-blurb {
  font-size: clamp(12px, .82vw, 14px); -webkit-line-clamp: 1; text-wrap: pretty;
}
#bw-creation .bw-cr-cancel {
  flex: 0 0 auto; min-height: 40px; cursor: pointer;
  font-family: ${theme.fonts.display}; font-size: 12px; font-weight: 700; letter-spacing: 0;
  color: ${theme.parchmentDim}; border: 1px solid ${theme.goldDim}88; border-radius: 6px;
  background: rgba(0,0,0,.18);
}
#bw-creation .bw-cr-cancel:hover { color: ${theme.goldBright}; border-color: ${theme.gold}; }
#bw-creation .bw-cr-cancel:active { transform: scale(.96); }
#bw-creation .bw-cr-scroll {
  min-height: 100%; overflow: visible;
  padding: clamp(8px, 1vw, 12px); display: flex; flex-direction: column; justify-content: center;
}
#bw-creation .bw-cr-act {
  flex: 0 0 auto; margin-top: 8px; padding: 6px 0 0;
  border-top: 1px solid rgba(201,164,74,.18); background: transparent;
}
#bw-creation .bw-cr-art {
  order: -3;
  height: min(190px, calc((${ROSTER_FRAME.rightPanel.y2} - ${ROSTER_FRAME.rightPanel.y1}) * var(--bw-scene-h) * ${ROSTER_PANEL_ART.creationPortraitFrac}));
  max-height: calc((${ROSTER_FRAME.rightPanel.y2} - ${ROSTER_FRAME.rightPanel.y1}) * var(--bw-scene-h) * ${ROSTER_PANEL_ART.maxPortraitFrac});
  margin: 0 0 5px; border: 0;
  box-shadow: none; background: transparent;
  display: flex; align-items: flex-end; justify-content: center; overflow: hidden;
}
#bw-creation .bw-cr-art::after { display: none; }
#bw-creation .bw-cr-art-img {
  display: block; max-width: 100%; height: 100%; object-fit: contain; object-position: bottom center;
  filter: drop-shadow(0 12px 10px rgba(0,0,0,.5));
}
#bw-creation .bw-cr-cname {
  font-size: clamp(18px, 1.65vw, 26px); letter-spacing: 0; text-wrap: balance;
}
#bw-creation .bw-cr-words { letter-spacing: 0; }
#bw-creation .bw-cr-quote, #bw-creation .bw-cr-about { display: none; }
#bw-creation .bw-hdr {
  font-size: 11px; letter-spacing: 0; font-variant-caps: normal; color: ${theme.gold};
  margin: 8px 0 5px;
}
#bw-creation .bw-cr-words,
#bw-creation .bw-cr-budget,
#bw-creation .bw-cr-bk,
#bw-creation .bw-cr-disc,
#bw-creation .bw-cr-skills .bw-cr-grp,
#bw-creation .bw-cr-drow .bw-cr-dk,
#bw-creation .bw-cr-kit-more,
#bw-creation .bw-cr-go,
#bw-creation .bw-cr-foot {
  letter-spacing: 0; font-variant-caps: normal;
}
#bw-creation .bw-cr-derived, #bw-creation .bw-cr-kit-head, #bw-creation .bw-cr-kitrow { display: none; }
#bw-creation .bw-cr-disc { margin-top: 7px; letter-spacing: 0; font-variant-caps: normal; }
#bw-creation .bw-cr-go { letter-spacing: 0; font-variant-caps: normal; }

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

/** The mark beside each derived number, from the codex's own icon set. */
const DERIVED_ICON = {
  health: 'heart', mana: 'book', stamina: 'boot',
  // The unit rides in the label rather than the number. "STAMINA REGEN" beside
  // "2.50 A SECOND" wrapped its own value at 360 px; this way the label wraps,
  // which is what labels are allowed to do, and the number stays one line.
  carry: 'scale', 'mana a second': 'drop', 'stamina a second': 'bolt',
};

/**
 * The screen. The preview is the user's class portrait, so creation does not
 * build a scene rig here.
 *
 * @param {HTMLElement} root
 * @param {{ onDone?, onCancel? }} deps
 */
export function createCreation(root, deps = {}) {
  const { onDone, onCancel } = deps;
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
  el.style.backgroundImage = `url("${rosterBgUrl()}")`;
  // The ambient loop the user painted for this screen (public/ui/brackenwake-
  // ambient-loop.mp4); the still stays underneath until it plays.
  const video = document.createElement('video');
  video.className = 'bw-ro-video';
  video.src = '/ui/brackenwake-ambient-loop.mp4';
  video.muted = true; video.loop = true; video.autoplay = true; video.playsInline = true;
  video.setAttribute('aria-hidden', 'true');
  el.appendChild(video);
  try { const p = video.play(); if (p && p.catch) p.catch(() => {}); } catch { /* the still is enough */ }
  const panel = h('div', 'bw-cr-panel');
  el.appendChild(panel);
  (root || document.body).appendChild(el);
  const unboxFrame = installRosterFrameBox(el);

  // --- the plaque, top centre
  // --- the left column: the four openings, small
  const left = h('div', 'bw-cr-left');
  panel.appendChild(left);
  const cards = h('div', 'bw-cr-cards');
  left.appendChild(cards);
  const cancel = h('button', 'bw-cr-cancel', 'Cancel');
  cancel.addEventListener('click', () => {
    destroy();
    if (typeof onCancel === 'function') onCancel();
  });
  left.appendChild(cancel);

  // --- the right column: this class, and everything you may change about it
  const right = h('div', 'bw-cr-right');
  panel.appendChild(right);
  // The class, the points, the name and the button are one column. The right
  // interior scrolls when it has to, and otherwise centres that column.
  const reading = h('div', 'bw-cr-scroll');
  right.appendChild(reading);

  const art = h('div', 'bw-cr-art');
  const artImg = h('img', 'bw-cr-art-img');
  artImg.alt = '';
  art.appendChild(artImg);
  reading.appendChild(art);
  const cname = h('div', 'bw-cr-cname');
  reading.appendChild(cname);
  const words = h('div', 'bw-cr-words');
  reading.appendChild(words);
  const quote = h('div', 'bw-cr-quote');
  reading.appendChild(quote);
  const about = h('div', 'bw-cr-about');
  reading.appendChild(about);

  reading.appendChild(h('div', 'bw-hdr', 'Base stats'));
  const statBudget = h('div', 'bw-cr-budget');
  reading.appendChild(statBudget);
  const statBars = h('div', 'bw-cr-bars');
  reading.appendChild(statBars);

  const disc = h('button', 'bw-cr-disc', 'Adjust skills');
  reading.appendChild(disc);
  const skillWrap = h('div', 'bw-cr-skillwrap');
  skillWrap.hidden = true;                 // closed by default
  reading.appendChild(skillWrap);
  const skillBudget = h('div', 'bw-cr-budget');
  skillWrap.appendChild(skillBudget);
  const skillScroll = h('div', 'bw-cr-skills');
  skillWrap.appendChild(skillScroll);
  disc.addEventListener('click', () => {
    skillWrap.hidden = !skillWrap.hidden;
    disc.classList.toggle('open', !skillWrap.hidden);
  });

  reading.appendChild(h('div', 'bw-hdr', 'What that comes to'));
  const derivedEl = h('div', 'bw-cr-derived');
  reading.appendChild(derivedEl);

  reading.appendChild(h('div', 'bw-hdr bw-cr-kit-head', 'Starting gear'));
  const kitRow = h('div', 'bw-cr-kitrow');
  reading.appendChild(kitRow);

  const act = h('div', 'bw-cr-act');
  reading.appendChild(act);
  act.appendChild(h('div', 'bw-hdr', 'Name'));
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.maxLength = NAME_MAX;
  nameInput.placeholder = 'a name';
  // the name's own complaint waits until a name has been tried: a red line
  // over an empty box the player has not reached yet reads as a broken form
  let nameTried = false;
  nameInput.addEventListener('input', () => { state.name = nameInput.value; nameTried = true; refresh(); });
  nameInput.addEventListener('blur', () => { if (nameInput.value) nameTried = true; refresh(); });
  act.appendChild(nameInput);

  const go = h('button', 'bw-cr-go', 'Create character');
  act.appendChild(go);
  const err = h('div', 'bw-cr-err');
  act.appendChild(err);
  const shortfall = h('div', 'bw-cr-short');
  act.appendChild(shortfall);

  // --- the footer, both ends
  const foot = h('div', 'bw-cr-foot');
  foot.appendChild(h('span', null, 'Four openings, thirty points to move, a name of your own'));
  foot.appendChild(h('span', null, `${GAME_TITLE} : the making of somebody`));
  panel.appendChild(foot);

  // --- the opening cards. Built once: nothing on a card changes with the
  // points, so only the lit border moves when the choice does.
  for (const op of OPENINGS) {
    const colour = openingColour(op.id);
    const card = h('div', 'bw-cr-card');
    card.dataset.opening = op.id;
    const portrait = h('img', 'bw-cr-card-img');
    portrait.src = classPortraitUrl(op.id);
    portrait.alt = op.name;
    card.appendChild(portrait);
    card.appendChild(h('div', 'bw-cr-name', op.name));
    card.appendChild(h('div', 'bw-cr-blurb', op.blurb));

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

  // --- stats, skills and the face, rebuilt when the opening changes because
  // the budgets and the wording do
  let statInputs = new Map();
  let skillRows = new Map();

  function build() {
    const op = OPENINGS_BY_ID[state.opening];

    cname.textContent = op.name;
    words.textContent = statWords(op).join(' · ');
    // The stable hook a painting is dropped on later. One id per class.
    art.id = artId(op.id);
    art.dataset.art = op.id;
    art.style.backgroundImage = '';
    artImg.src = classPortraitUrl(op.id);
    artImg.alt = op.name;
    art.title = `${op.name} portrait`;
    quote.textContent = QUOTES[op.id];
    about.textContent = `${op.blurb} ${CLASS_NOTE[op.id]}`;

    statBars.textContent = '';
    statInputs = new Map();
    for (const id of STAT_IDS) {
      const bar = h('div', 'bw-cr-bar');
      bar.dataset.stat = id;
      bar.appendChild(h('span', 'bw-cr-bk', STAT_LABELS[id]));
      const track = h('span', 'bw-cr-bt');
      const fill = h('i', 'bw-cr-bf');
      fill.style.background = openingColour(op.id);
      track.appendChild(fill);
      // The bar IS the slider: the range sits exactly over the track with no
      // track of its own, so the thing you read is the thing you drag.
      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = String(STAT_FLOOR);
      slider.max = String(STAT_CEIL);
      slider.step = '1';
      slider.value = String(state.stats[id]);
      slider.title = STAT_NAMES[id];
      slider.addEventListener('input', () => {
        state.stats[id] = Number(slider.value);
        refresh();
      });
      track.appendChild(slider);
      bar.appendChild(track);
      bar.appendChild(h('span', 'bw-cr-bv', String(state.stats[id])));
      statBars.appendChild(bar);
      statInputs.set(id, { slider, fill, v: bar.children[2] });
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

    // CR3: ONE CHOICE, AND THE REST OF THE RECORD IS NOT GONE.
    //
    // The screen used to offer six: build, skin, hair, hair colour, marks and
    // Appearance controls are absent in Phase A. `planCharacter` still writes
    // the one authored body through APPEARANCE_DEFAULT.
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

  /** Just the points half, so a slider can be refused before the name is typed. */
  function planPoints() {
    const op = OPENINGS_BY_ID[state.opening];
    const sm = movesFrom(op.stats, state.stats, STAT_IDS, false);
    if (sm.error) return { error: `stats: ${sm.error}` };
    const km = movesFrom(op.skills, state.skills, SKILL_IDS, false);
    if (km.error) return { error: `skills: ${km.error}` };
    const applied = applyCustomisation(op, sm.moves, km.moves);
    if (applied.error) return { error: applied.error };
    return { error: null, applied, sm, km };
  }

  function refresh() {
    const op = OPENINGS_BY_ID[state.opening];
    for (const card of cards.children) card.classList.toggle('on', card.dataset.opening === state.opening);

    // What the kit hands over, in pictures. `itemGlyph` prefers the painting
    // and falls back to the drawn glyph, so a base with no painting still
    // shows a thing rather than a hole.
    const { items, missing } = kitFor(op, 1);
    kitRow.textContent = '';
    kitRow.dataset.kit = String(items.length);
    for (const { item } of items.slice(0, KIT_ICONS_SHOWN)) {
      const b = baseFor(item);
      const cell = hs('span', 'bw-cr-kit-i', itemGlyph(b, 48, null, { count: item.count, material: item.material }));
      cell.title = item.count && item.count > 1 ? `${item.count} ${b.name.toLowerCase()}` : b.name;
      kitRow.appendChild(cell);
    }
    if (items.length > KIT_ICONS_SHOWN) {
      kitRow.appendChild(h('span', 'bw-cr-kit-more', `+${items.length - KIT_ICONS_SHOWN} more`));
    }
    // Anything the kit names and the tables cannot make: greyed, in its place
    // in the row, and said again in words under the button.
    for (const m of missing) {
      const cell = hs('span', 'bw-cr-kit-gone', itemGlyph(null, 22, theme.parchmentFaint));
      cell.dataset.missing = m;
      cell.title = `${m.replace(/([A-Z])/g, ' $1').toLowerCase()}, which the item tables do not have yet`;
      kitRow.appendChild(cell);
    }

    const points = planPoints();
    const statMoved = points.applied ? points.applied.spent.stat : null;
    const skillMoved = points.applied ? points.applied.spent.skill : null;
    const statCap = CUSTOM_STAT_POINTS;
    const skillCap = CUSTOM_SKILL_POINTS;
    statBudget.textContent = `${statMoved == null ? '?' : statCap - statMoved} of ${statCap} stat points left to move`;
    statBudget.classList.toggle('spent', statMoved === statCap);
    skillBudget.textContent = `${skillMoved == null ? '?' : skillCap - skillMoved} of ${skillCap} skill points left to move`;
    skillBudget.classList.toggle('spent', skillMoved === skillCap);

    for (const [id, ref] of statInputs) {
      const v = state.stats[id];
      ref.slider.value = String(v);
      ref.fill.style.width = `${statPct(v)}%`;
      ref.fill.dataset.pct = String(statPct(v));
      ref.v.textContent = String(v);
    }
    for (const [id, ref] of skillRows) {
      const v = state.skills[id] || 0;
      ref.v.textContent = v.toFixed(1);
      // A button that would go nowhere is dead, and looks it.
      for (const { by, b } of ref.buttons) {
        b.disabled = by < 0 ? v <= 0 : v >= op.maxSkillAtStart;
      }
    }

    const d = derived(state.stats, state.skills);
    derivedEl.textContent = '';
    const dline = (label, value) => {
      const row = h('div', 'bw-cr-drow');
      row.appendChild(hs('span', null, icon(DERIVED_ICON[label] || 'crossed', theme.gold, 13)));
      row.appendChild(h('span', 'bw-cr-dk', label));
      row.appendChild(h('span', 'bw-cr-dv', String(value)));
      derivedEl.appendChild(row);
    };
    dline('health', Math.floor(d.maxHealth));
    dline('mana', Math.floor(d.maxMana));
    dline('stamina', Math.floor(d.maxStamina));
    dline('carry', `${Math.round(d.carry)} stones`);
    dline('mana a second', d.manaRegen.toFixed(2));
    dline('stamina a second', d.staminaRegen.toFixed(2));

    // A BUG THIS SCREEN HID, measured on the shipped code before it was fixed:
    // drag STR from 65 to 55 and put the ten points nowhere and planCharacter
    // returns ok with a character whose STR is 65, because a donor with no
    // gainer makes no move at all. The bar read 55 and the save held 65. The
    // rules are right and stay untouched; what was missing was anybody reading
    // `movesFrom`'s own `spare`, which has counted the loose points all along.
    const looseStat = (points.sm && points.sm.spare) || 0;
    const looseSkill = (points.km && points.km.spare) || 0;
    const parts = [];
    if (looseStat) parts.push(`${looseStat} stat point${looseStat === 1 ? '' : 's'}`);
    if (looseSkill) parts.push(`${looseSkill} skill point${looseSkill === 1 ? '' : 's'}`);
    const many = looseStat + looseSkill > 1;
    const loose = parts.length
      ? `${parts.join(' and ')} you took off ${many ? 'are' : 'is'} lying loose. Put ${many ? 'them' : 'it'} on something else.`
      : '';

    const plan = planCharacter(state);
    const shown = plan.ok ? [] : plan.errors.filter((e) => nameTried || !/^a name /.test(e));
    err.textContent = [loose, shown.join('. ')].filter(Boolean).join(' ');
    go.disabled = !plan.ok || !!loose;
    shortfall.textContent = plan.ok && !loose ? shortfallLine(plan) : '';
  }

  go.addEventListener('click', () => {
    const plan = planCharacter(state);
    if (!plan.ok) { err.textContent = plan.errors.join('. '); return; }
    destroy();
    if (typeof onDone === 'function') onDone(plan.character, plan);
  });

  function destroy() {
    unboxFrame();
    el.remove();
  }

  build();
  pick(state.opening);
  // Taking the caret is worth it; taking the caret and dragging the right hand
  // column down to the name field, past the class the player came here to read
  // about, is not. The scroll is put back either way, because preventScroll is
  // not honoured everywhere.
  try { nameInput.focus?.({ preventScroll: true }); } catch { nameInput.focus?.(); }
  left.scrollTop = 0;
  right.scrollTop = 0;

  return {
    el, state,
    plan: () => planCharacter(state),
    pick,
    destroy,
    get skillsOpen() { return !skillWrap.hidden; },
  };
}

export default createCreation;
