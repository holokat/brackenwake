# ED4: water is placed, never fallen into

The complaint, in the user's words:

> why does Valley create an ocean floor? we should have separate controls for
> water, river, lakes etc

## What was wrong

A sculpt world (ED3, `docs/mmo/wiring/ED3-SCULPT.md`) stands flat at
`base.height`, which is 6 m, and `field.sampleAt` called a point water wherever
the ground fell under `SEA_LEVEL - 0.05`, which is -0.85 m. That is the
generator's rule and it has to be: the generator digs its own ocean, its own
caldera and its own river beds, and nothing downstream knows where they are, so
height is the only thing that can say.

A person sculpting by hand is in exactly the opposite position. They know where
they want water because they are going to put it there. Under the old rule every
downward brush they had was a flood switch: a `valley` 20 m deep, a `pit`, a
`lower` stroke and the foot of a `mountain` at -50 m all filled with sea the
moment they crossed the line, the terrain material drew them as ocean, grass and
trees refused to grow on them, and there was no way to say "this is a dry
canyon". The `lake` brush was the same rule turned around: a pit whose floor was
set below sea level so that the global water plane would fill it.

## The rule now

**In a sculpt world no height makes water. Water is five brushes.**

There is one exception, and it is an opt in: `base.sea` in the header still
means "give me the generator's coast", and a world that asks for that gets the
continent mask, the shore, and flooding by height along with it. Left false,
which is the default for a blank canvas, nothing floods but what somebody drew.

`base.snowLine` and `base.beachLine` are unchanged and are ground word bands:
the beach line paints sand, it does not put water anywhere.

## The five brushes

All five live in `src/world/terrain_edits.js`, are named in `WATER_KINDS`, and
come out of `window.__bw.terrain.kinds()` with their knobs, which is how the
editor's Water tray builds itself (`src/game/editor/modes.js` reads
`WATER_KINDS`, so a sixth brush lands in the tray with nothing to change there).

| kind | knobs | what it does |
| --- | --- | --- |
| `lake` | `r`, `level`, `depth` | a disc of water with its surface at `level`, which digs its own bed `depth` below that where the ground stands higher |
| `pond` | `r`, `level`, `depth` | the same brush, smaller: r 8 m and a 2 m bed |
| `river` | `width`, `depth`, `level`, `levelEnd`, `x2`, `z2` | a ribbon from the stroke to (`x2`, `z2`), its surface `level` at the head and `levelEnd` at the mouth so it runs downhill, its channel cut `depth` under the surface with the same banks a pit's wall has |
| `sea` | `r`, `level` | a large disc at a level, 0 by default, that cuts **no** bed. For a coast somebody has already sculpted |
| `drain` | `r` | water gone inside r. Moves no ground at all |

Defaults: `lake` r 24 m depth 4 m, `pond` r 8 m depth 2 m, `river` 12 m wide and
2 m deep, `sea` r 400 m at level 0, `drain` r 24 m.

The `level` slider defaults to 6 m, which is `DEFAULT_BASE.height`, the height a
blank sculpt world stands at, so one click on the flat lays a lake at the ground
you clicked and digs its own bed under it. Called from a script with no `level`
at all, `lake`, `pond` and `river` take the ground at the point instead. A `sea`
with no level takes 0, because 0 is what "sea level" has always meant here.

`river` is the one water brush drawn between two clicks: it carries `x2` and
`z2`, `palette.js` sees the pair and marks the row `line`, and the editor fills
them in from the second click. The others are held brushes like any other.

`window.__bw.terrain` grew three things beside `kinds()`, none of which the
editor needs but all of which a person poking at a world does:

```js
terrain.waterKinds          // ['lake','pond','river','sea','drain']
terrain.water()             // every body, exactly as water.js draws them
terrain.waterAt(x, z)       // { water, level, ground } at a point, off the field
terrain.syncWater()         // make the scene match the list again, by hand
```

### The rules every one of them obeys

- **A body only covers ground it is higher than.** `waterAt(x, z, h)` answers
  true where `h < level`, so the bank of a lake is where the bank rises back
  through the surface, and a coast is a coast, without anybody drawing an
  outline.
- **A bed only ever digs.** The cut is clamped at zero, so a lake laid over a
  gorge leaves the gorge, and the rim is C1 with the world outside it because
  the cut is exactly 0 there from either side.
- **Order decides.** The walk is the cell's stroke list in the order the strokes
  were made, exactly as `heightDelta`'s is: a drain over a lake is dry, and a
  lake drawn over that drain is wet again.
- **A drain can take the generator's water too.** `waterAt` is handed what the
  world said before the strokes had their say, so a drain in a generated world
  removes the ocean there.
- **Painted ground under placed water stays painted.** A sand bed under a lake
  somebody dug keeps its word and its biome. The generator's own ocean still
  wins over paint, which is unchanged.
- **Chaining.** A `river` whose head lands within `RIVER_CHAIN` (6 m) of another
  river's mouth takes that river's `levelEnd` as its own `level` and its head is
  snapped onto the joint, so a river drawn in several strokes is one river with
  no step in it and the water keeps running the same way.

## Where every piece lives

```
src/world/terrain_edits.js   WATER_KINDS, the profiles, waterAt(), waterBodies()
src/world/field.js           sampleAt: no height makes water in sculpt;
                             sample.water and sample.waterLevel
src/world/water.js           setBodies(): one surface per body, at its level
                             setGlobalPlane(): the endless sheet, on or off
src/game/world_runtime.js    onRebuild(): the one place that says ground moved
src/game/app/systems/world.js syncWater(): hangs those two together
                             strokeWords / placedWaterWords / dryFloorWords
src/game/editor/modes.js     the Water tray, read off WATER_KINDS
```

### The field

```js
let water = (!SCULPT || SCULPT.sea) ? h < SEA_LEVEL - 0.05 : false;
let waterLevel = null;
if (EDITS && EDITS.wet) {
  const w = EDITS.waterAt(x, z, h, water);
  water = w.water;
  waterLevel = w.level;
}
```

`EDITS.wet` is a plain boolean kept by the stroke list, for the same reason
`EDITS.live` is: this runs on every vertex of every chunk, and a world with no
water in it must pay one property read to find that out.

`sample.waterLevel` is new: the surface of the body somebody placed, in metres,
and null everywhere else including the generator's own ocean, whose one number
is `field.seaLevel`.

### The renderer

`water.js` used to draw one plane at sea level and nothing else. It still does
that in a generated world, unchanged. In a sculpt world:

- `setGlobalPlane(false)` takes the endless sheet away. **This is not a tidy
  up.** Leave it on and a pit dug to -10 m has the ocean at the bottom of it,
  which is the original complaint still there in the picture after the field
  stopped saying it.
- `setBodies(list)` builds one mesh per row of `edits.waterBodies()`, keyed by
  the stroke's own id. A disc of rings and segments for `lake`, `pond` and
  `sea`; a two vertex per station ribbon for `river`, whose surface height is
  baked into the geometry's own y so it can fall from head to mouth. All of them
  in world coordinates with the mesh at the origin, because `PLANE_VERT` reads
  `modelMatrix * position` and a sloping surface cannot live in a uniform.
- They wear the same shader as the ocean and share its uniform slots, so the
  sky, the refraction pass, the depth shading and the foam are one piece of code
  and not two. A lake and a pond get the swell turned down; a river gets
  `riverMaterial` with the flow pointing the way it runs.
- Vertices stand about `WATER_STEP` (4 m) apart, capped at 48 rings by 192
  segments for a disc and 400 stations for a river. **The trade, stated:** at 4 m
  the four longest of the six Gerstner waves are resolved and carry 92% of the
  amplitude; the two shortest are under the sampling limit and show as the
  fragment shader's own ripple detail instead of as displacement.
- A `drain` cuts triangles out of the surfaces laid before it, by centroid.
  **The limit, stated:** the hole is accurate to one triangle, which is about
  four metres. It is a real hole in the real surface, not a clean circle.
- `waterBodies()` gives a body only the drains that actually reach it, so one
  drain click rebuilds one mesh and not every surface in the world.
- The refraction pass does not run at all when the sheet is off and there are no
  bodies, because a second whole scene render a frame for water that does not
  exist is a real cost for nothing.

### The seam

The water is built in `app/systems/world.js`, but water somebody placed is a
function of the stroke list, so it has to be rebuilt on exactly the events that
rebuild the ground. Every one of those goes through `rebuildAround` or
`rebuildAll` in `world_runtime.js`, so that is the seam and there is one of it:

```js
// world_runtime.js
function fireRebuild(what) { if (rebuildFn) rebuildFn(what); }
// ... called at the end of rebuildAround and rebuildAll, and nowhere else
onRebuild(fn) { rebuildFn = fn; }

// app/systems/world.js
function syncWater() {
  const sculpt = runtime.field.sculpt;
  water.setGlobalPlane(!sculpt || !!sculpt.sea);
  return water.setBodies(runtime.terrainEdits.waterBodies());
}
runtime.onRebuild(syncWater);
syncWater();
```

That covers a stroke, an undo, a redo, a reset, a header change and a file
landing, because all six of them rebuild ground. `wiring.test.mjs` checks all
four of those lines by name: each of the three halves is green on its own, and
the bug this is guarding against lives in the seam between them.

## The words

Every water stroke returns a sentence, and so does every downward brush that
crosses the old water line.

```
sank a lake 48 m across at 400, 0, its surface at 6.0 m and its bed at 2.0 m,
4.0 m under it, and the water there stands 4.0 m deep, 4 chunks of ground rebuilt

cut a river 12.0 m wide and 200 m long from 0, 0 to 0, 200, its surface falling
from 6.0 m to 2.0 m, its bed 2.0 m under it, and the water there stands 2.0 m deep

laid a sea 800 m across at 0, 0, its surface at 0.0 m, cutting no bed: it floods
the coast you sculpted and nothing else, but no water stands at that point: the
ground there is 6.0 m and the surface you asked for is 0.0 m

cut a valley 20.0 m deep and 200 m long from 1200, 0, bearing 0 degrees, and the
floor is 13.2 m under the old sea level, and stays dry: water is its own brush
```

`placedWaterWords` and `dryFloorWords` are pure and exported, and the sample
they read is taken off the real field after the stroke, so a `sea` laid on
ground that stands above its own surface says out loud that it put no water
anywhere rather than looking like a broken button. A river drawn uphill says so
too. 13.2 and not 14: the line the world flooded at was `SEA_LEVEL - 0.05`,
which is -0.85 m, and the words quote the real line.

## Loading a file written before ED4

A `lake` written before ED4 carries an absolute `floor` and no `level`.
`makeStroke` reads it as a surface at the old sea level (0 m) with the same bed
under it, and drops `floor` so nothing downstream can read two truths. The bed
lands exactly where it was; the water is now a placed body rather than a hole in
the global plane. Driven in `terrain_edits.test.mjs`.

## What was measured

Every number here was taken by a committed test, not by hand.

| claim | measurement | where |
| --- | --- | --- |
| a valley 20 m deep on the flat is dry at every sample | 1,491 samples through `field.sampleAt`, deepest -14.00 m, 0 wet, 0 called ocean | `field.test.mjs` 10j, `world_runtime.test.mjs` 8d |
| the same for `lower` and `pit`, and a plateau to -50 m | 0 wet of 1,491 samples each; the plateau reads -50.0 m and biome beach | `field.test.mjs` 10j |
| driven the other way, a generated world still floods | the same pit at 1480, -2360 comes out water, biome ocean | `field.test.mjs` 10j |
| and so does a sculpt world with `sea: true` | a 30 m pit at the origin is water | `field.test.mjs` 10j |
| a lake at level 6 on flat ground at 6 has water and a bed 4 m down | bed 2.00 m, surface 6 m, water true, biome ocean; the rim at 24 m is 6 m and dry | `field.test.mjs` 10j |
| a river from A to B carries 6 m at A and 2 m at B, and the water follows | head 6 m over a bed at 4 m, mouth 2 m over a bed at 0 m, linear between, dry 20 m off the line | `field.test.mjs` 10j, `terrain_edits.test.mjs` 12g-v |
| a chain takes the level and snaps the joint | level 2 m taken from the stroke before it, head moved onto the mouth; a river starting 60 m away does not chain | `terrain_edits.test.mjs` 12g-vi |
| a drain removes it | water true then false at the same point, ground unmoved to the last bit, still wet 30 m out | `terrain_edits.test.mjs` 12g-viii |
| a sea at level 3 floods a 400 m disc | over a coast sunk 12 m first, 380 of 400 points inside 400 m are water at 3 m | `field.test.mjs` 10j |
| a sea moves no ground | worst 0 m over 400 points, `maxGrade` 0 | `terrain_edits.test.mjs` 12g-vii |
| `sampleAt` cost with 200 water bodies is under 4 us | 0.333 us a sample over 10,000 points, 1.9 bodies covering an average point | `terrain_edits.test.mjs` 18 |
| a rebuild of one lake touches only its chunks | 4 chunks of the 361 loaded | `world_runtime.test.mjs` 8d |
| and only its own mesh | a drain over one river rebuilds 1 body and keeps 2; a stroke 5 km away rebuilds 0 and keeps 3 | `water.test.mjs` |
| the ribbon's geometry | 51 stations over 200 m (102 vertices), worst 0 m off the interpolated level, worst 0 m off 12 m bank to bank, every triangle facing up | `water.test.mjs` |
| a sculpt world draws no global plane | `water.globalPlane` false, and the refraction pass does not run until a body exists | `water.test.mjs`, `world_runtime.test.mjs` 8d |
| the generate mode digest did not move | the heart digest and the relief digest both unchanged | `field.test.mjs` |
| the sculpt digest did not move | unchanged: a blank world has no water either way | `field.test.mjs` 10i |
| every slider does something | all 53 sliders over 20 brushes, judged on the height OR the water they move | `terrain_edits.test.mjs` 13 |
| the Water tray lists the five | `lake,pond,river,sea,drain`, none of them in Sculpt, and `river` marked as a line | `editor.test.mjs` |

## What is not verified

- **Nothing was looked at in a browser.** Every claim above is a node
  measurement or a source check. The shader itself was not compiled: the
  materials, the uniform sharing and the geometry were driven with real THREE
  objects in node, and the fragment shader was not run on a GPU. How a lake at
  a level actually looks against the terrain, and whether a river ribbon reads
  as moving water, is for the reviewer.
- `syncWater` is checked by name in `wiring.test.mjs` and its two halves are
  driven separately, because `app/systems/world.js` `create()` needs a WebGL
  context. The seam it hangs on (`onRebuild`) is driven for real.
- The drain's hole is triangle accurate, as above. A drain that cuts a body in
  two leaves two islands of one mesh, which is right, but nothing measures how
  that looks.
- `OPPOSITE` in `palette.js` still pairs `lake` with `mountain`, so shift on the
  lake brush lays a mountain. That was there before ED4 and now reads oddly, now
  that the two are in different trays. `palette.js` was out of scope for this
  change.
