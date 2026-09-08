// The melee half: a blade trail sampled between swing-trail and swing-impact,
// and the pooled rings and bursts a whirlwind pulse, a landing and a fizzle
// throw.
//
// PORTED from the studio's src/vfx/createSwordSweepTrail.ts (the ribbon, whole)
// and src/vfx/createCombatVfx.ts (the ring and burst shapes).
//
// ONE DELIBERATE CHANGE. The studio allocated a fresh geometry and material per
// ring and per burst and disposed them when the effect ended. Brackenwake fires
// these from a whirlwind at two pulses a swing, so they are POOLED here: a
// fixed eight rings and four bursts, reused, and a ninth request takes the
// oldest instead of allocating. Counting the slots before adding to a container
// is house rule; see CLAUDE.md.

import * as THREE from 'three';
import { enableSpellBloom } from './bloom.js';

const RING_SLOTS = 8;
const BURST_SLOTS = 4;
const BURST_POINTS = 26;

/** A bounded ribbon of recent blade positions, sampled after the current pose. */
export function createSwordSweepTrail(scene, sample) {
  const capacity = 16;
  const lifetime = 0.1;
  const positions = new Float32Array(capacity * 6);
  const colors = new Float32Array(capacity * 6);
  const ages = new Float32Array(capacity);
  const indices = [];
  for (let i = 0; i < capacity - 1; i += 1) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage);
  const colorAttribute = new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', positionAttribute);
  geometry.setAttribute('color', colorAttribute);
  geometry.setIndex(indices);
  geometry.setDrawRange(0, 0);
  const material = enableSpellBloom(new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0.48, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }));
  const ribbon = new THREE.Mesh(geometry, material);
  ribbon.name = 'BladeSweepTrail';
  ribbon.frustumCulled = false;
  ribbon.visible = false;
  if (scene && scene.add) scene.add(ribbon);
  const base = new THREE.Vector3();
  const tip = new THREE.Vector3();
  const color = new THREE.Color('#a0ffcf');
  let count = 0;
  let remaining = 0;

  return {
    mesh: ribbon,
    get running() { return remaining > 0; },
    setColour(hex) { color.set(hex); return this; },
    begin(duration) {
      count = 0;
      remaining = duration;
      ribbon.visible = false;
      geometry.setDrawRange(0, 0);
    },
    stop() { remaining = 0; },
    update(delta) {
      if (delta <= 0) return;
      for (let i = 0; i < count; i += 1) ages[i] += delta;
      if (remaining > 0 && sample(base, tip)) {
        if (count === capacity) {
          positions.copyWithin(0, 6);
          ages.copyWithin(0, 1);
          count -= 1;
        }
        // Restrict the ribbon to the blade, keeping the hand silhouette clear.
        base.lerp(tip, 0.3);
        base.toArray(positions, count * 6);
        tip.toArray(positions, count * 6 + 3);
        ages[count] = 0;
        count += 1;
      }
      remaining = Math.max(0, remaining - delta);
      let first = 0;
      while (first < count && ages[first] >= lifetime) first += 1;
      for (let i = first; i < count; i += 1) {
        const strength = Math.pow(1 - ages[i] / lifetime, 2);
        for (let side = 0; side < 2; side += 1) {
          const offset = i * 6 + side * 3;
          colors[offset] = color.r * strength;
          colors[offset + 1] = color.g * strength;
          colors[offset + 2] = color.b * strength;
        }
      }
      ribbon.visible = count - first >= 2;
      geometry.setDrawRange(first * 6, Math.max(0, count - first - 1) * 6);
      positionAttribute.needsUpdate = true;
      colorAttribute.needsUpdate = true;
    },
    dispose() {
      if (ribbon.parent) ribbon.parent.remove(ribbon);
      geometry.dispose();
      material.dispose();
    },
  };
}

/**
 * Rings and bursts, pooled. `ring` is the ground shock of a whirlwind pulse or
 * a landing; `burst` is the spray of a contact or a fizzle. Both take world
 * coordinates and are parented to `parent`.
 */
export function createCombatAccents(parent) {
  const group = new THREE.Group();
  group.name = 'CombatAccents';
  parent.add(group);
  const ringGeometry = new THREE.TorusGeometry(1, 0.013, 8, 64);
  const rings = Array.from({ length: RING_SLOTS }, () => {
    const material = enableSpellBloom(new THREE.MeshBasicMaterial({
      color: '#36ff93', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    const mesh = new THREE.Mesh(ringGeometry, material);
    mesh.visible = false;
    mesh.frustumCulled = false;
    group.add(mesh);
    return { mesh, material, age: 0, duration: 0, radius: 0.55, live: false };
  });
  const bursts = Array.from({ length: BURST_SLOTS }, () => {
    const positions = new Float32Array(BURST_POINTS * 3);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
    const material = enableSpellBloom(new THREE.PointsMaterial({
      color: '#b6ffdc', size: 0.035, sizeAttenuation: true,
      transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    const points = new THREE.Points(geometry, material);
    points.visible = false;
    points.frustumCulled = false;
    group.add(points);
    const velocities = Array.from({ length: BURST_POINTS }, () => new THREE.Vector3());
    return { points, geometry, material, velocities, age: 0, duration: 0, live: false };
  });
  let ringCursor = 0;
  let burstCursor = 0;

  function takeRing() {
    for (const slot of rings) if (!slot.live) return slot;
    const slot = rings[ringCursor % RING_SLOTS];
    ringCursor += 1;
    return slot;
  }
  function takeBurst() {
    for (const slot of bursts) if (!slot.live) return slot;
    const slot = bursts[burstCursor % BURST_SLOTS];
    burstCursor += 1;
    return slot;
  }

  return {
    group,
    get liveRings() { return rings.filter((r) => r.live).length; },
    get liveBursts() { return bursts.filter((b) => b.live).length; },
    ring(position, options = {}) {
      const slot = takeRing();
      slot.radius = options.radius === undefined ? 0.55 : options.radius;
      slot.duration = options.duration === undefined ? 0.58 : options.duration;
      slot.age = 0;
      slot.live = true;
      slot.material.color.set(options.colour || '#36ff93');
      slot.material.opacity = 0.88;
      slot.mesh.position.copy(position);
      slot.mesh.rotation.set(options.flat === false ? 0 : Math.PI / 2, 0, 0);
      slot.mesh.scale.setScalar(0.2 * slot.radius);
      slot.mesh.visible = true;
      return slot;
    },
    burst(position, count = 26, scale = 1, duration = 0.68, colour = '#b6ffdc') {
      const slot = takeBurst();
      const n = Math.min(BURST_POINTS, Math.max(1, Math.round(count)));
      for (let index = 0; index < BURST_POINTS; index += 1) {
        if (index >= n) { slot.velocities[index].set(0, 0, 0); continue; }
        const angle = (index / n) * Math.PI * 2 + (index % 3) * 0.19;
        const lift = 0.12 + ((index * 7) % 11) / 30;
        slot.velocities[index].set(
          Math.cos(angle) * (0.32 + (index % 5) * 0.07),
          lift,
          Math.sin(angle) * (0.32 + (index % 4) * 0.08),
        ).multiplyScalar(scale);
      }
      slot.duration = duration;
      slot.age = 0;
      slot.live = true;
      slot.material.color.set(colour);
      slot.material.size = 0.035 * scale;
      slot.material.opacity = 1;
      slot.points.position.copy(position);
      slot.points.visible = true;
      return slot;
    },
    /** The short grey cough a fizzled or interrupted cast leaves at the hands. */
    puff(position, colour = '#c8c0ae') {
      this.burst(position, 14, 0.5, 0.34, colour);
      this.ring(position, { radius: 0.26, duration: 0.3, colour, flat: false });
    },
    update(delta) {
      for (const slot of rings) {
        if (!slot.live) continue;
        slot.age += delta;
        const progress = THREE.MathUtils.clamp(slot.age / slot.duration, 0, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        slot.mesh.scale.setScalar((0.2 + eased * 1.45) * slot.radius);
        slot.material.opacity = Math.pow(1 - progress, 1.7) * 0.88;
        if (progress < 1) continue;
        slot.live = false;
        slot.mesh.visible = false;
      }
      for (const slot of bursts) {
        if (!slot.live) continue;
        slot.age += delta;
        const progress = THREE.MathUtils.clamp(slot.age / slot.duration, 0, 1);
        const attribute = slot.geometry.getAttribute('position');
        const elapsed = progress * slot.duration;
        for (let index = 0; index < BURST_POINTS; index += 1) {
          const v = slot.velocities[index];
          attribute.setXYZ(index, v.x * elapsed, v.y * elapsed - 1.7 * elapsed * elapsed, v.z * elapsed);
        }
        attribute.needsUpdate = true;
        slot.material.opacity = Math.pow(1 - progress, 1.4);
        if (progress < 1) continue;
        slot.live = false;
        slot.points.visible = false;
      }
    },
    clear() {
      for (const slot of rings) { slot.live = false; slot.mesh.visible = false; }
      for (const slot of bursts) { slot.live = false; slot.points.visible = false; }
    },
    dispose() {
      ringGeometry.dispose();
      for (const slot of rings) slot.material.dispose();
      for (const slot of bursts) { slot.geometry.dispose(); slot.material.dispose(); }
      if (group.parent) group.parent.remove(group);
    },
  };
}
