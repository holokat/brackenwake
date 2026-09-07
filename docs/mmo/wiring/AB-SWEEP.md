# AB-SWEEP: every ability pressed in the running game

Written 2026-09-08 by Fable. The user: "can you test all the character
abilities in-game with computer vision. don't tell me you tested unless you
actually did. give yourself any weapon or skill level you need to test them
all. If any don't work, fix them."

## How

`scripts/ability-sweep.browser.js`, pasted into the game tab with the ranger
"rangertest" logged in on the Starting Island. For each of the 78 rows it gives
the character every skill and stat at 100, the weapon the row wants, ammo and
reagents, stands a bandit at range (or kills one with Lightning for a corpse
row), presses the row through the real `useById` and the real targeting, steps
the game through the cast and a settle, and records the runtime's answer,
every line said, the bandit's health, what was paid, buffs, summons, marks and
statuses. Ground rows are aimed by moving the real mouse over the bandit
(`__aimAt`), because the automation tab's cursor sits at (0,0) and a Rift
pressed with no aim lands 2.4 m behind you. Then a screenshot pass at the
release frame for the ones with something to see.

## What was measured

74 non-passive rows fired and did what their line said. 4 passives (Riposte,
Fleet Foot, Arcane Mastery, Elemental Kin) refused with "always on", which is
right. Seen in screenshots at release: Fireball's bolt, Frost Nova's ring and
root, Chain Lightning's jump to a second bandit, Meteor's ring and landing,
Whirlwind, Leap Slam, Volley's rain, Beast Call's summon (a Dire Wolf at
Animal Lore 100), Hunter's Mark's badge over the bandit and "Hunter's Mark
60 s" on its plate, Ward's dome, Rift's tear with its ticks.

Numbers from one run at skill 100 against an 83 health bandit: Power Strike
49, Whirlwind 37, Leap Slam 82, Shield Bash 15 and a 2 s stun, Rend 15 then 3 a
second, Crushing Blow 27 and a stun, Lunge 33, Sweep 32 and a 2 m knockback,
Aimed Shot 75, Piercing Arrow 29, Crippling Shot 24 and a slow, Volley 45,
Magic Arrow 22, Fireball 55 then 2 a second, Ice Shard 50 and a slow, Lightning
83, Frost Nova 55 and a 3 s root, Chain Lightning 83 and the jump, Meteor 83,
Eldritch Bolt 36 to 43, Spell Plague 60, Rift 40 over four ticks, Life Drain
29, Bone Spear 78, Smite 83, Backstab 46, Corpse Explosion 83 to the bandit
beside the corpse.

## Broken, and fixed

- **Damage over time never ticked.** `doDot` wrote `m.dots` and nothing read
  it. Fireball's "2 a second for 4 seconds", Rend's "3 a second for 8" and
  Rift's 10 a second were a line and no more. `tickDots` in the runtime's
  update now takes one tick a second through combat's `hurt` (a kill is
  credited, each tick is a floater). Measured: Rift 83 → 73 → 63 → 53 → 43 over
  four seconds, Fireball 28 → 26 → 24 → 22 → 20, Rend 68 → 65 → 62 → 59 → 56.
  Test: `abilities_runtime.test.mjs`, "a dot is damage, not a line".
- **Meteor's landing took the frame down.** combat.js's landing loop indexed
  `pending` after `kill()` had spliced it from inside `landSpell`, and read
  `undefined.at`. The loop now clamps its index when the queue shrinks under
  it. Test: `combat.test.mjs`, two spells due together with the first fatal.
- **"1 stuned", "1 silenceed", "1 pacifyed", "2 provokeed".** The control line
  built its verb as `${effect}ed`. `controlWord` has the participles, and the
  tests read "stunned", "pacified", "provoked".
- **"Poison Blade needs 1 poisonVial and you have 0."** The cost id was shown
  to the player. `COST_ITEM_WORDS` names each cost in the player's words
  ("Woodland poison", the potion foraging brews, which is what pays it), and
  `auditAbilities` refuses a cost id without an entry. Poison Blade itself
  works: "Your weapon runs poison for 5 hits."

## Seen and left, for the user to decide

- Ground rows land at the cursor when the cursor is on ground, even with a
  target chosen (`groundPoint`). Pressing Volley while pointing at the sky or
  the far side of the field rains it there. Probably why "Volley does not
  work" was reported. A rule such as "a chosen target wins unless the cursor
  is within the radius of something" is a design call.
- Leather fizzles sorcerer and necromancer spells at skill 100 (castBurden).
  Raise Champion and Spell Plague fizzled in the ranger's leather and worked
  naked. Intended by the armour rules; the copy says so.
- Buff and debuff lines print modifier keys: "-15% hitChance, -15% defence",
  "+spellsCostHealth, +30% necromancyDamage, +cannotBeHealed", "+dodgeAll",
  "armourRatingFlat". A words table for mods would fix the class.
- Raise Skeleton plays its green summoning circle before finding out there is
  no corpse within 6 m; the visual runs, the line says nothing was raised.
- Beast Call's Dire Wolf rendered as a placeholder box in the screenshot,
  although `monster_models.js` maps `direWolf` to the wolf model; the summon
  path is worth a look.
- Ward and Sanctuary said "the hatchling is inside your Ward" for a passing
  wild animal on the player's side.

## Suite

`npm test`: 138 suites passed; `roads.test.mjs` failed under load and passes
alone (39/39); `wayside.test.mjs` has one timing check that fails at the
baseline before this work.
