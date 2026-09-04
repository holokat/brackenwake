# Economy, interface, and the shape of multiplayer

## Gold

Gold comes in from monsters (the tier ranges in `05-WORLD-CONTENT.md`),
selling to vendors, and later from players. It goes out to vendors, trainers,
healers, repairs, and later housing.

**Sinks matter more than sources.** Without them gold is meaningless in a
month. The sinks and their sizes:

| sink | cost |
| --- | --- |
| training to 40 | up to 400 gold a skill |
| repairs | 1 gold per point of durability, at a smith |
| resurrection under Healing 30 | 50 gold |
| vendor stock | catalog x town multiplier |
| bags | 40, 120, 400, 1200 for 4, 8, 12, 16 slots |
| a mount, later | 800 |
| a house deed, later | 5,000 and up |

**Durability.** Every weapon and armour piece has 40 to 120 durability, loses 1
on a 5% chance per hit taken or given, and at 0 does nothing until repaired. A
repair costs gold and, without a smith, a small durability cap loss. This is
the steady sink.

**Vendor prices.** Sell to a vendor at 30% of the buy price; the Provisioner
pays 15%. A vendor pays 10% less for each unit of the same thing you sold there
in the last hour, floor 5%. Buy prices rise 5% per unit bought in the hour.
These two rules stop farming a town.

**Catalog prices** (buy, base town): iron ingot 4, copper ore 1, oak wood 2,
hide 3, bandage 2, arrows 1 per 5, heal potion 25, mana potion 30, longsword
90, kite shield 70, leather set 120, chainmail set 600, plate set 2,400,
longbow 140, quarterstaff 30, robe set 60, 8 slot bag 120.

## Trading between players

Two players within 4 m can open a **trade window**: each places items and gold,
each ticks accept, both must accept after the last change. Nothing moves until
both accept, and any change unticks both. This is written now against the
local state and becomes a server call unchanged when the server exists.

## Multiplayer shape

Everything above is authored so that a server can be the truth without
redesign:

- All rolls take an explicit seed or a `random` function. Combat, loot, identify
  and crafting are pure functions of their inputs.
- The player's state is one document (`state.js`) with a version. The server
  will hold it; the client will hold a copy.
- Monsters are placed and respawned from the world hash plus a small list of
  "dead until" entries. A server keeps that list; a client mirrors it.
- Interest is by chunk ring, which already exists for streaming.
- Nostr identity from the archived game returns as the account layer: a
  keypair is a character, and the server signs what it accepts.

None of this is built in this pass. It is why the functions are pure.

## The interface

WoW's legibility with this game's plain style. Plain CSS, no painted frames,
the fonts and colours already in `hud.js`.

**Always on screen**
- Top left: portrait, name, health bar (red), mana (blue), stamina (yellow),
  each with numbers, buffs and debuffs as small icons under them with timers.
- Top centre: place name; below it the target frame when something is targeted
  (name, health bar, level tier as a colour: grey, green, yellow, orange, red
  for far below you to far above).
- Top right: minimap (the existing world field as a 200 m disc, sites, roads,
  the player arrow), clock, and the settings gear.
- Bottom centre: the ability bar, twelve slots, keys 1 to 0 and minus and
  equals, cooldown sweeps, cost shown red when unaffordable.
- Bottom left: chat and system log (gains, loot, damage, later other players).
- Bottom right: bag, character, skills, crafting, map buttons with keys.
- Floating text as `02-COMBAT.md` describes. Skill and stat gains are the
  brightest thing in the scene when they happen.

**Windows** (one key each, Escape closes)
- **Character (C):** the paper doll with fourteen slots and the model wearing
  what is equipped; stats with their derived numbers; resistances; weight.
  Hover an item for its tooltip with every affix in its rarity colour.
- **Bag (B):** grid of slots, stacks with counts, unidentified items shown as
  a coloured question mark; click to identify with a short roll animation;
  drag to equip, right click for use, sell, drop.
- **Skills (K):** all 44, grouped, each with its bar, number, lock arrow, and
  the abilities it has unlocked and will unlock next.
- **Abilities (A):** everything learned, dragged onto the bar.
- **Crafting (V):** at a station: recipes you can make, greyed ones you cannot
  and why, the chance and expected quality shown before you commit.
- **Map (M):** the world map from the field at 8 km, discovered sites named.
- **Talk:** the NPC panel; buy, sell, train, heal tabs.
- **Trade:** the two sided window above.

**Settings (Escape or the gear)**
- Music volume, sound volume, mute either.
- Graphics: shadows on or off, draw distance (ring 6, 9, 12), pixel ratio
  (1, device), grass density, water reflections placeholder.
- Controls: invert drag, mouse sensitivity, key rebinding for the bar.
- Floating text scale.
- Dev mode toggle, since it exists.

**Character creation** (first boot, and `New character` in settings)
- Pick an opening; the model updates with the kit.
- Move up to 30 stat points and 30 skill points, live, with derived numbers
  shown changing (health, mana, carry).
- Appearance: build, skin, hair style and colour, marks, height.
- Name. Then the world.

## Death screen

Red vignette, "You have died." centred, a 5 second count, then the wake toast.
Nothing else, no menu.

## Presentation targets

- Swing, hit, cast and be-hit animations on the procedural rig: the arm swings
  through, the body turns into the blow, the caster raises a hand and the hand
  glows the spell's colour, the struck character flinches.
- Spell effects as instanced particles with the spell's colour: a bolt, a burst,
  a ring on the ground, a column for Meteor.
- Loot bags glow their rarity colour on the ground.
- Monsters from Blender as low poly rigs, six clips each (idle, walk, attack,
  hurt, death, special), flat shaded to match the world. Starting set: skeleton,
  wolf (exists as a farm model), goblin, rat, zombie, spider. Bosses later.
- The character too: three body builds from Blender replace the procedural
  rig, same rig contract (`buildCharacter` returns the same parts), so the
  animation code needs no change.
