// What a plan looks like once it is standing on the real ground.
// Run: node src/world/plan_models.test.mjs
//
// The reason this file exists: `plans.test.mjs` proves the DATA is a village.
// It says nothing at all about whether the village gets built, costs a frame,
// stands on the hill it is on, keeps the names a click needs, or takes the
// user's glb the day it lands. Every one of those is measured here, on the real
// height field at the real world seed, with no renderer.
//
// Nothing is mocked but the scene, which is a THREE.Group, exactly as
// `site_models.test.mjs` does it.

import * as THREE from 'three';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createWorldField } from './field.js';
import { authoredSites, ZONE } from './zones.js';
import { SITE_CELL } from './sitegrid.js';
import {
  buildPlan, drawCallsOf, trisOf, auditPlanModels, runSegments, pieceBody,
  FOOTPRINT, RUN_SPAN, STANDIN, SOLO, PLAN_MAX_DRAWS, PLAN_MAX_MS, DECAL_LIFT, SINK,
  loadProp, hasProp, forgetProp, propUrlFor, propCount,
} from './plan_models.js';
import { PLANS, PLAN_IDS } from '../mmo/plans/index.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

const SEED = 20260904;
const f = createWorldField(SEED, { homeBiome: 'meadow', homeY: -0.3 });
const heightAt = (x, z) => f.heightAt(x, z);
const AUTHORED = Object.fromEntries(authoredSites().map((s) => [s.sub, s]));

/**
 * The row `buildSiteMarker` is handed, for a planned place.
 *
 * Seven of the nine are authored sites and come straight out of `zones.js`. The
 * Beech Hangar and the Kingsroad are subzones and NOT authored sites, because
 * `zones.SITE_KIND` has no entry for the sheet kinds `wild` and `road`. They
 * still have a plan and a centre, so the row is built here from the zone, and
 * `docs/mmo/wiring/P1.md` carries the two lines that would make them real sites.
 */
function siteFor(place) {
  const s = AUTHORED[place] || (() => {
    const zn = ZONE[place];
    return { id: `z:${place}`, zone: 'greenwold', realm: 'greenwold', sub: place, kind: 'landmark', name: zn.name, x: zn.x, z: zn.z, flatR: 0, authored: true };
  })();
  return { ...s, y: heightAt(s.x, s.z), facing: 0, cx: Math.floor(s.x / SITE_CELL), cz: Math.floor(s.z / SITE_CELL) };
}

const meshesOf = (g) => { const out = []; g.traverse((o) => { if (o.isMesh) out.push(o); }); return out; };

// ============================================================================
console.log('plan_models: the tables agree with themselves');
{
  const stats = auditPlanModels();
  check('the audit passes at import', !!stats, `${stats.models} models, ${stats.bodies} bodies, ${stats.runs} runs, ${stats.solo} named through the merge`);
  check('every model with a footprint has a stand-in and the other way round',
    Object.keys(FOOTPRINT).every((id) => !!STANDIN[id]) && Object.keys(STANDIN).every((id) => !!FOOTPRINT[id]));
  check('every run piece is at least as long as the span it covers',
    Object.entries(RUN_SPAN).every(([id, span]) => FOOTPRINT[id][0] >= span - 0.001));
  check('every name kept through the merge is a real model', [...SOLO].every((id) => !!FOOTPRINT[id]));
  // and the audit can fail: three tables broken on purpose
  const broke = (mutate, undo) => { mutate(); let msg = null; try { auditPlanModels(); } catch (e) { msg = e.message; } undo(); return msg; };
  check('a stand-in with no footprint is caught',
    /has a stand-in and no footprint/.test(broke(() => { STANDIN.phantom = { body: 'block', opts: {} }; }, () => { delete STANDIN.phantom; }) || ''));
  check('a footprint with no stand-in is caught',
    /has a footprint and no stand-in/.test(broke(() => { FOOTPRINT.phantom = [1, 1, 1]; }, () => { delete FOOTPRINT.phantom; }) || ''));
  check('a body name that is not one is caught', (() => {
    const was = STANDIN.bench.body; STANDIN.bench.body = 'notabody';
    const msg = broke(() => {}, () => { STANDIN.bench.body = was; });
    return /which is not one/.test(msg || '');
  })());
  check('a run that spans further than its own piece is caught', (() => {
    const was = RUN_SPAN.hedge_4m; RUN_SPAN.hedge_4m = 9;
    const msg = broke(() => {}, () => { RUN_SPAN.hedge_4m = was; });
    return /a fence with gaps in it/.test(msg || '');
  })());
  check('and the real tables still pass afterwards', !!auditPlanModels());
}

// ============================================================================
console.log('\nplan_models: all nine build, and what they cost');
{
  const built = {};
  const rows = [];
  let worstDraws = 0, worstAt = '', slowest = 0, slowAt = '';
  for (const id of PLAN_IDS) {
    const site = siteFor(PLANS[id].place);
    // three builds, the best kept: the first one pays for the JIT and for the
    // height field's own cache filling, and neither of those is what a marker
    // coming into range in a running game costs.
    let ms = Infinity, g = null;
    for (let k = 0; k < 3; k++) {
      const t0 = process.hrtime.bigint();
      g = buildPlan(PLANS[id], site, heightAt);
      ms = Math.min(ms, Number(process.hrtime.bigint() - t0) / 1e6);
    }
    built[id] = g;
    const draws = drawCallsOf(g), tris = trisOf(g);
    rows.push([id, draws, tris, ms]);
    if (draws > worstDraws) { worstDraws = draws; worstAt = id; }
    if (ms > slowest) { slowest = ms; slowAt = id; }
  }
  console.log('    place                draws  triangles     ms');
  for (const [id, d, t, ms] of rows) {
    console.log('    ' + id.padEnd(20) + String(d).padStart(5) + String(t.toLocaleString('en-GB')).padStart(11) + ms.toFixed(1).padStart(7));
  }
  check('every one of the nine builds meshes', rows.every((r) => r[1] > 0));
  check(`no plan costs more than the ${PLAN_MAX_DRAWS} draw budget`, worstDraws <= PLAN_MAX_DRAWS,
    `the worst is ${worstAt} at ${worstDraws}`);
  check('Hearthhome, the largest, is inside the budget', drawCallsOf(built.hearthhome) < PLAN_MAX_DRAWS,
    `${drawCallsOf(built.hearthhome)} draws, ${trisOf(built.hearthhome).toLocaleString('en-GB')} triangles`);
  check('and none of them costs more than PLAN_MAX_MS to build', slowest < PLAN_MAX_MS,
    `the slowest is ${slowAt} at ${slowest.toFixed(1)} ms, warm, of a budget of ${PLAN_MAX_MS}`);

  // ---- every mesh knows what it is
  let untagged = 0, wrongPlan = 0, total = 0, named = 0;
  for (const id of PLAN_IDS) {
    for (const m of meshesOf(built[id])) {
      total++;
      if (!m.userData.site || !m.userData.plan) { untagged++; continue; }
      if (m.userData.plan.id !== id) wrongPlan++;
      if (m.userData.plan.piece) named++;
    }
  }
  check(`all ${total} meshes carry userData.site and userData.plan`, untagged === 0, `${untagged} without`);
  check('and every one of them names its own plan', wrongPlan === 0);
  check(`${named} of them name the building they are`, named > 20);
  check('the site on a mesh is the site the marker was built for',
    meshesOf(built.hearthhome).every((m) => m.userData.site.sub === 'hearthhome'));

  // ---- the two flags the pick already knows how to carry out
  const stones = meshesOf(built.hearthhome).filter((m) => m.userData.waystone);
  const keeps = meshesOf(built.hearthhome).filter((m) => m.userData.keep);
  check('the standing stone carries userData.waystone', stones.length > 0, `${stones.length} meshes`);
  check('and nothing else in the village does', stones.every((m) => m.userData.plan.piece === 'waystone_village'));
  check('the manor carries userData.keep', keeps.length > 0, `${keeps.length} meshes`);
  check('and nothing else in the village does', keeps.every((m) => m.userData.plan.piece === 'manor'));
  check('the flag did not spread over the merge',
    stones.length + keeps.length < meshesOf(built.hearthhome).length / 4,
    `${stones.length + keeps.length} flagged of ${meshesOf(built.hearthhome).length}`);
  const stoneBox = new THREE.Box3().setFromObject(stones[0]);
  const site = siteFor('hearthhome');
  check('and the stone it is on is the one the plan puts at 10, -22',
    Math.abs(stoneBox.getCenter(new THREE.Vector3()).x - (site.x + 10)) < 1.5,
    `${(stoneBox.getCenter(new THREE.Vector3()).x - site.x).toFixed(1)} m east of the middle`);

  // ---- nothing floats
  let floated = 0, worstFall = 0;
  for (const id of PLAN_IDS) {
    const s = siteFor(PLANS[id].place);
    for (const p of PLANS[id].pieces) {
      if (PLANS[id].repeat) break;                 // the ring is measured on its own below
      const ground = heightAt(s.x + p.x, s.z + p.z);
      const b = pieceBody(p.model, p.scale ?? 1);
      const foot = ground - SINK;
      if (foot > ground + 0.01) floated++;
      const fall = Math.abs(ground - foot);
      if (fall > worstFall) worstFall = fall;
      if (!b) floated++;
    }
  }
  check('every piece stands on its own ground and none of them floats', floated === 0,
    `the deepest anything is bedded is ${worstFall.toFixed(2)} m, which is SINK`);

  // ---- the ground treatments sit over the terrain and not in it
  //
  // Measured on Hearthhome's own lanes and wheat, built on their own so that
  // every vertex in the group is a ground vertex and the claim is about all of
  // them and not about a sample that happened to land on one.
  {
    const s2 = siteFor('hearthhome');
    const ground = buildPlan({ ...PLANS.hearthhome, pieces: [], runs: [] }, s2, heightAt);
    let below = 0, above = 0, n = 0, worst = 0;
    for (const m of meshesOf(ground)) {
      const pos = m.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const g = heightAt(x, z);
        n++;
        const d = y - g;
        if (d < 0) below++; else above++;
        if (Math.abs(d - DECAL_LIFT) > worst) worst = Math.abs(d - DECAL_LIFT);
      }
    }
    check(`${n.toLocaleString('en-GB')} ground vertices measured against the terrain under them`, n > 1500);
    check(`every one of them stands ${DECAL_LIFT} m over it`, below === 0 && worst < 0.0011,
      `${above} above, ${below} below, the worst off by ${worst.toFixed(4)} m`);
    check('and the water is flat, which the ground is not',
      (() => {
        const w = buildPlan({ ...PLANS.sunkenchapel, pieces: [], runs: [] }, siteFor('sunkenchapel'), heightAt);
        const ys = new Set();
        for (const m of meshesOf(w)) { const pos = m.geometry.attributes.position; for (let i = 0; i < pos.count; i++) ys.add(Math.round(pos.getY(i) * 1000)); }
        return ys.size === 1;
      })(), 'the flooded meadow is one level over its whole 60 m');
  }
}

// ============================================================================
console.log('\nplan_models: a run lays the right number of pieces for its length');
{
  check('a 40 m wall of 4 m segments is ten', runSegments('flint_wall_4m', 40) === 10);
  check('a 30 m hedgerow of 4 m segments is eight, not seven and a half', runSegments('hedge_4m', 30) === 8);
  check('a 144.22 m road of 2 m slabs is seventy two', runSegments('road_slab_2m', 144.22) === 72);
  check('a run shorter than one piece still lays one', runSegments('flint_wall_4m', 1.2) === 1);
  check('and a model that is not a run lays none', runSegments('inn', 40) === 0);

  // measured on a built run, not asserted: one segment, then ten of them
  const site = siteFor('oldcellars');
  const one = buildPlan({ id: 't', place: 'oldcellars', radius: 40, arrival: { x: 0, z: -30, yaw: 0 }, pieces: [], areas: [], people: [], spawns: [], notes: 'a test wall and nothing else at all', runs: [{ model: 'flint_wall_4m', from: { x: -2, z: 0 }, to: { x: 2, z: 0 } }] }, site, heightAt);
  const ten = buildPlan({ id: 't', place: 'oldcellars', radius: 40, arrival: { x: 0, z: -30, yaw: 0 }, pieces: [], areas: [], people: [], spawns: [], notes: 'a test wall and nothing else at all', runs: [{ model: 'flint_wall_4m', from: { x: -20, z: 0 }, to: { x: 20, z: 0 } }] }, site, heightAt);
  const t1 = trisOf(one), t10 = trisOf(ten);
  check('ten segments cost exactly ten times one', t10 === t1 * 10, `${t1} triangles a segment, ${t10} for ten`);
  const box = new THREE.Box3().setFromObject(ten);
  const len = box.max.x - box.min.x;
  check('and the wall they lay is 40 m long', Math.abs(len - 40) < 0.6, `${len.toFixed(2)} m measured across the built geometry`);
  const boxOne = new THREE.Box3().setFromObject(one);
  check('one segment is 4 m long', Math.abs((boxOne.max.x - boxOne.min.x) - 4) < 0.3, `${(boxOne.max.x - boxOne.min.x).toFixed(2)} m`);

  // every run in the nine, against its own length
  let segs = 0, bad = 0;
  for (const id of PLAN_IDS) for (const r of PLANS[id].runs || []) {
    const len2 = Math.hypot(r.to.x - r.from.x, r.to.z - r.from.z);
    const n = runSegments(r.model, len2);
    segs += n;
    if (Math.abs(n * RUN_SPAN[r.model] - len2) > RUN_SPAN[r.model] / 2 + 0.001) bad++;
  }
  check(`${segs} segments over the nine, every run within half a piece of its own length`, bad === 0);
}

// ============================================================================
console.log('\nplan_models: the Standing Hedge is nine stones and not one');
{
  const site = siteFor('waystones');
  const g = buildPlan(PLANS.waystones, site, heightAt);
  const box = new THREE.Box3().setFromObject(g);
  const across = Math.max(box.max.x - box.min.x, box.max.z - box.min.z);
  check('the ring built is a mile across', Math.abs(across - 1610) < 45, `${across.toFixed(0)} m corner to corner`);
  check('and it says so on the group', g.userData.plan.stops === 9);
  const stones = meshesOf(g).filter((m) => m.userData.waystone);
  check('every stone carries the waystone flag', stones.length > 0, `${stones.length} merged meshes`);
  const single = buildPlan({ ...PLANS.waystones, repeat: undefined }, site, heightAt);
  check('one stone costs a ninth of the nine', Math.abs(trisOf(g) / trisOf(single) - 9) < 0.05,
    `${trisOf(single)} triangles one, ${trisOf(g)} nine`);
  check('a plan with no repeat is laid once', single.userData.plan.stops === 1);
}

// ============================================================================
console.log('\nplan_models: the glb is taken the day it exists, and not before');
{
  // A real glTF binary, hand assembled: one triangle, one buffer, one mesh. It
  // goes through `loadProp`, `GLTFLoader.parse`, the cache and `buildPlan`, so
  // the path the test drives is the path the browser drives.
  const dir = mkdtempSync(join(tmpdir(), 'planprops-'));
  const bin = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const gltf = {
    asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: 'test_bench' }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, mode: 4 }] }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 1, 0] }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: bin.byteLength, target: 34962 }],
    buffers: [{ byteLength: bin.byteLength }],
  };
  const json = Buffer.from(JSON.stringify(gltf), 'utf8');
  const jsonPad = Buffer.concat([json, Buffer.alloc((4 - json.length % 4) % 4, 0x20)]);
  const binBuf = Buffer.from(bin.buffer);
  const binPad = Buffer.concat([binBuf, Buffer.alloc((4 - binBuf.length % 4) % 4, 0)]);
  const head = Buffer.alloc(12);
  head.writeUInt32LE(0x46546C67, 0); head.writeUInt32LE(2, 4);
  head.writeUInt32LE(12 + 8 + jsonPad.length + 8 + binPad.length, 8);
  const cj = Buffer.alloc(8); cj.writeUInt32LE(jsonPad.length, 0); cj.writeUInt32LE(0x4E4F534A, 4);
  const cb = Buffer.alloc(8); cb.writeUInt32LE(binPad.length, 0); cb.writeUInt32LE(0x004E4942, 4);
  const path = join(dir, 'bench.glb');
  writeFileSync(path, Buffer.concat([head, cj, jsonPad, cb, binPad]));

  const site = siteFor('hearthhome');
  const before = buildPlan(PLANS.hearthhome, site, heightAt);
  const benchBefore = meshesOf(before).filter((m) => m.userData.plan.source === 'glb');
  check('with no model on disk every piece is a stand-in', benchBefore.length === 0, `${propCount()} models loaded`);
  check('and the table says so', !hasProp('bench'));

  const missing = await loadProp('bench', join(dir, 'nothing-here.glb'));
  check('asking for a model that is not there is not an error', missing === false && !hasProp('bench'));

  const got = await loadProp('bench', path);
  check('the glb on disk loads', got === true && hasProp('bench'));

  const after = buildPlan(PLANS.hearthhome, site, heightAt);
  const glbMeshes = meshesOf(after).filter((m) => m.userData.plan.source === 'glb');
  check('and the next Hearthhome built takes it instead of the stand-in', glbMeshes.length > 0,
    `${glbMeshes.length} merged mesh carries the model, named ${glbMeshes[0] ? glbMeshes[0].userData.plan.piece : 'nothing'}`);
  check('the piece is in the same place it always was',
    Math.abs(trisOf(after) - trisOf(before)) > 0 && drawCallsOf(after) <= PLAN_MAX_DRAWS,
    `${drawCallsOf(after)} draws with the model in, ${drawCallsOf(before)} without`);
  const body = pieceBody('bench', 1);
  check('pieceBody says which of the two it handed back', body.source === 'glb');

  forgetProp('bench');
  check('and forgetting it puts the stand-in back', !hasProp('bench') && pieceBody('bench', 1).source === 'stand-in');
  check('the url a model is looked for at is the props folder', propUrlFor('inn') === '/models/props/inn.glb');
  rmSync(dir, { recursive: true, force: true });
}

// ============================================================================
console.log('\nplan_models: a plan is built on the ground it really stands on');
{
  // Two different places, two different heights, and the same plan laid at both
  // has to follow each. Driven both ways: the same site twice is identical.
  const a = siteFor('oldcellars');
  const b = { ...a, x: a.x + 400, z: a.z + 400, y: heightAt(a.x + 400, a.z + 400) };
  const ga = buildPlan(PLANS.oldcellars, a, heightAt);
  const gb = buildPlan(PLANS.oldcellars, b, heightAt);
  const ga2 = buildPlan(PLANS.oldcellars, a, heightAt);
  const boxA = new THREE.Box3().setFromObject(ga), boxB = new THREE.Box3().setFromObject(gb);
  const boxA2 = new THREE.Box3().setFromObject(ga2);
  check('the same plan at the same place builds the same thing twice',
    Math.abs(boxA.min.y - boxA2.min.y) < 1e-9 && trisOf(ga) === trisOf(ga2));
  check('and at a different place it sits on that ground instead',
    Math.abs(boxA.min.y - boxB.min.y) > 0.05,
    `${boxA.min.y.toFixed(2)} m here, ${boxB.min.y.toFixed(2)} m four hundred metres away`);
  check('a plan built for a site knows the site',
    ga.userData.site.sub === 'oldcellars' && ga.userData.plan.place === 'oldcellars');
  check('buildPlan declines something that is not a plan',
    buildPlan(null, a, heightAt) === null && buildPlan({ id: 'x' }, a, heightAt) === null);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
