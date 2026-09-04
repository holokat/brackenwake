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
import { RARITY, RARITY_ORDER, BASES, makeItem } from '../mmo/items.js';
import {
  createLootDrops, auditLootTables, auditLootWords, tableFor, itemBaseFor, rollFor,
  bagColour, describeItem, listText, BAG_SECONDS, ARMOUR_MATERIAL,
} from './loot_drops.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

// ============================================================= the translation
{
  check('every monster still drops something the pack could hold', auditLootTables() === true);

  check('a monster word that is already a base passes through', itemBaseFor('longsword', 2) === 'longsword');
  check('wood is a log', itemBaseFor('wood', 3) === 'log');
  check('meat is food', itemBaseFor('meat', 1) === 'food');
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
  check('and a wolf drops what a beast drops', tableFor('wolf').join(',') === 'food', tableFor('wolf').join(', '));
  check('a table with nothing translatable comes back empty rather than throwing',
    tableFor({ id: 'x', tier: 2, lootTable: ['hide', 'scroll'] }).length === 0);
  check('and every word in every table joins, but for the scroll', !!auditLootWords());
}

// ========================================================= two hundred kills
//
// Every kill of one monster, with a different seed each time, counted by rarity
// and checked against the weights loot.js computes for that tier.
function spread(id, n, seedBase) {
  const m = MONSTERS[id];
  const counts = Object.fromEntries(RARITY_ORDER.map((r) => [r, 0]));
  let gold = 0, items = 0;
  for (let i = 0; i < n; i++) {
    const roll = rollFor(m, { seed: seedBase + i });
    gold += roll.gold;
    for (const it of roll.items) { counts[it.rarity]++; items++; }
  }
  return { counts, gold, items };
}

{
  const N = 200;
  const id = 'skeletonWarrior';       // tier 2, four bases in its table
  const m = MONSTERS[id];
  const { counts, gold, items } = spread(id, N, 1000);
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
  const t1 = spread('giantRat', N, 2000);
  check('and a tier 1 is mostly commons, because it is the printed table',
    t1.counts.common > N * 0.5, `${t1.counts.common} of ${N}`);
  const t4 = spread('boneKnight', N, 3000);
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
  check('one thing has no comma', listText([common], 0) === 'a longsword');
  check('two things and a purse read as a sentence',
    listText([common, rare], 12) === '12 gold, a longsword and a blue longsword', listText([common, rare], 12));
  check('an empty hand says nothing', listText([], 0) === 'nothing');
}

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
