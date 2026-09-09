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
// WHAT A SELECTED SLOT MEANS
//
// The tool row at the bottom of the screen is gone (T3). Nothing is taken "in
// hand" by pressing a number any more: melee, ranged and casting read
// `character.equipment`, and chopping, mining and skinning read what you carry,
// through `toolFor` in `src/game/tools.js`. The one thing a player still gets
// to say is WHICH of two tools does the work, and this bar is where they say
// it: pressing a slot that holds a tool SELECTS it, and `character.itemBarSlot`
// remembers which. `toolFor` prefers that slot over everything else it finds.
//
// Only a tool selects. A potion is drunk and a helm is worn, and neither of
// them decides how a tree comes down, so neither moves the selection: a light
// on the HUD that changed nothing would be a lie.
//
// No DOM and no THREE: `hud.js` draws what `view()` returns. This file runs in
// node, which is where item_bar.test.mjs drives it.

import { baseFor, SLOTS } from '../mmo/items.js';
import { RESERVED_KEYS } from './windows.js';
import { workWords } from './tools.js';

/** "mining" at the head of a sentence. */
const capitalise = (s) => String(s || '').replace(/^./, (c) => c.toUpperCase());

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
  // The selection is an index into the list above, and it is only a selection
  // while that slot still holds something. A save written before T3 has no
  // `itemBarSlot` at all, and a slot emptied since points at nothing.
  const sel = character.itemBarSlot;
  character.itemBarSlot = Number.isInteger(sel) && sel >= 0 && sel < ITEM_SLOTS && character.itemBar[sel]
    ? sel : null;
  return character.itemBar;
}

/** Which slot the player chose, or null. `tools.js` reads the base on it. */
export function selectedSlotOf(character) {
  itemBarOf(character);
  return character && Number.isInteger(character.itemBarSlot) ? character.itemBarSlot : null;
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
 * Brackenwake is not worn and not eaten: it is chosen, and `select` in
 * createItemBar is what a press on one does.
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
  const enabled = typeof o.enabled === 'function' ? o.enabled : () => true;
  /** Told when the selection moves, so the HUD and the save can follow it. */
  const onSelect = typeof o.onSelect === 'function' ? o.onSelect : null;

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
    const chosen = selectedSlotOf(character);
    return bar.map((entry, i) => {
      const key = keyOf(character, i);
      const out = {
        slot: i, key, cap: keyCap(key),
        base: null, name: '', count: 0, have: false, worn: false,
        wornAt: null, ghost: false, empty: true, kind: null,
        selected: chosen === i,
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

  // -------------------------------------------------------------- selection

  /**
   * Choose the tool on a slot. This is the whole of what "in hand" used to
   * mean: `toolFor` prefers a selected tool over anything else you carry, so a
   * player with two things that could do the work says which one does it.
   *
   * EVERY PATH OUT OF HERE SPEAKS, including the two refusals. A slot with
   * nothing on it, and a slot holding something that is not a tool, would both
   * leave a light on the HUD that decides nothing, and so would a lockpick,
   * which the lock takes out of the pack by itself the moment you click a box.
   *
   * `use` calls this rather than saying anything of its own, so a press of the
   * key and a click of the cell produce one sentence and it is this one.
   */
  function select(slot) {
    const bar = itemBarOf(character);
    if (!Number.isInteger(slot) || slot < 0 || slot >= ITEM_SLOTS) {
      return { ok: false, kind: 'none', reason: say(`the item bar has ${ITEM_SLOTS} slots and that is not one of them`, 'bad') };
    }
    const entry = bar[slot];
    const cap = keyCap(keyOf(character, slot));
    if (!entry) return { ok: false, kind: 'empty', reason: say(`${cap} has nothing on it to choose`, 'bad') };
    const name = entry.name || labelOf(entry.base);
    if (planFor(entry.base).kind !== 'tool') {
      return { ok: false, kind: 'none', reason: say(`${name} is not a tool, so there is nothing to choose it for`, 'bad') };
    }
    const work = workWords(entry.base);
    if (!work) {
      return {
        ok: false, kind: 'unchosen',
        reason: say(`${name} is not something you choose. It is used out of your pack the moment it is wanted.`),
      };
    }
    const was = selectedSlotOf(character);
    character.itemBarSlot = slot;
    onSelect?.(slot, was);
    return {
      ok: true, kind: 'tool', slot, base: entry.base, was,
      reason: say(was === slot
        ? `${name} is chosen already. ${capitalise(work)} goes through it.`
        : `${name} chosen. ${capitalise(work)} goes through it now.`),
    };
  }

  /**
   * Put the choice down again. What you carry decides once more.
   *
   * `quiet` is for the callers that are already saying it in a longer sentence
   * of their own (`clear` and `assign`); on its own it speaks, because a tool
   * silently ceasing to be the chosen one is a change to what the next click
   * picks up.
   */
  function deselect({ quiet = false } = {}) {
    const was = selectedSlotOf(character);
    if (was === null) return { ok: false, slot: null, was: null, reason: '' };
    const name = itemBarOf(character)[was]?.name || 'the tool';
    character.itemBarSlot = null;
    onSelect?.(null, was);
    return {
      ok: true, slot: null, was,
      reason: quiet ? '' : say(`${name} is no longer the tool you chose. What you carry decides again.`),
    };
  }

  // ---------------------------------------------------------------- assign

  /**
   * Put something on a slot. Takes an item record, a pack address the bag drag
   * hands over (`{ pack: 3 }`), a doll address (`{ slot: 'mainHand' }`), or a
   * bare base id. Every refusal says which.
   */
  function assign(slot, what) {
    if (what && typeof what === 'object' && 'itemBarSlot' in what) return swap(what.itemBarSlot, slot);
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
    // Read the choice BEFORE anything moves. A chosen tool dragged to another
    // key is still chosen and follows the key; a chosen tool buried under
    // something that is not a tool is not chosen any more, and that changes
    // what the next swing picks up, so it is said out loud.
    const chosen = selectedSlotOf(character);
    const moved = chosen !== null && chosen === already;
    const buried = chosen !== null && chosen === slot && plan.kind !== 'tool';
    const buriedName = buried ? (bar[chosen]?.name || bar[chosen]?.base || 'the tool') : '';
    if (already >= 0) bar[already] = null;
    const displaced = bar[slot];
    bar[slot] = { base, name: labelOf(item) };
    if (moved) character.itemBarSlot = slot;
    if (buried) deselect({ quiet: true });

    const words = [`${labelOf(item)} answers to ${keyCap(keyOf(character, slot))}`];
    if (displaced && displaced.base !== base) words.push(`${displaced.name || displaced.base} comes off`);
    if (already >= 0) words.push(`and leaves ${keyCap(keyOf(character, already))}`);
    if (moved) words.push('and is still the tool you chose');
    if (buried) words.push(`${buriedName.toLowerCase()} is no longer chosen, and comes out of your pack as before`);
    return { ok: true, slot, base, displaced, moved, deselected: buried, reason: say(words.join(', ')) };
  }

  /** Move or exchange assignments without consuming either item. */
  function swap(from, to) {
    const bar = itemBarOf(character);
    if (![from, to].every(i => Number.isInteger(i) && i >= 0 && i < ITEM_SLOTS))
      return { ok: false, reason: say('Choose two item bar slots.', 'bad') };
    if (!bar[from]) return { ok: false, reason: say('That item slot is empty.', 'bad') };
    if (from === to) return { ok: true, moved: false };
    const chosen = selectedSlotOf(character), displaced = bar[to];
    [bar[from], bar[to]] = [bar[to], bar[from]];
    if (chosen === from || chosen === to) {
      character.itemBarSlot = chosen === from ? to : from;
      onSelect?.(character.itemBarSlot, chosen);
    }
    return { ok: true, moved: true, from, to, displaced,
      reason: say(displaced
        ? `${keyCap(keyOf(character, from))} and ${keyCap(keyOf(character, to))} swapped.`
        : `${bar[to].name || labelOf(bar[to].base)} moved to ${keyCap(keyOf(character, to))}.`) };
  }

  /** Take a slot back off the bar. */
  function clear(slot) {
    const bar = itemBarOf(character);
    if (!Number.isInteger(slot) || slot < 0 || slot >= ITEM_SLOTS) {
      return { ok: false, reason: say(`the item bar has ${ITEM_SLOTS} slots and that is not one of them`, 'bad') };
    }
    const had = bar[slot];
    if (!had) return { ok: false, reason: say(`${keyCap(keyOf(character, slot))} is already empty`, 'bad') };
    const wasChosen = selectedSlotOf(character) === slot;
    bar[slot] = null;
    // itemBarOf would drop a selection pointing at an empty slot on its own;
    // this says so, because taking your chosen tool off the bar changes what
    // the next tree is cut with
    if (wasChosen) deselect({ quiet: true });
    const words = [`${had.name || had.base} comes off ${keyCap(keyOf(character, slot))}`];
    if (wasChosen) words.push('and is no longer the tool you chose, so what you carry decides again');
    return { ok: true, slot, removed: had, deselected: wasChosen, reason: say(words.join(', ')) };
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

    // A TOOL IS CHOSEN, NOT TAKEN IN HAND. `select` owns the words and the
    // refusals, so pressing the key and clicking the cell say the same thing.
    if (plan.kind === 'tool') {
      const r = select(slot);
      return {
        ok: r.ok, kind: r.kind || 'tool', index: found.index,
        selected: r.ok ? slot : null, reason: r.reason,
      };
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
    view, assign, swap, clear, use, update, select, deselect,
    /** The slot whose tool does the work, or null. `tools.js` reads the base. */
    get selected() { return selectedSlotOf(character); },
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
