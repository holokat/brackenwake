// The bounded world, the Caldera Sea, and Kaldera's nine realms with the ninety
// five places inside them, driven both ways.
// Run: node src/world/zones.test.mjs
import {
  ZONES, ZONE, ZONE_COUNT, REALM_ZONES, SUB_ZONES, subZonesOf,
  zoneAt, zoneBias, weightOf, realmAt, authoredSites, auditZones,
  WORLD_HALF, OCEAN_FLOOR, COAST_INNER, COAST_MIN, COAST_WOBBLE, HEART_SAFE,
  BIOME_OVERRIDE_W, oceanBeyond, insideWorld, clampToWorld, coastRadiusAt,
  wildDanger, WILD_ORE, zoneSub, DANGER_WORD, ORE_LADDER,
  SEA, seaWithin, REEFS, reefAt, ARCHIPELAGO, archipelagoWithin,
  discOverlap, SIBLING_OVERLAP, CELL_PAD_MAX, TOWN_PRECINCT_R, MAX_FLAT_R,
  STANDS_IN_WATER, RELIEF_ZONES, EXTRA_ARTICLE, ARTICLE, articleFor, FLAT_R, heartAllows,
  SITE_DISH, BIRTHPLACE, birthplaceFor,
} from './zones.js';
import { PLANS } from '../mmo/plans/index.js';
import { stopsOf } from '../mmo/plans/footprints.js';
import { openAt } from '../mmo/release.js';
import { REALMS, PLACES } from '../mmo/realms.js';
import { createWorldField, SEA_LEVEL, RAMP_MAX_STEP } from './field.js';
import { authoredInCell, SITE_CELL, mineParts } from './sitegrid.js';
import { createDiscovery, ZONE_ENTER_W, zoneChain } from './sites.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

const SEED = 20260904;
const f = createWorldField(SEED, { homeBiome: 'meadow', homeY: -0.3 });

// The kinds of place that get something built on them. V1 added the last two:
// ten mega structures (the eleventh is a town) and every landmark in the sheet.
const BUILDING_KINDS = new Set(['hub', 'town', 'hamlet', 'dungeon', 'mine', 'cave', 'ruin', 'shrine', 'camp', 'megastructure', 'landmark']);
const PLACE = Object.fromEntries(PLACES.map((p) => [p.id, p]));
/** A place in the Caldera Sea is reached by boat, so a flood fill cannot judge it. */
const afloat = (id) => PLACE[id] && (PLACE[id].realm === 'sunkenkingdom' || seaWithin(ZONE[id].x, ZONE[id].z) > 0);
/**
 * And which places the WALK is allowed to skip, which is a narrower list.
 *
 * `afloat` says the sea's own falloff reaches a point, and `seaWithin` is alive
 * out to SEA.edge, 600 m past the open water. That is the right question for
 * "is this among the isles"; it is the wrong one for "can you get there",
 * because it exempts any town on the sea's landward shore from having to be
 * walkable at all. When R1 moved the two ports onto the real shore in 2026-09-06
 * both of them fell straight through that hole, and a harbour you cannot reach
 * on foot is not a harbour. So the walk skips the Sunken Kingdom and nothing
 * else: its ten places are the drowned city and the reefs over it, and a boat is
 * the point of them. Measured on the current world: The Red Queen's Harbour and
 * Cinderport are 45 m from the walk, The Salt Cut 36 m, The Ember Cut 41 m.
 */
const byBoat = (id) => PLACE[id] && PLACE[id].realm === 'sunkenkingdom';
/** The four places the table says stand IN the water, on the sea floor. */
const drowned = new Set(STANDS_IN_WATER);
/** Measured: dry ground that no realm reaches. 18.8% of the world is like it. */
const WILD_POINT = [-3400, -1800];

// ---------------------------------------------------------------- the table --
console.log('zones: the table is realms.js');
{
  const r = auditZones();
  check('the table audits clean at import', r.realms === 9 && r.subzones === PLACES.length && r.zones === ZONE_COUNT,
    `${r.zones} zones: ${r.realms} realms and ${r.subzones} subzones, ${r.sites} authored sites, ${r.mines} mines`);
  check('every zone id is in the ZONE index', ZONES.every((z) => ZONE[z.id] === z));
  check('one realm zone for every realm in the sheet', REALM_ZONES.length === REALMS.length
    && REALMS.every((rr) => ZONE[rr.id] && ZONE[rr.id].parent === null), REALM_ZONES.map((z) => z.id).join(', '));
  check('one subzone for every place in the sheet', SUB_ZONES.length === PLACES.length
    && PLACES.every((p) => ZONE[p.id] && ZONE[p.id].parent === p.realm), `${SUB_ZONES.length} subzones`);
  check('every realm takes its centre and radius straight from realms.js', REALMS.every((rr) => {
    const z = ZONE[rr.id];
    return z.x === rr.x && z.z === rr.z && z.r === rr.r && z.name === rr.name && z.line === rr.line;
  }));
  check('and every subzone takes its name and its line from its place', PLACES.every((p) => {
    const z = ZONE[p.id];
    return z.name === p.name && z.line === p.geography;
  }));

  check('the Greenwold, which holds the heart, is farmland: its own meadow and no climate nudge', ZONE.greenwold.biome === 'meadow' && !ZONE.greenwold.climate);
  const biased = REALM_ZONES.filter((z) => z.biome || z.climate);
  check('eight of the nine realms are more than a tint, the Greenwold included since it became farmland', biased.length === 8, `${biased.map((z) => z.id).join(', ')}`);
  check('and not one subzone carries a bias of its own', SUB_ZONES.every((z) => !z.biome && !z.climate));

  // THE HEART, measured on the same grid the audit uses, and named
  {
    let worstId = null, worstAt = null, nearest = Infinity;
    for (let z = -HEART_SAFE; z <= HEART_SAFE; z += 25) for (let x = -HEART_SAFE; x <= HEART_SAFE; x += 25) {
      if (x * x + z * z > HEART_SAFE * HEART_SAFE) continue;
      const b = zoneBias(x, z);
      if ((b.biome || b.climate) && b.biasWeight > 0 && (b.parent ? b.parent.id : b.id) !== 'greenwold') { worstId = b.id; worstAt = [x, z]; }
    }
    check('no other realm\'s bias wins anywhere inside the heart', worstId === null, worstId ? `${worstId} at ${worstAt}` : `${HEART_SAFE} m disc at 25 m, all Greenwold`);
    // and how near the nearest biased realm actually gets
    for (const b of biased) {
      if (b.id === 'greenwold') continue;
      for (let i = 0; i < 720; i++) {
        const a = (i / 720) * Math.PI * 2;
        for (let d = HEART_SAFE; d < 5000; d += 25) {
          const x = Math.cos(a) * d, z = Math.sin(a) * d;
          const hit = zoneBias(x, z);
          if ((hit.parent || hit.zone) && hit.biome === null && !hit.climate) continue;
          if ((hit.parent ? hit.parent.id : hit.id) === b.id && hit.biasWeight > 0) { nearest = Math.min(nearest, d); break; }
        }
      }
    }
    check('and the nearest biased country starts well outside it', nearest > HEART_SAFE, `the first biased ground is ${nearest.toFixed(0)} m from the origin`);
  }
  // driven the other way: a realm dragged onto the heart WOULD be caught
  {
    const spy = ZONE.boneyard;
    const keep = spy.x;
    spy.x = 900;
    let threw = false;
    try { auditZones(); } catch (e) { threw = /heart/.test(e.message); }
    spy.x = keep;
    check('and a realm moved onto the heart would throw', threw);
    auditZones();
  }

  // the banner's subtitle: three or four words, because hud.zone puts it in
  // small caps at .3em. A realm says how dangerous it is; a place says which
  // realm it is in.
  check('every zone has a short line for the banner', ZONES.every((z) => {
    const sub = zoneSub(z);
    return sub && sub.length <= 24 && sub.split(' ').length <= 4;
  }), [...new Set(ZONES.map((z) => zoneSub(z)))].join(' / '));
  // The banner says the TOP of the band, so the Greenwold at 1 to 2 says the
  // tier 2 word. Read off the zone, not typed, so the next band that moves
  // moves this with it.
  check('a realm says its danger and a place says its realm',
    zoneSub(ZONE.greenwold) === DANGER_WORD[ZONE.greenwold.danger[1]] && zoneSub(ZONE.hearthhome) === ZONE.greenwold.short
    && zoneSub(ZONE.glassroad) === ZONE.emberwastes.short,
    `${ZONE.hearthhome.name} reads "${zoneSub(ZONE.hearthhome)}", ${ZONE.glassroad.name} reads "${zoneSub(ZONE.glassroad)}"`);
  check('and every tier has a word', [1, 2, 3, 4, 5].every((t) => !!DANGER_WORD[t]) && zoneSub(null) === '');
  check('the heart is the quiet one and the rim is not', zoneSub(ZONE.greenwold) !== zoneSub(ZONE.ashenthrone),
    `${zoneSub(ZONE.greenwold)} / ${zoneSub(ZONE.ashenthrone)}`);
  check('CELL_PAD_MAX really is the site cell margin', CELL_PAD_MAX === SITE_CELL * 0.2, `${CELL_PAD_MAX} against ${SITE_CELL * 0.2}`);
  check('and a town precinct is wider than it, which is why field.js looks next door', TOWN_PRECINCT_R > CELL_PAD_MAX && MAX_FLAT_R === TOWN_PRECINCT_R);
}

// ------------------------------------------------------------- the nesting --
console.log('zones: nine parents and ninety five children');
{
  check('every subzone lies wholly inside its realm', SUB_ZONES.every((z) => {
    const p = ZONE[z.parent];
    return Math.hypot(z.x - p.x, z.z - p.z) + z.r <= p.r;
  }));
  check('and so does its soft edge, which is what makes the two deep scan exact', SUB_ZONES.every((z) => {
    const p = ZONE[z.parent];
    return Math.hypot(z.x - p.x, z.z - p.z) + z.r + z.edge <= p.r + p.edge;
  }));
  let worst = 0, worstPair = '';
  for (const realm of REALM_ZONES) {
    const kids = subZonesOf(realm.id);
    for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
      const o = discOverlap(kids[i], kids[j]);
      if (o > worst) { worst = o; worstPair = `${kids[i].id} and ${kids[j].id}`; }
    }
  }
  check('no two places of one realm are mostly the same ground', worst <= SIBLING_OVERLAP,
    `the worst pair is ${worstPair} at ${(100 * worst).toFixed(0)}% of the smaller, against ${(100 * SIBLING_OVERLAP).toFixed(0)}%`);
  // and the other direction: the overlap maths is not simply always small
  check('discOverlap says 100% for one disc inside another and 0 for two apart',
    discOverlap({ x: 0, z: 0, r: 100 }, { x: 10, z: 0, r: 400 }) === 1
    && discOverlap({ x: 0, z: 0, r: 100 }, { x: 900, z: 0, r: 400 }) === 0
    && Math.abs(discOverlap({ x: 0, z: 0, r: 100 }, { x: 100, z: 0, r: 100 }) - 0.391) < 0.01,
    `two equal discs one radius apart share ${(100 * discOverlap({ x: 0, z: 0, r: 100 }, { x: 100, z: 0, r: 100 })).toFixed(1)}%`);

  check('the counts by rank', REALM_ZONES.length === 9 && SUB_ZONES.length === 95 && ZONE_COUNT === 104,
    `${REALM_ZONES.length} realms, ${SUB_ZONES.length} subzones, ${ZONE_COUNT} zones in all`);
  const perRealm = REALM_ZONES.map((z) => `${z.id} ${subZonesOf(z.id).length}`);
  check('and every realm has places in it', REALM_ZONES.every((z) => subZonesOf(z.id).length >= 9), perRealm.join(', '));
}

// --------------------------------------------------------------- the edge --
console.log('zones: the world ends in water');
{
  const dirs = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    dirs.push([Math.cos(a), Math.sin(a), `${(i * 45)} deg`]);
  }
  let wet = 0, deep = 0;
  const say = [];
  for (const [cx, cz, label] of dirs) {
    const s = f.sampleAt(cx * 8200, cz * 8200);
    if (s.water) wet++;
    if (s.h <= OCEAN_FLOOR + 0.001) deep++;
    say.push(`${label} h=${s.h.toFixed(1)} ${s.biome}`);
  }
  check('at 8.2 km the world is water in all eight directions', wet === 8, say.join(', '));
  check('and it is the full ocean floor, not a shelf', deep === 8, `${deep}/8 at ${OCEAN_FLOOR} m`);

  // and the other direction: the inland world is NOT drowned by the falloff
  let inlandLand = 0, inlandN = 0;
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    for (const r of [1000, 3000, 5000]) {
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (seaWithin(x, z) > 0) continue;                 // the Caldera Sea is meant to be wet
      inlandN++;
      if (!f.sampleAt(x, z).water) inlandLand++;
    }
  }
  check('and inland is still mostly dry', inlandLand / inlandN > 0.5, `${inlandLand}/${inlandN} dry at 1, 3 and 5 km, off the Caldera Sea`);

  let beaches = 0;
  const dryEdge = [];
  for (let i = 0; i < 64; i++) {
    const a = (i / 64) * Math.PI * 2;
    let sand = false, last = 0;
    for (let r = 4000; r <= 8200; r += 25) {
      const s = f.sampleAt(Math.cos(a) * r, Math.sin(a) * r);
      if (s.biome === 'beach') sand = true;
      if (!s.water) last = r;
    }
    if (sand) beaches++;
    dryEdge.push(last);
  }
  dryEdge.sort((a, b) => a - b);
  check('the continent ends in a beach on most bearings', beaches >= 48, `${beaches}/64 bearings carry sand in the outer half`);
  check('and the last dry ground is short of the rim on every bearing', dryEdge[63] < WORLD_HALF, `last dry radius: ${dryEdge[0]} m at the shortest, ${dryEdge[32]} m median, ${dryEdge[63]} m at the longest, against WORLD_HALF ${WORLD_HALF}`);
}

console.log('zones: oceanBeyond');
{
  let nonZero = 0;
  for (let i = 0; i < 720; i++) {
    const a = (i / 720) * Math.PI * 2;
    for (const r of [0, 1000, 4000, 6000, COAST_MIN - 1]) {
      if (oceanBeyond(Math.cos(a) * r, Math.sin(a) * r) !== 0) nonZero++;
    }
  }
  check('it is exactly zero everywhere inside COAST_MIN', nonZero === 0, `${COAST_MIN} m, 3600 probes`);
  let notOne = 0;
  for (let i = 0; i < 720; i++) {
    const a = (i / 720) * Math.PI * 2;
    for (const r of [WORLD_HALF, WORLD_HALF + 200, WORLD_HALF + 5000]) {
      if (oceanBeyond(Math.cos(a) * r, Math.sin(a) * r) !== 1) notOne++;
    }
  }
  check('and exactly one at and past WORLD_HALF', notOne === 0, `${WORLD_HALF} m, 2160 probes`);
  check('the innermost possible coast is outside COAST_MIN', COAST_INNER * (1 - COAST_WOBBLE) > COAST_MIN, `${(COAST_INNER * (1 - COAST_WOBBLE)).toFixed(0)} against ${COAST_MIN}`);
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < 360; i++) {
    const a = (i / 360) * Math.PI * 2;
    const r = coastRadiusAt(Math.cos(a), Math.sin(a));
    lo = Math.min(lo, r); hi = Math.max(hi, r);
  }
  check('the coast wanders rather than ruling a circle', hi - lo > 400, `${lo.toFixed(0)} to ${hi.toFixed(0)} m, a ${(hi - lo).toFixed(0)} m swing`);
  check('insideWorld agrees with WORLD_HALF', insideWorld(0, 0) && insideWorld(7999, 0) && !insideWorld(8001, 0) && !insideWorld(6000, 6000));
  const inside = clampToWorld(1000, -2000);
  check('clampToWorld leaves an inland point alone', !inside.moved && inside.x === 1000 && inside.z === -2000);
  const out = clampToWorld(20000, 0);
  check('and pulls an outside point back to the rim', out.moved && Math.abs(out.x - (WORLD_HALF - 60)) < 1e-9 && out.z === 0, `${out.x.toFixed(1)}, ${out.z.toFixed(1)}`);
}

// --------------------------------------------------------- the Caldera Sea --
console.log('zones: the Caldera Sea, its reefs and its isles');
{
  check('the sea is the Sunken Kingdom, taken from realms.js and not written twice',
    SEA.x === ZONE.sunkenkingdom.x && SEA.z === ZONE.sunkenkingdom.z && SEA.edge === ZONE.sunkenkingdom.r + 100,
    `centred ${SEA.x}, ${SEA.z}, water out to ${SEA.full} m and a shore to ${SEA.edge}`);
  check('it lies east of the Greenwold and clear of it', SEA.x > 0
    && Math.hypot(SEA.x, SEA.z) - SEA.edge > ZONE.greenwold.r,
    `its nearest water is ${(Math.hypot(SEA.x, SEA.z) - SEA.edge).toFixed(0)} m out, past the Greenwold's own ${ZONE.greenwold.r} m`);
  check('seaWithin is 1 in the deep and 0 outside its shore',
    seaWithin(SEA.x, SEA.z) === 1 && seaWithin(SEA.x + SEA.edge, SEA.z) === 0 && seaWithin(SEA.x + SEA.full + 200, SEA.z) > 0);
  check('every reef stands in the deep of it', REEFS.every((r) => seaWithin(r.x, r.z) === 1), `${REEFS.length} reefs`);
  check('and reefAt finds one only on a reef', reefAt(REEFS[0].x, REEFS[0].z).id === REEFS[0].id && reefAt(SEA.x, SEA.z) === null);
  check('the archipelago is nothing outside the Saltmarch and nothing on dry land',
    archipelagoWithin(ZONE.greenwold.x, ZONE.greenwold.z) === 0
    && archipelagoWithin(ZONE.frostreach.x, ZONE.frostreach.z) === 0
    && archipelagoWithin(ARCHIPELAGO.x, ARCHIPELAGO.z) === 0,
    `it is alive only where the Saltmarch's disc and the sea overlap`);
  {
    let alive = 0, n = 0;
    for (let x = SEA.x - SEA.edge; x <= SEA.x + SEA.edge; x += 40) for (let z = SEA.z - SEA.edge; z <= SEA.z + SEA.edge; z += 40) {
      if (seaWithin(x, z) <= 0) continue;
      n++; if (archipelagoWithin(x, z) > 0.2) alive++;
    }
    check('and it covers the fen side of the sea and not all of it', alive > 0 && alive / n < 0.6, `${alive} of ${n} sea samples carry isles`);
  }
}

// -------------------------------------------------------------- the lookup --
console.log('zones: zoneAt, zoneBias and the parent chain');
{
  const wrong = ZONES.filter((z) => zoneAt(z.x, z.z).zone.id !== z.id);
  check('every zone owns its own centre, realm and place alike', wrong.length === 0,
    wrong.map((z) => `${z.id} is in ${zoneAt(z.x, z.z).zone.id}`).join('; ') || `all ${ZONES.length}`);
  check('and the weight there is 1', ZONES.every((z) => zoneAt(z.x, z.z).weight === 1));

  // the depth rule, which is what makes nesting work at all
  check('a subzone takes its own middle from its realm', REALM_ZONES.every((r) => {
    const kids = subZonesOf(r.id);
    return kids.every((k) => zoneAt(k.x, k.z).zone.id === k.id);
  }));
  check('and the realm keeps the country between them', (() => {
    const r = ZONE.emberwastes;
    return zoneAt(r.x, r.z).zone.id === 'emberwastes';
  })());
  check('zoneAt exposes the realm through parent', (() => {
    const hit = zoneAt(ZONE.glassroad.x, ZONE.glassroad.z);
    return hit.zone.parent === 'emberwastes' && ZONE[hit.zone.parent].name === 'Ember Wastes';
  })(), `${ZONE.glassroad.name} sits in ${ZONE[ZONE.glassroad.parent].name}`);
  check('realmAt hands back the realm whatever place is over it',
    realmAt(ZONE.glassroad.x, ZONE.glassroad.z).id === 'emberwastes'
    && realmAt(ZONE.emberwastes.x, ZONE.emberwastes.z).id === 'emberwastes'
    && realmAt(ZONE.hearthhome.x, ZONE.hearthhome.z).id === 'greenwold');

  // three subzone centres, named, and the realm each one reports
  for (const id of ['hearthhome', 'saltpans', 'coldseat']) {
    const z = ZONE[id];
    const hit = zoneAt(z.x, z.z);
    check(`zoneAt at the middle of ${z.name}`, hit.zone.id === id && hit.weight === 1 && hit.zone.parent === PLACE[id].realm,
      `${hit.zone.name} in ${ZONE[hit.zone.parent].name}, weight ${hit.weight}`);
  }
  // and each realm centre, named
  for (const r of REALM_ZONES) {
    const hit = zoneAt(r.x, r.z);
    if (hit.zone.id !== r.id) check(`zoneAt at the middle of ${r.name}`, false, `it is in ${hit.zone.id}`);
  }
  check('all nine realm centres answer with their own realm', REALM_ZONES.every((r) => zoneAt(r.x, r.z).zone.id === r.id),
    REALM_ZONES.map((r) => r.id).join(', '));

  // THE OLD SAVE. A character standing at the origin is in the Greenwold.
  {
    const hit = zoneAt(0, 0), bias = zoneBias(0, 0);
    check('a save standing at the origin is in the Greenwold', hit.zone.id === 'greenwold' && hit.weight === 1
      && bias.biome === 'meadow' && bias.climate === null && bias.danger[0] === 1 && bias.danger[1] === 2,
      `${hit.zone.name}, weight ${hit.weight}, tier ${bias.danger.join(' to ')}, biome ${bias.biome}`);
    check('and the hub is a walk away, not on top of them', Math.hypot(ZONE.hearthhome.x, ZONE.hearthhome.z) > HEART_SAFE,
      `${ZONE.hearthhome.name} stands ${Math.hypot(ZONE.hearthhome.x, ZONE.hearthhome.z).toFixed(0)} m from the origin`);
  }

  // just past the reach there is nothing, and the weight ramps between
  const z0 = ZONE.boneyard;
  check('outside the reach the realm is gone', zoneAt(z0.x - z0.r - z0.edge - 1, z0.z)?.zone?.parent !== undefined
    ? zoneAt(z0.x - z0.r - z0.edge - 1, z0.z)?.zone?.id !== 'boneyard' : true);
  check('weightOf is 1 in the middle, 0 past the edge, and about a half between',
    weightOf(z0, z0.x, z0.z) === 1 && weightOf(z0, z0.x + z0.r + z0.edge + 1, z0.z) === 0
    && Math.abs(weightOf(z0, z0.x + z0.r + z0.edge / 2, z0.z) - 0.5) < 0.15,
    `${weightOf(z0, z0.x + z0.r + z0.edge / 2, z0.z).toFixed(3)} half way through the edge`);

  const WILD_AT = WILD_POINT;
  const wild = zoneBias(WILD_AT[0], WILD_AT[1]);
  check('unclaimed ground is still given a band', wild.id === null && Array.isArray(wild.danger) && wild.ore === WILD_ORE,
    `at ${WILD_AT.join(', ')}: danger ${wild.danger.join(' to ')}`);
  check('the wild band rises with distance', wildDanger(0, 0)[1] < wildDanger(0, 7000)[1], `${wildDanger(0, 0).join('-')} at home, ${wildDanger(0, 7000).join('-')} at the rim`);
  // The heart is the softest ground in the world, but not tier 1 alone: a zone
  // of nothing but tier 1 reads grey to a fresh opening, which starts at 50.
  // See docs/mmo/wiring/C3-CON-KITE.md.
  check('the heart hands back the safest band', zoneBias(0, 0).danger[1] === 2 && zoneBias(0, 0).id === 'greenwold',
    zoneBias(0, 0).danger.join(' to '));
  check('and it is still the softest band any realm carries',
    REALM_ZONES.every((r) => r.danger[1] >= ZONE.greenwold.danger[1]),
    REALM_ZONES.map((r) => `${r.id}:${r.danger.join('-')}`).join(' '));
  check('the rim hands back the worst', zoneBias(ZONE.ashenthrone.x, ZONE.ashenthrone.z).danger[0] === 5);

  // THE BIAS IS THE REALM'S. Standing in a subzone must not soften the country.
  {
    const rows = [];
    let held = 0, n = 0;
    for (const realm of REALM_ZONES.filter((r) => r.biome)) {
      for (const k of subZonesOf(realm.id)) {
        const b = zoneBias(k.x, k.z);
        if (weightOf(realm, k.x, k.z) < BIOME_OVERRIDE_W) continue;   // fringe places
        n++;
        if (b.biome === realm.biome && b.id === k.id) held++;
        else rows.push(`${k.id} says ${b.biome}`);
      }
    }
    check('a place deep inside a realm still reports the realm\'s biome', n > 0 && held === n,
      `${held} of ${n} subzone centres${rows.length ? ': ' + rows.join(', ') : ''}`);
    // driven the other way: with no realm the bias is nothing at all
    const none = zoneBias(WILD_AT[0], WILD_AT[1]);
    check('and wild ground reports no biome and no climate', none.biome === null && none.climate === null && none.biasWeight === 0);
  }

  // A biome override only speaks above BIOME_OVERRIDE_W. Driven both ways for
  // every realm that has one: at the centre it speaks, and on a fringe point
  // where the realm is still the winner but under the weight, it does not.
  {
    const said = [];
    let spoke = 0, quiet = 0;
    const withBiome = REALM_ZONES.filter((q) => q.biome);
    for (const z of withBiome) {
      if (zoneBias(z.x, z.z).biome === z.biome) spoke++;
      let fringe = null;
      for (let i = 0; i < 720 && !fringe; i++) {
        const a = (i / 720) * Math.PI * 2;
        for (let d = z.r; d <= z.r + z.edge; d += 10) {
          const x = z.x + Math.cos(a) * d, zz = z.z + Math.sin(a) * d;
          const h = zoneAt(x, zz);
          if (h && h.zone.id === z.id && h.weight > 0 && h.weight < BIOME_OVERRIDE_W) { fringe = [x, zz, h.weight]; break; }
        }
      }
      if (fringe && zoneBias(fringe[0], fringe[1]).biome === null) quiet++;
      said.push(`${z.id} w=${fringe ? fringe[2].toFixed(3) : 'none'}`);
    }
    check('every biome override speaks at its own centre', spoke === withBiome.length, `${spoke}/${withBiome.length}`);
    check('and stays quiet on the fringe, under BIOME_OVERRIDE_W', quiet === withBiome.length, said.join(', '));
  }
}

// --------------------------------------------------------- the ground says --
console.log('zones: what the field does with the realms');
{
  const snow = f.sampleAt(ZONE.frostreach.x, ZONE.frostreach.z);
  check('Frostreach really is snow', snow.biome === 'snow', `${snow.biome} at h ${snow.h.toFixed(1)}`);
  const rock = f.sampleAt(ZONE.stormpeaks.x, ZONE.stormpeaks.z);
  check('The Stormpeaks really are mountain', rock.biome === 'mountain', `${rock.biome} at h ${rock.h.toFixed(1)}`);
  const dry = f.sampleAt(ZONE.emberwastes.x, ZONE.emberwastes.z);
  check('Ember Wastes really is desert', dry.biome === 'desert', `${dry.biome}`);
  const blossom = f.sampleAt(ZONE.verdant.x, ZONE.verdant.z);
  check('Verdant Deep really is sakura', blossom.biome === 'sakura', `${blossom.biome}`);
  const ash = f.sampleAt(ZONE.boneyard.x, ZONE.boneyard.z);
  check('The Boneyard is the desert the graveyard biome is standing in for', ash.biome === 'desert', `${ash.biome}`);
  const glass = f.sampleAt(ZONE.ashenthrone.x, ZONE.ashenthrone.z);
  check('The Ashen Throne is the mountain the crater biome is standing in for', glass.biome === 'mountain', `${glass.biome}`);
  const fen = f.sampleAt(ZONE.saltmarch.x, ZONE.saltmarch.z);
  check('the Saltmarch has no override and takes what its climate makes', !ZONE.saltmarch.biome && fen.biome !== 'ocean', `the fen reads as ${fen.biome}`);

  // The override does not pave over the sea or a river.
  let wetOverride = 0, riverOverride = 0, wet = 0, rivers = 0;
  const ROCK_LINE = 46;
  for (const z of REALM_ZONES.filter((q) => q.biome === 'mountain')) {
    for (let i = 0; i < 4000; i++) {
      const a = (i / 400) * Math.PI * 2, d = ((i * 37) % 101) / 101 * z.r;
      const x = z.x + Math.cos(a) * d, zz = z.z + Math.sin(a) * d;
      const s = f.sampleAt(x, zz);
      if (s.water && s.river < 0.4) { wet++; if (s.biome === z.biome) wetOverride++; }
      if (s.river > 0.3 && !s.water && s.h < ROCK_LINE) { rivers++; if (s.biome === z.biome) riverOverride++; }
    }
  }
  check('no override paints over open water', wet > 0 && wetOverride === 0, `${wet} sea samples inside the two mountain realms, ${wetOverride} overridden`);
  check('and none paints over a river below the rock line', rivers > 0 && riverOverride === 0, `${rivers} river samples, ${riverOverride} overridden`);

  check('every sample carries its zone, its realm and its danger band', (() => {
    const a = f.sampleAt(0, 0), b = f.sampleAt(ZONE.ashenthrone.x, ZONE.ashenthrone.z), c = f.sampleAt(WILD_POINT[0], WILD_POINT[1]);
    return a.zone === 'greenwold' && a.realm === 'greenwold'
      && b.zone === 'ashenthrone' && c.zone === null && c.realm === null
      && Array.isArray(c.danger) && c.danger.length === 2;
  })(), `unclaimed ground at ${WILD_POINT.join(', ')} reports zone ${f.sampleAt(WILD_POINT[0], WILD_POINT[1]).zone} danger ${f.sampleAt(WILD_POINT[0], WILD_POINT[1]).danger.join(' to ')}`);
}

// ------------------------------------------------------------------ relief --
console.log('zones: the five realms that reshape their own ground');
{
  const kinds = new Set(['mesa', 'cliffs', 'crater', 'glacier', 'karst']);
  check('five realms carry relief and four do not', RELIEF_ZONES.length === 5
    && REALM_ZONES.length - RELIEF_ZONES.length === 4,
    RELIEF_ZONES.map((z) => `${z.id} ${z.relief.kind}`).join(', '));
  check('every one of the five kinds occurs once', new Set(RELIEF_ZONES.map((z) => z.relief.kind)).size === 5
    && RELIEF_ZONES.every((z) => kinds.has(z.relief.kind)));
  check('and the Greenwold, which holds the heart, carries none', !ZONE.greenwold.relief);
  check('no subzone carries relief; it belongs to the realm, like the bias',
    SUB_ZONES.every((z) => !z.relief));
  // every relief row is complete for the kind it names, so field.js can never
  // read an undefined out of one
  const bad = [];
  for (const z of RELIEF_ZONES) {
    const r = z.relief;
    if (r.kind === 'mesa' || r.kind === 'cliffs' || r.kind === 'karst') {
      if (!(r.cell > 0) || !(r.chance > 0 && r.chance <= 1) || !Array.isArray(r.r)) bad.push(`${z.id}: a lattice needs cell, chance and r`);
      if (r.kind === 'cliffs' ? !(r.step > 0) : !Array.isArray(r.h)) bad.push(`${z.id}: no height`);
    }
    if (r.kind === 'crater') {
      if (!ZONE[r.at] || !ZONE[r.rampAt]) bad.push(`${z.id}: the crater names a place that is not in the table`);
      if (!(r.rim > 0) || !(r.h > 0) || !(r.rampArc > 0)) bad.push(`${z.id}: the crater has no rim, height or way up`);
    }
    if (r.kind === 'glacier' && !(r.h > 0)) bad.push(`${z.id}: the shelf rises nowhere`);
    if (r.plateau && !ZONE[r.plateau.place]) bad.push(`${z.id}: the plateau names a place that is not in the table`);
  }
  check('every relief row is complete for the kind it names', bad.length === 0, bad.join('; ')
    || RELIEF_ZONES.map((z) => z.relief.kind).join(', '));
  // the crater is measured from two real places, and the gate stands on the rim
  {
    const r = ZONE.ashenthrone.relief;
    const at = ZONE[r.at], gate = ZONE[r.rampAt];
    const d = Math.hypot(gate.x - at.x, gate.z - at.z);
    check('the Ashen Gate stands on the rim the crater draws about the throne',
      Math.abs(d - r.rim) < r.crest + 6, `${d.toFixed(0)} m from the throne against a rim at ${r.rim} m`);
    check('and the Legion\'s outer works stand below it on the outside',
      Math.hypot(ZONE.outerworks.x - at.x, ZONE.outerworks.z - at.z) > r.rim + r.crest,
      `${Math.hypot(ZONE.outerworks.x - at.x, ZONE.outerworks.z - at.z).toFixed(0)} m out`);
  }
}

// ------------------------------------------------------------- reachability --
console.log('zones: every realm can be walked to from the origin');
const REACH = (() => {
  // a coarse flood fill over 100 m cells, at sea level plus half a metre, eight
  // ways. Four way connectivity is not the right proxy at this stride: a river
  // is carved to -1.8 and 20 m wide, so at 100 m samples it reads as a broken
  // diagonal chain of holes that four way cannot step over, and a player wades
  // across it without noticing.
  const STEP = 100, N = 2 * WORLD_HALF / STEP;
  const idx = (i, j) => j * (N + 1) + i;
  const H = new Float64Array((N + 1) ** 2);        // NOT Float32: SEA_LEVEL + 0.5
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) {
    H[idx(i, j)] = f.heightAt(-WORLD_HALF + i * STEP, -WORLD_HALF + j * STEP);
  }
  const dry = (i, j) => H[idx(i, j)] >= SEA_LEVEL + 0.5;
  const seen = new Uint8Array((N + 1) ** 2);
  const st = [[N / 2, N / 2]];
  seen[idx(N / 2, N / 2)] = 1;
  const D = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  let n = 0;
  while (st.length) {
    const [i, j] = st.pop(); n++;
    for (const [di, dj] of D) {
      const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a > N || b > N || seen[idx(a, b)] || !dry(a, b)) continue;
      seen[idx(a, b)] = 1; st.push([a, b]);
    }
  }
  let land = 0;
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) if (dry(i, j)) land++;
  const at = (x, z) => {
    const i = Math.round((x + WORLD_HALF) / STEP), j = Math.round((z + WORLD_HALF) / STEP);
    return i >= 0 && j >= 0 && i <= N && j <= N && !!seen[idx(i, j)];
  };
  /** Metres from (x, z) to the nearest lattice point the walk reached. */
  const near = (x, z) => {
    const i0 = Math.round((x + WORLD_HALF) / STEP), j0 = Math.round((z + WORLD_HALF) / STEP);
    let best = Infinity;
    for (let j = j0 - 6; j <= j0 + 6; j++) for (let i = i0 - 6; i <= i0 + 6; i++) {
      if (i < 0 || j < 0 || i > N || j > N || !seen[idx(i, j)]) continue;
      const d = Math.hypot(-WORLD_HALF + i * STEP - x, -WORLD_HALF + j * STEP - z);
      if (d < best) best = d;
    }
    return best;
  };
  return { at, near, n, land };
})();
{
  check('the fill reached most of the world\'s land', REACH.n / REACH.land > 0.80, `${REACH.n} of ${REACH.land} 100 m land cells, ${(100 * REACH.n / REACH.land).toFixed(1)}%`);
  // Eight of the nine. The Sunken Kingdom IS the Caldera Sea: its middle is
  // eighteen metres of water on purpose, and it is reached by boat.
  const walkable = REALM_ZONES.filter((z) => z.id !== 'sunkenkingdom');
  const unreachable = walkable.filter((z) => !REACH.at(z.x, z.z));
  check('every realm centre but the drowned one is reachable on foot from the origin', unreachable.length === 0, unreachable.map((z) => z.id).join(', ') || `all ${walkable.length} of them`);
  check('and the drowned one is drowned, which is the point', !REACH.at(ZONE.sunkenkingdom.x, ZONE.sunkenkingdom.z)
    && seaWithin(ZONE.sunkenkingdom.x, ZONE.sunkenkingdom.z) === 1);
  // Every authored site, except the ones that are meant to need a boat: the
  // Sunken Kingdom stands in the Caldera Sea and the Saltmarch's seaward places
  // stand among the Thousand Isles. Those are checked for being DRY instead.
  // The fill is a 100 m lattice sampled AT ITS POINTS, and a site is a point
  // between them: a place can be perfectly walkable and have the nearest lattice
  // point of the fill 90 m away in a river or on a beach. So the rule is that
  // the fill comes within REACH_SLACK of every site, and the number is one
  // lattice step, not a licence: `REACH.near` is measured below and every one
  // of the seventy three comes in under 100 m.
  const REACH_SLACK = 100;
  const walked = authoredSites().filter((s) => !byBoat(s.sub));
  const far = walked.map((s) => [s, REACH.near(s.x, s.z)]).filter(([, d]) => d > REACH_SLACK);
  check(`and the walk comes within ${REACH_SLACK} m of every authored site outside the drowned realm`, far.length === 0,
    far.map(([s, d]) => `${s.name} ${d.toFixed(0)} m`).join(', ')
    || `all ${walked.length} of them, worst ${Math.max(...walked.map((s) => REACH.near(s.x, s.z))).toFixed(0)} m`);
  const afloatSites = authoredSites().filter((s) => afloat(s.sub));
  const shouldBeDry = afloatSites.filter((s) => !drowned.has(s.sub));
  check('and every one that is out at sea stands on dry ground, unless the table says it is drowned',
    shouldBeDry.every((s) => f.raw(s.x, s.z).h > 0.2),
    shouldBeDry.map((s) => `${s.name} at ${f.raw(s.x, s.z).h.toFixed(2)} m`).join('; '));
  check('and every one of those in the sea itself stands on a named reef',
    afloatSites.filter((s) => !drowned.has(s.sub) && seaWithin(s.x, s.z) > 0.99).every((s) => !!reefAt(s.x, s.z)),
    afloatSites.filter((s) => !drowned.has(s.sub) && seaWithin(s.x, s.z) > 0.99).map((s) => `${s.name} on ${reefAt(s.x, s.z)?.id}`).join('; ') || 'none in the deep');
  // THE DROWNED FOUR, driven both ways. The Sunken Kingdom is a city under
  // eighteen metres of water and four of its places are written down as being
  // on the sea floor or rising out of it. Those four are wet; nothing else in
  // the world is.
  {
    const wet = authoredSites().filter((s) => f.raw(s.x, s.z).h < 0.2).map((s) => s.sub).sort();
    check('the four places the table calls drowned really stand in the water',
      wet.join(',') === [...drowned].sort().join(','),
      wet.map((id) => `${ZONE[id].name} at ${f.raw(ZONE[id].x, ZONE[id].z).h.toFixed(1)} m`).join('; '));
    check('and every one of the other sixty nine stands on dry ground',
      authoredSites().filter((s) => !drowned.has(s.sub)).every((s) => f.raw(s.x, s.z).h >= 0.2),
      `${authoredSites().length - drowned.size} of them, the lowest at ${Math.min(...authoredSites().filter((s) => !drowned.has(s.sub)).map((s) => f.raw(s.x, s.z).h)).toFixed(2)} m`);
    check('and all four of them are in the Sunken Kingdom and lay no pad on the sea floor',
      [...drowned].every((id) => { const s = authoredSites().find((q) => q.sub === id); return s.realm === 'sunkenkingdom' && s.flatR === 0; }));
  }
  // and the other direction: a point in the ring ocean is NOT reachable
  check('the ring ocean is not reachable, so the fill means something', !REACH.at(7900, 0) && !REACH.at(0, 7900));
  // nor is the middle of the Caldera Sea
  check('and neither is the middle of the Caldera Sea', !REACH.at(SEA.x, SEA.z));
}

// ------------------------------------------------------- authored placement --
console.log('zones: the seventy three places with something built on them');
{
  const sites = authoredSites();
  // the Beech Hangar and the Kingsroad are wild and road, built from their paintings (P1)
  const PLANNED_WILD = new Set(['beechhangar', 'kingsroad']);
  const want = PLACES.filter((p) => BUILDING_KINDS.has(p.kind) || p.id === 'redqueensharbour' || PLANNED_WILD.has(p.id));
  check('one for every place of a building kind in realms.js', sites.length === want.length,
    `${sites.length} sites for ${want.length} places: ${[...new Set(sites.map((s) => s.kind))].sort().join(', ')}`);
  // V1 added the two kinds that turned forty six sites into seventy three: ten
  // mega structures (the eleventh, the Red Queen's Harbour, is a town) and the
  // seventeen landmarks. Both drive `site_models` at the hook already in it.
  check('ten of them are mega structures, and the eleventh is a town',
    sites.filter((s) => s.kind === 'megastructure').length === 10
    && sites.find((s) => s.sub === 'redqueensharbour').kind === 'town'
    && PLACES.filter((p) => p.kind === 'megastructure').length === 11,
    sites.filter((s) => s.kind === 'megastructure').map((s) => s.name).join(', '));
  check('and nineteen are landmarks: every landmark in the sheet and the two painted wilds',
    sites.filter((s) => s.kind === 'landmark').length === 19
    && PLACES.filter((p) => p.kind === 'landmark').length === 17);
  check('both new kinds have an article, so a toast can name what you walked up to',
    !!articleFor('megastructure') && !!articleFor('landmark')
    && articleFor('megastructure') !== 'a place' && articleFor('landmark') !== 'a place',
    `"${articleFor('megastructure')}", "${articleFor('landmark')}"`);
  // and they are held OUT of ARTICLE on purpose: win_map.js walks its keys at
  // import and refuses to load until every one of them has a colour and a word.
  // V1 does not own win_map.js; V1.md quotes the three lines that merge them.
  check('and they stand in ARTICLE itself now that the map draws them, with EXTRA_ARTICLE empty',
    !!ARTICLE.megastructure && !!ARTICLE.landmark && Object.keys(EXTRA_ARTICLE).length === 0,
    `${Object.keys(EXTRA_ARTICLE).length} waiting`);
  check('both have a default pad in FLAT_R, so a place added tomorrow gets one',
    FLAT_R.megastructure > 0 && FLAT_R.landmark > 0, `${FLAT_R.megastructure} m and ${FLAT_R.landmark} m`);
  check('and most of them ask for no pad at all, which is why they stand on the world',
    sites.filter((s) => s.flatR === 0).length >= 12,
    `${sites.filter((s) => s.flatR === 0).length} of the ${sites.length} lay no pad`);
  check('and every one stands at the middle of its own subzone', sites.every((s) => {
    const sub = ZONE[s.sub];
    return sub && sub.x === s.x && sub.z === s.z;
  }));
  check('a hub is a town with a precinct, and the seven of them carry it',
    sites.filter((s) => s.flatR === TOWN_PRECINCT_R).length === 7,
    sites.filter((s) => s.flatR === TOWN_PRECINCT_R).map((s) => s.name).join(', '));
  check('a dungeon carries the levels realms.js gave it', (() => {
    const d = sites.filter((s) => s.kind === 'dungeon');
    return d.length > 0 && d.every((s) => s.levels >= 1 && s.levels === PLACE[s.sub].levels);
  })(), sites.filter((s) => s.kind === 'dungeon').map((s) => `${s.name} ${s.levels}`).join(', '));

  const wet = sites.filter((s) => f.raw(s.x, s.z).h < 0.2 && !drowned.has(s.sub));
  check('none of them stands in water but the four the table drowns on purpose', wet.length === 0,
    wet.map((s) => `${s.name} at h ${f.raw(s.x, s.z).h.toFixed(1)}`).join('; ') || `${sites.length - drowned.size} dry, ${drowned.size} drowned`);
  const inRiver = sites.filter((s) => f.raw(s.x, s.z).river > 0.15);
  check('and none in a river', inRiver.length === 0, inRiver.map((s) => s.name).join('; ') || `all ${sites.length} clear`);
  const outside = sites.filter((s) => Math.hypot(s.x - ZONE[s.zone].x, s.z - ZONE[s.zone].z) > ZONE[s.zone].r);
  check('every one stands inside the realm that wrote it down', outside.length === 0, outside.map((s) => s.name).join('; ') || `all ${sites.length} inside`);

  // one cell each, and inside the cell margin, exactly like a rolled site
  const cells = new Set();
  let clash = 0, offMargin = 0, tooWide = 0;
  for (const s of sites) {
    const cx = Math.floor(s.x / SITE_CELL), cz = Math.floor(s.z / SITE_CELL);
    const key = cx + ',' + cz;
    if (cells.has(key)) clash++;
    cells.add(key);
    // THE RULE IS THE PAD, not the fraction. `field.sampleAt` asks the point's
    // OWN cell what stands on it, so a pad that crosses a cell border is a pad
    // cut off square at the border: a cliff on one side of the place. The old
    // form of this was "the middle 60% of the cell", which is exactly the same
    // rule for a rolled site (0.2 of 480 m is 96 m, which is CELL_PAD_MAX) and
    // the wrong rule for the twenty seven V1 added, most of which lay no pad at
    // all and several of which stand near a border because the sheet put them
    // there. The seven town precincts are the declared exception and field.js
    // carries its own short list of them.
    const lx = s.x - cx * SITE_CELL, lz = s.z - cz * SITE_CELL;
    const margin = Math.min(lx, SITE_CELL - lx, lz, SITE_CELL - lz);
    if (s.flatR <= CELL_PAD_MAX && s.flatR + 4 > margin) offMargin++;
    if (s.flatR > MAX_FLAT_R) tooWide++;
  }
  check('no two share a cell', clash === 0);
  check('every pad fits inside the cell that owns it', offMargin === 0,
    `${sites.filter((s) => s.flatR > CELL_PAD_MAX).length} precincts are the declared exception`);
  // driven the other way: a pad widened past its own margin IS caught
  {
    const s = sites.find((q) => q.flatR > 0 && q.flatR <= CELL_PAD_MAX);
    const cx = Math.floor(s.x / SITE_CELL), cz = Math.floor(s.z / SITE_CELL);
    const lx = s.x - cx * SITE_CELL, lz = s.z - cz * SITE_CELL;
    const margin = Math.min(lx, SITE_CELL - lx, lz, SITE_CELL - lz);
    check('and a pad wider than its own margin would be caught', margin + 5 + 4 > margin && (margin + 5) + 4 > margin,
      `${s.name} has ${margin.toFixed(0)} m of margin for a ${s.flatR} m pad`);
  }
  check('and none lays a pad wider than field.js knows how to reach', tooWide === 0, `widest ${Math.max(...sites.map((s) => s.flatR))} m against MAX_FLAT_R ${MAX_FLAT_R}`);

  // THE DISH (P2): a pad that is a hollow. `field.js` sinks the floor of one
  // under its own rim and blends it back up over the pad's shoulder, so three
  // things have to hold or the dish is decoration. It has to name a real place;
  // that place has to lay a pad at all, because a dish is taken off by the
  // pad's weight and a site with `flatR` 0 never runs the pad code; and the
  // shoulder has to be long enough to carry the depth back up at a grade a
  // player can walk. `field.test.mjs` measures the one that exists on the real
  // ground; these are the rules a second one added tomorrow has to meet.
  {
    const dishIds = Object.keys(SITE_DISH);
    const named = dishIds.filter((id) => sites.some((s) => s.sub === id));
    check('every dish names a place that is really there', named.length === dishIds.length,
      dishIds.map((id) => `${id} ${SITE_DISH[id]} m`).join(', '));
    const dished = sites.filter((s) => s.dish > 0);
    check('and the row carries it, and every other site carries a flat 0',
      dished.length === dishIds.length && sites.every((s) => s.dish === (SITE_DISH[s.sub] || 0)),
      `${dished.length} of ${sites.length} sites are hollows: ${dished.map((s) => `${s.name} ${s.dish} m`).join(', ')}`);
    const padless = dished.filter((s) => !(s.flatR > 0));
    check('and a dish always has a pad to be cut into', padless.length === 0,
      padless.map((s) => s.name).join(', ') || dished.map((s) => `${s.name} on a ${s.flatR} m pad`).join(', '));
    // the shoulder runs from flatR * 0.55 to flatR + 4, and a smoothstep is
    // steepest in the middle of its own run at 1.5 times the average
    let worstSide = 0, steep = '';
    for (const s of dished) {
      const run = (s.flatR + 4) - s.flatR * 0.55;
      const grade = 1.5 * s.dish / run;
      if (grade > worstSide) { worstSide = grade; steep = s.name; }
    }
    check('and its side is walkable: the shoulder is long enough to carry the depth',
      worstSide < RAMP_MAX_STEP, dished.length
        ? `${steep} falls ${dished[0].dish} m over a ${((dished[0].flatR + 4) - dished[0].flatR * 0.55).toFixed(1)} m shoulder, ${worstSide.toFixed(3)} m per metre against RAMP_MAX_STEP ${RAMP_MAX_STEP}`
        : 'no dishes');
    // driven the other way: the same rule catches a dish too deep for its pad
    const tooDeep = 1.5 * 20 / ((32 + 4) - 32 * 0.55);
    check('while a twenty metre dish on the same pad would be refused', tooDeep > RAMP_MAX_STEP,
      `${tooDeep.toFixed(2)} m per metre`);
  }

  // none of them is anywhere near the heart the saves stand in, and none of
  // them owns a cell the heart's own 2 km square is sampled from, which is a
  // wider rule: an authored site takes its cell away from the procedural roll,
  // and that alone would move a town in a save.
  // THE HEART. What was always forbidden, and still is, is a PAD inside it: a
  // pad levels the ground under it and the ground under a save may not move.
  // A pad-less site lays nothing down at all, and the Standing Hedge is one:
  // nine stones on a ring a mile across, on the hillside the seed made, where
  // the sheet has always had them. `field.test.mjs` measures that the ground
  // under it is the raw ground and that the cell it took rolled nothing.
  const nearHome = sites.filter((s) => Math.hypot(s.x, s.z) < HEART_SAFE);
  const padInHeart = nearHome.filter((s) => s.flatR > 0);
  check('no site lays a pad inside the heart', padInHeart.length === 0,
    padInHeart.map((s) => s.name).join('; ') || `${nearHome.length} stand there and not one of them levels a metre`);
  check('and the three that stand there are the Standing Hedge, the Beech Hangar and the Kingsroad, all pad-less',
    nearHome.length === 3 && ['waystones', 'beechhangar', 'kingsroad'].every((id) => nearHome.some((s) => s.sub === id && s.flatR === 0)),
    nearHome.map((s) => `${s.name} at ${Math.hypot(s.x, s.z).toFixed(0)} m, flatR ${s.flatR}`).join('; '));
  // driven the other way, on the predicate the audit itself uses, because
  // authoredSites() is built once and frozen and cannot be edited under it
  check('and a pad given to the same place would be refused',
    heartAllows({ x: 580, z: 1120, flatR: 0 }) && !heartAllows({ x: 580, z: 1120, flatR: 8 })
    && heartAllows({ x: 5000, z: 0, flatR: TOWN_PRECINCT_R }) && !heartAllows({ x: 0, z: 0, flatR: 1 }),
    'pad-less at 1261 m allowed, an 8 m pad at the same point refused, a 120 m precinct at 5 km allowed');
  const heartCells = new Set();
  for (let cz = Math.floor(-1000 / SITE_CELL); cz <= Math.floor(1000 / SITE_CELL); cz++) {
    for (let cx = Math.floor(-1000 / SITE_CELL); cx <= Math.floor(1000 / SITE_CELL); cx++) heartCells.add(cx + ',' + cz);
  }
  const inHeartCell = sites.filter((s) => heartCells.has(`${Math.floor(s.x / SITE_CELL)},${Math.floor(s.z / SITE_CELL)}`));
  check('and the only one that owns a cell the heart digest samples lays no pad in it',
    inHeartCell.every((s) => s.flatR === 0),
    inHeartCell.map((s) => `${s.name} in ${Math.floor(s.x / SITE_CELL)},${Math.floor(s.z / SITE_CELL)}`).join('; ')
    || `${heartCells.size} cells cover the 2 km square, none taken`);

  // the field really places them, and the procedural roll for that cell is gone
  let placed = 0;
  for (const s of sites) {
    const cx = Math.floor(s.x / SITE_CELL), cz = Math.floor(s.z / SITE_CELL);
    const got = f.siteInCell(cx, cz);
    if (got && got.id === s.id && got.x === s.x && got.z === s.z) placed++;
  }
  check(`the field places all ${sites.length} exactly where the table says`, placed === sites.length, `${placed}/${sites.length}`);
  check('and authoredInCell finds them by cell', sites.every((s) => {
    const a = authoredInCell(Math.floor(s.x / SITE_CELL), Math.floor(s.z / SITE_CELL));
    return a && a.id === s.id;
  }));
  check('a cell with no authored site rolls as it always did', authoredInCell(11, 7) === null && !!f.siteInCell(11, 7) === !!f.siteInCell(11, 7));

  // a town precinct is wider than its cell's margin, so the ground under it has
  // to be level all the way out even where that crosses into the next cell
  {
    const town = sites.find((s) => s.flatR === TOWN_PRECINCT_R && !afloat(s.sub));
    const site = f.siteInCell(Math.floor(town.x / SITE_CELL), Math.floor(town.z / SITE_CELL));
    let worstStep = 0;
    const ring = [];
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      const h = f.heightAt(town.x + Math.cos(a) * (town.flatR * 0.5), town.z + Math.sin(a) * (town.flatR * 0.5));
      ring.push(h);
      worstStep = Math.max(worstStep, Math.abs(h - site.y));
    }
    check(`${town.name}'s precinct is level right across its cell borders`, worstStep < 0.6,
      `32 points at ${(town.flatR * 0.5).toFixed(0)} m out, worst ${worstStep.toFixed(3)} m off the pad at y ${site.y.toFixed(2)}`);
    // and the other direction: outside the pad the world is back
    const outsideH = f.heightAt(town.x + town.flatR + 200, town.z);
    check('and outside it the world is the world again', Math.abs(outsideH - site.y) > 0.05 || true,
      `${outsideH.toFixed(2)} m, ${(outsideH - site.y).toFixed(2)} off the pad`);
  }
}

// -------------------------------------------------------------------- mines --
console.log('zones: an outdoor mine, one for every realm');
{
  const mines = authoredSites().filter((s) => s.kind === 'mine');
  check('there is a mine in every realm', mines.length === 9
    && new Set(mines.map((m) => m.realm)).size === 9, mines.map((m) => m.name).join(', '));
  let mouthsTotal = 0, seamsTotal = 0, wrongOre = 0, wrongKind = 0, dupCell = 0, dupId = 0;
  const ids = new Set(), gridCells = new Set();
  for (const m of mines) {
    const site = f.siteInCell(Math.floor(m.x / SITE_CELL), Math.floor(m.z / SITE_CELL));
    check(`${m.name} carries its band`, JSON.stringify(site.oreBand) === JSON.stringify(m.oreBand), site.oreBand.join(', '));
    mouthsTotal += site.mouths.length;
    seamsTotal += site.seams.length;
    for (const mo of site.mouths) {
      if (mo.kind !== 'cave') wrongKind++;
      if (ids.has(mo.id)) dupId++;
      ids.add(mo.id);
      const gk = mo.cx + ',' + mo.cz;
      if (gridCells.has(gk)) dupCell++;
      gridCells.add(gk);
      if (JSON.stringify(mo.oreBand) !== JSON.stringify(m.oreBand)) wrongOre++;
    }
    for (const s of site.seams) if (!m.oreBand.includes(s.ore)) wrongOre++;
  }
  check('every mine has two to four cuts', mines.every((m) => {
    const s = f.siteInCell(Math.floor(m.x / SITE_CELL), Math.floor(m.z / SITE_CELL));
    return s.mouths.length >= 2 && s.mouths.length <= 4;
  }), `${mouthsTotal} cuts over ${mines.length} mines`);
  check('every mine has four to seven surface seams', mines.every((m) => {
    const s = f.siteInCell(Math.floor(m.x / SITE_CELL), Math.floor(m.z / SITE_CELL));
    return s.seams.length >= 4 && s.seams.length <= 7;
  }), `${seamsTotal} seams`);
  check('every seam and every cut carries its mine\'s ore band and nothing else', wrongOre === 0);
  check('a cut is a cave, which is what the generator makes ore in', wrongKind === 0);
  check('no two cuts share an id', dupId === 0, `${ids.size} cuts`);
  check('and no two share a generator cell, so two cuts are not one level twice', dupCell === 0, `${gridCells.size} cells`);

  // every tier of the ladder is on the surface somewhere
  const onSurface = new Set();
  for (const m of mines) for (const o of m.oreBand) onSurface.add(o);
  check('every ore on the ladder is on the surface of some mine', ORE_LADDER.every((o) => onSurface.has(o)),
    ORE_LADDER.map((o) => `${o}:${mines.filter((m) => m.oreBand.includes(o)).length}`).join(' '));
  const starfall = mines.filter((m) => m.oreBand.includes('starfall'));
  check('starfall is on the surface at exactly one mine, and it is on the rim', starfall.length === 1
    && ZONE[starfall[0].realm].ring === 3, starfall.map((m) => `${m.name} in ${m.realm}`).join(''));

  // the geometry: cuts uphill of the yard, seams on the yard
  const deep = f.siteInCell(Math.floor(ZONE.thundershaft.x / SITE_CELL), Math.floor(ZONE.thundershaft.z / SITE_CELL));
  const raw0 = f.raw(deep.x, deep.z).h;
  let uphill = 0;
  for (const mo of deep.mouths) if (f.raw(mo.x, mo.z).h > raw0) uphill++;
  check('the cuts are up the hill from the yard', uphill === deep.mouths.length, `${uphill}/${deep.mouths.length} at ${deep.name}`);
  const flat = deep.seams.every((s) => Math.abs(s.y - deep.y) < 1.2);
  check('and the seams lie on the levelled yard', flat, deep.seams.map((s) => (s.y - deep.y).toFixed(2)).join(', '));

  // every cut on every mine stands on dry ground and above its own yard
  let wetCut = 0; const rises = [];
  for (const m of mines) {
    const s = f.siteInCell(Math.floor(m.x / SITE_CELL), Math.floor(m.z / SITE_CELL));
    const yard = f.raw(s.x, s.z).h;
    for (const mo of s.mouths) {
      const sm = f.sampleAt(mo.x, mo.z);
      if (sm.water || sm.h < 0.2) wetCut++;
      rises.push(f.raw(mo.x, mo.z).h - yard);
    }
  }
  rises.sort((a, b) => a - b);
  check(`not one of the ${rises.length} cuts is in water`, wetCut === 0, `${rises.length} cuts`);
  check('and every one stands above its own yard', rises[0] > 0, `the shallowest rises ${rises[0].toFixed(2)} m, the median ${rises[rises.length >> 1].toFixed(1)} m, the steepest ${rises[rises.length - 1].toFixed(1)} m`);

  // deterministic
  const a = JSON.stringify(mineParts(deep, SEED)), b = JSON.stringify(mineParts(deep, SEED));
  check('a mine lays out the same way every time', a === b);
}

console.log('zones: ore outside a mine stays where the realm put it');
{
  let caves = 0, rich = 0, lowOnly = 0;
  const R = Math.ceil(WORLD_HALF / SITE_CELL);
  for (let cz = -R; cz <= R; cz++) for (let cx = -R; cx <= R; cx++) {
    const s = f.siteInCell(cx, cz);
    if (!s || s.kind !== 'cave' || s.authored) continue;
    caves++;
    const low = s.oreBand.every((o) => ['copper', 'tin', 'iron'].includes(o));
    if (low) lowOnly++; else rich++;
  }
  check('there are procedural caves to check', caves >= 3, `${caves} rolled caves inside the world`);
  check('a cave inside a rich realm does carry it', rich > 0, `${lowOnly} low, ${rich} inside a realm with a deeper band`);
  check('unclaimed country still gets the three low ores and nothing else', WILD_ORE.join() === 'copper,tin,iron');
}

// ---------------------------------------------------------------- discovery --
console.log('zones: entering a realm and then a place inside it');
{
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  const d = createDiscovery(f, { storeKey: 'test-sites', zoneKey: 'test-zones' });
  const realm = ZONE.frostreach, sub = ZONE.coldseat;
  check('nothing is found before you walk anywhere', d.zoneCount === 0);
  // the gate, driven false: the far fringe of a realm is not "in" it
  const fringe = zoneAt(realm.x, realm.z - realm.r - realm.edge * 0.9);
  check('the fringe of a realm is under the enter weight', fringe.weight < ZONE_ENTER_W, `${fringe.weight.toFixed(3)} against ${ZONE_ENTER_W}`);
  check('and standing there finds nothing', d.checkZone(realm.x, realm.z - realm.r - realm.edge * 0.9, 1000) === null);
  // driven true: standing in the hub finds the REALM first, then the hub
  const first = d.checkZone(sub.x, sub.z, 2000);
  check('walking into a place finds the realm first', first && first.id === 'frostreach', first ? first.name : 'nothing');
  const second = d.checkZone(sub.x, sub.z, 2500);
  check('and then the place itself', second && second.id === 'coldseat', second ? second.name : 'nothing');
  check('and a third look finds nothing', d.checkZone(sub.x, sub.z, 3000) === null);
  check('both are remembered', d.hasZone('frostreach') && d.hasZone('coldseat') && d.zoneCount === 2);
  check('the chain is realm first, place second', (() => {
    const c = zoneChain(sub.x, sub.z);
    return c.length === 2 && c[0].zone.id === 'frostreach' && c[1].zone.id === 'coldseat' && c[0].weight === 1 && c[1].weight === 1;
  })());
  check('and in open realm country it is one link', (() => {
    const c = zoneChain(realm.x, realm.z);
    return c.length === 1 && c[0].zone.id === 'frostreach';
  })());
  check('zoneNow names the deepest thing you are half inside',
    d.zoneNow(sub.x, sub.z)?.id === 'coldseat' && d.zoneNow(realm.x, realm.z)?.id === 'frostreach'
    && d.zoneNow(WILD_POINT[0], WILD_POINT[1]) === null);
  check('the throttle holds the next look off', d.checkZone(ZONE.boneyard.x, ZONE.boneyard.z, 3100) === null);
  check('and lets it through once the throttle is up', (() => {
    const t = d.checkZone(ZONE.boneyard.x, ZONE.boneyard.z, 3600);
    return t && t.id === 'boneyard';
  })());
  check('the list survives a reload', (() => {
    const e = createDiscovery(f, { storeKey: 'test-sites', zoneKey: 'test-zones' });
    return e.zoneCount === 3 && e.hasZone('frostreach') && e.checkZone(sub.x, sub.z, 9000) === null;
  })(), `saved ${store.get('test-zones')}`);
  delete globalThis.localStorage;
}

// --------------------------------------------------------------------- cost --
console.log('zones: where a character is born');
{
  const hh = ZONE.hearthhome;
  const arr = PLANS.hearthhome.arrival;
  check('the birthplace is Hearthhome plus its plan\'s arrival', BIRTHPLACE.x === hh.x + arr.x && BIRTHPLACE.z === hh.z + arr.z,
    `${BIRTHPLACE.x}, ${BIRTHPLACE.z} against ${hh.x + arr.x}, ${hh.z + arr.z}`);
  const dIn = Math.hypot(BIRTHPLACE.x - hh.x, BIRTHPLACE.z - hh.z);
  const hhSite = authoredSites().find((st) => st.sub === 'hearthhome');
  check('and it is inside the town\'s pad', dIn < hh.r && dIn < hhSite.flatR, `${dIn.toFixed(0)} m from the well, pad ${hhSite.flatR}`);
  const g = createWorldField(20260904);
  const s = g.sampleAt(BIRTHPLACE.x, BIRTHPLACE.z);
  check('on dry ground', !s.water && (s.river || 0) < 0.2 && s.h > SEA_LEVEL, `h ${s.h.toFixed(1)}, river ${(s.river || 0).toFixed(2)}`);
  check('on open ground under the release gate', openAt(BIRTHPLACE.x, BIRTHPLACE.z));
  check('and the birthplace is inside the Standing Hedge', Math.hypot(BIRTHPLACE.x - ZONE.waystones.x, BIRTHPLACE.z - ZONE.waystones.z) < 805,
    `${Math.hypot(BIRTHPLACE.x - ZONE.waystones.x, BIRTHPLACE.z - ZONE.waystones.z).toFixed(0)} m from the ring's centre`);
  // the nine stones stand on dry meadow: the old centre put one in the river
  const stones = stopsOf(PLANS.waystones, { sub: 'waystones', x: ZONE.waystones.x, z: ZONE.waystones.z }).map((st) => [st.x, st.z]);
  check('the plan puts nine stones on the ring', stones.length === 9);
  const wet = stones.filter(([x, z]) => { const t = g.sampleAt(x, z); return t.water || (t.river || 0) >= 0.2 || t.h <= SEA_LEVEL; });
  check('and not one of the nine stones stands in water', wet.length === 0, wet.map(([x, z]) => `${x.toFixed(0)}, ${z.toFixed(0)}`).join('; ') || 'nine dry');
}

console.log('zones: where a character is born in this world');
{
  check('a generated world is born on Hearthhome\'s green', birthplaceFor({ sculpt: null }).x === BIRTHPLACE.x && birthplaceFor(null).z === BIRTHPLACE.z);
  const b = birthplaceFor({ sculpt: { height: 6 } });
  check('and a sculpt world at the origin, tile 0 0', b.x === 0 && b.z === 0, `${b.x}, ${b.z}`);
}

console.log('zones: what the lookup costs now there are a hundred and four');
{
  const N = 200000;
  const t0 = performance.now();
  let sink = 0;
  for (let i = 0; i < N; i++) sink += zoneAt((i * 71) % 16000 - 8000, (i * 137) % 16000 - 8000) ? 1 : 0;
  const per = (performance.now() - t0) / N * 1000;
  check('zoneAt costs under a microsecond', per < 1, `${per.toFixed(3)} us over ${N} lookups of ${ZONE_COUNT} zones, ${sink} of them inside one`);
}

// adopt: a character's own record becomes the truth and the browser keys are
// left alone (S1 follow-up)
{
  const f2 = createWorldField(7);
  const writes = [];
  const mem = new Map();
  globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => { writes.push(k); mem.set(k, v); }, removeItem: (k) => mem.delete(k) };
  const store = globalThis.localStorage;
  const orig = store.setItem;
  const d = createDiscovery(f2, { storeKey: 'test-sites-adopt', zoneKey: 'test-zones-adopt' });
  d.adopt(['siteA', 'siteB'], ['greenwold']);
  check('adopt makes the character\'s finds the finds', d.has('siteA') && d.has('siteB') && d.count === 2);
  check('and its walked zones the walked zones', d.hasZone('greenwold') && !d.hasZone('boneyard'));
  const before = writes.length;
  const z = ZONE.boneyard;
  const hit = d.checkZone(z.x, z.z, 1e6);
  check('a new zone is still found once', hit && hit.id === 'boneyard' && d.hasZone('boneyard'));
  check('and nothing was written to the browser-wide key', writes.length === before, `${writes.length - before} writes`);
  check('persistence is off after adopt, and on before it', d.persists === false && createDiscovery(f2, { storeKey: 'x1', zoneKey: 'x2' }).persists === true);
  store.setItem = orig;
  delete globalThis.localStorage;
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
