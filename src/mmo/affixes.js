import {playerSwingSeconds} from './combat_pace.js';
// Affixes: the sixty-odd lines a found item can carry, the ten named powers a
// legendary can carry instead of nothing, and the deterministic roller that
// turns a seed into a sword. Pure: no THREE, no DOM, runs in node.
//
// The document's Affixes section is the source of truth. Counting its lines
// gives 62, not the "Sixty" its heading claims, and every one of them is here;
// auditAffixes() below states the real number so the drift is visible rather
// than quietly rounded away.
//
// TIER BANDS. The document gives one span per affix (+Health 5 to 40) and only
// the stat lines get a per-tier table (1 to 3 / 2 to 5 / 4 to 8 / 6 to 12 /
// 9 to 15). Those five bands, read as fractions of their own span, are the
// curve every other affix uses:
//
//   lo fraction  0, 1/14, 3/14, 5/14, 8/14
//   hi fraction  2/14, 4/14, 7/14, 11/14, 1
//
// so band(1, 15) reproduces the document's stat table exactly (the audit
// checks it), and band(5, 40) reads +5 to 10 at uncommon and +25 to 40 at
// legendary.
//
// WEIGHTING. "weighted so defensive ones favour armour and offensive ones
// weapons" is implemented as a flat multiplier on each candidate's draw weight:
//
//   on an armour or shield base: defence and pool groups x3, offence and hit x1/3
//   on a weapon base:            offence and hit groups x3, defence and pool x1/3
//   on a ring, amulet, tome or torch: everything x1, which is what makes rings
//                                     the one place any line can turn up
//   stat, skill, magic and utility lines are never nudged either way
//
// The kind restrictions do most of the work already (no defence line is even
// legal on a warhammer), so the multiplier bites where the lists overlap:
// gloves, which take offence lines, and every base at once for the pool lines.

import { rand2 } from '../world/noise.js';
import { BASES, baseFor, RARITY, RARITY_ORDER, RARITY_WORD, skillNameOf, takesRarity } from './items.js';
import { SKILLS } from './skills.js';

// The five rolling tiers. Common rolls nothing.
export const AFFIX_TIERS = ['uncommon', 'rare', 'epic', 'mythic', 'legendary'];

const LO_F = [0, 1 / 14, 3 / 14, 5 / 14, 8 / 14];
const HI_F = [2 / 14, 4 / 14, 7 / 14, 11 / 14, 1];

/** The five tier bands for one documented span. */
export function band(lo, hi) {
  const span = hi - lo;
  const out = {};
  for (let i = 0; i < 5; i++) {
    out[AFFIX_TIERS[i]] = [Math.round(lo + span * LO_F[i]), Math.round(lo + span * HI_F[i])];
  }
  return out;
}

/** A line with no number: it is either on the item or it is not. */
function flagBand() {
  const out = {};
  for (const t of AFFIX_TIERS) out[t] = [1, 1];
  return out;
}

// Kind lists, matched against a base's `kinds` tags in items.js.
const ANY = ['equipment'];
const DEFENSIVE = ['armour', 'shield', 'ring'];
const OFFENSIVE = ['weapon', 'gloves', 'ring'];
const WEAPON = ['weapon'];
const MAGIC = ['robe', 'staff', 'ring', 'amulet'];
const UTILITY = ['boots', 'cloak', 'belt', 'ring'];

// unit decides how a value reads in a tooltip:
//   flat     +7 Strength
//   percent  Damage +18%
//   perTen   Health Regen 4 per 10 s
//   flag     Night Sight
const A = (id, group, label, unit, kinds, ranges, prefix, suffix, extra = {}) =>
  ({ id, stat: id, group, label, unit, kinds, ranges, prefix, suffix, flag: unit === 'flag', ...extra });

// ------------------------------------------------------------ the sixty two
export const AFFIXES = [
  // Stat lines (any slot). The document's own tier table.
  A('str', 'stat', 'Strength', 'flat', ANY, band(1, 15), 'Mighty', 'of Strength'),
  A('dex', 'stat', 'Dexterity', 'flat', ANY, band(1, 15), 'Nimble', 'of Dexterity'),
  A('int', 'stat', 'Intellect', 'flat', ANY, band(1, 15), 'Clever', 'of Intellect'),
  A('con', 'stat', 'Constitution', 'flat', ANY, band(1, 15), 'Hardy', 'of Constitution'),
  A('wis', 'stat', 'Wisdom', 'flat', ANY, band(1, 15), 'Sage', 'of Wisdom'),

  // Pools and regeneration (any slot).
  A('health', 'pool', 'Health', 'flat', ANY, band(5, 40), 'Vital', 'of Health'),
  A('mana', 'pool', 'Mana', 'flat', ANY, band(5, 40), 'Mystic', 'of Mana'),
  A('stamina', 'pool', 'Stamina', 'flat', ANY, band(5, 30), 'Tireless', 'of Stamina'),
  A('healthRegen', 'pool', 'Health Regen', 'perTen', ANY, band(1, 6), 'Mending', 'of Mending'),
  A('manaRegen', 'pool', 'Mana Regen', 'perTen', ANY, band(1, 6), 'Flowing', 'of the Wellspring'),
  A('staminaRegen', 'pool', 'Stamina Regen', 'perTen', ANY, band(2, 8), 'Restless', 'of the Second Wind'),

  // Defence (armour, shields, rings).
  A('ar', 'defence', 'Armour', 'flat', DEFENSIVE, band(2, 15), 'Fortified', 'of Warding'),
  A('resistPhysical', 'defence', 'Physical Resist', 'percent', DEFENSIVE, band(2, 12), 'Ironhide', 'of the Ironhide'),
  A('resistFire', 'defence', 'Fire Resist', 'percent', DEFENSIVE, band(3, 15), 'Emberproof', 'of Fire Warding'),
  A('resistCold', 'defence', 'Cold Resist', 'percent', DEFENSIVE, band(3, 15), 'Frostproof', 'of Cold Warding'),
  A('resistPoison', 'defence', 'Poison Resist', 'percent', DEFENSIVE, band(3, 15), 'Venomproof', 'of Poison Warding'),
  A('resistEnergy', 'defence', 'Energy Resist', 'percent', DEFENSIVE, band(3, 15), 'Stormproof', 'of Energy Warding'),
  A('defenceChance', 'defence', 'Defence Chance', 'percent', DEFENSIVE, band(2, 12), 'Evasive', 'of Defence'),
  A('dodge', 'defence', 'Dodge', 'percent', DEFENSIVE, band(1, 8), 'Slippery', 'of Dodging'),
  A('parry', 'defence', 'Parry', 'percent', DEFENSIVE, band(2, 10), 'Guarding', 'of Parrying'),
  A('damageReflect', 'defence', 'Damage Reflect', 'percent', DEFENSIVE, band(3, 15), 'Mirrored', 'of Reflection'),
  A('thorns', 'defence', 'Thorns', 'flat', DEFENSIVE, band(1, 6), 'Barbed', 'of Thorns'),
  A('stunResist', 'defence', 'Stun Resist', 'percent', DEFENSIVE, band(10, 50), 'Steadfast', 'of Steadfastness'),

  // Offence (weapons, gloves, rings).
  A('damage', 'offence', 'Damage', 'percent', OFFENSIVE, band(5, 30), 'Brutal', 'of Ruin'),
  A('swingSpeed', 'offence', 'Swing Speed', 'percent', OFFENSIVE, band(5, 25), 'Quick', 'of Quickness'),
  A('hitChance', 'offence', 'Hit Chance', 'percent', OFFENSIVE, band(3, 15), 'Keen', 'of Accuracy'),
  A('critChance', 'offence', 'Critical Chance', 'percent', OFFENSIVE, band(2, 10), 'Vicious', 'of Malice'),
  A('critDamage', 'offence', 'Critical Damage', 'percent', OFFENSIVE, band(10, 50), 'Savage', 'of Savagery'),
  A('armourPiercing', 'offence', 'Armour Piercing', 'percent', OFFENSIVE, band(5, 25), 'Piercing', 'of Sundered Mail'),
  A('lifeLeech', 'offence', 'Life Leech', 'percent', OFFENSIVE, band(3, 12), 'Bloodletting', 'of the Leech'),
  A('manaLeech', 'offence', 'Mana Leech', 'percent', OFFENSIVE, band(3, 12), 'Siphoning', 'of the Siphon'),
  A('staminaLeech', 'offence', 'Stamina Leech', 'percent', OFFENSIVE, band(3, 10), 'Draining', 'of Weariness'),

  // Hit effects (weapons only). The number is the chance per hit.
  A('hitFireball', 'hit', 'Hit Fireball', 'percent', WEAPON, band(10, 40), 'Blazing', 'of the Fireball'),
  A('hitLightning', 'hit', 'Hit Lightning', 'percent', WEAPON, band(10, 40), 'Crackling', 'of Lightning'),
  A('hitFrost', 'hit', 'Hit Frost', 'percent', WEAPON, band(10, 40), 'Freezing', 'of Frost'),
  A('hitHarm', 'hit', 'Hit Harm', 'percent', WEAPON, band(10, 40), 'Wounding', 'of Harm'),
  A('hitLifeDrain', 'hit', 'Hit Life Drain', 'percent', WEAPON, band(10, 40), 'Devouring', 'of the Grave'),
  A('hitFatigue', 'hit', 'Hit Fatigue', 'percent', WEAPON, band(10, 40), 'Wearying', 'of Fatigue'),
  A('hitDispel', 'hit', 'Hit Dispel', 'percent', WEAPON, band(10, 40), 'Unravelling', 'of Dispelling'),

  // Magic (robes, staves, rings, amulets).
  A('spellDamage', 'magic', 'Spell Damage', 'percent', MAGIC, band(5, 30), 'Eldritch', 'of Power'),
  A('castSpeed', 'magic', 'Cast Speed', 'flat', MAGIC, band(1, 3), 'Swiftcasting', 'of Swift Casting'),
  A('castRecovery', 'magic', 'Cast Recovery', 'flat', MAGIC, band(1, 4), 'Recovering', 'of Recovery'),
  A('lowerManaCost', 'magic', 'Lower Mana Cost', 'percent', MAGIC, band(5, 25), 'Thrifty', 'of Thrift'),
  A('spellChanneling', 'magic', 'Spell Channeling', 'flag', MAGIC, flagBand(), 'Channelling', 'of Channelling'),
  A('mageArmour', 'magic', 'Mage Armour', 'flag', MAGIC, flagBand(), 'Weightless', 'of the Unburdened'),
  A('fasterSummons', 'magic', 'Faster Summons', 'flag', MAGIC, flagBand(), 'Summoning', 'of Summoning'),
  A('longerBuffs', 'magic', 'Longer Buffs', 'percent', MAGIC, band(10, 40), 'Enduring', 'of Endurance'),

  // Skill lines (any slot). `skill` rolls one named skill from SKILL_NAMES.
  A('skill', 'skill', 'Skill', 'flat', ANY, band(2, 10), 'Adept', 'of Skill', { named: true }),
  A('allCombat', 'skill', 'All Combat Skills', 'flat', ANY, band(1, 5), 'Warlike', 'of the Warrior'),
  A('allCrafting', 'skill', 'All Crafting Skills', 'flat', ANY, band(1, 5), 'Artisan', 'of the Artisan'),

  // Utility (boots, cloaks, belts, rings).
  A('runSpeed', 'utility', 'Run Speed', 'percent', UTILITY, band(5, 20), 'Fleet', 'of the Fleet Foot'),
  A('jumpHeight', 'utility', 'Jump Height', 'percent', UTILITY, band(10, 40), 'Leaping', 'of Leaping'),
  A('carry', 'utility', 'Carry', 'stones', UTILITY, band(10, 60), 'Bearing', 'of Burden'),
  A('nightSight', 'utility', 'Night Sight', 'flag', UTILITY, flagBand(), 'Owlish', 'of Night Sight'),
  A('waterWalking', 'utility', 'Water Walking', 'flag', UTILITY, flagBand(), 'Wading', 'of Water Walking'),
  A('fallReduction', 'utility', 'Fall Damage Reduction', 'percent', UTILITY, band(20, 60), 'Feathered', 'of the Soft Landing'),
  A('goldFind', 'utility', 'Gold Find', 'percent', UTILITY, band(5, 40), 'Gilded', 'of Avarice'),
  A('luck', 'utility', 'Luck', 'flat', UTILITY, band(5, 40), 'Lucky', 'of Fortune'),
  A('harvestYield', 'utility', 'Harvest Yield', 'percent', UTILITY, band(10, 50), 'Bountiful', 'of the Harvest'),
  A('miningSpeed', 'utility', 'Mining Speed', 'percent', UTILITY, band(10, 50), 'Delving', 'of the Deep'),
  A('lumberSpeed', 'utility', 'Lumber Speed', 'percent', UTILITY, band(10, 50), 'Hewing', 'of the Woodsman'),
  A('selfRepair', 'utility', 'Self Repair', 'flat', UTILITY, band(1, 5), 'Everwhole', 'of Self Repair'),
];

export const AFFIX_BY_ID = Object.fromEntries(AFFIXES.map((a) => [a.id, a]));

// The names the +Skill line can pick, taken from skills.js rather than typed
// again here, so the two cannot drift. That table is the skills document's
// nine tables: 52 entries, whatever its heading says.
export const SKILL_NAMES = SKILLS.map((s) => s.name);

// ------------------------------------------------------------ named powers
// Legendary only, one each, never rolled elsewhere. The four that are about
// what a swing does are weapon only; the rest can sit on anything you wear, so
// every equippable base has at least six candidates and a legendary can never
// fail to find one.
export const POWERS = [
  { id: 'vampiric', name: 'Vampiric', prefix: 'Vampiric', suffix: 'of the Vampire', kinds: ['weapon'], text: 'All damage leeches 25%.' },
  { id: 'stormcaller', name: 'Stormcaller', prefix: 'Storm', suffix: 'of the Stormcaller', kinds: ['weapon'], text: 'Every hit chains lightning to two others.' },
  { id: 'everfrost', name: 'Everfrost', prefix: 'Everfrost', suffix: 'of Everfrost', kinds: ['weapon'], text: 'Hits slow 40% and can freeze.' },
  { id: 'sunder', name: 'Sunder', prefix: 'Sundering', suffix: 'of the Sunder', kinds: ['weapon'], text: 'Ignores 50% AR.' },
  { id: 'phoenix', name: 'Phoenix', prefix: 'Phoenix', suffix: 'of the Phoenix', kinds: ['equipment'], text: 'Once a day, death becomes 30% health.' },
  { id: 'windrunner', name: 'Windrunner', prefix: 'Windrunning', suffix: 'of the Windrunner', kinds: ['equipment'], text: 'Run speed +40%, and you never fall.' },
  { id: 'archmage', name: 'Archmage', prefix: 'Archmage', suffix: 'of the Archmage', kinds: ['equipment'], text: 'Cast while moving, always.' },
  { id: 'shepherd', name: 'Shepherd', prefix: 'Shepherd', suffix: 'of the Shepherd', kinds: ['equipment'], text: 'Pets gain 50% health and damage.' },
  { id: 'kingsguard', name: 'Kingsguard', prefix: 'Kingsguard', suffix: 'of the Kingsguard', kinds: ['equipment'], text: 'Nearby allies take 15% less.' },
  { id: 'undying', name: 'Undying', prefix: 'Undying', suffix: 'of the Undying', kinds: ['equipment'], text: 'Regeneration tripled.' },
];
export const POWER_BY_ID = Object.fromEntries(POWERS.map((p) => [p.id, p]));

// ----------------------------------------------------------------- rolling
const SALT_PICK = 0x5f17;
const SALT_VALUE = 0x2c93;
const SALT_SKILL = 0x71ab;
const SALT_POWER = 0x0d4e;

/** Does this base allow this affix (or power)? Any shared tag is enough. */
export function allowedOn(affix, base) {
  const b = baseFor(base);
  if (!b) return false;
  return affix.kinds.some((k) => b.kinds.includes(k));
}

const ARMOUR_FAVOURED = new Set(['defence', 'pool']);
const WEAPON_FAVOURED = new Set(['offence', 'hit']);

/** The family the weighting rule keys off. */
export function familyOf(base) {
  const b = baseFor(base);
  if (!b) return 'other';
  if (b.kind === 'weapon') return 'weapon';
  if (b.kind === 'armour' || b.kind === 'shield') return 'armour';
  return 'other';
}

/** Draw weight for one candidate on one base. See the header for the rule. */
export function weightFor(affix, base) {
  const fam = familyOf(base);
  if (fam === 'armour') {
    if (ARMOUR_FAVOURED.has(affix.group)) return 3;
    if (WEAPON_FAVOURED.has(affix.group)) return 1 / 3;
  } else if (fam === 'weapon') {
    if (WEAPON_FAVOURED.has(affix.group)) return 3;
    if (ARMOUR_FAVOURED.has(affix.group)) return 1 / 3;
  }
  return 1;
}

/** Every affix legal on a base, with its draw weight. */
export function candidatesFor(base) {
  const b = baseFor(base);
  if (!b) return [];
  return AFFIXES.filter((a) => allowedOn(a, b)).map((a) => ({ affix: a, weight: weightFor(a, b) }));
}

function rollOne(affix, item, k) {
  const [lo, hi] = affix.ranges[item.rarity];
  const value = affix.flag ? 1 : lo + Math.floor(rand2(item.seed, k * 977 + 13, SALT_VALUE) * (hi - lo + 1));
  const entry = {
    id: affix.id, stat: affix.stat, group: affix.group, label: affix.label,
    unit: affix.unit, value, range: [lo, hi], tier: item.rarity,
    prefix: affix.prefix, suffix: affix.suffix, power: false,
  };
  if (affix.named) {
    const sk = SKILLS[Math.floor(rand2(item.seed, k * 977 + 29, SALT_SKILL) * SKILLS.length)];
    entry.skill = sk.name;          // for the tooltip
    entry.skillId = sk.id;          // for actor.recompute, which sums by id
    entry.label = entry.skill;
    entry.prefix = `${entry.skill.split(' ')[0]}'s`;
    entry.suffix = `of ${entry.skill}`;
  }
  return entry;
}

function rollPower(item, base) {
  const pool = POWERS.filter((p) => allowedOn(p, base));
  if (!pool.length) return null;
  const p = pool[Math.floor(rand2(item.seed, 0, SALT_POWER) * pool.length)];
  return {
    id: p.id, stat: p.id, group: 'power', label: p.name, unit: 'power', value: 1,
    range: [1, 1], tier: 'legendary', prefix: p.prefix, suffix: p.suffix,
    power: true, text: p.text,
  };
}

/**
 * The affixes this item was always going to have. Deterministic from
 * item.seed, item.base and item.rarity: call it a thousand times and it
 * answers the same thing, which is what lets identify be honest.
 *
 * Distinct by construction: a picked affix is removed from the pool before the
 * next draw. Legendary appends exactly one named power on top of its five.
 */
export function rollAffixes(item) {
  const b = baseFor(item);
  if (!b) return [];
  // Rarity is the affix language, so a base that does not take rarity has no
  // lines to roll. A carrot is a carrot. See items.takesRarity.
  if (!takesRarity(b)) return [];
  const r = RARITY[item.rarity];
  if (!r || !r.affixes) return [];
  const pool = candidatesFor(b);
  const out = [];
  for (let k = 0; k < r.affixes && pool.length; k++) {
    let total = 0;
    for (const c of pool) total += c.weight;
    let t = rand2(item.seed, k * 613 + 7, SALT_PICK) * total;
    let i = 0;
    while (i < pool.length - 1 && t >= pool[i].weight) { t -= pool[i].weight; i++; }
    const [picked] = pool.splice(i, 1);
    out.push(rollOne(picked.affix, item, k));
  }
  if (r.namedPower) {
    const p = rollPower(item, b);
    if (p) out.push(p);
  }
  return out;
}

/**
 * The item with its affixes attached, leaving `identified` alone. A base that
 * does not take rarity comes back exactly as it went in, the same object, so a
 * stack of carrots is not quietly replaced by a copy carrying an empty array
 * that `stackable` would then have to forgive.
 */
export const withAffixes = (item) => (takesRarity(item) ? { ...item, affixes: rollAffixes(item) } : item);

// --------------------------------------------------------------- strength
// How much of its own band a rolled line reached. A named power outranks
// everything, a flag counts as a full roll, and ties break on the id so two
// runs of the same seed sort the same way.
function potency(e) {
  if (e.power) return 2;
  const [lo, hi] = e.range;
  return hi === lo ? 1 : (e.value - lo) / (hi - lo);
}

/** Affixes strongest first. Pure: returns a new array. */
export function ranked(affixes = []) {
  return affixes.slice().sort((a, b) => {
    const d = potency(b) - potency(a);
    if (d !== 0) return d;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

// ------------------------------------------------------------------ naming

/**
 * "Vampiric Longsword of the Stormcaller": prefix from the strongest affix,
 * suffix from the second. A common item, or one whose affixes are not rolled
 * yet, is just its base.
 */
export function nameFor(item) {
  const b = baseFor(item);
  if (!b) return '';
  const list = item.affixes && item.affixes.length ? item.affixes : [];
  if (item.rarity === 'common' || !list.length) return b.name;
  const order = ranked(list);
  const parts = [order[0].prefix, b.name];
  if (order[1]) parts.push(order[1].suffix);
  return parts.filter(Boolean).join(' ');
}

// ---------------------------------------------------------------- identify

/** The line one rolled affix reads as, exactly. */
export function lineFor(e) {
  if (e.power) return `${e.label}: ${e.text}`;
  switch (e.unit) {
    case 'flag': return e.label;
    case 'percent': return `${e.label} +${e.value}%`;
    case 'perTen': return `${e.label} ${e.value} per 10 s`;
    case 'stones': return `${e.label} +${e.value} stones`;
    default: return `+${e.value} ${e.label}`;
  }
}

/** The same line with the number blurred to its band. */
export function rangeLineFor(e) {
  if (e.power || e.unit === 'flag') return lineFor(e);
  const [lo, hi] = e.range;
  switch (e.unit) {
    case 'percent': return `${e.label} +${lo}% to ${hi}%`;
    case 'perTen': return `${e.label} ${lo} to ${hi} per 10 s`;
    case 'stones': return `${e.label} +${lo} to ${hi} stones`;
    default: return `+${lo} to ${hi} ${e.label}`;
  }
}

/**
 * How many of an item's numbers stay vague at a given INT.
 * Below 40 INT at least one affix is a range, above 80 none are.
 *   vague = clamp(ceil((80 - INT) / 20), 0, n)
 * so INT 0 blurs four, INT 39 blurs three, INT 60 blurs one, INT 80 blurs none.
 * The weakest lines are the ones you cannot read.
 */
export function vagueCount(int, n) {
  return Math.max(0, Math.min(n, Math.ceil((80 - int) / 20)));
}

/**
 * Identify an item. Rolls the affixes from the seed if they are not attached
 * yet, so the result was always going to be that. An Inscription scroll of
 * Identify (`{ scroll: true }`) tells everything regardless of INT.
 */
export function identify(item, int = 0, opts = {}) {
  // Nothing to find out about a loaf of bread. Returned unchanged rather than
  // marked identified, because it was never unidentified: makeItem does not
  // hide anything that has nothing to hide.
  if (!takesRarity(item)) return item;
  const affixes = item.affixes && item.affixes.length ? item.affixes : rollAffixes(item);
  const order = ranked(affixes);
  const vague = opts.scroll ? 0 : vagueCount(int, order.length);
  const shown = order.map((e, i) => {
    const blurred = i >= order.length - vague;
    return {
      id: e.id, label: e.label, group: e.group, power: !!e.power,
      exact: blurred ? null : e.value,
      range: blurred ? [e.range[0], e.range[1]] : null,
      text: blurred ? rangeLineFor(e) : lineFor(e),
    };
  });
  const next = { ...item, identified: true, affixes, shown };
  next.name = nameFor(next);
  return next;
}

// ---------------------------------------------------------------- describe

/**
 * The tooltip, as lines. Affix lines come strongest first, which is the order
 * the name was built from. An unidentified item gives up its colour and its
 * base and nothing else.
 */
export function describe(item) {
  const b = baseFor(item);
  if (!b) return ['Nothing.'];
  const r = RARITY[item.rarity] || RARITY.common;
  const lines = [];

  if (!item.identified && item.rarity !== 'common') {
    // the base and the rarity's label, no colour word: the name line is drawn
    // in the colour already, and "a blue longsword" read as a different sword
    lines.push(b.name);
    lines.push(`Unidentified ${r.label.toLowerCase()} ${b.kind === 'armour' ? 'armour' : b.kind}. Click it in your pack to look closer.`);
    return lines;
  }

  lines.push(nameFor(item));
  // "Rare longsword", but never "Common carrot": a rarity word on a thing that
  // cannot have one reads as a promise of a green one somewhere.
  lines.push(takesRarity(b) ? `${r.label} ${b.kind === 'armour' ? 'armour' : b.kind}` : b.kind);

  // What eating it does, in the words the effect really carries. items.js is
  // the one place a `use` is written and foraging.useItem is the one place it
  // is applied; this only reads it, so a tooltip cannot promise a heal the
  // pack will not deliver.
  if (b.use) {
    const u = b.use;
    if (Array.isArray(u.heal)) {
      lines.push(u.seconds > 0
        ? `Heals ${u.heal[0]} to ${u.heal[1]} over ${u.seconds} seconds`
        : `Heals ${u.heal[0]} to ${u.heal[1]}`);
    }
    if (u.buff && u.buff.effect) lines.push(`${u.buff.name} for ${Math.round(u.buff.seconds / 60)} minutes`);
    if (u.poison > 0) lines.push(`Poisons you at level ${u.poison}`);
    if (u.cure) lines.push(`Cures ${u.cure}`);
    if (u.restore) lines.push(`Restores ${u.amount[0]} to ${u.amount[1]} ${u.restore}`);
    if (u.nothing) lines.push(u.nothing[0].toUpperCase() + u.nothing.slice(1));
  }

  if (b.kind === 'weapon') {
    const q = item.quality || 1;
    const lo = Math.round(b.minDamage * q), hi = Math.round(b.maxDamage * q);
    lines.push(`${lo} to ${hi} ${b.damageType} damage, ${playerSwingSeconds(b.speed).toFixed(2)} s base swing`);
    lines.push(`${skillNameOf(b.skill)}, ${b.hands === 2 ? 'two handed' : b.hands === 1 ? 'one handed' : 'bare handed'}`);
    if (b.range != null) lines.push(`range ${b.range} m`);
    else if (b.reach > 1.5) lines.push(`reach ${b.reach} m`);
  } else if (b.kind === 'armour') {
    lines.push(`Armour ${Math.round(b.ar * (item.quality || 1))}`);
    const res = Object.entries(b.resist).map(([k, v]) => `${k} ${v}`).join(', ');
    if (res) lines.push(`Resist ${res}`);
    if (b.meditation < 1) lines.push(b.meditation === 0 ? 'Blocks Meditation entirely' : `Meditation at ${Math.round(b.meditation * 100)}%`);
  } else if (b.kind === 'shield') {
    lines.push(`Parry x${b.parryFactor.toFixed(1)}`);
  }

  if (b.weight) lines.push(`${b.weight} stone${b.weight === 1 ? '' : 's'}${b.strReq ? `, needs ${b.strReq} STR` : ''}`);
  else if (b.strReq) lines.push(`Needs ${b.strReq} STR`);

  for (const e of ranked(item.affixes || [])) lines.push(lineFor(e));

  if ((item.quality || 1) > 1.15) lines.push('Exceptional');
  if (item.maker) lines.push(`Crafted by ${item.maker}`);
  if (item.durability != null) lines.push(`Durability ${item.durability}`);
  return lines;
}

// ------------------------------------------------------------------- audit

/** Fails loudly on a malformed affix table. Runs at load. */
export function auditAffixes() {
  const bad = (m) => { throw new Error(`auditAffixes: ${m}`); };

  const ids = new Set();
  for (const a of AFFIXES) {
    if (ids.has(a.id)) bad(`two affixes share the id ${a.id}`);
    ids.add(a.id);
    for (const f of ['stat', 'group', 'label', 'unit', 'kinds', 'ranges', 'prefix', 'suffix']) {
      if (a[f] === undefined || a[f] === null) bad(`affix ${a.id} has no ${f}`);
    }
    if (!Array.isArray(a.kinds) || !a.kinds.length) bad(`affix ${a.id} sits on nothing`);
    for (const t of AFFIX_TIERS) {
      const r = a.ranges[t];
      if (!Array.isArray(r) || r.length !== 2) bad(`affix ${a.id} has no ${t} range`);
      if (!Number.isInteger(r[0]) || !Number.isInteger(r[1])) bad(`affix ${a.id} ${t} range is not whole`);
      if (r[0] > r[1]) bad(`affix ${a.id} ${t} range runs backwards`);
    }
    for (let i = 1; i < AFFIX_TIERS.length; i++) {
      const lo = a.ranges[AFFIX_TIERS[i]], prev = a.ranges[AFFIX_TIERS[i - 1]];
      if (lo[1] < prev[1]) bad(`affix ${a.id} gets worse at ${AFFIX_TIERS[i]}`);
    }
  }

  // The document's stat table, which the band curve has to reproduce exactly.
  const s = band(1, 15);
  const want = { uncommon: [1, 3], rare: [2, 5], epic: [4, 8], mythic: [6, 12], legendary: [9, 15] };
  for (const t of AFFIX_TIERS) {
    if (s[t][0] !== want[t][0] || s[t][1] !== want[t][1]) {
      bad(`band(1, 15) gives ${t} ${s[t].join(' to ')}, the stat table says ${want[t].join(' to ')}`);
    }
  }
  // And the five stat lines themselves have to still carry it.
  for (const id of ['str', 'dex', 'int', 'con', 'wis']) {
    const a = AFFIX_BY_ID[id];
    if (!a) bad(`the stat line ${id} is missing`);
    for (const t of AFFIX_TIERS) {
      if (a.ranges[t][0] !== want[t][0] || a.ranges[t][1] !== want[t][1]) {
        bad(`+${id.toUpperCase()} is ${t} ${a.ranges[t].join(' to ')}, the stat table says ${want[t].join(' to ')}`);
      }
    }
  }

  if (POWERS.length !== 10) bad(`there are ${POWERS.length} named powers, the document lists 10`);
  const pids = new Set(POWERS.map((p) => p.id));
  if (pids.size !== POWERS.length) bad('two named powers share an id');
  for (const p of POWERS) if (ids.has(p.id)) bad(`named power ${p.id} is also an ordinary affix`);

  if (SKILL_NAMES.length !== SKILLS.length) bad(`the +Skill line knows ${SKILL_NAMES.length} skills and the skill table has ${SKILLS.length}`);
  if (SKILLS.some((s) => !SKILL_NAMES.includes(s.name))) bad('the +Skill line cannot name every skill');
  if (new Set(SKILL_NAMES).size !== SKILL_NAMES.length) bad('two skills share a name');

  // Every rarity above common must be able to fill its affix count on the
  // narrowest base there is, or a roll would silently come up short.
  for (const id of RARITY_ORDER) {
    const r = RARITY[id];
    if (!r.affixes) continue;
    for (const baseId of ['plate_outfit', 'longsword', 'ring', 'torch', 'buckler']) {
      const n = candidatesFor(baseId).length;
      if (n < r.affixes) bad(`${baseId} offers ${n} affixes and ${id} needs ${r.affixes}`);
    }
  }
  for (const baseId of ['plate_outfit', 'longsword', 'ring', 'torch', 'buckler', 'cloth_outfit']) {
    if (!POWERS.some((p) => allowedOn(p, baseId))) bad(`${baseId} can be legendary and no named power fits it`);
  }
  for (const a of AFFIXES) {
    if (!Object.values(BASES).some((b) => takesRarity(b) && allowedOn(a, b))) {
      bad(`${a.id} is unreachable on every base`);
    }
  }

  // And the other direction, which is the one that would ship quietly: a base
  // that does not take rarity must offer NO candidate at all. `rollAffixes`
  // already refuses such a base, but an affix that listed `food` or `material`
  // among its kinds would make the refusal the only thing standing between a
  // carrot and a +7 Strength line, and one guard is not a guard.
  let offered = 0;
  for (const b of Object.values(BASES)) {
    if (takesRarity(b)) continue;
    const n = candidatesFor(b).length;
    if (n) bad(`${b.id} is a ${b.kind}, takes no rarity, and yet offers ${n} affix(es)`);
    offered++;
  }

  return { affixes: AFFIXES.length, powers: POWERS.length, rarityFreeBases: offered };
}

auditAffixes();
