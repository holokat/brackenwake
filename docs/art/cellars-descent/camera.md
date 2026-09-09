# Dungeon camera collision

The follow camera now retracts against static architecture before rendering.
The player's requested zoom stays intact and returns gradually after the view
has been clear for 120 ms. The final interpolated position is swept again, so a
fast orbit cannot cut through a corner between two otherwise valid positions.

The sweep covers the camera's near-plane diagonal, with at least 28 cm of
clearance. It uses the existing physical envelopes, continuous dungeon floor
bounds, and the actual loaded Blender surfaces. Triangle queries are two-sided
and include triangle edges and vertices. The old grid correction after the
follow update has been removed; it no longer fights camera smoothing.

Mesh indices are built in bounded jobs on the existing asset work queue before
room attachment. Repeated GLB geometry shares its index. Room eviction removes
its camera surfaces, and weak cache entries expire with their geometry. Moving
cloth, water and soft effects do not move the camera. The loading shell retains
the synchronous collision envelopes until the detailed artwork is ready.

When a wall requires an extremely close view, the camera retains its heading.
Only the local character meshes are hidden below 80 cm and restored above
115 cm. The character's light, game state and other players stay active.

## Verification

- `node src/world/collision/camera.test.mjs`: thin and rotated walls, corners,
  active/inactive fixtures, pillars, lintels and both sides of ramps.
- `node src/world/collision/camera-mesh.test.mjs`: actual triangle faces, edges,
  vertices, back faces, transformed instances, cancellation and eviction.
- `node src/game/camera_obstruction.test.mjs`: 300 stationary frames, 360 corner
  frames, 180 recovery frames, immediate retraction, preserved zoom, stable
  fully retracted heading and local-body visibility.
- `node src/game/camera.test.mjs`: existing camera and input checks.
- `node src/world/cellar_camera.test.mjs`: 15,336 camera updates across all eight
  Old Cellars layouts, plus 360 independent rays against the entry GLB. The
  uncorrected orbit hits stone in 289 of those sampled views, proving the
  rendered-wall oracle exercises obstructed views.

The Brave playtest at `http://localhost:5198/tools/cellar-entry-playtest.html?room=camera`
uses a temporary character and memory-only storage. Choose **Test camera orbit**
to exercise the reported nave wall, the connector and the gallery using the
production frame loop. The reviewed run recorded 1,100 frames, 817 obstructed
frames, zero penetration and WebGL error 0. Its additional diagnostic camera
query peaked at 2.1 ms; this is not a whole-frame performance benchmark.

The same live session walked from (1, 0, 175) to (1, -3, 120.89555) through the
connector without jumping. Screenshots were visually reviewed at the reported
wall, beneath the gallery and after recovery into the nave. No saved character
storage was opened. These changes are local game changes; marketing deployment
does not publish them to the production game.

The final production build passed. The broad `npm test` run passed the camera,
streaming, dungeon traversal and integration suites, but retained the existing
editor fixture failures and minimap/wayside timing failures. The isolated
minimap rerun passed all 177 checks. No timing threshold or fixture was weakened.
