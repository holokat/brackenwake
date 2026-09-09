# Asset loading in Brackenwake

This implementation lives in `/Users/k/brackenwake`. It preserves the dungeon builder's checkpoint `8370c17` and follow-up `24c74ab`, including immediate collision manifests, continuous gallery floors and cached static entry shadows.

## Loading policy

- The player and spawned creatures request their own models. Combat startup no longer requests every monster rig in the catalog.
- Dungeon collision and simple, complete room shells exist immediately. Detailed room artwork is requested by position. At the level-one entrance, the policy selects the arrival/nave asset rather than every room on the floor.
- The spatial plan updates five times per second, and immediately after a teleport. A seven-second movement projection identifies approaching rooms. Up to two nearby candidates can have their raw GLB bytes prefetched. Background prefetch respects data saving, 2G connections and hidden tabs.
- Visible requests have priority, and background requests leave one of two network slots available. Prefetched bytes are not decoded until needed. Only one GLB decode runs at a time across room and character loaders.
- Static room cloning runs in batches of eight scene nodes. Materials are cloned once per distinct template material per room. Textures are initialized individually, and `compileAsync` prepares shaders using the current renderer, camera and scene.
- Main-thread jobs use a two-millisecond target and at most two jobs per slice. When the measured game frame exceeds 14 ms, the queue drops to one job and a 0.75 ms target. Sequential awaits in the staging loops are intentional: they yield between batches instead of resolving all work in one burst.
- Obsolete cave triangles are filtered and copied in batches. New geometry attributes are committed together, and the previous geometry releases its GPU buffers. Cuts from different rooms are serialized so one room cannot restore geometry removed by another.
- Nearby room instances remain available for backtracking. The normal resident limit is four; currently required rooms take precedence over that limit. Distant instances leave after eight seconds beyond 150 metres, or sooner when the resident limit is exceeded. Their floor, ceiling and collider proxies remain available. Live templates stay pinned; unused templates are limited to two and 96 MiB, and unused raw bytes to 48 MiB.
- Within 38 metres of a stair, only the destination floor's arrival asset is prefetched. Returning upstairs can prime its boss-room arrival instead. Completed bytes remain in the bounded cache, and a transition lease keeps an in-flight arrival download alive through old-scene disposal. The new floor releases that lease when its nearby artwork settles. Prefetching does not construct the destination floor or reveal its minimap.
- Decorative effects are created near the player on lower-priority slices and released after moving away. Room load failures retain the shell and can retry after ten seconds. Leaving a level cancels outstanding room work and prevents late attachment.

The cooperative limits cannot preempt an individual decoder operation or GPU upload. They reduce simultaneous work and expose overruns; they are not a guarantee that every frame meets its target. The existing synchronous layout and base-shell construction at a floor transition remains synchronous. A local Node sample before integration took about 12 ms for the first-floor layout and 79 ms for its shell; that is not a browser frame-rate measurement.

The renderer API follows the installed Three.js implementation and its [compileAsync documentation](https://threejs.org/docs/pages/WebGLRenderer.html#compileAsync). Shader preparation does not guarantee that all vertex-buffer upload work has already happened.

## Measured asset footprint

The previous loader immediately requested these unique GLBs, measured from the current files:

| Floor | Detailed room instances | Unique GLBs | Encoded GLB size |
| --- | ---: | ---: | ---: |
| 1 | 9 | 6 | 61.33 MiB |
| 2 | 10 | 5 | 42.68 MiB |
| 6 | 10 | 5 | 57.92 MiB |
| 8 | 1 | 1 | 12.09 MiB |

The first-floor entrance asset is 20.95 MiB. It is the only detailed room required at that arrival point; optional adjacent-room byte prefetch can add network traffic without adding decoded room instances. This is a file-size and selection comparison, not a claim about measured browser throughput or FPS.

## Verification and live review

`node src/game/streaming/streaming.test.mjs` checks priorities, frame slicing, slow-frame adaptation, cancellation, deduplication, one-at-a-time decoding, data-saving policy, byte/template limits, failure recovery, predictive selection and effect cleanup.

`node src/world/cellar_asset_stream.test.mjs` checks next-floor selection, completed and in-flight prefetch handoffs, visible floor and ceiling proxies, serialized geometry replacement, and approach/load/evict using an actual exported descent GLB. The actual first-floor leaf registry verifies nine registered room instances with only the entry asset requested at arrival. Existing `cellar_streaming`, `cellar_art`, `cellar_routes`, model/animation and application wiring tests remain relevant. The art suite verifies all eight depths, 926,345 Blender triangles, 4,040 gallery/escape collision samples and 1,632 portal samples. The route suite verifies 76 reachable rooms, 15,923 route segments and 240 traversal samples against the exported entry GLB.

The real-game review is `/tools/qa/asset-loading.html`. It boots a temporary character in memory and never opens persistent character storage. Use its walk, backtrack and stair controls to exercise the actual controller and loading path. Reports include resource requests, frame-time percentiles, long tasks, WebGL errors, renderer counters and cache statistics. The review character receives temporary health restoration for inspection.

The runtime exposes `window.__bw.assetLoading` and `window.__bw.runtime.dungeonScene.streaming.stats`. `built.ready` now waits for the currently nearby room set, not the entire floor. All room leaf APIs retain `ready`, `loaded`, load injection and idempotent disposal.

At implementation time, the Mac was locked, so a live before/after frame-rate measurement was unavailable. React Doctor's repository scan includes existing reference, legacy and vendor findings. Its warnings about awaits in the new staging loops are intentional, and the small spatial-array operations run at 5 Hz. No scanner rules or test thresholds were weakened.

Validation on 9 September 2026:

- All 13 streaming policy/lifecycle tests and six spatial/real-asset tests pass. Existing room streaming, art, routes, models (135 checks), application wiring (192 checks) and runtime transitions (191 checks) pass. The runtime suite was rerun independently by the dungeon task with the final arrival handoff present.
- The production build passes. The existing bundle-size and ineffective dynamic-import warnings remain.
- The full `npm test` run reports three failing suites: editor fixture counts affected by the existing authored tile, the wayside cold-time budget (2.59 ms against 2 ms), and one minimap timing sample (5.90 ms against 4 ms). The minimap suite passes all 177 checks in isolation. The dungeon task independently observed the editor and wayside failures before this streaming change.
- React Doctor's changed-file scan reports zero errors and one warning (90/100); its repository-wide scan also includes unrelated reference and vendor code. No dependencies or lockfiles changed. This repository uses npm and has no `check` script.
