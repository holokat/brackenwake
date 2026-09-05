# R1: the world after the coast moved

Wave B follow up, task R1. Written 2026-09-06 by the R1 builder.

**On the filename.** The task asks for `R1.md`. That name was already taken by
an unrelated note ("R1: the boot, in modules", commit 93502d9), so this is
`R1-COAST.md` rather than an overwrite of somebody's work. The same thing was
done twice before in this folder, with `V4b.md` and `V1-VERTICAL.md`.

Fable changed the continent mask in `src/world/field.js` on 2026-09-06:
`LAND_LO` and `LAND_HI` went from smoothstep(-0.20, 0.06) to (-0.62, -0.34),
and the world stopped being 55% water. That is the world we want. It also
turned nine checks red across seven suites. Some of those checks were fixtures
pinned to the old coast. Four were real bugs the old coast had been hiding.

Owned files, and the whole of what was touched: `src/world/field.js`,
`src/world/roads.js`, `src/world/sitegrid.js`, `src/world/zones.js`, their
tests, `src/world/chunks.test.mjs`, `src/world/flora.test.mjs`,
`src/world/dressing.test.mjs`, `src/game/win_dev.js`,
`src/game/world_runtime.test.mjs`, `src/game/win_dev.test.mjs`, and this note.
`LAND_LO` and `LAND_HI` were not changed. `town_layout.js` and its test were
not changed: the port test proved the fix as T1 wrote it.

---

## The nine, and which was which

| # | what went red | fixture or bug |
|---|---|---|
| 1 | the ocean band, the two digests, the islet bound | fixture |
| 2 | a mine cut standing below its own yard | **bug** |
| 3 | a road at 0.640 against ROAD_GRADE 0.5 | **bug** |
| 4 | the painted road measured across a road running the wrong way | fixture |
| 5 | the avenue read as 0.7 trees per 100 m | fixture |
| 6 | the dressing probe sixty metres onto another road | fixture |
| 7 | a dungeon rolled 348 m from the spawn | **bug** |
| 8 | two pirate ports facing a river | **bug** |
| 9 | the Whale Road landing, and a mile wide body landed at its centre | fixture, and a real thinness in `landingFor` |

---

## 1. The band, the digests and the islets (fixture)

**The ocean band.** `ocean exists (15% to 55%)` now measures 14% over the same
12 km square. Re-pinned to 8% to 40%: wide, because it is a smoke alarm and not
a spec, and 8% is low enough to catch a world with no sea left in it.

**Land per realm**, which the world average cannot say, is new. Each realm is
measured on a uniform 40 m grid over its own disc:

```
greenwold 95%   verdant 88%   saltmarch 89%   emberwastes 71%   stormpeaks 96%
boneyard 91%    frostreach 99%   sunkenkingdom 22%   ashenthrone 60%
```

The floor is 70% and it holds for seven of the nine. Two are water on purpose
and are named rather than waved through: the Sunken Kingdom IS the Caldera Sea,
and the Ashen Throne's disc reaches nine hundred metres into that sea, which is
what gives Cinderport a shore to stand on. Both are measured against the same
floor and are under it, so the floor is a bound and not a formality. The
Greenwold, where the first hour happens, carries its own check at 94% and
measures 95.0%.

**The heart digest** moved, on purpose, twice in one day, and the comment above
it in `field.test.mjs` now says so.

```
6408cb4e64daf869910a654e0737f570d78de706987ee244f8e55f76c265a521   before
47ff5817bbd7265ba9f1635840ef43de3f09b7f9c603b2747d784f26f60aefaf   the coast
77a4a1da5f978a158c2f870c60ed4608d1de65da4fdc666aaa6b9fa27facb0a5   and the spawn clear
```

The middle line is not a guess. The digest was run against this exact tree with
`sitegrid.SPAWN_CLEAR` set to 0 and it gives `47ff5817` to the last bit, which
is the number the coast alone left. So every other thing R1 did to the world
moves nothing in the 2 km square, and the whole of the step from `47ff5817` to
`77a4a1da` is 576 samples that used to name the Cold Workings and 2 samples
whose height moved by 0.10 m where its ten metre pad had been.

**The relief digest** moved with the ground it is laid over.

```
c6900f56e4226872282239f5d7455e5f6f9bf17aa42da993090fdb412bef5deb   before
c8738d3e0ea76e50069ffe317fc0ad9298a4199042f3c48c9029133a00698623   now
```

12% of the Ember Wastes was lifted before and 11% is now, up to 39.9 m against
49.6. It read `c8738d3e` before R1 touched a file and it reads `c8738d3e` now.

**The islets.** `no islet is a tenth of the sea` was a share of `SEA.full`'s
area, which meant a shrinking sea could make a fixed islet illegal without the
islet changing by a metre. The bound is absolute now: half a square kilometre,
which is about eight hundred metres across, and what an islet actually has to
be is small enough to walk round. The mask still makes them: 82 islands over 1806 dry cells, the largest 446 thousand
square metres, the median 800, against 3.1 square km of open sea.

## 2. A mine cut below its own yard (bug, and a class)

`zones.test.mjs`: `the shallowest rises -1.15 m`. Three mines of the nine, not
one: the Salt Cut by 1.15 m, the Rime Cut by 0.90 m, the Marrow Mine by 0.36 m.

The cause is a shape mismatch that was always there and that the old ground
happened not to expose. `field.js` picked a mine's `facing` from the lowest of
eight probes FIFTEEN metres out. `sitegrid.mineParts` then puts the cuts at
`facing + PI`, TWENTY ONE metres out, spread across an arc up to 1.4 radians
wide. A bearing that is downhill in the middle can be uphill at its edges.

The fix is on the yard rule and not on the three coordinates. `buildMine` now
aims the yard on the cuts themselves: thirty two bearings, the mouth points of
each worked out exactly as `mineParts` will lay them, and the bearing whose
LOWEST cut stands highest wins, ties to the first, so it is still a pure
function of the seed. All twenty seven cuts of all nine mines now stand above
their own yard:

```
The Chalk Pits    2.57 2.74 2.59      The Marrow Mine   0.09 0.63 0.49
Verdite Hollow    2.94 2.97           The Rime Cut      0.84 1.66 1.37 1.08
The Salt Cut      0.50 0.92 0.58      The Pearl Beds    0.50 0.50
The Ember Cut     9.89 11.98 10.14    The Cinder Cut    1.36 1.99 1.42
The Thunder Shaft 1.76 3.23 3.34 2.24
```

shallowest 0.09 m, median 1.66, steepest 11.98. The Marrow Mine's 0.09 m is
thin and honest: that mine now stands on ground with no hill in it, and 0.09 m
is the best any of the thirty two bearings can do there.

## 3. A road steeper than ROAD_GRADE (bug, and the harness was lying)

`roads.test.mjs`: `worst 0.640` on `-11,3>-12,4`, in the last twelve metres of
the road into a hamlet standing on a bank. `roads.js` had already approved that
road at 0.492.

The judgement was not the real path. `roads.js` decides a road is usable by
walking the surface it would leave, and it worked that surface out from its own
copy of `field.js`'s pad arithmetic. The copy knew about the road's own two
settlements and about nothing else, and it did not know that **a pad takes the
road's authority as well as its ground**: `field.sampleAt` grades by
`road * (1 - pad) * fordFade(river)`, so where a town's shoulder owns the
ground the road moves none of it, while the judgement was cutting a metre and a
half into that shoulder on paper.

So the copy is gone. `field.js` exports `groundNoRoads(x, z, out)`, which is
the pad code lifted out of `sampleAt` unchanged (the heart digest proves it: it
still reads `47ff5817` with the spawn clear off), and `roads.js` calls it and
judges with the weight the field will actually give the road.

- 62 roads before, **61** after. One road was refused, the one that was wrong.
- Nobody was orphaned: 82 settlements with a reachable neighbour, 0 without.
- Worst grade over every road: **0.469** against ROAD_GRADE 0.5, median 0.164.
- A new check walks 7,452 centreline points over all 61 roads and measures the
  surface roads.js judged against the surface field.js laid: **worst 3.7e-14 m**,
  which is `roadStrength(rd.d)` rounding at the centreline and nothing else.

## 4. The painted road (fixture)

`chunks.test.mjs` found a road by scanning a grid for `road > 0.9` and then swept
across it along +z. On the new coast the spot it landed on was a road running
nearly parallel to the sweep, so a 6 m road measured 20.7 and 28.0 m wide and
the centreline read 0.850.

It takes its road from `roadsForCell` now: the longest road on the continent
whose midpoint no other road runs within a verge's width of, and the sweep runs
along that road's own normal. `1,6>z:canopycourt`, 962 m long, measured at
1145, 3430: **graded 5.9 m, painted 11.7 m, centreline 1.000**.

One check under it changed with the measurement and is worth naming. At the far
tier the painted ramp CANNOT step less than the graded strip: the ramp is 6 m
each way and that tier puts a vertex every 8, so an offset that lands one vertex
on the centreline and the next off the ramp steps the whole road at once, as the
graded strength does. What the wide ramp buys there is that the road is never
missed: over 32 sweep offsets the graded strip was stepped clean over 9 times
and the painted ramp 0. The test says that, and says why, instead of asking for
something the geometry cannot give.

## 5. The avenue (fixture, and the avenue was never broken)

`flora.test.mjs` took its road from an eight by eight block of site cells (3.8 km)
and its trees from a fixed 53 x 53 block of chunks (3.4 km). On the new coast
the longest Greenwold road became one that leaves the tree block half way along,
so six of its seventy five trees were counted and it read 0.7 per 100 m.

The road now comes from the whole network and the trees are harvested over the
chunks that road actually crosses. Measured over their own chunks, every
Greenwold road carries a real avenue:

```
2,-4>3,-5   726 m   39 trees   5.4/100 m      3,-2>4,-1   811 m   75   9.3/100 m
-5,-3>-6,-3 405 m   42 trees  10.4/100 m      2,-1>3,-2   679 m   70  10.3/100 m
-5,-2>-5,-3 563 m   56 trees  10.0/100 m      4,-1>5,0    367 m   31   8.4/100 m
```

against a full line of 11.1. The longest is 811 m and carries 75 trees, 34 pairs
across the road and 37 gaps of one 18 m step along it. `flora.js` was not
touched.

## 6. The dressing probe (fixture)

`dressing.test.mjs` proved a road refuses, then stepped a fixed sixty metres
north east to prove open ground does not. On the new network that step landed on
another road. Roads meet, so the direction has to be asked of the field rather
than picked: the probe now walks eight bearings at 60 m and takes the first that
is not itself on a road. Open at 502, -2400.

## 7. A dungeon at the spawn (bug)

`world_runtime.test.mjs`: `nothing with a pad inside the streamed ring of the
spawn: dungeon flatR 10`. The Cold Workings rolled at 348 m from the origin,
because the ground there is land now.

`sitegrid.SPAWN_CLEAR` is 600 m and `siteAllowed` refuses any ROLLED site inside
it, whatever kind it is and whatever the ground says. The reason is not the
digest: the first place has to be a walk, a dungeon mouth three hundred metres
from where a character wakes up is furniture rather than a discovery, and the
ground round the origin belongs to the player before it belongs to the
generator. 600 stands outside the 576 m ring `world_runtime.js` streams, so the
ring the spawn builds holds nothing rolled at all.

It is written as "not far enough" rather than "near", so a site handed in with
no point is refused instead of quietly exempted. Driven both ways in
`sitegrid.test.mjs`: a town, a dungeon and a cave at 599 m refused and the same
three at 601 m allowed, an authored site never asked, a site with no point
refused, and the real world walked: **the nearest rolled thing to the origin is
now the Tanner Cut at 703 m**, against the Standing Hedge at 837 m, which is
authored and lays no pad.

The second half of that suite, `a ray down onto a streamed tree picks that
tree`, went green on its own once the spawn cleared: the walk out is now to the
Tanner Cut and the chunks around it carry trees. Two other checks in the same
block were measuring less than they claimed and were tightened while they were
open:

- The wait loop asked for `siteMarkers.count >= 1`, which the Standing Hedge
  satisfies from 837 m away while the place being walked to is still in the
  build queue. It waits for a mesh belonging to that place now.
- The ray aimed at each mesh's bounding box CENTRE. The nearest place used to be
  a village and a box centre stood over its roofs; it is a dungeon mouth now,
  and the centre of the box round an arch is the hole in the arch. It aims at
  the mesh's own vertices, and the claim is now about every marker in the ring
  rather than about one of them: **8 of 8 meshes over three places, each
  answering with the place it belongs to**.

## 8. Two pirate ports facing a river (bug)

`town_layout.test.mjs`: `redqueensharbour shore at 114 m, quay at 94 m;
cinderport 112 m`. Worse than the numbers say. `town_models.seawardOf` walks 48
bearings looking for ground under sea level, and what it found off both towns
was a RIVER: a channel 114 m away with the quay on a bank looking across at it.
A pirate port has to stand on the sea.

Both moved in `zones.js` LAYOUT, to the Caldera Sea's real shore, on bearings
the port specs in `town_layout.js` were written for, which is what let the test
prove it as T1 wrote it.

```
The Red Queen's Harbour   4642, 1712 -> 4660, 720     992 m,  subzone 330 -> 260
   shore  90 m at 105 deg, 7 deg off the spec's 112; eleven metres of water,
   94% of the next 300 m wet, all of it inside the Caldera Sea
Cinderport                6608, -254 -> 5520, -640   1154 m
   shore  86 m at 270 deg, 38 deg off the spec's 307; sixteen metres of water,
   100% of the next 300 m wet, all of it inside the Caldera Sea
```

The quay stands at `shoreR - 8` now instead of at the precinct clamp: 82 m at
the Red Queen's Harbour and 78 m at Cinderport, with the jetties reaching 22 m
past that and out over the water. The Red Queen's Harbour's subzone came in from
330 m to 260 so that the whole of it still fits inside the Saltmarch's own disc.
`auditZones` is clean, both towns are alone in their cells with their precincts
inside them, both stand on dry ground (1.21 m and 2.95 m), and the seven town
precincts are still seven.

**Two things had to be fixed underneath the move.**

A sea stack came up 4.3 m through the middle of Cinderport's precinct. The dry
reliefs are held level across an authored site's pad by `reliefAt`; the karst is
not, because it is laid inside the sea block after the sea, where the dry ones
have already been and gone. `field.holdFade` now fades a wet relief out across a
pad and back in over `RELIEF_HOLD` past its rim, and the site hold check reads
worst spread 1.4e-14 m over 44 sites again. A stack is a thing that stands in
open water. It does not stand in a harbour.

And `zones.test.mjs`'s walk exemption was a hole both towns fell straight
through. It skipped every site with `seaWithin > 0`, and `seaWithin` is alive
out to `SEA.edge`, 600 m past the open water, so any town on the sea's landward
shore was exempted from having to be walkable at all. The walk now skips the
Sunken Kingdom and nothing else, because its ten places are the drowned city and
the reefs over it and a boat is the point of them. **65 sites walked, worst 81 m**,
and both ports come in at 45 m.

## 9. The Whale Road, and a mile wide body (fixture, and a thinness)

`win_dev.test.mjs`: `The Whale Road: 240 m from the centre, mountain`. The
landing was dry ground on a karst sea stack, which is a perfectly good place to
stand, fifteen metres outside a circle the check insisted on. The check was the
wrong one. A sea stop's circle is water: that is what makes it a sea stop, and
`landingFor` says in as many words that it searches outward to twice the place's
radius for the shore or the stack beside it. The check asks for that now, and is
driven the other way with a world that is water everywhere, where `landingFor`
comes back `dry: false` at the centre rather than pretending. The Whale Road
lands 200 m out against a reach of 450.

**`landingFor` for a body with a reach.** `edgeOf` landed you at `flatR + 8`,
and the Standing Hedge lays no pad at all: its tour stop put you eight metres
from a point in the middle of a mile of grass with its nine stones 805 m away in
every direction. A site that carries `bodyR` now lands at `BODY_LAND` (0.9) of
its own reach, on the side the player is coming from, looking in.

```
The Standing Hedge   bodyR 811, pad 0   ->  729.9 m out, yaw looking in
The Obsidian Bridge  bodyR 107, pad 0   ->   96.3 m out
Hearthhome           bodyR 0, pad 120   ->  128.0 m out, as before
```

The hedge's stones stand at 805 m and there are eighty one of them round the
ring, one every 62 m, so the landing is 75 m short of the ring with a stone
within about 81 m dead ahead and the whole ring across the view. `bodyR` is 0 on
every site but two, so nothing else moved. Driven both ways in
`win_dev.test.mjs`: the two bodies, the side you came from, the other side, and
a place with no body of its own still landing at its pad's edge.

---

## What was measured, and by what

Every suite R1 owns, run alone:

```
field 74/0    zones 164/0   roads 39/0    sitegrid 73/0   chunks 79/0
flora 133/0   dressing 76/0 town_layout 58/0   world_runtime 115/0   win_dev 295/0
```

Read only, not edited, reported as asked: `wayside.test.mjs` **95 passed, 0
failed** (13 pieces and 16 draw calls on the busiest chunk with one real light,
27 panes of glass dark by day and 43 lit at midnight, 27 finger boards on 12
posts worst 0.01 degrees out, a bridge deck 30 m over water, a name legible at
25 screen pixels at six metres).

Green and unchanged: `site_models` 55/0, `win_map` 171/0, `map_paint` 36/0,
`events` 57/0 (the wagon on the Kingsroad), `monsters` 415/0. Also checked
because the world moved under them: `structures` 61/0, `megalith_models` 29/0,
`forage` 205/0, `fauna` 87/0, `grass` 89/0, `water` 79/0, `arbor` 195/0,
`npcs_runtime` 64/0, `interact` 143/0, `waystones` 56/0, `events_runtime` 60/0,
`foraging` 137/0, `compass` 55/0.

`npx vite build` is clean: 151 modules, 734 ms.

Cost, since `sampleAt` gained a function call and the karst gained a hold:
**1.50 us** a sample against 1.52 before, a 33 x 33 chunk in 1.6 ms, and a chunk
over a road 2.200 us a sample warm and 3.308 us on the cold cell that lays the
roads out, against a budget of 12 and 4.

## One suite is red and R1 did not do it

`src/world/mine_models.test.mjs` fails two checks, and R1 does not own that file.

```
FAIL the steepest cut really is steep
     the hill rises -1.1 m four metres back and falls 0.1 m six metres out
FAIL and nothing is buried deeper than the hill behind it rises
     the deepest point is 1.15 m under the surface, the hill is -1.1 m
```

The suite hard codes `The Marrow Mine`'s first mouth as "the steepest cut in the
world, where the ground falls 9.5 m over six metres". On the new coast that
mine stands on ground with no hill in it, so the frame that is meant to be cut
into a bank is standing on a slope of nothing.

It is not the mine aiming in section 2. Isolated by copying the tree, taking the
aiming back out, and running the same suite: it fails the same two checks with
`rise -1.0 m, fall -0.4 m`, against `rise -1.1 m, fall 0.1 m` with the aiming in.
Nothing else R1 changed can reach the Boneyard at -2652, 1654. It is the coast,
and what it wants is the same fix section 4 got: find the steepest cut in the
world by measuring, rather than by naming one.

## What is not verified

- **Nothing has been looked at in a browser.** Every number here is from node.
  The two ports have been measured onto real water and their plans lay out and
  build, but how the Red Queen's Harbour LOOKS on its new shore, and whether the
  jetties reach water a player can swim in, is unverified. Both are one press
  away on the dev bench tour.
- **The Standing Hedge landing** is measured as a distance and a bearing. That
  the nine stones fill the view from 729.9 m is arithmetic off `megalith_models`
  and not a screenshot.
- **The road that was refused** is gone from the world and both its hamlets kept
  other roads. Whether the country there now reads as two places with no road
  between them was not looked at.
- **`SPAWN_CLEAR` is a world change a save can feel.** A character standing in
  the Cold Workings when this lands will find the mouth gone. Nothing was done
  about that, and nothing in the runtime asks.
