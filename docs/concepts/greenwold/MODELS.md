# The Greenwold's models, from the nine images

What to make, in the order that changes the game most, with the technical
spec the engine wants and a text prompt for each in the same language as the
concept images. Read `PLANS.md` beside this for where each piece stands.

## The technical spec, once

- **File**: glTF binary (.glb), one file per model, metres, Y up, forward +Z,
  origin at the centre of the footprint with the base on y = 0. Name the
  file by the id in the tables below (`inn.glb`, `oak_a.glb`).
- **Mesh**: author in quads, export triangulated (the engine draws
  triangles; quads in the file are triangulated on load anyway and cost
  time). Clean topology, no n-gons, no overlapping shells, no interior faces.
  Hard-surface props do not need subdivision; stylised means clean planes
  with bevelled edges, not smoothed blobs.
- **Poly budgets** (triangles): small prop 200 to 1,500; furniture and
  furnishings 500 to 3,000; a cottage 3,000 to 8,000; the inn, the manor,
  the chapel, the mill 8,000 to 15,000; a tree 2,000 to 6,000 with two LODs
  at a half and a fifth and a two-card billboard; a creature 4,000 to
  10,000; the player 10,000 to 15,000.
- **Textures**: PBR, base colour, normal, and one packed ORM (occlusion,
  roughness, metalness). Hand-painted stylised albedo with the shading
  painted in lightly, the way the images are. Resolution: 512 for a small
  prop, 1024 for a prop or furniture, 2048 for a building, a tree trunk
  sheet, a creature or the player. Never 4K or 8K: this is a browser game
  streaming a whole world, and a 4K set is 40 MB of VRAM per model. Use a
  2K trim sheet shared by all the flint walls, another by all the thatch,
  another by all the timber framing, so ten buildings cost three sheets.
- **Materials**: one material per model where you can, two at most (an
  opaque and an alpha-cut for leaves, thatch edges, ropes). Every extra
  material is an extra draw call per instance.
- **UVs**: non-overlapping for anything baked; tiling trim sheets for walls
  and roofs. Leaves and thatch fringes on alpha-cut cards.
- **"Smart mesh" tools versus hand modelling**: an AI mesh generator is fine
  for organic one-offs (the standing stone, the boar, the fallen beech, the
  skull) if you retopologise to the budget and repaint the albedo in the
  style; it is the wrong tool for anything that tiles or repeats (walls,
  fences, roofs, lamp posts, stalls) because its topology and textures will
  not line up piece to piece. Kit pieces are hand built to a grid: wall
  segments 4 m, fence panels 3 m, hedge segments 4 m, road slabs 2 m.
- **Rigged bodies**: exactly one skin, clips named exactly as the game asks
  (humans `idle walk run swing cast hurt die jump`, monsters `idle walk
  attack hurt die special`), walk authored at 7 m/s and run at 18 m/s.
- **Size**: `src/mmo/plans/footprints.js` FOOTPRINT[id] is [width, depth,
  height] in metres and the game scales a model to that HEIGHT, so build to
  it. A model with no footprint row is never loaded.
- **Budgets by footprint height**, which is the one number every model has:
  under 2 m (barrel, crate, bench, fence panel, headstone) 512 textures and
  800 triangles; under 4 m (wall piece, stall, well, bridge, standing stone)
  1024 and 1,500 (2,500 for a bridge or a well); under 7 m (cottage, stable,
  smithy, gate tower) 2048 and 8,000; 7 m and up (inn, chapel, manor, mill)
  2048 and 15,000.
- **Validate** props and buildings with `node tools/validate-props.mjs`
  (`--file <path>` for one), which measures the file against the footprint
  and these budgets and fails anything over. Rigged bodies use
  `node tools/validate-glb.mjs`.

The prompt language below is for a text-to-3D or image-to-3D tool. Attach
the matching concept image to each prompt; the words say what the crop is.

## Tier 1: Hearthhome (the image is the reference for every piece)

| id | what | tris | tex | prompt |
|---|---|---|---|---|
| `inn` | the Bracken Arms, two storeys, thatch, timber frame on a flint base, a round sign on a bracket, a bench, two barrels | 12k | 2048 | Stylised medieval inn, two storeys, thick golden thatch roof with a dormer, timber-framed upper floor over a flint stone ground floor, round wooden sign on an iron bracket, wooden door, small leaded windows, a bench and two barrels by the door; hand-painted textures, clean quads, game asset, single material plus alpha-cut thatch fringe |
| `smithy` | open-fronted stone smithy, tall chimney, forge glow, anvil, tools | 8k | 2048 | Stylised medieval smithy, stone walls, one side open with timber posts, a tall square stone chimney, a forge hearth with coals, an anvil on a stump, a water trough, tools on the wall; hand-painted, game asset |
| `manor` | the stone manor with a square tower and slate roof, a stair to the door | 15k | 2048 | Stylised stone manor house, two storeys of dressed grey stone, steep blue-grey slate roof, a square tower with a pointed cap on one end 16 m tall, a stone stair to an arched door, chimneys, leaded windows; hand-painted, game asset |
| `chapel` | the chapel with a bell tower and spire | 12k | 2048 | Stylised small stone chapel, pointed arch door and windows, slate roof, a square bell tower with an open belfry and a slender spire, a cross on the gable; hand-painted, game asset |
| `bank` | square stone strongroom, blue slate, one door, steps | 5k | 1024 | Stylised small square stone building, one heavy iron-bound door up three steps, blue slate pyramid roof, barred windows, corner quoins; hand-painted, game asset |
| `stable` | open stable with pens and a hay loft | 8k | 2048 | Stylised timber stable, thatch roof, open front with stalls, a hay loft, post-and-rail pens attached, straw on the floor; hand-painted, game asset |
| `healer` | thatched cottage with herbs and flowers drying on the walls | 6k | 1024 | Stylised thatched cottage, whitewashed timber frame, bunches of herbs and flowers hanging under the eaves, a herb bed, a stone step; hand-painted, game asset |
| `cottage_a`, `cottage_b`, `cottage_c` | three thatched cottages, different footprints | 5k each | 1024 (shared trim sheets) | Stylised thatched cottage, timber frame over flint, a stone chimney smoking, a wooden door, two windows, flower boxes; three variants: long, square with a porch, L-shaped |
| `well_pavilion` | the roofed well: an octagonal slate roof on timber posts over a stone well with a bucket | 3k | 1024 | Stylised village well under an octagonal slate roof on six timber posts, a round stone well head, a windlass and bucket, a stone step ring |
| `stall_a`, `stall_b`, `stall_c` | market stalls, striped awnings, goods | 1.5k each | 1024 | Stylised market stall, timber frame, striped cloth awning (red and white, blue and white, green), a counter with baskets of bread, vegetables, cloth |
| `waystone_village` | the 4 m carved standing stone (also the nine on the ring, so one model) | 3k | 2048 | Weathered grey sarsen standing stone 4 m tall with a bearded face carved in it, lichen, carved lines that can glow (emissive mask), pebble ring at the base; stylised, game asset |
| `flint_wall_4m`, `flint_wall_corner`, `flint_wall_end` | the village wall kit, 3 m high | 800 each | 2048 trim | Stylised flint and mortar wall segment 4 m long 3 m high with a stone cap, matching corner and end pieces, tiling texture |
| `gate_tower` | the timber gate tower with a hip roof and a gate | 6k | 1024 | Stylised timber gate tower on a stone base, hipped shingle roof, an open arch with a double wooden gate, a pennant |
| `stone_bridge_10m` | the arched stone bridge | 3k | 1024 | Stylised single-arch stone bridge 10 m long with parapets and end posts |
| `lane_slab`, `lane_edge` | packed-earth lane pieces (can be a decal) | 100 | 1024 | Packed earth lane tile 4 m with worn edges into grass |
| `mound_fence` | the low post-and-rail fence ring around the stone's mound | 400 | 512 | Low post and rail fence panel 2 m, weathered oak |
| `bench`, `barrel`, `crate`, `sack`, `flower_box`, `hay_rick` | dressing | 200 to 800 | 512 | Stylised medieval barrel with iron hoops; wooden crate; grain sack; window flower box; conical hay rick 3 m |

## Tier 1: the Mill Run, the Kingsroad, the Standing Hedge

| id | what | tris | tex | prompt |
|---|---|---|---|---|
| `mill` | the water mill, stone and timber, thatch, chimney, wheel separate | 12k + 2k | 2048 | Stylised stone water mill, timber-framed upper floor, thick thatch roof, a square stone chimney, a sluice, the wheel as a separate model (`mill_wheel`, 6 m, wooden paddles) so it turns |
| `millers_house` | thatched cottage variant with a garden fence | 5k | 1024 | as `cottage_a` with a picket garden fence and flowers |
| `granary` | timber granary on stilts with a ladder | 2k | 1024 | Stylised timber granary on four stilts with a thatched roof and a ladder |
| `eel_weir` | woven willow fence across water | 800 | 512 | Woven willow eel weir, a fence of wattle panels on posts 6 m long, alpha-cut weave |
| `footbridge` | plank footbridge with rope rails | 1k | 512 | Wooden plank footbridge 8 m with rope rails on posts |
| `stepping_stones` | five flat stones | 300 | 512 | Five worn flat stepping stones |
| `cart_laden`, `cart_empty` | the farm cart | 2k | 1024 | Two-wheeled wooden farm cart, laden with sacks, and empty |
| `goose` | rigged, tier 0 | 1.5k | 512 | Stylised white goose, rigged, idle, waddle, swim, flap |
| `willow` | weeping willow, three variants with LODs | 5k | 2048 | Stylised weeping willow, thick trunk, trailing branches as alpha cards |
| `lamp_post_iron` | the road lamp, lit at night (emissive glass) | 1k | 512 | Wrought iron lamp post 4 m with a hexagonal glass lantern, emissive glass |
| `fingerpost` | signpost with three blank boards (the game paints the names) | 600 | 512 | Wooden fingerpost 3 m with three pointing boards, blank faces for text |
| `milestone` | waist high stone, blank face | 200 | 512 | Weathered waist-high milestone, rounded top, blank face |
| `road_slab_2m`, `road_kerb` | paved road kit | 100 | 2048 trim | Cobbled stone road slab 2 by 6 m tiling, and a kerb piece |
| `legion_tent`, `legion_standard`, `spear_rack`, `brazier`, `legion_crate`, `camp_fence` | the Legion camp kit, black canvas and brass | 500 to 3k | 1024 | Black canvas campaign tent with brass finials and pegs; brass sun standard on a black pole 6 m; spear rack with six spears; iron brazier on legs with coals; black iron-bound crate; low black timber fence 3 m |
| `tithe_wagon` | the covered wagon with the strongbox (E2's event) | 6k | 2048 | Black canvas covered wagon with brass fittings, an iron strongbox in the back, four wheels |
| `legion_soldier`, `legion_archer` | rigged humans, black plate, square shield with a brass boss; bow and quiver | 10k | 2048 | see the bestiary; two outfits on the human body |
| `boundary_stone` | the knee-high stones between the nine | 200 | 512 | Knee-high rough grey boundary stone |
| `offerings` | bowls, a jug, a candle, wildflowers, a pebble ring | 600 | 512 | Clay bowls, a jug, a stub candle, a ring of pebbles, wildflower bunches |

## Tier 1: the Old Cellars, the Chalk Pits, Highwayman's Hollow, the Beech Hangar, the Sunken Chapel

| id | what | tris | tex | prompt |
|---|---|---|---|---|
| `cellar_arch` | the stone arch mouth with a brick vault and a stair down | 4k | 2048 | Stone arch doorway 4 m wide half sunk in a grass bank, red brick barrel vault behind, stone stair descending, moss |
| `chain_lantern` | lantern on a chain | 300 | 512 | Iron lantern on a chain, emissive flame |
| `legion_banner` | the black banner with a brass finial, planted crooked | 500 | 1024 | Black cloth banner with a brass clawed emblem on a spear pole with a brass finial |
| `cart_broken` | the wreck | 1.5k | 1024 | Broken wooden cart, one wheel off, boards split |
| `rat` | rigged, tier 1 giant rat and tier 0 mouse | 2k | 512 | Stylised rat, rigged: idle, run, bite, hurt, die |
| `chalk_face_4m` | the cut wall kit with ore seams (green copper, grey tin) | 1k | 2048 | Chalk cliff face segment 4 m wide 12 m high with horizontal seams of green copper ore and grey tin, tiling |
| `headframe` | the timber headframe with a winding wheel | 4k | 1024 | Timber mine headframe 8 m with a spoked winding wheel and rope |
| `mine_mouth` | timber-braced mine mouth | 1.5k | 1024 | Mine entrance braced with heavy timber posts and a lintel, a lantern hook |
| `ore_cart`, `rail_2m`, `spoil_heap`, `pick`, `barrow`, `foremans_hut` | the mine yard kit | 200 to 3k | 512 to 1024 | Wooden ore cart with iron wheels on rails; 2 m rail section; spoil heap of chalk and green ore; a pick; a barrow; a small plank hut with a lantern |
| `palisade_stake_3m` | sharpened log palisade panel | 600 | 1024 | Palisade of sharpened logs lashed with rope, 3 m panel |
| `lookout_platform` | the platform and ladder for an oak | 1.5k | 1024 | Rough timber lookout platform with a rail and a ladder, to sit in a tree |
| `tent_ragged` | the bandits' tents, two variants | 1k | 1024 | Ragged canvas A-frame tent on poles, patched |
| `campfire` | fire ring with logs (flame is the game's) | 400 | 512 | Stone fire ring with charred logs and log seats |
| `weapons_rack`, `target_dummy`, `loot_sack`, `sheep_skeleton`, `tarp_cart` | camp kit | 300 to 2k | 512 to 1024 | Timber weapons rack with spears and swords; straw target dummy with a hood and a painted target; loot sacks; a sheep skeleton; a cart under a tarp |
| `bandit`, `raider` | rigged humans in stolen coats | 10k | 2048 | see the bestiary |
| `beech_a`, `beech_b`, `beech_c` | old beeches, grey trunks 1.2 m, LODs | 6k | 2048 | Stylised old beech, smooth grey trunk, high canopy, roots exposed, three variants |
| `fallen_beech` | the fallen trunk with bracket fungus | 3k | 2048 | Fallen beech trunk 14 m with bracket fungus and moss |
| `badger_sett` | roots with a dark hole and spoil | 800 | 1024 | Tree roots with a badger hole and a spoil fan |
| `rooting_patch` | turned earth decal | 50 | 512 | Patch of turned earth and leaf litter |
| `boar`, `old_grist` | rigged, tier 2 and the named tier 3 variant | 6k | 2048 | Stylised boar, black bristles, tusks, rigged: idle, walk, charge, gore, hurt, die; and a pony-sized grey-spined variant with one broken tusk |
| `chapel_sunken` | the chapel with an open belfry and a bell (a variant of `chapel`) | 10k | 2048 | Small stone chapel with a stone cross on the west gable and an open belfry holding a bronze bell, moss, weed |
| `headstone_a` to `headstone_e` | five shapes | 200 each | 512 | Weathered stone headstones, five shapes, moss |
| `rowing_boat_rotten` | aground | 1k | 1024 | Rotting wooden rowing boat, planks sprung |
| `lily_pad_patch` | cards | 50 | 512 | Water lily pads and flowers as alpha cards |
| `skeleton_sexton` | rigged skeleton in a long black coat | 6k | 2048 | Stylised skeleton in a ragged black sexton's coat, rigged |

## Tier 2: the country between the places

| id | what | tris | tex | prompt |
|---|---|---|---|---|
| `oak_a`, `oak_b`, `oak_c` | oaks with LODs | 6k | 2048 | Stylised English oak, round crown, thick trunk, three variants |
| `hedge_4m`, `hedge_corner`, `hedge_gate_gap` | hedgerow kit | 800 | 1024 | Hedgerow segment 4 m, dense green with flowers, alpha-cut leaves |
| `stone_wall_4m`, `stone_wall_corner` | dry stone wall kit | 500 | 1024 | Dry stone wall 4 m, 1.2 m high, lichen |
| `field_gate`, `stile` | in the gaps | 600 | 512 | Five-bar wooden field gate; a wooden stile |
| `fence_rail_3m` | post and rail | 300 | 512 | Post and rail fence 3 m |
| `wheat_row_8m`, `cabbage_row_8m`, `furrow_8m` | crop rows (instanced) | 200 | 1024 | Row of ripe wheat 8 m as alpha cards; a row of cabbages; a ploughed furrow strip |
| `scarecrow` | with a crow variant | 800 | 1024 | Scarecrow of poles in a ragged coat and hat, arms out, straw showing; a crow on one arm |
| `sheep_fold`, `dew_pond` | | 1k | 1024 | Dry stone sheep fold ring; a round dew pond with a clay rim |
| `boulder_a`, `boulder_b`, `boulder_c`, `sarsen` | | 300 | 1024 | Grey chalk-country boulders, three sizes; a rough sarsen |
| `deer`, `rabbit`, `fox`, `crow`, `hawk`, `frog`, `field_mouse` | rigged animals | 1k to 4k | 512 to 1024 | see the bestiary |
| `wolf` | rigged, tier 2 | 6k | 2048 | Stylised grey wolf, lean, rigged: idle, lope, bite, hurt, die |
| `goblin_scout`, `goblin_warrior`, `skeleton`, `zombie`, `thorn_grub`, `wraith` | rigged monsters | 4k to 8k | 1024 to 2048 | see the bestiary |
| `player_male`, `player_female` | the hero bodies with gear slots | 15k | 2048 | see 20-MODEL-LIST.md |
| `dragon_hatchling` | on the shoulder | 4k | 1024 | Stylised dragon hatchling 0.4 m, rigged: idle with breath, cling, chirp, sleep |

## What is wrong in the images, for the record

Nothing that blocks a model. Three notes: the standing stone is painted at 5
m and the game will stand it at 4; the Kingsroad's soldiers carry round
bosses on their square shields where the sheet says nine skulls, which the
texture fixes; the Hearthhome painting has both a chapel and a manor with a
tower where the sheet has a church and no manor, and the game keeps both
because the manor is the keep T2 built.
