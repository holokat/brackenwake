// What a piece of gear would do to you, before you put it on.
//
// Pure, and node runnable. No DOM, no THREE. `previewEquip` builds a deep
// enough copy of the character, puts the item on THROUGH inventory.js's own
// equip, runs actor.js's own recompute over a copy of the actor, and hands
// back the numbers before, the numbers after, and the difference.
//
// Three rules this file keeps:
//
// 1. The preview is the real path. It does not reimplement which slot a ring
//    goes in, what a two handed weapon does to a shield, or how a plate chest
//    is halved by a STR it cannot meet. It calls `createInventory().equip`
//    and `recompute`, which are the same two functions the game calls when
//    you actually put the thing on. A preview that used its own arithmetic
//    would eventually disagree with the game and lie to the player.
//
// 2. It never touches the live document. Everything is done on a clone, and
//    compare.test.mjs byte compares the character and the actor before and
//    after a preview to prove it.
//
// 3. One reader for one number. `readNumbers` is the only place in the
//    interface that turns an actor into the twenty one numbers the sheet
//    prints, so the plain sheet and the previewed sheet cannot drift.
//
// Known divergence, recorded rather than hidden: actor.js's `recompute` sums
// resistances from AFFIXES only and never adds the innate `resist` block an
// armour tier carries in items.js, while inventory.js's `resistsOfCharacter`
// adds both. The fight reads the actor, so the actor is what is shown when
// there is one. That gap belongs to actor.js and is not papered over here.

import { SLOTS, baseFor, slotsFor, twoHanded, canEquip } from '../mmo/items.js';
import { derived, STATS } from '../mmo/stats.js';
import {
  attackSkill, defenceSkill, dodgeChance, parryChance, critChance, CRIT_BASE_MULT,
} from '../mmo/combat_rules.js';
import { recompute, playerActor } from './actor.js';
import {
  createInventory, normalise, PACK_SLOTS, RESIST_TYPES,
  armourOfCharacter, resistsOfCharacter, carryOfCharacter, itemTipLines, colourOf, labelOf,
} from './inventory.js';

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const num = (v, fallback = 0) => (isNum(v) ? v : fallback);

/** The word for each of the five resists, in the order the sheet prints them. */
export const RESIST_ID = Object.fromEntries(
  RESIST_TYPES.map((t) => [t, `resist_${t}`]),
);

/**
 * Every number the sheet shows and the preview can move, in one list.
 *
 *   kind   how it is rounded and written: a whole number, a percentage, or a
 *          multiplier. The rounding happens BEFORE the difference is taken, so
 *          the (+n) a player reads is the difference between the two numbers
 *          in front of them and never a hidden fraction.
 *   group  which block of the sheet it belongs to.
 *
 * Higher is better for all twenty one, which is why `better` is simply
 * `delta > 0`. If a number is ever added where lower is better, it needs a
 * `lowerIsBetter` flag and this comment stops being true.
 */
export const SHOWN = [
  { id: 'str', label: 'STR', group: 'stats', kind: 'int' },
  { id: 'dex', label: 'DEX', group: 'stats', kind: 'int' },
  { id: 'int', label: 'INT', group: 'stats', kind: 'int' },
  { id: 'con', label: 'CON', group: 'stats', kind: 'int' },
  { id: 'wis', label: 'WIS', group: 'stats', kind: 'int' },

  { id: 'maxHealth', label: 'health', group: 'pools', kind: 'int' },
  { id: 'maxMana', label: 'mana', group: 'pools', kind: 'int' },
  { id: 'maxStamina', label: 'stamina', group: 'pools', kind: 'int' },

  { id: 'armour', label: 'armour', group: 'combat', kind: 'int' },
  { id: 'attack', label: 'attack', group: 'combat', kind: 'int' },
  { id: 'defence', label: 'defence', group: 'combat', kind: 'int' },
  { id: 'dodge', label: 'dodge', group: 'combat', kind: 'pct' },
  { id: 'parry', label: 'parry', group: 'combat', kind: 'pct' },
  { id: 'critChance', label: 'critical chance', group: 'combat', kind: 'pct' },
  { id: 'critDamage', label: 'critical damage', group: 'combat', kind: 'mult' },

  ...RESIST_TYPES.map((t) => ({ id: RESIST_ID[t], label: `${t} resist`, group: 'resists', kind: 'int', suffix: '%', resist: t })),

  { id: 'carry', label: 'carry', group: 'load', kind: 'int' },
];

export const SHOWN_BY_ID = Object.fromEntries(SHOWN.map((s) => [s.id, s]));
export const SHOWN_IDS = SHOWN.map((s) => s.id);

/** Round a raw number to the precision the sheet prints it at. */
export function roundFor(kind, v) {
  const x = num(v);
  if (kind === 'pct') return Math.round(x * 1000) / 10;
  if (kind === 'mult') return Math.round(x * 100) / 100;
  return Math.round(x);
}

/** The string a row shows for one of the twenty one. */
export function formatValue(id, v) {
  const s = SHOWN_BY_ID[id];
  if (!s) return String(v);
  if (s.kind === 'pct') return `${v}%`;
  if (s.kind === 'mult') return `${v}x`;
  return `${v}${s.suffix || ''}`;
}

/** "(+2)", "(-1.5%)", "(+0.4x)". Never called with a zero. */
export function deltaText(id, delta) {
  const s = SHOWN_BY_ID[id];
  const sign = delta > 0 ? '+' : '-';
  const mag = Math.abs(Math.round(delta * 100) / 100);
  if (!s) return `(${sign}${mag})`;
  if (s.kind === 'pct') return `(${sign}${mag}%)`;
  if (s.kind === 'mult') return `(${sign}${mag}x)`;
  return `(${sign}${mag}${s.suffix || ''})`;
}

/**
 * The twenty one numbers, read off a fighter.
 *
 * The actor wins wherever it carries the field, because the actor is the
 * record the fight reads; the document is the fallback for a sheet drawn
 * before actor.js has ever run, and for the hand built fighters the tests use.
 */
export function readNumbers(f, character) {
  const stats = (f && f.stats) || (character && character.stats) || {};
  const skills = (f && f.skills) || (character && character.skills) || {};
  const d = derived(stats, skills);
  const resists = (f && f.resists && typeof f.resists === 'object')
    ? f.resists
    : resistsOfCharacter(character);
  const out = {};
  for (const k of STATS) out[k] = Math.round(num(stats[k]));
  // The three pools are FLOORED, not rounded, because that is how the sheet
  // and the HUD have always printed them: 192.5 health is "192" in front of
  // the player, and a delta taken from a number nobody can see is a lie.
  out.maxHealth = Math.floor(num(f && f.maxHealth, d.maxHealth));
  out.maxMana = Math.floor(num(f && f.maxMana, d.maxMana));
  out.maxStamina = Math.floor(num(f && f.maxStamina, d.maxStamina));
  out.armour = Math.round(isNum(f && f.ar) ? f.ar : armourOfCharacter(character));
  out.attack = roundFor('int', attackSkill(f || {}));
  out.defence = roundFor('int', defenceSkill(f || {}));
  out.dodge = roundFor('pct', dodgeChance(f || {}));
  out.parry = roundFor('pct', parryChance(f || {}));
  out.critChance = roundFor('pct', critChance(f || {}));
  out.critDamage = roundFor('mult', CRIT_BASE_MULT + num(f && f.bonuses && f.bonuses.critDamage));
  for (const t of RESIST_TYPES) out[RESIST_ID[t]] = Math.round(num(resists[t]));
  out.carry = Math.round(isNum(f && f.carry) ? f.carry : carryOfCharacter(character));
  return out;
}

/**
 * A copy of the document deep enough that equipping into it cannot reach the
 * original. The item RECORDS are shared by reference on purpose: nothing in
 * the equip path writes to an item, and cloning them would make the byte
 * comparison in the test pass for the wrong reason.
 */
export function cloneCharacter(character) {
  const c = character || {};
  const pack = c.pack || {};
  return normalise({
    ...c,
    stats: { ...(c.stats || {}) },
    skills: { ...(c.skills || {}) },
    equipment: { ...(c.equipment || {}) },
    pack: { ...pack, slots: isNum(pack.slots) ? pack.slots : PACK_SLOTS, items: [...(pack.items || [])] },
  });
}

/**
 * The fighter the sheet reads. The live actor when there is one, so the sheet
 * and the fight are one record; otherwise actor.js builds a real one out of a
 * copy of the document, which fills in stamina, the weapon in hand and the
 * affix sums exactly as the game would.
 */
export function actorFor(character, actor) {
  if (actor && actor.stats) return actor;
  try { return playerActor(cloneCharacter(character)); } catch { return null; }
}

/** A copy of a fighter wearing a different character's equipment, recomputed. */
export function previewActor(base, character) {
  const a = {
    ...(base || {}),
    kind: (base && base.kind) || 'player',
    character,
    baseStats: character.stats,
    baseSkills: character.skills,
    equipment: character.equipment,
    stats: { ...((base && base.stats) || character.stats || {}) },
    skills: { ...((base && base.skills) || character.skills || {}) },
    buffs: Array.isArray(base && base.buffs) ? [...base.buffs] : [],
  };
  return recompute(a);
}

/** Where this exact record is right now: a slot, a pack index, or nowhere. */
export function locate(character, item) {
  if (!character || !item) return null;
  const eq = character.equipment || {};
  for (const s of SLOTS) if (eq[s] === item) return { kind: 'equip', slot: s };
  const items = (character.pack && character.pack.items) || [];
  for (let i = 0; i < items.length; i++) if (items[i] === item) return { kind: 'pack', index: i };
  return null;
}

/**
 * The slot this item would take, decided by inventory.js's own `chooseSlot`
 * over a copy of the document, so an empty ring hand is found the same way
 * here as it is when you really equip.
 */
export function slotFor(character, item, hint = null) {
  if (!slotsFor(item).length) return null;
  const inv = createInventory({ character: cloneCharacter(character) });
  return inv.chooseSlot(item, hint);
}

/**
 * What is worn in the slot or slots this item would take. A two handed weapon
 * answers with the main hand AND the off hand, because putting it on takes the
 * shield off; a ring answers with the empty hand when there is one.
 *
 * `items` has one entry per slot and holds null where nothing is worn.
 */
export function equippedFor(character, item, hint = null) {
  const eq = (character && character.equipment) || {};
  const slot = slotFor(character, item, hint);
  if (!slot) return { slot: null, slots: [], items: [], twoHanded: false };
  const slots = [slot];
  if (twoHanded(item) && slot === 'mainHand' && eq.offHand) slots.push('offHand');
  return {
    slot,
    slots,
    items: slots.map((s) => eq[s] || null),
    twoHanded: twoHanded(item),
  };
}

/** Every id at zero, for the cases where nothing at all would change. */
function noDeltas(before) {
  const out = {};
  for (const id of SHOWN_IDS) {
    out[id] = { id, before: before[id], after: before[id], delta: 0, better: false, changed: false };
  }
  return out;
}

/**
 * Put `item` on, in a copy of the world, and report what moved.
 *
 * @returns {{
 *   before: object, after: object, deltas: object, changed: string[],
 *   ok: boolean, reason: string, slot: string|null, displaced: object[],
 *   worn: boolean, verdict: object
 * }}
 */
export function previewEquip(character, actor, item, slot = null) {
  const live = actorFor(character, actor);
  const before = readNumbers(live, character);
  const base = baseFor(item);
  const blank = (reason) => ({
    before, after: { ...before }, deltas: noDeltas(before), changed: [],
    ok: false, reason, slot: null, displaced: [], worn: false,
    verdict: { ok: false, reason, penalty: { arMul: 1, swingMul: 1 } },
  });
  if (!base) return blank('there is no such thing');
  if (!base.slot) return blank(`${base.name} is not something you equip`);

  const verdict = canEquip(item, (character && character.stats) || {});
  const where = locate(character, item);

  // Already on. Nothing moves, and saying so is not the same as refusing.
  if (where && where.kind === 'equip') {
    return {
      before, after: { ...before }, deltas: noDeltas(before), changed: [],
      ok: true, reason: '', slot: where.slot, displaced: [], worn: true, verdict,
    };
  }

  const clone = cloneCharacter(character);
  const inv = createInventory({ character: clone });
  const res = where && where.kind === 'pack'
    ? inv.equip(where.index, slot)
    : inv.equip(item, slot);

  if (!res || !res.ok) {
    const out = blank(res && res.reason ? res.reason : 'it will not go on');
    out.verdict = verdict;
    return out;
  }

  const after = readNumbers(previewActor(live, clone), clone);
  const deltas = {};
  const changed = [];
  for (const s of SHOWN) {
    const b = before[s.id];
    const a = after[s.id];
    const delta = Math.round((a - b) * 100) / 100;
    deltas[s.id] = { id: s.id, before: b, after: a, delta, better: delta > 0, changed: delta !== 0 };
    if (delta !== 0) changed.push(s.id);
  }
  const displaced = [res.displaced, ...(res.parked || [])].filter(Boolean);
  return {
    before, after, deltas, changed,
    ok: true, reason: verdict.reason || '', slot: res.slot,
    displaced: [...new Set(displaced)], worn: false, verdict,
  };
}

/**
 * The second tooltip card: what you are wearing where this would go.
 *
 * One block per slot the item would take, so a greatsword shows the sword in
 * your hand AND the shield it would take off your arm. A slot with nothing in
 * it says so rather than being left out, because an empty block is the answer
 * to "what would I lose".
 */
export function equippedCard(character, item, hint = null) {
  const found = equippedFor(character, item, hint);
  if (!found.slot) return null;
  const blocks = found.slots.map((s, i) => {
    const worn = found.items[i];
    return {
      slot: s,
      item: worn,
      name: worn ? labelOf(worn) : 'nothing worn there',
      colour: worn ? colourOf(worn) : null,
      base: worn ? baseFor(worn) : null,
      lines: worn ? itemTipLines(worn) : [],
      empty: !worn,
    };
  });
  return { head: 'Equipped', slot: found.slot, twoHanded: found.twoHanded, blocks };
}

/**
 * Every id in SHOWN is a number `readNumbers` actually produces, and every
 * number it produces is in SHOWN. Runs at import: a twenty second number added
 * to one and not the other fails here rather than being a row that never
 * lights up.
 */
export function auditShown() {
  const seen = new Set();
  for (const s of SHOWN) {
    if (seen.has(s.id)) throw new Error(`compare: "${s.id}" is shown twice`);
    seen.add(s.id);
    if (!s.label) throw new Error(`compare: "${s.id}" has no label`);
    if (!['int', 'pct', 'mult'].includes(s.kind)) throw new Error(`compare: "${s.id}" has no rounding`);
  }
  const nums = readNumbers(null, { stats: {}, skills: {}, equipment: {}, pack: { slots: 1, items: [] } });
  for (const s of SHOWN) {
    if (!isNum(nums[s.id])) throw new Error(`compare: "${s.id}" is shown and readNumbers does not produce it`);
  }
  for (const k of Object.keys(nums)) {
    if (!SHOWN_BY_ID[k]) throw new Error(`compare: readNumbers produces "${k}" and nothing shows it`);
  }
  return SHOWN.length;
}

auditShown();

export default { previewEquip, equippedFor, equippedCard, readNumbers, SHOWN };
