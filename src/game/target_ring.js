// The ring under whatever you are looking at. Gold when it is only a target,
// red and breathing when you are attacking it, gone when there is nothing.
// A silent target is indistinguishable from no target, which is what the
// user reported: "impossible to tell if I am attacking anything".

import * as THREE from 'three';

export const TARGET_COLOUR = 0xd9b04a;
export const ATTACK_COLOUR = 0xe0463a;

/** Pure: the ring's scale and opacity for this frame. Exported for the test. */
export function ringState(target, attacking, t) {
  if (!target) return { visible: false };
  const r = (Number.isFinite(target.radius) ? target.radius : 0.45) + 0.25;
  const breath = attacking ? 1 + 0.08 * Math.sin(t * 6) : 1;
  return {
    visible: true,
    scale: r * breath,
    opacity: attacking ? 0.75 + 0.2 * Math.sin(t * 6) : 0.55,
    colour: attacking ? ATTACK_COLOUR : TARGET_COLOUR,
  };
}

export function createTargetRing(sc) {
  const geo = new THREE.RingGeometry(0.86, 1.0, 48);
  const mat = new THREE.MeshBasicMaterial({ color: TARGET_COLOUR, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.visible = false;
  mesh.name = 'target-ring';
  mesh.renderOrder = 5;
  sc.scene.add(mesh);
  let t = 0;
  return {
    mesh,
    update(dt, target, attacking, groundY) {
      t += dt;
      const s = ringState(target, attacking, t);
      mesh.visible = s.visible;
      if (!s.visible) return s;
      const p = target.pos || target;
      mesh.position.set(p.x, (Number.isFinite(groundY) ? groundY : p.y) + 0.05, p.z);
      mesh.scale.setScalar(s.scale);
      mat.opacity = s.opacity;
      mat.color.setHex(s.colour);
      return s;
    },
    dispose() { sc.scene.remove(mesh); geo.dispose(); mat.dispose(); },
  };
}
