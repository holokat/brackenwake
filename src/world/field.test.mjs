// The world field, driven both ways. Run: node src/world/field.test.mjs
import { createHash } from 'node:crypto';
import {
  createWorldField, SEA_LEVEL, HOME_RADIUS, BIOMES,
  RELIEF_GRADE, RELIEF_MAX_STEP, RAMP_GRADE, RAMP_MAX_STEP, RAMP_FIT, RELIEF_HOLD,
} from './field.js';
import {
  WORLD_HALF, OCEAN_FLOOR, COAST_MIN, HEART_SAFE, ZONE,
  SEA, seaWithin, REEFS, reefWithin, ARCHIPELAGO, archipelagoWithin,
  RELIEF_ZONES, REALM_ZONES, heartFade, authoredSites, realmAt, SITE_DISH,
} from './zones.js';
import { rand2, smoothstep } from './noise.js';
import { PLANS } from '../mmo/plans/index.js';
// The walkable step is the PLAYER's number and there is only one of it. Copying
// 1.2 into this file would make a second source that could drift from the rule
// the game actually applies, so it is imported, THREE and all.
import { MAX_SLOPE } from '../game/player.js';
import { SITE_CELL, SITE_CHANCE, WILD_CHANCE, KINDS, ALL_KINDS, heartCell } from './sitegrid.js';
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
// The band moved on 2026-09-06 with LAND_LO and LAND_HI. The old pair left 55%
// of the world under water and every realm reading as a green archipelago; the
// new one leaves the continent whole, with the Caldera Sea in the middle of it
// and the ring ocean past the rim. Measured over this same 12 km square: 14%.
// The band is kept wide because it is a smoke alarm and not a spec, and 8% is
// low enough to catch a world with no sea left in it.
check('ocean exists (8% to 40%)', ocean / n > 0.08 && ocean / n < 0.40, `${(100 * ocean / n).toFixed(0)}% water`);
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

// 3a. LAND PER REALM, which is the claim the world average cannot make.
//
// One big sea can hold the world average down while a realm the player has to
// walk across is half water, and that is exactly what the old continent mask
// did. So each realm is measured on a uniform grid over its OWN disc, and two
// of the nine are water on purpose and are named rather than waved through:
// the Sunken Kingdom IS the Caldera Sea, and the Ashen Throne's disc reaches
// nine hundred metres into that sea, which is what gives Cinderport a shore to
// stand on. The other seven are dry country with water in them.
//
// Driven both ways: the 70% floor holds for the seven, and the two named ones
// are measured against it and are under it, so the floor is a bound and not a
// formality.
{
  const COAST_REALMS = new Set(['sunkenkingdom', 'ashenthrone']);
  const rows = [];
  for (const zn of REALM_ZONES) {
    let m = 0, dry = 0;
    for (let x = zn.x - zn.r; x <= zn.x + zn.r; x += 40) for (let z = zn.z - zn.r; z <= zn.z + zn.r; z += 40) {
      if ((x - zn.x) ** 2 + (z - zn.z) ** 2 > zn.r * zn.r) continue;
      m++; if (!f.sampleAt(x, z).water) dry++;
    }
    rows.push({ id: zn.id, land: dry / m, n: m });
  }
  const say = rows.map((r) => `${r.id} ${(100 * r.land).toFixed(0)}%`).join(', ');
  const inland = rows.filter((r) => !COAST_REALMS.has(r.id));
  const worst = inland.reduce((a, b) => (a.land < b.land ? a : b));
  check('every realm but the two the sea is in is at least 70% land',
    worst.land >= 0.70, `${say}; the driest walked realm is ${worst.id} at ${(100 * worst.land).toFixed(1)}% over ${worst.n} samples of its disc`);
  const green = rows.find((r) => r.id === 'greenwold');
  check('and the Greenwold, where the first hour happens, is nearly all of it land',
    green.land >= 0.94, `${(100 * green.land).toFixed(1)}% over ${green.n} samples`);
  // the other way: the floor is one a realm can fail, and two of them do
  const sunk = rows.find((r) => r.id === 'sunkenkingdom');
  const ash = rows.find((r) => r.id === 'ashenthrone');
  check('while the Sunken Kingdom is under it, because it is the sea',
    sunk.land < 0.35, `${(100 * sunk.land).toFixed(1)}% land`);
  check('and the Ashen Throne is under it too, because a third of its disc is the Caldera Sea',
    ash.land < 0.70 && ash.land > 0.50, `${(100 * ash.land).toFixed(1)}% land, and Cinderport stands on that shore`);
}

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

// 6. THE HEART, AND THE THREE TIMES IT HAS MOVED.
//
// A 2 km square about the origin, 101 x 101 samples at 20 m, every field of
// every sample digested. It exists because saves exist: a character is standing
// in one of the towns near the origin, and the ground under them may not shift
// under a change that was about something else. The number held from before
// zones.js existed through zones, the world's rim, the Caldera Sea, A3's wild
// structures and V1's relief, and every one of those was proved harmless by
// this line staying green.
//
// IT MOVED ON 2026-09-06, deliberately, three times in one day, and the number
// below is what it moved to.
//
// First the coast. `field.LAND_LO` and `LAND_HI` went from (-0.20, 0.06) to
// (-0.62, -0.34) because 55% of the world was water: the Greenwold read as a
// green archipelago and the Boneyard's hamlet stood on a beach. That is the
// continent function itself, so it moved the raw ground everywhere outside the
// home disc, the heart with it. There was no way to have the world be land and
// have this square be what it was.
//
// Then the spawn. `sitegrid.SPAWN_CLEAR` (600 m) stops the world rolling
// anything for itself within sight of the origin, because the first place has
// to be a walk and a dungeon mouth at 348 m is furniture. Isolated by running
// this same digest with SPAWN_CLEAR set to 0: that gives
// 47ff5817bbd7265ba9f1635840ef43de3f09b7f9c603b2747d784f26f60aefaf, the number
// the coast alone left, and the whole of the difference is 576 samples that
// used to name the Cold Workings and 2 whose height moved, by 0.10 m, where its
// ten metre pad had been. Nothing else R1 did touches this square at all: the
// road judgement, the mine aiming, the karst hold and the two ports that moved
// are all measured against that same 47ff5817 and change none of it.
//
// Then the hash. `noise.hash2` mixed its seed in as `seed * 2147483647` in a
// double, and with the world seed 20260904 that product is 4.35e16, past the
// 2^53 where a double stops holding every integer: the low bits of the seed's
// contribution were rounded away and two salts of the same cell came out
// correlated. Z4 measured it on the dressing's kind roll, which wanted
// 22/33/44 per cent and gave 72/26/1.5. `hash2` uses `Math.imul` on all three
// terms now, so nothing is lost, and every roll this world draws off a cell has
// changed: the rolled sites, the tables of the mesa realms, the trees, the
// roads and the dressing. The authored places did not move. For any seed under
// about four million the fix changes nothing at all, which is why every test
// that builds its own small world is untouched by it.
//
// IT DID NOT MOVE FOR THE DISH (P2, 2026-09-06). `zones.SITE_DISH` sinks the
// floor of a pad under its own rim, and the one site in the world that asks for
// one is the Sunken Chapel, 1759 m from the origin with a 36 m reach. This
// square is 1 km on a side. So the number below is untouched, and section 7c
// measures the 3.6 m it did move out there.
//
// The promise stands, with a new number under it. If a later change moves so
// much as one metre of the heart, this line goes red and names the change that
// did it.
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
  const HEART = 'd0f49cbf0a06008faf66d163ba604935ce8827a337ee2159d12593da78bc51f2';   // re-pinned 2026-09-06 when hash2 was corrected; before that 701b023f (the Greenwold became meadow), 77a4a1da (the spawn clear) and 6408cb4e (before the coast moved)
  const got = h.digest('hex');
  if (process.env.PRINT_HEART) console.log('HEART DIGEST', got);
  check('the 2 km square around the origin is bit for bit what the coast and the spawn clear left it', got === HEART,
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
    // AND THE HEDGE MOVES LESS GROUND THAN THE ROLL IT DISPLACED.
    //
    // This used to read "the cell it took would have rolled nothing anyway",
    // with the hedge's own cell coming in over SITE_CHANCE. That was true of
    // the rolls the broken hash made and of nothing else: under the corrected
    // hash of 2026-09-06 cell 0, 1 rolls 0.4734 and would have held a cave with
    // a twelve metre pad. So the claim is the one that is actually being
    // made, and it is a function of the current rolls rather than a number
    // typed in: whatever the cell would have rolled, the hedge lays LESS pad
    // than it, and the digest above is a square of ground the world moved less
    // than it would have on its own.
    //
    // `rawRoll` is not exported, so the roll is rebuilt here out of the parts
    // that are, in sitegrid's own order: the chance, then the table, then the
    // row. It is the same arithmetic and it is checked against the real world
    // on the cells the hedge does NOT stand in.
    const SEED = 20260904;
    const rolledIn = (cx, cz) => {
      const wild = !heartCell(cx, cz);
      if (rand2(cx, cz, SEED + 1) > (wild ? WILD_CHANCE : SITE_CHANCE)) return null;
      const table = wild ? ALL_KINDS : KINDS;
      const total = table.reduce((a, k) => a + k[0], 0);
      let roll = rand2(cx, cz, SEED + 4) * total, row = table[0];
      for (const k of table) { if (roll < k[0]) { row = k; break; } roll -= k[0]; }
      return row;                                      // [weight, kind, article, flatR]
    };
    const cx = Math.floor(hedge.x / SITE_CELL), cz = Math.floor(hedge.z / SITE_CELL);
    const would = rolledIn(cx, cz);
    check('and it lays less pad than the roll whose cell it took', hedge.flatR <= (would ? would[3] : 0),
      would ? `cell ${cx}, ${cz} would have rolled a ${would[1]} with a ${would[3]} m pad, against the hedge's ${hedge.flatR}`
        : `cell ${cx}, ${cz} would have rolled nothing, against the hedge's ${hedge.flatR} m pad`);
    // and the rebuilt roll is the world's own: every cell of the digest square
    // that the world put a rolled site in is a cell this arithmetic rolled too
    let cells = 0, real = 0, wrong = 0;
    for (let j = -3; j <= 2; j++) for (let i = -3; i <= 2; i++) {
      const st = g.siteInCell(i, j);
      if (st && st.authored) continue;
      cells++;
      if (!st) continue;                              // the ground may refuse what was rolled
      real++;
      const r = rolledIn(i, j);
      // a castle with no town near it is demoted by `rerollWild`, so that one
      // row is allowed to come out as something else
      if (!r || (r[1] !== st.kind && r[1] !== 'castle')) wrong++;
    }
    check('and cells in the same square DO roll sites, so that measurement means something',
      real > 4 && wrong === 0,
      `${real} of ${cells} unauthored cells hold a rolled site, and the roll rebuilt here names the kind of every one of them`);
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
  // RE-PINNED ON 2026-09-06 WITH THE CORRECTED HASH, and this one moved for two
  // reasons rather than one.
  //
  // The tables are rolled off `rand2(i, j, seed + 811..817)`, so a hash that
  // was losing the seed's low bits was rolling every table in the world: where
  // they stand, how tall they are, how wide, and which way their ramp faces.
  // Every one of them moved.
  //
  // And two things in the relief code changed with it, both of them named in
  // field.js. `reliefKeep`, the mountain mask that decides how much of its
  // relief a thing keeps, is asked once per TABLE now and no longer once per
  // sample: it was the one thing in there built out of a noise value rather
  // than a distance, which is what the header of that section forbids, and it
  // laid up to 0.92 m of noise-shaped slope in every metre of a sixty metre
  // plateau. And a table that cannot fit its own ramp is SHORTENED now rather
  // than having its ramp steepened, so every ramp in the world stands at
  // exactly RAMP_GRADE.
  //
  // Before: c8738d3e (the coast) and, before that, c6900f56.
  const MESA = 'd807c78135a47572d0ebcc93609deac2203fd7d509bdc62172a1efa669972494';
  const got = h.digest('hex');
  if (process.env.PRINT_RELIEF) console.log('RELIEF DIGEST', got);
  check('the relief over the Ember Wastes is what it is on this coast', got === MESA,
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

    // and every table of the two lattice reliefs has a way up, BY WALKING.
    //
    // V1 asked this with straight lines from thirty six bearings in to a probe
    // on the top, and it passed 56 of 56 by luck. It is not the question. A
    // mesa is a cliff round most of its rim and one ramp, so a straight line
    // from the wrong side crosses the cliff whatever the ramp does, and a line
    // to a probe that is not on the ramp's own radial leaves the ramp halfway
    // up. Under the corrected hash three of the eighty nine sampled tops had no
    // straight line under 1.2 m a metre and the check went red for a reason
    // that was never the promise.
    //
    // So this walks. A five metre lattice; a cell is ground you can stand on
    // when the height under it moves no more than STEP_MAX in a metre in any of
    // four directions, which is the gradient and not the step along some chosen
    // path (a 3 m a metre wall can be crossed on a lattice by traversing it
    // almost sideways, and a player cannot); and one flood from the table's own
    // top, which succeeds when it reaches ground carrying no more than a third
    // of this table's LIFT. That is "you got down off it", and it is the same
    // question as "you can get onto it".
    //
    // The lift and not the height: a table stands on the hillside the noise
    // made and rides it, so a table on a slope falls eighteen metres across its
    // own top without anybody leaving it. Asking for a drop in HEIGHT let one
    // table of the Ember Wastes call that an escape while still standing on
    // itself. The lift is the table and nothing else.
    //
    // Both realms that grow tables, not only the Ember Wastes: `RELIEF_ZONES`
    // is asked which they are rather than one of them being named.
    //
    // Driven the other way by `ramps: false`, which builds the same world with
    // every table walled the whole way round.
    const LAT = 5;                       // metres between lattice points
    const REACH = 900;                   // metres of flood before it gives up
    const walker = (F, liftOf) => {
      const pass = new Map();
      const level = (i, j) => {
        const k = i + ',' + j; let v = pass.get(k);
        if (v !== undefined) return v;
        const x = i * LAT, z = j * LAT, y = F.heightAt(x, z);
        v = Math.abs(F.heightAt(x + 1, z) - y) <= STEP_MAX && Math.abs(F.heightAt(x - 1, z) - y) <= STEP_MAX
          && Math.abs(F.heightAt(x, z + 1) - y) <= STEP_MAX && Math.abs(F.heightAt(x, z - 1) - y) <= STEP_MAX;
        pass.set(k, v);
        return v;
      };
      return (t) => {
        // stand on the table: the level cell nearest its middle that is really
        // up on the top, which is what `lift >= 0.7 h` says
        const top = Math.max(LAT, t.r - t.run), n = Math.ceil(top / LAT);
        let i0 = null, j0 = null, best = Infinity;
        for (let dj = -n; dj <= n; dj++) for (let di = -n; di <= n; di++) {
          const d2 = di * di + dj * dj;
          if (d2 > n * n || d2 >= best) continue;
          const i = Math.round(t.x / LAT) + di, j = Math.round(t.z / LAT) + dj;
          if (liftOf(i * LAT, j * LAT) < t.h * 0.7 || !level(i, j)) continue;
          best = d2; i0 = i; j0 = j;
        }
        if (i0 === null) return 'no level ground on its top at all';
        const down = t.h * 0.35;
        const lim = Math.ceil(REACH / LAT);
        const seen = new Set([i0 + ',' + j0]);
        let q = [[i0, j0]];
        while (q.length) {
          const nq = [];
          for (const [i, j] of q) {
            if (liftOf(i * LAT, j * LAT) <= down) return true;
            for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const a = i + di, b = j + dj, k = a + ',' + b;
              if (seen.has(k) || Math.abs(a - i0) > lim || Math.abs(b - j0) > lim) continue;
              seen.add(k);
              if (level(a, b)) nq.push([a, b]);
            }
          }
          q = nq;
        }
        return false;
      };
    };
    const LATTICE = RELIEF_ZONES.filter((z) => z.relief.kind === 'mesa' || z.relief.kind === 'cliffs');
    // a table is a table when it is at least 14 m tall, stands inside its own
    // realm, and really rises: one drowned by the Caldera Sea is not a table
    const tablesOf = (F, liftOf) => LATTICE.flatMap((zn) =>
      F.tablesIn(zn.id, zn.x - zn.r, zn.z - zn.r, zn.x + zn.r, zn.z + zn.r)
        .filter((t) => Math.hypot(t.x - zn.x, t.z - zn.z) < zn.r && t.h >= 14 && liftOf(t.x, t.z) >= t.h * 0.7)
        .map((t) => ({ ...t, realm: zn.id })));

    {
      const walkOn = walker(on, lift);
      const ts = tablesOf(on, lift);
      let up = 0, wallSides = 0, worstGrade = 0, shortened = 0; const stuck = [];
      for (const t of ts) {
        if (walkOn(t) === true) up++; else stuck.push(`${t.realm} ${t.x.toFixed(0)}, ${t.z.toFixed(0)}`);
        // a table with a ramp still has a side that is a wall, or it is a hill
        if (t.run < t.ramp) wallSides++;
        worstGrade = Math.max(worstGrade, Math.abs(t.h / t.ramp - RAMP_GRADE));
        if (Math.abs(t.h - t.r * RAMP_FIT * RAMP_GRADE) < 1e-9) shortened++;
      }
      check('every table of the mesa and terrace realms can be walked onto',
        ts.length > 20 && up === ts.length,
        `${up} of ${ts.length} tables walked, over ${LATTICE.map((z) => z.id).join(' and ')}`
        + (stuck.length ? `; stuck: ${stuck.join('; ')}` : ''));
      check('and every one of them has a side you cannot climb, or it is a hill and not a table',
        wallSides === ts.length, `${wallSides} of ${ts.length}`);
      // THE RAMP IS ARITHMETIC AND NOT LUCK. Every table's ramp stands at
      // exactly RAMP_GRADE, because a table that could not fit one has its
      // HEIGHT cut rather than its ramp steepened. Before that inversion a
      // 34.5 m table on a 106 m radius came out at 0.397 a metre and said
      // nothing about it.
      check('and every ramp in the world stands at exactly RAMP_GRADE, with none of them steepened to fit',
        worstGrade < 1e-12 && shortened > 0,
        `${ts.length} tables, worst ${worstGrade.toExponential(1)} off ${RAMP_GRADE}, `
        + `${shortened} of them shortened so their ramp would fit; the steepest metre of any of them `
        + `is ${RAMP_MAX_STEP.toFixed(2)} m against ${STEP_MAX} for a walk`);
    }
    {
      // the other way: the same world with the ramps taken off the tables
      const flat = createWorldField(20260904, { homeBiome: 'meadow', homeY: -0.3, ramps: false });
      const liftF = (x, z) => flat.raw(x, z).h - off.raw(x, z).h;
      const walkFlat = walker(flat, liftF);
      const ts = tablesOf(flat, liftF);
      let up = 0;
      for (const t of ts) if (walkFlat(t) === true) up++;
      check('and with the ramps taken away almost none of them can be, which is what the ramp is for',
        ts.length > 20 && up <= ts.length * 0.25,
        `${up} of ${ts.length} tables walked with every one of them walled the whole way round`);
    }
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
    // The bound is an absolute one now and not a share of the sea. It was a
    // tenth of SEA.full's area, which meant that a sea shrinking round the
    // isles could make a fixed islet illegal without the islet changing by a
    // metre, which is what happened on 2026-09-06 when the coast moved. What an
    // islet actually has to be is small enough to walk round: half a square
    // kilometre is about eight hundred metres across at the widest.
    const ISLET_MAX = 500000;
    check(`and they are small: no islet is over ${ISLET_MAX / 1000} thousand square metres`,
      sizes[0] * step * step < ISLET_MAX,
      `the largest is ${(sizes[0] * step * step / 1000).toFixed(0)} thousand, the median ${(sizes[sizes.length >> 1] * step * step / 1000).toFixed(1)} thousand, `
      + `against ${(Math.PI * SEA.full * SEA.full / 1000000).toFixed(1)} square km of open sea`);
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

// 7c. THE DISH: a pad that is a hollow and not a table.
//
// The Sunken Chapel is a flooded meadow. Its plan lays a water plane 3.6 m over
// the ground at the chapel, and a pad levels that ground, so before this the
// lake stood 3.6 m over a dry, level table thirty five metres across: water
// with nothing under it and nothing holding it in.
//
// `zones.SITE_DISH` gives a site a floor under its own rim, and field.js takes
// it off by the pad's own weight, so the middle of the pad is `dish` metres
// down and the side back up to the rim is the shoulder the pad already had.
// The claims below are the whole of what that has to be true for: the depth is
// the plan's own number, the floor is exactly that far under the rim, the rim
// is still the meadow, the side is walkable in both directions, and a site with
// no dish is the table it always was.
console.log('the dish under the Sunken Chapel');
{
  const st = authoredSites().find((s) => s.sub === 'sunkenchapel');
  const site = f.siteAt(st.x, st.z);
  const R = site.flatR, dish = site.dish;
  const water = (PLANS.sunkenchapel.areas || []).find((a) => a.kind === 'water');

  check('the dish is the depth the plan floods to, and not a second opinion about it',
    SITE_DISH.sunkenchapel === water.y && site.dish === water.y,
    `SITE_DISH ${SITE_DISH.sunkenchapel} m against the plan's water at y ${water.y}`);

  // 1. the floor
  const centre = f.heightAt(site.x, site.z);
  check('the ground at the chapel is 3.6 m below the pad rim it would otherwise stand on',
    Math.abs((site.y - centre) - dish) < 1e-9,
    `rim ${site.y.toFixed(3)} m, floor ${centre.toFixed(3)} m, ${(site.y - centre).toFixed(4)} m of fall`);
  // and it is FLAT down there, not a bowl with a dip in it
  {
    let lo = Infinity, hi = -Infinity;
    for (const d of [0, 4, 8, 12, 16, R * 0.55]) for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const h = f.heightAt(site.x + Math.cos(a) * d, site.z + Math.sin(a) * d);
      lo = Math.min(lo, h); hi = Math.max(hi, h);
    }
    check('and the floor is level right across the flat part of the pad', hi - lo < 1e-9,
      `${(R * 0.55).toFixed(1)} m of floor, 144 points, spread ${(hi - lo).toExponential(1)} m`);
  }

  // 2. the rim is the meadow. At and outside `flatR + 4` the pad has no weight
  // at all, so the ground there has to be the ground the seed made, to the bit.
  // Same arithmetic in the same order as field.js, for the same reason as 6a.
  {
    const bare = (x, z) => { const k = f.homeFactor(x, z); return f.homeY + (f.raw(x, z).h - f.homeY) * k; };
    let off = 0, n = 0;
    for (const d of [R + 4, R + 6, R + 10, R + 20, R + 40]) for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      const x = site.x + Math.cos(a) * d, z = site.z + Math.sin(a) * d;
      off = Math.max(off, Math.abs(f.heightAt(x, z) - bare(x, z))); n++;
    }
    check('and the rim is level with the meadow outside: past it the dish has moved nothing',
      off === 0, `${n} points from ${R + 4} m to ${R + 40} m, worst ${off.toExponential(1)} m off the raw ground`);
  }

  // 3. the side. Two numbers: what the dish itself lays, which is the thing
  // this change is answerable for, and what the ground actually does over the
  // whole pad, which is the number a player's legs meet.
  {
    let dishG = 0;
    for (let d = 0; d <= R + 4; d += 0.05) {
      const w1 = 1 - smoothstep(R * 0.55, R + 4, d), w2 = 1 - smoothstep(R * 0.55, R + 4, d + 0.05);
      dishG = Math.max(dishG, Math.abs(dish * (w2 - w1)) / 0.05);
    }
    check('the dish itself is gentler than the walkable step, everywhere on its side',
      dishG < MAX_SLOPE && dishG < RAMP_MAX_STEP,
      `${dishG.toFixed(3)} m of rise per metre at the steepest, against the ${MAX_SLOPE} the player refuses and the ${RAMP_MAX_STEP} every named climb stands at`);
    let all = 0, at = 0, ang = 0;
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * Math.PI * 2;
      for (let d = 0; d <= R + 6; d += 0.25) {
        const h1 = f.heightAt(site.x + Math.cos(a) * d, site.z + Math.sin(a) * d);
        const h2 = f.heightAt(site.x + Math.cos(a) * (d + 0.25), site.z + Math.sin(a) * (d + 0.25));
        const gg = Math.abs(h2 - h1) / 0.25;
        if (gg > all) { all = gg; at = d; ang = i * 5; }
      }
    }
    check('and the ground over the whole pad, dish and hillside together, is walkable',
      all < MAX_SLOPE, `worst ${all.toFixed(3)} m per metre, ${at.toFixed(1)} m out on the ${ang} degree radial`);
  }

  // 4. a player walks in and out. The rule is player.js's own: a step is
  // refused when the rise over its length is more than MAX_SLOPE. Driven both
  // ways, because a slope you can fall into and not climb out of is a trap.
  {
    let inOk = 0, outOk = 0, steps = 0, worstRise = 0;
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      for (let d = 0; d < R + 8; d += 1) {
        const h1 = f.heightAt(site.x + Math.cos(a) * d, site.z + Math.sin(a) * d);
        const h2 = f.heightAt(site.x + Math.cos(a) * (d + 1), site.z + Math.sin(a) * (d + 1));
        steps++;
        worstRise = Math.max(worstRise, Math.abs(h2 - h1));
        if (h2 - h1 <= MAX_SLOPE) outOk++;      // walking out, up the side
        if (h1 - h2 <= MAX_SLOPE) inOk++;       // walking in, down it
      }
    }
    check('and a player walks in and back out of it, one metre at a time',
      inOk === steps && outOk === steps,
      `${steps} strides on 32 radials, every one accepted both ways, worst rise ${worstRise.toFixed(3)} m in a metre`);
  }

  // 5. what the dish was FOR: the water at the rim and the chapel on the floor.
  // `plan_models` lays the water at `heightAt(centre) + area.y` and beds a
  // piece on the lowest ground under its own footprint, so both of these are
  // the numbers the built place will actually have.
  {
    const surface = centre + water.y;
    let floor = Infinity;
    for (let i = -6; i <= 6; i += 0.5) for (let j = -3.5; j <= 3.5; j += 0.5) {
      floor = Math.min(floor, f.heightAt(site.x + i, site.z + j));
    }
    check('so the water lies at the rim and not over it', Math.abs(surface - site.y) < 1e-9,
      `surface ${surface.toFixed(3)} m, rim ${site.y.toFixed(3)} m`);
    check('and the chapel floor is the floor of the dish, 3.6 m under the surface',
      Math.abs(surface - floor - dish) < 1e-9,
      `floor ${floor.toFixed(3)} m under a 12 by 7 chapel, ${(surface - floor).toFixed(3)} m of water over it`);
  }

  // 6. AND THE OTHER WAY. A site with no dish lays the table it always laid.
  {
    const rows = authoredSites().filter((s) => s.flatR > 0 && !s.dish);
    let worstFlat = 0, name = '';
    for (const row of rows.slice(0, 40)) {
      const sd = f.siteAt(row.x, row.z);
      if (!sd || sd.sub !== row.sub || sd.kind === 'cave' || sd.kind === 'mine') continue;
      const h0 = f.heightAt(sd.x, sd.z);
      let spread = Math.abs(h0 - sd.y);
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        spread = Math.max(spread, Math.abs(f.heightAt(sd.x + Math.cos(a) * sd.flatR * 0.5, sd.z + Math.sin(a) * sd.flatR * 0.5) - sd.y));
      }
      if (spread > worstFlat) { worstFlat = spread; name = sd.name; }
    }
    check('while every site with no dish is still a table at its own height',
      worstFlat < 1e-9 && rows.length > 20,
      `${rows.length} padded sites carry no dish; the worst of the first 40 is ${name}, ${worstFlat.toExponential(1)} m off its own y`);
    check('and only one site in the world asks for one', Object.keys(SITE_DISH).length === 1,
      Object.entries(SITE_DISH).map(([k, v]) => `${k} ${v} m`).join(', '));
  }
}

// 8. cost: a 33x33 chunk must sample in a few milliseconds
const t0 = performance.now();
for (let i = 0; i < 1089 * 10; i++) f.sampleAt(i % 33 * 2, ((i / 33) | 0) % 33 * 2);
const perSample = (performance.now() - t0) / (1089 * 10) * 1000;
check('sampleAt under 12 microseconds', perSample < 12, `${perSample.toFixed(2)} us, chunk of 33x33 = ${(perSample * 1089 / 1000).toFixed(1)} ms`);

// ---------------------------------------------------------------------------
// 9. the hand cut ground (ED2)
//
// The field takes a stroke list from src/world/terrain_edits.js and lays it
// over the world. Everything here is driven through the field's own surface,
// which is the surface the mesher, the collision, the grass and the dressing
// all read, so what passes here is what a player stands on.
// ---------------------------------------------------------------------------
{
  const { createTerrainEdits, deltaOf } = await import('./terrain_edits.js');
  const { probeAt } = await import('./dressing.js');
  const { layerWeights, LAYER_INDEX, PAINT_MIX } = await import('./terrain_material.js');

  // a field of its own, so nothing above this line can be touched by it
  const e = createWorldField(20260904, { homeY: -0.3 });
  const AT = [1480, -2360];                       // open country, well out of the heart

  check('a field with no edits set says so, and carries no ground word',
    e.terrainEdits === null && e.sampleAt(AT[0], AT[1]).ground === null);

  const before = [];
  for (let i = 0; i < 200; i++) {
    const x = AT[0] + (i * 37) % 400 - 200, z = AT[1] + (i * 53) % 400 - 200;
    before.push([x, z, e.heightAt(x, z)]);
  }

  const edits = createTerrainEdits({ baseHeight: (x, z) => e.heightAt(x, z) });
  e.setTerrainEdits(edits);
  check('and setting an empty list still moves nothing',
    before.every(([x, z, h]) => e.heightAt(x, z) === h), `${before.length} points`);

  // a raise, and the ground has to be exactly the old ground plus the profile
  const s = edits.stroke({ kind: 'raise', x: AT[0], z: AT[1], r: 12, amount: 2 });
  let worst = 0, at = '';
  for (const [x, z, h] of before) {
    const want = h + deltaOf(s, x, z, h);
    const d = Math.abs(e.heightAt(x, z) - want);
    if (d > worst) { worst = d; at = `${x}, ${z}`; }
  }
  check('a raise stroke moves heightAt by exactly its own profile, and nothing else',
    worst === 0, `worst difference ${worst} m over ${before.length} points${worst ? ' at ' + at : ''}`);
  {
    const clean0 = createWorldField(20260904, { homeY: -0.3 });
    check('two metres of it at the centre, over the ground that was there',
      Math.abs(e.heightAt(AT[0], AT[1]) - clean0.heightAt(AT[0], AT[1]) - 2) < 1e-9,
      `${(e.heightAt(AT[0], AT[1]) - clean0.heightAt(AT[0], AT[1])).toFixed(6)} m of rise`);
    check('and thirteen metres out, past its rim, the world is the world it always was',
      e.heightAt(AT[0] + 13, AT[1]) === clean0.heightAt(AT[0] + 13, AT[1]));
  }

  // the sample every consumer reads carries the same height as heightAt
  check('sampleAt and heightAt agree about the raised ground',
    e.sampleAt(AT[0], AT[1]).h === e.heightAt(AT[0], AT[1]));

  // paint: what dressing puts there, and what the ground is made of
  // a point of open meadow, found rather than assumed: painting rock over
  // ground that is already rock proves nothing about paint
  let P = null;
  for (let d = 40; d < 900 && !P; d += 20) {
    for (let a = 0; a < 16 && !P; a++) {
      const x = AT[0] + Math.cos(a / 16 * 6.283) * d, z = AT[1] + Math.sin(a / 16 * 6.283) * d;
      const sm = e.sampleAt(x, z);
      if (sm.biome === 'meadow' && probeAt(e, x, z).ok) P = [x, z];
    }
  }
  check('there is open meadow near the stroke to paint over', !!P, P ? `${P[0].toFixed(0)}, ${P[1].toFixed(0)}` : 'none found');
  const openBefore = probeAt(e, P[0], P[1]).ok;
  const biomeBefore = e.sampleAt(P[0], P[1]).biome;
  const wBefore = layerWeights(e.sampleAt(P[0], P[1]), 0, 0);
  edits.stroke({ kind: 'ground', x: P[0], z: P[1], r: 10, word: 'rock' });
  const after = e.sampleAt(P[0], P[1]);
  const wAfter = layerWeights(after, 0, 0);
  check('a ground stroke puts its word on the sample', after.ground === 'rock', `${after.ground}`);
  check('and dressing will not put anything down on it any more',
    probeAt(e, P[0], P[1]).ok === false && probeAt(e, P[0], P[1]).why === 'painted',
    `open before: ${openBefore}, why after: ${probeAt(e, P[0], P[1]).why}`);
  check('and it stops being the country it was, so grass and trees keep off',
    after.biome === 'mountain' && biomeBefore !== 'mountain', `${biomeBefore} to ${after.biome}`);
  check('and the ground is textured as rock rather than as whatever grew here',
    wAfter[LAYER_INDEX.rock] > 0.8 && wAfter[LAYER_INDEX.rock] > wBefore[LAYER_INDEX.rock] + 0.5,
    `rock layer ${wBefore[LAYER_INDEX.rock].toFixed(2)} to ${wAfter[LAYER_INDEX.rock].toFixed(2)}, PAINT_MIX rock ${PAINT_MIX.rock[LAYER_INDEX.rock]}`);
  check('a metre outside the paint the country is untouched',
    e.sampleAt(P[0] + 10.5, P[1]).ground === null && e.sampleAt(P[0] + 10.5, P[1]).biome === biomeBefore);
  check('and dirt, which has no biome of its own, still refuses the dressing',
    (() => {
      const d = createTerrainEdits({ baseHeight: (x, z) => e.heightAt(x, z) });
      const f2 = createWorldField(20260904, { homeY: -0.3 });
      f2.setTerrainEdits(d);
      d.stroke({ kind: 'ground', x: P[0], z: P[1], r: 10, word: 'dirt' });
      const sm = f2.sampleAt(P[0], P[1]);
      const w = layerWeights(sm, 0, 0);
      return sm.ground === 'dirt' && sm.biome === biomeBefore && !probeAt(f2, P[0], P[1]).ok
        && w[LAYER_INDEX.dirt] > 0.7;
    })(), 'the word travels on the sample, the biome does not move, the dirt layer does');

  // caves: a stroke becomes a place
  const C = [AT[0] - 300, AT[1] + 220];
  check('no cave stands here to start with', e.editSitesNear(C[0], C[1], 60).length === 0);
  edits.stroke({ kind: 'cave', x: C[0], z: C[1], r: 10, amount: 2 });
  const near = e.editSitesNear(C[0], C[1], 60);
  const cave = near[0];
  check('a cave stroke stands a cave site up at the point', near.length === 1 && cave.kind === 'cave',
    cave ? `${cave.id} "${cave.name}"` : 'nothing');
  check('and it carries everything a mouth is built from',
    Number.isFinite(cave.x) && Number.isFinite(cave.z) && Number.isFinite(cave.y)
    && Number.isFinite(cave.facing) && typeof cave.name === 'string' && cave.size === 'medium',
    `y ${cave.y.toFixed(2)} m, facing ${cave.facing.toFixed(2)}, size ${cave.size}`);
  check('the mouth stands on the ground the field reports there',
    Math.abs(cave.y - e.heightAt(C[0], C[1])) < 1e-9, `${cave.y.toFixed(3)} m against ${e.heightAt(C[0], C[1]).toFixed(3)} m`);
  check('the mouth faces downhill, out of the slope and not into it',
    e.heightAt(C[0] + Math.sin(cave.facing) * 15, C[1] + Math.cos(cave.facing) * 15)
      < e.heightAt(C[0] - Math.sin(cave.facing) * 15, C[1] - Math.cos(cave.facing) * 15),
    `${e.heightAt(C[0] + Math.sin(cave.facing) * 15, C[1] + Math.cos(cave.facing) * 15).toFixed(2)} m ahead against ${e.heightAt(C[0] - Math.sin(cave.facing) * 15, C[1] - Math.cos(cave.facing) * 15).toFixed(2)} m behind`);
  check('the cut in front of it really is cut',
    e.heightAt(C[0] + Math.sin(cave.facing) * 3, C[1] + Math.cos(cave.facing) * 3)
      < createWorldField(20260904, { homeY: -0.3 }).heightAt(C[0] + Math.sin(cave.facing) * 3, C[1] + Math.cos(cave.facing) * 3) - 1.5);
  check('a cave 400 m away is not near you', e.editSitesNear(C[0] + 400, C[1], 60).length === 0);
  check('undoing the stroke takes the place with it',
    (() => { edits.undo(); return e.editSitesNear(C[0], C[1], 60).length === 0; })());
  check('and redoing it puts the same place back',
    (() => { edits.redo(); const n = e.editSitesNear(C[0], C[1], 60); return n.length === 1 && n[0].id === cave.id; })());

  // and taking the list away gives the seed's own world back, exactly
  e.setTerrainEdits(null);
  const clean = createWorldField(20260904, { homeY: -0.3 });
  let same = 0;
  for (const [x, z] of before) if (e.heightAt(x, z) === clean.heightAt(x, z)) same++;
  check('taking the list away gives the seed its world back, bit for bit',
    same === before.length && e.sampleAt(P[0], P[1]).ground === null, `${same}/${before.length} points`);
}

// ---------------------------------------------------------------------------
// 10. SCULPT MODE (ED3): the world with the generator put away
//
// A terrain file may carry a header saying `sculpt`, and when it does the field
// hands back a table instead of a country: land at `base.height` inside the
// continent mask, the coast and the two seas as they were, and nothing else at
// all. Everything below is driven through `field.sampleAt`, which is the
// surface the mesher, the collision, the grass, the trees and the dressing all
// read, so what passes here is the world a player would walk into.
//
// The digest at the bottom is the same promise the heart's digest makes, for
// the same reason: a blank world is a thing people will build on, and the
// ground under what they build may not move under a change that was about
// something else.
// ---------------------------------------------------------------------------
{
  const { createTerrainEdits } = await import('./terrain_edits.js');
  const { dressingFor } = await import('./dressing.js');
  const { recordsFor } = await import('./flora.js');
  const { roadsForCell, roadDistanceAt, linksForCell } = await import('./roads.js');

  // A field of its own, wired exactly as world_runtime.js wires one.
  const s = createWorldField(20260904, { homeBiome: 'meadow', homeY: -0.3 });
  const edits = createTerrainEdits({ baseHeight: (x, z) => s.heightAt(x, z) });
  s.setTerrainEdits(edits);
  check('a field with a plain list over it is still the generated world',
    s.sculpt === null && s.heightAt(1480, -2360) === f.heightAt(1480, -2360),
    `${s.heightAt(1480, -2360).toFixed(3)} m, the same as the field with no list at all`);

  edits.setBase({ mode: 'sculpt' });
  s.setTerrainEdits(edits);                       // the one join, called again for the header
  check('and the header turns it into a flat one', !!s.sculpt && s.sculpt.height === 6, JSON.stringify(s.sculpt));

  // 10a. FLAT, and flat to the last bit where the continent mask has closed.
  let inland = 0, worstFlat = 0, worstAt = null;
  for (let z = -4000; z <= 4000; z += 37) for (let x = -4000; x <= 4000; x += 37) {
    if (s.raw(x, z).land !== 1) continue;         // the mask has not closed here: it is coast
    inland++;
    const d = Math.abs(s.heightAt(x, z) - 6);
    if (d > worstFlat) { worstFlat = d; worstAt = [x, z]; }
  }
  check('inside the continent mask the ground is the base height, exactly',
    worstFlat === 0 && inland > 30000,
    `${inland} points, worst ${worstFlat} m off 6 m${worstAt ? ' at ' + worstAt : ''}`);

  // 10b. what the generator used to put there, and does not any more
  let rivers = 0, roads = 0, rolled = 0, authored = 0, hills = 0;
  const biomes = {};
  for (let z = -6000; z <= 6000; z += 97) for (let x = -6000; x <= 6000; x += 97) {
    const p = s.sampleAt(x, z);
    biomes[p.biome] = (biomes[p.biome] || 0) + 1;
    if (p.river > 0) rivers++;
    if (p.road > 0) roads++;
    if (p.site) { if (p.site.authored) authored++; else rolled++; }
    if (p.land === 1 && p.h !== 6) hills++;
  }
  check('no rivers anywhere in it', rivers === 0, `${rivers} of ${Object.values(biomes).reduce((a, b) => a + b, 0)} samples`);
  check('no roads anywhere in it', roads === 0, `${roads} samples on a road`);
  check('no hills anywhere inland', hills === 0, `${hills} samples off the base height`);
  check('and nothing the seed rolled for itself stands in it',
    rolled === 0 && authored > 0,
    `${rolled} samples name a rolled site, ${authored} name an authored one`);
  check('the country is one biome, plus the water at its edges and the shore between',
    Object.keys(biomes).sort().join(' ') === 'beach meadow ocean',
    Object.entries(biomes).map(([k, v]) => `${k} ${v}`).join(', '));

  // driven the other way: the SAME field, generating, has all of it
  const gen = createWorldField(20260904, { homeBiome: 'meadow', homeY: -0.3 });
  let genRivers = 0, genRolled = 0, genBiomes = new Set();
  for (let z = -6000; z <= 6000; z += 97) for (let x = -6000; x <= 6000; x += 97) {
    const p = gen.sampleAt(x, z);
    genBiomes.add(p.biome);
    if (p.river > 0) genRivers++;
    if (p.site && !p.site.authored) genRolled++;
  }
  check('and the same square of the generated world has all three of those',
    genRivers > 0 && genRolled > 0 && genBiomes.size > 3,
    `${genRivers} river samples, ${genRolled} rolled sites, ${genBiomes.size} biomes: ${[...genBiomes].sort().join(' ')}`);

  // 10c. the authored places still stand, on the flat, with no pad under them
  const town = s.siteAt(789, 1533);
  check('an authored town still stands where the sheet puts it',
    !!town && town.authored && town.id === gen.siteAt(789, 1533).id, town ? town.id : 'nothing there');
  check('but it lays no pad: the ground across its precinct is the base height',
    (() => { let off = 0; for (let a = 0; a < 32; a++) { const th = a / 32 * Math.PI * 2;
      for (const d of [0, 30, 60, 90, 120]) off = Math.max(off, Math.abs(s.heightAt(789 + Math.cos(th) * d, 1533 + Math.sin(th) * d) - 6)); } return off === 0; })(),
    `flatR ${town.flatR} m, and 160 points across it are all at 6 m`);
  check('where the generated world grades that same precinct',
    (() => { let off = 0; for (const d of [0, 60, 120]) off = Math.max(off, Math.abs(gen.heightAt(789 + d, 1533) - gen.heightAt(789 + 300, 1533))); return off > 1; })(),
    'the pad moves the ground there by more than a metre');

  // 10d. no roads, and refused where a road is BUILT and not only where it is graded
  check('roads.js will not lay a road out for a sculpt field at all',
    roadsForCell(s, 1, 3).length === 0 && linksForCell(s, 1, 3).length === 0 && roadDistanceAt(s, 789, 1533) === null,
    'roadsForCell, linksForCell and roadDistanceAt all come back empty');
  check('and it does lay them for the same cell of the generated world',
    (() => { let n = 0; for (let cx = -6; cx <= 6; cx++) for (let cz = -6; cz <= 6; cz++) n += roadsForCell(gen, cx, cz).length; return n > 0; })(),
    'the generated world has roads in the same 169 cells');

  // 10e. nothing is scattered and nothing grows
  let dressed = 0, grown = 0;
  for (let cx = 10; cx < 16; cx++) for (let cz = 20; cz < 26; cz++) {
    dressed += dressingFor(s, cx, cz, { sitesNear: (x, z, r) => s.editSitesNear(x, z, r) }).length;
    const rec = recordsFor(s, cx, cz, { sitesNear: () => [] });
    for (const k of Object.keys(rec)) grown += rec[k].length;
  }
  check('36 chunks of a sculpt world hold nothing dressed and nothing grown',
    dressed === 0 && grown === 0, `${dressed} dressing records, ${grown} trees and boulders`);
  {
    let gd = 0, gg = 0;
    for (let cx = 10; cx < 16; cx++) for (let cz = 20; cz < 26; cz++) {
      gd += dressingFor(gen, cx, cz, { sitesNear: (x, z, r) => [] }).length;
      const rec = recordsFor(gen, cx, cz, { sitesNear: () => [] });
      for (const k of Object.keys(rec)) gg += rec[k].length;
    }
    check('and the same 36 chunks of the generated world are full of both',
      gd > 0 && gg > 0, `${gd} dressing records, ${gg} trees and boulders`);
  }

  // 10f. the two lines in the header, and paint winning over both
  const m = edits.stroke({ kind: 'mountain', x: 0, z: 0, r: 400, amount: 260, roughness: 0.6 });
  check('a mountain somebody raised wears snow above the header line, without anybody painting it',
    s.sampleAt(0, 0).h >= s.sculpt.snowLine && s.sampleAt(0, 0).biome === 'snow',
    `${s.sampleAt(0, 0).h.toFixed(1)} m, biome ${s.sampleAt(0, 0).biome}, snow line ${s.sculpt.snowLine} m`);
  check('and its flank below the line does not',
    s.sampleAt(300, 0).h < s.sculpt.snowLine && s.sampleAt(300, 0).biome === 'meadow',
    `${s.sampleAt(300, 0).h.toFixed(1)} m, biome ${s.sampleAt(300, 0).biome}`);
  edits.setBase({ snowLine: 40 });
  s.setTerrainEdits(edits);
  check('moving the line moves the snow, which is what putting it in the header is for',
    s.sampleAt(300, 0).biome === 'snow',
    `the same flank at ${s.sampleAt(300, 0).h.toFixed(1)} m was meadow under a 180 m line and is ${s.sampleAt(300, 0).biome} under a 40 m one`);
  edits.setBase({ snowLine: 180 });
  s.setTerrainEdits(edits);

  const lake = edits.stroke({ kind: 'lake', x: 1500, z: 0, r: 40 });
  check('a lake fills, because water is decided after the strokes are laid',
    s.sampleAt(1500, 0).water && s.sampleAt(1500, 0).biome === 'ocean',
    `floor ${s.sampleAt(1500, 0).h.toFixed(2)} m, sea level ${SEA_LEVEL} m`);
  check('and there is a beach round its edge, from the other line in the header',
    (() => { for (let d = 30; d <= 44; d += 0.5) { const p = s.sampleAt(1500 + d, 0);
      if (!p.water && p.h < s.sculpt.beachLine && p.biome === 'beach') return true; } return false; })(),
    `beach line ${s.sculpt.beachLine} m`);

  edits.stroke({ kind: 'ground', x: 0, z: 0, r: 30, word: 'gravel' });
  check('painted ground wins over the snow line, over the beach line and over the base',
    s.sampleAt(0, 0).ground === 'gravel', `ground ${s.sampleAt(0, 0).ground}, biome ${s.sampleAt(0, 0).biome}`);
  edits.undo();

  // 10g. a world made of another word
  edits.setBase({ ground: 'snow' });
  s.setTerrainEdits(edits);
  check('a world can be made of snow, and then it is snow everywhere the base shows',
    s.sampleAt(3000, 3000).biome === 'snow' && s.sampleAt(3000, 3000).h === 6,
    `biome ${s.sampleAt(3000, 3000).biome} at ${s.sampleAt(3000, 3000).h} m`);
  edits.setBase({ ground: 'grass' });
  s.setTerrainEdits(edits);

  // 10h. and back again: taking the header off gives the seed its world back
  edits.reset();
  edits.setBase({ mode: 'generate' });
  s.setTerrainEdits(edits);
  let same = 0, n = 0;
  for (let z = -3000; z <= 3000; z += 311) for (let x = -3000; x <= 3000; x += 311) {
    n++;
    if (s.heightAt(x, z) === gen.heightAt(x, z) && s.sampleAt(x, z).biome === gen.sampleAt(x, z).biome) same++;
  }
  check('putting the header back to generate gives the seed its world back, bit for bit',
    same === n, `${same}/${n} points, height and biome both`);

  // ---- 10i. THE DIGEST OF THE BLANK WORLD -------------------------------
  //
  // A 6 km square at 60 m, every field of every sample. Pinned for the same
  // reason the heart's digest is pinned: this is the ground a person is going
  // to build a world on, and if a later change moves so much as one metre of
  // it, this line goes red and names the change that did it.
  {
    const d = createWorldField(20260904, { homeBiome: 'meadow', homeY: -0.3 });
    const de = createTerrainEdits({ baseHeight: (x, z) => d.heightAt(x, z), mode: 'sculpt' });
    d.setTerrainEdits(de);
    const h = createHash('sha256');
    let cells = 0, named = 0;
    for (let z = -3000; z <= 3000; z += 60) for (let x = -3000; x <= 3000; x += 60) {
      const p = d.sampleAt(x, z); cells++;
      if (p.site) named++;
      h.update(`${p.h}|${p.biome}|${p.water}|${p.river}|${p.land}|${p.temp}|${p.moist}|${p.road}|${p.site ? p.site.id : '-'}\n`);
    }
    const SCULPT = '19a62f5b918b21edf3eb8c937096b91e8f0d4eb369511dd0990a9376a4b38e64';   // pinned 2026-09-07, ED3
    const got = h.digest('hex');
    if (process.env.PRINT_SCULPT) console.log('SCULPT DIGEST', got);
    check('the 6 km square of the blank world is what ED3 laid down', got === SCULPT,
      `${cells} samples, ${named} name a site, ${got.slice(0, 16)}...`);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
