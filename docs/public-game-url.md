# Public game URL

The website lives at `https://brackenwake.com/`. Its game button opens
`https://brackenwake.com/play`.

`brackenwake-marketing` owns the existing apex and `www` custom domains in
Cloudflare account `0b55a6c39a979a58efbf40875ac376d6`. Its `GAME` service binding
forwards the game document, missing game assets and WebSocket connections to
the existing `brackenwake` Worker. Responses keep their streaming bodies,
status codes and cache headers. The website's own assets remain served directly.
Unknown website pages remain 404. `/play/`, `/?play` and `www` game links redirect
to the clean game URL, preserving other query options.

This release changes the marketing Worker only. The game remains on version
`2a3e5d04-40d3-4d00-92c8-399c6a872fb3`; local dungeon changes are a separate game
release. Both game HTML and the game's deployment history were checked before
and after this change.

Characters use browser storage. A character saved under the old Worker hostname
is not automatically available under `brackenwake.com`. The old
`https://brackenwake.cogentgene.workers.dev/?play` address remains available,
without an automatic redirect, so existing characters remain accessible there.
This deployment does not copy, overwrite or delete browser saves.

Run `node server/marketing.test.mjs`, both tests under `src/welcome`, and
`npm run build:marketing` before deploying `wrangler.marketing.jsonc`.
`node scripts/verify-public-play.mjs [origin]` checks the real HTTP routes,
game modules, model/terrain/artwork URLs and an isolated WebSocket upgrade. It
does not open a character or send chat. A remote Wrangler preview passed this
same verification before production did.

The deployment and verification result is recorded in
`outputs/public-game-url-deployment.json`. Worker-to-Worker routing uses
[Cloudflare service bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/http/).
