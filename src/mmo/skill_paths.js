// Every skill, and the thing a character with that skill at ZERO can DO to
// start it. Pure. No THREE, no DOM, no filesystem.
//
//   import { pathsFor, auditSkillPaths } from './skill_paths.js';
//   pathsFor('mysticism')   // [{ kind: 'ability', id: 'hex', what: '...' }]
//
// WHY THIS EXISTS
//
// "how do we gain mysticism? all skills should be gainable without purchasing."
//
// The answer, before this file, was that you could not. The lowest Mysticism
// row asked for Mysticism 20, an attempt that is refused teaches nothing, and
// no recipe, vein, plant, corpse or chest in the game named the skill. The
// only door was Ellara's trainer window and 200 gold. The same was true of
// Necromancy, Chivalry, Camping, Provocation, Peacemaking, Discordance,
// Musicianship, Tracking, Stealing, Spirit Speak, Animal Lore, Stealth, Focus,
// Veterinary, Parrying and Evaluating Intelligence: sixteen skills you could
// only buy. Four of those (Parrying, Evaluating Intelligence, Stealth, Focus)
// were not even gated: their lesson was written and never reached.
//
// So this module answers, from the real tables and for every skill in
// skills.js, one question a player can act on: what do I DO to start this. A
// skill with no answer is a bug, `auditSkillPaths` throws on it, and
// skill_paths.test.mjs prints the whole table.
//
// THE FOUR KINDS OF ANSWER
//
//   ability   a row in abilities.js whose gate a character at zero already
//             meets, and whose lesson is this skill. Derived, not listed: the
//             gate is read out of the table every time this runs, so lifting a
//             row's `openAt` back up breaks the test instead of the game.
//   craft     a recipe in recipes.js whose chance at skill 0 is above the
//             floor win_crafting.js refuses under. Also derived.
//   fight     a lesson combat_rules.js pushes. Also derived: `fightPaths`
//             RUNS the real resolver against a fighter with nothing and reads
//             the lessons that come out, so a lesson behind a condition the
//             beginner cannot meet is not counted.
//   world     a `progression.lesson` call in a game file: the pickaxe, the
//             plant, the corpse, the lock, the step taken while hidden. These
//             are the only DECLARED entries, because src/game is not
//             importable in node, and skill_paths.test.mjs opens each named
//             file and fails if the call is not in it.
//
// AND THE SKILLS WITH NO ANSWER AT ALL
//
// `UNBUILT` names them and says why. They are not gates set too high; they are
// systems the game does not have yet. Fishing has no water to fish in, Herding
// has no animal to move. `auditSkillPaths` throws on a skill that is in
// neither list, AND on an UNBUILT skill that has since grown a path, so the
// list can only ever get shorter.

import { SKILLS, SKILL_BY_ID } from './skills.js';
import { ABILITIES, meetsRequirements, lessonFor, practiceChance, KNOWN_SKILLS } from './abilities.js';
import { RECIPES, craftChance, MIN_CRAFT_CHANCE } from './recipes.js';
import { resolveMelee, resolveSpell } from './combat_rules.js';

/** A character who has never done anything. Every path is measured against him. */
export const ZERO_SKILLS = Object.freeze({});
export const ZERO_STATS = Object.freeze({});

// ---------------------------------------------------------------------------
// Abilities
// ---------------------------------------------------------------------------

/**
 * Every ability a character at zero may press that teaches `skillId`.
 *
 * A passive is never pressed, so it never teaches and is never a path. A row
 * with `skillAny` teaches whichever weapon skill is in the hand, so it counts
 * for all of them.
 */
export function abilityPaths(skillId, skills = ZERO_SKILLS, stats = ZERO_STATS) {
  const out = [];
  for (const a of ABILITIES) {
    if (a.passive) continue;
    const l = lessonFor(a);
    const teaches = a.skillAny ? a.skillAny.includes(skillId) : l.skill === skillId;
    if (!teaches) continue;
    if (!meetsRequirements(a, skills, stats).ok) continue;
    const chance = practiceChance(a, skills);
    out.push({
      kind: 'ability',
      id: a.id,
      what: chance >= 1
        ? `press ${a.name}`
        : `press ${a.name}, which lands ${Math.round(chance * 100)} times in 100 at this skill and teaches either way`,
      difficulty: l.difficulty,
      chance,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Crafts
// ---------------------------------------------------------------------------

/**
 * Every recipe a character at zero is allowed to attempt that teaches
 * `skillId`. The bar is win_crafting.js's own: it refuses a recipe whose
 * chance is at or under MIN_CRAFT_CHANCE, so a recipe under that bar is not a
 * path however low its difficulty reads.
 */
export function craftPaths(skillId, skills = ZERO_SKILLS) {
  const have = typeof skills[skillId] === 'number' ? skills[skillId] : 0;
  const out = [];
  for (const r of RECIPES) {
    if (r.skill !== skillId) continue;
    const chance = craftChance(have, r.difficulty);
    if (chance <= MIN_CRAFT_CHANCE) continue;
    out.push({
      kind: 'craft',
      id: r.id,
      what: `make ${r.name || r.id} at a ${r.station}, ${Math.round(chance * 100)} in 100, and a failure teaches too`,
      difficulty: r.difficulty,
      chance,
    });
  }
  // The easiest one is the one a beginner would actually reach for.
  out.sort((a, b) => b.chance - a.chance);
  return out.slice(0, 1);
}

// ---------------------------------------------------------------------------
// Fighting
// ---------------------------------------------------------------------------

const blankFighter = (over = {}) => ({
  stats: { str: 0, dex: 0, int: 0, con: 0, wis: 0, ...(over.stats || {}) },
  skills: { ...(over.skills || {}) },
  bonuses: {},
  ar: 0,
  resists: { physical: 0, fire: 0, cold: 0, poison: 0, energy: 0 },
  weapon: over.weapon !== undefined ? over.weapon : null,
  shield: over.shield !== undefined ? over.shield : null,
  health: 100, maxHealth: 100, mana: 50, maxMana: 50, stamina: 50,
  difficulty: over.difficulty ?? 5,
});

/** A weapon of that skill, the way items.js shapes one. Reach is not read here. */
const weaponOfSkill = (skill) => ({
  skill, minDamage: 3, maxDamage: 8, speed: 2.5, weight: 2,
  damageType: 'physical', ranged: skill === 'archery' || skill === 'marksmanship', reach: 2,
});

/**
 * What a fight teaches a character who has nothing, MEASURED: the real
 * `resolveMelee` and `resolveSpell` are run against a beginner and the lessons
 * that come back out are read. A lesson sitting behind a condition a beginner
 * cannot meet (Parrying used to be behind `parryChance > 0`, which is zero at
 * Parrying 0) does not appear here, which is exactly the point.
 *
 * The rolls are driven from both ends, 0 and 1, so a lesson that only exists
 * on a hit and a lesson that only exists on a miss are both found.
 */
export function fightPaths(skillId) {
  const out = [];
  const seen = new Set();
  const add = (what) => { if (!seen.has(what)) { seen.add(what); out.push({ kind: 'fight', id: skillId, what }); } };

  const rolls = [() => 0, () => 0.999, () => 0.5];

  // Swinging, with a weapon of each skill and with empty hands.
  for (const weaponSkill of ['swordsmanship', 'macefighting', 'fencing', 'polearms', 'archery', 'marksmanship', null]) {
    const weapon = weaponSkill ? weaponOfSkill(weaponSkill) : null;
    for (const rng of rolls) {
      const res = resolveMelee({
        attacker: blankFighter({ weapon }),
        defender: blankFighter({ shield: { parryFactor: 1 } }),
        now: 0, rng,
      });
      for (const l of res.lessons) {
        if (l.kind !== 'skill' || l.skill !== skillId) continue;
        if (l.who === 'attacker') {
          add(weapon
            ? `swing ${weaponSkill === 'archery' ? 'a bow' : weaponSkill === 'marksmanship' ? 'a crossbow' : 'a weapon of that skill'} at anything`
            : 'fight with your fists');
        } else {
          add('take a swing with a shield on your arm');
        }
      }
    }
  }

  // Casting, and being cast at.
  for (const rng of rolls) {
    const res = resolveSpell({
      caster: blankFighter({ weapon: null }),
      target: blankFighter({ weapon: null }),
      spell: { id: 'magicArrow', base: [4, 8], damageType: 'energy' },
      now: 0, rng,
    });
    for (const l of res.lessons) {
      if (l.kind !== 'skill' || l.skill !== skillId) continue;
      add(l.who === 'attacker' ? 'cast a spell that deals damage' : 'stand in front of a spell');
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// The world
// ---------------------------------------------------------------------------

/**
 * The `progression.lesson` calls that live in src/game, which node cannot
 * import (they reach THREE, the DOM, or both). Each entry names the file and a
 * string that must still be in it; skill_paths.test.mjs opens the file and
 * fails when the string is gone, so a call deleted in a refactor takes the
 * test with it rather than quietly taking the skill.
 */
export const WORLD_PATHS = [
  { skill: 'mining', file: 'src/game/interact.js', needle: "progression.lesson(d.action === 'mine' ? 'mining' : 'lumberjacking'", what: 'swing a pickaxe at a vein' },
  { skill: 'lumberjacking', file: 'src/game/interact.js', needle: "progression.lesson(d.action === 'mine' ? 'mining' : 'lumberjacking'", what: 'swing an axe at a tree' },
  { skill: 'foraging', file: 'src/game/foraging.js', needle: 'progression.lesson(FORAGE_SKILL', what: 'pick the plants you walk past' },
  { skill: 'skinning', file: 'src/game/skinning.js', needle: 'progression?.lesson?.(SKINNING_SKILL', what: 'skin what you kill' },
  { skill: 'lockpicking', file: 'src/game/chests.js', needle: "teach('lockpicking'", what: 'pick a chest' },
  { skill: 'removeTrap', file: 'src/game/chests.js', needle: "teach('removeTrap'", what: 'disarm a chest' },
  { skill: 'stealth', file: 'src/game/abilities_runtime.js', needle: "progression?.lesson?.('stealth'", what: 'Hide, then walk' },
  { skill: 'focus', file: 'src/game/abilities_runtime.js', needle: "progression?.lesson?.('focus'", what: 'be hit while casting' },
  { skill: 'veterinary', file: 'src/game/abilities_runtime.js', needle: "if (skill === 'healing' && isPet(target)) skill = 'veterinary';", what: 'bandage a pet' },
];

export function worldPaths(skillId) {
  return WORLD_PATHS.filter((w) => w.skill === skillId).map((w) => ({
    kind: 'world', id: w.file, what: w.what, file: w.file, needle: w.needle,
  }));
}

// ---------------------------------------------------------------------------
// The whole answer
// ---------------------------------------------------------------------------

/** Every way a character at zero can start `skillId`, in the order to try them. */
export function pathsFor(skillId, skills = ZERO_SKILLS, stats = ZERO_STATS) {
  return [
    ...worldPaths(skillId),
    ...abilityPaths(skillId, skills, stats),
    ...craftPaths(skillId, skills),
    ...fightPaths(skillId),
  ];
}

/**
 * The skills nothing in the game teaches, and the reason. Every one of these
 * is a system that does not exist yet, not a gate set too high, and none of
 * them can be raised by paying either, EXCEPT Animal Taming, which Brannoc
 * sells to 40 and no hand in the game can practise. That one is a real
 * violation of "all skills should be gainable without purchasing" and it is
 * written down here rather than left to be discovered.
 */
export const UNBUILT = {
  fishing: 'no rod, no fishing spot and no catch anywhere in src; the skill is a row in the table and nothing else',
  masonry: 'no recipe in recipes.js has skill masonry, and no stone bench exists to put one on',
  detectHidden: 'nothing in the world is hidden from the player: monsters do not hide and traps are found by opening the chest',
  animalTaming: 'monsters.js marks rows tamable and nothing tames them. Brannoc SELLS this skill to 40, so it is the one skill in the game that can be bought and cannot be practised',
  herding: 'no animal in the world can be moved without fighting it',
  swimming: 'the player never enters water; player.js has no swimming state at all',
};

/** The count, so a reader does not have to trust the prose. */
export const UNBUILT_COUNT = Object.keys(UNBUILT).length;

/**
 * Throws unless every skill in skills.js has either a path from zero or a
 * written reason it has none, and unless every written reason is still true.
 * Called at import, so a gate raised back over a beginner's head dies here
 * instead of shipping a skill only a trainer can start.
 */
export function auditSkillPaths() {
  const stranded = [];
  const stale = [];
  let withPaths = 0;
  for (const s of SKILLS) {
    const paths = pathsFor(s.id);
    if (paths.length) {
      withPaths++;
      if (UNBUILT[s.id]) stale.push(`${s.name} is listed as unbuilt and has ${paths.length} path(s): ${paths[0].what}`);
    } else if (!UNBUILT[s.id]) {
      stranded.push(`${s.name} (${s.id}) can only be bought: nothing a character at 0 can do teaches it`);
    }
  }
  for (const id of Object.keys(UNBUILT)) {
    if (!SKILL_BY_ID.has(id)) stale.push(`"${id}" is listed as unbuilt and is not a skill`);
  }
  if (stranded.length) {
    throw new Error(`skill_paths: ${stranded.length} skill(s) have no path from zero. ${stranded.join('; ')}`);
  }
  if (stale.length) {
    throw new Error(`skill_paths: the unbuilt list is out of date. ${stale.join('; ')}`);
  }
  return { skills: SKILLS.length, withPaths, unbuilt: UNBUILT_COUNT };
}

/** The whole table, for the test and for the doc. */
export function skillPathTable(skills = ZERO_SKILLS, stats = ZERO_STATS) {
  return SKILLS.map((s) => ({
    id: s.id,
    name: s.name,
    group: s.group,
    unbuilt: UNBUILT[s.id] || null,
    paths: pathsFor(s.id, skills, stats),
  }));
}

/** Every skill id abilities.js knows, for the cross check the test runs. */
export const ABILITY_SKILL_IDS = Object.keys(KNOWN_SKILLS);

auditSkillPaths();
