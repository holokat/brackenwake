// The pack and the paper doll, operating on the character document.
//
// Rules live in src/mmo/items.js and src/mmo/affixes.js and are never
// duplicated here: what can be worn, at what cost, what a thing weighs and
// what its affixes are is asked of that layer every time. This file is the
// half that owns consequences.
//
// Three rules run through it, all of them learned the hard way:
//
// 1. Nothing is dropped in silence. `add` returns { added, dropped } and says
//    out loud what would not fit, because a pack that swallows a longsword and
//    looks empty is indistinguishable from a bug.
// 2. Nothing changes without a word and a recompute. Equipment feeds `bonuses`,
//    `ar`, `resists` and the pools through actor.js; a change that does not
//    recompute is a lie the HUD keeps telling until the next fight.
// 3. A refusal is a result. Every path that will not do the thing says why,
//    names the item, and gives the number that stopped it.
//
// No DOM, no THREE. Runs in node, which is where inventory.test.mjs drives it.

import {
  SLOTS, baseFor, slotsFor, equipSlotFor, twoHanded, weightOf, stackable,
  canEquip, armourOf, RARITY, RARITY_WORD,
} from '../mmo/items.js';
import { identify as identifyItem, describe, nameFor, lineFor, ranked } from '../mmo/affixes.js';
import { derived } from '../mmo/stats.js';

/**
 * The document's starting pack. Bags add to it; 06-ECONOMY-UI.md prices them.
 * 40, not the 20 03-ITEMS-LOOT prints: the user asked for a bigger pack, and
 * `state.js` carries the same number and grows an older save to it on hydrate.
 */
export const PACK_SLOTS = 80;

/** The two ring slots, in the order an empty one is looked for. */
export const RING_SLOTS = ['ring1', 'ring2'];

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const countOf = (item) => (item && isNum(item.count) ? item.count : 1);

/** The word a player uses for an item: its rolled name, or its colour if unknown. */
export function labelOf(item) {
  const b = baseFor(item);
  if (!b) return 'nothing';
  // an unidentified thing is called by its base and nothing else: "boots",
  // never "blue boots". The colour is on the cell and the beam, and saying
  // it as well reads like a second, different item
  if (item && item.rarity && item.rarity !== 'common' && !item.identified) return b.name.toLowerCase();
  const n = nameFor(item);
  return n || b.name;
}

/** "6 bandages" or "the longsword": what a line of feedback calls a thing. */
export function amountOf(item) {
  const b = baseFor(item);
  if (!b) return 'nothing';
  const n = countOf(item);
  if (b.stack && n !== 1) return `${n} ${b.name.toLowerCase()}s`;
  if (b.stack) return `${n} ${b.name.toLowerCase()}`;
  return `the ${labelOf(item).toLowerCase()}`;
}

/** The rarity colour, for anything drawing this item. */
export const colourOf = (item) => (RARITY[item?.rarity] || RARITY.common).colour;

/**
 * The tooltip, as `{ text, colour }` lines. The name and every affix line take
 * the item's rarity colour, which is the whole language 03-ITEMS-LOOT.md asks
 * for; the base's own facts stay plain. The words are affixes.describe's, not
 * a second copy of them.
 */
export function itemTipLines(item) {
  if (!item) return [];
  const colour = colourOf(item);
  const affixText = new Set(ranked(item.affixes || []).map(lineFor));
  return describe(item).map((text, i) => ({
    text,
    colour: i === 0 || affixText.has(text) ? colour : null,
  }));
}

/**
 * Where an operation is pointed. Accepts a pack index, `{ pack: i }`,
 * `{ slot: 'head' }`, or a bare slot name, and refuses anything else rather
 * than guessing.
 */
export function parseWhere(where) {
  if (isNum(where)) return { kind: 'pack', index: Math.floor(where) };
  if (typeof where === 'string') return SLOTS.includes(where) ? { kind: 'equip', slot: where } : null;
  if (where && typeof where === 'object') {
    if (isNum(where.index) && where.kind === 'pack') return { kind: 'pack', index: Math.floor(where.index) };
    if (isNum(where.pack)) return { kind: 'pack', index: Math.floor(where.pack) };
    if (typeof where.slot === 'string' && SLOTS.includes(where.slot)) return { kind: 'equip', slot: where.slot };
  }
  return null;
}

// --------------------------------------------------------------------- sort
// One button, and the rules behind it, kept pure so they can be measured.
//
// Three things happen, in this order, and nothing else:
//   1. stacks of the same base AND the same material are folded into one,
//   2. what is left is ordered by kind, then by name, then by the bigger pile,
//   3. it is compacted to the front, so the empty slots are all at the back.
//
// NOTHING IS EVER LOST. `sortOrder` is pure, does not mutate a single record it
// is handed, and inventory.test.mjs counts every base in and every base out.
// An item whose base this build has never heard of is carried through rather
// than dropped, because a save from a newer build must not be eaten by a sort.

/**
 * The two stacking oddments that have no `use` on their base. `win_bag.js`
 * names the same two and its `auditUsable()` fails if items.js ever renames
 * them; this list is only about where they sit on the shelf.
 */
const SORT_USE_IDS = ['potion', 'bandage'];

/**
 * Pure. Which shelf a thing sits on. Weapons, shields, armour down the body in
 * the paper doll's own slot order, jewellery, the off hand oddments, then what
 * you drink, what you eat, what you build with, and the tools last.
 */
export function sortRank(item) {
  const b = baseFor(item);
  if (!b) return 99;
  if (b.kind === 'weapon') return 10;
  if (b.kind === 'shield') return 20;
  if (b.kind === 'armour') {
    const i = SLOTS.indexOf(b.slot);
    return 30 + (i < 0 ? SLOTS.length : i);
  }
  if (b.kind === 'jewellery') return 50;
  if (b.kind === 'offhand') return 55;
  if (b.kind === 'instrument') return 58;
  if (b.use || SORT_USE_IDS.includes(b.id)) {
    if (b.kind === 'food') return 65;
    if (b.kind === 'meal') return 68;
    return 60;
  }
  if (b.kind === 'food') return 65;
  if (b.kind === 'meal') return 68;
  if (b.kind === 'material') return 70;
  if (b.kind === 'tool') return 80;
  return 90;
}

/** Pure. The word this record sorts under: its own label, else its base's name. */
export function sortName(item) {
  const b = baseFor(item);
  return String((item && item.label) || (b && b.name) || (item && item.base) || '');
}

/**
 * Pure. The merged, ordered, compacted pack.
 *
 * Returns `{ items, merged, moved }`: a dense array with no holes, how many
 * stacks were folded into another, and how many things ended up somewhere
 * other than where they started.
 *
 * A merged stack comes back as a NEW record with the summed count, so the
 * array handed in is untouched and a caller that wants to keep the old one can.
 */
export function sortOrder(items = []) {
  const rows = [];
  const stacks = new Map();
  let merged = 0;

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (!it) continue;
    const b = baseFor(it);
    // stackable() already refuses anything uncommon or affixed, so two magic
    // daggers never become one dagger with a count of two.
    if (b && stackable(it)) {
      const key = `${b.id}|${it.material == null ? '' : it.material}`;
      const seen = stacks.get(key);
      if (seen) { seen.count += countOf(it); merged++; continue; }
      const row = { item: it, orig: i, count: countOf(it), key };
      stacks.set(key, row);
      rows.push(row);
      continue;
    }
    rows.push({ item: it, orig: i, count: countOf(it) });
  }

  for (const row of rows) {
    if (row.key && row.count !== countOf(row.item)) row.item = { ...row.item, count: row.count };
  }

  rows.sort((a, z) => (sortRank(a.item) - sortRank(z.item))
    || sortName(a.item).localeCompare(sortName(z.item))
    || (countOf(z.item) - countOf(a.item))
    || (a.orig - z.orig));

  let moved = 0;
  for (let i = 0; i < rows.length; i++) if (rows[i].orig !== i) moved++;
  return { items: rows.map((r) => r.item), merged, moved };
}

/**
 * Fill in anything the document is missing, in place. A save written before a
 * slot existed, or a pack whose array is shorter than its slot count, would
 * otherwise read as `undefined` in the middle of a grid.
 *
 * This REPAIRS a document; it does not migrate one. Growing a 20 slot pack to
 * today's PACK_SLOTS is `state.hydrate`'s job, on the way in from the save,
 * because a pack handed here with a smaller slot count on purpose (a test, a
 * shop preview) is entitled to keep it.
 */
export function normalise(character) {
  if (!character || typeof character !== 'object') return character;
  if (!character.pack || typeof character.pack !== 'object') character.pack = { slots: PACK_SLOTS, items: [] };
  if (!isNum(character.pack.slots) || character.pack.slots < 1) character.pack.slots = PACK_SLOTS;
  if (!Array.isArray(character.pack.items)) character.pack.items = [];
  const items = character.pack.items;
  items.length = Math.max(items.length, character.pack.slots);
  for (let i = 0; i < items.length; i++) if (items[i] === undefined) items[i] = null;
  if (!character.equipment || typeof character.equipment !== 'object') character.equipment = {};
  for (const s of SLOTS) if (character.equipment[s] === undefined) character.equipment[s] = null;
  if (!isNum(character.gold)) character.gold = 0;
  return character;
}

/** Every item worn or held, in slot order. */
export const wornItems = (character) => SLOTS.map((s) => character?.equipment?.[s]).filter(Boolean);

/** Stones carried: the pack and the paper doll. Gold is weightless. */
export function weightOfCharacter(character) {
  if (!character) return 0;
  let t = 0;
  for (const it of (character.pack?.items || [])) if (it) t += weightOf(it);
  for (const it of wornItems(character)) t += weightOf(it);
  return Math.round(t * 100) / 100;
}

/**
 * What you can carry: 40 + STR * 2 from stats.js, plus every Carry affix on
 * what you are wearing. The affix is read off the equipment rather than off
 * `actor.bonuses`, so the number is right before actor.js has ever run.
 */
export function carryOfCharacter(character) {
  const base = derived(character?.stats || {}, character?.skills || {}).carry;
  let bonus = 0;
  for (const it of wornItems(character)) {
    for (const a of (it.affixes || [])) if (a.id === 'carry') bonus += a.value || 0;
  }
  return Math.round((base + bonus) * 100) / 100;
}

/** The five damage types anything can resist. 02-COMBAT.md caps each at 70%. */
export const RESIST_TYPES = ['physical', 'fire', 'cold', 'poison', 'energy'];
export const RESIST_CAP = 70;

/**
 * The AR the paper doll should show: every worn piece at its quality and its
 * STR penalty, plus every +AR affix. This is the same sum actor.js makes; the
 * window prefers the actor's number when there is one and falls back to this
 * so the sheet is right before the first recompute has run.
 */
export function armourOfCharacter(character) {
  const stats = character?.stats || {};
  let ar = 0;
  for (const it of wornItems(character)) {
    ar += armourOf(it, stats);
    for (const a of (it.affixes || [])) if (a.id === 'ar') ar += a.value || 0;
  }
  return Math.round(ar);
}

/** Typed resists in percent points, each capped where combat caps it. */
export function resistsOfCharacter(character) {
  const out = Object.fromEntries(RESIST_TYPES.map((t) => [t, 0]));
  for (const it of wornItems(character)) {
    const b = baseFor(it);
    if (b && b.resist) for (const [k, v] of Object.entries(b.resist)) if (k in out) out[k] += v;
    for (const a of (it.affixes || [])) {
      if (!a.id || !a.id.startsWith('resist')) continue;
      const t = a.id.slice(6).toLowerCase();
      if (t in out) out[t] += a.value || 0;
    }
  }
  for (const t of RESIST_TYPES) out[t] = Math.min(RESIST_CAP, Math.round(out[t]));
  return out;
}

/**
 * Create the pack and doll operations for one character.
 *
 * @param {object} o
 * @param {object} o.character   the document; mutated in place
 * @param {object} [o.actor]     the runtime actor, handed to recompute
 * @param {function} [o.recompute]  actor.js's recompute; called after every change
 * @param {function} [o.onChange]   (character, what) after every change
 * @param {object} [o.hud]       hud.log if it exists, else hud.toast
 * @param {object} [o.audio]     play('pickup' | 'denied' | 'sell')
 * @param {object} [o.floaters]  spawn(worldPos, text, kind)
 * @param {function} [o.onSell]  (item, where) -> { price } | { ok: false, reason }
 * @param {function} [o.onDrop]  (item, where)
 */
export function createInventory(o = {}) {
  const character = normalise(o.character || {});
  const actor = o.actor || null;
  const recompute = o.recompute || (actor && typeof actor.recompute === 'function' ? actor.recompute : null);
  const onChange = typeof o.onChange === 'function' ? o.onChange : null;
  const hud = o.hud || null;
  const audio = o.audio || null;
  const floaters = o.floaters || null;

  /** The line of feedback, and the last one said, which the tests read. */
  let lastSaid = '';
  function say(text, kind) {
    if (!text) return '';
    lastSaid = text;
    if (hud && typeof hud.log === 'function') hud.log(text, kind);
    else if (hud && typeof hud.toast === 'function') hud.toast(text, kind);
    return text;
  }
  const sound = (cue) => { try { audio?.play?.(cue); } catch { /* a missing cue is not a reason to lose an item */ } };
  const float = (text, kind) => {
    const pos = actor && actor.pos ? actor.pos : null;
    if (pos && floaters && typeof floaters.spawn === 'function') {
      try { floaters.spawn(pos, text, kind); } catch { /* the number is a garnish; the item is real */ }
    }
  };

  /** After anything at all changed. Recompute first: the HUD reads what it wrote. */
  function changed(what) {
    if (recompute && actor) { try { recompute(actor); } catch (e) { console.error('[inventory] recompute threw', e); } }
    if (onChange) { try { onChange(character, what); } catch (e) { console.error('[inventory] onChange threw', e); } }
  }

  const pack = () => character.pack.items;
  const statsOf = () => character.stats || {};
  const intOf = () => {
    const s = statsOf();
    return isNum(s.int) ? s.int : (isNum(s.INT) ? s.INT : 0);
  };

  /** The first empty pack slot, or -1. */
  function emptySlot() {
    const items = pack();
    for (let i = 0; i < character.pack.slots; i++) if (!items[i]) return i;
    return -1;
  }

  /** The item a `where` points at, with its address, or nulls. */
  function at(where) {
    const w = parseWhere(where);
    if (!w) return { w: null, item: null };
    if (w.kind === 'pack') return { w, item: pack()[w.index] || null };
    return { w, item: character.equipment[w.slot] || null };
  }

  function put(w, item) {
    if (w.kind === 'pack') pack()[w.index] = item;
    else character.equipment[w.slot] = item;
  }

  /** An existing pack stack this item could join. */
  function stackFor(item) {
    if (!stackable(item)) return -1;
    const b = baseFor(item);
    const items = pack();
    for (let i = 0; i < character.pack.slots; i++) {
      const other = items[i];
      if (!other || !stackable(other)) continue;
      // the same base AND the same material: three iron ingots and two copper
      // ingots are two stacks, or the forge is told there are five iron
      if (baseFor(other)?.id === b.id && (other.material ?? null) === (item.material ?? null)) return i;
    }
    return -1;
  }

  const weight = () => weightOfCharacter(character);
  const carry = () => carryOfCharacter(character);
  const overweight = () => weight() > carry();

  /** Said after anything that changed the load, and only when it crossed. */
  function burdenLine(before) {
    const now = overweight();
    if (now === before) return '';
    return now
      ? `you are over your limit at ${weight()} of ${carry()} stones, so you walk and cannot run`
      : `you are back under your limit at ${weight()} of ${carry()} stones`;
  }

  // ------------------------------------------------------------------- add

  /**
   * Put an item in the pack. Stacks stack, and what does not fit comes back in
   * `dropped` and is said out loud. Never partially eats a stack in silence.
   */
  function add(item, opts = {}) {
    const b = baseFor(item);
    if (!b) {
      const text = say('that is not a thing you can carry', 'bad');
      return { added: 0, dropped: 0, ok: false, reason: text, text };
    }
    const n = countOf(item);
    const before = overweight();

    const s = stackFor(item);
    if (s >= 0) {
      const into = pack()[s];
      into.count = countOf(into) + n;
      changed('pack');
      const text = opts.quiet ? '' : say(`${amountOf(item)} into the pack, ${into.count} now`);
      if (!opts.quiet) { sound('pickup'); float(`+${n} ${b.name}`, 'loot'); }
      const burden = burdenLine(before);
      if (burden) say(burden, 'bad');
      return { added: n, dropped: 0, ok: true, index: s, text, burden };
    }

    const i = emptySlot();
    if (i < 0) {
      const text = say(`your pack is full, so ${amountOf(item)} stays where it is`, 'bad');
      sound('denied');
      return { added: 0, dropped: n, ok: false, reason: text, text };
    }
    pack()[i] = item;
    changed('pack');
    const text = opts.quiet ? '' : say(`${amountOf(item)} goes in your pack`);
    if (!opts.quiet) { sound('pickup'); float(`+${b.stack && n !== 1 ? n + ' ' : ''}${b.name}`, 'loot'); }
    const burden = burdenLine(before);
    if (burden) say(burden, 'bad');
    return { added: n, dropped: 0, ok: true, index: i, text, burden };
  }

  // ---------------------------------------------------------------- remove

  /** Take an item, or part of a stack, out of the pack or off the doll. */
  function remove(where, n = null) {
    const { w, item } = at(where);
    if (!w) { const text = say('there is nowhere by that name', 'bad'); return { ok: false, item: null, removed: 0, reason: text }; }
    if (!item) { const text = say('there is nothing there', 'bad'); return { ok: false, item: null, removed: 0, reason: text }; }
    const have = countOf(item);
    const want = n == null ? have : Math.max(0, Math.floor(n));
    if (want <= 0) { const text = say('none of it, then', 'bad'); return { ok: false, item: null, removed: 0, reason: text }; }
    if (want >= have) {
      put(w, null);
      changed(w.kind === 'pack' ? 'pack' : 'equipment');
      return { ok: true, item, removed: have };
    }
    item.count = have - want;
    const taken = { ...item, count: want };
    changed('pack');
    return { ok: true, item: taken, removed: want };
  }

  // ------------------------------------------------------------------ move

  /**
   * Drag one place onto another. Pack to pack swaps; pack to a slot equips;
   * a slot to the pack takes it off; ring1 to ring2 swaps the hands.
   */
  function move(from, to) {
    const a = at(from);
    const b = at(to);
    if (!a.w || !b.w) { const text = say('there is nowhere by that name', 'bad'); return { ok: false, reason: text }; }
    if (a.w.kind === b.w.kind && ((a.w.index != null && a.w.index === b.w.index) || (a.w.slot && a.w.slot === b.w.slot))) {
      return { ok: true, reason: '', text: '' };
    }
    if (!a.item) { const text = say('there is nothing to move', 'bad'); return { ok: false, reason: text }; }

    if (a.w.kind === 'pack' && b.w.kind === 'pack') {
      if (b.w.index < 0 || b.w.index >= character.pack.slots) {
        const text = say(`your pack has ${character.pack.slots} slots and that is not one of them`, 'bad');
        return { ok: false, reason: text };
      }
      // Two halves of one stack become one stack, which is what a player means.
      if (b.item && stackable(a.item) && stackable(b.item) && baseFor(a.item).id === baseFor(b.item).id) {
        b.item.count = countOf(a.item) + countOf(b.item);
        pack()[a.w.index] = null;
        changed('pack');
        const text = say(`${b.item.count} ${baseFor(b.item).name.toLowerCase()} in one place now`);
        return { ok: true, text };
      }
      pack()[a.w.index] = b.item;
      pack()[b.w.index] = a.item;
      changed('pack');
      return { ok: true, text: '' };
    }

    if (a.w.kind === 'pack' && b.w.kind === 'equip') return equip(a.w.index, b.w.slot);
    if (a.w.kind === 'equip' && b.w.kind === 'pack') return unequip(a.w.slot, b.w.index);

    // slot to slot: only the two rings can trade places.
    if (RING_SLOTS.includes(a.w.slot) && RING_SLOTS.includes(b.w.slot)) {
      character.equipment[a.w.slot] = b.item;
      character.equipment[b.w.slot] = a.item;
      changed('equipment');
      const text = say('you swap the rings between hands');
      return { ok: true, text };
    }
    const text = say(`${labelOf(a.item)} does not go from your ${a.w.slot} to your ${b.w.slot}`, 'bad');
    sound('denied');
    return { ok: false, reason: text };
  }

  // ----------------------------------------------------------------- equip

  /** The slot this item wants: an empty ring hand first, else its one home. */
  function chooseSlot(item, hint) {
    const options = slotsFor(item);
    if (!options.length) return null;
    if (hint && options.includes(hint)) return hint;
    for (const s of options) if (!character.equipment[s]) return s;
    return options[0];
  }

  /**
   * Wear or hold something. Refusals name the number that stopped them; a
   * penalty is reported in the rules layer's own words. A two handed weapon
   * takes the offHand's occupant to the pack, and is refused outright if the
   * pack has no room for it, rather than dropping a shield on the floor.
   */
  function equip(where, slotHint = null) {
    const { w, item } = at(where);
    const loose = !w && where && typeof where === 'object' && baseFor(where) ? where : null;
    const it = loose || item;
    if (!it) { const text = say('there is nothing there to put on', 'bad'); return { ok: false, reason: text }; }

    const b = baseFor(it);
    const slot = chooseSlot(it, slotHint);
    if (!slot) {
      const text = say(`${b.name} is not something you equip`, 'bad');
      sound('denied');
      return { ok: false, reason: text };
    }
    if (slotHint && !slotsFor(it).includes(slotHint)) {
      const text = say(`${b.name} does not go on your ${slotHint}`, 'bad');
      sound('denied');
      return { ok: false, reason: text };
    }

    const wasOver = overweight();
    const verdict = canEquip(it, statsOf());
    if (!verdict.ok) {
      const text = say(verdict.reason, 'bad');
      sound('denied');
      return { ok: false, reason: text, penalty: verdict.penalty };
    }

    const two = twoHanded(it);
    const displaced = character.equipment[slot] || null;
    // The rule cuts both ways. A two hander drawn over a shield sends the
    // shield to the pack; a shield, tome, torch or lute raised while both hands
    // are on a greatsword sends the greatsword to the pack. Either way one
    // thing leaves and it is said. `offHand` below is whatever has to move.
    const mainTwo = slot === 'offHand' && character.equipment.mainHand && twoHanded(character.equipment.mainHand)
      ? character.equipment.mainHand : null;
    const offHand = two && slot === 'mainHand' ? (character.equipment.offHand || null) : mainTwo;

    // Count the homes before moving anything: the source slot frees up, and
    // everything displaced has to land somewhere.
    const fromPack = w && w.kind === 'pack';
    let free = 0;
    const items = pack();
    for (let i = 0; i < character.pack.slots; i++) if (!items[i]) free++;
    if (fromPack) free++;                       // the slot the item is leaving
    const needed = (displaced ? 1 : 0) + (offHand ? 1 : 0);
    if (needed > free) {
      const text = say(
        mainTwo
          ? `your ${baseFor(mainTwo).name.toLowerCase()} needs both hands and your pack is full, so it has nowhere to go`
          : offHand
            ? `${b.name} needs both hands and your pack is full, so your ${baseFor(offHand).name.toLowerCase()} has nowhere to go`
            : `your pack is full, so your ${baseFor(displaced).name.toLowerCase()} has nowhere to go`,
        'bad',
      );
      sound('denied');
      return { ok: false, reason: text };
    }

    if (w) put(w, null);
    character.equipment[slot] = it;
    if (mainTwo) character.equipment.mainHand = null;
    else if (offHand) character.equipment.offHand = null;
    const parked = [];
    for (const spare of [displaced, offHand]) {
      if (!spare) continue;
      const i = emptySlot();
      pack()[i] = spare;
      parked.push(spare);
    }
    changed('equipment');

    const words = [`you put on ${labelOf(it).toLowerCase()}`];
    if (mainTwo) words.push(`your ${baseFor(mainTwo).name.toLowerCase()} needs both hands, so it goes in the pack`);
    else if (offHand) words.push(`both hands are on it, so your ${baseFor(offHand).name.toLowerCase()} goes in the pack`);
    else if (displaced) words.push(`your ${baseFor(displaced).name.toLowerCase()} goes back in the pack`);
    const text = say(words.join(', '));
    if (verdict.reason) say(verdict.reason, 'bad');
    sound('pickup');
    const burden = burdenLine(wasOver);
    if (burden) say(burden, 'bad');
    return { ok: true, slot, displaced, parked, text, penalty: verdict.penalty, warning: verdict.reason, burden };
  }

  /** Take something off. It goes to the named pack slot, or the first free one. */
  function unequip(slot, index = null) {
    if (!SLOTS.includes(slot)) { const text = say(`there is no ${slot} slot`, 'bad'); return { ok: false, reason: text }; }
    const it = character.equipment[slot];
    if (!it) { const text = say(`you have nothing on your ${slot}`, 'bad'); return { ok: false, reason: text }; }
    let i = index;
    if (i == null || !isNum(i) || i < 0 || i >= character.pack.slots || pack()[i]) i = emptySlot();
    if (i < 0) {
      const text = say(`your pack is full, so ${labelOf(it).toLowerCase()} stays on`, 'bad');
      sound('denied');
      return { ok: false, reason: text };
    }
    character.equipment[slot] = null;
    pack()[i] = it;
    changed('equipment');
    const text = say(`you take off ${labelOf(it).toLowerCase()}`);
    return { ok: true, item: it, index: i, text };
  }

  // -------------------------------------------------------------- identify

  /**
   * Look closer. The affixes were always going to be these; INT decides how
   * many of the numbers you can read. The identified record replaces the one
   * in the pack, so the tooltip and the recompute see the same item.
   */
  function identify(where, opts = {}) {
    const { w, item } = at(where);
    if (!item) { const text = say('there is nothing there to look at', 'bad'); return { ok: false, reason: text }; }
    if (item.identified) {
      const text = say(`you already know everything about ${labelOf(item).toLowerCase()}`);
      return { ok: false, already: true, reason: text, item };
    }
    const int = isNum(opts.int) ? opts.int : intOf();
    const next = identifyItem(item, int, opts);
    put(w, next);
    changed(w.kind === 'pack' ? 'pack' : 'equipment');
    const list = ranked(next.affixes || []);
    const vague = (next.shown || []).filter((s) => s.exact == null).length;
    const words = list.length
      ? `it is ${nameFor(next).toLowerCase()}: ${list.map(lineFor).join(', ')}`
      : `it is ${nameFor(next).toLowerCase()}, and plain`;
    const text = say(vague ? `${words}. ${vague} of the numbers you cannot read at ${int} INT` : words);
    sound('discover');
    return { ok: true, item: next, lines: describe(next), vague, text };
  }

  // ------------------------------------------------------------------ sort

  /**
   * The quick sort button. Folds the stacks together, puts what is left in
   * order, and pushes it all to the front.
   *
   * It says what it did in one line, and the line carries the numbers rather
   * than a verb, because "sorted" is indistinguishable from a button that did
   * nothing to a pack that was already tidy.
   *
   * The Sort button itself lives in the inventory grid, which win_bag.js owns.
   * See docs/mmo/wiring/U4.md for the one line that wires it.
   */
  function sort() {
    const items = pack();
    const slots = character.pack.slots;
    const res = sortOrder(items.slice(0, slots));
    if (res.items.length > slots) {
      // Merging can only ever shrink the count, so this cannot happen. It is
      // checked anyway: the day it does, an item goes on the floor in silence.
      const text = say(`your pack will not hold ${res.items.length} stacks in ${slots} slots, so nothing is moved`, 'bad');
      return { ok: false, reason: text, merged: 0, moved: 0 };
    }
    for (let i = 0; i < slots; i++) items[i] = res.items[i] || null;
    changed('pack');

    const free = slots - res.items.length;
    if (!res.merged && !res.moved) {
      const text = say('your pack is already in order');
      return { ok: true, merged: 0, moved: 0, stacks: res.items.length, free, text };
    }
    const words = [];
    if (res.merged) words.push(`${res.merged} ${res.merged === 1 ? 'stack folds' : 'stacks fold'} into another`);
    if (res.moved) words.push(`${res.moved} ${res.moved === 1 ? 'thing finds' : 'things find'} a new place`);
    words.push(`${free} ${free === 1 ? 'slot is' : 'slots are'} open at the back`);
    const text = say(`your pack falls in: ${words.join(', ')}`);
    return { ok: true, merged: res.merged, moved: res.moved, stacks: res.items.length, free, text };
  }

  // -------------------------------------------------------------- sell/drop

  /**
   * Hand it over for coin. The price is the vendor's business, not this file's,
   * so without an `onSell` hook this refuses and says why rather than inventing
   * a number.
   */
  function sell(where, opts = {}) {
    const { item } = at(where);
    if (!item) { const text = say('there is nothing there to sell', 'bad'); return { ok: false, reason: text }; }
    const offer = typeof o.onSell === 'function' ? o.onSell(item, where, opts) : null;
    if (!offer || offer.ok === false || !isNum(offer.price)) {
      const text = say(offer && offer.reason ? offer.reason : 'nobody out here is buying', 'bad');
      sound('denied');
      return { ok: false, reason: text };
    }
    const r = remove(where, offer.count == null ? null : offer.count);
    if (!r.ok) return r;
    const price = Math.max(0, Math.round(offer.price));
    character.gold = (isNum(character.gold) ? character.gold : 0) + price;
    changed('gold');
    const text = say(`you sell ${amountOf(r.item)} for ${price} gold, and have ${character.gold}`);
    sound('sell');
    float(`+${price}`, 'gold');
    return { ok: true, item: r.item, price, text };
  }

  /** Put it on the ground. The world decides what a bag on the ground is. */
  function drop(where, n = null) {
    const { item } = at(where);
    if (!item) { const text = say('there is nothing there to drop', 'bad'); return { ok: false, reason: text }; }
    const r = remove(where, n);
    if (!r.ok) return r;
    if (typeof o.onDrop === 'function') { try { o.onDrop(r.item, where); } catch (e) { console.error('[inventory] onDrop threw', e); } }
    const text = say(`you drop ${amountOf(r.item)}`);
    return { ok: true, item: r.item, text };
  }

  // ------------------------------------------------------------------ view

  /** Everything a panel needs to draw the tooltip, without reaching past us. */
  const tooltip = (item) => (item ? describe(item) : []);

  return {
    character,
    get pack() { return character.pack; },
    get equipment() { return character.equipment; },
    slots: SLOTS,
    add, remove, move, equip, unequip, identify, sell, drop, sort,
    at, emptySlot, chooseSlot,
    weight, carry, overweight,
    tooltip, labelOf, amountOf, colourOf,
    canEquip: (item) => canEquip(item, statsOf()),
    equipSlotFor,
    /** The last line said, for tests and for anything replaying feedback. */
    get lastSaid() { return lastSaid; },
    say,
  };
}
