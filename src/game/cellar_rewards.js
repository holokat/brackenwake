import { achievementEvent } from './achievements/events.js';

const valid = (msg) => !!(msg && Number.isSafeInteger(msg.run) && msg.run >= 1
  && msg.base === 'starfall_ore' && msg.count === 36 && msg.gold === 2500);
const countOf = (item) => Math.max(0, Math.floor(Number(item?.count) || 0));

function claimFor(state, msg, room) {
  if (!valid(msg) || !state?.character) return null;
  const c = state.character;
  c.raidRewards ||= {};
  const key = `${room}:${msg.run}`;
  // Old fully claimed rewards predate completion XP, so hydration marks them
  // xp:true rather than awarding historical completions at the next load.
  const claim = c.raidRewards[key] ||= { gold: false, ore: 0, xp: false, pending: false };
  claim.gold = !!claim.gold;
  claim.ore = Math.max(0, Math.min(msg.count, Math.floor(Number(claim.ore) || 0)));
  claim.xp = !!claim.xp;
  claim.pending = !!claim.pending;
  return { c, key, claim };
}

export function raidRewardRemaining(state, msg, room) {
  const entry = claimFor(state, msg, room);
  if (!entry) return null;
  const { claim } = entry;
  return { gold: claim.gold ? 0 : msg.gold, ore: msg.count - claim.ore, complete: claim.gold && claim.ore === msg.count, claim };
}

/** Persist an authoritative reward before rendering its claim window. */
export function prepareRaidReward(state, msg, room) {
  const entry = claimFor(state, msg, room);
  if (!entry) return { complete: false, changed: false, pending: null };
  const remaining = raidRewardRemaining(state, msg, room);
  const changed = !remaining.complete && !entry.claim.pending;
  if (!remaining.complete) entry.claim.pending = true;
  if (changed) state.save?.();
  return { complete: remaining.complete, changed, pending: remaining, key: entry.key };
}

/** Record only the reward amounts the shared corpse transaction accepted. */
export function recordRaidClaim(state, msg, room, accepted = {}) {
  const entry = claimFor(state, msg, room);
  if (!entry) return { complete: false, changed: false, pending: null };
  const { c, claim } = entry;
  let changed = false;
  if (!claim.gold && Math.max(0, Math.floor(Number(accepted.gold) || 0)) > 0) {
    claim.gold = true;
    achievementEvent(c, 'raidKill');
    changed = true;
  }
  const ore = (Array.isArray(accepted.items) ? accepted.items : [])
    .filter((item) => item?.base === msg.base).reduce((sum, item) => sum + countOf(item), 0);
  if (ore > 0 && claim.ore < msg.count) {
    claim.ore = Math.min(msg.count, claim.ore + ore);
    changed = true;
  }
  const complete = claim.gold && claim.ore === msg.count;
  if (complete) claim.pending = false;
  if (changed) state.save?.();
  return { complete, changed, pending: raidRewardRemaining(state, msg, room) };
}

// Compatibility door for callers that intentionally claim a raid reward into
// the old material counters. The raid HUD uses prepare/record so its reward is
// visibly held until the player takes it.
export function applyRaidReward(state, msg, room) {
  const entry = claimFor(state, msg, room);
  if (!entry) return { complete: false, changed: false };
  const remaining = raidRewardRemaining(state, msg, room);
  const accepted = { items: [], gold: 0 };
  if (remaining.gold) { state.coins = (state.coins || 0) + remaining.gold; accepted.gold = remaining.gold; }
  if (remaining.ore) {
    const result = state.addMaterial?.(msg.base, remaining.ore);
    const added = Math.max(0, Math.floor(Number(result?.added) || 0));
    if (added) accepted.items.push({ base: msg.base, count: added });
  }
  return recordRaidClaim(state, msg, room, accepted);
}

export function hydrateRaidRewards(raw) {
  return Object.fromEntries(Object.entries(raw || {})
    .filter(([key]) => /^[a-z0-9_-]+:\d+$/.test(key)).slice(-1000)
    .map(([key, value]) => {
      const gold = !!value?.gold;
      const ore = Math.max(0, Math.min(36, Math.floor(Number(value?.ore) || 0)));
      // A prior complete checkpoint means the boss was already defeated before
      // XP existed. Do not retroactively award it on load.
      const complete = gold && ore === 36;
      return [key, { gold, ore, xp: value?.xp == null ? complete : !!value.xp, pending: !complete && !!value?.pending }];
    }));
}
