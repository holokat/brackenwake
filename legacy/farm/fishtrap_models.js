// Low-poly WICKER FISH TRAP (crab-pot style) for the Homestead game.
// A woven withy cage that is placed IN water — a lake or a stream — so it is
// modelled to read well half-submerged: the barrel of the cage is centred
// vertically around y = 0, so the WATERLINE (y = 0) cuts through its middle.
// The lower half of the cage sits underwater, and a little red-and-white
// buoy pokes up above the surface on a short rope.
//
// Follows the same contract as the fish / junk models:
//   - buildFishTrap() returns a THREE.Group.
//   - The group faces +X — the funnel entrance mouth opens toward +X.
//   - Centred in X and Z, largest dimension ~1.6 world units.
//   - Deterministic: NO Math.random — every offset is a fixed literal.
//
// Sculpted from the SAME shared primitive helpers as the rest of the farm
// assets (flat-shaded, few segments) so it reads as one visual family.

import * as THREE from 'three';
import { mat, mesh, box, cyl, cone, ball, tube } from './assets.js';

// ---------- palette (warm woven wicker, weathered rope, painted buoy) ----------
const T = {
  wicker: 0xb98a4e, wickerDark: 0xa9763f, wickerRim: 0xc79a5c,
  mawDark: 0x3a2a18,           // shadowed funnel throat / entrance hole
  rope: 0x8a7a5a,
  buoyRed: 0xc0392b, buoyWhite: 0xece4d2, buoyCap: 0x9c2f22,
};

// The cage is a barrel woven from vertical staves banded by horizontal rings.
// Its centre is at y = 0 (the waterline) and it spans y = -0.5 .. +0.5.
const HALF = 0.5;              // cage half-height -> full height 1.0
const R_MID = 0.56;           // radius at the barrel's fat middle
const R_END = 0.48;           // radius at the pinched top & bottom

// Barrel radius at a given height t in -1..1 (0 = middle) — a gentle bulge.
function radiusAt(t) {
  return R_END + (R_MID - R_END) * (1 - t * t);
}

// One horizontal woven band: a flat-lying torus ring hugging the barrel.
function ring(y, color) {
  const t = y / HALF;
  const r = radiusAt(t);
  const band = mesh(new THREE.TorusGeometry(r, 0.045, 5, 14), mat(color));
  band.rotation.x = Math.PI / 2; // lie flat, horizontal around the barrel
  band.position.y = y;
  return band;
}

export function buildFishTrap() {
  const g = new THREE.Group();

  // ---- vertical staves woven around the barrel ----
  // 14 thin uprights on the barrel circle, alternating wicker tones. Each is
  // slightly leaned so the middle bulges — cheap barrel curvature.
  const staves = 14;
  for (let i = 0; i < staves; i++) {
    const a = (i / staves) * Math.PI * 2;
    const r = radiusAt(0) * 0.99;
    const stave = cyl(0.03, 0.035, HALF * 2 * 1.02, i % 2 ? T.wicker : T.wickerDark, 4);
    stave.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    // tip the top of each stave slightly inward so the barrel pinches at the ends
    stave.rotation.z = Math.cos(a) * 0.12;
    stave.rotation.x = -Math.sin(a) * 0.12;
    g.add(stave);
  }

  // ---- horizontal weave bands ----
  for (const y of [-0.45, -0.22, 0, 0.22, 0.45]) {
    g.add(ring(y, y === 0 ? T.wickerRim : T.wicker));
  }

  // ---- pinched cap rings top & bottom (dome the barrel a touch) ----
  const topCap = cyl(0.28, R_END, 0.14, T.wickerDark, 12);
  topCap.position.y = HALF + 0.02;
  g.add(topCap);
  const topKnob = ball(0.16, T.wickerRim, 0.7, 7);
  topKnob.position.y = HALF + 0.12;
  g.add(topKnob);

  const botCap = cyl(R_END, 0.26, 0.14, T.wickerDark, 12);
  botCap.position.y = -HALF - 0.02;
  g.add(botCap);

  // ---- funnel entrance on the +X face (the trap faces +X) ----
  // A dark recessed throat: an inward-tapering cone opening toward +X, ringed
  // by a raised woven collar so the mouth reads as a woven funnel.
  const collar = mesh(new THREE.TorusGeometry(0.2, 0.055, 5, 12), mat(T.wickerRim));
  collar.rotation.y = Math.PI / 2;      // ring stands upright, facing +X
  collar.position.set(R_MID - 0.02, 0, 0);
  g.add(collar);

  const maw = cone(0.19, 0.42, T.mawDark, 10, { roughness: 0.98 });
  maw.rotation.z = Math.PI / 2;          // tip points -X, into the trap
  maw.position.set(R_MID - 0.14, 0, 0);
  g.add(maw);

  // a small dark disc plugging the throat's far end so no light shows through
  const throatBack = cyl(0.05, 0.05, 0.02, T.mawDark, 8);
  throatBack.rotation.z = Math.PI / 2;
  throatBack.position.set(R_MID - 0.34, 0, 0);
  g.add(throatBack);

  // ---- tether + float buoy bobbing above the surface ----
  // rope rises from the top knob (y ~ 0.5) up to the buoy above y = 0.
  g.add(tube([
    new THREE.Vector3(0, HALF + 0.05, 0.02),
    new THREE.Vector3(0.03, 0.72, 0.05),
    new THREE.Vector3(0.02, 0.9, 0.06),
  ], 0.02, T.rope, 4));

  // buoy: a short red-and-white float, well clear of the waterline.
  const buoyLo = cyl(0.15, 0.13, 0.16, T.buoyRed, 9);
  buoyLo.position.set(0.02, 1.0, 0.06);
  g.add(buoyLo);
  const buoyStripe = cyl(0.155, 0.155, 0.07, T.buoyWhite, 9);
  buoyStripe.position.set(0.02, 1.11, 0.06);
  g.add(buoyStripe);
  const buoyHi = cyl(0.13, 0.15, 0.14, T.buoyRed, 9);
  buoyHi.position.set(0.02, 1.21, 0.06);
  g.add(buoyHi);
  const buoyCap = ball(0.11, T.buoyCap, 0.8, 7);
  buoyCap.position.set(0.02, 1.3, 0.06);
  g.add(buoyCap);

  return g;
}
