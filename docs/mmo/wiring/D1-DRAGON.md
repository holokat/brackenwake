# D1: the dragon companion

> **On the filename.** This agent was briefed to write `docs/mmo/wiring/D1.md`,
> and that name was already taken by an earlier and entirely unrelated piece of
> work (the underground, made solid and made big). Overwriting it would have
> destroyed somebody's document, so this one is `D1-DRAGON.md`. If the letters
> are meant to be unique, the two need renaming by whoever owns the scheme.

The first item of `14-KALDERA.md` section 7: an entity that follows, fights,
eats, sleeps, has four bodies and a mood, drawn by a procedural model until the
Blender dragons arrive, and saved with the character.

Not in this piece of work: the Bond meter in the HUD, and Wyrmsoul. Both are
D2's, and everything D2 has to read from here is in the last section of this
file.

```
src/game/dragon.js                 the rules, the record, the actor, the entity
src/game/dragon_models.js          the four bodies, procedural and PBR
src/game/win_dragon.js             the window, key N
src/game/app/systems/dragon.js     the wiring, and the frame hook
src/game/app/systems/index.js      one line: the system, after world_life
```

Four test files, all run by `npm test`:

```
src/game/dragon.test.mjs               215 checks
src/game/dragon_models.test.mjs         95 checks
src/game/win_dragon.test.mjs            63 checks
src/game/app/systems/dragon.test.mjs    58 checks
```

`src/game/wiring.test.mjs` also has two edited literals, which are the two
places it spells the system list out by name: the frame order and the build
order. Nothing else in that file moved.

---

## 1. The record

It lives at `character.dragon`, and it is the only thing that persists.

```js
character.dragon = {
  name: null,          // what the player called it. null until it is named.
  age: 'hatchling',    // 'hatchling' | 'drake' | 'young' | 'dragon'
  bond: 0,             // 0..100
  hunger: 20,          // 0..100, a blank record starts at 20
  fallen: false,       // it is down
  fallenUntil: 0,      // frame ms it may soonest get up
  trueName: null,      // learned in the Boneyard. Locks the name field.
  gifts: [],           // the nine gift ids it has taken back
  fedAt: 0,            // frame ms of the last feed that paid Bond. 0 is never.
}
```

`state.save()` is `JSON.stringify(doc)` over the whole character document, and
`state.js`'s `blankCharacter` and `hydrate` now carry `dragon` (the roster
agent's commit, "the dragon's record rides the save"), so the round trip is
whole. It is measured rather than assumed: `dragon.test.mjs` writes a named,
grown, part fed dragon out through `JSON.stringify` and reads it back through
the real `hydrate`, then builds a live entity on what came back and checks it is
the same dragon, at the same age, with the same Bond to the decimal, and that it
does not hatch a second time.

`readDragon(raw)` in `dragon.js` is the reader and it is defensive on every
field: a missing record, a string, an age this build has never heard of, a bond
of 900, a gift that is not a gift and a name of three spaces all come back as a
sane record rather than a crash or a silently different dragon. A save written
before the dragon existed reads as no dragon and hatches a nameless hatchling,
which is what it should do.

### The nine gifts

`GIFTS` in `dragon.js`, one per realm of `14-KALDERA.md` section 3:

| id | realm | what it gives Wyrmsoul |
| --- | --- | --- |
| `greenwold` | the Greenwold | the base |
| `verdant` | Verdant Deep | the dragon's senses |
| `saltmarch` | the Saltmarch | the tail |
| `ember` | Ember Wastes | true fire |
| `stormpeaks` | the Stormpeaks | wings |
| `boneyard` | the Boneyard | the roar |
| `frostreach` | Frostreach | frost breath |
| `sunken` | the Sunken Kingdom | the deep |
| `throne` | the Ashen Throne | the last |

D2 owns what each one DOES. This file owns only which are held, because the age
is a function of them. `dragon.grant(id)` is how a realm's dungeon hands one
over: it says the line, checks the age, and fires `grew` if the age moved.

---

## 2. The rules, and where each number came from

Every one of these is a pure function in `dragon.js`, exported, and driven both
ways in `dragon.test.mjs`.

### `ageFor(gifts)`

The design names three steps: a drake "after Verdant Deep and the Saltmarch", a
young dragon "after Ember Wastes and the Stormpeaks", a dragon "after the
Boneyard and Frostreach". **The ladder is walked from the bottom and stops at the
first pair that is not held.** A save carrying the Boneyard and Frostreach but
not Verdant Deep is a hatchling: an animal does not skip a body. That is a
decision, and the test drives all 512 combinations of the nine gifts against it
rather than the three the design happens to name.

### `foodFor(age)`

Every id is a real `items.js` food base, and the test proves it.

| age | eats |
| --- | --- |
| hatchling | `egg`, `rat_meat` |
| drake | `fish`, `game_meat`, `crab_meat` |
| young | `boar_meat`, `venison`, `wolf_meat`, `bear_meat` |
| dragon | `bear_meat` and all six `MEAL_BASES` |

Every meat in `items.js` is food for some age, and nothing in the list is a base
that does not exist.

### The Bond

```
bondGain('hitTogether') = 1     bondGain('fed') = 8     bondGain('tookBlow') = 4
bondDrain(dt, apart, fallen)    apart: 1 a second, fallen: 2 a second, else 0
bondRally(dt, fighting)         5 a second while somebody fights over a fallen one
```

`bondDrain` is one drain with two rates and they do not add: fallen AND apart is
still 2 a second, which is what "and faster when it has fallen" means.

**`bondRally` is invented, and here is why it had to be.** The design says a
fallen dragon drains at 2 a second, that it wakes at a Bond of 25, and that while
it is down the Bond climbs only from the player fighting within twenty metres. A
swing is worth 1 about every one and a half seconds. Read literally, 0.66 a
second of gain against 2 a second of drain means a fallen dragon loses ground for
ever and is never seen again. So while it is fallen the per swing gain is
suppressed and a rally rate replaces it: 5 a second while the player is fighting
inside `FALL_WATCH_M`, which nets +3 and puts the wake about nine seconds of
somebody standing over it away. The rate is a guess. The arithmetic that forces
there to be one is not.

### The fall, exactly

- Health reaches zero. `combat.js`'s own `onDeath` fires, the system hears it,
  and the entity falls. (`run()` also checks health at the top of every frame,
  so a poison tick or any path the hook never saw cannot leave a corpse
  standing.)
- `fallen = true`, `bond = 0`, `fallenUntil = now + 4000`, the model rolls onto
  its side, and the log says it has fallen AND that it cannot die AND what will
  bring it round.
- While fallen: it lies where it fell. It does not walk, does not swing, does
  not eat, and does not get hungrier.
- It wakes when `bond >= 25` **and** the four second count is out. It comes back
  at half health, `actor.dead` is cleared so it can fall again, and the wake is
  said out loud with the health and the Bond in it.

`FALL_MIN_MS` is invented too: without it a dragon with a Bond already over 25
would pop up in the same frame it went down.

### Hunger

One point a minute of play (`hungerAfter(dt, hunger)`, measured at exactly 1.0000
over 3600 frames at 60 fps). Above 70 it moves at half speed and swings on twice
its own timer, and says so **once**, not every frame; the line is armed again as
soon as it drops back under. A feed takes 30 points off. A feed pays Bond at most
once a minute; outside that the food is still eaten and the window and the log
both say why the Bond did not move.

### The bodies

`stageBody(age)` is the one table of metres in the tree, and `dragon_models.js`
reads it rather than carrying its own.

| age | length | height | rides | reach | walk |
| --- | --- | --- | --- | --- | --- |
| hatchling | 0.45 m | 0.27 m | the rig's `back` anchor, offset to the right shoulder | 1.6 m | never: it is carried |
| drake | 1.10 m | 0.58 m | heel | 1.5 m | 6.0 m/s |
| young | 3.20 m | 1.69 m | heel | 2.6 m | 7.0 m/s |
| dragon | 7.00 m | 3.70 m | heel | 4.2 m | 8.0 m/s |

The heel is 1.5 m behind the player and 0.8 m to their left. The hatchling's
reach is longer than its whole body on purpose: it never climbs down, so it has
to be able to bite over your shoulder at whatever your sword is on.

---

## 3. The actor

`dragonActor(record, { pos })` builds a fighter the resolver cannot tell from any
other. It is built exactly the way `actor.spawnMonster` builds a monster, and for
the same reason: `combat_rules.attackSkill` has to come out at the age's hit and
`defenceSkill` at its def, or the table below is decoration. Both are measured
for all four ages.

| age | bite | hit | def | health | fire resist |
| --- | --- | --- | --- | --- | --- |
| hatchling | 1 to 3 | 20 | 20 | 40 | capped |
| drake | 6 to 12 | 45 | 42 | 120 | capped |
| young | 14 to 26 | 70 | 62 | 300 | capped |
| dragon | 30 to 50 | 90 | 82 | 700 | capped |

The two ends are the brief's. The two in between are interpolated and live in
`AGE_STATS` where they can be argued with. `kind: 'dragon'`, `ally: true`,
`faction: 'ally'`, `aggro: 0` (it never picks its own fight) and
`leash: Infinity` (it is never leashed; it follows you anywhere).

**One position object for its whole life.** The actor, the model and the walk all
write to the same `pos`, exactly as the player system does it. `dragonActor`
copies what it is handed, so every rebuilt actor is given the shared object back.
Missing that line once left a grown drake's fighter standing where it hatched, in
reach of nothing, for ever, while its body walked about. It was found by counting
swings, not by reading the code.

### Monsters aiming at the dragon: the two lines somebody else has to add

`monsters.js` offers `stepMonster` exactly one candidate, the player, so nothing
in the world currently attacks the dragon. The dragon's actor is nevertheless a
perfectly legal target for the real AI, and
`src/game/app/systems/dragon.test.mjs` drives the real `stepMonster` with the
dragon in the player's slot to prove it: a wolf aggros on it, walks to within
1.47 m, asks to swing 368 times out of 400 frames, and a real `queueSwing` at it
is accepted and takes health off it.

The owner of `monsters.js` needs two lines.

**1. In `stepMonster`, "who it is on":**

```js
// was
if (!ai.target && player && aggroCheck(m, player.pos)) { ai.target = player; ai.alerted = now; }
// wants to be
if (!ai.target) for (const cand of [player, ...(ctx.allies || [])]) {
  if (cand && num(cand.health) > 0 && aggroCheck(m, cand.pos)) { ai.target = cand; ai.alerted = now; break; }
}
```

**2. In `createMonsters`'s `update`, in the `stepMonster` call:**

```js
allies: typeof opts.allies === 'function' ? opts.allies() : undefined,
```

and `systems/combat.js`'s `createMonsters({ ... })` passes

```js
allies: () => (ctx.has('dragon') && ctx.get('dragon').entity.awake ? [ctx.get('dragon').actor] : []),
```

`ctx.has` is asked at call time and not at build time, so the combat system does
not need a dependency on the dragon system. Note also that the `reach` handed to
`stepMonster` is currently `combat.reachBetween(a, playerActor || a)`, which
should become the reach to whichever target `ai` settled on.

Until those land, one thing in this work is dormant, and it is written against
the real condition rather than a stand in for it: `tookBlow` (+4 Bond for
standing between the dragon and an attacker) fires when the player's health drops
while something alive has `ai.target === dragon.actor` and the two of you are
within five metres. Nothing can satisfy the middle clause yet.

---

## 4. The behaviour, per frame

The system runs at `update`, between `world_life` and `ui`: after the fight, so
the target it closes on is the one the resolver settled this frame, and before
the HUD, so what it changed is drawn in the same frame.

1. `checkAge()`. The age is a function of the gifts and of nothing else, so a
   gift granted by any other system is picked up on the next frame.
2. Health at zero and not already fallen: fall.
3. Read the player's `lastSwingAt`. See the note below.
4. `tookBlow`, if the player took one that was aimed at the dragon.
5. Fallen: drain, rally, and get up when both conditions are met. Return.
6. Drain if more than forty metres apart. Hunger. The hungry line, once.
7. Move. A hatchling is carried and never walks. Anything older walks with
   `stepToward` out of `monsters.js`, to its target's edge if there is a fight
   and to the heel point if there is not, at half speed when it is hungry.
8. Swing, through `monsters.swingAt`, which is `combat.queueSwing` with the
   defender's weaknesses folded in. There is no second damage path for the
   dragon: the floaters, the hit effects, the cues and the lessons are the same
   ones a wolf's swing fires.
9. Put the body where the actor is, and pose it.

What counts as "the player has a target": `combat.attacking` first, and the
targeting's `current` only while `combat.inCombat(playerActor)` is true. Without
that second clause a dragon charges a rabbit somebody merely clicked on.

### Counting "every hit either of you lands"

A landed blow is not observable from outside `combat.js`: `combat.onHit` only
fires when a weapon rolls an effect, so a plain swing is invisible to it. A
STARTED swing is observable, because `queueSwing` stamps `lastSwingAt` on the
attacker. So `hitTogether` counts **swings begun** by either of you while both
are in the fight, not blows landed. It is the closest honest reading of the
design that can be taken without editing the resolver, and it is written down
here rather than implied. The consequence: an ability's extra shots, which pass
`immediate` and leave `lastSwingAt` alone, do not pay Bond.

### What the player is told

Every state change says something, including the ones where nothing happened:
the hatching, the naming, a feed and what it was worth, a feed that paid no Bond
and why, food it will not eat and what it does eat, an empty pack, growing into
a new body ("it will not fit on your shoulder"), a gift taken back and from
which realm, going hungry, the fall and what will end it, the wake with the
health and the Bond in it, and taking a blow for it.

---

## 5. The models

`buildDragon(age)` in `dragon_models.js`. The contract is the monster rig's:
`group` (feet at y = 0, facing +z), `parts`, `setAnim(name)`,
`update(dt, speed)`, `dispose()`, plus `flap(0..1)` and `openJaw(0..1)` for D2.

Parts, all named: `root body belly tail neck head skull jaw hornL hornR eyeL
eyeR wingL wingR wings legFL legFR legBL legBR legs spikes`. Every leg carries
its own knee; every wing carries its bones and its membrane.

Four generated PBR texture families, made the way `weapon_models.js` makes its
own (a height field into an albedo, a packed roughness/metalness map and a
normal map, as `DataTexture`s, so a texture is identical in node and in the
browser): `scale` (overlapping rows of domed scales), `belly` (broad transverse
plates), `horn` (streaked keratin) and `membrane` (thin and veined, on a double
sided, slightly transparent material). One eye material, emissive gold, at every
age, because the eye is what says it is the same animal.

Proportion is the age, as fractions of the nose to tail length. There is no
shoulder ratio: **the shoulder is wherever the legs put it**, so the feet come
out at y = 0 at every age. It was a ratio of its own at first and the two
numbers disagreed, floating a hatchling three centimetres off the ground and
burying a dragon's feet half a metre in it; the audit's bounding box caught it.

Measured at import by `auditDragonModels()`, and printed by the test:

| age | triangles | length | height | wing span |
| --- | --- | --- | --- | --- |
| hatchling | 876 | 0.43 m | 0.27 m | 0.44 m |
| drake | 1160 | 1.07 m | 0.58 m | 1.50 m |
| young | 1488 | 3.14 m | 1.69 m | 4.90 m |
| dragon | 1744 | 6.91 m | 3.70 m | 9.61 m |

Budgets: under 1,500 at the hatchling, under 6,000 at the largest. Both hold with
room to spare, so there is headroom for detail when the look is judged.

Length and height are measured **with the wings off**, because a folded wing lies
back past the tail and a spread one is half the animal again; the span is
measured with them spread, which is the only pose in which a span means
anything. The dragon's span really is wider than it is long; the hatchling's
really is not.

The audit also fails at import if an age has no proportion row or palette, if a
row's four sections do not sum to 1, if a part name is missing, if a body is not
longer than the one below it, or if the built length or height drifts from
`stageBody` by more than 8% and 15%.

Animations: `idle` (the barrel breathes, the wings fold back along the flanks,
the head sways), `walk` (a bob, the legs in diagonal pairs, the tail
counterswinging, all advanced by ground covered so half speed is half as many
strides), `swing` (a lunge, the neck out and the jaw open), `hurt`, `fall` (rolls
onto its side and stays there until `wake`).

---

## 6. The window

`win_dragon.js`, id `dragon`, key **N**. Standalone rather than a codex tab,
because `CODEX_TABS` is a fixed five in `windows.js` and that file is not this
agent's; nothing else about it differs, and the drag payload it accepts is the
pack's own `{ pack: i }`, so a drop is `inventory.remove` and not a second way of
naming a slot.

It shows: the name (an editable field, read only once the true name is learned),
the age and its one line, a gold Bond bar with a sentence saying what the number
is FOR, the hunger in words, what this age eats by real item names, a feed slot
and a Feed button, and the nine gifts with the held ones lit and the rest named
after their realm.

The system registers the panel before it builds the entity, because a nameless
dragon asks for the window in its own constructor. The panel reaches the game
through `ui.panelCtx.dragon`, which the dragon system writes at build time, the
way `dev.js` writes `panelCtx.dev`: `ui.js` is built first and cannot hold a wire
to this system, so this system holds it.

**Not done, and it needs the `ui.js` owner:** the opening line in `ui.js`'s
`ready()` lists every window key and does not mention N. The hatching log line
does tell the player to press N, so nobody is left guessing, but the line should
grow an "N dragon" when its owner next touches it.

---

## 7. What D2 reads from here

`window.__bw.dragon` and `ctx.get('dragon')` both hand over the same entity.

```js
const d = ctx.get('dragon').entity;   // or window.__bw.dragon.entity

d.record        // character.dragon, live: bond, hunger, age, fallen, gifts, trueName
d.pos           // { x, y, z }, the ONE position object. The actor shares it.
d.age           // 'hatchling' | 'drake' | 'young' | 'dragon'
d.awake         // false while it is down. Wyrmsoul's "and awake" test.
d.bond          // 0..100, the number the meter draws
d.hunger        // 0..100
d.name          // the true name if it has one, else the given name, else null
d.actor         // the fighter: reach, health, position, resists
d.model         // the body: parts, flap(k), openJaw(k), setAnim(name)
d.stage()       // stageBody for the current age: length, height, reach, radius
d.gifts()       // the nine rows, [{ id, realm, gift, held }]
d.foods()       // what it eats now

d.on(event, fn) // returns an unsubscribe. A listener that throws is caught and
                // logged; it never takes the frame down.
```

The six events, each called with `{ event, record, ...info }`:

| event | when | extra |
| --- | --- | --- |
| `hitTogether` | either of you began a swing while both are in the fight | `by: 'dragon' \| 'player'`, `bond`, `gained` |
| `fed` | it ate something | `base`, `index`, `bond`, `gained`, `cooled` |
| `tookBlow` | the player took one aimed at it | `taken`, `bond`, `gained` |
| `fell` | it went down | `killer` |
| `woke` | it got up | |
| `grew` | the age changed | `from`, `to`, `stage` |

`hitTogether`, `fed` and `tookBlow` fire **after** the Bond has already changed,
so `info.bond` is the new value and `info.gained` is what moved. A meter can be
driven off the events or polled off `d.bond`; both are live.

The Wyrmsoul call's own preconditions are D2's, and everything they need is here:
`d.bond >= 100`, `d.awake`, and
`Math.hypot(d.pos.x - player.x, d.pos.z - player.z) <= APART_M` for "not without
the dragon within forty metres". `APART_M` is exported from `dragon.js` so the
forty is written once.

The harness handles, on `window.__bw.dragon`: `feed(baseId)`, `setAge(age)`
(which also makes the gifts honest with the age, so the next frame does not undo
it), `fall()`, `wake()`, `grant(giftId)`, `gifts()`, `on(event, fn)`.

---

## 8. Verified, and how

`npm test`: all suites green. `npx vite build`: clean, 129 modules.

Measured, not asserted:

- `ageFor` over all 512 subsets of the nine gifts, against the ladder walked
  independently. All four ages occur.
- The Bond: gains by name, drains at 1 and 2 a second over a real clock, the
  rally rate proved greater than the fallen drain, and the wake computed at under
  20 s of fighting.
- Hunger: 3600 frames at 60 fps give 1.0000 points. The hungry line is said once
  over 1600 frames and is armed again after a feed.
- Following: a drake put 55 m from the player is within **1.70 m** after 600
  frames, and stays within **1.89 m** of a player who keeps walking. A hatchling's
  gap is 0, because it is parented to the rig.
- Fighting: 5 queued swings in 10 s against a weapon speed of 2.0 s is 0.50/s
  against 0.50/s. Every one is the dragon's actor swinging at the monster through
  `monsters.swingAt`, and the monster really lost health.
- Hungry: **4 swings against 8** over the same 900 frames. The first version of
  that gate measured 8 against 8, because `queueSwing`'s own cooldown already ends
  one swing time out and a gate set to the same instant changes nothing.
- Never dies: five falls and five wakes in a row leave it standing, and the fifth
  fall fires `onDeath` like the first because the wake clears `actor.dead`.
- Feeding: the first feed of a dragon's life pays 8. The second inside the minute
  pays 0 and says so. A minute later it pays again. Bread is refused with words.
  A fallen dragon will not eat and the food stays in the pack.
- The models: triangles, lengths, heights and spans in the table above, all off
  built geometry; the textures generated and read back byte by byte for real
  variation and a non blank normal map; the poser driven through breathe, walk,
  lunge, jaw, flap and fall, each proved to move the part it claims.
- The window: built into a fake document and then used. Names typed and refused
  and accepted, the Feed button pressed, a pack slot dropped on the slot, the
  Bond bar read back as a CSS width, the nine gift rows counted and read.
- The save: out through `JSON.stringify` and back through the real `hydrate`,
  then a live entity built on what came back. Name, true name, age, Bond, hunger
  and both gifts all survive; an older save with no dragon key hatches one
  instead of throwing.

### Not verified

- **Nothing was run in a browser.** How the dragon looks on the shoulder, how a
  seven metre body reads beside the player, whether the walk cycle looks like an
  animal and whether the window sits well in the codex's language are all Fable's
  to judge from screenshots.
- `tookBlow` cannot fire until `monsters.js` is allowed to aim at the dragon
  (section 3).
- The dragon is not a mount and it does not fly. `14-KALDERA` gives riding to the
  young dragon and flight to Wyrmsoul's wings; both are later items in section 7.

### One bug found in somebody else's file, not fixed

`combat.kill` sets `actor.dead = true` and refuses to run twice on the same
actor. `systems/player.js`'s `wake()` restores health, status and dots but never
clears `dead`, so **a player's second death never fires `onDeath` and never shows
the death screen**. The dragon clears it on its own wake, which is why it can
fall more than once; the player cannot. One line in `player.js`, whose owner
should have it.
