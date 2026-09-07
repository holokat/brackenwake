# GW3: the Starting Island, a second world beside the Greenwold

Written 2026-09-08 by Fable. The user: "the map is too large and highly
disorganized... a smaller island with a dungeon entrance... a town, some
fields, some mining camps, some bandit and skeleton outposts... leave the
other area unavailable... plenty of monsters to fight... procedurally generate
the terrain too so it is not so empty."

## What it is

`scripts/sculpt-island.mjs` writes `public/terrain/island.json` and 23
`island_*` spaces. The island is about 1.2 km across in a sea, laid from a
shoreline function (a radius by bearing with a slow wobble, pulled in for the
bay on the south and pushed out for the headland on the east), a grid of
plateaus rising inland, two mountains, a ridge, a knoll and seven noise
strokes so no field is a table. The header says `world: 'island'`,
`wild: true` and `open: {x: 0, z: 0, r: 700}`.

On it: Haven (Hearthhome's plan turned to face the bay, a waystone on the
green) and its quay with a 28 m jetty whose end stands in the water; three
wheat fields and a pasture with hedges, gates and a stile; the Chalk Cut (the
pits' plan in the hill's south face) and the Shoulder Working on the second
hill; the Cutthroats' Camp (the Hollow's plan) in a 465 tree wood on the
western knoll; the Drowned Kings' Barrow on the headland, nine stones and
fourteen graves with skeletons by day and a wraith by night; the Old Cellars'
arch at the hill's east foot, a `kind: 'dungeon'` space with
`dungeon: 'oldcellars'`; five copses, a pond, a tarn, forty lone trees on the
downs; six lanes joining them, dragged paint strokes.

## The world switch, which is the only new machinery

- `TERRAIN_FILE` in `world_runtime.js` is the one line that picks the world.
  It is `/terrain/island.json`; the Greenwold is `/terrain/greenwold.json`
  and comes back by changing it. The editor saves to the file it loaded.
- Spaces belong to a world: the word before the first underscore
  (`sites.js` `spaceWorld`), read against the header's `world`. A tile
  carries the world it was painted in (`editor.js` writes it) and a tile
  without one is the Greenwold's. `spaces.test.mjs` drives both worlds both
  ways.
- Birth: `setSculptBirthFor(world, at)` in `zones.js`, registered by
  `spaces/index.js` for the island's town green as for Hearthhome's.
- The gate: `base.open` is a circle; `release.js` `setSculptOpen` takes it
  when the file loads and `openAt` answers from it, so the island's shore is
  the edge of the world and not the Greenwold's 2.2 km circle over the sea.
- The wild: `base.wild` lets `spawnsForChunk` (monsters) and `spawnsFor`
  (fauna) roll in a sculpt world. Measured in the browser at the town after
  fifteen seconds and a tour of four places: 103 alive, 755 spawned over 49
  chunks, no cap hit.
- The map: the painting and the twelve guide zones draw only when the world
  is the Greenwold (`win_map.js`, `minimap.js`); the island draws its own
  terrain.
- A placed door: `spaceSiteRow` carries `dungeon`, `dungeons.js` `specFor`
  reads it, and `input.js` already sends a click on a `kind: 'dungeon'` site
  to `enterDungeon`. Driven in the browser: the arch opens the Old Cellars
  layout (authored, 9 rooms, 1 level) and `leaveDungeon` comes back out.

## Measured

- Terrain: 830 strokes, 140 kB. 99 ha of land out of a 1.6 km square, 525 of
  the 10 m samples under the beach line. The hill tops out at 61 m. Every
  place dry except the jetty's end, which is meant to be in the water at 0 m.
- Spaces: 23; 104 pieces, 87 runs, 642 trees, 202 rocks, 65 placed spawns (30
  by night), 17 people. Every lane painted end to end.
- In the browser, dev fly camera: the town from the bay with the jetty and
  the sea; the chalk hill and the mine yard over the hill field; the wood with
  the camp's palisade in it; the barrow on the headland. 60 fps in the hidden
  tab, 0.9 to 1.6 M triangles in view.
- Tests: spaces 79, zones 180, world_runtime 183, win_map 367, minimap 177,
  release 5, field 156, dungeons 40, all green. The full suite is in the
  commit message.

## Found on the way

- Codex's committed pass (77cbe8c) made `dungeon.js` import
  `old_cellars_scene.js`, which did not exist, so no module above it loaded
  and the game would not start. A stub that furnishes nothing stands in.
- The zone banner still says "The Greenwold" on the island, because the
  realm circle at the origin is the Greenwold's and the header has no name.
  A `base.name` read by the banner is the fix; not written.
- Every building is still a stand-in body, as in the Greenwold.
