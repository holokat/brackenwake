# Wiring combat.js into interact.js

`src/game/combat.js` and the combat half of `src/world/fauna.js` are finished
and tested (`node src/game/combat.test.mjs`, 104 checks; `node
src/world/fauna.test.mjs`, 118, up from 86). Neither file touches interact.js,
main.js, player.js or state.js. Below is every line those files need.

Nothing here has been run in a browser. Everything stated as a number was
measured in node; anything visual is marked UNVERIFIED.

---

## What the two new surfaces are

`fauna` (already on `runtime.fauna`, world_runtime.js line 62) gained four things:

```js
fauna.hitTest(x, z, radius)   // live animals within radius, NEAREST FIRST, horizontal
fauna.animalAt(mesh)          // a picked mesh (or the farm hit column) -> the animal, or null
fauna.damage(animal, n, fromX, fromZ, now)   // -> { kind, quarry, damage, hp, hpMax, killed, heading } or null
fauna.isLive(animal)          // on its feet (or on the wing) and still on the field
```

`damage` is the only thing that changes an animal, and it never moves one: it
writes `state`, `heading` and `speed` on the same `userData.roam` record the
farm's `_spookDeer` writes, and the wander loop in fauna.js does the running. At
zero hp it sets `state = 'dead'`, which is the tip-over-and-sink path that was
already there, and the body despawns permanently, so the animal you killed does
not stand up again while you are stood in that chunk.

`combat.js` exports `WEAPONS`, `weaponFor`, `LOOT`, `lootFor`, `auditLootTable`,
`pickTarget`, `resolveSwing`, `swingText`, `lootText`, `nameFor`, `anA`.

## 1. The import

interact.js line 10 already reads:

```js
import { chopTree } from '../farm/tree_edit.js';
```

Add under it:

```js
import { pickTarget, resolveSwing, swingText, lootText } from './combat.js';
```

## 2. One pure helper, next to `hitPoint`

interact.js already has, at module scope:

```js
/** Where a picked tree or rock actually stands, in world space if we were given it. */
function hitPoint(t) { ... }
```

Add under it:

```js
/**
 * How far the thing under the cursor stands FROM the cursor. Infinity for a
 * pick that is not a tree or a rock, which is what lets an animal win by
 * default when there is nothing else there.
 */
export function aimDistTo(pick, aim) {
  if (!aim || !pick || pick.kind !== 'tree') return Infinity;
  const p = hitPoint(pick.tree);
  return p ? Math.hypot(p.x - aim.x, p.z - aim.z) : Infinity;
}
```

Worth a test both ways in interact.test.mjs: a tree pick with a point gives the
real distance, a site pick and a null pick both give Infinity.

## 3. Where the cursor points, in `createInteract`

interact.js lines 108 to 109 already read:

```js
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
```

Add under them:

```js
  const aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const aimHit = new THREE.Vector3();
```

and add this function directly under `pickNow()`:

```js
  /**
   * Where the cursor meets the ground the player is standing on. Only valid
   * straight after `pickNow()`, which is what aims the raycaster. Null when the
   * cursor is on the sky, which is a real answer: you cannot swing at the sky.
   */
  function aimNow() {
    aimPlane.constant = -(player?.pos?.y ?? 0);
    const p = raycaster.ray.intersectPlane(aimPlane, aimHit);
    return p ? { x: p.x, z: p.z } : null;
  }
```

## 4. The swing itself

Add this function inside `createInteract`, next to `act`:

```js
  /**
   * Swing what is in hand at what is in front of you. `runtime.inDungeon` hands
   * combat.js no fauna at all: the animals are still standing in memory with the
   * overworld switched off, and their coordinates are the ones directly over
   * your head, so without this you would club an invisible deer through the roof
   * of the dungeon. Same fact, same trap as the raycaster note in OPEN-WORLD.md.
   */
  function swing(aim, now) {
    const res = resolveSwing({
      fauna: runtime.inDungeon ? null : runtime.fauna,
      tool: state.tool,
      playerPos: player?.pos,
      aimPos: aim,
      now,
      lastSwingAt,
    });
    if (res.hit) lastSwingAt = now;
    const line = swingText(res);
    if (res.killed && res.loot) say(`${line}, ${lootText(res.loot)} left on the ground`);
    else if (line) say(line);
    return { action: res.hit ? (res.killed ? 'kill' : 'hit') : 'blocked', reason: res.reason, swing: res };
  }
```

Read the loot paragraph below before you keep that `say` line: it is the honest
one for a game whose pack cannot hold venison yet, and it has to change on the
same day the pack can.

## 5. `click()`: the animal in front beats the tree behind

interact.js currently ends with:

```js
    click() {
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      return act(decide(pickNow(), state.tool, player?.pos, now, lastSwingAt));
    },
```

Replace it with:

```js
    click() {
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      const pick = pickNow();
      const aim = aimNow();
      // Which did you mean? Whichever is nearer the cursor. `pickTarget` only
      // looks: it takes no hp and starts no flee, so asking is free and the
      // swing that follows takes exactly the animal the question named.
      const beast = pickTarget({
        fauna: runtime.inDungeon ? null : runtime.fauna,
        tool: state.tool, playerPos: player?.pos, aimPos: aim,
      });
      if (beast.animal && beast.aimDist <= aimDistTo(pick, aim)) return swing(aim, now);
      return act(decide(pick, state.tool, player?.pos, now, lastSwingAt));
    },
```

Three things about that, all deliberate:

- **`<=`, not `<`.** With no tree under the cursor `aimDistTo` is Infinity, so
  any animal in reach wins; with a tree at exactly the same spot the animal wins,
  because a deer standing in front of an oak is what you were aiming at.
- **The tree still wins when it is nearer the cursor**, even with a rabbit at
  your feet, which is the case that makes chopping usable in a meadow full of
  them.
- **`lastSwingAt` is shared with chopping on purpose.** It is one arm. You cannot
  alternate a swing at a deer and a swing at an oak to get double the rate.
  Each side applies its own gate to it: `SWING_MS` (450) for a tree,
  `WEAPONS[tool].cooldown` for an animal.

## 6. The hover line (optional, and the same rule)

`update()` currently reads:

```js
  function update() {
    hint(hoverText(pickNow()));
  }
```

Make it:

```js
  function update() {
    const pick = pickNow();
    const aim = aimNow();
    const beast = pickTarget({
      fauna: runtime.inDungeon ? null : runtime.fauna,
      tool: state.tool, playerPos: player?.pos, aimPos: aim,
    });
    if (beast.animal && beast.aimDist <= aimDistTo(pick, aim)) {
      hint(`${nameFor(beast.animal.userData.wild?.kind)}, click to swing`);
      return;
    }
    hint(hoverText(pick));
  }
```

(with `nameFor` added to the import). The same precedence as the click, computed
the same way, so the hint can never name one thing and the click hit another.

## 7. main.js

**Nothing.** `interact.click()` already runs on every click (main.js line 250)
and `createInteract` already receives `runtime`, which has carried `fauna` since
world_runtime.js line 62. The tool keys 1 to 4 already set `state.tool`, and
`WEAPONS` keys off exactly those four ids.

The one thing main.js may want later: the bow. `resolveSwing` refuses a bow with
reason `'ranged'` and the line "a bow is for shooting, not for clubbing, take out
a hand or an axe". The day an arrow exists, pass `allowRanged: true` and the same
call resolves at the bow's 45 m; that path is tested (it drops a gull at height,
which no melee weapon can reach).

## The copy

Every branch says something except the cooldown, which says nothing for the same
reason interact.js says nothing when a chop is on cooldown: the swing 400 ms ago
already spoke, and a toast per click buries it.

| what happened | the line |
| --- | --- |
| a blow that does not kill | `the axe lands on the wolf, and it runs` |
| the same with hands | `your hands land on the wolf, and it runs` |
| a kill | `the deer goes down` |
| a kill, plus the loot clause | `the deer goes down, 2 venison left on the ground` |
| nothing in reach | `you swing at nothing, the nearest of them is 7 m off` |
| nothing anywhere near | `you swing at nothing` |
| a gull overhead | `the gulls are well out of reach up there` |
| a bow | `a bow is for shooting, not for clubbing, take out a hand or an axe` |
| on cooldown | nothing, on purpose |

`swingText(res)` returns all of those except the loot clause. That clause is
deliberately NOT in `swingText`, and this is the part that needs your decision.

## The loot, and the hole under it

`lootFor(species)` returns `{ good, n, name, sell, coins }`:

| species | good | n | coins at a market |
| --- | --- | --- | --- |
| deer | `venison` | 2 | 12 |
| wolf | `game_meat` | 2 | 8 |
| fox | `game_meat` | 1 | 4 |
| rabbit | `game_meat` | 1 | 4 |
| squirrel | `game_meat` | 1 | 4 |
| gull | `game_meat` | 1 | 4 |

Both goods are real rows in `src/farm/catalog.js` GOODS today, and
`auditLootTable()` throws at module load if a species ever loses its row or names
a good the catalog does not have. There is no pelt, hide or feather in GOODS, so
nothing promises one.

**`state.js` cannot hold either of them.** `state.add` takes `wood`, `stone` and
`ore` and warns on anything else (state.js: "is not a material this game
carries"). So a kill has three possible endings, and you own the choice because
state.js and shop.js are yours:

- **A. Say what fell, credit nothing** (what the line in section 4 does). Honest,
  works today, and the copy says "left on the ground" rather than claiming a pack
  entry that never happened. This is the recommended stopgap.
- **B. Give the pack a goods bag.** `state.goods = {}`, `state.addGood(id, n)`
  with a cap and the same never-silent return shape as `add`, saved in the same
  versioned blob, and `shop.js` sells `venison` and `game_meat` at the catalog
  price the same way it sells wood. Then the line becomes
  ``say(`${line}, ${lootText(res.loot)} in the pack`)``, and the market pays the
  12 coins for a deer. This is the real answer.
- **C. Credit coins on the kill** (`state.earn(res.loot.coins)`). One line, works
  today, and it is a lie: there is nobody out here to buy a haunch of venison.
  If you take it anyway, the copy has to say so, and nothing in combat.js will
  write it for you.

Whichever you take, the rule from CLAUDE.md holds: **the line and the state
change have to mean the same thing.** That is why `swingText` on a kill says only
`the deer goes down`, and the loot clause is a separate call the caller makes
after it has really put something somewhere.

## What you should see once it is wired (UNVERIFIED, visual)

- Walk up to a rabbit and click: it dies in one blow, whatever is in hand.
- Walk up to a wolf bare handed: four blows, and it is running between each of
  them, which at 9.6 m/s means you will not land the fourth. Take the axe.
- Two rabbits at your feet: the one under the cursor is the one that dies.
- A deer in front of an oak: the deer. Step aside so the oak is under the cursor
  and the axe goes back to the tree, with no change of tool.
- Gulls stay uninteresting to a swing, and say so once rather than every click.
