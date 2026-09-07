import * as THREE from 'three';
import {
  MOVE_CATALOG, createProceduralClips, createAuthoredAnimationLibrary, mergeAnimationLibraries,
  createSpellcastingPose, createElementalSpellPose, createAbilityPose,
  createTwoHandedWeaponController, createTrainingSword, createTrainingShield, sampleActionTravel,
} from '../vendor/source-library.js';
import {createMotionRetargeter, sourceQuaternionToNative} from './retarget-motion.js';
import {createRunGrounding} from './run-grounding.js';
import {isOneHandedWeapon} from '../models/equipment-grips.js';
import {applyShieldBashBody} from '../models/shield-motion.js';

export const SOURCE_MOTION_URLS = Object.freeze({
  rig: '/studio/public/models/warrior-base-rigged.glb',
  bank: '/studio/public/animations/quaternius-retargeted.json',
});

async function request(url, type) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Source animation request failed (${response.status}): ${url}`);
  return response[type]();
}

function readSoleSamples(gltf, data, objects, binaryOffset) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const types = {5121: ['getUint8', 1], 5123: ['getUint16', 2], 5126: ['getFloat32', 4]};
  function accessor(index) {
    const a = gltf.accessors[index], buffer = gltf.bufferViews[a.bufferView], type = types[a.componentType];
    if (!type || a.sparse || buffer.buffer !== 0) throw new Error('Unsupported canonical sole accessor.');
    const width = a.type === 'VEC3' ? 3 : 4, stride = buffer.byteStride ?? width * type[1];
    const start = binaryOffset + (buffer.byteOffset ?? 0) + (a.byteOffset ?? 0);
    return {count: a.count, value(vertex, component) {
      const offset = start + vertex * stride + component * type[1];
      const value = view[type[0]](offset, true);
      return a.normalized && a.componentType !== 5126 ? value / (a.componentType === 5121 ? 255 : 65535) : value;
    }};
  }
  const samples = [], point = new THREE.Vector3();
  gltf.nodes.forEach((node, nodeIndex) => {
    if (node.mesh === undefined || node.skin === undefined) return;
    const skin = gltf.skins[node.skin];
    for (const primitive of gltf.meshes[node.mesh].primitives) {
      const positions = accessor(primitive.attributes.POSITION), joints = accessor(primitive.attributes.JOINTS_0);
      const weights = accessor(primitive.attributes.WEIGHTS_0);
      const inverses = skin.joints.map(index => objects[index].matrixWorld.clone().invert());
      for (let vertex = 0; vertex < positions.count; vertex++) {
        point.set(positions.value(vertex, 0), positions.value(vertex, 1), positions.value(vertex, 2))
          .applyMatrix4(objects[nodeIndex].matrixWorld);
        // The verified canonical model is 1.8 m tall with its sole plane at 0.
        // Retain its actual bottom 4 cm, including blended ankle/toe weights.
        if (point.y > .04) continue;
        const parts = [];
        let footWeight = 0;
        for (let component = 0; component < 4; component++) {
          const weight = weights.value(vertex, component);
          if (weight <= 0) continue;
          const joint = joints.value(vertex, component), bone = objects[skin.joints[joint]];
          if (/Foot|ToeBase/.test(bone.name)) footWeight += weight;
          parts.push({bone, weight, point: point.clone().applyMatrix4(inverses[joint])});
        }
        if (footWeight > .5) samples.push(parts);
      }
    }
  });
  if (!samples.length) throw new Error('Canonical rig has no measurable sole vertices.');
  return samples;
}

/** Read only the original GLB node hierarchy. Meshes and textures never enter the editor. */
export function readSourceRig(buffer) {
  const data = ArrayBuffer.isView(buffer)
    ? new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength) : new Uint8Array(buffer);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (data.byteLength < 20 || view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2) {
    throw new Error('Canonical animation rig is not a valid GLB 2 asset.');
  }
  const length = view.getUint32(12, true);
  if (view.getUint32(16, true) !== 0x4e4f534a || length + 20 > data.byteLength) {
    throw new Error('Canonical animation rig has an invalid JSON chunk.');
  }
  const gltf = JSON.parse(new TextDecoder().decode(data.subarray(20, 20 + length)));
  if (!Array.isArray(gltf.nodes) || !gltf.scenes?.[gltf.scene ?? 0]) throw new Error('Canonical rig has no scene.');
  const joints = new Set((gltf.skins ?? []).flatMap(skin => skin.joints));
  const objects = gltf.nodes.map((node, index) => {
    const object = joints.has(index) ? new THREE.Bone() : new THREE.Group();
    object.name = node.name ?? `SourceNode${index}`;
    if (node.matrix) new THREE.Matrix4().fromArray(node.matrix).decompose(object.position, object.quaternion, object.scale);
    else {
      if (node.translation) object.position.fromArray(node.translation);
      if (node.rotation) object.quaternion.fromArray(node.rotation).normalize();
      if (node.scale) object.scale.fromArray(node.scale);
    }
    return object;
  });
  gltf.nodes.forEach((node, index) => (node.children ?? []).forEach(child => {
    if (!objects[child]) throw new Error('Canonical rig references a missing child.');
    objects[index].add(objects[child]);
  }));
  const root = new THREE.Group();
  root.name = 'CanonicalSourceCharacter';
  for (const index of gltf.scenes[gltf.scene ?? 0].nodes) root.add(objects[index]);
  root.updateMatrixWorld(true);
  const binaryHeader = 20 + length;
  if (binaryHeader + 8 > data.byteLength || view.getUint32(binaryHeader + 4, true) !== 0x004e4942) {
    throw new Error('Canonical animation rig has no geometry buffer for sole calibration.');
  }
  root.userData.soleSamples = readSoleSamples(gltf, data, objects, binaryHeader + 8);
  return root;
}

let defaultAssets;
async function loadAssets(options) {
  const read = async () => {
    const [binary, bank] = await Promise.all([
      (options.loadBinary ?? (url => request(url, 'arrayBuffer')))(SOURCE_MOTION_URLS.rig),
      (options.loadJSON ?? (url => request(url, 'json')))(SOURCE_MOTION_URLS.bank),
    ]);
    const authoredLibrary = createAuthoredAnimationLibrary(bank);
    if (!authoredLibrary.available) throw new Error('The original authored animation bank contains no supported clips.');
    const procedural = createProceduralClips(readSourceRig(binary));
    const clips = mergeAnimationLibraries(procedural, authoredLibrary.clips);
    for (const move of MOVE_CATALOG) if (!clips.has(move.id)) throw new Error(`Missing source clip ${move.id}.`);
    return {binary, clips, authoredLibrary};
  };
  if (options.loadBinary || options.loadJSON) return read();
  defaultAssets ??= read().catch(error => { defaultAssets = undefined; throw error; });
  return defaultAssets;
}

function createClipSampler(root, clips) {
  const bindings = new Map();
  for (const [id, clip] of clips) {
    bindings.set(id, clip.tracks.map(track => {
      const path = THREE.PropertyBinding.parseTrackName(track.name);
      const node = root.getObjectByName(path.nodeName);
      if (!node || !['quaternion', 'position', 'scale'].includes(path.propertyName)) {
        throw new Error(`Unsupported original animation track ${track.name}.`);
      }
      if (id === 'run' && path.propertyName === 'quaternion') {
        // A few authored arm tracks have different first/last rotations. Close
        // the sampled loop locally, keeping the shared source assets intact.
        const end = track.values.length - 4;
        if (track.values.subarray(0, 4).some((value, index) => value !== track.values[end + index])) {
          track = track.clone();
          const rotation = new THREE.Quaternion().fromArray(track.values).slerp(
            new THREE.Quaternion().fromArray(track.values, end), .5).normalize();
          rotation.toArray(track.values, 0); rotation.toArray(track.values, end);
        }
      }
      return {target: node[path.propertyName], interpolate: track.createInterpolant()};
    }));
  }
  return (move, time) => {
    const tracks = bindings.get(move);
    if (!tracks) throw new Error(`Unknown source motion ${move}.`);
    for (const {target, interpolate} of tracks) target.fromArray(interpolate.evaluate(time));
  };
}

/**
 * Deterministic source pose sampling. phase is the source clip phase; actionPhase
 * is the ability's windup/release/recovery phase, which drives pose and travel.
 * The controller may assign actor.previewEquipment before sampling.
 */
export async function createSourceMotion(actor, options = {}) {
  if (!actor?.rig) throw new Error('Source motion requires a rigged character.');
  const {binary, clips, authoredLibrary} = await loadAssets(options);
  const sourceRoot = readSourceRig(binary), sourceActor = new THREE.Group();
  sourceActor.name = 'CanonicalSourceActor';
  sourceActor.add(sourceRoot);
  const mapping = createMotionRetargeter(sourceRoot, actor.rig);
  const bone = name => {
    const result = sourceRoot.getObjectByName(name);
    if (!result) throw new Error(`Canonical source is missing ${name}.`);
    return result;
  };
  const arms = {
    leftArm: bone('LeftArm'), leftForearm: bone('LeftForeArm'), leftHand: bone('LeftHand'),
    rightArm: bone('RightArm'), rightForearm: bone('RightForeArm'), rightHand: bone('RightHand'),
  };
  // These original invisible props provide the exact grip targets used by the
  // source weapon controller. Visible equipment remains the native editor's.
  const sword = createTrainingSword(sourceActor), shield = createTrainingShield(sourceActor);
  const equipment = createTwoHandedWeaponController({sword, shield, ...arms});
  const spell = createSpellcastingPose({actor: sourceActor, ...arms});
  const elemental = createElementalSpellPose({root: sourceActor, ...arms});
  const abilityPose = createAbilityPose(sourceRoot, sourceActor);
  const rest = [];
  sourceActor.traverse(node => rest.push({node, p: node.position.clone(), q: node.quaternion.clone(), s: node.scale.clone()}));
  const sampleClip = createClipSampler(sourceRoot, clips), travel = new THREE.Vector3();
  const propQuaternion = new THREE.Quaternion(), actorQuaternion = new THREE.Quaternion();
  // Native and source blades both run along prop-local +Z, but their normal
  // axes differ after the world-coordinate reflection. This frame keeps the
  // blade line and broad face; the symmetric blade's lateral X is reflected.
  const bladeFrame = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  const catalog = MOVE_CATALOG.map(move => ({
    ...move, duration: clips.get(move.id).duration,
    authored: authoredLibrary.authoredMoves.has(move.id), sourceDuration: move.duration,
  }));
  let disposed = false, currentSample = null;
  function restoreSource() {
    for (const {node, p, q, s} of rest) { node.position.copy(p); node.quaternion.copy(q); node.scale.copy(s); }
    sourceActor.updateMatrixWorld(true);
  }
  const runGrounding = createRunGrounding(phase => {
    restoreSource();
    sampleClip('run', phase * clips.get('run').duration);
    mapping.apply(null);
    return {height: actor.rig.joints.hips.position.z, soleHeight: mapping.targetSoleHeight};
  });
  restoreSource(); mapping.reset();
  return {
    clips, catalog, authoredLibrary, sourceRoot, sourceActor, mapping, scale: mapping.scale,
    get currentSample() { return currentSample; },
    nativeWeaponQuaternion(out = new THREE.Quaternion()) {
      sword.root.getWorldQuaternion(propQuaternion);
      sourceQuaternionToNative(propQuaternion, out).multiply(bladeFrame);
      actor.group.getWorldQuaternion(actorQuaternion);
      return out.premultiply(actorQuaternion).normalize();
    },
    nativeShieldQuaternion(out = new THREE.Quaternion()) {
      shield.root.getWorldQuaternion(propQuaternion);
      sourceQuaternionToNative(propQuaternion, out);
      actor.group.getWorldQuaternion(actorQuaternion);
      return out.premultiply(actorQuaternion).normalize();
    },
    sample(moveId, phase, ability, actionPhase = phase) {
      if (disposed) throw new Error('Cannot sample a disposed source motion adapter.');
      if (!Number.isFinite(phase) || !Number.isFinite(actionPhase)) throw new Error('Motion phases must be finite.');
      const loadout = actor.group.userData.loadout || [];
      // A shield occupies the support hand. Use the existing one-handed heavy
      // clip when this loadout previews an attack authored for two hands.
      if (moveId === 'two-handed-strike' && loadout.some(item => item.userData.gripSocket?.kind === 'shield') &&
        loadout.some(item => item.userData.slot === 'weapon' && isOneHandedWeapon(item.userData.itemId))) moveId = 'heavy-attack';
      const clip = clips.get(moveId);
      if (!clip) throw new Error(`Unknown source motion ${moveId}.`);
      const normalized = THREE.MathUtils.clamp(phase, 0, 1), action = THREE.MathUtils.clamp(actionPhase, 0, 1);
      restoreSource();
      // Reset the source helpers' repeated-frame caches before sampling. This
      // makes reverse seeks and revisiting the same phase independent of history.
      spell.update('idle', 0); elemental.update('idle', 0);
      // The live equipment controller remembers carry-to-strike transitions.
      // A canonical non-weapon frame clears that history before an editor seek.
      equipment.setEquipment('unarmed');
      equipment.update('cast', 0);
      restoreSource();
      sampleClip(moveId, normalized * clip.duration);
      sourceActor.updateMatrixWorld(true);
      spell.update(moveId, normalized);
      elemental.update(moveId, normalized);
      if (ability) abilityPose.sample(ability, action);
      const mode = actor.previewEquipment ?? (moveId === 'two-handed-strike' ? 'greatsword'
        : ['light-attack', 'heavy-attack', 'combat-idle', 'whirlwind'].includes(moveId) ? 'sword-shield' : 'unarmed');
      if (!['unarmed', 'sword-shield', 'greatsword'].includes(mode)) throw new Error(`Unknown preview equipment mode ${mode}.`);
      equipment.setEquipment(mode);
      equipment.update(moveId, normalized, undefined, authoredLibrary.authoredMoves.has(moveId), !!ability);
      sourceActor.updateMatrixWorld(true);
      if (ability) sampleActionTravel(ability.id, action, travel); else travel.set(0, 0, 0);
      mapping.apply(travel, !['die', 'surface-swim', 'tread-water'].includes(moveId),
        moveId === 'run' && !ability ? runGrounding(normalized) : null);
      if (ability?.id === 'shield-bash' && loadout.some(item => item.userData.gripSocket?.kind === 'shield')) {
        // The source ability snaps from its sword clip into a thrust overlay.
        // A physical shield uses the shared continuous bash body instead.
        actor.rig.reset(); applyShieldBashBody(actor.rig, action);
        actor.group.updateWorldMatrix(true, true);
      }
      currentSample = {moveId, phase: normalized, actionPhase: action, abilityId: ability?.id, abilityPose: ability?.visual?.pose, abilityFamily: ability?.visual?.family, duration: clip.duration, travel: travel.clone()};
      return currentSample;
    },
    reset() { if (!disposed) { restoreSource(); mapping.reset(); } },
    dispose() {
      if (disposed) return;
      mapping.reset(); sword.dispose(); shield.dispose(); sourceActor.clear(); disposed = true;
    },
  };
}
