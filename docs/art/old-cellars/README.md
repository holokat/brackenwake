# The Old Cellars

Eight descending dungeon depths lead from occupied wine cellars to Vharos's buried cathedral. Each depth combines a Blender landmark room with branching cave passages and furnished secondary crypts. Oram remains in the first depth. Six new creature variants become stronger and larger deeper underground.

## Art map

| Depth | Landmark | Concept source | Blender source |
| --- | --- | --- | --- |
| 1 | Broken wine vault | `references/01-04-room-sheet.png` | `assets/models/cellars/rooms/cellar-room-01.blend` |
| 2 | Sunken reliquary | `references/01-04-room-sheet.png` | `assets/models/cellars/rooms/cellar-room-02.blend` |
| 3 | Bellkeeper's tomb | `references/01-04-room-sheet.png` | `assets/models/cellars/rooms/cellar-room-03.blend` |
| 4 | Funeral furnace | `references/01-04-room-sheet.png` | `assets/models/cellars/rooms/cellar-room-04.blend` |
| 5 | Lich's archive | `references/05-07-room-sheet.png` | `assets/models/cellars/rooms/cellar-room-05.blend` |
| 6 | Hanging sarcophagi | `references/05-07-room-sheet.png` | `assets/models/cellars/rooms/cellar-room-06.blend` |
| 7 | Grave of the first king | `references/05-07-room-sheet.png` | `assets/models/cellars/rooms/cellar-room-07.blend` |
| 8 | Buried cathedral | `references/08-buried-cathedral.png` | `assets/models/cellars/rooms/cellar-room-08.blend` |

Source paths in the table are relative to the repository root; concept paths are relative to this guide. Oram follows `references/01-oram-turnaround.png`, with editable source at `blender/oram/oram.blend`. Vharos follows `references/08-vharos-turnaround.png`, with editable source at `blender/vharos.blend`. Final exported-model views are in `blender/`; game-rendered views are in `captures/`.

The concept sheets were generated with imagegen. Geometry, rigs and animations were authored in Blender through the installed Blender MCP bridge. These are modeled interpretations of the sheets. The earlier procedural Vharos blockout was superseded and is not used by the game.

## Rebuild the art

The builders were verified with Blender 5.2, Python 3.13 and Node 22. The game uses its existing Three.js dependency. Install the Blender MCP extension if you want to use the same authoring transport, then start an isolated background bridge:

```sh
blender --background --command blender_mcp --host 127.0.0.1 --port 9877
```

From the repository root, run a builder in a separate terminal:

```sh
python3 tools/blender/cellars/mcp_client.py --script tools/blender/cellars/build_vharos.py
```

For the other builders, start equivalent background bridges on ports 9878 and 9879, then run:

```sh
python3 tools/blender/cellars/mcp_client.py --port 9878 --script tools/blender/cellars/oram/build.py
python3 tools/blender/cellars/mcp_client.py --port 9879 --script tools/blender/cellars/rooms/build.py
```

Each builder clears its current Blender scene. Use the isolated background process above, not a scene containing unsaved work. See the Oram and room subdirectories for their render, finalization and source-evidence commands. The bridge client accepts only local Cellars ports 9877 through 9879.

Game coordinates are metres, +Y up and +Z forward. Blender uses +Z up and -Y forward. GLBs contain meshes, named animation clips and effect anchors; runtime code owns lights and game rules. Room manifests define portals, galleries, thin stair slabs, pit floors, bridges and effect positions.

## Runtime

- `src/world/old_cellars.js` defines eight depths and the branching topology.
- `src/world/cellar_landmark_layout.js` joins the exported rooms to cave ground and keeps spawns and treasure clear of fixtures.
- `src/world/cellar_blender_room.js` streams GLBs, clones owned materials, retains a bounded cache and supplies synchronous collision. Visible support remains if a room download fails.
- `src/world/old_cellars_scene.js` attaches existing library fire, embers, dust, mist and light shafts. Arcane motes and room magic live in `cellar_magic.js`.
- `src/game/cellar_oram_model.js` keeps Oram's existing combat dimensions and equips his authored rig. Vharos's loader and animation synchronization live in `cellar_blender_boss.js`.
- `server/cellar_raid.mjs` owns Vharos's shared health, phases, the ten-player gate, attack schedule and reward ledger. `src/mmo/cellar_raid_rules.js` is the shared hazard contract.
- `src/game/cellar_raid_view.js` and `cellar_raid_effects.js` render warnings, falling tombs, fire walls, fractures and collapse columns.

Vharos has 180,000 health. Ten living, recently active player seats inside the final arena are required to begin and continue the encounter. Falling below ten shields him and cancels the current attack. Gravesurge, funeral cross, hollow star and tombfall have different safe areas. Ground warnings describe horizontal hazard footprints, which also affect players on galleries. Eligible contributors receive 2,500 gold and 36 starfall ore. Disconnect/reconnect handling preserves shared raid state and prevents repeated reward credit.

The server validates encounter membership, strike reach, cadence, sequence and bounded damage. Ordinary gear and skill damage resolution still runs in the client, as in the rest of the game. Ten automated local WebSocket clients verify synchronization; a ten-person balance playtest is still needed.

Dungeon ambience uses the existing optional audio path and saved sound preferences. This change adds no audio files. The repository's existing music redistribution exclusions still apply.

## Validate

```sh
node tools/blender/cellars/validate-vharos.mjs
node tools/blender/cellars/oram/validate.mjs
node tools/blender/cellars/rooms/validate.mjs
node tools/blender/cellars/rooms/validate-routes.mjs
node tools/verify-cellars.mjs
npm test
npm run build
```

With a local Worker running on port 8787:

```sh
node tools/verify-cellars-websocket.mjs
```

The integration tests parse the exported GLBs with the actual Three.js loader, walk every gallery flight and portal through game collision, traverse all eight runtime depths, and exercise combat, shared health, attack cancellation, loot replay and teardown. Render timings in the review evidence describe this development Mac, not a physical phone benchmark.
