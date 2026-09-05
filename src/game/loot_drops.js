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
import { MONSTERS } from '../mmo/monsters.js';
import { rollKill } from '../mmo/loot.js';
import { RARITY, RARITY_ORDER, RARITY_WORD, baseFor, BASES, LEATHER_BASE, MEAT_BASES, takesRarity } from '../mmo/items.js';
import { nameFor as affixNameFor } from '../mmo/affixes.js';
import { buildGoldPile, buildCoinScatter, tierFor } from './gold_piles.js';

/**
 * Words that take "some" rather than "a". Meat, bread and cheese are mass
 * nouns; "a venison" and "a bread" are the sort of line a UI writes and an
 * author does not. Kept here because this file is the one that speaks.
 */
export const MASS_NOUNS = /(^|\s)(meat|venison|mutton|bread|cheese|honey)$/i;

/** Seconds a bag lies there. "Every drop is a bag on the ground for 90 s." */
export const BAG_SECONDS = 90;
/** Metres. "clickable within 3 m", 07-RUNTIME-CONTRACT. */
export const BAG_REACH = 3;

/** Monster tier to armour material, which is what `helm` and `tunic` become. */
export const ARMOUR_MATERIAL = { 1: 'cloth', 2: 'leather', 3: 'studded', 4: 'ring', 5: 'chain', 6: 'plate' };

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
    case 'ingot': case 'ore': case 'gem': case 'reagent': return word;
    case 'wood': return 'log';
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
 */
export function rollFor(monster, { luck = 0, seed = 0 } = {}) {
  const m = typeof monster === 'string' ? MONSTERS[monster] : monster;
  if (!m) return { gold: 0, items: [] };
  const table = tableFor(m);
  const { gold, item } = rollKill({
    table, tier: m.tier, luck, seed,
    boss: !!m.boss, twice: m.tier === 5,
  });
  return { gold, items: item ? [item] : [] };
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
 */
export function describeItem(item) {
  if (!item) return 'nothing';
  const b = baseFor(item);
  const name = (b ? b.name : item.base || 'thing').toLowerCase();
  const label = item.identified
    ? (affixNameFor(item).toLowerCase() || name)
    : (item.rarity && item.rarity !== 'common' ? `${RARITY_WORD[item.rarity]} ${name}` : name);
  if (item.count > 1) return `${item.count} ${label}`;
  // "a venison" is not a thing anybody says. Meat is a mass noun and so is
  // bread and cheese: they take "some". Everything else keeps its article.
  if (MASS_NOUNS.test(label)) return `some ${label}`;
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
export function shapeOf(items = [], gold = 0) {
  const n = (items || []).filter(Boolean).length;
  if (!n) return gold > 0 ? `pile:${tierFor(gold)}` : 'empty';
  return gold > 0 ? 'sack+coins' : 'sack';
}

// ------------------------------------------------------------------ runtime

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

    if (shape.startsWith('pile:')) {
      pile = buildGoldPile(gold, { seed });
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
    return { g, ring, sack, pile, hit, mats, shape };
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
      pos: built.g.position, age: 0, node: built.g, ring: built.ring, mats: built.mats,
      shape: built.shape, spin: Math.random() * Math.PI * 2,
    };
    built.g.userData.bag = bag;
    built.hit.userData.bag = bag;
    bags.push(bag);
    return bag;
  }

  function tearDown(node, mats) {
    node.traverse((o) => { if (o.geometry && o.geometry !== sackGeo && o.geometry !== tieGeo && o.geometry !== ringGeo) o.geometry.dispose(); });
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
    const want = shapeOf(bag.items, bag.gold);
    if (want === bag.shape) return false;
    const old = { node: bag.node, mats: bag.mats };
    const built = build(bagColour(bag.items, bag.gold), bag.items, bag.gold, bag.seed);
    built.g.position.copy(bag.pos);
    group.add(built.g);
    group.remove(old.node);
    tearDown(old.node, old.mats);
    bag.node = built.g; bag.ring = built.ring; bag.mats = built.mats; bag.shape = built.shape;
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
      for (const m of b.mats) {
        if (m.vertexColors) m.opacity = fade;          // the gold, which is opaque until it goes
        else if (m.transparent) m.opacity = 0.75 * fade;
        else if (m.emissive) m.emissiveIntensity = 0.55 * fade;
      }
    }
  }

  return {
    group, drop, pick, take, update, nearest, rollFor,
    /** What the cursor should say about this bag. */
    labelFor,
    /** 'pile:small' | 'pile:medium' | 'pile:large' | 'sack' | 'sack+coins'. */
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
    },
  };
}
