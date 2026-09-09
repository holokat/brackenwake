# Cellars stairways

Every Cellars level uses a matching stair family. The return route has seven rising treads, coursed stone side walls, lantern posts and a tall arch. It heads south, behind the arrival point, leaving the route into the dungeon clear. The first level uses this style as its loading fallback, then shows the already-authored entry stair when that room is ready. Evicting the room restores the styled fallback.

All seven downward exits have eight recessed treads, a low stone surround, lanterns and an arch at the foot. Brass tread edges and an inlaid approach arrow distinguish each flight from the room floor. Exit locations, minimap markers, level destinations and return landings are unchanged. Both click targets cover the stair and lantern posts.

Each model uses three static mesh batches and no textures. The ascending model has 1,434 triangles; the descending model has 966. Existing entrance and descent lights are reused. The physical ramp supports the ascending flight, side walls prevent crossing through its masonry, and the descending pit keeps players at the landing until they activate the exit.

The room assets previously covered descending steps with solid floor tiles. `scripts/art/cellar-stair/cut-floor.mjs` patches all seven boss assets, removing only floor and ground-level inlay indices at their shared stair opening. Each patch removes 494 triangles from two index lists. The small loading shells have matching floor openings and retain their solid ceilings.

`src/world/stair_mesh_builder.js` shares masonry, arch, lantern and inlay construction. `src/world/cellar_stair_model.js` composes the two models, and `src/world/cellar_stair.js` owns their placement, interaction and cleanup. Editable Blender copies are in `assets/models/cellars/stair`. The images in `docs/concepts/cellars-descent` are Blender renders of the actual model geometry in the shipped rooms, not browser screenshots.

Regression checks cover all eight levels with loading shells and actual room GLBs: visible rising and descending treads, enlarged hit targets, clear arrival paths, room eviction, resource disposal and hiding the old hoop-and-block models. Existing route and runtime tests cover going down to the final level and returning to the surface. Browser visual review remains pending.

For local review, use `/tools/qa/asset-loading.html?solo&stair=up&level=2` or `/tools/qa/asset-loading.html?solo&stair=down&level=2` on the Vite server. Change the level from 1 to 8 as needed. The page boots the real game with temporary memory storage and protects the review character from combat. Clicking the flight uses the normal level transition.
