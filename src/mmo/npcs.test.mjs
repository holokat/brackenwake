// The people, driven both ways. Run: node src/mmo/npcs.test.mjs
//
// Every number printed here was measured in this file. The settlement rules are
// driven over hundreds of seeds, not one.
import { readFileSync } from 'node:fs';
import {
  NPCS, NPC_LIST, SKILL_IDS, SKILL_DOC, SETTLEMENT_KINDS, SERVICES, GOODS, DOC_REFS,
  TRAIN_CAP, TOWN_NPCS, HAMLET_NPCS, RESURRECT_COST, RESURRECT_FREE_AT,
  SELL_RATE, PROVISIONER_SELL_RATE, SELL_RATE_FLOOR, BUY_RISE_PER_UNIT, SELL_FALL_PER_UNIT,
  trainCost, npcsFor, vendorPrice, vendorPays, vendorPriceMult, vendorPayRate,
  townMultiplier, resurrectCost, repairCost, auditNpcs,
} from './npcs.js';
import { SKILL_DOC as RECIPE_SKILL_DOC } from './recipes.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };
// Seeds are scrambled on the way in: consecutive seeds through a bare LCG
// differ by only 0.0004 in their first draw, which would quietly hide most of
// the range a settlement can roll.
const lcg = (seed) => { let s = ((seed >>> 0) * 2654435761) >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
const throws = (fn) => { try { fn(); return false; } catch { return true; } };

console.log('npcs.js');

// --- the audit, both directions -------------------------------------------
const shape = auditNpcs();
check('auditNpcs passes on the real table', true, `${shape.npcs} roles, ${shape.teachable} teachable skills, ${shape.lines} lines`);

const plants = [
  ['a duplicate id', { ...NPCS.bard }],
  ['a skill nobody has', { ...NPCS.bard, id: 'p1', teaches: ['juggling'] }],
  ['a settlement kind that does not exist', { ...NPCS.bard, id: 'p2', appearsIn: ['citadel'] }],
  ['a service nobody offers', { ...NPCS.bard, id: 'p3', services: ['barbering'] }],
  ['a good nobody stocks', { ...NPCS.bard, id: 'p4', sells: ['moonbeams'] }],
  ['two lines where three are wanted', { ...NPCS.bard, id: 'p5', lines: ['One.', 'Two.'] }],
  ['six lines where five are the most', { ...NPCS.bard, id: 'p6', lines: ['a', 'b', 'c', 'd', 'e', 'f'] }],
  ['an em dash in a line', { ...NPCS.bard, id: 'p7', lines: ['A rumour — for a price.', 'Two.', 'Three.'] }],
  ['somebody who offers nothing at all', { id: 'p8', name: 'Idler', appearsIn: ['town'], sells: [], buys: [], teaches: [], services: [], lines: ['a', 'b', 'c'] }],
];
for (const [what, row] of plants) {
  NPC_LIST.push(row);
  const caught = throws(auditNpcs);
  NPC_LIST.pop();
  check(`auditNpcs rejects ${what}`, caught);
}
{
  const keep = NPCS.necromancer.appearsIn;
  NPCS.necromancer.appearsIn = ['town', 'ruin'];
  const caught = throws(auditNpcs);
  NPCS.necromancer.appearsIn = keep;
  check('auditNpcs rejects a Necromancer let into a town', caught);
}
check('auditNpcs passes again once the plants are pulled', !throws(auditNpcs));

// --- the fifteen ----------------------------------------------------------
check('there are fifteen roles', NPC_LIST.length === 15, NPC_LIST.map((n) => n.id).join(' '));
check('every id is unique', new Set(NPC_LIST.map((n) => n.id)).size === 15);
check('every role has three to five lines', NPC_LIST.every((n) => n.lines.length >= 3 && n.lines.length <= 5),
  NPC_LIST.map((n) => n.lines.length).join(' '));
check('no line anywhere carries an em dash', !NPC_LIST.some((n) => n.lines.some((l) => l.includes('—'))));
check('every taught skill is a real skill', NPC_LIST.every((n) => n.teaches.every((t) => SKILL_IDS.includes(t))));
check('every service is one of the eight', NPC_LIST.every((n) => n.services.every((s) => SERVICES.includes(s))));
check('every good traded is a good this game has', NPC_LIST.every((n) => [...n.sells, ...n.buys].every((g) => GOODS.includes(g))));
check('the Necromancer stands at a ruin, at night, and nowhere else',
  NPCS.necromancer.appearsIn.join() === 'ruin' && NPCS.necromancer.nightOnly === true);
check('the Ranger needs a forest edge', NPCS.ranger.needs === 'forestEdge');
check('the Banker needs a bank', NPCS.banker.needs === 'bank');
check('a Banker never turns up where there is no bank', (() => {
  let seen = 0;
  for (let i = 0; i < 400; i++) if (npcsFor({ kind: 'town', bank: false }, lcg(i)).some((n) => n.id === 'banker')) seen++;
  return seen === 0;
})(), 'over 400 towns with no bank');
check('and does turn up where there is one', (() => {
  let seen = 0;
  for (let i = 0; i < 400; i++) if (npcsFor({ kind: 'town', bank: true }, lcg(i)).some((n) => n.id === 'banker')) seen++;
  return seen > 0;
})(), (() => { let n = 0; for (let i = 0; i < 400; i++) if (npcsFor({ kind: 'town', bank: true }, lcg(i)).some((x) => x.id === 'banker')) n++; return `${n} of 400 towns with a bank`; })());
check('auditNpcs rejects a need nobody ever supplies', (() => {
  const keep = NPCS.banker.needs;
  NPCS.banker.needs = 'a moat';
  const caught = throws(auditNpcs);
  NPCS.banker.needs = keep;
  return caught;
})());
check('the Healer heals, cures and resurrects',
  ['heal', 'cure', 'resurrect'].every((s) => NPCS.healer.services.includes(s)));
check('the Blacksmith is the one who repairs', NPCS.blacksmith.services.includes('repair')
  && NPC_LIST.filter((n) => n.services.includes('repair')).length === 1);
check('the Innkeeper is the one who rests you', NPCS.innkeeper.services.includes('rest'));
check('the Banker stands in a town, banks, and is the only one who does',
  NPCS.banker.appearsIn.join() === 'town' && NPCS.banker.services.includes('bank')
  && NPC_LIST.filter((n) => n.services.includes('bank')).length === 1);
check('and the Banker has a second tab, so the Talk panel is not a dead end',
  NPCS.banker.buys.length > 0, `buys ${NPCS.banker.buys.join(', ')}`);
check('auditNpcs rejects a Banker let into a hamlet', (() => {
  const keep = NPCS.banker.appearsIn;
  NPCS.banker.appearsIn = ['town', 'hamlet'];
  const caught = throws(auditNpcs);
  NPCS.banker.appearsIn = keep;
  return caught;
})());
check('the Provisioner buys almost anything', NPCS.provisioner.buys.includes('anything'));
check('every teachable skill in the document has a teacher', (() => {
  const taught = new Set(NPC_LIST.flatMap((n) => n.teaches));
  // The gatherers, crafters, fighters and casters the document lists trainers
  // for. Masonry, Poisoning, Fishing, Detect Hidden, Remove Trap, Herding,
  // Swimming, Focus and Resisting Spells have no trainer in the document.
  const want = ['blacksmithing', 'mining', 'tailoring', 'archery', 'fletching', 'alchemy', 'foraging',
    'healing', 'anatomy', 'magery', 'evaluatingIntelligence', 'meditation', 'inscription',
    'animalTaming', 'animalLore', 'veterinary', 'swordsmanship', 'macefighting', 'fencing',
    'polearms', 'tactics', 'parrying', 'wrestling', 'tracking', 'camping', 'musicianship',
    'provocation', 'peacemaking', 'discordance', 'necromancy', 'spiritSpeak', 'stealth',
    'hiding', 'lockpicking', 'stealing'];
  return want.every((s) => taught.has(s));
})(), `${new Set(NPC_LIST.flatMap((n) => n.teaches)).size} skills have a teacher`);

// --- training -------------------------------------------------------------
check('TRAIN_CAP is 40', TRAIN_CAP === 40);
check('training from nothing to the cap costs 400 gold', trainCost(0, 40) === 400, `${trainCost(0, 40)} gold`);
check('a lesson is 1 gold per 0.1', trainCost(10, 11) === 10 && trainCost(10, 10.1) === 1,
  `10 to 11: ${trainCost(10, 11)} gold, 10 to 10.1: ${trainCost(10, 10.1)} gold`);
check('nobody can teach you past 40', trainCost(0, 100) === 400 && trainCost(40, 100) === 0,
  `0 to 100 charges ${trainCost(0, 100)}, 40 to 100 charges ${trainCost(40, 100)}`);
check('a skill already past the cap costs nothing', trainCost(55, 40) === 0 && trainCost(41, 40) === 0);
check('going backwards costs nothing rather than paying you', trainCost(30, 20) === 0);

// --- healers and smiths ---------------------------------------------------
check('a resurrection costs 50 below Healing 30 and nothing at or above it',
  resurrectCost(29.9) === RESURRECT_COST && resurrectCost(RESURRECT_FREE_AT) === 0 && resurrectCost(80) === 0,
  `29.9: ${resurrectCost(29.9)}, 30: ${resurrectCost(30)}`);
check('a repair is 1 gold a durability point', repairCost(37) === 37 && repairCost(0) === 0);
check('a town multiplier stays between 0.9 and 1.2', (() => {
  let lo = 9, hi = -9;
  for (let i = 0; i < 5000; i++) { const m = townMultiplier(i * 7919); lo = Math.min(lo, m); hi = Math.max(hi, m); }
  return lo >= 0.9 - 1e-9 && hi <= 1.2 + 1e-9;
})(), `5,000 hashes: ${townMultiplier(0).toFixed(3)} to ${townMultiplier(999).toFixed(3)}`);

// --- vendor prices --------------------------------------------------------
check('a buy price rises 5% per unit bought this hour', (() => {
  for (let n = 0; n <= 20; n++) {
    if (Math.abs(vendorPriceMult(n) - Math.pow(1.05, n)) > 1e-12) return false;
    if (Math.abs(vendorPriceMult(n + 1) / vendorPriceMult(n) - 1.05) > 1e-12) return false;
  }
  return true;
})(), `mult after 0, 1, 5, 10 bought: ${[0, 1, 5, 10].map((n) => vendorPriceMult(n).toFixed(4)).join(', ')}`);
check('the rise shows up in the rounded price too', (() => {
  const base = 100000;   // large enough that rounding is under 0.001%
  for (let n = 0; n < 10; n++) {
    const a = vendorPrice(base, 1, n), b = vendorPrice(base, 1, n + 1);
    if (Math.abs(b / a - 1.05) > 1e-4) return false;
  }
  return true;
})(), `a 90 gold longsword after 0, 1, 3 bought: ${[0, 1, 3].map((n) => vendorPrice(90, 1, n)).join(', ')} gold`);
check('the town multiplier multiplies the price', vendorPrice(100, 1.2, 0) === 120 && vendorPrice(100, 0.9, 0) === 90);
check('a price never falls below 1 gold', vendorPrice(0, 0.9, 0) === 1 && vendorPrice(1, 0.9, 0) === 1);
check('buying nothing yet costs the catalog price', vendorPrice(90, 1, 0) === 90);

check('a vendor pays 30% and the Provisioner 15%',
  vendorPayRate(0, false) === SELL_RATE && vendorPayRate(0, true) === PROVISIONER_SELL_RATE,
  `${SELL_RATE * 100}% and ${PROVISIONER_SELL_RATE * 100}%`);
check('pays fall 10% per unit sold this hour', (() => {
  for (let n = 0; n < 5; n++) {
    const a = vendorPayRate(n, false), b = vendorPayRate(n + 1, false);
    if (a <= SELL_RATE_FLOOR) break;
    if (Math.abs(b / a - 0.9) > 1e-12) return false;
  }
  return true;
})(), `rate after 0, 1, 2, 3 sold: ${[0, 1, 2, 3].map((n) => vendorPayRate(n).toFixed(4)).join(', ')}`);
check('the 5% floor holds and is reached', (() => {
  const rates = [];
  for (let n = 0; n <= 40; n++) rates.push(vendorPayRate(n, false));
  return rates.every((r) => r >= SELL_RATE_FLOOR) && rates[40] === SELL_RATE_FLOOR;
})(), `after 17 sold: ${vendorPayRate(17).toFixed(5)}, after 18: ${vendorPayRate(18).toFixed(5)}, floor ${SELL_RATE_FLOOR}`);
check('the floor bites at exactly the unit the arithmetic says', (() => {
  // 0.30 * 0.9^n dips under 0.05 first at n = 18: 0.30 * 0.9^17 = 0.05087
  return vendorPayRate(17) > SELL_RATE_FLOOR && vendorPayRate(18) === SELL_RATE_FLOOR;
})(), `17 sold: ${vendorPayRate(17).toFixed(5)}, 18 sold: ${vendorPayRate(18).toFixed(5)}`);
check('the Provisioner reaches the floor sooner than anyone else',
  vendorPayRate(11, true) === SELL_RATE_FLOOR && vendorPayRate(11, false) > SELL_RATE_FLOOR,
  `provisioner hits the floor at 11 sold, everyone else at 18`);
check('the fall shows up in the rounded payment too', (() => {
  const base = 100000;
  for (let n = 0; n < 10; n++) {
    const a = vendorPays(base, n, false), b = vendorPays(base, n + 1, false);
    if (Math.abs(b / a - 0.9) > 1e-4) return false;
  }
  return true;
})(), `a 90 gold longsword sold 0, 1, 3 times: ${[0, 1, 3].map((n) => vendorPays(90, n)).join(', ')} gold`);
check('selling always pays at least a gold', vendorPays(1, 40, true) === 1);
check('a vendor never pays more than it charges', (() => {
  for (const base of [1, 4, 25, 90, 600, 2400]) {
    if (vendorPays(base, 0, false) > vendorPrice(base, 0.9, 0)) return false;
  }
  return true;
})(), `a 90 gold longsword: buy ${vendorPrice(90, 1, 0)}, sell back ${vendorPays(90, 0, false)}`);

// --- who stands where -----------------------------------------------------
{
  const SEEDS = 200;
  let townsWithProvisioner = 0, townsWithNecromancer = 0, townSizes = [];
  let hamletSizes = [], hamletsWithProvisioner = 0, hamletHealerWrong = 0, hamletsWithNecromancer = 0;
  for (let s = 1; s <= SEEDS; s++) {
    const town = npcsFor({ kind: 'town' }, lcg(s)).map((n) => n.id);
    townSizes.push(town.length);
    if (town.includes('provisioner')) townsWithProvisioner++;
    if (town.includes('necromancer')) townsWithNecromancer++;

    const hamlet = npcsFor({ kind: 'hamlet', forestEdge: s % 2 === 0 }, lcg(s * 7919)).map((n) => n.id);
    hamletSizes.push(hamlet.length);
    if (hamlet.includes('provisioner')) hamletsWithProvisioner++;
    if (hamlet.includes('necromancer')) hamletsWithNecromancer++;
    if (hamlet.length > 2 && !hamlet.includes('healer')) hamletHealerWrong++;
  }
  check(`every one of ${SEEDS} towns has a Provisioner`, townsWithProvisioner === SEEDS, `${townsWithProvisioner} of ${SEEDS}`);
  check(`no Necromancer in any of ${SEEDS} towns`, townsWithNecromancer === 0, `${townsWithNecromancer} of ${SEEDS}`);
  check(`no Necromancer in any of ${SEEDS} hamlets`, hamletsWithNecromancer === 0, `${hamletsWithNecromancer} of ${SEEDS}`);
  check(`every one of ${SEEDS} hamlets has a Provisioner`, hamletsWithProvisioner === SEEDS, `${hamletsWithProvisioner} of ${SEEDS}`);
  check('a town holds 6 to 9 people', Math.min(...townSizes) >= TOWN_NPCS[0] && Math.max(...townSizes) <= TOWN_NPCS[1],
    `measured ${Math.min(...townSizes)} to ${Math.max(...townSizes)} over ${SEEDS} seeds`);
  check('a town really does vary in size', new Set(townSizes).size > 1, `sizes seen: ${[...new Set(townSizes)].sort().join(', ')}`);
  check('a hamlet holds 2 to 4 people', Math.min(...hamletSizes) >= HAMLET_NPCS[0] && Math.max(...hamletSizes) <= HAMLET_NPCS[1],
    `measured ${Math.min(...hamletSizes)} to ${Math.max(...hamletSizes)} over ${SEEDS} seeds`);
  check('a hamlet with more than two people has a Healer', hamletHealerWrong === 0, `${hamletHealerWrong} counterexamples`);
}
check('a ruin holds the Necromancer and nobody else', (() => {
  const r = npcsFor({ kind: 'ruin' }, lcg(1)).map((n) => n.id);
  return r.length === 1 && r[0] === 'necromancer';
})());
check('the Necromancer appears nowhere but a ruin, over 500 draws', (() => {
  for (let s = 1; s <= 500; s++) {
    for (const kind of ['town', 'hamlet']) {
      if (npcsFor({ kind, forestEdge: true }, lcg(s * 31 + kind.length)).some((n) => n.id === 'necromancer')) return false;
    }
  }
  return true;
})());
check('the Ranger only turns up at a hamlet on a forest edge', (() => {
  let onEdge = 0, inland = 0;
  for (let s = 1; s <= 400; s++) {
    if (npcsFor({ kind: 'hamlet', forestEdge: true }, lcg(s)).some((n) => n.id === 'ranger')) onEdge++;
    if (npcsFor({ kind: 'hamlet', forestEdge: false }, lcg(s)).some((n) => n.id === 'ranger')) inland++;
  }
  return onEdge > 0 && inland === 0;
})(), 'both directions over 400 seeds each');
check('a settlement kind that does not exist has nobody in it', npcsFor({ kind: 'citadel' }, lcg(1)).length === 0
  && npcsFor(null, lcg(1)).length === 0 && npcsFor('nowhere', lcg(1)).length === 0);
check('the same seed gives the same street twice', (() => {
  const a = npcsFor({ kind: 'town' }, lcg(4242)).map((n) => n.id).join();
  const b = npcsFor({ kind: 'town' }, lcg(4242)).map((n) => n.id).join();
  return a === b;
})());
check('a town is never without a Healer', (() => {
  for (let s = 1; s <= 200; s++) if (!npcsFor({ kind: 'town' }, lcg(s)).some((n) => n.id === 'healer')) return false;
  return true;
})());

// --- the documents --------------------------------------------------------
// The four design documents, and the Wave B contract, which is where the
// Banker and the `bank` service were written down: they are not in the
// original four and pretending otherwise would make this check a formality.
const doc = ['01-STATS-SKILLS.md', '03-ITEMS-LOOT.md', '05-WORLD-CONTENT.md', '06-ECONOMY-UI.md',
  'wiring/WAVE-B.md']
  .map((f) => readFileSync(new URL(`../../docs/mmo/${f}`, import.meta.url), 'utf8')).join('\n').toLowerCase();
for (const [group, map] of Object.entries(DOC_REFS)) {
  const missing = Object.entries(map).filter(([, phrase]) => !doc.includes(String(phrase).toLowerCase()));
  check(`every ${group} id is a word in the documents`, missing.length === 0,
    missing.length ? missing.map(([id, p]) => `${id} ("${p}")`).join(', ') : `${Object.keys(map).length} checked`);
}
const missingGoods = GOODS.filter((g) => !doc.includes(g.toLowerCase()));
check('every good a vendor stocks is a word in the documents', missingGoods.length === 0,
  missingGoods.length ? missingGoods.join(', ') : `${GOODS.length} checked`);
check('the doc check would fail on a word that is not there', !doc.includes('moonbeams'));

// The two copies of the skill list, which must not drift apart.
check('the skill list here matches the one in recipes.js',
  JSON.stringify(SKILL_DOC) === JSON.stringify(RECIPE_SKILL_DOC),
  `${SKILL_IDS.length} skills in both`);
check('that comparison can fail', JSON.stringify({ ...SKILL_DOC, focus: 'Focussing' }) !== JSON.stringify(RECIPE_SKILL_DOC));

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
