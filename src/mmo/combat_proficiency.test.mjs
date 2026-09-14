import assert from 'node:assert/strict';
import { OPENINGS } from './openings.js';
import { LEVEL_XP } from './talents.js';
import { PROFESSION_SKILL_IDS, isProfessionSkill } from './skill_policy.js';
import { canonicalClass, effectiveCombatSkill, effectiveCombatSkills } from './combat_proficiency.js';

assert.deepEqual(PROFESSION_SKILL_IDS, [
  'mining', 'lumberjacking', 'foraging', 'fishing', 'skinning',
  'blacksmithing', 'tailoring', 'carpentry', 'tinkering', 'alchemy',
  'cooking', 'fletching', 'masonry', 'inscription', 'poisoning',
]);

for (const opening of OPENINGS) {
  const baseline = opening.skills;
  const levelOne = { opening: opening.id, skills: baseline, advancement: { xp: 0 } };
  const middle = { opening: opening.id, skills: baseline, advancement: { xp: LEVEL_XP[50] } };
  const maximum = { opening: opening.id, skills: baseline, advancement: { xp: LEVEL_XP[99] } };
  assert.equal(canonicalClass(levelOne), opening.id);
  for (const [id, value] of Object.entries(baseline)) {
    if (isProfessionSkill(id)) continue;
    assert.equal(effectiveCombatSkill(levelOne, id), value, `${opening.id} level one keeps its baseline ${id}`);
    assert.ok(effectiveCombatSkill(middle, id) >= value, `${opening.id} level fifty improves ${id}`);
    assert.equal(effectiveCombatSkill(maximum, id), 100, `${opening.id} level ninety-nine caps ${id}`);
  }
}

const legacy = { opening: 'mage', skills: { fireball: 80, magery: 87, mining: 42 }, combatLegacy: { magery: 87 }, advancement: { xp: 0 } };
assert.equal(effectiveCombatSkill(legacy, 'magery'), 87, 'legacy combat practice remains a floor');
assert.equal(effectiveCombatSkills(legacy).mining, 42, 'profession values remain authored practice');
console.log('Combat proficiency checks passed for six classes at levels 1, 50 and 99.');
