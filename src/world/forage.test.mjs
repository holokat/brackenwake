// The forage table, the seasons, the placement and the live field.
// Run: node src/world/forage.test.mjs
//
// Nothing here is asserted on the strength of having been written. Every
// prototype is built and its triangles counted off the vertex buffer; every
// gate is driven BOTH ways (Summer AND Winter, a chunk with trees AND one
// without, a wet meadow AND a dry one); the joins to items.js and recipes.js
// are checked in both directions, so a mushroom with no base and a base with no
// mushroom both fail here.

import * as THREE from 'three';
import {
  FORAGE, FORAGE_IDS, FORAGE_BY_ID, SEASONS, SEASON_MS, YEAR_MS, DAY_MS, REGROW_MS,
  seasonAt, seasonIndexAt, seasonProgress, nextSeasonAt,
  placeForage, createForageField, forageGeometry, forageTriangles, auditForage,
  weightFor, mapBio, idsIn, WET_MOIST, WET_KEY, CLEARING_GAP, FORAGE_SCALE,
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

console.log('\nforage: what a meadow chunk gets, by season');
{
  const T = trees(30);
  const counts = {};
  for (const s of SEASONS) {
    const recs = placeForage(meadow, 0, 0, T, s, 1, { heightAt: flat });
    const kinds = [...new Set(recs.map((r) => r.id))];
    counts[s] = { records: recs.length, kinds: kinds.length };
    console.log(`     ${s.padEnd(7)} ${String(recs.length).padStart(4)} records of ${kinds.length} kinds: ${kinds.join(', ') || 'nothing'}`);
  }
  check('Summer is full', counts.Summer.records > 0 && counts.Summer.kinds >= 5, JSON.stringify(counts.Summer));
  check('Autumn is full', counts.Autumn.records > 0, JSON.stringify(counts.Autumn));
  check('Spring is full', counts.Spring.records > 0, JSON.stringify(counts.Spring));
  check('WINTER IS BARE: zero records, zero kinds', counts.Winter.records === 0 && counts.Winter.kinds === 0, JSON.stringify(counts.Winter));

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

console.log('\nforage: a trunk sitter really sits on the trunk it was given');
{
  const T = trees(20, 77);
  const recs = placeForage(meadow, 0, 0, T, 'Autumn', 2, { heightAt: () => 12 });
  const onTrunk = recs.filter((r) => r.onTrunk);
  check('some of them are on trunks', onTrunk.length > 0, `${onTrunk.length} of ${recs.length}`);
  let worst = 0, offGround = 0;
  for (const r of onTrunk) {
    let best = Infinity;
    for (const t of T) {
      const d = Math.abs(Math.hypot(r.x - t.x, r.z - t.z) - t.radius * 0.92);
      if (d < best) best = d;
    }
    if (best > worst) worst = best;
    // the ground was handed back as 12, so a trunk record must be above it
    if (r.y <= 12) offGround++;
  }
  check('every one of them stands at 0.92 of a real trunk radius', worst < 1e-9, `worst drift ${worst.toExponential(2)} m`);
  check('and every one of them is above the ground it grew from', offGround === 0, `${offGround} were not`);
  const ground = recs.filter((r) => !r.onTrunk);
  check('a ground record sits just under the surface', ground.every((r) => Math.abs(r.y - 11.99) < 1e-9), `${ground.length} ground records`);
}

console.log('\nforage: a clearing dweller keeps out of the crowns');
{
  const T = trees(40, 5);
  const recs = placeForage(meadow, 0, 0, T, 'Summer', 9, { heightAt: flat });
  const clearingIds = new Set(FORAGE.filter((f) => f.place === 'clearing').map((f) => f.id));
  const inClearing = recs.filter((r) => clearingIds.has(r.id));
  check('clearing dwellers did place', inClearing.length > 0, `${inClearing.length}`);
  // A cluster is scattered up to 1.05 m off its centre, so the test is on the
  // cluster centre rule, measured with that slack.
  let tooClose = 0;
  for (const r of inClearing) {
    for (const t of T) {
      if (Math.hypot(r.x - t.x, r.z - t.z) < (t.radius + CLEARING_GAP) - 1.06) { tooClose++; break; }
    }
  }
  check('and none of them grew inside a crown', tooClose === 0, `${tooClose} did`);
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
    && Number.isFinite(r.z) && Number.isFinite(r.yaw) && r.scale > 0));
  const sc = a.map((r) => r.scale);
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
  console.log(`     ${n0} forageables across nine chunks, ${ff.stats.drawCalls} draw calls, ${JSON.stringify(ff.tally())}`);
  check('one draw call per kind per chunk, no more', ff.stats.drawCalls <= 9 * 22 && ff.stats.drawCalls > 0, `${ff.stats.drawCalls}`);

  const again = ff.update(1, 1, 'Autumn', 0);
  check('standing still reloads nothing', again === false && ff.chunkCount === 9);
  ff.update(CHUNK * 3, 0, 'Autumn', 0);
  check('walking three chunks moves the ring', ff.chunkCount === 9);

  // back to the origin so the records below are the ones we started with
  ff.update(0, 0, 'Autumn', 0);
  const rec = ff.records()[0];
  check('a record knows which chunk it belongs to', !!rec && !!rec.chunk);

  const before = ff.count;
  const gone = ff.remove(rec, 1000);
  check('harvesting a record takes it out', gone && ff.count === before - 1, `${ff.count} of ${before}`);
  check('and the record itself says when it comes back', rec.harvestedUntil === 1000 + REGROW_MS, `${rec.harvestedUntil}`);
  check('picking the same one twice is refused', ff.remove(rec, 1001) === false);
  check('one minute later it is still gone', ff.regrow(1000 + 60_000) === 0 && ff.count === before - 1);
  const back = ff.regrow(1000 + REGROW_MS);
  check(`eighteen minutes later it is back`, back === 1 && ff.count === before, `${ff.count}`);

  // the season turning empties the wood
  ff.update(0, 0, 'Winter', 0);
  check('WINTER: the loaded ring holds nothing', ff.count === 0 && ff.season === 'Winter', `${ff.count} standing`);
  check('and draws nothing', ff.stats.drawCalls === 0, `${ff.stats.drawCalls}`);
  ff.update(0, 0, 'Summer', 0);
  check('Summer brings it back', ff.count > 0 && ff.season === 'Summer', `${ff.count} standing`);

  // the raycast back-index
  const target = ff.records().find((r) => r.id === 'blueberry') || ff.records()[0];
  const ray = new THREE.Raycaster();
  ray.set(new THREE.Vector3(target.x, target.y + 6, target.z), new THREE.Vector3(0, -1, 0));
  const hit = ff.pick(ray);
  check('a ray straight down onto one finds a record', !!hit && !!hit.rec, hit ? hit.id : 'nothing');
  check('and the record it finds is really there', !!hit && ff.records().includes(hit.rec));
  check('and its id matches the mesh it came off', !!hit && hit.rec.id === hit.id);
  const empty = new THREE.Raycaster();
  empty.set(new THREE.Vector3(0, 900, 0), new THREE.Vector3(0, 1, 0));
  check('a ray into the sky finds nothing', ff.pick(empty) === null);

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

  // pick the one a ray really hits, so the thing measured is the thing drawn
  const rec = ff.records().find((r) => !r.onTrunk) || ff.records()[0];
  const down = () => {
    const ray = new THREE.Raycaster();
    ray.set(new THREE.Vector3(rec.x, rec.y + 6, rec.z), new THREE.Vector3(0, -1, 0));
    return ff.pick(ray);
  };
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

  const rebuildsBefore = ff.stats.rebuilds;
  ff.remove(rec);
  check('after the pick the mesh draws one fewer instance', im.count === drawnBefore - 1, `${im.count}, was ${drawnBefore}`);
  check('and the record is no longer in the ray\'s way', down() === null || down().rec !== rec, String(down()?.id));
  check('and NOTHING was rebuilt to do it', ff.stats.rebuilds === rebuildsBefore, `${ff.stats.rebuilds - rebuildsBefore} rebuilds`);
  check('and every other instance still stands', ff.count > 0 && im.count === drawnBefore - 1);

  // the other direction: it comes back the same way, in the same slot family
  clock += REGROW_MS;
  const back = ff.regrow();
  check('eighteen minutes on it grows back', back >= 1 && ff.records().includes(rec), `${back} came back`);
  check('the mesh draws it again', im.count === drawnBefore, `${im.count} of ${drawnBefore}`);
  check('and a ray finds it once more', down()?.rec === rec, String(down()?.id));
  check('with no rebuild for that either', ff.stats.rebuilds === rebuildsBefore, `${ff.stats.rebuilds - rebuildsBefore} rebuilds`);

  // and the whole kind picked leaves a mesh drawing nothing, counted as nothing
  const kind = rec.id;
  const sameKind = ff.records().filter((r) => r.chunk === rec.chunk && r.id === kind);
  const callsBefore = ff.stats.drawCalls;
  for (const r of sameKind) ff.remove(r);
  check(`picking all ${sameKind.length} ${kind} in the chunk empties its mesh`, im.count === 0, `count ${im.count}`);
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
  check('and all of them come back together', im.count === sameKind.length, `${im.count} of ${sameKind.length}`);
  ff.dispose();
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
