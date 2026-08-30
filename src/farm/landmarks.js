// Authored static landmark models (castle, pagoda, bridge, old house, Mt Fuji).
//
// Themes build their scenery SYNCHRONOUSLY, but glTF loads async, so each
// landmark is placed as an empty group immediately and the model drops into it
// when it arrives. Every model is measured on arrival and scaled to the size
// the scene asked for, so callers think in world units instead of guessing at
// each asset's native scale.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { loadStore, patchStore } from './scenery_store.js';

const SOURCES = {
  castle: '/models/japanese-castle.glb',
  pagoda: '/models/japanese-pagoda.glb',
  bridge: '/models/japanese-bridge.glb',
  house: '/models/japanese-old-house.glb',
  fuji: '/models/mount-fuji.glb',
};

const loader = new GLTFLoader();
const cache = {};   // id -> { scene, size, center }
const waiting = {}; // id -> [fn]
const placed = [];  // every landmark in the scene, for the placement editor
const seq = {};     // per-id counter, so each placement gets a stable key

function measure(scene) {
  const box = new THREE.Box3().setFromObject(scene);
  const size = new THREE.Vector3(), center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  return { size, center, minY: box.min.y };
}

function loadOne(id) {
  return new Promise((resolve) => {
    loader.load(SOURCES[id], (gltf) => {
      const m = measure(gltf.scene);
      cache[id] = { scene: gltf.scene, ...m };
      for (const fn of waiting[id] || []) { try { fn(); } catch {} }
      waiting[id] = [];
      resolve(cache[id]);
    }, undefined, (err) => {
      console.warn('landmark load failed:', id, err);
      resolve(null);
    });
  });
}

let _preload = null;
export function preloadLandmarks() {
  if (!_preload) _preload = Promise.all(Object.keys(SOURCES).map(loadOne));
  return _preload;
}

export function landmarkReady(id) { return !!cache[id]; }

// Native footprint of a model, so callers can reason about how a placement will
// read before the file has loaded (returns null until it has).
export function landmarkSize(id) {
  return cache[id] ? cache[id].size.clone() : null;
}

function fill(holder, id, opts) {
  const entry = cache[id];
  if (!entry) return;
  const model = entry.scene.clone(true);
  // scale to whichever dimension the caller pinned
  let s = opts.scale ?? 1;
  if (opts.height) s = opts.height / (entry.size.y || 1);
  else if (opts.width) s = opts.width / (entry.size.x || 1);
  else if (opts.span) s = opts.span / (entry.size.x || 1);
  model.scale.setScalar(s);
  // sit the model ON the ground: drop it by its own base, and re-centre in XZ
  // so rotation spins about the landmark rather than swinging it around
  model.position.set(-entry.center.x * s, -entry.minY * s, -entry.center.z * s);
  if (opts.castShadow === false) {
    model.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
  } else {
    model.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  }
  holder.add(model);
}

// Place a landmark at (x, y, z) in the parent's local space. Returns the holder
// group right away; the model appears inside it once loaded.
//   opts: { height | width | span | scale, rotY, castShadow }
export function placeLandmark(parent, id, x, y, z, opts = {}) {
  // a stable identity for this placement: the Nth landmark of this kind. The
  // theme places them in a deterministic order, so the key survives rebuilds.
  const n = seq[id] = (seq[id] || 0) + 1;
  const key = `${id}:${n - 1}`;
  const saved = (loadStore().landmarks || {})[key];
  if (saved?.deleted) return null; // removed by hand in the editor
  const holder = new THREE.Group();
  holder.userData.key = key;
  if (saved) {
    holder.position.set(saved.x, saved.y, saved.z);
    holder.rotation.y = saved.rotY || 0;
    opts = { ...opts, scale: saved.scale, height: undefined, width: undefined, span: undefined };
  } else {
    holder.position.set(x, y, z);
    holder.rotation.y = opts.rotY || 0;
  }
  parent.add(holder);
  if (cache[id]) fill(holder, id, opts);
  else {
    (waiting[id] = waiting[id] || []).push(() => fill(holder, id, opts));
    preloadLandmarks();
  }
  placed.push({ id, key, holder, opts });
  return holder;
}

// A landmark still attached to a live scene. Rebuilding the farm throws the old
// land group away, but its children keep pointing at it, so "has a parent" isn't
// enough to tell a live model from a discarded one.
function isLive(o) {
  let n = o;
  while (n.parent) n = n.parent;
  return n.isScene === true && o.children.length > 0;
}
function livePlaced() {
  return placed.filter((p) => isLive(p.holder));
}

// register a procedurally built group (torii gates, stone lanterns…) so the
// placement editor treats it like an imported landmark
export function placeProp(parent, id, group, x, y, z, opts = {}) {
  const n = seq[id] = (seq[id] || 0) + 1;
  const key = `${id}:${n - 1}`;
  const saved = (loadStore().landmarks || {})[key];
  if (saved?.deleted) return null;
  const holder = new THREE.Group();
  holder.userData.key = key;
  if (saved) {
    holder.position.set(saved.x, saved.y, saved.z);
    holder.rotation.y = saved.rotY || 0;
    group.scale.setScalar(saved.scale ?? 1);
  } else {
    holder.position.set(x, y, z);
    holder.rotation.y = opts.rotY || 0;
    if (opts.scale) group.scale.setScalar(opts.scale);
  }
  holder.add(group);
  parent.add(holder);
  placed.push({ id, key, holder, opts });
  return holder;
}

// forget a landmark entirely — it stays gone across reloads until reset
export function deleteLandmark(entry) {
  entry.holder.parent?.remove(entry.holder);
  const i = placed.indexOf(entry);
  if (i >= 0) placed.splice(i, 1);
  patchStore((store) => {
    store.landmarks = store.landmarks || {};
    store.landmarks[entry.key] = { deleted: true };
  });
}

export function clearLandmarks() {
  placed.length = 0;
  for (const k of Object.keys(seq)) delete seq[k];
}

// remember one landmark's transform so it survives reloads and code edits
export function saveLandmark(entry) {
  const h = entry.holder;
  patchStore((store) => {
    store.landmarks = store.landmarks || {};
    store.landmarks[entry.key] = {
      x: +h.position.x.toFixed(2), y: +h.position.y.toFixed(2), z: +h.position.z.toFixed(2),
      rotY: +h.rotation.y.toFixed(4), scale: +(h.children[0]?.scale.x ?? 1).toFixed(4),
    };
  });
}

// ---------------------------------------------------------------------------
// Placement editor — a temporary authoring aid. Turn it on, drag the landmarks
// where you want them, then dump the transforms and bake them into the theme.
// ---------------------------------------------------------------------------

export function dumpLandmarks() {
  return livePlaced()
    .map(({ id, holder }) => ({
      id,
      x: +holder.position.x.toFixed(1),
      y: +holder.position.y.toFixed(1),
      z: +holder.position.z.toFixed(1),
      rotY: +holder.rotation.y.toFixed(3),
      scale: +(holder.children[0]?.scale.x ?? 1).toFixed(3),
    }));
}

let editor = null;

export function landmarkEditor(farm, on = true) {
  if (!on) {
    if (editor) editor.dispose();
    editor = null;
    return 'landmark editor OFF';
  }
  if (editor) return 'landmark editor already on';

  const dom = farm.renderer.domElement;
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const plane = new THREE.Plane();
  const hitPt = new THREE.Vector3();
  const grabOff = new THREE.Vector3();
  let sel = null, dragging = false;
  // how far the selected model is lifted off the terrain; dragging keeps this
  // offset while the ground height under it changes, so a landmark follows the
  // elevation instead of sliding into a hillside or floating off a terrace
  let yOff = 0;
  let outline = null;
  const highlight = () => {
    if (outline) { outline.parent?.remove(outline); outline.geometry?.dispose(); outline = null; }
    if (!sel || !sel.holder.children.length) return;
    outline = new THREE.BoxHelper(sel.holder, 0xffd54a);
    outline.material.depthTest = false;
    outline.renderOrder = 999;
    farm.scene.add(outline);
  };

  const hud = document.createElement('div');
  hud.style.cssText = 'position:fixed;left:12px;bottom:120px;z-index:9999;background:rgba(20,14,8,.86);' +
    'color:#f6e7c4;font:12px/1.5 ui-monospace,monospace;padding:10px 12px;border-radius:8px;' +
    'border:1px solid #8a5f30;max-width:330px;pointer-events:none;white-space:pre-wrap';
  document.body.appendChild(hud);

  const say = (msg) => {
    hud.textContent = 'LANDMARK EDITOR\n' +
      'click a model to select · drag to move\n' +
      'SCALE:  -  /  +   (or [ ])\n' +
      'ROTATE: Q / E     RAISE/LOWER: \u2191 / \u2193\n' +
      'G = drop flat onto the ground · Del/X = delete\n' +
      'Tab = next model · hold Shift = fine · Esc = deselect\n' +
      '__nostrux.landmarks.dump() prints placements\n\n' + msg;
  };

  const describe = () => {
    if (!sel) return 'nothing selected';
    const h = sel.holder;
    return `${sel.id}\n  x ${h.position.x.toFixed(1)}  y ${h.position.y.toFixed(1)}  z ${h.position.z.toFixed(1)}` +
      `\n  rotY ${(h.rotation.y * 180 / Math.PI).toFixed(0)}°  scale ${(h.children[0]?.scale.x ?? 1).toFixed(2)}`;
  };

  // every mesh the terrain is drawn with, so a landmark can sit on it
  const groundMeshes = () => {
    const out = [];
    farm.scene.traverse((o) => { if (o.isMesh && o.userData.ground != null) out.push(o); });
    return out;
  };

  // terrain height directly under a point, in the holder's parent space
  const groundYAt = (holder, lx, lz) => {
    const from = new THREE.Vector3(lx, 0, lz);
    holder.parent.localToWorld(from);
    from.y = 4000;
    const down = new THREE.Raycaster(from, new THREE.Vector3(0, -1, 0));
    const hits = down.intersectObjects(groundMeshes(), false);
    if (!hits.length) return null;
    const p = hits[0].point.clone();
    holder.parent.worldToLocal(p);
    return p.y;
  };

  const pick = (e) => {
    const r = dom.getBoundingClientRect();
    ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(ndc, farm.camera);
    const roots = livePlaced().map((p) => p.holder);
    const hits = ray.intersectObjects(roots, true);
    if (!hits.length) return null;
    let o = hits[0].object;
    while (o && !roots.includes(o)) o = o.parent;
    return placed.find((p) => p.holder === o) || null;
  };

  const onDown = (e) => {
    const hit = pick(e);
    if (!hit) return;
    e.stopImmediatePropagation(); // don't let the tree editor grab it too
    e.preventDefault();
    sel = hit;
    dragging = true;
    highlight();
    farm.controls.enabled = false;
    const wp = new THREE.Vector3();
    sel.holder.getWorldPosition(wp);
    plane.set(new THREE.Vector3(0, 1, 0), -wp.y);
    if (ray.ray.intersectPlane(plane, hitPt)) grabOff.copy(wp).sub(hitPt);
    // remember how high it currently sits above the ground beneath it
    const gy = groundYAt(sel.holder, sel.holder.position.x, sel.holder.position.z);
    yOff = gy == null ? 0 : sel.holder.position.y - gy;
    say(describe());
  };

  const onMove = (e) => {
    if (!dragging || !sel) return;
    e.stopImmediatePropagation();
    const r = dom.getBoundingClientRect();
    ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(ndc, farm.camera);
    if (!ray.ray.intersectPlane(plane, hitPt)) return;
    hitPt.add(grabOff);
    sel.holder.parent.worldToLocal(hitPt);
    sel.holder.position.x = hitPt.x;
    sel.holder.position.z = hitPt.z;
    // ride the terrain, keeping whatever lift the model already had
    const gy = groundYAt(sel.holder, hitPt.x, hitPt.z);
    if (gy != null) sel.holder.position.y = gy + yOff;
    outline?.update();
    say(describe());
  };

  const onUp = () => {
    if (dragging && sel) saveLandmark(sel); // keep what you just arranged
    dragging = false;
    farm.controls.enabled = true;
  };

  const onKey = (e) => {
    if (e.key === 'Tab') {
      const live = livePlaced();
      if (!live.length) return;
      const i = sel ? live.indexOf(sel) : -1;
      sel = live[(i + 1) % live.length];
      const w = new THREE.Vector3();
      sel.holder.getWorldPosition(w);
      farm.controls.target.copy(w);
      farm.controls.update();
      highlight();
      e.preventDefault(); e.stopImmediatePropagation();
      say(describe());
      return;
    }
    if (!sel) return;
    if (e.key === 'Delete' || e.key === 'Backspace' || e.key === 'x' || e.key === 'X') {
      deleteLandmark(sel);
      sel = null;
      highlight();
      e.preventDefault(); e.stopImmediatePropagation();
      say('deleted · nothing selected');
      return;
    }
    const h = sel.holder, fine = e.shiftKey;
    const model = h.children[0];
    let used = true;
    if (e.key === 'q' || e.key === 'Q') h.rotation.y -= (fine ? 1 : 5) * Math.PI / 180;
    else if (e.key === 'e' || e.key === 'E') h.rotation.y += (fine ? 1 : 5) * Math.PI / 180;
    else if ((e.key === '[' || e.key === '-' || e.key === '_') && model) model.scale.multiplyScalar(fine ? 0.99 : 0.93);
    else if ((e.key === ']' || e.key === '+' || e.key === '=') && model) model.scale.multiplyScalar(fine ? 1.01 : 1.075);

    else if (e.key === 'ArrowUp') { h.position.y += fine ? 0.2 : 1; yOff += fine ? 0.2 : 1; }
    else if (e.key === 'ArrowDown') { h.position.y -= fine ? 0.2 : 1; yOff -= fine ? 0.2 : 1; }
    else if (e.key === 'g' || e.key === 'G') { // snap flat onto the terrain
      const gy = groundYAt(h, h.position.x, h.position.z);
      if (gy != null) { h.position.y = gy; yOff = 0; }
    }
    else if (e.key === 'Escape') { sel = null; highlight(); }
    else used = false;
    if (used) { e.preventDefault(); e.stopImmediatePropagation(); outline?.update(); if (sel) saveLandmark(sel); say(describe()); }
  };

  dom.addEventListener('pointerdown', onDown, true);
  window.addEventListener('pointermove', onMove, true);
  window.addEventListener('pointerup', onUp, true);
  window.addEventListener('keydown', onKey, true);
  say('nothing selected');

  editor = {
    dispose() {
      dom.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('keydown', onKey, true);
      hud.remove();
      if (outline) { outline.parent?.remove(outline); outline = null; }
      farm.controls.enabled = true;
    },
  };
  return 'landmark editor ON — click a model, drag to move, Q/E rotate, [ ] scale, ↑/↓ height';
}
