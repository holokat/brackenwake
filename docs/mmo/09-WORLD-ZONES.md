# The world has an edge, and Kaldera is laid over it

The user's words, still: "I want a vast explorable world but not infinite, and
we need to author cool and interesting zones and have a world map which we can
open and see what is where and be able to run there with a compass." And: "I
want to author outdoor mining caves with rarer ore, but I do not know how to
handle zone discovery if the world is infinite."

That is answered by bounding the world, and everything in section 1 is unchanged
from the day it was answered. What changed is what is written on the bounded
world. There used to be twenty one zones invented for the engine. There are now
**nine realms and the ninety five places inside them**, and not one of them was
invented here: they are `src/mmo/realms.js`, the sheet the codex, the painted map
and this table are all read from. A place exists in one file. This document is
about the second half of that sentence: how a row of that sheet becomes ground
you can stand on.

## 1. The shape of the world

**One continent, inside a 16 km square, the origin at its centre.**

`src/world/zones.js` owns this. `WORLD_HALF` is 8000 m: at that radius the
ground is at `OCEAN_FLOOR`, which is 30 m down. Between about 6.7 km and 8 km
the land slides into the water along `coastRadiusAt`, a mean radius of 7100 m
wobbled by three harmonics of the bearing so the coastline bays and bulges
instead of ruling a circle. Measured: the coast runs between 6758 m and 7522 m,
and the last dry ground on 64 bearings is 5925 m at the shortest, 7275 m median,
7775 m at the longest. On 52 of those 64 bearings there is sand between the last
meadow and the sea.

Nothing wraps.

**A wrap was considered and rejected.** Running east until the world hands you
back the hill you started from is a seam: the player sees the same rock twice and
learns that the world is a trick. A coast is the honest version of the same
boundary. You can see it coming, you can stand on it, and it says what it is.

**The inland world is untouched.** `oceanBeyond(x, z)` returns exactly 0 inside
`COAST_MIN` (6500 m) and the code that applies it does not run there at all.
Measured over 3600 probes.

### 1b. The Caldera Sea, which is the world's second shore

The Sunken Kingdom is not a country with a name over it. It is water. So
`field.js` gained a second falloff that works exactly the way the outer coast
does, and for the same reason: a sea that begins at a line is a cut in the
ground, and a sea that begins at a beach is a coast.

| | |
| --- | --- |
| centre | the Sunken Kingdom's own centre, `(4100, -400)`, taken from realms.js and written nowhere else |
| `SEA.full` | 1000 m: inside this the ground is the sea floor outright |
| `SEA.edge` | 1600 m: outside this `seaWithin` returns 0 and the block does not run |
| `SEA.floor` | -18 m, shallower than the ring ocean, because the drowned city is meant to be visible from a boat |

Measured: of 1656 samples inside `SEA.full` that are neither reef nor islet,
**1656 are water**, 1420 sit exactly on the -18 m floor, and the shallowest is
-17.36 m. `seaWithin` is exactly 0 on all 3600 probes outside `SEA.edge`. The
sea's nearest water stands **2519 m from the origin**, 1019 m outside
`HEART_SAFE`.

Two kinds of ground stand back out of it.

**The reefs.** Five fixed points where the drowned city's tallest towers break
the surface. Each is a flat top and a slope, and `top` is kept under the 2.2 m
the biome chain calls a beach on purpose, so a reef is coral and sand and the
stump of a tower rather than a green hill in the middle of a sea. Measured: all
five are dry, between 1.90 m and 2.10 m, all five report `beach`, and of 40
bearings 120 m off a reef, 40 are water. The reefs are the only dry ground in the
Sunken Kingdom, and its three buildings stand on three of them.

**The Thousand Isles.** The Saltmarch's seaward half is an archipelago and not a
shore. It is a noise driven island field alive only where the Saltmarch's own
disc and the Caldera Sea overlap, which is a crescent of shallow water on the
sea's fen side. The shoals come first (the water among the isles is four metres
deep and not eighteen, which is what makes an islet a small rise rather than a
spike out of a trench) and then the islets, whose tops are under the beach line
so an islet is sand and palm. Measured: **78 islands over 850 dry cells at 20 m**,
the largest 208 cells (83 thousand square metres) and the median 3 cells. The
middle of the sea, over the drowned city, is open water on all 167 probes.

### What being bounded costs

Unchanged from Z1 and still true: inside 4.8 km nothing moved; between 6.2 km and
7.7 km what used to be land is sea; the continent's totals are countable rather
than notional. The flood fill from the origin reaches 7783 of the world's 8892
hundred metre land cells, 87.5%.

## 2. Zones, in two ranks

A zone is a disc with a soft edge. There are now two ranks of them.

| field | what it is |
| --- | --- |
| `id` | stable, saved in the character's list, never renamed |
| `name` | what the banner says |
| `short` | three words, what the banner's small caps say under a subzone |
| `x, z, r, edge` | centre, the radius it owns outright, and how far the weight takes to fall to nothing |
| `parent` | `null` for a realm, the realm's id for a place inside it |
| `biome` | a hard override, or null. **Realms only** |
| `climate` | `{ temp, moist }` added to the field's own, scaled by weight. **Realms only** |
| `danger` | the monster tier band, `[lo, hi]` |
| `ore` | ore ids, poorest first |
| `sites` | places at fixed coordinates, measured against the real terrain |
| `line` | the one line under the banner |

- A **realm** is one of the nine. It carries the bias.
- A **subzone** is one place inside a realm. It carries a name, a line and a
  footprint, and **no bias of its own at all**, which `auditZones` enforces.

**104 zones: 9 realms and 95 subzones.** Every row is generated from realms.js at
import; only the coordinates are literals in `zones.js`, and every one of those
was measured (section 7).

### Why a subzone carries no bias

Because a subzone that carried one would punch a hole in its realm. Standing in
the Salt Pans, `zoneAt` hands back the Salt Pans and not Ember Wastes; if the
biome came from whatever `zoneAt` returned, the desert would stop at the edge of
every named place inside it. So `zoneBias` resolves the bias **up the chain**:

```
zoneBias(x, z) -> {
  id          the DEEPEST zone: the Salt Pans
  parent      the realm: Ember Wastes
  weight      how far inside the Salt Pans you are      (discovery, the banner)
  biasWeight  how far inside EMBER WASTES you are       (the climate, the override)
  biome       Ember Wastes' override, gated on biasWeight
  climate     Ember Wastes' nudge
  danger/ore  the realm's, carried down
}
```

`field.sampleAt` scales the climate by `biasWeight` and never by `weight`.
Measured: at all 65 subzone centres that lie at or past their realm's
`BIOME_OVERRIDE_W`, the realm's biome is still the answer.

### The two kinds of bias, and why there are two

A **climate** nudge moves `temp` and `moist` before the biome is decided and
touches the ground not at all. There is no seam at the edge, because the lean
fades out with the weight.

A **biome override** replaces the answer outright. The override answers **fifth**,
not first:

```
the farm disc  ->  open water  ->  the snow line  ->  the rock line
   ->  THE REALM'S OVERRIDE  ->  beach  ->  boreal / desert / sakura / meadow
```

So real relief always wins, open water is never paved over, and neither is a
river. It also only speaks at `BIOME_OVERRIDE_W` (half the realm's weight) or
more. All of that is driven both ways in `src/world/zones.test.mjs`.

### The engine has eight biomes, and the sheet asks for eleven

`BIOMES` is `ocean, beach, meadow, boreal, desert, sakura, mountain, snow`. The
sheet asks for `fen`, `graveyard` and `crater`, which are none of them and would
each need a palette in `terrain_material.js`, a tree mix in `arbor.js`, a grass
row in `grass.js`, a flora density in `flora.js` and a colour in `win_map.js`.
Until somebody writes those five, **this is what those three words mean here, and
it is an approximation, not a finished thing**:

| the sheet says | the engine does | why |
| --- | --- | --- |
| `fen` (the Saltmarch) | no override; a warm wet climate nudge | the Caldera Sea's own shore does the rest, so the seaward half is genuinely beach because it genuinely stands at a waterline. Measured over the realm: 42% meadow, 5% beach, 4% sakura (willows come out of the sakura mix), 47% water |
| `graveyard` (the Boneyard) | `desert`, under a cold dry climate | the desert tree mix is three quarters dead trees, which is a grey plain with bone white trees on it. The cactus in that mix is wrong and is the price |
| `crater` (the Ashen Throne) | `mountain`, under the hottest driest climate in the world | `mountain` is the only override that gives bare rock at sea level, which is what black glass slopes read as |
| `ocean` (the Sunken Kingdom) | no override at all | the sea disc already makes it water; a climate nudge under a sea is a key nothing could read |

### The nine realms as the engine sees them

| realm | centre | r / edge | override | climate | danger | ore | places |
| --- | --- | --- | --- | --- | --- | --- | --- |
| The Greenwold | 0, 0 | 2200 / 600 | none | none | 1 | copper, tin | 9 |
| Verdant Deep | 1144, 3283 | 2000 / 500 | sakura | +0.04 t, +0.22 m | 1 to 2 | copper, tin, iron, verdite | 10 |
| The Saltmarch | 4800, 2600 | 2200 / 550 | none | +0.16 t, +0.34 m | 2 | copper, tin, iron | 11 |
| Ember Wastes | 5400, -3200 | 2100 / 550 | desert | +0.30 t, -0.34 m | 3 | iron, silver, coldiron | 12 |
| The Stormpeaks | 1123, -4190 | 2100 / 550 | mountain | -0.30 t, +0.10 m | 3 to 4 | iron, silver, coldiron | 11 |
| The Boneyard | -4250, 1202 | 2100 / 550 | desert | -0.06 t, -0.34 m | 3 to 4 | iron, silver, coldiron | 10 |
| Frostreach | -1909, -4967 | 2200 / 550 | snow | -0.42 t | 4 | coldiron, rimesteel | 11 |
| The Sunken Kingdom | 4100, -400 | 1500 / 450 | none | none | 4 to 5 | silver, coldiron | 10 |
| The Ashen Throne | 6699, -159 | 1700 / 550 | mountain | +0.34 t, -0.30 m | 5 | emberite, voidrock, starfall | 11 |

Measured at each centre, in that order: meadow, sakura, meadow, desert, mountain,
desert, snow, ocean, mountain. Nine of nine are the country the realm is meant to
be.

The Stormpeaks carry both an override and a hard cold nudge, and that is
deliberate: the ground under them is not mountainous in this seed (the realm's
own centre stands at 18 m and only 2.7% of its disc clears the 46 m rock line),
so without `mountain` the realm of the dragonriders' peak would be heath. The
nudge is what makes the country **around** the override read as highland, because
a climate speaks at any weight and an override only at half.

The realms very nearly tile the continent: **81.2% of the world's disc is inside
one**, and that is a change from the old table on purpose. Twenty one small zones
with procedural country between them was a set of named places; nine realms with
their own open country inside them is a world with nine parts. The remaining
18.8% is genuine unclaimed ground between realms, and it still gets `WILD_BANDS`
by distance from home and the three low ores, so no ground anywhere is undefined.
Measured: `(-3400, -1800)` is dry, unclaimed, and reports tier 2 to 3.

The world's biome mix moved with all this, measured over a 12 km square: ocean
48.1%, meadow 19.1%, desert 12.1%, mountain 6.5%, sakura 4.3%, snow 4.2%, boreal
3.3%, beach 2.3%. Boreal fell from 9.0% and mountain from 10.1%, because Kaldera
has no conifer realm and only two mountain overrides where the old table had
three plus five cold nudges; desert rose from 6.9% because two realms wear it and
sakura rose from 0.8% because one realm is made of it.

### Where a place stands inside its realm

The layout is by kind, because that is what makes a realm readable on foot:

```
0.18 r  hub, town             0.60 r  wild
0.26 r  hamlet                0.62 r  sea
0.42 r  megastructure         0.64 r  road
0.50 r  landmark              0.70 to 0.76 r  ruin, shrine, cave, camp, dungeon, mine
```

A subzone's radius is 0.15 of its realm's (160 m at the least) and its edge is
0.35 of its radius. `auditZones` proves that every subzone's whole reach lies
inside its realm's reach, which is what makes the two deep lookup exact rather
than merely fast, and that no two places of one realm share more than 30% of the
smaller one's area. Measured: the worst pair in the world is Hearthhome and the
Old Cellars at 30%.

### Overlaps

Two zones may overlap. The one you are furthest inside **relative to its own
size** wins, so a small zone laid over a big one keeps its own middle and gives
the big one back its rim. That is also exactly why a subzone always wins inside
itself and its realm keeps the country between.

### The promise about the heart

Saves already exist and a character is standing near the origin. The Greenwold
holds the origin, and:

> **No zone carrying a biome override or a climate nudge may WIN anywhere within
> `HEART_SAFE` (1500 m) of the origin; no authored site may stand there, nor own
> a site cell the heart's own digest samples; and the Caldera Sea's outermost
> reach must stay outside it. `auditZones()` measures all three at import.**

It **measures** them. The old rule compared radii, which was a proxy, and once
realms nest and overlap a radial proxy is wrong in both directions: it forbids a
big realm whose bias never actually wins near home, and it permits a small one
that does. So the audit walks a 50 m grid over the whole `HEART_SAFE` disc and
asks `zoneBias` at every point. Measured on a 25 m grid in the test: clean, and
the first biased ground anywhere is **1900 m from the origin**.

The Greenwold carries neither a biome nor a climate. The nearest authored site is
1644 m out, Hearthhome's own precinct stands 1748 m out, and none of the 36 site
cells that cover the digest's 2 km square holds one.

`field.test.mjs` proves the rest: a 2 km square about the origin, 101 by 101
samples at 20 m, every field of every sample fed to sha256. The digest is
`6408cb4e...`, taken from the commit before `zones.js` existed. **It is bit for
bit identical after Kaldera landed.**

## 3. Discovery, which is now per realm and per place

Two events, and they are not the same one.

- **A site** is found when you walk within 70 m of a thing you can point at.
  `discovery.check()` returns it once. Unchanged.
- **A zone** is entered when you are at least half inside it.
  `discovery.checkZone()` returns it once, ever.

What is new is that zones nest, so `checkZone` walks a **chain**: the realm
first, then the place inside it. A subzone's weight is not its realm's, and
announcing only the deepest zone would tell a player about the Glass Road without
ever telling them they had walked into Ember Wastes. `zoneChain(x, z)` in
`sites.js` is that pair, outermost first, each with its own weight.

The banner is `hud.zone(name, zoneSub(zone))`, and `zoneSub` now answers by rank:

- a **realm** says how dangerous it is, because that is what you need on arriving
- a **place** says which realm it is in, because the realm already told you the
  danger and what you do not know now is where you are

Measured: Hearthhome reads "the Greenwold", the Glass Road reads "Ember Wastes",
and the Greenwold itself reads "quiet country". Every one of the 104 fits the
banner's slot of four words and 24 characters.

`zoneNow` returns the deepest zone you are half inside, so the HUD names the Salt
Pans when you are in them and Ember Wastes when you are not.

## 4. Outdoor mining caves

The answer is unchanged: a `mine` is an authored site kind and nothing else rolls
one. A mine is a yard (`flatR` 20), two to four cuts up the hill from it, and
four to seven surface seams on the yard. `world_runtime.enterDungeon(mouth)`
takes a cut unchanged.

What changed is that there is now **one mine in every realm**, because the sheet
gives every realm a way underground, and each takes its ore band from the sheet's
own sentence about it rather than from its realm's band:

| mine | realm | band |
| --- | --- | --- |
| The Chalk Pits | The Greenwold | copper, tin |
| Verdite Hollow | Verdant Deep | iron, verdite |
| The Salt Cut | The Saltmarch | iron, silver |
| The Ember Cut | Ember Wastes | iron, emberite |
| The Thunder Shaft | The Stormpeaks | silver, coldiron |
| The Marrow Mine | The Boneyard | coldiron, voidrock |
| The Rime Cut | Frostreach | coldiron, rimesteel |
| The Pearl Beds | The Sunken Kingdom | silver, coldiron |
| The Cinder Cut | The Ashen Throne | emberite, voidrock, starfall |

Nine mines, **27 cuts and 47 seams**, measured off the real field. Every one of
the ten ores on the ladder is on the surface of some hillside; starfall is on
exactly one, The Cinder Cut, and it is on the rim. `auditZones()` throws if
emberite, rimesteel, voidrock or starfall is ever dropped from every mine.

A mine wants a hillside, and that is now a placement rule rather than a hope. The
probe reproduces field.js's own `facing` (the bearing with the greatest drop 15 m
out) and checks every angle a cut could land on. Measured over all 27 cuts: the
shallowest rises **0.50 m** above its yard, the median 3.0 m, the steepest 12.6 m,
and not one stands in water.

## 5. The map and the compass

Unchanged in code, and both still pass. `win_map.js` draws every zone in `ZONES`,
which is now 104 rather than 21, and the two deep table needs nothing from it: a
subzone is a disc like any other, it hatches until walked into, it tints by its
danger band, and clicking it sets a waypoint on its centre. `compass.js` never
knew about zones at all.

Two things the map's owner should look at, neither of which is broken:

1. the region list beside the map now has 104 rows rather than 21, sorted by
   distance. It works; it is a lot of rows. Grouping them under their realm would
   read better.
2. a subzone and its realm are both drawn, so a place inside a realm is a disc
   inside a disc. That is correct, and it may want a lighter stroke for children.

## 6. How to add a place

**You do not add one here.** You add a row to `src/mmo/realms.js`, and then one
line to `LAYOUT` in `zones.js` saying where it stands and how much ground it
owns. Everything else follows: the zone record is generated, the field picks up
its realm's bias, monsters pick up the danger band, the map draws and hatches it,
discovery announces it under its realm's name, and if its kind is one that has a
building, an authored site appears at its middle with the right pad, the right
article and the right ore band.

Nine things `auditZones()` will stop you doing, at import, with the whole list
rather than the first line of it:

1. a bias winning anywhere inside `HEART_SAFE` of the origin, measured on a grid
2. an authored site inside `HEART_SAFE`, or the Caldera Sea reaching it
3. a realm centre within 1 km of the world's edge, or a subzone centre within
   500 m of it
4. a subzone that carries a bias of its own
5. a subzone whose disc, or whose soft edge, leaves its realm
6. two places of one realm sharing more than 30% of the smaller one's area
7. a place of a building kind with no site, or a site answering no place, or a
   site that does not stand at the middle of its own subzone
8. a danger band off the 1 to 5 ladder, or a climate delta over half the scale
9. dropping the last mine that carries emberite, rimesteel, voidrock or starfall

And more that `zones.test.mjs` will stop you doing, against the real terrain: a
site in water, a site in a river, two sites in one 480 m cell, a site outside its
cell's margin, a site owning one of the heart's own cells, a realm the origin's
flood fill cannot reach, a place in the sea that is not on a named reef, and a
mine whose cuts do not stand above its yard.

## 7. Every coordinate was measured, not chosen

A probe laid the 95 places out by kind (the rings above), then walked the real
field and moved any that fell in water, in a river, into a sibling by more than a
third of its own area, out of its own cell's margin, into a cell another building
already held, or out of reach of a hundred metre eight way flood fill from the
origin. A mine had to stand on a hillside. A realm's own centre had to be dry,
out of a river, under the rock line so its override answers rather than the
relief, reachable on foot, inside the 16 km square disc and all, at least 45% dry
ground (30% for a rim realm, whose whole seaward side is meant to be coast), and
unable to out-score the Greenwold anywhere in the heart.

The offset is the one that puts the Greenwold's centre on the origin, and it is
`+1800` in x, applied to all nine. Three realms then had to move further than
that:

- **The Ashen Throne**, which the shift put 7496 m out with a 2800 m radius, so
  its disc left the world entirely. It now stands at `(6699, -159)` with its
  radius cut to 1700.
- **The Sunken Kingdom**, moved east from `(3000, -400)` to `(4100, -400)` and
  shrunk from 2600 to 1500, so that the Caldera Sea's shore clears the Greenwold
  and stays 2519 m from the heart. At the shifted position the sea would have
  reached 426 m from the origin and drowned the farm.
- **The Boneyard**, pushed back out west to `(-4250, 1202)`, because the uniform
  shift had left it 2912 m from the origin, which put an ash plain within a walk
  of the starting village.

Three more moved between 25 m and 200 m to get off water or out of a river:
Verdant Deep by 100 m, the Stormpeaks by 25 m and Frostreach by 200 m.
Everything else is the sheet's own position plus the offset.

The flood fill covers 7783 of 8892 land cells. Of the 46 authored sites, 42 are
reachable on foot and 4 are meant not to be: The Salt Cut stands among the
Thousand Isles, and The Drowned Palace, Pearl Reef and The Pearl Beds stand on
named reefs in the Caldera Sea. Those four are checked for being dry instead,
which is the promise that actually matters about them.

## 8. What is not built

Honestly, so nobody reports it as working:

- **`fen`, `graveyard` and `crater` are not biomes.** See the table in section 2.
  Three of the nine realms are wearing the nearest thing the engine has.
- **A dungeon's `levels` is carried and read by nothing.** `authoredSites()` puts
  realms.js's own number on every dungeon site (1 for the Old Cellars, 3 for the
  Throne of Ash), and `dungeon_gen.maxLevel()` still returns a flat 3 for every
  dungeon in the world.
- **`monsters.js` does not read `sample.danger` yet**, and now that a sample also
  carries `realm`, the habitat column in the monster roster has something to key
  on that it is not yet keyed on.
- **Nothing renders a mine's surface seams**, and **`dungeon_gen.js` does not read
  `site.oreBand`**. Both were open at the end of Z1 and are still open.
- **The Caldera Sea has no boats.** It is water, it has reefs and islands and a
  shore, and the only way across it is to swim.
- **The town precincts are empty.** Seven sites carry a 120 m levelled precinct
  (Hearthhome, the Canopy Court, the Red Queen's Harbour, the Last Well,
  Cairnfoot, Coldseat and Cinderport) and `site_models.js` draws the same town on
  them as on a 46 m one. Wave B's T1 is what fills them.
