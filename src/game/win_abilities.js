// Abilities: the book of everything the game can teach, and the twelve slots
// you fight from. Key P.
//
// It was A, which is also strafe left, so walking left flapped this window
// open and shut. windows.js now refuses every key the world drives, and P is
// what this page answers to.
//
// WHAT CHANGED IN U4
//
// It used to list only what you had already bought, in two flat columns of
// thirteen point text, which meant a player could not see that the game HAS a
// Fireball until the day Magery reached 30. A ladder you cannot see is not a
// ladder. So: all seventy eight rows are here, always, grouped by archetype,
// as cards with art. What you have is bright and can be dragged to the bar.
// What you have not is dimmed, wears a lock, and says the one sentence that
// would change that, with your own number in it, live, and with the clause you
// are actually short of painted in the theme's red (SK2):
//
//     Needs Swordsmanship 50, you are at 33.4
//
// The art is drawn here, in code, the same way ui_theme.js draws the item
// glyphs: one mark per effect kind (a blade for a swing, a bolt for a spell
// roll, a heart for a heal, a shield for an absorb, chains for a control), and
// the mark takes the archetype's colour. `auditArt()` runs at import and
import { abilityIcon, iconImg } from './icon_art.js';
// throws if any row in the table falls through to no drawing, which is the
// guard against the class of bug where the fifth thing added quietly shows an
// empty square.
//
// hud.js draws the bar the player fights from (W4). This window writes
// `character.bar[slot]` and calls `ctx.onBarChange?.()` so that bar redraws.
// It used to draw a strip of the same twelve slots of its own to drop on; the
// user found it in the way ("I would prefer that I can drag abilities
// directly to MY action bar in the game hud", 2026-09-08), so the strip is
// gone. A card is dragged onto the real bar, which hud.js accepts through
// `onAbilityDrop`, or clicked and then a real bar cell, which reaches this
// page through `barHand`. The codex frame stops short of the bar so the bar
// stays in reach under an open page.
//
// The drag payload is `{ ability: id }` under the same mime the pack uses, so
// the real bar accepts exactly what a card hands over. Only an UNLOCKED,
// non passive card is a drag source: a locked card that could be dropped onto
// the bar would put a key under an ability the runtime then refuses, which is
// the stranded unlock this project's CLAUDE.md was written about.

import {
  ABILITIES, ABILITIES_BY_ID, GROUPS, EFFECT_KINDS, KNOWN_SKILLS, STAT_IDS,
  STAT_LABELS, unlockedFor, meetsRequirements, costKind,
  manaCostFor, weaponNeeds, weaponCheck,
  requirementClauses, clauseText, skillNumber as skillNumberOf,
  isPractice, practiceText,
} from '../mmo/abilities.js';
import { dragSource, dropTarget, attachTip, hideTip } from './windows.js';
import { theme } from './ui_theme.js';

/** 06-ECONOMY-UI.md: twelve slots, keys 1 to 0 and minus and equals. */
export const BAR_SLOTS = 12;
export const BAR_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '='];

/**
 * Two bar slots change places, or one ability moves to an empty slot. The
 * HUD's own cells are drag sources now (the user, 2026-09-08: "i should be
 * able to drag abilities around, and if i drag it onto another, they swap").
 * Same words as setBarSlot: what moved, where, and what it displaced.
 */
export function swapBarSlots(character, from, to) {
  const bar = barOf(character);
  const bad = (n) => !Number.isInteger(n) || n < 0 || n >= BAR_SLOTS;
  if (bad(from) || bad(to)) return { ok: false, reason: `the bar has ${BAR_SLOTS} slots and that is not one of them` };
  if (from === to) return { ok: false, reason: 'that is the slot it is already in' };
  const a = bar[from], b = bar[to];
  if (!a) return { ok: false, reason: `slot ${from + 1} is empty, there is nothing to move` };
  bar[to] = a; bar[from] = b;
  const nameOf = (id) => ABILITIES_BY_ID[id]?.name || id;
  const reason = b
    ? `${nameOf(a)} and ${nameOf(b)} swap places: ${nameOf(a)} on slot ${to + 1}, key ${keyFor(character, to)}, ${nameOf(b)} on slot ${from + 1}, key ${keyFor(character, from)}`
    : `${nameOf(a)} moves to slot ${to + 1}, key ${keyFor(character, to)}`;
  return { ok: true, from, to, swapped: !!b, reason };
}

/**
 * The card in hand. Clicking an unlocked card on the page picks it up; the
 * next click on a real bar cell puts it there. hud.js knows nothing of this
 * page, so the abilities system reads `barHand.id` on a bar click and calls
 * `place(slot)`, which writes the bar, says what happened, and empties the
 * hand. Closing the page drops whatever was held.
 */
let held = null;   // `hand` is a card's own element inside build(); this is the page's
export const barHand = {
  get id() { return held ? held.id : null; },
  place(slot) { if (!held) return null; const h = held; held = null; return h.place(slot); },
  drop() { held = null; },
};

if (BAR_KEYS.length !== BAR_SLOTS) {
  throw new Error(`win_abilities: ${BAR_KEYS.length} keys for ${BAR_SLOTS} slots`);
}

/**
 * The key under a slot. The settings window can rebind the twelve, so the
 * label is read off the document when it has been, and falls back to the
 * default row when it has not.
 */
export function keyFor(character, slot) {
  const bound = character && character.settings && Array.isArray(character.settings.bar) ? character.settings.bar[slot] : null;
  const k = bound || BAR_KEYS[slot];
  return k === '-' ? 'minus' : k === '=' ? 'equals' : String(k);
}

/** Fill in the bar the document may not have yet, in place. */
export function barOf(character) {
  if (!Array.isArray(character.bar)) character.bar = [];
  character.bar.length = BAR_SLOTS;
  for (let i = 0; i < BAR_SLOTS; i++) if (character.bar[i] === undefined) character.bar[i] = null;
  return character.bar;
}

/**
 * Put an ability on the bar, or take one off with `null`. Returns what
 * happened and why, in words, because a slot that silently refuses a passive
 * is indistinguishable from a broken drag.
 */
export function setBarSlot(character, slot, abilityId) {
  const bar = barOf(character);
  if (!Number.isInteger(slot) || slot < 0 || slot >= BAR_SLOTS) {
    return { ok: false, reason: `the bar has ${BAR_SLOTS} slots and that is not one of them` };
  }
  if (abilityId == null) {
    const had = bar[slot];
    if (!had) return { ok: false, reason: 'that slot is already empty' };
    bar[slot] = null;
    return { ok: true, slot, removed: had, reason: `${ABILITIES_BY_ID[had]?.name || had} comes off the bar` };
  }
  const ability = ABILITIES_BY_ID[abilityId];
  if (!ability) return { ok: false, reason: `there is no ability called ${abilityId}` };
  if (ability.passive) {
    return { ok: false, reason: `${ability.name} is passive and works on its own; it does not go on the bar` };
  }
  // The same ability twice on the bar is two cooldowns showing one truth.
  const already = bar.indexOf(abilityId);
  if (already >= 0 && already !== slot) bar[already] = null;
  const displaced = bar[slot] && bar[slot] !== abilityId ? bar[slot] : null;
  bar[slot] = abilityId;
  const words = [`${ability.name} goes on slot ${slot + 1}, key ${keyFor(character, slot)}`];
  if (displaced) words.push(`${ABILITIES_BY_ID[displaced]?.name || displaced} comes off`);
  if (already >= 0 && already !== slot) words.push(`and leaves slot ${already + 1}`);
  return { ok: true, slot, displaced, moved: already >= 0 && already !== slot, reason: words.join(', ') };
}

/** The lines the tooltip shows for an ability. */
export function abilityLines(ability, character) {
  if (!ability) return [];
  const lines = [ability.name, `${ability.group}, ${ability.passive ? 'passive' : ability.target}`];
  const kind = costKind(ability);
  if (kind === 'mana') lines.push(`${manaCostFor(ability, character || {})} mana`);
  else if (kind === 'stamina') lines.push(`${ability.cost.stamina} stamina`);
  else if (kind === 'item') lines.push(`costs ${Object.values(ability.cost)[0]}`);
  else if (!ability.passive) lines.push('costs nothing');
  if (ability.cooldown) lines.push(`${ability.cooldown} s cooldown`);
  if (ability.castTime) lines.push(`${ability.castTime} s cast${ability.moving ? ', on the move' : ', and it roots you'}`);
  if (ability.range) lines.push(`${ability.range} m`);
  lines.push(ability.description);
  return lines;
}

// ---------------------------------------------------------------------------
// The archetypes
// ---------------------------------------------------------------------------

/** The word on the heading, and on the filter chip. abilities.js has ids. */
export const GROUP_LABEL = {
  warrior: 'Warrior', ranger: 'Ranger', mage: 'Mage', sorcerer: 'Sorcerer',
  necromancer: 'Necromancer', healer: 'Healer', rogue: 'Rogue', bard: 'Bard',
  everyone: 'Everyone',
};

/**
 * The colour the card's mark is drawn in. Nine, one per archetype, chosen to
 * read on dark stone next to the gold. These are presentation values and no
 * other file reads them.
 */
export const GROUP_COLOUR = {
  warrior: '#e08a5a', ranger: '#8fc46a', mage: '#6fa8f0', sorcerer: '#b98ef0',
  necromancer: '#7fc79a', healer: '#f2dc9c', rogue: '#9fb0c0', bard: '#f09ab8',
  everyone: '#cbb894',
};

/** The five resists plus holy, as a wash behind the mark. */
export const DAMAGE_TINT = {
  physical: '#c9c2b4', fire: '#ff8a4a', cold: '#7fd8f0',
  poison: '#8fd06a', energy: '#c9a0ff', holy: '#ffe6a0',
};

// ---------------------------------------------------------------------------
// The art
// ---------------------------------------------------------------------------
// One filled drawing per effect kind, on the same 24 x 24 field ui_theme.js
// uses for its item glyphs, so the two languages match. `combo` is not here:
// a combo is drawn as whichever of its parts ART_ORDER names first.

export const ART = {
  blade: '<path d="M19 2 l3 1 -1 3 -8 8 -3 -3 z M10 12 l2 2 -6 6 -3 1 1 -3 z M3 19 l2 2"/>',
  enchant: '<path d="M18 2 l4 1 -1 4 -9 9 -4 -4 z M9 13 l2 2 -7 7 -3 1 1 -3 z M20 12 l1 3 3 1 -3 1 -1 3 -1 -3 -3 -1 3 -1 z"/>',
  burst: '<path d="M12 1 l2.4 6.2 6.2 -2.6 -2.6 6.4 6.4 2 -6.4 2 2.6 6.4 -6.2 -2.6 L12 23 l-2.4 -6.2 -6.2 2.6 2.6 -6.4 L-0.4 15 l6.4 -2 -2.6 -6.4 6.2 2.6 z"/>',
  bolt: '<path d="M14 1 L4 13 h5.5 L8 23 18 10 h-5.5 z"/>',
  chain: '<path d="M6 3 l5 6 -3 3 5 6 -2 3 -6 -7 3 -3 -5 -6 z M16 4 a3 3 0 1 1 .1 0 z M19 15 a3 3 0 1 1 .1 0 z"/>',
  heart: '<path d="M12 22 C2 15 1 9 5 6 8.4 3.6 11 5.6 12 8 13 5.6 15.6 3.6 19 6 c4 3 3 9 -7 16 z"/>',
  shield: '<path d="M12 1 L22 5 v7 c0 6 -5 9 -10 11 C7 21 2 18 2 12 V5 z M12 5 L6 7.4 V12 c0 3.6 3 5.8 6 7.2 z"/>',
  ward: '<path d="M12 1 l3 4 5 1 -1 5 3 4 -4 3 -1 5 -5 -1 -5 1 -1 -5 -4 -3 3 -4 -1 -5 5 -1 z M12 7 a5 5 0 1 0 .1 0 z"/>',
  skull: '<path d="M12 1 a9 9 0 0 1 9 9 v4 l-3 2 v3 h-3 v-3 h-2 v3 h-2 v-3 H8 v3 H5 v-3 l-3 -2 v-4 a9 9 0 0 1 9 -9 z M8.5 10 a2.2 2.2 0 1 0 .1 0 z M15.5 10 a2.2 2.2 0 1 0 .1 0 z"/>',
  chains: '<path d="M3 8 h7 v3 H3 z M14 8 h7 v3 h-7 z M9 6 h6 v7 H9 z M6 13 a4 4 0 0 0 12 0 h-3 a1 1 0 0 1 -6 0 z" fill-rule="evenodd"/>',
  wing: '<path d="M2 12 c6 -8 14 -10 20 -9 -3 5 -8 7 -12 7 4 1 7 0 9 -1 -3 5 -9 8 -14 7 l-3 -4 z"/>',
  palm: '<path d="M7 10 V4 a1.6 1.6 0 0 1 3 0 v5 h1 V2.6 a1.6 1.6 0 0 1 3 0 V9 h1 V4.6 a1.6 1.6 0 0 1 3 0 V13 c0 6 -3 10 -7 10 -5 0 -8 -5 -9 -9 l-1 -3 a1.6 1.6 0 0 1 3 -1.4 z"/>',
  up: '<path d="M12 1 l8 10 h-5 v12 h-6 V11 H4 z"/>',
  down: '<path d="M12 23 L4 13 h5 V1 h6 v12 h5 z"/>',
  rune: '<path d="M12 1 l9 5.5 v11 L12 23 3 17.5 v-11 z M12 5.5 l-5 3 v6 l5 3 5 -3 v-6 z M12 9 l2 1.4 v3 L12 15 l-2 -1.6 v-3 z"/>',
  eye: '<path d="M1 12 C5 5 19 5 23 12 19 19 5 19 1 12 z M12 8 a4 4 0 1 0 .1 0 z"/>',
  cloak: '<path d="M12 1 l8 4 3 17 -11 -3 -11 3 3 -17 z M12 5 l-4 2 -1 11 5 -1 5 1 -1 -11 z"/>',
  fang: '<path d="M4 2 h16 l-2 5 -6 16 -6 -16 z M12 8 l-3 -1 3 9 3 -9 z"/>',
  drop: '<path d="M12 1 C6 9 3 12 3 16 a9 9 0 0 0 18 0 c0 -4 -3 -7 -9 -15 z M12 7 c-3 4 -5 6 -5 9 h3 c0 -2 1 -4 2 -6 z"/>',
  cog: '<path d="M10 1 h4 l.6 3 2.2 1 2.6 -1.6 2.8 2.8 -1.6 2.6 1 2.2 3 .6 v4 l-3 .6 -1 2.2 1.6 2.6 -2.8 2.8 -2.6 -1.6 -2.2 1 -.6 3 h-4 l-.6 -3 -2.2 -1 -2.6 1.6 -2.8 -2.8 1.6 -2.6 -1 -2.2 -3 -.6 v-4 l3 -.6 1 -2.2 -1.6 -2.6 2.8 -2.8 2.6 1.6 2.2 -1 z M12 8 a4 4 0 1 0 .1 0 z"/>',
  wrap: '<path d="M2 8 l6 -6 14 14 -6 6 z M8 8 l8 8 -2 2 -8 -8 z" fill-rule="evenodd"/>',
  phial: '<path d="M9 1 h6 v2 h-1 v5 l4 9 a3 3 0 0 1 -3 5 H9 a3 3 0 0 1 -3 -5 l4 -9 V3 H9 z M9 14 h6 l2 4 H7 z"/>',
  ankh: '<path d="M12 1 a5 5 0 0 1 3 9 v2 h4 v3 h-4 v8 h-6 v-8 H5 v-3 h4 v-2 a5 5 0 0 1 3 -9 z m0 3 a2 2 0 1 0 .1 0 z"/>',
};

/**
 * Which mark an effect kind wears, and in what order a combo is read. The
 * first kind in this list that an ability's effect contains is the one drawn,
 * so a card's picture never flickers between two of its own parts.
 */
export const ART_ORDER = [
  ['damageMult', 'blade'], ['weaponEnchant', 'enchant'], ['spellDamage', 'bolt'],
  ['corpseBurst', 'burst'], ['aoe', 'burst'], ['chain', 'chain'],
  ['resurrect', 'ankh'], ['heal', 'heart'], ['bandage', 'wrap'], ['cure', 'phial'],
  ['absorb', 'shield'], ['zone', 'ward'], ['summon', 'skull'],
  ['plague', 'fang'], ['dot', 'fang'], ['leech', 'drop'],
  ['control', 'chains'], ['mark', 'eye'], ['stealth', 'cloak'],
  ['move', 'wing'], ['knockback', 'palm'], ['utility', 'cog'],
  ['buff', 'up'], ['debuff', 'down'], ['passiveMod', 'rune'],
];

/** Walk an effect and everything inside a combo. */
function eachEffect(effect, visit) {
  if (!effect) return;
  if (effect.kind === 'combo') { for (const p of effect.parts || []) eachEffect(p, visit); return; }
  visit(effect);
}

/**
 * Pure. `{ glyph, kind, colour, damageType, tint }` for one ability: the mark
 * it wears, the archetype colour it is drawn in, and the damage type behind
 * it when the row names one.
 */
export function artFor(ability) {
  const kinds = new Set();
  let damageType = null;
  eachEffect(ability?.effect, (e) => {
    kinds.add(e.kind);
    if (!damageType) damageType = e.type || e.damageType || null;
  });
  let kind = null, glyph = 'rune';
  for (const [k, g] of ART_ORDER) if (kinds.has(k)) { kind = k; glyph = g; break; }
  const colour = GROUP_COLOUR[ability?.group] || theme.parchmentDim;
  return { glyph, kind, colour, damageType, tint: DAMAGE_TINT[damageType] || null };
}

/** The padlock on a card you have not earned. Drawn, like everything else. */
export const LOCK_SVG = `<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" stroke="none"><path d="M7 10V7a5 5 0 0 1 10 0v3h1.6v11H5.4V10zm2.4 0h5.2V7a2.6 2.6 0 0 0-5.2 0zM12 13.4a1.8 1.8 0 0 0-1 3.3v1.6h2v-1.6a1.8 1.8 0 0 0-1-3.3z"/></svg>`;

/** One card's art, as an inline svg string, at `size` px. */
export function artSvg(ability, size = 40) {
  // the painted icon when the library has one; every ability has one today,
  // and the drawing below is what a new ability wears until it is painted
  const src = abilityIcon(ability && ability.id);
  if (src) return iconImg(src, size, 'bw-a-art');
  const a = artFor(ability);
  return `<svg class="bw-a-art" viewBox="0 0 24 24" width="${size}" height="${size}" fill="${a.colour}" stroke="none">${ART[a.glyph] || ART.rune}</svg>`;
}

/**
 * Every row lands on a drawing, and every effect kind the rules layer can
 * write has a mark. Runs at import: the twenty seventh effect kind fails here
 * rather than showing an empty tile.
 */
export function auditArt() {
  const drawn = new Set(ART_ORDER.map(([k]) => k));
  const missing = [];
  for (const k of EFFECT_KINDS) {
    if (k === 'combo') continue;
    if (!drawn.has(k)) missing.push(`the effect kind "${k}" has no mark`);
  }
  for (const [k, g] of ART_ORDER) if (!ART[g]) missing.push(`"${k}" wants a "${g}" drawing and there is none`);
  for (const a of ABILITIES) {
    const art = artFor(a);
    if (!art.kind) missing.push(`${a.id} falls through to no mark at all`);
    if (!GROUP_COLOUR[a.group]) missing.push(`${a.group} has no colour`);
    if (!GROUP_LABEL[a.group]) missing.push(`${a.group} has no heading`);
  }
  for (const g of GROUPS) {
    if (!GROUP_LABEL[g]) missing.push(`the group "${g}" has no heading`);
  }
  if (missing.length) throw new Error(`win_abilities: ${missing.length} rows have no art. ${missing[0]}`);
  return ABILITIES.length;
}

auditArt();

// ---------------------------------------------------------------------------
// What it takes, and what you have
// ---------------------------------------------------------------------------

/** A skill number as a player reads it: 33.4, 50, 0. abilities.js owns it now:
 * the card, the bar's tooltip and the runtime's refusal all print through the
 * same function, so 33.40000000000001 cannot appear on one of the three. */
export const skillNumber = skillNumberOf;

/**
 * Pure. Every clause of this ability's unlock, with the character's own number
 * beside it. abilities.js owns the derivation; this is the re-export, so the
 * card cannot drift from the refusal a key press gives.
 *
 * `parts` is `[{ id, label, need, have, met, stat, branch }]`. The gate itself
 * is first, then every `extraReq`. An `anyOf` row (there are two: Snare and
 * Resurrect) reports EVERY branch, each tagged with its `branch` index, and
 * the line below joins them with ", or", because "Healing 80 and Anatomy 80,
 * or Chivalry 85" is two doors and showing one of them sends a paladin down
 * the physician's road.
 *
 * `skillAny` (Power Strike, Whirlwind, Leap Slam) names the ONE weapon skill
 * the character is best at, which is the number the gate actually reads. A
 * warrior at Swordsmanship 33.4 is told about Swordsmanship, not about "a
 * weapon skill", because the first is a sentence and the second is a shrug.
 */
export const requirementParts = requirementClauses;

/**
 * Pure. What a card says about its gate, in the pieces it is drawn from.
 *
 *   `text`   what it takes, whether or not you have it: "Swordsmanship 50 and
 *            Tactics 40", or "nothing at all" for Jump and Sprint.
 *   `short`  the whole line while something is missing, with your number in
 *            it: "Needs Swordsmanship 50, you are at 33.4 and Tactics 40".
 *            Empty when nothing is missing.
 *   `spans`  that same line cut into pieces so the card can colour it: each is
 *            `{ text, met }`, and the card paints an unmet piece in the
 *            theme's red and a met one in the ordinary colour. The player
 *            asked to see the missing requirement in red, and a whole line in
 *            red would say the Tactics 40 he already has is missing too.
 *   `practice` the sentence for a row he is allowed to hold and has not
 *            earned: how often it lands and where it comes good.
 */
export function requirementView(ability, skills = {}, stats = {}) {
  const parts = requirementClauses(ability, skills, stats);
  const met = !!ability && meetsRequirements(ability, skills, stats).ok;
  const text = parts.length ? parts.map((p) => `${p.label} ${p.need}`).join(' and ') : 'nothing at all';
  const missing = parts.filter((p) => !p.met);
  const spans = [];
  if (!met && parts.length) {
    spans.push({ text: 'Needs ', met: true });
    let last = null;
    parts.forEach((p, i) => {
      const key = p.branch == null ? 'all' : `branch${p.branch}`;
      if (i > 0) spans.push({ text: key === last ? ' and ' : ', or ', met: true });
      spans.push({ text: clauseText(p), met: p.met });
      last = key;
    });
  }
  const short = spans.map((x) => x.text).join('');
  return {
    met, parts, text, short, missing, spans,
    practice: met && ability ? practiceText(ability, skills) : '',
  };
}

/**
 * Pure. The small caps chips along the top of a card: what it costs, how long
 * it sleeps, and how long it takes to say. A chip that would read zero is left
 * out rather than printed, which is why Riposte shows one chip and Fireball
 * shows three.
 */
export function chipsFor(ability, character = {}) {
  const out = [];
  if (!ability) return out;
  if (ability.passive) { out.push({ id: 'passive', text: 'passive' }); return out; }
  const kind = costKind(ability);
  if (kind === 'mana') out.push({ id: 'cost', text: `${Math.round(manaCostFor(ability, character))} mana` });
  else if (kind === 'stamina' && ability.cost.stamina) out.push({ id: 'cost', text: `${ability.cost.stamina} stamina` });
  else if (kind === 'item') out.push({ id: 'cost', text: `${ability.cost.count ?? 1} ${String(ability.cost.item).replace(/([A-Z])/g, ' $1').toLowerCase()}` });
  else out.push({ id: 'cost', text: 'free' });
  if (ability.cooldown) out.push({ id: 'cooldown', text: `${ability.cooldown} s cooldown` });
  if (ability.castTime) out.push({ id: 'cast', text: `${ability.castTime} s cast${ability.moving ? '' : ', rooted'}` });
  if (ability.range) out.push({ id: 'range', text: `${ability.range} m` });
  return out;
}

/**
 * Pure. The sentence about what has to be in your hands, or ''. Only asked of
 * an ability you have already unlocked: telling a Magery 0 character that
 * Fireball also wants nothing in hand is noise.
 */
export function weaponLine(ability, character = {}) {
  if (!ability || weaponNeeds(ability).kind === 'none') return '';
  if (!character.equipment) return '';
  const r = weaponCheck(ability, character.equipment, character.pack);
  return r.ok ? '' : r.reason;
}

/** The filter row, in the order it is drawn. */
export const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'unlocked', label: 'Unlocked' },
  ...GROUPS.map((g) => ({ id: g, label: GROUP_LABEL[g] })),
];

/** Pure. Does this filter show this ability? */
export function inFilter(ability, filter, unlocked) {
  if (filter === 'all') return true;
  if (filter === 'unlocked') return !!unlocked;
  return ability.group === filter;
}

/**
 * Pure. The whole book, grouped and sorted the way it is drawn: archetypes in
 * abilities.js's order, and inside each one what you have first, then the rest
 * by the skill mark they unlock at, so the page reads as a ladder.
 */
export function bookFor(skills = {}, stats = {}, filter = 'all') {
  const open = new Set(unlockedFor(skills, stats).map((a) => a.id));
  const out = [];
  for (const group of GROUPS) {
    const rows = ABILITIES
      .filter((a) => a.group === group && inFilter(a, filter, open.has(a.id)))
      .map((a) => ({ ability: a, unlocked: open.has(a.id) }))
      .sort((x, y) => (Number(y.unlocked) - Number(x.unlocked))
        || (x.ability.minSkill - y.ability.minSkill)
        || x.ability.name.localeCompare(y.ability.name));
    if (rows.length) out.push({ group, label: GROUP_LABEL[group], rows });
  }
  return out;
}

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

const CSS = `
.bw-abils { width: 100%; font-family: ${theme.fonts.body}; }
.bw-abils .bw-hint { color: ${theme.parchmentDim}; font-style: italic; font-size: 15px; margin-bottom: 10px; }


.bw-abils .bw-filters { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 14px; }
.bw-abils .bw-f {
  font-family: ${theme.fonts.display}; font-size: 11px; letter-spacing: .12em;
  text-transform: uppercase; padding: 5px 11px; cursor: pointer;
  color: ${theme.parchmentDim}; background: rgba(9,8,6,.7);
  border: 1px solid ${theme.goldDim}66;
}
.bw-abils .bw-f:hover { color: ${theme.goldBright}; border-color: ${theme.gold}; }
.bw-abils .bw-f.on { color: ${theme.goldBright}; border-color: ${theme.gold}; background: ${theme.plate}; }
.bw-abils .bw-count { font-family: ${theme.fonts.display}; font-size: 11px; letter-spacing: .12em;
  text-transform: uppercase; color: ${theme.parchmentFaint}; margin: 0 0 12px; }

.bw-abils h3 {
  font-family: ${theme.fonts.display}; font-size: 15px; font-weight: 600;
  letter-spacing: .2em; text-transform: uppercase; color: ${theme.gold};
  margin: 20px 0 9px; padding-bottom: 5px; border-bottom: 1px solid ${theme.goldDim}55;
}
.bw-abils h3:first-child { margin-top: 0; }

.bw-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 10px; }

.bw-card {
  position: relative; display: grid; grid-template-columns: 112px 1fr; gap: 14px;
  padding: 11px 13px; align-items: start; cursor: grab;
  background: linear-gradient(150deg, rgba(30,25,18,.86), rgba(10,9,7,.9));
  border: 1px solid ${theme.goldDim}55;
}
.bw-card:hover { border-color: ${theme.gold}; }
.bw-card.locked { cursor: default; opacity: .52; }
.bw-card.passive { cursor: default; }
.bw-card.on { border-color: ${theme.gold}; box-shadow: inset 3px 0 0 ${theme.gold}; }

.bw-card .bw-tile {
  position: relative; width: 112px; height: 112px; display: flex; overflow: hidden;
  align-items: center; justify-content: center;
  background: radial-gradient(circle at 50% 40%, rgba(255,255,255,.07), rgba(0,0,0,.45));
  border: 1px solid ${theme.goldDim}77;
}
.bw-card .bw-tile img.bw-a-art { width: 100%; height: 100%; object-fit: cover; display: block; }
.bw-card.locked .bw-tile { filter: grayscale(1); }
.bw-card .bw-tile svg.bw-a-art { width: 64px; height: 64px; }
.bw-card .bw-lock {
  position: absolute; right: 2px; bottom: 1px; font-family: ${theme.fonts.display};
  font-size: 15px; line-height: 1; color: ${theme.parchmentFaint};
}
.bw-card .bw-name {
  font-family: ${theme.fonts.display}; font-size: 18px; font-weight: 600;
  letter-spacing: .02em; color: ${theme.parchment}; margin-bottom: 5px;
}
.bw-card.on .bw-name, .bw-card:hover .bw-name { color: ${theme.goldBright}; }
.bw-card .bw-chips { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 6px; }
.bw-card .bw-chip {
  font-family: ${theme.fonts.display}; font-size: 10px; letter-spacing: .12em;
  text-transform: uppercase; padding: 2px 7px; color: ${theme.parchmentDim};
  background: rgba(0,0,0,.4); border: 1px solid ${theme.goldDim}44;
}
.bw-card .bw-desc { font-size: 15.5px; line-height: 1.34; color: ${theme.parchmentDim}; margin-top: 7px; }
.bw-card .bw-req {
  font-family: ${theme.fonts.display}; font-size: 11.5px; letter-spacing: .06em;
  color: ${theme.parchmentFaint};
}
.bw-card.locked .bw-req { color: #e0b064; }
/* the clause you have NOT got, in the theme's red, inside a line whose other
   clauses stay the ordinary colour. theme.down is the red every panel already
   uses for a number going the wrong way. */
.bw-card .bw-req .bw-miss { color: ${theme.down}; }
.bw-card.locked .bw-req .bw-miss { color: ${theme.down}; }
.bw-card .bw-practice {
  font-family: ${theme.fonts.display}; font-size: 11.5px; letter-spacing: .06em;
  color: #e0b064; margin-top: 4px;
}
.bw-card .bw-hand { font-size: 14px; font-style: italic; color: #ff9a80; margin-top: 5px; }
.bw-card .bw-key {
  position: absolute; right: 9px; top: 9px; font-family: ${theme.fonts.display};
  font-size: 10px; letter-spacing: .14em; text-transform: uppercase; color: ${theme.gold};
}
`;

const h = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};

function css() {
  if (typeof document === 'undefined' || document.getElementById('bw-abils-css')) return;
  const s = document.createElement('style');
  s.id = 'bw-abils-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

export const panel = {
  id: 'abilities',
  title: 'Abilities',
  key: 'p',

  build(el, ctx) {
    css();
    const character = () => (ctx.character && ctx.character.skills ? ctx.character : ctx.inventory?.character) || { skills: {}, stats: {} };
    const say = (t, kind) => (ctx.hud?.log ? ctx.hud.log(t, kind) : ctx.hud?.toast?.(t, kind));
    let filter = 'all';

    const root = h('div', 'bw-abils');
    el.appendChild(root);

    root.appendChild(h('div', 'bw-hint',
      'Every ability in the world is here. Drag one you have onto your bar at the bottom of the screen, or click it and then a slot on the bar. Right click a bar slot to clear it. The bar answers to 1 to 0 and the two keys after them.'));

    const filterRow = h('div', 'bw-filters');
    root.appendChild(filterRow);
    const countLine = h('div', 'bw-count');
    root.appendChild(countLine);
    const listEl = h('div');
    root.appendChild(listEl);

    // --- the filter row ----------------------------------------------------
    const filterEls = new Map();
    for (const f of FILTERS) {
      const b = h('div', 'bw-f', f.label);
      b.addEventListener('click', () => {
        if (filter === f.id) return;
        filter = f.id;
        build();
        refresh();
      });
      filterRow.appendChild(b);
      filterEls.set(f.id, b);
    }

    function apply(slot, abilityId) {
      const c = character();
      const res = setBarSlot(c, slot, abilityId);
      say(res.reason, res.ok ? undefined : 'bad');
      if (res.ok) { ctx.onBarChange?.(c.bar, slot); refresh(); }
      return res;
    }

    // --- the cards ---------------------------------------------------------
    // Built once per filter change and then only refreshed, because the live
    // number in "you are at 33.4" ticks twice a second and rebuilding seventy
    // eight cards at 2 Hz is a page that fights the garbage collector.
    let cards = [];

    function build() {
      listEl.textContent = '';
      cards = [];
      const c = character();
      for (const section of bookFor(c.skills || {}, c.stats || {}, filter)) {
        listEl.appendChild(h('h3', null, section.label));
        const grid = h('div', 'bw-cards');
        listEl.appendChild(grid);
        for (const { ability } of section.rows) {
          const card = h('div', 'bw-card');
          const tile = h('div', 'bw-tile');
          tile.innerHTML = artSvg(ability, 112);
          const art = artFor(ability);
          if (art.tint) tile.style.background = `radial-gradient(circle at 50% 38%, ${art.tint}2e, rgba(0,0,0,.5))`;
          const lock = h('span', 'bw-lock');
          lock.innerHTML = LOCK_SVG;
          tile.appendChild(lock);
          card.appendChild(tile);

          const body = h('div');
          const name = h('div', 'bw-name', ability.name);
          const chips = h('div', 'bw-chips');
          const desc = h('div', 'bw-desc', ability.description);
          const req = h('div', 'bw-req');
          const practice = h('div', 'bw-practice');
          const hand = h('div', 'bw-hand');
          const key = h('div', 'bw-key');
          // THE GATE ABOVE THE DESCRIPTION. The player asked for the missing
          // requirement "on spell description ... and the description under
          // it", and he is right about the order: what stops you using a card
          // is the first thing you want off it, and the prose about what it
          // does is what you read once you can.
          body.appendChild(name);
          body.appendChild(chips);
          body.appendChild(req);
          body.appendChild(practice);
          body.appendChild(desc);
          body.appendChild(hand);
          card.appendChild(body);
          card.appendChild(key);
          grid.appendChild(card);

          const rec = { ability, el: card, tile, lock, chips, req, practice, hand, key, unlocked: false };
          cards.push(rec);

          attachTip(card, () => ({ lines: abilityLines(ability, character()) }));
          // Only what you have, and only what is not passive, is a drag source.
          dragSource(card, () => (rec.unlocked && !ability.passive ? { ability: ability.id } : null));
          card.addEventListener('click', () => {
            const cc = character();
            if (!rec.unlocked) {
              const v = requirementView(ability, cc.skills || {}, cc.stats || {});
              // The same words the runtime answers a key press with.
              say(v.short ? `${ability.name} n${v.short.slice(1)}` : `${ability.name} is not yours yet`, 'bad');
              return;
            }
            if (ability.passive) { say(`${ability.name} is passive and already working`); return; }
            held = { id: ability.id, place: (slot) => apply(slot, ability.id) };
            say(`${ability.name} in hand. Click a slot on your bar to put it there.`);
          });
        }
      }
    }

    // --- what changes while you watch --------------------------------------
    function refresh() {
      const c = character();
      const skills = c.skills || {};
      const stats = c.stats || {};
      const bar = barOf(c);

      for (const f of FILTERS) filterEls.get(f.id).classList.toggle('on', filter === f.id);

      let open = 0;
      for (const rec of cards) {
        const a = rec.ability;
        const v = requirementView(a, skills, stats);
        rec.unlocked = v.met;
        if (v.met) open++;
        rec.el.classList.toggle('locked', !v.met);
        rec.el.classList.toggle('passive', !!a.passive);
        const slot = bar.indexOf(a.id);
        rec.el.classList.toggle('on', slot >= 0);
        rec.lock.style.display = v.met ? 'none' : '';
        rec.key.textContent = slot >= 0 ? `key ${keyFor(c, slot)}` : '';

        const chips = chipsFor(a, c);
        if (rec.chipText !== JSON.stringify(chips)) {
          rec.chipText = JSON.stringify(chips);
          rec.chips.textContent = '';
          for (const chip of chips) rec.chips.appendChild(h('span', 'bw-chip', chip.text));
        }

        // THE MISSING CLAUSE, IN RED. A met card prints what it took; a locked
        // one prints the whole gate with your own number against each clause,
        // and only the clauses you are short of are painted. Rebuilt only when
        // the words actually change, because this runs twice a second.
        const line = v.met ? (v.text === 'nothing at all' ? 'anyone can do this' : v.text) : v.short;
        if (rec.reqText !== line) {
          rec.reqText = line;
          rec.req.textContent = '';
          if (v.met) rec.req.appendChild(h('span', null, line));
          else for (const span of v.spans) rec.req.appendChild(h('span', span.met ? null : 'bw-miss', span.text));
        }

        // And the row you may hold and have not earned: how often it lands,
        // and the mark it comes good at. Empty for everything else.
        if (rec.practice.textContent !== v.practice) rec.practice.textContent = v.practice;
        rec.practice.style.display = v.practice ? '' : 'none';

        const hand = v.met ? weaponLine(a, c) : '';
        if (rec.hand.textContent !== hand) rec.hand.textContent = hand;
        rec.hand.style.display = hand ? '' : 'none';
      }

      const shown = cards.length;
      countLine.textContent = `${open} of ${ABILITIES.length} learned, ${shown} shown`;
    }

    build();
    refresh();
    this._refresh = refresh;
    this._rebuild = () => { build(); refresh(); };
  },

  open() { if (this._rebuild) this._rebuild(); },
  close() { hideTip(); held = null; },

  tick(dt) {
    this._since = (this._since || 0) + (dt || 0);
    if (this._since < 0.5) return;
    this._since = 0;
    if (this._refresh) this._refresh();
  },
};

export default panel;
