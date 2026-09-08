# S4. The sound library

Phase S replaced the old project music references with the Greenwold library in `public/audio/library/`.

## What changed

- `src/game/audio.js` now has an explicit `LIBRARY_FILES` manifest for all 68 MP3 files. `auditLibrary()` runs at import and checks music files, ambience beds, point-source loops, and every one-shot pool against that manifest.
- `MUSIC_KITS` now contains only the three Greenwold tracks:
  - `Hearthhome_Midday-music-track.mp3`
  - `Hearthhome-night-soundtrack.mp3`
  - `The-Standing-Hedge.mp3`
- Music context is place and time based. A settlement means `nearestSettlement()` within `flatR + 20 m`. Day and night use the world clock through `ctx.isNight(worldNow)`.
- Tracks do not loop. When a track ends, the next play is scheduled after a 20 to 40 second silence.
- `bedFor(context)` is pure and selects one ambience bed at a time. Rain wins first, then settlement, dungeon and mine, camps, tree cover, water, chalk hill, and meadow fallback.
- `src/game/app/systems/sound.js` is registered after `ui`. It samples the player context once per second, updates point sources every frame, and sends the chosen music and ambience to `audio.js`.
- Point sources use HTMLAudio loops with distance volume. They are full volume to 4 m and paused past 22 m.
- One-shot pools go through the existing SFX mute and gain through `audio.playLibrary()`. Pool rotation never repeats the same variant twice running.

## Placement

- The forge source is read from the live station table. The system asks for `workshop` and falls back to `forge` for older station ids.
- The tavern and mill-wheel sources are derived from authored space pieces. The world position is the space origin plus the plan piece offset, which is the same placement convention used by the plan model builder.
- Camp ambience uses runtime site kinds and Greenwold ids. `bandit_camp` and Highwayman's Hollow choose the bandit bed. `legion_camp`, `legion` ids, and the Kingsroad camp choose the legion bed.
- River and wet-meadow ambience scan `field.sampleAt()` at the player's feet and nearby points out to 25 m. River wins before still water when both are true.

## Measured

- `node src/game/audio.test.mjs`: 148 passed, 0 failed.
- `node src/game/app/systems/sound.test.mjs`: 18 passed, 0 failed.
- `node src/game/wiring.test.mjs`: 191 passed, 0 failed.
- `npm test`: failed in unrelated suites: `src/game/con.test.mjs`, `src/game/editor/editor.test.mjs`, `src/game/roster_preview.test.mjs`, `src/game/studio/integration.test.mjs`, `src/game/win_talk.test.mjs`, `src/mmo/loot.test.mjs`, `src/world/roads.test.mjs`, `src/world/wayside.test.mjs`. The visible failure was the existing wayside road-furniture timing budget, not the sound library.

The wiring count was 14 live systems before Phase S. It is 15 after adding `sound`.

The measured claims include:

- Every library filename named by music, ambience, point sources, and one-shot pools exists in the 68-file manifest.
- `bedFor()` drives every branch true, plus false-path checks for still water outside dawn and river versus wet meadow.
- Settlement day chooses `Hearthhome_Midday-music-track.mp3`.
- Settlement night chooses `Hearthhome-night-soundtrack.mp3`.
- Open country chooses `The-Standing-Hedge.mp3`.
- A finished music track schedules a 20 second rest at the low end of the 20 to 40 second range with deterministic random.
- Eight owl shots through the scheduler path did not repeat a variant twice running.
- A point source at 4 m played at ambience volume. The same source past 22 m was paused and silent.

## Not yet wired

- `os-door-cottage*.mp3` needs a producer hook when the Talk window opens on an innkeeper or villager with a house. The assigned edit set did not include `win_talk.js`, `windows.js`, or `npcs_runtime.js`.
- `os-hedge-push*.mp3` needs a producer hook from the hedge collision pushback. The assigned edit set did not include the collider owner.
- `os-heron-croak*.mp3` exists, but Phase S did not name a concrete trigger beyond water-meadow flavour.

## Missing library rows

- `src-weir`
- `src-well`
- `src-hedge-stone-hum`
- `src-sheep-flock`
- `src-hens`
- `src-fire-camp`
- `src-reeds-wind`
- `src-beehive`
- `src-lantern-wind`
- `step-grass`
- `step-dirt-path`
- `step-cobble`
- `step-mud`
- `step-gravel`
- `step-sand-chalk`
- `step-wood-plank`
- `step-shallow-water`
- `step-leaf-litter`

## Browser check

Not measured. CUA saw Brave Browser running, but exposed no controllable browser tabs. The fallback DevTools browser had only `about:blank` available, and its `new_page` call for `http://localhost:5198/` was cancelled by the user, so no live readings were collected.

The readings still to take are:

- Haven's green: `window.__bw.audio.music.track` and `window.__bw.audio.music.ambience.url`.
- Field teleport 120 m out: the same two readings.
- Night on the green: the same two readings.
- Two-minute stand on the green at night: one-shot names from `window.__bw.audio.stats`.

The code exposes these on `window.__bw.audio`, because the sound system returns the same audio object in its `bw` bag.
