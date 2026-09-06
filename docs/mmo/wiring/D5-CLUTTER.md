# D5: fewer stones, and a hedge that bounds something

Written 2026-09-06, after the user looked out of the window at the Greenwold
with D4's thinning already on it and said:

> we have way too many stones everywhere, lets reduce by a lot. also reduce
> weird fences and objects all throughout the world, just looks like garbage.

Two complaints, and D4 had only got at a fraction of the first one.

**The stones were mostly not the dressing at all.** D4 cut the sarsen from 467
to 28 a square kilometre and reported that as the answer to "so many rocks that
look so bad". It was the small half. `flora.js` drops one boulder candidate in
every 8 m cell of the world, and at `ROCK_DENSITY.meadow` of 0.03 that is 469
candidates a square kilometre before the ground refuses any of them and **425
boulders after**. Fifteen to the hectare, in the country the player starts in,
on a grid nobody had looked at since it was written.

**The fences were the hedgerow and the drystone wall,** and they were the two
biggest kinds in the world by a factor of eight over the third. Split by the
ground they stood on, the open Greenwold meadow carried 1515 hedge segments and
1142 wall segments a square kilometre, against 94 and 59 on the farmed ground
where a hedge means something. A hedgerow run is forty to a hundred and twenty
metres, so 1515 segments is about sixty four runs a square kilometre: a hedge
every hundred and twenty five metres in every direction, each of them bounding
nothing at all, with a gate or a stile in the middle of it leading from grass
into grass.

## Files

Changed:

- `src/world/dressing.js` the `only: 'worked'` rule and `workedAt`, the
  `openChance` field on a kit row, five retuned Greenwold rows, and two new
  guards in `auditKits`.
- `src/world/flora.js` `ROCK_DENSITY` for the meadow, the shore and the
  blossom ground.
- `src/world/dressing.test.mjs` 157 checks, up from 145. The open country
  section is rewritten.
- `src/world/dressing_density.test.mjs` 24 checks, up from 12. A second before
  and after table, split by ground, and a Stormpeaks pin beside the Boneyard's.
- `src/world/flora.test.mjs` 146 checks, up from 137. A new section that counts
  the boulders and proves the ore is not on their grid.

New:

- `docs/mmo/wiring/D5-CLUTTER.md` this.

Nothing else was touched.

## Wiring Fable has to do

**None.** Every change is a number in a table or a filter inside
`dressingFor` and `recordsFor`, both of which have been streamed by
`src/game/world_runtime.js` since Z3 and A1. No new export needs a caller and
no new file needs importing. `workedAt`, `onlyOk` and `WORKED_REACH` are
exported for the tests, which drive the same functions the placement drives.

## 1. Worked ground

A hedgerow and a drystone wall are the boundary of something. Rolled on the
anchor grid with nothing but a `chance` in front of them they were the boundary
of nothing, so they now carry a notion of where they belong.

`WORKED_REACH` is 110 m, one run's own longest length. `workedAt(fields, x, z)`
asks whether any farm field of the chunk's own layout is within that of a
point, and it is free out in the open country, where the list is empty.
`poolFor` grew a sixth argument for it and `onlyOk` decides what a row's `only`
means:

- `only: 'road'` and `only: 'site'` are unchanged: a cart, a signpost, a
  milestone and a wayside shrine still stand beside a road and nowhere else.
- `only: 'worked'` is new. The kind is kept where a field is within
  `WORKED_REACH` or a road is near, and struck out of every other cell in the
  world.

`auditKits` throws on an `only` that names no ground, and on `only: 'worked'`
in a realm that farms nothing, since such a row would be struck out of every
cell of that realm and never reach the world at all.

## 2. `openChance`, and why `only` was not enough

The first cut put `only: 'worked'` on the hedgerow and the wall as well. That
is honest about where a hedge belongs and it is what the open meadow looks like
without one: the nearest authored thing went to a mean of 59 m and a worst, over
two hundred sampled open points, of 181 m. The Greenwold had gone from a joke
shop to a lawn.

A hedgerow is not garbage because it stands in open grass. It is garbage at
sixty four runs a square kilometre. So the two of them carry an `openChance`
instead: the pool roll uses `chance` on worked ground and beside a road, and
`openChance` everywhere else.

| kind | chance on worked ground | openChance |
|---|---|---|
| hedgerow | 0.34, up from 0.20 | 0.020 |
| drystone_wall | 0.28, up from 0.16 | 0.016 |

That is about six runs a square kilometre in the open meadow, one every four
hundred metres, which is a field boundary seen across a valley. And the farmed
country got **fuller**: 152 to 204 hedge and wall segments a square kilometre on
worked ground.

`auditKits` throws on an `openChance` of zero and on one above the row's own
`chance`, which would mean a hedge was rarer on a farm than in the middle of
nowhere.

## 3. The five retuned rows

| row | was | now |
|---|---|---|
| hedgerow | `chance: 0.20` | `chance: 0.34, openChance: 0.020` |
| drystone_wall | `chance: 0.16` | `chance: 0.28, openChance: 0.016` |
| sheaf | nothing | `only: 'worked'` |
| hay_rick | `rare: 0.14` | `rare: 0.055` |
| beehive | `rare: 0.20` | `rare: 0.095` |
| sarsen | `rare: 0.05` | `rare: 0.008` |

The sheaf gets `only` and not an `openChance` because a sheaf is cut corn.
There is no version of one standing in open meadow that means anything.

`rail_fence`, `field_gate` and `stile` were not touched and did not need to be.
Z4 made all three tier `field`, so neither grid can roll one: a gate or a stile
reaches the world only as the gap in a run, and a rail fence only as a field's
own boundary. Cutting the runs cut them with it, which is why the gate went from
78 to 15 a square kilometre without a line of code about gates. Every one of the
58 gates and 20 stiles in the measured square carries a run id, counted.

## 4. The boulders

`ROCK_DENSITY` is the chance per 8 m cell that a boulder stands there.

| biome | was | now | why |
|---|---|---|---|
| meadow | 0.03 | 0.0025 | the country the user was looking at |
| beach | 0.03 | 0.006 | the same shore the Greenwold runs down to |
| sakura | 0.05 | 0.008 | the blossom ground at its edges |
| mountain | 0.24 | 0.24 | a mountain is made of stones and is where a pickaxe is for |
| boreal, desert, snow | unchanged | unchanged | other realms' ground, not what was complained about |

Nothing reaches zero, so `auditBiomeHarvest` still finds something to mine in
every biome, and the mines and the cave rings are untouched: the ore round a
cave mouth and a mine's surface seams are placed off the site, not off this
grid. Driven both ways in `flora.test.mjs`: with the whole of `ROCK_DENSITY`
emptied, the 279 boulders round three cave mouths go to zero and all 24 ore
rocks stay exactly where they were.

## 5. The numbers

All per square kilometre, over the same 31 by 31 chunk square at the origin on
the world seed 20260904, which is 3.94 km2 of the farmed country. The before
column was measured in one process against the same field and the same seed at
the commit before D5.

### The dressing, over the whole square

| kind | before | after |
|---|---|---|
| hedgerow | 1608.9 | 286.3 |
| drystone_wall | 1200.4 | 192.8 |
| sheaf | 157.3 | 10.9 |
| field_gate | 78.2 | 14.7 |
| rail_fence | 51.8 | 51.8 |
| hay_rick | 44.7 | 23.1 |
| cabbage_row | 37.3 | 37.3 |
| stile | 30.5 | 5.1 |
| sarsen | 28.2 | 6.1 |
| beehive | 23.4 | 14.0 |
| field_hedge | 12.2 | 12.2 |
| wheat_row | 10.2 | 10.2 |
| furrow | 9.7 | 9.7 |
| sheep_fold | 4.3 | 4.3 |
| dew_pond | 2.0 | 2.0 |
| scarecrow | 1.3 | 1.3 |
| cart | 0.5 | 0.5 |

Every field border and every piece of road furniture is inside a twentieth of
what it was, which is the half of the promise the test asserts rather than
hopes for.

### The dressing, on OPEN ground only

A prop counts as open when no field lies within `WORKED_REACH` of it and no
road was near its cell.

| kind | open before | open after | cut |
|---|---|---|---|
| hedgerow | 1515.4 | 150.1 | 90.1% |
| drystone_wall | 1141.7 | 125.0 | 89.1% |
| sheaf | 146.1 | 0.3 | 99.8% |
| field_gate | 72.7 | 8.1 | 88.8% |
| hay_rick | 43.7 | 23.1 | 47.1% |
| stile | 29.2 | 2.8 | 90.4% |
| sarsen | 27.7 | 6.1 | 78.0% |
| beehive | 22.1 | 13.7 | 37.9% |
| sheep_fold | 4.3 | 4.3 | 0% |
| dew_pond | 2.0 | 2.0 | 0% |

The 0.3 sheaves a square kilometre still in the open are not a leak. The pool is
decided once per 32 m anchor cell, at its own centre, and the four scatter cells
under it inherit that answer and stand up to half an anchor cell plus their
jitter away from where the question was asked. One sheaf in ninety four, over
1024 chunks, landed just outside `WORKED_REACH`.

### The boulders, per square kilometre of each biome's own ground

| biome | before | after |
|---|---|---|
| meadow | 425.6 | 32.1 |
| mountain | 2214.9 | 2214.9 |
| snow | 360.2 | 360.2 |

## 6. What happened to the 60 m promise

Z3 wrote it and Z4 and D4 kept it: from twenty points of real open ground in
every one of the nine realms, something authored stands inside 60 m.

**In the Greenwold that promise was being kept by the thing the user was
complaining about.** It was written for the Boneyard, which is a graveyard of
nine dragons and has to read as one from anywhere in it. In the farmed country
it was held up almost entirely by 2657 hedge and wall segments a square
kilometre of open meadow.

It was not loosened to 90 m. It was **split**, because the Greenwold has two
grounds and they owe the player different things.

- **Farmed ground**, within `WORKED_REACH` of a field, keeps the whole 60 m
  promise and is fuller than it was. Measured over 30 open points: worst 51.3 m,
  mean 13.9 m.
- **Open meadow** between one farm and the next is meant to be grass. It is
  measured as a distribution and not as a worst case, because at these densities
  the worst of twenty points is a reading of which twenty points and nothing
  else: the same placement gave 101 m over twenty points and 145 m over two
  hundred. Over 120 open points: mean 51.3 m, median 49.1 m, p90 86.2 m, worst
  140.1 m. The promise asserted is median inside 60 m, p90 inside 110 m, and
  nothing anywhere further than 170 m, so quiet cannot drift into bare
  unnoticed.

The arithmetic says the second half cannot be a 60 m promise, or a 90 m one, at
the counts the user asked for. Six runs and about fifty loose props a square
kilometre cover roughly four fifths of the open meadow inside 90 m, and buying
the last fifth costs three times the props, which is the clutter back again.

The other eight realms are unchanged and still keep the flat 60 m. Worst of the
eight: 29.1 m, in the Ashen Throne.

## 7. Nothing else moved

`poolFor` grew an argument, `openChance` is read on every kit row in the world
and `workedAt` is asked of every anchor cell, so the question is not whether the
Greenwold came down but whether anything else came down with it.
`dressing_density.test.mjs` now pins two realms rather than one, and they are
the two sides of the shared code:

- the **Stormpeaks**, which farm and so exercise `farmsNear` and `workedAt`
  with real fields, and whose kit declares neither `only: 'worked'` nor an
  `openChance`. Ten kinds, 14360 props over the square, unmoved to the prop.
- the **Boneyard**, which farms nothing at all, so both functions are asked
  empty questions. Eleven kinds, 16475 props, unmoved to the prop.

Both were measured against the module as it stood before D5, in the same
process. Not one number moved.

## 8. Verification

Every suite that imports `dressing.js` or `flora.js`, plus the ones the brief
named, run with the exit code checked:

```
exit=0  src/world/dressing.test.mjs           157 passed, 0 failed
exit=0  src/world/dressing_density.test.mjs    24 passed, 0 failed
exit=0  src/world/flora.test.mjs              146 passed, 0 failed
exit=0  src/world/field.test.mjs               87 passed, 0 failed
exit=0  src/world/sitegrid.test.mjs            76 passed, 0 failed
exit=0  src/game/world_runtime.test.mjs       115 passed, 0 failed
exit=0  src/game/wiring.test.mjs              128 passed, 0 failed
exit=0  src/game/interact.test.mjs            143 passed, 0 failed
exit=0  src/world/roads.test.mjs               39 passed, 0 failed
exit=0  src/world/arbor.test.mjs              195 passed, 0 failed
exit=0  src/world/grass.test.mjs               89 passed, 0 failed
exit=0  src/world/town_layout.test.mjs         98 passed, 0 failed
exit=0  src/world/mine_models.test.mjs         61 passed, 0 failed
exit=0  src/mmo/plans/plans.test.mjs          129 passed, 0 failed
exit=0  src/game/gear_visuals.test.mjs        185 passed, 0 failed
```

`npx vite build` exits 0, 172 modules, 2.56 MB.

New checks worth naming, each driven both ways:

- `onlyOk` and `poolFor` on a sheaf: in the pool on worked ground, in it beside
  a road, out of it in open meadow, out of it on a village green.
- the open chance measured rather than asserted: over 6000 cells, 2025 worked
  cells hold a hedgerow against a declared 0.34, and 119 open cells against a
  declared 0.020.
- `auditKits` throws on a ground nobody works, on `only: 'worked'` in a realm
  that farms nothing, on an open chance above the worked chance, and on an open
  chance of never.
- the ore ring: 8 of 8 at every cave mouth, furthest 20.9 m of the 22 m ring,
  and unchanged with the whole of `ROCK_DENSITY` set to zero while the boulders
  round the same three caves go from 279 to 0.
- `ROCK_DENSITY` is checked to be back the way it was after that test, so the
  toggle cannot leak into the suites that follow it.

## 9. What was not verified

- **Nothing was looked at in a browser.** Every number here is from `node`
  against the shipping placement functions. What a hedgerow every four hundred
  metres actually reads like from a hilltop is a judgement the user will have to
  make with their own eyes, and the two levers to turn if it is wrong are the
  two `openChance` numbers in the Greenwold kit.
- **One flaky run.** In one batch of fifteen suites run back to back,
  `flora.test.mjs` reported 145 passed and 1 failed. Five later runs of the same
  file, alone and in the same batch, reported 146 passed and 0 failed, and the
  failing line was not captured. `flora.test.mjs` carries several wall clock
  budgets, so the likeliest cause is a timing check under load rather than
  anything placed differently, but that is a guess and not a measurement.
- **The other realms' shores.** `ROCK_DENSITY.beach` and `.sakura` came down
  world wide, not only in the Greenwold, so the Saltmarch's islets and the
  Sunken Kingdom's reefs carry a fifth of the beach boulders they did. That was
  the instruction and it is the right answer for the same reason, but no realm
  outside the Greenwold was measured for it.
