# The world has an edge, and twenty one places worth naming

The user's words: "I want a vast explorable world but not infinite, and we need
to author cool and interesting zones and have a world map which we can open and
see what is where and be able to run there with a compass." And: "I want to
author outdoor mining caves with rarer ore, but I do not know how to do this. I
do not know how to handle zone discovery if the world is infinite."

That last sentence is the whole problem. An endless world cannot be discovered,
because there is always more of it; cannot be mapped, because a map of an
endless thing is a window; and cannot be authored, because there is nowhere in
particular to put anything. Everything the user asked for follows from bounding
it.

## 1. The shape of the world

**One continent, inside a 16 km square, the origin at its centre.**

`src/world/zones.js` owns this. `WORLD_HALF` is 8000 m: at that radius the
ground is at `OCEAN_FLOOR`, which is 30 m down. Between about 6.7 km and 8 km
the land slides into the water along `coastRadiusAt`, a mean radius of 7100 m
wobbled by three harmonics of the bearing so the coastline bays and bulges
instead of ruling a circle. Measured: the coast runs between 6660 m and 7540 m,
and the last dry ground on 64 bearings is 5925 m at the shortest, 7275 m median,
7775 m at the longest. On 52 of those 64 bearings there is sand between the last
meadow and the sea.

Nothing wraps.

**A wrap was considered and rejected.** Running east until the world hands you
back the hill you started from is a seam: the player sees the same rock twice
and learns that the world is a trick. A coast is the honest version of the same
boundary. You can see it coming, you can stand on it, and it says what it is. If
a player insists on swimming, `clampToWorld(x, z)` exists for main.js to pull
them back at the rim; the deep water does most of that work on its own.

**The inland world is untouched.** `oceanBeyond(x, z)` returns exactly 0 inside
`COAST_MIN` (6500 m) and the code that applies it does not run there at all, so
the falloff cannot cost an inland sample a rounding step. Measured over 3600
probes.

### What being bounded costs

The world was previously sampled as if it were endless. Inside 4.8 km nothing
changed at all. Between 6.2 km and 7.7 km, what used to be land is now sea, and
the continent's totals are now countable rather than notional:

| | inside 4.8 km | the whole continent |
| --- | --- | --- |
| settlements, before | 39 | 120 out to 7.7 km, 287 out to 12 km |
| settlements, now | 38 | 72 |
| roads, before | 9 | 28 out to 7.7 km, 78 out to 12 km |
| roads, now | 9 | 12 |

Twelve roads for seventy two settlements is thin, and it is a number for the
roads owner to look at rather than something this note can fix: forty eight of
those settlements have no neighbour `roads.js` can reach on foot at all. The
site totals over the whole continent are 15 towns, 57 hamlets, 36 dungeons, 10
rolled caves, 7 authored mines with 21 cuts between them, 37 ruins, 23 shrines
and 18 camps. Sixty seven ways underground.

## 2. Zones

A zone is a disc with a soft edge, and it carries what an author wants said
about that part of the world:

| field | what it is |
| --- | --- |
| `id` | stable, saved in the character's list, never renamed |
| `name` | what the banner says |
| `x, z, r, edge` | centre, the radius it owns outright, and how far the weight takes to fall to nothing |
| `biome` | a hard override, or null |
| `climate` | `{ temp, moist }` added to the field's own, scaled by the weight |
| `danger` | the monster tier band, `[lo, hi]` |
| `ore` | ore ids, poorest first: what a vein or a surface seam here may be |
| `sites` | places at fixed coordinates, measured against the real terrain |
| `line` | the one line under the banner |

Twenty one of them: one heart, six at about 3 km, eight at about 4.4 km, six at
about 6.6 km. They do not tile the continent and are not meant to. Two hundred
square kilometres divided into twenty one boxes is a menu; twenty one named
places with the field's own country between them is a world. Everything the
zones do not claim gets a danger band by distance from home (`WILD_BANDS`) and
the three low ores, so no ground anywhere is undefined.

### The two kinds of bias, and why there are two

A **climate** nudge moves `temp` and `moist` before the biome is decided and
touches the ground not at all. It is how The Long Dark becomes boreal and Kiln
Heath becomes dry: the field's own rules make the biome, the zone only leans on
them. There is no seam at the edge, because the lean fades out with the weight.

A **biome override** replaces the answer outright, and it is used sparingly:
`mountain` for The Iron Shoulder, The Stone Garden and The Teeth, `snow` for The
Frostcrown, `desert` for The Sallow Wastes. It is the only way to get bare stone
at sea level or snow on a shoreline, which is what a rim of the world should
look like.

The override answers **fifth**, not first:

```
the farm disc   ->  open water   ->  the snow line   ->  the rock line
    ->  THE ZONE'S OVERRIDE  ->  beach  ->  boreal / desert / sakura / meadow
```

So real relief always wins: a peak inside a mountain zone is still snow. Open
water is never paved over, and neither is a river. It also only speaks at
`BIOME_OVERRIDE_W` (half the zone's weight) or more, so a zone never announces
itself from its own fringe. All of that is driven both ways in
`src/world/zones.test.mjs`.

### Overlaps

Two zones may overlap. The one you are furthest inside **relative to its own
size** wins, so a small zone laid over a big one keeps its own middle and gives
the big one back its rim. The Mill Run sits inside The Bracken Vale's reach and
still owns itself.

### The promise about the heart

Saves already exist and a character is standing in a town near the origin. So:

> **No zone that carries a biome override or a climate nudge may reach within
> `HEART_SAFE` (1500 m) of the origin, and `auditZones()` throws at import if
> one ever does.**

The Bracken Vale, which is the heart, carries neither. It is a name, a danger
band and an ore band laid over ground the field already made. The nearest biased
zone is Thornwood, whose reach stops 1565 m out.

`field.test.mjs` proves the rest: a 2 km square about the origin, 101 by 101
samples at 20 m, every field of every sample fed to sha256. The digest is
`6408cb4e...`, taken from the commit before `zones.js` existed. It is bit for
bit identical now. If a later change moves so much as a metre of the heart, that
line goes red and names the change that did it.

## 3. Discovery, which is now per zone

Two events, and they are not the same one.

- **A site** is found when you walk within 70 m of a thing you can point at.
  `discovery.check()` returns it once. Unchanged.
- **A zone** is entered when you are at least half inside it.
  `discovery.checkZone()` returns it once, ever, and then never again. Half in
  is also where the zone's own bias reaches half strength, which is the first
  place the country actually looks different, so the banner and the ground agree.

Entering is a banner (`hud.zone(name, zoneSub(zone))`, with the zone's own
sentence as a toast beside it: `hud.zone` renders its second line in small caps
at .3em spacing, which is a slot for three words) and a map reveal: a zone you have
walked into is tinted by its danger band and named on the map; one you have not
is hatched and anonymous. The two lists are separate localStorage keys, so a
save from before zones existed keeps every site it had found.

## 4. Outdoor mining caves

The user asked how to author them. The answer is a new site kind, `mine`, and it
is authored only.

**`mine` is deliberately not a row of `KINDS`.** Adding a weight to that table
changes `KIND_TOTAL`, which changes the kind every cell in the world rolls,
which moves every town in every save on disk. A mine exists because an author
put one somewhere, and nowhere else. `sitegrid.test.mjs` guards the weights.

A mine is:

- **a yard**, `flatR` 20, the widest levelled ground in the world outside a
  town. flora.js and fauna.js already read `flatR`, so the yard clears itself of
  trees and animals with no change to either.
- **two to four cuts**, up the hill from the yard (the yard is downhill, which
  is where the barrows went). Each cut is a complete cave shaped site: its own
  id, its own generator cell so two cuts are never the same level twice, its own
  name, and the mine's ore band. `world_runtime.enterDungeon(mouth)` takes one
  unchanged.
- **four to seven surface seams** on the yard, each carrying an ore id drawn
  from the mine's band. This is what makes a mine legible from outside: you can
  see what is in the hill before you go in.

Seven mines carry the ore ladder that a rolled cave never will:

| mine | zone | band |
| --- | --- | --- |
| the Millrun Adit | The Mill Run | copper, tin, iron |
| the Ember Cut | The Ember Flats | iron, emberite |
| the Deep Shoulder | The Iron Shoulder | iron, silver, coldiron |
| the Low Shoulder | The Iron Shoulder | silver, coldiron |
| the Rime Cut | The Frostcrown | coldiron, rimesteel |
| the Cinder Cut | Cinderreach | emberite, voidrock |
| the Sallow Fall | The Sallow Wastes | voidrock, starfall |

A rolled cave takes the band of the zone it stands in, which outside a mine zone
is copper, tin and iron and nothing else. Measured: of the ten rolled caves on
the continent, six carry only the low three.

`auditZones()` throws if emberite, rimesteel, voidrock or starfall is ever
dropped from every mine, because that would leave a whole tier reachable only by
a dungeon the player has no reason to be told about.

## 5. The map and the compass

`win_map.js` draws the whole continent at once: 16 km across, 128 samples a side
(125 m each), the coast, the zones, the roads, every site you have found, your
waypoint and you. A click on a discovered site or zone writes
`character.waypoint = { x, z, name }` and says so twice, in the panel and as a
toast, because a waypoint set in silence is indistinguishable from a click that
did nothing. Measured cost with the zones drawn: 53.7, 58.7 and 70.4 ms against
a 130 ms budget.

`compass.js` is a strip under the place plate. North is -z, because that is the
direction that is up on the map. `player.js` says forward is
`(sin yaw, cos yaw)`, so yaw 0 faces south; `headingOf` does that conversion
once and nothing else has to hold both conventions. The strip is 180 degrees
wide, so a waypoint due north while you face east lands at exactly -1, hard
left, and walks to the middle as you turn to face it.

While writing the compass the player arrow on the map turned out to have been
pointing backwards at every heading since it was written: it rotated by `-yaw`
where the map's `+z` down and `player.js`'s forward together require `PI - yaw`.
Nothing tested it. It is fixed, and `win_map.test.mjs` now drives all four
cardinals plus the real draw's rotation argument.

## 6. How to add a zone

One row in `ZONES` in `src/world/zones.js`. Nothing else in the game has to be
told: the field picks up the bias, monsters pick up the danger band, the map
draws and hatches it, discovery announces it, and the compass will point at it
once someone clicks it.

```js
{
  id: 'saltmere', name: 'Saltmere', x: 3000, z: -2000, r: 950, edge: 400,
  biome: null, climate: { temp: 0, moist: 0.16 },
  danger: band(2, 2), ore: band('copper', 'tin', 'iron'),
  sites: [at('ruin', 'the Weir Steps', 3018, -2139, 'Steps into water that used to be a floor.')],
  line: 'A shallow sound that is half land at low tide and none of it at high.',
},
```

Five things `auditZones()` will stop you doing, at import, with the whole list
rather than the first line of it:

1. reaching within `HEART_SAFE` of the origin with any bias
2. standing the centre within 1 km of the world's edge
3. a danger band off the 1 to 5 ladder, or a climate delta over half the scale
4. an authored site outside its own zone's radius, or of an unknown kind
5. dropping the last mine that carries emberite, rimesteel, voidrock or starfall

And four more that `zones.test.mjs` will stop you doing, against the real
terrain: a centre or a site in water, a site in a river, two authored sites in
one 480 m cell, and a zone the origin's flood fill cannot reach.

**Every coordinate in the table was measured, not chosen.** A probe walked the
real field, took a flood fill over 100 m cells from the origin at sea level plus
half a metre, and every centre and every one of the thirty authored sites sits
on ground that fill reached. That fill covers 8062 of the continent's 8984 land
cells, 89.7%; the rest is genuine islands.

The fill is eight way rather than four. At a 100 m stride a river carved to
-1.8 m and 20 m wide reads as a broken diagonal chain of holes that four way
connectivity cannot step over, and a player wades across it without noticing. If
you move a zone, run `node src/world/zones.test.mjs` and it will tell you
whether you can walk there.

## 7. What is not built

Honestly, so nobody reports it as working:

- **Nothing renders a mine.** `site_models.js` has no `mine` branch, so a mine
  currently builds an empty group. The data is all there on the site object
  (`mouths`, `seams`, `y`, `facing`); somebody has to draw it.
- **Nothing renders the surface seams.** `flora.js` already scatters ore
  boulders round a cave mouth; the seams need the same treatment, keyed off
  `site.seams` and carrying `seam.ore` so the tier is legible.
- **You cannot walk into a cut yet.** `world_runtime.pick` finds a site through
  its marker meshes, and a mine has none. See `docs/mmo/wiring/Z1.md`.
- **`dungeon_gen.js` does not read `site.oreBand` yet**, so a cut behind the
  Sallow Fall generates the same ore as a cut behind the Millrun Adit.
- **`monsters.js` does not read `sample.danger` yet.** The band is on every
  sample and nothing rolls against it.
- **The crater and graveyard kinds** that `05-WORLD-CONTENT.md` asks for are not
  here. They would be authored kinds like `mine`, for the same reason: adding
  them to `KINDS` would reshuffle the world.
