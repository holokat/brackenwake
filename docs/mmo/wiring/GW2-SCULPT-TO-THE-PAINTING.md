# GW2: the Greenwold sculpted to the painting, at the size it plays at

Written 2026-09-07 by Fable, after the user said the zone felt too huge and
then asked for the whole zone to be sculpted for them: elevation, lakes, and
every area made to look like the painting.

## What changed

**The realm is 2.6 km across, not 4.4.** `GUIDE_FRAME` in
`src/mmo/greenwold_guide.js` is the one number. At 4.4 km the twelve spaces
stood 1 to 2.5 km apart on flat grass; at RUN_SPEED (18 m/s) the village to
the mill was 140 s of nothing. Now the village is 335 m from the nearest
ring stone (19 s), 770 m from the chapel's water (43 s) and 1.5 km from the
mill (83 s). `FRAME_SCALE` multiplies every zone radius in the guide's
tables, so the rough boundaries shrank with the ground. Plans did not: a
cottage is still 7 m wide.

**Everything traced off the painting is in sheet fractions.** The sculpt
script (`scripts/sculpt-greenwold.mjs`) used to carry hills, fields, copses
and lanes as absolute metres, which the frame change would have scattered.
Every one of those tables is now `(u, v)` on the sheet, turned into metres
through `imageToWorld`, so the realm can be resized again with the same one
number. The Standing Hedge ring was re-measured off the stones in the
painting: centre (0.61, 0.42) and 800 reference metres, which is 473 m at
this frame; it had been 1000 at (0.61, 0.47), which put its middle south of
the river.

**The country between is what the painting shows.** Traced and laid:

- 23 hill strokes: the chalk escarpment from the west edge to the top of the
  sheet with the Chalk Pits cut into its face (the pits' yard is now at 30 m,
  up the flank, where it was at 6 m in a meadow), the north downs over the
  mere, the Hollow and the Kingsroad, the east and south rims, the west ridge
  under the beech wood. The highest peak is 61 m, the lowest hill 23 m.
- Eleven fields as rectangles read off the sheet corner by corner (eight
  wheat, three pasture), where there were eight squares placed by eye.
- Four woods as polygons on a jittered grid, cut into 260 m spaces so the
  streamer can stand one at a time: the Beech Hangar (2,478 trees in 15
  spaces, the whole south west of the sheet, not a copse round the plan),
  the North Wood behind the mere (1,000), the Hollow Wood round the
  highwaymen (431) and the East Wood (618). Eight copses.
- The ring lane through the nine stones, the lane north to the chapel, the
  lane up to the pits, the track off the Kingsroad into the Hollow, and the
  three lanes that were there re-traced.
- A tarn at the river's head in the chalk valley, so the river comes from
  somewhere; the mere at the chapel re-made as five overlapping lakes with
  bays at a level a hand under the turf (it had been one disc five metres down
  a crater); the river's banks widened from 8 to 14 m of slope.
- The white face of the escarpment painted in sand and rock along its line.

**Two bugs found by walking it.**

- The script rotated Hearthhome so its bridge deck was square to the river,
  as if the deck ran along the plan's x axis. The bridge piece has its own 45
  degree yaw, so the river crossed the deck at an angle, cut eight wall runs
  and drowned the hay rick. The turn now includes `BRIDGE_YAW`; zero runs are
  dropped and the gate is 15.5 m from the centreline on dry ground.
- The load toast said "no hills, no rivers, no roads" over a realm with 23
  hills and a river, because the words were written once for a blank canvas.
  It now counts the strokes it loaded.

**Roads are dragged strokes.** A `ground` stroke may carry `x2, z2` and is
then a capsule (`paintDist` in `terrain_edits.js`), one per forty metres of
road instead of a disc every three. The index held 3,447 paint rows for the
roads alone; it holds 829 now, the field's sample cost fell from 3.9 to 2.2
us on a road, and the minimap's 4 ms repaint budget is met with margin.
`terrain_edits.test.mjs` (GW2 block) proves the capsule paints its ends and
not six metres off its side, that half a far end is dropped, and that the
file round trip keeps the far end. The editor still paints discs.

**Birth is the green.** `birthplaceFor` in a sculpt world returns
Hearthhome's centre plus six metres, registered by `spaces/index.js` through
`setSculptBirth`, instead of tile 0 0, which is now open ground inside the
ring. A blank canvas with no village still births at 0 0.

**Tree clicks after a refill.** `flora.js` drops an InstancedMesh's cached
bounding sphere when it refills the instances; three caches it on the first
raycast and never recomputes, so every tree in a chunk the streamer had
refilled was unclickable. Found by the world_runtime tree pick check, which
now also aims at a near band tree from twelve directions.

## Measured

From `node scripts/sculpt-greenwold.mjs` (seed 20260907):

- 1,712 strokes (683 skeleton plateaus, 66 corridor, 65 river ribbons, 829
  paints, 23 mountains, 2 ridges, 6 lakes and ponds), 320 kB.
- 76 spaces: 275 pieces, 140 runs, 5,524 trees, 2,141 rocks, 22 markers, 20
  people, 126 spawns; 974 kB. Closest two trees 7.0 m.
- Every one of the twelve centres dry except the chapel, which stands in 8 m
  of water with its bell out; 34 of 34 river points wet, none wet twenty
  metres off the line, the surface never rises downstream, 44 m of fall.
- Every road painted end to end (three misses are lane samples under the
  cobbled Kingsroad where they cross, which is what a crossing should read).
- Sample cost 2.19 us median anywhere, inside the 4 us budget.

From `node scripts/render-greenwold.mjs` (painting left, sculpt right, per
zone): the hills, woods, fields, lanes, ring, river and mere sit where the
painting draws them. The zone crops were read side by side for all twelve.

In the browser (dev fly camera, `window.__look`): the walled village with the
river along its south wall and the bridge at the gate; the mill on the leat
with the hangar behind; the hangar as a wood you cannot see through; the
pits' pale face above the chalk field; the mere; Coldwake's hedge and six
cottages; the Kingsroad camp; the water meadows' willows and ponds; the Long
Meadow's oaks; the cellar arch on the north bank; the Hollow's camp in its
wood. Frame time at the village after streaming, 240 frames: median 2.2 ms,
p90 3.1 ms.

## Not done, and known

- The chalk face reads as a pale dome, not a scarp; a sharper cliff wants
  hand work in the editor.
- Every building is a stand-in body; docs/concepts/greenwold/STRUCTURES.md
  and the codex's Greenwold structures page list the 78 to make.
- The wheat rows seen from forty metres up are dark slivers; the dressing
  body is unchanged.
- The overlap audit lists space pairs over a quarter (the hangar core inside
  its own wood cells, the Hollow inside its wood, the Long Meadow against the
  Meadow Field); all are meant, and are measured, not hidden.
- A rerun of the script overwrites the terrain file and every greenwold_*
  space; the editor's hand edits do not survive it.
