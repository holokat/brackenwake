# The Greenwold's environmental sound, one prompt each

Written 2026-09-07. What the game has today is action sound only (bow, pickaxe,
axe, thunder, wolf howls, coins, fishing) and no ambience at all: no wind, no
birds, no water, no village. This is the list to make, each prompt under 1000
characters for a sound generator. File names are what audio.js should load;
"loop" means seamless, authored to loop at the length given; "one shot" plays on
a trigger or at random from a pool.

Format for every file: 48 kHz, mono for point sources (a wheel, a bell, a
forge), stereo for beds (wind, night field, rain). No music, no reverb tail on
loops, and nothing that reads as a melody: a bed the ear stops hearing.

## Beds, by place and time (stereo loops, 60 to 90 s)

- **amb-meadow-day.ogg** (loop, 90 s). Open English farmland on a warm summer day: a light breeze moving through long grass and wheat with a soft dry rustle, skylarks high and continuous, a distant wood pigeon, bees passing close now and then, a far off sheep once. No traffic, no people, no music. Even and unhurried, nothing that draws the ear; the sound a field makes when nobody is in it.
- **amb-meadow-night.ogg** (loop, 90 s). The same fields after dark: near silence with a low wind, crickets and grasshoppers steady, a tawny owl calling twice a minute far off, a fox bark once, the wheat stirring. Cold and open. No music, no drones, nothing that swells.
- **amb-wood-day.ogg** (loop, 90 s). Inside an old beech wood in daylight: wind in a high canopy as a slow surf of leaves, blackbird and robin and a wren close, a woodpecker drumming far off twice, a jay's screech once, a twig falling. The floor is quiet and the sound is all above you. No water, no music.
- **amb-wood-night.ogg** (loop, 90 s). The beech wood at night: a heavier wind in the canopy, an owl close and another answering far off, small things moving in leaf litter, a branch creak, a long quiet, a deer barking once. Unsettling but real; no drones, no music, no monster sounds.
- **amb-river-bank.ogg** (loop, 60 s). A slow lowland river from the bank: steady water moving over stones, a lapping edge, reeds brushing in wind, a moorhen's call, a fish rising once, a dragonfly passing. Gentle and continuous. No waterfall, no sea, no music.
- **amb-water-meadow.ogg** (loop, 90 s). Wet grassland by a river: frogs in chorus at a distance, reed warblers close, a heron's harsh croak once, wind through reeds, water trickling in a ditch, a snipe drumming far off. Damp and full of small life. No music.
- **amb-village-day.ogg** (loop, 90 s). A small medieval village green by day, heard from its middle: a smith's hammer on iron at a distance in a slow rhythm, hens, a dog barking twice far off, a cart on packed earth passing once, two voices talking too far to make out, a well rope creaking, sparrows in thatch, a child laughing once. Warm and lived in. No music, no crowd, no market shouting.
- **amb-village-night.ogg** (loop, 90 s). The same village after dark: near quiet, a shutter knocking in wind, a dog settling, an owl on the church, a lantern chain ticking, a door closing once far off, the river faint at the edge. No music.
- **amb-chalk-hill.ogg** (loop, 90 s). A bare chalk hilltop with the wind: a steady wind over short turf with gusts, skylarks, a kestrel's call once, sheep far below, a bumblebee passing, dry grass. Exposed and bright. No music.
- **amb-mere-dawn.ogg** (loop, 90 s). A still lake at first light with mist on it: water lapping very gently, a coot, ducks waking, a bittern's boom once far off, drips, a single bell chime once from under the water, very faint. Cold, still, slightly wrong. No music.
- **amb-mine-yard.ogg** (loop, 60 s). A chalk pit's yard at work: a pick on stone at a distance in a rhythm, a spoil cart's iron wheels on rails, a rope creaking on a winding wheel, a foreman's shout once, wind over the cut, a lantern's chain. Dusty and busy. No music.
- **amb-mine-inside.ogg** (loop, 60 s). Inside a chalk mine: drips into pooled water, a low hollow air movement, rock settling once, a rat scurry, a pick far off through the wall, your own space closing in. No monsters, no music.
- **amb-legion-camp.ogg** (loop, 60 s). A military camp on a road at evening: a fire crackling, canvas flapping, a whetstone on a blade in a slow rhythm, boots on gravel passing, a quiet order given once, a horse shifting and blowing, a brass buckle. Disciplined and tense. No battle, no music.
- **amb-bandit-camp.ogg** (loop, 60 s). An outlaw camp in a wooded hollow: a small fire, a bottle set down, low laughter once, a dice throw, a rope bridge creaking above, a lookout's whistle once, crows in the oaks. Careless and watchful at once. No music.
- **amb-rain-field.ogg** (loop, 60 s). Steady rain on open grass and leaves with no thunder: rain on wheat, on a tin trough, dripping from a hedge, wind gusts pushing the rain, a distant rumble once a minute at most. Grey and continuous. No music.
- **amb-rain-under-trees.ogg** (loop, 60 s). Rain heard from under a beech canopy: heavy drops from leaves, a steady hiss above, drips on the leaf floor, a trickle beginning. Sheltered, close. No thunder, no music.

## Point sources (mono loops, 20 to 40 s, played at the object)

- **src-mill-wheel.ogg** (loop, 30 s). A big wooden water wheel turning slowly: water pouring off the paddles into the race, the axle's low groan each turn, the wheel's timber creak, a sluice hiss behind. Heavy, wet, rhythmic, about one turn every four seconds. No voices, no music.
- **src-weir.ogg** (loop, 30 s). Water falling two metres over a stone weir into a pool: a full white rush, bubbles below, a steady roar that does not change. Mono, to be placed on the weir.
- **src-forge.ogg** (loop, 30 s). A village smithy: bellows breathing, coals roaring up and settling, a hammer on hot iron in threes with a pause, the hiss of a quench once, tongs set down. No talk, no music.
- **src-tavern-inside.ogg** (loop, 40 s). Inside a small country inn: a fire, cups set down, low talk of six people too muffled to understand, a laugh, a bench scraping, a door and a gust, a dog under a table. Warm. No music, no singing.
- **src-well.ogg** (loop, 20 s). A village well being used: a rope over a wooden roller, a bucket knocking the shaft on the way down, the splash far below, the winding back up, water sloshing. Slow.
- **src-hedge-stone-hum.ogg** (loop, 30 s). A standing stone that hums: a very low sustained tone with a slow beat in it, like a struck bell heard from inside the metal, a faint high harmonic that comes and goes, no rhythm. Felt more than heard. Should sit under other ambience without masking it.
- **src-sheep-flock.ogg** (loop, 40 s). A flock of sheep grazing close: tearing grass, bleats near and far, a bell on one of them, hooves on turf, a lamb. Nothing else.
- **src-hens.ogg** (loop, 30 s). Hens in a yard: clucking, scratching in dirt, a cockerel once, wings flapping, a pecked trough.
- **src-fire-camp.ogg** (loop, 30 s). A small wood fire outdoors: crackle, a pop, a log settling, wind pulling the flame. Close, mono.
- **src-reeds-wind.ogg** (loop, 30 s). Wind moving through a tall reed bed: a dry whispering hiss rising and falling with gusts, stems knocking. Mono.
- **src-beehive.ogg** (loop, 20 s). A straw bee skep at work: a dense warm drone of thousands of bees, single bees arriving and leaving close to the ear.
- **src-lantern-wind.ogg** (loop, 20 s). An iron lantern on a post in wind: the chain ticking, the flame guttering, the glass rattling once. Quiet.

## One shots (pools of three to five variants, mono)

- **os-church-bell.ogg** (one shot, 8 s). A single small church bell rung once at dusk, a bronze note with a long decay and the clapper's knock. For the village chapel at 18:00 and, muffled and wrong, from the sunken chapel at midnight.
- **os-crow-flock-lift.ogg** (one shot, 4 s). Twenty crows leaving a field at once: a burst of wings and cawing that fades as they climb.
- **os-owl-call.ogg** (one shot, 3 s, five variants). A tawny owl's hoot and a screech owl's cry, single calls at different distances.
- **os-fox-bark.ogg** (one shot, 2 s, three variants). A vixen's scream and a fox bark at night, far, near, and very near.
- **os-heron-croak.ogg** (one shot, 2 s). A grey heron's harsh single croak as it lifts, with two heavy wingbeats.
- **os-wind-gust.ogg** (one shot, 6 s, four variants). A single gust across grass and through a hedge, rising and dying, for layering over the beds.
- **os-distant-thunder.ogg** (one shot, 8 s, three variants). Thunder ten miles off: a long low rumble with no crack, to warn of rain a minute before it comes. The existing thunder files are the close strikes.
- **os-cart-pass.ogg** (one shot, 12 s). A horse and cart passing on packed earth: hooves, iron tyres, harness jingle, the driver's click, fading.
- **os-boar-snort.ogg** (one shot, 2 s, three variants). A boar's snort and grunt close in bracken, and a squeal.
- **os-badger-huff.ogg** (one shot, 2 s). A badger's chattering huff at its sett.
- **os-goose-alarm.ogg** (one shot, 4 s). Geese honking in alarm and a wing flap threat.
- **os-woodpecker.ogg** (one shot, 2 s). A great spotted woodpecker drumming once on a dead beech.
- **os-wheat-walk.ogg** (one shot, 3 s, four variants). Footsteps through standing wheat: stalks parting and brushing legs. Played per stride in a crop field.
- **os-splash-wade.ogg** (one shot, 2 s, four variants). A wading footstep in knee deep river water.
- **os-hedge-push.ogg** (one shot, 2 s, three variants). Pushing through a thick hedge: twigs, leaves, a snag.
- **os-gate-swing.ogg** (one shot, 3 s, two variants). A five bar wooden gate swinging and its latch dropping; a kissing gate's clack.
- **os-door-cottage.ogg** (one shot, 2 s, three variants). A cottage door opening and closing, a latch, a hinge.
- **os-mist-rise.ogg** (one shot, 10 s). For the mere at midnight: a slow breathy swell with a faint wet chime in it, no note, that rises and is gone. The wraith's arrival.

## Footsteps by ground (pools of six, mono, 0.5 s each)

- **step-grass**, **step-dirt-path**, **step-cobble**, **step-mud**, **step-gravel**, **step-sand-chalk**, **step-wood-plank**, **step-shallow-water**, **step-leaf-litter**. A single footstep of a leather boot on each surface, dry, close, six variants that differ enough not to machine gun. These map onto the ten paint words the terrain already carries.
