# Public lore atlas

The atlas lives at [brackenwake.com/lore/](https://brackenwake.com/lore/),
linked from the marketing header and GitHub README. It covers all nine authored
realms and 95 named places, with dedicated pages for every place. The atlas,
story, realms and places make 106 static HTML pages. Existing realm anchors
remain valid, including /lore/frostreach/#rimecut.

The collection contains 92 generated concept illustrations: an atlas cover,
nine realm covers, three dragon-story images and 79 place images. The other 16 destination pages reuse their realm cover
with an explicit Realm concept art caption. Each image
has a visible Concept art label. Every page explains that the artwork shows
a world in development and is not a gameplay screenshot.

## Content and presentation

scripts/lore/content.mjs reads geography from src/mmo/realms.js and the current
story from docs/mmo/14-KALDERA.md. It excludes superseded books, naming drafts
and implementation instructions. Update those sources rather than generated HTML.

scripts/lore/place-notes.mjs adds environmental vignettes. These are explicitly
published as concept notes, separate from authored discoveries and planned rules.
The source geography, named characters, encounters and mechanics are preserved.
Story outlines remain collapsed by default with spoiler labels.

The static presentation is separated into layout.mjs (shared shell and artwork),
pages.mjs (atlas, realm and story compositions), and place-page.mjs (destinations).
src/lore/atlas.css owns the responsive layout and restrained hover effects. src/lore/motion.js adds optional scroll parallax
and sequenced reveals, respecting reduced-motion settings.
src/lore/search.js enhances the index with local search across all named places.
Reading and navigation work without JavaScript.

Artwork and provenance are documented in [the art inventory](art/lore/README.md).
The generated images live in public/lore/art; their prompts, dimensions and
checksums are recorded in docs/art/lore/manifest.json. Artwork below the first
cover is lazy-loaded. Each page has its own canonical URL and social cover.

## Build and release

Run npm run build:marketing. scripts/build-lore.mjs emits the 106 pages,
hashed CSS and JavaScript, all required artwork, sitemap and robots file into
dist-marketing. A missing image fails the build. No game bundle is built into
this output.

Deploy only wrangler.marketing.jsonc to publish website changes. Its Worker
is brackenwake-marketing in account 0b55a6c39a979a58efbf40875ac376d6.
The existing GAME binding continues to serve /play and game assets from the
separate brackenwake Worker. Deployment evidence is recorded in
outputs/public-lore-deployment.json.

## Verification

- node --test src/lore/lore.test.mjs server/marketing.test.mjs src/welcome/welcome.test.mjs src/welcome/video.test.mjs
- node scripts/lore/verify-illustrated.mjs checks complete coverage, unique images, image dimensions, displayed artwork, concept notes and CSS safeguards.
- npm run build:marketing
- node scripts/verify-public-lore.mjs [origin] checks every HTTP page, place anchor, concept note, canonical URL, sitemap and image against the current local file.
- node scripts/verify-public-play.mjs [origin] checks the production game entry, modules, artwork, redirects and an isolated WebSocket upgrade.

For native browser review, run node tools/qa/illustrated-lore-preview.mjs and
open http://localhost:8797/lore/ in the existing Brave window. The /mobile/
route embeds the actual pages at 390 pixels. The /review/greenwold/ route and
equivalent realm routes show their concept-art collections for inspection.
These preview tools are local only and are not deployed.
