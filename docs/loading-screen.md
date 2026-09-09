# Initial loading screen

The game entry HTML shows the roster landscape, parchment typography, a small
lantern, and an animated trail while the game starts. The copy opens with
“A moment by the fire.” The landscape is the existing 221 KiB
`public/ui/roster-bg.webp`, preloaded for reuse by character selection. The
screen adds no image, font, package, WebGL scene, or sound download.

## Startup contract

- `tools/boot_screen.mjs` includes `src/game/ui/boot-screen.js` directly in the
  entry HTML before the deferred game module runs. The loader retains diagnostics for
  module requests without needing another script request.
- `src/game/app/boot_lifecycle.js` wraps the existing boot. It reports when
  world preparation starts, when the roster/creation/game is mounted, and
  when boot throws or returns the terrain-loading failure object.
- After eight seconds, the text acknowledges the wait. After 45 seconds, it
  offers a retry while continuing to wait. Time alone never declares failure.
- Startup error reports keep the loading indicator and artwork active, expose
  retry, and retain the first diagnostic in a disclosure using text content.
  They do not change the heading to a failure message or stop the animation.
  Only a ready event dismisses the loader; a later successful boot can finish
  normally after an earlier request error.
- Readiness allows two animation frames for the underlying screen to paint,
  then fades for 240 ms. Reduced motion skips the fade and stops the decorative
  animations. The game and HUD stay inert until the cover is removed.
- The live status is outside the game’s busy region so waiting announcements
  are not withheld until boot completes. Timers and global listeners are
  removed on completion. No storage keys or character data are changed.

## Review locally

Open `http://localhost:5198/tools/qa/loading-screen.html`. It loads the actual
entry HTML and controller with the game module omitted, so the screen stays
available to inspect. Controls exercise loading, request issues, details, retry,
completion, and a 390 px viewport.

“Test game boot” loads the real entry with temporary in-memory local and
session storage installed before any modules execute. It reaches character
creation without opening the player's saves. Restart disposes that iframe.

Use the regular Vite server on 5198. A pre-existing server created with a fixed
plugin list needs a restart to include the new HTML plugin.

## Verification, 2026-09-09

- Nine loading tests pass, including slow recovery, rejected and resolved
  failures, failed entry imports, diagnostics, retry, reduced motion, cleanup,
  and inline HTML inclusion. Existing wiring tests pass, 192 checks.
- Vite production build passes. Its generated entry contains the inline
  controller and hashed stylesheet. No game deployment was performed.
- Brave review passed for the full desktop and 390 px layouts, slow text,
  failure/details, retry, completion, and real startup into character creation.
- Full `npm test` completed with failures in the existing editor fixtures,
  world-map timing budgets, and wayside timing budget. The isolated map rerun
  passed all 367 checks. Wayside still reports one timing failure; these files
  and their thresholds were not changed by this work.

Run the focused checks with `node src/game/ui/boot-screen.test.mjs` and
`node src/game/wiring.test.mjs`. The repository uses npm and has no `check`
script; its build is `npm run build`.

## Loading continuity correction

The user observed a failure message followed by successful startup. Error events
now preserve the loading state, busy/inert semantics and existing timers until
readiness. Retry and technical details remain available. This corrects the visual
state; it does not suppress the real rejected promise or console diagnostic.

Ten loading-screen tests pass. The new regression holds the same boot pending
for two simulated minutes, injects both a module error and a failed-phase report,
and verifies that its eventual ready result dismisses the loader without a reload.
The failure-state CSS that stopped the trail and lantern was removed.
