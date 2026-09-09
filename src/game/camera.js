// The camera: a follow orbit for play, a free fly for the dev view.
//
// Angle convention, shared with player.js:
//   yaw 0 looks along +z. The horizontal direction the camera is looking is
//   (sin yaw, cos yaw), so forwardYaw is simply yaw, and the player's move
//   stick is rotated by it. pitch is the camera's elevation above the target,
//   0.15 rad just off the horizon, 1.35 rad nearly overhead.
//
// Drag: yaw -= dx * 0.005 and pitch += dy * 0.005, any button, exactly as the
// input module hands it over. Wheel: distance *= 1.1 ^ (wheel / 100) in
// follow, fly speed by the same law in fly.

import * as THREE from 'three';
import {createCameraObstruction,cameraClearance} from './camera_obstruction.js';

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
  const obstruction = createCameraObstruction();
  let lastWorld = null;
  function aim() {
    if(camera.position.distanceToSquared(target)<.01){
      // At a wall there may be less than a near-plane's width behind the
      // player's head. Keep the orbit heading instead of lookAt(eye,eye),
      // which otherwise resets the rotation and flickers between headings.
      const cp=Math.cos(api.pitch);
      lookTmp.set(camera.position.x+Math.sin(api.yaw)*cp,camera.position.y-Math.sin(api.pitch),camera.position.z+Math.cos(api.yaw)*cp);
      camera.lookAt(lookTmp);
    }else camera.lookAt(target);
  }

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
      obstruction.reset();
      return api.mode;
    },
    // both modes turn the same way
    applyLook() {
      const d = (input && input.drag) || null;
      if (d && (d.dx || d.dy)) {
        // dragging right turns the view right. Increasing yaw swings forward
        // toward +x, which is screen LEFT here, so the drag subtracts.
        api.yaw -= d.dx * DRAG_RAD;
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
      lastWorld = heightAt;
      const ground = (x, z) => (typeof heightAt === 'function' ? heightAt(x, z) : -Infinity);
      let want = orbitPosition(target, api.yaw, api.pitch, api.distance);
      want = clampAboveGround(want, ground(want.x, want.z), MIN_ABOVE);
      const query = heightAt?.cameraDistance, radius = cameraClearance(camera);
      if (query) want = obstruction.boom(dt,target,want,query,radius);
      else obstruction.reset();

      const a = 1 - Math.exp(-dt / SMOOTH_TAU);
      const p = camera.position;
      p.x += (want.x - p.x) * a;
      p.y += (want.y - p.y) * a;
      p.z += (want.z - p.z) * a;

      // the smoothed spot is checked too: lagging behind is no excuse for
      // being underground for a frame
      const floor = ground(p.x, p.z) + MIN_ABOVE;
      if (p.y < floor) p.y = floor;
      if (query) {
        const safe=obstruction.finish(target,p,query,radius);
        p.set(safe.x,safe.y,safe.z);
      }

      aim();
      return api;
    },
    flyUpdate(dt, heightAt) {
      dt = clamp(Number.isFinite(dt) ? dt : 0, 0, 0.1);
      api.applyLook();
      const w = (input && input.wheel) || 0;
      if (w) api.flySpeed = clamp(api.flySpeed * Math.pow(ZOOM_BASE, -w / ZOOM_UNIT), FLY_MIN_SPEED, FLY_MAX_SPEED);

      const cp = Math.cos(api.pitch), sp = Math.sin(api.pitch);
      const fx = Math.sin(api.yaw) * cp, fy = -sp, fz = Math.cos(api.yaw) * cp;
      const rx = -Math.cos(api.yaw), rz = Math.sin(api.yaw);   // forward x up
      const down = (k) => !!(input && input.down && input.down(k));
      const f = (down('w') ? 1 : 0) - (down('s') ? 1 : 0);
      const r = (down('d') ? 1 : 0) - (down('a') ? 1 : 0);
      const u = ((down('e') || down(' ')) ? 1 : 0) - (down('q') ? 1 : 0);   // E or Space up, Q down

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
    snap(playerPos, heightAt = lastWorld) {
      obstruction.reset();
      lastWorld = heightAt;
      target.set(playerPos.x, playerPos.y + EYE_HEIGHT, playerPos.z);
      let w = orbitPosition(target, api.yaw, api.pitch, api.distance);
      if (heightAt) w=clampAboveGround(w,heightAt(w.x,w.z),MIN_ABOVE);
      if (heightAt?.cameraDistance) w=obstruction.boom(0,target,w,heightAt.cameraDistance,cameraClearance(camera));
      camera.position.set(w.x, w.y, w.z);
      aim();
      return api;
    },
  };
  return api;
}
