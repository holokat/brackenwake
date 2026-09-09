import { achievementEvent } from './achievements/events.js';
// Retry partial claims without duplicating gold or already accepted ore.
export function applyRaidReward(state, msg, room) {
    const c = state.character;
    if (!c || !Number.isSafeInteger(msg.run) || msg.run < 1 || msg.base !== 'starfall_ore' || msg.count !== 36 || msg.gold !== 2500)
        return { complete: false, changed: false };
    c.raidRewards ||= {};
    const key = room + ':' + msg.run;
    const claim = c.raidRewards[key] ||= { gold: false, ore: 0 };
    let changed = false;
    if (!claim.gold) {
        state.coins = (state.coins || 0) + 2500;
        claim.gold = true;
        achievementEvent(c, 'raidKill');
        changed = true;
    }
    if (claim.ore < 36) {
        const result = state.addMaterial('starfall_ore', 36 - claim.ore);
        claim.ore += result?.added || 0;
        changed ||= !!result?.added;
    }
    if (changed)
        state.save();
    return { complete: claim.gold && claim.ore === 36, changed };
}
export function hydrateRaidRewards(raw) { return Object.fromEntries(Object.entries(raw || {}).filter(([key]) => /^[a-z0-9_-]+:\d+$/.test(key)).slice(-1000).map(([key, v]) => [key, { gold: !!v?.gold, ore: Math.max(0, Math.min(36, Math.floor(Number(v?.ore) || 0))) }])); }
