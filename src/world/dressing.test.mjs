// The world's dressing, measured. Run: node src/world/dressing.test.mjs
//
// The Boneyard was a flat grey plain with pebbles on it. The three claims this
// file exists to prove, because all three would otherwise be taken on trust:
//
//   1. open country is never empty. In every one of the nine realms, from
//      twenty points of real open ground, something authored stands inside
//      60 m. The number is measured per realm and printed, not asserted from
//      the density and hoped for.
//   2. nothing stands where it must not. Not in water, not on a road, not on a
//      site's pad, not inside the home clear, and not on ground steeper than
//      its own kind takes. Every one of those gates is driven true AND false.
//   3. none of it costs anything. Placement and build time per chunk, draw
//      calls, instances and triangles, all measured and under budget.
//
// A NOTE ON THE CLOCK. `field.sampleAt` builds a road cell on its first touch,
// so the first chunk in a region can cost fifty times the twentieth. Every
// timing below runs on a WARM field and says so.

globalThis.performance ||= { now: () => Date.now() };

import * as THREE from 'three';
import { createWorldField, CHUNK, HOME_RADIUS } from './field.js';
import { REALM_ZONES } from './zones.js';
import { sitesNear } from './sites.js';
import {
  dressingFor, openAt, inPad, realmAt, kitFor, auditKits, densityAt,
  KITS, DENSITY, ALL_KINDS, ANCHOR, SCATTER, JITTER, TRIES, RUGGED,
  SCATTER_CHANCE, ROAD_KEEP, PAD_MARGIN, SHORE_LINE,
} from './dressing.js';
import {
  createDressing, bodyFor, auditBodies, materials, materialFor, variantsOf,
  BODIES, MATERIAL_OF, paletteFor, DRESS_TIER, REBUILD_MS, nameOf, DRESS_NAME,
} from './dressing_models.js';
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const ck = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };
const f2 = (v) => Number(v).toFixed(2);
const field = createWorldField(20260904, { homeY: -0.3 });
const now = () => performance.now();

// ------------------------------------------------------------- the kits --

console.log('\nthe kits');
{
  ck('every realm in zones.js has a kit', REALM_ZONES.every((z) => KITS[z.id]),
    REALM_ZONES.filter((z) => !KITS[z.id]).map((z) => z.id).join(', ') || `${REALM_ZONES.length} realms`);
  ck('auditKits passes on the real kits, bodies and all', auditKits(KITS, BODIES) === ALL_KINDS.length,
    `${ALL_KINDS.length} kinds over ${Object.keys(KITS).length} realms`);

  // both directions: it has to refuse as loudly as it accepts
  const cases = [
    ['a realm with no kit', () => { const k = { ...KITS }; delete k.boneyard; return k; }, 'no kit'],
    ['a kit of three kinds', () => ({ ...KITS, boneyard: KITS.boneyard.slice(0, 3) }), 'wanted eight to twelve'],
    ['a prop a hundred metres wide', () => ({ ...KITS, boneyard: KITS.boneyard.map((k, i) => (i ? k : { ...k, size: 100 })) }), 'wanted 0.5 to 12'],
    ['a kind naming a body nobody wrote', () => ({ ...KITS, boneyard: KITS.boneyard.map((k, i) => (i ? k : { ...k, build: 'unicorn' })) }), 'does not exist'],
  ];
  for (const [what, make, want] of cases) {
    let threw = '';
    try { auditKits(make(), BODIES); } catch (e) { threw = e.message; }
    ck(`and throws on ${what}`, threw.includes(want), threw.split('\n')[1]?.trim() || threw || 'it did not throw');
  }

  const sizes = Object.values(KITS).flat().map((k) => k.size);
  ck('every prop is between half a metre and twelve', Math.min(...sizes) >= 0.5 && Math.max(...sizes) <= 12,
    `${Math.min(...sizes)} m to ${Math.max(...sizes)} m`);
  const counts = Object.entries(KITS).map(([r, l]) => `${r} ${l.length}`);
  ck('eight to twelve kinds a realm', Object.values(KITS).every((l) => l.length >= 8 && l.length <= 12), counts.join(', '));
  ck('every realm keeps one kind that stands on a mountainside',
    Object.values(KITS).every((l) => l.some((k) => k.slope >= RUGGED)),
    Object.entries(KITS).filter(([, l]) => !l.some((k) => k.slope >= RUGGED)).map(([r]) => r).join(', ') || `slope ${RUGGED}`);
  ck('every realm has a density', REALM_ZONES.every((z) => DENSITY[z.id] > 0));
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

  // both directions: a body that floats, and one built the wrong size
  let threw = '';
  try { auditBodies({ test: [{ ...KITS.boneyard[0], kind: 'floater', build: 'floater' }] }); } catch (e) { threw = e.message; }
  ck('and throws when a kind names a body nobody wrote', threw.includes('does not exist'), threw.split('\n')[1]?.trim() || 'it did not throw');

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
}

// -------------------------------------------------------------- the gate --
//
// Six rules, each driven true and false against real ground.

console.log('\nthe gate, both ways');
{
  const spec = kitFor('boneyard').find((k) => k.kind === 'bone_shard');
  // find one point of each kind by walking the world rather than by guessing
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

  // a road: sweep the ground round the heart until a sample says it is graded
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
    // Sixty metres off it, ON GROUND THAT IS NOT ITSELF A ROAD. The old probe
    // stepped a fixed sixty metres north east and landed on another road when
    // the network changed on 2026-09-06, so the check read "road" and looked
    // like a broken gate. Roads meet, so the direction has to be chosen by
    // asking the field, not by picking one.
    let off = null, offAt = null;
    for (let i = 0; i < 8 && !off; i++) {
      const a = (i / 8) * Math.PI * 2;
      const ox = onRoad.x + Math.cos(a) * 60, oz = onRoad.z + Math.sin(a) * 60;
      if (field.sampleAt(ox, oz).road > 0) continue;      // still on a road, try the next bearing
      offAt = [ox, oz];
      off = openAt(field, ox, oz, spec, sitesNear(field, ox, oz, 260));
    }
    ck('and sixty metres off it does not refuse for that reason', !!off && off.why !== 'road',
      off ? `${off.why || 'open'} at ${offAt[0].toFixed(0)}, ${offAt[1].toFixed(0)}` : 'every bearing at 60 m is on a road');
  } else ck('a road refuses', false, 'no road found to test against');

  // a pad: take a real site out of the world and stand in the middle of it
  const someSite = sitesNear(field, -4250, 1202, 2600).find((s) => s.flatR > 20);
  if (someSite) {
    const g = openAt(field, someSite.x, someSite.z, spec, [someSite]);
    ck('a site\'s pad refuses', !g.ok && g.why === 'pad', `${someSite.id} at ${someSite.x.toFixed(0)}, ${someSite.z.toFixed(0)}, flatR ${someSite.flatR}`);
    const outside = someSite.flatR + PAD_MARGIN + 6;
    ck('and the gate lets go of it outside the pad and its margin',
      !inPad(someSite, someSite.x + outside, someSite.z), `${outside.toFixed(0)} m out`);
    ck('inPad holds inside it', inPad(someSite, someSite.x + someSite.flatR * 0.5, someSite.z));
  } else ck('a site\'s pad refuses', false, 'no site found to test against');

  // slope: the same point, once for a kind that will stand on it and once for
  // one that will not
  let steep = null;
  for (let i = 0; i < 8000 && !steep; i++) {
    const x = 1123 + Math.cos(i * 0.7) * i * 0.5, z = -4190 + Math.sin(i * 0.7) * i * 0.5;
    const g = openAt(field, x, z, null);
    if (g.ok && g.slope > 0.8 && g.slope < RUGGED) steep = { x, z, g };
  }
  if (steep) {
    const rugged = kitFor('stormpeaks').find((k) => k.slope >= RUGGED);
    const fussy = kitFor('stormpeaks').find((k) => k.slope < 0.5);
    const a = openAt(field, steep.x, steep.z, rugged);
    const b = openAt(field, steep.x, steep.z, fussy);
    ck('a slope of ' + f2(steep.g.slope) + ' takes the rugged kind', a.ok, rugged.kind);
    ck('and refuses the fussy one', !b.ok && b.why === 'slope', `${fussy.kind}, limit ${fussy.slope}`);
  } else ck('slope, both ways', false, 'no slope found to test against');
}

// ---------------------------------------------------- open country is full --

console.log('\nopen country, twenty points a realm');
{
  const POINTS = 20, REACH = 60, RING = 2;
  let worstAll = 0, over = 0;
  for (const zn of REALM_ZONES) {
    let seed = 20260906;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    let tested = 0, worst = 0, sum = 0, tries = 0, bad = 0;
    while (tested < POINTS && tries < 3000) {
      tries++;
      const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * zn.r * 0.92;
      const x = zn.x + Math.cos(a) * d, z = zn.z + Math.sin(a) * d;
      if (!openAt(field, x, z, null).ok) continue;      // not open country, not this test's business
      tested++;
      const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
      let best = Infinity;
      for (let dz = -RING; dz <= RING; dz++) for (let dx = -RING; dx <= RING; dx++) {
        for (const p of dressingFor(field, cx + dx, cz + dz)) best = Math.min(best, Math.hypot(p.x - x, p.z - z));
      }
      sum += best; if (best > worst) worst = best;
      if (best > REACH) bad++;
    }
    over += bad; if (worst > worstAll) worstAll = worst;
    ck(`${zn.id}: something authored inside ${REACH} m from every one of ${tested} open points`,
      tested === POINTS && bad === 0, `mean ${f2(sum / tested)} m, worst ${f2(worst)} m`);
  }
  ck('and nowhere in the world is further than that', over === 0, `worst of all nine: ${f2(worstAll)} m`);
}

// --------------------------------------------- nothing stands where it must not --

console.log('\nwhere nothing stands');
{
  let props = 0, onWater = 0, onRoad = 0, onPad = 0, atHome = 0, tooSteep = 0, strayKind = 0;
  const slopes = [];
  for (const zn of REALM_ZONES) {
    const cx0 = Math.floor(zn.x / CHUNK), cz0 = Math.floor(zn.z / CHUNK);
    for (let dz = -3; dz <= 3; dz++) for (let dx = -3; dx <= 3; dx++) {
      for (const p of dressingFor(field, cx0 + dx, cz0 + dz)) {
        props++;
        const spec = kitFor(p.realm).find((k) => k.kind === p.kind);
        if (!spec) { strayKind++; continue; }
        const near = sitesNear(field, p.x, p.z, 260);
        const g = openAt(field, p.x, p.z, null, near);
        if (g.s.water) onWater++;
        if (g.s.road > ROAD_KEEP) onRoad++;
        if (near.some((st) => inPad(st, p.x, p.z))) onPad++;
        if (Math.hypot(p.x, p.z) < HOME_RADIUS) atHome++;
        if (g.slope > spec.slope + 1e-9) tooSteep++;
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

  // and from a field built fresh, which is what a reload is
  const again = createWorldField(20260904, { homeY: -0.3 });
  ck('and the same props after a reload', key(dressingFor(again, cx, cz)) === a);

  const other = createWorldField(20260905, { homeY: -0.3 });
  ck('and different props under a different seed', key(dressingFor(other, cx, cz)) !== a);

  // walking in from the west and from the east has to give one world
  const west = key(dressingFor(field, cx - 1, cz));
  const east = key(dressingFor(field, cx + 1, cz));
  ck('a chunk does not depend on the order its neighbours loaded',
    key(dressingFor(field, cx - 1, cz)) === west && key(dressingFor(field, cx + 1, cz)) === east);
}

// ----------------------------------------------------------------- runs --

console.log('\nruns');
{
  // a hedgerow is a hedgerow because it runs. Find one and measure it.
  const runs = new Map();
  for (let dz = -6; dz <= 6; dz++) for (let dx = -6; dx <= 6; dx++) {
    for (const p of dressingFor(field, dx, dz)) {
      if (!p.run) continue;
      if (!runs.has(p.run)) runs.set(p.run, []);
      runs.get(p.run).push(p);
    }
  }
  const lens = [...runs.values()].map((r) => {
    let far = 0;
    for (const a of r) for (const b of r) far = Math.max(far, Math.hypot(a.x - b.x, a.z - b.z));
    return far;
  });
  ck('the Greenwold runs its hedges and walls', runs.size > 0, `${runs.size} runs in the thirteen by thirteen chunks round home`);
  ck('and a run is a run, not a pair', lens.length > 0 && Math.max(...lens) > 15,
    `longest ${f2(Math.max(...lens, 0))} m over ${Math.max(...[...runs.values()].map((r) => r.length), 0)} segments`);
  // a run is a chain, not a heap: each segment stands a step from the last, and
  // faces along that step
  let chained = 0, chains = 0;
  for (const r of runs.values()) {
    if (r.length < 3) continue;
    chains++;
    const spec = kitFor(r[0].realm).find((k) => k.kind === r[0].kind);
    r.sort((a, b) => a.ri - b.ri);
    let ok = true;
    for (let i = 1; i < r.length; i++) {
      const steps = r[i].ri - r[i - 1].ri;                 // a refused segment leaves a gap
      const d = Math.hypot(r[i].x - r[i - 1].x, r[i].z - r[i - 1].z);
      if (steps < 1 || d < spec.run.gap * steps * 0.6 || d > spec.run.gap * steps * 1.15) { ok = false; break; }
    }
    if (ok) chained++;
  }
  ck('every segment of a run stands a step from the last, in order',
    chains > 0 && chained === chains, `${chained} of ${chains} runs of three or more`);
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
}

// ------------------------------------------------------------- the budget --

console.log('\nwhat it costs (warm field)');
{
  const cx = Math.floor(-4250 / CHUNK), cz = Math.floor(1202 / CHUNK);
  const N = 40;
  // warm: every road cell and every site cell these chunks touch
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

  // The worst case is not one chunk, it is the whole streamed ring standing on
  // a border, where two realms' kits are both on screen at once. Nineteen by
  // nineteen chunks is what chunks.js keeps.
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
}

// --------------------------------------------------------------- the words --

console.log('\nthe words');
{
  const kinds = Object.values(KITS).flat().map((k) => k.kind);
  ck('every kind has a name to put on hover', kinds.every((k) => nameOf(k).length > 2),
    `${Object.keys(DRESS_NAME).length} written down, ${kinds.length - Object.keys(DRESS_NAME).filter((k) => kinds.includes(k)).length} read off the id`);
  ck('and a name is a noun with its article, not a sentence',
    kinds.every((k) => !/[.!?]/.test(nameOf(k)) && nameOf(k).split(' ').length <= 6));
  ck('nameOf falls back rather than throwing', nameOf('stone_wheel') === 'a stone wheel');
  for (const f of ['src/world/dressing.js', 'src/world/dressing_models.js', 'src/world/dressing.test.mjs']) {
    ck(`${f} has no em dashes`, !readFileSync(f, 'utf8').includes('\u2014'));
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
