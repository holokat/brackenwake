// Energy missiles: three beats out of alternating palms, each a cored bolt
// with a plasma sheath, two trails and a spiral wake, shattering on contact.
//
// PORTED from the studio's src/vfx/spells/createEnergyMissilesVfx.ts and
// createEnergyMissileShatter.ts.
//
// THE SEAM: the studio flew every missile 2.55 m down the actor's +z because
// its dummy stood there. `setAim(targetLocal)` gives the volley a real point
// to fly at; the per-missile spread, the arc height and the stagger are still
// the studio's, applied about that aim rather than about a fixed forward.

import * as THREE from 'three';
import { SPELL_MOTIONS } from './motions.js';
import { createSpellGlow, createSpellRibbon } from './glow.js';
import { createSpellParticleLayer } from './particles.js';
import { additiveMaterial, disposeTree, quadraticBezier, smoothRange } from './util.js';

export const ENERGY_MISSILES_END = 2;

const TRAIL_POINTS = 24;
const BEAT_COUNTS = [2, 3, 2];
const BEAT_STARTS = [0, 2, 5];
const FALLBACK_LAUNCHES = [
  new THREE.Vector3(-0.12, 1.27, 0.92),
  new THREE.Vector3(0.12, 1.27, 0.92),
  new THREE.Vector3(-0.10, 1.28, 1.00),
];
const LOCAL_FORWARD = new THREE.Vector3(0, 0, 1);
const LOCAL_SIDE = new THREE.Vector3(1, 0, 0);
const LOCAL_UP = new THREE.Vector3(0, 1, 0);
const CYAN = new THREE.Color('#9ffbff');
const VIOLET = new THREE.Color('#a777ff');
const SHARDS_PER_IMPACT = 9;
const SHARD_CYAN = new THREE.Color('#8ff7ff');
const SHARD_VIOLET = new THREE.Color('#9d6cff');

/** One pooled particle layer for all seven staggered missile shatters. */
export function createEnergyMissileShatter(parent) {
  const particles = createSpellParticleLayer({ capacity: 7 * SHARDS_PER_IMPACT, additive: true, hdr: 3.4 });
  particles.mesh.name = 'EnergyMissileShatter';
  parent.add(particles.mesh);
  const worldPosition = new THREE.Vector3();
  const localPosition = new THREE.Vector3();

  return {
    mesh: particles.mesh,
    update(samples, worldToLocal) {
      let count = 0;
      for (const sample of samples) {
        if (!sample.active) continue;
        for (let shard = 0; shard < SHARDS_PER_IMPACT; shard += 1) {
          const lifetime = 0.32 + (shard % 4) * 0.055;
          if (sample.age >= lifetime) continue;
          const seed = sample.index * 11.7 + shard * 2.399963;
          const speed = 0.34 + (shard % 5) * 0.075;
          const radial = sample.age * speed * sample.worldScale;
          const lift = sample.age * (0.24 + (shard % 3) * 0.075) - sample.age * sample.age * 0.58;
          worldPosition.copy(sample.pointWorld)
            .addScaledVector(sample.sideWorld, Math.cos(seed) * radial)
            .addScaledVector(sample.upWorld, Math.sin(seed) * radial + lift * sample.worldScale)
            .addScaledVector(sample.directionWorld, (shard % 2 ? 1 : -1) * radial * 0.24);
          localPosition.copy(worldPosition).applyMatrix4(worldToLocal);
          const fade = Math.pow(1 - sample.age / lifetime, 1.25);
          particles.setParticle(count++, localPosition, 0.005 + (shard % 3) * 0.00125, seed,
            (sample.index + shard) % 3 ? SHARD_CYAN : SHARD_VIOLET, fade * 0.78, 0, 4.2 + speed * 5.2);
        }
      }
      particles.commit(count);
    },
    clear() { particles.commit(0); },
  };
}

function createMissile(index, beat, coreGeometry, sheathGeometry) {
  const root = new THREE.Group();
  root.name = `EnergyMissile${index + 1}`;
  root.visible = false;

  const coreMaterial = additiveMaterial(index % 3 === 1 ? '#efe8ff' : '#e9ffff', 0);
  coreMaterial.toneMapped = false;
  coreMaterial.color.multiplyScalar(2.8);
  const core = new THREE.Mesh(coreGeometry, coreMaterial);
  core.name = `EnergyMissileCore${index + 1}`;
  core.scale.set(0.72, 0.72, 2.25);

  const sheathMaterial = additiveMaterial(index % 3 === 1 ? '#681cff' : '#064eff', 0);
  sheathMaterial.toneMapped = false;
  sheathMaterial.color.multiplyScalar(2.15);
  const sheath = new THREE.Mesh(sheathGeometry, sheathMaterial);
  sheath.name = `EnergyMissileSheath${index + 1}`;
  sheath.scale.set(0.82, 0.82, 1.85);

  const halo = createSpellGlow(index % 3 === 1 ? '#6f2cff' : '#1b8eff', 0.06);
  halo.mesh.name = `EnergyMissileHalo${index + 1}`;
  halo.uniforms.uIntensity.value = 1.5;

  const outerTrail = createSpellRibbon(index % 3 === 1 ? '#7142ff' : '#147dff', TRAIL_POINTS, 0.027);
  outerTrail.mesh.name = `EnergyMissileRibbon${index + 1}`;
  outerTrail.uniforms.uColor.value.multiplyScalar(1.9);
  const coreTrail = createSpellRibbon('#ddffff', TRAIL_POINTS, 0.007);
  coreTrail.mesh.name = `EnergyMissileCoreRibbon${index + 1}`;
  coreTrail.uniforms.uColor.value.multiplyScalar(2.8);
  const spiralWake = createSpellRibbon(index % 3 === 1 ? '#bd81ff' : '#52e8ff', TRAIL_POINTS, 0.005);
  spiralWake.mesh.name = `EnergyMissileSpiral${index + 1}`;
  spiralWake.uniforms.uColor.value.multiplyScalar(2.1);

  const impactGlow = createSpellGlow(index % 3 === 1 ? '#8252ff' : '#55e9ff', 0.12);
  impactGlow.mesh.name = `EnergyMissileImpact${index + 1}`;
  impactGlow.mesh.visible = false;
  impactGlow.uniforms.uIntensity.value = 1.65;
  root.add(outerTrail.mesh, coreTrail.mesh, spiralWake.mesh, halo.mesh, core, sheath, impactGlow.mesh);

  const sideWorld = new THREE.Vector3();
  const upWorld = new THREE.Vector3();
  const directionWorld = new THREE.Vector3();
  const endWorld = new THREE.Vector3();
  return {
    index, beat, root, core, sheath, halo, outerTrail, coreTrail, spiralWake,
    trailPoints: Array.from({ length: TRAIL_POINTS }, () => new THREE.Vector3()),
    wakePoints: Array.from({ length: TRAIL_POINTS }, () => new THREE.Vector3()),
    startWorld: new THREE.Vector3(),
    controlWorld: new THREE.Vector3(),
    endWorld, directionWorld, sideWorld, upWorld,
    currentWorld: new THREE.Vector3(),
    impactGlow,
    impactSample: {
      index, active: false, age: -1,
      pointWorld: endWorld, sideWorld, upWorld, directionWorld, worldScale: 1,
    },
    duration: 0.36,
    launched: false,
  };
}

function createMuzzle(index) {
  const root = new THREE.Group();
  root.name = `EnergyVolleyMuzzle${index + 1}`;
  root.visible = false;
  const glow = createSpellGlow(index === 1 ? '#9670ff' : '#75efff', 0.19);
  glow.uniforms.uIntensity.value = 2.25;
  root.add(glow.mesh);
  return { root, glow, originWorld: new THREE.Vector3(), launched: false };
}

export function createEnergyMissilesVfx(context, options = {}) {
  const sourceTiming = SPELL_MOTIONS['energy-missiles'];
  const timing = options.single ? { ...sourceTiming, release: [sourceTiming.release[0]] } : sourceTiming;
  const beatCounts = options.single ? [1] : BEAT_COUNTS;
  const beatStarts = options.single ? [0] : BEAT_STARTS;
  const root = new THREE.Group();
  root.name = 'EnergyMissilesVfx';
  root.visible = false;
  context.actor.add(root);

  const coreGeometry = new THREE.IcosahedronGeometry(0.021, 1);
  const sheathGeometry = new THREE.IcosahedronGeometry(0.034, 1);
  coreGeometry.computeBoundingSphere();
  sheathGeometry.computeBoundingSphere();
  const missiles = [];
  for (let beat = 0; beat < beatCounts.length; beat += 1) {
    for (let local = 0; local < beatCounts[beat]; local += 1) {
      const missile = createMissile(beatStarts[beat] + local, beat, coreGeometry, sheathGeometry);
      missiles.push(missile);
      root.add(missile.root);
    }
  }
  const muzzles = timing.release.map((unused, index) => createMuzzle(index));
  for (const muzzle of muzzles) root.add(muzzle.root);

  const motes = createSpellParticleLayer({ capacity: 24, additive: true, hdr: 2.8 });
  motes.mesh.name = 'EnergyMissileHandMotes';
  root.add(motes.mesh);
  const shatter = createEnergyMissileShatter(root);
  const nearbyLight = new THREE.PointLight('#6cecff', 0, 1.3, 2);
  nearbyLight.name = 'EnergyMissileNearbyLight';
  root.add(nearbyLight);

  const leftPalm = new THREE.Vector3();
  const rightPalm = new THREE.Vector3();
  const launchWorld = new THREE.Vector3();
  const targetWorld = new THREE.Vector3();
  const normalWorld = new THREE.Vector3();
  const aimLocal = new THREE.Vector3(0, 1.05, 2.55);
  const aimWorld = new THREE.Vector3();
  const actorInverse = new THREE.Matrix4();
  const actorWorld = new THREE.Matrix4();
  const pointWorld = new THREE.Vector3();
  const tangentWorld = new THREE.Vector3();
  const tangentLocal = new THREE.Vector3();
  const pointLocal = new THREE.Vector3();
  const nextPointWorld = new THREE.Vector3();
  const presentationPosition = new THREE.Vector3();
  const localLaunch = new THREE.Vector3();
  const beatLaunched = [false, false, false];
  const impactSamples = missiles.map((missile) => missile.impactSample);
  let previousTime = -1;
  let emissionStopped = false;
  let presentationStrength = 0;

  function reset() {
    previousTime = -1;
    emissionStopped = false;
    presentationStrength = 0;
    root.visible = false;
    root.position.set(0, 0, 0);
    root.quaternion.identity();
    root.scale.setScalar(1);
    beatLaunched.fill(false);
    for (const muzzle of muzzles) {
      muzzle.launched = false;
      muzzle.root.visible = false;
      muzzle.glow.uniforms.uAlpha.value = 0;
    }
    for (const missile of missiles) {
      missile.launched = false;
      missile.root.visible = false;
      missile.core.visible = false;
      missile.sheath.visible = false;
      missile.halo.mesh.visible = false;
      missile.impactGlow.mesh.visible = false;
      missile.impactSample.active = false;
      missile.core.material.opacity = 0;
      missile.sheath.material.opacity = 0;
      missile.outerTrail.mesh.visible = false;
      missile.coreTrail.mesh.visible = false;
      missile.spiralWake.mesh.visible = false;
    }
    motes.commit(0);
    shatter.clear();
    nearbyLight.intensity = 0;
    nearbyLight.visible = false;
  }

  function captureLaunch(beat, sampledAfterRelease) {
    context.actor.updateWorldMatrix(true, true);
    actorWorld.copy(context.actor.matrixWorld);
    const e = actorWorld.elements;
    const worldScale = (
      Math.hypot(e[0], e[1], e[2]) + Math.hypot(e[4], e[5], e[6]) + Math.hypot(e[8], e[9], e[10])
    ) / 3;
    const socketName = beat === 1 ? 'Socket_HandVFX_Left' : 'Socket_HandVFX_Right';
    const socket = context.sockets && context.sockets.get ? context.sockets.get(socketName) : null;
    if (!sampledAfterRelease && socket) socket.getWorldPosition(launchWorld);
    else {
      localLaunch.copy(FALLBACK_LAUNCHES[beat]);
      launchWorld.copy(localLaunch).applyMatrix4(actorWorld);
    }
    const muzzle = muzzles[beat];
    muzzle.originWorld.copy(launchWorld);
    muzzle.launched = true;

    aimWorld.copy(aimLocal).applyMatrix4(actorWorld);
    const sideWorld = pointWorld.copy(LOCAL_SIDE).transformDirection(actorWorld);
    const upWorld = tangentWorld.copy(LOCAL_UP).transformDirection(actorWorld);
    const first = beatStarts[beat];
    const count = beatCounts[beat];
    for (let local = 0; local < count; local += 1) {
      const missile = missiles[first + local];
      const centered = local - (count - 1) * 0.5;
      missile.sideWorld.copy(sideWorld);
      missile.upWorld.copy(upWorld);
      missile.impactSample.worldScale = worldScale;
      missile.startWorld.copy(launchWorld)
        .addScaledVector(sideWorld, centered * 0.032 * worldScale)
        .addScaledVector(upWorld, Math.abs(centered) * 0.009 * worldScale);
      // The aim, plus the studio's per-missile fan about it.
      missile.directionWorld.copy(aimWorld).sub(missile.startWorld);
      if (missile.directionWorld.lengthSq() < 1e-8) missile.directionWorld.copy(LOCAL_FORWARD).transformDirection(actorWorld);
      const reach = missile.directionWorld.length();
      missile.directionWorld.normalize()
        .addScaledVector(sideWorld, centered * 0.105)
        .addScaledVector(upWorld, -0.025 + (local % 2) * 0.032)
        .normalize();
      const distance = reach + (beat * 0.13 + Math.abs(centered) * 0.18) * worldScale;
      targetWorld.copy(missile.startWorld).addScaledVector(missile.directionWorld, distance);
      normalWorld.copy(missile.directionWorld).negate();
      if (context.resolveImpact) {
        context.resolveImpact(missile.startWorld, missile.directionWorld, distance, targetWorld, normalWorld);
      }
      missile.endWorld.copy(targetWorld);
      missile.controlWorld.copy(missile.startWorld).lerp(missile.endWorld, 0.48)
        .addScaledVector(upWorld, (0.11 + beat * 0.018) * worldScale)
        .addScaledVector(sideWorld, centered * 0.075 * worldScale);
      missile.duration = 0.34 + local * 0.027 + beat * 0.014;
      missile.launched = true;
    }
    beatLaunched[beat] = true;
  }

  function updateMotes(timeSeconds) {
    context.socketPosition('Socket_HandVFX_Left', leftPalm);
    context.socketPosition('Socket_HandVFX_Right', rightPalm);
    let count = 0;
    const gather = smoothRange(0.015, timing.gather, timeSeconds)
      * (1 - smoothRange(timing.release[0] - 0.13, timing.release[0], timeSeconds));
    for (let hand = 0; hand < 2; hand += 1) {
      const palm = hand ? rightPalm : leftPalm;
      for (let mote = 0; mote < 6; mote += 1) {
        const angle = mote * 2.399963 + timeSeconds * (hand ? -8.5 : 8.5);
        pointLocal.copy(palm);
        pointLocal.x += Math.cos(angle) * (0.045 + (mote % 2) * 0.012);
        pointLocal.y += Math.sin(angle) * 0.04;
        pointLocal.z += Math.sin(angle * 1.7) * 0.025;
        motes.setParticle(count++, pointLocal, 0.009 + (mote % 3) * 0.002, angle,
          (mote + hand) % 3 ? CYAN : VIOLET, gather * 0.72, 0, 1.4);
      }
    }
    if (!emissionStopped) for (let beat = 0; beat < timing.release.length; beat += 1) {
      if (beatLaunched[beat]) continue;
      const release = timing.release[beat];
      const anticipation = smoothRange(release - 0.16, release - 0.08, timeSeconds)
        * (1 - smoothRange(release - 0.035, release, timeSeconds));
      if (anticipation <= 0) continue;
      const palm = beat === 1 ? leftPalm : rightPalm;
      for (let mote = 0; mote < 8; mote += 1) {
        const angle = mote * 2.399963 + timeSeconds * (12 + beat);
        pointLocal.copy(palm);
        pointLocal.x += Math.cos(angle) * (0.035 + mote * 0.003);
        pointLocal.y += Math.sin(angle) * 0.032;
        pointLocal.z += Math.cos(angle * 1.4) * 0.025;
        motes.setParticle(count++, pointLocal, 0.009 + (mote % 2) * 0.003, angle,
          beat === 1 ? VIOLET : CYAN, anticipation * 0.9, 0, 1.65);
      }
    }
    motes.commit(count);
  }

  function updateMissile(missile, timeSeconds) {
    if (!missile.launched) return 0;
    const release = timing.release[missile.beat];
    const age = timeSeconds - release;
    const impactAge = age - missile.duration;
    const active = age >= 0 && impactAge < 0.58;
    missile.root.visible = active;
    missile.impactSample.active = impactAge >= 0 && impactAge < 0.5;
    missile.impactSample.age = impactAge;
    if (!active) return 0;

    const progress = THREE.MathUtils.clamp(age / missile.duration, 0, 1);
    quadraticBezier(missile.currentWorld, missile.startWorld, missile.controlWorld, missile.endWorld, progress);
    pointLocal.copy(missile.currentWorld).applyMatrix4(actorInverse);
    missile.root.position.copy(pointLocal);
    const nextProgress = Math.min(1, progress + 0.012);
    quadraticBezier(nextPointWorld, missile.startWorld, missile.controlWorld, missile.endWorld, nextProgress);
    tangentWorld.copy(nextPointWorld).sub(missile.currentWorld).normalize();
    tangentLocal.copy(tangentWorld).transformDirection(actorInverse);
    missile.root.quaternion.setFromUnitVectors(LOCAL_FORWARD, tangentLocal);

    const flightFade = 1 - smoothRange(missile.duration * 0.82, missile.duration, age);
    const launchSnap = smoothRange(0, 0.025, age);
    const headAlpha = launchSnap * flightFade;
    missile.core.visible = impactAge < 0;
    missile.sheath.visible = impactAge < 0;
    missile.halo.mesh.visible = impactAge < 0;
    missile.core.material.opacity = headAlpha;
    missile.sheath.material.opacity = headAlpha * 0.5;
    missile.halo.uniforms.uAlpha.value = headAlpha * 0.27;
    missile.halo.uniforms.uTime.value = timeSeconds + missile.index * 0.37;
    missile.root.scale.setScalar(0.92 + Math.sin(progress * Math.PI) * 0.08);

    const trailFade = impactAge < 0 ? launchSnap : 1 - smoothRange(0, 0.16, impactAge);
    const trailVisible = trailFade > 0.001;
    const trailStart = Math.max(0, progress - 0.62);
    for (let index = 0; index < TRAIL_POINTS; index += 1) {
      const along = index / (TRAIL_POINTS - 1);
      const sample = THREE.MathUtils.lerp(trailStart, progress, along);
      quadraticBezier(pointWorld, missile.startWorld, missile.controlWorld, missile.endWorld, sample);
      pointLocal.copy(pointWorld).applyMatrix4(actorInverse).sub(missile.root.position);
      missile.trailPoints[index].copy(pointLocal);

      const phase = sample * 23 + missile.index * 1.71;
      const amplitude = 0.018 * missile.impactSample.worldScale * (1 - along) * Math.sin(along * Math.PI);
      pointWorld.addScaledVector(missile.sideWorld, Math.cos(phase) * amplitude)
        .addScaledVector(missile.upWorld, Math.sin(phase) * amplitude);
      pointLocal.copy(pointWorld).applyMatrix4(actorInverse).sub(missile.root.position);
      missile.wakePoints[index].copy(pointLocal);
    }
    missile.outerTrail.update(missile.trailPoints);
    missile.coreTrail.update(missile.trailPoints);
    missile.spiralWake.update(missile.wakePoints);
    missile.outerTrail.mesh.visible = trailVisible;
    missile.coreTrail.mesh.visible = trailVisible;
    missile.spiralWake.mesh.visible = trailVisible;
    missile.outerTrail.uniforms.uAlpha.value = trailFade * 0.63;
    missile.coreTrail.uniforms.uAlpha.value = trailFade * 0.94;
    missile.spiralWake.uniforms.uAlpha.value = trailFade * 0.42;
    missile.outerTrail.uniforms.uTime.value = timeSeconds + missile.index;
    missile.coreTrail.uniforms.uTime.value = timeSeconds + missile.index * 0.7;
    missile.spiralWake.uniforms.uTime.value = timeSeconds - missile.index * 0.5;

    missile.impactGlow.mesh.visible = missile.impactSample.active;
    if (missile.impactSample.active) {
      missile.impactGlow.uniforms.uAlpha.value = Math.exp(-impactAge * 10.5) * 0.3;
      missile.impactGlow.uniforms.uTime.value = timeSeconds + missile.index;
      missile.impactGlow.mesh.scale.setScalar(0.3 + smoothRange(0, 0.2, impactAge) * 0.74);
    }
    return impactAge < 0
      ? 0.18 + Math.sin(progress * Math.PI) * 0.13
      : Math.exp(-impactAge * 6.5) * 0.46;
  }

  reset();
  return {
    root,
    reset,
    /** Recolour the volley: an arcane bolt and a shadow bolt share this shape. */
    setPalette(palette) {
      if (!palette) return this;
      const core = new THREE.Color(palette.accent);
      const sheath = new THREE.Color(palette.color);
      for (const missile of missiles) {
        missile.core.material.color.copy(core).multiplyScalar(2.8);
        missile.sheath.material.color.copy(sheath).multiplyScalar(2.15);
        missile.halo.uniforms.uColor.value.copy(sheath);
        missile.outerTrail.uniforms.uColor.value.copy(sheath).multiplyScalar(1.9);
        missile.coreTrail.uniforms.uColor.value.copy(core).multiplyScalar(2.8);
        missile.spiralWake.uniforms.uColor.value.copy(core).multiplyScalar(2.1);
        missile.impactGlow.uniforms.uColor.value.copy(sheath);
      }
      for (const muzzle of muzzles) muzzle.glow.uniforms.uColor.value.copy(sheath);
      CYAN.set(palette.accent);
      VIOLET.set(palette.color);
      SHARD_CYAN.set(palette.accent);
      SHARD_VIOLET.set(palette.color);
      nearbyLight.color.copy(sheath);
      return this;
    },
    /** Where the volley flies, in the actor's local frame. */
    setAim(targetLocal) {
      if (targetLocal) aimLocal.copy(targetLocal);
      return this;
    },
    stopEmission() { emissionStopped = true; },
    samplePresentation(outWorld) {
      if (!root.visible || presentationStrength <= 0) return 0;
      outWorld.copy(presentationPosition);
      return presentationStrength;
    },
    update(timeSeconds) {
      if (timeSeconds < previousTime - 0.000001) reset();
      root.visible = timeSeconds >= 0 && timeSeconds < ENERGY_MISSILES_END;
      if (!root.visible) {
        nearbyLight.intensity = 0;
        presentationStrength = 0;
        return;
      }
      context.actor.updateWorldMatrix(true, true);
      actorWorld.copy(context.actor.matrixWorld);
      actorInverse.copy(actorWorld).invert();
      const sampledAfterRelease = previousTime < 0 && timeSeconds > timing.release[0] + 0.000001;
      if (!emissionStopped) for (let beat = 0; beat < timing.release.length; beat += 1) {
        if (!beatLaunched[beat] && timeSeconds >= timing.release[beat]) captureLaunch(beat, sampledAfterRelease);
      }

      updateMotes(timeSeconds);
      presentationStrength = 0;
      for (let beat = 0; beat < muzzles.length; beat += 1) {
        const muzzle = muzzles[beat];
        if (!muzzle.launched) continue;
        const age = timeSeconds - timing.release[beat];
        const visible = age >= 0 && age < 0.115;
        muzzle.root.visible = visible;
        if (!visible) continue;
        muzzle.root.position.copy(muzzle.originWorld).applyMatrix4(actorInverse);
        const snap = Math.exp(-age * 28);
        muzzle.glow.uniforms.uAlpha.value = snap * 0.82;
        muzzle.glow.uniforms.uTime.value = timeSeconds + beat;
        muzzle.root.scale.setScalar(0.38 + age * 8.5);
        if (snap * 0.2 > presentationStrength) {
          presentationStrength = snap * 0.2;
          presentationPosition.copy(muzzle.originWorld);
        }
      }

      for (const missile of missiles) {
        const strength = updateMissile(missile, timeSeconds);
        if (strength > presentationStrength) {
          presentationStrength = strength;
          presentationPosition.copy(missile.currentWorld);
        }
      }
      shatter.update(impactSamples, actorInverse);
      nearbyLight.intensity = Math.min(1.05, presentationStrength * 2.3);
      nearbyLight.visible = presentationStrength > 0;
      if (presentationStrength > 0) nearbyLight.position.copy(presentationPosition).applyMatrix4(actorInverse);
      else nearbyLight.position.set(0, 0, 0);
      previousTime = timeSeconds;
      root.updateWorldMatrix(true, true);
    },
    dispose() {
      nearbyLight.dispose();
      disposeTree(root);
      coreGeometry.dispose();
      sheathGeometry.dispose();
    },
  };
}
