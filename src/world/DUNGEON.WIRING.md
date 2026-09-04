# Wiring the way down into main.js

Two hooks. `farm.enterDungeon(site)` opens a level; `farm.onDungeonState` is how
the underground tells the HUD where the player is. Nothing else in main.js has
to change: the pickaxe already reaches ore underground, because a cave level
builds a real `createTreeField({ kind: 'rock', yield: 'ore' })` and
`chopSceneryTree` picks it up like any hillside boulder.

## 1. The mouths become doors

Replace the dungeon and cave branches of `farm.onSiteClick`. The other five
kinds keep the copy they have.

```js
  farm.onSiteClick = (s) => {
    const say = {
      town: `<b>${s.name}</b>. Shutters closed, chimneys cold. Trade and talk come in a later build.`,
      hamlet: `<b>${s.name}</b>. A few roofs around a well. Nobody home yet.`,
      ruin: `<b>${s.name}</b>. Whatever stood here came down a long time ago.`,
      shrine: `<b>${s.name}</b>. Someone left a coin on it once. It is still there.`,
      camp: 'A cold fire and a bedroll. Whoever it was left in a hurry.',
    };
    // dungeon and cave mouths are doors now, so they open instead of answering
    if (s.kind === 'dungeon' || s.kind === 'cave') {
      toast(`📍 <b>${s.name}</b>. ${s.kind === 'cave' ? 'You duck under the lintel.' : 'You take the steps down.'}`, true, true);
      farm.enterDungeon(s);
      return;
    }
    toast(`📍 ${say[s.kind] || s.name}`, true, true);
  };
```

`enterDungeon` returns `null` for any other kind and for a missing site, so a
stray call is harmless.

## 2. Entering, changing level and leaving all report

`onDungeonState` fires three times over a visit: once on the way in, once for
every level change (both directions), once on the way out. The payload is

| key | meaning |
| --- | --- |
| `site` | the sitegrid site you went into |
| `level` | 1 at the mouth, up to 3 in a dungeon; the level you just LEFT when `inside` is false |
| `inside` | false only on the way out |
| `kind` | `'dungeon'` or `'cave'` |
| `bottom` | true when no stair down exists on this level |
| `arrivedAt` | `'entrance'` coming down, `'stair'` coming back up |
| `ore`, `chests`, `rooms`, `torches` | counts of what this level actually has |

The counts are there so the toast never promises what is not down there. A cave
is one level deep and has no stair at all, so a line that says "click the stair
to go deeper" is wrong in every cave.

```js
  // the underground reports where you are, so entering, changing level and
  // leaving are never silent
  farm.onDungeonState = (st) => {
    if (!st.inside) { toast(`🌤️ back above ground at <b>${st.site.name}</b>`, true, true); return; }
    const where = st.level > 1 ? `<b>${st.site.name}</b>, level ${st.level}` : `<b>${st.site.name}</b>`;
    const ways = st.bottom
      ? 'Nothing goes deeper than this. The pale steps climb out.'
      : 'The black stair goes deeper, the pale steps climb out.';
    const spoil = st.kind === 'cave'
      ? (st.ore ? ` ${st.ore} seams in the rock: swing the pickaxe.` : '')
      : (st.chests ? ` ${st.chests} chests down here, and no way into them yet.` : '');
    toast(`🕯️ ${where}. ${ways}${spoil}`, true, true);
  };
```

## 3. Nothing else

- Clicking the pale steps on level 1 leaves; on level 2 or 3 it goes up one.
  Clicking the black stair goes deeper. Both go through `farm.dungeonGo(dir)`,
  which fires `onDungeonState` for you.
- `farm.dungeon` is truthy while underground (`{ site, level, layout, scene }`),
  if the HUD ever wants to grey out farm-only buttons.
- `farm.dispose()` tears a live level down, so a farm rebuild while underground
  cannot leak a scene.

## What a wired build does NOT do yet, and should say so if asked

- **Chests are props.** They are placed, lit and visible, and clicking one does
  nothing at all. Only the two exits answer a click underground.
- **A level is not saved.** `generateDungeon` is pure, so the level you climb
  out of is the level you climb back into, ore pockets and all. That also means
  mining a seam, leaving and coming back restores it: the underground is a
  renewable ore field until a persistence layer says otherwise.
- **There is nothing alive down there.** No fauna, no hazard, no reason to
  hurry.
