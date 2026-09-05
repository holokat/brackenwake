// The world field, driven both ways. Run: node src/world/field.test.mjs
import { createHash } from 'node:crypto';
import { createWorldField, SEA_LEVEL, HOME_RADIUS, BIOMES } from './field.js';
import { WORLD_HALF, OCEAN_FLOOR, COAST_MIN } from './zones.js';

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
  check('every sample carries a zone field and a danger band', (() => {
    const a = f.sampleAt(0, 0), b = f.sampleAt(-4400, 0);
    return a.zone === 'vale' && Array.isArray(a.danger) && b.zone === 'ironshoulder' && b.danger.length === 2;
  })(), `home is ${f.sampleAt(0, 0).zone} at tier ${f.sampleAt(0, 0).danger.join(' to ')}`);
  check('WORLD_HALF is the 16 km the map draws', WORLD_HALF === 8000);
}

// 8. cost: a 33x33 chunk must sample in a few milliseconds
const t0 = performance.now();
for (let i = 0; i < 1089 * 10; i++) f.sampleAt(i % 33 * 2, ((i / 33) | 0) % 33 * 2);
const perSample = (performance.now() - t0) / (1089 * 10) * 1000;
check('sampleAt under 12 microseconds', perSample < 12, `${perSample.toFixed(2)} us, chunk of 33x33 = ${(perSample * 1089 / 1000).toFixed(1)} ms`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
