# Working on Nostrux Homestead

This is a game. Work on it like a game designer, not a ticket taker.

## The standing instruction

**A request is a starting point, not a specification.** When asked to add a
thing, work out what that thing means for everything already here, what it
needs in order to actually function, and what would have to be true for a
player to notice it working. Then build all of that, and verify it, without
being asked.

The user should not have to think of the second-order effects. That is the job.

## What that means in practice

### Trace the whole path, not the entry point

An effect is not done when the code that causes it exists. It is done when it
survives every system it passes through on the way to the player.

Real failures from this project, each of which shipped and had to be caught by
the user:

- A story card handed over jam, bread and cheese. It went through `addGood`,
  which is capped by storage. The barn was full, all nine items were silently
  dropped, and the card looked broken. **The gift was real; the path was not.**
- Twenty modifier keys were written to the save and read by nothing at all. The
  writer existed, the consumer did not, and every hint promising "+40% prices"
  was decoration.
- Nine unlock ids were pushed into `owned` and matched no catalog entry, so the
  item never appeared anywhere.
- `chopIce` needs four strikes. The code called it three times, so "cut a hole"
  never cut a hole.

Before calling anything done: follow the value from the moment it is created to
the moment a player could see it, and check every hop.

### Check the units against the game clock

A season is 3 real days. A day/night cycle is 6 minutes. `SEASON_MS` and the
cycle length are the source of truth, not intuition.

Every timed modifier in the story system was originally expressed in real days,
which made "post a watch tonight" last 240 nights and "for this season" last
four seasons. **If copy says a duration, the code has to mean the same
duration.** Use `nights`, `seasons`, `permanent`.

### One case is never the case

When adding something to a theme, biome, tool, season or character, check all
of them. Only Sakura had harvestable trees and rocks; four of five biomes
shipped an axe and a pickaxe that did nothing. Only after being asked did the
other four get fixed, and a `auditHarvestFields()` guard added so it cannot
regress.

If the fix is "add it to the other four", also add the check that fails loudly
when a fifth appears.

### Count the slots before adding to a container

The HUD frame art has three tool cells. `TOOLS` had five entries. The extra two
rendered with no CSS position, stacked on top of the first, and the last one in
the DOM ate every click. Tool switching was impossible for days.

Layout containers, pagination, instance buffers and fixed-size arrays all have
capacities. Check them.

### Never claim a number you have not counted

A card read "Six of them, and no hurry about it" with no check that six deer
existed. Bodies can be functions of live state; use that. Where the count is
unavailable, say "several".

The same applies to anything reported to the user: measure it or do not say it.

### Every state change owes the player a confirmation

A silent real effect is indistinguishable from a broken button. An audit of 130
story choices found 50 that changed real state and said nothing, including one
that granted a permanent bonus in total silence.

Goods, coins, reputation, modifiers, promises, and where a navigation choice
took you all need words. Say what did NOT happen too: a gift that did not fit,
a swing that landed on a stump.

### The test path must be the real path

Test mode previewed story choices and applied nothing, so clicking through them
proved nothing while looking like it proved everything. Any harness, preview or
debug mode that diverges from the real code path will eventually hide a bug and
waste the user's time discovering it.

## Verification standard

Do not report a thing as working on the strength of having written it.

- **Measure, do not assert.** "Chopping is rate-limited" is worth nothing.
  "12 clicks in 3ms produce 1 swing, 3 clicks at 800ms produce 3" is the claim.
- **Test both directions.** A gate that lets the right case through is half a
  test; also prove it blocks the wrong one. Every trigger predicate should be
  driven true AND false.
- **Prefer a committed harness to a one-off check.** `scripts/audit-stories.mjs`
  exists because "I tested it" was not good enough and should not have to be
  taken on faith again.
- **Beware the module-instance trap.** A dynamic `import()` in the browser
  console gets a DIFFERENT module instance than the running app, with its own
  empty module state. Reads through it will lie. Use `window.__nostrux`.

## Reporting

State what was measured and what was not. If part of the work is unverified,
say which part. Never describe a mechanism as if its existence were evidence
that a player would experience it.

When the user finds something broken, find out whether it is one bug or a
class, and fix the class.

## The game itself

- Three.js + Vite, dev server on 5199, in-app browser tab `seed`.
- `window.__nostrux` exposes `{ farm, game, pool, loadFarm, audio, effects,
  myPk, landmarks, trees, scenery }`. `farm` and `game` are getters.
- Progression runs on coins, work and time. Nostr supplies identity and the
  broadcast only, and never feeds progression.
- Prose style: no em dashes. Write like an author, not a UI. Name the subject
  in the first line of any card; voice comes from how a character says a thing,
  never from withholding what the thing is.
- Before touching the user's save, back it up. Restore it afterwards and say so.
