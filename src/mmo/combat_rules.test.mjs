// The combat resolver, driven both ways. Run: node src/mmo/combat_rules.test.mjs
//
// Every number printed here was measured in this file, not asserted from the
// document. Where a bound is checked, the same measurement is taken somewhere
// the bound does not hold, so passing means something: a cap is proved by a
// value under it as well as a value over it, a gate by a case it refuses as
// well as a case it lets through.
import {
  swingSeconds, swingStaminaCost, attackSkill, defenceSkill,
  hitChance, dodgeChance, parryChance, weaponRoll, critChance,
  damage, resistOf, resolveMelee, resolveSpell, spellResistance, spellCritChance,
  fallDamage, poisonTick, applyLeech,
  aggroCheck, aggroRadius, leashCheck, leashRadius, fleeCheck, FLEE_THRESHOLD,
  NUMBER_KINDS, UNARMED, DODGE_CAP, PARRY_CAP, HIT_MIN, HIT_MAX, RESIST_CAP,
} from './combat_rules.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const note = (s) => console.log(`  ..   ${s}`);

// A seeded generator, so every number below is the same number tomorrow.
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// A fixed sequence, for driving one exact swing. Counts its own draws.
function seq(values) {
  let i = 0;
  const f = () => { if (i >= values.length) throw new Error(`rng ran dry after ${i} draws`); return values[i++]; };
  f.draws = () => i;
  return f;
}

// --- fixtures ----------------------------------------------------------------
// Weapons and armour straight out of 03-ITEMS-LOOT.md.
const GREATSWORD = { skill: 'swordsmanship', minDamage: 16, maxDamage: 28, speed: 3.8, weight: 9, damageType: 'physical', ranged: false, reach: 2 };
const LONGSWORD = { skill: 'swordsmanship', minDamage: 9, maxDamage: 16, speed: 3.0, weight: 4, damageType: 'physical', ranged: false, reach: 2 };
const DAGGER = { skill: 'fencing', minDamage: 3, maxDamage: 8, speed: 2.0, weight: 1, damageType: 'physical', ranged: false, reach: 1.5 };
const SHORTBOW = { skill: 'archery', minDamage: 7, maxDamage: 13, speed: 2.8, weight: 3, damageType: 'physical', ranged: true, reach: 25 };
const KITE = { parryFactor: 0.9 };
const LEATHER_AR = 3 * 7 + 6;                 // eight pieces, chest counts twice: 27

const blankStats = () => ({ str: 0, dex: 0, int: 0, con: 0, wis: 0 });
const blankSkills = () => ({
  swordsmanship: 0, macefighting: 0, fencing: 0, wrestling: 0, polearms: 0,
  archery: 0, marksmanship: 0, tactics: 0, anatomy: 0, parrying: 0,
  magery: 0, evaluatingIntelligence: 0, resistingSpells: 0, focus: 0,
});
const blankBonuses = () => ({
  hit: 0, defence: 0, dodge: 0, damagePct: 0, critChance: 0, critDamage: 0,
  swingSpeed: 0, armourPiercing: 0, spellDamage: 0, lifeLeech: 0, manaLeech: 0,
});
function fighter(over = {}) {
  return {
    stats: { ...blankStats(), ...(over.stats || {}) },
    skills: { ...blankSkills(), ...(over.skills || {}) },
    bonuses: { ...blankBonuses(), ...(over.bonuses || {}) },
    ar: over.ar || 0,
    resists: { physical: 0, fire: 0, cold: 0, poison: 0, energy: 0, ...(over.resists || {}) },
    weapon: over.weapon !== undefined ? over.weapon : LONGSWORD,
    shield: over.shield !== undefined ? over.shield : null,
    health: over.health !== undefined ? over.health : 100,
    maxHealth: over.maxHealth !== undefined ? over.maxHealth : 100,
    mana: over.mana !== undefined ? over.mana : 50,
    maxMana: over.maxMana !== undefined ? over.maxMana : 50,
    stamina: over.stamina !== undefined ? over.stamina : 50,
    ...(over.difficulty !== undefined ? { difficulty: over.difficulty } : {}),
  };
}
// Two fighters with identical arithmetic on both sides of the hit formula:
// attack 60 + 40*0.25 = 70, defence 60*0.5 + 40*0.5 + 50*0.4 = 70.
const equal = () => fighter({ stats: { str: 50, dex: 50, con: 50 }, skills: { swordsmanship: 60, tactics: 40, parrying: 40 } });

// The Warrior opening of 04-CLASSES-ABILITIES, in the leather set of 03, at the
// 140 health the requirement names.
const warrior = () => fighter({
  stats: { str: 65, dex: 50, int: 25, con: 65, wis: 45 },
  skills: { swordsmanship: 50, tactics: 50, parrying: 40, anatomy: 30 },
  weapon: LONGSWORD, shield: KITE, ar: LEATHER_AR,
  resists: { cold: 8, poison: 8 },
  health: 140, maxHealth: 140,
});
// Giant Rat, 05-WORLD-CONTENT tier 1: hp 18, dmg 2 to 5, spd 2.0, AR 2, aggro 6.
const giantRat = () => fighter({
  stats: { str: 10, dex: 25, con: 10 },
  skills: { wrestling: 15, tactics: 15 },
  weapon: { skill: 'wrestling', minDamage: 2, maxDamage: 5, speed: 2.0, weight: 0, damageType: 'physical', ranged: false, reach: 1.5 },
  ar: 2, health: 18, maxHealth: 18, difficulty: 5,
});
const grandmaster = () => fighter({
  stats: { str: 100, dex: 50, con: 80 },
  skills: { swordsmanship: 100, tactics: 100, anatomy: 100 },
  weapon: GREATSWORD, health: 200, maxHealth: 200,
});

console.log('\nswing timer');
// --- 1. swingSeconds ---------------------------------------------------------
{
  const ls = fighter({ stats: { dex: 60 }, weapon: LONGSWORD });
  const dg = fighter({ stats: { dex: 90 }, weapon: DAGGER });
  check('a 3.0 s longsword at 60 DEX swings every 2.46 s', near(swingSeconds(ls), 2.46, 1e-12), `${swingSeconds(ls).toFixed(3)} s`);
  check('a 2.0 s dagger at 90 DEX swings every 1.46 s', near(swingSeconds(dg), 1.46, 1e-12), `${swingSeconds(dg).toFixed(3)} s`);

  // The floor bites, and is proved by a case just above it that does not floor.
  const fast = fighter({ stats: { dex: 100 }, weapon: DAGGER, bonuses: { swingSpeed: 0.5 } });
  const notQuite = fighter({ stats: { dex: 100 }, weapon: DAGGER, bonuses: { swingSpeed: 0.3 } });
  check('a 0.7 s swing floors at 0.9 s', swingSeconds(fast) === 0.9, `${swingSeconds(fast).toFixed(3)} s from a raw ${(2.0 * 0.7 * 0.5).toFixed(2)} s`);
  check('a 0.98 s swing is left alone by the floor', near(swingSeconds(notQuite), 0.98, 1e-12), `${swingSeconds(notQuite).toFixed(3)} s`);

  const tired = { ...ls, stamina: 0 };
  const barely = { ...ls, stamina: 1 };
  check('at zero stamina a swing takes twice as long', near(swingSeconds(tired), 4.92, 1e-12), `${swingSeconds(barely).toFixed(2)} s rested, ${swingSeconds(tired).toFixed(2)} s spent`);
  check('one stamina left is not slowed', near(swingSeconds(barely), 2.46, 1e-12));
  const flooredTired = { ...fast, stamina: 0 };
  check('the floor is applied before the stamina penalty', swingSeconds(flooredTired) === 1.8, `${swingSeconds(flooredTired)} s`);
  check('a swing costs the weapon weight in stamina', swingStaminaCost(ls) === 4 && swingStaminaCost(fighter({ weapon: GREATSWORD })) === 9, 'longsword 4, greatsword 9');
  check('an empty hand swings as UNARMED', swingSeconds(fighter({ weapon: null })) === UNARMED.speed, `${swingSeconds(fighter({ weapon: null }))} s`);
}

console.log('\nhit, dodge, parry');
// --- 2. hitChance, dodgeChance, parryChance ----------------------------------
{
  const a = equal(), d = equal();
  check('two equals compute 0.500 on paper', near(hitChance(a, d), 0.5), `attack ${attackSkill(a)}, defence ${defenceSkill(d)}, hit ${hitChance(a, d)}`);

  // 50 skill points of difference move the chance by 25 points, both ways.
  const stronger = fighter({ stats: { dex: 50 }, skills: { swordsmanship: 60, tactics: 40, parrying: 40 }, bonuses: { hit: 50 } });
  const tougher = fighter({ stats: { dex: 50 }, skills: { swordsmanship: 60, tactics: 40, parrying: 40 }, bonuses: { defence: 50 } });
  check('+50 skill points moves 0.50 to 0.75', near(hitChance(stronger, d), 0.75), `${hitChance(stronger, d)}`);
  check('-50 skill points moves 0.50 to 0.25', near(hitChance(a, tougher), 0.25), `${hitChance(a, tougher)}`);

  const hopeless = fighter({ bonuses: { hit: -200 } });
  const unstoppable = fighter({ bonuses: { hit: 200 } });
  check('hit chance clamps at 0.10', hitChance(hopeless, d) === HIT_MIN, `raw ${(0.5 + (attackSkill(hopeless) - defenceSkill(d)) * 0.005).toFixed(3)} became ${hitChance(hopeless, d)}`);
  check('hit chance clamps at 0.95', hitChance(unstoppable, d) === HIT_MAX, `raw ${(0.5 + (attackSkill(unstoppable) - defenceSkill(d)) * 0.005).toFixed(3)} became ${hitChance(unstoppable, d)}`);
  check('a value inside the clamps is not touched', near(hitChance(stronger, d), 0.75), 'the clamps are not simply pinning everything');
  check('a grandmaster hits a giant rat 95% of the time', hitChance(grandmaster(), giantRat()) === 0.95, `attack ${attackSkill(grandmaster())}, defence ${defenceSkill(giantRat())}`);
  check('a swing at zero stamina misses more', hitChance({ ...a, stamina: 0 }, d) === 0.4, `${hitChance(a, d)} rested, ${hitChance({ ...a, stamina: 0 }, d)} spent`);

  check('dodge is DEX * 0.002', near(dodgeChance(fighter({ stats: { dex: 100 } })), 0.20), `DEX 100 dodges ${dodgeChance(fighter({ stats: { dex: 100 } }))}`);
  check('dodge caps at 0.40', dodgeChance(fighter({ stats: { dex: 300 } })) === DODGE_CAP, `DEX 300 would be 0.600, capped to ${dodgeChance(fighter({ stats: { dex: 300 } }))}`);
  check('a dodge bonus is capped with it', dodgeChance(fighter({ stats: { dex: 100 }, bonuses: { dodge: 0.30 } })) === DODGE_CAP, '0.20 + 0.30 capped to 0.40');
  check('dodge does not go below 0', dodgeChance(fighter({ bonuses: { dodge: -1 } })) === 0);

  const noShield = fighter({ skills: { parrying: 100 }, shield: null });
  const buckler = fighter({ skills: { parrying: 100 }, shield: { parryFactor: 0.6 } });
  const tower = fighter({ skills: { parrying: 100 }, shield: { parryFactor: 1.2 } });
  check('no shield, no parry', parryChance(noShield) === 0);
  check('a buckler at 100 Parrying parries 0.24', near(parryChance(buckler), 0.24), `${parryChance(buckler)}`);
  check('parry caps at 0.45', parryChance(tower) === PARRY_CAP, `a tower shield would be 0.480, capped to ${parryChance(tower)}`);
}

// --- the 20,000 swing measurement -------------------------------------------
console.log('\ntwenty thousand swings between equals');
{
  const a = equal(), d = equal();
  const rng = mulberry32(20260904);
  let hits = 0, dodges = 0, parries = 0, landed = 0, crits = 0, dmg = 0;
  const N = 20000;
  for (let i = 0; i < N; i++) {
    const r = resolveMelee({ attacker: a, defender: d, now: 0, rng });
    if (r.hit) hits++;
    if (r.dodged) dodges++;
    if (r.parried) parries++;
    if (r.damage > 0) { landed++; dmg += r.damage; }
    if (r.crit) crits++;
  }
  const rate = hits / N;
  console.log(`  ..   ${N} swings: ${hits} hits, ${dodges} dodges, ${parries} parries, ${landed} landed, ${crits} crits, ${dmg} damage`);
  check('two equal fighters hit 50% within 1 point', Math.abs(rate - 0.5) < 0.01, `measured ${(rate * 100).toFixed(2)}%, off by ${((rate - 0.5) * 100).toFixed(2)} points`);
  check('the dodge rate matches DEX 50 (0.10) within 1 point', Math.abs(dodges / hits - 0.10) < 0.01, `measured ${(dodges / hits * 100).toFixed(2)}% of hits`);
  check('no parries without a shield', parries === 0, `${parries} in ${N} swings`);
  check('the crit rate matches the 5% base within 1 point', Math.abs(crits / landed - 0.05) < 0.01, `measured ${(crits / landed * 100).toFixed(2)}% of landed hits`);
}
console.log('\ntwenty thousand swings, fifty points apart');
{
  const a = equal();
  const weak = fighter({ stats: { dex: 50 }, skills: { swordsmanship: 60, tactics: 40, parrying: 40 }, bonuses: { defence: 50 } });
  const strong = fighter({ stats: { dex: 50 }, skills: { swordsmanship: 60, tactics: 40, parrying: 40 }, bonuses: { defence: -50 } });
  const run = (att, def) => {
    const rng = mulberry32(77);
    let h = 0; for (let i = 0; i < 20000; i++) if (resolveMelee({ attacker: att, defender: def, now: 0, rng }).hit) h++;
    return h / 20000;
  };
  const low = run(a, weak), high = run(a, strong);
  console.log(`  ..   against +50 defence: ${(low * 100).toFixed(2)}%   against -50 defence: ${(high * 100).toFixed(2)}%`);
  check('50 points of defence takes 25 points off the hit rate', Math.abs(low - 0.25) < 0.01, `${(low * 100).toFixed(2)}% measured against 25% expected`);
  check('50 points the other way adds 25 points', Math.abs(high - 0.75) < 0.01, `${(high * 100).toFixed(2)}% measured against 75% expected`);
  check('the gap between them is 50 points', Math.abs((high - low) - 0.5) < 0.02, `${((high - low) * 100).toFixed(2)} points apart`);
}

console.log('\ndamage');
// --- 3. damage ---------------------------------------------------------------
{
  const bare = (over) => fighter({ ...over, weapon: LONGSWORD });
  const target = fighter({ ar: 0 });

  const s60 = bare({ stats: { str: 60 } });
  const d60 = damage(s60, target, 10, {});
  check('60 STR with 0 tactics multiplies the weapon roll by 1.36', near(d60.raw / d60.roll, 1.36, 1e-12), `roll 10 became raw ${d60.raw}`);
  const s0 = bare({});
  check('0 STR multiplies by 1.00', near(damage(s0, target, 10).raw, 10), 'so the 1.36 came from the strength, not the floor');
  const tac = bare({ stats: { str: 60 }, skills: { tactics: 100, anatomy: 100 } });
  check('100 Tactics and 100 Anatomy carry it to 2.16', near(damage(tac, target, 10).raw / 10, 2.16, 1e-12), `raw ${damage(tac, target, 10).raw}`);

  const archer = bare({ stats: { str: 0, dex: 60 } }); archer.weapon = SHORTBOW;
  const archerNoDex = bare({ stats: { str: 60, dex: 0 } }); archerNoDex.weapon = SHORTBOW;
  check('a ranged weapon reads DEX for the same 1.36', near(damage(archer, target, 10).raw / 10, 1.36, 1e-12), `60 DEX archer: raw ${damage(archer, target, 10).raw}`);
  check('a ranged weapon ignores STR', near(damage(archerNoDex, target, 10).raw / 10, 1.00, 1e-12), '60 STR with a bow adds nothing');

  const pct = bare({ bonuses: { damagePct: 25 } });
  check('damagePct 25 is +25%', near(damage(pct, target, 10).raw / 10, 1.25, 1e-12), `raw ${damage(pct, target, 10).raw}`);

  // Armour. A flat 90 raw so the arithmetic is visible.
  const flat = bare({});
  const ar = (v, over = {}) => damage(flat, fighter({ ar: v, ...over }), 90);
  check('AR 0 takes nothing', ar(0).final === 90, `90 -> ${ar(0).final}`);
  check('AR 60 takes a third', ar(60).final === 60 && near(ar(60).reduction, 1 / 3, 1e-12), `90 -> ${ar(60).final} (reduction ${ar(60).reduction.toFixed(4)})`);
  check('AR 120 halves', ar(120).final === 45 && ar(120).reduction === 0.5, `90 -> ${ar(120).final}`);
  check('AR 240 takes two thirds', ar(240).final === 30 && near(ar(240).reduction, 2 / 3, 1e-12), `90 -> ${ar(240).final} (reduction ${ar(240).reduction.toFixed(4)})`);
  const piercer = bare({ bonuses: { armourPiercing: 50 } });
  check('50% armour piercing turns AR 240 into AR 120', damage(piercer, fighter({ ar: 240 }), 90).final === 45, `90 -> ${damage(piercer, fighter({ ar: 240 }), 90).final} against the ${ar(240).final} an unpierced swing does`);

  // Resists, in percent points, capped at 70.
  check('resist 50 is 50%', ar(0, { resists: { physical: 50 } }).final === 45, `90 -> ${ar(0, { resists: { physical: 50 } }).final}`);
  check('resist 70 is 70%', ar(0, { resists: { physical: 70 } }).final === 27, `90 -> ${ar(0, { resists: { physical: 70 } }).final}`);
  check('resist 90 is treated as 70', ar(0, { resists: { physical: 90 } }).final === 27, `90 -> ${ar(0, { resists: { physical: 90 } }).final}, identical to resist 70`);
  check('resistOf caps at 0.70', resistOf(fighter({ resists: { fire: 90 } }), 'fire') === RESIST_CAP / 100 && resistOf(fighter({ resists: { fire: 40 } }), 'fire') === 0.40, 'fire 90 -> 0.70, fire 40 -> 0.40');
  check('a resist only touches its own damage type', ar(0, { resists: { fire: 70 } }).final === 90, 'a fire resist does nothing against a sword');

  // The floor, proved with a case that is not floored.
  const tiny = damage(flat, fighter({ ar: 240, resists: { physical: 70 } }), 1);
  check('damage never falls below 1', tiny.final === 1, `a roll of 1 through AR 240 and resist 70 computes ${(tiny.landed * (1 - tiny.reduction) * (1 - tiny.resist)).toFixed(3)}, reported as ${tiny.final}`);
  check('a roll of 0 still costs 1', damage(flat, target, 0).final === 1);
  check('the floor is not clamping everything', ar(240).final === 30, 'the same pipeline reports 30 when there is 30 to report');

  // Crit.
  const noCrit = damage(flat, target, 10, { crit: false });
  const yesCrit = damage(flat, target, 10, { crit: true });
  check('a crit multiplies by 1.5', yesCrit.final === 15 && noCrit.final === 10 && yesCrit.critMult === 1.5, `${noCrit.final} became ${yesCrit.final}`);
  const heavy = bare({ bonuses: { critDamage: 0.5 } });
  check('critDamage adds to the 1.5', damage(heavy, target, 10, { crit: true }).critMult === 2.0, 'a +50% crit damage roll doubles instead');
  check('a crit is a yellow number', NUMBER_KINDS.crit.colour === '#ffd23a' && NUMBER_KINDS.crit.size === 1.5 && NUMBER_KINDS.damage.colour === '#ffffff', `crit ${NUMBER_KINDS.crit.colour} at ${NUMBER_KINDS.crit.size}, plain ${NUMBER_KINDS.damage.colour} at ${NUMBER_KINDS.damage.size}`);
  check('critChance is 0.05 plus the bonus', critChance(flat) === 0.05 && near(critChance(bare({ bonuses: { critChance: 0.10 } })), 0.15), '0.05 bare, 0.15 with +10 points');

  // The weapon roll spans its range and nothing outside it.
  const rng = mulberry32(5);
  let lo = 99, hi = 0;
  for (let i = 0; i < 5000; i++) { const r = weaponRoll(GREATSWORD, rng); if (r < lo) lo = r; if (r > hi) hi = r; }
  check('a greatsword rolls 16 to 28 and nothing else', lo === 16 && hi === 28, `5000 rolls spanned ${lo} to ${hi}`);
}

console.log('\none swing, start to finish');
// --- 4. resolveMelee ---------------------------------------------------------
{
  // Draw order: hit, dodge, parry, weapon roll, crit.
  const gm = grandmaster(), rat = giantRat();
  const r = seq([0.10, 0.90, 0.00, 0.90]);      // hits, is not dodged, min roll, no crit
  const one = resolveMelee({ attacker: gm, defender: rat, now: 1000, rng: r });
  console.log(`  ..   grandmaster (100 skill, 100 STR, greatsword) on a giant rat: ${one.damage} damage against 18 health, ${r.draws()} rng draws`);
  check('a grandmaster kills a giant rat in one hit', one.killed === true && one.defenderHealth === 0, `${one.damage} damage, rat left on ${one.defenderHealth}`);
  check('the minimum roll is enough on its own', one.detail.roll === 16 && one.damage >= 18, `min roll 16 became ${one.damage} through AR 2`);
  check('the rat is not mutated by dying', rat.health === 18, 'health is returned, not written');
  check('the kill announces itself', one.numbers.length === 1 && one.numbers[0].kind === 'damage' && one.numbers[0].text === String(one.damage), JSON.stringify(one.numbers[0]));

  // A miss, the other direction.
  const missed = resolveMelee({ attacker: gm, defender: rat, now: 0, rng: seq([0.99]) });
  check('a miss deals no damage and says so', missed.hit === false && missed.damage === 0 && missed.numbers[0].kind === 'miss', `"${missed.numbers[0].text}" over the defender, ${missed.numbers.length} number`);
  check('a miss still teaches the weapon skill', missed.lessons.some(l => l.skill === 'swordsmanship' && l.success === false), JSON.stringify(missed.lessons.find(l => l.skill === 'swordsmanship')));
  check('a miss teaches no Anatomy', !missed.lessons.some(l => l.skill === 'anatomy'), 'and a landed hit does: ' + one.lessons.some(l => l.skill === 'anatomy'));

  // A dodge.
  const nimble = fighter({ stats: { dex: 100 }, health: 100 });
  const dodge = resolveMelee({ attacker: gm, defender: nimble, now: 0, rng: seq([0.10, 0.05]) });
  check('a dodge takes no damage', dodge.hit === true && dodge.dodged === true && dodge.damage === 0 && dodge.defenderHealth === 100, `defender left on ${dodge.defenderHealth} of 100`);
  check('a dodge yields a DEX stat lesson', dodge.lessons.some(l => l.kind === 'stat' && l.stat === 'dex' && l.who === 'defender'), JSON.stringify(dodge.lessons.find(l => l.stat === 'dex')));
  check('a dodge shows the grey word', dodge.numbers[0].kind === 'dodge' && dodge.numbers[0].text === 'dodge' && NUMBER_KINDS.dodge.colour === '#9aa0a6', `${NUMBER_KINDS.dodge.colour} at ${NUMBER_KINDS.dodge.size}`);
  const notDodged = resolveMelee({ attacker: gm, defender: nimble, now: 0, rng: seq([0.10, 0.90, 0.5, 0.9]) });
  check('a swing that is not dodged yields no DEX lesson', !notDodged.lessons.some(l => l.stat === 'dex'), `${notDodged.damage} damage instead`);

  // A parry, and the Parrying lesson both ways.
  const shielded = fighter({ skills: { parrying: 100 }, shield: KITE, health: 100 });   // DEX 0, so no dodge roll is drawn
  const parried = resolveMelee({ attacker: gm, defender: shielded, now: 0, rng: seq([0.10, 0.10]) });
  check('a parry takes no damage', parried.parried === true && parried.damage === 0, `defender left on ${parried.defenderHealth} of 100`);
  check('a parry teaches Parrying', parried.lessons.some(l => l.who === 'defender' && l.skill === 'parrying' && l.success === true), JSON.stringify(parried.lessons.find(l => l.skill === 'parrying')));
  const failedParry = resolveMelee({ attacker: gm, defender: shielded, now: 0, rng: seq([0.10, 0.99, 0.5, 0.9]) });
  check('a failed parry teaches Parrying too', failedParry.parried === false && failedParry.lessons.some(l => l.skill === 'parrying' && l.success === false), `and took ${failedParry.damage} damage`);
  const shieldless = resolveMelee({ attacker: gm, defender: nimble, now: 0, rng: seq([0.10, 0.90, 0.5, 0.9]) });
  check('no shield means no Parrying lesson at all', !shieldless.lessons.some(l => l.skill === 'parrying'), 'the roll is not made, so nothing was learned from it');

  // A crit through the real resolver.
  // The dummy has DEX 0, so no dodge roll is drawn: hit, weapon roll, crit.
  const critter = resolveMelee({ attacker: gm, defender: fighter({ health: 500, maxHealth: 500 }), now: 0, rng: seq([0.10, 0.00, 0.01]) });
  const plain = resolveMelee({ attacker: gm, defender: fighter({ health: 500, maxHealth: 500 }), now: 0, rng: seq([0.10, 0.00, 0.99]) });
  check('a crit through the resolver multiplies the same swing by exactly 1.5', critter.crit === true && plain.crit === false && near(critter.detail.landed, plain.detail.landed * 1.5, 1e-9), `the same roll of ${plain.detail.roll}: ${plain.detail.landed.toFixed(2)} plain, ${critter.detail.landed.toFixed(2)} crit`);
  // Both ends are rounded once, so the two integers can sit 1 apart: 38.4 is
  // reported as 38 and 57.6 as 58, and 38 * 1.5 is 57.
  check('the reported damage follows, to the rounding', Math.abs(critter.damage - plain.damage * 1.5) <= 1 && critter.damage === Math.round(plain.detail.landed * 1.5), `${plain.damage} plain, ${critter.damage} crit, from ${plain.detail.landed} and ${critter.detail.landed}`);
  check('a crit is reported as the yellow kind', critter.numbers[0].kind === 'crit' && plain.numbers[0].kind === 'damage', `${plain.numbers[0].kind} against ${critter.numbers[0].kind}`);

  // The swing timer comes back with the result.
  const timed = resolveMelee({ attacker: gm, defender: rat, now: 5000, rng: seq([0.99]) });
  check('the result carries the next swing time', near(timed.swingSeconds, 3.8 * (1 - 0.15)) && timed.nextSwingAt === 5000 + timed.swingSeconds * 1000, `${timed.swingSeconds.toFixed(2)} s, next at ${timed.nextSwingAt}`);

  // Every kind the resolver can emit is in the table the renderer reads.
  const kinds = new Set();
  for (const res of [one, missed, dodge, parried, critter]) for (const n of res.numbers) kinds.add(n.kind);
  check('every floating number kind emitted is in the table', [...kinds].every(k => k in NUMBER_KINDS), [...kinds].join(', '));

  // An rng is not optional.
  let threw = false;
  try { resolveMelee({ attacker: gm, defender: rat, now: 0 }); } catch { threw = true; }
  check('a resolve without an rng throws rather than reaching for Math.random', threw === true);
}

console.log('\nthe resolver mutates nothing');
{
  const a = grandmaster(), d = warrior();
  const beforeA = JSON.stringify(a), beforeD = JSON.stringify(d);
  const rng = mulberry32(3);
  for (let i = 0; i < 500; i++) resolveMelee({ attacker: a, defender: d, now: i * 1000, rng });
  const spell = resolveSpell({ caster: a, target: d, spell: { base: [18, 26], damageType: 'fire' }, rng });
  applyLeech(spell, a);
  check('the attacker is byte for byte what it was', JSON.stringify(a) === beforeA, `${beforeA.length} characters, unchanged after 500 swings and a spell`);
  check('the defender is byte for byte what it was', JSON.stringify(d) === beforeD, `still ${d.health} health after taking ${500} swings`);
  check('the swings were real, not skipped', spell.damage > 0, `the spell in the same batch did ${spell.damage}`);
}

console.log('\na rat against a warrior');
// The other half of "a grandmaster kills a rat in one hit".
{
  const rng = mulberry32(20260904);
  const FIGHTS = 2000;
  let swings = 0, landed = 0, total = 0;
  for (let f = 0; f < FIGHTS; f++) {
    const rat = giantRat();
    let hp = 140;
    const w = warrior();
    while (hp > 0) {
      const r = resolveMelee({ attacker: rat, defender: { ...w, health: hp }, now: 0, rng });
      swings++;
      if (r.damage > 0) { landed++; total += r.damage; hp = r.defenderHealth; }
      if (swings > FIGHTS * 4000) break;
    }
  }
  const perFight = swings / FIGHTS, hitsPerFight = landed / FIGHTS, perHit = total / landed;
  console.log(`  ..   ${FIGHTS} fights: ${perFight.toFixed(1)} swings and ${hitsPerFight.toFixed(1)} landed hits per kill, ${perHit.toFixed(2)} damage a hit`);
  check('a giant rat needs at least 30 landed hits to kill a 140 health warrior in leather', hitsPerFight >= 30, `measured ${hitsPerFight.toFixed(1)} hits (and ${perFight.toFixed(0)} swings)`);
  check('it does 2 to 5 a hit through leather, not more', perHit > 2 && perHit < 6, `${perHit.toFixed(2)} average`);
  check('the grandmaster needs one and the rat needs a hundred', hitsPerFight > 30 && resolveMelee({ attacker: grandmaster(), defender: giantRat(), now: 0, rng: seq([0.1, 0.9, 0, 0.9]) }).killed, 'both directions of the same resolver');
}

console.log('\nspells');
// --- 5. resolveSpell ---------------------------------------------------------
{
  // The Mage opening: INT 70, Evaluating Intelligence 45. Fireball 18 to 26 fire.
  const mage = fighter({ stats: { int: 70, dex: 40, wis: 65 }, skills: { magery: 50, evaluatingIntelligence: 45 }, weapon: null });
  const dummy = fighter({ health: 200, maxHealth: 200, ar: 240 });
  const FIREBALL = { base: [18, 26], damageType: 'fire' };
  const s = resolveSpell({ caster: mage, target: dummy, spell: FIREBALL, rng: seq([0.0, 0.99]) });
  const expected = 18 * (1 + 70 * 0.008 + 45 * 0.006);
  check('the spell formula is base * (1 + INT*0.008 + Evaluating Intelligence*0.006 + spellDamage%)', near(s.raw, expected, 1e-12), `18 became ${s.raw.toFixed(3)} (x${(s.raw / 18).toFixed(3)})`);
  check('armour does not stop a spell', s.damage === Math.round(expected), `AR 240 target still took ${s.damage}`);
  const geared = { ...mage, bonuses: { ...mage.bonuses, spellDamage: 20 } };
  check('spellDamage is percent points', near(resolveSpell({ caster: geared, target: dummy, spell: FIREBALL, rng: seq([0.0, 0.99]) }).raw, 18 * (1 + 0.56 + 0.27 + 0.20), 1e-12), `+20% took it to ${resolveSpell({ caster: geared, target: dummy, spell: FIREBALL, rng: seq([0.0, 0.99]) }).raw.toFixed(2)}`);

  const resistant = fighter({ health: 200, maxHealth: 200, resists: { fire: 90 } });
  const rs = resolveSpell({ caster: mage, target: resistant, spell: FIREBALL, rng: seq([0.0, 0.99]) });
  const at70 = resolveSpell({ caster: mage, target: fighter({ health: 200, resists: { fire: 70 } }), spell: FIREBALL, rng: seq([0.0, 0.99]) });
  check('a fire resist of 90 is treated as 70 by a spell too', rs.damage === at70.damage && rs.damage === Math.round(expected * 0.3), `${s.damage} unresisted, ${rs.damage} at fire 90, ${at70.damage} at fire 70`);

  const monk = fighter({ health: 200, maxHealth: 200, skills: { resistingSpells: 100 } });
  const ms = resolveSpell({ caster: mage, target: monk, spell: FIREBALL, rng: seq([0.0, 0.99]) });
  check('100 Resisting Spells takes 30% off', ms.damage === Math.round(expected * 0.7) && near(spellResistance(monk), 0.3), `${s.damage} became ${ms.damage}`);
  check('Resisting Spells teaches when it did something', ms.lessons.some(l => l.who === 'defender' && l.skill === 'resistingSpells' && l.success === true), JSON.stringify(ms.lessons.find(l => l.skill === 'resistingSpells')));
  check('and teaches nothing when it did not', s.lessons.some(l => l.skill === 'resistingSpells' && l.success === false), 'a target with 0 skill learned nothing from being hit');

  const cs = resolveSpell({ caster: mage, target: dummy, spell: FIREBALL, rng: seq([0.0, 0.001]) });
  check('a spell crit is 1.5x and yellow', cs.crit === true && cs.damage === Math.round(expected * 1.5) && cs.numbers[0].kind === 'crit', `${s.damage} plain, ${cs.damage} crit`);
  check('INT raises spell crit chance', near(spellCritChance(mage), 0.05 + 70 * 0.0005) && spellCritChance(fighter({})) === 0.05, `INT 70 casts at ${(spellCritChance(mage) * 100).toFixed(1)}%, INT 0 at 5.0%`);
  check('a spell kills when it should', resolveSpell({ caster: mage, target: fighter({ health: 10, maxHealth: 10 }), spell: FIREBALL, rng: seq([0.0, 0.99]) }).killed === true && s.killed === false, `10 health died, 200 health did not`);
  check('the target is not mutated', dummy.health === 200, `still ${dummy.health}`);
  check('a spell needs an rng', (() => { try { resolveSpell({ caster: mage, target: dummy, spell: FIREBALL }); return false; } catch { return true; } })());
}

console.log('\nfalling, poison, leech');
// --- 6. fallDamage, poisonTick, applyLeech -----------------------------------
{
  check('a 4 m drop is free', fallDamage(4) === 0, `${fallDamage(4)}`);
  check('a 3 m drop is free', fallDamage(3) === 0);
  check('a 5 m drop is not free', fallDamage(5) === 6, `${fallDamage(5)}`);
  check('10 m costs 36', fallDamage(10) === 36, `${fallDamage(10)}`);
  check('28 m kills a 140 health character', fallDamage(28) >= 140, `${fallDamage(28)} against 140 health`);
  check('27 m does not', fallDamage(27) < 140, `${fallDamage(27)} against 140 health`);
  check('a fall is an orange number', NUMBER_KINDS.fall.colour === '#ff9a2e' && NUMBER_KINDS.fall.size === 1.2, `${NUMBER_KINDS.fall.colour} at ${NUMBER_KINDS.fall.size}`);
  note(`02-COMBAT says 25 m "kills a fresh character outright"; the formula it gives does ${fallDamage(25)}, which a 140 health warrior survives. The formula is what is implemented.`);

  const p3 = poisonTick(3);
  check('poison level 3 is 6 a second for 18 s', p3.perSecond === 6 && p3.seconds === 18, JSON.stringify(p3));
  check('poison level 1 is 2 a second for 6 s', poisonTick(1).perSecond === 2 && poisonTick(1).seconds === 6);
  check('no poison is no damage', poisonTick(0).perSecond === 0 && poisonTick(0).seconds === 0);

  const leecher = fighter({ bonuses: { lifeLeech: 10, manaLeech: 25 }, health: 50, maxHealth: 100, mana: 0, maxMana: 50 });
  const hit = { damage: 40 };
  const l = applyLeech(hit, leecher);
  check('10% life leech off 40 damage heals 4', l.healed === 4, `${l.healed} health`);
  check('25% mana leech off 40 damage gives 10', l.mana === 10, `${l.mana} mana`);
  check('leech shows a green number', l.numbers.length === 1 && l.numbers[0].kind === 'heal' && NUMBER_KINDS.heal.colour === '#4ade4a', JSON.stringify(l.numbers[0]));
  const full = applyLeech(hit, { ...leecher, health: 100 });
  check('leech into a full health bar heals nothing and claims nothing', full.healed === 0 && full.numbers.length === 0, 'no green number over a full bar');
  const missResult = applyLeech({ damage: 0 }, leecher);
  check('a miss leeches nothing', missResult.healed === 0 && missResult.mana === 0);
  check('no leech properties, no leech', applyLeech(hit, fighter({})).healed === 0);
}

console.log('\nmonsters: aggro, leash, flee');
// --- 7. aggroCheck, leashCheck, fleeCheck ------------------------------------
{
  const at = (x) => ({ x, y: 0, z: 0 });
  const mob = (over) => ({ pos: at(0), health: 30, maxHealth: 30, ...over });

  check('a monster with no temperament uses 12 m', aggroRadius(mob({})) === 12, `${aggroRadius(mob({}))} m`);
  const vermin = mob({ temperament: 'vermin' });
  check('vermin aggro at 6 m', aggroRadius(vermin) === 6);
  check('a hunter at 18 m and a boss at 25 m', aggroRadius(mob({ temperament: 'hunter' })) === 18 && aggroRadius(mob({ temperament: 'boss' })) === 25);
  check('vermin comes at 5.9 m', aggroCheck(vermin, at(5.9)) === true);
  check('vermin does not come at 6.1 m', aggroCheck(vermin, at(6.1)) === false);
  check('a normal monster comes at 11.9 m and not at 12.1 m', aggroCheck(mob({}), at(11.9)) === true && aggroCheck(mob({}), at(12.1)) === false);
  check('a critter never comes, even underfoot', aggroCheck(mob({ temperament: 'critter' }), at(0)) === false, 'radius 0');
  check('a dead thing does not aggro', aggroCheck(mob({ health: 0 }), at(1)) === false);
  check('a record with its own radius wins', aggroRadius(mob({ temperament: 'vermin', aggro: 20 })) === 20 && aggroCheck(mob({ temperament: 'vermin', aggro: 20 }), at(19)) === true, 'a monster table can override the temperament');
  check('aggro is measured in three dimensions', aggroCheck(mob({}), { x: 0, y: 20, z: 0 }) === false, 'a player 20 m above is out of reach');

  const home = at(0);
  const hunter = mob({ temperament: 'hunter' });        // aggro 18, leash 45
  check('the leash is 2.5x the aggro radius', leashRadius(hunter) === 45 && leashRadius(vermin) === 15, `hunter ${leashRadius(hunter)} m, vermin ${leashRadius(vermin)} m`);
  const inside = leashCheck(hunter, home, at(44), 1000);
  check('inside the leash nothing starts', inside.beyond === false && inside.broken === false && inside.leashSince === null, `44 m of ${inside.leash}`);
  const stepOut = leashCheck(hunter, home, at(46), 1000);
  check('stepping outside starts the clock and does not break aggro', stepOut.beyond === true && stepOut.broken === false && stepOut.leashSince === 1000, `46 m of ${stepOut.leash}, clock started at ${stepOut.leashSince}`);
  const ticking = { ...hunter, leashSince: 1000 };
  const almost = leashCheck(ticking, home, at(46), 6999);
  const broken = leashCheck(ticking, home, at(46), 7000);
  check('aggro holds at 5.999 s past the leash', almost.broken === false, `${(almost.elapsed / 1000).toFixed(3)} s elapsed`);
  check('aggro breaks at 6.000 s past the leash', broken.broken === true, `${(broken.elapsed / 1000).toFixed(3)} s elapsed`);
  const cameBack = leashCheck(ticking, home, at(10), 7000);
  check('coming back inside clears the clock', cameBack.beyond === false && cameBack.broken === false && cameBack.leashSince === null, 'the monster stays angry');
  check('leashCheck writes nothing back', ticking.leashSince === 1000);

  const rabbit = { family: 'critter', health: 8, maxHealth: 8 };
  check('a critter at full health stands', fleeCheck(rabbit) === false);
  check('a critter flees at 1 damage', fleeCheck({ ...rabbit, health: 7 }) === true, '7 of 8');
  const rat = { family: 'vermin', health: 100, maxHealth: 100 };
  check('vermin at 16% stands', fleeCheck({ ...rat, health: 16 }) === false, '16 of 100');
  check('vermin at 14% flees', fleeCheck({ ...rat, health: 14 }) === true, '14 of 100');
  check('and the threshold is 15%, so a wounded thing fights on longer than it used to', FLEE_THRESHOLD === 0.15);
  check('a beast at 14% flees', fleeCheck({ family: 'beast', health: 14, maxHealth: 100 }) === true);
  check('undead never flees, not at 1 health', fleeCheck({ family: 'undead', health: 1, maxHealth: 100 }) === false, '1 of 100');
  check('a construct never flees either', fleeCheck({ family: 'construct', health: 1, maxHealth: 100 }) === false);
  check('a dead thing does not flee', fleeCheck({ family: 'vermin', health: 0, maxHealth: 100 }) === false);
  check('an unlisted family uses the same rule', fleeCheck({ family: 'humanoid', health: 10, maxHealth: 100 }) === true && fleeCheck({ family: 'humanoid', health: 20, maxHealth: 100 }) === false, '10 of 100 flees, 20 does not');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
