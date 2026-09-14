// Effective combat practice is derived. Saves retain numeric skills for
// professions and legacy compatibility, while class baseline plus level
// supplies new combat power. Existing earned values are a migration floor.

import { OPENINGS_BY_ID } from './openings.js';
import { SKILLS } from './skills.js';
import { isProfessionSkill } from './skill_policy.js';
import { levelOf } from './talents.js';

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const number = (value) => Number.isFinite(value) ? value : 0;
const CLASS_IDS = new Set(['warrior', 'ranger', 'rogue', 'mage', 'paladin', 'priest']);

export function canonicalClass(character = {}) {
  const id = character.opening || character.advancement?.classId;
  return CLASS_IDS.has(id) ? id : 'ranger';
}

export function combatLevel(character = {}) {
  return character.advancement ? levelOf(character) : 1;
}

export function combatLegacyFloor(character = {}, id) {
  const saved = character.combatLegacy?.[id];
  return clamp(number(saved), 0, 100);
}

export function classCombatBaseline(character = {}, id) {
  return clamp(number(OPENINGS_BY_ID[canonicalClass(character)]?.skills?.[id]), 0, 100);
}

export function effectiveCombatSkill(character = {}, id) {
  if (isProfessionSkill(id)) return clamp(number(character.skills?.[id]), 0, 100);
  const baseline = classCombatBaseline(character, id);
  const level = combatLevel(character);
  const fromLevel = baseline + (100 - baseline) * ((level - 1) / 98);
  return clamp(Math.max(fromLevel, combatLegacyFloor(character, id)), 0, 100);
}

export function effectiveCombatSkills(character = {}) {
  return Object.fromEntries(SKILLS.map(({ id }) => [id, effectiveCombatSkill(character, id)]));
}
