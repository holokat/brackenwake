# Nostrux Homestead — farm through conversation

A coin-driven homesteading game living on nostr. Pick a biome, grow and water crops, tend
animals that announce their produce, craft flour into bread and milk into truffle cheese,
fish off your dock, sell it all at your market stand — and let the nostr network accelerate
everything: engagement mints coins, friends can water your farm, and zapping a farm pays its
owner. Full architecture in [DESIGN.md](DESIGN.md).

Highlights: map picker onboarding · biome landscapes around the farm (mesa in a meadow /
pine forest / ocean / dunes / blossom grove / autumn wood) · 8 processor buildings, 40 recipes ·
traveling-merchant exclusives · bottom hotbar HUD with tools (water / fish) + Farm Book panel ·
day/night, per-biome music, Kenney SFX, synth animal voices · kind 30078 farm state,
kind 21617 watering gifts, farm-zap rewards · 🧪 test mode unlocks everything for trying it out.

## How it plays

- **Sign in with NIP-07** (Alby / nos2x) to claim and tend *your* farm. Any npub can be visited
  read-only; signed in, your kind-3 follows appear as a **Friends** list — hop between farms.
- **Only new engagement counts**: claiming freezes a baseline; unlocks and growth come from
  engagement earned after that moment.
- **Resources**: 🌱 notes · 💧 likes · 🦋 replies · 🔁 reposts · ⚡ zaps — live from public relays
  (kinds 0/1/3/6/7/9735, hand-rolled NIP-01).
- **The sidebar** lists every unlockable with requirement + progress: crops, animals, buildings,
  trees, objects, plus farm tier and farmhouse progression.
- **Crops** grow through 5 stages with engagement; full-blossom crops harvest and replant.
- **Animals**: bunny, chicken, duck, cat, rooster, dog, sheep, goat, pig, cow, horse — they
  wander the land with per-species gaits (bunnies hop, chickens strut, cows amble), idle, graze,
  and make synthesized sounds (moo, baa, bark, meow, crow…). Roosters crow at dawn. Place a
  **pen** and animals dropped inside stay inside.
- **Buildings**: pens (small/large with troughs and feed), corn silo, and a barn progression —
  small → big → grand triple barn.
- **The farmhouse** sits on every farm and levels up automatically with engagement:
  Shack → Log Cabin → Cottage → Farmhouse → Grand Homestead (chimney smoke at higher levels).
- **Farm tiers**: Meadow Homestead (12 plots) → Riverside Acres (20) → Golden Valley Estate (30),
  each with far more open land than crop grid — room to homestead.
- **Themes** (pick in the sidebar, saved per farm): Meadow, Oceanside (palms, waves, rowboat),
  Boreal Forest (spruces, snowfall), Desert Oasis (saguaros, tumbleweed), Sakura Valley (torii,
  drifting petals), Autumn Hollow (maples, falling leaves). Theme music comes from
  `public/audio/` — currently one shared track, drop more in and point themes at them.
- **Day/night cycle** (8-minute days): the sky crossfades to a starry night, the moon rises,
  lanterns glow brighter, fireflies come out, roosters greet the sunrise.
- **Post from the farm** via NIP-07; rename or remove your farm sign; move/remove any placed
  thing via its click popover. 🔊 toggles music + sounds.

## Run

```bash
npm install
npm run dev
```

## Multiplayer

One room per world on a Cloudflare Durable Object, deployed with the same
Worker that serves the game (`server/`). In development run the room beside
Vite:

```
npm run server     # wrangler dev on 8787: the room, and the built assets
npm run dev        # Vite on 5198, which proxies /ws to 8787
```

Every client says where it is ten times a second and draws everyone else's
body; a heal, a blessing or a cure on another player's body reaches that
player's client. `?solo` on the URL leaves the wire off. Monsters are still
each client's own. See `docs/mmo/wiring/MP1-THE-OTHERS.md`.

## Module map

- `src/farm/catalog.js` — unlockables + requirements + growth curves (single source of truth)
- `src/farm/themes.js` — the 6 farm themes: palettes, skies, music, scenery builders
- `src/farm/assets.js` — shared low-poly helpers + crops/trees/objects builders
- `src/farm/animals.js` — animal builders + wander/gait behavior
- `src/farm/buildings.js` — farmhouse ×5, barns ×3, silo, enclosures
- `src/farm/audio.js` — music player + WebAudio-synthesized animal/UI sounds
- `src/farm/farm.js` — scene engine: tiered island, day/night, placement, picking, ambient life
- `src/farm/game.js` — resources, baselines, unlocks, persistence
- `src/farm/main.js` — sidebar UI, auth, friends, modes, relay wiring
- `src/farm/pool.js` — NIP-01 relay pool

Assets are sculpted procedurally (img2threejs staged discipline, stylized no-reference mode) —
Vite + Three.js, no art packs, no nostr libraries.

## License

Code and original assets in this repository are released under the [MIT License](LICENSE) —
reuse, modify, and redistribute freely. Sound effects are Kenney (CC0). The biome **music
tracks are not included** in the repo pending a redistribution-license check; drop your own
or royalty-free tracks into `public/audio/music/<biome>/` to restore in-game music.
