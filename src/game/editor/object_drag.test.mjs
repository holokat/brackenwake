import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { createObjectDrag } from './object_drag.js';
import { createObjectHandles } from './object_handles.js';
import { createEditor } from './editor.js';
import { emptySpace } from '../../mmo/spaces/index.js';
import { pickEditorObject } from './pick_object.js';
import { registerProp, forgetProp } from '../../world/plan_models.js';

class Element extends EventTarget {
  constructor() { super(); this.style = {}; this.children = []; this.attributes = {}; this.captured = null; }
  appendChild(child) { this.children.push(child); child.parent = this; return child; }
  setAttribute(k, v) { this.attributes[k] = v; }
  remove() { this.parent.children = this.parent.children.filter(c => c !== this); }
  setPointerCapture(id) { this.captured = id; }
  releasePointerCapture() { this.captured = null; }
  getBoundingClientRect() { return { left: 0, top: 0, right: 1000, bottom: 800, width: 1000, height: 800 }; }
}
function rig(heightAt = () => 0) {
  const canvas = new Element(), camera = new THREE.PerspectiveCamera(50, 1.25, .1, 1000);
  camera.position.set(18, 24, 30); camera.lookAt(0, 1, 0); camera.updateMatrixWorld();
  const event = (x, y, more = {}) => ({ clientX: x, clientY: y, pointerId: 1, button: 0, shiftKey: false, preventDefault() {}, stopImmediatePropagation() {}, ...more });
  const project = point => { const p = point.clone().project(camera); return event((p.x + 1) * 500, (1 - p.y) * 400); };
  return { canvas, camera, heightAt, event, project };
}

for (const [name, heightAt] of [['flat ground', () => 0], ['a slope', (x, z) => .25 * x + .08 * z], ['rolling terrain', (x, z) => Math.sin(x * .15) + Math.cos(z * .2)]]) {
  test(`a roof grab follows ${name} without snapping the origin to the pointer`, () => {
    const r = rig(heightAt), origin = { x: 0, z: 0, yaw: 27, scale: 1.3 };
    const grab = new THREE.Vector3(1, heightAt(1, 1) + 3, 1), first = r.project(grab);
    const gesture = createObjectDrag({ ...r, origin, grab, event: first });
    assert.equal(gesture.update(first), null);
    assert.equal(gesture.update(r.event(first.clientX + 2, first.clientY + 2)), null);
    const next = gesture.update(r.project(new THREE.Vector3(8, heightAt(8, 5) + 3, 5)));
    assert(Math.abs(next.x - 7) < .06, `${next.x} preserves the horizontal grab offset`);
    assert(Math.abs(next.z - 4) < .06, `${next.z} preserves the depth grab offset`);
    assert.equal(next.yaw, 27); assert.equal(next.scale, 1.3);
    assert.equal(gesture.update(r.event(500, -5000)), null, 'the sky cannot move the selection');
    assert(gesture.update(r.project(new THREE.Vector3(4, heightAt(4, 4) + 3, 4))), 'the drag recovers after returning to terrain');
  });
}

test('horizontal rotation is independent of terrain, and Shift snaps relative to the starting angle', () => {
  const r = rig(), origin = { x: 0, z: 0, yaw: 27, scale: 1 };
  const gesture = createObjectDrag({ ...r, origin, grab: new THREE.Vector3(), event: r.event(400, 400), rotate: true });
  assert.equal(gesture.update(r.event(480, -5000)).yaw, 67);
  assert.equal(gesture.update(r.event(480, 400, { shiftKey: true })).yaw, 72);
  assert.equal(gesture.update(r.event(320, 400)).yaw, -13);
});

test('real object handles commit one drag, undo/redo, cancel, pointer ownership, buttons and capability limits', async () => {
  const oldDocument = globalThis.document, oldWindow = globalThis.window;
  globalThis.document = { createElement: () => new Element() }; globalThis.window = new EventTarget();
  const geo = new THREE.BoxGeometry(2, 2, 2), mat = new THREE.MeshBasicMaterial();
  const body = new THREE.Group(); body.add(new THREE.Mesh(geo, mat)); registerProp('cottage_a', body);
  const r = rig((x, z) => x * .25 + z * .08), scene = new THREE.Scene(), editor = createEditor();
  const space = emptySpace('body_drag_test', 'Body drag test', 0, 0, 60);
  space.pieces.push({ model: 'cottage_a', x: 0, z: 0, yaw: 27 });
  space.spawns.push({ kind: 'wolf', x: 12, z: 4 });
  space.runs.push({ model: 'field_gate', from: { x: -4, z: -2 }, to: { x: 4, z: -2 } });
  editor.open(space); editor.select({ list: 'pieces', index: 0 });
  const handles = createObjectHandles({ ctx: { sc: { camera: r.camera, scene, renderer: { domElement: r.canvas } }, runtime: { heightAt: r.heightAt } }, editor, parent: new Element(), changed() {} });
  const select = () => { editor.select({ list: 'pieces', index: 0 }); handles.sync(); };
  const first = r.project(new THREE.Vector3(0, 2, 0));
  // The same bounds picker used by the Hand tool supplies the grabbed point.
  const ray = new THREE.Raycaster(); ray.setFromCamera(new THREE.Vector2(first.clientX / 500 - 1, 1 - first.clientY / 400), r.camera);
  const hit = pickEditorObject(ray.ray, [editor.space], r.heightAt);
  assert(hit); const grab = ray.ray.at(hit.distance, new THREE.Vector3());
  try {
    handles.setLive(true);
    assert.equal(handles.onDown(first), false, 'Move has no tiny axis to intercept a body click');
    handles.beginDrag(first, grab); handles.onUp(first);
    assert.equal(editor.doc.depth, 0, 'clicking creates no undo entry');
    assert.equal(r.canvas.captured, null);
    handles.beginDrag(first, grab);
    for (let i = 1; i <= 10; i++) handles.onMove(r.event(first.clientX + i * 8, first.clientY + i * 2));
    assert.equal(editor.doc.depth, 0, 'the document stays unchanged until release');
    assert.equal(handles.proxy.position.y, r.heightAt(handles.proxy.position.x, handles.proxy.position.z) + .2);
    assert.equal(handles.onUp(r.event(700, 500, { pointerId: 2 })), false, 'another pointer cannot end the drag');
    handles.onUp(r.event(first.clientX + 80, first.clientY + 20));
    assert.equal(editor.doc.depth, 1); assert.equal(handles.dragging, false);
    const after = JSON.stringify(editor.space.pieces[0]);
    assert.notEqual(editor.space.pieces[0].x, 0);
    editor.undo(); assert.deepEqual(editor.space.pieces[0], space.pieces[0]);
    editor.redo(); assert.equal(JSON.stringify(editor.space.pieces[0]), after);
    select(); const depth = editor.doc.depth;
    handles.beginDrag(first, grab); handles.onMove(r.event(first.clientX + 70, first.clientY)); handles.cancel();
    assert.equal(editor.doc.depth, depth); assert.equal(JSON.stringify(editor.space.pieces[0]), after);
    assert.equal(r.canvas.captured, null); assert.equal(scene.children.some(c => c.name.startsWith('placement-preview:')), false);
    const buttons = handles.toolbar.children[0].children;
    buttons.find(b => b.textContent === 'Rotate').dispatchEvent(new Event('click'));
    handles.beginDrag(first, grab); handles.onMove(r.event(first.clientX + 90, first.clientY)); handles.onUp(r.event(first.clientX + 90, first.clientY));
    assert.equal(editor.space.pieces[0].yaw, 72); assert.equal(editor.doc.depth, depth + 1);
    buttons.find(b => b.textContent === '↷ 15°').dispatchEvent(new Event('click'));
    assert.equal(editor.space.pieces[0].yaw, 87);
    buttons.find(b => b.textContent === '↶ 15°').dispatchEvent(new Event('click'));
    assert.equal(editor.space.pieces[0].yaw, 72);
    handles.beginDrag(first, grab); handles.onMove(r.event(first.clientX + 70, first.clientY));
    window.dispatchEvent(new Event('blur')); assert.equal(editor.space.pieces[0].yaw, 72); assert.equal(handles.dragging, false);
    editor.select({ list: 'spawns', index: 0 }); handles.sync();
    assert(buttons.find(b => b.textContent === 'Rotate').disabled); assert(buttons.find(b => b.textContent === 'Scale').disabled);
    assert.equal(buttons.find(b => b.textContent === 'Move').attributes['aria-pressed'], 'true');
    editor.select({ list: 'runs', index: 0 }); handles.sync();
    assert.equal(handles.control.mode, 'translate'); assert.equal(handles.control.getHelper().visible, true, 'point-based runs keep their existing handles');
    buttons.find(b => b.textContent === 'Rotate').dispatchEvent(new Event('click'));
    assert.equal(handles.control.mode, 'rotate'); assert.equal(handles.control.showY, true); assert.equal(handles.control.showX, false);
    select(); assert.equal(handles.control.getHelper().visible, false, 'body rotation remains free of the ring');
    handles.setLive(false); assert.equal(handles.beginDrag(first, grab), false);
  } finally {
    handles.dispose(); forgetProp('cottage_a'); geo.dispose(); mat.dispose();
    globalThis.document = oldDocument; globalThis.window = oldWindow;
  }
});
