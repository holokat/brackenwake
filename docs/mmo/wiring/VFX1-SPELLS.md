# VFX1: the spells you can see

Written 2026-09-07. Seventy eight abilities, every one of them with a visual,
driven off the clip bank's own `cast-gather`, `cast-release`, `swing-trail`,
`swing-impact` and `whirlwind-pulse` events, and a selective bloom that runs
only on the frames a spell is alive.

The effects themselves are not new work. They are the finished spell VFX from
the animation studio at
`/Users/k/Documents/Codex/2026-09-04/using/outputs/warrior-combat-playground`,
ported from TypeScript to plain JS with their structure and their parameters
kept, so the next update from the studio is a re-port and not a rewrite. Every
ported file names its source in its first ten lines.

## Files

| file | what it is |
|---|---|
| `src/game/vfx/bloom.js` | `enableSpellBloom`, `createSpellBloomSelection`. Ported from `spellBloom.ts` and `createSpellBloomSelection.ts` |
| `src/game/vfx/util.js` | `additiveMaterial`, `disposeTree`, `smoothRange`, `quadraticBezier`, `createSpellEffectContext`. Ported from `spellVfxUtils.ts` |
| `src/game/vfx/glow.js` | `createSpellGlow`, `createSpellRibbon`. Ported from `createSpellGlow.ts` |
| `src/game/vfx/particles.js` | `createSpellParticleLayer`, the instanced flipbook layer. Ported from `createSpellParticleLayer.ts` |
| `src/game/vfx/fire_volume.js` | the ray marched fire. Ported from `createFireVolume.ts`, plus a `uTint` uniform |
| `src/game/vfx/bolt.js` | `writeHierarchicalBolt`. Ported from `lightningGeometry.ts` |
| `src/game/vfx/motions.js` | the four authored spell timings. Ported from `spellMotion.ts` |
| `src/game/vfx/textures.js` | the fire and smoke atlases, loaded through the game's own `TextureLoader`. Ported from `loadSpellTextures.ts` |
| `src/game/vfx/fireball.js` | `createFireballImpact`, `createFireballVfx`. Ported from `createFireballImpact.ts` and `createFireballVfx.ts` |
| `src/game/vfx/lightning.js` | `createLightningVfx`. Ported from `createLightningVfx.ts` |
| `src/game/vfx/healing.js` | `createHealingVfx`. Ported from `createHealingVfx.ts` |
| `src/game/vfx/missiles.js` | `createEnergyMissilesVfx`, `createEnergyMissileShatter`. Ported from `createEnergyMissilesVfx.ts` and `createEnergyMissileShatter.ts` |
| `src/game/vfx/elemental.js` | the four signatures and the seven elements. Ported from `createElementalSpellVfx.ts` and `createSignatureSpells.ts` |
| `src/game/vfx/shapes.js` | the sixteen family renderer. Ported from `createAbilityShapes.ts` |
| `src/game/vfx/motes.js` | 560 deterministic points. Ported from `createAbilityParticles.ts` |
| `src/game/vfx/atmosphere.js` | flipbook smoke, floor residue, corona. Ported from `createAbilityAtmosphere.ts` |
| `src/game/vfx/accents.js` | the mark, the shield crest, the snare, the blink flash. Ported from `createActionAccents.ts` |
| `src/game/vfx/meteor.js` | the rock and its landing. Ported from `createMeteorEffect.ts` |
| `src/game/vfx/chain.js` | four strikes and their forks. Ported from `createChainLightning.ts` |
| `src/game/vfx/arrows.js` | real arrows with fletching. Ported from `createRangerEffects.ts` and `createArrowGeometry.ts` |
| `src/game/vfx/summon_portal.js` | the ground aperture. Ported from `createGroundSummon.ts`, without its figures |
| `src/game/vfx/sweep.js` | the blade trail, and pooled rings and bursts. Ported from `createSwordSweepTrail.ts` and `createCombatVfx.ts` |
| `src/game/vfx/visuals.js` | the ability to visual table and the seven elements. Ported from `abilityVisuals.ts` |
| `src/game/vfx/bloom_pass.js` | `SelectiveSpellBloomPass`, `createSpellComposer`. Ported from `SelectiveSpellBloomPass.ts` and `createSpellPostprocessing.ts` |
| `src/game/spell_vfx.js` | new. The bridge: ability, body, target, events |
| `src/game/spell_vfx.test.mjs` | new, 78 checks |
| `public/vfx/*.png`, `*.json` | the baked fire and smoke atlases, copied from the studio's `public/vfx/` |

Existing files, touched only at their seams:

| file | what changed |
|---|---|
| `src/game/scene.js` | `setSpellSource(fn)`, a lazily built composer, `render(dt)` branching on it, `spellFrames` / `plainFrames`, resize and dispose |
| `src/game/abilities_runtime.js` | an optional `spellVfx` dep; `start` on a cast, `retarget` on a landing, `interrupt` on a fizzle and on a break; `get spellVfx()` |
| `src/game/app/systems/abilities.js` | builds the bridge, the ground impact resolver, registers the spell source, steps it in `late()` |
| `src/game/app/systems/world.js` | one line: `sc.render(frame.dt)` |
| `src/game/win_dev.js` | the spell lab: `spellRows`, `castSpell`, `nextSpell`, `spellWalk`, `spellDummy`, `spellFrames`, and a panel row |
| `src/game/wiring.test.mjs` | 20 new source checks over those seams |

## 1. How one cast reaches the screen

    key press
      -> abilities_runtime.useById
         -> startCast, pay, the armour lengthens rec.castTime
         -> spellVfx.start(id, { ability, castTime: rec.castTime, target, ground })
            -> planFor(id, { events: the move's own }) picks the effect and the times
            -> the effect is aimed, in the CASTER'S LOCAL FRAME, and reset
      -> every frame, in the abilities system's late(), after the gait has posed the rig
         -> spellVfx.update(dt) walks the cast clock, fires the pulses, plays the layers
      -> abilities_runtime.fire, when it lands
         -> spellVfx.retarget({ target, ground, links }) corrects a chain to its real hops
      -> scene.js render(dt)
         -> spellVfx.active decides whether the composer runs at all

Three things in that chain are worth naming, because each of them is a bug
this project has already had once.

**The cast time is `rec.castTime` and not `ability.castTime`.** Armour
lengthens a cast. Taking the table's number would have gathered for one second
and released half a second before the bar filled, every time, in plate. The
`start` call sits after the burden block for exactly that reason, and
`wiring.test.mjs` checks the two offsets in the source rather than trusting it.

**The effects are stepped in `late()` and not in `update()`.** They read the
socket bones, and the socket bones are wherever the mixer and the gait last put
them. A frame early and a fireball gathers at the hand the character had a
frame ago.

**An instant is not the clip.** Lightning, Hunter's Mark, Fear and thirty
others have `castTime: 0`, and their rules effect has already resolved by the
time `start` is called. Their release is `INSTANT_RELEASE`, a fifth of a
second, not the clip's own 0.74 s, because a bolt that waited three quarters of
a second would be showing a cast that never happened. A swing, a whirlwind
pulse and a leap keep the CLIP's timing, because for those the clip is the
ability.

## 2. What each ability draws

Three layers, and an ability may wear more than one:

- **signature** is one of the four spells the studio actually animated:
  `fireball`, `lightning`, `missiles`, `healing`. Each takes an element, so an
  Ice Shard is the fireball chain in frost and a Smite is the strike in holy.
  Nothing is duplicated to make that true; see the `setPalette` seams.
- **special** is an effect built for one ability: `meteor`, `chain`, `arrows`,
  `summon`.
- **family** is the sixteen way renderer in `shapes.js`, plus `motes.js` and
  `atmosphere.js`. It is what guarantees coverage, and it is switched off when
  a signature already owns the whole look.

Counted: 23 abilities borrow a signature, 12 have a special, and every one of
the 78 has a family. By element: 40 physical, 10 shadow, 8 holy, 6 arcane, 5
frost, 5 lightning, 2 fire, 2 nature.

**Nothing is left without a visual.** `auditSpellVisuals()` walks
`src/mmo/abilities.js` and returns the ones that resolve and the ones that do
not; the list of the ones that do not is empty, and the test fails loudly the
day a seventy ninth ability is added without a row in `visuals.js`.

| ability | school | family | element | layers | fires on | release, s | over in, s |
|---|---|---|---|---|---|---|---|
| `power-strike` | warrior | slash | physical | family:slash | swing-impact | 0.31 | 2.01 |
| `whirlwind` | warrior | slash | physical | family:slash | whirlwind-pulse | 0.40 | 2.10 |
| `leap-slam` | warrior | impact | physical | family:impact | jump-launch | 0.40 | 2.10 |
| `shield-bash` | warrior | impact | physical | family:impact | swing-impact | 0.25 | 1.95 |
| `rend` | warrior | slash | physical | family:slash | swing-impact | 0.25 | 1.95 |
| `crushing-blow` | warrior | impact | physical | family:impact | swing-impact | 0.82 | 2.52 |
| `lunge` | warrior | impact | physical | family:impact | cast-release | 0.18 | 1.88 |
| `sweep` | warrior | slash | physical | family:slash | swing-impact | 0.31 | 2.01 |
| `battle-cry` | warrior | song | physical | family:song | cast-release | 0.18 | 2.68 |
| `berserk` | warrior | aura | physical | family:aura | cast-release | 0.18 | 2.68 |
| `disarm` | warrior | slash | physical | family:slash | swing-impact | 0.25 | 1.95 |
| `riposte` | warrior | slash | physical | family:slash | swing-impact | 0.25 | 1.95 |
| `aimed-shot` | ranger | projectile | physical | special:arrows + family:projectile | cast-release | 1.20 | 2.90 |
| `double-shot` | ranger | projectile | physical | special:arrows + family:projectile | cast-release | 0.18 | 1.88 |
| `volley` | ranger | volley | physical | special:arrows + family:volley | cast-release | 1.50 | 3.20 |
| `piercing-arrow` | ranger | projectile | physical | special:arrows + family:projectile | cast-release | 0.18 | 1.88 |
| `crippling-shot` | ranger | projectile | physical | special:arrows + family:projectile | cast-release | 0.18 | 1.88 |
| `disengage` | ranger | stealth | physical | family:stealth | cast-release | 0.18 | 2.68 |
| `fleet-foot` | ranger | aura | physical | family:aura | cast-release | 0.18 | 2.68 |
| `hunters-mark` | ranger | mark | physical | family:mark | cast-release | 0.18 | 2.68 |
| `snare` | ranger | trap | physical | family:trap | cast-release | 0.80 | 3.30 |
| `beast-call` | ranger | song | physical | family:song | cast-release | 2.00 | 4.50 |
| `magic-arrow` | mage | projectile | lightning | signature:missiles + family:projectile | cast-release | 0.18 | 1.88 |
| `fireball` | mage | projectile | fire | signature:fireball + family:projectile | cast-release | 0.60 | 3.39 |
| `ice-shard` | mage | projectile | frost | signature:fireball + family:projectile | cast-release | 0.60 | 3.39 |
| `lightning` | mage | lightning | lightning | signature:lightning + family:lightning | cast-release | 0.18 | 1.99 |
| `blink` | mage | stealth | frost | family:stealth | cast-release | 0.18 | 2.68 |
| `mana-shield` | mage | shield | frost | signature:healing + family:shield | cast-release | 0.18 | 1.88 |
| `frost-nova` | mage | nova | frost | family:nova | cast-release | 0.80 | 2.50 |
| `chain-lightning` | mage | lightning | lightning | signature:lightning + special:chain + family:lightning | cast-release | 1.20 | 3.01 |
| `meteor` | mage | meteor | fire | special:meteor + family:meteor | cast-release | 2.50 | 6.00 |
| `arcane-mastery` | mage | aura | frost | signature:healing + family:aura | cast-release | 0.18 | 1.88 |
| `hex` | sorcerer | mark | arcane | family:mark | cast-release | 0.18 | 2.68 |
| `stone-skin` | sorcerer | shield | arcane | signature:healing + family:shield | cast-release | 0.50 | 2.20 |
| `eldritch-bolt` | sorcerer | projectile | lightning | signature:missiles + family:projectile | cast-release | 0.18 | 1.88 |
| `ward` | sorcerer | shield | arcane | signature:healing + family:shield | cast-release | 1.50 | 3.20 |
| `transmute` | sorcerer | portal | arcane | special:summon + family:portal | cast-release | 1.00 | 6.80 |
| `spell-plague` | sorcerer | mark | nature | family:mark | cast-release | 1.20 | 3.70 |
| `rift` | sorcerer | portal | arcane | special:summon + family:portal | cast-release | 2.00 | 7.80 |
| `elemental-kin` | sorcerer | aura | arcane | signature:healing + family:aura | cast-release | 0.18 | 1.88 |
| `life-drain` | necromancer | drain | shadow | family:drain | cast-release | 0.18 | 2.68 |
| `raise-skeleton` | necromancer | portal | shadow | special:summon + family:portal | cast-release | 1.50 | 7.30 |
| `summon-imp` | necromancer | portal | shadow | special:summon + family:portal | cast-release | 1.20 | 7.00 |
| `bone-spear` | necromancer | projectile | shadow | signature:missiles + family:projectile | cast-release | 0.50 | 2.20 |
| `fear` | necromancer | nova | shadow | family:nova | cast-release | 0.18 | 1.88 |
| `corpse-explosion` | necromancer | impact | shadow | family:impact | cast-release | 0.18 | 1.88 |
| `summon-hound` | necromancer | portal | shadow | special:summon + family:portal | cast-release | 1.50 | 7.30 |
| `curse-of-weakness` | necromancer | mark | shadow | family:mark | cast-release | 0.18 | 2.68 |
| `lich-form` | necromancer | aura | shadow | signature:healing + family:aura | cast-release | 3.00 | 4.70 |
| `raise-champion` | necromancer | portal | shadow | special:summon + family:portal | cast-release | 3.00 | 8.80 |
| `heal` | healer | heal | holy | signature:healing + family:heal | cast-release | 0.80 | 2.50 |
| `cleanse` | healer | nova | holy | family:nova | cast-release | 0.18 | 1.88 |
| `greater-heal` | healer | heal | holy | signature:healing + family:heal | cast-release | 1.50 | 3.20 |
| `bless` | healer | aura | holy | signature:healing + family:aura | cast-release | 0.50 | 2.20 |
| `sanctuary` | healer | shield | holy | signature:healing + family:shield | cast-release | 1.50 | 3.20 |
| `consecrate-weapon` | healer | aura | holy | signature:healing + family:aura | cast-release | 0.18 | 1.88 |
| `smite` | healer | lightning | lightning | signature:lightning + family:lightning | cast-release | 0.18 | 1.99 |
| `resurrect` | healer | heal | holy | signature:healing + family:heal | cast-release | 5.00 | 6.70 |
| `lay-on-hands` | healer | heal | holy | signature:healing + family:heal | cast-release | 0.18 | 1.88 |
| `hide` | rogue | stealth | physical | family:stealth | cast-release | 1.00 | 3.50 |
| `backstab` | rogue | slash | physical | family:slash | swing-impact | 0.25 | 1.95 |
| `poison-blade` | rogue | aura | nature | signature:healing + family:aura | cast-release | 0.18 | 1.88 |
| `shadowstep` | rogue | stealth | physical | family:stealth | cast-release | 0.18 | 2.68 |
| `vanish` | rogue | stealth | physical | family:stealth | cast-release | 0.18 | 2.68 |
| `pick-pocket` | rogue | mark | physical | family:mark | swing-impact | 1.00 | 3.50 |
| `evasion` | rogue | aura | physical | family:aura | cast-release | 0.18 | 2.68 |
| `expose-weakness` | rogue | mark | physical | family:mark | cast-release | 0.18 | 2.68 |
| `provoke` | bard | song | physical | family:song | cast-release | 1.00 | 3.50 |
| `peace` | bard | song | physical | family:song | cast-release | 1.00 | 3.50 |
| `discord` | bard | song | physical | family:song | cast-release | 1.00 | 3.50 |
| `marching-song` | bard | song | physical | family:song | cast-release | 0.18 | 2.68 |
| `war-drum` | bard | song | physical | family:song | cast-release | 0.18 | 2.68 |
| `lullaby` | bard | song | physical | family:song | cast-release | 2.00 | 4.50 |
| `jump` | everyone | impact | physical | family:impact | jump-launch | 0.36 | 2.06 |
| `sprint` | everyone | aura | physical | family:aura | cast-release | 0.18 | 2.68 |
| `bandage` | everyone | heal | physical | signature:healing + family:heal | cast-release | 4.00 | 5.70 |
| `meditate` | everyone | aura | physical | family:aura | cast-release | 0.18 | 2.68 |
| `camp` | everyone | aura | physical | family:aura | cast-release | 0.18 | 2.68 |

## 3. The elements

`ELEMENTS` in `visuals.js` is seven rows, and each one is a colour, an accent
and a tint for the marched fire volume. The element of an ability is its damage
type first, because that is what the player is being told, and its school when
it deals no damage. A Warrior has no element at all and keeps the family's own
colour from the studio's table.

| element | from | dresses |
|---|---|---|
| fire | damage type `fire` | the fireball chain, unchanged |
| frost | damage type `cold` | the fireball chain, blue |
| lightning | damage type `energy` | the strike, and the arcane volley for a hand bolt |
| arcane | school Sorcerer | the volley |
| holy | damage type `holy`, school Healer | the strike and the blessing |
| shadow | school Necromancer | the volley |
| nature | damage type `poison` | the blessing |

## 4. The bloom, and what it costs when nothing is glowing

`scene.js` builds NOTHING until the first spell is cast. `setSpellSource(fn)`
is how the abilities system hands over its bridge; `fn()` answers
`{ active, presentation }` every frame; `render(dt)` takes the plain
`renderer.render(scene, camera)` path whenever `active` is false. A session
that never casts allocates no render target at all.

Two more guards are inside the pass and are the studio's:
`createSpellBloomSelection` turns off `colorWrite` on every visible material
that did not opt in, and if nothing opted in the bright pass is skipped
entirely and the combine runs with `uBloomActive: 0`. So the lit character
never enters the bloom, and a white shirt at noon does not glow.

`sc.spellFrames` and `sc.plainFrames` count which path each frame took. The dev
bench prints both, so "the composer only runs while a spell is alive" is a
number a reviewer can read off the screen rather than a promise in a comment.

`renderer.info.autoReset` is turned off when the composer is built and the
frame resets it once at the top, so the dev HUD's draw count keeps meaning the
whole frame rather than collapsing to the last pass the moment a spell is cast.

## 5. The spell lab

Dev bench, F2, under **Spell lab**. Every ability, with what it will draw, in
one list, searchable by name, family or element.

- **target ahead** spawns a skeleton six metres out and targets it, through the
  same `monsters.spawnAt` every other button on the bench uses.
- **cast** goes the REAL road: `abilities.useById`, the same call a key press
  makes, with the same cost, range check, cast bar and visual. A preview that
  took a different road would prove nothing.
- **show** starts the visual alone, with exactly the arguments the runtime
  would have passed, for when the real road refuses (no mana, out of range,
  still cooling). It says out loud that no ability was used.
- **next effect** and **previous** walk all 78 in order.
- **frames** prints the composed and plain frame counts.

## 6. What was measured

`node src/game/spell_vfx.test.mjs`, 78 checks, exit 0.

**The bank and the constants agree.** Every `cast-gather` and `cast-release`
time in `motions.js` and in `FALLBACK_EVENTS` is compared against
`public/animations/human-male.json` AND `human-female.json`, move by move, all
19 moves. A re-bake that moved a release fails this file rather than firing a
spell out of a hand that had not opened.

**Coverage.** 78 of 78 abilities resolve to a plan with a family, an event to
fire on and a duration longer than its release. All 77 of the bank's own
abilities resolve too. By effect kind: 9 of 9 with a `spellDamage`, 6 of 6 with
an `aoe`, 3 of 3 with a `heal`, 12 of 12 with a `buff`, 5 of 5 with a `summon`,
10 of 10 with a `damageMult`. All 33 abilities with a cast gather strictly
before they release.

**Order, measured on the real effect at 240 Hz.** Driving a real Fireball
against a real body with real socket bones: the gather ribbon becomes visible
at **0.042 s**, the plasma trail at **0.604 s**, the explosion at **0.892 s**.
The ability's cast is 0.6 s, so the release landed 4 ms late at a 4.2 ms step,
and the flight was **0.287 s**. Nothing is drawing after the plan's own
duration: **0 draw calls**.

**The interrupt.** A meteor cast 0.5 s in is drawing; `interrupt` leaves
exactly one ring and one spray, clears the cast, and both are gone inside half
a second. Driven the other way too: `interrupt` with nothing casting returns
null and puffs nothing.

**The leak, over 200 casts.** There is no WebGL in node, so this is not read
off `renderer.info`; it is counted the way `renderer.info.memory` counts, by
walking the scene graph for distinct geometries, materials, textures and
objects. Before and after 200 casts across all 78 abilities, 24 frames each:

| | before | after |
|---|---|---|
| geometries | 210 | 210 |
| materials | 317 | 317 |
| textures | 0 | 0 |
| objects | 531 | 531 |

Nothing moved, because casting allocates nothing: every geometry and material
is built once by `createSpellVfx`. After `dispose()` the scene is byte for byte
what it was before the bridge existed: 0 geometries, 0 materials, 0 textures,
11 objects, which is the bare body.

One caster costs **520 objects, 210 geometries and 317 materials**, once.

**The atlases landing late.** They cannot be handed to a flipbook layer after
it is built, so the whole set is disposed and remade, ONCE, inside the first
second. Measured: `builds` goes 1 to 2 on the first `setTextures` and stays at
2 on the second call with the same set; geometry, material and object counts
are identical across the rebuild; the two atlases become reachable.

**Draw calls, peak, measured over four seconds of each effect:**

| ability | peak draw calls |
|---|---|
| volley | 108 |
| chain lightning | 46 |
| heal | 44 |
| magic arrow | 43 |
| frost nova | 36 |
| raise skeleton | 29 |
| lightning | 19 |
| fireball | 10 |
| meteor | 10 |
| whirlwind | 5 |

The worst is 108, against a budget of 200.

**Step cost.** Ten live effects, ten separate casters, stepped for 60 frames:
**0.292 ms a frame for all ten**, 0.0292 ms each. That is the JS half only; it
does not include the GPU, which is the reviewer's to look at.

**The ported guards still hold.** A zero capacity particle layer throws, an
atlas that addresses frames outside its grid throws, a write past the end
throws, a non-finite position and an out of range frame clamp to something
render safe, an empty layer submits no draw, and a hierarchical bolt of the
wrong point count throws while a right one comes out anchored at both ends and
crooked in the middle.

Other suites, all exit 0: `wiring.test.mjs` 148 checks (20 of them new, over
these seams), `abilities_runtime.test.mjs` 266, `scene.test.mjs` 54,
`win_dev.test.mjs`, `combat`, `con`, `events_runtime`, `hud`, `sky`,
`targeting`, `world_runtime`, `wyrmsoul`, `mmo/events`, `world/chunks`. Full
suite: ALL SUITES GREEN. `npx vite build`: 208 modules, built in 565 ms, and
the two atlases land in `dist/vfx/`.

## 7. What is NOT verified here

**The look.** Nothing in node can say whether a fireball reads as a fireball,
whether the bloom is too strong at noon, whether a bolt lands where the eye
expects it, or whether the blade trail follows the blade. That is the browser,
and it is the reviewer's.

**The blade axis.** `sampleBlade` takes the `Socket_Weapon_Right` bone's world
rotation and runs 0.78 m up its local +Y. That is the convention the HOLD table
in `gear_visuals.js` was built in, and it has not been eyeballed against a real
sword. `spellVfx.setBlade(length, axis)` is one call if it is wrong.

**The ground resolver.** `groundImpact` walks the ray in 24 steps against
`runtime.heightAt`. It has been exercised for shape, not against real terrain,
so a bolt fired down a cliff may scorch a metre high or low.

**Which body is casting.** Only the player has a bridge. A monster's spell
still goes through `effects.bolt` as it always did.

**Multi-cast.** One cast at a time, which is the runtime's own rule: a second
cast resets the first, tail and all. A future instant fired during a fireball's
2.5 s burn would cut that burn short. Nobody can currently do that, because the
runtime refuses a second cast while one is running, but it is a real edge and
is written down rather than discovered.
