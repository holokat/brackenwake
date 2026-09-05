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
  dagger: { name: 'Dagger', skill: 'fencing', hands: 1, ranged: false },
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
export const SHIELD_BASES = ['buckler', 'kite', 'tower'];
/** What a bard plays. The lute is the only instrument the item tables have. */
export const INSTRUMENT_BASES = ['lute'];
/** The stacking ammunition bases. Thrown knives are their own ammunition. */
export const AMMO_BASES = ['arrow', 'bolt'];

/** The bard's four skills. Every one of them is played on an instrument. */
export const BARD_SKILLS = ['musicianship', 'provocation', 'peacemaking', 'discordance'];

/** The eight answers weaponNeeds can give. */
export const NEEDS_KINDS = ['melee', 'anyMelee', 'unarmed', 'ranged', 'focus', 'shield', 'instrument', 'none'];

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
    const head = `${name} wants ${wordsFor(skills)} drawn and ${ammoWordsFor(needs.ammo)} in the pack`;
    if (!shot || !shot.ranged || !skills.includes(shot.skill)) {
      return { ok: false, reason: `${head}, and ${shot ? `${aName(shot)} is the wrong thing to shoot with` : 'your ranged slot is empty'}.` };
    }
    if (main) {
      return { ok: false, reason: `${head}, and ${aName(main)} is in your hand instead. Put it away to free your hands.` };
    }
    if ((needs.selfAmmo || []).includes(shot.id)) return { ok: true };
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
    minSkill: row.minSkill ?? 0,
    extraReq: row.extraReq ?? null,
    anyOf: row.anyOf ?? null,
    cost: row.cost,
    cooldown: row.cooldown,
    castTime: row.castTime,
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
    skill: 'tracking', minSkill: 40,
    cost: { stamina: 10 }, cooldown: 20, castTime: 0, moving: true,
    range: 30, target: 'enemy',
    effect: {
      kind: 'mark', damageTakenMult: 1.15, duration: 30, fromCasterOnly: true,
      preventsHide: true,
    },
    description: 'You have its scent. Fifteen percent more from you, and nowhere to hide.',
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
    skill: 'animalLore', minSkill: 50,
    cost: { stamina: 30 }, cooldown: 90, castTime: 2, moving: false,
    range: 30, target: 'self',
    effect: {
      kind: 'summon', creature: 'nearestWildBeast', source: 'nearestWild',
      duration: 30,
    },
    description: 'Whatever is closest and wild takes your side for half a minute.',
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
    id: 'hex', name: 'Hex', group: 'sorcerer',
    skill: 'mysticism', minSkill: 20,
    cost: { mana: 8 }, cooldown: 6, castTime: 0, moving: true,
    range: SPELL_RANGE, target: 'enemy',
    effect: { kind: 'debuff', mods: { hitChance: -0.15, defence: -0.15 }, duration: 12 },
    description: 'It misses more and blocks less for twelve seconds, and does not know why.',
  }),
  a({
    id: 'stoneSkin', name: 'Stone Skin', group: 'sorcerer',
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
    id: 'eldritchBolt', name: 'Eldritch Bolt', group: 'sorcerer',
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
    id: 'ward', name: 'Ward', group: 'sorcerer',
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
    id: 'transmute', name: 'Transmute', group: 'sorcerer',
    skill: 'mysticism', minSkill: 55, extraReq: { alchemy: 40 },
    cost: { mana: 20 }, cooldown: 20, castTime: 1, moving: false,
    range: 0, target: 'self',
    effect: { kind: 'utility', action: 'transmute', what: 'oreStack', tiers: 1, loss: 0.3 },
    description: 'One stack of ore becomes the tier above it, and you lose three tenths in the change.',
  }),
  a({
    id: 'spellPlague', name: 'Spell Plague', group: 'sorcerer',
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
    id: 'rift', name: 'Rift', group: 'sorcerer',
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
    id: 'elementalKin', name: 'Elemental Kin', group: 'sorcerer',
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
    skill: 'necromancy', minSkill: 20,
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
    skill: 'spiritSpeak', minSkill: 50,
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
    skill: 'chivalry', minSkill: 20,
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
    id: 'backstab', name: 'Backstab', group: 'rogue',
    skill: 'fencing', minSkill: 40, extraReq: { hiding: 30 },
    cost: { stamina: 20 }, cooldown: 10, castTime: 0, moving: true,
    range: MELEE_RANGE, target: 'enemy',
    effect: {
      kind: 'damageMult', value: 3, nextSwing: true,
      requires: 'behindOrHidden',
    },
    description: 'From behind, or out of hiding, three times the damage. From the front, nothing.',
  }),
  a({
    id: 'poisonBlade', name: 'Poison Blade', group: 'rogue',
    skill: 'poisoning', minSkill: 30,
    cost: { item: 'poisonVial', count: 1 }, cooldown: 0, castTime: 0, moving: true,
    range: 0, target: 'self',
    effect: {
      kind: 'weaponEnchant', damageType: 'poison', hits: 5,
      levelPerSkill: 0.05, skill: 'poisoning',
    },
    description: 'Five hits carry poison at your Poisoning divided by twenty.',
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
    skill: 'stealing', minSkill: 30,
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
    skill: 'provocation', minSkill: 20,
    cost: { stamina: 15 }, cooldown: 12, castTime: 1, moving: false,
    range: 15, target: 'enemy',
    effect: { kind: 'control', effect: 'provoke', duration: 20, targets: 2 },
    description: 'Two monsters decide the other one started it, and settle it for twenty seconds.',
  }),
  a({
    id: 'peace', name: 'Peace', group: 'bard',
    skill: 'peacemaking', minSkill: 20,
    cost: { stamina: 15 }, cooldown: 15, castTime: 1, moving: false,
    range: 8, target: 'self',
    effect: {
      kind: 'control', effect: 'pacify', duration: 8, radius: 8, dropsAggro: true,
    },
    description: 'Everything within eight metres stands down for eight seconds and forgets you.',
  }),
  a({
    id: 'discord', name: 'Discord', group: 'bard',
    skill: 'discordance', minSkill: 20,
    cost: { stamina: 15 }, cooldown: 15, castTime: 1, moving: false,
    range: 15, target: 'enemy',
    effect: { kind: 'debuff', mods: { allStats: -0.2, allSkills: -0.2 }, duration: 20 },
    description: 'A fifth off everything it has, for twenty seconds, while it can hear you.',
  }),
  a({
    id: 'marchingSong', name: 'Marching Song', group: 'bard',
    skill: 'musicianship', minSkill: 40,
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
    skill: 'camping', minSkill: 20,
    cost: { item: 'wood', count: 1 }, cooldown: 0, castTime: 0, moving: false, stationary: true,
    range: 0, target: 'ground',
    effect: { kind: 'utility', action: 'camp', grants: 'rested', safeLogout: true },
    description: 'A fire, a rested bonus, and the only place it is safe to log out.',
  }),
];

export const ABILITIES_BY_ID = Object.fromEntries(ABILITIES.map((x) => [x.id, x]));

/**
 * The ability tables in docs/mmo/04-CLASSES-ABILITIES.md hold 79 rows. Bandage
 * is written twice, once under Healer and once under Everyone, and is one
 * ability, so the table above holds 78. abilities.test.mjs parses the document
 * and asserts both numbers rather than taking this comment on trust.
 */
export const ABILITY_COUNT = 78;
export const ABILITY_DOC_ROWS = 79;

export const GROUPS = [
  'warrior', 'ranger', 'mage', 'sorcerer', 'necromancer', 'healer', 'rogue',
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

function extraReqFailure(ability, skills, stats) {
  if (!ability.extraReq) return null;
  for (const [key, need] of Object.entries(ability.extraReq)) {
    if (STAT_IDS.includes(key)) {
      if (statValue(stats, key) < need) return `${STAT_LABELS[key]} ${need}`;
    } else {
      if (skillValue(skills, key) < need) return `${KNOWN_SKILLS[key]} ${need}`;
    }
  }
  return null;
}

function branchMet(branch, skills) {
  return branch.all.every((c) => skillValue(skills, c.skill) >= c.min);
}

/** `{ ok }` or `{ ok: false, reason }` for the unlock gate alone. */
export function meetsRequirements(ability, skills = {}, stats = {}) {
  if (ability.anyOf) {
    if (!ability.anyOf.some((b) => branchMet(b, skills))) {
      const wording = ability.anyOf
        .map((b) => b.all.map((c) => `${KNOWN_SKILLS[c.skill]} ${c.min}`).join(' and '))
        .join(', or ');
      return { ok: false, reason: `${ability.name} needs ${wording}` };
    }
  } else if (gatingSkillValue(ability, skills) < ability.minSkill) {
    const what = ability.skillAny
      ? 'a weapon skill'
      : KNOWN_SKILLS[ability.skill];
    return { ok: false, reason: `${ability.name} needs ${what} ${ability.minSkill}` };
  }
  const missing = extraReqFailure(ability, skills, stats);
  if (missing) return { ok: false, reason: `${ability.name} needs ${missing}` };
  return { ok: true };
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
    const have = character.items?.[ability.cost.item] ?? 0;
    const need = ability.cost.count ?? 1;
    if (have < need) {
      return { ok: false, reason: `${ability.name} needs ${need} ${ability.cost.item} and you have ${have}` };
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
    if (needs.kind === 'melee' || needs.kind === 'anyMelee' || needs.kind === 'ranged') {
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

  if (list.length !== ABILITY_COUNT) {
    throw new Error(
      `auditAbilities: ${list.length} abilities, the document has ${ABILITY_COUNT} (${ABILITY_DOC_ROWS} rows, Bandage written twice)`,
    );
  }

  return true;
}

auditAbilities();
