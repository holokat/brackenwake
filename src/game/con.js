// The con: how dangerous the thing you are looking at is, in one colour and
// three or four words. Pure. No THREE, no DOM, no state of its own.
//
// 15-PROGRAMME.md, "Difficulty and colour", is the spec:
//
//   compare the monster's tier to the player's own CON RUNG, which is one
//   below the tier band their best combat skill falls in (skills.js BANDS and
//   monsters.js TIERS agree on 0 to 100), and colour the name on the
//   nameplate, the target frame, the floaters and the hover label: grey two
//   tiers below you, green one below, yellow the same, orange one above, red
//   two or more above, purple for a boss. A skull beside a red name.
//
// That is the World of Warcraft con system, and the point of it is that the
// rule moves as the player trains: the same wolf is red to a fresh character
// and grey to a grandmaster, with nothing about the wolf having changed.
// `con.test.mjs` drives that both ways.
//
// WHY THE RUNG IS ONE BELOW THE BAND
//
// Because of where a character starts. `mmo/openings.js` gives every opening
// but Blank 50 in its main skill, which is band 3, and the zone written to
// meet a new character is the Greenwold, whose danger band is tier 1 to 2. Read
// straight off the band, a fresh Warrior walked out of Hearthhome and every
// wolf, bandit and goblin in the starting zone read grey, which is the game
// telling a player on his first morning that there is nothing here worth
// swinging at. The ladder has to start where a character starts, so the rung is
// the band minus one, floored at zero: band 3 reads tier 2, which is the wolf,
// which is yellow, which is a fair fight. A Blank with nothing trained is band
// 0 and stays at rung 0, so the tier 1 goblin scout is orange to him and it
// ought to be.
//
// WHERE THE NUMBERS COME FROM
//
// The tiers are `mmo/monsters.js` TIERS, not a copy of them: 0 [0,10],
// 1 [10,25], 2 [30,45], 3 [50,65], 4 [70,85], 5 [90,100], and 6 which is the
// boss tier and shares tier 5's band. A player's BAND is the one their best
// attack skill falls in, so a skill of 27 is band 1 (the floors are what
// separate the bands; the gaps between 25 and 30, 45 and 50 and so on belong
// to the band below), and `playerTier` still answers that band because it is
// what a bench readout and a training screen mean by it. `conTier` is the rung
// the colours are read from and is the one `conOf` uses. Tier 6 is not a place
// a player can stand: it holds no numbers of its own, so a grandmaster allowed
// to land there would read every champion as his own colour and the purple
// would say nothing.
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
 * How far below their skill band a player reads for con purposes. One rung,
 * floored at zero, so bands 0 and 1 both read as tier 0. See the header: a
 * fresh opening starts at 50, which is band 3, and the zone written to meet it
 * is tier 2, so the ladder has to start where a character starts.
 */
export const CON_TIER_DROP = 1;

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
  { level: 'friend', colour: '#7ad0ff', word: 'a fellow traveller', skull: false },
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
 * The player's BAND: the tier band their best attack skill falls in. A
 * character with nothing above 10 is band 0. Takes the character
 * (`{ skills }`) or the skill map itself, so an actor works as well as a save.
 *
 * This is NOT what the colours are read from. `conTier` is, and it is one rung
 * lower. Keeping both means a bench that wants to say "you are a band 3
 * swordsman" and a nameplate that wants to say "that wolf is a fair fight" are
 * asking two different questions and getting two right answers.
 */
export function playerTier(character = {}) {
  const skills = (character && character.skills) || character || {};
  let best = 0;
  for (const id of CON_SKILLS) best = Math.max(best, num(skills[id]));
  return tierForSkill(best);
}

/**
 * The rung a player reads monsters from: their band, less one, never below 0.
 * Band 0 and band 1 both read as 0; band 3, which is where every opening but
 * Blank starts, reads as 2, which is the wolf.
 */
export function conTier(character = {}) {
  return Math.max(0, playerTier(character) - CON_TIER_DROP);
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
 *   { tier, mine, band, delta, level, colour, word, skull }
 *
 * `tier` is the monster's, `mine` the player's CON RUNG (their skill band less
 * one, not the band itself), `band` the band it came from, and `delta` the raw
 * difference against the rung (unclamped, so a caller can say how far out of
 * its depth the player is). A boss is purple whatever the difference says,
 * because tier 6 carries tier 5's numbers and a champion is not "one above"
 * anybody.
 *
 * `monster` may be the actor, the monsters.js row, or anything else carrying
 * `tier` and `boss`; a monster record with an `.actor` is followed to it.
 */
export function conOf(monster, character = {}) {
  const m = (monster && monster.actor) || monster || {};
  // MP1: another player, or anything on the player's side, is read as a friend
  if (m.faction === 'player' || m.faction === 'ally') {
    const step = CON_BY_LEVEL.friend;
    return { tier: num(m.tier), mine: 0, band: 0, delta: 0, level: 'friend', colour: step.colour, word: step.word, skull: false };
  }
  const tier = num(m.tier);
  const boss = m.boss === true || tier >= BOSS_TIER;
  const band = playerTier(character);
  const mine = Math.max(0, band - CON_TIER_DROP);
  const delta = tier - mine;
  const level = boss ? 'boss'
    : delta <= -2 ? 'trivial'
      : delta === -1 ? 'easy'
        : delta === 0 ? 'even'
          : delta === 1 ? 'hard'
            : 'deadly';
  const step = CON_BY_LEVEL[level];
  return { tier, mine, band, delta, level, colour: step.colour, word: step.word, skull: step.skull };
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
  // `friend` is MP1's: another player or a summon. It sits after the fight ladder and is never a con.
  const want = ['trivial', 'easy', 'even', 'hard', 'deadly', 'boss', 'friend'];
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
  // The rung, checked against the two facts it was written from, so a change to
  // either dies here rather than turning a starting zone grey again.
  if (!(CON_TIER_DROP >= 0 && CON_TIER_DROP < PLAYER_TIER_FLOORS.length)) {
    throw new Error(`con: a drop of ${CON_TIER_DROP} is not a rung on a ${PLAYER_TIER_FLOORS.length} band ladder`);
  }
  if (conTier({ skills: {} }) !== 0) throw new Error('con: a character with nothing trained does not read as tier 0');
  {
    // Every opening but Blank starts at 50 in its main skill. 50 is band 3, and
    // band 3 has to read as the Greenwold's top tier of 2, or the starting zone
    // is grey on the first morning again.
    const fresh = conTier({ skills: { swordsmanship: 50 } });
    if (fresh !== 2) throw new Error(`con: a fresh opening at skill 50 reads tier ${fresh}, not 2`);
  }
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
