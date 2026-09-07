# The Greenwold: what you can pick, and what should stand about the place

Generated 2026-09-07 by scripts/export-greenwold-dressing.mjs. The forage table is read from src/world/forage.js; the dressing table is a design typed in the script and checked against the dressing kinds the game draws and the props footprints, so nothing already had is asked for twice.

## The forage

21 pickables grow in meadow ground. Each is a clump on the ground or on a trunk, picked with Foraging against its difficulty, in its seasons only, two of each per tree at most, and it regrows in three days. "per" is roughly how many bunches a wooded 64 m chunk carries in season; "dry" and "wet" are the weight in ordinary meadow and in the wettest band (moisture over 0.62), which in the Greenwold is the water meadows.

**In the sculpt world only what a space names grows.** A sculpt world does not roll pickables off its trees; each space carries a `forage` list (id, spot, one or two plants) and `authored_resources.js` stands those. The Greenwold spaces carry 17 such clumps today (the hangar's chanterelles, garlic, oyster mushrooms and fiddleheads; strawberries and rosehips at Coldwake and the Long Meadow; blackberries and nettles at the mill and the Hollow; dandelions on the green; nettles and fiddleheads in the water meadows). The woods' 5,000 trees grow nothing on their own; a rule that seeds the table's tree pickables under a space's trees is the change that would fill them, and it is not written.

| id | name | tag | difficulty | seasons | where it grows | per chunk | cluster | dry | wet | looks like |
|---|---|---|---|---|---|---|---|---|---|---|
| `dandelion` | Dandelion | edible | 3 | Spring, Summer | in the open, on grass with no tree over it | 7 | 2 to 3 | 1.0 | 1.0 | a patch of yellow heads and clocks in the grass, 20 cm |
| `nettle` | Nettle | caution | 5 | Spring, Summer, Autumn | anywhere on the ground | 4 | 2 to 3 | 1.0 | 1.0 | a stand of nettles, 80 cm, the plant you learn about once |
| `nut` | Chestnuts | edible | 8 | Autumn | at the foot of a tree, within a few metres of the trunk | 4 | 1 | 1.0 | 1.0 | a spread of spiky green chestnut cases on the ground under a tree, some split |
| `blackberry` | Blackberry | edible | 10 | Summer, Autumn | in the open, on grass with no tree over it | 3.5 | 1 to 3 | 1.0 | 1.0 | a bramble arch, 1 m, thorned canes with black fruit |
| `raspberry` | Raspberry | edible | 10 | Summer | in the open, on grass with no tree over it | 3.5 | 2 to 3 | 1.0 | 1.0 | a cane bush, 1 m, red fruit |
| `wild_garlic` | Wild garlic | edible | 10 | Spring | at the foot of a tree, within a few metres of the trunk | 5 | 1 to 2 | 1.0 | 1.0 | a carpet of broad green leaves with white star flowers, 30 cm, under trees |
| `wild_strawberry` | Wild strawberry | edible | 12 | Spring, Summer | in the open, on grass with no tree over it | 6 | 2 to 3 | 1.0 | 1.0 | a ground patch of three-lobed leaves with tiny red fruit, 30 cm |
| `rosehip` | Rosehip | edible | 12 | Autumn | in the open, on grass with no tree over it | 2.5 | 1 to 2 | 1.0 | 1.0 | a dog rose bush, 1.5 m, red hips on thorned stems |
| `fiddlehead` | Fiddlehead fern | edible | 14 | Spring, Summer, Autumn | at the foot of a tree, within a few metres of the trunk | 4 | 1 to 2 | 1.0 | 1.3 | a fern with curled new fronds, 50 cm |
| `hazelnut` | Hazelnut | edible | 15 | Autumn | anywhere on the ground | 1.5 | 1 | 1.0 | 1.0 | a hazel bush, 2.5 m, nuts in green cups |
| `chanterelle` | Chanterelle | edible | 18 | Summer, Autumn | at the foot of a tree, within a few metres of the trunk | 5 | 1 to 2 | 1.0 | 1.0 | a clump of three to five egg yellow funnel mushrooms, 8 cm, gills running down the stem |
| `elderberry` | Elderberry | caution | 20 | Autumn | in the open, on grass with no tree over it | 1.5 | 1 | 1.0 | 1.0 | a small tree or big bush, 2.5 m, flat heads of black berries |
| `oyster_mushroom` | Oyster mushroom | edible | 22 | Spring, Autumn | on the trunk itself, at chest height | 2 | 1 | 1.0 | 1.0 | a shelf of pale grey fans growing out of the bark, 20 cm across |
| `porcini` | Porcini | edible | 25 | Summer, Autumn | at the foot of a tree, within a few metres of the trunk | 3 | 1 to 2 | 1.0 | 1.0 | two fat brown capped mushrooms with pale bulbous stems, 15 cm |
| `morel` | Morel | edible | 35 | Spring | at the foot of a tree, within a few metres of the trunk | 2.5 | 1 to 2 | 1.0 | 1.0 | two honeycomb capped mushrooms, brown, 10 cm, spring only |
| `honey` | Wild honey | edible | 40 | Summer, Autumn | on the trunk itself, at chest height | 0.7 | 1 | 1.0 | 1.0 | a wild bee nest in a hollow of the trunk, a dark hole with a comb showing and bees about it |
| `blueberry` | Blueberry | edible | 8 | Summer | anywhere on the ground | 7 | 2 to 3 | 0.6 | 0.6 | a low bush, 40 cm, blue berries among small leaves |
| `fly_agaric` | Fly agaric | toxic | 12 | Autumn | at the foot of a tree, within a few metres of the trunk | 2 | 1 to 2 | 0.5 | 0.5 | one red cap with white flecks on a white stem, 12 cm, the poison one everybody knows |
| `fig` | Wild figs | edible | 16 | Summer, Autumn | at the foot of a tree, within a few metres of the trunk | 4 | 1 | 0.0 | 1.0 | a fig bush, 3 m, broad leaves, purple fruit; only in the wettest meadow |
| `wild_ginger` | Wild ginger | edible | 28 | Spring, Summer, Autumn | anywhere on the ground | 4 | 2 to 3 | 0.0 | 1.0 | a ground plant with heart shaped leaves and a red flower at the base; only in the wettest meadow |
| `cacao` | Cacao pods | edible | 30 | Summer, Autumn | on the trunk itself, at chest height | 1.5 | 1 | 0.0 | 1.0 | pods on a trunk; only in the wettest meadow, and a stretch for the Greenwold |

Every pickable has a code body today (forage.js builds them by colour). A made model per row is the same clump with the leaf and cap shapes real: 300 to 800 triangles, a 512 texture, the row's colour as the key. Keep the base on y = 0 and the whole thing under a metre except the bushes.

## The dressing the game already draws

Code bodies from dressing_models.js, placed by the dressing system in a generated world and by a space's `rocks` list in the sculpt world: `beehive`, `cabbage_row`, `cart`, `crowed_scarecrow`, `dew_pond`, `drystone_wall`, `field_gate`, `field_hedge`, `furrow`, `hay_rick`, `hedgerow`, `milestone`, `rail_fence`, `sarsen`, `scarecrow`, `sheaf`, `sheep_fold`, `signpost`, `stile`, `wayside_shrine`, `wheat_row`. A made model for any of these replaces the code body under the same id.

Small props already in the footprints table (under 2.5 m), most of them stand-ins until made: `badger_sett`, `barrel`, `barrow`, `bench`, `boulder_a`, `boundary_stone`, `brazier`, `camp_fence`, `campfire`, `cart_broken`, `cart_empty`, `cart_laden`, `chain_lantern`, `crate`, `eel_weir`, `fallen_beech`, `fence_rail_3m`, `flower_box`, `footbridge`, `headstone_a`, `headstone_b`, `headstone_c`, `headstone_d`, `headstone_e`, `hedge_4m`, `lane_slab`, `legion_crate`, `lily_pad_patch`, `loot_sack`, `milestone`, `mound_fence`, `offerings`, `ore_cart`, `pick`, `rail_2m`, `road_kerb`, `road_slab_2m`, `rooting_patch`, `rowing_boat_rotten`, `sack`, `sheep_skeleton`, `spear_rack`, `spoil_heap`, `stable_pen`, `stepping_stones`, `stone_bridge_10m`, `stone_wall_4m`, `target_dummy`, `tarp_cart`, `tent_ragged`, `weapons_rack`.

## The dressing still wanted

100 things, by the part of the zone they belong to, with a rough count for the whole realm and the footprint a model would get (width by depth by height, metres). Creatures are marked; VFX rows are not models. Sizes are for the modeller; a row with no size is not a model.


### Hearthhome, the green

| id | what | size | about how many | status |
|---|---|---|---|---|
| `water_trough` | a stone trough on the green, water in it, moss on the rim | 2 by 0.7 by 0.6 | 2 | to make |
| `washing_line` | two posts and a line with shirts and sheets pegged on it, cloth as alpha cards that can sway | 5 by 0.2 by 2 | 3 | to make |
| `woodpile` | split logs stacked against a wall under a plank, an axe in the block beside it | 2 by 0.8 by 1.2 | 5 | to make |
| `chopping_block` | a round of oak with an axe sunk in it and chips about | 0.6 by 0.6 by 0.5 | 3 | to make |
| `herb_bed` | a low raised bed edged with stones, rosemary, sage and lavender in it | 2 by 1 by 0.5 | 4 | to make |
| `chicken_coop` | a small timber hut with a ramp and a wire run | 2 by 1.5 by 1.4 | 2 | to make |
| `rain_barrel` | a barrel under a downpipe, the lid off, a dipper on a hook | 0.8 by 0.8 by 1.1 | 6 | to make |
| `notice_board` | a roofed board on two posts with papers pinned to it (the game can paint the notices) | 1.4 by 0.3 by 2.2 | 1 | to make |
| `inn_sign` | a round painted sign on a wrought bracket, swinging: the Bracken Arms | 0.9 by 0.1 by 0.9 | 1 | to make |
| `dovecote` | a tall round dovecote on a stone base, a dozen holes, a pigeon or two | 1.6 by 1.6 by 4 | 1 | to make |
| `pig_sty` | a low stone pen with a lean-to roof and a trough, mud in the corner | 3 by 2.5 by 1.4 | 1 | to make |
| `apple_tree` | an orchard apple, 4 m, low spreading crown, fruit as cards in autumn | 4 by 4 by 4 | 12 | to make |
| `lychgate` | the chapel gate: a timber arch with a little roof over the churchyard path | 2.6 by 1.2 by 3 | 1 | to make |
| `headstone_row` | the chapel yard: leaning headstones in grass, the same five shapes the sunken chapel uses | 0.7 by 0.3 by 1 | 12 | to make |
| `village_stocks` | the stocks on the green, empty, a worn seat behind | 1.6 by 0.6 by 1 | 1 | to make |
| `market_produce` | baskets of apples, cabbages, loaves and cheeses on a stall counter, three sets | 1 by 0.5 by 0.4 | 6 | to make |
| `lantern_post` | a short timber post with an iron lantern, lit at dusk, for lanes too narrow for the iron lamp post | 0.3 by 0.3 by 2.4 | 10 | to make |
| `cat` | a cat asleep on a wall or a step (a creature, one idle and a stretch) | 0.5 by 0.2 by 0.25 | 3 | to make |

### The fields and the lanes

| id | what | size | about how many | status |
|---|---|---|---|---|
| `kissing_gate` | a swing gate in a V of rails at a footpath | 1.6 by 1.4 by 1.2 | 8 | to make |
| `cattle_trough` | a long stone or timber trough by a gate, water in it | 2.4 by 0.6 by 0.6 | 6 | to make |
| `plough` | a wooden plough with an iron share left at the headland | 2.4 by 1 by 1.1 | 3 | to make |
| `harrow` | a timber frame harrow with iron teeth, grass through it | 2 by 1.6 by 0.4 | 2 | to make |
| `hay_wain` | a four wheeled wagon heaped with hay, shafts down | 4 by 2 by 2.6 | 2 | to make |
| `shepherds_hut` | a hut on iron wheels with a stove pipe and a step, the door open | 3.6 by 2 by 2.8 | 2 | to make |
| `sheep` | a sheep (a creature: graze, walk, a startle), in flocks on the pastures and the ring | 1 by 0.4 by 0.8 | 40 | to make |
| `cow` | a red cow (a creature: graze, walk, a low), in the ox pasture | 2 by 0.7 by 1.4 | 6 | to make |
| `horse` | a farm horse (a creature) in a paddock, and one in the traces of the mill cart | 2.2 by 0.7 by 1.7 | 3 | to make |
| `pollard_willow` | a willow cut back to a knuckle head with young rods, along the ditches | 3 by 3 by 5 | 20 | to make |
| `dead_oak` | a dead oak, bare, a crow on it, at a field corner | 8 by 8 by 10 | 4 | to make |
| `ivy_stump` | a big stump grown over with ivy | 1.6 by 1.6 by 1 | 8 | to make |
| `log_pile` | trunks stacked at a lane side waiting for the cart | 4 by 1.5 by 1.2 | 4 | to make |
| `poppy_patch` | red poppies in the wheat, a ground card patch | 3 by 3 by 0.5 | 30 | to make |
| `cowslip_patch` | yellow cowslips on the pasture, a card patch | 2 by 2 by 0.3 | 40 | to make |
| `cow_parsley` | tall white umbels along every lane in spring and summer, a card strip | 3 by 0.6 by 1.1 | 80 | to make |
| `thistle_clump` | a clump of purple thistles on rough grass | 1 by 1 by 0.9 | 30 | to make |
| `gorse` | a gorse bush, yellow flowered, on the downs | 2 by 2 by 1.5 | 60 | to make |
| `bramble_thicket` | a wide bramble tangle at a hedge foot, thorned, dark | 3 by 2 by 1.2 | 30 | to make |
| `molehills` | a scatter of six molehills, a ground decal with a little height | 3 by 3 by 0.2 | 40 | to make |
| `puddle` | a lane puddle in a rut, a reflective decal | 1.5 by 0.8 by 0 | 40 | to make |
| `cart_ruts` | wheel ruts along the lanes, a tiling ground decal | 4 by 2 by 0 | 100 | to make |
| `rabbit_warren` | a bank with four holes and a bare sand fan | 3 by 2 by 0.8 | 10 | to make |
| `crow_on_post` | a fence post with a crow on it (the crow is the bird rig, perched) | 0.2 by 0.2 by 1.4 | 10 | to make |
| `crossroads_gibbet` | a gibbet post with an empty iron cage at the Kingsroad crossing, the Legion's notice nailed to it | 0.5 by 0.5 by 4.5 | 1 | to make |
| `cairn` | a walker's cairn of chalk lumps on a hilltop | 1 by 1 by 1 | 6 | to make |
| `hawthorn` | a hawthorn, 4 m, the tree the Standing Hedge is named for, white in spring and red berried in autumn | 4 by 4 by 4 | 40 | to make |

### The Beech Hangar and the woods

| id | what | size | about how many | status |
|---|---|---|---|---|
| `charcoal_clamp` | a charcoal burner's clamp: a turf covered mound with smoke, a rake and a hut beside | 5 by 5 by 2 | 1 | to make |
| `saw_pit` | a saw pit with a trunk across it and the long saw left in the cut | 4 by 1.5 by 1.2 | 1 | to make |
| `coppice_stool` | a hazel stool with a dozen straight rods from it | 2 by 2 by 3 | 30 | to make |
| `leaf_litter` | a ground decal of beech mast and brown leaves for the wood floor, tiling | 4 by 4 by 0 | 200 | to make |
| `bluebell_patch` | bluebells under the beeches in spring, a card patch | 3 by 3 by 0.4 | 60 | to make |
| `bracken` | a bracken stand, waist high, green then rust in autumn | 2 by 2 by 1 | 80 | to make |
| `foxglove` | three spikes of foxglove at a wood edge | 0.6 by 0.6 by 1.4 | 30 | to make |
| `mushroom_ring` | a fairy ring of small white mushrooms in a clearing (decorative, not the forage) | 3 by 3 by 0.15 | 6 | to make |
| `boar_wallow` | a churned mud hollow with hoof marks, a ground body | 3 by 2.5 by 0.3 | 4 | to make |
| `deer_rub` | a sapling with the bark rubbed off at a metre | 0.4 by 0.4 by 3 | 6 | to make |
| `hunters_seat` | a high seat: a ladder to a plank platform against a trunk | 1.2 by 1.2 by 4 | 2 | to make |
| `snare` | a wire snare on a peg at a rabbit run | 0.3 by 0.3 by 0.3 | 6 | to make |
| `fox_earth` | a hole under roots with feathers about it | 1.5 by 1 by 0.6 | 4 | to make |
| `birds_nest` | a nest in a fork, eggs in it in spring | 0.3 by 0.3 by 0.2 | 10 | to make |
| `woodcutters_hut` | a small plank hut with a lean-to woodstore and a fire ring | 3 by 2.5 by 2.6 | 1 | to make |
| `rope_swing` | a rope from a branch over the river bend with a stick seat | 0.2 by 0.2 by 6 | 1 | to make |

### The river, the mill and the water meadows

| id | what | size | about how many | status |
|---|---|---|---|---|
| `mooring_post` | a post at the bank with a rope and a ring | 0.3 by 0.3 by 1.2 | 6 | to make |
| `rowing_boat` | a sound rowing boat pulled up on the bank, oars in it (the sunken chapel has the rotten one) | 4 by 1.5 by 0.9 | 2 | to make |
| `eel_trap` | a woven willow eel trap on the bank, a funnel basket | 0.9 by 0.4 by 0.4 | 6 | to make |
| `millstones` | two spare millstones leant against the mill wall | 1.4 by 0.5 by 1.4 | 1 | to make |
| `sluice_gate` | a timber sluice with a rack and a wheel at the leat | 2 by 0.6 by 2 | 1 | to make |
| `duck` | a duck (the bird rig at goose size, brown), on the mill pond and the meadow ponds | 0.5 by 0.3 by 0.35 | 12 | to make |
| `heron` | a grey heron standing in the shallows (the bird rig, tall, a slow flap) | 0.6 by 0.6 by 1 | 2 | to make |
| `rushes` | a stand of rushes at the water's edge, cards | 1.5 by 1.5 by 1.2 | 60 | to make |
| `yellow_iris` | yellow flag iris at the pond edges in early summer | 1 by 1 by 1 | 20 | to make |
| `dragonfly` | a dragonfly (a tiny flyer, a dart and hover) over the ponds | 0.1 by 0.1 by 0.05 | 10 | to make |
| `plank_walk` | a run of planks on posts across the wet ground | 6 by 0.8 by 0.4 | 3 | to make |
| `flour_sacks` | a stack of flour sacks with dust on them at the mill door | 1.2 by 1 by 1 | 2 | to make |
| `mill_cart_horse` | the mill cart with the horse in the traces, dozing | 5 by 2 by 2.2 | 1 | to make |

### The chalk hills and the pits

| id | what | size | about how many | status |
|---|---|---|---|---|
| `chalk_figure` | a giant cut into the turf of the escarpment, white chalk lines 40 m tall, seen from the whole realm (a ground decal on the slope) | 30 by 40 by 0 | 1 | to make |
| `chalk_boulder` | a rounded white chalk lump with flint in it, three sizes | 1.5 by 1.2 by 1 | 40 | to make |
| `flint_nodules` | a scatter of black flints on the white, a decal with height | 2 by 2 by 0.2 | 30 | to make |
| `beacon_brazier` | a hilltop beacon: an iron basket on a post with a ladder, unlit | 1.2 by 1.2 by 5 | 1 | to make |
| `timber_prop` | pit props: a frame of squared timbers at the mine mouth and along the cut | 2.4 by 0.4 by 2.4 | 8 | to make |
| `lantern_hook` | an iron hook on a post with a miner's lantern, lit | 0.3 by 0.3 by 1.8 | 6 | to make |
| `kestrel` | a kestrel hovering over the scar (the bird rig, small, a hover) | 0.35 by 0.35 by 0.2 | 2 | to make |
| `sheep_track` | a worn track along the hillside, a ground decal | 10 by 0.6 by 0 | 20 | to make |

### The Sunken Chapel and the Hollow

| id | what | size | about how many | status |
|---|---|---|---|---|
| `drowned_wall` | a run of churchyard wall going down into the water, weed on it | 4 by 0.5 by 1 | 6 | to make |
| `bell_buoy` | a floating marker with a small bell, ringing in the wind | 0.6 by 0.6 by 1.2 | 1 | to make |
| `mist_bank` | a low mist over the mere at night (VFX, not a model) |  | 1 | to make |
| `wanted_poster` | a poster nailed to a tree: the highwayman's face and a price | 0.4 by 0.05 by 0.6 | 6 | to make |
| `gibbet_cage` | an iron cage hung from a branch over the Hollow's track, empty | 0.6 by 0.6 by 1.8 | 1 | to make |
| `tripwire` | a line of cord between two pegs with bells on it at the camp edge | 4 by 0.1 by 0.3 | 3 | to make |
| `stolen_goods` | a heap of stolen goods under a tarp: a chest, rolled cloth, a clock | 2 by 1.5 by 1 | 2 | to make |

### Coldwake and the Kingsroad

| id | what | size | about how many | status |
|---|---|---|---|---|
| `duck_pond` | a round pond on Coldwake's green with a rail and ducks (the water is a stroke; this is the rail and the ramp) | 8 by 8 by 0.6 | 1 | to make |
| `maypole` | a tall pole with ribbons on the green | 0.4 by 0.4 by 8 | 1 | to make |
| `legion_barrier` | a striped timber barrier on trestles across the road at the camp, a lantern on it | 5 by 0.6 by 1.2 | 1 | to make |
| `watch_fire` | a fire in an iron basket by the road with a soldier's stool | 1 by 1 by 1 | 2 | to make |
| `road_sign` | a Legion road sign: a black board on a post with brass letters | 1.2 by 0.2 by 2.4 | 3 | to make |
| `tithe_wagon` | the covered wagon with the strongbox (already in the structures list; it belongs on the road) | 6 by 2.4 by 3 | 1 | to make |

### In the air, at night, on the ground

| id | what | size | about how many | status |
|---|---|---|---|---|
| `butterflies` | white and orange butterflies over the flower patches by day (VFX) |  | 1 | to make |
| `fireflies` | fireflies over the water meadows at night (VFX) |  | 1 | to make |
| `chimney_smoke` | smoke from every lit chimney (VFX, on the cottage models' chimney anchors) |  | 1 | to make |
| `pollen_motes` | drifting motes in the wood in a shaft of light (VFX) |  | 1 | to make |
| `crow_flock` | a flock of crows lifting off a field when you come near (the bird rig, grouped) |  | 6 | to make |

## The order that changes the zone most

1. The ground: cart ruts, puddles, leaf litter, molehills, the sheep tracks, the chalk figure. Decals cost nothing and are what makes a lane a lane.
2. The flowers and the rough: poppies in the wheat, cowslips on the pasture, cow parsley on every lane, bracken and bluebells in the hangar, gorse on the downs. Card patches, one texture each.
3. The animals that are not fights: sheep on the ring and the pastures, cows in the ox pasture, ducks on the ponds, a heron, crows on posts. The bird rig is one skeleton for four of them.
4. The working country: troughs, gates, the plough at the headland, the hay wain, the shepherd's hut, the charcoal clamp, the saw pit, the sluice.
5. The village small stuff: washing lines, woodpiles, herb beds, the inn sign, the dovecote, the notice board, a cat.
6. The ones with a story in them: the crossroads gibbet, the wanted posters, the gibbet cage, the beacon, the bell buoy.
