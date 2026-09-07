import { pointOf, SCALE_MIN, SCALE_MAX } from './space_doc.js';

export function transformCapabilities(list) {
  return { move: true, rotate: ['pieces', 'runs', 'areas', 'trees', 'rocks', 'people'].includes(list), scale: ['pieces', 'runs', 'areas', 'trees', 'rocks'].includes(list) };
}

/** A complete gesture becomes a single document patch, including point-based runs/areas. */
export function transformPatch(list, entry, next = {}) {
  const at = pointOf(list, entry);
  if (!at) return null;
  const round = n => Math.round(n * 100) / 100;
  const x = Number.isFinite(next.x) ? next.x : at.x, z = Number.isFinite(next.z) ? next.z : at.z;
  const cap = transformCapabilities(list), oldScale = entry.scale ?? 1;
  const scale = cap.scale && Number.isFinite(next.scale) ? Math.max(SCALE_MIN, Math.min(SCALE_MAX, next.scale)) : oldScale;
  const yaw = cap.rotate && Number.isFinite(next.yaw) ? ((next.yaw % 360) + 360) % 360 : entry.yaw || 0;
  const angle = (yaw - (entry.yaw || 0)) * Math.PI / 180, ratio = scale / oldScale;
  const transform = (px, pz) => {
    const dx = (px - at.x) * ratio, dz = (pz - at.z) * ratio;
    return { x: round(x + dx * Math.cos(angle) + dz * Math.sin(angle)), z: round(z + dz * Math.cos(angle) - dx * Math.sin(angle)) };
  };
  const patch = {};
  if (list === 'runs') { patch.from = transform(entry.from.x, entry.from.z); patch.to = transform(entry.to.x, entry.to.z); if (scale !== oldScale) patch.scale = round(scale); }
  else if (list === 'areas') { patch.points = entry.points.map(([px, pz]) => { const p = transform(px, pz); return [p.x, p.z]; }); if (entry.w && ratio !== 1) patch.w = round(entry.w * ratio); }
  else {
    patch.x = round(x); patch.z = round(z);
    if (cap.rotate && (yaw !== (entry.yaw || 0) || 'yaw' in entry)) patch.yaw = round(yaw);
    if (cap.scale && (scale !== oldScale || 'scale' in entry)) patch.scale = round(scale);
  }
  // An attached mill wheel follows its mill. Explicitly dragging it detaches it.
  if (entry.on && (x !== at.x || z !== at.z || yaw !== (entry.yaw || 0))) patch.on = null;
  return patch;
}
