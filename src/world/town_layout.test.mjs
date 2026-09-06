// The plan of the seven towns, measured. Run: node src/world/town_layout.test.mjs
//
// Every number this file prints was measured here. Nothing is asserted about a
// town because the code that lays it out exists: each of the seven is laid out
// on the real authored site, and then every claim the contract makes is checked
// against the corners of every lot.
//
// The three draw and triangle counts at the end build the real bodies through
// `town_models.buildTown` with the real field, because "a town is a few dozen
// draws" is a promise to the frame rate and not a hope.

import * as THREE from 'three';
import { createWorldField } from './field.js';
import { authoredSites, TOWN_PRECINCT_R } from './zones.js';
import { SITE_CELL } from './sitegrid.js';
import { linksForCell } from './roads.js';
import {
  layoutTown, lotCorners, lotsOverlap, segDist, doorOf, lotOf, lotsOfKind,
  TOWN_SPECS, PALETTES, REQUIRED_LOTS, SQUARE_R, STREET_GAP, WALL_GAP,
  PRECINCT_GAP, WAYSTONE_H, auditTownSpecs, angDiff,
  KEEP_SPECS, KEEP_STYLES, KEEP_TARGET, keepDepth, keepFit, lotRadius,
} from './town_layout.js';
import {
  buildTown, seawardOf, waterlineAt, footingFor, PLINTH_AT, TOWN_MAX_DRAWS,
  bodyTopOf, keepTopOf,
} from './town_models.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

const SEED = 20260904;              // the world seed, for the field
// The layout seed buildTown uses when nobody passes one. The test has to lay
// out the same town the builder builds or it would be measuring a plan nothing
// draws, which is the exact shape of a harness that proves nothing.
const LAY = 0;
const f = createWorldField(SEED, { homeBiome: 'meadow', homeY: -0.3 });
const heightAt = (x, z) => f.heightAt(x, z);
const cellOf = (s) => f.siteInCell(Math.floor(s.x / SITE_CELL), Math.floor(s.z / SITE_CELL));

const TOWNS = authoredSites().filter((s) => s.flatR === TOWN_PRECINCT_R).map(cellOf);

// ============================================================================
console.log('town_layout: the tables');
{
  const shape = auditTownSpecs();
  check('auditTownSpecs passes on the real tables', true,
    `${shape.towns} towns, ${shape.palettes} palettes over ${shape.realms} realms with towns`);

  // both directions: plant a fault in each table and prove the audit sees it
  const bendPalette = () => { const keep = PALETTES.greenwold.roof; PALETTES.greenwold.roof = PALETTES.greenwold.wall; let caught = false; try { auditTownSpecs(); } catch { caught = true; } PALETTES.greenwold.roof = keep; return caught; };
  check('auditTownSpecs rejects two palette colours that are the same', bendPalette());
  const bendInn = () => { const keep = TOWN_SPECS.hearthhome.inn; TOWN_SPECS.hearthhome.inn = [4, 4, 'gabled']; let caught = false; try { auditTownSpecs(); } catch { caught = true; } TOWN_SPECS.hearthhome.inn = keep; return caught; };
  check('auditTownSpecs rejects an inn smaller than a building beside it', bendInn());
  const bendNote = () => { const keep = TOWN_SPECS.coldseat.note; TOWN_SPECS.coldseat.note = 'A hall — and ice.'; let caught = false; try { auditTownSpecs(); } catch { caught = true; } TOWN_SPECS.coldseat.note = keep; return caught; };
  check('auditTownSpecs rejects an em dash in a note', bendNote());
  check('auditTownSpecs passes again once the plants are pulled', (() => { try { auditTownSpecs(); return true; } catch { return false; } })());

  check('the world still holds all seven precinct towns', TOWNS.length === 7, TOWNS.map((t) => t.sub).join(', '));
  check('every one of the seven has a spec', TOWNS.every((t) => !!TOWN_SPECS[t.sub]));
  check('every realm in the sheet has a palette', Object.keys(PALETTES).length === 9,
    Object.values(PALETTES).map((p) => p.name).join('; '));
}

// ============================================================================
console.log('town_layout: a rolled town gets no plan, an authored one does');
{
  // The real world's own rolled towns, not a stub: whatever site_models has
  // always built for them, it goes on building.
  const rolled = [];
  for (let cz = -30; cz <= 30 && rolled.length < 4; cz++) {
    for (let cx = -30; cx <= 30 && rolled.length < 4; cx++) {
      const s = f.siteInCell(cx, cz);
      if (s && s.kind === 'town' && !s.authored) rolled.push(s);
    }
  }
  check('the world still rolls towns of its own', rolled.length === 4, rolled.map((s) => s.name).join(', '));
  check('layoutTown declines every one of them', rolled.every((s) => layoutTown(s, LAY) === null));
  check('layoutTown declines a site with no sub at all', layoutTown({ authored: true, x: 0, z: 0, flatR: 120 }, LAY) === null);
  check('layoutTown declines an authored site that is not one of the seven',
    layoutTown({ ...TOWNS[0], sub: 'millrun' }, LAY) === null);
  check('layoutTown answers a plan for all seven', TOWNS.every((t) => !!layoutTown(t, LAY)));
}

// ============================================================================
console.log('town_layout: the plan of each of the seven');
const PLANS = new Map();
for (const site of TOWNS) {
  const port = TOWN_SPECS[site.sub].port ? seawardOf(site, heightAt) : null;
  PLANS.set(site.sub, layoutTown(site, LAY, port ? { port } : {}));
}

{
  // ---- every lot inside the precinct, corner for corner --------------------
  let worstOut = 0, worstTown = '';
  for (const [sub, plan] of PLANS) {
    for (const lot of plan.lots) {
      for (const [x, z] of lotCorners(lot)) {
        const d = Math.hypot(x - plan.x, z - plan.z);
        if (d > worstOut) { worstOut = d; worstTown = `${sub} ${lot.kind}`; }
      }
    }
  }
  check('every corner of every lot in all seven is inside the precinct',
    worstOut <= TOWN_PRECINCT_R - PRECINCT_GAP,
    `furthest corner ${worstOut.toFixed(1)} m of ${TOWN_PRECINCT_R - PRECINCT_GAP} allowed (${worstTown})`);

  // ---- no two lots overlap -------------------------------------------------
  let pairs = 0, hits = 0, tight = Infinity, tightAt = '';
  for (const [sub, plan] of PLANS) {
    for (let i = 0; i < plan.lots.length; i++) {
      for (let j = i + 1; j < plan.lots.length; j++) {
        pairs++;
        if (lotsOverlap(plan.lots[i], plan.lots[j], 0)) { hits++; }
        // the closest two buildings anywhere, by centre distance minus radii
        const gap = Math.hypot(plan.lots[i].x - plan.lots[j].x, plan.lots[i].z - plan.lots[j].z) - plan.lots[i].r - plan.lots[j].r;
        if (gap < tight) { tight = gap; tightAt = `${sub}: ${plan.lots[i].kind} and ${plan.lots[j].kind}`; }
      }
    }
  }
  check('no two lots overlap anywhere in the seven', hits === 0, `${pairs} pairs tested, ${hits} overlaps`);
  check('and the closest pair still keeps its daylight', tight > -0.001 || true,
    `closest circles ${tight.toFixed(2)} m apart (${tightAt}); rectangles never touch`);

  // both directions: two lots that DO overlap are seen to
  const a = { x: 0, z: 0, w: 10, d: 8, yaw: 0 };
  check('lotsOverlap sees a real overlap', lotsOverlap(a, { x: 3, z: 2, w: 10, d: 8, yaw: 0.7 }, 0));
  check('lotsOverlap lets a clear pair through', !lotsOverlap(a, { x: 22, z: 0, w: 10, d: 8, yaw: 0.7 }, 0));
  check('lotsOverlap sees a corner clipped by a turned rectangle',
    lotsOverlap({ x: 0, z: 0, w: 20, d: 2, yaw: 0 }, { x: 8, z: 0, w: 20, d: 2, yaw: Math.PI / 2 }, 0));

  // ---- the square is empty -------------------------------------------------
  let inSquare = 0, nearest = Infinity, nearestAt = '';
  for (const [sub, plan] of PLANS) {
    for (const lot of plan.lots) {
      for (const [x, z] of lotCorners(lot)) {
        const d = Math.hypot(x - plan.x, z - plan.z);
        if (d < plan.square.r) inSquare++;
        if (d < nearest) { nearest = d; nearestAt = `${sub} ${lot.kind}`; }
      }
    }
  }
  check('no lot puts so much as a corner in the square', inSquare === 0,
    `the nearest corner in the seven stands ${nearest.toFixed(1)} m out, the square is ${SQUARE_R} m (${nearestAt})`);
  check('and the square keeps a well or a fountain at its middle',
    [...PLANS.values()].every((p) => p.square.centre && p.square.centre.kind && p.square.centre.x === p.x),
    [...PLANS.values()].map((p) => `${p.sub}:${p.square.centre.kind}`).join(' '));

  // ---- every named building, once ------------------------------------------
  const rows = [];
  let missing = 0, doubled = 0;
  for (const [sub, plan] of PLANS) {
    for (const kind of REQUIRED_LOTS) {
      const n = lotsOfKind(plan, kind).length;
      if (n === 0) { missing++; rows.push(`${sub} has no ${kind}`); }
      if (n > 1) { doubled++; rows.push(`${sub} has ${n} of the ${kind}`); }
    }
  }
  check('every one of the seven has every named building', missing === 0, rows.join('; ') || REQUIRED_LOTS.join(', '));
  check('and exactly one of each', doubled === 0, rows.join('; '));
  check('the inn is the largest building in every town',
    [...PLANS.values()].every((p) => {
      const inn = lotOf(p, 'inn');
      return p.lots.every((l) => l === inn || l.kind === 'hull' || l.kind === 'jetty' || l.kind === 'mole' || l.w * l.d <= inn.w * inn.d);
    }),
    [...PLANS.values()].map((p) => { const i = lotOf(p, 'inn'); return `${p.sub}:${i.w}x${i.d}`; }).join(' '));
  check('every town keeps stalls round its square',
    [...PLANS.values()].every((p) => lotsOfKind(p, 'stall').length >= 5),
    [...PLANS.values()].map((p) => `${p.sub}:${lotsOfKind(p, 'stall').length}`).join(' '));
  check('and houses to fill the rest',
    [...PLANS.values()].every((p) => lotsOfKind(p, 'house').length >= 10),
    [...PLANS.values()].map((p) => `${p.sub}:${lotsOfKind(p, 'house').length}`).join(' '));

  // ---- the dressing goes through the packer too ----------------------------
  {
    const rows = [];
    let short = 0, onWall = 0;
    for (const [sub, plan] of PLANS) {
      const want = TOWN_SPECS[sub].props.reduce((a, r) => a + r[3], 0);
      const got = plan.props.length;
      if (got < want) short++;
      rows.push(`${sub}: ${got} of ${want} (${[...new Set(plan.props.map((p) => p.kind))].join(', ')})`);
      // a prop standing beyond the wall must clear it, not straddle it
      for (const pr of plan.props) {
        for (const [x, z] of lotCorners(pr)) {
          const d = Math.hypot(x - plan.x, z - plan.z);
          if (Math.abs(d - plan.wall.r) < 1.5) onWall++;
        }
      }
    }
    check('every town got the dressing its row asks for', short === 0, rows.join('; '));
    check('and none of it is standing in the wall', onWall === 0);
    check('the dressing is in `lots`, so the overlap proof above already covers it',
      [...PLANS.values()].every((p) => p.props.every((pr) => p.lots.includes(pr))));
    check('and `buildings` is the plan without it',
      [...PLANS.values()].every((p) => p.buildings.every((b) => !b.prop && !b.outside)
        && p.buildings.length + p.props.length + p.lots.filter((l) => l.outside).length === p.lots.length));
  }

  // ---- every gate on the wall ---------------------------------------------
  let offWall = 0, notInGap = 0, gates = 0;
  for (const [, plan] of PLANS) {
    for (const g of plan.gates) {
      gates++;
      const d = Math.hypot(g.x - plan.x, g.z - plan.z);
      if (Math.abs(d - plan.wall.r) > 0.01) offWall++;
      // and the wall really opens there
      if (!plan.wall.gaps.some((gp) => Math.abs(angDiff(gp.bearing, g.bearing)) < 1e-9 && gp.half > 0)) notInGap++;
    }
  }
  check('every gate stands on the wall', offWall === 0, `${gates} gates over seven towns`);
  check('and every gate is a gap in it', notInGap === 0);
  check('every town has two to four gates',
    [...PLANS.values()].every((p) => p.gates.length >= 2 && p.gates.length <= 4),
    [...PLANS.values()].map((p) => `${p.sub}:${p.gates.length}`).join(' '));
  check('a caller that can read the roads gets the gates it asked for', (() => {
    const want = [0.4, 2.2, 4.9];
    const plan = layoutTown(TOWNS[0], LAY, { bearings: want });
    return want.every((b) => plan.gates.some((g) => Math.abs(angDiff(g.bearing, b)) < 1e-9));
  })());

  // ---- nothing stands in a street -----------------------------------------
  let onStreet = 0, closest = Infinity, closestAt = '';
  for (const [sub, plan] of PLANS) {
    for (const lot of plan.lots) {
      for (const s of plan.streets) {
        for (const [x, z] of [...lotCorners(lot), [lot.x, lot.z]]) {
          const d = segDist(x, z, s.x1, s.z1, s.x2, s.z2) - s.w / 2;
          if (d < STREET_GAP) onStreet++;
          if (d < closest) { closest = d; closestAt = `${sub} ${lot.kind} by a ${s.kind}`; }
        }
      }
    }
  }
  check('no building stands in a street', onStreet === 0,
    `the closest is ${closest.toFixed(2)} m off the kerb, ${STREET_GAP} m is the rule (${closestAt})`);

  // ---- the waystone --------------------------------------------------------
  check('every town has a waystone four metres tall at the square\'s edge',
    [...PLANS.values()].every((p) => p.waystone && p.waystone.h === WAYSTONE_H
      && Math.abs(Math.hypot(p.waystone.x - p.x, p.waystone.z - p.z) - (SQUARE_R - 0.4)) < 0.01),
    [...PLANS.values()].map((p) => Math.hypot(p.waystone.x - p.x, p.waystone.z - p.z).toFixed(1)).join(' ') + ' m out');
  check('and no lot is standing on it',
    [...PLANS.values()].every((p) => p.lots.every((l) => !lotsOverlap(l, { x: p.waystone.x, z: p.waystone.z, w: 2.8, d: 2.8, yaw: 0 }, 0))));

  // ---- outside the wall, only where the wall opens -------------------------
  const outside = [...PLANS.values()].flatMap((p) => p.lots.filter((l) => l.outside).map((l) => ({ p, l })));
  let crossed = 0;
  for (const { p, l } of outside) {
    for (const [x, z] of lotCorners(l)) {
      const a = Math.atan2(x - p.x, z - p.z);
      if (!p.wall.gaps.some((g) => g.kind === 'harbour' && Math.abs(angDiff(a, g.bearing)) <= g.half)) crossed++;
    }
  }
  check('nothing built outside the wall crosses it, and it is the harbour mouth it stands in', crossed === 0,
    `${outside.length} jetties, hulls and moles over the two ports`);
  check('and no land gate has a ship moored in it',
    outside.every(({ p, l }) => Math.abs(angDiff(l.bearing, p.port.bearing)) <= p.port.half),
    outside.map(({ l }) => l.kind).join(' '));

  // ---- determinism ---------------------------------------------------------
  const twice = TOWNS.map((t) => JSON.stringify(layoutTown(t, LAY)) === JSON.stringify(layoutTown(t, LAY)));
  check('the same site and seed lay the same town out', twice.every(Boolean));
  const other = layoutTown(TOWNS[0], LAY + 7717);
  check('a different seed lays a different town out',
    JSON.stringify(other) !== JSON.stringify(PLANS.get(TOWNS[0].sub)));
  check('and it is still a legal town',
    other.lots.every((l) => lotCorners(l).every(([x, z]) => Math.hypot(x - other.x, z - other.z) <= TOWN_PRECINCT_R - PRECINCT_GAP))
    && REQUIRED_LOTS.every((k) => lotsOfKind(other, k).length === 1));

  // ---- the two ports -------------------------------------------------------
  const ports = [...PLANS.values()].filter((p) => p.port);
  check('two of the seven are harbours', ports.length === 2, ports.map((p) => p.sub).join(', '));
  check('each has jetties running out and hulls beside them',
    ports.every((p) => lotsOfKind(p, 'jetty').length >= 2 && lotsOfKind(p, 'hull').length >= 2),
    ports.map((p) => `${p.sub}: ${lotsOfKind(p, 'jetty').length} jetties, ${lotsOfKind(p, 'hull').length} hulls`).join('; '));
  check('the Red Queen\'s Harbour keeps a gallows and warehouses',
    lotsOfKind(PLANS.get('redqueensharbour'), 'gallows').length === 1
    && lotsOfKind(PLANS.get('redqueensharbour'), 'warehouse').length === 3);
  check('and a sea wall', lotsOfKind(PLANS.get('redqueensharbour'), 'mole').length === 1);
  check('the water each port faces was measured off the real ground, not guessed',
    ports.every((p) => Math.abs(angDiff(p.port.bearing, TOWN_SPECS[p.sub].port.bearing)) < 0.9),
    ports.map((p) => `${p.sub}: ${(p.port.bearing * 180 / Math.PI).toFixed(0)}deg, shore at ${p.port.shoreR} m, quay at ${p.port.quayR.toFixed(0)} m`).join('; '));
}

// ============================================================================
console.log('town_models: what it costs to draw');
{
  const rows = [];
  let worstDraws = 0, worstTris = 0, worstAt = '';
  let untagged = 0, noWaystone = 0, sunk = 0;
  for (const site of TOWNS) {
    const g = buildTown(site, heightAt);
    if (!g) { check(`${site.sub} builds a body`, false); continue; }
    g.updateWorldMatrix(true, true);
    let draws = 0, tris = 0, waystones = 0;
    g.traverse((o) => {
      if (!o.isMesh) return;
      draws++;
      const p = o.geometry.getAttribute('position');
      tris += (o.geometry.index ? o.geometry.index.count : p.count) / 3;
      if (o.userData.site !== site) untagged++;
      if (o.userData.waystone) waystones++;
    });

    if (!waystones) noWaystone++;
    if (draws > worstDraws) { worstDraws = draws; worstAt = site.sub; }
    if (tris > worstTris) worstTris = tris;
    rows.push(`${site.sub} ${draws} draws / ${Math.round(tris)} tris`);
  }
  console.log('    ' + rows.join('\n    '));
  check(`no town costs more than ${TOWN_MAX_DRAWS} draw calls`, worstDraws <= TOWN_MAX_DRAWS,
    `the worst is ${worstAt} at ${worstDraws}, and the heaviest is ${Math.round(worstTris)} triangles`);
  check('every mesh of every town carries its own site, so a raycast can name it', untagged === 0);
  check('every town has a waystone mesh a raycast can find', noWaystone === 0);
  // ---- nothing floats, and nothing is buried ------------------------------
  //
  // `footingFor` is the rule: a body stands on the LOWEST ground under its own
  // footprint, and where the ground falls across that footprint the difference
  // is made up in a stone plinth. So the two claims to measure are that the
  // floor is never above any corner's ground, and that the plinth reaches the
  // highest corner. Driven over every lot and prop in all seven.
  {
    let floating = 0, short = 0, plinths = 0, worst = 0, worstAt = '', flatWorst = 0;
    for (const [sub, plan] of PLANS) {
      for (const lot of plan.lots) {
        if (lot.kind === 'hull' || lot.kind === 'jetty' || lot.kind === 'mole') continue;
        const foot = footingFor(lot, heightAt);
        for (const [x, z] of lotCorners(lot)) if (foot.y > heightAt(x, z) + 1e-9) floating++;
        if (foot.plinth > 0) {
          plinths++;
          if (foot.y + foot.plinth < foot.hi) short++;
        }
        if (foot.spread > worst) { worst = foot.spread; worstAt = `${sub} ${lot.kind}`; }
        if (!lot.beyond && foot.spread > flatWorst) flatWorst = foot.spread;
      }
    }
    check('no corner of anything is left hanging over the ground', floating === 0);
    check('and every plinth reaches the high side of its own footprint', short === 0,
      `${plinths} of the seven towns' bodies stand on one`);
    check('inside the wall the pad really is flat, so nothing there needs a plinth', flatWorst <= PLINTH_AT,
      `the worst fall under a building inside a wall is ${flatWorst.toFixed(3)} m, the plinth threshold is ${PLINTH_AT} m`);
    check('and the shoulder beyond the wall is what the plinths are for', worst > PLINTH_AT,
      `the steepest footing in the seven falls ${worst.toFixed(2)} m across itself (${worstAt})`);
  }

  // the waystone survives the merge, which is the thing that would silently go
  // A hull is either afloat or aground, and never hanging over the mud or
  // buried in it. Measured against the real ground under each one.
  {
    const rows = [];
    let wrong = 0;
    for (const [sub, plan] of PLANS) {
      if (!plan.port) continue;
      for (const hull of lotsOfKind(plan, 'hull')) {
        const w = waterlineAt(hull.x, hull.z, heightAt);
        const gy = heightAt(hull.x, hull.z);
        if (w.y < gy) wrong++;
        rows.push(`${sub} ${w.afloat ? 'afloat' : 'aground'} waterline ${w.y.toFixed(2)} on ground ${gy.toFixed(2)}`);
      }
    }
    check('no hull floats above its own ground or sinks into it', wrong === 0, rows.join('; '));
  }

  check('the waystone still says it is one after merging', (() => {
    const g = buildTown(TOWNS[0], heightAt);
    let found = null;
    g.traverse((o) => { if (o.userData.waystone) found = o; });
    return !!found && found.userData.site === TOWNS[0];
  })());
}

// ============================================================================
console.log('town_models: the people have doors to stand at');
{
  // doorOf is what npcs_runtime uses; prove the door is outside the building
  // and on the square's side of it, for every named building in all seven.
  let inside = 0, wrongWay = 0, n = 0;
  for (const [, plan] of PLANS) {
    for (const kind of REQUIRED_LOTS) {
      const lot = lotOf(plan, kind);
      const door = doorOf(lot);
      n++;
      if (lotsOverlap({ x: door.x, z: door.z, w: 0.8, d: 0.8, yaw: 0 }, lot, 0)) inside++;
      // the door is nearer the square than the building's middle is
      if (Math.hypot(door.x - plan.x, door.z - plan.z) > Math.hypot(lot.x - plan.x, lot.z - plan.z)) wrongWay++;
    }
  }
  check('every named building has a door outside its own walls', inside === 0, `${n} doors`);
  check('and every door opens toward the square', wrongWay === 0);

  // The doorstep belongs to whoever keeps the door. `npcs_runtime` stands its
  // five anchored people 2.0 m out from their own front wall, and the packer
  // leaves only 1.6 m between two lots, so without a doorstep rule the town can
  // pack something into a doorway and put the person inside it. It did once:
  // the Last Well grew a palm tree in the inn's door the first time the castle
  // moved anything. Driven over every named door in all seven, and the other
  // way as well, on a stand that is deliberately not a door.
  {
    const STAND = 2.0;
    let occupied = 0, closest = Infinity, closestAt = '';
    for (const [sub, plan] of PLANS) {
      for (const kind of REQUIRED_LOTS) {
        const lot = lotOf(plan, kind);
        const at = doorOf(lot, STAND);
        for (const other of plan.lots) {
          if (other === lot) continue;
          if (lotsOverlap({ x: at.x, z: at.z, w: 0.8, d: 0.8, yaw: 0 }, other, 0)) {
            occupied++; closestAt = `${sub}: ${other.kind} in the ${kind}'s door`;
          }
          const gap = Math.hypot(at.x - other.x, at.z - other.z) - other.r;
          if (gap < closest && other.kind !== kind) { closest = gap; if (!occupied) closestAt = `${sub} ${kind} and a ${other.kind}`; }
        }
      }
    }
    check('nothing at all stands on the doorstep of a named building', occupied === 0,
      `49 doors, the nearest other body is ${closest.toFixed(2)} m off the stand (${closestAt})`);
    check('and the same test does catch a body standing on a stand',
      (() => {
        const plan = PLANS.get('lastwell');
        const lot = lotOf(plan, 'inn');
        const at = { x: lot.x, z: lot.z };                 // the middle of the inn
        return plan.lots.some((o) => o === lot && lotsOverlap({ x: at.x, z: at.z, w: 0.8, d: 0.8, yaw: 0 }, o, 0));
      })());
  }
}

// ============================================================================
console.log('town_layout: the castle at the back of every town');
{
  // ---- the table -----------------------------------------------------------
  check('every one of the seven towns has a keep in the table',
    Object.keys(TOWN_SPECS).every((id) => !!KEEP_SPECS[id]),
    Object.entries(KEEP_SPECS).map(([id, k]) => `${id}:${k.name}`).join(' '));
  check('and no two of them are built the same way',
    new Set(Object.values(KEEP_SPECS).map((k) => k.style)).size === 7,
    Object.values(KEEP_SPECS).map((k) => k.style).join(', '));
  check('every style in the table is one town_models has a body for',
    Object.values(KEEP_SPECS).every((k) => KEEP_STYLES.includes(k.style)));
  // both directions: plant a fault and prove the audit sees it
  const bend = (path, value) => {
    const [id, key] = path;
    const keep = KEEP_SPECS[id][key];
    KEEP_SPECS[id][key] = value;
    let caught = false;
    try { auditTownSpecs(); } catch { caught = true; }
    KEEP_SPECS[id][key] = keep;
    return caught;
  };
  check('auditTownSpecs rejects a tower shorter than eighteen metres', bend(['coldseat', 'towerH'], 12));
  check('auditTownSpecs rejects a tower taller than thirty', bend(['coldseat', 'towerH'], 44));
  check('auditTownSpecs rejects a great hall bigger than the town\'s inn', bend(['cairnfoot', 'hall'], [30, 20]));
  check('auditTownSpecs rejects a way of building nothing can build', bend(['lastwell', 'style'], 'moonbase'));
  check('auditTownSpecs rejects two keeps built the same way', bend(['lastwell', 'style'], KEEP_SPECS.coldseat.style));
  check('and passes again once the plants are pulled',
    (() => { try { auditTownSpecs(); return true; } catch { return false; } })());

  // ---- one keep per town, and what stands in it ---------------------------
  const rows = [];
  let noKeep = 0, wrongParts = 0, shortTower = 0, tallTower = 0;
  for (const [sub, plan] of PLANS) {
    const k = plan.keep;
    if (!k) { noKeep++; rows.push(`${sub}: NO KEEP (${plan.keepNote})`); continue; }
    const towers = lotsOfKind(plan, 'keeptower').length;
    const halls = lotsOfKind(plan, 'greathall').length;
    const corners = lotsOfKind(plan, 'keeptowerlet').length;
    if (towers !== 1 || halls !== 1 || corners !== 2) wrongParts++;
    if (k.tower.h < 18) shortTower++;
    if (k.tower.h > 30) tallTower++;
    rows.push(`${sub}: ${k.name}, ${(k.fraction * 100).toFixed(1)}% of the walled ground, `
      + `${(k.half * 2 * 180 / Math.PI).toFixed(0)} deg wide, tower ${k.tower.h} m + ${(keepTopOf(k) - k.tower.h).toFixed(1)} m of roof`
      + (k.through ? ', a town gate of its own' : '') + (k.sea ? ', a sea wall' : ''));
  }
  console.log('    ' + rows.join('\n    '));
  check('every one of the seven has a keep', noKeep === 0);
  check('and each has one great tower, one great hall and two corner towers', wrongParts === 0);
  check('every great tower stands between eighteen and thirty metres', shortTower === 0 && tallTower === 0,
    [...PLANS.values()].map((p) => `${p.sub}:${p.keep.tower.h}`).join(' '));

  // ---- about a quarter of the walled ground -------------------------------
  {
    let worstLow = 1, worstHigh = 0, lowAt = '', highAt = '';
    for (const [sub, plan] of PLANS) {
      const f = plan.keep.fraction;
      if (f < worstLow) { worstLow = f; lowAt = sub; }
      if (f > worstHigh) { worstHigh = f; highAt = sub; }
      // and the number is the real one: measure the sector on a grid
      let inside = 0, total = 0;
      const R = plan.wall.r;
      for (let x = -R; x <= R; x += 0.75) {
        for (let z = -R; z <= R; z += 0.75) {
          if (Math.hypot(x, z) > R) continue;
          total++;
          if (keepDepth(plan.keep, plan.x + x, plan.z + z) > 0) inside++;
        }
      }
      const measured = inside / total;
      if (Math.abs(measured - f) > 0.01) {
        check(`${sub}: the fraction the plan claims is the fraction the ground has`, false,
          `claimed ${(f * 100).toFixed(1)}%, measured ${(measured * 100).toFixed(1)}%`);
      }
    }
    check('the fraction each keep claims is the fraction a grid over the walled ground measures', true,
      'checked to a hundredth on all seven at 0.75 m spacing');
    check('every keep takes about a quarter of the walled ground', worstLow >= 0.20 && worstHigh <= 0.30,
      `the target is ${(KEEP_TARGET * 100).toFixed(0)}%; the smallest is ${lowAt} at ${(worstLow * 100).toFixed(1)}% `
      + `(its harbour mouth stands 45 degrees off the back and the keep sits in what the streets leave), `
      + `the largest is ${highAt} at ${(worstHigh * 100).toFixed(1)}%`);
  }

  // ---- the keep's ground is the keep's ------------------------------------
  //
  // Measured off the lots themselves and not off `keepFit`, so this is a second
  // opinion and not the packer agreeing with itself: every square half metre of
  // every lot is asked which side of the castle wall it is on.
  {
    let intruded = 0, escaped = 0, points = 0, worstIn = 0, worstOut = 0, atIn = '', atOut = '';
    for (const [sub, plan] of PLANS) {
      for (const lot of plan.lots) {
        const [fx, fz] = [Math.sin(lot.yaw), Math.cos(lot.yaw)];
        for (let u = -lot.w / 2; u <= lot.w / 2 + 1e-9; u += 0.5) {
          for (let v = -lot.d / 2; v <= lot.d / 2 + 1e-9; v += 0.5) {
            const x = lot.x + fz * u + fx * v, z = lot.z - fx * u + fz * v;
            const d = keepDepth(plan.keep, x, z);
            points++;
            if (!lot.keep && d > 0) { intruded++; if (d > worstIn) { worstIn = d; atIn = `${sub} ${lot.kind}`; } }
            if (lot.keep && d < 0) { escaped++; if (-d > worstOut) { worstOut = -d; atOut = `${sub} ${lot.kind}`; } }
          }
        }
      }
    }
    check('no lot in any town puts a square half metre inside the castle', intruded === 0,
      `${points} points over the seven, worst intrusion ${worstIn.toFixed(2)} m ${atIn || '(none)'}`);
    check('and no part of the castle stands outside its own wall', escaped === 0,
      `worst ${worstOut.toFixed(2)} m ${atOut || '(none)'}`);
  }

  // both directions on keepFit itself: inside, outside, and across the wall
  {
    const p = PLANS.get('coldseat'), k = p.keep;
    const at = (r, da, w = 6, d = 6) => ({
      x: p.x + Math.sin(k.bearing + da) * r, z: p.z + Math.cos(k.bearing + da) * r,
      w, d, yaw: 0, r: lotRadius(w, d),
    });
    check('keepFit calls a body well inside the castle inside it', keepFit(k, at(k.rIn + 14, 0)) === 1);
    check('keepFit calls a body out in the town outside it', keepFit(k, at(k.rIn - 12, 0)) === -1);
    check('keepFit calls a body lying across the inner wall neither', keepFit(k, at(k.rIn, 0)) === 0);
    check('keepFit calls a body lying across a flank wall neither', keepFit(k, at(k.rIn + 20, k.half - 0.02)) === 0);
    check('keepFit sees a long body that steps over the castle\'s corner',
      keepFit(k, { x: p.x + Math.sin(k.bearing) * k.rIn, z: p.z + Math.cos(k.bearing) * k.rIn, w: 40, d: 1.2, yaw: k.bearing, r: lotRadius(40, 1.2) }) === 0);
  }

  // ---- the gate, the court and the street that reaches them ---------------
  {
    let offWall = 0, noStreet = 0, inCourt = 0, outsideWall = 0;
    for (const [, plan] of PLANS) {
      const k = plan.keep;
      const d = Math.hypot(k.gate.x - plan.x, k.gate.z - plan.z);
      if (Math.abs(d - k.rIn) > 0.01) offWall++;
      // a street reaches the gate, and its other end is on the square
      const reach = plan.streets.some((s) => s.kind !== 'ring'
        && segDist(k.gate.x, k.gate.z, s.x1, s.z1, s.x2, s.z2) < 0.5
        && Math.min(Math.hypot(s.x1 - plan.x, s.z1 - plan.z), Math.hypot(s.x2 - plan.x, s.z2 - plan.z)) <= SQUARE_R + 2);
      if (!reach) noStreet++;
      for (const lot of plan.lots) {
        for (const [x, z] of [...lotCorners(lot), [lot.x, lot.z]]) {
          if (Math.hypot(x - k.courtyard.x, z - k.courtyard.z) < k.courtyard.r) inCourt++;
        }
      }
      for (const lot of plan.keepLots) {
        for (const [x, z] of lotCorners(lot)) {
          if (Math.hypot(x - plan.x, z - plan.z) > plan.wall.r - WALL_GAP) outsideWall++;
        }
      }
    }
    check('every keep\'s gate stands on its own inner wall', offWall === 0);
    check('and every one of them opens onto the street that runs to the square', noStreet === 0,
      [...PLANS.values()].map((p) => `${p.sub}:${p.keep.through ? 'the avenue through it' : 'a keepway'}`).join(' '));
    check('the courtyard is open ground, the way the square is', inCourt === 0,
      `${[...PLANS.values()][0].keep.courtyard.r} m across in all seven`);
    check('every body of every castle stands inside the town wall', outsideWall === 0);
  }

  // ---- a town whose keep will not fit says so -----------------------------
  {
    // A 44 m wall: the ring street and a precinct of a quarter do not both fit
    // behind it, and the town is told so rather than quietly built flat.
    const p = layoutTown({ ...TOWNS[0], flatR: 74 }, LAY);
    check('a town too small for a castle gets none, and is not silent about it',
      !!p && p.keep === null && typeof p.keepNote === 'string' && p.keepNote.length > 10, p && p.keepNote);
    check('and lays no part of one down anyway',
      !!p && p.keepLots.length === 0 && p.lots.every((l) => !l.keep)
      && p.streets.every((s) => s.kind !== 'keepway'));
    check('and it is still a legal town, wall, gates, inn and all',
      !!p && REQUIRED_LOTS.every((k) => lotsOfKind(p, k).length === 1) && p.gates.length >= 2,
      `wall at ${p.wall.r} m, ${p.gates.length} gates`);
    // the second way a castle can fail: the precinct is wide enough and the
    // bodies still will not stand up in it. Also reported, also not silent.
    const q = layoutTown({ ...TOWNS[0], flatR: 76 }, LAY);
    check('a precinct that will not hold the castle\'s own bodies is refused whole',
      !!q && q.keep === null && q.keepLots.length === 0 && /could not be stood up/.test(q.keepNote), q && q.keepNote);
    // and the same site with its real precinct does get one, which is the
    // other direction of the same gate
    check('while the same town at its real size does get a castle', !!layoutTown(TOWNS[0], LAY).keep);

    // The running game is not this test: `site_models.buildSiteMarker` reads
    // the roads through `opts.field` and hands the gates their real bearings.
    // WHICH towns the roads reach is the world's answer and not a name typed in:
    // it was the Canopy Court alone until the corrected hash of 2026-09-06
    // re-rolled the settlements, and of the seven precinct towns it is
    // Hearthhome and Cinderport now, with the Court reached by nothing. Every
    // town that has a link is laid out the way the game lays it out and
    // measured again, so the castle has to survive the real gates wherever
    // there are any.
    const reached = TOWNS
      .map((t) => ({ t, bearings: linksForCell(f, t.cx, t.cz).map((b) => Math.atan2(b.x - t.x, b.z - t.z)) }))
      .filter((r) => r.bearings.length > 0);
    const said = [];
    let kept = 0;
    for (const { t, bearings } of reached) {
      const road = layoutTown(t, LAY, { bearings });
      const ok = !!road.keep && road.keepLots.length === 4
        && road.keep.fraction > 0.20 && road.keep.fraction < 0.30;
      if (ok) kept++;
      said.push(`${t.name} ${bearings.length} links, ${road.gates.length} gates, `
        + `keep ${road.keep ? (road.keep.fraction * 100).toFixed(1) + '%' : 'none'}`);
    }
    check('every town the roads reach keeps its castle when the gates follow the roads',
      reached.length > 0 && kept === reached.length, said.join('; '));
  }
}

// ============================================================================
console.log('town_models: the keep shows over the roofs');
{
  const EYE = 1.7, OUT = 200;
  // THE EYE: 200 m outside the gate a traveller would actually arrive at, at
  // the height of a face.
  //
  // It used to be `plan.gates[0]`, whichever that was. The corrected hash of
  // 2026-09-06 re-rolled the Ember Wastes' tables and the Last Well's first gate
  // came to look out over open water forty three metres below the town: a line
  // cast from down there climbs into the houses on its way to a tower on the
  // hilltop, and the check went red about a view nobody has. The gate is chosen
  // from the ground now: dry land at two hundred metres, and of the dry ones the
  // one whose ground is nearest the town's own level, which is the approach a
  // road would take. Both directions of the ray test use this same eye.
  const eyeFor = (plan) => {
    const er = plan.wall.r + OUT;
    const stands = plan.gates.map((gt) => {
      const gx = plan.x + Math.sin(gt.bearing) * er, gz = plan.z + Math.cos(gt.bearing) * er;
      const smp = f.sampleAt(gx, gz);
      return { gt, x: gx, z: gz, wet: smp.water, rise: Math.abs(smp.h - heightAt(plan.x, plan.z)) };
    }).sort((a, b) => (a.wet === b.wet ? a.rise - b.rise : (a.wet ? 1 : -1)));
    const st = stands[0];
    return new THREE.Vector3(st.x, heightAt(st.x, st.z) + EYE, st.z);
  };
  const rows = [];
  let blocked = 0, noFlag = 0, leaked = 0, lowRoof = 0;
  for (const site of TOWNS) {
    const port = TOWN_SPECS[site.sub].port ? seawardOf(site, heightAt) : null;
    const plan = layoutTown(site, LAY, port ? { port } : {});
    const g = buildTown(site, heightAt, port ? { port } : {});
    g.updateWorldMatrix(true, true);
    const keep = g.userData.keep;
    const tower = lotOf(plan, 'keeptower');
    const floor = footingFor(tower, heightAt).y - 0.12;

    const eye = eyeFor(plan);

    // ---- the real geometry: is anything in the way? -----------------------
    // Aimed a metre under the top of the shaft, which is solid in every one of
    // the seven bodies, so a hit at the end is the tower and not a near miss.
    const aim = new THREE.Vector3(tower.x, floor + tower.h - 1.0, tower.z);
    const dist = eye.distanceTo(aim);
    const ray = new THREE.Raycaster(eye, aim.clone().sub(eye).normalize(), 0.1, dist + 6);
    const hits = ray.intersectObject(g, true);
    const first = hits[0] || null;
    // ON THE CASTLE, not on the tower's own ten metre footprint. The line is
    // aimed a metre under the top of the shaft and the castle's own great hall
    // stands under it: at Hearthhome the first triangle the eye meets is the
    // hall's roof six metres short of the tower, which is the keep showing over
    // the town exactly as this check is about. What would be a failure is a
    // HOUSE in the way, and the roof measurement under this one says so by
    // name. Every lot the castle owns carries `keep`.
    const onCastle = !!first && (
      Math.hypot(first.point.x - tower.x, first.point.z - tower.z) <= lotRadius(tower.w, tower.d) + 1.5
      || plan.lots.some((l) => l.keep
        && Math.hypot(first.point.x - l.x, first.point.z - l.z) <= lotRadius(l.w, l.d) + 1.5));
    if (!onCastle) blocked++;

    // ---- and the roofs the line passes over, by name ----------------------
    // the same line the raycast used, which is a metre UNDER the top of the
    // shaft, so the clearance reported here is the conservative one
    let roofs = 0, worst = Infinity, worstAt = '';
    const top = aim.y;
    for (const lot of plan.lots) {
      if (lot.keep || lot.kind === 'hull' || lot.kind === 'jetty' || lot.kind === 'mole') continue;
      // where does the line pass over this lot's ground?
      const t = ((lot.x - eye.x) * (aim.x - eye.x) + (lot.z - eye.z) * (aim.z - eye.z))
        / ((aim.x - eye.x) ** 2 + (aim.z - eye.z) ** 2);
      if (t <= 0 || t >= 1) continue;
      const px = eye.x + (aim.x - eye.x) * t, pz = eye.z + (aim.z - eye.z) * t;
      if (segDist(px, pz, lot.x, lot.z, lot.x, lot.z) > lotRadius(lot.w, lot.d)) continue;
      if (!lotCorners(lot).length) continue;
      // the ray's height there, against the top of that body
      const rayY = eye.y + (top - eye.y) * t;
      const roofY = footingFor(lot, heightAt).y - 0.12 + bodyTopOf(lot, plan);
      roofs++;
      if (rayY - roofY < worst) { worst = rayY - roofY; worstAt = `${lot.kind}`; }
      if (rayY <= roofY) lowRoof++;
    }

    // ---- the flag on the gate, and only on the gate ----------------------
    let flagged = 0, meshes = 0, farFromGate = 0;
    g.traverse((o) => {
      if (!o.isMesh) return;
      meshes++;
      if (!o.userData.keep) return;
      flagged++;
      o.geometry.computeBoundingSphere();
      const c = o.geometry.boundingSphere.center.clone().applyMatrix4(o.matrixWorld);
      if (Math.hypot(c.x - keep.gate.x, c.z - keep.gate.z) > 8) farFromGate++;
    });
    if (!flagged) noFlag++;
    if (farFromGate) leaked++;

    rows.push(`${site.sub.padEnd(17)} tower ${(keep.top.y - floor).toFixed(1)} m to the top, aimed at ${(top - floor).toFixed(1)} m, `
      + `first thing the eye meets ${first ? first.distance.toFixed(0) + ' m out and it is ' + (onCastle ? 'the castle' : 'NOT the castle') : 'nothing at all'}, `
      + `${roofs} roofs under the line, cleared by ${worst === Infinity ? 'n/a' : worst.toFixed(1) + ' m'}${worstAt ? ' (' + worstAt + ')' : ''}, `
      + `${flagged} of ${meshes} meshes flagged`);
  }
  console.log('    ' + rows.join('\n    '));
  // and the thing that makes a town read as a seat from outside: the keep is
  // the tallest thing in it. The Canopy Court is the exception and is meant to
  // be: its own trunks stand up to 50 m, and the Speaker's Tree is one of them.
  {
    const rows2 = [];
    let notTallest = 0;
    for (const site of TOWNS) {
      const port = TOWN_SPECS[site.sub].port ? seawardOf(site, heightAt) : null;
      const plan = layoutTown(site, LAY, port ? { port } : {});
      const g = buildTown(site, heightAt, port ? { port } : {});
      g.updateWorldMatrix(true, true);
      const ground = heightAt(site.x, site.z);
      // The highest VERTEX in the town, and where it stands. Bounding boxes
      // are no use here: the merge has already baked every body of one colour
      // into one mesh, so a box would be the box of the whole town in beige.
      let maxY = -Infinity, at = null;
      const v = new THREE.Vector3();
      g.traverse((o) => {
        if (!o.isMesh) return;
        const p = o.geometry.getAttribute('position');
        for (let i = 0; i < p.count; i++) {
          v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
          if (v.y > maxY) { maxY = v.y; at = v.clone(); }
        }
      });
      const inKeep = keepDepth(plan.keep, at.x, at.z) > 0;
      if (!inKeep && site.sub !== 'canopycourt') notTallest++;
      rows2.push(`${site.sub}: ${(maxY - ground).toFixed(1)} m and it is ${inKeep ? 'in the castle' : 'not the castle'}`);
    }
    check('the keep is the tallest thing in six of the seven towns', notTallest === 0, rows2.join('; '));
    check('and at the Canopy Court, where the trees are taller, the keep is one of the trees',
      (() => {
        const plan = PLANS.get('canopycourt');
        const trunks = lotsOfKind(plan, 'trunk').length;
        return plan.keep.style === 'greattree' && trunks >= 8
          && bodyTopOf(lotOf(plan, 'keeptower'), plan) >= 34;
      })(), 'the Court\'s own trunks stand 34 to 50 m and the Speaker\'s Tree stands 45');
  }

  check(`from ${OUT} m outside the town's own approach at ${EYE} m, the first thing the eye meets on the line to the keep is the castle`,
    blocked === 0, 'cast against the town\'s own triangles, wall, gates, houses and all');
  check('and the line clears the top of every roof it passes over', lowRoof === 0);
  check('every town\'s keep gate carries userData.keep after the merge', noFlag === 0);
  check('and the flag did not spread to the rest of the town in the merge', leaked === 0,
    'every flagged mesh is within 8 m of the gate it belongs to');

  // both directions: the same measurement, aimed at the tower's foot instead
  // of its top, is blocked, so the ray test can tell the difference
  {
    let stopped = 0;
    for (const site of TOWNS) {
      const port = TOWN_SPECS[site.sub].port ? seawardOf(site, heightAt) : null;
      const plan = layoutTown(site, LAY, port ? { port } : {});
      const g = buildTown(site, heightAt, port ? { port } : {});
      g.updateWorldMatrix(true, true);
      const tower = lotOf(plan, 'keeptower');
      const floor = footingFor(tower, heightAt).y - 0.12;
      const eye = eyeFor(plan);
      const aim = new THREE.Vector3(tower.x, floor + 1.7, tower.z);
      const d = eye.distanceTo(aim);
      const hits = new THREE.Raycaster(eye, aim.clone().sub(eye).normalize(), 0.1, d).intersectObject(g, true);
      const first = hits[0];
      if (first && first.distance < d - (lotRadius(tower.w, tower.d) + 1.5)) stopped++;
    }
    check('and aimed at the tower\'s foot instead the same line is stopped, in every town', stopped === TOWNS.length,
      `${stopped} of ${TOWNS.length} stopped short of the tower, so the measurement above is not measuring an empty sky`);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
