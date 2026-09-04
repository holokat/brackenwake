// The camera: a follow orbit for play, a free fly for the dev view.
//
// Angle convention, shared with player.js:
//   yaw 0 looks along +z. The horizontal direction the camera is looking is
//   (sin yaw, cos yaw), so forwardYaw is simply yaw, and the player's move
//   stick is rotated by it. pitch is the camera's elevation above the target,
//   0.15 rad just off the horizon, 1.35 rad nearly overhead.
//
// Drag: yaw += dx * 0.005 and pitch += dy * 0.005, any button, exactly as the
// input module hands it over. Wheel: distance *= 1.1 ^ (wheel / 100) in
// follow, fly speed by the same law in fly.

import * as THREE from 'three';

export const DRAG_RAD = 0.005;      // radians per pixel of drag
export const PITCH_MIN = 0.15, PITCH_MAX = 1.35;
export const DIST_MIN = 3, DIST_MAX = 32;
export const FLY_MIN_SPEED = 20, FLY_MAX_SPEED = 400;
export const ZOOM_BASE = 1.1, ZOOM_UNIT = 100;
export const SMOOTH_TAU = 0.08;     // seconds, the exponential lerp constant
export const EYE_HEIGHT = 1.5;      // the orbit target rides this far above the feet
export const MIN_ABOVE = 1.2;       // the follow camera never gets closer than this to the ground
export const FLY_MIN_ABOVE = 0.6;   // nor does the fly camera, so it cannot be lost inside a hill

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// Where a camera sits on the orbit sphere. Plain objects in, plain object out,
// so this is testable without a renderer.
export function orbitPosition(target, yaw, pitch, dist) {
  const h = Math.cos(pitch) * dist;
  return {
    x: target.x - Math.sin(yaw) * h,
    y: target.y + Math.sin(pitch) * dist,
    z: target.z - Math.cos(yaw) * h,
  };
}

// Raise a camera that has sunk into the ground. It rises, it never tilts.
export function clampAboveGround(pos, groundY, minAbove) {
  const floor = groundY + minAbove;
  return pos.y < floor ? { x: pos.x, y: floor, z: pos.z } : { x: pos.x, y: pos.y, z: pos.z };
}

export function createFollowCamera(camera, input) {
  const target = new THREE.Vector3();
  const lookTmp = new THREE.Vector3();

  const api = {
    mode: 'follow',
    yaw: 0,
    pitch: 0.55,
    distance: 9,
    flySpeed: 60,
    get forwardYaw() { return api.yaw; },
    setMode(m) {
      if (m !== 'follow' && m !== 'fly') return api.mode;
      api.mode = m;                      // the camera keeps the spot it is in
      return api.mode;
    },
    // both modes turn the same way
    applyLook() {
      const d = (input && input.drag) || null;
      if (d && (d.dx || d.dy)) {
        api.yaw += d.dx * DRAG_RAD;
        api.pitch = clamp(api.pitch + d.dy * DRAG_RAD, PITCH_MIN, PITCH_MAX);
        api.yaw = Math.atan2(Math.sin(api.yaw), Math.cos(api.yaw));
      }
    },
    update(dt, playerPos, heightAt) {
      dt = clamp(Number.isFinite(dt) ? dt : 0, 0, 0.1);
      api.applyLook();
      const w = (input && input.wheel) || 0;
      if (w) api.distance = clamp(api.distance * Math.pow(ZOOM_BASE, w / ZOOM_UNIT), DIST_MIN, DIST_MAX);

      target.set(playerPos.x, playerPos.y + EYE_HEIGHT, playerPos.z);
      const ground = (x, z) => (typeof heightAt === 'function' ? heightAt(x, z) : -Infinity);
      let want = orbitPosition(target, api.yaw, api.pitch, api.distance);
      want = clampAboveGround(want, ground(want.x, want.z), MIN_ABOVE);

      const a = 1 - Math.exp(-dt / SMOOTH_TAU);
      const p = camera.position;
      p.x += (want.x - p.x) * a;
      p.y += (want.y - p.y) * a;
      p.z += (want.z - p.z) * a;

      // the smoothed spot is checked too: lagging behind is no excuse for
      // being underground for a frame
      const floor = ground(p.x, p.z) + MIN_ABOVE;
      if (p.y < floor) p.y = floor;

      camera.lookAt(target);
      return api;
    },
    flyUpdate(dt, heightAt) {
      dt = clamp(Number.isFinite(dt) ? dt : 0, 0, 0.1);
      api.applyLook();
      const w = (input && input.wheel) || 0;
      if (w) api.flySpeed = clamp(api.flySpeed * Math.pow(ZOOM_BASE, -w / ZOOM_UNIT), FLY_MIN_SPEED, FLY_MAX_SPEED);

      const cp = Math.cos(api.pitch), sp = Math.sin(api.pitch);
      const fx = Math.sin(api.yaw) * cp, fy = -sp, fz = Math.cos(api.yaw) * cp;
      const rx = Math.cos(api.yaw), rz = -Math.sin(api.yaw);
      const down = (k) => !!(input && input.down && input.down(k));
      const f = (down('w') ? 1 : 0) - (down('s') ? 1 : 0);
      const r = (down('d') ? 1 : 0) - (down('a') ? 1 : 0);
      const u = (down('e') ? 1 : 0) - (down('q') ? 1 : 0);

      let vx = fx * f + rx * r, vy = fy * f + u, vz = fz * f + rz * r;
      const len = Math.hypot(vx, vy, vz);
      const p = camera.position;
      if (len > 1e-6) {
        const k = (api.flySpeed * (down('shift') ? 4 : 1) * dt) / len;
        p.x += vx * k; p.y += vy * k; p.z += vz * k;
      }
      if (typeof heightAt === 'function') {
        const floor = heightAt(p.x, p.z) + FLY_MIN_ABOVE;
        if (p.y < floor) p.y = floor;
      }
      lookTmp.set(p.x + fx, p.y + fy, p.z + fz);
      camera.lookAt(lookTmp);
      return api;
    },
    // put the camera on its orbit at once, no smoothing (a boot, or a warp)
    snap(playerPos) {
      target.set(playerPos.x, playerPos.y + EYE_HEIGHT, playerPos.z);
      const w = orbitPosition(target, api.yaw, api.pitch, api.distance);
      camera.position.set(w.x, w.y, w.z);
      camera.lookAt(target);
      return api;
    },
  };
  return api;
}
