# Public lore atlas

The atlas lives at [brackenwake.com/lore/](https://brackenwake.com/lore/), linked
from the marketing header and the GitHub README. It contains the nine authored
realms, all 95 named places, and the current story outline. Each place has a
stable anchor; realm pages include geography, landmarks, encounters and optional
mechanic details. Story outlines are collapsed by default and labelled as spoilers.

## Source of truth

`scripts/lore/content.mjs` reads geography from `src/mmo/realms.js` and the current
story from `docs/mmo/14-KALDERA.md`. It deliberately excludes the superseded story
books, naming drafts and implementation instructions. A development note appears
on every page because the authored world includes places and events that are not
yet playable. Update these source files instead of editing generated HTML.

`scripts/lore/pages.mjs` renders static HTML. `src/lore/atlas.css` provides the
shared presentation, and `src/lore/search.js` enhances the index with local place
search. Reading and navigation work without JavaScript. Source text is escaped;
unsupported story formatting fails the build instead of silently losing content.

## Build and release

Run `npm run build:marketing`. The marketing build calls `scripts/build-lore.mjs`
to generate the eleven lore pages, hashed CSS and JavaScript, sitemap and robots
file inside `dist-marketing`. The existing marketing Worker serves these files
through its `ASSETS` binding. No game bundle is built into this output.

Deploy **only** `wrangler.marketing.jsonc` to publish website changes. Its Worker
is `brackenwake-marketing` in account `0b55a6c39a979a58efbf40875ac376d6`.
The existing `GAME` binding continues to serve `/play` and game assets from the
separate `brackenwake` Worker. Deployment evidence is recorded in
`outputs/public-lore-deployment.json`.

## Verification

- `node --test src/lore/lore.test.mjs server/marketing.test.mjs src/welcome/welcome.test.mjs src/welcome/video.test.mjs`
- `npm run build:marketing`
- `node scripts/verify-public-lore.mjs [origin]` checks all eleven HTTP pages,
  every place anchor and description, public assets, sitemap, navigation and 404s.
- `node scripts/verify-public-play.mjs [origin]` checks the production game entry,
  modules, artwork, canonical redirects and a real WebSocket upgrade.
- For native browser review, run a remote marketing preview on port 8796 and open
  `http://localhost:5198/tools/qa/lore.html` in the existing Brave window. This
  local-only review page embeds the actual preview at 390 px, including the
  longest realm title. Review desktop pages directly on port 8796.

The release passed all 18 focused checks, the marketing build, desktop and mobile
Brave review, preview HTTP checks and WebSocket verification. The shared full
`npm test` run reported failures in the editor fixture suite and timing budgets
in minimap and wayside. The isolated minimap rerun passed all 177 checks. The
separate task's final game build passed; this website release does not deploy it.
