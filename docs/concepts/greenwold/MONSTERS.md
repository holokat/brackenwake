# The Greenwold: every monster and animal, by the skeleton it rides

Generated 2026-09-07 by scripts/export-greenwold-monsters.mjs from src/mmo/monsters.js (rows, habitat, places, bosses), src/world/fauna.js (the animals) and the 131 greenwold spaces' spawn rows. 32 bodies: 23 that fight and 9 animals, on 12 rigs.

What each one DOES in play, tag by tag and number by number, is docs/mmo/17-GREENWOLD-BESTIARY.md; this file is the modelling list. Every body has a procedural stand-in in monster_models.js today, and a few ride a studio glb; the file column says which.

## The plan: one skeleton per rig, many bodies

A rig is one skeleton, one rest pose, one set of clips. The bodies on it swap heads, outfits and weapons on the same bones, so a bandit archer is a bandit with a bow and a green coat and not a second model. Author the clips once per rig. The list of clips every body needs, and what triggers each, is section 1 of the bestiary doc: idle, walk, run, swing, hurt, cast, die; the rows below add to it.

### The human rig (11 bodies, 1.7 to 1.9 m)

The game's own human skeleton: the same one the player bodies (human-slim, human-medium, human-heavy) ride, so every clip already authored for the player retargets. One skin per body, under 100 bones, feet on y = 0.

Swappable parts:
- base body: slim, medium or heavy, the three the studio already exports
- head set: six heads and four hairs, swapped per row so a pack of three bandits is three faces
- outfit sets, one per row family: stolen coats (bandit, raider), hedgerow green (bandit archer), a good dark coat and cloak (highwayman), black Legion plate with the square shield (soldier) and its lighter archer cut, a breastplate over the plate (Oram Blackhand), sacking and straw over poles (scarecrow), the rotten villager (zombie), the waterlogged sailor (drowned), a hooded shade with no legs (wraith)
- weapon sets on the hand bones: dagger, rapier, axe, shortsword and buckler, shortsword and square shield, bow and quiver, longsword

Clips: idle, walk, run, swing (a dagger slash and a rapier thrust as two variants), hurt, die, cast. The archers use `cast` as draw and loose, so author it as one; the Legion wants block and a shield raise; the scarecrow, the zombie and the drowned want a slow shamble in place of run (their run speed is 3 to 3.6 m/s); the wraith hovers, so its idle and walk are a drift a hand off the ground.

| id | name | tier | kind | group | run m/s | moves beyond the base clips | where | stand-in | file |
|---|---|---|---|---|---|---|---|---|---|
| `bandit` | Bandit | 2 | humanoid | 2 to 3 | 6 | the base set | the open country by day; the open country by night; The Mill Run by day; The Old Cellars; The Kingsroad by day; Highwayman's Hollow; Highwayman's Hollow (placed) | 1.50 m | code body |
| `banditArcher` | Bandit Archer | 2 | humanoid | 2 to 3 | 6.2 | draw and loose | the open country by day; the open country by night; The Old Cellars; The Kingsroad by day; Highwayman's Hollow; Highwayman's Hollow (placed); The Old Cellars (placed) | 1.79 m | code body |
| `highwayman` | Highwayman | 2 | humanoid | 2 to 3 | 6.5 | a crouched wait | The Kingsroad; Highwayman's Hollow; Highwayman's Hollow (placed); The Kingsroad Camp by night (placed) | 1.85 m | code body |
| `raider` | Raider | 2 | humanoid | 2 to 4 | 6.4 | a charge | the open country by day; the open country by night; Highwayman's Hollow | 1.85 m | code body |
| `legionSoldier` | Legion Soldier | 2 | humanoid | 2 to 4 | 5.8 | a block, a shout | the open country by day; the open country by night; The Kingsroad; The Kingsroad Camp (placed) | 1.85 m | code body |
| `legionArcher` | Legion Archer | 2 | humanoid | 2 to 3 | 6.2 | draw and loose | the open country by day; The Kingsroad; The Kingsroad Camp (placed) | 1.85 m | code body |
| `oramBlackhand` | Sergeant Oram Blackhand | 6 | boss | alone | 6 | a shout, a whistle, a charge | The Old Cellars; The Old Cellars, its lair | 1.85 m | code body |
| `scarecrow` | Scarecrow | 2 | undead | 1 to 2 | 3.6 | a wake from stillness | the open country by night; The Mill Run by night; The Mill Run by night (placed) | 1.96 m | code body |
| `zombie` | Zombie | 1 | undead | 1 to 2 | 3 | a shamble in place of run, clawed hands | the open country by night; The Mill Run by night; The Sunken Chapel; The Sunken Chapel by night (placed) | 1.10 m | monster-zombie.glb (stand-in) |
| `drowned` | Drowned | 2 | undead | 2 to 3 | 3.5 | a shamble in place of run | The Sunken Chapel; The Sunken Chapel by night (placed) | 1.50 m | code body |
| `wraith` | Wraith | 4 | undead | alone | 7 | a hover, a reach | The Sunken Chapel by night; The Sunken Chapel by night (placed) | 2.40 m | code body |

### The skeleton rig (1 body, 1.8 m)

The human skeleton again, with a bones mesh on it: the same bone names and rest pose, so it shares every human clip, and only its die (a collapse into a heap) is its own.

Swappable parts:
- the bones
- shortsword and buckler on the hand bones
- a rusted helm and a torn tabard as optional swaps, for the warrior variant later

Clips: the human set, plus a collapse for die.

| id | name | tier | kind | group | run m/s | moves beyond the base clips | where | stand-in | file |
|---|---|---|---|---|---|---|---|---|---|
| `skeleton` | Skeleton | 1 | undead | 2 to 3 | 4.5 | the base set | the open country by night; The Chalk Pits by night; The Sunken Chapel; The Chalk Pits by night (placed); The Sunken Chapel by night (placed) | 1.10 m | monster-skeleton.glb (stand-in) |

### The goblin rig (2 bodies, 1.2 to 1.35 m)

A short biped with a big head and long arms. Its own skeleton, because the proportions do not retarget cleanly from the human one; two bodies share it.

Swappable parts:
- scout: dagger and a bandolier of throwing knives, leather
- warrior: shortsword and buckler, a stockier torso and a scrap helm

Clips: idle, walk, run, swing, hurt, die, cast. The scout is a thrower: its `cast` is an overarm knife throw and it holds its ground, so a wary idle with the knife up reads right.

| id | name | tier | kind | group | run m/s | moves beyond the base clips | where | stand-in | file |
|---|---|---|---|---|---|---|---|---|---|
| `goblinScout` | Goblin Scout | 1 | humanoid | 2 to 3 | 6 | an overarm throw | the open country by day; The Old Cellars; Highwayman's Hollow by day; Highwayman's Hollow by night (placed) | 1.10 m | monster-goblin.glb (stand-in) |
| `goblinWarrior` | Goblin Warrior | 2 | humanoid | 2 to 3 | 6 | the base set | The Old Cellars; The Beech Hangar by night | 1.50 m | monster-goblin.glb (stand-in) |

### The canine rig (4 bodies, 0.4 to 0.8 m at the shoulder)

One four legged runner. The wolf is the base; the wild dog is it at three quarters, the badger at a half with a flatter back, the fox a lean tail-heavy variant of the same bones.

Swappable parts:
- wolf: grey, lean
- wild dog: a mongrel coat, ragged ears
- badger: black and white face, low and broad, the same skeleton squashed
- fox: russet, brush tail, on the same bones scaled

Clips: idle, walk, lope (run at up to 8.5 m/s), bite, hurt, die, plus a howl (the wild dog pack), a circling idle for the wolf near you, a tail-down flee.

| id | name | tier | kind | group | run m/s | moves beyond the base clips | where | stand-in | file |
|---|---|---|---|---|---|---|---|---|---|
| `wolf` | Wolf | 2 | beast | 3 to 4 | 8.5 | the base set | the open country by night; The Mill Run by night; The Beech Hangar by night; The Kingsroad by night; The Standing Hedge by night; Highwayman's Hollow by night; The Beech Hangar by night (placed); The Kingsroad Camp by night (placed); The Long Meadow by night (placed) | 1.50 m | code body |
| `wildDog` | Wild Dog | 1 | beast | 3 to 5 | 7.5 | a howl | the open country by day; The Mill Run by day; The Beech Hangar by day; The Chalk Pits by day; The Beech Hangar (placed); The Chalk Pits (placed); The Mill Run (placed) | 0.86 m | code body |
| `badger` | Badger | 1 | beast | 1 to 2 | 5.2 | a wake from stillness | the open country by night; The Beech Hangar by night; The Standing Hedge by night; The Beech Hangar (placed) | 0.55 m | code body |
| `fox` | Fox | 0 | critter | 1 to 2 | 8 | a wandering approach | the open country by night; The Beech Hangar; The Standing Hedge; Coldwake by night (placed); The Long Meadow (placed) | 0.50 m | code body |

### The boar rig (2 bodies, 1.0 m at the shoulder; Old Grist the size of a pony)

A heavy quadruped with a short neck and a charge. Old Grist is the same skeleton scaled up with a grey spine and one broken tusk; the code stands him on the wolf body today, which is why the row says wolf.

Swappable parts:
- boar: black bristles, tusks
- Old Grist: scaled 1.6, grey spined, one tusk broken, scars

Clips: idle (rooting), walk, run, charge (a lowered head run, one shot), gore (swing), hurt, die.

| id | name | tier | kind | group | run m/s | moves beyond the base clips | where | stand-in | file |
|---|---|---|---|---|---|---|---|---|---|
| `boar` | Boar | 2 | beast | 1 to 2 | 7 | a charge | the open country by day; The Beech Hangar; The Beech Hangar (placed); The Long Meadow (placed) | 1.50 m | code body |
| `oldGrist` | Old Grist | 3 | unique | alone | 8.5 | a charge, a charge that throws you | The Beech Hangar by night; The Beech Hangar by night (placed) | 1.90 m | code body |

### The rat rig (2 bodies, 0.5 m long plus tail; the mouse a tenth of it)

A scurrier. The giant rat is the base; the field mouse is the same bones tiny.

Swappable parts:
- giant rat: mangy, a wet mouth
- field mouse: the same at a tenth

Clips: idle, scurry (walk and run), bite, hurt, die, a freeze for the mouse.

| id | name | tier | kind | group | run m/s | moves beyond the base clips | where | stand-in | file |
|---|---|---|---|---|---|---|---|---|---|
| `giantRat` | Giant Rat | 1 | vermin | 1 to 3 | 5.5 | a wet mouth | the open country by day; The Mill Run by day; The Old Cellars; The Beech Hangar by day; The Chalk Pits; The Chalk Pits (placed); The Mill Run (placed); The Old Cellars (placed) | 1.10 m | monster-rat.glb (stand-in) |
| `fieldMouse` | Field Mouse | 0 | critter | 1 to 2 | 4 | the base set | grown by the fauna table in the meadow (generated worlds; a sculpt world only where a space names it) | 0.50 m | code body |

### The spider rig (1 body, 0.8 m, a metre and a half across)

Eight legs and an abdomen. One body here; the blossom spider of the next realm is a recolour.

Swappable parts:
- giant spider: brown, banded legs

Clips: idle, walk, run, bite, hurt, die, and a web spit (its `cast`, which roots you).

| id | name | tier | kind | group | run m/s | moves beyond the base clips | where | stand-in | file |
|---|---|---|---|---|---|---|---|---|---|
| `giantSpider` | Giant Spider | 2 | vermin | 1 to 3 | 7 | a lunge, a web spit | the open country by night; The Old Cellars; The Beech Hangar by night; The Chalk Pits by night; The Beech Hangar by night (placed); The Chalk Pits by night (placed); The Old Cellars by night (placed) | 1.50 m | monster-spider.glb (stand-in) |

### The grub rig (1 body, 1.0 m long)

A segmented crawler with a thorned head, a spine of ten segments.

Swappable parts:
- thorn grub: pale, thorned head

Clips: idle, crawl (its run is 2 m/s, so one cycle serves for walk and run), a lunging bite, hurt, die.

| id | name | tier | kind | group | run m/s | moves beyond the base clips | where | stand-in | file |
|---|---|---|---|---|---|---|---|---|---|
| `thornGrub` | Thorn Grub | 1 | vermin | 1 to 3 | 2 | a lunge | The Chalk Pits; The Chalk Pits (placed) | 1.10 m | code body |

### The wisp (1 body, 0.4 m, in the air)

No skeleton: a light with a core, a shader thing. Flies, drifts, and its `cast` is a flare.

Swappable parts:
- a core, a halo, a trail

Clips: a drift loop, a flare (cast), a gutter (hurt), a going out (die).

| id | name | tier | kind | group | run m/s | moves beyond the base clips | where | stand-in | file |
|---|---|---|---|---|---|---|---|---|---|
| `wisp` | Will o' Wisp | 2 | elemental | 1 to 2 | 7 | take off, fly, land, a wandering approach, a cast, a hover, ranged, cast | The Mill Run by night; The Sunken Chapel by night; The Mill Run by night (placed); The Sunken Chapel by night (placed); The Water Meadows by night (placed) | 1.50 m | code body |

### The bird rig (3 bodies, 0.3 to 0.7 m)

One bird skeleton with wings, scaled: the goose walks and swims, the hawk soars and stoops, the crow and the gull are the same at their sizes.

Swappable parts:
- goose: white, upright
- hawk: raptor, barred
- crow: black
- gull: white and grey

Clips: perched idle, walk (a waddle for the goose), take off, fly loop, land, and for the hawk a stoop with the wings folded; a wing flap threat for the goose.

| id | name | tier | kind | group | run m/s | moves beyond the base clips | where | stand-in | file |
|---|---|---|---|---|---|---|---|---|---|
| `goose` | Goose | 0 | critter | 2 to 6 | 6 | the base set | The Mill Run; Coldwake (placed); The Mill Run (placed); The Water Meadows (placed) | 0.50 m | code body |
| `hawk` | Hawk | 0 | critter | alone | 11 | take off, fly, land, a stoop | The Standing Hedge by day | 0.50 m | code body |
| `crow` | Crow | 0 | critter | 2 to 5 | 9 | take off, fly, land | grown by the fauna table in the meadow (generated worlds; a sculpt world only where a space names it) | 0.50 m | code body |

### The deer rig (1 body, 1.4 m at the shoulder)

A long legged quadruped with a carried head. Its own bones; nothing else here walks like it.

Swappable parts:
- deer: red brown, a doe and a stag with antlers as the one swap

Clips: graze idle, walk, bolt (run with the head high), a startle, hurt, die.

| id | name | tier | kind | group | run m/s | moves beyond the base clips | where | stand-in | file |
|---|---|---|---|---|---|---|---|---|---|
| `deer` | Deer | 0 | critter | 1 to 4 | 7 | the base set | grown by the fauna table in the meadow (generated worlds; a sculpt world only where a space names it) | 0.50 m | code body |

### The small animals (3 bodies, 0.15 to 0.4 m)

Three tiny bodies, each its own: they hop or sit rather than walk, and none of them fights.

Swappable parts:
- rabbit: long ears, a hop cycle
- squirrel: a tail, a climb
- frog: a sit, a hop, a throat pulse

Clips: sit idle, hop (walk and run), a startle, die.

| id | name | tier | kind | group | run m/s | moves beyond the base clips | where | stand-in | file |
|---|---|---|---|---|---|---|---|---|---|
| `rabbit` | Rabbit | 0 | critter | 1 to 3 | 4.2 | the base set | grown by the fauna table in the meadow (generated worlds; a sculpt world only where a space names it) | 0.50 m | code body |
| `squirrel` | Squirrel | 0 | critter | 1 to 2 | 4.6 | the base set | grown by the fauna table in the meadow (generated worlds; a sculpt world only where a space names it) | 0.50 m | code body |
| `frog` | Frog | 0 | critter | 1 to 3 | 2 | the base set | The Water Meadows (placed); grown by the fauna table in the meadow (generated worlds; a sculpt world only where a space names it) | 0.50 m | code body |

## The variety, counted

By tier: tier 0: 9, tier 1: 7, tier 2: 13, tier 3: 1, tier 4: 1, tier 6: 1. By kind: critter 9, beast 4, vermin 3, humanoid 8, undead 5, elemental 1, unique 1, boss 1. By rig: bird 3, deer 1, rat 2, canine 4, small 3, goblin 2, skeleton 1, grub 1, human 11, boar 2, spider 1, wisp 1. 31 can be met by day and 18 by night.

Gaps a read of the counts shows. These are wants, not rows; nothing here is in the code.

- Nothing flies at you by day: the wisp and the wraith are night rows, the hawk is an animal. A daytime flyer over the downs (a carrion crow that mobs, or a harpy scout from the next realm at tier 3) would give the archers something to shoot up.
- Only one boss and one unique in the realm: Oram Blackhand under the Cellars and Old Grist in the hangar. The Sunken Chapel's wraith is the closest thing to a third; the doc names a skeleton sexton for the chapel and a bandit chief for the Hollow, and neither is a row yet.
- The undead are all night rows except in the chapel and the pits. A daytime undead in the Cellars' mouth (a bone hound at tier 3) would make the first dungeon door read as one.
- Every humanoid is a coat on the human rig. That is the point of the rig, and it also means the zone's variety by day is bandits of four names; the goblin warrior only ever stands in the Cellars.
