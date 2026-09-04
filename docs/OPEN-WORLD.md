# The endless world

How Brackenwake's world is made, what each module owns, and the rules that
keep it honest. Read this before touching `src/world/`.

## The one rule

**The world is a function of the seed.** `world = f(WORLD_SEED, x, z)`. Nothing
is stored about the ground, the trees or where the towns are; every client
computes the same answer from the same seed, and a chunk that unloads comes back
identical. Player changes (a felled tree, a discovered site) are the only state,
and they are small.

## Modules, in dependency order

| module | owns | pure? |
| --- | --- | --- |
| `noise.js` | seeded simplex, fbm, ridged, warp, cell hashes | yes |
| `sitegrid.js` | the roll for where a site is (480 m cells), kinds, names, flat radius | yes |
| `roads.js` | which settlements are joined, the polyline between them and its smoothed height profile, `roadDistanceAt(x, z)` | yes |
| `field.js` | `sampleAt(x, z)`: height, biome, water, river, land, climate, the site that shapes this point and how much road is under it. Sea level, home disc, tree line, snow line | yes |
| `chunks.js` | streams 64 m terrain meshes in a 19 x 19 ring at three resolutions with skirts, water planes, palette, lifecycle hooks | THREE |
| `flora.js` | one TreeField per kind for the whole world; records per 8 m cell from biome tables; ore rings around caves; grass in the near ring | THREE, farm TreeField |
| `fauna.js` | wild animals: which chunk holds a herd, a fox, a squirrel pair or gulls, spawned only in the near ring, capped at 24 alive, huntable through the farm's own roam contract | THREE, farm animal models |
| `sites.js` | which sites exist (asks the field), discovery memory | yes |
| `site_models.js` | what a site looks like: kit buildings around a well, camp kit, primitive ruins, shrines, dungeon and cave mouths; merged by material | THREE, farm kits |
| `dungeon_gen.js` | what is under a dungeon or cave mouth: rooms and corridors on a 2 m grid, the entrance, the stair down, ore and chest cells, and the clamp that keeps a walker off the rock | yes |
| `dungeon.js` | the level as geometry: merged floor and walls, torch props, the two exits, a cave's ore field. No ceiling, eight point lights | THREE, farm TreeField |

`src/farm/farm.js` wires them in `_buildWorld()` and drives them from
`_updateWorld()` every frame. `src/farm/main.js` owns what a place says when
clicked and what discovery announces.

## Numbers that matter

| what | value | where |
| --- | --- | --- |
| seed | 20260904 | `farm.js` WORLD_SEED |
| chunk | 64 m, 33 / 17 / 9 verts by distance | `chunks.js` |
| ring | 9 chunks each way (576 m), fog closes at 536 m | `chunks.js`, `farm.js` |
| sea level | -0.8 (the farm pad is at 0, ground under it at -0.3) | `field.js` |
| home disc | flat to 110 m, blended to 200 m; nothing grows within 125 m | `field.js`, `flora.js` |
| rivers | carved to -1.8, lowland only (fade above 12 to 24 m) | `field.js` |
| tree line, rock line, snow line | 66, 46, 78 m | `flora.js`, `field.js` |
| site cells | 480 m, 62% hold a site; flat radius by kind (town 46, hamlet 26, ruin 14, cave 12 mound, dungeon 10, camp 7, shrine 6) | `sitegrid.js` |
| discovery | within 70 m, once, remembered in `brackenwake-discovered` | `sites.js` |
| roads | 3 m half width, graded at most 1.5 m up or down, never steeper than 0.5, 1 or 2 bends up to 45 m aside, at most 2 neighbours a settlement | `roads.js` |

## Things that bit us, so they do not bite again

- `userData.ground` and `userData.water` are HEX COLOURS to the farm's seasonal
  pass. A boolean becomes `setHex(1)` and paints everything black.
- The bounded valley had a per-frame leash (`W * 2.2`) and a target height clamp
  (0 to 18). Both are skipped when `this.world` exists.
- Stepping `_animate` with fake timestamps for tests advances the day clock and
  leaves `_lastNow` in the future; reset it after, and prefer `forceDay` for
  screenshots.
- A hidden tab pauses requestAnimationFrame and throttles the GPU; frame times
  measured there are noise. Measure JS with `renderer.render` stubbed.
- Kit buildings are dozens of meshes each; anything static goes through
  `mergeByMaterial`.
- three's raycaster does NOT skip invisible objects. Hiding the overworld to
  go underground leaves every farm hit mesh and every scenery tree still
  answering a pick, so `pickTree` filters on world visibility and the hover
  pass branches on `farm.dungeon` instead of sharing the ray. The same fact
  is used on purpose: the exits' hit boxes are invisible and free.
- Underground the day/night pass must not touch `scene.fog`, and WASD at
  95 m/s crosses a 2 m corridor in one frame. Both are guarded on
  `this.dungeon`.

## Checks

`npm test` runs `field.test.mjs` (27), `flora.test.mjs` (16),
`sitegrid.test.mjs` (18) and `fauna.test.mjs` (86). Every rule above that
can be tested in node is.

The underground adds three suites: `dungeon_gen.test.mjs` (26: determinism,
flood fill from the entrance, the stair, the size cap, the clamp checked
against a full scan of the grid), `dungeon.test.mjs` (29: the light budget,
the torch pool, the exits, the ore field, dispose, and `pickTree` proved to
hit a visible ore rock and miss a hidden one) and `dungeon_farm.test.mjs`
(60, which drives farm.js itself: entering hides everything, leaving restores
the camera, target, fog object and visibility exactly).

## Not yet

Loot in the chests, anything alive underground, roads between sites,
rivers that flow downhill, per-chunk persistence of felled trees, other players.
