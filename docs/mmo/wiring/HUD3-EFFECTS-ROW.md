# HUD3 wiring: the effects row, the compass coordinates, and a purse of pictures

Files owned and changed: `src/game/hud.js`, `src/game/hud.test.mjs`,
`src/game/compass.js`, `src/game/compass.test.mjs`,
`src/game/app/systems/ui.js` (the HUD wiring only), and this note.

Read and deliberately not edited: `src/game/abilities_runtime.js`,
`src/game/combat.js`, `src/mmo/abilities.js`, `src/game/icon_art.js`,
`src/game/ui_theme.js`, `src/game/app/systems/combat.js`,
`src/game/app/systems/abilities.js`, `src/game/app/context.js`. The dragon
files and `models.js` were not touched at all.

Three requests, in the user's own words:

1. "when casting a protective spell or using any ability that applies an effect
   on ourselves such as healing etc.. we need to show this effect as active
   buff while its active, maybe as an icon row next to resources list."
2. "move compass coordinate hud to the right, its conflicting with zone names"
3. "show icons instead of text labels for resources. i'll generate art for gold"

---

## 1. The effects row

`#bw-auras`, under the pools in the top left column. One square per thing
running on the player: the ability's own painting, a gold edge for a buff and a
red one for a debuff, a bar along the bottom draining with the time, the
seconds printed over it in the last ten, and the ability's own line from
`abilities.js` on the hover.

### The five places an effect can be kept

This is the whole of the problem. Nothing in the game kept a list of "what is
on the player"; five different systems each kept their own, in their own shape,
on their own clock, and none of them knew about the others.

| where | written by | shape | clock |
| --- | --- | --- | --- |
| `actor.buffs` | `abilities_runtime.addBuff`, read through `buffsView(nowS)` | `{ id, abilityId, name, kind: 'buff' \| 'debuff', remaining }` | the player's seconds |
| `actor.status` | `combat.js applyStatus`, `abilities_runtime.statusOn` | `{ poison: { level, perSecond, until, nextTick, seconds } }` | **world milliseconds** |
| `actor.meditating` | `doUtility`, action `meditate` | `{ since, manaRegenMult, breaks }` | none, it lasts until you move |
| `actor.hidden` | `doStealth` | `{ since, requiresStill, movementNeedsSkill, abilityId }` | none |
| `actor.absorb` | `doAbsorb` (Mana Shield) | `{ source, ratio, until, abilityId }` | the player's seconds |
| `actor.enchant` | `doWeaponEnchant` | `{ damageType, mult, until, hitsLeft, abilityId }` | seconds, or `Infinity` when it is counted in hits |
| the binding | `abilities.channelling`, the cast record | `{ abilityId, name, startedAt, endsAt, castTime, rooted, ... }` | the player's seconds |

`hud.effectsView(view)` is the one place that reads all seven and hands back one
list. It is pure and exported, so the gathering is tested without a document.

### The buff record, exactly as the runtime writes it

`addBuff` in `abilities_runtime.js` pushes:

```js
{
  id: `${ability.id}:${now.toFixed(3)}`,   // 'stoneSkin:0.600'
  abilityId: 'stoneSkin',
  name: 'Stone Skin',
  kind: 'buff' | 'debuff',
  until: now + duration,                   // Infinity for a channelled hold
  effect, mods, stats, form, channelled,
}
```

and `buffsView(now)` flattens that to `{ id, abilityId, name, kind, remaining }`
with `remaining` `Infinity` when `until` is. A refresh **replaces**, it does not
stack, so one ability is always one square. There is no `duration` on the view,
so the sweep takes the longest time it has ever seen that key carry, which is
also right across a refresh; `abilities.js`'s own `effect.duration` seeds it on
the first frame where the ability declares one.

### The cast record is FLAT

The first draft of `effectsView` read `binding.ability.id`. The record has no
`ability` on it at all: it is `abilityId` and `name`, side by side with
`endsAt` and `castTime`. Written that way, the bandage square would never have
appeared and nothing would have thrown. It was caught by driving a real
`createAbilities` in `hud.test.mjs` rather than by reading the code again, and
there is now a check in that suite whose only job is to fail if that record
ever grows an `ability` object or loses `abilityId`.

### Passives

`actor.passives` is never read, and any record whose `abilityId` names an
ability with `passive: true` is refused by id. A passive is always on, so its
square would never leave, and a row that never changes is furniture. Both
directions are driven: a passive handed to the row **as a buff** still produces
no square.

### Statuses

`STATUS_EFFECTS` in `hud.js` gives poison, bleed, stun, root, slow and plague a
name, a drawn mark, a colour and a line saying what the thing does to you. A
status id with no entry still draws, with its own id for a name, and
`hud.test.mjs` walks every `.js` file under `src/game` for `applyStatus(` and
`statusOn(` call sites and fails if it finds an id that has no entry. That is
the "add the check that fails loudly when a fifth appears" guard.

### The clocks

`app/systems/abilities.js` runs the abilities runtime on `frame.nowS`, the
PLAYER's clock. `app/systems/combat.js` runs `combat.js` on `frame.worldNow`,
the WORLD clock, which the dragon slows. So `ui.js` passes
`nowS: nowS` and `nowMs: frame.worldNow ?? now`, and `effectsView` measures each
source against the clock it was written with. Reading a poison against
`frame.now` would have counted it down at the wrong rate for the whole of
dragon time, which is exactly when a player is watching the row.

### The cost of a frame

The set of effects changes rarely. The picture, the name, the edge colour and
the title are re-strung only when the KEYS change; on every other frame the row
writes the bar's width and, at most, the seconds. Squares are made once and
kept: an effect that ends hides its cell, it does not destroy it. Measured, with
a document that counts: three effects held over two frames produce **0 new
nodes and 0 string writes**, and one second off a bleed produces **exactly 1**.

---

## 2. The compass coordinates

What the user saw was `...ND AT 1209, -226` printed through `MARLFIELD`. Two
separate things were wrong and both are fixed.

**The coordinates were part of the waypoint's name.** `context_menu.js` names a
mark on open ground `the ground at 1209, -226`, and the marker prints the name
in the middle of the track, which is where the marker sits when you are facing
the thing you marked. `markerName()` drops a trailing coordinate clause and cuts
anything over eighteen characters, so the marker prints `◆ the ground`. The
frame still carries the full `name` beside the `short` one, so nothing that
reads the frame loses information.

**The strip was at a guessed offset.** `#bw-compass` was
`position:absolute; top:38px`, and the place plate's own box runs from 14px to
47.55px (one 13px line at 1.35, in a panel with 7px of padding and a 1px
border). The strip was therefore inside the plate by nearly ten pixels, and
inside the target frame below it too. The strip is now a row in the HUD's own
top centre column: `hud.compassSlot` sits between `#bw-place` and `#bw-target`,
`ui.js` hands it to `createCompass` with `flow: true`, and the layout stacks all
three. The class of bug, not the instance.

**The strip is three cells.** A side cell, the bordered 300px track, and another
side cell the same width, so the track stays centred on the screen and the
middle of it is still exactly where you are looking. The distance is in the left
cell and where you stand is in the right one, right aligned at the far end.
Everything with a number in it is out of the middle.

`hud.js` exports `TOP_CENTRE`, `PLACE_H`, `COMPASS_SLOT_TOP`, `placeBox()` and
`boxesOverlap()`; `compass.js` exports `COMPASS_H`, `COMPASS_SIDE_W`,
`COMPASS_STRIP_W`, `coordBox()` and `trackBox()`. The two suites measure the
boxes against place names up to `THE GREAT NORTHERN WOODLANDS OF MARLFIELD` at
1920 wide, with a deliberately over-wide estimate of a Cinzel character, and
prove the same measurement DOES report an overlap at the old 38px offset.

---

## 3. The purse

`562 GOLD  0/150 WOOD  0/150 STONE  0/150 ORE` was four words of uppercase
Cinzel taking more room than the numbers they labelled. Each cell is a picture
and a number now, with the word on the title.

Every cell falls back, in order:

| cell | first | then | last |
| --- | --- | --- | --- |
| gold | `icons/hud/gold.webp` | | `COIN_MARK`, a drawn gold coin |
| wood | `icons/hud/wood.webp` | `icons/items/oak-log.webp` | `LOG_MARK` |
| stone | `icons/hud/stone.webp` | | `STONE_MARK`, a drawn block |
| ore | `icons/hud/ore.webp` | `icons/items/iron-ore.webp` | `ORE_MARK` |

`public/icons/hud/` does not exist yet. Dropping `gold.webp` into it is the
whole of the work needed to see the user's own art; until then the img raises an
error, the next candidate is tried, and the drawn mark is written in when the
candidates run out. That does mean up to four 404s in the console at boot, once,
which is the price of "the art lands by dropping the file in".

The cells are built ONCE. The purse used to be one `innerHTML` string rebuilt on
every state change, which with pictures in it would have asked the browser for
four files again every time a coin moved. `setMaterials(m, c)` and
`setCoins(c)` keep their signatures; drawing the same purse twice writes nothing
at all, and one coin moving writes exactly one string.

---

## What was measured

`node src/game/hud.test.mjs` 270 passed, 0 failed, exit 0.
`node src/game/compass.test.mjs` 86 passed, 0 failed, exit 0.
`node src/game/wiring.test.mjs` 128 passed, 0 failed, exit 0.
Every other suite under `src/game`, `src/game/app/systems` and `src/mmo` exits
0. `npx vite build` exits 0.

## What was not measured

Nothing was run in a browser. Everything above is node against a fake document
plus the real `createAbilities`, so the numbers are real and the pixels are
arithmetic on the CSS constants rather than a screenshot. Three things in
particular want a look with eyes:

* the 27px squares with 512px ability art scaled into them, and whether the
  drained bar reads at that size;
* the four resource pictures at 19px, and the drawn fallbacks in particular,
  which have only ever been rendered as strings here;
* the strip at 492px wide in a narrow window, where `#bw-tc`'s `max-width: 60vw`
  is less than the strip and the row will overflow the column rather than shrink
  (it is centred, so it overflows evenly, and nothing clips it).
