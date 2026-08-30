// Game state: a self-contained economy — coins, inventory, purchases, and crops
// that grow with time and care. Nostr supplies identity and the broadcast of
// this state so other players can visit; it never feeds progression.

import { TIERS, findItem, ALL_UNLOCKABLES, GOODS, STARTER_COINS } from './catalog.js';
import { seasonAt, temperatureAt, seasonGrowthFactor, SEASONS, SEASON_MS } from './seasons.js';

const SAVE_VERSION = 3;
export const WATER_COOLDOWN_MS = 90000;
// each hand-watering pushes a crop 2 growth points — watering is the core
// interactive verb, so it should visibly move the plant forward
export const WATER_GROWTH = 2;

export class Game {
  constructor(pubkey, { readOnly = false } = {}) {
    this.pubkey = pubkey;
    this.readOnly = readOnly;
    this.tier = 1;
    this.plots = [];      // per plot: null | { type, growth, lastWater }
    this.placed = [];     // { uid, kind, type, x, z, rot, opts }
    this.harvested = 0;
    this.signText = null;
    this.signHidden = false;
    this.houseRot = null;  // farmhouse facing (radians); null = theme default
    this.houseOffset = null; // {x,z} if the player relocated the house
    this.windmillRot = null; // windmill facing (radians); null = default
    this.paths = []; // [{x,z,type}] paved path tiles
    this.fenceHP = 100; // perimeter fence health (0-100)
    this.theme = 'meadow';
    this.biome = null;    // set once via the map picker
    this.coins = STARTER_COINS;
    this.inventory = {};  // goodId -> count
    this.owned = [];      // item ids bought with coins
    this.jobs = {};       // placedUid -> { recipeId, startedAt, timeMs }
    this.giftCursor = 0;  // newest gift event already applied (unix seconds)
    this.orders = [];     // the order board: { id, customer:{name,pk?}, items:{goodId:n}, reward }
    this.nextOrderAt = 0; // when the next empty order slot refills
    this.lastLoginDay = ''; // daily chest bookkeeping
    this.streak = 0;
    this.discovered = []; // every good ever obtained (collection book)
    this.collectionBonuses = []; // collection rows already paid out
    this.housePurchased = 0; // highest farmhouse level bought with coins
    this.house = {}; // cosmetic house customization { roof, wall, ... }
    this.seasonEpoch = 0; // ms anchor for the real-time season clock (0 = unset)
    this.stats = {};      // lifetime action counters (missions)
    this.missionsClaimed = []; // mission ids already rewarded
    this.savedAt = 0;
    this.onSaved = null;
    this._unlockSnapshot = new Set();
    this.load();
    // anchor the season clock once, the first time this farm is ever loaded
    if (!this.seasonEpoch) {
      this.seasonEpoch = this.savedAt || Date.now();
    }
  }

  // --- real-time seasons (derived from the persisted epoch) ---
  get season() { return seasonAt(this.seasonEpoch || Date.now(), Date.now()); }
  get temperature() { return temperatureAt(this.seasonEpoch || Date.now(), Date.now()); }
  get seasonGrowthFactor() { return seasonGrowthFactor(this.season.id); }
  seasonInfo() {
    const s = this.season;
    return {
      ...s,
      temperature: this.temperature,
      next: SEASONS[(s.index + 1) % 4],
      msToNext: SEASON_MS - s.phase * SEASON_MS,
    };
  }

  get tierDef() { return TIERS.find((t) => t.id === this.tier) || TIERS[0]; }
  get nextTierDef() { return TIERS.find((t) => t.id === this.tier + 1) || null; }

  _key() { return `nostrux-game-${this.pubkey}`; }

  bumpStat(key, n = 1) {
    if (this.readOnly) return;
    this.stats[key] = (this.stats[key] || 0) + n;
  }

  load() {
    try {
      const raw = localStorage.getItem(this._key());
      if (!raw) { this._initPlots(); return; }
      const data = JSON.parse(raw);
      if (data.v !== SAVE_VERSION) { this._initPlots(); return; }
      this._absorb(data);
      this._initPlots();
    } catch {
      this._initPlots();
    }
  }

  _absorb(data) {
    this.tier = data.tier || 1;
    this.plots = data.plots || [];
    this.placed = data.placed || [];
    this.harvested = data.harvested || 0;
    this.signText = data.signText || null;
    this.signHidden = !!data.signHidden;
    this.houseRot = typeof data.houseRot === 'number' ? data.houseRot : null;
    this.houseOffset = data.houseOffset && Number.isFinite(data.houseOffset.x) ? data.houseOffset : null;
    this.windmillRot = typeof data.windmillRot === 'number' ? data.windmillRot : null;
    this.paths = Array.isArray(data.paths) ? data.paths : [];
    this.fenceHP = typeof data.fenceHP === 'number' ? data.fenceHP : 100;
    this.theme = data.theme === 'autumn' ? 'meadow' : (data.theme || 'meadow'); // Autumn Hollow retired → meadow
    this.biome = data.biome || null;
    this.coins = data.coins ?? STARTER_COINS;
    this.inventory = data.inventory || {};
    this.owned = data.owned || [];
    this.jobs = data.jobs || {};
    this.giftCursor = data.giftCursor || 0;
    this.orders = data.orders || [];
    this.nextOrderAt = data.nextOrderAt || 0;
    this.lastLoginDay = data.lastLoginDay || '';
    this.streak = data.streak || 0;
    this.discovered = data.discovered || [];
    this.collectionBonuses = data.collectionBonuses || [];
    this.housePurchased = data.housePurchased || 0;
    this.house = (data.house && typeof data.house === 'object') ? data.house : {};
    this.seasonEpoch = data.seasonEpoch || 0;
    this.stats = data.stats || {};
    this.missionsClaimed = data.missionsClaimed || [];
    this.savedAt = data.savedAt || 0;
  }

  _initPlots() {
    const n = this.tierDef.plots;
    while (this.plots.length < n) this.plots.push(null);
    this.plots.length = n;
  }

  snapshot() {
    return {
      v: SAVE_VERSION, tier: this.tier, plots: this.plots, placed: this.placed,
      harvested: this.harvested, signText: this.signText, signHidden: this.signHidden, houseRot: this.houseRot, houseOffset: this.houseOffset, windmillRot: this.windmillRot, paths: this.paths, fenceHP: this.fenceHP,
      theme: this.theme, biome: this.biome, coins: this.coins, inventory: this.inventory,
      owned: this.owned, jobs: this.jobs, giftCursor: this.giftCursor,
      orders: this.orders, nextOrderAt: this.nextOrderAt,
      lastLoginDay: this.lastLoginDay, streak: this.streak,
      discovered: this.discovered, collectionBonuses: this.collectionBonuses,
      housePurchased: this.housePurchased, house: this.house,
      seasonEpoch: this.seasonEpoch,
      stats: this.stats, missionsClaimed: this.missionsClaimed,
      savedAt: this.savedAt,
    };
  }

  save() {
    if (this.readOnly) return;
    this.savedAt = Date.now();
    try { localStorage.setItem(this._key(), JSON.stringify(this.snapshot())); } catch {}
    try { this.onSaved?.(); } catch {}
  }

  applyRemote(data) {
    if (!data || data.v !== SAVE_VERSION) return false;
    if ((data.savedAt || 0) <= this.savedAt) return false;
    this._absorb(data);
    this._initPlots();
    if (!this.readOnly) {
      try { localStorage.setItem(this._key(), JSON.stringify(this.snapshot())); } catch {}
    }
    return true;
  }

  // ---- unlocks & purchases ----

  isUnlocked(item) {
    if (this.owned.includes(item.id)) return true;
    return item.price === 0; // starter items are free; everything else is bought
  }

  canBuy(item) {
    return item.price != null && this.coins >= item.price && !this.isUnlocked(item);
  }

  buy(item) {
    if (!this.canBuy(item)) return false;
    this.coins -= item.price;
    this.owned.push(item.id);
    this.save();
    return true;
  }

  newUnlocks() {
    const fresh = [];
    for (const item of ALL_UNLOCKABLES()) {
      if (this.isUnlocked(item) && !this._unlockSnapshot.has(item.id)) {
        this._unlockSnapshot.add(item.id);
        fresh.push(item);
      }
    }
    return fresh;
  }

  primeUnlockSnapshot() {
    this._unlockSnapshot = new Set(
      ALL_UNLOCKABLES().filter((i) => this.isUnlocked(i)).map((i) => i.id)
    );
  }

  canUpgrade() {
    const next = this.nextTierDef;
    return !!next && next.price != null && this.coins >= next.price;
  }

  upgrade() {
    if (!this.canUpgrade()) return false;
    this.coins -= this.nextTierDef.price;
    this.tier += 1;
    this._initPlots();
    this.save();
    return true;
  }

  // ---- crops & growth points ----

  plant(index, cropId) {
    if (index < 0 || index >= this.plots.length || this.plots[index]) return false;
    this.plots[index] = { type: cropId, growth: 0, lastWater: 0 };
    this.save();
    return true;
  }

  stageOf(plotState) {
    if (!plotState) return -1;
    const item = findItem('crop', plotState.type);
    const grow = item?.grow || [1, 3, 6, 10];
    let stage = 0;
    for (let i = 0; i < grow.length; i++) if ((plotState.growth || 0) >= grow[i]) stage = i + 1;
    return stage;
  }

  growthInfo(plotState) {
    const item = findItem('crop', plotState.type);
    const grow = item?.grow || [1, 3, 6, 10];
    const gained = plotState.growth || 0;
    const stage = this.stageOf(plotState);
    const next = stage < 4 ? grow[stage] : null;
    return { gained, stage, next, item };
  }

  // returns indices whose stage changed
  addGrowth(indices, amount = 1) {
    amount *= this.seasonGrowthFactor; // crops crawl in autumn, go dormant in winter
    const changed = [];
    for (const i of indices) {
      const p = this.plots[i];
      if (!p) continue;
      const before = this.stageOf(p);
      p.growth = (p.growth || 0) + amount;
      if (this.stageOf(p) !== before) changed.push(i);
    }
    if (changed.length || indices.length) this.save();
    return changed;
  }

  water(index, { free = false } = {}) {
    const p = this.plots[index];
    if (!p) return { ok: false, reason: 'empty' };
    if (this.stageOf(p) >= 4) return { ok: false, reason: 'ready' };
    const now = Date.now();
    if (!free) {
      const wait = (p.lastWater || 0) + WATER_COOLDOWN_MS - now;
      if (wait > 0) return { ok: false, reason: 'wet', wait };
    }
    p.lastWater = now;
    const before = this.stageOf(p);
    p.growth = (p.growth || 0) + WATER_GROWTH;
    this.save();
    return { ok: true, leveled: this.stageOf(p) !== before };
  }

  harvest(index) {
    const p = this.plots[index];
    if (!p) return null;
    const item = findItem('crop', p.type);
    this.plots[index] = null;
    this.harvested += 1;
    const units = item?.yield || 2;
    const lost = this.addGood(p.type, units); // storage overflow must never be silent
    return { item, units, lost };
  }

  // ---- inventory & market ----
  // storageCap is per-good and raised by storage infrastructure (main recomputes it)
  storageCap = 50;

  hasGoods(cost) { return Object.entries(cost || {}).every(([id, n]) => (this.inventory[id] || 0) >= n); }
  spendGoods(cost) {
    for (const [id, n] of Object.entries(cost || {})) this.inventory[id] = Math.max(0, (this.inventory[id] || 0) - n);
    this.save();
  }

  addGood(id, n = 1) {
    const have = this.inventory[id] || 0;
    const add = Math.max(0, Math.min(n, this.storageCap - have));
    if (add > 0) {
      this.inventory[id] = have + add;
      if (!this.discovered.includes(id)) this.discovered.push(id); // collection book
      this.save();
    }
    return n - add; // overflow lost (0 when everything fit)
  }

  // ---- order board ----

  canFulfill(order) {
    return Object.entries(order.items).every(([id, n]) => (this.inventory[id] || 0) >= n);
  }

  fulfillOrder(orderId) {
    const idx = this.orders.findIndex((o) => o.id === orderId);
    if (idx === -1) return null;
    const order = this.orders[idx];
    if (!this.canFulfill(order)) return null;
    for (const [id, n] of Object.entries(order.items)) {
      this.inventory[id] -= n;
      if (this.inventory[id] <= 0) delete this.inventory[id];
    }
    this.orders.splice(idx, 1);
    this.coins += order.reward;
    this.nextOrderAt = Date.now() + 90000 + Math.random() * 90000; // next customer arrives soon
    this.save();
    return order;
  }

  // ---- offline accrual (called once on load by the owner client) ----

  applyOfflineProgress(producerCount) {
    if (this.readOnly || !this.savedAt) return null;
    const elapsed = Math.min(Date.now() - this.savedAt, 8 * 3600 * 1000);
    if (elapsed < 120000) return null; // under 2 minutes away: nothing to report
    const report = { hours: elapsed / 3600000, growth: 0, goods: {} };
    const ticks = Math.floor(elapsed / 120000); // the passive trickle, honored offline
    if (ticks > 0) {
      for (const p of this.plots) {
        if (!p) continue;
        const before = this.stageOf(p);
        p.growth = (p.growth || 0) + ticks;
        if (this.stageOf(p) > before || ticks) report.growth += ticks;
      }
    }
    // producers keep producing while you're away (capped per producer)
    const cycles = Math.min(5, Math.floor(elapsed / 180000));
    for (const [goodId, count] of Object.entries(producerCount)) {
      const made = cycles * count;
      if (made <= 0) continue;
      const lost = this.addGood(goodId, made);
      const kept = made - lost;
      if (kept > 0) report.goods[goodId] = kept;
    }
    this.save();
    const any = report.growth > 0 || Object.keys(report.goods).length > 0;
    return any ? report : null;
  }

  // ---- daily chest & streak ----

  claimDaily() {
    if (this.readOnly) return null;
    const today = new Date().toDateString();
    if (this.lastLoginDay === today) return null;
    const yesterday = new Date(Date.now() - 86400000).toDateString();
    this.streak = this.lastLoginDay === yesterday ? this.streak + 1 : 1;
    this.lastLoginDay = today;
    const coins = Math.min(20 + 10 * this.streak, 120);
    this.coins += coins;
    this.save();
    return { coins, streak: this.streak };
  }

  sellGood(id, qty, unitPrice) {
    const have = this.inventory[id] || 0;
    const n = Math.min(have, qty);
    if (n <= 0) return 0;
    this.inventory[id] = have - n;
    if (this.inventory[id] === 0) delete this.inventory[id];
    const earned = n * unitPrice;
    this.coins += earned;
    this.save();
    return earned;
  }

  inventoryTotal() {
    return Object.values(this.inventory).reduce((a, b) => a + b, 0);
  }

  addCoins(n) {
    this.coins += n;
    this.save();
  }

  // ---- crafting jobs ----

  // inputs: {goodId: n} with special key 'any_fish' resolved against FISH ids by the caller
  canAfford(inputs, resolveAnyFish) {
    for (const [id, n] of Object.entries(inputs)) {
      if (id === 'any_fish') {
        if (!resolveAnyFish || resolveAnyFish(n).length < n) return false;
      } else if ((this.inventory[id] || 0) < n) return false;
    }
    return true;
  }

  startJob(uid, recipe, resolveAnyFish) {
    if (this.jobs[uid]) return false;
    if (!this.canAfford(recipe.inputs, resolveAnyFish)) return false;
    for (const [id, n] of Object.entries(recipe.inputs)) {
      if (id === 'any_fish') {
        for (const fid of resolveAnyFish(n)) {
          this.inventory[fid] -= 1;
          if (this.inventory[fid] <= 0) delete this.inventory[fid];
        }
      } else {
        this.inventory[id] -= n;
        if (this.inventory[id] <= 0) delete this.inventory[id];
      }
    }
    this.jobs[uid] = { recipeId: recipe.id, startedAt: Date.now(), timeMs: recipe.timeMs };
    this.save();
    return true;
  }

  jobProgress(uid) {
    const j = this.jobs[uid];
    if (!j) return null;
    return Math.min(1, (Date.now() - j.startedAt) / j.timeMs);
  }

  finishJob(uid) {
    const j = this.jobs[uid];
    if (!j) return null;
    delete this.jobs[uid];
    this.save();
    return j;
  }
}
