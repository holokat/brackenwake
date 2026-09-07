import * as THREE from 'three';
import { bodyFor, metresOf } from './thumbs.js';
import { buildStudioNpc } from '../studio/npcs.js';
import { loadProp, hasProp, FOOTPRINT, SINK, footAt } from '../../world/plan_models.js';

const supportsScale = tab => ['structures', 'trees', 'rocks'].includes(tab);

/** One selected body. Motion changes its transform, never rebuilds its geometry. */
export function createPlacementPreview(tab, id, options = {}) {
  const group = new THREE.Group(); group.name = `placement-preview:${id}`;
  let body = null, materials = new Map(), disposed = false;
  const result = { group, w: 1, d: 1, h: 1, words: id, ready: null, set, dispose };
  const ring = new THREE.Mesh(new THREE.RingGeometry(.94, 1, 48), new THREE.MeshBasicMaterial({ color: 0xe5c674, transparent: true, opacity: .65, depthWrite: false, side: THREE.DoubleSide }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = .08; ring.raycast = () => {};
  group.add(ring);

  function releaseBody() {
    if (!body) return;
    body.group.traverse(o => { if (o.isMesh && o.userData.previewOriginal) { o.material = o.userData.previewOriginal; delete o.userData.previewOriginal; } });
    for (const material of materials.values()) material.dispose();
    materials.clear(); group.remove(body.group); body.dispose(); body = null;
  }
  function tint() {
    if (disposed || !body) return;
    body.group.traverse(o => {
      if (!o.isMesh || o.userData.previewOriginal) return;
      o.castShadow = false; o.receiveShadow = false; o.raycast = () => {};
      o.userData.previewOriginal = o.material;
      const clone = m => {
        if (!materials.has(m)) {
          const n = m.clone(); n.transparent = true; n.opacity = Math.min(m.opacity, .78); n.depthWrite = false;
          if (n.emissive) { n.emissive.setHex(0x8b6c25); n.emissiveIntensity = .12; }
          materials.set(m, n);
        }
        return materials.get(m);
      };
      o.material = Array.isArray(o.material) ? o.material.map(clone) : clone(o.material);
    });
    const size = metresOf(body.group);
    if (size) {
      result.w = size.w; result.d = size.d; result.h = size.h;
      ring.scale.set(Math.max(.4, size.w * .55), Math.max(.4, size.d * .55), 1);
      result.words = `${id}, ${size.w.toFixed(1)} × ${size.d.toFixed(1)} × ${size.h.toFixed(1)} m${body.source === 'stand-in' ? ', stand-in' : ''}`;
    }
  }
  function build() {
    releaseBody();
    if (tab === 'people') {
      const npc = buildStudioNpc({ role: id, name: options.name || id });
      body = { group: npc.group, source: 'studio', ready: npc.ready, dispose: () => npc.dispose() };
    } else body = bodyFor({ tab, id });
    if (!body) return;
    if (supportsScale(tab)) body.group.scale.multiplyScalar(options.scale ?? 1);
    group.add(body.group); tint();
    return body.ready;
  }
  function set(x, z, yaw, heightAt) {
    const y = heightAt(x, z);
    let floor = y;
    if (tab === 'structures') {
      const f = FOOTPRINT[id], k = options.scale ?? 1;
      floor = footAt(heightAt, x, z, f[0] * k, f[1] * k, yaw) - Math.min(SINK, f[2] * k * .05);
    } else if (tab === 'trees') floor -= .05;
    else if (tab === 'rocks') floor -= SINK * .5;
    group.position.set(x, floor, z); group.rotation.y = ['monsters', 'creatures', 'markers'].includes(tab) ? 0 : yaw;
    ring.position.y = y - floor + .08;
  }
  function dispose() {
    if (disposed) return; disposed = true; releaseBody(); ring.geometry.dispose(); ring.material.dispose(); group.clear();
  }
  group.userData.disposePreview = dispose;
  const pending = build();
  result.ready = (async () => {
    if (pending) { await pending; tint(); }
    if (tab === 'structures' && !hasProp(id)) {
      const loaded = await loadProp(id).catch(() => false);
      if (loaded && !disposed) { await build(); tint(); }
    }
    return result;
  })().catch(() => result);
  return result;
}
