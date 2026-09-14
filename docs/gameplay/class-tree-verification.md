# Class progression verification

This release builds on `ea4427f` and `f09ab22` in the Brackenwake repository.

## Delivered behavior

- Creation offers Mage, Warrior, Rogue, Ranger, Paladin and Priest at level 1, with valid starter equipment and 20 bandages. Level 99 grants 98 talent points in total.
- The catalogue contains 263 live placements across 18 specializations: 83 existing ability nodes and 180 original modifier nodes. There are no planned or unpurchasable placeholder nodes.
- Combat abilities follow class, level, prerequisites and purchased talents. Combat no longer awards practice gains or uses a shared skill-point cap. Fifteen generic professions retain numeric training and individual locks. Older learned abilities and combat proficiency floors survive migration.
- Modifier ranks affect actual casts, delayed attacks, per-target area effects, actor properties and summons. Conditions distinguish a character's own damage-over-time effects and marks from another actor's effects.
- Ability previews reuse combat-rule damage and healing formulas. Cooldowns use the same training and modifier limits as casts. Action-bar previews invalidate after changes to ranks, stats, equipment or active effects.
- Talent resets are rejected during combat. They refund current paid allocations, retain starter grants and legacy allocations, remove unlearned action-bar entries and temporary effects, and preserve resource amounts and cooldowns.
- The character window keeps the portrait's aspect ratio and gives all twelve equipment slots readable labels. Stats and inventory scroll within their panels; narrow windows stack the panels. Creation retains its background and uses CSS windows. The skills tab is labelled Professions.
- Corpse loot uses the same item artwork lookup as inventory, including the Rapier image and material-specific stack context.

## Automated checks

The focused suites cover class ownership, level and point gates, all catalogue effect fields, conditional effects, modifier save hydration, respec, stat scaling, loot artwork and the real talent-panel controls. The modifier audit evaluates every catalogue effect in isolation and fails if its declared runtime target does not change.

Runtime tests compare displayed cooldowns against actual ability use at trained ranks 2 through 5, including the combined 25% reduction limit. They also change stats and equipped weapons between action-bar reads to detect stale previews. Damage tests compare the preview with `combat_rules.resolveSpell` and check exact healing and bandage amounts.

Migration checks include generated valid v1 histories, reordered v2 allocations for all six classes, grandfathered ability grants, deep purchased paths and overlapping current/legacy point accounting. Professions tests prove combat practice produces no gains while profession practice still advances.

The final `npm test` run passed every functional check. Its only failure was the unchanged terrain benchmark: 3.112 microseconds per sample against a 3-microsecond limit. An isolated rerun passed all 221 terrain checks at 2.713 microseconds per sample. No terrain code or threshold was changed. The final cooldown/cache follow-up passed 359 ability-runtime checks and 12 effective-ability checks; the professions cleanup passed 82 checks.

`npm run build`, QA script syntax checks and `git diff --check` passed. Vite reports existing large chunks and ineffective dynamic imports; those warnings were not suppressed. The repository uses npm and has no `check` script.

## Browser evidence

The QA harness replaces storage with an in-memory store before importing the game. It cannot read or overwrite a player's saved character.

- `tools/qa/progression.html?solo&creationOnly` opens character creation.
- `tools/qa/progression.html?solo` exercises a real kill, XP, learning Fireball, save hydration, equipment and corpse loot, then supplies review buttons.
- `tools/qa/live-talents.js` buys three ranks of Copper thread through the actual panel, checks damage changes, hover text and save hydration, then uses the real reset button and checks that the damage returns to its baseline.
- `tools/qa/character-layout.html` runs the character panel at selected viewport widths and reports clipping, slot labels and portrait geometry.

The local browser run reported `progression-verified`, `live-talents-verified` and `progression-ready`. Character layout checks passed at 1366, 1024, 390 and 320 CSS pixels wide. The desktop and narrow character screenshots were reviewed together in `work/game-rework/character-css-contact.png`.

A final visual pass of the trees, corpse artwork and creation screen remains pending while the Mac is locked. This is separate from the completed browser interaction checks and character layout review. Long-session balance across all six classes has not been measured; the catalogue values are an initial tuning pass.

## Humanoid rigging workflow

The reusable `humanoid-foot-locking` skill is installed under `/Users/k/.codex/skills/` and referenced by the project instructions and `blender-fast`. It records the source method, rig adaptation, contact-state resets, export requirements and runtime verification. Adding the skill does not change current character animation.
