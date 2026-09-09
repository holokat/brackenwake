// Action owners report successful outcomes here; inventory changes alone never count.
const listeners = new WeakMap();
export function bindAchievementEvents(character, handler) {
  listeners.set(character, handler);
  return () => listeners.delete(character);
}
export function achievementEvent(character, type, detail = {}) {
  return listeners.get(character)?.({ type, ...detail }) ?? false;
}
