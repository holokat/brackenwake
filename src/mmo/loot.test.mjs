// Loot rolls, driven both ways. Run: node src/mmo/loot.test.mjs
//
// The rarity distribution is measured, not asserted. Note the sample sizes: at
// 100,000 rolls a 10% band around legendary (expected 100) is one standard
// deviation wide, so passing it would be luck rather than correctness. The
// 100,000 roll check therefore holds the four common rows to 10% and the two
// rare ones to a four sigma binomial band, and a second run of 2,000,000 rolls
// holds ALL SIX to 10%, where that band is 4.5 sigma or better for every row.
import {
  BASE_WEIGHTS, GOLD, shiftFor, weightsFor, rollRarity, rollGold, rollDrop, bossRoll,
  rollKill, better, seededRng, auditLoot,
} from './loot.js';
import { RARITY, RARITY_ORDER, baseFor, takesRarity, auditItems, MEAT_BASES } from './items.js';
import { rollAffixes, identify } from './affixes.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };
const threw = (fn) => { try { fn(); return false; } catch { return true; } };
const TABLE = ['longsword', 'shortsword', 'buckler', 'chain_chest', 'ring'];

const tally = (tier, luck, seed, n) => {
  const rng = seededRng(seed);
  const c = Object.fromEntries(RARITY_ORDER.map((r) => [r, 0]));
  for (let i = 0; i < n; i++) c[rollRarity(tier, luck, rng)]++;
  return c;
};

// ------------------------------------------------------------- the weights
{
  check('the base weights are the printed column', BASE_WEIGHTS.join(' ') === '70 20 7 2.4 0.5 0.1', BASE_WEIGHTS.join(' '));
  check('the shift is one row per two tiers',
    [0, 1, 2, 3, 4, 5].map(shiftFor).join('') === '001122', [0, 1, 2, 3, 4, 5].map((t) => `t${t}:${shiftFor(t)}`).join(' '));
  check('tier 1 is the printed table exactly', weightsFor(1, 0).join(' ') === '70 20 7 2.4 0.5 0.1');
  check('no probability is lost at any tier',
    [0, 1, 2, 3, 4, 5].every((t) => Math.abs(weightsFor(t, 0).reduce((s, x) => s + x, 0) - 100) < 1e-9),
    [0, 1, 2, 3, 4, 5].map((t) => weightsFor(t, 0).reduce((s, x) => s + x, 0).toFixed(1)).join(' '));
  check('tier 3 drops no whites and hands the 70 to green', weightsFor(3, 0)[0] === 0 && weightsFor(3, 0)[1] === 70, weightsFor(3, 0).join(' '));
  check('tier 5 starts at blue', weightsFor(5, 0)[0] === 0 && weightsFor(5, 0)[1] === 0 && weightsFor(5, 0)[2] === 70, weightsFor(5, 0).join(' '));
  check('Luck lifts every row above common and leaves common alone', (() => {
    const w0 = weightsFor(1, 0), w40 = weightsFor(1, 40);
    return w0[0] === w40[0] && w40.slice(1).every((x, i) => Math.abs(x - w0[i + 1] * 1.2) < 1e-9);
  })(), `luck 40 multiplies the above-common weights by ${(1 + 40 * 0.005).toFixed(2)}`);
}

// -------------------------------------------------- the measured distribution
{
  const N = 100000;
  const c = tally(1, 0, 20260904, N);
  const expect = { common: 0.70, uncommon: 0.20, rare: 0.07, epic: 0.024, mythic: 0.005, legendary: 0.001 };
  const dev = {};
  for (const r of RARITY_ORDER) dev[r] = (c[r] / (N * expect[r]) - 1) * 100;
  const report = RARITY_ORDER.map((r) => `${r} ${c[r]} (${dev[r] >= 0 ? '+' : ''}${dev[r].toFixed(1)}%)`).join(', ');
  console.log(`  tier 1, ${N} rolls: ${report}`);

  for (const r of ['common', 'uncommon', 'rare', 'epic']) {
    check(`${r} is within 10% of its weight over ${N} rolls`, Math.abs(dev[r]) <= 10, `${dev[r].toFixed(2)}%`);
  }
  for (const r of ['mythic', 'legendary']) {
    const p = expect[r], mu = N * p, sd = Math.sqrt(N * p * (1 - p));
    check(`${r} is within four sigma over ${N} rolls`, Math.abs(c[r] - mu) <= 4 * sd,
      `${c[r]} against ${mu} expected, sigma ${sd.toFixed(1)}, ${((c[r] - mu) / sd).toFixed(2)} sigma out`);
  }

  const M = 2000000;
  const big = tally(1, 0, 11, M);
  const bigDev = {};
  for (const r of RARITY_ORDER) bigDev[r] = (big[r] / (M * expect[r]) - 1) * 100;
  console.log(`  tier 1, ${M} rolls: ${RARITY_ORDER.map((r) => `${r} ${big[r]} (${bigDev[r] >= 0 ? '+' : ''}${bigDev[r].toFixed(2)}%)`).join(', ')}`);
  check(`every rarity is within 10% of the table over ${M} rolls`,
    RARITY_ORDER.every((r) => Math.abs(bigDev[r]) <= 10),
    `worst row ${RARITY_ORDER.reduce((a, b) => (Math.abs(bigDev[b]) > Math.abs(bigDev[a]) ? b : a))} at ${Math.max(...RARITY_ORDER.map((r) => Math.abs(bigDev[r]))).toFixed(2)}%`);

  // And the shift, measured.
  const N2 = 200000;
  const t1 = tally(1, 0, 5, N2), t3 = tally(3, 0, 5, N2), t5 = tally(5, 0, 5, N2);
  const aboveRare = (c2) => (c2.rare + c2.epic + c2.mythic + c2.legendary) / N2;
  console.log(`  blue or better: tier 1 ${(aboveRare(t1) * 100).toFixed(2)}%, tier 3 ${(aboveRare(t3) * 100).toFixed(2)}%, tier 5 ${(aboveRare(t5) * 100).toFixed(2)}%`);
  check('a tier 3 monster never drops a white', t3.common === 0, `${t3.common} whites in ${N2}`);
  check('a tier 3 monster drops green about 70% of the time', Math.abs(t3.uncommon / N2 - 0.70) < 0.01, `${(t3.uncommon / N2 * 100).toFixed(2)}%`);
  check('a tier 5 monster never drops a white or a green', t5.common === 0 && t5.uncommon === 0, `${t5.common} whites, ${t5.uncommon} greens`);
  check('a tier 5 monster drops blue about 70% of the time', Math.abs(t5.rare / N2 - 0.70) < 0.01, `${(t5.rare / N2 * 100).toFixed(2)}%`);
  check('blue or better climbs with tier', aboveRare(t1) < aboveRare(t3) && aboveRare(t3) < aboveRare(t5));
  check('tier 2 and tier 3 share a shift, tier 4 and tier 5 share a shift',
    weightsFor(2, 0).join() === weightsFor(3, 0).join() && weightsFor(4, 0).join() === weightsFor(5, 0).join());
}

// --------------------------------------------------------------------- luck
{
  const N = 200000;
  const none = tally(1, 0, 31, N), lucky = tally(1, 40, 31, N);
  const above = (c) => (N - c.common) / N;
  const predicted = (30 * 1.2) / (70 + 30 * 1.2);
  console.log(`  above common: luck 0 ${(above(none) * 100).toFixed(2)}%, luck 40 ${(above(lucky) * 100).toFixed(2)}%, predicted ${(predicted * 100).toFixed(2)}%`);
  check('Luck raises the chance of anything above common', above(lucky) > above(none));
  check('and by the amount the weights predict', Math.abs(above(lucky) - predicted) < 0.005,
    `${(above(lucky) * 100).toFixed(2)}% against ${(predicted * 100).toFixed(2)}%`);
  check('Luck does not change the ordering', RARITY_ORDER.slice(1).every((r, i) => lucky[r] <= lucky[RARITY_ORDER[i]]));
  check('zero and negative Luck are the same table', weightsFor(1, 0).join() === weightsFor(1, -50).join());
}

// --------------------------------------------------------------------- gold
{
  for (const [tier, [lo, hi]] of Object.entries(GOLD)) {
    const rng = seededRng(4242);
    let min = Infinity, max = -Infinity, sum = 0, n = 20000;
    for (let i = 0; i < n; i++) { const g = rollGold(tier, rng); min = Math.min(min, g); max = Math.max(max, g); sum += g; }
    const mid = (lo + hi) / 2;
    const ok = min >= lo && max <= hi && (hi === lo || (min <= lo + (hi - lo) * 0.02 && max >= hi - (hi - lo) * 0.02));
    check(`tier ${tier} gold stays inside ${lo} to ${hi} and fills it`, ok, `saw ${min} to ${max}, mean ${(sum / n).toFixed(1)} against ${mid}`);
    check(`tier ${tier} gold averages near the middle of its range`, hi === lo || Math.abs(sum / n - mid) < (hi - lo) * 0.02);
  }
  check('critters carry no gold', rollGold(0, seededRng(1)) === 0);
  check('a tier that is not on the table pays nothing', rollGold(9, seededRng(1)) === 0);
  check('gold is deterministic from its stream',
    rollGold(3, seededRng(88)) === rollGold(3, seededRng(88)) && rollGold(3, seededRng(88)) !== rollGold(3, seededRng(89)));
}

// ------------------------------------------------------------------- drops
{
  const a = rollDrop({ table: TABLE, tier: 3, luck: 0, seed: 777 });
  const b = rollDrop({ table: TABLE, tier: 3, luck: 0, seed: 777 });
  check('the same seed drops the same item', JSON.stringify(a) === JSON.stringify(b), `${a.base} ${a.rarity}`);
  let differ = 0;
  for (let s = 0; s < 1000; s++) {
    if (JSON.stringify(rollDrop({ table: TABLE, tier: 3, seed: s })) !== JSON.stringify(rollDrop({ table: TABLE, tier: 3, seed: s + 500000 }))) differ++;
  }
  check('a different seed drops something else', differ >= 950, `${differ} of 1000 pairs differ`);

  check('a drop above common arrives unidentified with no affixes', (() => {
    let un = 0, none = 0, n = 0;
    for (let s = 0; s < 3000; s++) {
      const it = rollDrop({ table: TABLE, tier: 5, seed: s });
      if (it.rarity !== 'common') { n++; if (!it.identified) un++; if (it.affixes.length === 0) none++; }
    }
    return n > 0 && un === n && none === n;
  })());
  check('a common drop arrives identified', (() => {
    for (let s = 0; s < 3000; s++) {
      const it = rollDrop({ table: TABLE, tier: 1, seed: s });
      if (it.rarity === 'common' && it.identified !== true) return false;
    }
    return true;
  })());
  check('every dropped base is a real base', (() => {
    for (let s = 0; s < 3000; s++) if (!baseFor(rollDrop({ table: TABLE, tier: 4, seed: s }).base)) return false;
    return true;
  })());
  check('the whole table gets used', (() => {
    const seen = new Set();
    for (let s = 0; s < 3000; s++) seen.add(rollDrop({ table: TABLE, tier: 2, seed: s }).base);
    return seen.size === TABLE.length;
  })(), TABLE.join(' '));

  // The null cases, one at a time.
  check('no table, no drop', rollDrop({ tier: 3, seed: 1 }) === null);
  check('an empty table, no drop', rollDrop({ table: [], tier: 3, seed: 1 }) === null);
  check('a critter drops nothing here', rollDrop({ table: TABLE, tier: 0, seed: 1 }) === null);
  check('a table with a chance can come up empty', (() => {
    let nulls = 0, items = 0;
    for (let s = 0; s < 2000; s++) (rollDrop({ table: { bases: TABLE, chance: 0.25 }, tier: 3, seed: s }) ? items++ : nulls++);
    return nulls > 1300 && items > 400;
  })(), (() => {
    let nulls = 0;
    for (let s = 0; s < 2000; s++) if (!rollDrop({ table: { bases: TABLE, chance: 0.25 }, tier: 3, seed: s })) nulls++;
    return `${2000 - nulls} of 2000 dropped at chance 0.25`;
  })());
  check('a chance of 1 always drops', (() => {
    for (let s = 0; s < 500; s++) if (!rollDrop({ table: { bases: TABLE, chance: 1 }, tier: 3, seed: s })) return false;
    return true;
  })());
  check('a table naming a base that does not exist throws', threw(() => rollDrop({ table: ['moonsword'], tier: 3, seed: 1 })));

  // The drop carries a seed the affix roller can read.
  const it = rollDrop({ table: ['longsword'], tier: 5, luck: 0, seed: 314159 });
  check('a dropped item identifies into the affixes its seed always meant',
    JSON.stringify(rollAffixes(it)) === JSON.stringify(identify(it, 99).affixes), `${it.rarity} ${it.base}, ${rollAffixes(it).length} affixes`);
}

// -------------------------------------------------------------------- boss
{
  const idx = (x) => (x ? RARITY_ORDER.indexOf(x.rarity) : -1);
  let atLeast = 0, strictly = 0, n = 2000;
  for (let s = 0; s < n; s++) {
    const one = rollDrop({ table: TABLE, tier: 5, seed: s });
    const two = bossRoll({ table: TABLE, tier: 5, seed: s });
    if (idx(two) >= idx(one)) atLeast++;
    if (idx(two) > idx(one)) strictly++;
  }
  check('two rolls are never worse than one', atLeast === n, `${atLeast} of ${n}`);
  check('and are sometimes better', strictly > 0, `${strictly} of ${n} improved`);

  let floored = 0;
  for (let s = 0; s < 2000; s++) {
    const it = bossRoll({ table: TABLE, tier: 5, seed: s, floor: 'epic' });
    if (it && RARITY_ORDER.indexOf(it.rarity) >= RARITY_ORDER.indexOf('epic')) floored++;
  }
  check('a boss always leaves a purple or better', floored === 2000, `${floored} of 2000`);
  check('the floor does not push a mythic back down to epic', (() => {
    for (let s = 0; s < 4000; s++) {
      const plain = bossRoll({ table: TABLE, tier: 5, seed: s });
      const withFloor = bossRoll({ table: TABLE, tier: 5, seed: s, floor: 'epic' });
      if (RARITY_ORDER.indexOf(plain.rarity) > RARITY_ORDER.indexOf('epic') && plain.rarity !== withFloor.rarity) return false;
    }
    return true;
  })());
  check('a floor that is not a rarity throws', threw(() => bossRoll({ table: TABLE, tier: 5, seed: 1, floor: 'shiny' })));
  check('a boss with nothing to drop drops nothing', bossRoll({ table: [], tier: 5, seed: 1 }) === null);
  check('bossRoll is deterministic',
    JSON.stringify(bossRoll({ table: TABLE, tier: 5, seed: 9 })) === JSON.stringify(bossRoll({ table: TABLE, tier: 5, seed: 9 })));

  check('better keeps the higher rarity and copes with nulls', (() => {
    const lo = { rarity: 'rare' }, hi = { rarity: 'mythic' };
    return better(lo, hi) === hi && better(hi, lo) === hi && better(null, lo) === lo && better(lo, null) === lo && better(null, null) === null;
  })());
}

// -------------------------------------------------------------- a whole kill
{
  const kill = rollKill({ table: TABLE, tier: 3, seed: 55 });
  check('a kill gives gold in the tier range and an item',
    kill.gold >= GOLD[3][0] && kill.gold <= GOLD[3][1] && !!kill.item, `${kill.gold} gold, ${kill.item.rarity} ${kill.item.base}`);
  const bossKill = rollKill({ table: TABLE, tier: 5, seed: 55, boss: true });
  check('a boss kill pays boss gold and leaves a purple or better',
    bossKill.gold >= 800 && bossKill.gold <= 3000 && RARITY_ORDER.indexOf(bossKill.item.rarity) >= RARITY_ORDER.indexOf('epic'),
    `${bossKill.gold} gold, ${bossKill.item.rarity}`);
  const critter = rollKill({ table: TABLE, tier: 0, seed: 55 });
  check('a critter kill pays nothing and leaves nothing', critter.gold === 0 && critter.item === null);
  let twiceBetter = 0;
  for (let s = 0; s < 1000; s++) {
    const once = rollKill({ table: TABLE, tier: 5, seed: s });
    const champion = rollKill({ table: TABLE, tier: 5, seed: s, twice: true });
    if (RARITY_ORDER.indexOf(champion.item.rarity) >= RARITY_ORDER.indexOf(once.item.rarity)) twiceBetter++;
  }
  check('a champion rolling twice is never worse off', twiceBetter === 1000, `${twiceBetter} of 1000`);
}

// ------------------------------------------------------------------- audit
{
  check('the loot tables audit clean', auditLoot() === true);
  const g = GOLD[3];
  GOLD[3] = [80, 30];
  check('a gold range that runs backwards throws', threw(auditLoot));
  GOLD[3] = g;
  const w = RARITY.epic.weight;
  RARITY.epic.weight = 5;
  check('a weight column that no longer sums to 100 throws', threw(auditLoot));
  RARITY.epic.weight = w;
  check('everything is whole again', auditLoot() === true);
}

// --------------------------------------------------- rarity is for gear only
//
// A food table and a mixed table, driven ten thousand times each, and the boss
// floor driven against both. Measured, not asserted.
{
  const FOOD = ['carrot', 'bread', 'venison', 'wolf_meat', 'fish'];
  const MIXED = ['longsword', 'carrot', 'reagent', 'plate_chest', 'venison', 'ingot'];
  const N = 10000;

  let above = 0, affixed = 0, unidentified = 0;
  const drops = [];
  for (let s = 0; s < N; s++) {
    // tier 5 shifts the table so far that a common is impossible for gear,
    // which is the hardest case for the rule: the roll WANTS to be blue.
    const it = rollDrop({ table: FOOD, tier: 5, luck: 40, seed: s });
    drops.push(it);
    if (it.rarity !== 'common') above++;
    if (it.affixes.length) affixed++;
    if (it.identified === false) unidentified++;
  }
  check(`${N} tier 5 drops from a table of nothing but food: none above common`, above === 0, `${above}`);
  check('none carrying an affix', affixed === 0, `${affixed}`);
  check('and none arriving unidentified, because there is nothing to find out', unidentified === 0, `${unidentified}`);
  check('items.js agrees when handed all ten thousand', auditItems(drops) === true);

  let mixedFoodAbove = 0, mixedGearAbove = 0, food = 0, gear = 0;
  for (let s = 0; s < N; s++) {
    const it = rollDrop({ table: MIXED, tier: 5, luck: 40, seed: s + 1000000 });
    if (takesRarity(it)) { gear++; if (it.rarity !== 'common') mixedGearAbove++; }
    else { food++; if (it.rarity !== 'common') mixedFoodAbove++; }
  }
  check(`a mixed table drew ${gear} gear and ${food} food or material from the same rolls`, gear > 1000 && food > 1000);
  check('every one of the gear drops is above common at tier 5', mixedGearAbove === gear, `${mixedGearAbove} of ${gear}`);
  check('and not one of the food or material drops is', mixedFoodAbove === 0, `${mixedFoodAbove} of ${food}`);

  // The boss floor is the one place a rarity is written onto an item after the
  // fact, so it gets its own both-ways check.
  let floored = 0, foodFloored = 0;
  for (let s = 0; s < 2000; s++) {
    const f = bossRoll({ table: FOOD, tier: 5, seed: s, floor: 'epic' });
    if (f && f.rarity !== 'common') foodFloored++;
    const g = bossRoll({ table: ['longsword'], tier: 5, seed: s, floor: 'epic' });
    if (g && RARITY_ORDER.indexOf(g.rarity) >= RARITY_ORDER.indexOf('epic')) floored++;
  }
  check('a purple floor lifts every longsword to epic or better', floored === 2000, `${floored} of 2000`);
  check('and lifts no haunch of venison at all', foodFloored === 0, `${foodFloored} of 2000`);
  check('every meat items.js knows can be rolled without throwing',
    MEAT_BASES.every((b) => rollDrop({ table: [b], tier: 3, seed: 1 }).base === b));
}

// -------------------------------------------------------------------- cost
{
  const t0 = performance.now();
  for (let s = 0; s < 50000; s++) rollDrop({ table: TABLE, tier: 4, seed: s });
  const ms = (performance.now() - t0) / 50000;
  check('a drop rolls in well under a millisecond', ms < 0.5, `${(ms * 1000).toFixed(1)} microseconds`);
}

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
