# Haven’s kite meadow

An original low-poly landscape kit for the field between Haven and its quay. The work is in `/Users/k/brackenwake`.

## Design

The main sandy trail connects Haven’s actual gate at (8, 330) to the quay at (40, 447). A picnic loop and two short spurs give the field places to visit: a canvas sail windmill, a vine-covered picnic arbor with an apple cart, and a fishing shelter with a net and skiff. Lavender, daisies, buttercups, chalk outcrops, broken garden walls and dune grasses break up the grass. Two kites and the windmill sails move.

The trails bend around the existing harvestable oak at (-0.39, 358.29). Town buildings, NPCs, the existing dock and the other task’s pending town edits were preserved. No new quest, vendor, reward or harvesting interaction is implied by the decorative props.

## Sources

- `concept.png`: imagegen art direction based on the user’s screenshot. This is a concept, not an in-game screenshot. The generation requested a warm, faceted coastal meadow, cream and teal sailcloth, curved paths, flower drifts, a picnic grove and a fishing shelter, preserving the town on the left and sea on the right. This describes the brief; it is not a verbatim archived prompt. No specific image-model version is claimed.
- `scripts/art/haven-meadow/geometry.py`: direct Blender mesh construction, flat shading and vertex colours.
- `scripts/art/haven-meadow/assets.py`: twelve original prop factories.
- `scripts/art/haven-meadow/layout.mjs`: reproducible placements, route curves and owned terrain strokes.
- `assets/models/haven-meadow/kite-meadow.blend`: editable asset scenes and a landscape composition scene. The composition uses tree proxies and a coarse terrain preview. The game uses its existing arbor trees and terrain renderer.
- `public/models/props/meadow_*.glb`: the runtime exports. No texture download or new dependency is needed.
- The reusable [Haven meadow collection](https://assets.brackenwake.com/fantasy-studio/?workspace=farm&asset=haven-meadow:windmill) includes the same twelve models, standalone Blender factories, motion helper and placement metadata. Check the library before creating another prop.
- `captures/meadow-*.png`: actual local game captures from Brave, using the production renderer, world, asset loader and character controller.

## Runtime integration

The space streams through the existing site system. Static copies are instanced by model; the rotor and two kite cloth nodes keep their authored pivots and animate through the site update. Flower patches follow the terrain slope and have no physical collision. Solid props have explicit collision envelopes; shelter posts and furniture block movement while their aisles remain walkable. Canvas roofs participate in rain shelter queries. `clearForage` reserves the shelter footprints before their meshes stream in, so wild bushes cannot grow through tables.

All new terrain strokes are tagged `source: haven_meadow`. Regeneration replaces those strokes only, plus the two disconnected original cobble strips (829 and 830), which are returned to grass. Existing town space edits are not part of this change.

## Validation

- Twelve GLBs loaded through the production parser with finite geometry and vertex colours.
- Complete meadow: 18 meshes, 293,190 triangles, including 14 arbor trees and 123 flower patches. These are asset counts, not an FPS improvement claim.
- 119 route samples tested for clear collision and actual sand terrain paint.
- The real keyboard/controller walk reached the quay through all 51 main-trail points in 22.51 seconds. Brave measured 58.6 mean FPS, 18.7 ms p95 frame interval and three frames over 50 ms over 1,319 frames, at a 2560 × 1234 CSS viewport with device pixel ratio 2. This is one local development run, not a baseline comparison or a guarantee on other hardware. `verification.json` preserves the measurements.
- Roof shelter, open aisles, solid furniture, soft foliage, slope alignment and all three animated nodes tested.
- Solid-overlap validation remains enforced; only soft meadow foliage may overlap.
- `npm run build` passed. Existing bundle-size and ineffective dynamic-import warnings remain.
- The release test run found editor fixture contamination from saved world tiles. The eraser tests now create their own empty in-memory tiles; all 328 editor checks pass. Minimap, world map and road timing checks passed on focused rerun. The remaining wayside timing check measured 2.47 ms against a 2 ms budget; the unchanged production source measured 2.69 ms and failed the same check. The full suite is not claimed green.
- A fresh Brave load from the user's port 5210 rendered all 18 meadow meshes and captured all four views without JavaScript or shader errors. The earlier missing props came from Vite's ignored world-data cache. Page navigation now refreshes both the space index and cached space modules without broadcasting an editor reload. A real Vite regression test covers external edits, new files and uninterrupted editor tabs.

Blender 5.2.0 LTS ran in a dedicated background process, with batched direct-data construction and shared meshes. Final measured construction was 0.108 seconds; construction through export and save was 0.348 seconds. The subsequent 64-sample, 1600 × 1100 Cycles render took 4.669 seconds on Metal GPU only, MetalRT Auto, GPU OpenImageDenoise and persistent data. These are prepared-script execution timings, excluding design, scripting, process startup and browser review. Blender’s partial scene-library writer crashed during an earlier attempt; the final pipeline uses a normal save in its dedicated process instead.

## Reproduce and review

```sh
cd /Users/k/brackenwake
node scripts/art/haven-meadow/layout.mjs
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python-exit-code 1 --python scripts/art/haven-meadow/run.py
```

The Blender process accepts newline-delimited JSON, including `{"action":"render","profile":"final"}` and `{"action":"quit"}`. It does not modify an open user scene. Keep the same process resident while refining.

```sh
npm run dev -- --port 5317 --strictPort
BRACKENWAKE_QA_OUTPUT=/Users/k/brackenwake/docs/art/haven-meadow/captures node tools/qa/review-collector.mjs
```

Open `http://localhost:5317/tools/qa/haven-meadow.html?solo`. The review uses a memory-only character and offers overview, landmark and normal walking views. Add `&walktest` for the keyboard-driven route check and frame measurements, or `&capturetest` to save all four views automatically. Refresh the page after regenerating the layout. For another localhost port, set `BRACKENWAKE_QA_ORIGIN` to that exact origin when starting the collector.

## Changes reviewed

| Before | After |
| --- | --- |
| A disconnected straight cobble strip | A sandy route from the actual gate to the quay, a picnic loop and two landmark spurs |
| An open grass field with few landmarks | A sail windmill, two kites, picnic arbor, apple cart, fishing awning, net and skiff |
| Mostly uninterrupted grass | Lavender, daisy and buttercup drifts, dune grasses, chalk outcrops, broken walls and 14 existing-style arbor trees |
| No asset kit for this field | Twelve original Blender props, editable scenes, reproducible layout script, GLB exports and a concept reference |
| Only the old mill wheel had an explicit animated prop path | Shared authored-node motion for the wheel, windmill rotor and kite cloth, preserving cached prototypes |
| Generic GLB height fitting | Authored metric origins and pivots preserved for the meadow kit |
| Horizontal placement for wide patches | Flower patches align to the local terrain slope |
| Generic solid prop envelopes | Explicit posts, furniture, wall and windmill collision; foliage remains soft and shelter aisles open |
| No rain shelter from the new props | Canvas canopy and windmill roof envelopes registered with the weather system |
| Wild bushes could grow through the picnic table | Authored `clearForage` footprints reserve shelter ground without removing nearby resources |
| All prop overlap treated as solid | Soft meadow flower drifts may mingle while bounds and hard-prop overlap checks remain enforced |
| No local review route for this field | A memory-only character, four camera views, normal walking controls, saved captures and a keyboard-driven route check |

The review controls use sentence case, 40-pixel button targets and separate spacing between the description, controls and status. Existing game HUD styles were not redesigned in this pass.
