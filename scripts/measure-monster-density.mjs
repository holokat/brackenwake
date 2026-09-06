// How many things are alive in the Greenwold, measured on the real field.
//
//   node scripts/measure-monster-density.mjs
//
// Three measurements, all of them through the code the game runs and none of
// them through a stand-in:
//
//   1. Every open Greenwold chunk rolled by `spawnsForChunk`, day and night,
//      counted as bodies per square kilometre and as a mix by row.
//   2. The six named places of the realm, rolled the same way, so that each one
//      can be read as its own place.
//   3. A player standing at Hearthhome's edge and walking 600 m north east at
//      7 m/s with `createMonsters` streaming, counting the bodies alive inside
//      300 m of him at every step, and the wall time one update() takes.
//
// "Open" means a chunk whose centre is in the Greenwold, out of the water, and
// NOT inside one of the named places: open country is what the density
// constants govern, and a named place carries its own table.
import * as THREE from 'three';
import { createWorldField, CHUNK } from '../src/world/field.js';
import { createDiscovery } from '../src/world/sites.js';
import { createFauna } from '../src/world/fauna.js';
import { HABITAT_BY_PLACE, MONSTERS, SPAWN_SPACING_M } from '../src/mmo/monsters.js';
import { createMonsters, spawnsForChunk, ALIVE_CAP, GROUP_CHANCE, NEAR_RING } from '../src/game/monsters.js';

const SEED = 20260904;
const HEARTHHOME = { x: 749, z: 1579 };
const CHUNK_KM2 = (CHUNK * CHUNK) / 1e6;

const field = createWorldField(SEED, { homeBiome: 'meadow', homeY: -0.3 });
const discovery = createDiscovery(field);
const sitesNear = (x, z, r) => discovery.sitesNear(x, z, r);
const fauna = createFauna(field, { sitesNear });

const pct = (n, of) => (of ? `${((n / of) * 100).toFixed(1)}%` : '0%');
const sortDesc = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]);

// --- 1 and 2: the whole realm, chunk by chunk -------------------------------
//
// The Greenwold's disc in zones.js is 2200 m of radius around its own centre;
// rather than copy that number, every chunk inside a generous square is asked
// what realm it is in and the ones that answer 'greenwold' are the realm.
const HALF = 3000;
const CENTRE = { x: 0, z: 0 };            // the Greenwold's own disc in realms.js
const open = [];
const named = new Map();      // place id -> [chunk]
for (let z = -HALF; z <= HALF; z += CHUNK) {
  for (let x = -HALF; x <= HALF; x += CHUNK) {
    const cx = Math.floor((CENTRE.x + x) / CHUNK), cz = Math.floor((CENTRE.z + z) / CHUNK);
    const mx = cx * CHUNK + CHUNK / 2, mz = cz * CHUNK + CHUNK / 2;
    const s = field.sampleAt(mx, mz);
    if (s.realm !== 'greenwold') continue;
    if (s.water) continue;
    if (s.zone && HABITAT_BY_PLACE[s.zone]) {
      if (!named.has(s.zone)) named.set(s.zone, []);
      named.get(s.zone).push([cx, cz]);
      continue;
    }
    open.push([cx, cz]);
  }
}

function rollAll(chunks, night) {
  let bodies = 0, groups = 0;
  const byId = {};
  for (const [cx, cz] of chunks) {
    const recs = spawnsForChunk(field, cx, cz, { night, sitesNear, spawnPoint: HEARTHHOME });
    if (recs.length) groups++;
    bodies += recs.length;
    for (const r of recs) byId[r.id] = (byId[r.id] || 0) + 1;
  }
  return { bodies, groups, byId, chunks: chunks.length, perKm2: bodies / (chunks.length * CHUNK_KM2) };
}

console.log(`\nthe field: seed ${SEED}, chunk ${CHUNK} m, cap ${ALIVE_CAP} bodies, ring ${NEAR_RING}`);
console.log(`spacing: day ${SPAWN_SPACING_M.wildDay} m, night ${SPAWN_SPACING_M.wildNight} m`);
console.log(`group chance: day ${GROUP_CHANCE.day.toFixed(3)}, night ${GROUP_CHANCE.night.toFixed(3)}`);
console.log(`\nthe Greenwold: ${open.length} open chunks, ${[...named.values()].reduce((a, b) => a + b.length, 0)} in named places`);

for (const night of [false, true]) {
  const r = rollAll(open, night);
  console.log(`\nopen country, ${night ? 'night' : 'day'}: ${r.bodies} bodies in ${r.groups} groups over ${r.chunks} chunks`);
  console.log(`  ${r.perKm2.toFixed(1)} bodies per square kilometre, ${(r.groups / r.chunks * 100).toFixed(1)}% of chunks hold a group`);
  const byTier = {};
  for (const [id, k] of Object.entries(r.byId)) {
    const t = MONSTERS[id]?.tier ?? '?';
    byTier[t] = (byTier[t] || 0) + k;
  }
  console.log(`  by tier: ${Object.entries(byTier).sort().map(([t, k]) => `tier ${t} ${pct(k, r.bodies)}`).join(', ')}, over ${Object.keys(r.byId).length} rows`);
  for (const [id, n] of sortDesc(r.byId)) {
    console.log(`    ${(MONSTERS[id]?.name || id).padEnd(18)} tier ${MONSTERS[id]?.tier ?? '?'}  ${String(n).padStart(4)}  ${pct(n, r.bodies)}`);
  }
}

// The mix below is what the ROLL wants over the whole realm. A boss or a named
// beast is written into his own place's table and so is rolled in every chunk
// of it; `oneOfEachUnique` in the streamer stands ONE of him up, which the walk
// below counts. So "Old Grist 4" here is four chunks that would hold him and
// not four boars in one wood.
console.log('\nthe named places, by row (what the roll wants, before the streamer keeps one of each one of a kind):');
for (const [place, chunks] of [...named].sort()) {
  for (const night of [false, true]) {
    const r = rollAll(chunks, night);
    const mix = sortDesc(r.byId).map(([id, n]) => `${MONSTERS[id]?.name || id} ${n}`).join(', ');
    console.log(`  ${place.padEnd(20)} ${night ? 'night' : 'day  '}  ${String(r.chunks).padStart(3)} chunks  ${String(r.bodies).padStart(4)} bodies  ${r.perKm2.toFixed(0)}/km2  ${mix || 'nothing'}`);
  }
}

// --- 3: the walk ------------------------------------------------------------
//
// createMonsters is the real streamer. The runtime handed to it is the same
// shape world_runtime.js exposes: a field, a ground height, the sites and the
// world's own animals, which share the cap with the monsters and so have to be
// in the count.
function walk(label, { night, withFauna = true, from = HEARTHHOME, dist = 600 }) {
  const scene = new THREE.Group();
  const runtime = {
    field,
    heightAt: (x, z) => field.heightAt(x, z),
    sitesNear,
    critterSpawns: withFauna ? (cx, cz, n) => fauna.spawnsFor(cx, cz, n) : undefined,
    get inDungeon() { return false; },
  };
  const monsters = createMonsters(scene, runtime, { spawnPoint: HEARTHHOME, clock: () => 0 });
  const player = {
    id: 'player', kind: 'player', name: 'you',
    pos: { x: from.x, y: 0, z: from.z }, yaw: 0,
    stats: { str: 20, dex: 20, int: 10, con: 20, wis: 10 },
    skills: {}, bonuses: {}, ar: 0, resists: {}, weapon: null, shield: null,
    health: 100, maxHealth: 100, mana: 0, maxMana: 0, stamina: 100, maxStamina: 100,
    buffs: [], status: {}, lastSwingAt: -Infinity, faction: 'player', ai: null, anim: 'idle',
  };
  const STEP = 1 / 60, SPEED = 7, DIST = dist;
  const dir = Math.SQRT1_2;                 // north east: +x, -z
  const frames = Math.round(DIST / SPEED / STEP);
  let now = 0, near = 0, worst = 0, best = 1e9, alive = 0, ms = 0, slowest = 0, doubles = 0, uniques = 0;
  for (let f = 0; f < frames; f++) {
    now += STEP * 1000;
    player.pos.x += SPEED * STEP * dir;
    player.pos.z -= SPEED * STEP * dir;
    player.pos.y = field.heightAt(player.pos.x, player.pos.z);
    const t0 = performance.now();
    monsters.update(STEP, now, player, night);
    const dt = performance.now() - t0;
    ms += dt;
    if (dt > slowest) slowest = dt;
    let n = 0;
    for (const m of monsters.all()) {
      if (Math.hypot(m.actor.pos.x - player.pos.x, m.actor.pos.z - player.pos.z) <= 300) n++;
    }
    near += n; alive += monsters.count;
    if (monsters.stats.doubles > doubles) doubles = monsters.stats.doubles;
    let u = 0;
    for (const m of monsters.all()) if (m.row.boss || m.row.unique) u++;
    if (u > uniques) uniques = u;
    if (n > worst) worst = n;
    if (n < best) best = n;
  }
  console.log(`\n${label}: ${frames} frames, ${DIST} m at ${SPEED} m/s`);
  console.log(`  bodies within 300 m: ${(near / frames).toFixed(1)} mean, ${best} least, ${worst} most`);
  console.log(`  bodies alive in the ring: ${(alive / frames).toFixed(1)} mean, cap ${ALIVE_CAP}`);
  console.log(`  monsters.update(): ${(ms / frames).toFixed(3)} ms mean, ${slowest.toFixed(2)} ms slowest`);
  console.log(`  second copies of a boss or a named beast thrown away: ${doubles} at the worst; ${uniques} one-of-a-kind bodies standing at once`);
  monsters.dispose();
  return { mean: near / frames, worst, alive: alive / frames, ms: ms / frames };
}

walk('walking north east out of Hearthhome by day', { night: false });
walk('walking north east out of Hearthhome by night', { night: true });
// The Old Cellars: forty six chunks with Sergeant Oram Blackhand in their own
// table, which is the case the streamer's one-of-each rule exists for.
walk('walking across the Old Cellars by night', { night: true, from: { x: 363, z: 1603 }, dist: 300 });
