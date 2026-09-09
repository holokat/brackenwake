# Brackenwake

An open-source fantasy game for the browser, built with Three.js, Vite and Cloudflare Workers. Choose a warrior, ranger, rogue or wizard and explore the world.

[Play Brackenwake](https://brackenwake.com/play) · [Website](https://brackenwake.com/) · [Lore and lands](https://brackenwake.com/lore/) · [Asset playground](https://assets.brackenwake.com/)

## Lore and lands

The [world atlas](https://brackenwake.com/lore/) collects the nine realms and 95 named places, with zone descriptions, landmarks, encounters and character stories. Start with [the last dragon](https://brackenwake.com/lore/story/) or [the Greenwold](https://brackenwake.com/lore/greenwold/).

The atlas includes story plans and places still in development. It is generated from the [world data](src/mmo/realms.js) and the [current story document](docs/mmo/14-KALDERA.md). Earlier story drafts remain in the repository as historical notes.

## Run locally

Use Node.js 22.12 or newer and npm.

```sh
npm ci
npm run dev
```

Open [localhost:5198](http://localhost:5198). The welcome page leads into the game. Use `/?solo` to play without connecting to a multiplayer room.

For local multiplayer, run these in separate terminals:

```sh
npm run build
npm run server
```

```sh
npm run dev
```

Vite proxies `/ws` to the local Cloudflare Worker on port 8787. The Worker uses a Durable Object for each room. See [the multiplayer implementation notes](docs/mmo/wiring/MP1-THE-OTHERS.md) for the current authority and synchronization model.

## Wishlist and planned features

- A better authored starting zone
- More assets, including monsters and infrastructure
- Better ability animations
- More abilities
- Better encounter balance
- A storyline
- Housing

Contributions are welcome, whether you want to work on code, art, animations, world design, writing or playtesting. Pick something from this list or bring your own idea. Open an issue to discuss it, or submit a pull request. See [CONTRIBUTING.md](CONTRIBUTING.md) for how to get started.

## Build on the game

Fork this repository to change the game, create a world or reuse its components. The companion [game-assets repository](https://github.com/holokat/game-assets) contains the asset studio and reusable collections. Follow that repository's setup instructions and preserve its asset-specific license notices when importing files.

The [Old Cellars art and encounter guide](docs/art/old-cellars/README.md) includes generated concept sheets, editable Blender rooms and bosses, animation builders, collision manifests and validation commands. Contributions to encounter balance and dungeon playtesting are welcome.

Useful starting points:

- `src/game/`: game client and interface.
- `src/mmo/`: classes, abilities, items and authored world content.
- `src/world/`: world generation.
- `server/`: multiplayer Worker and rooms.
- `public/`: models, textures, sounds and interface artwork.
- `assets/models/cellars/`: bundled dungeon models and editable room sources.
- `src/welcome/` and `welcome/`: the marketing hero.
- `docs/mmo/`: design documents and implementation notes. Some documents describe planned work; check the implementation before relying on a feature.
- `legacy/`: the earlier farming game.

See [CONTRIBUTING.md](CONTRIBUTING.md) for changes and validation.

## Build and deploy

```sh
npm test
npm run build
npm run build:marketing
```

The game builds into `dist/`; the marketing site and lore atlas build into `dist-marketing/`. Deploy them with their respective Wrangler configurations, `wrangler.jsonc` and `wrangler.marketing.jsonc`. `npm run build:marketing` regenerates the lore pages from the current world and story sources.

When deploying a fork, use your own Cloudflare account and app-specific Worker names. Update the marketing build's game URL, canonical URL and social-image URLs for your deployment. The checked-in configuration points to Brackenwake's deployment.

## License

Code and original assets are available under the [MIT License](LICENSE). Third-party dependencies and assets retain their own licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Music in `public/audio/music/` and `public/audio/library/` is excluded from this repository while redistribution rights are being checked. Local saves, credentials, dependencies, build outputs and intermediate generated video are also excluded. The final marketing video and artwork are included.
