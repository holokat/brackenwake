# Character progression and combat presentation

This update adds character levels alongside the existing practice skills. New characters start at level 1 with their class's basic attack and shared movement/recovery abilities. Existing saves retain items and previously earned abilities. Level 99 is the cap. Each level after the first grants one talent point. Ability trees expose prerequisites and level requirements; learned abilities can be placed on the existing action bar. Additional ranks reduce cooldowns by 3% per rank, up to 12%, without removing resource costs.

Acceptance checks:

- New characters in all four openings start at level 1 with only their basic abilities; advanced abilities cannot be cast by bypassing the UI.
- Defeating hostile monsters grants XP once, shows progress and announces level-ups. Friendly, training and summoned targets grant no XP. XP, ranks and unspent points survive saving. Level 99 stops XP growth.
- Trees show connected branches, rank, level requirement and available points. Learning spends points once, refreshes runtime passives and supports action-bar binding. Legacy learned abilities remain available.
- Equipment has helmet, shoulders, chest, belt, legs, gloves, boots, amulet, two rings and weapons. Equip, replace, unequip, stats and save migration work without losing existing items.
- Monster rewards remain on the corpse and are claimed through a loot panel. Partial/full bags preserve leftovers. Repeated claims cannot duplicate items or gold. Ordinary dropped items and skinning still work.
- Blood appears on successful combat damage with bounded particles/decals and cleanup. Grass adds depth and movement while respecting roads, water, interiors and quality limits.
- Focused domain tests, full existing test suite, production build and isolated-character browser checks cover the real integrated paths. Any remaining failures are reported with evidence.

Player controls:

- `P` opens Skill trees. The level/XP badge opens the same panel.
- `C` opens the character, equipment and pack page. Empty equipment cells name their slot. Drag a pack item onto its slot to equip it; click an equipped piece to take it off.
- Click a nearby dead monster, use its Loot context action, or press `E` nearby to open its held rewards. Take items individually or use Take all.

Progression rules:

- The XP needed from level `L` to `L + 1` is `100 + 35 × (L - 1) + 8 × (L - 1)²`, up to level 99. Saved XP is cumulative; level and available points are derived from it.
- Existing characters begin the new level track at level 1 while retaining their already earned abilities as free first ranks. New characters receive only their opening's basic attack and shared recovery/movement abilities.
- Enemy XP scales with tier and maximum health. Direct attacks, damage over time and explicitly owned friendly summons can credit a defeat; the same death cannot award twice. Training targets, friendly targets and summoned victims do not grant XP.
- Each school contains paths through the existing ability catalogue. The character's opening selects the initial school, while equipment rules still govern what can be used. Practice skills continue to influence the existing combat calculations.

Verification evidence is kept outside production assets in `work/game-rework/`. The committed `tools/qa/progression.html?solo` and `tools/qa/grass-blood.html?solo` harnesses replace browser storage with memory before booting the actual game, so they cannot overwrite a player's character.
