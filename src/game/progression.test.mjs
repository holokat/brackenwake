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
import { planCharacter } from './creation.js';
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
  if (!opts.character) delete character.advancement; // This fixture exercises the legacy practice-unlock path.
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

// ---- class progression does not train combat --------------------------------
console.log('\nprogression: combat practice is class and level governed');
{
  const h = rig({ skills: { magery: 24, swordsmanship: 60 } });
  const magicBefore = h.character.skills.magery;
  const magic = h.prog.lesson('magery', 0, true, always);
  check('a spell cast cannot train Magery or announce an ability unlock',
    magic.refused && h.character.skills.magery === magicBefore && h.banners.length === 0, magic.reason);
  const swordBefore = h.character.skills.swordsmanship;
  const sword = h.prog.lesson('swordsmanship', 0, true, always);
  check('a weapon hit cannot train Swordsmanship',
    sword.refused && h.character.skills.swordsmanship === swordBefore && /class level/.test(sword.reason), sword.reason);
  check('the refusal is announced once and leaves combat capability to the talent tree',
    h.toasts.length === 2 && h.passiveRuns.length === 0, `${h.toasts.length} messages`);
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
  check('unlockedIds remains a read-only compatibility query',
    Array.isArray(unlockedIds(h.character)) && Array.isArray(unlockedIds({ skills: {}, stats: {} })));
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
    const skill = r.character.skills.mining;
    if (r.prog.lesson('mining', skill, true, rng).gained) gains++;
  }
  const got = r.character.skills.mining;
  check('10,000 profession lessons at fair difficulty from 0 reach a real number', got > 60 && got <= 100, `${got.toFixed(1)} Mining from ${gains} gains in 10,000 attempts`);
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

// ---- professions do not trade points with other skills ---------------------
{
  const r = rig();
  r.character.skills.blacksmithing = 100;
  r.character.skillLocks.blacksmithing = 'down';
  const gained = r.prog.lesson('mining', 0, true, always);
  check('a profession gain keeps an unrelated down skill unchanged',
    gained.gained && gained.tookFrom === null && r.character.skills.blacksmithing === 100);
  const combatBefore = r.character.skills.swordsmanship;
  const combat = r.prog.lesson('swordsmanship', 0, true, always);
  check('combat practice is refused without spending or moving another skill',
    combat.refused && r.character.skills.swordsmanship === combatBefore && r.character.skills.blacksmithing === 100, combat.reason);
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

// ---- combat-rule batches cannot turn combat into practice -------------------
{
  const r = rig();
  const lessons = [
    { who: 'attacker', kind: 'skill', skill: 'swordsmanship', stat: null, difficulty: 40, success: true },
    { who: 'attacker', kind: 'stat', skill: null, stat: 'str', difficulty: 40, success: true },
    { who: 'defender', kind: 'skill', skill: 'parrying', stat: null, difficulty: 40, success: true },
  ];
  const out = r.prog.applyLessons(lessons, 'attacker', always);
  check('a combat batch produces no practice or stat growth', out.length === 0, `${out.length} of ${lessons.length}`);
  check('the combat skill stayed at its saved legacy value', r.character.skills.swordsmanship === 0, String(r.character.skills.swordsmanship));
  check('the stat stayed unchanged because combat no longer grants stat practice', r.character.stats.str === OPENINGS_BY_ID.ranger.stats.str, String(r.character.stats.str));
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
  const roguePlan = planCharacter({ opening: 'rogue', name: 'Testing', seed: 13 });
  const rogue = roguePlan.character;
  const rbar = starterBar(rogue);
  check('a fresh Rogue equips two daggers before the starter bar is chosen',
    roguePlan.ok && rogue.equipment.mainHand?.base === 'dagger' && rogue.equipment.offHand?.base === 'dagger',
    JSON.stringify(rogue.equipment));
  check('and that bar places the new starter attacks',
    rbar.includes('dualStrike') && rbar.includes('hide') && !rbar.includes('throwingKnife') && !rbar.includes('deepCut'),
    rbar.join(','));
  const paladinPlan = planCharacter({ opening: 'paladin', name: 'Oath', seed: 14 });
  const paladinBar = starterBar(paladinPlan.character);
  check('a fresh Paladin keeps the sword strike and holy heal on the bar',
    paladinPlan.ok && paladinBar.includes('powerStrike') && paladinBar.includes('heal') && !paladinBar.includes('smite'),
    paladinBar.join(','));
  const priestPlan = planCharacter({ opening: 'priest', name: 'Vigil', seed: 15 });
  const priestBar = starterBar(priestPlan.character);
  check('a fresh Priest keeps Eldritch Bolt and Heal on the bar',
    priestPlan.ok && priestBar.includes('eldritchBolt') && priestBar.includes('heal') && !priestBar.includes('smite'),
    priestBar.join(','));
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
