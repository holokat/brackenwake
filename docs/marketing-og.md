# Marketing sharing image

Generated with the built-in ImageGen tool on September 8, 2026.

- Final asset: `public/ui/brackenwake-og-v1.png`
- Dimensions: 1734 × 907 pixels, PNG
- Marketing URL: https://brackenwake-marketing.cogentgene.workers.dev/
- Source references: the game's `public/ui/roster-bg.webp` and the supplied
  ranger and rogue portraits.
- Open Graph and X large-image metadata is in `welcome/index.html`, with an
  absolute public image URL, dimensions, type and accessible image description.

## Generation prompt

Create a finished premium social-sharing Open Graph image for the fantasy browser game Brackenwake. Wide 1.91:1 landscape composition, ideally 1536 x 804 pixels. The supplied village landscape is the authoritative world and art style reference. The two supplied character portraits are exact character design references. Preserve their charming crisp low-poly polygonal rendering, hooded faces with simple dark eyes, green ranger with bow and red-scarfed rogue with daggers. Art-direct a beautiful illustrated game cover: warm golden sunlight over the magnificent castle, tiny inviting village and turquoise waterfalls, framed by dark emerald forest canopy. Ranger at lower left and rogue at lower right, heroic but charming, partially cropped waist-up, facing inward, together occupying only outer 25% of each side. Keep the center spacious and exceptionally readable. In the center render EXACTLY the game name 'Brackenwake' in large beautifully drawn refined gold fantasy serif lettering, sentence case exactly B-r-a-c-k-e-n-w-a-k-e. Subtle dimensional gold bevel and dark forest shadow, polished book-cover typography, not cheesy block lettering. Under it, much smaller elegant warm ivory text EXACTLY 'The world is waiting'. Tiny delicate gold pine shield emblem centered above the title. Center title must be the dominant readable element even at thumbnail size. Light shafts, a few restrained glowing embers, rich atmospheric depth. A tasteful dark teal vignette behind the lettering blends naturally into the world, with bright castle and warm character faces. High-end handcrafted fantasy game key art, gorgeous balanced cinematic lighting. Keep all lettering at least 12% inset from image edges so sharing crops are safe. NO website UI, no buttons, no browser, no watermark, no additional text, no labels. Render the complete final OG image itself, full bleed.

## Deployment

Build with `npm run build:marketing`, then deploy with
`wrangler deploy --config wrangler.marketing.jsonc` using the existing Wrangler
installation. The configuration explicitly selects the Brackenwake account and
the `brackenwake-marketing` Worker. It publishes the marketing entry at `/` and
links to the live game at `https://brackenwake.com/play`.

The build copies only the marketing artwork and video. It does not compile the
game entry or deploy the multiplayer Worker. The marketing Worker forwards
`/play`, game assets and `/ws/*` through its `GAME` service binding to the
existing `brackenwake` Worker. `dist-marketing/` is rebuildable
and excluded from Git. No dependency was added.

## Validation

The marketing production build, Wrangler dry run, and both welcome-page test
files pass. The generated image was visually reviewed for legible spelling,
safe text margins, sentence case, character fidelity and spacing.

Published Worker version: `0257bb06-937c-4839-aae1-960978aeecf0`.
The public page and generated image returned HTTP 200 for sharing-crawler user
agents. The downloaded image matches the local asset byte for byte. Verification
details are recorded in `outputs/marketing-deployment.json`.
