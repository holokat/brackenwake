# HUD2: one outfit, four classes, and the cute look

Planned 2026-09-08 by Fable from the user's brief:

> we are redoing characters, we no longer have separate items for armors,
> only for weapons etc.. for character we just have an outfit that is
> swappable so we need to redo the hud. I would like to restyle our HUD like
> so: (except we dont have levels) keep our mechanics but use this HUD style.
>
> keep the stats, style the hud differently. restyle the outfit part as you
> see it, no more multi-piece outfits, just 1 outfit. Yes one outfit replaces
> all armor pieces. also we will only have Rogue, Warrior, Wizard (Mage) and
> Ranger classes for now. Ignore the padlock slot, No more male or female
> customization. HUD slots: Outfit, Weapon, Off Hand (shield for example),
> amulet, ring 1, ring 2. Keep inventory as is 80 slots. but we want
> everything restyled in that cute style

The reference picture: a dark charcoal stone frame with thin gold double
borders and gold corner brackets; a tab bar along the top (CHARACTER with a
person icon on a dark red banner tab, then SKILLS with a book, ABILITIES with
a star, CRAFTING with a hammer, MAP with a map) and a red X plate at the right
end; the left column reads the name in a serif, the class word, a line of the
character's own in italics, then ATTRIBUTES, COMBAT STATS and RESISTANCES as
icon rows with the number right aligned in gold; the centre is the figure
standing on a stone dais inside a pointed arch, with three slot boxes down
each side (weapon, ring, ring on the left; amulet, outfit and a locked cell on
the right), each box a dark rounded square with a thin gold border and a small
caps label under it; the right column is INVENTORY with "18 / 30" in the
header, a grid of the same dark squares with flat bright item icons and a
count in the corner, and a coin total along the bottom. Flat, bright, chunky
icons; no textures; rounded stone; small caps labels in gold.

What we keep: every mechanic (skills, stats, resistances, affixes, rarity,
durability, the pack of 80, the bar of 12, the item bar of 8, crafting,
loot). What changes: the armour model, the class list, the body choice, and
the look of every panel.

## Phase D: two removals first (Codex, `HUD2-D`, before A and B)

Added the same afternoon, from the user: "lets get rid of the dragon
companion thing, totally useless. lets also make sure monsters stop running
away, too annoying."

- D1. The dragon companion goes: the hatchling, the Wyrmsoul Bond, the dragon
  window and key N, the dragon system, the companion's body and models, the
  HUD's wyrm cell and flash, its context menu rows, con rung, audio, ability
  hooks, loot drops, story cards, events, waystones, editor palette entries,
  roosts and perches, the save fields (hydrate ignores them on an old save).
  Dragons as monsters and in lore stay.
- D2. No monster runs away: `fleeCheck` is false for every row, `flees` is
  gone or `'never'` everywhere, monster_ai.js has no flee state. Boss
  scripted retreats (the Drowned Knight, Thalassa, the king) are story phases
  and stay. 02-COMBAT.md's flee rule is rewritten.

D runs first because it touches hud.js (B's file) and state.js, loot.js and
the systems (A's files). A and B then run in parallel on a tree without the
companion; B's "wyrm cell" below is already gone by then.

## Phase A: the model (Codex, `HUD2-A`)

### A1. One outfit replaces the eight armour pieces

- `items.js`: `SLOTS` becomes `['outfit', 'neck', 'ring1', 'ring2',
  'mainHand', 'offHand']`. `ranged` goes: bows are main hand weapons and the
  doll had already dropped the cell. `ARMOR_PIECES`, `PIECE_NOUNS`,
  `PIECE_TAGS` go. Each row of `ARMOR_TIERS` makes ONE base, `${tier.id}_outfit`
  (`cloth_outfit` ... `plate_outfit`), kind `armour`, slot `outfit`, named
  "Cloth Outfit", "Leather Outfit", "Studded Outfit", "Ringmail Outfit",
  "Chainmail Outfit", "Platemail Outfit". Its numbers are the old full set's:
  `ar = tier.ar * 9` (seven pieces plus a chest that counted double: plate is
  108, as the comment in items.js already says), `weight = tier.weight * 8`
  (plate is 72), `strReq` the tier's, each resist the tier's times eight, and
  `meditation` and `castBurden` the tier's own value carried on the base.
  Tags: `['outfit', 'armour']`, plus whatever affixes.js needs to keep every
  armour affix reachable (audit affixes.js for `boots`, `cloak`, `belt`,
  `helm`, `gloves`, `bracers`, `chestpiece`, `legs` restrictions and point
  them at `outfit`; nothing may become unreachable, and an audit must prove
  that every affix still has at least one base it can land on).
- `actor.js`: armour rating is the outfit's `armourOf`; the Meditation
  blocker and `castBurden` are the worn outfit's tier values directly (no
  averaging over eight slots; an empty outfit slot is cloth: meditation 1,
  burden 0). Every test that computed "the mean over eight slots" is rewritten
  for the one slot with the same worked numbers at full set.
- `recipes.js`: one armour recipe per tier per material,
  `armour.${tier}.outfit.${mat}`, result `{ base: '${tier}_outfit', material }`,
  bill the SUM of the eight old piece bills (PIECE_BASE sums to 21), same
  skill and difficulty rule. `ARMOUR_PIECES` there goes. 16-CRAFTABLES.md
  and the crafting window's recipe lists follow.
- `openings.js`: kits wear one outfit: warrior, ranger and rogue `leather_outfit`,
  mage `cloth_outfit`. `setOf`, `robeSet`, `pieceId` go.
- `loot.js`: `classProfileDetail.armour` lists outfits of the wearable tiers;
  `kitDraw` draws the outfit as one entry (no "by slot first"); every literal
  armour base in loot tables, uniques (`cloth_head` for The Hood of a Hundred
  Faces becomes `cloth_outfit` and the name becomes "The Robes of a Hundred
  Faces"), shops, chests, story cards, the dev bench and docs is found by grep
  (`_head|_chest|_hands|_wrists|_waist|_legs|_feet|_back` and the kit ids
  `clothHead` ...) and rewritten. `auditItems` / `auditLoot` must fail on any
  base id that no longer exists.
- `state.js` hydrate: a save with pieces worn puts on ONE outfit of the
  highest tier among them, keeping that piece's rarity, affixes and quality
  from the chest piece if there was one; the other pieces are dropped. Pieces
  in the pack each become an outfit of their tier, then duplicates by tier
  beyond the first are dropped, so a pack does not fill with eight cloth
  outfits. Anything in `equipment.ranged` goes into the pack. Measured both
  ways in state.test.mjs: a full plate wearer wakes in one Platemail Outfit
  with AR 108, and a save already on the new model is untouched.
- `src/game/studio/equipment.js`: the studio still dresses eight canonical
  slots. An outfit `${tier}_outfit` fills every studio armour slot with
  `${tier}_${slot}` where the studio has that id (it has cloth, leather,
  studded, ring, chain, plate for every slot; prove it in a test against
  `itemById`). Same material selection on every piece.
- `win_character.js`: `DOLL` becomes `left: ['mainHand', 'ring1', 'ring2']`,
  `right: ['neck', 'outfit', 'offHand']`, `SLOT_LABELS` weapon / ring / ring /
  amulet / outfit / off hand, `SLOT_WORDS` likewise, `auditDoll` counts six.
  No restyling here; Phase C does the look.
- `ui_theme.js` / `icon_art.js`: every new base has a glyph and an icon
  (`auditGlyphs` runs at import and will say so). The outfit icon may be the
  old chest piece's for now.
- `inventory.js`, `item_bar.js`, `compare.js`, `gear_visuals.js`,
  `creation.js` (the kit icons), `abilities_runtime.js` (the armour fizzle
  reads the burden), `vfx/sweep.js`, `tools.js`, `net.js` helloFor (the bases
  on the body): whatever read the piece slots reads the one.
- Docs: 03-ITEMS-LOOT.md "Slots" and "Armour tiers", 06-ECONOMY-UI.md's doll,
  16-CRAFTABLES.md. Say the old model in one paragraph so the numbers are
  explained.

### A2. Four classes

- `openings.js` keeps `warrior`, `rogue`, `ranger`, `mage`; the mage is named
  "Wizard" (the id stays `mage`, saves and the studio class profile key on
  it). `paladin`, `sorcerer`, `necromancer`, `healer`, `bard`, `artisan` and
  `blank` go, along with their kits, blurbs, creation art and lines. The
  abilities table is a skill ladder and does not change: a Rogue who trains
  Tactics still reaches Battle Cry.
- Anything keyed on a removed opening id (`OPENING_GROUP`, `birthplaceFor`,
  `starterBar`, creation copy, roster, studio colours) is found by grep and
  either dropped or given a default. A save whose `opening` is a removed id
  loads: hydrate keeps the id, and every reader falls back to the ranger's
  values rather than throwing; state.test.mjs proves it with a sorcerer save.
- `creation.js` shows four cards. Tests that count eleven count four.
- 04-CLASSES-ABILITIES.md's openings table shrinks to four and says the
  others are gone for now.

### A3. No body choice

- `creation.js` drops the male / female pills and the text around them.
  `APPEARANCE.genders` becomes `['male']`; `appearance.gender` stays in the
  document as `'male'` so nothing downstream (the studio body type, the net
  hello) changes shape. A save with `female` loads and is drawn with the one
  body; state.test.mjs proves it.

### A4. One crafting station

Added by the user after the plan: "lets replace the various crafting stations
with just one crafting station in the middle of the town, you can craft
everything there." One station, `workshop`, "Workshop", takes every recipe
family; every recipe's station is `workshop`; each settlement stands one;
Haven's stands on the green about 6 m south of the sign that names it. The
placeholder block stays until a model is made.

### Phase A acceptance

- `npm test` green except the four suites already failing on main before
  this work (dragon, editor eraser fixture, minimap and wayside perf).
- `node -e` audits: `SLOTS.length === 6`, `BASES` has six `_outfit` rows and
  no `_head` etc., `OPENINGS.length === 4`, every affix reachable, every base
  with a glyph and an icon.
- In the browser (Vite on 5198, `window.__bw`): a fresh Wizard stands on the
  creation dais in a cloth outfit and a staff; the Character page (C) shows
  six doll cells with the outfit in the outfit cell; dragging the outfit to
  the pack undresses the rig and puts it back on when dragged back; AR on the
  sheet is 9 in cloth; `__bw.character.equipment` has exactly the six keys.
  Say which of these were measured and how.

## Phase B: the look (Codex, `HUD2-B`, in parallel with A)

Files B may touch: `src/game/ui_theme.js`, `src/game/windows.js`,
`src/game/hud.js`, `src/game/chat_box.js`, `src/game/floaters.js`,
`src/game/minimap.js` (its frame only), and their tests. B does NOT touch
`win_character.js`, `creation.js`, `win_bag.js` or anything under `src/mmo`;
Phase A owns those and Phase C restyles the pages after both land.

- Tokens in `ui_theme.js` move from warm brown-black to the reference's
  charcoal: stone `#1b1a1c`, stoneUp `#25242a`, stoneDeep `#111013`, stoneEdge
  `#38363c`; parchment stays for prose; gold stays as the border language;
  the red plate stays for the active tab. Add a slot token set: slot face
  `#141316`, slot border `${gold}55`, slot border lit `${gold}`. Corner
  brackets: four small gold L shapes drawn in SVG as a data URI and placed at
  the corners of every panel and every slot box (`.bw-corners` helper class).
- The codex frame (`windows.js`): the tab bar sits on a stone rail along the
  top; each tab is an icon and a small caps word (person, open book, star,
  hammer, map, drawn in code in icon_art.js's style); the active tab is a red
  banner plate hanging down over the rail; a red X plate at the right end
  closes the codex; the frame's corners carry the brackets; the body is a
  darker inset panel. The Abilities tab keeps its key P and the others their
  keys; nothing about which panel opens changes.
- The HUD (`hud.js`): the ability bar and the item bar cells become the
  reference's slot boxes (rounded dark square, thin gold border, small caps
  key cap in gold at the top left, count at the bottom right); the pools and
  the target frame sit in the same stone with brackets; the log and the
  chat box take the stone panel. Cell sizes and counts do not change, and
  every existing hud.test.mjs check about structure still holds; only the
  sheet changes. The bottom bars also stop overflowing a viewport narrower
  than 1360 px: the ability bar, the item bar and the wyrm cell wrap onto two
  rows under 1360 px instead of running off the left edge (measure at 1280).
- Fonts: keep Cinzel for small caps labels and the serif for prose; the
  numbers in stat rows are right aligned, tabular, gold.
- Nothing is a downloaded asset. Everything ships in code as before.

### Phase B acceptance

- `npm test` green as above; hud.test.mjs and windows.test.mjs pass with
  their structural checks untouched.
- In the browser: a screenshot of the codex open on Abilities and one of the
  HUD in play, both against the reference's description above; the bars at
  1280 wide show all twelve ability cells on screen.

## Phase C: the pages (after A and B)

The Character page laid out as the reference (name, class, a line, the three
stat blocks; the arch with six slot boxes; INVENTORY with "n / 80" and the
coin line); the creation screen with four class cards in the same stone and
no body row; the bag, skills, crafting and map pages in the same sheet. Spec
to follow once A and B are in.
