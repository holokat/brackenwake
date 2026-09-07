# The Greenwold, space by space

Written 2026-09-07, when the procedural filler was judged and found wanting.
The ground the generator makes is kept. What stands on it is authored from
here on, one space at a time, in the in-game editor, and nothing random
stands inside an authored space.

A space is a bowl of land you can see across, with one landmark you walk
toward, one thing to do there, one reward for doing it, and a sightline to
the next space. A zone is twelve to fifteen of them and the roads between.
Nothing stands between spaces but the road and the view.

The Greenwold is the first hour. Its job is to teach the game with its
hands in its pockets: walk, look, fight one thing, pick one thing, make one
thing, meet the dragon, and want to see what is over the ridge.

## The first hour, as a walk

Born on the green (1). Old Wynn sends you to the Hedge (2) with the egg on
your shoulder. On the way, the mill and its wheat (3) show you a field, a
farmer and a scarecrow that is only a scarecrow by day. At the Hedge the
stone hums and the compass turns to the Beech Hangar (4), where the first
real fight is a badger that would rather be left alone, and the first thing
worth picking grows at the roots. From the ridge above the Hangar the chalk
scar (5) is in plain view, and the pickaxe you were given finally has a use.
Coming home by the river the Old Cellars (6) mouth sits in its hollow with
a Legion banner over it, and that is the door the second hour opens.

Six spaces. The rest are for the second hour and for the players who turn
left when the road turns right.

## The spaces

Each entry: what it is for, the landmark, the thing to do, the reward, the
sightline out, and the models it needs (a model in the props manifest is
marked made; anything else is a stand-in or a marker until it is made).

### 1. Hearthhome, the green

For: home. The only place in the zone where nothing hunts.
Landmark: the well pavilion in the middle of the green, the manor tower
behind it.
Do: talk to Bram, Old Wynn and Pip; the egg hatches; buy an axe; find the
smith, the healer and the inn by their signs.
Reward: the compass turns to the Hedge; the hatchling.
Sightline: from the green the Hedge's nearest stone stands across the
fields to the east, 330 m off, with the ring lane running past it.
Models: cottage_b (made), flint wall and corner (made), barrel, crate,
bench, fence (made); smithy, manor, inn, chapel, stable, bank, healer,
cottage_a, cottage_c, well pavilion, stalls, gate tower, bridge (to make).
Authored already: src/mmo/plans/hearthhome.json.

### 2. The Standing Hedge, the ridge

For: the first wonder, and the first quiet. The ring is half a mile across;
one stone is the whole space.
Landmark: the carved sarsen, four metres, its face to the ring's centre,
the worn path round it, offerings at its foot.
Do: put your hand on the stone with the hatchling awake. Nothing attacks
here by day.
Reward: the stone is yours, the compass turns to the Hangar, and the
hatchling's first word.
Sightline: down the ridge to the Beech Hangar's dark crown on the next
rise, and back across the fields to the village.
Models: waystone_village (to make), boundary stones, offerings, a hedgerow
run behind. Authored: src/mmo/plans/waystones.json (nine stops).

### 3. The Mill Run, the river and the wheat

For: the countryside the village lives on, and the first field.
Landmark: the mill and its wheel, the weir below it, the footbridge.
Do: cross the weir on the stepping stones; talk to the miller; at night the
scarecrow in the near field walks, and a wisp sits on the water.
Reward: bread from the miller's wife for a sack carried, and the first
lesson that night is different.
Sightline: the mill from the road a quarter mile off, the wheel turning;
from the mill, the Hedge stone on the ridge.
Models: mill, mill wheel, eel weir, footbridge, granary, miller's house,
cart, lamp post, stepping stones, scarecrow (to make); willow (grown).
Authored: src/mmo/plans/millrun.json.

### 4. The Beech Hangar, the wood

For: the first fight and the first forage, both under trees.
Landmark: the fallen beech across the path, the setts under the bank.
Do: a badger, then a wild dog pack by day, spiders and a goblin warrior by
night; chanterelles and wild garlic at the roots, two of each.
Reward: hide and meat, the first Foraging, and the view.
Sightline: the ridge path climbs out of the wood and the chalk scar is
white in the hill ahead, 400 m off.
Models: beech (grown), fallen_beech, badger_sett, rooting_patch (to make),
badger (body made in code). Authored: src/mmo/plans/beechhangar.json.

### 5. The Chalk Pits, the scar

For: the pickaxe, and the first place that is a place of work.
Landmark: the white scar in the green hill, the headframe over the mouth.
Do: mine copper and tin on the yard; talk to the foreman; go into the
mouth for the deeper seam.
Reward: the first ore, the first ingot at the smithy, the first thing made.
Sightline: the Cellars' hollow below by the river, the banner on it.
Models: headframe, mine mouth, ore cart, spoil heap, foreman's hut, pick,
barrow (to make); the chalk scar is a terrain paint and a cliff stroke.
Authored: src/mmo/plans/greenwoldpits.json.

### 6. The Old Cellars, the hollow

For: the door to the second hour.
Landmark: the brick arch in the hollow with the Legion banner over it.
Do: look at it. Bandit archers and a spider hold the hollow; the arch is
enterable and Oram Blackhand is below.
Reward: the dungeon, when you are ready. Until then, the archers' bows.
Sightline: from the arch, back up to the village; from the village bridge,
the banner is a red mark in the hollow.
Models: cellar_arch, chain_lantern, legion_banner, cart_broken (to make).
Authored: src/mmo/plans/oldcellars.json.

### 7. The Kingsroad, the paved way in

For: the Legion, seen before it is fought.
Landmark: the paved road with its milestones, a Legion camp at the
milestone where it enters the realm.
Do: walk the road. Watch the patrol. A highwayman waits at the bend.
Reward: the road itself is the reward; it leads out of the zone.
Sightline: down the road to the gate of the next realm, shut.
Models: lamp_post_iron, milestone, fingerpost, legion_tent, legion_standard,
spear_rack, brazier, legion_crate, stone_bridge_10m (to make).
Authored: src/mmo/plans/kingsroad.json.

### 8. Highwayman's Hollow, the camp

For: the first camp fight, four against one, with a lookout who sees you.
Landmark: the lookout platform in the oak, the fire under the overhang.
Do: come in from the wrong side or be seen. Highwaymen and an archer.
Reward: the loot sacks, the purse, and the map on the table that marks
the Sunken Chapel.
Sightline: from the lookout, the Kingsroad's bend and the chapel's water.
Models: lookout_platform, tent_ragged, tarp_cart, campfire, weapons_rack,
loot_sack, target_dummy, sheep_skeleton (to make).
Authored: src/mmo/plans/highwaymanshollow.json.

### 9. The Sunken Chapel, the water

For: the zone's ghost story.
Landmark: the roof a foot under the water, the bell still on the beam.
Do: wade out at night; the wisps come; a wraith stands in the nave.
Reward: what is in the belfry, and a word from the wraith about the
Cellars.
Sightline: the chapel from the road on the far bank, the bell catching
the light at dusk.
Models: chapel_sunken, headstones, rowing_boat_rotten, lily pads (to
make); willow (grown). Authored: src/mmo/plans/sunkenchapel.json.

### 10. The Long Meadow, between the green and the mill

For: the walk. The first open country, and a fight if you want one.
Landmark: a single great oak on a rise with a hay rick under it.
Do: boars in the grass, a fox at dusk. Nothing else.
Reward: the first hide, and the view of the mill.
Sightline: mill ahead, village behind, the Hedge on the left.
Models: oak (grown), hay_rick (to make). To author.

### 11. The Water Meadows, below the mill

For: the river as a thing to follow.
Landmark: the footbridge and the reed beds, a heron.
Do: follow the bank to the Cellars. Wisps at night.
Reward: the fishing spot.
Sightline: the Cellars' banner downstream.
Models: reed beds, heron (to make). To author.

### 12. Coldwake, the hamlet on the far side

For: the second village, so the first is not the only one.
Landmark: a green with a well and six houses, a hedge round it.
Do: a farmer with a lost thing; a shop with what Hearthhome lacks.
Reward: a second waystone of your own.
Sightline: the village and the Hedge across the fields.
Models: the cottage kit (made and to make). To author; replaces the rolled
hamlet at 275, 1089.

## What comes out and stays out

Inside any authored space: no rolled hedgerows, walls, gates, sheaves,
sarsens, folds or ponds, no rolled sites, no boulder scatter. The space's
file is all there is. Between spaces: the road, the terrain, the trees the
generator grows, the monsters the roster spawns, and nothing else.

## The order of work

1. The editor (in flight): placement, markers, terrain brushes, caves.
2. Space 1 rebuilt by hand in the editor, played, judged.
3. Spaces 2 to 6 in order, each played before the next is started. That is
   the first hour, and it is the vertical slice.
4. Spaces 7 to 12.
5. Every marker placed during 2 to 12 is a row in the model list, in the
   order the walk meets it.

## Where they stand now (2026-09-07, evening)

All twelve are laid, plus the country between them, by
`scripts/sculpt-greenwold.mjs`, traced in sheet fractions off the user's
painting (`public/maps/greenwold.png`) and turned into metres through the
guide's frame, which is 2.6 km across (it was 4.4, and the zone felt too
huge). Seventy six spaces in `src/mmo/spaces/greenwold_*.json`: the twelve,
nine stones, eleven fields, eight copses, three willow banks, two Kingsroad
stretches and four woods cut into 260 m parts, with 1,712 terrain strokes in
`public/terrain/greenwold.json`.

`docs/mmo/wiring/GW2-SCULPT-TO-THE-PAINTING.md` is what was traced, what was
measured, what was found broken and what is still stand-in.

That is a draft laid by script so there is something to walk and argue with;
the editor is where it gets fixed, and a rerun of the script overwrites
whatever the editor changed.
