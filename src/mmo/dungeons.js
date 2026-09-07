// Every way down, as data: which generator builds it, how deep it goes, what
// it is made of, and what is worth carrying out of it.
//
// `src/mmo/realms.js` is the sheet and it already says two of these things:
// `levels` and `boss`. It does not say what a place is BUILT of, and it cannot,
// because the sheet is geography and this is engineering. So this file reads
// the sheet for depth and for the boss, and carries its own table for the rest:
//
//   kind    'rooms'   the old room and corridor generator, src/world/dungeon_gen.js
//           'cavern'  the open generator with ledges, bridges and water,
//                     src/world/cavern_gen.js
//   theme   the stone the level is cut out of, one per realm
//   arena   whether the deepest level ends in a hall the boss stands in
//   chests  [min, max] locked boxes on a level
//   caches  [min, max] unlocked ones
//   boss    the monster id out of BOSS_BY_LAIR, or null
//
// WHICH PLACES ARE CAVERNS, AND WHY.
//
// The sheet's own `geography` decides it, sentence by sentence. A brick cellar
// under a mill, a foundry with walkways over furnaces, a buried tower, a marble
// palace and a fortress cut into a crater wall are all BUILT: they are rooms
// and corridors and they stay on the old generator. A sea cave, a crater's
// throat, a shaft cut down through a peak, a dragon's neck bones, a cutting
// through a glacier, a sinkhole maze and a cave behind a waterfall are all
// HOLLOW: they are caverns, and they get ledges, ramps, spans and pools.
//
// THE STORMPEAKS AND THE NINTH THEME.
//
// The brief names eight themes for nine realms: brick, root, coral, brass,
// bone, ice, marble, obsidian. The Eyrie's Roost is cut into the granite of a
// mountain and is none of those, so granite is the ninth, and `auditDungeons`
// counts nine realms with a theme each rather than eight.
//
// THE BRASS WORKS AND ITS MISSING BOSS.
//
// The sheet gives `brasscity_works` the boss line "The Brass Heart", and the
// roster gives the Brass Heart a lair of `firstfire`. Both places are the same
// fight, met in one of two ways, so the Works carries `boss: null` and its
// arena falls back to the habitat's own boss roll rather than standing a second
// Brass Heart in the world. `auditDungeons` allows exactly that case, by name.

import { PLACES, REALM_BY_ID } from './realms.js';
import { BOSS_BY_LAIR, MONSTERS } from './monsters.js';

/** The stone a realm's underground is cut out of. One per realm, all nine. */
export const THEME_BY_REALM = {
  greenwold: 'brick',
  verdant: 'root',
  saltmarch: 'coral',
  emberwastes: 'brass',
  stormpeaks: 'granite',
  boneyard: 'bone',
  frostreach: 'ice',
  sunkenkingdom: 'marble',
  ashenthrone: 'obsidian',
};

/** Every theme a level may be built in. `cavern_scene.js` has a palette each. */
export const THEMES = ['brick', 'root', 'coral', 'brass', 'granite', 'bone', 'ice', 'marble', 'obsidian'];

/** The two generators. A site not in the table falls back to ROOMS. */
export const ROOMS = 'rooms';
export const CAVERN = 'cavern';

/**
 * The table. Keyed by the place id in realms.js, which is what an authored
 * site carries as `sub`.
 *
 * `chests` and `caches` are per LEVEL and they climb with the realm's danger,
 * because a chest is worth opening in proportion to what is standing between
 * you and it. The Old Cellars are one level of a quiet realm and hold two
 * boxes; the Throne of Ash holds five on each of three floors.
 */
const T = {
  oldcellars: { kind: ROOMS, chests: [1, 2], caches: [1, 3] },
  templeoffaces_deep: { kind: ROOMS, chests: [2, 3], caches: [2, 4] },
  leviathansrest: { kind: CAVERN, chests: [2, 3], caches: [2, 4] },
  brasscity_works: { kind: ROOMS, chests: [2, 4], caches: [3, 5] },
  firstfire: { kind: CAVERN, chests: [2, 4], caches: [3, 5] },
  buriedlibrary: { kind: ROOMS, chests: [2, 4], caches: [3, 5] },
  eyrieroost: { kind: CAVERN, chests: [3, 4], caches: [3, 5] },
  skulllodge_throat: { kind: CAVERN, chests: [3, 4], caches: [3, 5] },
  icevault_deep: { kind: CAVERN, chests: [3, 5], caches: [3, 6] },
  drownedpalace: { kind: ROOMS, chests: [3, 5], caches: [3, 6] },
  throneofash: { kind: ROOMS, chests: [4, 5], caches: [4, 6] },
  // the two caves. No boss lives in either, so neither has an arena.
  spiderwells: { kind: CAVERN, chests: [1, 2], caches: [3, 5] },
  icefall: { kind: CAVERN, chests: [1, 2], caches: [3, 5] },
};

/** The sheet's places that are a way down: the eleven dungeons and the two caves. */
export const UNDERGROUND_PLACES = PLACES.filter((p) => p.kind === 'dungeon' || p.kind === 'cave');

function build() {
  const out = {};
  for (const place of UNDERGROUND_PLACES) {
    const row = T[place.id];
    if (!row) continue;                       // auditDungeons is what complains
    const realm = REALM_BY_ID[place.realm];
    const boss = BOSS_BY_LAIR[place.id] || null;
    out[place.id] = Object.freeze({
      id: place.id,
      name: place.name,
      realm: place.realm,
      place: place.kind,                      // 'dungeon' or 'cave'
      kind: row.kind,
      theme: THEME_BY_REALM[place.realm],
      levels: Math.max(1, Math.round(place.levels || 1)),
      // A cave holds no boss and no arena; a dungeon the sheet gives a boss to
      // ends in one whether or not the roster has a row keyed to its lair.
      arena: place.kind === 'dungeon' && !!place.boss,
      boss: boss ? boss.id : null,
      bossName: boss ? boss.name : null,
      // What the loot is worth: the realm's own upper danger band.
      tier: (realm && realm.danger && realm.danger[1]) || 1,
      chests: [...row.chests],
      caches: [...row.caches],
    });
  }
  return Object.freeze(out);
}

export const DUNGEONS = build();
export const DUNGEON_IDS = Object.freeze(Object.keys(DUNGEONS));

/**
 * The spec for a site, or null when the site is not one of the sheet's ways
 * down. Takes a site row (`sub` is the place id), a place id, or a spec.
 *
 * Null is the answer that keeps the old generator: a rolled cave in the hills
 * belongs to nobody's table and is built the way it always was.
 */
export function specFor(site) {
  if (!site) return null;
  if (typeof site === 'string') return DUNGEONS[site] || null;
  if (site.dungeon && DUNGEONS[site.dungeon]) return DUNGEONS[site.dungeon];
  if (site.sub && DUNGEONS[site.sub]) return DUNGEONS[site.sub];
  if (site.id && DUNGEONS[site.id]) return DUNGEONS[site.id];
  // an authored site's id is `z:<place>`
  const tail = typeof site.id === 'string' && site.id.startsWith('z:') ? site.id.slice(2) : null;
  return (tail && DUNGEONS[tail]) || null;
}

/** How deep a site goes: the sheet's own `levels`, or the old default. */
export function levelsFor(site, fallback = 3) {
  const spec = specFor(site);
  if (spec) return spec.levels;
  return site && site.kind === 'cave' ? 1 : fallback;
}

/** Is this site built with the cavern generator? */
export const isCavern = (site) => specFor(site)?.kind === CAVERN;

/**
 * Both directions, at import.
 *
 * Forward: every dungeon and every cave in the sheet has a row here, its depth
 * agrees with the sheet's, its theme is its realm's, and its counts are sane.
 *
 * Backward: every row names a real place of the right kind; every boss in
 * `BOSS_BY_LAIR` that does not wander has a dungeon here with an arena and is
 * named by it; every arena either names a boss or is the one documented case
 * (the Brass Works) where the sheet's boss lairs in another place.
 */
export function auditDungeons(table = DUNGEONS) {
  const bad = [];
  const ids = new Set(Object.keys(table));

  // ---- forward: the sheet is covered ------------------------------------
  for (const place of UNDERGROUND_PLACES) {
    const spec = table[place.id];
    if (!spec) { bad.push(`${place.id}: a ${place.kind} in the sheet with no row here`); continue; }
    const want = Math.max(1, Math.round(place.levels || 1));
    if (spec.levels !== want) bad.push(`${place.id}: ${spec.levels} levels here and ${want} in the sheet`);
    if (spec.theme !== THEME_BY_REALM[place.realm]) bad.push(`${place.id}: theme ${spec.theme} is not ${place.realm}'s`);
    if (place.kind === 'cave' && spec.arena) bad.push(`${place.id}: a cave with an arena`);
  }

  // ---- backward: every row is a real place -------------------------------
  for (const id of ids) {
    const spec = table[id];
    const place = UNDERGROUND_PLACES.find((p) => p.id === id);
    if (!place) { bad.push(`${id}: a row here for a place that is not a dungeon or a cave in the sheet`); continue; }
    if (spec.kind !== ROOMS && spec.kind !== CAVERN) bad.push(`${id}: kind "${spec.kind}" is neither ${ROOMS} nor ${CAVERN}`);
    if (!THEMES.includes(spec.theme)) bad.push(`${id}: theme "${spec.theme}" is not one of the ${THEMES.length}`);
    for (const key of ['chests', 'caches']) {
      const [lo, hi] = spec[key];
      if (!(lo >= 0) || !(hi >= lo)) bad.push(`${id}: ${key} ${lo} to ${hi} is not a range`);
      if (hi > 8) bad.push(`${id}: ${hi} ${key} on one level is more than a level holds`);
    }
    if (!(spec.tier >= 1 && spec.tier <= 6)) bad.push(`${id}: tier ${spec.tier} is off the ladder`);
    if (spec.boss && !BOSS_BY_LAIR[id]) bad.push(`${id}: names the boss ${spec.boss} and no roster row lairs here`);
    if (spec.boss && !spec.arena) bad.push(`${id}: holds ${spec.boss} and has no arena to stand it in`);
    if (spec.arena && !spec.boss && id !== 'brasscity_works') {
      bad.push(`${id}: an arena with no boss, and it is not the Brass Works`);
    }
  }

  // ---- backward: every boss has somewhere to stand -----------------------
  for (const [lair, row] of Object.entries(BOSS_BY_LAIR)) {
    const wanders = Array.isArray(row.notes) && row.notes.includes('wanders');
    if (wanders) {
      if (table[lair]) bad.push(`${row.id}: wanders, and ${lair} is a dungeon that would also hold it`);
      continue;
    }
    const spec = table[lair];
    if (!spec) { bad.push(`${row.id}: lairs at ${lair}, which has no dungeon here`); continue; }
    if (!spec.arena) bad.push(`${row.id}: lairs at ${lair}, which has no arena`);
    if (spec.boss !== row.id) bad.push(`${lair}: holds ${spec.boss} and the roster lairs ${row.id} there`);
    if (!MONSTERS[row.id]) bad.push(`${row.id}: not a monster row`);
  }

  // ---- the prose rule ----------------------------------------------------
  for (const id of ids) {
    if (/—/.test(table[id].name || '')) bad.push(`${id}: em dash in a name`);
  }

  if (bad.length) throw new Error(`dungeons: ${bad.length} problem(s)\n  ${bad.join('\n  ')}`);
  return { dungeons: ids.size, caverns: [...ids].filter((i) => table[i].kind === CAVERN).length };
}

auditDungeons();
