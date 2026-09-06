# ED1: the in game editor, and the spaces it writes

Written after the work. Every count quoted here is printed by
`node src/mmo/spaces/spaces.test.mjs` (76 checks) and
`node src/game/editor/editor.test.mjs` (119 checks), on world seed 20260904.

The user asked for an editor: "i want to be able to place structures, monsters,
creatures, trees, rocks, etc... or even just a placeholder with some description
for an object we create later". The Greenwold is going to be laid out space by
space by hand, because random scatter reads as filler.

This is the PLACEMENT half. The terrain half (raising ground, carving mini
caves) is a separate piece of work that publishes `window.__bw.terrain`; the
editor's Terrain tab calls that contract and says so in words when it is not
there yet.

---

## How to use it

1. Press the key under Escape (F1 or backquote) to turn dev mode on. The camera
   flies: WASD, Q down, E up, shift for speed. The dev bench opens with it.
2. Press **L**, or press the bench's **edit the world** button. The editor
   refuses to open when dev mode is off, and closes itself when dev mode goes
   off, because it flies the camera and writes files.
3. Fly to where the place should be, type a name into **New space here**, set
   how far it should reach, and press **make it**. Nothing is on disk yet.
4. Pick a tab, find a thing, click its row. It is now on the cursor.
5. **Left click the ground** to put one down. The ghost sits on the real
   terrain and shows the footprint it will take. **Right drag still turns the
   camera**, so you can look around without dropping the tool.
6. Click a row in **What stands in this space**, or click near a thing in the
   world, to select it. Then drag it, or use the keys.
7. **Ctrl S** saves. The file lands in `src/mmo/spaces/<id>.json`, the
   generated index picks it up, and the game reloads with the place in it.

### The keys

| key | what it does |
|---|---|
| `L` | open and close the editor (dev mode only) |
| left click | put down what is on the cursor, or select what is under the pointer |
| left drag on the selection | move it along the ground |
| right drag | turn the camera, tool or no tool |
| `R` / `shift R` | turn the selection 15 degrees, right or left |
| `]` / `[` | make the selection a tenth bigger or smaller |
| `Delete` / `Backspace` | remove the selection |
| `ctrl Z` / `ctrl Y` | undo and redo, through the whole session |
| `ctrl S` | save the open space |
| `Escape` | drop the tool. Press it again to close the window. |

Every one of those prints a line, in the editor's own status panel and in the
HUD log. A placement says what went down, where in the space's own frame AND
where in the world, and how many things stand in the space now. A refusal says
why, and changes nothing.

### The tabs

| tab | what is in it | measured |
|---|---|---|
| Structures | every model id in `FOOTPRINT`, marked **modelled** where a glb is loaded and **stand-in** where the boxes are still standing in | 94 |
| Trees | every species `arbor.js` grows | 11 |
| Rocks | the two boulders `flora.js` scatters, plus every kind in every realm's dressing kit | 104 |
| Monsters | every row in `src/mmo/monsters.js`, lowest tier first | 106 |
| Creatures | every critter `fauna.js` grows. Each is placed as a spawn, because each is also a monster row | 7 |
| People | every role in `npcs.js` plus the story's own | 22 |
| Markers | a form: a label, a note, and one of seven kinds | 7 |
| Terrain | the seven brushes of the terrain contract | 7 |

Not one of those lists is typed out in the editor. Each is read off the module
that owns it, and `editor.test.mjs` counts them against those modules both ways,
so a monster added to the roster is placeable with no second table to update.

### A marker is the point

"or even just a placeholder with some description for an object we create
later". A marker is a post with a coloured board on it and the words floating
over it: `a footbridge goes here`, `one span, no rails`, kind `structure`. It is
saved in the space file with everything else, and it is **dev only**: the post
is built with `visible = false` and comes up only while dev mode is on, so a
player who walks into a half authored space sees the space and not the notes.

---

## What a space is

`src/mmo/spaces/<id>.json`. A plan (`src/mmo/plans/`) is drawn about a named
place in `zones.js` LAYOUT and there can only ever be nine of them. A space
stands wherever it says it stands.

```json
{
  "id": "the_ford_below",
  "name": "The Ford Below",
  "note": "A crossing with a mill on the far bank.",
  "at": { "x": 1400, "z": -900 },
  "radius": 50,

  "pieces":  [{ "model": "millers_house", "x": -12, "z": 6, "yaw": 90, "scale": 1 }],
  "runs":    [{ "model": "stone_wall_4m", "from": { "x": -20, "z": -20 }, "to": { "x": 4, "z": -20 } }],
  "areas":   [{ "kind": "mud", "points": [[6, 6], [16, 6], [16, 16], [6, 16]] }],

  "trees":   [{ "species": "willow", "x": 10, "z": -4, "yaw": 30, "scale": 1 }],
  "rocks":   [{ "kind": "sarsen", "x": -4, "z": 14, "yaw": 0, "scale": 1.4 }],
  "markers": [{ "x": 0, "z": 20, "label": "a footbridge goes here", "note": "one span, no rails", "kind": "structure" }],

  "people":  [{ "name": null, "role": "miller", "x": -18, "z": 2, "yaw": 180 }],
  "spawns":  [{ "id": "boar", "x": 18, "z": 2 }]
}
```

`at` is absolute world metres. Everything else is metres from `at`, x east and
z north, `yaw` in degrees clockwise from north, exactly as a plan writes it.
`marker.kind` is one of `structure, monster, creature, tree, rock, prop, other`.

`arrival` is optional on a space and required on a plan, and that is the only
field of the plan shape a space treats differently.

---

## Files

| file | what it is |
|---|---|
| `src/mmo/spaces/index.js` | new, pure. `SPACES`, `SPACE_IDS`, `spaceFor`, `emptySpace`, `SPACE_STATS`. |
| `src/mmo/spaces/list.js` | new, **generated**. One static import per space file. Rewritten by the save endpoint. |
| `src/mmo/spaces/spaces.test.mjs` | new. 76 checks. |
| `src/mmo/plans/plan_schema.js` | `auditSpaces()` beside `auditPlans()`, both over one `auditAll`, and `MARKER_KINDS`. Every rule a plan is held to, a space is held to. |
| `src/mmo/plans/index.js` | `layoutFor(id)` answers for a plan OR a space, and `peopleFor`, `spawnsFor` and `inPlannedPlace` go through it. |
| `src/world/plan_models.js` | `buildPlan` builds `trees`, `rocks` and `markers`; `speciesProto`, `ROCK_KINDS` (104), `rockGeometry`, `rockMaterialFor`, `markerBody`, `markerLabel`, `setMarkersVisible`, `auditSpaceKinds`. |
| `src/world/sites.js` | `spaceSiteRow`, `spaceSitesNear`, and the two lines in `sitesNear` that hand a space to the streamer. |
| `src/world/site_models.js` | three lines: a site with a `space` is built with `buildPlan`, exactly as a planned place is. |
| `src/game/editor/space_doc.js` | new, pure. The document and the command stack. |
| `src/game/editor/palette.js` | new, pure. Every tab, derived from the game's own tables. |
| `src/game/editor/editor.js` | new. `createEditor(ctx)`: every action, with no DOM. |
| `src/game/editor/ghost.js` | new. The thing under the cursor and the ring under that. |
| `src/game/editor/panel.js` | new. The window, the canvas listeners and the keys. |
| `src/game/editor/index.js` | new. One import for all of it. |
| `src/game/editor/editor.test.mjs` | new. 119 checks. |
| `tools/editor_save.mjs` | new. The dev only save endpoint and its path guard. |
| `vite.config.js` | new. The plugin, `apply: 'serve'`, and the 5198 port. |
| `src/game/win_dev.js` | the bench's Editor row, and the button that opens it. |
| `src/game/app/systems/ui.js` | one line: `windows.register(editorPanel)`. |
| `src/game/app/systems/dev.js` | markers come up and down with dev mode; the editor closes with it; `__bw.editor` and `__bw.editorPanel`. |

---

## The five seams into the running game

A space is not a second code path. Every one of these is the seam the nine
plans already use.

| seam | the line |
|---|---|
| the streamer finds it | `sites.sitesNear` appends `spaceSitesNear(x, z, radius, field)`. A space owns no grid cell, so nothing else would ever find one. |
| its chunk builds it | `site_models.buildSiteMarker`: `if (site.space && SPACES[site.space]) return buildPlan(...)` |
| the scatter stops inside it | `plans.inPlannedPlace` resolves through `layoutFor`, so `dressing.js` line 695 covers a space with no change |
| its people are stood | `npcs_runtime.streetFor` reads `peopleFor(site.sub)`, and `sub` is the space's id |
| its monsters are stood | `monsters.plannedSpawnsForChunk` reads `spawnsFor(site.sub, night)` |

Proved end to end, on the real disk, in a fresh node process:
`spaces.test.mjs` writes the fixture through the editor's own save function,
spawns `node` in the repo, and reads back that `SPACES` holds it, that
`inPlannedPlace` is true at its centre, true at its far edge, true in its 8 m
margin and false a metre past it, and that `sitesNear` hands it over as a site
of kind `space`. The file and the generated index are put back in a `finally`.

---

## Saving

`vite.config.js` adds one plugin, and it is dev only (`apply: 'serve'`), so
`vite build` produces what it produced before and the deployed game has no
write endpoint at all.

```
POST /__editor/save   { path, json }   writes one file
GET  /__editor/list                    the spaces on disk, with their counts
```

It will write **two folders and nothing else**: `src/mmo/spaces/*.json` and
`public/terrain/*.json` (the terrain half's own, which this half never writes).
Everything else is a 400 with the reason in words. Driven the wrong way in
`editor.test.mjs`, thirteen ways: a source file, a json anywhere else, the
repository root, an absolute path, a climb out of the tree, a climb dressed up
as a name, a folder below, a file that is not a json, no name at all, a null
byte, a climb from the other folder, an empty path, and something that is not a
string.

After a space is written the generated `src/mmo/spaces/list.js` is rewritten
from what is on disk, so the import graph stays **static**: one `import ... with
{ type: 'json' }` per file, identical in node and in the browser, no glob and no
manifest fetch. That is what lets the test load exactly what the game loads.

The editor runs `auditSpaces` on what it is about to send BEFORE it sends it,
using the same function the game runs at load, so a space that would refuse to
load is refused at the Save button with the reason instead of being written and
breaking the next reload.

---

## The terrain contract

The editor calls, and never implements:

```js
window.__bw.terrain.stroke({ kind, x, z, r, amount })   // raise lower flatten smooth pit cliff cave
window.__bw.terrain.undo()
window.__bw.terrain.redo()
window.__bw.terrain.save()
runtime.rebuildAround(x, z, r)
```

Click and drag on the Terrain tab lays a stroke every 70 ms while the button is
down, and calls `rebuildAround` after each. The end of a drag says how many
strokes it laid. With nothing on `window.__bw.terrain`, every one of those five
buttons answers **"the terrain tools are not in yet: nothing answers
window.__bw.terrain"** and changes nothing. Driven both ways in the test.

---

## What was measured, and what was not

Measured, in node, no renderer:

- The command stack walks forwards through place, place, move, rotate, rotate,
  scale, remove, comparing the whole document to a snapshot after each; then
  undoes all seven, comparing to the same snapshots in reverse; then redoes all
  seven. Byte for byte at every step. A delete puts its entry back at the index
  it came out of and not on the end.
- A space with a piece, a run, a ground treatment, a tree, a rock, a marker, a
  person and a spawn builds through `buildPlan` into a group holding all of
  them, the tree grown by arbor and instanced, the rock instanced by kind, the
  marker carrying its own label, note and kind, and the whole thing sitting on
  the real height field (and one kilometre of different ground away, at a
  different height).
- Twenty ways a space can be wrong, each driven the wrong way and then the
  right way: no `at`, no name, a zones.js place, no radius, the wrong key, an em
  dash, a piece, tree, rock or marker outside the radius, a marker with no
  words, a marker kind that is not one, a tree with no species, a rock scaled to
  zero, a spawn that is not a monster, a role nobody has, a person inside a
  wall, a model with no footprint, a species arbor does not grow, a rock kind
  nothing builds, and a plan that tries to carry a space's lists.
- Markers: hidden when built, turned on and off again by `setMarkersVisible`
  over a group that is already standing.
- The palette against `FOOTPRINT` (94), the roster (106), `arbor.SPECIES` (11),
  `CRITTERS` (7), the rock kinds (104) and the roles (22), in both directions.
- The save payload: it goes to `/__editor/save` as a POST, at the path the id
  makes, and is the space document field for field, with every list present
  even when empty, and it passes the load audit.
- `npx vite build`: 217 modules, clean, with only the two warnings the project
  already had.

Measured against a **running dev server**, with curl:

- `GET /__editor/list` answers `{"ok":true,"spaces":[]}` on an empty folder,
  and lists the space with its eight counts once one is written.
- `POST /__editor/save` writes `src/mmo/spaces/zz_probe.json` (234 bytes) and
  rewrites `list.js` to import it, logging `[editor] wrote ...` in the server.
- `src/game/main.js` and `../../../tmp/evil.json` both come back **400** with
  the reason, and the server logs `[editor] refused: ...`.
- Vite then logged `page reload src/mmo/spaces/list.js`, so a saved space
  reaches the running page as a reload with no further wiring.

**Not measured.** Nothing in this document has been run in a browser: the
reviewer has that. Specifically unverified by a test:

- the ghost following the pointer, and the ray march against `heightAt` finding
  the ground under a camera a hundred metres up;
- the left button being swallowed in the capture phase so `input.js` never
  publishes a click, and the right drag still turning the camera;
- the key handler taking `R`, the brackets, Delete, ctrl Z, ctrl Y and ctrl S
  while leaving this window's own text boxes alone;
- the marker label sprite, which needs a 2D canvas and returns null in node (the
  post still stands, unlabelled, and the marker's own words are on its
  `userData` either way);
- the terrain tab against a real `window.__bw.terrain`, which does not exist
  yet.
