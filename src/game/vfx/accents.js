// The handful of abilities that need a thing of their own rather than a family:
// a hunter's mark over the target, a shield crest over the caster, a snare on
// the ground, the flash a blink leaves behind, and a beast call's rings.
//
// PORTED from the studio's src/vfx/abilities/createActionAccents.ts.
//
// ONE DIFFERENCE, written down rather than hidden: the studio drove the blink
// flash off its own preview travel curve, because over there the body did not
// really move. Here it does, so the flash is driven off effect time and left
// where the cast began; the body arriving somewhere else is the game's job.

import * as THREE from 'three';
import { createSpellGlow } from './glow.js';
import { enableSpellBloom } from './bloom.js';
import { disposeTree, smoothRange } from './util.js';

export function createActionAccents(parent) {
  const root = new THREE.Group();
  root.name = 'ActionSpecificAccents';
  parent.add(root);
  const iconMaterial = enableSpellBloom(new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { color: { value: new THREE.Color() }, alpha: { value: 0 }, shield: { value: 0 } },
    vertexShader: `varying vec2 p;void main(){p=uv*2.-1.;vec4 c=modelViewMatrix*vec4(0,0,0,1);c.xy+=position.xy;gl_Position=projectionMatrix*c;}`,
    fragmentShader: `varying vec2 p;uniform vec3 color;uniform float alpha;uniform float shield;
      void main(){float r=length(p);float ring=1.-smoothstep(.022,.041,abs(r-.59));
        float cross=max((1.-step(.027,abs(p.x)))*step(.42,abs(p.y)),(1.-step(.027,abs(p.y)))*step(.42,abs(p.x)));
        float target=max(ring,max(cross,1.-smoothstep(.035,.055,r)));
        float side=abs(p.x)-(.57-max(0.,-p.y)*.7);float top=p.y-.6;
        float border=1.-smoothstep(.022,.045,min(abs(side),abs(top)));
        float inside=step(side,.025)*step(top,.025)*step(-.85,p.y);
        float crest=inside*(border+.10);
        float a=mix(target,crest,shield)*alpha; if(a<.005)discard;gl_FragColor=vec4(color*1.9,a);}`,
  }));
  const icon = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.55), iconMaterial);
  icon.frustumCulled = false;
  root.add(icon);
  const trap = new THREE.Group();
  trap.name = 'PlacedSnareTrap';
  root.add(trap);
  const iron = new THREE.MeshStandardMaterial({ color: '#596268', roughness: 0.5, metalness: 0.8 });
  const trapRing = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.018, 6, 32), iron);
  trapRing.rotation.x = Math.PI / 2;
  trap.add(trapRing);
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.015, 16), iron);
  trap.add(plate);
  const toothGeo = new THREE.ConeGeometry(0.024, 0.055, 4);
  for (let i = 0; i < 12; i++) {
    const a = (i * Math.PI) / 6;
    const tooth = new THREE.Mesh(toothGeo, iron);
    tooth.position.set(Math.cos(a) * 0.20, 0.025, Math.sin(a) * 0.20);
    trap.add(tooth);
  }
  const orbMaterial = enableSpellBloom(new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { time: { value: 0 }, alpha: { value: 0 } },
    vertexShader: `varying vec3 p;varying vec3 n;varying vec3 v;void main(){p=position;n=normalMatrix*normal;vec4 mv=modelViewMatrix*vec4(position,1);v=-mv.xyz;gl_Position=projectionMatrix*mv;}`,
    fragmentShader: `varying vec3 p;varying vec3 n;varying vec3 v;uniform float time;uniform float alpha;
      void main(){float rim=pow(1.-abs(dot(normalize(n),normalize(v))),2.);float flow=sin(p.x*17.+p.y*23.-time*19.)*sin(p.z*19.-time*7.);
      gl_FragColor=vec4(mix(vec3(.12,.23,1.8),vec3(.7,1.4,2.2),rim),(rim*.75+pow(max(0.,flow),3.)*.4)*alpha);}`,
  }));
  const orb = new THREE.Mesh(new THREE.SphereGeometry(1, 36, 24), orbMaterial);
  root.add(orb);
  const flash = createSpellGlow('#8bbaff', 1.15);
  root.add(flash.mesh);
  const rings = Array.from({ length: 3 }, () => {
    const m = enableSpellBloom(new THREE.MeshBasicMaterial({
      color: '#ccdec6', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    const r = new THREE.Mesh(new THREE.TorusGeometry(1, 0.006, 6, 48), m);
    root.add(r);
    return r;
  });
  const position = new THREE.Vector3();

  function hide() {
    icon.visible = false;
    trap.visible = false;
    orb.visible = false;
    flash.mesh.visible = false;
    for (const r of rings) r.visible = false;
  }
  hide();

  return {
    root,
    hide,
    sample(id, v, time, release, origin, target) {
      hide();
      const e = time - release;
      const fade = Math.max(0, Math.min(1, 3 - e));
      if (id === 'hunters-mark' || id === 'mana-shield') {
        icon.visible = e >= 0;
        icon.position.copy(id === 'hunters-mark' ? target : position.set(0, 0, 0));
        icon.position.y = id === 'hunters-mark' ? 1.96 : 2.42;
        iconMaterial.uniforms.shield.value = id === 'mana-shield' ? 1 : 0;
        iconMaterial.uniforms.color.value.set(id === 'hunters-mark' ? '#ff283c' : '#71b9ff');
        iconMaterial.uniforms.alpha.value = fade * smoothRange(0, 0.08, e);
      }
      if (id === 'snare') {
        // The trap travels out of the hand and settles at the ground point.
        trap.visible = time > release * 0.14;
        trap.position.copy(origin).lerp(target, smoothRange(release * 0.22, release + 0.18, time));
        trap.rotation.set(0, 0, 0);
        trap.scale.setScalar(1);
      }
      if (id === 'blink' || id === 'shadowstep' || id === 'vanish') {
        const strength = smoothRange(-0.14, 0, e) * (1 - smoothRange(0.1, 0.34, e));
        position.copy(origin);
        position.y = 1.0;
        orb.visible = strength > 0.001;
        orb.position.copy(position);
        orb.scale.setScalar(0.3 + strength * 0.47);
        orbMaterial.uniforms.time.value = time;
        orbMaterial.uniforms.alpha.value = strength;
        flash.mesh.visible = strength > 0.001;
        flash.mesh.position.copy(position);
        flash.uniforms.uAlpha.value = strength * 0.65;
        flash.uniforms.uTime.value = time;
      }
      if (id === 'beast-call') for (let i = 0; i < 3; i++) {
        const p = THREE.MathUtils.clamp((e - i * 0.17) / 0.85, 0, 1);
        const r = rings[i];
        r.visible = p > 0 && p < 1;
        r.position.set(0, 1.7 + p * 0.55, 0.3 + p * 0.8);
        r.rotation.x = -Math.PI / 4;
        r.scale.setScalar(0.08 + p * 0.55);
        r.material.color.set(v.color);
        r.material.opacity = Math.sin(p * Math.PI) * 0.27;
      }
    },
    dispose() {
      flash.dispose();
      toothGeo.dispose();
      iron.dispose();
      disposeTree(root);
    },
  };
}
