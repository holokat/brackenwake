# D4: fewer things in the Greenwold

Written 2026-09-06. Files: `src/world/dressing.js`,
`src/world/dressing_density.test.mjs` (new), `src/world/dressing.test.mjs`.
No other realm's kit was touched and no other file was changed.

The brief was the user's: "campfire looking stone circles everywhere" and "so
many rocks that look so bad".

Both were true. Measured over a 31 by 31 chunk square around the origin on the
world seed 20260904, which is 3.94 square kilometres of the farmed country:

```
                before/km2   after/km2   target/km2
sarsen             467.7        28.2         40
hay_rick           296.0        44.7         60
sheep_fold         229.7         4.3         12
dew_pond            54.9         2.0          6
beehive            110.5        23.4         30
```

A sheep fold and a dew pond are both a low ring of stones on the grass. At 285
rings a square kilometre there was one every sixty metres, and every one of
them read as somebody's fire pit.

## The targets

Per square kilometre of open Greenwold, measured with `dressingFor(field, cx,
cz)` over the 31 by 31 chunk square at the origin, seed 20260904:

- sarsen at most 40
- sheep_fold at most 12
- dew_pond at most 6
- hay_rick at most 60
- beehive at most 30

And no two ring shaped things, a fold or a pond, within 200 m of each other, so
each one reads as a landmark and not as a pattern. Measured: the closest two in
the square are 230.7 m apart.

Everything else stays within a fifth of what it was: the hedgerows, the walls,
the gates, the stiles, the wheat rows, the furrows, the sheaves and the road
furniture. Measured: hedgerow -0.5%, drystone wall -1.4%, field gate -1.6%,
sheaf 0.0%, and every field kind under half a per cent.

## Where the test lives

`src/world/dressing_density.test.mjs`. Run it with

```
node src/world/dressing_density.test.mjs
```

or with the whole suite, `npm test`, which walks every `*.test.mjs` under
`src/` on its own. It prints the before and after table above, fails if any of
the five kinds is over its target, fails if any two folds or ponds stand within
200 m, fails if any kind D4 was told to leave alone has moved by more than a
fifth, and fails if the Boneyard has moved by a single prop.

## The two mechanisms, and why not a third

`chance` was already in the kit rows: it takes a kind out of a cell's pool.
That is the wrong tool here, because the weight of a kind taken out of the pool
goes to the kinds left in it. Thinning the sarsens with `chance` would have
grown the sheaves and the hedgerows to fill the hole, which is the one thing
the brief said not to do.

So two new kit fields, both of them vetoes drawn AFTER the kind is picked, so
a refused cell stands empty instead of handing the ground to the next kind
along:

- `rare` puts the kind down only that often. `hay_rick` 0.14, `beehive` 0.20,
  `sarsen` 0.05.
- `spaced: 'ring'` allows the kind only in the anchor cell its ring lattice
  nominates. `sheep_fold` and `dew_pond`.

The lattice is `RING_CELLS` (7) anchor cells a side, 224 m. Each lattice cell
nominates one of its 49 anchor cells and a priority, all of it four hashes of
the lattice coordinates and no ground sampled, so any chunk can work out any
neighbour's nominee cheaply. A nominee stands only if no neighbouring nominee
within `RING_GUARD` claims the ground more loudly. Two survivors inside the
guard would each have to be louder than the other, so there cannot be two: the
spacing is proved by the rule, and the test measures it anyway.

`RING_GUARD` is the 200 m promise plus the whole of the jitter two props could
spend closing it (223.04 m), and it is compared between CELL CENTRES rather
than between props, because which of a cell's four tries lands is not known
without sampling the ground. `dressing.js` throws at import if the lattice ever
gets too small for the 3 by 3 neighbourhood to be the whole of the question.

## Three things this cost, and one it nearly cost

The nominated cell works the ring kinds and nothing else. Left to the weighted
roll it threw six of every ten folds away on a hedgerow that could have started
in any of the other 48 cells, and the folds came out at 1.3 a square kilometre
instead of 4.3.

The veto in `stubborn` is not optional. The Greenwold's most slope tolerant
kind is the sarsen, so every anchor cell whose four rolls the ground refused
put down another boulder: 742 of the 1841 sarsens in the square came through
there and not off the scatter grid.

The veto is asked AFTER the ground gate, not before it. The first cut of D4
asked it first, which took the second and third tries away from every cell that
rolled a rick on a slope, and 21 per cent of the Greenwold's hedgerows went
with the ricks, in a change that was supposed to be about ricks. That is what
the "nothing else moved" half of the test is for, and it is the thing that
caught it.

The open Greenwold is quieter than Z4 left it, on purpose: most anchor cells
now put nothing down. From twenty random open points, the nearest authored prop
went from a worst of 14.52 m and a mean of 8.24 m to a worst of 37.68 m and a
mean of 15.77 m. The world's own promise, something authored inside 60 m from
any open point in any of the nine realms, still holds, and `dressing.test.mjs`
still measures it. The Z4 line that asserted 24 m in the Greenwold has been
replaced by one that allows 48 m and a mean of 22 m, which is the room D4 asked
for and no more.

## What was verified

- `node src/world/dressing_density.test.mjs`, 17 passed, exit 0.
- `node src/world/dressing.test.mjs`, 141 passed, exit 0.
- Every other suite that imports `dressing.js`: `field.test.mjs`,
  `flora.test.mjs`, `sitegrid.test.mjs`, `town_layout.test.mjs`,
  `gear_visuals.test.mjs`, `plans.test.mjs`. All exit 0.
- `npx vite build`, exit 0.
- The Boneyard and the Stormpeaks measured before and after over their own
  31 by 31 chunk squares, in one process, against the module as it stood at the
  previous commit: identical to the prop, 16475 and 14360 of them.
- Not verified in the running game. The change is placement only, it holds no
  THREE, and nothing here was looked at through a camera.
