// The blessing: a sigil between the palms, two wisps feeding it, a column of
// motes, and the sigil laid down at the feet on release.
//
// PORTED from the studio's src/vfx/spells/createHealingVfx.ts, unchanged. It
// plays ON the caster, which is why nothing here takes an aim: a heal, a buff
// and a shield all happen where the body is.

import * as THREE from 'three';
import { createSpellGlow, createSpellRibbon } from './glow.js';
import { SPELL_MOTIONS } from './motions.js';
import { additiveMaterial, disposeTree, smoothRange } from './util.js';
import { enableSpellBloom } from './bloom.js';

const MOTE_COUNT = 64;
const WISP_POINTS = 14;

function createWisp(color) {
  const ribbon = createSpellRibbon(color, WISP_POINTS, 0.04);
  const attribute = new THREE.BufferAttribute(new Float32Array(WISP_POINTS * 3), 3);
  return { line: ribbon.mesh, attribute, material: ribbon.mesh.material, ribbon };
}

export const HEALING_RELEASE = SPELL_MOTIONS.healing.release[0];
export const HEALING_END = SPELL_MOTIONS.healing.duration;

export function createHealingVfx(context) {
  const timing = SPELL_MOTIONS.healing;
  const release = timing.release[0];
  const root = new THREE.Group();
  root.name = 'HealingVfx';
  root.visible = false;
  context.actor.add(root);

  const sigil = new THREE.Group();
  sigil.name = 'HealingSigil';
  sigil.position.set(0, 1.25, 0.31);
  const outerMaterial = additiveMaterial('#9cff70', 0);
  const outer = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.012, 7, 64), outerMaterial);
  const innerMaterial = additiveMaterial('#ffd968', 0);
  const inner = new THREE.Mesh(new THREE.TorusGeometry(0.235, 0.009, 6, 48), innerMaterial);
  const rayGeometry = new THREE.BoxGeometry(0.012, 0.095, 0.006);
  for (let index = 0; index < 8; index += 1) {
    const ray = new THREE.Mesh(rayGeometry, innerMaterial);
    const angle = (index / 8) * Math.PI * 2;
    ray.position.set(Math.sin(angle) * 0.3, Math.cos(angle) * 0.3, 0);
    ray.rotation.z = -angle;
    sigil.add(ray);
  }
  sigil.add(outer, inner);
  root.add(sigil);

  const heartMaterial = additiveMaterial('#fff0a8', 0);
  const heart = new THREE.Mesh(new THREE.IcosahedronGeometry(0.025, 2), heartMaterial);
  heart.name = 'HealingHeart';
  heart.position.set(0, 1.58, 0.34);
  root.add(heart);
  const heartGlow = createSpellGlow('#c5ff84', 0.72);
  root.add(heartGlow.mesh);

  const columnMaterial = enableSpellBloom(new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uOpacity: { value: 0 }, uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `uniform float uOpacity; uniform float uTime; varying vec2 vUv;
      void main(){
        float vertical=sin(vUv.y*3.14159);
        float strands=pow(.5+.5*sin(vUv.x*56.5487+vUv.y*13.-uTime*3.),14.);
        float shimmer=.55+.45*sin(vUv.y*23.+uTime*5.);
        gl_FragColor=vec4(.55,1.,.38,uOpacity*vertical*strands*shimmer*.2);
      }`,
  }));
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.28, 2.2, 28, 1, true), columnMaterial);
  column.name = 'HealingColumn';
  column.position.y = 1.08;
  root.add(column);

  const motePositions = new Float32Array(MOTE_COUNT * 3);
  const moteGeometry = new THREE.BufferGeometry();
  moteGeometry.setAttribute('position', new THREE.BufferAttribute(motePositions, 3));
  const moteMaterial = enableSpellBloom(new THREE.PointsMaterial({
    color: '#d8ff83', size: 0.025, sizeAttenuation: true, transparent: true,
    opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  const motes = new THREE.Points(moteGeometry, moteMaterial);
  motes.name = 'HealingMotes';
  motes.frustumCulled = false;
  root.add(motes);

  const leftWisp = createWisp('#8dff7a');
  const rightWisp = createWisp('#ffe475');
  leftWisp.line.name = 'HealingLeftWisp';
  rightWisp.line.name = 'HealingRightWisp';
  root.add(leftWisp.line, rightWisp.line);
  const light = new THREE.PointLight('#c9ff7d', 0, 2.35, 2);
  light.position.set(0, 1.38, 0.28);
  root.add(light);

  const left = new THREE.Vector3();
  const right = new THREE.Vector3();
  const heartPosition = new THREE.Vector3();
  const wispPoint = new THREE.Vector3();
  const tint = new THREE.Color();

  function updateWisp(wisp, hand, timeSeconds, side) {
    for (let index = 0; index < WISP_POINTS; index += 1) {
      const progress = index / (WISP_POINTS - 1);
      wispPoint.copy(hand).lerp(heartPosition, progress);
      wispPoint.x += Math.sin(progress * Math.PI * 2 + timeSeconds * 5.5) * 0.035 * side;
      wispPoint.y += Math.sin(progress * Math.PI) * 0.09;
      wisp.attribute.setXYZ(index, wispPoint.x, wispPoint.y, wispPoint.z);
    }
    wisp.ribbon.update(wisp.attribute.array);
  }

  return {
    root,
    /**
     * Recolour the whole blessing. A Bless, a Stone Skin and a Lich Form all
     * play this shape, and the school's colour is what tells them apart.
     */
    setTint(color) {
      tint.set(color);
      outerMaterial.color.copy(tint);
      heartMaterial.color.copy(tint).lerp(new THREE.Color('#ffffff'), 0.45);
      heartGlow.uniforms.uColor.value.copy(tint);
      moteMaterial.color.copy(tint);
      leftWisp.ribbon.uniforms.uColor.value.copy(tint);
      light.color.copy(tint);
      return this;
    },
    reset() {
      root.visible = false;
      moteMaterial.opacity = 0;
      light.intensity = 0;
    },
    update(timeSeconds) {
      root.visible = true;
      context.socketPosition('Socket_Weapon_Left', left);
      context.socketPosition('Socket_Weapon_Right', right);

      const gather = smoothRange(0, timing.gather, timeSeconds);
      const blessing = smoothRange(timing.gather, release, timeSeconds);
      const releasePulse = smoothRange(release, release + 0.2, timeSeconds);
      const fade = 1 - smoothRange(timing.recover, timing.duration, timeSeconds);
      const opacity = gather * fade;
      sigil.visible = opacity > 0.001;
      sigil.scale.setScalar(0.62 + blessing * 0.38 + releasePulse * 0.34);
      sigil.rotation.z = timeSeconds * 0.55;
      sigil.rotation.x = (-Math.PI / 2) * releasePulse;
      sigil.position.y = THREE.MathUtils.lerp(1.35, 0.035, releasePulse);
      sigil.position.z = THREE.MathUtils.lerp(0.31, 0, releasePulse);
      inner.rotation.z = -timeSeconds * 1.25;
      outerMaterial.opacity = opacity * 0.34;
      innerMaterial.opacity = opacity * 0.44;
      heart.visible = opacity > 0.001;
      // Follow the gather between the actual palms, then settle the blessing
      // at chest height while the hands open to release it.
      heart.position.copy(left).add(right).multiplyScalar(0.5);
      heart.position.lerp(heartPosition.set(0, 1.28, 0.34), releasePulse);
      heart.scale.setScalar(0.68 + blessing * 0.46 + Math.sin(timeSeconds * 8) * 0.035);
      heartMaterial.opacity = opacity * (0.72 + releasePulse * 0.28);
      heartPosition.copy(heart.position);
      heartGlow.mesh.position.copy(heart.position);
      light.position.copy(heart.position);
      heartGlow.uniforms.uAlpha.value = opacity * 0.8;
      heartGlow.uniforms.uTime.value = timeSeconds;

      column.visible = timeSeconds >= timing.gather && fade > 0.001;
      column.scale.x = 0.58 + releasePulse * 0.72;
      column.scale.z = column.scale.x;
      columnMaterial.uniforms.uOpacity.value = opacity * (0.45 + releasePulse * 0.55);
      columnMaterial.uniforms.uTime.value = timeSeconds;
      const moteAttribute = moteGeometry.getAttribute('position');
      for (let index = 0; index < MOTE_COUNT; index += 1) {
        const seed = index * 0.61803398875;
        const cycle = (seed + timeSeconds * (0.22 + (index % 5) * 0.018)) % 1;
        const angle = index * 2.399963 + timeSeconds * 0.45;
        const radius = 0.14 + (index % 8) * 0.034;
        moteAttribute.setXYZ(index, Math.cos(angle) * radius, 0.08 + cycle * 2.05, Math.sin(angle) * radius + 0.13);
      }
      moteAttribute.needsUpdate = true;
      moteMaterial.opacity = opacity * 0.74;

      updateWisp(leftWisp, left, timeSeconds, -1);
      updateWisp(rightWisp, right, timeSeconds, 1);
      const wispAlpha = opacity * (0.28 + blessing * 0.5);
      leftWisp.material.opacity = wispAlpha;
      rightWisp.material.opacity = wispAlpha;
      leftWisp.ribbon.uniforms.uAlpha.value = wispAlpha;
      rightWisp.ribbon.uniforms.uAlpha.value = wispAlpha;
      light.intensity = opacity * (0.75 + releasePulse * 1.15);
    },
    samplePresentation(worldPosition) {
      if (!root.visible) return 0;
      root.localToWorld(worldPosition.copy(heartPosition));
      return moteMaterial.opacity * 0.5;
    },
    dispose() {
      light.dispose();
      rayGeometry.dispose();
      disposeTree(root);
    },
  };
}
