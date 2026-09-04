// The models, and the validator that guards them. Run: node src/game/models.test.mjs
//
// Two halves. The first runs tools/validate-glb.mjs over every shipped glb and
// then over four DELIBERATELY BROKEN copies of one, because a validator that
// has only ever said yes has not been tested. Each break has to fail the one
// check it is aimed at and leave the others passing, or the check is catching
// something other than what it claims to.
//
// The second half checks that models.js and the files agree: every clip name
// the game will ask for exists in the file, and every bone partsLike() hands
// back is a real joint in that model's skin. Those are the two places where a
// rename in Blender would go quiet.

import { validateAll, validateBuffer, validateFile, parseGLB, packGLB, SPECS, MODEL_DIR } from '../../tools/validate-glb.mjs';
import { locomotionWeights, locomotionRates, SPEEDS, RIGS, CLIPS, clipsFor, MODEL_IDS, LOCOMOTION, FAMILY_MODEL, modelForFamily, clipAlias } from './models.js';
import { existsSync } from 'node:fs';
import { instantiate } from './models.js';
import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };
const near = (a, b, e) => Math.abs(a - b) <= e;
const failedNames = (r) => r.checks.filter((c) => !c.ok).map((c) => c.name);

console.log('models: every shipped glb against its spec');
const { results, unknown, expected } = validateAll();
check('every model in SPECS is on disk', expected.length === 0, expected.length ? `missing ${expected.join(', ')}` : `${results.length} files`);
check('no glb in the folder is unspecified', unknown.length === 0, unknown.join(', ') || 'none');
for (const r of results) {
  check(r.name, r.ok, r.ok
    ? `${r.stats.triangles} tris, ${r.stats.bones} bones, ${(r.stats.bytes / 1024).toFixed(0)} KB`
    : failedNames(r).join('; '));
}
check('every model is under 300 KB', results.every((r) => r.stats.bytes < 300 * 1024),
  results.map((r) => (r.stats.bytes / 1024).toFixed(0)).sort((a, b) => b - a)[0] + ' KB is the largest');

console.log('\nmodels: the validator says no when it should');
const SUBJECT = 'human-medium';
const raw = readFileSync(join(MODEL_DIR, SUBJECT + '.glb'));
const spec = SPECS[SUBJECT];
const good = validateBuffer(raw, spec, SUBJECT);
check('the untouched file passes every check', good.ok, `${good.checks.length} checks`);

// a validator has to survive a file it cannot parse at all
check('a file that is not a glb is rejected, not thrown',
  validateBuffer(Buffer.from('not a model at all'), spec, 'junk').ok === false);

function broken(mutate) {
  const { json, bin } = parseGLB(raw);
  const copy = JSON.parse(JSON.stringify(json));
  mutate(copy);
  return validateBuffer(packGLB(copy, bin), spec, SUBJECT);
}

const withCamera = broken((j) => {
  j.cameras = [{ type: 'perspective', perspective: { yfov: 0.8, znear: 0.1 } }];
  j.nodes.push({ name: 'Camera', camera: 0 });
  j.scenes[0].nodes.push(j.nodes.length - 1);
});
check('a camera fails the file', withCamera.ok === false, failedNames(withCamera).join('; '));
check('a camera fails ONLY the camera check', failedNames(withCamera).join() === 'no cameras or lights');

const renamed = broken((j) => {
  j.animations.find((a) => a.name === 'walk').name = 'stroll';
});
check('a renamed clip fails the file', renamed.ok === false, failedNames(renamed).join('; '));
check('a renamed clip fails the clip name check', failedNames(renamed).includes('every clip present'));
check('a renamed clip also fails the duration check', failedNames(renamed).some((n) => n.startsWith('clip durations')),
  'walk is absent, so its duration cannot be right either');

const stretched = broken((j) => {
  for (const i of j.scenes[0].nodes) {
    const n = j.nodes[i];
    n.scale = [(n.scale ? n.scale[0] : 1) * 2, (n.scale ? n.scale[1] : 1) * 2, (n.scale ? n.scale[2] : 1) * 2];
  }
});
check('a model at twice the size fails the size check', failedNames(stretched).some((n) => n.includes('extent')),
  failedNames(stretched).join('; '));

const lifted = broken((j) => {
  for (const i of j.scenes[0].nodes) {
    const n = j.nodes[i];
    const t = n.translation || [0, 0, 0];
    n.translation = [t[0], t[1] + 0.4, t[2]];
  }
});
check('a model floating 0.4 m off the ground fails the ground check',
  failedNames(lifted).some((n) => n.includes('y = 0')), failedNames(lifted).join('; '));

const slowed = broken((j) => {
  const walk = j.animations.find((a) => a.name === 'walk');
  for (const s of walk.samplers) j.accessors[s.input].max = [5.0];
});
check('a clip that claims the wrong length fails the duration check',
  failedNames(slowed).some((n) => n.startsWith('clip durations')), failedNames(slowed).join('; '));
check('the wrong length fails ONLY the duration check',
  failedNames(slowed).length === 1, failedNames(slowed).join('; '));

console.log('\nmodels: the files and models.js agree');
const byName = new Map(results.map((r) => [r.name, r]));
check('models.js lists exactly the models that exist',
  MODEL_IDS.slice().sort().join() === results.map((r) => r.name).sort().join(),
  MODEL_IDS.length + ' ids');
for (const id of MODEL_IDS) {
  const r = byName.get(id);
  const want = clipsFor(id);
  const have = Object.keys(r.stats.clips);
  check(`${id} carries every clip models.js will ask for`,
    want.every((c) => have.includes(c)), want.join(', '));
}
check('every model can be driven by the locomotion blend tree',
  MODEL_IDS.every((id) => LOCOMOTION.filter((c) => clipsFor(id).includes(c)).length >= 2),
  'idle and walk at least; the humans also have run');

// partsLike hands back bone objects by name. If Blender renamed a bone the
// lookup would quietly return null and poseCharacter style code would move
// nothing, so check the names against the joints actually in each file.
for (const id of MODEL_IDS) {
  const { json } = parseGLB(readFileSync(join(MODEL_DIR, id + '.glb')));
  const joints = new Set(json.skins[0].joints.map((i) => json.nodes[i].name));
  const map = RIGS[id];
  const missing = Object.entries(map).filter(([, bone]) => !joints.has(bone)).map(([k, b]) => `${k}=${b}`);
  check(`${id} has every bone partsLike promises`, missing.length === 0, missing.join(', ') || Object.values(map).join(', '));
}

console.log('\nmodels: the locomotion blend tree');
check('standing still is all idle', locomotionWeights(0).idle === 1);
check('a crawl is still all idle', locomotionWeights(SPEEDS.idle).idle === 1, `at ${SPEEDS.idle} m/s`);
check('walking speed is all walk', locomotionWeights(SPEEDS.walk).walk === 1);
check('running speed is all run', locomotionWeights(SPEEDS.run).run === 1);
check('faster than the run clip is still all run', locomotionWeights(SPEEDS.run * 3).run === 1);
{
  const w = locomotionWeights((SPEEDS.idle + SPEEDS.walk) / 2);
  check('half way to a walk is half idle and half walk', near(w.idle, 0.5, 1e-9) && near(w.walk, 0.5, 1e-9) && w.run === 0,
    `idle ${w.idle.toFixed(2)} walk ${w.walk.toFixed(2)}`);
}
{
  const w = locomotionWeights((SPEEDS.walk + SPEEDS.run) / 2);
  check('half way to a run is half walk and half run', near(w.walk, 0.5, 1e-9) && near(w.run, 0.5, 1e-9) && w.idle === 0,
    `walk ${w.walk.toFixed(2)} run ${w.run.toFixed(2)}`);
}
{
  let worst = 0, sums = true, jump = 0, prev = locomotionWeights(0);
  for (let s = 0; s <= 25; s += 0.05) {
    const w = locomotionWeights(s);
    const total = w.idle + w.walk + w.run;
    if (!near(total, 1, 1e-9)) sums = false;
    worst = Math.max(worst, Math.abs(total - 1));
    jump = Math.max(jump, Math.abs(w.idle - prev.idle), Math.abs(w.walk - prev.walk), Math.abs(w.run - prev.run));
    prev = w;
  }
  check('the weights always sum to one', sums, `worst error ${worst.toExponential(1)}`);
  check('no step of 0.05 m/s moves a weight more than 0.01', jump < 0.01,
    `largest step ${jump.toFixed(4)}, which is what makes it a crossfade and not a switch`);
}
check('a bad speed does not produce a bad weight',
  [NaN, -5, undefined, Infinity].every((v) => {
    const w = locomotionWeights(v);
    return Number.isFinite(w.idle + w.walk + w.run) && near(w.idle + w.walk + w.run, 1, 1e-9);
  }));

console.log('\nmodels: clip rates keep the feet on the ground');
check('the walk clip plays at rate 1 at walking speed', near(locomotionRates(SPEEDS.walk).walk, 1, 1e-9));
check('the run clip plays at rate 1 at running speed', near(locomotionRates(SPEEDS.run).run, 1, 1e-9));
check('half walking speed plays the walk at half rate', near(locomotionRates(SPEEDS.walk / 2).walk, 0.5, 1e-9));
check('a crawl does not slow the clip below rateMin', locomotionRates(0.01).walk === SPEEDS.rateMin, `${SPEEDS.rateMin}x`);
check('a sprint does not speed the clip past rateMax', locomotionRates(200).run === SPEEDS.rateMax, `${SPEEDS.rateMax}x`);

console.log('\nmodels: the shape families monster_models.js asks for');
check('every family maps to a model that exists',
  Object.values(FAMILY_MODEL).every((id) => MODEL_IDS.includes(id)),
  Object.entries(FAMILY_MODEL).map(([f, id]) => `${f}->${id}`).join(' '));
{
  // monster_models.js is agent W2's. Reading its family list here is what stops
  // this mapping quietly pointing at a family nobody uses any more.
  const path = join(HERE, 'monster_models.js');
  if (existsSync(path)) {
    const src = readFileSync(path, 'utf8');
    const block = src.slice(src.indexOf('SHAPE_FOR = {'), src.indexOf('};', src.indexOf('SHAPE_FOR = {')));
    const used = new Set([...block.matchAll(/:\s*'([a-z]+)'/g)].map((m) => m[1]));
    const dead = Object.keys(FAMILY_MODEL).filter((f) => !used.has(f));
    const uncovered = [...used].filter((f) => !FAMILY_MODEL[f]).sort();
    check('no family in FAMILY_MODEL has stopped being used', dead.length === 0,
      dead.length ? `${dead.join(', ')} is no longer in SHAPE_FOR, retarget or drop it` : `${used.size} families in use`);
    check('the families with no Blender model yet are known', uncovered.join() === 'grub,wolf',
      `${uncovered.join(', ')} still wear the placeholder rig`);
  }
}
check('a monster can be asked to run and gets a clip it has', clipAlias('monster-rat', 'run') === 'walk');
check('a human body can be asked to attack and gets its swing', clipAlias('human-heavy', 'attack') === 'swing');
check('a clip that has no counterpart anywhere comes back null', clipAlias('monster-rat', 'nonsense') === null);

console.log('\nmodels: the runtime path, driving the real loader over the real files');
// GLTFLoader fetches by URL. Rather than reach past it with a hand made entry,
// which would be a test path that is not the real path, the loading manager is
// pointed at a host this process serves from disk. Everything after that is
// models.js doing exactly what it does in the browser: fetch, parse, clone the
// skeleton, build a mixer, blend and play.
const HOST = 'http://models.test';
THREE.DefaultLoadingManager.setURLModifier((url) => (url.startsWith('/') ? HOST + url : url));
// three's FileLoader reports progress with a DOM ProgressEvent, which node
// does not have. Without this the load throws instead of resolving.
if (typeof ProgressEvent === 'undefined') {
  globalThis.ProgressEvent = class ProgressEvent {
    constructor(type, init = {}) { Object.assign(this, { type }, init); }
  };
}
const realFetch = globalThis.fetch;
globalThis.fetch = async (req, init) => {
  const url = typeof req === 'string' ? req : req.url;
  if (url.startsWith(HOST)) {
    return new Response(readFileSync(join(HERE, '..', '..', 'public', url.slice(HOST.length))),
      { status: 200, headers: { 'content-type': 'model/gltf-binary' } });
  }
  return realFetch(req, init);
};

const a = instantiate('human-medium');
check('instantiate hands back a group before the file has arrived', a.group.isGroup === true && a.group.children.length === 0);
await a.ready;
check('the group fills in once the file arrives', a.loaded && a.group.children.length === 1);
check('every bone in the file reached the instance', a.bones.size === 19, `${a.bones.size} bones`);
check('the five colour slots arrived as named materials',
  ['skin', 'hair', 'tunic', 'trousers', 'boots'].every((s) => a.materials.has(s)), [...a.materials.keys()].sort().join(', '));
{
  const p = a.partsLike();
  const keys = ['head', 'torso', 'armL', 'armR', 'legL', 'legR'];
  check('partsLike hands back a real bone for all six joints',
    keys.every((k) => p[k] && p[k].isBone), keys.map((k) => `${k}=${p[k] ? p[k].name : 'null'}`).join(' '));
  check('the two arms are different bones', p.armL !== p.armR && p.legL !== p.legR);
  const before = p.armR.rotation.x;
  p.armR.rotation.x = before + 0.5;
  check('a partsLike bone can be posed by hand the way poseCharacter would',
    near(p.armR.rotation.x, before + 0.5, 1e-9));
  p.armR.rotation.x = before;
}
check('a skinned mesh is not frustum culled, so a death animation cannot pop out',
  a.group.children[0].children.concat(a.group.children[0]).some(() => true) &&
  (() => { let ok = true; a.group.traverse((o) => { if (o.isMesh && o.frustumCulled) ok = false; }); return ok; })());

a.setSpeed(SPEEDS.walk);
a.update(1 / 60);
check('at walking speed the walk clip carries all the weight',
  near(a._loco.walk.getEffectiveWeight(), 1, 1e-6) && a._loco.idle.getEffectiveWeight() === 0,
  `idle ${a._loco.idle.getEffectiveWeight().toFixed(2)} walk ${a._loco.walk.getEffectiveWeight().toFixed(2)} run ${a._loco.run.getEffectiveWeight().toFixed(2)}`);
a.setSpeed(SPEEDS.walk / 2);
a.update(1 / 60);
check('all three locomotion clips run at once, which is what makes it a blend tree',
  LOCOMOTION.every((n) => a._loco[n].isRunning()),
  `weights ${LOCOMOTION.map((n) => a._loco[n].getEffectiveWeight().toFixed(2)).join('/')}`);
check('the walk clip slows with the ground speed', near(a._loco.walk.getEffectiveTimeScale(), 0.5, 1e-6),
  `${a._loco.walk.getEffectiveTimeScale().toFixed(2)}x`);

a.setSpeed(SPEEDS.walk);
a.play('swing', { fade: 0.1 });
for (let i = 0; i < 8; i++) a.update(0.02);
check('a one shot ducks the locomotion out', a._locoGain < 0.05 && a._loco.walk.getEffectiveWeight() < 0.05,
  `loco gain ${a._locoGain.toFixed(3)} after 0.16 s of a 0.1 s fade`);
check('the one shot itself is playing', a._actions.get('swing').isRunning() && a._actions.get('swing').getEffectiveWeight() > 0.9);
for (let i = 0; i < 40; i++) a.update(0.02);
check('the locomotion comes back when the one shot ends', a._oneShot === null && a._locoGain > 0.95,
  `loco gain ${a._locoGain.toFixed(3)} 0.96 s after a 0.5 s clip started`);
a.play('die');
for (let i = 0; i < 100; i++) a.update(0.02);
check('die holds on the ground instead of standing back up', a._oneShot !== null && a._locoGain < 0.05,
  'clampWhenFinished, and the locomotion stays out');

{
  const tunic = a.materials.get('tunic');
  const was = tunic.color.getHex(), wasVC = tunic.vertexColors;
  check('a material arrives white with the palette in the vertex colours', was === 0xffffff && wasVC === true,
    `#${tunic.color.getHexString()}, vertexColors ${wasVC}`);
  a.setTint('tunic', 0x7a3b2e);
  check('setTint replaces the slot colour exactly', tunic.color.getHex() === 0x7a3b2e && tunic.vertexColors === false,
    `#${tunic.color.getHexString()}, vertex colours off so the flat colour is not multiplied by the wool green`);
  a.setTint('tunic', 0x7a3b2e, { mode: 'multiply' });
  check('multiply mode keeps the vertex colours', tunic.vertexColors === true);
  a.setTint('tunic', null);
  check('setTint(slot, null) puts the model back as it shipped', tunic.color.getHex() === was && tunic.vertexColors === wasVC);
  check('tinting one slot leaves the others alone', a.materials.get('boots').color.getHex() === 0xffffff);
}
{
  const b = instantiate('human-medium');
  await b.ready;
  check('two instances of one model do not share materials', b.materials.get('tunic') !== a.materials.get('tunic'));
  check('two instances of one model do not share a mixer', b.mixer !== a.mixer);
  b.setTint('tunic', 0x123456);
  check('tinting one instance does not tint the other', a.materials.get('tunic').color.getHex() === 0xffffff,
    `the other is still #${a.materials.get('tunic').color.getHexString()}`);
  b.dispose();
  check('dispose empties the group', b.group.children.length === 0);
}

{
  // A monster has no run clip. Without the fold in applyLocomotion every weight
  // would land on an action that does not exist and the animal would freeze.
  const wolfish = instantiate('monster-rat');
  await wolfish.ready;
  check('a monster has no run action to blend to', wolfish._loco.run === undefined,
    `it has ${Object.keys(wolfish._loco).join(', ')}`);
  wolfish.setSpeed(SPEEDS.run);
  wolfish.update(1 / 60);
  const total = LOCOMOTION.reduce((s, n) => s + (wolfish._loco[n] ? wolfish._loco[n].getEffectiveWeight() : 0), 0);
  check('at running speed a monster still has a clip playing at full weight', near(total, 1, 1e-6),
    `walk ${wolfish._loco.walk.getEffectiveWeight().toFixed(2)} at ${wolfish._loco.walk.getEffectiveTimeScale().toFixed(2)}x, total ${total.toFixed(2)}`);
  check('and the walk runs faster to cover the ground', wolfish._loco.walk.getEffectiveTimeScale() > 1.5,
    `${wolfish._loco.walk.getEffectiveTimeScale().toFixed(2)}x`);
  wolfish.dispose();
}

for (const id of MODEL_IDS) {
  const inst = instantiate(id);
  await inst.ready;
  const clips = clipsFor(id);
  const played = clips.every((c) => { inst.play(c); return true; });
  inst.update(0.02);
  const parts = inst.partsLike();
  check(`${id} loads, poses and plays every one of its clips`,
    inst.loaded && played && Object.values(parts).every((b) => b && b.isBone),
    `${inst.bones.size} bones, ${inst.materials.size} slots, ${clips.length} clips`);
  inst.dispose();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
