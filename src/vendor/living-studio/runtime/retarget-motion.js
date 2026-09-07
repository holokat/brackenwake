import * as THREE from 'three';

// The source is Y-up, facing +Z, with anatomical right on -X. The native
// character is Z-up, facing -Y, with anatomical right on +X. This is a
// reflection, not a quaternion rotation. Rotations use C R C^-1 below.
export function sourceVectorToNative(value, target = new THREE.Vector3()) {
  return target.set(-value.x, -value.z, value.y);
}

export function sourceQuaternionToNative(value, target = new THREE.Quaternion()) {
  return target.set(value.x, value.z, -value.y, value.w).normalize();
}

const JOINT_MAP = [
  ['hips', 'Hips'],
  // The source's extra lumbar joint is folded into the native spine through
  // its cumulative world orientation, so Spine1 motion is never discarded.
  ['spine', 'Spine1'], ['chest', 'Spine2'], ['neck', 'Neck'], ['head', 'Head'],
  ...['L', 'R'].flatMap(side => {
    const source = side === 'L' ? 'Left' : 'Right';
    return [
      [`upperArm${side}`, `${source}Arm`, `${source}ForeArm`, `forearm${side}`],
      [`forearm${side}`, `${source}ForeArm`, `${source}Hand`, `hand${side}`],
      [`hand${side}`, `${source}Hand`],
      [`thigh${side}`, `${source}UpLeg`, `${source}Leg`, `shin${side}`],
      [`shin${side}`, `${source}Leg`, `${source}Foot`, `foot${side}`],
      [`foot${side}`, `${source}Foot`],
    ];
  }),
];

/** Retarget the sampled canonical pose without modifying the native bind pose. */
export function createMotionRetargeter(sourceRoot, rig) {
  if (!rig?.joints?.hips || !rig.rest) throw new Error('Source motion requires a bound native character.');
  rig.reset();
  rig.group.updateWorldMatrix(true, true);
  sourceRoot.updateWorldMatrix(true, true);

  const sourceOriginInverse = sourceRoot.matrixWorld.clone().invert();
  const sourceRootRotationInverse = sourceRoot.getWorldQuaternion(new THREE.Quaternion()).invert();
  const nativeOriginInverse = rig.group.matrixWorld.clone().invert();
  const nativeRootRotationInverse = rig.group.getWorldQuaternion(new THREE.Quaternion()).invert();
  const sourceLocalPosition = object => object.getWorldPosition(new THREE.Vector3()).applyMatrix4(sourceOriginInverse);
  const nativeLocalPosition = object => object.getWorldPosition(new THREE.Vector3()).applyMatrix4(nativeOriginInverse);
  const entries = JOINT_MAP.map(([nativeName, sourceName, sourceChild, nativeChild]) => {
    const source = sourceRoot.getObjectByName(sourceName), target = rig.joints[nativeName];
    if (!source || !target) throw new Error(`Cannot retarget ${sourceName} to ${nativeName}.`);
    const sourceRest = source.getWorldQuaternion(new THREE.Quaternion()).premultiply(sourceRootRotationInverse);
    const nativeRest = target.getWorldQuaternion(new THREE.Quaternion()).premultiply(nativeRootRotationInverse);
    const alignment = new THREE.Quaternion();
    if (sourceChild && nativeChild) {
      const sourceEnd = sourceRoot.getObjectByName(sourceChild), nativeEnd = rig.joints[nativeChild];
      if (!sourceEnd || !nativeEnd) throw new Error(`Missing retarget segment ${sourceName}.`);
      const sourceDirection = sourceVectorToNative(sourceLocalPosition(sourceEnd).sub(sourceLocalPosition(source))).normalize();
      const nativeDirection = nativeLocalPosition(nativeEnd).sub(nativeLocalPosition(target)).normalize();
      if (sourceDirection.lengthSq() < .9 || nativeDirection.lengthSq() < .9) {
        throw new Error(`Degenerate bind segment ${sourceName}.`);
      }
      alignment.setFromUnitVectors(nativeDirection, sourceDirection);
    } else if (nativeName.startsWith('hand')) {
      // Every native block fist points down in its bind geometry, including the
      // mage's fist on its horizontal staff forearm. Its frame must therefore
      // be calibrated independently of that forearm's segment alignment.
      const sourcePalm = sourceVectorToNative(new THREE.Vector3(0, 1, 0).applyQuaternion(sourceRest));
      const nativePalm = new THREE.Vector3(0, 0, -1).applyQuaternion(nativeRest);
      alignment.setFromUnitVectors(nativePalm.normalize(), sourcePalm.normalize());
    }
    const entry = {
      source, target, nativeName, sourceName, alignment,
      // World-space rest-axis alignment handles different arm rests, including
      // the mage's bent staff forearm, while all native local offsets stay fixed.
      correction: sourceQuaternionToNative(sourceRest).invert().multiply(alignment).multiply(nativeRest),
      world: new THREE.Quaternion(),
    };
    return entry;
  });

  const hips = sourceRoot.getObjectByName('Hips');
  const sourceHipsRest = sourceLocalPosition(hips);
  if (!(sourceHipsRest.y > 0)) throw new Error('Canonical source hips must be above the floor.');
  const scale = rig.rest.hips.p.z / sourceHipsRest.y;
  const rootRotation = new THREE.Quaternion(), parentRotation = new THREE.Quaternion();
  const sourceRotation = new THREE.Quaternion(), currentOriginInverse = new THREE.Matrix4();
  const sourceRotationInverse = new THREE.Quaternion(), displacement = new THREE.Vector3();
  const sourceSoles = sourceRoot.userData.soleSamples ?? [];
  const nativeSoles = [];
  rig.group.traverse(mesh => {
    if (mesh.isSkinnedMesh && mesh.visible && /sole|bare foot/i.test(mesh.name)) nativeSoles.push(mesh);
  });
  const samplePoint = new THREE.Vector3(), blendedPoint = new THREE.Vector3();
  const nativeInverse = new THREE.Matrix4();

  return {
    scale,
    pairs: entries.map(({nativeName, sourceName}) => ({nativeName, sourceName})),
    sourceToTarget(value, target = new THREE.Vector3()) {
      return sourceVectorToNative(value, target).multiplyScalar(scale);
    },
    groundOffset: 0,
    sourceSoleHeight: null,
    sourceTargetSoleHeight: null,
    targetSoleHeight: null,
    apply(travel, ground = true, runHipHeight = null) {
      rig.reset();
      sourceRoot.updateWorldMatrix(true, true);
      rig.group.updateWorldMatrix(true, true);
      currentOriginInverse.copy(sourceRoot.matrixWorld).invert();
      sourceRoot.getWorldQuaternion(sourceRotationInverse).invert();
      rig.group.getWorldQuaternion(rootRotation);
      // Evaluate every source orientation before changing any native transform.
      for (const entry of entries) {
        entry.source.getWorldQuaternion(sourceRotation).premultiply(sourceRotationInverse);
        sourceQuaternionToNative(sourceRotation, entry.world).multiply(entry.correction).premultiply(rootRotation).normalize();
      }
      hips.getWorldPosition(displacement).applyMatrix4(currentOriginInverse).sub(sourceHipsRest);
      if (travel) displacement.add(travel);
      this.sourceToTarget(displacement, displacement);
      rig.joints.hips.position.copy(rig.rest.hips.p).add(displacement);
      for (const entry of entries) {
        entry.target.parent.getWorldQuaternion(parentRotation).invert();
        entry.target.quaternion.copy(parentRotation).multiply(entry.world).normalize();
        entry.target.updateWorldMatrix(false, false);
      }
      rig.group.updateWorldMatrix(true, true);
      this.groundOffset = 0;
      this.sourceSoleHeight = null;
      this.sourceTargetSoleHeight = null;
      this.targetSoleHeight = null;
      if (ground && sourceSoles.length && nativeSoles.length) {
        let sourceFloor = Infinity, nativeFloor = Infinity;
        for (const parts of sourceSoles) {
          blendedPoint.set(0, 0, 0);
          for (const part of parts) blendedPoint.addScaledVector(
            samplePoint.copy(part.point).applyMatrix4(part.bone.matrixWorld), part.weight,
          );
          blendedPoint.applyMatrix4(currentOriginInverse);
          sourceFloor = Math.min(sourceFloor, blendedPoint.y);
        }
        nativeInverse.copy(rig.group.matrixWorld).invert();
        rig.skeleton.update();
        for (const mesh of nativeSoles) {
          if (!mesh.visible) continue;
          // Object3D.updateWorldMatrix does not invoke SkinnedMesh's attached
          // bind-matrix refresh. Match the rendered skin after actor transforms.
          mesh.updateMatrixWorld(true);
          const positions = mesh.geometry.attributes.position;
          for (let index = 0; index < positions.count; index++) {
            samplePoint.fromBufferAttribute(positions, index);
            mesh.applyBoneTransform(index, samplePoint).applyMatrix4(mesh.matrixWorld).applyMatrix4(nativeInverse);
            nativeFloor = Math.min(nativeFloor, samplePoint.z);
          }
        }
        if (Number.isFinite(nativeFloor)) {
          this.sourceSoleHeight = Math.max(0, sourceFloor);
          // Preserve the original source's flight height, plus explicit ability
          // travel. Only the discrepancy caused by the native soles is removed.
          this.sourceTargetSoleHeight = (this.sourceSoleHeight + (travel?.y ?? 0)) * scale;
          this.targetSoleHeight = this.sourceTargetSoleHeight;
          this.groundOffset = this.targetSoleHeight - nativeFloor;
          if (runHipHeight !== null) {
            // The run calibration deliberately smooths the pelvis, including
            // the imported linear hip keys. Keep its original source flight
            // target separate from the calibrated target, and enforce the real
            // current sole floor even between the calibration samples.
            this.groundOffset = Math.max(runHipHeight - rig.joints.hips.position.z, -nativeFloor);
            this.targetSoleHeight = nativeFloor + this.groundOffset;
          }
          rig.joints.hips.position.z += this.groundOffset;
          rig.group.updateWorldMatrix(true, true);
        }
      }
    },
    reset() {
      rig.reset(); rig.group.updateWorldMatrix(true, true);
      this.groundOffset = 0; this.sourceSoleHeight = null; this.sourceTargetSoleHeight = null; this.targetSoleHeight = null;
    },
  };
}
