// The five stats, driven both ways. Run: node src/mmo/stats.test.mjs
//
// Every number printed here was measured in this file. Where a bound is
// asserted, the case that ought to fail it is measured too, so passing means
// something. The document's own formula lines are read off disk and compared
// with the transliteration in stats.js, so a doc edit that changes a constant
// cannot pass unnoticed.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  STATS, STAT_START_TOTAL, STAT_CAP, STAT_TOTAL_CAP, STAT_MIN_AT_CREATION, STAT_GAIN,
  derived, statGainChance, rollStatGain, statTotal, validateSpread,
} from './stats.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
// mulberry32: a seeded rng, so every count below is reproducible.
const rngFrom = (seed) => () => {
  seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const DOC = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../docs/mmo/01-STATS-SKILLS.md'), 'utf8');

console.log('\n--- 1. the constants are the document\'s constants -------------------------');
check('the five stats, in the document\'s order', STATS.join(',') === 'str,dex,int,con,wis', STATS.join(', '));
check('starting total 250', STAT_START_TOTAL === 250);
check('per stat cap 100', STAT_CAP === 100);
check('total cap 400', STAT_TOTAL_CAP === 400);
check('a gain is exactly +1', STAT_GAIN === 1);
check('the document says 250, 100 and 400', DOC.includes('**Starting total 250**') && DOC.includes('cap 100') && DOC.includes('**Total cap 400**'));

console.log('\n--- 2. the formula lines on disk are the ones in the code ------------------');
// If any of these fails, the document changed a constant and stats.js has to be
// re-transliterated. Do not "fix" it by editing this list alone.
for (const line of [
  'statGainChance(stat) = clamp(0.06 * (1 - stat / 110), 0.002, 0.06)',
  'maxHealth  = 30 + CON * 2.0 + STR * 0.5',
  'maxMana    = 10 + WIS * 2.0 + INT * 0.5',
  'maxStamina = 20 + DEX * 1.5 + CON * 0.5',
  'carry      = 40 + STR * 2.0',
  'healthRegen  = 0.4 + CON * 0.020',
  'manaRegen    = 0.3 + WIS * 0.025 + Meditation * 0.010',
  'staminaRegen = 2.5 + DEX * 0.030',
]) check(`the document still reads "${line.replace(/\s+/g, ' ')}"`, DOC.includes(line));
// and the code agrees with that arithmetic across the whole range, not at one point
{
  let worst = 0;
  for (let v = 0; v <= 200; v += 0.5) {
    const want = Math.min(0.06, Math.max(0.002, 0.06 * (1 - v / 110)));
    worst = Math.max(worst, Math.abs(statGainChance(v) - want));
  }
  check('statGainChance matches the printed formula at 401 values', worst === 0, `worst difference ${worst}`);
}
{
  let worst = 0;
  for (let i = 0; i < 200; i++) {
    const s = { str: (i * 7) % 101, dex: (i * 13) % 101, int: (i * 3) % 101, con: (i * 11) % 101, wis: (i * 5) % 101 };
    const med = (i * 17) % 101;
    const d = derived(s, { meditation: med });
    worst = Math.max(worst,
      Math.abs(d.maxHealth - (30 + s.con * 2.0 + s.str * 0.5)),
      Math.abs(d.maxMana - (10 + s.wis * 2.0 + s.int * 0.5)),
      Math.abs(d.maxStamina - (20 + s.dex * 1.5 + s.con * 0.5)),
      Math.abs(d.carry - (40 + s.str * 2.0)),
      Math.abs(d.healthRegen - (0.4 + s.con * 0.020)),
      Math.abs(d.manaRegen - (0.3 + s.wis * 0.025 + med * 0.010)),
      Math.abs(d.staminaRegen - (2.5 + s.dex * 0.030)),
    );
  }
  check('derived matches the printed formulas over 200 spreads', worst < 1e-4, `worst difference ${worst.toExponential(2)} (rounding to 1e-4)`);
}

console.log('\n--- 3. the two characters the document names -------------------------------');
{
  const warrior = derived({ str: 60, con: 55 });
  console.log(`  warrior STR 60 CON 55: health ${warrior.maxHealth}, stamina ${warrior.maxStamina}, carry ${warrior.carry} stones, health regen ${warrior.healthRegen}/s`);
  check('the warrior\'s health is the formula: 30 + 55*2.0 + 60*0.5', warrior.maxHealth === 170, `${warrior.maxHealth}`);
  // The prose once said 140, which was the formula with the STR term dropped.
  // The formula is the game and the sentence was corrected to it; this check
  // keeps the two from drifting apart again in either direction.
  const docHealth = Number(/A fresh warrior \(STR 60, CON 55\) has (\d+) health/.exec(DOC)[1]);
  check('the document\'s warrior health is the formula\'s: 30 + 55*2.0 + 60*0.5', docHealth === warrior.maxHealth && warrior.maxHealth === 170,
    `prose ${docHealth}, formula ${warrior.maxHealth}`);

  const mage = derived({ int: 65, wis: 60 });
  console.log(`  mage WIS 60 INT 65: mana ${mage.maxMana}, mana regen ${mage.manaRegen}/s`);
  check('the mage\'s mana is the formula: 10 + 60*2.0 + 65*0.5', mage.maxMana === 162.5, `${mage.maxMana}`);
  check('and the document\'s 162 mana is that floored, so the prose holds', Math.floor(mage.maxMana) === 162 && DOC.includes('has 162 mana'));

  // The opening table in 04-CLASSES-ABILITIES.md, so the two documents meet.
  const w = { str: 65, dex: 50, int: 25, con: 65, wis: 45 };
  const dw = derived(w, { meditation: 0 });
  console.log(`  opening Warrior 65/50/25/65/45: health ${dw.maxHealth}, mana ${dw.maxMana}, stamina ${dw.maxStamina}, carry ${dw.carry}, regens ${dw.healthRegen}/${dw.manaRegen}/${dw.staminaRegen}`);
  check('the opening Warrior spends exactly 250', statTotal(w) === STAT_START_TOTAL, `${statTotal(w)}`);
  check('and reads 192.5 health, 112.5 mana, 127.5 stamina, 170 stones',
    dw.maxHealth === 192.5 && dw.maxMana === 112.5 && dw.maxStamina === 127.5 && dw.carry === 170);
}

console.log('\n--- 4. Meditation is the only skill the block reads ------------------------');
{
  const s = { wis: 60 };
  const none = derived(s, {});
  const med45 = derived(s, { meditation: 45 });
  const viaState = derived(s, { skills: { meditation: 45 }, locks: {} });
  check('no Meditation: 0.3 + 60*0.025 = 1.8', none.manaRegen === 1.8, `${none.manaRegen}/s`);
  check('Meditation 45: 1.8 + 0.45 = 2.25', med45.manaRegen === 2.25, `${med45.manaRegen}/s`);
  check('a whole skill state passed by mistake reads the same, not zero', viaState.manaRegen === 2.25, `${viaState.manaRegen}/s`);
  check('and no other skill moves any derived number',
    JSON.stringify(derived(s, { magery: 100, focus: 100, healing: 100 })) === JSON.stringify(none));
  check('a missing stat counts as 0, it does not throw', derived({}).maxHealth === 30 && derived().carry === 40);
}

console.log('\n--- 5. the stat gain chance -----------------------------------------------');
{
  const at = (v) => statGainChance(v);
  console.log(`  measured: 0 -> ${at(0)}, 30 -> ${at(30).toFixed(6)}, 60 -> ${at(60).toFixed(6)}, 90 -> ${at(90).toFixed(6)}, 100 -> ${at(100).toFixed(6)}, 110 -> ${at(110)}`);
  check('at 0 the chance is the 0.06 ceiling', near(at(0), 0.06));
  check('at 30 the formula gives 0.043636', near(at(30), 0.06 * (1 - 30 / 110)) && near(at(30), 0.0436364, 1e-6));
  check('at 90 the formula gives 0.010909', near(at(90), 0.0109091, 1e-6));
  check('at 100 the formula gives 0.005455', near(at(100), 0.0054545, 1e-6));
  // DIVERGENCE. The document's prose reads "at 30 STR that is 3.6% a swing; at
  // 90 it is 0.6%; at 100 it is 0.33%". No clamp and no rounding of the printed
  // formula produces those three: they are 4.36%, 1.09% and 0.55%. The formula
  // is the game. Both halves are pinned so the pair cannot drift further apart
  // unnoticed, and the report says which line the designer has to settle.
  // The prose once claimed 3.6%, 0.6% and 0.33%, which no reading of the
  // formula produces. It was corrected to the formula's own numbers, read here
  // off the page and compared to one decimal of a percent.
  const prose = /At 30 STR that is ([\d.]+)% a swing; at 90 it is ([\d.]+)%; at 100 it is ([\d.]+)%/.exec(DOC);
  check('the document quotes the formula at 30, 90 and 100 STR', !!prose
    && near(Number(prose[1]) / 100, at(30), 0.0005) && near(Number(prose[2]) / 100, at(90), 0.0005) && near(Number(prose[3]) / 100, at(100), 0.0005),
    prose ? `prose ${prose[1]}/${prose[2]}/${prose[3]}, formula ${(at(30) * 100).toFixed(2)}/${(at(90) * 100).toFixed(2)}/${(at(100) * 100).toFixed(2)}` : 'sentence not found');
  check('chance falls as the stat grows, every step of the way',
    (() => { for (let v = 0; v < 106; v += 0.5) if (statGainChance(v + 0.5) > statGainChance(v)) return false; return true; })());
  check('the 0.002 floor does not engage at 106', at(106) > 0.002, `${at(106).toFixed(6)}`);
  check('and does engage at 107 and beyond', at(107) === 0.002 && at(200) === 0.002 && at(1e6) === 0.002);
  check('a nonsense value reads as 0 rather than NaN', statGainChance(undefined) === 0.06 && statGainChance(NaN) === 0.06);
}

console.log('\n--- 6. rolling for a stat --------------------------------------------------');
{
  const always = () => 0, never = () => 1;
  const s = { str: 30, dex: 30, int: 30, con: 30, wis: 30 };
  const r = rollStatGain(s, 'str', always);
  check('a lucky roll gains exactly +1 and writes it back', r.gained && r.value === 31 && s.str === 31, `STR 30 -> ${s.str}`);
  const r2 = rollStatGain(s, 'str', never);
  check('an unlucky roll gains nothing, and is not a refusal', !r2.gained && !r2.refused && r2.reason === null && s.str === 31);
  check('a roll exactly on the chance does not gain (the test is <, not <=)',
    !rollStatGain({ str: 30 }, 'str', () => statGainChance(30)).gained);
  check('a roll a hair under does gain',
    rollStatGain({ str: 30 }, 'str', () => statGainChance(30) - 1e-9).gained);
}
{
  // the measured rate against the chance it claims
  const rng = rngFrom(20260904);
  const N = 200000; let gains = 0;
  for (let i = 0; i < N; i++) { const st = { str: 30 }; if (rollStatGain(st, 'str', rng).gained) gains++; }
  const rate = gains / N, want = statGainChance(30);
  console.log(`  ${N} rolls at STR 30: ${gains} gains, ${(rate * 100).toFixed(3)}% against a claimed ${(want * 100).toFixed(3)}%`);
  check('the measured rate is the claimed chance within 5%', Math.abs(rate - want) / want < 0.05, `off by ${(Math.abs(rate - want) / want * 100).toFixed(2)}%`);
  const rng2 = rngFrom(20260904);
  let gains90 = 0;
  for (let i = 0; i < N; i++) { const st = { str: 90 }; if (rollStatGain(st, 'str', rng2).gained) gains90++; }
  console.log(`  the same ${N} rolls at STR 90: ${gains90} gains, ${(gains90 / N * 100).toFixed(3)}%`);
  check('the same seed at 90 gains far less often than at 30', gains90 < gains / 3, `${gains90} against ${gains}`);
}
{
  const s = { str: 100, dex: 30, int: 30, con: 30, wis: 30 };
  let gains = 0, refusals = 0, reason = '';
  for (let i = 0; i < 10000; i++) { const r = rollStatGain(s, 'str', () => 0); if (r.gained) gains++; if (r.refused) { refusals++; reason = r.reason; } }
  console.log(`  10000 guaranteed rolls at STR 100: ${gains} gains, ${refusals} refusals, "${reason}"`);
  check('a stat at the cap never gains, however lucky', gains === 0 && s.str === 100);
  check('and every refusal says why', refusals === 10000 && /cap/.test(reason));
  check('at 99 the same roll does gain, so the gate is the cap and not the roll', rollStatGain({ str: 99 }, 'str', () => 0).gained);
}
{
  const full = { str: 100, dex: 100, int: 100, con: 60, wis: 40 };
  check('that spread is exactly the 400 total cap', statTotal(full) === STAT_TOTAL_CAP, `${statTotal(full)}`);
  const r = rollStatGain(full, 'con', () => 0);
  console.log(`  at 400 total: gained ${r.gained}, refused ${r.refused}, "${r.reason}"`);
  check('a gain at the total cap is refused', !r.gained && r.refused && full.con === 60);
  check('and the reason names the cap', /400/.test(r.reason) && /total/.test(r.reason));
  const one = { str: 100, dex: 100, int: 100, con: 59, wis: 40 };
  check('one point under the cap, the same roll gains', rollStatGain(one, 'con', () => 0).gained && one.con === 60, `total ${statTotal(one)}`);
  check('and that gain took it to exactly 400', statTotal(one) === STAT_TOTAL_CAP);
}
{
  const s = { str: 30 };
  const r = rollStatGain(s, 'luck', () => 0);
  check('an unknown stat is refused, loudly, and changes nothing', !r.gained && r.refused && /not a stat/.test(r.reason) && s.luck === undefined, `"${r.reason}"`);
  check('no stats at all is refused rather than thrown', rollStatGain(null, 'str', () => 0).refused);
}

console.log('\n--- 7. the creation spread -------------------------------------------------');
{
  const ok = (o) => validateSpread(o);
  const blank = { str: 50, dex: 50, int: 50, con: 50, wis: 50 };
  const warrior = { str: 65, dex: 50, int: 25, con: 65, wis: 45 };
  check('the Blank opening passes', ok(blank).ok && ok(blank).total === 250);
  check('the Warrior opening passes', ok(warrior).ok, `total ${ok(warrior).total}`);
  const over = ok({ str: 66, dex: 50, int: 25, con: 65, wis: 45 });
  check('251 fails and says it is over', !over.ok && /over the 250/.test(over.errors[0]), `"${over.errors[0]}"`);
  const under = ok({ str: 64, dex: 50, int: 25, con: 65, wis: 45 });
  check('249 fails and says it is under', !under.ok && /under the 250/.test(under.errors[0]), `"${under.errors[0]}"`);
  const tall = ok({ str: 105, dex: 50, int: 25, con: 25, wis: 45 });
  check('a stat over 100 fails even at the right total', !tall.ok && tall.total === 250 && /over the cap/.test(tall.errors.join(' ')), `"${tall.errors[0]}"`);
  check('and 100 exactly is allowed', ok({ str: 100, dex: 50, int: 25, con: 30, wis: 45 }).ok);
  const low = ok({ str: 5, dex: 60, int: 60, con: 60, wis: 65 });
  check('a stat under 10 fails even at the right total', !low.ok && low.total === 250 && /under the floor/.test(low.errors.join(' ')), `"${low.errors[0]}"`);
  check(`and ${STAT_MIN_AT_CREATION} exactly is allowed`, ok({ str: 10, dex: 60, int: 60, con: 55, wis: 65 }).ok);
  const half = ok({ str: 65.5, dex: 49.5, int: 25, con: 65, wis: 45 });
  check('half a point fails: stats are whole numbers', !half.ok && /whole numbers/.test(half.errors.join(' ')));
  const missing = ok({ str: 65, dex: 50, int: 25, con: 65 });
  check('a missing stat fails and names it', !missing.ok && /WIS has no value/.test(missing.errors.join(' ')));
  const strange = ok({ ...warrior, luck: 0 });
  check('a stat that does not exist fails', !strange.ok && /"luck" is not a stat/.test(strange.errors.join(' ')));
  const both = ok({ str: 105, dex: 5, int: 25, con: 65, wis: 45 });
  check('every complaint is returned, not just the first', !both.ok && both.errors.length >= 3, `${both.errors.length} errors: ${both.errors.join(' / ')}`);
  check('nothing at all is refused rather than thrown', !validateSpread(null).ok);
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
