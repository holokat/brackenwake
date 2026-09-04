// Low-poly hunted-deer MEAT drops for the Homestead game. When a deer is
// harvested the world shows a hearty raw cut; this module sculpts it.
//
// Follows the SAME contract as buildJunk / buildFish:
//   - buildMeat(id) returns a THREE.Group.
//   - The group faces +X (its natural "forward" / long axis is +X).
//   - Largest dimension ~1.2–1.6 world units, centred near the origin in X/Z,
//     resting so the bottom sits near y≈0 (a cut of meat lying on the ground).
// Deterministic: NO Math.random at load — every offset is a fixed constant so
// the drop looks identical every time.
//
// Sculpted from the SAME shared primitive helpers as the rest of the farm
// assets (flat-shaded, few segments) so the meat reads as one visual family.

import * as THREE from 'three';
import { mat, mesh, box, cyl, cone, ball } from './assets.js';

// ---------- palette (rich raw-meat reds, pale fat, exposed bone) ----------
const M = {
  meat: 0x9c3b32,       // deep meat-red / raspberry-brown muscle
  meatDeep: 0x832d26,   // shadowed underside of the muscle
  fat: 0xcaa38f,        // lighter fatty cap / silverskin
  fatPale: 0xd8b7a3,    // brightest fat highlight
  bone: 0xede3d0,       // exposed white bone stub
  boneEnd: 0xd8cbb0,    // slightly darker cut bone face
  steak: 0xa8443a,      // butchered steak red (a touch brighter than haunch)
  steakDeep: 0x8a3229,  // steak shadow tone
  marble: 0xd9b6a2,     // marbled fat rim / streaks
};

// ============================================================
// venison — a raw haunch/leg of venison, the classic "meat drop":
// a plump tapered muscle in deep meat-red with a lighter fatty cap and a
// short exposed white bone stub poking out the narrow (-X) end.
// ============================================================
function buildVenison() {
  const g = new THREE.Group();

  // Main muscle: a plump ovoid, fat at the +X hip end, tapering toward -X.
  // Built as a squashed sphere then scaled long so it reads as one big cut.
  const muscle = ball(0.5, M.meat, 0.92, 9);
  muscle.scale.set(1.5, 0.92, 0.98); // long along X, slightly flattened
  muscle.position.set(0.05, 0.5, 0);
  g.add(muscle);

  // Plump hip bulge at the thick +X end so the haunch reads meaty, not a pill.
  const hip = ball(0.44, M.meat, 1, 8);
  hip.scale.set(1.0, 0.95, 1.02);
  hip.position.set(0.5, 0.52, 0);
  g.add(hip);

  // A second smaller muscle group nestled beneath — gives the cut its plump,
  // two-lobed leg-of-venison silhouette and a shadowed underside.
  const underMuscle = ball(0.36, M.meatDeep, 0.85, 8);
  underMuscle.scale.set(1.25, 0.8, 0.92);
  underMuscle.position.set(0.2, 0.34, 0.04);
  g.add(underMuscle);

  // Tapering shank toward the -X end where the bone emerges.
  const shank = cone(0.3, 0.7, M.meat, 8);
  shank.rotation.z = Math.PI / 2; // point toward -X
  shank.position.set(-0.5, 0.5, 0);
  g.add(shank);

  // Fatty cap / silverskin over the top of the haunch (the lighter marbled
  // sheen that sits on a real cut of meat).
  const cap = ball(0.42, M.fat, 0.5, 8);
  cap.scale.set(1.35, 0.5, 0.9);
  cap.position.set(0.18, 0.78, -0.06);
  g.add(cap);
  // brighter fat highlight riding the crown of the cap
  const capHi = ball(0.24, M.fatPale, 0.45, 7);
  capHi.scale.set(1.3, 0.45, 0.85);
  capHi.position.set(0.32, 0.9, -0.02);
  g.add(capHi);
  // a little fat streak marbling the side
  const streak = box(0.6, 0.09, 0.05, M.fatPale);
  streak.rotation.z = 0.08;
  streak.position.set(0.15, 0.55, 0.46);
  g.add(streak);

  // Exposed white bone stub poking out the narrow -X end (the "leg" bone).
  const bone = cyl(0.11, 0.12, 0.5, M.bone, 8);
  bone.rotation.z = Math.PI / 2 - 0.04; // runs along X, slight droop
  bone.position.set(-0.95, 0.46, 0);
  g.add(bone);
  // rounded knuckle on the very end so it reads as a joint, not a dowel
  const knuckle = ball(0.15, M.bone, 0.9, 7);
  knuckle.scale.set(0.9, 1, 1);
  knuckle.position.set(-1.16, 0.46, 0);
  g.add(knuckle);
  // darker cut-face disc where the bone meets the meat
  const boneFace = cyl(0.12, 0.12, 0.05, M.boneEnd, 8);
  boneFace.rotation.z = Math.PI / 2;
  boneFace.position.set(-0.72, 0.47, 0);
  g.add(boneFace);

  return g;
}

// ============================================================
// meat_cut — a simpler butchered steak: a thick rounded slab of red meat
// with a marbled fatty rim, resting flat. Fallback / reuse.
// ============================================================
function buildMeatCut() {
  const g = new THREE.Group();

  // Thick rounded slab of muscle — a flattened ovoid lying on its face.
  const slab = ball(0.55, M.steak, 1, 10);
  slab.scale.set(1.25, 0.42, 1.0); // wide and thick, low profile
  slab.position.set(0, 0.28, 0);
  g.add(slab);

  // Shadowed underside so the slab has weight where it meets the ground.
  const under = ball(0.5, M.steakDeep, 1, 9);
  under.scale.set(1.2, 0.3, 0.95);
  under.position.set(0, 0.2, 0);
  g.add(under);

  // Marbled fatty rim ringing the cut (the pale band of fat on a steak).
  const rim = mesh(new THREE.TorusGeometry(0.6, 0.1, 6, 16), mat(M.marble));
  rim.rotation.x = Math.PI / 2;
  rim.scale.set(1.15, 0.9, 0.42); // hug the flattened slab's edge
  rim.position.set(0, 0.28, 0);
  g.add(rim);

  // A couple of marbling streaks across the top face.
  const streak1 = box(0.7, 0.04, 0.1, M.marble);
  streak1.rotation.y = 0.3;
  streak1.position.set(0.05, 0.47, 0.08);
  g.add(streak1);
  const streak2 = box(0.5, 0.04, 0.08, M.marble);
  streak2.rotation.y = -0.5;
  streak2.position.set(-0.12, 0.47, -0.14);
  g.add(streak2);

  // A small nub of thicker fat on one edge for character.
  const fatNub = ball(0.16, M.fatPale, 0.7, 6);
  fatNub.position.set(0.62, 0.3, 0.18);
  g.add(fatNub);

  return g;
}

// ---------- public API ----------

export const MEAT_MODEL_IDS = ['venison', 'meat_cut'];

export function buildMeat(id) {
  switch (id) {
    case 'venison': return buildVenison();
    case 'meat_cut': return buildMeatCut();
    // Unknown ids fall through to venison so callers never get null.
    default: return buildVenison();
  }
}
