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
  classProfile, classProfileDetail, topSkills, strengthOf, armourTiersFor, asProfile,
  PROFILE_SKILLS, PROFILE_TOP, MAGIC_SKILLS, ROBE_SKILLS, CLASS_BIAS, BOSS_BIAS, AMMO_FOR, kitDraw, KIT_SHARES,
  SIGNATURES, SIGNATURE_BY_ID, UNIQUE_CHANCE, signatureFor, makeUnique, rollUnique,
  auditSignatures, GEAR_DROP_SCALE } from './loot.js';
import {
  RARITY, RARITY_ORDER, baseFor, takesRarity, auditItems, MEAT_BASES, BASES, ARMOR_TIERS,
} from './items.js';
import { rollAffixes, identify, POWER_BY_ID, allowedOn } from './affixes.js';
import { OPENINGS, OPENINGS_BY_ID } from './openings.js';
import { MONSTERS, MONSTER_LIST, BOSSES } from './monsters.js';
import { REALMS } from './realms.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };
const threw = (fn) => { try { fn(); return false; } catch { return true; } };
const TABLE = ['longsword', 'shortsword', 'buckler', 'chain_outfit', 'ring'];

const tally = (tier, luck, seed, n) => {
  const rng = seededRng(seed);
  const c = Object.fromEntries(RARITY_ORDER.map((r) => [r, 0]));
  for (let i = 0; i < n; i++) c[rollRarity(tier, luck, rng)]++;
  return c;
};

// ------------------------------------------------------------- the weights
{
  check('the base weights are the printed column', BASE_WEIGHTS.join(' ') === '76.75 17 5 0.8 0.4 0.05', BASE_WEIGHTS.join(' '));
  check('the shift is one row per two tiers',
    [0, 1, 2, 3, 4, 5].map(shiftFor).join('') === '001122', [0, 1, 2, 3, 4, 5].map((t) => `t${t}:${shiftFor(t)}`).join(' '));
  check('tier 1 is the printed table exactly', weightsFor(1, 0).join(' ') === '76.75 17 5 0.8 0.4 0.05');
  check('no probability is lost at any tier',
    [0, 1, 2, 3, 4, 5].every((t) => Math.abs(weightsFor(t, 0).reduce((s, x) => s + x, 0) - 100) < 1e-9),
    [0, 1, 2, 3, 4, 5].map((t) => weightsFor(t, 0).reduce((s, x) => s + x, 0).toFixed(1)).join(' '));
  check('tier 3 drops no whites and hands the white share to green', weightsFor(3, 0)[0] === 0 && weightsFor(3, 0)[1] === 76.75, weightsFor(3, 0).join(' '));
  check('tier 5 starts at blue', weightsFor(5, 0)[0] === 0 && weightsFor(5, 0)[1] === 0 && weightsFor(5, 0)[2] === 76.75, weightsFor(5, 0).join(' '));
  check('Luck lifts every row above common and leaves common alone', (() => {
    const w0 = weightsFor(1, 0), w40 = weightsFor(1, 40);
    return w0[0] === w40[0] && w40.slice(1).every((x, i) => Math.abs(x - w0[i + 1] * 1.2) < 1e-9);
  })(), `luck 40 multiplies the above-common weights by ${(1 + 40 * 0.005).toFixed(2)}`);
}

// -------------------------------------------------- the measured distribution
{
  const N = 100000;
  const c = tally(1, 0, 20260904, N);
  const expect = { common: 0.7675, uncommon: 0.17, rare: 0.05, epic: 0.008, mythic: 0.004, legendary: 0.0005 };
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
  check('a tier 3 monster drops green about 77% of the time', Math.abs(t3.uncommon / N2 - 0.7675) < 0.01, `${(t3.uncommon / N2 * 100).toFixed(2)}%`);
  check('a tier 5 monster never drops a white or a green', t5.common === 0 && t5.uncommon === 0, `${t5.common} whites, ${t5.uncommon} greens`);
  check('a tier 5 monster drops blue about 77% of the time', Math.abs(t5.rare / N2 - 0.7675) < 0.01, `${(t5.rare / N2 * 100).toFixed(2)}%`);
  check('blue or better climbs with tier', aboveRare(t1) < aboveRare(t3) && aboveRare(t3) < aboveRare(t5));
  check('tier 2 and tier 3 share a shift, tier 4 and tier 5 share a shift',
    weightsFor(2, 0).join() === weightsFor(3, 0).join() && weightsFor(4, 0).join() === weightsFor(5, 0).join());
}

// --------------------------------------------------------------------- luck
{
  const N = 200000;
  const none = tally(1, 0, 31, N), lucky = tally(1, 40, 31, N);
  const above = (c) => (N - c.common) / N;
  const predicted = (23.25 * 1.2) / (76.75 + 23.25 * 1.2);
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
    // An ordinary kill may lose the gear coin (GEAR_DROP_SCALE); a champion never does.
    if (!once.item) { if (champion.item) twiceBetter++; continue; }
    if (RARITY_ORDER.indexOf(champion.item.rarity) >= RARITY_ORDER.indexOf(once.item.rarity)) twiceBetter++;
  }
  check('a champion rolling twice is never worse off', twiceBetter === 1000, `${twiceBetter} of 1000`);
  // The gear coin, measured: about a quarter of ordinary kills leave gold only.
  {
    let dropped = 0, coined = 0;
    for (let s = 0; s < 4000; s++) {
      const k = rollKill({ table: TABLE, tier: 3, seed: s });
      if (k.item) dropped++;
      if (k.bias.gearCoin === 'none') coined++;
    }
    check(`about ${Math.round(GEAR_DROP_SCALE * 100)}% of ordinary kills drop gear (GEAR_DROP_SCALE)`,
      Math.abs(dropped / 4000 - GEAR_DROP_SCALE) < 0.03, `${dropped} of 4000, ${coined} lost the coin`);
    check('every kill that lost the coin says so in the record', coined === 4000 - dropped, `${coined} against ${4000 - dropped}`);
    let bossDrops = 0;
    for (let s = 0; s < 400; s++) if (rollKill({ table: TABLE, tier: 3, seed: s, boss: true }).item) bossDrops++;
    check('a boss never loses the coin', bossDrops === 400, `${bossDrops} of 400`);
  }
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
  const MIXED = ['longsword', 'carrot', 'reagent', 'plate_outfit', 'venison', 'ingot'];
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

// ===========================================================================
// L1: THE CLASS PROFILE
// ===========================================================================
//
// A class is a skill sheet, not the button pressed at creation, so every check
// below is driven off skills and STR. The openings are used as ready made
// sheets because they are the ones a player actually starts on.
{
  console.log('\n  -- the profile is read off the skills, never off the opening id --');
  const warrior = OPENINGS_BY_ID.warrior;
  const mage = OPENINGS_BY_ID.mage;

  check('PROFILE_SKILLS is every combat skill, every magic skill and Musicianship',
    PROFILE_SKILLS.length === 11 + MAGIC_SKILLS.length + 1 && PROFILE_SKILLS.includes('musicianship'),
    `${PROFILE_SKILLS.length} skills decide a profile`);
  check('and every one of them is a real skill id', PROFILE_SKILLS.every((id) => typeof id === 'string'));

  const wTop = topSkills(warrior);
  check('the warrior\'s top three are Swordsmanship, Tactics and Parrying',
    wTop.map((e) => e.id).join(',') === 'swordsmanship,tactics,parrying', wTop.map((e) => `${e.id} ${e.value}`).join(', '));
  check('a tie breaks on the skill table\'s own order, so it breaks the same way twice',
    topSkills(warrior).map((e) => e.id).join() === topSkills(warrior).map((e) => e.id).join()
    && wTop[0].id === 'swordsmanship' && wTop[0].value === wTop[1].value,
    `${wTop[0].id} and ${wTop[1].id} are both ${wTop[0].value}`);
  check('only three count', wTop.length === PROFILE_TOP);

  // THE WARRIOR WHO CAST FOR A YEAR. The one sentence the brief turns on.
  const turned = { stats: { ...warrior.stats }, skills: { ...warrior.skills, magery: 95, meditation: 90, evaluatingIntelligence: 88 } };
  const tProf = classProfileDetail(turned);
  check('a warrior who casts for a year is a mage: their top three are the magic ones',
    tProf.skills.join(',') === 'magery,meditation,evaluatingIntelligence', tProf.skills.join(', '));
  check('and the opening id is still "warrior", which nothing here read',
    turned.opening === undefined && tProf.tiers.join(',') === 'cloth,leather', tProf.tiers.join(','));
  check('so they are handed a staff and no longer a greatsword',
    tProf.bases.has('staff') && !tProf.bases.has('greatsword'));

  // ARMOUR, both directions.
  const wProf = classProfileDetail(warrior);
  check('a STR 65 warrior favours the heaviest three tiers they can wear',
    wProf.tiers.join(',') === 'studded,ring,chain', wProf.tiers.join(','));
  const plated = { stats: { str: 75 }, skills: { swordsmanship: 50 } };
  check('and a plate wearer favours ring, chain and plate, which is the document\'s own line',
    classProfileDetail(plated).tiers.join(',') === 'ring,chain,plate');
  check('a mage profile never favours plate', !classProfile(mage).has('plate_outfit') && !classProfile(mage).has('plate_outfit'));
  check('nor ring, chain or studded: a caster is in cloth and leather',
    classProfileDetail(mage).tiers.join(',') === 'cloth,leather', classProfileDetail(mage).tiers.join(','));
  check('a caster with 100 STR is still in cloth and leather, because it is Meditation that decides',
    classProfileDetail({ stats: { str: 100 }, skills: { magery: 90 } }).tiers.join(',') === 'cloth,leather');
  check('every magic skill but Chivalry robes you', ROBE_SKILLS.length === MAGIC_SKILLS.length - 1 && !ROBE_SKILLS.includes('chivalry'));
  check('and Chivalry does not, because 01-STATS-SKILLS says it works in plate',
    classProfileDetail({ stats: { str: 80 }, skills: { chivalry: 90 } }).tiers.join(',') === 'ring,chain,plate');
  check('a character with no strength at all still has something to wear',
    armourTiersFor(null, 0).join(',') === 'cloth', armourTiersFor(null, 0).join(','));

  // WEAPONS, gated by STR because canEquip REFUSES one above it.
  check('the warrior is offered every Swordsmanship weapon their STR allows',
    wProf.weapons.join(',') === 'shortsword,longsword,greatsword,axe,battleaxe', wProf.weapons.join(','));
  const weak = classProfileDetail({ stats: { str: 20 }, skills: { swordsmanship: 60 } });
  check('a STR 20 swordsman is offered the shortsword and not the greatsword',
    weak.weapons.includes('shortsword') && !weak.weapons.includes('greatsword') && !weak.weapons.includes('longsword'),
    weak.weapons.join(','));
  check('which is the same answer items.canEquip gives, so the bias never drops a thing you cannot hold',
    weak.weapons.every((id) => BASES[id].strReq <= 20)
    && !weak.weapons.some((id) => BASES[id].strReq > 20));
  check('fists are never in a profile: there is no slot to put them in', !classProfile(warrior).has('fists'));

  // FOCI, SHIELDS, INSTRUMENTS, JEWELLERY.
  check('a caster is offered a wand and a staff', ['wand', 'staff', 'bone_staff'].every((id) => classProfile(mage).has(id)));
  check('and a pure swordsman is not', !classProfile({ stats: { str: 60 }, skills: { swordsmanship: 60 } }).has('wand'));
  check('Parrying in the top three buys shields', wProf.shields.join(',') === 'buckler,kite,heater,tower', wProf.shields.join(','));
  check('and a STR 40 parrier is not offered the tower shield it could not lift',
    classProfileDetail({ stats: { str: 40 }, skills: { parrying: 60 } }).shields.join(',') === 'buckler,kite,heater');
  check('and no Parrying, no shields', classProfileDetail({ stats: { str: 60 }, skills: { swordsmanship: 60 } }).shields.length === 0);
  // the Bard opening went with the four class cut (2026-09-08); the rule is the skill's, not the class's
  check('Musicianship in the top three buys a lute', classProfile({ stats: { str: 40 }, skills: { musicianship: 60, provocation: 40 } }).has('lute'));
  check('and nobody else gets one', !classProfile(warrior).has('lute') && !classProfile(mage).has('lute'));
  check('a ring and an amulet fit everybody',
    OPENINGS.every((o) => classProfile(o).has('ring') && classProfile(o).has('amulet')));

  // Every opening answers, and nothing in any answer is a bad base.
  for (const o of OPENINGS) {
    const d = classProfileDetail(o);
    check(`${o.name}: ${d.bases.size} bases, all real gear their STR allows`,
      d.bases.size > 0 && [...d.bases].every((id) => BASES[id] && (takesRarity(id) || Object.values(AMMO_FOR).includes(id)) && (BASES[id].strReq || 0) <= d.str),
      `top ${d.top.map((e) => e.id).join(', ') || 'nothing trained yet'} | ${d.tiers.join(',')}`);
  }
  check('a character who has trained nothing still has jewellery and armour and no weapon',
    (() => {
      const d = classProfileDetail(OPENINGS_BY_ID.blank);
      return d.top.length === 0 && d.weapons.length === 0 && d.jewellery.length === 2 && d.armour.length > 0;
    })());
  check('and an empty object does not throw', classProfile({}).size > 0 && classProfile(null).size > 0);
  check('STR is read from stats.str, stats.STR or the bare field',
    strengthOf({ stats: { str: 41 } }) === 41 && strengthOf({ stats: { STR: 42 } }) === 42 && strengthOf({ str: 43 }) === 43 && strengthOf(null) === 0);
  check('asProfile takes a Set, a list, a character or nothing',
    asProfile(new Set(['ring'])).has('ring') && asProfile(['ring']).has('ring')
    && asProfile(OPENINGS_BY_ID.warrior).has('longsword') && asProfile(null) === null && asProfile([]) === null);
}

// ===========================================================================
// L1: THE 60/40, MEASURED
// ===========================================================================
{
  console.log('\n  -- the 60/40, measured against real monster tables --');
  const warrior = OPENINGS_BY_ID.warrior;
  const wp = classProfile(warrior);
  const N = 10000;

  // A swordsman against a bandit. The bandit's table is dagger, rapier, a pair
  // of leather boots and a ring, and the only one of those a STR 65 swordsman
  // in studded, ring or chain has any use for is the ring.
  const BANDIT = ['dagger', 'rapier', 'leather_outfit', 'ring'];
  const run = (table, tier, profile, bias = undefined) => {
    let gear = 0, plain = 0, inProfile = 0, biased = 0, fellBack = 0;
    const bases = {};
    for (let s = 0; s < N; s++) {
      const rec = {};
      const it = rollDrop({ table, tier, seed: s, profile, bias, record: rec });
      bases[it.base] = (bases[it.base] || 0) + 1;
      if (takesRarity(it)) {
        gear++;
        if (profile && profile.has(it.base)) inProfile++;
        if (rec.biased) biased++;
        if (rec.fellBack) fellBack++;
      } else plain++;
    }
    return { gear, plain, inProfile, biased, fellBack, bases };
  };

  const b = run(BANDIT, 2, wp);
  const favoured = BANDIT.filter((x) => takesRarity(x) && wp.has(x));
  const gearInTable = BANDIT.filter(takesRarity).length;
  const predicted = CLASS_BIAS + (1 - CLASS_BIAS) * (favoured.length / gearInTable);
  console.log(`  ${N} rolls, swordsman against a bandit (${BANDIT.join(', ')}); of those he uses: ${favoured.join(', ')}`);
  console.log(`    coin biased ${(b.biased / b.gear * 100).toFixed(2)}%, drew in profile ${(b.inProfile / b.gear * 100).toFixed(2)}%, predicted ${(predicted * 100).toFixed(2)}%`);
  check('sixty percent of the gear rolls are drawn from the class shelf',
    b.biased / b.gear >= 0.58 && b.biased / b.gear <= 0.62, `${(b.biased / b.gear * 100).toFixed(2)}%`);
  // The other forty are drawn from the WHOLE table and not from its complement,
  // exactly as the brief says, so the share that lands in the profile is
  // 0.6 + 0.4 * (the profile's share of the table) and not a flat 0.6. Stated
  // as an arithmetic prediction rather than a band, because it is arithmetic.
  check('and the share that lands in the profile is that plus the open forty\'s own share of it',
    Math.abs(b.inProfile / b.gear - predicted) < 0.015,
    `${(b.inProfile / b.gear * 100).toFixed(2)}% against ${(predicted * 100).toFixed(2)}% predicted`);
  check('the bias never invents a base the bandit does not carry',
    Object.keys(b.bases).every((id) => BANDIT.includes(id)), Object.keys(b.bases).join(', '));

  // MATERIALS ARE UNTOUCHED. The orc's table is an axe, a battleaxe, a studded
  // breastplate and a bar of iron, and the warrior wants all three pieces of
  // gear, which is the hardest case for the claim: the coin comes up biased
  // 60% of the time and the iron still has to come out at the same rate.
  const ORC = ['axe', 'battleaxe', 'studded_outfit', 'iron_ingot'];
  const withP = run(ORC, 3, wp);
  const without = run(ORC, 3, null);
  console.log(`  ${N} rolls against an orc (${ORC.join(', ')}): iron ingots ${without.bases.iron_ingot} without a profile, ${withP.bases.iron_ingot} with one`);
  check('a profile changes the number of iron ingots by exactly nothing',
    withP.bases.iron_ingot === without.bases.iron_ingot && withP.plain === without.plain,
    `${withP.plain} materials either way`);
  check('and every gear roll off the orc is something the warrior uses, since he uses all three',
    withP.inProfile === withP.gear, `${withP.inProfile} of ${withP.gear}`);

  // THE EMPTY INTERSECTION. A cyclops carries a maul and a gem. A swordsman
  // uses neither, so the coin comes up biased 60% of the time and there is
  // nothing to draw; the whole table decides and the record says so.
  const CYCLOPS = ['maul', 'gem'];
  const fell = run(CYCLOPS, 5, wp);
  const plainCyclops = run(CYCLOPS, 5, null);
  console.log(`  ${N} rolls against a cyclops: ${fell.fellBack} of ${fell.gear} gear rolls fell back to the whole table`);
  check('the fallback fires when nothing on the table suits the class',
    fell.fellBack > 0 && Math.abs(fell.fellBack / fell.gear - CLASS_BIAS) < 0.02,
    `${(fell.fellBack / fell.gear * 100).toFixed(2)}% of gear rolls, against the ${CLASS_BIAS * 100}% the coin comes up biased`);
  const fellRecord = (() => {
    for (let s = 0; s < 400; s++) {
      const rec = {};
      rollDrop({ table: CYCLOPS, tier: 5, seed: s, profile: wp, record: rec });
      if (rec.fellBack) return rec;
    }
    return null;
  })();
  check('and the fallback is recorded in words rather than being silent',
    !!fellRecord && fellRecord.from === 'table' && fellRecord.favoured.length === 0
    && /nothing this one carries suits you/.test(fellRecord.reason),
    fellRecord && fellRecord.reason);
  check('and the roll it falls back to is the roll it always was',
    JSON.stringify(fell.bases) === JSON.stringify(plainCyclops.bases),
    `${JSON.stringify(fell.bases)}`);

  // The record, in the three other states it can be in.
  check('the record says so when there is no profile at all', (() => {
    const rec = {};
    rollDrop({ table: ORC, tier: 3, seed: 1, record: rec });
    return rec.profiled === false && rec.biased === false && /no profile/.test(rec.reason);
  })());
  check('and when the draw was a material, which the class has no opinion about', (() => {
    for (let s = 0; s < 400; s++) {
      const rec = {};
      const it = rollDrop({ table: ORC, tier: 3, seed: s, profile: wp, record: rec });
      if (!takesRarity(it)) return rec.gear === false && /no opinion/.test(rec.reason);
    }
    return false;
  })());
  check('and when the open four in ten decided', (() => {
    for (let s = 0; s < 400; s++) {
      const rec = {};
      rollDrop({ table: BANDIT, tier: 2, seed: s, profile: wp, record: rec });
      if (rec.gear && !rec.biased) return rec.from === 'table' && /open four in ten/.test(rec.reason);
    }
    return false;
  })());

  // The other direction: a mage against the same tables.
  const mp = classProfile(OPENINGS_BY_ID.mage);
  const mageOrc = run(ORC, 3, mp);
  check('a mage against an orc favours nothing it carries and falls back every biased roll',
    mageOrc.inProfile === 0 && Math.abs(mageOrc.fellBack / mageOrc.gear - CLASS_BIAS) < 0.02,
    `${mageOrc.inProfile} in profile, ${mageOrc.fellBack} of ${mageOrc.gear} fell back`);
  const CULTIST = ['cloth_outfit', 'quarterstaff', 'reagent'];
  const mageCultist = run(CULTIST, 3, mp);
  const cultistFav = CULTIST.filter((x) => takesRarity(x) && mp.has(x));
  const cultistGear = CULTIST.filter(takesRarity).length;
  console.log(`  ${N} rolls, mage against a cultist: robes ${mageCultist.bases.cloth_outfit}, quarterstaves ${mageCultist.bases.quarterstaff}, reagents ${mageCultist.bases.reagent}`);
  check('and against a cultist takes the robe over the quarterstaff at the rate the coin says',
    Math.abs(mageCultist.inProfile / mageCultist.gear - (CLASS_BIAS + (1 - CLASS_BIAS) * cultistFav.length / cultistGear)) < 0.015,
    `${(mageCultist.inProfile / mageCultist.gear * 100).toFixed(2)}%`);

  // A different bias number is honoured, in both directions.
  const eighty = run(BANDIT, 2, wp, BOSS_BIAS);
  check('the boss bias of eighty in a hundred is honoured where it is asked for',
    Math.abs(eighty.biased / eighty.gear - BOSS_BIAS) < 0.02, `${(eighty.biased / eighty.gear * 100).toFixed(2)}%`);
  const never = run(BANDIT, 2, wp, 0);
  check('and a bias of zero never draws from the shelf, which is the gate driven false',
    never.biased === 0 && JSON.stringify(never.bases) === JSON.stringify(run(BANDIT, 2, null).bases));
}

// ===========================================================================
// L1: WITHOUT A PROFILE, BIT FOR BIT
// ===========================================================================
//
// The digests below were taken from `git show HEAD:src/mmo/loot.js` before a
// line of the bias was written, over 24,000 drops and 3,000 kills. They are the
// whole of the promise that an existing save, an existing seed and every other
// suite in this repo still get the sword they always got.
//
// THEY MOVED ONCE, ON 2026-09-06, WHEN `noise.hash2` WAS CORRECTED, and the
// numbers below are what they moved to.
//
// `hash2` multiplied all three of its terms in a double, and a double stops
// holding every integer past 2^53: `x * 374761393` overflows for any x over
// about 24 million. Nothing here hands it one directly, and every seed in this
// file is under a thousand. What it hands back is the trouble: `rollDrop` makes
// its item with `hash2(seed, ..., SALT_ITEM)`, which is a uint32 of up to
// 4.29e9, and that number goes straight back in as the next `x`. So the low
// bits of an item's own seed were being rounded away one step downstream of
// where it was drawn. `Math.imul` keeps every one of them.
//
// The rolls this changes are the ones drawn off an intermediate seed, which is
// every item's rarity, affixes and name. A character standing over a corpse
// gets a different sword out of the same kill than they would have yesterday.
// Nothing is saved about a drop that has not been picked up, so nothing on disk
// cares; what is in a pack stays in the pack.
//
// Before: e1a626f4 over the drops and f4fb1156 over the kills.
{
  console.log('\n  -- the unprofiled roll is the roll it always was --');
  const fnv = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); };
  const MIXED = ['longsword', 'carrot', 'reagent', 'plate_outfit', 'venison', 'copper_ingot'];
  const lines = [];
  for (const table of [TABLE, MIXED]) for (const tier of [1, 2, 3, 4, 5, 6]) for (const luck of [0, 40]) for (let s = 0; s < 1000; s++) {
    lines.push(JSON.stringify(rollDrop({ table, tier, luck, seed: s })));
  }
  check(`${lines.length} unprofiled drops hash to what the module said before the bias existed`,
    // '2d7e6fdd' until 2026-09-08: the eight armour pieces became one outfit per tier, so every seeded roll over a table that names armour lands differently
    // 'bd118b31' until the rarity retune of 2026-09-08 (white 76.75, green 17, blue 5, purple 0.8, gold 0.4, orange 0.05)
    fnv(lines.join('|')) === 'bd654cf7', fnv(lines.join('|')));

  const kills = [];
  for (const [boss, twice] of [[false, false], [false, true], [true, false]]) for (let s = 0; s < 1000; s++) {
    const k = rollKill({ table: MIXED, tier: 5, seed: s, boss, twice });
    kills.push(`${k.gold}:${JSON.stringify(k.item)}`);
  }
  check(`and ${kills.length} unprofiled kills, gold and item together, hash to the same`,
    fnv(kills.join('|')) === '60692b31', fnv(kills.join('|')));   // '71d0fb80' before the rarity retune and the gear coin of 2026-09-08

  check('a profile of nothing is the same as no profile at all',
    JSON.stringify(rollDrop({ table: TABLE, tier: 3, seed: 12, profile: new Set() }))
    === JSON.stringify(rollDrop({ table: TABLE, tier: 3, seed: 12 })));
  check('and a profiled roll is still deterministic from its seed',
    JSON.stringify(rollDrop({ table: TABLE, tier: 3, seed: 12, profile: classProfile(OPENINGS_BY_ID.warrior) }))
    === JSON.stringify(rollDrop({ table: TABLE, tier: 3, seed: 12, profile: classProfile(OPENINGS_BY_ID.warrior) })));
  // L2: a character handed to rollKill is worked into a whole kit, and the six
  // in ten draw from it whenever the table carried gear. A bare profile Set has
  // no kit and takes the L1 intersection path, which is what the tests above
  // drive; the two are the same coin and differ only in what the six draw.
  check('rollKill takes the character and works the kit out of it, so no caller has to',
    (() => {
      const c = { stats: { ...OPENINGS_BY_ID.warrior.stats }, skills: { ...OPENINGS_BY_ID.warrior.skills } };
      const profile = classProfile(c);
      let kit = 0, biased = 0, offProfile = 0;
      for (let s = 0; s < 500; s++) {
        const r = rollKill({ table: TABLE, tier: 3, seed: s, character: c });
        if (r.bias?.biased) { biased++; if (r.bias.from === 'kit') kit++; if (r.item && !profile.has(r.item.base)) offProfile++; }
      }
      // 500 kills, three in four roll for gear (GEAR_DROP_SCALE), six in ten of those are biased
      return biased > 180 && kit === biased && offProfile === 0;
    })());
  check('and a kit draw hands out outfits, weapons and ammunition alike (one armour slot since 2026-09-08)', (() => {
    const d = classProfileDetail({ skills: { archery: 60, tracking: 40 }, stats: { str: 45, dex: 70 } });
    const rng = seededRng(9);
    const outfits = new Set(); let armour = 0, bows = 0, arrows = 0;
    for (let i = 0; i < 4000; i++) {
      const got = kitDraw(d, rng);
      if (!got) return false;
      const b = BASES[got.base];
      if (b.kind === 'armour') { armour++; if (b.slot !== 'outfit') return false; outfits.add(got.base); }
      if (got.base === 'shortbow' || got.base === 'longbow') bows++;
      if (got.base === 'arrow') { arrows++; if (got.count < 12 || got.count > 30) return false; }
    }
    return armour > 800 && outfits.size >= 2 && bows > 400 && arrows > 200;
  })());
}

// ===========================================================================
// L1: THE RARE FLOOR ON A BOSS ROLL
// ===========================================================================
{
  console.log('\n  -- the floor bossRoll now carries by default --');
  let below = 0, n = 4000;
  for (let s = 0; s < n; s++) {
    const it = bossRoll({ table: ['longsword'], tier: 1, seed: s });
    if (RARITY_ORDER.indexOf(it.rarity) < RARITY_ORDER.indexOf('rare')) below++;
  }
  check('a bossRoll at tier 1 never leaves anything below blue', below === 0, `${below} of ${n} below rare`);
  let plainBelow = 0;
  for (let s = 0; s < n; s++) {
    const it = rollDrop({ table: ['longsword'], tier: 1, seed: s });
    if (RARITY_ORDER.indexOf(it.rarity) < RARITY_ORDER.indexOf('rare')) plainBelow++;
  }
  check('and the same table rolled once leaves plenty, which is the gate driven the other way',
    plainBelow > n * 0.8, `${plainBelow} of ${n} single rolls are below rare`);
  check('floor: null turns it off again', (() => {
    let off = 0;
    for (let s = 0; s < n; s++) {
      const it = bossRoll({ table: ['longsword'], tier: 1, seed: s, floor: null });
      if (RARITY_ORDER.indexOf(it.rarity) < RARITY_ORDER.indexOf('rare')) off++;
    }
    return off > 0;
  })());
  // And the honest half: at the two tiers that actually call it in the game the
  // default changes nothing, because the weight shift already floors them.
  check('at tier 5 the default floor changes nothing, because the shift already starts at blue',
    weightsFor(5, 0)[0] === 0 && weightsFor(5, 0)[1] === 0);
  check('and a boss still asks for purple over the top of it', (() => {
    for (let s = 0; s < 1000; s++) {
      const k = rollKill({ table: TABLE, tier: 6, seed: s, boss: true });
      if (RARITY_ORDER.indexOf(k.item.rarity) < RARITY_ORDER.indexOf('epic')) return false;
    }
    return true;
  })());
  check('a boss draws from the class shelf eight times in ten, not six', (() => {
    const wp = classProfile(OPENINGS_BY_ID.warrior);
    let biased = 0, gear = 0;
    for (let s = 0; s < 10000; s++) {
      const rec = {};
      rollKill({ table: ['longsword', 'kite', 'plate_outfit', 'gem'], tier: 6, seed: s, boss: true, profile: wp, record: rec });
      if (rec.gear) { gear++; if (rec.biased) biased++; }
    }
    return Math.abs(biased / gear - BOSS_BIAS) < 0.02;
  })(), (() => {
    const wp = classProfile(OPENINGS_BY_ID.warrior);
    let biased = 0, gear = 0;
    for (let s = 0; s < 10000; s++) {
      const rec = {};
      rollKill({ table: ['longsword', 'kite', 'plate_outfit', 'gem'], tier: 6, seed: s, boss: true, profile: wp, record: rec });
      if (rec.gear) { gear++; if (rec.biased) biased++; }
    }
    return `${(biased / gear * 100).toFixed(2)}% of ${gear} gear rolls`;
  })());
}

// ===========================================================================
// L1: THE SIGNATURE UNIQUES
// ===========================================================================
{
  console.log('\n  -- the nine signature uniques --');
  const report = auditSignatures();
  check('the signature table audits clean', !!report && report.signatures === 9);
  console.log(`  ${report.signatures} signatures, ${report.wired} joined to a monster that exists today, ${report.waiting.length} waiting on M2: ${report.waiting.join('; ')}`);

  // ONE PER REALM, and the realm's own boss, read out of realms.js rather than
  // typed twice. This is the check that catches a renamed dungeon boss.
  const realmBoss = {};
  for (const r of REALMS) {
    const d = r.places.find((p) => p.kind === 'dungeon' && p.boss);
    realmBoss[r.id] = d ? d.boss : null;
  }
  check('there is one signature for each of the nine realms',
    SIGNATURES.length === REALMS.length && SIGNATURES.every((s) => realmBoss[s.realm] !== undefined),
    `${REALMS.length} realms`);
  const drifted = SIGNATURES.filter((s) => realmBoss[s.realm] !== s.boss);
  check('and each names its own realm\'s dungeon boss, word for word out of realms.js',
    drifted.length === 0,
    drifted.length
      ? drifted.map((s) => `${s.realm}: loot.js says "${s.boss}", realms.js says "${realmBoss[s.realm]}"`).join(' | ')
      : SIGNATURES.map((s) => `${s.realm}: ${s.boss}`).join(' | '));

  // The monsters that ARE those bosses today are real rows, and they are bosses.
  for (const s of SIGNATURES) {
    for (const id of s.monsters) {
      check(`${s.id} names the monster ${id}, which exists and is a boss`,
        !!MONSTERS[id] && MONSTERS[id].boss === true);
    }
  }
  // Coverage, reported rather than demanded. Every boss the table NAMES has to
  // resolve, and at least one has to, or the whole feature is decoration; but a
  // wandering semi-boss added later is allowed to carry no signature at all.
  const covered = BOSSES.filter((m) => !!signatureFor(m));
  check(`${covered.length} of the ${BOSSES.length} bosses in monsters.js resolve to a signature, and at least one must`,
    covered.length > 0, BOSSES.map((m) => `${m.id} -> ${signatureFor(m)?.id || 'none yet'}`).join(', '));
  check('and every monster id the table names resolves to the signature that names it',
    SIGNATURES.every((sig) => sig.monsters.every((id) => MONSTERS[id] && signatureFor(MONSTERS[id]) === sig)));

  // NEVER ELSEWHERE. Every row in the file, driven through the join.
  const wrong = MONSTER_LIST.filter((m) => !m.boss && signatureFor(m));
  check(`none of the ${MONSTER_LIST.length - BOSSES.length} monsters that are not bosses matches a signature`,
    wrong.length === 0, wrong.map((m) => m.id).join(', '));
  check('and a row that carries a boss name but is not flagged a boss matches nothing',
    signatureFor({ id: 'imposter', name: 'Malachar, the Wyrmking', boss: false }) === null);
  check('while the same row flagged a boss does match, which is the gate driven true',
    signatureFor({ id: 'imposter', name: 'Malachar, the Wyrmking', boss: true })?.id === 'wyrmkings_due');
  check('the name match ignores a leading "the" and the punctuation, so realms.js and monsters.js can spell it their own way',
    signatureFor({ id: 'x', name: 'The Keeper of Faces', boss: true })?.id === 'hundred_faces'
    && signatureFor({ id: 'y', name: 'Keeper of Faces', boss: true })?.id === 'hundred_faces');

  // THE ITEM.
  for (const s of SIGNATURES) {
    const it = makeUnique(s, 1234);
    const power = it.affixes.filter((a) => a.power);
    check(`${s.name} is a legendary ${baseFor(s.base).name} carrying ${POWER_BY_ID[s.power].name} and nothing else named`,
      it.rarity === 'legendary' && it.base === s.base && power.length === 1 && power[0].id === s.power
      && it.affixes.length === RARITY.legendary.affixes + 1 && it.unique === s.id && it.uniqueName === s.name
      && !!it.flavour && allowedOn(POWER_BY_ID[s.power], s.base),
      `${it.affixes.length} lines`);
  }
  check('the power entry is the same shape affixes.js builds for a rolled one', (() => {
    // A legendary of the same base, rolled the ordinary way, so the two records
    // can be compared key for key rather than taken on trust.
    const rolled = rollAffixes(makeUnique(SIGNATURES[0], 7));
    const mine = rolled.find((a) => a.power);          // rollAffixes rolls its own
    const ours = makeUnique(SIGNATURES[0], 7).affixes.find((a) => a.power);
    return mine && ours && Object.keys(mine).sort().join(',') === Object.keys(ours).sort().join(',');
  })());
  check('a unique identifies into the power it was given, not one identify rolled for it', (() => {
    const it = makeUnique(SIGNATURE_BY_ID.wyrmkings_due, 99);
    const seen = identify(it, 99);
    return seen.identified === true && seen.affixes.some((a) => a.power && a.id === 'vampiric');
  })());
  check('and arrives unidentified, like every other colour above white',
    makeUnique(SIGNATURES[0], 5).identified === false);
  check('two characters\' copies differ in their five ordinary lines',
    JSON.stringify(makeUnique(SIGNATURES[0], 1).affixes) !== JSON.stringify(makeUnique(SIGNATURES[0], 2).affixes));
  check('and the same seed gives the same sword twice',
    JSON.stringify(makeUnique(SIGNATURES[0], 1)) === JSON.stringify(makeUnique(SIGNATURES[0], 1)));
  check('items.js accepts all nine as item records', auditItems(SIGNATURES.map((s) => makeUnique(s, 3))) === true);
  check('naming a signature that does not exist throws', threw(() => makeUnique('nonesuch', 1)));

  // THE DROP RATE, AND ONCE ONLY. Ten thousand kills of each boss, each with a
  // fresh character, and then ten thousand more with one character throughout.
  console.log(`  10,000 kills of each of the ${covered.length} bosses that carry one today:`);
  for (const m of covered) {
    const sig = signatureFor(m);
    let got = 0;
    for (let s = 0; s < 10000; s++) {
      const c = { stats: { str: 60 }, skills: { swordsmanship: 50 }, uniques: [] };
      const k = rollKill({ table: TABLE, tier: 6, seed: s, boss: true, monster: m, character: c });
      if (k.unique) { got++; if (k.unique.unique !== sig.id) got = -99999; }
    }
    check(`  ${m.name} leaves ${sig.name} about one kill in four`,
      Math.abs(got / 10000 - UNIQUE_CHANCE) < 0.02, `${got} of 10,000, ${(got / 100).toFixed(2)}%`);
  }
  check('one character killing the same boss ten thousand times gets it exactly once', (() => {
    const c = { stats: { str: 60 }, skills: { swordsmanship: 50 } };
    let got = 0;
    for (let s = 0; s < 10000; s++) {
      if (rollKill({ table: TABLE, tier: 6, seed: s, boss: true, monster: covered[0], character: c }).unique) got++;
    }
    return got === 1 && c.uniques.length === 1 && c.uniques[0] === signatureFor(covered[0]).id;
  })());
  check('and the list is written onto the character, not left for the caller to remember', (() => {
    const c = { stats: { str: 60 }, skills: {} };
    for (let s = 0; s < 200; s++) rollKill({ table: TABLE, tier: 6, seed: s, boss: true, monster: covered[0], character: c });
    return Array.isArray(c.uniques) && c.uniques.length === 1;
  })());
  check('a character who already carries the id never gets a second', (() => {
    const c = { stats: { str: 60 }, skills: {}, uniques: SIGNATURES.map((s) => s.id) };
    for (let s = 0; s < 20000; s++) {
      if (rollKill({ table: TABLE, tier: 6, seed: s, boss: true, monster: covered[0], character: c }).unique) return false;
    }
    return c.uniques.length === SIGNATURES.length;
  })());
  check('no character, no unique, and no crash', (() => {
    for (let s = 0; s < 500; s++) if (rollKill({ table: TABLE, tier: 6, seed: s, boss: true, monster: covered[0] }).unique) return false;
    return true;
  })());

  // AND NOWHERE ELSE. Ten thousand kills of every non boss row in the file,
  // with a character who owns nothing, against every signature.
  check(`10,000 kills of each of the ${MONSTER_LIST.length - BOSSES.length} monsters that are not bosses leave no unique at all`, (() => {
    const c = { stats: { str: 60 }, skills: { swordsmanship: 50 }, uniques: [] };
    for (const m of MONSTER_LIST) {
      if (m.boss || !m.tier) continue;
      for (let s = 0; s < 10000; s++) {
        if (rollKill({ table: TABLE, tier: m.tier, seed: s, boss: false, twice: m.tier === 5, monster: m, character: c }).unique) return false;
      }
    }
    return c.uniques.length === 0;
  })());
  check('and rollUnique refuses a monster that carries no signature at all',
    rollUnique({ monster: MONSTERS.wolf, character: { uniques: [] }, seed: 1 }) === null);
}

// ===========================================================================
// L1: WHAT THE PROFILE COSTS
// ===========================================================================
{
  const c = { stats: { ...OPENINGS_BY_ID.warrior.stats }, skills: { ...OPENINGS_BY_ID.warrior.skills } };
  const t0 = performance.now();
  for (let i = 0; i < 20000; i++) classProfile(c);
  const us = (performance.now() - t0) / 20000 * 1000;
  check('a profile is worked out in a few microseconds, so a kill can afford one', us < 100, `${us.toFixed(1)} microseconds`);
  const p = classProfile(c);
  const t1 = performance.now();
  for (let s = 0; s < 50000; s++) rollDrop({ table: TABLE, tier: 4, seed: s, profile: p });
  const ms = (performance.now() - t1) / 50000;
  check('and a biased drop still rolls in well under a millisecond', ms < 0.5, `${(ms * 1000).toFixed(1)} microseconds`);
}

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
