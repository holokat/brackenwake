// What you carry: coins, three materials, the tools you have bought, and where
// you were standing when the game last saved.
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
  const tools = new Set();
  const pos = { x: 0, z: 0 };

  const notify = (what) => { for (const fn of listeners) { try { fn(state, what); } catch (e) { console.error('[state] listener threw', e); } } };

  const state = {
    materials, caps, tools, pos,

    // coins and tool are accessors so a direct assignment still redraws the HUD
    get coins() { return coins; },
    set coins(v) { const n = Math.max(0, Math.round(isNum(v) ? v : 0)); if (n === coins) return; coins = n; notify('coins'); },
    get tool() { return tool; },
    set tool(v) {
      const t = v === 'hand' || (TOOLS.includes(v) && tools.has(v)) ? v : 'hand';
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
    hasTool(id) { return tools.has(id); },

    /**
     * Where the player is standing. Deliberately quiet: this moves every frame
     * and nothing on the HUD reads it, so notifying here would redraw the whole
     * HUD sixty times a second.
     */
    setPos(x, z) { if (isNum(x)) pos.x = x; if (isNum(z)) pos.z = z; },

    save() {
      if (!storage) return false;
      const data = { v: SAVE_VERSION, coins, materials: { ...materials }, tools: [...tools], tool, pos: { x: pos.x, z: pos.z } };
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
