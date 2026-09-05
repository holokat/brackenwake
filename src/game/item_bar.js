// The second bar: eight slots for what you carry, beside the twelve for what
// you know.
//
// WHY IT IS ITS OWN BAR
//
// The ability bar holds ids out of `abilities.js` and fires them through
// `abilities_runtime.use(slot)`. A potion is not an ability: it has a count,
// it can run out, it can be worn, and it moves around the pack every time you
// pick something up. Putting the two on one strip would mean one slot record
// that is sometimes an id and sometimes an item, one key row shared between a
// cooldown sweep and a stack count, and a drag payload that has to be sniffed.
// So there are two bars, and the skill bar stays what it always was.
//
// WHAT A SLOT REMEMBERS
//
// The item's BASE, never the pack index. A pack index is stale the moment you
// loot a rabbit: `inventory.add` fills the first empty slot and `sort()` moves
// everything. A slot that remembered index 3 would fire whatever fell into
// slot 3. A slot that remembers `potion` finds the potions wherever they are,
// and says so when there are none left.
//
// The cost of that choice, stated: two longswords in the pack are one base, so
// a sword slot fires whichever the pack lists first. That is the right answer
// for the stacks this bar is mostly for (potions, bandages, food, arrows) and
// an arbitrary one for gear, and it is arbitrary rather than wrong.
//
// THE KEYS
//
// F5 to F12. F1 is fly mode and F2 is the dev bench, both already spoken for,
// and 1 to 0 and the two after them belong to the ability bar. That leaves the
// function row from F3 up, and starting at F5 keeps a gap after the two the
// game already owns.
//
// The browser owns some of these. F5 reloads the page and F11 goes full
// screen, so this module installs a capture phase keydown listener and calls
// preventDefault on exactly the keys it is bound to; nothing else is touched.
// F12 opens the developer tools in Chrome and CANNOT be prevented by a page,
// which is why every one of the eight is rebindable through
// `character.settings.itemBar`. See docs/mmo/wiring/U4.md.
//
// No DOM and no THREE: `hud.js` draws what `view()` returns. This file runs in
// node, which is where item_bar.test.mjs drives it.

import { baseFor, SLOTS } from '../mmo/items.js';
import { RESERVED_KEYS } from './windows.js';

/** Eight slots, and eight keys, and never a number typed twice. */
export const ITEM_KEYS = ['f5', 'f6', 'f7', 'f8', 'f9', 'f10', 'f11', 'f12'];
export const ITEM_SLOTS = ITEM_KEYS.length;

/** What the browser will do with these unless a page says otherwise. */
export const BROWSER_KEYS = {
  f5: 'reloads the page',
  f11: 'goes full screen',
  f12: 'opens the developer tools, and a page cannot stop it',
};

/** The cap on the HUD. `f5` is not a word anybody reads. */
export const keyCap = (key) => String(key || '').toUpperCase();

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const countOf = (item) => (item && isNum(item.count) ? item.count : 1);
const idOf = (item) => (item ? (typeof item === 'string' ? item : (item.base || item.id || null)) : null);

/** The word this record wears on the bar: its own label, else its base's name. */
export function labelOf(item) {
  if (!item) return '';
  if (typeof item === 'string') return baseFor(item)?.name || item;
  return item.label || baseFor(item)?.name || String(item.base || item.id || '');
}

/**
 * Fill in the bar the document may not have yet, in place. A save written
 * before this bar existed has no `itemBar`, and a save written by a build with
 * six slots has a short one.
 */
export function itemBarOf(character) {
  if (!character || typeof character !== 'object') return [];
  if (!Array.isArray(character.itemBar)) character.itemBar = [];
  character.itemBar.length = ITEM_SLOTS;
  for (let i = 0; i < ITEM_SLOTS; i++) {
    const e = character.itemBar[i];
    character.itemBar[i] = e && typeof e === 'object' && e.base ? { base: String(e.base), name: String(e.name || '') } : null;
  }
  return character.itemBar;
}

/**
 * The key on a slot: what the document was rebound to, else the default row.
 * `character.settings.itemBar` is a plain array of key names, exactly the
 * shape `settings.bar` already has for the ability bar.
 */
export function keyOf(character, slot) {
  const bound = character?.settings?.itemBar;
  const k = Array.isArray(bound) ? bound[slot] : null;
  return String(k || ITEM_KEYS[slot] || '').toLowerCase();
}

/** Every key the bar is listening on right now, in slot order. */
export const keysOf = (character) => ITEM_KEYS.map((_, i) => keyOf(character, i));

/**
 * Rebind one slot. Refuses the keys the world drives (windows.js's own list,
 * not a second copy of it), the twelve the ability bar answers to, and a key
 * another item slot already holds, and says which.
 */
export function rebind(character, slot, key) {
  if (!character) return { ok: false, reason: 'there is no character to bind a key on' };
  if (!Number.isInteger(slot) || slot < 0 || slot >= ITEM_SLOTS) {
    return { ok: false, reason: `the item bar has ${ITEM_SLOTS} slots and that is not one of them` };
  }
  const k = String(key || '').toLowerCase();
  if (!k) return { ok: false, reason: 'that is not a key' };
  if (RESERVED_KEYS.includes(k)) return { ok: false, reason: `${keyCap(k)} drives the world and cannot be a slot` };
  if ('1234567890-='.includes(k) && k.length === 1) return { ok: false, reason: `${keyCap(k)} belongs to the ability bar` };
  if (k === 'f1' || k === 'f2') return { ok: false, reason: `${keyCap(k)} is fly mode and the dev bench` };
  if (!character.settings || typeof character.settings !== 'object') character.settings = {};
  const list = Array.isArray(character.settings.itemBar) ? character.settings.itemBar.slice() : ITEM_KEYS.slice();
  list.length = ITEM_SLOTS;
  for (let i = 0; i < ITEM_SLOTS; i++) if (!list[i]) list[i] = ITEM_KEYS[i];
  const taken = list.findIndex((x, i) => i !== slot && String(x).toLowerCase() === k);
  if (taken >= 0) return { ok: false, reason: `${keyCap(k)} is already slot ${taken + 1}` };
  const was = list[slot];
  list[slot] = k;
  character.settings.itemBar = list;
  return { ok: true, slot, key: k, was, reason: `slot ${slot + 1} answers to ${keyCap(k)} now` };
}

/**
 * Pure. What pressing a slot holding this item would do.
 *
 * The rule is items.js's, read the same way `win_bag.js`'s double click reads
 * it: anything with a slot is worn or held, anything with a `use` is eaten or
 * drunk, and the two stacking oddments that have neither (`potion`, `bandage`)
 * are named there and here. A tool is its own answer, because a pickaxe in
 * Brackenwake is not worn and not eaten; see `setTool` in createItemBar.
 */
export const USE_KINDS = ['food', 'meal'];
export const USE_IDS = ['potion', 'bandage'];

export function planFor(item) {
  const b = baseFor(item);
  if (!b) return { kind: 'none', reason: 'there is nothing by that name any more' };
  if (b.slot) return { kind: 'equip', slot: b.slot, base: b };
  if (b.use || USE_KINDS.includes(b.kind) || USE_IDS.includes(b.id)) return { kind: 'use', base: b };
  if (b.kind === 'tool') return { kind: 'tool', base: b };
  return { kind: 'none', base: b, reason: `${b.name.toLowerCase()} goes into something, it does not go on you` };
}

/**
 * The two named oddments are real bases, and every slot has a key. Runs at
 * import, so a rename in items.js fails here rather than in a fight.
 */
export function auditItemBar() {
  for (const id of USE_IDS) {
    if (!baseFor(id)) throw new Error(`item_bar: "${id}" is drunk or applied and items.js has no such base`);
  }
  if (ITEM_KEYS.length !== ITEM_SLOTS) throw new Error('item_bar: keys and slots disagree');
  if (new Set(ITEM_KEYS).size !== ITEM_SLOTS) throw new Error('item_bar: two slots share a key');
  for (const k of ITEM_KEYS) {
    if (RESERVED_KEYS.includes(k)) throw new Error(`item_bar: ${k} drives the world`);
  }
  return ITEM_SLOTS;
}

auditItemBar();

/**
 * The bar.
 *
 * @param {object} o
 * @param {object} o.character      the document; `itemBar` is written on it
 * @param {object} o.inventory      createInventory's return; `equip` and the pack
 * @param {object} [o.input]        input.js; `pressed(key)` per frame
 * @param {object} [o.hud]          hud.log, else hud.toast
 * @param {function} [o.useItem]    ctx.useItem, which is foraging.useItem
 * @param {function} [o.setTool]    main.js's pickTool, for a tool in a slot
 * @param {function} [o.enabled]    false while a window has the keyboard
 * @param {boolean} [o.guardKeys]   preventDefault the bound keys; true by default
 * @param {object} [o.win]          the window to guard on; defaults to globalThis
 */
export function createItemBar(o = {}) {
  const character = o.character || {};
  const inventory = o.inventory || null;
  const input = o.input || null;
  const hud = o.hud || null;
  const useItem = typeof o.useItem === 'function' ? o.useItem : null;
  const setTool = typeof o.setTool === 'function' ? o.setTool : null;
  const enabled = typeof o.enabled === 'function' ? o.enabled : () => true;

  itemBarOf(character);

  let lastSaid = '';
  function say(text, kind) {
    if (!text) return '';
    lastSaid = text;
    if (hud && typeof hud.log === 'function') hud.log(text, kind);
    else if (hud && typeof hud.toast === 'function') hud.toast(text, kind);
    return text;
  }

  const packItems = () => (inventory?.pack?.items) || character.pack?.items || [];
  const equipment = () => inventory?.equipment || character.equipment || {};

  /** Where in the pack this base is, and how many of it there are in all. */
  function findInPack(base) {
    const items = packItems();
    let index = -1, count = 0;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it || idOf(it) !== base) continue;
      if (index < 0) index = i;
      count += countOf(it);
    }
    return { index, count, item: index >= 0 ? items[index] : null };
  }

  /** The doll slot this base is worn in, or null. */
  function findWorn(base) {
    const eq = equipment();
    for (const s of SLOTS) if (eq[s] && idOf(eq[s]) === base) return s;
    return null;
  }

  // ------------------------------------------------------------------ view

  /**
   * One entry per slot, always eight long, for hud.js. A slot whose stack has
   * run out keeps its `name` and comes back as a ghost rather than as an empty
   * square, so the player can see what used to be there and what to find more
   * of.
   */
  function view() {
    const bar = itemBarOf(character);
    return bar.map((entry, i) => {
      const key = keyOf(character, i);
      const out = {
        slot: i, key, cap: keyCap(key),
        base: null, name: '', count: 0, have: false, worn: false,
        wornAt: null, ghost: false, empty: true, kind: null,
      };
      if (!entry) return out;
      out.empty = false;
      out.base = entry.base;
      out.name = entry.name || labelOf(entry.base);
      const found = findInPack(entry.base);
      const worn = findWorn(entry.base);
      out.count = found.count;
      out.have = found.index >= 0;
      out.worn = !!worn;
      out.wornAt = worn;
      out.ghost = !out.have && !out.worn;
      out.kind = planFor(found.item || entry.base).kind;
      return out;
    });
  }

  // ---------------------------------------------------------------- assign

  /**
   * Put something on a slot. Takes an item record, a pack address the bag drag
   * hands over (`{ pack: 3 }`), a doll address (`{ slot: 'mainHand' }`), or a
   * bare base id. Every refusal says which.
   */
  function assign(slot, what) {
    const bar = itemBarOf(character);
    if (!Number.isInteger(slot) || slot < 0 || slot >= ITEM_SLOTS) {
      return { ok: false, reason: say(`the item bar has ${ITEM_SLOTS} slots and that is not one of them`, 'bad') };
    }
    let item = what;
    if (what && typeof what === 'object' && (isNum(what.pack) || typeof what.slot === 'string')) {
      const found = inventory?.at ? inventory.at(what) : null;
      item = found?.item || null;
      if (!item) return { ok: false, reason: say('there is nothing there to put on the bar', 'bad') };
    }
    const base = idOf(item);
    const b = baseFor(base);
    if (!b) return { ok: false, reason: say('that is not a thing you can carry', 'bad') };

    const plan = planFor(item);
    if (plan.kind === 'none') {
      return { ok: false, reason: say(`${b.name} does not answer to a key: ${plan.reason}`, 'bad') };
    }

    // One base, one slot. Two keys on the same potions is two counts of one truth.
    const already = bar.findIndex((e, i) => e && e.base === base && i !== slot);
    if (already >= 0) bar[already] = null;
    const displaced = bar[slot];
    bar[slot] = { base, name: labelOf(item) };

    const words = [`${labelOf(item)} answers to ${keyCap(keyOf(character, slot))}`];
    if (displaced && displaced.base !== base) words.push(`${displaced.name || displaced.base} comes off`);
    if (already >= 0) words.push(`and leaves ${keyCap(keyOf(character, already))}`);
    return { ok: true, slot, base, displaced, reason: say(words.join(', ')) };
  }

  /** Take a slot back off the bar. */
  function clear(slot) {
    const bar = itemBarOf(character);
    if (!Number.isInteger(slot) || slot < 0 || slot >= ITEM_SLOTS) {
      return { ok: false, reason: say(`the item bar has ${ITEM_SLOTS} slots and that is not one of them`, 'bad') };
    }
    const had = bar[slot];
    if (!had) return { ok: false, reason: say(`${keyCap(keyOf(character, slot))} is already empty`, 'bad') };
    bar[slot] = null;
    return { ok: true, slot, removed: had, reason: say(`${had.name || had.base} comes off ${keyCap(keyOf(character, slot))}`) };
  }

  // ------------------------------------------------------------------- use

  /**
   * Press a slot. Every branch says something: a swallowed press is
   * indistinguishable from a broken key.
   */
  function use(slot) {
    const bar = itemBarOf(character);
    const entry = bar[slot];
    const cap = keyCap(keyOf(character, slot));
    if (!entry) return { ok: false, kind: 'empty', reason: say(`${cap} has nothing on it`) };

    const found = findInPack(entry.base);
    const worn = findWorn(entry.base);
    const name = entry.name || labelOf(entry.base);

    if (found.index < 0) {
      if (worn) return { ok: false, kind: 'worn', slot: worn, reason: say(`${name} is already on your ${worn}`) };
      return { ok: false, kind: 'gone', reason: say(`you have no ${name.toLowerCase()} left`, 'bad') };
    }

    const item = found.item;
    const plan = planFor(item);

    if (plan.kind === 'use') {
      if (!useItem) {
        return { ok: false, kind: 'unwired', reason: say(`nothing is wired to use ${name.toLowerCase()} yet; main.js passes useItem to createItemBar`, 'bad') };
      }
      const r = useItem(item, { pack: found.index });
      return { ok: r ? r.ok !== false : true, kind: 'use', index: found.index, result: r, reason: r?.text || '' };
    }

    if (plan.kind === 'equip') {
      if (!inventory?.equip) {
        return { ok: false, kind: 'unwired', reason: say(`nothing is wired to put ${name.toLowerCase()} on yet`, 'bad') };
      }
      const r = inventory.equip(found.index);
      return { ok: !!r?.ok, kind: 'equip', index: found.index, result: r, reason: r?.text || r?.reason || '' };
    }

    if (plan.kind === 'tool') {
      if (!setTool) {
        return {
          ok: false, kind: 'unwired',
          reason: say(`${name} is a tool, and nothing is wired to take one in hand from a slot yet; main.js passes setTool to createItemBar`, 'bad'),
        };
      }
      const took = setTool(plan.base.id, item);
      return { ok: took !== false, kind: 'tool', index: found.index, reason: took === false ? '' : say(`${name} in hand`) };
    }

    return { ok: false, kind: 'none', reason: say(plan.reason || `nothing happens with ${name.toLowerCase()}`, 'bad') };
  }

  // --------------------------------------------------------------- the frame

  function update() {
    if (!input || typeof input.pressed !== 'function') return null;
    if (!enabled()) return null;
    for (let i = 0; i < ITEM_SLOTS; i++) {
      const k = keyOf(character, i);
      if (!input.pressed(k)) continue;
      // Take the press away so nothing later in the frame acts on it too. The
      // eight are the bar's alone today, but a rebind can put a slot on any
      // key, and a key that fires two things is the tool row bug again.
      if (typeof input.swallow === 'function') input.swallow(k);
      return { slot: i, ...use(i) };
    }
    return null;
  }

  // --------------------------------------------------------- the browser's keys
  // F5 reloads and F11 goes full screen. Nothing else on the page is touched:
  // the listener asks `keysOf` every event, so a rebind takes effect at once
  // and an unbound function key is left to the browser.

  const win = o.win || (typeof window !== 'undefined' ? window : null);
  let guard = null;
  if (o.guardKeys !== false && win && typeof win.addEventListener === 'function') {
    guard = (e) => {
      const k = String(e.key || '').toLowerCase();
      if (!k || !keysOf(character).includes(k)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (typeof e.preventDefault === 'function') e.preventDefault();
    };
    win.addEventListener('keydown', guard, true);
  }

  return {
    character,
    get bar() { return itemBarOf(character); },
    slots: ITEM_SLOTS,
    keys: () => keysOf(character),
    view, assign, clear, use, update,
    rebind: (slot, key) => {
      const r = rebind(character, slot, key);
      say(r.reason, r.ok ? undefined : 'bad');
      return r;
    },
    planFor,
    /** The last line said, for tests and for anything replaying feedback. */
    get lastSaid() { return lastSaid; },
    dispose() {
      if (guard && win && typeof win.removeEventListener === 'function') win.removeEventListener('keydown', guard, true);
      guard = null;
    },
  };
}

export default createItemBar;
