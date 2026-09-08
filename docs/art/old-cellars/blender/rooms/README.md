# Old Cellars room environments

Eight original low-poly environment chunks, modeled by deterministic Python builders inside the installed Blender 5.2 MCP session on isolated port 9879. No external models, texture downloads, production dependencies, live Blender UI scenes, or real-project files were used.

The identity sources are the saved generated references in `docs/art/old-cellars/references`: `01-04-room-sheet.png`, `05-07-room-sheet.png`, and `08-buried-cathedral.png`.

## Files and integration

`assets/models/cellars/rooms/manifest.json` is the runtime contract. Every room also has a GLB, editable compressed `.blend`, and detailed JSON manifest. GLBs contain mesh batches and named effect anchors. Cameras and actual lights are excluded. Runtime lighting and particle effects belong to the existing game library.

All coordinates are local metres, Y up, forward +Z. Place levels 1 through 7 at room index 4 and level 8 at room index 2, with origin at that room's center and `cellarHeight` height. The geometry builder converts game coordinates `(x,y,z)` to Blender `(x,-z,y)`; glTF's Y-up export restores the game contract.

`ground` describes a flat elliptical footprint with a transition margin. The normal rooms use radii 46 by 36 metres; the cathedral uses 80 by 80 metres. Blend the game terrain toward the room's origin height around the margin. Keep the external generated corridors and portals. The cavern roof is a separate material batch named `Cellar ceiling`, allowing an overhead gameplay camera to hide it without hiding vault ribs, galleries, props, or walls.

Level 6 has a 30 by 30 metre pit, 16 metres deep. Remove the original terrain only within that hole after the GLB is ready. Two crossing bridges remain at ground level. Two 5 metre wide switchback flights at local X 11 and 4.8 metres connect the bottom, the middle landing at -8 metres, and the rim at 0 metres. The manifest includes the pit bottom, both ramp colliders, and landings. All gallery switchbacks likewise use separate lanes 6.2 metres apart so the next flight cannot block an actor's head.

`colliders` uses the existing game contract: `kind`, `model`, `x`, `y` as the base, `z`, `w`, `h`, `d`, `c`, `s`, and `direction` on Z-aligned ramps. `routes` gives the endpoints and widths of each modeled flight. `anchors` gives stable names, kinds, positions, colors, intensities, and radii for library effects. Brightness values require tuning to the game's lighting system and should be capped by its existing local-light budget.

## Authored architecture

| Room | Defining modeled architecture |
| --- | --- |
| Broken wine vault | Two cask tiers with individual staves and iron hoops, timber roof ribs and knee braces, feast tables, goblets, benches, red diamond banners |
| Sunken reliquary | Four pools, crossing stone bridges, articulated fish vertebrae and ribs, long toothed jaws, burial shelves, cyan braziers |
| Bellkeeper's tomb | Hollow great bell with a through-metal jagged fracture, clapper and casting bands, four contiguous chains, two tomb-gallery levels |
| Funeral furnace | Faceted burning furnace face with an open mouth passage, molten floor grates, raised conveyor rollers and coffin carts, hanging braziers |
| Lich's archive | Three accessible gallery levels, forty tall bookcases with individual volumes, tilted open grimoire leaves, suspension chains, brass orrery |
| Hanging sarcophagi | Nine upright coffins with carved skeletal relief, suspension crown and chain network, deep ritual shaft, crossings and escape stairs |
| Grave of the first king | Colossal skull, sixteen great ribs, suspended spine bridge linked to both upper galleries, side mausoleums, twin shrine stairs, fallen sword |
| Heart beneath the world | Tall Gothic nave, vaulted ribs, three gallery levels, skull shelves, diamond banners, thin gold floor inlays, chained lanterns and chandeliers |

## Rebuild and evidence

Use `tools/blender/cellars/mcp_client.py --port 9879 --script tools/blender/cellars/rooms/build-and-render.py` against the isolated official Blender MCP bridge. The builder clears only that isolated scene and imports fresh source modules on every run. A fixed per-room seed controls geometry variation. No image is used as a texture or substitute for modeled geometry.

`mcp-vault-review-log.json` records the final complete build and 24-view render pass, including the irregular geological ceilings. The earlier `mcp-build-log.json`, `mcp-render-log.json`, `mcp-bell-review-log.json`, and `mcp-camera-review-log.json` record development passes and targeted bell, bridge and camera corrections. `build-provenance.json` records asset hashes and measured triangles. `render-evidence.json` binds each render set to its exported GLB hash. All render images come from importing the exported GLBs into Blender and using Cycles CPU. Hero and reverse views show the intact roof. Overhead views hide only the ceiling batch as an architectural cutaway. These review lights demonstrate the intended warm and cool balance; the game uses the exported anchors and its own effect implementation.

`mcp-structure-review-log.json` records the subsequent cathedral structure correction and its refreshed hero, reverse and overhead views. Cathedral arch voussoirs, pier and ashlar stones, keystones, stair stringers and treads now occupy three protected stone material batches. These retain the original prism and bevel geometry through the budget pass. The remaining cathedral meshes share the remaining triangle allowance, with the complete room still below 200,000 triangles. Rooms 1 through 7 retain identical GLB hashes. All eight collision, route, landmark, anchor and ground contracts remain unchanged. `structural-polish-evidence.json` records before/after component counts and the negative control against the previous decimated mesh.

## Four-pass review

| Pass | Result |
| --- | --- |
| Complete build | All eight themes, geometry, editable sources, manifests, galleries and portal approaches were built. |
| Art review | Open backgrounds were replaced with a faceted enclosing vault, floors gained staggered joints and cracks, skulls gained angular brows and cheekbones, and the fish gained long toothed jaws. |
| Defect review | Overlapping bridge faces were removed. A pit escape route was added. Chain links were made contiguous. Export counts and bounds now come directly from the final GLB. Actual game-physics tests exposed stair head clearance and a shrine landing edge; separate switchback lanes and longer shrine flights corrected both. |
| Polish | Hanging coffins gained skeletal relief, grimoire pages open at an angle, burial debris fills perimeter groups, and local candle bounce reveals nearby stonework. Parent art review rejected the radial roof spokes. Seven staggered, perturbed rock rings and scattered small stalactites replace that ceiling, with the collision and route coordinates preserved. |

The final actual-game review identified cathedral arcade prisms that the budget modifier had reduced to tetrahedra. Focused protected batches restore those stone profiles and the complete stair geometry. The geometry gate now inspects connected exported pieces, rejects structural pieces below 12 triangles, and requires the first stringer and all 33 first-flight tread boxes to retain their full form. The former decimated asset fails this added assertion.

The environments preserve the reference themes, silhouettes, and major architecture. They use a cleaner, more geometric low-poly treatment than the references' dense chipped masonry and sculpted ornament. They do not include bosses. Runtime collision composition, animated VFX, local-light limits, mobile performance, and actual game screenshots belong to the integration review.
