import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { pointOf, SCALE_MIN, SCALE_MAX } from './space_doc.js';
import { transformCapabilities } from './transforms.js';
import { createPlacementPreview } from './placement_preview.js';

const tabFor = { pieces: 'structures', trees: 'trees', rocks: 'rocks', people: 'people', spawns: 'monsters', markers: 'markers' };
const idFor = e => e.model || e.species || e.kind || e.id || e.role;

/** TransformControls owns the axes; the editor owns a single commit at release. */
export function createObjectHandles({ ctx, editor, parent, changed }) {
  const scene = ctx.sc?.scene, camera = ctx.sc?.camera, canvas = ctx.sc?.renderer?.domElement;
  if (!scene || !camera || !canvas) return null;
  const control = new TransformControls(camera, canvas); control.disconnect();
  const helper = control.getHelper(), proxy = new THREE.Object3D();
  helper.name = 'editor-object-handles'; proxy.name = 'editor-transform-target';
  scene.add(helper, proxy); control.setSize(.85); control.detach();
  const toolbar = document.createElement('div'); toolbar.className = 'object-tools'; toolbar.style.display = 'none';
  Object.assign(toolbar.style, { position: 'fixed', pointerEvents: 'auto', display: 'none', gap: '3px', padding: '4px', borderRadius: '6px', background: '#191610f5', boxShadow: '0 4px 20px #0008', transform: 'translate(-50%, -100%)' });
  toolbar.setAttribute('aria-label', 'Selected object controls'); parent.appendChild(toolbar);
  const buttons = new Map();
  let enabled = false, selected = null, entry = null, mode = 'translate', preview = null, dragStart = null, pointerId = null, cancelled = false, moved = false;
  const screen = new THREE.Vector3(), pointer = { x: 0, y: 0, button: 0 };
  const height = (x, z) => ctx.runtime.heightAt(x, z);
  function modeTo(next) {
    mode = next; control.setMode(next); control.setSpace(next === 'scale' ? 'local' : 'world');
    control.showX = next !== 'rotate'; control.showZ = next !== 'rotate'; control.showY = next !== 'translate';
    control.showXY = false; control.showYZ = false; control.showXZ = next === 'translate'; control.showE = false; control.showXYZE = false;
    for (const [id, button] of buttons) { button.setAttribute('aria-pressed', String(id === mode)); button.style.color = id === mode ? '#f2dc9c' : '#c7bba0'; button.style.background = id === mode ? '#c9a44a25' : 'transparent'; }
  }
  for (const [id, label] of [['translate', 'Move'], ['rotate', 'Rotate'], ['scale', 'Scale']]) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
    Object.assign(button.style, { minHeight: '40px', minWidth: '56px', font: '12px system-ui', border: '0', borderRadius: '3px', cursor: 'pointer' });
    button.addEventListener('click', () => modeTo(id)); toolbar.appendChild(button); buttons.set(id, button);
  }
  function clearPreview() { if (preview) { scene.remove(preview.group); preview.dispose(); preview = null; } }
  function sync() {
    if (control.dragging) return;
    selected = editor.selection(); entry = selected && editor.doc?.at(selected);
    const point = entry && pointOf(selected.list, entry);
    if (!enabled || !point) { control.detach(); toolbar.style.display = 'none'; entry = null; return; }
    const cap = transformCapabilities(selected.list);
    buttons.get('rotate').disabled = !cap.rotate; buttons.get('scale').disabled = !cap.scale;
    for (const button of buttons.values()) button.style.opacity = button.disabled ? '.35' : '1';
    if (mode === 'rotate' && !cap.rotate || mode === 'scale' && !cap.scale) modeTo('translate');
    const x = editor.space.at.x + point.x, z = editor.space.at.z + point.z;
    proxy.position.set(x, height(x, z) + .2, z); proxy.rotation.set(0, (entry.yaw || 0) * Math.PI / 180, 0); proxy.scale.setScalar(entry.scale ?? 1);
    control.attach(proxy); updateScreen();
  }
  function updateScreen() {
    if (!entry || !enabled) return;
    screen.copy(proxy.position).project(camera);
    const rect = canvas.getBoundingClientRect();
    toolbar.style.display = screen.z > 1 || screen.z < -1 || Math.abs(screen.x) > 1 || Math.abs(screen.y) > 1 ? 'none' : 'flex';
    toolbar.style.left = `${Math.round(rect.left + (screen.x + 1) * rect.width / 2)}px`;
    toolbar.style.top = `${Math.round(rect.top + (1 - screen.y) * rect.height / 2 - 78)}px`;
  }
  function readPointer(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = (event.clientX - rect.left) / rect.width * 2 - 1;
    pointer.y = -(event.clientY - rect.top) / rect.height * 2 + 1; pointer.button = event.button;
    camera.updateMatrixWorld(); helper.updateMatrixWorld(true); return pointer;
  }
  const consume = event => { event.preventDefault?.(); event.stopImmediatePropagation?.(); };
  control.addEventListener('mouseDown', () => {
    cancelled = false; moved = false; dragStart = { entry, space: editor.space, selection: { ...selected } };
    const tab = tabFor[selected.list];
    if (tab) { preview = createPlacementPreview(tab, idFor(entry), { scale: entry.scale ?? 1, name: entry.name }); preview.set(proxy.position.x, proxy.position.z, proxy.rotation.y, height); scene.add(preview.group); }
  });
  control.addEventListener('objectChange', () => {
    moved = true;
    proxy.position.y = height(proxy.position.x, proxy.position.z) + .2;
    const size = Math.max(SCALE_MIN, Math.min(SCALE_MAX, proxy.scale.x)); proxy.scale.setScalar(size);
    if (preview) {
      preview.group.scale.setScalar(size / (entry.scale ?? 1));
      preview.set(proxy.position.x, proxy.position.z, proxy.rotation.y, height);
    }
    updateScreen();
  });
  control.addEventListener('mouseUp', () => {
    if (!cancelled && moved && dragStart && editor.space === dragStart.space && editor.doc.at(dragStart.selection) === dragStart.entry) {
      editor.transformSelected({ x: proxy.position.x - editor.space.at.x, z: proxy.position.z - editor.space.at.z, yaw: proxy.rotation.y * 180 / Math.PI, scale: proxy.scale.x });
    }
    clearPreview(); dragStart = null;
  });
  function onDown(event) {
    if (!enabled || !entry || event.button !== 0) return false;
    const p = readPointer(event); control.pointerHover(p);
    if (!control.axis) return false;
    // Every resize keeps the low-poly model's proportions, whichever cube is grabbed.
    if (mode === 'scale') control.axis = 'XYZ';
    control.pointerDown(p); pointerId = event.pointerId;
    try { canvas.setPointerCapture?.(pointerId); } catch { /* the window still owns pointer-up after capture ends */ }
    consume(event); return true;
  }
  function onMove(event) {
    if (!enabled || !entry) return false;
    const p = readPointer(event);
    if (!control.dragging) { control.pointerHover(p); return false; }
    p.button = -1; control.pointerMove(p); consume(event); return true;
  }
  function onUp(event) {
    if (!control.dragging) return false;
    control.pointerUp({ button: 0 });
    try { canvas.releasePointerCapture?.(pointerId); } catch { /* capture may have ended outside the canvas */ }
    pointerId = null; consume(event); sync(); changed(); return true;
  }
  function cancel() { if (control.dragging) { cancelled = true; control.pointerUp({ button: 0 }); clearPreview(); sync(); } }
  const cancelEvent = () => { cancel(); changed(); };
  window.addEventListener('pointercancel', cancelEvent); window.addEventListener('blur', cancelEvent);
  modeTo('translate');
  return { control, proxy, toolbar, sync, updateScreen, onDown, onMove, onUp, cancel,
    get dragging() { return control.dragging; },
    setLive(value) { enabled = value; if (!value) cancel(); sync(); },
    dispose() { cancel(); clearPreview(); control.dispose(); scene.remove(helper, proxy); toolbar.remove(); window.removeEventListener('pointercancel', cancelEvent); window.removeEventListener('blur', cancelEvent); },
  };
}
