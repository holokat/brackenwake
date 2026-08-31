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
import { loadStore, patchStore } from './scenery_store.js';

const fields = [];

export function clearTreeFields() { fields.length = 0; }

// spec: { parent, layers: [{ geo, mat, of(tree) -> {x,y,z,s,sy,ry} | null }] }
// Each layer draws one instanced part of the tree (trunk, canopy, side puff).
export function createTreeField(spec) {
  const field = {
    ...spec,
    trees: [],
    meshes: [],
    hydrated: false,
    rebuild() {
      // the first build swaps in a hand-arranged forest if one was saved, so a
      // reload (or a code edit) doesn't wipe out what you placed
      if (!field.hydrated) {
        field.hydrated = true;
        const saved = (loadStore().trees || {})[field.name];
        if (Array.isArray(saved) && saved.length) field.trees = saved.map((t) => ({ ...t }));
      }
      rebuild(field);
    },
    add(t) { field.trees.push(t); },
    removeAt(i) { field.trees.splice(i, 1); },
    save() {
      patchStore((store) => {
        store.trees = store.trees || {};
        store.trees[field.name] = field.trees;
      });
    },
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
      if (field.trees[i].felledUntil) continue; // chopped down, regrowing
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
    im.userData.layer = layer; // so a single instance can be re-composed later
    if (layer.tag) layer.tag(im);
    field.parent.add(im);
    field.meshes.push(im);
  }
}

// ---------------------------------------------------------------------------
// Felling — the axe works on scenery trees, not just planted timber. A chopped
// tree topples, is gone for a while, then grows back.
// ---------------------------------------------------------------------------

const FELL_HITS = 3;                       // axe swings to bring one down
const REGROW_MIN = 240_000;                // 4 minutes...
const REGROW_SPAN = 300_000;               // ...to 9, randomised per tree
// Story modifier hook: planting saplings for the ones after you shortens this
// for good; clearing the ridge and shrugging lengthens it. Set by main.js.
export let regrowMult = 1;
export function setRegrowMult(v) { regrowMult = Number.isFinite(v) && v > 0 ? v : 1; }

export function treeFieldsFor() { return fields; }

// Every theme owes the player BOTH tools working: something to chop and
// something to mine. A biome whose flora is plain instanced decor hands you an
// axe that does nothing when you click a tree, which is exactly the bug this
// guards against. Runs after each outer zone builds; warns rather than throws,
// because a missing field must never take the scene down with it.
export function auditHarvestFields(themeId) {
  const kinds = new Set(fields.map((f) => f.kind || 'tree'));
  const counts = { tree: 0, rock: 0 };
  for (const f of fields) counts[f.kind || 'tree'] += f.trees.length;
  const missing = ['tree', 'rock'].filter((k) => !kinds.has(k) || !counts[k]);
  if (missing.length) {
    console.warn(`[scenery] theme "${themeId}" has no harvestable ${missing.join(' and ')} — `
      + `the ${missing.includes('tree') ? 'axe' : ''}${missing.length > 1 ? '/' : ''}`
      + `${missing.includes('rock') ? 'pickaxe' : ''} will do nothing here. `
      + 'Add a createTreeField (see addBoulderField in themes.js).');
  }
  return { themeId, counts, ok: !missing.length };
}

// Build a one-off, non-instanced copy of a tree so it can be animated falling.
function treeCopy(field, tree) {
  const g = new THREE.Group();
  for (const layer of field.layers) {
    const part = layer.of(tree);
    if (!part) continue;
    const m = new THREE.Mesh(layer.geo, layer.mat);
    // position relative to the trunk's base, so the group can pivot there
    m.position.set(part.x - tree.x, part.y - tree.gy, part.z - tree.z);
    const sc = part.s == null ? 1 : part.s;
    m.scale.set(sc, (part.sy == null ? 1 : part.sy) * sc, sc);
    m.rotation.set(part.rx || 0, part.ry || 0, part.rz || 0);
    g.add(m);
  }
  g.position.set(tree.x, tree.gy, tree.z);
  return g;
}

// Chop the tree at `index`. Returns { hit } while it still stands, or
// { felled: true, wood } on the swing that brings it down.
// One axe blow: the tree rocks and settles. Instanced, so the single instance's
// matrix is re-composed each frame — pivoting about the trunk base, not the
// part's own centre, or the crown would swing loose from the trunk.
function shudder(field, index, strength = 1) {
  const t = field.trees[index];
  const targets = [];
  for (const im of field.meshes) {
    const i = im.userData.treeMap.indexOf(index);
    if (i >= 0) targets.push({ im, i, layer: im.userData.layer });
  }
  if (!targets.length) return;
  const t0 = performance.now(), DUR = 460;
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / DUR);
    const lean = Math.sin(k * Math.PI * 7) * (1 - k) * 0.11 * strength; // decaying
    const cos = Math.cos(lean), sin = Math.sin(lean);
    for (const { im, i, layer } of targets) {
      const part = layer.of(t);
      if (!part) continue;
      const ox = part.x - t.x, oy = part.y - t.gy, oz = part.z - t.z;
      _p.set(t.x + ox * cos - oy * sin, t.gy + ox * sin + oy * cos, t.z + oz);
      _e.set(part.rx || 0, part.ry || 0, (part.rz || 0) + lean);
      _q.setFromEuler(_e);
      const sc = part.s == null ? 1 : part.s;
      _s.set(sc, (part.sy == null ? 1 : part.sy) * sc, sc);
      _m4.compose(_p, _q, _s);
      im.setMatrixAt(i, _m4);
      im.instanceMatrix.needsUpdate = true;
    }
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export function chopTree(field, index) {
  const t = field.trees[index];
  if (!t || t.felledUntil) return null;
  t.hp = (t.hp ?? (field.hits ?? FELL_HITS)) - 1;
  if (t.hp > 0) {
    shudder(field, index, field.kind === 'rock' ? 0.45 : 1); // rock barely budges
    return { hit: true, remaining: t.hp };
  }
  if (field.kind === 'rock') return breakRock(field, t);

  // topple a standalone copy, then let the instance go
  const faller = treeCopy(field, t);
  field.parent.add(faller);
  const dir = Math.random() * Math.PI * 2;
  const axis = new THREE.Vector3(Math.cos(dir), 0, Math.sin(dir));
  const t0 = performance.now();
  const DUR = 1500;
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / DUR);
    // ease in — slow creak, then it goes over
    const e = k * k * (3 - 2 * k) * (0.35 + 0.65 * k);
    faller.setRotationFromAxisAngle(axis, e * Math.PI * 0.5);
    if (k >= 1) {
      // rest on the ground a moment, then sink away
      setTimeout(() => {
        const s0 = performance.now();
        const sink = () => {
          const j = Math.min(1, (performance.now() - s0) / 900);
          faller.position.y = t.gy - j * 2.5;
          faller.scale.setScalar(1 - j * 0.4);
          if (j < 1) requestAnimationFrame(sink);
          else faller.parent?.remove(faller);
        };
        requestAnimationFrame(sink);
      }, 1200);
      return;
    }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);

  t.hp = null;
  t.felledUntil = Date.now() + (REGROW_MIN + Math.random() * REGROW_SPAN) * regrowMult;
  field.rebuild();
  return { felled: true, wood: 2 + Math.floor(Math.random() * 3) };
}

// A boulder doesn't topple — it shudders, drops apart and is quarried away.
function breakRock(field, t) {
  const shards = treeCopy(field, t);
  field.parent.add(shards);
  const t0 = performance.now(), DUR = 900;
  const step = () => {
    const k = Math.min(1, (performance.now() - t0) / DUR);
    shards.position.y = t.gy - k * 1.6;
    shards.scale.setScalar(Math.max(0.01, 1 - k));
    shards.rotation.y = k * 1.2;
    if (k < 1) requestAnimationFrame(step);
    else shards.parent?.remove(shards);
  };
  requestAnimationFrame(step);
  t.hp = null;
  t.felledUntil = Date.now() + (REGROW_MIN * 1.5 + Math.random() * REGROW_SPAN) * regrowMult;
  field.rebuild();
  return { felled: true, stone: 2 + Math.floor(Math.random() * 3) };
}

// Bring back anything whose regrow timer has run out. Cheap to call often.
export function regrowTrees() {
  const now = Date.now();
  let any = false;
  for (const f of fields) {
    let changed = false;
    for (const t of f.trees) {
      if (t.felledUntil && now >= t.felledUntil) { t.felledUntil = null; changed = true; }
    }
    if (changed) { f.rebuild(); any = true; }
  }
  return any;
}

// Raycast the scenery trees at a screen point -> { field, index, point } | null
export function pickTree(farm, clientX, clientY) {
  const dom = farm.renderer.domElement;
  const r = dom.getBoundingClientRect();
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, farm.camera);
  const meshes = fields.flatMap((f) => f.meshes);
  const hits = ray.intersectObjects(meshes, false);
  for (const h of hits) {
    const f = h.object.userData.treeField;
    const map = h.object.userData.treeMap;
    if (f && map && h.instanceId != null) return { field: f, index: map[h.instanceId], point: h.point };
  }
  return null;
}

export function dumpTrees() {
  return fields.map((f) => ({
    name: f.name || 'trees',
    count: f.trees.length,
    trees: f.trees.map((t) => ({
      x: +t.x.toFixed(1), z: +t.z.toFixed(1), gy: +t.gy.toFixed(2),
      s: +t.s.toFixed(2), ry: +t.ry.toFixed(2), alt: t.alt ? 1 : 0,
      ...(t.hp != null ? { hp: t.hp } : {}), ...(t.felledUntil ? { felled: 1 } : {}),
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
  hud.style.cssText = 'position:fixed;left:12px;bottom:300px;z-index:9999;background:rgba(12,26,14,.88);' +
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
    e.stopImmediatePropagation(); e.preventDefault();
    sel = hit;
    dragging = true;
    farm.controls.enabled = false;
    showMarker();
    say(describe());
  };

  const onMove = (e) => {
    if (!dragging || !sel) return;
    e.stopImmediatePropagation();
    const g = groundAt(e, sel.field);
    if (!g) return;
    const t = sel.field.trees[sel.index];
    t.x = g.x; t.z = g.z; t.gy = g.y;
    sel.field.rebuild();
    showMarker();
    say(describe());
  };

  const onUp = () => {
    if (dragging && sel) sel.field.save(); // keep what you just arranged
    dragging = false;
    farm.controls.enabled = true;
  };

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
      field.save();
      sel = { field, index: field.trees.length - 1 };
      showMarker();
      e.preventDefault(); e.stopImmediatePropagation();
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
      sel.field.save();
      sel = null;
      showMarker();
      e.preventDefault(); e.stopImmediatePropagation();
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
      e.preventDefault(); e.stopImmediatePropagation();
      sel.field.rebuild();
      sel.field.save();
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
