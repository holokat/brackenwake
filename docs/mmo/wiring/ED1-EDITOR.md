# ED1: the in game editor, and the spaces it writes

Written after the work. Every count quoted here is printed by
`node src/mmo/spaces/spaces.test.mjs` (76 checks) and
`node src/game/editor/editor.test.mjs` (239 checks), on world seed 20260904.

The user asked for an editor: "i want to be able to place structures, monsters,
creatures, trees, rocks, etc... or even just a placeholder with some description
for an object we create later". The Greenwold is going to be laid out space by
space by hand, because random scatter reads as filler.

This is the PLACEMENT half. The terrain half (raising ground, carving mini
caves, mountains, lakes, snow) is a separate piece of work that publishes
`window.__bw.terrain`; the editor's Terrain tab is BUILT OUT OF that contract
and says so in words when it is not there yet. Not one brush is named in
`src/game/editor`: `kinds()` is the vocabulary, the knobs and their ranges, and
every row and every slider on the tab is drawn from the answer.

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

### How to sculpt the ground

The Terrain tab is the whole landscape: mountains, ridges, valleys, plateaus,
terraces, noise, erosion, lakes, and the ground itself in whatever word the
terrain half paints with, snow among them. It is built from `kinds()`, so this
list is whatever that contract answers on the day and not a list kept here.

1. Open the editor in dev mode and pick the **Terrain** tab. The other tabs put
   their tools away and the terrain rows come up in their place.
2. The **World** row is the floor everything else is cut into: the mode the
   terrain half is in, the base height, the base ground and the snow line.
   Type into the three fields and press **set the floor**. **Reset terrain**
   asks before it acts: the first press says it will drop every stroke and
   changes nothing, and a second press inside eight seconds does it. There is
   no undo behind that one.
3. Below it is **one row per brush**, numbered for its key, with **one slider
   per knob** at the range the contract gave that knob. A mountain reaches
   600 m across and 400 m up because the contract says 600 and 400; nothing in
   the editor caps it at anything of its own. The ground brush carries a word
   picker holding every word it may paint.
4. Click a row, or press its number, to take that brush in hand. The ring on
   the ground is the real radius it will take, so what will be hit is seen
   before the press.
5. **Area brushes are painted.** Hold the left button and drag. A stroke is
   laid every half radius along the drag and no oftener than every 60 ms, so a
   sweep reads as one brush and not as a row of dots. The end of the drag says
   how many strokes it laid, and **one ctrl Z takes the whole drag back**, one
   call to the contract's undo per stroke in it.
6. **Hold shift while you drag to turn the brush over.** Raise lays lower, a
   ridge lays a valley, a brush whose amount is allowed to go negative has its
   amount negated, and a brush that can do neither says in words that shift
   changed nothing. A plateau flattens either way.
7. **A ridge and a valley take two clicks.** The first sets where the line
   starts and says so, the ghost draws the line to the cursor over the real
   ground, and the second click cuts it, once. The bearing is clockwise from
   north and the length is the distance between the two clicks. A line longer
   than the brush reaches is cut to what it reaches AND says it was cut.
   Escape lets a half drawn line go.
8. **Ctrl Z and ctrl Y walk the ground's stack while the Terrain tab is up**,
   and the space's stack on every other tab, because the ground is what is
   being made there. **save ground** writes the stroke list through the same
   dev endpoint the spaces use.

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
| `ctrl Z` / `ctrl Y` | undo and redo. On the Terrain tab this is the GROUND's stack, a whole drag at a time; on every other tab it is the space's |
| `ctrl S` | save the open space |
| `Escape` | drop the tool, and let a half drawn ridge go. Press it again to close the window. |
| `1` to `9` | Terrain tab only: take the first nine brushes in hand, in the order `kinds()` named them |
| `+` / `-` | Terrain tab only: widen and narrow the brush by 15 percent of itself, never by less than one step of its own slider, and never outside the range the contract set |
| left drag | Terrain tab only: paint the brush along the ground. Hold `shift` to turn it over |
| left click, twice | Terrain tab only, on a ridge or a valley: the start, then the far end |

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
| Terrain | whatever `window.__bw.terrain.kinds()` answers, one row and one slider per knob. Empty, with the reason in words, when that contract is not there | as many as the contract names |

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
| `src/game/editor/palette.js` | new, pure. Every tab, derived from the game's own tables; the Terrain tab derived from `terrain.kinds()` through `brushRow` and `brushRows`. |
| `src/game/editor/editor.js` | new. `createEditor(ctx)`: every action, with no DOM. |
| `src/game/editor/ghost.js` | new. The thing under the cursor and the ring under that, plus `brushRing` at exactly the brush's radius and `lineGhost` sampled onto the ground. |
| `src/game/editor/panel.js` | new. The window, the canvas listeners and the keys. |
| `src/game/editor/index.js` | new. One import for all of it. |
| `src/game/editor/editor.test.mjs` | new. 239 checks, 32 of them the real panel built over a fake document. |
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
window.__bw.terrain.kinds()      // [{ kind, label, params: [{ name, min, max, step, default }], words? }]
window.__bw.terrain.stroke(s)    // words
window.__bw.terrain.undo()       // words, or false when there is nothing left
window.__bw.terrain.redo()       // words, or false
window.__bw.terrain.save()       // words
window.__bw.terrain.list()       // every stroke on the ground, or count()
window.__bw.terrain.mode()       // 'sculpt' | 'generate'
window.__bw.terrain.base()       // { height, ground, snowLine }
window.__bw.terrain.setBase({ height, ground, snowLine })   // words
window.__bw.terrain.reset()      // words
runtime.rebuildAround(x, z, r)
```

`kinds()` is the whole vocabulary. The tab is one row per kind and one slider
per param, at that param's own min, max, step and default, so a brush that
reaches 600 m gets a slider that reaches 600 m with nothing to change in
`src/game/editor`. A kind is a **line tool** when its params hold a `yaw` and a
`length`, or a second point (`x2`/`z2`, `tox`/`toz`, `ex`/`ez`); everything else
is painted with a held button. A kind whose row carries a `words` ARRAY gets a
word picker, and the word chosen is sent as both `word` and `ground`, because
`world.js` reads `s.word || s.ground`.

Three things the editor reads off the param table rather than deciding for
itself, each of which is a wrong picture on the ground if it is got wrong:

- **The unit of a bearing is its own range.** `terrain_edits.js` counts `yaw` in
  radians (`0` to `2 pi`); a knob that ran to `360` would be degrees. A ridge
  drawn due east is sent `1.5708` to the first and `90` to the second, and the
  words say `bearing 90 degrees` either way, because nobody reads a hillside in
  radians.
- **A bearing on a brush that is not a line tool is not sent until it is
  moved.** `cliff` and `cave` carry a `yaw` with a default of 0, and `world.js`
  fills a missing one with the downhill at that point for a cave mouth and the
  player's own facing otherwise. Sending the untouched slider would overrule
  both in silence and open every cave mouth due north, so the slider reads
  **the ground decides** until it is dragged.
- **`r` and `amount` go down only where the kind really has such a knob.** A
  `lake` takes an `r` and a `floor`; an `amount` it never asked for would read
  as a knob it has.

What one stroke carries:

```js
{ kind, x, z,                 // the kind and the point, always
  ...params,                  // every knob of that kind, under its own name
  r, amount,                  // and again under the two names the first contract used
  word, ground,               // only for a kind that paints a word
  yaw, length, x2, z2 }       // only for a line tool, worked out from the two clicks
```

A held drag lays a stroke every half radius along the drag and no oftener than
every 60 ms (`DRAG_SPACING` and `DRAG_MS` in `editor.js`), calls
`rebuildAround` after each, says how many it laid at the end, and pushes them
onto the editor's own stack as ONE group: undo pops the group and calls
`terrain.undo()` once per stroke in it, so one ctrl Z takes back the whole
sweep. Shift at the press turns the brush over for the whole drag: a named pair
where both halves are in `kinds()` (raise and lower, ridge and valley, mountain
and lake, hill and pit), else a negated amount where the amount may go
negative, else nothing at all and a line of words saying so.

With nothing on `window.__bw.terrain`, every button and every key on the tab
answers **"the terrain tools are not in yet: nothing answers
window.__bw.terrain"** and changes nothing. With a `stroke` but no `kinds()`,
the tab shows one line naming that half and no brushes, and the seven of the
first contract are still the only kinds `stroke()` will pass. A `kinds()` that
throws, or that answers something that is not a list, is caught and said.
Driven every one of those ways in the test.

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
- The Terrain tab, against a fake `kinds()` of eleven kinds shaped exactly as
  `world.js` publishes them: eleven rows in the order the fake named them, each
  with the contract's own label, and 26 sliders, one per knob, the mountain's
  radius running 20 to 600 in steps of 5 from 300 and its lift 5 to 400 while
  raise, on the same tab, runs to 200 and 60. A knob with no name is dropped, a
  knob whose max is under its min is pulled up to it, a duplicate kind is taken
  once. The ground brush gets the one word picker on the tab, holding all ten
  words, snow among them; choosing snow in the real `<select>` reaches the
  editor and the next stroke carries `word: 'snow'` and `ground: 'snow'`.
- One stroke carries every knob under its own name AND `r` and `amount`. A
  slider dragged to 9999 is pulled back to the 600 the contract allows, not to
  the 120 the old editor capped at; one dragged below the floor is pulled up.
- A drag of 300 m at a radius of 20 lays **31 strokes**, at x = 0, 10, 20 ...
  300, and the panel says "31 strokes"; one undo calls the contract's undo
  **31 times** and a second undo finds nothing, because the drag is one step
  and not thirty one; redo puts all 31 back. Seven moves 30 m apart inside
  60 ms lay 2 strokes, six slow moves of a metre lay 1, and the same drag with
  a 300 m mountain lays 5 strokes 150 m apart, because the spacing is half the
  radius.
- The bearing, both units and both kinds of knob: a ridge drawn due east on a
  radian knob is sent 1.5708 and on a degree knob 90, and says `bearing 90
  degrees` either way; south west is 3.927 radians; a `cave` with an untouched
  `yaw` is sent no `yaw` at all and the same cave sent 3 once the slider moves;
  a `lake` is sent its `floor` and no `amount`.
- Shift, four ways: raise lays lower, a ridge lays a valley, a noise whose
  amount may go negative has its amount negated to -3, and a plateau lays a
  plateau and says shift changed nothing. A contract with no `lower` in it does
  not send shift at a kind that is not there.
- A ridge takes two clicks: the first cuts nothing, the second cuts exactly one
  stroke anchored at the first point, bearing 0 due north, 90 due east, 225
  south west, length the distance between them. 900 m on a brush that reaches
  600 is cut to 600 and says so. Two clicks 0.1 m apart are refused with the
  distance in the refusal. Escape lets the line go and cuts nothing. A kind
  that asks for `x2`/`z2` gets the point instead of a bearing.
- The World row reads `mode()` and `base()` and shows them; Set sends all three
  fields; Reset asks first (nothing dropped, the button says "press again"),
  does it on the second press, asks again nine seconds later rather than acting
  on a stale yes, and empties the editor's own drag stack so undo does not
  chase ground that is gone.
- The keys, fired at the real handler: 1, 3 and 9 take the first, third and
  ninth brush; plus and minus move a 20 m radius to 23 and back to 19.55; ctrl
  Z on the Terrain tab calls the ground's undo; a key the editor has no use for
  is left for the game.
- Every one of those with the contract absent, half present and thrown: no
  `window.__bw.terrain` gives one line of words and no sliders, a `stroke` with
  no `kinds()` names that half and still passes the original seven, a `kinds()`
  that throws is caught and said, and a `kinds()` answering a string leaves no
  brushes. The tab redraws itself the moment a contract does answer.
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
- the key handler leaving this window's own text boxes alone (the keys
  themselves are fired at the real handler in node, over a fake document);
- the marker label sprite, which needs a 2D canvas and returns null in node (the
  post still stands, unlabelled, and the marker's own words are on its
  `userData` either way);
- the brush ring and the line ghost as three.js objects: `brushRing` is built
  at exactly r metres and `lineGhost` samples 48 points onto `heightAt`, but
  neither has been rendered, and no scene exists in the node tests;
- the pointer path on the Terrain tab: the press starting a drag, each move
  feeding `dragStroke`, and the release ending it. The spacing, the interval
  and the batching all live in `editor.js` and ARE measured; what is not
  measured is the three lines of `panel.js` that hand the pointer to them;
- the terrain tab against a real `window.__bw.terrain`. Every test above runs
  against a fake shaped like the contract, so the two halves meeting for the
  first time is still the reviewer's to see.
