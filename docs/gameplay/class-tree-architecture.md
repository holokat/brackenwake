# Class trees and specialization progression

## Decision and delivery boundary

Choose Mage, Warrior, Rogue, Ranger, Paladin, or Priest when creating a character. Each class owns three visible specialization trees. Characters may distribute points among their own three trees; equipment, ammunition, resource, targeting, and movement restrictions still apply. Common movement and recovery abilities remain available to every class.

This delivery establishes class ownership, branching progression, a shared data contract, and a concrete expansion map. Existing abilities use their existing combat implementations. Nodes marked `planned` are a roadmap: they cannot be purchased, grant an ability, change a stat, appear as a usable action, or become a prerequisite for an existing ability. Keeping the old cooldown training ranks preserves the present progression and older builds, but does not finish the deeper specialization gameplay described here.

The catalogue is [class_trees.js](../../src/mmo/class_trees.js). It contains six classes, 18 specializations, and 216 node placements. There are 83 placements of existing abilities and 133 planned nodes. Placements exceed unique ability counts because Paladin and Priest can share a spell, and a few classes share martial or defensive abilities. Within one class, an existing ability has exactly one node. The mapping below is derived from that catalogue.

## Evidence and constraints

The starting revision for this design was `ea4427f`. Its [talent rules](../../src/mmo/talents.js) exposed eight unrestricted school tabs, used ability IDs as purchase identities, awarded one point per level after the first through level 99, and used additional ranks for cooldown reduction. Its [progression notes](character-progression.md) document that earlier release and should be read as historical where the class-owned system differs.

The [ability catalogue](../../src/mmo/abilities.js) is the source for existing effects, costs, equipment checks, and passive flags. The [ability runtime](../../src/game/abilities_runtime.js) interprets those effects and applies learned passives. [Actor recomputation](../../src/game/actor.js) maps supported modifiers to derived combat fields, while [combat rules](../../src/mmo/combat_rules.js) and [combat execution](../../src/game/combat.js) consume them. Merely adding a modifier name to a node does not implement a mechanic. Existing documentation sometimes describes earlier spell behavior; code takes precedence for this inventory.

[Creation](../../src/game/creation.js), [opening data](../../src/mmo/openings.js), [save hydration](../../src/game/state.js), and [starter-bar projection](../../src/game/progression.js) form one integration path. A character must receive equipment and skills that make its granted actions usable. Paladin holy spells use Chivalry and now channel through a held melee weapon or a focus, with the existing holy armor exemption. The starting sword and shield can therefore use Heal. Arcane magic still requires its normal focus. Priest's existing Heal also scales from Chivalry; using it does not create a new healing scaling system.

Blizzard's [Classic primer](https://worldofwarcraft.blizzard.com/en-us/news/23090134/wow-classic-primer-for-new-players) describes three trees per class, points distributed across trees, and resetting talents. Those are useful interaction references. Its later [talent design discussion](https://worldofwarcraft.blizzard.com/en-gb/news/23797209/world-of-warcraft-dragonflight-talent-preview) distinguishes baseline abilities, class identity, and specialization choices. This design applies those principles to Brackenwake's existing skills and equipment; it does not assume Warcraft combat rules, exact talent counts, or balance.

## Class identity and shared abilities

| Class | Specializations | Free class starter abilities |
| --- | --- | --- |
| Mage | Arcane, Fire, Frost | `magicArrow` |
| Warrior | Arms, Fury, Protection | `powerStrike` |
| Rogue | Assassination, Combat, Subtlety | `dualStrike`, `hide` |
| Ranger | Marksmanship, Survival, Beast mastery | `aimedShot` |
| Paladin | Holy, Protection, Retribution | `powerStrike`, `heal` |
| Priest | Holy, Discipline, Shadow | `eldritchBolt`, `heal` |

All six receive `jump`, `sprint`, `bandage`, `meditate`, and `recall`. `camp` is a separate shared utility purchase and does not create a fourth specialization. Existing practice skills still determine the calculations that currently consume them. Talent ownership replaces the advancement character's skill-based unlock gate, not weapon requirements or those calculations.

Shared ability IDs refer to one implementation and one effective rank. For example, `paladin.holy.heal` and `priest.holy.heal` both unlock `heal`. Neither a shared node nor a grandfathered grant creates a second Heal, an extra bar action, an extra passive application, or another cooldown clock. Per-class behavior should later use an explicit modifier or variant contract; do not change the global Heal definition when implementing a Paladin-only talent.

The `group` field in the existing ability catalogue remains an effect and presentation classification. It is not class ownership. Starter-bar construction must use the granted starter set and `weaponCheck`, because Paladin's starting abilities cross the old `warrior` and `healer` groups. Existing bars remain arrays of ability IDs.

## Catalogue and domain contract

`CLASS_TREES` exports six `{id, name, branches}` records. Each branch has `{id, name, description, nodes}`. `CLASS_NODES` indexes every node by its globally unique stable ID. No imports from abilities, browser code, save storage, or runtime code are permitted in this data module.

```js
{
  id: 'priest.discipline.atonement',
  name: 'Atonement',
  description: 'Planned: ...', // A concrete proposed mechanic, never a live claim.
  status: 'planned',         // 'live' or 'planned'.
  level: 26,                // Explicit gate; illustration only, read actual catalogue.
  row: 3, column: 0,         // Zero-based position. Columns are 0, 1, or 2.
  requires: ['priest.discipline.smite'],
  maxRank: 1                 // Planned placeholder; no rank may be purchased.
}
```

Live records include `abilityId`; their names and descriptions at runtime should come from `ABILITIES_BY_ID`. Their maximum rank comes from the existing ability rules. Planned records have no `abilityId`; their descriptive names must never be sent to `useById`, resource spending, or bar binding. The illustrative object above describes the shape, not an exact duplicate of that node's current position or level.

`requires` means all referenced nodes must have at least rank one. Every dependency is inside the same specialization. There are forks and joins; one root can feed independent lines and a deeper node can require both. Prerequisite rank thresholds, exclusive choices, and tree-spend gates are future schema additions, not implied by arrows or by descriptive text.

Use the existing public talent functions as the compatibility surface. Internally, resolving a node ID and resolving an ability ID are distinct operations:

1. Resolve class ownership from the character's canonical class identity.
2. Resolve the requested node within that class, or the shared utility node.
3. Reject planned, missing, wrong-class, and immutable legacy-only purchases.
4. Compute current effective ability rank, level, prerequisites, rank limit, and available points from canonical state.
5. Spend and change rank once, then recompute passives and actor values and mark advancement dirty.

The purchase UI, bar binding, passive application, and casting must all use the same ownership and unlock projection. A UI filter alone is insufficient. Public cast and network ability IDs remain unchanged. No protocol migration is justified by this data refactor.

When future mechanics are implemented, extend the node contract with explicit `kind`, `effectId` or `modifierId`, `rankEffects`, `requiresRanks`, `requiresAny`, `requiredTreePoints`, and `choiceGroup` fields only where a consumer exists. A supported modifier registry should declare its reader and stacking rule. A choice group permits one selected member and defines whether dependent nodes survive changing that choice. A planned node becomes live only when its full execution and persistence path is tested.

## Levels, points, and ranks

Preserve the level cap of 99, the cumulative XP curve, and the 98 earned points. The current XP requirement from level `L` to `L + 1` remains `100 + 35 × (L - 1) + 8 × (L - 1)²`. Never serialize an authoritative level or unspent-point count separately from XP and ranks.

For this foundation, unlocking an existing active ability costs one point. Additional existing cooldown training ranks remain one point each, through rank five where the ability supports them. Ranks two through five reduce the original cooldown by 3%, 6%, 9%, and 12%. Passive and zero-cooldown abilities retain their existing rank limits. Free granted rank one does not consume a point; later ranks do. Count an ability once even when several node identities can refer to it.

Live unlock levels are explicit ability milestones, independent of list position. Starters begin at level 1, early branch choices at 2, utility develops through 6–26, and stronger area attacks and defenses arrive around 42. Meteor unlocks at 62, Chain Lightning at 42, and Rift at 82. Every node is at least as high-level as its prerequisites. Higher training ranks retain the domain's rank-level requirement. Existing grants bypass new unlock-level and prerequisite requirements for ability use; they do not bypass equipment or resource checks. These milestones still need playtesting against the existing damage, cooldown, and enemy curves.

Planned mechanic milestones start at levels 10, 18, 26, 34, 42, 50, 62, 74, and 82, then move later whenever a prerequisite requires it. Planned capstones are at least level 82. These are design targets and are not spendable content. Visual row is a layout coordinate, so the displayed level must come from `level` rather than inferred row position.

The launch economy remains incomplete. A class with few live cooldown-bearing abilities can run out of useful purchases well before level 99, even with five training ranks. Bank surplus points, display the true available count, and state that unavailable nodes are future content. Do not sell a cosmetic rank or enable a planned node to absorb unused points.

For mature specialization trees, replace generic cooldown training gradually with named upgrades that change a condition, interaction, target decision, or resource tradeoff. Use one point for a new active, a new behavior, or a choice; use at most three ranks for a scalar that strengthens a defined behavior. Each rank must list its actual magnitude. Replacing a rank's effect requires a new catalogue revision, a documented compensation or reset, and player-visible confirmation.

The proposed mature capstone rule is 50 points spent within that specialization plus one point to buy the capstone. With 98 earned points, a new character can afford one 51-point capstone path and up to 47 points elsewhere. This rule must remain disabled until every specialization has more than 50 reachable, useful paid ranks before its capstone and at least two viable routes through that investment. The present roadmap defines mechanics; it does not yet satisfy or price that full rank inventory. Do not impose a gate that makes a capstone mathematically unreachable.

Level pacing should be measured in play before tuning XP: first new ability, first branch decision, first two-ability interaction, first defensive answer, first build-specific payoff, and late-game spending. This change does not invent a target number of hours to reach level 99. Levels 83–99 should support secondary-tree investment and meaningful upgrades once those mechanics exist, rather than sixteen more copies of the same cooldown reduction.

## Save migration and compatibility

Advancement v2 is a separate schema version from the outer character save. Preserve the current outer character fields and item, equipment, currency, skill, XP, and action-bar data. Save migration belongs in the pure advancement hydration path invoked by `state.hydrate`; UI code never migrates or repairs saves.

Advancement v2 stores `classId`, cumulative `xp`, free ability IDs in `granted`, purchases in `allocations` keyed by class node ID, and historical ability ranks in `legacy.allocations`. Ability-keyed `ranks` are rebuilt as a compatibility projection for combat and action bars. Preserve the exact effective ranks and paid-point accounting of valid v1 saves, including skills now outside the character's class. Expose those outside-class abilities as learned legacy abilities with read-only ranks. They remain bindable and castable under their existing equipment and resource rules. New points cannot increase them.

Validate a v1 allocation under the old rules before applying the new class restriction. Rebuilding it through the new class gate would discard legitimate purchases. Preserve free grants separately from paid ranks, and never charge an extra point because an old ability acquired a node ID. Rehydrating an already migrated character must not append another grant, spend another point, change rank, or reset XP.

For characters predating advancement, preserve the known previously usable or recorded learned ability IDs supplied by the existing legacy hydration path as free first-rank grants. Preserve bars that refer to those abilities. The existing low-level legacy grant behavior is intentional compatibility, not a route for new characters to unlock all spell schools.

Canonical class IDs are the six creation IDs. Preserve the original `opening` value when it records an older identity. Confirmed spelling aliases can resolve to a canonical class without changing equipment or skills. Historical Necromancer, Bard, Artisan, Blank, and unrecognized identifiers must retain their save and learned kit; they must not be silently rewritten as a fresh Warrior or have a class inferred from their highest skill. An unsupported identity may have no new class purchases until a separate explicit class-selection flow exists. The legacy ability view must still work.

Unknown ability IDs are inert, not callable. Before a later schema version ships, add a bounded migration report and an unsupported-version recovery path that preserves the raw payload without overwriting it. Those recovery features are not implemented in this delivery. Do not roll a v2 save back through an older client that cannot read it.

Back up a real user's save before any manual migration testing. Automated and browser checks should use in-memory or isolated fixture storage. This design work does not alter a user's browser save.

## Implementation ownership and failure modes

| Boundary | Owner | Required behavior |
| --- | --- | --- |
| Class identity, starter stats, equipment | `openings.js`, `creation.js` | Six choices create valid complete kits; older four starters remain unchanged. |
| Static ownership and roadmap | `class_trees.js` | Stable node IDs, unique class/spec IDs, valid topology, explicit planned status. |
| XP, points, learning, hydration | `talents.js` and focused pure helpers | Same gates for all callers; no spend on refusal; idempotent migration. |
| Ability definitions and equipment | `abilities.js` | Existing spell IDs, costs, weapon restrictions, and effects remain authoritative. |
| Passive and triggered execution | `abilities_runtime.js`, `actor.js`, `combat.js` | Only supported effects run, once, with an identified caster and stacking rule. |
| Bars and spellbook | `progression.js`, `win_abilities.js` | Ability-ID projection; unavailable plans cannot be bound; legacy learned actions remain. |
| Tree presentation | `talent_panel.js` | Three class-specific panels, labeled branches, rank badges, dependency arrows, honest disabled states. |
| Save transport | `state.js` | Serialize canonical advancement once; preserve unrelated save fields. |

The new tree view should fit the current request for a CSS-based character interface: labeled tabs, fluid sizing, and no dependency on painted frame geometry. At narrower widths, let the three specialization panels scroll or stack while keeping labels, ranks, and prerequisites readable. A change to the surrounding character HUD is a separate implementation scope from the catalogue and these gameplay rules.

| Failure mode | Required prevention and evidence |
| --- | --- |
| A button is hidden, but direct learning buys another class's skill | Call the pure purchase API with wrong-class nodes and ability IDs; assert no mutation. |
| A planned node spends points or becomes a spell | Exercise learning, binding, passive application, and direct cast paths against every planned node. |
| A shared spell grants two effects | Measure one effective rank, one cooldown, one cost payment, and one passive entry for duplicate ownership sources. |
| New prerequisites erase an old build | Migrate v1 fixtures containing off-class ranks and late abilities, then compare rank effects, point cost, and bar contents. |
| An old rank silently becomes free or gets charged twice | Compare unique ability-based paid-point totals before and after hydration. |
| A new class starts with unusable buttons | Build real opening equipment; check every seeded action with `weaponCheck` and full `canUse`. |
| An ability is learned but its passive never applies | Learn and rehydrate a passive through the actual runtime path, equip and remove its required weapon, and inspect the consumed actor bonus. |
| A tooltip implies that a summon is a permanent pet | Beast Call retains its temporary summon description; persistent companion nodes remain explicitly planned. |
| A future proc triggers itself indefinitely | Carry root event ID, owner, proc lineage, and per-window limits in the mechanic's eventual event contract. |
| A future heal or hit duplicates across multiplayer callbacks | Resolve effects at the existing combat authority boundary with a deduplicated action/event ID. No talent-side second damage write. |
| A future talent removes an immunity by accident | Test resistant, immune, dead, missing, allied, hostile, and invalid-world-layer targets. |

## Alternatives and rollout

Keeping unrestricted school tabs would preserve access with little work, but it would leave creation choices unrelated to talent ownership. Creating independent spell copies for every class would make early presentation easy while duplicating effects, cooldowns, costs, and migration IDs. Implementing new resources, pets, threat, healing transfer, and proc engines in this change would expand the work beyond a reviewable class-tree foundation. The chosen boundary reuses working spell implementations and describes those larger mechanics explicitly.

Ship the data and domain rules together, then connect creation and the three-panel view. Retain v1 fixtures and old ability-keyed exports during the migration. Test all six creation paths and both sides of every gate before exercising an isolated character in the real game. A rollback must understand v2 or preserve the pre-migration save; an older client must not overwrite a new schema.

Validate catalogue invariants separately from gameplay: exactly six classes, three distinct specs each, 8–12 nodes per spec, unique node IDs and coordinates, valid referenced abilities, acyclic same-spec prerequisites, no live dependency on a planned node, and no planned gate below its prerequisites. Then validate real learning, cooldown ranks, passives, binding, save round trips, and isolated browser behavior. Run the repository's actual `npm test` and `npm run build`; it has an npm/Vite manifest and no `check` script at the inspected revision. The coordinating implementation owns those full-suite and browser results.

Add future mechanics by dependency group. First support bounded modifiers, consumption-based triggers, and clear combat events. Then add class resources and channels. Then add persistent pet ownership, ally absorbs, healing transfer, threat, and interception as separately reviewed contracts. Promote one coherent specialization interaction at a time, with observable effects and its own acceptance checks. Marking every roadmap node live together is not a rollout strategy.

## Complete specialization map

The following tables describe the authored catalogue. Existing rows show actual ability IDs, not new effect implementations. Planned rows give stable local IDs, mechanics, and dependencies. A dependency listed as `root` means no talent prerequisite; class, level, rank, and point gates still apply. All prerequisites are local to the table's class and specialization. Planned levels are targets, and planned capstone investment gates remain disabled.

Integration labels identify the additional implementation boundary to inspect: `combat` for damage and status resolution, `runtime` for targeting/casting/resource execution, `actor` for derived supported modifiers, `pets` for ownership and AI, `healing` for heals/absorbs/transfer, `movement` for path and position validation, `inventory` for equipment/ammunition/consumables, and `events` for deduplicated trigger and expiry state. An existing handler is a starting point, not evidence that a new mechanic works.


### Mage: Arcane

Build a spell sequence, choose when to spend mana, and control where a fight happens.

| Node | Status / level | Prerequisites | Mechanic / integration |
| --- | --- | --- | --- |
| Magic Arrow (`magicArrow`) | Existing, 1 | root | A quick bolt of energy, with one second between shots. Existing ability; cooldown training supported. |
| Lightning (`lightning`) | Existing, 6 | `magicArrow` | No wind up at all. It is simply there, and then it is over. Existing ability; cooldown training supported. |
| Blink (`blink`) | Existing, 10 | `magicArrow` | Twelve metres the way you are looking, through whatever was between. Existing ability; cooldown training supported. |
| Eldritch Bolt (`eldritchBolt`) | Existing, 14 | `lightning` | Cheap, quick, and one time in five it stops them casting for two seconds. Existing ability; cooldown training supported. |
| Hex (`hex`) | Existing, 20 | `blink` | It misses more and blocks less for twelve seconds, and does not know why. Existing ability; cooldown training supported. |
| Mana Shield (`manaShield`) | Existing, 26 | `blink` | For fifteen seconds every wound costs mana at two for one instead of blood. Existing ability; cooldown training supported. |
| Chain Lightning (`chainLightning`) | Existing, 42 | `lightning` | It jumps to three more, weaker each time, and finds them all itself. Existing ability; cooldown training supported. |
| Arcane Mastery (`arcaneMastery`) | Existing, 62 | `eldritchBolt` | You have read enough to know where the seams are. Ten percent more crits. Existing ability; passive. |
| Rift (`rift`) | Existing, 82 | `chainLightning`, `hex` | A three metre tear that drags monsters in and holds them there for four seconds. Existing ability; cooldown training supported. |
| Transmute (`transmute`) | Existing, 50 | `hex` | One stack of ore becomes the tier above it, and you lose three tenths in the change. Existing ability; cooldown training supported. |
| Arcane charges (`arcaneCharges`) | Planned, 10 | `magicArrow`, `lightning` | Planned: successive Magic Arrow hits build up to three charges. Lightning consumes them for stronger damage and a higher mana cost; missing or changing targets does not create a charge. Integration: runtime, combat, events. |
| Echoing rift (`echoingRift`) | Planned, 82 | `rift`, `arcaneCharges` | Planned: a Lightning cast into your Rift repeats once at reduced strength on trapped enemies. The repeat spends no charge, cannot trigger itself, and inherits the original caster. Integration: runtime, movement, events. |

### Mage: Fire

Maintain a burn, gather enemies, and commit to a telegraphed burst.

| Node | Status / level | Prerequisites | Mechanic / integration |
| --- | --- | --- | --- |
| Fireball (`fireball`) | Existing, 2 | root | It lands hot and keeps burning for four seconds after. Existing ability; cooldown training supported. |
| Spell Plague (`spellPlague`) | Existing, 42 | `fireball` | Twenty five poison, and after it every spell you land there bursts on its neighbours. Existing ability; cooldown training supported. |
| Meteor (`meteor`) | Existing, 62 | `fireball` | A second and a half of shadow on the ground before anything happens. Existing ability; cooldown training supported. |
| Kindling (`kindling`) | Planned, 10 | `fireball` | Planned: Fireball against a target already burning from your Fireball extends that burn up to a fixed duration cap instead of creating overlapping copies. Integration: runtime, events. |
| Flashover (`flashover`) | Planned, 18 | `fireball` | Planned: consecutive direct fire critical hits prepare an instant Fireball. Damage over time and triggered repeats cannot build the sequence. Integration: runtime, combat, events. |
| Cinder trail (`cinderTrail`) | Planned, 26 | `kindling` | Planned: moving after a completed Fireball leaves a short burning trail. A target can take one trail tick per interval regardless of overlapping segments. Integration: runtime, events. |
| Controlled burn (`controlledBurn`) | Planned, 34 | `kindling` | Planned: choose a longer, weaker burn or a shorter, stronger burn for Fireball. The alternatives replace each other and preserve a declared total-damage budget. Integration: runtime, combat. |
| Ashfall (`ashfall`) | Planned, 62 | `meteor` | Planned: Meteor leaves a brief burning area after impact. Leaving the area ends new applications; a missed impact still creates the marked area. Integration: runtime. |
| Spreading flame (`spreadingFlame`) | Planned, 50 | `kindling` | Planned: a burning enemy defeated by you spreads a reduced burn to one nearby enemy. A spread burn cannot spread again. Integration: runtime. |
| Plague fuel (`plagueFuel`) | Planned, 62 | `spellPlague` | Planned: direct fire damage against your Spell Plague restores a small amount of mana, limited by a per-caster interval. Plague bursts cannot trigger the refund. Integration: runtime, combat, events. |
| Phoenix step (`phoenixStep`) | Planned, 74 | `cinderTrail` | Planned: taking a large direct hit grants one short movement burst and consumes the prepared defense. Periodic damage cannot trigger it. Integration: runtime, combat, movement, events. |
| Combustion (`combustion`) | Planned, 82 | `controlledBurn`, `ashfall` | Planned capstone: consume your remaining Fireball burn for an immediate burst and empower the next Meteor. The consumed burn cannot also finish ticking. Integration: runtime, events. |

### Mage: Frost

Control pursuit, prepare a frozen target, and trade movement for protection.

| Node | Status / level | Prerequisites | Mechanic / integration |
| --- | --- | --- | --- |
| Ice Shard (`iceShard`) | Existing, 2 | root | Less than a fireball and it takes something off their speed instead. Existing ability; cooldown training supported. |
| Stone Skin (`stoneSkin`) | Existing, 10 | `iceShard` | Thirty armour for twelve seconds, and you walk like the stone you are wearing. Existing ability; cooldown training supported. |
| Frost Nova (`frostNova`) | Existing, 18 | `iceShard` | The floor goes white for five metres and nothing on it moves for three seconds. Existing ability; cooldown training supported. |
| Ward (`ward`) | Existing, 42 | `stoneSkin` | Four metres of floor where everything hurts a third less, for ten seconds. Existing ability; cooldown training supported. |
| Elemental Kin (`elementalKin`) | Existing, 62 | `ward` | The elements stopped arguing with you. Fifteen percent off each of them. Existing ability; passive. |
| Shatter (`shatter`) | Planned, 18 | `iceShard`, `frostNova` | Planned: your next direct Ice Shard against a target rooted by your Frost Nova gains critical chance and consumes that root. Other roots do not qualify. Integration: runtime, combat, events. |
| Deep chill (`deepChill`) | Planned, 18 | `iceShard` | Planned: repeated Ice Shard hits build chill stacks that improve its slow up to a cap. Root-immune enemies remain slow-immune where their existing immunity requires it. Integration: runtime, combat, events. |
| Ice floes (`iceFloes`) | Planned, 26 | `frostNova` | Planned: a successful Frost Nova prepares one cast that can finish while moving. The charge is consumed when that cast starts. Integration: runtime, events. |
| Glacial shelter (`glacialShelter`) | Planned, 42 | `ward` | Planned: while standing in your Ward, being struck grants a limited frost absorb. Leaving the area prevents new absorbs and does not refill an existing one. Integration: runtime, healing. |
| Brittle ice (`brittleIce`) | Planned, 42 | `shatter` | Planned: when your own root breaks from damage, it applies a short slow instead of being refreshed. Reapplication cannot create a permanent root loop. Integration: runtime, combat. |
| Cold snap (`coldSnap`) | Planned, 50 | `stoneSkin`, `frostNova` | Planned: an active defensive reset refreshes Frost Nova and Stone Skin once, with its own independent cooldown that it cannot reset. Integration: runtime. |
| Winter heart (`winterHeart`) | Planned, 82 | `deepChill`, `glacialShelter` | Planned capstone: consume accumulated chill on nearby enemies to create a brief protective storm. Damage and shielding scale with consumed stacks, with explicit target and absorb caps. Integration: runtime, combat, healing, events. |

### Warrior: Arms

Choose a weapon approach and time deliberate strikes around wounds and openings.

| Node | Status / level | Prerequisites | Mechanic / integration |
| --- | --- | --- | --- |
| Power Strike (`powerStrike`) | Existing, 1 | root | The next swing lands with your shoulder behind it, for sixty percent more. Existing ability; cooldown training supported. |
| Rend (`rend`) | Existing, 6 | `powerStrike` | A cut that keeps opening. Three a second for eight seconds after. Existing ability; cooldown training supported. |
| Lunge (`lunge`) | Existing, 14 | `powerStrike` | Five metres closed in one step, with the point arriving first. Existing ability; cooldown training supported. |
| Crushing Blow (`crushingBlow`) | Existing, 42 | `powerStrike` | Armour dents. Ten points of it, for ten seconds, and the wearer sits down. Existing ability; cooldown training supported. |
| Sweep (`sweep`) | Existing, 26 | `powerStrike` | The haft comes round in a wide arc and puts the front rank on its back. Existing ability; cooldown training supported. |
| Open wound (`openWound`) | Planned, 10 | `powerStrike`, `rend` | Planned: Power Strike against your own Rend adds a capped amount of bleed duration. It does not duplicate the bleed or reward somebody else’s wound. Integration: runtime, combat, events. |
| Measured reach (`measuredReach`) | Planned, 18 | `lunge` | Planned: a Lunge from outside ordinary melee range empowers the next landed melee hit. Repeated point-blank lunges cannot prepare it. Integration: runtime, combat, events. |
| Weapon discipline (`weaponDiscipline`) | Planned, 26 | `powerStrike` | Planned: choose blade wounds, mace armor breaking, or polearm reach. Only the selected discipline applies, and only with its matching equipped weapon. Integration: runtime, combat, inventory. |
| Mortal wound (`mortalWound`) | Planned, 34 | `openWound` | Planned: a new heavy strike applies a short healing-received reduction. It requires an explicit healing modifier reader and immunity handling. Integration: runtime, combat, healing. |
| Sweeping edge (`sweepingEdge`) | Planned, 42 | `rend`, `sweep` | Planned: Sweep transfers a reduced copy of your Rend to one additional target. Transferred wounds cannot trigger further transfers. Integration: runtime, combat, healing, events. |
| Execution window (`executionWindow`) | Planned, 50 | `crushingBlow` | Planned: a low-health enemy enables a stamina-expensive finishing attack. Target health is checked again when damage resolves. Integration: runtime, combat, healing, events. |
| Warmaster’s blow (`warMastersBlow`) | Planned, 82 | `weaponDiscipline`, `mortalWound` | Planned capstone: strike consumes your active wound or armor-break setup for a different payoff, according to the selected weapon discipline. Integration: runtime, combat, inventory, events. |

### Warrior: Fury

Sustain pressure and choose how much defense to give up during a burst.

| Node | Status / level | Prerequisites | Mechanic / integration |
| --- | --- | --- | --- |
| Whirlwind (`whirlwind`) | Existing, 14 | root | A turn on the spot that opens everything standing within three metres. Existing ability; cooldown training supported. |
| Battle Cry (`battleCry`) | Existing, 26 | `whirlwind` | Everyone within ten metres hits a fifth harder for twelve seconds. Existing ability; cooldown training supported. |
| Berserk (`berserk`) | Existing, 62 | `whirlwind` | Fifteen seconds of forty percent more, and a third of your armour forgotten. Existing ability; cooldown training supported. |
| Blood rush (`bloodRush`) | Planned, 14 | `whirlwind` | Planned: consecutive landed melee hits build a short-lived momentum resource. Misses do not build it, and leaving combat clears it. Integration: runtime, combat, events. |
| Reckless rhythm (`recklessRhythm`) | Planned, 18 | `bloodRush` | Planned: spending momentum increases attack speed while reducing armor for the same duration. The tradeoff has a fixed stack cap. Integration: runtime, combat, events. |
| Bloodthirst (`bloodthirst`) | Planned, 26 | `bloodRush` | Planned: a new single-target attack heals from actual damage dealt, up to a per-use cap. Overkill and blocked damage cannot increase the heal. Integration: runtime, combat, healing. |
| Cleaving blows (`cleavingBlows`) | Planned, 34 | `whirlwind` | Planned: Whirlwind prepares a limited number of attacks that splash reduced damage to one nearby target. Splash cannot create more prepared attacks. Integration: runtime, combat, events. |
| Rallying roar (`rallyingRoar`) | Planned, 42 | `battleCry` | Planned: Battle Cry briefly supplies temporary health to nearby allies. Expiration removes only remaining temporary health and cannot kill the ally. Integration: runtime, healing, movement. |
| Battle trance (`battleTrance`) | Planned, 50 | `bloodRush` | Planned: repeated hits on the same target reduce stamina costs while attacks on another target end the trance. Integration: runtime, combat. |
| Last reserve (`lastReserve`) | Planned, 62 | `berserk` | Planned: crossing a low-health threshold restores a capped amount of stamina once per encounter window. Healing across the threshold cannot repeatedly farm it. Integration: runtime, healing, events. |
| Tempered rage (`temperedRage`) | Planned, 74 | `berserk` | Planned: choose a weaker armor penalty during Berserk or stronger damage with a larger penalty. Both variants retain a visible drawback. Integration: runtime, combat. |
| Unbound fury (`unboundFury`) | Planned, 82 | `recklessRhythm`, `temperedRage` | Planned capstone: spend all momentum to extend the current Berserk, up to a fixed extension cap, while suspending new momentum generation. Integration: runtime, events. |

### Warrior: Protection

Block a dangerous hit, interrupt its follow-up, and protect an ally’s position.

| Node | Status / level | Prerequisites | Mechanic / integration |
| --- | --- | --- | --- |
| Shield Bash (`shieldBash`) | Existing, 2 | root | The shield is a weapon too. Half the damage and two seconds of nothing. Existing ability; cooldown training supported. |
| Disarm (`disarm`) | Existing, 14 | `shieldBash` | A twist of the wrist. It fights you barehanded for six seconds. Existing ability; cooldown training supported. |
| Riposte (`riposte`) | Existing, 26 | `shieldBash` | Every parry answers back for half a swing. Always on. Existing ability; passive. |
| Leap Slam (`leapSlam`) | Existing, 42 | `shieldBash` | Eight metres of air and then the ground, and whatever was standing on it. Existing ability; cooldown training supported. |
| Shield block (`shieldBlock`) | Planned, 10 | `shieldBash` | Planned: prepare a limited number of stronger blocks for a short window. Each resolved eligible block consumes one charge. Integration: runtime, healing, events. |
| Revenge (`revenge`) | Planned, 26 | `riposte` | Planned: a successful block or parry enables one counterattack. Spending the opportunity cannot itself generate another opportunity. Integration: runtime, combat. |
| Taunt (`taunt`) | Planned, 26 | `shieldBash` | Planned: force an eligible hostile target to attack you briefly, then retain only the explicitly assigned threat. Boss immunity and multiplayer authority must be implemented. Integration: runtime, combat. |
| Intervene (`intervene`) | Planned, 42 | `leapSlam` | Planned: move to an ally and intercept one direct attack within a short window. An attack can be intercepted once across the whole party. Integration: runtime, combat, movement, events. |
| Brace (`brace`) | Planned, 42 | `shieldBlock` | Planned: standing still with a shield increases the value of the next block; moving clears the preparation. It never blocks attacks that bypass shields. Integration: runtime, combat, healing. |
| Hold the line (`holdTheLine`) | Planned, 50 | `shieldBlock` | Planned: after a block, nearby allies behind you gain a small defensive benefit. Facing, area membership, and refresh rules must be measured. Integration: runtime. |
| Shield wall (`shieldWall`) | Planned, 62 | `brace` | Planned: a defensive active reduces incoming damage while reducing your damage dealt for the same window. It cannot be active after the shield is removed. Integration: runtime, combat, healing, movement, events. |
| Unbroken (`unbroken`) | Planned, 82 | `shieldWall`, `intervene` | Planned capstone: a lethal eligible hit leaves you alive once, consumes the prepared guard, and applies a long lockout. Simultaneous hits share the same consumed state. Integration: runtime, combat, events. |

### Rogue: Assassination

Prepare poison and wounds, then spend the opening on a decisive finish.

| Node | Status / level | Prerequisites | Mechanic / integration |
| --- | --- | --- | --- |
| Dual Strike (`dualStrike`) | Existing, 1 | root | Two short cuts, one from each hand. It needs a dagger in both hands. Existing ability; cooldown training supported. |
| Deep Cut (`deepCut`) | Existing, 6 | `dualStrike` | A small cut in the right place, and it keeps opening for six seconds. Existing ability; cooldown training supported. |
| Poison Blade (`poisonBlade`) | Existing, 14 | `dualStrike` | Five hits carry poison at your Poisoning divided by twenty. Existing ability; one rank. |
| Kidney Shot (`kidneyShot`) | Existing, 26 | `deepCut` | A short stun from behind, or from hiding. Expensive, and worth the breath. Existing ability; cooldown training supported. |
| Finishing Strike (`finishingStrike`) | Existing, 62 | `deepCut`, `poisonBlade` | When the wound is winning, this makes it final. Existing ability; cooldown training supported. |
| Venom cycle (`venomCycle`) | Planned, 14 | `poisonBlade` | Planned: alternate direct dagger hits and poison ticks to build a capped venom resource. Repeated ticks alone cannot fill it. Integration: runtime, combat, events. |
| Serrated wound (`serratedWound`) | Planned, 18 | `deepCut`, `poisonBlade` | Planned: Deep Cut against a poisoned target lengthens its wound up to a cap. Cleansing poison prevents subsequent extensions. Integration: runtime, combat. |
| Envenom (`envenom`) | Planned, 26 | `venomCycle` | Planned: spend venom on a direct poison finisher, consuming the accumulated stacks rather than duplicating their future damage. Integration: runtime, combat, events. |
| Nerve strike (`nerveStrike`) | Planned, 34 | `kidneyShot` | Planned: when Kidney Shot ends naturally, its target deals less damage briefly. Repeated stuns do not indefinitely refresh the reduction. Integration: runtime, combat. |
| Potent mixture (`potentMixture`) | Planned, 42 | `poisonBlade` | Planned: choose a slower damaging poison or a weaker poison that impairs healing. The choice replaces the enchant recipe and keeps existing item costs. Integration: runtime, combat, healing, inventory. |
| Cut to the quick (`cutToTheQuick`) | Planned, 62 | `finishingStrike` | Planned: Finishing Strike against a target bearing your wound refunds part of its stamina cost once. The refund is based on the amount actually paid. Integration: runtime, combat. |
| Venomous end (`venomousEnd`) | Planned, 82 | `envenom`, `serratedWound` | Planned capstone: Envenom on a wounded low-health target detonates part of its remaining poison. The damage calculation excludes overkill and removed ticks. Integration: runtime, combat, healing, movement. |

### Rogue: Combat

Fight in the open, manage an exposed target, and turn a dodge into pressure.

| Node | Status / level | Prerequisites | Mechanic / integration |
| --- | --- | --- | --- |
| Throwing Knife (`throwingKnife`) | Existing, 2 | root | A knife leaves the hand at short range. Not much weight, but it arrives. Existing ability; cooldown training supported. |
| Evasion (`evasion`) | Existing, 14 | `throwingKnife` | Four seconds where nothing lands. Pick them carefully. Existing ability; cooldown training supported. |
| Expose Weakness (`exposeWeakness`) | Existing, 42 | `throwingKnife` | You point at the gap and everyone else gets a quarter more for ten seconds. Existing ability; cooldown training supported. |
| Blade tempo (`bladeTempo`) | Planned, 10 | `throwingKnife` | Planned: alternating main-hand and off-hand hits builds tempo; using the same hand twice resets the sequence. Tempo has a fixed cap. Integration: runtime, combat, events. |
| Rippling steel (`ripplingSteel`) | Planned, 18 | `bladeTempo` | Planned: spend tempo to make the next melee hit splash to one additional nearby target. Splash cannot build tempo. Integration: runtime, combat. |
| Kick (`kick`) | Planned, 26 | `throwingKnife` | Planned: a short-range interrupt stops an interruptible cast and briefly locks that spell school. Noncasting targets still consume the action. Integration: runtime, combat, events. |
| Riposte window (`riposteWindow`) | Planned, 34 | `evasion` | Planned: dodging an attack during Evasion prepares a single counterstrike, with a per-window cap against crowds. Integration: runtime, combat, events. |
| Relentless assault (`relentlessAssault`) | Planned, 42 | `exposeWeakness` | Planned: consecutive attacks on your Expose Weakness target restore a capped amount of stamina; switching targets clears the sequence. Integration: runtime, combat, events. |
| Blade flurry (`bladeFlurry`) | Planned, 50 | `ripplingSteel` | Planned: temporarily convert part of single-target melee damage into nearby cleave, with a stamina upkeep cost and a target cap. Integration: runtime, combat. |
| Combat readiness (`combatReadiness`) | Planned, 62 | `riposteWindow` | Planned: repeated direct attacks from the same enemy grant a capped defensive stack against that enemy. Changing attackers does not transfer protection. Integration: runtime, combat, healing, events. |
| Disarming cut (`disarmingCut`) | Planned, 74 | `kick`, `bladeTempo` | Planned: a tempo spender disarms an eligible armed enemy briefly. Innate attacks and immune enemies retain their existing attack rules. Integration: runtime, combat. |
| Killing spree (`killingSpree`) | Planned, 82 | `bladeFlurry`, `relentlessAssault` | Planned capstone: spend all tempo on a bounded sequence of strikes against the current target and nearby hostiles. Each step revalidates range, life state, and path. Integration: runtime, movement, events. |

### Rogue: Subtlety

Arrange the approach, choose the opening target, and leave before the return hit.

| Node | Status / level | Prerequisites | Mechanic / integration |
| --- | --- | --- | --- |
| Hide (`hide`) | Existing, 1 | root | Stand still for a second and you are not there. Stealth is what lets you walk. Existing ability; cooldown training supported. |
| Backstab (`backstab`) | Existing, 6 | `hide` | From behind, or out of hiding, three times the damage. From the front, nothing. Existing ability; cooldown training supported. |
| Pick Pocket (`pickPocket`) | Existing, 10 | `hide` | Gold, or something common, off a humanoid that has not noticed you yet. Existing ability; cooldown training supported. |
| Shadowstep (`shadowstep`) | Existing, 26 | `backstab` | Ten metres and you are behind it, which is where Backstab wants you. Existing ability; cooldown training supported. |
| Vanish (`vanish`) | Existing, 42 | `hide` | Out of a fight, instantly, with everything forgetting it was chasing you. Existing ability; cooldown training supported. |
| Patient ambush (`patientAmbush`) | Planned, 10 | `hide`, `backstab` | Planned: remaining hidden without attacking prepares a stronger first Backstab, with a preparation cap and clear reset on detection. Integration: runtime, combat, events. |
| Premeditation (`premeditation`) | Planned, 18 | `hide` | Planned: mark one enemy while hidden to prepare a resource for your opener. Changing the marked enemy discards the earlier preparation. Integration: runtime, events. |
| Shadow dance (`shadowDance`) | Planned, 26 | `backstab` | Planned: briefly permit attacks that require hiding while remaining visible. This grants ability eligibility and does not itself erase enemy aggro. Integration: runtime, combat. |
| Smoke veil (`smokeVeil`) | Planned, 34 | `hide` | Planned: place a smoke area that blocks eligible ranged targeting across its boundary. Line-of-sight, projectiles already in flight, and allies need explicit rules. Integration: runtime, movement. |
| Shadow relay (`shadowRelay`) | Planned, 42 | `backstab`, `shadowstep` | Planned: a successful Backstab after Shadowstep prepares one return to the recorded origin. The return expires and must validate collision and world layer. Integration: runtime, movement, events. |
| Clean escape (`cleanEscape`) | Planned, 50 | `vanish` | Planned: Vanish removes a defined set of movement impairments but preserves damage-over-time effects that can reveal you again. Integration: runtime, combat, movement. |
| Master of shadows (`masterOfShadows`) | Planned, 82 | `patientAmbush`, `shadowDance` | Planned capstone: your prepared opener creates a short window for a second positional attack; it consumes the preparation and cannot refresh its own window. Integration: runtime, combat, movement, events. |

### Ranger: Marksmanship

Prepare a firing position and choose precise pressure or a committed area volley.

| Node | Status / level | Prerequisites | Mechanic / integration |
| --- | --- | --- | --- |
| Aimed Shot (`aimedShot`) | Existing, 1 | root | Stand still, breathe out, and put it where you meant to. Existing ability; cooldown training supported. |
| Double Shot (`doubleShot`) | Existing, 6 | `aimedShot` | Two arrows off the string before the first one lands. Existing ability; cooldown training supported. |
| Piercing Arrow (`piercingArrow`) | Existing, 26 | `aimedShot` | Half the armour counts, and the shaft carries on into whatever is behind. Existing ability; cooldown training supported. |
| Volley (`volley`) | Existing, 62 | `doubleShot` | Arrows come down on a five metre circle rather than at anything in it. Existing ability; cooldown training supported. |
| Steady aim (`steadyAim`) | Planned, 10 | `aimedShot` | Planned: standing still briefly prepares the next Aimed Shot for increased accuracy; movement or starting the shot consumes the preparation. Integration: runtime, movement, events. |
| Careful aim (`carefulAim`) | Planned, 18 | `aimedShot` | Planned: Aimed Shot gains a bonus against an enemy above a declared health threshold. The threshold is evaluated when damage resolves. Integration: runtime, combat, healing. |
| Crossfire (`crossfire`) | Planned, 26 | `doubleShot` | Planned: Double Shot against two distinct nearby enemies prepares a stronger single-target follow-up. Both arrows still require ammunition. Integration: runtime, inventory, events. |
| Puncture (`puncture`) | Planned, 34 | `piercingArrow` | Planned: Piercing Arrow leaves a short armor weakness that your next Aimed Shot consumes. Other players do not consume it. Integration: runtime, combat, events. |
| Ranged discipline (`rangedDiscipline`) | Planned, 42 | `steadyAim` | Planned: choose a longer stationary preparation bonus or a smaller bonus maintained during slow movement. The preparation rules replace each other. Integration: runtime, combat, movement. |
| Suppression (`suppression`) | Planned, 62 | `volley` | Planned: Volley slows enemies only while its damage area remains active. Overlapping volleys do not multiply the slow. Integration: runtime, combat. |
| Kill shot (`killShot`) | Planned, 62 | `puncture` | Planned: a new ammunition-consuming shot is available below a low-health threshold and resolves eligibility at impact. Integration: runtime, healing, inventory. |
| True shot (`trueShot`) | Planned, 82 | `rangedDiscipline`, `killShot` | Planned capstone: a short precision window makes Aimed Shot, Double Shot, and Piercing Arrow build a three-step sequence with a payoff on completing all three. Integration: runtime, events. |

### Ranger: Survival

Arrange a trap, control pursuit, and make distance useful rather than permanent.

| Node | Status / level | Prerequisites | Mechanic / integration |
| --- | --- | --- | --- |
| Snare (`snare`) | Existing, 2 | root | A loop of wire in the grass. The first thing through it stops for four seconds. Existing ability; cooldown training supported. |
| Crippling Shot (`cripplingShot`) | Existing, 14 | `snare` | A bolt through the leg. It comes on at half speed for six seconds. Existing ability; cooldown training supported. |
| Disengage (`disengage`) | Existing, 26 | `snare` | Six metres of backwards, and three seconds of running to make them count. Existing ability; cooldown training supported. |
| Trapcraft (`trapcraft`) | Planned, 10 | `snare` | Planned: a trap placed out of combat arms faster and lasts longer. Moving an existing trap consumes it before creating the replacement. Integration: runtime, events. |
| Barbed wire (`barbedWire`) | Planned, 18 | `snare` | Planned: a target leaving your expired Snare receives a short bleed. Destroyed or disarmed traps cannot apply it. Integration: runtime, combat. |
| Explosive trap (`explosiveTrap`) | Planned, 26 | `trapcraft` | Planned: choose an explosive trap instead of the rooting Snare. Both occupy the same trap limit and cannot trigger each other. Integration: runtime, combat, events. |
| Frost trap (`frostTrap`) | Planned, 34 | `trapcraft` | Planned: choose a persistent slowing field instead of the rooting Snare. It shares the same replacement choice as Explosive Trap. Integration: runtime, combat. |
| Harpoon (`harpoon`) | Planned, 42 | `cripplingShot` | Planned: an aimed tether closes distance to an eligible target without pulling bosses. It needs collision checks and a separate weapon requirement. Integration: runtime, movement, inventory. |
| Counter pursuit (`counterPursuit`) | Planned, 50 | `disengage` | Planned: Disengage after a close-range enemy hit prepares one trap that can be placed while moving, with a short expiration. Integration: runtime, combat, movement, events. |
| Lock and load (`lockAndLoad`) | Planned, 62 | `barbedWire` | Planned: your trap’s first successful trigger prepares a limited number of empowered shots. Each placed trap can grant the benefit once. Integration: runtime, events. |
| Field medicine (`fieldMedicine`) | Planned, 74 | `disengage` | Planned: a completed Bandage after Disengage restores some stamina. The bandage must consume its item and complete its normal interruptible channel. Integration: runtime, combat, inventory, events. |
| Wildfire ambush (`wildfireAmbush`) | Planned, 82 | `lockAndLoad`, `counterPursuit` | Planned capstone: triggering your selected trap prepares a shot whose effect matches that trap: bleed, explosion, or chill, with one payoff per trap. Integration: runtime, combat, events. |

### Ranger: Beast mastery

Fight beside a called beast and spend attention on its position and survival.

| Node | Status / level | Prerequisites | Mechanic / integration |
| --- | --- | --- | --- |
| Hunter's Mark (`huntersMark`) | Existing, 2 | root | You have its scent. Fifteen percent more from you for a minute, and nowhere to hide. Existing ability; cooldown training supported. |
| Fleet Foot (`fleetFoot`) | Existing, 14 | `huntersMark` | A tenth quicker on your feet, and a fifth once Tracking reaches ninety. Existing ability; passive. |
| Beast Call (`beastCall`) | Existing, 42 | `huntersMark` | A wolf answers and fights beside you for half a minute. At Animal Lore 70 a boar comes instead, and at 90 a dire wolf. Existing ability; cooldown training supported. |
| Bonded companion (`bondedCompanion`) | Planned, 42 | `beastCall` | Planned: a dedicated companion persists beyond Beast Call’s temporary summon duration. Ownership, dismissal, death, save hydration, and pet limits must all be implemented. Integration: runtime, pets, events. |
| Kill command (`killCommand`) | Planned, 42 | `bondedCompanion` | Planned: command your owned living companion to use its next attack on the selected enemy. Range and path failure refuse the command without consuming its cost. Integration: runtime, combat, pets, movement. |
| Mend companion (`mendCompanion`) | Planned, 42 | `bondedCompanion` | Planned: a heal over time affects only your owned living beast, with its own cost and recast rule. It cannot heal hostile or another player’s pets. Integration: runtime, healing, pets. |
| Pack tactics (`packTactics`) | Planned, 42 | `huntersMark`, `killCommand` | Planned: alternating your direct hit and your companion’s hit on the marked target prepares a bounded bonus. Pet damage cannot count as both participants. Integration: runtime, combat, pets, events. |
| Beast training (`beastTraining`) | Planned, 42 | `bondedCompanion` | Planned: choose a durable guardian beast or an aggressive hunting beast. The choice changes a declared pet profile, with a single companion limit. Integration: runtime, pets. |
| Coordinated pursuit (`coordinatedPursuit`) | Planned, 50 | `fleetFoot`, `packTactics` | Planned: moving toward your companion briefly improves movement when both pursue the same marked enemy. Separation and direction are checked each update. Integration: runtime, pets, movement. |
| Protective bond (`protectiveBond`) | Planned, 62 | `beastTraining` | Planned: command the companion to intercept a bounded share of one direct hit on you. Interception cannot recursively trigger another interception. Integration: runtime, combat, pets, events. |
| Feral recovery (`feralRecovery`) | Planned, 74 | `mendCompanion`, `huntersMark` | Planned: when your companion defeats your marked target, reduce the remaining cost of the next Mend Companion through a one-use credit, without generating money or items. Integration: runtime, pets, inventory. |
| Bestial wrath (`bestialWrath`) | Planned, 82 | `packTactics`, `beastTraining` | Planned capstone: a short coordinated burst empowers you and the companion while limiting defensive commands. The state ends safely on pet death or dismissal. Integration: runtime, pets. |

### Paladin: Holy

Deliver direct healing while keeping a chosen ally ready for the next hit.

| Node | Status / level | Prerequisites | Mechanic / integration |
| --- | --- | --- | --- |
| Heal (`heal`) | Existing, 1 | root | Twenty and a share of your Chivalry, on anyone you can see. Existing ability; cooldown training supported. |
| Cleanse (`cleanse`) | Existing, 6 | `heal` | Poison, bleed and one curse, gone, with no wind up at all. Existing ability; cooldown training supported. |
| Greater Heal (`greaterHeal`) | Existing, 18 | `heal` | A second and a half of standing still buys fifty and more. Existing ability; cooldown training supported. |
| Lay on Hands (`layOnHands`) | Existing, 62 | `greaterHeal` | All of it, at once, and then a minute and a half of not being able to. Existing ability; cooldown training supported. |
| Holy shock (`holyShock`) | Planned, 10 | `heal` | Planned: a new instant spell heals an ally or damages an enemy using explicit target-dependent effects and a shared cooldown. Integration: runtime, combat, healing. |
| Infusion (`infusion`) | Planned, 18 | `greaterHeal` | Planned: an effective critical heal prepares one faster Greater Heal. Overhealing alone cannot trigger the preparation. Integration: runtime, combat, healing, events. |
| Beacon of light (`beaconOfLight`) | Planned, 26 | `heal` | Planned: choose one ally to receive a bounded portion of your effective direct healing on other allies. Copied healing cannot copy itself. Integration: runtime, healing. |
| Illuminated mercy (`illuminatedMercy`) | Planned, 34 | `greaterHeal` | Planned: part of a completed direct heal becomes a capped absorb on its target, with replacement and expiry rules rather than unlimited accumulation. Integration: runtime, healing, events. |
| Clean hands (`cleanHands`) | Planned, 42 | `cleanse` | Planned: Cleanse that actually removes an eligible effect restores a small amount of mana. Empty cleanses receive no refund. Integration: runtime, movement. |
| Steadfast prayer (`steadfastPrayer`) | Planned, 50 | `greaterHeal` | Planned: completing consecutive stationary heals builds limited resistance to damage interruption. Movement clears the preparation. Integration: runtime, combat, healing, movement. |
| Saving grace (`savingGrace`) | Planned, 62 | `holyShock` | Planned: healing a low-health ally prepares a limited defensive benefit on that ally. A per-target lockout prevents repeated threshold farming. Integration: runtime, healing, events. |
| Avenging mercy (`avengingMercy`) | Planned, 82 | `holyShock`, `beaconOfLight` | Planned capstone: direct damage and effective direct healing alternate to build a short burst that strengthens Holy Shock. Copied heals and triggered damage do not advance it. Integration: runtime, combat, healing, events. |

### Paladin: Protection

Place a defended area and protect allies through a shield and holy support.

| Node | Status / level | Prerequisites | Mechanic / integration |
| --- | --- | --- | --- |
| Shield Bash (`shieldBash`) | Existing, 2 | root | The shield is a weapon too. Half the damage and two seconds of nothing. Existing ability; cooldown training supported. |
| Bless (`bless`) | Existing, 10 | `shieldBash` | Five to everything for thirty seconds. Cheap, and it adds up in a party. Existing ability; cooldown training supported. |
| Riposte (`riposte`) | Existing, 26 | `shieldBash` | Every parry answers back for half a swing. Always on. Existing ability; passive. |
| Ward (`ward`) | Existing, 42 | `bless` | Four metres of floor where everything hurts a third less, for ten seconds. Existing ability; cooldown training supported. |
| Sanctuary (`sanctuary`) | Existing, 62 | `ward` | Five metres where nothing can be attacked, for six seconds. Long enough. Existing ability; cooldown training supported. |
| Righteous defense (`righteousDefense`) | Planned, 10 | `shieldBash` | Planned: select an ally and briefly redirect one eligible attacker to you. It requires authoritative target and threat changes and cannot redirect every enemy at once. Integration: runtime, combat. |
| Holy shield (`holyShield`) | Planned, 26 | `riposte` | Planned: prepare a limited number of shield blocks that deal holy retaliation. Retaliation cannot trigger itself or spend a charge twice. Integration: runtime, healing, events. |
| Consecrated ground (`consecratedGround`) | Planned, 42 | `ward` | Planned: a new ground effect damages eligible hostiles and improves your defense while you stand within it. This is distinct from Consecrate Weapon. Integration: runtime, combat, inventory. |
| Blessing of freedom (`blessingOfFreedom`) | Planned, 34 | `bless` | Planned: remove declared movement impairments from an ally and briefly prevent their reapplication. Stuns and encounter restrictions remain separate. Integration: runtime, combat, movement. |
| Guardian’s oath (`guardiansOath`) | Planned, 42 | `righteousDefense` | Planned: choose one ally to receive a limited damage transfer while close to you. Transfers cannot transfer again and stop on death, distance, or world-layer change. Integration: runtime, combat, healing, movement. |
| Aegis of faith (`aegisOfFaith`) | Planned, 50 | `holyShield`, `ward` | Planned: an effective shield block strengthens your next Ward up to a fixed cap. Recasting Ward consumes the preparation once. Integration: runtime, healing, events. |
| Ardent defender (`ardentDefender`) | Planned, 82 | `guardiansOath`, `aegisOfFaith` | Planned capstone: a short defensive vow can prevent one lethal hit and consumes itself. Lethal-hit resolution, healing restrictions, and lockout must be one transaction. Integration: runtime, combat, healing, events. |

### Paladin: Retribution

Alternate melee commitment and holy attacks to prepare a costly finishing strike.

| Node | Status / level | Prerequisites | Mechanic / integration |
| --- | --- | --- | --- |
| Power Strike (`powerStrike`) | Existing, 1 | root | The next swing lands with your shoulder behind it, for sixty percent more. Existing ability; cooldown training supported. |
| Consecrate Weapon (`consecrateWeapon`) | Existing, 6 | `powerStrike` | Twenty seconds where your blade means half again to anything already dead. Existing ability; cooldown training supported. |
| Smite (`smite`) | Existing, 14 | `powerStrike` | Thirty to forty five, and twice that on the undead. Existing ability; cooldown training supported. |
| Battle Cry (`battleCry`) | Existing, 26 | `consecrateWeapon` | Everyone within ten metres hits a fifth harder for twelve seconds. Existing ability; cooldown training supported. |
| Crushing Blow (`crushingBlow`) | Existing, 42 | `powerStrike` | Armour dents. Ten points of it, for ten seconds, and the wearer sits down. Existing ability; cooldown training supported. |
| Zeal (`zeal`) | Planned, 14 | `consecrateWeapon`, `smite` | Planned: alternating landed melee attacks and direct holy spell hits builds a capped zeal resource. Repeated use of one category does not build the sequence. Integration: runtime, combat, events. |
| Judgment (`judgment`) | Planned, 18 | `smite` | Planned: a new holy strike marks one enemy; your next qualifying melee hit consumes the mark for a declared benefit. Integration: runtime, combat, events. |
| Crusader strike (`crusaderStrike`) | Planned, 26 | `powerStrike` | Planned: a new melee attack builds zeal on a landed hit, with explicit mana or stamina cost rather than a new unconsumed resource field. Integration: runtime, combat, events. |
| Divine storm (`divineStorm`) | Planned, 34 | `zeal` | Planned: spend zeal on capped melee area damage, trading single-target finishing power for a group hit. Integration: runtime, combat, events. |
| Righteous pursuit (`righteousPursuit`) | Planned, 42 | `judgment` | Planned: moving toward your Judgment target grants a bounded speed bonus until the mark is consumed or distance stops closing. Integration: runtime, movement, events. |
| Hammer of wrath (`hammerOfWrath`) | Planned, 50 | `smite`, `zeal` | Planned: a ranged holy finisher requires a low-health enemy or an explicit capstone window; eligibility is rechecked at resolution. Integration: runtime, healing, events. |
| Avenging wrath (`avengingWrath`) | Planned, 82 | `divineStorm`, `hammerOfWrath` | Planned capstone: spend stored zeal to enter a short holy burst that enables Hammer of Wrath, while suspending normal zeal generation. Integration: runtime, events. |

### Priest: Holy

Prepare sustained healing, respond to wounds, and spend attention across allies.

| Node | Status / level | Prerequisites | Mechanic / integration |
| --- | --- | --- | --- |
| Heal (`heal`) | Existing, 1 | root | Twenty and a share of your Chivalry, on anyone you can see. Existing ability; cooldown training supported. |
| Cleanse (`cleanse`) | Existing, 6 | `heal` | Poison, bleed and one curse, gone, with no wind up at all. Existing ability; cooldown training supported. |
| Greater Heal (`greaterHeal`) | Existing, 18 | `heal` | A second and a half of standing still buys fifty and more. Existing ability; cooldown training supported. |
| Resurrect (`resurrect`) | Existing, 42 | `greaterHeal` | Five seconds of standing over them, and they get up where they fell. Existing ability; cooldown training supported. |
| Lay on Hands (`layOnHands`) | Existing, 62 | `greaterHeal` | All of it, at once, and then a minute and a half of not being able to. Existing ability; cooldown training supported. |
| Renew (`renew`) | Planned, 10 | `heal` | Planned: a new healing-over-time spell has a fixed duration and refresh rule. Its ticks retain caster ownership and honor healing immunity. Integration: runtime, healing, events. |
| Prayer of mending (`prayerOfMending`) | Planned, 18 | `heal` | Planned: apply a heal that triggers on a qualifying direct hit, then jumps to an eligible nearby ally for a limited number of charges. Integration: runtime, combat, healing, events. |
| Serendipity (`serendipity`) | Planned, 26 | `greaterHeal` | Planned: effective small direct heals prepare one faster Greater Heal, with a stack cap and a timeout. Integration: runtime, healing, events. |
| Circle of healing (`circleOfHealing`) | Planned, 34 | `renew` | Planned: a new area heal selects a bounded number of injured allies using deterministic health and distance ordering. Integration: runtime, healing, movement. |
| Lasting prayer (`lastingPrayer`) | Planned, 42 | `renew`, `greaterHeal` | Planned: Greater Heal on a target with your Renew extends that Renew up to a duration cap. It does not add another heal-over-time instance. Integration: runtime, healing, events. |
| Guardian spirit (`guardianSpirit`) | Planned, 50 | `prayerOfMending` | Planned: protect one ally from one lethal eligible hit during a short window, consuming the protection and applying a declared recovery amount. Integration: runtime, combat, events. |
| Divine hymn (`divineHymn`) | Planned, 82 | `circleOfHealing`, `guardianSpirit` | Planned capstone: a stationary interruptible channel heals a bounded nearby party each tick. Cancelled ticks neither spend reserved resources nor heal. Integration: runtime, combat, healing, events. |

### Priest: Discipline

Prepare mitigation, use a direct holy attack, and decide when offense supports recovery.

| Node | Status / level | Prerequisites | Mechanic / integration |
| --- | --- | --- | --- |
| Smite (`smite`) | Existing, 2 | root | Thirty to forty five, and twice that on the undead. Existing ability; cooldown training supported. |
| Bless (`bless`) | Existing, 10 | `smite` | Five to everything for thirty seconds. Cheap, and it adds up in a party. Existing ability; cooldown training supported. |
| Mana Shield (`manaShield`) | Existing, 26 | `smite` | For fifteen seconds every wound costs mana at two for one instead of blood. Existing ability; cooldown training supported. |
| Ward (`ward`) | Existing, 42 | `bless` | Four metres of floor where everything hurts a third less, for ten seconds. Existing ability; cooldown training supported. |
| Sanctuary (`sanctuary`) | Existing, 62 | `ward` | Five metres where nothing can be attacked, for six seconds. Long enough. Existing ability; cooldown training supported. |
| Power word: Shield (`powerWordShield`) | Planned, 10 | `bless` | Planned: a new ally-targeted absorb has a fixed capacity, expiry, and per-target reapplication lockout. This is not the existing self-only Mana Shield. Integration: runtime, healing, events. |
| Atonement (`atonement`) | Planned, 18 | `smite` | Planned: mark a limited number of allies; actual direct Smite damage heals those allies for a bounded share. Reflected, repeated, and transferred damage cannot trigger it. Integration: runtime, combat, healing, events. |
| Penance (`penance`) | Planned, 26 | `smite` | Planned: a new short channel damages an enemy or heals an ally with separately validated tick effects and one declared resource cost. Integration: runtime, combat, healing, events. |
| Borrowed time (`borrowedTime`) | Planned, 34 | `powerWordShield` | Planned: when your ally absorb is consumed by damage, prepare one faster direct cast. Expiry or replacement cannot trigger it. Integration: runtime, combat, healing, events. |
| Pain suppression (`painSuppression`) | Planned, 42 | `ward` | Planned: apply a short damage reduction to one ally, with explicit stacking rules against Ward and other reductions. Integration: runtime, combat, events. |
| Rapture (`rapture`) | Planned, 50 | `powerWordShield` | Planned: an absorb consumed by damage returns a capped amount of mana once per caster interval. A self-inflicted transfer loop cannot farm refunds. Integration: runtime, combat, healing, events. |
| Evangelism (`evangelism`) | Planned, 82 | `atonement`, `penance` | Planned capstone: alternate effective healing and direct Smite hits to extend existing Atonement marks within a hard duration cap. Integration: runtime, combat, healing, events. |

### Priest: Shadow

Sustain a draining target, control dangerous enemies, and choose how much health to risk.

| Node | Status / level | Prerequisites | Mechanic / integration |
| --- | --- | --- | --- |
| Eldritch Bolt (`eldritchBolt`) | Existing, 1 | root | Cheap, quick, and one time in five it stops them casting for two seconds. Existing ability; cooldown training supported. |
| Life Drain (`lifeDrain`) | Existing, 6 | `eldritchBolt` | Half of what it loses arrives in you. The necromancer never needs a bandage. Existing ability; cooldown training supported. |
| Curse of Weakness (`curseOfWeakness`) | Existing, 14 | `lifeDrain` | Fifteen seconds of hitting a fifth softer and wearing a fifth less armour. Existing ability; cooldown training supported. |
| Fear (`fear`) | Existing, 26 | `lifeDrain` | Beasts and men within six metres run. Undead and constructs do not. Existing ability; cooldown training supported. |
| Bone Spear (`boneSpear`) | Existing, 42 | `lifeDrain` | It goes through the first one and keeps going down the line. Existing ability; cooldown training supported. |
| Spell Plague (`spellPlague`) | Existing, 42 | `curseOfWeakness` | Twenty five poison, and after it every spell you land there bursts on its neighbours. Existing ability; cooldown training supported. |
| Shadow word: Pain (`shadowWordPain`) | Planned, 10 | `lifeDrain` | Planned: a new periodic shadow effect deals damage using an explicit supported damage type and refresh policy; no undocumented shadow resistance is assumed. Integration: runtime, combat. |
| Mind flay (`mindFlay`) | Planned, 18 | `lifeDrain` | Planned: a new channel deals periodic damage and slows while channeled. Movement, interruption, death, and line-of-sight loss stop later ticks. Integration: runtime, combat, movement. |
| Devouring plague (`devouringPlague`) | Planned, 42 | `shadowWordPain`, `spellPlague` | Planned: spend a capped resource earned from your own periodic damage on a draining effect. The spender’s ticks cannot build its own resource. Integration: runtime, combat, events. |
| Vampiric embrace (`vampiricEmbrace`) | Planned, 34 | `lifeDrain` | Planned: a bounded fraction of your actual direct spell damage heals nearby allies during a short window. Leech and copied healing cannot recurse. Integration: runtime, combat, healing, events. |
| Dispersion (`dispersion`) | Planned, 42 | `fear` | Planned: a defensive channel reduces incoming damage and restores mana while preventing offensive actions; cancellation ends both effects. Integration: runtime, combat. |
| Void ascendance (`voidAscendance`) | Planned, 82 | `devouringPlague`, `dispersion` | Planned capstone: consume the periodic-damage resource for a brief damage window that drains your health. It cannot spend the final health point or bypass healing restrictions. Integration: runtime, combat, healing, events. |

## Existing abilities reserved for expansion

The class trees retain access for current owners of every existing ability. New purchases of the following catalogue abilities are reserved for future class or profession work; their existence does not add another starting class in this release. Their legacy runtime IDs, effects, item requirements, and saved ranks remain valid.

| Expansion | Existing ability IDs | Proposed extension and implementation boundary |
| --- | --- | --- |
| Necromancer or a separately chosen summoning discipline | `raiseSkeleton`, `summonImp`, `corpseExplosion`, `summonHound`, `lichForm`, `raiseChampion` | Keep the actual corpse, temporary summon, and Lich Form effects. Future Bone, Decay, and Dread trees should define corpse competition, ownership, summon limits, pet AI, health costs, and healing immunity. Do not turn Priest Shadow into an undocumented permanent-pet class. |
| Bard | `provoke`, `peace`, `discord`, `marchingSong`, `warDrum`, `lullaby` | Future Discord, Harmony, and Inspiration trees should retain instrument requirements and distinguish enemy control, party positioning, and musical upkeep. An aura or channel needs real target membership and cancellation rules. |
| Shared fieldcraft | `camp` | Keep the current shared utility purchase outside the three combat specializations. Future camping improvements need actual rested, logout, cost, and party-membership consumers. |

The reserved combat IDs counted from the catalogue are: `raiseSkeleton`, `summonImp`, `corpseExplosion`, `summonHound`, `lichForm`, `raiseChampion`, `provoke`, `peace`, `discord`, `marchingSong`, `warDrum`, `lullaby`. Shared basics are `jump`, `sprint`, `bandage`, `meditate`, and `recall`; they are not specialization purchases.

## Verification of this design artifact

A Node assertion pass checked the authored data for six classes, three branches per class, 12 nodes per branch, valid existing ability references, unique stable IDs, unique row/column positions within each branch, no duplicate ability within a class, same-specialization prerequisites, live-only prerequisites for existing abilities, and acyclic dependencies. A second pass checks planned levels against prerequisites and confirms all six class starter sets appear as live nodes. These are catalogue checks. They do not establish that the proposed mechanics work or replace integrated gameplay, browser, save-migration, and build checks.
