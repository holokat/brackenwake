import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {assetWork} from './work_queue.js';
import {compileRoomPrograms} from './room_gpu_warmup.js';
import {createAssetCache} from './asset_cache.js';

export function disposeGltf(asset) {
  const geometries = new Set(), materials = new Set(), textures = new Set(), images = new Set();
  asset.scene.traverse(o => {
    if (o.geometry) geometries.add(o.geometry);
    for (const m of [].concat(o.material || [])) {
      materials.add(m);
      for (const value of Object.values(m)) if (value?.isTexture) {textures.add(value); if (value.image?.close) images.add(value.image);}
    }
  });
  for (const resource of [...geometries, ...materials, ...textures]) resource.dispose();
  for (const image of images) image.close();
}
export function gltfBytes(asset) {
  const buffers = new Set(), textures = new Set(); let bytes = 0;
  asset.scene.traverse(o => {
    const g = o.geometry;
    if (g) for (const a of [g.index, ...Object.values(g.attributes)]) {
      const array = a?.array || a?.data?.array;
      if (array && !buffers.has(array.buffer)) {buffers.add(array.buffer); bytes += array.buffer.byteLength;}
    }
    for (const m of [].concat(o.material || [])) for (const t of Object.values(m)) if (t?.isTexture && !textures.has(t)) {
      textures.add(t); bytes += (t.image?.width || 0) * (t.image?.height || 0) * 4 * 4 / 3;
    }
  });
  return bytes;
}
export function canPrefetch() {
  const connection = globalThis.navigator?.connection;
  return globalThis.document?.visibilityState !== 'hidden' && !connection?.saveData && !/^(slow-)?2g$/.test(connection?.effectiveType || '');
}
const loader = new GLTFLoader();
export const gltfAssets = createAssetCache({work: assetWork, allowPrefetch: canPrefetch,
  async fetchBytes(url, signal, priority) {
    const response = await fetch(loader.manager.resolveURL(url), {signal, priority: priority > 1 ? 'high' : 'low'});
    if (!response.ok) throw Error(`Asset ${response.status}: ${url}`);
    return response.arrayBuffer();
  },
  decode: (bytes, url) => loader.parseAsync(bytes, url.slice(0, url.lastIndexOf('/') + 1)),
  dispose: disposeGltf, sizeOf: gltfBytes,
});

/** Prepare a static room a few meshes at a time before revealing it. Templates stay immutable. */
export async function prepareRoom(asset, configure, {signal, sc, priority = 2, work = assetWork, configureMesh, lights} = {}) {
  const materials = new Map(), root = asset.scene.clone(false), stack = [{source: asset.scene, target: root}];
  const owned = [];
  const dispose = () => {root.removeFromParent(); for (const m of owned) m.dispose();};
  try {
    while (stack.length) {
      if (signal?.aborted) {dispose(); return null;}
      await work.run(() => {
        let count = 0;
        while (stack.length && count++ < 8) {
          const {source, target} = stack.pop();
          if (target.isMesh) {
            target.castShadow = true; target.receiveShadow = true; configureMesh?.(target);
            const instanceMaterial = m => {
              if (!materials.has(m)) {const clone = m.clone(); materials.set(m, clone); owned.push(clone); configure?.(clone, target);}
              return materials.get(m);
            };
            target.material = Array.isArray(source.material) ? source.material.map(instanceMaterial) : instanceMaterial(source.material);
          }
          for (const child of source.children) {const copy = child.clone(false); target.add(copy); stack.push({source: child, target: copy});}
        }
      }, {signal, priority});
    }
    if (signal?.aborted) {dispose(); return null;}
    const textures = new Set();
    for (const m of owned) for (const value of Object.values(m)) if (value?.isTexture) textures.add(value);
    if (sc?.renderer) {
      for (const texture of textures) await work.run(() => sc.renderer.initTexture(texture), {signal, priority});
      if (!signal?.aborted) await compileRoomPrograms(root, sc, {lights, work, signal});
    }
    if (signal?.aborted) {dispose(); return null;}
    return {group: root, materials: owned, dispose};
  } catch (error) {dispose(); throw error;}
}
