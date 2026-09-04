// infrastructure_a.js — the FUNCTIONAL catalog. 52 items, one per rung.
// Pure data module — no imports, no logic.
//
// Curated down from 290 (see docs/asset-cut-list.txt). The rule that shapes this
// file: ONE effect lives in ONE category, as a clean ladder with no duplicate and
// no dominated rungs. Anything that used to duplicate an effect is now decor
// (infrastructure_b.js) or retired (RETIRED in infrastructure.js).
//
// Schema: { id, name, icon, cat, tier, price, cost, needs, upgradesTo, effect, size, biome, desc }
//   price — coins.  cost — { wood, stone } materials, spent on every placement.
//
// Effect ownership:
//   sto   storage / material_storage
//   liv   production_mult (all species)
//   fld   yield_bonus
//   soil  growth_mult
//   wat   auto_water
//   wrk   craft_speed (per recipe family), harvest_bonus, production_mult (one species group)
//   com   sell_bonus + auto_sell
//   mac   auto_collect
//   enr   craft_speed (farm-wide) + power supply
//   cap   prestige

export const INFRA_A = [

  // ============================================================
  // STORAGE (sto_) — 7. How much you can hold.
  // A deliberate premium per unit as the rungs climb: a Warehouse costs more
  // per stored good than a shed, and is worth it because ground space is the
  // real constraint, not coins.
  // Wood and stone do NOT share the produce pool — they have their own caps,
  // so a morning of chopping can never crowd out the harvest.
  // ============================================================
  {
    id: 'sto_shed', name: 'Storage Shed', icon: '🛖', cat: 'sto', tier: 1, price: 60,
    cost: { wood: 12, stone: 2 }, needs: [], upgradesTo: 'sto_granary',
    effect: { type: 'storage', cap: 60 },
    size: 's', biome: null,
    desc: 'A braced timber shed — the first real room for a harvest.',
  },
  {
    id: 'sto_lumberyard', name: 'Lumber Yard', icon: '🪵', cat: 'sto', tier: 2, price: 160,
    cost: { wood: 25, stone: 8 }, needs: [], upgradesTo: null,
    effect: { type: 'material_storage', good: 'wood', cap: 250 },
    size: 'm', biome: null,
    desc: 'Racked boards and logs. Holds timber only, and holds a lot of it.',
  },
  {
    id: 'sto_stoneyard', name: 'Stone Yard', icon: '🪨', cat: 'sto', tier: 2, price: 160,
    cost: { wood: 14, stone: 25 }, needs: [], upgradesTo: null,
    effect: { type: 'material_storage', good: 'stone', cap: 250 },
    size: 'm', biome: null,
    desc: 'Cut blocks stacked under a shelter. Holds stone only.',
  },
  {
    id: 'sto_granary', name: 'Granary', icon: '🏚️', cat: 'sto', tier: 2, price: 220,
    cost: { wood: 30, stone: 10 }, needs: ['sto_shed'], upgradesTo: 'sto_icehouse',
    effect: { type: 'storage', cap: 150 },
    size: 'm', biome: null,
    desc: 'Raised on staddle stones so nothing gets in but the grain.',
  },
  {
    id: 'sto_icehouse', name: 'Ice House', icon: '❄️', cat: 'sto', tier: 3, price: 520,
    cost: { wood: 30, stone: 55 }, needs: ['sto_granary'], upgradesTo: 'sto_warehouse',
    effect: { type: 'storage', cap: 300 },
    size: 'm', biome: null,
    desc: 'A stone vault dug into the earth — cool, dark and deep.',
  },
  {
    id: 'sto_warehouse', name: 'Warehouse', icon: '🏗️', cat: 'sto', tier: 4, price: 1400,
    cost: { wood: 90, stone: 40 }, needs: ['sto_icehouse'], upgradesTo: 'sto_refwarehouse',
    effect: { type: 'storage', cap: 800 },
    size: 'l', biome: null,
    desc: 'Sliding doors, a loading dock, and room for a season at a time.',
  },
  {
    id: 'sto_refwarehouse', name: 'Refrigerated Warehouse', icon: '🥶', cat: 'sto', tier: 5, price: 3600,
    cost: { wood: 130, stone: 110 }, needs: ['sto_warehouse'], upgradesTo: null,
    effect: { type: 'storage', cap: 2000 },
    size: 'xl', biome: null,
    desc: 'Cooling units on the roof. Nothing you grow will ever want for space again.',
  },

  // ============================================================
  // LIVESTOCK (liv_) — 5. Animals nearby produce faster.
  // production_mult takes the BEST, never the sum — so this is a ladder you
  // climb, not a stack you pile up. Each rung upgrades into the next.
  // ============================================================
  {
    id: 'liv_feedtrough', name: 'Feeding Trough', icon: '🍽️', cat: 'liv', tier: 1, price: 45,
    cost: { wood: 8 }, needs: [], upgradesTo: 'liv_hayrack',
    effect: { type: 'production_mult', species: 'all', mult: 1.5 },
    size: 'xs', biome: null,
    desc: 'A fed animal is a productive animal. Every species works harder.',
  },
  {
    id: 'liv_hayrack', name: 'Hay Rack', icon: '🎋', cat: 'liv', tier: 1, price: 90,
    cost: { wood: 14 }, needs: ['liv_feedtrough'], upgradesTo: 'liv_sheepfold',
    effect: { type: 'production_mult', species: 'all', mult: 1.6 },
    size: 'xs', biome: null,
    desc: 'Hay off the ground stays clean, and clean feed goes further.',
  },
  {
    id: 'liv_sheepfold', name: 'Sheepfold', icon: '🐑', cat: 'liv', tier: 2, price: 240,
    cost: { wood: 28, stone: 12 }, needs: ['liv_hayrack'], upgradesTo: 'liv_cowbarn',
    effect: { type: 'production_mult', species: 'all', mult: 1.7 },
    size: 's', biome: null,
    desc: 'Dry-stone walls and a gate. Sheltered stock produces steadily.',
  },
  {
    id: 'liv_cowbarn', name: 'Cow Barn', icon: '🐮', cat: 'liv', tier: 3, price: 620,
    cost: { wood: 55, stone: 20 }, needs: ['liv_sheepfold'], upgradesTo: 'liv_breedingbarn',
    effect: { type: 'production_mult', species: 'all', mult: 1.9 },
    size: 'm', biome: null,
    desc: 'Proper stalls and a hay loft — the real working heart of a herd.',
  },
  {
    id: 'liv_breedingbarn', name: 'Breeding Barn', icon: '💞', cat: 'liv', tier: 4, price: 1500,
    cost: { wood: 100, stone: 45 }, needs: ['liv_cowbarn'], upgradesTo: null,
    effect: { type: 'production_mult', species: 'all', mult: 2.2 },
    size: 'l', biome: null,
    desc: 'Bloodlines, paddocks and record-keeping. The best output on the farm.',
  },

  // ============================================================
  // FIELDS (fld_) — 4. Extra harvest units from crops in range.
  // Yield zones DO stack, so overlapping them is a real strategy — and the
  // radii are kept tight so blanket coverage costs real money.
  // ============================================================
  {
    id: 'fld_raisedbed', name: 'Raised Bed', icon: '🪴', cat: 'fld', tier: 1, price: 40,
    cost: { wood: 8 }, needs: [], upgradesTo: 'fld_field',
    effect: { type: 'yield_bonus', radius: 8, bonus: 1 },
    size: 'xs', biome: null,
    desc: 'Deep, warm soil in a timber frame. Plots beside it give one more.',
  },
  {
    id: 'fld_field', name: 'Field', icon: '🌾', cat: 'fld', tier: 2, price: 180,
    cost: { wood: 20, stone: 6 }, needs: ['fld_raisedbed'], upgradesTo: 'fld_terrace',
    effect: { type: 'yield_bonus', radius: 14, bonus: 1 },
    size: 'm', biome: null,
    desc: 'Fenced, furrowed and worked properly — the same bonus, far wider.',
  },
  {
    id: 'fld_terrace', name: 'Terrace', icon: '⛰️', cat: 'fld', tier: 3, price: 500,
    cost: { wood: 30, stone: 40 }, needs: ['fld_field'], upgradesTo: 'fld_vertical',
    effect: { type: 'yield_bonus', radius: 16, bonus: 2 },
    size: 'm', biome: null,
    desc: 'Stone-walled steps that hold soil and water on a slope.',
  },
  {
    id: 'fld_vertical', name: 'Vertical Farm', icon: '🏢', cat: 'fld', tier: 5, price: 2000,
    cost: { wood: 90, stone: 70 }, needs: ['fld_terrace'], upgradesTo: null,
    effect: { type: 'yield_bonus', radius: 22, bonus: 3 },
    size: 'l', biome: null,
    desc: 'Stacked growing trays behind glass. Three extra units, farm-wide.',
  },

  // ============================================================
  // SOIL (soil_) — 4. Crops grow faster everywhere.
  // growth_mult MULTIPLIES (capped ×3 overall), so the rungs compound if you
  // keep the lower ones — but each upgrades into the next, and upgrading is
  // cheaper than owning both.
  // ============================================================
  {
    id: 'soil_compost_pile', name: 'Compost Pile', icon: '🍂', cat: 'soil', tier: 1, price: 30,
    cost: { wood: 5 }, needs: [], upgradesTo: 'soil_compost_shed',
    effect: { type: 'growth_mult', mult: 1.1 },
    size: 'xs', biome: null,
    desc: 'A steaming heap of scraps. Everything on the farm grows a little sooner.',
  },
  {
    id: 'soil_compost_shed', name: 'Compost Shed', icon: '🛖', cat: 'soil', tier: 2, price: 160,
    cost: { wood: 22, stone: 4 }, needs: ['soil_compost_pile'], upgradesTo: 'soil_laboratory',
    effect: { type: 'growth_mult', mult: 1.2 },
    size: 'm', biome: null,
    desc: 'Slatted bays turned in rotation — compost at a scale you can feel.',
  },
  {
    id: 'soil_laboratory', name: 'Soil Laboratory', icon: '🔬', cat: 'soil', tier: 3, price: 600,
    cost: { wood: 30, stone: 35 }, needs: ['soil_compost_shed'], upgradesTo: 'soil_agri_research_station',
    effect: { type: 'growth_mult', mult: 1.35 },
    size: 'm', biome: null,
    desc: 'Sample racks and a bench. You stop guessing what the ground needs.',
  },
  {
    id: 'soil_agri_research_station', name: 'Research Station', icon: '🏛️', cat: 'soil', tier: 5, price: 2200,
    cost: { wood: 80, stone: 90 }, needs: ['soil_laboratory'], upgradesTo: null,
    effect: { type: 'growth_mult', mult: 1.5 },
    size: 'l', biome: null,
    desc: 'Glass frontage and instrument masts. Growth pushed to its practical limit.',
  },

  // ============================================================
  // WATER (wat_) — 3. Waters plots for you, on a timer.
  // The old "free watering" buildings are gone entirely: once something waters
  // for you, removing the cooldown is worth nothing. Nine buildings existed to
  // deliver a benefit another building made irrelevant.
  // ============================================================
  {
    id: 'wat_sprinkler', name: 'Sprinkler', icon: '💦', cat: 'wat', tier: 1, price: 70,
    cost: { wood: 6, stone: 4 }, needs: [], upgradesTo: 'wat_canal',
    effect: { type: 'auto_water', radius: 10, plots: 2, everyMs: 20000 },
    size: 'xs', biome: null,
    desc: 'Waters the two nearest growing plots every 20 seconds.',
  },
  {
    id: 'wat_canal', name: 'Irrigation Canal', icon: '🌊', cat: 'wat', tier: 3, price: 420,
    cost: { wood: 25, stone: 45 }, needs: ['wat_sprinkler'], upgradesTo: 'wat_watertower',
    effect: { type: 'auto_water', radius: 18, plots: 4, everyMs: 18000 },
    size: 'm', biome: null,
    desc: 'A stone-lined channel with a sluice gate. Four plots, wider reach.',
  },
  {
    id: 'wat_watertower', name: 'Water Tower', icon: '🗼', cat: 'wat', tier: 4, price: 1200,
    cost: { wood: 45, stone: 60 }, needs: ['wat_canal'], upgradesTo: null,
    effect: { type: 'auto_water', radius: 60, plots: 12, everyMs: 15000 },
    size: 'l', biome: null,
    desc: 'Pressurised mains. Twelve plots anywhere on the farm, every 15 seconds.',
  },

  // ============================================================
  // WORKSHOPS (wrk_ / prc_) — 10.
  //
  // These are NOT ten copies of "craft faster". Five speed ONE RECIPE FAMILY
  // each (a `family` list of processor ids), which is what makes owning several
  // a real decision — a cheesemaker wants a different workshop than a brewer.
  // Between them the five cover all eight processors.
  //
  // The other four are not food buildings at all, and doing food-crafting maths
  // in them never made sense. They own the materials side instead:
  // the Carpenter and Forge improve what you get from chopping and mining, and
  // the Textile Workshop and Tannery specialise animal output ABOVE the
  // farm-wide Livestock ladder — fibre animals and meat/hide animals.
  // ============================================================
  {
    id: 'wrk_tool_shed', name: 'Tool Shed', icon: '🧰', cat: 'wrk', tier: 1, price: 80,
    cost: { wood: 14, stone: 2 }, needs: [], upgradesTo: null,
    effect: { type: 'craft_speed', mult: 1.15 },
    size: 'xs', biome: null,
    desc: 'Sharp tools, hung where you can find them. Every recipe, a little sooner.',
  },
  {
    id: 'prc_millstone', name: 'Millstone', icon: '🪨', cat: 'wrk', tier: 2, price: 260,
    cost: { wood: 16, stone: 30 }, needs: [], upgradesTo: null,
    effect: { type: 'craft_speed', mult: 1.5, family: ['mill'] },
    size: 's', biome: null,
    desc: 'A heavy turning stone. Grain Mill recipes finish half again as fast.',
  },
  {
    id: 'wrk_bakery_workshop', name: 'Bakery Workshop', icon: '🥖', cat: 'wrk', tier: 2, price: 300,
    cost: { wood: 22, stone: 26 }, needs: [], upgradesTo: null,
    effect: { type: 'craft_speed', mult: 1.5, family: ['bakery'] },
    size: 'm', biome: null,
    desc: 'A brick oven that never goes cold. Speeds every Bakery recipe.',
  },
  {
    id: 'wrk_creamery_workshop', name: 'Creamery Workshop', icon: '🧈', cat: 'wrk', tier: 3, price: 380,
    cost: { wood: 26, stone: 20 }, needs: [], upgradesTo: null,
    effect: { type: 'craft_speed', mult: 1.5, family: ['creamery', 'cheese_house'] },
    size: 'm', biome: null,
    desc: 'Churns and a cool stone floor. Speeds Creamery and Cheese House work.',
  },
  {
    id: 'wrk_pottery_workshop', name: 'Pottery Workshop', icon: '🏺', cat: 'wrk', tier: 2, price: 280,
    cost: { wood: 18, stone: 24 }, needs: [], upgradesTo: null,
    effect: { type: 'craft_speed', mult: 1.5, family: ['preserve_kitchen', 'juicery'] },
    size: 's', biome: null,
    desc: 'Jars, crocks and bottles to hand. Speeds preserving and pressing.',
  },
  {
    id: 'prc_fermentation_house', name: 'Fermentation House', icon: '🫙', cat: 'wrk', tier: 3, price: 420,
    cost: { wood: 34, stone: 14 }, needs: [], upgradesTo: null,
    effect: { type: 'craft_speed', mult: 1.5, family: ['smokehouse', 'farm_kitchen'] },
    size: 'm', biome: null,
    desc: 'Barrels on racks, vents in the gable. Speeds curing and slow cooking.',
  },
  {
    id: 'wrk_textile_workshop', name: 'Textile Workshop', icon: '🧵', cat: 'wrk', tier: 3, price: 460,
    cost: { wood: 30, stone: 12 }, needs: [], upgradesTo: null,
    effect: { type: 'production_mult', species: ['sheep', 'goat'], mult: 2.6 },
    size: 'm', biome: null,
    desc: 'A loom, dye pots and fleece. Sheep and goats out-produce the rest of the farm.',
  },
  {
    id: 'prc_tannery', name: 'Tannery', icon: '🟤', cat: 'wrk', tier: 3, price: 460,
    cost: { wood: 26, stone: 18 }, needs: [], upgradesTo: null,
    effect: { type: 'production_mult', species: ['cow', 'pig'], mult: 2.6 },
    size: 'm', biome: null,
    desc: 'Hides on frames and soaking vats. Cattle and pigs give more than anywhere else.',
  },
  {
    id: 'wrk_carpenter_workshop', name: 'Carpenter Workshop', icon: '🪑', cat: 'wrk', tier: 2, price: 340,
    cost: { wood: 30, stone: 10 }, needs: [], upgradesTo: null,
    effect: { type: 'harvest_bonus', good: 'wood', amount: 1 },
    size: 'm', biome: null,
    desc: 'A saw bench and a stack of planks. Every tree you fell yields +1 wood.',
  },
  {
    id: 'wrk_forge', name: 'Forge', icon: '🔨', cat: 'wrk', tier: 3, price: 520,
    cost: { wood: 24, stone: 44 }, needs: [], upgradesTo: null,
    effect: { type: 'harvest_bonus', good: 'stone', amount: 1 },
    size: 'm', biome: null,
    desc: 'Anvil, quench barrel, better picks. Every boulder you break yields +1 stone.',
  },

  // ============================================================
  // COMMERCE (com_) — 7. Better prices, and selling without you.
  // sell_bonus adds up (capped at +50%); auto-sellers run on their own timers,
  // so the fastest one you own is the one that matters.
  // ============================================================
  {
    id: 'com_roadside_stand', name: 'Roadside Stand', icon: '🧃', cat: 'com', tier: 1, price: 90,
    cost: { wood: 10 }, needs: [], upgradesTo: 'com_general_store',
    effect: { type: 'auto_sell', everyMs: 120000 },
    size: 'xs', biome: null,
    desc: 'An awning and an honesty box. Sells a little of your stock every 2 minutes.',
  },
  {
    id: 'com_trading_post', name: 'Trading Post', icon: '🤝', cat: 'com', tier: 2, price: 260,
    cost: { wood: 20, stone: 8 }, needs: [], upgradesTo: 'com_farmers_market',
    effect: { type: 'sell_bonus', pct: 3 },
    size: 's', biome: null,
    desc: 'Traders stop here to haggle, and everything you sell fetches a bit more.',
  },
  {
    id: 'com_farmers_market', name: 'Farmers Market', icon: '⛺', cat: 'com', tier: 3, price: 700,
    cost: { wood: 40, stone: 15 }, needs: ['com_trading_post'], upgradesTo: 'com_restaurant',
    effect: { type: 'sell_bonus', pct: 6 },
    size: 'm', biome: null,
    desc: 'Striped stalls and a market crowd bidding your prices up.',
  },
  {
    id: 'com_general_store', name: 'General Store', icon: '🏬', cat: 'com', tier: 3, price: 850,
    cost: { wood: 45, stone: 25 }, needs: ['com_roadside_stand'], upgradesTo: 'com_shipping_office',
    effect: { type: 'auto_sell', everyMs: 60000 },
    size: 'm', biome: null,
    desc: 'A proper shopfront that turns stock over every minute.',
  },
  {
    id: 'com_shipping_office', name: 'Shipping Office', icon: '📮', cat: 'com', tier: 4, price: 1400,
    cost: { wood: 50, stone: 40 }, needs: ['com_general_store'], upgradesTo: null,
    effect: { type: 'auto_sell', everyMs: 45000 },
    size: 'm', biome: null,
    desc: 'Scheduled freight pickups. Your stock leaves like clockwork.',
  },
  {
    id: 'com_restaurant', name: 'Restaurant', icon: '🍷', cat: 'com', tier: 4, price: 1800,
    cost: { wood: 60, stone: 50 }, needs: ['com_farmers_market'], upgradesTo: 'com_export_warehouse',
    effect: { type: 'sell_bonus', pct: 10 },
    size: 'm', biome: null,
    desc: 'Terrace seating and a kitchen. Plated food is worth far more than the crop.',
  },
  {
    id: 'com_export_warehouse', name: 'Export Warehouse', icon: '🚢', cat: 'com', tier: 5, price: 4000,
    cost: { wood: 120, stone: 90 }, needs: ['com_restaurant'], upgradesTo: null,
    effect: { type: 'sell_bonus', pct: 15 },
    size: 'xl', biome: null,
    desc: 'Loading bays and containers. Overseas buyers pay the best rates there are.',
  },

  // ============================================================
  // MACHINES (mac_) — 3. Harvests ripe crops for you.
  // ============================================================
  {
    id: 'mac_harvester', name: 'Harvester', icon: '🌽', cat: 'mac', tier: 3, price: 700,
    cost: { wood: 30, stone: 25 }, needs: [], upgradesTo: 'mac_combine',
    effect: { type: 'auto_collect', radius: 16, everyMs: 25000 },
    size: 'm', biome: null,
    desc: 'A cutting reel and a small bin. Collects ripe plots close by.',
  },
  {
    id: 'mac_combine', name: 'Combine', icon: '🏎️', cat: 'mac', tier: 4, price: 1800,
    cost: { wood: 60, stone: 50 }, needs: ['mac_harvester'], upgradesTo: 'mac_drones',
    effect: { type: 'auto_collect', radius: 30, everyMs: 20000 },
    size: 'l', biome: null,
    desc: 'A wide header and an unloading auger. Half the farm, faster.',
  },
  {
    id: 'mac_drones', name: 'Agricultural Drones', icon: '🛸', cat: 'mac', tier: 5, price: 4000,
    cost: { wood: 70, stone: 90 }, needs: ['mac_combine'], upgradesTo: null,
    effect: { type: 'auto_collect', radius: 90, everyMs: 15000 },
    size: 'm', biome: null,
    desc: 'A landing pad and a flight of quadcopters. Nothing ripe goes uncollected.',
  },

  // ============================================================
  // ENERGY (enr_) — 5. Powers the farm AND speeds all crafting.
  //
  // Power is a real constraint: a shortfall STALLS every running machine
  // (see tickUpkeep). Kept at five for DIFFERENT BEHAVIOUR, not bigger numbers —
  // a turbine's output rises and falls with the wind, solar with the daylight,
  // the rest are steady. That is a placement decision, not just a purchase.
  // ============================================================
  {
    id: 'enr_campfire', name: 'Campfire', icon: '🔥', cat: 'enr', tier: 1, price: 35,
    cost: { wood: 6, stone: 2 }, needs: [], upgradesTo: null,
    effect: { type: 'craft_speed', mult: 1.1 },
    size: 'xs', biome: null,
    desc: 'A ring of stones and a steady flame. A little heat, a little power.',
  },
  {
    id: 'enr_generator', name: 'Generator', icon: '🔌', cat: 'enr', tier: 2, price: 240,
    cost: { wood: 12, stone: 10 }, needs: [], upgradesTo: 'enr_autopower',
    effect: { type: 'craft_speed', mult: 1.25 },
    size: 's', biome: null,
    desc: 'Fuel in, steady power out — rain or shine, day or night.',
  },
  {
    id: 'enr_solar', name: 'Solar Panels', icon: '☀️', cat: 'enr', tier: 3, price: 620,
    cost: { wood: 14, stone: 20 }, needs: [], upgradesTo: null,
    effect: { type: 'craft_speed', mult: 1.35 },
    size: 'm', biome: null,
    desc: 'Free power all day and none at all after dark. Pair it with something steady.',
  },
  {
    id: 'enr_windturbine', name: 'Wind Turbine', icon: '🌪️', cat: 'enr', tier: 3, price: 700,
    cost: { wood: 20, stone: 30 }, needs: [], upgradesTo: null,
    effect: { type: 'craft_speed', mult: 1.4 },
    size: 'l', biome: null,
    desc: 'Output rises and falls with the wind — site it somewhere exposed.',
  },
  {
    id: 'enr_autopower', name: 'Automated Power Station', icon: '🏭', cat: 'enr', tier: 5, price: 3000,
    cost: { wood: 70, stone: 120 }, needs: ['enr_generator'], upgradesTo: null,
    effect: { type: 'craft_speed', mult: 1.7 },
    size: 'xl', biome: null,
    desc: 'Transformers and switchgear. Enough power that you stop thinking about it.',
  },

  // ============================================================
  // LANDMARKS (cap_ / eco_) — 4. Prestige only.
  // Endgame pieces bought to be looked at. Prestige lifts every sale price by
  // 0.1% each, capped at +20%, so these pay back slowly and forever.
  // ============================================================
  {
    id: 'eco_clock_tower', name: 'Clock Tower', icon: '🕰️', cat: 'cap', tier: 4, price: 2500,
    cost: { wood: 60, stone: 120 }, needs: [], upgradesTo: null,
    effect: { type: 'prestige', amount: 30 },
    size: 'l', biome: null,
    desc: 'The valley sets its watches by your farm now.',
  },
  {
    id: 'cap_botanical_garden', name: 'Botanical Garden', icon: '🌺', cat: 'cap', tier: 5, price: 6000,
    cost: { wood: 120, stone: 140 }, needs: [], upgradesTo: null,
    effect: { type: 'prestige', amount: 50 },
    size: 'xl', biome: null,
    desc: 'A domed glasshouse that makes the farm a destination in itself.',
  },
  {
    id: 'cap_restored_lighthouse', name: 'Restored Lighthouse', icon: '🗼', cat: 'cap', tier: 5, price: 8000,
    cost: { wood: 90, stone: 220 }, needs: [], upgradesTo: null,
    effect: { type: 'prestige', amount: 60 },
    size: 'xl', biome: 'oceanside',
    desc: 'Its beam sweeps the coast again — the crown jewel of the shoreline.',
  },
  {
    id: 'cap_observatory', name: 'Observatory', icon: '🔭', cat: 'cap', tier: 5, price: 12000,
    cost: { wood: 140, stone: 260 }, needs: [], upgradesTo: null,
    effect: { type: 'prestige', amount: 80 },
    size: 'xl', biome: null,
    desc: 'A slotted dome on the hill. People come for the stars and leave inspired.',
  },
];
