// The nine plans, and the audit that will not let a broken one load.
// Run: node src/mmo/plans/plans.test.mjs
//
// The reason this file exists: a plan is a hand written JSON of a hand painted
// village, and every way one of those can be wrong is a way a place can be
// silently broken. A stall in the bank's doorway, a person standing inside a
// wall, a monster id that is not a monster, a model that has no body: none of
// those throws when the game runs. They just look like a bad village. So the
// audit refuses them at load, and this file drives every one of its rules the
// wrong way as well as the right way, because a gate that only ever lets the
// right case through has not been tested.

import { PLANS, PLAN_IDS, PLAN_STATS, peopleFor, spawnsFor, planFor, inPlannedPlace } from './index.js';
import { stopsOf, insidePlan, PLAN_MARGIN } from './footprints.js';
import { auditPlans, rectOf, rectsOverlap, pointInRect, cornersOf, reachOf } from './plan_schema.js';
import { FOOTPRINT, hasStandIn, isRunKind, RUN_SPAN } from '../../world/plan_models.js';
import { ZONE } from '../../world/zones.js';
import { MONSTERS } from '../monsters.js';
import { NPCS } from '../npcs.js';
import { PERSON, STORY_ROLES } from '../story.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };
/** A deep copy of a plan, so a planted fault cannot leak into the real one. */
const copy = (id) => JSON.parse(JSON.stringify(PLANS[id]));
/** Whether the audit refuses a set of plans, and what it said. */
function refused(plans) {
  try { auditPlans(plans); return null; } catch (err) { return err.message; }
}

const WANT = ['hearthhome', 'waystones', 'millrun', 'oldcellars', 'beechhangar',
  'kingsroad', 'greenwoldpits', 'highwaymanshollow', 'sunkenchapel'];

// ============================================================================
console.log('plans: the nine load and the audit passes');
{
  check('there are nine plans', PLAN_IDS.length === 9, PLAN_IDS.join(', '));
  for (const id of WANT) check(`${id} is one of them`, !!PLANS[id]);
  check('every plan calls itself by its own key', PLAN_IDS.every((id) => PLANS[id].id === id));
  check('every plan stands at a place zones.js has', PLAN_IDS.every((id) => !!ZONE[PLANS[id].place]));
  check('every plan is drawn about the place it is named for', PLAN_IDS.every((id) => PLANS[id].place === id));
  check('the audit passed at import', !!PLAN_STATS && PLAN_STATS.plans === 9,
    `${PLAN_STATS.pieces} pieces, ${PLAN_STATS.runs} runs, ${PLAN_STATS.areas} areas, ${PLAN_STATS.people} people, ${PLAN_STATS.spawns} spawns`);
  check('and it can be run again on the same nine', refused(PLANS) === null);
  check('every plan says something about itself', PLAN_IDS.every((id) => PLANS[id].notes.length > 40));
  check('no em dash anywhere in the nine', !/—/.test(JSON.stringify(PLANS)));
  check('planFor answers for a place and declines for one that is not planned',
    planFor('hearthhome') === PLANS.hearthhome && planFor('cairnfoot') === null && planFor(undefined) === null);
}

// ============================================================================
console.log('\nplans: every model, role, person and monster the nine name is real');
{
  const models = new Set();
  for (const id of PLAN_IDS) {
    for (const p of PLANS[id].pieces) models.add(p.model);
    for (const r of PLANS[id].runs || []) models.add(r.model);
  }
  const noFoot = [...models].filter((m) => !FOOTPRINT[m]);
  const noBody = [...models].filter((m) => !hasStandIn(m));
  check(`all ${models.size} models used have a footprint`, noFoot.length === 0, noFoot.join(', '));
  check(`all ${models.size} models used have a stand-in builder`, noBody.length === 0, noBody.join(', '));

  const runModels = new Set();
  for (const id of PLAN_IDS) for (const r of PLANS[id].runs || []) runModels.add(r.model);
  check(`all ${runModels.size} run models may be run along a line`, [...runModels].every(isRunKind), [...runModels].join(', '));

  let named = 0, anon = 0;
  for (const id of PLAN_IDS) for (const p of PLANS[id].people) {
    if (p.name) { named++; check(`${p.name} is one of the story's people`, !!PERSON[p.name]); } else anon++;
    if (!NPCS[p.role] && !STORY_ROLES[p.role]) check(`the role ${p.role} exists`, false);
  }
  check(`every one of the ${named} named people is in story.js`, named > 0);
  check(`the other ${anon} are roles the game names itself`, anon > 0);
  check('every named person is standing in their own place',
    PLAN_IDS.every((id) => PLANS[id].people.every((p) => !p.name || PERSON[p.name].place === PLANS[id].place)));

  const spawnIds = new Set();
  for (const id of PLAN_IDS) for (const s of PLANS[id].spawns) spawnIds.add(s.id);
  check(`all ${spawnIds.size} spawn ids are monster rows`, [...spawnIds].every((s) => !!MONSTERS[s]), [...spawnIds].join(', '));
}

// ============================================================================
console.log('\nplans: nothing stands in anything, and everything is inside the place');
{
  let pairs = 0, out = 0, inside = 0, worst = 0, worstAt = '';
  for (const id of PLAN_IDS) {
    const plan = PLANS[id];
    const rects = plan.pieces.map((p) => ({ ...rectOf(p), model: p.model, on: p.on || null }));
    for (let i = 0; i < rects.length; i++) {
      const r = rects[i];
      const reach = reachOf(r);
      if (reach > plan.radius) out++;
      if (reach > worst) { worst = reach; worstAt = `${id}'s ${r.model}`; }
      for (let j = i + 1; j < rects.length; j++) {
        pairs++;
        if (!rectsOverlap(r, rects[j])) continue;
        if (r.on === rects[j].model || rects[j].on === r.model) continue;
        inside++;
      }
    }
    for (const p of plan.people) for (const r of rects) if (pointInRect(p.x, p.z, r)) inside++;
    for (const r of rects) if (pointInRect(plan.arrival.x, plan.arrival.z, r)) inside++;
  }
  check(`${pairs} pairs of pieces tested by separating axis, 0 overlap`, inside === 0 && pairs === 2354, `${pairs} pairs, ${inside} overlaps`);
  check('nothing reaches outside its own plan', out === 0, `the furthest is ${worst.toFixed(1)} m, ${worstAt}`);
  const exempt = PLAN_STATS.exempt;
  check('the only overlaps allowed are the ones that say so', exempt === 5,
    'a wheel on a mill, a lantern in an arch, a platform in an oak, a mouth under a headframe, a sett in the roots');
}

// ============================================================================
console.log('\nplans: Hearthhome is the painting, piece for piece');
{
  // Read straight off docs/concepts/greenwold/PLANS.md, section hearthhome.
  const WANTED = {
    well_pavilion: 1,
    stall_a: 2, stall_b: 2, stall_c: 2,          // six stalls round the green
    gate_tower: 1, stone_bridge_10m: 1,
    waystone_village: 1, offerings: 1, bench: 1,
    inn: 1, smithy: 1,
    cottage_a: 1, cottage_b: 1, cottage_c: 1,    // three thatched cottages
    manor: 1, chapel: 1,
    stable: 1, stable_pen: 1, hay_rick: 1,
    healer: 1, bank: 1,
    barrel: 2, flower_box: 1,
  };
  const got = {};
  for (const p of PLANS.hearthhome.pieces) got[p.model] = (got[p.model] || 0) + 1;
  for (const [m, n] of Object.entries(WANTED)) check(`the painting's ${n} ${m}`, got[m] === n, `got ${got[m] || 0}`);
  const TREES = ['oak_a', 'oak_b', 'oak_c', 'beech_a', 'beech_b', 'beech_c'];
  const trees = TREES.reduce((n, t) => n + (got[t] || 0), 0);
  check('eight oaks and beeches inside the wall', trees === 8, `${trees}`);
  const extra = Object.keys(got).filter((m) => !WANTED[m] && !TREES.includes(m));
  check('and nothing in it the painting does not have', extra.length === 0, extra.join(', '));

  const wall = PLANS.hearthhome.runs.filter((r) => r.model === 'flint_wall_4m');
  check('the wall is laid as chords with one gap in it', wall.length === 35, `${wall.length} of 36 chords, the gate stands in the missing one`);
  const far = Math.max(...wall.flatMap((r) => [Math.hypot(r.from.x, r.from.z), Math.hypot(r.to.x, r.to.z)]));
  check('and it is the painting\'s oval of 46 by 40', Math.abs(far - 46) < 0.1, `the widest point is ${far.toFixed(1)} m`);

  const doors = ['inn', 'smithy', 'healer', 'stable', 'bank'];
  const kept = PLANS.hearthhome.people.filter((p) => p.name || ['stablemaster', 'banker'].includes(p.role));
  check(`${doors.length} buildings are kept by somebody`, kept.length >= 5);
  check('Nan is at the inn, Cobb at the forge, Alys at the healer\'s',
    ['nan', 'cobb', 'alys'].every((n) => PLANS.hearthhome.people.some((p) => p.name === n)));
  check('and Bram, Wynn and Pip are on the green', ['bram', 'wynn', 'pip'].every((n) => PLANS.hearthhome.people.some((p) => p.name === n)));
  check('six traders at six stalls', PLANS.hearthhome.people.filter((p) => !p.name && !['stablemaster', 'banker'].includes(p.role)).length === 6);
}

// ============================================================================
console.log('\nplans: the Standing Hedge repeats, and the others do not');
{
  const w = PLANS.waystones;
  check('the Standing Hedge is one stone repeated nine times', w.repeat && w.repeat.count === 9 && w.repeat.kind === 'ring');
  check('on a ring 1610 m across, which is the sheet\'s mile', Math.abs(w.repeat.radius * 2 - 1610) < 1, `${w.repeat.radius * 2} m`);
  check('every stone turns its face at the ring\'s middle', w.repeat.face === 'in');
  check('and it carries eight boundary stones per sarsen', w.pieces.filter((p) => p.model === 'boundary_stone').length === 8);
  check('no other plan repeats', PLAN_IDS.filter((id) => PLANS[id].repeat).length === 1);
}

// ============================================================================
console.log('\nplans: peopleFor and spawnsFor, both directions');
{
  check('peopleFor gives Hearthhome its fourteen', peopleFor('hearthhome').length === 14);
  check('and gives a place with no plan nothing', peopleFor('cairnfoot').length === 0);
  const nightHollow = spawnsFor('highwaymanshollow', true);
  const dayHollow = spawnsFor('highwaymanshollow', false);
  check('the Miller\'s Son has six men after dark', nightHollow.length === 6, nightHollow.map((s) => s.id).join(', '));
  check('and the hollow is empty by day', dayHollow.length === 0);
  const nightHangar = spawnsFor('beechhangar', true), dayHangar = spawnsFor('beechhangar', false);
  check('Old Grist stands in the Beech Hangar by night', nightHangar.some((s) => s.id === 'oldGrist'));
  check('and is not there by day, though the boars are', !dayHangar.some((s) => s.id === 'oldGrist') && dayHangar.length === 2);
  check('the Mill Run\'s four geese are there at both hours', spawnsFor('millrun', false).length === 4 && spawnsFor('millrun', true).length === 4);
  check('and a place with no plan spawns nothing', spawnsFor('lastwell', true).length === 0);
}

// ============================================================================
console.log('\nplans: the rectangle test itself, both ways');
{
  const at = (x, z, yaw, w, d) => ({ x, z, hw: w / 2, hd: d / 2, a: yaw * Math.PI / 180 });
  check('two rectangles side by side do not overlap', !rectsOverlap(at(0, 0, 0, 4, 4), at(5, 0, 0, 4, 4)));
  check('two rectangles on top of each other do', rectsOverlap(at(0, 0, 0, 4, 4), at(1, 1, 0, 4, 4)));
  check('one clipping the other\'s corner at 45 degrees does', rectsOverlap(at(0, 0, 0, 4, 4), at(3.2, 3.2, 45, 4, 4)));
  check('and the same pair pulled apart does not', !rectsOverlap(at(0, 0, 0, 4, 4), at(5.2, 5.2, 45, 4, 4)));
  check('a rectangle turned 90 degrees is checked at its real angle',
    rectsOverlap(at(0, 0, 0, 12, 3), at(0, 4, 90, 12, 3)) && !rectsOverlap(at(0, 0, 0, 12, 3), at(0, 4, 0, 12, 3)));
  const r = at(10, -22, 110, 1.2, 0.9);
  check('a point inside a rectangle is inside it', pointInRect(10, -22, r));
  check('and a point two metres off is not', !pointInRect(12, -22, r));
  check('a piece\'s reach is its furthest corner', Math.abs(reachOf(at(0, 0, 0, 6, 8)) - 5) < 0.001, `${reachOf(at(0, 0, 0, 6, 8)).toFixed(3)} m`);
  check('and its corners are four', cornersOf(at(0, 0, 30, 2, 2)).length === 4);
}

// ============================================================================
console.log('\nplans: every rule the audit has, driven the wrong way');
{
  const one = (id, mutate) => { const p = copy(id); mutate(p); return refused({ [id]: p }); };

  check('a place that is not in zones.js is refused',
    /not a place in zones/.test(one('oldcellars', (p) => { p.place = 'nowhereatall'; }) || ''));
  check('two pieces standing in each other are refused',
    /stands in the/.test(one('oldcellars', (p) => { p.pieces.push({ model: 'cart_broken', x: -6, z: -3, yaw: 0 }); }) || ''));
  check('a piece outside the plan\'s radius is refused',
    /outside the plan/.test(one('oldcellars', (p) => { p.pieces.push({ model: 'barrel', x: 40, z: 0, yaw: 0 }); }) || ''));
  check('an arrival inside a footprint is refused',
    /the arrival stands inside/.test(one('oldcellars', (p) => { p.arrival = { x: 0, z: 0, yaw: 0 }; }) || ''));
  check('an arrival outside the radius is refused',
    /the arrival is/.test(one('oldcellars', (p) => { p.arrival = { x: 0, z: -40, yaw: 0 }; }) || ''));
  check('a person standing inside a footprint is refused',
    /is standing inside/.test(one('millrun', (p) => { p.people[0].x = 0; p.people[0].z = 0; }) || ''));
  check('a person outside the radius is refused',
    /stands 90.0 m out/.test(one('millrun', (p) => { p.people[0].x = 90; p.people[0].z = 0; }) || ''));
  check('a person with a role nobody has is refused',
    /which is not one/.test(one('millrun', (p) => { p.people[0].role = 'dragonwrangler'; }) || ''));
  check('a person the story does not have is refused',
    /is not one of the story/.test(one('millrun', (p) => { p.people[0].name = 'nobody'; }) || ''));
  check('a person borrowed from another place is refused',
    /belongs to hearthhome/.test(one('millrun', (p) => { p.people[0].name = 'nan'; p.people[0].role = 'innkeeper'; }) || ''));
  check('a run of something that cannot be run is refused',
    /may be run along a line/.test(one('oldcellars', (p) => { p.runs[0].model = 'inn'; }) || ''));
  check('a run that leaves the plan is refused',
    /ends 40.0 m out/.test(one('oldcellars', (p) => { p.runs[0].to = { x: 40, z: 0 }; }) || ''));
  check('a spawn that is not a monster row is refused',
    /is not a monster row/.test(one('oldcellars', (p) => { p.spawns[0].id = 'giantMouse'; }) || ''));
  check('a spawn outside the radius is refused',
    /spawns 40.0 m out/.test(one('oldcellars', (p) => { p.spawns[0].x = 40; p.spawns[0].z = 0; }) || ''));
  check('a model with no footprint and no builder is refused',
    /has no footprint/.test(one('oldcellars', (p) => { p.pieces[0].model = 'cathedral'; }) || ''));
  check('a piece that says it stands on nothing is refused',
    /and there is none under it/.test(one('oldcellars', (p) => { p.pieces[1].on = 'inn'; }) || ''));
  check('a ground treatment that is not one is refused',
    /is not a ground treatment/.test(one('oldcellars', (p) => { p.areas[0].kind = 'lava'; }) || ''));
  check('a ground treatment outside the radius is refused',
    /outside the plan/.test(one('oldcellars', (p) => { p.areas[0].points[0] = [40, 40]; }) || ''));
  check('a plan with no radius is refused',
    /has no radius/.test(one('oldcellars', (p) => { delete p.radius; }) || ''));
  check('a plan with no arrival is refused',
    /has no arrival/.test(one('oldcellars', (p) => { delete p.arrival; }) || ''));
  check('a plan that says nothing about itself is refused',
    /says nothing about itself/.test(one('oldcellars', (p) => { p.notes = 'a place'; }) || ''));
  check('an em dash is refused',
    /em dash/.test(one('oldcellars', (p) => { p.notes = p.notes.replace(' with ', ' — '); }) || ''));
  check('a plan under the wrong key is refused',
    /calls itself/.test(refused({ wrongkey: copy('oldcellars') }) || ''));
  check('two plans for one place are refused',
    /the second plan for the place/.test(refused({ oldcellars: copy('oldcellars'), millrun: { ...copy('millrun'), place: 'oldcellars' } }) || ''));
  check('and one good plan on its own still passes', refused({ oldcellars: copy('oldcellars') }) === null);
}

// ============================================================================
console.log('\nplans: what the nine hold');
{
  const rows = [];
  for (const id of PLAN_IDS) {
    const p = PLANS[id];
    let segs = 0;
    for (const r of p.runs || []) segs += Math.max(1, Math.round(Math.hypot(r.to.x - r.from.x, r.to.z - r.from.z) / RUN_SPAN[r.model]));
    rows.push([id, p.radius, p.pieces.length, (p.runs || []).length, segs, (p.areas || []).length, p.people.length, p.spawns.length]);
  }
  console.log('    place                radius  pieces  runs  segments  areas  people  spawns');
  for (const r of rows) {
    console.log('    ' + String(r[0]).padEnd(20) + String(r[1]).padStart(6) + String(r[2]).padStart(8)
      + String(r[3]).padStart(6) + String(r[4]).padStart(10) + String(r[5]).padStart(7) + String(r[6]).padStart(8) + String(r[7]).padStart(8));
  }
  check('every plan has something in it', rows.every((r) => r[2] > 0));
  check('and the nine hold 175 pieces between them', PLAN_STATS.pieces === 175, `${PLAN_STATS.pieces}`);
}

// ============================================================================
console.log('\nplans: the ground a plan claims, so the dressing knows to stop');
{
  const hh = { sub: 'hearthhome', x: 749, z: 1579 };
  check('the middle of Hearthhome is planned ground', inPlannedPlace(hh, 749, 1579));
  check('and so is the bridge outside its gate', inPlannedPlace(hh, 749 + 44, 1579 - 40));
  check('a hundred metres out is not', !inPlannedPlace(hh, 749 + 100, 1579),
    `the plan reaches ${PLANS.hearthhome.radius} m and keeps ${PLAN_MARGIN} m of margin`);
  check('the very edge of the margin is, and a metre past it is not',
    inPlannedPlace(hh, 749 + 73, 1579) && !inPlannedPlace(hh, 749 + 75, 1579));
  check('a site with no plan claims no ground at all', !inPlannedPlace({ sub: 'cairnfoot', x: 0, z: 0 }, 0, 0));
  check('and neither does nothing', !inPlannedPlace(null, 0, 0) && !inPlannedPlace({ x: 0, z: 0 }, 0, 0));

  // the Standing Hedge is the one that would go wrong quietly
  const ws = { sub: 'waystones', x: 580, z: 1120 };
  const stops = stopsOf(PLANS.waystones, ws);
  check('the Standing Hedge stands in nine places', stops.length === 9);
  check('and the middle of its ring is not one of them', !inPlannedPlace(ws, 580, 1120),
    'the ring is a mile across and its centre is an empty field');
  check('every one of the nine claims its own ground', stops.every((s) => inPlannedPlace(ws, s.x, s.z)));
  check('and the ground between two stones does not belong to either',
    !inPlannedPlace(ws, (stops[0].x + stops[1].x) / 2, (stops[0].z + stops[1].z) / 2));
  check('a plan laid once stands where its site does',
    stopsOf(PLANS.oldcellars, { x: 363, z: 1603 }).length === 1);
  check('insidePlan declines when there is no plan', !insidePlan(null, { x: 0, z: 0 }, 0, 0));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
