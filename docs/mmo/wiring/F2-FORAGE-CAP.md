# F2: two of each, and one bunch to a tree

The user's report, in full:

> "we have far too many forageable materials around a single tree. we can pick
> like 20 oyster mushrooms, 20 garlic.. its just ridiculous. i want to be able
> to pick maybe 2 of each max if that."

G10 made the cluster the pickable and thinned every `per`, which fixed the
chunk and left the tree alone. Two things were still wrong, and they multiply
each other.

1. **Every near-tree bunch chose a tree at random.** A chunk holding one tree
   in an open meadow hung every bunch it rolled on that one tree. Measured on
   the shipped table, one tree in Spring carried 14 bunches and 78 plants, 57
   of them wild garlic.
2. **A bunch was big.** Wild garlic rolled 6 to 16 plants and chanterelle 3 to
   8, and `yieldFor` hands over at least 60% of a bunch at skill 0, so one
   click really could give sixteen garlic.

## What changed

| file | what changed |
| --- | --- |
| `src/world/forage.js` | `TREE_CLUSTER_MAX` 2 and `GROUND_CLUSTER_MAX` 3 with `clusterCapFor(place)`; `placeForage` deals the chunk's trees out one to a bunch; 13 of the 22 `cluster` bands rewritten to the caps; `auditForage` refuses an entry over its cap; note 6 in the header block |
| `src/game/foraging.js` | prose only: the worked examples were written around a bunch of seven and a bunch of seven no longer exists |
| `src/world/forage.test.mjs` | 221 checks: three new blocks, one tree, twelve trees, a 448 chunk sweep, and the cap audit driven both ways |
| `src/game/foraging.test.mjs` | 141 checks: the cap sizes driven through `yieldFor`, and every synthetic patch resized to something the world really grows |
| `src/game/app/systems/ui.js` | one stale comment |
| this document | |

`dressing.js` and `zones.js` were not touched; they belong to other work in
flight.

### One bunch to a tree

`placeForage` builds a pool of the chunk's tree indices per forage kind and
splices one out per bunch, so no tree is dealt the same kind twice. When the
chunk rolls more bunches than it has trees the extras are DROPPED, not stacked:
a lone tree is a lone tree. Trunk kinds and near-tree kinds are separate kinds,
so one oak may still carry a hive and a bunch of chanterelles, one each.

`flora.treesFor(cx, cz)` hands back only that chunk's own trunks, so the rule
is global and not merely per chunk: a tree belongs to exactly one chunk's list.

### The bunch is capped in the table, not on the way out

The caps are enforced by `auditForage`, which runs at module load, rather than
clamped inside `placeForage`. `f.cluster` is therefore the truth about what
will stand there, nothing downstream has to clamp it a second time, and a
twenty third forageable written with the reference's own cluster of sixteen
cannot ship.

## The numbers

One tree in a 64 m meadow chunk, the case the report is about:

| season | bunches before | plants before | bunches after | plants after |
| --- | --- | --- | --- | --- |
| Spring | 14 | 78 (57 wild garlic) | 4 | 5 |
| Summer | 13 | 51 (30 chanterelle) | 4 | 5 |
| Autumn | 20 | 60 | 7 | 10 |

The same chunk with thirty trees, where the pickable count barely moves because
a bunch of two is still a bunch:

| season | pickables before | plants before | pickables after | plants after |
| --- | --- | --- | --- | --- |
| Spring | 31 | 177 | 31 | 65 |
| Summer | 43 | 200 | 40 | 81 |
| Autumn | 32 | 91 | 34 | 54 |

Over 448 chunks of every biome, both moisture bands and all four seasons:
11,679 bunches, sizes 3,329 ones, 5,226 twos, 3,124 threes, none over its cap,
1.98 plants in the average bunch. The widest patch is 1.99 m across with a
plant 1.26 m off its own centre, which is why `foraging.js` still measures the
reach to the nearest plant and not to the middle.

At skill 0, `ceil(2 * 0.6) = 2` and `ceil(1 * 0.6) = 1`, so a beginner takes
both plants off a tree bunch and the cap really is "2 of each max" rather than
"2 stood there and you got 1".

## What the tests prove

- `forage.test.mjs`: one tree carries at most one bunch of a kind and at most
  2 plants of a kind, in all three growing seasons; with twelve trees over 100
  chunks, 1,148 tree bunches and 0 clashes, with the nearest-trunk attribution
  itself checked (farthest bunch 2.87 m from its tree, closest two trees
  10.37 m apart); no bunch anywhere in 448 chunks over its cap.
- `foraging.test.mjs`: `yieldFor(0, 2) === 2`, `yieldFor(0, 1) === 1`,
  `yieldFor(0, 3) === 2` and `yieldFor(100, 3) === 3`; every forageable read as
  a patch at every size it can really grow to.

One pre-existing test fragility was fixed on the way past. The harvest-through-
a-real-field block chose "the first bunch with more than two plants" and then
assumed a ray straight down would hit it. A bramble scatters its leaves off the
stem, so a vertical ray down the plant's own axis passes through the hole in
the middle and finds nothing; the block now MEASURES which bunches a straight
down ray finds and picks one of those. That is a fact about a vertical ray and
not about picking, which arrives at a camera's angle.

## Not verified

Nothing was run in a browser. The claims above are all from the two committed
harnesses and `npx vite build`, which exits 0.
