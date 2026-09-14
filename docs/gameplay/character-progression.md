# Character progression and combat presentation

Characters begin at level 1. Level 99 is the cap, and every level after the first grants one talent point, for 98 points total. XP is cumulative and derives both level and available points:

`XP from level L to L + 1 = 100 + 35 × (L - 1) + 8 × (L - 1)²`

Mage, Warrior, Rogue, Ranger, Paladin and Priest each have three live specialization paths. The [class tree architecture](class-tree-architecture.md) defines 263 live nodes: 83 existing abilities and 180 original modifiers. Modifiers have three ranks and one point per rank. Each specialization capstone requires level 82 and 25 paid points in that specialization; a class can select one capstone.

Existing cooldown abilities keep their current five-rank limit and 3% cooldown reduction for each rank after the free first rank. A modifier is separate from an ability rank: it affects the supported combat value, counts as a talent allocation, and never adds an action-bar ability.

Practice skills are professions. They retain their own training and locks, while class level and talent points govern combat ability progression. Equipment, ammunition, resource, targeting, and movement checks still apply when an ability is used.

Older characters retain valid learned abilities. Migration stores current class-node allocations separately from a read-only legacy archive, and projects the compatible ability ranks used by casting and action bars. A talent reset refunds paid current allocations while retaining starter grants and archived ranks; the runtime allows that reset only outside combat.

Controls:

- `P` opens Skill trees. Select a node to inspect its current and next rank effects.
- `C` opens the character, equipment and pack page.
- Click a nearby corpse, use its Loot action, or press `E` nearby to open held rewards.
