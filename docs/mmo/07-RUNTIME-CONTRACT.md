# Runtime contract: how the rules meet the world

`src/mmo/*` is pure rules (wave one). This document is how those rules become
a running game (wave two). Every module below lives in `src/game/` and may use
THREE and the DOM. The pure layer is never edited to fit the runtime; the
runtime adapts to it.

## The actor

Players and monsters are the same thing to the combat resolver. An actor is:

```js
actor = {
  id, kind: 'player' | 'monster' | 'npc' | 'summon',
  name, tier,                           // tier 0..5 for monsters, undefined for players
  pos: THREE.Vector3, yaw,              // feet on the ground
  stats: { str, dex, int, con, wis },
  skills: { [skillId]: value },         // players: all 52; monsters: the few they use
  bonuses: { ... },                     // summed from equipment and buffs, see items.js
  ar, resists,
  weapon, shield,                       // item records or the monster's natural weapon
  health, maxHealth, mana, maxMana, stamina, maxStamina,
  buffs: [{ id, until, effect }],
  status: { poison?, bleed?, stun?, root?, slow? },   // each { until, level }
  lastSwingAt, casting: castRecord | null,
  faction: 'player' | 'hostile' | 'critter' | 'town',
  ai: { home, aggro, leash, state } | null,           // monsters only
  model: THREE.Group,                   // the thing on screen
  anim,                                 // 'idle' | 'walk' | 'run' | 'swing' | 'cast' | 'hurt' | 'die'
}
```

`src/game/actor.js` builds one from a monster id (`spawnMonster`) or from the
character document (`playerActor`), and `recompute(actor)` sums equipment and
buffs into `bonuses`, `ar`, `resists` and the pools using `stats.js` and
`items.js`. Nothing else touches those derived fields.

## The character document

What is saved. Replaces `state.js`'s small record; `state.js` grows into it.

```js
character = {
  v: 2,
  name, appearance,
  opening,                              // which one was chosen, for the record
  stats, statLocks,
  skills, skillLocks,
  pos: { x, z },
  health, mana, stamina,                // as left
  gold,
  pack: { slots: 20, items: [item | null] },
  equipment: { [slot]: item | null },
  bar: [abilityId | null x 12],
  discovered, deadUntil: [],            // sites found; monsters killed and when they return
  settings: { music, sfx, shadows, ring, pixelRatio, grass, textScale, invertDrag, sensitivity },
}
```

Migration from v1 (`brackenwake-save-v1`): wood, stone, ore become stacks in
the pack; coins become gold; tools become equipped items (axe in mainHand,
pickaxe in the pack, bow in ranged); position carries over. A player who had a
save gets a Blank opening with 50s and 200 skill points to place, since nothing
about their old character was recorded.

## The frame

```
input.beginFrame
dev or player:  intent -> player.update -> jump/fall -> actor.pos
camera.update
runtime.update (world streaming, flora, fauna, sites, dungeon)
monsters.update(dt)      aggro, leash, path toward target, swing when in reach
combat.update(dt)        resolve queued swings and casts, apply results, poison and bleed ticks, deaths
abilities.update(dt)     cooldowns, cast timers, buff expiry
floaters.update(dt)      rising numbers
hud.update               pools, target frame, bar cooldowns
sc.setDay, sc.follow, render
input.endFrame
```

## Modules

### `src/game/floaters.js`
`createFloaters(sc, root)` with `spawn(worldPos, text, kind)` and `update(dt)`.
Kinds and styles from `02-COMBAT.md`. Projects to screen each frame, rises
1.6 m over 1.2 s, fades in the last third, six live per target, oldest goes
early. Skill and stat gains use the `gain` and `stat` kinds and are the largest.

### `src/game/monsters.js`
`createMonsters(sc, runtime, opts)`: spawns from `monsters.js` HABITAT by
chunk hash and time of day the way fauna does (near ring only, a cap of 40
alive), builds a placeholder model per kind (a box rig coloured by tier until
Blender models land; the model contract is `buildMonsterModel(id)` returning a
group with `parts` like the player's), runs the AI: idle at home, aggro when
`aggroCheck` says so, path straight at the target with terrain following,
swing through `combat.queueSwing` when within reach, leash home, flee per
`fleeCheck`, die and drop a loot bag, respawn per the timings. Groups share
aggro. `targets()` for the player's picking.

### `src/game/combat.js` (grows from the current file)
`queueSwing(attacker, defender)`, `queueSpell(caster, spell, target)`,
`update(dt, now)`: resolves through `combat_rules.js`, applies damage, leech,
status, death; hands `lessons` to `progression.js`; hands `numbers` to
floaters; fires `onDeath(actor, killer)`. Falls: `applyFall(actor, metres)`.

### `src/game/progression.js`
`lesson(character, skillId, difficulty, success, rng)` through `skills.js`
`rollGain`, then floaters for any gain, a centre line and sound at milestones,
`statLesson` likewise. Also `recompute` after any change so pools follow stats.

### `src/game/inventory.js`
Pack and equipment operations against the character document: `add(item)`,
`remove`, `move(from, to)`, `equip(item)` and `unequip(slot)` with
`items.canEquip`, `identify(item)` through `affixes.identify` with the
character's INT, `weight()`, `overweight()`. Every change calls
`actor.recompute` and `onChange`.

### `src/game/loot_drops.js`
A loot bag on the ground for 90 s: a small glowing sack coloured by the best
rarity inside, clickable within 3 m, opens a small take-all or take-one panel.

### `src/game/abilities_runtime.js`
The bar (12 slots), keys 1 to 0 minus equals, `use(slot)`: `abilities.canUse`,
costs, `startCast`, interrupt on move or damage, effect interpretation for
every effect kind `abilities.js` defines (damageMult, aoe, dash, leap, summon,
heal, buff, debuff, stun, root, slow, dot, shield, teleport, trap, provoke,
peace, hide). Targeting: enemy under cursor, or nearest hostile in front within
range if none; ground abilities show a ring at the cursor.

### `src/game/npcs_runtime.js`
Places NPCs in settlements from `npcs.js`, a simple standing rig with a name
plate, click to open the talk panel: lines, then buy, sell, train, heal tabs
against the vendor rules.

### `src/game/creation.js`
The character creation screen over a dark scene with the model turning:
openings as cards, the 30 and 30 point sliders with live derived numbers,
appearance, name. Writes the character document and starts the game.

### `src/game/windows.js`
Character (paper doll, C), Bag (B), Skills (K), Abilities (A), Crafting (V),
Map (M), Settings (Escape), Talk, Trade, Death. Plain CSS. One module, one
window open at a time except Bag and Character together.

### `src/game/player.js` additions
Jump (Space): 1.2 m, 0.7 s, momentum kept, `jumpAttack` flag while airborne.
Falling: when the ground drops more than 0.5 m below the feet in a frame the
player goes airborne and falls under gravity 19.6 m/s^2; on landing the step
result carries `landed: { fallMetres }` for `combat.applyFall`.

## Ownership for wave two

| module | owner |
| --- | --- |
| actor.js, progression.js, state.js v2 and migration | agent W1 |
| combat.js runtime, monsters.js runtime, loot_drops.js, placeholder monster models | agent W2 |
| inventory.js, windows.js (Character, Bag, Skills), creation.js | agent W3 |
| abilities_runtime.js, spell and swing effects, floaters wiring | agent W4 |
| npcs_runtime.js, windows.js (Talk, Trade, Crafting, Map, Settings) | agent W5 |
| Blender: character builds and the six starter monsters as glb | agent W6 |
| player.js jump and fall, floaters.js, main.js wiring, verification | Fable |

Every agent reads this file, its `src/mmo/` module, and the design document
behind it. Nobody edits another's files; wiring notes go to Fable.
