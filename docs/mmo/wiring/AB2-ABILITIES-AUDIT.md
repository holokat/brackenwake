# AB2: every ability, pressed, and what actually moved

The complaint, in the user's words:

> lets implement the missing magery spells, we have a lot of them that dont
> seem to do anything. also lets implement healing / bandages, healing skill
> doesnt seem to do anything and just shows 1. bandages say they are not
> implemented. Most magery skills dont seem to work. also, when a new ability
> is unlocked due to skill unlock, lets show it in a big you've unlocked banner
> and show the ability name and image on the screen so player knows its there.

Four complaints, and underneath them one class of bug: a value was written and
nothing read it. This document is the audit that found them, the count before
and after, and what each fix was.

## The harness

`scripts/audit-abilities.mjs` presses all 78 rows of `src/mmo/abilities.js`
through the real `createAbilities`, with a real player actor and real monsters
out of `src/game/actor.js`, the real resolver out of `src/game/combat.js`, the
real progression out of `src/game/progression.js` and the real hooks out of
`src/game/ability_hooks.js`, which is the same module `app/systems/abilities.js`
passes in. For each row it dresses the character for whatever `weaponNeeds`
says the row wants, sets the pools, puts a man, a beast, an undead and a corpse
in front of it, presses the bar slot, answers the cursor if the spell asks for a
target, steps the clock for ten seconds and records what moved.

Five verdicts:

| verdict | meaning |
| --- | --- |
| `ok` | it changed the world, and said so |
| `COST ONLY` | only the mana or the stamina moved, and the words say why nothing else did |
| `refused` | nothing changed at all, and it said exactly why |
| `passive` | never pressed; `applyPassives` carries it, and the refusal names it as always on |
| `SILENT` / `UNWIRED` | it changed nothing and gave no reason a player could act on. A failure; the script exits 1 |

What it is NOT: `createMonsters` owns a THREE scene and a world field and cannot
run in node, so the monster CONTAINER is a stand-in over real `spawnMonster`
actors. Everything inside those actors, and every rule that reads them, is the
shipped code. A summon's WALKING is `stepMonster`'s and is therefore not driven
here; its target choice, its swings, its damage, its expiry and its dismissal
all are.

## The count

| | before | after |
| --- | --- | --- |
| ok | 54 | 72 |
| passive | 4 | 4 |
| cost only | 10 | 2 |
| refused | 1 | 0 |
| **UNWIRED (a failure)** | **9** | **0** |
| exit code | 1 | 0 |

The nine that took a cost and said "that is not wired yet": Beast Call,
Transmute, Raise Skeleton, Summon Imp, Summon Hound, Raise Champion, Resurrect,
Pick Pocket, Camp.

The two that are still `COST ONLY` are both correct refusals with the words to
match: Cleanse on somebody with nothing on them ("There was nothing on them to
lift"), and Resurrect on a caster who is standing up ("You are on your feet
already, so there is nothing to raise"). Both spend their mana before they find
that out, which is the runtime's order of operations and not a wiring gap.

### Honest accounting of the two runs

The before table was produced by the same script with the four hook arguments
deleted, which is exactly what `app/systems/abilities.js` passed at the time.
Between the two runs the HARNESS also improved, and three of the column
movements are the harness and not a fix:

- `leapSlam`, `disengage`, `jump`: the before run never let the player land, so
  `onLanded` never fired and the second half of a leap never ran. The harness
  now steps the jump with `player.js`'s own GRAVITY.
- `evasion`, `rift`, `sanctuary`: four and six second effects that had come and
  gone by the time the before run read the world once at ten seconds. The
  harness now unions the diff as it goes.
- `fear`, `pickPocket`, `beastCall`: the before run's field was two undead. Fear
  does not touch the undead, Pick Pocket wants a humanoid and Beast Call wants
  something wild, so all three were measuring a refusal rather than an ability.
  There is now a man, a beast and an undead in front of the caster.

Everything else in the table moved because something was fixed.

## What was broken, and what each fix was

### 1. The four hooks were never passed

`abilities_runtime.createAbilities` asks for `summon(id, pos, meta)`,
`allies()`, `resurrect(actor)` and `utility { transmute, steal, meditate, camp }`,
and each degrades to a spoken "that is not wired yet" when it is missing.
`app/systems/abilities.js` passed none of them. Nine abilities therefore took
their cost and said nothing had happened.

`src/game/ability_hooks.js` is the wire. It is node safe, it takes the monsters
container, the resolver, the pack and the rig as dependencies, and both the game
and the audit build it out of the same call, so the harness cannot measure a
kinder version of the game than the one being played.

**Summons.** `SUMMON_CREATURES` maps the ability table's five creature names
onto the roster. Two of them were never monsters at all: `imp` is the roster's
Cinder Imp and `shadowHound` is its Bone Hound, and a wire that passed the name
straight to the spawner would have raised nothing for two of the six summons.
`auditSummonCreatures()` runs at import and fails the build in both directions.

A summon goes through `monsters.spawnAlly`, which is `spawnAt` with a friendly
flag: the same spawner, the same model, the same actor. `monsters.js` then keeps
it out of `actors()`, `targets()` and `nearestHostile()`, refuses to let
`stepMonster` acquire the player or an ally with it, gates `onPlayer` on the flag
so it can never swing at its caster or cast at him, skips `alertGroup` so raising
one body does not start fights with the roster, and drops no loot when it dies.
`ability_hooks.stepSummons` gives it a target every frame (its own quarry, then
what you are fighting, then the nearest hostile within 16 m), moves `ai.home` to
the caster so `stepMonster` heels it when there is nothing to do, and asks
`monsters.swingAt` for the blow, which is the same call the player's own swings
go through: same swing timer, same reach test, same stun.

What a summon CAN do: walk to what it is told to fight (through `stepMonster`,
in the game), swing at it on its own weapon timer, take damage, die, expire, be
dismissed when a fourth is called, and count as an ally for a buff with a radius.

What a summon CANNOT do: choose its own fight (it only ever takes the target the
hook gives it), use the special abilities its roster row carries against
anything the hook did not point it at, be healed by you, be targeted by you, or
be resurrected by anything but Resurrect. Beast Call's borrowed animal keeps its
own roster row and simply changes sides for half a minute.

**Allies** is the caster, every friendly body in `monsters.friendlies()`, and the
dragon when it is awake.

**Resurrect** goes to the player system's own `wake()` while the death count is
running, puts a fallen ally back on its feet at half health, and refuses in words
for anything that never went down. There is one player, so those are the only
bodies it can reach; a dead monster is a corpse and belongs to Raise Skeleton.

**Meditate** adds the EXTRA mana only, because `tickPools` is already paying the
ordinary regeneration every frame and adding the whole multiple would have paid
it four times. It breaks on moving, on a blow, and at full mana, and says which.

**Camp** restores health and stamina while you sit, refuses in a fight, and lays
a Rested buff whose bonus is a `regen` block, which is a shape `applyEffect` has
read since W1, rather than a `mods` block, which has no row for a regeneration
key and would have been dropped on the floor.

**Transmute** takes the biggest ore stack in the pack, loses three tenths, and
puts the next rung of `ores.js` back through the real `inventory`. It refuses at
the top of the ladder, with no ore, and when the stack is too small to lose three
tenths of and leave anything, and it puts the ore back if the new stack will not
fit.

**Pick Pocket** rolls Stealing against the target's tier, takes gold or a common
item off a humanoid that has not noticed you, turns it on you when the hand is
felt, quotes the odds either way, and marks the pocket so it cannot be picked
twice.

### 2. Bandage was unusable from both roads at once

Two separate faults, and each hid the other.

`canUse`'s item cost read `character.items[cost.item]`, a plain COUNT MAP THAT
EXISTS ONLY IN THE TEST FIXTURES. No save has ever carried the field, so `have`
was always zero and Bandage, Camp and Poison Blade were refused for want of
bandages the player had ten of. `itemsHeld` now reads the pack as well as the
map, and `COST_ITEM_BASES` says what actually pays each of the three costs,
because two of them named something that is not an item: Camp costs "wood" and
there is no `wood` base (there are fourteen logs), Poison Blade costs "poison"
and there is no vial (there is `woodland_poison`). `abilities.test.mjs` walks
that table against `items.js` in both directions.

The other road: the bag's Use and the item bar's key both went to
`foraging.useItem`, which reads an item's own `use` block, and the bandage base
has none, so it answered "nothing has been written yet that uses bandage".
`ABILITY_FOR_ITEM` now routes an item whose use IS an ability to that ability,
so both roads end in the same `doBandage`: the same four second cast, the same
`Healing * 0.4 + Anatomy * 0.2`, the same lesson in Healing, the same one bandage
out of the pack. Measured in `abilities_runtime.test.mjs`: 60 health by the bar
and 60 by the item, one bandage gone by either.

And the "1" on the bar cell is the ability's COST, which is what `costLabel`
prints. The tooltip now also says how many you are carrying, so the 1 has
something to mean.

### 3. Magery: four separate reasons a spell did nothing

**The cursor.** A spell with nothing in the 120 degree cone in front of the
caster parked itself on the cursor waiting for a click most players never learned
they had to make, and let go six seconds later. A wolf chewing your left elbow is
not in front of you and is certainly what the Fireball was for, so `useById` now
asks one more question before it holds: is there anything hostile at all within
this ability's reach, in any direction. If there is, that is who you meant, and
it is said out loud so the choice is never made behind your back. A hostile 21 m
away with a 20 m spell is still not taken, and the spell still waits.

**The ground.** A ground ability with no cursor hit dropped its circle a flat
eight metres in front of the caster, so a Volley aimed at a wolf two metres away
rained arrows six metres past it and reported "Volley finds nothing inside 5 m".
`groundPoint` now falls on what you are fighting when there is no cursor.

**Fear frightened nobody, ever.** The row carries `affects: ['beast', 'humanoid']`
and `doControl` tested `m.kind`. `actor.js` puts the roster's kind in `family`
and writes the literal string `'monster'` into `kind` for every body in the game,
so the set never matched anything. It reads `family` first now, and says what it
does not touch when it touches nothing.

**Sprint lasted zero seconds.** `duration: null, channelled: true` went through
`now + num(null)`, which is `now`, so the buff expired on the next frame and the
log read "Sprint. +100% sprinting for 0 seconds. Sprint runs out." A held buff
now runs until it is let go.

### 4. Every buff and every passive in the table was decoration

The largest find, and it was not in the request. `applyEffect` in `actor.js`
reads `stats`, `skills`, `bonuses`, `resists`, `ar`, `pool` and `regen` off a
buff, and NOT `mods`, which is the only field the ability table writes.
`actor.passives`, written by `applyPassives` on create, on every skill gain and
on every equip change, was read by nothing at all.

So Berserk's forty percent, Battle Cry's fifth, Hex's fifteen points, Curse of
Weakness, Stone Skin's thirty armour, War Drum, Marching Song, Discord, Evasion,
Ward, Lich Form, Elemental Kin, Fleet Foot, Arcane Mastery and Riposte were all
written into `actor.buffs`, drawn on the HUD with a countdown, and worth nothing.
Twenty two keys.

`ABILITY_MODS` in `actor.js` is the table, `ABILITY_MOD_NOTES` says per key what
reads it, and `auditAbilityMods()` runs at import and fails the build if the
ability table grows a twenty third key with no row. The units are the awkward
part and are written down: the ability table is in FRACTIONS, `bonuses.damagePct`
is in percent points, `bonuses.hit` is in skill points at two per percent point
of the roll, `swingSpeed` and `dodge` are already fractions, resists are percent
points.

Three multipliers had no shape in the accumulator and now do: `arMult` (Berserk's
"a third of your armour forgotten"), `statMult` and `skillMult` (Discord's "a
fifth off everything it knows"). Three bonus keys were added and each has exactly
one reader: `spellCrit` in `combat_rules.spellCritChance`, `necromancyDamage` in
`abilities_runtime.spellFor`, and `parryCounter` in `combat.landSwing`, which is
Riposte answering a parry with one immediate swing back at half damage.

One of the twenty two is still read by nothing and is counted rather than
assumed: `runSpeed`. It is summed into `actor.bonuses.runSpeed`, which
`src/game/player.js` does not read; that file belongs to another agent. The Run
Speed AFFIX on gear has been unread for the same reason, so one line there turns
both on at once. `unwiredAbilityMods()` returns the list and `actor.test.mjs`
asserts its length.

Two more were fixed while the table was being built: Ward's and Sanctuary's
`applies` block was written into the zone record and run by nothing, so both were
a ring on the ground and no more. A trap fires once on the first body through it;
these two are the opposite, so the buff is laid on everybody inside on every
frame and refreshed rather than stacked, and runs out `ZONE_LINGER` after you
step out. And `inArea` now skips anything that is not hostile, so a Whirlwind
does not cut down the champion you paid sixty mana for.

### 5. Nothing told the player about a new ability

An ability became available the moment `meetsRequirements` started saying yes,
and the only way to find out was to open a window and look.

`progression.js` now asks the same question on every skill gain and every stat
gain (four rows gate on a stat: Leap Slam, Berserk, Disengage, Evasion, so
watching skills alone would have missed them), and anything new gets
`hud.unlock`: the ability's own painting from `icon_art` at 116 px in a gold
frame, "You've unlocked" over it, the name under it and the line that says how to
reach it, held 4.2 seconds. Two crossed at once QUEUE, one after the other, in
table order.

It is driven from the gain and not from a poll, because there is one place in the
game where a skill moves and one where a stat does. `character.unlockedAbilities`
is the record, declared in `state.blankCharacter` and written into the save, so a
reload does not replay a week of banners; the first time a document is seen the
list is seeded SILENTLY, because an opening that grants Magery 50 did not just
unlock eight spells.

MISSING AND EMPTY BOTH MEAN "NEVER SEEDED", and the second half of that is not a
convenience. A brand new document arrives with `[]`, and an empty list is never a
true statement about any character: Jump and Sprint gate on no skill at all, so
every character that has ever existed meets at least two. Believing an empty list
played the entire starting kit as banners on the first swing of a new character's
life, which is how the rule was found; both halves are driven in
`progression.test.mjs`.

And `onUnlock` re-runs `applyPassives`, because an unlock may BE a passive.

## Files changed

| file | what |
| --- | --- |
| `scripts/audit-abilities.mjs` | new. The harness, the table, exit 1 on a silent row |
| `src/game/ability_hooks.js` | new. The four hooks, the summon table and its audit |
| `src/game/ability_hooks.test.mjs` | new. 67 checks over the hooks |
| `src/game/app/systems/abilities.js` | builds the hooks and passes them; `spendFromPack`; drives the summons on the world clock |
| `src/game/app/systems/ui.js` | an item whose use is an ability goes to that ability |
| `src/game/app/systems/player.js` | `onUnlock` re-reads the passives |
| `src/game/abilities_runtime.js` | the target fallback, the ground point, Fear's family, the held buff, item costs out of the pack, the ward and sanctuary zones, the necromancy scaling, cannot-be-healed |
| `src/game/actor.js` | ABILITY_MODS, its notes and its audit; `applyMods`; the three multipliers; passives read |
| `src/game/monsters.js` | `spawnAlly`, `makeAlly`, `releaseAlly`, `friendlies()`, the friendly gates |
| `src/game/combat.js` | Riposte's counter |
| `src/game/hud.js` | the unlock banner and the carried count in the tooltip |
| `src/game/progression.js` | `unlockedIds`, `unlockHint`, `announceUnlocks` |
| `src/game/targeting.js` | `untargetable` |
| `src/mmo/abilities.js` | `COST_ITEM_BASES`, `itemsHeld`, `payingBases`, `ABILITY_FOR_ITEM`, the item cost read off the pack |
| `src/mmo/combat_rules.js` | `spellCrit` into the spell crit chance |
| `src/game/state.js` | `unlockedAbilities` declared on the document |

Tests: `ability_hooks.test.mjs` (new, 67), `abilities_runtime.test.mjs` (266),
`abilities.test.mjs` (194), `progression.test.mjs` (98), `hud.test.mjs` (192),
`actor.test.mjs` (130), `combat.test.mjs` (67), `state.test.mjs` (278). Whole
suite green.

## What is not measured

- A summon's WALKING. `stepMonster` needs the THREE backed monsters runtime; the
  audit and the hooks test drive everything else about a summon.
- Anything on screen. The banner's timing, its queue, its art lookup and its
  text are driven against the test document in `hud.test.mjs`; how it LOOKS has
  not been seen by anybody.
- `mods.runSpeed`, named above, which lands in a bonus nothing reads.
- Evasion says "four seconds where nothing lands" and buys the resolver's dodge
  cap of 0.4 instead. The gap between the row's words and the cap is measured in
  `actor.test.mjs` rather than hidden.

## The table, row by row

| ability | group | before | after | what moves now |
| --- | --- | --- | --- | --- |
| powerStrike | warrior | ok | ok | monsters (dmg 38) |
| whirlwind | warrior | ok | ok | monsters (dmg 70) |
| leapSlam | warrior | COST ONLY | ok | airborne playerPos monsters (dmg 28) |
| shieldBash | warrior | ok | ok | monsters (dmg 12) |
| rend | warrior | ok | ok | monsters (dmg 17) |
| crushingBlow | warrior | ok | ok | monsters (dmg 19) |
| lunge | warrior | ok | ok | monsters (dmg 17) |
| sweep | warrior | ok | ok | monsters (dmg 135) |
| battleCry | warrior | ok | ok | Battle Cry. +20% damage for 12 seconds. (dmg playerBuffs) |
| berserk | warrior | ok | ok | Berserk. +40% damage, +40% swingSpeed, -30% armourRating for 15 seconds. (dmg playerBuffs) |
| disarm | warrior | ok | ok | Disarm. 1 disarmed for 6 seconds. (dmg monsters) |
| riposte | warrior | passive | passive | Riposte is always on and is not used |
| aimedShot | ranger | ok | ok | monsters (dmg 31) |
| doubleShot | ranger | ok | ok | monsters (dmg 30) |
| volley | ranger | COST ONLY | ok | monsters (dmg 58) |
| piercingArrow | ranger | ok | ok | monsters (dmg 18) |
| cripplingShot | ranger | ok | ok | monsters (dmg 22) |
| disengage | ranger | COST ONLY | ok | airborne playerPos playerBuffsDisengage. 1.2 m of air. The rest of it lands where you do. |
| fleetFoot | ranger | passive | passive | Fleet Foot is always on and is not used |
| huntersMark | ranger | ok | ok | Hunter's Mark. Bandit takes 15% more from you for 30 seconds. (dmg monsters) |
| snare | ranger | ok | ok | Snare: casting for 0.8 seconds, and moving ends it. (dmg monsters) |
| beastCall | ranger | UNWIRED | ok | monsters summons (dmg 33) |
| magicArrow | mage | ok | ok | monsters (dmg 16) |
| fireball | mage | ok | ok | monsters (dmg 36) |
| iceShard | mage | ok | ok | monsters (dmg 29) |
| lightning | mage | ok | ok | monsters (dmg 55) |
| blink | mage | ok | ok | Blink. 12.0 m, gone and back. (dmg playerPos) |
| manaShield | mage | ok | ok | Mana Shield. Damage comes off mana at 2:1 for 15 seconds. (dmg absorb) |
| frostNova | mage | ok | ok | monsters (dmg 146) |
| chainLightning | mage | ok | ok | monsters (dmg 148) |
| meteor | mage | ok | ok | monsters (dmg 170) |
| arcaneMastery | mage | passive | passive | Arcane Mastery is always on and is not used |
| hex | sorcerer | ok | ok | Hex. Bandit: -15% hitChance, -15% defence for 12 seconds. (dmg monsters) |
| stoneSkin | sorcerer | ok | ok | Stone Skin: casting for 0.5 seconds. (dmg playerBuffs) |
| eldritchBolt | sorcerer | ok | ok | monsters (dmg 25) |
| ward | sorcerer | ok | ok | playerBuffs zones |
| transmute | sorcerer | UNWIRED | ok | Transmute: casting for 1 second, and moving ends it. (dmg packSig) |
| spellPlague | sorcerer | ok | ok | monsters (dmg 45) |
| rift | sorcerer | COST ONLY | ok | monsters zones |
| elementalKin | sorcerer | passive | passive | Elemental Kin is always on and is not used |
| lifeDrain | necromancer | ok | ok | leech monsters (dmg 20) |
| raiseSkeleton | necromancer | UNWIRED | ok | monsters summons (dmg 32) |
| summonImp | necromancer | UNWIRED | ok | monsters summons (dmg 46) |
| boneSpear | necromancer | ok | ok | monsters (dmg 52) |
| fear | necromancer | COST ONLY | ok | Fear. 2 feared for 5 seconds. (dmg monsters) |
| corpseExplosion | necromancer | ok | ok | corpses monsters (dmg 170) |
| summonHound | necromancer | UNWIRED | ok | monsters summons (dmg 47) |
| curseOfWeakness | necromancer | ok | ok | Curse of Weakness. Bandit: -20% damage, -20% armourRating for 15 seconds. (dmg monsters) |
| lichForm | necromancer | ok | ok | playerBuffs form |
| raiseChampion | necromancer | UNWIRED | ok | monsters summons (dmg 66) |
| heal | healer | ok | ok | Heal: casting for 0.8 seconds. (dmg playerHealth) |
| cleanse | healer | COST ONLY | COST ONLY | Cleanse. There was nothing on them to lift. |
| greaterHeal | healer | ok | ok | Greater Heal: casting for 1.5 seconds, and moving ends it. (dmg playerHealth) |
| bless | healer | ok | ok | Bless: casting for 0.5 seconds. (dmg playerBuffs) |
| sanctuary | healer | COST ONLY | ok | playerBuffs zones |
| consecrateWeapon | healer | ok | ok | Consecrate Weapon. Your weapon runs holy for 20 seconds. (dmg enchant) |
| smite | healer | ok | ok | monsters (dmg 55) |
| resurrect | healer | UNWIRED | COST ONLY | Resurrect: casting for 5 seconds, and moving ends it. |
| layOnHands | healer | ok | ok | Lay on Hands. 140 health back. (dmg playerHealth) |
| hide | rogue | ok | ok | Hide: casting for 1 second, and moving ends it. (dmg hidden) |
| backstab | rogue | ok | ok | monsters (dmg 45) |
| poisonBlade | rogue | ok | ok | Poison Blade. Your weapon runs poison for 5 hits. (dmg enchant) |
| shadowstep | rogue | ok | ok | Shadowstep. 2.6 m, shadowstep. (dmg playerPos) |
| vanish | rogue | ok | ok | Vanish. Out of sight. (dmg hidden) |
| pickPocket | rogue | UNWIRED | ok | Pick Pocket: casting for 1 second, and moving ends it. (dmg gold) |
| evasion | rogue | COST ONLY | ok | Evasion. +dodgeAll for 4 seconds. (dmg playerBuffs) |
| exposeWeakness | rogue | ok | ok | Expose Weakness. Bandit takes 25% more from everyone for 10 seconds. (dmg monsters) |
| provoke | bard | ok | ok | Provoke: casting for 1 second, and moving ends it. (dmg monsters) |
| peace | bard | ok | ok | Peace: casting for 1 second, and moving ends it. (dmg monsters) |
| discord | bard | ok | ok | Discord: casting for 1 second, and moving ends it. (dmg monsters) |
| marchingSong | bard | ok | ok | Marching Song. +15% runSpeed for 30 seconds. (dmg playerBuffs) |
| warDrum | bard | ok | ok | War Drum. +10% damage, +10% swingSpeed for 20 seconds. (dmg playerBuffs) |
| lullaby | bard | ok | ok | Lullaby: casting for 2 seconds, and moving ends it. (dmg monsters) |
| jump | everyone | COST ONLY | ok | Jump. (dmg airborne) |
| sprint | everyone | COST ONLY | ok | Sprint. +sprinting for as long as you hold it. (dmg playerBuffs) |
| bandage | everyone | ok | ok | packSig playerHealth |
| meditate | everyone | refused | ok | Meditate. You sit. Mana comes back 3 times as fast, and anything at all ends it. (dmg meditating) |
| camp | everyone | UNWIRED | ok | playerHealth playerBuffs campiCamp. The fire catches. Health and stamina come back while you sit by it, and it is |
