import { ACHIEVEMENTS, ACHIEVEMENT_BY_ID, METRIC_CAPS } from './catalog.js';

const number = v => Number.isFinite(v) ? Math.max(0, v) : 0;
export function hydrateAchievements(raw) {
  const doc = { version: 1, owner: typeof raw?.owner === 'string' ? raw.owner.slice(0, 80) : '', metrics: {}, distinct: {}, earned: {}, title: null };
  for (const [metric, cap] of Object.entries(METRIC_CAPS)) {
    doc.metrics[metric] = Math.min(cap, number(raw?.metrics?.[metric]));
    if (Array.isArray(raw?.distinct?.[metric])) {
      doc.distinct[metric] = [...new Set(raw.distinct[metric].filter(x => typeof x === 'string' && x.length <= 160))].slice(0, cap);
      doc.metrics[metric] = Math.max(doc.metrics[metric], doc.distinct[metric].length);
    }
  }
  for (const row of ACHIEVEMENTS) {
    if (number(raw?.earned?.[row.id]) > 0 && row.requirements.every(r => doc.metrics[r.metric] >= r.target)) doc.earned[row.id] = raw.earned[row.id];
  }
  if (doc.earned[raw?.title]) doc.title = raw.title;
  return doc;
}
export function achievementState(character) {
  if (!character.achievements) character.achievements = hydrateAchievements();
  return character.achievements;
}
export function observeMetric(doc, metric, value) {
  const cap = METRIC_CAPS[metric];
  if (!cap) return false;
  const before = doc.metrics[metric] || 0;
  doc.metrics[metric] = Math.max(before, Math.min(cap, number(value)));
  return before !== doc.metrics[metric];
}
export function addMetric(doc, metric, amount = 1) { return observeMetric(doc, metric, (doc.metrics[metric] || 0) + number(amount)); }
export function distinctMetric(doc, metric, key) {
  if (!METRIC_CAPS[metric] || typeof key !== 'string' || !key || key.length > 160) return false;
  const list = doc.distinct[metric] ||= [];
  if (list.length >= METRIC_CAPS[metric] || list.includes(key)) return false;
  list.push(key);
  return observeMetric(doc, metric, list.length);
}
export function unlockAchievements(doc, now = Date.now()) {
  const unlocked = [];
  // The final achievement depends on the other 39, so evaluate it last.
  for (const row of ACHIEVEMENTS) {
    if (row.number === 40) {
      const done = ACHIEVEMENTS.filter(r => r.number !== 40 && doc.earned[r.id]);
      observeMetric(doc, 'completed', done.length);
      observeMetric(doc, 'categories', new Set(done.map(r => r.category)).size);
    }
    if (!doc.earned[row.id] && row.requirements.every(r => (doc.metrics[r.metric] || 0) >= r.target)) {
      doc.earned[row.id] = Math.max(1, number(now));
      unlocked.push(row);
    }
  }
  return unlocked;
}
export function achievementPerks(character) {
  const totals = { capacity: 0, quality: 0, constitution: 0, wisdom: 0 };
  const earned = character?.achievements?.earned;
  if (earned) for (const row of ACHIEVEMENTS) if (earned[row.id] && row.reward) totals[row.reward.kind] += row.reward.amount;
  return totals;
}
export function selectedAchievementTitle(character) {
  const doc = character?.achievements;
  return doc?.earned?.[doc.title] ? ACHIEVEMENT_BY_ID.get(doc.title)?.title || null : null;
}
export function selectAchievementTitle(character, id) {
  const doc = achievementState(character);
  if (id !== null && (!ACHIEVEMENT_BY_ID.has(id) || !doc.earned[id])) return false;
  doc.title = id;
  return true;
}
export function personallyCrafted(character, item) {
  return !!character?.achievements?.owner && item?.achievementMaker === character.achievements.owner;
}
