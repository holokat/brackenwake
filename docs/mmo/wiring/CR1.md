# CR1 wiring: the creation screen, in the codex's furniture

The user's words, verbatim:

> the creation screen looks nothing like the rest of the game... The first
> screen a player sees should be the most handsome one

and, on the class list:

> they could carry more: the kit and the starting stats as a glance, and a
> portrait, so choosing a class feels like choosing a hero and not reading a
> list.

`src/game/creation.js` and `src/game/creation.test.mjs` only. Nothing about
`planCharacter`, the budgets, the name rule, the kit going in through the real
inventory, or the turning rig changed. Every one of the 79 checks that were in
the suite before is still there and still green; 65 more were added, all of
them about the screen, because the screen was the part this file could prove
nothing about.

---

## 1. What it wears now

The panel was its own small stylesheet: a sans serif stack, `#ffd479`, rounded
corners, a green Begin button. It now calls `injectTheme(document)` itself
(it is the first screen, and there is no HUD yet to have done it), wears
`bw-ui`, and is built out of `ui_theme.js`:

| | before | now |
| --- | --- | --- |
| body type | `ui-sans-serif, system-ui` | `theme.fonts.body`, Cormorant Garamond |
| headings | `h1`/`h2`, 22px and 11px sans | `theme.fonts.display`, Cinzel |
| section headers | `h2`, uppercase, `#8fa387` | `.bw-hdr` from the theme sheet: Cinzel small caps in gold over `ruleUrl()`'s diamond rule |
| ground | flat `rgba(255,255,255,.04)` | `parchmentUrl()` over a dark wash, `cornerUrl()` marks at the top corners, a gold rule down the open edge |
| sliders | the browser's | a 3px gold track and a parchment thumb, in `-webkit-` and `-moz-` forms both |
| selects | the browser's | dark plate, gold hairline, a drawn gold caret as a data URI |
| Begin | `#35492f` with a green border | the codex button: Cinzel, letter spaced, gold on dark, with a visible disabled state |
| the error line | above the button, `#ff8f7a` | below the button, `theme.down` |

The seven headers read CHOOSE YOUR OPENING, THE KIT, STATS, WHAT THAT COMES
TO, SKILLS, APPEARANCE, NAME. They are written in sentence case and set in
small caps by the theme's own rule, exactly as the character sheet's
ATTRIBUTES and COMBAT STATS are, so if the theme's header ever changes the
creation screen changes with it.

Widths: `min(880px, 52vw)` with a `min-width` of 520, and `min(940px, 50vw)`
past 1700. That is 665 px of sheet at 1280 and 940 at 1920, which puts the
cards in two columns and then three, and leaves the rig its side of the
screen in both.

## 2. The cards are heroes now

Each of the eleven carries, top to bottom: a drawn emblem in the class colour,
the class name in Cinzel, the opening's strongest starting skill, the blurb,
five stat bars, and a row of the kit's item icons. A colour band runs down the
left edge; the chosen card swaps it for the gold border and the `inset 3px 0`
gold bar the codex lights an active ability card with.

### The colour

`GROUP_COLOUR` in `win_abilities.js` is the source. `OPENING_GROUP` maps each
opening to the ability group its spells and strikes are actually filed under,
and nothing is typed twice:

| opening | group | why |
| --- | --- | --- |
| warrior, ranger, rogue, mage, sorcerer, necromancer, healer, bard | their own | one to one |
| paladin | `healer` | every chivalry ability in `abilities.js` is in the healer group. The paladin has no group of his own, so he takes the colour of the one his abilities live in rather than a tenth colour invented here |
| artisan, blank | `everyone` | the parchment neutral. Neither is an archetype, and a red or a blue would promise abilities they do not have |

Eleven openings, nine colours. The test counts them.

### The emblems

Eleven fragments in `EMBLEMS`, 36 `<path>` elements between them, on the same
24 by 24 field `ui_theme.js`'s `GLYPHS` use, filled rather than stroked, in the
class colour: a sword over a shield, an armoured fist under three lights, a
drawn bow, two crossed daggers, an open palm under a rune, an eye in a ring, a
skull, the same palm with a wrapping cut through it, a lute, a hammer over an
anvil, and an empty rune stone.

Four of them use `fill-rule="evenodd"` to cut holes rather than to draw a
second colour: the eye's white, the skull's nose and teeth, the paladin's
thumb line, the healer's two bandage turns, and the blank stone's hollow. The
mage's and the healer's hands are the same `PALM` constant, whose fingers stop
exactly on the palm's top edge rather than overlapping it, because an overlap
would have become a hole the moment the healer's fill rule was applied.

`auditEmblems()` runs at import and throws if a twelfth opening arrives with
no drawing, no group, or a group with no colour.

### The stat bars

Five per card, STR DEX INT CON WIS, `statPct(v) = round((clamp(v,10,100) - 10)
/ 90 * 100)`. The floor of 10 is an empty bar and the cap of 100 a full one,
because 10 is where the rules say a stat may not go below and a bar that
started at zero would have made a warrior's INT 25 look like a quarter of
nothing. The fill is the class colour; the bar is marked `data-pct` and the
row `data-stat`.

### The kit row

`kitFor(op, 1).items` through `itemGlyph(base, 22, null, { count, material })`,
so a base with a painting shows its painting and the rest show the theme's
drawn glyph. Capped at `KIT_ICONS_SHOWN = 8` with `+n more` after it. What
that comes to, counted:

```
warrior 8/11  paladin 5/5   ranger 8/11  rogue 8/11
mage 8/10     sorcerer 3/3  necromancer 3/3
healer 8/11   bard 8/10     artisan 6/6  blank 8/10
```

Seven of the eleven overflow eight, so the cap and the tail are both doing
work rather than sitting there untested.

## 3. The kit, the numbers, the rest

The kit section under the cards is one row per item: the icon at 22 px and the
name beside it, in two columns. Anything the item tables cannot make still
gets a row, greyed, struck through, with the reason after it. **That row draws
nothing today**: every base the eleven kits name now resolves, so `missing` is
empty for all eleven and the greyed branch is unexercised in practice. It is
kept, and tested against `kitFor`'s own `missing` count, so the day a twelfth
opening names something unmade the row appears without an edit.

WHAT THAT COMES TO is a two column table of six rows, each an icon from the
theme's own set, a gold small caps label, and the number in Cinzel with
tabular figures: health, mana, stamina, carry, mana regen, stamina regen. The
values are `derived()`'s, unchanged.

The stat and skill rows are capped at 330 px of control rather than left on
`1fr`; at 1920 a slider for a number that runs 10 to 100 was eight hundred
pixels long. The skills box is framed and scrolls at 280 px.

## 4. Two bugs the screenshots found

Both were in the code before the restyle and both survived the first draft of
it. Neither would have been caught by any test in this file.

- **The skills list rendered as nothing.** The panel is a column flex box, its
  content is far taller than the window, and every section was a flex item the
  browser was free to squeeze. The one with its own `max-height` and
  `overflow-y: auto` was squeezed to zero, so all fifty two skills existed in
  the DOM, passed every count, and occupied no pixels. Fixed with
  `#bw-creation .bw-cr-panel > * { flex: 0 0 auto; }`.
- **The screen opened at the bottom.** `nameInput.focus()` dragged the sheet
  past the eleven cards to the name field, so the first thing a player saw was
  the Begin button. Now `focus({ preventScroll: true })` with
  `panel.scrollTop = 0` after it, because preventScroll is not honoured
  everywhere.

## 5. What was measured

`node src/game/creation.test.mjs`: **144 passed, 0 failed** (79 before, 65
new). The new ones, in short:

- Every opening has a colour that is `GROUP_COLOUR`'s, and the eleven wear nine
  of them. The paladin's is the healer's and the two neutrals share `everyone`.
- Every emblem's path data is **parsed**, not eyeballed: a tokeniser walks each
  `d` string, checks the command letters against the SVG set and counts the
  arguments each one takes, including repeated implicit commands and the
  seven arguments of an arc. The checker is itself proved on a good path, a
  path with a number missing, a path with an invented command and an empty one
  before it is trusted with the emblems. `<g>` opens and closes are balanced.
  36 paths across 11 emblems, all clean.
- Every card carries one emblem in its class colour, marked with its opening;
  the name; the band in that colour; the blurb; and the opening's strongest
  starting skill, worked out in the test from `openings.js` rather than read
  back off the function that wrote it.
- Five bars per card in STR DEX INT CON WIS order, whose `style.width` is
  recomputed in the test from the opening's own stat, and both directions: a
  warrior's STR bar is 61% against a mage's 22%, a mage's INT 67% against a
  warrior's 17%.
- The kit row's icon count is `min(8, kitFor(op).items.length)` for all eleven,
  every icon is a real `<svg>` or `<img>`, and the tail reads `+n more` where
  and only where the kit overflows.
- One card lit and only one: on open, after `pick()`, and after a real click
  fired at a real card. The stats follow the click.
- The stylesheet goes in the head exactly once across three screens, and so
  does the theme's.
- The seven headers, in order.
- Begin is disabled with no name and says why; a typed name enables it and the
  red line goes quiet; a digit turns it off again and names what is allowed;
  the error line is the element after the button. A real click on Begin hands
  over a character with a name, an opening and a kit.
- The steppers still obey the rules in both directions: a warrior cannot step a
  skill up out of nothing (refused, and said), stepping one down is allowed,
  and the same step up is then taken.

Separately, and outside the suite:

- The eleven emblems were rendered in headless Chrome at 140 px and at 26 px
  and looked at. Five were redrawn on the strength of that: the ranger's bow
  had a lens where its limb should have been, the healer's wrapping stuck out
  past the hand, the bard read as a key, the artisan's hammer sat on the anvil,
  and the paladin's open hand was indistinguishable from the mage's.
- The whole screen was bundled and rendered at 1280 by 900 and 1920 by 900 and
  looked at, which is what found the two bugs in section 4.
- All 80 painted kit icons the eleven cards ask for were checked against
  `public/`: every path `itemIcon` returns is a real file.

`npm test`: every suite green except `state.test.mjs`, which fails one check,
`newest played first`, in the roster work another hand has open in
`src/game/state.js` and `src/game/roster.js`. Nothing in that path touches
`creation.js`.

`npx vite build`: clean, 124 modules.

## 6. What is not verified

- **Fonts.** Cinzel and Cormorant Garamond are fetched from Google Fonts by
  `injectTheme`. The headless renders had them, so the screenshots are honest,
  but nothing here proves the link is reachable from wherever the game is
  served, and the fallback is Palatino then Georgia then serif.
- **The rig.** Not a line of the preview changed, and the harness runs with no
  scene, so `rig`, the spin loop and the height scaling are exactly as they
  were and are not exercised by anything new.
- **Hover and focus states.** The `:hover` border and the `:focus` gold outline
  are CSS with no test behind them; they were not driven in a browser.
- **The greyed shortfall row.** Real code on a path no opening currently takes,
  as section 3 says.
