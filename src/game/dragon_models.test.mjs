// The four bodies, measured. Run: node src/game/dragon_models.test.mjs
//
// Nothing here asserts that a builder exists. Every number is taken off a real
// built body: the triangles counted, the bounding box measured with the wings
// off and again with them spread, the named parts looked up, the textures
// generated and read back byte by byte, and the poser driven through every
// animation it has to see that it moves what it says it moves.

import * as THREE from 'three';
import {
  buildDragon, auditDragonModels, PROPORTIONS, PALETTE, EYE_GOLD,
  TRIANGLE_BUDGET, REQUIRED_PARTS, FAMILIES, textureSet, TEX_SIZE, tube, pbr,
} from './dragon_models.js';
import { AGES, AGE_LABEL, stageBody } from './dragon.js';
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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
