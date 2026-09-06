# ED3: sculpt mode, and the tools to build a country with

Written 2026-09-07. The request, in the user's words: "the server should be
cleared of other zones, clear all the rocks and just reset all the terrain, i
will sculpt it all myself, i need all the tools to sculpt the landscape,
including mountains, snow ground etc."

So there are two halves to this. A world with the generator put away, and a
brush set big enough to put a country back in it by hand.

Files written: `public/terrain/greenwold.json` (new: the blank world the server
comes up on), this note. Files changed: `src/world/terrain_edits.js`,
`src/world/field.js`, `src/world/roads.js`, `src/world/dressing.js`,
`src/world/flora.js`, `src/world/terrain_material.js`,
`src/game/world_runtime.js`, `src/game/app/systems/world.js`, and the three test
files `terrain_edits.test.mjs`, `field.test.mjs`, `world_runtime.test.mjs`.
Nothing in `src/game/editor/` was touched: that is the placement half's, and
what it calls is the contract at the bottom of this note.

## The header

A terrain file is now `{ v, mode, base, strokes }`.

```json
{
  "v": 1,
  "mode": "sculpt",
  "base": { "height": 6, "ground": "grass", "snowLine": 180, "beachLine": 1 },
  "strokes": []
}
```

`mode: "generate"`, or no header at all, is the world every file before ED3 was,
bit for bit. The heart digest in `field.test.mjs` did not move, and all 123
suites are green (`node run-tests.mjs`, exit 0).

The join is the one there has always been. `terrain_edits.js` carries the header
alongside the strokes, `field.setTerrainEdits(edits)` reads it off the list, and
that call is also where the field drops its site cache and throws away
`roads.js`'s cached polylines, because a mode change is a different answer for
every cell the field has already rolled and every road it has already laid.

## What a sculpt world is

Inside the continent mask the ground is `base.height`, EXACTLY. Measured over
39,507 points where the mask has fully closed: worst deviation 0 m.

What survives, and it is a short list on purpose:

| kept | why |
|---|---|
| the continent mask | there has to be a shape to the land and an edge to walk to, and it is the same warped fbm, so the coast is where it always was |
| the ocean floor | land at `base.height` and sea bed at -14 m, the same pair the generator lerps between, so a shore is a shore and the water sheet fills it |
| the Caldera Sea, the rim ocean | water exists at the edges without anybody digging for it |
| every authored place | Hearthhome, the Standing Hedge, the plans and the spaces all still stand, at `base.height`, because a person sculpting the ground is sculpting the ground and not deleting the sheet |

What goes: the hills, the mountain mask and its ridges, the rivers, the relief
(every table, terrace, plateau and crater rim the five relief realms carry), the
island field, the Thousand Isles, the reefs, the karst stacks, the farm disc at
the origin, every site the seed rolls for itself, every pad and every dish, every
road, every scattered prop, every tree and every boulder. And every zone's
climate bias and biome override, which is the "cleared of other zones" half of
the request: a realm's own frost or ash is the generator saying what the country
is, and that is the one thing this mode takes away. `zone`, `realm` and `danger`
still come out on the sample, because those are identity and the monster layer
reads them.

Measured over 15,376 samples of a 12 km square:

| | sculpt | the same square, generating |
|---|---|---|
| samples on a river | 0 | 1,094 |
| samples on a road | 0 | many |
| samples naming a rolled site | 0 | 8,595 |
| samples naming an authored site | 1,560 | 1,560 |
| samples off the base height, inland | 0 | most |
| biomes | meadow, ocean, beach | all eight |

36 chunks of dressing and flora: 0 records and 0 trees or boulders, against 96
and 111 in the same 36 chunks of the generated world.

`roadsForCell`, `linksForCell` and `roadDistanceAt` all come back empty, and they
are refused where a road is BUILT and not only where `field.sampleAt` grades one,
so flora's avenues, dressing's carts and signposts and wayside's lamps and
bridges all see no road either.

### The one thing that is kept above the flora gate

The ore rocks that ring a cave mouth and stud a mine's yard. Those are not
scatter: they belong to a PLACE, and in a sculpt world the only caves are the
ones a person cut with a `cave` stroke, so their ore ring is part of what that
stroke placed. With no cave strokes cut there are none, which the boot test
measures.

## Biome from height, in two lines a person can move

Sculpt mode has its own biome chain and it is four rules:

1. under the water line (`SEA_LEVEL - 0.05`, which is -0.85 m) it is `ocean`
2. at or above `base.snowLine` (default 180 m) it is `snow`
3. under `base.beachLine` (default 1 m) it is `beach`
4. otherwise it is the biome of `base.ground`

and then paint wins over all four.

So a mountain somebody raises wears a snow cap without anybody painting one:
measured, a 400 m brush at 260 m comes out at 242.8 m and reads `snow`, its flank
at 46.9 m reads `meadow`, and moving the header line to 40 m turns that same
flank white. A lake dug below sea level fills and gets a sand ring where its bank
crosses the beach line.

The snow line has to reach `terrain_material.js` as well as the biome, or the
TEXTURE would start going white at 64 m in a world whose header says 180.
`SNOW_START` and `SNOW_FULL` are `let` now and `setSnowBand(line)` moves them;
`world_runtime.applyTerrainHeader` is the only caller, and it puts them back to
64 and 84 for a generated world.

`base.ground` is restricted to `grass`, `sand`, `rock`, `snow`
(`terrain_edits.BASE_GROUNDS`), and the refusal names them. A base word is not
paint: it says what the whole world is made of, and the only way it can say so
without a second path is by carrying a biome, because the vertex colour, the
texture row, the turf table and the tree species all read the biome already.
`field.PAINT_BIOME` gained `snow` for exactly this. The other six words paint
over a disc perfectly well, and that is what a brush is for.

## The sixteen kinds

Eight were there. Eight are new. Every profile is still a smooth function of a
DISTANCE with zero slope at its own rim, so two chunks that share a vertex agree
about it at any resolution and no seam can crack.

| kind | what it does | params | measured, in `terrain_edits.test.mjs` |
|---|---|---|---|
| raise | a dome, `amount` at the centre, 0 at r | r, amount | 2.000000 m at the centre, 4.8e-30 at r, exactly 0 past it |
| lower | the same, down | r, amount | -3.0000 m at the centre |
| flatten | pulls to the height the centre had | r | worst point inside r/2 is 0.000 cm off |
| smooth | pulls toward a ring average taken once | r, amount | variance 7.661 to 2.171 m^2 |
| pit | a flat floor `amount` down, a wall, a lip | r, amount | floor 3.0000 m down, wall 1.67 m per metre |
| cliff | a step of `amount` across the yaw's line | r, amount, yaw | high side 4.0000 m, low side exactly 0 |
| cave | a cut in front of a mouth, and a place | r, amount, yaw | the cut is 2.000 m deep, the mouth stands on its floor |
| ground | paints a word inside r, moves nothing | r, ten words | the word is on the sample, the last stroke wins |
| **mountain** | a raise with ridged noise over it, seeded off the stroke | r (0.5 to 600), amount (0 to 400), roughness (0 to 1) | summit 117.45 m of the 120 asked for, 18.54 m of spread round a ring 100 m out, roughness 0 is a raise bit for bit over 400 points |
| **ridge** | a raise along the line from the stroke to `length` metres on `yaw` | r, amount, length, yaw | 60.000000 m at the lowest of 151 points along its line, nothing 41 m past either cap |
| **valley** | the same line, down | r, amount, length, yaw | -20.0000 m along +x, 0 m along +z, on a yaw of pi/2 |
| **plateau** | the ground pulled to `height`, flat to 0.75 of r | r, height, skirt | whole top 0.000 cm off 20 m on ground that ran 0.00 to 6.34 m |
| **terrace** | the ground rounded onto steps `step` apart | r, step, sharp | worst of 512 points 1.500 m off the nearest 3 m tread, and 3.000 mm of step per mm of ground, so it is a stair and not a tear |
| **noise** | `amount` metres of fbm over the disc | r, amount, wave | -1.995 to 2.102 m of the 3 asked for, exactly 0 at the rim |
| **erode** | a smooth that may only take away | r, amount | took 1.740 m off, added 0 over 1,984 points, where a smooth on the same ground added 1.740 |
| **lake** | a pit whose floor is an ABSOLUTE height | r, floor | floor level to 0.00 cm across ground that ran 3.82 m up and down, where a pit on the same ground left a floor running 3.82 m |

### Water: what fills and what does not

Water is not touched and does not need to be. `src/world/water.js` draws one
sheet at sea level and `sample.water` is `h < SEA_LEVEL - 0.05`, worked out AFTER
the strokes are laid, so **anything a stroke leaves below -0.85 m fills**. A
`pit`, a `valley`, a `lower` or a `flatten` will all do it if they go deep
enough.

`lake` exists because a `pit` will not do it reliably. A pit takes a fixed number
of metres off whatever it finds, so a pit dug across a hillside has a floor that
slopes exactly as the hillside did and holds water at one end. `lake` pulls the
ground TO a height, default -3 m, so the floor is that height across the whole
flat of the profile however the ground ran before. One click, and there is water
in it.

### The mountain, in detail

`a * dome(t) * (1 - m + m * ridged(x/wave, z/wave, 2))` with
`m = roughness * MOUNTAIN_RIDGE` (0.45) and `wave = 0.4 * r`.

- **The noise is windowed by the same dome.** Not decoration: the noise has a
  gradient of its own and the rim has to be C1 with the world outside it. At
  t = 1 the dome is 0 and so is its derivative, so `d/dx (dome * N)` is 0 too.
  Laid on unwindowed, every mountain in the world would have a hairline crack
  round it at every chunk seam.
- **`1 - m + m * n` and not `1 + m * (2n - 1)`**, so the peak never exceeds
  `amount`. A mountain asked for at 400 m that came out at 512 would make a liar
  of the slider.
- **Two octaves and not three**, and it is a measured trade. On the 2,000 stroke
  world below, `field.sampleAt` cost 3.228 us with three octaves and 2.741 with
  two. The wavelength came down from 0.5 of the radius to 0.4 at the same time,
  so the finest ridge is finer than the three octave version had.
- **The seed is written into the stroke.** A seed derived at read time is a seed
  that can be derived differently by two readers. Measured: the same seed twice
  is the same mountain to 0 m over 200 points; a seed one apart is 25.0 m away.

`maxGrade` for a mountain is the dome's analytic gradient PLUS
`a * m * RIDGE_SLOPE / wave`, where `RIDGE_SLOPE` (15) is a measured ceiling on
the ridged noise's own gradient: over 400,000 samples of eight seeds the median
is 3.347 per unit, the 99th 9.550, the worst 14.627. It is a BOUND, so the test
drives it against the real profile and fails only if the claim is ever SHORT.
Measured on the default brush: the ground does 2.686 m per metre and the claim
is 5.832.

## A bug this found

`terrain_edits.js`'s spatial index keyed its cells with
`ix * 73856093 ^ iz * 19349663`, and the comment beside it argued a collision was
safe: two cells sharing one list only ever show a lookup MORE strokes than it
should, and every extra one answers 0 outside its own radius.

That is true of the LOOKUP. It is false of the INSERT. `put` walks every cell a
stroke covers and pushes the stroke into each, so if two of ONE STROKE'S OWN
cells land on the same key, the stroke goes into that list twice and is applied
twice: a raise raises double, a flatten pulls to a height it already reached.

A stroke covering four cells will never hit it. A 600 m mountain covers 1,444
cells of the 32 m grid and hits it at once: measured, 224 of its own 1,444 cells
collide with another of its own, and on a 2,000 stroke world a point at
-128, -112 came out **1,383.95 m** off what a walk of every stroke gives.

The key is now the pair packed into one double: each axis offset into
`[0, 2^26)` and multiplied out, which fits in 2^52, inside the 2^53 an integer
keeps exactly, and covers cells from -2^25 to 2^25. Collisions are impossible.
The indexed answer now matches a walk of all 350 strokes to 0 m over 1,200
points, mountains and all.

The old key would also have been wrong for any pre-ED3 stroke big enough, and the
editor's own radius slider went to 120 m.

### And an index tier that was tried and thrown away

The obvious next move is to put big strokes on a coarse grid of their own and
merge the two lists at every sample. It was built that way first and measured
against one index on the same 2,000 stroke world:

| | us a sample | ms to build the index |
|---|---|---|
| one index, everything on the 32 m grid | 1.504 | 3.56 |
| two, over 128 m on a 512 m grid | 1.806 | 0.91 |

The merge costs more than the shorter lists save, because the strokes that make a
list long are exactly the ones that cover the point and have to be evaluated
anyway. An index is built once per undo, load or reset and read once per vertex
of every chunk in the ring, so the per sample number is the one that decides. One
index, and the reasoning is in the file so it is not tried again.

## What it costs

**`heightDelta` with 2,000 strokes over a 2 km square, 50 of them 600 m mountains
at roughness 0.6, 10,000 samples, best of five rounds: 2.6 to 2.9 us a sample**
across runs, with the check pinned at under 3. An average point in that world
stands inside 12.6 strokes and 11.2 of those are mountains, so almost all of it
is ridged noise that has to be evaluated. The index of that world rebuilds in
4.5 ms.

For scale, on the same world: `field.sampleAt` in sculpt mode with NO strokes is
0.533 us, and with all 2,000 it is 2.279 us.

**`rebuildAround` for a 600 m mountain**, in node, no GPU, with the streaming ring
filled: **183 chunks of the 183 loaded, in 166 ms, which is 0.9 ms a chunk.** A
600 m brush covers the whole ring, so that is a rebuild of the entire visible
world; the 12 m brush ED2 measured touches one to four chunks. 166 ms is ten
frames and it will be felt as a hitch. It is synchronous on purpose (see ED2) and
it has not been measured in a browser with a GPU.

`setBase` rebuilds everything for the same reason: a base height is under every
chunk in the ring, not just the near ones.

## The contract the editor calls

`window.__bw.terrain`, from `src/game/app/systems/world.js`. Everything ED2 had,
unchanged, plus:

| call | what it does | what it returns |
|---|---|---|
| `kinds()` | every brush with its sliders | `[{ kind, label, params: [{ name, min, max, step, default }], words? }]` |
| `base()` | what the flat world is | `{ height, ground, snowLine, beachLine }` |
| `mode()` | which kind of world the field is handing back | `'sculpt'` or `'generate'` |
| `baseWords` | the words a whole world may be MADE of | `['grass','sand','rock','snow']` |
| `setBase(patch)` | says what the flat world is, rebuilds everything loaded | the words, including what changed and how many chunks |
| `reset()` | every stroke off the ground, as ONE undoable step | the words, or `false` when there was nothing |

`kinds()` is the important one. **The params table is the contract**, and it
lives in `terrain_edits.js` rather than in the editor because it is that file
that clamps, defaults and refuses. A slider built off a number the editor holds
its own copy of goes out of date the first time the module changes its mind; a
slider built off this goes with it. A mountain asked for at 4 km across comes
back at 600 m and the words say 600.

`terrain_edits.test.mjs` drives every one of the 40 sliders across 16 brushes:
each has a min, a max, a step and a default, every default is inside its own
range, and **moving any one of them moves the ground**, so no slider on the
palette is decoration. Two are judged differently and both are named in the test
rather than skipped quietly: `ground` moves no height at all and is judged on the
word it leaves, and `cave.amount` is the size of the cavern under the mouth
rather than the shape of the mouth, which `world_runtime.test.mjs` measures at 1,
2 and 3 levels for small, medium and large.

`undo` and `redo` handle a reset as one step and rebuild everything rather than a
circle round a point that a thousand strokes were never inside. Every stroke, and
every one of the new calls, still says what it did in the HUD log with counted
numbers:

```
  raised a mountain 300.0 m tall and 1200 m across at 0, 0, roughness 0.6,
    183 chunks of ground rebuilt
  drew a ridge 60.0 m high and 300 m long from 0, 0, bearing 0 degrees
  sank a lake 80 m across at 1500, 0, its floor at -3.0 m, which is under the
    water line, so it fills
  stepped 30 m of ground into 4.0 m terraces at 0, 0
  height 6 to 22 m, 183 chunks of ground rebuilt
  dropped all 12 strokes, 183 chunks of ground rebuilt. One undo puts them all back
```

## The file the server comes up on

`public/terrain/greenwold.json` now holds the sculpt header and an empty stroke
list, so the server comes up blank.

**A file with no strokes in it is not nothing any more**, and that needed a fix.
`loadTerrainFile` had `if (!n) return null`, which walked away from an empty
list; that was right while a file was only a list, and wrong the moment a file
carried a header. `{ "mode": "sculpt", "strokes": [] }` is the whole request
"give me a blank world to build in". The header is applied first now and the
early return only happens when neither the header nor the list said anything.

Measured at boot: a runtime handed that file applies it, rebuilds every chunk
already built, and every ground vertex of every one of them carries the sculpt
world; flora holds 0 records, dressing holds 0 records, and of the 10 places
within 3 km of the spawn, 0 are rolled.

## What is not verified

- **Nothing was driven in a browser.** Every number above is measured in node,
  against the real modules, through the real surfaces. The reviewer drives the
  dev server.
- **The 166 ms rebuild is a node number with no GPU.** In the browser the mesh
  upload is on top of it. A 600 m brush rebuilding the entire visible ring will
  be a visible hitch and there is no progressive path for it.
- **Nothing was measured through the placement half.** `src/game/editor/*` was
  being edited by another agent while this was written and the two halves have
  not been run together. `kinds()` is offered for its palette; whether it uses it
  is not known here.
- **`cobble` and `path` get no texture of their own.** There is no road LAYER in
  `terrain_material.js`: the six layers are grass, dry grass, dirt, rock, sand
  and snow, and what makes a road look like a road is `ROAD_MIX`, a blend of
  them. `path` is `ROAD_MIX` exactly, by reference, and `cobble` is that with the
  dirt traded for stone. Both keep the grass and the dressing off by the word
  alone. They will read as a trodden dirt strip and a stony one, not as
  cobblestones.
- **`gravel` and `ash` are blends of the same six layers** and have the same
  limit.
- **A mountain's summit is at or under `amount`, not at it.** The ridges cut down
  from the ceiling: measured, 117.45 m of a 120 m brush. That is deliberate (the
  slider is a promise the ground cannot exceed) but it means a person wanting
  exactly 200 m of mountain should ask for a little more.
- **`maxGrade` for a mountain and for a `noise` stroke is a bound and not a
  measurement**, and it is a loose one: 5.832 claimed against 2.686 measured on
  the default brush. A big rough mountain will warn that it is steeper than the
  ground can be drawn before it actually is.
- **`plateau`, `terrace` and `erode` return `null` from `maxGrade`**, like
  `flatten` and `smooth`, because how steep they are depends on ground that
  function is not given. A terrace with a very small `sharp` can cut a riser
  steeper than the mesher can show and nothing will say so.
- **The world boots generating and then becomes a sculpt world.**
  `createWorldRuntime` is synchronous and `fetch` is not, so the first few chunks
  are meshed from the generator and rebuilt when the file lands. Measured: 3
  chunks in the test's harness, 18 in ED2's. In the browser the first frame may
  briefly show generated ground.
- **A sculpt world's authored sites stand on flat ground with no pad.** That is
  the intent, but nothing checked whether every plan and space in the sheet looks
  right with no levelled ground under it. A town square that wants levelling can
  be levelled with a `flatten` and it stays levelled.
- **Monsters, fauna and foraging were not looked at.** They read the field and
  the site list and both still answer, but a blank world's spawn tables were not
  driven.
