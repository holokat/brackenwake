# CR3: the right click, and a face that is one choice

The user's words, verbatim:

> let's have contextual menus in game too, for example, right clicking on player
> can bring up the emote menu. we wont have character builds, skin and hair yet
> i dont have the time to generate so many models (i'm working on 3d models for
> characters), the only thing we'll have for now is gender, male or female.

Two things, and the second one is smaller than it looks.

```
src/mmo/openings.js                    APPEARANCE.genders, and the default
src/game/creation.js                   two pills where six selects were
src/game/player.js                     setAppearance keeps the gender
src/game/context_menu.js               menuFor, and the list at the cursor
src/game/app/systems/context_menu.js   a ray to a target, and the wiring
src/game/app/systems/input.js          the right button, four lines
src/game/app/systems/index.js          one more system in the list
```

---

## 1. The face is one choice, and the other five did not leave the save

`APPEARANCE` grows `genders: ['male', 'female']`, `APPEARANCE_DEFAULT` grows
`gender: 'male'`, and `validateAppearance` checks it exactly as it checks the
other five. **Nothing was removed from the table.** `build`, `skin`,
`hairStyle`, `hairColour`, `mark` and `height` are still there, still validated,
still written into every character `planCharacter` makes, and still what
`state.js` fills a loading save in with, so a character made before today loads
with no error and the day the models arrive the controls come back rather than
the records being invented a second time. What changed is the screen.

The middle column under the rig was six labelled selects in a three by two
grid. It is two buttons now:

```
                        <   >
                  [ MALE ] [ FEMALE ]
```

The chosen one is lit gold (`.bw-cr-pill.on`), the pills are rebuilt with the
rest of the middle column whenever the class changes, and a click calls
`paintGender()` itself, because `refresh()` does not rebuild that row and a
pill that only lit on a change of class would be a button that looks broken.
The two arrows are untouched, and `YAW_STEP` is still 30.

The height slider went with the rest. `state.appearance.height` stays at
`APPEARANCE.height.default`, which is 1.75, and the render loop still scales the
rig by it, so the framing measured in CR2 is the framing that is still there.

### What `setAppearance` does with it

Nothing you can see, on purpose, and it says so where it does it:

```js
function setAppearance(a) {
  const next = { ...APPEARANCE_FALLBACK, ...(a || {}) };
  if (!GENDERS.includes(next.gender)) next.gender = APPEARANCE_FALLBACK.gender;
  ...
  rig.appearance = next;
}
```

`GENDERS` is exported from `player.js` and `auditAppearance` fails loudly the
day `openings.js` offers a third gender this file has no body for, the same way
it already fails for a thirteenth hair style. The model swap, when it comes, has
exactly one place to land: `rig.appearance.gender`.

Measured, on a real rig, by walking every mesh in traversal order and comparing
the whole position buffer and the world matrix of each:

| what was set | meshes | vertices | moved |
| --- | --- | --- | --- |
| `gender: 'female'` | 34 | 3512 | **none** |
| back to `gender: 'male'` | 34 | 3512 | **none** |
| `build: 'heavy'` | 34 | 3512 | mesh 0's world matrix, 1 to 1.2 |

The third row is the point of the first two: the comparison can fail, so the
two zeroes are a measurement and not a broken check.

## 2. The right click

### What it used to do, and it was not nothing

`input.js` prevents the browser's own menu on the canvas and then reports a
right press as a click like any other. Driven through the real `createInput`
against a fake canvas:

```
right click ->  {"px":400,"py":300,"button":2}
left click  ->  {"px":400,"py":300,"button":0}
right drag  ->  null            (drag dx 60: a drag emits no click)
contextmenu listener on the canvas: 1, and it prevents the browser menu: 1
```

`main.js` runs `systems.click(ctx.aim(), f)` for any click at all, and the
router in `input.js` never read `button`. So **a right click on a wolf started a
fight and a right click on bare ground called one off.** `targeting.js` was the
only thing in the game that had noticed, and it gates itself on `button === 0`.
A right press that turns into a drag still rotates the camera and still opens no
menu, because it never becomes a click.

### The model

`menuFor(target, game)` is pure: a target and the game's own handles in, an
ordered list of rows out, no document, no THREE and no clock of its own.

```js
{ id, label, hint, disabled, why, run }
```

A row that cannot run right now is **dimmed and kept**, with `why` as its
tooltip, because a menu that hides Skin says nothing about the knife you are not
carrying and a menu that dims it says exactly that. A dimmed row's `run` is
replaced with one that answers `{ ok: false, why }`, so a dimmed row cannot
reach the real function even if something calls it.

| target | rows, in order |
| --- | --- |
| `player` | Emotes, Sit down, Wave, Character sheet, Inventory |
| `monster` | Attack the X, Inspect the X, Target only |
| `npc` | Talk to X, Trade (if the role sells or buys), Train (if it teaches) |
| `corpse` | Skin the X, Loot |
| `ground` | Place a waypoint here, Clear the mark on X (only when there is one) |
| `item` | Take, Take all |
| `dragon` | Feed X, Pet X, The dragon |

Every `run` is a call into the function the rest of the game already uses:
`windows.open('emotes')` is the wheel X opens, `emotes.start('sit')` is where
the sit's line is written, `combat.startAttack` then `combat.swingAt` is what a
double click does, `loot.take(bag, takeLoot)` is what a click on a sack does,
`skinning.skin` is what the knife does, `win_map`'s own `setWaypoint` is the one
place a waypoint is ever written, and `dragon.feed` is the only feeding path.
There is no preview and no second code path.

**So nothing in this file says a line about a state change except Pet**, which
is the one action here that no other door leads to. Everything else is spoken
for by the function it called.

### Inspect, and the numbers it does not invent

`monsterLines(mon)` reads `mmo/monsters.js`'s own row and the live actor. A wolf
comes out as six lines:

```
Wolf, tier 2 . beast, normal . 40 of 40 health . hits for 6 to 11 .
attacks at 38, defends at 35 . night, group
```

Those are the tooltip. Running the row says all six in the log. No window.

### Pet, and why it has a cooldown

`dragon.js` has no petting event and this agent does not own it, so `PET_BOND`
is the one number CR3 invents. It is 1, which is `BOND_GAIN.hitTogether`, the
smallest gain the dragon has, and it is on a 60 s cooldown for the reason
feeding is: without one a menu row is a Bond of 100 in twenty seconds of
clicking. Inside the cooldown it pays nothing **and still says so**, because a
click that changed nothing must not be silent. `character.dragon` is the record
the entity holds by reference, so the point written here is in the save on the
next save tick, and `state.touch('dragon')` is called.

`PET_CUE` is `'dragonChirp'`. **`audio.js` has no such cue**, so nothing plays;
the row is named against `CUES` rather than guessed, so the day a chirp is
recorded this is the one line to change. The suite checks both halves: that
`CUES[PET_CUE]` is absent, and that no cue was played.

### There is no Walk here, and that is not an oversight

Brackenwake has no click to move. `app/systems/player.js` builds its move vector
out of W, A, S, D, shift and space and hands it to `rig.update(dt, move,
heightAt)`; nothing anywhere takes a destination. A Walk here row would need a
path, a follower and a way to cancel it, none of which exist, and a row that
quietly did nothing would be the broken button CLAUDE.md keeps naming. The
ground menu is the waypoint, and the comment in `groundRows` says where a mover
would go in.

### The one seam into a window this agent does not own

`win_talk.js` opens on its Talk tab and takes no tab in its `extra`. So Trade
and Train open the panel the real way, `windows.open('talk', { npc })`, and
**then** set `_tab` on the registered panel object, which is the same object the
window manager just called `open` on. If the panel is ever given a tab in its
`extra`, this becomes one argument and the reach goes. With no panel object to
reach, it falls back to the Talk tab and returns `{ tab: 'talk' }` rather than
pretending.

The map panel has a second, smaller seam: it is handed the panel context when it
is **built**, which only happens the first time the map is opened. A waypoint
placed from the ground before that would have written to nothing at all, in
silence. `mapPanel()` fills `_ctx` in first, with the same object the build would
have handed it. Driven in the suite with a map that has never been opened.

## 3. The list itself

A compact codex-styled list at the cursor: a header naming what the menu is
about, one button a row, hover highlights, `MENU_SIZE.w` of 190 px, kept
`MENU_MARGIN` (6 px) inside the window at both corners.

**The keys are taken in the capture phase and stopped there.** `input.js`
listens for keydown on `window` in the bubble phase, so a listener on `window`
with `capture: true` sees the key first and `stopPropagation()` there means it
never comes back up. Without that, Escape would close this menu **and** the top
window behind it, and the arrows would go to whatever else reads them.

**A pointer down outside closes it and is eaten**, stopped and default
prevented, for the same reason: the click that dismisses a menu must not also be
a click on the wolf standing behind the menu. The cost is that you cannot start
a camera drag on the frame you dismiss the menu; one click dismisses, the next
one drags. A press *inside* the menu is left alone, and losing window focus
closes it.

Arrow keys step over the dimmed rows rather than landing on them and wrap at
both ends. Enter runs the highlighted row and closes. A click on a dimmed row
runs nothing and leaves the menu up.

## 4. The hook, and the order of a right click

`app/systems/input.js`, in `click`, after the shop, the dev camera and the death
screen have had their say and before the router:

```js
if ((ctx.input.click?.button || 0) === 2) {
  return ctx.has('context_menu')
    ? ctx.get('context_menu').openAt(ray, ctx.input.click.px, ctx.input.click.py)
    : false;
}
```

A right click never routes. `context_menu.resolve(ray)` answers with one of
seven targets, and **this order is not the left click's order**: a left click
resolves a held spell first, because it is choosing a victim, and a right click
never is.

```
a sack, a person, the dragon, a body, a live monster, yourself, the ground
```

Yourself is new. Nothing in the game raycast the player's own rig before this,
and a right click on the player was the first thing the user asked for. A hidden
rig is not a target, so first person does not right click on itself. An empty
ray is the ground, at the point `targeting.groundPoint` puts under the cursor.

**The bar's right click is still the bar's.** The ability bar, the item row and
the pack each listen for `contextmenu` on their own cells to clear a slot. Those
cells are in the HUD layer over the canvas, so their event never reaches the
canvas listener and this hook never sees it. Named and checked in the suite.

### The console

```js
window.__bw.contextMenu.open({ kind: 'player' }, 400, 300)
window.__bw.contextMenu.rows            // the rows on screen
window.__bw.contextMenu.resolve(__bw.aim && __bw.aim())
window.__bw.contextMenu.key('ArrowDown')
window.__bw.contextMenu.activate()
window.__bw.contextMenu.close()
```

`open` is the same function the click calls, `key` goes through the real
listener, and `activate` runs the real row. There is no harness path.

### Where it sits in the list

```
frame order  world player emotes combat abilities inventory world_life dragon ui context_menu dev input
build order  world player combat inventory abilities ui emotes world_life dragon context_menu dev input
```

After `ui`, because the menu is drawn beside the window layer's own document and
reaches the registered panels through it. It has **no per frame hook at all**: a
menu is not a frame. `wiring.test.mjs` holds both strings, and those two
expectations are the only lines changed in a file this agent does not own.

## 5. What was measured

`npm test`: **ALL SUITES GREEN**. `npx vite build`: clean, 136 modules.

| suite | checks | before |
| --- | --- | --- |
| `src/mmo/openings.test.mjs` | 75 | 68 |
| `src/game/creation.test.mjs` | 209 | 206 |
| `src/game/player.test.mjs` | 118 | 108 |
| `src/game/context_menu.test.mjs` | 95 | new |
| `src/game/app/systems/context_menu.test.mjs` | 32 | new |
| `src/game/wiring.test.mjs` | 178 | 178 |

- **The appearance.** Two genders in order, male the default, both validate, an
  unlisted one refused by name and by count, a record with no gender at all
  refused rather than guessed, and the same record read the way `state.js` reads
  a save coming back male. The five the screen dropped are still whole in the
  table.
- **The screen.** Two pills, both buttons, `data-look="gender"`, MALE and
  FEMALE, **zero selects left anywhere in the document**. Male lit on open,
  clicking female lights female and puts male out, the planned character carries
  it, clicking back is male again, and the five dropped fields are still written
  at their defaults. A change of class keeps the gender and keeps it lit.
- **The rig.** The table in section 1.
- **The model, both directions on every conditional row.** Walking dims Sit and
  Wave and dying dims them with a different reason, while the wheel, the sheet
  and the pack stay live. A dead monster dims Attack and Target and leaves
  Inspect, a monster already targeted dims Target only. A provisioner teaches
  nothing so there is no Train row; a weaponsmaster sells nothing so there is no
  Trade row. Past `TALK_REACH` every npc row is dimmed with the distance
  counted, and one step closer they are all live. No knife, an already skinned
  body, an iron golem and a body past `SKIN_REACH` each dim Skin with their own
  reason. One sack in reach dims Take all; a sack past `BAG_REACH` dims both. A
  fallen dragon dims Feed and Pet and leaves the window. No mark on the map and
  there is one ground row; a mark, and there are two.
- **The calls, not the labels.** Attack logs `target:Wolf:menu > startAttack:Wolf
  > swingAt:Wolf@100000`, in that order. Take all opens two sacks, this one
  first, each through the same `take`. Pet moves the Bond by exactly 1, says the
  new number, touches the save, pays nothing on a second fuss inside 60 s and
  says that too, pays again past it, and cannot be pushed past 100.
- **The list.** Six children for five rows and a header, the two dimmed rows
  drawn dimmed and wearing their reason while a live one wears its hint, the
  highlight starting on the first row that can run, one step down skipping both
  dimmed rows, wrapping at both ends, exactly one row painted, Enter running the
  row and closing. Escape through the real window listener closes and stops the
  key once. An outside press closes and is eaten once; an inside press does not.
  A click on a dimmed row runs nothing. A menu at 1270, 715 in a 1280 by 720
  window is pulled to 1084, 560; one at -40, -40 is pushed to 6, 6. Dispose
  leaves no node and no listener.
- **The wiring.** The real `create` driven against stub systems: all seven rays
  resolve to their own kind, a hidden rig and a hidden dragon are not targets, a
  sack and a person beat the rig behind them, an empty ray is the ground at the
  cursor's point, and the waypoint is written through a map panel that has never
  been opened.

## 6. What is not verified

- **Nothing was run in a browser.** The list is built against a fake document
  and driven through the real listeners, which is where the behaviour lives, but
  how it reads over the world, whether 190 px is wide enough for
  `Attack the Vampire Knight` at the font it ended up with, and whether the gold
  pills under the rig sit where they should at 1280 are Fable's to look at.
- **The right click has not been pressed in a real browser.** The button, the
  pixels and the prevented default were measured through the real `createInput`
  in node; that `ctx.aim()` in the running game resolves the ray to the same
  thing under a real cursor is the one hop between them that no test covers.
- **The talk tab.** The seam in section 2 is driven against a stub panel with
  `_tab` and `render`. The real `win_talk` panel has both, and the reach is the
  registered copy the window manager calls `open` on, but nothing here has
  opened the real panel and read its tab back.
- **The Blender models.** The whole point of the gender pill is a model swap
  that does not exist yet. Today the choice is recorded and draws nothing, which
  is what the screen and this document both say.
- **A chirp for the fuss.** `audio.js` has no dragon voice. Pet is a line in the
  log and nothing in the ear.
