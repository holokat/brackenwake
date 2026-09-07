# ED1: the in game editor, and the spaces it writes

Written after the work. Every count quoted here is printed by
`node src/mmo/spaces/spaces.test.mjs` (76 checks) and
`node src/game/editor/editor.test.mjs` (303 checks), on world seed 20260904.

ED4 rebuilt the SCREEN and nothing under it. The editor was a tall settings
window of text fields and buttons; the user's words were "i want a paintbrush
style world editor, not whatever weirdness we have here" and "an actual sidebar
with visual icons to click ... a full visual editor HUD open at all times not
like a settings window". So the window is gone: L is a mode now, the gameplay
HUD comes off the screen while it is up, and what is in its place is a sidebar
of marks, a tray of tiles and a brush on the ground. `editor.js` is the same
file it was, with the automatic tile spaces, the scatter brush and the autosave
added to it.

The user asked for an editor: "i want to be able to place structures, monsters,
creatures, trees, rocks, etc... or even just a placeholder with some description
for an object we create later". The Greenwold is going to be laid out space by
space by hand, because random scatter reads as filler.

This is the PLACEMENT half. The terrain half (raising ground, carving mini
caves, mountains, lakes, snow) is a separate piece of work that publishes
`window.__bw.terrain`; the editor's Sculpt, Paint and Water trays are BUILT OUT
OF that contract and say so in words when it is not there yet. Not one brush is
named in `src/game/editor`: `kinds()` is the vocabulary, the knobs and their
ranges, and every tile and every slider is drawn from the answer.

---

## How to use it

The editor is a MODE, not a window. There is no title bar, no close button and
no form to fill in before anything can be done. Pressing L in dev mode takes the
gameplay HUD off the screen and puts the editor in its place; pressing L again,
or Escape with nothing held, puts the HUD back exactly as it was.

1. Press the key under Escape (F1 or backquote) to turn dev mode on. The camera
   flies: WASD, Q down, E up, shift for speed.
2. Press **L**. The portrait, the purse, the pools, the compass, the bars and
   the log go away. The dev badge stays, because the editor only exists in dev
   mode and the badge is how you know you are in it.
3. **Pick a mode down the left side.** Nine square marks, one per kind of work,
   with the name under each. Keys 1 to 9 pick them. The lit one is the one you
   are in.
4. **Pick a tile out of the tray beside it.** Every tile is a 56 px square with
   a mark or a colour on it and the name underneath. The box at the top of the
   tray narrows it: type `inn`, `boss`, `stand-in`, `beech`.
5. **Hold the left button on the ground and paint.** The ring under the cursor
   is the ground the brush will take. The wheel widens and narrows it, shift and
   the wheel change how much it does. Shift while painting turns a brush over,
   or rubs a scatter out.
6. **Nothing is named and nothing is saved by hand.** Whatever you put down goes
   into the space for the 256 m tile it landed in, made on the spot, and a
   second after you stop everything that changed is written. The strip along the
   bottom says so.

### The nine modes

| mode | key | what is in the tray | what a held button does |
|---|---|---|---|
| Sculpt | 1 | every terrain brush that is not paint and not water: raise, flatten, smooth, pit, cliff, cave mouth, mountain, ridge, plateau, valley, terrace, roughen, erode | paints the brush along the drag. Shift turns it over: raise lays lower. A ridge and a valley are drawn between two clicks instead |
| Paint | 2 | a swatch per ground word the paint brush lays: grass, dirt, rock, sand, snow, mud, gravel, ash, cobble, path. The colour of each swatch is mixed out of the terrain material's own layers by that word's own `PAINT_MIX` row | paints that word over the ground |
| Foliage | 3 | grass first, then one tile per species `arbor.js` grows | grass is the paint brush pinned to the word `grass`, which is what `grass.js` grows blades on, and shift wears it back to bare dirt. A species scatters at the density the slider is set to, and shift rubs that species out of the ring |
| Objects | 4 | every rock kind, then every model in `FOOTPRINT` under three metres tall | a click puts one down, a drag scatters at the density, shift rubs out |
| Buildings | 5 | every model three metres and over, with **modelled** or **stand-in** in its corner | a click puts one down and takes hold of it. Drag to move, R to turn, brackets to size, Delete to remove |
| Creatures | 6 | every monster row and every critter `fauna.js` grows | scatters spawn points. The night toggle under the sliders decides whether they come up only after dark |
| People | 7 | every role in `npcs.js` and the story's own | a click puts one down and takes hold of it. The card names it |
| Markers | 8 | the seven marker kinds | a click puts one down and takes hold of it. The card carries the label and the note |
| Water | 9 | the lake brush | sinks a lake to the floor the slider is set to |

Not one of those lists is typed out in the editor. `palette.js` is a view of the
modules that own the things and `modes.js` only decides which tray a row goes
in, off the row itself: a brush with words is Paint, a brush with a `floor` knob
is Water, everything else is Sculpt. `editor.test.mjs` counts every tray against
`palette.js` both ways, so a species added to arbor or a model added to
`FOOTPRINT` is in a tray with nothing here to keep up to date.

### The sliders under the tray

A sculpt, paint or water tile shows **one slider per knob the contract gave that
kind**, at that knob's own range, with the value printed beside it. A mountain
reaches 600 m across and 400 m up because `terrain_edits.js` says 600 and 400.
A scattering tile shows **size** and **density** instead, and the density is
counted in things per 100 square metres, so the strip can say how many a sweep
will lay before you press. A placing mode shows no sliders at all, only what to
do next in words.

### The brush that is not a tile

`lower` has no square of its own, because shift on `raise` is `lower` and the
two take knob for knob the same slider. Any brush that is another brush turned
over AND takes the same knobs with the same ranges and defaults is hidden the
same way. A valley is not hidden, because a valley's defaults are not a ridge's.

### Spaces make themselves

Nobody names a space to start. A thing put down goes into the open space when it
falls inside that space's radius, and otherwise into the automatic space for the
256 m tile it landed in: id `tile_3_-2`, standing at the middle of that tile,
reaching 182 m, which is the tile's own half diagonal, so its corners are inside.
The space is made by the first thing that goes into it, and it is a space file
like any other: it passes `auditSpaces`, it is written to
`src/mmo/spaces/tile_3_-2.json`, the generated index picks it up, and the world
streams it exactly as it streams a named one.

The named spaces already on disk are still there. The small dropdown at the top
right opens one, and while it is open everything laid inside its radius goes
into it.

### The autosave

A second after the last change every space that changed is written, and the
stroke list with them when the ground has moved. Another change inside that
second pushes the write out another second, so a long sweep is one write and not
forty. The **Save** mark on the sidebar writes now. The bottom strip says
`unsaved` until it lands.

### The card

Clicking a thing already standing in Buildings, People or Markers takes hold of
it and a small card appears beside the sidebar: its name, its turn, its size,
and for a marker or a person its words, all editable, plus **remove**. Nothing
else in the editor is a form.

### The bottom strip

Mode, tool, the size and strength of what is in hand, the height and the
coordinates of the ground under the cursor, which space is open and whether it
is written, and the last thing the editor said. Every act says something: a
placement says what went down, where in the space's own frame AND where in the
world, and how many things stand there now. A refusal says why, and changes
nothing.

### The keys

| key | what it does |
|---|---|
| `L` | enter and leave the editor (dev mode only) |
| `1` to `9` | pick a mode, in the order the sidebar draws them |
| left click | put one down, or take hold of what is already there |
| left drag | paint, or sweep a scatter |
| `shift` and left drag | turn a brush over, or rub a scatter out |
| left drag on the selection | move it along the ground |
| right drag | turn the camera, brush or no brush |
| wheel over the world | widen and narrow the brush |
| `shift` and the wheel | how much the brush does, or how thick the scatter is |
| `+` / `-` | the same as the wheel, without one |
| `R` / `shift R` | turn the selection 15 degrees, right or left |
| `]` / `[` | make the selection a tenth bigger or smaller |
| `Delete` / `Backspace` | remove the selection |
| `ctrl Z` / `ctrl Y` | undo and redo. On a ground brush this is the GROUND's stack, a whole drag at a time; anywhere else it is the space's, a whole sweep at a time |
| `ctrl S` | write everything that has changed, now |
| `Escape` | let go of a half drawn ridge or of what is selected. With nothing held, leave the editor |
| left click, twice | on a ridge or a valley: where the line starts, then where it ends |

### How a drag is batched

A held brush lays a stroke every half radius along the drag and no oftener than
every 60 ms, so a sweep reads as one brush and not as a row of dots. The rule
lives in `DRAG_MS` and `DRAG_SPACING` in `editor.js` and both the terrain drag
and the scatter sweep go through it, so what the mouse does is what the test
drives. The end of a drag says how many strokes it laid, and one ctrl Z takes
the whole drag back.

### The one thing the screen no longer offers

`newSpace(name, radius, at)` is not on the screen any more, because a space now
makes itself where you paint. What it did is covered two ways: the tile space is
made for you, and the corner names it. What is NOT covered is choosing the id
and the radius before the first thing goes down; the id of an automatic space
stays `tile_3_-2` however it is named, and the call is still there on
`window.__bw.editor.newSpace(...)` for a place that wants its own file name.
Everything else `editor.js` can do is on the screen: open, reload, save, the
world floor, the reset, the space's name, note and reach, undo and redo for both
stacks, the brush knobs, the scatter, the selection and its four fields.

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
| `src/game/editor/palette.js` | new, pure. Every tray's rows, derived from the game's own tables; the brushes derived from `terrain.kinds()` through `brushRow` and `brushRows`. |
| `src/game/editor/modes.js` | ED4, pure. The nine modes, and which tray a palette row or a brush goes in. Nothing in it is a list of things to place. |
| `src/game/editor/icons.js` | ED4, pure. One drawn mark per mode, per brush and per tray, as inline svg. |
| `src/game/editor/editor.js` | new. `createEditor(ctx)`: every action, with no DOM. |
| `src/game/editor/ghost.js` | new. The thing under the cursor and the ring under that, plus `brushRing` at exactly the brush's radius and `lineGhost` sampled onto the ground. |
| `src/game/editor/panel.js` | ED4 rewrote it. The screen, the canvas listeners and the keys. It still registers as the window `editor`, because that is what owns the L key and the close-with-dev-mode wiring, and its frame is styled out of existence. |
| `src/game/editor/index.js` | new. One import for all of it. |
| `src/game/editor/editor.test.mjs` | new. 303 checks, 42 of them the real screen built over a fake document. |
| `src/game/hud.js` | ED4: `hud.setMode('editor' or 'play')`, which puts every child of the HUD root away but the dev badge and puts back exactly what was there. Nothing else in hud.js changed. |
| `tools/editor_save.mjs` | new. The dev only save endpoint and its path guard. |
| `vite.config.js` | new. The plugin, `apply: 'serve'`, and the 5198 port. |
| `src/game/win_dev.js` | the bench's Editor row, and the button that opens it. |
| `src/game/app/systems/ui.js` | two lines: `windows.register(editorPanel)`, and `input` on the panel context so the editor can take an Escape back out of the frame. |
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

`kinds()` is the whole vocabulary. The trays are one tile per kind and one
slider per param, at that param's own min, max, step and default, so a brush
that reaches 600 m gets a slider that reaches 600 m with nothing to change in
`src/game/editor`. A kind is a **line tool** when its params hold a `yaw` and a
`length`, or a second point (`x2`/`z2`, `tox`/`toz`, `ex`/`ez`); everything else
is painted with a held button. A kind whose row carries a `words` ARRAY becomes
the Paint tray, one swatch per word, and the word chosen is sent as both `word`
and `ground`, because
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

With nothing on `window.__bw.terrain`, the three brush trays answer **"the
terrain tools are not in yet: nothing answers window.__bw.terrain"** and change
nothing, while the six trays that need no contract are full as ever. With a
`stroke` but no `kinds()`, the trays show one line naming that half and no
tiles, and the seven of the first contract are still the only kinds `stroke()`
will pass. A `kinds()` that
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
- The brushes, against a fake `kinds()` of eleven kinds shaped exactly as
  `world.js` publishes them: every kind in the order the fake named them, each
  with the contract's own label, one slider per knob, the mountain's radius
  running 20 to 600 in steps of 5 from 300 and its lift 5 to 400 while raise
  runs to 200 and 60. A knob with no name is dropped, a knob whose max is under
  its min is pulled up to it, a duplicate kind is taken once. The paint brush's
  ten words become ten swatches, snow among them; the swatch reaches the editor
  and the next stroke carries `word: 'snow'` and `ground: 'snow'`.
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
- The world floor reads `mode()` and `base()` and shows them; the snow line
  slider sends `setBase` on release; the ground the whole world is made of is
  set from the swatch in hand and not from a field; Reset asks first (nothing
  dropped, the button says "press again"), does it on the second press, asks
  again nine seconds later rather than acting on a stale yes, and empties the
  editor's own drag stack so undo does not chase ground that is gone.
- The keys, fired at the real handler: 1, 3 and 9 pick the first, third and
  ninth MODE; plus and minus move a 20 m radius to 23 and back to 19.55; ctrl Z
  on a ground brush calls the ground's undo; a key the editor has no use for is
  left for the game.
- Every one of those with the contract absent, half present and thrown: no
  `window.__bw.terrain` gives one line of words and no tiles, a `stroke` with
  no `kinds()` names that half and still passes the original seven, a `kinds()`
  that throws is caught and said, and a `kinds()` answering a string leaves no
  brushes. The three brush trays fill themselves the moment a contract does
  answer, and the six trays that never needed one are full throughout.

ED4 added, all in node:

- **The screen is not a window.** Nothing is built into the window body, the
  five docks are the sidebar, the tray, the corner, the card and the status
  strip, and there are five text fields on the whole screen: the tray filter,
  the open space's name and note, and the card's two. Not one of them has to be
  filled in before anything can be done.
- **The sidebar** carries thirteen cells: nine modes then undo, redo, save and
  leave, each an inline svg with its name under it, the nine numbered 1 to 9,
  exactly one lit at a time.
- **The trays, counted both ways against `palette.js`.** Foliage is grass plus
  11 species; Objects is 104 rock kinds plus the 55 models under 3 m; Buildings
  is the other 39, and the two together are all 94 in `FOOTPRINT`, once each;
  Creatures is 106 monsters plus 7 critters; People 22, Markers 7. The sum of
  every tray is the sum of every palette. Sculpt, Paint and Water are the 11
  fake kinds split 7 + 10 words + 1, with `lower` and (in that fake) `valley`
  reachable by shift instead of by a square; against the REAL
  `terrain_edits.js` the same code gives Sculpt 13 tiles, Water the lake, and
  `valley` a square of its own, because its knobs are not a ridge's.
- **The automatic spaces.** `tileIdFor(800, -400)` is `tile_3_-2`, centred at
  896, -384, reaching 182 m, which is the half diagonal of a 256 m tile. The
  first thing put down makes it and says so; the second goes into the same one;
  one in the next tile makes that one and does not throw the first away; a
  named space still takes everything inside its own radius. The file passes
  `auditSpaces`, `safePath` accepts it, and `varOf` turns it into the valid
  identifier `sp_tile_3__2`.
- **The scatter.** A density of 5 over a 20 m ring is 63 things, and one sweep
  lays 63, every one inside the ring, with 58 different turns among them. One
  undo takes all 63 back and one redo puts them on. Shift rubs out exactly the
  63 of that species and leaves an oak standing beside a pine. A held sweep is
  batched by the same `DRAG_MS` and `DRAG_SPACING` a terrain drag is: a second
  pass one millisecond too soon is refused, one metre too near is refused, and
  three passes are ONE undo.
- **The autosave.** Nothing is due at the moment of a change or 999 ms after
  it; it is due at 1000 ms; a second change at 1500 pushes it to 2500 and it is
  not due at 2499. When it fires it writes the touched space once, at the path
  its id makes, and then nothing is waiting. Two spaces touched are two writes
  in one firing, and the ground is written with them when the ground has moved.
- **A click in Buildings** puts one down and takes hold of it in the same act,
  the card comes up with its turn, its size and where it is, the card's turn
  field really turns it, remove takes it out and leaves nothing selected, a
  second click near it takes hold rather than doubling it, and a click clear of
  it puts a second one down.
- `npx vite build`: 219 modules, clean, with only the two warnings the project
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
- the pointer path itself: the press starting a drag, each move feeding
  `dragStroke` or `sweepStroke`, and the release ending it. The spacing, the
  interval and the batching all live in `editor.js` and ARE measured; what is
  not measured is the lines of `panel.js` that hand the pointer to them, and
  that includes the rule that a click in a scattering mode puts down ONE thing
  while a drag sweeps, which is decided by whether the pointer moved;
- the wheel over the world changing the brush, and `stopImmediatePropagation`
  really keeping it away from `input.js`, which listens on the same canvas;
- the docks not swallowing the world's right drag: they take their own pointer
  events, so the canvas never hears a press over one, but that is an argument
  and not a measurement;
- Escape being taken out of the frame by `input.swallow` so that one press lets
  go of what is held and the next leaves the editor;
- the editor's own window frame really being invisible: the CSS rule is in the
  panel's stylesheet and is checked as a string, not as a rendered box;
- the brush trays against a real `window.__bw.terrain`. Every test above runs
  against a fake shaped like the contract, so the two halves meeting for the
  first time is still the reviewer's to see.
