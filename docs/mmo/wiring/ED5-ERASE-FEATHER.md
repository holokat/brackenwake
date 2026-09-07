# ED5: the eraser, and the soft edge

Two requests, in the user's words:

> I need a way to erase all changes like a brush.

> when painting surface texture, i need a way to have nicer faded out radii of
> the brush so it looks more blended in, I guess it might be called Feathering
> in photoshop, would be great to be able to control that transparency of brush
> edges.

## What was missing

**There was no way to say "not here".** `drain` (ED4) takes water away and
nothing else. `reset` takes the whole world away and nothing less. Between the
two there was nothing that could take one hillside back, and nothing at all that
could take back the trees, rocks and buildings standing on it: those live in
spaces (`src/mmo/spaces/`) and the terrain brushes have never touched them.

**Every brush had one edge, and it was the edge of a disc.** Paint was one word
per point and the last stroke over a point won, so a painted patch met the
country at a line one sample wide. There is nothing you can do with a hard line
to make it read as a blend, because half a metre of snow over grass is neither
snow nor grass, and one word cannot say that.

## The rules now

### Erase

A twenty first stroke kind, `erase`, in `STROKE_KINDS` beside the other twenty.
It is a stroke like any other: it goes in the list, in the file, in the index,
and comes off the stack with one undo.

- **It masks everything laid before it, inside its own radius.** The height
  those strokes moved is multiplied by `1 - mask`, the paint they left is
  multiplied by the same, and the water they placed is gone where the mask
  passes a half.
- **Strokes laid after it apply normally.** Order is the picture, exactly as it
  is for a drain: an erase over a raise is flat, and a raise over that erase is
  a hill again.
- **It has no profile of its own.** `deltaOf` answers 0 for an erase, because
  what it does is a thing that happens *between* two strokes and cannot be seen
  by one stroke evaluated alone. The whole of it is one line in `stackDelta`:

  ```js
  if (s.kind === ERASE_KIND) {
    const m = eraseMaskOf(s, x, z);
    if (m > 0) cur = h + (cur - h) * (1 - m);
    continue;
  }
  ```

  `cur - h` is everything the strokes before it did and `h` is the world without
  them, so a full mask is the blank canvas back and a half mask is half way
  there. `stackDelta` is the **only** walk of a stroke list there is: the
  indexed answer and the test's slow answer are the same function, so nothing
  can read the height without reading the eraser.
- **It takes the water back to what the world said, not to nothing.** An erase
  over a lake somebody dug leaves dry ground; an erase over a drain that was cut
  into the generator's own ocean leaves the ocean, because there the ocean is
  the blank canvas. Water is a yes or a no and cannot be half removed, so it
  goes where the mask passes a half (`eraseHalfR`), and `waterBodies` cuts a
  hole of exactly that radius out of the surface the renderer draws, so the
  water you can see and the water you can swim in end in the same place.
- **It takes a cave mouth with the hillside.** `caves()` drops a mouth a later
  erase went over. Left in, `field.js` would stand a cave site up in flat ground
  with no hollow behind it and E would open it.
- **It takes everything standing on the ground too**, which is the editor's half
  and is below.
- **With nothing under it, it moves nothing**, and says so.

### Feathering

Two knobs on every brush that is not a body of water. They come off
`HARD_KINDS`, which is `STROKE_KINDS` minus `WATER_KINDS`, so a kind added
tomorrow that is not water has a soft edge and a slider for it with nothing to
keep up to date, and `auditFeather()` throws at import if a knob is ever offered
that nothing reads, or read with no knob offered.

| knob | what it means | default |
| --- | --- | --- |
| `hardness` | where the full effect ends, as a share of the radius. From there out to `r` it is let go on a smoothstep | paint 0.35, erase 0.5, everything else 0 |
| `opacity` | how much of the effect ONE stroke lays down | paint 0.7, erase 1 |

Only `ground` and `erase` carry `opacity`. A sculpt brush's opacity is the
`amount` it already had, and a second knob for the same thing would be a knob
that lies.

The two halves read `hardness` differently, and the difference is the ground:

- **Paint** takes the weight `opacity * (1 - smoothstep(hardness, 1, t))`. At
  hardness 1 that is exactly the hard disc paint has always been.
- **Anything that moves height** has its `t` REMAPPED, `(t - core) / (1 - core)`,
  and its own profile evaluated at that, so the whole shape is squeezed into the
  band outside the core. At hardness 0 the remap is the identity and a raise is
  the dome it always was; at 1 it is a flat topped mound. `core` is capped at
  `1 - SOFT_RIM / r` (SOFT_RIM is 2 m), so a height brush always keeps two
  metres of rim.

**Why the rim is capped for height and not for paint.** The ground is meshed at
three resolutions and the coarsest puts a vertex every 2 m; a profile that fell
from its full height to nothing in less than one cell would be sampled on one
side of the step and not the other, and two chunks sharing that vertex would
disagree about it, which shows as a crack of sky. Every profile in this file has
zero slope at its own rim for the same reason. A colour cannot crack a chunk, so
paint keeps its hard edge available, and that is also what lets a file written
before ED5 load unchanged.

`maxGrade` scales by `1 / (1 - core)`, because a profile squeezed into a
narrower band is exactly that much steeper. At hardness 0 the factor is 1 and
every number it reports is the number it always reported.

### Paint is a MIX

A point carries a weight per word, composited the way a brush composites
anywhere: everything already there is multiplied by `1 - w`, and the new word
takes `w`.

```js
mixIn(mix, word, w)   // for each k: mix[k] *= (1 - w); mix[word] += w
```

Measured, not asserted:

| what was painted | the mix at the centre |
| --- | --- |
| grass at 1.0, then snow at 0.3 | `{ grass: 0.7, snow: 0.3 }` |
| snow at 0.3, three passes | 0.3, then 0.51, then 0.657 |
| ten words, forty passes at 0.7 | totals 1.0 and never more |

Two answers come off one walk of the list:

- `sample.ground` is the DOMINANT word, or null where nothing painted stands
  over half (`MIX_DOMINANT`). That is what `sample.ground` has always meant to
  `grass.js` and `dressing.js` ("is this patch somebody's yard") and it goes on
  meaning exactly that. A light wash does not kill the grass; a heavy one does.
- `sample.groundMix` is the weights, and `terrain_material.layerWeights` blends
  its layers by them. One word at full weight reduces to the single word line it
  replaced, bit for bit, so nothing already saved draws differently.

`PAINT_BIOME` is asked about the dominant word only. A 30% wash of snow over a
meadow must not turn the meadow into a snowfield, kill its grass and change its
trees, which is what taking the biome at any weight at all would do.

## What absence means

A stroke with no `hardness` and no `opacity` in it reads as:

| kind | hardness | opacity |
| --- | --- | --- |
| `ground` | 1 (the hard disc, which is what "the last stroke wins" meant) | 1 |
| `erase` | 0.5 (its own slider default; there are no old erasers) | 1 |
| everything else | 0 (the dome, the pit, the mesa) | n/a |

`makeStroke` DROPS a knob a kind does not take rather than defaulting it into
the stroke: a `hardness` sitting on a saved lake is a number a reader might one
day believe, and absence is what a file written before ED5 looks like.

**The proof that nothing already saved moved.** Two measurements:

1. The old module and the new one, side by side in one node process, loading the
   same file and asked for the height and the ground word at 5,000 points.
   `public/terrain/greenwold.json` (the user's own sculpt, read only, never
   written): 0 strokes today, 0 differences. A file built with three strokes of
   every kind and not one ED5 knob in it, 60 strokes: 2,765 of the 5,000 points
   stand on ground the strokes moved and 745 are painted, and there are **zero
   differences** in height and zero in ground word.
2. A committed guard, in `terrain_edits.test.mjs`, that does not need the old
   module: for every kind, a stroke with no ED5 knob and a stroke with the knob
   set to what absence means lay identical ground over 1,681 points each. If a
   default is ever changed under it, that fails.

## The editor

A tenth mode down the rail, **Erase**, last, so the nine before it keep the keys
1 to 9 and it takes 0.

The tray is filled the way every tray is: `modes.brushModeOf` asks the brush's
own row, and the row says `erases: true`. It is a flag and not a name because an
eraser's knobs are a radius and a falloff, which is exactly what a sculpt
brush's are: nothing else about the row could tell them apart. No brush is named
in `editor.js` and none is named for this either.

### The other half of the press

`editor.wipeAt(x, z, r)` takes every entry of every list (pieces, trees, rocks,
spawns, people, markers) out of every space whose point falls inside the ring.
Before it walks, `holdSpacesNear` adopts the tile spaces the ring covers and
every named space it reaches, off the module the game itself builds from: a
space this session never opened would otherwise leave its trees standing in the
middle of erased ground with nothing to show why.

### One press, one undo

The two halves are held together by the terrain group carrying the space half:

```js
strokeGroups.push({ kind, n, places: [{ id, n }] });   // one per drag
// terrainUndo: undo the contract n times, then undoPlaces(g.places, -1)
```

Two stacks would mean two presses of ctrl Z to take one press of the brush back,
and the second half would look like a bug. A drag gathers its wipe per space as
it goes, so a swept erase across a tile edge is one group, one undo and one
redo. Driven in `editor.test.mjs`: three things across two spaces, gone in one
press, back in one undo, gone again in one redo; and a three stroke drag over six
rocks straddling a tile edge, all six back on one ctrl Z.

### The ring

`brushRing(r, colour, core)` draws TWO circles when there is a core to draw: the
radius, and where the full strength ends, the inner one fainter so the brush's
own edge is still the line the eye takes for its size. A feathered brush does
most of nothing at its rim, and a person shown one circle aims the whole effect
at the rim and wonders why so little happened. A hard brush, or one with a core
under a quarter of a metre, wears the one ring it always did.

The editor reads the core off the row's own `hardness` knob (`hardness * r`), so
a terrain half with no such knob answers 0 and nothing changes. It is exact for
paint and within the two metre rim for a height brush.

## The words

Every brush that has a falloff now says so, and it is said once for all of them
rather than on the two it was first written for.

```
painted snow over 20 m at 749, 1579, full to 7.0 m and feathered over the last 13.0,
  70% of it in one pass, 4 chunks of ground rebuilt

painted snow over 20 m at 749, 1579, 4 chunks of ground rebuilt          (a stroke
  with no falloff to report says nothing about one, which is what every stroke
  before ED5 does)

raised 10.0 m over 40 m at 0, 0, full to 38.0 m and feathered over the last 2.0,
  2 chunks of ground rebuilt

erased 24 m of ground back to the flat at 749, 1579, full to 12.0 m and feathered
  over the last 12.0, the ground under it back 14.4 m, 3 strokes masked,
  6 chunks of ground rebuilt          (the terrain half's own sentence)

... 3 things removed (1 tree, 1 rock, 1 marker)                (what the editor
  appends to it, off the lists it emptied. The line above is `strokeWords` with
  `eraseWords(20.4, 6.0, 3)`; the line here is the editor test's real output)

erased 24 m of ground back to the flat at 0, 0, full to 12.0 m and feathered over
  the last 12.0, and the ground under it did not move, with no stroke of yours
  under it, 1 chunk of ground rebuilt, and nothing was standing on it
```

Every number in those is measured at the moment it is said and by the thing that
owns it:

- the metres are `field.heightAt` at the point before the stroke against
  `field.heightAt` after it, which is the ground a player's feet would find;
- the strokes masked are `edits.maskedBefore(s)`, a walk of the strokes laid
  before it using each one's REAL shape (`overlapsDisc`: a disc for a disc, the
  distance to a segment for a ridge or a river, the cut's own centre for a cave
  mouth) and not its bounding radius;
- the things removed are counted off the lists the editor emptied, per list;
- and what did NOT happen is said too, which is why the second line exists.

## Where every piece lives

```
src/world/terrain_edits.js     ERASE_KIND, HARD_KINDS, OPACITY_KINDS, SOFT_RIM
                               hardnessOf/opacityOf/coreFrac/coreRadius/hardT
                               edgeFall, eraseMaskOf, eraseHalfR, paintWeightOf
                               mixIn, dominantOf, stackDelta, stackGround
                               overlapsDisc, auditFeather, api.groundAt,
                               api.groundMixAt, api.maskedBefore
src/world/field.js             sampleAt: one groundAt walk, sample.ground and
                               sample.groundMix; PAINT_BIOME on the dominant word
src/world/terrain_material.js  layerWeights blends by s.groundMix, falls back to
                               s.ground; PAINT_ROW, the scratch it sums into
src/game/editor/modes.js       the Erase mode and tray, off row.erases
src/game/editor/icons.js       the erase mark
src/game/editor/palette.js     brushRow carries `erases` through
src/game/editor/ghost.js       brushRing's second circle, ringRadii, CORE_MIN
src/game/editor/editor.js      wipeAt, holdSpacesNear, brushCore, undoPlaces,
                               the `places` a stroke group carries
src/game/editor/panel.js       the tenth rail cell and its key, the core on the
                               ring, the falloff and the count in the strip
src/game/app/systems/world.js  featherWords, eraseWords, the before sample
```

## What is measured, and what is not

Measured, in node, in the committed suites:

- `terrain_edits.test.mjs` (215 checks): the erase on height, paint, water,
  water bodies and cave mouths, inside the ring and outside it, before it and
  after it; hardness at 0 and at 1 on the profile and on `maxGrade`; the opacity
  numbers above; the absence guard over every kind.
- `field.test.mjs` (156): the mix on the sample, the dominant word, the biome,
  the erase through the field, and both pinned digests unchanged.
- `terrain_material.test.mjs` (97): a 0.3 wash blends, monotonically, sums to
  one, and one word at full weight is bit for bit the line it replaced.
- `grass.test.mjs` (94): a 0.3 wash of snow still grows the blades it grew with
  no paint at all (12 against 12), a 0.8 wash grows none.
- `editor.test.mjs` (327): the tray, the tenth key, the two rings, the wipe
  across two spaces, one undo for both halves, the drag.
- `wiring.test.mjs` (182): the two seams, by name.

Cost, measured old against new over 20,000 samples:

- `sampleAt` on ground painted by 400 strokes (1.38 over an average point):
  1.871 us before, 2.089 us after. The mix allocates one small object per
  painted sample, and that is where it goes.
- `sampleAt` on a world with strokes but no paint: 2.201 us before, 2.128 us
  after, which is to say no cost at all.
- `groundAt` alone: 0.102 us before, 0.281 us after on painted ground, 0.072 us
  on ground nobody has painted.

NOT measured, and stated as such: nothing here has been looked at in a browser.
The ring's second circle, the erased ground and the blended rim are drawn by
code this session did not run. The reviewer has the dev server.
