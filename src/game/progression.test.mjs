// Getting better, and being told about it. Run: node src/game/progression.test.mjs
//
// Every dependency is a fake that records what it was asked to do, so this file
// proves the words as well as the numbers. The curve is measured, not asserted:
// the counts below are printed and any change to skills.js moves them.
import {
  createProgression, gainText, statText, unlockedIds, unlockHint, starterBar, pruneBar,
  MILESTONE_CUE, STAT_MILESTONE_CUE, GRANDMASTER_CUE, UNLOCK_CUE,
} from './progression.js';
import { ABILITIES_BY_ID } from '../mmo/abilities.js';
import { blankCharacter } from './state.js';
import { playerActor } from './actor.js';
import { CUES } from './audio.js';
import { SKILL_CAP, TOTAL_CAP, gainChance, BANDS } from '../mmo/skills.js';
import { STAT_TOTAL_CAP } from '../mmo/stats.js';
import { OPENINGS_BY_ID } from '../mmo/openings.js';

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
  if (opts.skills) Object.assign(character.skills, opts.skills);
  if (opts.stats) Object.assign(character.stats, opts.stats);
  const actor = playerActor(character);
  const floats = [];
  const toasts = [];
  const cues = [];
  const touched = [];
  const banners = [];
  const passiveRuns = [];
  const prog = createProgression({
    character, actor,
    floaters: { spawn: (pos, text, kind) => floats.push({ text, kind, pos }) },
    hud: {
      toast: (text, kind) => toasts.push({ text, kind }),
      unlock: (entry) => { banners.push(entry); return { name: entry.name, key: entry.key, seconds: 4.2, queued: banners.length - 1 }; },
    },
    audio: { play: (cue) => cues.push(cue) },
    state: { touch: (what) => touched.push(what) },
    onUnlock: (list) => passiveRuns.push(list.map((a) => a.id)),
  });
  return { character, actor, prog, floats, toasts, cues, touched, banners, passiveRuns,
    lastFloat: () => floats[floats.length - 1] || null,
    lastToast: () => toasts[toasts.length - 1] || null };
}

const always = () => 0;      // every roll succeeds
const never = () => 1;       // no roll ever succeeds

// ---- the unlock banner -----------------------------------------------------
//
// "When a new ability is unlocked due to skill unlock, show it in a big you've
// unlocked banner." The rule is `meetsRequirements`, the moment is a gain, and
// the record is on the document so a reload does not replay a week of them.
// Every clause below is driven both ways.
console.log('\nprogression: the unlock banner');
{
  const h = rig({ skills: { magery: 24 } });
  check('a brand new character is SEEDED silently: no banner for what it woke up with',
    h.banners.length === 0 && Array.isArray(h.character.unlockedAbilities), String(h.banners.length));
  check('and Magic Arrow, which needs Magery 0, is already on the seeded list',
    h.character.unlockedAbilities.includes('magicArrow'));
  check('while Fireball, which needs 25, is not', !h.character.unlockedAbilities.includes('fireball'));

  h.character.skills.magery = 25;
  const r = h.prog.lesson('magery', 0, true, always);
  check('crossing Magery 25 raises exactly one banner',
    h.banners.length === 1 && h.banners[0].id === 'fireball', h.banners.map((b) => b.id).join(','));
  check('and the banner carries the ability name, not its id',
    h.banners[0].name === 'Fireball', h.banners[0].name);
  check('and a line saying how to get at it', /Abilities \(P\)|Press/.test(h.banners[0].key), h.banners[0].key);
  check('the gain reports what it unlocked, so a caller can act on it',
    Array.isArray(r.unlocked) && r.unlocked.length === 1 && r.unlocked[0].id === 'fireball');
  check('a sound went with it', h.cues.includes(UNLOCK_CUE), h.cues.join(','));
  check('and a log line named it too', h.toasts.some((t) => /Fireball is yours/.test(t.text)),
    h.toasts.map((t) => t.text).slice(-1)[0] || 'nothing');
  check('the passives are re-read, because an unlock may BE a passive',
    h.passiveRuns.length === 1 && h.passiveRuns[0].join(',') === 'fireball');

  // ONCE PER ABILITY. The same gain again must not play it a second time.
  h.prog.lesson('magery', 0, true, always);
  check('a second lesson in the same skill raises nothing further', h.banners.length === 1, String(h.banners.length));
  check('and the id is written into the document', h.character.unlockedAbilities.includes('fireball'));
}
{
  // TWO AT ONCE QUEUE. Magery 45 crosses Lightning (45) and, with Magery
  // already past 40, Blink is on the same list the moment 40 is passed. Set the
  // skill so one gain crosses two marks together.
  const h = rig({ skills: { magery: 39 } });
  h.character.skills.magery = 45;
  h.prog.lesson('magery', 0, true, always);
  check('one gain that crosses two marks raises two banners, in table order',
    h.banners.length === 2 && h.banners[0].id === 'lightning' && h.banners[1].id === 'blink',
    h.banners.map((b) => b.id).join(','));
  check('and the log named both', h.toasts.filter((t) => /is yours/.test(t.text)).length === 2);
}
{
  // A STAT GAIN UNLOCKS TOO. Leap Slam is a weapon skill 60 and STR 50.
  const h = rig({ skills: { swordsmanship: 60 }, stats: { str: 49 } });
  check('with STR 49 Leap Slam is not unlocked', !h.character.unlockedAbilities.includes('leapSlam'));
  h.character.stats.str = 50;
  h.prog.statLesson('str', always);
  check('crossing STR 50 raises the banner for Leap Slam',
    h.banners.some((b) => b.id === 'leapSlam'), h.banners.map((b) => b.id).join(','));
}
{
  // A RELOAD DOES NOT REPLAY. The document is the record, so a fresh
  // progression over the same document says nothing at all.
  const first = rig({ skills: { magery: 25 } });
  const doc = first.character;
  check('the seeded list carries Fireball after a run at Magery 25', doc.unlockedAbilities.includes('fireball'));
  const second = rig({ character: doc });
  second.prog.lesson('magery', 0, true, always);
  check('and a second progression built on the same save raises no banner at all',
    second.banners.length === 0, second.banners.map((b) => b.id).join(','));
}
{
  // An EMPTY list is not a record, it is a document that has not been seeded.
  const bare = blankCharacter();
  check('state.blankCharacter declares the field, and it starts empty',
    Array.isArray(bare.unlockedAbilities) && bare.unlockedAbilities.length === 0);
  const h = rig({ character: bare });
  check('and an empty list is seeded rather than believed',
    h.banners.length === 0 && bare.unlockedAbilities.length > 0, `${bare.unlockedAbilities.length} seeded`);
  check('because no character has ever met nothing: Jump and Sprint gate on no skill',
    unlockedIds(blankCharacter()).includes('jump') && unlockedIds(blankCharacter()).includes('sprint'));
  h.prog.lesson('mining', 0, true, always);
  check('so the first swing of a new character raises no banner at all',
    h.banners.length === 0, h.banners.map((b) => b.id).join(','));
}
{
  // A save written before the field existed is seeded, not replayed.
  const h = rig({ skills: { magery: 45 } });
  delete h.character.unlockedAbilities;
  const fresh = createProgression({ character: h.character, actor: h.actor, hud: { toast: () => {}, unlock: () => { throw new Error('a reload must not raise a banner'); } } });
  check('a save with no record at all is seeded on sight rather than replayed',
    Array.isArray(h.character.unlockedAbilities) && h.character.unlockedAbilities.includes('lightning')
    && fresh.unlocked.length === h.character.unlockedAbilities.length,
    `${h.character.unlockedAbilities.length} seeded`);
}
{
  // the hint, both ways
  const h = rig({ skills: { magery: 100 } });
  h.character.bar[2] = 'fireball';
  check('an ability already on the bar is named by its key',
    unlockHint(ABILITIES_BY_ID.fireball, h.character) === 'Press 3',
    unlockHint(ABILITIES_BY_ID.fireball, h.character));
  check('one that is not says where to put it, and which slot is free',
    /Open Abilities \(P\) and drag it onto slot 1/.test(unlockHint(ABILITIES_BY_ID.lightning, h.character)),
    unlockHint(ABILITIES_BY_ID.lightning, h.character));
  check('and a passive says there is nothing to press',
    unlockHint(ABILITIES_BY_ID.riposte, h.character) === 'Always on. Nothing to press.',
    unlockHint(ABILITIES_BY_ID.riposte, h.character));
  check('unlockedIds is the same rule the window uses, not a copy',
    unlockedIds(h.character).includes('meteor') && !unlockedIds({ skills: {}, stats: {} }).includes('meteor'));
}

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
  check('a green floater says "+0.3 Mining (0.3)", the gain and where it stands', r.lastFloat().text === '+0.3 Mining (0.3)' && r.lastFloat().kind === 'gain', JSON.stringify(r.lastFloat().text));
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
  check('but still floats, with the level', /^\+0\.3 Mining \(\d+\.\d\)$/.test(r.lastFloat().text), r.lastFloat().text);

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
  check('and floats "+1 CON (51)" in the larger stat style', r.lastFloat().text === '+1 CON (51)' && r.lastFloat().kind === 'stat', JSON.stringify(r.lastFloat()));
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
  const start = r.character.stats.str;
  r.character.statLocks.str = 'locked';
  const res = r.prog.statLesson('str', always);
  check('a locked stat does not rise', res.gained === false && res.refused === true && r.character.stats.str === start);
  check('and says so', r.lastToast().text === 'STR is locked and will not rise.', JSON.stringify(r.lastToast().text));
  r.character.statLocks.str = 'down';
  r.prog.statLesson('str', always);
  check('a stat marked to fall does not rise either', r.character.stats.str === start && r.lastToast().text.includes('marked to fall'));
  r.character.statLocks.str = 'up';
  check('and up, it does', r.prog.statLesson('str', always).gained === true && r.character.stats.str === start + 1);
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
  check('the stat went up', r.character.stats.str === OPENINGS_BY_ID.ranger.stats.str + 1, String(r.character.stats.str));
  check('and Parrying, which was the defender\'s, did not', r.character.skills.parrying === 0);
}

// ---- everything optional -----------------------------------------------------
{
  const character = blankCharacter();
  const prog = createProgression({ character });
  const res = prog.lesson('mining', 10, true, always);
  check('with no floaters, no hud, no audio and no actor it still teaches', res.gained === true && character.skills.mining === 0.3, String(character.skills.mining));
  check('and a stat lesson still lands', prog.statLesson('str', always).gained === true && character.stats.str === OPENINGS_BY_ID.ranger.stats.str + 1);
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


// --- the starter bar ------------------------------------------------------------
console.log('\nprogression: a fresh bar carries only what the opening can use');
{
  const ranger = { opening: 'ranger', skills: { archery: 50, tracking: 40, animalLore: 30, healing: 30 }, stats: { str: 45, dex: 70, int: 30, con: 50, wis: 40 },
    equipment: { mainHand: { base: 'shortbow' } }, pack: { slots: 4, items: [{ base: 'arrow', count: 30 }, { base: 'bandage', count: 5 }, null, null] } };
  const bar = starterBar(ranger);
  check('an archer with a bow gets archer rows', bar.includes('aimedShot'), bar.join(','));
  check('and Bandage', bar.includes('bandage'));
  check('and Recall, everyone\'s way home', bar.includes('recall'));
  check('and nothing from another class, even where the skill floor is 0',
    !bar.some((id) => ['magicArrow', 'hex', 'lifeDrain', 'curseOfWeakness', 'heal', 'hide', 'poisonBlade', 'powerStrike'].includes(id)), bar.join(','));
  check('and no passive', !bar.includes('fleetFoot'));
  const unarmed = { ...ranger, equipment: {} };
  check('with empty hands the shots stay off the bar, since they could not fire', !starterBar(unarmed).includes('aimedShot'), starterBar(unarmed).join(','));
  const warrior = { opening: 'warrior', skills: { swordsmanship: 50, tactics: 50, parrying: 40 }, stats: { str: 65, dex: 50, int: 25, con: 65, wis: 45 },
    equipment: { mainHand: { base: 'longsword' } }, pack: { slots: 2, items: [null, null] } };
  const wbar = starterBar(warrior);
  check('a warrior with a sword gets Power Strike and none of the archer\'s', wbar.includes('powerStrike') && !wbar.includes('aimedShot'), wbar.join(','));
  const blank = { opening: 'blank', skills: {}, stats: {}, equipment: {}, pack: { slots: 1, items: [null] } };
  check('the Blank opening starts with Bandage and Recall and no more: jump, sprint, meditate and camp are keys, not a class', starterBar(blank).every((id) => id === 'bandage' || id === 'recall') && starterBar(blank).includes('recall'), starterBar(blank).join(','));
}


console.log('\nprogression: a bar seeded by the old rule loses what cannot be pressed');
{
  const archer = { opening: 'ranger', skills: { archery: 50, tracking: 40 }, stats: { str: 45, dex: 70, int: 30, con: 50, wis: 40 },
    bar: ['aimedShot', 'doubleShot', 'chainLightning', 'frostNova', 'greaterHeal', null, 'bandage', null, null, null, null, null] };
  const gone = pruneBar(archer);
  check('the locked rows come off and are named', gone.join(',') === 'Chain Lightning,Frost Nova,Greater Heal', gone.join(','));
  check('the unlocked rows stay where they were', archer.bar[0] === 'aimedShot' && archer.bar[1] === 'doubleShot' && archer.bar[6] === 'bandage' && archer.bar[2] === null, archer.bar.join(','));
  check('a second pass takes nothing more', pruneBar(archer).length === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
