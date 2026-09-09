# Local entry and combat review

Run the existing Vite dev server on port 5317 (`npm run dev -- --port 5317 --strictPort`) and `node tools/qa/review-collector.mjs`. Open these pages in an existing Brave window:

- `/tools/qa/localhost-entry.html`: tests actual character creation, disk storage, reload, roster selection, and game entry. It refuses to replace an existing roster. It backs up Brackenwake keys, restores them, and returns to `/play` when complete. This is character entry, not account authentication; the game has no account login.
- `/tools/qa/combat-review.html`: uses an isolated, temporary character. Exercises HUD drag payloads and item swaps, captures level 2 fixture lighting, then checks Morva's doorway response. Captures are sent to the collector's temporary output directory.

The combat review uses a worker-driven clock to finish in a background tab without stealing browser focus. It restores the browser clock after completion. This is a functional and visual check, **not an FPS benchmark**. Use the performance review with a visible tab for frame timing.

The QA HTML files are outside Vite's production inputs. The collector binds only to loopback and accepts the dedicated localhost test origin.
