# World content: monsters, resources, people

What the world is full of, and the numbers each thing carries. All placement is
by the world field and the site grid, deterministically, never by a spawner
you cannot predict.

## Monsters

Five tiers plus bosses. Each row: health, damage, swing speed (s), hit skill,
defence skill, AR, speed (m/s), aggro (m), gold, and what it drops. "Skill" is
on the same 0 to 100 scale a player has, so a tier 3 ghoul at 55 is a fair
fight for a 55 skill character.

**Tier 0, critters.** Never attack first. Flee at any damage. No gold.
Rabbit, squirrel, deer, gull, frog, crow, field mouse. 1 to 8 health. Drop
meat and hide by Skinning.

**Tier 1, vermin and the newly dead** (skill 10 to 25, 4 to 12 gold)
| monster | hp | dmg | spd | hit | def | AR | run | aggro | notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Giant Rat | 18 | 2 to 5 | 2.0 | 15 | 10 | 2 | 5.5 | 6 | disease 10% |
| Cave Bat | 12 | 1 to 4 | 1.6 | 20 | 25 | 0 | 8 | 6 | flying, erratic |
| Skeleton | 30 | 4 to 8 | 2.8 | 20 | 15 | 8 | 4.5 | 10 | undead, holy x2, never flees |
| Zombie | 45 | 5 to 10 | 3.6 | 15 | 5 | 4 | 3 | 8 | undead, slow, poison touch |
| Goblin Scout | 26 | 3 to 7 | 2.4 | 22 | 20 | 5 | 6 | 12 | groups of 2 to 3, throws knives |
| Thorn Grub | 20 | 2 to 6 | 3.0 | 10 | 10 | 10 | 2 | 4 | poison 1 |

**Tier 2, the common dangers** (skill 30 to 45, 12 to 30 gold)
| monster | hp | dmg | spd | hit | def | AR | run | aggro | notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Wolf | 40 | 6 to 11 | 2.2 | 38 | 35 | 6 | 8.5 | 14 | packs of 2 to 4, night |
| Boar | 55 | 8 to 14 | 3.0 | 32 | 25 | 10 | 7 | 8 | charges |
| Skeleton Warrior | 60 | 8 to 14 | 2.8 | 40 | 35 | 18 | 4.5 | 12 | undead, sword and shield, parries |
| Goblin Warrior | 48 | 7 to 12 | 2.6 | 38 | 30 | 12 | 6 | 12 | groups, with a Scout |
| Bandit | 55 | 8 to 14 | 2.7 | 42 | 38 | 14 | 6 | 14 | humanoid, drops coin purses, flees at 20% |
| Giant Spider | 45 | 5 to 9 | 2.0 | 40 | 40 | 8 | 7 | 10 | poison 2, webs root 2 s |
| Bog Crawler | 70 | 9 to 15 | 3.2 | 30 | 20 | 16 | 4 | 8 | fen only, poison 2 |

**Tier 3, veterans** (skill 50 to 65, 30 to 80 gold)
| monster | hp | dmg | spd | hit | def | AR | run | aggro | notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Dire Wolf | 90 | 12 to 20 | 2.1 | 58 | 50 | 12 | 9.5 | 16 | alpha of a pack |
| Orc | 110 | 14 to 24 | 3.0 | 55 | 40 | 22 | 5.5 | 12 | groups, war cries buff the group |
| Ghoul | 85 | 10 to 18 | 2.4 | 52 | 45 | 10 | 6 | 12 | undead, paralysing touch 15% |
| Hobgoblin | 120 | 15 to 25 | 3.1 | 56 | 45 | 26 | 5 | 12 | leads goblins |
| Harpy | 70 | 10 to 17 | 2.0 | 60 | 60 | 6 | 10 | 18 | flying, screech silences 3 s |
| Stoneback Bear | 160 | 18 to 30 | 3.4 | 50 | 30 | 30 | 7 | 10 | beast, thick hide |
| Cultist | 80 | 8 to 14 | 2.6 | 55 | 45 | 8 | 5.5 | 14 | casts Fireball and Hex |
| Mire Troll | 200 | 20 to 34 | 3.8 | 48 | 30 | 28 | 4.5 | 12 | regenerates 3 a second unless burning |

**Tier 4, elites** (skill 70 to 85, 80 to 250 gold)
| monster | hp | dmg | spd | hit | def | AR | run | aggro | notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Ogre | 320 | 28 to 45 | 4.2 | 70 | 40 | 34 | 5 | 14 | knockback, ground slam |
| Wraith | 180 | 18 to 30 | 2.4 | 78 | 75 | 10 | 7 | 16 | undead, incorporeal (50% physical resist), drains mana |
| Iron Golem | 400 | 30 to 48 | 4.5 | 65 | 30 | 60 | 3.5 | 10 | construct, immune poison, weak to energy |
| Wyvern | 260 | 24 to 40 | 3.0 | 76 | 65 | 24 | 11 | 20 | flying, poison breath cone |
| Werewolf | 220 | 22 to 36 | 2.0 | 80 | 70 | 16 | 10 | 18 | night only, silver x2 |
| Bone Knight | 280 | 26 to 42 | 3.2 | 78 | 70 | 44 | 5 | 14 | undead, plate, parries, the necromancer's champion model |
| Manticore | 300 | 26 to 44 | 2.8 | 75 | 60 | 22 | 9 | 18 | tail spikes at range |
| Vampire Knight | 260 | 24 to 40 | 2.6 | 82 | 75 | 30 | 7.5 | 16 | undead, life leech 30%, flees to a coffin at 20% |

**Tier 5, champions** (skill 90 to 100, 250 to 800 gold, always roll loot twice)
| monster | hp | dmg | spd | hit | def | AR | run | aggro | notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Cyclops | 700 | 45 to 70 | 4.6 | 88 | 45 | 40 | 5.5 | 16 | boulder throw |
| Elder Treant | 900 | 40 to 60 | 4.8 | 85 | 50 | 50 | 3 | 12 | roots, heals in daylight, fire x2 |
| Lich | 520 | 30 to 50 | 2.4 | 95 | 85 | 20 | 6 | 22 | undead, all the necromancer spells, phylactery must be broken |
| Frost Giant | 800 | 48 to 76 | 4.4 | 90 | 50 | 48 | 6 | 16 | snow only, frost nova, cold immune |
| Hydra | 950 | 36 to 56 | 2.2 | 88 | 55 | 36 | 6 | 14 | three heads, three attacks, regrows |
| Bone Dragon | 1100 | 50 to 80 | 3.6 | 96 | 80 | 56 | 9 | 24 | undead, flying, breath, the dungeon level 3 boss |

**Bosses** (one per dungeon level 3, one per named crater): 2,000 to 4,000
health, unique abilities, phase changes at 66% and 33%, always drop a purple or
better, 800 to 3,000 gold, and the only source of some named powers. Authored
one at a time: the Ashen King (a lich in a throne room), the Mother of Spiders,
the Warden of the Cut (an iron golem the size of the room), the Drowned Knight.

### Where they live

Placement is by biome, time and depth, from the same hash the fauna uses:

| where | what |
| --- | --- |
| meadow, day | rats, boars, bandits on roads, goblin scouts near ruins |
| meadow, night | wolves, skeletons rising near ruins and shrines, zombies |
| boreal | wolf packs, dire wolves, bears, werewolves at night |
| desert | giant spiders, cultists at ruins, manticores, cyclops at the far end |
| beach and coast | crabs, harpies on cliffs, the drowned |
| fen | bog crawlers, mire trolls, ghouls |
| mountain | ogres, iron golems near caves, wyverns high up, frost giants in snow |
| ruins | always something: skeletons, cultists, a wraith in the old ones |
| dungeon level 1 | tier 1 and 2 |
| dungeon level 2 | tier 3, a tier 4 at the stair |
| dungeon level 3 | tier 4, the boss room |
| caves | vermin, spiders, an ogre in the deep ones |

Density: about one monster group per 40 m of dungeon corridor, one per 150 m
of wild land at night, one per 400 m by day. Monsters respawn 8 to 15 minutes
after death, at their spot, unless a player is within 30 m.

### Gold and loot

Gold per kill is the tier's range, rolled uniformly, weightless. Loot rolls
once per kill on the rarity table shifted by tier; the item base is drawn from
the monster's table (skeleton warriors drop swords and shields, cultists drop
robes and staves, beasts drop hides and meat, golems drop ingots). Critters
never drop gold. Every drop is a bag on the ground for 90 s, then gone.

## The wave A roster

Forty rows and twelve bosses, written so that every sentence in
`src/mmo/realms.js` has something behind it. The sheet says a kraken takes boats
in the Kraken's Shoals, that the Singing Dunes hum a tone lower when a sandworm
is under you, that the Mammoth Steppe has herds on it and that the Kingsroad
carries Legion patrols. A place that promises a monster and spawns a giant rat
is the same failure as a gift that will not fit in the barn, so each of those is
a row here, in the tier its realm's danger asks for.

Health and damage are not free numbers. Each tier's band is read off the rows
above, widened by a fifth either way, and `auditMonsters()` holds every new row
inside it, so a tier 3 monster cannot quietly be a tier 4 one:

| tier | health | low damage | high damage |
| --- | --- | --- | --- |
| 1 | 9 to 54 | 0 to 6 | 3 to 12 |
| 2 | 32 to 84 | 4 to 11 | 7 to 18 |
| 3 | 56 to 240 | 6 to 24 | 11 to 41 |
| 4 | 144 to 480 | 14 to 36 | 24 to 58 |
| 5 | 416 to 1320 | 24 to 60 | 40 to 96 |

**Tier 0, wave A.** The Fox, the Goose and the Hawk are the three the fauna
needs and the three whose bodies were already built and waiting for a row. The
Whale is the fourth: twenty five metres of it, tier 0 because it is never a
fight and not because it is small, and the one row tagged `huge`, which is what
lets it out of the document's "1 to 8 health". A whale lets a boat ride its
wake across the Caldera Sea and a kraken follows the whales.
**Tier 1, wave A** (the same band: 10 to 25 skill, 4 to 12 gold)
| monster | hp | dmg | spd | hit | def | AR | run | aggro | notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Salt Crab | 26 | 3 to 7 | 2.8 | 18 | 12 | 14 | 3.2 | 6 | coastOnly, group, sharesAggro |
| Reed Stalker | 22 | 4 to 9 | 3.0 | 24 | 20 | 4 | 6.5 | 6 | fenOnly, ambush, poison1 |

**Tier 2, wave A** (the same band: 30 to 45 skill, 12 to 30 gold)
| monster | hp | dmg | spd | hit | def | AR | run | aggro | notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Legion Soldier | 62 | 8 to 14 | 2.6 | 42 | 36 | 20 | 5.8 | 12 | group, sharesAggro, shieldWall, warCry |
| Legion Archer | 50 | 7 to 13 | 2.4 | 44 | 40 | 12 | 6.2 | 14 | group, sharesAggro, bow |
| Raider | 58 | 8 to 15 | 2.5 | 43 | 38 | 14 | 6.4 | 14 | group, sharesAggro, coinPurse, charges |
| Musk Ox | 80 | 9 to 16 | 3.4 | 30 | 22 | 18 | 6 | 8 | snowOnly, charges, group |
| Coral Crab | 46 | 7 to 12 | 2.6 | 36 | 30 | 22 | 3.6 | 8 | coastOnly, group, poison1 |
| Will o' Wisp | 34 | 6 to 12 | 2.0 | 44 | 45 | 0 | 7 | 12 | flying, erratic, casts, incorporeal50 (M5 took `fenOnly` off it) |

**Tier 3, wave A** (the same band: 50 to 65 skill, 30 to 80 gold)
| monster | hp | dmg | spd | hit | def | AR | run | aggro | notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Blossom Spider | 95 | 11 to 19 | 2.0 | 58 | 55 | 10 | 7.5 | 12 | poison2, webRoot2, dropsFromAbove, group |
| Canopy Harpy | 78 | 10 to 18 | 2.0 | 62 | 60 | 8 | 10.5 | 18 | flying, dives, silence3, group |
| Cultist Adept | 92 | 10 to 17 | 2.5 | 60 | 50 | 10 | 5.5 | 14 | casts, hex, group, sharesAggro |
| Fen Witch | 86 | 9 to 16 | 2.4 | 62 | 58 | 6 | 5 | 14 | fenOnly, casts, hex, poison2, summons |
| Ember Drake | 130 | 14 to 24 | 2.8 | 60 | 55 | 20 | 10 | 18 | flying, breath, fireImmune |
| Legion Chaplain | 88 | 9 to 16 | 2.6 | 58 | 52 | 14 | 5.4 | 14 | casts, healsAllies, group |
| Legion Sapper | 105 | 12 to 20 | 3.0 | 55 | 45 | 18 | 5.6 | 12 | group, sharesAggro, powderCharge, knockback |
| Cairn Wight | 100 | 12 to 21 | 2.8 | 58 | 50 | 16 | 5 | 12 | undead, holyWeak, manaDrain, ambush |
| Bone Hound | 76 | 11 to 19 | 2.2 | 60 | 52 | 10 | 9.5 | 16 | undead, holyWeak, group, sharesAggro, howl |
| Marrow Ghoul | 110 | 13 to 22 | 2.6 | 56 | 44 | 14 | 6 | 12 | undead, holyWeak, disease10, paralyse15 |
| Frost Wolf | 105 | 13 to 22 | 2.1 | 60 | 55 | 14 | 9.8 | 16 | snowOnly, group, alpha, frostNova |
| Drowned Marine | 115 | 12 to 21 | 3.0 | 56 | 46 | 22 | 4.2 | 12 | undead, holyWeak, coastOnly, group, sharesAggro, shieldWall |
| Reef Eel | 70 | 12 to 20 | 2.0 | 62 | 60 | 8 | 8 | 6 | coastOnly, ambush, stormCall |
| Cinder Imp | 68 | 10 to 18 | 2.0 | 58 | 58 | 6 | 8.5 | 12 | flying, erratic, casts, fireImmune, group |

**Tier 3, wave C** (the same band, and one row: the Greenwold's named beast)
| monster | hp | dmg | spd | hit | def | AR | run | aggro | notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Old Grist | 210 | 16 to 28 | 2.6 | 58 | 46 | 20 | 8.5 | 16 | charges, knockback, alpha |

**Wave M5** (the Greenwold, and everywhere else the rows fit)

The first realm had six rows walking its open country by night and seven by
day, and a player who walked it twice met the same six twice. These are nine
more things to meet there, all of them inside the realm's own danger band of
tier 1 to tier 2, and all of them written into the biome tables as well as into
the named places, so a wild dog is a thing the meadow has and not a thing the
Greenwold has.

Six of the nine are new rows. Three are rows that already existed and were
standing nowhere a player walks: the Giant Spider and the Goblin Warrior are
now in the Beech Hangar after dark, and the Will o' Wisp has lost its `fenOnly`
tag, which was a placement guard and nothing else, and stands over the Mill
Run's water meadow and in the flooded nave of the Sunken Chapel.

| monster | tier | hp | dmg | spd | hit | def | AR | run | aggro | group | notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Wild Dog | 1 | 26 | 3 to 7 | 2.4 | 22 | 22 | 3 | 7.5 | 12 | 3 to 5 | group, sharesAggro, howl |
| Badger | 1 | 34 | 4 to 9 | 3.0 | 20 | 16 | 10 | 5.2 | 6 | 1 to 2 | nightOnly, awakens, thickHide |
| Bandit Archer | 2 | 46 | 7 to 12 | 2.5 | 41 | 40 | 10 | 6.2 | 14 | 2 to 3 | group, sharesAggro, bow |
| Highwayman | 2 | 60 | 9 to 15 | 2.6 | 44 | 42 | 16 | 6.5 | 14 | 2 to 3 | group, sharesAggro, coinPurse, ambush |
| Scarecrow | 2 | 58 | 8 to 14 | 3.4 | 32 | 12 | 6 | 3.6 | 10 | 1 to 2 | undead, holyWeak, fireWeak, nightOnly, awakens |

The Fox is the sixth and it is a tier 0 row that already existed; M5 put it into
the meadow's night list, so the Greenwold has a fox in it and not only the
Beech Hangar and the Standing Hedge.

Two numbers on rows that already existed also moved:

- The Wolf's group is 3 to 4 and was 2 to 4. "The first wolves after dark" is a
  pack, and a pair reads as two dogs having a disagreement. It also carries
  `sharesAggro` now, which it should always have: pulling one wolf pulls the
  pack.
- `coinPurse` is a real number for the first time. It was carried by the
  Bandit, the Raider, Sergeant Oram Blackhand and Huntmaster Gallow and read by
  nothing at all, so a bandit's purse was a rat's purse with a better name. A
  row that carries the tag now has its kill gold multiplied by its own `purse`,
  or by `DEFAULT_PURSE` (1.5) where it names none, and the Highwayman names
  2.5. A tier 2 purse at 1.5 is 18 to 45 gold against the band's 12 to 30,
  which is over the band and still short of tier 3's 30 to 80.

**Tier 4, wave A** (the same band: 70 to 85 skill, 80 to 250 gold)
| monster | hp | dmg | spd | hit | def | AR | run | aggro | notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Temple Guardian | 380 | 28 to 46 | 4.0 | 70 | 35 | 52 | 4 | 10 | immunePoison, energyWeak, awakens, knockback, groundSlam |
| Brass Sentinel | 340 | 26 to 44 | 3.8 | 72 | 40 | 46 | 4.8 | 12 | immunePoison, energyWeak, breath, group, sharesAggro |
| Legion Knight | 300 | 26 to 42 | 3.0 | 80 | 70 | 46 | 5.2 | 14 | plate, parries, swordAndShield, shieldWall, group, sharesAggro, warCry |
| Rider Wraith | 200 | 20 to 34 | 2.4 | 80 | 78 | 12 | 7.5 | 16 | undead, holyWeak, incorporeal50, manaDrain, ashCloud |
| Ice Troll | 420 | 30 to 50 | 4.0 | 70 | 38 | 34 | 4.8 | 12 | snowOnly, regen3, burnStopsRegen, fireWeak, coldImmune, knockback |
| Mammoth | 480 | 30 to 52 | 4.4 | 66 | 30 | 36 | 7.5 | 10 | snowOnly, charges, knockback, group, thickHide |
| Lava Hound | 260 | 24 to 40 | 2.2 | 78 | 66 | 24 | 10.5 | 18 | fireImmune, breath, charges, group |
| Ash Wraith | 190 | 19 to 32 | 2.4 | 78 | 76 | 8 | 7 | 16 | undead, holyWeak, incorporeal50, ashCloud, silence3 |
| Sandworm | 460 | 32 to 55 | 4.2 | 72 | 30 | 40 | 8 | 14 | burrows, grab, immunePoison, tailSweep |

**Tier 5, wave A** (the same band: 90 to 100 skill, 250 to 800 gold)
| monster | hp | dmg | spd | hit | def | AR | run | aggro | notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Kraken | 1250 | 52 to 88 | 3.4 | 92 | 60 | 40 | 7 | 22 | coastOnly, grab, tailSweep, knockback, lootTwice, champion |
| Sea Wyrm | 1150 | 46 to 76 | 2.4 | 90 | 62 | 38 | 6.5 | 14 | coastOnly, threeHeads, regrows, grab, lootTwice, champion |
| Storm Wyvern | 760 | 48 to 78 | 2.8 | 94 | 78 | 30 | 12 | 24 | flying, stormCall, dives, knockback, lootTwice, champion |
| Glacier Golem | 900 | 50 to 80 | 4.6 | 88 | 40 | 62 | 3.6 | 12 | snowOnly, immunePoison, coldImmune, fireWeak, frostNova, groundSlam, knockback, lootTwice, champion |
| Glass Wyvern | 700 | 44 to 72 | 2.6 | 92 | 80 | 34 | 11.5 | 22 | flying, rangedSpikes, dives, fireImmune, lootTwice, champion |

### The bosses of the nine realms

The document's four are the boss of any dungeon level 3. These twelve are the
ones the realms name, each in one place, with the phases every boss has at 66%
and 33% health.

A boss is read against its realm and not against tier 6. Rank is the realm's own
danger: rank 5 is the document's band, 2,000 to 4,000 health and 800 to 3,000
gold, and rank 1 is a cellar under a mill fought by a character an hour old, who
has forty health and a 20 skill. A 2,000 health boss hitting at 98 is not a
fight there, it is a wall with a name.

| rank | health | gold | hit and defence band |
| --- | --- | --- | --- |
| 1 | 300 to 600 | 60 to 180 | 10 to 25 |
| 2 | 600 to 1,200 | 150 to 450 | 30 to 45 |
| 3 | 1,200 to 1,800 | 400 to 1,200 | 50 to 65 |
| 4 | 1,800 to 2,600 | 800 to 3,000 | 70 to 85 |
| 5 | 2,600 to 4,000 | 800 to 3,000 | 90 to 100 |
| 6 | 3,400 to 4,000 | 1,200 to 4,000 | 90 to 100 |

| boss | realm | lair | rank | hp | gold | its own three |
| --- | --- | --- | --- | --- | --- | --- |
| Sergeant Oram Blackhand | The Greenwold | The Old Cellars | 1 | 520 | 60 to 180 | coinPurse, warCry, summons, charges |
| the Keeper of Faces | Verdant Deep | The Deep of Faces | 2 | 1050 | 150 to 450 | incorporeal50, casts, silence3, summons |
| Thalassa the Sea-Wyrm | The Saltmarch and the Thousand Isles | The Leviathan's Rest | 2 | 1200 | 150 to 450 | threeHeads, regrows, grab, tailSweep |
| the Brass Heart | Ember Wastes | The Firstfire Crater | 3 | 1800 | 400 to 1200 | immunePoison, energyWeak, groundSlam, knockback, stun, breath |
| the Librarian | Ember Wastes | The Buried Library | 3 | 1300 | 400 to 1200 | boulder, casts, hex, summons |
| Warden Hask | The Stormpeaks | The Eyrie's Roost | 4 | 2200 | 800 to 3000 | knockback, groundSlam, stun, warCry, summons |
| Huntmaster Gallow | The Boneyard | The Trophy Throat | 4 | 2000 | 800 to 3000 | bow, howl, coinPurse, summons |
| Legate Ossory | Frostreach | The Vault Below | 4 | 2400 | 800 to 3000 | plate, parries, swordAndShield, shieldWall, warCry, summons |
| King Caradoc the Drowned | The Sunken Kingdom | The Drowned Palace | 5 | 3000 | 800 to 3000 | lifeLeech30, casts, summons |
| Malachar, the Wyrmking | The Ashen Throne | The Throne of Ash | 6 | 4000 | 1200 to 4000 | plate, parries, breath, dragonTime, lifeLeech30, summons |
| Noon the Manticore | Ember Wastes | The Glass Road | 3 | 1500 | 400 to 1200 | rangedSpikes, charges, noonOnly, wanders |
| Rimemouth | Frostreach | The White Pines | 4 | 1900 | 800 to 3000 | alpha, howl, frostNova, wanders |

### What can be tamed

Animal Taming's difficulty is on the same 0 to 100 the skill is, so a character
who has been taught to 40 can take a fox, a goose or a reed stalker and is going
to be bitten by anything else. `food` is a real items.js base: taming is fed,
not talked at. Loyalty is how long it stays yours without being fed again.

Nothing dead, built, thinking or verminous is on this list, and the audit
enforces it: a tamable row has to be a beast, a critter or a flying animal.

| tamable | tier | kind | Animal Taming | fed on | loyalty, days |
| --- | --- | --- | --- | --- | --- |
| Fox | 0 | critter | 20 | game meat | 7 |
| Goose | 0 | critter | 10 | bread | 3 |
| Hawk | 0 | critter | 45 | rat meat | 10 |
| Reed Stalker | 1 | beast | 40 | fish | 5 |
| Musk Ox | 2 | beast | 50 | nettle | 14 |
| Ember Drake | 3 | flying | 90 | emberite ore | 30 |
| Frost Wolf | 3 | beast | 70 | venison | 21 |
| Mammoth | 4 | beast | 85 | nettle | 30 |
| Lava Hound | 4 | beast | 88 | voidrock ore | 21 |
| Glass Wyvern | 5 | flying | 95 | gem | 30 |

### The tag vocabulary

Every ability a row can carry is one of these tags, and a tag that is not in the
list is refused at load. This is the whole vocabulary, and the meaning is the
contract: `docs/mmo/wiring/M2.md` carries the rule each of wave A's new tags
needs in `src/game/monsters.js`.

| tag | means |
| --- | --- |
| `flying` | stays in the air; monster_ai.isFlyer holds it at hoverHeight and it comes down to swing |
| `erratic` | does not fly a straight line at you; the approach wanders |
| `night` | commoner after dusk, still present by day |
| `nightOnly` | never spawns in daylight above ground |
| `snowOnly` | only in snow, mountain or crater habitats |
| `fenOnly` | only in the fen |
| `coastOnly` | only on the beach, in the ocean or underground beside them |
| `noonOnly` | only between the hours the sun is highest, which is the whole of its legend |
| `wanders` | does not sit in its lair; it walks a route of places and can be met anywhere on it |
| `huge` | a body far larger than its tier suggests, so the tier health band does not hold for it |
| `slow` | walks slower than its run speed suggests; it never runs you down |
| `charges` | closes the last stretch at a run and the blow that lands hits harder |
| `parries` | carries a natural guard, so combat_rules gives it a parry roll |
| `swordAndShield` | fights one handed behind a shield |
| `plate` | wears plate: the AR on the row already holds it |
| `shield` | carries a shield |
| `tailSweep` | a wide arc that catches everything in front of it, not one target |
| `dives` | a flyer stoops from the air for a doubled blow and climbs again |
| `group` | spawns with its own kind and fights as one |
| `sharesAggro` | pulling one pulls every one of its kind within the group |
| `alpha` | the leader of its pack; the pack holds while it lives |
| `leadsGoblins` | goblins spawn around it and fight better for it |
| `warCry` | a shout that lifts every ally of its own kind nearby |
| `shieldWall` | while two or more of the same row stand within four metres, each gains armour |
| `howl` | calls every monster of its own row within thirty metres into the fight |
| `healsAllies` | a chant that heals every ally within eight metres |
| `summons` | calls lesser monsters into the fight; the row carries `summons: { id, count }` |
| `throwsKnives` | thrown weapon; monster_ai.RANGED_TAGS maps it to the thrown mode |
| `bow` | shot weapon; monster_ai.RANGED_TAGS already maps it to the shot mode |
| `boulder` | thrown weapon, and a heavy one |
| `rangedSpikes` | thrown weapon fired off its own body |
| `breath` | a cone of fire, held for BREATH_SECONDS |
| `poisonBreath` | a cone of poison |
| `casts` | a bolt or a fireball at range, interruptible |
| `hex` | a curse that lowers the target hit chance for a while, the document Fireball and Hex |
| `stormCall` | calls lightning down on the ground a target is standing on, after a warning |
| `powderCharge` | throws a charge that goes off a moment later and hits an area |
| `ashCloud` | a cloud that blinds: the target hit chance falls while it stands in it |
| `poison1` | poison level 1 on a landed blow |
| `poison2` | poison level 2 on a landed blow |
| `poison3` | poison level 3 on a landed blow |
| `poisonTouch` | poison level 1 by touch |
| `disease10` | one blow in ten carries disease |
| `stun` | a blow that stuns |
| `paralyse15` | fifteen percent of blows hold you still |
| `silence3` | a screech that stops casting for three seconds |
| `knockback` | a blow that moves you |
| `groundSlam` | an area blow around itself after a warning |
| `webRoot2` | a web that roots for two seconds |
| `roots` | roots out of the ground that hold you where you stand |
| `frostNova` | a ring of cold around itself |
| `grab` | takes hold of you and holds you there while it squeezes |
| `ambush` | unseen until you are close, and the first blow is doubled |
| `burrows` | goes under the ground, and comes up somewhere else |
| `awakens` | never aggros at all until you come inside four metres of it |
| `dropsFromAbove` | hangs above the path and drops on whatever walks under it |
| `dragonTime` | the world runs slow around it: it acts twice for every once of yours |
| `undead` | undead: no meat, never flees, holy hurts it |
| `holyWeak` | holy damage doubled |
| `silverWeak` | silver doubled |
| `fireWeak` | fire doubled |
| `energyWeak` | energy doubled |
| `immunePoison` | poison does nothing to it |
| `coldImmune` | cold does nothing to it |
| `fireImmune` | fire does nothing to it |
| `incorporeal50` | half of all physical damage passes straight through |
| `thickHide` | a hide that turns blades, which the AR on the row already holds |
| `regen3` | three health a second |
| `burnStopsRegen` | burning stops the regeneration |
| `regrows` | a severed part grows back |
| `threeHeads` | three heads, three attacks |
| `healsInDaylight` | heals while the sun is on it |
| `lifeLeech30` | thirty percent of the damage it does comes back as health |
| `manaDrain` | takes mana as well as health |
| `phylactery` | it stands back up unless the phylactery is broken first |
| `coinPurse` | carries coin over its tier band |
| `lootTwice` | the loot roll is made twice and the better kept |
| `purpleFloor` | never drops worse than an epic |
| `champion` | a champion or a boss: the plate says so and the colour is the tier |

### Where they live, by name

`HABITAT` answers "what walks on a meadow". It cannot answer "what is in the
Kraken's Shoals". `HABITAT_BY_PLACE` in `src/mmo/monsters.js` is keyed by the
place ids of `src/mmo/realms.js`, eighty three of the ninety five places have a
roster of their own, and `spawnRollFor` reads it before it reads the biome. Each
entry carries the biome it reads as, which is not always its realm's: the
Saltmarch is a fen whose causeway, isles and shoals are salt water, and the
Sunken Chapel is a meadow's ruin with a river over its roof.

The rule the audit keeps: a row tagged `snowOnly` is only ever written into
snow, mountain or crater; `fenOnly` only into the fen; `coastOnly` only into the
beach, the ocean or a dungeon under them. Every place named in the table is a
real place in realms.js, every boss's lair holds that boss, and every realm has
at least six rows that can stand in it.


## Resources

**Ore veins** by biome and depth as in `03-ITEMS-LOOT.md`. A vein has 3 to 8
breaks in it and regrows in 10 minutes.

**Trees:** oak (meadow), spruce (boreal), palm (beach), cactus wood (desert),
sakura, ash (fen edges), heartwood (deep old forest, Lumberjacking 60),
ironbark (mountain shoulders, Lumberjacking 85). Each yields its wood.

**Foraging** (the skill decides what you see and what you get):
| plant | where | Foraging | used for |
| --- | --- | --- | --- |
| Wild berries | meadow | 0 | food, +1 stamina regen 5 min |
| Brown cap | any forest floor | 0 | food |
| Garlic, ginseng | meadow, roadsides | 10 | cure, healing potions |
| Bloodmoss | fen | 25 | mana potions, poison |
| Mandrake | old forest | 35 | strength potions, necromancy |
| Nightshade | ruins, graveyards | 40 | poison, invisibility |
| Frostmoss | snow line | 50 | cold resist potions |
| Emberleaf | desert, volcanic | 55 | fire resist, fire damage oil |
| Pale cap | caves | 45 | night sight |
| Ghost orchid | dungeon level 2 | 70 | resurrection, greater mana |
| Starbloom | craters | 85 | the best of everything, one per crater per day |

**Fishing** at any water: fish by biome for food, and a small chance of a
message in a bottle (a treasure map to a chest, a small quest-free reason to
travel), a sunken chest, or a pair of boots.

**Skinning** a corpse gives hide, and from some beasts scales, fangs or claws
(Tinkering and Alchemy reagents).

## People

Towns and hamlets get NPCs, standing near the buildings that fit them. Each
is named from the settlement's name hash and stands in the same spot for
everyone. Click to talk: a small dialogue panel with two to four lines and the
things they offer. No quests, only trade and teaching.

| NPC | in | offers |
| --- | --- | --- |
| Blacksmith | town, hamlet | sells iron weapons and armour to tier 3, repairs, buys ore and ingots; teaches Blacksmithing and Mining to 40 |
| Tailor | town | sells cloth and leather to tier 3, bags; buys hide and cloth; teaches Tailoring to 40 |
| Bowyer | town | sells bows, arrows; teaches Archery, Fletching to 40 |
| Alchemist | town | potions, reagents; buys herbs; teaches Alchemy, Foraging to 40 |
| Healer | town, hamlet | heals for coin, cures, resurrects; sells bandages; teaches Healing, Anatomy to 40 |
| Mage | town | scrolls, reagents, staves, robes; teaches Magery, Evaluating Intelligence, Meditation, Inscription to 40 |
| Provisioner | town, hamlet | food, torches, tools, camping kit; buys almost anything at a poor price |
| Stablemaster | town | tames a pet for you if you cannot, sells feed; teaches Animal Taming, Animal Lore, Veterinary to 40 |
| Weaponsmaster | town | teaches Swordsmanship, Macefighting, Fencing, Polearms, Tactics, Parrying, Wrestling to 40 |
| Ranger | hamlet on a forest edge | teaches Tracking, Camping, Archery to 40; buys pelts |
| Bard | town inn | teaches Musicianship, Provocation, Peacemaking, Discordance to 40; sells rumours (where the nearest dungeon is) |
| Necromancer | a ruin, never a town | teaches Necromancy and Spirit Speak to 40, sells bone reagents; only at night |
| Thief | town alley | teaches Stealth, Hiding, Lockpicking, Stealing to 40; buys anything, no questions |
| Innkeeper | town | rest (full heal, rested bonus), buys food |

**Training:** a trainer raises a skill to 40 at 1 gold per 0.1 point above
what you have, in one sitting. Beyond 40 nobody can teach you; you practise.

**Vendor stock** is finite and restocks every 30 minutes; prices are the
catalog price times a town multiplier (0.9 to 1.2 by hash). What a vendor
pays drops 10% for each of the same thing you sold there this hour, floor 5%,
and what it charges rises 5% per unit bought, so a vendor cannot be milked
(`06-ECONOMY-UI.md` has the rule; this is the same rule).

**Healers** resurrect at the shrine or in their house for 50 gold below skill
30, free after.

## Sites gain kinds

Two new site kinds: **crater** (starfall ore, starbloom, a champion), rare,
in deserts and snow; **graveyard** (nightshade, skeletons and zombies at
night, a necromancer's stall), near old towns. Dungeons get themed by the
nearest biome: bone in meadow, spider in desert, drowned near the coast.
