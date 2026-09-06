# S3: the roster as a list of people, each with their own face

The character select screen was a grid of cards: name, opening, three skills,
purse, place, last played, Play and Delete, one card per save slot. Four
characters read as four products in a shop window, and none of them looked like
anybody, because none of them showed a body.

It is now a vertical list, one full width row per character, and each row opens
with a small render of that character: their own body, their own gear, posed in
the idle the game itself stands them in.

```
src/game/roster.js            the list, the rows, the keyboard, the CSS
src/game/roster_preview.js    new: the framing, the render, the cache, the silhouette
src/game/roster.test.mjs      extended: rows, order, faces, the cache, up and down
src/game/roster_preview.test.mjs  new: the framing against a real rig, the cache
```

Nothing else changed. `main.js` calls `createRoster` exactly as it did, and
every function `roster.js` exported before still exists with the same shape:
`CARD_ICONS`, `auditRosterIcons`, `agoWords`, `UNNAMED`, `cardOf`,
`createRoster` and its default export. Play and Delete are untouched, including
the two press confirmation and the words it says: "goes for good, with
everything they carry. Press it again."

---

## 1. What a row shows

Left to right, five cells in one grid so every row lines up down the page:

```
[ face ]  Mab              ARCHERY 61.25   coin  250 gold      [ Play  ]
          RANGER           MINING  10      boot  Saltmere      [ delete ]
                                           book  3 hours ago
```

* the portrait, 92 by 126 CSS pixels, in a thin gold frame
* the name in Cinzel, the opening under it in small caps gold
* the three best skills as chips, the skill in small caps and the number in gold
* the purse, the place and how long ago, each behind the icon it always had
* Play and Delete, stacked at the right hand end

A character who was begun and never finished keeps their sentence in the same
cell as the name: "This one was begun and never finished. Play takes you back
to the making of them." A character with no name is still `Nobody yet`, and a
character who has learned nothing still reads "Nothing learned yet." The count
line over the list and the empty state under it are the sentences they were.

The New character row is last, dashed as before, and now carries the same empty
frame the unmade slots wear so it lines up with the rows above it rather than
starting further left.

The row in hand is lit in `theme.gold`: the border, a four pixel gold edge
inside the left rule, and a warmer ground. Up and down walk the list, left and
right still do the same thing so nothing that worked before stopped working,
and Enter plays the row that is lit. Escape still does nothing, on purpose.

Under 900 px the row folds to three columns: the face on the left, the name,
the chips and the facts stacked in the middle, the buttons on the right.
Nothing is dropped, because a roster that hides where a character was standing
has stopped being the screen that tells you who you have.

## 2. How a portrait is made

`roster_preview.js` owns it, and it invents nothing:

* the body is `player.js`'s `buildCharacter(appearance)`, scaled by
  `height / 1.80` exactly as `creation.js` scales its own preview rig
* the gear is `gear_visuals.js`'s `dressRig(rig, equipment, { light: false })`,
  the same call the creation screen dresses with
* the pose is the rig's own `update`: six tenths of a second of standing still,
  which settles the grip blend onto whatever the hands were given, then the
  clock is put back to zero so the idle breath is at the same point in every
  portrait and two renders of one character are the same picture
* the light is `scene.js`'s `lightingAt(DAWN)`, the hour `creation.js` asks the
  world for, put on a hemisphere, an ambient, a sun and a fill, with the same
  ACES tone mapping and exposure

The lens is the only thing that is ours. `frameFor(height)` puts a 30 degree
perspective camera level with the middle of the head to knee span, `PORTRAIT.yawDeg`
= 32 degrees off the front, far enough back that the span fills 0.86 of the
frame. The span itself comes off the body plan rather than a guess:

```
knee  = (BODY.ANKLE_Y + BODY.SHIN)                  * height / 1.80
crown = (BODY.IDLE_HIP + BODY.HEAD_Y + BODY.HAIR_TOP) * height / 1.80
```

Measured against a real rig, built and posed in node: a 1.80 m body's crown
comes out at 1.7750 m and its bounding box top is 1.7750 m; a 1.60 m body's are
1.5778 and 1.5778. The knee estimate sits 13 mm above the shin pivot at 1.80 m
and 11 mm at 1.60 m, which is the bend the idle stance puts in the leg.

The canvas is 160 by 220 CSS pixels at up to two device pixels each, so the
picture is drawn at better than the 92 px it is shown at and stays sharp on a
dense display. `toDataURL('image/png')` hands the roster the result, and the
renderer is created with `preserveDrawingBuffer: true` because without it the
buffer may be gone before the read.

## 3. Where the look comes from

The roster row carries `summary`, and a summary has never held an appearance.
So the look is read straight out of the character's own document, at the key
`state.js` writes it under:

```
readLook(id, storage)  ->  { appearance, equipment } | null
    storage.getItem(slotKeyFor(id, SAVE_KEY))
```

It only ever reads. No write, no delete, no migration, and `roster.test.mjs`
still ends on the assertion that nothing in it touched a real `localStorage`.
Left without a storage it takes the browser's, which is the same store
`createState()` was built over in `app/context.js`, so the ids line up. A
document that will not parse, one from before appearances existed, one that
still asks to be made, or a browser that will not hand over storage at all all
come back as nobody, and nobody gets the silhouette.

## 4. The cache, and what empties it

One `WebGLRenderer` serves every row and is disposed when the screen is. Every
portrait is cached against `lookKey(look)`, a signature of the appearance and
of the base, rarity and material of each equipped item, sorted so the same gear
written in a different key order is still the same picture.

* a redraw of the list is `cache.size` hits and no bodies built
* a character whose hair or armour changed has a different key, so they alone
  are drawn again
* Delete calls `portraits.forget(id)`, because slot ids are handed back out by
  `state.newSlot` and a kept portrait would put a dead character's face on the
  next one to take the number
* a row with nothing to draw caches its emptiness too, so a save that cannot be
  read is not re-read on every redraw
* `destroy()` clears the cache and calls `renderer.dispose()` and
  `forceContextLoss()`, because a context left behind on every visit to the
  roster is how a browser reaches its limit and starts refusing the game one

Cost, measured in node with the GL call stubbed out: 3.08 ms per portrait for
the build, the dressing, the pose and the framing. Five slots is about 15 ms of
CPU on the frame the roster is raised, plus five small draws.

## 5. The silhouette

A slot with no appearance yet, a save that cannot be read, and a browser that
will not give us a context all draw the same thing: a hooded figure under an
arch, in code, as an SVG. It is deliberately a drawing rather than a blurred
render, because a blurred body reads as a bug and a shape reads as "nobody
yet". There is no `<img>` with nothing behind it anywhere in the list.

## 6. What is proved, and what is not

`node src/game/roster.test.mjs` (106 checks) and
`node src/game/roster_preview.test.mjs` (74 checks) both pass, and so do
`wiring`, `state`, `win_settings`, `creation`, `player`, `gear_visuals` and
`scene`. `npx vite build` builds.

Not covered by any of it: the WebGL draw itself. `paint()` is driven in node
with a stand-in renderer, which runs the whole of it, the real body, the real
dressing, the real pose and the real camera placement, except the one call that
needs a graphics context; `makeKit()` is never run outside a browser. Whether
the portraits actually appear, and what they look like at 92 px, is a thing to
look at rather than a thing this note may claim.
