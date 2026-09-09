# Old Cellars descent

The dungeon has eight boss encounters. Levels 2 through 7 add six distinct bosses between Sergeant Oram Blackhand and the existing Vharos raid. Each new boss has a Blender model, eight animation clips, three special attacks and health phases at 66% and 33%.

| Level | Encounter | Chamber | Special attacks |
| --- | --- | --- | --- |
| 1 | Sergeant Oram Blackhand | [Command vault](boss-01-hero.png) | Existing encounter |
| 2 | Morva, the ossuary mother | [Drowned reliquary](boss-02-hero.png) | Tidal rings, brine jets, crawler brood |
| 3 | Sexton, the last bellkeeper | [Bellkeeper crypt](boss-03-hero.png) | Bell shock rings, hammer lane, silence marks |
| 4 | Abbot Cinder | [Funeral furnace](boss-04-hero.png) | Fire cones, cinder marks, furnace pulse |
| 5 | Ilex, the chain archivist | [Chained archive](boss-05-hero.png) | Crossing chains, book curses, safe-circle ritual |
| 6 | Voss, the inverted saint | [Inverted mausoleum](boss-06-hero.png) | Falling tombs, gravity rings, frontal crush |
| 7 | Aster, the first king | [Royal necropolis](boss-07-hero.png) | Sword cleave, grave cross, tracked collapse |
| 8 | Vharos | Existing buried cathedral | Existing raid, ten-player minimum |

Regular encounters use the [burial hall](regular-crypt-hero.png), [abandoned crossing](regular-store-hero.png) and [chapel](regular-chapel-hero.png). The rebuilt [arrival hall](../cellar-entry/arrival-blender.png) connects to the [nave](../cellar-entry/nave-blender.png) through a descending stone passage. Existing landmark rooms remain part of the route.

## Art and editable sources

Generated room concepts are retained as `room-01-concept.png` through `room-07-concept.png`, with regular rooms in `room-regular-concept.png`. Level 8 retains the earlier `docs/art/old-cellars/references/08-buried-cathedral.png` reference. The Blender rooms follow their architecture, materials and focal objects within a four-door gameplay layout. The hero images are Blender renders, not game screenshots.

The ten room exports, collision specifications and editable `.blend` files live in `assets/models/cellars/descent/`. Their builders live in `tools/blender/cellars/descent/`. Boss sources and validation are documented in [the boss model guide](../cellar-depth-bosses/README.md).

The chamber interiors measure 62 by 44 metres, with ceilings rising from 18 to 55 metres. Each has four 12-metre portals. Regular rooms measure 48 by 40 metres. Furniture stays outside the main combat lanes; the command vault and archive have traversable galleries and stairwell openings. The exported colliders use the same coordinates as the meshes.

Rebuild a room using the owned background Blender bridge:

```sh
python3 tools/blender/cellars/descent/run.py --port 9877 --id boss-05 --render hero
node tools/blender/cellars/descent/validate.mjs
```

`--all` rebuilds all ten variants. The builder uses batched data operations and material batches. Renders use Cycles with Metal GPU, GPU OpenImageDenoise and persistent data on the development Mac. Keep the user's separate GUI Blender scene untouched.

## Progression and checks

Floor heights are continuous along the connecting routes. Old cave faces are removed where the authored rooms and portals occupy them. The player controller checks headroom and swept collision when stepping onto low stair landings. New boss arenas do not lock players behind a boss door.

```sh
node src/world/cellar_routes.test.mjs
node src/world/cellar_progression.test.mjs
node src/world/cellar_gallery.test.mjs
node src/world/cellar_streaming.test.mjs
node src/game/cellar_boss_combat.test.mjs
node tools/verify-cellars.mjs
npm test
npm run build
```

The route checks cover 76 rooms on eight floors in both directions, including the real player controller, rendered cave surfaces, exported room meshes, stair transitions and gallery landings. Combat checks drive all 18 special attacks through the production damage queue and test safe regions, overlapping hazards, resets and cleanup.

`/tools/cellar-entry-playtest.html` runs the real game with a temporary character and page-local memory storage. It provides floor selection, boss-room travel, corridor walking and frame-rate measurements without opening existing character saves. Browser walkthroughs remain a separate acceptance step from the automated checks.
