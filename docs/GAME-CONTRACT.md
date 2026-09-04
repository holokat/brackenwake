# Brackenwake game entry: the contract

The farm entry (`src/farm/main.js`, `Homestead` in `src/farm/farm.js`) is
retired. The game boots from `src/game/main.js`. The world modules in
`src/world/` are kept as they are; the farm modules are a library we borrow
from (`tree_edit.js` for chop and mine, `catalog.js` for goods and prices,
`assets.js`, `buildings.js`, `processors.js`, `camp_models.js` for town kits,
`audio.js` later). Nothing in `src/game/` imports `farm.js` or `main.js`.

Every module below exports exactly the names given. Modules talk only through
these surfaces; `main.js` is the only file that knows all of them.

## `src/game/scene.js`
```js
createScene(container) -> {
  renderer, scene, camera,          // THREE objects; camera is PerspectiveCamera(55, aspect, 0.1, 1800)
  lights: { sun, hemi, ambient },   // sun is the shadow-casting DirectionalLight
  setDay(dayFactor),                // 0 night .. 1 day: sun/hemi/ambient intensity, sky dome crossfade, fog colour
  setFog(near, far, colorHex?),     // world sets 90/536 in the open, the dungeon sets its own
  follow(pos),                      // sky domes, sun disc, moon and the shadow frustum ride with this point
  resize(), render(),
  dayFactor(nowMs),                 // 6 minute cycle, same curve as the farm had
}
```

## `src/game/world_runtime.js`
Ports `_buildWorld`, `_updateWorld`, `enterDungeon`, `dungeonGo`, `leaveDungeon`,
`_updateDungeon`, `_pickDungeon` out of `farm.js` onto the scene object.
```js
createWorldRuntime(sc, opts) -> {    // sc = the object from createScene; opts = { seed, homeBiome }
  field, world, flora, fauna, discovery, siteMarkers,
  heightAt(x, z),                   // terrain, or the dungeon floor (y = 1) while inside
  update(dt, nowMs, x, z, dayFactor),
  sitesNear(x, z, r),
  pick(raycaster) -> { kind: 'site'|'exit'|'tree', site?, exit?, tree? } | null,
  enterDungeon(site), dungeonGo(dir), leaveDungeon(),
  get inDungeon, get dungeonLevel,
  clampWalkable(x, z) -> [x, z],    // identity above ground; nearest floor cell underground
  onDiscover(fn), onDungeonState(fn),
  dispose(),
}
```

## `src/game/input.js`
```js
createInput(domElement) -> {
  keys: Set,                        // lowercase e.key values
  down(key) -> bool,
  pressed(key) -> bool,             // true on the frame a key went down, then false
  drag: { dx, dy, active, button }, // mouse drag deltas since last frame (consumed by camera)
  wheel,                            // accumulated wheel deltaY since last frame
  click,                            // { x, y, button } for a quick click this frame, else null
  pointer: { x, y },                // NDC of the cursor
  endFrame(),                       // zero the per-frame accumulators
  dispose(),
}
```

## `src/game/player.js`
```js
createPlayer(scene) -> {
  group, pos,                       // pos is group.position, feet on the ground
  yaw, speed,                       // facing and current horizontal speed
  update(dt, move, heightAt),       // move = { x, z (camera-relative, -1..1), sprint, jump? }
  setVisible(bool), teleport(x, z, heightAt),
  anim,                             // 'idle' | 'walk' | 'run'
}
buildCharacter() -> { group, parts: { head, torso, armL, armR, legL, legR } }
WALK_SPEED = 5.5, RUN_SPEED = 9.5
```
The character is procedural: boxes and cylinders, flat shaded, 1.8 m tall,
limbs swing as a function of distance travelled so the stride matches the
ground speed; idle breathes. Forward is +z in the model; `group.rotation.y`
turns toward the move direction with a short lerp. Feet sit on `heightAt`.

## `src/game/camera.js`
```js
createFollowCamera(camera, input) -> {
  mode,                             // 'follow' | 'fly'
  yaw, pitch, distance,             // follow: orbit about the player; drag rotates, wheel zooms 3..32 m
  update(dt, playerPos, heightAt),  // follow: place camera; keep it 1.2 m above the ground under it
  flyUpdate(dt, heightAt),          // fly: WASD + Q/E down/up, shift x4, wheel sets speed 20..400 m/s
  setMode(m),
  forwardYaw,                       // yaw the player moves relative to
}
```

## `src/game/state.js`
```js
createState() -> {
  coins, materials: { wood, stone, ore }, caps: { wood: 150, stone: 150, ore: 150 },
  tools: Set<'axe'|'pickaxe'|'bow'>, tool: 'hand'|'axe'|'pickaxe'|'bow',
  pos: { x, z },
  add(material, n) -> { added, dropped },   // capped, never silent
  spend(coins) -> bool, earn(coins),
  save(), load(),                   // localStorage key 'brackenwake-save-v1', versioned, additive
  onChange(fn),
}
```

## `src/game/interact.js`
```js
createInteract({ sc, runtime, player, state, hud, input }) -> {
  update(dt, nowMs),                // hover: names what the cursor is over within REACH of the player
  click(),                          // chop/mine with the held tool via tree_edit.js chopTree, or enter a site/exit
  REACH = 6,
}
```
Wrong tool, out of reach, sapling regrowing: each says so through `hud.toast`.

## `src/game/shop.js`
```js
createShop({ state, hud }) -> { open(), close(), toggle(), isOpen }
```
Buys: axe 60, pickaxe 80, bow 120 (once each). Sells: wood, stone, ore at the
catalog's sell price (`GOODS` in `src/farm/catalog.js`). Opens with `B` or the
HUD button, only when standing within 40 m of a town or hamlet centre; says
where the nearest market is otherwise.

## `src/game/hud.js`
```js
createHud(root) -> {
  toast(html, kind?), setMaterials(m, caps), setCoins(c), setTool(t, owned),
  setPlace(text), setDev(on), setHint(text),
  el,
}
```
Plain CSS, no painted frames (declutter). Bottom: tool slots 1 to 4 (hand,
axe, pickaxe, bow), greyed when not owned. Top left: coins and materials. Top
centre: place name. Toasts bottom left. Dev badge top right when fly mode is on.

## `src/game/dev.js`
```js
createDev({ sc, camera, player, hud, runtime }) -> { toggle(), get on, update(dt) }
```
`F1` (and backquote) toggles. On: camera to fly mode from its current spot,
player hidden and frozen, badge shown, world streams around the camera. Off:
player teleported to the ground under the camera, camera to follow, badge off.

## `src/game/main.js`
Boots in this order: scene, state.load, runtime, player at state.pos (default
0,0), camera follow, input, interact, shop, hud, dev. Frame: input -> dev or
player -> camera -> runtime.update around the player (or camera in fly) ->
interact.update -> sc.follow -> sc.setDay -> render -> input.endFrame. Saves
state every 5 s and on unload. Exposes `window.__bw = { sc, runtime, player,
camera, state, hud, dev, input }`.

## Rules
- No em dashes anywhere. No farm imports except the library list above.
- Every state change says something on screen.
- Node tests for anything pure (controller math, camera clamps, state caps and
  save round trip, interact reach and tool rules).
- Do not use the browser; Fable verifies.
