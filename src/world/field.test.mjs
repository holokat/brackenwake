// The world field, driven both ways. Run: node src/world/field.test.mjs
import { createHash } from 'node:crypto';
import { createWorldField, SEA_LEVEL, HOME_RADIUS, BIOMES } from './field.js';
import {
  WORLD_HALF, OCEAN_FLOOR, COAST_MIN, HEART_SAFE, ZONE,
  SEA, seaWithin, REEFS, reefWithin, ARCHIPELAGO, archipelagoWithin,
} from './zones.js';

let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '   ' + detail : ''}`); };

const f = createWorldField(20260904);
const g = createWorldField(20260904);
const other = createWorldField(7);

// 1. determinism
let same = true, differ = 0, seaBoth = 0;
for (let i = 0; i < 500; i++) {
  const x = (i * 733.7) % 9000 - 4500, z = (i * 311.3) % 9000 - 4500;
  if (f.heightAt(x, z) !== g.heightAt(x, z)) same = false;
  { const a = f.sampleAt(x, z), b = other.sampleAt(x, z); if (a.water && b.water) { seaBoth++; } else if (Math.abs(a.h - b.h) > 0.5) differ++; }
}
check('same seed, same world (500 points)', same);
check('different seed, different world (where either is land)', differ / Math.max(1, 500 - seaBoth) > 0.9, `${differ}/${500 - seaBoth} land points differ by >0.5`);

// 2. home is flat and dry, the world starts past it
let homeMax = 0, homeRiver = 0;
for (let a = 0; a < 64; a++) for (let r = 0; r <= HOME_RADIUS; r += 10) {
  const s = f.sampleAt(Math.cos(a / 64 * 6.283) * r, Math.sin(a / 64 * 6.283) * r);
  homeMax = Math.max(homeMax, Math.abs(s.h)); homeRiver = Math.max(homeRiver, s.river);
}
check('ground within HOME_RADIUS is flat at homeY', homeMax < 1e-9, `max |h| ${homeMax.toExponential(1)}`);
{ const g2 = createWorldField(20260904, { homeY: -0.3 }); check('homeY lowers the whole home disc', Math.abs(g2.heightAt(40, 40) + 0.3) < 1e-9 && Math.abs(g2.heightAt(0, -90) + 0.3) < 1e-9); }
check('no river runs through the farm', homeRiver === 0, `max river ${homeRiver}`);
check('home biome is the farm theme', f.biomeAt(30, 30) === 'meadow');

// 3. survey a 12 km square: everything the pitch promised must actually occur
const counts = Object.fromEntries(BIOMES.map((b) => [b, 0]));
let n = 0, ocean = 0, land = 0, riverCells = 0, hMin = 1e9, hMax = -1e9, riverOnLand = 0;
for (let x = -6000; x <= 6000; x += 40) for (let z = -6000; z <= 6000; z += 40) {
  const s = f.sampleAt(x, z); n++;
  counts[s.biome]++;
  if (s.water) ocean++; else land++;
  if (s.river > 0.5) { riverCells++; if (s.land > 0.9) riverOnLand++; }
  hMin = Math.min(hMin, s.h); hMax = Math.max(hMax, s.h);
}
check('ocean exists (15% to 55%)', ocean / n > 0.15 && ocean / n < 0.55, `${(100 * ocean / n).toFixed(0)}% water`);
check('land is the majority', land / n > 0.45, `${(100 * land / n).toFixed(0)}% land`);
check('mountains exist (some ground above 60)', hMax > 60, `max h ${hMax.toFixed(1)}`);
check('sea floor is below sea level', hMin < -5, `min h ${hMin.toFixed(1)}`);
{ const g3 = createWorldField(20260904, { homeY: -0.3 }); const s3 = g3.sampleAt(60, 60); check('the home disc is dry land, not sea', !s3.water && s3.h > SEA_LEVEL + 0.2, `home h ${s3.h} sea ${SEA_LEVEL}`); }
check('rivers exist', riverCells > 50, `${riverCells} river cells`);
check('rivers are on land, not in the sea', riverOnLand / Math.max(1, riverCells) > 0.85, `${riverOnLand}/${riverCells}`);
for (const b of BIOMES) check(`biome "${b}" occurs`, counts[b] > 0, `${(100 * counts[b] / n).toFixed(1)}%`);
check('deserts are findable (at least 3% of the world)', counts.desert / n > 0.03);
check('mountains are findable (at least 2%)', (counts.mountain + counts.snow) / n > 0.02);
check('no single biome is over 60% of the world', Math.max(...Object.values(counts)) / n < 0.6);

// 4. rivers sit at or below sea level so the water plane fills them
let riverAbove = 0, riverSamples = 0;
for (let x = -6000; x <= 6000; x += 40) for (let z = -6000; z <= 6000; z += 40) {
  const s = f.sampleAt(x, z); if (s.river > 0.95) { riverSamples++; if (s.h > SEA_LEVEL - 0.5) riverAbove++; }
}
check('river centrelines are carved below sea level', riverSamples > 0 && riverAbove / riverSamples < 0.05, `${riverAbove}/${riverSamples} above`);

// 5. continuity: no cliffs steeper than the mesher can show without tearing
let worst = 0;
for (let i = 0; i < 4000; i++) {
  const x = (i * 97.3) % 8000 - 4000, z = (i * 53.9) % 8000 - 4000;
  worst = Math.max(worst, Math.abs(f.heightAt(x + 1, z) - f.heightAt(x, z)));
}
check('height changes < 8 per metre everywhere sampled (a 2 m mesh step shows this as a cliff, which mountains are allowed to be)', worst < 8, `worst ${worst.toFixed(2)}`);

// 6. THE HEART DOES NOT MOVE.
//
// Saves already exist and a character is standing in one of the towns near the
// origin. When the world was bounded and the zones were laid over it, the one
// thing that could not change was the ground a save is on. So: a 2 km square
// about the origin, 101 x 101 samples at 20 m, every field of every sample
// digested. The constant below was taken from the commit BEFORE zones.js
// existed, by running the same loop against that checkout. If a later change
// moves so much as one metre of the heart, this line goes red and names the
// change that did it.
{
  // the field the GAME builds, not this file's default one: world_runtime.js
  // passes homeY -0.3, and it is that ground a save is standing on
  const g = createWorldField(20260904, { homeBiome: 'meadow', homeY: -0.3 });
  const h = createHash('sha256');
  let n = 0;
  for (let z = -1000; z <= 1000; z += 20) for (let x = -1000; x <= 1000; x += 20) {
    const s = g.sampleAt(x, z); n++;
    h.update(`${s.h}|${s.biome}|${s.water}|${s.river}|${s.land}|${s.temp}|${s.moist}|${s.road}|${s.site ? s.site.id + ':' + s.site.kind : '-'}\n`);
  }
  const HEART = '6408cb4e64daf869910a654e0737f570d78de706987ee244f8e55f76c265a521';
  const got = h.digest('hex');
  check('the 2 km square around the origin is bit for bit what it was before zones existed', got === HEART, `${n} samples, ${got.slice(0, 16)}...`);
}

// 7. the world ends, and it ends in water
{
  let wet = 0, deep = 0;
  const say = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const s = f.sampleAt(Math.cos(a) * 8200, Math.sin(a) * 8200);
    if (s.water) wet++;
    if (s.h <= OCEAN_FLOOR + 1e-9) deep++;
    say.push(`${i * 45}deg ${s.h.toFixed(1)}m ${s.biome}`);
  }
  check('at 8.2 km, in all eight directions, the world is deep water', wet === 8 && deep === 8, say.join(', '));
  // and the falloff has not reached inland: the world inside COAST_MIN is the
  // world the seed made, which is what the digest above already proved at 1 km
  let touched = 0;
  for (let i = 0; i < 200; i++) {
    const a = (i / 200) * Math.PI * 2, r = 500 + (i % 12) * 500;   // 500 to 6000 m
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.hypot(x, z) < COAST_MIN && f.raw(x, z).h <= OCEAN_FLOOR + 1e-9) touched++;
  }
  check('and nothing inside COAST_MIN has been dropped to the ocean floor', touched === 0, `${COAST_MIN} m, 200 probes`);
  check('every sample carries a zone, a realm and a danger band', (() => {
    const a = f.sampleAt(0, 0), b = f.sampleAt(ZONE.boneyard.x, ZONE.boneyard.z);
    const c = f.sampleAt(ZONE.hearthhome.x, ZONE.hearthhome.z);
    return a.zone === 'greenwold' && a.realm === 'greenwold' && Array.isArray(a.danger)
      && b.zone === 'boneyard' && b.danger.length === 2
      && c.zone === 'hearthhome' && c.realm === 'greenwold';
  })(), `home is ${f.sampleAt(0, 0).zone} at tier ${f.sampleAt(0, 0).danger.join(' to ')}, and the hub reports ${f.sampleAt(ZONE.hearthhome.x, ZONE.hearthhome.z).zone} in ${f.sampleAt(ZONE.hearthhome.x, ZONE.hearthhome.z).realm}`);
  check('WORLD_HALF is the 16 km the map draws', WORLD_HALF === 8000);
}

// 7b. THE CALDERA SEA: the second shore, and the ground that stands out of it.
//
// Three claims, each driven both ways: the open sea is water at the sea floor,
// the reefs and the isles standing in it are dry, and nothing outside SEA.edge
// was touched at all.
console.log('the Caldera Sea');
{
  let n = 0, wet = 0, floor = 0, shallowest = -1e9;
  for (let x = SEA.x - SEA.full; x <= SEA.x + SEA.full; x += 25) {
    for (let z = SEA.z - SEA.full; z <= SEA.z + SEA.full; z += 25) {
      if (Math.hypot(x - SEA.x, z - SEA.z) > SEA.full) continue;
      if (reefWithin(x, z) > 0 || archipelagoWithin(x, z) > 0.02) continue;
      const s = f.sampleAt(x, z); n++;
      if (s.water) wet++;
      if (s.h <= SEA.floor + 0.001) floor++;
      shallowest = Math.max(shallowest, s.h);
    }
  }
  check('the open Caldera Sea is water', n > 1000 && wet === n, `${wet} of ${n} samples inside SEA.full, off the reefs and the isles`);
  check('and it is deep water, not a shelf', shallowest < SEA.floor + 3,
    `${floor} of ${n} sit exactly on the ${SEA.floor} m floor; the shallowest open water is ${shallowest.toFixed(2)} m`);

  const dryReefs = REEFS.filter((r) => { const s = f.sampleAt(r.x, r.z); return !s.water && s.h > 0.5; });
  check('every reef is dry ground', dryReefs.length === REEFS.length,
    REEFS.map((r) => `${r.id} ${f.sampleAt(r.x, r.z).h.toFixed(2)} m ${f.sampleAt(r.x, r.z).biome}`).join(', '));
  check('and a reef reads as shore, not as meadow', REEFS.every((r) => f.sampleAt(r.x, r.z).biome === 'beach'));
  // driven the other way: two hundred metres off a reef is open water again
  {
    let n2 = 0, wet2 = 0; const dryOff = [];
    for (const r of REEFS) for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const x = r.x + Math.cos(a) * (r.r + 120), z = r.z + Math.sin(a) * (r.r + 120);
      if (reefWithin(x, z) > 0) continue;                  // two reefs, one bearing
      n2++;
      if (f.sampleAt(x, z).water) wet2++; else dryOff.push(`${r.id} at ${(i * 45)}deg`);
    }
    // Not all forty: the Thousand Isles run through the sea, so a bearing off a
    // reef can genuinely land on an islet. Most of them have to be water or the
    // reefs are not islands at all.
    check('and a hundred and twenty metres off a reef you are almost always swimming', wet2 / n2 > 0.85,
      `${wet2} of ${n2}; the dry ones are ${dryOff.join(', ') || 'none'}`);
  }

  // the Thousand Isles: count them by flooding the dry cells of the lens
  {
    const step = 20, pts = new Map();
    const i0 = Math.round((ARCHIPELAGO.x - ARCHIPELAGO.far) / step), i1 = Math.round((ARCHIPELAGO.x + ARCHIPELAGO.far) / step);
    const j0 = Math.round((ARCHIPELAGO.z - ARCHIPELAGO.far) / step), j1 = Math.round((ARCHIPELAGO.z + ARCHIPELAGO.far) / step);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const x = i * step, z = j * step;
      if (archipelagoWithin(x, z) <= 0 || reefWithin(x, z) > 0) continue;
      if (f.raw(x, z).h >= SEA_LEVEL + 0.5) pts.set(`${i},${j}`, [i, j]);
    }
    const seenC = new Set();
    let islands = 0; const sizes = [];
    for (const k of pts.keys()) {
      if (seenC.has(k)) continue;
      let size = 0; const st = [k]; seenC.add(k);
      while (st.length) {
        const [i, j] = pts.get(st.pop()); size++;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const kk = `${i + di},${j + dj}`;
          if (pts.has(kk) && !seenC.has(kk)) { seenC.add(kk); st.push(kk); }
        }
      }
      islands++; sizes.push(size);
    }
    sizes.sort((a, b) => b - a);
    check('the Thousand Isles are an archipelago and not one island', islands >= 40,
      `${islands} islands over ${pts.size} dry cells at 20 m; the largest is ${sizes[0]} cells, the median ${sizes[sizes.length >> 1]}`);
    check('and they are small: no islet is a tenth of the sea', sizes[0] * step * step < Math.PI * SEA.full * SEA.full * 0.1,
      `${(sizes[0] * step * step / 1000).toFixed(0)} thousand square metres`);
    // and the middle of the sea, over the drowned city, is still open water
    let deepN = 0, deepWet = 0;
    for (let a = 0; a < 64; a++) for (const rr of [0, 150, 300]) {
      const x = SEA.x + Math.cos(a / 64 * 6.2832) * rr, z = SEA.z + Math.sin(a / 64 * 6.2832) * rr;
      if (reefWithin(x, z) > 0) continue;                  // a reef is meant to be dry
      deepN++; if (f.sampleAt(x, z).water) deepWet++;
    }
    check('and the middle of the sea, over the drowned city, is open water', deepWet === deepN, `${deepWet}/${deepN}`);
  }

  // nothing inland of the sea's own shore moved
  let touchedSea = 0;
  for (let i = 0; i < 3600; i++) {
    const a = (i / 3600) * Math.PI * 2, d = SEA.edge + 1 + (i % 9) * 400;
    if (seaWithin(SEA.x + Math.cos(a) * d, SEA.z + Math.sin(a) * d) !== 0) touchedSea++;
  }
  check('seaWithin is exactly zero everywhere outside SEA.edge', touchedSea === 0, `${SEA.edge} m, 3600 probes`);
  check('and the sea stops well short of the heart', Math.hypot(SEA.x, SEA.z) - SEA.edge > HEART_SAFE,
    `its nearest water is ${(Math.hypot(SEA.x, SEA.z) - SEA.edge).toFixed(0)} m from the origin, against HEART_SAFE ${HEART_SAFE}`);
}

// 8. cost: a 33x33 chunk must sample in a few milliseconds
const t0 = performance.now();
for (let i = 0; i < 1089 * 10; i++) f.sampleAt(i % 33 * 2, ((i / 33) | 0) % 33 * 2);
const perSample = (performance.now() - t0) / (1089 * 10) * 1000;
check('sampleAt under 12 microseconds', perSample < 12, `${perSample.toFixed(2)} us, chunk of 33x33 = ${(perSample * 1089 / 1000).toFixed(1)} ms`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
