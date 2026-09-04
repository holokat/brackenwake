# Wiring fauna.js into farm.js

`src/world/fauna.js` is finished and tested (`node src/world/fauna.test.mjs`,
86 checks). It touches nothing outside itself. Below is every line farm.js and
main.js need, in the order they appear in the files. Line numbers are from the
working tree on 2026-09-04 and will drift; the quoted context will not.

Nothing here has been run in a browser. The claims made below are the ones the
node suite proves, plus the ones marked UNVERIFIED, which are visual.

---

## 1. The import

farm.js line 16 already reads:

```js
import { createFlora } from '../world/flora.js';
```

Add under it:

```js
import { createFauna } from '../world/fauna.js';
```

## 2. Creation, in `_buildWorld()`

farm.js line 2384 already reads:

```js
    this.flora = createFlora(this.scene, field, { sitesNear: this.discovery.sitesNear });
```

Add under it:

```js
    // wild animals follow the near ring in and out, and keep off the farm
    this.fauna = createFauna(this.scene, field, { sitesNear: this.discovery.sitesNear });
```

`sitesNear` is the same `this.discovery.sitesNear` flora gets. It is what keeps
animals out of towns: nothing spawns or steps inside a site's `flatR + 6`.

## 3. The chunk hooks

farm.js lines 2385 to 2389 currently read:

```js
    this.world = createWorldStream(this.scene, field, {
      palette: buildPalette(THEMES), waterMap: waterTexture(),
      onBuilt: (cx, cz, verts) => this.flora.onChunk(cx, cz, verts),
      onDisposed: (cx, cz) => this.flora.offChunk(cx, cz),
    });
```

Replace the two hook lines with:

```js
      onBuilt: (cx, cz, verts) => { this.flora.onChunk(cx, cz, verts); this.fauna.onChunk(cx, cz, verts); },
      onDisposed: (cx, cz) => { this.flora.offChunk(cx, cz); this.fauna.offChunk(cx, cz); },
```

`onChunk` only records that the ground exists. Animals are placed by `update`,
and only on chunks within 3 of the player, so the other 312 chunks of the ring
cost nothing but a Set entry.

## 4. The frame, in `_updateWorld(now, dt)`

farm.js line 3262 already reads:

```js
    this.flora.update(now, t.x, t.z);
```

Add under it:

```js
    this.fauna.update(dt, now, t.x, t.z, this.dayFactor < 0.4);
```

Three things about that line, all deliberate:

- The argument order is `(dt, nowMs, x, z, night)`, not flora's `(now, x, z)`.
  `dt` is in **seconds** and is the same `dt` `_updateWorld` already receives.
- `this.dayFactor < 0.4` is the farm's own definition of night, copied from
  farm.js line 1126 (`const night = this.dayFactor < 0.4;`). Use that
  expression, not a new threshold, or wolves and wolf howls will disagree.
- `_updateWorld` runs **before** the day/night block recomputes `dayFactor`, so
  the flag is one frame stale. At 60 fps that is 16 ms of a 6 minute cycle.

## 5. Teardown

farm.js line 274 currently reads:

```js
    this.world?.dispose(); this.siteMarkers?.dispose(); this.flora?.dispose();
```

Make it:

```js
    this.world?.dispose(); this.siteMarkers?.dispose(); this.flora?.dispose(); this.fauna?.dispose();
```

## 6. Hunting: add the wild animals to the raycast

farm.js lines 4228 to 4235 currently read:

```js
      // hunting: pick the live deer under the cursor (generous target columns)
      this.hoveredDeer = null;
      if (this.huntMode && this.deer && this.deer.length) {
        const targets = this.deer.filter((d) => d.userData.hit && d.visible && d.userData.roam
          && d.userData.roam.state !== 'dead' && d.userData.roam.state !== 'respawning');
        const dHits = this.raycaster.intersectObjects(targets.map((d) => d.userData.hit), false);
        if (dHits.length) this.hoveredDeer = dHits[0].object.userData.deer;
      }
```

Replace that block with:

```js
      // hunting: pick the live deer under the cursor (generous target columns).
      // The farm's own herd and the wild animals of the world are one list here;
      // fauna.targets() already filters out the dead and the dying.
      this.hoveredDeer = null;
      if (this.huntMode) {
        const targets = (this.deer || []).filter((d) => d.userData.hit && d.visible && d.userData.roam
          && d.userData.roam.state !== 'dead' && d.userData.roam.state !== 'respawning')
          .concat(this.fauna ? this.fauna.targets() : []);
        if (targets.length) {
          const dHits = this.raycaster.intersectObjects(targets.map((d) => d.userData.hit), false);
          if (dHits.length) this.hoveredDeer = dHits[0].object.userData.deer;
        }
      }
```

The gate changes from `this.huntMode && this.deer && this.deer.length` to
`this.huntMode`, because in the endless world the wild animals may be the only
thing in range and the farm's own three deer may be a kilometre behind you.

Nothing else in the hunt path needs touching. `_startDraw`, `_updateDraw`,
`_resolveShot`, `_spookDeer`, `_woundDeer` and `_killDeer` all work through
`deer.userData.roam`, which every wild animal carries in the farm's own shape,
and fauna's own updater then honours what they wrote:

| farm.js writes | fauna.js does |
| --- | --- |
| `rm.state = 'flee'`, `rm.fleeUntil`, `rm.speed`, `rm.heading` | bolts on that heading at that speed until the deadline, then settles |
| `rm.hp -= 1` | nothing; the next shot reads the same field |
| `rm.state = 'dead'`, `rm.t0 = 0` | tips over, sinks after 2 s, despawns, and that animal does not come back while you stand there |
| `rm.meatFx` | floats the haunch up and fades it, **from the animal's own ground height** rather than y = 1 |
| `rm.state = 'rage'`, `rm.rageUntil` | charges the player instead of the farm (there is no farm out here), then breaks off and flees |

## 7. Required, or a shot wolf reads as "a critter" (two table entries)

This is the one place fauna cannot finish the path on its own, because both
tables live in files this task was not allowed to touch.

`_resolveShot` looks the quarry up in farm.js's `QUARRY` table (line 57) and
main.js prints the name from `QUARRY_LABEL` (main.js line 3422). The table has
`deer`, `bunny`, `squirrel` and `bear`. World deer, rabbits and squirrels use
those three ids and read correctly today. **Foxes and wolves have no entry**, so
`QUARRY[rm.quarry] || QUARRY.deer` falls back to the deer row and a killed wolf
credits **venison** and prints **"downed a critter"**.

Add to `QUARRY` in farm.js (line 57):

```js
  fox:      { meat: 'game_meat', yield: 1, minTier: 1, hitR: 0.7,  base: 4.4, flee: 2.4, hp: [1, 1] },
  wolf:     { meat: 'game_meat', yield: 2, minTier: 1, hitR: 0.9,  base: 6.0, flee: 2.0, hp: [2, 2] },
```

and to `QUARRY_LABEL` in main.js (line 3422):

```js
  deer: 'deer', bunny: 'rabbit', squirrel: 'squirrel', bear: 'bear', fox: 'fox', wolf: 'wolf',
```

`game_meat` is the good the farm's own rabbits and squirrels already yield, so
it needs no catalog change. `hitR` there is unused for wild animals (fauna sizes
its own hit columns from `KINDS`), but keeping it right means the farm can spawn
one of these itself later without a surprise.

## 8. A bug in the hunt path, found on the way and NOT fixed here

farm.js line 2097, inside `_killDeer`:

```js
    this._spawnBlood(deer.position.x, deer.position.z, rm.quarry === 'bear' ? 1.5 : big ? 1 : 0.55);
```

`_spawnBlood` does not exist. It was renamed to `_spawnLeavings(x, z, scl, type)`
(its comment still explains why the blood pool became a tuft of fur) and this
one call site was missed. `grep -rn "_spawnBlood" src/` returns exactly this
line, in this repo and in newnostrux.

The consequence is not cosmetic. `_killDeer` throws, the throw is swallowed by
`try { a.onDone && a.onDone(); } catch {}` in `_updateArrows`, and the
`this.onDeerResult({ hit, killed, ... })` call that follows `_killDeer` in
`_resolveShot` never runs. So a **lethal shot credits no meat, prints no
message and bumps no stat**, while the animal still tips over and sinks. Every
kill in the game, farm or wild, lands in that hole.

The fix is one line:

```js
    this._spawnLeavings(deer.position.x, deer.position.z, rm.quarry === 'bear' ? 1.5 : big ? 1 : 0.55, q.type || rm.quarry);
```

While you are there: `_spawnLeavings` places its group at `y = 0.04`, which is
sea level in the endless world, not the ground under the animal. Wild kills will
leave their fur floating in the air on a hill or buried in a valley until that
becomes `this.terrainY(x, z) + 0.04`. fauna.js already does this correction for
the meat haunch it can reach (`rm.meatFx`), which is why that one is right.

## 9. What you should see once it is wired (UNVERIFIED, visual)

- Walking a meadow: a deer or two grazing, rabbits darting, all of them breaking
  and running when you get within 20 m (deer) or 12 m (everything else).
- Standing still by a wood at dusk: a fox, or two or three wolves, appearing as
  `dayFactor` crosses 0.4, and gone again at dawn.
- Walking the shore: gulls circling 16 m up, never inland, never mid-ocean.
- Riding out of town: nothing inside the walls, nothing on the river, nothing
  within 130 m of the farm gate.
- The HUD says "crosshair" over any of them in hunt mode, and the shot resolves
  with the farm's own arrow, arc and messages.
