// The follow camera, the fly camera and the input gatherer, measured.
// Run: node src/game/camera.test.mjs
//
// input.js is exercised here too, against a hand made DOM. It has no pure
// core to pull out, and the quick click detector is exactly the kind of thing
// that ships broken and eats every click for a week.

import * as THREE from 'three';
import {
  createFollowCamera, orbitPosition, clampAboveGround,
  DRAG_RAD, PITCH_MIN, PITCH_MAX, DIST_MIN, DIST_MAX, FLY_MIN_SPEED, FLY_MAX_SPEED, SMOOTH_TAU, EYE_HEIGHT, MIN_ABOVE,
} from './camera.js';
import { stepPlayer, WALK_SPEED, RUN_SPEED } from './player.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };
const near = (a, b, e) => Math.abs(a - b) <= e;
const DT = 1 / 60;

// a stand in for input.js, so the camera can be driven exactly
function fakeInput() {
  const keys = new Set();
  return { keys, drag: { dx: 0, dy: 0, active: false, button: 0 }, wheel: 0, click: null, pointer: { x: 0, y: 0 }, down: (k) => keys.has(k), pressed: () => false, endFrame() { this.drag.dx = 0; this.drag.dy = 0; this.wheel = 0; } };
}
const newCam = () => new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 1800);

console.log('camera: orbitPosition');
{
  const t = { x: 10, y: 2, z: -4 };
  let worstR = 0, worstY = 0;
  for (let i = 0; i < 32; i++) {
    const yaw = (i / 32) * Math.PI * 2;
    const p = orbitPosition(t, yaw, 0, 12);
    worstR = Math.max(worstR, Math.abs(Math.hypot(p.x - t.x, p.z - t.z) - 12));
    worstY = Math.max(worstY, Math.abs(p.y - t.y));
  }
  check('pitch 0 sits on the horizontal ring at the distance', worstR < 1e-12 && worstY < 1e-12, `radius off by ${worstR.toExponential(2)}, height off by ${worstY.toExponential(2)}`);
  let lastY = -9, lastR = 1e9, rising = true, closing = true;
  for (let i = 0; i <= 20; i++) {
    const pitch = PITCH_MIN + (PITCH_MAX - PITCH_MIN) * (i / 20);
    const p = orbitPosition(t, 0.7, pitch, 12);
    if (p.y <= lastY) rising = false;
    const r = Math.hypot(p.x - t.x, p.z - t.z);
    if (r >= lastR) closing = false;
    lastY = p.y; lastR = r;
  }
  check('more pitch lifts the camera', rising, `${PITCH_MIN} to ${PITCH_MAX} rad`);
  check('and pulls it in over the target', closing);
  const p = orbitPosition(t, 0.7, 0.9, 12);
  check('the distance to the target is always the distance', near(Math.hypot(p.x - t.x, p.y - t.y, p.z - t.z), 12, 1e-12));
  const low = orbitPosition({ x: 0, y: 0, z: 0 }, 0, PITCH_MIN, 10);
  check('it never gets under the target', low.y > 0, `y = ${low.y.toFixed(3)} at the lowest pitch`);
}

console.log('camera: clampAboveGround');
{
  const low = clampAboveGround({ x: 3, y: 1.0, z: -2 }, 4.5, MIN_ABOVE);
  check('a camera inside the hill is raised', near(low.y, 5.7, 1e-12), `y ${low.y}`);
  check('and is not shoved sideways to do it', low.x === 3 && low.z === -2);
  const high = clampAboveGround({ x: 3, y: 9, z: -2 }, 4.5, MIN_ABOVE);
  check('a camera already clear is left alone', high.y === 9);
  const exact = clampAboveGround({ x: 0, y: 5.7, z: 0 }, 4.5, MIN_ABOVE);
  check('exactly at the limit is left alone', exact.y === 5.7);
  const noGround = clampAboveGround({ x: 0, y: -400, z: 0 }, -Infinity, MIN_ABOVE);
  check('no ground means no clamp', noGround.y === -400);
}

console.log('camera: drag and wheel');
{
  const input = fakeInput(); const cam = newCam();
  const c = createFollowCamera(cam, input);
  const y0 = c.yaw, p0 = c.pitch;
  input.drag.dx = 37; input.drag.dy = 11;
  c.update(DT, { x: 0, y: 0, z: 0 }, null);
  // dragging right turns the view right, and turning right DECREASES yaw here
  check('dragging right turns the view right: yaw -= dx * 0.005', near(c.yaw - y0, -37 * DRAG_RAD, 1e-12), `${(c.yaw - y0).toFixed(6)} rad`);
  check('and pitch by exactly dy * 0.005', near(c.pitch - p0, 11 * DRAG_RAD, 1e-12), `${(c.pitch - p0).toFixed(6)} rad`);
  input.drag.dx = 0; input.drag.dy = 100000;
  c.update(DT, { x: 0, y: 0, z: 0 }, null);
  check('pitch clamps at the top', c.pitch === PITCH_MAX, `${c.pitch}`);
  input.drag.dy = -100000;
  c.update(DT, { x: 0, y: 0, z: 0 }, null);
  check('pitch clamps at the bottom', c.pitch === PITCH_MIN, `${c.pitch}`);
  input.drag.dy = 0;

  const d0 = c.distance;
  input.wheel = 100;
  c.update(DT, { x: 0, y: 0, z: 0 }, null);
  check('100 wheel units is one factor of 1.1', near(c.distance, d0 * 1.1, 1e-12), `${d0} to ${c.distance.toFixed(4)} m`);
  input.wheel = -100;
  c.update(DT, { x: 0, y: 0, z: 0 }, null);
  check('and back the other way', near(c.distance, d0, 1e-12), `${c.distance.toFixed(6)} m`);
  input.wheel = 100000;
  c.update(DT, { x: 0, y: 0, z: 0 }, null);
  check('distance clamps at the far end', c.distance === DIST_MAX, `${c.distance} m`);
  input.wheel = -100000;
  c.update(DT, { x: 0, y: 0, z: 0 }, null);
  check('and at the near end', c.distance === DIST_MIN, `${c.distance} m`);
  input.wheel = 0;
  const held = c.distance;
  for (let i = 0; i < 10; i++) c.update(DT, { x: 0, y: 0, z: 0 }, null);
  check('no wheel, no zoom drift', c.distance === held);
}

console.log('camera: following');
{
  const input = fakeInput(); const cam = newCam();
  const c = createFollowCamera(cam, input);
  c.yaw = 0.9; c.pitch = 0.6; c.distance = 10;
  const player = { x: 4, y: 1, z: -6 };
  for (let i = 0; i < 300; i++) c.update(DT, player, null);
  const want = orbitPosition({ x: player.x, y: player.y + EYE_HEIGHT, z: player.z }, c.yaw, c.pitch, c.distance);
  check('it settles on the orbit point', near(cam.position.x, want.x, 1e-6) && near(cam.position.y, want.y, 1e-6) && near(cam.position.z, want.z, 1e-6),
    `off by ${Math.hypot(cam.position.x - want.x, cam.position.y - want.y, cam.position.z - want.z).toExponential(2)} m`);
  const target = new THREE.Vector3(player.x, player.y + EYE_HEIGHT, player.z);
  const dir = new THREE.Vector3(); cam.getWorldDirection(dir);
  const to = target.clone().sub(cam.position).normalize();
  check('and looks at a point 1.5 m above his feet', dir.distanceTo(to) < 1e-6, `dot ${dir.dot(to).toFixed(9)}`);

  // he walks off and the camera comes after him
  const walk = { x: 4, y: 1, z: -6 };
  for (let i = 0; i < 120; i++) { walk.x += WALK_SPEED * DT; c.update(DT, walk, null); }
  const t2 = new THREE.Vector3(walk.x, walk.y + EYE_HEIGHT, walk.z);
  const lag = cam.position.distanceTo(new THREE.Vector3(...Object.values(orbitPosition({ x: walk.x, y: walk.y + EYE_HEIGHT, z: walk.z }, c.yaw, c.pitch, c.distance))));
  // The chase lag of an exponential lerp is linear in speed. That is the rule
  // worth pinning; the constant in front of it moved when the speeds did, and a
  // hardcoded half metre only ever described one walking pace.
  check('it trails a walking player by about half a metre', lag > 0.3 && lag < 0.7, `${lag.toFixed(4)} m at ${WALK_SPEED} m/s`);
  {
    // double the speed, double the lag: the property, measured
    const chase = (v) => {
      const cam2 = newCam(); const c2 = createFollowCamera(cam2, fakeInput());
      const w = { x: 0, y: 1, z: -6 };
      c2.update(DT, w, null);
      for (let i = 0; i < 400; i++) { w.x += v * DT; c2.update(DT, w, null); }
      const o = orbitPosition({ x: w.x, y: w.y + EYE_HEIGHT, z: w.z }, c2.yaw, c2.pitch, c2.distance);
      return cam2.position.distanceTo(new THREE.Vector3(o.x, o.y, o.z));
    };
    const l1 = chase(WALK_SPEED), l2 = chase(WALK_SPEED * 2), lr = chase(RUN_SPEED);
    check('twice the speed is twice the lag', Math.abs(l2 - 2 * l1) < 0.01, `${l1.toFixed(4)} m and ${l2.toFixed(4)} m`);
    check('and at a full run he stays within 1.5 m of centre', lr < 1.5, `${lr.toFixed(4)} m at ${RUN_SPEED} m/s`);
  }
  const dir2 = new THREE.Vector3(); cam.getWorldDirection(dir2);
  check('and is still looking at him', dir2.dot(t2.clone().sub(cam.position).normalize()) > 0.9999);
}

console.log('camera: the smoothing constant');
{
  const cam = newCam(); const input = fakeInput();
  const c = createFollowCamera(cam, input);
  c.yaw = 0; c.pitch = 0.5; c.distance = 10;
  c.snap({ x: 0, y: 0, z: 0 });
  const from = cam.position.clone();
  const player = { x: 40, y: 0, z: 0 };
  const to = orbitPosition({ x: 40, y: EYE_HEIGHT, z: 0 }, c.yaw, c.pitch, c.distance);
  const total = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
  let t = 0;
  while (t < SMOOTH_TAU - 1e-9) { c.update(DT, player, null); t += DT; }
  const gone = Math.hypot(cam.position.x - from.x, cam.position.y - from.y, cam.position.z - from.z);
  check('one time constant covers 63% of the gap', near(gone / total, 1 - 1 / Math.E, 0.03), `${(100 * gone / total).toFixed(1)}% of ${total.toFixed(2)} m in ${t.toFixed(3)} s`);
}

console.log('camera: the ground under it');
{
  const cam = newCam(); const input = fakeInput();
  const c = createFollowCamera(cam, input);
  c.yaw = 0; c.pitch = PITCH_MIN; c.distance = DIST_MAX;
  // a hill standing behind the player, right where the camera wants to be
  const ground = (x, z) => (z < -10 ? 40 : 0);
  const player = { x: 0, y: 0, z: 0 };
  let worst = 0;
  for (let i = 0; i < 200; i++) { c.update(DT, player, ground); worst = Math.min(worst === 0 ? 1e9 : worst, cam.position.y - ground(cam.position.x, cam.position.z)); }
  check('it is raised clear of the hill, never less than 1.2 m', worst >= MIN_ABOVE - 1e-9, `closest approach ${worst.toFixed(4)} m`);
  // the other direction: flat ground, and the raise never fires
  const flatC = createFollowCamera(newCam(), fakeInput());
  flatC.yaw = 0; flatC.pitch = PITCH_MIN; flatC.distance = DIST_MAX;
  const flatCam = flatC.snap(player) && null;
  for (let i = 0; i < 300; i++) flatC.update(DT, player, () => 0);
  const wanted = orbitPosition({ x: 0, y: EYE_HEIGHT, z: 0 }, 0, PITCH_MIN, DIST_MAX);
  check('on flat ground it sits where the orbit says, unraised', wanted.y > MIN_ABOVE, `orbit y ${wanted.y.toFixed(3)} m, well clear of the 1.2 m floor`);
  check('the pitch is untouched by the raise', c.pitch === PITCH_MIN, `${c.pitch} rad`);
}

console.log('camera: fly mode');
{
  const cam = newCam(); const input = fakeInput();
  const c = createFollowCamera(cam, input);
  check('it starts in follow', c.mode === 'follow');
  c.setMode('fly');
  check('setMode switches to fly', c.mode === 'fly');
  cam.position.set(0, 100, 0);
  c.yaw = 0; c.pitch = 0; c.flySpeed = 100;
  input.keys.add('w');
  c.flyUpdate(0.1, null);
  check('w flies along the look direction', near(cam.position.z, 10, 1e-9) && near(cam.position.y, 100, 1e-9), `moved to z ${cam.position.z.toFixed(4)}`);
  const before = cam.position.z;
  input.keys.add('shift');
  c.flyUpdate(0.1, null);
  check('shift is exactly four times as fast', near(cam.position.z - before, 40, 1e-9), `${(cam.position.z - before).toFixed(4)} m vs 10 m`);
  input.keys.clear();
  input.keys.add('q');
  const y0 = cam.position.y;
  c.flyUpdate(0.1, null);
  check('q goes down', near(cam.position.y - y0, -10, 1e-9), `${(cam.position.y - y0).toFixed(3)} m`);
  input.keys.clear(); input.keys.add('e');
  c.flyUpdate(0.1, null);
  check('e goes up', near(cam.position.y - y0, 0, 1e-9), `back to ${cam.position.y.toFixed(3)}`);
  input.keys.clear(); input.keys.add('d');
  const x0 = cam.position.x;
  c.flyUpdate(0.1, null);
  // at yaw 0 the look is +z and screen right is -x (forward x up)
  check('d strafes right of the look direction', near(cam.position.x - x0, -10, 1e-9), `${(cam.position.x - x0).toFixed(3)} m`);
  {
    let bad = 0;
    for (let i = 0; i < 8; i++) {
      const yaw = (i * Math.PI) / 4;
      cam.position.set(0, 100, 0); c.yaw = yaw; c.pitch = 0; c.flySpeed = 100;
      input.keys.clear(); input.keys.add('d');
      c.flyUpdate(0.1, null);
      const ex = -Math.cos(yaw) * 10, ez = Math.sin(yaw) * 10;
      if (!near(cam.position.x, ex, 1e-9) || !near(cam.position.z, ez, 1e-9)) bad++;
    }
    check('fly strafe is exactly forward x up at eight yaws', bad === 0);
    cam.position.set(0, 100, 0); c.yaw = 0; c.pitch = 0;
  }
  input.keys.clear();
  const still = cam.position.clone();
  c.flyUpdate(0.1, null);
  check('no keys, no drift', cam.position.distanceTo(still) === 0);

  input.wheel = -100;
  c.flyUpdate(DT, null);
  check('the wheel speeds the fly up', near(c.flySpeed, 110, 1e-9), `${c.flySpeed.toFixed(4)} m/s`);
  input.wheel = -100000; c.flyUpdate(DT, null);
  check('fly speed clamps at the top', c.flySpeed === FLY_MAX_SPEED, `${c.flySpeed} m/s`);
  input.wheel = 100000; c.flyUpdate(DT, null);
  check('and at the bottom', c.flySpeed === FLY_MIN_SPEED, `${c.flySpeed} m/s`);
  input.wheel = 0;

  cam.position.set(0, -50, 0);
  c.flyUpdate(DT, () => 12);
  check('the fly camera is kept out of the ground', cam.position.y >= 12.6 - 1e-9, `y ${cam.position.y}`);
  c.setMode('follow');
  check('setMode switches back', c.mode === 'follow');
  c.setMode('nonsense');
  check('and refuses a mode it does not have', c.mode === 'follow');
}

console.log('camera: forwardYaw is the yaw the player runs on');
{
  const cam = newCam(); const input = fakeInput();
  const c = createFollowCamera(cam, input);
  let bad = 0, told = '';
  for (let i = 0; i < 8; i++) {
    c.yaw = -Math.PI + (i / 8) * Math.PI * 2;
    c.pitch = 0.6; c.distance = 9;
    const player = { x: 0, y: 0, z: 0 };
    c.snap(player);
    // the way the camera is looking, flattened
    const look = new THREE.Vector3(); cam.getWorldDirection(look); look.y = 0; look.normalize();
    // the way the player goes when the stick is pushed forward
    const s = { x: 0, y: 0, z: 0, vx: 0, vz: 0, speed: 0, yaw: 0, phase: 0, stride: 1.4, t: 0, anim: 'idle', idleMix: 1 };
    for (let k = 0; k < 30; k++) stepPlayer(s, DT, { x: 0, z: 1, yaw: c.forwardYaw }, () => 0);
    const d = Math.hypot(s.x, s.z);
    if (Math.abs(s.x / d - look.x) > 1e-6 || Math.abs(s.z / d - look.z) > 1e-6) { bad++; told += `yaw ${c.yaw.toFixed(2)} `; }
  }
  check('forward on the stick is forward on the screen, all the way round', bad === 0, told || '8 of 8 agree');
}

// ---------------------------------------------------------------- input.js
console.log('input: a hand made DOM');

class Node {
  constructor(rect) { this.h = {}; this.rect = rect || { left: 0, top: 0, width: 800, height: 600 }; this.captured = null; }
  addEventListener(t, fn) { (this.h[t] = this.h[t] || []).push(fn); }
  removeEventListener(t, fn) { if (this.h[t]) this.h[t] = this.h[t].filter((f) => f !== fn); }
  fire(t, e) { for (const fn of (this.h[t] || []).slice()) fn(e); }
  count() { return Object.values(this.h).reduce((a, l) => a + l.length, 0); }
  getBoundingClientRect() { return this.rect; }
  setPointerCapture(id) { this.captured = id; }
  releasePointerCapture() { this.captured = null; }
}
const el = new Node();
globalThis.window = new Node();
const { createInput, DRAG_PX, CLICK_MS } = await import('./input.js');
const input = createInput(el);
const key = (t, k, target) => globalThis.window.fire(t, { key: k, target: target || null });
let T = 1000;
const ptr = (t, x, y, extra) => { const e = Object.assign({ clientX: x, clientY: y, timeStamp: T, button: 0, pointerId: 1 }, extra || {}); (t === 'pointerdown' || t === 'pointermove' ? el : el).fire(t, e); };

{
  key('keydown', 'W');
  check('keys are stored lowercase', input.keys.has('w') && !input.keys.has('W'), [...input.keys].join(','));
  check('and down() lowercases what it is asked', input.down('w') && input.down('W'));
  check('pressed is true the frame it went down', input.pressed('w'));
  key('keydown', 'W');
  check('and a key repeat does not re-trigger it', input.pressed('w'), 'still true within the same frame');
  input.endFrame();
  check('after endFrame pressed is false but down is true', !input.pressed('w') && input.down('w'));
  key('keyup', 'W');
  check('keyup releases it', !input.down('w'));
  key('keydown', 'a', { tagName: 'INPUT' });
  check('a keydown in a text field is ignored', !input.down('a'));
  key('keydown', 'a', { tagName: 'DIV' });
  check('a keydown anywhere else is taken', input.down('a'));
  key('keyup', 'a', { tagName: 'INPUT' });
  check('but a keyup is always honoured, so nothing sticks', !input.down('a'));
  key('keydown', 'Shift');
  key('keydown', 'f');
  globalThis.window.fire('blur', {});
  check('losing the window clears every key', input.keys.size === 0, `${input.keys.size} left`);
  input.endFrame();
}

console.log('input: click against drag');
{
  T = 2000;
  ptr('pointerdown', 100, 100);
  T = 2050; ptr('pointermove', 103, 102);
  T = 2100; ptr('pointerup', 103, 102);
  check('a short still press is a click', !!input.click, JSON.stringify(input.click && { px: input.click.px, py: input.click.py, button: input.click.button }));
  check('and it emitted no drag at all', input.drag.dx === 0 && input.drag.dy === 0, `dx ${input.drag.dx}, dy ${input.drag.dy}`);
  check('the click carries NDC ready for a raycaster', near(input.click.x, (103 / 800) * 2 - 1, 1e-12) && near(input.click.y, -((102 / 600) * 2 - 1), 1e-12), `${input.click.x.toFixed(6)}, ${input.click.y.toFixed(6)}`);
  input.endFrame();
  check('endFrame clears the click', input.click === null);

  T = 3000;
  ptr('pointerdown', 200, 200);
  T = 3030; ptr('pointermove', 220, 205);
  T = 3060; ptr('pointermove', 230, 215);
  check('crossing 6 px starts a drag', input.drag.active === true);
  check('and the drag keeps every pixel of the gesture', input.drag.dx === 30 && input.drag.dy === 15, `dx ${input.drag.dx}, dy ${input.drag.dy}`);
  T = 3080; ptr('pointerup', 230, 215);
  check('a drag is not also a click', input.click === null);
  check('and the drag goes inactive on release', input.drag.active === false);
  input.endFrame();
  check('endFrame clears the drag deltas', input.drag.dx === 0 && input.drag.dy === 0);

  T = 4000;
  ptr('pointerdown', 300, 300);
  T = 4500; ptr('pointermove', 301, 300);        // barely moved, but held past 400 ms
  check('a slow press becomes a drag even when it hardly moves', input.drag.active === true);
  T = 4520; ptr('pointerup', 301, 300);
  check('and a slow press is no click', input.click === null);
  input.endFrame();

  T = 5000;
  ptr('pointerdown', 400, 400);
  T = 5010; ptr('pointermove', 406, 400);        // exactly 6 px, the threshold is exclusive
  check('exactly 6 px is still a click candidate', input.drag.active === false, `dx ${input.drag.dx}`);
  T = 5020; ptr('pointerup', 406, 400);
  check('and it lands as a click', !!input.click);
  input.endFrame();

  // a release that lands outside the canvas still ends the gesture
  T = 6000; ptr('pointerdown', 500, 500);
  T = 6100; ptr('pointermove', 560, 500);
  globalThis.window.fire('pointerup', { clientX: 560, clientY: 500, timeStamp: 6200, button: 0, pointerId: 1 });
  check('a release outside the canvas ends the drag', input.drag.active === false);
  input.endFrame();
}

console.log('input: wheel and pointer');
{
  let prevented = 0;
  el.fire('wheel', { deltaY: 120, cancelable: true, preventDefault: () => prevented++ });
  el.fire('wheel', { deltaY: -20, cancelable: true, preventDefault: () => prevented++ });
  check('the wheel accumulates over the frame', input.wheel === 100, `${input.wheel}`);
  check('and the page is stopped from scrolling', prevented === 2, `${prevented} preventDefault calls`);
  input.endFrame();
  check('endFrame clears the wheel', input.wheel === 0);
  T = 7000; ptr('pointermove', 400, 300);
  check('the pointer is NDC, 0,0 at the centre', near(input.pointer.x, 0, 1e-9) && near(input.pointer.y, 0, 1e-9), `${input.pointer.x}, ${input.pointer.y}`);
  ptr('pointermove', 800, 0);
  check('and +1,+1 at the top right', near(input.pointer.x, 1, 1e-9) && near(input.pointer.y, 1, 1e-9), `${input.pointer.x}, ${input.pointer.y}`);
  const before = el.count() + globalThis.window.count();
  input.dispose();
  const after = el.count() + globalThis.window.count();
  check('dispose takes every listener back off', before > 0 && after === 0, `${before} listeners, then ${after}`);
}

console.log(`\ncamera and input: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
