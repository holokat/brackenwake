// The world field, driven both ways. Run: node src/world/field.test.mjs
import { createHash } from 'node:crypto';
import {
  createWorldField, SEA_LEVEL, HOME_RADIUS, BIOMES,
  RELIEF_GRADE, RELIEF_MAX_STEP, RAMP_GRADE, RELIEF_HOLD,
} from './field.js';
import {
  WORLD_HALF, OCEAN_FLOOR, COAST_MIN, HEART_SAFE, ZONE,
  SEA, seaWithin, REEFS, reefWithin, ARCHIPELAGO, archipelagoWithin,
  RELIEF_ZONES, REALM_ZONES, heartFade, authoredSites, realmAt,
} from './zones.js';
import { rand2 } from './noise.js';
import { roadsForCell, ROAD_GRADE } from './roads.js';

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
  let n = 0, named = 0, shaping = 0;
  for (let z = -1000; z <= 1000; z += 20) for (let x = -1000; x <= 1000; x += 20) {
    const s = g.sampleAt(x, z); n++;
    if (s.site) named++;
    if (s.site && s.site.flatR > 0) shaping++;
    // The last column is the site that SHAPES this ground, which is what the
    // rest of the row is about. V1 put the Standing Hedge in the heart, where
    // the sheet has always had it: nine stones on a ring a mile across, on the
    // hillside the seed made, laying no pad at all (`flatR` 0, and field.js
    // does not run the pad code for one). So it is named on the samples inside
    // its own cell and it moves none of them, and the digest below is the same
    // number it was before zones.js existed. The two checks under this one are
    // the proof: the hedge lays no pad, and the cell it took was empty.
    const pad = s.site && s.site.flatR > 0 ? s.site.id + ':' + s.site.kind : '-';
    h.update(`${s.h}|${s.biome}|${s.water}|${s.river}|${s.land}|${s.temp}|${s.moist}|${s.road}|${pad}\n`);
  }
  const HEART = '6408cb4e64daf869910a654e0737f570d78de706987ee244f8e55f76c265a521';
  const got = h.digest('hex');
  check('the 2 km square around the origin is bit for bit what it was before zones existed', got === HEART,
    `${n} samples, ${named} name a site, ${shaping} name one that lays a pad, ${got.slice(0, 16)}...`);

  // 6a. the pad-less site in the heart, driven both ways
  const hedge = authoredSites().find((s) => s.sub === 'waystones');
  check('the Standing Hedge stands inside the heart, which is where the sheet puts it',
    !!hedge && Math.hypot(hedge.x, hedge.z) < HEART_SAFE,
    `${hedge.name} at ${hedge.x}, ${hedge.z}, ${Math.hypot(hedge.x, hedge.z).toFixed(0)} m from the origin`);
  {
    // no pad: the ground at and around it is the ground the seed made, to the
    // last bit, at the centre and at eight bearings inside where a pad's
    // shoulder would have reached
    let worst = 0;
    // the same arithmetic field.js does, in the same order: a different order
    // of the same lerp differs in the last bit and this claim is about every bit
    const bare = (x, z) => { const k = g.homeFactor(x, z); return g.homeY + (g.raw(x, z).h - g.homeY) * k; };
    for (const d of [0, 2, 4, 8, 14, 20]) {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        const x = hedge.x + Math.cos(a) * d, z = hedge.z + Math.sin(a) * d;
        worst = Math.max(worst, Math.abs(g.heightAt(x, z) - bare(x, z)));
      }
    }
    check('and it lays no pad: every metre under it is the raw hillside', hedge.flatR === 0 && worst === 0,
      `flatR ${hedge.flatR}, 48 points out to 20 m, worst ${worst.toExponential(1)} m off the raw ground`);
    // driven the other way: a site that DOES lay a pad moves its own ground
    const padded = authoredSites().find((s) => s.flatR > 0 && s.kind === 'town');
    let moved = 0;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const x = padded.x + Math.cos(a) * padded.flatR * 0.4, z = padded.z + Math.sin(a) * padded.flatR * 0.4;
      moved = Math.max(moved, Math.abs(g.heightAt(x, z) - g.raw(x, z).h));
    }
    check('while a site with a pad moves its ground, so the measurement means something',
      moved > 0.05, `${padded.name} lays a ${padded.flatR} m pad and lifts its ground ${moved.toFixed(2)} m`);
  }
  {
    // and the cell it took away from the roll was empty. sitegrid.js rolls a
    // cell in with `rand2(cx, cz, seed + 1) > 0.62 -> nothing here`, so this is
    // the same arithmetic the world would have done, run on the cell the hedge
    // now owns.
    const SITE_CELL = 480, SEED = 20260904;
    const cx = Math.floor(hedge.x / SITE_CELL), cz = Math.floor(hedge.z / SITE_CELL);
    const empty = rand2(cx, cz, SEED + 1) > 0.62;
    check('and the cell it took would have rolled nothing anyway', empty,
      `cell ${cx}, ${cz} rolls ${rand2(cx, cz, SEED + 1).toFixed(4)} against the 0.62 the roll needs`);
    // the other way: a cell in the same square that WOULD have rolled a site
    let full = null;
    for (let j = -3; j <= 2 && !full; j++) for (let i = -3; i <= 2; i++) {
      if (rand2(i, j, SEED + 1) <= 0.62 && g.siteInCell(i, j)) { full = [i, j]; break; }
    }
    check('and cells in the same square DO roll sites, so that measurement means something',
      !!full, full ? `cell ${full.join(', ')} rolls ${rand2(full[0], full[1], SEED + 1).toFixed(4)} and holds ${g.siteInCell(full[0], full[1]).kind}` : 'none found');
  }
}

// 6b. THE SECOND DIGEST: the relief itself, so it cannot drift silently.
//
// The heart's digest says the ground a save stands on did not move. It says
// nothing about the Ember Wastes, which V1 turned into mesa country, and a
// world that can be reshaped without anyone noticing will be.
//
// So: the same 2 km square, about that realm's own centre, digesting the
// DIFFERENCE between the world with relief and the world without it, taken
// from `raw` rather than from `sampleAt`. `raw` never asks what stands on the
// ground, so this number is a statement about relief and about nothing else,
// and a site rolled or moved into the square by another hand cannot make it
// go red. If a table moves by a millimetre, it does.
{
  const on = createWorldField(20260904, { homeBiome: 'meadow', homeY: -0.3 });
  const off = createWorldField(20260904, { homeBiome: 'meadow', homeY: -0.3, relief: false });
  const c = ZONE.emberwastes;
  const h = createHash('sha256');
  let n = 0, lifted = 0, hi = 0, dropped = 0;
  for (let z = c.z - 1000; z <= c.z + 1000; z += 20) for (let x = c.x - 1000; x <= c.x + 1000; x += 20) {
    const a = on.raw(x, z), b = off.raw(x, z); n++;
    const d = a.h - b.h;
    if (d > 0.5) lifted++;
    if (d > hi) hi = d;
    if (b.river > 0.5 && a.river <= 0.5) dropped++;
    h.update(`${d}|${a.river - b.river}\n`);
  }
  const MESA = 'c6900f56e4226872282239f5d7455e5f6f9bf17aa42da993090fdb412bef5deb';
  const got = h.digest('hex');
  check('the relief over the Ember Wastes is what V1 measured it to be', got === MESA,
    `${n} samples, ${(100 * lifted / n).toFixed(0)}% lifted, up to ${hi.toFixed(1)} m, ${dropped} river cells left dry, ${got.slice(0, 16)}...`);
}

// 6c. RELIEF: five realms that are not the ground the noise made.
//
// Everything here is driven both ways. A realm with relief is lifted and a
// realm without one is not; the way up a plateau is walkable and the face
// beside it is not; the steepest step in the world with relief on is no worse
// than with it off; and inside the heart the relief is not merely small, it is
// the number zero.
console.log('relief: mesas, terraces, a crater rim, a shelf and stacks');
{
  const on = createWorldField(20260904, { homeBiome: 'meadow', homeY: -0.3 });
  const off = createWorldField(20260904, { homeBiome: 'meadow', homeY: -0.3, relief: false });
  const lift = (x, z) => on.raw(x, z).h - off.raw(x, z).h;

  check('five of the nine realms carry relief, and the Greenwold is not one of them',
    RELIEF_ZONES.length === 5 && !RELIEF_ZONES.some((z) => z.id === 'greenwold'),
    RELIEF_ZONES.map((z) => `${z.id} ${z.relief.kind}`).join(', '));

  // the heart, measured on a grid rather than argued from radii
  {
    let worst = 0, at = null;
    for (let z = -HEART_SAFE; z <= HEART_SAFE; z += 20) for (let x = -HEART_SAFE; x <= HEART_SAFE; x += 20) {
      if (x * x + z * z > HEART_SAFE * HEART_SAFE) continue;
      const d = Math.abs(lift(x, z));
      if (d > worst) { worst = d; at = [x, z]; }
    }
    check('no relief reaches the heart at all', worst === 0,
      `the ${HEART_SAFE} m disc at 20 m, worst ${worst.toExponential(1)} m${at && worst ? ' at ' + at : ''}`);
    check('and heartFade is exactly zero out to HEART_SAFE and exactly one past its fade',
      heartFade(0, 0) === 0 && heartFade(HEART_SAFE, 0) === 0 && heartFade(HEART_SAFE + 401, 0) === 1
      && heartFade(HEART_SAFE + 200, 0) > 0 && heartFade(HEART_SAFE + 200, 0) < 1,
      `0 at the origin, 0 at ${HEART_SAFE} m, ${heartFade(HEART_SAFE + 200, 0).toFixed(3)} at ${HEART_SAFE + 200} m, 1 at ${HEART_SAFE + 401} m`);
  }

  // each realm that asks for relief gets it, and each one that does not, does not
  {
    const say = [];
    let allLifted = true;
    for (const zn of RELIEF_ZONES) {
      let n = 0, up = 0, hi = 0;
      for (let x = zn.x - zn.r; x <= zn.x + zn.r; x += 20) for (let z = zn.z - zn.r; z <= zn.z + zn.r; z += 20) {
        if (Math.hypot(x - zn.x, z - zn.z) > zn.r) continue;
        const d = lift(x, z); n++;
        if (d > 0.5) up++;
        if (d > hi) hi = d;
      }
      say.push(`${zn.id} ${(100 * up / n).toFixed(0)}% up to ${hi.toFixed(0)} m`);
      if (up === 0 || hi < 10) allLifted = false;
    }
    check('every realm with relief is really reshaped by it', allLifted, say.join(', '));
    // Realms overlap, and a relief realm's soft edge reaches into its
    // neighbour's disc: the Stormpeaks' reach comes to 1688 m of the origin,
    // which is inside the Greenwold. So the claim is the one that is actually
    // being made, which is that relief belongs to the realm that asked for it:
    // ground inside a relief-free realm and outside every relief realm's reach
    // is untouched, to the last bit.
    let flat = true; const flatSay = [];
    const reaches = RELIEF_ZONES.map((z) => [z.x, z.z, (z.r + z.edge) ** 2]);
    for (const zn of REALM_ZONES) {
      if (zn.relief) continue;
      let worst = 0, own = 0, lent = 0;
      for (let x = zn.x - zn.r; x <= zn.x + zn.r; x += 40) for (let z = zn.z - zn.r; z <= zn.z + zn.r; z += 40) {
        if (Math.hypot(x - zn.x, z - zn.z) > zn.r) continue;
        if (reaches.some(([rx, rz, r2]) => (x - rx) ** 2 + (z - rz) ** 2 < r2)) { lent++; continue; }
        own++;
        worst = Math.max(worst, Math.abs(lift(x, z)));
      }
      flatSay.push(`${zn.id} ${worst.toExponential(0)} over ${own}${lent ? ' (' + lent + ' shared with a relief realm)' : ''}`);
      if (worst !== 0) flat = false;
    }
    check('and every realm without one is untouched, to the last bit', flat, flatSay.join(', '));
  }

  // the mesher's limit, and relief is not what gets near it
  {
    let a = 0, b = 0, at = null;
    for (let i = 0; i < 200000; i++) {
      const x = (i * 97.3) % 15600 - 7800, z = (i * 53.9) % 15600 - 7800;
      const da = Math.abs(on.heightAt(x + 1, z) - on.heightAt(x, z));
      const db = Math.abs(off.heightAt(x + 1, z) - off.heightAt(x, z));
      if (da > a) { a = da; at = [x, z]; }
      if (db > b) b = db;
    }
    check('the steepest metre in the world with relief is no steeper than without it', a <= b + 1e-9,
      `${a.toFixed(2)} m with relief at ${at}, ${b.toFixed(2)} m without, over 200000 probes of the whole 15.6 km square`);
    check('and it is under the 8 m the mesher can show', a < 8, `${a.toFixed(2)} against 8`);
    check('a relief face is steep, but never steeper than RELIEF_MAX_STEP asks',
      RELIEF_MAX_STEP === 1.5 * RELIEF_GRADE && RELIEF_MAX_STEP < 8,
      `grade ${RELIEF_GRADE} m per metre, so a face steps ${RELIEF_MAX_STEP} m at its middle`);
  }

  // the climbs. A megalith the sheet calls climbable is climbed on the ground,
  // not on the mesh: the relief carries the way up, so `heightAt` is the whole
  // of it and nothing has to be wired anywhere for a player to walk it.
  {
    const walk = (x0, z0, x1, z1) => {
      const n = Math.round(Math.hypot(x1 - x0, z1 - z0));
      let worst = 0, prev = on.heightAt(x0, z0), lo = prev, hi = prev;
      for (let i = 1; i <= n; i++) {
        const t = i / n, h = on.heightAt(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t);
        worst = Math.max(worst, Math.abs(h - prev));
        lo = Math.min(lo, h); hi = Math.max(hi, h);
        prev = h;
      }
      return { worst, lo, hi, n };
    };
    const STEP_MAX = 1.2;   // metres of rise in a metre of walking, at a walk
    const e = ZONE.eyrie;
    const up = walk(e.x + 175, e.z, e.x, e.z);
    const face = walk(e.x, e.z - 175, e.x, e.z);
    check('the Eyrie stands on its plateau, sixty metres up', up.hi - up.lo > 55 && up.hi - up.lo < 70,
      `the landing is at ${up.hi.toFixed(1)} m and the ground at the foot of the steps at ${up.lo.toFixed(1)} m, ${(up.hi - up.lo).toFixed(1)} m of it`);
    check('and the landing steps are walkable at every metre of the climb', up.worst <= STEP_MAX,
      `${up.n} m of climb, worst step ${up.worst.toFixed(3)} m against ${STEP_MAX}`);
    check('while the face beside them is not, which is what makes the steps the way up',
      face.worst > 2, `worst step ${face.worst.toFixed(3)} m on the north face`);

    const th = ZONE.throneofash, gate = ZONE.ashengate;
    const a = Math.atan2(gate.z - th.z, gate.x - th.x);
    const road = walk(th.x + Math.cos(a) * 1900, th.z + Math.sin(a) * 1900, gate.x, gate.z);
    const rim = walk(th.x + Math.cos(a + 0.9) * 1900, th.z + Math.sin(a + 0.9) * 1900,
      th.x + Math.cos(a + 0.9) * 1432, th.z + Math.sin(a + 0.9) * 1432);
    check('the Ashen Gate stands on a crater rim eighty metres over the crater floor',
      on.heightAt(gate.x, gate.z) - on.heightAt(th.x, th.z) > 70,
      `the gate at ${on.heightAt(gate.x, gate.z).toFixed(1)} m, the throne at ${on.heightAt(th.x, th.z).toFixed(1)} m`);
    check('and the road up to it is walkable at every metre', road.worst <= STEP_MAX,
      `${road.n} m of road, worst step ${road.worst.toFixed(3)} m against ${STEP_MAX}`);
    check('while the rim half a radian round from it is a wall', rim.worst > 2,
      `worst step ${rim.worst.toFixed(3)} m`);

    // and every table in the Ember Wastes has one way up it, for the same
    // reason and by the same construction: a hundred tables, each walked from
    // its own rim to its own middle on the bearing its ramp was cut on
    let tables = 0, walkable = 0, wallSides = 0, worstRamp = 0;
    for (let x = ZONE.emberwastes.x - 1400; x <= ZONE.emberwastes.x + 1400; x += 100) {
      for (let z = ZONE.emberwastes.z - 1400; z <= ZONE.emberwastes.z + 1400; z += 100) {
        if (lift(x, z) < 14) continue;                       // not on a table top
        tables++;
        let best = Infinity, worstWay = 0;
        for (let i = 0; i < 36; i++) {
          const th2 = (i / 36) * Math.PI * 2;
          for (const out of [140, 200, 260]) {
            const w = walk(x + Math.cos(th2) * out, z + Math.sin(th2) * out, x, z);
            if (w.worst < best) best = w.worst;
            if (w.worst > worstWay) worstWay = w.worst;
          }
        }
        if (best <= STEP_MAX) walkable++;
        if (worstWay > 2) wallSides++;
        if (best > worstRamp) worstRamp = best;
      }
    }
    check('every table top in the Ember Wastes can be walked onto from some bearing',
      tables > 20 && walkable === tables,
      `${walkable} of ${tables} table tops, worst easiest way up ${worstRamp.toFixed(2)} m a metre`);
    check('and every one of them has a side you cannot climb, or it is a hill and not a table',
      wallSides === tables, `${wallSides} of ${tables}`);
  }

  // the stacks stay out of the open sea, where the drowned city is
  {
    let inside = 0, band = 0;
    for (let x = SEA.x - SEA.edge; x <= SEA.x + SEA.edge; x += 20) {
      for (let z = SEA.z - SEA.edge; z <= SEA.z + SEA.edge; z += 20) {
        const d = lift(x, z);
        if (d <= 0.5) continue;
        if (seaWithin(x, z) >= 1) inside++; else band++;
      }
    }
    check('no stack stands in the open water over the drowned city', inside === 0,
      `${band} samples of stack in the Sunken Kingdom's shore band, ${inside} in the deep`);
    check('and the shore band really has some, or the karst is a word and not a place', band > 40, `${band}`);
  }

  // THE ROADS STILL GRADE ON IT.
  //
  // `roads.js` lays a road, then walks the surface it would actually leave and
  // throws the road away if the grading cannot get it under ROAD_GRADE. Relief
  // is new ground under that judgement, so the question is not whether the road
  // code still runs but whether any road survives across a mesa realm and meets
  // its own promise at every sample of it. Measured here rather than in
  // roads.test.mjs, which does not know relief exists.
  {
    const all = [];
    for (let cz = -16; cz < 16; cz++) for (let cx = -16; cx < 16; cx++) all.push(...roadsForCell(on, cx, cz));
    const alongRoad = (r, t) => {
      const want = t * r.total;
      let sg = r.segs[r.segs.length - 1], u = 1;
      for (const q of r.segs) if (want <= q.cum + q.len) { sg = q; u = Math.max(0, (want - q.cum) / q.len); break; }
      return { x: sg.x0 + sg.dx * u, z: sg.z0 + sg.dz * u };
    };
    const STEP = 4;
    const through = [];
    for (const r of all) {
      const n = Math.max(2, Math.round(r.total / STEP));
      const realms = new Set();
      let worst = 0, prev = null;
      for (let i = 0; i <= n; i++) {
        const p = alongRoad(r, i / n);
        const rm = realmAt(p.x, p.z);
        if (rm) realms.add(rm.id);
        const sm = on.sampleAt(p.x, p.z);
        // a ford is the river's bank and not the road's grade, exactly as
        // roads.js judges it
        if (sm.river > 0) { prev = null; continue; }
        if (prev !== null) worst = Math.max(worst, Math.abs(sm.h - prev) / STEP);
        prev = sm.h;
      }
      for (const id of realms) if (RELIEF_ZONES.some((zn) => zn.id === id)) { through.push({ r, id, worst }); break; }
    }
    const mesas = through.filter((t) => t.id === 'emberwastes');
    check('roads cross the mesa realm at all', mesas.length > 0,
      `${through.length} roads cross a realm with relief, ${mesas.length} of them the Ember Wastes`);
    const over = through.filter((t) => t.worst > ROAD_GRADE);
    check(`and every one of them meets ROAD_GRADE at every ${STEP} m of it`, over.length === 0,
      `worst ${Math.max(...through.map((t) => t.worst)).toFixed(3)} against ${ROAD_GRADE}; the mesa roads are `
      + mesas.map((t) => `${t.r.id} ${t.worst.toFixed(3)} over ${t.r.total.toFixed(0)} m`).join(', '));
    // and driven the other way: the ground 12 m off those roads is not graded
    let steeper = 0;
    for (const t of mesas) {
      const n = Math.max(2, Math.round(t.r.total / STEP));
      let off = 0, prev = null;
      for (let i = 0; i <= n; i++) {
        const p = alongRoad(t.r, i / n);
        const a = Math.atan2(p.z - t.r.a.z, p.x - t.r.a.x) + Math.PI / 2;
        const sm = on.sampleAt(p.x + Math.cos(a) * 12, p.z + Math.sin(a) * 12);
        if (sm.river > 0) { prev = null; continue; }
        if (prev !== null) off = Math.max(off, Math.abs(sm.h - prev) / STEP);
        prev = sm.h;
      }
      if (off > t.worst) steeper++;
    }
    check('while the ground beside them is steeper, so the grading is doing work',
      steeper === mesas.length, `${steeper} of ${mesas.length} mesa roads are smoother than their own verge`);
  }

  // the site hold: nothing V1 placed wakes up halfway down a cliff
  {
    let worst = 0, name = '', sites = 0;
    for (const st of authoredSites()) {
      const zn = ZONE[st.realm];
      if (!zn.relief) continue;
      sites++;
      let lo = Infinity, hi = -Infinity;
      for (const r of [0, st.flatR * 0.5, st.flatR, st.flatR + 4]) {
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2;
          const d = lift(st.x + Math.cos(a) * r, st.z + Math.sin(a) * r);
          lo = Math.min(lo, d); hi = Math.max(hi, d);
        }
      }
      if (hi - lo > worst) { worst = hi - lo; name = st.name; }
    }
    check('every authored site in a relief realm has level relief right across its pad', worst < 1e-9,
      `worst spread ${worst.toExponential(1)} m at ${name}, over ${sites} sites; the hold fades out over ${RELIEF_HOLD} m past each pad rim`);
  }
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
