// Wild animals, driven both ways. Run: node src/world/fauna.test.mjs
//
// spawnsFor and blockedAt are pure, so the spawn table and every exclusion can
// be checked in node against the real world field. The runtime (cap, night,
// despawn, the hunt contract) is checked by driving the REAL createFauna with a
// THREE.Group standing in for the scene and a small stub field, so the code the
// player runs is the code under test.
import * as THREE from 'three';
import { createWorldField, BIOMES, CHUNK } from './field.js';
import {
  createFauna, spawnsFor, countsFor, blockedAt, isForestEdge, neighbourHas, auditSpawnTable,
  SPAWN, KINDS, EDGES, ALIVE_CAP, HOME_KEEP, NEAR_RING, siteClear,
} from './fauna.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };
const f = createWorldField(20260904, { homeY: -0.3 });

// A field that answers whatever the test needs it to, with the same surface
// createFauna uses: seed, seaLevel, sampleAt, heightAt, biomeAt, chunkOf.
function stubField(o = {}) {
  const biome = o.biome || (() => 'meadow');
  const water = o.water || (() => false);
  const river = o.river || (() => 0);
  const height = o.height || (() => 3);
  const sampleAt = (x, z) => ({
    h: height(x, z), biome: biome(x, z), water: water(x, z), river: river(x, z),
    land: 1, temp: 0.5, moist: 0.5, site: null,
  });
  return {
    seed: o.seed ?? 4242, seaLevel: -0.8, chunk: CHUNK,
    sampleAt, heightAt: (x, z) => sampleAt(x, z).h, biomeAt: (x, z) => sampleAt(x, z).biome,
    chunkOf: (x, z) => [Math.floor(x / CHUNK), Math.floor(z / CHUNK)],
  };
}

// ---------------------------------------------------------------- the table
{
  check('the spawn table covers every biome', auditSpawnTable() === true);
  // and the other way: a table with a hole, or a species in the wrong biome, throws
  let threw = 0;
  const row = SPAWN.snow;
  delete SPAWN.snow;
  try { auditSpawnTable(); } catch { threw++; }
  SPAWN.snow = row;
  SPAWN.desert.push({ kind: 'gull', p: 1, n: [1, 1] });
  try { auditSpawnTable(); } catch { threw++; }
  SPAWN.desert.pop();
  check('a missing biome row and a misplaced species both throw', threw === 2, `${threw} of 2`);
  check('the table is whole again', auditSpawnTable() === true);
}

// -------------------------------------------------- one chunk per biome
const byBiome = {};
for (let cz = -60; cz <= 60 && Object.keys(byBiome).length < BIOMES.length; cz++) for (let cx = -60; cx <= 60; cx++) {
  const b = f.biomeAt((cx + 0.5) * CHUNK, (cz + 0.5) * CHUNK);
  if (!byBiome[b] && f.biomeAt(cx * CHUNK + 8, cz * CHUNK + 8) === b && f.biomeAt(cx * CHUNK + 56, cz * CHUNK + 56) === b) byBiome[b] = [cx, cz];
}
console.log('  chunks found per biome:', Object.keys(byBiome).join(', '));

// -------------------------------------------------------------- determinism
{
  const [cx, cz] = byBiome.meadow;
  const a = JSON.stringify(spawnsFor(f, cx, cz)), b = JSON.stringify(spawnsFor(f, cx, cz));
  check('same chunk, same animals', a === b);
  // across a stretch of world, another seed has to disagree: one chunk is not
  // enough, because an empty chunk is empty under every seed
  const other = createWorldField(20260905, { homeY: -0.3 });
  let same = 0, looked = 0;
  for (let i = 0; i < 400; i++) {
    const A = spawnsFor(f, cx + i, cz), B = spawnsFor(other, cx + i, cz);
    if (!A.length && !B.length) continue;          // empty ground agrees under any seed
    looked++;
    if (JSON.stringify(A) === JSON.stringify(B)) same++;
  }
  check('there were chunks with animals to compare', looked > 40, `${looked}`);
  check('another seed, another world', same === 0, `${same} of ${looked} populated chunks agreed`);
}

// ------------------------------------------------- the table, both directions
{
  const seen = {};        // biome of the chunk -> kinds it produced
  const wrongCell = [];
  let total = 0;
  for (let cz = -40; cz < 40; cz += 2) for (let cx = -40; cx < 40; cx += 2) {
    const b = f.biomeAt((cx + 0.5) * CHUNK, (cz + 0.5) * CHUNK);
    const recs = spawnsFor(f, cx, cz);
    seen[b] = seen[b] || new Set();
    for (const r of recs) {
      total++;
      seen[b].add(r.kind);
      const own = f.biomeAt(r.x, r.z);
      if (!KINDS[r.kind].biomes.includes(own)) wrongCell.push(`${r.kind} in ${own}`);
    }
  }
  check('animals placed over 1600 chunks', total > 300, `${total}`);
  check('every animal stands in a biome its species lives in', wrongCell.length === 0, wrongCell.slice(0, 3).join(', '));
  const list = (b) => [...(seen[b] || [])].sort().join(',');
  console.log('  kinds per chunk biome:', Object.entries(seen).map(([b, s]) => `${b}[${[...s].sort().join(' ')}]`).join(' '));
  // the negatives the brief names
  check('a boreal chunk never rolls gulls', !(seen.boreal || new Set()).has('gull'), list('boreal'));
  check('a beach chunk never rolls wolves or foxes', !(seen.beach || new Set()).has('wolf') && !(seen.beach || new Set()).has('fox'), list('beach'));
  check('a meadow chunk never rolls wolves, foxes or gulls', !['wolf', 'fox', 'gull'].some((k) => (seen.meadow || new Set()).has(k)), list('meadow'));
  check('desert, mountain and snow chunks roll nothing', !seen.desert?.size && !seen.mountain?.size && !seen.snow?.size,
    `${list('desert')}|${list('mountain')}|${list('snow')}`);
  // and the positives, or the negatives would pass on an empty world
  check('meadow chunks do hold deer and rabbits', (seen.meadow || new Set()).has('deer') && (seen.meadow || new Set()).has('rabbit'), list('meadow'));
  check('boreal chunks do hold wolves and foxes', (seen.boreal || new Set()).has('wolf') && (seen.boreal || new Set()).has('fox'), list('boreal'));
  check('beach chunks do hold gulls', (seen.beach || new Set()).has('gull'), list('beach'));
  check('sakura chunks do hold squirrels', (seen.sakura || new Set()).has('squirrel'), list('sakura'));
  check('ocean chunks hold gulls and nothing else', (seen.ocean || new Set()).has('gull') && [...(seen.ocean || [])].every((k) => k === 'gull'), list('ocean'));
}

// -------------------------------------------------------- deer keep the edge
{
  let interiorDeer = 0, edgeDeer = 0, interior = 0, edge = 0;
  for (let cz = -40; cz < 40; cz++) for (let cx = -40; cx < 40; cx++) {
    if (f.biomeAt((cx + 0.5) * CHUNK, (cz + 0.5) * CHUNK) !== 'boreal') continue;
    const isEdge = isForestEdge(f, cx, cz);
    if (isEdge) edge++; else interior++;
    const n = (countsFor(f, cx, cz).deer || 0);
    if (isEdge) edgeDeer += n; else interiorDeer += n;
  }
  check('deep boreal chunks exist to test with', interior > 20 && edge > 20, `${interior} interior, ${edge} edge`);
  check('no deer deep in the forest', interiorDeer === 0, `${interiorDeer}`);
  check('deer along the forest edge', edgeDeer > 0, `${edgeDeer}`);
  // and the same rule for gulls: the coast, not the middle of the sea
  let openSeaGulls = 0, coastGulls = 0, openSea = 0, coast = 0;
  for (let cz = -40; cz < 40; cz++) for (let cx = -40; cx < 40; cx++) {
    if (f.biomeAt((cx + 0.5) * CHUNK, (cz + 0.5) * CHUNK) !== 'ocean') continue;
    const isCoast = neighbourHas(f, cx, cz, EDGES.coast);
    if (isCoast) coast++; else openSea++;
    const n = (countsFor(f, cx, cz).gull || 0);
    if (isCoast) coastGulls += n; else openSeaGulls += n;
  }
  check('open sea and coast chunks both exist', openSea > 20 && coast > 20, `${openSea} open, ${coast} coast`);
  check('no gulls out over the open sea', openSeaGulls === 0, `${openSeaGulls}`);
  check('gulls along the coast', coastGulls > 0, `${coastGulls}`);
}

// ------------------------------------------------ exclusions, true and false
{
  // water and river, driven both ways on a field that is half wet
  const wet = stubField({ water: (x) => x > 0, biome: () => 'meadow' });
  let wetSide = 0, drySide = 0;
  for (let cz = 3; cz < 12; cz++) for (let cx = -12; cx < 12; cx++) {
    for (const r of spawnsFor(wet, cx, cz)) { if (r.x > 0) wetSide++; else drySide++; }
  }
  check('nothing spawns on water', wetSide === 0, `${wetSide}`);
  check('the same rolls do spawn on the dry half', drySide > 20, `${drySide}`);

  const streamy = stubField({ river: (x) => (Math.abs(x % 200) < 40 ? 0.9 : 0), biome: () => 'meadow' });
  let inRiver = 0, outRiver = 0;
  for (let cz = 3; cz < 14; cz++) for (let cx = 3; cx < 14; cx++) {
    for (const r of spawnsFor(streamy, cx, cz)) { if (Math.abs(r.x % 200) < 40) inRiver++; else outRiver++; }
  }
  check('nothing spawns in a river', inRiver === 0, `${inRiver}`);
  check('the same rolls do spawn off the river', outRiver > 20, `${outRiver}`);

  // a site keeps its clearing, and the clearing is the site's doing. Find a
  // patch of ground that DOES hold animals, then drop a town on it.
  const plain = stubField({ biome: () => 'meadow' });
  let site = null, thereWithout = 0, inTown = 0;
  for (let gz = 9; gz <= 20 && !site; gz++) for (let gx = 9; gx <= 20 && !site; gx++) {
    const c = { x: gx * CHUNK + 32, z: gz * CHUNK + 32, flatR: 46, kind: 'town' };
    const near = (r) => Math.hypot(r.x - c.x, r.z - c.z) < siteClear(c);
    let n = 0;
    for (let cz = gz - 1; cz <= gz + 1; cz++) for (let cx = gx - 1; cx <= gx + 1; cx++) {
      for (const r of spawnsFor(plain, cx, cz)) if (near(r)) n++;
    }
    if (n > 0) { site = c; thereWithout = n; }
  }
  check('found open ground that holds animals', !!site, site ? `${thereWithout} there` : 'none');
  if (site) {
    const near = (r) => Math.hypot(r.x - site.x, r.z - site.z) < siteClear(site);
    const [gx, gz] = [Math.floor(site.x / CHUNK), Math.floor(site.z / CHUNK)];
    for (let cz = gz - 1; cz <= gz + 1; cz++) for (let cx = gx - 1; cx <= gx + 1; cx++) {
      for (const r of spawnsFor(plain, cx, cz, { sitesNear: () => [site] })) if (near(r)) inTown++;
    }
  }
  check('a town clears the animals off that same ground', inTown === 0, `${thereWithout} -> ${inTown}`);

  // the farm keeps its own 130 m
  let atHome = 0, justOutside = 0;
  for (let cz = -3; cz <= 2; cz++) for (let cx = -3; cx <= 2; cx++) {
    for (const r of spawnsFor(plain, cx, cz)) {
      const d = Math.hypot(r.x, r.z);
      if (d < HOME_KEEP) atHome++; else if (d < HOME_KEEP + 120) justOutside++;
    }
  }
  check(`nothing spawns within ${HOME_KEEP} m of the farm`, atHome === 0, `${atHome}`);
  check('animals do spawn just beyond it', justOutside > 0, `${justOutside}`);

  // and the predicate itself, both ways, one reason at a time
  const dry = { h: 4, biome: 'meadow', water: false, river: 0 };
  check('blockedAt: open meadow is fine', blockedAt(900, 900, dry, { sites: [] }) === null);
  check('blockedAt: water is not', blockedAt(900, 900, { ...dry, water: true }, { sites: [] }) === 'water');
  check('blockedAt: a river is not', blockedAt(900, 900, { ...dry, river: 0.9 }, { sites: [] }) === 'river' || blockedAt(900, 900, { ...dry, river: 0.9 }, { sites: [] }) === 'water');
  check('blockedAt: a site clearing is not', blockedAt(site.x + 10, site.z, dry, { sites: [site] }) === 'site');
  check('blockedAt: just outside that clearing is fine', blockedAt(site.x + siteClear(site) + 1, site.z, dry, { sites: [site] }) === null);
  check('blockedAt: the farm is not', blockedAt(20, 20, dry, { sites: [] }) === 'home');
  check('blockedAt: a gull may fly over water', blockedAt(900, 900, { ...dry, water: true }, { sites: [], flying: true }) === null);
  check('blockedAt: the wrong biome is refused', blockedAt(900, 900, dry, { sites: [], biomes: ['boreal'] }) === 'biome');
}

// ------------------------------------------------------------- the runtime
const ring = (fauna, r = NEAR_RING) => { for (let cz = -r; cz <= r; cz++) for (let cx = -r; cx <= r; cx++) fauna.onChunk(20 + cx, 20 + cz, 33); };
const CENTRE = 20 * CHUNK + 32;   // middle of chunk (20, 20)

{
  const scene = new THREE.Group();
  const fauna = createFauna(scene, stubField({ biome: () => 'meadow' }), {});
  ring(fauna);
  fauna.update(0.016, 1000, CENTRE, CENTRE, false);
  check('animals spawn in the near ring', fauna.stats.alive > 0, `${fauna.stats.alive} alive`);
  check(`no more than ${ALIVE_CAP} alive at once`, fauna.stats.alive <= ALIVE_CAP, `${fauna.stats.alive}`);
  check('the cap was actually reached, not merely respected', fauna.stats.alive === ALIVE_CAP && fauna.stats.capped > 0,
    `${fauna.stats.alive} alive, ${fauna.stats.capped} turned away`);
  check('every animal is in the scene graph', fauna.group.children.length === fauna.stats.alive,
    `${fauna.group.children.length} vs ${fauna.stats.alive}`);
  // 20 seconds of walking, then check nobody is standing anywhere they should not
  for (let i = 0; i < 1200; i++) fauna.update(0.016, 1000 + i * 16, CENTRE, CENTRE, false);
  check('everyone is still alive after 20 s of walking', fauna.stats.alive === ALIVE_CAP, `${fauna.stats.alive}`);
  let strayed = 0;
  for (const m of fauna.all()) if (Math.hypot(m.position.x - m.userData.wild.home.x, m.position.z - m.userData.wild.home.z) > 60) strayed++;
  check('nobody wandered off the leash', strayed === 0, `${strayed}`);
  fauna.dispose();
  check('dispose empties the scene', scene.children.length === 0);
}

// walking into water is refused, and the same animal walks freely on dry ground
{
  const SHORE = 20 * CHUNK + 40;
  const half = stubField({ biome: () => 'meadow', water: (x) => x > SHORE });
  const scene = new THREE.Group();
  const fauna = createFauna(scene, half, {});
  ring(fauna);
  fauna.update(0.016, 1000, CENTRE, CENTRE, false);
  check('animals stand on the dry side of the shore', fauna.all().every((m) => m.position.x <= SHORE), `${fauna.stats.alive} alive`);
  // take one animal, aim it at the water and hold it there
  const swimmer = fauna.targets()[0];
  const rm = swimmer.userData.roam;
  // well clear of the player, or it would bolt instead of walking where it is told
  const LANE = CENTRE + 80;
  swimmer.position.set(SHORE - 0.5, 3, LANE);
  swimmer.userData.wild.home = { x: SHORE - 0.5, z: LANE };
  const blocked0 = fauna.stats.blockedSteps;
  for (let i = 0; i < 90; i++) {
    rm.state = 'walk'; rm.heading = 0; rm.until = 1e9; rm.speed = 4;
    fauna.update(0.033, 2000 + i * 33, CENTRE, CENTRE, false);
  }
  check('an animal walked at the water stops at the shore', swimmer.position.x <= SHORE, `x ${swimmer.position.x.toFixed(1)} of ${SHORE}`);
  check('and the refusals are counted', fauna.stats.blockedSteps > blocked0, `${fauna.stats.blockedSteps - blocked0} steps refused`);
  // and the other way: aimed inland, the same animal walks
  const x0 = swimmer.position.x;
  for (let i = 0; i < 90; i++) {
    rm.state = 'walk'; rm.heading = Math.PI; rm.until = 1e9; rm.speed = 4;
    fauna.update(0.033, 5000 + i * 33, CENTRE, CENTRE, false);
  }
  check('aimed inland, it walks', x0 - swimmer.position.x > 3, `${(x0 - swimmer.position.x).toFixed(1)} m inland`);
  // and nobody else got wet in the meantime
  let inWater = 0;
  for (let i = 0; i < 2000; i++) fauna.update(0.033, 9000 + i * 33, CENTRE, CENTRE, false);
  for (const m of fauna.all()) if (half.sampleAt(m.position.x, m.position.z).water) inWater++;
  check('66 s more of wandering puts nobody in the water', inWater === 0, `${inWater} of ${fauna.stats.alive}`);
  fauna.dispose();
}

// predators only after dark
{
  const woods = stubField({ biome: () => 'boreal' });
  const scene = new THREE.Group();
  const fauna = createFauna(scene, woods, {});
  ring(fauna);
  fauna.update(0.016, 1000, CENTRE, CENTRE, false);
  const byDay = { ...fauna.stats.byKind };
  check('no predators by day', !byDay.fox && !byDay.wolf, JSON.stringify(byDay));
  check('squirrels are out by day', (byDay.squirrel || 0) > 0, JSON.stringify(byDay));
  fauna.update(0.016, 2000, CENTRE, CENTRE, true);
  const byNight = { ...fauna.stats.byKind };
  check('predators come out at night', (byNight.fox || 0) + (byNight.wolf || 0) > 0, JSON.stringify(byNight));
  check('but they do not empty the wood', (byNight.squirrel || 0) > 0, JSON.stringify(byNight));
  check('and no species takes more than its share', (byNight.wolf || 0) <= 4 && (byNight.fox || 0) <= 3, JSON.stringify(byNight));
  fauna.update(0.016, 3000, CENTRE, CENTRE, false);
  const back = { ...fauna.stats.byKind };
  check('and go again at dawn', !back.fox && !back.wolf, JSON.stringify(back));
  check('the cap holds through the night flip', fauna.stats.alive <= ALIVE_CAP, `${fauna.stats.alive}`);
  fauna.dispose();
}

// a predator breaks at 12 m, and not at 30
{
  const woods = stubField({ biome: () => 'boreal' });
  const scene = new THREE.Group();
  const fauna = createFauna(scene, woods, {});
  ring(fauna);
  fauna.update(0.016, 1000, CENTRE, CENTRE, true);
  const pred = fauna.all().find((m) => m.userData.roam && KINDS[m.userData.wild.kind].predator);
  check('there is a predator to test with', !!pred, pred && pred.userData.wild.kind);
  const put = (d) => {
    pred.position.set(CENTRE + d, 3, CENTRE);
    pred.userData.wild.home = { x: CENTRE + d, z: CENTRE };
    pred.userData.roam.state = 'walk';
    pred.userData.roam.fleeUntil = 0;
    pred.userData.roam.t0 = 0; pred.userData.roam.until = 1e9;
  };
  put(30);
  fauna.update(0.033, 2000, CENTRE, CENTRE, true);
  check('at 30 m it holds its ground', pred.userData.roam.state !== 'flee', pred.userData.roam.state);
  put(8);
  fauna.update(0.033, 3000, CENTRE, CENTRE, true);
  check('at 8 m it breaks', pred.userData.roam.state === 'flee', pred.userData.roam.state);
  const d0 = Math.hypot(pred.position.x - CENTRE, pred.position.z - CENTRE);
  for (let i = 0; i < 40; i++) fauna.update(0.033, 3033 + i * 33, CENTRE, CENTRE, true);
  const d1 = Math.hypot(pred.position.x - CENTRE, pred.position.z - CENTRE);
  check('and it runs away from you, not at you', d1 > d0 + 3, `${d0.toFixed(1)} -> ${d1.toFixed(1)} m`);
  fauna.dispose();
}

// despawn when the chunk leaves, both by ring and by chunks.js disposing it
{
  const plain = stubField({ biome: () => 'meadow' });
  const scene = new THREE.Group();
  const fauna = createFauna(scene, plain, {});
  ring(fauna);
  fauna.update(0.016, 1000, CENTRE, CENTRE, false);
  const started = fauna.stats.alive;
  check('a full ring to start with', started === ALIVE_CAP, `${started}`);
  // walk 40 chunks away: everything behind is out of the ring and out of memory
  fauna.update(0.016, 2000, CENTRE + 40 * CHUNK, CENTRE, false);
  check('walking away despawns every animal', fauna.stats.alive === 0, `${fauna.stats.alive} left`);
  check('and their chunks with them', fauna.stats.chunks === 0, `${fauna.stats.chunks}`);
  check('the scene graph is empty too', fauna.group.children.length === 0, `${fauna.group.children.length}`);
  // come back: the same ground, the same animals, from the pool not the builder
  fauna.update(0.016, 3000, CENTRE, CENTRE, false);
  check('walking back brings them back', fauna.stats.alive === started, `${fauna.stats.alive}`);
  const posA = fauna.all().map((m) => `${m.userData.wild.kind}@${m.userData.wild.home.x.toFixed(2)},${m.userData.wild.home.z.toFixed(2)}`).sort().join('|');
  fauna.update(0.016, 4000, CENTRE + 40 * CHUNK, CENTRE, false);
  fauna.update(0.016, 5000, CENTRE, CENTRE, false);
  const posB = fauna.all().map((m) => `${m.userData.wild.kind}@${m.userData.wild.home.x.toFixed(2)},${m.userData.wild.home.z.toFixed(2)}`).sort().join('|');
  check('and they come back to the same places', posA === posB);
  // chunks.js disposing a chunk takes its animals with it
  const victim = fauna.all()[0].userData.wild.chunk.split(',').map(Number);
  const doomed = fauna.all().filter((m) => m.userData.wild.chunk === victim.join(',')).length;
  fauna.offChunk(victim[0], victim[1]);
  check('offChunk despawns that chunk\'s animals', fauna.all().filter((m) => m.userData.wild.chunk === victim.join(',')).length === 0, `${doomed} were there`);
  fauna.dispose();
}

// ------------------------------------------------------- the hunting contract
{
  const plain = stubField({ biome: () => 'meadow' });
  const scene = new THREE.Group();
  const fauna = createFauna(scene, plain, {});
  ring(fauna);
  fauna.update(0.016, 1000, CENTRE, CENTRE, false);
  const targets = fauna.targets();
  check('targets() returns models the bow can shoot', targets.length > 0, `${targets.length}`);
  check('every target carries a hit column pointing back at itself',
    targets.every((m) => m.userData.hit && m.userData.hit.userData.deer === m));
  check('every target carries a farm-shaped roam record',
    targets.every((m) => {
      const r = m.userData.roam;
      return r && typeof r.state === 'string' && typeof r.heading === 'number' && typeof r.speed === 'number'
        && Array.isArray(r.legs) && typeof r.hp === 'number' && typeof r.hpMax === 'number' && r.quarry;
    }));
  check('quarry ids are the farm\'s own where the farm has one',
    targets.every((m) => ['deer', 'bunny', 'squirrel', 'fox', 'wolf'].includes(m.userData.roam.quarry)));
  const deer = targets.find((m) => m.userData.roam.quarry === 'deer');
  check('a world deer is a buck, a doe or a fawn', !deer || ['buck', 'doe', 'fawn'].includes(deer.userData.roam.variant), deer && deer.userData.roam.variant);
  // farm.js `_spookDeer` writes these three fields and expects a bolt
  const victim = targets[0];
  const startX = victim.position.x, startZ = victim.position.z;
  victim.userData.roam.state = 'flee';
  victim.userData.roam.fleeUntil = 4000;
  victim.userData.roam.speed = 12;
  victim.userData.roam.heading = 0;
  for (let i = 0; i < 60; i++) fauna.update(0.033, 1100 + i * 33, CENTRE, CENTRE, false);
  const ran = Math.hypot(victim.position.x - startX, victim.position.z - startZ);
  check('a spooked animal bolts', ran > 8, `${ran.toFixed(1)} m in 2 s`);
  // farm.js `_killDeer` writes state 'dead'; it must fall, sink and leave
  const kill = fauna.targets()[0];
  const deadRec = kill.userData.wild.rec;
  const goneBefore = fauna.stats.despawned;
  kill.userData.roam.state = 'dead'; kill.userData.roam.t0 = 0;
  fauna.update(0.033, 4000, CENTRE, CENTRE, false);
  check('a killed animal tips over', kill.rotation.z > 0.02, `${kill.rotation.z.toFixed(2)} rad`);
  check('and it is still there while it falls', fauna.all().includes(kill));
  check('a dying animal is no longer a target', !fauna.targets().includes(kill));
  for (let i = 0; i < 200; i++) fauna.update(0.033, 4033 + i * 33, CENTRE, CENTRE, false);
  check('and then the body is taken off the field', fauna.stats.despawned > goneBefore, `${goneBefore} -> ${fauna.stats.despawned}`);
  check('the dead do not come back while you stand there',
    !fauna.all().some((m) => m.userData.wild.rec === deadRec));
  check('nothing left on the field is dead', fauna.all().every((m) => !m.userData.roam || m.userData.roam.state !== 'dead'));
  // gulls are scenery, not quarry
  const sky = createFauna(new THREE.Group(), stubField({ biome: () => 'beach' }), {});
  ring(sky);
  sky.update(0.016, 1000, CENTRE, CENTRE, false);
  check('gulls fly', sky.all().length > 0 && sky.all().every((m) => m.userData.fly), `${sky.all().length}`);
  check('gulls are not shootable', sky.targets().length === 0);
  const gull = sky.all()[0];
  const gy = gull.position.y;
  sky.update(0.05, 1050, CENTRE, CENTRE, false);
  check('a gull circles at height', gull.position.y > 10 && Math.abs(gull.position.y - gy) < 3,
    `y ${gull.position.y.toFixed(1)}`);
  sky.dispose();
  fauna.dispose();
}

// ------------------------------------------------------------------- cost
{
  const t0 = performance.now();
  for (let i = 0; i < 200; i++) spawnsFor(f, 30 + i, 17);
  const ms = (performance.now() - t0) / 200;
  check('a chunk rolls its animals in under 1 ms', ms < 1, `${ms.toFixed(3)} ms`);
  const scene = new THREE.Group();
  const fauna = createFauna(scene, stubField({ biome: () => 'meadow' }), {});
  ring(fauna);
  fauna.update(0.016, 1000, CENTRE, CENTRE, false);
  const t1 = performance.now();
  for (let i = 0; i < 600; i++) fauna.update(0.016, 2000 + i * 16, CENTRE, CENTRE, false);
  const fms = (performance.now() - t1) / 600;
  check(`${ALIVE_CAP} animals step in under 0.5 ms a frame`, fms < 0.5, `${fms.toFixed(3)} ms`);
  fauna.dispose();
}

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
