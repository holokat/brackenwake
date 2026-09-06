# ED2: the terrain half of the editor

> **Superseded in part by ED3** (`docs/mmo/wiring/ED3-SCULPT.md`, 2026-09-07).
> The eight kinds below are now sixteen, the five painted words are ten, the
> file carries a header that can put the generator away entirely, and the
> index's cell key was a hash that could put one big stroke into a list twice.
> Everything else here still stands and ED3 says what it changed.

Written 2026-09-07. The request, in the user's words: "i need to be able to
raise terrain, carve mini caves into terrain". A person walks the Greenwold in
dev mode, points at the ground, and the ground moves.

Files written: `src/world/terrain_edits.js` (new), `src/world/terrain_edits.test.mjs`
(new), this note. Files changed: `src/world/field.js`, `src/game/world_runtime.js`,
`src/game/app/systems/world.js`, and their two test files.

Four files that belong to nobody were given one hook each, and each one is
quoted in full below: `src/world/chunks.js` (rebuild a built chunk),
`src/world/terrain_material.js` (what painted ground is made of),
`src/world/grass.js` and `src/world/dressing.js` (keep off painted ground).
`src/world/grass.test.mjs` gained a block that drives the last of those both
ways. Nothing in `src/game/editor/`, `src/mmo/spaces/`, `plan_models.js`,
`site_models.js`, `win_dev.js` or `vite.config.js` was touched: those are the
placement half's.

## The shape of it

```
  a person points at the ground
        |
  window.__bw.terrain.stroke({ kind, x, z, r, amount })   systems/world.js
        |
  terrainEdits.stroke(s)          the list, src/world/terrain_edits.js
        |
  field.sampleAt -> h += edits.heightDelta(x, z, h)       src/world/field.js
        |                    -> sample.ground = paint
  runtime.rebuildAround(x, z, reach + 8)                  world_runtime.js
        |
  world.rebuildWhere(pred) -> build(cx, cz, verts)        src/world/chunks.js
        |                       onDisposed / onBuilt
        +-- terrain mesh, flora, grass, dressing, wayside, site markers
```

One join between the world and the hand: `field.setTerrainEdits(edits)`. With no
list set the field is the field the seed made, bit for bit, and the heart digest
in `field.test.mjs` did not move.

## The eight kinds, and what each one measures

Every profile is a smooth function of distance with zero slope at its own rim,
so two chunks that share a vertex agree about it at any resolution and no seam
can crack. Only two shapes are used, `(1 - t^2)^2` and `smoothstep`.

| kind | what it does | measured, in `terrain_edits.test.mjs` |
|---|---|---|
| raise | a dome, `amount` at the centre, 0 at r | 2.000000 m at the centre, 1.1250 m at r/2 against a dome's 1.1250, 4.8e-30 m at r, exactly 0 past it |
| lower | the same, down | -3.0000 m at the centre |
| flatten | pulls the ground to the height the centre had, full inside r/2, feathered to r | worst point inside r/2 is 0.000 cm off the centre height, on a hillside that was 0.75 m out before it |
| smooth | pulls part of the way toward the average of a ring at 1.5 r | variance of a rough patch 7.661 m^2 to 2.171 m^2, and 2.171 left, so it is not a flatten |
| pit | a flat floor `amount` down, a wall, a lip with no step | floor 3.0000 m below the rim, flat out to 6.30 m of a 9 m radius, wall 1.67 m per metre (59 degrees), worst 1 cm step at the lip 0.0167 m |
| cliff | a step of `amount` across the line the yaw draws | high side 4.0000 m, low side exactly 0, the line itself 2.0000 m, steepest 3.000 m per metre |
| cave | a cut in front of a mouth, and a place to walk into | the cut is 2.000 m deep, the mouth stands on its floor, the hillside behind it is untouched |
| ground | paints dirt, rock, sand, grass or mud inside r | the word is on the sample, the last stroke over a point wins, and a word nobody knows is refused by name |

`maxGrade(stroke)` is analytic and the test drives it against the real profile
at 1 cm steps: raise claimed 0.2566 and measured 0.2566, pit claimed 1.667 and
measured 1.667, cliff claimed 3.000 and measured 3.000. A `flatten` and a
`smooth` return null rather than a number, because how steep they are depends on
ground this function is not given.

**A pit widens its own wall rather than cutting a hole.** A 9 m pit in a 3 m
radius would stand at 45 m per metre, which is not a hollow, it is a tear. The
wall run grows until the steepest metre is inside `MAX_WALL_GRADE` (6): measured,
that pit comes out with its wall starting at 0.250 of the radius and standing at
exactly 6.00. Anything still steeper than the 8 m per metre the mesher can show
says so in the words the stroke reports.

**A stroke that needs a sample takes it once.** `flatten` and `smooth` are
functions of the ground, so `stroke()` asks the field for the height (or the ring
average) at the moment the stroke is made and writes it into the stroke as `h0`.
That is what makes the file portable: 11,000 points of a six stroke world came
back bit for bit identical from a list loaded with no sampler at all.

**A stroke sees the strokes before it.** `heightDelta` walks its cell's list in
order, carrying the running height, so a flatten laid over a raise flattens the
raised ground: `h0` 12.166 against the raised 12.166, where the hillside under it
is 7.166.

## Caves: the path that already existed

The heightfield cannot hold an overhang, so a cave is a mouth in a hillside and
an interior below it, and the game already knew how to build both. What it did
not have was a way to add a place at runtime.

**What was found.** Every place in the world comes out of `field.siteInCell`,
which `sites.sitesNear` walks cell by cell. That is where a cave would belong,
and it is the one place it cannot go: a cell holds ONE site and, measured off
`sitegrid.js`'s own numbers, 93% of cells out in the country already hold one.
A hand cut cave would have had to displace a hamlet.

**What was added, and it is two lines of wiring.** `field.editSitesNear(x, z, r)`
holds the cave strokes as site records, and `world_runtime.js` adds them to what
`discovery.sitesNear` hands out:

```js
  const baseSitesNear = discovery.sitesNear;
  discovery.sitesNear = (x, z, r) => {
    const out = baseSitesNear(x, z, r);
    const extra = field.editSitesNear(x, z, r);
    return extra.length ? out.concat(extra) : out;
  };
```

Everything downstream is untouched and everything downstream works: the site
marker streamer builds the mouth out of `kind: 'cave'` and `facing`, `pick`
raycasts it, `interact.js` opens it with E at 14 m, flora and dressing keep off
its pad, and the monster and people layers see it. `discovery.check` does NOT
see it, deliberately: a cave you cut yourself is not a discovery.

**Which way it faces.** `field.downhillAt` is the same eight direction probe
`siteInCell` uses for every rolled cave, run over the ground WITH the strokes in
it and WITHOUT the cave cuts (`heightDelta(x, z, h, 'cave')`). Without the
exclusion it is circular: the cut in front of a mouth is the lowest ground for
fifteen metres, so every mouth would face its own hole. Measured on a real
hillside: 6.57 m ahead against 5.74 m behind.

**What is inside.** `EDIT_CAVE_SPEC` in `world_runtime.js` turns the stroke's
size into a row shaped like a row of `src/mmo/dungeons.js`, and `generateCavern`
reads it. The generator's only knobs are these, so SIZE MEANS DEPTH AND WHAT IS
IN IT; the grid is the generator's own (62 to 74 cells at 2 m a cell, six cells
wider per level down) and nothing outside `cavern_gen.js` can change it.

| size | `amount` | levels | chests | caches | tier |
|---|---|---|---|---|---|
| small | up to 1 | 1 | 1 to 2 | 1 to 3 | 1 |
| medium | up to 2 | 2 | 2 to 3 | 2 to 4 | 2 |
| large | over 2 | 3 | 3 to 4 | 3 to 5 | 3 |

All three carry `arena: false`. Nobody's boss lairs in a hole somebody dug this
afternoon.

Each cave takes a generator cell of its own, `EDIT_CELL + round(x)`, because
`dungeon_gen` keys a level off `(cx, cz)` and two caves a metre apart would
otherwise be one cave with two mouths.

Driven in `world_runtime.test.mjs`: the stroke stands a place up, the streamer
builds a mouth for it, a ray onto that mouth picks the cave, `enterDungeon`
builds a cavern of 7 chambers, `dungeonGo('down')` reaches level 2 of a medium,
and leaving puts the daylight world back.

## Painted ground

`sample.ground` is the word, and it is null on every sample of a world nobody
has edited. Three of the five words also take the biome with them
(`field.PAINT_BIOME`: grass to meadow, sand to beach, rock to mountain), which is
what makes the paint visible without a second path, since the vertex colour, the
texture mix, the turf table and the tree species all read `biome` already.
`dirt` and `mud` have no biome of their own and travel on the word alone.

Three one line consults, each in the one place that decides:

- `src/world/terrain_material.js`, in `layerWeights`, over the country and under
  the road: `PAINT_MIX[s.ground]` at 0.9. Measured: a meadow's rock layer goes
  from 0.04 to 0.90 under `rock` paint, and dirt paint takes the dirt layer over
  0.7 without moving the biome.
- `src/world/grass.js`, in `fillTile`, beside the turf rules. Measured both ways
  on the same tile of the same meadow: 12 blades placed with no paint, 0 placed
  and 52 dropped with `dirt` over it.
- `src/world/dressing.js`, in `probeAt`, after the road: `why: 'painted'`.
  Measured: open ground before, refused after, and the refusal names itself.

A `ground` stroke moves no ground at all, which the test drives.

## Putting the ground back up

`chunks.js` rebuilt a chunk when its resolution changed and never otherwise,
because until now the ground under a built chunk could not move. It has one new
call, `rebuildWhere(pred)`, which goes through the same `build` the streamer
uses, so a rebuilt chunk disposes its old geometry, fires `onDisposed` and then
`onBuilt`, and its flora, dressing and wayside come back with it.

`runtime.rebuildAround(x, z, r)` rebuilds every built chunk whose square touches
the circle, synchronously, because the editor's whole promise is that the ground
moves under the stroke you just made. A 12 m brush touches one to four chunks
and a 33 vert chunk is about 2 ms to mesh.

Site markers are refreshed too, but only when a site is inside the circle: a
marker is built once, at the height the field gave it, so a mine whose hillside
has just moved would otherwise stand in the air. There is no "rebuild one
marker" in `site_models.js`, so the live set is dropped and the ring rebuilds it
one marker a frame, which is what it does when you walk into a valley anyway.

**It leaks nothing.** Measured in `world_runtime.test.mjs` on a rebuild with
nothing changed: 16 nodes and 13 geometries in the world groups before and 16
and 13 after, 12 chunks loaded before and after, flora holding 29 records in 12
chunks before and after, 2 geometries replaced and 0 of them left undisposed
(`BufferGeometry.prototype.dispose` is patched for the length of that block and
every uuid that left the scene is looked for in what it recorded).

**And it rebuilds only what it should.** A rebuild 200 km away rebuilds 0
chunks. A rebuild over the player rebuilds 2 of the 12 built. The chunk furthest
from the stroke still carries the ground it was built with.

## The file, and the boot

`public/terrain/greenwold.json` is a serialized stroke list. The runtime fetches
it at boot; missing is the ordinary case and is silent.

It cannot be waited for. `createWorldRuntime` is synchronous and the streamer
does not wait for anybody, so the file lands when it lands and everything built
in the meantime is built again: measured in the test, 18 chunks of 18 rebuilt,
and `onTerrain` reports the count so the words the HUD says are counted rather
than claimed. `terrainFile: false` turns the fetch off, which is what a test
that owns its own list does.

Saving goes to `POST /__editor/save` with `{ path: 'public/terrain/greenwold.json', json }`,
which is the path `tools/editor_save.mjs` allows. A save that did not happen
throws rather than returning words, so it cannot read like one that did.

## The contract the editor calls

`window.__bw.terrain`, from `src/game/app/systems/world.js`:

| call | what it does | what it returns |
|---|---|---|
| `stroke(s)` | lays the stroke, rebuilds around it, logs the words | the words |
| `undo()` | takes the last stroke back and rebuilds | the words, or `false` when there was nothing |
| `redo()` | puts it back and rebuilds | the words, or `false` |
| `save(path)` | POSTs the list | the words; throws when there is no endpoint |
| `list()` | every stroke as plain rows | an array |
| `count()` | how many strokes, caves, undone | an object |
| `rebuildAround(x, z, r)` | puts the ground back up, laying nothing down | `{ chunks, sites }` |
| `runtime` / `edits` | the runtime and the list themselves | |

A stroke of a kind that needs a bearing and was not given one takes it here: a
cave from `field.downhillAt`, so a mouth opens out of the hillside, and a cliff
from the player's own yaw, so the step faces the way he is looking.

The placement half's palette (`src/game/editor/palette.js`) offers seven
brushes: raise, lower, flatten, smooth, pit, cliff, cave. `ground` is the eighth
kind and it is not among them, so painting is reachable through
`window.__bw.terrain.stroke({ kind: 'ground', x, z, r, word })` and not yet
through a button. The words it takes are on the contract as `terrain.words`.

Every one of them says what it did, in the HUD log, with counted numbers:

```
  raised 2.0 m over 12 m at 749, 1579, 2 chunks of ground rebuilt
  dug a pit 3.0 m deep and 18 m across at 749, 1579, 4 chunks of ground rebuilt
  cut a cave mouth at 1002, 1719, facing 41 degrees, medium, 2 levels of cavern
    under it, E at the mouth to go in, 4 chunks of ground rebuilt
  painted dirt over 8 m at 749, 1579
  took back the raise at 749, 1579, 2 chunks of ground rebuilt
```

## What it costs

The stroke list, measured in its own test: 2,000 strokes over a 2 km square and
10,000 samples in 4.5 ms, which is 0.45 microseconds a sample. An undo with
2,000 strokes down rebuilds the index in 0.35 ms.

`field.sampleAt`, measured against the same function at HEAD over 60,000 samples,
best of twelve interleaved rounds:

| | microseconds a sample | over HEAD |
|---|---|---|
| HEAD | 1.429 | |
| now, no list set | 1.487 | 4.1% |
| now, an empty list set (what the game boots with) | 1.492 | 4.5% |
| now, 200 strokes over the square being sampled | 1.577 | 10.4% |

The 4% that is there with no list at all is the extra `ground` property on the
sample object; the empty list itself is 0.4% on top of that, because
`field.sampleAt` asks `EDITS.live`, a plain boolean, rather than calling into the
module. Asking `heightDelta` and `groundOverride` instead cost 5.2%.

A 33 by 33 chunk is 1.7 ms of sampling either way.

## Water, and what a pit in a valley does

Water is not touched. `src/world/water.js` draws one sheet at sea level and
`sample.water` is `h < SEA_LEVEL - 0.05`, worked out AFTER the strokes are added,
so a pit dug below sea level fills with water and reads as water to everything
that asks. That is deliberate: it is how a pond is dug. A raise does not drain a
river, either: the river is carved into the ground before the stroke is laid on
top, so a raised river bed rides up with its water in it.

## What is not verified

- **Nothing was driven in a browser.** Every claim above is measured in node,
  against the real modules, through the real surfaces. The reviewer drives the
  dev server.
- **The placement half's calls into this contract** were read out of
  `src/game/editor/editor.js` while that agent was writing it, and matched by
  hand: `stroke` returning words, `undo` and `redo` returning `false` when there
  is nothing, `save` throwing on failure. The two halves have not been run
  together.
- **A drag of many strokes** is one stroke per call and one rebuild per stroke.
  A fast drag over a 12 m brush will rebuild the same chunk several times a
  second. It is under the frame budget for a brush of this size and it has not
  been measured for a brush of 120 m, which the editor's own slider allows.
- **`smooth` averages a ring taken once at the stroke's centre**, not a moving
  average under each sample. It reduces variance, which is the claim the test
  makes; it is not a convolution and will not iron out a ridge that crosses the
  brush at an angle.
- **A flatten made after an undo of an earlier stroke keeps the `h0` it took**,
  because the sample is in the stroke. Undo and redo of the flatten itself are
  exact; what is stale is a height captured against ground that has since been
  taken back.
- **The mouth of a hand cut cave has no mound.** A rolled cave gets six metres of
  `CAVE_MOUND` from its pad; a hand cut one gets the cut in front of it and
  whatever the person sculpted. A cave stroke on flat ground reads as a hole in
  a hollow rather than as a hole in a hillside.
