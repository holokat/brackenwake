// Which tool a piece of work uses, worked out from what you are carrying.
//
// THE TOOL IS NEVER CHOSEN ANY MORE
//
// There used to be a row of four cells at the bottom of the screen, HAND, AXE,
// PICKAXE, BOW, and a click on one of them wrote `state.tool`. Everything that
// wanted to know what was in your hand read that word. So an axe in the pack
// was useless until you had also pressed the cell, and clicking a tree while
// the pickaxe cell was lit answered "a pickaxe is no use on an oak" at a player
// who was carrying an axe the whole time.
//
// The row is gone. Melee, ranged and casting were already decided by
// `character.equipment` through `weaponCheck` in src/mmo/abilities.js, and
// gathering is decided here, by the same kind of rule:
//
//   1. the item bar's SELECTED slot, when what is on it can do this work;
//   2. what is equipped, main hand, off hand, then the rest of the doll;
//   3. what is in the pack;
//   4. dev mode, which carries one of everything;
//   5. bare hands, for the work that wants no tool.
//
// and when none of those answers, a refusal that NAMES THE TOOL IT WANTS.
//
// One function, `toolFor(kind, character, opts)`, is the whole rule. Chopping,
// mining, skinning and foraging all come through it, so the axe and the pickaxe
// cannot drift apart the way the farm's five biomes did. It is pure: no DOM, no
// THREE, no state, no clock. `src/game/tools.test.mjs` drives every kind in
// both directions.
//
// WHAT "SELECTED" MEANS
//
// `character.itemBarSlot` is the index of the item bar slot the player last
// pressed that held a TOOL, or null. `src/game/item_bar.js` writes it and says
// so on the log line; nothing else writes it. Two skinning knives on the bar
// are one selection, because a slot remembers a base and not a pack index.
//
// A slot holding a potion is drunk on press and selects nothing: a potion never
// decides how a tree comes down, so a selection there would be a light on the
// HUD that means nothing.

import { BASES, SLOTS } from '../mmo/items.js';

/** The doll slots asked first, in the order a hand reaches. Then the others. */
const HAND_FIRST = ['mainHand', 'offHand'];

const capitalise = (s) => String(s || '').replace(/^./, (c) => c.toUpperCase());
/** "an oak", "a boulder". */
export const anA = (noun) => `${/^[aeiou]/i.test(noun) ? 'an' : 'a'} ${noun}`;

/**
 * The work a tool is asked for, and what answers it.
 *
 * `need` is item bases in preference order, and every one of them is checked
 * against items.js by `auditTools` at load, so a rename there fails here rather
 * than in a forest.
 *
 * `bare` is work your hands can do. Foraging is picking a plant, and a swing at
 * an animal with nothing in your hands is still a swing, so neither can refuse.
 */
export const GATHER = {
  chop: {
    id: 'chop',
    need: ['axe'],
    want: 'an axe',
    noun: 'tree',
    bare: false,
    refuse: (noun) => `${capitalise(anA(noun))} wants an axe, and there is none in your pack.`,
  },
  mine: {
    id: 'mine',
    need: ['pickaxe'],
    want: 'a pickaxe',
    noun: 'seam',
    bare: false,
    refuse: (noun) => `${capitalise(anA(noun))} wants a pickaxe, and there is none in your pack.`,
  },
  skin: {
    id: 'skin',
    need: ['skinning_knife', 'dagger'],
    want: 'a skinning knife or a dagger',
    noun: 'body',
    bare: false,
    // the words skinning.js already said, kept: a player who has read them once
    // should not have to learn a second sentence for the same refusal
    refuse: (noun) => `You need a dagger in hand or a skinning knife in your pack to skin the ${noun}.`,
  },
  forage: {
    id: 'forage',
    need: [],
    want: 'nothing but your hands',
    noun: 'plant',
    bare: true,
    refuse: (noun) => `There is no way to pick ${anA(noun)} at all.`,
  },
  // The farmstead's hunting swing. `src/game/combat.js` weights it by the word
  // this returns, and takes 'hand' when there is none. That path is UNREACHED
  // today (F1: an animal is a tier 0 monster and is clicked through
  // `app/systems/input.js`), and it is here rather than left reading a deleted
  // `state.tool`, so the day it is reached it reaches the same rule as the rest.
  swing: {
    id: 'swing',
    need: ['axe', 'pickaxe'],
    want: 'an axe or a pickaxe',
    noun: 'animal',
    bare: true,
    refuse: (noun) => `There is nothing to swing at ${anA(noun)} with.`,
  },
};

export const GATHER_KINDS = Object.keys(GATHER);

/** The word for a base, as a player would say it. */
export const nameOf = (id) => String(BASES[id]?.name || id || '').toLowerCase();

/**
 * What the work is called, for the line that says a tool was chosen.
 *
 * `swing` is deliberately not in here. Weighting the farmstead's hunting swing
 * is a real use of the axe in `combat.js`, and it is also UNREACHED (see the
 * `swing` row below), so a line promising a player that choosing the pickaxe
 * changed how they fight would be promising something they cannot see.
 */
export const WORK_WORD = {
  chop: 'chopping', mine: 'mining', skin: 'skinning', forage: 'foraging',
};

/**
 * Every kind of work a base can do, in table order.
 *
 * A base that does none is not a thing to choose. `item_bar.js` refuses to
 * select a lockpick with those words: the lock takes one out of the pack the
 * moment you click a box, and a chosen lockpick would be a light on the HUD
 * that decides nothing.
 */
export const worksFor = (base) => GATHER_KINDS.filter((k) => GATHER[k].need.includes(base));

/** "chopping", "mining and skinning". Never a list with an empty end. */
export function workWords(base) {
  const words = worksFor(base).map((k) => WORK_WORD[k]).filter(Boolean);
  if (!words.length) return '';
  if (words.length === 1) return words[0];
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

/**
 * Every base every kind of work asks for is a real base, every kind has words
 * for its refusal, and no kind that can refuse is also `bare`. Runs at load, so
 * a rename in items.js is a red test rather than a silent "there is none in
 * your pack" over a full pack.
 */
export function auditTools() {
  const bad = [];
  for (const [kind, row] of Object.entries(GATHER)) {
    if (row.id !== kind) bad.push(`${kind} calls itself ${row.id}`);
    if (typeof row.refuse !== 'function') bad.push(`${kind} has no words to refuse with`);
    if (!row.bare && !row.need.length) bad.push(`${kind} needs a tool and names none`);
    for (const id of row.need) {
      if (!BASES[id]) bad.push(`${kind} wants "${id}", which items.js has no base for`);
    }
  }
  if (bad.length) throw new Error(`tools: ${bad.join('; ')}`);
  return { kinds: GATHER_KINDS.length, bases: new Set(Object.values(GATHER).flatMap((r) => r.need)).size };
}
auditTools();

/** The item bar as this file reads it: a sparse list of `{ base }`, or empty. */
const barOf = (character) => (Array.isArray(character?.itemBar) ? character.itemBar : []);

/**
 * The base id on the item bar's selected slot, or null. A selection that points
 * at a slot which has since been cleared is not a selection.
 */
export function selectedBaseOf(character) {
  const slot = character?.itemBarSlot;
  if (!Number.isInteger(slot) || slot < 0) return null;
  const entry = barOf(character)[slot];
  return entry && entry.base ? String(entry.base) : null;
}

/** Every doll slot, hands first. */
const dollOrder = () => [...HAND_FIRST, ...SLOTS.filter((s) => !HAND_FIRST.includes(s))];

/** Where this base is worn, or null. */
function wornAt(character, base) {
  const eq = character?.equipment || {};
  for (const s of dollOrder()) if (eq[s] && (eq[s].base || eq[s].id) === base) return s;
  return null;
}

/** Whether this base is in the pack. */
function inPack(character, base) {
  const items = character?.pack?.items || character?.pack || [];
  if (!Array.isArray(items)) return false;
  return items.some((it) => it && (it.base || it.id) === base);
}

/**
 * Everywhere this base is carried, in the order the rule prefers. Exported
 * because the bag window and the dev bench both want to say WHERE a tool is,
 * and neither should work it out a second time.
 *
 * @returns {'bar'|string|'pack'|null} 'bar' when it is the selected slot, else
 *   the doll slot it is worn in, else 'pack', else null.
 */
export function carriedAt(character, base) {
  if (!base) return null;
  if (selectedBaseOf(character) === base) return 'bar';
  const worn = wornAt(character, base);
  if (worn) return worn;
  return inPack(character, base) ? 'pack' : null;
}

/**
 * WHAT DOES THIS WORK.
 *
 * @param {string} kind   'chop' | 'mine' | 'skin' | 'forage' | 'swing'
 * @param {object} character  the v2 document: itemBar, itemBarSlot, equipment, pack
 * @param {object} [opts]
 * @param {boolean} [opts.dev]   dev mode: every tool is carried
 * @param {string}  [opts.noun]  what is being worked on, for the refusal
 * @returns {{
 *   kind: string, ok: boolean, id: string|null, name: string,
 *   where: string|null, need: string[], want: string, reason: string
 * }}
 *   `id` is the item base that does the work, or null for bare hands.
 *   `where` is 'bar', a doll slot, 'pack', 'dev', 'hands', or null on a refusal.
 *   `reason` is '' when it can be done and the words to say when it cannot.
 */
export function toolFor(kind, character, opts = {}) {
  const row = GATHER[kind];
  if (!row) {
    return {
      kind: String(kind), ok: false, id: null, name: '', where: null,
      need: [], want: '', reason: `nothing in this game knows how to ${kind}`,
    };
  }
  const noun = String(opts.noun || row.noun);
  const answer = (id, where) => ({
    kind: row.id, ok: true, id, name: id ? nameOf(id) : 'your hands',
    where, need: [...row.need], want: row.want, reason: '',
  });

  // 1. the selected slot on the item bar, when it can do this work
  const chosen = selectedBaseOf(character);
  if (chosen && row.need.includes(chosen)) return answer(chosen, 'bar');

  // 2. and 3. worn, then carried, in the order the work prefers its tools
  for (const id of row.need) {
    const worn = wornAt(character, id);
    if (worn) return answer(id, worn);
  }
  for (const id of row.need) {
    if (inPack(character, id)) return answer(id, 'pack');
  }

  // 4. dev mode carries one of everything
  if (opts.dev && row.need.length) return answer(row.need[0], 'dev');

  // 5. hands, for the work that wants none
  if (row.bare) return answer(null, 'hands');

  return {
    kind: row.id, ok: false, id: null, name: '', where: null,
    need: [...row.need], want: row.want, reason: row.refuse(noun),
  };
}

/**
 * The word `src/game/combat.js` weights a swing by: 'axe', 'pickaxe' or 'hand'.
 * One place, so the legacy weapon table cannot be handed a base id it has never
 * heard of and quietly weigh it as a pair of hands.
 */
export function swingWordFor(character, opts = {}) {
  const t = toolFor('swing', character, opts);
  return t.id || 'hand';
}

export default toolFor;
