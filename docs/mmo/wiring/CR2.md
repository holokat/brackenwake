# CR2 wiring: the creation screen as a full screen, three columns round a hero

The user's words, verbatim:

> I dont want giant blocks. just have a selectable class on the bottom, with
> character in the center as preview and their stats on one side, selecting the
> class changing the stats and on the other side (maybe on the right side of the
> screen, we'll add class art and talk about that class a bit.

with a reference image: a plaque at the top centre, a compact grid of small
class cards down the left, the character large on a stone dais in the middle
with arrows and toggles under them, and a tall panel on the right carrying the
class name, three words, framed art, a quote, the blurb, BASE STATS, STARTING
GEAR and a red and gold CREATE CHARACTER.

`src/game/creation.js` and `src/game/creation.test.mjs` only. `planCharacter`,
`movesFrom`, `kitFor`, the name rule, the budgets, the emblems, the colours and
`statPct` are byte for byte what CR1 left. Everything below `// the DOM` is new.

---

## 1. The shape

```
+----------------------------------------------------------------------------+
|            |            [ KALDERA ]                     |                   |
|  CHOOSE    |      Who walks out of the trees?           |  WARRIOR          |
|  YOUR      |                                            |  STR . CON . DEX  |
|  OPENING   |                                            |  [ art frame ]    |
|            |               the rig, in the              |  "a quote"        |
|  [][]      |               real scene, on a             |  blurb + a line   |
|  [][]      |               real stone dais              |  BASE STATS       |
|  [][]      |                                            |  five bars that   |
|  [][]      |                 <   >                      |  are the sliders  |
|  [][]      |        [build][skin][hair]                 |  ADJUST SKILLS +  |
|  []        |        [colour][marks][height]             |  WHAT THAT ...    |
|            |                                            |  STARTING GEAR    |
|            |                                            |  ---------------  |
|            |                                            |  NAME [        ]  |
|            |                                            |  CREATE CHARACTER |
+----------------------------------------------------------------------------+
| ELEVEN OPENINGS, THIRTY POINTS TO MOVE...        KALDERA : THE MAKING OF ... |
+----------------------------------------------------------------------------+
```

One grid, `300px minmax(0,1fr) 400px` by `auto minmax(0,1fr) auto`. The two side
panels span rows 1 and 2; the plaque and the stage take column 2; the footer
runs the whole width along row 3. **The middle is painted with nothing at all**
and carries `pointer-events: none`, so what fills it is the scene itself.

`GAME_TITLE` is exported from `creation.js` and set to `'Kaldera'`, with the
comment that the land was renamed and this is the one place the creation screen
says it. The plaque reads it off that constant.

## 2. The rig, framed by measurement rather than by guess

The old screen put the camera at a fixed `(1.4, 1.5, 2.9)` and let the rig turn
on its own. Now:

- **A dais.** A `THREE.Group` named `creation-dais`: a 0.16 m stone cylinder
  tapering 0.74 to 0.62, with a thinner lip on top. It is a real mesh in the
  real scene, so the world's own light and fog fall on it, and `destroy()`
  removes it and disposes both geometries and both materials. `creation.js`
  imports `three` for it; a dynamic `import()` inside the render loop would have
  been a second module instance, which is the trap CLAUDE.md names.
- **The rig's height is measured, not assumed.** `rigSpan()` runs
  `Box3.setFromObject` over `rig.group` after `updateWorldMatrix`. Hair, boots
  and the appearance scale all move the crown; `BODY.HEIGHT` is 1.80 and the
  actual box comes back at **1.91** at the default 1.75 m. The framing uses the
  box.
- **The lens is offset, not the camera.** The box the rig has to land in is not
  the middle of the window: the side panels are different widths, and stacked
  under 1100 the preview is at the top of a scrolling page. The first attempt
  slid the camera sideways and down to compensate, and in the stacked layout
  that put the camera at **y = -0.53**, under the ground, looking up at the
  underside of the dais. It is now `camera.setViewOffset(fullW, fullH, ox, oy,
  W, H)`: the window is rendered as a crop of a larger frame that has the rig at
  its own centre. The camera stays level with the middle of the body, looking
  straight at it, at y = 0.955.
- **The lens is handed back.** `destroy()` calls `clearViewOffset()` and then
  `sc.resize()`. The camera belongs to the game; an offset left on it would
  frame the whole world off centre for the rest of the session. There is a check
  for this in the suite, driven with a camera that records what was done to it.

`FRAME.fill` (0.82) is the only number chosen by hand: the share of the open air
the rig **and its dais** take, top to bottom.

### What that measures out at

Projected through the real camera in headless Chrome, reading
`Vector3(0, 0.16, 0)` and `(0, 1.91, 0)` back through `camera.project`:

| window | the open air | crown | feet | the person | of the box | rig centre x | box centre x |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1920 x 900 | 1184 x 588 | 167 | 609 | 442 px | 75% | 910 | 910 |
| 1280 x 900 | 624 x 588 | 167 | 609 | 442 px | 75% | 590 | 590 |
| 1000 x 900 (stacked) | 949 x 286 | 150 | 365 | 215 px | 75% | 492 | 492 |

75% is the person; the person plus the dais is the 82% asked for. Dead centre of
the box horizontally at all three, which is the whole point of the offset lens.

## 3. The arrows

`YAW_STEP` is 30. Each arrow adds or subtracts it from an unbounded `yaw` in
degrees, and the render loop eases the rig towards it
(`shown += (want - shown) * 0.16`). **The idle drift is gone**: a figure that
turns on its own cannot be aimed, and an arrow that fights a spin is a control
that does nothing. Nothing but the arrows turns the rig, and the suite proves
that by picking a class and dragging a slider afterwards and finding the yaw
unmoved.

Measured in the browser after the loop had settled: one click of the right arrow
leaves `rig.group.rotation.y` at exactly **30.00 degrees**; two frames after the
click it read 8.83, which is `30 * (1 - 0.84^2)` to two places, so the easing is
the one written down.

## 4. The cards, and what left them

Small: an emblem at 20 px, the name, and the blurb clamped to two lines.
`min-height: 124px`, two to a row.

The stat bars, the kit icons and the lead skill line moved to the right hand
panel, where they are about the one class you have chosen rather than repeated
eleven times. `leadSkillLine` was **deleted** rather than left as a writer
nothing reads; the three stat words say what it used to say, better.

Two things the rendered page found and the DOM tests could not:

- `grid-template-columns: 1fr 1fr` will not put a track below the widest
  unbreakable word in it, so **NECROMANCER pushed the right hand column of cards
  clean off the panel at 1280**. Now `repeat(2, minmax(0, 1fr))` with
  `overflow: hidden` on the card.
- At 15 px, NECROMANCER still overran a card in a 300 px column. The name is
  14 px, and 12.5 px under 1400.

## 5. The right hand panel

Top to bottom: the class name in Cinzel, the three stat words, the art frame,
the quote, the blurb with its extra sentence, BASE STATS, the skills
disclosure, WHAT THAT COMES TO, STARTING GEAR. Then, **pinned**, NAME, CREATE
CHARACTER, the red line and the shortfall line.

The pinning is not decoration. At 900 px of window the button was below the
fold, which is a screen whose whole purpose is a button you cannot see. The
reading half (`.bw-cr-scroll`) is the only part that scrolls; `.bw-cr-act` is
`flex: 0 0 auto` at the foot. Stacked under 1100 both go back to flowing with
the page.

### The three words

`statWords(op)` returns the opening's three highest stats as full words, read
off `openings.js` and ordered by value with ties falling to `STAT_IDS` order.
Warrior gives STRENGTH . CONSTITUTION . DEXTERITY, mage INTELLECT . WISDOM .
CONSTITUTION. The test recomputes all eleven from `openings.js` rather than
reading them back off the function that wrote them.

### The art slot

`artId(id)` gives `bw-cr-art-warrior` and so on: one stable id per class, so a
painting can be dropped in with
`document.getElementById(artId('warrior')).style.backgroundImage = 'url(...)'`.
Until then `artUrl(id)` draws the placeholder in code: a lit ground in the class
colour, the class emblem large and faint over it, and two ridges of dark
country. Eleven ids, all distinct, each placeholder carrying its own class
colour, all checked.

### The quotes and the sentences

Eleven of each, in `QUOTES` and `CLASS_NOTE`, none repeated, none over 72
characters, and none written with a dash the house style forbids.
`auditClassText()` runs at import and throws if a twelfth opening arrives with
no quote, no sentence or no stat words, exactly as `auditEmblems()` does for the
drawings.

### The bars are the sliders

Each BASE STATS row is `STR | track | 65`, and the range input sits over the
track with no track of its own, so the thing you read is the thing you drag.
The points left line sits above them and the budget rules are `openings.js`'s,
untouched.

Skills are behind an `Adjust skills` disclosure, shut on open. The rows are
built whether it is open or not, so opening it is not a wait, and the fifty two
rows in nine groups with four steppers each are inside it, along with their own
budget line. Opening it, picking another class, and finding it still open with
the new class's numbers is checked.

## 6. A bug this screen has been hiding

Drag STR from 65 to 55 and put the ten points nowhere. `movesFrom` finds a donor
and no gainer, makes no move at all, and `planCharacter` answers **ok** with a
character whose STR is **65**. Measured on the shipped code, through
`planCharacter`, which this change does not touch:

```
screen says str 55            -> plan.ok true   character str 65
screen says swordsmanship 45  -> plan.ok true   character swordsmanship 50
```

The bar read one number and the save held another, and Begin was live. The rules
are right and stay untouched; what was missing was anybody reading `movesFrom`'s
own `spare`, which has been counting the loose points all along. The screen now
says

> 10 stat points you took off are lying loose. Put them on something else.

and CREATE CHARACTER is dead until they are placed. Both directions are in the
suite, on the sliders and on the skill steppers.

## 7. Responsive

| window | columns |
| --- | --- |
| 1401 and up | 300 / fluid / 400 |
| 1101 to 1400 | 260 / fluid / 360, smaller card names, tighter derived table |
| 1100 and under | one column: plaque, **preview**, cards, panel, footer, and the page scrolls |

The derived table's two regen rows were relabelled `mana a second` and
`stamina a second` with the bare number after them: `STAMINA REGEN` beside
`2.50 A SECOND` wrapped its own value in a 360 px column, and a label may wrap
where a number may not.

## 8. What was measured

`node src/game/creation.test.mjs`: **206 passed, 0 failed** (144 before).

Three of the 144 went, and the reason is in the file beside the replacement:
they measured `leadSkillLine`, which wrote a line the small cards no longer
have. Six more were rewritten in place because the layout moved what they were
looking at, each with a comment saying so: the one panel beside the rig, the
seven section headers (now five: THE KIT is the icon row under STARTING GEAR,
and APPEARANCE is six labelled pills), the card contents, the stat bars, the kit
icons, the face selects, and the error line's neighbours. The arithmetic in
every one of them is unchanged: the bars are still recomputed from
`openings.js`, the icon counts still from `kitFor`.

New, in short:

- The panel is the whole window and holds the plaque, three columns and the
  footer in that order; the cards are in the left column and nowhere else; the
  class name, art, quote, bars, gear, name and button are in the right; the
  middle paints nothing but the arrows and the six pills.
- The sheet declares three columns at 300 and 400, narrows them to 260 and 360
  rather than dropping one, stacks them under 1100 with the preview on row 2,
  leaves the middle transparent, and still carries the one line that fixed CR1's
  squeezed skills list.
- Eleven quotes, present, distinct, short enough, and no dashes; eleven
  sentences, none of them the blurb said twice.
- The three stat words for all eleven, recomputed from `openings.js`.
- Eleven art ids, distinct, each placeholder a data URI in its class colour.
- The arrows: two of them, one each way, drawn rather than typed; 0 to -30 to
  -60 and back; and nothing else moves the yaw.
- The sliders: five, floor to cap, one bar each. Ten points moved and the
  planned character has them. Ten points taken and not placed and it says so and
  the button dies. Thirty allowed, thirty one refused and counted, and back
  inside the budget the button lives again.
- The skills disclosure: shut on open, all fifty two rows built anyway, all
  fifty two inside it in nine groups when opened, its own budget line with it,
  shut again on a second click, and still open across a change of class.
- `GAME_TITLE`, `YAW_STEP`, and the lens handed back on destroy.

Outside the suite, in headless Chrome over a minimal scene with the real
`buildCharacter`, at 1920, 1280 and 1000 by 900, looked at, and the numbers in
sections 2 and 3 read back through `camera.project` and `Box3`. What the
screenshots found and fixed: the button below the fold, the cards off the panel
at 1280, NECROMANCER clipped at 1920, the wrapped regen value, and the camera
under the ground in the stacked layout.

`npm test`: ALL SUITES GREEN. `npx vite build`: clean, 134 modules.

## 9. What is not verified

- **The real world behind it.** The headless harness stands the rig on a plain
  ground with a ring of trunks, not on Kaldera's terrain. Nothing in the framing
  depends on the world, but how the screen reads over real ground at
  `setDay(0.34)` and `setFog(26, 74)` has not been looked at.
- **Hover, focus and the drag itself.** The `:hover` borders, the gold focus
  outline and the feel of dragging a bar are CSS and pointer behaviour with no
  test behind them; the sliders were driven by firing `input`, not by a mouse.
- **The greyed gear cell.** Real code on a path no opening takes today: every
  kit base the eleven name resolves, so `missing` is empty for all eleven and
  the cell draws nothing. Counted against `kitFor`'s own `missing`, so the day a
  twelfth opening names something unmade it appears without an edit.
- **The 41 rung height pill** was opened in node and counted, not in a browser.
- **Fonts**, as CR1 said: Cinzel and Cormorant Garamond come from Google Fonts
  and the headless renders had them, but nothing here proves the link is
  reachable from wherever the game is served.
