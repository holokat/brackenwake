// Monster bodies: which are Blender rigs, which are still boxes, and whether
// the swap is invisible to monsters.js. Run: node src/game/monster_models.test.mjs
//
// monsters.js only ever touches `group`, `parts.hit`, `radius`, `height`,
// `shape`, `anim`, `setAnim`, `dieDone`, `update(dt, speed)` and `dispose`.
// Everything here is aimed at one claim: a family gaining a glb changes none
// of those numbers. The models are loaded through the real GLTFLoader over the
// real files, and every check that matters is run BOTH before the files are
// loaded (the box stand-in) and after (the bone rig).

import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');

const HOST = 'http://models.test';
THREE.DefaultLoadingManager.setURLModifier((url) => (url.startsWith('/') ? HOST + url : url));
if (typeof ProgressEvent === 'undefined') {
  globalThis.ProgressEvent = class ProgressEvent {
    constructor(type, init = {}) { Object.assign(this, { type }, init); }
  };
}
const realFetch = globalThis.fetch;
globalThis.fetch = async (req, init) => {
  const url = typeof req === 'string' ? req : req.url;
  if (url.startsWith(HOST)) {
    return new Response(readFileSync(join(ROOT, 'public', url.slice(HOST.length))),
      { status: 200, headers: { 'content-type': 'model/gltf-binary' } });
  }
  return realFetch(req, init);
};

const {
  buildMonsterModel, buildBoxMonster, auditMonsterShapes, shapeFor,
  glbModelFor, monsterModelPlan, monsterModelIds,
  GLB_FAMILY, BOX_ONLY_FAMILIES, STANDIN_FAMILIES, STANDIN_MAX_TIER,
  DIE_SECONDS, TIER_COLOUR,
} = await import('./monster_models.js');
const { MONSTERS, MONSTER_LIST } = await import('../mmo/monsters.js');
const { preloadRigs } = await import('./rig_glb.js');
const { MODEL_IDS, isLoaded } = await import('./models.js');

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };
const boxH = (o) => { const b = new THREE.Box3().setFromObject(o); return b.max.y - b.min.y; };
/** The body only. `parts.hit` is an invisible column and a Box3 counts it. */
const bodyOf = (model) => model.group.children.find((c) => c !== model.parts.hit) || model.group;
const bodyH = (model) => boxH(bodyOf(model));
const live = MONSTER_LIST.filter((m) => m.tier > 0);

// ===========================================================================
console.log('monster_models: which family wears what, and which is still a box');
{
  check('the shape audit still passes', auditMonsterShapes() === true);
  const plan = monsterModelPlan();
  check('every monster above tier 0 is in the plan', plan.length === live.length, `${plan.length} rows`);

  const byWhy = {};
  for (const r of plan) (byWhy[r.why] = byWhy[r.why] || []).push(r.id);
  for (const [why, ids] of Object.entries(byWhy).sort()) console.log(`       ${why}: ${ids.length} - ${ids.join(', ')}`);

  const glb = plan.filter((r) => r.model);
  check('most of the roster wears a Blender body', glb.length > plan.length / 2,
    `${glb.length} of ${plan.length}`);

  // the families that fall back, named, both directions
  const boxFamilies = new Set(plan.filter((r) => !r.model).map((r) => r.shape));
  check('the only families with no model at all are wolf and grub',
    [...boxFamilies].filter((f) => BOX_ONLY_FAMILIES.includes(f)).sort().join() === 'grub,wolf',
    [...boxFamilies].sort().join(', '));
  check('and every wolf and grub falls back, without exception',
    plan.filter((r) => BOX_ONLY_FAMILIES.includes(r.shape)).every((r) => r.model === null),
    plan.filter((r) => BOX_ONLY_FAMILIES.includes(r.shape)).map((r) => r.id).join(', '));

  // the stand-in rule, driven true and false
  const bipeds = plan.filter((r) => r.shape === 'biped');
  const low = bipeds.filter((r) => r.tier <= STANDIN_MAX_TIER);
  const high = bipeds.filter((r) => r.tier > STANDIN_MAX_TIER);
  check(`a biped at tier ${STANDIN_MAX_TIER} or below borrows the heavy human`,
    low.length > 0 && low.every((r) => r.model === 'human-heavy'),
    `${low.length} of them: ${low.map((r) => r.id).join(', ')}`);
  check('and one above it does not, because a 4 m man is a lie about what you are fighting',
    high.length > 0 && high.every((r) => r.model === null),
    `${high.length} of them: ${high.map((r) => `${r.id} tier ${r.tier}`).join(', ')}`);
  check('no boss wears a stand-in body',
    plan.filter((r) => r.tier >= 6).every((r) => r.model === null || !STANDIN_FAMILIES.includes(r.shape)),
    plan.filter((r) => r.tier >= 6).map((r) => `${r.id} ${r.model || 'box'}`).join(', '));

  check('every model the plan names is a model that exists',
    monsterModelIds().every((id) => MODEL_IDS.includes(id)), monsterModelIds().join(', '));
  check('and every family in GLB_FAMILY is a family something actually wears',
    Object.keys(GLB_FAMILY).every((f) => live.some((m) => shapeFor(m.id) === f)),
    Object.keys(GLB_FAMILY).join(', '));
  check('an unknown id has no model rather than a default one', glbModelFor('grue') === null);
  check('and a critter has none either, because fauna.js owns those', glbModelFor('rabbit') === null);
}

// ===========================================================================
console.log('\nmonster_models: the box stand-in, before a single file has arrived');
const BEFORE = new Map();
{
  check('nothing is loaded yet', MODEL_IDS.every((id) => !isLoaded(id)));
  let built = 0;
  for (const m of live) {
    const model = buildMonsterModel(m.id);
    if (!model) { check(`${m.id} builds a body`, false); continue; }
    built++;
    BEFORE.set(m.id, { radius: model.radius, height: model.height, shape: model.shape });
    if (!model.parts.hit) check(`${m.id} has a click column`, false);
    model.dispose();
  }
  check('every monster in the roster builds a body with the files still on the wire',
    built === live.length, `${built} bodies`);

  // the stand-in has to answer the whole contract, or a monster is unkillable
  // for as long as the download takes
  const skel = buildMonsterModel('skeleton');
  check('the stand-in is a box rig inside a glb rig', skel.loaded === false && !!skel.parts.legs,
    `${skel.parts.legs.length} legs on the stand-in`);
  skel.setAnim('walk');
  for (let i = 0; i < 30; i++) skel.update(1 / 60, 3);
  check('and it walks', Math.abs(skel.parts.legs[0].rotation.x) > 0.05, `${skel.parts.legs[0].rotation.x.toFixed(3)} rad`);
  skel.setAnim('die');
  check('a death on the stand-in is not done on the first frame', skel.dieDone === false);
  for (let i = 0; i < Math.ceil(DIE_SECONDS * 60) + 2; i++) skel.update(1 / 60, 0);
  check('and it is done after DIE_SECONDS, which is what monsters.js waits on',
    skel.dieDone === true, `${DIE_SECONDS} s`);
  check('and it toppled', Math.abs(skel.parts.root.rotation.z - Math.PI / 2) < 0.05,
    `${skel.parts.root.rotation.z.toFixed(2)} rad`);
  skel.setAnim('walk');
  check('a dead thing does not get up', skel.anim === 'die');
  skel.dispose();
}

// ===========================================================================
await preloadRigs(monsterModelIds());
console.log('\nmonster_models: the same monsters, with the files in hand');
{
  check('the models monsters ask for are loaded', monsterModelIds().every((id) => isLoaded(id)), monsterModelIds().join(', '));

  let glbCount = 0, boxCount = 0, worstH = 0, worstId = '';
  for (const m of live) {
    const model = buildMonsterModel(m.id);
    const was = BEFORE.get(m.id);
    const wantsGlb = !!glbModelFor(m.id);
    if (wantsGlb) glbCount++; else boxCount++;
    if (model.radius !== was.radius || model.height !== was.height || model.shape !== was.shape) {
      check(`${m.id} keeps the size it had`, false,
        `${was.radius}/${was.height} became ${model.radius}/${model.height}`);
    }
    if (!model.parts.hit) check(`${m.id} still has a click column`, false);
    if (wantsGlb) {
      if (model.loaded !== true) check(`${m.id} is a glb`, false);
      // the box the size came from is gone; what is left stands as tall
      model.group.updateMatrixWorld(true);
      const box = buildBoxMonster(m.id);
      const d = Math.abs(bodyH(model) - box.silhouette);
      if (d > worstH) { worstH = d; worstId = m.id; }
      box.dispose();
    }
    model.dispose();
  }
  check('every monster keeps exactly the radius, height and shape it had as a box',
    true, `${glbCount} glb bodies, ${boxCount} box bodies`);
  check('and every glb stands the same height as the box it replaced',
    worstH < 0.02, `worst ${worstId || 'none'} off by ${worstH.toFixed(4)} m`);
}

// ===========================================================================
console.log('\nmonster_models: a Blender monster, driven the way monsters.js drives one');
{
  const skel = buildMonsterModel('skeleton');
  check('a skeleton is a glb now', skel.loaded === true && skel.shape === 'skeleton');
  check('and it carries the whole contract',
    ['group', 'parts', 'radius', 'height', 'shape', 'setAnim', 'update', 'dispose'].every((k) => skel[k] !== undefined)
    && typeof skel.dieDone === 'boolean' && typeof skel.anim === 'string',
    `radius ${skel.radius.toFixed(2)} m, height ${skel.height.toFixed(2)} m, anim ${skel.anim}`);
  check('the click column is on the group monsters.js positions',
    skel.group.children.includes(skel.parts.hit), `${skel.group.children.length} children`);

  // monsters.js drives it: position, facing, an animation name and a speed
  skel.group.position.set(12, 3, -4);
  skel.group.rotation.y = 1.2;
  skel.setAnim('walk');
  const bone = skel.parts.legL.parent;
  const q0 = bone.quaternion.clone();
  let moved = 0;
  for (let i = 0; i < 30; i++) { skel.update(1 / 60, 3); moved = Math.max(moved, bone.quaternion.angleTo(q0)); }
  check('walking moves its legs', moved > 0.05, `${(moved * 180 / Math.PI).toFixed(1)} degrees at the hip`);
  let stillMoved = 0;
  const stand = buildMonsterModel('skeleton');
  stand.setAnim('idle');
  const b2 = stand.parts.legL.parent, q2 = b2.quaternion.clone();
  for (let i = 0; i < 30; i++) { stand.update(1 / 60, 0); stillMoved = Math.max(stillMoved, b2.quaternion.angleTo(q2)); }
  check('and standing still does not', stillMoved < moved * 0.6,
    `${(stillMoved * 180 / Math.PI).toFixed(1)} degrees standing against ${(moved * 180 / Math.PI).toFixed(1)} walking`);

  skel.setAnim('swing');
  check('a swing is the animation while it runs', skel.anim === 'swing');
  for (let i = 0; i < 50; i++) skel.update(1 / 60, 3);
  check('and the walk comes back after it', skel.anim === 'walk');
  skel.setAnim('run');
  check('asking a monster to run gets something it has, not a frozen pose', skel.anim === 'run');

  // A Box3 over a skinned mesh measures the BIND pose, so the head bone is
  // what says whether the body actually went down.
  skel.setAnim('idle');
  skel.update(1 / 60, 0);
  skel.group.updateMatrixWorld(true);
  // it is standing at y = 3 up there, so measure the head above its own feet
  const headY = () => skel.parts.head.getWorldPosition(new THREE.Vector3()).y - skel.group.position.y;
  const headUp = headY();
  skel.setAnim('die');
  check('a death is not done on the first frame', skel.dieDone === false);
  for (let i = 0; i < Math.ceil(DIE_SECONDS * 60) + 2; i++) skel.update(1 / 60, 0);
  check('and it is done after DIE_SECONDS, exactly as the box rig was',
    skel.dieDone === true, 'so CORPSE_LINGER_S in monsters.js still covers the topple');
  skel.group.updateMatrixWorld(true);
  const headDown = headY();
  check('and the head is on the ground rather than standing to attention',
    headDown < headUp * 0.5,
    `the head fell from ${headUp.toFixed(2)} m to ${headDown.toFixed(2)} m`);
  check('and it stays there rather than standing back up', (() => {
    for (let i = 0; i < 60; i++) skel.update(1 / 60, 0);
    skel.group.updateMatrixWorld(true);
    return headY() < headUp * 0.5;
  })(), 'clampWhenFinished, a second later');
  skel.setAnim('walk');
  check('a dead thing does not get up', skel.anim === 'die');
  skel.dispose(); stand.dispose();
  check('dispose empties the group', skel.group.children.length === 0);
}

// ===========================================================================
console.log('\nmonster_models: the tier is still in the paint');
{
  const tint = (id) => {
    const m = buildMonsterModel(id);
    const out = [];
    m.group.traverse((o) => { if (o.isMesh && o.material && o.material.color) out.push(o.material.color.getHex()); });
    m.dispose();
    return out;
  };
  const t1 = tint('skeleton');                 // tier 1
  const t5 = tint('lich');                     // tier 5, same family
  check('a tier 1 skeleton is washed in the tier 1 colour',
    t1.includes(TIER_COLOUR[1]), `${t1.length} materials, tier colour #${TIER_COLOUR[1].toString(16)}`);
  check('and a tier 5 one in the tier 5 colour, so the danger still reads by colour',
    t5.includes(TIER_COLOUR[5]) && !t5.includes(TIER_COLOUR[1]),
    `#${TIER_COLOUR[5].toString(16)}`);
  const box = buildMonsterModel('wolf');       // a family with no model
  const boxColours = [];
  box.group.traverse((o) => { if (o.isMesh && o.material && o.material.color) boxColours.push(o.material.color.getHex()); });
  check('and a box body is painted the same way it always was',
    boxColours.includes(TIER_COLOUR[MONSTERS.wolf.tier]), `tier ${MONSTERS.wolf.tier}`);
  box.dispose();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
