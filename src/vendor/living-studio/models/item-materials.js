import {materialPresets, materialById} from '../data/materials.js';
import {applyShieldConstruction} from './items/shield-surfaces.js';
export {materialPresets};

/** Construction roles are independent of an item's equipment slot or its palette. */
export function materialRole(mesh) {
  if (mesh.userData.materialRole) return mesh.userData.materialRole;
  const key = (mesh.userData.materialKey || mesh.material?.name || '').toLowerCase();
  if (/bowstring|cord|string/.test(key)) return 'cord';
  if (/feather|fletch/.test(key)) return 'feather';
  if (/paper|page/.test(key)) return 'paper';
  if (/crystal|gem|orb/.test(key)) return 'gem';
  if (/wood/.test(key)) return 'wood';
  if (/leather/.test(key)) return 'leather';
  if (/steel/.test(key)) return 'metal';
  if (/gold/.test(key)) return 'trim';
  if (/bone|ivory/.test(key)) return 'bone';
  if (/skin/.test(key)) return 'skin';
  return 'cloth';
}

export function compatibleMaterialChannel(preset, channel) {
  return Boolean(preset) && (!channel || ['finish', 'surface', 'all'].includes(channel) || channel === preset.role);
}

/** A wood preset changes wood, including when chosen through the default selector. */
export function applyItemMaterial(root, id, {channel} = {}) {
  const preset = materialById.get(id);
  if (!preset) throw new Error(`Unknown material: ${id}`);
  if (!compatibleMaterialChannel(preset, channel)) throw new Error(`${id} is not a ${channel} material`);
  const uses = new Map();
  root.traverse(mesh => {
    if (!mesh.isMesh) return;
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (!uses.has(material)) uses.set(material, new Set());
      uses.get(material).add(materialRole(mesh));
    }
  });
  const copies = new Map();
  let changed = 0;
  root.traverse(mesh => {
    if (!mesh.isMesh || materialRole(mesh) !== preset.role) return;
    const next = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map(material => {
      let owned = material;
      // A source palette can be reused for a shaft and a feather. Split it before
      // recoloring, even when that palette was already owned by this item.
      if (uses.get(material).size > 1 || (!material.userData.itemOwned && !material.userData.loadoutOwned)) {
        if (!copies.has(material)) {
          const copy = material.clone();
          copy.userData = {...material.userData, itemOwned: true};
          copies.set(material, copy);
        }
        owned = copies.get(material);
      }
      owned.color.set(preset.color);
      owned.roughness = preset.roughness;
      owned.metalness = preset.metalness;
      owned.emissive?.set('#000000');
      owned.emissiveIntensity = 0;
      Object.assign(owned.userData, {
        itemMaterial: id, surfaceRole: preset.role,
        originalColor: owned.color.clone(), originalRoughness: owned.roughness,
        originalMetalness: owned.metalness,
      });
      changed++;
      return owned;
    });
    mesh.material = Array.isArray(mesh.material) ? next : next[0];
  });
  return changed;
}

export function applyMaterialSelection(root, selection = {}) {
  if (root.userData.shieldShape) applyShieldConstruction(root, selection.construction || 'wood');
  if (selection.finish) applyItemMaterial(root, selection.finish);
  for (const channel of ['metal', 'wood', 'leather', 'gem']) {
    if (selection[channel]) applyItemMaterial(root, selection[channel], {channel});
  }
}

export function disposeItem(root) {
  const geometry = new Set(), materials = new Set();
  root.traverse(object => {
    if (object.geometry) geometry.add(object.geometry);
    if (object.material) for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
  });
  geometry.forEach(value => value.dispose());
  materials.forEach(value => value.dispose());
  root.removeFromParent();
}
