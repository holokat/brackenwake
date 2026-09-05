// Road furniture, driven both ways on the real world field.
// Run: node src/world/wayside.test.mjs
//
// Every number printed here was measured in this file, on
// `createWorldField(20260904)`, which is the world `world_runtime.js` builds.
// Where a bound is asserted, the same measurement is taken somewhere the bound
// does NOT hold, so passing means something.
//
// The three claims that matter most, because each of them is a place where a
// thing could exist in the code and not in the world:
//
//   the ground     every piece's own `y` is `field.sampleAt(x, z).h` to the
//                  last bit. wayside.js works the ground out from `raw` for
//                  speed, so this is the check that the fast path IS the real
//                  path and not a lookalike
//   the bridges    the roads are walked again here at a metre, independently
//                  of the three metre walk the placement uses, and every river
//                  band that carries the road under water or drops it more
//                  than BRIDGE_DROP has exactly one bridge over it. The bands
//                  that do neither are counted too, and have none
//   the deck       `deckAt` is the reason a bridge is not a picture: over the
//                  deck it answers the deck's height, a step off it answers
//                  null, and `world_runtime.heightAt` is where that gets to
//                  the player (docs/mmo/wiring/A2.md)

import { createWorldField, CHUNK } from './field.js';
import {
  roadsOverlapping, roadsAtSite, roadPointAt, roadHeightAt, roadSurface, fordFade,
  ROAD_HALF_WIDTH,
} from './roads.js';
import { SITE_CELL } from './sitegrid.js';
import { REALM_ZONES } from './zones.js';
import {
  waysideFor, waysideForRoad, waysideSweep, contextFor, probeAt, onPad,
  nearPlace, spacingAt, deckAt, styleFor, angleGap, auditWaysideStyles,
  WAYSIDE_STYLE, KIND_ORDER, LAMP_NEAR, LAMP_FAR, PLACE_NEAR, MILESTONE,
  SIGN_ARC, FINGERS, GATE_ROOM, SHRINE_IN, BRIDGE_DROP, FORD_RIVER,
  SHORE_LINE, WALK_STEP,
} from './wayside.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

const SEED = 20260904;
const f = createWorldField(SEED, { homeY: -0.3 });
const g = createWorldField(SEED, { homeY: -0.3 });
const other = createWorldField(7, { homeY: -0.3 });
const C0 = -17, C1 = 17;                 // the site cell square the world fits in

const roadsOf = (w) => {
  const out = [], seen = new Set();
  for (let cz = C0; cz < C1; cz++) for (let cx = C0; cx < C1; cx++) {
    for (const r of roadsOverlapping(w, cx * SITE_CELL, cz * SITE_CELL, (cx + 1) * SITE_CELL, (cz + 1) * SITE_CELL)) {
      if (seen.has(r.id)) continue;
      seen.add(r.id); out.push(r);
    }
  }
  out.sort((a, b) => (a.id < b.id ? -1 : 1));
  return out;
};

const roads = roadsOf(f);
const all = waysideSweep(f);
const byKind = {};
for (const r of all) byKind[r.kind] = (byKind[r.kind] || 0) + 1;
const kinds = KIND_ORDER.map((k) => `${byKind[k] || 0} ${k}`).join(', ');
console.log(`  ${roads.length} roads over ${Math.round(roads.reduce((a, r) => a + r.total, 0))} m of road; ${all.length} pieces of furniture`);
console.log(`  ${kinds}`);
check('the roads carry furniture at all', all.length > 100 && roads.length > 5, `${all.length} pieces on ${roads.length} roads`);
check('every kind the placement knows about is actually placed somewhere',
  KIND_ORDER.every((k) => (byKind[k] || 0) > 0), KIND_ORDER.filter((k) => !byKind[k]).join(',') || 'all eight');

// ---- 1. the same seed, the same furniture ---------------------------------
{
  const shape = (r) => `${r.id}|${r.kind}|${r.realm}|${r.style}|${r.x.toFixed(4)},${r.z.toFixed(4)},${r.y.toFixed(4)}|${(r.yaw || 0).toFixed(4)}`;
  const a = all.map(shape).join('\n');
  const b = waysideSweep(g).map(shape).join('\n');
  check('same seed, same furniture: same ids, same places, same styles', a.length > 0 && a === b, `${all.length} pieces compared`);
  const c = waysideSweep(other);
  check('a different seed builds a different roadside', c.map(shape).join('\n') !== a, `${c.length} pieces on the other seed`);
  const twice = waysideForRoad(f, roads[0]) === waysideForRoad(f, roads[0]);
  check('a road answers with the furniture it already worked out', twice);
  const ids = all.map((r) => r.id);
  check('no piece is emitted twice', new Set(ids).size === ids.length, `${ids.length} ids, ${ids.length - new Set(ids).size} duplicates`);
}

// ---- 2. the ground under a piece is the ground the player stands on -------
{
  let worst = 0, n = 0;
  for (const r of all) {
    if (r.kind === 'bridge' || r.kind === 'gate') continue;      // those stand on the deck
    n++;
    const d = Math.abs(r.y - f.sampleAt(r.x, r.z).h);
    if (d > worst) worst = d;
  }
  check('every piece stands on sampleAt\'s own ground, to the last bit', worst < 1e-9,
    `worst ${worst.toExponential(2)} m over ${n} pieces`);
  // and the same measurement one metre to the side is NOT zero, so the check
  // above is measuring something rather than comparing a number to itself
  let moved = 0;
  for (const r of all.slice(0, 200)) if (Math.abs(r.y - f.sampleAt(r.x + 1, r.z + 1).h) > 1e-9) moved++;
  check('and a metre away it is a different number', moved > 150, `${moved}/200 differ a metre off`);
}

// ---- 3. what a piece is never allowed to stand on -------------------------
{
  let wet = 0, inRiver = 0, onPads = 0, atHome = 0, n = 0;
  for (const r of all) {
    if (r.kind === 'bridge') continue;                          // a bridge is over the water
    n++;
    const s = f.sampleAt(r.x, r.z);
    if (s.water || s.h < SHORE_LINE) wet++;
    if (s.river > FORD_RIVER) inRiver++;
    if (s.site && Math.hypot(r.x - s.site.x, r.z - s.site.z) < s.site.flatR) onPads++;
    if (f.homeFactor(r.x, r.z) < 1) atHome++;
  }
  check('nothing stands in water', wet === 0, `${wet} of ${n}`);
  check('nothing stands in a river', inRiver === 0, String(inRiver));
  check('nothing stands on a site pad', onPads === 0, String(onPads));
  check('nothing stands on the farm\'s own disc', atHome === 0, String(atHome));
  // the gate both ways: the middle of a settlement pad is refused
  const site = roads[0].a;
  const ctx = contextFor(f, roads[0]);
  check('and the gate refuses the middle of a town when asked', !probeAt(f, ctx, site.x, site.z).ok
    && onPad(ctx, site.x, site.z), `${site.name}, pad ${site.flatR} m`);
  const open = probeAt(f, ctx, all.find((r) => r.kind === 'lamp').x, all.find((r) => r.kind === 'lamp').z);
  check('and lets a lamp\'s own ground through', open.ok, `realm ${open.realm}`);
}

// ---- 4. the lamps: where they stand, and how far apart --------------------
{
  const nearestOn = (road, x, z) => {
    let best = Infinity;
    for (const s of road.segs) {
      let u = ((x - s.x0) * s.dx + (z - s.z0) * s.dz) / s.len2;
      u = u < 0 ? 0 : u > 1 ? 1 : u;
      const d = Math.hypot(s.x0 + s.dx * u - x, s.z0 + s.dz * u - z);
      if (d < best) best = d;
    }
    return best;
  };
  const byId = new Map(roads.map((r) => [r.id, r]));
  let off = 0, onRoad = 0, lo = Infinity, hi = 0, n = 0;
  for (const r of all) {
    if (r.kind !== 'lamp') continue;
    n++;
    const d = nearestOn(byId.get(r.road), r.x, r.z);
    if (d < lo) lo = d;
    if (d > hi) hi = d;
    if (d <= ROAD_HALF_WIDTH) onRoad++;
    if (d > ROAD_HALF_WIDTH + 1.5) off++;
  }
  check(`every lamp is off the road and on the verge, within ${ROAD_HALF_WIDTH + 1.5} m of the centreline`,
    n > 100 && off === 0 && onRoad === 0, `${n} lamps, ${lo.toFixed(2)} to ${hi.toFixed(2)} m off the centreline`);
  // the other direction: the centreline itself fails the same measurement
  const one = all.find((r) => r.kind === 'lamp');
  const mid = roadPointAt(byId.get(one.road), one.t);
  check('and the centreline itself does not pass that test',
    nearestOn(byId.get(one.road), mid.x, mid.z) <= ROAD_HALF_WIDTH, `${nearestOn(byId.get(one.road), mid.x, mid.z).toFixed(3)} m`);

  // spacing, measured along one verge of every road
  let gaps = 0, near = 0, far = 0, odd = [];
  for (const road of roads) {
    const mine = waysideForRoad(f, road)
      .filter((r) => r.kind === 'lamp' && r.side === 1 && !r.id.includes('bridge'))
      .sort((a, b) => a.t - b.t);
    for (let i = 1; i < mine.length; i++) {
      const d = (mine[i].t - mine[i - 1].t) * road.total;
      const p = roadPointAt(road, mine[i - 1].t);
      const want = spacingAt(f, p.x, p.z);
      gaps++;
      // a gap is the local spacing, or a multiple of it where a lamp fell in a
      // river, on a pad or under a bridge and was refused
      const k = d / want;
      if (Math.abs(k - Math.round(k)) > 0.02 || k < 0.98) odd.push(`${road.id} ${d.toFixed(1)}m want ${want}`);
      if (Math.round(k) === 1) { if (want === LAMP_NEAR) near++; else far++; }
    }
  }
  check(`lamp spacing on a verge is ${LAMP_NEAR} m in town and ${LAMP_FAR} m out, or a multiple where one was refused`,
    gaps > 100 && odd.length === 0, `${gaps} gaps measured, ${near} at ${LAMP_NEAR} m, ${far} at ${LAMP_FAR} m${odd.length ? ', bad: ' + odd.slice(0, 3).join(' | ') : ''}`);

  // and the rule that chooses between them, driven both ways on real ground
  const lamp = all.find((r) => r.kind === 'lamp');
  check(`a road within ${PLACE_NEAR} m of a place asks for ${LAMP_NEAR} m`,
    nearPlace(f, lamp.x, lamp.z) && spacingAt(f, lamp.x, lamp.z) === LAMP_NEAR);
  let wild = null;
  for (let x = -6000; x <= 6000 && !wild; x += 320) {
    for (let z = -6000; z <= 6000; z += 320) {
      if (!nearPlace(f, x, z)) { wild = [x, z]; break; }
    }
  }
  check(`and open country with no place inside ${PLACE_NEAR} m asks for ${LAMP_FAR} m`,
    !!wild && spacingAt(f, wild[0], wild[1]) === LAMP_FAR, wild ? `at ${wild[0]}, ${wild[1]}` : 'no such ground found');
  // how much of this world's road is town lit, since that is what a player sees
  let lit = 0, dark = 0;
  for (const road of roads) {
    for (let s = 0; s <= road.total; s += 24) {
      const p = roadPointAt(road, s / road.total);
      if (nearPlace(f, p.x, p.z)) lit++; else dark++;
    }
  }
  console.log(`  road stations within ${PLACE_NEAR} m of a place: ${lit}, beyond it: ${dark}`);
}

// ---- 5. the signposts ----------------------------------------------------
{
  const signs = all.filter((r) => r.kind === 'sign');
  const touched = new Map();
  for (const r of roads) for (const s of [r.a, r.b]) touched.set(s.id, s);
  const bySite = new Map(signs.map((s) => [s.id.replace('#sign', ''), s]));
  let missing = 0, extra = 0;
  for (const [id] of touched) if (!bySite.has(id)) missing++;
  for (const [id] of bySite) if (!touched.has(id)) extra++;
  check('every settlement a road touches has exactly one signpost', missing === 0 && extra === 0 && signs.length === touched.size,
    `${touched.size} settlements on roads, ${signs.length} signs, ${missing} without one, ${extra} with no road`);
  // the other direction: a settlement with no road has no sign
  let lonely = 0, lonelySigned = 0;
  for (let cz = C0; cz < C1; cz++) for (let cx = C0; cx < C1; cx++) {
    const s = f.siteInCell(cx, cz);
    if (!s || (s.kind !== 'town' && s.kind !== 'hamlet')) continue;
    if (roadsAtSite(f, s).length) continue;
    lonely++;
    if (bySite.has(s.id)) lonelySigned++;
  }
  check('and a settlement with no road has none', lonely > 0 && lonelySigned === 0, `${lonely} settlements with no road, ${lonelySigned} signed anyway`);

  // the fingers
  const named = new Set();
  for (let cz = C0; cz < C1; cz++) for (let cx = C0; cx < C1; cx++) {
    const s = f.siteInCell(cx, cz);
    if (s && s.name) named.add(s.name);
  }
  let badCount = 0, unknown = 0, worst = 0, legs = 0, offRoad = 0, fingers = 0;
  for (const s of signs) {
    if (s.fingers.length < FINGERS[0] || s.fingers.length > FINGERS[1]) badCount++;
    for (const fg of s.fingers) {
      fingers++;
      if (!named.has(fg.name)) unknown++;
      const err = angleGap(fg.dir, fg.bearing);
      if (err > worst) worst = err;
      if (fg.leg) legs++; else offRoad++;
    }
  }
  check(`every signpost carries ${FINGERS[0]} to ${FINGERS[1]} fingers`, badCount === 0,
    `${signs.length} signs, ${fingers} fingers, ${legs} down a road, ${offRoad} across country`);
  check('every finger names a place that is really there', unknown === 0, `${unknown} of ${fingers}`);
  check('and points within 45 degrees of where that place actually is', worst <= SIGN_ARC,
    `worst ${(worst * 180 / Math.PI).toFixed(1)} degrees`);
  // both directions: turn one finger a right angle and the same test fails it
  const turned = angleGap(signs[0].fingers[0].dir + Math.PI / 2, signs[0].fingers[0].bearing);
  check('and a finger turned a right angle would fail that test', turned > SIGN_ARC,
    `${(turned * 180 / Math.PI).toFixed(1)} degrees`);
  // a fork says it is one, and the sign at a road's plain end does not
  const siteById = new Map();
  for (const r of roads) for (const st of [r.a, r.b]) siteById.set(st.id, st);
  let wrongFork = 0, wrongLegs = 0;
  for (const s of signs) {
    const site = siteById.get(s.id.replace('#sign', ''));
    const n = roadsAtSite(f, site).length;
    if (s.fork !== (n > 1)) wrongFork++;
    if (s.fingers.filter((x) => x.leg).length !== Math.min(n, FINGERS[1])) wrongLegs++;
  }
  check('a fork is a settlement with more than one road, and its sign says which it is',
    wrongFork === 0 && wrongLegs === 0,
    `${signs.filter((s) => s.fork).length} forks of ${signs.length} signs, ${wrongFork} mislabelled, ${wrongLegs} with the wrong number of road fingers`);
  // distances are rounded to a hundred metres, because a painted board is
  let unrounded = 0;
  for (const s of signs) for (const fg of s.fingers) if (fg.dist % 100 !== 0 || fg.dist < 100) unrounded++;
  check('and every distance on a board is a round hundred metres', unrounded === 0, String(unrounded));
}

// ---- 6. the shrines, one sign spot in three ------------------------------
{
  const signs = all.filter((r) => r.kind === 'sign');
  const shrines = all.filter((r) => r.kind === 'shrine');
  const signSites = new Set(signs.map((s) => s.id.replace('#sign', '')));
  let orphan = 0;
  for (const s of shrines) if (!signSites.has(s.id.replace('#shrine', ''))) orphan++;
  const share = shrines.length / Math.max(1, signs.length);
  check(`about one sign spot in ${SHRINE_IN} keeps a shrine, and every shrine stands at a sign`,
    orphan === 0 && share > 0.1 && share < 0.55, `${shrines.length} shrines at ${signs.length} signs, one in ${(1 / share).toFixed(1)}`);
}

// ---- 7. the bridges ------------------------------------------------------
//
// The roads are walked again here at a metre, which is three times finer than
// the walk the placement uses, so this is an independent measurement of where
// the water is and not a rerun of the same arithmetic.
{
  const bands = [];
  for (const road of roads) {
    const ctx = contextFor(f, road);
    const n = Math.ceil(road.total);
    let run = null;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const p = roadPointAt(road, t);
      const raw = f.raw(p.x, p.z);
      const deck = roadHeightAt(road, t);
      const surf = roadSurface(raw.h, deck, fordFade(raw.river));
      const inRiver = raw.river > FORD_RIVER && !onPad(ctx, p.x, p.z);
      if (inRiver) {
        if (!run) run = { road, t0: t, t1: t, drop: 0, bed: Infinity, wet0: null, wet1: null };
        run.t1 = t;
        run.drop = Math.max(run.drop, deck - surf);
        run.bed = Math.min(run.bed, surf);
        // the part a player would be walking through rather than over
        if (surf < f.seaLevel || deck - surf > BRIDGE_DROP) {
          if (run.wet0 === null) run.wet0 = t;
          run.wet1 = t;
        }
      } else if (run) { bands.push(run); run = null; }
    }
    if (run) bands.push(run);
  }
  const wants = bands.filter((b) => b.wet0 !== null);
  const dry = bands.filter((b) => b.wet0 === null);
  const bridges = all.filter((r) => r.kind === 'bridge');
  // a bridge covers a crossing when the whole wet part of it is on the deck.
  // Two crossings a few metres apart are carried by ONE bridge on purpose, so
  // this asks for cover and not for a bridge each.
  const coverOf = (b) => bridges.filter((br) => br.road === b.road.id
    && b.wet0 >= br.t0 - 1e-9 && b.wet1 <= br.t1 + 1e-9);
  let uncovered = 0, doubled = 0;
  for (const b of wants) {
    const hit = coverOf(b);
    if (hit.length === 0) uncovered++;
    if (hit.length > 1) doubled++;
  }
  let dryBridged = 0;
  for (const b of dry) {
    const mid = (b.t0 + b.t1) / 2;
    if (bridges.some((br) => br.road === b.road.id && mid >= br.t0 && mid <= br.t1)) dryBridged++;
  }
  check('every river crossing that carries the road under water or drops it is bridged end to end',
    wants.length > 0 && uncovered === 0, `${wants.length} crossings, ${uncovered} left as a ford`);
  check('and never two bridges over one crossing', doubled === 0, String(doubled));
  check(`and a river the road runs level through (drop under ${BRIDGE_DROP} m, no water) gets none`,
    dry.length > 0 && dryBridged === 0, `${dry.length} such wet patches, ${dryBridged} bridged`);
  let orphanBridge = 0;
  for (const br of bridges) {
    if (!wants.some((b) => b.road.id === br.road && b.wet0 >= br.t0 - 1e-9 && b.wet1 <= br.t1 + 1e-9)) orphanBridge++;
  }
  check('and every bridge is over a crossing that needed one', orphanBridge === 0,
    `${bridges.length} bridges over ${wants.length} crossings, ${bridges.length - wants.length} of them carrying two`);
  const spans = bridges.map((b) => b.span).sort((a, b) => a - b);
  console.log(`  bridge spans: ${spans.map((v) => Math.round(v)).join(', ')} m`);
  // the deck stands over the water, and the abutments on dry ground
  let low = 0, wetFoot = 0;
  for (const b of bridges) {
    if (Math.min(b.y0, b.y1) <= b.bed + 0.3) low++;
    for (const [x, z, y] of [[b.x0, b.z0, b.y0], [b.x1, b.z1, b.y1]]) {
      if (f.sampleAt(x, z).h < y - 2.2) wetFoot++;
    }
  }
  check('every deck stands clear of the bed under it', low === 0, `${low} of ${bridges.length}`);
  check('and both abutments land on ground that comes up to meet them', wetFoot === 0, `${wetFoot} of ${bridges.length * 2}`);
  // the narrowest band there is, since WALK_STEP has to fit inside it
  // The placement walks a road every WALK_STEP metres, so a crossing at least
  // that wide ALWAYS has a probe inside it and cannot be missed. A narrower
  // one is found or not depending on where the probes fall, which is why the
  // guarantee is stated over the wide ones and the narrow ones are counted and
  // reported. The narrowest crossing in this world is three metres of road
  // under water, and it happens to be bridged as well.
  const width = (b) => (b.t1 - b.t0) * b.road.total;
  const wide = wants.filter((b) => width(b) >= WALK_STEP);
  const narrow = wants.filter((b) => width(b) < WALK_STEP);
  let wideMissed = 0, narrowMissed = 0;
  for (const b of wide) if (!coverOf(b).length) wideMissed++;
  for (const b of narrow) if (!coverOf(b).length) narrowMissed++;
  const widths = wants.map(width).sort((a, b) => a - b);
  check(`every crossing at least the ${WALK_STEP} m walk wide is found and bridged`,
    wide.length > 0 && wideMissed === 0,
    `${wide.length} of them, ${widths[0].toFixed(1)} to ${widths[widths.length - 1].toFixed(0)} m of water across`);
  check('and the ones narrower than the walk, which could have been missed, were not',
    narrowMissed === 0, `${narrow.length} crossings under ${WALK_STEP} m, ${narrowMissed} unbridged`);
}

// ---- 8. the deck is ground, which is what makes a bridge real ------------
{
  const bridges = all.filter((r) => r.kind === 'bridge');
  let onDeck = 0, offDeck = 0, wrong = 0;
  for (const b of bridges) {
    for (const u of [0.2, 0.5, 0.8]) {
      const x = b.x0 + (b.x1 - b.x0) * u, z = b.z0 + (b.z1 - b.z0) * u;
      const d = deckAt(f, x, z);
      const want = b.y0 + (b.y1 - b.y0) * u;
      if (d === null) offDeck++;
      else if (Math.abs(d - want) > 0.02) wrong++;
      else onDeck++;
    }
  }
  check('deckAt answers the deck\'s own height everywhere on a bridge',
    onDeck === bridges.length * 3 && offDeck === 0 && wrong === 0,
    `${onDeck} points on ${bridges.length} bridges, ${offDeck} missed, ${wrong} at the wrong height`);
  let stillDeck = 0;
  for (const b of bridges) {
    const dx = (b.x1 - b.x0), dz = (b.z1 - b.z0);
    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len, nz = dx / len;
    // twelve metres to the side of the middle of the span, which is off it
    if (deckAt(f, b.x + nx * 12, b.z + nz * 12) !== null) stillDeck++;
  }
  check('and null a step off it', stillDeck === 0, `${stillDeck} of ${bridges.length}`);
  // what the player would be standing in without it
  let drowned = 0;
  for (const b of bridges) if (f.sampleAt(b.x, b.z).h < f.seaLevel) drowned++;
  check('and the ground it replaces is under the water sheet, which is the point',
    drowned > 0, `${drowned} of ${bridges.length} bridge middles stand over water`);
}

// ---- 9. the border gates -------------------------------------------------
{
  const gates = all.filter((r) => r.kind === 'gate');
  // walked again, at a metre
  const crossings = [];
  for (const road of roads) {
    const n = Math.ceil(road.total);
    for (const zn of REALM_ZONES) {
      const mid = zn.r + zn.edge / 2;
      let prev = null;
      for (let i = 0; i <= n; i++) {
        const p = roadPointAt(road, i / n);
        const inside = Math.hypot(p.x - zn.x, p.z - zn.z) < mid;
        if (prev !== null && inside !== prev) crossings.push({ road: road.id, realm: zn.id, name: zn.name, t: i / n });
        prev = inside;
      }
    }
  }
  let missing = 0, wrongName = 0;
  for (const c of crossings) {
    const hit = gates.find((gt) => gt.road === c.road && gt.realm === c.realm && Math.abs(gt.t - c.t) * 1000 < 40);
    if (!hit) missing++;
    else if (hit.label !== c.name) wrongName++;
  }
  check('every road that crosses the middle of a realm\'s edge band has a gate on it',
    crossings.length > 0 && missing === 0, `${crossings.length} crossings, ${gates.length} gates, ${missing} unmarked`);
  check('and the realm\'s own name is on the lintel', wrongName === 0, String(wrongName));
  const roadsWith = new Set(crossings.map((c) => c.road));
  let spurious = 0;
  for (const gt of gates) if (!roadsWith.has(gt.road)) spurious++;
  check('and a road that crosses no border carries no gate', spurious === 0,
    `${roads.length - roadsWith.size} roads cross none of the nine borders`);
  for (const gt of gates) console.log(`  gate: ${gt.label}, on the road ${gt.road}, ${gt.style}, ${gt.height} m`);

  // The Kingsroad: the longest run of joined road inside the Greenwold, which
  // is what src/mmo/events.js means by the name. Whether it crosses a border
  // is a fact about this seed, not a promise, so it is reported either way.
  const inGreen = roads.filter((r) => {
    const zn = REALM_ZONES.find((z) => z.id === 'greenwold');
    const w = (x, z) => Math.hypot(x - zn.x, z - zn.z) <= zn.r;
    return w(r.a.x, r.a.z) || w(r.b.x, r.b.z);
  });
  const chains = [];
  const used = new Set();
  for (const seed of inGreen) {
    if (used.has(seed.id)) continue;
    used.add(seed.id);
    let chain = [seed], grew = true;
    while (grew) {
      grew = false;
      for (const r of inGreen) {
        if (used.has(r.id)) continue;
        const ends = new Set(chain.flatMap((c) => [c.a.id, c.b.id]));
        if (ends.has(r.a.id) || ends.has(r.b.id)) { used.add(r.id); chain.push(r); grew = true; }
      }
    }
    chains.push(chain);
  }
  chains.sort((a, b) => b.reduce((s, r) => s + r.total, 0) - a.reduce((s, r) => s + r.total, 0));
  const king = chains[0] || [];
  const kingLen = king.reduce((s, r) => s + r.total, 0);
  const kingIds = new Set(king.map((r) => r.id));
  const kingGates = gates.filter((gt) => kingIds.has(gt.road));
  const kingCrossings = crossings.filter((c) => kingIds.has(c.road));
  check('the Kingsroad carries a gate at every realm border it crosses, and none where it crosses none',
    kingGates.length === new Set(kingCrossings.map((c) => c.road + c.realm)).size,
    `the Greenwold's longest chain is ${Math.round(kingLen)} m over ${king.length} roads, crossing ${kingCrossings.length} borders, carrying ${kingGates.length} gates`);
}

// ---- 10. milestones, benches and hitching posts ---------------------------
{
  const byId = new Map(roads.map((r) => [r.id, r]));
  const miles = all.filter((r) => r.kind === 'milestone');
  let wrongMark = 0;
  for (const m of miles) {
    const road = byId.get(m.road);
    const want = m.metres / road.total;
    if (Math.abs(m.t - want) > 1e-6 || m.metres % MILESTONE !== 0) wrongMark++;
  }
  check(`a milestone stands every ${MILESTONE} m from the road's own settlement`, miles.length > 0 && wrongMark === 0,
    `${miles.length} milestones, longest road ${Math.round(Math.max(...roads.map((r) => r.total)))} m`);
  const short = roads.filter((r) => r.total < MILESTONE);
  const shortMarked = miles.filter((m) => byId.get(m.road).total < MILESTONE);
  check('and a road shorter than that carries none', short.length > 0 && shortMarked.length === 0,
    `${short.length} roads under ${MILESTONE} m`);

  let outside = 0;
  for (const r of all) {
    if (r.kind !== 'bench' && r.kind !== 'hitch') continue;
    const road = byId.get(r.road);
    const d = Math.min(
      Math.hypot(r.x - road.a.x, r.z - road.a.z) - (road.a.flatR || 0),
      Math.hypot(r.x - road.b.x, r.z - road.b.z) - (road.b.flatR || 0));
    if (d > GATE_ROOM) outside++;
  }
  check(`every bench and hitching post stands within ${GATE_ROOM} m of a settlement's gate`, outside === 0,
    `${byKind.bench || 0} benches, ${byKind.hitch || 0} posts, ${outside} too far out`);
}

// ---- 11. nothing stands inside anything else -----------------------------
//
// Measured on what the CHUNKS build, which is what a player walks past. A road
// works its own furniture out on its own, so two roads running side by side
// can each put a lamp on the same square metre; the chunk pass is where that
// is settled, and this is the proof that it settles it.
{
  const built = [];
  const chunks = new Set();
  for (const r of all) {
    const cx = Math.floor(r.x / CHUNK), cz = Math.floor(r.z / CHUNK);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) chunks.add((cx + dx) + ',' + (cz + dz));
  }
  for (const k of chunks) {
    const [cx, cz] = k.split(',').map(Number);
    built.push(...waysideFor(f, cx, cz));
  }
  const measure = (list) => {
    let clashes = 0, pairs = 0, worst = null;
    const cell = 12, grid = new Map();
    for (const r of list) {
      const cx = Math.floor(r.x / cell), cz = Math.floor(r.z / cell);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        for (const o of grid.get((cx + dx) + ',' + (cz + dz)) || []) {
          pairs++;
          const room = Math.max(o.clear, r.clear);
          const d = Math.hypot(o.x - r.x, o.z - r.z);
          if (room > 0 && d < room) { clashes++; if (!worst || d < worst.d) worst = { d, a: o.id, b: r.id, room }; }
        }
      }
      const key = cx + ',' + cz;
      if (!grid.has(key)) grid.set(key, []);
      grid.get(key).push(r);
    }
    return { clashes, pairs, worst };
  };
  const m = measure(built);
  check('no two pieces the chunks build stand inside each other\'s room', m.clashes === 0,
    `${m.pairs} neighbouring pairs over ${built.length} pieces${m.worst ? `, worst ${m.worst.a} and ${m.worst.b} at ${m.worst.d.toFixed(2)} m` : ''}`);
  // and the other direction: the raw per road lists, before that pass, do hold
  // pairs like it, which is what the pass is for
  const raw = measure(all);
  check('and the pass has real work to do: two roads meeting do put furniture on the same ground',
    raw.clashes > 0, `${raw.clashes} such pairs before the chunk pass${raw.worst ? `, worst ${raw.worst.d.toFixed(2)} m of ${raw.worst.room}` : ''}`);
}

// ---- 12. chunks: every piece in exactly one, and the same one every time --
{
  const seen = new Map();
  const chunks = new Set();
  for (const r of all) chunks.add(Math.floor(r.x / CHUNK) + ',' + Math.floor(r.z / CHUNK));
  // and a ring of empty chunks around them, to prove nothing leaks sideways
  const around = new Set(chunks);
  for (const k of chunks) {
    const [cx, cz] = k.split(',').map(Number);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) around.add((cx + dx) + ',' + (cz + dz));
  }
  let doubled = 0, outOfChunk = 0;
  for (const k of around) {
    const [cx, cz] = k.split(',').map(Number);
    for (const r of waysideFor(f, cx, cz)) {
      if (seen.has(r.id)) doubled++;
      seen.set(r.id, k);
      if (Math.floor(r.x / CHUNK) !== cx || Math.floor(r.z / CHUNK) !== cz) outOfChunk++;
    }
  }
  check('no piece is built by two chunks', doubled === 0, `${seen.size} pieces over ${around.size} chunks`);
  check('and every piece a chunk builds stands inside that chunk', outOfChunk === 0, String(outOfChunk));
  const dropped = all.length - seen.size;
  check('and the chunk pass drops only what it has to', dropped >= 0 && dropped < all.length * 0.05,
    `${dropped} of ${all.length} dropped where two roads' furniture met`);
  // the same chunk asked on a second field of the same seed answers the same
  const w = createWorldField(SEED, { homeY: -0.3 });
  const one = [...chunks][0].split(',').map(Number);
  const a = waysideFor(f, one[0], one[1]).map((r) => r.id).join();
  const b = waysideFor(w, one[0], one[1]).map((r) => r.id).join();
  check('and a fresh field of the same seed builds the same chunk', a === b && a.length > 0, `${a.split(',').length} pieces`);
}

// ---- 13. what a chunk costs ----------------------------------------------
//
// A road's furniture is worked out once, by the first chunk that touches the
// road, and read by every chunk after it. So the number that matters is the
// worst COLD chunk, on a field that has never been asked anything, with its
// terrain meshed first because that is the order the runtime does it in.
{
  const chunks = new Set();
  for (const r of all) chunks.add(Math.floor(r.x / CHUNK) + ',' + Math.floor(r.z / CHUNK));
  const list = [...chunks];
  const cold = (cx, cz) => {
    const w = createWorldField(SEED, { homeY: -0.3 });
    for (let j = 0; j < 33; j++) for (let i = 0; i < 33; i++) w.sampleAt(cx * CHUNK + i * 2, cz * CHUNK + j * 2);
    const t0 = process.hrtime.bigint();
    waysideFor(w, cx, cz);
    return Number(process.hrtime.bigint() - t0) / 1e6;
  };
  let worst = 0, sum = 0;
  const timings = new Map();
  for (const k of list) {
    const [cx, cz] = k.split(',').map(Number);
    const ms = cold(cx, cz);
    timings.set(k, ms);
    sum += ms;
    if (ms > worst) worst = ms;
  }
  // One reading on a loaded machine is a reading of the machine, so the five
  // slowest chunks of that sweep are each measured five times again and each
  // one's median taken. The bound is on the worst of those medians.
  const slowest = list
    .map((k) => ({ k, ms: timings.get(k) }))
    .sort((a, b) => b.ms - a.ms).slice(0, 5);
  let worstMedian = 0, worstMedianAt = '';
  const lines = [];
  for (const { k } of slowest) {
    const [cx, cz] = k.split(',').map(Number);
    const runs = [];
    for (let i = 0; i < 5; i++) runs.push(cold(cx, cz));
    runs.sort((a, b) => a - b);
    lines.push(`${k} ${runs[2].toFixed(2)}`);
    if (runs[2] > worstMedian) { worstMedian = runs[2]; worstMedianAt = k; }
  }
  check('the first chunk to touch a road builds its furniture in under 2 ms', worstMedian < 2,
    `worst median ${worstMedian.toFixed(2)} ms at chunk ${worstMedianAt}; the five slowest chunks, median of five each: `
    + `${lines.join(', ')} ms; one cold pass over all ${list.length} chunks: worst ${worst.toFixed(2)}, mean ${(sum / list.length).toFixed(3)} ms`);
  const warm = createWorldField(SEED, { homeY: -0.3 });
  waysideSweep(warm);
  const t1 = process.hrtime.bigint();
  for (const k of list) { const [cx, cz] = k.split(',').map(Number); waysideFor(warm, cx, cz); }
  const each = Number(process.hrtime.bigint() - t1) / 1e6 / list.length;
  check('and every chunk after it is free', each < 0.2, `${(each * 1000).toFixed(1)} us a chunk once the road is laid out`);
}

// ---- 14. the styles ------------------------------------------------------
{
  check('every realm has a wayside style and every style is a realm', auditWaysideStyles() === REALM_ZONES.length,
    `${REALM_ZONES.length} realms`);
  check('and open country falls back to the wild kit', styleFor('nowhere') === WAYSIDE_STYLE.wild
    && styleFor('greenwold') === WAYSIDE_STYLE.greenwold);
  const used = new Set(all.map((r) => r.realm));
  console.log(`  furniture stands in: ${[...used].sort().join(', ')}`);
  let wrongStyle = 0;
  for (const r of all) {
    const st = styleFor(r.realm);
    const want = r.kind === 'bridge' ? st.bridge : r.kind === 'gate' ? st.gate : st.lamp;
    if (r.style !== want) wrongStyle++;
    if (r.glow !== st.glow) wrongStyle++;
  }
  check('every piece carries its own realm\'s style and glow', wrongStyle === 0, String(wrongStyle));
}

// ---- 15. the bodies ------------------------------------------------------
//
// The models need a canvas for the painted boards and a THREE, so they are
// imported last, behind the same shim world_runtime.test.mjs uses. Nothing
// here is a mock of the layer: it is the layer, built out of the real records.
{
  globalThis.performance ||= { now: () => Date.now() };
  const noop = () => {};
  const ctx2d = {
    fillStyle: '', strokeStyle: '', font: '', textAlign: '', textBaseline: '', globalAlpha: 1, lineWidth: 1,
    createLinearGradient: () => ({ addColorStop: noop }), createRadialGradient: () => ({ addColorStop: noop }),
    fillRect: noop, clearRect: noop, beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop, arc: noop,
    fill: noop, stroke: noop, save: noop, restore: noop, translate: noop, rotate: noop, scale: noop,
    drawImage: noop, getImageData: () => ({ data: new Uint8ClampedArray(4) }), fillText: noop, measureText: () => ({ width: 0 }),
  };
  globalThis.document ||= {
    createElement: (tag) => (tag === 'canvas'
      ? { width: 0, height: 0, style: {}, getContext: () => ctx2d }
      : { style: {}, appendChild: noop, addEventListener: noop }),
    addEventListener: noop, head: { appendChild: noop }, body: { appendChild: noop },
  };
  globalThis.window ||= { addEventListener: noop, removeEventListener: noop, devicePixelRatio: 1, innerWidth: 800, innerHeight: 600 };

  const warn = console.warn; console.warn = () => {};
  const THREE = await import('three');
  const models = await import('./wayside_models.js');
  console.warn = warn;
  const {
    buildWaysideChunk, waysideDrawCalls, createWayside, auditWaysideModels,
    BOARD, BOARD_PX, NIGHT_ON, FLICKER_GROUPS,
  } = models;

  const audit = auditWaysideModels();
  check('every style word has a body and every body is a style word',
    audit.lamps === 8 && audit.bridges >= 4 && audit.gates >= 3,
    `${audit.lamps} lamps, ${audit.bridges} bridges, ${audit.gates} gates`);

  // the busiest chunks in the world, which is where a budget is measured
  const perChunk = new Map();
  for (const r of all) {
    const k = Math.floor(r.x / CHUNK) + ',' + Math.floor(r.z / CHUNK);
    perChunk.set(k, (perChunk.get(k) || 0) + 1);
  }
  const busiest = [...perChunk].sort((a, b) => b[1] - a[1]).slice(0, 8);
  let worstDraws = 0, worstLights = 0, untagged = 0, tris = 0, kindsSeen = new Set();
  let dayLit = 0, nightLit = 0, glassMeshes = 0;
  for (const [k] of busiest) {
    const [cx, cz] = k.split(',').map(Number);
    const recs = waysideFor(f, cx, cz);
    const built = buildWaysideChunk(recs, { centre: [cx * CHUNK + CHUNK / 2, cz * CHUNK + CHUNK / 2] });
    let lights = 0;
    built.traverse((o) => {
      if (o.isPointLight) lights++;
      if (o.isMesh) {
        if (!o.userData.wayside || !o.userData.wayside.kind) untagged++;
        else kindsSeen.add(o.userData.wayside.kind);
        const pos = o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count;
        tris += pos / 3;
      }
    });
    worstDraws = Math.max(worstDraws, waysideDrawCalls(built));
    worstLights = Math.max(worstLights, lights);
    // day, then night, on the real hook
    built.userData.setNight(0, 0.016);
    built.traverse((o) => {
      if (o.name === 'wayside:glass') { glassMeshes++; if (o.visible || o.material.emissiveIntensity > 0) dayLit++; }
      if (o.isPointLight && (o.visible || o.intensity > 0)) dayLit++;
      if (o.name === 'wayside:glow' && (o.visible || o.material.opacity > 0)) dayLit++;
    });
    built.userData.setNight(1, 0.016);
    built.traverse((o) => {
      if (o.name === 'wayside:glass' && o.visible && o.material.emissiveIntensity > 0) nightLit++;
      if (o.isPointLight && o.visible && o.intensity > 0) nightLit++;
      if (o.name === 'wayside:glow' && o.visible && o.material.opacity > 0) nightLit++;
    });
    built.userData.dispose();
  }
  check('a chunk of road furniture costs at most one real light', worstLights <= 1, `${worstLights} on the busiest chunk`);
  check('and a couple of dozen draw calls', worstDraws <= 26, `${worstDraws} on the busiest chunk of ${busiest[0][1]} pieces`);
  check('every mesh says what kind of thing it is and which realm built it', untagged === 0,
    `kinds seen: ${[...kindsSeen].sort().join(', ')}, ${Math.round(tris)} triangles over ${busiest.length} chunks`);
  check('nothing is lit in full day', dayLit === 0, `${glassMeshes} panes of glass, all dark`);
  check('and the glass, the halo and the one light all come up at night', nightLit > 0, `${nightLit} lit at midnight`);

  // the flicker moves, and moves per group, so a chunk does not beat as one
  {
    const [cx, cz] = busiest[0][0].split(',').map(Number);
    const built = buildWaysideChunk(waysideFor(f, cx, cz), { centre: [cx * CHUNK + 32, cz * CHUNK + 32] });
    built.userData.setNight(1, 0.4);
    const a = [];
    built.traverse((o) => { if (o.name === 'wayside:glass') a.push(o.material.emissiveIntensity); });
    built.userData.setNight(1, 0.4);
    const b = [];
    built.traverse((o) => { if (o.name === 'wayside:glass') b.push(o.material.emissiveIntensity); });
    check('a flame is never steady', a.length > 0 && a.some((v, i) => Math.abs(v - b[i]) > 1e-6),
      `${a.length} groups, at most ${FLICKER_GROUPS}`);
    check('and the groups do not beat together', a.length < 2 || new Set(a.map((v) => v.toFixed(6))).size > 1,
      a.map((v) => v.toFixed(3)).join(' '));
    built.userData.dispose();
  }

  // the layer, streamed the way the runtime streams it
  {
    const scene = new THREE.Scene();
    const layer = createWayside(scene, f);
    const [cx, cz] = busiest[0][0].split(',').map(Number);
    layer.onChunk(cx, cz, 33);
    const after = layer.stats.pieces;
    layer.update(0.016, 1);
    check('the layer builds a chunk when the terrain does', after > 0 && layer.stats.chunks === 1,
      `${after} pieces, ${layer.stats.drawCalls} draw calls, ${layer.stats.lights} light`);
    layer.onChunk(cx, cz, 9);           // the same chunk at a lower tier
    check('and takes it away again when the chunk drops below the tier',
      layer.stats.chunks === 0 && layer.stats.pieces === 0 && layer.group.children.length === 0);
    layer.onChunk(cx, cz, 33);
    layer.offChunk(cx, cz);
    check('and when the chunk goes away altogether', layer.stats.chunks === 0 && layer.group.children.length === 0);
    layer.onChunk(cx, cz, 33);
    layer.dispose();
    check('and disposing the layer takes the group out of the scene',
      scene.children.length === 0 && layer.stats.chunks === 0);
  }

  // The boards actually hang the way the fingers say. This is measured on the
  // built geometry, in world coordinates, because a finger that names the
  // right place and points at the wrong horizon is a sign that lies, and
  // nothing in the placement could catch it.
  {
    let posts = 0, wrong = 0, worst = 0, boards = 0;
    for (const rec of all.filter((r) => r.kind === 'sign').slice(0, 12)) {
      const built = buildWaysideChunk([rec], { centre: [rec.x, rec.z] });
      const seen = [];
      built.traverse((o) => {
        if (o.name !== 'wayside:board') return;
        o.geometry.computeBoundingSphere();
        const c = o.geometry.boundingSphere.center;
        seen.push(Math.atan2(c.x - rec.x, c.z - rec.z));
      });
      boards += seen.length;
      if (seen.length !== rec.fingers.length) wrong++;
      for (const fg of rec.fingers) {
        let best = Math.PI;
        for (const b of seen) best = Math.min(best, angleGap(b, fg.bearing));
        if (best > worst) worst = best;
        if (best > 0.02) wrong++;
      }
      posts++;
      built.userData.dispose();
    }
    check('every finger board hangs at the bearing of the place it names', wrong === 0,
      `${boards} boards on ${posts} posts, worst ${(worst * 180 / Math.PI).toFixed(2)} degrees out`);
  }

  // every body, measured: the eight lamps of the nine realms and one of each
  // other kind. Two of the nine realms have no road in this world at all, so
  // their lamps are built here from a real record with the realm swapped,
  // which is exactly the record another seed would hand the same builder.
  {
    const bbox = (recs) => {
      const built = buildWaysideChunk(recs, { centre: [recs[0].x, recs[0].z] });
      const b = new THREE.Box3();
      built.traverse((o) => { if (o.isMesh) b.expandByObject(o); });
      const size = new THREE.Vector3(); b.getSize(size);
      built.userData.dispose();
      return { size, bad: [b.min, b.max].some((v) => !Number.isFinite(v.x + v.y + v.z)) };
    };
    const lamp = all.find((r) => r.kind === 'lamp');
    const rows = [];
    let bad = [], nan = 0;
    for (const realm of Object.keys(WAYSIDE_STYLE)) {
      const st = styleFor(realm);
      const m = bbox([{ ...lamp, realm, style: st.lamp, glow: st.glow }]);
      if (m.bad) nan++;
      rows.push(`${st.lamp} ${m.size.y.toFixed(1)} m`);
      if (m.size.y < 1.8 || m.size.y > 5.2 || m.size.x > 3 || m.size.z > 3) bad.push(`${realm} lamp ${m.size.x.toFixed(1)} x ${m.size.y.toFixed(1)} x ${m.size.z.toFixed(1)}`);
    }
    check('every realm\'s lamp is a post between 1.8 and 5.2 m tall and no wider than 3',
      bad.length === 0 && nan === 0, [...new Set(rows)].join(', '));

    const one = (kind) => all.find((r) => r.kind === kind);
    const sizes = {};
    for (const kind of KIND_ORDER) {
      const rec = one(kind);
      if (!rec) continue;
      const m = bbox([rec]);
      if (m.bad) nan++;
      sizes[kind] = m.size;
    }
    const gate = one('gate'), bridge = one('bridge');
    const bridgeLen = Math.hypot(bridge.x1 - bridge.x0, bridge.z1 - bridge.z0);
    check(`a border gate stands ${gate.height} m tall and spans the road`,
      Math.abs(sizes.gate.y - gate.height) < 1.2 && sizes.gate.x + sizes.gate.z > gate.half * 2,
      `${sizes.gate.x.toFixed(1)} x ${sizes.gate.y.toFixed(1)} x ${sizes.gate.z.toFixed(1)} m`);
    check('a bridge is as long as the water it crosses and as wide as the road',
      Math.max(sizes.bridge.x, sizes.bridge.z) >= bridgeLen - 1
      && Math.min(sizes.bridge.x, sizes.bridge.z) >= bridge.width - 1,
      `${bridgeLen.toFixed(0)} m of span, body ${sizes.bridge.x.toFixed(1)} x ${sizes.bridge.y.toFixed(1)} x ${sizes.bridge.z.toFixed(1)} m`);
    check('a signpost is a post a head taller than a man, a bench and a hitching post are furniture',
      sizes.sign.y > 2.6 && sizes.sign.y < 4 && sizes.bench.y < 1.2 && sizes.hitch.y < 1.6
      && sizes.milestone.y > 0.8 && sizes.shrine.y > 1.4 && nan === 0,
      KIND_ORDER.filter((k) => sizes[k]).map((k) => `${k} ${sizes[k].y.toFixed(1)} m`).join(', '));
  }

  // legibility: a capital on a board, at six metres, on a 1080 line screen
  {
    const capPx = 62;                                   // the font boardTexture paints with
    const mPerPx = BOARD.w / BOARD_PX[0];
    const capM = capPx * mPerPx;
    // a 60 degree camera at 6 m sees 2 * 6 * tan(30) = 6.93 m across the frame
    const frameM = 2 * 6 * Math.tan(Math.PI / 6);
    const onScreen = capM / frameM * 1080;
    check('a place name on a board is legible at six metres', onScreen >= 20,
      `${capM.toFixed(3)} m of letter, ${onScreen.toFixed(0)} screen pixels tall at 6 m on 1080 lines`);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
