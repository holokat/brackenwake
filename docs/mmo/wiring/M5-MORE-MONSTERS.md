# M5: more of them, and more kinds of them

The complaint, in the user's words: "we dont have much variety of monsters, or
enough monsters in the game, we need more."

Two separate problems wearing one sentence. Not enough of them is the spacing
constants and the body cap. Not enough kinds is the roster and, more than the
roster, the habitat tables: three of the nine things this wave adds to the
Greenwold were already written down as rows and were standing nowhere a first
character walks.

Everything below was measured on the real field at seed 20260904 with
`scripts/measure-monster-density.mjs`, which is committed so the next person
does not have to take any of it on faith.

## 1. What was there

3,978 open chunks in the Greenwold, plus 401 in the eight named places. Open
country is the chunks the density constants govern; a named place carries its
own table and is measured separately.

| | before | after |
| --- | --- | --- |
| open country, day | 164.0 bodies per km2, 10 rows | 366.1 per km2, 14 rows |
| open country, night | 351.7 bodies per km2, 11 rows | 587.3 per km2, 15 rows |
| chunks holding a group, day | 27.6% | 56.9% |
| chunks holding a group, night | 55.9% | 98.4% |
| walking 600 m out of Hearthhome by day, bodies inside 300 m | 38.0 mean, 55 most | 72.3 mean, 84 most |
| the same by night | 78.8 mean, 80 most | 125.3 mean, 139 most |
| `monsters.update()` on that walk, day | 0.160 ms mean | 0.289 ms mean |
| `monsters.update()` on that walk, night | 0.329 ms mean | 0.490 ms mean |

The night line is the one that matters. 78.8 bodies against a cap of 80 is not
a density, it is a cap: the roll already wanted more than the world would hold,
and every extra group the spacing bought would have been thrown away by the
sweep. Raising `ALIVE_CAP` is the change that made the night denser at all.

## 2. Density

`src/mmo/monsters.js`

```
SPAWN_SPACING_M = { dungeon: 40, wildNight: 60, wildDay: 110 }   // was 110 and 220
```

`src/game/monsters.js`

```
ALIVE_CAP = 140                                                  // was 80
```

### GROUP_CHANCE is an expected count now, not a probability

A chunk is 64 m across. At a night spacing of 60 m the number of groups a chunk
holds is 64 / 60, which is 1.07, and a probability cannot be 1.07. The old code
read the number as a probability and gated on it:

```js
if (rand2(cx, cz, seed + SALT_GROUP + night) >= chance) return [];
```

which would have quietly capped the night at "every chunk holds exactly one
group" and lost the last seven per cent, while making the density test compare
100% against 106.7% and fail. So the gate became a count:

```js
export function groupsForChunk(chance, r) {
  const c = clamp(num(chance), 0, GROUPS_PER_CHUNK_MAX);
  const whole = Math.floor(c);
  return whole + (num(r) < c - whole ? 1 : 0);
}
```

One group in every chunk at night and a second in one chunk in fifteen, which
is what "one group per 60 m" actually says. `spawnsForChunk` then loops the
roll, and each pass gets its own anchor, so two groups in one chunk are two
camps and not one crowd.

**The keys did not move.** A character's `deadUntil` list is keyed by the spawn
record's key, and a camp cleared before this wave has to still be clear after
it, so the first group in a chunk keeps the key format it had
(`cx,cz:monsterId:i`) and only the second and later ones carry the group index
(`cx,cz:1:monsterId:i`).

Measured, both directions:

- `groupsForChunk(1.5, 0)` and `(1.5, 0.49)` are 2; `(1.5, 0.5)` and `(1.5, 0.99)` are 1.
- `groupsForChunk(0.58, 0.1)` is 1; `(0.58, 0.9)` is 0.
- `groupsForChunk(99, 0.99)` is `GROUPS_PER_CHUNK_MAX`.
- over 1,681 chunks of the real roll: 0.582 groups a chunk by day against
  GROUP_CHANCE.day of 0.582, and 1.061 by night against 1.067.

### The village clearing is untouched

`blockedAt` and `settlementClear` are the same lines they were. Nothing hostile
stands inside a town's or a hamlet's flat radius plus `SETTLEMENT_PAD`, nothing
stands inside `SPAWN_KEEP` of where the player starts, and nothing stands in
water or in a river over `RIVER_MAX`. The test that proves it ("nothing spawns
inside a town") is unchanged and still passes at the new densities.

### The cap is a sweep cap and always was

`rescan` refuses to despawn a body that has a target, because a wolf vanishing
out of a fight is worse than a wolf over the cap. So the honest claim is "the
cap plus whatever is mid fight", and the test now measures both halves: 142
standing, 2 of them in a fight, cap 140. Before this wave the same assertion
passed at a cap of 80 by luck, with nothing in the ring fighting at the moment
it was asked.

## 3. Variety

Five new rows, all wave `M5`, all inside the Greenwold's danger band of tier 1
to 2, all placed in the biome tables as well as in named places so that a wild
dog is a thing the meadow has and not a thing the Greenwold has.

| row | tier | hp | dmg | hit | def | AR | run | aggro | group | its own move |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Wild Dog | 1 | 26 | 3 to 7 | 22 | 22 | 3 | 7.5 | 12 | 3 to 5 | `howl`: the first blow it takes calls every wild dog within 30 m |
| Badger | 1 | 34 | 4 to 9 | 20 | 16 | 10 | 5.2 | 6 | 1 to 2 | `awakens`: inert until you are 4 m from it, and `nightOnly` |
| Bandit Archer | 2 | 46 | 7 to 12 | 41 | 40 | 10 | 6.2 | 14 | 2 to 3 | `bow`: the shot mode, holds ground and draws a dagger inside reach |
| Highwayman | 2 | 60 | 9 to 15 | 44 | 42 | 16 | 6.5 | 14 | 2 to 3 | `ambush` (hidden until 6 m, first blow doubled) and `coinPurse` at 2.5 |
| Scarecrow | 2 | 58 | 8 to 14 | 32 | 12 | 6 | 3.6 | 10 | 1 to 2 | `awakens`, `nightOnly`, `fireWeak`, never flees |

Every one of those numbers sits inside its tier's computed band, which is what
`auditMonsters()` checks and what stops a tier 2 row being a tier 3 one in a
tier 2 suit.

Four rows that already existed and were standing nowhere a first character
walks:

- **Giant Spider** into the Beech Hangar and the Chalk Pits at night, and the
  open meadow after dark.
- **Goblin Warrior** into the Beech Hangar at night. They come up out of the
  Old Cellars after dark.
- **Will o' Wisp** into the Mill Run's water meadow and the Sunken Chapel. It
  carried `fenOnly`, which is a placement guard and nothing else, and that tag
  was the one thing keeping a light over standing water out of the only two
  places in the first realm that have standing water. The tag came off the row
  and the placement is now the lists, which is where it always really was.
- **Fox** into the meadow's night list, so the Greenwold has a fox in it and
  not only the Beech Hangar and the Standing Hedge.

Two numbers on old rows moved:

- **Wolf** group is 3 to 4 and was 2 to 4, and it carries `sharesAggro` now,
  which it always should have.
- **`coinPurse` became a number.** See section 5.

### One case is never the case

None of the five is Greenwold-only. Wild dogs are in the meadow and in every
bandit camp in the world and in a dungeon's first level. Badgers are in the
boreal woods, which have setts too. Bandit archers and highwaymen are in bandit
camps everywhere. Scarecrows stand in any ruin and any graveyard. The tables
they went into are `HABITAT.meadow`, `.boreal`, `.ruin`, `.graveyard`,
`.bandit_camp` and the `T1` and `T2` dungeon lists.

### Bodies

`src/game/monster_models.js` gained two tables, both audited against the roster
at load, and neither of which changes anything for a row that does not name
itself in them:

```js
export const MONSTER_TINT  = { wildDog, badger, banditArcher, highwayman, scarecrow };
export const MONSTER_SCALE = { wildDog: 0.78, badger: 0.50, banditArcher: 0.97, scarecrow: 1.06 };
```

The tier colour stays the default for every row and stays the danger read; these
are the rows that share a silhouette with something else in the same band and
would otherwise be told apart by nothing at all. The con colour on the name
plate, which is what a player actually reads danger off, is untouched.

Nothing here is a finished body. In modelling order the queue is: the Scarecrow
(the only genuinely new silhouette, and the only one that needs a clip nothing
else has, which is coming down off the pole), then the Badger and the Wild Dog
(the wolf box at half and three quarters scale), then the two men, who can wait.

## 4. Packs

**What exists.** The roster rolls the count (`group`), `spawnsForChunk` gives
every group one anchor and scatters its members within `GROUP_SPREAD` of it in
x and in z, and `alertGroup` pulls the rest in when one of them acquires a
target, out to `GROUP_AGGRO_M`. `sharesAggro()` counts `sharesAggro`, `group`
and `alpha` as the same thing. `howl` calls a row's own kind within 30 m, once,
on the first blow it takes.

Measured over 3,721 chunks of the Beech Hangar's night table:

- 1,031 wolf packs, 3.49 wolves each, never fewer than 3 and never more than 4.
- No two members of any group stand more than 22.6 m apart, which is the
  diagonal of the `GROUP_SPREAD` box and the arithmetic ceiling; the widest
  measured was 20.5 m.
- Pulling one of a pack of 4 wolves pulls all 4. One of a pack of 5 wild dogs
  pulls all 5. One of a band of 3 goblin scouts pulls all 3.
- The other direction: the same packs spread out past `GROUP_AGGRO_M` and only
  the one that saw you comes. 1 of 4, 1 of 5, 1 of 3.

**What does not exist**, and is not claimed anywhere:

- **The pull does not chain.** `alertGroup` runs once, from the body that
  acquired the target, and reaches 8 m from that body. A pack strung out over
  20 m is pulled in halves. Nothing walks the graph.
- **`warCry` is unwired.** Nothing is lifted by a shout. The Legion Soldier and
  three bosses carry it.
- **`leadsGoblins` is unwired.** No goblin spawns around a hobgoblin and none
  fights better for it.
- **`charges` is unwired.** No run up and no harder blow at the end of one. The
  boar, the raider, Old Grist and the musk ox all carry it.
- There is no flanking, no circling, no leader, no morale, and killing the
  biggest one does not scatter the rest. A pack is a number of bodies that
  arrive together and then fight as individuals.

`shieldWall` and `howl` are the two group behaviours that are real, and both
were already wired before this wave.

## 5. `coinPurse`, which was decoration

The tag's own words are "carries coin over its tier band". It was carried by
the Bandit, the Raider, Sergeant Oram Blackhand and Huntmaster Gallow, and
`TAG_RULES` said, correctly and out loud, `unwired`: "the gold is the tier band
or the row gold; the word adds nothing". A bandit's purse was a rat's purse
with a better name.

The user asked for a highwayman with better gold. Better gold could not come
from the row's `gold` field, because `auditMonsters` pins that to the tier and
should: a row that quietly pays tier 3 money is a tier 3 row. So the tag is
worth something now:

- `src/mmo/monsters.js` owns the number. `DEFAULT_PURSE` is 1.5, `MAX_PURSE` is
  4, a row may name its own `purse`, and `purseMultiplier(row)` returns 1 for
  anything without the tag so the caller can multiply unconditionally. The
  audit refuses a purse with no tag, a tag with no multiplier over 1, and a
  purse outside 1 to 4.
- `src/game/loot_drops.js` spends it, on the one line that turns a kill into a
  sack. Everything without the tag multiplies by 1 and is bit for bit the roll
  it always was.
- The Highwayman names 2.5.

Measured over 200 kills each: a Bandit averages 30.5 gold against the tier's
band of 12 to 30 and not one kill of 200 falls outside 18 to 45. A Goblin
Warrior, which carries no purse, pays inside 12 to 30 on all 200. A Highwayman
pays more than a Bandit of the same tier.

`TAG_RULES` gained `'loot_drops.js'` as a place a tag can be dealt with, and the
unwired count went from 23 to 22.

## 6. The bug the density found: six Sergeant Oram Blackhands

A place's roster is rolled per chunk. The Old Cellars are 46 chunks wide and
Oram Blackhand is written into their table, because `auditMonsters` insists a
boss's lair holds him. So the roll wanted six of him across the realm and four
Old Grists in the Beech Hangar, and at M5's densities more than one of each
inside a single near ring at the same time. This was true before this wave; the
extra density is what made it visible.

`src/mmo/monsters.js` now says what kind of row this is:

```js
export const isUniqueRow = (m) => !!(m && (m.boss || m.unique));
```

`oldGrist` carries `unique: true`, every boss is one already, and the audit
refuses a unique row with a group size over 1.

`src/game/monsters.js` reads it in `oneOfEachUnique`, which both `rescan` and
`dungeonRescan` run over the distance-sorted candidate list before the cap gets
it. A body already standing wins, so a boss is never yanked out from under a
player walking up to him; otherwise the nearest wins. Everything that is not
one of a kind passes straight through, and the roll itself is unchanged.
`stats.doubles` counts what was thrown away, so "there is only one Old Grist" is
a number on the overlay and not a claim.

Measured by walking 300 m across the Old Cellars at night on the real field: 5
second copies thrown away at the worst, 1 one-of-a-kind body standing. Without
the rule, 6 would have been on their feet at once.

## 7. Files

| file | what changed |
| --- | --- |
| `src/mmo/monsters.js` | `SPAWN_SPACING_M`; `DEFAULT_PURSE`, `MAX_PURSE`, `purseMultiplier`; `isUniqueRow`; five M5 rows; wolf group and `sharesAggro`; `fenOnly` off the wisp; `unique` on Old Grist; the meadow, boreal, ruin, graveyard, bandit camp and dungeon lists; all eight Greenwold place tables; three new audit rules |
| `src/game/monsters.js` | `ALIVE_CAP`; `groupsForChunk` and `GROUPS_PER_CHUNK_MAX`; multi-group `spawnsForChunk`; `oneOfEachUnique` in both sweeps; `stats.doubles`; `TAG_RULES.coinPurse` and the `loot_drops.js` place |
| `src/game/monster_models.js` | `MONSTER_TINT`, `MONSTER_SCALE`, `bodyColourFor`, `bodyScaleFor`, and the audit over both tables |
| `src/game/loot_drops.js` | the purse multiplier on the kill's gold |
| `src/game/monsters.test.mjs` | density measured as groups and not as chunks; the cap block overfilled on purpose; the cap claim stated with the ones mid fight; the pack block; the one-of-a-kind block; the unwired count |
| `src/game/loot_drops.test.mjs` | the gold band against the purse, both directions |
| `docs/mmo/05-WORLD-CONTENT.md` | the wave M5 table, and `fenOnly` off the wisp's row |
| `docs/mmo/17-GREENWOLD-BESTIARY.md` | section 3a, the measured mix, the wolf's pack size, the fox's night, the count and the modelling queue |
| `scripts/measure-monster-density.mjs` | new, and the source of every number above |

## 8. What is not verified

Nothing in this wave has been seen in a browser. The bodies are measured as
geometry and audited as data, and the tint and the scale are proved to reach
`buildBoxMonster` and `buildMonsterModel`, but nobody has looked at a badger.
`npx vite build` passes and `monster_models.test.mjs` passes, which is not the
same thing as a badger looking like a badger.

The frame cost is node's, on a stub-free real field with real sites but with no
renderer, no shadows and no draw calls. 0.49 ms a frame for the streamer's own
update at 126 bodies is the streamer's cost and says nothing about what 126
bodies cost to draw.
