// The skill sheet's rules. Run: node src/game/win_skills.test.mjs
//
// The lock goes through skills.setLock, and the ability columns go through
// abilities.meetsRequirements, so what is proved here is that the window asks
// the right question, not that it has its own answer.

import {
  lockState, nextLock, LOCK_CYCLE, LOCK_GLYPH, LOCK_WORDS,
  thresholdFor, abilitiesOf, standingFor,
} from './win_skills.js';
import { SKILLS, SKILL_GROUPS, lockOf, setLock, LOCKS, TOTAL_CAP } from '../mmo/skills.js';
import { ABILITIES_BY_ID } from '../mmo/abilities.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

// ---- the sheet shows all of them --------------------------------------------
check('there are fifty two skills to draw', SKILLS.length === 52, String(SKILLS.length));
check('in nine groups', SKILL_GROUPS.length === 9);
check('and every skill belongs to one of them', SKILLS.every((s) => SKILL_GROUPS.includes(s.group)));
const drawn = SKILL_GROUPS.flatMap((g) => SKILLS.filter((s) => s.group === g));
check('grouping draws each one exactly once', drawn.length === SKILLS.length && new Set(drawn.map((s) => s.id)).size === 52);

// ---- the lock cycles through all three ----------------------------------------
check('the cycle covers every lock the rules have', LOCK_CYCLE.length === LOCKS.length && LOCKS.every((l) => LOCK_CYCLE.includes(l)), LOCK_CYCLE.join(','));
check('up leads to locked', nextLock('up') === 'locked');
check('locked leads to down', nextLock('locked') === 'down');
check('and down comes back to up', nextLock('down') === 'up');
check('every state has a glyph and a sentence', LOCK_CYCLE.every((l) => LOCK_GLYPH[l] && LOCK_WORDS[l]));

// ---- the state the rules layer wants ------------------------------------------
{
  const c = { skills: { mining: 30 } };
  const st = lockState(c);
  check('lockState gives skills and locks', st.skills === c.skills && st.locks === c.skillLocks);
  check('and it made the locks map the document was missing', typeof c.skillLocks === 'object');
  const r = setLock(st, 'mining', 'down');
  check('setting a lock is accepted', r.ok === true && r.lock === 'down');
  check('and lands in the document, not in a copy', c.skillLocks.mining === 'down');
  check('and reads back', lockOf(st, 'mining') === 'down');
  const bad = setLock(st, 'mining', 'sideways');
  check('a lock nobody has is refused', bad.ok === false);
  check('and it says the three there are', /up, locked, down/.test(bad.reason), bad.reason);
  check('and the old lock is untouched', c.skillLocks.mining === 'down');
  const nope = setLock(st, 'juggling', 'up');
  check('a skill nobody has is refused too', nope.ok === false && /not a skill/.test(nope.reason), nope.reason);
  check('a skill with no lock set reads as up', lockOf(st, 'fishing') === 'up');
}

// ---- which abilities a skill gates ---------------------------------------------
check('Power Strike gates on Swordsmanship 30', thresholdFor(ABILITIES_BY_ID.powerStrike, 'swordsmanship') === 30);
check('and on Macefighting 30 too, being any weapon skill', thresholdFor(ABILITIES_BY_ID.powerStrike, 'macefighting') === 30);
check('and not on Mining at all', thresholdFor(ABILITIES_BY_ID.powerStrike, 'mining') === null);
check('Whirlwind also answers to Tactics, which is its extra requirement', thresholdFor(ABILITIES_BY_ID.whirlwind, 'tactics') === 40);
{
  const rows = abilitiesOf('swordsmanship');
  check('Swordsmanship gates a list of abilities', rows.length > 0, String(rows.length));
  check('and they are cheapest first', rows.every((r, i) => i === 0 || rows[i - 1].at <= r.at), rows.map((r) => r.at).join(','));
  check('a skill nobody wrote abilities for gates none', abilitiesOf('masonry').length === 0);
}

// ---- unlocked and unlocks next, both directions ---------------------------------
{
  const none = standingFor('swordsmanship', {}, {});
  check('at Swordsmanship 0 nothing is unlocked', none.unlocked.length === 0);
  check('and the next thing is named', !!none.next, none.next?.name);
  check('with the rules own reason for the refusal', /needs/.test(none.nextReason || ''), none.nextReason);
  const some = standingFor('swordsmanship', { swordsmanship: 30 }, {});
  check('at 30 Power Strike is unlocked', some.unlocked.some((a) => a.id === 'powerStrike'), some.unlocked.map((a) => a.name).join(','));
  check('and the next one is higher than 30', some.nextAt > 30, String(some.nextAt));
  const most = standingFor('swordsmanship', Object.fromEntries(SKILLS.map((s) => [s.id, 100])), { str: 100, dex: 100, int: 100, con: 100, wis: 100 });
  check('at 100 in everything the column has nothing left to promise', most.next === null, most.next?.name || 'none');
  check('and everything it gates is unlocked', most.unlocked.length === abilitiesOf('swordsmanship').length, `${most.unlocked.length}`);
}

// ---- every skill can say something about itself ------------------------------------
{
  const skills = Object.fromEntries(SKILLS.map((s) => [s.id, 0]));
  const silent = SKILLS.filter((s) => {
    const st = standingFor(s.id, skills, {});
    return st.unlocked.length === 0 && !st.next && !s.description;
  });
  check('no skill row would be blank', silent.length === 0, silent.map((s) => s.id).join(','));
  const total = Object.values(skills).reduce((a, b) => a + b, 0);
  check('and the sheet totals against the 700 cap', TOTAL_CAP === 700 && total === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
