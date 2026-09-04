// Low-poly flying birds for the Homestead game.
// Flat-shaded, low-poly, matching the assets.js style (helpers + P palette).
//
// Convention for every builder:
//   - returns a THREE.Group whose ORIGIN is the bird's center
//   - the bird faces +X (forward = +X), wings spread along Z (+Z = left, -Z = right)
//   - body length ~1.2-1.8 units
//   - group.userData.wings = { left, right }
//       each wing is a child GROUP whose pivot sits at the shoulder joint, so the
//       flight system flaps by rotating wing.rotation.z (dihedral flap) and/or
//       wing.rotation.x (fore/aft sweep). Left wing lives at +Z, right at -Z.

import * as THREE from 'three';
import { mat, box, cyl, cone, ball } from './assets.js';

// ---------- small local helpers ----------

// A flat, tapered, clearly wing-shaped panel built from a custom triangle strip.
// Root sits at local origin (the shoulder). The wing extends along +Z (span),
// chord along X, thin along Y. `sign` = +1 for the left wing, -1 for the right,
// so the leading edge faces forward for both.
function wingPanel(span, chordRoot, chordTip, color, sign = 1, sweep = 0.35) {
  const s = sign;
  // Vertices in the X-Z plane (y = 0), a swept, tapered planform.
  // x = chordwise (forward +X), z = spanwise (outboard = s*span).
  const cr = chordRoot, ct = chordTip, sp = span, sw = sweep;
  const verts = new Float32Array([
    //  leading root         leading tip          trailing tip         trailing root
     cr * 0.5, 0, 0,       cr * 0.5 - sw, 0, s * sp,   -ct * 0.5 - sw, 0, s * sp,   -cr * 0.5, 0, 0,
  ]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  // Two triangles; wind so the up-face normal is +Y for the left wing.
  const idx = s > 0
    ? [0, 1, 2, 0, 2, 3]
    : [0, 2, 1, 0, 3, 2];
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat(color, { side: THREE.DoubleSide }));
  m.castShadow = true;
  return m;
}

// A thin flat feather quad (used for wingtips / tail bands), lying in X-Z plane.
function feather(len, wid, color, sign = 1) {
  const g = box(len, 0.03, wid, color);
  g.position.z = sign * wid * 0.5;
  return g;
}

// Build a wing as a pivoting child group placed at the shoulder.
function makeWing({ span, chordRoot, chordTip, color, tipColor, sign, feathers = 3, sweep = 0.35 }) {
  const g = new THREE.Group();
  const panel = wingPanel(span, chordRoot, chordTip, color, sign, sweep);
  g.add(panel);

  // Layered flight feathers along the trailing edge for a low-poly plumage read.
  if (tipColor) {
    for (let i = 0; i < feathers; i++) {
      const t = (i + 1) / (feathers + 1);
      const fl = chordTip * (0.9 - t * 0.3);
      const f = box(fl, 0.025, span * 0.16, tipColor);
      f.position.set(-chordRoot * 0.28 - span * 0.34 * t, -0.01, sign * (span * 0.6 + span * 0.16 * i));
      f.rotation.y = sign * 0.25;
      g.add(f);
    }
  }
  return g;
}

// ---------- Robin: small, plump songbird ----------

export function buildRobin() {
  const G = new THREE.Group();
  const BACK = 0x7a6a58;    // brown-grey
  const BREAST = 0xd9642e;  // warm orange-red
  const BEAK = 0xf0c040;
  const EYE = 0x1a1512;

  // Plump body: two overlapping squashed balls (back + belly).
  const body = ball(0.55, BACK, 0.9, 8);
  body.scale.set(1.25, 0.9, 0.95);
  G.add(body);

  const breast = ball(0.42, BREAST, 1, 8);
  breast.scale.set(1.0, 1.05, 0.92);
  breast.position.set(0.34, -0.08, 0);
  G.add(breast);

  // Round head.
  const head = ball(0.36, BACK, 1, 8);
  head.position.set(0.72, 0.28, 0);
  G.add(head);
  // A touch of orange on the face.
  const cheek = ball(0.22, BREAST, 1, 7);
  cheek.position.set(0.9, 0.16, 0);
  cheek.scale.set(0.8, 0.9, 1.0);
  G.add(cheek);

  // Small triangular beak, pointing +X.
  const beak = cone(0.1, 0.32, BEAK, 5);
  beak.rotation.z = -Math.PI / 2;
  beak.position.set(1.06, 0.22, 0);
  G.add(beak);

  // Eyes.
  for (const s of [1, -1]) {
    const eye = ball(0.055, EYE, 1, 6);
    eye.position.set(0.94, 0.34, s * 0.19);
    G.add(eye);
  }

  // Short perky tail (fanned back and slightly up).
  const tail = box(0.5, 0.06, 0.34, BACK);
  tail.position.set(-0.72, 0.06, 0);
  tail.rotation.z = 0.35;
  G.add(tail);

  // Rounded wings — short, plump, with a couple of darker feathers.
  const wingCfg = (sign) => ({
    span: 0.85, chordRoot: 0.62, chordTip: 0.34,
    color: BACK, tipColor: 0x5d5040, sign, feathers: 2, sweep: 0.25,
  });
  const left = makeWing(wingCfg(1));
  const right = makeWing(wingCfg(-1));
  left.position.set(0.05, 0.22, 0.2);
  right.position.set(0.05, 0.22, -0.2);
  G.add(left, right);

  G.userData.wings = { left, right };
  G.userData.species = 'robin';
  return G;
}

// ---------- Crane: tall, elegant white heron/crane ----------

export function buildCrane() {
  const G = new THREE.Group();
  const WHITE = 0xf2f0e8;
  const BLACK = 0x2c2c2c;
  const BEAK = 0xe0b83a;
  const LEG = 0x3a3230;
  const EYE = 0x141210;

  // Long slender body.
  const body = ball(0.5, WHITE, 1, 8);
  body.scale.set(1.7, 0.85, 0.85);
  body.position.set(-0.1, 0, 0);
  G.add(body);

  // Rear taper toward tail.
  const rump = ball(0.34, WHITE, 1, 7);
  rump.scale.set(1.5, 0.8, 0.8);
  rump.position.set(-0.9, 0.02, 0);
  G.add(rump);

  // Curved S-neck built from a stack of shrinking segments.
  const neckPts = [
    [0.55, 0.15, 0], [0.78, 0.42, 0], [0.86, 0.72, 0],
    [0.8, 1.0, 0], [0.92, 1.24, 0], [1.16, 1.36, 0],
  ];
  for (let i = 0; i < neckPts.length; i++) {
    const [x, y, z] = neckPts[i];
    const seg = ball(0.15 - i * 0.006, WHITE, 1, 6);
    seg.position.set(x, y, z);
    G.add(seg);
  }

  // Head at the top of the neck.
  const head = ball(0.2, WHITE, 1, 7);
  head.position.set(1.28, 1.4, 0);
  G.add(head);
  // Red crown patch (classic crane).
  const crown = ball(0.11, 0xc23a2a, 1, 6);
  crown.position.set(1.28, 1.54, 0);
  crown.scale.set(1.0, 0.7, 0.9);
  G.add(crown);

  // Long straight beak, pointing +X.
  const beak = cone(0.08, 0.72, BEAK, 5);
  beak.rotation.z = -Math.PI / 2;
  beak.position.set(1.68, 1.38, 0);
  G.add(beak);

  for (const s of [1, -1]) {
    const eye = ball(0.04, EYE, 1, 6);
    eye.position.set(1.4, 1.46, s * 0.11);
    G.add(eye);
  }

  // Long thin legs trailing straight back behind (as in flight).
  for (const s of [1, -1]) {
    const thigh = cyl(0.045, 0.05, 1.1, LEG, 5);
    thigh.rotation.z = Math.PI / 2;
    thigh.position.set(-1.35, -0.05, s * 0.14);
    G.add(thigh);
    const shin = cyl(0.03, 0.045, 0.9, LEG, 5);
    shin.rotation.z = Math.PI / 2;
    shin.position.set(-2.25, -0.08, s * 0.12);
    G.add(shin);
    // Trailing foot.
    const foot = box(0.22, 0.03, 0.06, LEG);
    foot.position.set(-2.78, -0.09, s * 0.12);
    G.add(foot);
  }

  // Short tail plume.
  const tail = box(0.42, 0.05, 0.4, WHITE);
  tail.position.set(-1.35, 0.05, 0);
  G.add(tail);

  // Broad graceful wings with black wingtips.
  const wingCfg = (sign) => ({
    span: 1.7, chordRoot: 0.8, chordTip: 0.42,
    color: WHITE, tipColor: BLACK, sign, feathers: 4, sweep: 0.5,
  });
  const left = makeWing(wingCfg(1));
  const right = makeWing(wingCfg(-1));
  left.position.set(-0.05, 0.18, 0.28);
  right.position.set(-0.05, 0.18, -0.28);
  G.add(left, right);

  G.userData.wings = { left, right };
  G.userData.species = 'crane';
  return G;
}

// ---------- Blue Jay: striking blue with crest ----------

export function buildBluejay() {
  const G = new THREE.Group();
  const BLUE = 0x3a7bd5;
  const BLUEDARK = 0x2b5fa8;
  const BELLY = 0xf0f0f0;
  const BAND = 0x1a1a1a;   // black neck band
  const BEAK = 0x2a2a2a;
  const EYE = 0x0c0c0c;

  // Body: blue back + pale belly.
  const body = ball(0.5, BLUE, 1, 8);
  body.scale.set(1.35, 0.92, 0.92);
  G.add(body);

  const belly = ball(0.4, BELLY, 1, 8);
  belly.scale.set(1.1, 0.95, 0.9);
  belly.position.set(0.24, -0.16, 0);
  G.add(belly);

  // Black neck band.
  const band = cyl(0.42, 0.44, 0.16, BAND, 8);
  band.rotation.z = Math.PI / 2;
  band.position.set(0.5, 0.02, 0);
  G.add(band);

  // Round blue head.
  const head = ball(0.34, BLUE, 1, 8);
  head.position.set(0.78, 0.26, 0);
  G.add(head);
  // Pale face patch.
  const face = ball(0.2, BELLY, 1, 7);
  face.position.set(0.94, 0.14, 0);
  face.scale.set(0.85, 0.9, 1.0);
  G.add(face);

  // Crest — a small stack of blue cones on the crown.
  for (let i = 0; i < 3; i++) {
    const spike = cone(0.09 - i * 0.015, 0.26, BLUEDARK, 5);
    spike.position.set(0.72 - i * 0.12, 0.56 + i * 0.02, 0);
    spike.rotation.z = 0.3 - i * 0.12;
    G.add(spike);
  }

  // Pointed beak.
  const beak = cone(0.09, 0.34, BEAK, 5);
  beak.rotation.z = -Math.PI / 2;
  beak.position.set(1.12, 0.2, 0);
  G.add(beak);

  for (const s of [1, -1]) {
    const eye = ball(0.05, EYE, 1, 6);
    eye.position.set(0.98, 0.3, s * 0.18);
    G.add(eye);
  }

  // Medium tail with darker bands.
  const tail = box(0.8, 0.06, 0.36, BLUE);
  tail.position.set(-0.85, 0.06, 0);
  G.add(tail);
  for (let i = 0; i < 3; i++) {
    const bandSeg = box(0.08, 0.07, 0.36, BAND);
    bandSeg.position.set(-0.62 - i * 0.22, 0.06, 0);
    G.add(bandSeg);
  }
  // Tail tip white.
  const tailTip = box(0.1, 0.06, 0.36, BELLY);
  tailTip.position.set(-1.2, 0.06, 0);
  G.add(tailTip);

  // Wings — blue with black barred flight feathers.
  const wingCfg = (sign) => ({
    span: 1.15, chordRoot: 0.68, chordTip: 0.36,
    color: BLUE, tipColor: BAND, sign, feathers: 3, sweep: 0.4,
  });
  const left = makeWing(wingCfg(1));
  const right = makeWing(wingCfg(-1));
  left.position.set(0.0, 0.2, 0.24);
  right.position.set(0.0, 0.2, -0.24);
  G.add(left, right);

  G.userData.wings = { left, right };
  G.userData.species = 'bluejay';
  return G;
}

// ---------- manifest ----------

export const BIRD_SPECIES = ['robin', 'crane', 'bluejay'];
export const BIRDS = { robin: buildRobin, crane: buildCrane, bluejay: buildBluejay };
