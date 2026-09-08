import {hydrateMining} from './surface_mining.js';
// The character document, and the old pack views laid over the top of it.
//
// v1 of this file was coins, three materials, a hunting bag and three tools.
// v2 is the document docs/mmo/07-RUNTIME-CONTRACT.md specifies: stats, skills,
// a pack of item records, fourteen equipment slots, an ability bar,
// and the settings.
//
// THE PACK IS 40 SLOTS, not the 20 03-ITEMS-LOOT prints. The user asked for a
// bigger one. `hydrate` grows an older save to it without moving anything, and
// a save with more keeps more; docs/mmo/wiring/U2.md has the reasoning. Nothing about the old game was thrown away. Every export v1
// had is still here and still means the same thing, because it is now a VIEW
// over the document:
//
//   coins        reads and writes character.gold
//   materials    counts the wood, stone and ore stacks in the pack
//   goods        counts the venison and game_meat stacks in the pack
//   tools        looks for the axe, pickaxe and bow among equipment and pack
//   tool         what an old save said was in the hand, kept on the document as
//                heldTool. READ ONLY, and read by nothing that decides
//                anything: the tool row is gone and `src/game/tools.js` derives
//                the tool from what is carried (T3).
//
// So interact.js and shop.js run unchanged against a document they know nothing
// about. When W3's inventory.js lands it works on the same pack, and the two
// see each other immediately because there is only one pack.
//
// The three rules v1 ran on still run here.
//
// 1. Nothing is dropped in silence. `add` reports what went in and what did not.
// 2. Nothing changes without saying so: every mutation notifies `onChange`.
// 3. A bad save is never fatal. The worst case is a new game.
//
// ---------------------------------------------------------------------------
// WHAT THIS FILE INVENTS, because src/mmo does not have it
// ---------------------------------------------------------------------------
// A base items.js does not carry can be written here, in LOCAL_BASES, until it
// is moved over; auditState throws the day items.js gains the same id. Stone,
// pickaxe, venison and game_meat lived here first and are now items.KIT_BASES.
//
// A LOCAL_BASES record has the same shape items.js gives a base, so weightOf,
// stackable and the pack code cannot tell the difference.
//
// ---------------------------------------------------------------------------
// WHERE THIS FILE DIVERGES FROM A DOCUMENT, on purpose
// ---------------------------------------------------------------------------
//   heldTool          07's document has no room for the v1 tool row. It is a
//                     top level key, saved and loaded, and since T3 took the
//                     row off the screen it is written by nothing and read by
//                     nothing but `state.tool`, which exists so an old save
//                     still opens.
//   itemBar           the eight slots of `src/game/item_bar.js`, and
//   itemBarSlot       which one holds the tool the player chose. 07 has no room
//                     for either, and a chosen slot now decides which tool
//                     fells a tree, so both are carried across a reload.
//   START_COINS 120   openings.js gives Blank 100 coins. The axe is 60 and the
//                     pickaxe 80 in shop.js, and every shop test is written
//                     against 120, so a fresh document keeps 120 until
//                     creation.js (W3) applies a real opening and its purse.
//   CAP 150           03 says the three caps "go away, the weight limit
//                     replaces them". The weight limit lives in W3's
//                     inventory.js, which is not written yet, so removing the
//                     cap now would leave the pack unbounded in between. The
//                     cap stays on the legacy view only; the pack itself does
//                     not cap anything.

import {
  makeItem, baseFor, BASES, SLOTS, ARMOR_TIERS, weightOf as itemWeight,
  LOG_BASES, ORE_BASES,
} from '../mmo/items.js';
import { STATS } from '../mmo/stats.js';
import { SKILLS, DEFAULT_LOCK, LOCKS } from '../mmo/skills.js';
import { OPENINGS_BY_ID, APPEARANCE_DEFAULT } from '../mmo/openings.js';
import { zoneAt } from '../world/zones.js';

export const SAVE_KEY_V1 = 'brackenwake-save-v1';
export const SAVE_KEY = 'brackenwake-save-v2';
export const SAVE_VERSION = 2;
export const SAVE_VERSION_V1 = 1;

// ---------------------------------------------------------------- the slots
//
// One save became many. `brackenwake-save-v2` is no longer a document; it is
// the PREFIX of one document per character, `brackenwake-save-v2:<id>`, and
// the list of who exists lives on its own at `brackenwake-roster`:
//
//   { v, slots: [{ id, name, opening, createdAt, playedAt, needsCreation,
//                  summary }], lastPlayed }
//
// The summary is what the roster screen draws a card from, so that screen
// never has to open a document to show one. A copy can go stale, so it is
// rewritten from the document on every save of that document, and nothing a
// player plays with is ever read back out of it.
//
// The one save a player already has is moved into slot "1" the first time this
// code runs against their storage, and the old key is removed only after the
// new one has been written AND read back character for character. A v1 save
// takes the same road, through `migrateV1`.
export const ROSTER_KEY = 'brackenwake-roster';
export const ROSTER_VERSION = 1;
/** The sessionStorage flag the settings window raises to ask for the roster. */
export const ROSTER_FLAG = 'brackenwake-show-roster';
/** A creation draft is not a roster row and is never listed as a character. */
export const CREATION_DRAFT_KEY = 'brackenwake-creation-draft-v1';
/** Where one character's document lives. */
export const slotKeyFor = (id, key = SAVE_KEY) => `${key}:${id}`;

export const MATERIALS = ['wood', 'stone', 'ore'];
export const CAP = 150;

/**
 * What a kill leaves, and the only goods the pack takes besides the three
 * materials. Both are real rows in `src/farm/catalog.js` GOODS, which is where
 * their names and prices come from; this list is only the question of what you
 * can carry. `src/game/interact.js` audits `combat.js`'s loot table against it
 * at module load.
 */
export const CARRIED = ['venison', 'game_meat'];
/** Meat is heavier than timber, and there is no smoker to keep it in. */
export const GOOD_CAP = 20;
export const TOOLS = ['axe', 'pickaxe', 'bow'];
export const START_COINS = 120;   // the first axe is 60, so you can buy one and eat

/**
 * How many slots a pack has.
 *
 * 03-ITEMS-LOOT says "a pack has slots (starting 20)" and it started there. The
 * user asked for a bigger one, so it is 40, and `hydrate` grows an older save
 * to match: the items keep their indices and the new slots are appended empty.
 * A save that already has MORE than this (a bag bought in 06-ECONOMY-UI) keeps
 * what it has, up to the 200 the clamp allows.
 *
 * `src/game/inventory.js` carries the same number and `normalise` grows any
 * document that reaches it with fewer, so a character that never went through
 * hydrate is not left on 20.
 */
export const PACK_SLOTS = 80;
export const BAR_SLOTS = 12;      // 07: bar[12]

// --------------------------------------------------------------- local bases
// See the header. Same shape as an items.js base, so nothing downstream cares.
const local = (id, name, weight) => ({
  id, name, kind: 'material', kinds: ['material'], slot: null, weight,
  strReq: 0, durability: null, stack: true, localBase: true,
});
export const LOCAL_BASES = {
  // Empty since items.js took stone, venison, game_meat and pickaxe as real
  // bases (KIT_BASES). The table and auditState stay so the next gap has a
  // home and a guard.
};

/** items.js first, then the local table. Null when nothing knows the id. */
export function baseOf(idOrItem) {
  if (!idOrItem) return null;
  const id = typeof idOrItem === 'object' ? (idOrItem.base || idOrItem.id) : idOrItem;
  return baseFor(id) || LOCAL_BASES[id] || null;
}

/** Stones, over items.js and the local table alike. */
export function weightOf(item) {
  const b = baseOf(item);
  if (!b) return 0;
  if (baseFor(item)) return itemWeight(item);
  const n = b.stack ? (item && item.count != null ? item.count : 1) : 1;
  return b.weight * n;
}

// ------------------------------------------------------ the legacy view
//
// The old game had three counters: wood, stone and ore. The HUD still draws
// three numbers, `shop.js` still sells three things and a v1 save still holds
// three keys, and none of that changes. What changed underneath is that there
// is no longer one base called `log` and one called `ore`: G9 split them into
// fourteen woods and ten ores, because a pack that says "12 Log" cannot tell
// you whether it is the oak a bow wants.
//
// So the view is a SUM and the write is a CHOICE:
//
//   MATERIAL_STACKS  every base the counter counts. `state.materials.wood` is
//                    the total of all fourteen logs, so an oak, a birch and a
//                    palm in the pack read as one number on the HUD and sell
//                    as one lot in the market.
//   MATERIAL_BASE    the ONE base a caller gets when it does not say which. It
//                    is what `add('wood', n)` opens a stack of, and what a v1
//                    save's `wood: 37` migrates into. Oak, because oak is the
//                    tier 1 wood in `ores.js` and the commonest tree in the
//                    meadow a settler starts in.
//
// A caller that knows the species uses `addMaterial(baseId, n)` instead, and
// `interact.js` is the one that does: a felled birch leaves birch.
export const MATERIAL_BASE = { wood: 'oak_log', stone: 'stone', ore: 'copper_ore' };
/** Every base each legacy counter counts, in items.js's own order. */
export const MATERIAL_STACKS = { wood: LOG_BASES, stone: ['stone'], ore: ORE_BASES };
/** items.js base id -> the legacy counter it belongs to. Null for anything else. */
export const MATERIAL_OF = (() => {
  const out = {};
  for (const [m, list] of Object.entries(MATERIAL_STACKS)) for (const b of list) out[b] = m;
  return out;
})();
/** Which of wood, stone and ore this base counts as, or null. */
export const materialFamilyOf = (baseId) => MATERIAL_OF[baseId] || null;
export const GOOD_BASE = { venison: 'venison', game_meat: 'game_meat' };
// 07: "axe in mainHand, pickaxe in the pack, bow in ranged".
export const TOOL_ITEM = {
  axe: { base: 'axe', slot: 'mainHand' },
  pickaxe: { base: 'pickaxe', slot: null },
  bow: { base: 'shortbow', slot: 'mainHand' },   // a bow is a main hand weapon; the axe, listed first, keeps the hand and the bow goes to the pack
};

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

let seedCounter = 1;
/** One stack or one piece of gear, from items.js when it has the base. */
export function makeStack(baseId, count = 1) {
  const seed = (seedCounter = (seedCounter * 1664525 + 1013904223) >>> 0);
  if (baseFor(baseId)) return makeItem({ base: baseId, seed, count });
  const b = LOCAL_BASES[baseId];
  if (!b) throw new Error(`makeStack: nothing knows the base "${baseId}"`);
  const item = {
    id: `${b.id}-${seed.toString(36)}`,
    base: b.id, rarity: 'common', seed, identified: true, affixes: [],
    quality: 1, durability: b.durability, maker: null,
  };
  if (b.stack) item.count = count;
  return item;
}

export const SKILL_IDS = SKILLS.map((s) => s.id);

const emptyEquipment = () => Object.fromEntries(SLOTS.map((s) => [s, null]));
const zeroSkills = () => Object.fromEntries(SKILL_IDS.map((id) => [id, 0]));
const upSkillLocks = () => Object.fromEntries(SKILL_IDS.map((id) => [id, DEFAULT_LOCK]));
const upStatLocks = () => Object.fromEntries(STATS.map((id) => [id, DEFAULT_LOCK]));

export const DEFAULT_SETTINGS = Object.freeze({
  music: true, sfx: true, shadows: true, ring: true,
  pixelRatio: 1, grass: true, textScale: 1, invertDrag: false, sensitivity: 1,
});

/**
 * The document a player who has never chosen anything starts on: Blank's fifty
 * of each stat, no skill placed, and `needsCreation` so main.js knows to put
 * the creation screen up before the world.
 */
export function blankCharacter() {
  const fallback = OPENINGS_BY_ID.ranger;
  return {
    v: SAVE_VERSION,
    name: '',
    appearance: { ...APPEARANCE_DEFAULT },
    opening: 'ranger',
    needsCreation: true,
    stats: { ...fallback.stats },
    statLocks: upStatLocks(),
    skills: zeroSkills(),
    skillLocks: upSkillLocks(),
    pos: { x: 0, z: 0 },
    health: null, mana: null, stamina: null,   // filled from the stats below
    gold: START_COINS,
    // The tool row is gone (T3). `heldTool` is READ ONLY now and nothing in the
    // game writes it: it is here so a save written when there was a row still
    // loads, and so `state.tool` still has something to answer with.
    heldTool: 'hand',
    pack: { slots: PACK_SLOTS, items: new Array(PACK_SLOTS).fill(null) },
    equipment: emptyEquipment(),
    bar: new Array(BAR_SLOTS).fill(null),
    // The eight slots of the item bar, and which of them holds the tool the
    // player chose. `src/game/item_bar.js` owns their shape and repairs them on
    // every read; the document only has to carry them across a reload, which
    // matters more now that a chosen slot decides what fells a tree.
    itemBar: [],
    itemBarSlot: null,
    // Abilities this character has already been shown the unlock banner for.
    // `progression.js` seeds it SILENTLY the first time a document is seen, so
    // a save written before the banner existed does not replay a week of them,
    // and writes into it on every gain that crosses a mark. Declared here so
    // the shape of a document is one list and not two.
    unlockedAbilities: [],
    discovered: [],
    deadUntil: [],
    zones: [],            // zone ids entered, once each (Z1)
    waypoint: null,       // { x, z, name } from the map, read by the compass
    uniques: [],          // signature uniques found, once each (L1)
    bosses: [],           // wandering bosses met, so the map keeps them (E2)
    opened: [],           // chest keys already emptied, once each (D3)
    story: null,          // the first hour: which beats have been said (S2)
    waystones: null,      // the stones touched, and when each last carried you (S2)
    settings: { ...DEFAULT_SETTINGS },
  };
}

function defaultStorage() {
  try {
    if (typeof localStorage !== 'undefined' && localStorage) return localStorage;
  } catch { /* a private window can throw on the mere mention of it */ }
  return null;
}

function read(storage, k) {
  let raw = null;
  try { raw = storage.getItem(k); } catch { return null; }
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

const put = (storage, k, v) => { try { storage.setItem(k, v); return true; } catch { return false; } };
const drop = (storage, k) => { try { storage.removeItem(k); return true; } catch { return false; } };

// ------------------------------------------------------------- the roster --

const SKILL_NAME = Object.fromEntries(SKILLS.map((s) => [s.id, s.name]));

/**
 * Everything the roster screen shows about one character, worked out from the
 * document and nothing else. Written on every save.
 *
 * The place is `zoneAt` over the saved position, which is the same function
 * the world itself names ground with, so a card cannot claim a zone the player
 * is not standing in. Open ground has no zone and the place is null, which the
 * card says in words rather than inventing a name.
 */
export function summarise(doc, extra = {}) {
  const d = doc && typeof doc === 'object' ? doc : {};
  const skills = Object.entries(d.skills && typeof d.skills === 'object' ? d.skills : {})
    .filter(([id, v]) => isNum(v) && v > 0 && SKILL_NAME[id])
    .map(([id, v]) => ({ id, name: SKILL_NAME[id], value: Math.round(v * 100) / 100 }))
    .sort((a, b) => b.value - a.value || a.id.localeCompare(b.id))
    .slice(0, 3);
  const x = isNum(d.pos?.x) ? d.pos.x : 0;
  const z = isNum(d.pos?.z) ? d.pos.z : 0;
  const hit = zoneAt(x, z);
  return {
    name: typeof d.name === 'string' ? d.name : '',
    opening: typeof d.opening === 'string' ? d.opening : 'blank',
    openingName: OPENINGS_BY_ID[d.opening]?.name || '',
    skills,
    gold: isNum(d.gold) ? Math.max(0, Math.round(d.gold)) : 0,
    place: hit ? hit.zone.name : null,
    pos: { x: Math.round(x), z: Math.round(z) },
    needsCreation: !!d.needsCreation,
    playedAt: isNum(extra.playedAt) ? extra.playedAt : Date.now(),
  };
}

/** One roster row, forced into shape. Anything unreadable is left out. */
function hydrateRow(s) {
  if (!s || typeof s !== 'object' || typeof s.id !== 'string' || !s.id) return null;
  return {
    id: s.id,
    name: typeof s.name === 'string' ? s.name : '',
    opening: typeof s.opening === 'string' ? s.opening : 'blank',
    createdAt: isNum(s.createdAt) ? s.createdAt : 0,
    playedAt: isNum(s.playedAt) ? s.playedAt : 0,
    needsCreation: !!s.needsCreation,
    summary: s.summary && typeof s.summary === 'object' ? s.summary : null,
  };
}

const emptyRoster = () => ({
  v: ROSTER_VERSION, slots: [], lastPlayed: null,
  dropped: 0, droppedNeedsCreation: 0, droppedNameless: 0, droppedUnreadable: 0,
});

function rosterName(row) {
  const fromSummary = typeof row?.summary?.name === 'string' ? row.summary.name.trim() : '';
  const fromRow = typeof row?.name === 'string' ? row.name.trim() : '';
  return fromSummary || fromRow;
}

function rosterDropReason(row) {
  const needsCreation = !!(row?.needsCreation || row?.summary?.needsCreation);
  const nameless = !rosterName(row);
  return needsCreation || nameless ? { needsCreation, nameless } : null;
}

function completeCharacter(doc) {
  return !!doc && typeof doc === 'object' && !doc.needsCreation
    && typeof doc.name === 'string' && doc.name.trim().length > 0;
}

function rosterForDisk(roster) {
  return {
    v: ROSTER_VERSION,
    slots: Array.isArray(roster?.slots) ? roster.slots : [],
    lastPlayed: typeof roster?.lastPlayed === 'string' ? roster.lastPlayed : null,
  };
}

/** The roster as it is on disk, tolerant of every shape but its own. */
export function readRoster(storage, rosterKey = ROSTER_KEY) {
  const out = emptyRoster();
  if (!storage) return out;
  const raw = read(storage, rosterKey);
  if (!raw || typeof raw !== 'object') return out;
  let dirty = false;
  const seen = new Set();
  if (Array.isArray(raw.slots)) {
    for (const s of raw.slots) {
      const row = hydrateRow(s);
      if (!row || seen.has(row.id)) {
        out.droppedUnreadable++;
        dirty = true;
        continue;
      }
      const reason = rosterDropReason(row);
      if (reason) {
        out.dropped++;
        if (reason.needsCreation) out.droppedNeedsCreation++;
        if (reason.nameless) out.droppedNameless++;
        dirty = true;
        continue;
      }
      seen.add(row.id);
      out.slots.push(row);
    }
  }
  if (typeof raw.lastPlayed === 'string' && out.slots.some((s) => s.id === raw.lastPlayed)) {
    out.lastPlayed = raw.lastPlayed;
  } else if (typeof raw.lastPlayed === 'string') {
    dirty = true;
  }
  if (dirty) writeRoster(storage, rosterKey, out);
  return out;
}

function writeRoster(storage, rosterKey, roster) {
  if (!storage) return false;
  return put(storage, rosterKey, JSON.stringify(rosterForDisk(roster)));
}

function readDraft(storage, draftKey = CREATION_DRAFT_KEY) {
  const raw = read(storage, draftKey);
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !raw.id) return null;
  const doc = raw.doc && typeof raw.doc === 'object' ? raw.doc : null;
  return doc ? { id: raw.id, doc } : null;
}

function writeDraft(storage, draftKey, id, doc) {
  if (!storage || typeof id !== 'string' || !id || !doc || typeof doc !== 'object') return false;
  const text = JSON.stringify({ v: 1, id, doc });
  if (!put(storage, draftKey, text)) return false;
  let back = null;
  try { back = storage.getItem(draftKey); } catch { back = null; }
  if (back !== text) { drop(storage, draftKey); return false; }
  return true;
}

/** The lowest number nobody is using, so a deleted slot's name comes back. */
function nextSlotId(roster) {
  const taken = new Set(roster.slots.map((s) => s.id));
  for (let i = 1; i < 1000; i++) if (!taken.has(String(i))) return String(i);
  return String(Date.now());
}

function rowFor(doc, id, now, createdAt) {
  const summary = summarise(doc, { playedAt: now });
  return {
    id,
    name: summary.name,
    opening: summary.opening,
    createdAt: isNum(createdAt) ? createdAt : now,
    playedAt: now,
    needsCreation: !!doc.needsCreation,
    summary,
  };
}

/**
 * The one save a player already has becomes slot "1", once, and nothing is
 * thrown away on the way.
 *
 * The order matters and is the whole point: write the new document, read it
 * back and compare it to what was written, write the roster, and only then
 * remove the old key. Any step that fails leaves the old save exactly where it
 * was, so the worst case is that this runs again next boot.
 *
 * A v2 save is moved VERBATIM, as the string it was stored as, so the document
 * in the slot is character for character the document that was there.
 */
export function migrateLegacy(storage, opts = {}) {
  const key = opts.key || SAVE_KEY;
  const keyV1 = opts.keyV1 || SAVE_KEY_V1;
  const rosterKey = opts.rosterKey || ROSTER_KEY;
  const draftKey = opts.draftKey || CREATION_DRAFT_KEY;
  const roster = readRoster(storage, rosterKey);
  if (!storage || roster.slots.length) return roster;
  if (readDraft(storage, draftKey)) return roster;

  let text = null, parsed = null, from = null;
  let raw = null;
  try { raw = storage.getItem(key); } catch { raw = null; }
  if (raw) {
    try { parsed = JSON.parse(raw); } catch { parsed = null; }
    if (parsed && typeof parsed === 'object') { text = raw; from = key; }
  }
  if (!text) {
    const v1 = read(storage, keyV1);
    if (v1 && typeof v1 === 'object') {
      parsed = migrateV1(v1);
      text = JSON.stringify(parsed);
      from = keyV1;
    }
  }
  if (!text) return roster;

  const id = '1';
  const doc = hydrate(parsed);
  if (!completeCharacter(doc)) {
    if (!writeDraft(storage, draftKey, id, doc)) return roster;
    drop(storage, from);
    drop(storage, keyV1);          // a v1 save beside a v2 one is a stale copy
    roster.draft = id;
    return roster;
  }

  const sk = slotKeyFor(id, key);
  if (!put(storage, sk, text)) return roster;
  let back = null;
  try { back = storage.getItem(sk); } catch { back = null; }
  if (back !== text) { drop(storage, sk); return roster; }

  const now = Date.now();
  roster.slots.push(rowFor(doc, id, now, now));
  roster.lastPlayed = id;
  if (!writeRoster(storage, rosterKey, roster)) {
    // Nothing lists the document, so nothing would ever open it. Take it back
    // out and leave the old key alone; next boot tries again.
    drop(storage, sk);
    return { v: ROSTER_VERSION, slots: [], lastPlayed: null };
  }
  drop(storage, from);
  drop(storage, keyV1);          // a v1 save beside a v2 one is a stale copy
  return roster;
}

// ------------------------------------------------- asking for the roster --
//
// The settings window cannot show the roster itself: the roster is a boot
// screen and the game is running. So it saves, leaves a note, and reloads.

function defaultSession() {
  try {
    if (typeof sessionStorage !== 'undefined' && sessionStorage) return sessionStorage;
  } catch { /* a private window can throw on the mere mention of it */ }
  return null;
}

/** Leave the note. */
export function askForRoster(session = defaultSession()) {
  return session ? put(session, ROSTER_FLAG, '1') : false;
}
/** Is there a note? Read without clearing, because main.js decides twice. */
export function rosterAsked(session = defaultSession()) {
  if (!session) return false;
  try { return session.getItem(ROSTER_FLAG) === '1'; } catch { return false; }
}
/** Take the note down. The roster does this the moment it is on screen. */
export function clearRosterAsk(session = defaultSession()) {
  return session ? drop(session, ROSTER_FLAG) : false;
}

/**
 * Save this character and go to the roster. The settings window's one button,
 * and the only thing that reloads the page on purpose.
 *
 * `reload` and `session` are seams for a test; the browser gets its own.
 */
export function toRoster(state, opts = {}) {
  let saved = false;
  try { saved = state?.save?.() === true; } catch (e) { console.warn('[state] the save before the roster failed', e); }
  askForRoster(opts.session);
  const reload = typeof opts.reload === 'function'
    ? opts.reload
    : () => { if (typeof location !== 'undefined') location.reload(); };
  reload();
  return saved;
}

/**
 * @param {string|{ storage?: Storage|null, slot?: string, key?: string,
 *                  keyV1?: string, rosterKey?: string }} [opts]
 *   A slot id on its own, or the options. `storage` lets a test hand in a
 *   Map-backed stub; `null` means do not persist at all, which is also what a
 *   private window gets.
 */
export function createState(opts = {}) {
  if (typeof opts === 'string') opts = { slot: opts };
  const key = opts.key || SAVE_KEY;
  const keyV1 = opts.keyV1 || SAVE_KEY_V1;
  const rosterKey = opts.rosterKey || ROSTER_KEY;
  const draftKey = opts.draftKey || CREATION_DRAFT_KEY;
  const storage = opts.storage === undefined ? defaultStorage() : opts.storage;
  const listeners = new Set();
  /** Which character is open. Null until one is, and again after a delete. */
  let slot = typeof opts.slot === 'string' && opts.slot ? opts.slot : null;

  let doc = fillPools(blankCharacter());
  // Dev mode is a lens, not a gift: it reports everything as owned and lets the
  // market charge nothing, and turning it off hands back exactly what was
  // bought. Nothing it does is written to the save.
  let dev = false;

  const notify = (what) => {
    for (const fn of listeners) {
      try { fn(state, what); } catch (e) { console.error('[state] listener threw', e); }
    }
  };

  // ------------------------------------------------------------------- pack
  const packItems = () => doc.pack.items;

  /** Every stack of one base in the pack, in slot order. */
  function stacksOf(baseId) {
    const out = [];
    const items = packItems();
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it && it.base === baseId && it.count != null) out.push({ i, item: it });
    }
    return out;
  }

  const countOf = (baseId) => stacksOf(baseId).reduce((t, s) => t + (s.item.count || 0), 0);

  const firstFreeSlot = () => packItems().indexOf(null);

  /**
   * Put `n` of a stacking base in the pack, at most `room` of it. Tops up the
   * stack already there before opening a new slot; returns what really went in
   * so no caller can be silent about the rest.
   */
  function stackIn(baseId, want, room) {
    const can = Math.min(want, room);
    if (can <= 0) return 0;
    const have = stacksOf(baseId);
    if (have.length) { have[0].item.count += can; return can; }
    const slot = firstFreeSlot();
    if (slot < 0) return 0;             // pack full: the caller reports it dropped
    packItems()[slot] = makeStack(baseId, can);
    return can;
  }

  /** Take `n` of a stacking base out, emptying stacks as they run out. */
  function stackOut(baseId, want) {
    let left = want, taken = 0;
    for (const s of stacksOf(baseId)) {
      if (left <= 0) break;
      const off = Math.min(left, s.item.count);
      s.item.count -= off; left -= off; taken += off;
      if (s.item.count <= 0) packItems()[s.i] = null;
    }
    return taken;
  }

  /** Where an item with this base is, if it is anywhere. */
  function findBase(baseId) {
    for (const s of SLOTS) {
      const it = doc.equipment[s];
      if (it && it.base === baseId) return { where: 'equipment', slot: s, item: it };
    }
    const items = packItems();
    for (let i = 0; i < items.length; i++) {
      if (items[i] && items[i].base === baseId) return { where: 'pack', slot: i, item: items[i] };
    }
    return null;
  }

  // ------------------------------------------------------------- the views
  // Enumerable getters, so `{ ...state.materials }` and JSON.stringify read the
  // pack rather than a stale copy. hud.setMaterials spreads them every redraw.
  const materials = {};
  const countFamily = (m) => MATERIAL_STACKS[m].reduce((t, b) => t + countOf(b), 0);
  for (const m of MATERIALS) {
    Object.defineProperty(materials, m, {
      enumerable: true, get: () => countFamily(m),
    });
  }
  const goods = {};
  for (const g of CARRIED) {
    Object.defineProperty(goods, g, {
      enumerable: true, get: () => countOf(GOOD_BASE[g]),
    });
  }
  const caps = Object.fromEntries(MATERIALS.map((m) => [m, CAP]));
  const goodCaps = Object.fromEntries(CARRIED.map((g) => [g, GOOD_CAP]));
  const pos = {
    get x() { return doc.pos.x; }, set x(v) { if (isNum(v)) doc.pos.x = v; },
    get z() { return doc.pos.z; }, set z(v) { if (isNum(v)) doc.pos.z = v; },
  };

  const ownsTool = (id) => !!(TOOL_ITEM[id] && findBase(TOOL_ITEM[id].base));

  const state = {
    caps, materials, goods, goodCaps, pos,

    /** The whole v2 document. inventory.js, windows.js and actor.js read this. */
    get character() { return doc; },
    /** Which slot is open, or null when nothing has been opened yet. */
    get slot() { return slot; },
    get pack() { return doc.pack; },
    get equipment() { return doc.equipment; },
    /** True until creation.js has placed the stats and skills. */
    get needsCreation() { return !!doc.needsCreation; },
    get settings() { return doc.settings; },

    /**
     * The tools of the old game, worked out from the pack and the paper doll
     * every time it is asked, so moving the axe cannot leave this lying. A Set,
     * because shop.js reads `.has` and `.size`.
     */
    get tools() { return new Set(TOOLS.filter(ownsTool)); },

    // coins and tool are accessors so a direct assignment still redraws the HUD
    get coins() { return doc.gold; },
    set coins(v) {
      const n = Math.max(0, Math.round(isNum(v) ? v : 0));
      if (n === doc.gold) return;
      doc.gold = n; notify('coins');
    },
    get dev() { return dev; },
    set dev(v) { const n = !!v; if (n === dev) return; dev = n; notify('dev'); },
    /**
     * What an old save said was in the hand.
     *
     * READ ONLY, and read by nothing that decides anything. The tool row is
     * gone (T3): which tool does a piece of work is derived from what you carry
     * by `toolFor` in `src/game/tools.js`, and there is no way to hold the
     * wrong one any more. This getter is here so a document written when there
     * was a row still loads and can still be looked at. There is deliberately
     * no setter: an assignment throws rather than quietly writing a field the
     * game no longer reads.
     */
    get tool() { return doc.heldTool; },

    /**
     * Put `n` of a NAMED material stack in the pack: `addMaterial('birch_log', 4)`.
     * The cap is the family's, not the stack's, so twenty oak and twenty birch
     * are forty of the hundred and fifty a pack will hold in wood.
     *
     * Never silent: what did not fit comes back, and so does the base it went
     * in as, because a caller that says "four logs" has to be able to say WHICH.
     */
    addMaterial(baseId, n) {
      const want = Math.max(0, Math.floor(isNum(n) ? n : 0));
      const family = materialFamilyOf(baseId);
      if (!family) {
        console.warn(`[state] addMaterial("${baseId}") is not a material stack this game carries`);
        return { added: 0, dropped: want, base: baseId, material: null };
      }
      const room = Math.max(0, CAP - countFamily(family));
      const added = stackIn(baseId, want, room);
      if (added > 0) notify('materials');
      return { added, dropped: want - added, base: baseId, material: family };
    },

    /**
     * The old three-counter call, kept for every caller that has no species to
     * offer: a shop, a story card, the dev bench. It opens the default stack of
     * the family, which for wood is oak.
     */
    add(material, n) {
      const want = Math.max(0, Math.floor(isNum(n) ? n : 0));
      if (!MATERIALS.includes(material)) {
        console.warn(`[state] add("${material}") is not a material this game carries`);
        return { added: 0, dropped: want };
      }
      const { added, dropped } = state.addMaterial(MATERIAL_BASE[material], want);
      return { added, dropped };
    },

    /**
     * Put `n` of a carried good in the bag. Same contract as `add`: never
     * silent, and what would not fit comes back so the caller can say so.
     */
    addGood(id, n) {
      const want = Math.max(0, Math.floor(isNum(n) ? n : 0));
      if (!CARRIED.includes(id)) {
        console.warn(`[state] addGood("${id}") is not a good this game carries`);
        return { added: 0, dropped: want };
      }
      const room = Math.max(0, GOOD_CAP - countOf(GOOD_BASE[id]));
      const added = stackIn(GOOD_BASE[id], want, room);
      if (added > 0) notify('goods');
      return { added, dropped: want - added };
    },

    /** Take `n` of a good out of the bag, or as much of it as is there. */
    takeGood(id, n) {
      if (!CARRIED.includes(id)) return { taken: 0 };
      const want = Math.max(0, Math.floor(isNum(n) ? n : 0));
      const taken = stackOut(GOOD_BASE[id], want);
      if (taken > 0) notify('goods');
      return { taken };
    },

    /**
     * Take `n` of a material out of the pack, or as much of it as is there.
     *
     * It comes out of EVERY stack in the family, in pack order, which is what
     * makes `shop.js` "sell all wood" sell the birch as well as the oak. What
     * came out of which stack is reported in `by`, so a caller that wants to
     * say "four oak and two birch" can.
     */
    take(material, n) {
      if (!MATERIALS.includes(material)) return { taken: 0, by: {} };
      let left = Math.max(0, Math.floor(isNum(n) ? n : 0));
      let taken = 0;
      const by = {};
      for (const baseId of MATERIAL_STACKS[material]) {
        if (left <= 0) break;
        const got = stackOut(baseId, left);
        if (got > 0) { by[baseId] = got; taken += got; left -= got; }
      }
      if (taken > 0) notify('materials');
      return { taken, by };
    },

    spend(c) {
      const cost = Math.max(0, Math.floor(isNum(c) ? c : 0));
      if (doc.gold < cost) return false;
      doc.gold -= cost; notify('coins');
      return true;
    },

    earn(c) {
      const gain = Math.max(0, Math.floor(isNum(c) ? c : 0));
      if (!gain) return 0;
      doc.gold += gain; notify('coins');
      return gain;
    },

    /**
     * Hand over a tool for good. Returns false if it was already carried, or if
     * there is nowhere at all to put it, which is not silent either.
     */
    giveTool(id) {
      const spec = TOOL_ITEM[id];
      if (!spec || ownsTool(id)) return false;
      const item = makeStack(spec.base, 1);
      if (spec.slot && !doc.equipment[spec.slot]) doc.equipment[spec.slot] = item;
      else {
        const slot = firstFreeSlot();
        if (slot < 0) {
          console.warn(`[state] giveTool("${id}") found the pack full and the ${spec.slot || 'pack'} taken`);
          return false;
        }
        packItems()[slot] = item;
      }
      notify('tools');
      return true;
    },
    hasTool(id) { return dev ? TOOLS.includes(id) : ownsTool(id); },
    /** What is really owned, ignoring dev mode. The save and the shop use this. */
    boughtTool(id) { return ownsTool(id); },

    /**
     * Where the player is standing. Deliberately quiet: this moves every frame
     * and nothing on the HUD reads it, so notifying here would redraw the whole
     * HUD sixty times a second.
     */
    setPos(x, z) { if (isNum(x)) doc.pos.x = x; if (isNum(z)) doc.pos.z = z; },

    /**
     * Say that something on the document changed. progression.js and W3's
     * inventory.js write straight into `character` and then call this, so one
     * event still redraws everything.
     */
    touch(what = 'character') { notify(what); },

    /**
     * Replace the whole document, which is what creation.js does when the
     * player finishes the creation screen. `needsCreation` goes false and the
     * pools fill, because this is the one moment a character is new.
     */
    setCharacter(next) {
      if (!next || typeof next !== 'object') return false;
      doc = hydrate(next);
      doc.needsCreation = false;
      fillPools(doc);
      notify('character');
      return true;
    },

    // --------------------------------------------------------- the roster --

    /**
     * Everyone this storage holds, newest play first, each with the summary
     * its own last save wrote. `open` says which one is in memory right now.
     */
    roster() {
      if (!storage) return [];
      return readRoster(storage, rosterKey).slots
        .map((s) => ({ ...s, summary: s.summary ? { ...s.summary } : null, open: s.id === slot }))
        // Newest play first. Two saves in the same millisecond fall to the
        // newer row, so a roster built in one breath still reads newest first.
        .sort((a, b) => b.playedAt - a.playedAt || b.createdAt - a.createdAt || b.id.localeCompare(a.id));
    },

    /**
     * Put one character in memory and make them the one a save writes to.
     * A row whose document has gone leaves a blank that asks to be made,
     * rather than an empty screen.
     */
    openSlot(id) {
      if (!storage || typeof id !== 'string' || !id) return false;
      const r = readRoster(storage, rosterKey);
      if (!r.slots.some((s) => s.id === id)) return false;
      doc = hydrate(read(storage, slotKeyFor(id, key)));
      slot = id;
      r.lastPlayed = id;
      writeRoster(storage, rosterKey, r);
      drop(storage, draftKey);
      notify('load');
      return true;
    },

    /**
     * A character being made is a draft, not a row. The id is reserved in
     * memory and, when storage allows it, in the draft record only.
     */
    newSlot() {
      doc = fillPools(blankCharacter());
      if (!storage) { slot = null; notify('character'); return null; }
      const r = readRoster(storage, rosterKey);
      const id = nextSlotId(r);
      slot = id;
      if (!writeDraft(storage, draftKey, id, doc)) { slot = null; notify('character'); return null; }
      notify('character');
      return id;
    },

    /** Throw away the unfinished character the creation screen was holding. */
    discardDraft() {
      if (!storage) {
        if (!doc.needsCreation) return false;
        doc = fillPools(blankCharacter());
        slot = null;
        notify('character');
        return true;
      }
      const draft = readDraft(storage, draftKey);
      const gone = drop(storage, draftKey);
      if (draft || doc.needsCreation) {
        doc = fillPools(blankCharacter());
        slot = null;
        notify('character');
      }
      return !!draft || gone;
    },

    /**
     * Remove a character, document and row together. The slot that is open is
     * refused unless the caller says it knows: the roster screen does, because
     * no game is running behind it, and a running game never should.
     */
    deleteSlot(id, o = {}) {
      if (!storage) return false;
      const r = readRoster(storage, rosterKey);
      const i = r.slots.findIndex((s) => s.id === id);
      if (i < 0) return false;
      if (id === slot && !o.evenIfOpen) return false;
      r.slots.splice(i, 1);
      if (r.lastPlayed === id) r.lastPlayed = r.slots.length ? r.slots[r.slots.length - 1].id : null;
      if (!writeRoster(storage, rosterKey, r)) return false;
      drop(storage, slotKeyFor(id, key));
      if (id === slot) drop(storage, draftKey);
      if (id === slot) slot = null;
      notify('roster');
      return true;
    },

    /**
     * Write the open character, and their summary with them, so the roster
     * screen is never a boot behind what the player did.
     *
     * ONE key is written: this character's. A state that was built without a
     * slot takes the first free number rather than dropping the save on the
     * floor, which is what a shop or a test that never opened one gets.
     */
    save() {
      if (!storage) return false;
      doc.v = SAVE_VERSION;
      if (!completeCharacter(doc)) {
        if (!slot) slot = nextSlotId(readRoster(storage, rosterKey));
        if (slot) writeDraft(storage, draftKey, slot, doc);
        return false;
      }
      const now = Date.now();
      const r = readRoster(storage, rosterKey);
      if (!slot) slot = nextSlotId(r);
      const i = r.slots.findIndex((s) => s.id === slot);
      const row = rowFor(doc, slot, now, i < 0 ? now : r.slots[i].createdAt);
      if (i < 0) r.slots.push(row); else r.slots[i] = row;
      r.lastPlayed = slot;
      if (!put(storage, slotKeyFor(slot, key), JSON.stringify(doc))) return false;
      if (!writeRoster(storage, rosterKey, r)) return false;
      drop(storage, draftKey);
      // A v1 save left beside a v2 one is a stale copy of a document that has
      // moved on, and the migration has already taken what it wanted.
      drop(storage, keyV1);
      return true;
    },

    /**
     * Read a save back. The legacy key is moved into a slot first, once, then
     * the slot this state was asked for, then the one played last, then the
     * first there is. Tolerant on purpose: no save, corrupt JSON, a missing
     * key or a shape from before `v` existed all leave the game playable.
     * @returns {boolean} true if a save was found and something was taken from it
     */
    load() {
      if (!storage) return false;
      const r = migrateLegacy(storage, { key, keyV1, rosterKey });
      const has = (id) => !!id && r.slots.some((s) => s.id === id);
      const want = has(slot) ? slot : has(r.lastPlayed) ? r.lastPlayed : (r.slots[0]?.id || null);
      if (want) return state.openSlot(want);
      const draft = readDraft(storage, draftKey);
      if (!draft) return false;
      doc = fillPools(hydrate(draft.doc));
      slot = draft.id;
      notify('load');
      return true;
    },

    /**
     * Take this character off the shelf: the document, the row, and the two
     * legacy keys. What is in memory is left alone, because the caller is
     * usually about to replace it.
     */
    clearSave() {
      if (!storage) return;
      if (slot) state.deleteSlot(slot, { evenIfOpen: true });
      drop(storage, key);
      drop(storage, keyV1);
      drop(storage, draftKey);
      slot = null;
    },

    onChange(fn) { if (typeof fn === 'function') listeners.add(fn); return () => listeners.delete(fn); },
  };

  return state;
}

// --------------------------------------------------------------------- pools

/** maxHealth and friends, from 01-STATS-SKILLS, without importing the actor. */
function poolMaxes(character) {
  const s = (character && character.stats) || {};
  const n = (k) => (isNum(s[k]) ? s[k] : 0);
  return {
    maxHealth: 30 + n('con') * 2.0 + n('str') * 0.5,
    maxMana: 10 + n('wis') * 2.0 + n('int') * 0.5,
    maxStamina: 20 + n('dex') * 1.5 + n('con') * 0.5,
  };
}

/** A new character starts full. Used at creation and after a migration. */
function fillPools(character) {
  const m = poolMaxes(character);
  character.health = m.maxHealth;
  character.mana = m.maxMana;
  character.stamina = m.maxStamina;
  return character;
}

// ----------------------------------------------------------------- hydration

const validLock = (v) => (LOCKS.includes(v) ? v : DEFAULT_LOCK);

/** An item record that survived a JSON round trip, or null. */
function hydrateItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const b = baseOf(raw.base);
  if (!b) return null;                        // a base this version does not have
  const item = {
    id: typeof raw.id === 'string' ? raw.id : `${b.id}-${(seedCounter++).toString(36)}`,
    base: b.id,
    rarity: typeof raw.rarity === 'string' ? raw.rarity : 'common',
    seed: isNum(raw.seed) ? raw.seed >>> 0 : 0,
    identified: raw.identified !== false,
    affixes: Array.isArray(raw.affixes) ? raw.affixes : [],
    quality: isNum(raw.quality) ? raw.quality : 1,
    durability: isNum(raw.durability) ? raw.durability : b.durability,
    maker: typeof raw.maker === 'string' ? raw.maker : null,
  };
  if (b.stack) item.count = Math.max(1, Math.floor(isNum(raw.count) ? raw.count : 1));
  return item;
}

const OLD_ARMOUR_SLOTS = ['head', 'chest', 'hands', 'wrists', 'waist', 'legs', 'feet', 'back'];
const OLD_ARMOUR_RE = /^(cloth|leather|studded|ring|chain|plate)_(head|chest|hands|wrists|waist|legs|feet|back)$/;
const OLD_TIER_RANK = Object.fromEntries(ARMOR_TIERS.map((t) => [t.id, t.tier]));

function oldArmour(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.base !== 'string') return null;
  const m = raw.base.match(OLD_ARMOUR_RE);
  return m ? { tier: m[1], slot: m[2], raw } : null;
}

function outfitFromOld(raw, tier) {
  const item = hydrateItem({ ...raw, base: `${tier}_outfit` });
  return item;
}

function migrateWornArmour(rawEquipment) {
  const pieces = [];
  for (const slot of OLD_ARMOUR_SLOTS) {
    const p = oldArmour(rawEquipment?.[slot]);
    if (p) pieces.push(p);
  }
  if (!pieces.length) return null;
  pieces.sort((a, b) => OLD_TIER_RANK[b.tier] - OLD_TIER_RANK[a.tier]);
  const tier = pieces[0].tier;
  const source = pieces.find((p) => p.slot === 'chest' && p.tier === tier) || pieces[0];
  return outfitFromOld(source.raw, tier);
}

function migratePackArmour(items) {
  const kept = new Set();
  for (let i = 0; i < items.length; i++) {
    const p = oldArmour(items[i]);
    if (!p) {
      items[i] = hydrateItem(items[i]);
      continue;
    }
    if (kept.has(p.tier)) { items[i] = null; continue; }
    kept.add(p.tier);
    items[i] = outfitFromOld(p.raw, p.tier);
  }
}

/**
 * Take whatever a v2 save holds and make a whole document out of it. Unknown
 * keys are ignored, missing keys fall back to the blank, and anything the item
 * tables no longer know is dropped rather than carried as a hole.
 */
/**
 * Bows are main hand weapons since 2026-09-08 (items.js). A save from before
 * carries one in `equipment.ranged`: it goes into the hand when the hand is
 * empty, else into the first free pack slot, and the back slot is emptied.
 * With no room anywhere it stays where it was, which actor.js still fires
 * when the hand is empty. Returns what it did, for the tests and the words.
 */
export function migrateRangedSlot(doc) {
  const bow = doc && doc.equipment ? doc.equipment.ranged : null;
  if (!bow) return null;
  if (!doc.equipment.mainHand) { doc.equipment.mainHand = bow; doc.equipment.ranged = null; return 'hand'; }
  const items = doc.pack && Array.isArray(doc.pack.items) ? doc.pack.items : null;
  const free = items ? items.findIndex((it) => !it) : -1;
  if (free >= 0) { items[free] = bow; doc.equipment.ranged = null; return 'pack'; }
  return 'kept';
}

export function hydrate(raw) {
  const doc = blankCharacter();
  if (!raw || typeof raw !== 'object') return fillPools(doc);
  doc.v = SAVE_VERSION;
  doc.needsCreation = !!raw.needsCreation;
  if (typeof raw.name === 'string') doc.name = raw.name;
  if (raw.appearance && typeof raw.appearance === 'object') {
    doc.appearance = { ...APPEARANCE_DEFAULT, ...raw.appearance, gender: 'male' };
  }
  if (typeof raw.opening === 'string') doc.opening = raw.opening;

  if (raw.stats && typeof raw.stats === 'object') {
    for (const k of STATS) if (isNum(raw.stats[k])) doc.stats[k] = clamp(Math.round(raw.stats[k]), 0, 100);
  }
  if (raw.statLocks && typeof raw.statLocks === 'object') {
    for (const k of STATS) doc.statLocks[k] = validLock(raw.statLocks[k]);
  }
  if (raw.skills && typeof raw.skills === 'object') {
    for (const id of SKILL_IDS) {
      if (isNum(raw.skills[id])) doc.skills[id] = clamp(Math.round(raw.skills[id] * 100) / 100, 0, 100);
    }
  }
  if (raw.skillLocks && typeof raw.skillLocks === 'object') {
    for (const id of SKILL_IDS) doc.skillLocks[id] = validLock(raw.skillLocks[id]);
  }

  if (raw.pos && isNum(raw.pos.x) && isNum(raw.pos.z)) doc.pos = { x: raw.pos.x, z: raw.pos.z };
  if (isNum(raw.gold)) doc.gold = Math.max(0, Math.round(raw.gold));

  if (raw.pack && Array.isArray(raw.pack.items)) {
    // The migration to a bigger pack. A save written when PACK_SLOTS was 20
    // says slots: 20 and carries 20 records; the clamp raises the floor to
    // today's PACK_SLOTS, the array is built at the new size, and the records
    // are copied at their own indices, so nothing moves and nothing is lost.
    // A save with more slots than PACK_SLOTS keeps every one of them.
    const slots = isNum(raw.pack.slots) ? clamp(Math.floor(raw.pack.slots), PACK_SLOTS, 200) : PACK_SLOTS;
    doc.pack = { slots, items: new Array(slots).fill(null) };
    for (let i = 0; i < Math.min(slots, raw.pack.items.length); i++) doc.pack.items[i] = raw.pack.items[i] || null;
    migratePackArmour(doc.pack.items);
  }
  if (raw.equipment && typeof raw.equipment === 'object') {
    for (const s of SLOTS) doc.equipment[s] = hydrateItem(raw.equipment[s]);
    const outfit = migrateWornArmour(raw.equipment);
    if (outfit) doc.equipment.outfit = outfit;
    doc.equipment.ranged = hydrateItem(raw.equipment.ranged);
  }
  if (Array.isArray(raw.bar)) {
    for (let i = 0; i < BAR_SLOTS; i++) {
      doc.bar[i] = typeof raw.bar[i] === 'string' ? raw.bar[i] : null;
    }
  }
  // The item bar, and the tool chosen on it (T3). The bar used to be written
  // by item_bar.js onto a document that never carried it home, so every reload
  // emptied it; now that a chosen slot decides which tool fells a tree, losing
  // it would silently change what the next click does. item_bar.js owns the
  // shape and repairs it on every read, so this only has to carry it over.
  if (Array.isArray(raw.itemBar)) {
    doc.itemBar = raw.itemBar.map((e) => (
      e && typeof e === 'object' && e.base ? { base: String(e.base), name: String(e.name || '') } : null
    ));
  }
  migrateRangedSlot(doc);
  delete doc.equipment.ranged;
  doc.itemBarSlot = Number.isInteger(raw.itemBarSlot) && raw.itemBarSlot >= 0 ? raw.itemBarSlot : null;
  if (Array.isArray(raw.discovered)) doc.discovered = raw.discovered.filter((d) => typeof d === 'string');
  if (Array.isArray(raw.zones)) doc.zones = raw.zones.filter((d) => typeof d === 'string');
  if (raw.waypoint && Number.isFinite(raw.waypoint.x) && Number.isFinite(raw.waypoint.z)) doc.waypoint = { x: raw.waypoint.x, z: raw.waypoint.z, name: String(raw.waypoint.name || '') };
  // Saves written before 2026-09-08 may still carry a companion record. The
  // companion was removed, so hydrate ignores that key and keeps loading.
  // the signature uniques already found (L1): once per character, so the list must survive a reload
  if (Array.isArray(raw.uniques)) doc.uniques = raw.uniques.filter((u) => typeof u === 'string');
  if (Array.isArray(raw.bosses)) doc.bosses = raw.bosses.filter((u) => typeof u === 'string');
  // the boxes this character has already emptied (D3): a chest pays once ever,
  // so the list has to survive a reload or every level is a fresh payday
  if (Array.isArray(raw.opened)) doc.opened = raw.opened.filter((k) => typeof k === 'string');
  // the first hour (S2): a beat fires once per character, ever, so the list has
  // to survive a reload or Old Wynn tells you about the Standing Hedge again
  if(raw.mining)doc.mining=hydrateMining(raw.mining);
  if (raw.story && typeof raw.story === 'object' && !Array.isArray(raw.story)) doc.story = { ...raw.story };
  // and the stones this character has put a hand on, with the day clock stamp of
  // the last time each carried them (S2); both readers take a half written record
  if (raw.waystones && typeof raw.waystones === 'object' && !Array.isArray(raw.waystones)) doc.waystones = { ...raw.waystones };
  if (Array.isArray(raw.deadUntil)) doc.deadUntil = raw.deadUntil.filter((d) => d && typeof d === 'object');
  if (raw.settings && typeof raw.settings === 'object') {
    doc.settings = { ...DEFAULT_SETTINGS, ...raw.settings };
  }

  // A tool in the hand that is not carried would grey out the whole HUD row.
  const owns = (id) => {
    const spec = TOOL_ITEM[id];
    if (!spec) return false;
    if (SLOTS.some((s) => doc.equipment[s] && doc.equipment[s].base === spec.base)) return true;
    return doc.pack.items.some((it) => it && it.base === spec.base);
  };
  doc.heldTool = (raw.heldTool === 'hand' || (TOOLS.includes(raw.heldTool) && owns(raw.heldTool)))
    ? raw.heldTool : 'hand';

  // "health, mana, stamina, as left", but never above what the stats allow.
  const m = poolMaxes(doc);
  doc.health = isNum(raw.health) ? clamp(raw.health, 0, m.maxHealth) : m.maxHealth;
  doc.mana = isNum(raw.mana) ? clamp(raw.mana, 0, m.maxMana) : m.maxMana;
  doc.stamina = isNum(raw.stamina) ? clamp(raw.stamina, 0, m.maxStamina) : m.maxStamina;
  return doc;
}

// ----------------------------------------------------------------- migration

/**
 * A v1 save becomes a v2 document, exactly as 07-RUNTIME-CONTRACT says:
 *
 *   wood, stone and ore become stacks in the pack
 *   coins become gold
 *   the axe goes in mainHand, the pickaxe in the pack, the bow in ranged
 *   the position carries over
 *   the character is a Blank with its fifty of each stat and no skill placed,
 *   flagged `needsCreation`, "since nothing about their old character was
 *   recorded"
 *
 * The old caps are honoured on the way in, because a v1 save could not legally
 * hold more than 150 of a material or 20 of a good, and a save that does is a
 * save that was edited.
 */
export function migrateV1(d) {
  const doc = blankCharacter();
  doc.needsCreation = true;

  if (isNum(d.coins)) doc.gold = Math.max(0, Math.round(d.coins));

  // v1 nests the materials; the shape before it kept them at the top level
  const m = (d.materials && typeof d.materials === 'object') ? d.materials : d;
  let slot = 0;
  const put = (item) => { if (slot < doc.pack.slots) doc.pack.items[slot++] = item; };
  for (const k of MATERIALS) {
    if (!isNum(m[k])) continue;
    const n = clamp(Math.floor(m[k]), 0, CAP);
    if (n > 0) put(makeStack(MATERIAL_BASE[k], n));
  }
  const g = (d.goods && typeof d.goods === 'object') ? d.goods : {};
  for (const k of CARRIED) {
    if (!isNum(g[k])) continue;
    const n = clamp(Math.floor(g[k]), 0, GOOD_CAP);
    if (n > 0) put(makeStack(GOOD_BASE[k], n));
  }

  // tools have been an array, and before that a { axe: true } map
  const list = Array.isArray(d.tools) ? d.tools
    : (d.tools && typeof d.tools === 'object') ? Object.keys(d.tools).filter((k) => d.tools[k])
    : [];
  const owned = new Set();
  for (const t of list) {
    if (!TOOLS.includes(t) || owned.has(t)) continue;
    owned.add(t);
    const spec = TOOL_ITEM[t];
    const item = makeStack(spec.base, 1);
    if (spec.slot && !doc.equipment[spec.slot]) doc.equipment[spec.slot] = item;
    else put(item);
  }
  doc.heldTool = (d.tool === 'hand' || (TOOLS.includes(d.tool) && owned.has(d.tool))) ? d.tool : 'hand';

  if (d.pos && isNum(d.pos.x) && isNum(d.pos.z)) doc.pos = { x: d.pos.x, z: d.pos.z };
  else if (isNum(d.x) && isNum(d.z)) doc.pos = { x: d.x, z: d.z };

  return fillPools(doc);
}

/**
 * Fails loudly on a table this file could not work with. Runs at load, so a
 * rename in items.js that leaves a material with no base cannot ship quietly.
 */
export function auditState() {
  for (const [m, b] of Object.entries(MATERIAL_BASE)) {
    if (!BASES[b]) throw new Error(`auditState: the material ${m} maps to "${b}", which is not a base`);
    if (!MATERIAL_STACKS[m]?.includes(b)) throw new Error(`auditState: the default ${b} is not one of the stacks ${m} counts`);
  }
  // Every counter counts something, every stack it counts is real and stacks,
  // and no stack is counted by two counters, which would double a HUD number.
  const counted = new Map();
  for (const m of MATERIALS) {
    const list = MATERIAL_STACKS[m];
    if (!Array.isArray(list) || !list.length) throw new Error(`auditState: ${m} counts no stacks at all`);
    for (const b of list) {
      const base = BASES[b];
      if (!base) throw new Error(`auditState: ${m} counts "${b}", which is not a base`);
      if (!base.stack) throw new Error(`auditState: ${m} counts "${b}", which does not stack`);
      if (counted.has(b)) throw new Error(`auditState: "${b}" is counted as both ${counted.get(b)} and ${m}`);
      counted.set(b, m);
      if (materialFamilyOf(b) !== m) throw new Error(`auditState: "${b}" joins back to ${materialFamilyOf(b)}, not ${m}`);
    }
  }
  if (materialFamilyOf('longsword') !== null) throw new Error('auditState: a longsword is not a material');
  for (const [g, b] of Object.entries(GOOD_BASE)) {
    if (!baseOf(b)) throw new Error(`auditState: the good ${g} maps to "${b}", which is not a base`);
  }
  for (const [t, spec] of Object.entries(TOOL_ITEM)) {
    if (!baseOf(spec.base)) throw new Error(`auditState: the tool ${t} maps to "${spec.base}", which is not a base`);
    if (spec.slot && !SLOTS.includes(spec.slot)) throw new Error(`auditState: the tool ${t} wants slot ${spec.slot}`);
  }
  for (const id of Object.keys(LOCAL_BASES)) {
    if (BASES[id]) throw new Error(`auditState: items.js now has a "${id}" base, so the local one should go`);
  }
  if (SKILL_IDS.length !== SKILLS.length) throw new Error('auditState: the skill list lost an entry');
  return {
    locals: Object.keys(LOCAL_BASES).length, skills: SKILL_IDS.length,
    stacks: Object.fromEntries(MATERIALS.map((m) => [m, MATERIAL_STACKS[m].length])),
  };
}

auditState();
