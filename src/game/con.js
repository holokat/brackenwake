// The con: how dangerous the thing you are looking at is, in one colour and
// three or four words. Pure. No THREE, no DOM, no state of its own.
//
// 15-PROGRAMME.md, "Difficulty and colour", is the spec:
//
//   compare the monster's tier to the player's own tier, which is the tier
//   band their best combat skill falls in (skills.js BANDS and monsters.js
//   TIERS agree on 0 to 100), and colour the name on the nameplate, the
//   target frame, the floaters and the hover label: grey two tiers below you,
//   green one below, yellow the same, orange one above, red two or more
//   above, purple for a boss. A skull beside a red name.
//
// That is the World of Warcraft con system, and the point of it is that the
// rule moves as the player trains: the same wolf is red to a fresh character
// and grey to a grandmaster, with nothing about the wolf having changed.
// `con.test.mjs` drives that both ways.
//
// WHERE THE NUMBERS COME FROM
//
// The tiers are `mmo/monsters.js` TIERS, not a copy of them: 0 [0,10],
// 1 [10,25], 2 [30,45], 3 [50,65], 4 [70,85], 5 [90,100], and 6 which is the
// boss tier and shares tier 5's band. A player's tier is the band their best
// attack skill falls in, so a skill of 27 is tier 1 (the floors are what
// separate the bands; the gaps between 25 and 30, 45 and 50 and so on belong
// to the band below). Tier 6 is not a place a player can stand: it holds no
// numbers of its own, so a grandmaster allowed to land there would read every
// champion as his own colour and the purple would say nothing.
//
// The skills that count are `items.js` COMBAT_SKILLS (the melee and ranged
// groups of the skill table, eleven of them) plus the four schools that
// attack: magery, necromancy, mysticism, chivalry. A grandmaster tailor is a
// beginner to a wolf, which is why the craft skills are not in the list.

import { TIERS } from '../mmo/monsters.js';
import { COMBAT_SKILLS } from '../mmo/items.js';
import { SKILL_BY_ID } from '../mmo/skills.js';

/** The magic that attacks. Inscription and Meditation do not swing at anything. */
export const CASTING_ATTACK_SKILLS = ['magery', 'necromancy', 'mysticism', 'chivalry'];

/** Every skill a monster measures you by, in one list. */
export const CON_SKILLS = [...COMBAT_SKILLS, ...CASTING_ATTACK_SKILLS];

/** The tier a boss carries. It shares tier 5's band and is a colour, not a rung. */
export const BOSS_TIER = 6;

/** The highest tier a player can read as. See the header: 6 is not a rung. */
export const MAX_PLAYER_TIER = 5;

/**
 * The floor of each tier a player can stand in, lowest first, taken from
 * monsters.js TIERS rather than typed again: [0, 10, 30, 50, 70, 90].
 */
export const PLAYER_TIER_FLOORS = Object.keys(TIERS)
  .map(Number).sort((a, b) => a - b)
  .filter((t) => t <= MAX_PLAYER_TIER)
  .map((t) => TIERS[t].band[0]);

/**
 * The ladder, in the order a monster climbs it. `trivial` and `deadly` are the
 * two open ends: three tiers below is still grey and four above is still red.
 *
 * COLOURS. ui_theme.js has no con palette (its own colours are stone, gold,
 * parchment, the three pools and the six item rarities), so these five are the
 * ones floaters.js has always used, which is what makes a grey "dodge" and a
 * grey name the same grey. They are fixed hexes and this is where they live.
 *
 *   grey    #9aa0a6
 *   green   #7ee07a
 *   yellow  #ffd23f
 *   orange  #ff9a3c
 *   red     #ff5a4d
 *
 * The purple is new, and is deliberately NOT items.js's epic purple #a335ee:
 * that hex already means "an epic item" everywhere in the bag and the loot
 * label, and a boss's name is not an item. #c07bf0 is lighter and reads on
 * the same near black stone.
 */
export const CON_LEVELS = [
  { level: 'trivial', colour: '#9aa0a6', word: 'no threat', skull: false },
  { level: 'easy', colour: '#7ee07a', word: 'easy', skull: false },
  { level: 'even', colour: '#ffd23f', word: 'a fair fight', skull: false },
  { level: 'hard', colour: '#ff9a3c', word: 'dangerous', skull: false },
  { level: 'deadly', colour: '#ff5a4d', word: 'it will kill you', skull: true },
  { level: 'boss', colour: '#c07bf0', word: 'a boss', skull: true },
];

/** The ladder by name, for anything that has a level and wants its colour. */
export const CON_BY_LEVEL = Object.fromEntries(CON_LEVELS.map((c) => [c.level, c]));

/** The two that wear a skull. A player should not have to read the hex. */
export const SKULL_LEVELS = CON_LEVELS.filter((c) => c.skull).map((c) => c.level);

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** The player tier a skill value sits in, by the floors above. Never above 5. */
export function tierForSkill(value) {
  const v = num(value);
  let t = 0;
  for (let i = 0; i < PLAYER_TIER_FLOORS.length; i++) if (v >= PLAYER_TIER_FLOORS[i]) t = i;
  return Math.min(MAX_PLAYER_TIER, t);
}

/**
 * The player's tier: the band their best attack skill falls in. A character
 * with nothing above 10 is tier 0. Takes the character (`{ skills }`) or the
 * skill map itself, so an actor works as well as a save.
 */
export function playerTier(character = {}) {
  const skills = (character && character.skills) || character || {};
  let best = 0;
  for (const id of CON_SKILLS) best = Math.max(best, num(skills[id]));
  return tierForSkill(best);
}

/** The best attack skill and its id, which is what a hover line can name. */
export function bestCombatSkill(character = {}) {
  const skills = (character && character.skills) || character || {};
  let id = null, value = 0;
  for (const s of CON_SKILLS) if (num(skills[s]) > value) { value = num(skills[s]); id = s; }
  return { id, value };
}

/**
 * The whole answer for one monster seen by one character:
 *
 *   { tier, mine, delta, level, colour, word, skull }
 *
 * `tier` is the monster's, `mine` the player's, `delta` the raw difference
 * (unclamped, so a caller can say how far out of its depth the player is).
 * A boss is purple whatever the difference says, because tier 6 carries tier
 * 5's numbers and a champion is not "one above" anybody.
 *
 * `monster` may be the actor, the monsters.js row, or anything else carrying
 * `tier` and `boss`; a monster record with an `.actor` is followed to it.
 */
export function conOf(monster, character = {}) {
  const m = (monster && monster.actor) || monster || {};
  const tier = num(m.tier);
  const boss = m.boss === true || tier >= BOSS_TIER;
  const mine = playerTier(character);
  const delta = tier - mine;
  const level = boss ? 'boss'
    : delta <= -2 ? 'trivial'
      : delta === -1 ? 'easy'
        : delta === 0 ? 'even'
          : delta === 1 ? 'hard'
            : 'deadly';
  const step = CON_BY_LEVEL[level];
  return { tier, mine, delta, level, colour: step.colour, word: step.word, skull: step.skull };
}

/** "Wolf, a fair fight". The one line every hover and label is built from. */
export function conLabel(monster, character = {}) {
  const c = conOf(monster, character);
  const m = (monster && monster.actor) || monster || {};
  return `${m.name || 'something'}, ${c.word}`;
}

/**
 * The table has to be a table. Six levels, six distinct colours, every one a
 * hex, one level per offset with no gap, and the boss on the end. Throws, and
 * runs at import, so a bad edit dies here instead of shipping a name with no
 * colour.
 */
export function auditCon() {
  const want = ['trivial', 'easy', 'even', 'hard', 'deadly', 'boss'];
  const have = CON_LEVELS.map((c) => c.level);
  if (have.join(',') !== want.join(',')) throw new Error(`con: the ladder reads ${have.join(', ')}`);
  const colours = new Set();
  for (const c of CON_LEVELS) {
    if (!/^#[0-9a-f]{6}$/i.test(c.colour)) throw new Error(`con: ${c.level} has no colour`);
    if (!c.word || typeof c.word !== 'string') throw new Error(`con: ${c.level} has no words`);
    if (colours.has(c.colour)) throw new Error(`con: ${c.colour} is used twice, so two levels read the same`);
    colours.add(c.colour);
  }
  if (PLAYER_TIER_FLOORS.length !== MAX_PLAYER_TIER + 1) {
    throw new Error(`con: ${PLAYER_TIER_FLOORS.length} player bands for ${MAX_PLAYER_TIER + 1} tiers`);
  }
  for (let i = 1; i < PLAYER_TIER_FLOORS.length; i++) {
    if (!(PLAYER_TIER_FLOORS[i] > PLAYER_TIER_FLOORS[i - 1])) {
      throw new Error(`con: the tier floors do not climb: ${PLAYER_TIER_FLOORS.join(', ')}`);
    }
  }
  if (!TIERS[BOSS_TIER]) throw new Error('con: monsters.js has no boss tier any more');
  for (const id of CASTING_ATTACK_SKILLS) {
    if (COMBAT_SKILLS.includes(id)) throw new Error(`con: ${id} is already a combat skill, so it needs no exception`);
  }
  if (new Set(CON_SKILLS).size !== CON_SKILLS.length) throw new Error('con: a skill is in the list twice');
  for (const id of CON_SKILLS) {
    if (!SKILL_BY_ID.has(id)) throw new Error(`con: "${id}" is not a skill, so nothing would ever train it`);
  }
  return { levels: CON_LEVELS.length, skills: CON_SKILLS.length, floors: PLAYER_TIER_FLOORS.slice() };
}

auditCon();
