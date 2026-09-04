// Loader for the authored, animated glTF (.glb) models — the low-poly deer and
// sailboat. Models are preloaded once, then cheaply cloned per instance with
// their own AnimationMixer so each animal/boat animates independently.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';

const SOURCES = {
  deer: '/models/low-poly-deer.glb',
  bear: '/models/low-poly-bear.glb',
};

const loader = new GLTFLoader();
const cache = {}; // id -> { scene, animations }

function loadOne(id) {
  return new Promise((resolve) => {
    loader.load(
      SOURCES[id],
      (gltf) => { cache[id] = { scene: gltf.scene, animations: gltf.animations || [] }; resolve(cache[id]); },
      undefined,
      (err) => { console.warn('GLB load failed:', id, err); resolve(null); },
    );
  });
}

let _preload = null;
// kick off (or reuse) loading of every authored model — safe to call repeatedly
export function preloadModels() {
  if (!_preload) _preload = Promise.all(Object.keys(SOURCES).map(loadOne));
  return _preload;
}

export function glbReady(id) { return !!cache[id]; }

// a fresh animated instance: { group, mixer, actions } — or null if not loaded.
// callers drive `mixer.update(dt)` each frame and play `actions[clipName]`.
export function buildGLB(id) {
  const entry = cache[id];
  if (!entry) return null;
  const group = skeletonClone(entry.scene);
  const mixer = new THREE.AnimationMixer(group);
  const actions = {};
  for (const clip of entry.animations) actions[clip.name] = mixer.clipAction(clip);
  return { group, mixer, actions };
}
