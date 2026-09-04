// The skill table, the gain curve and the caps, driven both ways.
// Run: node src/mmo/skills.test.mjs
//
// Every number printed here was measured in this file. The skill table and the
// band table are compared against docs/mmo/01-STATS-SKILLS.md as it sits on
// disk, name by name and row by row, so the document and the code cannot drift.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  SKILLS, SKILL_GROUPS, SKILL_COUNT, SKILL_BY_ID, SKILL_CAP, TOTAL_CAP, BANDS, LOCKS,
  gainStep, gainChance, rollGain, setLock, lockOf, total, auditSkills,
} from './skills.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const rngFrom = (seed) => () => {
  seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const threw = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };
const DOC = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../docs/mmo/01-STATS-SKILLS.md'), 'utf8');

console.log('\n--- 1. the table is the document\'s table -----------------------------------');
{
  // Parse the nine grouped tables out of the document.
  const rows = [];
  let group = null, inSkills = false;
  for (const line of DOC.split('\n')) {
    if (line.startsWith('### Every skill')) { inSkills = true; continue; }
    if (!inSkills) continue;
    if (line.startsWith('### ') || line.startsWith('## ')) break;
    const bold = /^\*\*(.+)\*\*$/.exec(line.trim());
    if (bold) { group = bold[1]; continue; }
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length !== 2 || cells[0] === 'skill' || /^-+$/.test(cells[0])) continue;
    rows.push({ name: cells[0], group, description: cells[1] });
  }
  console.log(`  the document lists ${rows.length} skills in ${new Set(rows.map((r) => r.group)).size} groups`);
  check('the code holds as many skills as the document lists', SKILLS.length === rows.length, `${SKILLS.length} against ${rows.length}`);
  check('the groups are the document\'s nine, in its order',
    [...new Set(rows.map((r) => r.group))].join('|') === SKILL_GROUPS.join('|'), SKILL_GROUPS.join(', '));
  let mismatch = null;
  for (let i = 0; i < Math.min(rows.length, SKILLS.length); i++) {
    const a = rows[i], b = SKILLS[i];
    if (a.name !== b.name || a.group !== b.group || a.description !== b.description) { mismatch = `row ${i + 1}: doc "${a.name}/${a.group}/${a.description}" against code "${b.name}/${b.group}/${b.description}"`; break; }
  }
  check('every name, group and description matches, in order', mismatch === null, mismatch || `${SKILLS.length} rows compared`);
  // The sentence over the table once said 44 while the table had 52. The table
  // is the game; the sentence was corrected and is counted here so it cannot
  // quietly go wrong again.
  const claimed = Number(/Nine groups, (\d+) skills/.exec(DOC)[1]);
  check('the document\'s prose counts the same skills as its table', claimed === rows.length && rows.length === 52,
    `prose ${claimed}, table ${rows.length}, code ${SKILLS.length}`);
  check('SKILL_COUNT is the counted table, not the sentence', SKILL_COUNT === 52 && SKILLS.length === SKILL_COUNT);
}
{
  check('every id is unique', new Set(SKILLS.map((s) => s.id)).size === SKILLS.length);
  check('every name is unique', new Set(SKILLS.map((s) => s.name)).size === SKILLS.length);
  check('every skill is reachable by id', SKILLS.every((s) => SKILL_BY_ID.get(s.id) === s));
  check('no group is empty', SKILL_GROUPS.every((g) => SKILLS.some((s) => s.group === g)));
  const per = SKILL_GROUPS.map((g) => `${g} ${SKILLS.filter((s) => s.group === g).length}`);
  console.log(`  ${per.join(', ')}`);
  check('the nine groups add up to the whole table',
    SKILL_GROUPS.reduce((n, g) => n + SKILLS.filter((s) => s.group === g).length, 0) === SKILLS.length);
}

console.log('\n--- 2. the audit refuses a broken table ------------------------------------');
{
  check('the table as shipped passes', threw(auditSkills) === null, JSON.stringify(auditSkills()));
  // Break it four ways and put it back each time.
  const twin = { ...SKILLS[0] };
  SKILLS.push(twin);
  const dup = threw(auditSkills);
  SKILLS.pop();
  check('a repeated id throws', dup !== null && /appears twice/.test(dup), `"${dup}"`);

  const body = SKILLS.splice(SKILLS.length - 3, 3);   // the whole Body group
  const empty = threw(auditSkills);
  SKILLS.push(...body);
  check('an empty group throws', empty !== null && /empty/.test(empty), `"${empty}"`);

  const one = SKILLS.pop();
  const short = threw(auditSkills);
  SKILLS.push(one);
  check('the wrong count throws', short !== null && /SKILL_COUNT/.test(short), `"${short}"`);

  const tmp = SKILLS[0]; SKILLS[0] = SKILLS[SKILLS.length - 1]; SKILLS[SKILLS.length - 1] = tmp;
  const order = threw(auditSkills);
  SKILLS[SKILLS.length - 1] = SKILLS[0]; SKILLS[0] = tmp;
  check('a group split in two throws', order !== null && /out of order or split/.test(order), `"${order}"`);
  check('and the table is back exactly as it was', threw(auditSkills) === null && SKILLS.length === SKILL_COUNT && SKILLS[0].id === 'swordsmanship' && SKILLS[SKILLS.length - 1].id === 'focus');
}

console.log('\n--- 3. the gain curve is the document\'s table ------------------------------');
{
  const rows = [];
  for (const line of DOC.split('\n')) {
    const m = /^\| (\d+\.\d) to (\d+\.\d) \| \+(\d?\.\d+) \| (\d+) \|$/.exec(line);
    if (m) rows.push({ min: Number(m[1]), max: Number(m[2]), step: Number(m[3]), uses: Number(m[4]) });
  }
  check('the document prints six bands', rows.length === 6, `${rows.length}`);
  check('BANDS is those six rows exactly', JSON.stringify(rows) === JSON.stringify(BANDS), JSON.stringify(BANDS.map((b) => `${b.min}-${b.max} +${b.step}`)));
  check('the bands cover 0 to 100 with no gap and no overlap',
    BANDS[0].min === 0 && BANDS[BANDS.length - 1].max === SKILL_CAP && BANDS.every((b, i) => i === 0 || b.min === BANDS[i - 1].max));
  check('the document\'s "uses to the next band" is the band width over the step, rounded down',
    BANDS.every((b) => b.uses === Math.floor((b.max - b.min) / b.step + 1e-9)), BANDS.map((b) => b.uses).join(', '));
  check('the caps are the document\'s: 100.0 a skill, 700.0 in total',
    SKILL_CAP === 100 && TOTAL_CAP === 700 && DOC.includes('**0.0 to 100.0**') && DOC.includes('**Total cap 700.0**'));
}
{
  // Every band edge, from below and from on it.
  const edges = [
    [0, 0.3], [15, 0.3], [29.9, 0.3], [30, 0.2], [30.1, 0.2], [49.9, 0.2],
    [50, 0.1], [69.9, 0.1], [70, 0.05], [84.9, 0.05], [85, 0.03], [94.9, 0.03],
    [95, 0.01], [99.9, 0.01], [100, 0],
  ];
  let bad = null;
  for (const [v, want] of edges) if (!near(gainStep(v), want)) bad = `${v} gave ${gainStep(v)}, wanted ${want}`;
  check('gainStep at every band edge', bad === null, bad || edges.map(([v, w]) => `${v}:${w}`).join(' '));
  check('a grandmaster has no step left', gainStep(100) === 0 && gainStep(100.5) === 0);
  check('and 99.99 still has one', gainStep(99.99) === 0.01);
  check('a negative reads as the first band rather than nothing', gainStep(-5) === 0.3);
}

console.log('\n--- 4. the lesson chance ---------------------------------------------------');
{
  check('the document still reads the formula this code uses',
    DOC.includes('gainChance(skill, difficulty) = clamp(0.55 - (skill - difficulty) * 0.006, 0.02, 0.90)'));
  let worst = 0;
  for (let s = 0; s <= 100; s += 1) for (let d = 0; d <= 100; d += 1) {
    worst = Math.max(worst, Math.abs(gainChance(s, d) - Math.min(0.90, Math.max(0.02, 0.55 - (s - d) * 0.006))));
  }
  check('gainChance matches the printed formula at 10201 pairs', worst === 0, `worst difference ${worst}`);
  check('skill equal to difficulty is 0.55', near(gainChance(0, 0), 0.55) && near(gainChance(50, 50), 0.55) && near(gainChance(100, 100), 0.55));
  console.log(`  90 against a rat (5): ${gainChance(90, 5).toFixed(3)}; 90 against a wraith (70): ${gainChance(90, 70).toFixed(3)}; 10 against a starfall vein (92): ${gainChance(10, 92).toFixed(3)}`);
  // The sentence once said 0.02, which is the floor and needs 88.33 points of
  // overmatch; a rat is difficulty 5 and 0.55 - 85 * 0.006 = 0.04. The
  // sentence was corrected to the formula and is read back here.
  const rat = /gives a ([\d.]+)\nchance of a 0.03 gain/.exec(DOC);
  check('the document quotes the formula for a rat at 90 swordsmanship', !!rat && near(Number(rat[1]), gainChance(90, 5)), rat ? `prose ${rat[1]}, formula ${gainChance(90, 5)}` : 'sentence not found');
  check('and that is 0.04, not the 0.02 floor', near(gainChance(90, 5), 0.04),
    `0.55 - (90 - 5) * 0.006 = ${gainChance(90, 5)}; the 0.02 floor needs ${((0.55 - 0.02) / 0.006).toFixed(2)} points of overmatch`);
  check('the gain it would win is the 0.03 the sentence claims', gainStep(90) === 0.03);
  check('the floor engages only past 88.33 points of overmatch', near(gainChance(88, 0), 0.022) && gainChance(89, 0) === 0.02);
  check('the ceiling is 0.90 for anything far too hard', gainChance(0, 100) === 0.90 && gainChance(10, 92) === 0.90);
  check('and does not engage just under', near(gainChance(0, 58), 0.898) && gainChance(0, 59) === 0.90);
  check('a wraith at 70 skill is still worth a swing', near(gainChance(70, 70), 0.55));
}

console.log('\n--- 5. one lesson ----------------------------------------------------------');
{
  const fresh = () => ({ skills: { mining: 20 }, locks: {} });
  const always = () => 0, never = () => 1;
  let s = fresh();
  const r = rollGain(s, 'mining', 20, true, always);
  check('a lucky lesson moves the skill by the band step', r.gained && r.from === 20 && r.to === 20.3 && s.skills.mining === 20.3, `${r.from} -> ${r.to}`);
  check('and it is not a refusal, and took nothing from anyone', !r.refused && r.reason === null && r.tookFrom === null);
  s = fresh();
  const u = rollGain(s, 'mining', 20, true, never);
  check('an unlucky lesson teaches nothing and is not a refusal', !u.gained && !u.refused && u.reason === null && s.skills.mining === 20);
  check('a roll exactly on the chance does not gain', !rollGain(fresh(), 'mining', 20, true, () => 0.55).gained);
  check('a roll a hair under does', rollGain(fresh(), 'mining', 20, true, () => 0.55 - 1e-9).gained);
  const un = rollGain(fresh(), 'basketweaving', 20, true, always);
  check('an unknown skill is refused, loudly', !un.gained && un.refused && /not a skill/.test(un.reason), `"${un.reason}"`);
  const gm = rollGain({ skills: { mining: 100 }, locks: {} }, 'mining', 100, true, always);
  check('a grandmaster cannot rise', !gm.gained && gm.refused && /already 100.0/.test(gm.reason), `"${gm.reason}"`);
  const l = { skills: { mining: 20 }, locks: { mining: 'locked' } };
  const lr = rollGain(l, 'mining', 20, true, always);
  check('a locked skill will not rise', !lr.gained && lr.refused && /locked/.test(lr.reason) && l.skills.mining === 20, `"${lr.reason}"`);
  const d = { skills: { mining: 20 }, locks: { mining: 'down' } };
  const dr = rollGain(d, 'mining', 20, true, always);
  check('a skill marked to fall will not rise', !dr.gained && dr.refused && /fall/.test(dr.reason) && d.skills.mining === 20, `"${dr.reason}"`);
  check('and with the lock back to up, the same roll gains',
    rollGain({ skills: { mining: 20 }, locks: { mining: 'up' } }, 'mining', 20, true, always).gained);
  const missing = { skills: {}, locks: {} };
  check('a skill never trained starts at 0.0 and gains 0.3', rollGain(missing, 'fishing', 0, true, always).to === 0.3);
  check('no character at all is refused rather than thrown', rollGain(null, 'mining', 20, true, always).refused);
}

console.log('\n--- 6. the walk from 0.0 to Grandmaster ------------------------------------');
let grind = null;
{
  // Fair difficulty: the task is always worth exactly what you already are.
  const rng = rngFrom(20260904);
  const s = { skills: { mining: 0 }, locks: {} };
  let attempts = 0, lessons = 0, refused = 0;
  const milestones = [];
  while (s.skills.mining < SKILL_CAP && attempts < 500000) {
    const v = s.skills.mining;
    const r = rollGain(s, 'mining', v, true, rng);
    attempts++;
    if (r.gained) lessons++;
    if (r.refused) refused++;
    if (r.milestone) milestones.push(r.milestone);
  }
  grind = { attempts, lessons, milestones, end: s.skills.mining };
  console.log(`  0.0 to 100.0 at fair difficulty, seed 20260904: ${lessons} successful lessons over ${attempts} attempts (${(lessons / attempts * 100).toFixed(1)}% taught)`);
  console.log(`  at three seconds a swing that is ${(attempts * 3 / 60).toFixed(0)} minutes of swinging, ${(lessons * 3 / 60).toFixed(0)} of them teaching`);
  check('it ends exactly on 100.0, not past it', s.skills.mining === 100 && refused === 0);
  const claim = 1533;
  check(`the lessons land within 15% of the document's ${claim}`, Math.abs(lessons - claim) / claim < 0.15,
    `${lessons} against ${claim}, off by ${((lessons - claim) / claim * 100).toFixed(1)}%`);
  // The count is a property of the bands, not of the seed: prove it.
  let byHand = 0, v = 0;
  while (v < SKILL_CAP) { v = Math.min(SKILL_CAP, Math.round((v + gainStep(v)) * 100) / 100); byHand++; }
  check('and the count is fixed by the bands, so every seed gives the same', lessons === byHand, `${lessons} = ${byHand} steps of the curve`);
  check('a fair lesson taught roughly 55% of the time', Math.abs(lessons / attempts - 0.55) < 0.02, `${(lessons / attempts * 100).toFixed(2)}%`);
}

console.log('\n--- 7. a miss teaches at half the chance -----------------------------------');
{
  const N = 40000;
  const run = (success) => {
    const rng = rngFrom(4242);
    let gains = 0;
    for (let i = 0; i < N; i++) {
      const s = { skills: { mining: 40 }, locks: {} };
      if (rollGain(s, 'mining', 40, success, rng).gained) gains++;
    }
    return gains;
  };
  const hit = run(true), miss = run(false);
  const ratio = miss / hit;
  console.log(`  ${N} attempts at Mining 40 against difficulty 40: ${hit} taught on a hit, ${miss} on a miss, ratio ${ratio.toFixed(4)}`);
  check('a miss teaches at half the rate of a hit', Math.abs(ratio - 0.5) < 0.03, `ratio ${ratio.toFixed(4)}`);
  check('the hit rate is the claimed 0.55', Math.abs(hit / N - 0.55) < 0.01, `${(hit / N).toFixed(4)}`);
  check('the miss rate is the claimed 0.275', Math.abs(miss / N - 0.275) < 0.01, `${(miss / N).toFixed(4)}`);
  check('the returned chance says so too',
    near(rollGain({ skills: { mining: 40 }, locks: {} }, 'mining', 40, true, () => 1).chance, 0.55)
    && near(rollGain({ skills: { mining: 40 }, locks: {} }, 'mining', 40, false, () => 1).chance, 0.275));
}

console.log('\n--- 8. the 700 cap and the skill marked to fall -----------------------------');
{
  const seven = () => ({
    skills: { swordsmanship: 100, tactics: 100, parrying: 100, anatomy: 100, healing: 100, magery: 100, blacksmithing: 100, mining: 0 },
    locks: {},
  });
  let s = seven();
  check('seven grandmasteries is exactly the 700 cap', total(s) === TOTAL_CAP, `${total(s)}`);
  const stuck = rollGain(s, 'mining', 0, true, () => 0);
  console.log(`  at the cap with nothing marked down: "${stuck.reason}"`);
  check('with nothing marked down the gain is refused', !stuck.gained && stuck.refused && s.skills.mining === 0);
  check('and the reason names the cap and the skill', /700.0/.test(stuck.reason) && /Mining/.test(stuck.reason));
  check('the sheet did not move a hundredth', total(s) === TOTAL_CAP);

  s = seven();
  setLock(s, 'blacksmithing', 'down');
  const paid = rollGain(s, 'mining', 0, true, () => 0);
  console.log(`  paid for: Mining ${paid.from} -> ${paid.to}, taking ${paid.tookFrom.amount} from ${paid.tookFrom.name} (${paid.tookFrom.from} -> ${paid.tookFrom.to})`);
  check('with one skill marked down the gain goes through', paid.gained && s.skills.mining === 0.1);
  check('it took exactly 0.1 from the skill marked down', paid.tookFrom.id === 'blacksmithing' && paid.tookFrom.amount === 0.1 && s.skills.blacksmithing === 99.9);
  check('the total is still exactly 700.0', total(s) === TOTAL_CAP, `${total(s)}`);
  check('at the cap the gain is 0.1, not the 0.3 the band would give away from the cap', paid.step === 0.1 && gainStep(0) === 0.3);

  s = seven();
  setLock(s, 'blacksmithing', 'down');
  setLock(s, 'healing', 'down');
  s.skills.healing = 99;
  s.skills.blacksmithing = 99.5;
  s.skills.mining = 1.5;   // back to 700 exactly
  check('a sheet with two skills marked down is still on the cap', total(s) === TOTAL_CAP, `${total(s)}`);
  const highest = rollGain(s, 'mining', 0, true, () => 0);
  check('the highest of them pays, not the first one found', highest.tookFrom.id === 'blacksmithing' && s.skills.blacksmithing === 99.4 && s.skills.healing === 99);

  // A skill marked up or locked is not a donor, however high.
  s = seven();
  setLock(s, 'blacksmithing', 'locked');
  const noDonor = rollGain(s, 'mining', 0, true, () => 0);
  check('a locked skill will not pay for someone else\'s gain', !noDonor.gained && noDonor.refused && s.skills.blacksmithing === 100);

  // Part of the way over: only the shortfall is taken.
  s = seven();
  s.skills.mining = 0; s.skills.magery = 99.95;      // total 699.95, headroom 0.05
  setLock(s, 'blacksmithing', 'down');
  check('the sheet is 0.05 under the cap', total(s) === 699.95, `${total(s)}`);
  const partial = rollGain(s, 'mining', 0, true, () => 0);
  check('crossing the cap takes only the shortfall, not a flat 0.1',
    partial.gained && partial.to === 0.1 && partial.tookFrom.amount === 0.05 && s.skills.blacksmithing === 99.95, `took ${partial.tookFrom.amount}`);
  check('and that lands the sheet exactly on 700.0', total(s) === TOTAL_CAP, `${total(s)}`);

  // Well under the cap nothing is taken at all.
  const room = { skills: { mining: 20, magery: 30 }, locks: { magery: 'down' } };
  const free = rollGain(room, 'mining', 20, true, () => 0);
  check('under the cap a gain is free and the full band step', free.gained && free.to === 20.3 && free.tookFrom === null && room.skills.magery === 30);
  check('total() adds the sheet up to the hundredth', total(room) === 50.3, `${total(room)}`);
}

console.log('\n--- 9. milestones ----------------------------------------------------------');
{
  const ats = grind.milestones.map((m) => m.at);
  console.log(`  the walk to 100 fired ${ats.length} milestones: ${ats.join(', ')}`);
  check('every round ten fired, exactly once, in order', ats.join(',') === '10,20,30,40,50,60,70,80,90,100');
  check('the ten mid milestones name the skill and the number', grind.milestones[4].text === 'Mining 50' && !grind.milestones[4].grandmaster);
  const last = grind.milestones[grind.milestones.length - 1];
  check('100.0 says Grandmaster', last.at === 100 && last.grandmaster === true && last.text === 'Grandmaster Mining', `"${last.text}"`);
  check('the document asks for exactly that word', DOC.includes('Reaching 100.0 says **Grandmaster Mining**'));
  // and a gain that crosses nothing says nothing
  const quiet = rollGain({ skills: { mining: 10.2 }, locks: {} }, 'mining', 10, true, () => 0);
  check('a gain inside a ten is silent', quiet.gained && quiet.to === 10.5 && quiet.milestone === null);
  const loud = rollGain({ skills: { mining: 9.9 }, locks: {} }, 'mining', 10, true, () => 0);
  check('a gain that crosses one is not', loud.to === 10.2 && loud.milestone.at === 10 && loud.milestone.text === 'Mining 10');
  check('no milestone below ten', rollGain({ skills: { mining: 0 }, locks: {} }, 'mining', 0, true, () => 0).milestone === null);
}

console.log('\n--- 10. locks --------------------------------------------------------------');
{
  const s = { skills: { mining: 50 }, locks: {} };
  check('a skill nobody has touched is up', lockOf(s, 'mining') === 'up' && lockOf(s, 'fishing') === 'up');
  for (const l of LOCKS) {
    const r = setLock(s, 'mining', l);
    check(`"${l}" is accepted and written`, r.ok && r.lock === l && s.locks.mining === l);
  }
  setLock(s, 'mining', 'down');
  const bad = setLock(s, 'mining', 'sideways');
  check('an unknown lock is rejected and says the three that are not', !bad.ok && /not a lock/.test(bad.reason), `"${bad.reason}"`);
  check('and the lock it had is untouched', s.locks.mining === 'down' && bad.lock === 'down');
  for (const v of [null, undefined, 'UP', 'Down', 1, true, '']) {
    check(`${JSON.stringify(v)} is rejected too`, !setLock(s, 'mining', v).ok && s.locks.mining === 'down');
  }
  const unknown = setLock(s, 'basketweaving', 'down');
  check('a lock on a skill that does not exist is rejected', !unknown.ok && /not a skill/.test(unknown.reason) && s.locks.basketweaving === undefined);
  const nostate = setLock(null, 'mining', 'up');
  check('no character is rejected rather than thrown', !nostate.ok);
  const madeUp = { skills: { mining: 50 } };
  check('a state with no locks object at all still takes a lock', setLock(madeUp, 'mining', 'locked').ok && madeUp.locks.mining === 'locked');
  const junk = { skills: { mining: 50 }, locks: { mining: 'sideways' } };
  check('a junk lock already in a save reads as up rather than jamming the skill',
    lockOf(junk, 'mining') === 'up' && rollGain(junk, 'mining', 50, true, () => 0).gained);
}

console.log(`\n  ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
