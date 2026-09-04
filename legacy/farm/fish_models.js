// Low-poly catchable fish for the Homestead game — all 36 species from the
// fishing tables (src/farm/fishing.js), procedurally sculpted from the shared
// primitive helpers to match the farm-asset style (flat-shaded, few segments).
//
// Convention for every fish (they get shown leaping from the water and held up
// on the line, so this contract is exact):
//   - buildFish(id) returns a THREE.Group whose ORIGIN is the fish's CENTER.
//   - The fish faces +X: nose at +X, tail at -X. Body length ~1.6 units
//     (leaner/shorter for a minnow, longer for a marlin).
//   - Body is a lean, streamlined ellipsoid; every fish carries a caudal
//     (tail) fin at -X, a dorsal fin on top, two pectoral fins and an eye.
//   - group.userData.tail = <tailFinGroup> — a child GROUP pivoting at the
//     tail base, so the game wags `tail.rotation.y` for a swim wiggle.
//   - group.userData.species = id.
// Deterministic: no Math.random at load — all variation is fixed per id.

import * as THREE from 'three';
import { mat, box, cyl, cone, ball } from './assets.js';

// ---------- small local fin helpers ----------

// A flat fin from a 2-D outline in the local XY plane (thin in Z). Used for
// caudal + dorsal fins (both are vertical, planar membranes) and, once
// rotated, for pectorals.
function finMesh(pts, color, opts) {
  const s = new THREE.Shape();
  s.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
  s.closePath();
  const g = new THREE.ShapeGeometry(s);
  const m = new THREE.Mesh(g, mat(color, { side: THREE.DoubleSide, ...opts }));
  m.castShadow = true;
  return m;
}

// Outline for the caudal fin. Attaches at local x=0 and sweeps toward -X.
function caudalPoints(kind, len, spread) {
  const b = 0.06; // half-height where it meets the peduncle
  switch (kind) {
    case 'round': // koi / carp — soft convex fan
      return [[0, b], [-len * 0.7, spread], [-len, spread * 0.35], [-len, -spread * 0.35], [-len * 0.7, -spread], [0, -b]];
    case 'fan': // flowing showy tail (koi, dragon carp)
      return [[0, b], [-len * 0.55, spread * 1.1], [-len, spread * 0.75], [-len * 1.15, 0], [-len, -spread * 0.75], [-len * 0.55, -spread * 1.1], [0, -b]];
    case 'crescent': // fast ocean fish (tuna, marlin) — deep stiff fork
      return [[0, 0.05], [-len * 0.9, spread], [-len * 0.32, 0], [-len * 0.9, -spread], [0, -0.05]];
    case 'lobe': // rounded single paddle (eels, mudskipper)
      return [[0, b], [-len, spread], [-len * 1.1, 0], [-len, -spread], [0, -b]];
    case 'fork':
    default: // standard forked caudal
      return [[0, b], [-len, spread], [-len * 0.55, 0], [-len, -spread], [0, -b]];
  }
}

// A pectoral fin: small flat triangle laid on the body's side.
function pectoral(len, wid, color, sign) {
  const fin = finMesh([[0, 0.05], [-len, wid], [-len, -wid * 0.35]], color);
  fin.rotation.x = sign * Math.PI / 2; // lay flat, extending outward in Z
  fin.rotation.z = 0.15;               // slight backward/down rake
  return fin;
}

// ---------- shared body builder ----------
// Every "normal" (non-eel) fish is built from this. Pass a spec; sensible
// defaults keep each call short. Returns { group, tail }.
function buildBody(spec) {
  let {
    len = 1.6, depth = 0.46, girth = 0.34,
    body = 0x8a8148, belly = 0xcabf7e, back = null,
    finCol = 0x6f6738, dorsalCol = null,
    snout = 'round', billLen = 0,
    tailKind = 'fork', tailLen = 0.5, tailSpread = 0.34,
    dorsalLen = 0.5, dorsalH = 0.3, dorsalX = 0.02, spinyDorsal = false,
    pecLen = 0.32, pecWid = 0.2,
    eyeR = 0.055, eyeCol = 0x14100c, eyeY = 0.1, eyeOnTop = false,
    barbels = 0, barbelLen = 0.32,
    spots = 0, spotCol = 0x2c2419,
    bars = 0, barCol = null,
    lateral = null, // [color] pink/silver lateral stripe
    shine = false, glow = null, seg = 8,
  } = spec;

  // --- Lean pass ---------------------------------------------------------
  // Slim every body ~36% in girth: both the vertical Y radius (depth) and
  // the lateral Z radius (girth). LENGTH (X) is left untouched so each
  // species keeps its silhouette/proportions. Eyes shrink ~45% and the eye
  // line is pulled in with the leaner body so eyeballs sit flush, not
  // bulging. The head meshes below slim FURTHER than this (see their own
  // factors) so the front third tapers cleanly to the snout.
  depth *= 0.64;
  girth *= 0.64;
  eyeR *= 0.55;
  eyeY *= 0.64;
  pecWid *= 0.85;

  const g = new THREE.Group();
  const bodyOpts = {};
  if (shine) { bodyOpts.roughness = 0.45; bodyOpts.metalness = 0.35; }
  if (glow) { bodyOpts.emissive = glow; bodyOpts.emissiveIntensity = 0.45; }
  const finC = dorsalCol || finCol;

  // Main streamlined body — one stretched ellipsoid.
  const main = ball(0.5, body, 1, seg, bodyOpts);
  main.scale.set(len * 0.86, depth, girth);
  g.add(main);

  // A slimmer peduncle toward the tail so the body reads lean, not fat.
  const ped = ball(0.5, body, 1, 6, bodyOpts);
  ped.scale.set(len * 0.5, depth * 0.5, girth * 0.55);
  ped.position.set(-len * 0.34, 0, 0);
  g.add(ped);

  // Lighter belly underside.
  const bel = ball(0.5, belly, 1, seg, glow ? bodyOpts : {});
  bel.scale.set(len * 0.66, depth * 0.55, girth * 0.9);
  bel.position.set(len * 0.02, -depth * 0.3, 0);
  g.add(bel);

  // Optional darker back / dorsal shading.
  if (back) {
    const bk = ball(0.5, back, 1, seg);
    bk.scale.set(len * 0.7, depth * 0.4, girth * 0.85);
    bk.position.set(len * 0.04, depth * 0.32, 0);
    g.add(bk);
  }

  // Optional lateral stripe (trout/char line).
  if (lateral) {
    const line = box(len * 0.66, depth * 0.14, girth * 0.9 * 0.5, lateral);
    line.position.set(0, 0, 0);
    line.scale.z = 1.02;
    g.add(line);
  }

  // ---- snout / head ----
  const headX = len * 0.42;
  if (snout === 'point') {
    const nose = cone(girth * 0.3, len * 0.36, body, 6, bodyOpts);
    nose.rotation.z = -Math.PI / 2;
    nose.scale.set(1, 1, depth / girth * 0.9);
    nose.position.set(headX + len * 0.06, 0, 0);
    g.add(nose);
  } else if (snout === 'bill') {
    // marlin spear
    const nose = cone(girth * 0.28, len * 0.22, body, 6, bodyOpts);
    nose.rotation.z = -Math.PI / 2;
    nose.position.set(headX, 0, 0);
    g.add(nose);
    const bill = cyl(0.015, 0.05, billLen, body, 5, bodyOpts);
    bill.rotation.z = -Math.PI / 2;
    bill.position.set(headX + len * 0.06 + billLen / 2, 0.01, 0);
    g.add(bill);
  } else if (snout === 'flat') {
    // catfish — flattened head, kept broad-ish as its signature but trimmed
    const head = ball(0.5, body, 1, seg, bodyOpts);
    head.scale.set(len * 0.34, depth * 0.44, girth * 0.9);
    head.position.set(headX - len * 0.02, -depth * 0.05, 0);
    g.add(head);
  } else {
    // rounded snout — taper the front third sharply toward the nose. The
    // head is slimmed harder than the mid-body (0.50/0.52 of the already
    // leaned depth/girth) so it reads as a clean tapered head, not a blob.
    const head = ball(0.5, body, 1, seg, bodyOpts);
    head.scale.set(len * 0.30, depth * 0.50, girth * 0.52);
    head.position.set(headX, 0, 0);
    g.add(head);
  }

  // ---- caudal (tail) fin — a pivoting child group at the tail base ----
  const tail = new THREE.Group();
  tail.position.set(-len * 0.44, 0, 0);
  const caudal = finMesh(caudalPoints(tailKind, tailLen, tailSpread), finC);
  tail.add(caudal);
  g.add(tail);

  // ---- dorsal fin(s) on top ----
  const topY = depth * 0.48;
  const dorsal = finMesh([[dorsalLen * 0.5, 0], [dorsalX, dorsalH], [-dorsalLen * 0.5, 0]], finC);
  dorsal.position.set(dorsalX, topY, 0);
  g.add(dorsal);
  if (spinyDorsal) {
    const spiny = finMesh([[len * 0.28, 0], [len * 0.2, dorsalH * 0.85], [len * 0.06, dorsalH * 0.7], [len * 0.0, 0]], finC);
    spiny.position.set(0, topY, 0);
    g.add(spiny);
  }

  // ---- two pectoral fins ----
  const pecX = len * 0.2;
  const pL = pectoral(pecLen, pecWid, finC, 1);
  pL.position.set(pecX, -depth * 0.18, girth * 0.42);
  const pR = pectoral(pecLen, pecWid, finC, -1);
  pR.position.set(pecX, -depth * 0.18, -girth * 0.42);
  g.add(pL, pR);

  // ---- eyes ----
  const eX = len * 0.34;
  const eZ = eyeOnTop ? girth * 0.34 : girth * 0.5;
  const eY = eyeOnTop ? depth * 0.42 : eyeY;
  for (const s of [1, -1]) {
    const eye = ball(eyeR, eyeCol, 1, 6);
    eye.position.set(eX, eY, s * eZ);
    g.add(eye);
    if (eyeOnTop) { // pale eyeball ring for buggy-eyed fish
      const w = ball(eyeR * 1.5, 0xece6d6, 1, 6);
      w.position.set(eX - 0.01, eY, s * eZ);
      g.add(w);
      eye.position.z = s * (eZ + 0.02);
    }
  }

  // ---- barbels (whiskers) ----
  for (let i = 0; i < barbels; i++) {
    const s = i % 2 ? 1 : -1;
    const pair = Math.floor(i / 2);
    const w = cyl(0.008, 0.02, barbelLen, belly, 4);
    w.position.set(headX - 0.02 + barbelLen * 0.32, -depth * 0.22 - pair * 0.05, s * girth * 0.3);
    w.rotation.z = -1.1;             // sweep forward from the mouth
    w.rotation.y = s * (0.5 + pair * 0.25);
    g.add(w);
  }

  // ---- decorative spots ----
  for (let i = 0; i < spots; i++) {
    const t = (i + 0.5) / spots;
    const sp = ball(0.03 + (i % 2) * 0.012, spotCol, 0.7, 5);
    const s = i % 2 ? 1 : -1;
    sp.position.set((0.32 - t * 0.7) * len, depth * (0.12 + (i % 3) * 0.08), s * girth * 0.42);
    g.add(sp);
  }

  // ---- vertical bars (perch / tilapia) ----
  if (bars && barCol) {
    for (let i = 0; i < bars; i++) {
      const bx = (0.28 - i / (bars - 1) * 0.62) * len;
      const bar = box(len * 0.045, depth * 0.9, girth * 1.02, barCol);
      bar.position.set(bx, depth * 0.05, 0);
      g.add(bar);
    }
  }

  return { group: g, tail };
}

// ---------- eel / snake-body builder (eels, loach, rice_eel, lungfish) ----------
function buildEel(spec) {
  let {
    len = 2.0, thick = 0.18, body = 0x3f4a35, belly = 0x8a8f66,
    finCol = 0x2f3626, segs = 9, curve = 0.16,
    barbels = 0, bigPec = false, eyeCol = 0x14100c, glow = null, seg = 6,
  } = spec;

  // Lean pass: eels are already slim, so trim the tube ~28% (eyes handled
  // below at a smaller radius too).
  thick *= 0.72;

  const g = new THREE.Group();
  const opts = glow ? { emissive: glow, emissiveIntensity: 0.4 } : {};
  const half = len / 2;
  // chain of tapering ellipsoids along a gentle sine curve
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;                 // 0 = tail, 1 = head
    const x = -half + t * len;
    const y = Math.sin(t * Math.PI * 1.5) * curve;
    const r = thick * (0.28 + Math.sin(t * Math.PI) * 0.9); // fat middle, thin ends
    const s = ball(r, i / segs > 0.55 ? body : body, 1, seg, opts);
    s.scale.set(1.5, 1, 1);
    s.position.set(x, y, 0);
    g.add(s);
    if (t > 0.15 && t < 0.85 && i % 2 === 0) {
      const und = ball(r * 0.7, belly, 1, 5);
      und.scale.set(1.4, 0.6, 0.9);
      und.position.set(x, y - r * 0.5, 0);
      g.add(und);
    }
  }

  // low dorsal ridge running along the back
  const ridge = finMesh([[half * 0.6, 0], [0, thick * 0.7], [-half * 0.7, 0]], finCol);
  ridge.position.set(-half * 0.05, thick * 0.7, 0);
  g.add(ridge);

  // tiny tail paddle — pivots at the tail base
  const tail = new THREE.Group();
  tail.position.set(-half + 0.02, 0, 0);
  const caudal = finMesh(caudalPoints('lobe', thick * 1.6, thick * 0.9), finCol);
  tail.add(caudal);
  g.add(tail);

  // pectoral fins near the head
  const headX = half - thick * 0.6;
  const pl = bigPec ? thick * 2.2 : thick * 0.9;
  const pw = bigPec ? thick * 1.6 : thick * 0.7;
  const pL = pectoral(pl, pw, finCol, 1);
  pL.position.set(headX, -thick * 0.2, thick * 0.9);
  const pR = pectoral(pl, pw, finCol, -1);
  pR.position.set(headX, -thick * 0.2, -thick * 0.9);
  g.add(pL, pR);

  // eyes
  const headY = Math.sin(1.0 * Math.PI * 1.5) * curve;
  for (const s of [1, -1]) {
    const eye = ball(thick * 0.16, eyeCol, 1, 6);
    eye.position.set(headX + thick * 0.3, headY + thick * 0.35, s * thick * 0.7);
    g.add(eye);
  }

  // barbels for loach/eel mouths
  for (let i = 0; i < barbels; i++) {
    const s = i % 2 ? 1 : -1;
    const w = cyl(0.008, 0.018, thick * 1.4, belly, 4);
    w.position.set(half - thick * 0.2, headY - thick * 0.3, s * thick * 0.5);
    w.rotation.z = -1.2;
    w.rotation.y = s * 0.6;
    g.add(w);
  }

  return { group: g, tail };
}

// ============================================================
// Per-species specs — colors are hex literals per the style contract.
// ============================================================
const SPECS = {
  // ---------- meadow ----------
  carp: { len: 1.7, depth: 0.5, girth: 0.36, body: 0x8f8348, belly: 0xcdbf7c, finCol: 0x6d6236, tailKind: 'fork', tailSpread: 0.32, dorsalLen: 0.6, dorsalH: 0.26, barbels: 2 },
  perch: { len: 1.5, depth: 0.52, girth: 0.32, body: 0x84a03e, belly: 0xd7c98a, back: 0x5e7a2c, finCol: 0xd9782e, spinyDorsal: true, dorsalH: 0.34, bars: 5, barCol: 0x4a5f24 },
  bluegill: { len: 1.35, depth: 0.66, girth: 0.28, body: 0x3f6f6a, belly: 0xd98a4a, back: 0x2f5450, finCol: 0x36615c, tailKind: 'fork', dorsalLen: 0.7, dorsalH: 0.3, spinyDorsal: true, eyeY: 0.14 },
  minnow: { len: 1.15, depth: 0.34, girth: 0.24, body: 0xc4cad0, belly: 0xeef1f4, back: 0x8a94a0, finCol: 0xb0b8c0, tailLen: 0.42, tailSpread: 0.26, dorsalLen: 0.34, dorsalH: 0.18, shine: true },
  catfish: { len: 1.8, depth: 0.46, girth: 0.4, body: 0x6b5d4a, belly: 0xbfae94, finCol: 0x554839, snout: 'flat', tailKind: 'lobe', tailLen: 0.42, barbels: 6, barbelLen: 0.42, dorsalLen: 0.3, dorsalH: 0.24 },
  golden_koi: { len: 1.9, depth: 0.56, girth: 0.4, body: 0xf0c23a, belly: 0xfbe6a8, finCol: 0xf7d55c, tailKind: 'fan', tailLen: 0.7, tailSpread: 0.44, dorsalLen: 0.6, dorsalH: 0.34, barbels: 2, spots: 4, spotCol: 0xe86830, shine: true, glow: 0x5a4400 },

  // ---------- oceanside ----------
  sardine: { len: 1.25, depth: 0.32, girth: 0.24, body: 0x9fb8c8, belly: 0xeff4f7, back: 0x5f7f96, finCol: 0xaec2cf, tailKind: 'fork', tailLen: 0.42, dorsalLen: 0.3, dorsalH: 0.16, shine: true },
  mackerel: { len: 1.55, depth: 0.36, girth: 0.28, body: 0x6f9aa6, belly: 0xe4ecef, back: 0x39566a, finCol: 0x4a6f7c, tailKind: 'crescent', tailLen: 0.5, tailSpread: 0.38, dorsalLen: 0.3, dorsalH: 0.2, spots: 6, spotCol: 0x2c4150, shine: true },
  sea_bass: { len: 1.65, depth: 0.5, girth: 0.34, body: 0x62707a, belly: 0xcfd6d6, back: 0x434e57, finCol: 0x4c5860, spinyDorsal: true, dorsalH: 0.3, tailKind: 'fork', eyeR: 0.06 },
  snapper: { len: 1.55, depth: 0.56, girth: 0.32, body: 0xc85a4a, belly: 0xecc0a8, back: 0xa83f34, finCol: 0xd06a56, tailKind: 'fork', dorsalLen: 0.66, dorsalH: 0.3, spinyDorsal: true, eyeR: 0.06, eyeY: 0.14 },
  tuna: { len: 1.9, depth: 0.5, girth: 0.38, body: 0x2f5f8c, belly: 0xcfd6db, back: 0x203f5c, finCol: 0xd7b23a, tailKind: 'crescent', tailLen: 0.6, tailSpread: 0.46, dorsalLen: 0.34, dorsalH: 0.26, shine: true },
  marlin: { len: 2.3, depth: 0.5, girth: 0.36, body: 0x2a4a8c, belly: 0xd0d8e2, back: 0x1c3568, finCol: 0x3a63b0, snout: 'bill', billLen: 0.7, tailKind: 'crescent', tailLen: 0.66, tailSpread: 0.52, dorsalLen: 0.9, dorsalH: 0.58, shine: true, glow: 0x0e2044 },

  // ---------- boreal ----------
  trout: { len: 1.6, depth: 0.46, girth: 0.32, body: 0x7c7a4e, belly: 0xe4dcc0, back: 0x565738, finCol: 0x6d6a42, lateral: 0xd07a72, tailKind: 'fork', tailLen: 0.46, spots: 7, spotCol: 0x3a3826 },
  pike: { len: 2.1, depth: 0.42, girth: 0.3, body: 0x5f7a3e, belly: 0xdce0b4, back: 0x435a2a, finCol: 0x4f6832, snout: 'point', tailKind: 'fork', tailLen: 0.5, dorsalLen: 0.44, dorsalH: 0.26, dorsalX: -0.5, spots: 8, spotCol: 0xcfe0a0 },
  grayling: { len: 1.55, depth: 0.44, girth: 0.3, body: 0x8a90a8, belly: 0xdadeea, back: 0x5c627e, finCol: 0x9a6fa8, tailKind: 'fork', dorsalLen: 0.8, dorsalH: 0.5, dorsalX: 0.1, shine: true },
  arctic_char: { len: 1.6, depth: 0.46, girth: 0.32, body: 0x5a7a8c, belly: 0xe08a4a, back: 0x3f5b6c, finCol: 0xd97a48, lateral: 0xe0955a, tailKind: 'fork', spots: 6, spotCol: 0xf0d0a0 },
  whitefish: { len: 1.55, depth: 0.42, girth: 0.3, body: 0xcdd2d0, belly: 0xf2f4f2, back: 0x9aa4a6, finCol: 0xb6bcbc, tailKind: 'fork', tailLen: 0.48, dorsalLen: 0.4, dorsalH: 0.22, shine: true },
  king_salmon: { len: 2.1, depth: 0.54, girth: 0.38, body: 0x6f8288, belly: 0xe4c4b4, back: 0x46595f, finCol: 0xb85a52, lateral: 0xc06858, tailKind: 'fork', tailLen: 0.6, tailSpread: 0.42, dorsalLen: 0.5, dorsalH: 0.3, spots: 6, spotCol: 0x33424a, shine: true, glow: 0x3a1c18 },

  // ---------- desert ----------
  mudskipper: { len: 1.2, depth: 0.42, girth: 0.32, body: 0x6f6a3e, belly: 0xb2a874, back: 0x504c2a, finCol: 0x8a835a, tailKind: 'lobe', tailLen: 0.4, dorsalLen: 0.5, dorsalH: 0.34, pecLen: 0.5, pecWid: 0.34, eyeOnTop: true, eyeR: 0.08 },
  desert_catfish: { len: 1.7, depth: 0.44, girth: 0.38, body: 0xb89a6a, belly: 0xe6d4ac, finCol: 0x9a7f52, snout: 'flat', tailKind: 'lobe', barbels: 6, barbelLen: 0.4, dorsalLen: 0.3, dorsalH: 0.22 },
  tilapia: { len: 1.5, depth: 0.6, girth: 0.3, body: 0x6f7a5e, belly: 0xc8cbaa, back: 0x50593f, finCol: 0x8a5f6f, spinyDorsal: true, dorsalLen: 0.72, dorsalH: 0.34, tailKind: 'fork', bars: 5, barCol: 0x4a5240 },
  oasis_perch: { len: 1.45, depth: 0.5, girth: 0.3, body: 0x3f8a7a, belly: 0xd7c98a, back: 0x2c6357, finCol: 0xe0863a, spinyDorsal: true, dorsalH: 0.32, tailKind: 'fork', bars: 4, barCol: 0x2c6357 },
  lungfish: { eel: true, len: 1.9, thick: 0.24, body: 0x6a6a4a, belly: 0xa8a478, finCol: 0x50503a, curve: 0.1, bigPec: true, segs: 8 },
  mirage_bass: { len: 1.85, depth: 0.54, girth: 0.36, body: 0xbfe0e0, belly: 0xe8f6f6, back: 0x8ac6cc, finCol: 0xa0d8e4, spinyDorsal: true, dorsalLen: 0.7, dorsalH: 0.4, tailKind: 'fan', tailLen: 0.6, tailSpread: 0.42, shine: true, glow: 0x2f6a70, eyeCol: 0x2a4a4a },

  // ---------- sakura ----------
  koi: { len: 1.75, depth: 0.52, girth: 0.38, body: 0xf2ede4, belly: 0xfbf7f0, finCol: 0xf0e6d8, tailKind: 'fan', tailLen: 0.66, tailSpread: 0.42, dorsalLen: 0.56, dorsalH: 0.3, barbels: 2, spots: 4, spotCol: 0xe86830 },
  sweetfish: { len: 1.4, depth: 0.36, girth: 0.26, body: 0x9aa87a, belly: 0xe8ecd6, back: 0x6f7d52, finCol: 0xb0bc90, tailKind: 'fork', tailLen: 0.46, dorsalLen: 0.36, dorsalH: 0.2, shine: true },
  loach: { eel: true, len: 1.8, thick: 0.14, body: 0x7a5f3e, belly: 0xc2a878, finCol: 0x5c4830, curve: 0.2, barbels: 4, segs: 9 },
  rice_eel: { eel: true, len: 2.2, thick: 0.12, body: 0xa88a4a, belly: 0xd8c088, finCol: 0x836a38, curve: 0.22, segs: 10 },
  crucian_carp: { len: 1.55, depth: 0.56, girth: 0.34, body: 0xb89448, belly: 0xe6cf90, back: 0x8f7030, finCol: 0x8f7030, tailKind: 'fork', dorsalLen: 0.62, dorsalH: 0.28 },
  dragon_carp: { len: 2.0, depth: 0.56, girth: 0.4, body: 0xd83a2a, belly: 0xf6c85a, back: 0xa82818, finCol: 0xf0b83a, tailKind: 'fan', tailLen: 0.8, tailSpread: 0.5, dorsalLen: 0.7, dorsalH: 0.4, barbels: 4, barbelLen: 0.5, shine: true, glow: 0x5a1408 },

  // ---------- autumn ----------
  brown_trout: { len: 1.65, depth: 0.46, girth: 0.32, body: 0x7a5f3e, belly: 0xe0d2ac, back: 0x574530, finCol: 0x6a5334, tailKind: 'fork', spots: 8, spotCol: 0xb03a2a },
  eel: { eel: true, len: 2.3, thick: 0.16, body: 0x3f4a35, belly: 0x8a8f66, finCol: 0x2f3626, curve: 0.18, segs: 10 },
  bullhead: { len: 1.55, depth: 0.44, girth: 0.4, body: 0x4a3f30, belly: 0x9a8a6a, finCol: 0x3a3125, snout: 'flat', tailKind: 'lobe', tailLen: 0.4, barbels: 6, barbelLen: 0.4, dorsalLen: 0.3, dorsalH: 0.24 },
  fallfish: { len: 1.6, depth: 0.42, girth: 0.3, body: 0xb8bcc0, belly: 0xeef0f2, back: 0x868c92, finCol: 0xc6a878, tailKind: 'fork', tailLen: 0.5, dorsalLen: 0.4, dorsalH: 0.24, shine: true },
  walleye: { len: 1.8, depth: 0.44, girth: 0.32, body: 0x9a8a4a, belly: 0xdcd0a0, back: 0x6a5e30, finCol: 0x847340, spinyDorsal: true, dorsalH: 0.32, tailKind: 'fork', tailLen: 0.5, eyeOnTop: true, eyeR: 0.07, spots: 5, spotCol: 0x5a4e28 },
  ghost_pike: { len: 2.2, depth: 0.42, girth: 0.3, body: 0xd8e4ea, belly: 0xf2f8fb, back: 0xb0c8d4, finCol: 0xc0d8e4, snout: 'point', tailKind: 'fork', tailLen: 0.56, tailSpread: 0.4, dorsalLen: 0.46, dorsalH: 0.28, dorsalX: -0.5, shine: true, glow: 0x4a6a78, eyeCol: 0x3a5560 },
};

// ---------- public API ----------

export const FISH_MODEL_IDS = [
  'carp', 'perch', 'bluegill', 'minnow', 'catfish', 'golden_koi',
  'sardine', 'mackerel', 'sea_bass', 'snapper', 'tuna', 'marlin',
  'trout', 'pike', 'grayling', 'arctic_char', 'whitefish', 'king_salmon',
  'mudskipper', 'desert_catfish', 'tilapia', 'oasis_perch', 'lungfish', 'mirage_bass',
  'koi', 'sweetfish', 'loach', 'rice_eel', 'crucian_carp', 'dragon_carp',
  'brown_trout', 'eel', 'bullhead', 'fallfish', 'walleye', 'ghost_pike',
];

export function buildFish(id) {
  const spec = SPECS[id] || { len: 1.6, depth: 0.46, girth: 0.34 }; // generic fish fallback
  const { group, tail } = spec.eel ? buildEel(spec) : buildBody(spec);
  group.userData.tail = tail;
  group.userData.species = id;
  return group;
}
