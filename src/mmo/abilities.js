import {pacedCastTime} from './combat_pace.js';
// Brackenwake: every ability and spell, as data and rules.
//
// Pure. No THREE, no DOM, no imports. Node-testable.
// Source of truth: docs/mmo/04-CLASSES-ABILITIES.md.
//
// SKILL IDS ARE HARDCODED HERE ON PURPOSE. `src/mmo/skills.js` is the source
// of truth and is being written concurrently by another hand; this module must
// not import it. KNOWN_SKILLS below mirrors the display names in
// docs/mmo/01-STATS-SKILLS.md, and abilities.test.mjs reads that document and
// fails if any id here has no matching row.
//
// TIME. `cooldown`, `castTime` and every duration are in SECONDS, exactly as
// the document writes them, and `now` in canUse/startCast/interruptRule is a
// time in seconds on the same clock. Nothing here is in milliseconds.
//
// ---------------------------------------------------------------------------
// EFFECT KINDS
// ---------------------------------------------------------------------------
// An `effect` is structured data the combat layer interprets. It is either one
// of the records below, or `{ kind: 'combo', parts: [ ...records ] }` when the
// document's row does more than one thing. The twenty six kinds:
//
//   damageMult   { value, nextSwing?, hitBonus?, ignoreARFraction?,
//                  pierceTargets?, shots?, requires? }
//                a weapon swing multiplied. `nextSwing` means it replaces the
//                next swing rather than firing on its own.
//   aoe          { radius, arcDegrees?, damageMult?, spellDamage?, delay?,
//                  telegraph? }  everything inside a shape is hit.
//   spellDamage  { min, max, type, line?, vs? }  a direct spell roll, before
//                the spell damage formula. `type` is null where the document
//                does not name one.
//   heal         { base?, perSkill?, skill?, toFull?, once? }
//   dot          { perSecond, duration, type }
//   leech        { fraction, of }  a share of damage dealt returned.
//   control      { effect, duration, radius?, magnitude?, chance?, targets?,
//                  affects?, breakOnDamage?, dropsAggro? }
//                effect is one of: stun root slow sleep fear silence disarm
//                pacify provoke pull.
//   move         { mode, distance?, height?, direction? }
//                mode is one of: leap dash blink shadowstep jump.
//   knockback    { distance }
//   buff         { mods?, stats?, duration, radius?, targets?, form?,
//                  channelled? }  targets: self selfAndAllies allies.
//   debuff       { mods, duration }
//   summon       { creature, duration, durationPerSkill?, skill?, source?,
//                  traits?, scalesWithCaster? }
//   absorb       { source, ratio, duration }  damage taken off another pool.
//   zone         { kind, radius, duration, applies, triggers? }
//                kind is one of: trap ward sanctuary rift.
//   cure         { removes, curses? }
//   resurrect    { }
//   stealth      { instant?, dropAggro?, requiresStill?, inCombat?,
//                  movementNeedsSkill? }
//   weaponEnchant{ damageType, duration?, hits?, vs?, mult?, levelPerSkill?,
//                  skill? }
//   passiveMod   { mods, tiers? }  always on; `tiers` raise it at a skill mark.
//   utility      { action, ... }  action is one of: transmute steal meditate
//                camp.
//   chain        { targets, falloff }
//   corpseBurst  { searchRange, min, max, radius }
//   plague       { initial, type, onSpellHit }
//   mark         { damageTakenMult, duration, fromCasterOnly, preventsHide? }
//   bandage      { seconds, perHealing, perAnatomy, curePoisonAt, resurrectAt,
//                  interruptedByDamage }
//   combo        { parts }
//
// ---------------------------------------------------------------------------
// WHERE THE DOCUMENT AND THIS TABLE DIVERGE (see DOC_CONFLICTS and DOC_GAPS)
// ---------------------------------------------------------------------------
// The casting rule once said "castTime > 0 roots you", while six rows carried a
// short cast and "moving: yes". The table was right: small spells travel and
// the big ones root you, which is the whole point of having both. The rule in
// the document now says so, and MOVING_CASTS lists the six for the tests.

// ---------------------------------------------------------------------------
// Skills and stats (local mirror; skills.js and stats.js are the sources)
// ---------------------------------------------------------------------------

/** Every skill in docs/mmo/01-STATS-SKILLS.md, id -> display name. */
export const KNOWN_SKILLS = {
  swordsmanship: 'Swordsmanship',
  macefighting: 'Macefighting',
  fencing: 'Fencing',
  wrestling: 'Wrestling',
  polearms: 'Polearms',
  tactics: 'Tactics',
  anatomy: 'Anatomy',
  parrying: 'Parrying',
  archery: 'Archery',
  marksmanship: 'Marksmanship',
  tracking: 'Tracking',
  magery: 'Magery',
  evaluatingIntelligence: 'Evaluating Intelligence',
  meditation: 'Meditation',
  resistingSpells: 'Resisting Spells',
  necromancy: 'Necromancy',
  spiritSpeak: 'Spirit Speak',
  chivalry: 'Chivalry',
  mysticism: 'Mysticism',
  inscription: 'Inscription',
  healing: 'Healing',
  veterinary: 'Veterinary',
  poisoning: 'Poisoning',
  musicianship: 'Musicianship',
  provocation: 'Provocation',
  peacemaking: 'Peacemaking',
  discordance: 'Discordance',
  mining: 'Mining',
  lumberjacking: 'Lumberjacking',
  foraging: 'Foraging',
  fishing: 'Fishing',
  skinning: 'Skinning',
  blacksmithing: 'Blacksmithing',
  tailoring: 'Tailoring',
  carpentry: 'Carpentry',
  tinkering: 'Tinkering',
  alchemy: 'Alchemy',
  cooking: 'Cooking',
  fletching: 'Fletching',
  masonry: 'Masonry',
  stealth: 'Stealth',
  hiding: 'Hiding',
  lockpicking: 'Lockpicking',
  detectHidden: 'Detect Hidden',
  stealing: 'Stealing',
  removeTrap: 'Remove Trap',
  animalTaming: 'Animal Taming',
  animalLore: 'Animal Lore',
  herding: 'Herding',
  camping: 'Camping',
  swimming: 'Swimming',
  focus: 'Focus',
};

export const SKILL_IDS = Object.keys(KNOWN_SKILLS);

/** Lower case to match src/mmo/stats.js and the runtime contract's actor. */
export const STAT_IDS = ['str', 'dex', 'int', 'con', 'wis'];
export const STAT_LABELS = { str: 'STR', dex: 'DEX', int: 'INT', con: 'CON', wis: 'WIS' };

/**
 * "at Swordsmanship 30 anyone gets Power Strike" and the Warrior heading reads
 * "weapon skill 30". These four are the weapon skills a warrior ability may
 * count. Wrestling gates Disarm on its own and is not in the group.
 */
export const WEAPON_SKILLS = ['swordsmanship', 'macefighting', 'fencing', 'polearms'];

export const EFFECT_KINDS = [
  'damageMult', 'aoe', 'spellDamage', 'heal', 'dot', 'leech', 'control',
  'move', 'knockback', 'buff', 'debuff', 'summon', 'absorb', 'zone', 'cure',
  'resurrect', 'stealth', 'weaponEnchant', 'passiveMod', 'utility', 'chain',
  'corpseBurst', 'plague', 'mark', 'bandage', 'combo',
];

export const TARGETS = ['self', 'enemy', 'ground', 'ally', 'corpse'];

export const COST_KINDS = ['stamina', 'mana', 'item'];

/** INVENTED. The document gives no range for a spell. Melee reach comes from
 * the weapon (03-ITEMS-LOOT.md gives spear 3 m and halberd 3.5 m); 2 m stands
 * in for an ordinary swing. */
export const MELEE_RANGE = 2;
export const SPELL_RANGE = 20;

// ---------------------------------------------------------------------------
// Gaps and conflicts, kept as data so a reader can count them
// ---------------------------------------------------------------------------

/** The spells with a cast bar you can carry at a run. None is over 0.8 s. */
export const MOVING_CASTS = [
  'fireball', 'iceShard', 'stoneSkin', 'boneSpear', 'heal', 'bless',
];
/** A cast longer than this always roots, whatever the row says. */
export const MAX_MOVING_CAST = 1.0;

/** Things the document does not settle, filled in here. */
export const DOC_GAPS = {
  spellRange: 'No spell range is written anywhere. SPELL_RANGE = 20 m.',
  meleeRange: 'No default melee reach is written. MELEE_RANGE = 2 m.',
  damageTypes: 'Life Drain, Corpse Explosion and Rift name no damage type; stored as null.',
  holyType: 'Consecrate Weapon does "holy damage"; holy is not one of the five resists in 03-ITEMS-LOOT.md.',
  warDrumRadius: 'War Drum says "allies" with no radius. Set to 12 m, matching Marching Song.',
  focusInterrupt: 'Focus "reduces the interrupt chance" with no number. See interruptChance().',
  poisonVial: 'Poison Blade costs "1 poison"; 03-ITEMS-LOOT.md has no such base. Id poisonVial.',
  campWood: 'Camp costs "wood" with no amount. One unit.',
};

// ---------------------------------------------------------------------------
// What has to be in your hands
// ---------------------------------------------------------------------------
//
// 08-POLISH-CONTRACT.md: "A melee ability needs a weapon of its skill in the
// main hand; a Wrestling ability needs empty hands; a ranged ability needs a
// bow or crossbow in the ranged slot and ammunition in the pack; Parrying
// abilities need a shield; a spell needs nothing in hand but a rooted cast."
//
// THE LAST CLAUSE OF THAT SENTENCE IS NO LONGER TRUE, and the user is the one
// who changed it: "to be a mage and cast spells, player needs a Staff or Wand,
// wand is 1 handed, staff is 2 handed. spells cannot be cast while a sword is
// equipped". So a spell needs a FOCUS in the main hand, which is the eighth
// answer weaponNeeds can give, and the rule that decides which rows are spells
// is one line: an ability that costs mana is a spell. That catches all 36 of
// them across mage, sorcerer, necromancer and healer, leaves the two mana-free
// passives alone, and touches nothing a warrior, ranger, rogue or bard owns,
// because not one of their rows costs mana. The single exception is Consecrate
// Weapon, which puts holy on the blade you are already holding and therefore
// keeps wanting the blade; the ordering below is what grants it. See
// docs/mmo/wiring/W7.md for the decision, row by row.
//
// 08-POLISH-CONTRACT.md is not this agent's document to edit; W7.md records
// that its spell clause and this file now disagree.
//
// THE WEAPON TABLE IS MIRRORED, NOT IMPORTED, for the same reason the skill
// ids are: this module stays pure and importless, and abilities.test.mjs walks
// every weapon, shield, instrument and ammunition base in src/mmo/items.js and
// fails if the mirror below has drifted in either direction. Adding a weapon
// there without adding it here breaks the test, not a play session.
//
// `fists` is in the mirror so its skill can be named, but it is never held:
// items.js gives it no slot, and heldWeapon() below reads hands 0 as empty
// hands, which is what makes Wrestling's rule mean anything.

/** id -> { name, skill, hands, ranged }. Mirrors items.js WEAPONS and the kit
 * weapons built from them (bone_staff is a quarterstaff wearing a new name). */
export const WEAPON_BASES = {
  dagger: { name: 'Dagger', skill: 'fencing', hands: 1, ranged: false, backstab: true },
  rapier: { name: 'Rapier', skill: 'fencing', hands: 1, ranged: false },
  spear: { name: 'Spear', skill: 'fencing', hands: 2, ranged: false },
  shortsword: { name: 'Shortsword', skill: 'swordsmanship', hands: 1, ranged: false },
  longsword: { name: 'Longsword', skill: 'swordsmanship', hands: 1, ranged: false },
  greatsword: { name: 'Greatsword', skill: 'swordsmanship', hands: 2, ranged: false },
  axe: { name: 'Axe', skill: 'swordsmanship', hands: 1, ranged: false },
  battleaxe: { name: 'Battleaxe', skill: 'swordsmanship', hands: 2, ranged: false },
  mace: { name: 'Mace', skill: 'macefighting', hands: 1, ranged: false },
  warhammer: { name: 'Warhammer', skill: 'macefighting', hands: 2, ranged: false },
  maul: { name: 'Maul', skill: 'macefighting', hands: 2, ranged: false },
  quarterstaff: { name: 'Quarterstaff', skill: 'macefighting', hands: 2, ranged: false },
  wand: { name: 'Wand', skill: 'magery', hands: 1, ranged: false },
  staff: { name: 'Staff', skill: 'magery', hands: 2, ranged: false },
  bone_staff: { name: 'Bone Staff', skill: 'magery', hands: 2, ranged: false },
  halberd: { name: 'Halberd', skill: 'polearms', hands: 2, ranged: false },
  glaive: { name: 'Glaive', skill: 'polearms', hands: 2, ranged: false },
  shortbow: { name: 'Shortbow', skill: 'archery', hands: 2, ranged: true },
  longbow: { name: 'Longbow', skill: 'archery', hands: 2, ranged: true },
  crossbow: { name: 'Crossbow', skill: 'marksmanship', hands: 2, ranged: true },
  throwing_knives: { name: 'Throwing Knives', skill: 'marksmanship', hands: 1, ranged: true },
  fists: { name: 'Fists', skill: 'wrestling', hands: 0, ranged: false },
};

/**
 * What a spell goes through, by base id. Mirrors every items.js base tagged
 * `focus`: the wand (one hand), the staff (two) and the necromancer's bone
 * staff. A quarterstaff is NOT one of them; it is a Macefighting stick.
 * abilities.test.mjs compares this list against items.js in both directions.
 */
export const FOCUS_BASES = ['wand', 'staff', 'bone_staff'];

/** The three shields of 03-ITEMS-LOOT.md, by base id. */
export const SHIELD_BASES = ['buckler', 'kite', 'heater', 'tower'];
/** What a bard plays. The lute is the only instrument the item tables have. */
export const INSTRUMENT_BASES = ['lute'];
/** The stacking ammunition bases. Thrown knives are their own ammunition. */
export const AMMO_BASES = ['arrow', 'bolt'];
/** Blades small enough for the Rogue's left hand. */
export const DAGGER_BASES = ['dagger'];

/** The bard's four skills. Every one of them is played on an instrument. */
export const BARD_SKILLS = ['musicianship', 'provocation', 'peacemaking', 'discordance'];

/** The nine answers weaponNeeds can give. */
export const NEEDS_KINDS = ['melee', 'anyMelee', 'unarmed', 'ranged', 'focus', 'shield', 'instrument', 'dualDaggers', 'none'];

/**
 * How a refusal names what it wants. One phrase per weapon skill, and
 * abilities.test.mjs checks that every weapon in the mirror is named by its
 * own skill's phrase, so a new weapon cannot hide behind an old sentence.
 */
export const WEAPON_WORDS = {
  swordsmanship: 'a sword or an axe',
  macefighting: 'a mace, a hammer, a maul or a staff',
  fencing: 'a dagger, a rapier or a spear',
  polearms: 'a halberd or a glaive',
  archery: 'a bow',
  marksmanship: 'a crossbow or throwing knives',
  wrestling: 'your fists',
  magery: 'a wand or a staff',
};

/** Ammunition, said the way a person says it. */
const AMMO_WORDS = { arrow: 'arrows', bolt: 'bolts' };

/** The base id of an item record, a base record, or a plain base id. */
export function baseIdOf(item) {
  if (!item) return null;
  if (typeof item === 'string') return item;
  if (typeof item !== 'object') return null;
  return item.base || item.id || null;
}

/**
 * The mirror row for whatever is in a slot, or null. Fists are not held: an
 * item with no hands is the same as an empty hand, which is the whole of the
 * Wrestling rule.
 */
export function heldWeapon(item) {
  const row = WEAPON_BASES[baseIdOf(item)];
  if (!row || row.hands === 0) return null;
  return { id: baseIdOf(item), ...row };
}

const isShieldItem = (item) => SHIELD_BASES.includes(baseIdOf(item));
const isInstrumentItem = (item) => INSTRUMENT_BASES.includes(baseIdOf(item));
export const isDaggerItem = (item) => DAGGER_BASES.includes(baseIdOf(item));
/** A wand, a staff or a bone staff, and nothing else. */
export const isFocusItem = (item) => FOCUS_BASES.includes(baseIdOf(item));

/** "a Longsword", "an Axe", "Throwing Knives". */
function aName(row) {
  const name = row?.name || 'something';
  if (/[^s]s$/.test(name)) return name;                 // Fists, Throwing Knives
  return `${/^[aeiou]/i.test(name) ? 'an' : 'a'} ${name}`;
}

const wordsFor = (skills = []) => skills.map((s) => WEAPON_WORDS[s] || 'a weapon').join(' or ');
const ammoWordsFor = (ammo = []) => ammo.map((id) => AMMO_WORDS[id] || id).join(' or ');

/**
 * WHAT PAYS AN ITEM COST, by the cost's id.
 *
 * Three rows in the table cost an item and TWO OF THEM NAMED SOMETHING THAT IS
 * NOT AN ITEM. `Camp` costs "wood" and there is no `wood` base; there are
 * fourteen logs. `Poison Blade` costs "1 poison" and there is no vial; there is
 * `woodland_poison`, which foraging.js already brews. So an item cost is paid
 * out of a LIST of bases rather than out of one, the list is written down here,
 * and abilities.test.mjs walks it against items.js in both directions so a cost
 * id that pays for nothing cannot ship again.
 *
 * Before this the three costs were read off `character.items`, a plain count
 * map that EXISTS ONLY IN THE TEST FIXTURES: no save has ever carried the
 * field, so `have` was always zero and Bandage, Camp and Poison Blade were
 * refused for want of a bandage the player was carrying ten of. See
 * `itemsHeld` below and `docs/mmo/wiring/AB2-ABILITIES-AUDIT.md`.
 */
export const COST_ITEM_BASES = {
  bandage: ['bandage'],
  wood: [
    'oak_log', 'birch_log', 'beech_log', 'fir_log', 'spruce_log', 'pine_log',
    'sakura_log', 'willow_log', 'palm_log', 'deadwood', 'cactus_wood',
    'ash_log', 'heartwood_log', 'ironbark_log',
  ],
  poisonVial: ['woodland_poison'],
};

/**
 * What a refusal calls each cost, in the player's words. The cost id is a key
 * (`poisonVial`), and "Poison Blade needs 1 poisonVial" is a key shown to a
 * player who has never seen one; the item foraging brews is a Woodland poison.
 * auditAbilities insists every cost id has an entry.
 */
export const COST_ITEM_WORDS = {
  bandage: 'bandage',
  wood: 'wood',
  poisonVial: 'Woodland poison',
};
export function costItemWords(costId) {
  return COST_ITEM_WORDS[costId] || String(costId);
}

/**
 * An item whose "use" is an ABILITY, by item base id.
 *
 * The bag's Use and the item bar's key both go through one hook
 * (`app/systems/ui.js` panelCtx.useItem), and that hook read the item's own
 * `use` block. The bandage base has none, so "use bandage" answered "nothing
 * has been written yet that uses bandage" for as long as the item has existed,
 * while the Bandage ABILITY sat on the other bar doing the real thing. One
 * table, so a bandage means the same four seconds whichever bar you press.
 *
 * abilities.test.mjs proves every key here is a real item base and every value
 * a real ability, so this cannot rot into a route to nowhere.
 */
export const ABILITY_FOR_ITEM = { bandage: 'bandage' };

/** Every item cost id the table actually uses, gathered rather than listed. */
export function costItemIds(list = ABILITIES) {
  const out = new Set();
  for (const a of list) if (a.cost && a.cost.item) out.add(a.cost.item);
  return [...out];
}

/**
 * How many of a base are in the pack. Takes the character document's
 * `{ slots, items: [...] }`, a bare array of item records, or a plain count
 * map like `{ arrow: 60 }`, because canUse is handed all three by different
 * callers and a pack it cannot read must not silently read as empty.
 */
export function countInPack(pack, baseId) {
  if (!pack || !baseId) return 0;
  if (Array.isArray(pack)) {
    let n = 0;
    for (const it of pack) {
      if (!it) continue;
      if (baseIdOf(it) === baseId) n += typeof it.count === 'number' ? it.count : 1;
    }
    return n;
  }
  if (Array.isArray(pack.items)) return countInPack(pack.items, baseId);
  const v = pack[baseId];
  return typeof v === 'number' ? v : 0;
}

/**
 * Does this effect swing, shoot or enchant the thing in your hand? A damage
 * multiplier is a swing by definition, an aoe with a damageMult is a swing in
 * a circle, and a weapon enchantment with no weapon is a lie. Everything else
 * (a spell roll, a buff, a summon, a trap, a shout) happens with what you are
 * holding, not through it.
 */
/**
 * How many things this character is carrying that would pay `costId`, counting
 * BOTH shapes: the pack the game writes and the count map the older fixtures
 * carry. A real save has only the first and every fixture predating the pack
 * has only the second, so they are added rather than chosen between; no
 * character has ever had both, and one that did would be carrying both.
 */
export function itemsHeld(character, costId) {
  if (!character || !costId) return 0;
  let n = 0;
  for (const base of payingBases(costId)) {
    n += countInPack(character.pack, base);
    n += countInPack(character.items, base);
  }
  return n;
}

/**
 * The bases that pay a cost, with the COST ID ITSELF on the end.
 *
 * The id is there for the count map alone: a fixture that predates the pack
 * writes `{ wood: 10 }` and means ten wood, and dropping it would have turned
 * every one of those into "you have 0" the moment `wood` started meaning
 * fourteen kinds of log. No item base is called `wood` or `poisonVial`, so the
 * extra entry can never match anything in a real pack.
 */
export function payingBases(costId) {
  const mapped = COST_ITEM_BASES[costId] || [];
  return mapped.includes(costId) ? mapped : [...mapped, costId];
}

/** The first base a character is actually carrying that would pay this cost. */
export function payingBase(character, costId) {
  for (const base of payingBases(costId)) {
    if (countInPack(character?.pack, base) > 0) return base;
    if (countInPack(character?.items, base) > 0) return base;
  }
  return null;
}

export function effectUsesWeapon(effect) {
  let found = false;
  walkEffect(effect, (e) => {
    if (e.kind === 'damageMult') found = true;
    if (e.kind === 'weaponEnchant') found = true;
    if (e.kind === 'aoe' && e.damageMult != null) found = true;
  });
  return found;
}

/**
 * Does this row cost mana? That is the whole definition of a spell here, and
 * it is deliberately not the ability's group: Bandage sits in the healer group
 * and costs a bandage, Meditate costs nothing at all, and neither of them is
 * something you cast. Written as its own function so `auditAbilities` can
 * count the spells and the test can drive it both ways.
 */
export function isSpell(ability) {
  const cost = ability && ability.cost;
  return !!cost && typeof cost.mana === 'number' && cost.mana > 0;
}

/**
 * Is this row holy magic? 04-CLASSES-ABILITIES.md says it in one line,
 * "Chivalry is holy magic that works in plate", and this is that line as a
 * predicate: a row gated on Chivalry, by its own skill or by one of the routes
 * in its `anyOf`.
 *
 * The `anyOf` clause is there for Resurrect and only for Resurrect: it is the
 * one row in the table with two ways in (Healing 80 with Anatomy 80, or
 * Chivalry 85), and an ability cannot be holy down one route and arcane down
 * the other without being two abilities. It is exempt, and a plated Healing 80
 * physician gets the paladin's pass with it. That is the price of one row
 * having two doors, and it is written down here rather than discovered.
 */
export function isChivalry(ability) {
  if (!ability) return false;
  if (ability.skill === 'chivalry') return true;
  const routes = Array.isArray(ability.anyOf) ? ability.anyOf : [];
  return routes.some((r) => (r.all || []).some((c) => c.skill === 'chivalry'));
}

/**
 * Does armour get in the way of this row? A spell, unless it is holy.
 *
 * THE PALADIN IS THE EXCEPTION, BY DESIGN. The user's rule was "casting
 * penalty for any armor that is not cloth or leather ... yes paladin can cast
 * in plate, but limited to paladin spells". So Chivalry casts out of a
 * breastplate at full speed and never fizzles, and every other spell pays the
 * armour's `castBurden` (items.js) in cast time and in failures.
 *
 * INSTANT SPELLS ARE INCLUDED, and that is a judgement worth naming. Fourteen
 * of the thirty five spells have `castTime 0`, and ten of those fourteen are
 * burdened: Magic Arrow, Lightning, Blink, Mana Shield, Hex, Eldritch Bolt,
 * Life Drain, Fear, Corpse Explosion and Curse of Weakness. (The other four,
 * Cleanse, Consecrate Weapon, Smite and Lay on Hands, are Chivalry and exempt
 * already.) Exempting a spell with no cast bar would have left a plated mage a
 * full instant kit, Lightning included, with no penalty at all, which is
 * exactly the tank wizard the rule exists to prevent. The cast time half of the penalty is a no op for
 * them either way, since 0 * 2 is still 0; the fizzle is what they feel.
 *
 * abilities_runtime.js applies it, docs/mmo/02-COMBAT.md carries the table,
 * and auditAbilities counts both sides so a new Chivalry row cannot slip into
 * the burdened list unnoticed.
 */
export function burdensInArmour(ability) {
  return isSpell(ability) && !isChivalry(ability);
}

function normalizeNeeds(needs) {
  const out = { kind: needs.kind };
  if (needs.skills) out.skills = [...needs.skills];
  if (needs.ammo) out.ammo = [...needs.ammo];
  if (needs.selfAmmo) out.selfAmmo = [...needs.selfAmmo];
  if (needs.bases) out.bases = [...needs.bases];
  return out;
}

/**
 * The rule, in order. A row may carry its own `needs` and skip all of it.
 *
 * Nothing here reads the ability's group: a Rogue's Backstab is Fencing 40 and
 * wants a fencing weapon by the same line that gives Lunge one.
 */
function deriveNeeds(row) {
  if (row.needs) return normalizeNeeds(row.needs);
  const skill = row.skill ?? null;
  if (row.requiresShield || skill === 'parrying') return { kind: 'shield' };
  if (skill === 'wrestling') return { kind: 'unarmed' };
  if (BARD_SKILLS.includes(skill)) return { kind: 'instrument', bases: [...INSTRUMENT_BASES] };
  // A spell wants a focus, EXCEPT where the spell's whole effect is on the
  // weapon you are holding. Consecrate Weapon is the only row in the table
  // where both are true, and it is why this test comes before the mana one
  // rather than after it: a wand with holy on it would enchant nothing.
  if (!effectUsesWeapon(row.effect)) {
    if (isSpell(row)) return { kind: 'focus', bases: [...FOCUS_BASES] };
    return { kind: 'none' };
  }
  if (row.skillAny) return { kind: 'anyMelee', skills: [...row.skillAny] };
  if (skill === 'archery') return { kind: 'ranged', skills: ['archery'], ammo: ['arrow'] };
  if (skill === 'marksmanship') {
    return { kind: 'ranged', skills: ['marksmanship'], ammo: ['bolt'], selfAmmo: ['throwing_knives'] };
  }
  if (WEAPON_SKILLS.includes(skill)) return { kind: 'melee', skills: [skill] };
  // Consecrate Weapon is Chivalry and Poison Blade is Poisoning, and both of
  // them put something on the weapon you are holding.
  return { kind: 'anyMelee', skills: [...WEAPON_SKILLS] };
}

/**
 * `{ kind, skills?, ammo?, selfAmmo?, bases? }`. Every row in ABILITIES has
 * this computed once at load; a hand made row is derived on the spot.
 */
export function weaponNeeds(ability) {
  if (!ability) return { kind: 'none' };
  return ability.needs ? normalizeNeeds(ability.needs) : deriveNeeds(ability);
}

/**
 * `{ ok }` or `{ ok: false, reason }` for what is in your hands alone.
 *
 * `equipment` is the character document's paper doll, `{ mainHand, offHand,
 * ranged }` of item records. `pack` is the document's pack, an array of item
 * records, or a count map. NO EQUIPMENT MEANS EMPTY HANDS here, which refuses;
 * canUse skips the check entirely for a character that carries no `equipment`
 * field at all, so the older fixtures still measure what they were written to
 * measure.
 *
 * A ranged ability wants the bow to be the weapon that will actually fire.
 * actor.js picks `mainHand || ranged`, so a dagger in the main hand leaves the
 * bow on your back, and a shot fired with it would be a dagger swing thrown at
 * twenty five metres: queued, out of reach, and silent. Better to say so.
 */
export function weaponCheck(ability, equipment = null, pack = null) {
  if (!ability) return { ok: false, reason: 'no such ability' };
  const needs = weaponNeeds(ability);
  const eq = equipment || {};
  const name = ability.name;
  const main = heldWeapon(eq.mainHand);
  const off = heldWeapon(eq.offHand);
  const shot = heldWeapon(eq.ranged);

  if (needs.kind === 'none') return { ok: true };

  if (needs.kind === 'unarmed') {
    const held = main || off;
    if (!held) return { ok: true };
    return { ok: false, reason: `${name} wants empty hands, and you are holding ${aName(held)}.` };
  }

  if (needs.kind === 'dualDaggers') {
    const mainDagger = isDaggerItem(eq.mainHand);
    const offDagger = isDaggerItem(eq.offHand);
    if (mainDagger && main && main.hands === 1 && offDagger) return { ok: true };
    if (!mainDagger) {
      const held = main ? `you are holding ${aName(main)}` : 'your hands are empty';
      return { ok: false, reason: `${name} wants a dagger in your main hand, and ${held}.` };
    }
    const held = offDagger ? 'your main hand is not free enough for it' : (off ? `you are holding ${aName(off)} in it` : eq.offHand ? 'that hand is holding something else' : 'your off hand is empty');
    return { ok: false, reason: `${name} wants a dagger in your off hand, and ${held}.` };
  }

  // "Any weapon you swing" is any weapon you SWING. A focus is held in the same
  // hand and is not one of them: Power Strike is a shoulder behind a blade, and
  // a wand has no blade to put it behind. Without this line every warrior
  // ability in the anyMelee kind would have quietly accepted a wand.
  if (needs.kind === 'anyMelee') {
    if (main && !main.ranged && !isFocusItem(eq.mainHand)) return { ok: true };
    return {
      ok: false,
      reason: `${name} wants a weapon in your hand, and ${main ? `${aName(main)} is not one you swing` : 'your hands are empty'}.`,
    };
  }

  if (needs.kind === 'melee') {
    const skills = needs.skills || [];
    if (main && !main.ranged && skills.includes(main.skill)) return { ok: true };
    const held = main ? `you are holding ${aName(main)}` : 'your hands are empty';
    return { ok: false, reason: `${name} wants ${wordsFor(skills)} in your hand, and ${held}.` };
  }

  if (needs.kind === 'ranged') {
    const skills = needs.skills || [];
    const head = `${name} wants ${wordsFor(skills)} in your hand and ${ammoWordsFor(needs.ammo)} in the pack`;
    // The bow is a main hand weapon now. A save that still slings one in the
    // old `ranged` slot with an empty hand is honoured, since actor.js fires it.
    const drawn = main || (!main ? shot : null);
    if (!drawn) return { ok: false, reason: `${head}, and your hands are empty.` };
    if (!drawn.ranged || !skills.includes(drawn.skill)) {
      return { ok: false, reason: `${head}, and you are holding ${aName(drawn)}.` };
    }
    if ((needs.selfAmmo || []).includes(drawn.id)) return { ok: true };
    let have = 0;
    for (const id of needs.ammo || []) have += countInPack(pack, id);
    if (have <= 0) return { ok: false, reason: `${head}, and you have none.` };
    return { ok: true };
  }

  // A spell goes through a wand or a staff or it does not go. The refusal
  // names what IS in the hand, the way the melee one does, because "you need a
  // wand" with no mention of the sword you are holding is half a sentence.
  if (needs.kind === 'focus') {
    if (isFocusItem(eq.mainHand)) return { ok: true };
    const held = main ? `you are holding ${aName(main)}` : 'your hands are empty';
    return { ok: false, reason: `${name} wants a wand or a staff in your hand, and ${held}.` };
  }

  if (needs.kind === 'shield') {
    if (isShieldItem(eq.offHand)) return { ok: true };
    const held = off ? `you are holding ${aName(off)} in it` : eq.offHand ? 'that hand is holding something else' : 'your off hand is empty';
    return { ok: false, reason: `${name} wants a shield on your arm, and ${held}.` };
  }

  if (needs.kind === 'instrument') {
    if (isInstrumentItem(eq.offHand) || isInstrumentItem(eq.mainHand)) return { ok: true };
    return { ok: false, reason: `${name} wants a lute in your hands, and there is none.` };
  }

  return { ok: false, reason: `${name} wants something this build does not know about (${needs.kind}).` };
}

// ---------------------------------------------------------------------------
// The table
// ---------------------------------------------------------------------------

function a(row) {
  return {
    id: row.id,
    name: row.name,
    group: row.group,
    skill: row.skill ?? null,
    skillAny: row.skillAny ?? null,
    /** The mark this row is MEANT for. It is the lesson's difficulty and the
     * point at which the row stops fumbling. See `practiceChance`. */
    minSkill: row.minSkill ?? 0,
    /** The mark at which the row APPEARS AT ALL, which is what the gate reads.
     * Defaults to minSkill, so an untouched row behaves exactly as it did.
     *
     * The thirteen rows that carry `openAt: 0` are the first rung of a school
     * that had no other way in. Without them Mysticism, Necromancy, Chivalry,
     * Camping, Provocation, Peacemaking, Discordance, Musicianship, Tracking,
     * Poisoning, Stealing, Spirit Speak and Animal Lore could only be started
     * by paying a trainer, which is the complaint this field answers. A row
     * used below its minSkill mostly fumbles and teaches; see practiceChance
     * and docs/mmo/wiring/SK2-SKILL-PATHS.md. */
    openAt: row.openAt ?? row.minSkill ?? 0,
    extraReq: row.extraReq ?? null,
    anyOf: row.anyOf ?? null,
    cost: row.cost,
    cooldown: row.cooldown,
    castTime: pacedCastTime(row.id,row.castTime),
    moving: row.moving,
    /** True when the ability roots the caster for its cast: a cast bar and no. */
    rooted: row.castTime > 0 && !row.moving,
    /** True when the ability needs you still even though it has no cast bar. */
    stationary: row.stationary ?? false,
    range: row.range,
    target: row.target,
    effect: row.effect,
    passive: row.passive ?? false,
    requiresShield: row.requiresShield ?? false,
    /** What has to be in your hands. Derived by rule; a row may override it
     * with its own `needs`. See weaponNeeds and weaponCheck above. */
    needs: deriveNeeds(row),
    description: row.description,
  };
}

export const ABILITIES = [
  // --- Warrior -------------------------------------------------------------
  a({
    id: 'powerStrike', name: 'Power Strike', group: 'warrior',
    skill: 'swordsmanship', skillAny: WEAPON_SKILLS, minSkill: 30,
    cost: { stamina: 15 }, cooldown: 6, castTime: 0, moving: true,
    range: MELEE_RANGE, target: 'enemy',
    effect: { kind: 'damageMult', value: 1.6, nextSwing: true },
    description: 'The next swing lands with your shoulder behind it, for sixty percent more.',
  }),
  a({
    id: 'whirlwind', name: 'Whirlwind', group: 'warrior',
    skill: 'swordsmanship', skillAny: WEAPON_SKILLS, minSkill: 50,
    extraReq: { tactics: 40 },
    cost: { stamina: 30 }, cooldown: 12, castTime: 0.4, moving: false,
    range: 3, target: 'self',
    effect: { kind: 'aoe', radius: 3, damageMult: 0.8 },
    description: 'A turn on the spot that opens everything standing within three metres.',
  }),
  a({
    id: 'leapSlam', name: 'Leap Slam', group: 'warrior',
    skill: 'swordsmanship', skillAny: WEAPON_SKILLS, minSkill: 60,
    extraReq: { str: 50 },
    cost: { stamina: 25 }, cooldown: 10, castTime: 0, moving: true,
    range: 8, target: 'ground',
    effect: {
      kind: 'combo',
      parts: [
        { kind: 'move', mode: 'leap', distance: 8, direction: 'target' },
        { kind: 'aoe', radius: 2.5, damageMult: 1.2 },
        { kind: 'knockback', distance: 3 },
      ],
    },
    description: 'Eight metres of air and then the ground, and whatever was standing on it.',
  }),
  a({
    id: 'shieldBash', name: 'Shield Bash', group: 'warrior',
    skill: 'parrying', minSkill: 40,
    cost: { stamina: 20 }, cooldown: 9, castTime: 0, moving: true,
    range: MELEE_RANGE, target: 'enemy', requiresShield: true,
    effect: {
      kind: 'combo',
      parts: [
        { kind: 'damageMult', value: 0.5, nextSwing: true },
        { kind: 'control', effect: 'stun', duration: 2 },
      ],
    },
    description: 'The shield is a weapon too. Half the damage and two seconds of nothing.',
  }),
  a({
    id: 'rend', name: 'Rend', group: 'warrior',
    skill: 'swordsmanship', minSkill: 45,
    cost: { stamina: 20 }, cooldown: 8, castTime: 0, moving: true,
    range: MELEE_RANGE, target: 'enemy',
    effect: {
      kind: 'combo',
      parts: [
        { kind: 'damageMult', value: 0.7, nextSwing: true },
        { kind: 'dot', perSecond: 3, duration: 8, type: 'physical' },
      ],
    },
    description: 'A cut that keeps opening. Three a second for eight seconds after.',
  }),
  a({
    id: 'crushingBlow', name: 'Crushing Blow', group: 'warrior',
    skill: 'macefighting', minSkill: 45,
    cost: { stamina: 20 }, cooldown: 8, castTime: 0, moving: true,
    range: MELEE_RANGE, target: 'enemy',
    effect: {
      kind: 'combo',
      parts: [
        { kind: 'damageMult', value: 0.9, nextSwing: true },
        { kind: 'control', effect: 'stun', duration: 3 },
        { kind: 'debuff', mods: { armourRatingFlat: -10 }, duration: 10 },
      ],
    },
    description: 'Armour dents. Ten points of it, for ten seconds, and the wearer sits down.',
  }),
  a({
    id: 'lunge', name: 'Lunge', group: 'warrior',
    skill: 'fencing', minSkill: 45,
    cost: { stamina: 15 }, cooldown: 7, castTime: 0, moving: true,
    range: 5, target: 'enemy',
    effect: {
      kind: 'combo',
      parts: [
        { kind: 'move', mode: 'dash', distance: 5, direction: 'target' },
        { kind: 'damageMult', value: 1.1, nextSwing: true },
      ],
    },
    description: 'Five metres closed in one step, with the point arriving first.',
  }),
  a({
    id: 'sweep', name: 'Sweep', group: 'warrior',
    skill: 'polearms', minSkill: 45,
    cost: { stamina: 25 }, cooldown: 9, castTime: 0, moving: true,
    range: 3.5, target: 'self',
    effect: {
      kind: 'combo',
      parts: [
        { kind: 'aoe', radius: 3.5, arcDegrees: 120, damageMult: 0.75 },
        { kind: 'knockback', distance: 2 },
      ],
    },
    description: 'The haft comes round in a wide arc and puts the front rank on its back.',
  }),
  a({
    id: 'battleCry', name: 'Battle Cry', group: 'warrior',
    skill: 'tactics', minSkill: 60,
    cost: { stamina: 30 }, cooldown: 30, castTime: 0, moving: true,
    range: 10, target: 'self',
    effect: {
      kind: 'buff', mods: { damage: 0.2 }, duration: 12, radius: 10,
      targets: 'selfAndAllies',
    },
    description: 'Everyone within ten metres hits a fifth harder for twelve seconds.',
  }),
  a({
    id: 'berserk', name: 'Berserk', group: 'warrior',
    skill: 'tactics', minSkill: 80, extraReq: { con: 60 },
    cost: { stamina: 40 }, cooldown: 60, castTime: 0, moving: true,
    range: 0, target: 'self',
    effect: {
      kind: 'buff',
      mods: { damage: 0.4, swingSpeed: 0.4, armourRating: -0.3 },
      duration: 15, targets: 'self',
    },
    description: 'Fifteen seconds of forty percent more, and a third of your armour forgotten.',
  }),
  a({
    id: 'disarm', name: 'Disarm', group: 'warrior',
    skill: 'wrestling', minSkill: 50,
    cost: { stamina: 20 }, cooldown: 15, castTime: 0, moving: true,
    range: MELEE_RANGE, target: 'enemy',
    effect: { kind: 'control', effect: 'disarm', duration: 6 },
    description: 'A twist of the wrist. It fights you barehanded for six seconds.',
  }),
  a({
    id: 'riposte', name: 'Riposte', group: 'warrior',
    skill: 'parrying', minSkill: 70,
    cost: { stamina: 0 }, cooldown: 0, castTime: 0, moving: true,
    range: MELEE_RANGE, target: 'self', passive: true,
    effect: { kind: 'passiveMod', mods: { parryCounterMult: 0.5 } },
    description: 'Every parry answers back for half a swing. Always on.',
  }),

  // --- Ranger --------------------------------------------------------------
  a({
    id: 'aimedShot', name: 'Aimed Shot', group: 'ranger',
    skill: 'archery', minSkill: 30,
    cost: { stamina: 15 }, cooldown: 6, castTime: 1.2, moving: false,
    range: 25, target: 'enemy',
    effect: { kind: 'damageMult', value: 1.8, hitBonus: 0.2, nextSwing: true },
    description: 'Stand still, breathe out, and put it where you meant to.',
  }),
  a({
    id: 'doubleShot', name: 'Double Shot', group: 'ranger',
    skill: 'archery', minSkill: 45,
    cost: { stamina: 20 }, cooldown: 8, castTime: 0, moving: true,
    range: 25, target: 'enemy',
    effect: { kind: 'damageMult', value: 0.7, shots: 2, nextSwing: true },
    description: 'Two arrows off the string before the first one lands.',
  }),
  a({
    id: 'volley', name: 'Volley', group: 'ranger',
    skill: 'archery', minSkill: 60,
    cost: { stamina: 35 }, cooldown: 15, castTime: 1.5, moving: false,
    range: 30, target: 'ground',
    effect: { kind: 'aoe', radius: 5, damageMult: 0.6 },
    description: 'Arrows come down on a five metre circle rather than at anything in it.',
  }),
  a({
    id: 'piercingArrow', name: 'Piercing Arrow', group: 'ranger',
    skill: 'archery', minSkill: 55,
    cost: { stamina: 20 }, cooldown: 10, castTime: 0, moving: true,
    range: 25, target: 'enemy',
    effect: {
      kind: 'damageMult', value: 1, ignoreARFraction: 0.5, pierceTargets: 2,
      nextSwing: true,
    },
    description: 'Half the armour counts, and the shaft carries on into whatever is behind.',
  }),
  a({
    id: 'cripplingShot', name: 'Crippling Shot', group: 'ranger',
    skill: 'marksmanship', minSkill: 40,
    cost: { stamina: 15 }, cooldown: 10, castTime: 0, moving: true,
    range: 30, target: 'enemy',
    effect: {
      kind: 'combo',
      parts: [
        { kind: 'damageMult', value: 0.6, nextSwing: true },
        { kind: 'control', effect: 'slow', magnitude: 0.5, duration: 6 },
      ],
    },
    description: 'A bolt through the leg. It comes on at half speed for six seconds.',
  }),
  a({
    id: 'disengage', name: 'Disengage', group: 'ranger',
    skill: 'archery', minSkill: 40, extraReq: { dex: 55 },
    cost: { stamina: 15 }, cooldown: 12, castTime: 0, moving: true,
    range: 6, target: 'self',
    effect: {
      kind: 'combo',
      parts: [
        { kind: 'move', mode: 'leap', distance: 6, direction: 'backward' },
        { kind: 'buff', mods: { runSpeed: 0.3 }, duration: 3, targets: 'self' },
      ],
    },
    description: 'Six metres of backwards, and three seconds of running to make them count.',
  }),
  a({
    id: 'fleetFoot', name: 'Fleet Foot', group: 'ranger',
    skill: 'tracking', minSkill: 50,
    cost: { stamina: 0 }, cooldown: 0, castTime: 0, moving: true,
    range: 0, target: 'self', passive: true,
    effect: {
      kind: 'passiveMod', mods: { runSpeed: 0.1 },
      tiers: [{ skill: 'tracking', at: 90, mods: { runSpeed: 0.2 } }],
    },
    description: 'A tenth quicker on your feet, and a fifth once Tracking reaches ninety.',
  }),
  a({
    id: 'huntersMark', name: "Hunter's Mark", group: 'ranger',
    skill: 'tracking', minSkill: 40, openAt: 0,
    cost: { stamina: 10 }, cooldown: 20, castTime: 0, moving: true,
    range: 30, target: 'enemy',
    effect: {
      kind: 'mark', damageTakenMult: 1.15, duration: 60, fromCasterOnly: true,
      preventsHide: true,
    },
    description: 'You have its scent. Fifteen percent more from you for a minute, and nowhere to hide.',
  }),
  a({
    id: 'snare', name: 'Snare', group: 'ranger',
    skill: 'tinkering', minSkill: 30,
    anyOf: [
      { all: [{ skill: 'tinkering', min: 30 }] },
      { all: [{ skill: 'tracking', min: 60 }] },
    ],
    cost: { stamina: 10 }, cooldown: 20, castTime: 0.8, moving: false,
    range: 5, target: 'ground',
    effect: {
      kind: 'zone', zoneKind: 'trap', radius: 1, duration: 60, triggers: 1,
      applies: { kind: 'control', effect: 'root', duration: 4 },
    },
    description: 'A loop of wire in the grass. The first thing through it stops for four seconds.',
  }),
  a({
    id: 'beastCall', name: 'Beast Call', group: 'ranger',
    skill: 'animalLore', minSkill: 50, openAt: 0,
    cost: { stamina: 30 }, cooldown: 90, castTime: 2, moving: false,
    range: 30, target: 'self',
    effect: {
      kind: 'summon', creature: 'calledBeast',
      duration: 30,
    },
    description: 'A wolf answers and fights beside you for half a minute. At Animal Lore 70 a boar comes instead, and at 90 a dire wolf.',
  }),

  // --- Mage ----------------------------------------------------------------
  a({
    id: 'magicArrow', name: 'Magic Arrow', group: 'mage',
    skill: 'magery', minSkill: 0,
    cost: { mana: 4 }, cooldown: 0, castTime: 0, moving: true,
    range: SPELL_RANGE, target: 'enemy',
    effect: { kind: 'spellDamage', min: 8, max: 12, type: 'energy' },
    description: 'The spell you learn on, and the one you never quite stop using.',
  }),
  a({
    id: 'fireball', name: 'Fireball', group: 'mage',
    skill: 'magery', minSkill: 25,
    cost: { mana: 9 }, cooldown: 3, castTime: 0.6, moving: true,
    range: SPELL_RANGE, target: 'enemy',
    effect: {
      kind: 'combo',
      parts: [
        { kind: 'spellDamage', min: 18, max: 26, type: 'fire' },
        { kind: 'dot', perSecond: 2, duration: 4, type: 'fire' },
      ],
    },
    description: 'It lands hot and keeps burning for four seconds after.',
  }),
  a({
    id: 'iceShard', name: 'Ice Shard', group: 'mage',
    skill: 'magery', minSkill: 30,
    cost: { mana: 9 }, cooldown: 3, castTime: 0.6, moving: true,
    range: SPELL_RANGE, target: 'enemy',
    effect: {
      kind: 'combo',
      parts: [
        { kind: 'spellDamage', min: 14, max: 22, type: 'cold' },
        { kind: 'control', effect: 'slow', magnitude: 0.3, duration: 4 },
      ],
    },
    description: 'Less than a fireball and it takes something off their speed instead.',
  }),
  a({
    id: 'lightning', name: 'Lightning', group: 'mage',
    skill: 'magery', minSkill: 45,
    cost: { mana: 14 }, cooldown: 5, castTime: 0, moving: true,
    range: SPELL_RANGE, target: 'enemy',
    effect: { kind: 'spellDamage', min: 30, max: 42, type: 'energy' },
    description: 'No wind up at all. It is simply there, and then it is over.',
  }),
  a({
    id: 'blink', name: 'Blink', group: 'mage',
    skill: 'magery', minSkill: 40,
    cost: { mana: 12 }, cooldown: 10, castTime: 0, moving: true,
    range: 12, target: 'self',
    effect: { kind: 'move', mode: 'blink', distance: 12, direction: 'facing' },
    description: 'Twelve metres the way you are looking, through whatever was between.',
  }),
  a({
    id: 'manaShield', name: 'Mana Shield', group: 'mage',
    skill: 'magery', minSkill: 50,
    cost: { mana: 20 }, cooldown: 30, castTime: 0, moving: true,
    range: 0, target: 'self',
    effect: { kind: 'absorb', source: 'mana', ratio: 2, duration: 15 },
    description: 'For fifteen seconds every wound costs mana at two for one instead of blood.',
  }),
  a({
    id: 'frostNova', name: 'Frost Nova', group: 'mage',
    skill: 'magery', minSkill: 60,
    cost: { mana: 25 }, cooldown: 14, castTime: 0.8, moving: false,
    range: 5, target: 'self',
    effect: {
      kind: 'combo',
      parts: [
        {
          kind: 'aoe', radius: 5,
          spellDamage: { min: 20, max: 30, type: 'cold' },
        },
        { kind: 'control', effect: 'root', duration: 3, radius: 5 },
      ],
    },
    description: 'The floor goes white for five metres and nothing on it moves for three seconds.',
  }),
  a({
    id: 'chainLightning', name: 'Chain Lightning', group: 'mage',
    skill: 'magery', minSkill: 70,
    cost: { mana: 28 }, cooldown: 10, castTime: 1.2, moving: false,
    range: SPELL_RANGE, target: 'enemy',
    effect: {
      kind: 'combo',
      parts: [
        { kind: 'spellDamage', min: 40, max: 55, type: 'energy' },
        { kind: 'chain', targets: 3, falloff: [0.7, 0.5, 0.3] },
      ],
    },
    description: 'It jumps to three more, weaker each time, and finds them all itself.',
  }),
  a({
    id: 'meteor', name: 'Meteor', group: 'mage',
    skill: 'magery', minSkill: 85,
    cost: { mana: 45 }, cooldown: 25, castTime: 2.5, moving: false,
    range: 25, target: 'ground',
    effect: {
      kind: 'aoe', radius: 6, delay: 1.5, telegraph: true,
      spellDamage: { min: 90, max: 130, type: 'fire' },
    },
    description: 'A second and a half of shadow on the ground before anything happens.',
  }),
  a({
    id: 'arcaneMastery', name: 'Arcane Mastery', group: 'mage',
    skill: 'evaluatingIntelligence', minSkill: 80,
    cost: { mana: 0 }, cooldown: 0, castTime: 0, moving: true,
    range: 0, target: 'self', passive: true,
    effect: { kind: 'passiveMod', mods: { spellCrit: 0.1 } },
    description: 'You have read enough to know where the seams are. Ten percent more crits.',
  }),

  // --- Sorcerer ------------------------------------------------------------
  a({
    id: 'hex', name: 'Hex', group: 'mage',
    skill: 'mysticism', minSkill: 20, openAt: 0,
    cost: { mana: 8 }, cooldown: 6, castTime: 0, moving: true,
    range: SPELL_RANGE, target: 'enemy',
    effect: { kind: 'debuff', mods: { hitChance: -0.15, defence: -0.15 }, duration: 12 },
    description: 'It misses more and blocks less for twelve seconds, and does not know why.',
  }),
  a({
    id: 'stoneSkin', name: 'Stone Skin', group: 'mage',
    skill: 'mysticism', minSkill: 35,
    cost: { mana: 15 }, cooldown: 20, castTime: 0.5, moving: true,
    range: 0, target: 'self',
    effect: {
      kind: 'buff', mods: { armourRatingFlat: 30, runSpeed: -0.2 },
      duration: 12, targets: 'self',
    },
    description: 'Thirty armour for twelve seconds, and you walk like the stone you are wearing.',
  }),
  a({
    id: 'eldritchBolt', name: 'Eldritch Bolt', group: 'mage',
    skill: 'mysticism', minSkill: 30,
    cost: { mana: 10 }, cooldown: 2, castTime: 0, moving: true,
    range: SPELL_RANGE, target: 'enemy',
    effect: {
      kind: 'combo',
      parts: [
        { kind: 'spellDamage', min: 12, max: 20, type: 'energy' },
        { kind: 'control', effect: 'silence', duration: 2, chance: 0.2 },
      ],
    },
    description: 'Cheap, quick, and one time in five it stops them casting for two seconds.',
  }),
  a({
    id: 'ward', name: 'Ward', group: 'mage',
    skill: 'mysticism', minSkill: 50,
    cost: { mana: 25 }, cooldown: 30, castTime: 1.5, moving: false,
    range: 15, target: 'ground',
    effect: {
      kind: 'zone', zoneKind: 'ward', radius: 4, duration: 10,
      applies: { kind: 'buff', mods: { damageTaken: -0.3 }, targets: 'allies' },
    },
    description: 'Four metres of floor where everything hurts a third less, for ten seconds.',
  }),
  a({
    id: 'transmute', name: 'Transmute', group: 'mage',
    skill: 'mysticism', minSkill: 55, extraReq: { alchemy: 40 },
    cost: { mana: 20 }, cooldown: 20, castTime: 1, moving: false,
    range: 0, target: 'self',
    effect: { kind: 'utility', action: 'transmute', what: 'oreStack', tiers: 1, loss: 0.3 },
    description: 'One stack of ore becomes the tier above it, and you lose three tenths in the change.',
  }),
  a({
    id: 'spellPlague', name: 'Spell Plague', group: 'mage',
    skill: 'mysticism', minSkill: 65,
    cost: { mana: 30 }, cooldown: 18, castTime: 1.2, moving: false,
    range: SPELL_RANGE, target: 'enemy',
    effect: {
      kind: 'plague', initial: 25, type: 'poison',
      onSpellHit: { damage: 15, radius: 4 },
    },
    description: 'Twenty five poison, and after it every spell you land there bursts on its neighbours.',
  }),
  a({
    id: 'rift', name: 'Rift', group: 'mage',
    skill: 'mysticism', minSkill: 80,
    cost: { mana: 40 }, cooldown: 40, castTime: 2, moving: false,
    range: SPELL_RANGE, target: 'ground',
    effect: {
      kind: 'zone', zoneKind: 'rift', radius: 3, duration: 4,
      applies: {
        kind: 'combo',
        parts: [
          { kind: 'control', effect: 'pull', duration: 4, radius: 3 },
          { kind: 'dot', perSecond: 10, duration: 4, type: null },
        ],
      },
    },
    description: 'A three metre tear that drags monsters in and holds them there for four seconds.',
  }),
  a({
    id: 'elementalKin', name: 'Elemental Kin', group: 'mage',
    skill: 'mysticism', minSkill: 90,
    cost: { mana: 0 }, cooldown: 0, castTime: 0, moving: true,
    range: 0, target: 'self', passive: true,
    effect: {
      kind: 'passiveMod',
      mods: { fireResist: 0.15, coldResist: 0.15, poisonResist: 0.15, energyResist: 0.15 },
    },
    description: 'The elements stopped arguing with you. Fifteen percent off each of them.',
  }),

  // --- Necromancer ---------------------------------------------------------
  a({
    id: 'lifeDrain', name: 'Life Drain', group: 'necromancer',
    skill: 'necromancy', minSkill: 20, openAt: 0,
    cost: { mana: 8 }, cooldown: 4, castTime: 0, moving: true,
    range: SPELL_RANGE, target: 'enemy',
    effect: {
      kind: 'combo',
      parts: [
        { kind: 'spellDamage', min: 10, max: 16, type: null },
        { kind: 'leech', fraction: 0.5, of: 'damage' },
      ],
    },
    description: 'Half of what it loses arrives in you. The necromancer never needs a bandage.',
  }),
  a({
    id: 'raiseSkeleton', name: 'Raise Skeleton', group: 'necromancer',
    skill: 'necromancy', minSkill: 30,
    cost: { mana: 20 }, cooldown: 20, castTime: 1.5, moving: false,
    range: 6, target: 'corpse',
    effect: {
      kind: 'summon', creature: 'skeletonWarrior', source: 'corpse',
      duration: 60, durationPerSkill: 1, skill: 'spiritSpeak',
    },
    description: 'Any corpse within six metres gets up and takes your side.',
  }),
  a({
    id: 'summonImp', name: 'Summon Imp', group: 'necromancer',
    skill: 'necromancy', minSkill: 40,
    cost: { mana: 18 }, cooldown: 25, castTime: 1.2, moving: false,
    range: 5, target: 'ground',
    effect: {
      kind: 'summon', creature: 'imp', duration: 60, durationPerSkill: 1,
      skill: 'spiritSpeak', traits: ['fast', 'fireFlinging'],
    },
    description: 'Small, quick, and it throws fire from further back than you would.',
  }),
  a({
    id: 'boneSpear', name: 'Bone Spear', group: 'necromancer',
    skill: 'necromancy', minSkill: 45,
    cost: { mana: 14 }, cooldown: 5, castTime: 0.5, moving: true,
    range: SPELL_RANGE, target: 'enemy',
    effect: { kind: 'spellDamage', min: 26, max: 38, type: 'physical', line: true },
    description: 'It goes through the first one and keeps going down the line.',
  }),
  a({
    id: 'fear', name: 'Fear', group: 'necromancer',
    skill: 'necromancy', minSkill: 50,
    cost: { mana: 15 }, cooldown: 15, castTime: 0, moving: true,
    range: 6, target: 'self',
    effect: {
      kind: 'control', effect: 'fear', duration: 5, radius: 6,
      affects: ['beast', 'humanoid'],
    },
    description: 'Beasts and men within six metres run. Undead and constructs do not.',
  }),
  a({
    id: 'corpseExplosion', name: 'Corpse Explosion', group: 'necromancer',
    skill: 'necromancy', minSkill: 60,
    cost: { mana: 20 }, cooldown: 8, castTime: 0, moving: true,
    range: 10, target: 'corpse',
    effect: { kind: 'corpseBurst', searchRange: 10, min: 35, max: 50, radius: 4 },
    description: 'What you killed is still useful. It goes off for four metres around itself.',
  }),
  a({
    id: 'summonHound', name: 'Summon Hound', group: 'necromancer',
    skill: 'necromancy', minSkill: 65,
    cost: { mana: 28 }, cooldown: 30, castTime: 1.5, moving: false,
    range: 5, target: 'ground',
    effect: {
      kind: 'summon', creature: 'shadowHound', duration: 60,
      durationPerSkill: 1, skill: 'spiritSpeak', traits: ['fast', 'bleed'],
    },
    description: 'A shadow hound. Fast, and what it bites keeps bleeding.',
  }),
  a({
    id: 'curseOfWeakness', name: 'Curse of Weakness', group: 'necromancer',
    skill: 'spiritSpeak', minSkill: 50, openAt: 0,
    cost: { mana: 15 }, cooldown: 20, castTime: 0, moving: true,
    range: SPELL_RANGE, target: 'enemy',
    effect: { kind: 'debuff', mods: { damage: -0.2, armourRating: -0.2 }, duration: 15 },
    description: 'Fifteen seconds of hitting a fifth softer and wearing a fifth less armour.',
  }),
  a({
    id: 'lichForm', name: 'Lich Form', group: 'necromancer',
    skill: 'necromancy', minSkill: 85, extraReq: { spiritSpeak: 70 },
    cost: { mana: 50 }, cooldown: 120, castTime: 3, moving: false,
    range: 0, target: 'self',
    effect: {
      kind: 'buff', form: 'lich', duration: 30, targets: 'self',
      mods: { spellsCostHealth: true, necromancyDamage: 0.3, cannotBeHealed: true },
    },
    description: 'Thirty seconds where spells are paid for in blood and nobody can help you.',
  }),
  a({
    id: 'raiseChampion', name: 'Raise Champion', group: 'necromancer',
    skill: 'necromancy', minSkill: 95,
    cost: { mana: 60 }, cooldown: 180, castTime: 3, moving: false,
    range: 5, target: 'ground',
    effect: {
      kind: 'summon', creature: 'boneKnight', duration: 120,
      scalesWithCaster: true,
    },
    description: 'One bone knight, as strong as you are, for two minutes.',
  }),

  // --- Healer --------------------------------------------------------------
  a({
    id: 'heal', name: 'Heal', group: 'healer',
    skill: 'chivalry', minSkill: 20, openAt: 0,
    cost: { mana: 10 }, cooldown: 3, castTime: 0.8, moving: true,
    range: SPELL_RANGE, target: 'ally',
    effect: { kind: 'heal', base: 20, perSkill: 0.3, skill: 'chivalry' },
    description: 'Twenty and a share of your Chivalry, on anyone you can see.',
  }),
  a({
    id: 'cleanse', name: 'Cleanse', group: 'healer',
    skill: 'chivalry', minSkill: 35,
    cost: { mana: 12 }, cooldown: 8, castTime: 0, moving: true,
    range: SPELL_RANGE, target: 'ally',
    effect: { kind: 'cure', removes: ['poison', 'bleed'], curses: 1 },
    description: 'Poison, bleed and one curse, gone, with no wind up at all.',
  }),
  a({
    id: 'greaterHeal', name: 'Greater Heal', group: 'healer',
    skill: 'chivalry', minSkill: 50,
    cost: { mana: 22 }, cooldown: 6, castTime: 1.5, moving: false,
    range: SPELL_RANGE, target: 'ally',
    effect: { kind: 'heal', base: 50, perSkill: 0.6, skill: 'chivalry' },
    description: 'A second and a half of standing still buys fifty and more.',
  }),
  a({
    id: 'bless', name: 'Bless', group: 'healer',
    skill: 'chivalry', minSkill: 40,
    cost: { mana: 15 }, cooldown: 20, castTime: 0.5, moving: true,
    range: SPELL_RANGE, target: 'ally',
    effect: {
      kind: 'buff', stats: { str: 5, dex: 5, int: 5, con: 5, wis: 5 },
      duration: 30, targets: 'ally',
    },
    description: 'Five to everything for thirty seconds. Cheap, and it adds up in a party.',
  }),
  a({
    id: 'sanctuary', name: 'Sanctuary', group: 'healer',
    skill: 'chivalry', minSkill: 65,
    cost: { mana: 30 }, cooldown: 45, castTime: 1.5, moving: false,
    range: 15, target: 'ground',
    effect: {
      kind: 'zone', zoneKind: 'sanctuary', radius: 5, duration: 6,
      applies: { kind: 'buff', mods: { untargetable: true }, targets: 'allies' },
    },
    description: 'Five metres where nothing can be attacked, for six seconds. Long enough.',
  }),
  a({
    id: 'consecrateWeapon', name: 'Consecrate Weapon', group: 'healer',
    skill: 'chivalry', minSkill: 45,
    cost: { mana: 12 }, cooldown: 15, castTime: 0, moving: true,
    range: 0, target: 'self',
    effect: {
      kind: 'weaponEnchant', damageType: 'holy', vs: 'undead', mult: 1.5,
      duration: 20,
    },
    description: 'Twenty seconds where your blade means half again to anything already dead.',
  }),
  a({
    id: 'smite', name: 'Smite', group: 'healer',
    skill: 'chivalry', minSkill: 60,
    cost: { mana: 18 }, cooldown: 10, castTime: 0, moving: true,
    range: SPELL_RANGE, target: 'enemy',
    effect: { kind: 'spellDamage', min: 30, max: 45, type: 'energy', vs: { undead: 2 } },
    description: 'Thirty to forty five, and twice that on the undead.',
  }),
  a({
    id: 'resurrect', name: 'Resurrect', group: 'healer',
    skill: 'healing', minSkill: 80,
    anyOf: [
      { all: [{ skill: 'healing', min: 80 }, { skill: 'anatomy', min: 80 }] },
      { all: [{ skill: 'chivalry', min: 85 }] },
    ],
    cost: { mana: 40 }, cooldown: 60, castTime: 5, moving: false,
    range: 5, target: 'ally',
    effect: { kind: 'resurrect' },
    description: 'Five seconds of standing over them, and they get up where they fell.',
  }),
  a({
    id: 'layOnHands', name: 'Lay on Hands', group: 'healer',
    skill: 'chivalry', minSkill: 90,
    cost: { mana: 50 }, cooldown: 90, castTime: 0, moving: true,
    range: 5, target: 'ally',
    effect: { kind: 'heal', toFull: true, once: true },
    description: 'All of it, at once, and then a minute and a half of not being able to.',
  }),

  // --- Rogue ---------------------------------------------------------------
  a({
    id: 'hide', name: 'Hide', group: 'rogue',
    skill: 'hiding', minSkill: 0,
    cost: { stamina: 10 }, cooldown: 8, castTime: 1, moving: false,
    range: 0, target: 'self',
    effect: {
      kind: 'stealth', requiresStill: true, movementNeedsSkill: 'stealth',
      dropAggro: false, instant: false,
    },
    description: 'Stand still for a second and you are not there. Stealth is what lets you walk.',
  }),
  a({
    id: 'dualStrike', name: 'Dual Strike', group: 'rogue',
    skill: 'fencing', minSkill: 30,
    cost: { stamina: 15 }, cooldown: 5, castTime: 0, moving: true,
    range: MELEE_RANGE, target: 'enemy',
    needs: { kind: 'dualDaggers', skills: ['fencing'], bases: ['dagger'] },
    effect: {
      kind: 'combo',
      parts: [
        { kind: 'damageMult', value: 0.75 },
        { kind: 'damageMult', value: 1, hand: 'offHand' },
      ],
    },
    description: 'Two short cuts, one from each hand. It needs a dagger in both hands.',
  }),
  a({
    id: 'backstab', name: 'Backstab', group: 'rogue',
    skill: 'fencing', minSkill: 40, extraReq: { hiding: 30 },
    cost: { stamina: 20 }, cooldown: 6, castTime: 0, moving: true,
    range: MELEE_RANGE, target: 'enemy',
    effect: {
      kind: 'damageMult', value: 3, nextSwing: true,
      requires: 'behindOrHidden',
    },
    description: 'From behind, or out of hiding, three times the damage. From the front, nothing.',
  }),
  a({
    id: 'deepCut', name: 'Deep Cut', group: 'rogue',
    skill: 'fencing', minSkill: 45,
    cost: { stamina: 18 }, cooldown: 8, castTime: 0, moving: true,
    range: MELEE_RANGE, target: 'enemy',
    effect: {
      kind: 'combo',
      parts: [
        { kind: 'damageMult', value: 0.75 },
        { kind: 'dot', perSecond: 3, duration: 6, type: 'physical' },
      ],
    },
    description: 'A small cut in the right place, and it keeps opening for six seconds.',
  }),
  a({
    id: 'throwingKnife', name: 'Throwing Knife', group: 'rogue',
    skill: 'fencing', minSkill: 35,
    cost: { stamina: 12 }, cooldown: 6, castTime: 0, moving: true,
    range: 8, target: 'enemy',
    needs: { kind: 'melee', skills: ['fencing'] },
    effect: { kind: 'spellDamage', min: 8, max: 14, type: 'physical', line: true },
    description: 'A knife leaves the hand at short range. Not much weight, but it arrives.',
  }),
  a({
    id: 'poisonBlade', name: 'Poison Blade', group: 'rogue',
    skill: 'poisoning', minSkill: 30, openAt: 0,
    cost: { item: 'poisonVial', count: 1 }, cooldown: 0, castTime: 0, moving: true,
    range: 0, target: 'self',
    effect: {
      kind: 'weaponEnchant', damageType: 'poison', hits: 5,
      levelPerSkill: 0.05, skill: 'poisoning',
    },
    description: 'Five hits carry poison at your Poisoning divided by twenty.',
  }),
  a({
    id: 'kidneyShot', name: 'Kidney Shot', group: 'rogue',
    skill: 'fencing', minSkill: 55, extraReq: { hiding: 40 },
    cost: { stamina: 25 }, cooldown: 18, castTime: 0, moving: true,
    range: MELEE_RANGE, target: 'enemy',
    effect: {
      kind: 'combo',
      parts: [
        { kind: 'damageMult', value: 0.5, requires: 'behindOrHidden' },
        { kind: 'control', effect: 'stun', duration: 2, requires: 'behindOrHidden' },
      ],
    },
    description: 'A short stun from behind, or from hiding. Expensive, and worth the breath.',
  }),
  a({
    id: 'finishingStrike', name: 'Finishing Strike', group: 'rogue',
    skill: 'fencing', minSkill: 60,
    cost: { stamina: 22 }, cooldown: 10, castTime: 0, moving: true,
    range: MELEE_RANGE, target: 'enemy',
    effect: { kind: 'damageMult', value: 2, requires: 'targetBelowHalf' },
    description: 'When the wound is winning, this makes it final.',
  }),
  a({
    id: 'shadowstep', name: 'Shadowstep', group: 'rogue',
    skill: 'stealth', minSkill: 60,
    cost: { stamina: 20 }, cooldown: 15, castTime: 0, moving: true,
    range: 10, target: 'enemy',
    effect: { kind: 'move', mode: 'shadowstep', distance: 10, direction: 'behindTarget' },
    description: 'Ten metres and you are behind it, which is where Backstab wants you.',
  }),
  a({
    id: 'vanish', name: 'Vanish', group: 'rogue',
    skill: 'hiding', minSkill: 70,
    cost: { stamina: 30 }, cooldown: 60, castTime: 0, moving: true,
    range: 0, target: 'self',
    effect: {
      kind: 'stealth', instant: true, dropAggro: true, inCombat: true,
      requiresStill: false,
    },
    description: 'Out of a fight, instantly, with everything forgetting it was chasing you.',
  }),
  a({
    id: 'pickPocket', name: 'Pick Pocket', group: 'rogue',
    skill: 'stealing', minSkill: 30, openAt: 0,
    cost: { stamina: 10 }, cooldown: 30, castTime: 1, moving: false,
    range: MELEE_RANGE, target: 'enemy',
    effect: { kind: 'utility', action: 'steal', from: 'humanoid', what: ['gold', 'commonItem'] },
    description: 'Gold, or something common, off a humanoid that has not noticed you yet.',
  }),
  a({
    id: 'evasion', name: 'Evasion', group: 'rogue',
    skill: 'fencing', minSkill: 60, extraReq: { dex: 70 },
    cost: { stamina: 25 }, cooldown: 45, castTime: 0, moving: true,
    range: 0, target: 'self',
    effect: { kind: 'buff', mods: { dodgeAll: true }, duration: 4, targets: 'self' },
    description: 'Four seconds where nothing lands. Pick them carefully.',
  }),
  a({
    id: 'exposeWeakness', name: 'Expose Weakness', group: 'rogue',
    skill: 'anatomy', minSkill: 60,
    cost: { stamina: 15 }, cooldown: 20, castTime: 0, moving: true,
    range: 5, target: 'enemy',
    effect: {
      kind: 'mark', damageTakenMult: 1.25, duration: 10, fromCasterOnly: false,
    },
    description: 'You point at the gap and everyone else gets a quarter more for ten seconds.',
  }),

  // --- Bard ----------------------------------------------------------------
  a({
    id: 'provoke', name: 'Provoke', group: 'bard',
    skill: 'provocation', minSkill: 20, openAt: 0,
    cost: { stamina: 15 }, cooldown: 12, castTime: 1, moving: false,
    range: 15, target: 'enemy',
    effect: { kind: 'control', effect: 'provoke', duration: 20, targets: 2 },
    description: 'Two monsters decide the other one started it, and settle it for twenty seconds.',
  }),
  a({
    id: 'peace', name: 'Peace', group: 'bard',
    skill: 'peacemaking', minSkill: 20, openAt: 0,
    cost: { stamina: 15 }, cooldown: 15, castTime: 1, moving: false,
    range: 8, target: 'self',
    effect: {
      kind: 'control', effect: 'pacify', duration: 8, radius: 8, dropsAggro: true,
    },
    description: 'Everything within eight metres stands down for eight seconds and forgets you.',
  }),
  a({
    id: 'discord', name: 'Discord', group: 'bard',
    skill: 'discordance', minSkill: 20, openAt: 0,
    cost: { stamina: 15 }, cooldown: 15, castTime: 1, moving: false,
    range: 15, target: 'enemy',
    effect: { kind: 'debuff', mods: { allStats: -0.2, allSkills: -0.2 }, duration: 20 },
    description: 'A fifth off everything it has, for twenty seconds, while it can hear you.',
  }),
  a({
    id: 'marchingSong', name: 'Marching Song', group: 'bard',
    skill: 'musicianship', minSkill: 40, openAt: 0,
    cost: { stamina: 10 }, cooldown: 30, castTime: 0, moving: true,
    range: 12, target: 'self',
    effect: {
      kind: 'buff', mods: { runSpeed: 0.15 }, duration: 30, radius: 12,
      targets: 'selfAndAllies',
    },
    description: 'Half a minute of everyone within twelve metres moving fifteen percent quicker.',
  }),
  a({
    id: 'warDrum', name: 'War Drum', group: 'bard',
    skill: 'musicianship', minSkill: 60,
    cost: { stamina: 20 }, cooldown: 30, castTime: 0, moving: true,
    range: 12, target: 'self',
    effect: {
      kind: 'buff', mods: { damage: 0.1, swingSpeed: 0.1 }, duration: 20,
      radius: 12, targets: 'selfAndAllies',
    },
    description: 'Ten percent more damage and ten percent faster swings for twenty seconds.',
  }),
  a({
    id: 'lullaby', name: 'Lullaby', group: 'bard',
    skill: 'peacemaking', minSkill: 70,
    cost: { stamina: 30 }, cooldown: 60, castTime: 2, moving: false,
    range: 10, target: 'self',
    effect: {
      kind: 'control', effect: 'sleep', duration: 6, radius: 10,
      breakOnDamage: true,
    },
    description: 'Ten metres of sleeping, six seconds, or until somebody hits one of them.',
  }),

  // --- Everyone ------------------------------------------------------------
  a({
    id: 'jump', name: 'Jump', group: 'everyone',
    skill: null, minSkill: 0,
    cost: { stamina: 5 }, cooldown: 0, castTime: 0, moving: true,
    range: 0, target: 'self',
    effect: { kind: 'move', mode: 'jump', height: 1.2 },
    description: 'One metre twenty. A swing taken in the air is a jump attack.',
  }),
  a({
    id: 'sprint', name: 'Sprint', group: 'everyone',
    skill: null, minSkill: 0,
    cost: { stamina: 3, perSecond: true }, cooldown: 0, castTime: 0, moving: true,
    range: 0, target: 'self',
    effect: {
      kind: 'buff', mods: { sprinting: true }, duration: null, channelled: true,
      targets: 'self',
    },
    description: 'Hold shift. Three stamina a second for as long as you can pay it.',
  }),
  a({
    // The document lists Bandage twice, in the Healer table and in Everyone.
    // It is one ability; `alsoIn` records the other table.
    id: 'bandage', name: 'Bandage', group: 'everyone', alsoIn: ['healer'],
    skill: 'healing', minSkill: 0,
    cost: { item: 'bandage', count: 1 }, cooldown: 0, castTime: 4, moving: false,
    range: MELEE_RANGE, target: 'ally',
    effect: {
      kind: 'bandage', seconds: 4, perHealing: 0.4, perAnatomy: 0.2,
      curePoisonAt: 60, resurrectAt: { healing: 80, anatomy: 80 },
      interruptedByDamage: true,
    },
    description: 'Four seconds of binding. Anyone can do it; Anatomy decides how well.',
  }),
  a({
    id: 'meditate', name: 'Meditate', group: 'everyone',
    skill: 'meditation', minSkill: 0,
    cost: { stamina: 0 }, cooldown: 0, castTime: 0, moving: false, stationary: true,
    range: 0, target: 'self',
    effect: { kind: 'utility', action: 'meditate', manaRegenMult: 3, breaks: 'anything' },
    description: 'Sit still and mana comes back three times as fast, until anything at all happens.',
  }),
  a({
    id: 'camp', name: 'Camp', group: 'everyone',
    skill: 'camping', minSkill: 20, openAt: 0,
    cost: { item: 'wood', count: 1 }, cooldown: 0, castTime: 0, moving: false, stationary: true,
    range: 0, target: 'ground',
    effect: { kind: 'utility', action: 'camp', grants: 'rested', safeLogout: true },
    description: 'A fire, a rested bonus, and the only place it is safe to log out.',
  }),
  a({
    // Everyone's way home (asked 2026-09-08): three seconds of standing still
    // with the spell gathering, and you are on the green at Haven. Two minutes
    // between one and the next, so it is a way home and not a way out of a fight.
    id: 'recall', name: 'Recall', group: 'everyone',
    skill: null, minSkill: 0,
    cost: { stamina: 10 }, cooldown: 120, castTime: 3, moving: false, rooted: true,
    range: 0, target: 'self',
    effect: { kind: 'utility', action: 'recall' },
    description: 'The road folds up under you. Three seconds standing still, and you are home on the green.',
  }),
];

export const ABILITIES_BY_ID = Object.fromEntries(ABILITIES.map((x) => [x.id, x]));

/**
 * The ability tables in docs/mmo/04-CLASSES-ABILITIES.md hold 85 rows. Bandage
 * is written twice, once under Healer and once under Everyone, and is one
 * ability, so the table above holds 84. abilities.test.mjs parses the document
 * and asserts both numbers rather than taking this comment on trust.
 */
export const ABILITY_COUNT = 84;   // 83, and Recall (2026-09-08)
export const ABILITY_DOC_ROWS = 85;

// The sorcerer's list (the Mysticism tree) folded into the Wizard's on
// 2026-09-08: "combine the abilities of mystics, sorcerers and mages, they'll
// all be one class now". The rows keep their Mysticism requirements; the
// Wizard opening starts with the skill so the whole list is reachable.
export const GROUPS = [
  'warrior', 'ranger', 'mage', 'necromancer', 'healer', 'rogue',
  'bard', 'everyone',
];

// ---------------------------------------------------------------------------
// Requirements
// ---------------------------------------------------------------------------

function skillValue(skills, id) {
  const v = skills?.[id];
  return typeof v === 'number' ? v : 0;
}

function statValue(stats, id) {
  const v = stats?.[id];
  return typeof v === 'number' ? v : 0;
}

/** The character's value for whichever skill this ability actually gates on. */
export function gatingSkillValue(ability, skills) {
  if (ability.skillAny) {
    return ability.skillAny.reduce((best, id) => Math.max(best, skillValue(skills, id)), 0);
  }
  if (!ability.skill) return Infinity; // Jump and Sprint gate on nothing.
  return skillValue(skills, ability.skill);
}

function branchMet(branch, skills) {
  return branch.all.every((c) => skillValue(skills, c.skill) >= c.min);
}

/** A skill or stat number as a player reads it: 33.4, 50, 0. Never 33.40000001. */
export function skillNumber(v) {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : 0;
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

/**
 * ONE PLACE THAT SAYS WHAT A ROW COSTS IN SKILL, because until now there were
 * two: `meetsRequirements` wrote the runtime's refusal ("Hex needs Mysticism
 * 20") and win_abilities.js wrote the card's line ("unlocks at Mysticism 20,
 * you are at 0"), and neither carried the other's half. The card knew your
 * number and the refusal did not; the refusal was what you heard when you
 * pressed the key. Both now come from here, so the sentence on the card, the
 * sentence in the bar's tooltip and the sentence the key answers with are the
 * same sentence.
 *
 * Returns `[{ id, label, need, have, met, stat, branch }]`, one entry per
 * clause, in the order a player should read them: the gate, then every
 * `extraReq`. `branch` is the index of the `anyOf` route a clause belongs to,
 * or null for a clause that is required whichever route you take.
 *
 * An `anyOf` row (Snare and Resurrect, and only those two) reports EVERY
 * branch, because "Healing 80 and Anatomy 80, or Chivalry 85" is two doors and
 * hiding one of them would send a paladin down the physician's road.
 *
 * `skillAny` (Power Strike, Whirlwind, Leap Slam) names the ONE weapon skill
 * the character is best at, which is the number the gate actually reads. A
 * warrior at Swordsmanship 33.4 is told about Swordsmanship, not about "a
 * weapon skill", because the first is a sentence and the second is a shrug.
 */
export function requirementClauses(ability, skills = {}, stats = {}) {
  const parts = [];
  if (!ability) return parts;

  if (ability.anyOf) {
    ability.anyOf.forEach((branch, i) => {
      for (const c of branch.all) {
        const have = skillValue(skills, c.skill);
        parts.push({
          id: c.skill, label: KNOWN_SKILLS[c.skill] || c.skill,
          need: c.min, have, met: have >= c.min, stat: false, branch: i,
        });
      }
    });
  } else if (ability.skillAny) {
    const id = ability.skillAny.reduce(
      (best, s) => (skillValue(skills, s) > skillValue(skills, best) ? s : best),
      ability.skillAny[0],
    );
    const have = skillValue(skills, id);
    if (ability.openAt > 0) {
      parts.push({
        id, label: KNOWN_SKILLS[id] || id,
        need: ability.openAt, have, met: have >= ability.openAt, stat: false, branch: null,
      });
    }
  } else if (ability.skill && ability.openAt > 0) {
    const have = skillValue(skills, ability.skill);
    parts.push({
      id: ability.skill, label: KNOWN_SKILLS[ability.skill] || ability.skill,
      need: ability.openAt, have, met: have >= ability.openAt, stat: false, branch: null,
    });
  }

  for (const [key, need] of Object.entries(ability.extraReq || {})) {
    if (STAT_IDS.includes(key)) {
      const have = statValue(stats, key);
      parts.push({ id: key, label: STAT_LABELS[key] || key, need, have, met: have >= need, stat: true, branch: null });
    } else {
      const have = skillValue(skills, key);
      parts.push({ id: key, label: KNOWN_SKILLS[key] || key, need, have, met: have >= need, stat: false, branch: null });
    }
  }
  return parts;
}

/** "Mysticism 20, you are at 0" when it is missing, "Mysticism 20" when it is not. */
export function clauseText(part) {
  if (!part) return '';
  const head = `${part.label} ${part.need}`;
  return part.met ? head : `${head}, you are at ${skillNumber(part.have)}`;
}

/**
 * "Needs Mysticism 20, you are at 0". '' for Jump and Sprint, which need
 * nothing. Branches of an `anyOf` are joined with ", or"; everything else with
 * " and", so a clause's own comma never has a second one next to it.
 */
export function requirementSentence(ability, skills = {}, stats = {}) {
  const parts = requirementClauses(ability, skills, stats);
  if (!parts.length) return '';
  const groups = [];
  let last = 'x';
  for (const p of parts) {
    const key = p.branch == null ? 'all' : `branch${p.branch}`;
    if (key !== last) { groups.push([]); last = key; }
    groups[groups.length - 1].push(p);
  }
  return `Needs ${groups.map((g) => g.map(clauseText).join(' and ')).join(', or ')}`;
}

/**
 * The same sentence with the ability's name on the front, which is what a
 * refusal has to say: the card is titled and the log line is not.
 * "Hex needs Mysticism 20, you are at 0".
 */
export function requirementRefusal(ability, skills = {}, stats = {}) {
  const sentence = requirementSentence(ability, skills, stats);
  if (!sentence) return '';
  return `${ability.name} n${sentence.slice(1)}`;
}

/**
 * `{ ok }` or `{ ok: false, reason }` for the unlock gate alone.
 *
 * The yes path allocates nothing: this is asked for every row on every skill
 * gain (progression.unlockedIds) and for twelve bar cells on every frame
 * (abilities_runtime.barView), and building a clause list to answer "yes"
 * times a lesson would be a garbage collector's afternoon. The sentence is
 * built only when the answer is no, and then it is the card's own sentence.
 */
export function meetsRequirements(ability, skills = {}, stats = {}) {
  let ok = true;
  if (ability.anyOf) ok = ability.anyOf.some((b) => branchMet(b, skills));
  else if (gatingSkillValue(ability, skills) < ability.openAt) ok = false;
  if (ok && ability.extraReq) {
    for (const [key, need] of Object.entries(ability.extraReq)) {
      if (STAT_IDS.includes(key)) { if (statValue(stats, key) < need) { ok = false; break; } }
      else if (skillValue(skills, key) < need) { ok = false; break; }
    }
  }
  if (ok) return { ok: true };
  return { ok: false, reason: requirementRefusal(ability, skills, stats) };
}

/**
 * HOW OFTEN A ROW USED BELOW ITS MARK ACTUALLY WORKS.
 *
 * `openAt` lets a character hold the first rung of a school at 0. This is what
 * stops that from being a free gift: at `openAt` the attempt is a fumble
 * nineteen times in twenty, at `minSkill` it always works, and in between it
 * climbs in a straight line. A fumble still teaches, at the reduced chance
 * skills.js gives a failed lesson, which is the whole point of being allowed
 * to try.
 *
 * 1 for every row a character has actually reached, so nothing that worked
 * before this field existed rolls a die now.
 */
export const PRACTICE_FLOOR = 0.05;

export function practiceChance(ability, skills = {}) {
  if (!ability) return 1;
  const mark = ability.minSkill ?? 0;
  const open = ability.openAt ?? mark;
  if (mark <= open) return 1;
  const have = gatingSkillValue(ability, skills);
  if (!Number.isFinite(have) || have >= mark) return 1;
  const along = (have - open) / (mark - open);
  const p = PRACTICE_FLOOR + Math.max(0, Math.min(1, along)) * (1 - PRACTICE_FLOOR);
  return Math.max(PRACTICE_FLOOR, Math.min(1, p));
}

/** True while this row is being practised: held, but not yet earned. */
export function isPractice(ability, skills = {}) {
  return practiceChance(ability, skills) < 1;
}

/**
 * The line the card and the bar's tooltip show for a row being practised, with
 * the two numbers it is promising so nothing here is a feeling the code does
 * not keep. '' for a row at or above its mark.
 */
export function practiceText(ability, skills = {}) {
  if (!ability || !isPractice(ability, skills)) return '';
  const chance = Math.round(practiceChance(ability, skills) * 100);
  const label = ability.skillAny
    ? 'a weapon skill'
    : KNOWN_SKILLS[ability.skill] || 'the skill';
  return `You are below the mark for this: ${chance} in 100 land, the rest fumble and teach. It comes good at ${label} ${ability.minSkill}.`;
}

/** Every ability this spread of skills and stats may use. */
export function unlockedFor(skills = {}, stats = {}, list = ABILITIES) {
  return list.filter((ability) => meetsRequirements(ability, skills, stats).ok);
}

// ---------------------------------------------------------------------------
// Costs
// ---------------------------------------------------------------------------

/** Which of the three kinds this ability's cost is. */
export function costKind(ability) {
  for (const k of COST_KINDS) if (k in ability.cost) return k;
  return null;
}

/**
 * "Mana cost is base * (1 - lowerManaCost)". Returns the mana this character
 * actually pays, floored at zero.
 */
export function manaCostFor(ability, character = {}) {
  if (costKind(ability) !== 'mana') return 0;
  const reduction = character.lowerManaCost ?? 0;
  return Math.max(0, ability.cost.mana * (1 - reduction));
}

// ---------------------------------------------------------------------------
// canUse
// ---------------------------------------------------------------------------

/**
 * `character` is `{ skills, stats, stamina, mana, health, maxHealth, items,
 * cooldowns, moving, hasShield, lowerManaCost, form }`.
 * `cooldowns[id]` is the time, on the same seconds clock as `now`, at which
 * the ability comes back.
 *
 * Returns `{ ok: true }` or `{ ok: false, reason }`.
 */
export function canUse(ability, character = {}, now = 0) {
  if (!ability) return { ok: false, reason: 'no such ability' };

  const req = meetsRequirements(ability, character.skills, character.stats);
  if (!req.ok) return { ok: false, reason: req.reason };

  if (ability.passive) {
    return { ok: false, reason: `${ability.name} is always on and is not used` };
  }

  // What is in your hands, before what is in your pools. A character with no
  // `equipment` field at all is a fixture that predates the rule, and the
  // check is skipped for it rather than refusing every ability in the table.
  if (character.equipment !== undefined) {
    const hands = weaponCheck(ability, character.equipment, character.pack ?? character.items ?? null);
    if (!hands.ok) return { ok: false, reason: hands.reason };
  }

  const readyAt = character.cooldowns?.[ability.id];
  if (typeof readyAt === 'number' && now < readyAt) {
    const left = readyAt - now;
    return { ok: false, reason: `${ability.name} is on cooldown for ${left.toFixed(1)} s` };
  }

  const kind = costKind(ability);
  if (kind === 'stamina') {
    const need = ability.cost.stamina;
    if ((character.stamina ?? 0) < need) {
      return { ok: false, reason: `${ability.name} costs ${need} stamina and you have ${character.stamina ?? 0}` };
    }
  } else if (kind === 'mana') {
    const need = manaCostFor(ability, character);
    // Lich Form: "spells cost health not mana".
    if (character.form === 'lich') {
      if ((character.health ?? 0) <= need) {
        return { ok: false, reason: `${ability.name} costs ${need} health in lich form and you have ${character.health ?? 0}` };
      }
    } else if ((character.mana ?? 0) < need) {
      return { ok: false, reason: `${ability.name} costs ${need} mana and you have ${character.mana ?? 0}` };
    }
  } else if (kind === 'item') {
    const have = itemsHeld(character, ability.cost.item);
    const need = ability.cost.count ?? 1;
    if (have < need) {
      return { ok: false, reason: `${ability.name} needs ${need} ${costItemWords(ability.cost.item)} in your pack and you have ${have}` };
    }
  }

  if (character.moving && (ability.rooted || ability.stationary)) {
    return { ok: false, reason: `${ability.name} roots you; stand still to use it` };
  }

  if (ability.requiresShield && !character.hasShield) {
    return { ok: false, reason: `${ability.name} needs a shield` };
  }

  return { ok: true };
}

// ---------------------------------------------------------------------------
// Casting
// ---------------------------------------------------------------------------

/**
 * Begin a cast. Returns a cast record, or `{ error }` when canUse refuses.
 * The caller writes `cooldownUntil` back into `character.cooldowns[id]` and
 * subtracts the cost; this function changes nothing.
 */
export function startCast(ability, character = {}, now = 0, target = null) {
  const check = canUse(ability, character, now);
  if (!check.ok) return { error: check.reason };

  const kind = costKind(ability);
  return {
    abilityId: ability.id,
    name: ability.name,
    startedAt: now,
    endsAt: now + ability.castTime,
    castTime: ability.castTime,
    rooted: ability.rooted,
    cooldownUntil: now + ability.cooldown,
    cost: kind === 'mana'
      ? { kind, amount: manaCostFor(ability, character), paidIn: character.form === 'lich' ? 'health' : 'mana' }
      : kind === 'stamina'
        ? { kind, amount: ability.cost.stamina }
        : { kind, item: ability.cost.item, amount: ability.cost.count ?? 1 },
    /** Focus and max health are frozen at the start; interruptRule reads them. */
    focus: skillValue(character.skills, 'focus'),
    maxHealth: character.maxHealth ?? 0,
    target,
    interrupted: false,
  };
}

/**
 * INVENTED, because the document says only "Focus reduces the interrupt
 * chance". Linear from certain at Focus 0 to one time in five at Focus 100,
 * and strictly decreasing over the whole range.
 */
export function interruptChance(focus = 0) {
  const raw = 1 - focus / 125;
  return Math.min(1, Math.max(0.2, raw));
}

/**
 * "castTime > 0 roots you for that long and is interrupted by moving or by
 * taking damage over 10% of your health (Focus reduces the interrupt chance)."
 *
 * The parenthetical is read as applying to the damage case: moving out of a
 * rooted cast always ends it, since you chose to move.
 *
 * `event` is `{ type: 'move' }` or `{ type: 'damage', amount, maxHealth? }`,
 * optionally carrying `roll`, a 0 to 1 number from the caller's seeded
 * generator. With no roll the chance is compared against 1, so only a certain
 * interrupt fires.
 *
 * Returns `{ interrupted, chance, reason }`.
 */
export function interruptRule(castRecord, event = {}) {
  if (!castRecord || !castRecord.rooted) {
    return { interrupted: false, chance: 0, reason: 'nothing rooted to interrupt' };
  }
  if (castRecord.interrupted) {
    return { interrupted: true, chance: 1, reason: 'already interrupted' };
  }

  if (event.type === 'move') {
    return { interrupted: true, chance: 1, reason: `moving ends ${castRecord.name}` };
  }

  if (event.type === 'damage') {
    const maxHealth = event.maxHealth ?? castRecord.maxHealth ?? 0;
    if (maxHealth <= 0) {
      return { interrupted: false, chance: 0, reason: 'no max health to measure against' };
    }
    const share = event.amount / maxHealth;
    if (share <= 0.1) {
      return {
        interrupted: false,
        chance: 0,
        reason: `${event.amount} is ${(share * 100).toFixed(1)}% of health, not over 10%`,
      };
    }
    const chance = interruptChance(castRecord.focus ?? 0);
    const roll = typeof event.roll === 'number' ? event.roll : 1;
    const interrupted = roll < chance;
    return {
      interrupted,
      chance,
      reason: interrupted
        ? `${event.amount} damage broke ${castRecord.name}`
        : `Focus held ${castRecord.name} together`,
    };
  }

  return { interrupted: false, chance: 0, reason: `${event.type} does not interrupt` };
}

// ---------------------------------------------------------------------------
// Gain
// ---------------------------------------------------------------------------

/**
 * "Using an ability is a lesson in its skill at the ability's difficulty (its
 * minSkill + 20)." `skillAny` is carried through because the lesson belongs to
 * whichever weapon skill actually swung.
 */
export function lessonFor(ability) {
  return {
    skill: ability.skill,
    skillAny: ability.skillAny,
    difficulty: ability.minSkill + 20,
  };
}

// ---------------------------------------------------------------------------
// Spell damage
// ---------------------------------------------------------------------------

function findSpellDamage(effect) {
  if (!effect) return null;
  if (effect.kind === 'spellDamage') return effect;
  if (effect.kind === 'aoe' && effect.spellDamage) return effect.spellDamage;
  if (effect.kind === 'combo') {
    for (const part of effect.parts) {
      const found = findSpellDamage(part);
      if (found) return found;
    }
  }
  return null;
}

/**
 * `base * (1 + INT * 0.008 + EvaluatingIntelligence * 0.006 + spellDamage%)`
 * from the Mage section. `caster` is `{ stats, skills, spellDamage }`, where
 * `spellDamage` is the affix percentage as a fraction.
 *
 * Returns `{ min, max, mult, type }`, or null for a spell that deals none.
 */
export function spellDamage(spell, caster = {}) {
  const roll = findSpellDamage(spell?.effect);
  if (!roll) return null;
  const int = statValue(caster.stats, 'int');
  const evalInt = skillValue(caster.skills, 'evaluatingIntelligence');
  const bonus = caster.spellDamage ?? 0;
  const mult = 1 + int * 0.008 + evalInt * 0.006 + bonus;
  return { min: roll.min * mult, max: roll.max * mult, mult, type: roll.type ?? null };
}

// ---------------------------------------------------------------------------
// Load-time audit
// ---------------------------------------------------------------------------

function walkEffect(effect, visit) {
  if (!effect) return;
  visit(effect);
  if (effect.kind === 'combo') for (const p of effect.parts) walkEffect(p, visit);
  if (effect.applies) walkEffect(effect.applies, visit);
}

/**
 * Fails loudly if the table drifts. Runs on import against the real table;
 * tests run it against copies so a planted fault cannot break the module.
 */
export function auditAbilities(list = ABILITIES) {
  const seen = new Set();
  for (const ability of list) {
    if (seen.has(ability.id)) {
      throw new Error(`auditAbilities: duplicate ability id ${ability.id}`);
    }
    seen.add(ability.id);
  }

  const usedKinds = new Set();
  const usedNeeds = new Set();
  for (const ability of list) {
    const where = ability.id;

    if (!GROUPS.includes(ability.group)) {
      throw new Error(`auditAbilities: ${where} has group ${ability.group}`);
    }
    if (!TARGETS.includes(ability.target)) {
      throw new Error(`auditAbilities: ${where} targets ${ability.target}`);
    }

    // Every skill referenced must be in the local list.
    const refs = [];
    if (ability.skill) refs.push(ability.skill);
    if (ability.skillAny) refs.push(...ability.skillAny);
    if (ability.anyOf) for (const b of ability.anyOf) for (const c of b.all) refs.push(c.skill);
    if (ability.extraReq) {
      for (const key of Object.keys(ability.extraReq)) {
        if (!STAT_IDS.includes(key)) refs.push(key);
      }
    }
    walkEffect(ability.effect, (e) => {
      if (e.skill) refs.push(e.skill);
      if (Array.isArray(e.tiers)) for (const t of e.tiers) refs.push(t.skill);
      if (e.resurrectAt) refs.push(...Object.keys(e.resurrectAt));
      if (e.movementNeedsSkill) refs.push(e.movementNeedsSkill);
    });
    for (const id of refs) {
      if (!(id in KNOWN_SKILLS)) {
        throw new Error(`auditAbilities: ${where} names unknown skill ${id}`);
      }
    }

    // Exactly one cost kind.
    const kinds = COST_KINDS.filter((k) => k in ability.cost);
    if (kinds.length !== 1) {
      throw new Error(
        `auditAbilities: ${where} has ${kinds.length} cost kinds (${kinds.join(', ') || 'none'}); one of ${COST_KINDS.join(', ')} is required`,
      );
    }
    if (kinds[0] === 'item' && typeof ability.cost.item !== 'string') {
      throw new Error(`auditAbilities: ${where} has an item cost with no item`);
    }
    if (kinds[0] === 'item' && !COST_ITEM_WORDS[ability.cost.item]) {
      throw new Error(`auditAbilities: ${where} pays with ${ability.cost.item}, which COST_ITEM_WORDS has no player-facing name for`);
    }
    if (kinds[0] !== 'item' && typeof ability.cost[kinds[0]] !== 'number') {
      throw new Error(`auditAbilities: ${where} has a non numeric ${kinds[0]} cost`);
    }

    // The casting rule.
    if (ability.castTime > MAX_MOVING_CAST && ability.moving !== false) {
      throw new Error(
        `auditAbilities: ${where} casts for ${ability.castTime} s and is marked moving; a long cast roots you`,
      );
    }
    if (ability.castTime < 0) throw new Error(`auditAbilities: ${where} has a negative cast time`);
    if (ability.cooldown < 0) throw new Error(`auditAbilities: ${where} has a negative cooldown`);
    if (ability.rooted !== (ability.castTime > 0 && !ability.moving)) {
      throw new Error(`auditAbilities: ${where} rooted does not match its cast time`);
    }

    // The two marks. `openAt` is where the row appears and `minSkill` is where
    // it stops fumbling, so a row that opened ABOVE its own mark would be a
    // gate nothing can pass and a practice curve that runs backwards.
    if (typeof ability.openAt !== 'number' || ability.openAt < 0) {
      throw new Error(`auditAbilities: ${where} has openAt ${ability.openAt}`);
    }
    if (ability.openAt > ability.minSkill) {
      throw new Error(`auditAbilities: ${where} opens at ${ability.openAt} and is meant for ${ability.minSkill}`);
    }
    // A row held below its mark has to be attemptable at all: a passive is
    // never pressed and would sit on the bar as a promise nothing keeps.
    if (ability.openAt < ability.minSkill && ability.passive) {
      throw new Error(`auditAbilities: ${where} is passive and cannot be practised below its mark`);
    }
    // `requirementSentence` joins branches with ", or" and everything else
    // with " and", and a row with both would read as a third branch. No row
    // has both today; this is the line that fails when a fifth appears.
    if (ability.anyOf && ability.extraReq) {
      throw new Error(`auditAbilities: ${where} has both anyOf and extraReq, and no sentence can say that yet`);
    }
    if (ability.anyOf && ability.openAt !== ability.minSkill) {
      throw new Error(`auditAbilities: ${where} has anyOf and its own openAt; the branches are the gate`);
    }

    // Passives cost nothing and never fire.
    if (ability.passive) {
      const amount = ability.cost.stamina ?? ability.cost.mana ?? 0;
      if (amount !== 0 || ability.cooldown !== 0 || ability.castTime !== 0) {
        throw new Error(`auditAbilities: ${where} is passive but has a cost, cooldown or cast time`);
      }
    }

    // Effect kinds.
    if (!ability.effect) throw new Error(`auditAbilities: ${where} has no effect`);
    walkEffect(ability.effect, (e) => {
      if (!e.kind) throw new Error(`auditAbilities: ${where} has an effect part with no kind`);
      if (!EFFECT_KINDS.includes(e.kind)) {
        throw new Error(`auditAbilities: ${where} uses unknown effect kind ${e.kind}`);
      }
      usedKinds.add(e.kind);
    });

    if (!ability.description) throw new Error(`auditAbilities: ${where} has no description`);

    // What has to be in your hands. Every row answers, passive or not: a
    // passive that needs a shield is a passive that does nothing without one.
    const needs = weaponNeeds(ability);
    if (!needs || !NEEDS_KINDS.includes(needs.kind)) {
      throw new Error(`auditAbilities: ${where} needs ${needs && needs.kind}, which is not one of ${NEEDS_KINDS.join(', ')}`);
    }
    usedNeeds.add(needs.kind);
    if (needs.kind === 'melee' || needs.kind === 'anyMelee' || needs.kind === 'ranged' || needs.kind === 'dualDaggers') {
      if (!Array.isArray(needs.skills) || !needs.skills.length) {
        throw new Error(`auditAbilities: ${where} needs a ${needs.kind} weapon and names no skill`);
      }
      for (const id of needs.skills) {
        if (!(id in KNOWN_SKILLS)) throw new Error(`auditAbilities: ${where} needs unknown skill ${id}`);
        if (!Object.values(WEAPON_BASES).some((w) => w.skill === id && w.hands > 0)) {
          throw new Error(`auditAbilities: ${where} needs ${id}, and no weapon in the table trains it`);
        }
        if (!WEAPON_WORDS[id]) throw new Error(`auditAbilities: ${where} needs ${id}, which has no words to refuse in`);
      }
    }
    if (needs.kind === 'dualDaggers') {
      if (!Array.isArray(needs.bases) || !needs.bases.length) {
        throw new Error(`auditAbilities: ${where} needs dual daggers and names no dagger bases`);
      }
      for (const id of needs.bases) {
        if (!DAGGER_BASES.includes(id)) throw new Error(`auditAbilities: ${where} wants ${id}, which is not an off hand dagger base`);
      }
    }
    if (needs.kind === 'ranged') {
      if (!Array.isArray(needs.ammo) || !needs.ammo.length) {
        throw new Error(`auditAbilities: ${where} is a shot with no ammunition named`);
      }
      for (const id of needs.ammo) {
        if (!AMMO_BASES.includes(id)) throw new Error(`auditAbilities: ${where} wants ${id}, which is not ammunition`);
      }
      for (const id of needs.selfAmmo || []) {
        if (!WEAPON_BASES[id]) throw new Error(`auditAbilities: ${where} says ${id} is its own ammunition, and it is not a weapon`);
      }
    }
    if (needs.kind === 'instrument') {
      for (const id of needs.bases || []) {
        if (!INSTRUMENT_BASES.includes(id)) throw new Error(`auditAbilities: ${where} wants ${id}, which is not an instrument`);
      }
    }
    if (needs.kind === 'focus') {
      if (!isSpell(ability)) throw new Error(`auditAbilities: ${where} wants a focus and costs no mana, so it is not a spell`);
      if (!Array.isArray(needs.bases) || !needs.bases.length) {
        throw new Error(`auditAbilities: ${where} wants a focus and names none`);
      }
      for (const id of needs.bases) {
        if (!FOCUS_BASES.includes(id)) throw new Error(`auditAbilities: ${where} wants ${id}, which is not a focus`);
        if (!WEAPON_BASES[id]) throw new Error(`auditAbilities: ${where} wants ${id}, which is not a weapon`);
      }
    }
    // Both directions: a row that costs mana is a spell, and a spell either
    // wants a focus or is the one that enchants the blade in your hand.
    if (isSpell(ability) && needs.kind !== 'focus' && needs.kind !== 'anyMelee') {
      throw new Error(`auditAbilities: ${where} costs mana and needs ${needs.kind}; a spell wants a focus`);
    }
  }

  // Both directions: no declared kind goes unused.
  for (const kind of EFFECT_KINDS) {
    if (!usedKinds.has(kind)) {
      throw new Error(`auditAbilities: effect kind ${kind} is declared and never used`);
    }
  }

  // Both directions again: a kind nothing needs is a kind nobody maintains.
  for (const kind of NEEDS_KINDS) {
    if (!usedNeeds.has(kind)) {
      throw new Error(`auditAbilities: no ability needs ${kind}, and the kind is declared`);
    }
  }

  // The armour rule, both sides counted. Every spell is either burdened or
  // Chivalry and never both, no row that costs no mana is burdened, and the
  // nine holy rows are named rather than counted by hand, so a tenth Chivalry
  // spell (or a Magery row typed with `skill: 'chivalry'`) shows up here as a
  // changed list instead of as a mage who casts freely in plate.
  const spells = list.filter(isSpell);
  const holy = spells.filter(isChivalry).map((x) => x.id);
  const burdened = spells.filter(burdensInArmour);
  if (holy.length + burdened.length !== spells.length) {
    throw new Error(`auditAbilities: ${spells.length} spells, ${holy.length} holy and ${burdened.length} burdened; every spell is one or the other`);
  }
  if (burdened.some(isChivalry)) throw new Error('auditAbilities: a Chivalry row is in the burdened list');
  if (list.some((x) => !isSpell(x) && burdensInArmour(x))) {
    throw new Error('auditAbilities: something that costs no mana is burdened by armour');
  }
  const HOLY_ROWS = ['heal', 'cleanse', 'greaterHeal', 'bless', 'sanctuary', 'consecrateWeapon', 'smite', 'resurrect', 'layOnHands'];
  if (list.length === ABILITY_COUNT && holy.join(',') !== HOLY_ROWS.join(',')) {
    throw new Error(`auditAbilities: the Chivalry exemption covers ${holy.join(', ')}, and the rule was written for ${HOLY_ROWS.join(', ')}`);
  }

  if (list.length !== ABILITY_COUNT) {
    throw new Error(
      `auditAbilities: ${list.length} abilities, the document has ${ABILITY_COUNT} (${ABILITY_DOC_ROWS} rows, Bandage written twice)`,
    );
  }

  return true;
}

auditAbilities();
