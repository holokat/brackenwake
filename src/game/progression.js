// Getting better at things. Every swing, every strike of a pickaxe, every
// spell and every hit taken comes through here, and every one of them that
// changes the character says so on screen.
//
//   const prog = createProgression({ character, actor, floaters, hud, audio, state });
//   prog.lesson('mining', 10, true, rng);     // a copper vein is difficulty 10
//   prog.statLesson('str', rng);              // a heavy swing that landed
//
// The rules are src/mmo/skills.js rollGain and src/mmo/stats.js rollStatGain,
// which own the bands, the chances, the 100 cap, the 700 cap and the lock that
// pays for a gain. This file owns what the player sees, and nothing else.
//
// Every dependency is optional. With none of them the numbers still move, which
// is what lets progression.test.mjs run in node against fakes that record calls.
//
// ---------------------------------------------------------------------------
// WHAT THIS FILE INVENTS
// ---------------------------------------------------------------------------
// 1. Stat locks. 07-RUNTIME-CONTRACT gives the document a `statLocks` map and
//    stats.js has no lock rule at all, so the rule is here: a stat marked
//    locked or down does not rise, and says which. Unlike skills there is
//    nothing to take the point from, so nothing falls to pay for it.
//
// 2. The milestone cues. audio.js used to have no sound for getting better at
//    something and this file borrowed `discover`, the chime for finding a site.
//    It has three of its own now, made by tools/synth-sfx.mjs: a two note rise
//    for a skill's round ten, a three note rise for a stat's, and a fanfare for
//    a 100. W1.md asked for a real one; there are three, because a skill point
//    and a grandmastery are not the same news.
//
// 3. The refusal rule. "Every state change owes the player words" cuts both
//    ways: a lesson refused at the 700 cap is not a state change but it is the
//    reason nothing is happening, so it is said once and then not again until
//    the reason itself changes. Otherwise a grandmaster mining a vein would
//    read the same line sixty times a minute.

import { rollGain, SKILL_BY_ID, lockOf, TOTAL_CAP, total as skillTotal } from '../mmo/skills.js';
import { rollStatGain, STATS, STAT_GAIN, STAT_CAP, statTotal } from '../mmo/stats.js';
import { STAT_LABELS, STAT_NAMES } from '../mmo/openings.js';
import { ABILITIES, ABILITIES_BY_ID, meetsRequirements } from '../mmo/abilities.js';
import { BAR_KEYS } from './abilities_runtime.js';
import { recompute } from './actor.js';

/** A skill crossing a round ten: two notes going up. */
export const MILESTONE_CUE = 'skill_up';
/** A stat crossing a round ten: three notes going up, the same voice. */
export const STAT_MILESTONE_CUE = 'stat_up';
/** 100, in either. Most characters hear this a handful of times ever. */
export const GRANDMASTER_CUE = 'grandmaster';

/** A stat milestone is every round ten, the same shape skills.js uses. */
export const STAT_MILESTONE_STEP = 10;

/** A new ability crossing its mark: three notes and a lift. */
export const UNLOCK_CUE = 'grandmaster';

// ---------------------------------------------------------------------------
// The unlock banner
// ---------------------------------------------------------------------------
//
// An ability becomes available the moment `meetsRequirements` starts saying yes
// for it, and until now NOTHING TOLD THE PLAYER. Magery went from 24 to 25 and
// Fireball was simply there, on a list, in a window, behind a key, and the only
// way to find out was to go and look. So every skill gain and every stat gain
// asks the same question `unlockedFor` answers, and anything new gets the
// banner and a line saying how to reach it.
//
// DRIVEN FROM THE GAIN, NOT FROM A POLL. There is one place in the game where a
// skill moves and it is `lesson` below, and one where a stat does and it is
// `statLesson`; a second timer walking the table every few seconds would be a
// second source of truth and would eventually disagree with this one.
//
// ONCE PER ABILITY PER CHARACTER. `character.unlockedAbilities` is the record,
// written into the document and therefore into the save, so a reload does not
// play twenty banners for abilities the player has had for a week. The FIRST
// time a character is seen the list is seeded SILENTLY from whatever it already
// meets, because an opening that grants Magery 50 has not just unlocked eight
// spells, it started with them.

/** Every ability id this spread of skills and stats can use right now. */
export function unlockedIds(character) {
  const skills = character?.skills || {};
  const stats = character?.stats || {};
  const out = [];
  for (const a of ABILITIES) if (meetsRequirements(a, skills, stats).ok) out.push(a.id);
  return out;
}

/**
 * How to reach a newly unlocked ability, in words a player can act on: the key
 * it is already bound to, or how to bind it. `bar` is the character's own
 * twelve slots.
 */
export function unlockHint(ability, character) {
  if (!ability) return '';
  if (ability.passive) return 'Always on. Nothing to press.';
  const bar = Array.isArray(character?.bar) ? character.bar : [];
  const at = bar.indexOf(ability.id);
  if (at >= 0 && BAR_KEYS[at]) return `Press ${BAR_KEYS[at].toUpperCase()}`;
  const free = bar.findIndex((x, i) => !x && i < BAR_KEYS.length);
  return free >= 0
    ? `Open Abilities (P) and drag it onto slot ${BAR_KEYS[free].toUpperCase()}`
    : 'Open Abilities (P) to put it on the bar';
}

/** 0.3 reads "0.3", 0.05 reads "0.05", 1 reads "1". No trailing zeroes. */
const trim = (v) => String(Math.round(v * 100) / 100);

/** The line a skill gain puts over the player's head: "+0.3 Mining". */
export function gainText(skillId, amount, after) {
  const def = SKILL_BY_ID.get(skillId);
  const level = Number.isFinite(after) ? ` (${after.toFixed(1)})` : '';
  return `+${trim(amount)} ${def ? def.name : skillId}${level}`;
}

/** The line a stat gain puts over the player's head: "+1 STR". */
export function statText(stat, amount = STAT_GAIN, after) {
  const level = Number.isFinite(after) ? ` (${after})` : '';
  return `+${trim(amount)} ${STAT_LABELS[stat] || String(stat).toUpperCase()}${level}`;
}

export function createProgression({ character, actor, floaters, hud, audio, state, onUnlock } = {}) {
  if (!character || typeof character !== 'object') {
    throw new Error('createProgression: there is no character to teach');
  }
  if (!character.skills || typeof character.skills !== 'object') character.skills = {};
  if (!character.skillLocks || typeof character.skillLocks !== 'object') character.skillLocks = {};
  if (!character.stats || typeof character.stats !== 'object') character.stats = {};
  if (!character.statLocks || typeof character.statLocks !== 'object') character.statLocks = {};

  // The last refusal said for each skill or stat, so the same one is not
  // repeated every swing. See note 3.
  const lastRefusal = new Map();

  // What this character has already been told about. Seeded silently the first
  // time, so a save written before the banner existed does not replay its whole
  // history the moment it loads.
  // MISSING OR EMPTY BOTH MEAN "NEVER SEEDED", and the second half of that is
  // not a convenience. `state.blankCharacter` declares the field as `[]`, so a
  // brand new document arrives with an empty list, and an empty list is never a
  // TRUE statement about any character: Jump and Sprint gate on no skill at all
  // (`gatingSkillValue` answers Infinity for a row with no skill), so every
  // character that has ever existed meets at least two. Treating `[]` as a real
  // record would have played the whole starting kit as banners on the first
  // swing of a new character's life. progression.test.mjs drives both.
  const seeded = Array.isArray(character.unlockedAbilities) && character.unlockedAbilities.length > 0;
  if (!seeded) character.unlockedAbilities = unlockedIds(character);
  const known = new Set(character.unlockedAbilities);

  const where = () => (actor && actor.pos) || { x: 0, y: 0, z: 0 };

  const say = (text, kind) => { hud?.toast?.(text, kind); return text; };

  function float(text, kind) {
    floaters?.spawn?.(where(), text, kind, { anchorKey: 'player' });
    return text;
  }

  /**
   * Anything the last gain has just made available: the banner, the sound, a
   * line in the log naming the key, and the id written into the document so it
   * never plays twice. Returns the ability records, in table order, so two
   * crossed at once queue in the order the tables print them.
   */
  function announceUnlocks() {
    const found = [];
    for (const id of unlockedIds(character)) {
      if (known.has(id)) continue;
      known.add(id);
      character.unlockedAbilities.push(id);
      const ability = ABILITIES_BY_ID[id];
      if (ability) found.push(ability);
    }
    if (!found.length) return [];
    for (const a of found) {
      const hint = unlockHint(a, character);
      hud?.unlock?.({ id: a.id, name: a.name, key: hint });
      say(`${a.name} is yours. ${a.description || ''} ${hint}.`.replace(/\s+/g, ' ').trim(), 'good');
    }
    audio?.play?.(UNLOCK_CUE);
    state?.touch?.('skills');
    // The abilities runtime has to re-read the passives: Fleet Foot and Arcane
    // Mastery both become real at a skill mark and are data on the actor, not
    // a key. app/systems/abilities.js hands its `applyPassives` in.
    try { onUnlock?.(found); } catch (err) { /* a banner is never worth a crash */ }
    return found;
  }

  function refuse(key, reason) {
    if (!reason) return null;
    if (lastRefusal.get(key) === reason) return null;
    lastRefusal.set(key, reason);
    return say(reason, 'bad');
  }

  /**
   * One skill lesson. `difficulty` is the task's own number: a copper vein is
   * 10, a rat is 5, a wraith is 70. `success` says whether the attempt worked;
   * a failure still teaches, at half the chance.
   *
   * Returns the whole rollGain result plus `said`, the lines that went on
   * screen, so a test can prove that a change was announced.
   */
  function lesson(skillId, difficulty = 0, success = true, rng = Math.random) {
    const sheet = { skills: character.skills, locks: character.skillLocks };
    const res = rollGain(sheet, skillId, difficulty, success, rng);
    const said = [];

    if (res.refused) {
      const line = refuse(`skill:${skillId}`, res.reason);
      if (line) said.push(line);
      return { ...res, said, floated: null };
    }
    if (!res.gained) return { ...res, said, floated: null };

    lastRefusal.delete(`skill:${skillId}`);
    recompute?.(actor);

    const amount = Math.round((res.to - res.from) * 100) / 100;
    const floated = float(gainText(skillId, amount, res.to), 'gain');

    // A skill that paid for itself out of another one owes both names.
    if (res.tookFrom) {
      said.push(say(
        `${SKILL_BY_ID.get(skillId).name} is ${res.to.toFixed(1)}, and ${res.tookFrom.name} `
        + `gave up ${trim(res.tookFrom.amount)} to pay for it. Your skills are full at ${TOTAL_CAP.toFixed(1)}.`,
        'good',
      ));
    }
    if (res.milestone) {
      said.push(say(res.milestone.text, 'good'));
      // skills.js sets `grandmaster` when the milestone is the cap, and its own
      // text changes to "Grandmaster Mining" there, so the sound changes with it.
      audio?.play?.(res.milestone.grandmaster ? GRANDMASTER_CUE : MILESTONE_CUE);
    }
    state?.touch?.('skills');
    const unlocked = announceUnlocks();
    return { ...res, said, floated, unlocked };
  }

  /**
   * One stat lesson: a landed swing for STR, a dodge for DEX, a cast for INT, a
   * hit taken for CON, a heal for WIS. Always +1 when it lands, and always
   * announced.
   */
  function statLesson(stat, rng = Math.random) {
    const said = [];
    const label = STAT_LABELS[stat] || String(stat).toUpperCase();

    // See note 1: the lock rule is this file's, because stats.js has none.
    const lock = character.statLocks[stat];
    if (lock === 'locked' || lock === 'down') {
      const reason = lock === 'locked'
        ? `${label} is locked and will not rise.`
        : `${label} is marked to fall and will not rise.`;
      const line = refuse(`stat:${stat}`, reason);
      if (line) said.push(line);
      return { gained: false, value: character.stats[stat] || 0, refused: true, reason, chance: 0, said, floated: null };
    }

    const res = rollStatGain(character.stats, stat, rng);
    if (res.refused) {
      const line = refuse(`stat:${stat}`, res.reason ? `${res.reason}.` : null);
      if (line) said.push(line);
      return { ...res, said, floated: null };
    }
    if (!res.gained) return { ...res, said, floated: null };

    lastRefusal.delete(`stat:${stat}`);
    recompute?.(actor);

    const floated = float(statText(stat, STAT_GAIN, res.value), 'stat');
    if (res.value % STAT_MILESTONE_STEP === 0) {
      said.push(say(`${STAT_NAMES[stat] || label} ${res.value}`, 'good'));
      // A stat at 100 is the same news as a skill at 100, so it gets the same
      // fanfare. One case is never the case.
      audio?.play?.(res.value >= STAT_CAP ? GRANDMASTER_CUE : STAT_MILESTONE_CUE);
    }
    state?.touch?.('stats');
    // A stat gain unlocks too: Leap Slam wants STR 50, Berserk CON 60,
    // Disengage DEX 55 and Evasion DEX 70. Four rows that would have crossed
    // their mark in silence if only skills were watched. One case is never the
    // case.
    const unlocked = announceUnlocks();
    return { ...res, said, floated, unlocked };
  }

  /**
   * A batch of lessons, which is the shape combat_rules.resolveMelee hands
   * back: `[{ who, kind, skill, stat, difficulty, success }]`. Only the ones
   * belonging to `who` are applied, so one call can be given the whole list.
   */
  function applyLessons(lessons, who = 'attacker', rng = Math.random) {
    const out = [];
    for (const l of lessons || []) {
      if (!l || l.who !== who) continue;
      if (l.kind === 'stat' && l.stat) out.push(statLesson(l.stat, rng));
      else if (l.skill) out.push(lesson(l.skill, l.difficulty, l.success, rng));
    }
    return out;
  }

  return {
    lesson,
    statLesson,
    applyLessons,
    /** The ids this character has already been shown a banner for. */
    get unlocked() { return [...known]; },
    /** Ask the question outside a gain: a respec, a stat scroll, the dev bench. */
    announceUnlocks,
    unlockHint: (ability) => unlockHint(ability, character),
    /** What the character sheet prints under the skill list. */
    get skillTotal() { return skillTotal({ skills: character.skills }); },
    get statTotal() { return statTotal(character.stats); },
    lockOf: (id) => lockOf({ skills: character.skills, locks: character.skillLocks }, id),
    /** Every stat this game has, for a window that draws them all. */
    stats: STATS,
    /** Forget every refusal, so the next one is said again. Used when a window opens. */
    resetSpoken() { lastRefusal.clear(); },
  };
}
