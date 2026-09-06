// 560 deterministic points: the gather at the hand, the sustain of an aura,
// and the scatter of an impact, one fixed GPU buffer for all three.
//
// PORTED from the studio's src/vfx/abilities/createAbilityParticles.ts. The
// samples are a pure function of index, seed and time, which is why scrubbing
// a preview backwards reconstructs the same cloud.

import * as THREE from 'three';
import { enableSpellBloom } from './bloom.js';

const COUNT = 560;
const fract = (x) => x - Math.floor(x);
const random = (i, seed) => fract(Math.sin(i * 127.1 + seed * 311.7) * 43758.5453);

export const MOTE_COUNT = COUNT;

export function createAbilityMotes(parent) {
  const positions = new Float32Array(COUNT * 3);
  const sizes = new Float32Array(COUNT);
  const alphas = new Float32Array(COUNT);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('alpha', new THREE.BufferAttribute(alphas, 1).setUsage(THREE.DynamicDrawUsage));
  const material = enableSpellBloom(new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { tint: { value: new THREE.Color() }, accent: { value: new THREE.Color() }, time: { value: 0 } },
    vertexShader: `attribute float size; attribute float alpha; varying float a; varying float phase;
      void main(){a=alpha; phase=size*41.; vec4 p=modelViewMatrix*vec4(position,1.);
      gl_PointSize=clamp(size*650./max(.1,-p.z),1.,110.); gl_Position=projectionMatrix*p;}`,
    fragmentShader: `uniform vec3 tint; uniform vec3 accent; uniform float time;
      varying float a; varying float phase;
      void main(){vec2 p=gl_PointCoord-.5; float r=length(p)*2.;
        float grain=.84+.16*sin(p.x*31.+phase)*sin(p.y*29.-time*3.);
        float core=exp(-r*r*30.); float halo=pow(max(0.,1.-r),2.5)*grain;
        gl_FragColor=vec4(mix(tint,accent,core)*1.5,(halo*.6+core*.5)*a);}`,
  }));
  material.toneMapped = false;
  const points = new THREE.Points(geometry, material);
  points.name = 'AbilityMotes';
  const centerOrigin = new THREE.Vector3();
  points.frustumCulled = false;
  parent.add(points);

  function clear() {
    alphas.fill(0);
    geometry.getAttribute('alpha').needsUpdate = true;
  }

  return {
    points,
    clear,
    update(v, time, release, origin, target, seed) {
      const family = v.family;
      const elapsed = time - release;
      if (elapsed < 0 && (family === 'slash' || family === 'impact')) {
        alphas.fill(0);
        positions.fill(0);
        sizes.fill(0);
        geometry.getAttribute('alpha').needsUpdate = true;
        return;
      }
      const sustain = ['aura', 'shield', 'heal', 'portal', 'song', 'stealth', 'drain', 'mark', 'trap'].includes(family);
      material.uniforms.tint.value.set(v.color);
      material.uniforms.accent.value.set(v.accent);
      material.uniforms.time.value = time;
      for (let i = 0; i < COUNT; i++) {
        const r = random(i + 1, seed);
        const s = random(i + 17, seed);
        const q = random(i + 61, seed);
        const theta = r * Math.PI * 2;
        let x = 0;
        let y = 0;
        let z = 0;
        let alpha = 0;
        let size = 0.015 + s * 0.045;
        if (elapsed < 0) {
          const phase = fract(time * 0.9 + s);
          const radius = (1 - phase) * (0.4 + q * 0.65) * Math.min(1, time * 3);
          x = origin.x + Math.cos(theta + phase * 5) * radius;
          y = origin.y + Math.sin(theta * 2) * radius;
          z = origin.z + Math.sin(theta + phase * 5) * radius;
          alpha = Math.sin(phase * Math.PI) * Math.min(1, time * 2) * 0.75;
        } else if (sustain) {
          const phase = fract(elapsed * (0.35 + r * 0.18) + s);
          const fade = Math.min(1, elapsed * 8) * THREE.MathUtils.clamp(3.2 - elapsed, 0, 1);
          const radius = (0.48 + q * 0.55) * v.scale;
          const angle = theta + elapsed * (family === 'portal' ? 2 : 0.65) + phase * 3;
          const center = ['portal', 'mark', 'trap'].includes(family) ? target : centerOrigin;
          x = center.x + Math.cos(angle) * radius;
          z = center.z + Math.sin(angle) * radius;
          y = family === 'trap' ? 0.05 + phase * 0.25 : phase * 2.5;
          alpha = Math.sin(phase * Math.PI) * fade;
          if (family === 'drain') {
            const f = fract(elapsed * 0.7 + s);
            x = THREE.MathUtils.lerp(target.x, origin.x, f) + Math.cos(theta + f * 16) * 0.12;
            y = THREE.MathUtils.lerp(target.y, origin.y, f) + Math.sin(f * Math.PI) * 0.6;
            z = THREE.MathUtils.lerp(target.z, origin.z, f);
          }
          if (v.style === 'wisps') size *= 3;
        } else {
          const age = elapsed - q * 0.2 - (['projectile', 'volley', 'meteor'].includes(family) ? 0.42 : 0);
          const life = 0.5 + s * 1.2;
          const speed = (0.6 + q * 2.8) * v.scale;
          const vertical = family === 'nova' ? 0.12 + s * 0.6 : 0.5 + s * 2.6;
          x = target.x + Math.cos(theta) * speed * age;
          z = target.z + Math.sin(theta) * speed * age;
          y = Math.max(0.025, target.y + vertical * age - age * age * 1.8);
          alpha = age > 0 ? Math.pow(Math.max(0, 1 - age / life), 1.5) : 0;
          if (v.style === 'embers') size *= 1.6;
          if (v.style === 'wisps') size *= 3;
        }
        positions[i * 3] = x;
        positions[i * 3 + 1] = y;
        positions[i * 3 + 2] = z;
        sizes[i] = size;
        alphas[i] = alpha;
      }
      for (const key of Object.keys(geometry.attributes)) geometry.attributes[key].needsUpdate = true;
    },
    dispose() { parent.remove(points); geometry.dispose(); material.dispose(); },
  };
}
