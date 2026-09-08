// The five stats: the pools they feed, the gain roll, and the creation spread.
// Pure. No THREE, no DOM, no clock, no randomness of its own: every roll takes
// an rng you pass in, so a test can drive it both ways.
//
// Source: docs/mmo/01-STATS-SKILLS.md. Every formula below is the formula in
// that document, character for character. Where the document's prose quotes a
// number that its own formula does not produce, the formula wins and the
// divergence is measured out loud in stats.test.mjs. The two live ones:
//
//   maxHealth, "a fresh warrior (STR 60, CON 55) has 140 health"
//     30 + 55 * 2.0 + 60 * 0.5 = 170, not 140. The prose drops the STR term.
//   statGainChance, "at 30 STR that is 3.6% ... at 90 it is 0.6% ... 0.33%"
//     0.06 * (1 - 30/110) = 0.043636, 0.010909, 0.005455. No clamp, no
//     rounding and no reading of the printed formula produces 3.6/0.6/0.33.
//
// The document's mage does hold: 10 + 60 * 2.0 + 65 * 0.5 = 162.5, which is
// "162 mana" once the interface floors it.

export const STATS = ['str', 'dex', 'int', 'con', 'wis'];

export const STAT_START_TOTAL = 250;   // what character creation must spend
export const STAT_CAP = 100;           // per stat, at the start and after
export const STAT_TOTAL_CAP = 400;     // all five together, ever
export const STAT_MIN_AT_CREATION = 10; // no stat may be dumped below this
export const STAT_GAIN = 1;            // "a gain is always exactly +1"

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
// Regens land on values like 1.5000000000000002 in binary floating point.
// Round the derived block to 1e-4, which is four orders below anything the
// interface shows, so the numbers a test asserts are the numbers a player sees.
const r4 = (v) => Math.round(v * 1e4) / 1e4;

const statValue = (stats, k) => {
  const v = stats && stats[k];
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
};

// Accepts either a plain skill map ({ meditation: 45 }) or a whole skill state
// ({ skills: { meditation: 45 }, locks: {} }), because passing the state by
// mistake would otherwise read every skill as zero and say nothing.
const skillValue = (skills, id) => {
  const map = skills && skills.skills && typeof skills.skills === 'object' ? skills.skills : skills;
  const v = map && map[id];
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
};

/**
 * Everything the rest of the game reads off the stats.
 *
 *   maxHealth    = 30 + CON * 2.0 + STR * 0.5
 *   maxMana      = 10 + WIS * 2.0 + INT * 0.5
 *   maxStamina   = 20 + DEX * 1.5 + CON * 0.5
 *   carry        = 40 + STR * 2.0                  (stones)
 *   healthRegen  = 0.4 + CON * 0.020               (per second; combat doubles it out of fight)
 *   manaRegen    = 0.3 + WIS * 0.025 + Meditation * 0.010
 *   staminaRegen = 2.5 + DEX * 0.030               (per second; combat doubles it out of fight)
 *
 * healthRegen is the base rate. The "out of combat x2" in the document belongs
 * to the combat layer, which knows whether you are in a fight; this file does
 * not and will not pretend to.
 */
export function derived(stats = {}, skills = {}) {
  const str = statValue(stats, 'str');
  const dex = statValue(stats, 'dex');
  const int = statValue(stats, 'int');
  const con = statValue(stats, 'con');
  const wis = statValue(stats, 'wis');
  const meditation = skillValue(skills, 'meditation');
  return {
    maxHealth: r4(30 + con * 2.0 + str * 0.5),
    maxMana: r4(10 + wis * 2.0 + int * 0.5),
    maxStamina: r4(20 + dex * 1.5 + con * 0.5),
    carry: r4(40 + str * 2.0),
    healthRegen: r4(0.4 + con * 0.020),
    manaRegen: r4(0.3 + wis * 0.025 + meditation * 0.010),
    // 2.5 at the base since 2026-09-08 (it was 1.0): a fresh warrior at DEX 50
    // took 51 s to refill 127.5 stamina, and the user found the early game
    // waiting on the bar. 4.0 a second in a fight, 8.0 out of one.
    staminaRegen: r4(2.5 + dex * 0.030),
  };
}

/** statGainChance(stat) = clamp(0.06 * (1 - stat / 110), 0.002, 0.06) */
export function statGainChance(value) {
  const v = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return clamp(0.06 * (1 - v / 110), 0.002, 0.06);
}

/** The five stats added up. */
export function statTotal(stats = {}) {
  let t = 0;
  for (const k of STATS) t += statValue(stats, k);
  return Math.round(t * 1e4) / 1e4;
}

/**
 * One chance at +1 in a stat, for a swing that landed or a hit that was taken.
 *
 * Mutates `stats` on a gain, and always says why when it will not: a refusal is
 * never silent. `{ gained, value, refused, reason, chance }` where `value` is
 * the stat after the roll, `refused` is true only for a cap or a bad name, and
 * a plain unlucky roll comes back `{ gained: false, refused: false, reason: null }`.
 */
export function rollStatGain(stats, stat, rng = Math.random) {
  if (!stats || typeof stats !== 'object') {
    return { gained: false, value: 0, refused: true, reason: 'there are no stats to raise', chance: 0 };
  }
  if (!STATS.includes(stat)) {
    return {
      gained: false, value: 0, refused: true, chance: 0,
      reason: `"${stat}" is not a stat; the five are ${STATS.join(', ')}`,
    };
  }
  const value = statValue(stats, stat);
  const name = stat.toUpperCase();
  if (value >= STAT_CAP) {
    return {
      gained: false, value, refused: true, chance: 0,
      reason: `${name} is at the cap of ${STAT_CAP} and cannot rise`,
    };
  }
  const total = statTotal(stats);
  if (total + STAT_GAIN > STAT_TOTAL_CAP) {
    return {
      gained: false, value, refused: true, chance: 0,
      reason: `your stats total ${total} of ${STAT_TOTAL_CAP}; nothing can rise until something falls`,
    };
  }
  const chance = statGainChance(value);
  if (rng() >= chance) return { gained: false, value, refused: false, reason: null, chance };
  const next = value + STAT_GAIN;
  stats[stat] = next;
  return { gained: true, value: next, refused: false, reason: null, chance };
}

/**
 * The character creation spread: all five present, whole numbers, 250 in total,
 * none over 100, none under 10. Returns every complaint, not just the first,
 * because a creation screen has to colour all the offending boxes at once.
 */
export function validateSpread(stats) {
  const errors = [];
  if (!stats || typeof stats !== 'object') {
    return { ok: false, total: 0, errors: ['there is no spread to check'] };
  }
  for (const k of Object.keys(stats)) {
    if (!STATS.includes(k)) errors.push(`"${k}" is not a stat`);
  }
  for (const k of STATS) {
    const v = stats[k];
    if (typeof v !== 'number' || !Number.isFinite(v)) { errors.push(`${k.toUpperCase()} has no value`); continue; }
    if (!Number.isInteger(v)) errors.push(`${k.toUpperCase()} is ${v}; stats are whole numbers`);
    if (v > STAT_CAP) errors.push(`${k.toUpperCase()} is ${v}, over the cap of ${STAT_CAP}`);
    if (v < STAT_MIN_AT_CREATION) errors.push(`${k.toUpperCase()} is ${v}, under the floor of ${STAT_MIN_AT_CREATION}`);
  }
  const total = statTotal(stats);
  if (total !== STAT_START_TOTAL) {
    const over = total > STAT_START_TOTAL;
    errors.push(`the spread totals ${total}, ${over ? 'over' : 'under'} the ${STAT_START_TOTAL} you have to place`);
  }
  return { ok: errors.length === 0, total, errors };
}
