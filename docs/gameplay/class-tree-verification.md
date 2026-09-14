# Six classes and CSS windows

This change builds on `ea4427f` in the Brackenwake repository.

## Delivered behavior

- Creation offers Mage, Warrior, Rogue, Ranger, Paladin and Priest. All begin at level 1 with valid starter kits and 20 bandages. Paladin and Priest reuse existing character models and portraits.
- Each class has three specialization trees. The catalogue contains 216 placements: 83 existing ability placements and 133 planned mechanics. Planned nodes have descriptions but cannot be bought or used. Full mechanics and the remaining point-economy work are in the [progression map](class-tree-architecture.md).
- Current talent purchases enforce class ownership, prerequisites, level, rank and point limits. Shared Campcraft remains available. Talent details retain their controls across unchanged window updates so keyboard focus and clicks are not interrupted.
- The codex, character equipment page and creation windows use CSS surfaces. Codex tabs have text labels. Creation retains its existing background image and ambient video.
- The character page retains the live paper doll, all twelve equipment slots, inventory actions and comparison tooltips.

## Automated evidence

The full `npm test` run finished while the window refactor was in progress. Four UI suites failed: HUD, studio integration, character window and window manager. Their initial failures included retired source-layout assertions, an intermediate missing style initializer and missing model aliases for the two new classes. All four passed after correction: HUD 293 checks, character 119, window manager 141, and studio integration completed with seven bodies and eighteen equipment swaps. Studio integration emitted a nonfatal Node fetch warning for `cellar-oram`.

Final focused checks also passed for creation (205), progression (113), ability runtime (348), talent-panel interactions, class-tree invariants and migration. `npm run build`, the QA script syntax check and `git diff --check` passed. Vite still reports large chunks and existing imports that cannot be split dynamically; these warnings were not suppressed. The repository uses npm and has no `check` script.

The independent migration test covers 384 generated valid v1 histories, compares effective ranks and remaining points, and rehydrates the migrated result. It also covers a grandfathered Meteor grant trained to rank 5 without its old prerequisites, free grants appearing in their own class nodes, reordered v2 allocations for all six classes, a deep rank-5 Rift path and overlapping current/legacy point accounting. These checks caught migration defects that are now fixed.

The talent-panel interaction check exercises learning with and without points, refusing planned nodes and foreign-class purchases, preserving focus on unchanged refreshes, and placing learned abilities on the action bar. Catalogue checks validate counts, unique IDs and coordinates, dependency cycles, prerequisite levels and live-node reachability.

## Remaining visual review

The current CSS screens have not been visually verified in Brave. Computer-use tools report that the Mac is locked and automatic unlock failed. Earlier screenshots show the superseded UI and are not evidence for this layout.

The committed QA page uses in-memory browser storage before booting the real game, so it cannot read or overwrite a player's saved character:

- `http://localhost:5210/tools/qa/progression.html?solo&creationOnly` opens the six-class creation screen.
- `http://localhost:5210/tools/qa/progression.html?solo` exercises a real kill, XP, learning Fireball, save hydration, equipment and corpse loot, then provides buttons to review the trees and character page.

Inspect creation, character equipment and skill trees at desktop and narrow widths. Check text clipping, tab visibility, icon padding, slot labels, scroll access and the preserved creation background. Capture those screens as a labeled contact sheet before production release. These checks are pending, not a claim that the UI passed visual review.
