// Loot: what a dead thing leaves behind. Pure, deterministic, no THREE.
//
// Three rules from the documents, implemented once and used by every kill:
//
// SHIFT. "Monster tier shifts the weights up one row per two tiers."
//   shift = floor(tier / 2), and each base weight moves that many rows toward
//   the rare end, clamped at legendary so no probability is lost:
//     weight[min(5, i + shift)] += BASE[i]
//   Tier 1 is the printed table. Tier 2 and 3 (shift 1) never drop a white:
//   uncommon takes the 70, and legendary keeps 0.5 + 0.1. Tier 4 and 5
//   (shift 2) start at blue. That is a hard reading of "up one row", and it is
//   the only one that makes rarity climb with tier, which is what the sentence
//   is for.
//
// LUCK. "Luck adds luck * 0.5% to every roll above common." Every above-common
//   weight is multiplied by (1 + luck * 0.005), so 40 Luck makes each of them
//   20% likelier relative to common. Common's own weight is untouched.
//
// BOSSES. "Bosses roll twice and keep the better", and tier 5 champions
//   "always roll loot twice" as well. bossRoll does both; a real boss also
//   passes floor: 'epic', which is the document's "always drop a purple or
//   better".
//
// Gold ranges are the per-tier ranges of docs/mmo/05-WORLD-CONTENT.md.

import { hash2, rand2 } from '../world/noise.js';
import { makeItem, RARITY, RARITY_ORDER, baseFor } from './items.js';

const SALT_RNG = 0x1007;
const SALT_ITEM = 0x100d;
const SALT_SECOND = 0xb055;

/** A deterministic [0, 1) stream from one integer seed. */
export function seededRng(seed) {
  let i = 0;
  const s = seed >>> 0;
  return () => rand2(s, (i++ * 1103515245 + 12345) | 0, SALT_RNG);
}

/** The printed drop weights, common first. Read live, so the audit and the
 * tests see a table that has been tampered with rather than a snapshot. */
export const baseWeights = () => RARITY_ORDER.map((id) => RARITY[id].weight);
export const BASE_WEIGHTS = baseWeights();

/** Gold per kill by monster tier, from the world content tables. */
export const GOLD = {
  0: [0, 0],
  1: [4, 12],
  2: [12, 30],
  3: [30, 80],
  4: [80, 250],
  5: [250, 800],
  boss: [800, 3000],
};

/** How many rows the table climbs for a monster tier. */
export const shiftFor = (tier) => Math.max(0, Math.floor((Number(tier) || 0) / 2));

/** The six weights for a tier and a Luck value, common first. */
export function weightsFor(tier, luck = 0) {
  const shift = shiftFor(tier);
  const w = [0, 0, 0, 0, 0, 0];
  const base = baseWeights();
  for (let i = 0; i < 6; i++) w[Math.min(5, i + shift)] += base[i];
  const boost = 1 + Math.max(0, luck) * 0.005;
  for (let i = 1; i < 6; i++) w[i] *= boost;
  return w;
}

/** One rarity id, drawn from the shifted and luck-boosted weights. */
export function rollRarity(monsterTier, luck = 0, rng = Math.random) {
  const w = weightsFor(monsterTier, luck);
  let total = 0;
  for (const x of w) total += x;
  let t = rng() * total;
  for (let i = 0; i < 6; i++) {
    if (t < w[i]) return RARITY_ORDER[i];
    t -= w[i];
  }
  return RARITY_ORDER[5];
}

/** Gold from a kill, uniform in the tier's range. Critters carry none. */
export function rollGold(tier, rng = Math.random) {
  const range = GOLD[tier];
  if (!range) return 0;
  const [lo, hi] = range;
  if (hi <= lo) return lo;
  return lo + Math.floor(rng() * (hi - lo + 1));
}

/**
 * One loot roll.
 *
 * `table` is the monster's own list of base ids, either as an array or as
 * { bases, chance } when the monster does not drop on every kill. Tier 0
 * critters drop nothing here: they give meat and hide through Skinning.
 *
 * Returns the item unidentified, with its affix list empty. The affixes are
 * already decided by item.seed; affixes.identify() reads them out.
 */
export function rollDrop({ table, tier = 1, luck = 0, seed = 0 } = {}) {
  if (!table) return null;
  const bases = Array.isArray(table) ? table : table.bases;
  const chance = Array.isArray(table) ? 1 : (table.chance != null ? table.chance : 1);
  if (!bases || !bases.length) return null;
  if (!tier || tier === 0) return null;
  const rng = seededRng(seed);
  if (chance < 1 && rng() >= chance) return null;
  const rarity = rollRarity(tier, luck, rng);
  const pick = Math.min(bases.length - 1, Math.floor(rng() * bases.length));
  const base = bases[pick];
  if (!baseFor(base)) throw new Error(`rollDrop: the table names ${base}, which is not a base`);
  return makeItem({ base, rarity, seed: hash2(seed, RARITY_ORDER.indexOf(rarity) * 31 + pick, SALT_ITEM) });
}

/** The better of two items by rarity. Either may be null. */
export function better(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return RARITY_ORDER.indexOf(b.rarity) > RARITY_ORDER.indexOf(a.rarity) ? b : a;
}

/**
 * Two rolls, the better kept. Tier 5 champions call this; a boss calls it with
 * floor: 'epic' so it always leaves a purple or better.
 */
export function bossRoll({ table, tier = 5, luck = 0, seed = 0, floor = null } = {}) {
  const first = rollDrop({ table, tier, luck, seed });
  const second = rollDrop({ table, tier, luck, seed: hash2(seed, 1, SALT_SECOND) });
  let best = better(first, second);
  if (!best) return null;
  if (floor) {
    const want = RARITY_ORDER.indexOf(floor);
    if (want < 0) throw new Error(`bossRoll: ${floor} is not a rarity`);
    if (RARITY_ORDER.indexOf(best.rarity) < want) {
      best = makeItem({ base: best.base, rarity: floor, seed: best.seed });
    }
  }
  return best;
}

/** Everything one kill leaves: gold, and a drop or nothing. */
export function rollKill({ table, tier = 1, luck = 0, seed = 0, boss = false, twice = false } = {}) {
  const gold = rollGold(boss ? 'boss' : tier, seededRng(hash2(seed, 77, SALT_SECOND)));
  const item = (boss || twice)
    ? bossRoll({ table, tier, luck, seed, floor: boss ? 'epic' : null })
    : rollDrop({ table, tier, luck, seed });
  return { gold, item };
}

/** Fails loudly if the gold table or the weight shift has drifted. Runs at load. */
export function auditLoot() {
  const bad = (m) => { throw new Error(`auditLoot: ${m}`); };
  for (const key of ['0', '1', '2', '3', '4', '5', 'boss']) {
    const r = GOLD[key];
    if (!Array.isArray(r) || r.length !== 2) bad(`tier ${key} has no gold range`);
    if (r[0] > r[1]) bad(`tier ${key} gold runs backwards`);
  }
  for (const t of [0, 1, 2, 3, 4, 5]) {
    const w = weightsFor(t, 0);
    const sum = w.reduce((s, x) => s + x, 0);
    if (Math.abs(sum - 100) > 1e-9) bad(`tier ${t} weights sum to ${sum}, not 100`);
  }
  if (shiftFor(1) !== 0 || shiftFor(3) !== 1 || shiftFor(5) !== 2) bad('the shift is not one row per two tiers');
  return true;
}

auditLoot();
