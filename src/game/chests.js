// The boxes underground, and what it takes to get into one.
//
//   const chests = createChests({ character, inventory, progression, combat,
//                                 hud, audio, floaters, runtime, loot, state });
//   chests.open(chest, { at: player.pos });
//
// `chest` is a record off a cavern layout: `{ i, gx, gz, x, z, y, kind, locked,
// trapped, tier, key }`. `cavern_gen.js` makes them, `cavern_scene.js` builds
// them with `userData.chest` on every mesh, and `world_runtime.pick` hands one
// back as `{ kind: 'chest', chest }`. This is what happens when you open it.
//
// ---- the three gates, in order -------------------------------------------
//
//  1. REACH. Three metres, the same arm's length a sack is taken at.
//  2. THE TRAP. A Remove Trap roll against the box's tier. Fail and it goes
//     off: tier x 8 health, through `combat.hurt`, which is the same call a
//     fall and a poison tick come through. Either way the trap is spent, so a
//     box is never a wall you cannot pass.
//  3. THE LOCK. A Lockpicking roll against the tier, and a lockpick in the
//     pack to roll with. A failure costs nothing but time, except one failure
//     in four, which snaps the pick.
//
// Every one of those teaches, through `progression.lesson`, which is the real
// skill path: `rollGain` in src/mmo/skills.js owns the bands, the 100 cap, the
// 700 cap and the lock that pays for a gain, and a failure teaches at half
// chance exactly as a missed swing does.
//
// ---- what the chance actually is -----------------------------------------
//
// 01-STATS-SKILLS gives the GAIN curve and no success curve, so this file has
// to invent one and say so. `successChance` is a straight line through the
// difficulty: even money and a little at the difficulty itself, certain 25
// points above it, hopeless 25 points below, clamped at 5% and 95% so no box
// is ever impossible and none is ever free. Difficulty is 20 a tier, so the
// Old Cellars' boxes are 20 and the Throne of Ash's are 100.
//
// ---- what it pays --------------------------------------------------------
//
// The realm's own danger tier decides. Two to four items out of a chest, one
// out of a cache, each rolled through `rollDrop` in src/mmo/loot.js, which is
// the same roll a kill goes through and the same class bias: a character whose
// skills are a smith's finds gear a smith can wear. Gold is the tier's band
// times three, because a box is worth more than the thing guarding it.
//
// ---- what is remembered --------------------------------------------------
//
// A box pays once, ever. `character.opened` is the list of keys, and a key is
// `<place>:<level>:<index>`, which is a function of the layout and therefore
// the same key every time that level is generated. The hydrate line state.js
// needs is quoted in docs/mmo/wiring/D3.md; until it is in, the list lives on
// the character in memory, so the whole path is real and only the reload is
// missing.

import { rollDrop, rollGold } from '../mmo/loot.js';
import { TIERS } from '../mmo/monsters.js';
import { itemBaseFor, describeItem, listText } from './loot_drops.js';
import { BASES, baseFor } from '../mmo/items.js';
import {strongholdChestAccess} from './stronghold_encounters.js';

/** Metres. The same arm's length `loot_drops.BAG_REACH` uses for a sack. */
export const CHEST_REACH = 3;
/** Difficulty of a lock and of the trap on it: twenty a tier. */
export const DIFFICULTY_PER_TIER = 20;
/** Health a sprung trap takes: eight a tier. */
export const TRAP_DAMAGE_PER_TIER = 8;
/** One failure in this many snaps the pick. */
export const PICK_BREAK_IN = 4;
/** Items in a chest, and in a cache. */
export const CHEST_ITEMS = [2, 4];
export const CACHE_ITEMS = [1, 1];
/** A box carries this many times a kill's gold at the same tier. */
export const GOLD_MULTIPLIER = 3;
/** The tool the lock wants. `items.js` bases it as a stacking kit tool. */
export const PICK_BASE = 'lockpick';

/**
 * What a box holds, as monster words, which `loot_drops.itemBaseFor` turns into
 * real bases at the tier: the armour goes up the material ladder and the metal
 * goes up the ore ladder with it. Written as words rather than ids for exactly
 * that reason: a tier 1 box holds a copper ingot and a cloth cap, a tier 5 box
 * holds coldiron and chain.
 */
export const CHEST_WORDS = [
  'gem', 'reagent', 'ingot', 'ring', 'amulet',
  'helm', 'tunic', 'greaves', 'boots', 'cloak',
  'longsword', 'dagger', 'maul', 'kite',
];

/** The same, for a cache: no gear, only what a miner leaves in a niche. */
export const CACHE_WORDS = ['gem', 'reagent', 'ingot', 'ore', 'ring'];

/** The bases a box of this tier can really hold. */
export function tableFor(tier, kind = 'chest') {
  const words = kind === 'cache' ? CACHE_WORDS : CHEST_WORDS;
  const out = [];
  for (const word of words) {
    const base = itemBaseFor(word, tier);
    if (base && BASES[base] && !out.includes(base)) out.push(base);
  }
  return out;
}

/**
 * The chance one attempt works. See the header: this is invented, and it is
 * invented here rather than in six call sites.
 */
export function successChance(skill, difficulty) {
  const s = Number.isFinite(skill) ? skill : 0;
  const d = Number.isFinite(difficulty) ? difficulty : 0;
  const p = 0.5 + (s - d) * 0.018;
  return Math.max(0.05, Math.min(0.95, p));
}

/** The difficulty of a box's lock, and of the trap on it. */
export const difficultyOf = (chest) => DIFFICULTY_PER_TIER * Math.max(1, Math.min(6, Math.round(chest?.tier || 1)));

/** The key a box is remembered by, ever. */
export function openedKey(chest) {
  if (!chest) return null;
  if (typeof chest.key === 'string' && chest.key) return chest.key;
  return `${chest.siteId || 'site'}:${chest.level || 1}:${chest.i ?? 0}`;
}

/** The words for a number of coins. */
const coinWord = (n) => `${n} coin${n === 1 ? '' : 's'}`;

/**
 * Every word a box can hold resolves to a real base at every tier, and the
 * tool the lock wants is a real base too. Run at load, for the same reason
 * `loot_drops.auditLootTables` is: a word that resolved to nothing would be a
 * chest that opened on an empty room and said it was full of treasure.
 */
export function auditChestTables() {
  const bad = [];
  if (!BASES[PICK_BASE]) bad.push(`the lock wants a "${PICK_BASE}" and items.js has no such base`);
  for (let tier = 1; tier <= 6; tier++) {
    for (const kind of ['chest', 'cache']) {
      const table = tableFor(tier, kind);
      const words = kind === 'cache' ? CACHE_WORDS : CHEST_WORDS;
      const unique = new Set(words.map((word) => itemBaseFor(word, tier)).filter(Boolean));
      if (table.length !== unique.size) {
        bad.push(`a tier ${tier} ${kind} resolves ${table.length} of ${unique.size} unique bases`);
      }
      for (const base of table) if (!baseFor(base)) bad.push(`tier ${tier} ${kind}: "${base}" is not a base`);
    }
    if (!TIERS[tier]) bad.push(`tier ${tier} has no gold band`);
  }
  // both directions on the chance: a hopeless roll and a certain one
  if (successChance(0, 100) > 0.06) bad.push('a hopeless lock is not hopeless');
  if (successChance(100, 20) < 0.94) bad.push('a trivial lock is not trivial');
  if (bad.length) throw new Error(`chests: ${bad.length} problem(s)\n  ${bad.join('\n  ')}`);
  return true;
}
auditChestTables();

/**
 * The runtime. Every dependency is optional: with none of them the numbers
 * still move and the words still come back on the result, which is what lets
 * chests.test.mjs drive the real code path with fakes.
 */
export function createChests({
  character, inventory, progression, combat, actor, hud, audio, floaters,
  runtime, loot, state, rng = Math.random,
} = {}) {
  const say = (text, kind) => { hud?.toast?.(text, kind); return text; };
  const cue = (name, opts) => { try { audio?.play?.(name, opts); } catch { /* a missing cue is not a reason to lose an item */ } };

  /** The character's own list of boxes already emptied. Made if it is missing. */
  function openedList() {
    if (!character) return [];
    if (!Array.isArray(character.opened)) character.opened = [];
    return character.opened;
  }

  const isOpened = (chest) => openedList().includes(openedKey(chest));

  /** How many lockpicks are in the pack, and where the first of them is. */
  function picksInPack() {
    const items = inventory?.pack?.items || character?.pack?.items || [];
    let count = 0, index = -1;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it) continue;
      const b = baseFor(it);
      if (!b || b.id !== PICK_BASE) continue;
      count += Math.max(1, Math.round(it.count || 1));
      if (index < 0) index = i;
    }
    return { count, index };
  }

  /** Snap one pick. Returns how many are left. */
  function breakPick() {
    const { count, index } = picksInPack();
    if (index < 0) return count;
    inventory?.remove?.(index, 1);
    return Math.max(0, count - 1);
  }

  const skillOf = (id) => {
    const v = character?.skills?.[id];
    return typeof v === 'number' && Number.isFinite(v) ? v : 0;
  };

  /** One lesson through the real path, so a box teaches what a swing teaches. */
  const teach = (skillId, difficulty, success) => progression?.lesson?.(skillId, difficulty, success, rng);

  const flat = (a, b) => (a && b ? Math.hypot((a.x ?? 0) - (b.x ?? 0), (a.z ?? 0) - (b.z ?? 0)) : 0);

  /**
   * What is in the box, rolled. Deterministic from the box's own key and the
   * seed, so a chest looked at twice in one session is the same chest.
   */
  function rollContents(chest, seed) {
    const tier = Math.max(1, Math.min(6, Math.round(chest.tier || 1)));
    const cache = chest.kind === 'cache';
    const [lo, hi] = cache ? CACHE_ITEMS : CHEST_ITEMS;
    const n = lo + Math.floor(rng() * (hi - lo + 1));
    const table = tableFor(tier, chest.kind);
    const items = [];
    for (let k = 0; k < n; k++) {
      const item = rollDrop({ table, tier, luck: 0, seed: (seed + k * 7919) | 0, profile: character });
      if (item) items.push(item);
    }
    const gold = rollGold(tier, rng) * GOLD_MULTIPLIER;
    return { items, gold };
  }

  /** Put the take in the pack, and say what would not fit. */
  function pay(chest, contents, at) {
    const took = [], left = [];
    for (const it of contents.items) {
      const r = inventory?.add?.(it, { quiet: true });
      if (r && r.added) took.push(it); else left.push(it);
    }
    if (contents.gold > 0 && character) {
      character.gold = (character.gold || 0) + contents.gold;
      state?.touch?.('gold');
    }
    // What the pack refused is not lost: it goes on the floor as a sack, the
    // one thing in this game that owns something lying on the ground.
    let bag = null;
    if (left.length) {
      bag = loot?.drop?.({ x: chest.x, y: chest.y ?? 0, z: chest.z }, { items: left, gold: 0 }) || null;
    }
    state?.touch?.('pack');
    return { took, left, bag, gold: contents.gold };
  }

  /** The line a paid box says. */
  function payWords(chest, res) {
    const noun = chest.kind === 'cache' ? 'The cache' : 'The chest';
    const got = res.took.length ? listText(res.took, 0) : '';
    const parts = [];
    if (got && res.gold > 0) parts.push(`${noun} holds ${got}, and ${coinWord(res.gold)}.`);
    else if (got) parts.push(`${noun} holds ${got}.`);
    else if (res.gold > 0) parts.push(`${noun} holds ${coinWord(res.gold)} and nothing else.`);
    else parts.push(`${noun} is empty, and somebody was here first.`);
    if (res.left.length) {
      const words = res.left.map((it) => describeItem(it)).join(', ');
      parts.push(res.bag
        ? `Your pack is full, so ${words} is in a sack at your feet.`
        : `Your pack is full, so ${words} stays in the box.`);
    }
    return parts.join(' ');
  }

  /**
   * Open one box. Returns everything that happened, so a test can prove it and
   * a caller can say more about it.
   *
   * @returns {{ ok, reason, said, trap, lock, took, left, gold, bag, opened }}
   */
  function open(chest, opts = {}) {
    const said = [];
    const out = (ok, reason) => ({
      ok, reason, said, trap: null, lock: null, took: [], left: [], gold: 0, bag: null,
      opened: isOpened(chest),
    });
    if (!chest) return out(false, 'nothing');

    if (isOpened(chest)) {
      said.push(say('This one stands open already, and you were the one who opened it.'));
      return out(false, 'already');
    }

    const at = opts.at || actor?.pos || null;
    if (at) {
      const d = flat(at, chest);
      if (d > (opts.reach ?? CHEST_REACH)) {
        said.push(say(`The ${chest.kind === 'cache' ? 'cache' : 'chest'} is ${Math.round(d)} m off, walk over to it.`));
        return out(false, 'too_far');
      }
    }

    const guarded=strongholdChestAccess(chest,character||{});
    if(guarded){said.push(say(guarded,'bad'));return out(false,'guarded');}
    const difficulty = difficultyOf(chest);
    const result = {
      ok: false, reason: '', said, trap: null, lock: null,
      took: [], left: [], gold: 0, bag: null, opened: false,
    };

    // ---- the trap -------------------------------------------------------
    if (chest.trapped) {
      const skill = skillOf('removeTrap');
      const chance = successChance(skill, difficulty);
      const beat = rng() < chance;
      chest.trapped = false;                       // sprung or drawn, it is spent
      teach('removeTrap', difficulty, beat);
      if (beat) {
        result.trap = { disarmed: true, damage: 0, chance };
        said.push(say('A needle on a spring, under the lip of the lid, and you have the spring.', 'good'));
        cue('pickup', { gain: 0.4 });
      } else {
        const dmg = TRAP_DAMAGE_PER_TIER * Math.max(1, Math.min(6, Math.round(chest.tier || 1)));
        let took = dmg;
        if (combat?.hurt && actor) took = combat.hurt(actor, dmg, { kind: 'damage' });
        else if (actor && Number.isFinite(actor.health)) {
          const before = actor.health;
          actor.health = Math.max(0, before - dmg);
          took = before - actor.health;
        }
        result.trap = { disarmed: false, damage: took, chance };
        said.push(say(`The needle goes into your hand before the lid moves, and takes ${took} off you.`, 'bad'));
        cue('denied');
      }
    }

    // ---- the lock -------------------------------------------------------
    if (chest.locked) {
      const { count } = picksInPack();
      if (count <= 0) {
        result.reason = 'no_pick';
        said.push(say('The lock wants a pick, and there is not one in your pack.', 'bad'));
        cue('denied');
        return result;
      }
      const skill = skillOf('lockpicking');
      const chance = successChance(skill, difficulty);
      const beat = rng() < chance;
      teach('lockpicking', difficulty, beat);
      if (beat) {
        chest.locked = false;
        result.lock = { picked: true, broke: false, left: count, chance };
        said.push(say('The lock turns, and the lid comes up an inch.', 'good'));
      } else {
        // one failure in four snaps the pick, and it is said out loud
        const snapped = rng() < 1 / PICK_BREAK_IN;
        const left = snapped ? breakPick() : count;
        result.lock = { picked: false, broke: snapped, left, chance };
        result.reason = 'locked';
        said.push(say(snapped
          ? `The pick snaps off in the lock. ${left === 0 ? 'That was your last one.' : `${left} left in the pack.`}`
          : 'The pick slips, and the lock stays where it is.', 'bad'));
        cue('denied');
        return result;
      }
    }

    // ---- what is in it ---------------------------------------------------
    const seed = ((opts.seed ?? 0) | 0) ^ hashKey(openedKey(chest));
    const contents = rollContents(chest, seed);
    const paid = pay(chest, contents, at);
    result.took = paid.took; result.left = paid.left; result.gold = paid.gold; result.bag = paid.bag;
    said.push(say(payWords(chest, paid), 'good'));
    cue(paid.took.length || paid.gold ? 'pickup' : 'denied', { gain: 0.6 });
    if (floaters?.spawn && paid.gold > 0 && at) floaters.spawn(at, `+${paid.gold}`, 'gold', { anchorKey: 'player' });

    // ---- and it is remembered -------------------------------------------
    const key = openedKey(chest);
    const list = openedList();
    if (key && !list.includes(key)) { list.push(key); state?.touch?.('opened'); }
    chest.opened = true;
    runtime?.dungeonScene?.openChest?.(chest);
    result.ok = true; result.opened = true;
    result.reason = result.reason || 'opened';
    return result;
  }

  return {
    open,
    isOpened,
    reach: CHEST_REACH,
    /** Every box on the level, with whether it has been emptied. Debug and the HUD. */
    list() {
      return (runtime?.dungeonChests?.() || []).map((c) => ({ ...c, opened: isOpened(c) }));
    },
    /** The keys this character has emptied. */
    opened: () => openedList().slice(),
    picksInPack,
  };
}

/** A stable 32 bit number from a key, so a box's roll is its own. */
function hashKey(key) {
  const s = String(key == null ? '' : key);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
