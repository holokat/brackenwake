// Items: slots, armour tiers, weapons, shields, rarity, and the rules that say
// what a thing weighs and whether you can wear it. Pure data and arithmetic:
// no THREE, no DOM, runs in node. Everything here is the item half of
// docs/mmo/03-ITEMS-LOOT.md, and auditItems() below fails loudly if the code
// and that table drift apart.
//
// An item is the small record the document specifies:
//   { id, base, rarity, seed, identified, affixes, quality, durability, maker }
// Everything visible about it is derived from that record plus these tables, so
// a server and a client that agree on the seed agree on the sword.
//
// Affixes live in affixes.js and are rolled from item.seed there. This module
// deliberately knows nothing about them, so the import graph stays a line:
// items -> affixes -> loot.

import { hash2 } from '../world/noise.js';
import { SKILLS } from './skills.js';

// ------------------------------------------------------------------- slots
// Fourteen. The paper doll shows all of them.
export const SLOTS = [
  'head', 'neck', 'chest', 'back', 'hands', 'wrists', 'waist', 'legs', 'feet',
  'ring1', 'ring2', 'mainHand', 'offHand', 'ranged',
];

// A ring fits either ring slot; everything else has exactly one home.
export const SLOT_ALTERNATES = { ring1: ['ring1', 'ring2'] };

// ------------------------------------------------------------ combat skills
// Not a second copy of the skill table: the combat groups of skills.js, which
// is the same document's table. A weapon's skill must be one of these, and
// auditItems() enforces it, so renaming a skill over there breaks loudly here
// instead of leaving a weapon nobody can train.
export const COMBAT_SKILLS = SKILLS.filter((s) => /^Combat/.test(s.group)).map((s) => s.id);
/** Display name of a weapon's skill, for tooltips; the record carries the id. */
export const skillNameOf = (id) => SKILLS.find((s) => s.id === id)?.name ?? id;

// ------------------------------------------------------------- armour tiers
// Six materials. Every column of the document's table is a field here, and the
// audit fails if one goes missing. `ar` is per piece before the chest doubling;
// `meditation` is the fraction of Meditation regeneration the piece still
// allows (full, full, 75%, 40%, 20%, none).
export const ARMOR_TIERS = [
  { tier: 1, id: 'cloth', material: 'Cloth', ar: 1, weight: 1, strReq: 0, meditation: 1, resist: { energy: 1 } },
  { tier: 2, id: 'leather', material: 'Leather', ar: 3, weight: 2, strReq: 15, meditation: 1, resist: { cold: 1, poison: 1 } },
  { tier: 3, id: 'studded', material: 'Studded leather', ar: 5, weight: 3, strReq: 25, meditation: 0.75, resist: { poison: 2 } },
  { tier: 4, id: 'ring', material: 'Ringmail', ar: 7, weight: 5, strReq: 40, meditation: 0.4, resist: { physical: 1, fire: 1 } },
  { tier: 5, id: 'chain', material: 'Chainmail', ar: 9, weight: 6, strReq: 55, meditation: 0.2, resist: { physical: 2 } },
  { tier: 6, id: 'plate', material: 'Platemail', ar: 12, weight: 9, strReq: 75, meditation: 0, resist: { physical: 3, fire: 2 } },
];

export const TIER_COLUMNS = ['tier', 'id', 'material', 'ar', 'weight', 'strReq', 'meditation', 'resist'];

// The eight pieces. Only the chest doubles its AR; weight is flat per piece,
// which is what makes a full plate set 8 x 9 = 72 stones and AR 7 x 12 + 24 = 108.
export const ARMOR_PIECES = [
  { id: 'head', slot: 'head', arMul: 1 },
  { id: 'chest', slot: 'chest', arMul: 2 },
  { id: 'hands', slot: 'hands', arMul: 1 },
  { id: 'wrists', slot: 'wrists', arMul: 1 },
  { id: 'waist', slot: 'waist', arMul: 1 },
  { id: 'legs', slot: 'legs', arMul: 1 },
  { id: 'feet', slot: 'feet', arMul: 1 },
  { id: 'back', slot: 'back', arMul: 1 },
];

// The nouns come from the slot table: helm/hood, tunic/robe/breastplate,
// gloves/gauntlets, bracers, belt/sash, leggings/greaves, boots/sandals, cloak.
// Cloth wears the soft words, mail and plate the hard ones.
const PIECE_NOUNS = {
  cloth: { head: 'Hood', chest: 'Robe', hands: 'Gloves', wrists: 'Bracers', waist: 'Sash', legs: 'Leggings', feet: 'Sandals', back: 'Cloak' },
  hide: { head: 'Helm', chest: 'Tunic', hands: 'Gloves', wrists: 'Bracers', waist: 'Belt', legs: 'Leggings', feet: 'Boots', back: 'Cloak' },
  metal: { head: 'Helm', chest: 'Breastplate', hands: 'Gauntlets', wrists: 'Bracers', waist: 'Belt', legs: 'Greaves', feet: 'Boots', back: 'Cloak' },
};
const NOUN_BAND = { cloth: 'cloth', leather: 'hide', studded: 'hide', ring: 'metal', chain: 'metal', plate: 'metal' };

// Extra tags a piece answers to, so an affix restricted to "boots, cloaks,
// belts" can find them without knowing about materials.
const PIECE_TAGS = {
  head: ['helm'], chest: ['chestpiece'], hands: ['gloves'], wrists: ['bracers'],
  waist: ['belt'], legs: ['legs'], feet: ['boots'], back: ['cloak'],
};

// ----------------------------------------------------------------- shields
export const SHIELDS = {
  buckler: { id: 'buckler', name: 'Buckler', parryFactor: 0.6, weight: 3, strReq: 0 },
  kite: { id: 'kite', name: 'Kite Shield', parryFactor: 0.9, weight: 6, strReq: 30 },
  tower: { id: 'tower', name: 'Tower Shield', parryFactor: 1.2, weight: 10, strReq: 55 },
};

// ----------------------------------------------------------------- weapons
// All nineteen rows of the base table, before material and affixes. `reach` is
// metres for melee (the document names 3 m and 3.5 m; everything else is the
// default 1.5 m) and `range` is metres for anything thrown or fired.
export const WEAPONS = {
  dagger: { id: 'dagger', name: 'Dagger', skill: 'fencing', hands: 1, minDamage: 3, maxDamage: 8, speed: 2.0, weight: 1, strReq: 0, reach: 1.5, damageType: 'physical', backstab: true },
  rapier: { id: 'rapier', name: 'Rapier', skill: 'fencing', hands: 1, minDamage: 6, maxDamage: 12, speed: 2.4, weight: 2, strReq: 15, reach: 1.5, damageType: 'physical' },
  spear: { id: 'spear', name: 'Spear', skill: 'fencing', hands: 2, minDamage: 10, maxDamage: 20, speed: 3.2, weight: 6, strReq: 35, reach: 3.0, damageType: 'physical' },
  shortsword: { id: 'shortsword', name: 'Shortsword', skill: 'swordsmanship', hands: 1, minDamage: 6, maxDamage: 12, speed: 2.5, weight: 3, strReq: 15, reach: 1.5, damageType: 'physical' },
  longsword: { id: 'longsword', name: 'Longsword', skill: 'swordsmanship', hands: 1, minDamage: 9, maxDamage: 16, speed: 3.0, weight: 4, strReq: 30, reach: 1.5, damageType: 'physical' },
  greatsword: { id: 'greatsword', name: 'Greatsword', skill: 'swordsmanship', hands: 2, minDamage: 16, maxDamage: 28, speed: 3.8, weight: 9, strReq: 60, reach: 1.5, damageType: 'physical', cleave: 2 },
  axe: { id: 'axe', name: 'Axe', skill: 'swordsmanship', hands: 1, minDamage: 8, maxDamage: 15, speed: 3.1, weight: 5, strReq: 30, reach: 1.5, damageType: 'physical', fellsTrees: 1 },
  battleaxe: { id: 'battleaxe', name: 'Battleaxe', skill: 'swordsmanship', hands: 2, minDamage: 15, maxDamage: 27, speed: 3.9, weight: 10, strReq: 60, reach: 1.5, damageType: 'physical', fellsTrees: 1.5 },
  mace: { id: 'mace', name: 'Mace', skill: 'macefighting', hands: 1, minDamage: 8, maxDamage: 14, speed: 3.0, weight: 5, strReq: 30, reach: 1.5, damageType: 'physical', stun: 0.08 },
  warhammer: { id: 'warhammer', name: 'Warhammer', skill: 'macefighting', hands: 2, minDamage: 14, maxDamage: 26, speed: 4.0, weight: 12, strReq: 65, reach: 1.5, damageType: 'physical', stun: 0.15 },
  maul: { id: 'maul', name: 'Maul', skill: 'macefighting', hands: 2, minDamage: 12, maxDamage: 24, speed: 3.6, weight: 9, strReq: 55, reach: 1.5, damageType: 'physical', armourPiercing: 0.2 },
  halberd: { id: 'halberd', name: 'Halberd', skill: 'polearms', hands: 2, minDamage: 14, maxDamage: 25, speed: 3.9, weight: 11, strReq: 60, reach: 3.5, damageType: 'physical', cleave: 3 },
  glaive: { id: 'glaive', name: 'Glaive', skill: 'polearms', hands: 2, minDamage: 12, maxDamage: 22, speed: 3.5, weight: 9, strReq: 50, reach: 3.5, damageType: 'physical' },
  quarterstaff: { id: 'quarterstaff', name: 'Quarterstaff', skill: 'macefighting', hands: 2, minDamage: 6, maxDamage: 12, speed: 2.6, weight: 3, strReq: 10, reach: 1.5, damageType: 'physical', casts: true },
  shortbow: { id: 'shortbow', name: 'Shortbow', skill: 'archery', hands: 2, minDamage: 7, maxDamage: 13, speed: 2.8, weight: 3, strReq: 15, range: 25, damageType: 'physical' },
  longbow: { id: 'longbow', name: 'Longbow', skill: 'archery', hands: 2, minDamage: 11, maxDamage: 19, speed: 3.4, weight: 5, strReq: 35, range: 35, damageType: 'physical' },
  crossbow: { id: 'crossbow', name: 'Crossbow', skill: 'marksmanship', hands: 2, minDamage: 14, maxDamage: 24, speed: 4.2, weight: 7, strReq: 30, range: 30, damageType: 'physical' },
  throwing_knives: { id: 'throwing_knives', name: 'Throwing Knives', skill: 'marksmanship', hands: 1, minDamage: 5, maxDamage: 9, speed: 1.8, weight: 1, strReq: 0, range: 12, damageType: 'physical' },
  fists: { id: 'fists', name: 'Fists', skill: 'wrestling', hands: 0, minDamage: 1, maxDamage: 4, speed: 2.2, weight: 0, strReq: 0, reach: 1.2, damageType: 'physical' },
};

export const WEAPON_IDS = Object.keys(WEAPONS);
export const WEAPON_COLUMNS = ['skill', 'hands', 'minDamage', 'maxDamage', 'speed', 'weight', 'strReq', 'damageType'];

// ------------------------------------------------------------------ rarity
// Colour is the whole language, so the hex is part of the rule, not a theme.
// `affixes` is how many roll; legendary's fifth is joined by a named power.
export const RARITY = {
  common: { id: 'common', label: 'Common', colour: '#ffffff', affixes: 0, weight: 70, crafted: 0.60 },
  uncommon: { id: 'uncommon', label: 'Uncommon', colour: '#1eff00', affixes: 1, weight: 20, crafted: 0.25 },
  rare: { id: 'rare', label: 'Rare', colour: '#0070dd', affixes: 2, weight: 7, crafted: 0.10 },
  epic: { id: 'epic', label: 'Epic', colour: '#a335ee', affixes: 3, weight: 2.4, crafted: 0.04 },
  mythic: { id: 'mythic', label: 'Mythic', colour: '#ffd100', affixes: 4, weight: 0.5, crafted: 0.009 },
  legendary: { id: 'legendary', label: 'Legendary', colour: '#ff8000', affixes: 5, weight: 0.1, crafted: 0.001, namedPower: true },
};
export const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'mythic', 'legendary'];
export const RARITY_COLUMNS = ['colour', 'affixes', 'weight', 'crafted'];
// The colour words the unidentified line uses ("a green longsword").
export const RARITY_WORD = { common: 'plain', uncommon: 'green', rare: 'blue', epic: 'purple', mythic: 'gold', legendary: 'orange' };

// ------------------------------------------------------- stacking materials
// "Items stack when identical and common (ingots, ore, wood, arrows, potions,
// food)." These are the stackable bases; they have no slot and no durability.
export const STACKS = [
  { id: 'ingot', name: 'Ingot', weight: 1 },
  { id: 'ore', name: 'Ore', weight: 1 },
  { id: 'log', name: 'Log', weight: 2 },
  { id: 'arrow', name: 'Arrow', weight: 0.1 },
  { id: 'bolt', name: 'Bolt', weight: 0.1 },
  { id: 'potion', name: 'Potion', weight: 0.5 },
  { id: 'food', name: 'Food', weight: 0.5 },
  { id: 'reagent', name: 'Reagent', weight: 0.1 },
  { id: 'gem', name: 'Gem', weight: 0.1 },
  { id: 'bandage', name: 'Bandage', weight: 0.1 },
];

const GEAR_DURABILITY = 100;

// ------------------------------------------------------------------- bases
// Every base in one map, keyed by id. `kinds` are the tags an affix's `kinds`
// list is matched against: 'equipment' is on everything you can wear or hold,
// which is how the "any slot" affixes find their homes.
export const BASES = {};

function addBase(b) {
  if (BASES[b.id]) throw new Error(`items: duplicate base id ${b.id}`);
  BASES[b.id] = b;
  return b;
}

for (const t of ARMOR_TIERS) {
  for (const p of ARMOR_PIECES) {
    const noun = PIECE_NOUNS[NOUN_BAND[t.id]][p.id];
    const kinds = ['equipment', 'armour', `armour_${t.id}`, ...PIECE_TAGS[p.id]];
    // A cloth chest is the robe every magic affix is looking for.
    if (t.id === 'cloth' && p.id === 'chest') kinds.push('robe');
    addBase({
      id: `${t.id}_${p.id}`, name: `${t.material} ${noun}`, kind: 'armour', kinds,
      slot: p.slot, piece: p.id, tier: t.tier, material: t.id,
      ar: t.ar * p.arMul, weight: t.weight, strReq: t.strReq,
      meditation: t.meditation, resist: { ...t.resist },
      durability: GEAR_DURABILITY, stack: false,
    });
  }
}

for (const w of Object.values(WEAPONS)) {
  const ranged = w.range != null;
  const kinds = ['equipment', 'weapon', ranged ? 'ranged' : 'melee'];
  if (w.skill === 'swordsmanship') kinds.push('blade');
  if (w.skill === 'macefighting') kinds.push('mace');
  if (w.skill === 'fencing') kinds.push('blade');
  if (w.skill === 'polearms') kinds.push('polearm');
  if (w.id === 'quarterstaff') kinds.push('staff');
  if (w.hands === 2) kinds.push('twohand'); else if (w.hands === 1) kinds.push('onehand');
  addBase({
    ...w, kind: 'weapon', kinds,
    // Fists are not an item you equip; they are what you have when nothing is held.
    // Bows, crossbows and thrown knives ride the ranged slot; everything else
    // goes to the main hand.
    slot: w.hands === 0 ? null : (ranged ? 'ranged' : 'mainHand'),
    durability: w.hands === 0 ? null : GEAR_DURABILITY, stack: false,
  });
}

for (const s of Object.values(SHIELDS)) {
  addBase({ ...s, kind: 'shield', kinds: ['equipment', 'shield'], slot: 'offHand', durability: GEAR_DURABILITY, stack: false });
}

addBase({ id: 'ring', name: 'Ring', kind: 'jewellery', kinds: ['equipment', 'ring'], slot: 'ring1', weight: 1, strReq: 0, durability: null, stack: false });
addBase({ id: 'amulet', name: 'Amulet', kind: 'jewellery', kinds: ['equipment', 'amulet'], slot: 'neck', weight: 1, strReq: 0, durability: null, stack: false });
addBase({ id: 'tome', name: 'Tome', kind: 'offhand', kinds: ['equipment', 'tome'], slot: 'offHand', weight: 3, strReq: 0, durability: GEAR_DURABILITY, stack: false });
addBase({ id: 'torch', name: 'Torch', kind: 'offhand', kinds: ['equipment', 'torch'], slot: 'offHand', weight: 1, strReq: 0, durability: null, stack: false });

for (const s of STACKS) {
  addBase({ ...s, kind: 'material', kinds: ['material'], slot: null, strReq: 0, durability: null, stack: true });
}
// The kit oddments 04-CLASSES-ABILITIES names and 03 never tabled, plus the
// hunting bag's goods and stone, which the old game carried and Masonry needs.
// Each is a real base so a kit, a migration and a vendor all go through
// makeItem; nothing is invented at the call site. KIT_BASES lists them.
export const KIT_BASES = [];
const kitBase = (b) => { KIT_BASES.push(b.id); return addBase(b); };
const tool = (id, name, weight, stack = false) => kitBase({
  id, name, kind: 'tool', kinds: ['tool'], slot: null, weight, strReq: 0,
  durability: stack ? null : GEAR_DURABILITY, stack,
});
tool('pickaxe', 'Pickaxe', 5);
tool('tongs', 'Tongs', 2);
tool('smith_hammer', 'Smith\'s Hammer', 3);
tool('lockpick', 'Lockpick', 0.1, true);
kitBase({ id: 'holy_book', name: 'Holy Book', kind: 'offhand', kinds: ['equipment', 'tome', 'holy'], slot: 'offHand', weight: 2, strReq: 0, durability: GEAR_DURABILITY, stack: false });
kitBase({ id: 'skull', name: 'Skull', kind: 'offhand', kinds: ['equipment', 'skull'], slot: 'offHand', weight: 1, strReq: 0, durability: null, stack: false });
kitBase({ id: 'lute', name: 'Lute', kind: 'instrument', kinds: ['equipment', 'instrument'], slot: 'offHand', weight: 2, strReq: 0, durability: GEAR_DURABILITY, stack: false });
// A bone staff is a quarterstaff in every number; a dark robe is a cloth robe;
// a leather apron is a leather tunic. Same rows, their own names and tags.
kitBase({ ...BASES.quarterstaff, id: 'bone_staff', name: 'Bone Staff', kinds: [...BASES.quarterstaff.kinds, 'bone'] });
kitBase({ ...BASES.cloth_chest, id: 'dark_robe', name: 'Dark Robe', kinds: [...BASES.cloth_chest.kinds, 'dark'] });
kitBase({ ...BASES.leather_chest, id: 'leather_apron', name: 'Leather Apron', kinds: [...BASES.leather_chest.kinds, 'apron'] });
for (const [id, name, weight] of [['reagent_pouch', 'Reagent Pouch', 0.5], ['stone', 'Stone', 1], ['venison', 'Venison', 0.5], ['game_meat', 'Game Meat', 0.5]]) {
  kitBase({ id, name, weight, kind: 'material', kinds: ['material'], slot: null, strReq: 0, durability: null, stack: true });
}


// --------------------------------------------------------------- accessors

/** The base record for an id, an item, or a base record. Null when unknown. */
export function baseFor(id) {
  if (!id) return null;
  if (typeof id === 'object') return baseFor(id.base || id.id);
  return BASES[id] || null;
}

/** Every slot this base could sit in, best first. Empty when it is not wearable. */
export function slotsFor(item) {
  const b = baseFor(item);
  if (!b || !b.slot) return [];
  return SLOT_ALTERNATES[b.slot] || [b.slot];
}

/** The slot an item goes to by default. Null for materials and fists. */
export function equipSlotFor(item) {
  return slotsFor(item)[0] || null;
}

/** A two handed weapon empties the offHand. */
export function twoHanded(item) {
  const b = baseFor(item);
  return !!b && b.kind === 'weapon' && b.hands === 2;
}

/** Stones. A stack weighs its count; nothing else does. */
export function weightOf(item) {
  const b = baseFor(item);
  if (!b) return 0;
  const n = b.stack ? (item && item.count != null ? item.count : 1) : 1;
  return b.weight * n;
}

/** Stack only when the base allows it, the item is common, and it carries no affixes. */
export function stackable(item) {
  const b = baseFor(item);
  if (!b || !b.stack) return false;
  if (!item) return true;
  if (item.rarity && item.rarity !== 'common') return false;
  if (item.affixes && item.affixes.length) return false;
  return true;
}

/**
 * Can this be worn or held, and at what cost.
 *
 * Armour above your STR is allowed: it protects half as well and slows the
 * swing by 10% for every 10 STR you are short, exactly as the document says,
 * and the reason is the sentence to show the player.
 *
 * A weapon or shield above your STR is refused. The document only grants the
 * wear-it-anyway rule to armour, and UO wins the arguments, so a warhammer you
 * cannot lift stays on the ground.
 */
export function canEquip(item, stats = {}) {
  const b = baseFor(item);
  const none = { arMul: 1, swingMul: 1 };
  if (!b) return { ok: false, penalty: none, reason: 'There is no such thing.' };
  if (!b.slot) return { ok: false, penalty: none, reason: `${b.name} is not something you equip.` };
  const str = stats.STR != null ? stats.STR : (stats.str != null ? stats.str : 0);
  const need = b.strReq || 0;
  if (str >= need) return { ok: true, penalty: none, reason: '' };
  const missing = need - str;
  if (b.kind === 'armour') {
    const swingMul = 1 + missing * 0.01;
    const slow = Math.round(missing * 100) / 100;
    return {
      ok: true,
      penalty: { arMul: 0.5, swingMul },
      reason: `The ${b.name} wants ${need} STR and you have ${str}. It guards half as well and your swing is ${slow}% slower.`,
    };
  }
  return { ok: false, penalty: none, reason: `The ${b.name} wants ${need} STR and you have ${str}. You cannot hold it steady.` };
}

/** AR a worn armour piece actually gives, after quality and the STR penalty. */
export function armourOf(item, stats = {}) {
  const b = baseFor(item);
  if (!b || b.ar == null) return 0;
  const { penalty } = canEquip(item, stats);
  return b.ar * (item.quality || 1) * penalty.arMul;
}

// ------------------------------------------------------------------ making

/**
 * Build the item record. Anything above common arrives unidentified with an
 * empty affix list; affixes.js rolls them from the seed when it is identified,
 * so the pack cannot be reloaded into a better sword.
 */
export function makeItem({ base, rarity = 'common', seed = 0, quality = 1, maker = null, count = 1, affixes = null } = {}) {
  const b = baseFor(base);
  if (!b) throw new Error(`makeItem: unknown base ${base}`);
  if (!RARITY[rarity]) throw new Error(`makeItem: unknown rarity ${rarity}`);
  const s = seed >>> 0;
  const item = {
    id: `${b.id}-${hash2(s, RARITY_ORDER.indexOf(rarity), 0x17e5).toString(36)}`,
    base: b.id,
    rarity,
    seed: s,
    identified: rarity === 'common',
    affixes: affixes || [],
    quality,
    durability: b.durability,
    maker,
  };
  if (b.stack) item.count = count;
  return item;
}

/** Sum of weightOf over a list, in stones. */
export const totalWeight = (items) => items.reduce((s, i) => s + weightOf(i), 0);

/** Every base of one armour tier, in piece order. */
export const setOf = (material) => ARMOR_PIECES.map((p) => BASES[`${material}_${p.id}`]);

// ------------------------------------------------------------------- audit

/**
 * Runs at load. Throws on anything that would ship a lie: a weapon whose skill
 * is not a combat skill, an armour tier missing a column, a base pointing at a
 * slot that does not exist, or a set whose totals no longer match the document.
 */
export function auditItems() {
  const bad = (m) => { throw new Error(`auditItems: ${m}`); };

  if (SLOTS.length !== 14) bad(`there are ${SLOTS.length} slots, the paper doll has 14`);
  if (new Set(SLOTS).size !== SLOTS.length) bad('two slots share a name');

  if (ARMOR_TIERS.length !== 6) bad(`there are ${ARMOR_TIERS.length} armour tiers, the table has 6`);
  for (const t of ARMOR_TIERS) {
    for (const col of TIER_COLUMNS) {
      if (t[col] === undefined || t[col] === null) bad(`armour tier ${t.id || t.tier} has no ${col}`);
    }
    for (const num of ['tier', 'ar', 'weight', 'strReq', 'meditation']) {
      if (typeof t[num] !== 'number' || !Number.isFinite(t[num])) bad(`armour tier ${t.id} has a ${num} that is not a number`);
    }
    if (typeof t.resist !== 'object' || Object.keys(t.resist).length === 0) bad(`armour tier ${t.id} carries no typed resist`);
  }

  if (ARMOR_PIECES.length !== 8) bad(`there are ${ARMOR_PIECES.length} armour pieces, a set has 8`);
  const doubled = ARMOR_PIECES.filter((p) => p.arMul === 2);
  if (doubled.length !== 1 || doubled[0].id !== 'chest') bad('the chest, and only the chest, doubles its AR');
  for (const p of ARMOR_PIECES) if (!SLOTS.includes(p.slot)) bad(`armour piece ${p.id} wants slot ${p.slot}, which is not a slot`);

  if (COMBAT_SKILLS.length !== 11) bad(`the skill table now has ${COMBAT_SKILLS.length} combat skills, the document lists 11`);
  const weaponIds = Object.keys(WEAPONS);
  if (weaponIds.length !== 19) bad(`there are ${weaponIds.length} weapons, the table has 19`);
  for (const w of Object.values(WEAPONS)) {
    for (const col of WEAPON_COLUMNS) {
      if (w[col] === undefined || w[col] === null) bad(`weapon ${w.id} has no ${col}`);
    }
    if (!COMBAT_SKILLS.includes(w.skill)) bad(`weapon ${w.id} trains ${w.skill}, which is not a combat skill`);
    if (!(w.minDamage < w.maxDamage)) bad(`weapon ${w.id} has min ${w.minDamage} and max ${w.maxDamage}`);
    if (!(w.speed > 0)) bad(`weapon ${w.id} swings in ${w.speed} s`);
    if (w.range == null && w.reach == null) bad(`weapon ${w.id} has neither reach nor range`);
  }

  if (Object.keys(SHIELDS).length !== 3) bad('there are three shields');
  for (const s of Object.values(SHIELDS)) {
    if (!(s.parryFactor > 0)) bad(`shield ${s.id} has no parryFactor`);
  }

  if (RARITY_ORDER.length !== 6) bad('there are six rarities');
  for (const id of RARITY_ORDER) {
    const r = RARITY[id];
    if (!r) bad(`rarity ${id} has no row`);
    for (const col of RARITY_COLUMNS) if (r[col] === undefined) bad(`rarity ${id} has no ${col}`);
    if (!/^#[0-9a-f]{6}$/i.test(r.colour)) bad(`rarity ${id} has colour ${r.colour}, which is not a hex`);
  }
  for (let i = 1; i < RARITY_ORDER.length; i++) {
    if (!(RARITY[RARITY_ORDER[i]].weight < RARITY[RARITY_ORDER[i - 1]].weight)) bad(`rarity ${RARITY_ORDER[i]} is not rarer than ${RARITY_ORDER[i - 1]}`);
  }

  for (const b of Object.values(BASES)) {
    if (b.slot !== null && !SLOTS.includes(b.slot)) bad(`base ${b.id} wants slot ${b.slot}, which is not a slot`);
    if (typeof b.weight !== 'number') bad(`base ${b.id} has no weight`);
    if (!Array.isArray(b.kinds) || !b.kinds.length) bad(`base ${b.id} carries no kind tags`);
    if (b.kind !== 'material' && b.kind !== 'tool' && !b.kinds.includes('equipment')) bad(`base ${b.id} is wearable but is not tagged equipment`);
  }

  // The two totals the document states out loud, counted from the tier table
  // AND from the bases built out of it, so a change to either is caught.
  const arMuls = ARMOR_PIECES.reduce((s, p) => s + p.arMul, 0);
  const total = (tierId, field) => {
    const t = ARMOR_TIERS.find((x) => x.id === tierId);
    const fromTable = field === 'ar' ? t.ar * arMuls : t.weight * ARMOR_PIECES.length;
    const fromBases = setOf(tierId).reduce((s, b) => s + b[field], 0);
    if (fromTable !== fromBases) bad(`the ${tierId} table says ${field} ${fromTable} and its bases say ${fromBases}`);
    return fromTable;
  };
  const plateAr = total('plate', 'ar');
  const plateWt = total('plate', 'weight');
  if (plateAr !== 108) bad(`full plate is AR ${plateAr}, the document says 108`);
  if (plateWt !== 72) bad(`full plate is ${plateWt} stones, the document says 72`);
  const clothAr = total('cloth', 'ar');
  const clothWt = total('cloth', 'weight');
  if (clothAr !== 9) bad(`full cloth is AR ${clothAr}, the document says 9`);
  if (clothWt !== 8) bad(`full cloth is ${clothWt} stones, the document says 8`);

  return true;
}

auditItems();
