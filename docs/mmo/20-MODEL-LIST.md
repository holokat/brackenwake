# The models that change the game most, in the order to make them

Written 2026-09-06 for the user, who will make the assets. Ordered by how many
minutes a player spends looking at the thing times how bad the code-built
stand-in is. The first tier is the whole first hour of the game.

## How to hand a model in so it drops straight into the game

- glTF binary (.glb), metres, Y up, forward +Z, origin at the centre of the
  footprint with the feet or the base on y = 0. `tools/validate-glb.mjs`
  checks all of this for rigged bodies; static props will get the same check.
- PBR: base colour, normal, roughness, metalness (packed is fine), 1024 for a
  prop, 2048 for a building or a character, one material per model where you
  can (the game merges by material; ten materials is ten draw calls).
- Triangles: prop 200 to 2,000; building 3,000 to 12,000; tree 2,000 to 6,000
  with two lower LODs and a billboard; monster 4,000 to 10,000; character
  8,000 to 15,000; boss 15,000 to 25,000; megalith up to 40,000.
- Rigged bodies: exactly one skin, and clips named exactly as `src/game/models.js`
  asks: humans `idle walk run swing cast hurt die jump`; monsters
  `idle walk attack hurt die special` (a flyer's special is the stoop, a
  charger's the charge, a thrower's the throw). Walk authored for 7 m/s and
  run for 18 m/s; the blend tree does the rest.
- Variants beat one hero asset: three oaks make a wood, one oak makes a stamp.
- Name files by the id in the table (`oak_a.glb`, `farmhouse_small.glb`).

## Tier 1: the first hour, seen every minute

**The player.** Three bodies exist (`human-slim`, `human-medium`,
`human-heavy`) built in Blender by script. Real sculpted bodies, male and
female, with a face, hands, and gear slots that take the armour: head, chest,
hands, wrists, waist, legs, feet, back. Then the six armour looks as
swappable meshes or textures: cloth, leather, studded, ring, chain, plate.
This is centre screen for every second of play.

**The dragon companion**, four ages: hatchling on the shoulder (0.4 m),
fledgling at heel (1 m), young (2.5 m, ridable later), grown (6 m). Clips:
idle with breath, walk, fly, land, breathe, hurt, die, and the Wyrmsoul
call. The Bond is the game's spine and the dragon is always in frame.

**Trees**, three variants each with LODs and a billboard: oak, beech, birch,
pine, spruce, willow, sakura, palm, dead snag. Trees are most of every
screen in six realms.

**The Greenwold building kit**, in the honest timber and thatch and flint of
the look book: cottage (two sizes), farmhouse, barn, stable with pens, inn
(two storeys, a sign bracket, a yard wall), smithy with forge and chimney,
healer's house, bank (stone, one door), chapel with a square tower, water
mill with a turning wheel, windmill with turning sails, well with a roof,
market stall (two), hay rick, dovecote. Town wall: straight segment, corner
tower, gate tower pair with a gate, palisade segment for hamlets. The keep:
a stone manor with one tower for Hearthhome.

**Roads and fields.** Iron lamp post with a glass lantern (lit at night),
fingerpost signpost with three boards, milestone, post and rail fence panel,
field gate, dry stone wall segment (straight and corner), hedgerow segment
(straight and corner), scarecrow, wheat row card and cabbage row, ploughed
furrow tile, stone arch bridge (three spans: 8, 16, 30 m), timber bridge,
cart (loaded and empty), barrel, crate, sack, beehive.

**The Greenwold's creatures**, rigged with the monster clip set, sizes from
`docs/mmo/17-GREENWOLD-BESTIARY.md`: wolf, boar and Old Grist as a bigger
scarred variant, giant rat, goblin (scout with knives, warrior with sword and
buckler), bandit and raider (or one human body with two outfits), Legion
soldier with the square shield and Legion archer with a bow, skeleton with
sword and buckler, zombie, thorn grub, wraith. Animals: deer, rabbit, fox,
field mouse, frog, goose, crow, gull, hawk with perch, take off, fly and
land.

## Tier 2: the second hour, and every night

**Fire and light.** Campfire with a spit, brazier on a stand, torch bracket,
lantern, wall sconce, burning wreck pieces (blackened beam, fallen roof).

**Dungeon kit**, brick cellar and rough cave: wall segment (straight, corner,
arch), floor tile, pillar, door frame, wooden door, stair down (one flight),
iron chest and small wooden cache, cauldron, bone pile, torch stand, mine
props (trestle beam, rail length, ore cart, prop timber), cavern bridge
planks and a rope rail.

**Rocks and ore.** Boulder in three sizes and two rock types (grey granite,
pale chalk), a sarsen standing stone, an ore node with visible crystal that
can glow (copper, tin, iron, silver, and one crystal for the rare metals).

**Bandit camp kit.** Tent (two), bedroll, weapon rack, target dummy, lookout
post, stake wall, loot sacks, cooking pot on a tripod.

**Graveyard and tomb kit.** Headstone (five shapes), iron fence panel and
gate, mausoleum, barrow door with two statues, dead tree, lantern on a post.

**Weapons in hand**, the 21 in the codex, so the icon and the thing in the
hand agree: dagger, rapier, spear, shortsword, longsword, greatsword, axe,
battleaxe, mace, warhammer, maul, halberd, glaive, quarterstaff, wand,
staff, shortbow, longbow, crossbow, throwing knives, and the three shields.

## Tier 3: the other eight realms

**Megaliths**, one each, forty to a hundred metres: the Standing Hedge
stone (one, placed nine times), the Temple of Faces cliff, the Drowned Bell
Tower, the Brass City (a walking city on legs), the Eyrie's landing steps
and nest hall, the Skull Lodge, the Rib Cathedral, the Ice Vault door, the
Drowned Coliseum, the Ashen Gate. These are the postcard of each realm.

**Realm dressing kits**, eight to twelve props each: Boneyard (rib cage the
size of a house, skull you can stand in, spine, bone stake, dead tree);
Ember Wastes (sandstone pillar and arch, obelisk, half buried wall, dead
tree); Saltmarch (reed bed, jetty, upturned boat, wreck, stake and net);
Stormpeaks (cairn, totem, broken column, prayer stone); Frostreach (ice
shard, frozen pine, standing stone with ice); Sunken Kingdom (marble column
standing and fallen, drowned statue, coral head); Ashen Throne (obsidian
shard, brass wreckage, lava vent, black pillar, Legion banner); Verdant
Deep (root, hanging vine, fallen giant trunk, giant mushroom, carved face).

**The other towns' kits**: pirate port (dock, hull at anchor, sea wall,
warehouse, gallows, mast lighthouse), desert town (mud brick house, dome,
palm court, the well), mountain town (slate roofs, stone), Frostreach
(timber and ice, palisade), Legion town (black stone and brass), and the
Canopy Court in the trees. One keep each, realm styled.

**The bosses**, sixteen, each with idle, walk, attack, hurt, die and its
special: Sergeant Oram Blackhand (a whistle and an enrage), the Keeper of
Faces, Thalassa the Sea Wyrm, the Brass Heart, the Librarian, Warden Hask,
Huntmaster Gallow, Legate Ossory, King Caradoc the Drowned, Malachar the
Wyrmking, and the rest of `BOSS_BY_LAIR`.

**The rest of the roster**, sixty rows by family, in the order the realms
are reached: harpy, crab and salt crab, drowned and drowned marine, reef
eel, spiders, ogre and orc and hobgoblin, bone knight, cairn wight, marrow
ghoul, vampire knight, wisps, wyverns, drakes, imps, and the animals of the
other biomes.

## What the code does with each

Rigged bodies go through `src/game/models.js` and replace the procedural
family bodies in `monster_models.js` one family at a time. Static props get
a prop table (id to file) in each kit file (`dressing_models.js`,
`wayside_models.js`, `structures.js`, `town_models.js`, `site_models.js`),
so a kit entry that has a model uses it and one that does not keeps its
code-built stand-in, and nothing goes blank while the library fills in.
