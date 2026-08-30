// The unlock catalog — single source of truth for the sidebar and game logic.
// Everything is bought with coins; nothing is gated on anything else.

// growth thresholds: accumulated growth since planting → stage 1..4. Growth
// comes from watering, sprinklers and the passive time trickle.
export const GROW_STANDARD = [1, 3, 6, 10];
export const GROW_PREMIUM = [2, 5, 10, 16];

// price: what the item costs in coins. price 0 = free/starter.
// yield/sell: harvest units and per-unit sale price. produces: passive good id.
export const CROPS = [
  // Prices climb into a real save-up curve so reaching the top crop takes work.
  { id: 'carrot', name: 'Carrots', icon: '🥕', price: 0, yield: 3, sell: 3, grow: GROW_STANDARD },
  { id: 'wheat', name: 'Wheat', icon: '🌾', price: 0, yield: 4, sell: 2, grow: GROW_STANDARD },
  { id: 'corn', name: 'Corn', icon: '🌽', price: 20, yield: 3, sell: 4, grow: GROW_STANDARD },
  { id: 'tomato', name: 'Tomatoes', icon: '🍅', price: 40, yield: 3, sell: 5, grow: GROW_STANDARD },
  { id: 'pumpkin', name: 'Pumpkins', icon: '🎃', price: 70, yield: 2, sell: 8, grow: GROW_STANDARD },
  { id: 'rice', name: 'Rice Paddy', icon: '🍚', price: 100, yield: 4, sell: 4, grow: GROW_STANDARD },
  { id: 'sunflower', name: 'Sunflowers', icon: '🌻', price: 140, yield: 2, sell: 7, grow: GROW_STANDARD },
  { id: 'strawberry', name: 'Strawberries', icon: '🍓', price: 200, yield: 3, sell: 10, grow: GROW_PREMIUM },
  { id: 'grapes', name: 'Grape Trellis', icon: '🍇', price: 280, yield: 3, sell: 13, grow: GROW_PREMIUM },
  { id: 'watermelon', name: 'Watermelons', icon: '🍉', price: 380, yield: 2, sell: 18, grow: GROW_PREMIUM },
];

export const TREES = [
  { id: 'apple', name: 'Apple Tree', icon: '🍎', price: 45, produces: 'apple_fruit' },
  { id: 'peach', name: 'Peach Tree', icon: '🍑', price: 55, produces: 'peach_fruit' },
  { id: 'avocado', name: 'Avocado Tree', icon: '🥑', price: 65, produces: 'avocado_fruit' },
  { id: 'cherry', name: 'Cherry Blossom', icon: '🌸', price: 120 },
];

export const OBJECTS = [
  // a woodlot you plant and chop for timber (needs an axe); regrows from a stump
  { id: 'pine_timber', name: 'Timber Pine', icon: '🌲', price: 15, choppable: true, wood: 3, chopHp: 3, regrowMs: 180000 },
  // craftable wood furniture — placed for wood, not coins (see cost)
  { id: 'garden_bench', name: 'Garden Bench', icon: '🪑', cost: { wood: 5 } },
  { id: 'picnic_table', name: 'Picnic Table', icon: '🪵', cost: { wood: 8 } },
  { id: 'barrel', name: 'Barrel', icon: '🛢️', price: 10 },
  { id: 'hay', name: 'Hay Bale', icon: '🌾', price: 15 },
  { id: 'lantern', name: 'Lantern', icon: '🏮', price: 20 },
  { id: 'scarecrow', name: 'Scarecrow', icon: '🎩', price: 30 },
  { id: 'beehive', name: 'Beehive', icon: '🐝', price: 45, produces: 'honey' },
  { id: 'sign', name: 'Custom Sign', icon: '🪧', price: 40 },
  { id: 'goldpond', name: 'Goldfish Pond', icon: '🐟', price: 60 },
  { id: 'tractor', name: 'Tractor', icon: '🚜', price: 150 },
  { id: 'koipond', name: 'Koi Pond', icon: '🎏', price: 90 },
  // fish trap — placed IN water (a lake or stream), passively catches fish
  { id: 'fish_trap', name: 'Fish Trap', icon: '🪤', price: 55, produces: 'trapped_fish', water: true },
  // campsite decor — the campfire & lantern glow and cast light (day/night later)
  { id: 'campfire', name: 'Campfire', icon: '🔥', price: 40 },
  { id: 'tent', name: 'Tent', icon: '⛺', price: 60 },
  { id: 'camp_chair', name: 'Camp Chair', icon: '🪑', price: 25 },
  { id: 'camp_lantern', name: 'Camp Lantern', icon: '🪔', price: 30 },
];

export const ANIMALS = [
  { id: 'bunny', name: 'Bunny', icon: '🐇', price: 20 },
  { id: 'chicken', name: 'Chicken', icon: '🐔', price: 25, produces: 'egg' },
  { id: 'duck', name: 'Duck', icon: '🦆', price: 30, produces: 'duck_egg' },
  { id: 'cat', name: 'Cat', icon: '🐈', price: 40 },
  { id: 'rooster', name: 'Rooster', icon: '🐓', price: 35 },
  { id: 'dog', name: 'Dog', icon: '🐕', price: 50 },
  { id: 'sheep', name: 'Sheep', icon: '🐑', price: 60, produces: 'wool' },
  { id: 'goat', name: 'Goat', icon: '🐐', price: 70, produces: 'goat_milk' },
  { id: 'pig', name: 'Pig', icon: '🐖', price: 80, produces: 'truffle' },
  { id: 'cow', name: 'Cow', icon: '🐄', price: 100, produces: 'milk' },
  { id: 'horse', name: 'Horse', icon: '🐴', price: 200 },
];

export const BUILDINGS = [
  { id: 'enclosure_small', name: 'Small Pen', icon: '🚧', price: 30 },
  { id: 'silo', name: 'Corn Silo', icon: '🌽', price: 60, effect: { type: 'storage', cap: 60 } },
  { id: 'barn1', name: 'Small Barn', icon: '🏚️', price: 80, effect: { type: 'storage', cap: 40 } },
  { id: 'enclosure_large', name: 'Large Pen', icon: '🚜', price: 60 },
  { id: 'barn2', name: 'Big Barn', icon: '🏠', price: 200, effect: { type: 'storage', cap: 110 } },
  { id: 'barn3', name: 'Grand Barn', icon: '🏰', price: 500, effect: { type: 'storage', cap: 220 } },
];

// sellable goods: crop produce (id = crop id), passive animal/tree goods, fish (from fishing.js)
export const GOODS = {
  carrot: { name: 'Carrots', icon: '🥕', sell: 3 },
  wheat: { name: 'Wheat', icon: '🌾', sell: 2 },
  corn: { name: 'Corn', icon: '🌽', sell: 4 },
  tomato: { name: 'Tomatoes', icon: '🍅', sell: 5 },
  pumpkin: { name: 'Pumpkins', icon: '🎃', sell: 8 },
  rice: { name: 'Rice', icon: '🍚', sell: 4 },
  sunflower: { name: 'Sunflowers', icon: '🌻', sell: 7 },
  strawberry: { name: 'Strawberries', icon: '🍓', sell: 9 },
  grapes: { name: 'Grapes', icon: '🍇', sell: 10 },
  watermelon: { name: 'Watermelons', icon: '🍉', sell: 12 },
  egg: { name: 'Eggs', icon: '🥚', sell: 4 },
  duck_egg: { name: 'Duck Eggs', icon: '🪺', sell: 5 },
  milk: { name: 'Milk', icon: '🥛', sell: 8 },
  goat_milk: { name: 'Goat Milk', icon: '🍶', sell: 7 },
  wool: { name: 'Wool', icon: '🧶', sell: 10 },
  honey: { name: 'Honey', icon: '🍯', sell: 9 },
  truffle: { name: 'Truffles', icon: '🍄‍🟫', sell: 14 },
  apple_fruit: { name: 'Apples', icon: '🍎', sell: 5 },
  peach_fruit: { name: 'Peaches', icon: '🍑', sell: 6 },
  avocado_fruit: { name: 'Avocados', icon: '🥑', sell: 8 },
  // wild game — dropped when you hunt with the bow (see hunting in farm.js).
  // raw meat sells cheap on purpose: hunting is quick, so the value is in
  // PROCESSING it (smokehouse / kitchen), not dumping raw kills at the market.
  venison: { name: 'Venison', icon: '🥩', sell: 6 },
  game_meat: { name: 'Wild Game', icon: '🍗', sell: 4 },
  bear_meat: { name: 'Bear Meat', icon: '🐻', sell: 12 },
  trapped_fish: { name: 'Trapped Fish', icon: '🐟', sell: 7 }, // passive catch from a fish trap
  wood: { name: 'Wood', icon: '🪵', sell: 3 }, // chopped from timber pines with an axe
};

// good "kind" for seasonal market demand: winter pays a premium for food that
// stores (preserved/hearty), and less for fresh perishables — so putting up jam
// in autumn actually pays off.
export function goodCategory(id) {
  if (!id) return 'fresh';
  if (/jam|jelly|preserv|sauce|smoked|pickled|jerky|sausage|cheese|cured/.test(id)) return 'preserved';
  if (/soup|feast|stew|pie|bread|cake|toast|sandwich|pudding|porridge|cornbread/.test(id)) return 'hearty';
  return 'fresh'; // raw crops, eggs, milk, fruit, raw meat & fish
}

// ---- placement zones ------------------------------------------------------
// Where a thing may be dropped. Default is 'farm' (inside the fenced homestead).
//   water — must sit in open water (lake): traps, nets, crab pots, piers
//   tree  — must be next to a tree: sap/resin collectors that tap the trunks
//   open  — anywhere in the valley, inside the farm OR out in the wild: the big
//           landscape power pieces (turbines, solar arrays, power lines)
const PLACE_WATER = new Set([
  'fish_trap', 'aqua_fish_trap', 'aqua_net_station', 'aqua_crab_pots',
  'aqua_oyster_beds', 'aqua_seaweed_farm', 'aqua_fishing_pier',
]);
const PLACE_TREE = new Set(['for_sap_collector', 'for_resin_collector']);
const PLACE_OPEN = new Set(['enr_windturbine', 'enr_solar', 'enr_powerlines']);

export function placementZone(id) {
  if (PLACE_WATER.has(id)) return 'water';
  if (PLACE_TREE.has(id)) return 'tree';
  if (PLACE_OPEN.has(id)) return 'open';
  return 'farm';
}
// short hint shown on the item + while placing
export const PLACE_TIPS = {
  water: 'Must be placed in water 🌊',
  tree: 'Must be placed next to a tree 🌳',
  open: 'Can be placed anywhere in the valley 🏞️',
  farm: '',
};

// enough to make two or three meaningful first purchases (a producing animal
// plus a pen, say) so a brand-new player has agency before the first harvest
export const STARTER_COINS = 120;

// Tier math: an active early player earns ~25-40 coins/min (fishing + first
// crops + starter animals). Coins are now the ONLY path to a bigger plot, so
// these sit a little under the old prices, which had a free engagement route.
export const TIERS = [
  { id: 1, name: 'Small Plot', plots: 12, cols: 4, rows: 3 },
  { id: 2, name: 'Medium Plot', plots: 20, cols: 5, rows: 4, price: 450 },
  { id: 3, name: 'Large Plot', plots: 30, cols: 6, rows: 5, price: 1800 },
];

export function findItem(kind, id) {
  const list = kind === 'crop' ? CROPS
    : kind === 'tree' ? TREES
    : kind === 'animal' ? ANIMALS
    : kind === 'building' ? BUILDINGS
    : OBJECTS;
  return list.find((i) => i.id === id) || [...CROPS, ...TREES, ...ANIMALS, ...BUILDINGS, ...OBJECTS].find((i) => i.id === id);
}

export const ALL_UNLOCKABLES = () => [...CROPS, ...TREES, ...ANIMALS, ...BUILDINGS, ...OBJECTS];

