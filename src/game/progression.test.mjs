// Getting better, and being told about it. Run: node src/game/progression.test.mjs
//
// Every dependency is a fake that records what it was asked to do, so this file
// proves the words as well as the numbers. The curve is measured, not asserted:
// the counts below are printed and any change to skills.js moves them.
import {
  createProgression, gainText, statText,
  MILESTONE_CUE, STAT_MILESTONE_CUE, GRANDMASTER_CUE,
} from './progression.js';
import { blankCharacter } from './state.js';
import { playerActor } from './actor.js';
import { CUES } from './audio.js';
import { SKILL_CAP, TOTAL_CAP, gainChance, BANDS } from '../mmo/skills.js';
import { STAT_TOTAL_CAP } from '../mmo/stats.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

/** A tiny deterministic rng, so a run is a run and not a mood. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rig(opts = {}) {
  const character = opts.character || blankCharacter();
  const actor = playerActor(character);
  const floats = [];
  const toasts = [];
  const cues = [];
  const touched = [];
  const prog = createProgression({
    character, actor,
    floaters: { spawn: (pos, text, kind) => floats.push({ text, kind, pos }) },
    hud: { toast: (text, kind) => toasts.push({ text, kind }) },
    audio: { play: (cue) => cues.push(cue) },
    state: { touch: (what) => touched.push(what) },
  });
  return { character, actor, prog, floats, toasts, cues, touched,
    lastFloat: () => floats[floats.length - 1] || null,
    lastToast: () => toasts[toasts.length - 1] || null };
}

const always = () => 0;      // every roll succeeds
const never = () => 1;       // no roll ever succeeds

// ---- the cue really exists -------------------------------------------------
{
  for (const cue of [MILESTONE_CUE, STAT_MILESTONE_CUE, GRANDMASTER_CUE]) {
    check(`the cue "${cue}" is a real row in audio.js CUES`, !!CUES[cue], Object.keys(CUES).join(', '));
  }
  // This used to assert that no better-named row existed, because none did and
  // `discover` was standing in for all three. They exist now.
  check('the three are the real ones, not the discovery chime standing in',
    MILESTONE_CUE === 'skill_up' && STAT_MILESTONE_CUE === 'stat_up' && GRANDMASTER_CUE === 'grandmaster'
    && MILESTONE_CUE !== 'discover',
    `${MILESTONE_CUE}, ${STAT_MILESTONE_CUE}, ${GRANDMASTER_CUE}`);
  check('and a skill point, a stat point and a grandmastery are three different sounds',
    new Set([CUES[MILESTONE_CUE].file, CUES[STAT_MILESTONE_CUE].file, CUES[GRANDMASTER_CUE].file]).size === 3,
    [CUES[MILESTONE_CUE].file, CUES[STAT_MILESTONE_CUE].file, CUES[GRANDMASTER_CUE].file].join(' '));
}

// ---- one lesson, from both sides of the roll -------------------------------
{
  const r = rig();
  const miss = r.prog.lesson('mining', 10, true, never);
  check('an unlucky roll gains nothing', miss.gained === false && miss.refused === false);
  check('and says nothing, because nothing happened', r.floats.length === 0 && r.toasts.length === 0);

  const hit = r.prog.lesson('mining', 10, true, always);
  check('a lucky roll gains the band step of 0.3', hit.gained === true && hit.to === 0.3, `${hit.from} to ${hit.to}`);
  check('the skill on the document really moved', r.character.skills.mining === 0.3, String(r.character.skills.mining));
  check('a green floater says "+0.3 Mining"', r.lastFloat().text === '+0.3 Mining' && r.lastFloat().kind === 'gain', JSON.stringify(r.lastFloat().text));
  check('and it is over the player', r.lastFloat().pos === r.actor.pos);
  check('the HUD was told to redraw', r.touched.includes('skills'));
}

// ---- the gain floater text at every band -----------------------------------
{
  check('the 30 to 50 band reads "+0.2 Mining"', gainText('mining', 0.2) === '+0.2 Mining');
  check('the 70 to 85 band reads "+0.05 Mining"', gainText('mining', 0.05) === '+0.05 Mining');
  check('the last band reads "+0.01 Mining"', gainText('mining', 0.01) === '+0.01 Mining');
  check('a stat reads "+1 STR"', statText('str') === '+1 STR');
  check('and the display name is the document\'s, not the id', gainText('evaluatingIntelligence', 0.3) === '+0.3 Evaluating Intelligence');
}

// ---- a failed attempt still teaches, at half the chance --------------------
{
  const r = rig();
  const half = gainChance(0, 10) * 0.5;
  const justUnder = () => half - 1e-9;
  const justOver = () => half + 1e-9;
  check('a miss at just under half the chance still teaches', r.prog.lesson('mining', 10, false, justUnder).gained === true, `chance ${half}`);
  const r2 = rig();
  check('and a miss at just over it does not', r2.prog.lesson('mining', 10, false, justOver).gained === false);
}

// ---- the whole climb, counted ----------------------------------------------
{
  const r = rig();
  let lessons = 0;
  while (r.character.skills.mining < SKILL_CAP && lessons < 100000) {
    r.prog.lesson('mining', 100, true, always);   // difficulty 100 so nothing is refused
    lessons++;
  }
  // 01-STATS-SKILLS: "about 1,533 successful lessons". Counted by walking the
  // real bands, a step at a time, which lands two short of the naive division
  // because a step that crosses a band boundary overshoots it: 100 + 100 + 200
  // + 300 + 334 + 498.
  const naive = BANDS.reduce((t, b) => t + Math.ceil((b.max - b.min) / b.step), 0);
  check(`0.0 to 100.0 takes ${lessons} successful lessons, and 01 says about 1,533`, Math.abs(lessons - 1533) <= 2, `${lessons} measured, ${naive} by dividing each band`);
  check('and the skill lands exactly on 100.0', r.character.skills.mining === 100, String(r.character.skills.mining));
  check('at three seconds a swing that is 77 minutes, which is what 01 promises', Math.round(lessons * 3 / 60) === 77, `${Math.round(lessons * 3 / 60)} minutes`);
}
{
  // The realistic number: ten thousand attempts at a task exactly as hard as
  // you are, which is what "work at the edge of what you can do" means.
  const r = rig();
  const rng = mulberry32(1234);
  let gains = 0;
  for (let i = 0; i < 10000; i++) {
    const skill = r.character.skills.swordsmanship;
    if (r.prog.lesson('swordsmanship', skill, true, rng).gained) gains++;
  }
  const got = r.character.skills.swordsmanship;
  check('10,000 lessons at fair difficulty from 0 reach a real number', got > 60 && got <= 100, `${got.toFixed(1)} Swordsmanship from ${gains} gains in 10,000 attempts`);
  check('the chance at a fair difficulty is 0.55 the whole way', gainChance(0, 0) === 0.55 && gainChance(90, 90) === 0.55);
  check('and grinding rats at 90 is 0.04, which is why you do not', Math.abs(gainChance(90, 5) - 0.04) < 1e-9, String(gainChance(90, 5)));
}

// ---- milestones -------------------------------------------------------------
{
  const r = rig();
  r.character.skills.mining = 9.9;
  const res = r.prog.lesson('mining', 100, true, always);
  check('crossing a round ten is a milestone', !!res.milestone && res.milestone.at === 10, JSON.stringify(res.milestone));
  check('and it toasts "Mining 10"', r.lastToast().text === 'Mining 10' && r.lastToast().kind === 'good', JSON.stringify(r.lastToast()));
  check('and plays the skill cue', r.cues[r.cues.length - 1] === MILESTONE_CUE, r.cues.join(','));

  const before = r.toasts.length;
  r.character.skills.mining = 10.5;
  r.prog.lesson('mining', 100, true, always);
  check('a gain that crosses nothing toasts nothing', r.toasts.length === before, `${r.toasts.length}`);
  check('but still floats', r.lastFloat().text === '+0.3 Mining');

  r.character.skills.mining = 99.99;
  const gm = r.prog.lesson('mining', 100, true, always);
  check('reaching 100.0 says Grandmaster Mining', gm.milestone.text === 'Grandmaster Mining', JSON.stringify(gm.milestone));
  check('and the fanfare plays, not the two note rise',
    r.cues[r.cues.length - 1] === GRANDMASTER_CUE, r.cues.slice(-3).join(','));
}
{
  // the other side of the same gate: a stat at 100 is a grandmastery too, one
  // short of it is not
  const r = rig();
  r.character.stats.str = 89;
  r.prog.statLesson('str', always);
  check('a stat reaching 90 is the ordinary stat cue',
    r.cues[r.cues.length - 1] === STAT_MILESTONE_CUE, r.cues.join(','));
  r.character.stats.str = 99;
  r.prog.statLesson('str', always);
  check('and a stat reaching 100 is the fanfare',
    r.character.stats.str === 100 && r.cues[r.cues.length - 1] === GRANDMASTER_CUE,
    `${r.character.stats.str}, ${r.cues.join(',')}`);
}

// ---- locks, driven all three ways ------------------------------------------
{
  const r = rig();
  r.character.skillLocks.mining = 'locked';
  const locked = r.prog.lesson('mining', 10, true, always);
  check('a locked skill does not rise', locked.gained === false && locked.refused === true);
  check('and says which one and why', r.lastToast().text.includes('Mining is locked'), JSON.stringify(r.lastToast().text));

  r.character.skillLocks.mining = 'down';
  const down = r.prog.lesson('mining', 10, true, always);
  check('a skill marked to fall does not rise', down.refused === true);
  check('and says so in different words', r.lastToast().text.includes('marked to fall'), JSON.stringify(r.lastToast().text));

  r.character.skillLocks.mining = 'up';
  check('and marked up it rises again', r.prog.lesson('mining', 10, true, always).gained === true, String(r.character.skills.mining));
}

// ---- the refusal is said once, not sixty times a minute --------------------
{
  const r = rig();
  r.character.skillLocks.mining = 'locked';
  for (let i = 0; i < 20; i++) r.prog.lesson('mining', 10, true, always);
  check('20 refused lessons say it once', r.toasts.length === 1, `${r.toasts.length} toasts for 20 lessons`);
  r.character.skillLocks.mining = 'down';
  r.prog.lesson('mining', 10, true, always);
  check('and a different reason is said again', r.toasts.length === 2, `${r.toasts.length}`);
}

// ---- the 700 cap, both with something to give and without ------------------
{
  const r = rig();
  // 7 skills at 100 is exactly 700.
  const seven = ['mining', 'lumberjacking', 'fishing', 'foraging', 'skinning', 'cooking', 'alchemy'];
  for (const id of seven) r.character.skills[id] = 100;
  r.character.skills.swordsmanship = 0;
  const stuck = r.prog.lesson('swordsmanship', 100, true, always);
  check(`at ${TOTAL_CAP} with nothing marked down the gain is refused`, stuck.refused === true, stuck.reason);
  check('and the refusal names the total and says what to do', r.lastToast().text.includes('700.0') && r.lastToast().text.includes('marked to fall'), JSON.stringify(r.lastToast().text));

  r.character.skillLocks.alchemy = 'down';
  const paid = r.prog.lesson('swordsmanship', 100, true, always);
  check('marking one down pays for the gain', paid.gained === true && paid.tookFrom && paid.tookFrom.id === 'alchemy', JSON.stringify(paid.tookFrom));
  check('exactly 0.1 moves, so the sheet stays on 700', paid.tookFrom.amount === 0.1 && r.character.skills.alchemy === 99.9, `${r.character.skills.alchemy}`);
  check('and both names are said out loud', r.lastToast().text.includes('Swordsmanship') && r.lastToast().text.includes('Alchemy'), JSON.stringify(r.lastToast().text));
}

// ---- stats -------------------------------------------------------------------
{
  const r = rig();
  const before = r.actor.maxHealth;
  const missed = r.prog.statLesson('con', never);
  check('an unlucky stat roll gains nothing and says nothing', missed.gained === false && r.floats.length === 0);
  const got = r.prog.statLesson('con', always);
  check('a lucky one is exactly +1', got.gained === true && r.character.stats.con === 51, String(r.character.stats.con));
  check('and floats "+1 CON" in the larger stat style', r.lastFloat().text === '+1 CON' && r.lastFloat().kind === 'stat', JSON.stringify(r.lastFloat()));
  check('the actor was recomputed, so the health bar really grew', r.actor.maxHealth === before + 2, `${before} then ${r.actor.maxHealth}`);
  check('and the HUD was told', r.touched.includes('stats'));
}
{
  const r = rig();
  r.character.stats.str = 59;
  r.prog.statLesson('str', always);
  check('a stat crossing a round ten toasts', r.lastToast().text === 'Strength 60', JSON.stringify(r.lastToast().text));
  check('and plays the stat cue, which is not the skill one',
    r.cues[r.cues.length - 1] === STAT_MILESTONE_CUE && STAT_MILESTONE_CUE !== MILESTONE_CUE, r.cues.join(','));
  const n = r.toasts.length;
  r.prog.statLesson('str', always);
  check('and 61 does not', r.toasts.length === n && r.character.stats.str === 61, String(r.character.stats.str));
}
{
  const r = rig();
  r.character.statLocks.str = 'locked';
  const res = r.prog.statLesson('str', always);
  check('a locked stat does not rise', res.gained === false && res.refused === true && r.character.stats.str === 50);
  check('and says so', r.lastToast().text === 'STR is locked and will not rise.', JSON.stringify(r.lastToast().text));
  r.character.statLocks.str = 'down';
  r.prog.statLesson('str', always);
  check('a stat marked to fall does not rise either', r.character.stats.str === 50 && r.lastToast().text.includes('marked to fall'));
  r.character.statLocks.str = 'up';
  check('and up, it does', r.prog.statLesson('str', always).gained === true && r.character.stats.str === 51);
}
{
  const r = rig();
  r.character.stats = { str: 100, dex: 100, int: 100, con: 60, wis: 40 };   // 400
  const res = r.prog.statLesson('con', always);
  check(`at the ${STAT_TOTAL_CAP} stat cap nothing rises`, res.refused === true && r.character.stats.con === 60, res.reason);
  check('and it says the total and that something has to fall', r.lastToast().text.includes('400'), JSON.stringify(r.lastToast().text));
  const capped = rig();
  capped.character.stats.str = 100;
  const at = capped.prog.statLesson('str', always);
  check('a stat already at 100 says so instead', at.refused === true && at.reason.includes('cap of 100'), at.reason);
}

// ---- the batch shape combat_rules hands back --------------------------------
{
  const r = rig();
  const lessons = [
    { who: 'attacker', kind: 'skill', skill: 'swordsmanship', stat: null, difficulty: 40, success: true },
    { who: 'attacker', kind: 'stat', skill: null, stat: 'str', difficulty: 40, success: true },
    { who: 'defender', kind: 'skill', skill: 'parrying', stat: null, difficulty: 40, success: true },
  ];
  const out = r.prog.applyLessons(lessons, 'attacker', always);
  check('a batch applies only the side you asked for', out.length === 2, `${out.length} of ${lessons.length}`);
  check('the skill went up', r.character.skills.swordsmanship === 0.3, String(r.character.skills.swordsmanship));
  check('the stat went up', r.character.stats.str === 51, String(r.character.stats.str));
  check('and Parrying, which was the defender\'s, did not', r.character.skills.parrying === 0);
}

// ---- everything optional -----------------------------------------------------
{
  const character = blankCharacter();
  const prog = createProgression({ character });
  const res = prog.lesson('mining', 10, true, always);
  check('with no floaters, no hud, no audio and no actor it still teaches', res.gained === true && character.skills.mining === 0.3, String(character.skills.mining));
  check('and a stat lesson still lands', prog.statLesson('str', always).gained === true && character.stats.str === 51);
  check('the totals are readable for a character sheet', prog.skillTotal === 0.3 && prog.statTotal === 251, `${prog.skillTotal} skill, ${prog.statTotal} stat`);
  let threw = null;
  try { createProgression({}); } catch (e) { threw = e; }
  check('but with no character at all it fails loudly', !!threw, threw ? threw.message : 'it did not throw');
}

// ---- a skill that does not exist ---------------------------------------------
{
  const r = rig();
  const res = r.prog.lesson('swimmming', 10, true, always);
  check('a misspelled skill is refused, not invented', res.refused === true && !('swimmming' in r.character.skills), res.reason);
  check('and says which word was wrong', r.lastToast().text.includes('swimmming'), JSON.stringify(r.lastToast().text));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
