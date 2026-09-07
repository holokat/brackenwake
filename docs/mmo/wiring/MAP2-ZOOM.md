# MAP2: the map zooms, the ground is the ground you cut, and the rest is faded

Written 2026-09-07. The request, in the user's words: "I need to be able to zoom
in on our starter map to see exactly where we are, and have the terrain
reflected in the zone map. hide all other zones for now or just make them super
low opacity".

Files changed: `src/game/win_map.js`, `src/game/map_paint.js`,
`src/game/win_map.test.mjs`, `src/game/map_paint.test.mjs`, and this note.
Nothing else was touched. `src/game/minimap.js` and `src/world/water.js` belong
to other hands; the minimap takes five constants and `blur` from map_paint and
none of the five moved, and the map reads the field, so the water follows on its
own.

## Why the old map could not answer the question

The M window drew one fixed picture of the whole 16 km world at 125 m to the
sample. Two things followed from that, and both of them are the request:

* the Greenwold, which is 5 km across and the only realm a player may stand in,
  was a coin at the middle of it, 200 px wide, and "exactly where we are" was
  four pixels of that coin
* the user is sculpting that realm by hand on a blank world
  (`ED3-SCULPT.md`), and a sculpted world is one biome, one climate and one flat
  sheet. Everything the user has made in it is HEIGHT, and the map read height
  only as a hachure on a steep slope. A raised hill and the flat beside it were
  the same colour of paper

And the ground was cached on a key made of the view, which does not move when a
hill does, so a map painted once at boot was the map for the rest of the
session, whatever was drawn on the world underneath it.

## The view

The map is a view now, `{ cx, cz, span }`, and it opens at `HOME_SPAN` 5 km
across over WHERE THE PLAYER IS STANDING, which at that span is the Greenwold
and the country round it. The brief said "centred on the realm", and the realm's
own centre is one button and one key away (`the Greenwold`, and 0), but the
user's own words were "see exactly where we are". A character is born at
Hearthhome, 749 m east and 1,579 m south of the realm's centre, 1,748 m off it:
on a map centred on the realm they are two thirds of the way to the bottom edge,
and on a map centred on themselves they are in the middle of it, with the whole
open realm still on the page because 5 km is exactly the width of the open
ground. Opening a window on a person and giving them a button for the country is
the way round that serves both readings.

Every one of these is a pure function in `win_map.js` and every one of them is
driven both ways in `win_map.test.mjs`:

| call | what it is |
|---|---|
| `homeView()` | the Greenwold's own centre at `HOME_SPAN`, which the button and 0 go to |
| `clampSpan(s)` | held between `MAP_MIN_SPAN` 1000 m and the whole world 16000 m |
| `clampView(v)` | that, plus a centre that cannot leave the world |
| `zoomView(v, f, px, py, size)` | zoom by `f`, holding the world point under the pixel |
| `zoomCentre(v, f, size)` | the same about the middle, which is what the keys do |
| `panView(v, dpx, dpy, size)` | the ground follows the pointer |
| `samplesFor(span)` | how finely to read the field at this span |
| `spanText(span)` | "5.0 km across", the words the footer and the label use |
| `scaleBarFor(span, size)` | the round distance the bar in the corner draws |

### The controls

| control | what it does | says on hover |
|---|---|---|
| the wheel over the map | one notch of `ZOOM_RATE` 1.25, about the cursor | yes, on the canvas |
| a drag | pans; a press that moves under `DRAG_PX` 4 is still a click | yes |
| `you` | the map back over the player, the zoom untouched | yes |
| `-` and `+` | one notch about the middle | yes |
| `the Greenwold` | back to `homeView()` | yes |
| `the whole world` | 16 km, ocean and all | yes |
| `+` `=` `-` `_` `0` on the keyboard | the same four, off `ctx.input` | the hint under the header |

The keys are declared as `panel.keys`, so `windows.js` `consumes()` stops the
world acting on a press the map has already answered, and each press is taken
back out of the frame with `input.swallow`.

Thirteen notches of the wheel take the map from the whole world to a kilometre
across and thirteen take it back, measured rather than counted by hand.

The pixel to world arithmetic was already span aware (`toPixel` and `toWorld`
have taken a span since M1); what changed is that the panel now hands them the
VIEW's centre and span instead of the player's position and the world's width,
in the draw, in the click and in the column alike. The round trip is exact to
1.3e-12 m at 1 km, 5 km and 16 km, both ways.

The player arrow is drawn at the player's own world point, not at the middle of
the picture, so dragging the map 128 px right moves the arrow 128 px right and
off the edge if you keep going. The `you` button is how it comes back.

The scale bar in the bottom left corner and the footer both come out of
`scaleBarFor` and `spanText`, so they cannot disagree about how wide a kilometre
is.

## The terrain reflected

Three changes, all in `map_paint.js`, and all of them under the same
`field.sampleAt` the game walks on.

**The relief.** `composeGround` reads the blurred heights and lightens the land
toward `SUN_INK` by `RELIEF_LIGHT` 0.30 of `clamp01(h / RELIEF_REF)`, so ground
that has been raised is lighter than ground that has not.

**The hillshade.** `sampleGround` now carries a `shade` grid beside `slope`,
built from the same two gradients: the dot of the uphill gradient with the sun,
which stands north west (`SUN_DIR`), normalised by `SHADE_SLOPE` 0.35 m of fall
per metre of run. `composeGround` lightens a lit face and darkens a shaded one
by `HILLSHADE` 0.34. Measured on a cone 200 m high with no noise in it at all:
the north west flank is painted rgb(198,189,144) and the south east flank, at
exactly the same height, rgb(135,126,81). On flat ground the two sides come out
byte for byte identical, which is the other direction.

**The cache key.** `terrainKey(field)` is `terrain_edits.version` and the sculpt
header, and `groundKey` carries it. It is read off the FIELD and not off the
options, so every caller of `paintGround` gets it and not only the one that
remembered to pass it. `terrain_edits.js` steps `version` on every stroke, undo,
redo, load and change of base.

Measured end to end on a sculpt world, through the real `drawMap`:

* a raise stroke 220 m across and 90 m high moves the ground from 6.0 m to
  96.0 m and moves the version from 1 to 2
* the paint before it is cached, the paint after it is not, and the paint after
  that is cached again
* the hill top is painted rgb(180,180,126) against rgb(162,180,108) for the flat
  300 m beside it, and the flat 300 m off is painted exactly as it was
* a `ground` paint stroke of snow comes out paler than the grass beside it

### What it costs

`samplesFor` interpolates in the log of the span, because the zoom is
multiplicative:

| span | samples a side | metres a sample | draw, warm |
|---|---|---|---|
| 1 km | 144 | 6.9 | 36 ms, median of nine |
| 2 km | 136 | 14.7 | |
| 5 km | 125 | 40 | |
| 16 km | 112 | 143 | 160 ms |

Both numbers are through a recording context in node on an M4, not a canvas.
The near end is measured on the sculpted Greenwold, which is what the user is
working in; the far end on the generated world, which is far dearer a sample
because every cell of it rolls a site. 144 at a kilometre was chosen against a
60 ms budget: 160 samples costs 58 ms and 176 costs 65. The far end came down
from 128 to 112 because 128 measured 177 ms against a 260 ms budget and 112
measures 160, and the whole world is the one place a coarser sample costs the
eye nothing.

While the user is sculpting, the panel repaints on two clocks. `REDRAW_S` 2 s is
the slow one that keeps the arrow and the marks honest. `REPAINT_S` 0.5 s is the
fast one and it only runs when the version has moved, so a stroke reaches the
map within half a second and a user doing nothing pays for two redraws a minute.
Two strokes inside one window cost one repaint, not two.

A drag repaints at most every `DRAG_PAINT_MS` 66 ms and always repaints once
more when the button comes up, so what is left on the screen is where the drag
ended and never one move short of it. Without that, a pointermove arrives far
oftener than a 36 ms map can be painted.

## The realms that are not open yet

`src/mmo/release.js` `OPEN_REALMS` is the one list, and the map reads it rather
than naming the Greenwold, so the day a second realm opens it comes back on this
map on its own, with its name, its places and its rows.

* the ground outside the open realms is veiled: ONE path, the whole canvas with
  one circle per open realm wound into it, filled `evenodd` in
  `rgba(224,212,184,0.85)`, so `FADE_ALPHA` 0.15 of what is under it survives. A
  fill rule and not a clip, because neither a node context nor an SVG writer can
  be relied on for a clip and this map is measured through a recorder
* the roads are drawn UNDER the veil, so a road running out into closed country
  fades away with the country
* a closed region is a rim at the same 15 percent and nothing else: no tint, no
  hatch, no name. 94 of the world's 104 regions, counted, not assumed
* no place outside the open ground is drawn, and no live event either. 65 of the
  75 authored places in the world are behind the gate
* the regions list has rows only for the open realms: 10, against the 104 it had
* a click on closed country picks nothing, at any zoom
* the open realm's own line is stroked in gold at exactly `zn.r + zn.edge / 2`,
  which is the reach `release.openAt` enforces. `auditOpenDiscs()` runs at import
  and measures that, on the ground, at 16 bearings per disc, in both directions:
  a metre inside every disc must be open and a metre outside it must not

`drawMap` takes `openOnly: false` and everything above comes back, which is how
each of those is driven the other way in the test.

## The spaces the editor has laid out

`map_paint.spacesIn(rect, spaces)` returns every space whose footprint touches a
rectangle of world, largest first so the smallest name lands on top.
`spaceShape` reads the space's own `at` and `radius`, never a constant, and
marks it a tile when its id is `tile_<tx>_<tz>`. A tile is drawn as the square
it is, because the next tile begins at its edge and a circle would say otherwise;
a named space is drawn as its own circle. Both dashed, in `SPACE_INK`, with the
name under them.

They are drawn and listed at `SPACE_SPAN` 2 km or closer, and at 8 km neither
the outline nor the name is there. The column beside the map lists exactly what
the picture outlined, out of the same call, so the two cannot disagree.

`auditSpaceTiles()` measures every tile on disk against `SPACE_TILE_M` 256, which
is `editor.js` TILE_M, and names the ones that disagree. It returns its findings
rather than throwing at import: a user mid stroke should not lose the game over
a space file that is one metre out, and the test fails the build on it instead.
Three tiles on disk, all of them clean.

## The key

Three rows were added, because three new things are drawn: the gold line the
gate keeps, the veil over the country behind it, and the dashed outline of a
space. `auditMapWords()` already refused to load a key row with no colour, so
none of them could have been added silently.

## Tests

`node src/game/win_map.test.mjs` 317 passed, exit 0.
`node src/game/map_paint.test.mjs` 58 ok, exit 0.
`node src/game/wiring.test.mjs` 174 passed, exit 0.
`npx vite build` exit 0.

## What is not done

* the map is still 640 px square. At a kilometre across that is 1.6 m to the
  pixel and the ground is read every 6.9 m, so the picture is four and a half
  pixels a sample: a sample PER PIXEL at that zoom would be 409,600 field
  samples and about a second and a half a repaint, which is not a map, it is a
  render. What the zoom buys is 143 m a sample down to 6.9, twenty times finer,
  and that is the honest claim
* the veil is drawn per repaint rather than cached with the ground. It is one
  path and one fill and did not show up in any measurement, but it is not free
* nothing here has been looked at in a browser. Every number in this note came
  out of node through a recording context, and the reviewer has the canvas
