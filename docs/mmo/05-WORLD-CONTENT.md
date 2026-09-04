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
