// What a kill leaves on the ground, and the ninety seconds you have to take it.
//
//   const drops = createLootDrops(sc, { floaters, hud, audio });
//   drops.drop(monster.pos, drops.rollFor(monsterRow, { luck, seed }));
//   drops.update(dt);                       // in the frame, with the floaters
//   const bag = drops.pick(raycaster);      // what is under the cursor
//   drops.take(bag, (items, gold) => inventory.takeAll(items, gold));
//
// The bag is a small sack lit in the colour of the best thing inside it, so a
// purple on the grass reads as a purple from across the field and a white does
// not pull you off your road. It turns, it bobs, and after 90 s it is gone,
// which is 05-WORLD-CONTENT's own number.
//
// GOLD ALONE IS NOT A SACK. A kill that left nothing but coin used to leave the
// same brown sack as a kill that left a sword, lit yellow, which is a UI saying
// "money" rather than money lying there. A bag with no items in it is drawn as
// the gold pile its amount deserves (`gold_piles.js`: a scatter, a mound or a
// heap), it does not spin, and it wears no rarity ring because there is no
// rarity in a coin. A bag that has BOTH keeps the sack, and a few coins lie
// beside it. `shapeOf` is the one place that decides, and `take` re-shapes the
// bag when what is left in it has changed the answer: take the sword out of a
// mixed bag and the coins that stay behind become a pile.
//
// TAKING IS A TRANSACTION, NOT A GIFT. `take` hands the contents to a handler
// and keeps whatever the handler REFUSED. A pack with two slots left takes two
// swords and the third stays in the sack, and the line says both halves. This
// is the whole reason `take` exists rather than an `open()` that empties the
// bag into the void: the pack is W3's and it is allowed to say no.
//
// ---------------------------------------------------------------------------
// The translation, and why it is here
// ---------------------------------------------------------------------------
// `src/mmo/monsters.js` writes each monster's loot table in plain words:
// `['bone', 'longsword', 'kite', 'helm']`. `src/mmo/loot.js` rolls a drop by
// handing one of those to `items.js`, and `items.js` has no base called 'bone',
// or 'helm', or 'tunic': its armour is `leather_head`, `chain_chest` and so on,
// one row per material and piece. Fifteen of the words the monster tables use
// name nothing at all, and `rollDrop` THROWS on the first of them.
//
// Neither of those files may be edited; both are right about their own half.
// So the join lives here, in the runtime, where joins belong: `itemBaseFor`
// turns a monster's word into an items.js base, choosing the armour material
// from the monster's tier so a goblin scout drops cloth and a bone knight drops
// ringmail.
//
// THE THREE HIDES RESOLVE AND STILL DO NOT DROP IN A SACK.
// `hide`, `thickHide` and `scaledHide` now have real bases in items.js, so
// `itemBaseFor` answers for them; a hide is nonetheless never in a monster's
// bag, because 03-ITEMS-LOOT gives hides to Skinning ("hide (any beast) ... by
// Skinning skill") and a wolf that dropped its hide in a sack would make the
// skill pointless. `SKINNING_WORDS` is that list and `tableFor` takes them out
// before the roll; `src/game/skinning.js` is the only way a hide reaches a
// pack. One word is still unjoined: `scroll`, a scribe's stock with no base.
// `auditLootTables()` runs at load and throws if that ever leaves a monster
// with an empty table, and `auditLootWords()` throws if a word other than the
// declared `UNJOINED` ones stops resolving.

import * as THREE from 'three';
import { MONSTERS, purseMultiplier } from '../mmo/monsters.js';
import { rollKill } from '../mmo/loot.js';
import {
  RARITY, RARITY_ORDER, RARITY_WORD, baseFor, BASES, LEATHER_BASE, MEAT_BASES, takesRarity,
  LOG_OF, ORE_OF, INGOT_OF,
} from '../mmo/items.js';
import { nameFor as affixNameFor } from '../mmo/affixes.js';
import { buildGoldPile, buildCoinScatter, tierFor } from './gold_piles.js';
import { buildLogPile, buildOreHeap, logsDrawn, chunksDrawn } from './log_piles.js';

/**
 * Words that take "some" rather than "a". Meat, bread and cheese are mass
 * nouns; "a venison" and "a bread" are the sort of line a UI writes and an
 * author does not. Kept here because this file is the one that speaks.
 */
export const MASS_NOUNS = /(^|\s)(meat|venison|mutton|bread|cheese|honey)$/i;

/**
 * Numbers you say rather than print. "four oak logs" is a sentence; "4 oak log"
 * is a spreadsheet. Past twelve the digits are easier to read than the words,
 * which is where every style guide draws the line and where this one does too.
 */
export const NUM_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six',
  'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
export const countWord = (n) => (n >= 0 && n < NUM_WORDS.length ? NUM_WORDS[n] : String(n));

/** True for the stacks that are spoken about by the pound rather than the piece. */
const isMassStack = (base, label) => {
  if (!base) return MASS_NOUNS.test(label);
  if (base.kinds?.includes('ore')) return true;            // "three copper ore"
  if (/wood$/i.test(base.name || '')) return true;         // Deadwood, Cactus Wood
  return MASS_NOUNS.test(label);
};
/** True for the material stacks that get spoken numbers: logs, ore and ingots. */
const isSpokenStack = (base) => !!base
  && (base.kinds?.includes('wood') || base.kinds?.includes('ore') || base.kinds?.includes('metal'));

/** Seconds a bag lies there. "Every drop is a bag on the ground for 90 s." */
export const BAG_SECONDS = 90;
/** Metres. "clickable within 3 m", 07-RUNTIME-CONTRACT. */
export const BAG_REACH = 3;

/** Monster tier to armour material, which is what `helm` and `tunic` become. */
export const ARMOUR_MATERIAL = { 1: 'cloth', 2: 'leather', 3: 'studded', 4: 'ring', 5: 'chain', 6: 'plate' };

/**
 * Monster tier to a metal and to a wood, the same shape and the same reason as
 * ARMOUR_MATERIAL above: `ingot`, `ore` and `wood` are words in a monster's
 * table and there is no generic ingot any more to hand back.
 *
 * The metals are `ores.js`'s own ladder with tin left out, because tin forges
 * nothing on its own. The woods are its four WOODS in tier order. Both are
 * AUTHORED joins: 03-ITEMS-LOOT says nothing about which beast carries which
 * metal, only that the ladder exists.
 */
export const METAL_TIER = { 1: 'copper', 2: 'copper', 3: 'iron', 4: 'silver', 5: 'coldiron', 6: 'voidrock' };
export const WOOD_TIER = { 1: 'oak', 2: 'oak', 3: 'ash', 4: 'ash', 5: 'heartwood', 6: 'ironbark' };
const tierIndex = (tier) => Math.min(6, Math.max(1, Math.round(Number(tier) || 1)));

// ---------------------------------------------------------------------------
// MEAT IS NEVER "MEAT".
//
// Sixteen monsters carry the word `meat` in their table and they all used to
// join to one base called `food`, so a giant rat, a bear and a harpy left the
// same grey stack. There is no `food` base any more, and there is no generic
// meat either: the word resolves to the meat of THAT beast.
//
// `MEAT_OF` is the row, per monster, and it wins over everything. `MEAT_BY_KIND`
// is the fallback for a monster added tomorrow, keyed on the `kind` field
// monsters.js already carries. Three kinds have no meat on them at all:
//
//   undead      a skeleton is bone and a wraith is not there
//   construct   an iron golem is ore
//   elemental   there is nothing to butcher
//
// and `humanoid` is left out on purpose. None of the three, and no humanoid,
// carries `meat` in its table today; the fallback exists so that when one does,
// it drops nothing rather than quietly becoming rat meat.
export const MEAT_OF = {
  // critters, tier 0. combat.js's own LOOT table already gives the deer venison
  // and everything else game meat, and this agrees with it word for word.
  deer: 'venison',
  rabbit: 'game_meat', squirrel: 'game_meat', gull: 'game_meat',
  frog: 'game_meat', crow: 'game_meat',
  fieldMouse: 'rat_meat',
  // the dungeon and the woods
  giantRat: 'rat_meat',
  caveBat: 'game_meat',
  crab: 'crab_meat',
  wolf: 'wolf_meat',
  boar: 'boar_meat',
  direWolf: 'wolf_meat',
  harpy: 'game_meat',
  stonebackBear: 'bear_meat',
  werewolf: 'wolf_meat',
};

/** The fallback, by the monster's own `kind`. Null means this thing has no meat. */
export const MEAT_BY_KIND = {
  critter: 'game_meat',
  vermin: 'rat_meat',
  flying: 'game_meat',
  beast: 'game_meat',
  humanoid: null,
  undead: null,
  construct: null,
  elemental: null,
};

/**
 * Which meat this monster leaves, or null when it has none.
 * `monster` is a row or an id; without one there is no answer, because "meat"
 * on its own is exactly the generic item this game no longer has.
 */
export function meatFor(monster) {
  const m = typeof monster === 'string' ? MONSTERS[monster] : monster;
  if (!m) return null;
  if (MEAT_OF[m.id]) return MEAT_OF[m.id];
  const byKind = MEAT_BY_KIND[m.kind];
  return byKind || null;
}

/**
 * A monster's word for a drop, turned into an items.js base id. `tier` picks
 * the armour material. A null means "no honest base exists for this yet", and
 * the caller leaves it out of the roll.
 */
export function itemBaseFor(word, tier = 1, monster = null) {
  const mat = ARMOUR_MATERIAL[Math.min(6, Math.max(1, Math.round(tier)))] || 'leather';
  switch (word) {
    // materials that already are bases
    case 'gem': case 'reagent': return word;
    // G9 split the one grey stack into a named metal, a named vein and a named
    // wood, so a monster's word has to say WHICH. There is no more honest
    // answer than the ladder the rest of this file already uses for armour:
    // a tier 1 raider carries copper, a tier 6 thing carries voidrock.
    case 'ingot': return INGOT_OF[METAL_TIER[tierIndex(tier)]];
    case 'ore': return ORE_OF[METAL_TIER[tierIndex(tier)]];
    case 'wood': return LOG_OF[WOOD_TIER[tierIndex(tier)]];
    // The meat of the beast that dropped it, or nothing. Null without a
    // monster: there is no such item as "meat", so there is no honest answer
    // to the word on its own. `tableFor` and `auditLootWords` both pass one.
    case 'meat': return meatFor(monster);
    // 05-WORLD-CONTENT: the necromancer "sells bone reagents". Bone is a reagent.
    case 'bone': return 'reagent';
    // armour, by piece, in the material the tier wears
    case 'helm': return `${mat}_head`;
    case 'tunic': case 'breastplate': return `${mat}_chest`;
    case 'greaves': return `${mat}_legs`;
    case 'boots': return `${mat}_feet`;
    case 'cloak': return `${mat}_back`;
    // a robe is cloth by definition; items.js tags cloth_chest as the robe
    case 'robe': return 'cloth_chest';
    case 'throwingKnives': return 'throwing_knives';
    // Skinning's three, which resolve so the knife can hand one over, and are
    // filtered out of the sack by `tableFor`.
    case 'hide': case 'thickHide': case 'scaledHide': return LEATHER_BASE[word];
    // no base yet: the scribe's stock
    case 'scroll': return null;
    default: return baseFor(word) ? word : null;
  }
}

/** The words a knife takes off a body. Never in a sack; see the header. */
export const SKINNING_WORDS = ['hide', 'thickHide', 'scaledHide'];
/** Best first, so a bone dragon gives scales rather than plain hide. */
export const SKINNING_ORDER = ['scaledHide', 'thickHide', 'hide'];
/** Words the join still cannot answer for. Kept as a list so it can shrink. */
export const UNJOINED = ['scroll'];

/**
 * The hide word on a monster's own row, or null. The row is the source: a
 * bone dragon is undead and carries `scaledHide`, and its own table wins over
 * any rule about families.
 */
export function skinWordFor(monster) {
  const m = typeof monster === 'string' ? MONSTERS[monster] : monster;
  const table = m && Array.isArray(m.lootTable) ? m.lootTable : [];
  for (const w of SKINNING_ORDER) if (table.includes(w)) return w;
  return null;
}

/** A monster's loot table as items.js bases, with the untranslatable left out. */
export function tableFor(monster) {
  const m = typeof monster === 'string' ? MONSTERS[monster] : monster;
  if (!m || !Array.isArray(m.lootTable)) return [];
  const out = [];
  for (const word of m.lootTable) {
    if (SKINNING_WORDS.includes(word)) continue;      // a knife's, not a sack's
    const base = itemBaseFor(word, m.tier, m);
    if (base && BASES[base] && !out.includes(base)) out.push(base);
  }
  return out;
}

/**
 * Every monster that is supposed to drop something still can, and every base
 * the translation produces is a real one. Runs at load, like the audits in
 * `combat.js` and `fauna.js`. A monster whose whole table falls through the
 * translation would drop only gold for ever and nobody would notice.
 */
export function auditLootTables() {
  const bad = [];
  for (const m of Object.values(MONSTERS)) {
    if (m.tier === 0) continue;                       // critters give meat by Skinning, not by bag
    if (!m.lootTable || !m.lootTable.length) { bad.push(`${m.id} has no loot table`); continue; }
    const t = tableFor(m);
    if (!t.length) bad.push(`${m.id} drops nothing the pack could hold (${m.lootTable.join(', ')})`);
    for (const b of t) if (!BASES[b]) bad.push(`${m.id} would drop "${b}", which is not a base`);
  }
  if (bad.length) throw new Error(`loot_drops: ${bad.join('; ')}`);
  return true;
}
auditLootTables();

/**
 * Every word in every monster table joins to a real base, or is one of the
 * `UNJOINED` few that are named out loud. The other audit only proves a
 * monster is not left empty handed; this one proves no single word has gone
 * quiet, which is how `hide` sat unjoined for a wave without anybody noticing.
 */
export function auditLootWords() {
  const bad = [];
  const words = new Set();
  const meats = new Set();
  // Walked monster by monster rather than word by word, because `meat` no
  // longer has one answer: it has the answer this monster gives. A word is
  // checked against its own monster's tier AND against the two ends of the
  // material ladder, so a rename in the armour tiers is still caught.
  for (const m of Object.values(MONSTERS)) {
    for (const w of (m.lootTable || [])) {
      words.add(w);
      if (UNJOINED.includes(w)) continue;
      for (const tier of [m.tier || 1, 1, 6]) {
        const base = itemBaseFor(w, tier, m);
        if (!base || !BASES[base]) {
          bad.push(`${m.id}: "${w}" at tier ${tier} joins to ${base === null ? 'nothing' : `"${base}"`}`);
        }
      }
      if (w === 'meat') meats.add(itemBaseFor('meat', m.tier, m));
    }
  }
  // A monster whose word is `meat` must resolve to a real meat base, and never
  // to a generic one. There is no generic one, so the check is that every meat
  // that resolved is in the list items.js keeps.
  for (const id of meats) {
    if (!MEAT_BASES.includes(id)) bad.push(`the word "meat" resolved to "${id}", which is not one of the ${MEAT_BASES.length} meats`);
  }
  if (bad.length) throw new Error(`loot_drops: ${bad.join('; ')}`);
  return { words: words.size, unjoined: UNJOINED.length, meats: meats.size };
}
auditLootWords();

/**
 * What one kill leaves: gold in the tier's range, and an item or nothing.
 * Tier 5 champions "always roll loot twice"; a boss rolls twice with a purple
 * floor. Both of those are `loot.js`'s own rules, asked for by name here.
 *
 * THE CHARACTER, and why it is an option rather than an argument.
 *
 * `opts.character` is the whole player document. Handed one, `loot.rollKill`
 * works the class profile out of its skills and its STR and biases the gear
 * rolls 60/40 towards it, 80/20 off a boss; and a realm boss can leave its
 * signature unique, once per character for ever, recorded on
 * `character.uniques`. Handed nothing, this is the roll it always was, bit for
 * bit, which loot.test.mjs proves against the pre-change module over 40,000
 * seeded comparisons.
 *
 * It is optional because one of the three callers legitimately has no
 * character: an audit rolls tables, not players. The two that DO have one are
 * named in docs/mmo/wiring/L1.md with the exact line to add, because neither
 * of their files belongs to this agent.
 *
 * The unique comes FIRST in `items`, so `bagColour` lights the sack off the
 * thing that deserves it and `labelFor` names it first.
 */
export function rollFor(monster, { luck = 0, seed = 0, character = null, profile = undefined } = {}) {
  const m = typeof monster === 'string' ? MONSTERS[monster] : monster;
  if (!m) return { gold: 0, items: [] };
  const table = tableFor(m);
  const { gold: banded, item, unique, bias } = rollKill({
    table, tier: m.tier, luck, seed,
    boss: !!m.boss, twice: m.tier === 5,
    character, monster: m, profile,
  });
  // `coinPurse`. Until M5 the tag was carried by the bandit, the raider and two
  // bosses and read by NOTHING: a bandit's purse was a rat's purse. The roster
  // owns the number (the row's own `purse`, or its DEFAULT_PURSE), and this is
  // the one line that spends it, because this is the one place a kill turns
  // into a sack. Everything without the tag multiplies by 1 and is bit for bit
  // the roll it always was.
  const gold = Math.round(banded * purseMultiplier(m));
  const items = [];
  if (unique) items.push(unique);
  if (item) items.push(item);
  return { gold, items, unique: unique || null, bias };
}

/** The rarity colour of the best thing in a list, or gold for a purse. */
export function bagColour(items = [], gold = 0) {
  let best = -1;
  for (const it of items) {
    // A sack lit by a carrot would be a white sack that is not advertising a
    // white item. Only things rarity applies to have a say in the colour; a
    // sack of nothing but food falls through to gold or to plain white below.
    if (!takesRarity(it)) continue;
    const i = RARITY_ORDER.indexOf(it && it.rarity);
    if (i > best) best = i;
  }
  if (best < 0) return gold > 0 ? '#ffcf40' : RARITY.common.colour;
  return RARITY[RARITY_ORDER[best]].colour;
}

/**
 * What to call an item out loud. An unidentified thing is named by its colour,
 * which is exactly how `items.js` writes it: "a green longsword". A common one
 * is just what it is.
 *
 * A SIGNATURE UNIQUE IS CALLED BY ITS NAME. Blackhand's Answer is a longsword
 * and nobody who found it would say "a longsword". `loot.makeUnique` writes
 * `uniqueName` onto the record and it is the one label that outranks both the
 * base and the rolled affix name; `affixes.identify` rewrites `name` and never
 * touches `uniqueName`, so it survives being read. There is no article: it is
 * a proper noun.
 */
export function describeItem(item) {
  if (!item) return 'nothing';
  if (item.uniqueName) return String(item.uniqueName);
  const b = baseFor(item);
  const name = (b ? b.name : item.base || 'thing').toLowerCase();
  const label = item.identified
    ? (affixNameFor(item).toLowerCase() || name)
    : name;   // unidentified: the base alone; the colour is seen, not said
  const mass = isMassStack(b, label);
  if (item.count > 1) {
    // "four oak logs", not "4 oak log". Logs, ore and ingots are the stacks a
    // player is told about by the handful, so they are the ones that get the
    // spoken number and the plural; everything else keeps the old shape.
    if (isSpokenStack(b)) return `${countWord(item.count)} ${label}${mass ? '' : 's'}`;
    return `${item.count} ${label}`;
  }
  // "a venison" is not a thing anybody says. Meat is a mass noun, and so are
  // bread, cheese, ore and deadwood: they take "some".
  if (mass) return `some ${label}`;
  return `${/^[aeiou]/i.test(label) ? 'an' : 'a'} ${label}`;
}

/** "14 gold, a green longsword and a leather helm". Never a comma too many. */
export function listText(items = [], gold = 0) {
  const parts = [];
  if (gold > 0) parts.push(`${gold} gold`);
  for (const it of items) parts.push(describeItem(it));
  if (!parts.length) return 'nothing';
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/**
 * What the cursor calls a bag. "a pile of 46 gold" for coin on its own, and
 * "a sack: an iron longsword and 12 gold" for anything with gear in it. The
 * items come first and the gold last, which is the order a person reads a
 * sack in: what is it, and how much was with it.
 */
export function labelFor(bag) {
  if (!bag) return 'nothing';
  const items = (bag.items || []).filter(Boolean);
  const gold = Math.max(0, Math.round(bag.gold || 0));
  if (!items.length) return gold > 0 ? `a pile of ${gold} gold` : 'an empty sack';
  // A woodpile is not a sack and the cursor should not call it one: what is
  // lying there is four oak logs, and that is the whole of the label.
  const shape = shapeOf(items, gold);
  if (shape.startsWith('logs:') || shape.startsWith('ore:')) return items.map(describeItem).join(' and ');
  const parts = items.map(describeItem);
  if (gold > 0) parts.push(`${gold} gold`);
  const list = parts.length === 1
    ? parts[0]
    : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return `a sack: ${list}`;
}

/**
 * What a bag looks like, from what is in it. Coin alone is a pile of the size
 * its amount earns; anything with gear in it is a sack, with a coin scatter
 * beside it when there is money too.
 */
/**
 * The wood or the ore a bag is entirely made of, or null. A felled oak leaves
 * one stack of one species and nothing else, which is the case this answers;
 * a sack with a sword and a log in it is a sack, and says so.
 */
export function loneMaterial(items = [], tag) {
  const list = (items || []).filter(Boolean);
  if (!list.length) return null;
  let mat = null, count = 0;
  for (const it of list) {
    const b = baseFor(it);
    if (!b || !b.kinds?.includes(tag) || !b.material) return null;
    if (mat && b.material !== mat) return null;             // two woods is a sack
    mat = b.material;
    count += it.count ?? 1;
  }
  return { material: mat, count };
}

export function shapeOf(items = [], gold = 0) {
  const n = (items || []).filter(Boolean).length;
  if (!n) return gold > 0 ? `pile:${tierFor(gold)}` : 'empty';
  if (!(gold > 0)) {
    // A pile of cut logs and a heap of broken ore are what the axe and the pick
    // actually leave on the ground, and neither of them is a sack. Money in
    // with them makes it a sack again: coins do not lie loose in a woodpile.
    const wood = loneMaterial(items, 'wood');
    if (wood) return `logs:${wood.material}`;
    const ore = loneMaterial(items, 'ore');
    if (ore) return `ore:${ore.material}`;
  }
  return gold > 0 ? 'sack+coins' : 'sack';
}

/**
 * What the bag LOOKS like, which is not the same question as what shape it is.
 *
 * A pile of five fir logs that gives up three is still `logs:fir`, and the mesh
 * on the ground would happily go on showing five. `shapeOf` is the answer to
 * "sack or pile"; this is the answer to "does the picture have to change", and
 * it is what `reshape` compares. Gold is the exception it always was: a pile
 * redraws when its TIER moves, because a heap losing four coins should not
 * rebuild its geometry every time somebody takes a handful.
 */
export function lookOf(items = [], gold = 0) {
  const shape = shapeOf(items, gold);
  if (shape.startsWith('logs:')) return `${shape}:${logsDrawn(loneMaterial(items, 'wood')?.count || 1)}`;
  if (shape.startsWith('ore:')) return `${shape}:${chunksDrawn(loneMaterial(items, 'ore')?.count || 1)}`;
  return shape;
}

// ------------------------------------------------------------------ runtime

/**
 * The loot layer this session is using.
 *
 * There is exactly one of these in a running game (`main.js` builds it once),
 * and `interact.js` needs it in order to leave a pile of logs at a stump. The
 * clean wiring is to pass it in, and `createInteract` takes a `loot` argument
 * for exactly that; but `main.js` belongs to another agent and builds interact
 * without one, so this registry is what makes the axe really leave wood on the
 * ground today instead of a to-do in a document.
 *
 * The same pattern `tree_edit.js` uses for its fields. `dispose()` clears it, so
 * a torn down scene does not leave a dead group behind for the next one.
 */
let currentDropsInstance = null;
export const currentDrops = () => currentDropsInstance;

/** How tall the shaft of light over a drop is, in metres. Above the grass, below the eye. */
export const BEAM_HEIGHT = 1.6;

export function createLootDrops(sc, { floaters, hud, audio } = {}) {
  const scene = sc && sc.scene ? sc.scene : sc;
  const group = new THREE.Group();
  group.name = 'loot-bags';
  scene?.add?.(group);

  const bags = [];
  let nextId = 1;

  const say = (text, kind) => {
    if (!text) return;
    if (typeof hud?.log === 'function') hud.log(text, kind);
    else hud?.toast?.(text, kind);
  };

  const sackGeo = new THREE.BoxGeometry(0.32, 0.28, 0.32);
  const tieGeo = new THREE.BoxGeometry(0.14, 0.12, 0.14);
  const ringGeo = new THREE.TorusGeometry(0.3, 0.02, 4, 12);
  // The beacon: a shaft of light over every drop, so gold in knee-high grass
  // and a sack behind a boulder are still findable from ten metres. Additive,
  // fading to nothing at the top, coloured like the best thing in the bag.
  const beamGeo = new THREE.CylinderGeometry(0.05, 0.16, BEAM_HEIGHT, 10, 1, true);
  beamGeo.translate(0, BEAM_HEIGHT / 2, 0);
  function beamMaterial(hex) {
    return new THREE.ShaderMaterial({
      uniforms: { uColour: { value: hex.clone() }, uFade: { value: 1 } },
      vertexShader: 'varying float vT; void main(){ vT = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform vec3 uColour; uniform float uFade; varying float vT;\n'
        + 'void main(){ float a = (1.0 - vT) * (1.0 - vT) * 0.7 * uFade; gl_FragColor = vec4(uColour * 1.25, a); }',
      // normal blending, not additive: an additive gold over green grass came
      // out lemon. Over the grass this reads as the colour it was given.
      transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    });
  }

  /**
   * The body of a bag. `shape` decides whether that is a sack, a sack with a
   * few coins beside it, or a pile of gold and nothing else. Whatever it is,
   * the raycaster meets the same invisible cylinder, so nothing about picking
   * a bag up depends on what is in it.
   */
  function build(colour, items = [], gold = 0, seed = 0) {
    const g = new THREE.Group();
    const hex = new THREE.Color(colour);
    const shape = shapeOf(items, gold);
    const mats = [];
    let ring = null, sack = null, pile = null;
    const beam = new THREE.Mesh(beamGeo, beamMaterial(hex));
    beam.name = 'loot-beam';
    beam.renderOrder = 5;
    g.add(beam);

    if (shape.startsWith('pile:')) {
      pile = buildGoldPile(gold, { seed });
      if (pile) { g.add(pile); mats.push(pile.material); }
    } else if (shape.startsWith('logs:')) {
      const wood = loneMaterial(items, 'wood');
      pile = buildLogPile(shape.slice(5), wood ? wood.count : 1, { seed });
      if (pile) { g.add(pile); mats.push(pile.material); }
    } else if (shape.startsWith('ore:')) {
      const ore = loneMaterial(items, 'ore');
      pile = buildOreHeap(shape.slice(4), ore ? ore.count : 1, { seed });
      if (pile) { g.add(pile); mats.push(pile.material); }
    } else {
      const cloth = new THREE.MeshStandardMaterial({ color: 0x6b5a42, roughness: 1, metalness: 0, flatShading: true, emissive: hex, emissiveIntensity: 0.55 });
      const glow = new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.75 });
      sack = new THREE.Mesh(sackGeo, cloth);
      sack.position.y = 0.16;
      sack.castShadow = true;
      const tie = new THREE.Mesh(tieGeo, cloth);
      tie.position.y = 0.36;
      ring = new THREE.Mesh(ringGeo, glow);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.06;
      g.add(sack, tie, ring);
      mats.push(cloth, glow);
      if (shape === 'sack+coins') {
        // beside it, not under it: the sack is the subject and the coins are
        // the note that there was money in the purse as well
        pile = buildCoinScatter(gold, { seed });
        if (pile) { pile.position.set(0.26, 0, 0.12); g.add(pile); mats.push(pile.material); }
      }
    }
    // the thing the raycaster actually meets, so a sack in long grass is still
    // a target the size of a footstool, and a pile of coins is not a target the
    // size of a coin
    const hit = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.5, 0.9, 6),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    hit.position.y = sack ? 0.45 : 0.3;
    g.add(hit);
    return { g, ring, sack, pile, hit, beam, mats, shape, look: lookOf(items, gold) };
  }

  /**
   * Put a bag down. Says nothing on its own: the kill that caused it is what
   * speaks, and a line per sack in a fight with five skeletons is noise.
   *
   * @param pos  { x, y, z } where the body fell
   * @param what { items, gold }
   * @returns the bag, or null when there was nothing to leave
   */
  function drop(pos, { items = [], gold = 0 } = {}) {
    const list = items.filter(Boolean);
    if (!list.length && !(gold > 0)) return null;
    const coin = Math.max(0, Math.round(gold));
    const seed = nextId * 2654435761;
    const built = build(bagColour(list, coin), list, coin, seed);
    built.g.position.set(pos?.x ?? 0, pos?.y ?? 0, pos?.z ?? 0);
    group.add(built.g);
    const bag = {
      id: nextId++, items: list, gold: coin, seed,
      pos: built.g.position, age: 0, node: built.g, ring: built.ring, beam: built.beam, mats: built.mats,
      shape: built.shape, look: built.look, spin: Math.random() * Math.PI * 2,
    };
    built.g.userData.bag = bag;
    built.hit.userData.bag = bag;
    bags.push(bag);
    return bag;
  }

  function tearDown(node, mats) {
    node.traverse((o) => {
      if (o.geometry && o.geometry !== sackGeo && o.geometry !== tieGeo && o.geometry !== ringGeo && o.geometry !== beamGeo) o.geometry.dispose();
      if (o.name === 'loot-beam') o.material.dispose();
    });
    for (const m of mats) m.dispose();
  }

  function remove(bag) {
    const i = bags.indexOf(bag);
    if (i >= 0) bags.splice(i, 1);
    group.remove(bag.node);
    tearDown(bag.node, bag.mats);
  }

  /**
   * What is left in a bag is not always the same SHAPE as what was in it. Take
   * the sword out of a sack of a sword and thirty gold and what stays is a pile
   * of gold; take the gold out and the coins beside the sack have to go. Rebuilt
   * in place, at the same spot, with the same id and the same age, so nothing
   * that is holding this bag notices anything but the picture changing.
   */
  function reshape(bag) {
    const want = lookOf(bag.items, bag.gold);
    if (want === bag.look) return false;
    const old = { node: bag.node, mats: bag.mats };
    const built = build(bagColour(bag.items, bag.gold), bag.items, bag.gold, bag.seed);
    built.g.position.copy(bag.pos);
    group.add(built.g);
    group.remove(old.node);
    tearDown(old.node, old.mats);
    bag.node = built.g; bag.ring = built.ring; bag.beam = built.beam; bag.mats = built.mats;
    bag.shape = built.shape; bag.look = built.look;
    bag.pos = built.g.position;
    built.g.userData.bag = bag;
    built.hit.userData.bag = bag;
    return true;
  }

  /** What is under the ray, or null. Same shape as `runtime.pick`'s answers. */
  function pick(raycaster) {
    if (!raycaster || !bags.length) return null;
    const hits = raycaster.intersectObjects(group.children, true);
    for (const h of hits) {
      let o = h.object;
      for (let n = 0; o && n < 6; n++, o = o.parent) {
        if (o.userData && o.userData.bag && bags.includes(o.userData.bag)) return o.userData.bag;
      }
    }
    return null;
  }

  /** The nearest bag within reach of a point, for a key press rather than a click. */
  function nearest(pos, range = BAG_REACH) {
    let best = null, bd = range;
    for (const b of bags) {
      const d = Math.hypot(b.pos.x - (pos?.x ?? 0), b.pos.z - (pos?.z ?? 0));
      if (d <= bd) { bd = d; best = b; }
    }
    return best;
  }

  /**
   * Open a bag. `handler(items, gold)` is whoever owns the pack; what it
   * RETURNS is what it took:
   *
   *   undefined or true   everything, which is the easy case
   *   false               nothing, and the bag stays exactly as it was
   *   { items, gold }     what it could fit, and the rest stays in the sack
   *
   * Always says what went in, and always says what did not, because a sword
   * that silently stayed on the ground is a sword the player thinks they have.
   */
  function take(bag, handler) {
    if (!bag || !bags.includes(bag)) return { taken: [], gold: 0, left: [], reason: 'gone' };
    const offerItems = bag.items.slice(), offerGold = bag.gold;
    let res;
    try { res = typeof handler === 'function' ? handler(offerItems, offerGold) : undefined; }
    catch (e) { res = false; }

    let tookItems, tookGold;
    if (res === false) { tookItems = []; tookGold = 0; }
    else if (res === undefined || res === true || res === null) { tookItems = offerItems; tookGold = offerGold; }
    else {
      tookItems = Array.isArray(res.items) ? offerItems.filter((it) => res.items.includes(it)) : [];
      tookGold = Math.max(0, Math.min(offerGold, Math.round(Number(res.gold) || 0)));
    }

    bag.items = bag.items.filter((it) => !tookItems.includes(it));
    bag.gold -= tookGold;

    const left = bag.items.slice();
    if (tookGold > 0 || tookItems.length) {
      say(`${listText(tookItems, tookGold)} in the pack`);
      audio?.play?.(tookGold > 0 && !tookItems.length ? 'sell' : 'pickup', { at: { x: bag.pos.x, z: bag.pos.z } });
      if (tookGold > 0) floaters?.spawn?.(bag.pos, `+${tookGold} gold`, 'gold');
      for (const it of tookItems) {
        floaters?.spawn?.(bag.pos, describeItem(it), 'loot', { color: RARITY[it.rarity]?.colour });
      }
    }
    if (left.length || bag.gold > 0) {
      say(`${listText(left, bag.gold)} stays in the sack, there is no room for it`);
      audio?.play?.('denied');
      // What is left may not be the same thing to look at any more: a sack that
      // gave up its sword is a pile of coins now, and a pile that gave up half
      // its gold may be a smaller pile. Rebuild first, then recolour whatever
      // sack is still standing there.
      reshape(bag);
      const colour = new THREE.Color(bagColour(left, bag.gold));
      if (bag.beam) bag.beam.material.uniforms.uColour.value.copy(colour);
      if (bag.ring) {
        for (const m of bag.mats) {
          if (m.isMeshStandardMaterial && m.emissive && !m.vertexColors) m.emissive.copy(colour);
          else if (m.isMeshBasicMaterial) m.color.copy(colour);
        }
      }
    } else {
      remove(bag);
    }
    return { taken: tookItems, gold: tookGold, left, emptied: !bags.includes(bag) };
  }

  /**
   * Every frame. Bobs and turns the sacks, and takes away the ones whose 90 s
   * are up. An expiry says nothing: if anybody had been standing there it
   * would have been picked up.
   */
  function update(dt) {
    const d = Math.max(0, Number.isFinite(dt) ? dt : 0);
    for (let i = bags.length - 1; i >= 0; i--) {
      const b = bags[i];
      b.age += d;
      if (b.age >= BAG_SECONDS) { remove(b); continue; }
      b.spin += d * 1.2;
      // A sack turns. Coins on the ground do not: gold that spun where it fell
      // would read as a pickup icon rather than as money lying in the grass.
      if (b.ring) b.node.rotation.y = b.spin;
      b.node.position.y = b.pos.y;
      if (b.ring) {
        b.ring.rotation.z = b.spin * 2;
        b.ring.scale.setScalar(1 + Math.sin(b.age * 3) * 0.08);
      }
      // the last ten seconds it fades, so a bag about to go says so
      const fade = b.age > BAG_SECONDS - 10 ? 1 - (b.age - (BAG_SECONDS - 10)) / 10 : 1;
      if (b.beam) {
        // it breathes, and for the first half second it grows out of the ground
        const grow = Math.min(1, b.age * 2);
        b.beam.scale.set(1, grow, 1);
        b.beam.material.uniforms.uFade.value = fade * (0.8 + 0.2 * Math.sin(b.age * 2.2));
      }
      for (const m of b.mats) {
        if (m.vertexColors) m.opacity = fade;          // the gold, which is opaque until it goes
        else if (m.transparent) m.opacity = 0.75 * fade;
        else if (m.emissive) m.emissiveIntensity = 0.55 * fade;
      }
    }
  }

  const api = {
    group, drop, pick, take, update, nearest, rollFor,
    /** What the cursor should say about this bag. */
    labelFor,
    /** 'pile:<tier>' | 'logs:<wood>' | 'ore:<vein>' | 'sack' | 'sack+coins'. */
    shapeOf: (bag) => (bag ? shapeOf(bag.items, bag.gold) : 'empty'),
    /** Every bag on the ground right now. */
    bags: () => bags.slice(),
    get count() { return bags.length; },
    /** Seconds left before this bag goes. */
    remaining: (bag) => Math.max(0, BAG_SECONDS - (bag?.age ?? BAG_SECONDS)),
    clear() { for (const b of [...bags]) remove(b); },
    dispose() {
      this.clear();
      sackGeo.dispose(); tieGeo.dispose(); ringGeo.dispose();
      scene?.remove?.(group);
      if (currentDropsInstance === api) currentDropsInstance = null;
    },
  };
  currentDropsInstance = api;
  return api;
}
