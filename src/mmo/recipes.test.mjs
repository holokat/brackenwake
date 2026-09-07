// Crafting, driven both ways. Run: node src/mmo/recipes.test.mjs
//
// Every number printed here was measured in this file. Rarity and quality are
// sampled over enough rolls that the printed rate is worth reading.
import { readFileSync } from 'node:fs';
import {
  RECIPES, RECIPE, RARITY, RARITY_IDS, STATIONS, SPELLS, MATERIALS, SKILL_IDS, DOC_REFS,
  MIN_CRAFT_CHANCE, MAX_CRAFT_CHANCE, MIN_QUALITY, MAX_QUALITY, EXCEPTIONAL_QUALITY, EXCEPTIONAL_MARGIN,
  DIFF_MIN, DIFF_MAX, MATERIAL_WEIGHT, WEAPON_METALS, SMITH_METALS,
  craftChance, craftQuality, exceptional, craftedRarity, difficultyFor,
  recipesFor, recipesOfFamily, scrollFor, auditRecipes,
} from './recipes.js';
import { METALS, WOODS } from './ores.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };
const lcg = (seed) => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
const throws = (fn) => { try { fn(); return false; } catch { return true; } };
const pct = (n, of) => `${((n / of) * 100).toFixed(3)}%`;

console.log('recipes.js');

// --- the audit, both directions -------------------------------------------
const shape = auditRecipes();
check('auditRecipes passes on the real table', true, `${shape.recipes} recipes: ${JSON.stringify(shape.byFamily)}`);

const plants = [
  ['a duplicate id', { ...RECIPE['weapon.longsword.iron'] }],
  ['a skill that is not a skill', { ...RECIPE['weapon.longsword.iron'], id: 'p1', skill: 'blacksmithery' }],
  ['a station that is not one of the seven', { ...RECIPE['weapon.longsword.iron'], id: 'p2', station: 'anvilShed' }],
  ['a material that does not exist', { ...RECIPE['weapon.longsword.iron'], id: 'p3', materials: { adamantium: 2 } }],
  ['a difficulty off the scale', { ...RECIPE['weapon.longsword.iron'], id: 'p4', difficulty: 400 }],
  ['a difficulty that does not follow the one rule', { ...RECIPE['weapon.longsword.iron'], id: 'p5', difficulty: 27 }],
  ['a recipe that costs nothing', { ...RECIPE['weapon.longsword.iron'], id: 'p6', materials: {} }],
  ['an em dash in a name', { ...RECIPE['weapon.longsword.iron'], id: 'p7', name: 'Iron Longsword — the good one' }],
];
for (const [what, row] of plants) {
  RECIPES.push(row);
  const caught = throws(auditRecipes);
  RECIPES.pop();
  check(`auditRecipes rejects ${what}`, caught);
}
{
  // Difficulty running the wrong way up the material ladder is the failure the
  // whole rule exists to prevent, so prove the audit sees it.
  const r = RECIPE['weapon.longsword.starfall'];
  const keepD = r.difficulty, keepB = r.recipeBase;
  r.recipeBase = 1; r.difficulty = difficultyFor(1, r.materialTier);
  const caught = throws(auditRecipes);
  r.difficulty = keepD; r.recipeBase = keepB;
  check('auditRecipes rejects difficulty falling as material tier rises', caught);
}
check('auditRecipes passes again once the plants are pulled', !throws(auditRecipes));

// --- the families ---------------------------------------------------------
check('every recipe id is unique', new Set(RECIPES.map((r) => r.id)).size === RECIPES.length, `${RECIPES.length} recipes`);
check('every weapon is made in all ten metals', (() => {
  const weapons = new Set(recipesOfFamily('weapon').map((r) => r.result.base));
  return [...weapons].every((b) => WEAPON_METALS.every((m) => RECIPE[`weapon.${b}.${m}`]));
})(), `${new Set(recipesOfFamily('weapon').map((r) => r.result.base)).size} weapons x ${WEAPON_METALS.length} metals = ${recipesOfFamily('weapon').length}`);
check('copper and tin become bronze, and bronze is a material tier 2 weapon', (() => {
  const r = RECIPE['weapon.longsword.bronze'];
  return r && r.materials.copper > 0 && r.materials.tin > 0 && r.materialTier === 2;
})(), JSON.stringify(RECIPE['weapon.longsword.bronze'].materials));
check('iron and above each get their own weapon', (() => (
  METALS.filter((m) => m.tier >= 3).every((m) => RECIPE[`weapon.longsword.${m.id}`])
))());
check('mail and plate take ingots of iron and above, and nothing softer',
  SMITH_METALS.length === 8 && !SMITH_METALS.includes('copper') && !SMITH_METALS.includes('bronze'),
  SMITH_METALS.join(' '));
check('every armour tier has all eight pieces in every material it takes', (() => {
  const byTier = {};
  for (const r of recipesOfFamily('armour')) {
    byTier[r.armourTier] = byTier[r.armourTier] || new Set();
    byTier[r.armourTier].add(`${r.slot}:${r.result.material}`);
  }
  const want = { cloth: 8, leather: 8, studded: 8, ring: 64, chain: 64, plate: 64 };
  return Object.entries(want).every(([t, n]) => byTier[t] && byTier[t].size === n);
})(), recipesOfFamily('armour').length + ' armour recipes');
check('bows and staves come in all four woods', (() => (
  ['shortbow', 'longbow', 'crossbow', 'quarterstaff'].every((b) => WOODS.every((w) => RECIPE[`bow.${b}.${w.id}`]))
))());
check('there are four shields in eight metals', recipesOfFamily('shield').length === 32, `${recipesOfFamily('shield').length}`);
check('there are eight potions', recipesOfFamily('potion').length === 8, recipesOfFamily('potion').map((r) => r.result.base).join(' '));
check('there are six meals, each with a stat buff', recipesOfFamily('meal').length === 6
  && recipesOfFamily('meal').every((r) => r.buff && Object.keys(r.buff).length > 0),
  recipesOfFamily('meal').map((r) => `${r.result.base}(${Object.keys(r.buff)[0]})`).join(' '));
check('there are seven tools', recipesOfFamily('tool').length === 7, recipesOfFamily('tool').map((r) => r.result.base).join(' '));
check('there are four bags at 4, 8, 12 and 16 slots',
  recipesOfFamily('bag').map((r) => r.slots).join() === '4,8,12,16');
check('every spell has a scroll and no passive does', recipesOfFamily('scroll').length === SPELLS.length,
  `${SPELLS.length} spells, ${recipesOfFamily('scroll').length} scrolls`);
check('scrollFor returns nothing for a spell that does not exist', scrollFor('arcaneMastery') === null && scrollFor('nonsense') === null);
check('scrollFor builds the same recipe the table holds', (() => {
  const a = scrollFor('meteor'), b = RECIPE['scroll.meteor'];
  return a && b && a.difficulty === b.difficulty && a.skill === b.skill && a.station === b.station;
})(), `Meteor scroll difficulty ${RECIPE['scroll.meteor'].difficulty}`);
check('a harder spell writes a harder scroll',
  RECIPE['scroll.magicArrow'].difficulty < RECIPE['scroll.fireball'].difficulty
  && RECIPE['scroll.fireball'].difficulty < RECIPE['scroll.meteor'].difficulty,
  `magic arrow ${RECIPE['scroll.magicArrow'].difficulty}, fireball ${RECIPE['scroll.fireball'].difficulty}, meteor ${RECIPE['scroll.meteor'].difficulty}`);
check('all seven stations make something', STATIONS.every((s) => RECIPES.some((r) => r.station === s.id)),
  STATIONS.map((s) => `${s.id}:${RECIPES.filter((r) => r.station === s.id).length}`).join(' '));

// --- difficulty -----------------------------------------------------------
{
  const ls = METALS.map((m) => RECIPE[`weapon.longsword.${m.id}`]).sort((a, b) => a.materialTier - b.materialTier);
  let strict = true;
  for (let i = 1; i < ls.length; i++) if (!(ls[i].difficulty > ls[i - 1].difficulty)) strict = false;
  check('longsword difficulty rises strictly with material tier', strict,
    ls.map((r) => `${r.result.material} ${r.difficulty}`).join(', '));
  check('it rises by exactly MATERIAL_WEIGHT a tier', ls.every((r, i) => i === 0 || r.difficulty - ls[i - 1].difficulty === MATERIAL_WEIGHT),
    `${MATERIAL_WEIGHT} per tier`);
}
check('no base anywhere gets easier as its material gets rarer', (() => {
  const groups = new Map();
  for (const r of RECIPES) {
    const k = `${r.family}:${r.result.base}:${r.spell || ''}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  for (const list of groups.values()) {
    const s = [...list].sort((a, b) => a.materialTier - b.materialTier);
    for (let i = 1; i < s.length; i++) if (s[i].difficulty < s[i - 1].difficulty) return false;
  }
  return true;
})());
check('difficulty stays on the 1 to 95 scale', RECIPES.every((r) => r.difficulty >= DIFF_MIN && r.difficulty <= DIFF_MAX),
  `min ${Math.min(...RECIPES.map((r) => r.difficulty))}, max ${Math.max(...RECIPES.map((r) => r.difficulty))}`);
check('the difficulty rule clamps rather than running away',
  difficultyFor(90, 10) === DIFF_MAX && difficultyFor(-50, 1) === DIFF_MIN,
  `base 90 at tier 10 -> ${difficultyFor(90, 10)}, base -50 at tier 1 -> ${difficultyFor(-50, 1)}`);

// --- craftChance ----------------------------------------------------------
check('craftChance is 0.5 when skill equals difficulty', craftChance(50, 50) === 0.5);
check('craftChance clamps at the top', craftChance(100, 0) === MAX_CRAFT_CHANCE && craftChance(1000, 0) === MAX_CRAFT_CHANCE,
  `skill 100 vs difficulty 0: ${craftChance(100, 0)}`);
check('craftChance clamps at the bottom', craftChance(0, 100) === MIN_CRAFT_CHANCE && craftChance(0, 1000) === MIN_CRAFT_CHANCE,
  `skill 0 vs difficulty 100: ${craftChance(0, 100)}`);
check('the top clamp bites at exactly 48 points over', craftChance(48, 0) === MAX_CRAFT_CHANCE && craftChance(47, 0) < MAX_CRAFT_CHANCE,
  `47 over: ${craftChance(47, 0).toFixed(2)}, 48 over: ${craftChance(48, 0)}`);
check('the bottom clamp bites at exactly 45 points under', craftChance(0, 45) === MIN_CRAFT_CHANCE && craftChance(0, 44) > MIN_CRAFT_CHANCE,
  `44 under: ${craftChance(0, 44).toFixed(2)}, 45 under: ${craftChance(0, 45)}`);

// --- craftQuality and exceptional -----------------------------------------
{
  const rng = lcg(31337);
  const sample = (skill, diff, n = 50000) => {
    let lo = 9, hi = -9, exc = 0;
    for (let i = 0; i < n; i++) {
      const q = craftQuality(skill, diff, rng);
      lo = Math.min(lo, q); hi = Math.max(hi, q);
      if (exceptional(q, skill, diff)) exc++;
    }
    return { lo, hi, exc, n };
  };
  const even = sample(50, 50);
  check('quality at level pegging runs 0.7 to 1.1, averaging 0.9', Math.abs(even.lo - 0.7) < 0.01 && Math.abs(even.hi - 1.1) < 0.01,
    `50,000 rolls at skill 50 vs difficulty 50: ${even.lo.toFixed(3)} to ${even.hi.toFixed(3)}`);
  check('quality never leaves 0.5 to 1.3', (() => {
    const wild = sample(100, 0, 20000);
    const awful = sample(0, 100, 20000);
    return wild.hi <= MAX_QUALITY && awful.lo >= MIN_QUALITY;
  })(), `clamps ${MIN_QUALITY} to ${MAX_QUALITY}`);

  // The document's three fractions, measured rather than repeated: one in
  // eight at 20 over, three in eight at 40 over, three in four at 70 over.
  const at20 = sample(70, 50), at40 = sample(90, 50), at70 = sample(100, 30);
  const within = (got, want) => Math.abs(got / 50000 - want) < 0.01;
  check('exceptional at 20 over is one roll in eight', within(at20.exc, 0.125),
    `${at20.exc} of 50,000 = ${pct(at20.exc, 50000)}`);
  check('at 40 over, three in eight', within(at40.exc, 0.375), `${at40.exc} of 50,000 = ${pct(at40.exc, 50000)}`);
  check('at 70 over, three in four', within(at70.exc, 0.75), `${at70.exc} of 50,000 = ${pct(at70.exc, 50000)}`);
  // And under the margin the curve alone would allow it, so the gate is doing work.
  const at19 = sample(69, 50);
  check('at 19 over nothing is exceptional, though the curve can pass 1.15', at19.exc === 0 && at19.hi > EXCEPTIONAL_QUALITY,
    `19 over: top quality ${at19.hi.toFixed(3)}, ${at19.exc} exceptional`);
  // A grandmaster and the hardest recipe in the book.
  const starfallGreatsword = RECIPE['weapon.greatsword.starfall'];
  const top = sample(100, starfallGreatsword.difficulty, 20000);
  check('a grandmaster cannot sign a starfall greatsword: the margin is under 20', top.exc === 0 && 100 - starfallGreatsword.difficulty < EXCEPTIONAL_MARGIN,
    `difficulty ${starfallGreatsword.difficulty}, margin ${100 - starfallGreatsword.difficulty}, top quality ${top.hi.toFixed(3)}`);
  check('the margin gate also blocks, on its own',
    exceptional(1.29, 50, 45) === false && exceptional(1.29, 50, 30) === true,
    `margin is ${EXCEPTIONAL_MARGIN}: 5 over blocked, 20 over allowed`);
  check('the quality gate blocks, on its own', exceptional(1.15, 100, 0) === false && exceptional(1.1500001, 100, 0) === true);
}

// --- craftedRarity --------------------------------------------------------
check('the six crafted chances are the document column',
  RARITY.map((r) => r.craftedPct).join() === '60,25,10,4,0.9,0.1');
{
  const rng = lcg(20260904);
  const N = 200000;
  const tally = (skill, exc, opts) => {
    const t = Object.fromEntries(RARITY_IDS.map((id) => [id, 0]));
    for (let i = 0; i < N; i++) t[craftedRarity(skill, exc, rng, opts)]++;
    return t;
  };

  const gm = tally(100, false, {});
  check('at skill 100 without exceptional the column comes back as written',
    Math.abs(gm.common / N - 0.60) < 0.005 && Math.abs(gm.uncommon / N - 0.25) < 0.005
    && Math.abs(gm.rare / N - 0.10) < 0.004 && Math.abs(gm.epic / N - 0.04) < 0.003,
    `common ${pct(gm.common, N)}, uncommon ${pct(gm.uncommon, N)}, rare ${pct(gm.rare, N)}, epic ${pct(gm.epic, N)}, mythic ${pct(gm.mythic, N)}, legendary ${pct(gm.legendary, N)}`);

  const exc = tally(100, true, {});
  check('at skill 100 with exceptional, 10,000 rolls turn up purples',
    exc.epic > 0 && (exc.epic / N) * 10000 >= 1,
    `${exc.epic} epics in ${N} rolls, which is ${((exc.epic / N) * 10000).toFixed(0)} in 10,000`);
  check('legendary never runs above 0.3% with exceptional', exc.legendary / N <= 0.003,
    `${exc.legendary} legendary in ${N} = ${pct(exc.legendary, N)}, ceiling 0.300%`);
  check('legendary is impossible without starfall in the hand', exc.legendary === 0,
    `${exc.legendary} legendary from ${N} exceptional non starfall rolls`);

  const star = tally(100, true, { material: 'starfall' });
  check('starfall and exceptional together do reach legendary, and stay under 0.3%',
    star.legendary > 0 && star.legendary / N <= 0.003,
    `${star.legendary} legendary in ${N} = ${pct(star.legendary, N)}`);
  check('starfall alone, without exceptional, does not', (() => {
    const s = tally(100, false, { material: 'starfall' });
    return s.legendary === 0;
  })());

  const novice = tally(0, false, {});
  check('at skill 0 everything is common', novice.common === N, `${novice.common} of ${N}`);
  const half = tally(50, false, {});
  check('at skill 50 the rare bands are halved', Math.abs(half.uncommon / N - 0.125) < 0.005,
    `uncommon ${pct(half.uncommon, N)}, expected 12.5%`);
}

// --- recipesFor -----------------------------------------------------------
{
  const none = recipesFor('blacksmithing', 0);
  const some = recipesFor('blacksmithing', 50);
  const all = recipesFor('blacksmithing', 100);
  check('what you can attempt grows with skill', none.length < some.length && some.length < all.length,
    `blacksmithing at 0: ${none.length}, at 50: ${some.length}, at 100: ${all.length} of ${RECIPES.filter((r) => r.skill === 'blacksmithing').length}`);
  check('nothing on the list is under the 5% floor', all.every((r) => craftChance(100, r.difficulty) > MIN_CRAFT_CHANCE));
  check('what is left off the list is genuinely out of reach', (() => {
    const on = new Set(none.map((r) => r.id));
    return RECIPES.filter((r) => r.skill === 'blacksmithing' && !on.has(r.id))
      .every((r) => craftChance(0, r.difficulty) <= MIN_CRAFT_CHANCE);
  })());
  check('the list comes back easiest first', all.every((r, i) => i === 0 || r.difficulty >= all[i - 1].difficulty));
  check('a skill nobody crafts with returns nothing', recipesFor('swordsmanship', 100).length === 0);
  check('a novice smith can still attempt a copper dagger', none.some((r) => r.id === 'weapon.dagger.copper'),
    `copper dagger difficulty ${RECIPE['weapon.dagger.copper'].difficulty}`);
}

// --- the documents --------------------------------------------------------
const doc = ['01-STATS-SKILLS.md', '03-ITEMS-LOOT.md', '04-CLASSES-ABILITIES.md', '05-WORLD-CONTENT.md', '06-ECONOMY-UI.md']
  .map((f) => readFileSync(new URL(`../../docs/mmo/${f}`, import.meta.url), 'utf8')).join('\n').toLowerCase();
for (const [group, map] of Object.entries(DOC_REFS)) {
  const missing = Object.entries(map).filter(([, phrase]) => !doc.includes(String(phrase).toLowerCase()));
  check(`every ${group} id is a word in the documents`, missing.length === 0,
    missing.length ? missing.map(([id, p]) => `${id} ("${p}")`).join(', ') : `${Object.keys(map).length} checked`);
}
check('the doc check would fail on a word that is not there', !doc.includes('adamantium'));
check('every material a recipe asks for is a declared material',
  RECIPES.every((r) => Object.keys(r.materials).every((m) => MATERIALS[m])));
check('no em dash anywhere in these recipes', !RECIPES.some((r) => r.name.includes('—')));

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
