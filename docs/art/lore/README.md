# Illustrated world atlas

These are concept illustrations for Brackenwake's world in development.
They are not gameplay screenshots and do not promise that the depicted
architecture, characters or mechanics are implemented.

The collection includes the atlas vista, nine realm covers, three dragon-story
illustrations and 79 individual place images, 92 illustrations in all.
The remaining 16 destinations use their own realm cover and a Realm concept art
caption, following the decision to finish with the existing art collection. Dedicated place
pages reuse their place illustration as the cover and social-sharing image.
Realm encounter and story sections reuse relevant illustrations from that realm.

## Source and generation

All images were requested individually through the built-in image_gen tool.
The prompt inventory is in scripts/lore/art.mjs. Scene details come from
src/mmo/realms.js and the current story in docs/mmo/14-KALDERA.md.

The intended style is painterly fantasy concept art with angular forms,
atmospheric depth, coherent architecture and readable environmental detail.
Images contain no interface or baked-in captions. The website adds the visible
Concept art label, keeping that disclosure readable at every display size.

Final images live in public/lore/art. They are encoded with the existing cwebp
utility at quality 84, preserving the generated composition and dimensions.
The original generated PNGs remain in the image-generation tool's local output
directory. No external provider credentials are used or stored in this folder.

Run node scripts/lore/art-metadata.mjs after artwork is complete to record
the individual prompts, final-file dimensions, byte counts and SHA-256 hashes
in manifest.json. The manifest is an inventory, not a generation runner.

## Lore extensions

scripts/lore/place-notes.mjs contains new environmental vignettes for all places.
The pages label these as concept notes. Existing geography, named people,
discoveries, encounter names and planned rules are retained from the authored
world source. The vignettes do not create runtime mechanics or change game data.

## Design review

| Before | After |
| --- | --- |
| Text-only realm cards | Individual illustrated covers, quieter labels and open card spacing |
| Plain realm headings | Full-width landscape covers with page-specific social images |
| Short place entries only | Dedicated place pages with concept notes, discoveries and onward links |
| Repeated text sections | Related artwork accompanies landscape, encounter and story content |
| Dense mobile navigation | Larger links, two-column phone navigation and expandable realm directories |
| Limited interaction feedback | Gentle scene parallax, sequenced content reveals, image zoom, clear hover and focus states, reduced-motion support |
| General development note | Visible Concept art badges on every illustration and explicit concept-note disclosures |
| Repeated regional art on destination rows | A spacious typographic place directory for destinations sharing a realm cover |
| Search led to long realm pages | Search opens the matching illustrated destination directly |

The desktop atlas uses an offset gallery rhythm with large landscape covers.
On smaller screens it becomes a straightforward two-column or single-column
reading flow. Motion is optional and never makes content depend on JavaScript.
