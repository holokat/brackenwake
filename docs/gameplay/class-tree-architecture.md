# Class trees and specialization progression

Brackenwake has six class catalogues: Mage, Warrior, Rogue, Ranger, Paladin and Priest. Each has three specializations. The live catalogue is [class_trees.js](../../src/mmo/class_trees.js), with its authored modifier effects in [talent_modifiers.js](../../src/mmo/talent_modifiers.js).

## Catalogue

There are 263 live nodes across 18 specializations:

- 83 ability nodes retain their existing ability IDs, casts, action-bar bindings and save compatibility.
- 180 original modifier nodes add ranked numeric effects to existing abilities, actors, or summons.
- Each specialization has nine three-rank modifiers and one one-rank capstone.

Modifier nodes use stable class-scoped IDs such as `mage.fire.emberThread`. They contain `kind: 'modifier'`, `maxRank: 3`, `pointCost: 1`, `effects`, optional prerequisites, and an explicit level. Capstones use `maxRank: 1`, level 82, `requiredTreePoints: 25`, and a class-wide `choiceGroup`; a character can select one capstone for its class.

`effects` are live data rather than roadmap prose. The supported effect targets are `ability`, `actor`, and `summon`. Effects carry numeric changes and, where needed, a condition such as an owned damage-over-time effect, a controlled or low-health target, an active self effect, a shield, an owner mark, or an `all` condition. Catalogue validation rejects unknown effect types, change keys, conditions, non-live nodes, missing effects, and invalid capstone gates.

## Allocation and saves

Level 99 yields 98 talent points. Ability ranks and modifier ranks each cost one point. A free starter or retained grant is rank one without consuming a point. Modifier ranks count toward the global point pool and their specialization's tree points, but never become ability ranks or action-bar entries.

The advancement record stores class-node ranks in `allocations`; ability-keyed `ranks` remains a projection for existing casting and bars. Legacy ability allocations remain in a read-only archive. Current and archived ranks for the same ability use the higher effective rank and spend their shared paid ranks once. `respecTalentTree` refunds paid current allocations, preserves free grants and the legacy archive, and leaves the runtime to enforce its outside-combat rule.

## Design and references

The modifier names, effects, rank values, and capstones are original Brackenwake catalogue design. The interaction model uses three class paths, cross-path spending, clear prerequisites, and a respec as familiar navigation patterns. The external references below informed that interaction shape only; they do not supply combat mechanics, names, values, or balance for this catalogue.

- [WoW Classic primer](https://worldofwarcraft.blizzard.com/en-us/news/23090134/wow-classic-primer-for-new-players)
- [World of Warcraft talent preview](https://worldofwarcraft.blizzard.com/en-gb/news/23797209/world-of-warcraft-dragonflight-talent-preview)

When extending the catalogue, preserve stable IDs and use only effect fields with a runtime reader and a focused test. New class mechanics belong in an explicit effect contract, not a placeholder node.
