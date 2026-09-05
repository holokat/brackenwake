# The zone prompt book: nine realms, ninety-five places

Written 2026-09-06. The user's process, adopted: author each place from a
concept image instead of scattering a kit.

1. Two cameras. The realm's **wide shot** is run once as `WIDE prefix + realm
   paragraph + wide shot text` and kept as the master. Every **place** is run
   as `PLACE prefix + realm tag + place text`, a close view of that place
   alone, with the master attached as the reference image.
2. `node scripts/zone-prompts.mjs` assembles every final prompt string from
   this file into `docs/concepts/prompts.json` and `docs/concepts/prompts.txt`
   with the file name each image must be saved under, so the whole book can
   be fed to the image tool in order and nothing is retyped.
3. File the images as `docs/concepts/<realm>/<place-id>.png`, ids as below,
   the wide shot as `docs/concepts/<realm>/_realm.png`.
4. Fable reads each image and writes `docs/concepts/<realm>/<place-id>.md`
   (the model list for that place, kit ids where the kit already has the
   piece) and `src/mmo/plans/<place-id>.json` (the authored plan: every
   building, wall, path, tree line, lamp, prop, person and spawn with a
   position and a yaw, and where the player arrives). A plan loader places
   the plan's models; a piece without a model is a code-built stand-in until
   the user makes it; inside a planned place the random dressing is off.
5. The user sculpts the zone's terrain and models the assets from the
   images and the lists.

## How to run a prompt so the images agree with each other

The first run taught this: a place prompt that carries the whole realm's
description and a "whole location in frame" camera comes back as the whole
realm every time, with the place in a corner, and every image places the mill
and the chapel somewhere new. So:

1. **Positions come from the game, never from a painting.** The painted map
   in `docs/maps/greenwold.svg` (drawn from the same data the game walks on)
   is where every place stands. A concept image says what a place looks like
   and how it is laid out inside itself; it does not say where it is in the
   realm. Do not try to make the paintings agree on positions; they cannot.
2. **One wide shot per realm, made once, kept as the master.** Run the WIDE
   prefix with the realm prefix and the realm's wide shot text. Pick the one
   you like and keep it; every later image of that realm is made with it
   attached as the reference image (image to image, style reference,
   whatever your tool calls it) so light, palette and materials match.
3. **A place is a close view of that place alone.** Run the PLACE prefix, then
   ONE short realm tag (not the realm paragraph), then the place text. The
   place fills the frame. Nothing else from the realm is named, so nothing
   else is painted.
4. **File** the wide shot as `docs/concepts/<realm>/_realm.png` and each place
   as `docs/concepts/<realm>/<place-id>.png`. Fable reads each place image and
   writes the model list and the authored plan (`src/mmo/plans/<place-id>.json`),
   placed at the map's position, laid out inside as the image shows.

### WIDE prefix (the realm's wide shot only)

> Concept art for a stylised fantasy MMO in the manner of classic World of
> Warcraft zones: hand-painted textures, exaggerated silhouettes, saturated
> but earthy palette, painterly light, no photorealism. A very high view
> from a kilometre up, the whole zone in frame as a bowl of land ringed by
> hills or mountains or sea, its places visible as small clusters, its roads
> as threads. No text, no user interface. 16:9.

### PLACE prefix (every place)

> Concept art for a stylised fantasy MMO in the manner of classic World of
> Warcraft zones: hand-painted textures, exaggerated silhouettes, saturated
> but earthy palette, painterly light, no photorealism. A close three-quarter
> view of ONE location from about 60 metres away and 25 degrees above, the
> location filling the frame edge to edge, its own layout readable: buildings,
> paths, walls, water. The surrounding country appears only as a strip at the
> top edge. Nothing beyond this location is shown. No text, no user interface.
> 16:9.

### Realm tags for place prompts (one line, in place of the realm paragraph)

- Greenwold: "In the Greenwold, summer farmland of wheat, hedgerows, thatch and flint, warm light."
- Verdant Deep: "In Verdant Deep, a jungle of flowering giants, sakura canopy, wet dark stone, green-gold light."
- Saltmarch: "In the Saltmarch, grey-green fen and sedge, damp pale light." Or for the isles: "In the Thousand Isles, white sand, palms, coral, turquoise sea, hard bright light."
- Ember Wastes: "In the Ember Wastes, red rock and white sand under a huge sun, heat haze, brass and black for the Legion."
- Stormpeaks: "In the Stormpeaks, heather moor and granite under a bruised storm sky, stone and turf, thin blue air."
- Boneyard: "In the Boneyard, a grey ash plain under a dust sky, bone white and ash grey, lantern light the only warmth."
- Frostreach: "In Frostreach, deep snow, black pine and blue glacier ice, aurora at night."
- Sunken Kingdom: "In the Sunken Kingdom, a drowned marble city under clear warm water lit green-gold from the sea floor."
- Ashen Throne: "On the Ashen Throne, black volcanic glass, red lava, sulphur light, black stone and brass for the Legion."

The realm paragraphs below stay for the WIDE shot. The place texts below are
unchanged; run each as PLACE prefix + realm tag + place text.

---

## 1. The Greenwold (danger 1). Home.

**REALM paragraph (wide shot only)**

> The Greenwold: gentle farmland at the heart of the world, on the western
> shore of an inland sea. Wheat fields edged with hedgerows and dry stone
> walls, hay ricks and scarecrows, oak and beech copses on low chalk hills,
> one slow river with a water mill, timber-framed buildings with thatch and
> flint footings, iron lanterns along a paved road, and a ring of grey
> standing stones a mile across drawn on the fields. Warm summer light, high
> soft clouds, blue haze on the far hills.

**Wide shot, `_realm`**

> The whole Greenwold from the air: a green bowl of hedged fields and copses
> ringed by low chalk downs, the mile-wide ring of standing stones in the
> middle with a walled village on a green at its centre, the river winding
> east to a mill and on to the sea, a paved road coming in from the north
> east with a Legion camp beside it, a white chalk pit in one hill, a dark
> beech wood on a ridge, a flooded meadow with a drowned chapel in the
> south, and the inland sea shining at the edge.

**hearthhome, the hub**
> Hearthhome, a large walled village on a green. A low flint wall with two
> timber gate towers, a stone bridge over the river at the east gate.
> Inside: a village green with a roofed well at its centre and market stalls
> around it; a two-storey thatched inn with a swinging sign, the Bracken
> Arms; a smithy with a stone chimney smoking; a chapel with a square tower;
> a healer's cottage with herbs drying; a stable with pens; a stone bank
> with one door; a stone manor with a single tower at the back of the
> village above the roofs; cottages between. Lanes of packed earth, flowers
> at the doors, a 4 m standing stone with a carved face at the edge of the
> green. The wall and the wheat beyond it are the edge of the frame.

**waystones, the Standing Hedge (megastructure)**
> Nine tall grey sarsen stones, each 3 m high and carved with a single
> face, standing on a ring a mile across through wheat fields and
> hedgerows, with eighty smaller boundary stones between them. At dusk the
> nine hum with a faint amber light in the carved lines. One stone in the
> foreground with a worn path circling it and offerings at its foot, two
> more of the nine small on the skyline to show the curve of the ring, wheat
> and a hedgerow between.

**millrun, the Mill Run (landmark)**
> A slow river running east through wheat, with a stone water mill and its
> turning wheel, a millpond with reeds and geese, three eel weirs of woven
> willow across the river, a plank footbridge, a ford with stepping stones,
> the miller's house and a granary, sacks on a cart, a lane with an iron
> lantern, willows along the bank.

**oldcellars, the Old Cellars (dungeon)**
> The mouth of a brick vault under the mill's hill, older than the mill: a
> stone arch half sunk in the slope with a stair going down into the dark,
> brick vaulting visible inside, a lantern on a chain, the Legion's black
> and brass banner planted crooked beside the door, a broken cart, goblin
> footprints in the mud, rats. The grass slope and the mill's wall are the
> top edge of the frame.

**beechhangar, the Beech Hangar (open country)**
> An old beech wood on a chalk ridge above the village: tall grey trunks,
> deep copper leaf litter, badger setts under the roots, a hollow way cut
> by centuries of feet, boar rootings in the litter, a fallen giant beech
> with fungus, dappled light. At the wood's edge the wheat begins. One very
> large boar's shape in the shadow, the size of a pony.

**kingsroad, the Kingsroad (road)**
> The Legion's paved road entering the Greenwold from the north east:
> milestones every mile, a Legion camp of black tents with a brass standard
> beside it, a covered wagon with an iron strongbox and an escort of
> soldiers in black and brass with square shields, a signpost at a fork,
> iron lanterns, a stone bridge over a stream, hedgerows and wheat either
> side.

**greenwoldpits, the Chalk Pits (mine)**
> A white chalk scar in a green hill, copper and tin seams showing green
> and grey in the cut, a trodden yard with a headframe and winding wheel, an
> ore cart on rails, a foreman's hut, a spoil heap, picks and lanterns, two
> mine mouths braced with timber. Grass and wheat above the lip.

**highwaymanshollow, Highwayman's Hollow (camp)**
> A bandit camp in a chalk hollow under an overhang off the Kingsroad:
> tents, a campfire, a stolen tithe cart under a tarp, a lookout post in a
> tree, stakes, loot sacks, a weapons rack, a target dummy, men in stolen
> coats around the fire, bones of a stolen sheep. The hedge and a glimpse of
> paving are the frame's edge.

**sunkenchapel, the Sunken Chapel (ruin)**
> A small stone chapel the river took, standing in a flooded meadow with the
> water up to its roof beam, the bell still hanging in its open belfry
> above the water, the west door under the surface, water lilies, willows, a
> rotting boat, a drowned graveyard with headstones leaning out of the
> water. Blue evening fog, a skeleton in a sexton's coat standing in the
> shallows.

---

## 2. Verdant Deep (danger 1 to 2). Blossom over a swallowed river.

**REALM paragraph (wide shot only)**

> Verdant Deep: a jungle of flowering giants on the southern shore. Sakura
> canopy in pink and white over old-forest trunks a hundred feet high, a
> river braided under the roots, cliffs of dark wet stone with faces cut in
> them, rope bridges and platforms in the crowns, lanterns hanging in the
> branches. Wet, loud with birds, nothing straight. Green-gold light under
> the canopy, petals in the air, mist on the water.

**Wide shot, `_realm`**
> Verdant Deep from above: a sea of pink and white canopy filling a valley
> between dark cliffs, a braided river showing through gaps in the trees, a
> village of platforms lit in the crowns, a quarter-mile cliff carved with
> a hundred faces at the valley head, terraces of garden climbing the cliff
> face, sinkholes webbed over in the jungle floor, the inland sea to the
> north.

**canopycourt, the Canopy Court (hub)**
> A village of platforms and rope bridges two hundred feet up in the
> blossom crowns: round timber platforms wrapped around trunks, curved
> roofs, hanging lanterns, ladders and rope stairs, an archery range on a
> long platform, a market on the widest, a speaker's hall at the top with a
> carved balcony, elven banners in green and white. Birds and petals
> everywhere, the river far below.

**templeoffaces, the Temple of Faces (megastructure)**
> A cliff a quarter mile long with a hundred faces carved into it, each the
> height of a house, vines over every mouth, water running from some of the
> eyes. A stair climbs to the mouth of the largest face, which is the door
> to the temple cut behind. A single robed figure small on the stair.

**templeoffaces_deep, the Deep of Faces (dungeon, boss the Keeper of Faces)**
> Galleries cut behind the cliff where the first riders learned the sight:
> walls carved with eyes from floor to ceiling, roots breaking through the
> stone, spider silk in the corners, cultist banners, braziers of green
> flame, a great chamber where one enormous carved face fills the far wall
> and its eyes are open.

**blossomfall, Blossom Fall (open country)**
> The valley floor where the whole canopy sheds at dawn: petals falling like
> snow, the river running pink, drifts of blossom on the roots and rocks,
> a giant spider's web strung between two trunks catching the petals, a low
> sun coming through the trunks.

**rootriver, the Root River (open country)**
> The river braided under the giant trees, clear water over dark stone,
> fordable at stepping stones, fish visible in the shallows, roots arching
> over the channels like bridges, a giant spider crouched on one arch,
> fishing platforms of woven branch, a robed merchant's boat at the lower
> ford.

**sunkenshrine, the Sunken Shrine (shrine)**
> A dragon shrine half under the river where the roots have lifted the
> stones: a small stone pavilion with a dragon carved on the lintel, its
> floor under a foot of clear water, offerings on the dry steps, petals on
> the water, moss on everything.

**verditehollow, Verdite Hollow (mine)**
> A cave mouth under the cliff where the roots have gone green-gold with
> the ore in the rock, a mine yard among the roots, timber props, an ore
> cart, lanterns, green crystal veins glowing in the cave wall, thorn grubs
> in the litter.

**hanginggardens, the Hanging Gardens (landmark)**
> Terraces of an old temple grown into the cliff face, a hundred feet of
> vertical garden: broken balustrades, flowering vines, waterfalls from
> terrace to terrace, roots and ropes as the way up, rare flowers on every
> level, a harpy roost of sticks and bones at the very top, canopy at the
> frame's edge.

**moonpool, the Moon Pool (landmark)**
> A still black pool under the canopy that shows no reflection, ringed with
> white stones, one flat stone jutting over the water, blossom floating,
> a shaft of moonlight coming down through the trees onto the surface.

**spiderwells, the Spider Wells (cave)**
> Sinkholes in the jungle floor webbed over, the silk thick as sailcloth,
> a cave maze beneath joined by silk bridges over drops, egg sacs, giant
> spiders, blue light filtering down through the webs, bones in the silk.

---

## 3. The Saltmarch and the Thousand Isles (danger 2). Reeds, then a thousand islands.

**REALM paragraph (wide shot only)**

> The Saltmarch: two lands in one. Inland, a fen of knee-deep water and
> sedge to the shoulder, eel weirs, stilt houses, will-o'-wisps at dusk,
> grey-green light. Seaward, a thousand islets of pale sand, palms and
> coral running out into a warm clear sea, channels between them, a wreck
> on every reef, and a pirate city built across a dozen islands. Damp pale
> sky over the fen, hard bright light over the isles.

**Wide shot, `_realm`**
> The Saltmarch from above: a grey-green fen of sedge and standing water
> inland with a stilt village on an old mill, a drowned causeway running
> out to the first islands, then an archipelago of a thousand sandy islets
> scattered into a turquoise sea, a pirate city of planked bridges and a
> mast lighthouse across a dozen of them, a graveyard of stacked hulls on
> one reef, and dark shoals on the far side where the water goes black.

**redqueensharbour, the Red Queen's Harbour (town, megastructure)**
> A pirate city built across a dozen islets and the wrecks between them,
> joined by planked bridges and chains: hulls turned into houses, a sea
> wall of piled stone, warehouses on stilts, a gallows on the point, a
> salvage market of nets and rigging, a barge fleet at anchor with red
> sails, and the lighthouse: a ship's mast a hundred feet tall with a fire
> burning in the crow's nest. The queen's hall is the biggest hull, painted
> red.

**drownedmill, the Drowned Mill (hub)**
> A stilt village on an old stone mill standing in the fen, its wheel dry
> in the sedge, plank walks between the huts, eel traps drying, a smoke
> house, punts tied up, a lantern on every post, the sedge stretching grey
> to the horizon.

**sedgesea, the Sedge Sea (open country)**
> The open fen: sedge to the shoulder, standing water, a plank path
> vanishing into it, an eel weir, a bog crawler's back breaking the surface,
> a wisp light in the distance, low grey sky.

**leviathansrest, the Leviathan's Rest (dungeon, boss Thalassa the Sea-Wyrm)**
> A sea cave under the largest isle, tide-filled, lit by the sea's glow
> from below: pools between rock shelves, crabs, drowned sailors standing in
> the water, barnacled pillars, and in the last chamber the coiled body of
> an enormous sea-wyrm half in the water, one eye open.

**thousandisles, the Thousand Isles (sea)**
> The archipelago from a boat's height: islets of white sand each with one
> palm and one wreck, coral showing through turquoise water, channels
> between, a red-sailed ship racing through, a rock stack with a shrine on
> it, a dark shadow under the far shallows.

**wreckward, Wreck Ward (ruin)**
> A graveyard of ships driven onto one reef over three centuries, hulls
> stacked and rotted into a maze, masts leaning, rigging hanging, a tide
> line of wreckage, drowned crews walking the decks, a small drowned girl
> standing alone at the water's edge holding a lantern.

**saltcut, the Salt Cut (mine)**
> A mine cut into the largest isle's cliff, iron and silver in the rock,
> the yard washed at every high tide and crusted white with salt, timber
> props, an ore cart, rails, crabs in the cuts, the sea right there.

**tidewalk, the Tidewalk (road)**
> A drowned causeway of great stones running from the fen to the first
> isle, dry for an hour either side of low tide, water pooling on it,
> crabs on the stones, drowned figures rising from the pools as the tide
> comes in, the Harbour's lighthouse fire far ahead.

**smugglerscays, Smugglers' Cays (camp)**
> Three islets with caves at the waterline, boats hidden under nets and
> palm fronds, contraband crates in the cave mouths, a lookout on the
> highest rock, a false flag flying, a cooking fire in the sand.

**wisplanterns, the Wisp Lanterns (open country)**
> The deep fen at night, sedge black, water silver, dozens of will-o'-wisp
> lights in blue and green moving over the reeds, one leading toward a
> half-sunk chest, another toward the dark bulk of a bog crawler.

**krakenshoals, the Kraken's Shoals (sea)**
> Shallows between the outer isles where the turquoise water goes black
> without warning, pearl oyster beds in the shallows, a boat anchored over
> the dark, and a vast shape under the black water with one arm near the
> surface.

---

## 4. Ember Wastes (danger 3). Red rock, white sand, a road of glass.

**REALM paragraph (wide shot only)**

> The Ember Wastes: desert on the north eastern shore. Red rock mesas with
> cliff sides, white dunes, blinding salt pans, a sun too big in a pale
> hot sky, heat haze on every horizon. A line of fused black glass runs
> across the sand like a road. Brass and black are the Legion's colours
> here; tents and cloth in ochre and white are the desert people's.

**Wide shot, `_realm`**
> The Ember Wastes from above: red mesas standing out of white dunes, salt
> pans shining, a black glass road running across the whole zone from the
> south west to the north east, a crater a mile wide with walls of black
> glass at the centre, a walking city on legs trailing smoke beside a well,
> a tent camp around a single green well, a red mesa with caves in its face,
> a white palace shimmering on the horizon, the inland sea at the edge.

**lastwell, the Last Well (hub)**
> The Ashwalkers' camp around the one sweet well: a stone well with a
> carved wellhead and a palm court around it, ochre and white tents in
> rings, a market of rugs and copper under awnings, camels, a mud brick
> keep standing over the well, water channels in the sand, the red mesas
> behind.

**brasscity, the Brass City (megastructure)**
> The Legion's foundry: a city on iron legs the height of towers, walking
> the dunes, kneeling to drink at a well with its great door lowered like a
> tongue. Brass plates, black iron, a hundred smoking stacks, furnace glow
> in the vents, chains and gantries, tiny figures on the ramp.

**brasscity_works, the Brass Works (dungeon, boss the Brass Heart)**
> The city's insides: forges and furnaces, iron walkways over rivers of
> molten metal, chains and pistons, steam, cultists in brass masks, iron
> golems standing in alcoves, and the engine room where a great brass heart
> the size of a house beats in a cage of pipes.

**firstfire, the Firstfire Crater (dungeon)**
> The crater where the pact was made: a bowl a mile wide with walls of
> black glass, a Legion foundry cut into the wall with brass doors, a stair
> going down into the throat at the centre, veins of ember light in the
> glass, cultist banners, a cyclops standing guard at the door.

**glassroad, the Glass Road (road)**
> The line of fused sand running across the desert, black and glossy,
> cracked, hot at noon with mirage floating over it, Legion milestones of
> brass, a convoy of iron wagons with ember crates and Legion soldiers, and
> a manticore lying on a red rock beside the road in the noon glare.

**saltpans, the Salt Pans (open country)**
> White salt flats that blind at noon, cracked into hexagons, the bones of
> caravans and camels half buried, a sandstorm wall coming in on one side,
> a giant spider crossing the pan, a waystone of the desert people.

**embercut, the Ember Cut (mine)**
> Four cuts in red rock, warm to the hand, rails warped by heat, ore carts,
> timber props scorched black, a sledge hammer on a fused floor, ember
> crystal glowing orange in the walls, a foreman's hut in the shade.

**cultistcamp, the Recruiter's Tents (camp)**
> Clean white tents in a filthy country at the wastes' western edge, a
> brass standard, a table with papers and a brand, a queue of ragged
> people, robed recruiters, a cage on a cart.

**miragepalace, the Mirage Palace (landmark)**
> A palace of white towers and domes shimmering on the desert horizon,
> half transparent in the heat, palms and water visible through its gate,
> the black glass road running toward it and one flagstone marked on the
> road in the foreground.

**buriedlibrary, the Buried Library (dungeon, boss the Librarian)**
> A tower of the old desert people buried to its roof in sand, a hole dug
> into the top with ropes and ladders, inside: galleries of scrolls, sand
> pouring in through every crack in slow waterfalls, a cyclops keeper
> asleep among the shelves, lamplight.

**banditridge, Bandit Ridge (camp)**
> A red mesa with caves in its face, ropes and ladders up the cliff,
> hides and awnings over the cave mouths, horses in a corral at the foot,
> raiders in desert cloth and stolen Legion mail, a lookout on the rim
> watching the glass road.

**singingdunes, the Singing Dunes (open country)**
> Great dunes with wind streaming off their crests, ripples, the sand
> humming, a spine of something enormous just breaking the surface of one
> dune, a giant spider on another, the sun low and red.

---

## 5. The Stormpeaks (danger 3 to 4). Moor into storm-struck mountains.

**REALM paragraph (wide shot only)**

> The Stormpeaks: highlands on the north shore. Heather moor in purple and
> brown climbing into granite peaks, black lochs, scree, cairns, weather
> crossing in walls, the tops in cloud, lightning striking the highest
> peak. Stone and turf buildings, slate roofs, rope bridges. Thin blue
> air, far fog, a bruised storm sky with breaks of hard light.

**Wide shot, `_realm`**
> The Stormpeaks from above: heather moor rising to a wall of granite
> peaks, three black lochs in the glens, a stone village at the mountains'
> foot, a cairn-lined path climbing to a great hall cut into the highest
> peak with a hundred-foot flight of steps and nine stone perches around
> it, lightning on that peak, a Legion fort in the only pass, a rope bridge
> across a chasm lost in cloud, the sea to the north.

**cairnfoot, Cairnfoot (hub)**
> A highland village of stone and turf at the mountains' foot: low houses
> with turf roofs, a brewhouse with a copper, sheep pens of dry stone, a
> stone keep cut into the cliff behind the village, cairns lining the road
> out, heather all around, the peaks above in cloud.

**cairnroad, the Cairn Road (road)**
> The path to the Eyrie climbing through heather and scree, a stone cairn
> for every fallen rider along it, each with a name, prayer cloth on some,
> a wall of rain crossing the glen ahead, an ogre camp on a ledge above,
> the lightning peak at the top.

**legionpass, the Legion Pass (camp)**
> The Legion's mountain fort in the only pass: a palisade of black timber
> and two stone towers across the gap, brass standards, black tents inside,
> ogres in Legion harness on the wall, a gate with a portcullis, the road
> running through.

**eyrie, the Eyrie (megastructure)**
> The dragonriders' hall cut into the lightning peak: landing steps a
> hundred feet wide climbing to a hall with a doorway sixty feet high, nine
> stone perches on pillars around it, each with a ghostly rider seated,
> lightning striking the peak above, cloud streaming past at the frame's
> edge.

**eyrieroost, the Eyrie's Roost (dungeon, boss Warden Hask)**
> Three levels cut into the peak down to a mounting stair: vast halls for
> things that flew, chain and harness on the walls, ogres and iron golems
> among the pillars, a wyvern's nest in a broken hall, ghost riders
> standing at the doors that the living cannot pass.

**blacklochs, the Black Lochs (open country)**
> Three lochs in the high glens, black and still, cold mist on them, scree
> slopes running into the water, a wyvern circling the peak above, the roof
> of a drowned hall just visible under the largest loch.

**thundershaft, the Thunder Shaft (mine)**
> A mine driven into the lightning peak's side, silver and blue-black
> coldiron in the rock, the timber yard humming with static, iron golems the
> old kingdom left standing rusted at the mouth, a storm breaking on the
> peak.

**skybridge, the Sky Bridge (landmark)**
> A rope bridge across a chasm a thousand feet deep, its far end lost in
> cloud, planks missing, cables frayed, lightning lighting it for an
> instant, wind and rain.

**stormanvil, the Storm Anvil (landmark)**
> An iron anvil on the highest bare rock, black and scarred, a lightning
> bolt striking it, a blank of metal glowing on it, a smith crouched behind
> a boulder, cloud at the frame's edge.

**echochasm, the Echo Chasm (open country)**
> A gorge of grey rock with ledges on both walls, ogre camps of hides and
> bones on the ledges, scree poised above the path, a rider's tomb door cut
> into the wall, mist in the bottom.

**drownedhall, the Drowned Rider Hall (ruin)**
> Under the largest black loch: a riders' hall forty feet down, its roof
> beams visible from above, drowned riders in rusted harness standing in
> rows, a dragon saddle on a stone stand, green light through cold water.

---

## 6. The Boneyard (danger 3 to 4). Where nine dragons fell.

**REALM paragraph (wide shot only)**

> The Boneyard: an ash plain on the western shore where nothing grows.
> Grey dust to the horizon, wind lifting ash into storms, and out of it the
> skeletons of nine dragons, each the size of a hill, ribs like cathedral
> vaults, skulls like houses. Bone-white and ash-grey, a low brown horizon,
> a sky of dust with a pale sun, lantern light the only warmth.

**Wide shot, `_realm`**
> The Boneyard from above: a grey ash plain with nine enormous dragon
> skeletons lying in a rough ring, ribs standing like ruined cathedrals, the
> largest skull with lights in its eye sockets and a lodge built behind its
> teeth, a hamlet of tomb keepers at the plain's edge, a line of opened
> barrows, a mine cut into a thighbone, a grove of bone-white trees, an ash
> storm crossing the plain, the sea grey at the edge.

**ninefall, Ninefall (landmark)**
> The nine skeletons in a rough ring across the ash, each with a name cut
> into a rib by its rider, the nearest skeleton's ribs arching over the
> viewer like a nave, a ghostly rider standing at the largest, ash blowing
> through the bones.

**skulllodge, the Skull Lodge (megastructure)**
> The Wyrmking's hunting lodge built inside the largest dragon skull: three
> storeys of dark timber behind the teeth, balconies between the fangs,
> lanterns burning in both eye sockets seen for ten miles, banners of hide,
> trophies on stakes around the jaw, a track of wagons to the mouth.

**skulllodge_throat, the Trophy Throat (dungeon, boss Huntmaster Gallow)**
> Down the skull's throat into the neck bones: a tunnel of vertebrae with a
> trophy on every one, heads and hides and cages, hounds on chains, bone
> knights in the alcoves, torchlight, and the huntmaster's hall in the
> chest cavity hung with a hundred skulls.

**ridersrest, Riders' Rest (hamlet)**
> A tomb-keeper's hamlet at the plain's edge: stone houses with bone
> lintels, an inn with a lantern, a bone yard of sorted remains, carts,
> the keepers in grey, the ash plain beginning at the last house.

**ridertombs, the Rider Tombs (ruin)**
> Barrows of the nine riders along the plain's edge, every door opened,
> stone lintels carved with dragons, grave goods scattered, a bone knight
> standing guard at one door, a wraith counting at another, ash drifting in.

**ashsea, the Ash Sea (open country)**
> The open plain, ash to the knee in drifts, a storm standing the dead
> dragons up for a minute as ghostly shapes over their bones, wraiths
> moving in the dust, a werewolf pack on a rise, footprints filling behind.

**marrowmine, the Marrow Mine (mine)**
> A mine driven into a dragon's thighbone the size of a hill: the bone cut
> open, ore grown in the marrow in black and blue-grey veins, timber props
> inside the bone, an ore cart on rails running out of the joint, lanterns.

**ribcathedral, the Rib Cathedral (megastructure)**
> The largest dragon's ribcage, each rib a vault a hundred feet high, the
> wind playing it like organ pipes, rows of ghostly riders standing between
> the ribs at midnight, ash on the floor like a nave, moonlight through
> the bones.

**hunterscamps, Gallow's Outriders (camp)**
> Hunting camps of the Skull Lodge on the plain: hide tents, racks of
> drying hides, iron cages with beasts in them, a hound master with a pack,
> spears, a fire in a dragon's eye socket used as a hearth.

**boneorchard, the Bone Orchard (open country)**
> A grove of bone-white trees with black fruit growing where the dragons'
> blood soaked in, wraiths visible in the trunks like faces in bark, ash
> between the trees, one felled tree with a wraith rising from it.

---

## 7. Frostreach (danger 4). Snow to the waterline.

**REALM paragraph (wide shot only)**

> Frostreach: the north western rim. Glaciers running to a frozen sea,
> black pine under white, frozen fjords, ice cliffs lit blue from within,
> giants' halls roofed with whale ribs and lit by fires the size of houses.
> White and blue by day, deep blue with aurora by night, breath visible,
> everything rimed.

**Wide shot, `_realm`**
> Frostreach from above: glaciers running down between black pine forests to
> a frozen fjord full of ice-locked ships, a giants' hall at a glacier's
> mouth with fires glowing, a glacier three hundred feet high with the dark
> shape of a dragon curled inside it, a white shelf a mile wide, steaming
> hot springs in the pines, a tundra with mammoth herds, aurora over it all.

**coldseat, Coldseat (hub)**
> The frost giants' hall at the glacier's mouth: a roof of whale ribs over
> a long hall, fires as big as houses inside, timber and ice walls, a
> forge with its own glow, a palisade of ice-cased logs, a keep of timber
> and ice with a horn on the roof, a Legion camp of black tents small on
> the ice below.

**icevault, the Ice Vault (megastructure)**
> A glacier three hundred feet high, blue and cracked, and inside it a
> dragon curled around a fortress, frozen mid-breath, visible through the
> ice, lit blue from within by giants' fires at night. A Legion cutting
> with scaffolds and braziers chewing into the ice wall.

**icevault_deep, the Vault Below (dungeon, boss Legate Ossory)**
> Down the Legion's cutting through the glacier: ice tunnels shored with
> black timber, braziers, dire wolves on chains, frost giants gone wrong
> with ice through their skin, sappers with picks, and the frozen dragon's
> eye the size of a door in the ice wall at the end, a Legion legate in
> blue-white plate before it.

**whitepines, the White Pines (open country)**
> Black pine forest under deep snow, tracks everywhere, a white wolf pack
> on a rise, a giants' herd trail, a full moon through the branches, snow
> falling off boughs.

**frozenfleet, the Frozen Fleet (ruin)**
> A Legion barge fleet caught in the fjord ice a century ago, hulls tilted
> and rimed, masts snapped, crews of frozen skeletons still at their posts,
> an admiral's barge with a frozen figure on the deck, blue ice all round.

**rimecut, the Rime Cut (mine)**
> Mine mouths that breathe cold fog, a yard that has never thawed, blue-
> black coldiron and silver-white rimesteel in the cut, giants' picks the
> size of a man, ice on the rails, an ore cart frozen to the track.

**longnightcamp, the Long Night Camp (camp)**
> A giants' outpost on the glacier lit from inside on the day the sun does
> not rise: great tents of hide, a bonfire, the glacier glowing blue around
> the camp, aurora overhead, giants' footprints the size of boats leading
> away.

**aurorashelf, the Aurora Shelf (landmark)**
> A glacier shelf a mile wide, blank white under an aurora, a path of light
> laid across it by the sky, crevasses showing as dark lines beside the
> path, a giants' cache of carved ice at the far end.

**icefall, Icefall (cave)**
> A cave behind a frozen waterfall, blue light through the ice curtain,
> water still moving under the ice floor, rimesteel gleaming white in the
> walls, an ice troll crouched at the back, a frozen Legion sapper crew
> mid-step.

**hotsprings, the Hot Springs (landmark)**
> Steaming turquoise pools in the pines under the glacier, the only bare
> ground in the realm, giants bathing, rime on every branch above the
> steam, a hidden tunnel mouth behind the largest pool.

**mammothsteppe, the Mammoth Steppe (open country)**
> Open tundra under snow, mammoth and musk ox herds moving, giants'
> herders with spears, the white wolf pack on the herd's flank, the glacier
> wall on the horizon.

---

## 8. The Sunken Kingdom (danger 4 to 5). A city under clear water.

**REALM paragraph (wide shot only)**

> The Sunken Kingdom: the inland sea itself, flat, clear and warm, and
> under it a drowned city of white marble, towers, avenues, a coliseum, a
> palace, all visible from a boat and lit from the sea floor by a green-
> gold glow. Reefs where the tallest towers break the surface. Green-tinted
> light, near fog on the water, marble gone green at the joints.

**Wide shot, `_realm`**
> The Sunken Kingdom from above: the clear sea with a whole marble city
> visible under it, avenues and towers and a coliseum the size of a hill,
> a glow at the centre lighting it all, reefs where towers break the
> surface with a hamlet of boats and nets on one, a stone stair climbing out
> of the sea onto a reef, a bell tower's top at the surface, whales crossing
> a channel, the shores of four realms around the edge.

**reefstair, the Reef Stair (landmark)**
> Stone steps climbing out of the sea onto a reef, green with weed, a
> drowned king in white marble armour gone green walking up them at dusk,
> a dive camp of boats and nets on the reef, the drowned city glowing under
> the water behind.

**drownedpalace, the Drowned Palace (dungeon, boss King Caradoc the Drowned)**
> The king's palace entirely under water: marble halls, fish in the
> columns, air pockets held under domed ceilings as rooms, drowned
> courtiers in rusted finery, vampire knights of the old court, a bone
> dragon coiled in the throne hall, the king's throne under a shaft of the
> sea-floor glow.

**coliseum, the Drowned Coliseum (megastructure)**
> An arena the size of a hill on the sea floor, tiers of marble seats full
> of the drowned, lit from below by the glow, the sand floor with two
> figures fighting, the full moon visible through the water above.

**theglow, the Glow (landmark)**
> The thing on the sea floor that turns and lights the city: a vast empty
> egg chamber of coral and crystal slowly rotating, green-gold light
> pouring out of it up through the water, the avenues radiating from it.

**avenues, the Avenues (open country)**
> The drowned streets of the marble city, fish moving down them, shops with
> doors open, statues, a fountain still standing, drowned patrols in
> marble scale walking in a line, the glow lighting everything from below.

**pearlreef, Pearl Reef (hamlet)**
> A camp on the reef where the towers break the surface: boats and drying
> nets on the marble tower tops, plank walks between them, a hut on a
> tower roof, divers surfacing, the city visible under the clear water
> around.

**pearlbeds, the Pearl Beds (mine)**
> Oyster beds on the reef and a drowned quarry under them where the kingdom
> cut its stone: marble blocks half cut, pearls in the beds, silver in the
> quarry face, drowned miners with picks, coral over the tools.

**airgardens, the Air Gardens (landmark)**
> Palace terraces where glass domes still hold air under the sea: gardens
> alive inside them, roses in bloom, fish outside the glass, the glow
> below, one dome cracked and flooded.

**drownedbell, the Drowned Bell Tower (megastructure)**
> The tallest tower rising from the sea floor to the surface, its bell
> chamber just clear of the water at low tide, a bell rope trailing in the
> sea, the drowned rising toward the surface around it, the city glowing
> beneath.

**whaleroad, the Whale Road (sea)**
> A channel across the clear sea where great whales cross at dawn, a small
> boat riding one's wake, the drowned city visible under the whales, and a
> kraken's arm following in the deep behind.

---

## 9. The Ashen Throne (danger 5). The volcano and the fortress.

**REALM paragraph (wide shot only)**

> The Ashen Throne: the eastern rim is one volcano. Black glass slopes,
> rivers of red lava, cinder fields, sulphur light, steam where lava meets
> the sea. The Legion's fortress is cut into the crater wall, black stone
> and brass, nine dragon skulls above its gate. Red-black sky, ember glow on
> every underside, ash falling.

**Wide shot, `_realm`**
> The Ashen Throne from above: a volcano filling the whole east, its slopes
> of black glass veined with red lava rivers falling into the sea in three
> falls, a wall of steam a mile long on the shore, a Legion harbour town of
> black sand and barges at the foot, ten thousand tents in siege lines on
> the slopes, a fortress cut into the crater wall with a gate a hundred feet
> high, a natural arch of black glass across the crater's mouth, the crater
> glowing.

**cinderport, Cinderport (town)**
> The Legion's harbour town at the volcano's foot: black sand, stone quays,
> barges with brass fittings, warehouses of black stone, a slave market
> under brass awnings, a citadel of black stone and brass with nine-skull
> banners above the town, ash on every roof, lava glow on the slopes behind.

**outerworks, the Outer Works (landmark)**
> The Legion army's lines on the slopes: earthworks, palisades, siege towers,
> ten thousand black tents in rows, brass standards, cook fires, roads of
> trodden cinder between, the fortress gate above them.

**ashengate, the Ashen Gate (megastructure)**
> A gate a hundred feet high cut into the crater wall, two black towers and
> a brass-bound lintel with nine dragon skulls set above it, braziers the
> size of houses either side, a road of black glass climbing to it, a
> single armoured figure at its foot.

**throneofash, the Throne of Ash (dungeon, boss Malachar the Wyrmking)**
> The fortress interior: black stone halls with brass, the crater floor
> open to a red sky, and the heart hall: a throne of black glass, nine iron
> cages on the wall behind it each holding a beating heart, the air moving
> like glass, a crowned figure in black armour with a dragon's bones for a
> crown.

**glassslopes, the Glass Slopes (open country)**
> Black glass slopes that ring underfoot, cracked, with lava rivers cutting
> through, cinder cones, sulphur vents, a wyvern on a crag, iron golems
> marching, a wraith leaving footprints of melted glass at dawn.

**cindercut, the Cinder Cut (mine)**
> The Legion's mine on the glass: a yard of black glass that rings when
> walked on, voidrock black and emberite orange in the cuts, chained miners,
> a great brass shift bell on a gantry, a manticore chained beneath it.

**steamingshore, the Steaming Shore (landmark)**
> Where the lava meets the sea: a wall of steam a mile long, lava hissing
> into the water, black sand, the wrecks of ships lost in the steam, drowned
> Legion soldiers walking out of it, red light through white steam.

**lavafalls, the Lava Falls (landmark)**
> Rivers of red dropping into the sea in three falls, crust cooling grey on
> the surface between them, cracks glowing, a crossing over the crust
> marked by stakes, steam rising, the fortress gate beyond.

**slagcamps, the Slag Camps (camp)**
> Deserters living in slag heaps below the works: fires in old furnaces,
> shelters of scrap and brass, ragged Legion coats, a chute in the slag
> leading up toward the fortress, ash falling.

**obsidianbridge, the Obsidian Bridge (landmark)**
> A natural arch of black glass across the crater's mouth, half a mile
> long, no rail, wyverns nesting under it, the crater glowing red below,
> the air over the bridge warped like glass.

**heartcages, the Heart Cages (landmark)**
> The wall behind the throne: nine iron cages, each holding a beating
> dragon's heart the size of a barrel, chains and pipes running from them
> into the floor, the throne in silhouette in front, red light pulsing.
