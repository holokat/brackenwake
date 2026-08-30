// Editable scenery trees.
//
// The outer-zone forests are InstancedMeshes for speed, which makes individual
// trees awkward to touch. A TreeField keeps the authoritative list of trees as
// plain records and rebuilds its instanced meshes from that list, so trees can
// be moved, deleted and added while still drawing in a handful of calls.
//
// The editor is a TEST-MODE authoring aid: arrange the forest by hand, dump the
// list, and bake it into the theme.

import * as THREE from 'three';

const fields = [];

export function clearTreeFields() { fields.length = 0; }

// spec: { parent, layers: [{ geo, mat, of(tree) -> {x,y,z,s,sy,ry} | null }] }
// Each layer draws one instanced part of the tree (trunk, canopy, side puff).
export function createTreeField(spec) {
  const field = {
    ...spec,
    trees: [],
    meshes: [],
    rebuild() { rebuild(field); },
    add(t) { field.trees.push(t); },
    removeAt(i) { field.trees.splice(i, 1); },
  };
  fields.push(field);
  return field;
}

const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
const _p = new THREE.Vector3(), _s = new THREE.Vector3();

function rebuild(field) {
  for (const m of field.meshes) {
    m.parent?.remove(m);
    m.dispose?.();
  }
  field.meshes = [];
  for (const layer of field.layers) {
    // which tree each instance came from, so a raycast hit maps back to a tree
    const map = [];
    const parts = [];
    for (let i = 0; i < field.trees.length; i++) {
      const part = layer.of(field.trees[i]);
      if (!part) continue;
      parts.push(part);
      map.push(i);
    }
    if (!parts.length) continue;
    const im = new THREE.InstancedMesh(layer.geo, layer.mat, parts.length);
    for (let i = 0; i < parts.length; i++) {
      const t = parts[i];
      _e.set(t.rx || 0, t.ry || 0, t.rz || 0);
      _q.setFromEuler(_e);
      _p.set(t.x, t.y, t.z);
      const sc = t.s == null ? 1 : t.s;
      _s.set(sc, (t.sy == null ? 1 : t.sy) * sc, sc);
      _m4.compose(_p, _q, _s);
      im.setMatrixAt(i, _m4);
    }
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = true;
    im.userData.treeField = field;
    im.userData.treeMap = map;
    if (layer.tag) layer.tag(im);
    field.parent.add(im);
    field.meshes.push(im);
  }
}

export function dumpTrees() {
  return fields.map((f) => ({
    name: f.name || 'trees',
    count: f.trees.length,
    trees: f.trees.map((t) => ({
      x: +t.x.toFixed(1), z: +t.z.toFixed(1), gy: +t.gy.toFixed(2),
      s: +t.s.toFixed(2), ry: +t.ry.toFixed(2), alt: t.alt ? 1 : 0,
    })),
  }));
}

// temporary diagnostic: what does a raycast at these screen coords actually hit?
export function debugPick(farm, sx, sy) {
  const dom = farm.renderer.domElement;
  const r = dom.getBoundingClientRect();
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2(((sx - r.left) / r.width) * 2 - 1, -((sy - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, farm.camera);
  const meshes = fields.flatMap((f) => f.meshes);
  const hits = ray.intersectObjects(meshes, false);
  return {
    fields: fields.length,
    meshes: meshes.length,
    rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
    ndc: [+ndc.x.toFixed(3), +ndc.y.toFixed(3)],
    hits: hits.length,
    first: hits[0] ? { instanceId: hits[0].instanceId, hasField: !!hits[0].object.userData.treeField } : null,
  };
}

let editor = null;

export function treeEditor(farm, on = true) {
  if (!on) {
    if (editor) editor.dispose();
    editor = null;
    return 'tree editor OFF';
  }
  if (editor) return 'tree editor already on';
  if (!fields.length) return 'no editable tree field in this theme';

  const dom = farm.renderer.domElement;
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const hitPt = new THREE.Vector3();
  let sel = null;      // { field, index }
  let dragging = false;
  let marker = null;

  const groundMeshes = () => {
    const out = [];
    farm.scene.traverse((o) => { if (o.isMesh && o.userData.ground != null) out.push(o); });
    return out;
  };

  const hud = document.createElement('div');
  hud.style.cssText = 'position:fixed;left:12px;bottom:120px;z-index:9999;background:rgba(12,26,14,.88);' +
    'color:#dff5d8;font:12px/1.5 ui-monospace,monospace;padding:10px 12px;border-radius:8px;' +
    'border:1px solid #4f9636;max-width:330px;pointer-events:none;white-space:pre-wrap';
  document.body.appendChild(hud);

  const say = (msg) => {
    hud.textContent = 'TREE EDITOR\n' +
      'click a tree to select · drag to move\n' +
      'A = add tree at cursor · Del/X = delete\n' +
      'SCALE: - / +   ROTATE: Q / E   (Shift = fine)\n' +
      '__nostrux.trees.dump() prints the forest\n\n' + msg;
  };

  const showMarker = () => {
    if (marker) { marker.parent?.remove(marker); marker = null; }
    if (!sel) return;
    const t = sel.field.trees[sel.index];
    if (!t) return;
    const g = new THREE.RingGeometry(1.6 * t.s, 2.2 * t.s, 18);
    marker = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
      color: 0xffe45c, side: THREE.DoubleSide, transparent: true, opacity: 0.9, depthTest: false,
    }));
    marker.rotation.x = -Math.PI / 2;
    marker.renderOrder = 999;
    marker.position.set(t.x, t.gy + 0.3, t.z);
    sel.field.parent.add(marker);
  };

  const describe = () => {
    if (!sel) return 'nothing selected';
    const t = sel.field.trees[sel.index];
    if (!t) return 'nothing selected';
    return `tree #${sel.index} of ${sel.field.trees.length}\n  x ${t.x.toFixed(1)}  z ${t.z.toFixed(1)}` +
      `\n  scale ${t.s.toFixed(2)}  rot ${(t.ry * 180 / Math.PI).toFixed(0)}°`;
  };

  const setNdc = (e) => {
    const r = dom.getBoundingClientRect();
    ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(ndc, farm.camera);
  };

  // where the pointer meets the terrain, in a field's local space
  const groundAt = (e, field) => {
    setNdc(e);
    const hits = ray.intersectObjects(groundMeshes(), false);
    if (!hits.length) return null;
    hitPt.copy(hits[0].point);
    field.parent.worldToLocal(hitPt);
    return { x: hitPt.x, y: hitPt.y, z: hitPt.z };
  };

  const pick = (e) => {
    setNdc(e);
    const meshes = fields.flatMap((f) => f.meshes);
    const hits = ray.intersectObjects(meshes, false);
    for (const h of hits) {
      const f = h.object.userData.treeField;
      const map = h.object.userData.treeMap;
      if (f && map && h.instanceId != null) return { field: f, index: map[h.instanceId] };
    }
    return null;
  };

  const onDown = (e) => {
    const hit = pick(e);
    if (!hit) return;
    e.stopPropagation(); e.preventDefault();
    sel = hit;
    dragging = true;
    farm.controls.enabled = false;
    showMarker();
    say(describe());
  };

  const onMove = (e) => {
    if (!dragging || !sel) return;
    e.stopPropagation();
    const g = groundAt(e, sel.field);
    if (!g) return;
    const t = sel.field.trees[sel.index];
    t.x = g.x; t.z = g.z; t.gy = g.y;
    sel.field.rebuild();
    showMarker();
    say(describe());
  };

  const onUp = () => { dragging = false; farm.controls.enabled = true; };

  let lastPointer = null;
  const trackPointer = (e) => { lastPointer = e; };

  const onKey = (e) => {
    const fine = e.shiftKey;
    // add a tree wherever the cursor is resting
    if (e.key === 'a' || e.key === 'A') {
      const field = sel?.field || fields[0];
      if (!lastPointer) return;
      const g = groundAt(lastPointer, field);
      if (!g) return;
      field.add(field.make ? field.make(g.x, g.z, g.y) : { x: g.x, z: g.z, gy: g.y, s: 1.2, ry: Math.random() * Math.PI, alt: Math.random() < 0.5 });
      field.rebuild();
      sel = { field, index: field.trees.length - 1 };
      showMarker();
      e.preventDefault(); e.stopPropagation();
      say(describe());
      return;
    }
    if (!sel) return;
    const t = sel.field.trees[sel.index];
    if (!t) { sel = null; return; }
    let used = true;
    if (e.key === 'Delete' || e.key === 'Backspace' || e.key === 'x' || e.key === 'X') {
      sel.field.removeAt(sel.index);
      sel.field.rebuild();
      sel = null;
      showMarker();
      e.preventDefault(); e.stopPropagation();
      say('deleted · nothing selected');
      return;
    }
    if (e.key === 'q' || e.key === 'Q') t.ry -= (fine ? 2 : 10) * Math.PI / 180;
    else if (e.key === 'e' || e.key === 'E') t.ry += (fine ? 2 : 10) * Math.PI / 180;
    else if (e.key === '-' || e.key === '_' || e.key === '[') t.s *= fine ? 0.99 : 0.92;
    else if (e.key === '+' || e.key === '=' || e.key === ']') t.s *= fine ? 1.01 : 1.08;
    else if (e.key === 'Escape') { sel = null; showMarker(); say('nothing selected'); return; }
    else used = false;
    if (used) {
      e.preventDefault(); e.stopPropagation();
      sel.field.rebuild();
      showMarker();
      say(describe());
    }
  };

  dom.addEventListener('pointerdown', onDown, true);
  window.addEventListener('pointermove', onMove, true);
  window.addEventListener('pointermove', trackPointer, false);
  window.addEventListener('pointerup', onUp, true);
  window.addEventListener('keydown', onKey, true);
  say('nothing selected');

  editor = {
    dispose() {
      dom.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointermove', trackPointer, false);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('keydown', onKey, true);
      hud.remove();
      if (marker) { marker.parent?.remove(marker); marker = null; }
      farm.controls.enabled = true;
    },
  };
  return 'tree editor ON — click a tree, drag to move, A adds, Del deletes, -/+ scale, Q/E rotate';
}
