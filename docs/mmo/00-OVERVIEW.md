# Brackenwake: the game

Ultima Online's mechanics in World of Warcraft's clothes. UO decides what is
true; WoW decides how it feels to look at.

## What that means, concretely

**From UO.** No classes, only skills. Every character can learn anything, and
what you are is the sum of what you have practised. Skills run 0.0 to 100.0 and
are capped in total, so becoming a grandmaster smith costs you the swordsmanship
you might have had. Stats are few and they matter in the arithmetic of every
swing. Gear is found and made rather than handed out by a quest, and the same
sword can roll a hundred ways. The world is one place, not a corridor.

**From WoW.** Numbers fly off things you hit. A gain is an event, not a line in
a log: green, large, briefly the most important thing on screen. Rarity has a
colour and you know it across the room. Abilities have a wind up, a hit, and a
reason to watch them. The interface is legible at a glance.

**The one rule that resolves arguments:** if UO and WoW disagree about a
mechanic, UO wins. If they disagree about presentation, WoW wins.

## The pillars

1. **You are what you practise.** Ten classes exist as opening positions, not
   cages. A warrior who spends a year casting is a mage with calluses.
2. **Every number is legible.** Damage, defence, gain, and price are all
   formulas a player could work out on paper, and the interface shows the parts.
3. **The world is the content.** Ore, game, herbs, ruins and monsters are placed
   by the world field, not by a quest giver. There are no quests.
4. **Loss is real, later.** For now death costs you time and nothing else. The
   systems are built so that item loss can be switched on without redesign.
5. **Everything is deterministic from a seed.** An item's stats, a monster's
   loot, a world site: all reproducible. This is what makes a server possible.

## The documents

| file | what it settles |
| --- | --- |
| `01-STATS-SKILLS.md` | the five stats, every skill, the gain curve, the caps |
| `02-COMBAT.md` | hit, damage, defence, speed, death, fall, aggro |
| `03-ITEMS-LOOT.md` | slots, armour tiers, rarity, affixes, identify, ores, crafting |
| `04-CLASSES-ABILITIES.md` | the ten openings, every ability and spell |
| `05-WORLD-CONTENT.md` | monsters, resources, NPCs, trainers, vendors |
| `06-ECONOMY-UI.md` | prices, sinks, the interface, settings, multiplayer shape |

## Build order

Nothing below a line can be built before the line above it works.

1. **Data and rules** (pure, no THREE): stats, skills, the gain curve, item
   properties, affix tables, ore and recipe tables, monster tables, ability
   definitions. All node-testable, all deterministic.
2. **Character**: creation screen, the ten openings, custom points, save shape.
3. **Combat**: swing timer, hit and damage resolution, floating numbers, death
   and respawn, fall damage, monster AI and aggro.
4. **Items**: inventory, equipment slots, the paper doll, identify, loot drops.
5. **Abilities**: the bar, cooldowns, casting rules, targeting, effects.
6. **Content**: monsters in the world, NPCs in towns, trainers, vendors.
7. **Crafting and economy**: ores, recipes, quality by skill, prices, trading.
8. **Presentation**: animations, spell effects, sound, settings.

## What is already built

The world (endless terrain, biomes, rivers, roads, sites, dungeons, caves,
flora, fauna), the third person player and camera, chopping and mining through
a real skill-free tool check, a market, dev mode, and sound. See
`docs/OPEN-WORLD.md` and `docs/GAME-CONTRACT.md`. The MMO layer is built on top
of that entry, not beside it.
