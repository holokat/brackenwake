# DR2: the studio hatchling on the player's shoulder

H1 delivered `public/models/mmo/dragon-hatchling.glb` and registered it in
models.js. Nothing built it into a body, nothing fetched it, and nothing played
a single one of its sixteen clips. This is that wiring.

```
public/models/mmo/dragon-hatchling.glb   17,342 tris, 97 bones, 16 clips, one texture
                                         1.088 wide by 0.582 tall by 0.913 nose to tail
```

Files changed:

```
src/game/dragon_models.js          buildGlbDragon, the state table, the audit
src/game/dragon.js                 the seat, the words for a state, rebuildBody
src/game/app/systems/dragon.js     the preload, the swap, the flight, the breath
src/game/models.js                 boneKey, a RIGS row for the hatchling
tools/validate-glb.mjs             what "joint names survive three" now means
src/game/dragon_models.test.mjs    the studio body, over the real file
src/game/app/systems/dragon.test.mjs   the body swap, and the flight
src/game/models.test.mjs           the RIGS row, and the joint check both ways
```

---

## 1. Which body you get

`buildDragon(age)` is now a door with two rooms behind it.

```js
buildDragon('hatchling')   // the glb when the file is in the cache, else the code body
buildDragon('drake')       // always the code body
```

The other three ages are unchanged: a drake, a young dragon and a full dragon
are still the four silhouettes `buildCodeDragon` builds, and their rules,
proportions, palettes, triangle budgets and audit are untouched.

`model.made` says which one you got, `'glb'` or `'code'`, and it is on the
entity too as `entity.made` and on the console handle as
`__bw.dragon.made`.

**Nothing was fetching the file.** `preloadRigs(PLAYER_MODEL_IDS)` in the player
system takes the five human bodies and `preloadRigs(monsterModelIds())` in the
combat system takes the monsters. `dragon-hatchling` is on neither list, so
`isLoaded` would have been false for the whole session and `buildDragon` would
have handed back the code body every time while looking like it had a choice.
`systems/dragon.js` now calls `preloadDragonModel()` at boot and calls
`entity.rebuildBody()` when it lands.

`rebuildBody` drops the old body off the rig, builds the new one, and puts the
state the old one was in back onto it. It says nothing: the animal is the same
animal and which mesh it is wearing is not a thing that happened to the player.

## 2. The size

`stageBody('hatchling')` says 0.45 m nose to tail and 0.27 m tall. The file's
bind pose measures 0.913 m nose to tail with its feet on y = 0, so the scale is
0.45 / 0.913 = **0.4929**, and everything else follows from it. Measured off the
scaled body rather than read back off the table:

```
length   0.450 m     stageBody says 0.45, so 0.0 mm out
height   0.287 m     stageBody says 0.27, so 6.3 per cent over, inside the 15 the audit allows
span     0.536 m     wings, which is wider than it is long, as a hatchling in this file is
```

## 3. The states, and the clip each one plays

```
state    mode    clip                            what puts it there
------   -----   -----------------------------   ---------------------------------
idle     loco    idle                            dragon.js run(), on the ground, still
walk     loco    walk, rate by ground speed      dragon.js run(), following
perch    loop    shoulder_perch                  dragon.js run(), while it rides
fly      loop    take_off then fly               systems/dragon.js, Wyrmsoul wings, driving
glide    loop    glide                           systems/dragon.js, Wyrmsoul wings, coasting
land     shot    land, then back to the ground   systems/dragon.js, when the flight ends
rest     loop    lie_down then sleep             setAnim('rest' | 'sleep' | 'lie_down')
fall     loop    lie_down then sleep             dragon.js fall()
wake     shot    wake_up, then back              dragon.js wake()
cast     shot    cast_spell                      systems/dragon.js, on every breath
swing    over    none: the jaw, over the clip    dragon.js, on every bite
hurt     over    none: a pitch, over the clip    reserved; nothing calls it yet
```

and the four clips that are not a state:

```
wing_spread   flap(k) crossing up from nothing
wing_fold     flap(k) crossing back down to nothing
wing_flex     held under whatever else is playing, at weight k, while flap(k) > 0
look_around   an idle variation, alternating, every 11 s of standing still
tail_sway     the other one
```

That is all sixteen with a caller. `idle` and `walk` run through models.js's own
blend tree, so both actions run at once and the walk changes rate with the
ground exactly as every other body's does.

**Two states have no clip, because the file has no clip for them.** Sixteen
clips and not one of them is an attack or a flinch. So the bite and the flinch
are driven here, over whatever is playing: the jaw opens 0.6 rad on a swing and
the whole body pitches forward 0.12, and a flinch pitches it back 0.22. Both are
written AFTER `mixer.update`, which rewrites those bones absolutely on the next
frame, so nothing accumulates. Measured: 200 frames held open is 0.600000 rad,
which is one frame's worth and not two hundred.

**The blinks were already in the clips.** All sixteen carry three morph tracks.
Over five seconds of `idle` the lids pass half shut on 8 frames of 300 and peak
at 0.909, and `sleep` holds them shut at 1.0. Nothing here drives a blink; a
second driver would only fight the first.

## 4. The shoulder

The manifest says the perch clip is an unmounted pose and that the host has to
calibrate the socket. So:

* While it is perched, `root` is offset by exactly minus `socket_perch`, which
  puts that socket on the dragon group's own origin. The solve zeroes `root`
  first, or it would be reading back its own previous answer.
* `place()` in dragon.js parents the group to the `back` anchor, as it always
  has, and asks the body to seat itself with
  `model.mountOn(anchor, shoulder, offset)`. The studio body converts the
  shoulder anchor's world position into the back anchor's frame and sits there.
  A body with no mount point of its own, which is every code body, takes the
  `stageBody` offset instead, which is what the ride has always used.
* The parent is the CHEST and not the arm on purpose. `rig.parts.armR` rides the
  upper arm bone, and a cat sized animal parented to it would be swung about by
  every stride. It is used as a POINT, not as a parent.

Measured, on a real `human-male` rig, in the real frame order (systems, then the
renderer walking the scene, which is where rig_glb composes its additive layer):

```
socket_perch to the shoulder anchor    0.000 mm, worst of 300 frames standing
                                       0.000 mm, worst of 300 frames walking at 6 m/s
the seat against stageBody's offset    x 0.208 y 0.113 z 0.021 against x 0.300 y 0.100 z 0.020
                                       13.1 mm apart in height
```

**A bug this caught.** The first version of the solve read the socket in the
group's frame, which already included the offset it had written last frame, so
it produced `P(n+1) = -(P(n) + q)`: the socket landed on the shoulder on even
frames and 84.70 mm off it on odd ones, for ever. The first version of the TEST
never walked the world matrices inside its loop, so it read 0.02 mm off a body
that was oscillating, and passed. Both are fixed: the solve zeroes root before
reading, and the test walks the matrices every frame and reports the worst of
600 rather than the last of one.

**What is not settled by a number.** The seat is the shoulder JOINT, which is
inside the body. Measured off the skinned vertices within 60 mm of it, the top
of the player's shoulder is 110 mm above the joint, so the hatchling's underside
sits about 170 mm under the skin. That is the calibration the manifest asks the
host for and it wants eyes. It is not a regression: the offset the ride has
always used puts the code hatchling 13 mm lower still.

## 5. The words

Every state the body enters goes through one door, `entity.setAnim`, from
dragon.js and from systems/dragon.js alike, and `ANIM_LINES` in dragon.js is
what it says.

```
perch   settles on your shoulder and folds its wings
fly     throws its wings out and goes up with you
glide   stops beating and rides the air
land    folds up and comes back down onto your shoulder      (riding)
        folds its wings and comes back down beside you        (anything older)
rest    lies down, curls its tail over its nose, and sleeps
```

`idle` and `walk` are deliberately silent: they flip several times a minute
while it follows you and a dragon walking at your heel is not news. `fall`,
`wake`, growing, feeding and hunger already had their own lines and still have
them; nothing was added beside them.

A line is said once per stretch, and coming back to the ground clears the
flight's lines, so a flight that flickers between beating and gliding says each
of them once and a SECOND flight speaks again. Measured in the system test.

The hatching line already says it climbed onto your shoulder, so the perch it
enters on the next frame is seeded as already said.

## 6. Who owns the state while you are flying

`run()` in dragon.js writes `perch`, `walk` or `idle` every frame. Wyrmsoul's
wings move the PLAYER, in the `move` phase, which runs before `update`, so
without a guard the flight state would have been overwritten by the ride on the
same frame and no flight clip would ever have been seen.

`AIR_ANIMS` is the guard: while the state is `fly`, `glide` or `land`, `run`
leaves the body alone. `fly` and `glide` are asserted every frame the player is
up, so they hold; `land` is asserted once and holds for `LAND_MS`, after which
the ride takes the body back.

`LAND_MS` is 2400 and lives in dragon.js, because the rules have to run with no
model at all. `auditGlbDragon` measures the file's `land` clip against it, so a
re-export with a longer landing fails out loud instead of leaving the dragon
hanging above your shoulder for the difference.

## 7. Names with dots in them

`PropertyBinding.sanitizeNodeName` turns whitespace into an underscore and drops
`. [ ] : /`, and GLTFLoader runs every node name through it, so a bone exported
as `wing_upper.L` is `wing_upperL` in the scene graph. The clips still bind,
because three rewrites the track names the same way. What breaks is every lookup
BY NAME from code, silently, returning null.

**`models.js` now exports `boneKey`, and every lookup by name goes through it.**
`inst.bone('wing_upper.L')` and `inst.bone('wing_upperL')` are the same bone, so
a table may be written either way round.

The hatchling shipped with 70 of its 97 joints dotted and has since been
re-exported with them already flat, so no bone in any model here needs this
today. Two of its MESHES still do: `Dragon_eyelids.L` and `Dragon_eyelids.R`
arrive as `Dragon_eyelidsL` and `Dragon_eyelidsR`, and that is how the eyelid
parts are found. And a re-export is one Blender setting away from putting the
dots back on every mirrored bone in the file.

**The validator check changed meaning.** "Joint names survive three" no longer
means "no name is rewritten"; it means no name sanitises to nothing and no two
names sanitise to the same string. The second is the real hazard: GLTFLoader
makes a colliding name unique by appending a number, so a table naming it gets
the first bone or none. Both failure modes are driven in models.test.mjs with
deliberately broken copies of a real file, and a merely-rewritten name is driven
too, to prove it passes.

`RIGS['dragon-hatchling']` exists now, mapping the six `partsLike` joints onto a
quadruped: `head`, `spine_02`, the two front legs as the arms and the two hind
legs as the legs. `NO_POSE_MAP` in models.test.mjs is empty; every model has a
map.

## 8. What the parts map has, and what it has not

`GLB_PARTS` covers `REQUIRED_PARTS` except three, and those three come back
`null` rather than as something that would move the wrong piece:

```
hornL, hornR    this hatchling wears no horns
spikes          it has no dorsal spines
```

`eyeL` and `eyeR` are the two eyelid MESHES, with their blink morphs, because
the file has no eye bones. `parts.sockets` carries all six attachment points:
`perch`, `back`, `mouth`, `tailTip`, `castL`, `castR`. Only `perch` and `mouth`
have a caller today; the other four are there for whoever wants to hang
something off the dragon.

## 9. What was measured, and what was not

Measured, in node, over the real file through the real loader:

* the size, the scale, the triangle count, the sixteen clip names
* every state driven, and the clip that actually came up, and what it chained
  into after its intro ran out
* the fall latch: a walk does not stand a fallen dragon up, a wake does
* the jaw, as a difference against a control body driven identically
* the wings, as the angle between a wing told to spread and one that was not
* the blinks, as morph influence over 300 frames
* the idle variations, as 4 in 60 seconds of standing and 0 in 60 of walking
* the perch, as the worst of 600 frames on a real rig in the real frame order
* the flight states and every line they say, in the system test

**Not measured.** Nothing here has been looked at. How the hatchling reads on
the shoulder, whether 170 mm under the skin is wrong or is what a perched animal
gripping a shoulder should look like, whether the studio walk reads at the
game's speeds, and whether `cast_spell` reads as a breath rather than as a yawn
are all questions for eyes and not for node. The reviewer runs the browser.

`hurt` is wired and nothing calls it: dragon.js takes a blow through
`combat.hurt` and does not flinch the body. That was true before this change and
is still true; the state is there for whoever adds the call.
