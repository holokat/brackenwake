# Wiring fauna.js

**This page used to be six sections of farm.js line numbers.** It described how
to hang a decorative animal layer off `farm.js`: a hit column shaped like the
homestead's, a `roam` record the farm's `_spookDeer` and `_killDeer` wrote into,
a `QUARRY` table entry so a shot wolf did not read as "a critter". None of that
survives. There is no farm in Brackenwake, the animals of the world are tier 0
monster rows, and `fauna.js` no longer draws anything.

What is left of fauna is placement, and it is wired in one place.

## What it is now

```js
import { createFauna } from '../world/fauna.js';

const fauna = createFauna(field, { sitesNear: discovery.sitesNear });
const recs = fauna.spawnsFor(cx, cz, night);
//  -> [{ id, key, groupKey, cx, cz, i, x, z, y, night }, ...]
```

A record is `monsters.spawnsForChunk`'s record, field for field, and
`fauna.test.mjs` compares the two key sets against a real record from each so
they cannot drift.

- No THREE, no scene, no group, no `update`, no `onChunk` / `offChunk`.
- `sitesNear` is what keeps animals out of towns: nothing is placed inside a
  site's `flatR + SITE_PAD`, birds included.
- Water, rivers, biome and an optional quiet ring are the other refusals, all
  through the one `blockedAt` predicate, which is also what the tests drive.

## Where it is wired

`src/game/world_runtime.js`, and nowhere else:

```js
  const fauna = createFauna(field, { sitesNear: discovery.sitesNear });
  ...
    critterSpawns(cx, cz, night = false) {
      if (dungeon) return [];
      return fauna.spawnsFor(cx, cz, !!night);
    },
```

`createMonsters(sc, runtime, opts)` already holds that runtime. **One line in
`monsters.chunkFor` joins the two and it is not written yet.** It is quoted in
full, with the reasoning and the measurements behind it, in
`docs/mmo/wiring/F1.md`, which is now the page to read.

## What fauna is NOT responsible for any more

Health, damage, fleeing, death, the corpse, the hide, the respawn clock, the
cap, the despawn when you walk away, the name over the head and the colour of
that name. Every one of those is `src/game/monsters.js`'s and
`src/mmo/monsters.js`'s, because a rabbit is a monster of tier 0 and there is
exactly one set of rules for a thing that is standing in the world.
