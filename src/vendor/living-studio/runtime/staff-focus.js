import * as THREE from 'three';

const focusMeshes = {
  staff: 'Cradle seated staff crystal',
  bone_staff: 'Bone staff skull forehead gemstone',
};
const anchors = new WeakMap();

/** Read the center of the actual inset stone, with transforms kept live. */
export function staffFocusWorld(item, out) {
  const name = focusMeshes[item?.userData.itemId];
  if (!name || !item.visible) return null;
  const mesh = item.getObjectByName(name);
  if (!mesh?.isMesh || !mesh.visible || mesh.userData.materialRole !== 'gem') return null;
  const positions = mesh.geometry.getAttribute('position');
  let anchor = anchors.get(item);
  if (!anchor || anchor.mesh !== mesh || anchor.positions !== positions || anchor.version !== positions.version) {
    mesh.geometry.computeBoundingBox();
    anchor = {mesh, positions, version: positions.version, center: mesh.geometry.boundingBox.getCenter(new THREE.Vector3())};
    anchors.set(item, anchor);
  }
  return mesh.localToWorld(out.copy(anchor.center));
}
