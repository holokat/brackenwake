// infrastructure_b.js — DECOR. No stat, no effect, placed purely because you
// want it there. Pure data module.
//
// The game had ZERO no-effect items before this file, which is a large part of
// why a built-out farm read as functional-but-samey: every object on the ground
// was there for a number. These are the survivors of the 238 items cut from the
// functional catalog — kept for their models, stripped of their duplicate stats.
//
// They keep their original `cat` so the placeholder builder still gives each one
// a sensible silhouette; `decor: true` is what the HUD groups on.
//
// Economics: coins UNLOCK a decor item once, then each copy you place costs its
// materials again. So decor is a wood sink rather than free spam — which is what
// gives a cleared woodlot somewhere to go.

const D = (id, name, icon, cat, price, cost, size, desc) =>
  ({ id, name, icon, cat, tier: 1, price, cost, needs: [], upgradesTo: null,
     effect: null, decor: true, size, biome: null, desc });

export const INFRA_B = [

  // ── Small: the things you scatter once the farm is working ──────────
  D('eco_birdhouse', 'Birdhouse', '🐦', 'eco', 20, { wood: 2 }, 'xs',
    'A little box on a post. Something to look at from the porch.'),
  D('eco_bench', 'Bench', '🪑', 'eco', 20, { wood: 3 }, 'xs',
    'Somewhere to sit and watch the crops come in.'),
  D('eco_flower_bed', 'Flower Bed', '🌷', 'eco', 25, { wood: 2 }, 'xs',
    'A border of colour along a path or a wall.'),
  D('eco_wind_chimes', 'Wind Chimes', '🎐', 'eco', 30, { wood: 2 }, 'xs',
    'Hung where the breeze catches them.'),
  D('eco_bee_hotel', 'Bee Hotel', '🐝', 'eco', 30, { wood: 3 }, 'xs',
    'Drilled blocks and hollow stems for solitary bees.'),
  D('eco_bat_house', 'Bat House', '🦇', 'eco', 25, { wood: 3 }, 'xs',
    'A slim box high on a pole, for the evening shift.'),
  D('wkr_outhouse', 'Outhouse', '🚽', 'wkr', 20, { wood: 4 }, 'xs',
    'Every honest farm has one, tucked out of the way.'),
  D('prot_hedge', 'Hedge', '🌳', 'prot', 25, { wood: 2 }, 'xs',
    'Clipped green that turns a boundary into a garden.'),
  D('prot_farm_gate', 'Farm Gate', '🚪', 'prot', 30, { wood: 5 }, 'xs',
    'A five-bar gate. Somewhere for a track to properly begin.'),
  D('eco_seasonal_decorations', 'Seasonal Decorations', '🎃', 'eco', 80, { wood: 4 }, 'xs',
    'Lanterns, wreaths and pumpkins — whatever the season calls for.'),

  // ── Medium: places, not objects ─────────────────────────────────────
  D('prot_stone_wall', 'Stone Wall', '🧱', 'prot', 35, { stone: 8 }, 's',
    'Dry-laid field stone. The oldest boundary there is.'),
  D('eco_campfire_area', 'Campfire Area', '🔥', 'eco', 45, { wood: 6, stone: 4 }, 's',
    'A fire ring with logs pulled up around it.'),
  D('wkr_worker_cabin', 'Worker Cabin', '🛖', 'wkr', 60, { wood: 14 }, 's',
    'One room, one stove, one window facing the fields.'),
  D('eco_butterfly_garden', 'Butterfly Garden', '🦋', 'eco', 90, { wood: 4 }, 's',
    'Planted for nectar, and it shows on a warm afternoon.'),
  D('eco_footbridge', 'Footbridge', '🌉', 'eco', 90, { wood: 12 }, 's',
    'Planks and a handrail over the narrow part.'),
  D('eco_picnic_area', 'Picnic Area', '🧺', 'eco', 100, { wood: 12 }, 's',
    'Tables under a tree, for the days that call for it.'),
  D('eco_frog_pond', 'Frog Pond', '🐸', 'eco', 100, { stone: 8 }, 's',
    'Shallow, reedy and loud at dusk.'),
  D('wkr_washhouse', 'Washhouse', '🧼', 'wkr', 100, { wood: 12, stone: 6 }, 's',
    'A copper, a mangle and a stone floor that drains.'),
  D('eco_wildflower_meadow', 'Wildflower Meadow', '🌼', 'eco', 110, { wood: 2 }, 'm',
    'Left unmown on purpose, and better for it.'),
  D('for_charcoal_kiln', 'Charcoal Kiln', '🔥', 'for', 120, { wood: 10, stone: 12 }, 's',
    'An earthed mound, smoking slowly for days.'),
  D('eco_pergola', 'Pergola', '🏛️', 'eco', 120, { wood: 16 }, 's',
    'Posts and beams with something climbing over them.'),
  D('for_tree_nursery', 'Tree Nursery', '🌱', 'for', 130, { wood: 12 }, 'm',
    'Rows of saplings in pots, waiting for their place.'),
  D('log_woodbridge', 'Wooden Bridge', '🌉', 'log', 150, { wood: 25 }, 'm',
    'Timber trusses wide enough for a cart.'),
  D('wkr_bunkhouse', 'Bunkhouse', '🏠', 'wkr', 160, { wood: 26, stone: 6 }, 'm',
    'Long, low, and full at harvest time.'),
  D('eco_observation_deck', 'Observation Deck', '🔭', 'eco', 250, { wood: 22 }, 's',
    'A raised platform where the view is worth the climb.'),
  D('eco_pollinator_garden', 'Pollinator Garden', '🌻', 'eco', 260, { wood: 6 }, 'm',
    'Deliberately planted, deliberately busy.'),
  D('log_stonebridge', 'Stone Bridge', '🌉', 'log', 280, { wood: 10, stone: 45 }, 'm',
    'A single arch that will outlast everything around it.'),
  D('eco_wetland', 'Wetland', '🪷', 'eco', 280, { wood: 6 }, 'l',
    'Standing water, sedge and lilies. The farm at its wildest.'),
  D('prot_fire_lookout', 'Fire Lookout', '🗼', 'prot', 280, { wood: 30, stone: 8 }, 's',
    'A cabin on legs above the treeline.'),
  D('wkr_cottage', 'Cottage', '🏡', 'wkr', 320, { wood: 40, stone: 20 }, 'm',
    'Whitewashed walls and a chimney with something cooking under it.'),
  D('eco_rewilded_field', 'Rewilded Field', '🌾', 'eco', 320, { wood: 4 }, 'l',
    'A field given back. Scrub, thorn and birdsong.'),
  D('eco_wildlife_corridor', 'Wildlife Corridor', '🦌', 'eco', 300, { wood: 10 }, 'l',
    'A planted strip that lets the woods reach the water.'),
  D('eco_sculpture', 'Sculpture', '🗿', 'eco', 350, { stone: 30 }, 's',
    'Carved stone, sited where the light hits it.'),
  D('eco_windmill_decor', 'Decorative Windmill', '🌬️', 'eco', 400, { wood: 45, stone: 10 }, 'm',
    'Sails that turn in the wind and grind absolutely nothing.'),
  D('eco_bell_tower', 'Bell Tower', '🔔', 'eco', 800, { wood: 30, stone: 60 }, 'm',
    'Rung at noon, and whenever there is news.'),
  D('eco_forest_reserve', 'Forest Reserve', '🌲', 'eco', 900, { wood: 20 }, 'xl',
    'Old growth, protected. The one part of the farm you never touch.'),
];
