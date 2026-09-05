// The ways down, as a table. Run: node src/mmo/dungeons.test.mjs
//
// dungeons.js is the join between the sheet (realms.js), the roster
// (monsters.js) and the two generators. The audit runs at import and this file
// drives it the other way as well: a row taken out, a boss left homeless, a
// depth that disagrees with the sheet and an arena on a cave all have to make
// it throw, or the audit is decoration.
//
// The second half is the whole path from the table to a monster: a cavern is
// generated, normalised the way monsters.js normalises it, and the boss that
// lairs there is proved to be standing in the arena and nowhere else.

import {
  DUNGEONS, DUNGEON_IDS, UNDERGROUND_PLACES, THEMES, THEME_BY_REALM,
  auditDungeons, specFor, levelsFor, isCavern, ROOMS, CAVERN,
} from './dungeons.js';
import { PLACES, REALM_BY_ID } from './realms.js';
import { BOSS_BY_LAIR, MONSTERS } from './monsters.js';
import { generateCavern } from '../world/cavern_gen.js';
import { generateDungeon } from '../world/dungeon_gen.js';
import { normalizeDungeonLayout, dungeonSpawns, bossRowsFor, dungeonHabitat } from '../game/monster_ai.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };
const throws = (fn) => { try { fn(); return false; } catch { return true; } };

// ---------------------------------------------------------------------------
// 1. the table covers the sheet, and nothing else
// ---------------------------------------------------------------------------
const dungeons = PLACES.filter((p) => p.kind === 'dungeon');
const caves = PLACES.filter((p) => p.kind === 'cave');
check(`the sheet has ${dungeons.length} dungeons and ${caves.length} caves`,
  dungeons.length === 11 && caves.length === 2, `${dungeons.length} and ${caves.length}`);
check('and every one of them has a row', DUNGEON_IDS.length === dungeons.length + caves.length,
  `${DUNGEON_IDS.length} rows`);
check('UNDERGROUND_PLACES is exactly those two lists',
  UNDERGROUND_PLACES.length === dungeons.length + caves.length);
check('the audit passes as written', auditDungeons().dungeons === DUNGEON_IDS.length);

{
  const wrong = [];
  for (const place of UNDERGROUND_PLACES) {
    const spec = DUNGEONS[place.id];
    if (spec.levels !== Math.max(1, Math.round(place.levels || 1))) wrong.push(`${place.id} depth`);
    if (spec.theme !== THEME_BY_REALM[place.realm]) wrong.push(`${place.id} theme`);
    if (spec.tier !== REALM_BY_ID[place.realm].danger[1]) wrong.push(`${place.id} tier`);
  }
  check('every row agrees with the sheet on depth, theme and tier', wrong.length === 0, wrong.join(', '));
  check('there is a theme for all nine realms and no more',
    Object.keys(THEME_BY_REALM).length === 9 && Object.values(THEME_BY_REALM).every((t) => THEMES.includes(t)),
    Object.values(THEME_BY_REALM).join(', '));
  const used = new Set(Object.values(DUNGEONS).map((s) => s.theme));
  check('and every theme in use is one of the nine', [...used].every((t) => THEMES.includes(t)), [...used].join(', '));
}

{
  const caverns = Object.values(DUNGEONS).filter((s) => s.kind === CAVERN);
  const rooms = Object.values(DUNGEONS).filter((s) => s.kind === ROOMS);
  check(`${caverns.length} places are caverns and ${rooms.length} keep the old generator`,
    caverns.length + rooms.length === DUNGEON_IDS.length && caverns.length > 0 && rooms.length > 0,
    `caverns: ${caverns.map((s) => s.id).join(', ')}`);
  check('both caves are caverns, because a cave is a hollow',
    caves.every((p) => DUNGEONS[p.id].kind === CAVERN));
  check('isCavern answers for a place id and a site row alike',
    isCavern('icefall') === true && isCavern({ sub: 'throneofash' }) === false);
  check('levelsFor reads the sheet for an authored place',
    levelsFor({ sub: 'oldcellars' }) === 1 && levelsFor({ sub: 'throneofash' }) === 3);
  check('and falls back for a rolled site nobody wrote down',
    levelsFor({ id: '3,-7', kind: 'dungeon' }) === 3 && levelsFor({ id: '3,-7', kind: 'cave' }) === 1);
  check('specFor is null for a rolled site', specFor({ id: '3,-7', kind: 'cave' }) === null);
}

// ---------------------------------------------------------------------------
// 2. every boss has a hall, and the audit is driven false
// ---------------------------------------------------------------------------
{
  const lairs = Object.entries(BOSS_BY_LAIR);
  const standing = lairs.filter(([, row]) => !(row.notes || []).includes('wanders'));
  const wandering = lairs.filter(([, row]) => (row.notes || []).includes('wanders'));
  check(`${standing.length} bosses lair in a dungeon and ${wandering.length} walk the world`,
    standing.length === 10 && wandering.length === 2,
    wandering.map(([, r]) => r.id).join(', '));
  const homeless = standing.filter(([lair]) => !DUNGEONS[lair] || !DUNGEONS[lair].arena);
  check('every standing boss has a dungeon with an arena', homeless.length === 0,
    homeless.map(([l]) => l).join(', '));
  const named = standing.filter(([lair, row]) => DUNGEONS[lair].boss === row.id);
  check('and the dungeon names it back', named.length === standing.length);
  check('no wandering boss has a dungeon that would also hold it',
    wandering.every(([lair]) => !DUNGEONS[lair]), wandering.map(([l]) => l).join(', '));
  const arenas = Object.values(DUNGEONS).filter((s) => s.arena);
  check(`${arenas.length} arenas, one for each dungeon the sheet gives a boss`,
    arenas.length === dungeons.length, arenas.length + ' of ' + dungeons.length);
  check('the Brass Works is the one arena with no roster row of its own',
    arenas.filter((s) => !s.boss).map((s) => s.id).join(',') === 'brasscity_works');
  check('and the Brass Heart it names lairs at the Firstfire instead',
    BOSS_BY_LAIR.firstfire?.id === 'brassHeart' && DUNGEONS.firstfire.boss === 'brassHeart');
}

// the audit, driven false, five ways
{
  const copy = () => JSON.parse(JSON.stringify(DUNGEONS));
  const missing = copy(); delete missing.oldcellars;
  check('an uncovered dungeon fails the audit', throws(() => auditDungeons(missing)));
  const deep = copy(); deep.oldcellars.levels = 3;
  check('a depth that disagrees with the sheet fails it', throws(() => auditDungeons(deep)));
  const wrongTheme = copy(); wrongTheme.icefall.theme = 'brick';
  check('a theme that is not the realm\'s fails it', throws(() => auditDungeons(wrongTheme)));
  const caveArena = copy(); caveArena.icefall.arena = true;
  check('an arena on a cave fails it', throws(() => auditDungeons(caveArena)));
  const noArena = copy(); noArena.throneofash.arena = false;
  check('a boss with nowhere to stand fails it', throws(() => auditDungeons(noArena)));
  const invented = copy(); invented.somewhere_else = { ...copy().icefall, id: 'somewhere_else' };
  check('a row for a place that is not in the sheet fails it', throws(() => auditDungeons(invented)));
  const wrongBoss = copy(); wrongBoss.throneofash.boss = 'oramBlackhand';
  check('a dungeon holding the wrong boss fails it', throws(() => auditDungeons(wrongBoss)));
  check('and the real table still passes after all that', auditDungeons().dungeons === DUNGEON_IDS.length);
}

// ---------------------------------------------------------------------------
// 3. the whole path: table, layout, spawn records
// ---------------------------------------------------------------------------
const SEED = 20260904;
const siteFor = (spec) => ({
  id: `z:${spec.id}`, sub: spec.id, kind: spec.place, name: spec.name,
  cx: (spec.id.length * 11) % 71, cz: (spec.id.charCodeAt(1) * 5) % 63,
  x: 0, z: 0, oreBand: ['copper', 'iron'],
});

/** What world_runtime.dungeonLayout() hands the monster layer. */
const handOver = (L, spec, level, top) => ({
  ...L, level, bottom: level >= top, id: L.id, arena: L.arena ?? null, bossLair: spec.id,
});

{
  let placed = 0, wrongRoom = 0, tooShallow = 0, elsewhere = 0, entryHeld = 0;
  const rows = [];
  for (const spec of Object.values(DUNGEONS)) {
    if (!spec.boss) continue;
    for (let level = 1; level <= spec.levels; level++) {
      const site = siteFor(spec);
      const raw = spec.kind === CAVERN
        ? generateCavern(SEED, site, level, spec)
        : generateDungeon(SEED, site, level);
      const L = normalizeDungeonLayout(handOver(raw, spec, level, spec.levels), { siteId: spec.id });
      const recs = dungeonSpawns(L, { seed: SEED });
      const bosses = recs.filter((r) => r.boss);
      const bottom = level === spec.levels;
      if (bottom) {
        if (bosses.length === 1 && bosses[0].id === spec.boss) placed++;
        else rows.push(`${spec.id} L${level}: ${bosses.map((b) => b.id).join(',') || 'nobody'}`);
        const want = raw.arena != null ? raw.arena : L.deepest;
        if (bosses[0] && bosses[0].room !== want) wrongRoom++;
        // the boss's room holds the boss and nothing else
        if (bosses[0] && recs.filter((r) => r.room === bosses[0].room).length !== 1) elsewhere++;
      } else if (bosses.length) tooShallow++;
      if (recs.some((r) => r.room === L.entry)) entryHeld++;
    }
  }
  const withBoss = Object.values(DUNGEONS).filter((s) => s.boss).length;
  check('every dungeon the roster lairs a boss in stands that boss on its last level',
    placed === withBoss, rows.length ? rows.join(' | ') : `${placed}/${withBoss}`);
  check('and it stands in the arena, not wherever the dice put it', wrongRoom === 0, `${wrongRoom} in the wrong room`);
  check('and nothing else stands in the hall with it', elsewhere === 0, `${elsewhere} halls with company`);
  check('and no level above the last holds a boss at all', tooShallow === 0, `${tooShallow} levels`);
  check('and nothing at all stands in the room you arrive in', entryHeld === 0, `${entryHeld} levels`);
}

{
  // bossRowsFor, both directions
  const hask = bossRowsFor('dungeon3', 'eyrieroost');
  check('bossRowsFor with a lair gives that lair\'s boss and no other',
    hask.length === 1 && hask[0].id === 'wardenHask', hask.map((r) => r.id).join(', '));
  const rolled = bossRowsFor('dungeon3');
  check('and with no lair it gives the habitat\'s own, as it always did',
    rolled.length === 4 && rolled.every((r) => r.boss), `${rolled.length} rows`);
  check('a lair nothing lairs at falls back to the habitat',
    bossRowsFor('dungeon3', 'nowhere').length === rolled.length);
  check('a cave habitat still has no boss in it', bossRowsFor('cave').length === 0);
  check('and a cave place asks for none', Object.values(DUNGEONS).filter((s) => s.place === 'cave')
    .every((s) => !s.boss && !s.arena));
  check('the habitat a level reads is still decided by kind and depth',
    dungeonHabitat('dungeon', 2) === 'dungeon2' && dungeonHabitat('cave', 3) === 'cave');
  check('every boss named in the table is a real monster row',
    Object.values(DUNGEONS).filter((s) => s.boss).every((s) => MONSTERS[s.boss]?.boss === true));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
