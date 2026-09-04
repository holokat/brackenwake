// Low-poly "junk" / artifact items the player fishes up in the Homestead game.
// These are the non-fish catches (trash, an old boot, a tin can, seaweed,
// driftwood). They are shown leaping from the water and held up on the line
// exactly like the fish, so they follow the same contract as buildFish:
//   - buildJunk(id) returns a THREE.Group.
//   - The group faces +X (its "front" / natural forward is +X), consistent
//     with the fish models.
//   - Largest dimension ~1.2–1.8 world units, centred near the origin in X/Z,
//     resting so the bottom sits near y≈0 (these are discarded objects lying
//     at the water/ground surface, not swimming).
// Deterministic: NO Math.random at load — every offset is fixed, and any
// variation is derived from the id string's characters.
//
// Sculpted from the SAME shared primitive helpers as the rest of the farm
// assets (flat-shaded, few segments) so the junk reads as one visual family.

import * as THREE from 'three';
import { mat, mesh, box, cyl, cone, ball, tube } from './assets.js';

// ---------- palette (dull, weathered, waterlogged tones) ----------
const J = {
  plasticWhite: 0xd9d3c6, plasticGrey: 0x9c988e, scrapRed: 0xc24234,
  scrapBlue: 0x3f7fae,
  tin: 0xb9bdc2, tinDark: 0x7c828a, tinLabel: 0x4a86b8,
  bootGreen: 0x33513b, bootGreenDark: 0x264030, sole: 0x6d6a60, buckle: 0xcaa63a,
  kelp1: 0x3c7a2a, kelp2: 0x4f9636, kelp3: 0x6fb14a, kelp4: 0x2f6a44, kelpBase: 0x5a4630,
  wood: 0xbfb29b, woodDark: 0xa89a83, woodBleach: 0xd4c9b6,
};

// A low-poly angular lump (crumpled-garbage vibe) from a coarse polyhedron.
function lump(r, color, kind = 'ico') {
  const geo = kind === 'dodeca'
    ? new THREE.DodecahedronGeometry(r, 0)
    : new THREE.IcosahedronGeometry(r, 0);
  return mesh(geo, mat(color));
}

// Tiny deterministic 0..1 value from a character of the id, so distinct ids
// can carry a hair of variation without any Math.random.
function seedOf(id, i) {
  return ((id.charCodeAt(i % id.length) * 37 + i * 13) % 100) / 100;
}

// ============================================================
// trash — a crumpled wad of plastic/paper garbage
// ============================================================
function buildTrash() {
  const g = new THREE.Group();

  // main off-white crumpled plastic wad
  const wad = lump(0.55, J.plasticWhite, 'ico');
  wad.scale.set(1.25, 0.9, 1.1);
  wad.rotation.set(0.5, 0.8, 0.25);
  wad.position.set(0.05, 0.5, 0.02);
  g.add(wad);

  // a second smaller dull-grey lump clinging to it
  const wad2 = lump(0.4, J.plasticGrey, 'dodeca');
  wad2.scale.set(1.1, 0.85, 1.0);
  wad2.rotation.set(0.3, -0.6, 0.7);
  wad2.position.set(-0.42, 0.36, -0.2);
  g.add(wad2);

  // a squished box lump for angular variety
  const wad3 = box(0.5, 0.34, 0.42, J.plasticWhite);
  wad3.rotation.set(0.4, 0.5, -0.35);
  wad3.position.set(0.35, 0.32, 0.28);
  g.add(wad3);

  // a small colored scrap poking out (crumpled label/wrapper)
  const scrap = box(0.34, 0.05, 0.26, J.scrapRed);
  scrap.rotation.set(-0.3, 0.9, 0.4);
  scrap.position.set(0.28, 0.62, -0.18);
  g.add(scrap);

  const scrap2 = box(0.22, 0.05, 0.2, J.scrapBlue);
  scrap2.rotation.set(0.5, -0.4, -0.6);
  scrap2.position.set(-0.32, 0.58, 0.22);
  g.add(scrap2);

  return g;
}

// ============================================================
// tin_can — a dented aluminium can, tipped on its side (discarded)
// ============================================================
function buildTinCan() {
  // Build the can upright in a child group (axis along Y), then tip the whole
  // child so it lies on its side reading as litter.
  const g = new THREE.Group();
  const can = new THREE.Group();

  const R = 0.4;
  const H = 1.1;

  // body — short metallic cylinder
  const body = cyl(R, R, H, J.tin, 10, { roughness: 0.4, metalness: 0.5 });
  body.position.y = H / 2;
  can.add(body);

  // slightly dented lower ring (thinner radius) to break the clean cylinder
  const dent = cyl(R * 0.96, R * 0.99, H * 0.28, J.tin, 10, { roughness: 0.45, metalness: 0.45 });
  dent.position.set(0.04, H * 0.34, 0.02);
  dent.scale.set(0.94, 1, 1.02);
  can.add(dent);

  // darker rims top and bottom
  for (const y of [0.03, H - 0.03]) {
    const rim = cyl(R * 1.03, R * 1.03, 0.09, J.tinDark, 10, { roughness: 0.4, metalness: 0.5 });
    rim.position.y = y;
    can.add(rim);
  }
  // recessed dark top (the drinking end)
  const top = cyl(R * 0.82, R * 0.82, 0.05, J.tinDark, 10, { roughness: 0.5, metalness: 0.4 });
  top.position.y = H - 0.02;
  can.add(top);

  // thin colored label band around the middle
  const label = cyl(R * 1.02, R * 1.02, 0.34, J.tinLabel, 10, { roughness: 0.6, metalness: 0.1 });
  label.position.y = H * 0.5;
  can.add(label);

  // tip the can onto its side and give it a little roll/skew so it reads as
  // dropped, not standing. Length now runs roughly along X (+X front).
  can.rotation.z = Math.PI / 2 - 0.12;
  can.rotation.y = 0.25;
  can.position.set(-H / 2 + 0.05, R, 0);
  g.add(can);

  return g;
}

// ============================================================
// old_boot — the classic waterlogged wellington (L-shaped silhouette)
// ============================================================
function buildOldBoot() {
  const g = new THREE.Group();
  const soleY = 0.14; // sole thickness lifts the whole boot off the ground

  // vertical shaft (the leg of the boot)
  const shaft = box(0.52, 1.05, 0.54, J.bootGreen);
  shaft.position.set(-0.18, soleY + 0.55, 0);
  g.add(shaft);

  // rounded cuff/top opening
  const cuff = cyl(0.3, 0.28, 0.18, J.bootGreenDark, 8);
  cuff.position.set(-0.18, soleY + 1.06, 0);
  g.add(cuff);
  const hole = cyl(0.2, 0.2, 0.1, 0x14140f, 8);
  hole.position.set(-0.18, soleY + 1.12, 0);
  g.add(hole);

  // ankle — a small block joining shaft to foot so the L bends cleanly
  const ankle = box(0.5, 0.4, 0.52, J.bootGreen);
  ankle.position.set(-0.14, soleY + 0.2, 0);
  g.add(ankle);

  // foot pointing forward (+X), the toe of the boot
  const foot = box(0.9, 0.42, 0.5, J.bootGreen);
  foot.position.set(0.24, soleY + 0.19, 0);
  g.add(foot);

  // rounded toe cap
  const toe = ball(0.26, J.bootGreen, 0.85, 7);
  toe.scale.set(1.1, 0.8, 0.95);
  toe.position.set(0.66, soleY + 0.16, 0);
  g.add(toe);

  // lighter sole running the length of the foot, resting on the ground
  const sole = box(1.26, soleY * 2, 0.56, J.sole);
  sole.position.set(0.2, soleY, 0);
  g.add(sole);
  // little heel bump
  const heel = box(0.34, 0.12, 0.54, J.sole);
  heel.position.set(-0.2, soleY - 0.02, 0);
  g.add(heel);

  // a small buckle strap on the shaft for character
  const strap = box(0.56, 0.12, 0.58, J.bootGreenDark);
  strap.position.set(-0.18, soleY + 0.78, 0);
  g.add(strap);
  const buckle = box(0.1, 0.14, 0.14, J.buckle, { metalness: 0.5, roughness: 0.4 });
  buckle.position.set(0.11, soleY + 0.78, 0);
  g.add(buckle);

  return g;
}

// ============================================================
// seaweed — a tangled clump of kelp fronds fanning up from a base
// ============================================================
function buildSeaweed(id) {
  const g = new THREE.Group();

  // small rooty base clump
  const base = ball(0.34, J.kelpBase, 0.55, 7);
  base.position.y = 0.1;
  g.add(base);
  const base2 = ball(0.22, J.kelpBase, 0.6, 6);
  base2.position.set(0.14, 0.08, -0.1);
  g.add(base2);

  const greens = [J.kelp1, J.kelp2, J.kelp3, J.kelp4];
  const fronds = 7;
  for (let i = 0; i < fronds; i++) {
    // fan the fronds out around a circle, leaning outward, of varied height
    const a = (i / fronds) * Math.PI * 2 + seedOf(id, i) * 0.6;
    const lean = 0.28 + seedOf(id, i + 3) * 0.4;
    const h = 1.0 + seedOf(id, i + 1) * 0.55;
    const bx = Math.cos(a) * 0.18;
    const bz = Math.sin(a) * 0.18;
    const wave = (seedOf(id, i + 2) - 0.5) * 0.7; // sideways kink direction

    // an S-curved wavy frond built as a tapered tube
    const pts = [
      new THREE.Vector3(bx, 0.05, bz),
      new THREE.Vector3(bx + Math.cos(a) * lean * 0.4 + wave * 0.2, h * 0.35, bz + Math.sin(a) * lean * 0.4),
      new THREE.Vector3(bx + Math.cos(a) * lean * 0.75 - wave * 0.25, h * 0.68, bz + Math.sin(a) * lean * 0.75),
      new THREE.Vector3(bx + Math.cos(a) * lean + wave * 0.3, h, bz + Math.sin(a) * lean),
    ];
    const frond = tube(pts, 0.06 - (i % 3) * 0.008, greens[i % greens.length], 5);
    g.add(frond);

    // a little leafy tip blob so the kelp reads bushy, not stringy
    const tip = ball(0.12, greens[(i + 1) % greens.length], 0.8, 5);
    tip.position.copy(pts[3]);
    g.add(tip);
  }

  return g;
}

// ============================================================
// driftwood — a weathered bleached branch with a couple of stubs
// ============================================================
function buildDriftwood() {
  const g = new THREE.Group();
  const R = 0.24;

  // main tapered log, lying along X (+X = the pointier weathered end)
  const log = cyl(0.14, R, 1.5, J.wood, 7);
  log.rotation.z = Math.PI / 2 - 0.06; // lie down, slight tilt
  log.rotation.y = 0.15;
  log.position.set(0, R, 0);
  g.add(log);

  // bleached highlight patch along the top of the log
  const bleach = cyl(0.1, 0.17, 1.2, J.woodBleach, 6);
  bleach.rotation.z = Math.PI / 2 - 0.06;
  bleach.rotation.y = 0.15;
  bleach.scale.set(1, 1, 0.7);
  bleach.position.set(-0.05, R + 0.12, 0.06);
  g.add(bleach);

  // gnarled end knob
  const knob = ball(0.2, J.woodDark, 0.9, 6);
  knob.position.set(-0.72, R + 0.02, 0);
  g.add(knob);

  // branch stub #1 — angling up and forward
  const stub1 = cyl(0.05, 0.11, 0.5, J.woodDark, 6);
  stub1.position.set(0.28, R + 0.18, 0.12);
  stub1.rotation.set(0.4, 0.2, -0.7);
  g.add(stub1);
  const stub1tip = cone(0.05, 0.18, J.wood, 5);
  stub1tip.position.set(0.5, R + 0.42, 0.2);
  stub1tip.rotation.set(0.4, 0.2, -0.7);
  g.add(stub1tip);

  // branch stub #2 — a shorter broken nub on the other side
  const stub2 = cyl(0.045, 0.09, 0.34, J.woodDark, 6);
  stub2.position.set(-0.3, R + 0.14, -0.16);
  stub2.rotation.set(-0.5, -0.3, 0.6);
  g.add(stub2);

  // pointed weathered tip at +X
  const tip = cone(0.13, 0.4, J.woodBleach, 6);
  tip.rotation.z = -Math.PI / 2 + 0.06;
  tip.rotation.y = 0.15;
  tip.position.set(0.78, R + 0.05, -0.02);
  g.add(tip);

  return g;
}

// ---------- public API ----------

export const JUNK_MODEL_IDS = ['trash', 'tin_can', 'old_boot', 'seaweed', 'driftwood'];

export function buildJunk(id) {
  switch (id) {
    case 'trash': return buildTrash();
    case 'tin_can': return buildTinCan();
    case 'old_boot': return buildOldBoot();
    case 'seaweed': return buildSeaweed(id);
    case 'driftwood': return buildDriftwood();
    default: return buildTrash(); // default-safe: unknown ids never return null
  }
}
