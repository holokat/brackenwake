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
  buildCritterModel, critterShapeFor, auditCritterModels, critterModelPlan, measure,
  CRITTER_SHAPE, CRITTER_BODY, CRITTER_TRIANGLE_BUDGET, CLICK_MIN_R, CLICK_MIN_H,
  CRITTER_PARTS, BIRD_PARTS, AIRBORNE_OVER_M,
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

// ===========================================================================
console.log('\nmonster_models: the animals of the world, tier 0');
//
// The user's words were "our world animals like squirrels and deer are not
// targettable and seem to have the old farmstead hardcoded mechanics ... current
// animal models look really bad, including birds". Targetability is proved in
// src/world/fauna.test.mjs, through the real monster runtime. This is the other
// half: the bodies.
{
  const report = auditCritterModels();
  for (const [id, r] of Object.entries(report)) {
    console.log(`       ${id.padEnd(11)} ${String(r.triangles).padStart(4)} tri  ` + Object.entries(r)
      .filter(([k]) => k !== 'triangles').map(([k, v]) => `${k} ${v} m`).join('  '));
  }
  for (const row of critterModelPlan()) {
    if (!row.row) console.log(`       ${row.id}: ${row.why}`);
  }

  check('every tier 0 monster in the roster has a body', MONSTER_LIST.filter((m) => m.tier === 0)
    .every((m) => !!critterShapeFor(m.id)),
    MONSTER_LIST.filter((m) => m.tier === 0 && !critterShapeFor(m.id)).map((m) => m.id).join(', ') || 'all of them');
  check('and every one of them builds through buildMonsterModel, which is what monsters.spawn calls',
    MONSTER_LIST.filter((m) => m.tier === 0).every((m) => {
      const b = buildMonsterModel(m.id);
      if (b) b.dispose();
      return !!b;
    }));
  check('nothing above tier 0 is caught by the critter path', MONSTER_LIST.filter((m) => m.tier > 0)
    .every((m) => critterShapeFor(m.id) === null));
  check('and a critter still has no glb, because these bodies are code',
    ['rabbit', 'deer', 'gull'].every((id) => glbModelFor(id) === null));

  const over = Object.entries(report).filter(([, r]) => r.triangles > CRITTER_TRIANGLE_BUDGET);
  const heaviest = Object.entries(report).sort((a, b) => b[1].triangles - a[1].triangles)[0];
  check(`every animal is under the ${CRITTER_TRIANGLE_BUDGET} triangle budget`, over.length === 0,
    `the heaviest is the ${heaviest[0]} at ${heaviest[1].triangles}`);

  // the two sizes the brief names, measured off the built body
  const deer = buildCritterModel('deer');
  check('a deer stands 1.4 m at the shoulder', Math.abs(measure(deer, 'withers') - 1.40) < 0.1,
    `${measure(deer, 'withers').toFixed(2)} m`);
  check('and it has antlers, which is what makes a deer read as a deer at fifty metres',
    deer.parts.antlers.length === 2 && deer.parts.antlers[0].children.length > 1,
    `${deer.parts.antlers.length} of them, ${deer.parts.antlers[0].children.length} pieces each`);
  const squirrel = buildCritterModel('squirrel');
  check('a squirrel is a quarter of a metre', Math.abs(measure(squirrel, 'length') - 0.25) < 0.04,
    `${measure(squirrel, 'length').toFixed(3)} m`);
  check('and the tail is most of it again, carried up over the back',
    (() => {
      const withTail = new THREE.Box3().setFromObject(squirrel.group);
      return withTail.max.y > measure(squirrel, 'withers') * 1.6;
    })(), `body ${measure(squirrel, 'withers').toFixed(2)} m, whole animal ${squirrel.height.toFixed(2)} m tall`);
  check('and a deer is nearly eight times the squirrel it shares a builder with',
    measure(deer, 'length') / measure(squirrel, 'length') > 6,
    `${(measure(deer, 'length') / measure(squirrel, 'length')).toFixed(1)} times`);

  // feet on the ground, every one of them, which was the settle
  const off = [];
  for (const id of Object.keys(CRITTER_SHAPE)) {
    const m = buildCritterModel(id);
    m.group.updateMatrixWorld(true);
    const b = new THREE.Box3().setFromObject(m.group);
    if (Math.abs(b.min.y) > 0.02) off.push(`${id} ${b.min.y.toFixed(3)}`);
    m.dispose();
  }
  check('every animal has its feet on the ground and not through it or over it', off.length === 0, off.join(', '));

  // the click column, and the reason it exists
  const mouse = buildMonsterModel('fieldMouse');
  check('a field mouse is smaller than its own click column, on purpose',
    mouse.radius < CLICK_MIN_R && mouse.height < CLICK_MIN_H,
    `the animal is ${mouse.height.toFixed(3)} m tall and ${mouse.radius.toFixed(3)} m across`);
  check('and the column is the floor, so the smallest animal in the game is still clickable',
    mouse.parts.hit.geometry.parameters.radiusTop === CLICK_MIN_R
    && mouse.parts.hit.geometry.parameters.height === CLICK_MIN_H);
  check('while a deer gets a column its own size, not a floored one',
    buildMonsterModel('deer').parts.hit.geometry.parameters.height > CLICK_MIN_H * 2);
  mouse.dispose();

  deer.dispose(); squirrel.dispose();
}

// ===========================================================================
console.log('\nmonster_models: an animal, driven the way monsters.js drives one');
{
  const rabbit = buildMonsterModel('rabbit');
  check('it carries the whole contract monsters.js uses',
    ['group', 'parts', 'radius', 'height', 'shape', 'setAnim', 'update', 'dispose'].every((k) => rabbit[k] !== undefined)
    && typeof rabbit.dieDone === 'boolean' && typeof rabbit.anim === 'string',
    `radius ${rabbit.radius.toFixed(2)} m, height ${rabbit.height.toFixed(2)} m`);

  // it bounds, and standing still it does not
  rabbit.setAnim('run');
  let moved = 0;
  const rest = rabbit.parts.legs.map((l) => l.rotation.x);
  for (let i = 0; i < 40; i++) {
    rabbit.update(1 / 60, 4);
    for (let j = 0; j < rabbit.parts.legs.length; j++) moved = Math.max(moved, Math.abs(rabbit.parts.legs[j].rotation.x - rest[j]));
  }
  check('running moves its legs', moved > 0.1, `${(moved * 180 / Math.PI).toFixed(1)} degrees at the hip`);
  let still = 0;
  rabbit.setAnim('idle');
  for (let i = 0; i < 40; i++) {
    rabbit.update(1 / 60, 0);
    for (let j = 0; j < rabbit.parts.legs.length; j++) still = Math.max(still, Math.abs(rabbit.parts.legs[j].rotation.x - rest[j]));
  }
  check('and standing still does not', still < moved * 0.2,
    `${(still * 180 / Math.PI).toFixed(1)} degrees standing against ${(moved * 180 / Math.PI).toFixed(1)} bounding`);

  // a hop leaves the ground, which is what makes a rabbit a rabbit
  rabbit.setAnim('run');
  let high = -Infinity, low = Infinity;
  for (let i = 0; i < 120; i++) { rabbit.update(1 / 60, 4); high = Math.max(high, rabbit.parts.root.position.y); low = Math.min(low, rabbit.parts.root.position.y); }
  check('and a bounding rabbit really comes off the ground', high - low > rabbit.height * 0.06,
    `${((high - low) * 100).toFixed(1)} cm of lift`);

  // the death, which is what monsters.js waits CORPSE_LINGER_S for
  rabbit.setAnim('die');
  check('a death is not done on the first frame', rabbit.dieDone === false);
  for (let i = 0; i < Math.ceil(DIE_SECONDS * 60) + 2; i++) rabbit.update(1 / 60, 0);
  check('and it is done after DIE_SECONDS, the same as every other body',
    rabbit.dieDone === true && Math.abs(rabbit.parts.root.rotation.z - Math.PI / 2) < 0.05,
    `${rabbit.parts.root.rotation.z.toFixed(2)} rad over`);
  rabbit.setAnim('walk');
  check('a dead animal does not get up', rabbit.anim === 'die');
  rabbit.dispose();
  check('dispose empties the group', rabbit.group.children.length === 0);
}

// ===========================================================================
console.log('\nmonster_models: a bird flies, glides and lands');
{
  const gull = buildCritterModel('gull');
  const wingZ = () => gull.parts.wings.map((w) => w.rotation.z);
  const spanNow = () => { gull.group.updateMatrixWorld(true); const b = new THREE.Box3().setFromObject(gull.group); return b.max.x - b.min.x; };

  // perched
  gull.setAltitude(0);
  gull.update(1 / 60, 0);
  const perched = spanNow();
  gull.group.updateMatrixWorld(true);
  const feet = new THREE.Box3().setFromObject(gull.group).min.y;
  check('perched, its feet are on the ground', Math.abs(feet) < 0.02, `${feet.toFixed(3)} m`);
  check('and its wings are folded along its flanks', perched < CRITTER_BODY.gull.span * 0.7,
    `${perched.toFixed(2)} m across, folded`);

  // in the air
  gull.setAltitude(9);
  gull.update(1 / 60, 6);
  const spread = spanNow();
  check('in the air the wings come out to the tabled span',
    Math.abs(spread - CRITTER_BODY.gull.span) < CRITTER_BODY.gull.span * 0.15,
    `${spread.toFixed(2)} m against a tabled ${CRITTER_BODY.gull.span} m`);
  check('which is a good deal wider than folded', spread > perched * 1.4,
    `${perched.toFixed(2)} m folded, ${spread.toFixed(2)} m spread`);

  let beat = 0;
  const z0 = wingZ();
  for (let i = 0; i < 40; i++) {
    gull.update(1 / 60, 6);
    const z = wingZ();
    for (let j = 0; j < z.length; j++) beat = Math.max(beat, Math.abs(z[j] - z0[j]));
  }
  check('IT FLAPS: the wings beat while it is up there', beat > 0.15,
    `${(beat * 180 / Math.PI).toFixed(1)} degrees at the shoulder`);
  check('and the wrist follows the shoulder rather than the wing being a plank',
    gull.parts.wings.every((w) => !!w.userData.wrist),
    'wingL.userData.wrist and wingR.userData.wrist');

  // the glide
  gull.setGlide(1);
  gull.update(1 / 60, 6);
  const g0 = wingZ();
  let held = 0;
  for (let i = 0; i < 40; i++) {
    gull.update(1 / 60, 6);
    const z = wingZ();
    for (let j = 0; j < z.length; j++) held = Math.max(held, Math.abs(z[j] - g0[j]));
  }
  check('IT GLIDES: with the glide on, the beat stops and the wings stay out',
    held < 1e-6 && spanNow() > perched * 1.4,
    `${(held * 180 / Math.PI).toFixed(3)} degrees of beat, ${spanNow().toFixed(2)} m across`);
  gull.setGlide(0);

  // and back down
  gull.setAltitude(0);
  gull.update(1 / 60, 0);
  check('IT LANDS: back on the ground the wings fold again', spanNow() < CRITTER_BODY.gull.span * 0.7,
    `${spanNow().toFixed(2)} m`);
  check('and the legs come back under it rather than staying tucked',
    gull.parts.legs.every((l) => Math.abs(l.rotation.x) < 0.2),
    gull.parts.legs.map((l) => l.rotation.x.toFixed(2)).join(', '));
  check(`the switch is AIRBORNE_OVER_M, and half of it is half a wing`, (() => {
    gull.setAltitude(AIRBORNE_OVER_M / 2);
    gull.update(1 / 60, 4);
    const half = spanNow();
    return half > perched && half < spread;
  })(), `${AIRBORNE_OVER_M} m`);

  // every bird has the parts a flap needs, not just the gull
  for (const id of Object.keys(CRITTER_SHAPE).filter((k) => CRITTER_BODY[CRITTER_SHAPE[k]].shape === 'bird')) {
    const b = buildCritterModel(id);
    const has = BIRD_PARTS.every((p) => b.parts[p] !== undefined) && b.parts.wings.every((w) => w.userData.wrist && w.userData.tips);
    if (!has) check(`${id} has the wing parts`, false);
    b.dispose();
  }
  check('and every bird in the table carries wingL, wingR, a wrist, primaries and a beak', true,
    Object.keys(CRITTER_SHAPE).filter((k) => CRITTER_BODY[CRITTER_SHAPE[k]].shape === 'bird').join(', '));
  gull.dispose();
}

// ===========================================================================
console.log('\nmonster_models: the critter audit, both directions');
//
// WHAT CAN AND CANNOT BE DRIVEN FALSE HERE, said out loud rather than faked.
// `length`, `span` and `stand` are the numbers the geometry is BUILT from, so
// raising one in the table raises the animal with it and the two can never
// disagree by editing the table: those three checks exist to catch a GEOMETRY
// bug, not a typo, and they have already earned their place once (a gull whose
// wings were rotated the wrong way about y measured a 0.19 m span against a
// tabled 1.1 and the check is what found it). The four cases below are the ones
// that can be driven both ways, and each is a real failure mode.
{
  check('the real table passes', typeof auditCritterModels() === 'object');
  let threw = 0;

  const kept = CRITTER_SHAPE.rabbit;
  delete CRITTER_SHAPE.rabbit;                         // a tier 0 row with no body
  try { auditCritterModels(); } catch { threw++; }
  CRITTER_SHAPE.rabbit = kept;

  const keptBody = CRITTER_BODY.deer.body;
  CRITTER_BODY.deer.body = 2.0;                        // a barrel twice as long as the whole deer
  try { auditCritterModels(); } catch { threw++; }
  CRITTER_BODY.deer.body = keptBody;

  const keptRings = CRITTER_BODY.gull.girth;
  CRITTER_BODY.gull.girth = 1.6;                       // a gull as deep as it is long
  try { auditCritterModels(); } catch { threw++; }
  CRITTER_BODY.gull.girth = keptRings;

  BIRD_PARTS.push('feathersOfTheAncients');            // a part nothing carries
  try { auditCritterModels(); } catch { threw++; }
  BIRD_PARTS.pop();

  check('a bodyless row, a stretched barrel, a bloated bird and a missing part all throw',
    threw === 4, `${threw} of 4`);
  check('and the table is whole again', typeof auditCritterModels() === 'object');
  check('a critter shape for an id that is not a monster is refused, not built',
    critterShapeFor('grue') === null && buildCritterModel('grue') === null);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
