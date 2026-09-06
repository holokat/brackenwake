// A sky strike: ions gathering overhead, three re-strikes down one bolt graph,
// ground arcs, hot debris, smoke and a scorch that outlives all of it.
//
// PORTED from the studio's src/vfx/spells/createLightningVfx.ts, seeds and all,
// so the bolt is deterministic and the same cast looks the same twice.
//
// THE SEAM, as in fireball.js: `setAim(targetLocal)` moves the strike point in
// the actor's local frame. The sky point is derived from it at release, four
// and a quarter metres up the surface normal, exactly as the studio did.

import * as THREE from 'three';
import { SPELL_MOTIONS } from './motions.js';
import { createSpellGlow, createSpellRibbon } from './glow.js';
import { createSpellParticleLayer } from './particles.js';
import { writeHierarchicalBolt } from './bolt.js';
import { disposeTree, smoothRange } from './util.js';

export const LIGHTNING_RELEASE = SPELL_MOTIONS.lightning.release[0];
export const LIGHTNING_END = 2.55;

const MAIN_POINTS = 33;
const BRANCH_POINTS = 9;
const PRIMARY_FORK_COUNT = 5;
const SECONDARY_FORK_COUNT = 3;
const FORK_COUNT = PRIMARY_FORK_COUNT + SECONDARY_FORK_COUNT + 1;
const PRIMARY_ATTACHMENTS = [5, 10, 16, 22, 27];
const SECONDARY_PARENTS = [0, 2, 4];
const GROUND_ARC_COUNT = 4;
const ION_ARC_COUNT = 2;
const ION_COUNT = 28;
const SPARK_COUNT = 48;
const SMOKE_COUNT = 10;
const STRIKE_STARTS = [0, 0.105, 0.215];
const STRIKE_ENDS = [0.068, 0.183, 0.271];
const STRIKE_PEAKS = [1, 0.72, 0.44];
const COBALT = new THREE.Color('#358cff');
const HOT_BLUE = new THREE.Color('#9eefff');
const WHITE_HOT = new THREE.Color('#ffffff');
const SMOKE = new THREE.Color('#8496ac');
const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);

function createBolt(parent, name, pointCount, color, width) {
  const ribbon = createSpellRibbon(color, pointCount, width);
  ribbon.mesh.name = name;
  ribbon.mesh.visible = false;
  parent.add(ribbon.mesh);
  return { ribbon, points: Array.from({ length: pointCount }, () => new THREE.Vector3()) };
}

function setBoltAppearance(bolt, visible, alpha, time) {
  bolt.ribbon.mesh.visible = visible;
  bolt.ribbon.uniforms.uAlpha.value = visible ? alpha : 0;
  bolt.ribbon.uniforms.uTime.value = time;
}

function setBranchTaper(bolt) {
  const taper = bolt.ribbon.mesh.geometry.getAttribute('aTaper');
  for (let index = 0; index < bolt.points.length; index += 1) {
    const width = Math.pow(1 - index / (bolt.points.length - 1), 0.58);
    taper.setX(index * 2, width);
    taper.setX(index * 2 + 1, width);
  }
  taper.needsUpdate = true;
}

function hash01(index, channel) {
  const value = Math.sin(index * 91.17 + channel * 37.41) * 43758.5453;
  return value - Math.floor(value);
}

export function createLightningVfx(context) {
  const timing = SPELL_MOTIONS.lightning;
  const root = new THREE.Group();
  root.name = 'LightningVfx';
  root.visible = false;
  context.actor.add(root);

  const main = createBolt(root, 'LightningCore', MAIN_POINTS, '#f5ffff', 0.011);
  main.ribbon.uniforms.uColor.value.multiplyScalar(4.8);
  const mainGlow = createBolt(root, 'LightningCoreGlow', MAIN_POINTS, '#276cff', 0.035);
  mainGlow.ribbon.uniforms.uColor.value.multiplyScalar(2.4);
  const forks = Array.from({ length: FORK_COUNT }, (unused, index) => {
    const bolt = createBolt(root, `LightningFork${index + 1}`, BRANCH_POINTS, index % 2 ? '#71c8ff' : '#e9ffff', 0.011);
    bolt.ribbon.uniforms.uColor.value.multiplyScalar(index % 2 ? 2.1 : 3.7);
    setBranchTaper(bolt);
    return bolt;
  });
  const groundArcs = Array.from({ length: GROUND_ARC_COUNT }, (unused, index) => {
    const bolt = createBolt(root, `LightningGroundArc${index + 1}`, BRANCH_POINTS, index % 2 ? '#2774ff' : '#bdefff', 0.014);
    bolt.ribbon.uniforms.uColor.value.multiplyScalar(index % 2 ? 1.9 : 2.7);
    setBranchTaper(bolt);
    return bolt;
  });
  const ionArcs = Array.from({ length: ION_ARC_COUNT }, (unused, index) => {
    const bolt = createBolt(root, `LightningIonArc${index + 1}`, BRANCH_POINTS, index ? '#4f8fff' : '#d9ffff', 0.009);
    bolt.ribbon.uniforms.uColor.value.multiplyScalar(index ? 1.8 : 2.8);
    return bolt;
  });
  const strikeBolts = [main, mainGlow, ...forks];
  const allBolts = [...strikeBolts, ...groundArcs, ...ionArcs];

  const ions = createSpellParticleLayer({ capacity: ION_COUNT, additive: true, hdr: 2.6 });
  ions.mesh.name = 'LightningIons';
  root.add(ions.mesh);
  const sparks = createSpellParticleLayer({ capacity: SPARK_COUNT, additive: true, hdr: 4.2 });
  sparks.mesh.name = 'LightningHotDebris';
  root.add(sparks.mesh);
  const smoke = createSpellParticleLayer({
    capacity: SMOKE_COUNT,
    texture: context.textures && context.textures.smoke,
    atlas: context.textures && context.textures.smoke ? { columns: 6, rows: 6, frames: 36 } : undefined,
    hdr: 1,
  });
  smoke.mesh.name = 'LightningSmoke';
  root.add(smoke.mesh);

  const impactGlow = createSpellGlow('#78bdff', 0.24);
  impactGlow.mesh.name = 'LightningContactFlash';
  impactGlow.mesh.material.depthTest = false;
  impactGlow.uniforms.uIntensity.value = 2.8;
  root.add(impactGlow.mesh);

  const scorchMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    uniforms: { uAlpha: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `
      uniform float uAlpha;
      varying vec2 vUv;
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float r = length(p);
        float spokes = 0.5 + 0.5 * sin(atan(p.y, p.x) * 11.0 + r * 19.0);
        float soot = (1.0 - smoothstep(0.16, 1.0, r)) * (0.68 + spokes * 0.22);
        gl_FragColor = vec4(0.018, 0.026, 0.042, soot * uAlpha);
      }
    `,
  });
  scorchMaterial.name = 'LightningScorchMaterial';
  const scorch = new THREE.Mesh(new THREE.CircleGeometry(0.42, 48), scorchMaterial);
  scorch.name = 'LightningScorch';
  scorch.visible = false;
  root.add(scorch);

  const light = new THREE.PointLight('#73b9ff', 0, 3.25, 2);
  light.name = 'LightningContactLight';
  root.add(light);

  const left = new THREE.Vector3();
  const right = new THREE.Vector3();
  const overhead = new THREE.Vector3();
  const aimTarget = new THREE.Vector3(0, 0.025, 2.25);
  const target = aimTarget.clone();
  const normal = new THREE.Vector3(0, 1, 0);
  const sky = new THREE.Vector3(0, 4.3, 2.25);
  const tangent = new THREE.Vector3(1, 0, 0);
  const bitangent = new THREE.Vector3(0, 0, 1);
  const point = new THREE.Vector3();
  const offset = new THREE.Vector3();
  const velocity = new THREE.Vector3();
  const worldOrigin = new THREE.Vector3();
  const worldTarget = new THREE.Vector3();
  const worldNormal = new THREE.Vector3();
  const rayDirection = new THREE.Vector3();
  const castWorld = new THREE.Matrix4();
  const inverse = new THREE.Matrix4();
  const normalMatrix = new THREE.Matrix3();
  const groundQuaternion = new THREE.Quaternion();
  let released = false;
  let grounded = true;
  let previousTime = -1;
  let presentation = 0;

  function sampleHands() {
    context.socketPosition('Socket_HandVFX_Left', left);
    context.socketPosition('Socket_HandVFX_Right', right);
    overhead.copy(left).add(right).multiplyScalar(0.5);
    overhead.x *= 0.28;
    overhead.y = Math.max(1.96, overhead.y + 0.42);
    overhead.z += 0.12;
  }

  function captureRelease() {
    sampleHands();
    context.actor.updateWorldMatrix(true, false);
    castWorld.copy(context.actor.matrixWorld);
    worldOrigin.copy(sky).applyMatrix4(castWorld);
    worldTarget.copy(target).applyMatrix4(castWorld);
    rayDirection.copy(worldTarget).sub(worldOrigin);
    const distance = rayDirection.length();
    rayDirection.multiplyScalar(1 / Math.max(distance, 1e-6));
    grounded = !context.resolveImpact
      || context.resolveImpact(worldOrigin, rayDirection, distance + 0.6, worldTarget, worldNormal);
    inverse.copy(castWorld).invert();
    if (context.resolveImpact && grounded) {
      target.copy(worldTarget).applyMatrix4(inverse);
      normal.copy(worldNormal).applyNormalMatrix(normalMatrix.getNormalMatrix(inverse)).normalize();
    }
    tangent.crossVectors(normal, Math.abs(normal.y) < 0.84 ? AXIS_X : AXIS_Z).normalize();
    bitangent.crossVectors(normal, tangent).normalize();
    sky.copy(target).addScaledVector(normal, 4.25).addScaledVector(bitangent, -0.08);
    groundQuaternion.setFromUnitVectors(AXIS_Z, normal);
    smoke.setSurfaceFade(target, normal, grounded ? 0.12 : 0);
    released = true;
    root.matrixAutoUpdate = false;
  }

  function reset() {
    released = false;
    grounded = true;
    previousTime = -1;
    presentation = 0;
    target.copy(aimTarget);
    normal.set(0, 1, 0);
    sky.set(aimTarget.x, aimTarget.y + 4.275, aimTarget.z);
    root.matrixAutoUpdate = true;
    root.matrix.identity();
    root.position.set(0, 0, 0);
    root.quaternion.identity();
    root.scale.setScalar(1);
    root.visible = false;
    for (let index = 0; index < allBolts.length; index += 1) setBoltAppearance(allBolts[index], false, 0, 0);
    ions.commit(0);
    sparks.commit(0);
    smoke.commit(0);
    impactGlow.mesh.visible = false;
    impactGlow.uniforms.uAlpha.value = 0;
    scorch.visible = false;
    scorchMaterial.uniforms.uAlpha.value = 0;
    light.intensity = 0;
  }

  function updateGathering(timeSeconds) {
    sampleHands();
    const gather = smoothRange(0.04, timing.gather + 0.24, timeSeconds)
      * (1 - smoothRange(LIGHTNING_RELEASE - 0.07, LIGHTNING_RELEASE, timeSeconds));
    const flicker = 0.72 + 0.28 * (hash01(Math.floor(timeSeconds * 24), 3) > 0.38 ? 1 : 0.3);
    let ionCount = 0;
    for (let index = 0; index < ION_COUNT; index += 1) {
      const orbit = timeSeconds * (2.8 + (index % 4) * 0.23) + index * 2.399963;
      const radius = 0.1 + hash01(index, 2) * 0.34;
      const progress = hash01(index, 5);
      point.copy(overhead);
      point.x += Math.cos(orbit) * radius;
      point.z += Math.sin(orbit) * radius * 0.58;
      point.y += (progress - 0.5) * 0.42 + Math.sin(orbit * 1.7) * 0.06;
      ions.setParticle(ionCount++, point, 0.009 + hash01(index, 7) * 0.018, orbit,
        index % 3 ? COBALT : WHITE_HOT, gather * flicker * (0.36 + hash01(index, 8) * 0.54), 0, 2.4);
    }
    ions.commit(gather > 0.002 ? ionCount : 0);
    for (let index = 0; index < ionArcs.length; index += 1) {
      const ion = ionArcs[index];
      writeHierarchicalBolt(ion.points, index ? right : left, overhead, 101 + index * 37 + Math.floor(timeSeconds * 10), 0.12);
      ion.ribbon.update(ion.points);
      setBoltAppearance(ion, gather > 0.22 && hash01(Math.floor(timeSeconds * 18), index + 9) > 0.42, gather * 0.54, timeSeconds);
    }
    for (let index = 0; index < strikeBolts.length; index += 1) setBoltAppearance(strikeBolts[index], false, 0, timeSeconds);
    for (let index = 0; index < groundArcs.length; index += 1) setBoltAppearance(groundArcs[index], false, 0, timeSeconds);
    sparks.commit(0);
    smoke.commit(0);
    impactGlow.mesh.visible = false;
    scorch.visible = false;
    light.intensity = 0;
    presentation = gather * 0.22;
  }

  function updateReleased(timeSeconds) {
    const age = timeSeconds - LIGHTNING_RELEASE;
    let pulse = 0;
    let pattern = 0;
    for (let index = 0; index < STRIKE_STARTS.length; index += 1) {
      const local = age - STRIKE_STARTS[index];
      const duration = STRIKE_ENDS[index] - STRIKE_STARTS[index];
      if (local < 0 || local > duration) continue;
      pulse = STRIKE_PEAKS[index] * smoothRange(0, 0.006, local) * (1 - smoothRange(0.016, duration, local));
      pattern = index;
      break;
    }

    const strikeVisible = pulse > 0.001;
    if (strikeVisible) {
      writeHierarchicalBolt(main.points, sky, target, 17 + pattern * 26, 0.56 - pattern * 0.06, 0.65);
      main.ribbon.update(main.points);
      mainGlow.ribbon.update(main.points);
      setBoltAppearance(main, true, pulse, timeSeconds);
      setBoltAppearance(mainGlow, true, pulse * 0.46, timeSeconds);
      for (let index = 0; index < PRIMARY_FORK_COUNT; index += 1) {
        const fork = forks[index];
        const branchIndex = PRIMARY_ATTACHMENTS[index];
        point.copy(main.points[branchIndex]);
        const length = 0.34 + hash01(index + pattern * 3, 30) * 0.5;
        const sideSign = index % 2 ? -1 : 1;
        offset.copy(tangent).multiplyScalar(sideSign * length)
          .addScaledVector(bitangent, (hash01(index + pattern * 7, 10) - 0.5) * length * 0.85)
          .addScaledVector(normal, -0.08 - index * 0.035);
        point.add(offset);
        writeHierarchicalBolt(fork.points, main.points[branchIndex], point, 211 + pattern * 31 + index * 17, 0.11 + index * 0.012);
        fork.ribbon.update(fork.points);
        setBoltAppearance(fork, true, pulse * (0.9 - index * 0.1), timeSeconds);
      }
      for (let index = 0; index < SECONDARY_FORK_COUNT; index += 1) {
        const parent = forks[SECONDARY_PARENTS[index]];
        const fork = forks[PRIMARY_FORK_COUNT + index];
        const parentPoint = 4 + index;
        velocity.copy(parent.points[parentPoint]).sub(parent.points[parentPoint - 1]).normalize();
        point.copy(parent.points[parentPoint]);
        const sideSign = index % 2 ? 1 : -1;
        const length = 0.24 + hash01(index + pattern * 5, 32) * 0.22;
        point.addScaledVector(velocity, length * 0.24)
          .addScaledVector(tangent, sideSign * length * 0.72)
          .addScaledVector(bitangent, (hash01(index, 34) - 0.5) * length * 0.7)
          .addScaledVector(normal, -0.04 - index * 0.02);
        writeHierarchicalBolt(fork.points, parent.points[parentPoint], point, 521 + pattern * 43 + index * 23, 0.065 + index * 0.008);
        fork.ribbon.update(fork.points);
        setBoltAppearance(fork, true, pulse * (0.58 - index * 0.09), timeSeconds);
      }
      const tertiaryParent = forks[PRIMARY_FORK_COUNT + 1];
      const tertiary = forks[FORK_COUNT - 1];
      velocity.copy(tertiaryParent.points[5]).sub(tertiaryParent.points[4]).normalize();
      point.copy(tertiaryParent.points[5])
        .addScaledVector(velocity, 0.07)
        .addScaledVector(tangent, -0.19)
        .addScaledVector(bitangent, 0.09)
        .addScaledVector(normal, -0.035);
      writeHierarchicalBolt(tertiary.points, tertiaryParent.points[5], point, 719 + pattern * 37, 0.045);
      tertiary.ribbon.update(tertiary.points);
      setBoltAppearance(tertiary, true, pulse * 0.34, timeSeconds);
    } else {
      for (let index = 0; index < strikeBolts.length; index += 1) setBoltAppearance(strikeBolts[index], false, 0, timeSeconds);
    }

    const groundStrength = smoothRange(0, 0.018, age) * (1 - smoothRange(0.24, 0.58, age));
    for (let index = 0; index < groundArcs.length; index += 1) {
      const arc = groundArcs[index];
      const angle = index * Math.PI * 0.5 + 0.28;
      point.copy(target)
        .addScaledVector(tangent, Math.cos(angle) * (0.36 + index * 0.12))
        .addScaledVector(bitangent, Math.sin(angle) * (0.36 + index * 0.12));
      writeHierarchicalBolt(arc.points, target, point, 407 + index * 29, 0.07);
      for (let pointIndex = 0; pointIndex < arc.points.length; pointIndex += 1) {
        const arcPoint = arc.points[pointIndex];
        offset.copy(arcPoint).sub(target);
        arcPoint.addScaledVector(normal, 0.016 - offset.dot(normal));
      }
      arc.ribbon.update(arc.points);
      setBoltAppearance(arc, grounded && groundStrength > 0.002, groundStrength * (0.72 - index * 0.08), timeSeconds);
    }
    for (let index = 0; index < ionArcs.length; index += 1) setBoltAppearance(ionArcs[index], false, 0, timeSeconds);
    ions.commit(0);

    const flash = smoothRange(0, 0.009, age) * (1 - smoothRange(0.035, 0.14, age));
    impactGlow.mesh.visible = flash > 0.001;
    impactGlow.mesh.position.copy(target).addScaledVector(normal, 0.105);
    impactGlow.uniforms.uAlpha.value = flash * 0.42;
    impactGlow.uniforms.uTime.value = timeSeconds;
    light.position.copy(target).addScaledVector(normal, 0.23);
    light.intensity = Math.min(1.15, flash * 1.15 + pulse * 0.28);

    let sparkCount = 0;
    if (age >= 0 && age < 0.92) {
      for (let index = 0; index < SPARK_COUNT; index += 1) {
        const delay = hash01(index, 12) * 0.07;
        const flight = age - delay;
        if (flight < 0) continue;
        const angle = index * 2.399963 + hash01(index, 14) * 0.34;
        const speed = 0.72 + hash01(index, 16) * 1.5;
        velocity.copy(tangent).multiplyScalar(Math.cos(angle) * speed)
          .addScaledVector(bitangent, Math.sin(angle) * speed)
          .addScaledVector(normal, 0.82 + hash01(index, 18) * 1.58);
        point.copy(target).addScaledVector(normal, 0.035).addScaledVector(velocity, flight)
          .addScaledVector(normal, -3.7 * flight * flight);
        offset.copy(point).sub(target);
        const distanceToPlane = offset.dot(normal);
        if (distanceToPlane < 0.012) point.addScaledVector(normal, 0.012 - distanceToPlane);
        const alpha = Math.max(0, 1 - flight / 0.72) * (0.34 + hash01(index, 20) * 0.48);
        sparks.setParticle(sparkCount++, point, 0.005 + hash01(index, 22) * 0.008, angle,
          index % 4 ? HOT_BLUE : WHITE_HOT, alpha, 0, 1.7 + speed * 0.35);
      }
    }
    sparks.commit(sparkCount);

    let smokeCount = 0;
    if (age > 0.08 && age < 1.72) {
      for (let index = 0; index < SMOKE_COUNT; index += 1) {
        const delay = 0.08 + index * 0.038;
        const smokeAge = age - delay;
        if (smokeAge < 0) continue;
        const angle = index * 2.399963;
        point.copy(target)
          .addScaledVector(tangent, Math.cos(angle) * (0.035 + smokeAge * 0.13))
          .addScaledVector(bitangent, Math.sin(angle) * (0.035 + smokeAge * 0.13))
          .addScaledVector(normal, 0.045 + smokeAge * (0.23 + hash01(index, 24) * 0.13));
        const alpha = smoothRange(0, 0.12, smokeAge) * (1 - smoothRange(0.65, 1.58, smokeAge)) * 0.32;
        smoke.setParticle(smokeCount++, point, 0.16 + smokeAge * 0.25, angle + smokeAge * 0.65, SMOKE, alpha, smokeAge * 18 + index * 1.7);
      }
    }
    smoke.commit(smokeCount);

    scorch.visible = grounded && age >= 0.035 && age < LIGHTNING_END - LIGHTNING_RELEASE;
    scorch.position.copy(target).addScaledVector(normal, 0.008);
    scorch.quaternion.copy(groundQuaternion);
    scorchMaterial.uniforms.uAlpha.value = smoothRange(0.04, 0.16, age)
      * (1 - smoothRange(1.35, LIGHTNING_END - LIGHTNING_RELEASE, age)) * 0.46;
    presentation = Math.max(pulse * 0.8, flash, groundStrength * 0.36, Math.max(0, 1 - age / 1.25) * 0.12);
  }

  reset();
  const paletteWhite = new THREE.Color('#ffffff');
  return {
    root,
    reset,
    /**
     * Recolour the strike. Smite is a holy bolt and Chain Lightning is a blue
     * one; the same graph draws both, and this is the only difference.
     */
    setPalette(palette) {
      if (!palette) return this;
      const core = new THREE.Color(palette.accent).lerp(paletteWhite, 0.4);
      const glow = new THREE.Color(palette.color);
      main.ribbon.uniforms.uColor.value.copy(core).multiplyScalar(4.8);
      mainGlow.ribbon.uniforms.uColor.value.copy(glow).multiplyScalar(2.4);
      for (let index = 0; index < forks.length; index += 1) {
        forks[index].ribbon.uniforms.uColor.value.copy(index % 2 ? glow : core).multiplyScalar(index % 2 ? 2.1 : 3.7);
      }
      for (let index = 0; index < groundArcs.length; index += 1) {
        groundArcs[index].ribbon.uniforms.uColor.value.copy(index % 2 ? glow : core).multiplyScalar(index % 2 ? 1.9 : 2.7);
      }
      for (let index = 0; index < ionArcs.length; index += 1) {
        ionArcs[index].ribbon.uniforms.uColor.value.copy(index ? glow : core).multiplyScalar(index ? 1.8 : 2.8);
      }
      impactGlow.uniforms.uColor.value.set(palette.color);
      light.color.set(palette.color);
      COBALT.set(palette.color);
      HOT_BLUE.set(palette.accent);
      return this;
    },
    /** Where the bolt lands, in the actor's local frame. */
    setAim(targetLocal) {
      if (targetLocal) aimTarget.copy(targetLocal);
      if (!released) {
        target.copy(aimTarget);
        sky.set(aimTarget.x, aimTarget.y + 4.275, aimTarget.z);
      }
      return this;
    },
    samplePresentation(worldPosition) {
      if (!root.visible) return 0;
      point.copy(released ? target : overhead);
      root.localToWorld(worldPosition.copy(point));
      return presentation;
    },
    update(timeSeconds) {
      if (timeSeconds < previousTime - 0.000001) reset();
      root.visible = timeSeconds >= 0 && timeSeconds < LIGHTNING_END;
      if (!root.visible) {
        presentation = 0;
        light.intensity = 0;
        previousTime = timeSeconds;
        return;
      }
      if (timeSeconds < LIGHTNING_RELEASE) {
        updateGathering(timeSeconds);
      } else {
        if (!released) captureRelease();
        context.actor.updateWorldMatrix(true, false);
        root.matrix.copy(context.actor.matrixWorld).invert().multiply(castWorld);
        root.matrixWorldNeedsUpdate = true;
        updateReleased(timeSeconds);
      }
      previousTime = timeSeconds;
      root.updateWorldMatrix(true, true);
    },
    dispose() {
      light.dispose();
      disposeTree(root);
    },
  };
}
