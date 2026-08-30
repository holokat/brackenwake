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
> 4b. **Colour must come out exactly as specified. This is where output usually goes
>    wrong, so check each one:**
>    - The hex values below are **sRGB**. glTF `baseColorFactor` is **linear** — convert,
>      do not paste the sRGB value into a linear field, and do not double-convert.
>    - **`metallic` = 0.0 for everything**, including `farm-metal`. Any metalness above 0
>      on a non-metal turns the colour grey and flat. This is the single most common
>      cause of washed-out results.
>    - **`roughness` 0.55–0.8.** Not 1.0 (dead and chalky), not below 0.4 (shiny).
>    - **No emissive, no ambient occlusion, no baked lighting or shadow tinting**, and no
>      vertex colours. Lighting is the game's job; bake none of it in.
>    - Do **not** desaturate, lighten, mute, harmonise, or "tastefully adjust" the
>      palette. Do not blend colours toward each other for cohesion. Use the exact
>      values. They are deliberately saturated and are meant to look punchy.
>    - Alpha is 1.0 everywhere. Nothing transparent.
> 5. **Stylised low-poly, not crude low-poly.** Bevel your edges — a small chamfer on
>    planks, posts and roof edges is what stops a model reading as flat cardboard, and
>    it costs only triangles, which are free. Use flat/faceted shading where the form
>    should look chunky (rock, earth, thatch) and smoothed normals with bevelled edges
>    where it should look crafted (timber, metal, tiles). Mix them per part.
> 6. **Polygons are NOT a constraint — spend them freely, and lean detailed.** Do not
>    decimate, do not simplify a silhouette to save triangles, do not skip detail for
>    performance. The game pushes 500,000+ triangles without noticing; the only budget
>    that matters is the material count in rule 3. Aim for the *upper* end: 2,000–5,000
>    triangles for a small prop, 8,000–25,000 for a building, up to 60,000 for a hero
>    landmark. If more geometry makes it look better, use more geometry.
> 7. **Transform:** Y-up. Origin at the base centre, model sitting on y = 0 (nothing
>    below the origin). Front of the model faces **+Z**. Real-world scale in metres — a
>    barn about 6 m tall.
> 8. **No animation, no skeletons, no cameras, no lights** in the file. Static geometry
>    only.
> 9. **Where to spend the detail.** The camera sits at roughly 45° and can orbit, so
>    put the work into things that read from there and break the silhouette: roof
>    overhangs and ridge caps, chimneys and vents, ladders, brackets, hinges, pulleys,
>    stone footings under timber, stacked goods and small attached props (sawhorses,
>    crates, bundles). Chamfer every hard edge. Vary plank widths and let boards sit
>    slightly proud of each other rather than forming one flat face.
>
> 10. **Where not to.** Skip interiors, backfaces, undersides and anything below the
>     base — none of it is ever seen, and it is the one kind of geometry that buys
>     nothing.
> 11. Detail that reuses an existing material costs **nothing**. Detail that introduces
>     a new material costs an entire draw call. When choosing between "more shape" and
>     "one more colour", always take more shape.
>
> **The shared material list — use these names and colours verbatim**
>
> | name | hex | use |
> | --- | --- | --- |
> | `farm-wood` | `#B5783A` | planks, posts, beams — warm amber, not brown |
> | `farm-wood-dark` | `#6E4A28` | frames, sills, shadowed timber |
> | `farm-wood-light` | `#D9A45E` | highlight planks, door boards, ladders |
> | `farm-stone` | `#A9A69F` | dressed stone, footings |
> | `farm-rock` | `#7C766C` | rough rock, rubble |
> | `farm-stone-dark` | `#5E5A54` | base courses, stone in shadow |
> | `farm-plaster` | `#EFE7D5` | plaster and painted walls |
> | `farm-trim` | `#F7F1E2` | window frames, edging, light trim |
> | `farm-roof-red` | `#A8382B` | barn-red walls and doors — deep and saturated |
> | `farm-roof-cap` | `#8E2F24` | ridge caps, darker red accents |
> | `farm-roof-slate` | `#2E3439` | slate roofs — near-black charcoal |
> | `farm-metal` | `#8D9299` | hinges, straps, pipes, machinery |
> | `farm-window` | `#1E2529` | glass and dark openings |
> | `farm-gold` | `#E0B23F` | brass, straw bales, finials |
> | `farm-soil` | `#6B4A2A` | tilled earth |
> | `farm-dirt` | `#97653A` | paths, bare ground |
> | `farm-grass` | `#8FBB43` | grass and turf — yellow-green, vivid |
> | `farm-leaf` | `#4E9B32` | foliage |
> | `farm-leaf-dark` | `#37702A` | foliage in shadow |
> | `farm-water` | `#4FB2D9` | water surfaces |
> | `farm-water-deep` | `#2F7E9E` | deep water |
> | `farm-cloth` | `#E8D3A4` | canvas, awnings, sacks |
> | `farm-thatch` | `#C9A05A` | thatch, straw, hay |
> | `farm-accent-blue` | `#8FC4DA` | ice, cold-store panels, painted accents |
>
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
