// The player: a procedural person, and the controller that walks him about.
//
// CONTRACT NOTE, the camera-relative convention (Agent A, read this):
//
//   player.update(dt, move, heightAt) takes move = { x, z, sprint, yaw }.
//   x and z are the raw stick, both in [-1, 1], in CAMERA space:
//     z = +1 is "away from the camera", x = +1 is "to the camera's right".
//   PLAYER.JS DOES THE ROTATION. Pass move.yaw = camera.forwardYaw and the
//   controller turns the stick into world axes itself. WASD maps straight
//   through: W -> z +1, S -> z -1, A -> x -1, D -> x +1.
//
//   If move.yaw is left out it is taken as 0, which is the identity rotation,
//   so a caller that has already rotated the stick into world axes still
//   works. Do not do both. One or the other.
//
// The body is knee-jointed and solved by inverse kinematics against a foot
// path, not by swinging rigid pins from the hips. That is the difference
// between feet that plant and feet that skate: the stance foot's position in
// body space moves backward at exactly the ground speed, because the gait
// phase is advanced by distance travelled and the foot path is linear in
// phase over the stance half of the cycle. See player.test.mjs, which
// measures the planted foot's world position frame by frame.
//
// No jump. move.jump is accepted and ignored: the feet are snapped to
// heightAt every frame, so there is no air state to be in yet.

import * as THREE from 'three';

// The world puts 500 m and more between places, so a stroll across it is a
// chore. Walk is a walk; the run is deliberately quick.
export const WALK_SPEED = 7;
export const RUN_SPEED = 18;
export const ACCEL = 40;         // m/s^2 toward the wanted velocity
export const DECEL = 40;         // m/s^2 back to a stop
export const TURN_RATE = 12;     // rad/s, the cap on how fast he faces a new heading
export const MAX_SLOPE = 1.2;    // metres of rise per metre of ground, above which the step is refused
// Jumping and falling. A standing jump rises JUMP_HEIGHT and lasts JUMP_AIR_S,
// which fixes gravity and the launch speed: g = 8h/T^2, v0 = gT/2. Walking
// off ground that drops more than EDGE_DROP in one frame is a fall; falls
// report how far they fell so combat can charge for it.
export const JUMP_HEIGHT = 1.2, JUMP_AIR_S = 0.7;
export const GRAVITY = 8 * JUMP_HEIGHT / (JUMP_AIR_S * JUMP_AIR_S);   // 19.59 m/s^2
export const JUMP_V0 = GRAVITY * JUMP_AIR_S / 2;                       // 6.86 m/s
export const EDGE_DROP = 0.5;    // a step down this big is a fall, not a step
export const WALL_STEP = 0.3;    // in the air, ground higher than this above the feet is a wall
export const STRIDE_WALK = 1.4;  // metres of ground per full gait cycle
export const STRIDE_RUN = 3.2;  // longer, or the legs blur at 18 m/s

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrap01 = (x) => x - Math.floor(x);

// --- body plan, metres, feet on y = 0, forward is +z ---
const THIGH = 0.40, SHIN = 0.38, ANKLE_Y = 0.12;
const LEG = THIGH + SHIN;               // 0.78, hip pivot at 0.90 when standing
const STAND_HIP = ANKLE_Y + LEG;        // 0.90
const IDLE_HIP = 0.875;                 // a hand of bend in the knees at rest
const HIP_HALF = 0.115;                 // lateral offset of each leg
const SHOULDER_Y = 0.50, SHOULDER_X = 0.27;  // relative to the hips
const TORSO_H = 0.55;

// the palette, five colours and no more
export const PALETTE = {
  tunic: 0x5c7d52,     // moss green wool
  trousers: 0x4a4034,  // bark brown
  skin: 0xd8a071,
  hair: 0x3a2a1c,
  boots: 0x2b2420,
};

let MATS = null;
function mats() {
  if (MATS) return MATS;
  const m = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0, flatShading: true });
  MATS = { tunic: m(PALETTE.tunic), trousers: m(PALETTE.trousers), skin: m(PALETTE.skin), hair: m(PALETTE.hair), boots: m(PALETTE.boots) };
  return MATS;
}

function put(geo, mat, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(geo, mat);
  o.position.set(x, y, z);
  o.castShadow = true;
  o.receiveShadow = true;
  return o;
}
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (r, h) => new THREE.CylinderGeometry(r * 0.92, r, h, 6);

// Two bone leg. dz and dy place the ankle relative to the hip pivot (dy is
// negative, the ankle is below the hip). Returns absolute forward angles in
// radians for each bone, measured from straight down, positive meaning the
// lower end of the bone has swung toward +z. The knee always comes out in
// front, which is the way a person is put together.
export function legIK(dz, dy) {
  const d = clamp(Math.hypot(dz, dy), Math.abs(THIGH - SHIN) + 1e-3, LEG * 0.999);
  const line = Math.atan2(dz, -dy);
  const b = Math.acos(clamp((THIGH * THIGH + d * d - SHIN * SHIN) / (2 * THIGH * d), -1, 1));
  const g = Math.acos(clamp((SHIN * SHIN + d * d - THIGH * THIGH) / (2 * SHIN * d), -1, 1));
  return { thigh: line + b, shin: line - g };
}

// The person. Flat shaded boxes and cylinders, 1.80 m from the soles to the
// top of the hair, pivots at the hips, knees, ankles and shoulders.
export function buildCharacter() {
  const M = mats();
  const group = new THREE.Group();

  const hips = new THREE.Group();
  hips.position.y = STAND_HIP;
  group.add(hips);

  // torso, hung from the hips so a run leans the whole upper body
  const torso = new THREE.Group();
  hips.add(torso);
  torso.add(put(box(0.44, TORSO_H, 0.26), M.tunic, 0, TORSO_H / 2, 0));
  torso.add(put(box(0.46, 0.07, 0.28), M.boots, 0, 0.06, 0));            // belt, in the boot leather
  torso.add(put(box(0.40, 0.10, 0.24), M.tunic, 0, TORSO_H - 0.02, 0));  // yoke across the shoulders

  // head, on a neck, carried by the torso
  const head = new THREE.Group();
  head.position.y = 0.61;
  torso.add(head);
  head.add(put(cyl(0.06, 0.10), M.skin, 0, -0.05, 0));            // neck, 1.45 to 1.55
  head.add(put(box(0.24, 0.24, 0.22), M.skin, 0, 0.14, 0));       // skull, 1.53 to 1.77
  head.add(put(box(0.26, 0.07, 0.24), M.hair, 0, 0.255, 0));      // hair, top at 1.80
  head.add(put(box(0.27, 0.08, 0.05), M.hair, 0, 0.20, -0.10));   // hair at the back
  head.add(put(box(0.045, 0.03, 0.02), M.hair, -0.06, 0.15, 0.11));
  head.add(put(box(0.045, 0.03, 0.02), M.hair, 0.06, 0.15, 0.11));

  const arm = (side) => {
    const g = new THREE.Group();
    g.position.set(SHOULDER_X * side, SHOULDER_Y, 0);
    g.add(put(cyl(0.068, 0.30), M.tunic, 0, -0.15, 0));   // sleeve
    g.add(put(cyl(0.056, 0.28), M.skin, 0, -0.44, 0));    // forearm
    g.add(put(box(0.10, 0.11, 0.09), M.skin, 0, -0.62, 0));
    torso.add(g);
    return g;
  };
  const armL = arm(-1), armR = arm(1);

  const leg = (side) => {
    const g = new THREE.Group();
    g.position.set(HIP_HALF * side, 0, 0);
    g.add(put(cyl(0.095, THIGH), M.trousers, 0, -THIGH / 2, 0));
    const shin = new THREE.Group();
    shin.position.y = -THIGH;
    shin.add(put(cyl(0.082, SHIN), M.trousers, 0, -SHIN / 2, 0));
    const boot = new THREE.Group();
    boot.position.y = -SHIN;
    boot.add(put(box(0.17, ANKLE_Y, 0.30), M.boots, 0, -ANKLE_Y / 2, 0.04));
    shin.add(boot);
    g.add(shin);
    hips.add(g);
    return { g, shin, boot };
  };
  const L = leg(-1), R = leg(1);

  return {
    group,
    parts: {
      hips, torso, head, armL, armR,
      legL: L.g, legR: R.g,
      shinL: L.shin, shinR: R.shin,
      bootL: L.boot, bootR: R.boot,
    },
  };
}

// Pose the rig from the gait state. Pure geometry, no time of its own beyond
// s.t, which only the idle breath reads.
export function poseCharacter(parts, s) {
  const stride = s.stride || STRIDE_WALK;
  const A = stride / 4;                    // half the foot excursion in body space
  const idle = clamp(s.idleMix == null ? (s.anim === 'idle' ? 1 : 0) : s.idleMix, 0, 1);
  const run = s.anim === 'run';
  const lift = run ? 0.20 : 0.12;

  // the hips ride exactly as high as a straight stance leg allows, which is
  // what gives a knee-jointed walk its bob without lifting the feet
  const walkHip = ANKLE_Y + Math.sqrt(Math.max(0.0001, (LEG * 0.995) ** 2 - A * A));
  const hipY = walkHip + (IDLE_HIP - walkHip) * idle;
  parts.hips.position.y = hipY;

  const legs = [[parts.legL, parts.shinL, parts.bootL, 0], [parts.legR, parts.shinR, parts.bootR, 0.5]];
  for (const [thighG, shinG, bootG, off] of legs) {
    const u = wrap01(s.phase / TAU + off);
    let fz, fy;
    if (u < 0.5) { fz = A * (1 - 4 * u); fy = ANKLE_Y; }              // stance: straight back, on the ground
    else { const k = (u - 0.5) * 2; fz = -A * Math.cos(Math.PI * k); fy = ANKLE_Y + lift * Math.sin(Math.PI * k); }
    fz *= (1 - idle);
    fy = ANKLE_Y + (fy - ANKLE_Y) * (1 - idle);
    const a = legIK(fz, fy - hipY);
    thighG.rotation.x = -a.thigh;
    shinG.rotation.x = a.thigh - a.shin;
    bootG.rotation.x = a.shin;             // the sole stays flat to the ground
  }

  const swing = Math.cos(s.phase) * (run ? 0.85 : 0.45) * (1 - idle);
  parts.armL.rotation.x = swing;
  parts.armR.rotation.x = -swing;
  const out = (run ? 0.14 : 0.07);
  parts.armL.rotation.z = out;
  parts.armR.rotation.z = -out;

  const lean = (run ? 10 * DEG : 3 * DEG) * (1 - idle);
  parts.torso.rotation.x = lean;
  parts.head.rotation.x = -lean * 0.6;     // he keeps looking where he is going

  const breath = idle * 0.015 * Math.sin(s.t * TAU * 0.5);
  parts.torso.scale.y = 1 + breath;
  parts.head.scale.y = 1 / (1 + breath);   // the chest rises, the skull does not stretch
}

// The controller, with no THREE in it. Mutates and returns the state object:
//   { x, y, z, vx, vz, vy, speed, yaw, phase, stride, t, anim, idleMix, blocked, airborne, peakY, landed }
//   move may carry jump: true for one frame to leave the ground.
//   After a step, s.landed is null or { fallMetres } for the frame he touched down.
export function stepPlayer(s, dt, move, heightAt) {
  dt = clamp(Number.isFinite(dt) ? dt : 0, 0, 0.1);
  const h = typeof heightAt === 'function' ? heightAt : () => 0;
  const m = move || {};
  s.landed = null;
  if (m.jump && !s.airborne) { s.airborne = true; s.vy = JUMP_V0; s.peakY = s.y; }

  // stick -> world axes
  let mx = clamp(m.x || 0, -1, 1), mz = clamp(m.z || 0, -1, 1);
  const mag = Math.hypot(mx, mz);
  if (mag > 1) { mx /= mag; mz /= mag; }
  const yaw = Number.isFinite(m.yaw) ? m.yaw : 0;
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  // Screen right is forward x up. With forward = (sin yaw, 0, cos yaw) that is
  // (-cos yaw, 0, sin yaw), NOT (cos yaw, 0, -sin yaw): a camera looking down +z
  // has its right hand at -x. Using the latter walked the player screen left on
  // every D press, which is the bug this comment exists to stop coming back.
  const wx = sy * mz - cy * mx;
  const wz = cy * mz + sy * mx;
  const want = Math.min(Math.hypot(wx, wz), 1);

  let vx = s.vx || 0, vz = s.vz || 0;
  const ox = vx, oz = vz;
  if (want > 1e-4) {
    const top = (m.sprint ? RUN_SPEED : WALK_SPEED) * want;
    const dx = (wx / want) * top - vx, dz = (wz / want) * top - vz;
    const dl = Math.hypot(dx, dz), step = ACCEL * dt;
    if (dl > step) { vx += (dx / dl) * step; vz += (dz / dl) * step; } else { vx += dx; vz += dz; }
  } else {
    const sp = Math.hypot(vx, vz), step = DECEL * dt;
    if (sp <= step) { vx = 0; vz = 0; } else { const k = (sp - step) / sp; vx *= k; vz *= k; }
  }

  // the step, refused where the ground stands up like a wall. A refused
  // diagonal is retried one axis at a time so he slides along the mountain
  // instead of gluing himself to it.
  const y0 = h(s.x, s.z);
  const ok = (nx, nz) => {
    const d = Math.hypot(nx - s.x, nz - s.z);
    if (d < 1e-9) return true;
    const ground = h(nx, nz);
    if (!Number.isFinite(ground)) return false;
    // in the air the only thing that stops you is a wall above your feet
    if (s.airborne) return ground <= s.y + WALL_STEP;
    return (ground - y0) / d <= MAX_SLOPE;
  };
  // trapezoid, not Euler: over a frame of changing speed the average velocity
  // is the honest one, and a second of walking then covers the distance the
  // arithmetic says it should rather than 4.6 cm more
  const mvx = (ox + vx) * 0.5, mvz = (oz + vz) * 0.5;
  const nx = s.x + mvx * dt, nz = s.z + mvz * dt;
  let moved = 0;
  s.blocked = false;
  if (ok(nx, nz)) { moved = Math.hypot(nx - s.x, nz - s.z); s.x = nx; s.z = nz; }
  else if (ok(nx, s.z)) { moved = Math.abs(nx - s.x); s.x = nx; vz = 0; s.blocked = true; }
  else if (ok(s.x, nz)) { moved = Math.abs(nz - s.z); s.z = nz; vx = 0; s.blocked = true; }
  else { vx = 0; vz = 0; s.blocked = true; }

  s.vx = vx; s.vz = vz;
  const ground = h(s.x, s.z);
  if (s.airborne) {
    s.vy -= GRAVITY * dt;
    s.y += s.vy * dt;
    if (s.y > s.peakY) s.peakY = s.y;
    if (s.y <= ground) {
      s.y = ground; s.airborne = false; s.vy = 0;
      s.landed = { fallMetres: Math.max(0, s.peakY - ground) };
    }
  } else if (ground < s.y - EDGE_DROP) {
    // the ground went away under him: he falls from where he was
    s.airborne = true; s.vy = 0; s.peakY = s.y;
  } else {
    s.y = ground;
  }
  s.speed = Math.hypot(vx, vz);

  // gait, with a little hysteresis so a sprint tapping in and out does not flicker
  const wasRun = s.anim === 'run';
  if (s.airborne) s.anim = 'air';
  else if (s.speed < 0.2) s.anim = 'idle';
  else if (s.speed > WALK_SPEED + (wasRun ? 0.2 : 0.5)) s.anim = 'run';
  else s.anim = 'walk';

  // the stride eases between gaits so the feet do not jump at the change
  const wantStride = s.anim === 'run' ? STRIDE_RUN : STRIDE_WALK;
  s.stride = (s.stride || STRIDE_WALK);
  s.stride += (wantStride - s.stride) * (1 - Math.exp(-4 * dt));

  // phase is a function of ground covered, never of time
  s.phase = (s.phase || 0) + (moved / s.stride) * TAU;
  if (s.phase > TAU * 1e6) s.phase %= TAU;

  // facing
  if (s.speed > 0.15) {
    const target = Math.atan2(vx, vz);
    let d = target - s.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    const cap = TURN_RATE * dt;
    s.yaw += clamp(d, -cap, cap);
    s.yaw = Math.atan2(Math.sin(s.yaw), Math.cos(s.yaw));
  }

  s.t = (s.t || 0) + dt;
  const idleTarget = s.anim === 'idle' ? 1 : 0;
  s.idleMix = (s.idleMix == null ? idleTarget : s.idleMix);
  s.idleMix += (idleTarget - s.idleMix) * (1 - Math.exp(-8 * dt));
  return s;
}

export function createPlayer(scene) {
  const { group, parts } = buildCharacter();
  if (scene && scene.add) scene.add(group);

  const s = { x: 0, y: 0, z: 0, vx: 0, vz: 0, vy: 0, speed: 0, yaw: 0, phase: 0, stride: STRIDE_WALK, t: 0, anim: 'idle', idleMix: 1, blocked: false, airborne: false, peakY: 0, landed: null };
  const pos = group.position;

  const api = {
    group, pos, parts, state: s,
    get yaw() { return s.yaw; },
    get speed() { return s.speed; },
    get anim() { return s.anim; },
    get airborne() { return s.airborne; },
    /** { fallMetres } on the frame he touched down, else null. Read it after update(). */
    get landed() { return s.landed; },
    update(dt, move, heightAt) {
      // Someone else may have pushed him about between frames. main.js does
      // it every frame underground, shoving him back onto the nearest floor
      // cell. Take the new spot, and take out only the part of his speed that
      // was heading into whatever pushed him, so he slides along the wall
      // instead of stalling and having to build his speed up again. A real
      // warp should go through teleport(), which stops him dead.
      if (pos.x !== s.x || pos.z !== s.z) {
        const dx = pos.x - s.x, dz = pos.z - s.z;
        const d = Math.hypot(dx, dz);
        s.x = pos.x; s.z = pos.z;
        if (d > 1e-9) {
          const ux = dx / d, uz = dz / d;
          const into = s.vx * ux + s.vz * uz;
          if (into < 0) { s.vx -= ux * into; s.vz -= uz * into; }
        }
      }
      stepPlayer(s, dt, move, heightAt);
      pos.set(s.x, s.y, s.z);
      group.rotation.y = s.yaw;
      poseCharacter(parts, s);
    },
    setVisible(v) { group.visible = !!v; },
    teleport(x, z, heightAt) {
      s.x = x; s.z = z; s.vx = 0; s.vz = 0; s.vy = 0; s.speed = 0; s.airborne = false; s.landed = null;
      s.y = typeof heightAt === 'function' ? heightAt(x, z) : 0;
      s.peakY = s.y;
      pos.set(s.x, s.y, s.z);
    },
    dispose() { if (group.parent) group.parent.remove(group); },
  };
  return api;
}
