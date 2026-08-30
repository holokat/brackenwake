// The mission chain — a guided arc through every system in the game, from
// first seed to legend of the homestead. Pure data. Progress comes from a
// named stats counter (game.stats, bumped at action sites) or a statFn
// reading game state directly. Players see the first three unclaimed
// missions, so the order below IS the teaching/progression order.

import { FARMHOUSE_THRESHOLDS } from './buildings.js';

// Each chapter is authored as its own array so the phase boundaries stay
// correct no matter how many missions we add — MISSION_PHASES is derived
// from the block sizes below, never hand-numbered.
const CH1 = [
  // ---- Chapter 1 · First Sprouts: one mission per core verb, then reinforce ----
  { id: 'plant1', icon: '🌱', title: 'Plant your first crop', desc: 'Pick a crop from the Crops tab, then click a plot.', stat: 'planted', target: 1, reward: 15 },
  { id: 'water3', icon: '💧', title: 'Water crops 3 times', desc: 'The watering can is in the toolbar — dry soil shows a drop.', stat: 'watered', target: 3, reward: 20 },
  { id: 'harvest5', icon: '🧺', title: 'Harvest 5 crops', desc: 'Golden sparkles mean a crop is ready. ⇧click harvests all!', statFn: (g) => g.harvested, target: 5, reward: 25 },
  { id: 'sell1', icon: '🪙', title: 'Sell goods at the market', desc: 'Click the striped market stand.', stat: 'sold', target: 1, reward: 20 },
  { id: 'plant5', icon: '🌱', title: 'Plant 5 crops', desc: 'A full plot grows faster than an empty one.', stat: 'planted', target: 5, reward: 20 },
  { id: 'order1', icon: '📋', title: 'Deliver a market order', desc: 'Customers pin requests to the market board.', stat: 'orders', target: 1, reward: 30 },
  { id: 'water8', icon: '💧', title: 'Water crops 8 times', desc: 'Thirsty plants stall — keep the soil dark.', stat: 'watered', target: 8, reward: 22 },
  { id: 'build1', icon: '🏗️', title: 'Construct a building', desc: 'Anything from the Build tab — construction takes a moment.', stat: 'built', target: 1, reward: 25 },
  { id: 'animal1', icon: '🐔', title: 'Adopt an animal', desc: 'Animals roam the farm and produce goods.', stat: 'animals', target: 1, reward: 25 },
  { id: 'harvest10', icon: '🧺', title: 'Harvest 10 crops', statFn: (g) => g.harvested, target: 10, reward: 28 },
  { id: 'fish1', icon: '🎣', title: 'Catch a fish', desc: 'The rod tool casts from the dock.', stat: 'fish', target: 1, reward: 30 },
  { id: 'sell3', icon: '🪙', title: 'Sell at the market 3 times', stat: 'sold', target: 3, reward: 24 },
  { id: 'plant10', icon: '🌱', title: 'Plant 10 crops', stat: 'planted', target: 10, reward: 26 },
  { id: 'craft1', icon: '🔨', title: 'Craft a good', desc: 'Click the windmill or a processor to start a recipe.', stat: 'crafted', target: 1, reward: 35 },
  { id: 'coins100', icon: '💰', title: 'Hold 100 coins at once', statFn: (g) => g.coins, target: 100, reward: 30 },
  { id: 'water15', icon: '💧', title: 'Water crops 15 times', stat: 'watered', target: 15, reward: 28 },
  { id: 'post1', icon: '📝', title: 'Share news from your farm', desc: 'Sharing feeds the farm — every reaction grows crops.', stat: 'posts', target: 1, reward: 30 },
  { id: 'harvest15', icon: '🧺', title: 'Harvest 15 crops', statFn: (g) => g.harvested, target: 15, reward: 32 },
  { id: 'discover5', icon: '📔', title: 'Discover 5 collectibles', desc: 'Press B to open the Collection Book.', statFn: (g) => g.discovered.length, target: 5, reward: 25 },
  { id: 'fish3', icon: '🎣', title: 'Catch 3 fish', stat: 'fish', target: 3, reward: 34 },
  { id: 'junk1', icon: '🗑️', title: 'Haul up some junk', desc: 'Not everything that bites is a fish.', stat: 'junk', target: 1, reward: 18 },
  { id: 'species3', icon: '🐟', title: 'Catch 3 different species', desc: 'Variety is the spice of the dock.', stat: 'fishSpecies', target: 3, reward: 28 },
  { id: 'craft2', icon: '🔨', title: 'Craft 2 goods', stat: 'crafted', target: 2, reward: 32 },
  { id: 'discover10', icon: '📔', title: 'Discover 10 collectibles', statFn: (g) => g.discovered.length, target: 10, reward: 30 },
];

const CH2 = [
  // ---- Chapter 2 · A Working Homestead: rhythm + social loop ----
  { id: 'water40', icon: '💧', title: 'Water crops 40 times', desc: 'Steady care is what makes a field thrive.', stat: 'watered', target: 40, reward: 40 },
  { id: 'plant20', icon: '🌱', title: 'Plant 20 crops', stat: 'planted', target: 20, reward: 35 },
  { id: 'water25', icon: '💧', title: 'Water 25 times', stat: 'watered', target: 25, reward: 35 },
  { id: 'harvest25', icon: '🧺', title: 'Harvest 25 crops', statFn: (g) => g.harvested, target: 25, reward: 50 },
  { id: 'plant30', icon: '🌱', title: 'Plant 30 crops', desc: 'Keep every plot working.', stat: 'planted', target: 30, reward: 40 },
  { id: 'animals3', icon: '🐄', title: 'Keep 3 animals', desc: 'A pen with a closed gate keeps them together.', stat: 'animals', target: 3, reward: 40 },
  { id: 'gate1', icon: '🚪', title: 'Close a pen gate', desc: 'Click a pen and shut the gate on its residents.', stat: 'gates', target: 1, reward: 25 },
  { id: 'coins250', icon: '💰', title: 'Hold 250 coins at once', desc: 'Savings buy a bigger plot.', statFn: (g) => g.coins, target: 250, reward: 45 },
  { id: 'built5', icon: '🏗️', title: 'Construct 5 buildings', stat: 'built', target: 5, reward: 50 },
  { id: 'sold10', icon: '🪙', title: 'Sell at the market 10 times', stat: 'sold', target: 10, reward: 45 },
  { id: 'orders5', icon: '📋', title: 'Deliver 5 orders', stat: 'orders', target: 5, reward: 60 },
  { id: 'craft5', icon: '🔨', title: 'Craft 5 goods', stat: 'crafted', target: 5, reward: 50 },
  { id: 'merchant1', icon: '✨', title: 'Buy a merchant exclusive', desc: 'The market sells coin-only rarities.', stat: 'merchant', target: 1, reward: 40 },
  { id: 'fish10', icon: '🎣', title: 'Catch 10 fish', stat: 'fish', target: 10, reward: 60 },
  { id: 'posts3', icon: '📝', title: 'Share news 3 times', stat: 'posts', target: 3, reward: 45 },
  { id: 'water60', icon: '💧', title: 'Water crops 60 times', stat: 'watered', target: 60, reward: 55 },
  { id: 'streak3', icon: '🔥', title: 'Reach a 3-day streak', desc: 'The daily chest grows with every day you return.', statFn: (g) => g.streak, target: 3, reward: 50 },
  { id: 'placed10', icon: '🗺️', title: 'Have 10 things placed at once', statFn: (g) => g.placed.length, target: 10, reward: 45 },
  { id: 'animals5', icon: '🐄', title: 'Keep 5 animals', stat: 'animals', target: 5, reward: 55 },
  { id: 'discover15', icon: '📔', title: 'Discover 15 collectibles', desc: 'Press B to open the Collection Book.', statFn: (g) => g.discovered.length, target: 15, reward: 60 },
  { id: 'orders10', icon: '📋', title: 'Deliver 10 orders', stat: 'orders', target: 10, reward: 70 },
  { id: 'harvest50', icon: '🧺', title: 'Harvest 50 crops', statFn: (g) => g.harvested, target: 50, reward: 65 },
  { id: 'crafted8', icon: '🔨', title: 'Craft 8 goods', stat: 'crafted', target: 8, reward: 60 },
  { id: 'fish15', icon: '🎣', title: 'Catch 15 fish', stat: 'fish', target: 15, reward: 65 },
  { id: 'fish20', icon: '🎣', title: 'Catch 20 fish', stat: 'fish', target: 20, reward: 70 },
  { id: 'junk5', icon: '🗑️', title: 'Clear 5 bits of junk from the water', stat: 'junk', target: 5, reward: 40 },
  { id: 'species8', icon: '🐟', title: 'Catch 8 different species', stat: 'fishSpecies', target: 8, reward: 60 },
  { id: 'treasure1', icon: '🧰', title: 'Fish up a treasure chest', desc: 'Rare — but the water keeps secrets.', stat: 'treasure', target: 1, reward: 70 },
  { id: 'hunt1', icon: '🏹', title: 'Hunt your first deer', desc: 'Buy a bow, then aim at a deer — get closer for a surer shot.', stat: 'hunted', target: 1, reward: 55 },
  { id: 'sold15', icon: '🪙', title: 'Sell at the market 15 times', stat: 'sold', target: 15, reward: 55 },
  { id: 'built8', icon: '🏗️', title: 'Construct 8 buildings', stat: 'built', target: 8, reward: 65 },
  { id: 'house2', icon: '🪵', title: 'Grow your home into a Log Cabin', desc: 'A steady harvest grows the farmhouse.', statFn: (g) => g.harvested || 0, target: FARMHOUSE_THRESHOLDS[1], reward: 60 },
  { id: 'coins500', icon: '💰', title: 'Hold 500 coins at once', statFn: (g) => g.coins, target: 500, reward: 75 },
];

const CH3 = [
  // ---- Chapter 3 · A Thriving Enterprise: depth + mastery ----
  { id: 'plant60', icon: '🌱', title: 'Plant 60 crops', desc: 'A working farm never leaves soil bare.', stat: 'planted', target: 60, reward: 60 },
  { id: 'water100', icon: '💧', title: 'Water crops 100 times', stat: 'watered', target: 100, reward: 70 },
  { id: 'tier2', icon: '🏡', title: 'Expand to a Medium Plot', desc: 'Farm Book → Your Farm → upgrade.', statFn: (g) => g.tier, target: 2, reward: 100 },
  { id: 'craft10', icon: '🔨', title: 'Craft 10 goods', stat: 'crafted', target: 10, reward: 75 },
  { id: 'upgraded1', icon: '⬆️', title: 'Upgrade an infrastructure piece', desc: 'Many buildings upgrade in place — click one.', stat: 'upgraded', target: 1, reward: 60 },
  { id: 'animals6', icon: '🐄', title: 'Keep 6 animals', stat: 'animals', target: 6, reward: 70 },
  { id: 'placed20', icon: '🗺️', title: 'Have 20 things placed at once', statFn: (g) => g.placed.length, target: 20, reward: 75 },
  { id: 'sold25', icon: '🪙', title: 'Sell at the market 25 times', stat: 'sold', target: 25, reward: 80 },
  { id: 'harvest100', icon: '🧺', title: 'Harvest 100 crops', statFn: (g) => g.harvested, target: 100, reward: 120 },
  { id: 'golden1', icon: '✨', title: 'Reap a GOLDEN harvest', desc: 'One in a hundred harvests comes up ×5.', stat: 'golden', target: 1, reward: 100 },
  { id: 'petted10', icon: '🤲', title: 'Pet your animals 10 times', desc: 'A tended animal is a happy one.', stat: 'petted', target: 10, reward: 90 },
  { id: 'rare1', icon: '🐠', title: 'Catch a rare fish', desc: 'Patience at the dock pays off.', stat: 'rareFish', target: 1, reward: 80 },
  { id: 'fish25', icon: '🎣', title: 'Catch 25 fish', stat: 'fish', target: 25, reward: 90 },
  { id: 'fish35', icon: '🎣', title: 'Catch 35 fish', stat: 'fish', target: 35, reward: 100 },
  { id: 'species15', icon: '🐟', title: 'Catch 15 different species', stat: 'fishSpecies', target: 15, reward: 95 },
  { id: 'trophy1', icon: '🏆', title: 'Land a trophy catch', desc: 'A single fish worth 100+ coins.', stat: 'bigFish', target: 1, reward: 100 },
  { id: 'junk15', icon: '🗑️', title: 'Clear 15 bits of junk', stat: 'junk', target: 15, reward: 70 },
  { id: 'treasure3', icon: '🧰', title: 'Fish up 3 treasure chests', stat: 'treasure', target: 3, reward: 110 },
  { id: 'rare3', icon: '🐠', title: 'Catch 3 rare fish', stat: 'rareFish', target: 3, reward: 110 },
  { id: 'hunt10', icon: '🦌', title: 'Hunt 10 deer', desc: 'Venison keeps the smokehouse and kitchen busy.', stat: 'hunted', target: 10, reward: 120 },
  { id: 'orders15', icon: '📋', title: 'Deliver 15 orders', stat: 'orders', target: 15, reward: 100 },
  { id: 'posts5', icon: '📝', title: 'Share news 5 times', stat: 'posts', target: 5, reward: 80 },
  { id: 'chop5', icon: '🪓', title: 'Chop 5 timber pines', desc: 'Wood builds the finer furniture.', stat: 'chopped', target: 5, reward: 80 },
  { id: 'merchant3', icon: '✨', title: 'Buy 3 merchant exclusives', stat: 'merchant', target: 3, reward: 90 },
  { id: 'built12', icon: '🏗️', title: 'Construct 12 buildings', stat: 'built', target: 12, reward: 90 },
  { id: 'streak7', icon: '🔥', title: 'Reach a 7-day streak', statFn: (g) => g.streak, target: 7, reward: 100 },
  { id: 'water175', icon: '💧', title: 'Water crops 175 times', stat: 'watered', target: 175, reward: 110 },
  { id: 'discover25', icon: '📔', title: 'Discover 25 collectibles', statFn: (g) => g.discovered.length, target: 25, reward: 90 },
  { id: 'plant100', icon: '🌱', title: 'Plant 100 crops', stat: 'planted', target: 100, reward: 95 },
  { id: 'crafted15', icon: '🔨', title: 'Craft 15 goods', stat: 'crafted', target: 15, reward: 95 },
  { id: 'discover40', icon: '📔', title: 'Discover 40 collectibles', statFn: (g) => g.discovered.length, target: 40, reward: 120 },
  { id: 'house3', icon: '🏡', title: 'Grow your home into a Cottage', statFn: (g) => g.harvested || 0, target: FARMHOUSE_THRESHOLDS[2], reward: 100 },
  { id: 'coins2000', icon: '💰', title: 'Hold 2,000 coins at once', statFn: (g) => g.coins, target: 2000, reward: 150 },
];

const CH4 = [
  // ---- Chapter 4 · Legend of the Homestead: the long game ----
  { id: 'tier3', icon: '🏰', title: 'Expand to the Large Plot', statFn: (g) => g.tier, target: 3, reward: 200 },
  { id: 'crafted25', icon: '🔨', title: 'Craft 25 goods', stat: 'crafted', target: 25, reward: 120 },
  { id: 'crafted50', icon: '🔨', title: 'Craft 50 goods', stat: 'crafted', target: 50, reward: 150 },
  { id: 'fish50', icon: '🎣', title: 'Catch 50 fish', stat: 'fish', target: 50, reward: 150 },
  { id: 'rare5', icon: '🐠', title: 'Catch 5 rare fish', stat: 'rareFish', target: 5, reward: 160 },
  { id: 'fish75', icon: '🎣', title: 'Catch 75 fish', stat: 'fish', target: 75, reward: 170 },
  { id: 'species25', icon: '🐟', title: 'Catch 25 different species', desc: 'A living catalogue of the deep.', stat: 'fishSpecies', target: 25, reward: 180 },
  { id: 'junk30', icon: '🗑️', title: 'Clear 30 bits of junk', stat: 'junk', target: 30, reward: 120 },
  { id: 'treasure5', icon: '🧰', title: 'Fish up 5 treasure chests', stat: 'treasure', target: 5, reward: 170 },
  { id: 'trophy3', icon: '🏆', title: 'Land 3 trophy catches', stat: 'bigFish', target: 3, reward: 180 },
  { id: 'hunt25', icon: '🦌', title: 'Hunt 25 deer', desc: 'A true provider of the homestead.', stat: 'hunted', target: 25, reward: 220 },
  { id: 'collection1', icon: '🏅', title: 'Complete a full collection', desc: 'Any page of the Collection Book, corner to corner.', statFn: (g) => g.collectionBonuses.length, target: 1, reward: 150 },
  { id: 'golden3', icon: '✨', title: 'Reap 3 GOLDEN harvests', stat: 'golden', target: 3, reward: 180 },
  { id: 'posts10', icon: '📝', title: 'Share news 10 times', stat: 'posts', target: 10, reward: 120 },
  { id: 'water300', icon: '💧', title: 'Water crops 300 times', stat: 'watered', target: 300, reward: 160 },
  { id: 'chop15', icon: '🪓', title: 'Chop 15 timber pines', stat: 'chopped', target: 15, reward: 150 },
  { id: 'orders25', icon: '📋', title: 'Deliver 25 orders', stat: 'orders', target: 25, reward: 160 },
  { id: 'harvest250', icon: '🧺', title: 'Harvest 250 crops', statFn: (g) => g.harvested, target: 250, reward: 200 },
  { id: 'petted30', icon: '🤲', title: 'Pet your animals 30 times', stat: 'petted', target: 30, reward: 200 },
  { id: 'orders30', icon: '📋', title: 'Deliver 30 orders', stat: 'orders', target: 30, reward: 180 },
  { id: 'streak21', icon: '🔥', title: 'Reach a 21-day streak', statFn: (g) => g.streak, target: 21, reward: 250 },
  { id: 'crafted100', icon: '🔨', title: 'Craft 100 goods', stat: 'crafted', target: 100, reward: 250 },
  { id: 'sold75', icon: '🪙', title: 'Sell at the market 75 times', stat: 'sold', target: 75, reward: 170 },
  { id: 'orders40', icon: '📋', title: 'Deliver 40 orders', stat: 'orders', target: 40, reward: 200 },
  { id: 'placed40', icon: '🗺️', title: 'Have 40 things placed at once', statFn: (g) => g.placed.length, target: 40, reward: 150 },
  { id: 'collection3', icon: '🏅', title: 'Complete 3 full collections', statFn: (g) => g.collectionBonuses.length, target: 3, reward: 220 },
  { id: 'house4', icon: '🏠', title: 'Grow your home into a Farmhouse', statFn: (g) => g.harvested || 0, target: FARMHOUSE_THRESHOLDS[3], reward: 150 },
  { id: 'streak14', icon: '🔥', title: 'Reach a 14-day streak', statFn: (g) => g.streak, target: 14, reward: 200 },
  { id: 'harvest500', icon: '🧺', title: 'Harvest 500 crops', statFn: (g) => g.harvested, target: 500, reward: 250 },
  { id: 'discover70', icon: '📔', title: 'Discover 70 collectibles', statFn: (g) => g.discovered.length, target: 70, reward: 200 },
  { id: 'chop30', icon: '🪓', title: 'Chop 30 timber pines', stat: 'chopped', target: 30, reward: 250 },
  { id: 'coins5000', icon: '💰', title: 'Hold 5,000 coins at once', statFn: (g) => g.coins, target: 5000, reward: 250 },
  { id: 'streak30', icon: '🔥', title: 'Reach a 30-day streak', statFn: (g) => g.streak, target: 30, reward: 300 },
  // ---- Master Angler: a long fishing ladder for the dock-dwellers ----
  { id: 'fish100', icon: '🎣', title: 'Catch 100 fish', stat: 'fish', target: 100, reward: 200 },
  { id: 'rare10', icon: '🐠', title: 'Catch 10 rare fish', stat: 'rareFish', target: 10, reward: 220 },
  { id: 'junk50', icon: '🗑️', title: 'Clear 50 bits of junk from the water', stat: 'junk', target: 50, reward: 180 },
  { id: 'treasure10', icon: '🧰', title: 'Fish up 10 treasure chests', stat: 'treasure', target: 10, reward: 250 },
  { id: 'trophy5', icon: '🏆', title: 'Land 5 trophy catches', stat: 'bigFish', target: 5, reward: 240 },
  { id: 'fish150', icon: '🎣', title: 'Catch 150 fish', stat: 'fish', target: 150, reward: 240 },
  { id: 'species30', icon: '🐟', title: 'Catch 30 different species', stat: 'fishSpecies', target: 30, reward: 260 },
  { id: 'fish200', icon: '🎣', title: 'Catch 200 fish', stat: 'fish', target: 200, reward: 280 },
  { id: 'rare20', icon: '🐠', title: 'Catch 20 rare fish', stat: 'rareFish', target: 20, reward: 300 },
  { id: 'trophy10', icon: '🏆', title: 'Land 10 trophy catches', stat: 'bigFish', target: 10, reward: 320 },
  { id: 'fish300', icon: '🎣', title: 'Catch 300 fish', stat: 'fish', target: 300, reward: 320 },
  { id: 'fish500', icon: '🎣', title: 'Catch 500 fish', stat: 'fish', target: 500, reward: 400 },
  { id: 'anglerlegend', icon: '🎏', title: 'Catch 1,000 fish — Legend of the Lake', desc: 'You have fished for hours, and the water knows your name.', stat: 'fish', target: 1000, reward: 750 },
  { id: 'house5', icon: '🏰', title: 'Grow your home into the Grand Homestead', statFn: (g) => g.harvested || 0, target: FARMHOUSE_THRESHOLDS[4], reward: 300 },
];

export const MISSIONS = [...CH1, ...CH2, ...CH3, ...CH4];

// chapter metadata; index ranges are derived from the block sizes so they
// can never drift out of sync with the arrays above
const CHAPTER_META = [
  { title: 'Chapter 1 · First Sprouts', desc: 'Learn every corner of the homestead.', size: CH1.length },
  { title: 'Chapter 2 · A Working Homestead', desc: 'Find the daily rhythm — and your first fans.', size: CH2.length },
  { title: 'Chapter 3 · A Thriving Enterprise', desc: 'Depth, mastery, and serious coin.', size: CH3.length },
  { title: 'Chapter 4 · Legend of the Homestead', desc: 'The long game. Few finish it.', size: CH4.length },
];

let _cursor = 0;
export const MISSION_PHASES = CHAPTER_META.map((c) => {
  const from = _cursor;
  _cursor += c.size;
  return { title: c.title, desc: c.desc, from, to: _cursor };
});

export function missionProgress(mission, game) {
  if (!game) return 0;
  const raw = mission.statFn ? mission.statFn(game) : (game.stats?.[mission.stat] || 0);
  return Math.min(mission.target, raw);
}
