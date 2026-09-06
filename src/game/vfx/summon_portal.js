// The ground a summon comes out of: a void aperture, a runed rim, rising
// wisps, embers, and displaced earth.
//
// PORTED from the studio's src/vfx/abilities/summoning/createGroundSummon.ts,
// MINUS its two articulated figures. Over there the skeleton and the imp were
// code-authored bodies because the playground had nothing to summon; Kaldera
// spawns a real monster through ability_hooks.js, so porting the studio's
// figures would put a second, worse skeleton beside the real one. The aperture
// is the half the game needed and the whole of what is here.

import * as THREE from 'three';
import { createSpellParticleLayer } from './particles.js';
import { enableSpellBloom } from './bloom.js';
import { smoothRange } from './util.js';

/** How wide the aperture is open at `age`, 0 to 1. */
export function summonPortalOpening(age) {
  if (age < 0) return 0;
  return smoothRange(0, 0.42, age) * (1 - smoothRange(2.4, 3.2, age));
}

export function createGroundSummon(parent, textures) {
  const root = new THREE.Group();
  root.name = 'GroundSummoning';
  root.visible = false;
  parent.add(root);
  const aperture = new THREE.Group();
  aperture.name = 'HorizontalSummonAperture';
  root.add(aperture);
  const plane = new THREE.PlaneGeometry(2, 2);
  const uniforms = { time: { value: 0 }, strength: { value: 0 }, tint: { value: new THREE.Color() } };
  const vertexShader = `varying vec2 p; void main(){p=uv*2.-1.;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
  const noise = `float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}`;
  const voidMaterial = new THREE.ShaderMaterial({
    uniforms, vertexShader, depthWrite: false, transparent: true,
    fragmentShader: `varying vec2 p;uniform float time;uniform vec3 tint;${noise}
      void main(){float r=length(p);float edge=.79+noise(p*13.)*.025;if(r>edge)discard;
        float a=atan(p.y,p.x),swirl=noise(vec2(a*3.+time*.22,r*12.-time*.65));
        vec3 color=vec3(.003,.004,.003)+tint*pow(swirl,4.)*.075*smoothstep(.2,.8,r);
        gl_FragColor=vec4(color,1.);}`,
  });
  const voidDisc = new THREE.Mesh(plane, voidMaterial);
  voidDisc.name = 'SummonVoid';
  voidDisc.rotation.x = -Math.PI / 2;
  voidDisc.position.y = 0.019;
  aperture.add(voidDisc);
  const rimMaterial = enableSpellBloom(new THREE.ShaderMaterial({
    uniforms, vertexShader, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    fragmentShader: `varying vec2 p;uniform float time;uniform float strength;uniform vec3 tint;${noise}
      void main(){float r=length(p),a=atan(p.y,p.x);float n=noise(vec2(a*8.,time*.8))*2.-1.;
        float edge=.80+n*.022;float rim=exp(-abs(r-edge)*135.);
        float tendrils=pow(noise(vec2(a*22.+time*.7,r*28.-time*3.)),3.)*exp(-abs(r-edge)*18.);
        float runes=pow(max(0.,sin(a*24.)),12.)*exp(-abs(r-.94)*120.);
        float alpha=(rim*.86+tendrils*.6+runes*.34)*strength;
        gl_FragColor=vec4(tint*(1.4+rim*1.1),alpha);}`,
  }));
  const rim = new THREE.Mesh(plane, rimMaterial);
  rim.name = 'GroundPortalRim';
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = 0.023;
  aperture.add(rim);
  const hasAtlas = !!(textures && textures.smoke);
  const smoke = createSpellParticleLayer({
    capacity: 36, texture: hasAtlas ? textures.smoke : undefined,
    atlas: hasAtlas ? { columns: 6, rows: 6, frames: 36 } : undefined, additive: false,
  });
  const embers = createSpellParticleLayer({ capacity: 40, additive: true, hdr: 2.2 });
  root.add(smoke.mesh, embers.mesh);
  const ground = new THREE.Vector3(0, 0.02, 0);
  const up = new THREE.Vector3(0, 1, 0);
  smoke.setSurfaceFade(ground, up, 0.10);
  embers.setSurfaceFade(ground, up, 0.06);
  const dirt = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(0.027, 0),
    new THREE.MeshStandardMaterial({ color: '#443b2b', roughness: 1 }),
    24,
  );
  dirt.name = 'DisplacedGraveEarth';
  dirt.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  dirt.frustumCulled = false;
  root.add(dirt);
  const glow = new THREE.PointLight('#b2d67c', 0, 3, 2);
  glow.position.y = 0.23;
  root.add(glow);
  const position = new THREE.Vector3();
  const tint = new THREE.Color();
  const smokeTint = new THREE.Color();
  const gray = new THREE.Color('#8d9387');
  const dummy = new THREE.Object3D();

  return {
    root,
    reset() { root.visible = false; smoke.commit(0); embers.commit(0); glow.intensity = 0; },
    hide() { root.visible = false; smoke.commit(0); embers.commit(0); glow.intensity = 0; },
    /**
     * `size` is 1 for a man-sized summon and less for a small one; `colour` is
     * the ability's own, so a raised skeleton is bone green and an imp is
     * ember orange without a table of exceptions.
     */
    sample(active, time, release, target, colour = '#b2d67c', size = 1, earth = true) {
      const age = time - release;
      root.visible = active && age >= 0;
      if (!root.visible) { smoke.commit(0); embers.commit(0); glow.intensity = 0; return false; }
      root.position.set(target.x, target.y, target.z);
      const opening = summonPortalOpening(age);
      aperture.visible = opening > 0.001;
      aperture.scale.set(0.79 * size * opening, 1, 0.91 * size * opening);
      // The surface normal is always +Y. Only planar size changes, never pitch.
      tint.set(colour);
      smokeTint.copy(tint).lerp(gray, 0.77);
      uniforms.time.value = age;
      uniforms.strength.value = opening;
      uniforms.tint.value.copy(tint);
      glow.color.copy(tint);
      glow.intensity = opening * (1.9 + 0.25 * Math.sin(age * 9));
      glow.distance = 3 * size;
      for (let i = 0; i < 36; i++) {
        const life = (Math.max(0, age) * 0.60 + i * 0.071) % 1;
        const a = i * 2.39996 + life * 0.32;
        position.set(Math.cos(a) * (0.59 + life * 0.18) * size, (0.04 + life * 0.39) * size, Math.sin(a) * (0.69 + life * 0.18) * size);
        smoke.setParticle(i, position, (0.18 + life * 0.36) * size, a, smokeTint, Math.sin(life * Math.PI) * opening * 0.31, Math.floor(life * 35));
      }
      smoke.commit(36);
      for (let i = 0; i < 40; i++) {
        const life = (Math.max(0, age) * 0.8 + i * 0.037) % 1;
        const a = i * 2.39996;
        position.set(Math.cos(a) * (0.57 + life * 0.11) * size, (0.025 + life * 0.5) * size, Math.sin(a) * (0.67 + life * 0.14) * size);
        embers.setParticle(i, position, 0.011 * size, a, tint, Math.sin(life * Math.PI) * opening, 0, 1.8);
      }
      embers.commit(40);
      dirt.visible = earth && age > 0.35 && age < 2.6;
      for (let i = 0; i < 24; i++) {
        const a = i * 2.39996;
        const t = Math.max(0, age - 0.35 - (i % 3) * 0.36);
        const speed = 0.3 + (i % 5) * 0.05;
        const flight = Math.min(t, 0.48);
        const radius = 0.64 + flight * 0.36;
        dummy.position.set(Math.cos(a) * radius, 0.026 + Math.max(0, flight * speed - flight * flight * 0.9), Math.sin(a) * radius * 1.12);
        dummy.rotation.set(flight * 5 + i, flight * 3, i);
        dummy.scale.setScalar((0.6 + (i % 3) * 0.3) * (1 - smoothRange(1.7, 2.6, age)));
        dummy.updateMatrix();
        dirt.setMatrixAt(i, dummy.matrix);
      }
      dirt.instanceMatrix.needsUpdate = true;
      return true;
    },
    dispose() {
      smoke.dispose();
      embers.dispose();
      plane.dispose();
      voidMaterial.dispose();
      rimMaterial.dispose();
      dirt.geometry.dispose();
      dirt.material.dispose();
      dirt.dispose();
      glow.dispose();
      if (root.parent) root.parent.remove(root);
    },
  };
}
