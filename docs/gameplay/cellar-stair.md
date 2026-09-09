# First Cellars descent

The downward exit in Blackhand’s command vault has a stone stairwell with eight exposed treads, two lanterns, a dark arch at the foot, and a brass arrow in the approach. Its threshold remains at the existing first-floor exit, so the minimap marker, destination and return landing agree.

The three mesh batches are built with the level and remain present while room artwork loads or is evicted. They contain 966 triangles, use no textures, and reuse the existing stair light. The collision envelope keeps players on the landing until they activate the exit. The click target covers the stair and its lantern posts.

The room asset previously covered the descending steps with solid floor tiles. `scripts/art/cellar-stair/cut-floor.mjs` removes only the floor and ground-level inlay triangles at the stair opening. Comparison with the preceding asset found 494 removed triangles in two index lists, with all other scene metadata and binary data unchanged. The small loading shell has a matching floor opening and retains its solid ceiling.

The canonical model is `src/world/cellar_stair_model.js`. An editable Blender copy is in `assets/models/cellars/stair/command-stair.blend`. The image in `docs/concepts/cellars-descent/stair-down.png` is a Blender render of that geometry in the shipped boss room; it is not a browser screenshot.

Verification covers the actual GLB through the real dungeon furnishing and room-loading path: every tread stays visible in both the loading shell and loaded room; the enlarged click target selects the existing down exit; the landing is reachable and can be left after returning; players cannot cross the open flight at the old floor height; the ceiling remains intact; owned resources dispose once; and other floors do not receive this treatment. Route tests cover all eight Cellars levels. Browser visual review remains pending.

For local visual review, open `/tools/qa/asset-loading.html?solo&stair` on the Vite server. It boots the real game with temporary memory storage, protects the review character from combat, and places them at the first boss stair. Clicking the flight uses the normal level transition.
