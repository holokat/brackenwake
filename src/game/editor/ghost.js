// Terrain rings and real placement previews. Models are created only when
// the selected asset changes; pointer movement updates their transforms.

import * as THREE from 'three';
import { createPlacementPreview } from './placement_preview.js';

/** How far over the ground the footprint ring floats, in metres. */
export const RING_LIFT = 0.08;
/** The colour a ghost is drawn in: the gold the rest of the interface uses. */
export const GHOST_COLOUR = 0xc9a44a;

const ghostMat = (colour = GHOST_COLOUR) => new THREE.MeshBasicMaterial({
  color: colour, transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide,
});

/**
 * The ghost for one palette pick, standing on y = 0 facing +z.
 *
 * Answers { group, w, d, h, words } or null. `words` is what the panel prints
 * beside the cursor, so the size is on screen before the click and not after.
 */
export function ghostFor(tab, id, opts = {}) {
  if (tab === 'terrain') {
    const r = opts.r || 8;
    // ED5: `core` is where the full effect ends, in metres, and the ring draws
    // it as a second circle, so the falloff is on the ground before the press.
    const core = Number.isFinite(opts.core) ? opts.core : 0;
    const g = brushRing(r, BRUSH_COLOUR, core);
    const soft = core > 0 && core < r
      ? `, full out to ${core.toFixed(1)} m and let go over the last ${(r - core).toFixed(1)}` : '';
    return { group: g, w: r * 2, d: r * 2, h: 0, words: `the ${id} brush, ${r} m across the radius, ${(r * 2).toFixed(0)} m corner to corner${soft}` };
  }
  return createPlacementPreview(tab, id, opts);
}

/** The blue the terrain half is drawn in, everywhere it is drawn. */
export const BRUSH_COLOUR = 0x4a8ff0;

/** The smallest core worth drawing a second circle for, in metres. */
export const CORE_MIN = 0.25;
/** How many rings a brush of this radius and core wears. The test drives it. */
export const ringRadii = (r, core = 0) => {
  const rr = Math.max(0.3, r);
  const c = Number.isFinite(core) ? core : 0;
  return c >= CORE_MIN && c < rr - 1e-6 ? [c, rr] : [rr];
};

/**
 * A ring of EXACTLY r metres, which is the ground the brush will take, and
 * since ED5 a second one at `core`, which is the ground it will take in full.
 *
 * `footprintRing` is measured corner to corner, because a building is a box.
 * A brush is a circle of radius r, and a ring 41% too wide would have the user
 * aiming a 600 m mountain at ground it was never going to touch. So this is its
 * own ring: the outer edge is r, and the cross in the middle is there because a
 * 600 m ring has no visible centre.
 *
 * THE INNER RING IS NOT DECORATION. A feathered brush does most of nothing at
 * its rim, and a person shown one circle aims the whole effect at the rim and
 * wonders why it did so little. Two circles say where the brush is full and
 * where it is letting go, before the button goes down. It is drawn only when
 * there is something to see: a core under a quarter of a metre, or a core that
 * IS the radius, is one circle, which is what a hard brush has always worn.
 */
export function brushRing(r, colour = BRUSH_COLOUR, core = 0) {
  const g = new THREE.Group();
  const rr = Math.max(0.3, r);
  const rings = ringRadii(rr, core);
  for (const radius of rings) {
    const inner = radius * (1 - Math.min(0.06, 1.2 / radius));
    const one = new THREE.Mesh(new THREE.RingGeometry(inner, radius, 72), ghostMat(colour));
    one.rotation.x = -Math.PI / 2;
    one.position.y = RING_LIFT;
    // the core reads as the fainter of the two, so the brush's own edge is
    // still the line the eye takes for its size
    if (radius !== rr) one.material.opacity = 0.24;
    g.add(one);
  }
  const disc = new THREE.Mesh(new THREE.CircleGeometry(rr, 48), ghostMat(colour));
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = RING_LIFT * 0.5;
  disc.material.opacity = 0.1;
  g.add(disc);
  const arm = Math.max(0.4, rr * 0.06);
  for (const [w, d] of [[arm * 2, arm * 0.2], [arm * 0.2, arm * 2]]) {
    const bar = new THREE.Mesh(new THREE.PlaneGeometry(w, d), ghostMat(colour));
    bar.rotation.x = -Math.PI / 2;
    bar.position.y = RING_LIFT * 1.5;
    g.add(bar);
  }
  return g;
}

/** How many points a line ghost is sampled at, so it follows the ground. */
export const LINE_SAMPLES = 48;

/**
 * The line a ridge or a valley will be cut along, drawn on the ground.
 *
 * It is sampled, not a straight segment between two points, because a straight
 * line between two hilltops runs a hundred metres over the valley between them
 * and reads as pointing at nothing. `set` takes the two ends and the height
 * field, and lifts every sample onto the ground it is over.
 */
export function lineGhost(colour = BRUSH_COLOUR) {
  const pts = [];
  for (let i = 0; i <= LINE_SAMPLES; i++) pts.push(new THREE.Vector3());
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: colour, transparent: true, opacity: 0.9, depthTest: false }));
  line.renderOrder = 999;
  line.set = (a, b, heightAt) => {
    const pos = geo.attributes.position;
    const h = typeof heightAt === 'function' ? heightAt : () => 0;
    for (let i = 0; i <= LINE_SAMPLES; i++) {
      const t = i / LINE_SAMPLES;
      const x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
      pos.setXYZ(i, x, h(x, z) + 0.5, z);
    }
    pos.needsUpdate = true;
    geo.computeBoundingSphere();
    return line;
  };
  return line;
}

/** A ring that says where the space's own edge is. Built once per space. */
export function radiusRing(radius, colour = GHOST_COLOUR) {
  const pts = [];
  for (let i = 0; i <= 96; i++) {
    const a = (i / 96) * Math.PI * 2;
    pts.push(new THREE.Vector3(Math.sin(a) * radius, 0, Math.cos(a) * radius));
  }
  const geo = new THREE.BufferGeometry().setFromPoints(pts);
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: colour, transparent: true, opacity: 0.6, depthTest: false }));
  line.renderOrder = 998;
  return line;
}

/** A box drawn round whatever is selected, so a click can be seen to have landed. */
export function selectionBox(colour = 0xf2dc9c) {
  const box = new THREE.Box3Helper(new THREE.Box3(), colour);
  box.material.depthTest = false;
  box.renderOrder = 998;
  return box;
}

/** Free a ghost's own materials. The geometry is the game's and stays. */
export function disposeGhost(g) {
  if (!g) return;
  if (g.userData?.disposePreview) { g.userData.disposePreview(); return; }
  for (const child of [...g.children]) disposeGhost(child);
  g.geometry?.dispose();
  for (const m of Array.isArray(g.material) ? g.material : [g.material]) m?.dispose();
}
