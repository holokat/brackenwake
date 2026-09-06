// The small shared pieces every spell effect in this folder uses.
//
// PORTED from the studio's src/vfx/spells/spellVfxUtils.ts. Same names, same
// numbers; `disposeTree` is the one that earns its keep, because every effect
// here builds its geometry and its materials once and has to give all of them
// back or two hundred casts leak two hundred trees.

import * as THREE from 'three';
import { enableSpellBloom } from './bloom.js';

export const additiveMaterial = (color, opacity = 1) => enableSpellBloom(new THREE.MeshBasicMaterial({
  color,
  transparent: true,
  opacity,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  side: THREE.DoubleSide,
}));

/**
 * Dispose every geometry and material under `root`, once each, and unparent it.
 *
 * A Set per kind, because a ribbon and its glow may share a material and three
 * counts a double dispose as a leak of the second one.
 */
export function disposeTree(root) {
  const geometries = new Set();
  const materials = new Set();
  root.traverse((object) => {
    if (!(object.isMesh || object.isLine || object.isPoints)) return;
    if (object.geometry) geometries.add(object.geometry);
    const list = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of list) if (material) materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  if (root.parent) root.parent.remove(root);
}

/** smoothstep, in the argument order the studio wrote it in. */
export function smoothRange(edge0, edge1, value) {
  if (edge0 === edge1) return value >= edge1 ? 1 : 0;
  const t = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function quadraticBezier(target, start, control, end, t) {
  const inverse = 1 - t;
  return target.set(
    inverse * inverse * start.x + 2 * inverse * t * control.x + t * t * end.x,
    inverse * inverse * start.y + 2 * inverse * t * control.y + t * t * end.y,
    inverse * inverse * start.z + 2 * inverse * t * control.z + t * t * end.z,
  );
}

export function setMaterialOpacity(material, opacity) {
  if (material && 'opacity' in material) material.opacity = opacity;
}

/**
 * The context every ported effect is built against.
 *
 * `sockets` is a Map of socket name to Object3D, and `socketPosition` answers
 * in the ACTOR'S LOCAL FRAME, which is the frame every effect's geometry is
 * written in. A socket that is not there falls back to a point in front of the
 * chest rather than to the origin, so a body whose glb has not arrived yet
 * still throws its spell from about where its hands are.
 */
export function createSpellEffectContext(actor, sockets, options = {}) {
  // `textures` is deliberately writable: the atlases arrive after the first
  // frame and the effects are rebuilt against them, so the context they were
  // built from has to be able to say so. See spell_vfx.js's `setTextures`.
  return {
    actor,
    sockets,
    textures: options.textures || null,
    resolveImpact: options.resolveImpact || null,
    socketPosition(name, target) {
      const socket = sockets && sockets.get ? sockets.get(name) : null;
      if (!socket) return target.set(0, 1.25, 0.18);
      actor.updateWorldMatrix(true, false);
      socket.getWorldPosition(target);
      return actor.worldToLocal(target);
    },
  };
}
