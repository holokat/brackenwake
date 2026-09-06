// The world's dressing, measured. Run: node src/world/dressing.test.mjs
//
// The Boneyard was a flat grey plain with pebbles on it, and then the
// Greenwold was a meadow with a dozen field gates standing in it, each one
// leading from grass into grass. The claims this file exists to prove:
//
//   1. open country is never empty. In eight of the nine realms, from twenty
//      points of real open ground, something authored stands inside 60 m. The
//      number is measured per realm and printed, not asserted from the density
//      and hoped for. The ninth is the Greenwold, and D5 changed what its
//      promise is rather than widening the band it is measured in: see the
//      section itself.
//   2. NO GATE STANDS ALONE. Over four hundred chunks, every field gate and
//      every stile in the world is the gap in a run, with the segment before
//      it and the segment after it standing, and it is within a metre and a
//      half of the middle of the two. Zero lone gates, counted.
//   3. every Greenwold settlement has farmland. The settlements within six
//      kilometres of the origin are taken one by one and each has a field
//      inside four hundred metres. No field lies on a road, in water, on a
//      pad, over a grade of 0.12 or across a stand of trees, and the desert,
//      the snow and the fen have none at all.
//   4. the open country carries less. The small loose scatter of the Greenwold
//      away from a road and away from a farm is measured against the same
//      placement with the thinning switched off, which is the world as it
//      stood, and the drop is printed.
//   5. nothing stands where it must not, and none of it costs anything.
//
// A NOTE ON THE CLOCK. `field.sampleAt` builds a road cell on its first touch,
// so the first chunk in a region can cost fifty times the twentieth. Every
// timing below runs on a WARM field and says so.

globalThis.performance ||= { now: () => Date.now() };

import * as THREE from 'three';
import { createWorldField, CHUNK, HOME_RADIUS } from './field.js';
import { REALM_ZONES } from './zones.js';
import { sitesNear } from './sites.js';
import { standAt } from './arbor.js';
import { rand2, hash2 } from './noise.js';
import {
  dressingFor, openAt, probeAt, inPad, inField, realmAt, kitFor, auditKits, densityAt,
  KITS, DENSITY, ALL_KINDS, ANCHOR, SCATTER, JITTER, TRIES, RUGGED,
  SCATTER_CHANCE, ROAD_KEEP, PAD_MARGIN, SHORE_LINE,
  FIELD_KIT, FIELDS_PER, FARM_REALMS, FARM_KINDS, FIELD_REACH, FIELD_GRADE,
  FIELD_MIN, FIELD_MAX, FIELD_SIZES, OPEN_THIN, THIN_REALMS, CROPS, BOUNDS,
  farmFor, fieldGate, roadCrosses, clearFarms, farmsHeld, poolFor, ryAlong,
  workedAt, farmsNear, WORKED_REACH, onlyOk,
} from './dressing.js';
import {
  createDressing, bodyFor, auditBodies, materials, materialFor, variantsOf,
  BODIES, MATERIAL_OF, paletteFor, DRESS_TIER, REBUILD_MS, nameOf, DRESS_NAME,
} from './dressing_models.js';
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const ck = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };
const f2 = (v) => Number(v).toFixed(2);
const SEED = 20260904;
const field = createWorldField(SEED, { homeY: -0.3 });
const now = () => performance.now();

// ------------------------------------------------------------- the kits --

console.log('\nthe kits');
{
  ck('every realm in zones.js has a kit', REALM_ZONES.every((z) => KITS[z.id]),
    REALM_ZONES.filter((z) => !KITS[z.id]).map((z) => z.id).join(', ') || `${REALM_ZONES.length} realms`);
  ck('auditKits passes on the real kits, bodies and all', auditKits(KITS, BODIES) === ALL_KINDS.length,
    `${ALL_KINDS.length} kinds over ${Object.keys(KITS).length} realms`);

  // both directions: it has to refuse as loudly as it accepts
  const gw = () => KITS.greenwold.map((k) => ({ ...k }));
  const cases = [
    ['a realm with no kit', () => { const k = { ...KITS }; delete k.boneyard; return k; }, 'no kit'],
    ['a kit of three kinds', () => ({ ...KITS, boneyard: KITS.boneyard.slice(0, 3) }), 'wanted eight to twelve'],
    ['a prop a hundred metres wide', () => ({ ...KITS, boneyard: KITS.boneyard.map((k, i) => (i ? k : { ...k, size: 100 })) }), 'wanted 0.5 to 12'],
    ['a kind naming a body nobody wrote', () => ({ ...KITS, boneyard: KITS.boneyard.map((k, i) => (i ? k : { ...k, build: 'unicorn' })) }), 'does not exist'],
    ['a realm that farms with its gate taken out', () => ({ ...KITS, greenwold: gw().filter((k) => k.kind !== 'field_gate') }), 'field kinds'],
    ['a realm that does not farm carrying a crop', () => ({ ...KITS, boneyard: KITS.boneyard.concat([{ ...FIELD_KIT[4] }]) }), 'does not farm'],
    ['an axis that is no axis', () => ({ ...KITS, greenwold: gw().map((k) => (k.kind === 'hedgerow' ? { ...k, along: 'q' } : k)) }), 'which is no axis'],
    ['a chance of nothing at all', () => ({ ...KITS, greenwold: gw().map((k) => (k.kind === 'hedgerow' ? { ...k, chance: 0 } : k)) }), 'a chance of 0'],
    ['a kind put down never', () => ({ ...KITS, greenwold: gw().map((k) => (k.kind === 'sarsen' ? { ...k, rare: 0 } : k)) }), 'rare 0'],
    ['a kind put down more than always', () => ({ ...KITS, greenwold: gw().map((k) => (k.kind === 'sarsen' ? { ...k, rare: 1.4 } : k)) }), 'rare 1.4'],
    ['a lattice nobody wrote', () => ({ ...KITS, greenwold: gw().map((k) => (k.kind === 'sheep_fold' ? { ...k, spaced: 'grid' } : k)) }), 'which is no lattice'],
    ['a scatter kind asking to be spaced', () => ({ ...KITS, greenwold: gw().map((k) => (k.kind === 'sarsen' ? { ...k, spaced: 'ring' } : k)) }), 'only an anchor can be spaced'],
    ['a ground nobody works', () => ({ ...KITS, greenwold: gw().map((k) => (k.kind === 'sheaf' ? { ...k, only: 'ploughed' } : k)) }), 'which is nothing'],
    ['a thing of farmed ground in a realm that farms nothing',
      () => ({ ...KITS, boneyard: KITS.boneyard.map((k, i) => (i ? k : { ...k, only: 'worked' })) }), 'farms nothing'],
    ['an open chance above the worked chance',
      () => ({ ...KITS, greenwold: gw().map((k) => (k.kind === 'hedgerow' ? { ...k, openChance: 0.9 } : k)) }), 'an open chance of 0.9'],
    ['an open chance of never',
      () => ({ ...KITS, greenwold: gw().map((k) => (k.kind === 'hedgerow' ? { ...k, openChance: 0 } : k)) }), 'an open chance of 0'],
  ];
  for (const [what, make, want] of cases) {
    let threw = '';
    try { auditKits(make(), BODIES); } catch (e) { threw = e.message; }
    ck(`and throws on ${what}`, threw.includes(want), threw.split('\n')[1]?.trim() || threw || 'it did not throw');
  }

  const sizes = Object.values(KITS).flat().map((k) => k.size);
  ck('every prop is between half a metre and twelve', Math.min(...sizes) >= 0.5 && Math.max(...sizes) <= 12,
    `${Math.min(...sizes)} m to ${Math.max(...sizes)} m`);
  const counts = Object.entries(KITS).map(([r, l]) => `${r} ${l.filter((k) => k.tier !== 'field').length}`);
  ck('eight to twelve kinds a realm on the two grids',
    Object.values(KITS).every((l) => {
      const n = l.filter((k) => k.tier !== 'field').length;
      return n >= 8 && n <= 12;
    }), counts.join(', '));
  ck('every realm keeps one kind that stands on a mountainside',
    Object.values(KITS).every((l) => l.some((k) => k.slope >= RUGGED)),
    Object.entries(KITS).filter(([, l]) => !l.some((k) => k.slope >= RUGGED)).map(([r]) => r).join(', ') || `slope ${RUGGED}`);
  ck('every realm has a density', REALM_ZONES.every((z) => DENSITY[z.id] > 0));

  // Z4: the gate and the stile are not on either grid, anywhere in the world.
  const loose = [];
  for (const [id, list] of Object.entries(KITS)) {
    for (const k of list) if ((k.kind === 'field_gate' || k.kind === 'stile') && k.tier !== 'field') loose.push(`${id}:${k.kind} is tier ${k.tier}`);
  }
  ck('no grid anywhere in the world can roll a gate or a stile', loose.length === 0,
    loose.join(', ') || 'both are tier field in every realm that has them');
  ck('every realm that farms carries all nine field kinds and no realm else carries any',
    [...FARM_REALMS].every((r) => FIELD_KIT.every((k) => KITS[r].some((q) => q.kind === k.kind)))
    && Object.entries(KITS).every(([r, l]) => FARM_REALMS.has(r) || !l.some((k) => k.tier === 'field')),
    `${[...FARM_REALMS].join(', ')} farm; ${Object.keys(KITS).length - FARM_REALMS.size} realms do not`);
  ck('the realms that grow nothing are the desert, the snow, the fen, the ash and the slag',
    ['emberwastes', 'frostreach', 'saltmarch', 'boneyard', 'ashenthrone'].every((r) => !FARM_REALMS.has(r)),
    Object.entries(FIELDS_PER).map(([r, n]) => `${r} ${n}`).join(', '));
}

// ------------------------------------------------- the seed, and its bits --
//
// `noise.hash2` mixed its seed in as `seed * 2147483647` in a double until
// 2026-09-06. The world seed is 20260904, so that product is 4.35e16: past the
// 2^53 where a double stops holding every integer. The low bits of the seed's
// contribution were rounded away, two salts of the same cell came out
// correlated, and every roll drawn after another roll was partly a reading of
// the first one.
//
// Z4 measured it here and could not fix it, because `noise.js` was not its
// file: it cut the seed to twenty bits inside `dressing.js` alone
// (`dressSeed`), and the mix came back. `hash2` is corrected now, with
// `Math.imul` on all three terms, and the cut has gone with it. The dressing
// hashes the world seed like every other file in the world.
//
// THE OLD ARITHMETIC IS REBUILT HERE, exactly, so the fix stays measurable
// after the code that had the bug is gone.

console.log('\nthe seed, and the bits it was losing');
{
  /** `noise.hash2` as it stood before 2026-09-06: the seed multiplied in a double. */
  const oldHash2 = (x, z, sd = 0) => {
    let h = (x | 0) * 374761393 + (z | 0) * 668265263 + (sd | 0) * 2147483647;
    h = (h ^ (h >>> 13)) >>> 0;
    h = Math.imul(h, 1274126177) >>> 0;
    return (h ^ (h >>> 16)) >>> 0;
  };
  const oldRand2 = (x, z, sd = 0) => oldHash2(x, z, sd) / 4294967296;

  // The two rolls `dressingFor` actually draws for a scatter cell, in the order
  // it draws them: seed + 21 asks whether anything is here at all, seed + 24
  // picks the kind out of the pool. The Greenwold's open pool is beehive,
  // sheaf and boundary stone at weights 2, 3 and 4.
  const WANT = [2 / 9 * 100, 3 / 9 * 100, 4 / 9 * 100];
  const mix = (r2) => {
    let n = 0; const got = [0, 0, 0];
    for (let x = 0; x < 300; x++) for (let z = -300; z < 0; z++) {
      if (r2(x, z, SEED + 21) > SCATTER_CHANCE) continue;
      const u = r2(x, z, SEED + 24); n++;
      got[u < 2 / 9 ? 0 : u < 5 / 9 ? 1 : 2]++;
    }
    return { pct: got.map((v) => v / n * 100), n };
  };
  const before = mix(oldRand2);
  const after = mix(rand2);
  const say = (m) => `beehive ${f2(m.pct[0])}%, sheaf ${f2(m.pct[1])}%, boundary stone ${f2(m.pct[2])}%`;
  console.log(`    over ${after.n} scatter cells of the Greenwold that rolled anything at all, on the world seed`);
  console.log(`    wanted  beehive ${f2(WANT[0])}%, sheaf ${f2(WANT[1])}%, boundary stone ${f2(WANT[2])}%`);
  console.log(`    before  ${say(before)}`);
  console.log(`    after   ${say(after)}`);
  ck('the old hash skewed the roll that follows another roll, badly',
    Math.abs(before.pct[2] - WANT[2]) > 20 && before.pct[0] > 60, say(before));
  ck('and the corrected hash puts every one of them within 3 points of its own weight',
    after.pct.every((v, i) => Math.abs(v - WANT[i]) < 3), say(after));
  ck('and it is the SEED that was the trouble: a small seed was always right',
    (() => {
      const small = mix((x, z, sd) => oldRand2(x, z, sd - SEED + 1000));
      return small.pct.every((v, i) => Math.abs(v - WANT[i]) < 3);
    })(), 'the same measurement at a seed of 1000, small enough for the old multiply to be exact');
  ck('and under about four million the two hashes are the same number, bit for bit',
    (() => {
      for (let s2 = 0; s2 < 4000000; s2 += 137891) {
        for (let k = -40; k < 40; k += 7) if (hash2(k, k * 3 - 1, s2) !== oldHash2(k, k * 3 - 1, s2)) return false;
      }
      return true;
    })(), 'which is why every suite that builds its own small world is untouched by the fix');

  // AND THE MEADOW SHOWS IT. The roll above is the arithmetic; this is what a
  // player walks through. It is not the same number and it is not meant to be,
  // for three reasons now.
  //
  // `openAt` lets a boulder stand on ground a beehive will not (RUGGED against
  // a slope of 0.30), and `stubborn` puts a boulder down in an anchor cell
  // whose four rolls the ground refused, so the boulder comes out over its
  // share of the roll on both counts.
  //
  // D4 gave the hive and the boulder a `rare`, which is a veto drawn after the
  // pick: the roll above still picks two, three and four in nine, and then a
  // fraction of the hives and of the boulders is really put down. So what
  // stands in the ground is the weight TIMES the rarity.
  //
  // AND D5 GAVE THE SHEAF `only: 'worked'`, so the three kinds are no longer
  // one pool. On farmed ground all three are in it and the model above holds.
  // Out in the open the sheaf is struck out before the roll and the pool is
  // the hive and the boulder alone, so the open ground has to be measured
  // against ITS own two weights. Measuring the two grounds together was the
  // first thing D5 broke, and it broke it by comparing a mixture against the
  // model of one of its halves.
  //
  // What still has to be true is what the old skew broke: on the ground each
  // kind can stand on, it is there, and it is not the whole of it. The skew
  // the user saw was 72% beehives and 1.5% boundary stones.
  const gwKit = kitFor('greenwold');
  const rareOf = (k) => gwKit.find((q) => q.kind === k).rare;
  const model = (rows) => {
    const t = rows.reduce((a, r) => a + r[1], 0);
    return Object.fromEntries(rows.map(([k, w]) => [k, w / t * 100]));
  };
  const WORKED_MODEL = model([['beehive', 2 * rareOf('beehive')], ['sheaf', 3 * rareOf('sheaf')],
    ['sarsen', 4 * rareOf('sarsen')]]);
  const OPEN_MODEL = model([['beehive', 2 * rareOf('beehive')], ['sarsen', 4 * rareOf('sarsen')]]);
  const openK = { beehive: 0, sheaf: 0, sarsen: 0 }, workK = { beehive: 0, sheaf: 0, sarsen: 0 };
  let chunks = 0;
  for (let dz = -16; dz < 16; dz++) for (let dx = -16; dx < 16; dx++) {
    const cx = -6 + dx, cz = -21 + dz, x0 = cx * CHUNK, z0 = cz * CHUNK;
    chunks++;
    // the fields this chunk can see, through the same two functions the
    // placement itself used, so "worked" here is the placement's own word
    const fs = [];
    for (const n of farmsNear(field, sitesNear(field, x0 + CHUNK / 2, z0 + CHUNK / 2, CHUNK + FIELD_REACH), x0, z0)) {
      for (const f of n.farm.fields) fs.push(f);
    }
    for (const p of dressingFor(field, cx, cz)) {
      if (openK[p.kind] === undefined) continue;
      (workedAt(fs, p.x, p.z) || p.near === 'road' ? workK : openK)[p.kind]++;
    }
  }
  const sumOf = (o) => o.beehive + o.sheaf + o.sarsen;
  const openN = sumOf(openK), workN = sumOf(workK);
  const pct = (o, n) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v / n * 100]));
  const openPct = pct(openK, openN), workPct = pct(workK, workN);
  const sayMix = (o) => `beehive ${f2(o.beehive)}%, sheaf ${f2(o.sheaf)}%, boundary stone ${f2(o.sarsen)}%`;
  console.log(`    over ${chunks} chunks of the Greenwold, ${workN} loose props on farmed ground `
    + `and ${openN} out in the open`);
  console.log(`    farmed ground  ${sayMix(workPct)}`);
  console.log(`    its model      ${sayMix({ ...WORKED_MODEL, sheaf: WORKED_MODEL.sheaf })}`);
  console.log(`    open meadow    ${sayMix(openPct)}`);
  console.log(`    its model      beehive ${f2(OPEN_MODEL.beehive)}%, sheaf 0.00%, `
    + `boundary stone ${f2(OPEN_MODEL.sarsen)}%`);
  const within = (got, want) => Object.entries(want).every(([k, v]) => got[k] > v * 0.4 && got[k] < v * 2.6);
  ck('on farmed ground all three of the Greenwold\'s loose kinds are there, and none is the whole of it',
    workN > 40 && within(workPct, WORKED_MODEL),
    `${workN} props: ${sayMix(workPct)} against ${sayMix(WORKED_MODEL)}`);
  ck('and out in the open the pool is the hive and the boulder, and both of those are there too',
    openN > 40 && within(openPct, OPEN_MODEL),
    `${openN} props: beehive ${f2(openPct.beehive)}% against ${f2(OPEN_MODEL.beehive)}%, `
    + `boundary stone ${f2(openPct.sarsen)}% against ${f2(OPEN_MODEL.sarsen)}%`);
  // The sheaf in the open is not zero and cannot be: the pool is decided ONCE
  // per 32 m anchor cell, at its own centre, and the four scatter cells under
  // it inherit that answer and stand up to half an anchor cell plus their
  // jitter away from where the question was asked. So a sheaf can end up a few
  // tens of metres outside WORKED_REACH. What must not happen is a meadow full
  // of them, which is what 146 a square kilometre was.
  ck('and a sheaf is a thing of farmed ground: hardly any of them are out in the open',
    openK.sheaf < openN * 0.05 && workK.sheaf > workN * 0.5,
    `${workK.sheaf} of the ${workN} loose props on farmed ground are sheaves, and `
    + `${openK.sheaf} of the ${openN} out in the open`);
  ck('the Greenwold keeps its boundary stones, which the skew had all but taken away',
    openK.sarsen > openN * 0.03 && openK.beehive > openN * 0.03,
    `${openK.sarsen} boundary stones and ${openK.beehive} beehives out in the open, `
    + `${f2(openPct.sarsen)}% and ${f2(openPct.beehive)}% of the loose scatter, against the 1.5% the skew left`);
}

// ------------------------------------------------------------ the bodies --

console.log('\nthe bodies');
{
  const t0 = now();
  const m = auditBodies();
  const ms = now() - t0;
  ck('every body builds, is the size its kit asked for and stands on the ground',
    m.bodies > 0, `${m.bodies} bodies, ${m.tris} triangles, built in ${f2(ms)} ms`);
  ck('no body is heavy enough to hurt instanced', m.tris / m.bodies < 400,
    `${(m.tris / m.bodies).toFixed(0)} triangles a body on average`);

  let threw = '';
  try { auditBodies({ test: [{ ...KITS.boneyard[0], kind: 'floater', build: 'floater' }] }); } catch (e) { threw = e.message; }
  ck('and throws when a kind names a body nobody wrote', threw.includes('does not exist'), threw.split('\n')[1]?.trim() || 'it did not throw');

  // Z4: the declared long axis, both ways. A hedge that says it is long in z is
  // a hedge laid across its own run, which is what the Greenwold looked like.
  const hedge = KITS.greenwold.find((k) => k.kind === 'hedgerow');
  let axisThrew = '';
  try { auditBodies({ greenwold: [{ ...hedge, along: 'z' }] }); } catch (e) { axisThrew = e.message; }
  ck('and throws when a kind declares the wrong long axis', axisThrew.includes('long axis is x'),
    axisThrew.split('\n')[1]?.trim() || 'it did not throw');
  const declared = Object.values(KITS).flat().filter((k) => k.along);
  ck('and passes on every kind that really does declare one', declared.length > 0,
    `${declared.length} kinds declare an axis, all measured against their geometry`);

  ck('the whole world runs on four materials', Object.keys(materials()).length === 4, Object.keys(materials()).join(', '));
  ck('every material a kind asks for exists',
    Object.values(MATERIAL_OF).every((m2) => materials()[m2]), Object.entries(MATERIAL_OF).length + ' kinds off the stone default');
  ck('the ice is ice and the brass is brass',
    materialFor('ice_shard').transparent === true && materialFor('brass_pipe').metalness > 0.5 && materialFor('bone_shard').metalness === 0);
  ck('a kind that is its own colour gets it, and one that is not gets its realm\'s',
    paletteFor('boneyard', 'ash_drift').stone === 0xb9b2a0 && paletteFor('boneyard', 'bone_shard').stone === 0x7a7570);
  ck('the same kind in two realms is two colours',
    paletteFor('greenwold', 'cart').wood !== paletteFor('emberwastes', 'broken_cart').wood,
    'a Greenwold cart is oak and a Wastes cart is bleached');
  ck('wheat is wheat in every realm that grows it, and a scarecrow is not',
    paletteFor('greenwold', 'wheat_row').cloth === paletteFor('stormpeaks', 'wheat_row').cloth
    && paletteFor('greenwold', 'scarecrow').cloth !== paletteFor('stormpeaks', 'scarecrow').cloth,
    'the crop is the crop; the coat on the pole is the country\'s');
}

// -------------------------------------------------------------- the gate --

console.log('\nthe gate, both ways');
{
  const spec = kitFor('boneyard').find((k) => k.kind === 'bone_shard');
  const findWhere = (why, from, step, n = 6000) => {
    for (let i = 0; i < n; i++) {
      const x = from[0] + Math.cos(i * 0.7) * i * step, z = from[1] + Math.sin(i * 0.7) * i * step;
      const g = openAt(field, x, z, spec);
      if ((why === null ? g.ok : g.why === why)) return { x, z, g };
    }
    return null;
  };
  const open = findWhere(null, [-4250, 1202], 0.4);
  ck('open country passes the gate', !!open && open.g.ok, open ? `at ${open.x.toFixed(0)}, ${open.z.toFixed(0)}` : 'none found');

  const wet = findWhere('water', [4100, -400], 0.6);
  ck('and open water does not', !!wet, wet ? `at ${wet.x.toFixed(0)}, ${wet.z.toFixed(0)}` : 'none found');

  const home = openAt(field, 40, 20, spec);
  ck('the home clear refuses', !home.ok && home.why === 'home', `${home.why} at 40, 20, inside HOME_RADIUS ${HOME_RADIUS}`);
  const justOut = openAt(field, HOME_RADIUS + 2, 0, spec);
  ck('and two metres past it does not refuse for that reason', justOut.why !== 'home', justOut.why || 'open');

  let onRoad = null;
  for (let gz = -2400; gz <= 2400 && !onRoad; gz += 7) {
    for (let gx = -2400; gx <= 2400; gx += 7) {
      const s2 = field.sampleAt(gx, gz);
      if (s2.road > ROAD_KEEP && !(s2.site && inPad(s2.site, gx, gz))) { onRoad = { x: gx, z: gz, s: s2 }; break; }
    }
  }
  if (onRoad) {
    const g = openAt(field, onRoad.x, onRoad.z, spec, sitesNear(field, onRoad.x, onRoad.z, 260));
    ck('a road refuses', !g.ok && g.why === 'road', `road strength ${f2(onRoad.s.road)} at ${onRoad.x.toFixed(0)}, ${onRoad.z.toFixed(0)}`);
    let off = null, offAt = null;
    for (let i = 0; i < 8 && !off; i++) {
      const a = (i / 8) * Math.PI * 2;
      const ox = onRoad.x + Math.cos(a) * 60, oz = onRoad.z + Math.sin(a) * 60;
      if (field.sampleAt(ox, oz).road > 0) continue;
      offAt = [ox, oz];
      off = openAt(field, ox, oz, spec, sitesNear(field, ox, oz, 260));
    }
    ck('and sixty metres off it does not refuse for that reason', !!off && off.why !== 'road',
      off ? `${off.why || 'open'} at ${offAt[0].toFixed(0)}, ${offAt[1].toFixed(0)}` : 'every bearing at 60 m is on a road');
  } else ck('a road refuses', false, 'no road found to test against');

  const someSite = sitesNear(field, -4250, 1202, 2600).find((s) => s.flatR > 20);
  if (someSite) {
    const g = openAt(field, someSite.x, someSite.z, spec, [someSite]);
    ck('a site\'s pad refuses', !g.ok && g.why === 'pad', `${someSite.id} at ${someSite.x.toFixed(0)}, ${someSite.z.toFixed(0)}, flatR ${someSite.flatR}`);
    const outside = someSite.flatR + PAD_MARGIN + 6;
    ck('and the gate lets go of it outside the pad and its margin',
      !inPad(someSite, someSite.x + outside, someSite.z), `${outside.toFixed(0)} m out`);
    ck('inPad holds inside it', inPad(someSite, someSite.x + someSite.flatR * 0.5, someSite.z));
  } else ck('a site\'s pad refuses', false, 'no site found to test against');

  let steep = null;
  for (let i = 0; i < 8000 && !steep; i++) {
    const x = 1123 + Math.cos(i * 0.7) * i * 0.5, z = -4190 + Math.sin(i * 0.7) * i * 0.5;
    const g = openAt(field, x, z, null);
    if (g.ok && g.slope > 0.8 && g.slope < RUGGED) steep = { x, z, g };
  }
  if (steep) {
    const rugged = kitFor('stormpeaks').find((k) => k.slope >= RUGGED);
    const fussy = kitFor('stormpeaks').find((k) => k.slope < 0.5 && k.tier !== 'field');
    const a = openAt(field, steep.x, steep.z, rugged);
    const b = openAt(field, steep.x, steep.z, fussy);
    ck('a slope of ' + f2(steep.g.slope) + ' takes the rugged kind', a.ok, rugged.kind);
    ck('and refuses the fussy one', !b.ok && b.why === 'slope', `${fussy.kind}, limit ${fussy.slope}`);
  } else ck('slope, both ways', false, 'no slope found to test against');

  // Z4: a field is a place nothing else stands in, and probeAt is openAt's own
  // first half, so the two cannot come to different answers.
  const box = { x: 3000, z: 3000, hw: 30, hh: 30, ca: 1, sa: 0 };
  ck('a field refuses everything that is not its own', openAt(field, 3000, 3000, spec, null, [box]).why === 'field');
  ck('and lets go of it forty metres out', openAt(field, 3040, 3000, spec, null, [box]).why !== 'field');
  ck('inField holds inside and not outside',
    inField(box, 3020, 3020) && !inField(box, 3040, 3000) && inField(box, 3032, 3000, 4));
  const px = -4250 + 811, pz = 1202 + 233;
  const pa = probeAt(field, px, pz, null), oa = openAt(field, px, pz, null);
  ck('probeAt is openAt with the slope taken out, and they agree',
    pa.ok === oa.ok && pa.why === oa.why && pa.s.h === oa.s.h, `both say ${oa.why || 'open'}`);
}

// ------------------------------------------------ NO GATE STANDS ALONE --
//
// The whole of Z4, in one measurement. A field gate and a stile reach the
// world through exactly one code path: the gap a run leaves for them. This
// walks four hundred chunks of the farmed country and asks of every one it
// finds whether the run either side of it is standing.

console.log('\nno gate stands alone');
{
  const spots = [[-6, -21], [-33, -18], [26, -12], [11, 24], [17, 51]];   // five Greenwold neighbourhoods
  const props = [], runs = new Map();
  let chunks = 0;
  for (const [cx0, cz0] of spots) {
    for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) {
      chunks++;
      for (const p of dressingFor(field, cx0 + dx, cz0 + dz)) {
        props.push(p);
        if (p.run) { if (!runs.has(p.run)) runs.set(p.run, new Map()); runs.get(p.run).set(p.ri, p); }
      }
    }
  }
  const gates = props.filter((p) => p.kind === 'field_gate' || p.kind === 'stile');
  let lone = 0, offCentre = 0, worst = 0, noRun = 0;
  for (const g of gates) {
    if (!g.run || !g.gap) { noRun++; lone++; continue; }
    const R = runs.get(g.run);
    const a = R && R.get(g.ri - 1), b = R && R.get(g.ri + 1);
    if (!a || !b) { lone++; continue; }
    const d = Math.hypot(g.x - (a.x + b.x) / 2, g.z - (a.z + b.z) / 2);
    if (d > worst) worst = d;
    if (d > 1.5) offCentre++;
  }
  ck('there are gates to test at all', gates.length > 20, `${gates.length} gates and stiles over ${chunks} chunks, ${props.length} props`);
  ck('not one of them stands on its own', lone === 0,
    `${lone} lone (${noRun} carrying no run at all) of ${gates.length}`);
  ck('and every one is in the middle of the gap its run left', offCentre === 0,
    `worst ${f2(worst)} m off the middle of its two neighbours, against 1.5 m allowed`);
  const inRuns = gates.filter((g) => g.run && runs.get(g.run) && runs.get(g.run).size >= 4).length;
  ck('and every one of them is in a run of real length', inRuns === gates.length,
    `${inRuns} of ${gates.length} in runs of four segments or more`);

  // the runs themselves: field boundaries, not squiggles ending in grass
  const lens = [], counts = [];
  for (const [id, m] of runs) {
    if (id.startsWith('f:')) continue;               // a farm's own boundary is measured further down
    const list = [...m.values()];
    if (list.length < 3) continue;
    let far = 0;
    for (const a of list) for (const b of list) far = Math.max(far, Math.hypot(a.x - b.x, a.z - b.z));
    lens.push(far); counts.push(list.length);
  }
  lens.sort((a, b) => a - b);
  const median = lens[lens.length >> 1];
  ck('a hedgerow is a field boundary and not a squiggle', median >= 40,
    `${lens.length} open country runs, median ${f2(median)} m, longest ${f2(lens[lens.length - 1])} m, `
    + `up to ${Math.max(...counts)} segments`);

  // every segment of a run lies ALONG the run and not across it
  let straight = 0, combed = 0;
  for (const [, m] of runs) {
    const list = [...m.values()].filter((p) => !p.gap).sort((a, b) => a.ri - b.ri);
    if (list.length < 3) continue;
    const spec = kitFor(list[0].realm).find((k) => k.kind === list[0].kind);
    if (!spec || spec.along !== 'x') continue;
    for (let i = 1; i < list.length; i++) {
      // consecutive steps only: where a segment was refused, the step from the
      // one before the hole to the one after it crosses the gap, and where the
      // run turns its corner that step is the corner itself
      if (list[i].ri - list[i - 1].ri !== 1) continue;
      const dx = list[i].x - list[i - 1].x, dz = list[i].z - list[i - 1].z;
      const d = Math.hypot(dx, dz);
      if (d < 1e-6) continue;
      // a body turned by ry lays its own local +X along (cos ry, -sin ry)
      const dot = (Math.cos(list[i].ry) * dx + (-Math.sin(list[i].ry)) * dz) / d;
      if (Math.abs(dot) > 0.9) straight++; else combed++;
    }
  }
  ck('and lies along the run rather than across it', combed === 0 && straight > 50,
    `${straight} segments along the line, ${combed} across it`);
}

// -------------------------------------------------------- the farmland --

console.log('\nthe farmland');
{
  const settle = sitesNear(field, 0, 0, 6000).filter((s) => FARM_KINDS.has(s.kind));
  const green = settle.filter((s) => realmAt(s.x, s.z).id === 'greenwold');
  let farmed = 0, fields = 0, nearest = 0, worstD = 0;
  const sizes = [];
  for (const s of green) {
    const farm = farmFor(field, s, 'greenwold');
    if (!farm.fields.length) continue;
    farmed++;
    fields += farm.fields.length;
    let best = Infinity;
    for (const f of farm.fields) {
      sizes.push(f.hw * 2);
      best = Math.min(best, Math.hypot(f.x - s.x, f.z - s.z));
      worstD = Math.max(worstD, Math.hypot(f.x - s.x, f.z - s.z));
    }
    nearest += best;
  }
  ck('every Greenwold settlement within six kilometres has a farm', farmed === green.length,
    `${farmed} of ${green.length}, ${fields} fields, ${(fields / Math.max(1, farmed)).toFixed(1)} a village`);
  ck('and every field of every one of them is inside the four hundred metre promise', worstD <= FIELD_REACH,
    `nearest field a mean ${(nearest / Math.max(1, farmed)).toFixed(0)} m out, furthest ${worstD.toFixed(0)} m, `
    + `against ${FIELD_REACH} m`);
  ck('and a field is between thirty and eighty metres a side',
    sizes.every((v) => v >= FIELD_MIN && v <= FIELD_MAX),
    `${Math.min(...sizes)} m to ${Math.max(...sizes)} m over ${sizes.length} fields, `
    + `off a ladder of ${FIELD_SIZES.map((h) => h * 2).join(', ')} m`);
  ck('and the ladder itself is guarded, so a fifth size cannot break the promise',
    FIELD_SIZES.every((h) => h * 2 >= FIELD_MIN && h * 2 <= FIELD_MAX),
    'dressing.js throws at import if one ever does');
  ck('and farms cluster: fields share their boundaries rather than stand apart',
    fields / Math.max(1, farmed) >= 2,
    `${(fields / Math.max(1, farmed)).toFixed(1)} fields a farm, against two to four asked`);

  // every realm, and the ones that grow nothing
  const perRealm = {};
  for (const s of sitesNear(field, 0, 0, 7900).filter((q) => FARM_KINDS.has(q.kind))) {
    const r = realmAt(s.x, s.z).id;
    const p = (perRealm[r] ||= { places: 0, fields: 0 });
    p.places++; p.fields += farmFor(field, s, r).fields.length;
  }
  const dead = ['emberwastes', 'frostreach', 'saltmarch', 'boneyard', 'ashenthrone'];
  ck('the desert, the snow, the fen, the ash and the slag grow nothing at all',
    dead.every((r) => !perRealm[r] || perRealm[r].fields === 0),
    dead.map((r) => `${r} ${perRealm[r] ? perRealm[r].places : 0} places, 0 fields`).join('; '));
  ck('the Greenwold has the most and the other realms\' meadow has a few',
    perRealm.greenwold.fields > 20
    && ['verdant', 'stormpeaks', 'sunkenkingdom'].some((r) => perRealm[r] && perRealm[r].fields > 0),
    Object.entries(perRealm).sort((a, b) => b[1].fields - a[1].fields)
      .map(([r, p]) => `${r} ${p.fields}`).join(', '));

  // WHAT THE GROUND UNDER A FIELD IS. The gate is asked again on a denser grid
  // than the one that placed the field, so this is a check and not a restating.
  const all = [];
  for (const s of green) for (const f of farmFor(field, s, 'greenwold').fields) all.push({ f, s });
  let onRoad = 0, wet = 0, onPad = 0, steep = 0, wooded = 0, notMeadow = 0, worstGrade = 0;
  const N = 7;                       // seven a side against the four the placement used
  for (const { f } of all) {
    const near = sitesNear(field, f.x, f.z, 400);
    let lo = Infinity, hi = -Infinity;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const u = (i / (N - 1) - 0.5) * 2 * (f.hw - 1), v = (j / (N - 1) - 0.5) * 2 * (f.hh - 1);
      const x = f.x + u * f.ca - v * f.sa, z = f.z + u * f.sa + v * f.ca;
      const g = probeAt(field, x, z, near);
      if (g.s.water) wet++;
      if (g.s.road > ROAD_KEEP) onRoad++;
      if (near.some((st) => inPad(st, x, z))) onPad++;
      if (g.s.biome !== 'meadow') notMeadow++;
      if (standAt('meadow', x, z, field.seed).cover > 0) wooded++;
      lo = Math.min(lo, g.s.h); hi = Math.max(hi, g.s.h);
    }
    const grade = (hi - lo) / (Math.max(f.hw, f.hh) * 2);
    if (grade > FIELD_GRADE) steep++;
    worstGrade = Math.max(worstGrade, grade);
    if (roadCrosses(field, f)) onRoad++;
  }
  ck('no field lies in water', wet === 0, `${wet} of ${all.length * N * N} probes`);
  ck('no field lies on a road', onRoad === 0,
    `${onRoad}, counting both the probes and an exact walk of every road segment whose box touches the rectangle`);
  ck('no field lies on a site\'s pad', onPad === 0, `${onPad} probes`);
  ck('every field is meadow', notMeadow === 0, `${notMeadow} probes off the meadow`);
  // The placement measures the grade on its own five by five grid; this looks
  // on seven, which finds high and low points the placement never sampled. The
  // margin is what that costs and it is printed rather than hidden: a claim of
  // "exactly 0.12 however hard you look" would be a claim about a continuous
  // surface made from a finite number of samples, and it would not be true.
  ck('no field lies over a grade of ' + FIELD_GRADE + ', even looked at harder than it was placed',
    worstGrade <= FIELD_GRADE + 0.02,
    `worst ${worstGrade.toFixed(4)} rise per metre corner to corner on a grid of ${N} a side, `
    + `${steep} of ${all.length} fields over ${FIELD_GRADE} there, none over ${(FIELD_GRADE + 0.02).toFixed(2)}`);
  // THE CHECK, stated: arbor.standAt is the function flora itself asks before
  // it grows a tree. A tree stands where its cell's roll comes in under the
  // cover, so a cover of zero at every probe is a rectangle no stand of trees
  // reaches into. What can still stand in a field is flora's LONE tree, at
  // most one to a sixty metre square of open ground, which is an oak in the
  // middle of a field and is the right answer anyway.
  ck('no field lies over a stand of trees', wooded === 0,
    `${wooded} of ${all.length * N * N} probes inside a stand, by arbor.standAt, which is the same `
    + 'function flora asks before it grows one');

  // and both directions on the field gate itself
  const good = all[0].f;
  ck('fieldGate accepts the ground it accepted', fieldGate(field, good, sitesNear(field, good.x, good.z, 400)).ok);
  const sea = { ...good, x: 5200, z: 2200 };
  ck('and refuses the open sea', !fieldGate(field, sea).ok, fieldGate(field, sea).why);
  const huge = { ...good, hw: 400, hh: 400 };
  ck('and refuses a rectangle four hundred metres across', !fieldGate(field, huge).ok, fieldGate(field, huge).why);

  // what a field is made of
  let noBound = 0, noGate = 0, noScare = 0, noCrop = 0, crows = 0, ricks = 0, carts = 0;
  const cropsSeen = new Set(), boundsSeen = new Set();
  for (const s of green) {
    const farm = farmFor(field, s, 'greenwold');
    for (const f of farm.fields) {
      // by the field the layout built it FOR, not by where it happens to
      // stand: a boundary two fields share is inside both of them
      const mine = farm.props.filter((p) => p.fid === f.id);
      const bound = mine.filter((p) => p.kind === 'field_hedge' || p.kind === 'rail_fence');
      const gate = mine.filter((p) => p.kind === 'field_gate' || p.kind === 'stile');
      const scare = mine.filter((p) => p.kind === 'scarecrow' || p.kind === 'crowed_scarecrow');
      const crop = mine.filter((p) => p.kind === 'wheat_row' || p.kind === 'cabbage_row' || p.kind === 'furrow');
      if (bound.length < 8) noBound++;
      if (gate.length !== 1) noGate++;
      if (scare.length !== 1) noScare++;
      if (!crop.length) noCrop++;
      if (scare.some((p) => p.kind === 'crowed_scarecrow')) crows++;
      if (mine.some((p) => p.kind === 'hay_rick')) ricks++;
      if (mine.some((p) => p.kind === 'cart')) carts++;
      for (const p of crop) cropsSeen.add(p.kind);
      for (const p of bound) boundsSeen.add(p.kind);
    }
  }
  ck('every field is closed with a boundary', noBound === 0, `${noBound} of ${all.length} with fewer than eight segments`);
  ck('every field has one gate in that boundary and no more', noGate === 0, `${noGate} of ${all.length} without exactly one`);
  ck('every field has one scarecrow standing in it', noScare === 0, `${noScare} of ${all.length} without exactly one`);
  ck('every field is sown', noCrop === 0, `${noCrop} of ${all.length} with no crop`);
  ck('all three crops and both boundaries are grown somewhere',
    cropsSeen.size === CROPS.length && boundsSeen.size === BOUNDS.length,
    `${[...cropsSeen].join(', ')} / ${[...boundsSeen].join(', ')}`);
  ck('a crow sits on some of the scarecrows and a rick stands in some of the fields',
    crows > 0 && crows < all.length * 0.75 && ricks > 0,
    `${crows} crows, ${ricks} ricks and ${carts} carts over ${all.length} fields`);
}

// ---------------------------------------------------- open country is full --

console.log('\nopen country, twenty points a realm');
{
  const POINTS = 20, REACH = 60, RING = 2;
  let worstAll = 0, over = 0;
  for (const zn of REALM_ZONES) {
    // D5: the Greenwold is measured on its own, below, because its promise is
    // not this one any more. It is still walked here so the number is printed
    // beside the other eight and nobody has to go looking for it.
    const own = zn.id === 'greenwold';
    let seed = 20260906;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    let tested = 0, worst = 0, sum = 0, tries = 0, bad = 0;
    while (tested < POINTS && tries < 3000) {
      tries++;
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * zn.r * 0.92;
      const x = zn.x + Math.cos(a) * d, z = zn.z + Math.sin(a) * d;
      if (!openAt(field, x, z, null).ok) continue;
      tested++;
      const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
      let best = Infinity;
      for (let dz = -RING; dz <= RING; dz++) for (let dx = -RING; dx <= RING; dx++) {
        for (const p of dressingFor(field, cx + dx, cz + dz)) best = Math.min(best, Math.hypot(p.x - x, p.z - z));
      }
      sum += best; if (best > worst) worst = best;
      if (best > REACH) bad++;
    }
    if (own) {
      console.log(`  ..  greenwold: mean ${f2(sum / tested)} m, worst ${f2(worst)} m over ${tested} open points. `
        + 'Measured on its own below, in two grounds.');
      continue;
    }
    over += bad; if (worst > worstAll) worstAll = worst;
    ck(`${zn.id}: something authored inside ${REACH} m from every one of ${tested} open points`,
      tested === POINTS && bad === 0, `mean ${f2(sum / tested)} m, worst ${f2(worst)} m`);
  }
  ck(`and nowhere in the other eight realms is further than ${REACH} m`, over === 0,
    `worst of the eight: ${f2(worstAll)} m`);
}

// ------------------------------------- the Greenwold has two grounds now --
//
// D5. THE OLD PROMISE WAS BEING KEPT BY THE THING THE USER COMPLAINED ABOUT.
//
// "Open country is never empty, 60 m in every realm" was written for the
// Boneyard, which is a graveyard and has to read as one from anywhere in it.
// In the Greenwold it was kept almost entirely by hedgerows and drystone
// walls: 1515 hedge segments and 1142 wall segments to the square kilometre of
// OPEN meadow, which is sixty four runs of hedge a square kilometre, one every
// hundred and twenty five metres in every direction, standing in grass and
// bounding nothing. That is what the user was looking at when they wrote
// "weird fences and objects all throughout the world, just looks like
// garbage", and the 60 m number is what had been holding it there.
//
// So the promise is split rather than widened, because the Greenwold has two
// grounds and they owe the player different things.
//
//   FARMED GROUND, within WORKED_REACH of a field, is where a hedge, a wall, a
//   gate, a stile, a sheaf and a rick all belong, and it is FULLER than it was:
//   the hedge and the wall both took a bigger `chance` there. It keeps the
//   whole 60 m promise, measured.
//
//   OPEN MEADOW between one farm and the next is meant to be grass. It keeps
//   about six runs of hedge or wall a square kilometre, one every four hundred
//   metres, which is a boundary seen across a valley, plus the ricks, the
//   hives, the folds and the ponds. It is measured as a DISTRIBUTION and not
//   as a worst case, because at these densities the worst of twenty points is
//   a reading of which twenty points and nothing else: at the same placement,
//   twenty points said 101 m and two hundred said 145 m.
//
// The arithmetic says the second half cannot be a 60 m promise, or a 90 m one,
// at the counts the user asked for. Six runs and about fifty loose props to
// the square kilometre cover roughly four fifths of the open meadow inside
// 90 m, and buying the last fifth costs three times the props, which is the
// clutter back again. The honest thing is to measure what is there and to say
// that the open meadow is QUIET, with a floor under it so that quiet cannot
// drift into bare unnoticed.

console.log('\nthe Greenwold: farmed ground is full, open meadow is quiet');
{
  const RING = 3;                                    // 145 m of gap needs more than a 5 by 5
  const zn = REALM_ZONES.find((z) => z.id === 'greenwold');
  let seed = 20260906;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const open = [], work = [];
  let tries = 0;
  while ((open.length < 120 || work.length < 30) && tries < 40000) {
    tries++;
    const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * zn.r * 0.92;
    const x = zn.x + Math.cos(a) * d, z = zn.z + Math.sin(a) * d;
    if (!openAt(field, x, z, null).ok) continue;
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    const x0 = cx * CHUNK, z0 = cz * CHUNK;
    const fs = [];
    for (const n of farmsNear(field, sitesNear(field, x0 + CHUNK / 2, z0 + CHUNK / 2, CHUNK + FIELD_REACH), x0, z0)) {
      for (const f of n.farm.fields) fs.push(f);
    }
    const onFarm = workedAt(fs, x, z);
    const into = onFarm ? work : open;
    if (into.length >= (onFarm ? 30 : 120)) continue;
    let best = Infinity;
    for (let dz = -RING; dz <= RING; dz++) for (let dx = -RING; dx <= RING; dx++) {
      for (const p of dressingFor(field, cx + dx, cz + dz)) best = Math.min(best, Math.hypot(p.x - x, p.z - z));
    }
    into.push(best);
  }
  const stat = (l) => {
    const v = l.slice().sort((a, b) => a - b);
    return { n: v.length, mean: v.reduce((a, b) => a + b, 0) / v.length, med: v[v.length >> 1],
      p90: v[Math.floor(v.length * 0.9)], worst: v[v.length - 1] };
  };
  const W = stat(work), O = stat(open);
  const say = (t) => `${t.n} points, mean ${f2(t.mean)} m, median ${f2(t.med)} m, p90 ${f2(t.p90)} m, worst ${f2(t.worst)} m`;
  console.log(`  ..  farmed ground, within ${WORKED_REACH} m of a field:  ${say(W)}`);
  console.log(`  ..  open meadow between the farms:              ${say(O)}`);
  ck(`there was enough of both grounds to measure, out of ${tries} points tried`,
    W.n >= 30 && O.n >= 120, `${W.n} on farmed ground, ${O.n} in open meadow`);
  ck('farmed ground keeps the whole 60 m promise: a hedge, a wall or a gate is always in sight',
    W.worst <= 60, `worst ${f2(W.worst)} m, mean ${f2(W.mean)} m`);
  ck('and the open meadow is quiet: half of it is inside 60 m and nine tenths inside 110 m',
    O.med <= 60 && O.p90 <= 110, `median ${f2(O.med)} m, p90 ${f2(O.p90)} m`);
  ck('and quiet is not bare: nowhere in the open meadow is further than 170 m from something authored',
    O.worst <= 170 && Number.isFinite(O.worst), `worst ${f2(O.worst)} m over ${O.n} points`);
  ck('and the farmed country really is fuller than the meadow between the farms',
    W.mean < O.mean * 0.5, `${f2(W.mean)} m against ${f2(O.mean)} m to the nearest authored thing`);
}

// ---------------------------------------------- less clutter in the open --
//
// "Clutter" is the SCATTER TIER: the small loose things, a beehive, a sheaf, a
// milestone, a boundary stone. The measurement is taken in open Greenwold
// meadow only: no road in the chunk, no farm in the chunk, so the thickening a
// road and a village get is not in the number either way.
//
// The before is the same placement with OPEN_THIN at 1, which is the world as
// it stood: the thinning is one roll drawn after the kind, so switching it off
// gives back exactly the props that were there.

console.log('\nless clutter in the open');
{
  const spots = [[-6, -21], [-33, -18], [26, -12], [11, 24], [17, 51], [-25, 8], [8, -34]];
  let wasScatter = 0, nowScatter = 0, wasAll = 0, nowAll = 0, chunks = 0, area = 0;
  const wasKinds = {}, nowKinds = {};
  const scatterOf = (p) => {
    const spec = kitFor(p.realm).find((k) => k.kind === p.kind);
    return spec && spec.tier === 'scatter';
  };
  for (const [cx0, cz0] of spots) {
    for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
      const cx = cx0 + dx, cz = cz0 + dz;
      if (realmAt(cx * CHUNK + 32, cz * CHUNK + 32).id !== 'greenwold') continue;
      const nowP = dressingFor(field, cx, cz);
      if (nowP.some((p) => p.farm)) continue;
      let roaded = false;
      for (let i = 0; i < 5 && !roaded; i++) for (let j = 0; j < 5; j++) {
        const s = field.sampleAt(cx * CHUNK + i * 16, cz * CHUNK + j * 16);
        if (s.road > 0 || s.biome !== 'meadow') { roaded = true; break; }
      }
      if (roaded) continue;
      const was = dressingFor(field, cx, cz, { openThin: 1 });
      chunks++; area += CHUNK * CHUNK;
      for (const p of was) { wasAll++; if (scatterOf(p)) { wasScatter++; wasKinds[p.kind] = (wasKinds[p.kind] || 0) + 1; } }
      for (const p of nowP) { nowAll++; if (scatterOf(p)) { nowScatter++; nowKinds[p.kind] = (nowKinds[p.kind] || 0) + 1; } }
    }
  }
  const ha = area / 10000;
  const drop = 1 - nowScatter / wasScatter;
  const say = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ');
  console.log(`  ..  ${chunks} chunks of open Greenwold meadow, no road and no farm in any of them, ${ha.toFixed(1)} hectares`);
  console.log(`  ..  before: ${wasScatter} loose props, ${(wasScatter / ha).toFixed(1)} a hectare   (${say(wasKinds)})`);
  console.log(`  ..  after:  ${nowScatter} loose props, ${(nowScatter / ha).toFixed(1)} a hectare   (${say(nowKinds)})`);
  console.log(`  ..  all props, both tiers: ${wasAll} before, ${nowAll} after. OPEN_THIN reaches only the `
    + 'scatter tier; what thinned the anchor grid is D4\'s own veto, which is the same in both columns '
    + 'here and is measured in dressing_density.test.mjs.');
  // D5 took the sheaf out of the open pool altogether and cut the boulder from
  // one cell in twenty to one in a hundred and twenty five and the hive from
  // one in five to one in ten, so the BEFORE column of this section, which is
  // the same placement with only the thinning switched off, is now a tenth of
  // what it was when Z4 wrote the bar at a hundred. The bar comes down with
  // the thing it counts; what it is here to catch is a run of chunks with
  // nothing in them at all.
  ck('there was open meadow to measure', chunks > 20 && wasScatter > 20, `${chunks} chunks, ${wasScatter} loose props before the thinning`);
  ck('the loose clutter of the open Greenwold is down by at least a quarter', drop >= 0.25,
    `${(drop * 100).toFixed(1)}% fewer, ${(wasScatter / ha).toFixed(1)} to ${(nowScatter / ha).toFixed(1)} a hectare`);
  ck('and the props of every kind together are down too', nowAll < wasAll,
    `${wasAll} to ${nowAll}, ${((1 - nowAll / wasAll) * 100).toFixed(1)}% fewer`);
  ck('OPEN_THIN is what did it, and only in the realms named', OPEN_THIN < 1 && THIN_REALMS.has('greenwold') && THIN_REALMS.size === 1,
    `OPEN_THIN ${OPEN_THIN} in ${[...THIN_REALMS].join(', ')}`);

  // A ROADSIDE KEEPS WHAT IT HAD, and this is asked of the PROP and not of the
  // chunk. A road crosses one corner of a chunk and leaves the other three in
  // the open, so the cells of one chunk do not all answer the same way. Every
  // record carries the `near` its own cell was placed under, which is the one
  // number the thinning turns on, so the question can be asked exactly.
  let roadWas = 0, roadNow = 0, siteWas = 0, siteNow = 0, openWas = 0, openNow = 0;
  const tally = (list, road, site, open) => {
    for (const p of list) {
      if (!scatterOf(p)) continue;
      if (p.near === 'road') road[0]++; else if (p.near === 'site') site[0]++; else open[0]++;
    }
  };
  const rw = [0], rn = [0], sw = [0], sn = [0], ow = [0], on = [0];
  for (const [cx0, cz0] of spots) {
    for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
      const cx = cx0 + dx, cz = cz0 + dz;
      if (realmAt(cx * CHUNK + 32, cz * CHUNK + 32).id !== 'greenwold') continue;
      tally(dressingFor(field, cx, cz, { openThin: 1 }), rw, sw, ow);
      tally(dressingFor(field, cx, cz), rn, sn, on);
    }
  }
  roadWas = rw[0]; roadNow = rn[0]; siteWas = sw[0]; siteNow = sn[0]; openWas = ow[0]; openNow = on[0];
  ck('and a roadside keeps every prop it had, to the prop',
    roadWas > 0 && roadNow === roadWas && siteNow === siteWas,
    `beside a road ${roadWas} before and ${roadNow} after, beside a place ${siteWas} and ${siteNow}, `
    + `out in the open ${openWas} and ${openNow}`);
  ck('and the open is the only ground that lost anything', openNow < openWas,
    `${((1 - openNow / openWas) * 100).toFixed(1)}% fewer out in the open, 0% anywhere else`);

  // and the other reason the open is emptier: a cart and a signpost are road
  // things now, and the record says what its own cell had near it
  let openCarts = 0, roadCarts = 0;
  for (const [cx0, cz0] of spots) for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
    for (const p of dressingFor(field, cx0 + dx, cz0 + dz)) {
      if (p.farm) continue;
      if (!['cart', 'signpost', 'milestone', 'wayside_shrine'].includes(p.kind)) continue;
      if (p.near === 'road') roadCarts++; else openCarts++;
    }
  }
  ck('a cart, a signpost, a milestone and a shrine stand by a road and nowhere else',
    openCarts === 0 && roadCarts > 0, `${roadCarts} beside a road, ${openCarts} out in the open`);
  const anchors = kitFor('greenwold').filter((k) => k.tier === 'anchor');
  const gwCart = anchors.find((k) => k.kind === 'cart');
  ck('and poolFor is what does it, both ways',
    poolFor(anchors, 'road', 3, 5, 99).includes(gwCart) && !poolFor(anchors, null, 3, 5, 99).includes(gwCart),
    'a cart is in the pool beside a road and out of it anywhere else');

  // D5's own gate, driven true AND false on the two things it decides.
  const gwSheaf = kitFor('greenwold').find((k) => k.kind === 'sheaf');
  const scatters = kitFor('greenwold').filter((k) => k.tier === 'scatter');
  ck('and a sheaf is in the pool on worked ground and beside a road, and out of it in open meadow',
    poolFor(scatters, null, 3, 5, 99, true).includes(gwSheaf)
    && poolFor(scatters, 'road', 3, 5, 99, false).includes(gwSheaf)
    && !poolFor(scatters, null, 3, 5, 99, false).includes(gwSheaf)
    && !poolFor(scatters, 'site', 3, 5, 99, false).includes(gwSheaf),
    'worked yes, roadside yes, open meadow no, a village green no');
  ck('and onlyOk says the same thing on its own, in all four cases',
    onlyOk('worked', null, true) && onlyOk('worked', 'road', false)
    && !onlyOk('worked', null, false) && !onlyOk('worked', 'site', false)
    && onlyOk('road', 'road', false) && !onlyOk('road', null, true),
    'a road thing wants a road however farmed the ground is');

  // AND THE OPEN CHANCE, both ways. A hedgerow is not struck out of the open
  // pool, it is RARER there, so the thing to measure is how many of a run of
  // cells hold one on each ground, against the two numbers the kit declares.
  const gwHedge = kitFor('greenwold').find((k) => k.kind === 'hedgerow');
  let inWorked = 0, inOpen = 0;
  const N = 6000;
  for (let i = 0; i < N; i++) {
    if (poolFor(anchors, null, i, -i * 3 + 11, 99, true).includes(gwHedge)) inWorked++;
    if (poolFor(anchors, null, i, -i * 3 + 11, 99, false).includes(gwHedge)) inOpen++;
  }
  ck('a hedgerow starts on a third of farmed cells and on one open cell in fifty, as the kit asks',
    Math.abs(inWorked / N - gwHedge.chance) < 0.02 && Math.abs(inOpen / N - gwHedge.openChance) < 0.01
    && inOpen > 0,
    `${inWorked} of ${N} worked cells against a chance of ${gwHedge.chance}, `
    + `${inOpen} open cells against an open chance of ${gwHedge.openChance}`);
}

// --------------------------------------------- nothing stands where it must not --

console.log('\nwhere nothing stands');
{
  let props = 0, onWater = 0, onRoad = 0, onPad = 0, atHome = 0, tooSteep = 0, strayKind = 0, inCrop = 0;
  const slopes = [];
  for (const zn of REALM_ZONES) {
    const cx0 = Math.floor(zn.x / CHUNK), cz0 = Math.floor(zn.z / CHUNK);
    for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
      const here = dressingFor(field, cx0 + dx, cz0 + dz);
      const fields = [];
      for (const st of sitesNear(field, (cx0 + dx) * CHUNK + 32, (cz0 + dz) * CHUNK + 32, CHUNK + FIELD_REACH)) {
        if (!FARM_KINDS.has(st.kind)) continue;
        for (const f of farmFor(field, st, realmAt(st.x, st.z).id).fields) fields.push(f);
      }
      for (const p of here) {
        props++;
        const spec = kitFor(p.realm).find((k) => k.kind === p.kind);
        if (!spec) { strayKind++; continue; }
        const near = sitesNear(field, p.x, p.z, 260);
        const g = openAt(field, p.x, p.z, null, near);
        if (g.s.water) onWater++;
        if (g.s.road > ROAD_KEEP) onRoad++;
        if (near.some((st) => inPad(st, p.x, p.z))) onPad++;
        if (Math.hypot(p.x, p.z) < HOME_RADIUS) atHome++;
        if (!p.farm && g.slope > spec.slope + 1e-9) tooSteep++;
        if (!p.farm && fields.some((f) => inField(f, p.x, p.z))) inCrop++;
        slopes.push(g.slope);
      }
    }
  }
  slopes.sort((a, b) => a - b);
  ck('props were placed at all', props > 500, `${props} over 441 chunks of the nine realms`);
  ck('none of them stands in water', onWater === 0, `${onWater} of ${props}`);
  ck('none of them stands on a road', onRoad === 0, `${onRoad} of ${props}`);
  ck('none of them stands on a site\'s pad', onPad === 0, `${onPad} of ${props}`);
  ck('none of them stands in the home clear', atHome === 0, `${atHome} of ${props}, HOME_RADIUS ${HOME_RADIUS} m`);
  ck('none of them stands on ground steeper than its kind takes', tooSteep === 0,
    `${tooSteep} of ${props}, median slope ${f2(slopes[slopes.length >> 1])}, steepest ${f2(slopes[slopes.length - 1])}`);
  ck('every prop is of a kind its own realm keeps', strayKind === 0, `${strayKind} strays`);
  ck('nothing that is not a farm\'s own stands in the standing corn', inCrop === 0, `${inCrop} of ${props}`);
}

// ------------------------------------------------- the home clear, both ways --

console.log('\nthe heart');
{
  let inside = 0, outside = 0;
  for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
    for (const p of dressingFor(field, dx, dz)) {
      if (Math.hypot(p.x, p.z) < HOME_RADIUS) inside++; else outside++;
    }
  }
  ck('nothing is dressed inside the home clear', inside === 0, `${inside} inside ${HOME_RADIUS} m`);
  ck('and the ground just outside it is dressed', outside > 0, `${outside} props in the seven by seven chunks round the origin`);
}

// ------------------------------------------------------------ determinism --

console.log('\ndeterminism');
{
  const key = (list) => list.map((p) => `${p.kind}@${p.x.toFixed(4)},${p.z.toFixed(4)},${p.y.toFixed(4)},${p.s.toFixed(4)},${p.ry.toFixed(4)}`).join('|');
  const cx = Math.floor(-4250 / CHUNK), cz = Math.floor(1202 / CHUNK);
  const a = key(dressingFor(field, cx, cz));
  const b = key(dressingFor(field, cx, cz));
  ck('the same chunk builds the same props twice', a === b, `${a.split('|').length} props`);

  const again = createWorldField(20260904, { homeY: -0.3 });
  ck('and the same props after a reload', key(dressingFor(again, cx, cz)) === a);

  const other = createWorldField(20260905, { homeY: -0.3 });
  ck('and different props under a different seed', key(dressingFor(other, cx, cz)) !== a);

  const west = key(dressingFor(field, cx - 1, cz));
  const east = key(dressingFor(field, cx + 1, cz));
  ck('a chunk does not depend on the order its neighbours loaded',
    key(dressingFor(field, cx - 1, cz)) === west && key(dressingFor(field, cx + 1, cz)) === east);

  // A FARM IS THE HARD CASE. It is four hundred metres across and about a
  // hundred and fifty chunks can see one, so it is laid out once and kept. If
  // the layout depended on which chunk asked first, walking in from the west
  // would give a different farm from walking in from the east.
  const town = sitesNear(field, 0, 0, 6000).find((s) => FARM_KINDS.has(s.kind) && realmAt(s.x, s.z).id === 'greenwold'
    && farmFor(field, s, 'greenwold').fields.length > 1);
  const fk = (farm) => farm.props.map((p) => `${p.kind}@${p.x.toFixed(3)},${p.z.toFixed(3)},${p.ry.toFixed(3)}`).join('|');
  const first = fk(farmFor(field, town, 'greenwold'));
  clearFarms();
  const cold = fk(farmFor(field, town, 'greenwold'));
  clearFarms();
  const fresh = fk(farmFor(createWorldField(20260904, { homeY: -0.3 }), town, 'greenwold'));
  ck('a farm laid out from nothing is the farm that was there before',
    first === cold && cold === fresh, `${first.split('|').length} props, ${farmsHeld()} farms held`);
  const fx = Math.floor(town.x / CHUNK), fz = Math.floor(town.z / CHUNK);
  clearFarms();
  const fromWest = key(dressingFor(field, fx, fz));
  clearFarms();
  for (let i = 6; i >= 0; i--) dressingFor(field, fx + i, fz);      // walk in from the east first
  const fromEast = key(dressingFor(field, fx, fz));
  ck('and a chunk full of farmland is the same whichever way the player walked in',
    fromWest === fromEast, `${fromWest.split('|').length} props at ${fx}, ${fz}`);
}

// ------------------------------------------------------------ the layer --

console.log('\nthe layer');
{
  const scene = new THREE.Scene();
  const dressing = createDressing(scene, field, {});
  const cx = Math.floor(-4250 / CHUNK), cz = Math.floor(1202 / CHUNK);
  for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) dressing.onChunk(cx + dx, cz + dz, 33);
  dressing.flush();
  const s = dressing.stats;
  ck('twenty five chunks of the Boneyard came in', s.chunks === 25 && s.records > 0, `${s.records} props`);
  ck('and are drawn as instances, not as meshes', s.drawCalls > 0 && s.drawCalls < 40,
    `${s.drawCalls} draw calls for ${s.instances} props, ${(s.tris / 1000).toFixed(0)}k triangles`);
  ck('every mesh says what it is and whose it is',
    scene.getObjectByName('world-dressing').children.every((m) => m.userData.dressing?.kind && m.userData.dressing?.realm === 'boneyard'),
    scene.getObjectByName('world-dressing').children.length + ' meshes');
  ck('the Boneyard draws bones and no hedgerows',
    [...dressing.layers.values()].every((L) => L.realm === 'boneyard'),
    [...new Set([...dressing.layers.values()].filter((L) => L.recs.length).map((L) => L.kind))].join(', '));

  for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) dressing.offChunk(cx + dx, cz + dz);
  dressing.flush();
  ck('and every one of them leaves with its chunk', dressing.stats.records === 0 && dressing.stats.drawCalls === 0,
    `${dressing.stats.records} records, ${dressing.stats.drawCalls} draws`);

  dressing.onChunk(cx, cz, 33); dressing.flush();
  ck('a chunk that comes back brings the same props', dressing.stats.records > 0);
  dressing.dispose();
  ck('and dispose leaves nothing in the scene', !scene.getObjectByName('world-dressing'));

  // a farm, streamed in and thrown away, with every new kind on screen
  const town = sitesNear(field, 0, 0, 6000).find((q) => FARM_KINDS.has(q.kind) && realmAt(q.x, q.z).id === 'greenwold'
    && farmFor(field, q, 'greenwold').fields.length > 1);
  const scene2 = new THREE.Scene();
  const farmLayer = createDressing(scene2, field, {});
  const fx = Math.floor(town.x / CHUNK), fz = Math.floor(town.z / CHUNK);
  for (let dz = -5; dz <= 5; dz++) for (let dx = -5; dx <= 5; dx++) farmLayer.onChunk(fx + dx, fz + dz, 33);
  farmLayer.flush();
  const seen = new Set([...farmLayer.layers.values()].filter((L) => L.recs.length).map((L) => L.kind));
  ck('a farm streams in as instanced rows and stays inside the draw budget',
    farmLayer.stats.drawCalls < 40 && [...seen].some((k) => k.endsWith('_row') || k === 'furrow'),
    `${farmLayer.stats.drawCalls} draws, ${farmLayer.stats.instances} instances over 121 chunks round ${town.name}`);
  ck('and the crop, the boundary, the gate and the scarecrow are all in the scene',
    ['field_gate', 'stile'].some((k) => seen.has(k))
    && ['scarecrow', 'crowed_scarecrow'].some((k) => seen.has(k))
    && ['field_hedge', 'rail_fence'].some((k) => seen.has(k)),
    [...seen].sort().join(', '));
  ck('and every farm mesh names its kind and its realm for the hover pass',
    scene2.getObjectByName('world-dressing').children.every((m) => m.userData.dressing?.kind && m.userData.dressing?.realm),
    scene2.getObjectByName('world-dressing').children.length + ' meshes');
  for (let dz = -5; dz <= 5; dz++) for (let dx = -5; dx <= 5; dx++) farmLayer.offChunk(fx + dx, fz + dz);
  farmLayer.flush();
  ck('and the whole farm leaves with its chunks',
    farmLayer.stats.records === 0 && farmLayer.stats.drawCalls === 0,
    `${farmLayer.stats.records} records, ${farmLayer.stats.drawCalls} draws`);
  farmLayer.dispose();
}

// ------------------------------------------------------------- the budget --

console.log('\nwhat it costs (warm field)');
{
  const cx = Math.floor(-4250 / CHUNK), cz = Math.floor(1202 / CHUNK);
  const N = 40;
  for (let i = 0; i < N; i++) dressingFor(field, cx + (i % 8), cz + Math.floor(i / 8));

  let t0 = now(), recs = 0;
  for (let i = 0; i < N; i++) recs += dressingFor(field, cx + (i % 8), cz + Math.floor(i / 8)).length;
  const placeMs = (now() - t0) / N;

  const scene = new THREE.Scene();
  const dressing = createDressing(scene, field, {});
  t0 = now();
  for (let i = 0; i < N; i++) dressing.onChunk(cx + (i % 8), cz + Math.floor(i / 8), 33);
  dressing.flush();
  const buildMs = (now() - t0) / N;
  const st = dressing.stats;

  ck('placement is under 3 ms a chunk', placeMs < 3, `${f2(placeMs)} ms, ${(recs / N).toFixed(1)} props a chunk`);
  ck('placement and build together are under 3 ms a chunk', buildMs < 3, `${f2(buildMs)} ms a chunk over ${N} chunks`);
  ck('the whole layer is under 40 draw calls', st.drawCalls < 40,
    `${st.drawCalls} draws, ${st.instances} instances, ${(st.tris / 1000).toFixed(0)}k triangles over ${N} chunks`);
  ck('worst single chunk placement', st.worstChunkMs < 6, `${f2(st.worstChunkMs)} ms`);
  console.log(`  ..  DRESS_TIER ${DRESS_TIER}, REBUILD_MS ${REBUILD_MS}, ANCHOR ${ANCHOR} m, SCATTER ${SCATTER} m, jitter ${JITTER}, ${TRIES} tries`);
  dressing.dispose();

  // FARMED COUNTRY IS THE WORST CASE NOW and not the Boneyard: a chunk inside
  // a field carries a hundred rows of corn on top of everything else.
  const town = sitesNear(field, 0, 0, 6000).find((q) => FARM_KINDS.has(q.kind) && realmAt(q.x, q.z).id === 'greenwold'
    && farmFor(field, q, 'greenwold').fields.length > 2);
  const fx = Math.floor(town.x / CHUNK), fz = Math.floor(town.z / CHUNK);
  const scene3 = new THREE.Scene();
  const farmLayer = createDressing(scene3, field, {});
  for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) dressingFor(field, fx + dx, fz + dz);   // warm
  const tf = now();
  let n2 = 0;
  for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) { farmLayer.onChunk(fx + dx, fz + dz, 33); n2++; }
  farmLayer.flush();
  const farmMs = (now() - tf) / n2;
  ck('a chunk of farmland places and builds under 3 ms', farmMs < 3,
    `${f2(farmMs)} ms a chunk over ${n2} chunks round ${town.name}, ${farmLayer.stats.records} props`);
  ck('and farmland stays under 40 draws', farmLayer.stats.drawCalls < 40,
    `${farmLayer.stats.drawCalls} draws, ${farmLayer.stats.instances} instances, ${(farmLayer.stats.tris / 1e6).toFixed(2)}M triangles`);
  farmLayer.dispose();

  const scene2 = new THREE.Scene();
  const border = createDressing(scene2, field, {});
  const bx = Math.floor(572 / CHUNK), bz = Math.floor(1641 / CHUNK);
  const tRing = now();
  for (let dz = -9; dz <= 9; dz++) for (let dx = -9; dx <= 9; dx++) border.onChunk(bx + dx, bz + dz, 9);
  border.flush();
  const ringMs = now() - tRing;
  const b = border.stats;
  const realms = [...new Set([...border.layers.values()].filter((L) => L.recs.length).map((L) => L.realm))];
  ck('the whole ring on a border, two realms at once, stays under 40 draws',
    b.drawCalls < 40 && realms.length === 2,
    `${realms.join(' and ')}: ${b.chunks} chunks, ${b.records} props, ${b.drawCalls} draws, ${(b.tris / 1e6).toFixed(2)}M triangles, ${(ringMs / b.chunks).toFixed(2)} ms a chunk`);
  border.dispose();
}

// -------------------------------------------------------------- density --

console.log('\ndensity');
{
  ck('a realm thins outside itself and never to nothing',
    densityAt('boneyard', 1) > densityAt('boneyard', 0) && densityAt('boneyard', 0) > 0,
    `inside ${f2(densityAt('boneyard', 1))}, outside ${f2(densityAt('boneyard', 0))}`);
  const inside = realmAt(-4250, 1202), between = realmAt(-4250, -1800);
  ck('the realm at the Boneyard\'s centre is the Boneyard', inside.id === 'boneyard' && inside.weight === 1);
  ck('and wild ground still belongs to its nearest realm, at no weight',
    between.weight < 1 && !!between.id, `${between.id} at ${f2(between.weight)}`);
  ck('ryAlong lays a body\'s own x down a world bearing',
    Math.abs(Math.cos(ryAlong(1, 0)) - 1) < 1e-9 && Math.abs(-Math.sin(ryAlong(0, 1)) - 1) < 1e-9,
    'east and south, to the bit');
}

// --------------------------------------------------------------- the words --

console.log('\nthe words');
{
  const kinds = Object.values(KITS).flat().map((k) => k.kind);
  ck('every kind has a name to put on hover', kinds.every((k) => nameOf(k).length > 2),
    `${Object.keys(DRESS_NAME).length} written down, ${new Set(kinds).size} kinds in the world`);
  ck('and a name is a noun with its article, not a sentence',
    kinds.every((k) => !/[.!?]/.test(nameOf(k)) && nameOf(k).split(' ').length <= 9));
  ck('nameOf falls back rather than throwing', nameOf('stone_wheel') === 'a stone wheel');
  ck('every kind Z4 added is written down and not read off its id',
    ['field_hedge', 'rail_fence', 'wheat_row', 'cabbage_row', 'furrow', 'scarecrow', 'crowed_scarecrow', 'sheep_fold', 'dew_pond']
      .every((k) => DRESS_NAME[k]),
    [...new Set(FIELD_KIT.map((k) => nameOf(k.kind)))].join(', '));
  for (const f of ['src/world/dressing.js', 'src/world/dressing_models.js', 'src/world/dressing.test.mjs']) {
    ck(`${f} has no em dashes`, !readFileSync(f, 'utf8').includes('\u2014'));
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
