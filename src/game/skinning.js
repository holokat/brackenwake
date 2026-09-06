// Skinning: the knife, the body, and the hide that comes off it.
//
//   const skinning = createSkinning({ monsters, inventory, progression, hud,
//                                     audio, floaters, character });
//   const corpse = skinning.pick(raycaster) || skinning.nearest(player.pos);
//   if (corpse) skinning.skin(corpse, now);
//
// 01-STATS-SKILLS gives Skinning one line, "hides and scales from what you
// kill", and 03-ITEMS-LOOT gives it one more: "Leather: hide (any beast),
// thick hide (bear, dire wolf), scaled hide (wyvern, drake), by Skinning
// skill." Everything below is those two sentences and nothing invented past
// them without saying so.
//
// ---------------------------------------------------------------------------
// WHERE THE HIDE COMES FROM, and why it is not a rule about families
// ---------------------------------------------------------------------------
// Every monster row in `src/mmo/monsters.js` already carries its own loot
// words, and eighteen of the forty one carry `hide`, `thickHide` or
// `scaledHide`. That table is the source, not a rule about beasts: a bone
// dragon is undead and carries `scaledHide`, and its own row wins. What falls
// out of reading it that way is exactly what the document describes: every
// beast has a hide word, no construct has one, and no undead has one but the
// dragon whose scales the row names. `skinWordFor` in `loot_drops.js` is that
// read, and `auditSkinnable()` below prints the count rather than claiming it.
//
// ---------------------------------------------------------------------------
// WHAT THIS FILE INVENTS, because no document gives it
// ---------------------------------------------------------------------------
// 1. The difficulty. Five per monster tier, so a rat is 5 and a hydra is 25.
//    Skinning is the easiest of the gathering skills to reach the top of,
//    which is why no tier costs more than a copper vein's twenty five.
//
// 2. The success roll. There is no Skinning chance anywhere in the documents,
//    and there is exactly one "did the work come off" formula in the game:
//    03-ITEMS-LOOT's crafting chance, `clamp(0.5 + (skill - difficulty) *
//    0.01, 0.05, 0.98)`, which `recipes.js` exports as `craftChance`. It is
//    imported rather than copied, so there is one rule and not two.
//
// 3. The yield. Mining's shape, `1 + floor((skill - difficulty) / step)`, with
//    a step of 25 rather than 15 because a hide is one thick object and an ore
//    vein is a pile: a grandmaster takes four hides off a wolf and one off a
//    hydra.
//
// 4. A failed roll ruins the hide and the body is done. That is the crafting
//    rule ("failure eats half the materials and still teaches") read for a
//    thing there is only one of. It still teaches, at rollGain's half chance.
//
// ---------------------------------------------------------------------------
// WHAT MONSTERS.JS HAS TO EXPOSE, and does not yet
// ---------------------------------------------------------------------------
// `src/game/monsters.js` keeps its `corpses` array private and takes a body
// away after `CORPSE_LINGER_S`, which is 1.5 seconds: the topple and a moment
// after it. Nothing can be skinned in 1.5 s, and nothing outside that file can
// see a body at all. This module therefore codes against one call that does not
// exist yet and says so out loud through `needs()`:
//
//   monsters.corpsesNear(pos, radius) -> [{ actor, row, pos, skinned, key }]
//
// and, when there is a mesh to click, `monsters.pickCorpse(raycaster)` giving
// the same record. Until G3 adds them `pick` returns null and `nearest`
// returns null, and `needs()` names what is missing rather than pretending.
// docs/mmo/wiring/G4.md carries the same list.

import { craftChance } from '../mmo/recipes.js';
import { makeItem, LEATHER_BASE, BASES } from '../mmo/items.js';
import { MONSTERS } from '../mmo/monsters.js';
import { skinWordFor, SKINNING_ORDER } from './loot_drops.js';
import { toolFor } from './tools.js';

/** Metres. The same reach a sack is taken from, 07-RUNTIME-CONTRACT's 3 m. */
export const SKIN_REACH = 3;
/** Difficulty is this times the monster's tier. See note 1. */
export const SKIN_DIFFICULTY_PER_TIER = 5;
/** One cut per this many ms, the same rate interact.js gives a swing. */
export const SKIN_COOLDOWN_MS = 450;
/** See note 3. One hide, and one more for every this many points of margin. */
export const YIELD_STEP = 25;
/** The skill this teaches; ores.js LEATHER_SKILL says the same. */
export const SKINNING_SKILL = 'skinning';

const num = (v) => (Number.isFinite(v) ? v : 0);
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const dist2D = (a, b) => Math.hypot(num(a?.x) - num(b?.x), num(a?.z) - num(b?.z));

/** Five per tier. A critter is 0, a rat 5, a hydra 25. */
export function difficultyFor(row) {
  const r = typeof row === 'string' ? MONSTERS[row] : row;
  return Math.max(0, Math.round(num(r?.tier) * SKIN_DIFFICULTY_PER_TIER));
}

/** See note 2: the game's one success formula, imported and not copied. */
export const chanceFor = (skill, difficulty) => craftChance(num(skill), num(difficulty));

/** See note 3. Never less than one, whatever the margin. */
export function yieldFor(skill, difficulty) {
  return Math.max(1, 1 + Math.floor((num(skill) - num(difficulty)) / YIELD_STEP));
}

/**
 * A stack of hides with `item.material` stamped.
 *
 * `makeItem` does not carry a material, and `win_crafting.js`'s
 * `countMaterial` reads `item.material` and nothing else. This is the one place
 * in the game that makes a hide, so this is the one place that has to stamp it.
 * Without the stamp a tanning rack says you have no hide while you carry nine.
 */
export function makeHide(word, count = 1, seed = 0) {
  const base = LEATHER_BASE[word];
  if (!base) throw new Error(`makeHide: ${word} is not one of ${SKINNING_ORDER.join(', ')}`);
  const item = makeItem({ base, rarity: 'common', seed, count: Math.max(1, Math.round(count)) });
  item.material = word;                      // the ores.js id a recipe asks for
  return item;
}

/**
 * Is there a knife, and which one.
 *
 * A dagger is held: `equipment.mainHand`. A skinning knife has no slot in
 * items.js (it is a tool, like the pickaxe, and giving it a slot would put a
 * thing with no damage in the weapon hand), so it counts wherever it is
 * carried. Both are named in the refusal, so nobody has to guess which one the
 * game wants.
 *
 * THE RULE IS NOT WRITTEN HERE ANY MORE. It is `toolFor('skin', ...)` in
 * `src/game/tools.js`, the same one the axe and the pickaxe go through since
 * T3 took the tool row off the screen, so skinning cannot come to prefer the
 * pack while chopping prefers the hand. This is the shape the rest of this
 * file and `context_menu.js` already read: `{ ok, what, where }`.
 */
export function knifeOf(character, opts = {}) {
  const t = toolFor('skin', character, opts);
  return t.ok
    ? { ok: true, what: t.name, where: t.where === 'pack' ? 'pack' : t.where === 'bar' ? 'bar' : 'hand', id: t.id }
    : { ok: false, what: null, where: null, id: null };
}

/** The name to say, always the row's own. */
const nameOf = (corpse) => String(corpse?.row?.name || corpse?.name || 'it').toLowerCase();
/** "a wolf", "an iron golem". */
const anA = (noun) => `${/^[aeiou]/i.test(noun) ? 'an' : 'a'} ${noun}`;

/**
 * Every monster that carries a hide word, counted rather than claimed, and the
 * two halves of the document checked against the table: every beast skins, and
 * no construct does. Runs at load.
 */
export function auditSkinnable() {
  const bad = [];
  const rows = Object.values(MONSTERS);
  const skinnable = rows.filter((m) => skinWordFor(m));
  for (const m of rows) {
    const word = skinWordFor(m);
    if (word && !LEATHER_BASE[word]) bad.push(`${m.id} carries "${word}", which joins to no base`);
    // "hide (any beast)": a beast with no hide word would be a hole in 03
    if (m.kind === 'beast' && !word) bad.push(`${m.id} is a beast and carries no hide word`);
    // a construct is metal and stone; there is nothing on it to cut
    if (m.kind === 'construct' && word) bad.push(`${m.id} is a construct and carries "${word}"`);
  }
  if (bad.length) throw new Error(`skinning: ${bad.join('; ')}`);
  const byWord = {};
  for (const m of skinnable) byWord[skinWordFor(m)] = (byWord[skinWordFor(m)] || 0) + 1;
  return { rows: rows.length, skinnable: skinnable.length, byWord };
}
auditSkinnable();

// ---------------------------------------------------------------------------

export function createSkinning(opts = {}) {
  const { monsters, inventory, progression, hud, audio, floaters, character } = opts;
  const rng = opts.rng || Math.random;
  // Dev mode carries one of every tool, and it has to carry the knife too or
  // the lens would let you fell a tree and refuse to skin what you killed.
  // Read every time, because the lens goes up and down while the game runs.
  const isDev = typeof opts.dev === 'function' ? opts.dev : () => !!opts.dev;
  const posOf = () => {
    const p = typeof opts.at === 'function' ? opts.at() : opts.at;
    return p || character?.pos || { x: 0, y: 0, z: 0 };
  };

  let lastAt = -Infinity;
  const stats = { attempts: 0, hides: 0, ruined: 0, refused: 0 };

  const say = (text, kind) => {
    if (!text) return text;
    if (typeof hud?.log === 'function') hud.log(text, kind);
    else hud?.toast?.(text, kind);
    return text;
  };

  const refuse = (text) => { stats.refused++; audio?.play?.('denied'); return { ok: false, reason: text, text: say(text, 'bad') }; };

  /** What monsters.js still owes this file. Empty when it owes nothing. */
  function needs() {
    const missing = [];
    if (typeof monsters?.corpsesNear !== 'function') missing.push('monsters.corpsesNear(pos, radius)');
    if (typeof monsters?.pickCorpse !== 'function') missing.push('monsters.pickCorpse(raycaster)');
    return missing;
  }

  /** Every body within reach, nearest first. Empty when monsters.js has none. */
  function corpsesNear(pos = posOf(), r = SKIN_REACH) {
    let list = [];
    if (typeof monsters?.corpsesNear === 'function') list = monsters.corpsesNear(pos, r) || [];
    else if (typeof monsters?.corpses === 'function') list = monsters.corpses() || [];
    return list
      .filter(Boolean)
      .filter((c) => dist2D(c.pos || c.actor?.pos, pos) <= r)
      .sort((a, b) => dist2D(a.pos || a.actor?.pos, pos) - dist2D(b.pos || b.actor?.pos, pos));
  }

  /** The body under the cursor, or null. Null forever until monsters.js helps. */
  function pick(raycaster) {
    if (!raycaster) return null;
    if (typeof monsters?.pickCorpse === 'function') return monsters.pickCorpse(raycaster) || null;
    return null;
  }

  /** The nearest body to a point, for a key press rather than a click. */
  function nearest(pos = posOf(), r = SKIN_REACH) {
    return corpsesNear(pos, r)[0] || null;
  }

  /** True when a click on this body should go to the knife and not to interact. */
  function canSkin(corpse) {
    if (!corpse) return false;
    if (corpse.skinned) return false;
    if (!skinWordFor(corpse.row)) return false;
    return knifeOf(character, { dev: isDev() }).ok;
  }

  /**
   * Take the hide off a body. Every path out of here says something: this is
   * the click that looks most like a broken button when it is silent.
   *
   * @param corpse a record from `pick`/`nearest`: { actor, row, pos, skinned }
   * @param now    ms, the frame clock
   */
  function skin(corpse, now = Date.now()) {
    if (!corpse || !corpse.row) return refuse('There is nothing there to skin.');

    const name = nameOf(corpse);
    const word = skinWordFor(corpse.row);
    if (!word) {
      const kind = corpse.row.kind;
      return refuse(
        kind === 'undead' ? `There is nothing to skin on ${anA(name)}.`
          : kind === 'construct' ? `${anA(name).replace(/^./, (c) => c.toUpperCase())} is stone and iron. There is nothing to skin on it.`
            : `There is nothing on ${anA(name)} worth taking a knife to.`,
      );
    }

    if (corpse.skinned) return refuse(`The ${name} is already skinned.`);

    // The words are tools.js's, so the refusal a body gives is the same
    // sentence whether it comes from here, from the context menu or from a
    // hover line, and there is only one place to change it.
    const knife = toolFor('skin', character, { noun: name, dev: isDev() });
    if (!knife.ok) return refuse(knife.reason);

    const where = posOf();
    const at = corpse.pos || corpse.actor?.pos;
    const d = dist2D(at, where);
    if (d > SKIN_REACH) {
      return refuse(`The ${name} is ${d.toFixed(1)} m off, and you have to be within ${SKIN_REACH} m to skin it.`);
    }

    // one cut per swing's worth of time, so a double click is one cut
    if (num(now) - lastAt < SKIN_COOLDOWN_MS) return { ok: false, reason: 'cooldown', text: '' };
    lastAt = num(now);
    stats.attempts++;

    const skill = num(character?.skills?.[SKINNING_SKILL]);
    const difficulty = difficultyFor(corpse.row);
    const chance = chanceFor(skill, difficulty);
    const success = rng() < chance;

    corpse.skinned = true;
    corpse.skinnedAt = num(now);

    if (!success) {
      stats.ruined++;
      audio?.play?.('denied');
      const text = say(`The knife goes through the hide. Nothing comes off the ${name} whole.`, 'bad');
      const taught = progression?.lesson?.(SKINNING_SKILL, difficulty, false, rng) || null;
      return { ok: false, reason: 'ruined', success: false, chance, difficulty, count: 0, text, taught };
    }

    const count = yieldFor(skill, difficulty);
    const item = makeHide(word, count, Math.floor(rng() * 0xffffffff));
    const added = inventory?.add ? inventory.add(item) : { ok: true, added: count, dropped: 0 };
    const got = num(added?.added);
    stats.hides += got;

    const hideName = BASES[LEATHER_BASE[word]].name.toLowerCase();
    let text;
    if (got > 0) {
      audio?.play?.('pickup');
      floaters?.spawn?.(at, `+${got} ${hideName}`, 'loot');
      text = say(`${got} ${hideName}${got === 1 ? '' : 's'} off the ${name}.`);
    } else {
      // the gift was real and the path was not: say so, and let the body keep it
      corpse.skinned = false;
      corpse.skinnedAt = null;
      audio?.play?.('denied');
      text = say(`The ${hideName} will not fit in your pack, so the ${name} keeps it.`, 'bad');
      return { ok: false, reason: 'no_room', success: true, chance, difficulty, count: 0, item, text };
    }

    const taught = progression?.lesson?.(SKINNING_SKILL, difficulty, true, rng) || null;
    return { ok: true, success: true, chance, difficulty, count: got, word, item, text, taught };
  }

  return {
    skin, pick, nearest, corpsesNear, canSkin, needs, stats,
    /** What a hover line should say over a body. */
    labelFor(corpse) {
      if (!corpse) return '';
      const name = nameOf(corpse);
      if (corpse.skinned) return `${name}, skinned`;
      return skinWordFor(corpse.row) ? `${name}, not yet skinned` : `${name}`;
    },
    difficultyFor, chanceFor, yieldFor, knifeOf: () => knifeOf(character, { dev: isDev() }),
  };
}

export default createSkinning;
