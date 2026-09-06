# B2: born in Hearthhome, inside the Standing Hedge, with the home map known

Written 2026-09-06.

## What was wrong

A new character woke "a short walk outside the nearest settlement", and the
nearest settlement to the origin was whichever ROLLED town the seed had put
closest, a generated village with generated people (Millermoor, 690 m out).
Hearthhome, the village every quest and every opening line assumes, was
1.75 km away and nothing pointed at it.

Hearthhome's own line says it stands "all inside the ring of stones". The
Standing Hedge was centred at 231, 804 with a radius of 805 m and the village
was 932 m from that centre: outside. One of the nine stones (848, 1321) stood
in the river.

The map only showed places the character had walked to, so the Old Cellars
and the Chalk Pits were invisible until stumbled on.

## What changed

- `src/world/zones.js` exports `BIRTHPLACE` (789, 1533): Hearthhome plus the
  hearthhome plan's own arrival point, 61 m from the well. `zones.test.mjs`
  proves the sum, that it is inside the town's pad, dry, open under the
  release gate, and inside the Hedge.
- `src/game/app/systems/player.js`: a fresh character (pos 0, 0) is put at
  `BIRTHPLACE` facing the well, with a toast in words. The nearest rolled
  town search is gone.
- `src/game/win_dev.js` `HOME` and the release gate's "come home" teleport in
  `src/game/app/systems/world.js` both go to `BIRTHPLACE`.
- `LAYOUT.waystones` moved to 580, 1120. Measured: all nine stones dry (the
  plan's own `stopsOf`), Hearthhome 489 m inside, the Old Cellars 530 m
  inside, the nearest stone 382 m from the well, no zone disc overlapping
  another by more than 15 percent, 1261 m from the origin (still pad-less,
  still inside HEART_SAFE, so the heart digest in field.test did not move).
  The waystones fixture in `waystones.test.mjs` still holds: from 200 m east
  of the village stone the nearest stone is the village stone.
- `src/game/win_map.js`: `knownOf(discovered)` is what the panel hands to
  `foundPlaces` and `pickAt`. It answers true for anything walked to AND for
  every authored place in an open realm (`homeKnown()`, built once from
  `authoredSites()` and `release.openAt`). The pure functions did not change.
  A fresh character's map lists Hearthhome, the Hedge, the Old Cellars, the
  Chalk Pits and the rest of the Greenwold on the first morning; rolled
  places and closed realms are still walked to.

## Measured in the browser

A new character (throwaway slot) woke at 789, 1533 with the place plate
reading Hearthhome, the egg hatched, Old Wynn spoke, and the compass turned
to the Standing Hedge. That is the story's own first trigger firing at birth.

## Not done here

`sitegrid.SPAWN_CLEAR` still clears rolled sites round the ORIGIN, not round
the birthplace. Nothing rolled stands within 600 m of Hearthhome today
(Coldwake is 680 m), so nothing changes for the player; the constant is
simply about a point nobody starts at any more.
