# Model authoring prompt — low draw calls, shared palette

Measured on 2026-08-30: the procedural objects cost **~33 draw calls each** (a Small Pen
is 35 separate meshes) and the scene carried **8,477 distinct materials across 513
objects**, because `mat()` news up a fresh material per mesh. At 313 placed objects the
game ran at 21 FPS — on 385k triangles, which is nothing. **Draw calls are the
bottleneck; triangles are free.**

The practical consequence for art: **do not hold back on geometry.** The old procedural
props are crude *and* expensive — they cost 33 draw calls to draw a shape with 40
triangles. A far more detailed authored model, merged by material, is both prettier and
several times cheaper. Detail is not what costs us.

The Japanese landmark pack proves the target is reachable: the castle is 19,588
triangles in **9 draw calls**.

Paste the block below into whatever is generating the models.

---

## THE PROMPT

> Produce low-poly game props as **.glb** files for a Three.js farm game. Optimise for
> **draw calls, not triangles** — triangles are cheap, materials are not.
>
> **Hard requirements**
>
> 1. **Use only the shared material list below.** Never invent a new material, never
>    create a per-object or per-mesh material, never append a suffix. Every model in the
>    pack draws from this same list so materials are shared across the whole scene. Use
>    the exact names and exact hex values.
> 2. **Merge geometry by material.** All faces using the same material must end up in a
>    single mesh. One model = at most one mesh per material used.
> 3. **Budget: at most 12 materials per model** (so at most 12 draw calls). Small props
>    should sit around 4–6, buildings 8–12. Prefer reusing a colour already in the model
>    over introducing a new one — but do not sacrifice the look to save a material.
> 4. **No textures, no UV maps, no image maps of any kind.** Flat colour materials only.
>    No Draco, Meshopt or KTX compression — the loader has no decoder.
> 5. **Flat / faceted shading.** Hard edges, no smoothing groups, no bevels. Chunky
>    low-poly silhouettes, readable from a distance at a 45° camera.
> 6. **Polygons are NOT a constraint — spend them freely.** Do not decimate, do not
>    simplify a silhouette to save triangles, do not skip detail for performance. The
>    game runs 500,000+ triangles without breaking a sweat; the only budget that matters
>    is the material count in rule 3. Rough guide, and treat these as generous ceilings
>    rather than targets to hit: up to ~3,000 triangles for a small prop, ~15,000 for a
>    building, ~50,000 for a hero landmark. If more geometry makes it look better,
>    use more geometry. Add the bevelled plank, the roof overhang, the chimney pot, the
>    door hinge — as long as it reuses a material already in the model, it is free.
> 7. **Transform:** Y-up. Origin at the base centre, model sitting on y = 0 (nothing
>    below the origin). Front of the model faces **+Z**. Real-world scale in metres — a
>    barn about 6 m tall.
> 8. **No animation, no skeletons, no cameras, no lights** in the file. Static geometry
>    only.
> 9. Do not build interiors, backfaces or anything the player cannot see from an
>    outside 45° view.
>
> **The shared material list — use these names and colours verbatim**
>
> | name | hex | use |
> | --- | --- | --- |
> | `farm-wood` | `#9A7048` | planks, posts, beams |
> | `farm-wood-dark` | `#74522F` | frames, sills, shadowed timber |
> | `farm-wood-light` | `#B08757` | highlight planks, trim boards |
> | `farm-stone` | `#9A938A` | dressed stone, foundations |
> | `farm-rock` | `#76655A` | rough rock, rubble |
> | `farm-stone-dark` | `#5F5A54` | stone in shadow, base courses |
> | `farm-plaster` | `#F1E6CF` | plaster and painted walls |
> | `farm-trim` | `#F7EFDD` | window frames, edging, light trim |
> | `farm-roof-red` | `#B03A30` | barn-red roofs and doors |
> | `farm-roof-cap` | `#A8503A` | ridge caps, darker red accents |
> | `farm-roof-slate` | `#37474A` | slate / tile roofs |
> | `farm-metal` | `#8A8F96` | hinges, pipes, machinery |
> | `farm-window` | `#2E3A42` | glass and dark openings |
> | `farm-gold` | `#D9A93B` | brass, finials, small accents |
> | `farm-soil` | `#654428` | tilled earth |
> | `farm-dirt` | `#8A5A33` | paths, bare ground |
> | `farm-grass` | `#74BF58` | grass, turf |
> | `farm-leaf` | `#4F9636` | foliage |
> | `farm-leaf-dark` | `#3C7A2A` | foliage in shadow |
> | `farm-water` | `#4FB2D9` | water surfaces |
> | `farm-water-deep` | `#3A89AD` | deep water |
> | `farm-cloth` | `#E8D3A4` | canvas, awnings, sacks |
> | `farm-thatch` | `#C9A05A` | thatch, straw, hay |
>
> 10. Detail that reuses an existing material costs **nothing**. Detail that introduces
>    a new material costs an entire draw call. When choosing between "simpler shape"
>    and "one more colour", always take the simpler shape.
>
> **Deliver, per model:** the .glb, plus a line stating its triangle count, its mesh
> count, and the list of materials it uses.

---

## Checking what comes back

Reject anything that fails these. Load it and read the numbers rather than trusting the
description:

```js
// mesh count should equal the number of materials used
let meshes = 0; const mats = new Set();
gltf.scene.traverse((o) => { if (o.isMesh) { meshes++; mats.add(o.material.name); } });
console.log({ meshes, materials: [...mats] });
```

- `meshes` must equal `mats.size` — if meshes is higher, geometry wasn't merged
- every name in `mats` must be from the list above
- `meshes` ≤ 12 for a building, ≤ 6 for a small prop
- **the same colour must carry the same NAME in every file of the pack.** This is the
  one that actually decides whether the runtime can share materials: if one model says
  `farm-wood` and another says `wood-1`, they are two materials forever. Check across
  files, not just within one.

## On our side — and a correction

**Sharing materials does not, by itself, reduce draw calls.** In three.js a draw call is
issued per *mesh rendered*, so ten meshes are ten calls whether they share materials or
not. Material sharing saves memory and shader compilation — worth doing, but it is not
the lever. Earlier guidance in this file implied otherwise; this is the corrected version.

The lever is **instancing**:

1. **`InstancedMesh` per (model, material)** — group every placement of the same
   structure type and draw them together. Fifty storage sheds then cost the shed's ~11
   calls **in total**, not 550. The scenery trees already work this way; placed objects
   do not, and that is the single biggest win available.
2. **Deduplicate materials by name on load** — one `MeshStandardMaterial` per palette
   entry across the whole pack, instead of one per loaded file. Needed anyway for
   instancing to group cleanly, and it cuts memory.

### What the budget actually buys

Measured ceiling for smooth play is roughly **3,000–4,000 draw calls** for placed
objects (60 FPS held at 3,251; 43 FPS at 6,481).

| | calls per object | objects at 60 FPS |
| --- | ---: | ---: |
| old procedural props | ~33 | ~98 |
| these authored models | ~10 | ~325 |
| authored + instanced by type | ~10 **per type** | effectively unlimited |

So the authored models are already **3× cheaper than what they replace**, while looking
far better. Once placements are instanced, per-model call count stops mattering almost
entirely — which is why the ceiling above is 12 and not 6.
