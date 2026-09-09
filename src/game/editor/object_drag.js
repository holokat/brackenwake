import * as THREE from 'three';
import { groundUnder } from './surface.js';

export const OBJECT_DRAG_SLOP = 5;
export const TURN_SNAP = 15;
export const TURN_PER_PIXEL = .5;

/** A body grab keeps its offset, follows the terrain and never writes a document. */
export function createObjectDrag({ camera, canvas, heightAt, origin, grab, event, rotate = false }) {
  const start = { x: event.clientX, y: event.clientY };
  const offset = { x: origin.x - grab.x, z: origin.z - grab.z };
  // Raycast the surface at the grabbed part's height, so grabbing a roof does
  // not snap the building's base to the mouse or send it behind the building.
  const lift = grab.y - heightAt(grab.x, grab.z);
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const surface = (x, z) => heightAt(x, z) + lift;
  let active = false;
  return {
    update(next) {
      const dx = next.clientX - start.x, dy = next.clientY - start.y;
      if (!active && Math.hypot(dx, dy) <= OBJECT_DRAG_SLOP) return null;
      active = true;
      if (rotate) {
        let yaw = origin.yaw + dx * TURN_PER_PIXEL;
        if (next.shiftKey) yaw = origin.yaw + Math.round(dx * TURN_PER_PIXEL / TURN_SNAP) * TURN_SNAP;
        return { ...origin, yaw };
      }
      const rect = canvas.getBoundingClientRect();
      ndc.set((next.clientX - rect.left) / rect.width * 2 - 1, -(next.clientY - rect.top) / rect.height * 2 + 1);
      camera.updateMatrixWorld();
      const p = groundUnder(camera, ndc, surface, ray);
      // The sky has no placement. Keep the last valid preview until the
      // pointer reaches terrain again, or Escape cancels the whole gesture.
      return p ? { ...origin, x: p.x + offset.x, z: p.z + offset.z } : null;
    },
  };
}
