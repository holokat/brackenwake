# SK1 wiring: the skill sheet becomes a book, and the bar starts telling the truth

The user's line, verbatim:

> here is the art for the Skills section / tab. let's redesign skills to be
> larger like abilities, but keep the progress bar and style it really well to
> match the rest of the HUD.

Files owned and touched: `src/game/win_skills.js`, `src/game/win_skills.test.mjs`,
and this note. `win_abilities.js`, `icon_art.js`, `ui_theme.js`, `windows.js`,
`src/mmo/skills.js`, `src/mmo/abilities.js` and `src/game/progression.js` were
read and not edited. The key is still `k`, the panel id is still `skills`, and
it is still the codex's Skills tab.

---

## 1. What changed, in a paragraph each

**The sheet is a book now.** It was a table: a 20 px lock, a 190 px name, a thin
green bar, a number, and a grey sentence under it, fifty two times. Beside the
ability book, which is a grid of 112 px paintings, it read like a spreadsheet
that had wandered into an illuminated manuscript. It is built the same way as
the book now: a hint line, a filter row of ten chips (All and the nine groups),
a count line, and then the nine groups as headers with a grid of cards under
each. A card is the 112 px painting, the name in Cinzel beside the value at 23
px to one decimal, the lock glyph, the bar, the description from the table, the
row of abilities this skill gates, and the sentence about the next one.

**The bar is the thing this page has that the book does not, so it was drawn
rather than shrunk.** A dark trough with an inset shadow and a gold rule, a fill
in the same gold gradient the frame uses, a brighter 2 px cap at the fill's end
with a small glow, a faint tick every ten, and under the trough the six gain
bands as segments with the one you are standing in lit. That last mark is the
point. The gain step is 0.3 a success under 30 and 0.01 over 95, and a player
who cannot see where that changes cannot see why the last five points take a
week. The band segments are drawn from `BANDS` in `src/mmo/skills.js`, at the
band's own `min` and `max` as percentages, so a seventh band appears on every
bar the day someone adds one.

**The line beside the bar reads the value and the lock, not just the value.**
`31.4, gains 0.2 a success` is the ordinary case, and the step comes from
`gainStep`, not from a copy of the table. A locked skill reads
`31.4, locked and will not rise` and one marked down reads
`31.4, marked to fall and will not rise`, because `rollGain` refuses both and a
bar that promised a gain there would be a bar that lies. At 100 it reads
`100.0, grandmaster`.

**"Unlocks next" moved onto the card as a row of paintings.** Every ability this
skill has a hand in, cheapest first, at 24 px, each with a tooltip and a title.
What is yours is in full colour, the next one is lit with a gold ring and a
glow, the rest are grey and dimmed. Under the row: `Rend at 45`. Under that, in
italics and only when it says something the short line does not, the rules
layer's own refusal: the Tactics card reads `Whirlwind at 40` and then
`Whirlwind needs a weapon skill 50`, because Tactics 40 is only half of what
Whirlwind wants and a card that stopped at the first line would promise an
unlock `meetsRequirements` refuses.

**The lock kept every behaviour and gained a hit area.** It is a real `<button>`
at the top right corner of the card, in the same up, locked, down cycle through
`skills.setLock`, with the same three glyphs, the same three sentences on hover
and in the log, the same `ctx.onSkillLock(id, lock)` call, and the same refusal
path: a bad value comes back from `setLock` with a reason and the reason is said
as a `bad` line rather than swallowed. A held card dims, its fill desaturates,
its cap and its lit band go to parchment, and a card marked down turns its fill
and cap red.

**The art is the painted library**, `skillIcon(id)` from `icon_art.js`, at 112 px,
with a drawn mark per group as the fallback and the group's colour behind it as
a wash. `auditSkillArt()` runs at import and throws if a group has lost its
colour or its mark, if a colour or a mark exists for a group that is not one of
the nine, or if the filter row stops having a chip per group.

## 2. What is on a card, and where it comes from

| what | where it comes from |
| --- | --- |
| the painting | `icon_art.js` `skillIcon(skill.id)`, 112 px |
| the fallback mark | `SKILL_MARK[skill.group]`, this file, 24 x 24 |
| the wash behind it | `GROUP_COLOUR[skill.group]`, this file |
| the name | `SKILLS[].name` |
| the value | `character.skills[id]`, `toFixed(1)` |
| the fill width | `barView(v).pct`, the value over `SKILL_CAP` |
| the ticks | `TICKS`, ten to ninety |
| the band segments | `BANDS` in `src/mmo/skills.js` |
| the lit band | `bandIndexAt(v)` |
| the step in the line | `gainStep(v)` |
| the lock glyph, class and words | `lockOf` / `setLock` / `LOCK_WORDS` |
| the description | `SKILLS[].description` |
| the unlock chips | `abilitiesOf(id)`, painted by `abilityIcon` |
| which chip is lit | `standingFor(...).next` |
| the sentence under them | `standingFor(...).nextAt` and `.nextReason` |
| the count line | `total(state)` and `TOTAL_CAP` |

Nothing on the card holds its own copy of a rule. The four numbers a player
could argue with (the width, the band, the step and the unlock) all come out of
`src/mmo/skills.js` or `src/mmo/abilities.js` on every draw.

## 3. Two things windows.js does to a panel that had to be worked around

Both were found by reading `windows.js`'s stylesheet rather than by looking at
the page, and both are pinned by a check so they cannot come back quietly.

**`#bw-windows button:not(.bw-tab):not(.bw-win-x):not(.bw-btn)`** puts every
button in a panel in Cormorant at 14 px, parchment on a gold-dim border. It is
an id selector, so it beats any class rule this file writes. The filter chips
and the lock are real buttons (for the focus ring and for Enter), so both carry
`bw-btn`, which is the exemption that rule names. Without it the filter row
would have been in a different voice from the ability book's chips, which are
`div`s and never hit the rule at all. `draw()` rewrites the lock's `className`
every tick, so `bw-btn` is written there too, and the test checks the class
AFTER the three clicks of the lock cycle, not before.

**`#bw-windows h3`** is 11 px with its own margins and beats `.bw-skills h3`
for those two properties, exactly as it beats `.bw-abils h3` in the ability
book. The class rule's `border-bottom` and `padding-bottom` do land, because
the id rule does not name them. The declarations here are the ability book's
declarations, so the two pages lose the same properties to the same rule and
the headings match. Raising the specificity would have made the Skills headings
bigger than the Abilities headings, which is not what "match the abilities
book" means.

## 4. The width, at 1280 and at 1920

Computed from the stylesheet, not measured in a browser:

| | 1280 wide | 1920 wide |
| --- | --- | --- |
| `.bw-win-codex` is `min(1320px, 96vw)` | 1228.8 | 1320 |
| less the 30 px frame border on both sides | 1168.8 | 1260 |
| less the 9 px codex scrollbar | 1159.8 | 1251 |
| `minmax(520px, 1fr)` with a 10 px gap | 2 columns | 2 columns |
| so a card is | about 575 | about 620 |
| and its body column is | about 423 | about 468 |

Two columns at both, which is what "the same look at 1280 and 1920" needs. Three
columns would want 1580 px and never happen; one column would want the codex
under 1050 px and only happens under about 1150 px of viewport. A skill card is
wider than an ability card (520 against 360) because it carries a bar and a row
of chips as well as a sentence, and the widest unlock row measured is 9 chips at
26 px plus 5 px of gap, 274 px, which fits the body column with room to spare.

## 5. What was measured

`node src/game/win_skills.test.mjs`: **104 checks, 104 pass, 0 fail**. `npm test`
is green across every suite. `npx vite build` is clean: 136 modules, 2030.27 kB,
built in 480 ms, with only the pre-existing chunk size note.

Every check the old suite had is still there. Two were reworded because the
layout invalidated the word "row" or "column" ("no skill row would be blank" is
now "no skill card would be blank"), and nothing was dropped. The new sections:

**The art.** `auditSkillArt()` returns `{ skills: 52, painted: 52, groups: 9 }`.
All nine groups have a colour and a mark, and only those nine do. A painted
skill draws `<img src=".../icons/skills/mining.webp" width="112">`. Driven the
other way, an invented skill in a real group with no painting falls through to
that group's drawn mark in that group's colour.

**The bar, pure.** Nine ticks, at ten to ninety. `barView(31.4).pct === 31.4`
and `barView(33.44).pct === 33.44`, which is why the percentage is rounded: the
raw `31.4 / 100 * 100` is `31.400000000000002` and would have been written into
a style attribute. 140 clamps to 100 and -9 to 0. The band is driven at both
edges of all six bands (`min` and `max - 0.01`), and 100 is shown in the last
band. The step is compared against `gainStep` at those same twelve points rather
than against a number typed here. The words: `31.4, gains 0.2 a success`,
`10.0, gains 0.3 a success`, `60.0, gains 0.1 a success`,
`96.0, gains 0.01 a success`, `100.0, grandmaster`, and both lock refusals.

**The filters, pure.** Ten chips: All and the nine groups in the document's
order. `inFilter` driven true and false. `sheetFor('all')` is 9 sections and 52
cards; `sheetFor('Magic')` is one section of 9. `countText(412.6)` is
`52 skills, 700 points, 412.6 placed`, and the shown clause appears only when a
filter is hiding some.

**The real page, built against the fake document** (the same shim
`win_abilities.test.mjs` uses):

* 52 cards under 9 headings in the document's order, with 10 filter chips.
* **Every one of the 52 cards carries an `<img>` of its own skill's painting at
  112 px.** The check names the card's `data-skill` in the pattern, so a card
  wearing another skill's painting fails.
* **The bar width is the value**: 31.4 draws `31.4%`, 100 draws `100%`, 0 draws
  `0%`, and a skill the document has never heard of draws `0%` and reads `0.0`.
  Nine ticks and six band segments on every one of the 52.
* **Exactly one band is lit on every card**, and it is the band the value stands
  in at 31.4 (band 1), at 30 (band 1), at 0 (band 0) and at 100 (band 5).
* **The lock cycle walks up, locked, down** through three real clicks on the
  real button: the document's `skillLocks` reads `locked`, then `down`, then
  `up`; the glyph and the class follow; the log says
  `Mining is locked, and will not move`; `ctx.onSkillLock` is called with
  `mining=locked`; the card gains `held` then `falling` and loses both; the
  step line goes to `31.4, locked and will not rise` and back; and the bar is
  the same 31.4% at the end as at the start.
* **The filter chips filter**: clicking Magic leaves 9 cards, all Magic, one
  heading, one chip on, and a count line ending `9 shown`; a skill outside the
  filter is not in the page at all; the surviving cards keep their bars, their
  paintings and their step lines; All brings all 52 back with the bar Mining had
  before. A lock set while a filter was up is still read after the rebuild,
  because the lock lives in the document and not in the card.
* **The unlock chips**: one per gated ability, each the ability's own painting
  at 24 px, in `abilitiesOf` order. At Swordsmanship 30 one chip is `have`, one
  is lit, and the lit one is `standingFor(...).next`. Driven the other way, at
  100 in everything no chip is lit, all are `have`, and the line reads
  `everything it opens is yours`. A skill that gates nothing (Masonry) draws no
  chips and its sentence is empty and hidden.
* **The reason line, both ways**: not printed when it is the short line again
  (`Rend needs Swordsmanship 45`), printed when it is not
  (`Whirlwind needs a weapon skill 50` under `Whirlwind at 40`).
* The count line is `52 skills, 700 points, ` plus `total(state)` to one
  decimal, checked against `skills.js`'s own `total`, and it goes gold past the
  cap.

**Cost**, measured in the node shim over the real panel with all 52 skills set:
`build()` 9.8 ms once per filter change or open, `draw()` 0.35 ms, which is what
runs twice a second. 1852 nodes, 52 cards, 92 unlock chips.

## 6. Counted, not assumed

* 52 skills, 9 groups, 6 bands, 9 ticks per bar, 10 filter chips.
* 31 of the 52 skills gate at least one ability; 21 gate none (Mining,
  Lumberjacking, Foraging, Fishing, Skinning, the six crafting skills bar
  Alchemy and Tinkering, Resisting Spells, Inscription, Veterinary, Lockpicking,
  Detect Hidden, Remove Trap, Animal Taming, Herding, Swimming, Focus). Those
  cards show the painting, the bar and the description and nothing else, which
  is why the description is on every card rather than only on the silent ones
  the way the old table had it.
* 92 unlock chips across the sheet. The widest rows are Magery, Necromancy and
  Chivalry at 9 each.

## 7. What is NOT verified

* **Nothing was looked at.** No browser was opened, per the brief. Every width
  in section 4 is arithmetic on the stylesheet, and the node shim has no layout,
  so the wrap of a long skill name in a 17 px Cinzel line, the fit of
  `31.4, gains 0.2 a success` beside the trough at the narrow end, and the glow
  on the fill's cap are all unconfirmed. Fable's screenshots are the test.
* **The two id-rule findings in section 3 are read, not seen.** The specificity
  argument is standard CSS and the test pins the class that depends on it, but
  nobody has watched a filter chip render.
* **The tooltips** on the unlock chips and on the lock go through
  `attachTip`, which the node shim never fires. The tooltip's own behaviour is
  `windows.test.mjs`'s business; what is checked here is that the `title`
  attribute carries the same words, and titles are checked.
* **The bar under a font that has not loaded.** Cinzel arrives from Google
  Fonts and the step line is `white-space: nowrap`; if the fallback serif is
  wider the line could push the trough narrower than it looks here.

## 8. Invented here, and why

* **`GROUP_COLOUR` and `SKILL_MARK` for the nine skill groups.** The ability
  book has a colour per archetype and a mark per effect kind; the skill sheet
  had neither, and a 112 px tile with no wash and no fallback would have been a
  black square the day a skill shipped unpainted. Presentation values, read by
  no other file, guarded by `auditSkillArt()`.
* **The band segments under the trough.** No document asks for them.
  `01-STATS-SKILLS.md` has the band table and nothing in the game showed it, so
  a player could only learn where the curve breaks by grinding through it.
* **The lock in the step line.** `stepText` reads the lock because the same
  sentence with `gains 0.2 a success` on a locked skill would contradict
  `rollGain`, which refuses it.
* **`everything it opens is yours`** as the end state of the unlock row, so a
  finished skill says something rather than going blank.
