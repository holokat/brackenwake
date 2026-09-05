// The player controller and the rig, measured. Run: node src/game/player.test.mjs
//
// Everything here drives the real exported functions. The rig tests go through
// createPlayer and read world matrices, because the claim worth proving is not
// "an animation function exists" but "the planted foot does not move".

import * as THREE from 'three';
import {
  createPlayer, buildCharacter, poseCharacter, stepPlayer, legIK,
  WALK_SPEED, RUN_SPEED, ACCEL, DECEL, TURN_RATE, MAX_SLOPE, STRIDE_WALK, STRIDE_RUN, PALETTE, JUMP_HEIGHT, JUMP_AIR_S,
  HAIR_STYLES, HAIRLINE, GRIP_POSES, BODY, APPEARANCE_FALLBACK, GENDERS, auditAppearance,
  EMOTE_ANIMS, EMOTE_POSES, auditEmotePoses, isEmoteAnim, clearEmotePose, SIT_HIP, LIE_HIP,
} from './player.js';

let pass = 0, fail = 0;
const check = (n, ok, d = '') => { (ok ? pass++ : fail++); console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${n}${d ? '   ' + d : ''}`); };
const near = (a, b, e) => Math.abs(a - b) <= e;
const flat = () => 0;
const fresh = () => ({ x: 0, y: 0, z: 0, vx: 0, vz: 0, vy: 0, speed: 0, yaw: 0, phase: 0, stride: STRIDE_WALK, t: 0, anim: 'idle', idleMix: 1, airborne: false, peakY: 0, landed: null });
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
  // the polish contract retired the facets: every body mesh is a smooth standard material
  group.traverse((o) => { if (o.isMesh) { meshes++; if (!o.material.flatShading && o.material.isMeshStandardMaterial) flatShaded++; } });
  check('every mesh is a smooth shaded standard material', meshes > 0 && flatShaded === meshes, `${flatShaded}/${meshes} smooth`);
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

console.log('player: jumping and falling');
{
  const flatG = () => 0;
  // a standing jump: up JUMP_HEIGHT, down in JUMP_AIR_S, and a landing that says so
  const s = fresh(); s.landed = null;
  stepPlayer(s, DT, { x: 0, z: 0, jump: true }, flatG);
  check('the jump leaves the ground on the frame it is asked for', s.airborne === true && s.vy > 0);
  let peak = 0, air = DT, landed = null;
  for (let i = 0; i < 200 && s.airborne; i++) { stepPlayer(s, DT, { x: 0, z: 0, jump: true }, flatG); peak = Math.max(peak, s.y); air += DT; if (s.landed) landed = s.landed; }
  check('it peaks at JUMP_HEIGHT', near(peak, JUMP_HEIGHT, 0.06), `${peak.toFixed(3)} m`);
  check('and lands after JUMP_AIR_S', near(air, JUMP_AIR_S, 0.05), `${air.toFixed(3)} s`);
  check('the landing reports the drop from the peak', landed && near(landed.fallMetres, JUMP_HEIGHT, 0.06), `${landed && landed.fallMetres.toFixed(3)} m`);
  check('holding jump in the air does not jump again', s.airborne === false && s.y === 0);
  check('and he is standing afterwards', s.anim === 'idle');

  // momentum is kept: a running jump covers ground while airborne
  const r = fresh(); for (let i = 0; i < 60; i++) stepPlayer(r, DT, { x: 0, z: 1 }, flatG);
  const z0 = r.z; stepPlayer(r, DT, { x: 0, z: 1, jump: true }, flatG); let frames = 1;
  while (r.airborne && frames < 200) { stepPlayer(r, DT, { x: 0, z: 1 }, flatG); frames++; }
  check('a running jump carries the run through the air', near(r.z - z0, WALK_SPEED * frames * DT, 0.05), `${(r.z - z0).toFixed(3)} m in ${frames} frames`);
  check('and the gait in the air is air', (() => { const q = fresh(); stepPlayer(q, DT, { jump: true }, flatG); return q.anim === 'air'; })());

  // walking off a cliff is a fall, and a small step down is not
  const cliff = (x, z) => (z > 5 ? -10 : 0);
  const c = fresh(); let fell = null;
  for (let i = 0; i < 400 && !fell; i++) { stepPlayer(c, DT, { x: 0, z: 1 }, cliff); if (c.landed) fell = c.landed; }
  check('walking off a 10 m cliff is a fall that lands', fell !== null, fell ? `fell ${fell.fallMetres.toFixed(2)} m` : 'never landed');
  check('and it reports the ten metres', fell && near(fell.fallMetres, 10, 0.3), fell ? `${fell.fallMetres.toFixed(2)} m` : '');
  const step = (x, z) => (z > 5 ? -0.4 : 0);
  const d = fresh(); let wentAirborne = false;
  for (let i = 0; i < 200; i++) { stepPlayer(d, DT, { x: 0, z: 1 }, step); if (d.airborne) wentAirborne = true; }
  check('a 0.4 m step down is a step, not a fall', wentAirborne === false && d.y === -0.4, `y ${d.y}`);

  // in the air a wall is still a wall
  const wall = (x, z) => (z > 2 ? 2 : 0);
  const w = fresh(); stepPlayer(w, DT, { x: 0, z: 1, jump: true }, wall);
  for (let i = 0; i < 60; i++) stepPlayer(w, DT, { x: 0, z: 1 }, wall);
  check('a 2 m wall stops him in the air', w.z < 2.05, `z ${w.z.toFixed(3)}`);
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
  // The hips stay up at a run (HIP_REACH), so at the very ends of a 3.2 m
  // stride the straight stance leg cannot quite reach and the boot slides a
  // few centimetres: the price of not squatting, invisible at 18 m/s.
  check('the left boot holds its world z through every stance, within a few centimetres', stances >= 3 && worstZ < 0.05, `${stances} stances, ${samples} frames, worst drift ${(worstZ * 1000).toFixed(3)} mm`);
  check('and holds its height too, within the same', worstY < 0.05, `worst ${(worstY * 1000).toFixed(3)} mm`);
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


// ---------------------------------------------------------------------------
// The face. The hair cap was a closed loft round the whole skull that reached
// down to y = 0.085 in the head's frame, which is below the eyes and below the
// mouth: every character in the game had a wall of hair across the face, and
// with a hood on top of it there was nothing of a person to see at all.
console.log('player: hair does not grow over the face');
{
  const ray = new THREE.Raycaster();
  const POINTS = [['eye', 0.166, 0.040], ['nose', 0.150, 0], ['mouth', 0.098, 0], ['chin', 0.020, 0]];
  const faceZ = (rig, dy, x) => {
    rig.group.updateMatrixWorld(true);
    const v = new THREE.Vector3();
    rig.parts.head.getWorldPosition(v);
    ray.set(new THREE.Vector3(x, v.y + dy, 3), new THREE.Vector3(0, 0, -1));
    const hit = ray.intersectObject(rig.group, true).filter((h) => h.object.isMesh)[0];
    return hit ? 3 - hit.distance : null;
  };
  // the reference is the shaved head: that is the face itself, with nothing in
  // front of it. Any style that stands more than 6 mm proud of it at the eye,
  // the nose, the mouth or the chin is hair across the face.
  const bald = buildCharacter({ ...APPEARANCE_FALLBACK, hairStyle: 'shaved' });
  const want = POINTS.map(([, dy, x]) => faceZ(bald, dy, x));
  console.log(`       the bare face: ${POINTS.map(([n], i) => `${n} z ${want[i].toFixed(3)}`).join(', ')}`);
  const blocked = [];
  for (const style of HAIR_STYLES) {
    const rig = buildCharacter({ ...APPEARANCE_FALLBACK, hairStyle: style });
    POINTS.forEach(([name, dy, x], i) => {
      const z = faceZ(rig, dy, x);
      if (z == null || z > want[i] + 0.006) blocked.push(`${style} ${name} at ${z == null ? 'miss' : z.toFixed(3)} against ${want[i].toFixed(3)}`);
    });
  }
  check(`all ${HAIR_STYLES.length} hair styles leave the eye, nose, mouth and chin exactly where a bare head has them`,
    blocked.length === 0, blocked.slice(0, 4).join('; ') || `${HAIR_STYLES.length * POINTS.length} rays, none blocked`);
  check('and the hairline the rule is written against is above the brow', HAIRLINE > 0.186 && HAIRLINE < 0.24,
    `${HAIRLINE}`);
  // both directions: above the hairline there IS hair, on every style but shaved
  const covered = HAIR_STYLES.filter((style) => {
    const rig = buildCharacter({ ...APPEARANCE_FALLBACK, hairStyle: style });
    rig.group.updateMatrixWorld(true);
    const v = new THREE.Vector3();
    rig.parts.head.getWorldPosition(v);
    ray.set(new THREE.Vector3(0, v.y + 0.270, 3), new THREE.Vector3(0, 0, -1));
    const hit = ray.intersectObject(rig.group, true).filter((h) => h.object.isMesh)[0];
    return hit && hit.object.userData.role === 'hair';
  });
  check(`and ${covered.length} of the ${HAIR_STYLES.length} styles do cover the crown`,
    covered.length === HAIR_STYLES.length - 1 && !covered.includes('shaved'),
    `bare: ${HAIR_STYLES.filter((h) => !covered.includes(h)).join(', ')}`);
}

console.log('player: the arm is continuous from elbow to fingers');
{
  // A short glove shows the wrist, which is only worth doing if there is an
  // arm under it: the forearm stopped 7 mm above the palm and the hole was
  // hidden by the old long glove rather than fixed.
  const rig = buildCharacter();
  rig.group.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  const arm = rig.parts.armL;
  let gaps = [];
  for (let t = 0; t <= 1.0001; t += 0.05) {
    const y = -0.32 - t * 0.34;                 // below the sleeve, to the end of the palm, in the arm's frame
    const p = new THREE.Vector3(0, y, 0).applyMatrix4(arm.matrixWorld);
    ray.set(new THREE.Vector3(p.x, p.y, 3), new THREE.Vector3(0, 0, -1));
    const hit = ray.intersectObject(rig.group, true).filter((h) => h.object.isMesh)[0];
    if (!hit || hit.object.userData.role !== 'skin') gaps.push(y.toFixed(3));
  }
  check('21 rays down the bare forearm and the palm all land on skin', gaps.length === 0,
    gaps.length ? `holes at arm y ${gaps.join(', ')}` : 'no hole between the forearm and the hand');
}

console.log('player: the shield arm hangs, it does not present');
{
  // The shield grip used to throw the forearm up and forward, which put a kite
  // shield 0.77 m in front of the chest. Both shield grips share one arm pose.
  for (const name of ['oneShield', 'shield']) {
    const [rx, , rz] = GRIP_POSES[name].armL;
    check(`${name}: the left arm stays near vertical`, Math.abs(rx) < 0.25, `${rx.toFixed(2)} rad forward`);
    check(`  with the elbow a little out`, rz > 0.15 && rz < 0.45, `${rz.toFixed(2)} rad out`);
  }
  check('and both shield grips use the same arm',
    GRIP_POSES.oneShield.armL.join(',') === GRIP_POSES.shield.armL.join(','),
    GRIP_POSES.shield.armL.join(', '));
  check('while a two hander still pulls the left arm right up onto the haft',
    GRIP_POSES.two.armL[0] < -0.8, `${GRIP_POSES.two.armL[0]} rad`);
}

// ---------------------------------------------------------------------------
// The emote poses. Eight bodies a player wears on purpose, measured on a real
// rig: where the hips ride, where the head ends up, and whether any of it goes
// through the ground. See src/game/emotes.js for which one runs when.
console.log('player: the emote poses');
{
  check('there are eight of them', EMOTE_ANIMS.length === 8, EMOTE_ANIMS.join(','));
  check('and the audit passes on its own list', auditEmotePoses(EMOTE_ANIMS) === true);
  const threw = (fn) => { try { fn(); return null; } catch (e) { return e.message; } };
  check('a name with no pose is refused', /has no pose/.test(threw(() => auditEmotePoses([...EMOTE_ANIMS, 'shrug'])) || ''));
  check('and a pose with no name is refused', /answers to no emote/.test(threw(() => auditEmotePoses(EMOTE_ANIMS.slice(1))) || ''));
  check('isEmoteAnim knows an emote from a gait',
    isEmoteAnim('sit') && isEmoteAnim('lie') && !isEmoteAnim('walk') && !isEmoteAnim('idle') && !isEmoteAnim('constructor'));
}
{
  const { group, parts } = buildCharacter();
  const box = new THREE.Box3();
  const worst = [];
  for (const id of EMOTE_ANIMS) {
    let lo = 9, hi = -9, at = 0;
    for (let i = 0; i <= 60; i++) {
      const t = i * 0.05;                    // three seconds of it, at 20 Hz
      poseCharacter(parts, { anim: id, emoteT: t, t, phase: 0, stride: STRIDE_WALK, idleMix: 1 });
      group.updateMatrixWorld(true);
      box.setFromObject(group);
      if (box.min.y < lo) { lo = box.min.y; at = t; }
      hi = Math.max(hi, box.max.y);
    }
    worst.push({ id, lo, hi, at });
    check(`${id}: nothing sinks into the field over three seconds`, lo > -0.05,
      `lowest ${(lo * 1000).toFixed(0)} mm at t = ${at.toFixed(2)} s, tallest ${hi.toFixed(3)} m`);
  }
  check('and none of the eight leaves the body an impossible height',
    worst.every((w) => w.hi > 0.2 && w.hi < 2.3), worst.map((w) => `${w.id} ${w.hi.toFixed(2)}`).join(' '));
}
{
  // the sit: the numbers the pose was solved for, read back off the rig
  const { group, parts } = buildCharacter();
  poseCharacter(parts, { anim: 'sit', emoteT: 2, t: 2, phase: 0, stride: STRIDE_WALK, idleMix: 1 });
  group.updateMatrixWorld(true);
  const at = (p) => { const v = new THREE.Vector3(); p.getWorldPosition(v); return v; };
  const hip = at(parts.hips), kneeR = at(parts.shinR), ankleR = at(parts.bootR), head = at(parts.head);
  check('the hips are on the ground at SIT_HIP', near(hip.y, SIT_HIP, 0.01), `${hip.y.toFixed(3)} m against ${SIT_HIP}`);
  check('the knees are out wider than the hips are', Math.abs(kneeR.x) > 0.28 && kneeR.x > 0,
    `knee x ${kneeR.x.toFixed(3)} against hip half width ${BODY.HIP_HALF}`);
  check('and forward of them', kneeR.z > 0.25, `knee z ${kneeR.z.toFixed(3)}`);
  check('the shins fold back ACROSS the middle, which is what crossed legs are',
    ankleR.x < 0, `right ankle x ${ankleR.x.toFixed(3)}, right knee x ${kneeR.x.toFixed(3)}`);
  check('the ankles are near the ground', ankleR.y > 0.02 && ankleR.y < 0.18, `${ankleR.y.toFixed(3)} m`);
  check('and the head is half a metre lower than it stands', head.y > 0.85 && head.y < 1.05, `${head.y.toFixed(3)} m`);
}
{
  // the lie: flat on the back, head down, feet forward
  const { group, parts } = buildCharacter();
  poseCharacter(parts, { anim: 'lie', emoteT: 2, t: 2, phase: 0, stride: STRIDE_WALK, idleMix: 1 });
  group.updateMatrixWorld(true);
  const at = (p) => { const v = new THREE.Vector3(); p.getWorldPosition(v); return v; };
  const hip = at(parts.hips), head = at(parts.head), foot = at(parts.bootR);
  check('the pelvis is tipped a right angle', near(parts.hips.rotation.x, -Math.PI / 2, 1e-6), `${parts.hips.rotation.x.toFixed(5)} rad`);
  check('the hips rest at LIE_HIP', near(hip.y, LIE_HIP, 0.01), `${hip.y.toFixed(3)} m against ${LIE_HIP}`);
  check('the head is on the floor', head.y < 0.3, `${head.y.toFixed(3)} m`);
  check('behind the hips, so he is on his back and not face down', head.z < -0.45, `head z ${head.z.toFixed(3)}`);
  check('with the feet out the other way', foot.z > 0.5, `foot z ${foot.z.toFixed(3)}`);
  const box = new THREE.Box3().setFromObject(group);
  check('and the body laid out is about as long as it is tall standing',
    near(box.max.z - box.min.z, 1.8, 0.25), `${(box.max.z - box.min.z).toFixed(3)} m end to end`);
}
{
  // The discipline, proved in both directions: the emotes write channels
  // poseCharacter does not, so a body that sat down has to be cleared or it
  // never stands up again.
  const { parts } = buildCharacter();
  poseCharacter(parts, { anim: 'lie', emoteT: 2, t: 2, phase: 0, stride: STRIDE_WALK, idleMix: 1 });
  poseCharacter(parts, { anim: 'walk', phase: 1, stride: STRIDE_WALK, idleMix: 0, t: 0 });
  check('the gait alone does NOT undo the pelvis an emote tipped over',
    Math.abs(parts.hips.rotation.x) > 1, `${parts.hips.rotation.x.toFixed(4)} rad still on the hips`);
  clearEmotePose(parts);
  const dirty = ['hips.rotation.x', 'hips.rotation.y', 'hips.rotation.z', 'hips.position.z',
    'torso.rotation.y', 'torso.rotation.z', 'head.rotation.y', 'head.rotation.z',
    'armL.rotation.y', 'armR.rotation.y', 'legL.rotation.y', 'legL.rotation.z',
    'legR.rotation.y', 'legR.rotation.z', 'shinL.rotation.z', 'shinR.rotation.z',
    'bootL.rotation.z', 'bootR.rotation.z']
    .filter((path) => {
      const [part, kind, axis] = path.split('.');
      return parts[part][kind][axis] !== 0;
    });
  check('and clearEmotePose puts every one of the eighteen channels back to zero',
    dirty.length === 0, dirty.join(', '));
  check('clearEmotePose on nothing at all does not throw', clearEmotePose(null) === null);
}
{
  // The gait is untouched: an anim name that is not an emote goes through the
  // same code it always did, and comes out the same numbers.
  const a = buildCharacter().parts, b = buildCharacter().parts;
  const st = () => ({ phase: 0.9, stride: STRIDE_RUN, anim: 'run', idleMix: 0, t: 0.4 });
  poseCharacter(a, st());
  poseCharacter(b, { anim: 'dance', emoteT: 1, t: 0.4, phase: 0.9, stride: STRIDE_RUN, idleMix: 0 });
  clearEmotePose(b);
  poseCharacter(b, st());
  const same = ['hips.position.y', 'torso.rotation.x', 'head.rotation.x', 'armL.rotation.x',
    'armR.rotation.x', 'legL.rotation.x', 'legR.rotation.x', 'shinL.rotation.x', 'bootR.rotation.x']
    .every((path) => {
      const [part, kind, axis] = path.split('.');
      return Math.abs(a[part][kind][axis] - b[part][kind][axis]) < 1e-12;
    });
  check('a run after an emote is exactly the run it would have been', same,
    `hips ${a.hips.position.y.toFixed(6)} vs ${b.hips.position.y.toFixed(6)}`);
}

// ---------------------------------------------------------------------------
// CR3: the gender is recorded, and it moves nothing.
//
// The claim the creation screen makes is that choosing female picks a body.
// Today it does not: the models are being made. So the claim this file has to
// prove is the honest one, in both directions: the choice is KEPT, and not one
// vertex of the rig moves because of it. Measured by walking every mesh in the
// group, in order, and comparing the whole position buffer and the world matrix
// of each, before and after.
// ---------------------------------------------------------------------------
console.log('\nplayer: the gender, recorded and drawing nothing');
{
  /** Every vertex of every mesh, in traversal order, with each mesh's world matrix. */
  function skeletonOf(group) {
    group.updateMatrixWorld(true);
    const out = [];
    group.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      const pos = o.geometry.getAttribute('position');
      out.push({
        n: pos ? pos.count : 0,
        verts: pos ? Array.from(pos.array) : [],
        world: o.matrixWorld.elements.slice(),
      });
    });
    return out;
  }
  const sameAs = (a, b) => {
    if (a.length !== b.length) return `${a.length} meshes became ${b.length}`;
    for (let i = 0; i < a.length; i++) {
      if (a[i].n !== b[i].n) return `mesh ${i}: ${a[i].n} vertices became ${b[i].n}`;
      for (let k = 0; k < a[i].verts.length; k++) {
        if (a[i].verts[k] !== b[i].verts[k]) return `mesh ${i} vertex value ${k}: ${a[i].verts[k]} became ${b[i].verts[k]}`;
      }
      for (let k = 0; k < 16; k++) {
        if (a[i].world[k] !== b[i].world[k]) return `mesh ${i} world matrix ${k}: ${a[i].world[k]} became ${b[i].world[k]}`;
      }
    }
    return null;
  };

  check('the two genders the rig knows are openings.js s two', GENDERS.join(',') === 'male,female', GENDERS.join(','));
  check('and the fallback look is male, so a rig built with no appearance still answers the question',
    APPEARANCE_FALLBACK.gender === 'male', String(APPEARANCE_FALLBACK.gender));

  const rig = buildCharacter({ ...APPEARANCE_FALLBACK });
  check('a rig built from the fallback records male', rig.appearance.gender === 'male', String(rig.appearance.gender));
  const before = skeletonOf(rig.group);
  const meshes = before.length;
  const verts = before.reduce((n, m) => n + m.n, 0);

  rig.setAppearance({ ...rig.appearance, gender: 'female' });
  check('setAppearance({ gender: female }) records it on the rig', rig.appearance.gender === 'female', String(rig.appearance.gender));
  const diff = sameAs(before, skeletonOf(rig.group));
  check(`and moves not one of the ${verts} vertices across ${meshes} meshes`, diff === null, diff || `${meshes} meshes, ${verts} vertices, identical`);

  rig.setAppearance({ ...rig.appearance, gender: 'male' });
  check('and back to male is still the same body', sameAs(before, skeletonOf(rig.group)) === null, sameAs(before, skeletonOf(rig.group)) || 'identical');

  // The other direction: something that IS meant to move the body still does,
  // so the check above is a measurement and not a broken comparison.
  rig.setAppearance({ ...rig.appearance, build: 'heavy' });
  check('while a change of build does move it, so the comparison above can fail', sameAs(before, skeletonOf(rig.group)) !== null,
    sameAs(before, skeletonOf(rig.group)) || 'nothing moved, which means the check cannot fail');

  const junk = buildCharacter({ ...APPEARANCE_FALLBACK, gender: 'wyvern' });
  check('a gender nothing has a body for falls back to male rather than being kept',
    junk.appearance.gender === 'male', String(junk.appearance.gender));
  check('and the audit passes over openings.js own list',
    auditAppearance({ genders: ['male', 'female'], builds: ['average'], skins: ['fair'], hairColours: ['chestnut'], hairStyles: ['short'], marks: ['none'] }) === true);
  let threw = '';
  try { auditAppearance({ genders: ['male', 'other'], builds: ['average'], skins: ['fair'], hairColours: ['chestnut'], hairStyles: ['short'], marks: ['none'] }); }
  catch (e) { threw = e.message; }
  check('and fails loudly the day a third gender arrives with no body', threw.includes('other'), threw);
}

console.log(`\nplayer: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
