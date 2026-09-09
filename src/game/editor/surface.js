import * as THREE from 'three';

export const MARCH_MAX = 900;
export const MARCH_FINE = 0.05;

/**
 * Where the pointer's ray meets the ground.
 *
 * A march, not a plane: the ray is walked outward in steps that grow with
 * distance until the sample is below the height field, then bisected.
 * `heightAt` is the runtime's, so ground the terrain half has just raised is
 * the ground this lands on.
 */
export function groundUnder(camera, ndc, heightAt, raycaster = new THREE.Raycaster()) {
  raycaster.setFromCamera(ndc, camera);
  const o = raycaster.ray.origin, d = raycaster.ray.direction;
  const at = (t) => ({ x: o.x + d.x * t, y: o.y + d.y * t, z: o.z + d.z * t });
  let prev = 0;
  let above = at(0).y - heightAt(o.x, o.z) > 0;
  for (let t = 0.5; t <= MARCH_MAX; t += Math.max(0.5, t * 0.035)) {
    const p = at(t);
    const under = p.y - heightAt(p.x, p.z) <= 0;
    if (under && above) {
      let lo = prev, hi = t;
      while (hi - lo > MARCH_FINE) {
        const mid = (lo + hi) / 2;
        const q = at(mid);
        if (q.y - heightAt(q.x, q.z) <= 0) hi = mid; else lo = mid;
      }
      const q = at(hi);
      return { x: q.x, y: heightAt(q.x, q.z), z: q.z, dist: hi };
    }
    above = !under;
    prev = t;
  }
  return null;
}
