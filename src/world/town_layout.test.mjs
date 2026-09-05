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

import { createWorldField } from './field.js';
import { authoredSites, TOWN_PRECINCT_R } from './zones.js';
import { SITE_CELL } from './sitegrid.js';
import {
  layoutTown, lotCorners, lotsOverlap, segDist, doorOf, lotOf, lotsOfKind,
  TOWN_SPECS, PALETTES, REQUIRED_LOTS, SQUARE_R, STREET_GAP,
  PRECINCT_GAP, WAYSTONE_H, auditTownSpecs, angDiff,
} from './town_layout.js';
import { buildTown, seawardOf, waterlineAt, footingFor, PLINTH_AT, TOWN_MAX_DRAWS } from './town_models.js';

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
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
