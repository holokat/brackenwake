import { ACHIEVEMENT_BY_ID } from './catalog.js';
import { selectedAchievementTitle } from './progress.js';

export function earnedTitleId(character) {
  return selectedAchievementTitle(character) ? character.achievements.title : null;
}
export function publicTitleId(id) { return typeof id === 'string' && ACHIEVEMENT_BY_ID.has(id) ? id : null; }
export function titledName(name, id) {
  const title = ACHIEVEMENT_BY_ID.get(publicTitleId(id))?.title;
  return title ? `${name}, ${title}` : name;
}
