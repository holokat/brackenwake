import * as THREE from 'three';
import { FOOTPRINT, ROCK_KINDS, footAt, SINK } from '../../world/plan_models.js';
import { SPECIES } from '../../world/arbor.js';
import { attachmentFor } from '../../mmo/plans/attachments.js';

const inverse = new THREE.Matrix4(), transform = new THREE.Matrix4(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3(1, 1, 1), center = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), ray = new THREE.Ray(), box = new THREE.Box3(), hit = new THREE.Vector3();

/** Click-time bounds picking reaches existing authored objects before a space is opened. */
export function pickEditorObject(worldRay, spaces, heightAt, maxDistance = 900) {
  let best = null, distance = maxDistance;
  for (const space of spaces) for (const list of ['pieces', 'trees', 'rocks', 'people', 'spawns', 'markers']) {
    (space[list] || []).forEach((entry, index) => {
      const attached = list === 'pieces' && attachmentFor(entry, space);
      const x = space.at.x + (attached?.x ?? entry.x), z = space.at.z + (attached?.z ?? entry.z);
      const k = entry.scale ?? 1, yaw = (attached?.yaw ?? entry.yaw ?? 0) * Math.PI / 180;
      let w = 1, d = 1, h = 1.8;
      if (list === 'pieces') [w, d, h] = (FOOTPRINT[entry.model] || [1, 1, 1]).map(v => v * k);
      else if (list === 'trees') { const sp = SPECIES[entry.species]; h = (sp ? (sp.h[0] + sp.h[1]) / 2 : 8) * k; w = d = Math.max(.6, h * (sp?.trunk || .05) * 2.5); }
      else if (list === 'rocks') w = d = h = (ROCK_KINDS[entry.kind]?.size || 1) * k;
      const dx = x - worldRay.origin.x, dz = z - worldRay.origin.z;
      const denom = worldRay.direction.x ** 2 + worldRay.direction.z ** 2;
      const along = denom > 1e-8 ? Math.max(0, Math.min(maxDistance, (dx * worldRay.direction.x + dz * worldRay.direction.z) / denom)) : 0;
      if (Math.hypot(dx - worldRay.direction.x * along, dz - worldRay.direction.z * along) > Math.hypot(w, d) / 2) return;
      let y = heightAt(x, z);
      if (list === 'pieces') y = footAt(heightAt, x, z, w, d, yaw) - Math.min(SINK, h * .05);
      if (attached) y += attached.y;
      center.set(x, y, z); rotation.setFromAxisAngle(up, yaw); transform.compose(center, rotation, scale); inverse.copy(transform).invert();
      ray.copy(worldRay).applyMatrix4(inverse); box.min.set(-w / 2, 0, -d / 2); box.max.set(w / 2, h, d / 2);
      if (!ray.intersectBox(box, hit)) return;
      hit.applyMatrix4(transform); const length = worldRay.origin.distanceTo(hit);
      if (length < distance) { distance = length; best = { space, list, index, entry, distance }; }
    });
  }
  return best;
}
