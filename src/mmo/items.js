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
import { ORES, ALLOYS, METALS, WOODS } from './ores.js';

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

// ------------------------------------------------------- what rarity is FOR
//
// Rarity is the affix language and nothing else. "Six tiers. Colour is the
// whole language", and every row of that table is a count of affixes: uncommon
// one line, rare two, legendary five and a named power. A carrot has no line to
// carry, so a blue carrot is a colour with nothing behind it: it would glow in
// the sack, arrive unidentified, refuse to stack with the other carrots, and
// then identify into nothing at all. Four visible lies from one wrong field.
//
// So rarity applies to the six equipment kinds and to nothing else. This is the
// one predicate that says so, and it is exported first because `makeItem`,
// `rollAffixes`, `rollDrop`, the bag windows and the dev bench all ask it
// rather than each keeping their own list of what counts as gear.
export const RARITY_KINDS = ['weapon', 'shield', 'armour', 'jewellery', 'offhand', 'instrument'];
/** Everything else. Named out loud so the audit can prove the two sets cover all bases. */
export const NO_RARITY_KINDS = ['material', 'food', 'meal', 'potion', 'tool', 'ammunition'];

/**
 * Does rarity mean anything on this base? True only for gear.
 * Takes a base id, a base record or an item record. False for a thing that
 * is not a base at all, because a rarity on nothing is not a rarity.
 */
export function takesRarity(baseOrItem) {
  const b = baseFor(baseOrItem);
  if (!b) return false;
  return RARITY_KINDS.includes(b.kind);
}

// ------------------------------------------------------- stacking materials
// "Items stack when identical and common (ingots, ore, wood, arrows, potions,
// food)." These are the stackable bases; they have no slot and no durability.
//
// THERE IS NO STACK CALLED Ingot, Ore OR Log, for the same reason G7 left no
// stack called Food. A pack that reads "12 Log" cannot tell you whether you are
// carrying the oak a bow wants or the palm a bow does not, and `recipes.js` has
// asked for `oak`, `iron` and `starfall` BY NAME since the day it was written:
// with one grey `ingot` base carrying no `material` tag at all, every metal
// recipe in this game was unpayable and nobody had counted it. The named bases
// are built further down, out of `ores.js`, which is the one table that says
// what the metals and the woods are. The three old ids survive as aliases;
// see BASE_ALIASES.
export const STACKS = [
  { id: 'arrow', name: 'Arrow', weight: 0.1 },
  { id: 'bolt', name: 'Bolt', weight: 0.1 },
  { id: 'potion', name: 'Potion', weight: 0.5 },
  // There is no "Food" stack. A meal is a carrot, a loaf, a haunch of venison,
  // never the word food; see FOOD_BASES below.
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

// ------------------------------------------------- logs, ore and ingots
//
// The user's sentence, which is the brief:
//
//   "Wood and logs and ingots should be different types. Depending on the wood,
//    we get different types of wood because eventually we can craft different
//    types of furniture. Ore would be iron, copper, whatever we authored
//    already. Ingot should say what kind of ingot it is. Log should say Oak Log
//    or Sakura Log or Palm Log."
//
// Three families, and the SAME join in all three: the base carries
// `material: '<id>'`, where the id is the word `recipes.js` already asks for.
// `win_crafting.answersTo` reads a base's own `material`, so a recipe wanting
// `iron: 4` is paid out of a stack of Iron Ingots and one wanting `oak: 1` out
// of a stack of Oak Logs, with nothing to stamp at the call site. That is the
// join the hides and the forageables already use, held to here as well.
//
// Nothing is invented about WHICH metals and woods exist. `ores.js` is the
// table: ten ore tiers, the METALS ladder (every ore that forges something,
// plus the bronze alloy) and the four WOODS. The tree species come from
// `world/flora.js` ALL_KINDS, which grows eleven; `interact.js` holds the join
// from a felled tree's kind to its log and audits it both ways.

/** Every log base id, in the order they are built. */
export const LOG_BASES = [];
/** Every ore base id, tier 1 first. */
export const ORE_BASES = [];
/** Every ingot base id, tier order. */
export const INGOT_BASES = [];
/** material id -> log base id. 'oak' -> 'oak_log', 'dead' -> 'deadwood'. */
export const LOG_OF = {};
/** ores.js ore id -> ore base id. 'copper' -> 'copper_ore'. */
export const ORE_OF = {};
/** ores.js metal id -> ingot base id. 'iron' -> 'iron_ingot'. */
export const INGOT_OF = {};

/** A log weighs two stones. It always has; only its name is new. */
export const LOG_WEIGHT = 2;
/** Ore and ingots weigh one, as the generic stacks they replace did. */
export const ORE_WEIGHT = 1;
export const INGOT_WEIGHT = 1;

/**
 * A metal's ORE and its INGOT deliberately carry the same word. `iron_ore` and
 * `iron_ingot` are both `material: 'iron'`, so a recipe asking for `iron: 4` is
 * payable out of either, and a player who has mined but not smelted is not told
 * they have no iron while standing on twenty lumps of it. Nothing in
 * `recipes.js` smelts ore into an ingot today, so a rule that only ingots count
 * would leave every metal recipe unpayable, which is the state this change
 * found the game in. The uniqueness check below is therefore per family.
 */
const materialBase = (id, name, material, weight, tag, extra = {}) => addBase({
  id, name, kind: 'material', kinds: ['material', tag], slot: null,
  weight, strReq: 0, durability: null, stack: true, material, ...extra,
});

/**
 * The woods.
 *
 * `grown: true` means a tree of that kind really stands in the world and an axe
 * really fells it. The four `ores.js` WOODS that no forest grows (`ash`,
 * `heartwood`, `ironbark`; `oak` is both) are still bases, because bows, staves
 * and hafts are authored against them in `recipes.js` and a recipe that can
 * never be paid is worse than a log nothing drops. They are `grown: false`, and
 * `auditMaterialBases` counts them out loud rather than letting them look like
 * something you could go and chop.
 *
 * Deadwood and Cactus Wood are not "logs" in the sentence sense, so they are
 * not called one. Their material ids stay the flora kind (`dead`, `cactus`),
 * which is what `interact.js` reads off the field it felled.
 */
const logBase = (material, id, name, grown) => {
  LOG_BASES.push(id);
  LOG_OF[material] = id;
  return materialBase(id, name, material, LOG_WEIGHT, 'wood', { wood: true, grown });
};
// The eleven the forest grows, in flora.js WARM_ORDER's own order.
logBase('oak', 'oak_log', 'Oak Log', true);
logBase('birch', 'birch_log', 'Birch Log', true);
logBase('beech', 'beech_log', 'Beech Log', true);
logBase('fir', 'fir_log', 'Fir Log', true);
logBase('spruce', 'spruce_log', 'Spruce Log', true);
logBase('pine', 'pine_log', 'Pine Log', true);
logBase('sakura', 'sakura_log', 'Sakura Log', true);
logBase('willow', 'willow_log', 'Willow Log', true);
logBase('palm', 'palm_log', 'Palm Log', true);
logBase('dead', 'deadwood', 'Deadwood', true);
logBase('cactus', 'cactus_wood', 'Cactus Wood', true);
// The three ores.js woods with no tree of their own yet.
logBase('ash', 'ash_log', 'Ash Log', false);
logBase('heartwood', 'heartwood_log', 'Heartwood Log', false);
logBase('ironbark', 'ironbark_log', 'Ironbark Log', false);

// The ten veins. "Ore would be iron, copper, whatever we authored already":
// this IS what was authored already, read straight off the ladder.
for (const o of ORES) {
  const id = `${o.id}_ore`;
  ORE_BASES.push(id);
  ORE_OF[o.id] = id;
  materialBase(id, `${o.name} Ore`, o.id, ORE_WEIGHT, 'ore', { tier: o.tier });
}

// The ingots. `ores.js` METALS is the list of everything a smith can work: the
// nine ores that forge something, plus Bronze, which is an alloy and not a vein.
// Tin is deliberately not here, because ores.js says "tin alone forges nothing;
// it becomes bronze"; a recipe asking for tin is paid in Tin Ore.
for (const m of METALS) {
  const id = `${m.id}_ingot`;
  INGOT_BASES.push(id);
  INGOT_OF[m.id] = id;
  materialBase(id, `${m.name} Ingot`, m.id, INGOT_WEIGHT, 'metal', { tier: m.tier, alloy: !!ALLOYS[m.id] });
}

/**
 * The three ids this change removed, and what each one now means.
 *
 * A v1 save, an old sack, a dev bench and `win_crafting.giveMaterial` all still
 * say `log`, `ore` and `ingot`. None of them should throw, and none of them
 * should silently become nothing, so `baseFor` resolves them to a default and
 * warns ONCE per id, naming the file and line that asked. The warning is the
 * point: it is a list of the callers that still have to be taught the real id.
 */
export const BASE_ALIASES = { log: 'oak_log', ore: 'copper_ore', ingot: 'iron_ingot' };

const warnedAliases = new Set();
/** The first frame outside this file, for the warning. "unknown" when there is no stack. */
function callerOf() {
  const lines = String(new Error().stack || '').split('\n').slice(1);
  for (const l of lines) {
    if (/items\.js/.test(l)) continue;
    const m = l.match(/\(?([^()\s]+:\d+:\d+)\)?\s*$/);
    if (m) return m[1];
  }
  return 'unknown';
}
function aliasWarn(id) {
  if (warnedAliases.has(id)) return;
  warnedAliases.add(id);
  console.warn(`[items] "${id}" is no longer a base. It resolves to "${BASE_ALIASES[id]}"; `
    + `the caller at ${callerOf()} should name the material it means.`);
}
/** Which alias ids have actually been used this session. The test drives it both ways. */
export const aliasesUsed = () => [...warnedAliases];

/**
 * Every material family is complete, joined both ways, and nothing is a base
 * twice. Runs at load under `auditItems`, so a rename in ores.js that leaves a
 * recipe unpayable dies at import instead of in front of a smith.
 */
export function auditMaterialBases() {
  const bad = [];

  const check = (list, join, table, tag, weight, what) => {
    const seenMaterial = new Map();
    for (const id of list) {
      const b = BASES[id];
      if (!b) { bad.push(`${what} base "${id}" is not a base`); continue; }
      if (!b.stack) bad.push(`${id} does not stack, and a pile of ${what} has to`);
      if (b.kind !== 'material') bad.push(`${id} is kind "${b.kind}", not a material`);
      if (!b.kinds.includes(tag)) bad.push(`${id} is not tagged "${tag}"`);
      if (b.weight !== weight) bad.push(`${id} weighs ${b.weight}, and ${what} weighs ${weight}`);
      if (!b.material) bad.push(`${id} carries no material, so no recipe could ever find it`);
      if (join[b.material] !== id) bad.push(`${id} says material "${b.material}", which joins back to "${join[b.material]}"`);
      if (b.slot !== null) bad.push(`${id} wants slot ${b.slot}`);
      if (takesRarity(b)) bad.push(`${id} takes rarity, and there is no such thing as a purple ingot`);
      const twin = seenMaterial.get(b.material);
      // Two stacks answering to one word would make `countMaterial` count one
      // and spend the other, which is the quietest bug in a crafting system.
      if (twin) bad.push(`"${b.material}" is carried by both ${twin} and ${id}`);
      seenMaterial.set(b.material, id);
    }
    for (const row of table) {
      if (!join[row.id]) bad.push(`${what}: ores.js has "${row.id}" and nothing joins to it`);
    }
  };

  check(LOG_BASES, LOG_OF, WOODS, 'wood', LOG_WEIGHT, 'wood');
  check(ORE_BASES, ORE_OF, ORES, 'ore', ORE_WEIGHT, 'ore');
  check(INGOT_BASES, INGOT_OF, METALS, 'metal', INGOT_WEIGHT, 'metal');

  // Names say what the thing is. "Log" and "Ore" and "Ingot" on their own are
  // the words this change exists to remove, so they may not come back as a name.
  for (const id of [...LOG_BASES, ...ORE_BASES, ...INGOT_BASES]) {
    const n = BASES[id]?.name || '';
    if (/^(log|ore|ingot|wood)$/i.test(n)) bad.push(`${id} is named "${n}", which says nothing`);
  }
  for (const id of ORE_BASES) if (!/ Ore$/.test(BASES[id].name)) bad.push(`${BASES[id].name} does not say it is ore`);
  for (const id of INGOT_BASES) if (!/ Ingot$/.test(BASES[id].name)) bad.push(`${BASES[id].name} does not say it is an ingot`);

  // The aliases: each resolves to a real base, and none of them is a base
  // itself, or `addBase` would have thrown and `baseFor` would never reach the
  // alias table at all.
  for (const [from, to] of Object.entries(BASE_ALIASES)) {
    if (BASES[from]) bad.push(`"${from}" is still a base, so the alias is dead code`);
    if (!BASES[to]) bad.push(`the alias "${from}" points at "${to}", which is not a base`);
    // baseForQuiet, not baseFor: the warning fires once per id for ever, and an
    // audit that spent it at import would leave every real caller silent.
    if (baseForQuiet(from)?.id !== to) bad.push(`baseForQuiet("${from}") does not reach "${to}"`);
  }

  if (bad.length) throw new Error(`auditMaterialBases: ${bad.length} problem(s)\n  ${bad.join('\n  ')}`);
  return {
    logs: LOG_BASES.length,
    grown: LOG_BASES.filter((id) => BASES[id].grown).length,
    ores: ORE_BASES.length,
    ingots: INGOT_BASES.length,
    aliases: { ...BASE_ALIASES },
  };
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
for (const [id, name, weight] of [['reagent_pouch', 'Reagent Pouch', 0.5], ['stone', 'Stone', 1]]) {
  kitBase({ id, name, weight, kind: 'material', kinds: ['material'], slot: null, strReq: 0, durability: null, stack: true });
}
// venison and game_meat were kit materials here. They are food now, and they
// are built in the FOOD_BASES section below with the rest of the meat, keeping
// their ids so `state.js` GOOD_BASE and the hunting bag never notice.

// ------------------------------------------------------------ hides
// Skinning's materials, and the knife it wants.
//
// 03-ITEMS-LOOT.md: "Leather: hide (any beast), thick hide (bear, dire wolf),
// scaled hide (wyvern, drake), by Skinning skill." Three hides, and they are
// the same three things `ores.js` LEATHERS names and `recipes.js` asks for by
// id, so there is no fourth "tanned leather" between them: a tanning rack turns
// hide into a leather tunic, not into an intermediate this game never tabled.
//
// The ores.js ids are camel (`thickHide`); an items.js base id is snake
// (`thick_hide`), which is how every other multi word base here is written.
// `LEATHER_BASE` is the join, and each base carries the ores.js id in
// `material` so `win_crafting.js`'s `countMaterial` can find a stack. That
// function reads `item.material`, not the base's, so whoever MAKES the stack
// has to stamp it: `makeHide` in `src/game/skinning.js` is the one place that
// does, and its test proves the forge can then see the pile.
export const HIDE_BASES = [];
/** ores.js LEATHERS id -> items.js base id. */
export const LEATHER_BASE = { hide: 'hide', thickHide: 'thick_hide', scaledHide: 'scaled_hide' };
/** items.js base id -> ores.js LEATHERS id. The other direction, for the bag. */
export const LEATHER_MATERIAL = { hide: 'hide', thick_hide: 'thickHide', scaled_hide: 'scaledHide' };

const hideBase = (id, name, weight, material) => {
  HIDE_BASES.push(id);
  return addBase({
    id, name, kind: 'material', kinds: ['material', 'leather'], slot: null,
    weight, strReq: 0, durability: null, stack: true, material,
  });
};
// Weights: a hide is two stones, and the two heavier ones three. A log is two
// and a bear's hide is not lighter than a log.
hideBase('hide', 'Hide', 2, 'hide');
hideBase('thick_hide', 'Thick Hide', 3, 'thickHide');
hideBase('scaled_hide', 'Scaled Hide', 3, 'scaledHide');
// A dagger skins as well as this does; this is the tool that does nothing else.
tool('skinning_knife', 'Skinning Knife', 1);

/** Every hide base is real, joined both ways, and stacks. Called by auditItems. */
export function auditHides() {
  const bad = (m) => { throw new Error(`auditHides: ${m}`); };
  if (HIDE_BASES.length !== 3) bad(`there are ${HIDE_BASES.length} hides, 03-ITEMS-LOOT names three`);
  for (const [oresId, baseId] of Object.entries(LEATHER_BASE)) {
    const b = BASES[baseId];
    if (!b) bad(`the leather ${oresId} joins to "${baseId}", which is not a base`);
    if (!b.stack) bad(`${baseId} does not stack, and a pile of hides has to`);
    if (b.material !== oresId) bad(`${baseId} carries material "${b.material}", not "${oresId}"`);
    if (LEATHER_MATERIAL[baseId] !== oresId) bad(`the join back from ${baseId} says "${LEATHER_MATERIAL[baseId]}"`);
  }
  if (!BASES.skinning_knife) bad('there is no skinning knife');
  return true;
}

// -------------------------------------------------------------------- food
//
// There is no item called Food. "Food" is a shelf, not a thing you eat, and a
// stack labelled Food in a pack is the same failure as a modifier nobody reads:
// it looks like content and it says nothing. Every edible here is a specific
// edible with its own name, its own weight and its own effect.
//
// Two families:
//
//   PANTRY. What a Provisioner sells and a farm grows: apple, carrot, turnip,
//   onion, cabbage, bread, cheese, egg, fish, mutton. These do not drop from
//   anything; they are bought, grown or cooked.
//
//   MEAT. What comes off a beast, one kind per beast. `loot_drops.js` maps a
//   monster's `meat` word to the meat of THAT monster: a giant rat gives rat
//   meat, a wolf gives wolf meat, a bear gives bear meat. Nothing gives "meat".
//
// Every one of them carries a `use` in the shape `src/game/foraging.js`
// `useItem` already reads, `{ heal: [lo, hi], seconds }`, so eating one really
// heals: the same field and the same single consumer as the forageables, not a
// second parallel system. Raw meat heals slowly and less than the cooked dish
// it becomes, which is what a kitchen is for.
//
// Weights are 0.3 to 0.5 stones: a carrot is lighter than a haunch, and twenty
// of anything here is a real part of a pack that a longsword is four stones of.
//
// `material` is the word a recipe asks for. Every meat carries `material:
// 'meat'` so the six kitchen recipes in `recipes.js` that ask for `meat: 2` can
// be paid in rat meat or venison; `fish` and the pantry rows carry their own id.
// See docs/mmo/wiring/G7.md for the one line `win_crafting.countMaterial` needs
// in order to look at a base's material as well as an item's.

/** Every food base id, pantry first then meat. */
export const FOOD_BASES = [];
/** The meats, in the order a beast gets bigger. `loot_drops.js` maps onto these. */
export const MEAT_BASES = [];
/** The six cooked dishes `recipes.js` MEALS names. Kitchen output, not loot. */
export const MEAL_BASES = [];

const foodBase = (id, name, weight, heal, seconds, extra = {}) => {
  FOOD_BASES.push(id);
  return addBase({
    id, name, kind: 'food', kinds: ['food', extra.meat ? 'meat' : 'pantry'],
    slot: null, weight, strReq: 0, durability: null, stack: true,
    material: extra.material || id,
    use: { heal, seconds },
  });
};

// --- the pantry. Bought, grown, baked.
foodBase('apple', 'Apple', 0.3, [4, 8], 8);
foodBase('carrot', 'Carrot', 0.3, [3, 7], 8);
foodBase('turnip', 'Turnip', 0.3, [3, 7], 8);
foodBase('onion', 'Onion', 0.3, [2, 6], 8);
foodBase('cabbage', 'Cabbage', 0.4, [4, 9], 10);
foodBase('bread', 'Bread', 0.4, [8, 14], 12);
foodBase('cheese', 'Cheese', 0.4, [8, 14], 12);
foodBase('egg', 'Egg', 0.3, [5, 10], 10);
foodBase('fish', 'Fish', 0.5, [6, 12], 10);
foodBase('mutton', 'Mutton', 0.5, [10, 18], 14);

// --- the meat. One kind per beast; see MEAT_OF in loot_drops.js for the join.
const meatBase = (id, name, weight, heal, seconds) => {
  MEAT_BASES.push(id);
  return foodBase(id, name, weight, heal, seconds, { meat: true, material: 'meat' });
};
meatBase('rat_meat', 'Rat Meat', 0.3, [3, 6], 10);
// The old game's two words, kept exactly: state.js GOOD_BASE, the hunting bag
// and combat.js's LOOT table all name these two ids. `game_meat` is what a
// rabbit, a squirrel, a gull, a crow, a frog and a bat all leave, so it stays
// Game Meat and is not renamed after any one of them.
meatBase('game_meat', 'Game Meat', 0.5, [6, 12], 12);
meatBase('crab_meat', 'Crab Meat', 0.4, [6, 12], 10);
meatBase('venison', 'Venison', 0.5, [10, 18], 14);
meatBase('wolf_meat', 'Wolf Meat', 0.5, [8, 15], 12);
meatBase('boar_meat', 'Boar Meat', 0.5, [10, 18], 14);
meatBase('bear_meat', 'Bear Meat', 0.5, [12, 20], 14);

// --- the six cooked meals `recipes.js` MEALS authors.
//
// They existed as recipes with nowhere to land: `win_crafting.resultBaseFor`
// fell through to the generic `food` stack, so all six cooked into one grey
// word. Each is its own dish now, with the buff its recipe card promises, in
// the plain effect block `actor.recompute` sums and `foraging.useItem` applies.
// `MEAL_SECONDS` is shared with the forage kitchen further down this file, so
// one dish never outlasts another for no reason.
const AUTHORED_MEAL_SECONDS = 300;
const mealBase = (id, name, effect, line) => {
  MEAL_BASES.push(id);
  return addBase({
    id, name, kind: 'meal', kinds: ['food', 'meal'], slot: null,
    weight: 0.5, strReq: 0, durability: null, stack: true, material: id,
    use: { buff: { name, seconds: AUTHORED_MEAL_SECONDS, effect }, line },
  });
};
mealBase('hearty_stew', 'Hearty stew', { stats: { str: 5 } }, 'you feel like lifting something');
mealBase('roast_fowl', 'Roast fowl', { stats: { dex: 5 } }, 'your hands are steady');
mealBase('fish_pie', 'Fish pie', { stats: { int: 5 } }, 'the fog lifts a little');
mealBase('honey_bread', 'Honey bread', { stats: { con: 5 } }, 'you could take a knock');
mealBase('spiced_wine', 'Spiced wine', { stats: { wis: 5 } }, 'things arrange themselves');
mealBase('travellers_ration', "Traveller's ration", { bonuses: { carry: 20 } }, 'packed to be carried, and it carries');

/**
 * Every food is a specific food, stacks, weighs what food weighs, and really
 * does something when it is eaten. Runs at load under auditItems.
 *
 * The first check is the user's sentence, held as code: no base in this game is
 * called food, and none of them is named Food.
 */
export function auditFoodBases() {
  const bad = [];
  if (BASES.food) bad.push('there is a base called "food"; a food is a carrot or a loaf, never the word');
  for (const id of [...FOOD_BASES, ...MEAL_BASES]) {
    const b = BASES[id];
    if (!b) { bad.push(`food base "${id}" is not a base`); continue; }
    if (/^food$/i.test(b.name)) bad.push(`${id} is named "${b.name}"`);
    if (!b.stack) bad.push(`${id} does not stack, and a bag of them has to`);
    if (b.slot !== null) bad.push(`${id} wants slot ${b.slot}, and you do not wear a turnip`);
    if (!(b.weight >= 0.3 && b.weight <= 0.5)) bad.push(`${id} weighs ${b.weight}, and food is 0.3 to 0.5`);
    if (takesRarity(b)) bad.push(`${id} takes rarity, and there is no such thing as a blue carrot`);
    if (!b.use || typeof b.use !== 'object') bad.push(`${id} has no use, so eating it would be silent`);
  }
  // A raw food heals over time. A cooked meal buffs. Both directions checked,
  // so a meal that heals nothing and buffs nothing cannot ship.
  for (const id of FOOD_BASES) {
    const u = BASES[id]?.use || {};
    if (!Array.isArray(u.heal) || u.heal.length !== 2) bad.push(`${id} is raw food and heals nothing`);
    else if (!(u.heal[0] > 0 && u.heal[1] >= u.heal[0])) bad.push(`${id} heals ${u.heal.join(' to ')}`);
    if (!(u.seconds > 0)) bad.push(`${id} heals over ${u.seconds} seconds`);
  }
  for (const id of MEAL_BASES) {
    const u = BASES[id]?.use || {};
    if (!u.buff || !u.buff.effect) bad.push(`${id} grants a buff with no effect, which is decoration`);
    if (!(u.buff?.seconds > 0)) bad.push(`${id} grants a buff that lasts ${u.buff?.seconds} s`);
  }
  for (const id of MEAT_BASES) {
    if (BASES[id]?.material !== 'meat') bad.push(`${id} carries material "${BASES[id]?.material}", so a recipe asking for meat could never find it`);
  }
  if (bad.length) throw new Error(`auditFoodBases: ${bad.length} problem(s)\n  ${bad.join('\n  ')}`);
  return { foods: FOOD_BASES.length, meats: MEAT_BASES.length, meals: MEAL_BASES.length };
}


// --------------------------------------------------------------- accessors

/**
 * The base record for an id, an item, or a base record. Null when unknown.
 *
 * `log`, `ore` and `ingot` are not bases any more. They resolve here, to the
 * default in BASE_ALIASES, with one warning per id naming the caller: a v1
 * save, an old sack on the ground and a dev bench that still says `ingot` all
 * keep working, and the console says exactly which line has to be taught the
 * real material. The lookup is a plain miss first, so nothing that names a real
 * base pays for this.
 */
export function baseFor(id) {
  if (!id) return null;
  if (typeof id === 'object') return baseFor(id.base || id.id);
  const b = BASES[id];
  if (b) return b;
  const alias = BASE_ALIASES[id];
  if (alias) { aliasWarn(id); return BASES[alias] || null; }
  return null;
}

/**
 * The same lookup with the warning switched off, for audits and for a test that
 * wants to prove the join without spending the one warning the real path owes
 * its caller.
 */
export function baseForQuiet(id) {
  if (!id) return null;
  if (typeof id === 'object') return baseForQuiet(id.base || id.id);
  return BASES[id] || BASES[BASE_ALIASES[id]] || null;
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
 *
 * A base that does not take rarity comes out common, identified and without
 * affixes WHATEVER is asked for. This is a coercion and not a throw on purpose:
 * `rollDrop` picks a rarity before it knows which base it drew, a save from
 * before this rule can hold a green apple, and the dev bench lets you type
 * anything. All three should end at one carrot, not at an exception.
 */
export function makeItem({ base, rarity = 'common', seed = 0, quality = 1, maker = null, count = 1, affixes = null } = {}) {
  const b = baseFor(base);
  if (!b) throw new Error(`makeItem: unknown base ${base}`);
  if (!RARITY[rarity]) throw new Error(`makeItem: unknown rarity ${rarity}`);
  const gear = takesRarity(b);
  const r = gear ? rarity : 'common';
  const s = seed >>> 0;
  const item = {
    id: `${b.id}-${hash2(s, RARITY_ORDER.indexOf(r), 0x17e5).toString(36)}`,
    base: b.id,
    rarity: r,
    seed: s,
    identified: r === 'common',
    affixes: gear ? (affixes || []) : [],
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
 *
 * `items` is an optional list of item RECORDS to hold to the rarity rule as
 * well. The tables cannot catch a rare carrot on their own, because a base
 * carries no rarity; a save, a loot roll or a dev bench can make one, and this
 * is where such a thing is caught. `loot.test.mjs` hands it ten thousand rolled
 * drops and `items.test.mjs` hands it one planted rare carrot.
 */
export function auditItems(items = []) {
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
    // Every kind is on exactly one side of the rarity line, so a seventh kind
    // added tomorrow has to declare which side it is on rather than defaulting
    // quietly to "no rarity" and losing its affixes.
    if (!RARITY_KINDS.includes(b.kind) && !NO_RARITY_KINDS.includes(b.kind)) {
      bad(`base ${b.id} is kind "${b.kind}", which is in neither RARITY_KINDS nor NO_RARITY_KINDS`);
    }
    if (takesRarity(b) && !b.kinds.includes('equipment')) bad(`base ${b.id} is wearable but is not tagged equipment`);
    // A base is a table row and never an item, so it may not carry either of
    // the two fields that only an item has. This is how a rarity field pasted
    // onto a base by a future edit dies at import instead of in a sack.
    if (!takesRarity(b)) {
      if (b.affixes !== undefined) bad(`base ${b.id} carries an affixes list, and rarity does not apply to a ${b.kind}`);
      if (b.rarity !== undefined && b.rarity !== 'common') bad(`base ${b.id} carries rarity "${b.rarity}", and rarity does not apply to a ${b.kind}`);
    }
  }

  // The item records the caller handed over, held to the same rule.
  for (const it of items || []) {
    if (!it) continue;
    const b = baseFor(it);
    if (!b) bad(`an item names base "${it.base}", which is not a base`);
    if (takesRarity(b)) continue;
    if (it.rarity && it.rarity !== 'common') bad(`a ${b.id} is ${it.rarity}; rarity does not apply to a ${b.kind}`);
    if (Array.isArray(it.affixes) && it.affixes.length) bad(`a ${b.id} carries ${it.affixes.length} affix(es); rarity does not apply to a ${b.kind}`);
    if (it.identified === false) bad(`a ${b.id} arrived unidentified, and there is nothing about it to find out`);
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
  auditHides();

  const clothAr = total('cloth', 'ar');
  const clothWt = total('cloth', 'weight');
  if (clothAr !== 9) bad(`full cloth is AR ${clothAr}, the document says 9`);
  if (clothWt !== 8) bad(`full cloth is ${clothWt} stones, the document says 8`);

  // The material report hangs off the function rather than off its return
  // value, because `loot.test.mjs` and `loot_drops.test.mjs` both assert
  // `auditItems(...) === true` and neither of them is this agent's to change.
  // `auditItems.materials.aliases` is where the three dead ids are listed.
  auditItems.materials = auditMaterialBases();
  return true;
}

// ------------------------------------------------------------------- forage
//
// What `src/world/forage.js` grows and `src/game/foraging.js` picks, plus what
// a kitchen and an alchemy table make out of it.
//
// SOURCE OF TRUTH for the ids: the FORAGE table in `src/world/forage.js`. This
// file does not import it, because `src/mmo` must stay loadable without THREE
// and forage.js draws geometry. `forage.test.mjs` proves the two lists are the
// same set in both directions, so a twenty third mushroom cannot ship without a
// base and a base cannot ship with nothing growing it.
//
// Three rules held here that the rest of the codebase already relies on:
//
//   * `material` equals the base id, so `win_crafting.countMaterial` finds a
//     pile of chanterelles by the same word the recipe asks for. That is the
//     join `skinning.js` had to be told about the hard way.
//   * everything stacks, at 0.1 stones. Twenty chanterelles are two stones,
//     which is a fifth of a hide and about right for a bag of mushrooms.
//   * a `use` block is the ONLY thing that says what eating it does, and
//     `src/game/foraging.js` `useItem` is the only thing that reads one. A
//     third `raw effect` field written by nobody is exactly the decoration this
//     project has been burned by, so there is one field and one consumer.
//
// `use` shapes, all of them:
//   { heal: [min, max], seconds }     heals that much spread over that long
//   { poison: level }                 combat.js poison at that level
//   { cure: 'poison' }                takes the status off
//   { restore: 'mana'|'stamina', amount: [min, max] }
//   { buff: { name, seconds, effect } }  effect is actor.js's plain block
//   { nothing: 'why' }                edible in the sense that it will not kill
//                                     you, and says so rather than staying mute

/** Every forage base id, in the order forage.js grows them. */
export const FORAGE_BASES = [];
/** The meals and potions the forage recipes make. */
export const FORAGE_PRODUCT_BASES = [];
/** id -> 'edible' | 'toxic' | 'caution'. What the hover line and the pickup say. */
export const FORAGE_TAG = {};

const FORAGE_HEAL = [3, 8];        // a raw edible, over ten seconds
const FORAGE_HEAL_SECONDS = 10;
const RAW_POISON_LEVEL = 1;        // a raw toxic. poisonTick(1) is 6 s at 2 a second.

/**
 * Raw forage. Edible heals a little over ten seconds, toxic poisons at level
 * one, caution does nothing and says why, which is the difference between a
 * nettle (it stings, cook it) and a fly agaric (it will hurt you).
 */
const rawUse = (tag, name) => {
  if (tag === 'toxic') return { poison: RAW_POISON_LEVEL };
  if (tag === 'caution') return { nothing: `raw ${name.toLowerCase()} does nothing for you, and the cook knows what to do with it` };
  return { heal: FORAGE_HEAL, seconds: FORAGE_HEAL_SECONDS };
};

const forageBase = (id, name, tag) => {
  FORAGE_BASES.push(id);
  FORAGE_TAG[id] = tag;
  return addBase({
    id, name, kind: 'material', kinds: ['material', 'forage', tag], slot: null,
    weight: 0.1, strReq: 0, durability: null, stack: true,
    material: id, forage: true, tag, use: rawUse(tag, name),
  });
};

// The twenty two, in forage.js's order.
forageBase('chanterelle', 'Chanterelle', 'edible');
forageBase('porcini', 'Porcini', 'edible');
forageBase('fly_agaric', 'Fly agaric', 'toxic');
forageBase('morel', 'Morel', 'edible');
forageBase('oyster_mushroom', 'Oyster mushroom', 'edible');
forageBase('honey', 'Wild honey', 'edible');
forageBase('blueberry', 'Blueberry', 'edible');
forageBase('lingonberry', 'Lingonberry', 'edible');
forageBase('blackberry', 'Blackberry', 'edible');
forageBase('raspberry', 'Raspberry', 'edible');
forageBase('wild_strawberry', 'Wild strawberry', 'edible');
forageBase('elderberry', 'Elderberry', 'caution');
forageBase('rosehip', 'Rosehip', 'edible');
forageBase('hazelnut', 'Hazelnut', 'edible');
forageBase('wild_garlic', 'Wild garlic', 'edible');
forageBase('nettle', 'Nettle', 'caution');
forageBase('fiddlehead', 'Fiddlehead fern', 'edible');
forageBase('nut', 'Chestnuts', 'edible');
forageBase('dandelion', 'Dandelion', 'edible');
forageBase('fig', 'Wild figs', 'edible');
forageBase('wild_ginger', 'Wild ginger', 'edible');
forageBase('cacao', 'Cacao pods', 'edible');

/** A cooked dish or a drawn potion. Half a stone, stacks, and says what it does. */
const productBase = (id, name, tags, use) => {
  FORAGE_PRODUCT_BASES.push(id);
  return addBase({
    id, name, kind: 'material', kinds: ['material', ...tags], slot: null,
    weight: 0.5, strReq: 0, durability: null, stack: true,
    material: id, use,
  });
};

/** A meal's buff, in actor.js's plain effect block. Five minutes, near a game day. */
export const MEAL_SECONDS = 300;
const meal = (id, name, effect, line) => productBase(id, name, ['food', 'meal'], {
  buff: { name, seconds: MEAL_SECONDS, effect }, line,
});

// The four buffs the forage kitchen grants, each a real field recompute() sums:
//   staminaRegen and healthRegen are per second, on top of the derived rate
//   resists.cold is percent, capped at RESIST_CAP with everything else
//   bonuses.carry is stones, and actor.carry already folds it in
meal('mushroom_stew', 'Mushroom stew', { regen: { staminaRegen: 2 } }, 'your legs come back under you');
meal('berry_preserve', 'Berry preserve', { regen: { healthRegen: 1.5 } }, 'the ache goes out of you');
meal('nut_bread', 'Nut bread', { bonuses: { carry: 25 } }, 'you could shoulder more than you came with');
meal('herb_salad', 'Herb salad', { regen: { staminaRegen: 1.2 }, stats: { dex: 3 } }, 'you feel light');
meal('roast_chestnuts', 'Roast chestnuts', { resists: { cold: 12 } }, 'the cold has further to travel');
meal('honey_cake', 'Honey cake', { regen: { healthRegen: 2.2 } }, 'sweet enough to mend you');
meal('forest_broth', 'Forest broth', { resists: { cold: 9 }, regen: { healthRegen: 0.6 } }, 'it warms all the way down');
meal('rosehip_tea', 'Rosehip tea', { regen: { healthRegen: 1.1 }, resists: { poison: 8 } }, 'sharp and clean');
meal('strawberry_tart', 'Strawberry tart', { regen: { staminaRegen: 1.6 } }, 'you want to be walking');
meal('fig_and_honey', 'Figs in honey', { bonuses: { carry: 18 }, regen: { staminaRegen: 0.8 } }, 'heavy food for a long road');
meal('ginger_broth', 'Ginger broth', { resists: { cold: 15 } }, 'the heat sits in your chest');
meal('bramble_jelly', 'Bramble jelly', { regen: { healthRegen: 1.3 } }, 'dark and slow');
meal('lingon_relish', 'Lingonberry relish', { resists: { cold: 10 }, stats: { con: 2 } }, 'sour, and it holds');
meal('oyster_grill', 'Grilled oyster mushrooms', { regen: { staminaRegen: 1.8 } }, 'you could go again');
meal('cacao_bar', 'Cacao bar', { regen: { staminaRegen: 2.4 }, stats: { dex: 2 } }, 'your hands are quick');

const potion = (id, name, use) => productBase(id, name, ['potion', 'alchemy'], use);
potion('healing_draught', 'Healing draught', { heal: [25, 40], seconds: 0 });
potion('antidote', 'Antidote', { cure: 'poison' });
potion('nightsight_draught', 'Draught of nightsight', {
  buff: { name: 'Nightsight', seconds: 600, effect: { bonuses: { nightSight: 1 } } },
  line: 'the dark thins out',
});
// A poison is a poison. 03 has no blade coating and nothing in this game applies
// one, so this does what a poison does to whoever opens it: see G6.md.
potion('woodland_poison', 'Woodland poison', { poison: 2 });
potion('mana_tonic', 'Mana tonic', { restore: 'mana', amount: [30, 50] });
potion('dandelion_tonic', 'Dandelion tonic', { restore: 'stamina', amount: [30, 50] });
potion('draught_of_vigour', 'Draught of vigour', {
  buff: { name: 'Vigour', seconds: 300, effect: { stats: { str: 5 } } },
  line: 'your arms feel longer',
});

/**
 * Every forage base is real, stacks, joins to itself, and carries exactly one
 * `use`. Every product a recipe can make has a base to make it into. Called at
 * load, below auditItems, so a bad edit dies at import.
 */
export function auditForageBases() {
  const bad = [];
  if (FORAGE_BASES.length !== 22) bad.push(`there are ${FORAGE_BASES.length} forage bases, forage.js grows 22`);
  const tags = ['edible', 'toxic', 'caution'];
  for (const id of FORAGE_BASES) {
    const b = BASES[id];
    if (!b) { bad.push(`forage base "${id}" is not a base`); continue; }
    if (!b.stack) bad.push(`${id} does not stack, and a bag of berries has to`);
    if (b.material !== id) bad.push(`${id} carries material "${b.material}", so a recipe asking for "${id}" would find nothing`);
    if (b.weight !== 0.1) bad.push(`${id} weighs ${b.weight}, and forage is 0.1`);
    if (!tags.includes(b.tag)) bad.push(`${id} is tagged "${b.tag}"`);
    if (!b.use || typeof b.use !== 'object') bad.push(`${id} has no use, so eating it would be silent`);
    const keys = Object.keys(b.use || {});
    if (keys.length === 0) bad.push(`${id} has an empty use block`);
    if (b.tag === 'toxic' && !(b.use.poison > 0)) bad.push(`${id} is toxic and does not poison anyone`);
    if (b.tag === 'edible' && !Array.isArray(b.use.heal)) bad.push(`${id} is edible and heals nothing`);
    if (b.tag === 'caution' && !b.use.nothing) bad.push(`${id} says nothing about why it is a caution`);
  }
  for (const id of FORAGE_PRODUCT_BASES) {
    const b = BASES[id];
    if (!b) { bad.push(`product base "${id}" is not a base`); continue; }
    if (!b.stack) bad.push(`${id} does not stack`);
    if (!b.use) bad.push(`${id} does nothing when you use it`);
    if (b.use && b.use.buff && !(b.use.buff.seconds > 0)) bad.push(`${id} grants a buff that lasts ${b.use.buff.seconds} s`);
    if (b.use && b.use.buff && !b.use.buff.effect) bad.push(`${id} grants a buff with no effect, which is decoration`);
  }
  // One case is never the case: all three tags are really used, or the pickup
  // line for one of them is a branch no forageable can reach.
  for (const t of tags) {
    if (!FORAGE_BASES.some((id) => BASES[id].tag === t)) bad.push(`no forageable is tagged ${t}`);
  }
  if (bad.length) throw new Error(`auditForageBases: ${bad.length} problem(s)\n  ${bad.join('\n  ')}`);
  return {
    forage: FORAGE_BASES.length,
    products: FORAGE_PRODUCT_BASES.length,
    byTag: Object.fromEntries(tags.map((t) => [t, FORAGE_BASES.filter((id) => BASES[id].tag === t).length])),
  };
}


auditItems();
auditFoodBases();
auditForageBases();
