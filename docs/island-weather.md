# Starting island weather

The starting island uses the existing weather renderer, with passing rain and a short cold spell that brings snow to Haven and the surrounding countryside.

## Automatic cycle

- One weather front takes 47 minutes on the game world clock. Clouds gather before precipitation, and both fade as the front passes.
- The island cold spell blends rain into snow from phase 0.51 to 0.55, holds snow until 0.62, then thaws back into rain by 0.66.
- At Haven, sampling once per second measures about 6.2 minutes with snow intensity above 0.08 per cycle. Rain intensity exceeds 0.18 for about 15.5 minutes. Light sleet can count toward both intervals during transitions.
- This rule applies when the active terrain header has `world: 'island'`. Other worlds retain their existing regional and elevation rules.
- Weather follows the existing session world clock, including slow time and developer clock offsets. It is not a wall-clock seasonal calendar.

The terrain's permanent snow line remains 180 m. Before the island cold spell was added, Haven at about 8.6 m never received automatic snow. A 20 m grid survey found a peak of about 59.3 m, also well below the old snowfall band. Snowfall now reaches all 24 authored island locations without changing the terrain heights or paint. Snow accumulation and melting on the ground are not implemented.

## Visuals and sound

The existing renderer supplies rain streaks, drifting snowflakes, cloud cover, mist, wind, reduced sunlight and weather-adjusted reflections. Precipitation clips against terrain, water and roof envelopes. It hides inside dungeons and underwater.

Existing weather audio is already registered:

| Files | Use |
| --- | --- |
| `amb-rain-field.mp3` | Rain over open ground |
| `amb-rain-under-trees.mp3` | Rain under tree cover |
| `os-wind-gust.mp3` and variants 2 and 3 | Outdoor gusts, including during snowfall |
| `os-distant-thunder.mp3` and variants 2, 3 and 4 | Rain onset |

Full snowfall does not select a rain recording or trigger distant thunder. Rain recordings can still play during the sleet transition while rain intensity remains above its audio threshold. No dedicated snow ambience recording was found in this project. Snow currently retains the location's ambience and the existing outdoor wind gusts.

Dungeon ambience takes priority over outdoor rain and nearby settlement ambience. Outdoor rain, snow, thunder and wind triggers are suppressed inside dungeons and underwater. Ambient loops currently use the existing music-enabled control; wind and thunder one-shots use the sound-effects control.

## Verification

- `src/game/weather/island.test.mjs` loads the actual island terrain, checks all 24 authored locations across a full cycle, and drives the actual precipitation batches through rain, snow, hiding, clearing and developer-mode recovery.
- `src/game/weather/weather.test.mjs` covers climates, sky lighting, roofs, rendering limits, disposal and the world clock.
- `src/game/app/systems/sound.test.mjs` checks weather context and the real audio-pool playback calls for rain, snow, dungeons and underwater.
- The live site's automatic rain was checked through its running `window.__bw` instance: the rain renderer was active and `amb-rain-field.mp3` was playing at volume 0.35, fully loaded and without an audio error. The island snow rule is a local change pending deployment.

The production build and focused weather/audio checks pass. The full regression run reports existing editor and spaces failures, a wayside performance failure, and a marginal terrain sampling performance failure (3.034 microseconds against a 3 microsecond limit). The terrain suite passes when run separately, with 221 checks passing. These unrelated sources were not changed.
