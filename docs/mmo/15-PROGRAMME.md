# The programme: from here to a starting zone that wins backing

The user's brief, 2026-09-05, in their order and then in ours. The starting
zone comes first in everything below, because the user will paint and model
the Greenwold before anything else and wants it to carry the pitch.

## What was asked

1. Starting gear art in creation and in game. Done: 43 paintings filed.
2. World animals (squirrel, deer, birds) are not targetable and run on the old
   farmstead rules; redo their models.
3. Six to eight large towns with room for castles and shops later.
4. Vast vertical spaces, megalithic structures that feel divine, elevated zones
   of every kind.
5. A pirate port: a beach town with ships.
6. Moving events, wandering bosses and semi-bosses.
7. Monster difficulty that climbs by zone, with names colour coded so the
   player can read what will kill them.
8. Zone names hidden on the map until walked into (already so).
9. Unique environments: graveyards, tombs, deserts, more.
10. A base: an inn with a merchant square, a way to teleport home; player
    housing anywhere later.
11. A vast monster roster with unique abilities, difficulties and loot;
    tamable creatures in numbers.
12. The starting zone above all: gorgeous, storied, enough to do.
13. Many deep, giant dungeons: open caverns, unique landscapes, treasure
    chests and caches, epic bosses with unique abilities.
14. Drops biased 60/40 toward the player's class.

## Answers to the two design questions

**Difficulty and colour.** Yes to both. Monsters already carry a tier (1 to 5,
bosses 6) and the realms carry a danger band, so difficulty already climbs by
zone. What is missing is the player being told. The rule: compare the
monster's tier to the player's own tier, which is the tier band their best
combat skill falls in (skills.js BANDS and monsters.js TIERS agree on 0 to 100),
and colour the name on the nameplate, the target frame, the floaters and the
hover label: grey two tiers below you (no gain, no threat), green one below,
yellow the same, orange one above, red two or more above (it will kill you),
purple for a boss. A skull beside a red name. This is the World of Warcraft
"con" system and every player already reads it.

**Map names.** The map already hatches a zone you have not walked into and
hides its name; a walked zone is tinted and named. Places found within 70 m
are marked once found. Nothing to change; the new realms and subzones inherit
it because the same discovery record drives them.

## The order of work

### Wave A, now, on files that do not touch each other

- **F1 fauna.** Every world animal becomes a monster row of tier 0 (targetable,
  skinnable, tamable, flees), the old farmstead fauna layer is retired, and
  the critter models are redrawn: deer, rabbit, squirrel, fox, boar, goose,
  crow, gull, hawk, with a bird that actually flies. Same procedural PBR
  language as the dragon.
- **L1 loot bias.** `loot.rollItem` reads the character's top combat and craft
  skills and weights the item pool 60/40: sixty percent of gear rolls come
  from bases the character's skills use (weapon skill, armour the class wears,
  a focus for a caster), forty from the whole table. Materials and food are
  untouched.
- **C2 con colours.** The rule above as a pure function, and every surface
  that names a monster reads it.
- **M2 the roster.** Forty new monsters and twelve realm bosses as data, each
  with at least one ability of its own (a charge, a web, a breath, a summon, a
  phase), tamable flags with a Taming difficulty, loot tables, habitat by
  realm and subzone, so the sheet in realms.js has things living in it. New
  families need models later; each row names the family it borrows a body
  from until then.
- **Z2 the world table.** zones.js is generated from realms.js: nine realm
  zones with their subzones as nested records, the biome overrides and climate
  the realms need (a desert on the north east shore, a glacier on the north
  west, a volcano on the east), the authored sites at the coordinates the sheet
  gives, and the Caldera Sea as open water in the middle. The map, compass and
  discovery already nest.

### Wave B, after Z2 lands

- **T1 towns.** Seven towns as large flattened precincts (a quarter kilometre
  across, with room for walls, castles and shop districts later): Hearthhome,
  the Canopy Court, the Red Queen's Harbour (the pirate port, with docks and
  hulls), the Last Well, Cairnfoot, Coldseat and Cinderport. Each with an inn,
  a merchant square, a smith, a healer, a stable, a bank, and the waystone.
- **D3 caverns.** A second dungeon generator beside the room-and-corridor one:
  open caverns with height, ledges, bridges over drops, waterfalls, a lit
  central chamber, side chambers, treasure chests and loot caches with
  lockpicking, and a boss arena. Every realm dungeon in the sheet gets a
  layout kind.
- **E2 events.** Moving events on the world clock: the Legion's march between
  camps, the Tithe Wagon, the Ghost Tide, the Bone Wind, the Blossom Fall, the
  Long Night, the Brass City's circuit; wandering bosses that walk a route and
  can be met anywhere on it.
- **V1 vertical.** Elevated subzones and megaliths: the Hanging Gardens climb,
  the Sky Bridge, the Eyrie's landing steps, the Rib Cathedral, a divine
  megalith per realm that is seen from a kilometre and climbed. Terrain gets
  cliffs and mesas the field can carry.

### Wave C, the starting zone

- **S2 the Greenwold.** With the world table, the towns and the caverns in:
  Hearthhome laid out as the first great town, the Standing Hedge as the
  waystone ring, the Old Cellars as the first cavern dungeon, Highwayman's
  Hollow moving after raids, the Sunken Chapel to swim into, the Beech Hangar
  with Old Grist, the Chalk Pits, the Kingsroad with the Tithe Wagon and Vane's
  camp, every named person from 14-KALDERA standing where they belong, the
  first hour scripted end to end. Painted underlay for the region map.

### Wave D, later

- Player housing anywhere; the inn's room as the rest point until then.
- Tamed creatures as companions beside the dragon.
- Realm close-up maps and the painted world map.
- Models from the user replacing the procedural bodies, one family at a time.
