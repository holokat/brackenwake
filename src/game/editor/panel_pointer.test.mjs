import assert from 'node:assert/strict';
import * as THREE from 'three';
import { makeDom } from './test_dom.mjs';
import { emptySpace } from '../../mmo/spaces/index.js';
import { registerProp, forgetProp } from '../../world/plan_models.js';

globalThis.document = makeDom();
globalThis.window = {
  innerWidth: 1000, innerHeight: 800, listeners: {},
  addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); },
  removeEventListener(name, fn) { this.listeners[name] = (this.listeners[name] || []).filter(f => f !== fn); },
  fire(name, ev) { for (const fn of [...(this.listeners[name] || [])]) fn(ev); },
};
const { panel } = await import('./panel.js');
const canvas = document.createElement('canvas'), camera = new THREE.PerspectiveCamera(50, 1.25, .1, 1000), scene = new THREE.Scene();
camera.position.set(18, 24, 30); camera.lookAt(0, 1, 0); camera.updateMatrixWorld();
const ctx = { sc: { scene, camera, renderer: { domElement: canvas } }, runtime: { heightAt: (x, z) => x * .15 + z * .05 }, hud: { log() {} } };
const geo = new THREE.BoxGeometry(4, 4, 4), mat = new THREE.MeshBasicMaterial(), body = new THREE.Group(); body.add(new THREE.Mesh(geo, mat)); registerProp('cottage_a', body);
function event(x, y, more={}) { return { clientX:x, clientY:y, pointerId:1, button:0, target:canvas, key:'', preventDefault(){this.prevented=true;}, stopPropagation(){this.stopped=true;}, stopImmediatePropagation(){this.stopped=true;}, ...more }; }
function at(x=0,z=0) { const p = new THREE.Vector3(x, ctx.runtime.heightAt(x,z)+2, z).project(camera); return event((p.x+1)*500,(1-p.y)*400); }
try {
  panel.build(document.createElement('div'), ctx);
  const ed=panel._ed, space=emptySpace('pointer_test','Pointer test',0,0,60);
  space.pieces.push({model:'cottage_a',x:0,z:0}); ed.open(space); panel._setLive(true); panel._drawAll();
  const down=at(); canvas.fire('pointerdown',down);
  assert.equal(ed.selection().list,'pieces'); assert(down.stopped,'the object press cannot reach camera or gameplay input');
  assert(panel._handles.dragging,'the very first body press starts a drag without selecting a handle');
  for(let i=1;i<=10;i++) canvas.fire('pointermove',event(down.clientX+i*8,down.clientY+i));
  assert.equal(ed.doc.depth,0); window.fire('pointerup',event(down.clientX+80,down.clientY+10));
  assert.equal(ed.doc.depth,1); assert.notEqual(ed.space.pieces[0].x,0); assert.equal(panel._handles.dragging,false);
  window.fire('keydown',event(0,0,{key:'z',metaKey:true})); assert.deepEqual(ed.space.pieces[0],space.pieces[0]);
  const shift=at(); shift.shiftKey=true; canvas.fire('pointerdown',shift);
  canvas.fire('pointermove',event(shift.clientX+83,shift.clientY,{shiftKey:true})); window.fire('pointerup',event(shift.clientX+83,shift.clientY,{shiftKey:true}));
  assert.equal(ed.space.pieces[0].yaw,45,'Shift + body drag reaches rotation through the real Hand tool');
  const depth=ed.doc.depth, before=JSON.stringify(ed.space.pieces[0]);
  const cancel=at(); canvas.fire('pointerdown',cancel); canvas.fire('pointermove',event(cancel.clientX-60,cancel.clientY));
  window.fire('keydown',event(0,0,{key:'Escape'})); window.fire('pointerup',event(cancel.clientX-60,cancel.clientY));
  assert.equal(ed.doc.depth,depth); assert.equal(JSON.stringify(ed.space.pieces[0]),before);
  assert.equal(panel._handles.dragging,false); assert.equal(canvas.captured,null);
  const right=at(); right.button=2; canvas.fire('pointerdown',right);
  assert.equal(right.stopped,undefined,'right drag still reaches the camera');
  assert.equal(panel._handles.dragging,false);
  console.log('Real editor panel: first-press body drag, terrain preview, one commit, undo, Shift rotation, Escape cancel and right-camera pass-through passed.');
} finally { panel.dispose(); forgetProp('cottage_a'); geo.dispose(); mat.dispose(); }
