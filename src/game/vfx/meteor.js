// The meteor: a molten rock inside a marched fire volume, a wake of flame,
// smoke and sparks, and the fireball explosion at 1.7x when it lands.
//
// PORTED from the studio's src/vfx/abilities/createMeteorEffect.ts. The entry
// vector and the 0.94 s flight are the studio's; the target is the game's
// ground point rather than a dummy's mark.

import * as THREE from 'three';
import { createFireVolume } from './fire_volume.js';
import { createFireballImpact } from './fireball.js';
import { createSpellParticleLayer } from './particles.js';
import { createSpellGlow } from './glow.js';
import { disposeTree } from './util.js';

export const METEOR_FLIGHT = 0.94;
const ENTRY = new THREE.Vector3(-1.4, 5.6, -1.3);

export function sampleMeteorPath(age, target, out) {
  const p = THREE.MathUtils.clamp(age / METEOR_FLIGHT, 0, 1);
  return out.copy(target).addScaledVector(ENTRY, 1 - p * p);
}

export function createMeteorEffect(parent, textures) {
  const root = new THREE.Group();
  root.name = 'VolumetricMeteor';
  root.visible = false;
  parent.add(root);
  const meteor = new THREE.Group();
  root.add(meteor);
  const rock = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.38, 2),
    new THREE.MeshStandardMaterial({ color: '#170b06', roughness: 0.85, emissive: '#9d2404', emissiveIntensity: 0.35, depthWrite: false }),
  );
  const volume = createFireVolume();
  volume.mesh.scale.setScalar(4.2);
  meteor.add(rock, volume.mesh);
  const glow = createSpellGlow('#ff731c', 0.86);
  glow.uniforms.uIntensity.value = 2.6;
  meteor.add(glow.mesh);
  const atlas = { columns: 6, rows: 6, frames: 36 };
  const hasAtlas = !!(textures && textures.fire && textures.smoke);
  const flame = createSpellParticleLayer({ capacity: 48, texture: hasAtlas ? textures.fire : undefined, atlas: hasAtlas ? atlas : undefined, additive: true, hdr: 2.2 });
  const smoke = createSpellParticleLayer({ capacity: 48, texture: hasAtlas ? textures.smoke : undefined, atlas: hasAtlas ? atlas : undefined, additive: false });
  const sparks = createSpellParticleLayer({ capacity: 96, additive: true, hdr: 3 });
  root.add(flame.mesh, smoke.mesh, sparks.mesh);
  const impactRoot = new THREE.Group();
  impactRoot.scale.setScalar(1.7);
  root.add(impactRoot);
  const impact = createFireballImpact(impactRoot, textures);
  const debris = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(0.045, 0),
    new THREE.MeshStandardMaterial({ color: '#382018', emissive: '#f4560a', emissiveIntensity: 0.8, roughness: 0.9 }),
    24,
  );
  debris.frustumCulled = false;
  root.add(debris);
  const dummy = new THREE.Object3D();
  const light = new THREE.PointLight('#ff711c', 0, 7, 2);
  root.add(light);
  const p = new THREE.Vector3();
  const zero = new THREE.Vector3(0, 0.018, 0);
  const up = new THREE.Vector3(0, 1, 0);
  const hot = new THREE.Color('#ffdd9f');
  const soot = new THREE.Color('#615953');
  const ember = new THREE.Color('#ffc57b');

  return {
    root,
    hide() { root.visible = false; light.intensity = 0; },
    sample(active, time, release, target) {
      root.visible = active;
      if (!active) { light.intensity = 0; return; }
      const e = time - release;
      const age = e - METEOR_FLIGHT;
      meteor.visible = e >= 0 && age < 0;
      sampleMeteorPath(e, target, meteor.position);
      meteor.rotation.set(e * 1.5, e * 2, e * 0.7);
      volume.material.uniforms.uTime.value = time * 2;
      volume.material.uniforms.uOpacity.value = 1;
      glow.uniforms.uTime.value = time;
      glow.uniforms.uAlpha.value = 0.38;
      let fc = 0;
      let sc = 0;
      let ec = 0;
      for (let i = 0; i < 48; i++) {
        const delay = i * 0.018;
        const emitted = e - delay;
        if (emitted < 0 || emitted > METEOR_FLIGHT || delay < Math.max(0, age)) continue;
        sampleMeteorPath(emitted, target, p);
        p.x += Math.sin(i * 8.3) * (0.12 + delay * 0.21);
        p.z += Math.cos(i * 4.1) * (0.12 + delay * 0.21);
        flame.setParticle(fc++, p, 0.80 + delay * 1.15, i * 1.8, hot, Math.max(0, 0.72 - delay * 0.9), delay * 34 + (i % 6));
        p.y += delay * 0.45;
        smoke.setParticle(sc++, p, 0.60 + delay * 1.7, i * 0.7, soot, 0.24 * Math.sin(Math.min(1, delay / 0.85) * Math.PI), delay * 25);
      }
      for (let i = 0; i < 96; i++) {
        const delay = (i % 24) * 0.027;
        const emitted = e - delay;
        if (emitted < 0 || emitted > METEOR_FLIGHT) continue;
        sampleMeteorPath(emitted, target, p);
        const a = i * 2.399;
        p.x += Math.cos(a) * (0.36 + delay * 0.65);
        p.z += Math.sin(a) * (0.36 + delay * 0.65);
        p.y -= delay * delay * 2;
        sparks.setParticle(ec++, p, 0.012 + (i % 3) * 0.004, a, ember, Math.max(0, 1 - delay / 0.9), 0, 2.5);
      }
      flame.commit(fc);
      smoke.commit(sc);
      sparks.commit(ec);
      impactRoot.position.copy(target);
      impact.update(age, zero, up, true);
      debris.visible = age >= 0 && age < 1.6;
      if (debris.visible) for (let i = 0; i < 24; i++) {
        const angle = i * 2.399;
        const speed = 0.8 + (i % 5) * 0.43;
        dummy.position.copy(target);
        dummy.position.x += Math.cos(angle) * speed * age;
        dummy.position.z += Math.sin(angle) * speed * age;
        dummy.position.y = Math.max(0.035, age * (1.4 + (i % 4) * 0.55) - 4.9 * age * age);
        dummy.rotation.set(age * ((i % 5) + 2), angle, age * 3);
        dummy.scale.setScalar((1 + (i % 3) * 0.35) * (1 - THREE.MathUtils.smoothstep(age, 1.2, 1.6)));
        dummy.updateMatrix();
        debris.setMatrixAt(i, dummy.matrix);
      }
      debris.instanceMatrix.needsUpdate = true;
      light.position.copy(meteor.position);
      light.intensity = meteor.visible ? 2.2 : 0;
    },
    dispose() {
      impact.dispose();
      flame.dispose();
      smoke.dispose();
      sparks.dispose();
      glow.dispose();
      light.dispose();
      debris.dispose();
      disposeTree(root);
    },
  };
}
