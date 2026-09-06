# T3 wiring: the tool row comes off, and the tool is derived from what you carry

The user, in their own words:

> get rid of this bar, we'll just equip items into item bar and if its selected
> there, thats how its used, but we dont need to select a weapon to melee or
> range or cast as long as its equipped.

Files owned and touched: `src/game/tools.js` (new), `src/game/tools.test.mjs`
(new), `src/game/hud.js`, `src/game/item_bar.js`, `src/game/interact.js`,
`src/game/state.js`, `src/game/skinning.js`, `src/game/foraging.js`,
`src/game/shop.js`, `src/game/dev.js`, `src/game/abilities_runtime.js`
(two comments), `src/game/app/systems/ui.js`,
`src/game/app/systems/abilities.js`, `src/game/app/systems/inventory.js`,
`src/game/app/systems/world_life.js`, seven `*.test.mjs`, and this note.

`src/mmo/abilities.js`, `src/game/gear_visuals.js`, `src/game/combat.js`,
`src/game/chests.js`, `src/game/win_settings.js` and `src/game/context_menu.js`
were read and not edited.

---

## 1. What was there

A row of four cells at the bottom of the screen: HAND, AXE, PICKAXE, BOW, keys
1 to 4 printed on them. Clicking one wrote `state.tool`, which is
`character.heldTool` on the document. `interact.js` compared that word against
a per field table and refused anything else.

Two things were wrong with it, and they are the same thing twice.

**It was a second inventory that nobody asked for.** The axe was already in the
main hand on the paper doll, the pickaxe already in the pack, and yet neither
did anything until a cell had also been clicked. A player who bought an axe and
walked to a tree was told "you need an axe".

**It contradicted the rest of the game.** Melee, ranged and casting have never
looked at the row: `weaponCheck` in `src/mmo/abilities.js` reads
`character.equipment.mainHand`, `offHand` and `ranged`, and `gear_visuals.js`
draws whatever is in those slots. Skinning already read the doll and the pack
through `knifeOf`, and a chest lock already counted lockpicks in the pack. The
row was the only system in the game that made you say a second time what you
were already carrying.

The keys were contended too. The ability bar wants 1 to 0, minus and equals;
the row wanted 1 to 4 of those. It was settled by leaving the row click only
and saying so in three comments, which is a rule held together by prose.

## 2. The rule now

One function, in one pure module, `src/game/tools.js`:

```
toolFor(kind, character, { dev, noun }) -> { ok, id, name, where, need, want, reason }
```

`kind` is `chop`, `mine`, `skin`, `forage` or `swing`. The answer is looked for
in this order, and the first hit wins:

1. **the item bar's selected slot**, when the base on it can do this work
   (`where: 'bar'`);
2. **the paper doll**, main hand, off hand and ranged first, then the other
   eleven slots (`where` is the slot's name);
3. **the pack** (`where: 'pack'`);
4. **dev mode**, which carries one of everything (`where: 'dev'`);
5. **bare hands**, for work that wants no tool (`where: 'hands'`).

When none of those answers, `ok` is false and `reason` is the sentence the
player reads, which names the tool and where it is not:

> A tree wants an axe, and there is none in your pack.

The table it reads is `GATHER`, and `auditTools()` runs at import and throws if
any tool a kind asks for is not a real base in `items.js`. That is the guard
against the class of bug where the axe and the pickaxe drift apart, which is
what happened when four biomes shipped tools that did nothing.

### What each kind of work needs

| work | what it wants | what happens with nothing |
| --- | --- | --- |
| chop | an `axe` | "A tree wants an axe, and there is none in your pack." |
| mine | a `pickaxe` | "A boulder wants a pickaxe, and there is none in your pack." |
| skin | a `skinning_knife`, else a `dagger` | "You need a dagger in hand or a skinning knife in your pack to skin the wolf." |
| forage | nothing | it cannot refuse: hands pick a plant |
| swing | an `axe`, else a `pickaxe` | it cannot refuse: bare hands are a swing |

The noun in the refusal is the caller's, so a cherry tree says cherry tree and
an ore seam says ore seam. `skin` keeps the exact sentence `skinning.js` was
already saying, because a player who has read a refusal once should not have to
learn a second wording for it.

`swing` is the farmstead's hunting swing in `combat.js`, which weighs a blow by
the word `hand`, `axe` or `pickaxe`. That path is **unreached** today (F1: an
animal is a tier 0 monster and a click on one goes through
`app/systems/input.js`), and it is wired here anyway so that it cannot be the
last thing left reading a `state.tool` that nothing writes. `WORK_WORD` has no
entry for it, so the line item\_bar.js says when a tool is chosen never promises
a player that their choice changed how they fight.

## 3. What "selected" means

`character.itemBarSlot` is the index of the item bar slot the player last
pressed **that held a tool**, or null. `item_bar.js` is the only writer.

- Pressing a slot holding a tool selects it and says so:
  "Pickaxe chosen. Mining goes through it now."
- Pressing it again says "Pickaxe is chosen already. Mining goes through it."
  rather than going quiet.
- A potion is still drunk and a helm is still worn, and neither moves the
  selection: a light on the HUD that decides nothing would be a lie.
- A tool no work reads (a lockpick, tongs) is refused with
  "Lockpick is not something you choose. It is used out of your pack the moment
  it is wanted." The lock already takes one out of the pack itself.
- Clearing the slot, or burying it under something that is not a tool, puts the
  choice down and says what that means: "and is no longer the tool you chose,
  so what you carry decides again."
- Dragging the same tool to another key keeps it chosen, and says so.

The HUD draws it as a brighter edge and a lit corner on that one cell, class
`chosen`, and its hover reads "the tool you chose. It is what the work goes
through."

**It survives a reload now.** `character.itemBar` and `character.itemBarSlot`
were written onto the document by `item_bar.js` and thrown away by `hydrate`,
so the whole bar emptied on every load. That was survivable while a slot was
only a shortcut; it is not survivable when a slot decides which tool fells a
tree. Both are in `blankCharacter` and both are carried through `hydrate` now.

## 4. What was taken out

- `hud.js`: the `TOOLS` list, the `#bw-tools` stylesheet block, the row's DOM
  node and its four slots, `setTool` and `onTool`. They are gone rather than
  left as no-ops, and `hud.test.mjs` checks the source for `bw-tools`,
  `onToolPick` and `setTool(` so they cannot come back quietly.
- `app/systems/ui.js`: `pickTool`, the `hud.setTool` call in `drawHud`, and the
  comment explaining why the row was click only.
- `app/systems/abilities.js`: the `setTool` hook passed to `createItemBar`.
- `interact.js`: the whole `wrong_tool` branch, and the line
  "a pickaxe is no use on an oak". **You cannot hold the wrong tool when the
  work is what picks it**, so the refusal asks for what the tree wants instead
  of complaining about what you have.
- `state.js`: the `tool` setter, and the `heldTool` write inside `giveTool`.

## 5. What stayed, and why

`state.tool` is still there as a **getter**, reading `doc.heldTool`, so a save
written when there was a row still opens and can still be looked at. Nothing in
the game reads it to decide anything and nothing writes it. There is
deliberately no setter: an assignment throws rather than quietly writing a field
that no longer means anything, and `state.test.mjs` drives that.

`state.boughtTool`, `state.tools` and `state.hasTool` are untouched. The market
still sells the axe once, for 60 coins, and `giveTool` still puts the axe on the
doll, the bow in the ranged slot and the pickaxe in the pack. What changed is
the line it says:

> you buy the axe for 60 coins. It goes to your hand, and it works from there:
> nothing to pick up first.

because a player who bought a tool and was told nothing would go looking for the
row that is not there any more.

## 6. Dev mode

Dev mode used to say "Every tool is in hand". There is no hand, so it says
"Every tool counts as carried", and it means it: `toolFor` takes a `dev` flag
and answers with the tool the work wants from nowhere. `interact.js` passes
`state.dev`, and `app/systems/inventory.js` passes `() => state.dev` into
`createSkinning`, so the lens that lends you an axe lends you a knife too. When
it comes off, nothing has to be put down, because nothing was ever taken up: the
next click reads the pack and the doll again.

## 7. The keys

1 to 0, minus and equals are the ability bar's outright. F5 to F12 are the item
bar's. R is the thirteenth cell. F1 and backquote are dev. Nothing else on the
HUD wants a number, and `hud.test.mjs` and `wiring.test.mjs` both drive that
rather than take it on trust:

- `wiring.test.mjs` reads the whole boot and fails on `pickTool`, `hud.setTool`,
  `hud.onTool` or `setTool:` appearing anywhere in it;
- and on any `pressed('1')` style binding of a digit outside the bar.

## 8. Verified

Measured, not asserted. Every suite below was run with `node <file>` and its
exit code read.

- **`src/game/tools.test.mjs`** (new), 53 checks, exit 0. Every kind driven four
  ways: carried in the pack, selected on the bar, worn on the doll, and nowhere
  at all; the refusal sentence compared letter for letter; dev mode driven true
  AND false; and the selection driven with an empty slot, an index off the end
  of the bar, and a fractional index.
- **`src/game/item_bar.test.mjs`**, 108 checks, exit 0. A press on a tool slot
  chooses it with no hook wired to anything; the document remembers it; the view
  lights that cell and no other; a second press says "chosen already"; a
  lockpick is refused with words; clearing, dragging and burying the chosen slot
  each say what happened; and putting the choice down on its own says what that
  means, while putting down a choice nobody made says nothing and changes
  nothing.
- **`src/game/hud.test.mjs`**, 266 checks, exit 0. No `TOOLS` export, no
  `setTool`, no `onTool`, no `bw-tools` node in the built HUD and no `bw-tools`
  in the source; 1 to 4 are the bar's first four keys and no other bar wants
  them; the chosen cell lights and goes out again against the real item bar.
- **`src/game/interact.test.mjs`**, 160 checks, exit 0. `decide` takes a
  character now: an empty pack, a pack with only the other tool, a bow, the doll,
  the pack, dev on and dev off. On the real path: the cursor says "oak, and no
  axe in your pack" before the click ever refuses, the refusal names the tree and
  the axe and the market, and **the moment the axe is in the pack the same click
  chops with nothing pressed in between**. A real `createItemBar` writes a real
  selection onto `state.character` and the cursor changes to "boulder, the
  pickaxe you chose", and the click mines with `where === 'bar'`.
  `auditHarvestDrops` gained a check that every field kind names a piece of work
  `tools.js` has a rule for and that the work wants a tool, and it is driven
  false both ways with a made up `hedge` field, so a third kind of field cannot
  ship falling through to the axe.
- **`src/game/state.test.mjs`**, 281 checks, exit 0. An old save carrying
  `heldTool: 'pickaxe'` loads, keeps the field, and mines with the pickaxe out of
  its pack; one claiming a tool it does not carry cannot mine with it; a save
  from before the item bar existed loads with no choice made; `s.tool = 'axe'`
  throws and changes nothing; the item bar and the chosen slot survive a save and
  a load, and `toolFor` then answers `'bar'`.
- **`src/game/wiring.test.mjs`**, 152 checks, exit 0. The real state, the real
  interactor and the real audio: only a pickaxe cannot fell an oak and the
  refusal asks for the axe by name and is heard as a denial; then `giveTool`
  puts an axe in the pack and the very next click chops and the axe is heard.
- **`src/game/shop.test.mjs`**, 96 checks, exit 0. The bought axe lands on the
  doll rather than in a row, the line says it works from there, and `toolFor`
  says it really chops.
- **`src/game/skinning.test.mjs`**, 105 checks, exit 0. `knifeOf` is
  `toolFor('skin')` now, and the lens that lends an axe lends a knife too, so
  dev mode cannot fell a tree and then refuse to skin what it killed.
- **`src/game/foraging.test.mjs`** (141), **`src/game/inventory.test.mjs`**,
  **`src/game/combat.test.mjs`**, **`src/game/context_menu.test.mjs`**,
  **`src/game/win_bag.test.mjs`**, **`src/game/windows.test.mjs`**,
  **`src/game/abilities_runtime.test.mjs`**, and every other suite that imports
  a file touched here (`flora`, `dragon`, `win_emotes`, `actor`, `compass`,
  `roster`, `roster_preview`, `win_dev`, `progression`, `con`, `wyrmsoul`,
  `mmo/events`, and the two under `app/systems`): all exit 0, found by grep for
  the imports rather than guessed at.
- `npx vite build` completes.

### Not verified here

Nothing was run in a browser: the reviewer drives that. So the appearance of the
chosen cell's lit corner, and the fact that the bottom of the screen no longer
has a gap where the row used to be, are unmeasured. Everything else above is a
count from a run.
