// The realms of Brackenwake and every place inside them, as data.
//
// This is the sheet the painted map, the zone table and the codex are all
// read from, so a place exists in one file and nowhere else. 14-KALDERA.md is
// the story of these places; this is their geography. Every realm has a hub,
// a mega structure you can see from the realm's edge, at least one dungeon,
// a way underground for ore, open country worth walking, and the encounters
// that live in it. `auditRealms()` fails at import when one is missing.
//
// Positions are metres from the world's centre, x east, z south, on the same
// 16 km square the engine already draws; the Caldera Sea is the middle.
// `ring` is the danger layout the spawn tables use: 0 the heart, 1 close, 2
// the kingdom's middle, 3 the rim. Biomes are the engine's own names.
//
// A place may carry a `mechanic`: the one rule that makes it a place and not
// a backdrop (a causeway that drowns at high tide, a bridge only lightning
// shows, a city that walks). The audit wants at least one per realm.

export const KINDS = ['hub', 'town', 'hamlet', 'landmark', 'megastructure', 'dungeon', 'mine', 'cave', 'ruin', 'shrine', 'camp', 'wild', 'sea', 'road'];

const p = (id, name, kind, geography, contains, opts = {}) => ({ id, name, kind, geography, contains, ...opts });

export const REALMS = [
  {
    id: 'greenwold', name: 'The Greenwold', ring: 0, danger: [1, 2],
    biome: 'meadow', x: 0, z: 0, r: 2200,
    line: 'Wheat to the horizon, a slow river, and a village that has never lost anything. Home.',
    geography: 'Rolling farmland in the western lee of the Caldera Sea: hedged fields, orchards, beech hangars on the low hills, one slow river with a mill on it running east into the sea. The safest ground in the world and the greenest.',
    mega: 'The Standing Hedge: a ring of boundary stones older than the village, each the height of a man, half a mile across, with the fields inside it. From the hills it reads as a ring drawn on the land.',
    places: [
      p('hearthhome', 'Hearthhome', 'hub', 'A village on a green with a stone bridge, a church, an inn and a smith, all inside the ring of stones.', 'Bram Haywood, Old Wynn Ashby, Pip, the Bracken Arms, the smith, the healer, the market; the Legion reaches here'),
      p('millrun', 'The Mill Run', 'landmark', 'The river, the water mill, and the wheat either side of it, running east to the sea.', 'Ivy Weir\'s mill, eel weirs, geese on the road, the Tithe Wagon crossing'),
      p('oldcellars', 'The Old Cellars', 'dungeon', 'Eight descending depths beneath the mill: flooded ossuaries, tombs and a buried cathedral.', 'The Legion\'s advance party: bandits and goblins; Sergeant Oram Blackhand guards the first depth with the stolen sack. Undead and giant wardens haunt the deeper vaults', { boss: 'Sergeant Oram Blackhand', levels: 8 }),
      p('beechhangar', 'The Beech Hangar', 'wild', 'Old beech on the ridge above the village, deep leaf litter, badger setts.', 'Old Grist the boar, foraging, the first wolves after dark'),
      p('kingsroad', 'The Kingsroad', 'road', 'The Legion\'s paved road entering the Greenwold from the north east, milestones every mile.', 'Legion patrols, the Tithe Wagon, Captain Serle Vane\'s first camp'),
      p('greenwoldpits', 'The Chalk Pits', 'mine', 'A white scar in a green hill, copper and tin in the chalk, a yard trodden flat.', 'Copper and tin seams, a foreman who sells pickaxes, rats in the old cuts'),
      p('waystones', 'The Standing Hedge', 'megastructure', 'The ring of boundary stones half a mile across; nine of them hum at dusk, each twinned with a stone in another realm.', 'Fast travel between stones you have touched; the Legion cannot use them', { mechanic: 'Touch a stone and it is yours; from then on any waystone carries you to any other you own, once a day per stone. The Legion has tried for a century and been refused.' }),
      p('highwaymanshollow', 'Highwayman\'s Hollow', 'camp', 'A bandit camp in a chalk hollow off the Kingsroad, fires under an overhang.', 'The Miller\'s Son and his six, a stolen tithe, a bounty board in Hearthhome for each of them by name', { mechanic: 'The camp moves to one of three hollows after every raid; tracks on the Kingsroad the morning after say which. Talk your way past with the mill\'s name, or fight.' }),
      p('sunkenchapel', 'The Sunken Chapel', 'ruin', 'A chapel the river took, its roof a foot under the water, the bell still on the beam.', 'Swim in through the west door; a drowned congregation that wakes if the bell is rung; the first Skeleton Sexton', { mechanic: 'Ring the bell under water and the dead sit up for one minute and give up what they were buried with; ring it twice and they do not sit back down.' }),
    ],
    encounters: ['Old Grist, a boar the size of a pony', 'The Tithe Wagon, a Legion convoy every third day', 'The Fox That Is Not, a wolf that walks like a fox at dusk', 'Legion scouts in pairs on the Kingsroad'],
  },
  {
    id: 'verdant', name: 'Verdant Deep', ring: 1, danger: [1, 2],
    biome: 'sakura', x: 1144, z: 3283, r: 2000,
    line: 'Blossom falling on a river the trees have swallowed, and a court that never comes down.',
    geography: 'A jungle of flowering giants on the southern shore: sakura canopy over old-forest trunks a hundred feet high, a river braided under roots, cliffs of dark stone with faces cut in them, rope bridges and platforms in the crowns. Wet, loud with birds, nothing straight.',
    mega: 'The Temple of Faces: a cliff a quarter mile long with a hundred faces carved into it, each the height of a house, vines over every mouth. The first Dragonsworn, and one of them is Malachar, young.',
    places: [
      p('canopycourt', 'The Canopy Court', 'hub', 'A village of platforms and rope bridges two hundred feet up in the blossom crowns, lit by lanterns at night.', 'Speaker Ilthenar, Saelith Thornwake, the elven market, archery and tracking training, the Court\'s dark bargain'),
      p('templeoffaces', 'The Temple of Faces', 'megastructure', 'The carved cliff and the temple cut behind it, entered through the mouth of the largest face.', 'Brother Tomas among the faces; the dungeon behind them', { dungeon: 'templeoffaces_deep' }),
      p('templeoffaces_deep', 'The Deep of Faces', 'dungeon', 'Galleries behind the cliff where the first riders learned the sight, walls of eyes.', 'Spiders, Legion cultists, the Keeper of Faces; your face added to the cliff', { boss: 'The Keeper of Faces', levels: 2 }),
      p('blossomfall', 'Blossom Fall', 'wild', 'The valley floor where the whole canopy sheds at dawn and the river runs pink for an hour.', 'Mother Web\'s hunting ground, the Blossom Fall event where everything hidden shows'),
      p('rootriver', 'The Root River', 'wild', 'The river braided under the trees, fordable at three places, alive with fish.', 'Fishing, giant spiders at the fords, the Legion\'s Purse buying elders at the lower ford'),
      p('sunkenshrine', 'The Sunken Shrine', 'shrine', 'A dragon shrine half under the river where the roots have lifted the stones.', 'Offerings under clear water, the first true-name rumour'),
      p('verditehollow', 'Verdite Hollow', 'mine', 'A cave under the cliff where the roots have gone green-gold.', 'Verdite in the wall, iron, thorn grubs'),
      p('hanginggardens', 'The Hanging Gardens', 'landmark', 'Terraces of the old temple grown into the cliff face, reached by climbing roots and rope, a hundred feet of vertical garden.', 'Rare forage on every terrace, a harpy roost at the top, a view of the whole Deep', { mechanic: 'Climbing: roots are handholds, and a wet root after rain gives way. Fall damage applies.' }),
      p('moonpool', 'The Moon Pool', 'landmark', 'A still pool under the canopy that shows no reflection by day.', 'By moonlight the water shows the true shape of anything held over it: an unidentified item, a cultist in Court robes, a face', { mechanic: 'Identify without a scroll, one item a night, and a spy in the Court can be unmasked here, which decides the Speaker.' }),
      p('spiderwells', 'The Spider Wells', 'cave', 'Sinkholes in the jungle floor webbed over, a cave maze beneath joined by silk bridges.', 'Giant spiders, silk to harvest for the tailor, Mother Web\'s brood', { mechanic: 'Silk bridges bear your weight; cut a bridge behind you and what is chasing falls.' }),
    ],
    encounters: ['Mother Web, the Blossom Mother, a spider the size of a cart', 'The Blossom Fall, dawn, everything hidden visible for a minute', 'The Legion\'s Purse, a captain in Court robes', 'Harpies nesting above the Court'],
  },
  {
    id: 'saltmarch', name: 'The Saltmarch and the Thousand Isles', ring: 1, danger: [2, 2],
    biome: 'fen', x: 4800, z: 2600, r: 2200,
    line: 'Reed marsh to the horizon, then a thousand islands, each with one tree and one wreck.',
    geography: 'Two lands in one realm. Inland, a fen: knee-deep water, sedge to the shoulder, eel weirs, will-o\'-wisps. Seaward, an archipelago: a thousand islets of sand, palm and coral running out into the Caldera Sea, channels between them, the first open water you sail.',
    mega: 'The Red Queen\'s Harbour: a pirate city built across a dozen islets and the wrecks between them, joined by planked bridges and chains, its lighthouse a ship\'s mast a hundred feet tall with a fire in the crow\'s nest.',
    places: [
      p('redqueensharbour', 'The Red Queen\'s Harbour', 'megastructure', 'The pirate republic\'s capital across a dozen islets, chain bridges, a mast lighthouse.', 'Queen Maravel, Grey Tancred\'s barge fleet at anchor, the boat you are given, sailing and fishing training, salvage market'),
      p('drownedmill', 'The Drowned Mill', 'hub', 'A stilt-house on an old mill in the fen, the wheel standing in dry sedge.', 'Aldo Reeve and the eel family, the safe paths through the sedge, Long Sarah fed monthly'),
      p('sedgesea', 'The Sedge Sea', 'wild', 'The open fen, sedge and standing water, wisps at night.', 'Bog crawlers, ghouls, Long Sarah, the Eel-Man checking his traps'),
      p('leviathansrest', 'The Leviathan\'s Rest', 'dungeon', 'A sea cave under the largest isle where the last sea-wyrm lies, tide-filled.', 'Crabs, drowned, a mire troll, Thalassa the Sea-Wyrm', { boss: 'Thalassa the Sea-Wyrm', levels: 2 }),
      p('thousandisles', 'The Thousand Isles', 'sea', 'The archipelago itself, sailed not walked, channels, shoals, wrecks on every reef.', 'The Red Sail race, the Ghost Tide on moonless nights, the Stack-Queen\'s rock, kraken shoals'),
      p('wreckward', 'Wreck Ward', 'ruin', 'A graveyard of ships driven onto one reef over three centuries, hulls stacked into a maze.', 'Salvage, drowned crews, Little Sorrow walking the tide line'),
      p('saltcut', 'The Salt Cut', 'mine', 'A cut in the largest isle\'s cliff, iron and silver, the yard washed at every high tide.', 'Iron and silver, crabs in the cuts'),
      p('tidewalk', 'The Tidewalk', 'road', 'A drowned causeway from the fen to the first isle, dry for an hour either side of low tide.', 'Crabs on the stones, drowned in the pools, the only way to the Harbour without a boat', { mechanic: 'The tide clock is real: on the causeway when the sea comes in you swim or you drown, and the drowned rise with the water.' }),
      p('smugglerscays', 'Smugglers\' Cays', 'camp', 'Three islets with caves at the waterline, boats hidden under nets.', 'A pirate crew that has broken with Maravel, contraband, a fence for anything', { mechanic: 'They fly Maravel\'s colours to strangers; the Red Queen pays for their heads or for their silence, and the player chooses which trade to run.' }),
      p('wisplanterns', 'The Wisp Lanterns', 'wild', 'The deep fen at night, lit by will-o\'-wisps that move as you move.', 'Wisps that lead to drowned treasure or to a bog crawler, and no way to tell which', { mechanic: 'Follow a wisp and it leads true one time in three; the eel family sell a lantern that shows which colour lies.' }),
      p('krakenshoals', 'The Kraken\'s Shoals', 'sea', 'Shallows between the outer isles where the water goes black without warning.', 'The kraken, once, if you anchor there at night; the best pearls in the isles', { mechanic: 'Anchoring is a choice: pearls by day, the kraken by night, and a boat it takes is a boat you replace at the Harbour.' }),
    ],
    encounters: ['Long Sarah, a bog crawler grown beyond its kind', 'The Ghost Tide: the drowned of the Sunken Kingdom board anchored boats', 'The Red Sail, Maravel\'s ship, a race for charts', 'Little Sorrow, a drowned girl who leads boats onto rocks'],
  },
  {
    id: 'emberwastes', name: 'Ember Wastes', ring: 2, danger: [3, 3],
    biome: 'desert', x: 5400, z: -3200, r: 2100,
    line: 'Red rock, white sand, a road of glass, and a city that walks.',
    geography: 'Desert on the north eastern shore: red rock mesas, white dunes, salt pans, a sun too big. A line of fused glass runs across it from the south west to the north east, where the nine hearts were dragged. At its centre the Firstfire Crater, a bowl a mile wide with walls of black glass.',
    mega: 'The Brass City: the Legion\'s foundry, a city on legs the height of towers that walks the Wastes on a circuit of the wells, kneeling to drink. Smoke from a hundred stacks, its door open only when it kneels.',
    places: [
      p('lastwell', 'The Last Well', 'hub', 'The Ashwalkers\' camp around the one sweet well, tents and a market that moves with the season.', 'Nadira of the Long Walk, Sister Halessa, Cai Blister, emberite trading, mining training'),
      p('brasscity', 'The Brass City', 'megastructure', 'The walking foundry, a moving dungeon whose door opens when it kneels at a well.', 'Foreman Isk, Legion engineers, the second heart; a dungeon that is somewhere different each day', { dungeon: 'brasscity_works' }),
      p('brasscity_works', 'The Brass Works', 'dungeon', 'The city\'s insides: forges, walkways over furnaces, the engine room.', 'Iron golems, cultists, the Brass Heart if Isk is stopped, emberite by the ton', { boss: 'The Brass Heart', levels: 3 }),
      p('firstfire', 'The Firstfire Crater', 'dungeon', 'The crater where the pact was made, a Legion foundry cut into its wall and the throat beneath.', 'Cyclops, cultists, iron golems; the walls light for the first time in a thousand years', { boss: 'The Brass Heart (if not turned)', levels: 2 }),
      p('glassroad', 'The Glass Road', 'road', 'The line of fused sand running to Cinderreach, hot at noon, mirage over it.', 'Weekly Legion convoys of emberite, Noon the manticore on his rock'),
      p('saltpans', 'The Salt Pans', 'wild', 'White flats that blind at noon and freeze at night, bones of caravans.', 'Manticores, giant spiders, sandstorm events, the Ashwalker waystones'),
      p('embercut', 'The Ember Cut', 'mine', 'Four cuts in red rock, warm to the hand, rails warped by heat.', 'Iron and emberite, the Sledge-Master at the fused floor'),
      p('cultistcamp', 'The Recruiter\'s Tents', 'camp', 'Clean tents in a filthy country at the Wastes\' western edge.', 'Selwyn\'s successor, the Legion\'s recruiters, the mark offered'),
      p('miragepalace', 'The Mirage Palace', 'landmark', 'A palace of white towers on the horizon that is never there when you arrive.', 'Real for one hour at noon from one spot on the Glass Road; inside, the library of the Wastes\' first people and their water', { mechanic: 'Stand on the marked flagstone at noon and walk toward it and the mirage holds; leave the path and you are in open sand a mile from where you were.' }),
      p('buriedlibrary', 'The Buried Library', 'dungeon', 'A tower of the old people buried to its roof in sand, dug into from the top.', 'Sand that pours in behind you, scrolls the cultists want, a cyclops that was its keeper', { mechanic: 'Every room you enter fills to the knee with sand over a minute; the way out is the way you came, faster.', boss: 'The Librarian', levels: 2 }),
      p('banditridge', 'Bandit Ridge', 'camp', 'A red mesa with caves in its face, ropes and ladders, raiders who prey on the Legion convoys.', 'The Ridge Riders, who hate the Legion more than they hate you; horses; a hidden way into the Brass City', { mechanic: 'Rob a convoy with them and they are allies at the Throne; rob them and the Legion pays you and remembers.' }),
      p('singingdunes', 'The Singing Dunes', 'wild', 'Dunes that hum in the wind, a different note for each.', 'Sandworm signs, giant spiders, the note that means one is under you', { mechanic: 'The dunes\' song drops a tone when something large moves beneath you; stand still and it passes.' }),
    ],
    encounters: ['Noon, a manticore that hunts only at midday', 'The Glass Road convoy, weekly', 'The Brass City walking, a moving dungeon', 'Sandstorms that hide the salt pans and what hunts in them'],
  },
  {
    id: 'stormpeaks', name: 'The Stormpeaks', ring: 2, danger: [3, 4],
    biome: 'mountain', x: 1123, z: -4190, r: 2100,
    line: 'Highland moor into storm-struck mountains, and the riders\' hall on the peak that takes the lightning.',
    geography: 'Highlands on the north shore: heather moor climbing into granite peaks, black lochs, scree, weather crossing in walls. The tops are in cloud half the day and lightning strikes the highest peak three times an hour.',
    mega: 'The Eyrie: the dragonriders\' hall cut into the lightning peak, its landing steps a hundred feet wide built for things that flew, a roost of nine stone perches around it, ghosts on every one.',
    places: [
      p('cairnfoot', 'Cairnfoot', 'hub', 'A highland village of stone and turf at the mountains\' foot, sheep and a brewhouse.', 'Kestrel, the highlanders, the Cairn Road\'s start, climbing gear, mountaineering rumours'),
      p('cairnroad', 'The Cairn Road', 'road', 'The path to the Eyrie, a cairn for every fallen rider, speaking when the storm is near.', 'Rider cairns, the Wall of Weather event, ogres of the Legion\'s mountain corps'),
      p('legionpass', 'The Legion Pass', 'camp', 'The Legion\'s mountain fort in the only pass, palisade and towers.', 'Captain Serle Vane in command, Warden Hask\'s ogres, the favour from the Greenwold'),
      p('eyrie', 'The Eyrie', 'megastructure', 'The riders\' hall on the peak, the landing steps, nine stone perches, ghosts keeping watch.', 'Marshal Eowen Skyward\'s ghost, the last Dragonsworn, the old rider oath; the Roost beneath', { dungeon: 'eyrieroost' }),
      p('eyrieroost', 'The Eyrie\'s Roost', 'dungeon', 'Three levels cut into the peak down to the mounting stair.', 'Ogres, iron golems, wyverns, Warden Hask who cannot pass the ghosts', { boss: 'Warden Hask', levels: 3 }),
      p('blacklochs', 'The Black Lochs', 'wild', 'Three lochs in the high glens, cold, deep, a drowned rider hall under the largest.', 'Fishing, wyverns, Skreel the storm wyvern\'s peak above'),
      p('thundershaft', 'The Thunder Shaft', 'mine', 'A mine driven into the lightning peak\'s side, silver and coldiron, humming in a storm.', 'Silver and coldiron, iron golems the kingdom left'),
      p('skybridge', 'The Sky Bridge', 'landmark', 'A rope bridge across a chasm a thousand feet deep, invisible in cloud.', 'The only crossing to the Eyrie\'s side without the Legion Pass', { mechanic: 'In the storm each lightning flash shows the bridge for a second; walk in the dark between flashes and you walk off it. After the wings, you fly it.' }),
      p('stormanvil', 'The Storm Anvil', 'landmark', 'An iron anvil on the highest bare rock, struck by lightning every storm.', 'Rimesteel and coldiron can be worked here and nowhere else in the realm', { mechanic: 'Put a blank on the anvil and wait for the strike; the forge is the storm, and standing beside it during the strike is a choice.' }),
      p('echochasm', 'The Echo Chasm', 'wild', 'A gorge where a shout comes back nine times and brings the scree down.', 'Ogre camps on the ledges, a rider\'s tomb in the wall', { mechanic: 'Every ability that shouts (Battle Cry, War Drum, Provoke) drops rock on whatever is under the ledge: use it, or lose your footing to it.' }),
      p('drownedhall', 'The Drowned Rider Hall', 'ruin', 'A riders\' hall under the largest of the Black Lochs, its roof forty feet down.', 'Rider relics, the drowned of the Eyrie\'s fall, a saddle that fits a dragon', { mechanic: 'A dive on one breath before the Deep is taken; the loch is cold enough to bar swimming below Swimming 40.' }),
    ],
    encounters: ['Skreel, a storm wyvern that rides the lightning', 'The Wall of Weather, a storm every hour on the tops', 'The Stone Shepherd, an ogre with a flock of stoneback bears', 'Legion mountain patrols in the pass'],
  },
  {
    id: 'boneyard', name: 'The Boneyard', ring: 2, danger: [3, 4],
    biome: 'graveyard', x: -4250, z: 1202, r: 2100,
    line: 'A grey plain where nine dragons fell, and a lodge with lights in the eye sockets.',
    geography: 'An ash plain on the western shore where nothing grows: grey dust to the horizon, and out of it the skeletons of nine dragons, each the size of a hill, ribs like cathedral vaults. Wind lifts the ash into storms. Riders\' tombs at the plain\'s edge, opened.',
    mega: 'The Skull Lodge: the Wyrmking\'s hunting lodge built inside the largest skull, three storeys of timber behind the teeth, lanterns in the eye sockets seen for ten miles.',
    places: [
      p('ninefall', 'Ninefall', 'landmark', 'The nine skeletons in a rough ring, each with a name cut into a rib by its rider.', 'Ghost-Rider Corvane at the mother\'s bones, the true name, the Bone Wind event, the Counting Wraith'),
      p('skulllodge', 'The Skull Lodge', 'megastructure', 'The hunting lodge inside the largest skull, lights in the eyes.', 'Huntmaster Gallow, Malachar seen once across the ash, the trophy hall beneath', { dungeon: 'skulllodge_throat' }),
      p('skulllodge_throat', 'The Trophy Throat', 'dungeon', 'Down the skull\'s throat into the neck bones, trophies on every vertebra.', 'Bone knights, wraiths, vampire knights, Gallow\'s hounds; Huntmaster Gallow', { boss: 'Huntmaster Gallow', levels: 2 }),
      p('ridersrest', 'Riders\' Rest', 'hamlet', 'A tomb-keeper\'s hamlet at the plain\'s edge, the only living people, who bury what the wind uncovers.', 'Tomb keepers, bone trade, necromancy rumours, the one inn on the plain'),
      p('ridertombs', 'The Rider Tombs', 'ruin', 'Barrows of the nine riders along the plain\'s edge, every one opened.', 'Bone knights who kept their minds, rider relics, the Counting Wraith\'s round'),
      p('ashsea', 'The Ash Sea', 'wild', 'The open plain, ash to the knee in places, storms that stand the dead dragons up for a minute.', 'Wraiths, ghouls, the Bone Wind, Gallow\'s hounds, werewolves that were riders'),
      p('marrowmine', 'The Marrow Mine', 'mine', 'A mine driven into a dragon\'s thighbone, the ore grown in the marrow.', 'Voidrock and coldiron, the only bone-borne ore in the world'),
      p('ribcathedral', 'The Rib Cathedral', 'megastructure', 'The largest dragon\'s ribcage, each rib a vault a hundred feet high, the wind playing it like pipes.', 'The dead riders gather here at midnight and stand in rows; the Bone Wind starts here', { mechanic: 'Each rib sounds a note in the wind; sound the nine in the order the riders died and the Counting Wraith stops counting and answers a question.' }),
      p('hunterscamps', 'Gallow\'s Outriders', 'camp', 'Hunting camps of the Skull Lodge on the plain, hides drying, cages.', 'Gallow\'s huntsmen, caged beasts to free, a hound master', { mechanic: 'Free a caged beast and it fights with you for the realm; the huntsmen track you across the ash by your footprints until the Bone Wind wipes them.' }),
      p('boneorchard', 'The Bone Orchard', 'wild', 'Where the dragons\' blood soaked in, a grove of bone-white trees that grow nowhere else.', 'Ironbark logs, wraiths that live in the trees, forage no alchemist has named', { mechanic: 'Fell a bone tree and the wraith in it is loosed; leave the axe and take the fruit and it lets you.' }),
    ],
    encounters: ['The Counting Wraith, which counts to nine each night', 'The Bone Wind, daily, the dead dragons stand in the ash', 'Gallow\'s Hounds, a werewolf pack', 'Malachar, once, across the plain, no fight'],
  },
  {
    id: 'frostreach', name: 'Frostreach', ring: 3, danger: [4, 4],
    biome: 'snow', x: -1909, z: -4967, r: 2200,
    line: 'Snow to the waterline, a glacier with a fortress in it, and a dragon frozen mid-breath.',
    geography: 'The north western rim: glaciers running to the sea, black pine under white, frozen fjords, a fortress frozen into the ice a thousand years ago. The cold is a bar; fire is life. The Long Night falls one day in seven.',
    mega: 'The Ice Vault: a glacier three hundred feet high with a dragon visible inside it, curled around a fortress, frozen mid-breath, lit blue from within at night by the giants\' fires.',
    places: [
      p('coldseat', 'Coldseat', 'hub', 'The frost giants\' hall at the glacier\'s mouth, a roof of whale ribs, fires big as houses.', 'Thane Ulfra Coldseat on the shaft, Brenna\'s forge, rimesteel smithing, Legate Ossory\'s camp below'),
      p('icevault', 'The Ice Vault', 'megastructure', 'The glacier with the fortress and the tenth dragon inside it, the Legion cutting toward her.', 'Vaelith the Frost; the Vault beneath', { dungeon: 'icevault_deep' }),
      p('icevault_deep', 'The Vault Below', 'dungeon', 'Down the Legion\'s cutting through the glacier to the frozen dragon.', 'Dire wolves, frost giants gone wrong, Legion sappers, Legate Ossory in rimesteel plate', { boss: 'Legate Ossory', levels: 3 }),
      p('whitepines', 'The White Pines', 'wild', 'Black pine forest under snow, the White Pack\'s ground, tracks everywhere.', 'Rimemouth and the White Pack, the full-moon challenge, frost giants\' herds'),
      p('frozenfleet', 'The Frozen Fleet', 'ruin', 'A Legion barge fleet caught in the fjord ice a century ago, crews still aboard.', 'Drowned and skeleton crews, Legion relics, a frozen admiral'),
      p('rimecut', 'The Rime Cut', 'mine', 'Mouths that breathe cold, a yard that has never thawed.', 'Coldiron and rimesteel, the giants\' miners'),
      p('longnightcamp', 'The Long Night Camp', 'camp', 'A giants\' outpost that lights the glacier from inside on the day the sun does not rise.', 'The Long Night event, giant hospitality, Skarn\'s footprints'),
      p('aurorashelf', 'The Aurora Shelf', 'landmark', 'A glacier shelf a mile wide, blank white by day.', 'On the Long Night the aurora lights a path across it to a giants\' cache; by day the shelf is crevasses', { mechanic: 'Cross it only under the aurora, on the lit path, in the one night in seven; the crevasses under the dark ice take you otherwise.' }),
      p('icefall', 'Icefall', 'cave', 'A cave behind a frozen waterfall, blue light, the water still moving under the ice.', 'Rimesteel in the walls, an ice troll, a frozen Legion sapper crew', { mechanic: 'Fire melts the way in and the way out both; without a torch the entrance refreezes behind you in ten minutes.' }),
      p('hotsprings', 'The Hot Springs', 'landmark', 'Steaming pools in the pine under the glacier, the only warm ground in the realm.', 'Rest, the cold bar reset, giants bathing who will talk, a hidden way to the Vault', { mechanic: 'Warmth is a resource in Frostreach; the springs refill it in the open.' }),
      p('mammothsteppe', 'The Mammoth Steppe', 'wild', 'Open tundra where the giants\' herds graze, mammoth and musk ox.', 'Hunting, hides the tailor has never seen, the White Pack\'s raids on the herds', { mechanic: 'Herds stampede at fire; a stampede goes through a Legion camp as well as through you.' }),
    ],
    encounters: ['Rimemouth and the White Pack', 'The Long Night, one day in seven', 'Skarn, a frost giant gone wrong, Ulfra\'s brother', 'Legion sappers on the ice'],
  },
  {
    id: 'sunkenkingdom', name: 'The Sunken Kingdom', ring: 3, danger: [4, 5],
    biome: 'ocean', x: 4100, z: -400, r: 1500,
    line: 'A city under clear water, lit from the sea floor, and a king walking up a stair every night.',
    geography: 'The Caldera Sea itself: flat, clear, warm, and under it a drowned city of white marble, towers, avenues, a coliseum, a palace, all visible from a boat. Reefs where the tallest towers break the surface. Sailed above, walked below once the deep is taken.',
    mega: 'The Drowned Coliseum: an arena the size of a hill on the sea floor, lit from below by the glow, where the drowned fight on the full moon and a living champion may enter.',
    places: [
      p('reefstair', 'The Reef Stair', 'landmark', 'Stone steps climbing out of the sea onto a reef, the king\'s nightly round.', 'King Caradoc the Drowned at dusk, Pearl\'s dive camp, the Harbourmaster checking boats'),
      p('drownedpalace', 'The Drowned Palace', 'dungeon', 'The king\'s own, entirely under water, air pockets as rooms.', 'Drowned, vampire knights of the old court, the guardian Bone Dragon; King Caradoc if lied to', { boss: 'King Caradoc the Drowned', levels: 3 }),
      p('coliseum', 'The Drowned Coliseum', 'megastructure', 'The arena on the sea floor, lit by the glow, full on the full moon.', 'The Coliseum event, a champion\'s pearl the hard way'),
      p('theglow', 'The Glow', 'landmark', 'The thing on the sea floor that turns and lights the city: the sea-wyrms\' egg chamber, empty.', 'The source of every light in the kingdom, Thalassa\'s kin remembered'),
      p('avenues', 'The Avenues', 'wild', 'The drowned streets, fish moving down them, shops with doors open.', 'Salvage, drowned patrols, the Harbourmaster\'s register'),
      p('pearlreef', 'Pearl Reef', 'hamlet', 'Pearl\'s camp on the reef where the towers break the surface, boats and drying nets.', 'Pearl, swimming to the cap, salvage, Tancred watching from the far shore'),
      p('pearlbeds', 'The Pearl Beds', 'mine', 'Oyster beds on the reef and a drowned mine under them where the kingdom took its stone.', 'Pearls, silver, coral, drowned miners'),
      p('airgardens', 'The Air Gardens', 'landmark', 'Palace terraces where the drowned kept air in domes of glass, still holding, gardens still alive inside.', 'Breath and rest under the sea, forage that has grown for three thousand years, the king\'s own roses', { mechanic: 'Air runs out in a dome once it is opened; each is one visit, and the roses are once in the world.' }),
      p('drownedbell', 'The Drowned Bell Tower', 'megastructure', 'The tallest tower, its bell chamber at the surface on the lowest tide.', 'The Bell Under the Water; ring it and the drowned come, or go', { mechanic: 'One ring calls the Ghost Tide to you, wherever you are on the sea; two rings send it back down for the night. The rope is at the surface for an hour.' }),
      p('whaleroad', 'The Whale Road', 'sea', 'A channel where the great whales cross the Caldera Sea each dawn.', 'Whales that let a boat ride their wake across the sea in minutes; the kraken that follows them', { mechanic: 'Fast passage across the whole sea at dawn for a boat that keeps pace; miss the turn and the whale dives with your bow rope.' }),
    ],
    encounters: ['The Ghost Tide rising from here', 'The Coliseum on the full moon', 'The Harbourmaster, who knows every sunk ship\'s name', 'The Bell Under the Water at low tide'],
  },
  {
    id: 'ashenthrone', name: 'The Ashen Throne', ring: 3, danger: [5, 5],
    biome: 'crater', x: 6699, z: -159, r: 1700,
    line: 'A volcano that is the whole eastern rim, and a fortress with nine dragon skulls on its gate.',
    geography: 'The eastern rim is one volcano: black glass slopes, rivers of red, cinder fields, sulphur light, the sea steaming where lava meets it. The Legion\'s fortress is cut into the crater wall; the throne room is inside the crater.',
    mega: 'The Ashen Throne itself: a fortress cut into the volcano\'s wall, a gate a hundred feet high with nine dragon skulls set above it, and inside, a throne room where the air moves like glass and nine hearts beat in nine iron cages.',
    places: [
      p('cinderport', 'Cinderport', 'town', 'The Legion\'s harbour town at the volcano\'s foot, black sand, barges, a slave market that is not called one.', 'Legion quartermasters, deserters who will talk, Halessa\'s last stand if she lived, the way to the outer works'),
      p('outerworks', 'The Outer Works', 'landmark', 'The Legion army\'s lines on the slopes: earthworks, siege towers, ten thousand tents.', 'The last battle: every ally you earned against the Legion; Tancred\'s or Ossory\'s wall'),
      p('ashengate', 'The Ashen Gate', 'megastructure', 'The gate with nine skulls, opened from inside by Serle Vane or not at all.', 'Captain Serle Vane, glove off; the fortress beyond', { dungeon: 'throneofash' }),
      p('throneofash', 'The Throne of Ash', 'dungeon', 'The fortress, the crater, the heart-hall.', 'The Legion\'s best, bone knights, the Brass Heart if not turned, Malachar in three phases; the three endings', { boss: 'Malachar, the Wyrmking', levels: 3 }),
      p('glassslopes', 'The Glass Slopes', 'wild', 'Black glass that rings underfoot, lava rivers, cinder, sulphur.', 'Wyverns, iron golems, cultists, the Glass-Walker wraith at dawn'),
      p('cindercut', 'The Cinder Cut', 'mine', 'The Legion\'s voidrock mine on the glass, a yard that rings when you walk on it.', 'Emberite and voidrock, miners who die by forty, the shift bell and the manticore that answers it'),
      p('steamingshore', 'The Steaming Shore', 'landmark', 'Where the lava meets the Caldera Sea, a wall of steam a mile long.', 'Ships lost in the steam, drowned Legion, the way Maravel\'s fleet comes in'),
      p('lavafalls', 'The Lava Falls', 'landmark', 'Rivers of red dropping into the sea in three falls, crust cooling on the surface between.', 'The only crossing from Cinderport to the Gate that is not the Legion\'s road', { mechanic: 'The crust bears weight while it is dark and breaks when it glows; watch the colour and cross in the dark stretches. Wings cross it in one flight.' }),
      p('slagcamps', 'The Slag Camps', 'camp', 'Deserters from the Legion living in the slag heaps below the Works, fires in old furnaces.', 'Deserters who know the fortress, a way in through the slag chute, Halessa\'s record if she died', { mechanic: 'Every deserter you feed is one fewer on the Legion\'s wall and one more who opens a door; the camps fill from the fortress as the Legion\'s morale falls.' }),
      p('obsidianbridge', 'The Obsidian Bridge', 'landmark', 'A natural arch of black glass across the crater\'s mouth, half a mile long, no rail.', 'The Wyrmking\'s own way to the Boneyard hunts; wyverns nest under it', { mechanic: 'Stolen dragon time: near the throne the world already runs slow for everything but Malachar; on the bridge you feel it first.' }),
      p('heartcages', 'The Heart Cages', 'landmark', 'The wall behind the throne, nine iron cages, nine hearts beating.', 'The ending: free them, break them, or let Malachar keep them', { mechanic: 'Each cage opens to a roar from a dragon that holds that realm\'s old oath; nine hearts, nine cages, and Malachar counting.' }),
    ],
    encounters: ['The Glass-Walker, a wraith leaving footprints of melted glass', 'The Cinder Cut\'s Bell, a manticore trained to the shift bell', 'Legion patrols in strength', 'Malachar, in the throne room, three phases'],
  },
];

export const REALM_BY_ID = Object.fromEntries(REALMS.map((r) => [r.id, r]));
export const REALM_COUNT = REALMS.length;

/** Every place in the world, flattened, each carrying its realm id. */
export const PLACES = REALMS.flatMap((r) => r.places.map((pl) => ({ ...pl, realm: r.id })));

/**
 * The world's promises: nine realms; each has a hub, a mega structure, a
 * dungeon with a boss, a mine, open country and at least three encounters; no
 * two places share an id; every dungeon a mega structure names exists; every
 * place kind is a known kind; no em dashes in any sentence.
 */
export function auditRealms(list = REALMS) {
  const bad = [];
  const ids = new Set();
  if (list.length !== 9) bad.push(`${list.length} realms, not nine`);
  for (const r of list) {
    const kinds = r.places.map((pl) => pl.kind);
    if (!kinds.includes('hub') && !kinds.includes('town') && !kinds.includes('hamlet')) bad.push(`${r.id}: nowhere to sleep, no hub, town or hamlet`);
    if (!r.places.some((pl) => pl.mechanic)) bad.push(`${r.id}: no place with a mechanic of its own`);
    if (!kinds.includes('megastructure') && !r.mega) bad.push(`${r.id}: no mega structure`);
    if (!r.places.some((pl) => pl.kind === 'dungeon' && pl.boss)) bad.push(`${r.id}: no dungeon with a boss`);
    if (!kinds.includes('mine')) bad.push(`${r.id}: no mine`);
    if (!kinds.includes('wild') && !kinds.includes('sea')) bad.push(`${r.id}: no open country`);
    if (!Array.isArray(r.encounters) || r.encounters.length < 3) bad.push(`${r.id}: fewer than three encounters`);
    for (const pl of r.places) {
      if (ids.has(pl.id)) bad.push(`${pl.id}: duplicate id`);
      ids.add(pl.id);
      if (!KINDS.includes(pl.kind)) bad.push(`${pl.id}: unknown kind ${pl.kind}`);
      if (pl.dungeon && !r.places.some((q) => q.id === pl.dungeon)) bad.push(`${pl.id}: names a dungeon ${pl.dungeon} that does not exist`);
      for (const text of [pl.name, pl.geography, pl.contains]) if (/—/.test(text)) bad.push(`${pl.id}: em dash`);
    }
    for (const text of [r.line, r.geography, r.mega, ...(r.encounters || [])]) if (/—/.test(text)) bad.push(`${r.id}: em dash`);
  }
  if (bad.length) throw new Error(`realms: ${bad.length} problem(s)\n  ${bad.join('\n  ')}`);
  return list.length;
}

auditRealms();
