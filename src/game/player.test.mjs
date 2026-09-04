// The player controller and the rig, measured. Run: node src/game/player.test.mjs
//
// Everything here drives the real exported functions. The rig tests go through
// createPlayer and read world matrices, because the claim worth proving is not
// "an animation function exists" but "the planted foot does not move".

import * as THREE from 'three';
import {
  createPlayer, buildCharacter, poseCharacter, stepPlayer, legIK,
  WALK_SPEED, RUN_SPEED, ACCEL, DECEL, TURN_RATE, MAX_SLOPE, STRIDE_WALK, STRIDE_RUN, PALETTE,
} from './player.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };
const near = (a, b, e) => Math.abs(a - b) <= e;
const flat = () => 0;
const fresh = () => ({ x: 0, y: 0, z: 0, vx: 0, vz: 0, speed: 0, yaw: 0, phase: 0, stride: STRIDE_WALK, t: 0, anim: 'idle', idleMix: 1 });
const DT = 1 / 60;

console.log('player: the body');
{
  const { group, parts } = buildCharacter();
  group.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(group);
  check('stands 1.80 m tall', near(bb.max.y - bb.min.y, 1.8, 0.002), `${(bb.max.y - bb.min.y).toFixed(4)} m`);
  check('soles rest on y = 0', near(bb.min.y, 0, 0.002), `${bb.min.y.toFixed(4)}`);
  check('the palette is five colours', Object.keys(PALETTE).length === 5, Object.keys(PALETTE).join(', '));
  const have = ['head', 'torso', 'armL', 'armR', 'legL', 'legR'].every((k) => parts[k]);
  check('the contract parts are all present', have, Object.keys(parts).join(', '));
  let flatShaded = 0, meshes = 0;
  group.traverse((o) => { if (o.isMesh) { meshes++; if (o.material.flatShading && o.material.isMeshStandardMaterial) flatShaded++; } });
  check('every mesh is a flat shaded standard material', meshes > 0 && flatShaded === meshes, `${flatShaded}/${meshes}`);
}

console.log('player: acceleration and braking');
{
  const s = fresh();
  let dist = 0;
  for (let i = 0; i < 60; i++) { const px = s.x, pz = s.z; stepPlayer(s, DT, { x: 0, z: 1 }, flat); dist += Math.hypot(s.x - px, s.z - pz); }
  // continuous form: 0.5 a t1^2 + v (1 - t1), t1 = v / a
  const t1 = WALK_SPEED / ACCEL;
  const want = 0.5 * ACCEL * t1 * t1 + WALK_SPEED * (1 - t1);
  check('one second of forward reaches WALK_SPEED', near(s.speed, WALK_SPEED, 1e-9), `${s.speed.toFixed(6)} m/s`);
  // the ramp ends partway through a frame, so the discrete sum sits within one
  // frame's worth of the ramp behind the continuous form. Tie the bound to the
  // constants rather than to a number that only held while they did.
  check('and covers the analytic distance', near(dist, want, ACCEL * DT * DT), `${dist.toFixed(6)} m vs ${want.toFixed(6)} m`);
  check('facing is straight down +z', near(s.yaw, 0, 1e-9), `${s.yaw.toFixed(6)} rad`);

  // the other direction: let go and he stops, and not instantly
  let t = 0, stopAt = -1, at100ms = null;
  while (t < 1) { stepPlayer(s, DT, { x: 0, z: 0 }, flat); t += DT; if (at100ms === null && t >= 0.1) at100ms = s.speed; if (stopAt < 0 && s.speed === 0) stopAt = t; }
  check('releasing stops him inside 0.3 s', stopAt > 0 && stopAt <= 0.3, `${stopAt.toFixed(4)} s (theory ${(WALK_SPEED / DECEL).toFixed(4)})`);
  check('and he is still moving at 0.10 s', at100ms > 0.5, `${at100ms.toFixed(4)} m/s`);
}
{
  const s = fresh();
  for (let i = 0; i < 90; i++) stepPlayer(s, DT, { x: 0, z: 1, sprint: true }, flat);
  check('sprint reaches RUN_SPEED', near(s.speed, RUN_SPEED, 1e-9), `${s.speed.toFixed(6)} m/s`);
  check('and the gait is a run', s.anim === 'run', s.anim);
  const w = fresh();
  for (let i = 0; i < 90; i++) stepPlayer(w, DT, { x: 0, z: 1 }, flat);
  check('walking does not reach run speed', w.speed < WALK_SPEED + 1e-9 && w.anim === 'walk', `${w.speed.toFixed(4)} m/s, ${w.anim}`);
}

console.log('player: the phase follows distance, not time');
{
  const run = (stick) => {
    const s = fresh(); let dist = 0, frames = 0, worst = 0;
    while (dist < 6) {
      const px = s.x, pz = s.z;
      stepPlayer(s, DT, { x: 0, z: stick }, flat);
      dist += Math.hypot(s.x - px, s.z - pz); frames++;
      worst = Math.max(worst, Math.abs(s.phase - (dist / STRIDE_WALK) * Math.PI * 2));
    }
    return { s, dist, frames, worst };
  };
  const fast = run(1), slow = run(0.5);
  check('full stick: phase is exactly distance / 1.4 turns', fast.worst < 1e-9, `worst ${fast.worst.toExponential(2)} rad`);
  check('half stick: the same law', slow.worst < 1e-9, `worst ${slow.worst.toExponential(2)} rad`);
  const pa = fast.s.phase / fast.dist, pb = slow.s.phase / slow.dist;
  check('two speeds, same distance, same phase', near(pa, pb, 1e-9), `${pa.toFixed(9)} vs ${pb.toFixed(9)} rad/m`);
  check('and the two took different amounts of time', slow.frames > fast.frames * 1.5, `${fast.frames} frames vs ${slow.frames}`);
  check('the run stride is longer than the walk stride', STRIDE_RUN > STRIDE_WALK, `${STRIDE_WALK} m vs ${STRIDE_RUN} m`);
}

console.log('player: slopes');
{
  // one step of exactly 0.075 m against a cliff, driven both sides of 1.2
  // driven FORWARD, so these test slope refusal and not the strafe convention
  const cliff = (rise) => (x, z) => (z <= 0 ? 0 : rise);
  const step = 0.5 * ACCEL * 0.05 * 0.05;   // the ground the first frame at dt = 0.05 covers
  const over = fresh(), under = fresh();
  stepPlayer(over, 0.05, { x: 0, z: 1 }, cliff(step * 1.3));
  stepPlayer(under, 0.05, { x: 0, z: 1 }, cliff(step * 1.1));
  check(`a rise of 1.3 per metre is refused (limit ${MAX_SLOPE})`, over.z === 0, `z = ${over.z}`);
  check('a rise of 1.1 per metre is taken', near(under.z, step, 1e-9), `z = ${under.z.toFixed(6)} m`);
  check('the refused step reports blocked', over.blocked === true && under.blocked === false);

  // and over a whole mountain wall he stops at the foot of it
  const wall = (x, z) => (z > 5 ? (z - 5) * 3 : 0);
  const s = fresh();
  for (let i = 0; i < 300; i++) stepPlayer(s, DT, { x: 0, z: 1 }, wall);
  check('a 3 in 1 mountain stops him at its foot', s.z > 4.9 && s.z < 5.1, `z = ${s.z.toFixed(4)} m after 5 s`);
  const ramp = (x, z) => (z > 5 ? (z - 5) * 1.0 : 0);
  const r = fresh();
  for (let i = 0; i < 300; i++) stepPlayer(r, DT, { x: 0, z: 1 }, ramp);
  check('a 1 in 1 ramp he walks straight up', r.z > 20, `z = ${r.z.toFixed(2)} m, y = ${r.y.toFixed(2)} m`);
}

console.log('player: the feet are on the ground, every frame');
{
  const lumpy = (x, z) => Math.sin(x * 0.3) * 1.2 + Math.cos(z * 0.21) * 0.8;
  const s = fresh(); s.y = lumpy(0, 0);
  let worst = 0;
  for (let i = 0; i < 600; i++) {
    stepPlayer(s, DT, { x: Math.sin(i / 40), z: Math.cos(i / 55), sprint: i % 3 === 0 }, lumpy);
    worst = Math.max(worst, Math.abs(s.y - lumpy(s.x, s.z)));
  }
  check('y equals heightAt over 600 frames of wandering', worst === 0, `worst gap ${worst}`);
}

console.log('player: the stick is camera relative');
{
  const cases = [[0, 0, 1], [Math.PI / 2, 1, 0], [Math.PI, 0, -1], [-Math.PI / 2, -1, 0]];
  let bad = 0, told = '';
  for (const [yaw, ex, ez] of cases) {
    const s = fresh();
    for (let i = 0; i < 30; i++) stepPlayer(s, DT, { x: 0, z: 1, yaw }, flat);
    const d = Math.hypot(s.x, s.z);
    const ux = s.x / d, uz = s.z / d;
    if (!near(ux, ex, 1e-6) || !near(uz, ez, 1e-6)) { bad++; told += `yaw ${yaw.toFixed(2)} went (${ux.toFixed(3)}, ${uz.toFixed(3)}) `; }
  }
  check('forward follows the camera yaw at all four quarters', bad === 0, told || 'all four');
  const s = fresh();
  for (let i = 0; i < 30; i++) stepPlayer(s, DT, { x: 1, z: 0, yaw: 0 }, flat);
  check('strafe right at yaw 0 goes -x, which is screen right', s.x < 0 && near(s.z, 0, 1e-9), `(${s.x.toFixed(3)}, ${s.z.toFixed(3)})`);
  {
    // the rule: the strafe direction is exactly forward x up, at eight yaws.
    // Forward is (sin yaw, cos yaw), so right is (-cos yaw, sin yaw). Shipping
    // the negative of this walked the player screen left on every D press.
    let bad = 0, told = '';
    for (let i = 0; i < 8; i++) {
      const yaw = (i * Math.PI) / 4;
      const q = fresh();
      for (let k = 0; k < 30; k++) stepPlayer(q, DT, { x: 1, z: 0, yaw }, flat);
      const L = Math.hypot(q.x, q.z) || 1;
      const ex = -Math.cos(yaw), ez = Math.sin(yaw);
      if (!near(q.x / L, ex, 1e-9) || !near(q.z / L, ez, 1e-9)) { bad++; told += `yaw ${yaw.toFixed(2)} went (${(q.x / L).toFixed(3)}, ${(q.z / L).toFixed(3)}) want (${ex.toFixed(3)}, ${ez.toFixed(3)}) `; }
    }
    check('strafe is exactly forward x up at eight yaws', bad === 0, told || 'all eight');
  }
  const noYaw = fresh(), zeroYaw = fresh();
  for (let i = 0; i < 30; i++) { stepPlayer(noYaw, DT, { x: 0.3, z: 1 }, flat); stepPlayer(zeroYaw, DT, { x: 0.3, z: 1, yaw: 0 }, flat); }
  check('a caller that omits yaw gets the identity rotation', near(noYaw.x, zeroYaw.x, 1e-12) && near(noYaw.z, zeroYaw.z, 1e-12));
}

console.log('player: turning');
{
  // measured on its own, with the velocity already pointing the new way, so
  // this is the turn rate and not the time it takes to stop and reverse
  const s = fresh(); s.vx = WALK_SPEED; s.vz = 0; s.yaw = 0;   // running +x, still facing +z
  let t = 0, quarter = -1, worstRate = 0, prev = s.yaw, firstFrame = 0;
  while (t < 1 && quarter < 0) {
    stepPlayer(s, DT, { x: 1, z: 0 }, flat);
    t += DT;
    let d = s.yaw - prev; d = Math.atan2(Math.sin(d), Math.cos(d));
    if (!firstFrame) firstFrame = Math.abs(d);
    worstRate = Math.max(worstRate, Math.abs(d) / DT);
    prev = s.yaw;
    if (Math.abs(s.yaw - Math.PI / 2) < 1e-9) quarter = t;
  }
  const wantT = (Math.PI / 2) / TURN_RATE;
  check('a quarter turn takes pi/2 over 12 s', quarter > 0 && near(quarter, wantT, DT), `${quarter.toFixed(4)} s vs ${wantT.toFixed(4)} s`);
  check('it does not snap round in one frame', firstFrame <= TURN_RATE * DT + 1e-12, `first frame turned ${firstFrame.toFixed(4)} rad`);
  check('and never turns faster than 12 rad/s', worstRate <= TURN_RATE + 1e-6, `peak ${worstRate.toFixed(4)} rad/s`);
  // the other direction: standing still, he keeps the facing he had
  const still = fresh(); still.yaw = 1.234;
  for (let i = 0; i < 60; i++) stepPlayer(still, DT, { x: 0, z: 0 }, flat);
  check('standing still he holds his facing', still.yaw === 1.234, `${still.yaw}`);
}

console.log('player: the planted foot does not slide');
{
  const scene = new THREE.Scene();
  const p = createPlayer(scene);
  const world = new THREE.Vector3();
  const TAU = Math.PI * 2;
  const wrap01 = (v) => v - Math.floor(v);
  // two seconds to settle out of idle, then watch the left boot
  for (let i = 0; i < 120; i++) p.update(DT, { x: 0, z: 1 }, flat);
  let runZ = null, worstZ = 0, worstY = 0, stances = 0, samples = 0;
  for (let i = 0; i < 240; i++) {
    p.update(DT, { x: 0, z: 1 }, flat);
    p.group.updateMatrixWorld(true);
    p.parts.bootL.getWorldPosition(world);
    const stance = wrap01(p.state.phase / TAU) < 0.5;
    if (stance) {
      samples++;
      if (!runZ) { runZ = { z0: world.z, y0: world.y }; stances++; }
      worstZ = Math.max(worstZ, Math.abs(world.z - runZ.z0));
      worstY = Math.max(worstY, Math.abs(world.y - runZ.y0));
    } else runZ = null;
  }
  check('the left boot holds its world z through every stance', stances >= 3 && worstZ < 0.002, `${stances} stances, ${samples} frames, worst drift ${(worstZ * 1000).toFixed(3)} mm`);
  check('and holds its height too', worstY < 0.002, `worst ${(worstY * 1000).toFixed(3)} mm`);
  // the sole is on the ground while planted
  p.group.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(p.group);
  check('the body never sinks through the ground', bb.min.y > -0.01, `lowest point ${bb.min.y.toFixed(4)} m`);
  check('walking is shorter than standing', bb.max.y < 1.8 && bb.max.y > 1.6, `crown at ${bb.max.y.toFixed(3)} m`);
}

console.log('player: idle and run poses');
{
  const { parts } = buildCharacter();
  let lo = 9, hi = -9;
  for (let i = 0; i <= 200; i++) {
    poseCharacter(parts, { phase: 0, stride: STRIDE_WALK, anim: 'idle', idleMix: 1, t: i * 0.02 });
    lo = Math.min(lo, parts.torso.scale.y); hi = Math.max(hi, parts.torso.scale.y);
  }
  check('idle breathes 1 +- 0.015 over its 2 s period', near(lo, 0.985, 1e-6) && near(hi, 1.015, 1e-6), `${lo.toFixed(5)} to ${hi.toFixed(5)}`);
  poseCharacter(parts, { phase: 0, stride: STRIDE_WALK, anim: 'idle', idleMix: 1, t: 0 });
  check('idle lets the arms hang', Math.abs(parts.armL.rotation.x) < 1e-9 && Math.abs(parts.armR.rotation.x) < 1e-9);
  check('idle stands the legs up', Math.abs(parts.legL.rotation.x - parts.legR.rotation.x) < 1e-9);
  poseCharacter(parts, { phase: 0.9, stride: STRIDE_RUN, anim: 'run', idleMix: 0, t: 0 });
  const lean = parts.torso.rotation.x * 180 / Math.PI;
  const runArm = Math.abs(parts.armL.rotation.x);
  poseCharacter(parts, { phase: 0.9, stride: STRIDE_WALK, anim: 'walk', idleMix: 0, t: 0 });
  const walkArm = Math.abs(parts.armL.rotation.x);
  check('a run leans the torso 10 degrees forward', near(lean, 10, 1e-6), `${lean.toFixed(3)} deg`);
  check('a run swings the arms wider than a walk', runArm > walkArm * 1.5, `${runArm.toFixed(3)} rad vs ${walkArm.toFixed(3)} rad`);
}

console.log('player: the leg solver');
{
  const a = legIK(0, -0.78);
  check('a straight down target barely bends the knee', Math.abs(a.thigh) < 0.06 && Math.abs(a.shin) < 0.06, `thigh ${a.thigh.toFixed(4)}, shin ${a.shin.toFixed(4)}`);
  const f = legIK(0.35, -0.69);
  check('a forward target puts the knee in front', f.thigh > f.shin, `thigh ${f.thigh.toFixed(4)} > shin ${f.shin.toFixed(4)}`);
  const b = legIK(-0.35, -0.69);
  check('a backward target swings the thigh back', b.thigh < 0, `thigh ${b.thigh.toFixed(4)}`);
  const far = legIK(0, -50);
  check('an impossible target does not return NaN', Number.isFinite(far.thigh) && Number.isFinite(far.shin), `${far.thigh}, ${far.shin}`);
}

console.log('player: the createPlayer surface');
{
  const scene = new THREE.Scene();
  const p = createPlayer(scene);
  check('the group joined the scene', scene.children.includes(p.group));
  check('pos is group.position', p.pos === p.group.position);
  const hills = (x, z) => x * 0.1 + z * 0.05;
  p.teleport(12, -7, hills);
  check('teleport lands on the ground', p.pos.x === 12 && p.pos.z === -7 && p.pos.y === hills(12, -7), `y = ${p.pos.y}`);
  check('teleport kills the momentum', p.speed === 0);
  p.setVisible(false); const hidden = p.group.visible === false;
  p.setVisible(true);
  check('setVisible works both ways', hidden && p.group.visible === true);
  for (let i = 0; i < 30; i++) p.update(DT, { x: 0, z: 1, yaw: Math.PI / 2 }, hills);
  check('update moves the group and the state together', p.pos.x === p.state.x && p.pos.z === p.state.z && p.group.rotation.y === p.state.yaw);
  check('anim reports the gait', p.anim === 'walk', p.anim);
  // an outside hand on pos is picked up
  for (let i = 0; i < 30; i++) p.update(DT, { x: 0, z: 0 }, hills);   // let him come to a stop first
  p.pos.x = 100; p.pos.z = 100;
  p.update(DT, { x: 0, z: 0 }, hills);
  check('a shove straight into pos is respected', near(p.state.x, 100, 1e-9) && near(p.pos.y, hills(100, 100), 1e-9), `(${p.pos.x}, ${p.pos.y}, ${p.pos.z})`);
}
{
  // main.js shoves him off the wall every frame while he leans on it
  // underground. He should slide along it, not stall against it.
  const p = createPlayer(new THREE.Scene());
  const WALL = 3;
  const clampWalkable = () => { if (p.pos.x > WALL) p.pos.x = WALL; };
  for (let i = 0; i < 240; i++) { p.update(DT, { x: 1, z: 1 }, flat); clampWalkable(); }
  check('walled in, he still runs along the wall', p.state.vz > WALK_SPEED * 0.6, `${p.state.vz.toFixed(3)} m/s along the wall, ${p.state.vx.toFixed(3)} into it`);
  check('and gains nothing into the wall', p.pos.x <= WALL + 1e-9, `x = ${p.pos.x}`);
  const q = createPlayer(new THREE.Scene());
  for (let i = 0; i < 60; i++) q.update(DT, { x: 0, z: 1 }, flat);
  q.teleport(50, 50, flat);
  check('teleport, by contrast, stops him dead', q.speed === 0 && q.state.vz === 0);
}

console.log(`\nplayer: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
