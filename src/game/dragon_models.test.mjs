// The four bodies, measured. Run: node src/game/dragon_models.test.mjs
//
// Nothing here asserts that a builder exists. Every number is taken off a real
// built body: the triangles counted, the bounding box measured with the wings
// off and again with them spread, the named parts looked up, the textures
// generated and read back byte by byte, and the poser driven through every
// animation it has to see that it moves what it says it moves.
//
// THE LAST SECTION IS THE STUDIO HATCHLING, and it goes through the real
// loader over the real file the way models.test.mjs and rig_glb.test.mjs do:
// node's fetch is pointed at a host this process serves from disk, and after
// that it is GLTFLoader parsing the shipped glb and an AnimationMixer driving
// it. Nothing is stubbed, so a claim about a clip is a claim about the file.
// It runs last on purpose: until it loads, `isLoaded` is false, and the checks
// above it are what proves the code body is what you get without the file.

import * as THREE from 'three';
import {
  buildDragon, buildCodeDragon, auditDragonModels, PROPORTIONS, PALETTE, EYE_GOLD,
  TRIANGLE_BUDGET, REQUIRED_PARTS, FAMILIES, textureSet, TEX_SIZE, tube, pbr,
  CODE_ANIM_ALIAS, DRAGON_MODEL_ID, GLB_AGE, GLB_STATES, GLB_STATE_ALIAS,
  GLB_PARTS, GLB_PARTS_MISSING, GLB_SOCKETS, GLB_WING_CLIPS, GLB_IDLE_VARIATIONS,
  GLB_IDLE_VARY_S, GLB_JAW_OPEN, GLB_TRIANGLE_BUDGET,
  hasGlbDragon, glbState, buildGlbDragon, auditGlbDragon, preloadDragonModel,
} from './dragon_models.js';
import { AGES, AGE_LABEL, stageBody, AIR_ANIMS, OVERLAY_ANIMS, LAND_MS, SHOULDER_ANCHOR } from './dragon.js';
import { countTriangles } from './weapon_models.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };

// ===========================================================================
console.log('\nthe audit that runs at import');
// ===========================================================================
{
  let report = null;
  try { report = auditDragonModels(); } catch (e) { check('the audit passes', false, e.message); }
  if (report) {
    check('the audit reports all four ages', Object.keys(report).join(',') === AGES.join(','), Object.keys(report).join(','));
    for (const age of AGES) {
      const r = report[age];
      console.log(`       ${age.padEnd(10)} ${String(r.triangles).padStart(5)} tris   ${r.length} m long   ${r.height} m tall   ${r.span} m span`);
    }
  }
  check('every age has a proportion row', AGES.every((a) => !!PROPORTIONS[a]));
  check('and a palette', AGES.every((a) => !!PALETTE[a]));
  check('and no row names an age that does not exist',
    Object.keys(PROPORTIONS).every((a) => AGES.includes(a)), Object.keys(PROPORTIONS).join(','));
}

// ===========================================================================
console.log('\nwithout the file, the hatchling is the body built here');
// ===========================================================================
{
  // This runs BEFORE anything loads the glb, which is what makes it a real
  // measurement of the fallback rather than a claim about it.
  check('the studio hatchling is not in the cache yet', hasGlbDragon() === false);
  const m = buildDragon('hatchling');
  check('so buildDragon hands back the code body', m.made === 'code', m.made);
  check('and it is the same object buildCodeDragon builds',
    m.triangles === buildCodeDragon('hatchling').triangles, `${m.triangles} triangles`);
  check('the other three ages are code bodies whatever is in the cache',
    ['drake', 'young', 'dragon'].every((a) => buildDragon(a).made === 'code'));
  m.dispose();
}

// ===========================================================================
console.log('\ntriangles, per age, against the budget');
// ===========================================================================
const built = {};
for (const age of AGES) {
  const m = buildDragon(age);
  built[age] = m;
  const budget = TRIANGLE_BUDGET[age];
  check(`a ${AGE_LABEL[age]} is ${m.triangles} triangles, under ${budget}`, m.triangles <= budget, String(m.triangles));
  check(`and it is not empty either`, m.triangles > 200, String(m.triangles));
  check(`countTriangles agrees with what the model reports`, countTriangles(m.group) === m.triangles);
}
check('the hatchling is under the 1,500 the brief sets it', built.hatchling.triangles < 1500, String(built.hatchling.triangles));
check('and the biggest of the four is under 6,000',
  Math.max(...AGES.map((a) => built[a].triangles)) < 6000, String(Math.max(...AGES.map((a) => built[a].triangles))));
check('a bigger animal costs more triangles than a smaller one',
  AGES.every((a, i) => i === 0 || built[a].triangles >= built[AGES[i - 1]].triangles),
  AGES.map((a) => built[a].triangles).join(','));

// ===========================================================================
console.log('\nthe parts the rest of the game reaches for by name');
// ===========================================================================
for (const age of AGES) {
  const missing = REQUIRED_PARTS.filter((p) => !built[age].parts[p]);
  check(`a ${AGE_LABEL[age]} has every named part`, missing.length === 0, missing.join(','));
}
{
  const p = built.dragon.parts;
  check('there are two wings and they are the left and the right',
    p.wings.length === 2 && p.wings[0] === p.wingL && p.wings[1] === p.wingR);
  check('four legs, front left to back right',
    p.legs.length === 4 && p.legs[0] === p.legFL && p.legs[3] === p.legBR);
  check('every leg has a knee to bend', p.legs.every((l) => !!l.userData.knee));
  check('two eyes, and they are lit from inside',
    p.eyes.length === 2 && p.eyeL.material.emissive.getHex() === new THREE.Color(EYE_GOLD).getHex());
  check('the jaw is a group of its own, so it can open', p.jaw.isObject3D && p.jaw !== p.skull);
  check('and the root is what the poser leans, not the group',
    p.root.parent === built.dragon.group && p.root !== built.dragon.group);
  check('every wing carries its bones and its membrane',
    p.wings.every((w) => w.userData.bones.length >= 4 && !!w.userData.membrane));
  check('and the membrane is double sided and see through',
    p.wingL.userData.membrane.material.side === THREE.DoubleSide
    && p.wingL.userData.membrane.material.transparent === true
    && p.wingL.userData.membrane.material.opacity < 1,
    String(p.wingL.userData.membrane.material.opacity));
}

// ===========================================================================
console.log('\nproportion is the age');
// ===========================================================================
{
  for (const age of AGES) {
    const P = PROPORTIONS[age];
    const sum = P.tail + P.body + P.neck + P.head;
    check(`a ${AGE_LABEL[age]}'s four sections sum to 1`, Math.abs(sum - 1) < 1e-9, sum.toFixed(6));
  }
  check('the hatchling is mostly head: a quarter of it',
    PROPORTIONS.hatchling.head > 0.2 && PROPORTIONS.hatchling.head > PROPORTIONS.dragon.head * 3,
    `${PROPORTIONS.hatchling.head} vs ${PROPORTIONS.dragon.head}`);
  check('and the dragon is mostly neck and tail',
    PROPORTIONS.dragon.neck + PROPORTIONS.dragon.tail > 0.6,
    String(PROPORTIONS.dragon.neck + PROPORTIONS.dragon.tail));
  check('the neck grows at every step',
    AGES.every((a, i) => i === 0 || PROPORTIONS[a].neck > PROPORTIONS[AGES[i - 1]].neck),
    AGES.map((a) => PROPORTIONS[a].neck).join(','));
  check('the head shrinks at every step',
    AGES.every((a, i) => i === 0 || PROPORTIONS[a].head < PROPORTIONS[AGES[i - 1]].head),
    AGES.map((a) => PROPORTIONS[a].head).join(','));

  check('a hatchling\'s wings are stubby: a span no wider than it is long',
    built.hatchling.width <= built.hatchling.length * 1.15,
    `${built.hatchling.width.toFixed(2)} span vs ${built.hatchling.length.toFixed(2)} long`);
  check('a dragon\'s wings are wider than the animal is long',
    built.dragon.width > built.dragon.length,
    `${built.dragon.width.toFixed(2)} span vs ${built.dragon.length.toFixed(2)} long`);
  for (const age of AGES) {
    const want = stageBody(age).length;
    check(`a ${AGE_LABEL[age]} really measures ${want} m nose to tail`,
      Math.abs(built[age].length - want) <= want * 0.08, `${built[age].length.toFixed(2)} m`);
  }
  for (const age of AGES) {
    const want = stageBody(age).height;
    check(`and it really stands ${want} m tall`,
      Math.abs(built[age].height - want) <= want * 0.15, `${built[age].height.toFixed(2)} m`);
  }
  check('the feet are on the ground, not under it', AGES.every((age) => {
    const box = new THREE.Box3().setFromObject(built[age].group);
    return Math.abs(box.min.y) < stageBody(age).height * 0.12;
  }));
}

// ===========================================================================
console.log('\nthe textures, generated and read back');
// ===========================================================================
{
  const names = Object.keys(FAMILIES);
  check('there are four families: scale, belly, horn and membrane',
    names.join(',') === 'scale,belly,horn,membrane', names.join(','));
  for (const n of names) {
    const set = textureSet(n);
    check(`${n} makes an albedo, a packed roughness map and a normal map`,
      !!set.map && !!set.ormMap && !!set.normalMap);
    check(`and all three are ${TEX_SIZE} squared`,
      set.map.image.width === TEX_SIZE && set.normalMap.image.height === TEX_SIZE);
    const data = set.map.image.data;
    let lo = 255, hi = 0;
    for (let i = 0; i < data.length; i += 4) { if (data[i] < lo) lo = data[i]; if (data[i] > hi) hi = data[i]; }
    check(`${n} has real variation in it and is not a flat colour`, hi - lo > 30, `${lo}..${hi}`);
    const nrm = set.normalMap.image.data;
    let flat = 0;
    for (let i = 0; i < nrm.length; i += 4) if (nrm[i] === 128 && nrm[i + 1] === 128) flat++;
    check(`${n}'s normal map is not blank`, flat < (nrm.length / 4) * 0.5, `${flat} flat texels of ${nrm.length / 4}`);
  }
  check('the same family twice is the same texture object, so a hundred dragons share one',
    textureSet('scale') === textureSet('scale'));
  check('a family that does not exist throws rather than shipping a blank',
    (() => { try { textureSet('feathers'); return false; } catch { return true; } })());
  check('the scale family is deterministic: the same u,v gives the same sample',
    FAMILIES.scale(0.3, 0.7).l === FAMILIES.scale(0.3, 0.7).l);
  check('materials are cached by look', pbr('scale', 0x445544, { rough: 1 }) === pbr('scale', 0x445544, { rough: 1 }));
  check('and a different colour is a different material', pbr('scale', 0x445544) !== pbr('scale', 0x556644));
}

// ===========================================================================
console.log('\nthe tube builder');
// ===========================================================================
{
  const g = tube(6, [{ z: 0, y: 0, r: 1 }, { z: 2, y: 0, r: 0.5 }]);
  const tris = g.index.count / 3;
  check('a six sided tube of two rings is 12 wall triangles plus two caps of 6',
    tris === 24, String(tris));
  check('it has positions, uvs and normals', !!g.getAttribute('position') && !!g.getAttribute('uv') && !!g.getAttribute('normal'));
  g.computeBoundingBox();
  check('and it runs along +z, from the first station to the last',
    Math.abs(g.boundingBox.min.z) < 1e-6 && Math.abs(g.boundingBox.max.z - 2) < 1e-6,
    `${g.boundingBox.min.z} .. ${g.boundingBox.max.z}`);
  const open = tube(6, [{ z: 0, y: 0, r: 1 }, { z: 2, y: 0, r: 0.5 }], { capBack: false, capFront: false });
  check('and an uncapped tube is only the wall', open.index.count / 3 === 12, String(open.index.count / 3));
  const flat = tube(8, [{ z: 0, y: 0, r: 1, flat: 2 }, { z: 1, y: 0, r: 1, flat: 2 }]);
  flat.computeBoundingBox();
  check('`flat` widens the ring across x without touching y',
    Math.abs(flat.boundingBox.max.x - 2) < 1e-6 && Math.abs(flat.boundingBox.max.y - 1) < 1e-6,
    `${flat.boundingBox.max.x} x ${flat.boundingBox.max.y}`);
}

// ===========================================================================
console.log('\nthe poser: it really moves what it says it moves');
// ===========================================================================
{
  const m = buildDragon('drake');
  check('it starts idle', m.anim === 'idle');

  // the breath: the barrel changes size while it stands still
  const sizes = [];
  for (let i = 0; i < 200; i++) { m.update(1 / 60, 0); sizes.push(m.parts.body.scale.x); }
  const swell = Math.max(...sizes) - Math.min(...sizes);
  check('standing still, the body breathes', swell > 0.01, `${swell.toFixed(4)} of scale over 200 frames`);

  // walking: the legs stride, and the stride is a function of ground covered
  const strides = (speed, frames) => {
    const w = buildDragon('drake');
    w.setAnim('walk');
    let lo = 0, hi = 0;
    for (let i = 0; i < frames; i++) { w.update(1 / 60, speed); lo = Math.min(lo, w.parts.legFL.rotation.x); hi = Math.max(hi, w.parts.legFL.rotation.x); }
    return { swing: hi - lo, phase: w.parts.legFL.rotation.x };
  };
  const slow = strides(1, 120), fast = strides(6, 120);
  check('walking swings the legs', fast.swing > 0.5, fast.swing.toFixed(3));
  check('and standing still does not', strides(0, 120).swing < 1e-9, strides(0, 120).swing.toFixed(6));
  check('the gait is driven by ground covered, so a slow walk is not a fast one',
    Math.abs(slow.phase - fast.phase) > 1e-3, `${slow.phase.toFixed(3)} vs ${fast.phase.toFixed(3)}`);

  // the lunge
  const l = buildDragon('drake');
  l.update(1 / 60, 0);
  const restZ = l.parts.root.position.z;
  l.setAnim('swing');
  let maxZ = restZ;
  for (let i = 0; i < 20; i++) { l.update(1 / 60, 0); maxZ = Math.max(maxZ, l.parts.root.position.z); }
  check('a swing lunges the whole body forward', maxZ - restZ > 0.05, `${(maxZ - restZ).toFixed(3)} m`);
  check('and it comes back to idle when the lunge is over', (() => {
    for (let i = 0; i < 60; i++) l.update(1 / 60, 0);
    return l.anim === 'idle';
  })());

  // the jaw and the wings, driven directly
  const j = buildDragon('young');
  j.update(1 / 60, 0);
  const shut = j.parts.jaw.rotation.x;
  j.openJaw(1);
  j.update(1 / 60, 0);
  check('the jaw opens when it is told to', j.parts.jaw.rotation.x > shut + 0.3, `${shut} to ${j.parts.jaw.rotation.x}`);
  j.openJaw(0);
  j.update(1 / 60, 0);
  check('and shuts again', Math.abs(j.parts.jaw.rotation.x - shut) < 1e-6);

  const folded = j.parts.wingL.rotation.y;
  j.flap(1);
  j.update(1 / 60, 0);
  check('the wings spread when they are told to', Math.abs(j.parts.wingL.rotation.y) < Math.abs(folded), `${folded.toFixed(2)} to ${j.parts.wingL.rotation.y.toFixed(2)}`);
  check('folded wings sweep BACK along the flanks and do not stand up',
    folded < 0, String(folded));
  j.flap(0);
  j.update(1 / 60, 0);
  check('and fold again', Math.abs(j.parts.wingL.rotation.y - folded) < 1e-6);

  // the fall
  const f = buildDragon('drake');
  f.setAnim('fall');
  for (let i = 0; i < 90; i++) f.update(1 / 60, 0);
  check('a fall rolls it onto its side', f.parts.root.rotation.z > 1.4, f.parts.root.rotation.z.toFixed(3));
  check('and it reports itself down', f.down === true);
  f.setAnim('walk');
  check('a downed dragon does not get up on a walk', f.down === true);
  f.setAnim('wake');
  f.update(1 / 60, 0);
  check('but it does on a wake', f.down === false && Math.abs(f.parts.root.rotation.z) < 1e-9);
}

// ===========================================================================
console.log('\ndisposal');
// ===========================================================================
{
  const scene = new THREE.Scene();
  const m = buildDragon('hatchling');
  scene.add(m.group);
  check('the body goes into a scene', m.group.parent === scene);
  m.dispose();
  check('and comes out of it again', m.group.parent === null);
}

for (const age of AGES) built[age].dispose();

// ===========================================================================
// The studio hatchling, over the real file.
// ===========================================================================

const { readFileSync } = await import('node:fs');
const { join, dirname } = await import('node:path');
const { fileURLToPath } = await import('node:url');
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
// The hatchling is textured, and that path in GLTFLoader wants three browser
// globals. Without them the load rejects and every check below quietly does
// not run while looking like it did.
const { installTextureStubs } = await import('../../tools/test-glb-env.mjs');
installTextureStubs();

console.log('\nthe studio hatchling: the file, loaded');
const glbFile = join(ROOT, 'public', 'models', 'mmo', DRAGON_MODEL_ID + '.glb');
const { existsSync } = await import('node:fs');
if (!existsSync(glbFile)) {
  console.log(`  note  ${DRAGON_MODEL_ID}.glb is not on disk, so every studio check was skipped`);
} else {
  await preloadDragonModel();
  check('the file is in the cache', hasGlbDragon() === true);

  // ---- the audit -----------------------------------------------------------
  let report = null;
  try { report = auditGlbDragon(); } catch (e) { check('the studio audit passes', false, e.message); }
  if (report) {
    check('the studio audit passes', true,
      `${report.triangles} tris, ${report.clips} clips, ${report.length} m long, ${report.height} m tall, ${report.span} m across, scale ${report.scale}`);
  }

  // ---- the contract --------------------------------------------------------
  console.log('\nthe studio hatchling: the same contract as the code body');
  const g = buildDragon('hatchling');
  check('buildDragon hands back the studio body now', g.made === 'glb', g.made);
  check('it is still a hatchling', g.age === 'hatchling');
  check('the contract is all there',
    !!g.group && !!g.parts && typeof g.setAnim === 'function' && typeof g.update === 'function'
    && typeof g.dispose === 'function' && typeof g.flap === 'function' && typeof g.openJaw === 'function',
    Object.keys(g).filter((k) => typeof g[k] === 'function').join(', '));
  check('parts.root is a real object the poser leans', !!g.parts.root && g.parts.root.isObject3D === true);
  check('group.rotation.y is free for facing, so nothing here writes it', g.group.rotation.y === 0);
  {
    const want = REQUIRED_PARTS.filter((p) => !GLB_PARTS_MISSING.includes(p));
    const missing = want.filter((p) => !g.parts[p]);
    check('every contract part the file has a joint for is there', missing.length === 0,
      missing.join(', ') || `${want.length} parts`);
    const wrong = GLB_PARTS_MISSING.filter((p) => g.parts[p]);
    check('and the three it has no joint for come back null rather than as the wrong piece',
      wrong.length === 0, GLB_PARTS_MISSING.join(', ') + ' are null');
  }
  check('every socket the manifest names is a bone this body holds',
    Object.keys(GLB_SOCKETS).every((k) => !!g.sockets[k]),
    Object.entries(GLB_SOCKETS).map(([k, b]) => `${k}=${g.sockets[k] ? b : 'MISSING'}`).join(' '));

  // ---- the sanitised lookup ------------------------------------------------
  console.log('\nthe studio hatchling: names with dots in them');
  {
    const { boneKey, instantiate } = await import('./models.js');
    const { parseGLB } = await import('../../tools/validate-glb.mjs');
    const { json } = parseGLB(readFileSync(glbFile));
    const raw = json.skins[0].joints.map((i) => json.nodes[i].name);
    const dottedBones = raw.filter((n) => /[.[\]:/\s]/.test(n));
    const dottedMeshes = (json.meshes || []).map((m) => m.name || '').filter((n) => /[.[\]:/\s]/.test(n));
    check('the file was re-exported with its bone names already flat, so no bone needs the sanitiser today',
      dottedBones.length === 0, `${dottedBones.length} of ${raw.length} joints carry a dot`);
    check('but two of its MESHES still do, and those are the ones that need it',
      dottedMeshes.length === 2, dottedMeshes.join(', '));
    check('boneKey is the loader\'s own sanitiser',
      boneKey('wing_upper.L') === 'wing_upperL' && boneKey('Dragon_eyelids.L') === 'Dragon_eyelidsL',
      'wing_upper.L becomes wing_upperL, Dragon_eyelids.L becomes Dragon_eyelidsL');
    const inst = instantiate(DRAGON_MODEL_ID);
    check('so a lookup written the way Blender writes a mirror finds the bone anyway',
      inst.bone('wing_upper.L') === inst.bones.get('wing_upperL') && !!inst.bones.get('wing_upperL'),
      `${inst.bones.size} bones, and wing_upper.L reaches wing_upperL`);
    check('which is what would keep every table here working through a re-export that puts the dots back',
      inst.bone('front_upper.L') === inst.bones.get('front_upperL')
      && inst.bone('socket_cast.L') === inst.bones.get('socket_castL'));
    check('a name that needs no sanitising still works', inst.bone('pelvis') === inst.bones.get('pelvis'));
    check('a name that is in neither form comes back null rather than throwing',
      inst.bone('wing_upper.Q') === null);
    check('and the two eyelid meshes are found by the same rule, which is not hypothetical',
      !!g.parts.eyeL && !!g.parts.eyeR && g.parts.eyeL !== g.parts.eyeR,
      `${g.parts.eyeL && g.parts.eyeL.name} and ${g.parts.eyeR && g.parts.eyeR.name}`);
    const p = inst.partsLike();
    const keys = ['head', 'torso', 'armL', 'armR', 'legL', 'legR'];
    check('partsLike hands back a real bone for all six, through the same door',
      keys.every((k) => p[k] && p[k].isBone), keys.map((k) => `${k}=${p[k] ? p[k].name : 'null'}`).join(' '));
    check('and the two front legs really are different bones', p.armL !== p.armR && p.legL !== p.legR);
    check('the wing bones the parts map names are the ones three built',
      g.parts.wingL === inst.bones.get('wing_upperL') || g.parts.wingL.name === 'wing_upperL',
      g.parts.wingL.name);
    inst.dispose();
  }

  // ---- the size ------------------------------------------------------------
  console.log('\nthe studio hatchling: the size stageBody asks for');
  {
    const stage = stageBody('hatchling');
    check(`it measures ${g.length.toFixed(3)} m nose to tail and stageBody says ${stage.length}`,
      Math.abs(g.length - stage.length) < 0.005, `off by ${((g.length - stage.length) * 1000).toFixed(1)} mm`);
    check('the height that comes out of that scale is within 15 per cent of the table',
      Math.abs(g.height - stage.height) <= stage.height * 0.15,
      `${g.height.toFixed(3)} m against ${stage.height} m`);
    check('and it is wider across the wings than it is long, as a hatchling in the file is',
      g.width > g.length, `${g.width.toFixed(3)} m across, ${g.length.toFixed(3)} m long`);
    check('the triangles are the file\'s and are inside the budget the file gets',
      g.triangles > 10000 && g.triangles < GLB_TRIANGLE_BUDGET, `${g.triangles} of ${GLB_TRIANGLE_BUDGET}`);
    check('which is not the code body\'s budget, and is not held to it',
      g.triangles > TRIANGLE_BUDGET.hatchling, `${TRIANGLE_BUDGET.hatchling} is the code hatchling\'s`);
  }

  // ---- the states ----------------------------------------------------------
  console.log('\nthe studio hatchling: every state against a clip in the file');
  {
    const have = g.clips;
    check('the file carries sixteen clips', have.length === 16, have.join(', '));
    const withClip = Object.entries(GLB_STATES).filter(([, v]) => v.clip);
    const bad = withClip.filter(([, v]) => !have.includes(v.clip) || (v.intro && !have.includes(v.intro)));
    check('every state that names a clip names one the file has', bad.length === 0,
      withClip.map(([k, v]) => `${k}->${v.intro ? v.intro + '+' : ''}${v.clip}`).join(' '));
    // and the other direction: the two with no clip are the two the file has
    // no clip for, and they are not silently doing nothing
    const noClip = Object.entries(GLB_STATES).filter(([, v]) => !v.clip).map(([k]) => k);
    check('exactly two states have no clip, and they are the bite and the flinch',
      noClip.slice().sort().join() === OVERLAY_ANIMS.slice().sort().join(), noClip.join(', '));
    check('nothing in the file is called an attack or a hurt, which is why',
      !have.some((c) => /attack|bite|hurt|hit|flinch/i.test(c)));
    for (const key of AIR_ANIMS) check(`the world's "${key}" is a state this body knows`, !!GLB_STATES[key]);
    check('every alias the game might say lands on a real state',
      Object.values(GLB_STATE_ALIAS).every((v) => !!GLB_STATES[v]),
      Object.entries(GLB_STATE_ALIAS).map(([k, v]) => `${k}->${v}`).join(' '));
    check('a name that is not a state at all is refused rather than half applied',
      glbState('nonsense') === null && glbState('idle') === 'idle');
    check('the idle variations and the wing clips are in the file too',
      [...GLB_IDLE_VARIATIONS, ...Object.values(GLB_WING_CLIPS)].every((c) => have.includes(c)),
      [...GLB_IDLE_VARIATIONS, ...Object.values(GLB_WING_CLIPS)].join(', '));
  }

  // ---- driving each state --------------------------------------------------
  console.log('\nthe studio hatchling: driven into every state, and the clip that came up');
  {
    const table = [];
    for (const [key, spec] of Object.entries(GLB_STATES)) {
      if (spec.mode === 'over') continue;
      const m = buildGlbDragon();
      m.setAnim(key);
      m.update(1 / 60, key === 'walk' ? 4 : 0);
      const first = m.clip;
      // let any intro run out and see what it chained into
      for (let i = 0; i < 400; i++) m.update(1 / 60, key === 'walk' ? 4 : 0);
      const after = m.clip;
      table.push({ key, first, after, mode: spec.mode });
      const wantFirst = spec.intro || spec.clip;
      const wantAfter = spec.mode === 'shot' ? null : spec.clip;
      check(`${key} plays ${wantFirst}`, first === wantFirst, `${first}`);
      if (wantAfter) check(`  and ${spec.intro ? 'chains into' : 'holds'} ${wantAfter}`, after === wantAfter, after);
      else check('  and then goes back to standing or walking', after === 'idle' || after === 'walk', after);
      m.dispose();
    }
    console.log('       state       first clip        settles on');
    for (const r of table) console.log(`       ${r.key.padEnd(11)} ${String(r.first).padEnd(17)} ${r.after}`);
  }

  // ---- the fall, and the latch ---------------------------------------------
  console.log('\nthe studio hatchling: down, and up again');
  {
    const m = buildGlbDragon();
    m.setAnim('fall');
    check('a fall lies it down', m.down === true && m.clip === 'lie_down', m.clip);
    for (let i = 0; i < 200; i++) m.update(1 / 60, 0);
    check('and the lie_down chains into sleep, which is what the manifest calls the rest',
      m.clip === 'sleep', m.clip);
    m.setAnim('walk');
    check('it is down until it is woken, so a walk does not stand it up',
      m.down === true && m.clip === 'sleep', m.clip);
    m.setAnim('wake');
    check('a wake plays wake_up', m.down === false && m.clip === 'wake_up', m.clip);
    for (let i = 0; i < 200; i++) m.update(1 / 60, 0);
    check('and then it is standing again', m.clip === 'idle', m.clip);
    m.dispose();
  }

  // ---- the bite and the flinch, which have no clip -------------------------
  console.log('\nthe studio hatchling: the bite and the flinch the file has not got');
  {
    // Two bodies driven in lockstep, one told to bite and one not. The clips
    // move the jaw and the body themselves, so the only honest measure of what
    // this file adds on top of the mixer is the DIFFERENCE between the two.
    const m = buildGlbDragon();
    const control = buildGlbDragon();
    const step = () => { m.update(1 / 60, 0); control.update(1 / 60, 0); };
    const jawGap = () => m.parts.jaw.rotation.x - control.parts.jaw.rotation.x;
    const pitchGap = () => m.parts.root.rotation.x - control.parts.root.rotation.x;
    step();
    check('two bodies driven the same way are in the same pose', Math.abs(jawGap()) < 1e-9);
    m.openJaw(1);
    step();
    check('openJaw(1) opens the jaw, and opening is a NEGATIVE x on this bone',
      jawGap() < -0.55, `${jawGap().toFixed(4)} rad against GLB_JAW_OPEN ${GLB_JAW_OPEN}`);
    m.openJaw(0);
    step();
    check('and it shuts again rather than staying open', Math.abs(jawGap()) < 1e-9, jawGap().toFixed(6));
    // the mixer writes the jaw absolutely every frame, so 200 frames held open
    // must be no wider than one frame is
    m.openJaw(1);
    let widest = 0;
    for (let i = 0; i < 200; i++) { step(); widest = Math.min(widest, jawGap()); }
    check('200 frames held open is no wider than one, so nothing accumulates over the mixer',
      widest > -GLB_JAW_OPEN - 1e-6, `${widest.toFixed(6)} at the widest of 200, against ${(-GLB_JAW_OPEN).toFixed(3)} asked for`);
    m.openJaw(0);
    step();
    m.setAnim('swing');
    check('a swing does not change what the body is doing', m.anim === 'idle', m.anim);
    let bit = 0, pitched = 0;
    for (let i = 0; i < 20; i++) { step(); bit = Math.min(bit, jawGap()); pitched = Math.min(pitched, pitchGap()); }
    check('a swing opens the jaw on its own without a clip for it',
      bit < -0.3, `${bit.toFixed(3)} rad at the widest of the swing`);
    check('and the whole body goes forward with it', pitched < -0.05, `${pitched.toFixed(3)} rad of pitch`);
    for (let i = 0; i < 60; i++) step();
    check('and the swing ends rather than sticking',
      Math.abs(jawGap()) < 1e-9 && Math.abs(pitchGap()) < 1e-9,
      `${jawGap().toFixed(6)} rad of jaw and ${pitchGap().toFixed(6)} of pitch left over`);
    m.setAnim('hurt');
    let flinch = 0;
    for (let i = 0; i < 10; i++) { step(); flinch = Math.min(flinch, pitchGap()); }
    check('a flinch pitches the body and the swing does not have to have happened first',
      flinch < -0.1, `${flinch.toFixed(3)} rad`);
    for (let i = 0; i < 40; i++) step();
    check('and the flinch ends too', Math.abs(pitchGap()) < 1e-9, pitchGap().toFixed(6));
    m.dispose(); control.dispose();
  }

  // ---- the wings -----------------------------------------------------------
  console.log('\nthe studio hatchling: the wings');
  {
    // Measured off the wing bone itself rather than off the action's weight,
    // because the bone is what a player would see move. The control body is
    // driven the same way and never told to flap, so what is measured is what
    // the flap did and not what the idle clip does to a wing anyway.
    const m = buildGlbDragon();
    const control = buildGlbDragon();
    const step = () => { m.update(1 / 60, 0); control.update(1 / 60, 0); };
    step();
    const wingAt = () => m.parts.wingL.quaternion.angleTo(control.parts.wingL.quaternion);
    check('the two wings start together', wingAt() < 1e-6, `${wingAt().toExponential(1)} rad apart`);
    m.flap(1);
    let widest = 0;
    for (let i = 0; i < 120; i++) { step(); widest = Math.max(widest, wingAt()); }
    check(`flap(1) plays ${GLB_WING_CLIPS.spread} and the wing really moves`,
      widest > 0.05, `${(widest * 57.3).toFixed(1)} degrees away from a wing that was never told to spread`);
    m.flap(0);
    for (let i = 0; i < 400; i++) step();
    check(`and flap(0) plays ${GLB_WING_CLIPS.fold} and puts it back`,
      wingAt() < 0.02, `${(wingAt() * 57.3).toFixed(2)} degrees apart again`);
    m.dispose(); control.dispose();
  }

  // ---- the blinks ----------------------------------------------------------
  console.log('\nthe studio hatchling: the blinks, which are in the clips already');
  {
    const m = buildGlbDragon();
    const meshes = [];
    m.group.traverse((o) => { if (o.isMesh && o.morphTargetInfluences && o.morphTargetInfluences.length) meshes.push(o); });
    check('three meshes carry blink morphs', meshes.length === 3, `${meshes.length} meshes`);
    const shutFrames = (frames) => {
      let peak = 0, closed = 0;
      for (let i = 0; i < frames; i++) {
        m.update(1 / 60, 0);
        const v = Math.max(...meshes.map((x) => Math.max(...x.morphTargetInfluences)));
        peak = Math.max(peak, v);
        if (v > 0.5) closed++;
      }
      return { peak, closed };
    };
    const idle = shutFrames(300);
    check('it blinks while it stands there, without anything here driving one',
      idle.closed > 0 && idle.peak > 0.8,
      `over 5 s of idle the lids pass half shut on ${idle.closed} frames of 300 and peak at ${idle.peak.toFixed(3)}`);
    m.setAnim('perch');
    const perched = shutFrames(300);
    check('and it blinks on your shoulder too', perched.closed > 0 && perched.peak > 0.8,
      `${perched.closed} frames of 300, peak ${perched.peak.toFixed(3)}`);
    m.setAnim('fall');
    for (let i = 0; i < 400; i++) m.update(1 / 60, 0);
    const asleep = Math.max(...meshes.map((x) => Math.max(...x.morphTargetInfluences)));
    check('and its eyes are shut while it sleeps', asleep > 0.9, `${asleep.toFixed(3)} closed`);
    m.dispose();
  }

  // ---- standing about ------------------------------------------------------
  console.log('\nthe studio hatchling: what it does with itself when nothing is happening');
  {
    const m = buildGlbDragon();
    const seen = [];
    for (let i = 0; i < 60 * 60; i++) {
      m.update(1 / 60, 0);
      if (m.variation && seen[seen.length - 1] !== m.variation) seen.push(m.variation);
    }
    check('standing still for a minute, it looks around and swings its tail',
      seen.length >= 4 && new Set(seen).size === 2, `${seen.length} in 60 s: ${[...new Set(seen)].join(' and ')}`);
    check('and every one of them is a clip the file has',
      seen.every((c) => GLB_IDLE_VARIATIONS.includes(c)));
    const m2 = buildGlbDragon();
    let any = null;
    for (let i = 0; i < 60 * 60; i++) { m2.update(1 / 60, 5); if (m2.variation) any = m2.variation; }
    check('but a dragon that is walking does not stop to look around', any === null, String(any));
    m.dispose(); m2.dispose();
  }

  // ---- the perch, on a real player rig -------------------------------------
  console.log('\nthe studio hatchling: socket_perch on the shoulder');
  {
    const { createDragon } = await import('./dragon.js');
    const { buildGlbRig, preloadRigs } = await import('./rig_glb.js');
    await preloadRigs(['human-male']);
    const scene = new THREE.Scene();
    const rig = buildGlbRig('human-male', {});
    scene.add(rig.group);
    rig.pos = { x: 3, y: 0, z: -2 };
    rig.yaw = 0.7;
    rig.group.position.set(rig.pos.x, rig.pos.y, rig.pos.z);
    rig.group.rotation.y = rig.yaw;
    rig.update(1 / 60, 0);
    check('the rig is the studio body, with a shoulder anchor to sit on',
      !!rig.parts[SHOULDER_ANCHOR] && !!rig.parts.back,
      `${SHOULDER_ANCHOR} and back are both there`);

    const logs = [];
    const character = {};
    const ent = createDragon({
      character,
      hud: { log: (t) => logs.push(t) },
      scene,
      buildModel: buildDragon,
      playerRig: rig,
      playerActor: { health: 100, lastSwingAt: 0 },
      heightAt: () => 0,
    });
    check('the dragon it hatched is the studio body', ent.made === 'glb', String(ent.made));

    const perch = ent.model.sockets.perch;
    const shoulder = rig.parts[SHOULDER_ANCHOR];
    const wpos = (o) => o.getWorldPosition(new THREE.Vector3());

    // THE REAL FRAME ORDER, and it matters. The systems run and THEN the
    // renderer walks the scene, which is where rig_glb's compose lays the
    // additive layer over the mixer's pose. A loop that leaves the world
    // matrices alone until the end is not that order, and the first version of
    // this test did exactly that: it read 0.02 mm off a body whose socket was
    // in fact oscillating 84.70 mm every other frame. So the matrices are
    // walked every frame here, and the WORST of 600 is what is reported.
    const frame = (i, speed) => {
      rig.update(1 / 60, speed);
      ent.run({ dt: 1 / 60, now: 1000 + i * 16 });
      scene.updateMatrixWorld(true);
      return wpos(perch).distanceTo(wpos(shoulder));
    };
    const b = wpos(shoulder).clone();
    let worst = 0;
    for (let i = 0; i < 300; i++) worst = Math.max(worst, frame(i, 0));
    check('socket_perch lands on the shoulder and stays there, under 20 mm',
      worst < 0.02, `${(worst * 1000).toFixed(3)} mm at the worst of 300 frames standing still`);
    check('it is parented to the anchor stageBody names, which is the chest and not the arm',
      ent.model.group.parent === rig.parts.back, ent.model.group.parent && ent.model.group.parent.name);
    check('and it is perched rather than standing', ent.anim === 'perch', String(ent.anim));

    // and it follows the shoulder rather than sitting where the shoulder was
    rig.pos.x = 40; rig.pos.z = 12; rig.yaw = -2.1;
    rig.group.position.set(rig.pos.x, rig.pos.y, rig.pos.z);
    rig.group.rotation.y = rig.yaw;
    let worstWalking = 0;
    for (let i = 0; i < 300; i++) worstWalking = Math.max(worstWalking, frame(300 + i, 6));
    check('and it is still on the shoulder 40 m away, turned round, and walking',
      worstWalking < 0.02, `${(worstWalking * 1000).toFixed(3)} mm at the worst of 300 walking frames`);
    const b2 = wpos(shoulder);
    check('which is a shoulder that really moved', b2.distanceTo(b) > 30,
      `${b2.distanceTo(b).toFixed(1)} m from where it was`);

    // where the animal actually ends up, so the reviewer has a number to look
    // for on the screen rather than a promise
    const dbox = new THREE.Box3().setFromObject(ent.model.group);
    const pbox = new THREE.Box3().setFromObject(rig.group);
    const shY = wpos(shoulder).y;
    check('it sits at the shoulder and comes up to about the height of your head',
      Math.abs(dbox.min.y - shY) < 0.10 && dbox.max.y < pbox.max.y,
      `the dragon spans y ${dbox.min.y.toFixed(3)} to ${dbox.max.y.toFixed(3)}, the shoulder joint is at ${shY.toFixed(3)}, the top of the head is ${pbox.max.y.toFixed(3)}`);
    // How deep it sits is the calibration the manifest asks the host for, and
    // it is the one thing in this file that a number cannot settle. The seat is
    // the shoulder JOINT, which is inside the body; the top of the shoulder is
    // measured off the skinned vertices around it, so the reviewer has the
    // depth in millimetres rather than an impression.
    {
      const v = new THREE.Vector3();
      const sh2 = wpos(shoulder);
      let top = -Infinity, n = 0;
      rig.group.traverse((o) => {
        if (!o.isSkinnedMesh || !o.geometry || !o.geometry.getAttribute('position')) return;
        const count = o.geometry.getAttribute('position').count;
        for (let i = 0; i < count; i++) {
          o.getVertexPosition(i, v);
          o.localToWorld(v);
          if (Math.hypot(v.x - sh2.x, v.z - sh2.z) > 0.06) continue;
          n++;
          if (v.y > top) top = v.y;
        }
      });
      console.log(`       note  the top of the player's shoulder is y ${top.toFixed(3)}, off ${n} skinned vertices within 60 mm of the joint.`);
      console.log(`             The seat is the JOINT, at y ${sh2.y.toFixed(3)}, so the hatchling's underside is ${((top - dbox.min.y) * 1000).toFixed(0)} mm under the skin.`);
      console.log('             That is the "host shoulder socket calibration" the manifest asks the host for, and it wants eyes rather than a number.');
      console.log('             It is not new: the check below measures this seat against the one the ride has always used.');
    }

    // How far the new seat is from the old one. `stageBody`'s offset is where
    // the ride has put a hatchling since it was written, so if the socket solve
    // landed somewhere else the change would be a change to how the game looks
    // and not just to what it is made of. It does not: the two agree to a
    // millimetre in height and a few centimetres across.
    {
      const s0 = stageBody('hatchling').offset;
      const seat = ent.seat;
      check('the socket seats within a hand\'s breadth of where the ride has always put it',
        Math.hypot(seat.x - s0.x, seat.y - s0.y, seat.z - s0.z) < 0.12,
        `the solve gives ${['x', 'y', 'z'].map((k) => `${k} ${seat[k].toFixed(3)}`).join(', ')} against the table's ${['x', 'y', 'z'].map((k) => `${k} ${s0[k].toFixed(3)}`).join(', ')}`);
      check('and at the same height, which is the axis a seat is noticed on',
        Math.abs(seat.y - s0.y) < 0.02, `${((seat.y - s0.y) * 1000).toFixed(1)} mm apart in y`);
    }

    // the code body has no socket, so it seats on the offset the table gives
    const codeEnt = createDragon({
      character: {}, hud: { log: () => {} }, scene,
      buildModel: buildCodeDragon, playerRig: rig, playerActor: { health: 100, lastSwingAt: 0 },
      heightAt: () => 0,
    });
    codeEnt.run({ dt: 1 / 60, now: 1000 });
    const s = stageBody('hatchling');
    check('a body with no mount point of its own still seats on the table\'s offset',
      Math.abs(codeEnt.seat.x - s.offset.x) < 1e-9 && Math.abs(codeEnt.seat.y - s.offset.y) < 1e-9,
      `${JSON.stringify(codeEnt.seat)} against ${JSON.stringify(s.offset)}`);
    codeEnt.dispose();
    ent.dispose();
    rig.dispose();
  }

  // ---- the flight the world drives -----------------------------------------
  console.log('\nthe studio hatchling: the states the world owns, and the words for them');
  {
    const { createDragon } = await import('./dragon.js');
    const logs = [];
    const rig = { pos: { x: 0, y: 0, z: 0 }, yaw: 0, parts: {} };
    const ent = createDragon({
      character: {}, hud: { log: (t) => logs.push(t) }, scene: new THREE.Scene(),
      buildModel: buildDragon, playerRig: rig, playerActor: { health: 100, lastSwingAt: 0 },
      heightAt: () => 0,
    });
    let now = 1000;
    const frame = () => { ent.run({ dt: 1 / 60, now }); now += 16; };
    frame();
    const before = logs.length;
    ent.setAnim('fly');
    frame();
    check('a flight the world asserts survives the ride putting it back down',
      ent.anim === 'fly', String(ent.anim));
    check('and it says so, once', logs.slice(before).filter((l) => /wings out/.test(l)).length === 1,
      logs.slice(before).join(' | '));
    ent.setAnim('glide');
    frame();
    ent.setAnim('fly');
    frame();
    ent.setAnim('glide');
    frame();
    check('a flight that flickers between beating and gliding says each of them once',
      logs.filter((l) => /rides the air/.test(l)).length === 1
      && logs.filter((l) => /wings out/.test(l)).length === 1,
      logs.filter((l) => /rides the air|wings out/.test(l)).join(' | '));
    ent.setAnim('land');
    frame();
    check('the landing holds the body while the clip runs', ent.anim === 'land');
    now += LAND_MS;
    frame();
    check(`and ${LAND_MS} ms later the ride has it back`, ent.anim === 'perch', String(ent.anim));
    const flights = logs.filter((l) => /wings out/.test(l)).length;
    ent.setAnim('fly');
    frame();
    check('a second flight speaks again, because coming down cleared the first',
      logs.filter((l) => /wings out/.test(l)).length === flights + 1);
    ent.dispose();
  }

  // ---- and the code body answers the same calls -----------------------------
  console.log('\nthe code body, asked for states it has no pose for');
  {
    const m = buildCodeDragon('hatchling');
    for (const [want, into] of Object.entries(CODE_ANIM_ALIAS)) {
      m.setAnim('walk');
      m.setAnim(want);
      check(`a code body asked for ${want} does ${into} rather than standing in a state it cannot pose`,
        m.anim === into, m.anim);
    }
    check('and it is never left down by one of them', m.down === false);
    m.dispose();
  }

  g.dispose();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
