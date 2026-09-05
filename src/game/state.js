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
//   tool         which of them is in the hand, kept on the document as heldTool
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
//   heldTool          07's document has no room for the v1 tool row, and the
//                     HUD still draws it and interact.js still reads it every
//                     click. It is a top level key, saved and loaded.
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
  makeItem, baseFor, BASES, SLOTS, weightOf as itemWeight,
} from '../mmo/items.js';
import { STATS } from '../mmo/stats.js';
import { SKILLS, DEFAULT_LOCK, LOCKS } from '../mmo/skills.js';
import { OPENINGS_BY_ID, APPEARANCE_DEFAULT } from '../mmo/openings.js';

export const SAVE_KEY_V1 = 'brackenwake-save-v1';
export const SAVE_KEY = 'brackenwake-save-v2';
export const SAVE_VERSION = 2;
export const SAVE_VERSION_V1 = 1;

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

// The material and good names of the old game, and the item base each becomes.
export const MATERIAL_BASE = { wood: 'log', stone: 'stone', ore: 'ore' };
export const GOOD_BASE = { venison: 'venison', game_meat: 'game_meat' };
// 07: "axe in mainHand, pickaxe in the pack, bow in ranged".
export const TOOL_ITEM = {
  axe: { base: 'axe', slot: 'mainHand' },
  pickaxe: { base: 'pickaxe', slot: null },
  bow: { base: 'shortbow', slot: 'ranged' },
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
  const blank = OPENINGS_BY_ID.blank;
  return {
    v: SAVE_VERSION,
    name: '',
    appearance: { ...APPEARANCE_DEFAULT },
    opening: 'blank',
    needsCreation: true,
    stats: { ...blank.stats },
    statLocks: upStatLocks(),
    skills: zeroSkills(),
    skillLocks: upSkillLocks(),
    pos: { x: 0, z: 0 },
    health: null, mana: null, stamina: null,   // filled from the stats below
    gold: START_COINS,
    heldTool: 'hand',
    pack: { slots: PACK_SLOTS, items: new Array(PACK_SLOTS).fill(null) },
    equipment: emptyEquipment(),
    bar: new Array(BAR_SLOTS).fill(null),
    discovered: [],
    deadUntil: [],
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

/**
 * @param {{ storage?: Storage|null, key?: string, keyV1?: string }} [opts]
 *   `storage` lets a test hand in a Map-backed stub; `null` means do not
 *   persist at all, which is also what a private window gets.
 */
export function createState(opts = {}) {
  const key = opts.key || SAVE_KEY;
  const keyV1 = opts.keyV1 || SAVE_KEY_V1;
  const storage = opts.storage === undefined ? defaultStorage() : opts.storage;
  const listeners = new Set();

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
  for (const m of MATERIALS) {
    Object.defineProperty(materials, m, {
      enumerable: true, get: () => countOf(MATERIAL_BASE[m]),
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
    get tool() { return doc.heldTool; },
    set tool(v) {
      const t = v === 'hand' || (TOOLS.includes(v) && (dev || ownsTool(v))) ? v : 'hand';
      if (t === doc.heldTool) return;
      doc.heldTool = t; notify('tool');
    },

    /** Put `n` of a material in the pack. Never silent: what did not fit comes back. */
    add(material, n) {
      const want = Math.max(0, Math.floor(isNum(n) ? n : 0));
      if (!MATERIALS.includes(material)) {
        console.warn(`[state] add("${material}") is not a material this game carries`);
        return { added: 0, dropped: want };
      }
      const room = Math.max(0, CAP - countOf(MATERIAL_BASE[material]));
      const added = stackIn(MATERIAL_BASE[material], want, room);
      if (added > 0) notify('materials');
      return { added, dropped: want - added };
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

    /** Take `n` out of the pack, or as much of it as is there. */
    take(material, n) {
      if (!MATERIALS.includes(material)) return { taken: 0 };
      const want = Math.max(0, Math.floor(isNum(n) ? n : 0));
      const taken = stackOut(MATERIAL_BASE[material], want);
      if (taken > 0) notify('materials');
      return { taken };
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
      if (doc.heldTool === 'hand') { doc.heldTool = id; notify('tool'); }
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

    save() {
      if (!storage) return false;
      doc.v = SAVE_VERSION;
      try { storage.setItem(key, JSON.stringify(doc)); } catch { return false; }
      // The v1 save is left where it is until a v2 save has landed once. From
      // here on it is a stale copy of a document that has moved on, so it goes.
      try { storage.removeItem(keyV1); } catch { /* nothing to do */ }
      return true;
    },

    /**
     * Read the save back. v2 first, then a v1 save, which is migrated. Tolerant
     * on purpose: no save, corrupt JSON, a missing key or a shape from before
     * `v` existed all leave the game playable.
     * @returns {boolean} true if a save was found and something was taken from it
     */
    load() {
      if (!storage) return false;
      const v2 = read(storage, key);
      if (v2 && typeof v2 === 'object') {
        doc = hydrate(v2);
        notify('load');
        return true;
      }
      const v1 = read(storage, keyV1);
      if (v1 && typeof v1 === 'object') {
        doc = migrateV1(v1);
        notify('load');
        return true;
      }
      return false;
    },

    clearSave() {
      try { storage?.removeItem(key); } catch { /* nothing to do */ }
      try { storage?.removeItem(keyV1); } catch { /* nothing to do */ }
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

/**
 * Take whatever a v2 save holds and make a whole document out of it. Unknown
 * keys are ignored, missing keys fall back to the blank, and anything the item
 * tables no longer know is dropped rather than carried as a hole.
 */
export function hydrate(raw) {
  const doc = blankCharacter();
  if (!raw || typeof raw !== 'object') return fillPools(doc);
  doc.v = SAVE_VERSION;
  doc.needsCreation = !!raw.needsCreation;
  if (typeof raw.name === 'string') doc.name = raw.name;
  if (raw.appearance && typeof raw.appearance === 'object') {
    doc.appearance = { ...APPEARANCE_DEFAULT, ...raw.appearance };
  }
  if (typeof raw.opening === 'string' && OPENINGS_BY_ID[raw.opening]) doc.opening = raw.opening;

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
    for (let i = 0; i < Math.min(slots, raw.pack.items.length); i++) {
      doc.pack.items[i] = hydrateItem(raw.pack.items[i]);
    }
  }
  if (raw.equipment && typeof raw.equipment === 'object') {
    for (const s of SLOTS) doc.equipment[s] = hydrateItem(raw.equipment[s]);
  }
  if (Array.isArray(raw.bar)) {
    for (let i = 0; i < BAR_SLOTS; i++) {
      doc.bar[i] = typeof raw.bar[i] === 'string' ? raw.bar[i] : null;
    }
  }
  if (Array.isArray(raw.discovered)) doc.discovered = raw.discovered.filter((d) => typeof d === 'string');
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
    if (!baseOf(b)) throw new Error(`auditState: the material ${m} maps to "${b}", which is not a base`);
  }
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
  return { locals: Object.keys(LOCAL_BASES).length, skills: SKILL_IDS.length };
}

auditState();
