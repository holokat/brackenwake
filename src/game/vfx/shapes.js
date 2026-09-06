// The family renderer: rings, arcs, shards, bolt segments, balls, a shell and
// a void disc, pooled, and posed differently for each of the sixteen effect
// families an ability can belong to.
//
// PORTED from the studio's src/vfx/abilities/createAbilityShapes.ts. This is
// what guarantees coverage: every ability has a family, every family has a
// branch here, and nothing allocates while an effect is playing.

import * as THREE from 'three';
import { enableSpellBloom } from './bloom.js';

const clamp = (n) => THREE.MathUtils.clamp(n, 0, 1);
const TAU = Math.PI * 2;

export function createAbilityShapes(parent) {
  const group = new THREE.Group();
  group.name = 'AbilityShapes';
  parent.add(group);
  const ringGeo = new THREE.RingGeometry(0.96, 1, 112);
  const shardGeo = new THREE.OctahedronGeometry(1);
  const ballGeo = new THREE.SphereGeometry(1, 36, 24);
  const barGeo = new THREE.CylinderGeometry(0.008, 0.016, 1, 5);
  const arcGeo = new THREE.RingGeometry(0.965, 1, 64, 1, 0, Math.PI * 1.45);
  const portalArcGeo = new THREE.RingGeometry(0.989, 1, 112, 1, 0, Math.PI * 1.65);
  const materials = [];
  function mesh(geometry) {
    const material = enableSpellBloom(new THREE.MeshBasicMaterial({
      color: '#ffffff', transparent: true, opacity: 0,
      side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    materials.push(material);
    const result = new THREE.Mesh(geometry, material);
    group.add(result);
    return result;
  }
  const rings = Array.from({ length: 9 }, () => mesh(ringGeo));
  const arcs = Array.from({ length: 6 }, () => mesh(arcGeo));
  const shards = Array.from({ length: 32 }, () => mesh(shardGeo));
  const bolts = Array.from({ length: 42 }, () => mesh(barGeo));
  const balls = Array.from({ length: 4 }, () => mesh(ballGeo));
  const shapes = [...rings, ...arcs, ...shards, ...bolts, ...balls];
  const shellMaterial = enableSpellBloom(new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { tint: { value: new THREE.Color() }, opacity: { value: 0 }, time: { value: 0 }, portal: { value: 0 } },
    vertexShader: `varying vec3 n; varying vec3 p; varying vec3 eye; void main(){ n=normalize(normalMatrix*normal);
      p=position; vec4 mv=modelViewMatrix*vec4(position,1.);eye=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}`,
    fragmentShader: `varying vec3 n; varying vec3 p; varying vec3 eye; uniform vec3 tint;
      uniform float opacity; uniform float time; uniform float portal;
      void main(){float rim=pow(1.-abs(dot(normalize(n),normalize(eye))),2.8);
      float cells=pow(abs(sin(p.x*24.+sin(p.y*17.))*sin(p.z*24.+cos(p.y*17.))),12.);
      float scan=pow(.5+.5*sin(p.y*40.-time*4.),16.);
      float radius=length(p.xy), angle=atan(p.y,p.x);
      float spiral=pow(.5+.5*sin(angle*4.+radius*23.-time*2.5),6.);
      float vortex=(rim*.12+spiral*.075)*(1.-smoothstep(.45,1.,radius));
      gl_FragColor=vec4(tint*1.5,mix(rim*.40+cells*.09+scan*.035,vortex,portal)*opacity);}`,
  }));
  const shell = new THREE.Mesh(ballGeo, shellMaterial);
  group.add(shell);
  const voidMaterial = new THREE.MeshBasicMaterial({ color: '#05020b', transparent: true, opacity: 0.86, depthWrite: false });
  const voidDisc = new THREE.Mesh(ballGeo, voidMaterial);
  group.add(voidDisc);
  materials.push(voidMaterial, shellMaterial);
  const light = new THREE.PointLight('#ffffff', 0, 7, 2);
  group.add(light);
  const direction = new THREE.Vector3();
  const point = new THREE.Vector3();
  const previous = new THREE.Vector3();
  const originGround = new THREE.Vector3(0, 0.025, 0);
  const UP = new THREE.Vector3(0, 1, 0);

  function show(m, color, alpha, position, x = 1, y = x, z = x) {
    m.visible = alpha > 0.001;
    m.position.copy(position);
    m.scale.set(x, y, z);
    m.material.color.set(color);
    m.material.opacity = clamp(alpha);
    m.rotation.set(0, 0, 0);
  }
  function groundRing(index, center, radius, alpha, color) {
    const ring = rings[index];
    show(ring, color, alpha, center, Math.max(0.001, radius));
    ring.position.y = 0.035 + index * 0.004;
    ring.rotation.x = -Math.PI / 2;
  }

  return {
    group,
    /** `v` is one row of visuals.js. `time` and `release` are effect seconds. */
    update(v, id, time, release, origin, target) {
      for (const child of shapes) child.visible = false;
      shell.visible = false;
      voidDisc.visible = false;
      light.intensity = 0;
      shellMaterial.uniforms.portal.value = 0;
      const e = time - release;
      const s = v.scale;
      const onset = clamp(e * 8);
      const fade = clamp(3 - e);
      const burst = Math.exp(-Math.max(0, e) * 4.5) * onset;
      const { color, accent, family } = v;
      for (const arc of arcs) arc.geometry = family === 'portal' ? portalArcGeo : arcGeo;
      light.color.set(color);
      light.position.copy(e < 0 ? origin : target);
      light.intensity = (e < 0 ? clamp(time / release) * 0.25 : burst * 1.6) * s;
      if (e < 0) {
        if (family === 'slash' || family === 'impact') { light.intensity = 0; return; }
        const gather = clamp(time / release);
        show(balls[0], color, gather * 0.4, origin, 0.025 + gather * 0.06);
        if (['meteor', 'portal', 'trap', 'nova', 'volley'].includes(family)) {
          groundRing(0, target, s * 0.75, gather * 0.3, color);
          groundRing(1, target, s * 0.68, gather * 0.15, accent);
        }
        return;
      }
      if (['aura', 'shield', 'heal', 'song', 'stealth', 'portal', 'mark', 'trap'].includes(family)) {
        const center = ['portal', 'mark', 'trap'].includes(family) ? target : originGround;
        groundRing(0, center, s * (0.6 + onset * 0.14), fade * 0.5, color);
        groundRing(1, center, s * 0.8, fade * 0.22, color);
        for (let i = 0; i < 12; i++) {
          const a = (TAU * i) / 12 + (family === 'portal' ? e * 0.65 : 0);
          point.set(center.x + Math.cos(a) * s * 0.7, 0.04, center.z + Math.sin(a) * s * 0.7);
          show(shards[i], color, fade * 0.7, point, 0.02, 0.01, i % 3 === 0 ? 0.16 : 0.055);
          shards[i].rotation.y = -a;
        }
        if (family === 'shield' || family === 'aura') {
          shell.visible = true;
          shell.position.set(0, 1.02, 0);
          shell.scale.setScalar(id === 'mana-shield' ? 1.10 : s * 0.85);
          if (id === 'mana-shield') shell.position.y = 1.11;
          shellMaterial.uniforms.tint.value.set(color);
          shellMaterial.uniforms.opacity.value = fade * onset * (family === 'shield' ? 0.8 : 0.24);
          shellMaterial.uniforms.time.value = time;
        }
        if (family === 'heal') {
          for (let i = 0; i < 7; i++) {
            const a = (TAU * i) / 7 + e * 0.3;
            point.set(Math.cos(a) * s * 0.5, 0.8, Math.sin(a) * s * 0.5);
            show(bolts[i], i % 2 ? color : accent, fade * 0.3, point, 1.5, (1.5 + Math.sin(e * 2 + i) * 0.4) * s, 1.5);
          }
          for (let i = 2; i < 6; i++) {
            const phase = (e * 0.38 + i / 4) % 1;
            groundRing(i, originGround, s * (0.5 + phase * 0.3), Math.sin(phase * Math.PI) * fade * 0.35, color);
            rings[i].position.y = phase * 2.6;
          }
        }
        if (family === 'song') {
          for (let i = 0; i < 5; i++) {
            const phase = clamp((e - i * 0.19) / 1.8);
            groundRing(i, originGround, 0.3 + phase * s * 2, Math.sin(phase * Math.PI) * 0.55, i % 2 ? color : accent);
          }
          for (let i = 0; i < 8; i++) {
            const a = (i * TAU) / 8 + e * 0.35;
            point.set(Math.cos(a) * (e * 0.7 + 0.5), 1.2 + Math.sin(e + i) * 0.25, Math.sin(a) * (e * 0.7 + 0.5));
            show(balls[i % 4], color, fade * 0.55, point, 0.055, 0.035, 0.03);
            show(bolts[i], color, fade * 0.55, point, 1, 0.2, 1);
            bolts[i].position.y += 0.08;
          }
        }
        if (family === 'portal') {
          shell.visible = true;
          shell.position.set(target.x, s * 0.78, target.z);
          shell.scale.set(s * 0.72, s * 0.92, 0.09);
          shellMaterial.uniforms.tint.value.set(color);
          shellMaterial.uniforms.opacity.value = fade * onset;
          shellMaterial.uniforms.time.value = time;
          shellMaterial.uniforms.portal.value = 1;
          voidDisc.visible = true;
          voidDisc.position.copy(shell.position);
          voidDisc.scale.copy(shell.scale).multiplyScalar(0.985);
          voidMaterial.opacity = fade * onset * 0.88;
          for (let i = 0; i < 4; i++) {
            point.copy(shell.position);
            show(arcs[i], color, fade * 0.28, point, s * (0.77 + i * 0.018), s * (0.95 + i * 0.018), 1);
            arcs[i].rotation.z = e * (i % 2 ? -1.5 : 1.5) + i * 1.5;
          }
        }
        if ((family === 'mark' || family === 'trap') && id !== 'hunters-mark') {
          point.copy(target);
          point.y = family === 'mark' ? 1.55 : 0.06;
          show(arcs[0], color, fade * 0.65, point, s * 0.35);
          arcs[0].rotation.z = e * 0.8;
          if (family === 'trap') arcs[0].rotation.x = -Math.PI / 2;
          show(shards[20], accent, fade * 0.6, point, 0.06, 0.14, 0.06);
        }
        if (family === 'stealth') {
          for (let i = 0; i < 4; i++) {
            point.set(0, 0.95, -(i + 1) * 0.32);
            show(balls[i], color, fade * 0.055 * (1 - i / 5), point, 0.32, 0.8, 0.22);
          }
        }
      }
      if (['impact', 'nova', 'meteor', 'volley', 'projectile', 'lightning'].includes(family)) {
        const lag = ['meteor', 'volley', 'projectile'].includes(family) ? 0.42 : 0;
        const age = e - lag;
        for (let i = 0; i < 3; i++) {
          const phase = clamp((age - i * 0.08) / 1.2);
          groundRing(i, target, 0.1 + phase * s * 1.7, Math.sin(phase * Math.PI) * 0.42 * (1 - phase), color);
        }
        point.copy(target);
        show(balls[3], accent, age >= 0 ? Math.exp(-age * 12) * 0.7 : 0, point, 0.13 + Math.max(0, age) * 0.5);
        for (let i = 0; i < Math.min(32, family === 'nova' ? 28 : v.count + 9); i++) {
          const a = i * 2.399;
          const age2 = Math.max(0, age);
          const rad = s * (0.2 + age2 * (1 + (i % 4) * 0.45));
          point.set(target.x + Math.cos(a) * rad,
            0.05 + Math.max(0, age2 * (1.2 + (i % 3)) - 3 * age2 * age2),
            target.z + Math.sin(a) * rad);
          show(shards[i], i % 4 ? color : accent, age < 0 ? 0 : clamp(1.2 - age2) * 0.8, point, 0.035,
            family === 'nova' ? s * 0.24 * onset : 0.07, 0.03);
          shards[i].rotation.set(age2 * (i % 3), a, family === 'nova' ? 0.5 : age2 * 4);
        }
      }
      if (family === 'projectile' || family === 'volley' || family === 'meteor') {
        const count = Math.min(30, v.count);
        for (let i = 0; i < count; i++) {
          const p = clamp((e - i * (family === 'volley' ? 0.023 : 0.12)) / 0.42);
          point.lerpVectors(origin, target, p);
          if (family === 'volley') {
            point.x += Math.sin(i * 7.1) * s * 0.6;
            point.z += Math.cos(i * 9.3) * s * 0.6;
            point.y += Math.sin(p * Math.PI) * 2.6;
          }
          if (family === 'meteor') point.y += (1 - p) * 5;
          show(shards[i], color, p > 0 && p < 1 ? 0.95 : 0, point,
            family === 'meteor' ? 0.22 : 0.05, family === 'meteor' ? 0.4 : 0.24, 0.08);
          direction.subVectors(target, origin).normalize();
          shards[i].quaternion.setFromUnitVectors(UP, direction);
          if (family === 'meteor') shards[i].rotation.z = e * 3;
        }
      }
      if (family === 'lightning' || family === 'drain') {
        previous.copy(origin);
        const boltFade = family === 'drain' ? fade * onset : clamp(1 - e / 0.65) * (0.65 + 0.35 * Math.sin(e * 83));
        for (let i = 0; i < 42; i++) {
          const p = (i + 1) / 42;
          point.lerpVectors(origin, target, p);
          point.x += Math.sin(p * 75 + Math.floor(e * 18) * 3) * Math.sin(p * Math.PI) * 0.14;
          point.y += family === 'drain' ? Math.sin(p * Math.PI) * 0.7 : Math.cos(p * 90 + Math.floor(e * 18)) * 0.13;
          direction.subVectors(point, previous);
          show(bolts[i], i % 3 ? color : accent, boltFade, previous, 1.5, direction.length(), 1.5);
          bolts[i].position.addScaledVector(direction, 0.5);
          bolts[i].quaternion.setFromUnitVectors(UP, direction.normalize());
          previous.copy(point);
        }
      }
    },
    hide() {
      for (const child of shapes) child.visible = false;
      shell.visible = false;
      voidDisc.visible = false;
      light.intensity = 0;
    },
    dispose() {
      parent.remove(group);
      for (const geometry of [ringGeo, shardGeo, ballGeo, barGeo, arcGeo, portalArcGeo]) geometry.dispose();
      for (const material of materials) material.dispose();
      light.dispose();
    },
  };
}
