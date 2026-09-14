// Blood is a small, bounded combat effect.  It deliberately owns neither an
// actor nor a combat rule: combat hands it only damage that really resolved,
// and this module turns that into a brief spray and a ground stain.

import * as THREE from 'three';

export const BLOOD_PARTICLE_CAP = 96;
export const BLOOD_SPLAT_CAP = 48;
export const BLOOD_PARTICLE_LIFE = 0.62;
export const BLOOD_SPLAT_LIFE = 10;
export const BLOOD_GRAVITY = 14;

export const BLOOD_PROFILES = {
  human: { colour: 0x7b241c, height: 0.95 },
  beast: { colour: 0x6c241d, height: 0.64 },
  vermin: { colour: 0x542c25, height: 0.42 },
  ichor: { colour: 0x58793c, height: 0.42 },
};

const BLOODLESS_FAMILIES = new Set(['undead', 'construct', 'elemental']);
const ARTHROPOD = /(?:spider|grub|crawler|scorpion|beetle|moth)/i;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const finite = (v, fallback = 0) => Number.isFinite(v) ? v : fallback;

/** The actor data owns the identity. Unknown biological actors use warm blood. */
export function bloodProfile(actor) {
  if (!actor) return null;
  const family = actor.family || actor.creatureFamily || '';
  const notes = Array.isArray(actor.notes) ? actor.notes : [];
  if (BLOODLESS_FAMILIES.has(family) || notes.includes('undead') || notes.includes('incorporeal50')) return null;
  if (actor.kind === 'player' || family === 'humanoid') return BLOOD_PROFILES.human;
  if (ARTHROPOD.test(actor.monsterId || '')) return BLOOD_PROFILES.ichor;
  if (family === 'vermin') return BLOOD_PROFILES.vermin;
  return BLOOD_PROFILES.beast;
}

/** A successful resolver result is the only input that can paint blood. */
export function isBloodImpact(info) {
  return !!(info && (info.kind === 'melee' || info.kind === 'spell')
    && Number.isFinite(info.damage) && info.damage > 0 && info.defender?.pos && bloodProfile(info.defender));
}

function nextRandom(seed) {
  let state = (seed >>> 0) || 0x6d2b79f5;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let n = state;
    n = Math.imul(n ^ (n >>> 15), n | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable, cheap seed from the combat event. It avoids a second random stream. */
export function bloodSeed(info) {
  let seed = Math.round(finite(info?.now) * 17) ^ Math.round(finite(info?.damage) * 997);
  for (const value of [info?.defender?.id, info?.attacker?.id]) {
    for (const char of String(value || '')) seed = Math.imul(seed ^ char.charCodeAt(0), 0x45d9f3b);
  }
  return seed >>> 0;
}

/**
 * The render-independent burst. Tests drive this exact geometry plan and the
 * renderer only writes it into fixed slots, so visual density cannot drift from
 * the measured cap.
 */
export function bloodBurstPlan({ damage = 0, seed = 1 } = {}) {
  const amount = Math.max(0, finite(damage));
  if (amount <= 0) return { particles: [], splats: [] };
  const random = nextRandom(seed);
  const particleCount = clamp(4 + Math.round(Math.sqrt(amount) * 1.7), 4, 12);
  const splatCount = amount >= 9 ? 2 : 1;
  const particles = [];
  for (let i = 0; i < particleCount; i++) {
    const angle = random() * Math.PI * 2;
    const speed = 1.4 + random() * 2.5 + Math.min(1.2, amount * 0.025);
    particles.push({
      x: (random() - 0.5) * 0.18,
      y: (random() - 0.2) * 0.16,
      z: (random() - 0.5) * 0.18,
      vx: Math.cos(angle) * speed,
      vy: 1.2 + random() * 2.1,
      vz: Math.sin(angle) * speed,
      // A droplet has to read through the gameplay camera's distance and
      // bright meadow ground. The pool is still fixed; this only scales the
      // compact icosahedra it already owns.
      size: 0.065 + random() * 0.075,
      life: BLOOD_PARTICLE_LIFE * (0.65 + random() * 0.45),
    });
  }
  const splats = [];
  for (let i = 0; i < splatCount; i++) {
    const angle = random() * Math.PI * 2;
    const distance = i === 0 ? random() * 0.22 : 0.25 + random() * 0.46;
    splats.push({
      x: Math.cos(angle) * distance,
      z: Math.sin(angle) * distance,
      rotation: random() * Math.PI * 2,
      scale: (0.30 + random() * 0.22) * (1 + Math.min(0.65, amount / 55)),
      life: BLOOD_SPLAT_LIFE * (0.75 + random() * 0.45),
    });
  }
  return { particles, splats };
}

/** An irregular flat disc reads as a dropped stain instead of a perfect coin. */
export function splatGeometry(points = 13) {
  const count = Math.max(7, Math.floor(points));
  const positions = [0, 0, 0];
  const indices = [];
  for (let i = 0; i < count; i++) {
    const a = i / count * Math.PI * 2;
    const wobble = 0.62 + ((i * 47) % 19) / 38;
    positions.push(Math.cos(a) * wobble, Math.sin(a) * wobble, 0);
  }
  for (let i = 0; i < count; i++) indices.push(0, i + 1, (i + 1) % count + 1);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function fadeMaterial(colour, opacity) {
  const material = new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, vertexColors: false });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = `attribute float aBloodFade; varying float vBloodFade;\n${shader.vertexShader}`
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n      vBloodFade = aBloodFade;');
    shader.fragmentShader = `varying float vBloodFade;\n${shader.fragmentShader}`
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( diffuse, opacity );\n      diffuseColor.a *= vBloodFade;');
  };
  material.customProgramCacheKey = () => 'brackenwake:blood-fade:v1';
  return material;
}

/**
 * A two-mesh effect: compact droplets and flat stains. Both arrays are fixed
 * at construction, and saturated pools replace their oldest slot instead of
 * adding a mesh or retaining an actor after it dies.
 */
export function createBloodEffects(parent, { heightAt = null, particleCap = BLOOD_PARTICLE_CAP, splatCap = BLOOD_SPLAT_CAP } = {}) {
  const particlesCap = Math.max(1, Math.floor(particleCap));
  const stainsCap = Math.max(1, Math.floor(splatCap));
  const root = new THREE.Group();
  root.name = 'bw-blood-effects';
  parent?.add?.(root);

  const dropletGeometry = new THREE.IcosahedronGeometry(1, 0);
  const dropletMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.88, depthWrite: false, vertexColors: false });
  const droplets = new THREE.InstancedMesh(dropletGeometry, dropletMaterial, particlesCap);
  droplets.name = 'blood:droplets'; droplets.frustumCulled = false; droplets.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  droplets.count = 0;
  root.add(droplets);

  const stainGeometry = splatGeometry();
  const stainMaterial = fadeMaterial(0xffffff, 0.76);
  const stains = new THREE.InstancedMesh(stainGeometry, stainMaterial, stainsCap);
  stains.name = 'blood:stains'; stains.frustumCulled = false; stains.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  stains.count = 0;
  const stainFade = new THREE.InstancedBufferAttribute(new Float32Array(stainsCap), 1);
  stainFade.setUsage(THREE.DynamicDrawUsage);
  stainGeometry.setAttribute('aBloodFade', stainFade);
  root.add(stains);

  const p = Array.from({ length: particlesCap }, () => ({ live: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, floor: 0, age: 0, life: 0, size: 0, colour: 0 }));
  const s = Array.from({ length: stainsCap }, () => ({ live: false, x: 0, y: 0, z: 0, rotation: 0, scale: 0, age: 0, life: 0, colour: 0 }));
  let particleCursor = 0, splatCursor = 0;
  const matrix = new THREE.Matrix4(), point = new THREE.Vector3(), scale = new THREE.Vector3(), quaternion = new THREE.Quaternion(), euler = new THREE.Euler(), colour = new THREE.Color();
  const stats = { hits: 0, particles: 0, splats: 0, evictedParticles: 0, evictedSplats: 0 };

  function floorAt(x, z, fallback) {
    const y = typeof heightAt === 'function' ? heightAt(x, z) : fallback;
    return Number.isFinite(y) ? y : fallback;
  }
  function putParticle(value) {
    const slot = particleCursor++ % particlesCap;
    const out = p[slot];
    if (out.live) stats.evictedParticles++;
    Object.assign(out, value, { live: true, age: 0 });
  }
  function putSplat(value) {
    const slot = splatCursor++ % stainsCap;
    const out = s[slot];
    if (out.live) stats.evictedSplats++;
    Object.assign(out, value, { live: true, age: 0 });
  }

  function hit(info) {
    if (!isBloodImpact(info)) return false;
    const profile = bloodProfile(info.defender);
    const pos = info.defender.pos;
    const ground = floorAt(pos.x, pos.z, finite(pos.y));
    const modelHeight = finite(info.defender.model?.height, profile.height * 2);
    const originY = Math.max(ground + 0.14, finite(pos.y) + Math.min(1.4, Math.max(0.35, modelHeight * 0.48)));
    const plan = bloodBurstPlan({ damage: info.damage, seed: bloodSeed(info) });
    for (const drop of plan.particles) putParticle({
      x: pos.x + drop.x, y: originY + drop.y, z: pos.z + drop.z,
      vx: drop.vx, vy: drop.vy, vz: drop.vz, floor: ground, life: drop.life, size: drop.size, colour: profile.colour,
    });
    for (const splat of plan.splats) putSplat({
      x: pos.x + splat.x, y: floorAt(pos.x + splat.x, pos.z + splat.z, ground) + 0.018, z: pos.z + splat.z,
      rotation: splat.rotation, scale: splat.scale, life: splat.life, colour: profile.colour,
    });
    stats.hits++; stats.particles += plan.particles.length; stats.splats += plan.splats.length;
    return true;
  }

  function update(dt) {
    const seconds = clamp(finite(dt), 0, 0.1);
    let pi = 0;
    for (const drop of p) {
      if (!drop.live) continue;
      drop.age += seconds;
      if (drop.age >= drop.life) { drop.live = false; continue; }
      drop.vy -= BLOOD_GRAVITY * seconds;
      drop.vx *= 1 - seconds * 1.8; drop.vz *= 1 - seconds * 1.8;
      drop.x += drop.vx * seconds; drop.y += drop.vy * seconds; drop.z += drop.vz * seconds;
      if (drop.y <= drop.floor + 0.025) { drop.y = drop.floor + 0.025; drop.vy = Math.abs(drop.vy) * 0.18; drop.vx *= 0.56; drop.vz *= 0.56; }
      const fade = 1 - drop.age / drop.life;
      point.set(drop.x, drop.y, drop.z); scale.setScalar(drop.size * (0.35 + fade * 0.9));
      matrix.compose(point, quaternion.identity(), scale);
      droplets.setMatrixAt(pi, matrix); colour.setHex(drop.colour); droplets.setColorAt(pi, colour); pi++;
    }
    droplets.count = pi;
    if (pi) { droplets.instanceMatrix.needsUpdate = true; if (droplets.instanceColor) droplets.instanceColor.needsUpdate = true; }

    let si = 0;
    for (const splat of s) {
      if (!splat.live) continue;
      splat.age += seconds;
      if (splat.age >= splat.life) { splat.live = false; continue; }
      const fade = 1 - splat.age / splat.life;
      point.set(splat.x, splat.y, splat.z); euler.set(-Math.PI / 2, 0, splat.rotation); quaternion.setFromEuler(euler);
      scale.set(splat.scale * (1 + splat.age * 0.025), splat.scale * (1 + splat.age * 0.025), 1);
      matrix.compose(point, quaternion, scale);
      stains.setMatrixAt(si, matrix); colour.setHex(splat.colour); stains.setColorAt(si, colour); stainFade.array[si] = fade * fade; si++;
    }
    stains.count = si;
    if (si) { stains.instanceMatrix.needsUpdate = true; if (stains.instanceColor) stains.instanceColor.needsUpdate = true; stainFade.needsUpdate = true; }
  }

  function clear() {
    for (const drop of p) drop.live = false;
    for (const splat of s) splat.live = false;
    droplets.count = 0; stains.count = 0;
  }

  return {
    root, droplets, stains, stats, hit, update, clear,
    capacity: { particles: particlesCap, splats: stainsCap },
    get particleCount() { return p.reduce((n, drop) => n + Number(drop.live), 0); },
    get splatCount() { return s.reduce((n, splat) => n + Number(splat.live), 0); },
    dispose() {
      clear();
      root.removeFromParent();
      dropletGeometry.dispose(); dropletMaterial.dispose(); stainGeometry.dispose(); stainMaterial.dispose();
    },
  };
}
