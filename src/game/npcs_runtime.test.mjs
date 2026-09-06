// The people in the settlements. Run: node src/game/npcs_runtime.test.mjs
import {
  npcSpotsFor, streetFor, nameFor, forestEdgeAt, plateText, auditNpcSpots,
  NPC_RING, PLAZA, WELL_CLEAR, ROLE_TINT, GIVEN_NAMES, PEOPLED,
  TALK_REACH, NOTICE, createNpcs, TOWN_ANCHOR, townPlanFor, DOOR_STAND,
} from './npcs_runtime.js';
import { NPCS, npcsFor } from '../mmo/npcs.js';
import { PERSON } from '../mmo/story.js';
import { peopleFor } from '../mmo/plans/index.js';
import { createWorldField } from '../world/field.js';
import { SITE_CELL } from '../world/sitegrid.js';
import { mulberry32 } from '../world/noise.js';
import { authoredSites, TOWN_PRECINCT_R } from '../world/zones.js';
import { PLANS } from '../mmo/plans/index.js';
import { FOOTPRINT } from '../mmo/plans/footprints.js';
/** Is a point inside any piece's footprint of a planned site? A rough box test in the plan's frame. */
function inPlannedPieceAt(site, x, z) {
  const plan = PLANS[site.sub];
  if (!plan) return false;
  const lx = x - site.x, lz = z - site.z;
  return (plan.pieces || []).some((pc) => {
    const f = FOOTPRINT[pc.model];
    if (!f) return false;
    const dx = lx - pc.x, dz = lz - pc.z;
    // the plan turns clockwise from north, so the local frame turns with it
    const a = (pc.yaw || 0) * Math.PI / 180;
    const rx = dx * Math.cos(a) - dz * Math.sin(a), rz = dx * Math.sin(a) + dz * Math.cos(a);
    return Math.abs(rx) < f[0] / 2 && Math.abs(rz) < f[1] / 2;
  });
}
import { lotOf, lotsOverlap, SQUARE_R } from '../world/town_layout.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

const field = createWorldField(20260904, { homeBiome: 'meadow', homeY: -0.3 });

/** Every settlement in a wide sweep of the real world, for the "all cases" checks. */
function realSites(kinds, want = 12) {
  const out = [];
  for (let cz = -14; cz <= 14 && out.length < want; cz++) {
    for (let cx = -14; cx <= 14 && out.length < want; cx++) {
      const s = field.siteInCell(cx, cz);
      if (s && kinds.includes(s.kind)) out.push(s);
    }
  }
  return out;
}

console.log('npcs_runtime: the layout audit');
check('the audit passes at load', (() => { try { auditNpcSpots(); return true; } catch { return false; } })());
for (const kind of PEOPLED) {
  check(`the ${kind} ring is inside its buildings`, NPC_RING[kind] < PLAZA[kind], `${NPC_RING[kind]} m vs ${PLAZA[kind]} m`);
}
check('a town and a hamlet stand clear of the well', NPC_RING.town > WELL_CLEAR && NPC_RING.hamlet > WELL_CLEAR);
check('every one of the fourteen roles has a tunic colour', Object.keys(NPCS).every((id) => ROLE_TINT[id] !== undefined), `${Object.keys(ROLE_TINT).length} colours`);

console.log('npcs_runtime: spots');
{
  const site = { x: 100, z: -50, kind: 'town', facing: 0.7, cx: 0, cz: 0, id: '0,0' };
  const spots = npcSpotsFor(site, 9);
  check('nine people get nine spots', spots.length === 9);
  const radii = spots.map((s) => Math.hypot(s.x - site.x, s.z - site.z));
  check('all nine stand on the ring', radii.every((r) => Math.abs(r - NPC_RING.town) < 1e-9), `${radii[0].toFixed(2)} m`);
  const gaps = [];
  for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++) gaps.push(Math.hypot(spots[i].x - spots[j].x, spots[i].z - spots[j].z));
  check('nobody overlaps anybody', Math.min(...gaps) > 1.2, `closest pair ${Math.min(...gaps).toFixed(2)} m`);
  check('each one faces the well', spots.every((s) => {
    const want = Math.atan2(site.x - s.x, site.z - s.z);
    return Math.abs(Math.sin(s.yaw - want)) < 1e-9;
  }));
  // the whole point of the ring: nothing lands where a building goes
  check('nobody stands where a building would', radii.every((r) => r < PLAZA.town), `ring ${NPC_RING.town} m, innermost house ${PLAZA.town} m`);
  const one = npcSpotsFor({ ...site, kind: 'ruin' }, 1);
  check('a ruin puts its one stall inside the pillars', Math.hypot(one[0].x - site.x, one[0].z - site.z) < 3, `${Math.hypot(one[0].x - site.x, one[0].z - site.z).toFixed(2)} m, pillars start at 3 m`);
}

console.log('npcs_runtime: streets');
{
  const towns = realSites(['town'], 8);
  const hamlets = realSites(['hamlet'], 8);
  const ruins = realSites(['ruin'], 6);
  check('the world really holds towns, hamlets and ruins to test with', towns.length && hamlets.length && ruins.length, `${towns.length} towns, ${hamlets.length} hamlets, ${ruins.length} ruins`);

  const a = streetFor(towns[0], field);
  const b = streetFor(towns[0], field);
  check('the same town gives the same street twice', JSON.stringify(a.map((n) => [n.role.id, n.personName, n.x, n.z])) === JSON.stringify(b.map((n) => [n.role.id, n.personName, n.x, n.z])), `${a.length} people`);
  check('a town holds six to nine people', a.length >= 6 && a.length <= 9, `${a.length}`);
  check('a town always has a Provisioner and a Healer', a.some((n) => n.role.id === 'provisioner') && a.some((n) => n.role.id === 'healer'));
  check('nobody in a town is the Necromancer', !a.some((n) => n.role.id === 'necromancer'));

  const h = streetFor(hamlets[0], field);
  check('a hamlet holds two to four', h.length >= 2 && h.length <= 4, `${h.length}`);

  const r = streetFor(ruins[0], field);
  check('a ruin holds the Necromancer and nobody else', r.length === 1 && r[0].role.id === 'necromancer');
  check('the Necromancer is marked night only', r[0].nightOnly === true);

  // one case is never the case: every peopled kind in the world gets people
  let empty = 0, checked = 0;
  for (const kind of PEOPLED) for (const s of realSites([kind], 6)) { checked++; if (streetFor(s, field).length === 0) empty++; }
  check('no settlement anywhere comes out empty', empty === 0, `${checked} settlements checked`);

  // and a kind with nobody in it gets nobody
  const cave = realSites(['cave'], 1)[0] || { kind: 'cave', x: 0, z: 0, cx: 0, cz: 0, id: 'c', facing: 0 };
  check('a cave has no street', streetFor(cave, field).length === 0);

  check('a plate names the person and the role', plateText(a[0]) === `${a[0].personName}, the ${a[0].role.name}`, plateText(a[0]));
  check('no plate carries an em dash', !a.some((n) => plateText(n).includes('—')));
  check('names come off the list', a.every((n) => GIVEN_NAMES.includes(n.personName)));

  // every person stands on the flattened pad, which is what makes them level
  const pad = towns[0].flatR;
  check('everybody stands on the site pad', a.every((n) => Math.hypot(n.x - towns[0].x, n.z - towns[0].z) < pad), `pad ${pad} m`);
  const ys = a.map((n) => field.heightAt(n.x, n.z));
  check('the ground under a town street is level', Math.max(...ys) - Math.min(...ys) < 0.6, `${(Math.max(...ys) - Math.min(...ys)).toFixed(3)} m of rise across the whole street`);
}

console.log('npcs_runtime: the seven precinct towns keep their doors');
{
  const all = authoredSites().filter((s) => s.flatR === TOWN_PRECINCT_R)
    .map((s) => field.siteInCell(Math.floor(s.x / SITE_CELL), Math.floor(s.z / SITE_CELL)));
  check('all seven are in the world to be peopled', all.length === 7, all.map((s) => s.sub).join(', '));
  // Hearthhome is painted (P1): its street is the plan's, fourteen people by
  // name at the doors the painting gives them, so the packer's door rules
  // below are for the six the packer still lays out
  const planned = all.filter((s) => PLANS[s.sub]);
  const precinct = all.filter((s) => !PLANS[s.sub]);
  check('one of the seven is painted and the other six are packed', planned.length === 1 && planned[0].sub === 'hearthhome' && precinct.length === 6, planned.map((s) => s.sub).join(', '));
  {
    const street = streetFor(planned[0], field);
    check('the painted town stands the plan\'s people, fourteen of them', street.length === 14, `${street.length}`);
    check('and five of them are the story\'s named cast at their doors', ['Nan Ockley', 'Cobb Ashby', 'Alys Fenn', 'Old Wynn Ashby', 'Bram Haywood'].every((n) => street.some((p) => p.personName === n)), street.map((p) => p.personName).join(', '));
    check('and none of them stands inside a plan piece', street.every((p) => !inPlannedPieceAt(planned[0], p.x, p.z)));
  }
  check('and every one of them has a plan', precinct.every((s) => !!townPlanFor(s)));

  const rows = [];
  let unmanned = 0, farFromDoor = 0, worstDoor = 0, worstAt = '';
  let inside = 0, offPad = 0, tooClose = 0, closest = Infinity, closestAt = '';
  for (const site of precinct) {
    const plan = townPlanFor(site);
    const street = streetFor(site, field);
    rows.push(`${site.sub}: ${street.length} people, ${street.filter((n) => n.at !== 'square').length} at doors`);
    for (const [roleId, kind] of Object.entries(TOWN_ANCHOR)) {
      const person = street.find((n) => n.role.id === roleId);
      if (!person) { unmanned++; continue; }
      const lot = lotOf(plan, kind);
      // they stand DOOR_STAND metres out from the front wall, and no further
      const d = Math.hypot(person.x - lot.x, person.z - lot.z) - lot.d / 2;
      if (Math.abs(d - DOOR_STAND) > 0.02) farFromDoor++;
      if (d > worstDoor) { worstDoor = d; worstAt = `${site.sub} ${roleId}`; }
      // and never inside the walls of the building they keep
      if (lotsOverlap({ x: person.x, z: person.z, w: 0.7, d: 0.7, yaw: 0 }, lot, 0)) inside++;
    }
    for (const n of street) {
      if (Math.hypot(n.x - site.x, n.z - site.z) > site.flatR) offPad++;
    }
    for (let i = 0; i < street.length; i++) for (let j = i + 1; j < street.length; j++) {
      const d = Math.hypot(street[i].x - street[j].x, street[i].z - street[j].z);
      if (d < 1.2) tooClose++;
      if (d < closest) { closest = d; closestAt = `${site.sub}: ${street[i].role.id} and ${street[j].role.id}`; }
    }
  }
  console.log('    ' + rows.join('\n    '));
  check('every building that owns a person has one', unmanned === 0,
    `${Object.keys(TOWN_ANCHOR).length} doors in each of ${precinct.length} towns`);
  check(`and every one of them stands ${DOOR_STAND} m out from their own front wall`, farFromDoor === 0,
    `the furthest is ${worstDoor.toFixed(2)} m (${worstAt})`);
  check('nobody is standing inside the building they keep', inside === 0);
  {
    // and not inside anybody else's either: a door stand of 2 m is wider than
    // the 1.6 m of daylight the packer leaves between two lots, so this is the
    // one that could have gone wrong quietly
    let inAny = 0, who = '';
    for (const site of precinct) {
      const plan = townPlanFor(site);
      for (const n of streetFor(site, field)) {
        for (const lot of plan.lots) {
          if (lotsOverlap({ x: n.x, z: n.z, w: 0.7, d: 0.7, yaw: 0 }, lot, 0)) { inAny++; who = `${site.sub} ${n.role.id} in the ${lot.kind}`; }
        }
      }
    }
    check('and nobody is standing inside any building at all', inAny === 0, who || 'all seven streets clear of every wall');
  }
  check('everybody in all seven is on the pad', offPad === 0);
  check('and no two people share a spot', tooClose === 0,
    `the closest pair is ${closest.toFixed(2)} m apart (${closestAt})`);

  // the people without a building take the ring in the square, which the plan
  // keeps empty of buildings on purpose
  let outOfSquare = 0, loose = 0;
  for (const site of precinct) {
    for (const n of streetFor(site, field)) {
      if (n.at !== 'square') continue;
      loose++;
      if (Math.hypot(n.x - site.x, n.z - site.z) > SQUARE_R) outOfSquare++;
    }
  }
  check('the traders with no shop stand in the square', outOfSquare === 0,
    `${loose} of them over the seven, all within the ${SQUARE_R} m square`);

  // both directions: a rolled town has no plan and keeps the ring it always had
  const rolled = realSites(['town'], 12).filter((s) => !s.authored);
  check('the world still rolls towns of its own to compare against', rolled.length > 0, `${rolled.length}`);
  check('a rolled town gets no plan', rolled.every((s) => townPlanFor(s) === null));
  check('and every one of its people is on the old ring, as before',
    rolled.every((s) => streetFor(s, field).every((n) => Math.abs(Math.hypot(n.x - s.x, n.z - s.z) - NPC_RING.town) < 1e-9)),
    `ring ${NPC_RING.town} m`);
  check('and none of them is anchored to a building', rolled.every((s) => streetFor(s, field).every((n) => n.at === 'square')));

  // the Banker is the role this wave added, so prove they are really there
  check('the bank in every one of the seven has a Banker in the door',
    precinct.every((s) => streetFor(s, field).some((n) => n.role.id === 'banker' && n.at === 'bank')));
  check('and the Banker never turns up in a rolled village',
    rolled.every((s) => !streetFor(s, field).some((n) => n.role.id === 'banker')));
}

console.log('npcs_runtime: the forest edge, driven both ways');
{
  // A Ranger only exists where npcsFor is told forestEdge is true, so the
  // predicate has to be shown to answer both ways or the role is unreachable.
  let sawTrue = false, sawFalse = false;
  for (let cz = -14; cz <= 14; cz++) for (let cx = -14; cx <= 14; cx++) {
    const s = field.siteInCell(cx, cz);
    if (!s || s.kind !== 'hamlet') continue;
    if (forestEdgeAt(field, s.x, s.z)) sawTrue = true; else sawFalse = true;
    if (sawTrue && sawFalse) break;
  }
  check('some hamlets are on a forest edge', sawTrue);
  check('some hamlets are not', sawFalse);
  let edgeRangers = 0, plainRangers = 0;
  for (let s = 1; s <= 400; s++) {
    if (npcsFor({ kind: 'hamlet', forestEdge: true }, mulberry32(s)).some((n) => n.id === 'ranger')) edgeRangers++;
    if (npcsFor({ kind: 'hamlet', forestEdge: false }, mulberry32(s)).some((n) => n.id === 'ranger')) plainRangers++;
  }
  check('a Ranger does turn up on a forest edge', edgeRangers > 0, `${edgeRangers} of 400 hamlets`);
  check('a Ranger never turns up anywhere else', plainRangers === 0, `${plainRangers} of 400`);
}

console.log('npcs_runtime: names');
{
  const site = { cx: 3, cz: -2 };
  check('a name is stable for a site, a role and a place', nameFor(site, 'blacksmith', 0) === nameFor(site, 'blacksmith', 0));
  const spread = new Set();
  for (let cx = 0; cx < 40; cx++) spread.add(nameFor({ cx, cz: 0 }, 'healer', 1));
  check('names are not all the same person', spread.size > 6, `${spread.size} different names over 40 towns`);
}

console.log('npcs_runtime: the runtime, headless');
{
  // A fake rig, so the placement and the reach rules are tested without a
  // renderer. The real buildCharacter is injected by main.js.
  const made = [];
  const fakeBuild = () => {
    const mesh = { isMesh: true, material: { color: { getHex: () => 0x5c7d52, setHex() {}, offsetHSL() {} }, clone() { return this; }, dispose() {} }, userData: {}, visible: true, geometry: { dispose() {} } };
    const group = {
      position: { set() {} }, rotation: { y: 0 }, visible: true, name: '', userData: {},
      children: [mesh],
      traverse(fn) { fn(this); fn(mesh); },
    };
    made.push(group);
    return { group, parts: {} };
  };
  const town = realSites(['town'], 1)[0];
  const scene = { children: [], add(o) { this.children.push(o); }, remove(o) { const i = this.children.indexOf(o); if (i >= 0) this.children.splice(i, 1); } };
  const runtime = { field, sitesNear: (x, z, r) => [town] };
  const toasts = [];
  const opened = [];
  const npcs = createNpcs({ scene, camera: null }, runtime, {
    buildCharacter: fakeBuild,
    root: null,
    at: { x: town.x, z: town.z },
    ctx: {
      hud: { toast: (t) => toasts.push(t) },
      audio: { play() {} },
      windows: { open: (id, extra) => { opened.push([id, extra]); return true; } },
    },
  });
  const list = npcs.list();
  check('the town is peopled on the frame it boots', npcs.count >= 6, `${npcs.count} people`);
  check('every person got a body in the scene', scene.children.length === npcs.count);

  const near = npcs.nearest({ x: list[0].x, z: list[0].z }, TALK_REACH);
  check('nearest finds the one you are standing on', near && near.npc.id === list[0].id);
  check('nearest finds nobody a hundred metres off', npcs.nearest({ x: town.x + 100, z: town.z + 100 }, TALK_REACH) === null);
  check('the notice range is wider than the talk range', NOTICE > TALK_REACH, `${NOTICE} m against ${TALK_REACH} m`);

  // a click, both ways
  const target = list[0];
  const ray = { intersectObjects: (objs) => objs.filter((o) => o.userData.npc === target).map((o) => ({ object: o, distance: 2, point: { x: 0, y: 0, z: 0 } })) };
  const far = npcs.click(ray, { x: target.x + 12, z: target.z });
  check('a click from twelve metres opens nothing and says why', far.opened === false && /Walk up to them/.test(far.text), far.text);
  const close = npcs.click(ray, { x: target.x + 1, z: target.z });
  check('a click from a metre opens Talk with that person', close.opened === true && opened.length === 1 && opened[0][0] === 'talk' && opened[0][1].npc === target);
  const nothing = npcs.click({ intersectObjects: () => [] }, { x: target.x, z: target.z });
  check('a click on empty air opens nothing and says nothing', nothing.npc === null && nothing.text === null);

  // the turn
  const before = target.group.rotation.y;
  npcs.update(0.5, { x: target.x + 2, z: target.z });
  check('somebody two metres away turns toward you', target.group.rotation.y !== before);
  const facing = target.group.rotation.y;
  npcs.update(2.0, { x: target.x + 2, z: target.z });
  const want = Math.atan2(2, 0);
  // the yaw is never wrapped, so compare the angle and not the number: -3pi/2 faces the same way as pi/2
  const wrapped = Math.atan2(Math.sin(target.group.rotation.y - want), Math.cos(target.group.rotation.y - want));
  check('the turn settles facing you and stops', Math.abs(wrapped) < 0.02, `${target.group.rotation.y.toFixed(3)} against ${want.toFixed(3)}, ${wrapped.toFixed(3)} apart`);
  npcs.update(0.1, { x: target.x + 40, z: target.z });
  check('a turn is not instant', Math.abs(target.group.rotation.y - facing) < Math.PI);

  npcs.dispose();
  check('disposing takes every body out of the scene', scene.children.length === 0 && npcs.count === 0);
}

console.log('npcs_runtime: night at the ruin');
{
  const ruin = realSites(['ruin'], 1)[0];
  const fakeBuild = () => ({ group: { position: { set() {} }, rotation: { y: 0 }, visible: true, name: '', userData: {}, traverse(fn) { fn(this); } }, parts: {} });
  const scene = { children: [], add(o) { this.children.push(o); }, remove(o) { const i = this.children.indexOf(o); if (i >= 0) this.children.splice(i, 1); } };
  const npcs = createNpcs({ scene, camera: null }, { field, sitesNear: () => [ruin] }, { buildCharacter: fakeBuild, root: null, at: ruin });
  const nec = npcs.list()[0];
  npcs.update(0.1, { x: ruin.x, z: ruin.z }, 1);      // broad daylight
  check('the Necromancer is not at his stall by day', nec.group.visible === false);
  npcs.update(0.1, { x: ruin.x, z: ruin.z }, 0);      // night
  check('he is there at night', nec.group.visible === true);
  npcs.update(0.1, { x: ruin.x, z: ruin.z });          // nothing said about the time
  check('with no time given nobody is hidden', nec.group.visible === true);
  npcs.dispose();
}

console.log('npcs_runtime: a name each, and the cast keep theirs');
{
  // THE BUG, MEASURED. `nameFor` hashes the ROLE'S LENGTH and the index into a
  // table of twenty four, so a street of nine draws nine times out of twenty
  // four and two of them come up the same about as often as not. Before this,
  // over every settlement within 6 km: 29 of 129 streets held a repeat and 45
  // people of 440 answered to a name somebody at the next door also had.
  // Hearthhome stood Pell the Stablemaster beside Pell the Banker and Udd the
  // Alchemist beside Udd the Provisioner.
  const R = 6000, C = Math.ceil(R / SITE_CELL);
  const streets = [];
  for (let cz = -C; cz <= C; cz++) for (let cx = -C; cx <= C; cx++) {
    const st = field.siteInCell(cx, cz);
    if (!st || !PEOPLED.includes(st.kind)) continue;
    if (Math.hypot(st.x, st.z) > R) continue;
    streets.push({ site: st, people: streetFor(st, field) });
  }
  const planned = streets.filter((s) => peopleFor(s.site.sub).length);
  const rolled = streets.filter((s) => !peopleFor(s.site.sub).length);
  check('there are streets of both kinds inside 6 km, so the sweep means something',
    planned.length >= 1 && rolled.length > 50 && streets.reduce((n, s) => n + s.people.length, 0) > 300,
    `${streets.length} settlements, ${planned.length} planned, ${rolled.length} rolled, ${streets.reduce((n, s) => n + s.people.length, 0)} people`);

  // The comparison is on the FIRST WORD, because the cast's plates carry a
  // surname and "Cobb" standing beside "Cobb Ashby" is the same bug in a coat.
  const clashes = [];
  let counted = 0, widest = 0;
  for (const s of streets) {
    const seen = new Map();
    widest = Math.max(widest, s.people.length);
    for (const p of s.people) {
      counted++;
      const first = String(p.personName).split(' ')[0];
      if (seen.has(first)) clashes.push(`${s.site.name}: ${seen.get(first)} and ${p.personName}`);
      seen.set(first, p.personName);
    }
  }
  check('no two people in one street share a name, over every settlement within 6 km',
    clashes.length === 0,
    clashes.slice(0, 6).join('; ') || `${counted} people over ${streets.length} streets, the widest ${widest}, not one repeat`);
  check('and the table is longer than the widest street, which is why that is possible',
    GIVEN_NAMES.length > widest, `${GIVEN_NAMES.length} names against a street of ${widest}`);

  // The named cast keep their names, and stand where the plan stands them.
  {
    const hh = realSites(['town'], 40).find((st) => st.sub === 'hearthhome')
      || field.siteAt(authoredSites().find((st) => st.sub === 'hearthhome').x, authoredSites().find((st) => st.sub === 'hearthhome').z);
    const street = streetFor(hh, field);
    const want = peopleFor('hearthhome').filter((p) => p.name).map((p) => PERSON[p.name].name);
    const got = street.map((p) => p.personName);
    check('the cast the plan names keep the names story.js gives them',
      want.length >= 5 && want.every((n) => got.includes(n)),
      want.join(', '));
    check('and Hearthhome no longer stands two Pells and two Udds at its doors',
      new Set(got.map((n) => n.split(' ')[0])).size === got.length,
      got.map((n, i) => `${n} the ${street[i].role.name}`).join('; '));
    // stable: the same street asked twice is the same street
    const again = streetFor(hh, field).map((p) => p.personName);
    check('and asking twice gives the same names in the same order', again.join('|') === got.join('|'));
  }

  // DRIVEN THE OTHER WAY, on nameFor itself. Without a Set it is the bare hash
  // it always was, and the bare hash still collides: that is the proof the
  // uniqueness is doing the work and not the hash quietly having changed.
  {
    const hh = field.siteAt(authoredSites().find((st) => st.sub === 'hearthhome').x, authoredSites().find((st) => st.sub === 'hearthhome').z);
    const bare = peopleFor('hearthhome').map((p, i) => nameFor(hh, p.role, i));
    const bareDupes = bare.filter((n, i) => bare.indexOf(n) !== i);
    check('nameFor with no street still collides, which is the bug this fixes',
      bareDupes.length > 0, `${bare.join(', ')} -> repeats: ${[...new Set(bareDupes)].join(', ') || 'none'}`);
    const taken = new Set();
    const uniq = peopleFor('hearthhome').map((p, i) => nameFor(hh, p.role, i, taken));
    check('and the same calls with a street give everybody their own',
      new Set(uniq).size === uniq.length && uniq[0] === bare[0],
      `${uniq.join(', ')}; the first person keeps the name the hash gave them`);
    // a name already spoken for is stepped over, and only that one
    const held = new Set([GIVEN_NAMES[0]]);
    const first = nameFor({ cx: 0, cz: 0 }, 'provisioner', 0, held);
    check('a name already in the street is stepped over to the next in the table',
      first !== GIVEN_NAMES[0] && GIVEN_NAMES.includes(first) && held.has(first),
      `${GIVEN_NAMES[0]} was held, so the next asker got ${first}`);
  }

  // and the audit refuses a street the table cannot dress
  check('the audit knows the table has to outlast the widest street',
    (() => { try { auditNpcSpots(); return true; } catch { return false; } })()
    && GIVEN_NAMES.length >= Math.max(...['hearthhome'].map((id) => peopleFor(id).length)),
    `${GIVEN_NAMES.length} names, the widest plan stands ${Math.max(...['hearthhome'].map((id) => peopleFor(id).length))}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
