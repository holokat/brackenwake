# Brackenwake welcome page

The marketing page at `/welcome/` is one viewport of artwork, with a centered
logo and a single “Enter the game” link to the existing game at `/`.
Run `npm run dev` and open `http://localhost:5198/welcome/`.
`npm run build` emits both the game and the welcome page.

The hero fills 100vw by 100vh, using 100dvh where supported to fit mobile browser
chrome. It has no scrolling, lower sections, top navigation or motion control.
The existing artwork in `public/ui/` is reused without modifying those assets.
The marketing hero also plays `public/ui/brackenwake-ambient-loop.mp4`, generated
from the character-creation background by Grok through the existing Cloudflare
AI endpoint and video receiver. The original image remains underneath until
playback starts, and remains the fallback when playback is denied or fails.
Pointer parallax, sunlight, pollen and leaves remain. System reduced motion
stops the effects; hidden documents suspend animation. No character saves,
local preferences or multiplayer connections are accessed by this page.

## Source ownership

- `welcome/index.html`: hero, centered brand and game entry.
- `src/welcome/main.js`: composition, entrance reveal and cleanup.
- `src/welcome/motion.js`: pointer depth and animation lifecycle.
- `src/welcome/video.js`: muted looping playback, image fallback, reduced motion,
  hidden-document suspension and media cleanup.
- `src/welcome/atmosphere.js`: one canvas for leaves and pollen.
- `src/welcome/base.css` and `world.css`: controls and full-viewport composition.
- `public/welcome-sigil.svg`: pine shield ornament.

Google Fonts supplies Cormorant Garamond and DM Sans, with system font fallbacks.

## Hero-only revision

| Before | After |
| --- | --- |
| Three scrolling sections | One full-viewport hero |
| Logo aligned left | Logo centered at the top |
| Top navigation and duplicate game button | One central game button |
| Scroll invitation and footer | Artwork fills the remaining space |
| Motion toggle and saved website preference | Automatic effects respect device reduced motion |
| Character preview and scroll controllers | Focused hero motion controller; unused modules removed |
| Minimum heights forced short screens to scroll | Viewport sizing and compact layouts for short screens |

## Verification

`node src/welcome/welcome.test.mjs` mounts the actual motion controller with only
the remaining hero elements. It verifies local assets, mouse parallax, touch
handling, reduced motion, hidden-document suspension, and listener/frame cleanup.
`npm run build` checks both Vite entry points. Browser visual inspection is
separate from these automated checks.

## Ambient video

The final H.264 MP4 is 1264 × 720 at 30 fps, with no audio track. It slows the
12-second Grok render, blends its tail into the opening, and adds a one-percent
zoom cycle. A short final easing into the opening frame closes the loop.
`outputs/background-video/verification.json` records measured duration, size and
the decoded frame difference at the loop boundary. Generation metadata, prompt
and the finishing script are in the same directory. Provider credentials are
not stored there. This video is installed on the marketing page; character
creation still uses its original image.

| Before | After |
| --- | --- |
| Static village background | Silent ambient video over the existing image |
| No media lifecycle | Playback waits for decoded frames, pauses when hidden, and respects reduced motion |
| Generated clip had audio and a discontinuous ending | Audio removed, motion slowed, cyclic blend and closing frame added |

`node src/welcome/video.test.mjs` checks the actual playback controller, including
autoplay denial and a delayed play promise after the document becomes hidden.
Both welcome tests and the Vite build pass. The full game suite also ran and
reported four failing suites in inventory, editor and wayside code, outside this
change. The full log is `/tmp/brackenwake-welcome-video-tests.log`.
