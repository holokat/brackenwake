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
import { RARITY, RARITY_ORDER, RARITY_WORD, baseFor, BASES, LEATHER_BASE } from '../mmo/items.js';
import { nameFor as affixNameFor } from '../mmo/affixes.js';

/** Seconds a bag lies there. "Every drop is a bag on the ground for 90 s." */
export const BAG_SECONDS = 90;
/** Metres. "clickable within 3 m", 07-RUNTIME-CONTRACT. */
export const BAG_REACH = 3;

/** Monster tier to armour material, which is what `helm` and `tunic` become. */
export const ARMOUR_MATERIAL = { 1: 'cloth', 2: 'leather', 3: 'studded', 4: 'ring', 5: 'chain', 6: 'plate' };

/**
 * A monster's word for a drop, turned into an items.js base id. `tier` picks
 * the armour material. A null means "no honest base exists for this yet", and
 * the caller leaves it out of the roll.
 */
export function itemBaseFor(word, tier = 1) {
  const mat = ARMOUR_MATERIAL[Math.min(6, Math.max(1, Math.round(tier)))] || 'leather';
  switch (word) {
    // materials that already are bases
    case 'ingot': case 'ore': case 'gem': case 'reagent': return word;
    case 'wood': return 'log';
    case 'meat': return 'food';
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
    const base = itemBaseFor(word, m.tier);
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
  for (const m of Object.values(MONSTERS)) for (const w of (m.lootTable || [])) words.add(w);
  for (const w of words) {
    if (UNJOINED.includes(w)) continue;
    // tier 6 is the widest material the join can pick; tier 1 the narrowest
    for (const tier of [1, 6]) {
      const base = itemBaseFor(w, tier);
      if (!base || !BASES[base]) bad.push(`"${w}" at tier ${tier} joins to ${base === null ? 'nothing' : `"${base}"`}`);
    }
  }
  if (bad.length) throw new Error(`loot_drops: ${bad.join('; ')}`);
  return { words: words.size, unjoined: UNJOINED.length };
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

  function build(colour) {
    const g = new THREE.Group();
    const hex = new THREE.Color(colour);
    const cloth = new THREE.MeshStandardMaterial({ color: 0x6b5a42, roughness: 1, metalness: 0, flatShading: true, emissive: hex, emissiveIntensity: 0.55 });
    const glow = new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.75 });
    const sack = new THREE.Mesh(sackGeo, cloth);
    sack.position.y = 0.16;
    sack.castShadow = true;
    const tie = new THREE.Mesh(tieGeo, cloth);
    tie.position.y = 0.36;
    const ring = new THREE.Mesh(ringGeo, glow);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.06;
    g.add(sack, tie, ring);
    // the thing the raycaster actually meets, so a sack in long grass is still
    // a target the size of a footstool
    const hit = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.42, 0.9, 6),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    hit.position.y = 0.45;
    g.add(hit);
    return { g, ring, sack, hit, mats: [cloth, glow] };
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
    const built = build(bagColour(list, gold));
    built.g.position.set(pos?.x ?? 0, pos?.y ?? 0, pos?.z ?? 0);
    group.add(built.g);
    const bag = {
      id: nextId++, items: list, gold: Math.max(0, Math.round(gold)),
      pos: built.g.position, age: 0, node: built.g, ring: built.ring, mats: built.mats,
      spin: Math.random() * Math.PI * 2,
    };
    built.g.userData.bag = bag;
    built.hit.userData.bag = bag;
    bags.push(bag);
    return bag;
  }

  function remove(bag) {
    const i = bags.indexOf(bag);
    if (i >= 0) bags.splice(i, 1);
    group.remove(bag.node);
    bag.node.traverse((o) => { if (o.geometry && o.geometry !== sackGeo && o.geometry !== tieGeo && o.geometry !== ringGeo) o.geometry.dispose(); });
    for (const m of bag.mats) m.dispose();
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
      // the colour follows what is still in there, so a bag that gave up its
      // purple stops advertising one
      const colour = new THREE.Color(bagColour(left, bag.gold));
      for (const m of bag.mats) { if (m.emissive) m.emissive.copy(colour); else m.color.copy(colour); }
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
      b.node.rotation.y = b.spin;
      b.node.position.y = b.pos.y;
      b.ring.rotation.z = b.spin * 2;
      b.ring.scale.setScalar(1 + Math.sin(b.age * 3) * 0.08);
      // the last ten seconds it fades, so a bag about to go says so
      const fade = b.age > BAG_SECONDS - 10 ? 1 - (b.age - (BAG_SECONDS - 10)) / 10 : 1;
      for (const m of b.mats) {
        if (m.transparent) m.opacity = 0.75 * fade;
        else if (m.emissive) m.emissiveIntensity = 0.55 * fade;
      }
    }
  }

  return {
    group, drop, pick, take, update, nearest, rollFor,
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
