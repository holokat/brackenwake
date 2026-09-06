// The shape of a lightning bolt: endpoint anchored, midpoint displaced.
//
// PORTED from the studio's src/vfx/spells/lightningGeometry.ts. The point
// count must be 2^n + 1 so every pass halves the stride and adds a smaller
// scale of detail; a wrong count throws rather than drawing a straight line.

import * as THREE from 'three';

const direction = new THREE.Vector3();
const side = new THREE.Vector3();
const depth = new THREE.Vector3();
const reference = new THREE.Vector3();

function signedNoise(seed, index, channel) {
  const value = Math.sin(seed * 127.1 + index * 311.7 + channel * 74.7) * 43758.5453;
  return (value - Math.floor(value)) * 2 - 1;
}

export function writeHierarchicalBolt(points, start, end, seed, amplitude, roughness = 0.5) {
  const last = points.length - 1;
  if (last < 2 || (last & (last - 1)) !== 0) throw new Error('A hierarchical bolt needs 2^n + 1 points.');

  points[0].copy(start);
  points[last].copy(end);
  direction.copy(end).sub(start);
  if (direction.lengthSq() < 1e-10) direction.set(0, -1, 0);
  direction.normalize();
  reference.set(0, 1, 0);
  if (Math.abs(direction.y) > 0.82) reference.set(1, 0, 0);
  side.crossVectors(direction, reference).normalize();
  depth.crossVectors(direction, side).normalize();

  const boundedRoughness = THREE.MathUtils.clamp(roughness, 0.25, 0.82);
  let stride = last >> 1;
  let displacement = Math.max(0, amplitude);
  let level = 0;
  while (stride >= 1) {
    const span = stride << 1;
    for (let index = stride; index < last; index += span) {
      const envelope = Math.sin((index / last) * Math.PI);
      points[index]
        .copy(points[index - stride])
        .add(points[index + stride])
        .multiplyScalar(0.5)
        .addScaledVector(side, signedNoise(seed, index, level) * displacement * envelope)
        .addScaledVector(depth, signedNoise(seed + 19, index, level + 7) * displacement * 0.72 * envelope);
    }
    stride >>= 1;
    displacement *= boundedRoughness;
    level += 1;
  }
}
