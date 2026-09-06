// The fireball: a gathering orb between the palms, a plasma trail, and an
// explosion that scorches whatever it lands on.
//
// PORTED from the studio's src/vfx/spells/createFireballImpact.ts and
// createFireballVfx.ts. Every number is the studio's.
//
// ONE THING IS NOT THE STUDIO'S, and it is the seam this whole folder needed:
// the studio aimed at a fixed point 3.1 m in front of the actor because it was
// a playground with a target dummy at that mark. The game has a real target at
// a real distance, so `setAim(launchLocal, targetLocal)` writes the launch and
// the landing point in the actor's local frame and `reset()` restores THOSE
// rather than the playground's. Everything downstream of the two vectors is
// unchanged, which is what keeps a studio update a re-port.

import * as THREE from 'three';
import { SPELL_MOTIONS } from './motions.js';
import { createSpellGlow, createSpellRibbon } from './glow.js';
import { createFireVolume } from './fire_volume.js';
import { createSpellParticleLayer } from './particles.js';
import { disposeTree, smoothRange } from './util.js';
import { enableSpellBloom } from './bloom.js';

export const FIREBALL_RELEASE = SPELL_MOTIONS.fireball.release[0];
export const FIREBALL_IMPACT = FIREBALL_RELEASE + 0.29;
export const FIREBALL_END = FIREBALL_IMPACT + 2.5;
const TRAIL_POINTS = 32;
const FIRE_COLOR = new THREE.Color('#ffbc5c');
const GATHER_COLOURS = ['#ffe29b', '#ff6919'];
const TRAIL_COLOURS = ['#ff5515', '#ffe09b'];

const ATLAS = { columns: 6, rows: 6, frames: 36 };
// The studio's explosion palette. Held as defaults rather than as the only
// answer, because `setPalette` below is what lets one fireball chain be a
// frost bolt or a shadow bolt without a second copy of the effect.
const HOT = new THREE.Color('#ffbc6a');
const SOOT = new THREE.Color('#a79888');
const EMBER = new THREE.Color('#ff9b28');
const WHITE = new THREE.Color('#ffffff');

/** The explosion, its shockwave and its scorch, at a point with a normal. */
export function createFireballImpact(parent, textures) {
  const root = new THREE.Group();
  root.name = 'FireballImpact';
  parent.add(root);
  const flames = createSpellParticleLayer({ capacity: 7, texture: textures && textures.fire, atlas: ATLAS, additive: true, hdr: 2.6 });
  flames.mesh.name = 'FireballExplosion';
  const smoke = createSpellParticleLayer({ capacity: 12, texture: textures && textures.smoke, atlas: ATLAS, additive: false });
  smoke.mesh.name = 'FireballSmoke';
  const sparks = createSpellParticleLayer({ capacity: 72, additive: true, hdr: 4 });
  sparks.mesh.name = 'FireballImpactSparks';
  root.add(flames.mesh, smoke.mesh, sparks.mesh);
  const flash = createSpellGlow('#ffc565', 1.6);
  flash.mesh.name = 'FireballImpactFlash';
  // A brief optical flare surrounds the contact point without a hard floor slice.
  flash.mesh.material.depthTest = false;
  flash.uniforms.uIntensity.value = 2.5;
  root.add(flash.mesh);
  const light = new THREE.PointLight('#ff7c2f', 0, 4.5, 2);
  root.add(light);

  const shockMaterial = enableSpellBloom(new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uAlpha: { value: 0 } },
    vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec2 vUv;uniform float uTime;uniform float uAlpha;
      void main(){vec2 p=vUv*2.-1.;float r=length(p);float a=atan(p.y,p.x);
        float edge=.72+sin(a*7.+uTime*3.)*.012+sin(a*13.-uTime*2.)*.007;
        float ridge=exp(-pow((r-edge)/.022,2.));
        float breakup=.87+.13*sin(a*11.+sin(a*5.)+uTime*8.);
        float alpha=ridge*breakup*uAlpha;
        gl_FragColor=vec4(2.1,.72,.12,alpha);}`,
  }));
  const shock = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), shockMaterial);
  shock.name = 'FireballShockwave';
  root.add(shock);
  const scorchMaterial = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uAlpha: { value: 0 } },
    vertexShader: `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader: `varying vec2 vUv;uniform float uAlpha;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}
      void main(){vec2 p=vUv*2.-1.;float r=length(p);
        float grain=noise(p*5.+3.)*.65+noise(p*13.)*.35;
        float soot=(1.-smoothstep(.3,.95,r+(grain-.5)*.32))*(.7+.3*grain);
        gl_FragColor=vec4(.027,.017,.012,soot*uAlpha);}`,
  });
  const scorch = new THREE.Mesh(new THREE.PlaneGeometry(1.45, 1.45), scorchMaterial);
  scorch.name = 'FireballScorch';
  root.add(scorch);
  const hot = HOT.clone();
  const soot = SOOT.clone();
  const ember = EMBER.clone();
  const position = new THREE.Vector3();
  const surfaceUp = new THREE.Vector3(0, 0, 1);
  const tangent = new THREE.Vector3();
  const bitangent = new THREE.Vector3();
  const orientation = new THREE.Quaternion();
  const axis = new THREE.Vector3(1, 0, 0);

  return {
    root,
    /** Recolour the explosion. `palette` is one row of visuals.js ELEMENTS. */
    setPalette(palette) {
      if (!palette) return this;
      hot.set(palette.accent).lerp(WHITE, 0.25);
      ember.set(palette.color);
      soot.set(palette.color).lerp(SOOT, 0.72);
      flash.uniforms.uColor.value.set(palette.accent);
      light.color.set(palette.color);
      return this;
    },
    /** Back to the studio's own explosion. */
    resetPalette() {
      hot.copy(HOT);
      soot.copy(SOOT);
      ember.copy(EMBER);
      flash.uniforms.uColor.value.set('#ffc565');
      light.color.set('#ff7c2f');
      return this;
    },
    update(age, point, normal, grounded) {
      root.visible = age >= 0 && age < 2.5;
      if (!root.visible) { light.intensity = 0; return; }
      flames.setSurfaceFade(point, normal, grounded ? 0.11 : 0);
      smoke.setSurfaceFade(point, normal, grounded ? 0.16 : 0);
      const fade = 1 - smoothRange(1.55, 2.5, age);
      orientation.setFromUnitVectors(surfaceUp, normal);
      tangent.crossVectors(normal, Math.abs(normal.x) < 0.9 ? axis : surfaceUp).normalize();
      bitangent.crossVectors(normal, tangent);
      let count = 0;
      for (let i = 0; i < 7; i++) {
        const localAge = age - i * 0.025;
        if (localAge < 0 || localAge > 1.05) continue;
        const a = i * 2.399963;
        const expansion = 1 - Math.exp(-localAge * 9);
        position.copy(point).addScaledVector(normal, 0.15 + localAge * (0.42 + (i % 3) * 0.1))
          .addScaledVector(tangent, Math.cos(a) * expansion * 0.36)
          .addScaledVector(bitangent, Math.sin(a) * expansion * 0.3);
        flames.setParticle(count++, position, (0.42 + expansion * 1.12) * (i === 0 ? 1.15 : 0.7),
          a * 0.18, hot, (1 - smoothRange(0.52, 1.05, localAge)) * (i === 0 ? 0.94 : 0.5), localAge * 30);
      }
      flames.commit(count);
      count = 0;
      for (let i = 0; i < 12; i++) {
        const localAge = age - 0.09 - i * 0.035;
        if (localAge < 0) continue;
        const a = i * 2.399963;
        const radius = 0.08 + localAge * 0.22;
        position.copy(point).addScaledVector(normal, 0.18 + localAge * (0.38 + (i % 4) * 0.045))
          .addScaledVector(tangent, Math.cos(a) * radius)
          .addScaledVector(bitangent, Math.sin(a) * radius);
        smoke.setParticle(count++, position, 0.45 + localAge * 0.58, a + localAge * 0.12, soot,
          smoothRange(0, 0.18, localAge) * fade * 0.22, Math.min(35, localAge * 24));
      }
      smoke.commit(count);
      count = 0;
      for (let i = 0; i < 72; i++) {
        const life = 0.42 + (i % 11) * 0.052;
        if (age > life) continue;
        const a = i * 2.399963;
        const speed = 0.65 + (i % 9) * 0.17;
        const lift = 0.75 + (i % 7) * 0.28;
        const height = Math.max(0.012, 0.06 + lift * age - 2.8 * age * age);
        position.copy(point).addScaledVector(normal, height)
          .addScaledVector(tangent, Math.cos(a) * speed * age)
          .addScaledVector(bitangent, Math.sin(a) * speed * age);
        sparks.setParticle(count++, position, 0.010 + (i % 3) * 0.003, a, ember,
          Math.pow(1 - age / life, 0.7), 0, 2.6 + speed);
      }
      sparks.commit(count);
      flash.mesh.position.copy(point).addScaledVector(normal, 0.12);
      flash.mesh.scale.setScalar(0.35 + Math.min(age, 0.2) * 3);
      flash.uniforms.uAlpha.value = Math.exp(-age * 16) * 0.85;
      flash.uniforms.uTime.value = age;
      light.position.copy(point).addScaledVector(normal, 0.3);
      light.intensity = Math.exp(-age * 6) * 8;
      shock.visible = grounded && age < 0.48;
      shock.position.copy(point).addScaledVector(normal, 0.018);
      shock.quaternion.copy(orientation);
      shock.scale.setScalar(0.25 + (1 - Math.exp(-age * 9)) * 1.55);
      shockMaterial.uniforms.uAlpha.value = (1 - smoothRange(0.035, 0.4, age)) * 0.42;
      shockMaterial.uniforms.uTime.value = age;
      scorch.visible = grounded;
      scorch.position.copy(point).addScaledVector(normal, 0.012);
      scorch.quaternion.copy(orientation);
      scorchMaterial.uniforms.uAlpha.value = smoothRange(0, 0.12, age) * fade * 0.65;
    },
    // Geometries and materials are released once by the parent tree disposer.
    dispose() { light.dispose(); },
  };
}

export function createFireballVfx(context) {
  const root = new THREE.Group();
  root.name = 'FireballVfx';
  root.visible = false;
  context.actor.add(root);
  const orb = new THREE.Group();
  orb.name = 'FireballProjectile';
  root.add(orb);
  const volume = createFireVolume();
  volume.mesh.name = 'FireballEnvelope';
  const halo = createSpellGlow('#ff6a16', 0.34);
  halo.mesh.name = 'FireballHalo';
  halo.uniforms.uIntensity.value = 2.6;
  const light = new THREE.PointLight('#ff842e', 0, 3.1, 2);
  orb.add(halo.mesh, volume.mesh, light);
  const tendrils = Array.from({ length: 3 }, (unused, index) => {
    const ribbon = createSpellRibbon(index === 0 ? '#ffe29b' : '#ff6919', 24, index === 0 ? 0.011 : 0.017);
    ribbon.uniforms.uColor.value.multiplyScalar(index === 0 ? 3.3 : 2.2);
    ribbon.mesh.name = `FireballGatherRibbon${index}`;
    root.add(ribbon.mesh);
    return { ribbon, points: Array.from({ length: 24 }, () => new THREE.Vector3()) };
  });
  const outerTrail = createSpellRibbon('#ff5515', TRAIL_POINTS, 0.12);
  outerTrail.mesh.name = 'FireballPlasmaTrail';
  outerTrail.uniforms.uColor.value.multiplyScalar(2.4);
  const hotTrail = createSpellRibbon('#ffe09b', TRAIL_POINTS, 0.038);
  hotTrail.mesh.name = 'FireballHotTrail';
  hotTrail.uniforms.uColor.value.multiplyScalar(3.1);
  root.add(outerTrail.mesh, hotTrail.mesh);
  const trails = [outerTrail, hotTrail];
  const embers = createSpellParticleLayer({ capacity: 52, additive: true, hdr: 3.2 });
  embers.mesh.name = 'FireballEmbers';
  root.add(embers.mesh);
  const impact = createFireballImpact(root, context.textures);
  const emberColour = FIRE_COLOR.clone();
  const left = new THREE.Vector3();
  const right = new THREE.Vector3();
  // The aim: where the bolt starts and where it lands, in the actor's frame.
  const aimLaunch = new THREE.Vector3(0, 1.285, 0.90);
  const aimTarget = new THREE.Vector3(0, 0.035, 3.1);
  const launch = aimLaunch.clone();
  const target = aimTarget.clone();
  const normal = new THREE.Vector3(0, 1, 0);
  const direction = new THREE.Vector3();
  const position = new THREE.Vector3();
  const worldOrigin = new THREE.Vector3();
  const worldTarget = new THREE.Vector3();
  const worldNormal = new THREE.Vector3();
  const castWorld = new THREE.Matrix4();
  const inverse = new THREE.Matrix4();
  const normalMatrix = new THREE.Matrix3();
  const trailPoints = Array.from({ length: TRAIL_POINTS }, () => new THREE.Vector3());
  let released = false;
  let previousTime = -1;
  let grounded = true;
  let presentation = 0;

  function reset() {
    released = false;
    previousTime = -1;
    root.matrixAutoUpdate = true;
    root.position.set(0, 0, 0);
    root.quaternion.identity();
    root.scale.setScalar(1);
    launch.copy(aimLaunch);
    target.copy(aimTarget);
    normal.set(0, 1, 0);
    presentation = 0;
    root.visible = false;
  }

  function release() {
    context.actor.updateWorldMatrix(true, false);
    castWorld.copy(context.actor.matrixWorld);
    if (previousTime >= 0) {
      context.socketPosition('Socket_HandVFX_Left', left);
      context.socketPosition('Socket_HandVFX_Right', right);
      launch.copy(left).add(right).multiplyScalar(0.5);
      launch.z += 0.1;
    }
    worldOrigin.copy(launch).applyMatrix4(castWorld);
    worldTarget.copy(target).applyMatrix4(castWorld);
    const distance = worldTarget.distanceTo(worldOrigin);
    direction.copy(worldTarget).sub(worldOrigin).normalize();
    grounded = !context.resolveImpact || context.resolveImpact(worldOrigin, direction, distance + 0.35, worldTarget, worldNormal);
    if (context.resolveImpact && grounded) {
      inverse.copy(castWorld).invert();
      target.copy(worldTarget).applyMatrix4(inverse);
      normal.copy(worldNormal).applyNormalMatrix(normalMatrix.getNormalMatrix(inverse));
    }
    released = true;
    root.matrixAutoUpdate = false;
  }

  return {
    root,
    reset,
    /**
     * Recolour the whole chain. One row of visuals.js ELEMENTS in, and the
     * halo, the gather ribbons, both trails, the embers, the point light, the
     * marched volume and the explosion all move together. Without it every
     * spell that borrows this chain would be orange, which is how a frost
     * shard ends up looking like a small fireball.
     */
    setPalette(palette) {
      if (!palette) return this;
      halo.uniforms.uColor.value.set(palette.color);
      light.color.set(palette.color);
      volume.material.uniforms.uTint.value.set(palette.tint || '#ffffff');
      emberColour.set(palette.accent);
      tendrils[0].ribbon.uniforms.uColor.value.set(palette.accent).multiplyScalar(3.3);
      for (let i = 1; i < tendrils.length; i++) tendrils[i].ribbon.uniforms.uColor.value.set(palette.color).multiplyScalar(2.2);
      outerTrail.uniforms.uColor.value.set(palette.color).multiplyScalar(2.4);
      hotTrail.uniforms.uColor.value.set(palette.accent).multiplyScalar(3.1);
      impact.setPalette(palette);
      return this;
    },
    /** Back to the studio's own fire. */
    resetPalette() {
      halo.uniforms.uColor.value.set('#ff6a16');
      light.color.set('#ff842e');
      volume.material.uniforms.uTint.value.set('#ffffff');
      emberColour.copy(FIRE_COLOR);
      tendrils[0].ribbon.uniforms.uColor.value.set(GATHER_COLOURS[0]).multiplyScalar(3.3);
      for (let i = 1; i < tendrils.length; i++) tendrils[i].ribbon.uniforms.uColor.value.set(GATHER_COLOURS[1]).multiplyScalar(2.2);
      outerTrail.uniforms.uColor.value.set(TRAIL_COLOURS[0]).multiplyScalar(2.4);
      hotTrail.uniforms.uColor.value.set(TRAIL_COLOURS[1]).multiplyScalar(3.1);
      impact.resetPalette();
      return this;
    },
    /** Where the bolt starts and lands, in the actor's local frame. */
    setAim(launchLocal, targetLocal) {
      if (launchLocal) aimLaunch.copy(launchLocal);
      if (targetLocal) aimTarget.copy(targetLocal);
      if (!released) { launch.copy(aimLaunch); target.copy(aimTarget); }
      return this;
    },
    samplePresentation(worldPosition) {
      if (!root.visible) return 0;
      position.copy(previousTime < FIREBALL_IMPACT ? orb.position : target);
      root.localToWorld(worldPosition.copy(position));
      return presentation;
    },
    update(timeSeconds) {
      if (timeSeconds < previousTime - 0.000001) reset();
      root.visible = timeSeconds >= 0 && timeSeconds < FIREBALL_END;
      if (!root.visible) { presentation = 0; light.intensity = 0; return; }
      const gathering = timeSeconds < FIREBALL_RELEASE;
      if (!gathering && !released) release();
      if (released) {
        context.actor.updateWorldMatrix(true, false);
        root.matrix.copy(context.actor.matrixWorld).invert().multiply(castWorld);
      }
      root.updateWorldMatrix(true, true);
      const charge = smoothRange(0.025, 0.48, timeSeconds);
      const flight = THREE.MathUtils.clamp((timeSeconds - FIREBALL_RELEASE) / (FIREBALL_IMPACT - FIREBALL_RELEASE), 0, 1);
      const impactAge = timeSeconds - FIREBALL_IMPACT;
      if (gathering) {
        context.socketPosition('Socket_HandVFX_Left', left);
        context.socketPosition('Socket_HandVFX_Right', right);
        orb.position.copy(left).add(right).multiplyScalar(0.5);
        orb.position.y += 0.035;
        orb.position.z += 0.04;
      } else {
        orb.position.copy(launch).lerp(target, flight);
        orb.position.y += Math.sin(flight * Math.PI) * 0.12;
      }
      orb.visible = impactAge < 0.025;
      const size = gathering ? 0.3 + charge * 0.78 : 1.16 - flight * 0.12;
      orb.scale.setScalar(size);
      volume.material.uniforms.uTime.value = timeSeconds * 1.5;
      volume.material.uniforms.uOpacity.value = gathering ? charge : 1;
      halo.uniforms.uAlpha.value = charge * 0.52;
      halo.uniforms.uTime.value = timeSeconds;
      // Emissive VFX provide the hot core; close-range spill keeps skin detail.
      light.intensity = impactAge < 0 ? charge * (gathering ? 0.35 : 1.2) : 0;
      for (let j = 0; j < tendrils.length; j++) {
        const { ribbon, points } = tendrils[j];
        ribbon.mesh.visible = gathering && charge > 0.01;
        for (let i = 0; i < points.length; i++) {
          const p = i / (points.length - 1);
          const angle = timeSeconds * (7 + j) + p * Math.PI * 2.2 + j * 2.09;
          const radius = (0.33 * (1 - p) + 0.06) * charge;
          points[i].copy(orb.position);
          points[i].x += Math.cos(angle) * radius;
          points[i].y += Math.sin(angle) * radius * 0.62;
          points[i].z += Math.sin(angle + j) * radius * 0.5;
        }
        ribbon.update(points);
        ribbon.uniforms.uAlpha.value = charge * 0.68;
        ribbon.uniforms.uTime.value = timeSeconds;
      }
      const trailFade = 1 - smoothRange(0, 0.14, impactAge);
      const trailVisible = !gathering && trailFade > 0.001;
      const trailStart = Math.max(0, flight - 0.6);
      direction.copy(target).sub(launch);
      for (let i = 0; i < TRAIL_POINTS; i++) {
        const p = i / (TRAIL_POINTS - 1);
        const sample = THREE.MathUtils.lerp(trailStart, flight, p);
        trailPoints[i].copy(launch).addScaledVector(direction, sample);
        trailPoints[i].y += Math.sin(sample * Math.PI) * 0.12 + Math.sin(timeSeconds * 22 + p * 13) * 0.026 * (1 - p);
        trailPoints[i].x += Math.sin(timeSeconds * 27 - p * 17) * 0.035 * (1 - p);
      }
      for (const trail of trails) {
        trail.update(trailPoints);
        trail.mesh.visible = trailVisible;
        trail.uniforms.uAlpha.value = trailFade * 0.76;
        trail.uniforms.uTime.value = timeSeconds;
      }
      let count = 0;
      if (impactAge < 0.16) for (let i = 0; i < 52; i++) {
        const angle = i * 2.399963 + timeSeconds * 1.4;
        const radius = 0.12 + (i % 9) * 0.018;
        position.copy(orb.position);
        if (!gathering) position.addScaledVector(direction, -(i % 13) * 0.028);
        position.x += Math.cos(angle) * radius;
        position.y += Math.sin(angle) * radius;
        position.z += Math.sin(angle * 1.7) * radius * 0.5;
        embers.setParticle(count++, position, 0.012 + (i % 4) * 0.003, angle, emberColour, charge * trailFade * 0.65, 0, 1.8);
      }
      embers.commit(count);
      impact.update(impactAge, target, normal, grounded);
      presentation = impactAge < 0 ? charge * (gathering ? 0.16 : 0.36) : Math.exp(-impactAge * 5) * 0.75;
      previousTime = timeSeconds;
      root.updateWorldMatrix(true, true);
    },
    dispose() {
      impact.dispose();
      light.dispose();
      disposeTree(root);
    },
  };
}
