import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { pointOf, SCALE_MIN, SCALE_MAX } from './space_doc.js';
import { transformCapabilities } from './transforms.js';
import { createPlacementPreview } from './placement_preview.js';
import { createObjectDrag, TURN_SNAP } from './object_drag.js';

const tabFor = { pieces: 'structures', trees: 'trees', rocks: 'rocks', people: 'people', spawns: 'monsters', markers: 'markers' };
const idFor = e => e.model || e.species || e.kind || e.id || e.role;
const degrees = radians => radians * 180 / Math.PI;
const consume = event => { event.preventDefault?.(); event.stopImmediatePropagation?.(); };

/** Body drags and scale handles share a preview and one commit at release. */
export function createObjectHandles({ ctx, editor, parent, changed }) {
  const scene = ctx.sc?.scene, camera = ctx.sc?.camera, canvas = ctx.sc?.renderer?.domElement;
  if (!scene || !camera || !canvas) return null;
  const control = new TransformControls(camera, canvas); control.disconnect();
  const helper = control.getHelper(), proxy = new THREE.Object3D();
  helper.name = 'editor-object-handles'; proxy.name = 'editor-transform-target';
  scene.add(helper, proxy); control.setSize(.85); control.detach();
  const toolbar = document.createElement('div'); toolbar.className = 'object-tools';
  Object.assign(toolbar.style, { position: 'fixed', pointerEvents: 'auto', display: 'none', flexDirection: 'column', gap: '8px', padding: '8px', borderRadius: '12px', background: '#191610f5', boxShadow: '0 4px 20px #0008', transform: 'translate(-50%, -100%)', color: '#c7bba0', font: '12px system-ui' });
  toolbar.setAttribute('aria-label', 'Selected object controls'); parent.appendChild(toolbar);
  const row = document.createElement('div'); Object.assign(row.style, { display: 'flex', gap: '4px' }); toolbar.appendChild(row);
  const hint = document.createElement('div'); Object.assign(hint.style, { textAlign: 'center', fontSize: '11px', fontVariantNumeric: 'tabular-nums' }); toolbar.appendChild(hint);
  const buttons = new Map(), turnButtons = [];
  let enabled = false, selected = null, entry = null, mode = 'translate', preview = null, dragStart = null, direct = null, pointerId = null, cancelled = false, moved = false;
  const screen = new THREE.Vector3(), pointer = { x: 0, y: 0, button: 0 };
  const height = (x, z) => ctx.runtime.heightAt(x, z);
  const dragging = () => !!direct || control.dragging;
  const bodySelectable = () => !!tabFor[selected?.list];
  function configureControl() {
    const handleMode = bodySelectable() ? 'scale' : mode;
    control.setMode(handleMode); control.setSpace(handleMode === 'scale' ? 'local' : 'world');
    control.showX = handleMode !== 'rotate'; control.showZ = handleMode !== 'rotate'; control.showY = handleMode !== 'translate';
    control.showXY = false; control.showYZ = false; control.showXZ = handleMode === 'translate'; control.showE = false; control.showXYZE = false;
    helper.visible = mode === 'scale' || !bodySelectable();
  }
  function updateHint() {
    if (selected && !bodySelectable()) { hint.textContent = 'Drag a handle to adjust the selection · Escape cancels'; return; }
    hint.textContent = mode === 'scale' ? 'Drag a cube to resize · Escape cancels'
      : mode === 'rotate' || direct?.rotate ? `Drag left or right · ${Math.round(((degrees(proxy.rotation.y) % 360) + 360) % 360)}° · Shift snaps`
        : 'Drag the object along the ground · Shift turns';
  }
  function modeTo(next) {
    if (dragging()) return;
    mode = next;
    configureControl();
    for (const [id, button] of buttons) {
      button.setAttribute('aria-pressed', String(id === mode));
      button.style.color = id === mode ? '#f2dc9c' : '#c7bba0';
      button.style.background = id === mode ? '#c9a44a25' : 'transparent';
    }
    updateHint();
  }
  function button(label, title, action) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.title = title; b.setAttribute('aria-label', title);
    Object.assign(b.style, { minHeight: '40px', minWidth: '56px', padding: '0 8px', font: '12px system-ui', border: '0', borderRadius: '4px', cursor: 'pointer', color: '#c7bba0', background: 'transparent' });
    b.addEventListener('pointerdown', e => e.preventDefault());
    b.addEventListener('click', () => { if (!b.disabled) action(); }); row.appendChild(b); return b;
  }
  for (const [id, label] of [['translate', 'Move'], ['rotate', 'Rotate'], ['scale', 'Scale']]) {
    buttons.set(id, button(label, label, () => modeTo(id)));
  }
  for (const [sign, label, title] of [[-1, '↶ 15°', 'Turn left 15 degrees'], [1, '↷ 15°', 'Turn right 15 degrees']]) {
    const b = button(label, title, () => {
      if (dragging() || !entry) return;
      editor.transformSelected({ yaw: (entry.yaw || 0) + sign * TURN_SNAP }); sync(); changed();
    });
    if (sign === -1) b.style.marginLeft = '8px'; turnButtons.push(b);
  }
  function clearPreview() { if (preview) { scene.remove(preview.group); preview.dispose(); preview = null; } }
  function sync() {
    if (dragging()) return;
    selected = editor.selection(); entry = selected && editor.doc?.at(selected);
    const point = entry && pointOf(selected.list, entry);
    if (!enabled || !point) { control.detach(); toolbar.style.display = 'none'; entry = null; return; }
    const cap = transformCapabilities(selected.list);
    buttons.get('rotate').disabled = !cap.rotate; buttons.get('scale').disabled = !cap.scale;
    for (const b of turnButtons) b.disabled = !cap.rotate;
    for (const b of [...buttons.values(), ...turnButtons]) b.style.opacity = b.disabled ? '.35' : '1';
    if (mode === 'rotate' && !cap.rotate || mode === 'scale' && !cap.scale) modeTo('translate');
    const x = editor.space.at.x + point.x, z = editor.space.at.z + point.z;
    proxy.position.set(x, height(x, z) + .2, z); proxy.rotation.set(0, (entry.yaw || 0) * Math.PI / 180, 0); proxy.scale.setScalar(entry.scale ?? 1);
    control.attach(proxy); configureControl(); updateHint(); updateScreen();
  }
  function updateScreen() {
    if (!entry || !enabled) return;
    screen.copy(proxy.position).project(camera);
    const rect = canvas.getBoundingClientRect();
    toolbar.style.display = screen.z > 1 || screen.z < -1 || Math.abs(screen.x) > 1 || Math.abs(screen.y) > 1 ? 'none' : 'flex';
    const half = (toolbar.offsetWidth || 348) / 2 + 8;
    toolbar.style.left = `${Math.round(Math.max(rect.left + half, Math.min(rect.right - half, rect.left + (screen.x + 1) * rect.width / 2)))}px`;
    toolbar.style.top = `${Math.round(Math.max(rect.top + (toolbar.offsetHeight || 82) + 8, rect.top + (1 - screen.y) * rect.height / 2 - 78))}px`;
  }
  function readPointer(event) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = (event.clientX - rect.left) / rect.width * 2 - 1;
    pointer.y = -(event.clientY - rect.top) / rect.height * 2 + 1; pointer.button = event.button;
    camera.updateMatrixWorld(); helper.updateMatrixWorld(true); return pointer;
  }
  function start() {
    cancelled = false; moved = false;
    dragStart = { entry, space: editor.space, selection: { ...selected }, cursor: canvas.style.cursor };
  }
  function showPreview() {
    if (!preview && tabFor[selected.list]) {
      preview = createPlacementPreview(tabFor[selected.list], idFor(entry), { scale: entry.scale ?? 1, name: entry.name }); scene.add(preview.group);
    }
    if (preview) { preview.group.scale.setScalar(proxy.scale.x / (entry.scale ?? 1)); preview.set(proxy.position.x, proxy.position.z, proxy.rotation.y, height); }
    updateHint(); updateScreen();
  }
  function finish() {
    const current = editor.selection();
    if (!cancelled && moved && dragStart && current?.list === dragStart.selection.list && current?.index === dragStart.selection.index && editor.space === dragStart.space && editor.doc.at(dragStart.selection) === dragStart.entry) {
      const p = pointOf(selected.list, entry), x = proxy.position.x - editor.space.at.x, z = proxy.position.z - editor.space.at.z;
      const yaw = ((degrees(proxy.rotation.y) % 360) + 360) % 360;
      if (Math.hypot(x - p.x, z - p.z) > .01 || Math.abs(yaw - (entry.yaw || 0)) > .01 || Math.abs(proxy.scale.x - (entry.scale ?? 1)) > .001) {
        editor.transformSelected({ x, z, yaw, scale: proxy.scale.x });
      }
    }
    clearPreview(); if (dragStart) canvas.style.cursor = dragStart.cursor;
    dragStart = null;
    try { if (pointerId != null) canvas.releasePointerCapture?.(pointerId); } catch { /* capture already ended */ }
    pointerId = null;
  }
  function capture(event) {
    pointerId = event.pointerId;
    try { canvas.setPointerCapture?.(pointerId); } catch { /* window still owns pointer-up */ }
    consume(event);
  }
  function beginDrag(event, grab) {
    if (!enabled || !entry || event.button !== 0 || dragging()) return false;
    const rotate = (mode === 'rotate' || event.shiftKey) && transformCapabilities(selected.list).rotate;
    start();
    direct = { rotate, gesture: createObjectDrag({ camera, canvas, heightAt: height, grab, event, rotate, origin: { x: proxy.position.x, z: proxy.position.z, yaw: degrees(proxy.rotation.y), scale: proxy.scale.x } }) };
    canvas.style.cursor = rotate ? 'ew-resize' : 'grabbing'; capture(event); return true;
  }
  control.addEventListener('mouseDown', start);
  control.addEventListener('objectChange', () => {
    moved = true; proxy.position.y = height(proxy.position.x, proxy.position.z) + .2;
    proxy.scale.setScalar(Math.max(SCALE_MIN, Math.min(SCALE_MAX, proxy.scale.x))); showPreview();
  });
  control.addEventListener('mouseUp', finish);
  function onDown(event) {
    if (!enabled || !entry || event.button !== 0 || mode !== 'scale' && bodySelectable() || dragging()) return false;
    const p = readPointer(event); control.pointerHover(p);
    if (!control.axis) return false;
    if (mode === 'scale') control.axis = 'XYZ';
    control.pointerDown(p);
    if (!control.dragging) return false;
    capture(event); return true;
  }
  function onMove(event) {
    if (!enabled || !entry) return false;
    if (dragging() && pointerId != null && event.pointerId !== pointerId) return false;
    if (direct) {
      const next = direct.gesture.update(event);
      if (next) { moved = true; proxy.position.set(next.x, height(next.x, next.z) + .2, next.z); proxy.rotation.y = next.yaw * Math.PI / 180; showPreview(); }
      consume(event); return true;
    }
    if (mode !== 'scale' && bodySelectable()) return false;
    const p = readPointer(event);
    if (!control.dragging) { control.pointerHover(p); return false; }
    p.button = -1; control.pointerMove(p); consume(event); return true;
  }
  function onUp(event) {
    if (!dragging() || event.button !== 0 || pointerId != null && event.pointerId !== pointerId) return false;
    if (direct) { direct = null; finish(); } else control.pointerUp({ button: 0 });
    consume(event); sync(); changed(); return true;
  }
  function cancel() {
    if (!dragging()) return;
    cancelled = true;
    if (direct) { direct = null; finish(); } else control.pointerUp({ button: 0 });
    sync();
  }
  const cancelEvent = () => { cancel(); changed(); };
  const lostCapture = e => { if (dragging() && e.pointerId === pointerId) cancelEvent(); };
  window.addEventListener('pointercancel', cancelEvent); window.addEventListener('blur', cancelEvent); canvas.addEventListener('lostpointercapture', lostCapture);
  modeTo('translate');
  return { control, proxy, toolbar, sync, updateScreen, beginDrag, onDown, onMove, onUp, cancel,
    get dragging() { return dragging(); },
    setLive(value) { enabled = value; if (!value) cancel(); sync(); },
    dispose() { cancel(); clearPreview(); control.dispose(); scene.remove(helper, proxy); toolbar.remove(); window.removeEventListener('pointercancel', cancelEvent); window.removeEventListener('blur', cancelEvent); canvas.removeEventListener('lostpointercapture', lostCapture); },
  };
}
