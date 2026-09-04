// Combat rules. Every fight in Brackenwake is this arithmetic: player on
// monster, monster on player, and later player on player, all through the same
// functions. See docs/mmo/02-COMBAT.md, which this file follows line by line,
// and docs/mmo/04-CLASSES-ABILITIES.md for the spell formula.
//
// Pure. No THREE, no DOM, no imports, no module state, no Math.random. Every
// roll comes from an injected `rng()` returning [0, 1), so a fight replays
// exactly from a seed. Nothing here mutates its arguments: resolveMelee hands
// back the defender's new health as `defenderHealth` and the caller applies it.
//
// ---------------------------------------------------------------------------
// The fighter shape
// ---------------------------------------------------------------------------
// Both sides of every function take the same plain object. Missing fields read
// as zero, missing weapon reads as UNARMED, so a monster may carry only the few
// numbers it actually uses.
//
//   fighter = {
//     stats:  { str, dex, int, con, wis },            // 0..100 at the start, 100 cap
//     skills: { swordsmanship, macefighting, fencing, wrestling, polearms,
//               archery, marksmanship, tactics, anatomy, parrying,
//               magery, evalInt, resistingSpells, focus },   // 0.0 .. 100.0
//     bonuses: {                                     // summed from gear and buffs
//       hit,            // SKILL POINTS added to the attack roll
//       defence,        // SKILL POINTS added to the defence roll
//       dodge,          // FRACTION added to dodge chance (0.05 = +5 points)
//       damagePct,      // PERCENT POINTS of damage (15 = +15%)
//       critChance,     // FRACTION added to the 0.05 base (0.10 = +10 points)
//       critDamage,     // FRACTION added to the 1.5 crit multiplier
//       swingSpeed,     // FRACTION faster (0.20 = 20% quicker swings)
//       armourPiercing, // PERCENT POINTS of the target's AR ignored
//       spellDamage,    // PERCENT POINTS of spell damage
//       lifeLeech,      // PERCENT POINTS of damage dealt returned as health
//       manaLeech,      // PERCENT POINTS of damage dealt returned as mana
//     },
//     ar,                                            // physical armour rating
//     resists: { physical, fire, cold, poison, energy },  // PERCENT POINTS, capped at 70
//     weapon: { skill, minDamage, maxDamage, speed, weight, damageType, ranged, reach },
//     shield: { parryFactor } | null,
//     health, maxHealth, stamina, mana,
//     difficulty,                                    // optional: this fighter's
//         // number as a lesson for whoever is fighting it (a rat is 5, a wraith
//         // 70). Absent, it is derived from the defence roll.
//   }
//
// The two unit conventions are worth saying twice, because mixing them is the
// bug this file is most likely to grow:
//   * anything named Pct, or a resist, is PERCENT POINTS: 15 means 15%.
//   * dodge, critChance, critDamage and swingSpeed are FRACTIONS: 0.15 is 15%.
// That split is not arbitrary. It is exactly how 02-COMBAT.md writes them
// (`damageBonus%`, `armour piercing 20%`, `resist ... capped at 70%` against
// `0.05 + critBonus`, `1.5 + critDamageBonus`, `(1 - swingSpeedBonus)`).
//
// ---------------------------------------------------------------------------
// Where the document was silent
// ---------------------------------------------------------------------------
// Three numbers are stated as effects with no figure attached. They are
// constants here so they are visible, tunable, and never hidden in an
// expression: ZERO_STAMINA_HIT_PENALTY (02 says a swing at zero stamina
// "misses more"), RESIST_SPELLS_PER_POINT (01 says Resisting Spells "reduces
// incoming magic damage") and SPELL_CRIT_PER_INT (01 says INT decides "spell
// critical chance").

// --- constants ---------------------------------------------------------------

export const SWING_FLOOR = 0.9;             // seconds, 02-COMBAT
export const SWING_DEX_PER_POINT = 0.003;
export const ZERO_STAMINA_SWING_MULT = 2;   // "slowed by half"
export const ZERO_STAMINA_HIT_PENALTY = 20; // skill points, = -10 points of hit chance

export const HIT_BASE = 0.50;
export const HIT_PER_SKILL = 0.005;         // 50 points of skill = 25 points of chance
export const HIT_MIN = 0.10;
export const HIT_MAX = 0.95;
export const TACTICS_TO_HIT = 0.25;

export const DODGE_PER_DEX = 0.002;
export const DODGE_CAP = 0.40;
export const PARRY_PER_SKILL = 0.004;
export const PARRY_CAP = 0.45;

export const DAMAGE_PER_STR = 0.006;        // ranged reads DEX with the same number
export const DAMAGE_PER_TACTICS = 0.005;
export const DAMAGE_PER_ANATOMY = 0.003;
export const CRIT_BASE_CHANCE = 0.05;
export const CRIT_BASE_MULT = 1.5;
export const AR_CONSTANT = 120;             // AR 120 halves, AR 240 takes two thirds
export const RESIST_CAP = 70;               // percent points
export const MIN_DAMAGE = 1;
export const JUMP_ATTACK_MULT = 1.25;       // a swing started in the air

export const SPELL_PER_INT = 0.008;
export const SPELL_PER_EVAL_INT = 0.006;
export const SPELL_CRIT_PER_INT = 0.0005;   // 100 INT doubles the 5% base
export const RESIST_SPELLS_PER_POINT = 0.003;   // 100 Resisting Spells = 30% off

export const FALL_FREE_METRES = 4;
export const FALL_PER_METRE = 6;

export const POISON_PER_LEVEL = 2;          // health a second
export const POISON_SECONDS_PER_LEVEL = 6;

export const AGGRO_RADIUS = { critter: 0, vermin: 6, normal: 12, hunter: 18, boss: 25 };
export const AGGRO_DEFAULT = AGGRO_RADIUS.normal;
export const LEASH_FACTOR = 2.5;
export const LEASH_MS = 6000;
export const FLEE_THRESHOLD = 0.25;
export const NEVER_FLEE = ['undead', 'construct'];

// What a monster with nothing in its hands swings with.
export const UNARMED = Object.freeze({
  skill: 'wrestling', minDamage: 1, maxDamage: 3, speed: 2.2,
  weight: 0, damageType: 'physical', ranged: false, reach: 1.5,
});

// The floating number table from 02-COMBAT.md, so the renderer and the resolver
// cannot drift apart. `damage` is what the resolver emits for a landed hit; a
// renderer showing a hit taken by the local player swaps it for `taken`.
export const NUMBER_KINDS = Object.freeze({
  damage: { colour: '#ffffff', size: 1.0 },
  crit:   { colour: '#ffd23a', size: 1.5, shake: true },
  taken:  { colour: '#ff4b4b', size: 1.2 },
  heal:   { colour: '#4ade4a', size: 1.0 },
  miss:   { colour: '#9aa0a6', size: 0.8 },
  dodge:  { colour: '#9aa0a6', size: 0.8 },
  parry:  { colour: '#9aa0a6', size: 0.8 },
  fall:   { colour: '#ff9a2e', size: 1.2 },
  gain:   { colour: '#7cff5a', size: 1.3 },
  stat:   { colour: '#7cff5a', size: 1.6 },
  gold:   { colour: '#ffcf40', size: 1.0 },
  loot:   { colour: null, size: 1.2 },      // colour comes from the item's rarity
});

// --- small readers -----------------------------------------------------------

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const stat = (f, k) => num(f && f.stats && f.stats[k]);
const skill = (f, k) => num(f && f.skills && f.skills[k]);
const bonus = (f, k) => num(f && f.bonuses && f.bonuses[k]);

export const weaponOf = (f) => (f && f.weapon) || UNARMED;
export const weaponSkillId = (f) => weaponOf(f).skill || UNARMED.skill;
export const weaponSkillOf = (f) => skill(f, weaponSkillId(f));
export const damageTypeOf = (f) => weaponOf(f).damageType || 'physical';
const rollRng = (rng) => {
  if (typeof rng !== 'function') throw new Error('combat_rules: rng must be a function');
  return rng();
};

/** The lesson difficulty this fighter presents to whoever is fighting it. */
export function difficultyOf(f) {
  if (f && typeof f.difficulty === 'number') return f.difficulty;
  return Math.round(defenceSkill(f));
}

// --- the swing ---------------------------------------------------------------

/**
 * swingSeconds = weapon.speed * (1 - DEX * 0.003) * (1 - swingSpeedBonus),
 * floored at 0.9 s, then doubled while stamina is at zero. A 3.0 s longsword at
 * 60 DEX swings every 2.46 s; a 2.0 s dagger at 90 DEX every 1.46 s.
 * The floor is applied before the stamina penalty, so an exhausted fighter is
 * always exactly twice the time of a rested one.
 */
export function swingSeconds(fighter) {
  const w = weaponOf(fighter);
  const dexFactor = Math.max(0.1, 1 - stat(fighter, 'dex') * SWING_DEX_PER_POINT);
  const speedFactor = Math.max(0.1, 1 - bonus(fighter, 'swingSpeed'));
  let s = Math.max(0.1, num(w.speed)) * dexFactor * speedFactor;
  if (s < SWING_FLOOR) s = SWING_FLOOR;
  if (num(fighter && fighter.stamina) <= 0) s *= ZERO_STAMINA_SWING_MULT;
  return s;
}

/** The stamina one swing costs: the weapon's weight in stones. */
export function swingStaminaCost(fighter) {
  return num(weaponOf(fighter).weight);
}

// --- hit, dodge, parry -------------------------------------------------------

/** weaponSkill + Tactics * 0.25 + hitBonus, less the exhaustion penalty. */
export function attackSkill(f) {
  const exhausted = num(f && f.stamina) <= 0 ? ZERO_STAMINA_HIT_PENALTY : 0;
  return weaponSkillOf(f) + skill(f, 'tactics') * TACTICS_TO_HIT + bonus(f, 'hit') - exhausted;
}

/** weaponSkill * 0.5 + Parrying * 0.5 + DEX * 0.4 + defenceBonus. */
export function defenceSkill(f) {
  return weaponSkillOf(f) * 0.5 + skill(f, 'parrying') * 0.5 + stat(f, 'dex') * 0.4 + bonus(f, 'defence');
}

/** clamp(0.50 + (attack - defence) * 0.005, 0.10, 0.95). Two equals hit half. */
export function hitChance(attacker, defender) {
  const d = HIT_BASE + (attackSkill(attacker) - defenceSkill(defender)) * HIT_PER_SKILL;
  return clamp(d, HIT_MIN, HIT_MAX);
}

/** clamp(DEX * 0.002 + dodgeBonus, 0, 0.40). Rolled only after a hit lands. */
export function dodgeChance(defender) {
  return clamp(stat(defender, 'dex') * DODGE_PER_DEX + bonus(defender, 'dodge'), 0, DODGE_CAP);
}

/** Parrying * 0.004 * shield.parryFactor, cap 0.45. No shield, no parry. */
export function parryChance(defender) {
  const sh = defender && defender.shield;
  if (!sh) return 0;
  const factor = typeof sh.parryFactor === 'number' ? sh.parryFactor : 1;
  return clamp(skill(defender, 'parrying') * PARRY_PER_SKILL * factor, 0, PARRY_CAP);
}

// --- damage ------------------------------------------------------------------

/** An inclusive integer roll between the weapon's min and max damage. */
export function weaponRoll(weapon, rng) {
  const w = weapon || UNARMED;
  const lo = Math.round(num(w.minDamage)), hi = Math.round(num(w.maxDamage));
  const a = Math.min(lo, hi), b = Math.max(lo, hi);
  return a + Math.floor(rollRng(rng) * (b - a + 1));
}

/** 0.05 + critBonus, for a melee swing. */
export function critChance(attacker) {
  return clamp(CRIT_BASE_CHANCE + bonus(attacker, 'critChance'), 0, 1);
}

/**
 * The whole of the damage pipeline, with every part named so the interface can
 * show its working.
 *
 *   raw        = roll * (1 + STR*0.006 + Tactics*0.005 + Anatomy*0.003 + damage%)
 *   landed     = raw * multiplier * (crit ? 1.5 + critDamage : 1)
 *   reduction  = AR / (AR + 120), AR reduced by the attacker's armour piercing
 *   final      = max(1, round(landed * (1 - reduction) * (1 - resist)))
 *
 * Ranged weapons read DEX where melee reads STR. Resists are percent points and
 * are capped at 70 before they are applied.
 *
 * @param roll the weapon roll. Pass null with opts.rng to have it rolled here.
 * @param opts { crit, damageType, multiplier, ranged, rng, ignoreArmour }
 */
export function damage(attacker, defender, roll, opts = {}) {
  const w = weaponOf(attacker);
  const r = typeof roll === 'number' ? roll : weaponRoll(w, opts.rng);
  const ranged = opts.ranged !== undefined ? !!opts.ranged : !!w.ranged;
  const power = stat(attacker, ranged ? 'dex' : 'str');
  const strengthBonus = power * DAMAGE_PER_STR;
  const tacticsBonus = skill(attacker, 'tactics') * DAMAGE_PER_TACTICS;
  const anatomyBonus = skill(attacker, 'anatomy') * DAMAGE_PER_ANATOMY;
  const damageBonus = bonus(attacker, 'damagePct') / 100;

  const raw = r * (1 + strengthBonus + tacticsBonus + anatomyBonus + damageBonus);
  const multiplier = typeof opts.multiplier === 'number' ? opts.multiplier : 1;
  const crit = !!opts.crit;
  const critMult = crit ? CRIT_BASE_MULT + bonus(attacker, 'critDamage') : 1;
  const landed = raw * multiplier * critMult;

  const pierce = clamp(bonus(attacker, 'armourPiercing') / 100, 0, 1);
  const ar = opts.ignoreArmour ? 0 : Math.max(0, num(defender && defender.ar) * (1 - pierce));
  const reduction = ar / (ar + AR_CONSTANT);

  const damageType = opts.damageType || w.damageType || 'physical';
  const resist = resistOf(defender, damageType);

  const final = Math.max(MIN_DAMAGE, Math.round(landed * (1 - reduction) * (1 - resist)));
  return {
    roll: r, raw, multiplier, crit, critMult, landed,
    ar, reduction, resist, damageType, ranged, final,
    parts: { strengthBonus, tacticsBonus, anatomyBonus, damageBonus },
  };
}

/** A defender's resist to one damage type as a fraction, capped at 70%. */
export function resistOf(fighter, damageType) {
  const table = (fighter && fighter.resists) || null;
  const pct = table ? num(table[damageType]) : 0;
  return clamp(pct, 0, RESIST_CAP) / 100;
}

// --- the melee resolver ------------------------------------------------------

const lesson = (who, skillId, difficulty, success) =>
  ({ who, kind: 'skill', skill: skillId, stat: null, difficulty, success });
const statLesson = (who, statId, difficulty, success) =>
  ({ who, kind: 'stat', skill: null, stat: statId, difficulty, success });

/**
 * One swing, start to finish. Mutates nothing.
 *
 * Rolls are drawn from rng in this order, and only when they are needed, so a
 * fixed sequence drives a fixed outcome:
 *   1. hit          always
 *   2. dodge        only after a hit, and only if dodgeChance > 0
 *   3. parry        only after a hit that was not dodged, and if parryChance > 0
 *   4. weapon roll  only when the swing lands
 *   5. crit         only when the swing lands, and if critChance > 0
 *
 * Returns the shape 02-COMBAT.md asks for, plus the defender's new health, the
 * chances that produced it, and when the attacker may swing again.
 *
 * @param now milliseconds. `nextSwingAt` comes back in the same units.
 */
export function resolveMelee({ attacker, defender, now = 0, rng, jumpAttack = false } = {}) {
  if (typeof rng !== 'function') throw new Error('combat_rules: resolveMelee needs an rng');
  const w = weaponOf(attacker);
  const damageType = w.damageType || 'physical';
  const attackerDifficulty = difficultyOf(defender);   // what the attacker is learning from
  const defenderDifficulty = difficultyOf(attacker);   // what the defender is learning from
  const lessons = [];
  const numbers = [];

  const hc = hitChance(attacker, defender);
  const dc = dodgeChance(defender);
  const pc = parryChance(defender);

  const hit = rng() < hc;
  let dodged = false, parried = false;
  if (hit && dc > 0) dodged = rng() < dc;
  if (hit && !dodged && pc > 0) parried = rng() < pc;
  const connects = hit && !dodged && !parried;

  let crit = false, detail = null, dealt = 0;
  if (connects) {
    const roll = weaponRoll(w, rng);
    const cc = critChance(attacker);
    if (cc > 0) crit = rng() < cc;
    detail = damage(attacker, defender, roll, {
      crit, damageType, multiplier: jumpAttack ? JUMP_ATTACK_MULT : 1,
    });
    dealt = detail.final;
  }

  // Lessons. The weapon skill and Tactics are used on every attempt, hit or
  // miss, which is what "every attempt is a skill lesson" means. Anatomy only
  // teaches when the blow actually lands, because that is the only time it did
  // anything. Parrying teaches whenever a parry was rolled.
  lessons.push(lesson('attacker', weaponSkillId(attacker), attackerDifficulty, hit));
  lessons.push(lesson('attacker', 'tactics', attackerDifficulty, connects));
  if (connects) lessons.push(lesson('attacker', 'anatomy', attackerDifficulty, true));
  if (hit && !dodged && pc > 0) {
    lessons.push(lesson('defender', 'parrying', defenderDifficulty, parried));
  }
  // Stat lessons, from 01-STATS-SKILLS: a dodge raises DEX, a landed swing has
  // a chance to raise the swinger's power stat, taking a hit raises CON.
  if (dodged) lessons.push(statLesson('defender', 'dex', defenderDifficulty, true));
  if (connects) {
    lessons.push(statLesson('attacker', detail.ranged ? 'dex' : 'str', attackerDifficulty, true));
    lessons.push(statLesson('defender', 'con', defenderDifficulty, true));
  }

  // Numbers. Every outcome says something: a silent swing is indistinguishable
  // from a broken one.
  if (!hit) numbers.push({ over: 'defender', text: 'miss', kind: 'miss' });
  else if (dodged) numbers.push({ over: 'defender', text: 'dodge', kind: 'dodge' });
  else if (parried) numbers.push({ over: 'defender', text: 'parry', kind: 'parry' });
  else numbers.push({ over: 'defender', text: String(dealt), kind: crit ? 'crit' : 'damage' });

  const health = num(defender && defender.health);
  const defenderHealth = Math.max(0, health - dealt);
  const swing = swingSeconds(attacker);

  return {
    hit, dodged, parried, crit,
    damage: dealt, damageType, killed: dealt > 0 && defenderHealth <= 0,
    defenderHealth,
    lessons, numbers,
    detail,
    chances: { hit: hc, dodge: dc, parry: pc, crit: critChance(attacker) },
    swingSeconds: swing,
    nextSwingAt: now + swing * 1000,
    staminaCost: swingStaminaCost(attacker),
  };
}

// --- spells ------------------------------------------------------------------

/** 0.05 + INT * 0.0005 + critBonus. */
export function spellCritChance(caster) {
  return clamp(CRIT_BASE_CHANCE + stat(caster, 'int') * SPELL_CRIT_PER_INT + bonus(caster, 'critChance'), 0, 1);
}

/** The fraction of incoming magic damage Resisting Spells takes off. */
export function spellResistance(target) {
  return clamp(skill(target, 'resistingSpells') * RESIST_SPELLS_PER_POINT, 0, 0.9);
}

/**
 * base * (1 + INT * 0.008 + evalInt * 0.006 + spellDamage%), then crit, then
 * the target's typed resist and Resisting Spells. Armour does not stop a spell.
 *
 * Rolls in order: base damage, crit.
 */
export function resolveSpell({ caster, target, spell, rng, now = 0 } = {}) {
  if (typeof rng !== 'function') throw new Error('combat_rules: resolveSpell needs an rng');
  if (!spell || !Array.isArray(spell.base)) throw new Error('combat_rules: spell needs base [lo, hi]');
  const [lo, hi] = spell.base;
  const damageType = spell.damageType || 'energy';
  const roll = weaponRoll({ minDamage: lo, maxDamage: hi }, rng);

  const intBonus = stat(caster, 'int') * SPELL_PER_INT;
  const evalBonus = skill(caster, 'evalInt') * SPELL_PER_EVAL_INT;
  const gearBonus = bonus(caster, 'spellDamage') / 100;
  const raw = roll * (1 + intBonus + evalBonus + gearBonus);

  const cc = spellCritChance(caster);
  const crit = cc > 0 ? rng() < cc : false;
  const critMult = crit ? CRIT_BASE_MULT + bonus(caster, 'critDamage') : 1;
  const landed = raw * critMult;

  const resist = resistOf(target, damageType);
  const resisted = spellResistance(target);
  const unresisted = Math.max(MIN_DAMAGE, Math.round(landed));
  const final = Math.max(MIN_DAMAGE, Math.round(landed * (1 - resist) * (1 - resisted)));

  const casterDifficulty = difficultyOf(target);
  const targetDifficulty = difficultyOf(caster);
  const lessons = [
    lesson('attacker', 'magery', casterDifficulty, true),
    lesson('attacker', 'evalInt', casterDifficulty, true),
    statLesson('attacker', 'int', casterDifficulty, true),
    // The target's lesson succeeds when its resistance actually took a point
    // off. Standing in front of a fireball with nothing teaches nothing.
    lesson('defender', 'resistingSpells', targetDifficulty, final < unresisted),
    statLesson('defender', 'con', targetDifficulty, true),
  ];
  const numbers = [{ over: 'defender', text: String(final), kind: crit ? 'crit' : 'damage' }];

  const health = num(target && target.health);
  const targetHealth = Math.max(0, health - final);
  return {
    hit: true, crit, damage: final, damageType,
    killed: targetHealth <= 0,
    targetHealth, defenderHealth: targetHealth,
    roll, raw, landed, resist, resisted, unresisted,
    lessons, numbers, now,
    parts: { intBonus, evalBonus, gearBonus, critMult },
  };
}

// --- falling, poison, leech --------------------------------------------------

/** max(0, (metres - 4) * 6). Nothing resists a fall. */
export function fallDamage(metres) {
  return Math.max(0, Math.round((num(metres) - FALL_FREE_METRES) * FALL_PER_METRE));
}

/** A poisoned target loses level * 2 health a second for level * 6 seconds. */
export function poisonTick(level) {
  const l = Math.max(0, num(level));
  return { perSecond: l * POISON_PER_LEVEL, seconds: l * POISON_SECONDS_PER_LEVEL };
}

/**
 * Life and mana leech off a resolved hit, as percent points of damage dealt.
 * Capped by what the attacker is actually missing, so the green number over its
 * head is the health it really got.
 */
export function applyLeech(result, attacker) {
  const dealt = num(result && result.damage);
  const numbers = [];
  if (dealt <= 0) return { healed: 0, mana: 0, numbers };
  let healed = Math.round(dealt * bonus(attacker, 'lifeLeech') / 100);
  let mana = Math.round(dealt * bonus(attacker, 'manaLeech') / 100);
  const maxHealth = num(attacker && attacker.maxHealth);
  if (maxHealth > 0) healed = Math.max(0, Math.min(healed, maxHealth - num(attacker.health)));
  const maxMana = num(attacker && attacker.maxMana);
  if (maxMana > 0) mana = Math.max(0, Math.min(mana, maxMana - num(attacker.mana)));
  if (healed > 0) numbers.push({ over: 'attacker', text: String(healed), kind: 'heal' });
  return { healed, mana, numbers };
}

// --- monsters: aggro, leash, flee --------------------------------------------

const posOf = (p) => (p && typeof p === 'object' ? p : { x: 0, y: 0, z: 0 });
function distance(a, b) {
  const p = posOf(a), q = posOf(b);
  const dx = num(p.x) - num(q.x), dy = num(p.y) - num(q.y), dz = num(p.z) - num(q.z);
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
/** Aggro reads temperament; fleeing reads family. Either falls back to the other. */
const temperamentOf = (m) => (m && (m.temperament || m.family)) || 'normal';
const familyOf = (m) => (m && (m.family || m.temperament)) || '';

/** Radius by temperament, or whatever the monster record carries. */
export function aggroRadius(monster) {
  if (!monster) return AGGRO_DEFAULT;
  if (typeof monster.aggro === 'number') return monster.aggro;
  if (monster.ai && typeof monster.ai.aggro === 'number') return monster.ai.aggro;
  if (typeof monster.aggroRadius === 'number') return monster.aggroRadius;
  const t = temperamentOf(monster);
  return t in AGGRO_RADIUS ? AGGRO_RADIUS[t] : AGGRO_DEFAULT;
}

/** 2.5x the aggro radius unless the record says otherwise. */
export function leashRadius(monster) {
  if (monster && typeof monster.leash === 'number') return monster.leash;
  if (monster && monster.ai && typeof monster.ai.leash === 'number') return monster.ai.leash;
  return aggroRadius(monster) * LEASH_FACTOR;
}

/** True when this monster turns and comes. Critters never do, at any distance. */
export function aggroCheck(monster, playerPos) {
  if (!monster) return false;
  if (temperamentOf(monster) === 'critter') return false;
  if (num(monster.health) <= 0) return false;
  const r = aggroRadius(monster);
  if (r <= 0) return false;
  return distance(monster.pos, playerPos) <= r;
}

/**
 * Aggro breaks when the player is past the leash radius for 6 s. Pure: the
 * caller stores the returned `leashSince` back on the monster (or clears it).
 */
export function leashCheck(monster, homePos, playerPos, now = 0) {
  const leash = leashRadius(monster);
  const d = distance(playerPos, homePos);
  const beyond = d > leash;
  const had = monster && (typeof monster.leashSince === 'number' ? monster.leashSince
    : monster.ai && typeof monster.ai.leashSince === 'number' ? monster.ai.leashSince : null);
  const leashSince = beyond ? (had === null ? num(now) : had) : null;
  const broken = beyond && num(now) - leashSince >= LEASH_MS;
  return { beyond, broken, leashSince, leash, distance: d, elapsed: beyond ? num(now) - leashSince : 0 };
}

/**
 * Critters flee at any damage. Undead and constructs never flee. Everything
 * else, vermin and beasts included, flees below a quarter health.
 */
export function fleeCheck(monster) {
  if (!monster) return false;
  const health = num(monster.health);
  const maxHealth = num(monster.maxHealth) || health;
  if (health <= 0 || maxHealth <= 0) return false;
  const family = familyOf(monster);
  if (NEVER_FLEE.includes(family)) return false;
  if (family === 'critter') return health < maxHealth;
  return health / maxHealth < FLEE_THRESHOLD;
}
