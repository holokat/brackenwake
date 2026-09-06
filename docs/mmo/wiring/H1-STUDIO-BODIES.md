# H1: two studio bodies, a hatchling, and a clip bank beside them

Three files arrived that this repo does not build:

```
public/models/mmo/human-male.glb          9,902 tris, 51 bones, 1.80 m, one texture
public/models/mmo/human-female.glb       51,574 tris, 51 bones, 1.80 m, one texture
public/models/mmo/dragon-hatchling.glb   17,342 tris, 97 bones, 1.09 by 0.58 by 0.91 m
public/animations/human-male.json        36 clips, 36 moves, 77 abilities, 4.4 MB
public/animations/human-female.json      36 clips, 36 moves, 77 abilities, 6.9 MB
```

The two humans carry ONE clip each in the glb, a neutral hold, and their
motion in the JSON beside them. The hatchling carries all sixteen of its clips
in the file.

```
src/game/models.js          the ids, the bank, the alias table, travelSpeed
src/game/rig_glb.js         the Mixamo bone names, the wrist rule, the gender rule
src/game/player.js          the note on GENDERS, which now points at a real body
tools/validate-glb.mjs      three specs, a bank reader, textures allowed
tools/test-glb-env.mjs      new: enough of a browser for node to parse a texture
```

---

## 1. The bank format

```json
{
  "version": 1,
  "body": "human-male",
  "fps": 30,
  "clips": [ { "name": "walk", "duration": 1.33, "tracks": [ ... ] } ],
  "moves": {
    "walk": { "duration": 1.33333, "loop": true, "travelSpeed": 0.89, "events": [] },
    "light-attack": { "duration": 1.56667, "loop": false, "travelSpeed": 0,
                      "events": [ { "type": "swing-trail", "time": 0.1567 } ] }
  },
  "abilities": { "power-strike": { "school": "Warrior", "moves": ["light-attack"] } }
}
```

`clips` are `THREE.AnimationClip.toJSON` records; the track names are
`"<BoneName>.quaternion"` and `"<BoneName>.position"`, which bind to the glb's
joints by name. `loadModel` fetches the bank through three's own `FileLoader`,
so it takes the same LoadingManager, the same URL modifier and the same cache
the glb takes, parses every clip with `THREE.AnimationClip.parse` and hangs
them off the gltf's `animations`. From `instantiate` down there is no
difference between a clip that was in the file and one that was not:
`play`, `setSpeed`, `clipDuration`, `restFrames` and the mixer all see one set.

Where a bank clip and a glb clip share a name, the BANK wins: the bank is the
motion and the file's clip is a hold.

Which models fetch a bank is `MODEL_BANK` in models.js. `registerModel(id,
{ bank, alias, clips, rig })` adds one at runtime, which is what the test uses
to drive the whole path over a body it makes up.

## 2. The alias table

`CLIPS.human` is still the contract every caller writes against, and every one
of its eight names reaches a move that exists:

| asked for | plays on a studio body | note |
| --- | --- | --- |
| `idle` | `idle` | same name |
| `walk` | `walk` | same name |
| `run` | `run` | same name |
| `swing` | `light-attack` | translated |
| `cast` | `cast` | same name |
| `hurt` | `hit` | translated |
| `die` | `die` | same name |
| `jump` | `jump` | same name |
| `attack` | `light-attack` | the monster vocabulary, reaching a human body |
| `special` | `heavy-attack` | the same |

That is `STUDIO_ALIAS`, and `CLIP_ALIAS` says which models use it.
`clipAlias(id, name)` tries the name itself first, so a body that really has a
clip called `swing` keeps it; then the model's own table; then the old generic
one. A name that reaches nothing comes back null, as it always did.

Everything else in the bank is reachable by its own id, because the clips are
real clips on the real mixer: `play('two-handed-strike')`, `play('dodge')`,
`play('surface-swim')` all work. The 36 move ids are `STUDIO_MOVES`.

`abilityMoves(modelId, abilityId)` reads the bank's `abilities` table.
**abilities.js writes camelCase ids (`powerStrike`) and the bank was authored
in kebab (`power-strike`)**, so the match is made on letters and digits only
and both spellings find the same row. 77 of the game's 78 abilities are in the
bank; the one that is not is `camp`.

## 3. travelSpeed, and why the feet still slide

`locomotionRates(mps, travel)` now takes how far the clip itself covers the
ground, in metres a second, as authored:

```
rate = ground speed / travelSpeed,  clamped to [0.3, 1.8]
```

The Blender clips were authored AT the game's speeds and pass no travel, so
they still divide by `SPEEDS.walk` 7 and `SPEEDS.run` 18 and are unchanged.
The bank says walk 0.89 and run 7.98.

Measured: at the game's walking speed of 7 m/s the studio walk asks for 7.87x
and is held at rateMax 1.8x. The game's ground speeds are far above a real
human gait, so the clamp is what a studio body's legs run at almost always.
That is deliberate, and it is the same clamp that keeps a sprint from being a
blur, but it does mean travelSpeed changes nothing visible for the walk until
either the game's speeds come down or rateMax goes up. **The run's 7.98 m/s
also looks too high for a 0.67 s cycle**: it would be a 5.3 m stride pair.
Neither number changes what is on screen today because of the clamp.

## 4. The bones

The studio bodies are named the Mixamo way. `BONE_CANDIDATES` in rig_glb.js
holds both naming schemes in one list per anchor, and the mirror it has always
used still applies: **the contract's left rides the body's own right**, because
`buildCharacter` in player.js puts `armR` at +x and the gear tables were tuned
against that.

| anchor | studio bone | anchor | studio bone |
| --- | --- | --- | --- |
| `hips` | `Hips` | `torso` | `Spine1` |
| `back` | `Spine2` | `head` | `Head` |
| `armL` | `RightArm` | `armR` | `LeftArm` |
| `handL` | `RightHand` | `handR` | `LeftHand` |
| `legL` | `RightUpLeg` | `legR` | `LeftUpLeg` |
| `shinL` | `RightLeg` | `shinR` | `LeftLeg` |
| `footL` | `RightFoot` | `footR` | `LeftFoot` |

`WRIST_BONES` is new and matters: `anchorTarget` drops a hand anchor a forearm
below its bone when that bone is an elbow rather than a wrist, and it used to
decide that by asking whether the name started with `hand_`. `LeftHand` does
not, so without the list every sword on a studio body would have hung a forearm
below the fist.

Measured against `buildCharacter`, at rest, in metres: human-male's worst
anchor is `handL` at 0.175 m and human-female's is `handR` at 0.220 m. The
three Blender bodies are all inside 0.10 m. Gear hung in the hand will sit
further out on a studio body than the HOLD table was tuned for, and that is
worth a look before anything ships with a weapon in its hand.

## 5. The gender rule

`GENDER_MODEL` in rig_glb.js maps `male` to human-male and `female` to
human-female. `modelForBuild(build, gender)` returns the studio body when it is
in the cache and falls back to the three Blender builds when it is not, so a
player whose file has not arrived gets the body he has always had rather than
an empty group. `modelForAppearance(look)` is the same choice from a whole
appearance record, and fills in APPEARANCE_FALLBACK first.

`createGlbPlayer` asks for the studio body when it did not get one, and calls
`setAppearance` again when it lands, so a player built before the preload
finished does not keep the Blender body for the session.

What an appearance does NOT do on a studio body: both ship one texture and one
material, named `tripo_...`, so there is no `skin` slot and no `hair` slot.
`setTint` on either is a no op that warns once and does not throw, the skin and
hair colours in the save change nothing, and `shaved` has no baked hair to
hide. The procedural hair cap and the mark decal were built for a box head with
a `hair` slot, so they are SKIPPED on a body that has neither rather than laid
over a face that already has hair painted on it. `wearsHairCap()` in rig_glb.js
is the one line that decides, and rig_glb.test.mjs measures both directions.

**This is a hook, not a body on screen yet.** Nothing in `src/game/app` or
`src/game/main.js` builds a glb player: `app/systems/player.js` calls
`createPlayer` from player.js and `creation.js` previews `buildCharacter`, both
of which are the procedural box rig. Until those two call sites move to
`createGlbPlayer` and `buildGlbRig`, and something preloads
`PLAYER_MODEL_IDS`, no player sees a studio body. That is one import in each
file and a preload, and it is the last hop.

## 6. The hatchling

Registered and nothing more, as asked: `dragon-hatchling` is in `MODEL_IDS`,
`familyOf` puts it in the new `dragon` family, and `CLIPS.dragon` is its
sixteen clip names. It loads, instantiates and plays them.

It has no `RIGS` entry. Its 97 joints are the dragon agent's to map, and a map
written without the file in front of you points at bones that may not exist.
models.test.mjs names it as the one model deliberately without one, so a second
model turning up without a map fails loudly.

The exported joints now use the names Three preserves, such as `wing_upperL`
and `hind_pawR`. The 70 dotted joint names and matching manifest bone, parent
and attachment entries were normalized with
`THREE.PropertyBinding.sanitizeNodeName`. The skin, binary buffer and animation
channels are unchanged. Original and repaired files produce identical loaded
bone names and animation tracks; 48 sampled poses across all 16 clips match
exactly. `tools/validate-glb.mjs` now passes this file.

## 7. The validator

`SPECS` grew three entries and three ideas:

- `bank` names a file in `public/animations`. The clip check reads that file
  instead of the glb, holds `moves` and `clips` to each other, checks version,
  fps and body, and checks that the glb's own clips do not shadow a bank name.
- `minClips` reads the durations as FLOORS rather than as targets. The lengths
  of clips this repo did not author are not this repo's to specify; what can be
  checked is that every move is there and that none of them is empty.
- `textured` allows an embedded texture and checks that it IS embedded, since a
  texture with an external uri is one nothing fetches and renders black.
- `studio` marks a file this repo does not build, so its absence reports as
  pending rather than as a build that broke.
- `bytes` is a per model byte budget, 300 KB by default, 8 MB for these.

`tools/test-glb-env.mjs` is new. GLTFLoader's texture path wants `self`,
`URL.createObjectURL` and `document.createElementNS('img')`, none of which node
has, and without them the load of a textured body rejects and every check that
needs one quietly does not run while looking like it did. The stub installs
those three and nothing else: the skin, the bones, the materials and the clips
are all the real loader doing the real work, and only the pixels are missing.
