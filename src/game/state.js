// What you carry: coins, three materials, what a hunt leaves, the tools you
// have bought, and where you were standing when the game last saved.
//
// Two rules run through this file.
//
// 1. Nothing is dropped in silence. `add` always reports what went in the pack
//    and what would not fit, so the caller can say so on screen. A pack that
//    swallows nine items and looks empty is indistinguishable from a bug.
// 2. Nothing changes without saying so. Every mutation notifies `onChange`, so
//    the HUD redraws from the same event whether the change came from an axe,
//    the market, or a save being loaded. Assigning `state.coins` or
//    `state.tool` directly notifies too, because main.js will do exactly that
//    when the player presses 2 to take out the axe.
//
// The save is versioned and additive: unknown keys are ignored, missing keys
// fall back to the starting value, and an older shape is read for whatever it
// still has. Nothing here throws on a bad save; the worst case is a new game.

export const SAVE_KEY = 'brackenwake-save-v1';
export const SAVE_VERSION = 1;

export const MATERIALS = ['wood', 'stone', 'ore'];
export const CAP = 150;

/**
 * What a kill leaves, and the only goods the pack takes besides the three
 * materials. Both are real rows in `src/farm/catalog.js` GOODS, which is where
 * their names and prices come from; this list is only the question of what you
 * can carry. `src/game/interact.js` audits `combat.js`'s loot table against it
 * at module load, so a seventh animal dropping a pelt fails loudly instead of
 * putting "1 pelt in the pack" on screen over a pack that took nothing.
 */
export const CARRIED = ['venison', 'game_meat'];
/** Meat is heavier than timber, and there is no smoker to keep it in. */
export const GOOD_CAP = 20;
export const TOOLS = ['axe', 'pickaxe', 'bow'];
export const START_COINS = 120;   // the first axe is 60, so you can buy one and eat

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

function defaultStorage() {
  try {
    if (typeof localStorage !== 'undefined' && localStorage) return localStorage;
  } catch { /* a private window can throw on the mere mention of it */ }
  return null;
}

/**
 * @param {{ storage?: Storage|null, key?: string }} [opts]
 *   `storage` lets a test hand in a Map-backed stub; `null` means do not
 *   persist at all, which is also what a private window gets.
 */
export function createState(opts = {}) {
  const key = opts.key || SAVE_KEY;
  const storage = opts.storage === undefined ? defaultStorage() : opts.storage;
  const listeners = new Set();

  let coins = START_COINS;
  let tool = 'hand';
  const materials = { wood: 0, stone: 0, ore: 0 };
  const caps = { wood: CAP, stone: CAP, ore: CAP };
  // the hunting bag, kept apart from the three materials because nothing is
  // built out of venison and the market prices it from the catalog instead
  const goods = Object.fromEntries(CARRIED.map((g) => [g, 0]));
  const goodCaps = Object.fromEntries(CARRIED.map((g) => [g, GOOD_CAP]));
  const tools = new Set();
  // Dev mode is a lens, not a gift: it reports everything as owned and lets the
  // market charge nothing, and turning it off hands back exactly what was
  // bought. Nothing it does is written to the save.
  let dev = false;
  const pos = { x: 0, z: 0 };

  const notify = (what) => { for (const fn of listeners) { try { fn(state, what); } catch (e) { console.error('[state] listener threw', e); } } };

  const state = {
    materials, caps, tools, pos, goods, goodCaps,

    // coins and tool are accessors so a direct assignment still redraws the HUD
    get coins() { return coins; },
    set coins(v) { const n = Math.max(0, Math.round(isNum(v) ? v : 0)); if (n === coins) return; coins = n; notify('coins'); },
    get dev() { return dev; },
    set dev(v) { const n = !!v; if (n === dev) return; dev = n; notify('dev'); },
    get tool() { return tool; },
    set tool(v) {
      const t = v === 'hand' || (TOOLS.includes(v) && (dev || tools.has(v))) ? v : 'hand';
      if (t === tool) return;
      tool = t; notify('tool');
    },

    /** Put `n` of a material in the pack. Never silent: what did not fit comes back. */
    add(material, n) {
      const want = Math.max(0, Math.floor(isNum(n) ? n : 0));
      if (!MATERIALS.includes(material)) {
        console.warn(`[state] add("${material}") is not a material this game carries`);
        return { added: 0, dropped: want };
      }
      const room = Math.max(0, caps[material] - materials[material]);
      const added = Math.min(want, room);
      const dropped = want - added;
      if (added > 0) { materials[material] += added; notify('materials'); }
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
      const room = Math.max(0, goodCaps[id] - goods[id]);
      const added = Math.min(want, room);
      const dropped = want - added;
      if (added > 0) { goods[id] += added; notify('goods'); }
      return { added, dropped };
    },

    /** Take `n` of a good out of the bag, or as much of it as is there. */
    takeGood(id, n) {
      if (!CARRIED.includes(id)) return { taken: 0 };
      const want = Math.max(0, Math.floor(isNum(n) ? n : 0));
      const taken = Math.min(want, goods[id]);
      if (taken > 0) { goods[id] -= taken; notify('goods'); }
      return { taken };
    },

    /** Take `n` out of the pack, or as much of it as is there. */
    take(material, n) {
      if (!MATERIALS.includes(material)) return { taken: 0 };
      const want = Math.max(0, Math.floor(isNum(n) ? n : 0));
      const taken = Math.min(want, materials[material]);
      if (taken > 0) { materials[material] -= taken; notify('materials'); }
      return { taken };
    },

    spend(c) {
      const cost = Math.max(0, Math.floor(isNum(c) ? c : 0));
      if (coins < cost) return false;
      coins -= cost; notify('coins');
      return true;
    },

    earn(c) {
      const gain = Math.max(0, Math.floor(isNum(c) ? c : 0));
      if (!gain) return 0;
      coins += gain; notify('coins');
      return gain;
    },

    /** Hand over a tool for good. Returns false if it was already carried. */
    giveTool(id) {
      if (!TOOLS.includes(id) || tools.has(id)) return false;
      tools.add(id);
      notify('tools');
      if (tool === 'hand') { tool = id; notify('tool'); }  // first tool goes straight into the hand
      return true;
    },
    hasTool(id) { return dev ? TOOLS.includes(id) : tools.has(id); },
    /** What is really owned, ignoring dev mode. The save and the shop use this. */
    boughtTool(id) { return tools.has(id); },

    /**
     * Where the player is standing. Deliberately quiet: this moves every frame
     * and nothing on the HUD reads it, so notifying here would redraw the whole
     * HUD sixty times a second.
     */
    setPos(x, z) { if (isNum(x)) pos.x = x; if (isNum(z)) pos.z = z; },

    save() {
      if (!storage) return false;
      const data = { v: SAVE_VERSION, coins, materials: { ...materials }, goods: { ...goods }, tools: [...tools], tool, pos: { x: pos.x, z: pos.z } };
      try { storage.setItem(key, JSON.stringify(data)); return true; } catch { return false; }
    },

    /**
     * Read the save back. Tolerant on purpose: no save, corrupt JSON, a missing
     * key or a shape from before `v` existed all leave the game playable, with
     * whatever could be read carried over.
     * @returns {boolean} true if a save was found and something was taken from it
     */
    load() {
      if (!storage) return false;
      let raw = null;
      try { raw = storage.getItem(key); } catch { return false; }
      if (!raw) return false;
      let d = null;
      try { d = JSON.parse(raw); } catch { return false; }
      if (!d || typeof d !== 'object') return false;

      if (isNum(d.coins)) coins = Math.max(0, Math.round(d.coins));

      // v1 nests the materials; the shape before it kept them at the top level
      const m = (d.materials && typeof d.materials === 'object') ? d.materials : d;
      for (const k of MATERIALS) if (isNum(m[k])) materials[k] = clamp(Math.floor(m[k]), 0, caps[k]);

      // the hunting bag is newer than the save, so a save from before it exists
      // simply has none and every good stays at zero
      const g = (d.goods && typeof d.goods === 'object') ? d.goods : {};
      for (const k of CARRIED) goods[k] = isNum(g[k]) ? clamp(Math.floor(g[k]), 0, goodCaps[k]) : 0;

      // tools have been an array, and before that a { axe: true } map
      tools.clear();
      const list = Array.isArray(d.tools) ? d.tools
        : (d.tools && typeof d.tools === 'object') ? Object.keys(d.tools).filter((k) => d.tools[k])
        : [];
      for (const t of list) if (TOOLS.includes(t)) tools.add(t);

      // a held tool you no longer own would grey out the whole HUD row
      tool = (d.tool === 'hand' || (TOOLS.includes(d.tool) && tools.has(d.tool))) ? d.tool : 'hand';

      if (d.pos && isNum(d.pos.x) && isNum(d.pos.z)) { pos.x = d.pos.x; pos.z = d.pos.z; }
      else if (isNum(d.x) && isNum(d.z)) { pos.x = d.x; pos.z = d.z; }

      notify('load');
      return true;
    },

    clearSave() { try { storage?.removeItem(key); } catch { /* nothing to do */ } },

    onChange(fn) { if (typeof fn === 'function') listeners.add(fn); return () => listeners.delete(fn); },
  };

  return state;
}
