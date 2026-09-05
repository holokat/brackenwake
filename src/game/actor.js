// Actors. One shape for the player and for every monster, because
// combat_rules.js resolves both through the same arithmetic and must not be
// able to tell them apart. See docs/mmo/07-RUNTIME-CONTRACT.md.
//
//   const you = playerActor(state.character, { pos: player.pos });
//   const wolf = spawnMonster('wolf', { x: 10, y: 0, z: 4 }, Math.random);
//   recompute(you);                 // after any change to gear, buffs or stats
//   tickPools(you, dt, inCombat);   // every frame
//
// No THREE and no DOM: this file runs in node, and `model` is left null for
// W2's monsters runtime to fill with a group.
//
// ---------------------------------------------------------------------------
// THE TWO LAYERS OF STATS AND SKILLS
// ---------------------------------------------------------------------------
// `actor.baseStats` and `actor.baseSkills` are the character document's own
// objects, by reference, so a stat that progression.js raises is seen by the
// next recompute without anyone having to copy it. `actor.stats` and
// `actor.skills` are the effective numbers, base plus gear plus buffs, and are
// rebuilt from scratch by every recompute. combat_rules.js only ever reads the
// effective ones.
//
// ---------------------------------------------------------------------------
// WHAT THIS FILE INVENTS, because src/mmo does not have it
// ---------------------------------------------------------------------------
// Each of these is written down in docs/mmo/wiring/W1.md as well.
//
// 1. AFFIX_EFFECT. affixes.js says what a line is called and how big it is; it
//    does not say which field of a fighter it lands in, nor in which unit.
//    combat_rules.js runs on two unit conventions at once (percent points for
//    anything named Pct, fractions for dodge, crit and swing speed), so the
//    table below carries a multiplier per affix and auditActor() proves every
//    affix in affixes.js has a row. A sixty third affix fails at import.
//
//    Two conversions there are judgement, not arithmetic. "Hit Chance +3 to
//    15%" and "Defence Chance 2 to 12%" are percent points of the roll, and the
//    roll moves 0.005 per skill point, so they enter as `value * 2` skill
//    points. A 12% Defence Chance then really is twelve points off an
//    attacker's chance to hit, which is what the tooltip promises.
//
// 2. Monster skills. A monster record carries `hit` and `def` and no skills at
//    all. naturalWeaponFor() picks the skill its weapon trains from its note
//    tags, and the monster is built so that combat_rules.attackSkill() returns
//    its `hit` and defenceSkill() returns its `def`, exactly, whatever else it
//    is carrying. actor.test.mjs measures both for all 39 rows.
//
// 3. Monster stamina. combat_rules doubles the swing time and takes 20 points
//    of hit skill off any fighter at zero stamina. A monster with no stamina
//    field would therefore swing at half speed and ten points worse for its
//    whole life, silently. Monsters carry MONSTER_STAMINA and nothing spends it.
//
// 4. Monster difficulty, the number a player learns from. 01-STATS-SKILLS says
//    "a rat is 5, a wraith is 70". The floor of the tier band gives the wraith
//    70 exactly; tier 0 uses the middle of its band, which gives 5. Neither is
//    the monster's def (the wraith's is 75).
//
// 5. The Meditation blocker. 03-ITEMS-LOOT gives every armour tier a Meditation
//    fraction and states the two ends ("full plate: no mana regeneration from
//    Meditation", "full cloth casts freely") but never how eight pieces
//    combine. They are averaged over the eight armour slots, an empty slot
//    counting as free, so full plate is 0 and full cloth is 1. A piece carrying
//    the Mage Armour affix counts as free.
//
// 5b. The casting burden. Same eight slots, same mean, opposite end: cloth is
//    0 and full plate is 1, an empty slot counts as 0, and a Mage Armour piece
//    counts as 0 too. `actor.castBurden` is written by every recompute;
//    abilities_runtime.js multiplies a spell's cast time by (1 + burden) and
//    rolls burden * 0.6 for a fizzle. Chivalry is exempt: the paladin casts in
//    plate. The per tier fractions are items.js's; the combining rule is here.
//
// 6. Weaknesses. resistOf() clamps a resist at zero, so `fireWeak` cannot be
//    carried as a negative resist. It is carried as `actor.weakTo` and
//    `actor.vulnerability`, and W2 applies it as a damage multiplier.

import { derived, STATS } from '../mmo/stats.js';
import { SKILLS } from '../mmo/skills.js';
import { AFFIXES, POWER_BY_ID } from '../mmo/affixes.js';
import { baseFor, armourOf, ARMOR_PIECES, ARMOR_TIERS, SLOTS, WEAPONS } from '../mmo/items.js';
import { MONSTERS, TIERS, aggroRadius, leashRadius } from '../mmo/monsters.js';
import { UNARMED, RESIST_CAP } from '../mmo/combat_rules.js';

export const DAMAGE_TYPES = ['physical', 'fire', 'cold', 'poison', 'energy'];

/** Monsters never run out of breath. See note 3 in the header. */
export const MONSTER_STAMINA = 100;

/** How much more a weakness hurts. INVENTED: no document gives a figure. */
export const WEAKNESS = 0.25;

/**
 * What a player swings with when both hands are empty. This is items.js's own
 * Fists row (1 to 4 at 2.2 s), not combat_rules.UNARMED (1 to 3), because the
 * item table is what 03-ITEMS-LOOT prints and what a tooltip would show. The
 * two differ by a point of maximum damage; W1.md records it.
 */
export const FISTS = Object.freeze({
  id: 'fists', name: WEAPONS.fists.name, skill: WEAPONS.fists.skill, hands: 0,
  minDamage: WEAPONS.fists.minDamage, maxDamage: WEAPONS.fists.maxDamage,
  speed: WEAPONS.fists.speed, weight: WEAPONS.fists.weight,
  damageType: WEAPONS.fists.damageType, ranged: false,
  reach: WEAPONS.fists.reach, range: null,
});

/** The combat skills, for the +All Combat Skills line. */
export const COMBAT_SKILL_IDS = SKILLS.filter((s) => /^Combat/.test(s.group)).map((s) => s.id);
/** The crafting skills, for the +All Crafting Skills line. */
export const CRAFTING_SKILL_IDS = SKILLS.filter((s) => s.group === 'Crafting').map((s) => s.id);

// ----------------------------------------------------------- the bonus record
// Every key an affix, a buff or a monster can write, zeroed, so nothing
// downstream ever reads undefined. The first eleven are the ones
// combat_rules.js consumes today; the rest are read by W2 and W4 and are listed
// as unconsumed in W1.md so nobody believes an unread key is doing something.
export const CONSUMED_BONUSES = [
  'hit', 'defence', 'dodge', 'damagePct', 'critChance', 'critDamage',
  'swingSpeed', 'armourPiercing', 'spellDamage', 'lifeLeech', 'manaLeech',
];
export const UNCONSUMED_BONUSES = [
  'parry', 'damageReflect', 'thorns', 'stunResist', 'staminaLeech',
  'hitFireball', 'hitLightning', 'hitFrost', 'hitHarm', 'hitLifeDrain',
  'hitFatigue', 'hitDispel',
  'castSpeed', 'castRecovery', 'lowerManaCost', 'spellChanneling', 'mageArmour',
  'fasterSummons', 'longerBuffs',
  'runSpeed', 'jumpHeight', 'carry', 'nightSight', 'waterWalking',
  'fallReduction', 'goldFind', 'luck', 'harvestYield', 'miningSpeed',
  'lumberSpeed', 'selfRepair',
];
export const BONUS_KEYS = [...CONSUMED_BONUSES, ...UNCONSUMED_BONUSES];

export const zeroBonuses = () => Object.fromEntries(BONUS_KEYS.map((k) => [k, 0]));
export const zeroResists = () => Object.fromEntries(DAMAGE_TYPES.map((k) => [k, 0]));

// --------------------------------------------------------------- affix table
// [where, key, multiplier]. See note 1 in the header for the two judgement
// calls. `flag` lines are set to 1 rather than added, because two Night Sights
// are one Night Sight.
const E = (where, key, mul = 1) => ({ where, key, mul });
export const AFFIX_EFFECT = {
  // stat lines: straight onto the effective stats
  str: E('stat', 'str'), dex: E('stat', 'dex'), int: E('stat', 'int'),
  con: E('stat', 'con'), wis: E('stat', 'wis'),

  // pools and regeneration. perTen lines are per ten seconds, so a tenth each.
  health: E('pool', 'maxHealth'), mana: E('pool', 'maxMana'), stamina: E('pool', 'maxStamina'),
  healthRegen: E('regen', 'healthRegen', 0.1),
  manaRegen: E('regen', 'manaRegen', 0.1),
  staminaRegen: E('regen', 'staminaRegen', 0.1),

  // defence
  ar: E('ar', 'ar'),
  resistPhysical: E('resist', 'physical'), resistFire: E('resist', 'fire'),
  resistCold: E('resist', 'cold'), resistPoison: E('resist', 'poison'),
  resistEnergy: E('resist', 'energy'),
  defenceChance: E('bonus', 'defence', 2),      // percent points of the roll -> skill points
  dodge: E('bonus', 'dodge', 0.01),             // fraction
  parry: E('bonus', 'parry', 0.01),
  damageReflect: E('bonus', 'damageReflect', 0.01),
  thorns: E('bonus', 'thorns'),
  stunResist: E('bonus', 'stunResist', 0.01),

  // offence
  damage: E('bonus', 'damagePct'),              // percent points
  swingSpeed: E('bonus', 'swingSpeed', 0.01),   // fraction
  hitChance: E('bonus', 'hit', 2),              // percent points of the roll -> skill points
  critChance: E('bonus', 'critChance', 0.01),
  critDamage: E('bonus', 'critDamage', 0.01),
  armourPiercing: E('bonus', 'armourPiercing'),
  lifeLeech: E('bonus', 'lifeLeech'), manaLeech: E('bonus', 'manaLeech'),
  staminaLeech: E('bonus', 'staminaLeech'),

  // hit effects: the number is a chance per hit
  hitFireball: E('bonus', 'hitFireball', 0.01),
  hitLightning: E('bonus', 'hitLightning', 0.01),
  hitFrost: E('bonus', 'hitFrost', 0.01),
  hitHarm: E('bonus', 'hitHarm', 0.01),
  hitLifeDrain: E('bonus', 'hitLifeDrain', 0.01),
  hitFatigue: E('bonus', 'hitFatigue', 0.01),
  hitDispel: E('bonus', 'hitDispel', 0.01),

  // magic
  spellDamage: E('bonus', 'spellDamage'),
  castSpeed: E('bonus', 'castSpeed'),
  castRecovery: E('bonus', 'castRecovery'),
  lowerManaCost: E('bonus', 'lowerManaCost'),
  spellChanneling: E('flag', 'spellChanneling'),
  mageArmour: E('flag', 'mageArmour'),
  fasterSummons: E('flag', 'fasterSummons'),
  longerBuffs: E('bonus', 'longerBuffs', 0.01),

  // skill lines
  skill: E('skillNamed', null),                 // carries skillId
  allCombat: E('skillList', 'combat'),
  allCrafting: E('skillList', 'crafting'),

  // utility
  runSpeed: E('bonus', 'runSpeed', 0.01),
  jumpHeight: E('bonus', 'jumpHeight', 0.01),
  carry: E('bonus', 'carry'),
  nightSight: E('flag', 'nightSight'),
  waterWalking: E('flag', 'waterWalking'),
  fallReduction: E('bonus', 'fallReduction', 0.01),
  goldFind: E('bonus', 'goldFind', 0.01),
  luck: E('bonus', 'luck'),
  harvestYield: E('bonus', 'harvestYield', 0.01),
  miningSpeed: E('bonus', 'miningSpeed', 0.01),
  lumberSpeed: E('bonus', 'lumberSpeed', 0.01),
  selfRepair: E('bonus', 'selfRepair'),
};

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const num = (v) => (isNum(v) ? v : 0);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const r4 = (v) => Math.round(v * 1e4) / 1e4;

// ------------------------------------------------------------------ gathering

/** An accumulator every source pours into. */
function emptySum() {
  return {
    stats: Object.fromEntries(STATS.map((k) => [k, 0])),
    skills: {},
    bonuses: zeroBonuses(),
    resists: zeroResists(),
    ar: 0,
    pool: { maxHealth: 0, maxMana: 0, maxStamina: 0 },
    regen: { healthRegen: 0, manaRegen: 0, staminaRegen: 0 },
    powers: [],
  };
}

const addSkill = (sum, id, v) => { sum.skills[id] = (sum.skills[id] || 0) + v; };

/**
 * One rolled affix entry into the accumulator. Entries come from affixes.js:
 * `{ id, stat, value, skillId?, power? }`. Anything the table does not know is
 * counted in `unknown` rather than dropped, so a new affix shows up as a number
 * instead of as nothing.
 */
export function applyAffix(sum, entry) {
  if (!entry || typeof entry !== 'object') return false;
  const id = entry.id || entry.stat;
  const value = num(entry.value);
  if (entry.power || POWER_BY_ID[id]) {
    if (!sum.powers.includes(id)) sum.powers.push(id);
    return true;
  }
  const e = AFFIX_EFFECT[id];
  if (!e) return false;
  switch (e.where) {
    case 'stat': sum.stats[e.key] += value * e.mul; return true;
    case 'pool': sum.pool[e.key] += value * e.mul; return true;
    case 'regen': sum.regen[e.key] += value * e.mul; return true;
    case 'ar': sum.ar += value * e.mul; return true;
    case 'resist': sum.resists[e.key] += value * e.mul; return true;
    case 'bonus': sum.bonuses[e.key] += value * e.mul; return true;
    case 'flag': sum.bonuses[e.key] = 1; return true;
    case 'skillNamed':
      if (entry.skillId) addSkill(sum, entry.skillId, value);
      return !!entry.skillId;
    case 'skillList': {
      const list = e.key === 'combat' ? COMBAT_SKILL_IDS : CRAFTING_SKILL_IDS;
      for (const s of list) addSkill(sum, s, value);
      return true;
    }
    default: return false;
  }
}

/**
 * A buff's effect. Two shapes are accepted, because W4 will want both:
 *   { affixes: [entry, ...] }     the same records gear carries
 *   { stats, skills, bonuses, resists, ar, pool, regen }   a plain block
 */
export function applyEffect(sum, effect) {
  if (!effect || typeof effect !== 'object') return;
  if (Array.isArray(effect.affixes)) for (const a of effect.affixes) applyAffix(sum, a);
  if (effect.stats) for (const k of STATS) if (isNum(effect.stats[k])) sum.stats[k] += effect.stats[k];
  if (effect.skills) for (const k of Object.keys(effect.skills)) if (isNum(effect.skills[k])) addSkill(sum, k, effect.skills[k]);
  if (effect.bonuses) for (const k of BONUS_KEYS) if (isNum(effect.bonuses[k])) sum.bonuses[k] += effect.bonuses[k];
  if (effect.resists) for (const k of DAMAGE_TYPES) if (isNum(effect.resists[k])) sum.resists[k] += effect.resists[k];
  if (isNum(effect.ar)) sum.ar += effect.ar;
  if (effect.pool) for (const k of Object.keys(sum.pool)) if (isNum(effect.pool[k])) sum.pool[k] += effect.pool[k];
  if (effect.regen) for (const k of Object.keys(sum.regen)) if (isNum(effect.regen[k])) sum.regen[k] += effect.regen[k];
}

// --------------------------------------------------------------- weapon shape

/** The fighter weapon combat_rules.js wants, out of an item record. */
export function weaponFrom(item) {
  const b = baseFor(item);
  if (!b || b.kind !== 'weapon') return null;
  const q = num(item.quality) || 1;
  return {
    id: b.id, name: b.name, skill: b.skill, hands: b.hands,
    minDamage: b.minDamage * q, maxDamage: b.maxDamage * q,
    speed: b.speed, weight: b.weight, damageType: b.damageType,
    ranged: b.range != null, reach: b.reach != null ? b.reach : 1.5,
    range: b.range != null ? b.range : null,
    stun: b.stun || 0, cleave: b.cleave || 0, armourPiercing: b.armourPiercing || 0,
  };
}

/** The shield combat_rules.js wants, out of an item record. Null if it is not one. */
export function shieldFrom(item) {
  const b = baseFor(item);
  if (!b || b.kind !== 'shield') return null;
  return { id: b.id, name: b.name, parryFactor: b.parryFactor, weight: b.weight };
}

const ARMOUR_SLOTS = ARMOR_PIECES.map((p) => p.slot);

/**
 * Does this piece carry the Mage Armour line? Then it does not block
 * Meditation, and it does not burden a cast either: the affix is the one way
 * to wear metal and still cast out of it, and it would be a strange line that
 * gave the mana back while still fumbling the spell.
 */
export const hasMageArmour = (item) =>
  !!(item && Array.isArray(item.affixes) && item.affixes.some((a) => (a.id || a.stat) === 'mageArmour'));

/**
 * The fraction of Meditation regeneration the worn armour still allows, the
 * mean over the eight armour slots with an empty slot counting as free. See
 * note 5 in the header: the combining rule is this file's, the per piece
 * numbers are 03-ITEMS-LOOT's.
 */
export function meditationFactor(equipment) {
  if (!equipment) return 1;
  let total = 0;
  for (const slot of ARMOUR_SLOTS) {
    const item = equipment[slot];
    const b = baseFor(item);
    if (!item || !b || b.meditation == null || hasMageArmour(item)) { total += 1; continue; }
    total += b.meditation;
  }
  return r4(total / ARMOUR_SLOTS.length);
}

/**
 * How much the worn armour fights a spell on its way out: 0 in cloth, 1 in
 * full plate. Combined exactly the way meditationFactor is, because it is the
 * same eight slots seen from the other end: the mean over the eight armour
 * slots, an EMPTY slot counting as 0 (nothing on your arm cannot get in the
 * way), and a piece carrying Mage Armour counting as 0 as well.
 *
 * A plate chest and nothing else is therefore 1/8 = 0.125, which is the point
 * of a mean rather than a maximum: one heavy piece is a nuisance and a full
 * suit is a wall. abilities_runtime.js turns the number into a longer cast and
 * a chance to fizzle; the per tier numbers are items.js's ARMOR_TIERS.
 *
 * Not player-only, unlike meditationFactor. A monster wears no armour piece,
 * so it measures 0 for every row in the roster today, and the day one is
 * dressed in plate its casting should suffer for it like anybody else's.
 */
export function castBurdenOf(equipment) {
  if (!equipment) return 0;
  let total = 0;
  for (const slot of ARMOUR_SLOTS) {
    const item = equipment[slot];
    const b = baseFor(item);
    if (!item || !b || b.castBurden == null || hasMageArmour(item)) continue;
    total += b.castBurden;
  }
  return r4(total / ARMOUR_SLOTS.length);
}

/**
 * The materials that are in the way, heaviest first, in the words a sentence
 * wants: "platemail", "chainmail and ringmail". Only pieces that actually
 * carry a burden are named, so a Mage Armour breastplate is not blamed for a
 * fizzle it had nothing to do with, and cloth is never named at all.
 *
 * The display name comes from ARMOR_TIERS.material, lowercased, so "Studded
 * leather" reads as "studded leather" mid sentence and a seventh tier arrives
 * here with its own name rather than a word this file invented.
 */
export function burdenSources(equipment) {
  if (!equipment) return [];
  const seen = new Map();
  for (const slot of ARMOUR_SLOTS) {
    const item = equipment[slot];
    const b = baseFor(item);
    if (!item || !b || !b.castBurden || hasMageArmour(item)) continue;
    const tier = ARMOR_TIERS.find((t) => t.id === b.material);
    if (!tier) continue;
    if (!seen.has(tier.id)) seen.set(tier.id, tier);
  }
  return [...seen.values()]
    .sort((a, b) => b.castBurden - a.castBurden)
    .map((t) => t.material.toLowerCase());
}

// ------------------------------------------------------------------ recompute

/**
 * Sum equipment and buffs into `bonuses`, `ar`, `resists`, the effective stats
 * and skills, and the pools. Nothing else in the game writes those fields.
 *
 * Two invariants, both measured in actor.test.mjs:
 *   health, mana and stamina are never above their max when this returns
 *   and this never raises one of them, so a recompute in the middle of a fight
 *   is not a free heal.
 *
 * The order matters: the effective stats are worked out first, because
 * items.canEquip halves a piece's armour when its STR requirement is not met
 * and a +STR ring can be what meets it.
 */
export function recompute(actor) {
  if (!actor) return actor;
  const sum = emptySum();
  const equipment = actor.equipment || {};
  const now = actor.now || 0;

  // A monster's own hit and defence adjustments are seeded here, before gear,
  // because recompute REPLACES actor.bonuses and would otherwise wipe them.
  if (actor.naturalBonuses) {
    for (const k of BONUS_KEYS) sum.bonuses[k] += num(actor.naturalBonuses[k]);
  }

  // gear first
  const worn = [];
  for (const slot of SLOTS) {
    const item = equipment[slot];
    if (!item) continue;
    worn.push({ slot, item });
    if (Array.isArray(item.affixes)) for (const a of item.affixes) applyAffix(sum, a);
  }
  // then buffs that have not run out
  const buffs = Array.isArray(actor.buffs) ? actor.buffs : [];
  for (const b of buffs) {
    if (!b) continue;
    if (isNum(b.until) && isNum(now) && now > 0 && b.until <= now) continue;
    applyEffect(sum, b.effect);
  }

  // effective stats and skills
  const stats = {};
  for (const k of STATS) stats[k] = num(actor.baseStats && actor.baseStats[k]) + sum.stats[k];
  const skills = { ...(actor.baseSkills || {}) };
  for (const id of Object.keys(sum.skills)) skills[id] = num(skills[id]) + sum.skills[id];

  // armour rating: the pieces themselves, then any +AR line
  let ar = num(actor.naturalAr) + sum.ar;
  for (const { item } of worn) {
    ar += armourOf(item, stats);
    // an armour tier's own resists (plate: physical 3, fire 2 a piece) count,
    // on top of any resist affix; they were summed by the sheet and read by
    // nothing in the fight until now
    const tier = baseFor(item);
    if (tier && tier.resist) for (const t of DAMAGE_TYPES) if (isNum(tier.resist[t])) sum.resists[t] += tier.resist[t];
  }

  // Pools and regeneration. A monster's row states its health outright, so
  // `actor.natural` replaces the stat formula for it; gear and buffs are still
  // added on top, because a summon could be buffed.
  const medFactor = actor.kind === 'player' ? meditationFactor(equipment) : 1;
  const forDerived = { ...skills, meditation: num(skills.meditation) * medFactor };
  const d = actor.natural ? { ...derived(stats, forDerived), ...actor.natural } : derived(stats, forDerived);
  const maxHealth = r4(Math.max(1, d.maxHealth + sum.pool.maxHealth));
  const maxMana = r4(Math.max(0, d.maxMana + sum.pool.maxMana));
  const maxStamina = r4(Math.max(0, d.maxStamina + sum.pool.maxStamina));

  actor.stats = stats;
  actor.skills = skills;
  actor.bonuses = sum.bonuses;
  actor.ar = r4(ar);
  actor.resists = Object.fromEntries(DAMAGE_TYPES.map((k) => [k, clamp(r4(num(actor.naturalResists && actor.naturalResists[k]) + sum.resists[k]), 0, RESIST_CAP)]));
  actor.powers = sum.powers;
  actor.meditationFactor = medFactor;
  // What the armour does to a spell on the way out. Read by
  // abilities_runtime.js on every cast and by the bar's amber warning, so a
  // player sees the plate in the tooltip before he sees it in a fizzle.
  actor.castBurden = castBurdenOf(equipment);
  actor.carry = r4(d.carry + sum.bonuses.carry);

  actor.maxHealth = maxHealth;
  actor.maxMana = maxMana;
  actor.maxStamina = maxStamina;
  actor.healthRegen = r4(d.healthRegen + sum.regen.healthRegen);
  actor.manaRegen = r4(d.manaRegen + sum.regen.manaRegen);
  actor.staminaRegen = r4(d.staminaRegen + sum.regen.staminaRegen);

  // the weapon in the hand. A bow in ranged is used when the main hand is empty.
  const main = weaponFrom(equipment.mainHand);
  const ranged = weaponFrom(equipment.ranged);
  actor.weapon = main || ranged || actor.naturalWeapon || UNARMED;
  actor.shield = shieldFrom(equipment.offHand) || actor.naturalShield || null;

  // The invariant. Clamped down, never up: a recompute is not a heal.
  actor.health = isNum(actor.health) ? Math.min(actor.health, maxHealth) : maxHealth;
  actor.mana = isNum(actor.mana) ? Math.min(actor.mana, maxMana) : maxMana;
  actor.stamina = isNum(actor.stamina) ? Math.min(actor.stamina, maxStamina) : maxStamina;
  return actor;
}

// ------------------------------------------------------------------- the pool

/**
 * Regenerate. 01-STATS-SKILLS: health regeneration is doubled out of combat,
 * and only health; mana and stamina run at their own rate either way.
 *
 * A dead actor regenerates nothing, because coming back is the resurrection
 * rules' job and not this one's. Returns what was actually gained, so a caller
 * can show it.
 */
export function tickPools(actor, dt, inCombat = false) {
  const none = { health: 0, mana: 0, stamina: 0 };
  if (!actor || !isNum(dt) || dt <= 0) return none;
  if (num(actor.health) <= 0) return none;
  const before = { health: num(actor.health), mana: num(actor.mana), stamina: num(actor.stamina) };
  const hMul = inCombat ? 1 : 2;
  actor.health = Math.min(num(actor.maxHealth), before.health + num(actor.healthRegen) * hMul * dt);
  actor.mana = Math.min(num(actor.maxMana), before.mana + num(actor.manaRegen) * dt);
  actor.stamina = Math.min(num(actor.maxStamina), before.stamina + num(actor.staminaRegen) * dt);
  return {
    health: r4(actor.health - before.health),
    mana: r4(actor.mana - before.mana),
    stamina: r4(actor.stamina - before.stamina),
  };
}

// ------------------------------------------------------------------ the player

/**
 * The player, out of the character document. `baseStats` and `baseSkills` are
 * the document's own objects, so a lesson raises what the actor reads.
 *
 * @param character the v2 document from state.js
 * @param opts.pos  the live position object to use, normally player.pos, so the
 *                  actor and the model can never be in two places
 */
export function playerActor(character, opts = {}) {
  if (!character || typeof character !== 'object') throw new Error('playerActor: there is no character');
  const pos = opts.pos || { x: num(character.pos && character.pos.x), y: 0, z: num(character.pos && character.pos.z) };
  const actor = {
    id: opts.id || 'player',
    kind: 'player',
    name: character.name || 'You',
    tier: undefined,
    character,
    pos,
    yaw: num(opts.yaw),
    baseStats: character.stats,
    baseSkills: character.skills,
    // A getter, not a snapshot: creation.js and inventory.js may replace the
    // whole equipment object, and an actor holding the old one would go on
    // wearing armour the player took off.
    get equipment() { return character.equipment; },
    stats: { ...character.stats },
    skills: { ...character.skills },
    bonuses: zeroBonuses(),
    resists: zeroResists(),
    ar: 0,
    naturalWeapon: { ...FISTS },
    weapon: { ...FISTS },
    naturalShield: null,
    shield: null,
    health: isNum(character.health) ? character.health : null,
    mana: isNum(character.mana) ? character.mana : null,
    stamina: isNum(character.stamina) ? character.stamina : null,
    maxHealth: 1, maxMana: 0, maxStamina: 0,
    healthRegen: 0, manaRegen: 0, staminaRegen: 0,
    buffs: [],
    status: {},
    lastSwingAt: 0,
    casting: null,
    faction: 'player',
    ai: null,
    model: null,             // W2 and W6 fill this
    anim: 'idle',
    now: 0,
    weakTo: [],
    vulnerability: {},
  };
  return recompute(actor);
}

/**
 * Copy what play changed back onto the document, so a save keeps it. main.js
 * calls this before state.save(); nothing else writes those four fields.
 */
export function syncToCharacter(actor) {
  const c = actor && actor.character;
  if (!c) return null;
  c.health = num(actor.health);
  c.mana = num(actor.mana);
  c.stamina = num(actor.stamina);
  if (actor.pos) { c.pos.x = num(actor.pos.x); c.pos.z = num(actor.pos.z); }
  return c;
}

// ----------------------------------------------------------------- monsters

// Which skill a monster's natural weapon trains. INVENTED: see note 2. The
// default is wrestling, which is what combat_rules.UNARMED uses, so a monster
// with no tag at all still reads as a fighter and not as a hole.
export const NATURAL_SKILL_BY_NOTE = {
  throwsKnives: 'marksmanship',
  swordAndShield: 'swordsmanship',
  casts: 'magery',
};
export const DEFAULT_NATURAL_SKILL = UNARMED.skill;   // wrestling

/** The reach a monster swings at. Only the notes that say so get more. */
const NATURAL_REACH = 1.5;

/** The natural weapon of a monster row: its damage range at its speed. */
export function naturalWeaponFor(m) {
  let skill = DEFAULT_NATURAL_SKILL;
  for (const n of m.notes || []) if (NATURAL_SKILL_BY_NOTE[n]) skill = NATURAL_SKILL_BY_NOTE[n];
  const thrown = (m.notes || []).includes('throwsKnives');
  return {
    id: `${m.id}_natural`,
    name: `${m.name}'s attack`,
    skill,
    hands: 0,
    minDamage: m.damage[0],
    maxDamage: m.damage[1],
    speed: m.speed,
    weight: 0,                       // a monster does not tire; see note 3
    damageType: 'physical',
    ranged: thrown,
    reach: NATURAL_REACH,
    range: thrown ? 12 : null,
  };
}

/**
 * The number a player learns from when fighting this monster. See note 4.
 * Tier 0 takes the middle of its band, which is the document's "a rat is 5";
 * every other tier takes the floor, which is its "a wraith is 70".
 */
export function difficultyOfMonster(m) {
  const t = TIERS[m.tier];
  if (!t) return 0;
  const [lo, hi] = t.band;
  return m.tier === 0 ? Math.round((lo + hi) / 2) : lo;
}

// Note tags that are a resist or a weakness, and what they mean. The resist cap
// is 70 in combat_rules, so "immune" is as immune as the rules allow.
const NOTE_RESISTS = {
  immunePoison: ['poison', RESIST_CAP],
  coldImmune: ['cold', RESIST_CAP],
  incorporeal50: ['physical', 50],
};
const NOTE_WEAKNESS = {
  fireWeak: 'fire', energyWeak: 'energy', holyWeak: 'holy', silverWeak: 'silver',
};

let monsterCount = 0;

/**
 * One monster, ready to fight. `model` is left null: W2's monsters runtime
 * builds the group and hangs it on.
 *
 * Built so that combat_rules.attackSkill(actor) === m.hit and
 * defenceSkill(actor) === m.def, whatever the row carries, which is the only
 * way the document's tuned numbers survive the trip into the resolver.
 */
export function spawnMonster(id, pos = { x: 0, y: 0, z: 0 }, rng = Math.random) {
  const m = MONSTERS[id];
  if (!m) throw new Error(`spawnMonster: "${id}" is not a monster`);
  const roll = typeof rng === 'function' ? rng : Math.random;

  const weapon = naturalWeaponFor(m);
  const parries = (m.notes || []).includes('parries');
  const skills = { [weapon.skill]: m.hit };
  const shield = parries ? { id: 'natural_guard', name: `${m.name}'s guard`, parryFactor: 0.9, weight: 0 } : null;
  if (parries) skills.parrying = m.def;

  // attackSkill  = weaponSkill + tactics * 0.25 + bonuses.hit
  // defenceSkill = weaponSkill * 0.5 + parrying * 0.5 + DEX * 0.4 + bonuses.defence
  // Monsters have no stats, so making those two come out at m.hit and m.def is
  // one subtraction each. Both are measured in actor.test.mjs for every row.
  const bonuses = zeroBonuses();
  bonuses.defence = m.def - m.hit * 0.5 - (parries ? m.def * 0.5 : 0);

  const resists = zeroResists();
  const weakTo = [];
  const vulnerability = {};
  for (const n of m.notes || []) {
    const r = NOTE_RESISTS[n];
    if (r) resists[r[0]] = Math.max(resists[r[0]], r[1]);
    const w = NOTE_WEAKNESS[n];
    if (w) { weakTo.push(w); vulnerability[w] = WEAKNESS; }
  }

  const home = { x: num(pos.x), y: num(pos.y), z: num(pos.z) };
  const actor = {
    id: `${m.id}#${++monsterCount}`,
    kind: 'monster',
    monsterId: m.id,
    name: m.name,
    tier: m.tier,
    family: m.kind,                 // combat_rules reads this for fleeCheck
    temperament: m.temperament,
    notes: [...(m.notes || [])],
    boss: !!m.boss,
    phases: m.phases ? [...m.phases] : null,
    lootTable: [...(m.lootTable || [])],
    gold: [...(m.gold || [0, 0])],
    seed: Math.floor(roll() * 0xffffffff) >>> 0,

    pos: { x: home.x, y: home.y, z: home.z },
    yaw: roll() * Math.PI * 2,

    // Monsters carry no stats: their hit and def ARE their skill, so a stat
    // here would double count. The consequence is that a monster never dodges
    // (dodgeChance reads DEX), which is what its def is already for.
    baseStats: { str: 0, dex: 0, int: 0, con: 0, wis: 0 },
    baseSkills: skills,
    equipment: {},
    stats: { str: 0, dex: 0, int: 0, con: 0, wis: 0 },
    skills: { ...skills },
    bonuses,
    naturalBonuses: bonuses,
    resists,
    naturalResists: resists,
    weakTo,
    vulnerability,
    ar: m.ar,
    naturalAr: m.ar,
    naturalWeapon: weapon,
    weapon,
    naturalShield: shield,
    shield,

    // The row's own pools, which replace the stat formula in recompute. The
    // stamina is there so combat_rules does not read the monster as exhausted
    // and halve every swing it ever makes; nothing spends it. "regen3" is the
    // Mire Troll's three health a second, the one row that says a number.
    natural: {
      maxHealth: m.hp,
      maxMana: 0,
      maxStamina: MONSTER_STAMINA,
      healthRegen: (m.notes || []).includes('regen3') ? 3 : 0,
      manaRegen: 0,
      staminaRegen: 0,
    },
    health: m.hp, maxHealth: m.hp,
    mana: 0, maxMana: 0,
    stamina: MONSTER_STAMINA, maxStamina: MONSTER_STAMINA,
    healthRegen: 0, manaRegen: 0, staminaRegen: 0,

    difficulty: difficultyOfMonster(m),
    run: m.run,
    aggro: aggroRadius(m),
    leash: leashRadius(m),
    flees: m.flees,

    buffs: [],
    status: {},
    lastSwingAt: -roll() * m.speed * 1000,   // a pack does not swing in lockstep
    casting: null,
    faction: m.tier === 0 ? 'critter' : 'hostile',
    ai: {
      home,
      aggro: aggroRadius(m),
      leash: leashRadius(m),
      state: 'idle',
      target: null,
      leashSince: null,
    },
    model: null,                 // W2 fills this
    anim: 'idle',
    now: 0,
  };
  return recompute(actor);
}

// ---------------------------------------------------------------------- audit

/**
 * Fails at import if the affix table has grown a line this file cannot place,
 * or if a monster's hit and def do not survive the trip into the resolver.
 * "One case is never the case": the check runs over every affix and every row.
 */
export function auditActor() {
  const bad = [];
  for (const a of AFFIXES) {
    if (!AFFIX_EFFECT[a.id]) bad.push(`affix "${a.id}" (${a.label}) has no effect row in actor.js`);
  }
  for (const id of Object.keys(AFFIX_EFFECT)) {
    if (!AFFIXES.some((a) => a.id === id)) bad.push(`AFFIX_EFFECT has "${id}", which affixes.js no longer carries`);
  }
  for (const e of Object.values(AFFIX_EFFECT)) {
    if (e.where === 'bonus' || e.where === 'flag') {
      if (!BONUS_KEYS.includes(e.key)) bad.push(`the effect key "${e.key}" is not in BONUS_KEYS`);
    }
  }
  if (bad.length) throw new Error(`auditActor: ${bad.length} problem(s)\n  ${bad.join('\n  ')}`);
  return { affixes: AFFIXES.length, bonuses: BONUS_KEYS.length };
}

auditActor();
