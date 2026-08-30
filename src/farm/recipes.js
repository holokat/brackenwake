// ============================================================================
// recipes.js — processing economy data for the farm game
// Pure data module: no imports, no three.js. Safe to load anywhere.
//
// VALUE CURVE
// -----------
// Every recipe's output sells for roughly 1.6x - 2.2x the total sell value of
// its inputs (most sit near 1.85x - 1.95x). Longer timeMs and more inputs push
// toward the top of that band; quick single-input recipes sit near the bottom.
//
// Assumed base sell prices used for the math below (raw goods already in game):
//   crops:  carrot 2, wheat 3, corn 4, tomato 4, rice 5, sunflower 5,
//           strawberry 6, pumpkin 7, grapes 8, watermelon 10
//   animal/tree: egg 4, duck_egg 5, milk 8, goat_milk 7, wool 10, honey 9,
//           truffle 14, apple_fruit 5, peach_fruit 6, avocado_fruit 8
//   'any_fish' resolves to any fish in inventory; valued at ~6 coins baseline.
// Intermediate products (flour, bread, cheese, jam, ...) are valued at their
// PRODUCTS sell price when used as inputs, so multi-stage chains compound:
// e.g. wheat(3x2=6) -> flour(11) -> bread(21) -> jam_sandwich(80).
//
// timeMs ranges 45000 (simple single-input) to 300000 (the capstone feast).
// ============================================================================

// --------------------------------------------------------------------------
// Processor buildings: coins to commission, timber and stone to raise.
// --------------------------------------------------------------------------
export const PROCESSORS = [
  { id: 'mill',             name: 'Grain Mill',       icon: '🌬️', desc: 'Grinds grains and seeds into flours and oil.',            price: 120, cost: { wood: 10, stone: 6 } },
  { id: 'bakery',           name: 'Bakery',           icon: '🥖', desc: 'Turns flour into warm breads, pies and cakes.',           price: 250, cost: { wood: 14, stone: 10 } },
  { id: 'creamery',         name: 'Creamery',         icon: '🧈', desc: 'Churns fresh milk into butter and cream.',                price: 220, cost: { wood: 12, stone: 5 } },
  { id: 'cheese_house',     name: 'Cheese House',     icon: '🧀', desc: 'Ages milk into fine wheels of cheese.',                   price: 350, cost: { wood: 16, stone: 10 } },
  { id: 'preserve_kitchen', name: 'Preserve Kitchen', icon: '🫙', desc: 'Simmers fruit and veg into jams, jellies and sauces.',    price: 200, cost: { wood: 10, stone: 4 } },
  { id: 'smokehouse',       name: 'Smokehouse',       icon: '🏭', desc: 'Smokes and cures goods for a rich, lasting flavor.',      price: 280, cost: { wood: 12, stone: 12 } },
  { id: 'juicery',          name: 'Juice Press',      icon: '🧃', desc: 'Presses fruit and veg into refreshing bottled juice.',    price: 180, cost: { wood: 8 } },
  { id: 'farm_kitchen',     name: 'Farm Kitchen',     icon: '🍲', desc: 'Cooks grand multi-ingredient meals worth bragging about.', price: 400, cost: { wood: 20, stone: 14 } },
];

// --------------------------------------------------------------------------
// Recipes. Input value math is noted per recipe as: inputs => output (ratio).
// --------------------------------------------------------------------------
export const RECIPES = [
  // ---- MILL: first rung of every grain chain ------------------------------
  { id: 'flour',           name: 'Flour',            icon: '🌾', processor: 'mill', inputs: { wheat: 2 },                    output: { id: 'flour', count: 1 },           timeMs: 45000 },  // 6 => 11 (1.83x)
  { id: 'cornmeal',        name: 'Cornmeal',         icon: '🌽', processor: 'mill', inputs: { corn: 2 },                     output: { id: 'cornmeal', count: 1 },        timeMs: 50000 },  // 8 => 15 (1.88x)
  { id: 'rice_flour',      name: 'Rice Flour',       icon: '🍚', processor: 'mill', inputs: { rice: 2 },                     output: { id: 'rice_flour', count: 1 },      timeMs: 55000 },  // 10 => 19 (1.90x)
  { id: 'sunflower_oil',   name: 'Sunflower Oil',    icon: '🌻', processor: 'mill', inputs: { sunflower: 3 },                output: { id: 'sunflower_oil', count: 1 },   timeMs: 70000 },  // 15 => 28 (1.87x)

  // ---- BAKERY: flour chains, second rung ---------------------------------
  { id: 'bread',           name: 'Bread',            icon: '🍞', processor: 'bakery', inputs: { flour: 1 },                             output: { id: 'bread', count: 1 },         timeMs: 60000 },  // 11 => 21 (1.91x)
  { id: 'jam_sandwich',    name: 'Jam Sandwich',     icon: '🥪', processor: 'bakery', inputs: { bread: 1, strawberry_jam: 1 },          output: { id: 'jam_sandwich', count: 1 }, timeMs: 90000 },  // 21+22=43 => 80 (1.86x)
  { id: 'cake',            name: 'Cake',             icon: '🍰', processor: 'bakery', inputs: { flour: 1, egg: 1, milk: 1 },            output: { id: 'cake', count: 1 },          timeMs: 120000 }, // 11+4+8=23 => 44 (1.91x)
  { id: 'pumpkin_pie',     name: 'Pumpkin Pie',      icon: '🥧', processor: 'bakery', inputs: { flour: 1, pumpkin: 1 },                 output: { id: 'pumpkin_pie', count: 1 },   timeMs: 100000 }, // 11+7=18 => 34 (1.89x)
  { id: 'apple_pie',       name: 'Apple Pie',        icon: '🍎', processor: 'bakery', inputs: { flour: 1, apple_fruit: 2 },             output: { id: 'apple_pie', count: 1 },     timeMs: 100000 }, // 11+10=21 => 40 (1.90x)
  { id: 'cornbread',       name: 'Cornbread',        icon: '🫓', processor: 'bakery', inputs: { cornmeal: 1 },                          output: { id: 'cornbread', count: 1 },     timeMs: 75000 },  // 15 => 28 (1.87x)
  { id: 'avocado_toast',   name: 'Avocado Toast',    icon: '🥑', processor: 'bakery', inputs: { bread: 1, avocado_fruit: 1 },           output: { id: 'avocado_toast', count: 1 }, timeMs: 80000 },  // 21+8=29 => 55 (1.90x)

  // ---- CREAMERY: dairy basics --------------------------------------------
  { id: 'butter',          name: 'Butter',           icon: '🧈', processor: 'creamery', inputs: { milk: 1 },                output: { id: 'butter', count: 1 },       timeMs: 50000 },  // 8 => 15 (1.88x)
  { id: 'cream',           name: 'Cream',            icon: '🥛', processor: 'creamery', inputs: { milk: 1 },                output: { id: 'cream', count: 1 },        timeMs: 45000 },  // 8 => 14 (1.75x, fastest dairy)
  { id: 'goat_butter',     name: 'Goat Butter',      icon: '🐐', processor: 'creamery', inputs: { goat_milk: 1 },           output: { id: 'goat_butter', count: 1 },  timeMs: 50000 },  // 7 => 13 (1.86x)
  { id: 'honey_butter',    name: 'Honey Butter',     icon: '🍯', processor: 'creamery', inputs: { milk: 1, honey: 1 },      output: { id: 'honey_butter', count: 1 }, timeMs: 65000 },  // 8+9=17 => 32 (1.88x)

  // ---- CHEESE HOUSE: slow, high-value dairy ------------------------------
  { id: 'cheese',          name: 'Cheese',           icon: '🧀', processor: 'cheese_house', inputs: { milk: 2 },              output: { id: 'cheese', count: 1 },         timeMs: 90000 },  // 16 => 30 (1.88x)
  { id: 'goat_cheese',     name: 'Goat Cheese',      icon: '🧀', processor: 'cheese_house', inputs: { goat_milk: 2 },         output: { id: 'goat_cheese', count: 1 },    timeMs: 90000 },  // 14 => 27 (1.93x)
  { id: 'truffle_cheese',  name: 'Truffle Cheese',   icon: '🍄', processor: 'cheese_house', inputs: { milk: 2, truffle: 2 },  output: { id: 'truffle_cheese', count: 1 }, timeMs: 240000 }, // 16+28=44 => 88 (2.00x, prestige)

  // ---- PRESERVE KITCHEN: jams, jellies, sauces ---------------------------
  { id: 'strawberry_jam',  name: 'Strawberry Jam',   icon: '🍓', processor: 'preserve_kitchen', inputs: { strawberry: 2 },            output: { id: 'strawberry_jam', count: 1 },  timeMs: 60000 },  // 12 => 22 (1.83x)
  { id: 'grape_jelly',     name: 'Grape Jelly',      icon: '🍇', processor: 'preserve_kitchen', inputs: { grapes: 2 },                output: { id: 'grape_jelly', count: 1 },     timeMs: 65000 },  // 16 => 30 (1.88x)
  { id: 'peach_preserves', name: 'Peach Preserves',  icon: '🍑', processor: 'preserve_kitchen', inputs: { peach_fruit: 2 },           output: { id: 'peach_preserves', count: 1 }, timeMs: 65000 },  // 12 => 23 (1.92x)
  { id: 'tomato_sauce',    name: 'Tomato Sauce',     icon: '🍅', processor: 'preserve_kitchen', inputs: { tomato: 3 },                output: { id: 'tomato_sauce', count: 1 },    timeMs: 60000 },  // 12 => 22 (1.83x)
  { id: 'honey_apples',    name: 'Honey Apples',     icon: '🍯', processor: 'preserve_kitchen', inputs: { honey: 1, apple_fruit: 2 }, output: { id: 'honey_apples', count: 1 },    timeMs: 80000 },  // 9+10=19 => 36 (1.89x)

  // ---- SMOKEHOUSE: curing and smoking ------------------------------------
  { id: 'smoked_fish',       name: 'Smoked Fish',       icon: '🐟', processor: 'smokehouse', inputs: { any_fish: 1 },           output: { id: 'smoked_fish', count: 1 },       timeMs: 70000 },  // ~6 => 12 (2.00x)
  { id: 'smoked_cheese',     name: 'Smoked Cheese',     icon: '🧀', processor: 'smokehouse', inputs: { cheese: 1 },             output: { id: 'smoked_cheese', count: 1 },     timeMs: 120000 }, // 30 => 55 (1.83x)
  { id: 'pickled_egg',       name: 'Pickled Egg',       icon: '🥚', processor: 'smokehouse', inputs: { egg: 2 },                output: { id: 'pickled_egg', count: 1 },       timeMs: 55000 },  // 8 => 15 (1.88x)
  { id: 'smoked_duck_egg',   name: 'Smoked Duck Egg',   icon: '🦆', processor: 'smokehouse', inputs: { duck_egg: 2 },           output: { id: 'smoked_duck_egg', count: 1 },   timeMs: 60000 },  // 10 => 19 (1.90x)
  { id: 'honey_smoked_fish', name: 'Honey-Smoked Fish', icon: '🎣', processor: 'smokehouse', inputs: { any_fish: 1, honey: 1 }, output: { id: 'honey_smoked_fish', count: 1 }, timeMs: 95000 },  // ~6+9=15 => 29 (1.93x)
  // ---- SMOKEHOUSE: game meats (venison comes from hunting deer) -----------
  { id: 'smoked_venison',    name: 'Smoked Venison',    icon: '🍖', processor: 'smokehouse', inputs: { venison: 2 },            output: { id: 'smoked_venison', count: 1 },    timeMs: 100000 }, // 32 => 60 (1.88x)
  { id: 'venison_sausage',   name: 'Venison Sausage',   icon: '🌭', processor: 'smokehouse', inputs: { venison: 2 },            output: { id: 'venison_sausage', count: 1 },   timeMs: 95000 },  // 32 => 60 (1.88x)
  { id: 'venison_jerky',     name: 'Venison Jerky',     icon: '🥓', processor: 'smokehouse', inputs: { venison: 3 },            output: { id: 'venison_jerky', count: 1 },     timeMs: 145000 }, // 48 => 92 (1.92x)

  // ---- JUICERY: quick, cheap-to-run conversions --------------------------
  { id: 'apple_juice',     name: 'Apple Juice',      icon: '🧃', processor: 'juicery', inputs: { apple_fruit: 2 },  output: { id: 'apple_juice', count: 1 },  timeMs: 55000 },  // 10 => 19 (1.90x)
  { id: 'grape_juice',     name: 'Grape Juice',      icon: '🍷', processor: 'juicery', inputs: { grapes: 2 },       output: { id: 'grape_juice', count: 1 },  timeMs: 60000 },  // 16 => 30 (1.88x)
  { id: 'melon_juice',     name: 'Melon Juice',      icon: '🍉', processor: 'juicery', inputs: { watermelon: 1 },   output: { id: 'melon_juice', count: 1 },  timeMs: 55000 },  // 10 => 19 (1.90x)
  { id: 'carrot_juice',    name: 'Carrot Juice',     icon: '🥕', processor: 'juicery', inputs: { carrot: 3 },       output: { id: 'carrot_juice', count: 1 }, timeMs: 45000 },  // 6 => 11 (1.83x)
  { id: 'tomato_juice',    name: 'Tomato Juice',     icon: '🍅', processor: 'juicery', inputs: { tomato: 3 },       output: { id: 'tomato_juice', count: 1 }, timeMs: 50000 },  // 12 => 22 (1.83x)
  { id: 'peach_nectar',    name: 'Peach Nectar',     icon: '🍑', processor: 'juicery', inputs: { peach_fruit: 2 },  output: { id: 'peach_nectar', count: 1 }, timeMs: 55000 },  // 12 => 23 (1.92x)

  // ---- FARM KITCHEN: grand multi-input meals -----------------------------
  { id: 'veggie_stew',     name: 'Veggie Stew',      icon: '🥘', processor: 'farm_kitchen', inputs: { tomato: 2, carrot: 2, corn: 2 },                          output: { id: 'veggie_stew', count: 1 },    timeMs: 150000 }, // 8+4+8=20 => 38 (1.90x)
  { id: 'fish_rice_bowl',  name: 'Fish Rice Bowl',   icon: '🍣', processor: 'farm_kitchen', inputs: { rice: 2, any_fish: 1 },                                   output: { id: 'fish_rice_bowl', count: 1 }, timeMs: 140000 }, // 10+~6=16 => 30 (1.88x)
  { id: 'farm_pizza',      name: 'Farm Pizza',       icon: '🍕', processor: 'farm_kitchen', inputs: { bread: 1, cheese: 1, tomato_sauce: 1 },                   output: { id: 'farm_pizza', count: 1 },     timeMs: 240000 }, // 21+30+22=73 => 118 (1.62x — deep chain, bulk payout)
  { id: 'pumpkin_soup',    name: 'Pumpkin Soup',     icon: '🎃', processor: 'farm_kitchen', inputs: { pumpkin: 1, cream: 1 },                                   output: { id: 'pumpkin_soup', count: 1 },   timeMs: 130000 }, // 7+14=21 => 40 (1.90x)
  { id: 'big_breakfast',   name: 'Big Breakfast',    icon: '🍳', processor: 'farm_kitchen', inputs: { egg: 2, bread: 1, butter: 1 },                            output: { id: 'big_breakfast', count: 1 },  timeMs: 180000 }, // 8+21+15=44 => 84 (1.91x)
  { id: 'venison_pie',     name: 'Venison Pie',      icon: '🥧', processor: 'farm_kitchen', inputs: { venison: 1, flour: 1 },                                   output: { id: 'venison_pie', count: 1 },    timeMs: 150000 }, // 16+11=27 => 51 (1.89x)
  { id: 'venison_stew',    name: 'Venison Stew',     icon: '🍲', processor: 'farm_kitchen', inputs: { venison: 2, carrot: 2, tomato: 1 },                       output: { id: 'venison_stew', count: 1 },   timeMs: 170000 }, // 32+4+4=40 => 76 (1.90x)
  // Capstone bragging dish: touches field, coop, barn, berry patch and hive.
  { id: 'harvest_feast',   name: 'Harvest Feast',    icon: '🍽️', processor: 'farm_kitchen', inputs: { flour: 2, egg: 2, milk: 1, strawberry: 2, honey: 1 },    output: { id: 'harvest_feast', count: 1 },  timeMs: 300000 }, // 22+8+8+12+9=59 => 120 (2.03x, prestige)
];

// --------------------------------------------------------------------------
// New product definitions (everything RECIPES can output).
// Sell prices follow the 1.6x-2.2x rule against the input values noted above.
// --------------------------------------------------------------------------
export const PRODUCTS = {
  // mill
  flour:             { name: 'Flour',             icon: '🌾', sell: 11 },
  cornmeal:          { name: 'Cornmeal',          icon: '🌽', sell: 15 },
  rice_flour:        { name: 'Rice Flour',        icon: '🍚', sell: 19 },
  sunflower_oil:     { name: 'Sunflower Oil',     icon: '🌻', sell: 28 },
  // bakery
  bread:             { name: 'Bread',             icon: '🍞', sell: 21 },
  jam_sandwich:      { name: 'Jam Sandwich',      icon: '🥪', sell: 80 },
  cake:              { name: 'Cake',              icon: '🍰', sell: 44 },
  pumpkin_pie:       { name: 'Pumpkin Pie',       icon: '🥧', sell: 34 },
  apple_pie:         { name: 'Apple Pie',         icon: '🍎', sell: 40 },
  cornbread:         { name: 'Cornbread',         icon: '🫓', sell: 28 },
  avocado_toast:     { name: 'Avocado Toast',     icon: '🥑', sell: 55 },
  // creamery
  butter:            { name: 'Butter',            icon: '🧈', sell: 15 },
  cream:             { name: 'Cream',             icon: '🥛', sell: 14 },
  goat_butter:       { name: 'Goat Butter',       icon: '🐐', sell: 13 },
  honey_butter:      { name: 'Honey Butter',      icon: '🍯', sell: 32 },
  // cheese house
  cheese:            { name: 'Cheese',            icon: '🧀', sell: 30 },
  goat_cheese:       { name: 'Goat Cheese',       icon: '🧀', sell: 27 },
  truffle_cheese:    { name: 'Truffle Cheese',    icon: '🍄', sell: 88 },  // prestige
  // preserve kitchen
  strawberry_jam:    { name: 'Strawberry Jam',    icon: '🍓', sell: 22 },
  grape_jelly:       { name: 'Grape Jelly',       icon: '🍇', sell: 30 },
  peach_preserves:   { name: 'Peach Preserves',   icon: '🍑', sell: 23 },
  tomato_sauce:      { name: 'Tomato Sauce',      icon: '🍅', sell: 22 },
  honey_apples:      { name: 'Honey Apples',      icon: '🍯', sell: 36 },
  // smokehouse
  smoked_fish:       { name: 'Smoked Fish',       icon: '🐟', sell: 12 },
  smoked_cheese:     { name: 'Smoked Cheese',     icon: '🧀', sell: 55 },
  pickled_egg:       { name: 'Pickled Egg',       icon: '🥚', sell: 15 },
  smoked_duck_egg:   { name: 'Smoked Duck Egg',   icon: '🦆', sell: 19 },
  honey_smoked_fish: { name: 'Honey-Smoked Fish', icon: '🎣', sell: 29 },
  smoked_venison:    { name: 'Smoked Venison',    icon: '🍖', sell: 24 },
  venison_sausage:   { name: 'Venison Sausage',   icon: '🌭', sell: 24 },
  venison_jerky:     { name: 'Venison Jerky',     icon: '🥓', sell: 34 },
  // juicery
  apple_juice:       { name: 'Apple Juice',       icon: '🧃', sell: 19 },
  grape_juice:       { name: 'Grape Juice',       icon: '🍷', sell: 30 },
  melon_juice:       { name: 'Melon Juice',       icon: '🍉', sell: 19 },
  carrot_juice:      { name: 'Carrot Juice',      icon: '🥕', sell: 11 },
  tomato_juice:      { name: 'Tomato Juice',      icon: '🍅', sell: 22 },
  peach_nectar:      { name: 'Peach Nectar',      icon: '🍑', sell: 23 },
  // farm kitchen
  veggie_stew:       { name: 'Veggie Stew',       icon: '🥘', sell: 38 },
  fish_rice_bowl:    { name: 'Fish Rice Bowl',    icon: '🍣', sell: 30 },
  farm_pizza:        { name: 'Farm Pizza',        icon: '🍕', sell: 118 },
  pumpkin_soup:      { name: 'Pumpkin Soup',      icon: '🎃', sell: 40 },
  big_breakfast:     { name: 'Big Breakfast',     icon: '🍳', sell: 84 },
  venison_pie:       { name: 'Venison Pie',       icon: '🥧', sell: 32 },
  venison_stew:      { name: 'Venison Stew',      icon: '🍲', sell: 38 },
  harvest_feast:     { name: 'Harvest Feast',     icon: '🍽️', sell: 120 }, // prestige capstone
};

// --------------------------------------------------------------------------
// Market-exclusive decorations: coins only, no engagement requirement.
// --------------------------------------------------------------------------
export const MERCHANT_ITEMS = [
  { id: 'gnome',    name: 'Garden Gnome',    icon: '🧙', price: 150 },
  { id: 'fountain', name: 'Stone Fountain',  icon: '⛲', price: 300 },
  { id: 'flamingo', name: 'Lawn Flamingo',   icon: '🦩', price: 120 },
  { id: 'topiary',  name: 'Topiary Peacock', icon: '🦚', price: 220 },
  { id: 'gazebo',   name: 'Garden Gazebo',   icon: '⛩️', price: 500 },
  { id: 'flagpole', name: 'Flag Pole',       icon: '🚩', price: 100 },
];

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

/** All recipes a given processor building can run. */
export function recipesFor(processorId) {
  return RECIPES.filter((r) => r.processor === processorId);
}

/** Product definition for a processed-good id, or null for unknown ids. */
export function productInfo(id) {
  return Object.prototype.hasOwnProperty.call(PRODUCTS, id) ? PRODUCTS[id] : null;
}
