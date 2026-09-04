# Wiring audio.js into the game

`src/game/audio.js` is finished and tested (`node src/game/audio.test.mjs`,
108 checks). It imports nothing and touches nothing outside itself. Below is
every line `main.js`, `interact.js` and `shop.js` need, in the order they appear
in the files. Line numbers are from the working tree on 2026-09-04 and will
drift (the tree moved under this document once already, at commit d2f4c0c);
the quoted context will not.

Nothing here has been run in a browser. Everything below the line "what the
tests prove" is proven in node; everything above it is wiring, and the sounds
themselves have not been listened to in the game.

**shop.js is in this document on purpose.** The task named `main.js` and
`interact.js`, but the market's buttons call the module's own `buy()` and
`sell()` closures, not the `buy`/`sell` on the returned object. Wrapping the
returned methods from `main.js` would sound for a programmatic call and stay
silent for every click a player makes. The two lines have to go inside
`shop.js`.

---

## 1. main.js: the import

Line 29 already reads:

```js
import { createShop } from './shop.js';
```

Add under it:

```js
import { createAudio } from './audio.js';
```

## 2. main.js: creation, before the HUD

Line 52 already reads:

```js
  const hud = createHud(hudRoot);
```

Add under it:

```js
  // Sound. Browsers refuse audio until the player clicks or presses a key;
  // createAudio listens for that itself, so there is nothing to unlock here.
  const audio = createAudio();
```

`createAudio()` with no options uses `new Audio()`, `localStorage`, and attaches
its own one-shot `pointerdown` / `keydown` / `touchstart` listeners on `window`.
Before that first gesture every `play()` returns null and builds no element, so
no wiring below needs a guard.

## 3. main.js: the music, once the player has a position

Line 71 already reads:

```js
  player.teleport(state.pos.x || 0, state.pos.z || 0, (x, z) => runtime.heightAt(x, z));
```

Add under it:

```js
  // the kit is chosen from where you actually woke up, not from the origin
  audio.music.setBiome(runtime.field.sampleAt(player.pos.x, player.pos.z).biome);
  audio.music.start();
```

`music.start()` before the gesture records the wish and plays nothing; the theme
and the ambience bed both come up on the first click. That is the whole of the
music wiring except the biome follow in step 6.

## 4. main.js: pass the audio to interact and the shop

Line 81 currently reads:

```js
  const interact = createInteract({ sc, runtime, player, state, hud, input });
```

Change to:

```js
  const interact = createInteract({ sc, runtime, player, state, hud, input, audio });
```

Lines 82 to 85 currently read:

```js
  const shop = createShop({
    state, hud,
    nearestSettlement: () => nearestSettlement(),
  });
```

Change to:

```js
  const shop = createShop({
    state, hud, audio,
    nearestSettlement: () => nearestSettlement(),
  });
```

## 5. main.js: discovery and going under

Lines 112 to 114 currently read:

```js
  runtime.onDiscover((s) => {
    hud.toast(`you found <b>${s.name}</b>, ${s.article}`, 'good');
  });
```

Change to:

```js
  runtime.onDiscover((s) => {
    hud.toast(`you found <b>${s.name}</b>, ${s.article}`, 'good');
    audio.play('discover');
  });
```

Not positioned: a site is found from up to 70 m away, which is inside earshot
but not by much, and the discovery belongs to you rather than to the place.

In `runtime.onDungeonState`, line 129 currently reads:

```js
    if (!st.inside) {
```

Add above it, under the `if (st.at) { ... }` block:

```js
    // going under, and going deeper, are both going under
    if (st.inside) audio.play('enterCave');
```

Climbing out has no cue: nothing in the folder is a way opening onto daylight,
and pitching the same sound up would be a guess. The toast already says it.

## 6. main.js: the biome follow, in `updatePlace`

`updatePlace` already runs at most twice a second, which is the right rate for
a check that only matters when you cross a border. Lines 167 to 178 currently
read:

```js
    } else {
      let best = null, bestD = Infinity;
      for (const s of runtime.sitesNear(p.x, p.z, PLACE_RADIUS)) {
        const d = Math.hypot(s.x - p.x, s.z - p.z);
        if (d < bestD) { bestD = d; best = s; }
      }
      if (best) text = best.name;
      else {
        const sample = runtime.field.sampleAt(p.x, p.z);
        text = BIOME_NAMES[sample.biome] || sample.biome;
      }
    }
```

Change to:

```js
    } else {
      let best = null, bestD = Infinity;
      for (const s of runtime.sitesNear(p.x, p.z, PLACE_RADIUS)) {
        const d = Math.hypot(s.x - p.x, s.z - p.z);
        if (d < bestD) { bestD = d; best = s; }
      }
      // the music follows the ground even when a place name is what is shown
      const sample = runtime.field.sampleAt(p.x, p.z);
      audio.music.setBiome(sample.biome);
      if (best) text = best.name;
      else text = BIOME_NAMES[sample.biome] || sample.biome;
    }
```

Two things this relies on, both tested: `setBiome` returns false and does
nothing when the new biome shares a kit with the old one (beach to ocean, snow
to mountain, meadow to meadow), so the track does not restart at a border; and
the call is inside the `else`, so the music is left alone underground.

`sampleAt` is pure noise maths and was already being called on this path in the
common case. The change makes it unconditional: twice a second, always.

## 7. main.js: the ear, in the frame

Line 275 already reads:

```js
    const centre = dev.on ? sc.camera.position : player.pos;
```

Add under it:

```js
    audio.setListener(centre.x, centre.z);
```

It goes here, before `runtime.update` and `interact.update`, so that everything
fired this frame is measured against where the player is this frame. In fly
mode the ear rides the camera, which is what is on screen.

Without this call, positioned sounds play at full volume and the console says
so once. That is deliberate: a missing `setListener` should be loud and wrong,
not silent and invisible.

## 8. main.js: two mute keys (optional but nothing else offers one)

`hud.js` has no sound button and the keys `m` and `n` are free. In
`onHotkeys()`, under line 193 (`if (input.pressed('b')) toggleShop();`):

```js
    if (input.pressed('m')) hud.toast(audio.toggleMusic() ? 'music on' : 'music off');
    if (input.pressed('n')) hud.toast(audio.toggleSfx() ? 'sound on' : 'sound off');
```

Both settings persist under `brackenwake-audio`, so a player who turns the music
off gets it back off tomorrow. The toast is not decoration: a mute with no
confirmation is indistinguishable from a broken key.

---

## 9. interact.js: the deps

Line 109 currently reads:

```js
export function createInteract({ sc, runtime, player, state, hud, input }) {
```

Change to:

```js
export function createInteract({ sc, runtime, player, state, hud, input, audio }) {
```

Every call below is `audio?.play?.(...)`, so the module still runs headless in
`interact.test.mjs` with no audio passed at all.

## 10. interact.js: the swing that lands

`act()`, lines 172 to 185, currently read:

```js
      case 'chop':
      case 'mine': {
        lastSwingAt = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        const noun = nounFor(d.field);
        const res = chopTree(d.field, d.index);
        // chopTree refuses a record that is gone or already down
        if (!res) { say('a sapling is coming back here'); return d; }
        if (res.felled) creditYield(res, noun);
        else say(d.action === 'mine'
          ? `the ${noun} cracks, ${res.remaining} more`
          : `the ${noun} takes the blow, ${res.remaining} more`);
        return d;
      }
```

Change to:

```js
      case 'chop':
      case 'mine': {
        lastSwingAt = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        const noun = nounFor(d.field);
        // read the record before the swing: where the sound comes from
        const rec = d.field.trees?.[d.index];
        const at = rec ? { x: rec.x, z: rec.z } : undefined;
        const res = chopTree(d.field, d.index);
        // chopTree refuses a record that is gone or already down
        if (!res) { say('a sapling is coming back here'); audio?.play?.('denied'); return d; }
        // the tool lands on every swing, including the last one
        audio?.play?.(d.action === 'mine' ? 'mine' : 'chop', { at });
        if (res.felled) {
          if (d.action === 'mine') audio?.play?.(res.ore != null ? 'oreBreak' : 'rockBreak', { at });
          // the tree takes 1500 ms to go over (DUR in farm/tree_edit.js), so
          // the thud waits for the ground instead of landing with the swing
          else audio?.play?.('chopDown', { at, delay: 1300 });
          creditYield(res, noun);
        } else say(d.action === 'mine'
          ? `the ${noun} cracks, ${res.remaining} more`
          : `the ${noun} takes the blow, ${res.remaining} more`);
        return d;
      }
```

Three things worth knowing here:

- `FELL_HITS` is 3 and the chop cue holds exactly three takes, so a tree is
  three different strikes and then a fall.
- `res.ore` is what `creditYield` already reads to tell stone from ore, so
  `oreBreak` and `rockBreak` split on the same fact the text does.
- The delayed thud measures its distance when it fires, not when it was booked.
  Walk out of earshot while the tree is going over and you do not hear it land.

## 11. interact.js: what came out of it

`creditYield`, lines 161 to 169, currently read:

```js
  function creditYield(res, noun) {
    const good = res.wood != null ? 'wood' : res.stone != null ? 'stone' : res.ore != null ? 'ore' : null;
    if (!good) { say(`the ${noun} comes apart and leaves nothing`); return; }
    const n = res[good];
    const { added, dropped } = state.add(good, n);
    if (added && dropped) say(`${added} ${good} from the ${noun}, and ${dropped} left behind, your pack is full`);
    else if (added) say(`${added} ${good} from the ${noun}`);
    else say(`your pack is full, the ${n} ${good} stays on the ground`);
  }
```

Change the last three lines to:

```js
    if (added && dropped) say(`${added} ${good} from the ${noun}, and ${dropped} left behind, your pack is full`);
    else if (added) say(`${added} ${good} from the ${noun}`);
    else say(`your pack is full, the ${n} ${good} stays on the ground`);
    // a full pack is a refusal, and it should not sound like a reward
    audio?.play?.(added ? 'pickup' : 'denied', { gain: added ? 0.6 : 1 });
  }
```

`pickup` is quiet on purpose: it lands on top of the fall or the rock break,
and it is the smaller of the two events.

## 12. interact.js: the wrong tool

The `blocked` case, lines 203 to 211, currently read:

```js
      case 'blocked': {
        if (d.reason === 'no_tool') say(`you need ${d.need === 'axe' ? 'an axe' : 'a pickaxe'}, the market in town sells one`);
        else if (d.reason === 'wrong_tool') say(`${anA(state.tool)} is no use on ${anA(nounFor(d.field))}, you want the ${d.need}`);
        else if (d.reason === 'too_far') say(d.site ? `${d.site.name} is ${Math.round(d.dist)} m off, walk to the mouth` : 'too far, get closer');
        else if (d.reason === 'regrowing') say('a sapling is coming back here');
```

Change the first two branches to:

```js
      case 'blocked': {
        if (d.reason === 'no_tool') { say(`you need ${d.need === 'axe' ? 'an axe' : 'a pickaxe'}, the market in town sells one`); audio?.play?.('denied'); }
        else if (d.reason === 'wrong_tool') { say(`${anA(state.tool)} is no use on ${anA(nounFor(d.field))}, you want the ${d.need}`); audio?.play?.('denied'); }
        else if (d.reason === 'too_far') say(d.site ? `${d.site.name} is ${Math.round(d.dist)} m off, walk to the mouth` : 'too far, get closer');
        else if (d.reason === 'regrowing') say('a sapling is coming back here');
```

**Leave `cooldown` silent.** It is the branch a held mouse button hits at frame
rate: `SWING_MS` is 450 ms and a click every frame is roughly fourteen refusals
per swing. It already says nothing on purpose, and a beep is worse than a toast.

`too_far` and `regrowing` are left silent for the same reason: pointing at a
distant tree and clicking is something a player does repeatedly.

---

## 13. shop.js: the deps

Line 65 currently reads:

```js
export function createShop({ state, hud, nearestSettlement, root } = {}) {
```

Change to:

```js
export function createShop({ state, hud, audio, nearestSettlement, root } = {}) {
```

## 14. shop.js: paying and being paid

`buy()` at line 160 ends with this, at lines 168 to 170:

```js
    say(state.dev ? `the ${t.name.toLowerCase()} is yours, free, because dev mode is on`
      : `you buy the ${t.name.toLowerCase()} for ${t.price} coins${first ? ', and it goes straight into your hand' : ''}`);
    state.save();
```

Add between the two:

```js
    audio?.play?.('buy');
```

The two refusals above it are the other half of the same moment. Lines 163 and
164 currently read:

```js
    if (state.tools.has(id)) { say(`you already carry ${t.name === 'Axe' ? 'an axe' : 'a ' + t.name.toLowerCase()}`); return false; }
    if (!state.dev && state.coins < t.price) { say(`the ${t.name.toLowerCase()} is ${t.price} coins and you have ${state.coins}`); return false; }
```

Change to:

```js
    if (state.tools.has(id)) { say(`you already carry ${t.name === 'Axe' ? 'an axe' : 'a ' + t.name.toLowerCase()}`); audio?.play?.('denied'); return false; }
    if (!state.dev && state.coins < t.price) { say(`the ${t.name.toLowerCase()} is ${t.price} coins and you have ${state.coins}`); audio?.play?.('denied'); return false; }
```

In `sell()`, line 184 already reads:

```js
    say(`you sell ${taken} ${noun} for ${paid} coins${taken < want ? ', which was all you had' : ''}`);
```

Add under it:

```js
    audio?.play?.('sell');
```

and on the refusal above it, line 181:

```js
    if (n <= 0) { say(`you have no ${noun} to sell`); audio?.play?.('denied'); return false; }
```

`buy` is `handle_coins.mp3`, coins going across a counter. `sell` is
`loot_coin.mp3`, coins coming back. They are deliberately different files: a
market where paying and being paid sound identical tells the player nothing.

None of the market cues are positioned. You are standing in the shop.

---

## What the tests prove, and what they do not

Proven in node, 108 checks:

- every cue in the table resolves to a file that is really in
  `public/audio/sfx`, and the audit throws on a missing file, a family with
  more takes than exist, the wrong extension, a cue naming nothing, and a cue
  naming the one file measured to be silent. The audit runs at module load, so
  `npm test` fails on a typo.
- take rotation: 40 draws from 4 takes use each exactly 10 times, no take ever
  follows itself, and a fresh shuffle never opens on the take that just played.
- attenuation is 1 at the listener and out to 6 m, 0 at 42 m and past it, never
  rises across 190 samples, and strictly falls in between.
- before the gesture, `play()` returns null and no element is constructed; after
  it, all 16 cues build one element each and play it once.
- muting sfx leaves the music running; muting the music leaves sfx running; the
  track pauses and resumes the same file.
- the settings round-trip through a stubbed `localStorage` under
  `brackenwake-audio`, and a corrupt blob falls back to the defaults.
- the music rotation: theme, then calm for an idle player, lively after a swing,
  theme again on the third slot; sakura alternates its two themes; beach and
  ocean share one kit so the border does not restart the track.
- the delayed thud is booked for 1300 ms and measures its distance when it
  fires, not when it was asked for.

Not proven, and not claimable until someone listens:

- that any of it is audible over the music at the mix chosen here (sfx 0.7,
  music 0.3, ambience 0.15).
- that the three chop slices land on the three strikes in the recording. The
  offsets come from the RMS envelope of `axe-chop-1.mp3` at 50 ms resolution,
  which puts strikes at about 0.15 s, 1.20 s and 2.35 s; the slices start
  0.07 s to 0.09 s before each. mp3 seeking is frame-accurate at best.
- the cold-start path in a browser. The seek-on-`loadedmetadata` branch is
  driven by the fake in node, but a real network fetch is not.
- `chopDown` and `enterCave` are stand-ins. Neither sound is the event it is
  attached to; both are named in `STAND_INS` and in the report.

## The two cues with no file

`hurt` and `step` are not in the table, and `NO_FILE_FOR` in `audio.js` says
why: nothing in the folder is a person taking damage, and there are no
footsteps at all (`docs/sfx-wishlist.txt` rules footsteps out on purpose). If a
call site needs them later, add the file first and then the row; `play()` on a
name that is not in the table returns null and does nothing.
