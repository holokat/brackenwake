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
| `field.js` | `sampleAt(x, z)`: height, biome, water, river, land, climate, and the site that shapes this point. Sea level, home disc, tree line, snow line | yes |
| `chunks.js` | streams 64 m terrain meshes in a 19 x 19 ring at three resolutions with skirts, water planes, palette, lifecycle hooks | THREE |
| `flora.js` | one TreeField per kind for the whole world; records per 8 m cell from biome tables; ore rings around caves; grass in the near ring | THREE, farm TreeField |
| `sites.js` | which sites exist (asks the field), discovery memory | yes |
| `site_models.js` | what a site looks like: kit buildings around a well, camp kit, primitive ruins, shrines, dungeon and cave mouths; merged by material | THREE, farm kits |

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

## Checks

`npm test` runs `field.test.mjs` (27), `flora.test.mjs` (16),
`sitegrid.test.mjs` (18). Every rule above that can be tested in node is.

## Not yet

Interiors for dungeons and caves, roads between sites, animals in the wild,
rivers that flow downhill, per-chunk persistence of felled trees, other players.
