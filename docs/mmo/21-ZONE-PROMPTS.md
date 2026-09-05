# Zone prompts: one image per place, then the model list and the plan

Written 2026-09-06. The user's proposal, adopted: author each place from a
concept image instead of scattering a kit. The process:

1. Fable writes one prompt per place from `src/mmo/realms.js` and
   `docs/mmo/14-KALDERA.md`, with the shared style prefix below.
2. The user generates one image per place and files it as
   `docs/concepts/<place-id>.png` (the place ids are the ones in realms.js).
3. Fable reads the image and writes `docs/concepts/<place-id>.md` with the
   model list (kit ids where the kit already has the piece) and
   `src/mmo/plans/<place-id>.json`, the authored plan: every building, wall,
   path, tree line, lamp, prop, person and spawn with a position and a yaw,
   and where the player arrives.
4. The game's plan loader places the plan's models; a piece with no model yet
   is a code-built stand-in, so the place is playable before its art is done.
   Inside a planned place the random dressing is off.

## The style prefix (put in front of every prompt)

> Concept art for a stylised fantasy MMO in the manner of classic World of
> Warcraft zones: hand-painted textures, exaggerated silhouettes, saturated
> but earthy palette, painterly light, no photorealism. High three-quarter
> view from about 40 metres up looking down at 35 degrees so the layout can
> be read, the whole location in frame, a ring of mountains or hills closing
> the horizon, the realm's sky and weather. No text, no UI, no people in the
> foreground larger than a tenth of the frame. 16:9.

## The realm prefix for the Greenwold (after the style prefix)

> The Greenwold: gentle English farmland at the heart of the world. Wheat
> fields edged with hedgerows and dry stone walls, hay ricks, oak and beech
> copses, a slow river with a water mill, chalk hills showing white where the
> turf is thin, timber-framed and thatched buildings with flint footings,
> iron lanterns on the roads, a mile-wide ring of standing stones on the
> fields. Warm summer light, high soft clouds, a blue haze on the far hills.

## The nine places of the Greenwold

### hearthhome, the hub

> Hearthhome, a large walled village on a green. A low flint wall with two
> timber gate towers, a stone bridge over the river at the east gate. Inside:
> a village green with a roofed well at its centre and market stalls around
> it; a two-storey thatched inn with a swinging sign, the Bracken Arms; a
> smithy with a stone chimney smoking; a chapel with a square tower; a
> healer's cottage with herbs drying; a stable with pens; a stone bank with
> one door; a stone manor with a single tower at the back of the village
> above the roofs; cottages between. Lanes of packed earth, beds of flowers
> at the doors, a 4 m standing stone with a carved face at the edge of the
> green. Beyond the wall, wheat fields with scarecrows and hedgerows, and one
> of the great standing stones on the skyline.

### waystones, the Standing Hedge (megastructure)

> The Standing Hedge: nine tall grey sarsen stones, each 3 m high and carved
> with a single face, standing on a ring a mile across through wheat fields
> and hedgerows, with eighty smaller boundary stones between them. At dusk
> the nine hum with a faint amber light in the carved lines. One stone in the
> foreground with a worn path circling it and offerings at its foot; the ring
> curving away across the fields to the far stones on the horizon; a village
> inside the ring in the middle distance.

### millrun, the Mill Run (landmark)

> The Mill Run: a slow river running east through wheat, with a stone water
> mill and its turning wheel, a millpond with reeds and geese, three eel
> weirs of woven willow across the river, a plank footbridge, a ford with
> stepping stones, the miller's house and a granary, sacks on a cart, a lane
> with an iron lantern. Willows along the bank.

### oldcellars, the Old Cellars (dungeon mouth)

> The Old Cellars: the mouth of a brick vault under the mill's hill, older
> than the mill. A stone arch half sunk in the slope with a stair going down
> into the dark, brick vaulting visible inside, a lantern on a chain, the
> Legion's black and brass banner planted crooked beside the door, a broken
> cart, goblin footprints in the mud, rats. Wheat and the mill above.

### beechhangar, the Beech Hangar (open country)

> The Beech Hangar: an old beech wood on a chalk ridge above the village.
> Tall grey trunks, deep copper leaf litter, badger setts under the roots, a
> hollow way cut by centuries of feet, boar rootings in the litter, a fallen
> giant beech with fungus, dappled light. At the wood's edge the wheat
> begins. One very large boar's shape in the shadow, the size of a pony.

### kingsroad, the Kingsroad (road)

> The Kingsroad: the Legion's paved road entering the Greenwold from the
> north east, milestones every mile, a Legion camp of black tents and a brass
> standard beside it, a covered wagon with an iron strongbox and an escort of
> soldiers in black and brass with square shields, a signpost at a fork, iron
> lanterns, a stone bridge where it crosses a stream, hedgerows and wheat to
> either side.

### greenwoldpits, the Chalk Pits (mine)

> The Chalk Pits: a white chalk scar in a green hill, copper and tin seams
> showing green and grey in the cut, a trodden yard with a headframe and a
> winding wheel, an ore cart on rails, a foreman's hut, a spoil heap, picks
> and lanterns, two mine mouths braced with timber. Grass and wheat above the
> lip.

### highwaymanshollow, Highwayman's Hollow (camp)

> Highwayman's Hollow: a bandit camp in a chalk hollow under an overhang off
> the Kingsroad. Tents, a campfire, a stolen tithe cart under a tarp, a
> lookout post in a tree, stakes, loot sacks, a weapons rack, a target
> dummy, men in stolen coats around the fire, bones of a stolen sheep. The
> road visible below through the hedge.

### sunkenchapel, the Sunken Chapel (ruin)

> The Sunken Chapel: a small stone chapel the river took, standing in a
> flooded meadow with the water up to its roof beam, the bell still hanging in
> its open belfry above the water, the west door under the surface, water
> lilies, willows, a rotting boat, a drowned graveyard with headstones
> leaning out of the water. Blue evening fog, a skeleton in a sexton's coat
> standing in the shallows.

## The other realms

The same structure follows for the remaining 86 places, one section per
realm with its own realm prefix, once the Greenwold's nine have been run
and the process has been judged on them.
