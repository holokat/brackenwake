# Polish contract: fidelity, gear on the body, and the dev bench

The game plays. Now it has to look like a world and be testable end to end.
This document is the shared surface for the polish wave; every agent reads it
and codes against it. The user's direction, verbatim in spirit: "I do not want
a low poly game, I want to get as close to high fidelity as possible". Low poly
was a constraint of tooling, not a style choice. Every visual decision leans
toward realism within a WebGL budget: real textures (generated in code, high
resolution), real lighting (physically based materials, ACES tone mapping,
soft shadows), volume in the vegetation, water that reflects and refracts.

## The rig contract (player and monsters)

Anything that stands in the world exposes the same rig so effects, gear and
animation code never ask what it is made of:

```js
rig = {
  group,                         // THREE.Group, feet at y = 0, faces +z
  parts: {                       // THREE.Object3D anchors, always present
    hips, torso, head,
    armL, armR, handL, handR,    // handR is where a weapon attaches, handL a shield
    legL, legR, footL, footR,
    back,                        // cloak and bow anchor, on the torso
  },
  setAnim(name),                 // 'idle' | 'walk' | 'run' | 'swing' | 'cast' | 'hurt' | 'die' | 'air'
  update(dt, speedMps),          // drive the clips; procedural or skinned, same call
  setAppearance(appearance)?,    // build, skin, hair, hairColour, marks, height
  dispose(),
}
```

`buildCharacter(appearance)` in `player.js` returns this. `buildMonsterModel(id)`
in `monster_models.js` returns this. A skinned glb rig maps bones to `parts` by
name; a procedural rig maps its meshes. Code that swings the arm writes to
`parts.armR.rotation` and works on both.

## Gear on the body

`src/game/gear_visuals.js`: `dressRig(rig, equipment, opts)` puts what is
equipped on the anchors and removes what is not: the weapon model in `handR`
(two-handed: both hands close on it), the shield in `handL`, bow on `back` when
a melee weapon is drawn and in `handL` when ranged is the active set, helmet on
`head`, pauldrons and breastplate on `torso`, greaves on the legs, boots, gloves,
cloak on `back`. Armour pieces are meshes sized to the rig from the tier's
material: cloth reads as fabric, leather as matte hide, mail as a ring pattern,
plate as brushed metal, each a generated texture with roughness and normal
maps, tinted by the item's material (ores.js metal colours) and rarity glow on
mythic and legendary. Called after every equip and unequip through
`inventory.onChange` and once at boot.

`src/game/weapon_models.js`: `buildWeaponModel(item | baseId, opts)` for every
weapon and shield base in items.js plus the kit oddments (staff, bone staff,
lute, holy book, skull, torch, tome, pickaxe, axe). A parts kit (blade, guard,
grip, pommel, haft, head, limb, string, boss, rim) assembled per base with the
grip at the origin and the blade along +y so `handR` holds it right. Metal
colour by `item.material` through ores.js, wood grain, leather wraps, an
emissive rune line on epic and above. `auditWeaponModels()` builds every base
at load and throws if one has no recipe.

## Ability weapon requirements

A melee ability needs a weapon of its skill in the main hand; a Wrestling
ability needs empty hands; a ranged ability needs a bow or crossbow in the
ranged slot and ammunition in the pack; Parrying abilities need a shield; a
spell needs nothing in hand but a rooted cast. `abilities.js` gains
`weaponNeeds(ability)` and `weaponCheck(ability, equipment, pack)` returning
`{ ok, reason }` with the reason in words ("Power Strike wants a sword or an
axe in your hand"), and the runtime refuses through the same reason. A plain
swing with no weapon is a Wrestling swing with fists, as items.js `fists`.

## Water and sky

`src/world/water.js`: `createWater(sc, field, opts)` renders every water
surface the field has (ocean, lakes, rivers) with the Gerstner wave shader
ported from `docs/reference/aqua-ocean-studio.jsx`: reflection of the sky,
refraction of the scene through a half-resolution render target, depth-based
shore foam and shallow colour, subsurface light, wave crests, underwater tint
when the camera is below the surface. Rivers use the same material with the
wave height near zero and a flow direction. The sea level and the river mask
come from field.js; nothing about where water is changes.

`src/game/sky.js`: `createSky(sc)` with `update(dayFactor, camPos, dt)`: the
analytic sky from the same reference (zenith, horizon, sun disc, glare, fbm
clouds) driven by the six minute day: sun elevation and colour by time, dusk
and dawn palettes, a night sky with stars and a moon, and fog colour read off
the horizon so the terrain meets the sky. `sc.setDay` calls it.

## Trees and ground

`src/world/tree_gen.js`: `buildTreeVariants(species, seed, count)` grows trees
from a branching model (trunk taper, recursive branches with gravity and
phototropism, per species parameters) into a merged geometry: bark as a
tapered tube with a generated bark texture and normal map, foliage as leaf
clusters (alpha-tested generated leaf textures on camera-independent quads,
enough of them that the canopy has volume, no spheres). Species: oak, birch,
pine, fir, willow, palm, sakura, dead. Variants are baked once and instanced by
`flora.js`, which keeps its record contract so `chopTree` and everything that
raycasts a tree keeps working. Grass becomes blades in the wind.

`src/world/terrain_material.js`: the ground is a physically based material
with a biome splat (grass, dry grass, dirt, rock, sand, snow) blended by
biome, height and slope, each layer a generated tileable albedo, normal and
roughness texture; slope shows rock; roads are a worn dirt track with soft
edges, not a hard band. Chunk seams: normals are computed from the field, not
the chunk mesh, so no crease shows at a chunk or LOD border.

## The dev bench

`F1` keeps toggling fly. `F2` opens `win_dev.js`, the dev window: gold, any
item by base and rarity (identified), every skill to 100 or back, learn every
ability, god mode (no damage), a list of every site within 6 km by kind with
Teleport and Enter for dungeons and caves, spawn any monster at the cursor,
time of day slider, kill target, heal, reset cooldowns, show colliders and
chunk borders. Dev mode is written to `character.settings.dev` and the badge
stays on screen while it is on. Nothing in the dev bench has a second code
path: giving an item is `inventory.add(makeItem(...))`, teleporting is
`player.teleport` plus `monsters.rescan`.

## Ownership

| files | owner |
| --- | --- |
| src/world/water.js, src/game/sky.js | V1 |
| src/world/tree_gen.js, src/world/flora.js, grass | V2 |
| src/world/terrain_material.js, src/world/chunks.js, renderer/lighting settings in scene.js | V3 |
| src/game/weapon_models.js, src/game/gear_visuals.js, player.js buildCharacter(appearance) | V4 |
| src/game/rig_glb.js, models.js, monster_models.js glb swap | V5 |
| src/game/dev.js, src/game/win_dev.js | G1 |
| src/mmo/abilities.js weapon rules, abilities_runtime.js gate | G2 |
| monsters.js: dungeon spawning, ranged and caster AI, bosses, flying | G3 |
| skinning.js, hide bases in items.js, trade_net.js, win_trade.js | G4 |
| tools/synth-sfx.mjs, audio.js cues, effects.js sound hooks | G5 |
| main.js, world_runtime.js and scene.js wiring, verification | Fable |
