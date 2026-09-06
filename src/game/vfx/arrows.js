// The ranger's arrows: real shafts with fletching, a short velocity aligned
// trail each, and a spray where they land.
//
// PORTED from the studio's src/vfx/abilities/createRangerEffects.ts, with its
// arrow from src/character/createArrowGeometry.ts. A bow ability is the one
// case where the projectile must NOT be a glow: an arrow is a stick, and a
// player who cannot see the stick cannot read the shot.

import * as THREE from 'three';
import { createSpellRibbon } from './glow.js';
import { createSpellParticleLayer } from './particles.js';
import { disposeTree } from './util.js';

const ARROWS = 24;

/** One arrow, pointing along local +Z. */
export function createArrow() {
  const root = new THREE.Group();
  root.name = 'Arrow';
  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.006, 0.006, 0.66, 6),
    new THREE.MeshStandardMaterial({ color: '#a2875f', roughness: 0.72 }),
  );
  shaft.rotation.x = Math.PI / 2;
  shaft.position.z = -0.30;
  const tip = new THREE.Mesh(
    new THREE.ConeGeometry(0.022, 0.09, 4),
    new THREE.MeshStandardMaterial({ color: '#becbd4', metalness: 0.8, roughness: 0.24 }),
  );
  tip.rotation.x = Math.PI / 2;
  tip.position.z = 0.06;
  const featherGeo = new THREE.PlaneGeometry(0.06, 0.12);
  featherGeo.rotateX(Math.PI / 2);
  const featherMat = new THREE.MeshStandardMaterial({ color: '#d3cbb5', side: THREE.DoubleSide, roughness: 0.85 });
  root.add(shaft, tip);
  for (let i = 0; i < 3; i++) {
    const feather = new THREE.Mesh(featherGeo, featherMat);
    feather.position.z = -0.56;
    feather.rotation.z = (i * Math.PI * 2) / 3;
    root.add(feather);
  }
  return root;
}

/** Where arrow `index` of `id` is at `age`, and how far along its flight. */
export function sampleArrowFlight(id, index, age, origin, target, out) {
  const volley = id === 'volley';
  const flight = volley ? 1.16 : 0.38;
  const progress = THREE.MathUtils.clamp(
    (age - index * (volley ? 0.022 : 0.12)) / flight, 0, id === 'piercing-arrow' ? 1.65 : 1,
  );
  out.lerpVectors(origin, target, progress);
  if (volley) {
    out.x += Math.sin(index * 7.1) * 0.8 * progress;
    out.z += Math.cos(index * 9.3) * 0.65 * progress;
    out.y += 4 * 3.2 * progress * (1 - progress);
  }
  return progress;
}

export function createRangerEffects(parent) {
  const root = new THREE.Group();
  root.name = 'RangerPhysicalProjectiles';
  root.visible = false;
  parent.add(root);
  const template = createArrow();
  const arrows = Array.from({ length: ARROWS }, (unused, i) => {
    const arrow = i ? template.clone() : template;
    arrow.visible = false;
    root.add(arrow);
    return arrow;
  });
  const trails = arrows.map(() => {
    const ribbon = createSpellRibbon('#d8cba0', 12, 0.008);
    ribbon.mesh.visible = false;
    root.add(ribbon.mesh);
    return { ribbon, points: Array.from({ length: 12 }, () => new THREE.Vector3()) };
  });
  const sparks = createSpellParticleLayer({ capacity: 128, additive: true, hdr: 2.2 });
  root.add(sparks.mesh);
  const direction = new THREE.Vector3();
  const ahead = new THREE.Vector3();
  const position = new THREE.Vector3();
  const end = new THREE.Vector3();
  const forward = new THREE.Vector3(0, 0, 1);
  const color = new THREE.Color();

  return {
    root,
    hide() {
      root.visible = false;
      sparks.commit(0);
    },
    sample(id, v, active, time, release, origin, target) {
      root.visible = active;
      if (!active) { sparks.commit(0); return; }
      const e = time - release;
      const count = Math.min(ARROWS, v.count);
      const volley = id === 'volley';
      color.set(v.color);
      let particleCount = 0;
      for (let i = 0; i < ARROWS; i++) {
        const arrow = arrows[i];
        const trail = trails[i];
        const p = sampleArrowFlight(id, i, e, origin, target, position);
        arrow.visible = i < count && e >= i * (volley ? 0.022 : 0.12) && e < 2.5;
        if (id === 'piercing-arrow' && p >= 1.65) arrow.visible = false;
        trail.ribbon.mesh.visible = arrow.visible && p > 0 && p < (id === 'piercing-arrow' ? 1.65 : 1);
        if (!arrow.visible) continue;
        arrow.position.copy(position);
        sampleArrowFlight(id, i, e - 0.008, origin, target, ahead);
        direction.subVectors(position, ahead);
        if (direction.lengthSq() > 1e-9) arrow.quaternion.setFromUnitVectors(forward, direction.normalize());
        for (let j = 0; j < 12; j++) sampleArrowFlight(id, i, e - 0.055 * (1 - j / 11), origin, target, trail.points[j]);
        trail.ribbon.update(trail.points);
        trail.ribbon.uniforms.uAlpha.value = id === 'piercing-arrow' ? 0.85 : 0.26;
        trail.ribbon.uniforms.uWidth.value = id === 'piercing-arrow' ? 0.019 : 0.008;
        trail.ribbon.uniforms.uTime.value = time;
        const impactAge = e - i * (volley ? 0.022 : 0.12) - (volley ? 1.16 : 0.38);
        if (impactAge >= 0 && impactAge < 0.4) {
          sampleArrowFlight(id, i, 10, origin, target, end);
          if (id === 'piercing-arrow') end.copy(target);
          for (let k = 0; k < 5; k++) {
            const a = k * 2.4 + i;
            position.copy(end);
            position.x += Math.cos(a) * impactAge;
            position.y += Math.sin(a) * impactAge * 0.7;
            position.z -= impactAge * 0.8;
            sparks.setParticle(particleCount++, position, 0.009, a, color, 1 - impactAge / 0.4, 0, 2.2);
          }
        }
      }
      sparks.commit(particleCount);
    },
    dispose() {
      for (const t of trails) t.ribbon.dispose();
      sparks.dispose();
      disposeTree(root);
    },
  };
}
