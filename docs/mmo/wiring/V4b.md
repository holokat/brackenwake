# V4b: the face, the cape, the shield, the steel

What the first look at V4's work in the running game showed, and what was done
about each of it. Files touched: `src/game/gear_visuals.js`,
`src/game/weapon_models.js`, `src/game/player.js`, their three `*.test.mjs`,
and this note. Nothing else. `main.js`, `scene.js`, `effects.js` and
`creation.js` were read only.

Nothing in V4's public surface changed. Every export it listed still exists and
still means the same thing. Three constants were added and one function grew an
optional third argument, all listed below.

---

## 1. The head piece was a sack, and so was the hair

`PIECES.head` built a closed loft around the whole skull, from y = 0.030 up.
The eyes sit at 0.166 in the head's frame, the mouth at 0.098 and the nose tip
at 0.113, so the piece enclosed all of them. A ray fired along -z at eye height
hit the hood, not the face, on every one of the six tiers.

That was half of it. The hair cap was the same shape: a closed loft whose
lowest ring is at y = 0.085 for `short`, 0.020 for `bob` and -0.010 for `long`.
With no gear on at all, every character in the game already had a wall of hair
across the eyes and the mouth. The `long`, `wild` and `bob` falls were closed
lofts centred near z = 0, which put a second wall over the chin.

**What it is now.** A new `arcShell()` in `gear_visuals.js` sweeps a wall
through part of a circle with a thickness, so a piece can cover the back and
the sides and leave an opening you can see through. `hairShell()` in
`player.js` does the same for hair: it splits a style's ring list at
`HAIRLINE = 0.198`, lofts the part above it closed and the part below it as a
201 degree arc open at the front.

- **Soft head pieces** (cloth, leather, studded) are a cap over the crown whose
  lower edge is on the brow at y = 0.186, a peak of cloth over the brow and
  nowhere else, and a 191 degree cowl falling to the collarbones behind and at
  the sides. The face plane, the throat and the jaw are open.
- **Hard head pieces** (ring, chain, plate) are a bowl to the brow, a brow
  band, a 212 degree neck guard, a nasal bar down the centre and two cheek
  plates. Both eyes and the mouth are open; the nasal bars the centre of the
  nose, which is what a nasal is for.
- **The falls** on `long`, `wild` and `bob` were pushed back to z = -0.052 and
  -0.062 and flattened to 0.70 of their depth, so they hang behind the ears.

**Measured.** `gear_visuals.test.mjs` fires rays at both eyes, the mouth and
the chin of a dressed, posed rig for all six tiers: 24 rays, every one lands on
skin. The same ray at the crown lands on the head piece, so the gate is driven
both ways. `player.test.mjs` calibrates against a shaved head (eye z 0.098,
nose 0.113, mouth 0.094, chin 0.089) and requires all twelve hair styles to
leave those four points within 6 mm of where a bare head has them: 48 rays,
none blocked. Eleven of the twelve still cover the crown; `shaved` does not.

---

## 2. The cloak was a slab

`PIECES.back` was a 207 degree cone. Its front lip reached z = -0.058 while the
torso's own back plane is at z = -0.1017, so it stood 43 mm in front of the
back, out to x = +/-0.32 which is exactly where the arms are. It wrapped the
ribs and hid both arms and the off hand from the side and from behind.

**What it is now.** A 169 degree cape, 5.8 mm of cloth thick at the hem, with
folds, a standing collar and two clasp tabs over the tops of the shoulders. It
hangs from y 1.41 to 0.54 and flares from 0.21 m across at the collar to
0.56 m at the hem.

**Measured.**

| | before | now | limit |
| --- | --- | --- | --- |
| width | 0.635 m | **0.557 m** | 0.621 m (shoulders x 1.15) |
| front face | -0.058 | **-0.1132** | behind -0.1017, the torso's back plane |

A ray from the left and one from the right at shoulder height both land on the
arm, not on the cloak. A ray from behind lands on the cloak, so the measurement
is driven both ways.

The clasp is two tabs over the shoulders rather than a bar across the throat,
because a bar across the throat is the fastening a cloak that wraps the chest
needs and this one does not wrap the chest.

---

## 3. The shield was invisible

The shield was on the rig the whole time. `HOLD.shield` put it on the fist and
0.10 m in front of it, and `GRIP_POSES.oneShield.armL` was
`[-0.62, -0.34, 0.34]`, which threw the whole forearm up and forward. Measured
on the old code, a kite shield ended up at **z = +0.275 to +0.772**: held out
in front of the chest like a tray, edge on from the side, and from a follow
camera, which sits behind the player, entirely hidden by the player.

**What it is now.**

- `GRIP_POSES.oneShield.armL` and `GRIP_POSES.shield.armL` are
  `[-0.05, -0.08, 0.26]`: the arm hangs with the elbow a little out, and the
  shield hangs on it rather than being presented by it.
- `HOLD.shield` is `{ pos: [-0.20, 0.185, -0.02], rot: [0, -0.30, 0] }`: up the
  outside of the left forearm, face turned out and forward by 22 degrees once
  the arm's own rotation is added.
- `HOLD.buckler` is new. A buckler is punched, not strapped, so it stays on the
  fist; holding it where a kite shield goes would float it at the shoulder with
  nothing under it. `dressRig` picks the row by base id.

**Measured**, on a posed rig with a longsword in the main hand:

| | x | y | z | left ray at chest | front ray |
| --- | --- | --- | --- | --- | --- |
| kite | -0.632 to -0.078 | 0.448 to **1.356** | -0.109 to 0.126 | shield | shield |
| tower | -0.693 to -0.005 | 0.269 to **1.487** | -0.126 to 0.153 | shield | shield |
| buckler | -0.442 to 0.035 | 0.563 to 1.062 | -0.095 to 0.117 | shield at its own height | shield |

The shoulder is at y = 1.375, so the kite's top is 19 mm under it and the
tower's 112 mm over it. Driven both ways: with the off hand empty, and with a
greatsword taking both hands, the same rays land on the body.

The bow shares the cloak's anchor and had the same class of problem: tilted
about x, a 1.7 m stave threw one limb tip to z = +0.027, through the small of
the back. `HOLD.slung` is now `{ pos: [0.02, -0.06, -0.235], rot: [0, PI, 0.62] }`,
belly to the back and string out. All three ranged bases now sit entirely
behind the torso and behind the cloak, and all three come round in front when
the ranged set is drawn.

---

## 4. The weapons

### The metal was the whole problem

`metalMat` was `roughness: 1, metalness: 1` and the texture's own r and m
channels were absolute values, not modulations. A `MeshPhysicalMaterial` at
metalness 1 has no diffuse term at all; with nothing to reflect, the only thing
left is a broad, dim GGX specular tinted by the sun, which in a warm daylight
scene is a dark brown smear. That is exactly what "the longsword blade looked
like dark wood, thin and brown" is a description of.

Three changes, together:

- **The scalars.** `METAL_METALNESS = 0.70` and `METAL_BASE_ROUGH = 0.38`, with
  per metal deltas of -0.06 (silver) to +0.04 (voidrock), so every metal lands
  in metalness 0.60 to 0.75 and roughness 0.32 to 0.45. `METAL_EMISSIVE` is
  `0x0a0a0c` at intensity 1, which is faint enough that the rarity glow test
  (`emissiveIntensity > 1`) still distinguishes a rune from a blade.
- **The maps.** `FAMILIES.metal`, `plate`, `ring` and `chain` now write their r
  and m channels as modulations near 1 rather than as absolutes, because those
  channels multiply the scalars. Metal's roughness channel measures 0.82 to
  1.00 and its metalness channel 0.67 to 0.99, so the final material is
  roughness 0.31 to 0.38 and metalness 0.47 to 0.69.
- **The base tints.** The albedo map's mean luminance is about 0.74, so the hex
  is not what you see. Iron at 0x6e7378 rendered at roughly 0x515559, which is
  charcoal. Iron is now `0x9aa0a8`, coldiron `0x3d4757` and voidrock
  `0x28282c`, chosen so the RENDERED colour is the ores.js colour word. Every
  other metal is untouched; voidrock is still the darkest thing in the table.

`TIER_PBR` for ring, chain and plate armour was `metal: 1, rough: 1` and had
the same bug. It now uses the same two constants.

### The blades were as thick as they were narrow

A longsword blade was 60 mm across the flat and **12.4 mm at the spine**. No
material work makes that read as a sword.

| | flat, before | flat, now | spine, before | spine, now |
| --- | --- | --- | --- | --- |
| dagger | 40.0 mm | 35.0 mm | 9.0 mm | **3.2 mm** |
| shortsword | 52.0 mm | 41.0 mm | 11.0 mm | **3.6 mm** |
| longsword | 60.0 mm | **46.0 mm** | 12.4 mm | **3.2 mm** |
| greatsword | 84.0 mm | 52.0 mm | 16.0 mm | **4.4 mm** |

The rapier went to a narrow stiff section (16 mm by 5.2 mm), the throwing
knives and the spear and halberd leaf heads came down with them. The section
itself is unchanged: two edges, a swelling flat and a fuller, which at these
thicknesses is finally visible rather than being a lens that is nearly round.
Every model is still within 10% of its `LENGTHS` row; the audit and the
triangle budget are unchanged (22,072 for the whole kit, worst 1,496).

### The length was never wrong

The dagger was reported as looking like a 1.2 m staff. It does not measure
that and never did. Measured in world space on a dressed, posed rig:

| | 1.60 m body | 1.75 m body | 2.00 m body | stated |
| --- | --- | --- | --- | --- |
| dagger | 0.328 | 0.358 | 0.410 | 0.35 x scale |
| longsword | 0.903 | 0.988 | 1.129 | 1.00 x scale |
| greatsword | 1.363 | 1.491 | 1.704 | 1.50 x scale |
| spear | 1.916 | 2.095 | 2.394 | 2.00 x scale |

Worst error 7.7% (spear), which is the model's own tolerance, not the rig's.
**I could not reproduce a 1.2 m dagger and I do not know what was seen.** The
best account I have is that a 0.35 m object that renders as a near black stick
with a round pommel gives no cue to read its length by, and that the fix for
that is the metal and the blade section above rather than the scale. If it is
still wrong in a screenshot, the number to check is which base is actually in
`equipment.mainHand`.

---

## 5. The figure was one brown

**Per piece shade.** `PIECE_SHADE` multiplies the tier colour per piece: head
1.26, back 1.12, chest 1.00, legs 0.92, wrists 0.86, waist 0.80, hands 0.74,
feet 0.66. A leather set now comes out as eight different browns from #644328
at the boots to #885c38 at the hood. `armourMat(tierId, item, shade)` takes the
multiplier as an optional third argument; called with two, it answers exactly
what it always did, which is what the existing tier colour test measures.

**Stitching.** A new `stitchMat` is the piece's own colour at 0.52, and a
`seam()` helper runs a thread round a piece. All eight leather pieces now carry
a visible welt or trim in a colour distinct from their own: a hem and a neck
seam on the jerkin, a cuff on the glove, a lace on the bracer, two edge lines
on the belt, a welt where the leggings meet the boot, a welt round the sole,
and a hem round the cowl and the cape.

**Skin.** The glove's top came down from 0.062 to 0.038 and the bracer's bottom
went up from -0.540 to -0.512, leaving **61 mm of bare forearm** between them.
That exposed a hole in the body: the forearm mesh stopped at arm y -0.545 and
the palm started at -0.552, and the old long glove had been covering the 7 mm
gap rather than anything fixing it. The forearm now runs to -0.558 and the palm
starts at -0.546. Twenty one rays down the bare forearm and the palm all land
on skin.

With the face open, the throat open under the cowl and the wrists bare, there
is skin at three places on a fully armoured figure.

---

## What changed in the public surface

```js
// weapon_models.js, new exports
METAL_METALNESS  = 0.70      // the readable band with no environment map
METAL_BASE_ROUGH = 0.38
METAL_EMISSIVE   = 0x0a0a0c

// gear_visuals.js, new exports
PIECE_SHADE                  // { head, chest, hands, wrists, waist, legs, feet, back }
shadeHex(hex, k)
HOLD.buckler                 // new row; HOLD.shield and HOLD.slung retuned
armourMat(tierId, item, shade = 1)   // third argument is new and optional

// player.js, new exports
HAIRLINE = 0.198             // nothing may close over the face below this, at the front
GRIP_POSES.oneShield.armL and .shield.armL retuned
```

`METAL_COLOURS.iron`, `.coldiron` and `.voidrock` changed value. Anything that
compares a mesh's colour against `METAL_COLOURS.iron` still works, because it
reads the same table; anything that hard codes 0x6e7378 does not, and nothing
in the tree does.

---

## What is measured

`node src/game/gear_visuals.test.mjs` 177 checks, `weapon_models.test.mjs` 76,
`player.test.mjs` 78. Every suite in `src/` is green except
`src/world/flora.test.mjs`, which fails on tree warming times and canopy
triangle budgets in another agent's in flight edits to `flora.js`, `arbor.js`
and `arbor_textures.js`. None of those files were touched here, and that suite
was already failing in the working tree before this work started being
committed.

New sections, all of them driven both ways:

- no head piece of any tier takes the face away (24 face rays, 6 crown rays,
  3 side rays, plus a bare head control)
- nor does any hair style (48 rays against a shaved head reference)
- the cloak is a cape, not a slab (width, front plane, two side rays, one from
  behind)
- the shield is on the arm and can be seen (12 rays across three shields, plus
  two controls with the off hand empty and with a greatsword)
- gear scales with the rig it is on (18 world space weapon lengths at three
  heights, breastplate width ratio, shield top against shoulder height)
- a set reads as pieces, not as one shape (shade table completeness both ways,
  eight distinct browns, boots and gloves darker, hood lighter, stitching)
- there is skin between the sleeve and the glove (three rays in the gap, one
  control 40 mm above it)
- mail and plate read as metal with no environment map
- what is slung on the back stays on the back (nine box comparisons)
- metal reads as metal with no environment map (metalness and roughness bands
  across all eleven metals, the emissive, the map channel ranges measured off
  the real texture, and the sRGB luma of the base tints)
- blades have blade proportions (twelve measurements across four swords)
- hair does not grow over the face, the arm is continuous from elbow to
  fingers, the shield arm hangs rather than presents

---

## What is NOT verified

- **No browser.** Everything above is geometry and material state measured in
  node. Whether the hood reads as a hood and the steel reads as steel at 2.5 m
  in daylight is a screenshot question, and Fable has the screenshots.
- **The 1.2 m dagger is unexplained.** See section 4. The model and the rig
  both measure right.
- **There IS an environment map now.** `main.js` line 124 sets
  `scene.environment` from a PMREM of the sky at `environmentIntensity = 0.55`,
  refreshed on a timer. The band chosen here (metalness 0.70) was specified for
  a scene with no environment; with one, it still reads as metal and now also
  reflects, but it is no longer the only thing keeping the blade off black. If
  the steel now looks too matte in a screenshot, `METAL_METALNESS` is the one
  number to raise, toward 0.85, and `METAL_BASE_ROUGH` toward 0.30. Both are
  held by a test whose band would need widening with them.
- **The cowl and the cape are open surfaces**, with no cap at the top or the
  bottom rim. You can look into the top of the cape from directly above and
  into the bottom of the cowl from under the chin. Both were open before as
  well; nothing regressed, but nothing was closed either.
- **The buckler does not reach the shoulder.** By choice, and the test says so
  in words. If a buckler is wanted at chest height, `HOLD.buckler` is the row.
- **Only the player rig was measured.** V5's monster rigs go through the same
  `dressRig` and would get the same hood and cape, but no monster rig was
  dressed and rayed here.
