# V1: vertical. What the ground does now, and what stands on it.

Wave B, task V1. Written 2026-09-06 by the V1 builder.

**On the filename.** `WAVE-B.md` asks for `V1.md`. That name was already taken
by an older, unrelated note ("V1: the sky and the water", commit 3e386ec), so
this is `V1-VERTICAL.md` rather than an overwrite of somebody's work. The same
thing was done once before in this folder with `V4b.md`.

Owned files, and the whole of what was touched: `src/world/field.js`,
`src/world/zones.js`, `src/world/megalith_models.js`,
`src/world/terrain_material.js`, `src/world/chunks.js`, their tests, and a new
`src/world/megalith_models.test.mjs`.

Two things landed. Five realms are no longer the ground the noise made, and
every mega structure and every landmark in the sheet now has a body standing on
it: twenty seven of them, ten megaliths and seventeen landmarks, up from none.

---

## 1. Relief

`zones.REALM_RELIEF` declares it on the realm rows. `field.js` is the only file
that reads it.

| realm | kind | what it is | measured over the realm's own disc |
|---|---|---|---|
| Ember Wastes | `mesa` | flat topped tables 20 to 40 m up with cliff sides | 12% of it lifted, mean 2.0 m, up to 49.6 m |
| the Stormpeaks | `cliffs` | terraces of 15 and 30 m, and the Eyrie's plateau 60 m up | 48% lifted, mean 8.7 m, up to 60.0 m |
| the Ashen Throne | `crater` | a rim 80 m high ringing the throne at 1432 m, with one road up it | 11% lifted, mean 4.4 m, up to 80.0 m |
| Frostreach | `glacier` | a shelf that rises toward the rim | 98% lifted, mean 22.7 m, up to 50.3 m |
| the Sunken Kingdom | `karst` | sea stacks, only where the sea lets go of the shore | 2% lifted, up to 27.6 m |

### Why every wall is built out of a distance

A smoothstep over a noise field has a gradient nobody can bound: fbm's own
gradient varies threefold across this world (measured at a 520 m wavelength,
0.0052 per metre on average and 0.0171 at the worst), so the same band of noise
is a forty metre ramp in one place and a three metre cliff in another. A
smoothstep over a DISTANCE has a gradient of exactly `1.5 * height / run`
everywhere, because the gradient of a distance is 1.

So every table, terrace, plateau and crater rim is a disc or a ring, and one
number decides how steep all of them are: `field.RELIEF_GRADE`, 2.0 m of rise
per metre of ground, with `field.RAMP_GRADE` (0.34) for the one way up each of
them. A wall's run is its own height over the grade, so a 15 m terrace and an
80 m crater rim are exactly as steep as each other.

### The heart did not move

`field.test.mjs`'s digest of the 2 km square about the origin is **unchanged**:
`6408cb4e64daf869910a654e0737f570d78de706987ee244f8e55f76c265a521`, the number
taken before `zones.js` existed. Three things kept it there.

- `zones.heartFade` is exactly zero inside HEART_SAFE, so relief there is the
  number 0 and not a small number. Measured on a 20 m grid over the whole
  1500 m disc: worst difference 0.0e+0 m.
- Relief is laid on AFTER the rivers. Before them, ten metres of relief at
  2632, -4041 turned a 0.31 m step into a 12.43 m one, because the river block
  carves toward a fixed bed at -1.8 and fades itself out over height, which is
  a lever with a fifteen metre arm. Afterwards a river rides up with the ground
  it is cut into, and the river FLAG is dropped where the lift is over 3 m, so
  nothing downstream (the water sheet, the riverbed paint, a road's ford)
  claims water in a channel forty metres above the sea.
- A pad of zero is now no pad. `field.sampleAt` used to level a four metre disc
  under a site with `flatR` 0, which moved 0.057 m of hillside under the
  Standing Hedge. It does not run the pad code for one at all now.

The digest's last column names the site that SHAPES the ground rather than any
site at all, and `field.test.mjs` proves both halves of why that is honest: the
hedge lays no pad (48 probes out to 20 m, worst 4.4e-16 m off the raw ground,
against a padded town that lifts its own ground 15.70 m), and the cell it took
would have rolled nothing anyway (cell 0,1 rolls 0.8801 against the 0.62 the
roll needs; cell 0,-3 rolls 0.3631 and holds a camp, so the measurement means
something).

**A second digest** guards the relief itself: the difference between the world
with relief and the world without it over a 2 km square about the Ember Wastes'
centre, taken from `raw` so that no site anyone else places can move it.

### Nothing got steeper than the mesher can show

The worst 1 m step in the whole 15.6 km square is **6.94 m**, at -205, 2468,
and it is **6.94 m with relief switched off as well**: relief is never the
steepest thing anywhere. 200,000 probes, none over the 8 m bound.

### Sites do not wake up halfway down a cliff

Every authored site holds the relief level right across its own pad and fades
it out over `field.RELIEF_HOLD` (34 m) past the pad's rim. Measured over the 44
authored sites in a relief realm: worst spread across a pad 0.0e+0 m. The hold
is over the WHOLE relief and not one realm's share of it, because realms
overlap: the Legion Pass stands in the Stormpeaks and inside Frostreach's shelf
as well, and a per realm hold left a metre of shelf tilted across the camp.

### The climbs are ground

I chose **baked relief**, not a `runtime.megalithHeightAt` hook. `heightAt` is
the whole of both climbs and **no wiring is needed for them at all**.

| climb | rise | worst step per metre | the face beside it |
|---|---|---|---|
| the Eyrie's landing steps | 8.3 m to 75.4 m over 175 m | **1.017 m** | 3.021 m, a wall |
| the Ashen Gate's road up the rim | -14.0 m to 88.7 m over 468 m | **0.717 m** | 2.998 m, a wall |

against a 1.2 m walking step. And every table in the Ember Wastes has one way
up: 56 of 56 sampled table tops are walkable from some bearing (worst easiest
way up 0.69 m a metre), and 56 of 56 have a side you cannot climb, or they
would be hills and not tables.

### Roads still grade on it

`roads.test.mjs` was not taught about relief, so `field.test.mjs` measures it:
8 roads cross a realm with relief, 3 of them the Ember Wastes, and every one
meets ROAD_GRADE at every 4 m sample. The three mesa roads:

```
7,-11>8,-12   worst 0.187 over 696 m
7,-11>8,-11   worst 0.163 over 469 m
8,-11>8,-12   worst 0.254 over 561 m      against ROAD_GRADE 0.5
```

and all three are smoother than the ground 12 m off them, so the grading is
doing work rather than being handed easy ground.

### A road at its faintest is still painted as a road

`chunks.colourAt` now floors the road tint at `ROAD_TINT_MIN` (1/512, half of
one step of an 8 bit channel). At the outermost verge the field's own road
strength can be 3.4e-7, which lerps a float colour by less than a millionth and
reads as "not painted at all" to anything measuring it: `roads.test.mjs` found
exactly one such vertex, at -2832, -930. Under what an eye can see, over what a
test can miss.

### A face is painted as stone

`terrain_material.CLIFF_SLOPE` (0.78, about 51 degrees) is the line, and
`chunks.colourAt` now reads the slope the normal just measured. The bug it
fixes: the layer weights already put rock on a steep vertex, but the vertex
colour is a tint OVER those layers, so a thirty metre mesa wall came out as
sand coloured stone. Measured on the real field at 4200, -4400 (slope 0.84):
the wall is 0.025 from the rock colour and the table top 32 m away is 0.104,
and the layers agree (wall rock 0.95, top rock 0.04).

### Cost

- `sampleAt` **1.51 us**, against 1.49 before relief. The budget is 12.
- A 33 x 33 chunk over the Ember Wastes builds in **3.71 ms** cold, against
  2.39 ms with relief off and 2.50 ms over open country. The budget asked for
  is 12 ms; three of them in a frame is 11.1 ms against the 16 ms frame.

---

## 2. Megaliths and landmarks

`zones.SITE_KIND` gained `megastructure` and `landmark`, so `authoredSites()`
hands them to `site_models.buildSiteMarker`, which already had the hook.
`megalith_models.js` replaces the stub.

**There are 73 authored sites now, up from 46**: ten mega structures, seventeen
landmarks, and the forty six that were there. The eleventh mega structure is
the Red Queen's Harbour, which `zones.EXTRA_SITE` builds as a town, so T1 makes
it and `megalith_models` is never asked for it. `EXTRA_SITE` is consulted
before `SITE_KIND` now, which is what keeps the seven town precincts at seven.

Every body is merged, tagged with its site on every mesh, and footed on the
real height field. None is over 6 draw calls or 6,984 triangles; 1,393 pieces
become 96 draw calls across the twenty seven. The heaviest and the largest:

```
Ninefall                 3 draws   6984 tris    97 m across
The Steaming Shore       3 draws   2376 tris   136 m across
The Standing Hedge       2 draws   1080 tris  1610 m across
The Brass City           6 draws   1080 tris   109 m across
The Obsidian Bridge      1 draws    768 tris   166 m across
The Ashen Gate           6 draws    598 tris    71 m across
```

All ten mega structures are at least 40 m across or up.

`auditMegaliths()` drives it both ways: every megastructure and landmark in the
sheet has a body, and every body answers a place that exists.

### Pads

`zones.SITE_FLAT_R` gives each of the twenty seven its own pad, and most of
them are 0: a bridge, a shelf, a mirage, a ring of stones and a tower rising
out of the sea all stand on the ground as they found it. Fifteen of the
seventy three lay no pad at all. `zones.FLAT_R` carries defaults
(`megastructure: 10`, `landmark: 6`) so a place added tomorrow gets one.

### The heart's exception

`auditZones` used to forbid any authored site inside HEART_SAFE. The rule is
now the PAD and not the distance, in one exported predicate,
`zones.heartAllows`, driven both ways in `zones.test.mjs`: pad-less at 837 m
allowed, an 8 m pad at the same point refused, a 120 m precinct at 5 km
allowed. The Standing Hedge is the only site in the heart and it lays nothing
down.

### The four that stand in the water

`zones.STANDS_IN_WATER` names the Drowned Coliseum, the Glow, the Air Gardens
and the Drowned Bell Tower. Those four are wet on purpose, because their own
sentences put them on the sea floor. `zones.test.mjs` drives it both ways: the
four the table calls drowned really are, and every one of the other sixty nine
stands on dry ground (the lowest at 0.99 m).

---

## 3. Places that moved, and why

Twenty two rows of `zones.LAYOUT` moved. Not one of them is a hub, a town, a
hamlet, a dungeon, a mine, a cave, a ruin, a shrine or a camp: every one is a
mega structure or a landmark, and every one moved because it had never had a
body on it before and so had never been checked for one.

- **The Mill Run**, from -647, 889 to -1660, 780. It stood 1100 m from the
  origin, inside the heart AND inside the cell a rolled cave already held:
  giving it its water mill would have taken that cave's mound out of the ground
  a save is standing on. It now stands on a river bank 16 m from the water.
- **Ninefall**, 280 m west. The nine skeletons lay on mud at -0.4 m, which
  reads as a tideline.
- **The Reef Stair and the Drowned Coliseum**, swapped. The sheet says the
  stair climbs out of the sea ONTO A REEF and that the Coliseum is an arena ON
  THE SEA FLOOR; the table had the stair in eighteen metres of water and the
  arena dry on a reef. They have only exchanged cells.
- **The Brass City** (152 m) and **the Obsidian Bridge** (242 m), off ground
  that no walk from the rest of the realm reaches.
- **Sixteen more**, 15 to 185 m each, so that every pad fits inside the cell
  that owns it. `field.sampleAt` asks a point's own cell and nothing else, so a
  pad that crosses a border is a pad cut off square at the border.

Every one of the seventy three is now dry (or one of the declared four), out of
a river, inside its own realm, alone in its cell, with its pad inside that
cell, and within 100 m of the walk that starts at the origin.

---

## Wiring Fable has to do

**Nothing at all is needed for the climbs, the relief, the roads or the ground.**
Three lines are needed for the map, and one for two very wide bodies.

### 1. `src/game/win_map.js`, the two new kinds

`auditMapWords()` walks the keys of `zones.ARTICLE` at import and refuses to
load unless every one of them has a colour in `SITE_COLOUR` and a word in
`KIND_WORD`. V1 does not own `win_map.js`, so the two new kinds wait in
`zones.EXTRA_ARTICLE`; today the map draws them in its fallback grey and the
places list calls them by their raw kind. To finish them:

In `src/world/zones.js`, move the two rows of `EXTRA_ARTICLE` into `ARTICLE`
and delete `EXTRA_ARTICLE` and the second lookup in `articleFor`.

In `src/game/win_map.js`, `SITE_COLOUR` (about line 93), add:

```js
  megastructure: '#cfc0e8', landmark: '#9fd8c0',
```

and in `KIND_WORD` (about line 123), add:

```js
  megastructure: 'mega structure', landmark: 'landmark',
```

`win_map.test.mjs` already checks that every ARTICLE key has both, so it will
hold the pair together from then on.

### 2. `src/world/sites.js`, so a mile wide body stays alive

The Standing Hedge is a ring of stones 1610 m across and the Obsidian Bridge an
arch 214 m long, both wider than the radius the marker system keeps a body
alive over: standing between two stones of the hedge you are 805 m from the
site's centre and it is not built. `zones.BODY_R` puts the number on the row as
`bodyR`, and `megalith_models.test.mjs` proves the geometry agrees with it. In
`sites.sitesNear`, replace:

```js
    if (s && Math.hypot(s.x - x, s.z - z) <= radius) out.push(s);
```

with:

```js
    if (s && Math.hypot(s.x - x, s.z - z) <= radius + (s.bodyR || 0)) out.push(s);
```

`bodyR` is 0 on every other site in the world, so nothing else changes.

### 3. Nothing for `world_runtime.js`

`runtime.heightAt` already reads the field, the field already carries the
plateau, the crater rim and the graded way up each of them, and
`field.test.mjs` measures both climbs metre by metre. There is no
`megalithHeightAt` and none is wanted.

---

## Two failures that are not V1's, measured

### `src/world/sitegrid.js` moved the heart, and has since been fixed

While V1 was in flight, A3's `sitegrid.js` gated its new wild kinds on the SITE
CENTRE being outside HEART_SAFE. A cell that holds a digest sample point can
have its site centre outside that radius, so the digest changed. Isolated at
the time by running the same digest over four trees: HEAD alone gave the
promise, HEAD with A3's `roads.js` gave the promise, HEAD with A3's
`sitegrid.js` alone gave `bb3676866320b977`, and HEAD with V1's own two files
gave the promise. It is green again on the current tree; the isolation is
recorded here because the same gate can be got wrong the same way twice, and
the rule it wants is about the CELL and not about the site's centre.

### `roads.test.mjs` failed one check for a while, and it was not V1's

For part of this task `roads.test.mjs` reported:

```
FAIL road falls off from centreline to verge, on every road
     -5,-3>-6,-3   1.000 1.000 0.696 0.317 0.038
```

The check asks that stepping 3 m off a road's centreline reads road 0; at that
point another road passed within a verge's width and read 0.038. Measured at
the time on HEAD plus A3's `sitegrid.js` and `roads.js` and no V1 at all, the
same check failed on TWO roads (`2,-11>2,-12` as well); with V1 in, on one. The
cause was A3's denser settlements putting two roads together at a junction, not
relief. It is green on the current tree (38 passed, 0 failed) and is recorded
here only so that nobody spends an afternoon on it if it comes back.

---

## What is not verified

- **Nothing has been looked at in a browser.** Every number here is from node.
  The bodies are measured for draws, triangles, span, footing and tagging; how
  any of them LOOKS is unverified, and the tour stop for each of the twenty
  seven is one press away on the dev bench.
- **Flora grows among the Standing Hedge's stones.** `flora.clearingOf` clears
  `flatR + 6` around a site's centre, and the hedge's stones are 805 m from it,
  so a tree can stand where a stone stands. Not fixed: `flora.js` is not V1's.
- **The karst stacks are green on top.** A stack rises out of the water and its
  crown reads as meadow rather than as rock, because the biome chain has no
  rule for a small pillar. The sides are painted stone by the slope rule; the
  tops are 5 to 17 m across and were left.
