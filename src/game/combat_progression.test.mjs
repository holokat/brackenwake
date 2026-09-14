import assert from 'node:assert/strict';
import { rollGain } from '../mmo/skills.js';
import { LEVEL_XP } from '../mmo/talents.js';
import { playerActor } from './actor.js';
import { createProgression } from './progression.js';
import { trainQuote } from './win_talk.js';

const character = {
  opening: 'warrior', stats: { str: 65, dex: 50, int: 25, con: 65, wis: 45 },
  skills: { swordsmanship: 50, mining: 0 }, skillLocks: {}, statLocks: {},
  advancement: { xp: 0 }, equipment: {}, pack: { items: [] }, bar: [], gold: 500,
};
const beforeCombat = character.skills.swordsmanship;
const combat = rollGain({ skills: character.skills, locks: character.skillLocks }, 'swordsmanship', 20, true, () => 0);
assert.equal(combat.refused, true);
assert.equal(character.skills.swordsmanship, beforeCombat);
const profession = rollGain({ skills: character.skills, locks: character.skillLocks }, 'mining', 20, true, () => 0);
assert.equal(profession.gained, true);

const actor = playerActor(character);
const progression = createProgression({ character, actor });
const statsBefore = { ...character.stats };
const lessons = progression.applyLessons([{ who: 'attacker', kind: 'stat', stat: 'str' }, { who: 'attacker', skill: 'swordsmanship', difficulty: 20, success: true }]);
assert.deepEqual(lessons, []);
assert.deepEqual(character.stats, statsBefore);
assert.equal(character.skills.swordsmanship, beforeCombat);
character.advancement.xp = LEVEL_XP[99];
actor.recompute?.();
// recompute is intentionally a pure exported function on the domain actor.
playerActor(character, { pos: actor.pos });
const high = playerActor(character);
assert.equal(high.skills.swordsmanship, 100);
assert.equal(high.skills.mining, character.skills.mining);
const trainer = { name: 'Blacksmith', teaches: ['swordsmanship'] };
const quote = trainQuote(character, trainer, 'swordsmanship');
assert.equal(quote.ok, false);
assert.equal(character.gold, 500);
console.log('Combat progression checks passed: practice is inert, professions grow, levels scale and trainers do not charge.');
