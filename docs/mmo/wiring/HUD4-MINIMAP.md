# HUD4 wiring: the minimap

Files added: `src/game/minimap.js`, `src/game/minimap.test.mjs`, and this note.

Files changed: `src/game/hud.js` (the mount and the mode switch),
`src/game/app/systems/ui.js` (the mount's five hooks and the per frame tick),
`src/game/editor/panel.js` (the top dock's right margin).

Read and deliberately not edited: `src/game/map_paint.js`, `src/game/win_map.js`,
`src/game/compass.js`, `src/world/field.js`, `src/world/zones.js`,
`src/world/terrain_edits.js`, `src/mmo/spaces/index.js`, `src/game/win_dev.js`,
`src/game/editor/editor.js`, `src/game/hud.test.mjs`, `src/game/wiring.test.mjs`.

The request, in the user's own words: "add a minimap in top right to show me
which part of the starter zone i'm in".

Every count in this note is printed by `node src/game/minimap.test.mjs`
(163 checks) on world seed 20260904. Nothing here is quoted from reading the
code.

---

## Why it is not the map window

The Greenwold is being laid out by hand, space by space, on a flat sculpt world
(`docs/mmo/22-GREENWOLD-SPACES.md`, `ED1-EDITOR.md`, `ED3-SCULPT.md`). Two
things follow from that and both of them are why the map window is not the
answer:

* A flat world has no landmark to steer by. On the generated world you know
  where you are because there is a ridge over there and the sea behind you. On
  ground somebody is still sculpting there is nothing to know it by.
* The editor is a MODE. `hud.setMode('editor')` puts the whole gameplay HUD
  away, the place plate and the compass strip with it, and `M` opens a window
  over the instrument you are working in. So the question "which part of the
  zone is this" had no answer at all in the one place it is asked most.

So the minimap is on the screen rather than behind a key, and it is the one
gameplay widget `setMode` leaves standing, beside the dev badge.

---

## What is on it

A 220 px square in the top right, under the dev badge, showing 1000 m across,
centred on you, north up.

| mark | where it comes from | when |
| --- | --- | --- |
| the ground | `field.sampleAt` on a 27 by 27 lattice, composed the way `map_paint` composes a chart | always |
| painted ground | `sample.ground`, the editor's own brush words | always |
| open water | `sample.biome === 'ocean'`, shallow to deep by depth | always |
| relief | a hillshade off the sampled heights, light in the north west | always |
| the realm edge | `ZONE.greenwold`, a circle of 2200 m about the origin | only where the line really crosses the square |
| the 256 m lattice | `editor.js`'s `TILE_M` | editor mode only |
| spaces and tiles | `SPACES`, name in small caps, a dashed ring at its radius | always |
| named places | `runtime.sitesNear`, nearest first | always |
| you | a gold arrow at your own point, turned to the camera's yaw | every frame |
| your mark | `character.waypoint`, held at the rim when it is off the square | every frame |
| an N, a scale bar, a readout line | worked out from the span | always |

### The colours are the game's own

`BIOME_PAINT` and `REALM_PAINT` are imported from `map_paint.js`, so a biome
that changes colour on the chart changes colour here. The realm's tint is taken
at `REALM_TINT` (0.55) of the chart's, because a chart is a picture of a country
and this is a picture of the ground.

The ten ground brushes are split, and the split is the whole point:

* Four of them (`grass`, `sand`, `rock`, `snow`) carry a biome with them
  through `field.PAINT_BIOME`, so `BIOME_PAINT` already answers for them.
  Giving them a second colour would draw a seam where a grass brush was laid
  over meadow and nothing on the ground had changed.
* The other six (`dirt`, `mud`, `gravel`, `ash`, `cobble`, `path`) have no
  biome anywhere in the engine. A map that reads the biome alone shows a dirt
  yard, a mud wallow, a gravel bed, an ash flat, a cobbled square and a worn
  path as whatever the country under them was: six of the ten brushes painting
  nothing a player could see.

`GROUND_PAINT` holds those six, and every one of them is
`editor/modes.groundColour(word)` lifted 30 percent toward `map_paint`'s
`PAPER`. It is MIRRORED rather than imported because `modes.js` reaches
`terrain_material.js`, which imports THREE, and the map has to run in node with
no renderer. That is the same reason `map_paint` mirrors `CANOPY_DENSITY` out of
`arbor.js`. The mirror is held honest in two places:

* `auditMinimap()` runs at import and throws if any `GROUND_WORDS` entry has
  neither a biome nor a colour, if one has both, or if a colour names a brush
  that does not exist. Driven both ways in the suite: delete `mud` and it
  throws about `mud`; give `grass` a colour and it throws about `grass`.
* The suite imports the real `groundColour` and fails if any of the six has
  drifted by more than one in any channel. That check is itself driven both
  ways: a deliberate three-count drift is caught.

---

## The mount, and why hud.js owns it

`hud.mountMinimap(opts)` builds the square into the HUD ROOT and hands it back.
`ui.js` is the only caller.

It is mounted there and not on `hudRoot`, because `setMode` works on the
children of that root: a square dropped beside the HUD would be outside the
switch entirely, unhidden in play mode and unpositioned against the badge. The
compass strip is mounted through `hud.compassSlot` for the same kind of reason.

It is mounted by a CALL and not built inside `createHud`, because the minimap
needs the world field, the player and the camera, and `app/context.js` builds
the HUD before any of the three exist. It also means `hud.test.mjs` still counts
exactly the children it always counted: with nothing mounted there is no node.

Mounting twice hands back the one already standing. A second square would sit
exactly on top of the first and eat its clicks, which is the farm HUD's tool row
bug, so it is refused rather than drawn.

### setMode

```js
for (const child of [...el.children]) {
  if (child === devBadge) continue;
  if (minimap && child === minimap.el) continue;
  ...
}
```

Two lines, and the first is untouched, so `wiring.test.mjs`'s check that the dev
badge is kept still reads what it always read.

### The five hooks ui.js hands over

Every one is a live read and not a value captured at boot.

| hook | what it reads | why a function |
| --- | --- | --- |
| `field` | `runtime.field` | a sculpt world replaces the field outright |
| `spaces` | `SPACES` | the editor's save endpoint rewrites the list and vite reloads it |
| `dirty` | `runtime.terrainEdits.version` | every stroke bumps it, and it is what takes the ground off the leash |
| `waypoint` | `character.waypoint` | win_map.js writes it when you click a place |
| `places` | `runtime.sitesNear(x, z, span / 2)` | Hearthhome and the Hedge have names on the map before a single space is authored round them |

`isDev` is `panelCtx.dev.on` and `isEditor` is the HUD's own mode, which hud.js
supplies at mount so nothing else has to know about it.

---

## The controls, and what each one says

A control that does its work in silence is indistinguishable from a broken one,
so every one of these writes the readout line under the square. The frame's
`title` says all of them in one breath.

| control | what happens | what it says |
| --- | --- | --- |
| wheel | zoom, 500 m to 4 km across, 1.25 a notch | "1.3 km across", or "furthest out: 4 km across" at the stop |
| click, dev mode on | warp through the dev bench | "warped to 1517, 1423", and a toast with the ground's name |
| click, dev mode off | nothing | "the minimap only warps in dev mode" |
| hover | nothing | the world coordinates under the cursor |
| nothing | nothing | your own coordinates, and "and 19 more" when the square has thinned its marks |

The warp goes through `win_dev.benchOf().warp`, which is the five step arrival
`main.js` already does: the feet, the camera, the document, the monster rescan
and the forage field. It is NOT a second `player.teleport` of ui.js's own,
because a warp that only moves the feet is exactly the half arrived jump the
bench exists to stop. If the bench is not up, the click says so rather than
doing nothing.

---

## The capacity of a 220 px square

Two containers here have a capacity and both are counted rather than found out
later.

**Names.** A name is about 60 px wide and a row about 12 px tall, so fourteen of
them is already a busy square. Measured: the world offers 36 sites within 2 km
of Hearthhome, 33 of them inside the square at the widest zoom. So `marksIn`
keeps the nearest `MINIMAP.maxMarks` (14) and COUNTS the rest, and the readout
says "and 19 more". Spaces are never thinned, because a space is a thing
somebody put there by hand and is the reason the map is on the screen at all.

**Edges.** Nothing is drawn outside the square and nothing is clipped by the
context, because a node canvas and an SVG writer cannot both be relied on for a
clip. A mark whose centre is off the square is dropped rather than pinned to the
rim, a label is held off both edges by `labelX` and trimmed by `fitName` until it
fits, and the realm circle is walked as points and broken into the runs that are
really inside. The suite checks every rectangle, every dot and both ends of every
word against `[0, 220]`.

---

## The leash, and what it cost

The ground repaint is the expensive half, and it runs at most twice a second and
only with a reason:

* the terrain version changed (the editor laid a stroke)
* you moved more than `MINIMAP.moveM` (8 m)
* the zoom changed, or the HUD went into or out of editor mode

The last two jump the half second, because both are a thing the person just did
with their own hand and the lattice has to be there when the screen changes.
Walking and sculpting stay on the leash.

The arrow and the waypoint are a SECOND CANVAS over the first, cleared and
redrawn, and only when the yaw has moved more than `MINIMAP.yawEps` (0.004 rad),
the point has moved more than 0.25 m, or the waypoint has changed. Between two
ground repaints the ground is up to 8 m stale and the arrow walks across it,
which is what makes movement visible at all.

Measured on the real world field in node, through the real `update`, with the
`places` hook wired to the real `sitesNear`:

| | |
| --- | --- |
| a 220 px repaint | median **2.5 ms**, worst **3.3 ms**, over 19 paints at 19 places the field had never been asked about |
| what one paint samples | 729 `field.sampleAt` calls, composed into about 1550 rectangles |
| the first paint of a brand new field | about **5 ms**, which is the field building its own lattice, and happens once |
| a frame with nothing to do | about **2 microseconds** |
| running flat out for 3 s | 5 repaints, never more than 6 |

### Two backing pixels a pixel

The square is 220 px of nothing but small type and hairlines, and at one backing
pixel per CSS pixel on a retina screen every letter of it is drawn at half the
resolution the screen can show. So both canvases are `size * devicePixelRatio`
across, capped at two, and each painter scales once at the top: everything under
it is written in CSS pixels, so no coordinate anywhere in the file has to know.
Measured: dpr 1 makes a 220 px store and scales nothing at all, dpr 2 makes a
440 px store and both layers scale by 2, dpr 3 stops at 440 as well, and the
ground still lands on the same 220 pixels either way.

`MINIMAP.cells` is 26 because of a measurement and not an opinion. Over 57
repaints at places the field had never seen:

| cells | samples | median | worst |
| --- | --- | --- | --- |
| 24 | 625 | 2.15 ms | 3.62 ms |
| **26** | **729** | **2.05 ms** | **3.09 ms** |
| 28 | 841 | 2.35 ms | 3.60 ms |
| 30 | 961 | 2.75 ms | 3.98 ms |

That is 38 m of ground a sample at the opening zoom and 19 m at the closest.
The suite measures it again on every run and fails at 4 ms.

---

## The boxes, and the editor's top dock

Three widgets want the top right corner, and a guessed pixel offset in a corner
is the bug that put the compass strip through the place name twice. So all three
have counted boxes and pure functions that hand them over.

| widget | box | from |
| --- | --- | --- |
| the dev badge | top 14, height 30.175, pinned right 14 | `hud.devBadgeBox(text, screenW)` |
| the minimap | top 52, 232 by 245, pinned right 14 | `minimap.minimapBox(screenW)` |
| the editor's top dock | top 0, height 34, right edge at `screenW - 256` | `editor/panel.topDockBox(screenW, w)` |

Measured on 1280, 1600 and 2560 px screens: the badge's box and the minimap's do
not share a pixel, and there is 7.8 px of air between them, with the badge's line
run out to its longest ("fly mode 60 fps 16.7 ms 1200 draws 980k tris 40 alive").

The editor's top dock used to run to `right: 0`, straight through that column.
No z-index could have fixed that: `#bw-hud` is itself a stacking context at
z 40 and the editor's screen is at z 60, so a number on the square cannot lift
it over a dock. Keeping the column free is the whole of the fix. The dock now
stops at `TOP_DOCK_RIGHT`, which IS `MINIMAP_CLEAR` and never a second copy of
the number. The editor's root is `pointer-events: none` and only its docks take
events, so with the docks out of this column the wheel and the click reach the
square in editor mode. The claim is proved
against a dock as wide as the whole screen, so no width the dock could ever have
can reach the map, and the suite also proves the claim would have failed for a
dock back in the corner.

---

## The arrow, and which way is north

`arrowAngle(yaw)` IS `compass.headingOf(yaw)`, out of the same function the
compass strip reads, so the two cannot drift apart about which way is north.
`player.js` says forward is `(sin yaw, cos yaw)`; the map draws +x right and +z
down, so yaw 0 is SOUTH and an arrow drawn pointing up has to be turned a half
circle. Driven four ways in the suite: yaw 0 points down the map, PI/2 right,
PI up, -PI/2 left, and each is checked against the forward vector itself and not
against a remembered number.

---

## A pixel is metres, and metres are a pixel

Both directions go through one number, `mpp = span / size`:

```js
worldOf(v, px, py) = [v.cx + (px - v.half) * v.mpp, v.cz + (py - v.half) * v.mpp]
pxOf(v, x, z)      = [v.half + (x - v.cx) / v.mpp, v.half + (z - v.cz) / v.mpp]
```

Measured over 8820 pixels at five spans and four centres, one of them at the far
corner of the world: the round trip is exact in metres and lands within
4e-13 of a pixel, which rounds back to the pixel it started at every time. That
is what makes the click warp land where the cursor was.

---

## What is not done

* `setShown(on)` exists and works, and NOTHING CALLS IT. There is no settings
  toggle for the minimap; the only way to put it away today is
  `window.__bw.minimap.setShown(false)` at the console. `compass.setShown` is in
  exactly the same state and has been since HUD3.
* Nothing here has been driven in a browser. Every number above was measured in
  node through a recording context, which proves the call log and not the
  pixels: the shading, the type sizes and the way the square sits beside the dev
  badge are all unseen. The reviewer runs it.
* The 256 m lattice is drawn from `MINIMAP.tile`, which is a mirror of
  `editor.js`'s `TILE_M` rather than an import, because `editor.js` reaches
  `plan_models.js` and THREE. The suite imports the real `TILE_M` and fails if
  the two ever differ, so the mirror cannot drift in silence.
* A space's people, monsters and markers are not drawn. The map shows where a
  space IS and how far it reaches, not what is standing in it.
