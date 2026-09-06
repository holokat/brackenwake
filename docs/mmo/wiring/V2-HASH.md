# V2: the world after the hash was corrected

Wave B follow up, task V2. Written 2026-09-06 by the V2 builder.

**On the filename.** The task asks for `V2.md`. That name was already taken by
an unrelated note ("V2 wiring: grown trees, boulders and grass"), so this is
`V2-HASH.md` rather than an overwrite of somebody's work. The same thing was
done three times before in this folder, with `V4b.md`, `V1-VERTICAL.md` and
`R1-COAST.md`.

Fable corrected `src/world/noise.js` `hash2` on 2026-09-06, after Z4 measured
what it was doing. The hash mixed its seed in as `seed * 2147483647` in a
double; the world seed is 20260904, so that product is 4.35e16, past the 2^53
where a double stops holding every integer. The low bits of the seed's
contribution were rounded away, two salts of the same cell came out correlated,
and every roll drawn after another roll of the same cell was partly a reading of
the first one. `Math.imul` on all three terms keeps every bit.

For any seed under about four million the answer is bit for bit what it was,
which is why nearly every suite that builds its own small world is untouched.
For the world seed, everything the world rolls for itself re-rolled: the sites,
the tables of the mesa and terrace realms, the mines' cuts and seams, the roads
that follow the settlements, the trees, the dressing and the caverns. The
authored places in `zones.js` LAYOUT did not move, and none of them was moved by
hand here either.

**The seed is not the only term that overflowed.** `x * 374761393` passes 2^53
for any x over about twenty four million, and `src/mmo/loot.js` hands `hash2`'s
own uint32 output back in as the next `x`. So the loot rolls moved as well,
under seeds of nought to a thousand: see section 7. Measured, at a salt of 4109,
0 of 1000 small first arguments differ between the two hashes and 955 of 1000
uint32 ones do.

Sixteen checks across twelve suites went red. Two of them were real bugs, both
in the relief code and both there since V1 wrote it; the other fourteen were
fixtures, or a check of the bug itself. Z4's own workaround came out with them.

The whole of what was touched: `src/world/field.js`, `src/world/dressing.js`,
`src/world/field.test.mjs`, `sitegrid.test.mjs`, `wayside.test.mjs`,
`dressing.test.mjs`, `flora.test.mjs`, `chunks.test.mjs`,
`mine_models.test.mjs`, `town_layout.test.mjs`, `cavern_gen.test.mjs`,
`src/game/events_runtime.test.mjs`, `docs/maps/*.svg` and this note, plus two
string constants and a comment in `src/mmo/loot.test.mjs`, which is outside the
list and is section 7. `src/world/noise.js` is Fable's fix and is byte for byte
as Fable left it. `zones.js` and `roads.test.mjs` were read and not changed:
nothing authored had to move, and no road check needed anything.

---

## The sixteen, and which was which

| # | suite | what went red | fixture or bug |
|---|---|---|---|
| 1 | field | the heart digest | fixture |
| 2 | field | the Ember Wastes relief digest | fixture |
| 3 | field | the cell the Standing Hedge took would have rolled nothing | fixture |
| 4 | field | the steepest metre with relief, 7.60 against 7.51 without | **bug**, in `reliefKeep` |
| 5 | field | 86 of 89 table tops have a way up | **bug** in the ramp's grade, and the wrong instrument |
| 6 | wayside | a bridge inside Crookmoor's pad | fixture |
| 7 | wayside | 94 pieces inside the Standing Hedge's body | fixture |
| 8 | flora | the avenue read 4.8 trees per 100 m | fixture |
| 9 | chunks | the mesa top read as rock | fixture |
| 10 | mine_models | twenty seven cuts and forty two seams | fixture |
| 11 | town_layout | the one town the roads reach | fixture |
| 12 | town_layout | the keep behind the roofs, three checks | fixture |
| 13 | cavern_gen | the arena is the room furthest from the mouth | fixture |
| 14 | events_runtime | sixteen bodies despawned instead of five | fixture |
| 15 | dressing | the raw world seed skews the roll after a roll | **the check of the bug itself**, rewritten |
| 16 | mmo/loot | two digests of 24000 drops and 3000 kills | fixture |

---

## 1. The two digests, and the cell the hedge took

**The heart.** The 2 km square about the origin, 101 x 101 samples at 20 m,
every field of every sample. It moved because the sites rolled inside that
square moved, which is the hash and nothing else: relief is exactly zero inside
HEART_SAFE and the square is wholly inside it.

```
6408cb4e64daf869910a654e0737f570d78de706987ee244f8e55f76c265a521   before the coast
47ff5817bbd7265ba9f1635840ef43de3f09b7f9c603b2747d784f26f60aefaf   the coast
77a4a1da5f978a158c2f870c60ed4608d1de65da4fdc666aaa6b9fa27facb0a5   and the spawn clear
701b023f02253c6d363e59737d8c0c0bb4cc5dd72329379c5941aacf36c1e151   the Greenwold became meadow
fddafa24dc47cf896ec29c512c16e9a2b919ded8e89dc76ecb98c0bfaf1bbf27   the hash
```

10201 samples, 4014 of which name a site and 3438 a site that lays a pad.

**The relief.** The same square about the Ember Wastes' own centre, digesting
the difference between the world with relief and the world without it, taken
from `raw` so nothing anyone else places can move it. It moved for two reasons
rather than one: the tables are rolled off `rand2(i, j, seed + 811..817)`, so
every one of them moved with the hash, and `reliefKeep` changed (section 2).

```
c6900f56e4226872282239f5d7455e5f6f9bf17aa42da993090fdb412bef5deb   V1
c8738d3e0ea76e50069ffe317fc0ad9298a4199042f3c48c9029133a00698623   the coast
d807c78135a47572d0ebcc93609deac2203fd7d509bdc62172a1efa669972494   the hash and the mask
```

17% of that square is lifted, up to 33.3 m, with 67 river cells left dry.
`PRINT_HEART=1` prints the first and `PRINT_RELIEF=1` the second.

**The cell the hedge took**, and this was a fixture in the worst way. It read
"the cell it took would have rolled nothing anyway", with the roll for cell 0, 1
coming in over SITE_CHANCE. That was true of the rolls the broken hash made and
of nothing else: the cell rolls 0.4734 now and would have held a cave with a
twelve metre pad. The claim is a function of the current rolls now, and it is
the claim that was always being made: **the hedge lays LESS pad than the roll
whose cell it took**, so the digest is a square of ground the world moved less
than it would have on its own. `rawRoll` is not exported, so the roll is rebuilt
out of the parts that are, in sitegrid's own order; and the rebuild is held
against the real world on the fifteen unauthored cells of the same square that
hold a rolled site. It names the kind of every one of them.

---

## 2. The steepest metre in the world (bug)

```
FAIL the steepest metre in the world with relief is no steeper than without it
     7.60 m with relief at 741.3, -3854.1, 7.51 m without, over 200000 probes
```

The probe is a river bank in the Stormpeaks: the ground falls from 10.47 m to
-0.76 m and climbs back to 11.58 m over four metres, and that is the steepest
metre in the whole 15.6 km square with relief and without it. Relief added
0.089 m to it, and the 0.089 m is the whole of the failure.

**Where it came from.** `shapeOf` finished every relief sample by multiplying it
by `reliefKeep(x, z)`, a smoothstep over the mountain noise. That is the one
thing the header of that section of `field.js` forbids in as many words: *EVERY
WALL IN HERE IS BUILT OUT OF A DISTANCE, never out of a noise value*, because a
smoothstep over a noise field has a gradient nobody can bound. Measured over the
Stormpeaks, the mask moves by up to **0.0154 in a metre**, so a sixty metre
plateau carried **0.92 m of noise-shaped slope in every metre of it**, laid on
top of whatever the ground was already doing. At 741, -3854 the terrace was flat
and the mask was not, and 15 m of terrace times 0.0059 of mask is 0.089 m.

The same mask made the Ashen Throne's rim anything between **17 and 80 m round
its own circumference**, which is a fence and not a rim.

**The mask is asked once per THING and never per point now.** A table asks it at
the table's own centre, the crater at the throne, the plateau at the Eyrie and
the shelf at Frostreach's own middle, once each, for ever. What comes out is
folded into the thing's HEIGHT, so its run and its ramp shrink with it and every
face in the world still stands at exactly `RELIEF_GRADE`. There is no
noise-shaped gradient left anywhere in the relief; every metre of it is a
distance gradient bounded by `RELIEF_MAX_STEP`.

Measured over the same 200,000 probes of the same 15.6 km square: the steepest
metre in the world with relief is **7.51 m at 741.3, -3854.1** and the steepest
metre without relief is **7.51 m at the same point**, to the last bit. Relief is
not the steepest thing anywhere.

What that construction gives and what it does not: relief's own gradient is now
bounded by 3.0 m a metre by arithmetic, and the steepest ground this world makes
is a river bank at 7.51. Nothing forbids some future table's wall from standing
on a bank that steep. If one ever does, this line goes red and names it. What
has been taken away is the part that was not bounded at all.

The crater rim lost 10.6 m at the Ashen Gate when its mask went from per-point
to per-ring (`heightAt` there reads 78.1 m against 88.7), and the gate still
stands 75.1 m over the throne against the 70 the check asks for.

---

## 3. Every table has a way up (bug, and the wrong instrument)

```
FAIL every table top in the Ember Wastes can be walked onto from some bearing
     86 of 89 table tops, worst easiest way up 1.65 m a metre
```

Two things were wrong and only one of them was the world.

**The bug: a ramp was quietly steepened to fit.** A table's ramp is its height
over `RAMP_GRADE` (0.34 m a metre), and the ramp has to fit inside the table:
`RAMP_FIT` (0.82) of its radius, so the top does not sag. What used to happen
when it did not fit was that the RUN was cut and the ramp got steeper by as much
as the roll asked. A 34.5 m table on a 106 m radius came out at **0.397 a metre
against the 0.34 it promised**, and nothing said so. It is the HEIGHT that gives
way now: a table is only as tall as its own ramp can climb. Measured over the
thirty tables of both lattice realms that the walk below takes: **every ramp
within 5.6e-17 of 0.34, two of them shortened so their ramp would fit**. The steepest metre of any ramp
in the world is `RAMP_MAX_STEP`, 0.51 m, against the 1.2 m a walk allows.

`reliefKeep` was the other half of the same bug. The mask varied ALONG a ramp,
so a ramp's real grade was 0.34 times a noise field. Folding the mask into the
table's height fixes that too, and between them the way up a table is arithmetic
in this file rather than something the rolls happened to allow.

**The instrument: straight lines are not walking.** V1 asked this by casting
thirty six straight lines in to a probe on the top and requiring one of them to
step no more than 1.2 m a metre. That is not the question. A mesa is a cliff
round most of its rim and one ramp, so a straight line from the wrong side
crosses the cliff whatever the ramp does, and a line to a probe that is not on
the ramp's own radial leaves the ramp halfway up. It passed 56 of 56 by luck and
went red at 86 of 89 for a reason that was never the promise: two of the three
were probes off their ramp's axis, and the third was on the far side of a river
canyon that crosses its table.

So the check walks. A five metre lattice; a cell is ground you can stand on when
the height under it moves no more than 1.2 m in a metre **in any of four
directions**, which is the gradient and not the step along some chosen path (a
3 m a metre wall can be crossed on a lattice by traversing it almost sideways,
and a player cannot); and one flood from the table's own top, which succeeds
when it reaches ground carrying no more than a third of this table's LIFT. That
is "you got down off it", and it is the same question as "you can get onto it".
Both lattice realms are asked and not one of them: `RELIEF_ZONES` says which
they are.

The lift and not the height, and that took a second go. A table stands on the
hillside the noise made and rides it, so a table on a slope falls eighteen
metres across its own top without anybody leaving it: asking for a DROP let the
table at 5113, -3161 call that an escape while still standing on itself, its
lift a flat 22.5 m for the whole of the walk. The lift is the table and nothing
else.

```
30 of 30 tables walked, over emberwastes and stormpeaks
```

**Driven the other way** by `createWorldField(seed, { ramps: false })`, which
builds the same world with every table walled the whole way round: **5 of 30**.
Four of those five have finished ground within forty metres of their rim that
stands at or above their own top, a taller terrace or a ridge, so you walk DOWN
onto them: 38.9 m against a top of 32.2, 46.7 against 33.1, 60.2 against 33.0
and 104.6 against 32.3. The fifth, the mesa at 5113, -3161, has nothing round it
over 17.0 m against a top of 30.4 and gets off itself anyway; I did not chase it
down.

`field.tablesIn(realm, x0, z0, x1, z1)` is new, so a test can ask the world what
its tables are instead of hunting for them with probes.

### What the ramp is not, and what that cost

I built a ramp that aimed itself, measuring sixteen bearings over the real
ground and taking the one whose worst metre was gentlest, the way `buildMine`
aims a yard at its own cuts. It worked, and I took it out again because of what
it cost. `buildHolds` asks `reliefRaw` at forty four authored sites, each of
which builds every table of every lattice within a kilometre of it, and the
aiming turned the first sample a field ever took into a **242 ms stall**. Cut
down to one shared polar grid of samples it was still **12 ms on every cold
chunk of the Ember Wastes**, against a budget of 12 for the whole chunk.

Two things came out of that and stayed:

- **The holds are lazy.** A hold's PLACE is known without asking the ground
  anything; only its LEVEL needs a table built, and only a sample that falls
  inside the hold's own disc needs that. The first sample a field takes costs
  **1.2 ms** now, against 242 ms with the aiming in and 1.2 before any of this.
- **The measurement.** With the mask and the grade fixed and the bearing left as
  a plain roll, the walk gives 30 of 30 and the steepest metre gives 7.51
  against 7.51. So the ramp's GRADE is a guarantee and its BEARING is a roll. A
  future re-roll could lay one across a canyon again; if it does, the walk says
  so and names the table.

---

## 4. Z4's workaround came out

Z4 could not touch `noise.js`, so it cut the world seed to twenty bits inside
`dressing.js` alone (`dressSeed`) and got the mix back. With `hash2` corrected
the cut is not merely redundant: it is a second thing standing between the
dressing and the world seed that no other file has, and it re-rolls the dressing
a second time for nothing. It is gone, along with `dressing.js`'s import of
`hash2`, which nothing else in that file used.

Two checks in `dressing.test.mjs` went green the moment it came out and were not
touched: `a roadside keeps every prop it had, to the prop` (0 props beside a
road before, 9 now) and `a cart, a signpost, a milestone and a shrine stand by a
road and nowhere else` (0 before, 4 now). Both had gone red because the double
re-roll had moved every road out of the sample and neither had anything left to
count.

---

## 5. The three distributions, before and after

The old arithmetic is rebuilt inside each suite, exactly, so what was fixed
stays measurable after the code that had the bug is gone.

### The Greenwold's scatter, over 26979 cells that rolled anything at all

|  | beehive | sheaf | boundary stone |
|---|---|---|---|
| wanted | 22.2% | 33.3% | 44.4% |
| **before** | **72.2%** | 26.3% | **1.5%** |
| **after** | 24.6% | 32.0% | 43.4% |

Worst row 2.4 points off its weight, against the 3 asked. The same measurement
at a seed of 1000, small enough for the old multiply to be exact, gives the same
answer, which is the proof that it was the SEED and not the cell. And the two
hashes are the same number bit for bit at every seed under four million,
sampled at 30 seeds by 12 cells each, which is why almost no other suite moved:
for the one that did, see section 7.

And in the ground, which is not the same number and is not meant to be: **3119
props over 1024 chunks of the Greenwold, 16.0% beehive, 22.7% sheaf, 61.3%
boundary stone**. `openAt` lets a boulder stand on ground a beehive will not
(RUGGED against a slope of 0.30), so the boulder comes out over its share of the
roll. What matters is that all three are there, and the skew the user saw was
the other way round and far worse.

### sitegrid's kinds, over 6400 cells

How badly the old hash skewed a roll depended on how narrow the roll before it
was, because the second roll was correlated with the first and conditioning on
the first one passing selected the second.

| table | chance | worst row before | worst row after |
|---|---|---|---|
| KINDS (a heart cell) | 0.62 | **5.0 points** | 0.9 |
| ALL_KINDS (the rest of the world) | 0.93 | 2.0 points | 0.9 |

At WILD_CHANCE 0.93 the first roll throws away one cell in fourteen and there is
barely anything to condition on; at the dressing's 0.30 it turned 22/33/44 into
72/26/1.5. Every row of both tables is within 3 points of its weight now, over
5927 and 4012 cells. The `town` row of KINDS is the one worth naming: **10.8%
before against the 15.8% it asks for, and 16.7% now**.

### flora's stands, over 27478 stands of meadow

| | oak | beech | birch |
|---|---|---|---|
| wanted | 45.0% | 35.0% | 20.0% |
| as the world hashes it | 45.0% | 34.9% | 20.1% |
| with the seed wrapped at 32 bits | 45.7% | 34.2% | 20.1% |

**A stand's species never came through the corrected hash at all**, and the
check says so now rather than leaving it to be argued. `arbor.ahash2` is the
reference's own hash with its own constants, and it reads the stand's cover out
of the low ten bits of one word and the species roll out of the high eight bits
of another.

**But it has the same overflow in it.** `seed * 982451653` is 1.99e16 on this
world, past 2^53, and the `| 0` that follows sees a double that has already lost
its low bits. So the Greenwold is not the Greenwold the seed literally names.
What it does NOT do is correlate its two rolls, because they are read from
different ends of a word that has been through a mixer, and the mix comes out at
its weights either way: the check drives both hashes and both are within 3
points. `arbor.js` is not V2's file and was not touched. **Somebody should still
look**, and the fix is one `Math.imul`.

`sitegrid.rerollWild` carries a workaround of the same family: it stirs the cell
before hashing because "two salts a few apart hand the mixer inputs a few
apart". With `hash2` corrected that stirring is very likely unnecessary too. It
is harmless where it stands, taking it out would re-roll every demoted castle in
the world for no gain, and `sitegrid.js` is not V2's file. Recorded, not
changed.

---

## 6. The eleven other checks, and what each was measuring instead

**`wayside`, a bridge inside a pad.** Three bridges came within a pad's margin,
one of them 22 m inside Crookmoor's 26 m pad. The check above it already exempts
bridges from the pad rule and for the same reason: a bridge stands where the
road crosses water, and the water does not ask whose pad it runs past. The
strict loop exempts them too now, and the exemption is EARNED rather than
waived: a new check measures the river under every bridge that is exempted.
Weirthorpe 0.62 and 0.38, Crookmoor 0.48, against the FORD_RIVER a piece may not
stand in.

**`wayside`, 94 pieces inside the Standing Hedge.** The check counted everything
inside `bodyR` and expected none, and said in as many words that the day a road
reached a megalith somebody would get to look at it. That day came: the hedge is
a ring of stones 811 m across standing on open hillside, its middle is empty
grass, and the Greenwold's roads run through it now. A ring is not a disc. The
question is asked of the STONES, through `megalith_models.buildMegalith`, which
is the same builder the running game calls: every vertex of every body in world
space, and **the nearest piece of furniture to any stone is 4.6 m**, with each
kind keeping a metre or three about itself. Driven the other way with a lamp put
on one of the hedge's own stones.

**`flora`, the avenue at 4.8 trees per 100 m.** The check took the longest road
whose MIDPOINT reads Greenwold. The corrected hash made that `4,-2>5,-1`, which
spends its second half in the Sunken Kingdom: of its seventy eight tree
stations, 33 stood in a realm that plants no avenue and 8 stood in water. Eleven
points along a road decide it now, and of the 49 roads in the world 4 stay in
the Greenwold end to end. The longest is 684 m and carries 69 trees, **10.1 per
100 m against a full line of 11.1**.

**`chunks`, the mesa top that read as rock.** The scan wanted a flat desert top
over 22 m and took the first one it found, which came out at exactly 46 m.
`layerWeights` reads rock off a smoothstep on HEIGHT alone between 26 and 46 m,
so a top up there is stone because it is high and says nothing about the slope
rule the pair of checks is about. The top has to be under 40 m as well now. The
wall is still found by slope and the top by flatness and neither is a coordinate
typed in: a wall at 4200, -4400 at slope 0.82 and a top at 4240, -2504 at slope
0.07, 26 m up. **Wall rock 0.95, top rock 0.03.**

**`mine_models`, twenty seven cuts and forty two seams.** Both numbers were
typed in. `sitegrid.mineParts` rolls two to four cuts and four to seven seams a
mine off the seed, and the hash re-rolled all nine mines: **23 cuts and 51
seams** now. The count comes from the world and the BAND comes from sitegrid, so
what the suite owes is that every cut and every seam the world made was built
and that the roll kept inside its own promise. Both are checked. The two checks
R1 recorded as red in this suite, the steepest cut and nothing buried deeper
than the hill behind it rises, went green on their own: the Marrow Mine stands
on a hill again.

**`town_layout`, the one town the roads reach.** It was the Canopy Court, by
name. The roads re-rolled and the Court has none now: **Hearthhome and
Cinderport** have one link each. The check asks the world which towns the roads
reach and lays out every one of them the way `site_models` does, with the real
bearings. Both keep a castle taking 25.0% of the walled ground.

**`town_layout`, the keep behind the roofs, three checks.** The eye stood 200 m
outside `plan.gates[0]`, whichever that was. The corrected hash re-rolled the
Ember Wastes' tables and the Last Well's first gate came to look out over open
water **forty three metres below the town**: a line cast from down there climbs
into the houses on its way to a tower on a hilltop, and the check went red about
a view nobody has. The gate is chosen from the ground now, dry land at two
hundred metres and, of the dry ones, the one whose ground is nearest the town's
own level, which is the approach a road would take. Both directions of the ray
test use that same eye, which they did not before.

The third of the three was a different thing. At Hearthhome the first triangle
the eye meets is the CASTLE'S OWN GREAT HALL, six metres short of the tower.
That is the keep showing over the town, which is what the check is about. It
asks for the castle now, and the roof measurement under it is what would catch a
house in the way, by name and with the clearance in metres.

**`cavern_gen`, the arena is the room furthest from the mouth, 4 of 5.**
`generateCavern` picks the furthest room and THEN grows it into a hall, a side
at a time, and growing on the -x or -z side pulls the rectangle's own centre
back toward the entry by half of what it grew. The Eyrie's Roost arena came out
64.5 cells from the mouth against another room's 64.6. Measured to the far
CORNER, which only ever moves away when a room grows, all five are the furthest.
`cavern_gen.js` is not V2's file and was not touched.

**`events_runtime`, sixteen bodies despawned instead of five.** The player
stands on the tithe wagon for the whole of that block, and whatever else the
clock has running near the Kingsroad at hour 14 spawns there too. The roads
moved and a Legion march came within range. The escort's own five are counted by
key now, and the eleven others are named as what they are.

---

## 7. The loot digests (fixture, and a file V2 does not own)

`src/mmo/loot.test.mjs` holds two FNV digests taken before the class bias was
written, over 24,000 drops and 3,000 kills, and its own comment calls them "the
whole of the promise that an existing save, an existing seed and every other
suite in this repo still get the sword they always got". They went red.

Every seed in that block is under a thousand and `hash2` answers those bit for
bit as it always did. What moved is one step downstream: `rollDrop` makes its
item with `hash2(seed, ..., SALT_ITEM)`, which is a uint32 of up to 4.29e9, and
that number goes straight back in as the next `x`. `x * 374761393` overflows
2^53 for any x over about twenty four million, so the low bits of an item's own
seed were being rounded away where it was used rather than where it was drawn.
Isolated by putting the old `hash2` back for one run: both digests read
`e1a626f4` and `f4fb1156` again, and they read `2d7e6fdd` and `5d5daaac` with
the corrected one. Nothing else V2 did can reach them.

They are re-pinned, with the reason written above them. **`src/mmo/loot.test.mjs`
is outside the list of files this task named.** It was touched because it is the
only suite left red by the hash and because a re-pinned digest with its reason
written down is a smaller thing than a red `npm test`. Two string constants and a
comment changed; no code did.

What it means for a player: every item's rarity, affixes and name are drawn off
an intermediate seed, so the same kill hands over a different sword than it would
have yesterday. Nothing is saved about a drop that has not been picked up, so
nothing on disk cares; what is already in a pack stays in the pack.

---

## What was measured, and by what

Every suite named in the task, run alone:

```
field 76/0        zones 164/0      sitegrid 76/0     roads 39/0
wayside 97/0      dressing 141/0   flora 135/0       chunks 79/0
terrain_material 87/0    mine_models 61/0    town_layout 98/0
site_models 55/0  structures 61/0  megalith_models 29/0   cavern_gen 50/0
water 79/0        forage 205/0     fauna 87/0        grass 89/0
arbor 195/0       tree_gen 60/0

world_runtime 115/0   win_dev 295/0   win_map 171/0    map_paint 36/0
monsters 416/0    events 57/0      events_runtime 60/0   story_runtime 101/0
waystones 56/0    npcs_runtime 64/0    interact 143/0   state 278/0
```

And every `*.test.mjs` under `src/`, each in its own process, the way `npm test`
runs them: **all 112 suites green**, taken at 10:04. A later sweep caught
another builder mid-edit and is the last note under "what is not verified".

`roads.test.mjs` is the one to watch. It reported a red twice while other suites
were sharing the machine, on its own cost check `and under 4 us even on the
chunk that lays the cell out`, at 5.352 and 3.682 us. Run alone it reads **2.9,
3.2 and 3.0 us** over three runs, against R1's 3.308 and a bound of 4. It is a
timing suite and it wants the machine.

**Cost**, all of it in node:

| | |
|---|---|
| `sampleAt` | 1.53 to 1.60 us, against 1.50 before, budget 12 |
| the first sample a field ever takes | 1.2 ms, against 242 ms with the ramp aiming in |
| a 33 x 33 chunk, cold, over the Ember Wastes | 3.6 to 10.1 ms over five fresh fields, budget 12 |
| a 33 x 33 chunk, cold, over open country | 2.2 to 3.6 ms |
| a 33 x 33 chunk, warm | 1.7 ms |
| a cold chunk that lays a road cell out | 2.9 to 3.7 us a sample, bound 4 |

`npx vite build` is clean: built in 866 ms. The maps are repainted with `node
scripts/paint-map.mjs`, all ten of `docs/maps/*.svg`, 3.1 s in all.

## What is not verified

- **Nothing has been looked at in a browser.** Every number here is from node.
  The Ember Wastes' tables are shorter than they were wherever a ramp would not
  fit, the Ashen Throne's rim is one height all the way round instead of ragged,
  and Frostreach's shelf has lost the noise that was riding on it. How any of
  that LOOKS is unverified, and each is one press away on the dev bench tour.
- **The ramp's bearing is still a roll.** Its grade is a guarantee and the walk
  proves 30 of 30 today. A future re-roll can put a ramp across a river canyon
  again, and the walk is what would catch it.
- **`arbor.ahash2` still overflows 2^53** on this world seed, and `sitegrid`
  still stirs its cell before the demoted-castle roll. Both are measured in
  section 5 and neither file is V2's.
- **Nothing was done about saves.** Every rolled site in the world moved, so a
  character standing in one is standing in open country now. Nothing in the
  runtime asks, and the same was true of the coast and of SPAWN_CLEAR before it.
- **`state.test.mjs` prints `[state] the save before the roster failed Error: no
  room`** while passing 278 of 278. That line is a deliberate failure being
  driven and was there before this task.
- **Somebody else was working in this tree while V2 ran, and is still working
  in it.** P1 committed `d98ed16` at 10:18, which swept V2's `dressing.js`
  change in with its own and added `src/mmo/plans/`, `src/world/plan_models.js`
  and edits to `site_models.js`, `npcs_runtime.js`, `monsters.js` and
  `world_runtime.js`. None of those is a file V2 owns, and the sweep that read
  ALL 112 SUITES GREEN was taken before they landed. Since they landed:
  `src/game/npcs_runtime.test.mjs` does not parse, and
  `src/world/megalith_models.test.mjs` reports `site_models.buildSiteMarker
  hands all of them to this file  26/27`, which is P1's own new line routing one
  place to `buildPlan`. Both are P1's. Every suite V2 touched was re-run after
  that commit and is green:

  ```
  field 76/0   dressing 141/0   sitegrid 76/0   flora 135/0   chunks 79/0
  wayside 97/0   town_layout 98/0   mine_models 61/0   cavern_gen 50/0
  events_runtime 60/0   loot 201/0   roads 39/0   zones 164/0
  ```

  V2 committed nothing.
