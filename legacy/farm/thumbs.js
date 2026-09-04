// Asset thumbnails — every HUD slot shows a real render of the in-game model,
// photographed once by an offscreen renderer and cached as a data URL.

import * as THREE from 'three';
import { buildCrop, buildTree, buildObject, sunflowerFaceTexture } from './assets.js';
import { ANIMAL_TYPES, buildAnimal } from './animals.js';
import { buildFarmhouse, buildBarn, buildSilo, buildEnclosure } from './buildings.js';
import { buildProcessor, buildMerchantItem } from './processors.js';
import { buildPlaceholder } from './placeholder.js';
import { INFRA_BY_ID } from './infrastructure.js';
import { INFRA_MODELS } from './infra_models.js';
import { buildCamp } from './camp_models.js';
import { buildFishTrap } from './fishtrap_models.js';

const CAMP_IDS = new Set(['campfire', 'tent', 'camp_chair', 'camp_lantern']);

const SIZE = 112;
const cache = new Map();

let ctx = null;

function ensureRenderer() {
  if (ctx) return ctx;
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  renderer.setSize(SIZE, SIZE);
  renderer.setPixelRatio(1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xcfe4ff, 0xa98a63, 1.0));
  const sun = new THREE.DirectionalLight(0xfff2d8, 2.2);
  sun.position.set(4, 7, 5);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 500);
  ctx = { renderer, scene, camera, faceTex: sunflowerFaceTexture() };
  return ctx;
}

const PROC_IDS = ['mill', 'bakery', 'creamery', 'cheese_house', 'preserve_kitchen', 'smokehouse', 'juicery', 'farm_kitchen'];
const MERCH_IDS = ['gnome', 'fountain', 'flamingo', 'topiary', 'gazebo', 'flagpole'];
const CROP_IDS = ['carrot', 'wheat', 'corn', 'tomato', 'pumpkin', 'rice', 'sunflower', 'strawberry', 'grapes', 'watermelon'];
const TREE_IDS = ['apple', 'peach', 'avocado', 'cherry'];

function buildFor(id) {
  const c = ensureRenderer();
  if (INFRA_BY_ID[id]) {
    if (INFRA_MODELS[id]) return INFRA_MODELS[id]();
    return buildPlaceholder(INFRA_BY_ID[id]);
  }
  if (CROP_IDS.includes(id)) return buildCrop(id, 3, 0.5, { faceTex: c.faceTex });
  if (ANIMAL_TYPES.includes(id)) return buildAnimal(id);
  if (TREE_IDS.includes(id)) return buildTree(id);
  if (PROC_IDS.includes(id)) return buildProcessor(id);
  if (MERCH_IDS.includes(id)) return buildMerchantItem(id);
  if (id.startsWith('barn')) return buildBarn(Number(id.slice(4)) || 1);
  if (id === 'silo') return buildSilo();
  if (id === 'enclosure_small') return buildEnclosure('small');
  if (id === 'enclosure_large') return buildEnclosure('large');
  if (id.startsWith('farmhouse')) return buildFarmhouse(Number(id.slice(9)) || 1);
  if (CAMP_IDS.has(id)) return buildCamp(id === 'camp_lantern' ? 'lantern' : id);
  if (id === 'fish_trap') return buildFishTrap();
  return buildObject(id, {});
}

function disposeGroup(group) {
  group.traverse((o) => {
    o.geometry?.dispose?.();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      m.map?.dispose?.();
      m.dispose?.();
    }
  });
}

// returns a data-URL for the asset render, or null if it failed
export function getThumb(id) {
  if (cache.has(id)) return cache.get(id);
  try {
    const c = ensureRenderer();
    const group = buildFor(id);
    c.scene.add(group);
    const bbox = new THREE.Box3().setFromObject(group);
    const center = bbox.getCenter(new THREE.Vector3());
    const sphere = bbox.getBoundingSphere(new THREE.Sphere());
    const r = Math.max(sphere.radius, 0.6);
    const dir = new THREE.Vector3(1, 0.72, 1.35).normalize();
    c.camera.position.copy(center).addScaledVector(dir, r * 2.35);
    c.camera.lookAt(center);
    c.renderer.render(c.scene, c.camera);
    const url = c.renderer.domElement.toDataURL('image/png');
    c.scene.remove(group);
    disposeGroup(group);
    cache.set(id, url);
    return url;
  } catch (err) {
    console.warn('thumb failed for', id, err);
    cache.set(id, null);
    return null;
  }
}
