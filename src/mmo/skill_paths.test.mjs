// Every skill, and the thing a character at ZERO can do to start it.
// Run: node src/mmo/skill_paths.test.mjs
//
// The question this file answers is the player's: "how do we gain mysticism?
// all skills should be gainable without purchasing." So it prints the table,
// one row per skill, with the first thing to do; and it FAILS when a skill has
// neither a path nor a written reason it has none.
//
// Nothing here is asserted from a list of ids. The ability paths are read out
// of abilities.js's real gate, the craft paths out of recipes.js's real chance
// against win_crafting.js's real floor, the fight paths by RUNNING
// combat_rules.js's real resolver and reading the lessons that fall out, and
// the world paths by opening the game file and looking for the call. A gate
// raised back over a beginner's head, a lesson deleted in a refactor or a
// recipe made harder all land here.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  pathsFor, abilityPaths, craftPaths, fightPaths, worldPaths, skillPathTable,
  auditSkillPaths, UNBUILT, UNBUILT_COUNT, WORLD_PATHS,
} from './skill_paths.js';
import { SKILLS, SKILL_BY_ID, rollGain, gainChance } from './skills.js';
import {
  ABILITIES, ABILITIES_BY_ID, meetsRequirements, practiceChance, isPractice,
  practiceText, requirementSentence, requirementRefusal, requirementClauses,
  lessonFor, PRACTICE_FLOOR,
} from './abilities.js';
import { resolveMelee } from './combat_rules.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const rngFrom = (seed) => () => {
  seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

console.log('\n--- 1. the table: every skill, and what to do about it ----------------------');
{
  const table = skillPathTable();
  let built = 0;
  for (const row of table) {
    const first = row.paths[0];
    const line = first ? `${first.kind}: ${first.what}` : `UNBUILT: ${row.unbuilt}`;
    if (first) built++;
    console.log(`      ${row.name.padEnd(24)}${line}`);
  }
  console.log('');
  check(`${built} of ${SKILLS.length} skills can be started by doing something`, built === SKILLS.length - UNBUILT_COUNT,
    `${SKILLS.length - built} have no path: ${table.filter((r) => !r.paths.length).map((r) => r.name).join(', ')}`);
  check('and the six with none are the six written down as unbuilt systems',
    table.filter((r) => !r.paths.length).every((r) => !!r.unbuilt) && UNBUILT_COUNT === 6,
    Object.keys(UNBUILT).join(', '));
  check('the audit passes on the real tables', !!auditSkillPaths(), JSON.stringify(auditSkillPaths()));
}

console.log('\n--- 2. it fails when a skill has no path ------------------------------------');
{
  // Driven both ways: the audit above says yes on the real tables, and here it
  // says no on a table with a skill nothing teaches.
  const strandedName = 'Fishing';
  check('Fishing is stranded today, and the reason is written rather than silent',
    pathsFor('fishing').length === 0 && typeof UNBUILT.fishing === 'string' && UNBUILT.fishing.length > 20,
    UNBUILT.fishing);
  check('and a skill that is neither pathed nor declared would throw',
    (() => {
      // The real audit, with a skill it has never seen. SKILLS is frozen by
      // use, not by Object.freeze, so this pushes and pops the real table.
      SKILLS.push({ id: 'basketweaving', name: 'Basketweaving', group: 'Body', description: 'no' });
      SKILL_BY_ID.set('basketweaving', SKILLS[SKILLS.length - 1]);
      let msg = null;
      try { auditSkillPaths(); } catch (e) { msg = e.message; }
      SKILLS.pop();
      SKILL_BY_ID.delete('basketweaving');
      return !!msg && /Basketweaving/.test(msg) && /only be bought/.test(msg);
    })(), strandedName);
  check('and so would an unbuilt entry that has since grown a path',
    (() => {
      const kept = UNBUILT.magery;
      UNBUILT.magery = 'pretend nothing teaches it';
      let msg = null;
      try { auditSkillPaths(); } catch (e) { msg = e.message; }
      if (kept === undefined) delete UNBUILT.magery; else UNBUILT.magery = kept;
      return !!msg && /out of date/.test(msg);
    })());
  check('and the real audit still passes once both are put back', !!auditSkillPaths());
}

console.log('\n--- 3. the world paths are still in the files -------------------------------');
{
  for (const w of WORLD_PATHS) {
    const src = read(w.file);
    check(`${SKILL_BY_ID.get(w.skill).name}: ${w.file} still calls it`, src.includes(w.needle), w.needle);
  }
  check('every world path names a real skill', WORLD_PATHS.every((w) => SKILL_BY_ID.has(w.skill)));
}

console.log('\n--- 4. the thirteen rows that open at zero -----------------------------------');
{
  const opened = ABILITIES.filter((a) => a.openAt < a.minSkill);
  console.log(`      ${opened.map((a) => `${a.name} (${a.skill} ${a.openAt} of ${a.minSkill})`).join(', ')}`);
  check('every one of them is reachable by a character with nothing',
    opened.every((a) => meetsRequirements(a, {}, {}).ok), `${opened.length} rows`);
  check('every one of them is the first rung of a school that had no other door',
    opened.every((a) => abilityPaths(a.skill).length > 0));
  check('none of them is passive, because a passive is never pressed and never teaches',
    opened.every((a) => !a.passive));
  check('and no row opens above its own mark', ABILITIES.every((a) => a.openAt <= a.minSkill));
}

console.log('\n--- 5. a row below its mark mostly fumbles, and teaches ----------------------');
{
  const hex = ABILITIES_BY_ID.hex;
  check('Hex at Mysticism 0 lands 5 times in 100', practiceChance(hex, {}) === PRACTICE_FLOOR, String(practiceChance(hex, {})));
  check('at Mysticism 10 it is halfway', Math.abs(practiceChance(hex, { mysticism: 10 }) - 0.525) < 1e-9,
    String(practiceChance(hex, { mysticism: 10 })));
  check('at Mysticism 20, its own mark, it always lands', practiceChance(hex, { mysticism: 20 }) === 1);
  check('and above it, it still always lands', practiceChance(hex, { mysticism: 90 }) === 1);
  check('a row that never opened early never rolls at all',
    practiceChance(ABILITIES_BY_ID.meteor, {}) === 1 && practiceChance(ABILITIES_BY_ID.powerStrike, {}) === 1);
  check('isPractice is true below the mark and false at it',
    isPractice(hex, {}) && !isPractice(hex, { mysticism: 20 }));
  check('and it says so in words with both numbers in them',
    /5 in 100/.test(practiceText(hex, {})) && /Mysticism 20/.test(practiceText(hex, {})),
    practiceText(hex, {}));

  // MEASURED, not asserted: 1000 attempts at Mysticism 0 through the real
  // curve, then the same at the mark.
  const rng = rngFrom(7);
  let landed = 0;
  for (let i = 0; i < 1000; i++) if (rng() < practiceChance(hex, {})) landed++;
  check('1000 attempts at Mysticism 0 land about 50 times', landed > 20 && landed < 90, `${landed} landed`);
  let landedAt20 = 0;
  for (let i = 0; i < 1000; i++) if (rng() < practiceChance(hex, { mysticism: 20 })) landedAt20++;
  check('and 1000 at Mysticism 20 land 1000 times', landedAt20 === 1000, `${landedAt20} landed`);

  // A fumble teaches. skills.js halves the chance for a failure and does not
  // zero it, and that is the whole reason the fumble is allowed to happen.
  const l = lessonFor(hex);
  check('a fumbled Hex is a lesson at exactly half a success\'s chance, and not zero',
    gainChance(0, l.difficulty) * 0.5 > 0 && Math.abs(gainChance(0, l.difficulty) * 0.5 - 0.395) < 1e-9,
    `success ${gainChance(0, l.difficulty)}, fumble ${gainChance(0, l.difficulty) * 0.5}`);
  const sheet = { skills: {}, locks: {} };
  let gains = 0;
  const teachRng = rngFrom(11);
  for (let i = 0; i < 200; i++) if (rollGain(sheet, 'mysticism', l.difficulty, false, teachRng).gained) gains++;
  check('200 fumbles move Mysticism off zero', sheet.skills.mysticism > 0,
    `${gains} gains, Mysticism ${sheet.skills.mysticism}`);
}

console.log('\n--- 6. Parrying and Evaluating Intelligence, which were written and unreachable ---');
{
  // Parrying's lesson used to sit behind `parryChance > 0`, which is zero at
  // Parrying 0. Driven both ways: with a shield and without.
  const beginner = () => ({
    stats: { str: 0, dex: 0, int: 0, con: 0, wis: 0 }, skills: {}, bonuses: {},
    ar: 0, resists: {}, weapon: { skill: 'swordsmanship', minDamage: 5, maxDamage: 9, speed: 3, weight: 4, damageType: 'physical', ranged: false, reach: 2 },
    shield: null, health: 100, maxHealth: 100, mana: 0, maxMana: 0, stamina: 50, difficulty: 5,
  });
  const withShield = () => ({ ...beginner(), shield: { parryFactor: 1 } });
  const hitRng = () => 0;                       // everything connects
  const shielded = resolveMelee({ attacker: beginner(), defender: withShield(), now: 0, rng: hitRng });
  const bare = resolveMelee({ attacker: beginner(), defender: beginner(), now: 0, rng: hitRng });
  const parryOf = (res) => res.lessons.filter((l) => l.skill === 'parrying');
  check('a Parrying 0 defender with a shield is taught Parrying', parryOf(shielded).length === 1,
    JSON.stringify(parryOf(shielded)));
  check('and the lesson is a failure, because nothing was parried', parryOf(shielded)[0]?.success === false);
  check('a defender with no shield is taught nothing, which is the other direction',
    parryOf(bare).length === 0);
  check('Evaluating Intelligence is the skill id, not the abbreviation nobody owns',
    !read('src/mmo/combat_rules.js').includes("'evalInt'"),
    read('src/mmo/combat_rules.js').includes("'evaluatingIntelligence'") ? 'evaluatingIntelligence' : 'MISSING');
  check('and casting teaches it', fightPaths('evaluatingIntelligence').length > 0,
    fightPaths('evaluatingIntelligence').map((p) => p.what).join('; '));
}

console.log('\n--- 7. the sentence is one sentence -----------------------------------------');
{
  const hex = ABILITIES_BY_ID.hex;
  const kin = ABILITIES_BY_ID.elementalKin;
  check('a locked row says the need and your number', requirementSentence(kin, {}, {}) === 'Needs Mysticism 90, you are at 0',
    requirementSentence(kin, {}, {}));
  check('the refusal is the same sentence with the name on the front',
    meetsRequirements(kin, {}, {}).reason === 'Elemental Kin needs Mysticism 90, you are at 0',
    meetsRequirements(kin, {}, {}).reason);
  check('and requirementRefusal builds exactly that',
    requirementRefusal(kin, {}, {}) === meetsRequirements(kin, {}, {}).reason);
  check('a met clause keeps its colour and drops the "you are at"',
    requirementSentence(ABILITIES_BY_ID.leapSlam, { swordsmanship: 60 }, { str: 20 })
      === 'Needs Swordsmanship 60 and STR 50, you are at 20',
    requirementSentence(ABILITIES_BY_ID.leapSlam, { swordsmanship: 60 }, { str: 20 }));
  check('an anyOf row shows both doors',
    requirementSentence(ABILITIES_BY_ID.resurrect, {}, {})
      === 'Needs Healing 80, you are at 0 and Anatomy 80, you are at 0, or Chivalry 85, you are at 0',
    requirementSentence(ABILITIES_BY_ID.resurrect, {}, {}));
  check('a row that needs nothing says nothing', requirementSentence(ABILITIES_BY_ID.jump, {}, {}) === ''
    && requirementSentence(hex, {}, {}) === '');
  check('every clause carries met, so the card can paint each one',
    requirementClauses(ABILITIES_BY_ID.leapSlam, { swordsmanship: 60 }, { str: 20 })
      .map((p) => p.met).join(',') === 'true,false');
  check('and every one of the 78 rows can say what it needs without throwing',
    ABILITIES.every((a) => typeof requirementSentence(a, {}, {}) === 'string'));
}

console.log('\n--- 8. no skill needs coin ---------------------------------------------------');
{
  const src = read('src/mmo/npcs.js');
  const taught = new Set();
  for (const m of src.matchAll(/teaches:\s*\[([^\]]*)\]/g)) {
    for (const id of m[1].split(',')) {
      const t = id.trim().replace(/^'|'$/g, '');
      if (t && SKILL_BY_ID.has(t)) taught.add(t);
    }
  }
  const boughtOnly = [...taught].filter((id) => pathsFor(id).length === 0);
  check(`${taught.size} skills are for sale, and ${boughtOnly.length} of them can ONLY be bought`,
    boughtOnly.length === 1 && boughtOnly[0] === 'animalTaming',
    boughtOnly.map((id) => SKILL_BY_ID.get(id).name).join(', ') || 'none');
  check('and Animal Taming is written down as the one that is, with the reason',
    /SELLS this skill/.test(UNBUILT.animalTaming || ''), UNBUILT.animalTaming);
  check('every other skill a trainer sells can also be practised',
    boughtOnly.length <= 1);
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
