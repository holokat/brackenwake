// Loot held by a monster corpse. The world owns the corpse record; this layer
// owns only the transaction between that record and the player's pack.

import { labelOf } from './inventory.js';

/** A body has the same close-hand reach as an ordinary loot sack. */
export const CORPSE_LOOT_REACH = 3;

const num = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const countOf = (item) => Math.max(1, Math.floor(num(item?.count) || 1));
const distance = (a, b) => Math.hypot(num(a?.x) - num(b?.x), num(a?.z) - num(b?.z));

export function contentsOf(corpse) {
  const loot = corpse?.loot;
  if (!loot) return { items: [], gold: 0 };
  return { items: Array.isArray(loot.items) ? loot.items.filter(Boolean) : [], gold: Math.max(0, Math.floor(num(loot.gold))) };
}

export const hasLoot = (corpse) => {
  const contents = contentsOf(corpse);
  return contents.items.length > 0 || contents.gold > 0;
};

/** A corpse removed from the world cannot be claimed through a stale panel. */
export const isActive = (corpse) => !!(corpse && corpse.active !== false && corpse.loot);

/**
 * The sole mutation door for corpse rewards. `takeLoot` is the inventory
 * system's capacity-aware hand: it reports the item records and stack counts
 * it accepted, and this controller removes only that much from the body.
 */
export function createCorpseLoot({ at, takeLoot, hud, audio } = {}) {
  const pos = () => (typeof at === 'function' ? at() : at) || { x: 0, z: 0 };
  const say = (text, kind) => {
    if (hud?.log) hud.log(text, kind);
    else hud?.toast?.(text, kind);
    return text;
  };
  const range = (corpse) => distance(pos(), corpse?.pos || corpse?.actor?.pos);

  function canTake(corpse) {
    if (!isActive(corpse)) return { ok: false, reason: 'that body is no longer here' };
    const d = range(corpse);
    if (d > CORPSE_LOOT_REACH) return { ok: false, reason: `the body is ${Math.round(d)} m off, walk up to it` };
    if (corpse.loot.claiming) return { ok: false, reason: 'someone is already taking from this body' };
    return { ok: true, distance: d };
  }

  /** Intersect requested references with this exact, current corpse snapshot. */
  function offeredFrom(before, wanted) {
    const pending = new Set(Array.isArray(wanted) ? wanted : []);
    const offered = [];
    for (const item of before.items) {
      if (pending.has(item)) { offered.push(item); pending.delete(item); }
    }
    return offered;
  }

  /** Map an inventory response back to individual source records and counts. */
  function acceptedFrom(offered, reported) {
    const remaining = new Map(offered.map((item) => [item, countOf(item)]));
    const accepted = [];
    for (const got of (Array.isArray(reported) ? reported : [])) {
      const source = offered.find((item) => remaining.get(item) > 0
        && (item === got || (item?.id && got?.id && item.id === got.id)));
      if (!source) continue;
      const amount = Math.min(remaining.get(source), countOf(got));
      if (!amount) continue;
      remaining.set(source, remaining.get(source) - amount);
      accepted.push({ item: source, amount });
    }
    return accepted;
  }

  function claim(corpse, wantedItems, wantedGold) {
    const gate = canTake(corpse);
    if (!gate.ok) return { ok: false, taken: [], gold: 0, reason: say(gate.reason, 'bad') };
    const before = contentsOf(corpse);
    const offeredItems = offeredFrom(before, wantedItems);
    const offeredGold = Math.min(before.gold, Math.max(0, Math.floor(num(wantedGold))));
    if (!offeredItems.length && !offeredGold) return { ok: false, taken: [], gold: 0, reason: say('there is nothing left to take', 'bad') };

    corpse.loot.claiming = true;
    let result = null;
    try { const handler = corpse.loot?.takeLoot || takeLoot; result = typeof handler === 'function' ? handler(offeredItems, offeredGold) : null; } catch { /* The body keeps everything. */ }
    corpse.loot.claiming = false;
    // A despawn or map exit can happen during an inventory callback.
    if (!isActive(corpse)) return { ok: false, taken: [], gold: 0, reason: say('that body is no longer here', 'bad') };

    const accepted = acceptedFrom(offeredItems, result?.items);
    const acceptedGold = Math.min(offeredGold, Math.max(0, Math.floor(num(result?.gold))));
    const acceptedByItem = new Map();
    for (const entry of accepted) acceptedByItem.set(entry.item, (acceptedByItem.get(entry.item) || 0) + entry.amount);
    corpse.loot.items = before.items.flatMap((item) => {
      const n = acceptedByItem.get(item) || 0;
      if (!n) return [item];
      if (n >= countOf(item)) return [];
      return [{ ...item, count: countOf(item) - n }];
    });
    corpse.loot.gold = before.gold - acceptedGold;

    const taken = accepted.map(({ item, amount }) => amount === countOf(item) ? item : { ...item, count: amount });
    if (!taken.length && !acceptedGold) {
      const reason = 'your pack cannot take that yet';
      audio?.play?.('denied');
      return { ok: false, taken: [], gold: 0, left: contentsOf(corpse), reason: say(reason, 'bad') };
    }
    const gained = [acceptedGold ? `${acceptedGold} gold` : '', ...taken.map((item) => labelOf(item).toLowerCase())].filter(Boolean).join(', ');
    const left = contentsOf(corpse);
    say(`${gained} taken from the body.`);
    const itemShort = taken.reduce((sum, item) => sum + countOf(item), 0) < offeredItems.reduce((sum, item) => sum + countOf(item), 0);
    if (itemShort || acceptedGold < offeredGold) say('The rest stays on the body because your pack has no room for it.', 'bad');
    audio?.play?.('pickup');
    return { ok: true, taken, gold: acceptedGold, left, emptied: !hasLoot(corpse) };
  }

  const takeItem = (corpse, item) => claim(corpse, [item], 0);
  const takeGold = (corpse) => claim(corpse, [], contentsOf(corpse).gold);
  const takeAll = (corpse) => { const contents = contentsOf(corpse); return claim(corpse, contents.items, contents.gold); };
  function nearest(rangeLimit = CORPSE_LOOT_REACH, corpses = []) {
    let best = null, bestDistance = rangeLimit;
    for (const corpse of corpses) {
      if (!isActive(corpse) || !hasLoot(corpse)) continue;
      const d = range(corpse);
      if (d <= bestDistance) { best = corpse; bestDistance = d; }
    }
    return best;
  }
  return { contentsOf, hasLoot, isActive, canTake, takeItem, takeGold, takeAll, nearest, range };
}

export default createCorpseLoot;
