// The paper doll: the character you are actually playing, drawn into a canvas
// inside the Character tab, wearing exactly what is equipped.
//
// It is the LIVE rig, not a copy. gear_visuals.dressRig hangs the armour and
// the weapons on that rig every time the equipment changes, so the doll shows
// a new helm the same frame the helm goes on, with nothing to keep in step.
//
// How the live rig gets into its own picture:
//
//   The world scene's lights are the sky's. At midnight the doll would be a
//   silhouette, which is useless for looking at gear. So the rig is moved into
//   a small lit scene of its own, rendered, and moved back, all inside one
//   synchronous call. No frame is drawn in between, so the world never sees
//   the character missing. `updateMatrixWorld` runs on both sides of the swap.
//
//   The render goes to a WebGLRenderTarget, is read back with
//   readRenderTargetPixels, and is put into a 2D canvas. WebGL hands back rows
//   bottom up, so the copy walks them in reverse. Reading the framebuffer is a
//   stall, which is why it runs at PAPERDOLL_FPS and not at sixty.
//
// `framing()` is pure and is what paperdoll.test.mjs measures: a taller
// character stands further back, and a narrow frame backs the camera off
// further still rather than cropping the shoulders.

import * as THREE from 'three';
import { BODY } from './player.js';

/** How often the doll is redrawn. A portrait does not need sixty. */
export const PAPERDOLL_FPS = 15;

/** The vertical field of view of the doll camera, in degrees. Long lens, little distortion. */
export const DOLL_FOV = 30;

/** How much of the frame's height the figure fills, head to sole. */
export const FILL = 0.86;

/** How wide the figure is compared with its height, arms included. */
export const WIDTH_RATIO = 0.42;

/** Where the camera looks, as a fraction of the character's height. */
export const EYE_FRACTION = 0.52;

/** Radians of turn per pixel of drag. A full turn is about 520 px. */
export const TURN_PER_PX = 0.012;

/** How fast the doll turns on its own when nobody is dragging, radians a second. */
export const IDLE_TURN = 0.22;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/**
 * Pure. Where the camera stands to frame a character of this height in a
 * viewport of this shape.
 *
 *   the height it must fit    h = height / FILL
 *   the distance for that     d = (h / 2) / tan(fov / 2)
 *   the width it must fit     w = height * WIDTH_RATIO / FILL
 *   the distance for THAT     d = (w / 2) / (tan(fov / 2) * aspect)
 *
 * and the camera stands at whichever is further, so a tall narrow frame backs
 * off rather than cutting the shoulders off.
 */
export function framing(opts = {}) {
  const height = Number.isFinite(opts.height) && opts.height > 0 ? opts.height : BODY.HEIGHT;
  const fov = Number.isFinite(opts.fov) && opts.fov > 0 ? opts.fov : DOLL_FOV;
  const fill = clamp(Number.isFinite(opts.fill) && opts.fill > 0 ? opts.fill : FILL, 0.05, 1);
  const aspect = Number.isFinite(opts.aspect) && opts.aspect > 0 ? opts.aspect : 0.7;
  const widthRatio = Number.isFinite(opts.widthRatio) && opts.widthRatio > 0 ? opts.widthRatio : WIDTH_RATIO;
  const halfV = Math.tan((fov * Math.PI) / 180 / 2);
  const forHeight = (height / fill / 2) / halfV;
  const forWidth = (height * widthRatio / fill / 2) / (halfV * aspect);
  const distance = Math.max(forHeight, forWidth);
  return {
    distance,
    forHeight,
    forWidth,
    eye: height * EYE_FRACTION,
    height, fov, fill, aspect,
    /** Which constraint decided it, so a test can say why the number moved. */
    limitedBy: forWidth > forHeight ? 'width' : 'height',
  };
}

/** Pure. Where a drag of dx pixels leaves the turn, wrapped to one turn. */
export function turnFromDrag(yaw, dx, perPx = TURN_PER_PX) {
  const next = (Number.isFinite(yaw) ? yaw : 0) + (Number.isFinite(dx) ? dx : 0) * perPx;
  const TAU = Math.PI * 2;
  return ((next % TAU) + TAU) % TAU;
}

/** Pure. Whether enough time has passed to draw again. */
export const dueAt = (last, now, fps = PAPERDOLL_FPS) => now - last >= 1000 / Math.max(1, fps);

/**
 * The doll.
 *
 * @param {object} sc      createScene's api; only `renderer` is used
 * @param {Function} rigGetter  returns the live rig: player.js's api, or
 *   anything with `.group` and optionally `.state.yaw`
 * @param {object} opts    { width, height, fps, background }
 * @returns {{ canvas, el, update, setVisible, dispose, framing, get yaw, set yaw }}
 */
export function createPaperdoll(sc, rigGetter, opts = {}) {
  const width = Math.max(32, Math.round(opts.width || 240));
  const height = Math.max(32, Math.round(opts.height || 340));
  const fps = opts.fps || PAPERDOLL_FPS;

  const hasDom = typeof document !== 'undefined' && document && typeof document.createElement === 'function';
  const canvas = hasDom ? document.createElement('canvas') : null;
  // The HUD's portrait plate wants the same likeness, and a DOM node can only
  // be in one place: appended into the character sheet's arch it left the
  // plate empty. The portrait is a second canvas, copied from the doll every
  // time the doll is redrawn, with no pointer handling of its own.
  const portrait = hasDom ? document.createElement('canvas') : null;
  let portrait2d = null;
  if (portrait) {
    portrait.className = 'bw-doll-portrait';
    portrait.style.width = '100%';
    portrait.style.height = '100%';
    portrait.style.display = 'block';
    try { portrait2d = portrait.getContext('2d'); } catch { portrait2d = null; }
  }
  let ctx2d = null;
  if (canvas) {
    canvas.width = width;
    canvas.height = height;
    if (portrait) { portrait.width = width; portrait.height = height; }
    canvas.className = 'bw-doll-canvas';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    canvas.style.cursor = 'grab';
    try { ctx2d = canvas.getContext('2d'); } catch { ctx2d = null; }
  }

  // `opts.height` is the canvas in PIXELS. The character's height in METRES is
  // `opts.rigHeight`, and mixing the two would put the camera 340 m away.
  const shape = framing({
    aspect: width / height,
    height: opts.rigHeight,
    fov: opts.fov,
    fill: opts.fill,
    widthRatio: opts.widthRatio,
  });
  const camera = new THREE.PerspectiveCamera(shape.fov, width / height, 0.05, 40);

  // The doll's own three lights: a key from the front and above, a cool fill
  // from the left, and a rim from behind so the silhouette leaves the ground.
  const scene = new THREE.Scene();
  const key = new THREE.DirectionalLight(0xfff0d2, 2.5);
  const fill = new THREE.DirectionalLight(0x9fb6d8, 0.8);
  const rim = new THREE.DirectionalLight(0xffd8a0, 1.5);
  const ambient = new THREE.HemisphereLight(0xbfd0e6, 0x2b2118, 0.75);
  scene.add(key, fill, rim, ambient, key.target, fill.target, rim.target);

  let target = null;
  if (typeof THREE.WebGLRenderTarget === 'function') {
    target = new THREE.WebGLRenderTarget(width, height, {
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
      depthBuffer: true,
      stencilBuffer: false,
    });
  }

  const pixels = new Uint8Array(width * height * 4);
  const flipped = hasDom && ctx2d ? ctx2d.createImageData(width, height) : null;

  let yaw = 0;              // the turn, in radians, added to the rig's own facing
  let visible = false;
  let last = -1e9;
  let drag = null;
  let drawn = 0;            // how many times the doll has actually been drawn
  let failed = null;        // why it will not draw, said once

  // --- the drag ---------------------------------------------------------
  if (canvas && canvas.addEventListener) {
    canvas.addEventListener('pointerdown', (e) => {
      drag = { x: e.clientX };
      canvas.style.cursor = 'grabbing';
      try { canvas.setPointerCapture(e.pointerId); } catch { /* not captured; the window still hears the up */ }
      e.stopPropagation();
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!drag) return;
      yaw = turnFromDrag(yaw, e.clientX - drag.x);
      drag.x = e.clientX;
      last = -1e9;                       // redraw on the next update, not in 66 ms
      e.stopPropagation();
    });
    const stop = () => { drag = null; if (canvas) canvas.style.cursor = 'grab'; };
    canvas.addEventListener('pointerup', stop);
    canvas.addEventListener('pointerleave', stop);
    canvas.addEventListener('pointercancel', stop);
  }

  /** Put the camera where `framing` says, around the rig, at the current turn. */
  function place(group, rigYaw) {
    const p = group.position;
    const a = rigYaw + yaw;
    camera.position.set(
      p.x + Math.sin(a) * shape.distance,
      p.y + shape.eye,
      p.z + Math.cos(a) * shape.distance,
    );
    camera.lookAt(p.x, p.y + shape.eye, p.z);
    // The lights ride with the camera, so the face is lit from wherever you
    // have turned the figure to.
    const dir = new THREE.Vector3().subVectors(camera.position, p).normalize();
    key.position.copy(p).add(dir.clone().multiplyScalar(4)).add(new THREE.Vector3(0, 3, 0));
    fill.position.copy(p).add(new THREE.Vector3(-dir.z, 1.2, dir.x).multiplyScalar(3));
    rim.position.copy(p).sub(dir.clone().multiplyScalar(4)).add(new THREE.Vector3(0, 2.4, 0));
    key.target.position.copy(p); fill.target.position.copy(p); rim.target.position.copy(p);
  }

  function draw() {
    const renderer = sc && sc.renderer;
    const rig = typeof rigGetter === 'function' ? rigGetter() : rigGetter;
    const group = rig && (rig.group || rig);
    if (!renderer || !group || !target || !ctx2d || !flipped) {
      if (!failed) {
        failed = !renderer ? 'there is no renderer' : !group ? 'there is no rig yet' : 'this browser has no render target to draw into';
      }
      return false;
    }

    const home = group.parent;
    const oldTarget = renderer.getRenderTarget();
    const oldAlpha = renderer.getClearAlpha();

    scene.add(group);                 // out of the world, into the light
    group.updateMatrixWorld(true);
    place(group, rig.state ? rig.state.yaw : group.rotation.y);

    // shadowMap.enabled is deliberately left alone. Flipping it recompiles
    // every material in the scene, and doing that fifteen times a second to
    // save one shadow pass on four lights would cost far more than it saves.
    renderer.setRenderTarget(target);
    renderer.setClearAlpha(0);
    renderer.clear(true, true, false);
    renderer.render(scene, camera);
    renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
    renderer.setRenderTarget(oldTarget);
    renderer.setClearAlpha(oldAlpha);

    if (home) home.add(group); else scene.remove(group);
    group.updateMatrixWorld(true);

    // WebGL reads bottom row first; the canvas wants the top row first.
    const row = width * 4;
    for (let y = 0; y < height; y++) {
      const from = (height - 1 - y) * row;
      flipped.data.set(pixels.subarray(from, from + row), y * row);
    }
    ctx2d.clearRect(0, 0, width, height);
    ctx2d.putImageData(flipped, 0, 0);
    if (portrait2d) {
      portrait2d.clearRect(0, 0, width, height);
      portrait2d.drawImage(canvas, 0, 0);
    }
    drawn++;
    return true;
  }

  return {
    canvas,
    el: canvas,
    /** A copy of the doll for the HUD plate, redrawn with it. Never the same node as `canvas`. */
    portrait,
    /** The camera maths this doll was built with, for anything that wants it. */
    framing: shape,
    get yaw() { return yaw; },
    set yaw(v) { yaw = turnFromDrag(Number.isFinite(v) ? v : 0, 0); last = -1e9; },
    get drawn() { return drawn; },
    /** Why the doll is blank, in words, or null when it is drawing. */
    get trouble() { return failed; },

    setVisible(on) {
      visible = !!on;
      if (!visible) drag = null;
      if (visible) last = -1e9;         // draw at once rather than up to 66 ms late
      return visible;
    },

    /**
     * One frame. Does nothing at all while the tab is closed, turns slowly on
     * its own when nobody is dragging, and redraws at PAPERDOLL_FPS.
     */
    update(dt) {
      if (!visible) return false;
      if (!drag) yaw = turnFromDrag(yaw, IDLE_TURN * (Number.isFinite(dt) ? dt : 0), 1);
      const now = typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
      if (!dueAt(last, now, fps)) return false;
      last = now;
      return draw();
    },

    dispose() {
      visible = false;
      if (target && target.dispose) target.dispose();
      scene.clear();
      if (canvas && canvas.remove) canvas.remove();
    },
  };
}
