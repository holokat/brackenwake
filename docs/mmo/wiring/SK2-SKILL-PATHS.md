# SK2 wiring: every skill has a path from zero, and the missing requirement is red

The user's line, verbatim:

> we need to print missing or show in red on spell description. then how do we
> gain mysticism? all skills should be gainable without purchasing.

Two questions, and the second is the larger one. The answer to "how do we gain
mysticism" was that you could not. The lowest Mysticism row asked for Mysticism
20, `canUse` refuses a row you do not meet, and a refused attempt teaches
nothing, so the only door into the school was Ellara's trainer window and a
purse of gold. Sixteen skills were in that state. Four of them were not even
gated: their lesson was written and the line that would have reached it never
ran.

Files changed: `src/mmo/abilities.js`, `src/mmo/combat_rules.js`,
`src/mmo/recipes.js`, `src/mmo/skill_paths.js` (new),
`src/mmo/skill_paths.test.mjs` (new), `src/game/abilities_runtime.js`,
`src/game/win_abilities.js`, `src/game/win_skills.js`,
`src/game/win_crafting.js`, `scripts/audit-abilities.mjs`, and the tests
belonging to each. `hud.js`, `item_bar.js`, `interact.js`,
`app/systems/ui.js`, `editor/*`, `world/*`, `world_runtime.js`, `win_dev.js`
and `vite.config.js` were read and not touched.

---

## 1. The table: what a character at zero does to start each skill

Printed by `node src/mmo/skill_paths.test.mjs`, derived from the real tables
every time it runs. Nothing in it is a list of ids somebody typed.

| skill | kind | what you do |
| --- | --- | --- |
| Swordsmanship | fight | swing a weapon of that skill at anything |
| Macefighting | fight | swing a weapon of that skill at anything |
| Fencing | fight | swing a weapon of that skill at anything |
| Wrestling | fight | fight with your fists |
| Polearms | fight | swing a weapon of that skill at anything |
| Tactics | fight | swing a weapon of that skill at anything |
| Anatomy | fight | swing a weapon of that skill at anything |
| Parrying | fight | take a swing with a shield on your arm |
| Archery | fight | swing a bow at anything |
| Marksmanship | fight | swing a crossbow at anything |
| Tracking | ability | press Hunter's Mark, which lands 5 times in 100 at this skill and teaches either way |
| Magery | ability | press Magic Arrow |
| Evaluating Intelligence | fight | cast a spell that deals damage |
| Meditation | ability | press Meditate |
| Resisting Spells | fight | stand in front of a spell |
| Necromancy | ability | press Life Drain, which lands 5 times in 100 at this skill and teaches either way |
| Spirit Speak | ability | press Curse of Weakness, which lands 5 times in 100 at this skill and teaches either way |
| Chivalry | ability | press Heal, which lands 5 times in 100 at this skill and teaches either way |
| Mysticism | ability | press Hex, which lands 5 times in 100 at this skill and teaches either way |
| Inscription | craft | make Scroll of Magic Arrow at a inscriptionDesk, 38 in 100, and a failure teaches too |
| Healing | ability | press Bandage |
| Veterinary | world | bandage a pet |
| Poisoning | ability | press Poison Blade, which lands 5 times in 100 at this skill and teaches either way |
| Musicianship | ability | press Marching Song, which lands 5 times in 100 at this skill and teaches either way |
| Provocation | ability | press Provoke, which lands 5 times in 100 at this skill and teaches either way |
| Peacemaking | ability | press Peace, which lands 5 times in 100 at this skill and teaches either way |
| Discordance | ability | press Discord, which lands 5 times in 100 at this skill and teaches either way |
| Mining | world | swing a pickaxe at a vein |
| Lumberjacking | world | swing an axe at a tree |
| Foraging | world | pick the plants you walk past |
| Fishing | none | no rod, no fishing spot and no catch anywhere in src; the skill is a row in the table and nothing else |
| Skinning | world | skin what you kill |
| Blacksmithing | craft | make Copper Dagger at a forge, 45 in 100, and a failure teaches too |
| Tailoring | craft | make Cloth sash at a loom, 48 in 100, and a failure teaches too |
| Carpentry | craft | make Oak Quarterstaff at a workbench, 44 in 100, and a failure teaches too |
| Tinkering | craft | make Sewing kit at a loom, 30 in 100, and a failure teaches too |
| Alchemy | craft | make Potion of stamina at a alchemyTable, 42 in 100, and a failure teaches too |
| Cooking | craft | make Herb salad at a kitchen, 47 in 100, and a failure teaches too |
| Fletching | craft | make Oak Arrows at a workbench, 46 in 100, and a failure teaches too |
| Masonry | none | no recipe in recipes.js has skill masonry, and no stone bench exists to put one on |
| Stealth | world | Hide, then walk |
| Hiding | ability | press Hide |
| Lockpicking | world | pick a chest |
| Detect Hidden | none | nothing in the world is hidden from the player: monsters do not hide and traps are found by opening the chest |
| Stealing | ability | press Pick Pocket, which lands 5 times in 100 at this skill and teaches either way |
| Remove Trap | world | disarm a chest |
| Animal Taming | none | monsters.js marks rows tamable and nothing tames them. Brannoc SELLS this skill to 40, so it is the one skill in the game that can be bought and cannot be practised |
| Animal Lore | ability | press Beast Call, which lands 5 times in 100 at this skill and teaches either way |
| Herding | none | no animal in the world can be moved without fighting it |
| Camping | ability | press Camp, which lands 5 times in 100 at this skill and teaches either way |
| Swimming | none | the player never enters water; player.js has no swimming state at all |
| Focus | world | be hit while casting |

`fight` rows are measured, not declared: `fightPaths` runs the real
`resolveMelee` and `resolveSpell` against a fighter with nothing and reads the
lessons that fall out. `ability` and `craft` rows are read out of the real gate
and the real craft chance against `win_crafting.js`'s own floor. `world` rows
name a `progression.lesson` call in a game file that node cannot import, and
the test opens the file and fails if the call has gone.

46 of the 52 skills can be started by doing something. Six cannot, and they are
listed as `UNBUILT` with the reason, because they are systems the game does not
have rather than gates set too high.

---

## 2. The gates that changed

`minSkill` still means what it always meant: the mark the row is written for,
the lesson's difficulty, and the point at which it stops fumbling. A new field
`openAt` says where the row APPEARS, and defaults to `minSkill`, so every row
not listed below behaves exactly as it did.

| row | skill | was | opens at | still meant for |
| --- | --- | --- | --- | --- |
| Hex | Mysticism | 20 | 0 | 20 |
| Life Drain | Necromancy | 20 | 0 | 20 |
| Curse of Weakness | Spirit Speak | 50 | 0 | 50 |
| Heal | Chivalry | 20 | 0 | 20 |
| Camp | Camping | 20 | 0 | 20 |
| Provoke | Provocation | 20 | 0 | 20 |
| Peace | Peacemaking | 20 | 0 | 20 |
| Discord | Discordance | 20 | 0 | 20 |
| Marching Song | Musicianship | 40 | 0 | 40 |
| Hunter's Mark | Tracking | 40 | 0 | 40 |
| Poison Blade | Poisoning | 30 | 0 | 30 |
| Pick Pocket | Stealing | 30 | 0 | 30 |
| Beast Call | Animal Lore | 50 | 0 | 50 |

Nothing else in the table moved. No row's `minSkill`, cost, cooldown, cast time
or effect changed.

**A row held below its mark is not a gift.** `practiceChance(ability, skills)`
is `0.05` at `openAt`, `1` at `minSkill`, and a straight line between. Below
the mark the attempt costs, comes apart, and says so, and it teaches at the
reduced chance `skills.js` gives a failed lesson. That is the only reason it is
allowed to happen.

Measured through the real runtime (`abilities_runtime.test.mjs`): 200 presses
of Hex by a Mysticism 0 character, 18 of the first 20 fizzled and 0 of the last
20 did, all 200 taught Mysticism, and the skill finished at 36.8.

---

## 3. Four skills whose lesson existed and was unreachable

**Parrying.** `resolveMelee` pushed the Parrying lesson only when
`parryChance > 0`, and `parryChance` is `Parrying * 0.004 * factor`, which is
zero at Parrying 0. A recruit with a shield could stand in a blizzard of blows
and learn nothing. The condition is now `canParry(defender)`, which is "is
there a shield on that arm", and the lesson still SUCCEEDS only on a real
parry, so it teaches at a failure's chance until one lands. Driven both ways in
`skill_paths.test.mjs`: with a shield, one lesson; without, none.

**Evaluating Intelligence.** `combat_rules.js` read `skill(caster, 'evalInt')`
in two places, for the spell damage bonus and for the lesson. `evalInt` is not
a skill id in `skills.js` and never has been, so the bonus was always zero and
the lesson always went to a skill nothing owns. Both now read
`evaluatingIntelligence`. This also turns the skill's documented effect on:
spell damage now actually scales with it.

**Stealth.** Walking while hidden was one line: `!num(skills.stealth)`. At
Stealth 0 you were seen the instant you moved; at Stealth 0.3 you were never
seen, at any speed, for ever. A binary on a hundred point skill, and no lesson
either way. It is a roll every second of movement now,
`stealthHoldChance(skill)` from 0.05 to 0.95, and every roll teaches. Measured:
60 steps at Stealth 0 gave the player away 56 times and took the skill to 7.5.

**Focus.** `interruptChance(focus)` is the only rule in the game that reads
Focus, and nothing taught it. A blow that rolls against a cast is a Focus
lesson now, at the cast's own difficulty: a cast held is a success, a cast
broken is a failure, and both teach. Measured: at Focus 0 the chance is 1, so
all 40 blows broke the cast and all 40 taught; at Focus 100, 17 of 20 were
held.

**Veterinary** had no path of any kind: no ability names it, no recipe uses it,
and Brannoc sold it. "The same, for animals and summons" is the table's own
description of the skill, so a bandage laid on a pet teaches Veterinary instead
of Healing. One line in `teach`, one predicate `isPet`.

---

## 4. The lute, which was a closed circle

Musicianship, Provocation, Peacemaking and Discordance are played on an
instrument or not at all. The only lute in the game was the one the bard
opening starts holding: no shop sells one, no recipe made one, and `loot.js`
drops one only to a character who already has Musicianship in his top three. So
opening the four bard rows at 0 would have handed every character four cards he
could never press.

A lute is a carpenter's job at the same bench as a bow. Four recipes,
`instrument.lute.<wood>`, difficulty 10 at oak, 40 in 100 at Carpentry 0. The
family `instrument` gets a chip label and the lute glyph in `win_crafting.js`.

The guard in `abilities_runtime.test.mjs` that says "no opening starts unable
to use an ability its own kit unlocked" now skips rows held open below their
mark, because a row nobody earned is not a promise the kit made, and a new pair
of checks proves those four refuse in words that name the lute and that a lute
can be made.

---

## 5. The missing requirement, in red

There were two sentences about a gate and they did not know about each other.
`meetsRequirements` wrote the runtime's refusal, "Hex needs Mysticism 20", with
no idea what the player's Mysticism was. `win_abilities.js` wrote the card's
line, "unlocks at Mysticism 20, you are at 0", and the runtime never said it.
The refusal is what you hear when you press the key.

`abilities.js` now owns both. `requirementClauses` returns one entry per clause
with `{ label, need, have, met, stat, branch }`; `requirementSentence` joins
them into "Needs Mysticism 20, you are at 0"; `requirementRefusal` puts the
ability's name on the front, which is what `meetsRequirements` returns.

- **The card** draws the sentence above the description, which is the order
  the player asked for, and as spans, one per clause. An unmet clause
  takes `theme.down`, the red every panel already uses for a number going the
  wrong way; a met clause and the joining words stay the ordinary colour. So
  "Needs Swordsmanship 60 and STR 50, you are at 20" paints only the STR half.
- **A row you may hold and have not earned** gets a second line under it: "You
  are below the mark for this: 5 in 100 land, the rest fumble and teach. It
  comes good at Mysticism 20."
- **The bar cell** carries the same sentence in `unusableReason`, which
  `hud.js` already appends to the tooltip, and greys the cell when the gate is
  shut. A practising cell is not greyed and carries the practice line instead.
- **The key press** answers with `meetsRequirements`' reason, which is the
  card's line with the name on the front.

Two clauses of an `anyOf` row are both shown, joined with ", or", because
"Healing 80 and Anatomy 80, or Chivalry 85" is two doors and showing one of
them sends a paladin down the physician's road. The card used to show only the
branch you were closest to.

---

## 6. The audit

`scripts/audit-abilities.mjs` marked a locked passive SILENT: Riposte wants
Parrying 70 and a Mage has none, `applyPassives` correctly left it off, and the
row was failed for behaving properly. A passive whose gate is shut is `refused`
now, with the gate's own sentence; a passive whose gate is MET and which still
did not switch on is still SILENT, which is the real fault.

The audit also compares, for every gated row, the words the runtime said
against the card's own line, and exits 1 on a mismatch.

Four runs, all exit 0, no SILENT rows in any of them:

| run | result |
| --- | --- |
| no flag (grandmaster) | 78 abilities: 72 ok, 4 passive, 2 cost only. 0 gated |
| `--as=mage` | 54 refused, 12 cost only, 12 ok. 54 gated, all matching the card |
| `--as=warrior` | 11 ok, 55 refused, 12 cost only. 55 gated, all matching |
| `--as=healer` | 58 refused, 11 cost only, 9 ok. 58 gated, all matching |

---

## 7. What is still not gainable, and one of them can be bought

Six skills have no path from zero, and `UNBUILT` in `skill_paths.js` says why.
`auditSkillPaths` throws when a skill is in neither list AND when an UNBUILT
skill grows a path, so the list can only get shorter.

- **Fishing.** No rod, no fishing spot and no catch anywhere in `src`.
- **Masonry.** No recipe has skill `masonry` and no stone bench exists.
- **Detect Hidden.** Nothing in the world hides from the player.
- **Herding.** No animal can be moved without fighting it.
- **Swimming.** The player never enters water; `player.js` has no swimming
  state.
- **Animal Taming.** `monsters.js` marks rows tamable and nothing tames them.

Five of those six cannot be bought either, so they break no rule; they are
simply unimplemented. **Animal Taming is the exception and it is a real
violation of the user's line.** Brannoc teaches it to 40 for gold, and no hand
in the game can practise it. `skill_paths.test.mjs` asserts that it is the ONLY
skill in that state, so the day taming is built the assertion fails and this
paragraph gets deleted.

---

## 8. What was measured, and what was not

Measured:

- 200 Hex presses at Mysticism 0 through the real runtime: 18 of the first 20
  fizzled, 0 of the last 20, 200 lessons, skill 0 to 36.8.
- 50 Hex presses at Mysticism 20: 0 fizzles.
- 60 hidden steps at Stealth 0: 56 gave the player away, 60 lessons, skill to
  7.5. Standing still produced no roll at all.
- 40 blows against a cast at Focus 0: 40 broke, 40 taught, all failures. 20 at
  Focus 100: 17 held, and a hold teaches as a success.
- Parrying with a shield at Parrying 0: one lesson, marked a failure. Without a
  shield: none.
- Every world path: the named file opened and the call found.
- Four audit runs, exit code 0 each.
- Every test in `src` and `scripts`, and `npx vite build`.

Not measured:

- Nothing was driven in a browser. The card's red span is asserted through the
  fake DOM in `win_abilities.test.mjs` (the `bw-miss` class is on the missing
  clause and not on the word "Needs"), and the CSS that paints it is
  `theme.down`, read but not seen.
- The bar tooltip's text is asserted out of `barView`. `hud.js` was not edited
  and its rendering of that string was read, not run.
- Nobody has played a character from 0 to 100 in any of these skills, so the
  PACE of the practice curve is arithmetic and one 200 press sample, not
  playtesting.
- The lute recipe was checked through `craft`'s chance and the audit; no lute
  has been made at a workbench in a running game.
