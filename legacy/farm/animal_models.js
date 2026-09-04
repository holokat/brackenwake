// Authored low-poly farm-animal models (static glTF, no baked clips). Each model
// is a kit of NAMED part-nodes (…-head, …-neck, …-tail, …-leg-front-left, …),
// so we prep one prototype per species — auto-scaled, grounded, and turned to
// face +x — then cheaply clone it per animal and drive a PROCEDURAL walk cycle
// (hip-pivoted leg swing + head/tail motion) from updateAnimal(). That replaces
// the old primitive critters that slid around with frozen legs.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';

const SRC = {
  bunny: '/models/low-poly-bunny.glb',
  chicken: '/models/low-poly-chicken.glb',
  duck: '/models/low-poly-duck.glb',
  cat: '/models/low-poly-cat.glb',
  dog: '/models/low-poly-dog.glb',
  rooster: '/models/low-poly-rooster.glb',
  sheep: '/models/low-poly-sheep.glb',
  goat: '/models/low-poly-goat.glb',
  pig: '/models/low-poly-pig.glb',
  cow: '/models/low-poly-cow.glb',
  horse: '/models/low-poly-horse.glb',
};

// target overall height (feet → crown, world units), tuned to the old sizing so
// pens, fences and camera framing stay consistent
const TARGET_H = {
  bunny: 0.72, chicken: 0.85, duck: 0.82, cat: 0.7, dog: 1.0, rooster: 1.05,
  sheep: 1.1, goat: 1.2, pig: 0.95, cow: 2.1, horse: 2.6,
};

// quadruped diagonal gait phases (FL+RR together, FR+RL opposite); bipeds alternate
const LEG_PHASES = {
  quad: [
    ['-leg-front-left', 0], ['-leg-front-right', Math.PI],
    ['-leg-rear-left', Math.PI], ['-leg-rear-right', 0],
  ],
  biped: [['-leg-left', 0], ['-leg-right', Math.PI]],
};
const BIPEDS = { chicken: 1, rooster: 1, duck: 1 };

const loader = new GLTFLoader();
const protos = {}; // type -> { proto: Group(prototype), forwardYaw }

function firstByName(root, name) { return root.getObjectByName(name) || null; }

// prepare a reusable prototype: face +x, scale to target height, feet on y=0
function prepare(type, scene) {
  const inner = scene;
  inner.updateMatrixWorld(true);

  // --- detect facing from head vs body centre, then yaw the model to face +x ---
  const head = firstByName(inner, `${type}-head`);
  const bb0 = new THREE.Box3().setFromObject(inner);
  const c0 = bb0.getCenter(new THREE.Vector3());
  let fwdYaw = 0;
  if (head) {
    const hp = head.getWorldPosition(new THREE.Vector3());
    const fx = hp.x - c0.x, fz = hp.z - c0.z;
    if (Math.hypot(fx, fz) > 1e-3) fwdYaw = Math.atan2(-fz, fx); // rotate this away → +x
  }
  const proto = new THREE.Group();
  proto.add(inner);
  inner.rotation.y -= fwdYaw; // face +x
  proto.updateMatrixWorld(true);

  // --- scale to target height ---
  const bb1 = new THREE.Box3().setFromObject(proto);
  const size = bb1.getSize(new THREE.Vector3());
  const s = (TARGET_H[type] || 1) / (size.y || 1);
  proto.scale.setScalar(s);
  proto.updateMatrixWorld(true);

  // --- centre X/Z on the origin and drop feet to y=0 ---
  const bb2 = new THREE.Box3().setFromObject(proto);
  const c2 = bb2.getCenter(new THREE.Vector3());
  inner.position.x -= c2.x / s;
  inner.position.z -= c2.z / s;
  inner.position.y -= bb2.min.y / s;
  proto.updateMatrixWorld(true);

  return { proto };
}

const _preload = {};
export function preloadAnimalModels() {
  return Promise.all(Object.entries(SRC).map(([type, url]) => new Promise((res) => {
    if (protos[type]) return res();
    loader.load(url, (gltf) => { try { protos[type] = prepare(type, gltf.scene); } catch (e) { console.warn('animal prep failed', type, e); } res(); },
      undefined, (e) => { console.warn('animal load failed', type, e); res(); });
  })));
}
// kick off immediately on import
preloadAnimalModels();

export function animalModelReady(type) { return !!protos[type]; }

// A fresh animated instance shaped like the procedural builders:
//   group.userData.body  — inner group (bobbed while walking)
//   group.userData.parts — { head, neck, tail, legs:[{node,rest,phase}], swingAxis }
//   group.userData.glb   — true (so updateAnimal drives the leg walk cycle)
export function buildAnimalModel(type) {
  const entry = protos[type];
  if (!entry) return null;
  const body = skeletonClone(entry.proto);
  const group = new THREE.Group();
  const bob = new THREE.Group();
  bob.add(body);
  group.add(bob);

  const parts = { legs: [] };
  parts.head = firstByName(body, `${type}-head`);
  parts.neck = firstByName(body, `${type}-neck`);
  parts.tail = firstByName(body, `${type}-tail`);
  const phases = BIPEDS[type] ? LEG_PHASES.biped : LEG_PHASES.quad;
  for (const [suffix, phase] of phases) {
    const node = firstByName(body, `${type}${suffix}`);
    if (node) parts.legs.push({ node, rest: node.quaternion.clone(), phase });
  }

  group.userData.body = bob;
  group.userData.parts = parts;
  group.userData.glb = true;
  return group;
}
