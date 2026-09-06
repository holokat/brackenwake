# CR2 wiring: the crafting bench becomes a wall of cards, and every recipe lands on a picture

Files owned and touched: `src/game/win_crafting.js`,
`src/game/win_crafting.test.mjs`, `src/game/icon_art.js` (one entry added),
`scripts/export-craftables.mjs`, `docs/concepts/craftables/*` (regenerated) and
this note. `win_abilities.js`, `ui_theme.js`, `icon_art.test.mjs`,
`src/mmo/recipes.js`, `src/mmo/items.js` and `scripts/list-craftables.mjs` were
read and not edited.

---

## 1. What changed, in a paragraph each

**The bench is the abilities window's card now.** It used to be a list: a name,
a comma joined bill, one percent and a button, in thirteen point grey. A player
could not see what a recipe made, could not tell at a glance whether the iron
was already in the pack, and had no way to ask a forge for shields among its
three hundred and sixty two recipes. So it is a grid of cards, and deliberately
the same class names and the same values out of `ui_theme.js` that
`win_abilities.js` uses, so the two pages read as one game: a 96 px art tile, a
Cinzel name, small caps chips, a drawn padlock and one gold sentence when the
answer is no, a filter row along the top and a count under it.

**A card carries what a bench is actually asked.** The chips are the armour
tier when there is one, the skill with your own number in it, the difficulty,
the chance the piece holds, the expected quality, how many come out when it is
more than one, and whether it can be signed. Under them the bill of materials
is one chip per line reading `3 of 2 copper`, green when you have it and red
when you do not, so the arithmetic a player used to do in their head is on the
card. Under that, one line: `Makes one dagger`, or the refusal in words.

**The picture is looked up through the base the craft really lands on.** This
is the whole reason the old panel had no art to show. A recipe's
`result.base` is often not an `items.js` base at all: every one of the two
hundred and sixteen armour recipes calls itself `cloth_hood` or `plate_helm`,
while the painting is filed under `cloth_head` and `plate_head`. `tileArt`
resolves through `resultBaseFor`, which is the same resolver `craft()` spends,
and then falls in three steps: the painted icon through `itemIcon` (which is
also where a bundle of twenty arrows and a ruby's own colour come from), then
`ui_theme.js`'s drawn glyph for that base tinted by the base's own material,
then the family's glyph for a recipe with no item behind it at all.
`auditCraftArt()` runs all 486 recipes through `tileArt` at import and throws
if one of them comes out blank, and the test walks all 486 cards as they are
really drawn and counts the empty tiles. It is zero.

**Filters narrow the bench before the near miss cut, not after.** `benchFor`
takes `opts.family` and applies it to the recipe set, so asking a forge for
shields shows the twelve easiest shields rather than whatever shields happened
to survive a cut made across all 362 of its recipes. The filter row is built
from `familiesAt(station)`, so a forge offers Weapons, Armour, Shields and
Tools and does not offer Scrolls, and the inscription desk offers only Scrolls.
`All` and `Can make` come first; `Can make` is the only one that reads the
pack.

**The page keeps up with a pack that changes under it.** `tick` looks twice a
second and redraws only when something a card reads has moved. What it asks is
the five things a card actually depends on, not the cards: how much of each
material the pack holds, the skills the bench uses, the gold, and whether there
is room. Walking all 362 forge cards through `refusalFor` to answer the same
question cost 2.72 ms and ran twice a second; asking fourteen materials instead
of seven hundred costs 0.094 ms, against 16.7 ms of frame.

**`craft()` is still the one path that makes anything.** The make button calls
it and then redraws. Nothing was added that makes an item, and nothing bypasses
the refusal, the material spend, the lesson or the words it says.

## 2. A real bug found on the way, and fixed

`giveMaterial` asked `makeItem` for a base called `ingot`. `items.js` retired
that base and quietly resolves it to `iron_ingot`, so a refund of four copper
after a craft that could not fit in the pack put four IRON ingots there with
the word Copper written on them. `answersTo` reads both the item's stamp and
the base's own metal, so that one stack then counted as four copper AND four
iron, and the forge would have let you strike an iron dagger out of copper you
never had. Wood went the same way through a base called `log`, which resolves
to oak, so an ash refund was oak that also counted as ash.

`refundBaseFor(id)` names the metal now: copper comes back as a copper ingot,
tin as tin ore because the game has no tin ingot, ash as an ash log, cloth as a
stamped reagent because cloth is no item yet. `auditCraftBases` proves, for
every material any recipe spends, that the base it comes back as either carries
that same material or carries none, which is the check that would have caught
the original. Forty eight materials, all clean.

The test's own `stock` helper had the same fault and was fixed with it: a test
pack of copper is a copper ingot now, which is why the bill chip test could
prove the iron chip goes red.

## 3. A data problem the cards made visible

Eight pairs of recipes share a name to the letter, and both of each pair live
at the tanning rack: `armour.leather.chest.hide` and `armour.studded.chest.hide`
are both called "Hide tunic". On a list nobody noticed. On a wall of cards two
identical names side by side look like the page repeated itself. The card says
the armour tier as its first chip now, and the line under the bill says what
comes out ("Makes one leather tunic" against "Makes one studded leather
tunic"), so the pair reads apart. The test proves no two cards at any one bench
carry the same name and the same chips. The names themselves are `recipes.js`
data and were not touched.

## 4. The art, counted

One icon in `public/icons/items` was in the library and mapped to nothing:
`willow-log.webp`. It is `willow_log` in `ITEM_ICONS` now. Every other one of
the 177 files was already mapped, so there was no unclaimed art to find: the
gap was never the mapping, it was `scripts/export-craftables.mjs` reading
`ITEM_ICONS` with the recipe table's spelling instead of the base the craft
lands on, which reported 74 bases with no picture when most of them are painted
and in the game.

The script resolves through `resultBaseFor` now, the CSV grew a "lands as"
column, `ART-LIST.md` ends with the missing list in one block, and `PROMPTS.txt`
holds a prompt for the missing ones ONLY, so an artist is not handed 111 lines
of which 70 are already done.

The true count: **111 bases, 70 painted, 41 with no picture.** They are

- 30 armour pieces: the eight studded, and six ringmail, eight chainmail and
  eight platemail (ringmail's breastplate and greaves are painted; the other
  six slots are not);
- `tower` (the tower shield) and `bolt` (crossbow bolts);
- 9 with no item behind them at all, so they need an item before they need a
  picture: `hatchet`, `sewingKit`, `saw`, `tinkersTools`, the four bags and the
  scroll.

So 32 things the game can already make have no painting and draw the glyph
instead, and 9 cannot be made at all and say so on the card.
`scripts/list-craftables.mjs`, which was already resolving correctly, reports
the same 32 and 9 independently.

## 5. What was measured

- `node src/game/win_crafting.test.mjs`, 165 checks, exit 0. It installs the
  small fake document `win_emotes.test.mjs` uses, BUILDS the panel and opens it
  at each of the seven stations for a character at skill 100, and reads the
  page back: 362 forge cards, 13 loom, 16 tanning rack, 24 workbench, 15
  alchemy table, 21 kitchen, 35 inscription desk, 486 in all, which is every
  recipe in the game. Zero blank tiles, zero nameless cards, zero cards without
  a chip.
- The bill both directions: 0 of 2 copper red, 1 of 2 red, 3 of 2 green, and
  the chip on the card really carries the class the CSS paints.
- Filters both directions: clicking Shields cuts 362 to 24 and every card left
  is a shield; All puts 362 back; Can make with an empty pack shows nothing and
  with four copper shows exactly the five copper things it buys, every one of
  them with a live button.
- The icon lookup resolved through the produced base for cloth armour, leather
  armour, a meal, a potion, a weapon, a bow and a stack of arrows, plus the two
  fallbacks (a plate helm to the drawn helm, a hatchet to the family tool
  glyph).
- The make button drove `craft()` for real: a dagger in the pack, two copper
  gone, the sentence said, the card redrawn with 4 of 2 copper.
- `tick` both directions: no redraw when nothing moved, one redraw when a stack
  landed, one when a skill moved, and 0.021 ms per check.
- `node src/game/icon_art.test.mjs` exit 0 (161 of 199 bases painted, up one).
- `node src/game/wiring.test.mjs` exit 0. `skinning`, `win_emotes`,
  `wyrmsoul`, `win_skills`, `inventory` and `shop`, which import one of the two
  changed files, all exit 0.
- `node scripts/export-craftables.mjs` and `node scripts/list-craftables.mjs`
  exit 0 and agree on the count. `npx vite build` exit 0.

## 6. What was not measured

Nobody opened a browser. The card grid, the gold on the chips, the grayscale on
a locked tile, how the 362 forge cards scroll inside `max-height: 58vh`, and
whether a 96 px painted icon reads at that size are all unseen. Two suites in
the tree fail (`models.test.mjs` on a dragon hatchling joint name, and
`roster.test.mjs` on its exit code); neither imports `win_crafting.js` or
`icon_art.js`, and both files are being edited by another agent right now.
