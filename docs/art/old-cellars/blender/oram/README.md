# Sergeant Oram Blackhand

This asset follows the generated Oram turnaround in `docs/art/old-cellars/references/01-oram-turnaround.png` and the existing `oramBlackhand` canon in `src/mmo/monsters.js`. The authored height is a 1.90 m design choice; integration must preserve the existing boss's combat stats and runtime scale.

The model includes the black Legion halfcoat, double brass button rows, gorget, one left pauldron, right black gauntlet, red sash, right hip sack with open eggshell fragments, short beard, cropped black hair, brass brow stud, riding boots and longsword. Surfaces use faceted geometry and per-face vertex color. The sword, gauntlet and pouch are part of the skinned asset.

## Files

- `assets/models/cellars/oram/oram.glb`: game asset.
- `docs/art/old-cellars/blender/oram/oram.blend`: editable authored mesh, materials, vertex groups, armature and actions.
- `tools/blender/cellars/oram/build.py`: deterministic composition root.
- `tools/blender/cellars/oram/geometry.py`: shaped panels, rings, shell fragments and hand geometry.
- `tools/blender/cellars/oram/animation.py`: authored clips and evaluated mesh grounding.
- `tools/blender/cellars/oram/review.py`: imports the delivered GLB, measures it and renders eleven views.
- `tools/blender/cellars/oram/repeat.py`: proves a fresh MCP build matches the prior GLB byte for byte.
- `build-report.json`, `import-review.json`, `runtime-validation.json`, `reproducibility.json`: bound evidence.

## Integration contract

The GLB uses metres, Y up, forward +Z and feet at Y=0. Its bind size is 0.971868 m wide, 1.900000 m tall and 0.394677 m deep, including the weapon. It has 7,536 triangles, 14 material meshes and one 19-joint skin. The file is 1,237,572 bytes. No cameras, lights or external textures are exported.

Anatomical right is -X. The embedded sword and black gauntlet follow `hand_R`; the single pauldron follows `upperarm_L`. The existing runtime's generic R/L anchor convention differs, so do not add a second generic weapon. Preserve `COLOR_0` and the authored material palette. The extra `coat_R`, `coat_L`, `sash` and `pouch` joints handle attachments without changing the standard torso and limb names.

| Clip | Duration | Purpose |
| --- | ---: | --- |
| idle | 2.400 s | Breathing and small attachment motion |
| walk | 1.000 s | In-place stride |
| run | 0.683 s | In-place charge locomotion |
| attack | 0.917 s | Sword windup, diagonal strike and recovery |
| hurt | 0.450 s | Hit recoil |
| die | 1.450 s | Forward collapse to a grounded final pose |
| cast | 1.100 s | War cry gesture |
| special | 1.000 s | Forward sword charge gesture |

Animations carry 120 Hz authored samples. Runtime validation loads the GLB with the installed Three.js `GLTFLoader` and evaluates `AnimationMixer` at approximately 60 Hz, including between export samples. The lowest sampled point is -0.000199 m during run. The death clip ends at a maximum height of 0.407137 m. Gameplay timing and displacement remain server-owned.

## Rebuild and verify

Run a dedicated background Blender MCP bridge on port 9878, then invoke the installed bridge client from the staging root:

```sh
/opt/homebrew/bin/blender --background --command blender_mcp --host 127.0.0.1 --port 9878
/opt/homebrew/bin/python3.13 tools/blender/cellars/mcp_client.py --port 9878 --script tools/blender/cellars/oram/build.py
/opt/homebrew/bin/python3.13 tools/blender/cellars/mcp_client.py --port 9878 --script tools/blender/cellars/oram/finalize.py
node tools/blender/cellars/oram/validate.mjs --record
node tools/blender/cellars/oram/verify-source.mjs
```

This workflow clears only its dedicated background session. It never resets the user's active Blender window. Local socket access and Blender startup require the approved escalation on this Mac. No dependencies were installed and no generated files were written through the `public` or `node_modules` symlinks.

## Four-pass review

| Pass | Findings and resulting changes |
| --- | --- |
| Complete implementation | Authored the full uniform, face, hair, boots, sword, sack and eight clips. Saved an editable rigged source and exported through MCP. |
| Domain review | Added the cropped nape, irregular cloth and leather face colors, tailored collar and belt-to-skirt transition after comparing imported front/profile/rear views with the reference. |
| Correctness and integration | Fixed Blender numeric name suffixes, removed importer display helpers from measurements, and verified actual Three.js skinning. Increased sampling to fix subframe foot penetration in run. |
| Polish | Reframed raised sword and fallen-body captures so the full attachment chain remains visible. Rechecked the final silhouette and animation stills, then required an identical-byte rebuild. |

The reference is reconstructed as an authored low-poly model, with simplified cloth damage and a stylized face. The source has no texture dependency. Actual game registration, encounter placement, full-scene lighting and mobile performance are owned by the parent integration task.
