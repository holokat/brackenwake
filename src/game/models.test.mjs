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

import { validateAll, validateBuffer, validateFile, parseGLB, packGLB, SPECS, MODEL_DIR, readBank } from '../../tools/validate-glb.mjs';
import {
  locomotionWeights, locomotionRates, SPEEDS, RIGS, CLIPS, clipsFor, MODEL_IDS, LOCOMOTION,
  FAMILY_MODEL, modelForFamily, clipAlias, STUDIO_MOVES, STUDIO_ALIAS, MODEL_BANK,
  familyOf, contractFor, registerModel, movesFor, moveInfo, abilityMoves, PLAYER_MODEL_IDS,
  boneKey,
} from './models.js';
import { existsSync } from 'node:fs';
import { instantiate } from './models.js';
import * as THREE from 'three';
import { ABILITIES_BY_ID } from '../mmo/abilities.js';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };
const near = (a, b, e) => Math.abs(a - b) <= e;
const failedNames = (r) => r.checks.filter((c) => !c.ok).map((c) => c.name);

console.log('models: every shipped glb against its spec');
const { results, unknown, expected, pending } = validateAll();
check('every model this repo builds is on disk', expected.length === 0, expected.length ? `missing ${expected.join(', ')}` : `${results.length} files`);
check('no glb in the folder is unspecified', unknown.length === 0, unknown.join(', ') || 'none');
if (pending.length) console.log(`  note  ${pending.join(', ')} are specified and not delivered yet; every check that needs the file is skipped and said so`);
for (const r of results) {
  check(r.name, r.ok, r.ok
    ? `${r.stats.triangles} tris, ${r.stats.bones} bones, ${(r.stats.bytes / 1024).toFixed(0)} KB`
    : failedNames(r).join('; '));
}
// The budget is per model now that two of them are textured studio bodies:
// SPECS.bytes, defaulting to 300 KB, and the validator enforces it.
check('every model is inside its own byte budget',
  results.every((r) => r.stats.bytes < ((SPECS[r.name] || {}).bytes || 300 * 1024)),
  results.map((r) => `${r.name} ${(r.stats.bytes / 1024).toFixed(0)}`).sort((a, b) => parseFloat(b.split(' ')[1]) - parseFloat(a.split(' ')[1]))[0] + ' KB is the largest');

/** Which of MODEL_IDS have actually been delivered. */
const onDisk = (id) => existsSync(join(MODEL_DIR, id + '.glb'));
const READY = MODEL_IDS.filter(onDisk);
const LATE = MODEL_IDS.filter((id) => !onDisk(id));

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

// The joint name check changed meaning: a name three REWRITES is fine, because
// every lookup goes through the same sanitiser, and what is not fine is a name
// that sanitises to nothing or two that sanitise to one string. So both have to
// be driven, or the check would only ever have been seen to say yes.
const dotted = broken((j) => {
  const joints = j.skins[0].joints;
  j.nodes[joints[1]].name = 'upperarm.L';
});
check('a bone renamed the way Blender writes a mirror still passes, because the lookup sanitises too',
  dotted.ok === true, failedNames(dotted).join('; ') || 'every check still passes');

const collided = broken((j) => {
  const joints = j.skins[0].joints;
  const first = j.nodes[joints[1]].name;
  j.nodes[joints[2]].name = first + '.';
});
check('but two bones that sanitise to ONE name fail the file', collided.ok === false,
  failedNames(collided).join('; '));
check('and they fail the joint name check and nothing else',
  failedNames(collided).join() === 'joint names survive three', failedNames(collided).join('; '));

const nameless = broken((j) => {
  const joints = j.skins[0].joints;
  j.nodes[joints[3]].name = '...';
});
check('a bone whose name sanitises to nothing at all fails it too',
  failedNames(nameless).includes('joint names survive three'), failedNames(nameless).join('; '));

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
check('models.js lists exactly the models that exist or are specified',
  MODEL_IDS.slice().sort().join() === [...results.map((r) => r.name), ...pending].sort().join(),
  `${MODEL_IDS.length} ids, ${results.length} on disk, ${pending.length} pending`);
check('every id models.js lists has a spec in the validator',
  MODEL_IDS.every((id) => !!SPECS[id]), MODEL_IDS.filter((id) => !SPECS[id]).join(', ') || `${MODEL_IDS.length} ids`);
for (const id of READY) {
  const r = byName.get(id);
  const want = clipsFor(id);
  // where the motion is in a bank, that is where the clips are
  const spec = SPECS[id] || {};
  const bank = spec.bank ? readBank(spec.bank) : null;
  const have = bank ? Object.keys(bank.durations) : Object.keys(r.stats.clips);
  check(`${id} carries every clip models.js will ask for`,
    want.every((c) => have.includes(c)),
    bank ? `${want.length} moves, from ${spec.bank}` : want.join(', '));
}
check('every model can be driven by the locomotion blend tree',
  MODEL_IDS.every((id) => LOCOMOTION.filter((c) => clipsFor(id).includes(c)).length >= 2),
  'idle and walk at least; the humans also have run');

// partsLike hands back bone objects by name. If Blender renamed a bone the
// lookup would quietly return null and poseCharacter style code would move
// nothing, so check the names against the joints actually in each file.
//
// dragon-hatchling had no RIGS entry while its 97 joints were nobody's to map,
// because a map written without the file in front of you is a map that points
// at bones that may not exist. It has one now, and it is checked here like
// every other. Nothing is meant to be without one any more, so an id that has
// none is a body somebody forgot rather than a body that was left alone.
//
// The names are matched THROUGH boneKey, the same function GLTFLoader put every
// node name through on the way in. A table naming `wing_upper.L` and a file
// carrying `wing_upperL` are the same bone; a table naming `wing_upperQ` is
// not, and neither form would find it.
const NO_POSE_MAP = [];
check('every model has a partsLike map now that the hatchling has one',
  MODEL_IDS.filter((id) => !RIGS[id]).join() === NO_POSE_MAP.join(),
  MODEL_IDS.filter((id) => !RIGS[id]).join(', ') || `all ${MODEL_IDS.length} have one`);
for (const id of READY) {
  const { json } = parseGLB(readFileSync(join(MODEL_DIR, id + '.glb')));
  const joints = new Set(json.skins[0].joints.map((i) => boneKey(json.nodes[i].name)));
  const map = RIGS[id];
  if (!map) {
    check(`${id} is a real skin with joints, even with no partsLike map`, joints.size > 0, `${joints.size} joints`);
    continue;
  }
  const missing = Object.entries(map).filter(([, bone]) => !joints.has(boneKey(bone))).map(([k, b]) => `${k}=${b}`);
  check(`${id} has every bone partsLike promises`, missing.length === 0, missing.join(', ') || Object.values(map).join(', '));
}
check('boneKey is the loader\'s own sanitiser, so a dotted name and a flat one are one bone',
  boneKey('wing_upper.L') === 'wing_upperL' && boneKey('wing_upperL') === 'wing_upperL'
  && boneKey('Dragon_eyelids.L') === 'Dragon_eyelidsL' && boneKey('a b') === 'a_b',
  'wing_upper.L, Dragon_eyelids.L and "a b" all come out the way three has them');

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
check('a clip authored at its own travel speed plays at rate 1 at that speed',
  near(locomotionRates(1.18, { walk: 1.18, run: 2.45 }).walk, 1, 1e-9)
  && near(locomotionRates(2.45, { walk: 1.18, run: 2.45 }).run, 1, 1e-9),
  'the studio walk covers 1.18 m/s and the run 2.45');
check('half that speed halves the rate', near(locomotionRates(0.59, { walk: 1.18 }).walk, 0.5, 1e-9));
check('a travel speed of zero or nonsense falls back to the game speed',
  locomotionRates(SPEEDS.walk, { walk: 0 }).walk === 1 && locomotionRates(SPEEDS.walk, { walk: NaN }).walk === 1,
  'so a bank with a field missing is the old behaviour, not a frozen leg');
check('no travel table at all is exactly what it was before',
  JSON.stringify(locomotionRates(5)) === JSON.stringify(locomotionRates(5, null)));

console.log('\nmodels: the studio bodies, their bank and the alias table');
check('models.js and the validator agree on the 36 moves',
  STUDIO_MOVES.length === Object.keys(SPECS['human-male'].clips).length
  && STUDIO_MOVES.every((m) => m in SPECS['human-male'].clips),
  `${STUDIO_MOVES.length} moves, ${Object.keys(SPECS['human-male'].clips).length} in the spec`);
check('every contract name a human is asked for maps to a move the bank has',
  CLIPS.human.every((c) => STUDIO_MOVES.includes(STUDIO_ALIAS[c])),
  CLIPS.human.map((c) => `${c}->${STUDIO_ALIAS[c]}`).join(' '));
check('and the monster vocabulary reaches one too, the way clipAlias always allowed',
  ['attack', 'special'].every((c) => STUDIO_MOVES.includes(STUDIO_ALIAS[c])),
  `attack->${STUDIO_ALIAS.attack} special->${STUDIO_ALIAS.special}`);
check('the two studio bodies are the two that fetch a bank',
  Object.keys(MODEL_BANK).sort().join() === 'human-female,human-male', Object.keys(MODEL_BANK).join(', '));
check('and both banks are asked for by a path the site serves',
  Object.values(MODEL_BANK).every((u) => u.startsWith('/animations/') && u.endsWith('.json')),
  Object.values(MODEL_BANK).join(' '));
check('every player body is a human body models.js knows',
  PLAYER_MODEL_IDS.every((id) => MODEL_IDS.includes(id) && familyOf(id) === 'human'), PLAYER_MODEL_IDS.join(', '));
check('the hatchling is its own family with its own sixteen clips',
  familyOf('dragon-hatchling') === 'dragon' && contractFor('dragon-hatchling').length === 16,
  contractFor('dragon-hatchling').join(', '));
check('a dragon asked for a swing gets nothing rather than the wrong clip',
  clipAlias('dragon-hatchling', 'swing') === null && clipAlias('dragon-hatchling', 'idle') === 'idle');
for (const id of ['human-male', 'human-female']) {
  const bank = readBank(SPECS[id].bank);
  if (!bank || bank.broken) {
    console.log(`  note  ${SPECS[id].bank} is not on disk yet, so the alias table was checked against the contract only`);
    continue;
  }
  check(`${id}'s bank really carries every move the alias table points at`,
    CLIPS.human.every((c) => STUDIO_ALIAS[c] in bank.durations),
    CLIPS.human.map((c) => STUDIO_ALIAS[c]).join(', '));
  // The bank was authored in kebab and abilities.js writes camelCase, so the
  // match is made on letters and digits only. An ability id in the bank that
  // matches nothing in the game is a move nothing will ever ask for.
  const canon = (s) => String(s).replace(/[^a-z0-9]+/gi, '').toLowerCase();
  const known = new Set(Object.keys(ABILITIES_BY_ID).map(canon));
  const stray = Object.keys(bank.abilities).filter((a) => !known.has(canon(a)));
  check(`${id}'s bank names abilities the game has`, stray.length === 0,
    stray.length ? `${stray.join(', ')} match no ABILITIES id` : `${Object.keys(bank.abilities).length} abilities`);
  const badMove = [];
  for (const [a, def] of Object.entries(bank.abilities)) {
    for (const m of (def.moves || [])) if (!(m in bank.durations)) badMove.push(`${a}:${m}`);
  }
  check(`${id}'s abilities only name moves the bank carries`, badMove.length === 0,
    badMove.join(', ') || `${Object.keys(bank.abilities).length} abilities`);
}

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
// Two URLs are served from memory rather than from disk: a body that is the
// real human-medium glb under another name, and a two clip bank beside it.
// That is a studio body in every way that models.js can tell, and it is how
// the bank path is driven end to end without waiting for the real files.
const SERVED = new Map();
// The studio bodies are textured, and that path in GLTFLoader wants three
// browser globals. Without them the load rejects and every check that needs
// one of those bodies quietly does not run.
const { installTextureStubs } = await import('../../tools/test-glb-env.mjs');
installTextureStubs();
const realFetch = globalThis.fetch;
globalThis.fetch = async (req, init) => {
  const url = typeof req === 'string' ? req : req.url;
  if (url.startsWith(HOST)) {
    const path = url.slice(HOST.length);
    if (SERVED.has(path)) {
      const [body, type] = SERVED.get(path);
      return new Response(body, { status: 200, headers: { 'content-type': type } });
    }
    return new Response(readFileSync(join(HERE, '..', '..', 'public', path)),
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

for (const id of READY) {
  const inst = instantiate(id);
  await inst.ready;
  const clips = clipsFor(id);
  const played = clips.every((c) => { inst.play(c); return true; });
  inst.update(0.02);
  const parts = inst.partsLike();
  const posed = RIGS[id] ? Object.values(parts).every((b) => b && b.isBone) : inst.bones.size > 0;
  check(`${id} loads, poses and plays every one of its clips`,
    inst.loaded && played && posed,
    `${inst.bones.size} bones, ${inst.materials.size} slots, ${clips.length} clips`);
  inst.dispose();
}
if (LATE.length) console.log(`  note  ${LATE.join(', ')} were not driven: no file on disk`);

// ===========================================================================
console.log('\nmodels: an external clip bank, through the real loader');
{
  // A body with two clips beside it rather than in it. The glb is the real
  // human-medium file under another name, so the skin, the bones and the
  // parsing are all real; only the motion is the test's.
  const track = (bone, angle, end) => new THREE.QuaternionKeyframeTrack(
    `${bone}.quaternion`, [0, end],
    [0, 0, 0, 1, ...new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), angle).toArray()]);
  const nod = new THREE.AnimationClip('tiny-idle', 0.5, [track('head', 0.6, 0.5)]);
  const punch = new THREE.AnimationClip('two-handed-strike', 0.4, [track('upperarm_L', 1.1, 0.4)]);
  const bank = {
    version: 1,
    body: 'bank-test',
    fps: 30,
    clips: [THREE.AnimationClip.toJSON(nod), THREE.AnimationClip.toJSON(punch)],
    moves: {
      'tiny-idle': { duration: 0.5, loop: true, travelSpeed: 0, events: [] },
      'two-handed-strike': { duration: 0.4, loop: false, travelSpeed: 0, events: [{ type: 'hit', time: 0.2 }] },
      walk: { duration: 1.0, loop: true, travelSpeed: 1.18, events: [] },
      run: { duration: 0.7, loop: true, travelSpeed: 2.45, events: [] },
    },
    abilities: { 'power-strike': { school: 'warrior', moves: ['two-handed-strike'] } },
  };
  SERVED.set('/models/mmo/bank-test.glb', [readFileSync(join(MODEL_DIR, 'human-medium.glb')), 'model/gltf-binary']);
  SERVED.set('/animations/bank-test.json', [JSON.stringify(bank), 'application/json']);
  registerModel('bank-test', {
    bank: '/animations/bank-test.json',
    // 'attack' is deliberately a name the glb does not carry: it proves the
    // per model table is consulted, and that it wins over the generic one,
    // which would have sent an attack to the body's own 'swing'.
    alias: { attack: 'two-handed-strike', idle: 'tiny-idle' },
    clips: ['tiny-idle', 'two-handed-strike'],
    rig: RIGS['human-medium'],
  });

  check('before the file arrives the model answers with what it promises',
    clipsFor('bank-test').join() === 'tiny-idle,two-handed-strike');
  const inst = instantiate('bank-test');
  await inst.ready;
  check('the body loaded and the bank came with it', inst.loaded === true,
    `${inst.bones.size} bones, ${inst._actions.size} actions`);
  check('both bank clips arrived as actions on the mixer',
    inst._actions.has('tiny-idle') && inst._actions.has('two-handed-strike'),
    [...inst._actions.keys()].sort().join(', '));
  check('and the glb\'s own clips are still there beside them',
    inst._actions.has('walk') && inst._actions.has('die'), `${inst._actions.size} actions in all`);
  check('clipsFor now answers with what really arrived', clipsFor('bank-test').includes('tiny-idle')
    && clipsFor('bank-test').includes('walk'), `${clipsFor('bank-test').length} clips`);

  // A bank clip PLAYS. Measured against the value the clip itself holds at
  // that instant, not against "it moved": the body's own idle moves the head
  // too, and only an exact angle says which clip did it. The locomotion is
  // ducked to zero by then, so what is on the bone is the bank clip and
  // nothing else.
  const xq = (a) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), a);
  const head = inst.bone('head');
  inst.play('tiny-idle', { loop: true, fade: 0.001 });
  for (let i = 0; i < 10; i++) inst.update(0.02);
  const headErr = head.quaternion.angleTo(xq(0.6 * 0.2 / 0.5));
  check('playing a bank clip by its own id puts the bone exactly where the clip says',
    headErr < 0.02 && inst._locoGain < 0.01,
    `head is ${(headErr * 180 / Math.PI).toFixed(2)} degrees off the clip's 13.75 at t = 0.2 s, locomotion gain ${inst._locoGain.toFixed(3)}`);

  const arm = inst.bone('upperarm_L');
  inst.play('two-handed-strike', { fade: 0.001 });
  for (let i = 0; i < 10; i++) inst.update(0.02);
  const armErr = arm.quaternion.angleTo(xq(1.1 * 0.2 / 0.4));
  check('and so does the second one, which is the one an ability would ask for',
    armErr < 0.02, `arm is ${(armErr * 180 / Math.PI).toFixed(2)} degrees off the clip's 31.5 at t = 0.2 s`);

  check('the per model alias table reaches a bank move, and beats the generic one',
    clipAlias('bank-test', 'attack') === 'two-handed-strike'
    && clipAlias('human-medium', 'attack') === 'swing',
    `bank-test attack -> ${clipAlias('bank-test', 'attack')}, human-medium attack -> ${clipAlias('human-medium', 'attack')}`);
  check('a name the body really has is never redirected by the table',
    clipAlias('bank-test', 'idle') === 'idle', 'the glb has its own idle, so the table\'s tiny-idle does not take it');
  check('the bank\'s moves table is readable', moveInfo('bank-test', 'two-handed-strike').duration === 0.4,
    JSON.stringify(moveInfo('bank-test', 'two-handed-strike')));
  check('a move that is not in the bank reads as null', moveInfo('bank-test', 'nonsense') === null);
  check('an ability finds its moves, camelCase or kebab',
    abilityMoves('bank-test', 'power-strike').join() === 'two-handed-strike'
    && abilityMoves('bank-test', 'powerStrike').join() === 'two-handed-strike',
    'abilities.js writes powerStrike, the bank was authored power-strike');
  check('an ability the bank says nothing about comes back empty, not undefined',
    Array.isArray(abilityMoves('bank-test', 'meditate')) && abilityMoves('bank-test', 'meditate').length === 0);

  // travelSpeed off the bank, in the real blend tree
  check('the bank\'s travelSpeed reached the instance',
    inst._travel && inst._travel.walk === 1.18 && inst._travel.run === 2.45, JSON.stringify(inst._travel));
  inst.setSpeed(1.18);
  inst.update(1 / 60);
  check('at the speed the walk was authored for it plays at rate 1',
    near(inst._loco.walk.getEffectiveTimeScale(), 1, 1e-6), `${inst._loco.walk.getEffectiveTimeScale().toFixed(3)}x`);
  inst.setSpeed(SPEEDS.walk);
  inst.update(1 / 60);
  check('at the game\'s walking speed it asks for 5.93x and is held at rateMax',
    near(inst._loco.walk.getEffectiveTimeScale(), SPEEDS.rateMax, 1e-6),
    `${(SPEEDS.walk / 1.18).toFixed(2)}x wanted, ${inst._loco.walk.getEffectiveTimeScale().toFixed(2)}x played`);

  // setTint on a body with no such slot: a no op, and it does not throw
  let threw = null;
  try { inst.setTint('nonesuch', 0x112233); } catch (err) { threw = err; }
  check('setTint on a slot the body does not have is a no op that does not throw', threw === null,
    threw ? threw.message : 'warned once and returned');
  inst.dispose();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
