// The Talk panel: what an NPC says, and the four things they can do for you.
//
// The rules are all in `src/mmo/npcs.js` and are never re-derived here. This
// file is the shop floor: a catalog of what each role keeps, the per-hour
// memory that stops a town being milked, the gold moving, and the words that
// go with every one of those, including the words for the times nothing moved.
//
// THE CATALOG AND WHAT ITEMS.JS CAN ACTUALLY MAKE.
//
//   `06-ECONOMY-UI.md` prices seventeen things. Some of them are not items
//   `items.js` has a base for: a bag, a scroll, a pickaxe. `makeItem` throws on
//   an unknown base, so a row for one of those would be a button that explodes
//   the first time somebody presses it. Every row below therefore names a base
//   that really exists, `NO_BASE_FOR` records the ones that do not with the
//   reason, and `auditTalk()` proves at load that no row can ever throw.
//
// THE HOUR.
//
//   06 says a vendor's memory lasts "the last hour". A day and night cycle in
//   this game is DAY_CYCLE_MS, 360000 ms, so an hour of world time is 15
//   seconds and the rule would do nothing at all. The hour used here is an hour
//   of play: 3,600,000 ms off the same clock main.js runs the frame on. That is
//   the only reading under which the rule stops anybody farming a town, which
//   is what 06 says the rule is for.

import {
  NPCS, trainCost, TRAIN_CAP, resurrectCost, RESURRECT_COST, RESURRECT_FREE_AT,
  vendorPrice, vendorPays, townMultiplier, PROVISIONER_SELL_RATE, RESTOCK_S,
} from '../mmo/npcs.js';
import { BASES, makeItem, RARITY, LOG_BASES, ORE_BASES, INGOT_BASES } from '../mmo/items.js';
import { skillNameOf } from '../mmo/items.js';
import { hash2 } from '../world/noise.js';

/** An hour of play. See the note at the top of this file. */
export const VENDOR_MEMORY_MS = 3600 * 1000;
/** Vendor stock refills on the document's half hour. */
export const RESTOCK_MS = RESTOCK_S * 1000;

// ---------------------------------------------------------------------------
// Prices.
//
// Marked (06) where the number is the document's own. Everything else is
// authored, because 06 prices seventeen things and a shop needs more rows than
// that. Armour is priced as a set of eight where the chest counts double, which
// is how the AR table counts it: 9 shares to a set, so a share is set / 9.

/** The armour sets 06 prices, and the two it does not. */
export const ARMOUR_SET_PRICE = {
  cloth: 60,       // "robe set 60" (06)
  leather: 120,    // "leather set 120" (06)
  studded: 280,    // authored: interpolated on the AR ladder between leather and chain
  ring: 440,       // authored: the same interpolation
  chain: 600,      // "chainmail set 600" (06)
  plate: 2400,     // "plate set 2,400" (06)
};
const SET_SHARES = 9;   // seven plain pieces, and a chest that counts twice
export const armourPiecePrice = (tier, piece) =>
  Math.max(1, Math.round((ARMOUR_SET_PRICE[tier] / SET_SHARES) * (piece === 'chest' ? 2 : 1)));

/**
 * What a weapon costs new. Longsword, longbow and quarterstaff are 06's own
 * numbers; the rest are authored to sit sensibly between them, since no rule
 * fits all three (a longsword at 90 and a quarterstaff at 30 do not lie on one
 * line through their damage).
 */
export const WEAPON_PRICE = {
  dagger: 15, throwing_knives: 18, rapier: 45, shortsword: 40, spear: 60,
  longsword: 90 /* 06 */, greatsword: 170, axe: 55, battleaxe: 150,
  mace: 50, warhammer: 145, maul: 120, halberd: 155, glaive: 130,
  quarterstaff: 30 /* 06 */, shortbow: 70, longbow: 140 /* 06 */, crossbow: 165,
};

export const SHIELD_PRICE = { buckler: 30, kite: 70 /* 06 */, tower: 130 };

/**
 * Every base a vendor deals in, priced per unit. A stack row's price is per
 * unit too; the row says how many units a lot holds.
 */
/** ores.js WOODS tiers, by material id. Anything not in it is common timber. */
const WOOD_TIER_OF = { oak: 1, ash: 2, heartwood: 3, ironbark: 4 };

export const PRICES = {
  ...WEAPON_PRICE, ...SHIELD_PRICE,
  bandage: 2 /* 06 */,
  arrow: 1, bolt: 1,          // 06 prices arrows "1 per 5"; the lot rows below carry that
  potion: 25 /* 06, "heal potion 25" */, reagent: 3, gem: 40,
  ring: 60, amulet: 80, tome: 90, torch: 3,
};

// Food, per unit. There is no `food` base any more and no row called Ration:
// a shop that sells "food" sells bread and cheese and a fish. The ladder is the
// old game's catalog prices in `src/farm/catalog.js` read into this game's
// scale, where a bandage is 2 and a torch is 3: a carrot is the cheapest thing
// on the shelf and a haunch of bear is the dearest thing a hunter carries in.
//
// Every food is priced, not only the ones a vendor stocks, because
// `basePriceOf` is also what a vendor PAYS, and a vendor who pays nothing for
// wolf meat is a vendor who silently eats it.
Object.assign(PRICES, {
  carrot: 2, turnip: 2, onion: 2, apple: 2, egg: 3, cabbage: 3, bread: 3,
  cheese: 5, fish: 5, mutton: 8,
  rat_meat: 1, game_meat: 4, crab_meat: 5, venison: 6, wolf_meat: 6,
  boar_meat: 8, bear_meat: 12,
  // the six cooked dishes, dearer than what goes into them
  hearty_stew: 14, roast_fowl: 14, fish_pie: 16, honey_bread: 14,
  spiced_wine: 18, travellers_ration: 16,
});
// Logs, ore and ingots, per unit.
//
// G9 split the three grey stacks into fourteen woods, ten veins and ten metals,
// and a vendor who pays nothing for a Silver Ingot is a vendor who silently
// eats it, so every one of them is priced rather than only the three the shelf
// stocks. The ladder is anchored on the three numbers 06-ECONOMY-UI gives out
// loud, and nothing else about it is from a document:
//
//   "copper ore 1"     an ore is worth its tier: copper 1 ... starfall 10
//   "iron ingot 4"     an ingot is its tier plus one: iron is tier 3, so 4
//   "oak wood 2"       a log is its tier plus one; oak is tier 1, so 2, and
//                      the ten woods `ores.js` never tiered are common timber
//                      and priced with the oak
for (const id of ORE_BASES) PRICES[id] = Math.max(1, BASES[id].tier || 1);
for (const id of INGOT_BASES) PRICES[id] = Math.max(2, (BASES[id].tier || 1) + 1);
for (const id of LOG_BASES) PRICES[id] = 2 + Math.max(0, (WOOD_TIER_OF[BASES[id].material] || 1) - 1);

for (const tier of Object.keys(ARMOUR_SET_PRICE)) {
  for (const piece of ['head', 'chest', 'hands', 'wrists', 'waist', 'legs', 'feet', 'back']) {
    PRICES[`${tier}_${piece}`] = armourPiecePrice(tier, piece);
  }
}

/**
 * Things 06 or 05 names that this shop cannot stock, with the reason. An empty
 * row would look like an oversight; this is the record that it is not, and the
 * list `items.js` would have to grow to close it.
 */
export const UNSTOCKED_CATEGORY = {
  bags: 'bag', scrolls: 'scroll', tools: 'pickaxe', hide: 'hide', feed: 'feed',
};

export const NO_BASE_FOR = {
  bag: 'items.js has no bag base, so "8 slot bag 120" cannot be made or carried. '
     + 'The pack is a fixed 20 slots until a bag base exists.',
  scroll: 'items.js has no scroll base, so the Mage cannot stock the scrolls '
        + '05 says he sells, and recipes.js cannot deliver its 36 scroll recipes.',
  pickaxe: 'items.js has no tool bases beyond the axe, which is a weapon. The '
         + 'Provisioner sells no pickaxe, hatchet, saw, tongs, sewing kit or tinker tools.',
  hide: 'hide is a crafting material with no stack base of its own, so it is '
      + 'bought off the player by weight of gold and never stocked.',
  feed: 'the Stablemaster sells feed, which has no base and no pet to eat it yet.',
};

// ---------------------------------------------------------------------------
// The stock.
//
// One row is one thing on a shelf. `key` is what the per-hour memory counts, so
// a healing potion and a mana potion rise in price separately. `materialTier`
// is the ores.js ladder, which is what an NPC's `sellsToTier` caps: "sells iron
// weapons and armour to tier 3" reads as iron, which is metal tier 3.

const row = (key, base, name, price, opts = {}) => ({
  key, base, name, price,
  count: opts.count ?? 1,
  category: opts.category,
  materialTier: opts.materialTier ?? 1,
  stock: opts.stock ?? 3,
  label: opts.label || null,
  line: opts.line || '',
});

const armourRows = (tier, category, materialTier) =>
  ['head', 'chest', 'hands', 'wrists', 'waist', 'legs', 'feet', 'back'].map((p) => row(
    `${tier}_${p}`, `${tier}_${p}`, BASES[`${tier}_${p}`].name,
    armourPiecePrice(tier, p), { category, materialTier, stock: 2 },
  ));

export const CATALOG = [
  // weapons: what a shop keeps in the rack, not the whole table
  row('longsword', 'longsword', 'Longsword', 90, { category: 'weapons', materialTier: 3, line: 'iron, and honest' }),
  row('shortsword', 'shortsword', 'Shortsword', 40, { category: 'weapons', materialTier: 3, line: 'quick, and cheap' }),
  row('dagger', 'dagger', 'Dagger', 15, { category: 'weapons', materialTier: 3, line: 'for the back of things' }),
  row('mace', 'mace', 'Mace', 50, { category: 'weapons', materialTier: 3, line: 'it does not care about armour' }),
  row('spear', 'spear', 'Spear', 60, { category: 'weapons', materialTier: 3, line: 'three metres of reach' }),
  row('axe', 'axe', 'Axe', 55, { category: 'weapons', materialTier: 3, line: 'and it fells trees' }),
  // shields
  row('buckler', 'buckler', 'Buckler', 30, { category: 'shields', materialTier: 3 }),
  row('kite', 'kite', 'Kite Shield', 70, { category: 'shields', materialTier: 3, line: 'thirty strength to hold it' }),
  row('tower', 'tower', 'Tower Shield', 130, { category: 'shields', materialTier: 3, line: 'fifty five strength, and worth it' }),
  // armour, by the material band the role deals in
  ...armourRows('cloth', 'cloth', 1),
  ...armourRows('leather', 'leather', 2),
  ...armourRows('studded', 'leather', 3),
  ...armourRows('ring', 'armour', 3),
  ...armourRows('chain', 'armour', 3),
  // the mage's corner
  row('robe', 'cloth_chest', 'Cloth Robe', armourPiecePrice('cloth', 'chest'), { category: 'robes', materialTier: 1, line: 'it leaves your mana alone' }),
  row('quarterstaff', 'quarterstaff', 'Quarterstaff', 30, { category: 'staves', materialTier: 1, line: 'it casts' }),
  row('tome', 'tome', 'Tome', 90, { category: 'staves', materialTier: 1, line: 'for the off hand' }),
  // bows and what they eat
  row('shortbow', 'shortbow', 'Shortbow', 70, { category: 'bows', materialTier: 1 }),
  row('longbow', 'longbow', 'Longbow', 140, { category: 'bows', materialTier: 1, line: 'thirty five metres' }),
  row('crossbow', 'crossbow', 'Crossbow', 165, { category: 'bows', materialTier: 3 }),
  row('arrows20', 'arrow', 'Arrows', 4, { category: 'arrows', count: 20, stock: 40, line: 'a score to the bundle' }),
  row('bolts20', 'bolt', 'Bolts', 6, { category: 'arrows', count: 20, stock: 40, line: 'a score to the bundle' }),
  // potions and what makes them
  row('potion.heal', 'potion', 'Potion of healing', 25, { category: 'potions', count: 1, stock: 20, label: 'Potion of healing' }),
  row('potion.mana', 'potion', 'Potion of mana', 30, { category: 'potions', count: 1, stock: 20, label: 'Potion of mana' }),
  row('potion.cure', 'potion', 'Potion of curing', 20, { category: 'potions', count: 1, stock: 20, label: 'Potion of curing' }),
  row('reagents', 'reagent', 'Reagent', 3, { category: 'reagents', count: 5, stock: 40, label: 'Reagent', line: 'five to the handful' }),
  row('bone', 'reagent', 'Bone', 3, { category: 'bone', count: 5, stock: 40, label: 'Bone', line: 'five to the handful, and do not ask' }),
  row('bandages', 'bandage', 'Bandage', 2, { category: 'bandages', count: 10, stock: 40, label: 'Bandage', line: 'ten to the bundle' }),
  // the road kit
  // the road kit. Seven specific foods rather than one row called Ration: this
  // shop has never had a base called food to sell.
  row('bread', 'bread', 'Bread', 3, { category: 'food', count: 3, stock: 40, label: 'Bread', line: 'three days of it, if you are careful' }),
  row('cheese', 'cheese', 'Cheese', 5, { category: 'food', count: 2, stock: 30, label: 'Cheese', line: 'it keeps, which is the whole point of it' }),
  row('apple', 'apple', 'Apple', 2, { category: 'food', count: 4, stock: 40, label: 'Apple', line: 'four to the handful' }),
  row('carrot', 'carrot', 'Carrot', 2, { category: 'food', count: 4, stock: 40, label: 'Carrot' }),
  row('egg', 'egg', 'Egg', 3, { category: 'food', count: 4, stock: 30, label: 'Egg' }),
  row('fish', 'fish', 'Fish', 5, { category: 'food', count: 2, stock: 20, label: 'Fish', line: 'out of the water this morning' }),
  row('mutton', 'mutton', 'Mutton', 8, { category: 'food', count: 1, stock: 15, label: 'Mutton', line: 'salted, and worth the weight' }),
  row('torch', 'torch', 'Torch', 3, { category: 'torches', stock: 20, line: 'the dark down there is not the dark up here' }),
  // the smith's raw stock, which is also what he buys
  // G9: there is no base called `ingot` or `ore` any more, and the smith says
  // which metal he is selling, the way the rest of his shelf already did.
  row('iron_ingot', 'iron_ingot', 'Iron ingot', 4, { category: 'ingots', count: 1, stock: 40, materialTier: 3, label: 'Iron ingot' }),
  row('copper_ore', 'copper_ore', 'Copper ore', 1, { category: 'ore', count: 1, stock: 40, materialTier: 1, label: 'Copper ore' }),
];

/** Which shelf a base sits on, so a thing out of the pack can find its buyer. */
export const CATEGORY_OF = {};
for (const r of CATALOG) if (!CATEGORY_OF[r.base]) CATEGORY_OF[r.base] = r.category;
// Every wood, every vein and every metal, not only the two on the shelf: a
// smith who buys "ingots" buys the silver as well as the iron, and a carter who
// takes wood takes the birch as well as the oak. `CATEGORY_OF.log` used to be
// the whole of this and it named one dead base.
for (const id of LOG_BASES) CATEGORY_OF[id] = 'anything';
for (const id of ORE_BASES) CATEGORY_OF[id] = 'ore';
for (const id of INGOT_BASES) CATEGORY_OF[id] = 'ingots';
CATEGORY_OF.gem = 'anything';
CATEGORY_OF.amulet = 'anything';
CATEGORY_OF.ring = 'anything';
for (const id of Object.keys(BASES)) {
  if (CATEGORY_OF[id]) continue;
  const b = BASES[id];
  if (b.kind === 'weapon') CATEGORY_OF[id] = 'weapons';
  else if (b.kind === 'shield') CATEGORY_OF[id] = 'shields';
  else if (b.kind === 'armour') CATEGORY_OF[id] = b.material === 'cloth' ? 'cloth' : (b.tier <= 3 ? 'leather' : 'armour');
  // Everything edible sits on the food shelf whether or not the shop stocks it,
  // so the Innkeeper, who buys food and nothing else, really will take the
  // venison off a hunter. Without this a wolf haunch was "anything", which only
  // the Provisioner and the Thief would touch.
  else if (b.kind === 'food' || b.kind === 'meal') CATEGORY_OF[id] = 'food';
  else CATEGORY_OF[id] = 'anything';
}

export const categoryOf = (base) => CATEGORY_OF[typeof base === 'object' ? base?.base : base] || 'anything';

/** What a vendor pays for a thing depends on this: their own base price. */
export const basePriceOf = (base) => PRICES[typeof base === 'object' ? base?.base : base] ?? 0;

/**
 * The shelf a role keeps. Capped by `sellsToTier` on the ores ladder where the
 * role has one, which is 05's "sells iron weapons and armour to tier 3".
 */
export function stockFor(role) {
  if (!role || !role.sells?.length) return [];
  const cap = role.sellsToTier ?? Infinity;
  return CATALOG.filter((r) => role.sells.includes(r.category) && r.materialTier <= cap);
}

/**
 * What a role would sell if the item layer had a base for it, with the reason
 * it does not. The Talk panel says this out loud on the Buy tab rather than
 * showing a short shelf and letting the player think the shop is broken.
 */
export function missingFor(role) {
  const out = [];
  for (const cat of role?.sells || []) {
    if (CATALOG.some((r) => r.category === cat)) continue;
    const key = UNSTOCKED_CATEGORY[cat];
    out.push({ category: cat, why: (key && NO_BASE_FOR[key]) || `nothing in the game is a ${cat} yet` });
  }
  return out;
}

/** Whether a role will take a thing off you. 'anything' takes everything. */
export function buysFrom(role, base) {
  if (!role || !role.buys?.length) return false;
  if (role.buys.includes('anything')) return true;
  return role.buys.includes(categoryOf(base));
}

// ---------------------------------------------------------------------------
// The per-hour memory.
//
// character.vendorMemory = { [siteId]: { [key]: { bought, sold, at, stock, stockedAt } } }
//
// One entry per site and per thing. `at` is when the entry was last touched;
// an entry older than VENDOR_MEMORY_MS is the same as no entry at all, which is
// what "in the last hour" means.

const emptyEntry = () => ({ bought: 0, sold: 0, at: 0, stock: null, stockedAt: 0 });

export function memoryOf(character, siteId, key, now = 0) {
  const at = character?.vendorMemory?.[siteId]?.[key];
  if (!at) return emptyEntry();
  if (now - (at.at || 0) > VENDOR_MEMORY_MS) return { ...emptyEntry(), stock: at.stock, stockedAt: at.stockedAt || 0 };
  return { bought: at.bought || 0, sold: at.sold || 0, at: at.at || 0, stock: at.stock ?? null, stockedAt: at.stockedAt || 0 };
}

function writeEntry(character, siteId, key, entry) {
  if (!character) return entry;
  if (!character.vendorMemory) character.vendorMemory = {};
  if (!character.vendorMemory[siteId]) character.vendorMemory[siteId] = {};
  character.vendorMemory[siteId][key] = entry;
  return entry;
}

/** Record units bought or sold. Returns the entry as it now stands. */
export function noteTrade(character, siteId, key, { bought = 0, sold = 0 } = {}, now = 0) {
  const e = memoryOf(character, siteId, key, now);
  return writeEntry(character, siteId, key, {
    bought: e.bought + bought, sold: e.sold + sold, at: now,
    stock: e.stock, stockedAt: e.stockedAt,
  });
}

/** How many of a row are on the shelf, refilling every half hour. */
export function stockLeft(character, siteId, row, now = 0) {
  const e = memoryOf(character, siteId, row.key, now);
  if (e.stock == null || now - e.stockedAt > RESTOCK_MS) return row.stock;
  return e.stock;
}

function takeStock(character, siteId, row, n, now) {
  const left = stockLeft(character, siteId, row, now);
  const e = memoryOf(character, siteId, row.key, now);
  writeEntry(character, siteId, row.key, {
    bought: e.bought, sold: e.sold, at: now,
    stock: Math.max(0, left - n),
    stockedAt: (e.stock == null || now - e.stockedAt > RESTOCK_MS) ? now : e.stockedAt,
  });
}

/** A town's price multiplier, 0.9 to 1.2, the same for everybody. */
export const multiplierFor = (site) =>
  townMultiplier(hash2(site?.cx | 0, site?.cz | 0, 4241));

/**
 * What `n` of a thing cost, unit by unit, with the price rising 5% per unit
 * bought in the hour. Returns the total and the price of the next single one.
 */
export function quoteBuy(base, mult, boughtThisHour, n = 1) {
  let total = 0;
  for (let i = 0; i < n; i++) total += vendorPrice(base, mult, boughtThisHour + i);
  return { total, each: vendorPrice(base, mult, boughtThisHour), units: n };
}

/**
 * What a vendor pays for `n`, falling 10% a unit to the 5% floor. `base` is the
 * catalog buy price of the same thing, which is what 06 says the rate is of.
 */
export function quoteSell(base, soldThisHour, n = 1, isProvisioner = false) {
  let total = 0;
  for (let i = 0; i < n; i++) total += vendorPays(base, soldThisHour + i, isProvisioner);
  return { total, each: vendorPays(base, soldThisHour, isProvisioner), units: n };
}

// ---------------------------------------------------------------------------
// Training and healing.

/** The quote for lifting a skill, and the reason when there is not one. */
export function trainQuote(character, role, skillId, to = TRAIN_CAP) {
  const name = skillNameOf(skillId);
  if (!role?.teaches?.includes(skillId)) {
    return { ok: false, cost: 0, from: 0, to: 0, why: `The ${role?.name || 'trainer'} does not teach ${name}.` };
  }
  const from = character?.skills?.[skillId] ?? 0;
  if (from >= TRAIN_CAP) {
    return { ok: false, cost: 0, from, to: from, why: `Your ${name} is ${from.toFixed(1)}. Past forty nobody can teach you. You practise.` };
  }
  const end = Math.min(to, TRAIN_CAP);
  const cost = trainCost(from, end);
  if (cost <= 0) return { ok: false, cost: 0, from, to: from, why: `There is nothing to buy: that is where your ${name} already stands.` };
  const gold = character?.gold ?? 0;
  if (gold < cost) {
    return { ok: false, cost, from, to: end, short: cost - gold, why: `${name} to ${end} is ${cost} gold and you have ${gold}. You are ${cost - gold} short.` };
  }
  return { ok: true, cost, from, to: end, why: null };
}

/** How far your purse takes you, when it will not take you to forty. */
export function trainAsFarAsGold(character, role, skillId) {
  const from = character?.skills?.[skillId] ?? 0;
  const gold = character?.gold ?? 0;
  const reach = Math.min(TRAIN_CAP, from + gold / 10);
  return Math.round(reach * 10) / 10;
}

/** What a healer charges. 06 puts a price on the dead and on nothing else. */
export function healQuote(character, role) {
  const dead = (character?.health ?? 1) <= 0 || !!character?.dead;
  const healing = character?.skills?.healing ?? 0;
  if (dead) {
    const cost = resurrectCost(healing);
    const gold = character?.gold ?? 0;
    if (cost > 0 && gold < cost) return { kind: 'resurrect', ok: false, cost, why: `Raising you is ${cost} gold and you have ${gold}.` };
    return { kind: 'resurrect', ok: true, cost, why: null };
  }
  const missing = Math.max(0, (character?.maxHealth ?? 0) - (character?.health ?? 0));
  if (missing <= 0) return { kind: 'heal', ok: false, cost: 0, why: 'There is nothing wrong with you. Keep your gold.' };
  return { kind: 'heal', ok: true, cost: 0, missing, why: null };
}

// ---------------------------------------------------------------------------
// The engine. Every button in the panel goes through one of these, and so does
// every test, so the test path is the real path.

// ---------------------------------------------------------------------------
// The inventory, as W3 built it.
//
//   inventory.pack           -> { slots, items }
//   inventory.add(item)      -> { ok, added, dropped, text }   NOT a boolean
//   inventory.remove(where, n) where `where` is a PACK INDEX, not the item
//   inventory.emptySlot()    -> the first free slot, or -1
//
// These three wrappers are the whole of this file's contact with it, and they
// also work with no inventory at all, against the character document, so the
// node tests drive the same code the game does.

/** The pack's slot array, holes and all. */
export function packItems(ctx) {
  return ctx?.inventory?.pack?.items || ctx?.character?.pack?.items || [];
}

/** Whether one more thing would fit. */
export function hasRoom(ctx) {
  const inv = ctx?.inventory;
  if (inv && typeof inv.emptySlot === 'function') return inv.emptySlot() >= 0;
  const p = ctx?.character?.pack;
  if (!p) return true;
  return (p.items || []).filter(Boolean).length < (p.slots ?? 20);
}

/** True when the item really went in. */
export function addItem(ctx, item) {
  const inv = ctx?.inventory;
  if (inv && typeof inv.add === 'function') {
    const r = inv.add(item);
    if (r === false) return false;
    if (r && typeof r === 'object') return r.ok !== false && (r.added ?? 1) > 0;
    return r !== false;
  }
  const list = ctx?.character?.pack?.items;
  if (!list) return false;
  const i = list.indexOf(null);
  if (i < 0 || i >= (ctx.character.pack.slots ?? 20)) return false;
  list[i] = item;
  return true;
}

/** True when `n` of the item really came out. */
export function removeItem(ctx, item, n = null) {
  const list = packItems(ctx);
  const i = list.indexOf(item);
  if (i < 0) return false;
  const inv = ctx?.inventory;
  if (inv && typeof inv.remove === 'function') {
    const r = inv.remove(i, n);
    return !(r === false || (r && r.ok === false));
  }
  const have = item.count ?? 1;
  const want = n == null ? have : n;
  if (want < have) { item.count = have - want; return true; }
  list[i] = null;
  return true;
}

const pos = (ctx) => ctx?.player?.pos || ctx?.actor?.pos || { x: 0, y: 0, z: 0 };

/**
 * "an axe", "6 iron ingots", "a pair of gloves". A line that says "You sell 6
 * ingot" reads like a placeholder, and a placeholder reads like a bug.
 */
export function countedName(name, n = 1) {
  const word = String(name || 'thing').toLowerCase();
  if (n > 1) {
    if (/s$/.test(word)) return `${n} ${word}`;
    if (/(ch|sh|x|z)$/.test(word)) return `${n} ${word}es`;
    return `${n} ${word}s`;
  }
  if (/s$/.test(word)) return word;                       // "gloves", "bracers"
  return `${/^[aeiou]/.test(word) ? 'an' : 'a'} ${word}`;
}

function say(ctx, text, kind) {
  ctx?.hud?.toast?.(text, kind);
  ctx?.hud?.log?.(text, kind);
  return text;
}

function goldFloat(ctx, n) {
  if (!n) return;
  ctx?.floaters?.spawn?.(pos(ctx), `${n > 0 ? '+' : ''}${n}`, 'gold');
}

/**
 * @param ctx  { character, actor, inventory, hud, audio, floaters, player, now }
 * @param npc  the record from npcs_runtime.js: { role, personName, site }, or
 *             one of S2's named people, which is the same record with a `story`
 *             on it: `{ name, title, lines }` out of `src/mmo/story.js`.
 *
 * A NAMED PERSON IS NOT A SECOND KIND OF SHOP. The story replaces exactly two
 * things: the name at the top of the panel and the lines on the Talk tab. Every
 * other tab is still the role's, so Cobb Ashby keeps the Blacksmith's shelf,
 * his prices and his repair, and Ivy Weir's Miller sells what a Miller sells.
 * `tabsFor` is therefore asked about the ROLE and never about the story, and a
 * named person whose role trades in nothing opens on Talk, correctly.
 */
export function createTalkEngine(ctx, npc) {
  const role = npc?.role || NPCS[npc?.roleId] || null;
  const story = (npc?.story && typeof npc.story === 'object' && Array.isArray(npc.story.lines)) ? npc.story : null;
  const site = npc?.site || {};
  const siteId = site.id || 'nowhere';
  const mult = multiplierFor(site);
  const isProvisioner = role?.id === 'provisioner';
  const who = story
    ? `${story.name}, ${story.title}`
    : (npc?.personName ? `${npc.personName}, the ${role?.name}` : (role?.name || 'they'));
  const now = () => (typeof ctx?.now === 'function' ? ctx.now() : (ctx?.now ?? Date.now()));

  const character = () => ctx?.character || {};

  const pack = () => packItems(ctx).filter(Boolean);
  const packRoom = () => hasRoom(ctx);

  /** Every row on the shelf with its live price and what is left of it. */
  function shelf() {
    const n = now();
    return stockFor(role).map((r) => {
      const mem = memoryOf(character(), siteId, r.key, n);
      const q = quoteBuy(r.price, mult, mem.bought, 1);
      return { row: r, price: q.each, bought: mem.bought, left: stockLeft(character(), siteId, r, n) };
    });
  }

  /** Everything in the pack this one will take, with what they would pay. */
  function offers() {
    const n = now();
    return pack().filter((it) => buysFrom(role, it.base) && basePriceOf(it) > 0).map((it) => {
      const key = it.base;
      const mem = memoryOf(character(), siteId, key, n);
      const units = it.count ?? 1;
      const q = quoteSell(basePriceOf(it), mem.sold, units, isProvisioner);
      return { item: it, key, units, pays: q.total, each: q.each, sold: mem.sold };
    });
  }

  function buy(key, want = 1) {
    const r = stockFor(role).find((x) => x.key === key);
    if (!r) return { ok: false, text: say(ctx, `${who} does not keep that.`, 'bad') };
    const n = now();
    const c = character();
    const left = stockLeft(c, siteId, r, n);
    if (left <= 0) {
      return { ok: false, text: say(ctx, `The shelf is bare. ${who} restocks within the half hour.`, 'bad') };
    }
    const units = Math.min(want, left);
    if (!packRoom()) {
      ctx?.audio?.play?.('denied');
      return { ok: false, text: say(ctx, 'Your pack is full, so nothing was bought and nothing was paid.', 'bad') };
    }
    const mem = memoryOf(c, siteId, r.key, n);
    const q = quoteBuy(r.price, mult, mem.bought, units);
    if ((c.gold ?? 0) < q.total) {
      ctx?.audio?.play?.('denied');
      const short = q.total - (c.gold ?? 0);
      const nm = countedName(r.name, r.count * units);
      return { ok: false, text: say(ctx, `${nm.charAt(0).toUpperCase()}${nm.slice(1)} comes to ${q.total} gold and you have ${c.gold ?? 0}. You are ${short} short.`, 'bad') };
    }
    const item = makeItem({
      base: r.base, rarity: 'common', quality: 1,
      count: r.count * units,
      seed: hash2(site.cx | 0, site.cz | 0, (n & 0xffff) + r.key.length),
    });
    if (r.label) item.label = r.label;
    if (!addItem(ctx, item)) {
      ctx?.audio?.play?.('denied');
      return { ok: false, text: say(ctx, 'It would not fit in your pack, so the gold stayed in your purse.', 'bad') };
    }
    c.gold = (c.gold ?? 0) - q.total;
    noteTrade(c, siteId, r.key, { bought: units }, n);
    takeStock(c, siteId, r, units, n);
    goldFloat(ctx, -q.total);
    ctx?.audio?.play?.('buy');
    const rose = mem.bought > 0 ? ', which is dearer than the first one you took' : '';
    const carried = r.count * units;
    return {
      ok: true, gold: q.total, item,
      text: say(ctx, `You buy ${countedName(r.name, carried)} for ${q.total} gold${rose}. ${c.gold} left.`, 'good'),
    };
  }

  function sell(item, want = null) {
    const c = character();
    if (!item) return { ok: false, text: say(ctx, 'Nothing to sell.', 'bad') };
    if (!buysFrom(role, item.base)) {
      return { ok: false, text: say(ctx, `${who} will not take that. Try the Provisioner, who takes anything.`, 'bad') };
    }
    const base = basePriceOf(item);
    if (base <= 0) {
      return { ok: false, text: say(ctx, `${who} cannot put a price on that.`, 'bad') };
    }
    const n = now();
    const have = item.count ?? 1;
    const units = Math.max(1, Math.min(want ?? have, have));
    const mem = memoryOf(c, siteId, item.base, n);
    const q = quoteSell(base, mem.sold, units, isProvisioner);
    if (!removeItem(ctx, item, units)) {
      return { ok: false, text: say(ctx, 'That is not in your pack any more.', 'bad') };
    }
    c.gold = (c.gold ?? 0) + q.total;
    noteTrade(c, siteId, item.base, { sold: units }, n);
    goldFloat(ctx, q.total);
    ctx?.audio?.play?.('sell');
    const name = item.label || BASES[item.base]?.name || item.base;
    const floored = vendorPays(base, mem.sold + units - 1, isProvisioner) <= Math.max(1, Math.round(base * 0.05));
    const tail = floored ? ' They will barely pay for another today.' : '';
    return {
      ok: true, gold: q.total,
      text: say(ctx, `You sell ${countedName(name, units)} for ${q.total} gold.${tail} ${c.gold} in your purse.`, 'good'),
    };
  }

  function train(skillId, to = TRAIN_CAP) {
    const c = character();
    const q = trainQuote(c, role, skillId, to);
    if (!q.ok) {
      ctx?.audio?.play?.('denied');
      return { ok: false, quote: q, text: say(ctx, q.why, 'bad') };
    }
    if (!c.skills) c.skills = {};
    const before = q.from;
    c.skills[skillId] = q.to;
    c.gold = (c.gold ?? 0) - q.cost;
    ctx?.actor?.recompute?.(ctx.actor);
    goldFloat(ctx, -q.cost);
    ctx?.floaters?.spawn?.(pos(ctx), `+${(q.to - before).toFixed(1)} ${skillNameOf(skillId)}`, 'gain');
    ctx?.audio?.play?.('discover');
    return {
      ok: true, quote: q,
      text: say(ctx, `${who} drills you until your ${skillNameOf(skillId)} stands at ${q.to.toFixed(1)}, up from ${before.toFixed(1)}. That was ${q.cost} gold, and ${c.gold} is left.`, 'good'),
    };
  }

  function heal() {
    const c = character();
    const q = healQuote(c, role);
    if (!role?.services?.includes(q.kind === 'resurrect' ? 'resurrect' : 'heal')) {
      return { ok: false, text: say(ctx, `${who} is no healer.`, 'bad') };
    }
    if (!q.ok) {
      ctx?.audio?.play?.('denied');
      return { ok: false, quote: q, text: say(ctx, q.why, 'bad') };
    }
    if (q.kind === 'resurrect') {
      c.gold = (c.gold ?? 0) - q.cost;
      c.dead = false;
      c.health = Math.max(1, Math.round((c.maxHealth ?? 1) * 0.5));
      ctx?.actor?.recompute?.(ctx.actor);
      if (q.cost) goldFloat(ctx, -q.cost);
      ctx?.audio?.play?.('discover');
      const paid = q.cost > 0
        ? `That was ${RESURRECT_COST} gold, and ${c.gold} is left.`
        : `Your own Healing is past ${RESURRECT_FREE_AT}, so it cost nothing.`;
      return { ok: true, quote: q, text: say(ctx, `${who} raises you. You come back at ${c.health} health. ${paid}`, 'good') };
    }
    const before = c.health ?? 0;
    c.health = c.maxHealth ?? before;
    ctx?.floaters?.spawn?.(pos(ctx), `+${Math.round(c.health - before)}`, 'heal');
    ctx?.audio?.play?.('pickup');
    return {
      ok: true, quote: q,
      text: say(ctx, `${who} closes what was open. ${Math.round(c.health - before)} health back, and no charge: dying is what costs.`, 'good'),
    };
  }

  function cure() {
    const c = character();
    if (!role?.services?.includes('cure')) return { ok: false, text: say(ctx, `${who} does not draw poison.`, 'bad') };
    const st = c.status || {};
    if (!st.poison && !st.bleed) return { ok: false, text: say(ctx, 'There is nothing in you to draw out.', 'bad') };
    delete st.poison; delete st.bleed;
    ctx?.audio?.play?.('pickup');
    return { ok: true, text: say(ctx, `${who} draws it out. Come sooner next time.`, 'good') };
  }

  function rest() {
    const c = character();
    if (!role?.services?.includes('rest')) return { ok: false, text: say(ctx, `${who} keeps no beds.`, 'bad') };
    const before = { h: c.health ?? 0, m: c.mana ?? 0, s: c.stamina ?? 0 };
    c.health = c.maxHealth ?? before.h;
    c.mana = c.maxMana ?? before.m;
    c.stamina = c.maxStamina ?? before.s;
    ctx?.audio?.play?.('pickup');
    return {
      ok: true,
      text: say(ctx, `You sleep at ${site.name || 'the inn'} and wake whole: ${Math.round(c.health)} health, ${Math.round(c.mana)} mana, ${Math.round(c.stamina)} stamina.`, 'good'),
    };
  }

  return {
    role, npc, who, site, siteId, mult, isProvisioner, story,
    shelf, offers, buy, sell, train, heal, cure, rest,
    // A named person says their own lines. The role's lines are the shop's
    // patter and belong to whoever is standing in that door when nobody has
    // been written for it.
    lines: () => (story ? story.lines : (role?.lines || [])),
    tabs: () => tabsFor(role),
    trainable: () => (role?.teaches || []).map((id) => ({ id, name: skillNameOf(id), quote: trainQuote(character(), role, id) })),
    packRoom,
  };
}

/** Which tabs a role earns. Nobody gets a tab with nothing behind it. */
export function tabsFor(role) {
  const out = ['talk'];
  if (role?.sells?.length && stockFor(role).length) out.push('buy');
  if (role?.buys?.length) out.push('sell');
  if (role?.teaches?.length) out.push('train');
  if (role?.services?.some((s) => s === 'heal' || s === 'cure' || s === 'resurrect' || s === 'rest')) out.push('heal');
  return out;
}

/** Every claim this shop makes, checked at load. */
export function auditTalk() {
  const bad = [];
  const keys = new Set();
  for (const r of CATALOG) {
    const at = `stock row ${r.key}`;
    if (keys.has(r.key)) bad.push(`${at}: two rows share a key`);
    keys.add(r.key);
    if (!BASES[r.base]) bad.push(`${at}: base "${r.base}" is not an item this game has, and makeItem would throw`);
    if (!(r.price > 0)) bad.push(`${at}: costs ${r.price}`);
    if (!(r.count > 0)) bad.push(`${at}: a lot of ${r.count}`);
    if (!(r.stock > 0)) bad.push(`${at}: a shelf of ${r.stock}`);
    if (!r.category) bad.push(`${at}: on no shelf`);
    if (r.name.includes('—')) bad.push(`${at}: em dash in the name`);
    // the thing a buy would really do, run for real
    try { makeItem({ base: r.base, rarity: 'common', quality: 1, count: r.count }); }
    catch (e) { bad.push(`${at}: makeItem refuses it (${e.message})`); }
  }
  // Every role that sells something has something to sell.
  for (const role of Object.values(NPCS)) {
    if (role.sells.length && stockFor(role).length === 0) {
      // Allowed only when every shelf they keep is recorded as one the item
      // layer cannot make. Anything else is a role selling into thin air.
      const missing = missingFor(role);
      if (missing.length !== role.sells.length) {
        bad.push(`the ${role.name} sells ${role.sells.join(', ')} and no row on the shelf matches any of them`);
      }
    }
    if (tabsFor(role).length < 2) bad.push(`the ${role.name} has only a Talk tab, which means the panel offers nothing`);
  }
  // Prices have to exist for anything a vendor would buy off the player.
  for (const r of CATALOG) if (!(basePriceOf(r.base) > 0)) bad.push(`${r.base} is stocked but has no price to buy it back at`);
  if (!RARITY.common) bad.push('items.js has no common rarity, which is what a shop sells');
  if (bad.length) throw new Error(`auditTalk: ${bad.length} problem(s)\n  ${bad.join('\n  ')}`);
  return { rows: CATALOG.length, roles: Object.keys(NPCS).length, missingBases: Object.keys(NO_BASE_FOR).length };
}

auditTalk();

// ---------------------------------------------------------------------------
// The panel.

const CSS = `
.bw-win-talk .bw-talk-who{font-size:15px;font-weight:600;margin:0 0 2px}
.bw-win-talk .bw-talk-where{color:#95a08f;font-size:12px;margin:0 0 10px}
.bw-win-talk .bw-tabs{display:flex;gap:6px;margin:0 0 10px;flex-wrap:wrap}
.bw-win-talk .bw-tabs button{font:inherit;font-size:12px;padding:4px 10px;border-radius:6px;
  border:1px solid #4f6349;background:#243021;color:#dfe8d8;cursor:pointer}
.bw-win-talk .bw-tabs button.on{background:#3a5030;border-color:#7c9c6c;color:#fff}
.bw-win-talk .bw-lines p{margin:0 0 7px;line-height:1.5}
.bw-win-talk .bw-list{display:flex;flex-direction:column;gap:2px;max-height:46vh;overflow:auto}
.bw-win-talk .bw-r{display:flex;align-items:center;gap:10px;padding:6px 2px;border-top:1px solid #2a332a}
.bw-win-talk .bw-r .n{flex:1 1 auto}
.bw-win-talk .bw-r .n small{display:block;color:#8b9686;font-size:11.5px}
.bw-win-talk .bw-r .p{color:#e3c26a;font-variant-numeric:tabular-nums;min-width:64px;text-align:right}
.bw-win-talk .bw-r button{font:inherit;font-size:12px;padding:4px 9px;border-radius:6px;
  border:1px solid #4f6349;background:#2c3a2b;color:#e8f0e2;cursor:pointer;white-space:nowrap}
.bw-win-talk .bw-r button:disabled{opacity:.5;cursor:default}
.bw-win-talk .bw-none{color:#8b9686;padding:8px 2px}
.bw-win-talk .bw-purse{color:#e3c26a;font-variant-numeric:tabular-nums;margin-top:10px}
`;

const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

export const panel = {
  id: 'talk',
  title: 'Talk',
  key: null,                 // opened by a click on a person, never by a key

  build(root, ctx) {
    if (typeof document === 'undefined') return;
    if (!document.getElementById('bw-talk-css')) {
      const st = document.createElement('style');
      st.id = 'bw-talk-css';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    root.classList.add('bw-win-talk');
    this._root = root;
    this._ctx = ctx;
    root.textContent = '';
    this._who = el('p', 'bw-talk-who');
    this._where = el('p', 'bw-talk-where');
    this._tabs = el('div', 'bw-tabs');
    this._body = el('div', 'bw-body');
    this._purse = el('div', 'bw-purse');
    root.append(this._who, this._where, this._tabs, this._body, this._purse);
  },

  open(ctx, extra) {
    const npc = extra?.npc || ctx?.npc || ctx?.extra?.npc || null;
    this._ctx = ctx || this._ctx;
    this._engine = npc ? createTalkEngine(this._ctx, npc) : null;
    this._tab = 'talk';
    this.render();
  },

  close() { this._engine = null; },

  render() {
    const e = this._engine;
    if (!this._root || typeof document === 'undefined') return;
    if (!e) { this._body && (this._body.textContent = 'Nobody is here.'); return; }
    this._who.textContent = e.who;
    this._where.textContent = e.site?.name ? `In ${e.site.name}. Prices here run at ${(e.mult * 100).toFixed(0)}% of the going rate.` : '';
    this._tabs.textContent = '';
    const healLabel = e.role?.services?.includes('heal') ? 'Heal' : 'Rest';
    const LABEL = { talk: 'Talk', buy: 'Buy', sell: 'Sell', train: 'Train', heal: healLabel };
    for (const t of e.tabs()) {
      const b = el('button', t === this._tab ? 'on' : null, LABEL[t]);
      b.addEventListener('click', () => { this._tab = t; this.render(); });
      this._tabs.appendChild(b);
    }
    this._body.textContent = '';
    const list = el('div', 'bw-list');
    const after = () => this.render();

    if (this._tab === 'talk') {
      const lines = el('div', 'bw-lines');
      for (const l of e.lines()) lines.appendChild(el('p', null, l));
      this._body.appendChild(lines);
    } else if (this._tab === 'buy') {
      const shelf = e.shelf();
      if (!shelf.length) list.appendChild(el('div', 'bw-none', 'The shelves are empty.'));
      for (const s of shelf) {
        const r = el('div', 'bw-r');
        const n = el('span', 'n', s.row.name);
        n.appendChild(el('small', null, `${s.row.line || s.row.category}${s.left <= 0 ? ', sold out until they restock' : `, ${s.left} left`}${s.bought ? `, and you have had ${s.bought} today` : ''}`));
        r.append(n, el('span', 'p', `${s.price}g`));
        for (const lot of [1, 5]) {
          if (lot > 1 && s.left < 2) continue;
          const b = el('button', null, lot === 1 ? 'buy' : `buy ${lot}`);
          b.disabled = s.left <= 0;
          b.addEventListener('click', () => { e.buy(s.row.key, lot); after(); });
          r.appendChild(b);
        }
        list.appendChild(r);
      }
      for (const m of missingFor(e.role)) {
        list.appendChild(el('div', 'bw-none', `They would sell you ${m.category}, but ${m.why}`));
      }
      this._body.appendChild(list);
    } else if (this._tab === 'sell') {
      const offers = e.offers();
      if (!offers.length) list.appendChild(el('div', 'bw-none', 'Nothing in your pack is anything they want.'));
      for (const o of offers) {
        const r = el('div', 'bw-r');
        const n = el('span', 'n', o.item.label || BASES[o.item.base]?.name || o.item.base);
        n.appendChild(el('small', null, `${o.units > 1 ? `${o.units} of them, ` : ''}${o.each} gold each${o.sold ? `, after ${o.sold} sold here today` : ''}`));
        r.append(n, el('span', 'p', `${o.pays}g`));
        const b = el('button', null, 'sell');
        b.addEventListener('click', () => { e.sell(o.item); after(); });
        r.appendChild(b);
        list.appendChild(r);
      }
      this._body.appendChild(list);
    } else if (this._tab === 'train') {
      for (const t of e.trainable()) {
        const r = el('div', 'bw-r');
        const q = t.quote;
        const n = el('span', 'n', t.name);
        n.appendChild(el('small', null, q.ok ? `${q.from.toFixed(1)} now, ${q.to} after` : q.why));
        r.append(n, el('span', 'p', q.cost ? `${q.cost}g` : ''));
        const b = el('button', null, `train to ${TRAIN_CAP}`);
        b.disabled = !q.ok;
        b.addEventListener('click', () => { e.train(t.id); after(); });
        r.appendChild(b);
        if (!q.ok && q.short) {
          const far = trainAsFarAsGold(this._ctx.character, e.role, t.id);
          const b2 = el('button', null, `spend what you have (to ${far.toFixed(1)})`);
          b2.addEventListener('click', () => { e.train(t.id, far); after(); });
          r.appendChild(b2);
        }
        list.appendChild(r);
      }
      this._body.appendChild(list);
    } else if (this._tab === 'heal') {
      const svc = e.role?.services || [];
      const add = (label, note, fn, on) => {
        const r = el('div', 'bw-r');
        const n = el('span', 'n', label);
        n.appendChild(el('small', null, note));
        r.append(n, el('span', 'p', ''));
        const b = el('button', null, label.toLowerCase());
        b.disabled = !on;
        b.addEventListener('click', () => { fn(); after(); });
        r.appendChild(b);
        list.appendChild(r);
      };
      const q = healQuote(this._ctx.character, e.role);
      if (svc.includes('heal')) add('Heal', q.kind === 'heal' && q.ok ? `${q.missing} health to put back, and no charge` : (q.why || 'nothing to close'), () => e.heal(), q.kind === 'heal' && q.ok);
      if (svc.includes('resurrect')) add('Raise', q.kind === 'resurrect' ? (q.why || `${q.cost} gold`) : `${RESURRECT_COST} gold, and only for the dead`, () => e.heal(), q.kind === 'resurrect' && q.ok);
      if (svc.includes('cure')) add('Cure', 'poison and bleeding drawn out, free', () => e.cure(), true);
      if (svc.includes('rest')) add('Rest', 'a bed, a fire, and you wake whole', () => e.rest(), true);
      this._body.appendChild(list);
    }
    this._purse.textContent = `${this._ctx?.character?.gold ?? 0} gold`;
  },
};

export default panel;
