// First-person BOW viewmodel for the Homestead game — a low-poly bow the game
// parents to the camera so the player looks past it into the scene. It animates
// a nock-and-draw: the game translates userData.arrow toward the camera (+Z) to
// pull the string, then back to rest / release.
//
// Sculpted from the SAME shared primitive helpers as the rest of the farm
// assets (flat-shaded, few segments) so the bow reads as one visual family.
//
// CAMERA-SPACE ORIENTATION (this is attached to a camera looking down -Z):
//   - The arrow points toward -Z (into the view). The arrowhead is at the -Z
//     (far) end; the fletching/nock is at the +Z (near/camera) end.
//   - The bow is held with its limbs running vertically (along Y), the riser
//     and grip near the middle at x≈0, the bow plane facing the camera.
//   - Roughly 1.5 units tall (Y); the arrow is ~1.6 units long along Z; the
//     grip sits near the origin.
//
// Deterministic: NO Math.random — every offset is a fixed constant.

import * as THREE from 'three';
import { P, mat, mesh, box, cyl, cone, ball, tube } from './assets.js';

// ---------- local palette ----------
const B = {
  wood: P.wood, woodDark: P.woodDark, woodLight: P.woodLight,
  laminDark: 0x4a3320, laminDeep: 0x33241a, // tier-2 laminated composite
  leather: 0x5a3a22, leatherDark: 0x412a18,
  cord: 0xe4ddca, cordShade: 0xc7bfa8, // bowstring
  metal: 0x3a3a40, metalDark: 0x26262b, // tier-2 cams / hardware
  shaft: 0xcaa877, nock: 0x2f2b26,
  head: 0x9a938a, headEdge: 0xbfb9ad,
  vaneA: 0xc23b2e, vaneB: 0xe4ddca,
};

// A cylinder stretched between two world-space points (string / cable / strut).
function strut(a, b, r, color, seg = 6, o) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length() || 0.0001;
  const m = cyl(r, r, len, color, seg, o);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  return m;
}

// ---------- key layout constants (shared by both tiers) ----------
const TIP_Y = 0.72;      // limb tips at ±TIP_Y
const TIP_Z = -0.05;     // limb tips sit slightly forward (into the scene)
const REST = new THREE.Vector3(0.06, 0, 0.55); // nock point at fully-drawn-ready

// ============================================================
// arrow — its own child group so the game can slide it along Z
//   nock (back) at local z≈0 (+Z, camera side)
//   head (tip)  toward -Z (forward, into the scene)
// ============================================================
function buildArrow() {
  const a = new THREE.Group();
  const L = 1.45; // shaft length along Z

  // shaft: a thin cylinder laid along Z (cylinder's +Y end swings to +Z)
  const shaft = cyl(0.024, 0.02, L, B.shaft, 6);
  shaft.rotation.x = Math.PI / 2;
  shaft.position.z = -L / 2;
  a.add(shaft);

  // arrowhead: a slim metal broadhead pointing toward -Z
  const head = cone(0.07, 0.2, B.head, 4, { metalness: 0.5, roughness: 0.4 });
  head.rotation.x = -Math.PI / 2;
  head.position.z = -L - 0.06;
  a.add(head);
  const collar = cyl(0.03, 0.03, 0.06, B.headEdge, 6, { metalness: 0.4, roughness: 0.4 });
  collar.rotation.x = Math.PI / 2;
  collar.position.z = -L + 0.02;
  a.add(collar);

  // nock: little slotted end cap at the +Z (camera) tip where it meets the string
  const nockCap = cyl(0.036, 0.03, 0.08, B.nock, 6);
  nockCap.rotation.x = Math.PI / 2;
  nockCap.position.z = 0.02;
  a.add(nockCap);

  // fletching: three flat vanes near the nock, 120° apart
  for (let i = 0; i < 3; i++) {
    const ang = (i / 3) * Math.PI * 2;
    const vane = box(0.012, 0.16, 0.24, i === 0 ? B.vaneA : B.vaneB);
    vane.position.set(Math.cos(ang) * 0.06, Math.sin(ang) * 0.06, -0.2);
    vane.rotation.z = ang;
    a.add(vane);
  }

  a.position.copy(REST);
  return a;
}

// ============================================================
// a single limb — a recurve tube from the riser out to the tip
//   sign = +1 for the upper limb, -1 for the lower limb
// ============================================================
function buildLimb(sign, woodColor) {
  const y0 = sign * 0.28;
  const yt = sign * TIP_Y;
  const pts = [
    new THREE.Vector3(0, y0, 0.02),
    new THREE.Vector3(0, sign * 0.46, -0.02),
    new THREE.Vector3(0, sign * 0.62, TIP_Z - 0.02),
    new THREE.Vector3(0, yt, TIP_Z + 0.05), // recurve hook flicks back toward camera
  ];
  return tube(pts, 0.045, woodColor, 5);
}

// ============================================================
// bow viewmodel
// ============================================================
export function buildBowViewmodel(tier = 1) {
  const t = tier === 2 ? 2 : 1;
  const g = new THREE.Group();

  const woodColor = t === 2 ? B.laminDark : B.wood;
  const woodAccent = t === 2 ? B.laminDeep : B.woodDark;

  // ---- riser: a vertical bar at the grip, thin in Z (bow plane faces camera)
  const riser = box(0.11, 0.62, 0.09, woodColor);
  riser.position.set(0, 0, 0.0);
  g.add(riser);
  // a shaped belly bump behind the grip
  const belly = box(0.13, 0.34, 0.13, woodAccent);
  belly.position.set(-0.02, 0, -0.03);
  g.add(belly);

  // ---- leather grip wrap around the middle of the riser
  const grip = cyl(0.075, 0.08, 0.3, B.leather, 8);
  grip.position.set(0, 0, 0);
  g.add(grip);
  for (const gy of [-0.09, 0, 0.09]) {
    const wrap = cyl(0.083, 0.083, 0.02, B.leatherDark, 8);
    wrap.position.y = gy;
    g.add(wrap);
  }

  // ---- arrow rest: a small shelf the arrow lies on, on the +x side of the riser
  const rest = box(0.11, 0.03, 0.09, woodAccent);
  rest.position.set(0.07, 0.02, 0.02);
  g.add(rest);

  // ---- limbs (upper + lower)
  g.add(buildLimb(1, woodColor));
  g.add(buildLimb(-1, woodColor));
  // limb-to-riser fade caps
  for (const s of [1, -1]) {
    const cap = cyl(0.06, 0.05, 0.14, woodAccent, 6);
    cap.position.set(0, s * 0.3, 0.01);
    g.add(cap);
  }

  const tipTop = new THREE.Vector3(0, TIP_Y, TIP_Z + 0.05);
  const tipBot = new THREE.Vector3(0, -TIP_Y, TIP_Z + 0.05);

  // ---- tier 2 extras: dark metal cam wheels + twin cables ----
  let strTop = tipTop.clone();
  let strBot = tipBot.clone();
  if (t === 2) {
    // cam wheels at each limb tip — torus lies in the XY plane, hole facing Z,
    // so the wheels read face-on to the camera
    for (const [ty, s] of [[TIP_Y, 1], [-TIP_Y, -1]]) {
      const wheelC = new THREE.Vector3(0, ty, TIP_Z + 0.03);
      const wheel = mesh(new THREE.TorusGeometry(0.12, 0.04, 6, 12), mat(B.metal, { metalness: 0.6, roughness: 0.4 }));
      wheel.position.copy(wheelC);
      g.add(wheel);
      const hub = cyl(0.045, 0.045, 0.1, B.metalDark, 8, { metalness: 0.6, roughness: 0.4 });
      hub.rotation.x = Math.PI / 2;
      hub.position.copy(wheelC);
      g.add(hub);
      const axle = cyl(0.02, 0.02, 0.14, B.headEdge, 6, { metalness: 0.5 });
      axle.rotation.x = Math.PI / 2;
      axle.position.copy(wheelC);
      g.add(axle);
      // the string now leaves the RIM of the cam nearest the nock
      const anchor = wheelC.clone();
      anchor.y -= s * 0.11;
      if (s > 0) strTop = anchor; else strBot = anchor;
      // twin cables run tip-to-tip, offset either side of the bow plane
      for (const dz of [-0.09, 0.09]) {
        const ca = wheelC.clone(); ca.z += dz;
        const cb = new THREE.Vector3(0, -ty, TIP_Z + 0.03 + dz);
        g.add(strut(ca, cb, 0.012, B.metalDark, 5));
      }
    }
  }

  // ---- bowstring: two halves drawn from each limb tip to the nock point.
  // At the fully-drawn-ready REST position they form the classic drawn V.
  const nock = new THREE.Object3D();
  nock.position.copy(REST);
  g.add(nock);

  const stringTop = strut(strTop, REST, 0.014, B.cord, 5);
  const stringBottom = strut(strBot, REST, 0.014, B.cord, 5);
  g.add(stringTop, stringBottom);
  // a little serving wrap at the nock point
  const serving = cyl(0.022, 0.022, 0.11, B.cordShade, 6);
  serving.position.copy(REST);
  serving.rotation.x = 0.2;
  g.add(serving);

  // ---- arrow (own group, at the fully-drawn-ready rest spot)
  const arrow = buildArrow();
  g.add(arrow);

  g.userData.arrow = arrow;
  g.userData.nock = nock;
  g.userData.stringTop = stringTop;
  g.userData.stringBottom = stringBottom;
  g.userData.tier = t;
  return g;
}

export const BOW_VIEWMODEL_TIERS = [1, 2];
