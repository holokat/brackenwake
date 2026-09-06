# C3: nothing kites, and the starting zone is not grey

Two complaints, in the user's words:

> I'm very annoyed that the monsters kite me so much, they should not be running
> away unless low health.

> why are starter zone monsters grey when they should be fair fight or at the
> very least green?

## 1. Kiting

### The rule now

A monster moves away from what it is fighting for exactly one reason:
`combat_rules.fleeCheck`, which is its own family's `flees` rule. A boss's
scripted `retreat` phase is the one exception and it goes through the same
`'flee'` state and says a line first.

Everything else holds its ground:

| distance to the target | what a ranged row does |
| --- | --- |
| past `ctx.range` | closes, facing the target |
| inside `ctx.range` | stands exactly still and throws, shoots, casts or breathes |
| inside `ctx.meleeReach` | stands exactly still and swings with its hands |

`ctx.range` is `monster_ai.rangeOf(row)`: 6 m for a breath, `RANGED_FAR` 14 m
for a knife, an arrow, a bolt or a spell. `ctx.meleeReach` is the row's own
`naturalWeapon(row).reach` plus both bodies, and it is NOT `ctx.reach`, because
a thrown weapon carries its range as its reach and so `combat.reachBetween`
answers 14 m for a goblin scout. Getting that wrong once, mid change, made a
scout think it was already in melee at ten metres and stop throwing knives.

`out.melee` carries the third row up to the runtime, which reads it in two
places: `stepCast` is never asked for a cast inside melee reach, and the swing
that goes out does not also launch a projectile. A thrower inside sword reach
draws the dagger.

### What was removed

| gone | what it did |
| --- | --- |
| `RANGED_NEAR` (8 m) | the near edge of the old standoff band |
| `RANGED_BACKOFF` | closer than this and it walked backwards |
| `CORNER_MOVE_FRACTION`, `CORNER_SECONDS` | how long a backing step had to fail before it gave up |
| `UNCORNER_M` | how far clear it had to get to start backing away again |
| `ai.cornered`, `ai.cornerFor`, `out.cornered`, `mon.cornered` | the state the above ran on |
| the `back()` helper and the `stuck()` predicate in `stepMonster` | the backing step itself |

`stepAway` stays. Its only caller now is the `'flee'` state.

### What was kept, and why

- **The leash.** `combat_rules.leashCheck`: aggro radius times 2.5, held for six
  seconds, and the monster walks home and heals. That is a monster moving away
  from the player, and it is deliberate. It fires only after the player has
  dragged it 37 m or more from its spawn and stood there; without it a wolf
  follows you across a realm. It is a reset, not a kite.
- **The critter spook.** `SPOOK_M`: a rabbit bolts before you have touched it.
  That IS its own `flees` rule, `flees: 'always'` and `fleeCheck` returning true
  at any damage, and 02-COMBAT asks for it.
- **The flyer's stoop.** `planDive`: a flyer at hover height with its target more
  than `DIVE_TRIGGER_M` (8 m) away comes down, hits for `DIVE_MULT`, and climbs
  again. It gives up no ground horizontally; what it takes back is altitude, and
  `SWOOP_SECONDS` is the window in which a swordsman can hit it. Kept as it was.
- **The boss retreat phase.** The Drowned Knight, Thalassa and King Caradoc each
  have `{ kind: 'retreat' }` as one of their two phases, with a line each. It is
  scripted, it is announced, and it ends after `RETREAT_SECONDS`.

### One thing that changed on the way

`ctx.range` used to be `RANGED_FAR` for every mode, breath included. A wyvern
therefore held at fourteen metres and breathed a six metre cone at air, and
`stepCast` said "you are out of it" every time. It now closes to its own range
first. Measured: from 10 m it closes to 6.00 m and breathes.

### Measured

`src/game/monster_ai.test.mjs`, 28 checks, all through the real `stepMonster`.
300 frames at each distance with the player standing still:

| goblin scout at | gap start to end | frames the gap grew | attacked on | using |
| --- | --- | --- | --- | --- |
| 12 m | 12.00 to 12.00 | 0 of 300 | 300 of 300 | knives |
| 3 m | 3.00 to 3.00 | 0 of 300 | 300 of 300 | knives |
| 1 m | 1.00 to 1.00 | 0 of 300 | 300 of 300 | hands, 120 of 120 |

Driven the other way, so the flee rules are proved to still work:

| case | result |
| --- | --- |
| wolf (beast) at 20% health | flees: 4.0 m to 18.8 m, 135 frames wider |
| wolf at full health | closes: 4.0 m to 2.6 m, 170 swings, 0 flee frames |
| skeleton (undead) at 5% health | does not flee: 4.0 m to 2.4 m, 158 swings |
| goblin scout at 10% health | flees: 3.0 m to 22.8 m, 180 frames wider |

In `src/game/monsters.test.mjs`, through the dungeon runtime rather than by
hand, the goblin scout's gap to the player is watched on every one of the frames
before its first knife and never widens on any of them.

## 2. The con

### The bug

`con.js` read a player's tier as the band of their best combat skill, floors
`[0, 10, 30, 50, 70, 90]`. Every opening but Blank starts with 50 in its main
skill, which is band 3. The Greenwold's danger band was `[1, 1]`. So a fresh
Warrior read every monster in his starting zone as two tiers below him: grey,
"no threat", on his first morning.

### The fix, in two halves

**(a) The Greenwold is a tier 1 to 2 realm.** `src/mmo/realms.js`,
`danger: [1, 1]` becomes `danger: [1, 2]`. Every other realm's band is
untouched.

The band reaches spawning through `zones.js` (which reads `realm.danger`
straight off the sheet) into `field.sampleAt().danger`, and
`monsters.spawnsForChunk` caps an open country roll at `band[1]`, rerolling six
times and then dropping the group. A named place out of `HABITAT_BY_PLACE` is
deliberate and is not capped, which is why the Kingsroad already stood Legion
soldiers on it.

Measured on the real field at seed 1234, every open country chunk inside the
Greenwold's 2200 m radius, rolled at chance 1:

| | chunks | produced nothing | bodies | tier 1 | tier 2 |
| --- | --- | --- | --- | --- | --- |
| before, day | 2664 | 263 | 5498 | 100.0% | 0 |
| after, day | 2664 | 1 | 6443 | 27.6% | 72.4% |
| before, night | 2664 | 181 | 5087 | 100.0% | 0 |
| after, night | 2664 | 1 | 6943 | 26.8% | 73.2% |

Before, day: goblin scouts and giant rats and nothing else. After: raiders,
goblin scouts, Legion soldiers, Legion archers, bandits, giant rats, boar.
Before, night: skeletons and zombies. After: Legion soldiers, wolves, raiders,
skeletons, bandits, zombies.

The "produced nothing" column is the second effect and was not asked for: with a
cap of 1 on a meadow table that is mostly tier 2, one chunk in ten rolled six
tier 2 groups in a row and stood empty. That is gone.

Goblin warriors and skeleton warriors were named in the brief as tier 2 rows to
put in the open. There is no `skeletonWarrior` row in the roster at all, and the
goblin warrior is not in `HABITAT.meadow`: 17-GREENWOLD-BESTIARY puts it in the
Old Cellars, and `HABITAT_BY_PLACE.oldcellars` is where it lives. Adding either
to `HABITAT.meadow` would put it in every meadow in the world, not just this
one, so neither was added.

**(b) A player reads one rung below their skill band.**

```
rung = max(0, band - CON_TIER_DROP)      CON_TIER_DROP = 1
```

`playerTier` still answers the BAND, because a bench readout and a training
screen mean the band by it, and `targeting.js` re-exports it. The new `conTier`
answers the rung, and `conOf` uses it. `conOf` now returns `band` beside `mine`
so a caller can see both. `MAX_PLAYER_TIER` is still 5 and the boss rule is
untouched: a boss is purple to everybody.

| band | skill | rung | a wolf (tier 2) reads |
| --- | --- | --- | --- |
| 0 | 0 to 9 | 0 | red, it will kill you |
| 1 | 10 to 29 | 0 | red |
| 2 | 30 to 49 | 1 | orange, dangerous |
| 3 | 50 to 69 | 2 | yellow, a fair fight |
| 4 | 70 to 89 | 3 | green, easy |
| 5 | 90 to 100 | 4 | grey, no threat |

A fresh Warrior (swordsmanship 50, band 3, rung 2) reads a wolf yellow, a goblin
scout green, a rabbit grey, a tier 3 row orange and Oram Blackhand purple. Not
one of the ten rows the open Greenwold can spawn reads grey to him. A Blank,
with every combat skill at 0, reads a tier 1 goblin scout orange. A grandmaster
at 100 is band 5 and rung 4, so tier 5 reads orange to him and tier 4 yellow.

`auditCon()` gained two guards that run at import: a character with nothing
trained must read as rung 0, and a character at skill 50 must read as rung 2, so
a change to either the floors or the drop dies at load rather than turning a
starting zone grey again.

## 3. Fixtures changed, and why

| file | what | why |
| --- | --- | --- |
| `src/mmo/monsters.test.mjs` | "every boss is ranked at its realm's own danger" becomes "inside its realm's own danger band", plus a second check that a one tier band still pins the rank exactly | the Greenwold is the only two tier realm, and Oram Blackhand's 520 health is a rank 1 number that belongs at rank 1 |
| `src/game/monsters.test.mjs` | the standoff and cornered blocks rewritten to measure that no ground is given; the open Greenwold spawn check | the behaviour they described is gone |
| `src/game/targeting.test.mjs` | four fixtures moved from swordsmanship 30 to 50, one from 55 to 75 | they meant "a player who reads as tier 2 / tier 3", and the skill for that moved up one band |
| `src/game/hud.test.mjs` | "a middling one" moved from swordsmanship 30 to 50 | same |
| `src/game/win_map.test.mjs` | the Greenwold's header danger word is now read off `dangerWords(ZONE.greenwold.danger)` rather than pinned to `DANGER_WORD[1]` | it is a two tier band now and says both ends |
| `src/world/zones.test.mjs` | three fixtures that pinned the heart at tier 1 | the band moved, and two of the three now read off the zone rather than a literal |

Docs: `docs/mmo/15-PROGRAMME.md` ("Difficulty and colour"),
`docs/mmo/17-GREENWOLD-BESTIARY.md` (the open country paragraph and the two rows
that promised a backing step), `docs/mmo/wiring/G3.md` (the standoff section,
marked superseded, and the constants table).
