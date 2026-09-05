# Wave B: towns, caverns, events, vertical. The contract the four builders share.

Written 2026-09-06 by Fable. Four tasks run at once on disjoint files. Each
writes its own note (`T1.md`, `D3.md`, `E2.md`, `V1.md`) in this folder saying
what it built, what it measured, and every line it needs from a file it does
not own. Fable wires those lines and reviews.

Read first: `docs/mmo/14-KALDERA.md` (the world), `docs/mmo/15-PROGRAMME.md`
(the brief), `src/mmo/realms.js` (the sheet: 9 realms, 95 places, each with
`geography`, `contains`, `mechanic`), `src/world/zones.js` (the generated
zones and `authoredSites()`), `CLAUDE.md` (how to work here: trace the whole
path, count the slots, measure, both directions, words for every state
change, no em dashes anywhere).

## Rules for all four

- **Own your files.** The ownership table below is the whole of what you may
  edit. A line you need in someone else's file goes in your note under "Wiring
  Fable has to do", quoted exactly, with the file and the function. Do not
  touch `src/game/app/systems/index.js`, `src/game/state.js`,
  `src/game/hud.js`, `src/game/main.js` or any test you do not own.
- **Stubs are yours to replace.** `src/world/town_models.js` (T1) and
  `src/world/megalith_models.js` (V1) exist as one line stubs and
  `site_models.buildSiteMarker` already calls them; a null answer falls back
  to the old marker. Fill them in.
- **The heart does not move.** `src/world/field.test.mjs` holds a digest of the
  2 km square about the origin. `zones.auditZones()` forbids any authored site
  with a pad inside HEART_SAFE (1500 m). Both must still pass. V1 owns the
  exception for pad-less sites (see V1).
- **Streamed, not global.** Everything you put in the world is built when its
  chunk or site comes into range through `world_runtime.js` and the site
  marker path, and disposed when it leaves. `mergeByMaterial` keeps draw calls
  down; a town is at most a few dozen draws.
- **Every effect has words.** A chest says what it gave and what did not fit.
  An event says it has begun where the player can see it. A waystone says
  what touching it did.
- **Measure.** Committed tests (`*.test.mjs`, run by `npm test`), both
  directions on every gate. Timing suites flake under load; run yours alone.
  `npx vite build` must stay clean.
- **Style.** Prose in the game and the notes: no em dashes, name the subject
  in the first line, an author's voice. Constants named and commented with
  their unit.
- **Do not touch the user's save.** Test in node. The user's characters live
  in localStorage slots 1 and 5.

## The runtime you plug into

- Frame: `src/game/app/system.js`, phases `hotkeys click move update late
  render save`; `frame = { dt, now, nowS, day, night, centre, worldDt,
  worldNow, worldNowS, timeScale }`. Day clock: `src/game/dayclock.js`
  (`DAY_CYCLE_MS` = 25 real minutes, `dayFactorAt`, `phaseAt`).
- `ctx.get('world').runtime` is `createWorldRuntime` in
  `src/game/world_runtime.js`: `field`, `heightAt`, `sitesNear(x,z,r)`,
  `enterDungeon(site)`, `dungeonGo(dir)`, `leaveDungeon()`, `inDungeon`,
  `dungeonLayout()`, `onDiscover`, `onZone`, `zoneNow`.
- Sites: `zones.authoredSites()` gives the 46 authored sites
  `{ id:'z:<place>', sub, realm, kind, name, x, z, flatR, levels, line,
  authored:true }`. `field.sampleAt(x,z)` carries `zone`, `realm`, `danger`,
  `site`, `road`, `water`, `h`. Site markers: `src/world/site_models.js`
  (`buildSiteMarker(site, heightAt)`, `createSiteMarkers`).
- Monsters: `src/game/monsters.js` `createMonsters` returns `spawnAt(id,x,z)`,
  `all()`, `forActor`, `rescan`, `dungeonLayout` consumers. Dungeon rooms are
  spawned by `monster_ai.dungeonSpawns(layout)` which reads `layout.rooms`,
  `layout.entry`, `layout.level`, `layout.kind`, `layout.siteId`; bosses by
  `bossRowsFor(habitat)` on the last level. `src/mmo/monsters.js` has
  `BOSS_BY_LAIR` keyed by the realms place id.
- People: `src/mmo/npcs.js` (roles, `appearsIn`), `src/game/npcs_runtime.js`
  (`streetFor(site, field)`, `npcSpotsFor`, plates, talk).
- Loot: `src/game/loot_drops.js` `rollFor(monsterRow, opts)` and
  `src/mmo/loot.js`; `src/mmo/items.js` `makeItem`. Skills:
  `src/mmo/skills.js` has `lockpicking` and `removeTrap`; `lockpick` is an
  items.js tool base.
- HUD: `hud.toast(text, kind)`, `hud.log(text, kind)`, `hud.zone(name, sub)`.
  Map: `src/game/win_map.js` draws sites from `sitesNear` and zones from
  `zones.js`.
- Dev bench tour: `src/game/win_dev.js` `tourStops()`; every place is one
  press away, so verify your work by warping to it.

## Ownership

| task | owns (may create or edit) | must not touch |
|---|---|---|
| T1 towns | `src/world/town_layout.js` (new, pure), `src/world/town_models.js`, `src/world/town_layout.test.mjs`, `src/game/npcs_runtime.js` and its test, `src/mmo/npcs.js` and its test, `docs/mmo/wiring/T1.md` | site_models.js (the hook is in), zones.js, field.js, roads.js |
| D3 caverns | `src/mmo/dungeons.js` (new: the layout kind, levels, theme, chests and arena per sheet dungeon), `src/world/cavern_gen.js` (new, pure), `src/world/cavern_scene.js` (new), `src/game/chests.js` (new), `src/game/world_runtime.js`, `src/world/dungeon_gen.js`, `src/world/dungeon.js`, `src/game/monster_ai.js` (dungeonSpawns and bossRowsFor only), `src/game/monsters.js` (the dungeon layer: buildLevel, levelSpawns, dungeonRescan only), their tests, `docs/mmo/wiring/D3.md` | state.js (ask for the `opened` key), interact.js (ask for the click line), win_map.js |
| E2 events | `src/mmo/events.js` (new), `src/game/events_runtime.js` (new), `src/game/app/systems/events.js` (new), `src/game/win_map.js` (event and boss markers only), their tests, `docs/mmo/wiring/E2.md` | systems/index.js (Fable registers), monsters.js (use `spawnAt`, `all()`, `forActor`; ask for any hook), hud.js |
| V1 vertical | `src/world/field.js`, `src/world/zones.js`, `src/world/megalith_models.js`, `src/world/terrain_material.js`, `src/world/chunks.js`, their tests, `docs/mmo/wiring/V1.md` | site_models.js (the hook is in), town or dungeon files |

## T1 towns

Seven precincts, `TOWN_PRECINCT_R` = 120 m, already flattened by the field:
Hearthhome (Greenwold, the village on a green inside the ring of stones),
the Canopy Court (Verdant Deep, a court in the trees), the Red Queen's
Harbour (Saltmarch, the pirate port: docks, hulls at anchor, a sea wall,
warehouses, a gallows), the Last Well (Ember Wastes, a walled oasis town
around one well), Cairnfoot (Stormpeaks, stone and slate under the cliff),
Coldseat (Frostreach, timber and ice, palisade), Cinderport (Ashen Throne,
black stone and brass, a Legion town). The sheet's `geography` and `contains`
for each is the brief; read them.

Every town has: a wall or palisade with two to four gates where the roads
arrive (roads.js links settlements; the gates face the links if you can read
them, else the cardinal points), an inn (the largest building, sign, a yard),
a merchant square (open, a well or fountain at the centre, stalls), a smith
(with a forge), a healer, a stable (pens), a bank (stone, one door), a
waystone (a standing stone 4 m tall with a carved face, `userData.waystone =
true` and `userData.site`, at the square's edge), and houses to fill the
rest, in the realm's material and roof palette. Streets are flat strips
between the buildings; nothing stands on another thing.

`town_layout.js` is pure: `layoutTown(site, seed) -> { wall, gates, lots:
[{kind, x, z, w, d, yaw}], square, streets, waystone }`, deterministic, tested
for: every lot inside the precinct, no two lots overlap, the square is empty,
every named building present once, gates on the wall. `town_models.js` builds
it with the kit in `src/farm/buildings.js`, `processors.js`, `camp_models.js`
and primitives, per realm palette, merged by material; measure draw count
(under 60 per town) and triangle count.

People: `npcs_runtime.streetFor` puts the roles at their buildings (the
innkeeper at the inn door, the smith at the forge, the stablemaster at the
pens, the healer at the healer's door, the rest around the square) when the
site has a layout; the old ring stays for rolled villages. `npcs.js` gains a
`banker` role (`appearsIn: ['town']`, service `bank`) so the bank has a
person; the panel that opens is `talk` as for everyone until banking exists.

Acceptance: warp to each of the seven on the tour, see a walled town with the
square and the named buildings, people at them; `town_layout.test.mjs` proves
the plan for all seven and for a rolled town it declines; site_models test
still passes; draw count per town measured and under 60.

## D3 caverns

A second generator beside the room and corridor one. `src/mmo/dungeons.js`
says, for each of the 11 sheet dungeons plus the 2 caves, `{ kind:
'rooms'|'cavern', levels, theme, arena: true|false, chests: [n, n], caches:
[n, n], boss }`, read from `realms.js` (`levels`, `boss`) and its own table
(theme per realm: brick, root, coral, brass, bone, ice, marble, obsidian).
`auditDungeons()` at import: every sheet dungeon covered, every boss in
`BOSS_BY_LAIR` has a dungeon with an arena, both directions.

`cavern_gen.js` is pure: `generateCavern(seed, site, level, spec) -> layout`
with the SAME contract dungeon_gen's layout has (`cells`, `rooms` with `i`,
`entry`, `stair`, `kind`, `level`, `siteId`, `worldOf/gridOf` working) plus
`heights` (a per cell floor height, metres, so a cavern has ledges and a
lower hall), `bridges` (spans over drops), `water` cells (pools), `chests`
(`{x, z, kind:'chest'|'cache', locked, trapped, tier}`), and `arena` (the
room index of the boss hall on the last level, large, lit). Open caverns:
few walls, big irregular chambers, height changes of 2 to 6 m between
ledges with ramps or stairs between, one lit central chamber. Tested: every
room reachable from the entry by walkable cells with climbable steps (no
step over 1.2 m without a ramp), the arena exists on the last level and
nowhere else, chests never in the entry room, counts within spec, water never
under a chest.

`cavern_scene.js` builds it in three (floors at their heights, walls where
rock meets floor, ceilings high, bridges as planks or stone, pools as flat
water, a light budget like dungeon.js's), and `dungeon.js`'s camera clamp and
`cellsCrossed` must work on it (heights change the y of the floor under the
player; `world_runtime` must set the player's y from the cell height, not
DUNGEON_FLOOR_Y, in a cavern).

Chests: `src/game/chests.js`. A chest is a mesh with `userData.chest`; clicking
or E within 3 m opens it. Locked: a Lockpicking roll against the chest tier
(difficulty 20 per tier, the skill's own band arithmetic from skills.js;
success teaches); a lockpick tool in the pack is required and breaks one in
four failures with words. Trapped: Remove Trap roll first or take damage
(tier x 8) with words. Loot: `loot_drops.rollFor` style roll at the realm's
danger tier, 2 to 4 items for a chest, 1 for a cache, gold by tier band
(`TIERS[t].gold` x 3). Opened chests are remembered per character in
`character.opened` (an array of `siteId:level:index` strings; ask Fable for
the state.js hydrate line) and respawn never. The chest says what it gave and
what did not fit (`addItem` may refuse a full pack; say so and leave it on the
floor as a sack via loot_drops if that path exists).

Boss arena: on the last level the boss from `BOSS_BY_LAIR[site.sub]` stands
in the arena room and nowhere else, with its minions per its row; the room's
light is warmer; entering the arena room says the boss's name in the banner.
Wire through `dungeonSpawns` and `levelSpawns` (yours).

Acceptance: every sheet dungeon enters (from the tour, `enter` on the bench),
every level renders, the boss stands in the arena, chests open and pay with
words, both lock outcomes measured, a full pack measured, the old rooms
generator untouched for the sites that keep it.

## E2 events

Moving things on the world clock. `src/mmo/events.js` is data:

- **The Tithe Wagon**: a Legion wagon (a cart body from the kit, two horses if
  a horse body exists else oxen from the critter kit, four Legion soldiers
  and an archer around it) that walks the Kingsroad end to end every third
  in-game day; attackable; the soldiers use their rows; killing all five
  drops the tithe (a chest via D3's chests if landed, else gold and cloth
  sacks).
- **The Legion's march**: a column of 6 to 10 soldiers walking between the
  Legion camps of a realm (camps in the sheet whose `contains` names the
  Legion), one march per realm per day, on the roads where roads exist.
- **The Ghost Tide** (Sunken Kingdom, coast): at dusk the drowned walk out of
  the sea along the shore for one night, spawns doubled, then go back.
- **The Bone Wind** (Boneyard): a moving zone of dust 200 m across that
  crosses the realm over an hour; inside it the sky darkens, hit chance falls
  by 10 for everyone and bone monsters spawn at its centre.
- **The Blossom Fall** (Verdant Deep): petals; every fourth day; foraging
  yields doubled in the realm while it lasts.
- **The Long Night** (Frostreach): every seventh day the night lasts twice
  as long in the realm (a per realm night factor the sky reads; ask for the
  hook in `scene.js` if none exists) and night rows spawn by day.
- **The Brass City's circuit** (Ember Wastes): the megastructure is a walking
  city; it stands at one of four stations for a day each and moves between
  them over an hour; while it moves nothing spawns in its path. V1 builds
  the body; E2 owns where it is (`events.brassCityAt(worldNow)`) and V1 reads
  that if it exists, else the sheet position.
- **Wandering bosses**: rows with the `wanders` tag (`noon`, `rimemouth`, and
  any others in the roster) walk a route of the realm's places, one place per
  in-game hour, and stand at each; they are spawned by `monsters.spawnAt`
  when the player is within 600 m of their current point and their `ai.home`
  is moved along the route so they walk it themselves. `noonOnly` rows exist
  only in the noon hours of the day clock.

`events_runtime.js`: `createEvents(runtime, monsters, hud, clock) ->
{ update(dt, worldNow, playerPos), active(), at(id, t), dispose }`, pure
schedule functions exported and tested (`scheduleAt(t)` says which events
are live and where they are, deterministic, tested at both edges of every
window). Words: an event that begins within 400 m says so in the log; one
you walk into says so in a toast; the wagon says when it sees you. The map
(`win_map.js`) shows live events and wandering bosses as moving marks with
names when discovered (within 200 m once).

Acceptance: `scheduleAt` measured over one full week of the clock; in the
game, set the clock with the dev bench and see the wagon on the Kingsroad
and the Bone Wind over the Boneyard from the tour; a wandering boss found at
its scheduled place.

## V1 vertical

Terrain and megaliths. `field.js`: outside HEART_SAFE, realms may carry
`relief` (V1 adds it to the realm rows in `zones.js`, not `realms.js`):
`mesa` (the Ember Wastes: flat topped tables 20 to 40 m up with cliff sides),
`cliffs` (Stormpeaks: terraces with 15 m walls, the Eyrie on a plateau 60 m
up), `crater` (Ashen Throne: a rim 80 m high ringing the throne, the Glass
Road climbing it), `glacier` (Frostreach: a rising shelf), `karst` (Sunken
Kingdom coast: sea stacks). Relief is added to the raw height by a smooth
mask inside the realm and never inside HEART_SAFE; the heart digest holds.
Roads, rivers and the sea must still work on it (roads.js grades to
ROAD_GRADE; where a road cannot climb a cliff it goes around: check
`roadsForCell` results still satisfy roads.test).

Megaliths, `megalith_models.js`, one per realm, built at the sheet's
megastructure place, seen from a kilometre (so a body 40 to 120 m tall or
wide, few materials, merged) and climbed (steps or ramps the player can
walk: `heightAt` must read the megalith where the player stands, so V1 adds
`runtime.megalithHeightAt` or bakes climbable surfaces into the field as
relief; say which and test it): the Standing Hedge (nine stones 3 m tall on a
ring a mile across, plus the boundary stones between: no pad, on natural
ground, inside HEART_SAFE, so `auditZones` gains the rule that a pad-less
authored site may stand in the heart), the Temple of Faces (a cliff carved
with faces, a stair to the eyes), the Red Queen's Harbour is a town (T1) so
the Saltmarch's megalith is the Drowned Bell Tower (a tower rising from the
sea, a stair spiralling it), the Brass City (a walking city on legs; body
here, position from E2 if present), the Eyrie (a landing of steps up the
plateau to a nest platform), the Skull Lodge (a hall in a skull the size of a
church), the Rib Cathedral (ribs of a dragon as a nave 60 m long), the Ice
Vault (a door in a glacier wall 30 m high), the Drowned Coliseum (a ring of
tiers in the sea), the Ashen Gate (two towers and a lintel 80 m high on the
crater rim). `zones.js` gains `megastructure` and `landmark` as authored site
kinds with `FLAT_R` of 0 for the ring and small pads for the rest, so
`authoredSites()` hands them to `site_models` (the hook is already in).
Landmarks in the sheet (17) get at least a marker body (a cairn, a tree, a
well, a mill) per their `geography`; the Mill Run gets a water mill.

Acceptance: every megalith visible from 1 km on the tour stop before it;
walkable where it says climbable, measured with `heightAt` along the stair;
field digest unchanged; roads test passes; zones audit passes with the
pad-less rule both ways; chunk build time per chunk in a mesa realm under
12 ms measured in node.

## After Wave B

Wave C, S2 the Greenwold, is one task on top of all four: Hearthhome's cast
in their places, the Standing Hedge as the waystone ring with the fast travel
mechanic, the Old Cellars as the first cavern with Oram, Highwayman's Hollow
moving after raids, the Sunken Chapel to swim into, Old Grist, the Tithe
Wagon and Vane's camp, the first hour scripted end to end.
