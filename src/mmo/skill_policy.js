// Skill ownership is deliberately explicit. Profession skills are the only
// numeric practices a character can improve through use; combat strength is
// calculated from class and level in combat_proficiency.js.

export const PROFESSION_SKILL_IDS = Object.freeze([
  'mining', 'lumberjacking', 'foraging', 'fishing', 'skinning',
  'blacksmithing', 'tailoring', 'carpentry', 'tinkering', 'alchemy',
  'cooking', 'fletching', 'masonry', 'inscription', 'poisoning',
]);

const PROFESSIONS = new Set(PROFESSION_SKILL_IDS);

export const isProfessionSkill = (id) => PROFESSIONS.has(id);
export const isCombatPracticeSkill = (id) => typeof id === 'string' && !PROFESSIONS.has(id);
