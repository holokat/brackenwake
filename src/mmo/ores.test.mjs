// Ore, gems, wood and leather, driven both ways. Run: node src/mmo/ores.test.mjs
//
// Every number printed here was measured in this file, and every threshold is
// probed on both sides of the line.
import { readFileSync } from 'node:fs';
import {
  ORES, ORE, METALS, ALLOYS, GEMS, WOODS, LEATHERS, VEIN_BREAKS, VEIN_REGROW_S, DOC_REFS,
  oreYield, oreYieldRange, rareVeinChance, canWork, veinsFor, veinBreaks, auditOres,
} from './ores.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };
const lcg = (seed) => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
const throws = (fn) => { try { fn(); return false; } catch { return true; } };

console.log('ores.js');

// --- the audit, both directions -------------------------------------------
const shape = auditOres();
check('auditOres passes on the real tables', true, JSON.stringify(shape));

// The plants mutate the very objects ORE, METAL and METALS point at, so the
// restore has to write back into those same objects, not swap the array slots.
const snap = ORES.map((o) => ({ ...o }));
const restore = () => { ORES.length = snap.length; ORES.forEach((o, i) => Object.assign(o, snap[i])); };
const plants = [
  ['a tier that skips a number', () => { ORES[4].tier = 9; }],
  ['a workAt that falls below the tier under it', () => { ORES[4].workAt = 1; }],
  ['a workAt above its own workWell', () => { ORES[4].workAt = 99; }],
  ['a tier that lends nothing', () => { ORES[4].lends = {}; }],
  ['an eleventh ore', () => { ORES.push({ ...snap[0], id: 'unobtainium', tier: 11, workAt: 99, workWell: 100, lends: { ar: 1 } }); }],
];
for (const [what, plant] of plants) {
  plant();
  const caught = throws(auditOres);
  restore();
  check(`auditOres rejects ${what}`, caught);
}
{
  const keep = GEMS[3].affix;
  GEMS[3].affix = GEMS[2].affix;
  const caught = throws(auditOres);
  GEMS[3].affix = keep;
  check('auditOres rejects two gems that set the same affix', caught);
}
check('auditOres passes again once the plants are pulled', !throws(auditOres));

// --- the ten tiers --------------------------------------------------------
check('there are exactly ten ore tiers', ORES.length === 10, ORES.map((o) => o.id).join(' '));
check('the ten are the ten the document names',
  ORES.map((o) => o.id).join(' ') === 'copper tin iron silver coldiron emberite rimesteel verdite voidrock starfall');
check('every workAt and workWell matches the document', (() => {
  const want = [[0, 20], [10, 30], [20, 45], [35, 55], [45, 65], [55, 75], [65, 82], [72, 88], [82, 94], [92, 100]];
  return ORES.every((o, i) => o.workAt === want[i][0] && o.workWell === want[i][1]);
})(), ORES.map((o) => `${o.workAt}/${o.workWell}`).join(' '));
check('every tier has a colour', ORES.every((o) => typeof o.colour === 'string' && o.colour.length > 2));
check('copper and tin lend nothing on their own',
  Object.keys(ORE.copper.lends).length === 0 && Object.keys(ORE.tin.lends).length === 0);
check('bronze is copper and tin, at material tier 2, and lends +1 AR',
  ALLOYS.bronze.from.join('+') === 'copper+tin' && ALLOYS.bronze.tier === 2 && ALLOYS.bronze.lends.ar === 1);
check('the smith has ten metals, tin folded into bronze', METALS.length === 10,
  METALS.map((m) => `${m.id}:${m.tier}`).join(' '));
check('starfall lends an extra affix roll', ORE.starfall.lends.extraAffixRolls === 1);

// --- canWork, one point either side of the line ---------------------------
for (const o of ORES) {
  const under = canWork(o.workAt - 0.1, o.id);
  const at = canWork(o.workAt, o.id);
  check(`${o.id} needs Mining ${o.workAt}`, at === true && under === false, `at ${o.workAt}: ${at}, at ${o.workAt - 0.1}: ${under}`);
}
check('canWork is false for an ore that does not exist', canWork(100, 'unobtainium') === false);
check('canWork accepts the tier number as well as the id', canWork(20, 3) === true && canWork(19, 3) === false);

// --- yield, measured over rolls -------------------------------------------
{
  const rng = lcg(20260904);
  const sample = (mining, ore, n = 20000) => {
    let lo = 1e9, hi = -1e9;
    for (let i = 0; i < n; i++) { const y = oreYield(mining, ore, rng); lo = Math.min(lo, y); hi = Math.max(hi, y); }
    return [lo, hi];
  };
  const copper = sample(100, 'copper');
  check('Mining 100 on copper yields 4 to 7', copper[0] === 4 && copper[1] === 7,
    `20,000 breaks measured ${copper[0]} to ${copper[1]}, document says 4 to 7`);
  const starfall = sample(100, 'starfall');
  check('Mining 100 on starfall yields 1 to 2', starfall[0] === 1 && starfall[1] === 2,
    `20,000 breaks measured ${starfall[0]} to ${starfall[1]}, document says 1 to 2`);
  const under = sample(91, 'starfall', 200);
  check('Mining 91 on starfall yields nothing at all', under[0] === 0 && under[1] === 0,
    `one point under workAt 92: ${under[0]} to ${under[1]}`);
  const atThreshold = sample(92, 'starfall', 200);
  check('Mining 92 on starfall does yield', atThreshold[1] >= 1, `${atThreshold[0]} to ${atThreshold[1]}`);
}
check('the yield range rises with Mining and never falls', (() => {
  for (const o of ORES) {
    let last = -1;
    for (let m = o.workAt; m <= 100; m += 1) {
      const top = oreYieldRange(m, o.id)[1];
      if (top < last) return false;
      last = top;
    }
  }
  return true;
})());
check('yield below the threshold is zero for every tier',
  ORES.every((o) => o.workAt === 0 || (oreYieldRange(o.workAt - 1, o.id)[0] === 0 && oreYieldRange(o.workAt - 1, o.id)[1] === 0)));

// --- rare veins -----------------------------------------------------------
check('rare vein chance at Mining 100 is 0.1', rareVeinChance(100) === 0.1, `${rareVeinChance(100)}`);
check('rare vein chance at Mining 0 is 0', rareVeinChance(0) === 0);
check('rare vein chance at Mining 50 is 0.05', Math.abs(rareVeinChance(50) - 0.05) < 1e-12, `${rareVeinChance(50)}`);
check('rare vein chance never runs past 1', rareVeinChance(100000) === 1);
{
  const rng = lcg(4242);
  let rare = 0; const n = 200000;
  for (let i = 0; i < n; i++) if (rng() < rareVeinChance(100)) rare++;
  const seen = rare / n;
  check('one vein in ten is rare at Mining 100, measured', Math.abs(seen - 0.1) < 0.005,
    `${rare} of ${n} = ${(seen * 100).toFixed(2)}%`);
}

// --- veins ----------------------------------------------------------------
check('copper, tin and iron are everywhere', ['meadow', 'desert', 'snow', 'mountain', 'beach', 'boreal', 'sakura', 'ocean']
  .every((b) => ['copper', 'tin', 'iron'].every((o) => veinsFor(b, 0).includes(o))));
check('silver and coldiron are in mountain caves and not on the mountainside',
  veinsFor('mountain', 1).includes('silver') && !veinsFor('mountain', 0).includes('silver'),
  `mountain surface: ${veinsFor('mountain', 0).join(' ')}`);
check('emberite is in desert caves and not in mountain caves',
  veinsFor('desert', 1).includes('emberite') && !veinsFor('mountain', 1).includes('emberite'));
check('rimesteel is in snow and nowhere else',
  veinsFor('snow', 0).includes('rimesteel') && !veinsFor('desert', 0).includes('rimesteel') && !veinsFor('meadow', 0).includes('rimesteel'));
check('verdite is in sakura and not in the desert',
  veinsFor('sakura', 0).includes('verdite') && !veinsFor('desert', 0).includes('verdite'));
check('voidrock is dungeon levels two and three only',
  !veinsFor('dungeon', 1).includes('voidrock') && veinsFor('dungeon', 2).includes('voidrock') && veinsFor('dungeon', 3).includes('voidrock'),
  `level 1: ${veinsFor('dungeon', 1).join(' ')}`);
check('starfall is only at a crater',
  veinsFor('crater', 0).includes('starfall')
  && !['meadow', 'desert', 'snow', 'mountain', 'dungeon', 'cave', 'boreal'].some((p) => [0, 1, 2, 3].some((d) => veinsFor(p, d).includes('starfall'))));
check('every ore is reachable somewhere', (() => {
  const seen = new Set();
  for (const p of ['ocean', 'beach', 'meadow', 'boreal', 'desert', 'sakura', 'mountain', 'snow', 'cave', 'dungeon', 'crater']) {
    for (let d = 0; d <= 3; d++) for (const id of veinsFor(p, d)) seen.add(id);
  }
  return ORES.every((o) => seen.has(o.id));
})());

// --- the vein itself ------------------------------------------------------
check('VEIN_BREAKS is [3, 8] and VEIN_REGROW_S is 600',
  VEIN_BREAKS[0] === 3 && VEIN_BREAKS[1] === 8 && VEIN_REGROW_S === 600);
{
  const rng = lcg(11);
  let lo = 99, hi = 0;
  for (let i = 0; i < 20000; i++) { const b = veinBreaks(rng); lo = Math.min(lo, b); hi = Math.max(hi, b); }
  check('a fresh vein holds 3 to 8 breaks, measured', lo === 3 && hi === 8, `20,000 veins: ${lo} to ${hi}`);
}

// --- gems, woods, leathers ------------------------------------------------
check('there are seven gems, each with its own affix', GEMS.length === 7 && new Set(GEMS.map((g) => g.affix)).size === 7,
  GEMS.map((g) => `${g.id}=${g.affix}`).join(' '));
check('the seven are the seven the document names',
  GEMS.map((g) => g.id).join(' ') === 'amber jade garnet sapphire ruby diamond starstone');
check('there are four woods at 0, 30, 60 and 85', WOODS.length === 4 && WOODS.map((w) => w.workAt).join() === '0,30,60,85',
  WOODS.map((w) => `${w.id} ${w.workAt}`).join(', '));
check('there are three leathers, ordered', LEATHERS.length === 3 && LEATHERS.map((l) => l.tier).join() === '1,2,3',
  LEATHERS.map((l) => l.id).join(' '));

// --- the documents --------------------------------------------------------
const doc = ['03-ITEMS-LOOT.md', '05-WORLD-CONTENT.md', '01-STATS-SKILLS.md']
  .map((f) => readFileSync(new URL(`../../docs/mmo/${f}`, import.meta.url), 'utf8')).join('\n').toLowerCase();
for (const [group, map] of Object.entries(DOC_REFS)) {
  const missing = Object.entries(map).filter(([, phrase]) => !doc.includes(phrase.toLowerCase()));
  check(`every ${group} id is a word in the documents`, missing.length === 0,
    missing.length ? missing.map(([id, p]) => `${id} ("${p}")`).join(', ') : `${Object.keys(map).length} checked`);
}
check('the doc check would fail on a word that is not there', !doc.includes('unobtainium'));
check('no em dash anywhere in these tables',
  !JSON.stringify([ORES, GEMS, WOODS, LEATHERS, ALLOYS]).includes('—'));

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
