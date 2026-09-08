// The Blender body behind the rig contract. Run: node src/game/rig_glb.test.mjs
//
// Everything here goes through the real loader over the real files, the way
// models.test.mjs does: node's fetch is pointed at a host this process serves
// from disk, and after that it is GLTFLoader parsing the shipped glb, three
// cloning the skeleton and an AnimationMixer driving it. No hand made entries,
// no stubbed bones. The test path is the real path.
//
// The four claims worth the trouble:
//
//   1. every contract anchor exists, is character aligned, and sits within
//      0.10 m of where buildCharacter() puts the same anchor
//   2. the additive layer effects.js writes survives a mixer: a swing during a
//      walk raises the arm ABOVE the walk pose and leaves nothing behind
//   3. the stand-in swaps out in place, keeping the group, the anchors and the
//      gear already hanging on them
//   4. dressRig dresses a bone rig exactly as it dresses the procedural one

import * as THREE from 'three';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');

// --- the real loader, fed from disk ----------------------------------------
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
// The studio bodies are textured, and that path in GLTFLoader wants three
// browser globals. Without them the load rejects and every check that needs
// one of those bodies quietly does not run.
const { installTextureStubs } = await import('../../tools/test-glb-env.mjs');
installTextureStubs();

const {
  buildGlbRig, preloadRigs, boneMapFor, boneMapFrom, anchorReport, PART_KEYS, BUILD_MODEL,
  modelForBuild, modelForAppearance, GENDER_MODEL, hairCap, markDecal, isHumanoid,
  createGlbPlayer, WRIST_BONES,
} = await import('./rig_glb.js');
const { MODEL_IDS, isLoaded, modelTriangles, clipDuration, restFrames } = await import('./models.js');

// The studio bodies are delivered rather than built here. Everything that
// needs a file on disk runs over the files that are on disk, and says which
// ones were not.
const { existsSync } = await import('node:fs');
const READY = MODEL_IDS.filter((id) => existsSync(join(ROOT, 'public', 'models', 'mmo', id + '.glb')));
const LATE = MODEL_IDS.filter((id) => !READY.includes(id));
const STUDIO = ['human-male', 'human-female'];
const { buildCharacter, BODY, HAIR_COLOURS, HAIR_STYLES, MARKS } = await import('./player.js');
const { dressRig, wornNodes, gearCounts } = await import('./gear_visuals.js');
const { makeItem, setOf } = await import('../mmo/items.js');
const { swingPose, flinchPose, deathPose } = await import('./effects.js');

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };
const near = (a, b, e) => Math.abs(a - b) <= e;
const wp = (o) => o.getWorldPosition(new THREE.Vector3());
const wq = (o) => o.getWorldQuaternion(new THREE.Quaternion());
const f3 = (v) => v.toArray().map((n) => n.toFixed(3)).join(', ');

// ===========================================================================
console.log('rig_glb: the stand-in, and the swap that replaces it');
{
  // deliberately BEFORE any preload, so nothing is in the cache
  check('nothing is loaded yet', MODEL_IDS.every((id) => !isLoaded(id)));
  const rig = buildGlbRig('human-medium', { appearance: { build: 'average', hairStyle: 'braid' } });
  const group = rig.group;
  const handR = rig.parts.handR, head = rig.parts.head;
  check('a rig comes back at once, with a body already in it',
    group.isGroup === true && group.children.length > 0 && rig.loaded === false,
    `${group.children.length} children, loaded ${rig.loaded}`);
  check('and every contract anchor is already there',
    PART_KEYS.every((k) => rig.parts[k] && rig.parts[k].isObject3D), PART_KEYS.length + ' anchors');

  // hang something off a hand the way dressRig would
  const sword = new THREE.Object3D();
  sword.name = 'test:sword';
  handR.add(sword);
  rig.group.updateMatrixWorld(true);
  const standInRest = {};
  for (const k of PART_KEYS) standInRest[k] = wp(rig.parts[k]);
  rig.setAnim('walk');
  for (let i = 0; i < 10; i++) rig.update(1 / 60, 7);
  rig.group.updateMatrixWorld(true);
  const standInHand = wp(handR);

  await rig.ready;
  check('the file lands and the rig is a glb', rig.loaded === true);
  check('the group is the SAME object, so a caller holding it holds the real body',
    rig.group === group, 'identity kept across the swap');
  check('the anchors are the same objects too', rig.parts.handR === handR && rig.parts.head === head);
  check('the sword is still in the same hand', sword.parent === handR && handR.children.includes(sword));
  // the same anchors, on a different body, in the same places: measured at
  // rest on both, because the two bodies were at different points of their own
  // walk cycles when the file arrived and that difference is not the swap's
  rig.group.updateMatrixWorld(true);
  let worstMove = 0, worstKey = '';
  for (const k of PART_KEYS) {
    const d = wp(rig.parts[k]).distanceTo(standInRest[k]);
    if (d > worstMove) { worstMove = d; worstKey = k; }
  }
  check('and at rest every anchor is where the stand-in had it, within 0.10 m',
    worstMove <= 0.10, `worst ${worstKey} moved ${worstMove.toFixed(3)} m`);
  rig.update(1 / 60, 7);
  rig.group.updateMatrixWorld(true);
  const glbHand = wp(handR);
  check('and the hand is still a hand on the same body after the swap',
    glbHand.distanceTo(standInHand) < 0.5,
    `${glbHand.distanceTo(standInHand).toFixed(3)} m, the two bodies being at different points of their own walk cycles`);
  check('the box the stand-in was is gone from the group',
    group.children.filter((c) => c.name === 'glbScale').length === 1, `${group.children.length} children`);
  rig.dispose();
}

await preloadRigs();
check('preloadRigs asks for every model models.js lists, studio bodies included',
  MODEL_IDS.includes('human-male') && MODEL_IDS.includes('human-female'),
  MODEL_IDS.length + ' models, and preloadRigs defaults to all of them');
check('preloadRigs resolves and every delivered model is in the cache', READY.every((id) => isLoaded(id)),
  `${READY.length} of ${MODEL_IDS.length} models${LATE.length ? `; not delivered yet: ${LATE.join(', ')}` : ''}`);
{
  const rig = buildGlbRig('human-medium', {});
  check('with the file cached the rig is a glb from the first frame, no stand-in',
    rig.loaded === true, 'models.js builds a cached model synchronously');
  rig.dispose();
}

// ===========================================================================
console.log('\nrig_glb: every anchor, against buildCharacter');
{
  const ref = buildCharacter();
  ref.group.updateMatrixWorld(true);
  const WATCHED = ['handR', 'handL', 'head', 'back', 'footL', 'footR'];
  for (const id of READY) {
    const map = boneMapFor(id);
    check(`${id} resolves all ${PART_KEYS.length} anchors to real bones`,
      PART_KEYS.every((k) => map[k] && restFrames(id).has(map[k])),
      PART_KEYS.map((k) => `${k}=${map[k]}`).join(' '));
  }
  for (const id of ['human-slim', 'human-medium', 'human-heavy']) {
    const report = anchorReport(id);
    const worst = PART_KEYS.reduce((a, k) => (report[k].d > a.d ? { k, d: report[k].d } : a), { k: '-', d: 0 });
    console.log(`       ${id}: ` + PART_KEYS.map((k) => `${k} ${report[k].d.toFixed(3)}`).join('  '));
    check(`${id}: every anchor is within 0.10 m of the procedural rig's`,
      PART_KEYS.every((k) => report[k].d <= 0.10), `worst ${worst.k} at ${worst.d.toFixed(3)} m`);
    check(`${id}: the six the gear tables care about are within 0.10 m`,
      WATCHED.every((k) => report[k].d <= 0.10),
      WATCHED.map((k) => `${k} ${report[k].d.toFixed(3)}`).join(', '));
  }

  // The mirror is not a tidy-up to be undone later: the models are named
  // anatomically and player.js is not. Both directions, measured.
  const rest = restFrames('human-medium');
  const refHandR = wp(ref.parts.handR);
  const mirrored = rest.get('hand_L').pos, named = rest.get('hand_R').pos;
  check('the contract handR is the glb hand_L, and the difference is not small',
    refHandR.distanceTo(mirrored) < 0.10 && refHandR.distanceTo(named) > 0.5,
    `hand_L is ${refHandR.distanceTo(mirrored).toFixed(3)} m away, hand_R is ${refHandR.distanceTo(named).toFixed(3)} m away`);

  // an anchor whose frame is not character aligned would hang the sword
  // sideways however good HOLD is
  const rig = buildGlbRig('human-medium', {});
  rig.group.updateMatrixWorld(true);
  let worstDeg = 0, worstKey = '';
  for (const k of PART_KEYS) {
    const e = new THREE.Euler().setFromQuaternion(wq(rig.parts[k]));
    const d = Math.max(Math.abs(e.x), Math.abs(e.y), Math.abs(e.z)) * 180 / Math.PI;
    if (d > worstDeg) { worstDeg = d; worstKey = k; }
  }
  check('every anchor stands square to the character at rest, as the gear tables assume',
    worstDeg < 0.01, `worst ${worstKey} at ${worstDeg.toFixed(4)} degrees off`);
  // effects.js starts a bolt from `armR.matrixWorld` times (0, BODY.HAND_Y, 0)
  // rather than from handR. That point has to land on the fist of THIS body,
  // whose arm is a little shorter than the procedural one's.
  {
    rig.parts.armR.updateWorldMatrix(true, false);
    const castFrom = new THREE.Vector3(0, BODY.HAND_Y, 0).applyMatrix4(rig.parts.armR.matrixWorld);
    const fist = wp(rig.parts.handR);
    check("where effects.js reads a caster's hand from is on this body's fist",
      castFrom.distanceTo(fist) < 0.10,
      `${castFrom.distanceTo(fist).toFixed(3)} m: the arm is ${(wp(rig.parts.armR).y - fist.y).toFixed(3)} m long here against the procedural ${(-BODY.HAND_Y).toFixed(2)} m`);
  }
  rig.dispose();
  ref.dispose();
}

// ===========================================================================
console.log('\nrig_glb: the mixer actually runs');
{
  const rig = buildGlbRig('human-medium', {});
  const bone = rig.parts.armR.parent;      // the upperarm the anchor rides
  const before = bone.quaternion.clone();
  rig.setAnim('walk');
  let moved = 0;
  for (let i = 0; i < 30; i++) {
    rig.update(1 / 60, 7);
    moved = Math.max(moved, bone.quaternion.angleTo(before));
  }
  check('half a second of walk moves the arm bone off its bind pose',
    moved > 0.1, `${(moved * 180 / Math.PI).toFixed(1)} degrees of swing at the shoulder`);
  const foot = rig.parts.footR;
  rig.group.updateMatrixWorld(true);
  const y0 = wp(foot).y;
  let footRange = 0;
  for (let i = 0; i < 30; i++) { rig.update(1 / 60, 7); rig.group.updateMatrixWorld(true); footRange = Math.max(footRange, Math.abs(wp(foot).y - y0)); }
  check('and the feet leave the ground and come back, so it is a gait and not a slide',
    footRange > 0.02, `${footRange.toFixed(3)} m of ankle lift`);

  // standing still is not walking: the same call with no ground speed
  const still = buildGlbRig('human-medium', {});
  still.setAnim('idle');
  const b2 = still.parts.armR.parent, q2 = b2.quaternion.clone();
  let idleMoved = 0;
  for (let i = 0; i < 30; i++) { still.update(1 / 60, 0); idleMoved = Math.max(idleMoved, b2.quaternion.angleTo(q2)); }
  check('and standing still does not walk', idleMoved < moved * 0.5,
    `idle moves the shoulder ${(idleMoved * 180 / Math.PI).toFixed(1)} degrees, walking ${(moved * 180 / Math.PI).toFixed(1)}`);
  rig.dispose(); still.dispose();
}

// ===========================================================================
console.log('\nrig_glb: the additive layer, over a mixer that owns the same bones');
{
  // Two identical rigs walking in step. One of them is also swung, exactly the
  // way effects.js swings one: `parts.armR.rotation.x += swingPose(u).armR`
  // AFTER update, every frame.
  const plain = buildGlbRig('human-medium', {});
  const swung = buildGlbRig('human-medium', {});
  plain.setAnim('walk'); swung.setAnim('walk');
  const handY = (r) => { r.group.updateMatrixWorld(true); return wp(r.parts.handR).y; };

  const walk = [], swing = [];
  const N = 30;                                       // the swing clip is 0.5 s
  for (let i = 0; i < N; i++) {
    plain.update(1 / 60, 7);
    swung.update(1 / 60, 7);
    const a = swingPose(i / N);
    swung.parts.armR.rotation.x += a.armR;
    swung.parts.armL.rotation.x += a.armL;
    swung.parts.torso.rotation.y += a.torsoY;
    swung.parts.torso.rotation.x += a.torsoX;
    swung.parts.hips.rotation.y += a.hipsY;
    swung.parts.head.rotation.y += a.headY;
    walk.push(handY(plain)); swing.push(handY(swung));
  }
  const walkHi = Math.max(...walk), swingHi = Math.max(...swing);
  console.log(`       walking hand y ${Math.min(...walk).toFixed(3)} to ${walkHi.toFixed(3)} m; with a swing on top ${Math.min(...swing).toFixed(3)} to ${swingHi.toFixed(3)} m`);
  check('the swing lifts the hand well above anything the walk reaches',
    swingHi > walkHi + 0.3, `${swingHi.toFixed(3)} m against ${walkHi.toFixed(3)} m, ${(swingHi - walkHi).toFixed(3)} m clear`);
  const lifted = swing.filter((y, i) => y > walk[i] + 0.1).length;
  check('and it is above the walk pose for most of the clip, not for one frame',
    lifted >= N * 0.3, `${lifted} of ${N} frames more than 0.10 m above the walking hand`);

  // and then it lets go. Both rigs keep walking with nothing written on top.
  for (let i = 0; i < 40; i++) { plain.update(1 / 60, 7); swung.update(1 / 60, 7); }
  const d = handY(swung) - handY(plain);
  check('when the swing stops the arm returns to the walk exactly',
    Math.abs(d) < 1e-9, `${d.toExponential(1)} m of difference after 40 frames`);

  // the failure this whole design exists to prevent: a `+=` with nothing
  // zeroing it winds the arm up like a clock spring
  let worst = 0;
  for (let i = 0; i < 600; i++) {
    swung.update(1 / 60, 7);
    swung.parts.armR.rotation.x += 0.3;               // ten seconds of it
    worst = Math.max(worst, Math.abs(handY(swung) - handY(plain)));
  }
  check('ten seconds of the same addition does not accumulate',
    worst < 0.9, `the hand never gets more than ${worst.toFixed(3)} m from the plain rig, and 600 x 0.3 rad would be 180 turns`);

  // effects.js zeroes hips.rotation and torso.rotation.y outright. On a bone
  // that would throw the mixer's pose away; on an anchor it must not.
  const clean = buildGlbRig('human-medium', {});
  const wiped = buildGlbRig('human-medium', {});
  clean.setAnim('walk'); wiped.setAnim('walk');
  const hipsQ = (r) => r.parts.hips.parent.quaternion.clone();
  for (let i = 0; i < 25; i++) {
    clean.update(1 / 60, 7);
    wiped.update(1 / 60, 7);
    // resetOwned, verbatim
    wiped.parts.hips.rotation.x = 0;
    wiped.parts.hips.rotation.y = 0;
    wiped.parts.torso.rotation.y = 0;
    wiped.parts.head.rotation.y = 0;
    clean.group.updateMatrixWorld(true); wiped.group.updateMatrixWorld(true);
  }
  check("effects.js zeroing its own channels leaves the mixer's hips alone",
    hipsQ(clean).angleTo(hipsQ(wiped)) < 1e-9,
    `${hipsQ(clean).angleTo(hipsQ(wiped)).toExponential(1)} rad apart, which is what a bone would have lost`);

  plain.dispose(); swung.dispose(); clean.dispose(); wiped.dispose();
}

// ===========================================================================
console.log('\nrig_glb: one shots, and the door that only opens one way');
{
  const rig = buildGlbRig('human-medium', {});
  rig.setAnim('walk');
  rig.update(1 / 60, 7);
  rig.setAnim('swing');
  check('a swing is the current animation while it runs', rig.anim === 'swing');
  for (let i = 0; i < 40; i++) rig.update(1 / 60, 7);
  check('and the walk comes back when it ends', rig.anim === 'walk',
    `after ${(40 / 60).toFixed(2)} s of a ${clipDuration('human-medium', 'swing')} s clip`);

  const dying = buildGlbRig('human-medium', { dieSeconds: 1.1 });
  dying.setAnim('die');
  check('a death is not done on the first frame', dying.dieDone === false);
  for (let i = 0; i < 40; i++) dying.update(1 / 60, 0);
  check('nor half way through it', dying.dieDone === false, `${(40 / 60).toFixed(2)} s of 1.10 s`);
  for (let i = 0; i < 40; i++) dying.update(1 / 60, 0);
  check('and it is done at the time it was asked to take', dying.dieDone === true, `${(80 / 60).toFixed(2)} s`);
  dying.setAnim('walk');
  check('a dead thing does not get up', dying.anim === 'die');
  rig.dispose(); dying.dispose();
}

// ===========================================================================
console.log('\nrig_glb: gear, on a bone rig, exactly as on the procedural one');
{
  const fullSet = (material) => {
    const eq = {};
    for (const b of setOf(material)) eq[b.slot] = makeItem({ base: b.id });
    for (const s of Object.keys(eq)) eq[s].material = 'iron';
    return eq;
  };
  const eq = fullSet('plate');
  eq.mainHand = makeItem({ base: 'greatsword' });
  eq.mainHand.material = 'iron';

  const proc = buildCharacter();
  const procR = dressRig(proc, eq, { light: false });
  const glb = buildGlbRig('human-medium', {});
  const glbR = dressRig(glb, eq, { light: false });

  check('full plate and a greatsword is the same 17 nodes on both bodies',
    glbR.nodes === procR.nodes && glbR.nodes === 17, `${glbR.nodes} on the glb, ${procR.nodes} on the procedural rig`);
  const pc = gearCounts(proc), gc = gearCounts(glb);
  check('and the same count on every anchor',
    Object.keys(pc).sort().join() === Object.keys(gc).sort().join() && Object.keys(pc).every((k) => pc[k] === gc[k]),
    JSON.stringify(gc));
  check('the greatsword is in the right hand of the bone rig',
    wornNodes(glb).some((w) => w.anchor === 'handR' && w.node.name === 'weapon:greatsword'));
  check('both hands close on it', glb.grip === 'two' && proc.grip === 'two');
  check('and the bill is the same, because it is the same armour',
    glbR.triangles === procR.triangles, `${glbR.triangles} triangles`);

  // where the sword actually is, which is the thing a screenshot would show.
  // Both bodies at rest, because an idle clip and poseCharacter's idle are two
  // different idles and that difference is not what is being measured.
  glb.group.updateMatrixWorld(true);
  proc.group.updateMatrixWorld(true);
  const gs = wornNodes(glb).find((w) => w.node.name === 'weapon:greatsword').node;
  const ps = wornNodes(proc).find((w) => w.node.name === 'weapon:greatsword').node;
  check('and at rest it hangs in the same place in the world on both',
    wp(gs).distanceTo(wp(ps)) < 0.10, `${wp(gs).distanceTo(wp(ps)).toFixed(3)} m apart: glb ${f3(wp(gs))}, procedural ${f3(wp(ps))}`);
  check('pointing the same way, so it is held and not carried sideways',
    wq(gs).angleTo(wq(ps)) < 0.15, `${(wq(gs).angleTo(wq(ps)) * 180 / Math.PI).toFixed(1)} degrees apart`);

  // A sword parented to a hand has to take the swing ONCE. The anchor's own
  // rotation is the delta channel AND the bone gets the delta composed onto
  // it, so this is exactly where a double application would show up: turn the
  // arm by 0.6 rad and the blade must turn by 0.6 rad, not 1.2.
  glb.update(1 / 60, 0);
  glb.group.updateMatrixWorld(true);
  const before = wq(gs);
  glb.update(1 / 60, 0);
  glb.parts.armR.rotation.x += 0.6;
  glb.group.updateMatrixWorld(true);
  const turned = wq(gs).angleTo(before);
  check('a held sword takes the swing once, through the arm, not twice',
    Math.abs(turned - 0.6) < 0.08, `the arm turned 0.600 rad and the blade turned ${turned.toFixed(3)}; twice would be 1.200`);

  glb.dispose(); proc.dispose();
}

// ===========================================================================
console.log('\nrig_glb: appearance');
{
  // This block is about the three Blender builds and their material slots, so
  // the appearance it uses has a gender with no studio body behind it, which
  // is the same path a player takes before human-male.glb has loaded.
  const rig = buildGlbRig(modelForBuild('average'), { appearance: { gender: 'none', build: 'average', skin: 'ebony', hairColour: 'silver', hairStyle: 'ponytail', mark: 'scar', height: 1.9 } });
  const hairMat = () => { let m = null; rig.group.traverse((o) => { if (o.isMesh && o.material?.name === 'hair') m = o.material; }); return m; };
  const skinMat = () => { let m = null; rig.group.traverse((o) => { if (o.isMesh && o.material?.name === 'skin') m = o.material; }); return m; };
  check('the skin takes the appearance colour', skinMat().color.getHex() === 0x462c1d, `#${skinMat().color.getHexString()}`);
  check('the hair takes its own', hairMat().color.getHex() === HAIR_COLOURS.silver, `#${hairMat().color.getHexString()}`);
  check('the height scales the whole body', near(rig.group.scale.x, 1.9 / BODY.HEIGHT, 1e-9), `${rig.group.scale.x.toFixed(4)}x`);
  let hair = 0, mark = 0;
  rig.parts.head.traverse((o) => { if (o.userData.rigHair) hair++; if (o.userData.rigMark) mark++; });
  check('a ponytail and a scar are on the head', hair > 1 && mark === 1, `${hair} hair meshes, ${mark} mark`);

  rig.setAppearance({ gender: 'none', build: 'average', hairStyle: 'shaved', mark: 'none' });
  let shavedHair = 0, bakedVisible = true;
  rig.parts.head.traverse((o) => { if (o.userData.rigHair) shavedHair++; });
  rig.group.traverse((o) => { if (o.isMesh && o.material?.name === 'hair') bakedVisible = o.visible; });
  check('shaved takes the cap off AND hides the head of hair the model was built with',
    shavedHair === 0 && bakedVisible === false, `${shavedHair} cap meshes, baked hair visible ${bakedVisible}`);

  check('the build picks the body', modelForBuild('slight') === 'human-slim' && modelForBuild('heavy') === 'human-heavy'
    && modelForBuild('nonsense') === BUILD_MODEL.average);
  const g = rig.group;
  rig.setAppearance({ gender: 'none', build: 'heavy', hairStyle: 'short' });
  check('changing the build swaps the body without changing the group',
    rig.modelId === 'human-heavy' && rig.group === g, rig.modelId);
  check('and the body it swapped away from is gone, not left standing inside it',
    g.children.filter((c) => c.name === 'glbScale').length === 1,
    `${g.children.length} children of the group`);
  rig.group.updateMatrixWorld(true);
  check('the heavier body still puts its hands where the contract says',
    wp(rig.parts.handR).distanceTo(new THREE.Vector3(0.270, 0.780, 0).multiplyScalar(1)) < 0.15,
    `handR at ${f3(wp(rig.parts.handR))}`);
  check('and every style openings.js offers builds a cap or is deliberately bare',
    HAIR_STYLES.every((s) => s === 'shaved' ? hairCap(s, 0x333333) === null : !!hairCap(s, 0x333333)),
    HAIR_STYLES.length + ' styles');
  check('and every mark builds a decal, none excepted',
    Object.keys(MARKS).every((m) => (m === 'none' ? markDecal(m) === null : !!markDecal(m))),
    Object.keys(MARKS).length + ' marks');
  rig.dispose();
}

// ===========================================================================
console.log('\nrig_glb: the studio bodies, named the Mixamo way');
{
  // The 51 joints the studio bodies carry, as a rest frame map of the shape
  // models.restFrames hands back. Written out rather than read off a file, so
  // the anchor resolution can be checked before the file has been delivered
  // and so a rename in the pipeline shows up here rather than on a player.
  const JOINTS = [
    ['Root', null], ['Hips', 'Root'],
    ['LeftUpLeg', 'Hips'], ['LeftLeg', 'LeftUpLeg'], ['LeftFoot', 'LeftLeg'], ['LeftToeBase', 'LeftFoot'], ['Socket_FootVFX_Left', 'LeftFoot'],
    ['RightUpLeg', 'Hips'], ['RightLeg', 'RightUpLeg'], ['RightFoot', 'RightLeg'], ['RightToeBase', 'RightFoot'], ['Socket_FootVFX_Right', 'RightFoot'],
    ['Spine', 'Hips'], ['Spine1', 'Spine'], ['Spine2', 'Spine1'],
    ['LeftShoulder', 'Spine2'], ['LeftArm', 'LeftShoulder'], ['LeftForeArm', 'LeftArm'], ['LeftHand', 'LeftForeArm'],
    ['LeftHandIndex1', 'LeftHand'], ['LeftHandIndex2', 'LeftHandIndex1'], ['LeftHandMiddle1', 'LeftHand'], ['LeftHandMiddle2', 'LeftHandMiddle1'],
    ['LeftHandPinky1', 'LeftHand'], ['LeftHandPinky2', 'LeftHandPinky1'], ['LeftHandRing1', 'LeftHand'], ['LeftHandRing2', 'LeftHandRing1'],
    ['LeftHandThumb1', 'LeftHand'], ['LeftHandThumb2', 'LeftHandThumb1'], ['Socket_HandVFX_Left', 'LeftHand'], ['Socket_Weapon_Left', 'LeftHand'],
    ['Neck', 'Spine2'], ['Head', 'Neck'], ['Socket_HeadVFX', 'Head'],
    ['RightShoulder', 'Spine2'], ['RightArm', 'RightShoulder'], ['RightForeArm', 'RightArm'], ['RightHand', 'RightForeArm'],
    ['RightHandIndex1', 'RightHand'], ['RightHandIndex2', 'RightHandIndex1'], ['RightHandMiddle1', 'RightHand'], ['RightHandMiddle2', 'RightHandMiddle1'],
    ['RightHandPinky1', 'RightHand'], ['RightHandPinky2', 'RightHandPinky1'], ['RightHandRing1', 'RightHand'], ['RightHandRing2', 'RightHandRing1'],
    ['RightHandThumb1', 'RightHand'], ['RightHandThumb2', 'RightHandThumb1'], ['Socket_HandVFX_Right', 'RightHand'], ['Socket_Weapon_Right', 'RightHand'],
    ['Socket_RootVFX', 'Root'],
  ];
  const rest = new Map(JOINTS.map(([name, parent]) => [name, {
    pos: new THREE.Vector3(), quat: new THREE.Quaternion(), parent,
  }]));
  check('the fake rest frame is the 51 joints the studio bodies promise', rest.size === 51, `${rest.size} joints`);
  const map = boneMapFrom(rest);
  check('every anchor resolves to a joint the body really has',
    PART_KEYS.every((k) => map[k] && rest.has(map[k])),
    PART_KEYS.map((k) => `${k}=${map[k]}`).join(' '));
  check('and not one of them fell through to the root, which is how gear ends up at the feet',
    PART_KEYS.every((k) => map[k] !== 'Root'),
    PART_KEYS.filter((k) => map[k] === 'Root').join(', ') || 'none on Root');
  check('the spine, the hips and the head are the ones named',
    map.hips === 'Hips' && map.torso === 'Spine1' && map.back === 'Spine2' && map.head === 'Head',
    `hips=${map.hips} torso=${map.torso} back=${map.back} head=${map.head}`);
  check('the hands are wrists, so the fist is not dropped a forearm lower',
    WRIST_BONES.includes(map.handL) && WRIST_BONES.includes(map.handR),
    `handL=${map.handL} handR=${map.handR}`);
  check('the mirror holds: the contract left rides the body\'s right',
    map.armL.startsWith('Right') && map.armR.startsWith('Left')
    && map.legL.startsWith('Right') && map.legR.startsWith('Left')
    && map.footL === 'RightFoot' && map.footR === 'LeftFoot',
    `armL=${map.armL} armR=${map.armR} legL=${map.legL} legR=${map.legR}`);
  check('the shins are the lower legs and not the upper ones',
    map.shinL === 'RightLeg' && map.shinR === 'LeftLeg' && map.legL === 'RightUpLeg' && map.legR === 'LeftUpLeg',
    `shinL=${map.shinL} legL=${map.legL}`);
  // and the same table still resolves a Blender body: one list, both schemes
  const blender = boneMapFor('human-medium');
  check('the same table still puts a Blender body\'s anchors where they were',
    blender.hips === 'hips' && blender.armL === 'upperarm_R' && blender.handR === 'hand_L' && blender.back === 'chest',
    PART_KEYS.map((k) => `${k}=${blender[k]}`).join(' '));

  // the gender rule, both directions
  const loadedMale = isLoaded('human-male'), loadedFemale = isLoaded('human-female');
  check('a gender with no body falls back to the build',
    modelForAppearance({ gender: 'none', build: 'slight' }) === 'human-slim'
    && modelForAppearance({ build: 'heavy' }) === (loadedMale ? 'human-male' : 'human-heavy'),
    `human-male loaded: ${loadedMale}`);
  check('GENDER_MODEL covers both of the genders the creation screen offers',
    GENDER_MODEL.male === 'human-male' && GENDER_MODEL.female === 'human-female',
    `male -> ${GENDER_MODEL.male}, female -> ${GENDER_MODEL.female}`);
  if (loadedMale && loadedFemale) {
    check('with the files loaded the gender picks the body, whatever the build',
      modelForAppearance({ gender: 'male', build: 'heavy' }) === 'human-male'
      && modelForAppearance({ gender: 'female', build: 'slight' }) === 'human-female');
    check('the two studio bodies are humanoid and can be dressed',
      isHumanoid('human-male') && isHumanoid('human-female'));
    // Which way a body faces, off the skeleton rather than off a silhouette:
    // the toes are in front of the ankles, and the anatomical left hand is at
    // +x, which is where a body facing +z with +y up has it. That second one
    // is the measurement the mirror rests on.
    for (const id of ['human-male', 'human-female']) {
      const rest = restFrames(id);
      const toe = rest.get('LeftToeBase').pos, foot = rest.get('LeftFoot').pos;
      const hand = rest.get('LeftHand').pos;
      check(`${id} faces +z, and its own left is at +x, which is what the mirror assumes`,
        toe.z - foot.z > 0.05 && hand.x > 0.1,
        `toes ${(toe.z - foot.z).toFixed(3)} m in front of the ankle, LeftHand at x ${hand.x.toFixed(3)}`);
    }
    for (const id of ['human-male', 'human-female']) {
      const report = anchorReport(id);
      const worst = PART_KEYS.reduce((a, k) => (report[k].d > a.d ? { k, d: report[k].d } : a), { k: '-', d: 0 });
      console.log(`       ${id}: ` + PART_KEYS.map((k) => `${k} ${report[k].d.toFixed(3)}`).join('  '));
      check(`${id}: the six anchors the gear tables care about are within 0.25 m of the procedural rig's`,
        ['handR', 'handL', 'head', 'back', 'footL', 'footR'].every((k) => report[k].d <= 0.25),
        `worst of all fourteen is ${worst.k} at ${worst.d.toFixed(3)} m`);
    }

    // The hair cap and the mark decal belong to a body with a 'hair' slot and
    // a box for a head. On a studio body they would be a second head of hair
    // over the first, so they are skipped, and this measures that they are.
    {
      const studio = buildGlbRig('human-male', { appearance: { gender: 'male', hairStyle: 'ponytail', mark: 'scar' } });
      let caps = 0, marks = 0;
      studio.parts.head.traverse((o) => { if (o.userData.rigHair) caps++; if (o.userData.rigMark) marks++; });
      check('a studio body wears no procedural hair cap and no decal',
        caps === 0 && marks === 0, `${caps} cap meshes, ${marks} mark meshes`);
      studio.dispose();
      const boxy = buildGlbRig('human-medium', { appearance: { gender: 'none', hairStyle: 'ponytail', mark: 'scar' } });
      let bCaps = 0, bMarks = 0;
      boxy.parts.head.traverse((o) => { if (o.userData.rigHair) bCaps++; if (o.userData.rigMark) bMarks++; });
      check('and a Blender body still wears both, which is the other direction',
        bCaps > 1 && bMarks === 1, `${bCaps} cap meshes, ${bMarks} mark meshes`);
      boxy.dispose();
    }

    // Dressed, because a body nobody can put a sword on is not a player body.
    // The same armour on the same anchors, and the blade measured against the
    // procedural rig's, which is what the HOLD table was tuned against.
    {
      const eq = {};
      for (const b of setOf('plate')) eq[b.slot] = makeItem({ base: b.id });
      for (const s of Object.keys(eq)) eq[s].material = 'iron';
      eq.mainHand = makeItem({ base: 'greatsword' });
      eq.mainHand.material = 'iron';
      const proc = buildCharacter();
      const procR = dressRig(proc, eq, { light: false });
      const male = buildGlbRig('human-male', {});
      const maleR = dressRig(male, eq, { light: false });
      check('a studio body wears the same 17 pieces as the procedural one',
        maleR.nodes === procR.nodes, `${maleR.nodes} on human-male, ${procR.nodes} on the procedural rig`);
      const pc = gearCounts(proc), gc = gearCounts(male);
      check('and hangs them on the same anchors',
        Object.keys(pc).sort().join() === Object.keys(gc).sort().join() && Object.keys(pc).every((k) => pc[k] === gc[k]),
        JSON.stringify(gc));
      check('the greatsword is in the right hand and both hands close on it',
        wornNodes(male).some((w) => w.anchor === 'handR' && w.node.name === 'weapon:greatsword') && male.grip === 'two');
      male.group.updateMatrixWorld(true);
      proc.group.updateMatrixWorld(true);
      const ms = wornNodes(male).find((w) => w.node.name === 'weapon:greatsword').node;
      const ps = wornNodes(proc).find((w) => w.node.name === 'weapon:greatsword').node;
      // 0.30 m, not the 0.10 m the Blender bodies are held to: the studio rest
      // pose puts the hands further out, and the number is printed so it is a
      // measurement and not a shrug.
      check('and at rest the blade is within 0.30 m of where it hangs on the procedural body',
        wp(ms).distanceTo(wp(ps)) < 0.30,
        `${wp(ms).distanceTo(wp(ps)).toFixed(3)} m apart: studio ${f3(wp(ms))}, procedural ${f3(wp(ps))}`);
      check('and it points the same way, so it is held and not carried sideways',
        wq(ms).angleTo(wq(ps)) < 0.30, `${(wq(ms).angleTo(wq(ps)) * 180 / Math.PI).toFixed(1)} degrees apart`);
      male.dispose(); proc.dispose();
    }
  } else {
    console.log('  note  human-male.glb and human-female.glb are not on disk, so the gender swap and the anchor distances were not measured');
  }
}

// ===========================================================================
console.log('\nrig_glb: every model, built and driven');
{
  let tris = 0, studioTris = 0;
  for (const id of READY) {
    const rig = buildGlbRig(id, {});
    rig.setAnim('walk');
    for (let i = 0; i < 10; i++) rig.update(1 / 60, 3);
    rig.setAnim('swing');
    for (let i = 0; i < 10; i++) rig.update(1 / 60, 3);
    rig.setAnim('die');
    for (let i = 0; i < 90; i++) rig.update(1 / 60, 0);
    rig.group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(rig.group);
    const t = modelTriangles(id);
    if (STUDIO.includes(id)) studioTris += t; else tris += t;
    check(`${id} builds, walks, swings, dies and is done`,
      rig.loaded && rig.dieDone === true && Number.isFinite(box.min.y),
      `${t} triangles, ${PART_KEYS.length} anchors, humanoid ${isHumanoid(id)}, die in ${clipDuration(id, 'die')} s`);
    rig.dispose();
  }
  const blender = READY.filter((id) => !STUDIO.includes(id));
  check('the Blender cast is still a small triangle bill', tris < 4000, `${tris} triangles across ${blender.length} models`);
  // The studio bodies are a different order of magnitude on purpose: player
  // bodies, not forty monsters. The budget is the validator's, and this is the
  // same number counted off the loaded geometry rather than off the file.
  const studioBudget = STUDIO.filter((id) => READY.includes(id)).length ? 90000 : 0;
  check('and the studio bodies are inside their own', studioTris <= studioBudget,
    `${studioTris} triangles across ${STUDIO.filter((id) => READY.includes(id)).length} studio models, budget ${studioBudget}`);
  if (LATE.length) console.log(`  note  ${LATE.join(', ')} were not driven: no file on disk`);
}

// ===========================================================================
console.log('\nrig_glb: feet on the floor, facing the way the contract says');
{
  for (const id of READY) {
    const rig = buildGlbRig(id, {});
    rig.group.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(rig.group);
    check(`${id} stands on y = 0`, Math.abs(box.min.y) < 0.02, `sole at ${box.min.y.toFixed(4)} m, crown at ${box.max.y.toFixed(3)} m`);
    rig.dispose();
  }
  // the head is in front of the heels, which is the only cheap way to say
  // "faces +z" about a body that is nearly symmetric
  const rig = buildGlbRig('human-medium', {});
  rig.group.updateMatrixWorld(true);
  let nose = -Infinity;
  rig.group.traverse((o) => { if (o.isMesh) { const b = new THREE.Box3().setFromObject(o); if (b.max.y > 1.4) nose = Math.max(nose, b.max.z); } });
  check('the face is on the +z side, so the body faces +z', nose > 0.05, `the head reaches z = ${nose.toFixed(3)}`);
  rig.dispose();
}

// ===========================================================================
console.log('\nrig_glb: a flinch and a death written the way effects.js writes them');
{
  const rig = buildGlbRig('human-medium', {});
  rig.setAnim('walk');
  const hipY = () => { rig.group.updateMatrixWorld(true); return wp(rig.parts.hips).y; };
  rig.update(1 / 60, 7);
  const standing = hipY();
  let lowest = standing;
  for (let i = 0; i < 30; i++) {
    rig.update(1 / 60, 7);
    const a = deathPose(i / 30);
    rig.parts.hips.position.y -= a.hipsDrop;
    rig.parts.hips.rotation.x += a.tip;
    rig.parts.legL.rotation.x += a.legL;
    rig.parts.legR.rotation.x += a.legR;
    lowest = Math.min(lowest, hipY());
  }
  check('a death pose drops the hips, so a position delta lands as well as a rotation',
    lowest < standing - 0.2, `${standing.toFixed(3)} m standing, ${lowest.toFixed(3)} m at the bottom`);
  rig.update(1 / 60, 7);
  check('and the hips come straight back up when nothing writes the drop',
    near(hipY(), standing, 0.06), `${hipY().toFixed(3)} m against ${standing.toFixed(3)} m`);

  let flinched = 0;
  const q0 = rig.parts.torso.parent.quaternion.clone();
  for (let i = 0; i < 18; i++) {
    rig.update(1 / 60, 0);
    const a = flinchPose(i / 18);
    rig.parts.torso.rotation.x += a.torsoX;
    rig.group.updateMatrixWorld(true);
    flinched = Math.max(flinched, rig.parts.torso.parent.quaternion.angleTo(q0));
  }
  check('a flinch bends the spine bone the delta was aimed at',
    flinched > 0.1, `${(flinched * 180 / Math.PI).toFixed(1)} degrees`);
  rig.dispose();
}

// ===========================================================================
console.log('\nrig_glb: the player, on a Blender body');
{
  const scene = new THREE.Group();
  const player = createGlbPlayer(scene, { build: 'average', height: 1.8 });
  check('it goes into the scene and answers createPlayer\'s surface',
    scene.children.includes(player.group)
    && ['group', 'pos', 'parts', 'state', 'grip', 'setAppearance', 'setAnim', 'update', 'teleport', 'dispose'].every((k) => player[k] !== undefined),
    `anim ${player.anim}, speed ${player.speed}`);
  const heightAt = () => 0;
  for (let i = 0; i < 90; i++) player.update(1 / 60, { x: 0, z: 1, sprint: true, yaw: 0 }, heightAt);
  check('holding forward walks him somewhere', player.pos.z > 3,
    `${player.pos.z.toFixed(2)} m in 1.5 s at ${player.speed.toFixed(1)} m/s`);
  check('and the rig knows it is running', player.rig.anim === 'run', player.rig.anim);
  for (let i = 0; i < 90; i++) player.update(1 / 60, { x: 0, z: 0, yaw: 0 }, heightAt);
  check('letting go stops him and puts him back to idle',
    player.speed < 0.01 && player.rig.anim === 'idle', `${player.speed.toFixed(3)} m/s, ${player.rig.anim}`);
  player.teleport(100, 200, heightAt);
  check('teleport moves him and stops him dead',
    player.pos.x === 100 && player.pos.z === 200 && player.speed === 0);
  player.dispose();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
