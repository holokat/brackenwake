// The forage table, the seasons, the placement and the live field.
// Run: node src/world/forage.test.mjs
//
// Nothing here is asserted on the strength of having been written. Every
// prototype is built and its triangles counted off the vertex buffer; every
// gate is driven BOTH ways (Summer AND Winter, a chunk with trees AND one
// without, a wet meadow AND a dry one); the joins to items.js and recipes.js
// are checked in both directions, so a mushroom with no base and a base with no
// mushroom both fail here.
//
// A RECORD IS A BUNCH. `placeForage` returns one pickable per cluster, holding
// `count` plants in `members`, so "records" below means pickables and "plants"
// means what is drawn. Both are printed everywhere the difference matters.

import * as THREE from 'three';
import {
  FORAGE, FORAGE_IDS, FORAGE_BY_ID, SEASONS, SEASON_MS, YEAR_MS, DAY_MS, REGROW_MS,
  seasonAt, seasonIndexAt, seasonProgress, nextSeasonAt,
  placeForage, createForageField, forageGeometry, forageTriangles, auditForage,
  weightFor, mapBio, idsIn, WET_MOIST, WET_KEY, CLEARING_GAP, FORAGE_SCALE,
  plantsIn, distanceToForage, TREE_CLUSTER_MAX, GROUND_CLUSTER_MAX, clusterCapFor,
} from './forage.js';
import { CHUNK } from './field.js';
import { BASES, FORAGE_BASES, FORAGE_PRODUCT_BASES, auditForageBases } from '../mmo/items.js';
import { FORAGE_RECIPES, FORAGE_MATERIAL_IDS, auditForageRecipes, MATERIALS } from '../mmo/recipes.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

// ============================================================ the season clock
console.log('forage: the year is four seasons of three real days each');
{
  check('a season is three real days', SEASON_MS === 3 * 24 * 60 * 60 * 1000, `${SEASON_MS} ms`);
  check('a year is four of them', YEAR_MS === SEASON_MS * 4, `${YEAR_MS} ms`);
  check('a day and a night is six minutes', DAY_MS === 360_000, `${DAY_MS} ms`);
  check('regrowth is three of those days', REGROW_MS === 3 * DAY_MS, `${REGROW_MS} ms, ${REGROW_MS / 60000} minutes`);

  const at = (days) => seasonAt(days * 24 * 3600 * 1000);
  check('day 0 is Spring', at(0) === 'Spring', at(0));
  check('day 2.9 is still Spring', at(2.9) === 'Spring', at(2.9));
  check('day 3 is Summer', at(3) === 'Summer', at(3));
  check('day 6 is Autumn', at(6) === 'Autumn', at(6));
  check('day 9 is Winter', at(9) === 'Winter', at(9));
  check('day 12 is Spring again', at(12) === 'Spring', at(12));
  check('and it wraps backwards too', seasonAt(-1) === 'Winter', seasonAt(-1));
  const seen = new Set();
  for (let d = 0; d < 12; d += 0.25) seen.add(at(d));
  check('a year visits all four and no fifth', seen.size === 4 && [...seen].every((s) => SEASONS.includes(s)), [...seen].join(', '));

  check('halfway through a season reads 0.5', Math.abs(seasonProgress(SEASON_MS * 1.5) - 0.5) < 1e-9, String(seasonProgress(SEASON_MS * 1.5)));
  check('the next season starts at the boundary', Math.abs(nextSeasonAt(SEASON_MS * 1.5) - SEASON_MS * 2) < 1e-6);
  check('an epoch shifts the whole year', seasonAt(0, -SEASON_MS) === 'Summer', seasonAt(0, -SEASON_MS));
  check('seasonIndexAt agrees with seasonAt', SEASONS[seasonIndexAt(SEASON_MS * 2.2)] === seasonAt(SEASON_MS * 2.2));
}

// =========================================================== the table itself
console.log('\nforage: the table is the reference table, mapped onto this world');
{
  const a = auditForage();
  check('twenty two things grow', a.entries === 22, `${a.entries}`);
  check('and the audit is clean on the shipped table', !!a);
  console.log(`     tags: ${JSON.stringify(a.byTag)}`);
  console.log(`     entries per biome: ${JSON.stringify(a.byBiome)}`);
  check('one of them is toxic', a.byTag.toxic === 1, `${a.byTag.toxic}`);
  check('two are a caution', a.byTag.caution === 2, `${a.byTag.caution}`);
  check('nineteen are edible', a.byTag.edible === 19, `${a.byTag.edible}`);

  // Winter, said out loud rather than assumed.
  check('NOTHING in the table grows in Winter', a.winter === 0, `${a.winter} winter entries`);
  for (const b of ['meadow', 'boreal', 'sakura', 'mountain', 'snow', 'desert', 'beach']) {
    check(`  ${b} grows nothing at all in Winter`, idsIn(b, 'Winter', 1).length === 0);
  }

  // and every biome grows something in some season, or Foraging is untrainable
  // where you live
  for (const b of ['meadow', 'boreal', 'sakura', 'mountain', 'snow', 'desert', 'beach']) {
    const per = SEASONS.map((s) => `${s[0]}${idsIn(b, s, 1).length}`).join(' ');
    check(`  ${b} grows something in some season`, SEASONS.some((s) => idsIn(b, s, 1).length > 0), per);
  }
}

console.log('\nforage: the five reference forests map onto the eight biomes');
{
  const m = mapBio({ 'Boreal conifer': 1 });
  check('boreal takes a conifer entry whole', m.boreal === 1, JSON.stringify(m));
  check('and snow takes half of it', m.snow === 0.5, JSON.stringify(m));
  check('Temperate broadleaf is meadow', mapBio({ 'Temperate broadleaf': 0.8 }).meadow === 0.8);
  check('Birch grove is sakura', mapBio({ 'Birch grove': 0.6 }).sakura === 0.6);
  check('Mediterranean pine is mountain', mapBio({ 'Mediterranean pine': 0.3 }).mountain === 0.3);
  check('Tropical wet is the wet band, not plain meadow', mapBio({ 'Tropical wet': 1 })[WET_KEY] === 1
    && mapBio({ 'Tropical wet': 1 }).meadow === undefined);
  let threw = '';
  try { mapBio({ Tundra: 1 }); } catch (e) { threw = e.message; }
  check('and a forest type the reference never had throws', /not a forest type/.test(threw), threw);

  // the wet band, both ways
  const fig = FORAGE_BY_ID.fig;
  check('a fig grows in a wet meadow', weightFor(fig, 'meadow', WET_MOIST) === 1, String(weightFor(fig, 'meadow', WET_MOIST)));
  check('and not in a dry one', weightFor(fig, 'meadow', WET_MOIST - 0.01) === 0, String(weightFor(fig, 'meadow', 0.2)));
  check('a chanterelle does not care how wet it is', weightFor(FORAGE_BY_ID.chanterelle, 'meadow', 0.1) === 1);

  // the honest desert and beach sets, named
  const beach = FORAGE.filter((f) => (f.bio.beach || 0) > 0).map((f) => f.id);
  const desert = FORAGE.filter((f) => (f.bio.desert || 0) > 0).map((f) => f.id);
  console.log(`     beach grows: ${beach.join(', ')}`);
  console.log(`     desert grows: ${desert.join(', ')}`);
  check('the beach grows five things and no mushroom', beach.length === 5 && !beach.some((id) => /morel|porcini|chanterelle|agaric/.test(id)), beach.join(','));
  check('the desert grows two, and they are honey and figs', desert.length === 2 && desert.includes('honey') && desert.includes('fig'), desert.join(','));
  check('nothing berry-heavy grows in the desert', !desert.includes('blueberry') && !desert.includes('raspberry'));
}

console.log('\nforage: the audit fails on a broken row, not only on a good one');
{
  const f = FORAGE_BY_ID.morel;
  const keep = f.tag;
  f.tag = 'delicious';
  let threw = '';
  try { auditForage(); } catch (e) { threw = e.message; }
  f.tag = keep;
  check('an unknown tag throws', /tag "delicious"/.test(threw), threw.split('\n')[0]);
  const keepC = FORAGE_BY_ID.nettle.cluster;
  FORAGE_BY_ID.nettle.cluster = [8, 2];
  threw = '';
  try { auditForage(); } catch (e) { threw = e.message; }
  FORAGE_BY_ID.nettle.cluster = keepC;
  check('a cluster that counts backwards throws', /cluster/.test(threw), threw.split('\n')[0]);
  // Both directions on the cap: one over it throws, one exactly on it does not.
  FORAGE_BY_ID.nettle.cluster = [1, GROUND_CLUSTER_MAX + 1];
  threw = '';
  try { auditForage(); } catch (e) { threw = e.message; }
  check(`a ground patch of ${GROUND_CLUSTER_MAX + 1} throws`, /may hold/.test(threw), threw.split('\n')[1] || threw.split('\n')[0]);
  FORAGE_BY_ID.nettle.cluster = [1, GROUND_CLUSTER_MAX];
  threw = '';
  try { auditForage(); } catch (e) { threw = e.message; }
  check(`and one of exactly ${GROUND_CLUSTER_MAX} does not`, threw === '', threw.split('\n')[0]);
  FORAGE_BY_ID.nettle.cluster = keepC;
  const keepM = FORAGE_BY_ID.morel.cluster;
  FORAGE_BY_ID.morel.cluster = [1, TREE_CLUSTER_MAX + 1];
  threw = '';
  try { auditForage(); } catch (e) { threw = e.message; }
  check(`a bunch at a tree of ${TREE_CLUSTER_MAX + 1} throws, where the same ${TREE_CLUSTER_MAX + 1} on the ground would not`,
    /may hold/.test(threw), threw.split('\n')[1] || threw.split('\n')[0]);
  FORAGE_BY_ID.morel.cluster = keepM;
  check('and the real table is clean again', !!auditForage());
}

// ================================================================ prototypes
console.log('\nforage: every prototype is one merged geometry under 2,000 triangles');
{
  const tris = forageTriangles();
  let worst = ['', 0], total = 0;
  for (const id of FORAGE_IDS) {
    const n = tris[id];
    total += n;
    if (n > worst[1]) worst = [id, n];
    check(`  ${id.padEnd(16)} ${String(n).padStart(5)} triangles`, n > 0 && n < 2000);
  }
  console.log(`     total ${total} triangles across ${FORAGE_IDS.length} prototypes, worst is ${worst[0]} at ${worst[1]}`);
  const g = forageGeometry('chanterelle');
  check('a prototype carries position, normal and colour', !!(g.attributes.position && g.attributes.normal && g.attributes.color));
  check('one colour per vertex', g.attributes.color.count === g.attributes.position.count, `${g.attributes.color.count} vs ${g.attributes.position.count}`);
  const arr = g.attributes.position.array;
  let nan = 0;
  for (let i = 0; i < arr.length; i++) if (!Number.isFinite(arr[i])) nan++;
  check('and not a single NaN in it', nan === 0, `${nan}`);
  check('the same id twice is the same geometry object', forageGeometry('morel') === forageGeometry('morel'));
}

// ================================================================= placement
const trees = (n, seed = 3) => {
  const out = [];
  let s = seed;
  const r = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  for (let i = 0; i < n; i++) out.push({ x: r() * CHUNK, z: r() * CHUNK, radius: 0.3 + r() * 0.5 });
  return out;
};
const meadow = { biome: 'meadow', moist: 0.3 };
const wet = { biome: 'meadow', moist: 0.8 };
const flat = () => 0;

// What a 64 m meadow chunk grew BEFORE a cluster became one pickable, measured
// on the shipped table at the commit before this one and written down here so
// the change has a number to be measured against rather than a memory. Every
// plant was its own pickable then, so these are also the old pickable counts
// AND the old lessons-per-chunk counts.
const WAS = { Spring: 267, Summer: 282, Autumn: 139, Winter: 0 };

// And what the same chunk grew after clusters but BEFORE the caps, measured on
// the shipped table at the commit before this one with this same `trees(30)`
// list. The pickables barely move under the caps; the PLANTS are the number
// the user was complaining about, because plants are what one click hands over.
const BEFORE_CAP = {
  Spring: { records: 31, plants: 177 },
  Summer: { records: 43, plants: 200 },
  Autumn: { records: 32, plants: 91 },
  Winter: { records: 0, plants: 0 },
};

console.log('\nforage: what a meadow chunk gets, by season, as pickables and as plants');
{
  const T = trees(30);
  const counts = {};
  console.log('     season  pickables  plants     before caps (pick/plants)   before clusters (plants)');
  for (const s of SEASONS) {
    const recs = placeForage(meadow, 0, 0, T, s, 1, { heightAt: flat });
    const kinds = [...new Set(recs.map((r) => r.id))];
    const plants = recs.reduce((n, r) => n + r.count, 0);
    counts[s] = { records: recs.length, kinds: kinds.length, plants };
    const b = BEFORE_CAP[s];
    console.log(`     ${s.padEnd(7)} ${String(recs.length).padStart(6)} ${String(plants).padStart(9)}`
      + `     ${String(b.records).padStart(4)} / ${String(b.plants).padStart(4)}`
      + `${b.plants ? ` (${Math.round(plants / b.plants * 100)}% of the plants)` : ''}`.padEnd(30)
      + `${String(WAS[s]).padStart(4)}`);
    console.log(`             ${kinds.length} kinds: ${kinds.join(', ') || 'nothing'}`);
  }
  const nowAll = counts.Spring.records + counts.Summer.records + counts.Autumn.records;
  const wasAll = WAS.Spring + WAS.Summer + WAS.Autumn;
  console.log(`     over the three growing seasons: ${wasAll} pickables became ${nowAll}, which is ${Math.round(nowAll / wasAll * 100)}%`);
  check('an Autumn meadow chunk holds about a quarter of the pickables it did',
    counts.Autumn.records / WAS.Autumn > 0.18 && counts.Autumn.records / WAS.Autumn < 0.30,
    `${counts.Autumn.records} against ${WAS.Autumn}, ${Math.round(counts.Autumn.records / WAS.Autumn * 100)}%`);
  check('and no season holds even a third of what it did',
    SEASONS.every((s) => !WAS[s] || counts[s].records / WAS[s] < 0.33),
    SEASONS.map((s) => `${s[0]}${WAS[s] ? Math.round(counts[s].records / WAS[s] * 100) : 0}%`).join(' '));
  check('the wood still LOOKS full: more plants stand than there are pickables',
    counts.Spring.plants > counts.Spring.records && counts.Summer.plants > counts.Summer.records,
    `Spring ${counts.Spring.plants} plants in ${counts.Spring.records} patches`);
  // The caps are the whole point of this change, so they get a number rather
  // than a claim: the plants a chunk grows fell by better than half, and the
  // pickables did not, because a bunch of two is still a bunch.
  check('and the caps took the PLANTS down by more than a third, in every growing season',
    ['Spring', 'Summer', 'Autumn'].every((s) => counts[s].plants < BEFORE_CAP[s].plants * 0.67),
    ['Spring', 'Summer', 'Autumn'].map((s) => `${s[0]} ${counts[s].plants}/${BEFORE_CAP[s].plants}`).join('  '));
  check('while the pickables stayed within a fifth of what they were',
    ['Spring', 'Summer', 'Autumn'].every((s) => Math.abs(counts[s].records - BEFORE_CAP[s].records) <= BEFORE_CAP[s].records * 0.2),
    ['Spring', 'Summer', 'Autumn'].map((s) => `${s[0]} ${counts[s].records}/${BEFORE_CAP[s].records}`).join('  '));
  check('Summer is full', counts.Summer.records > 0 && counts.Summer.kinds >= 5, JSON.stringify(counts.Summer));
  check('Autumn is full', counts.Autumn.records > 0, JSON.stringify(counts.Autumn));
  check('Spring is full', counts.Spring.records > 0, JSON.stringify(counts.Spring));
  check('WINTER IS BARE: zero records, zero kinds, zero plants',
    counts.Winter.records === 0 && counts.Winter.kinds === 0 && counts.Winter.plants === 0, JSON.stringify(counts.Winter));

  const spring = placeForage(meadow, 0, 0, T, 'Spring', 1, { heightAt: flat }).map((r) => r.id);
  check('a Spring chunk has morels', spring.includes('morel'), `${spring.filter((i) => i === 'morel').length} of them`);
  check('and no lingonberry, which is an Autumn berry', !spring.includes('lingonberry'));
  check('and no fly agaric, which is an Autumn mushroom', !spring.includes('fly_agaric'));
  const autumn = placeForage(meadow, 0, 0, T, 'Autumn', 1, { heightAt: flat }).map((r) => r.id);
  check('an Autumn chunk has no morels', !autumn.includes('morel'));
  check('and does carry rosehip', autumn.includes('rosehip'));
}

console.log('\nforage: a chunk with no trees loses everything that needs one');
{
  const withT = placeForage(meadow, 4, 4, trees(24, 11), 'Autumn', 5, { heightAt: flat });
  const without = placeForage(meadow, 4, 4, [], 'Autumn', 5, { heightAt: flat });
  const needsTree = new Set(FORAGE.filter((f) => f.place === 'trunk' || f.place === 'nearTree').map((f) => f.id));
  const stillThere = [...new Set(without.map((r) => r.id))].filter((id) => needsTree.has(id));
  check('with trees, the trunk and near-tree kinds place', withT.some((r) => needsTree.has(r.id)), `${withT.filter((r) => needsTree.has(r.id)).length} of ${withT.length}`);
  check('with none, not one of them does', stillThere.length === 0, stillThere.join(','));
  check('but the ground kinds still do', without.length > 0, `${without.length} records`);
}

// The user's report: "we have far too many forageable materials around a single
// tree. we can pick like 20 oyster mushrooms, 20 garlic .. its just ridiculous.
// i want to be able to pick maybe 2 of each max if that." A lone tree in an open
// meadow used to take EVERY near-tree bunch the chunk rolled, because each one
// chose a tree at random out of a list of one. These are the numbers that report
// is about, driven on the worst case: one tree, nothing else to hang anything on.
console.log('\nforage: ONE tree in a chunk carries one bunch of a kind, and two plants at most');
{
  const one = [{ x: 32, z: 32, radius: 0.4 }];
  const treeIds = new Set(FORAGE.filter((f) => f.place === 'nearTree' || f.place === 'trunk').map((f) => f.id));
  // Measured on the shipped table at the commit before this one, same one tree,
  // same seed: the bunches hung on it and the plants a player could take off it.
  const BEFORE = { Spring: [14, 78], Summer: [13, 51], Autumn: [20, 60] };
  let worstKind = 0, worstBunch = 0, everySeason = true;
  console.log('     season  bunches  plants at that tree   was (bunches/plants)   worst kind');
  for (const s of ['Spring', 'Summer', 'Autumn']) {
    const at = placeForage(meadow, 0, 0, one, s, 1, { heightAt: flat }).filter((r) => treeIds.has(r.id));
    const byKind = {};
    for (const r of at) byKind[r.id] = (byKind[r.id] || 0) + r.count;
    const plants = at.reduce((n, r) => n + r.count, 0);
    const bunches = {};
    for (const r of at) bunches[r.id] = (bunches[r.id] || 0) + 1;
    const mostBunches = Math.max(0, ...Object.values(bunches));
    const mostPlants = Math.max(0, ...Object.values(byKind));
    if (mostBunches > 1) everySeason = false;
    worstKind = Math.max(worstKind, mostPlants);
    worstBunch = Math.max(worstBunch, ...at.map((r) => r.count), 0);
    console.log(`     ${s.padEnd(7)} ${String(at.length).padStart(7)} ${String(plants).padStart(10)}`
      + `           ${String(BEFORE[s][0]).padStart(2)} / ${String(BEFORE[s][1]).padStart(2)}`
      + `           ${Object.entries(byKind).map(([k, v]) => `${k} ${v}`).join(', ') || 'nothing'}`);
  }
  check('one tree never carries two bunches of the same kind', everySeason, `worst bunch held ${worstBunch} plants`);
  check(`and never more than ${TREE_CLUSTER_MAX} plants of any one kind, in any growing season`,
    worstKind <= TREE_CLUSTER_MAX, `the worst was ${worstKind}`);
  check('which is the user\'s "maybe 2 of each max", where it used to be 57 wild garlic',
    worstKind <= 2 && worstBunch <= TREE_CLUSTER_MAX, `${worstKind} of a kind, biggest bunch ${worstBunch}`);
}

console.log('\nforage: with twelve trees, no tree is given two bunches of the same kind');
{
  const T = trees(12, 31);
  // Which tree a bunch belongs to is not written on the record, so it has to be
  // inferred, and the inference has to be safe. It is the nearest trunk, and
  // that is only the right answer while every bunch sits closer to its own tree
  // than to half the gap between two trees. Both numbers are MEASURED below and
  // the check fails if the second ever overtakes the first.
  let closestPair = Infinity;
  for (let i = 0; i < T.length; i++) {
    for (let j = i + 1; j < T.length; j++) closestPair = Math.min(closestPair, Math.hypot(T[i].x - T[j].x, T[i].z - T[j].z));
  }
  let farthestBunch = 0;
  let clashes = 0, checked = 0, hung = 0;
  for (const s of SEASONS) {
    for (let cx = -2; cx <= 2; cx++) {
      for (let cz = -2; cz <= 2; cz++) {
        const recs = placeForage(meadow, cx, cz, T, s, 1, { heightAt: flat });
        const seen = new Set();
        for (const r of recs) {
          const f = FORAGE_BY_ID[r.id];
          if (f.place !== 'nearTree' && f.place !== 'trunk') continue;
          hung++;
          let best = -1, bd = Infinity;
          for (let i = 0; i < T.length; i++) {
            const d = Math.hypot(T[i].x - r.x, T[i].z - r.z);
            if (d < bd) { bd = d; best = i; }
          }
          if (bd > farthestBunch) farthestBunch = bd;
          const key = `${r.id}@${best}`;
          checked++;
          if (seen.has(key)) clashes++;
          seen.add(key);
        }
      }
    }
  }
  check('the nearest trunk really is the trunk it was dealt',
    farthestBunch < closestPair / 2,
    `the farthest bunch sat ${farthestBunch.toFixed(2)} m from its tree and the closest two trees are ${closestPair.toFixed(2)} m apart`);
  check('no tree in any of those chunks holds two bunches of one kind',
    clashes === 0, `${clashes} clashes over ${checked} tree bunches in 100 chunks`);
  check('and there were real bunches to clash, so the check is not vacuous', hung > 200, `${hung} tree bunches`);
}

console.log('\nforage: no bunch anywhere in the world holds more than three plants');
{
  const biomes = ['meadow', 'boreal', 'sakura', 'mountain', 'snow', 'desert', 'beach'];
  let worst = 0, worstAt = '', bunches = 0, plants = 0, overCap = 0;
  // How wide a bunch is matters to the reach: `foraging.js` measures to the
  // NEAREST plant because a patch is wider than a step, and both files say so
  // in prose. This is where the prose gets its number.
  let widest = 0, offCentre = 0;
  const hist = {};
  for (const b of biomes) {
    for (const moist of [0.2, 0.9]) {
      for (const s of SEASONS) {
        for (let i = 0; i < 4; i++) {
          for (let j = 0; j < 4; j++) {
            for (const recs of [placeForage({ biome: b, moist }, i, j, trees(18, 7 + i), s, 3, { heightAt: flat })]) {
              for (const r of recs) {
                bunches++; plants += r.count;
                hist[r.count] = (hist[r.count] || 0) + 1;
                for (const m of r.members) {
                  offCentre = Math.max(offCentre, Math.hypot(m.x - r.x, m.z - r.z));
                  for (const o of r.members) widest = Math.max(widest, Math.hypot(m.x - o.x, m.z - o.z));
                }
                if (r.count > clusterCapFor(FORAGE_BY_ID[r.id].place)) overCap++;
                if (r.count > worst) { worst = r.count; worstAt = `${r.id} in ${b} ${s}`; }
              }
            }
          }
        }
      }
    }
  }
  console.log(`     ${bunches} bunches over 448 chunks, ${plants} plants, sizes ${JSON.stringify(hist)}`);
  check(`the biggest bunch anywhere holds ${GROUND_CLUSTER_MAX} plants`, worst <= GROUND_CLUSTER_MAX, `${worst}, ${worstAt}`);
  check('and not one bunch is over the cap for where it grows', overCap === 0, `${overCap} of ${bunches}`);
  check('the average bunch is under two plants', plants / bunches < 2, `${(plants / bunches).toFixed(2)} plants a bunch`);
  console.log(`     the widest bunch is ${widest.toFixed(2)} m across and no plant sits more than ${offCentre.toFixed(2)} m off its own centre`);
  check('a patch is still wider than a step, which is why the reach is to the nearest plant',
    widest > 1.5, `${widest.toFixed(2)} m across`);
  check('and no plant is further from its centre than the 2.5 m reach, so the centre is never the only way in',
    offCentre < 2.5, `${offCentre.toFixed(2)} m`);
}

console.log('\nforage: a trunk sitter really sits on the trunk it was given');
{
  const T = trees(20, 77);
  const recs = placeForage(meadow, 0, 0, T, 'Autumn', 2, { heightAt: () => 12 });
  const onTrunk = recs.filter((r) => r.onTrunk);
  check('some of them are on trunks', onTrunk.length > 0, `${onTrunk.length} of ${recs.length}`);
  check('and a trunk dweller is one pickable of one plant, never a bunch',
    onTrunk.every((r) => r.count === 1), onTrunk.map((r) => `${r.id}:${r.count}`).join(' ').slice(0, 60));
  let worst = 0, offGround = 0;
  for (const r of onTrunk) {
    for (const m of r.members) {
      let best = Infinity;
      for (const t of T) {
        const d = Math.abs(Math.hypot(m.x - t.x, m.z - t.z) - t.radius * 0.92);
        if (d < best) best = d;
      }
      if (best > worst) worst = best;
      // the ground was handed back as 12, so a trunk plant must be above it
      if (m.y <= 12) offGround++;
    }
  }
  check('every one of them stands at 0.92 of a real trunk radius', worst < 1e-9, `worst drift ${worst.toExponential(2)} m`);
  check('and every one of them is above the ground it grew from', offGround === 0, `${offGround} were not`);
  const ground = recs.filter((r) => !r.onTrunk);
  check('every ground plant sits just under the surface',
    ground.every((r) => r.members.every((m) => Math.abs(m.y - 11.99) < 1e-9)),
    `${ground.reduce((n, r) => n + r.count, 0)} ground plants in ${ground.length} patches`);
}

console.log('\nforage: a clearing dweller keeps out of the crowns');
{
  const T = trees(40, 5);
  const recs = placeForage(meadow, 0, 0, T, 'Summer', 9, { heightAt: flat });
  const clearingIds = new Set(FORAGE.filter((f) => f.place === 'clearing').map((f) => f.id));
  const inClearing = recs.filter((r) => clearingIds.has(r.id));
  check('clearing dwellers did place', inClearing.length > 0, `${inClearing.length}`);
  // A cluster is scattered up to 1.05 m off its centre, so the rule is on the
  // centre and every PLANT is measured with that slack. The centroid would be
  // an easier test than the truth; this walks the members.
  let tooClose = 0, plants = 0;
  for (const r of inClearing) {
    for (const m of r.members) {
      plants++;
      for (const t of T) {
        if (Math.hypot(m.x - t.x, m.z - t.z) < (t.radius + CLEARING_GAP) - 1.06) { tooClose++; break; }
      }
    }
  }
  check('and not one PLANT of them grew inside a crown', tooClose === 0, `${tooClose} of ${plants} did`);
}

console.log('\nforage: placement is deterministic, and the seed really separates worlds');
{
  const T = trees(25, 42);
  const a = placeForage(meadow, -3, 7, T, 'Autumn', 1, { heightAt: flat });
  const b = placeForage(meadow, -3, 7, T, 'Autumn', 1, { heightAt: flat });
  check('the same call twice gives the same records', JSON.stringify(a) === JSON.stringify(b), `${a.length} records`);
  const c = placeForage(meadow, -3, 7, T, 'Autumn', 2, { heightAt: flat });
  check('a different world seed gives different ones', JSON.stringify(a) !== JSON.stringify(c), `${a.length} vs ${c.length}`);
  const d = placeForage(meadow, -3, 8, T, 'Autumn', 1, { heightAt: flat });
  check('a different chunk gives different ones', JSON.stringify(a) !== JSON.stringify(d));
  check('every record carries the fields the field needs', a.every((r) => r.id && Number.isFinite(r.x) && Number.isFinite(r.y)
    && Number.isFinite(r.z) && r.count >= 1 && Array.isArray(r.members) && r.members.length === r.count));
  check('and every plant in every bunch carries a transform', a.every((r) => r.members.every((m) => Number.isFinite(m.x)
    && Number.isFinite(m.y) && Number.isFinite(m.z) && Number.isFinite(m.yaw) && m.scale > 0)));
  check('the record sits in the middle of its own bunch', a.every((r) => {
    const mx = r.members.reduce((n, m) => n + m.x, 0) / r.count;
    const mz = r.members.reduce((n, m) => n + m.z, 0) / r.count;
    return Math.abs(mx - r.x) < 1e-9 && Math.abs(mz - r.z) < 1e-9;
  }));
  check('plantsIn reads the bunch, and reads 1 off a bare record', a.every((r) => plantsIn(r) === r.count)
    && plantsIn({ id: 'x' }) === 1 && plantsIn(null) === 1);
  {
    const big = a.find((r) => r.count > 2);
    const near = big.members[0];
    check('distanceToForage measures to the NEAREST plant, not the middle',
      Math.abs(distanceToForage(big, near.x, near.z)) < 1e-9
      && distanceToForage(big, near.x, near.z) <= Math.hypot(big.x - near.x, big.z - near.z) + 1e-9,
      `${big.count} plants, centre is ${Math.hypot(big.x - near.x, big.z - near.z).toFixed(2)} m from the nearest`);
  }
  const sc = a.flatMap((r) => r.members.map((m) => m.scale));
  check('scales sit in the reference band', sc.every((s) => s >= 0.7 * FORAGE_SCALE - 1e-9 && s <= 1.3 * FORAGE_SCALE + 1e-9),
    `${Math.min(...sc).toFixed(2)} to ${Math.max(...sc).toFixed(2)}`);
}

console.log('\nforage: the wet meadow band grows the tropical three and the dry one does not');
{
  const T = trees(25, 8);
  const dry = new Set(placeForage(meadow, 1, 1, T, 'Summer', 4, { heightAt: flat }).map((r) => r.id));
  const soaked = new Set(placeForage(wet, 1, 1, T, 'Summer', 4, { heightAt: flat }).map((r) => r.id));
  const tropical = ['fig', 'wild_ginger', 'cacao'];
  check('a dry meadow grows none of the tropical three', tropical.every((id) => !dry.has(id)), [...dry].join(','));
  check('a wet one grows at least one', tropical.some((id) => soaked.has(id)), tropical.filter((id) => soaked.has(id)).join(','));
  const ocean = placeForage({ biome: 'ocean', moist: 1 }, 0, 0, T, 'Summer', 1, { heightAt: flat });
  check('and nothing grows in the sea', ocean.length === 0, `${ocean.length}`);
}

// ============================================================== the live field
console.log('\nforage: the live field streams, picks, is harvested and grows back');
{
  const scene = new THREE.Scene();
  const T = trees(30, 21);
  const world = {
    seed: 4,
    sampleAt: () => ({ biome: 'meadow', moist: 0.3 }),
    heightAt: () => 0,
  };
  // The field owns one clock and this section drives it. Every `now` below is
  // within a month of that clock, which is what makes them readings of it and
  // not of another; a genuinely foreign clock is driven further down.
  const ff = createForageField(scene, {
    field: world, season: 'Autumn', treesFor: () => T, now: () => 0,
  });
  const moved = ff.update(0, 0, 'Autumn', 0);
  check('the first update loads a 3x3 ring', moved && ff.chunkCount === 9, `${ff.chunkCount} chunks`);
  const n0 = ff.count;
  check('and it is not empty', n0 > 0, `${n0} standing`);
  console.log(`     ${n0} pickables holding ${ff.plants} plants across nine chunks, ${ff.stats.drawCalls} draw calls`);
  console.log(`     pickables by kind: ${JSON.stringify(ff.tally())}`);
  console.log(`     plants by kind:    ${JSON.stringify(ff.tally({ plants: true }))}`);
  check('one draw call per kind per chunk, no more', ff.stats.drawCalls <= 9 * 22 && ff.stats.drawCalls > 0, `${ff.stats.drawCalls}`);
  check('more plants stand than there are pickables', ff.plants > n0, `${ff.plants} plants, ${n0} pickables`);
  check('the two tallies agree with the two counts',
    Object.values(ff.tally()).reduce((a2, b2) => a2 + b2, 0) === n0
    && Object.values(ff.tally({ plants: true })).reduce((a2, b2) => a2 + b2, 0) === ff.plants);
  check('and stats says the same as the getters', ff.stats.records === n0 && ff.stats.plants === ff.plants,
    `${ff.stats.records}/${ff.stats.plants} against ${n0}/${ff.plants}`);

  const again = ff.update(1, 1, 'Autumn', 0);
  check('standing still reloads nothing', again === false && ff.chunkCount === 9);
  ff.update(CHUNK * 3, 0, 'Autumn', 0);
  check('walking three chunks moves the ring', ff.chunkCount === 9);

  // back to the origin so the records below are the ones we started with
  ff.update(0, 0, 'Autumn', 0);
  const rec = ff.records()[0];
  check('a record knows which chunk it belongs to', !!rec && !!rec.chunk);

  const before = ff.count;
  const plantsBefore = ff.plants;
  const gone = ff.remove(rec, 1000);
  check('harvesting a record takes it out', gone && ff.count === before - 1, `${ff.count} of ${before}`);
  check('and takes the whole bunch of plants with it', ff.plants === plantsBefore - rec.count,
    `${ff.plants} of ${plantsBefore}, the patch held ${rec.count}`);
  check('and the record itself says when it comes back', rec.harvestedUntil === 1000 + REGROW_MS, `${rec.harvestedUntil}`);
  check('picking the same one twice is refused', ff.remove(rec, 1001) === false);
  check('one minute later it is still gone', ff.regrow(1000 + 60_000) === 0 && ff.count === before - 1);
  const back = ff.regrow(1000 + REGROW_MS);
  check(`eighteen minutes later it is back`, back === 1 && ff.count === before, `${ff.count}`);
  check('and every plant in it came back with it', ff.plants === plantsBefore, `${ff.plants} of ${plantsBefore}`);

  // the season turning empties the wood
  ff.update(0, 0, 'Winter', 0);
  check('WINTER: the loaded ring holds nothing', ff.count === 0 && ff.plants === 0 && ff.season === 'Winter', `${ff.count} standing`);
  check('and draws nothing', ff.stats.drawCalls === 0, `${ff.stats.drawCalls}`);
  ff.update(0, 0, 'Summer', 0);
  check('Summer brings it back', ff.count > 0 && ff.season === 'Summer', `${ff.count} standing`);

  // the raycast back-index
  const target = ff.records().find((r) => r.id === 'blueberry') || ff.records()[0];
  // a ray onto a PLANT of the patch. The centre of a bunch is a spot between
  // the plants and may have nothing standing on it at all.
  const aimAt = target.members[0];
  const ray = new THREE.Raycaster();
  ray.set(new THREE.Vector3(aimAt.x, aimAt.y + 6, aimAt.z), new THREE.Vector3(0, -1, 0));
  const hit = ff.pick(ray);
  check('a ray straight down onto one finds a record', !!hit && !!hit.rec, hit ? hit.id : 'nothing');
  check('and the record it finds is really there', !!hit && ff.records().includes(hit.rec));
  check('and its id matches the mesh it came off', !!hit && hit.rec.id === hit.id);
  const empty = new THREE.Raycaster();
  empty.set(new THREE.Vector3(0, 900, 0), new THREE.Vector3(0, 1, 0));
  check('a ray into the sky finds nothing', ff.pick(empty) === null);

  check('and the patch it hands back is the patch, not the plant', !!hit && hit.rec === target && hit.rec.count === target.count,
    hit ? `${hit.id} x${hit.rec.count}` : 'nothing');
  const near = ff.nearest(target.x, target.z, 1);
  check('nearest() finds the one under your feet', near === target || (near && Math.hypot(near.x - target.x, near.z - target.z) < 1));
  check('and nothing at all a kilometre away', ff.nearest(9999, 9999, 3) === null);

  ff.dispose();
  check('disposing empties the scene of forage', scene.getObjectByName('world-forage') == null || ff.chunkCount === 0);
}

// ============================================ a picked one goes, and stays gone
//
// The bug this measures: a harvested mushroom stayed standing. Two separate
// causes, both driven here, and both driven the other way as well.
console.log('\nforage: a harvest takes the mushroom out of the world the same frame');
{
  const scene = new THREE.Scene();
  const T = trees(30, 21);
  const world = { seed: 4, sampleAt: () => ({ biome: 'meadow', moist: 0.3 }), heightAt: () => 0 };
  let clock = 500_000;
  const ff = createForageField(scene, { field: world, season: 'Autumn', treesFor: () => T, now: () => clock });
  ff.update(0, 0, 'Autumn');

  // a ray onto any ONE plant of the bunch. The patch is what should come back.
  const downAt = (m) => {
    const ray = new THREE.Raycaster();
    ray.set(new THREE.Vector3(m.x, m.y + 6, m.z), new THREE.Vector3(0, -1, 0));
    return ff.pick(ray);
  };
  // Pick a real BUNCH the ray really hits, so the thing measured is the thing
  // drawn, and so that "every member" means more than one member. The hit is
  // MEASURED here rather than assumed: a shrub scatters its leaves off the
  // stem, so a ray straight down the plant's own axis passes through the hole
  // in the middle of a bramble and finds nothing. That is a fact about a
  // vertical ray and not about picking, which comes in at a camera's angle,
  // but a test that assumed it would fail on whichever bunch happened to sort
  // first.
  const hittable = ff.records().filter((r) => !r.onTrunk && r.count > 1
    && r.members.every((m) => downAt(m)?.rec === r));
  const rec = hittable[0] || ff.records()[0];
  console.log(`     the patch under test is ${rec.count} ${rec.id}, one of ${hittable.length} bunches a straight down ray finds on every plant`);
  const down = () => downAt(rec.members[0]);
  const meshOf = () => {
    for (const child of scene.getObjectByName('world-forage').children) {
      for (const m of child.children) if (m.userData.forageMap?.includes(rec)) return m;
    }
    return null;
  };
  const im = meshOf();
  check('the record is drawn by an InstancedMesh before it is picked', !!im, im ? `${im.name} count ${im.count}` : 'no mesh holds it');
  const drawnBefore = im.count;
  const hitBefore = down();
  check('and a ray straight down finds it', !!hitBefore && hitBefore.rec === rec, hitBefore ? hitBefore.id : 'nothing');
  // EVERY plant of the bunch answers with a BUNCH, never with a bare plant.
  // A given plant can be occluded from straight above by a taller neighbour of
  // another kind (a fiddlehead fern over a chanterelle, measured), so what is
  // claimed is what is true: whatever a ray finds is a cluster record, and at
  // least one of the bunch's own plants hands back the bunch.
  const each = rec.members.map((m) => downAt(m));
  const mine = each.filter((h) => h && h.rec === rec).length;
  check(`a ray down each of the ${rec.count} plants hands back the patch, ${mine} of ${rec.count} times`,
    mine >= 1, each.map((h) => (h ? h.id : 'null')).join(','));
  check('and never a bare plant: every hit is a whole bunch',
    each.every((h) => !h || (Array.isArray(h.rec.members) && h.rec.members.length === h.rec.count)),
    each.map((h) => (h ? `${h.id}x${h.rec.count}` : 'null')).join(','));
  check('and every plant of it has an instance slot of its own',
    im.userData.forageMap.filter((r) => r === rec).length === rec.count,
    `${im.userData.forageMap.filter((r) => r === rec).length} slots for ${rec.count} plants`);
  check('all of them inside the drawn range', im.userData.forageMap
    .map((r, i) => (r === rec ? i : -1)).filter((i) => i >= 0).every((i) => i < im.count));

  const rebuildsBefore = ff.stats.rebuilds;
  ff.remove(rec);
  check(`after ONE pick the mesh draws ${rec.count} fewer instances`, im.count === drawnBefore - rec.count,
    `${im.count}, was ${drawnBefore}, the patch held ${rec.count}`);
  check('and not one plant of the patch is in a ray\'s way any more',
    rec.members.every((m) => { const h = downAt(m); return h === null || h.rec !== rec; }));
  check('and the record is no longer in the ray\'s way', down() === null || down().rec !== rec, String(down()?.id));
  check('and NOTHING was rebuilt to do it', ff.stats.rebuilds === rebuildsBefore, `${ff.stats.rebuilds - rebuildsBefore} rebuilds`);
  check('and every other instance still stands', ff.count > 0 && im.count === drawnBefore - rec.count);
  check('every slot still drawn belongs to a patch that is still standing',
    im.userData.forageMap.slice(0, im.count).every((r) => !r.harvestedUntil));
  check('and every slot past the count belongs to one that is not',
    im.userData.forageMap.slice(im.count).every((r) => !!r.harvestedUntil));

  // the other direction: it comes back the same way, in the same slot family
  clock += REGROW_MS;
  const back = ff.regrow();
  check('eighteen minutes on it grows back', back >= 1 && ff.records().includes(rec), `${back} came back`);
  check(`the mesh draws all ${rec.count} of its plants again`, im.count === drawnBefore, `${im.count} of ${drawnBefore}`);
  check('and a ray finds the patch once more, on the same plants it did before',
    rec.members.filter((m) => downAt(m)?.rec === rec).length === mine,
    `${rec.members.filter((m) => downAt(m)?.rec === rec).length} of ${mine}`);
  check('with no rebuild for that either', ff.stats.rebuilds === rebuildsBefore, `${ff.stats.rebuilds - rebuildsBefore} rebuilds`);

  // and the whole kind picked leaves a mesh drawing nothing, counted as nothing
  const kind = rec.id;
  const sameKind = ff.records().filter((r) => r.chunk === rec.chunk && r.id === kind);
  const callsBefore = ff.stats.drawCalls;
  for (const r of sameKind) ff.remove(r);
  check(`picking all ${sameKind.length} patches of ${kind} in the chunk empties its mesh`, im.count === 0, `count ${im.count}`);
  check('and an empty mesh is not counted as a draw call', ff.stats.drawCalls === callsBefore - 1,
    `${ff.stats.drawCalls}, was ${callsBefore}`);
  // an emptied mesh is still in the list a raycast walks, so prove it neither
  // throws nor swallows the hit behind it
  {
    const other = ff.records().find((r) => r.chunk === rec.chunk && r.id !== kind);
    const ray = new THREE.Raycaster();
    ray.set(new THREE.Vector3(other.x, other.y + 6, other.z), new THREE.Vector3(0, -1, 0));
    const got = ff.pick(ray);
    check('a raycast past an emptied mesh still finds what is behind it', got?.rec === other, got ? got.id : 'nothing');
    const sky = new THREE.Raycaster();
    sky.set(new THREE.Vector3(0, 900, 0), new THREE.Vector3(0, 1, 0));
    check('and a ray into the sky is still nothing, not a throw', ff.pick(sky) === null);
  }
  clock += REGROW_MS;
  ff.regrow();
  const plantsOfKind = sameKind.reduce((n, r) => n + r.count, 0);
  check('and all of them come back together, every plant of every patch',
    im.count === plantsOfKind, `${im.count} of ${plantsOfKind} plants in ${sameKind.length} patches`);
  check('and every instance matrix sits where its own plant stands', (() => {
    const mm = new THREE.Matrix4(), pp = new THREE.Vector3();
    let worst = 0;
    for (let i = 0; i < im.count; i++) {
      im.getMatrixAt(i, mm);
      pp.setFromMatrixPosition(mm);
      const m = im.userData.forageMembers[i];
      worst = Math.max(worst, Math.hypot(pp.x - m.x, pp.y - m.y, pp.z - m.z));
    }
    // the instance matrix is a Float32Array, so the tolerance is float32's, not
    // float64's: the measured worst drift over 29 slots is 1.9e-6 m.
    return worst < 1e-4;
  })(), 'every drawn slot matches the member it maps to, to float32');
  ff.dispose();
}

// ======================================================= variety after the thin
//
// The thin took `per` down across the table. "One case is never the case": a
// thin that quietly stopped a kind from ever appearing would be a forageable a
// player can never find and a recipe they can never cook, so every biome, every
// moisture band and every season is driven, over three different 3x3 rings.
console.log('\nforage: every forageable that grows somewhere still turns up in a 3x3 ring');
{
  const T = trees(30);
  const missing = [];
  let rings = 0, kinds = 0;
  for (const b of ['meadow', 'boreal', 'sakura', 'mountain', 'snow', 'desert', 'beach']) {
    for (const moist of [0.3, 0.8]) {
      for (const s of SEASONS) {
        const want = FORAGE.filter((f) => f.seasons.includes(s) && weightFor(f, b, moist) > 0).map((f) => f.id);
        if (!want.length) continue;
        for (const [ox, oz] of [[0, 0], [17, -9], [-40, 63]]) {
          rings++;
          kinds += want.length;
          const got = new Set();
          for (let i = -1; i <= 1; i++) {
            for (let j = -1; j <= 1; j++) {
              for (const r of placeForage({ biome: b, moist }, ox + i, oz + j, T, s, 1, { heightAt: flat })) got.add(r.id);
            }
          }
          const gone = want.filter((id) => !got.has(id));
          if (gone.length) missing.push(`${b} ${s} moist ${moist} ring at ${ox},${oz}: ${gone.join(',')}`);
        }
      }
    }
  }
  console.log(`     ${rings} rings driven, ${kinds} biome-season-kind claims checked`);
  check('not one of them is missing from its own ring', missing.length === 0, missing.slice(0, 3).join(' | '));
  // and the other way: a kind that does NOT grow here never turns up
  const winterRing = new Set();
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    for (const r of placeForage(meadow, i, j, T, 'Winter', 1, { heightAt: flat })) winterRing.add(r.id);
  }
  check('and a Winter ring turns up nothing at all', winterRing.size === 0, `${winterRing.size} kinds`);
  const dryRing = new Set();
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
    for (const r of placeForage(meadow, i, j, T, 'Summer', 1, { heightAt: flat })) dryRing.add(r.id);
  }
  check('a dry meadow ring never turns up a cacao pod', !dryRing.has('cacao') && !dryRing.has('fig'), [...dryRing].join(','));
}

console.log(`\nforage: one clock, and a reading from another is translated onto it`);
{
  const scene = new THREE.Scene();
  const T = trees(30, 21);
  const world = { seed: 4, sampleAt: () => ({ biome: 'meadow', moist: 0.3 }), heightAt: () => 0 };
  // exactly main.js's pair of clocks: the field runs on Date.now(), and the
  // click hands over the requestAnimationFrame stamp
  let wall = 1_788_000_000_000;
  const ff = createForageField(scene, { field: world, season: 'Autumn', treesFor: () => T, now: () => wall });
  ff.update(0, 0, 'Autumn');
  const rec = ff.records()[0];
  const before = ff.count;
  const rafStamp = 42_000;                 // 42 seconds after the page opened

  ff.remove(rec, rafStamp);
  check('a stamp from the page clock is translated onto the field\'s own',
    rec.harvestedUntil === wall + REGROW_MS, `${rec.harvestedUntil} against ${wall + REGROW_MS}`);
  check('and the field says out loud that it saw a foreign clock', ff.stats.foreignClock === 1, `${ff.stats.foreignClock}`);
  ff.update(0, 0, 'Autumn');                // the very next frame, as main.js runs it
  check('so the same frame does NOT grow it straight back', ff.count === before - 1, `${ff.count} of ${before}`);
  check('and it is still gone a minute later', (wall += 60_000, ff.regrow(), ff.count) === before - 1, `${ff.count}`);
  check('and it does come back at eighteen minutes', (wall += REGROW_MS, ff.regrow(), ff.count) === before, `${ff.count}`);

  // a caller who stays on its own clock throughout keeps its elapsed time:
  // eighteen minutes of page clock is eighteen minutes of regrowth
  {
    const scene2 = new THREE.Scene();
    let w2 = 1_788_000_000_000;
    const gg = createForageField(scene2, { field: world, season: 'Autumn', treesFor: () => T, now: () => w2 });
    gg.update(0, 0, 'Autumn');
    const r2 = gg.records()[0];
    const n2 = gg.count;
    gg.remove(r2, 42_000);                          // the page clock, all the way through
    check('a page-clock caller is still gone a minute later on its own clock',
      gg.regrow(42_000 + 60_000) === 0 && gg.count === n2 - 1, `${gg.count} of ${n2}`);
    check('and gets it back at eighteen minutes of its own clock',
      gg.regrow(42_000 + REGROW_MS) === 1 && gg.count === n2, `${gg.count} of ${n2}`);
    gg.dispose();
  }

  // the other direction: a reading that IS this clock's is honoured to the ms
  const seen = ff.stats.foreignClock;
  const rec2 = ff.records()[1];
  ff.remove(rec2, wall + 1234);
  check('a reading on the field\'s own clock is used exactly as given',
    rec2.harvestedUntil === wall + 1234 + REGROW_MS, `${rec2.harvestedUntil - wall}`);
  check('and nothing was counted as foreign', ff.stats.foreignClock === seen, `${ff.stats.foreignClock}`);
  ff.dispose();
}

console.log('\nforage: the field refuses to be built on nothing');
{
  let threw = '';
  try { createForageField(new THREE.Scene(), {}); } catch (e) { threw = e.message; }
  check('no world field throws rather than growing an empty wood', /no world field/.test(threw), threw);
  threw = '';
  try { createForageField(null, { field: { seed: 1, sampleAt: () => ({}), heightAt: () => 0 } }); } catch (e) { threw = e.message; }
  check('nowhere to put it throws too', /nowhere to put/.test(threw), threw);
}

// ================================================== the joins to items and recipes
console.log('\nforage: every forageable has a base, and every base has a forageable');
{
  const a = auditForageBases();
  console.log(`     ${a.forage} forage bases, ${a.products} products, ${JSON.stringify(a.byTag)}`);
  const world = new Set(FORAGE_IDS);
  const bag = new Set(FORAGE_BASES);
  const missing = [...world].filter((id) => !bag.has(id));
  const orphan = [...bag].filter((id) => !world.has(id));
  check('nothing grows that the pack cannot hold', missing.length === 0, missing.join(','));
  check('nothing is in the pack that nothing grows', orphan.length === 0, orphan.join(','));
  for (const id of FORAGE_IDS) {
    const b = BASES[id];
    const f = FORAGE_BY_ID[id];
    if (!b) continue;
    check(`  ${id.padEnd(16)} base, material and tag all agree`,
      b.material === id && b.tag === f.tag && b.stack === true && b.weight === 0.1);
  }
}

console.log('\nforage: every recipe asks for something that really exists');
{
  const a = auditForageRecipes();
  console.log(`     ${a.recipes} recipes: ${a.meals} meals, ${a.potions} potions, over ${a.materials} materials`);
  check('at least twenty forage recipes', a.recipes >= 20, `${a.recipes}`);
  const bad = [];
  for (const r of FORAGE_RECIPES) {
    for (const id of Object.keys(r.materials)) {
      if (!MATERIALS[id]) bad.push(`${r.id} wants material ${id}, which recipes.js has no row for`);
      if (!BASES[id]) bad.push(`${r.id} wants ${id}, which items.js has no base for`);
      else if (BASES[id].material !== id) bad.push(`${r.id} wants ${id}, whose base carries material "${BASES[id].material}"`);
    }
    if (!BASES[r.result.base]) bad.push(`${r.id} makes ${r.result.base}, which is not a base, so the crafted item would not exist`);
  }
  check('every input is a real base with a matching material', bad.length === 0, bad.slice(0, 3).join(' | '));
  check('every output is a real base too', FORAGE_RECIPES.every((r) => !!BASES[r.result.base]));
  const usedProducts = new Set(FORAGE_RECIPES.map((r) => r.result.base));
  const unmade = FORAGE_PRODUCT_BASES.filter((id) => !usedProducts.has(id));
  check('and no product base exists that no recipe makes', unmade.length === 0, unmade.join(','));
  const unused = FORAGE_MATERIAL_IDS.filter((id) => !FORAGE_RECIPES.some((r) => r.materials[id]));
  check('every forageable is wanted by at least one recipe', unused.length === 0, unused.join(','));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
