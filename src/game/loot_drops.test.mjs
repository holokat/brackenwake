// What a kill leaves. Run: node src/game/loot_drops.test.mjs
//
// The rarity spread is the point of this file. `src/mmo/loot.js` prints the
// bands and shifts them by tier; nothing in the game had ever ROLLED against
// them, so this drives two hundred kills of a tier 1 monster and two hundred of
// a tier 4 and counts what came out, against the weights loot.js itself
// computes. If someone changes RARITY's weights, this fails and says by how
// much rather than going quietly green.

import * as THREE from 'three';
import { MONSTERS } from '../mmo/monsters.js';
import { weightsFor, rollKill } from '../mmo/loot.js';
import { RARITY, RARITY_ORDER, BASES, makeItem, takesRarity, MEAT_BASES, auditItems } from '../mmo/items.js';
import {
  createLootDrops, auditLootTables, auditLootWords, tableFor, itemBaseFor, rollFor,
  bagColour, describeItem, listText, labelFor, shapeOf, BAG_SECONDS, ARMOUR_MATERIAL,
  meatFor, MEAT_OF, MEAT_BY_KIND,
} from './loot_drops.js';
import { tierFor, MAX_TRIS } from './gold_piles.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

// ============================================================= the translation
{
  check('every monster still drops something the pack could hold', auditLootTables() === true);

  check('a monster word that is already a base passes through', itemBaseFor('longsword', 2) === 'longsword');
  check('wood is a log', itemBaseFor('wood', 3) === 'log');
  check('meat on its own is nothing, because there is no item called meat', itemBaseFor('meat', 1) === null);
  check('a helm on a tier 1 is cloth, on a tier 4 is ringmail, on a boss is plate',
    itemBaseFor('helm', 1) === 'cloth_head' && itemBaseFor('helm', 4) === 'ring_head' && itemBaseFor('helm', 6) === 'plate_head');
  check('a robe is cloth whoever wears it', itemBaseFor('robe', 5) === 'cloth_chest');
  check('a hide joins to the hide base, so a knife can hand one over', itemBaseFor('hide', 2) === 'hide');
  check('and thickHide and scaledHide join to theirs',
    itemBaseFor('thickHide', 3) === 'thick_hide' && itemBaseFor('scaledHide', 4) === 'scaled_hide');
  check('a hide is still never in a sack, because it is Skinning\'s',
    !tableFor('wolf').includes('hide') && !tableFor('direWolf').includes('thick_hide'));
  check('and neither does a scroll', itemBaseFor('scroll', 5) === null);
  check('every material in the map is a real armour tier',
    Object.values(ARMOUR_MATERIAL).every((m) => !!BASES[`${m}_head`]), Object.values(ARMOUR_MATERIAL).join(', '));

  const skel = tableFor('skeletonWarrior');
  check('a skeleton warrior drops swords and shields, as the document says',
    skel.includes('longsword') && skel.includes('kite'), skel.join(', '));
  check('and a wolf drops wolf meat', tableFor('wolf').join(',') === 'wolf_meat', tableFor('wolf').join(', '));
  check('a table with nothing translatable comes back empty rather than throwing',
    tableFor({ id: 'x', tier: 2, lootTable: ['hide', 'scroll'] }).length === 0);
  check('and every word in every table joins, but for the scroll', !!auditLootWords());
}

// ============================================================ meat is a beast
//
// "There should be no Food item, it should be a specific food." Sixteen
// monsters carry the word `meat` and they all used to join to one grey stack.
{
  const named = [
    ['giantRat', 'rat_meat'], ['wolf', 'wolf_meat'], ['direWolf', 'wolf_meat'],
    ['werewolf', 'wolf_meat'], ['boar', 'boar_meat'], ['stonebackBear', 'bear_meat'],
    ['deer', 'venison'], ['rabbit', 'game_meat'], ['crab', 'crab_meat'],
    ['harpy', 'game_meat'], ['caveBat', 'game_meat'], ['fieldMouse', 'rat_meat'],
  ];
  const wrong = named.filter(([id, want]) => itemBaseFor('meat', MONSTERS[id].tier, MONSTERS[id]) !== want);
  check(`all ${named.length} named beasts give their own meat`, wrong.length === 0,
    wrong.map(([id, want]) => `${id} wanted ${want} got ${itemBaseFor('meat', 1, MONSTERS[id])}`).join('; '));

  // Every monster carrying the word, counted rather than sampled.
  const withMeat = Object.values(MONSTERS).filter((m) => (m.lootTable || []).includes('meat'));
  const resolved = withMeat.map((m) => meatFor(m));
  check(`${withMeat.length} monsters carry the word meat and every one resolves to a real meat`,
    resolved.every((id) => MEAT_BASES.includes(id)),
    [...new Set(resolved)].join(', '));
  check('and none of them resolves to anything generic',
    !resolved.some((id) => id === 'food' || id === 'meat' || !BASES[id]));

  // The other direction: a thing with no meat on it gets none, even though its
  // table says the word. None of these exists today; the fallback is what will
  // be there when one does.
  const none = [
    { id: 'x1', tier: 3, kind: 'undead', lootTable: ['meat', 'bone'] },
    { id: 'x2', tier: 4, kind: 'construct', lootTable: ['meat', 'ingot'] },
    { id: 'x3', tier: 5, kind: 'elemental', lootTable: ['meat', 'gem'] },
  ];
  check('an undead, a construct and an elemental drop no meat at all',
    none.every((m) => meatFor(m) === null && itemBaseFor('meat', m.tier, m) === null));
  check('and the word simply falls out of their table, leaving the rest',
    none.every((m) => !tableFor(m).some((b) => MEAT_BASES.includes(b)) && tableFor(m).length === 1),
    none.map((m) => tableFor(m).join('+')).join(', '));
  check('a beast nobody has named yet still gets meat rather than nothing',
    meatFor({ id: 'x4', tier: 2, kind: 'beast', lootTable: ['meat'] }) === 'game_meat');
  check('every id in MEAT_OF is a real monster, and every meat it names is a real meat',
    Object.entries(MEAT_OF).every(([id, meat]) => !!MONSTERS[id] && MEAT_BASES.includes(meat)));
  check('every kind monsters.js has is answered by MEAT_BY_KIND',
    [...new Set(Object.values(MONSTERS).map((m) => m.kind))].every((k) => k in MEAT_BY_KIND),
    [...new Set(Object.values(MONSTERS).map((m) => m.kind))].join(', '));
}

// ================================================ rarity does not touch food
//
// Ten thousand kills across every monster in the game, counted. Not a sample of
// one wolf: every row, so a table added tomorrow is in the sweep the day it
// lands.
{
  const all = Object.values(MONSTERS);
  const N = 10000;
  let rolled = 0, foodOrMaterial = 0, badRarity = 0, badAffix = 0, gear = 0, gearAbove = 0;
  const everything = [];
  for (let i = 0; i < N; i++) {
    const m = all[i % all.length];
    const { items } = rollFor(m, { seed: i * 7919 + 11, luck: i % 41 });
    for (const it of items) {
      rolled++;
      everything.push(it);
      if (takesRarity(it)) {
        gear++;
        if (it.rarity !== 'common') gearAbove++;
      } else {
        foodOrMaterial++;
        if (it.rarity !== 'common') badRarity++;
        if (it.affixes && it.affixes.length) badAffix++;
      }
    }
  }
  console.log(`     ${N} kills over all ${all.length} monsters: ${rolled} drops, ${gear} gear (${gearAbove} above common), ${foodOrMaterial} food or material`);
  check('the sweep really produced food and materials to test', foodOrMaterial > 100, `${foodOrMaterial}`);
  check('and gear above common, so the other side of the gate is exercised too', gearAbove > 100, `${gearAbove}`);
  check('not one food or material came out above common', badRarity === 0, `${badRarity} of ${foodOrMaterial}`);
  check('not one of them carried an affix', badAffix === 0, `${badAffix} of ${foodOrMaterial}`);
  check('and items.js agrees when it is handed all ten thousand drops', auditItems(everything) === true);

  // The sack colour ignores them too, both ways.
  const carrot = makeItem({ base: 'carrot', seed: 1 });
  const venison = makeItem({ base: 'venison', seed: 2 });
  const epic = makeItem({ base: 'longsword', rarity: 'epic', seed: 3 });
  check('a sack of nothing but food is not lit by the food', bagColour([carrot, venison], 0) === RARITY.common.colour);
  check('a sack of food and gold is a purse', bagColour([carrot, venison], 12) === '#ffcf40');
  check('and a purple in with the venison still reads purple', bagColour([carrot, venison, epic], 12) === RARITY.epic.colour);
}

// ========================================================= two hundred kills
//
// Every kill of one monster, with a different seed each time, counted by rarity
// and checked against the weights loot.js computes for that tier.
//
// ONLY GEAR IS COUNTED BY RARITY. A skeleton warrior's `bone` is a reagent and a
// wolf's `meat` is wolf meat, and rarity does not apply to either: they come out
// common however the dice fell. Counting them would drag every band toward
// common and the test would be measuring the table's composition rather than
// loot.js's weights. `plain` is the count of those, reported so a monster that
// quietly stops dropping gear at all is visible rather than hidden.
function spread(id, n, seedBase) {
  const m = MONSTERS[id];
  const counts = Object.fromEntries(RARITY_ORDER.map((r) => [r, 0]));
  let gold = 0, items = 0, plain = 0;
  for (let i = 0; i < n; i++) {
    const roll = rollFor(m, { seed: seedBase + i });
    gold += roll.gold;
    for (const it of roll.items) {
      if (takesRarity(it)) { counts[it.rarity]++; items++; } else plain++;
    }
  }
  return { counts, gold, items, plain };
}

{
  const N = 200;
  // Four bases, all four of them gear, so every drop has a rarity to count.
  const id = 'bandit';
  const m = MONSTERS[id];
  const { counts, gold, items, plain } = spread(id, N, 1000);
  check(`a ${m.name}'s whole table is gear, so nothing falls out of the count`, plain === 0, `${plain} plain`);
  const w = weightsFor(m.tier, 0);
  const total = w.reduce((a, b) => a + b, 0);
  check(`${N} kills of a ${m.name} leave ${N} drops`, items === N, `${items}`);

  const line = RARITY_ORDER.map((r, i) => `${r} ${counts[r]} (want ${(N * w[i] / total).toFixed(1)})`).join(', ');
  console.log(`     ${line}`);
  let inBand = true, worst = '';
  for (let i = 0; i < RARITY_ORDER.length; i++) {
    const p = w[i] / total;
    const want = N * p;
    // three standard deviations of a binomial, and never a band tighter than 5
    const sd = Math.sqrt(N * p * (1 - p));
    const band = Math.max(5, 3 * sd);
    if (Math.abs(counts[RARITY_ORDER[i]] - want) > band) { inBand = false; worst = `${RARITY_ORDER[i]} ${counts[RARITY_ORDER[i]]} against ${want.toFixed(1)} +- ${band.toFixed(1)}`; }
  }
  check('and every rarity lands inside three sigma of loot.js\'s own weights', inBand, worst || 'all six');

  // "Monster tier shifts the weights up one row per two tiers": a tier 2 or 3
  // never drops a white at all, which is the whole point of the shift
  check('a tier 2 drops no commons at all, because the shift ate the row',
    counts.common === 0 && w[0] === 0, `${counts.common} commons`);
  const t1 = spread('goblinScout', N, 2000);   // dagger and throwing knives, both gear
  check('and a tier 1 is mostly commons, because it is the printed table',
    t1.counts.common > N * 0.5, `${t1.counts.common} of ${t1.items}`);
  // A giant rat's whole table is rat meat now, so it has no rarity to spread.
  const rat = spread('giantRat', N, 2500);
  check('a giant rat leaves meat and nothing with a colour on it',
    rat.items === 0 && rat.plain === N, `${rat.items} gear, ${rat.plain} meat`);
  const t4 = spread('vampireKnight', N, 3000);   // longsword, cloak, ring, amulet
  check('a tier 4 starts at blue, and drops nothing below it',
    t4.counts.common === 0 && t4.counts.uncommon === 0 && t4.counts.rare > N * 0.5,
    RARITY_ORDER.map((r) => `${r} ${t4.counts[r]}`).join(', '));

  // gold in the tier's range, every time
  const perKill = gold / N;
  const [lo, hi] = m.gold;
  check(`gold averages inside the ${lo} to ${hi} the tier pays`, perKill >= lo && perKill <= hi, `${perKill.toFixed(1)} a kill`);
  let outside = 0;
  for (let i = 0; i < N; i++) { const g = rollFor(m, { seed: 5000 + i }).gold; if (g < lo || g > hi) outside++; }
  check('and no single kill pays outside it', outside === 0, `${outside} of ${N}`);
  check('a critter carries no gold and no drop', rollFor('rabbit', { seed: 1 }).gold === 0 && rollFor('rabbit', { seed: 1 }).items.length === 0);
}

// ================================================================ the sack
{
  const scene = new THREE.Group();
  const said = [];
  const drops = createLootDrops(scene, { hud: { log: (t) => said.push(t) } });

  const sword = makeItem({ base: 'longsword', rarity: 'rare', seed: 3 });
  const helm = makeItem({ base: 'leather_head', rarity: 'uncommon', seed: 4 });
  const bag = drops.drop({ x: 5, y: 2, z: 7 }, { items: [sword, helm], gold: 14 });
  check('a sack goes down where the body fell', bag && bag.pos.x === 5 && bag.pos.y === 2 && bag.pos.z === 7);
  // note: scene.children holds the loot LAYER, not the sacks. The sacks are the
  // layer's children, and counting the wrong one is how a test goes green over
  // an empty field.
  check('and it is in the scene', drops.group.children.length === 1 && drops.count === 1);
  check('and it says nothing on its own, because the kill already spoke', said.length === 0);
  check('a sack with nothing in it is never put down', drops.drop({ x: 0, y: 0, z: 0 }, { items: [], gold: 0 }) === null);
  check('but a purse of gold alone is', drops.drop({ x: 1, y: 0, z: 1 }, { gold: 9 }) !== null);

  check('the sack is the colour of the best thing in it', bagColour([sword, helm]) === RARITY.rare.colour);
  check('and a purse is gold', bagColour([], 20) === '#ffcf40');

  // taking all of it
  let handed = null;
  const all = drops.take(bag, (items, gold) => { handed = { items, gold }; });
  check('the handler is given everything in the sack', handed.items.length === 2 && handed.gold === 14);
  check('taking it all empties the sack and takes it away', all.taken.length === 2 && all.gold === 14 && drops.count === 1);
  check('and it says what went in', said.some((t) => t.includes('in the pack') && t.includes('14 gold')), said[0]);
}

// ============================================ what did not fit stays in the sack
{
  const scene = new THREE.Group();
  const said = [];
  const drops = createLootDrops(scene, { hud: { log: (t) => said.push(t) } });
  const a = makeItem({ base: 'longsword', rarity: 'epic', seed: 1 });
  const b = makeItem({ base: 'kite', rarity: 'common', seed: 2 });
  const bag = drops.drop({ x: 0, y: 0, z: 0 }, { items: [a, b], gold: 30 });

  // a pack with room for one thing and half the coin
  const res = drops.take(bag, (items) => ({ items: [items[0]], gold: 10 }));
  check('only what the pack took comes out', res.taken.length === 1 && res.taken[0] === a && res.gold === 10);
  check('the rest is still in the sack', bag.items.length === 1 && bag.items[0] === b && bag.gold === 20);
  check('and the sack is still on the ground', drops.count === 1);
  check('it says what went in', said.some((t) => t.startsWith('10 gold and')), said[0]);
  check('and it says what did not', said.some((t) => t.includes('stays in the sack')), said[1]);

  // a handler that refuses everything changes nothing at all
  const before = said.length;
  const none = drops.take(bag, () => false);
  check('a pack that is full takes nothing and the sack is untouched',
    none.taken.length === 0 && bag.items.length === 1 && bag.gold === 20 && drops.count === 1);
  check('and it still says so, because a silent refusal looks like a broken click', said.length > before);

  // a handler that throws is a refusal, not a crash that eats the loot
  const threw = drops.take(bag, () => { throw new Error('the pack exploded'); });
  check('a handler that throws loses nothing', threw.taken.length === 0 && bag.items.length === 1 && bag.gold === 20);

  // and taking a bag that is already gone is a refusal, not a throw
  drops.take(bag, () => undefined);
  check('the sack goes once it is empty', drops.count === 0);
  check('taking a sack that is gone says so', drops.take(bag, () => undefined).reason === 'gone');
}

// =============================================================== ninety seconds
{
  const scene = new THREE.Group();
  const said = [];
  const drops = createLootDrops(scene, { hud: { log: (t) => said.push(t) } });
  const bag = drops.drop({ x: 0, y: 0, z: 0 }, { gold: 5 });
  for (let s = 0; s < BAG_SECONDS - 1; s++) drops.update(1);
  check(`a sack is still there after ${BAG_SECONDS - 1} s`, drops.count === 1, `${drops.remaining(bag).toFixed(0)} s left`);
  drops.update(1);
  check(`and gone at ${BAG_SECONDS}`, drops.count === 0 && drops.group.children.length === 0);
  check('and it went without a word, because nobody was standing there', said.length === 0);
  drops.dispose();
}

// ================================================================== reaching
{
  const scene = new THREE.Group();
  const drops = createLootDrops(scene, {});
  drops.drop({ x: 10, y: 0, z: 0 }, { gold: 1 });
  drops.drop({ x: 2, y: 0, z: 0 }, { gold: 2 });
  check('the nearest sack within reach is the near one', drops.nearest({ x: 0, z: 0 }, 3).gold === 2);
  check('and out of reach there is none', drops.nearest({ x: 0, z: 0 }, 1) === null);
  check('a wider reach finds the far one too', drops.nearest({ x: 9, z: 0 }, 3).gold === 1);
  drops.dispose();
  check('disposing clears the scene', scene.children.length === 0);
}

// ================================================================== the words
{
  const common = makeItem({ base: 'longsword', rarity: 'common', seed: 1 });
  check('a plain sword is called a longsword', describeItem(common) === 'a longsword', describeItem(common));
  const rare = makeItem({ base: 'longsword', rarity: 'rare', seed: 1 });
  check('an unidentified one is called by its colour', describeItem(rare) === 'a blue longsword', describeItem(rare));
  const many = makeItem({ base: 'ingot', rarity: 'common', seed: 1, count: 7 });
  check('a stack is counted', describeItem(many) === '7 ingot', describeItem(many));
  check('nothing is "nothing"', describeItem(null) === 'nothing');
  // Meat is a mass noun. "a venison" is a UI writing, not an author.
  check('a haunch of venison is "some venison", not "a venison"',
    describeItem(makeItem({ base: 'venison', seed: 1 })) === 'some venison',
    describeItem(makeItem({ base: 'venison', seed: 1 })));
  check('and so are wolf meat, bread and cheese',
    ['wolf_meat', 'bread', 'cheese'].every((b) => describeItem(makeItem({ base: b, seed: 1 })).startsWith('some ')));
  check('but an apple is still an apple and a carrot a carrot',
    describeItem(makeItem({ base: 'apple', seed: 1 })) === 'an apple'
    && describeItem(makeItem({ base: 'carrot', seed: 1 })) === 'a carrot');
  check('and a counted stack is counted, not "some"',
    describeItem(makeItem({ base: 'venison', seed: 1, count: 3 })) === '3 venison');
  check('a wolf\'s sack reads as a sentence',
    listText([makeItem({ base: 'wolf_meat', seed: 1 })], 18) === '18 gold and some wolf meat',
    listText([makeItem({ base: 'wolf_meat', seed: 1 })], 18));
  check('one thing has no comma', listText([common], 0) === 'a longsword');
  check('two things and a purse read as a sentence',
    listText([common, rare], 12) === '12 gold, a longsword and a blue longsword', listText([common, rare], 12));
  check('an empty hand says nothing', listText([], 0) === 'nothing');
}

// ======================================================= gold is not a sack
//
// "a gold-only drop uses a pile and an item drop uses a sack". Both directions,
// on the real drop path, with the real meshes counted.
{
  const scene = new THREE.Group();
  const drops = createLootDrops(scene, {});
  const meshes = (bag) => { const out = []; bag.node.traverse((o) => { if (o.isMesh) out.push(o); }); return out; };
  const named = (bag, pre) => meshes(bag).filter((m) => m.name.startsWith(pre));
  const trisOf = (m) => (m.geometry.index ? m.geometry.index.count / 3 : m.geometry.attributes.position.count / 3);

  const purse = drops.drop({ x: 0, y: 0, z: 0 }, { gold: 46 });
  check('a kill that left nothing but coin leaves a pile of coin',
    drops.shapeOf(purse) === 'pile:medium' && named(purse, 'gold:').length === 1,
    `${drops.shapeOf(purse)}, ${named(purse, 'gold:').map((m) => m.name).join(', ')}`);
  check('and no sack, and no rarity ring, because there is no rarity in a coin',
    purse.ring === null && named(purse, 'gold:')[0].name === 'gold:medium');
  check('the pile in the bag is the pile the amount earns',
    named(purse, 'gold:')[0].userData.gold.amount === 46
    && named(purse, 'gold:')[0].userData.gold.tier === tierFor(46));
  check('and it is still under the triangle budget once it is in the world',
    trisOf(named(purse, 'gold:')[0]) < MAX_TRIS, `${trisOf(named(purse, 'gold:')[0])}`);

  const sword = makeItem({ base: 'longsword', rarity: 'epic', seed: 9 });
  const gear = drops.drop({ x: 3, y: 0, z: 0 }, { items: [sword] });
  check('a kill that left gear leaves a sack', drops.shapeOf(gear) === 'sack' && !!gear.ring);
  check('and no coins beside it, because there was no money in it',
    named(gear, 'gold:').length === 0);
  check('the rarity glow still lights the sack purple',
    gear.ring.material.color.getHexString() === RARITY.epic.colour.replace('#', ''),
    `#${gear.ring.material.color.getHexString()} against ${RARITY.epic.colour}`);

  const both = drops.drop({ x: 6, y: 0, z: 0 }, { items: [sword], gold: 12 });
  check('a sack with money in it keeps the sack and puts coins beside it',
    drops.shapeOf(both) === 'sack+coins' && !!both.ring && named(both, 'gold:').length === 1);
  check('and the coins really are beside it, not inside it',
    Math.hypot(named(both, 'gold:')[0].position.x, named(both, 'gold:')[0].position.z) > 0.2,
    `${named(both, 'gold:')[0].position.x.toFixed(2)}, ${named(both, 'gold:')[0].position.z.toFixed(2)}`);
  check('the scatter beside a sack is a scatter whatever the purse',
    named(drops.drop({ x: 9, y: 0, z: 0 }, { items: [sword], gold: 4000 }), 'gold:')[0].name === 'gold:small');

  // the amount picks the pile, at every boundary, through the real drop path
  const shapes = [[1, 'pile:small'], [30, 'pile:small'], [31, 'pile:medium'],
    [150, 'pile:medium'], [151, 'pile:large'], [9999, 'pile:large']];
  const wrong = shapes.filter(([g, want]) => drops.shapeOf(drops.drop({ x: 20 + g, y: 0, z: 0 }, { gold: g })) !== want);
  check('and every gold boundary drops the pile it should, both ways', wrong.length === 0,
    wrong.map(([g, want]) => `${g} wanted ${want}`).join('; '));

  // THE CURSOR. Read for both, because a label nobody reads is a label nobody
  // notices is wrong.
  check('the cursor calls a purse a pile of gold', labelFor(purse) === 'a pile of 46 gold', labelFor(purse));
  check('and a sack a sack, with what is in it and the money last',
    labelFor(both) === 'a sack: a purple longsword and 12 gold', labelFor(both));
  check('a sack of gear alone names no money',
    labelFor(gear) === 'a sack: a purple longsword', labelFor(gear));
  check('two things in a sack read as a sentence',
    labelFor({ items: [sword, makeItem({ base: 'kite', rarity: 'common', seed: 2 })], gold: 5 })
      === 'a sack: a purple longsword, a kite shield and 5 gold',
    labelFor({ items: [sword, makeItem({ base: 'kite', rarity: 'common', seed: 2 })], gold: 5 }));
  check('and nothing at all is nothing', labelFor(null) === 'nothing'
    && labelFor({ items: [], gold: 0 }) === 'an empty sack');
  check('shapeOf agrees with labelFor about what is a pile',
    shapeOf([], 46).startsWith('pile:') && shapeOf([sword], 46) === 'sack+coins'
    && shapeOf([sword], 0) === 'sack');

  // the pick path is unchanged: a real raycast, straight down, finds both.
  // The world matrices are stale until something updates them; the renderer
  // does that every frame and this harness has no renderer, so it says so.
  const ray = new THREE.Raycaster();
  scene.updateMatrixWorld(true);
  ray.set(new THREE.Vector3(0, 4, 0), new THREE.Vector3(0, -1, 0));
  check('a raycast finds the pile of gold under the cursor', drops.pick(ray) === purse);
  ray.set(new THREE.Vector3(3, 4, 0), new THREE.Vector3(0, -1, 0));
  check('and the sack', drops.pick(ray) === gear);
  ray.set(new THREE.Vector3(3, 4, 40), new THREE.Vector3(0, -1, 0));
  check('and nothing where there is nothing', drops.pick(ray) === null);

  // a pile does not turn on the spot. A sack does.
  const beforeSack = gear.node.rotation.y, beforePile = purse.node.rotation.y;
  drops.update(1);
  check('a sack turns where it fell', gear.node.rotation.y !== beforeSack);
  check('and coins on the ground lie still', purse.node.rotation.y === beforePile);
  drops.dispose();
}

// ================================== what is left changes what it looks like
{
  const scene = new THREE.Group();
  const said = [];
  const drops = createLootDrops(scene, { hud: { log: (t) => said.push(t) } });
  const named = (bag, pre) => { const out = []; bag.node.traverse((o) => { if (o.isMesh && o.name.startsWith(pre)) out.push(o); }); return out; };

  // take the sword out of a mixed bag and what stays behind is a pile of coin
  const sword = makeItem({ base: 'longsword', rarity: 'rare', seed: 5 });
  const mixed = drops.drop({ x: 0, y: 0, z: 0 }, { items: [sword], gold: 200 });
  check('it starts as a sack with coins beside it', drops.shapeOf(mixed) === 'sack+coins');
  const id = mixed.id, node0 = mixed.node;
  drops.take(mixed, (items) => ({ items: [items[0]], gold: 0 }));
  check('taking the sword leaves the gold', mixed.gold === 200 && mixed.items.length === 0);
  check('and what is on the ground is a heap of coin, not an empty sack',
    drops.shapeOf(mixed) === 'pile:large' && named(mixed, 'gold:').length === 1
    && named(mixed, 'gold:')[0].name === 'gold:large' && mixed.ring === null,
    drops.shapeOf(mixed));
  check('the bag is the same bag, rebuilt, not a new one',
    mixed.id === id && mixed.node !== node0 && drops.count === 1);
  check('and the raycast follows it', (() => {
    const ray = new THREE.Raycaster();
    scene.updateMatrixWorld(true);
    ray.set(new THREE.Vector3(0, 4, 0), new THREE.Vector3(0, -1, 0));
    return drops.pick(ray) === mixed;
  })());
  check('the cursor says so too', labelFor(mixed) === 'a pile of 200 gold', labelFor(mixed));

  // and the other direction: take the gold and the coins beside the sack go
  const helm = makeItem({ base: 'leather_head', rarity: 'uncommon', seed: 6 });
  const other = drops.drop({ x: 5, y: 0, z: 0 }, { items: [helm], gold: 40 });
  check('a mixed sack has coins beside it', named(other, 'gold:').length === 1);
  drops.take(other, () => ({ items: [], gold: 40 }));
  check('taking only the money leaves a plain sack and no coins',
    drops.shapeOf(other) === 'sack' && named(other, 'gold:').length === 0 && !!other.ring,
    drops.shapeOf(other));
  check('and the helm is still in it', other.items.length === 1 && other.gold === 0);

  // a pile that gives up half its gold becomes a smaller pile
  const heap = drops.drop({ x: 10, y: 0, z: 0 }, { gold: 400 });
  check('four hundred gold is a heap', drops.shapeOf(heap) === 'pile:large');
  drops.take(heap, () => ({ items: [], gold: 380 }));
  check('and twenty of it left behind is a scatter',
    drops.shapeOf(heap) === 'pile:small' && named(heap, 'gold:')[0].name === 'gold:small',
    drops.shapeOf(heap));
  check('and it still says what stayed', said.some((t) => t.includes('20 gold stays in the sack')),
    said[said.length - 1]);

  // taking it all is still taking it all
  drops.take(heap, () => undefined);
  check('emptying a pile takes it off the ground', drops.count === 2);

  // and the ninety seconds still expire a pile
  const doomed = drops.drop({ x: 20, y: 0, z: 0 }, { gold: 60 });
  const pileMat = named(doomed, 'gold:')[0].material;
  for (let i = 0; i < BAG_SECONDS - 5; i++) drops.update(1);
  check('a pile of gold fades before it goes', pileMat.opacity < 1 && pileMat.opacity > 0,
    `opacity ${pileMat.opacity.toFixed(2)}`);
  for (let i = 0; i < 6; i++) drops.update(1);
  check('and is gone at ninety seconds', !drops.bags().includes(doomed));
  drops.dispose();
  check('disposing clears every pile and sack out of the scene', scene.children.length === 0);
}

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
