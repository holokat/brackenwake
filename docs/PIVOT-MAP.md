# PIVOT-MAP: what the homestead engine is, before it becomes an endless world

Read-only survey of the fork at the moment of forking (commit 4d7c54d). Three.js
^0.185.1, Vite ^8.2.2. Paths relative to the repo root. Every claim carries the
file and line it was read from.

## 1. Module map

Entry: `index.html:214` loads `/src/farm/main.js`; styles at `index.html:7`
from `/src/farm/style.css`. One mount point, `<div id="scene">` at
`index.html:10`; every other DOM node in `index.html` is pre-declared HUD and
panel chrome that `main.js` fills in.

| File | Lines | Owns |
|---|---:|---|
| `src/farm/main.js` | 5279 | App shell: boot, all HUD wiring, tools, modes, market, orders, fishing UI, tooltips, compose and gifting, nostr subscriptions, story-card rendering, `window.__nostrux` (1389-1416) |
| `src/farm/farm.js` | 4034 | `Homestead` scene engine: renderer, camera, controls, island geometry, plots, placement, day and night, weather render, hunting, picking, animate loop |
| `src/farm/themes.js` | 3750 | Five biomes: palettes, sky gradients, fog and sun colours, inner scenery, and the whole outer-zone terrain generator (height fields, landmass discs, lakes, rivers, forests) |
| `src/farm/style.css` | 1593 | All UI styling, painted-frame HUD positioning |
| `src/farm/assets.js` | 1171 | Primitive helpers (`mat/mesh/box/cyl/cone/ball/tube`), palette `P`, `buildCrop/buildTree/buildObject`, `hash32`, `mulberry32` |
| `src/farm/stories.js` | 1090 | 61 story cards, pure data |
| `src/farm/infra_models.js` | 830 | Hand-built tier-1 infrastructure models |
| `src/farm/processors.js` | 691 | Mill, bakery, creamery and other processor models, merchant decor |
| `src/farm/placeholder.js` | 687 | Category-shaped procedural silhouettes for model-less catalog items; construction sites |
| `src/farm/buildings.js` | 674 | Farmhouse tiers, barn, silo, enclosures, roof and wall cosmetics |
| `src/farm/infra_models_e.js` | 672 | Livestock comforts, worker quarters, roadside commerce |
| `src/farm/infra_models_d.js` | 671 | Processing and workshop models |
| `src/farm/animals.js` | 671 | `ANIMAL_TYPES`, procedural animal meshes, `updateAnimal` wander AI |
| `src/farm/infra_models_f.js` | 650 | Forestry, aquaculture, field-edge kit |
| `src/farm/fishing.js` | 603 | Dock model, `FISH_TABLES` (36 species), `FishingSession` minigame |
| `src/farm/audio.js` | 590 | `FarmAudio`: per-biome music rotation, ambience bed, sfx families, synthesized animal voices |
| `src/farm/infra_models_b.js` | 568 | Eco and decor tier models |
| `src/farm/infra_models_c.js` | 511 | Barriers, soil stations, gravel road |
| `src/farm/game.js` | 503 | `Game` state: coins, plots, inventory, owned, jobs, orders, stats, save and load, `snapshot()` and `applyRemote()` |
| `src/farm/tree_edit.js` | 498 | `TreeField`: editable instanced tree and rock fields, chop and mine, regrow, `auditHarvestFields`, in-scene editor |
| `src/farm/landmarks.js` | 477 | GLB landmark loader and placer, drag-to-place editor, persisted per theme |
| `src/farm/infrastructure_a.js` | 464 | 52 functional infrastructure items (pure data) |
| `src/farm/beach_life.js` | 391 | Turtle, dolphin, seagull |
| `src/farm/fish_models.js` | 389 | 36 catchable fish meshes |
| `src/farm/critter_models.js` | 383 | Bunny, squirrel |
| `src/farm/predator_models.js` | 362 | Fox, wolf |
| `src/farm/camp_models.js` | 351 | Campfire, tent, chair, lantern |
| `src/farm/birds.js` | 318 | `BIRDS` and `BIRD_SPECIES` flyers |
| `src/farm/junk_models.js` | 299 | Fished-up junk |
| `src/farm/story_engine.js` | 294 | Trigger evaluation, `buildState`, `applyChoice`, modifiers, pledges |
| `src/farm/deer.js` | 231 | Procedural deer fallback |
| `src/farm/retired.js` | 223 | 290 to 52 catalog id migration map (leaf module) |
| `src/farm/bow_viewmodel.js` | 215 | First-person bow parented to the camera |
| `src/farm/recipes.js` | 196 | `PROCESSORS`, `RECIPES`, `PRODUCTS`, `MERCHANT_ITEMS` |
| `src/farm/nostr-keys.js` | 188 | secp256k1 and BIP-340 Schnorr, BigInt, no deps |
| `src/farm/missions.js` | 188 | 137 missions, pure data with phases |
| `src/farm/pool.js` | 173 | NIP-01 relay pool, `RELAYS`, `npubToHex`, profile cache |
| `src/farm/catalog.js` | 173 | `CROPS`(10) `TREES`(4) `OBJECTS` `ANIMALS` `BUILDINGS` `GOODS`, `TIERS`, `STARTER_COINS` |
| `src/farm/meat_models.js` | 156 | Venison, bear, game-meat drops |
| `src/farm/infrastructure.js` | 155 | Merges A and B, `computeEffects`, zone bonuses, `craftSpeedFor` |
| `src/farm/sakura_layout.js` | 134 | Sakura's baked hand-placed layout |
| `src/farm/fishtrap_models.js` | 126 | Wicker fish trap |
| `src/farm/animal_models.js` | 126 | GLB farm-animal kit with named part nodes for procedural animation |
| `src/farm/infrastructure_b.js` | 114 | Decor infrastructure (pure data) |
| `src/farm/thumbs.js` | 101 | Offscreen renderer that photographs each model once into a cached data URL |
| `src/farm/weather.js` | 88 | `WeatherMachine`: per-season weather tables, wind vector, intensity easing |
| `src/farm/scenery_store.js` | 65 | localStorage layer for hand-placed scenery, keyed `nostrux-scenery-<theme>` |
| `src/farm/glb_models.js` | 47 | GLB loader for animated deer and bear, `SkeletonUtils.clone` plus per-instance mixer |

Total src: 32,244 lines. Also `scripts/audit-stories.mjs`, `scripts/gen-manifest.mjs`,
and `proto/frontier.html` (188 lines), a text-only tile land-claim prototype:
design intent for territory, not terrain code.

## 2. Renderer and camera

- Renderer `farm.js:272-284`: `WebGLRenderer({antialias:true})`, pixel ratio capped at 2, `shadowMap.enabled` with `PCFSoftShadowMap`, tone mapping switchable via static `Homestead.toneMapping` (`farm.js:149`, default `'aces'`, exposure 1.12), live flip through `__nostrux.toneMapping()` (`main.js:1404-1411`).
- Camera `farm.js:304`: `PerspectiveCamera(50, aspect, 0.1, 1800)`, initial position `(W*0.72, W*0.6, W*1.1)`, roughly `(65, 54, 99)` at tier 1.
- Controls `farm.js:307-322`: `OrbitControls`, target `(0,2,0)`, damping 0.07, `minDistance 20`, `maxDistance = W*3.4` (about 306 at tier 1), `maxPolarAngle = pi/2.3` (about 78 degrees, never horizon level). Auto-rotate 0.3 deg/s, off on input, re-armed after 30 s idle. Touch is OrbitControls default.
- Movement `farm.js:3205-3225`: WASD on `window` (`farm.js:373-381`), guarded against text inputs. Pans camera and orbit target together along the camera-relative horizontal plane at a fixed 95 world units per second, `dt` clamped to 0.05. No clamp, no bounds check, no terrain follow: you can already fly indefinitely and the world simply runs out.
- The player is a cursor, not a character. No avatar mesh exists. Every verb is a pointer raycast (`_setupPicking`, `farm.js:3124-3196`): hover sets `hovered*` fields and a quick pointerup (under 6 px moved, under 500 ms) dispatches the matching callback. The only first-person element is the bow viewmodel, a child of the camera (`farm.js:1878-1885`).
- Hotkeys `main.js:4164-4202`: `1-7` HUD tabs, `B` book, `R` rotate placement, `Backspace/Delete` remove, `Esc` cancel. `[` and `]` step story cards in test mode (`main.js:5274-5279`).

## 3. The ground

Not a heightmap. A fixed extruded slab plus a decorative outer disc.

- Farm pad `_buildIsland()` `farm.js:409-467`: `_capShape()` (`farm.js:395-407`) builds a rounded rectangle, extruded 2.0 deep with bevel, at y about 0. Under it a `BoxGeometry(W-4, 17, D-4, 12,5,12)` cliff with per-vertex taper, sine displacement and vertex colours, then an inverted cone tip at y = -23. A floating diorama.
- Size `farm.js:229-239`, `TIER_LAYOUT` `farm.js:87-91`, `PLOT_PITCH = 9.5` (`farm.js:80`): tier 1 `W = 90`, depth 82.5; tier 3 `W = 131`, depth 125.5. Fence insets 2.6.
- Plots `PLOT_SIZE = 7`, `PLOT_SINK = -0.85`, `PLOT_TOP_Y = 0.25` (`farm.js:78-84`). Grids 4x3, 5x4, 6x5 (`catalog.js:157-161`).
- Outer zone `_buildOuterZone()` `farm.js:2326-2354` hands the theme `{scene, islandW, islandD, zCenter, topY, clearRadius, addAnimated, setDockSpot, setGroundHeight, rng}` with `rng = mulberry32(4242)`, a fixed seed. `topY = theme.outerTopY ?? -1.6`.
- Outer landmass `themes.js:726-795` (`outerLandmass`) and `themes.js:954-1021` (`meadowValleyFloor`): ring-by-ring disc, 48 segments x 6 rings (meadow 64 x 10), jittered edge, cylinder skirt. Radius bounded: `outerSize(ctx, 3.1) = 3.1 * max(W, D)` (about 279 at tier 1, 406 at tier 3); oceanside 130, desert 175.
- Height fields are analytic sine sums, not noise: `outerHeightField` `themes.js:709-720`, `meadowHeightField` `themes.js:929-951`. Three sin/cos terms, amplitude at most 3, flat within `clearRadius + 30` of the farm.
- Ground height plumbing is half wired: `farm.js:2311-2323` `terrainY(x,z)` blends `this.groundHeightAt` in past the pad edge, but `setGroundHeight` is called only by sakura (`themes.js:3428`). Four biomes return 0, and roaming animals (`farm.js:1229`, `3525`, `3601`) walk a flat plane over undulating land. This is the single most important hook for a chunked world.
- Water is decorative: one shared scrolling `waterTexture()` driven by `tickWater(t)` (`themes.js:1091-1098`) on blob discs, `waterRibbon()` strips (`themes.js:1166-1178`) and `meadowWaterfall()` (`themes.js:1182-1216`). Meshes tagged `userData.water` freeze in winter.
- Scatter: `_scatterPoint()` `farm.js:2377-2394` rejection-samples inside the fence; `_buildScatter()` `farm.js:2396+` puts 210 grass tufts into one `InstancedMesh`.
- Scenery editors (test mode only): `landmarks.js:264` `landmarkEditor` (GLB landmarks, persisted via `patchStore`) and `tree_edit.js:311` `treeEditor` (per-tree edits inside a `TreeField`, saved as `store.trees[fieldName]`). Storage `scenery_store.js:9` `KEY = theme => 'nostrux-scenery-' + theme`, baseline plus per-browser overlay (`loadStore()` `scenery_store.js:26-34`). When the theme id is unset the key falls back to `'default'`. UI `#scene-edit-btn` `index.html:16`, wired `main.js:584-593`. Baked output: `sakura_layout.js`.
- Themes `themes.js:3661-3746`: `meadow`, `oceanside`, `boreal`, `desert`, `sakura`. Each has `id, name, icon, skyDay[4], skyNight[4], colors{grass, grassEdge, dirtTop, dirtDeep, rock, water, fogDay, fogNight, sunDay, sunNight, tuftColorHSL}, buildScenery, buildOuterZone`. `getTheme(id)` `themes.js:3749`.
- Seed utilities: `mulberry32(seed)` `assets.js:62`, `hash32(str, seed)` `assets.js:72`. No value, simplex or Perlin noise and no fbm anywhere.

## 4. Lighting and sky

- Fog `farm.js:290`: linear `Fog(fogDay, 280, 700)`; colour lerps night to day, `far` dips during rolling fog events and precipitation (`farm.js:3264-3271`).
- Sky `farm.js:288, 292-302`: solid background colour plus two nested BackSide `SphereGeometry(1500/1495)` domes with canvas gradient textures (`skyGradientTexture`, `farm.js:113+`), crossfaded by `dayFactor`.
- Day and night `farm.js:3227-3234`: `cycleMs = this.dayLengthMs || 360000`; `dayLengthMs` is never assigned and `DAY_CYCLE_MS = 480000` at `farm.js:96` is dead. The real cycle is 6 minutes.
- Lights `farm.js:325-343`: `HemisphereLight(0xbfe0ff, 0xa98a63, 0.9)`, `AmbientLight(0xffe8d0, 0.22)`, a shadow-casting `DirectionalLight` at `(90,120,50)` with a 2048 map and an orthographic frustum sized to the farm (`±max(W,D)*0.75`), plus a blue fill.
- Celestials `farm.js:345-359`: static sun and moon that fade rather than move. Fireflies `farm.js:361-372`.
- Seasons `seasons.js:44-53` `seasonTint(id)`; weather `weather.js` plus `_updateWeather` (`farm.js:3252`), wind vector shared by turbines, trees and flags.

## 5. Systems that survive the pivot as-is

- Crops and plots: `catalog.js:11-23`, growth in `game.js` (`WATER_GROWTH = 2`, `WATER_COOLDOWN_MS = 90000`), meshes `buildCrop()` `assets.js:736`.
- Animals: `animals.js`, `animal_models.js`, predators with `STALK_WARNING_MS = 4500` (`farm.js:98-100`).
- Inventory, goods, materials: `game.inventory`, `GOODS` `catalog.js:80`, `MATERIALS = {wood, stone}` with `MATERIAL_BASE_CAP = 150` (`game.js:17-18`). Caps silently drop overflow.
- Market and orders: `main.js:2973+`, order board `main.js:2881-2935`.
- Story cards: `stories.js`, `story_engine.js` (`buildState` `:79-136` reads about 40 world signals), rendering `main.js:4588-5143`. Harness `scripts/audit-stories.mjs`.
- Missions: `missions.js`, UI `main.js:756-1136`. Skills: none.
- Save and load: `game.js:81` key `nostrux-game-<pubkey>`, `SAVE_VERSION = 3` (`game.js:10`). A version mismatch silently discards the save (`game.js:90`). Field list `snapshot()` `game.js:150-166`.
- Nostr: `nostr-keys.js` local guest keys; relays `pool.js:3-7` (damus, nos.lol, nostr.band). Published: kind 30078 replaceable, tag `['d','nostrux-farm']`, content = snapshot, debounced 4 s (`main.js:1543-1562`); kind 0 profile; kind 1 notes; kind 21617 water gifts; kind 24242 Blossom auth. Subscriptions: farmstate, gifts, contacts (kind 3), profile batches.
- Audio: `audio.js:39-62` per-biome kits, slot rotation `SLOT_MS = {theme:160s, calm:175s, lively:175s}`, `MAX_SLOT_MS = 300s`. `public/audio/music/` is gitignored and absent in this fork; only `/audio/sfx/` (1.5 MB, 55 files) ships.

## 6. Multiplayer

None live. Asynchronous visiting via `loadFarm(pubkey)` `main.js:1442` replays a kind 30078 snapshot read-only (`game.applyRemote`, `game.js:169-181`). No avatars, no nameplates over players, no presence. Friends from kind 3 (`main.js:1172-1282`). Water gifts (kind 21617) are the only cross-player write.

## 7. Assets

```
public/ui      34 MB   25 PNGs, painted HUD frames, buttons, chests, tools, bows
public/models  5.2 MB  19 .glb
public/audio   1.5 MB  55 sfx (music/ gitignored and absent)
```

Biggest: `ui/chest-iron.png` 2.5 MB, `ui/chest-gold.png` 2.4 MB, `ui/friends-btn.png` 2.3 MB, five per-theme HUD frames at 1.1 to 1.6 MB each. Models: 5 Japanese landmarks and 14 low-poly animals; only deer and bear are animated through `glb_models.js`. Everything else is procedural from `assets.js` primitives.

## 8. Performance shape

- Instancing is sparse: `TreeField` (`tree_edit.js:20-100`) keeps records as truth, rebuilds one `InstancedMesh` per layer with a `userData.treeMap` back-index; `outerInstanced()` (`themes.js:798+`) does the same for boulders, spruces, palms, cacti.
- Everything else is an individual `Mesh` with its own material. Draw calls scale linearly with placed items.
- No LOD, no chunking, no streaming, no frustum management. The scene is torn down and rebuilt wholesale on theme or tier change.
- `_animate` (`farm.js:3201-4032`, about 830 lines) does everything per frame with a few throttles.

## 9. What an endless chunked world can reuse

| Reuse | Owner |
|---|---|
| Renderer, tone mapping, shadows, sky domes, fog, day and night | `farm.js:272-372`, `:3227-3271` |
| Camera and OrbitControls feel, WASD pan, the cursor-verb picking model | `farm.js:304-322`, `:3205-3225`, `:3124-3196` |
| Biome table shape (palette, sky gradients, fog and sun colours) | `themes.js:3661-3746` |
| `TreeField`: record-backed instanced meshes with raycast back-index, chop, mine, regrow | `tree_edit.js` |
| `outerInstanced` and `addBoulderField` placement records | `themes.js:683-706`, `:798+` |
| Shared animated water texture and `waterRibbon` | `themes.js:1091-1098`, `:1166-1178` |
| `terrainY()` blend hook and the `setGroundHeight` contract | `farm.js:2311-2323`, `:2348` |
| `mulberry32` and `hash32` as the seed base | `assets.js:62-80` |
| Seasons, weather, wind (pure) | `seasons.js`, `weather.js` |
| The economy: crops, animals, goods, recipes, infrastructure effects, market, orders | `catalog.js`, `game.js`, `recipes.js`, `infrastructure*.js`, `main.js:2881+` |
| Story engine, `buildState` extendable with biome, distance from home, in town | `story_engine.js:79-136` |
| Nostr identity, relay pool, publish and subscribe, friends, gifting | `nostr-keys.js`, `pool.js`, `main.js:1440-1594` |
| Audio rotation keyed by biome id | `audio.js:39-62`, `:200-330` |
| Scenery-editor persistence pattern (baseline plus overlay) | `scenery_store.js` |
| All 19 GLBs and every procedural model builder | `public/models/`, `assets.js`, `infra_models_*.js`, `buildings.js`, `processors.js` |

## What must be new

| New | Owner |
|---|---|
| Real 2D noise (simplex plus fbm, domain warp) and `chunkSeed(cx,cz)` | new `src/world/noise.js` |
| Chunk manager: load and unload ring around the camera, per-frame budget, disposal | new `src/world/chunks.js` |
| Continuous heightmap to chunk mesh with stitched edges, and a global `heightAt(x,z)` | new `src/world/terrain.js`; replaces `themes.js:709-720`, `:929-951`, `:726-795`, `:954-1021` |
| Biome field (temperature and moisture to biome blend) replacing single theme per save | new `src/world/biomes.js`; `themes.js:3661` becomes its palette table |
| Sea level, coastlines, islands, river carving that follows the height field | new `src/world/hydrology.js` |
| Camera that follows terrain height; WASD samples the ground | `farm.js:3205-3225` |
| Optional player character mesh and controller with a reach limit on picking | new `src/world/player.js`, `farm.js:3124` |
| Town and dungeon site selection from chunk seed, spacing rules, POI registry | new `src/world/sites.js` |
| Persistence for an unbounded world: sparse per-chunk deltas, and a save migration ladder (`game.js:90` discards mismatched versions) | `game.js`, `scenery_store.js` |
| Homestead anchoring: the farm is one claimed chunk at a world origin, not the coordinate system | `farm.js:87-91`, `:395-467` |
| Camera-following shadow frustum | `farm.js:325-343` |
| LOD tiers and an instancing budget per chunk | new `src/world/lod.js` |
| Fog and draw distance tied to chunk radius | `farm.js:290`, `:304`, `:292-302` |
| Discovery layer for towns and dungeons feeding story triggers | `story_engine.js:79` |
| Asset budget: 34 MB of PNG chrome on first load | `public/ui/` |

## Loose ends worth fixing during the pivot

1. `setGroundHeight` is called by one of five themes (`themes.js:3428`).
2. `DAY_CYCLE_MS = 480000` (`farm.js:96`) is dead; the real cycle is the 360000 fallback at `farm.js:3228`.
3. `game.js:90` discards any save whose `v !== 3` with no migration.
4. `public/audio/music/` is gitignored and absent, so `PLAYLISTS` (`audio.js:45`) points at files that 404 in this fork.
5. `scenery_store.js` falls back to theme id `'default'` when `setSceneryTheme` has not run.
