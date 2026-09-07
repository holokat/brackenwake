# MAP3: the painted Greenwold, on the map

**Put the painting at `public/maps/greenwold.png`.** That is the whole of the
setup. Until it is there the map says so in its own footer, names that path,
and draws the guide over the terrain instead.

Written 2026-09-07, for: "can you adjust our in-game map to be this shape, and
also correctly label each zone, and put rough boundaries around each zone so I
can see where objects need to go for hand-painting the world."

## What this is, and what it is not

`src/mmo/greenwold_guide.js` is the hand painted map of the Greenwold turned
into world metres: twelve named spaces, a rough boundary for each, the sentence
that says what each is for, and the list of models that go in it.

**Nothing in the world is built from it.** No terrain is cut, no plan is placed,
no site is registered, no save is touched. It is drawn on the zone map and on
the minimap so you can see where to put things, and that is its only job.
`src/world/zones.js` `LAYOUT` is the OLD generated layout and is deliberately
untouched: the two disagree, on purpose, because the painting is the new truth
for the hand built realm and the generated world still has to load old saves
with the ground unmoved. `wiring.test.mjs` walks the whole of `src/` and fails
if anything outside the two maps and their tests ever imports the guide.

## The mapping

The sheet is 16:9, about 1676 by 942. Its green country fills the frame from
0.03 to 0.97 across and 0.04 to 0.96 down, and that rectangle is the realm:

| the sheet | the world |
| --- | --- |
| u 0.03 (left) | x -2200 |
| u 0.97 (right) | x 2200 |
| v 0.04 (top) | z -2200 |
| v 0.96 (bottom) | z 2200 |

`imageToWorld(u, v)` and `worldToImage(x, z)` are exact inverses, driven both
ways at the four corners of the sheet and at all twelve centres, and over a 17
by 17 grid of the realm: the worst error measured is 4.5e-13 m.

**North is minus z.** `src/game/compass.js` takes its bearings as
`atan2(dx, -dz)` and both maps draw +z DOWN the picture, so the top of the sheet
is z = -2200 and not +2200. Written the other way the mapping still round trips
perfectly and the whole thing is quietly wrong: the picture is drawn upside down
on a north up map, and the column beside it calls the Kingsroad camp south east
of the village when the painting plainly puts it north east. Six bearings out of
the doc are checked against `bearingOf` in `greenwold_guide.test.mjs`, and the
five with a north or a south in them are checked to reverse when the sheet is
flipped, so the sign has teeth.

**The mapping is not isotropic.** A square realm on a 16:9 sheet is 2.793 m to
the image pixel across and 5.077 m down, so the painting is drawn stretched to
1.82 times its own height. Measured, not guessed. Pace a distance off the sheet
with a ruler and you will be wrong by up to that factor; the world coordinates
below are right, and everything that draws the picture draws it through
`imageToWorld`, so the picture and the numbers cannot drift apart.

## The twelve spaces

World metres, east and south of the origin.

| space | x | z | boundary | models |
| --- | --- | --- | --- | --- |
| Hearthhome | 749 | -383 | 220 m | 24 |
| The Standing Hedge | 515 | -143 | a ring at 1000 m, band 140 m | 4 |
| The Old Cellars | 94 | -191 | 140 m | 4 |
| The Chalk Pits | -983 | -1578 | 260 m | 9 |
| The Sunken Chapel | -94 | -1626 | 240 m | 9 |
| Highwayman's Hollow | 843 | -1722 | 200 m | 9 |
| The Kingsroad | 1638 | -1817 | 220 m | 12 |
| The Mill Run | -1732 | -574 | 260 m | 11 |
| The Beech Hangar | -1732 | 574 | 420 m | 6 |
| The Long Meadow | -655 | -765 | 360 m | 4 |
| The Water Meadows | -936 | 48 | 320 m | 2 |
| Coldwake | -796 | 1291 | 220 m | 8 |

The Standing Hedge is an **annulus** and is drawn as two circles. The ring
itself is its boundary: the nine stones stand on the circle, and Hearthhome
(335 m from its middle) and the Old Cellars (424 m) stand INSIDE it, which is
what the place's own line has always said. Drawn as a disc it would claim the
whole middle of the realm as one space.

The Kingsroad camp stands 2447 m from the origin, which is outside the realm
circle of 2200 m and inside the release gate's own line at 2500 m. That is
deliberate: it is the camp at the milestone **where the road enters the realm**.
`auditGuide` measures every space against `release.openAt` rather than a typed
number, and names any that stand beyond the core radius rather than hiding them.

The lines, the landmarks and the model lists come from
`docs/mmo/22-GREENWOLD-SPACES.md`. Every one of the 102 model ids is a real
`FOOTPRINT` key, checked at import. What that doc names and nobody has modelled
yet is kept in a separate `wanted` list rather than dropped, so a hover can say
"and these do not exist": a scarecrow that walks at night, reed beds, a heron.

Two roads and a river are traced on the sheet in image fractions and converted
the same way: the Kingsroad in from the north east corner past the Legion camp
to the village, the lane from the village south west through the ring and west
past the Long Meadow to the mill, and the river out of the chalk hills in the
north west, past the mill, the water meadows and the cellars, under the village
bridge and out east.

## What the maps do with it

### The zone map, `src/game/win_map.js`

1. an opaque backdrop, then **the painting**, laid through the frame mapping so
   the player arrow stands ON the painted village when the player is in the
   village. Measured: the pixel the arrow lands at and the pixel the painted
   place lands at agree to within 1e-9 px at all twelve spaces.
2. the live terrain over it at 35 percent, so a mountain raised with the brush
   shows through onto the painting
3. the traced river and roads, faint
4. the twelve boundaries, dashed, in the map's gold, with their names in small
   capitals at their middles

The **ground** button cycles painting / both / terrain, says which of the three
it is on, and says on hover what that layer is and what pressing it will do.
With no painting all three come to the terrain and the button says where the
file goes rather than changing nothing in silence.

**Resting on a space** puts its line, its landmark and its whole model list in
the column on the right. That is the answer to "what do I put here". Resting on
a row of the list does the same, for a space that is off the picture. The map is
repainted only when the space under the cursor CHANGES: measured at twenty
pointer moves inside one space for nought repaints, and one repaint on leaving
it.

An outline is dropped below 3 px of radius and loses its name below 9, so the
whole world at 16 km is a few large rings and not a wall of ink.

### The minimap, `src/game/minimap.js`

The same twelve boundaries and the same twelve names, out of the same function,
with the painting under the ground at 50 percent. Its own two rules: a space
whose middle is off the square is not drawn at all (a name pinned to the rim is
a lie about where the place is), and no letter of a name may leave the square.
The traced roads and the river are not drawn on it: 220 px has room for the
boundaries or for the lines, and the boundaries are what it is for.

### The editor

Untouched. It draws its own spaces, and it still does.

## What it costs

Measured on this machine, median of nine cached repaints of the zone map at
5 km across: 9.15 ms with the guide off, 8.71 ms with it on, so the twelve
outlines, the twelve names and the three traced lines cost nothing measurable.
The painting layer alone is 0.12 ms, because it does not read the field at all,
and `drawMap` reports `samples: 0` for it rather than the count it would have
taken.

## The files

- `src/mmo/greenwold_guide.js` and `src/mmo/greenwold_guide.test.mjs`
- `src/game/map_paint.js`: `paintGuideArt`, `paintGuideWays`, `paintGuideZones`,
  the one place that decides what a guide boundary looks like. Both maps hand it
  an `at(x, z)` and get the same outline.
- `src/game/win_map.js`, `src/game/minimap.js`, and their tests
- `src/game/wiring.test.mjs`: the guard that keeps the guide a guide
