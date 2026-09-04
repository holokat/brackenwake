// Hand-built models for the most-visible tier-1 infrastructure — these
// replace the procedural placeholders one batch at a time. Same flat-shaded
// low-poly language as assets.js: P palette, chunky silhouettes, warm trims.

import * as THREE from 'three';
import { P, mat, box, cyl, cone, ball } from './assets.js';
import { INFRA_MODELS_B } from './infra_models_b.js';
import { INFRA_MODELS_C } from './infra_models_c.js';
import { INFRA_MODELS_D } from './infra_models_d.js';
import { INFRA_MODELS_E } from './infra_models_e.js';
import { INFRA_MODELS_F } from './infra_models_f.js';

const IRON = 0x4e5257;
const WATER = 0x4fa8d8;

function barrelBody(r, h, wood = P.wood) {
  const g = new THREE.Group();
  const body = cyl(r, r * 0.88, h, wood, 10);
  body.position.y = h / 2;
  g.add(body);
  const belly = cyl(r * 1.06, r * 1.06, h * 0.36, wood, 10);
  belly.position.y = h / 2;
  g.add(belly);
  for (const y of [h * 0.18, h * 0.82]) {
    const hoop = cyl(r * 1.04, r * 1.04, 0.09, IRON, 10);
    hoop.position.y = y;
    g.add(hoop);
  }
  return g;
}

// 🚰 Hand Pump — cast-iron pump on a stone slab, bucket under the spout
function handPump() {
  const g = new THREE.Group();
  const slab = cyl(1.15, 1.3, 0.3, P.stone, 8);
  slab.position.y = 0.15;
  g.add(slab);
  const body = cyl(0.22, 0.3, 1.7, IRON, 8);
  body.position.y = 1.1;
  g.add(body);
  const cap = ball(0.24, IRON, 0.8, 7);
  cap.position.y = 2.0;
  g.add(cap);
  // spout curving out
  const spout = cyl(0.11, 0.14, 0.75, IRON, 6);
  spout.position.set(0.42, 1.62, 0);
  spout.rotation.z = Math.PI / 2.4;
  g.add(spout);
  const mouth = cyl(0.13, 0.11, 0.3, IRON, 6);
  mouth.position.set(0.78, 1.42, 0);
  g.add(mouth);
  // long lever handle
  const pivot = box(0.34, 0.12, 0.12, IRON);
  pivot.position.set(-0.2, 1.95, 0);
  g.add(pivot);
  const handle = box(1.5, 0.09, 0.09, IRON);
  handle.position.set(-0.85, 2.15, 0);
  handle.rotation.z = 0.45;
  g.add(handle);
  const grip = cyl(0.07, 0.07, 0.3, P.woodDark, 6);
  grip.position.set(-1.5, 2.47, 0);
  grip.rotation.x = Math.PI / 2;
  g.add(grip);
  // wooden bucket catching the drip
  const bucket = cyl(0.34, 0.26, 0.5, P.wood, 8);
  bucket.position.set(0.78, 0.55, 0);
  g.add(bucket);
  const bWater = cyl(0.28, 0.28, 0.05, WATER, 8);
  bWater.position.set(0.78, 0.78, 0);
  g.add(bWater);
  const drip = ball(0.06, WATER, 1.4, 5);
  drip.position.set(0.78, 1.15, 0);
  g.add(drip);
  return g;
}

// 🛢️ Water Barrel — open-top barrel, brimful, ladle hooked on the rim
function waterBarrel() {
  const g = new THREE.Group();
  g.add(barrelBody(0.75, 1.5));
  const water = cyl(0.62, 0.62, 0.06, WATER, 10);
  water.position.y = 1.44;
  g.add(water);
  const ladleStick = cyl(0.04, 0.04, 0.9, P.woodDark, 5);
  ladleStick.position.set(0.62, 1.65, 0.2);
  ladleStick.rotation.z = -0.7;
  g.add(ladleStick);
  const ladleCup = ball(0.13, P.woodDark, 0.6, 6);
  ladleCup.position.set(0.95, 1.4, 0.2);
  g.add(ladleCup);
  return g;
}

// 🌧️ Rain Barrel — barrel under a slanted catch-funnel and downpipe
function rainBarrel() {
  const g = new THREE.Group();
  g.add(barrelBody(0.72, 1.6, 0x8a6a44));
  // wide funnel mouth
  const funnel = cone(1.0, 0.75, IRON, 8);
  funnel.position.y = 2.0;
  funnel.rotation.x = Math.PI;
  g.add(funnel);
  const neck = cyl(0.14, 0.14, 0.45, IRON, 6);
  neck.position.y = 1.55;
  g.add(neck);
  // side downpipe feeding it
  const pipeV = cyl(0.09, 0.09, 1.9, IRON, 6);
  pipeV.position.set(0.95, 1.45, 0);
  g.add(pipeV);
  const pipeBend = cyl(0.09, 0.09, 0.5, IRON, 6);
  pipeBend.position.set(0.72, 2.35, 0);
  pipeBend.rotation.z = Math.PI / 2.6;
  g.add(pipeBend);
  const drop = ball(0.07, WATER, 1.4, 5);
  drop.position.set(0.3, 2.35, 0);
  g.add(drop);
  return g;
}

// 🪴 Raised Bed — plank frame, dark soil, three rows of leafy seedlings
function raisedBed() {
  const g = new THREE.Group();
  const W = 2.6, D = 1.8, H = 0.55;
  for (const [dx, dz, w, r] of [[0, D / 2, W, 0], [0, -D / 2, W, 0], [W / 2, 0, D, 1], [-W / 2, 0, D, 1]]) {
    const plank = box(w + 0.16, H, 0.16, P.wood);
    plank.position.set(dx, H / 2, dz);
    if (r) plank.rotation.y = Math.PI / 2;
    g.add(plank);
  }
  for (const [sx, sz] of [[-W / 2, -D / 2], [W / 2, -D / 2], [-W / 2, D / 2], [W / 2, D / 2]]) {
    const post = box(0.2, H + 0.18, 0.2, P.woodDark);
    post.position.set(sx, (H + 0.18) / 2, sz);
    g.add(post);
  }
  const soil = box(W - 0.12, 0.12, D - 0.12, 0x4c3320);
  soil.position.y = H - 0.04;
  g.add(soil);
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 4; i++) {
      const px = -W / 2 + 0.45 + i * ((W - 0.9) / 3);
      const pz = -D / 2 + 0.45 + row * ((D - 0.9) / 2);
      const sprout = cone(0.14, 0.45 + (i % 2) * 0.12, row % 2 ? P.leaf : P.leafLight, 5);
      sprout.position.set(px, H + 0.2, pz);
      g.add(sprout);
    }
  }
  return g;
}

// 🌿 Herb Garden — a stone ring bursting with mixed herbs and blossoms
function herbGarden() {
  const g = new THREE.Group();
  const R = 1.7;
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const rock = ball(0.28 + (i % 3) * 0.05, i % 2 ? P.stone : 0x8a8177, 0.75, 6);
    rock.position.set(Math.cos(a) * R, 0.2, Math.sin(a) * R);
    g.add(rock);
  }
  const soil = cyl(R - 0.15, R, 0.22, 0x54381f, 10);
  soil.position.y = 0.11;
  g.add(soil);
  const herbCols = [P.leaf, P.leafLight, 0x5a9e4a, 0x7ec850];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + 0.4;
    const r = 0.35 + (i % 3) * 0.4;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const bush = ball(0.3 + (i % 2) * 0.12, herbCols[i % 4], 0.85, 6);
    bush.position.set(x, 0.45, z);
    g.add(bush);
    if (i % 3 === 0) {
      const bloom = ball(0.09, [0xb89be6, 0xf7efdd, 0xf2a6c8][i % 3], 1, 5);
      bloom.position.set(x, 0.75, z);
      g.add(bloom);
    }
  }
  // little marker stick with a tag
  const stick = cyl(0.05, 0.06, 0.9, P.woodDark, 5);
  stick.position.set(R * 0.55, 0.55, -R * 0.55);
  g.add(stick);
  const tag = box(0.4, 0.26, 0.06, P.woodLight);
  tag.position.set(R * 0.55, 0.95, -R * 0.55);
  tag.rotation.y = 0.6;
  g.add(tag);
  return g;
}

// 🛖 Storage Shed — snug gable shed with a rake leaning on the wall
function storageShed() {
  const g = new THREE.Group();
  const W = 3.0, D = 2.4, H = 2.1;
  const walls = box(W, H, D, P.wood);
  walls.position.y = H / 2;
  g.add(walls);
  for (const y of [0.6, 1.3]) {
    const band = box(W + 0.06, 0.1, D + 0.06, P.woodDark);
    band.position.y = y;
    g.add(band);
  }
  // gable roof from two slabs
  for (const s of [-1, 1]) {
    const slab = box(W + 0.7, 0.14, D * 0.72, 0x7a5236);
    slab.position.set(0, H + 0.55, s * D * 0.26);
    slab.rotation.x = -s * 0.5;
    g.add(slab);
  }
  const ridge = box(W + 0.8, 0.14, 0.2, P.woodDark);
  ridge.position.y = H + 0.86;
  g.add(ridge);
  const door = box(0.85, 1.45, 0.08, P.woodDark);
  door.position.set(-0.5, 0.75, D / 2 + 0.05);
  g.add(door);
  const knob = ball(0.06, 0xd8b13a, 1, 5);
  knob.position.set(-0.2, 0.75, D / 2 + 0.12);
  g.add(knob);
  // rake leaning against the front
  const rakeHandle = cyl(0.04, 0.04, 1.9, P.woodLight, 5);
  rakeHandle.position.set(0.95, 1.0, D / 2 + 0.18);
  rakeHandle.rotation.z = 0.25;
  g.add(rakeHandle);
  const rakeHead = box(0.5, 0.08, 0.1, IRON);
  rakeHead.position.set(1.18, 0.12, D / 2 + 0.22);
  g.add(rakeHead);
  // crate at the side
  const crate = box(0.7, 0.7, 0.7, 0xb08948);
  crate.position.set(-W / 2 - 0.45, 0.35, 0.3);
  crate.rotation.y = 0.3;
  g.add(crate);
  return g;
}

// 🪣 Feed Bin — slant-lid bin, lid propped open on a heap of golden grain
function feedBin() {
  const g = new THREE.Group();
  const W = 1.7, D = 1.2, H = 1.0;
  const bin = box(W, H, D, 0x8a6a44);
  bin.position.y = H / 2;
  g.add(bin);
  for (const sx of [-W / 2, W / 2]) {
    const trim = box(0.14, H + 0.1, D + 0.08, P.woodDark);
    trim.position.set(sx, H / 2, 0);
    g.add(trim);
  }
  const grain = ball(0.62, 0xe8c26a, 0.5, 8);
  grain.position.set(0, H + 0.08, 0);
  grain.scale.x = 1.25;
  g.add(grain);
  const lid = box(W + 0.2, 0.1, D + 0.2, P.wood);
  lid.position.set(0, H + 0.62, -D * 0.42);
  lid.rotation.x = -0.85;
  g.add(lid);
  const scoop = ball(0.16, IRON, 0.6, 6);
  scoop.position.set(0.4, H + 0.22, 0.2);
  g.add(scoop);
  return g;
}

// 🐔 Chicken Coop — stilted box, ramp with cleats, nesting annex
function chickenCoop() {
  const g = new THREE.Group();
  const W = 2.2, D = 1.8, H = 1.5, LIFT = 0.75;
  for (const [sx, sz] of [[-0.8, -0.6], [0.8, -0.6], [-0.8, 0.6], [0.8, 0.6]]) {
    const leg = cyl(0.09, 0.11, LIFT, P.woodDark, 5);
    leg.position.set(sx, LIFT / 2, sz);
    g.add(leg);
  }
  const bodyB = box(W, H, D, 0xc45c3a);
  bodyB.position.y = LIFT + H / 2;
  g.add(bodyB);
  for (const s of [-1, 1]) {
    const slab = box(W + 0.5, 0.12, D * 0.7, P.woodDark);
    slab.position.set(0, LIFT + H + 0.38, s * D * 0.24);
    slab.rotation.x = -s * 0.45;
    g.add(slab);
  }
  // round pop-door + ramp with cleats
  const hole = cyl(0.32, 0.32, 0.06, 0x3a2416, 8);
  hole.position.set(0, LIFT + 0.55, D / 2 + 0.04);
  hole.rotation.x = Math.PI / 2;
  g.add(hole);
  const ramp = box(0.55, 0.07, 1.7, P.woodLight);
  ramp.position.set(0, LIFT * 0.55, D / 2 + 0.75);
  ramp.rotation.x = 0.55;
  g.add(ramp);
  for (let i = 0; i < 4; i++) {
    const cleat = box(0.5, 0.05, 0.07, P.woodDark);
    cleat.position.set(0, LIFT * 0.24 + i * 0.24, D / 2 + 1.25 - i * 0.33);
    cleat.rotation.x = 0.55;
    g.add(cleat);
  }
  // nesting annex on the side
  const nest = box(0.7, 0.7, 1.0, 0xb0502e);
  nest.position.set(W / 2 + 0.3, LIFT + 0.55, 0);
  g.add(nest);
  const nestRoof = box(0.85, 0.09, 1.15, P.woodDark);
  nestRoof.position.set(W / 2 + 0.32, LIFT + 1.0, 0);
  nestRoof.rotation.z = -0.3;
  g.add(nestRoof);
  // a white hen on the ridge
  const hen = ball(0.2, 0xf5f1e6, 0.9, 7);
  hen.position.set(-0.5, LIFT + H + 0.75, 0);
  g.add(hen);
  const comb = box(0.07, 0.12, 0.14, 0xd8433a);
  comb.position.set(-0.5, LIFT + H + 0.98, 0);
  g.add(comb);
  return g;
}

// 🚿 Water Trough — long timber trough on cross-legs, brim of water
function waterTrough() {
  const g = new THREE.Group();
  const L = 2.6, W = 0.85, H = 0.6, LIFT = 0.45;
  for (const sx of [-L / 2 + 0.3, L / 2 - 0.3]) {
    for (const r of [0.5, -0.5]) {
      const leg = box(0.12, LIFT + 0.35, 0.14, P.woodDark);
      leg.position.set(sx, (LIFT + 0.2) / 2, 0);
      leg.rotation.x = r;
      g.add(leg);
    }
  }
  const tub = box(L, H, W, P.wood);
  tub.position.y = LIFT + H / 2;
  g.add(tub);
  for (const sz of [-W / 2, W / 2]) {
    const rim = box(L + 0.1, 0.1, 0.12, P.woodDark);
    rim.position.set(0, LIFT + H, sz);
    g.add(rim);
  }
  const water = box(L - 0.2, 0.06, W - 0.2, WATER);
  water.position.y = LIFT + H - 0.06;
  g.add(water);
  return g;
}

// 🛞 Wheelbarrow — flared tray, spoked front wheel, kick legs, dirt load
function wheelbarrow() {
  const g = new THREE.Group();
  const tray = new THREE.Group();
  const floor = box(1.5, 0.08, 0.95, P.wood);
  tray.add(floor);
  for (const [dz, r] of [[0.5, 0.5], [-0.5, -0.5]]) {
    const side = box(1.5, 0.55, 0.08, P.woodLight);
    side.position.set(0, 0.26, dz);
    side.rotation.x = r * 0.5;
    tray.add(side);
  }
  const backB = box(0.95, 0.5, 0.08, P.woodLight);
  backB.position.set(-0.75, 0.24, 0);
  backB.rotation.y = Math.PI / 2;
  backB.rotation.x = -0.35;
  tray.add(backB);
  const frontB = backB.clone();
  frontB.position.x = 0.75;
  frontB.rotation.x = 0.35;
  tray.add(frontB);
  const load = ball(0.42, 0x6b4a2e, 0.6, 7);
  load.position.set(0.1, 0.35, 0);
  load.scale.x = 1.5;
  tray.add(load);
  tray.position.y = 0.72;
  tray.rotation.z = 0.08;
  g.add(tray);
  // spoked wheel
  const wheel = cyl(0.42, 0.42, 0.12, P.woodDark, 10);
  wheel.position.set(0.95, 0.42, 0);
  wheel.rotation.x = Math.PI / 2;
  g.add(wheel);
  const hub = cyl(0.1, 0.1, 0.2, IRON, 6);
  hub.position.copy(wheel.position);
  hub.rotation.x = Math.PI / 2;
  g.add(hub);
  for (let i = 0; i < 3; i++) {
    const spoke = box(0.66, 0.06, 0.05, P.woodLight);
    spoke.position.copy(wheel.position);
    spoke.rotation.z = (i / 3) * Math.PI;
    spoke.rotation.x = Math.PI / 2;
    g.add(spoke);
  }
  // handles + legs
  for (const sz of [-0.4, 0.4]) {
    const handle = cyl(0.05, 0.06, 1.5, P.woodDark, 5);
    handle.position.set(-0.95, 0.75, sz);
    handle.rotation.z = Math.PI / 2 - 0.12;
    g.add(handle);
    const leg = box(0.08, 0.6, 0.08, IRON);
    leg.position.set(-0.55, 0.35, sz);
    leg.rotation.z = 0.2;
    g.add(leg);
  }
  return g;
}

// 🕳️ Well — stone ring, gable hood, crank bar with rope and bucket
function well() {
  const g = new THREE.Group();
  const ring = cyl(0.95, 1.05, 0.9, P.stone, 9);
  ring.position.y = 0.45;
  g.add(ring);
  const cap = cyl(1.02, 0.98, 0.14, 0x8a8177, 9);
  cap.position.y = 0.95;
  g.add(cap);
  const shaft = cyl(0.7, 0.7, 0.06, 0x1e2a33, 9);
  shaft.position.y = 0.99;
  g.add(shaft);
  for (const s of [-1, 1]) {
    const post = cyl(0.09, 0.12, 1.6, P.woodDark, 6);
    post.position.set(s * 0.85, 1.7, 0);
    g.add(post);
  }
  for (const sr of [-1, 1]) {
    const slab = box(2.2, 0.1, 0.85, 0x7a5236);
    slab.position.set(0, 2.72, sr * 0.3);
    slab.rotation.x = -sr * 0.5;
    g.add(slab);
  }
  const axle = cyl(0.07, 0.07, 1.9, P.wood, 6);
  axle.position.y = 2.1;
  axle.rotation.z = Math.PI / 2;
  g.add(axle);
  const crank = box(0.35, 0.07, 0.07, IRON);
  crank.position.set(1.05, 2.25, 0);
  crank.rotation.z = 0.9;
  g.add(crank);
  const rope = cyl(0.035, 0.035, 0.85, 0xc9b17e, 4);
  rope.position.y = 1.65;
  g.add(rope);
  const bucket = cyl(0.24, 0.18, 0.34, P.wood, 8);
  bucket.position.y = 1.2;
  g.add(bucket);
  return g;
}

// 〰️ Irrigation Ditch — dug channel with banked earth and a sluice gate
function irrigationDitch() {
  const g = new THREE.Group();
  const L = 4.2;
  for (const s of [-1, 1]) {
    const bank = box(L, 0.35, 0.5, 0x6b4a2e);
    bank.position.set(0, 0.17, s * 0.62);
    g.add(bank);
    const bankTop = box(L, 0.12, 0.34, 0x7d583a);
    bankTop.position.set(0, 0.4, s * 0.66);
    g.add(bankTop);
  }
  const water = box(L - 0.1, 0.08, 0.7, WATER);
  water.position.y = 0.12;
  g.add(water);
  const bed = box(L, 0.06, 0.8, 0x54381f);
  bed.position.y = 0.03;
  g.add(bed);
  // little sluice gate at one end
  for (const s of [-1, 1]) {
    const gpost = box(0.12, 0.9, 0.12, P.woodDark);
    gpost.position.set(L / 2 - 0.3, 0.45, s * 0.55);
    g.add(gpost);
  }
  const gate = box(0.1, 0.6, 0.95, P.woodLight);
  gate.position.set(L / 2 - 0.3, 0.62, 0);
  g.add(gate);
  for (let i = 0; i < 5; i++) {
    const rock = ball(0.12 + (i % 3) * 0.04, P.stone, 0.8, 5);
    rock.position.set(-L / 2 + 0.5 + i * 0.85, 0.42, (i % 2 ? 0.66 : -0.66));
    g.add(rock);
  }
  return g;
}

// 🕸️ Crop Netting — poles holding a draped mesh canopy
function cropNetting() {
  const g = new THREE.Group();
  const W = 3.2, D = 2.6, H = 1.7;
  for (const [sx, sz] of [[-W / 2, -D / 2], [W / 2, -D / 2], [-W / 2, D / 2], [W / 2, D / 2]]) {
    const pole = cyl(0.07, 0.09, H, P.woodDark, 5);
    pole.position.set(sx, H / 2, sz);
    g.add(pole);
    const tip = ball(0.09, P.woodLight, 1, 5);
    tip.position.set(sx, H, sz);
    g.add(tip);
  }
  const netMat = new THREE.MeshStandardMaterial({
    color: 0xf2ede0, roughness: 0.9, flatShading: true, transparent: true, opacity: 0.35, side: THREE.DoubleSide,
  });
  // canopy sags gently between the poles
  const canopy = new THREE.Mesh(new THREE.PlaneGeometry(W, D, 6, 6), netMat);
  const cp = canopy.geometry.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < cp.count; i++) {
    v.fromBufferAttribute(cp, i);
    const sag = (1 - Math.abs(v.x) / (W / 2)) * (1 - Math.abs(v.y) / (D / 2));
    cp.setZ(i, -sag * 0.4);
  }
  canopy.geometry.computeVertexNormals();
  canopy.rotation.x = -Math.PI / 2;
  canopy.position.y = H - 0.02;
  g.add(canopy);
  // mesh lines over the top
  for (let i = 0; i < 4; i++) {
    const strand = box(W + 0.1, 0.03, 0.03, 0xe8e0cc);
    strand.position.set(0, H - 0.08, -D / 2 + (i + 0.5) * (D / 4));
    g.add(strand);
  }
  for (let i = 0; i < 4; i++) {
    const strand = box(0.03, 0.03, D + 0.1, 0xe8e0cc);
    strand.position.set(-W / 2 + (i + 0.5) * (W / 4), H - 0.08, 0);
    g.add(strand);
  }
  // young greens sheltering underneath
  for (let i = 0; i < 6; i++) {
    const sprout = cone(0.15, 0.4, i % 2 ? P.leaf : P.leafLight, 5);
    sprout.position.set(-W / 2 + 0.6 + (i % 3) * 1.0, 0.2, -D / 2 + 0.65 + Math.floor(i / 3) * 1.3);
    g.add(sprout);
  }
  return g;
}

// 🥔 Root Cellar — grassy mound with a stone-arched door and a vent
function rootCellar() {
  const g = new THREE.Group();
  const mound = ball(2.1, 0x5f9e4c, 0.62, 10);
  mound.position.y = 0.35;
  g.add(mound);
  const face = cyl(1.05, 1.2, 0.5, P.stone, 8);
  face.position.set(0, 0.62, 1.55);
  face.rotation.x = Math.PI / 2;
  g.add(face);
  const arch = cyl(0.78, 0.78, 0.2, 0x8a8177, 8);
  arch.position.set(0, 0.62, 1.78);
  arch.rotation.x = Math.PI / 2;
  g.add(arch);
  // angled wooden double door
  for (const s of [-1, 1]) {
    const door = box(0.55, 0.06, 1.1, P.woodDark);
    door.position.set(s * 0.3, 0.72, 1.78);
    door.rotation.x = -0.9;
    door.rotation.y = s * 0.08;
    g.add(door);
  }
  const vent = cyl(0.1, 0.1, 0.6, IRON, 6);
  vent.position.set(-0.7, 1.75, -0.3);
  g.add(vent);
  const ventCap = ball(0.14, IRON, 0.5, 6);
  ventCap.position.set(-0.7, 2.05, -0.3);
  g.add(ventCap);
  // sacks by the door
  const sack = ball(0.34, 0xc9a25e, 0.85, 7);
  sack.position.set(1.15, 0.3, 1.5);
  g.add(sack);
  const sackTie = cyl(0.09, 0.12, 0.16, 0xa87f42, 6);
  sackTie.position.set(1.15, 0.62, 1.5);
  g.add(sackTie);
  return g;
}

// 🐰 Rabbit Hutch — two-room hutch on legs with a mesh front and a rabbit
function rabbitHutch() {
  const g = new THREE.Group();
  const W = 2.0, D = 1.1, H = 1.0, LIFT = 0.55;
  for (const [sx, sz] of [[-0.85, -0.4], [0.85, -0.4], [-0.85, 0.4], [0.85, 0.4]]) {
    const leg = box(0.12, LIFT, 0.12, P.woodDark);
    leg.position.set(sx, LIFT / 2, sz);
    g.add(leg);
  }
  const bodyH = box(W, H, D, P.wood);
  bodyH.position.y = LIFT + H / 2;
  g.add(bodyH);
  const divider = box(0.06, H - 0.1, 0.06, P.woodDark);
  divider.position.set(0.15, LIFT + H / 2, D / 2 + 0.02);
  g.add(divider);
  // mesh window on the left room
  const mesh1 = box(0.95, 0.62, 0.05, 0x2c2c2a);
  mesh1.position.set(-0.42, LIFT + H / 2, D / 2 + 0.03);
  g.add(mesh1);
  for (let i = 0; i < 3; i++) {
    const wire = box(0.02, 0.62, 0.07, 0xb9b4a8);
    wire.position.set(-0.72 + i * 0.3, LIFT + H / 2, D / 2 + 0.04);
    g.add(wire);
  }
  // solid door on the right room
  const doorH = box(0.6, 0.62, 0.06, P.woodDark);
  doorH.position.set(0.55, LIFT + H / 2, D / 2 + 0.03);
  g.add(doorH);
  const latch = ball(0.05, 0xd8b13a, 1, 4);
  latch.position.set(0.32, LIFT + H / 2, D / 2 + 0.08);
  g.add(latch);
  const roofH = box(W + 0.35, 0.1, D + 0.35, 0x7a5236);
  roofH.position.set(0, LIFT + H + 0.1, -0.05);
  roofH.rotation.x = -0.12;
  g.add(roofH);
  // resident rabbit hopping about
  const bun = ball(0.2, 0xf5f1e6, 0.85, 7);
  bun.position.set(-1.3, 0.2, 0.4);
  g.add(bun);
  const bunHead = ball(0.13, 0xf5f1e6, 0.95, 6);
  bunHead.position.set(-1.47, 0.34, 0.4);
  g.add(bunHead);
  for (const s of [-1, 1]) {
    const ear = cyl(0.035, 0.05, 0.22, 0xf5f1e6, 4);
    ear.position.set(-1.5, 0.52, 0.4 + s * 0.05);
    ear.rotation.x = s * 0.2;
    g.add(ear);
  }
  return g;
}

// ⛺ Livestock Shelter — open lean-to over a bed of hay
function livestockShelter() {
  const g = new THREE.Group();
  const W = 3.4, D = 2.6;
  const hs = [2.2, 2.2, 1.5, 1.5];
  const spots = [[-W / 2, -D / 2], [W / 2, -D / 2], [-W / 2, D / 2], [W / 2, D / 2]];
  spots.forEach(([sx, sz], i) => {
    const post = cyl(0.11, 0.14, hs[i], P.woodDark, 6);
    post.position.set(sx, hs[i] / 2, sz);
    g.add(post);
  });
  const roof = box(W + 0.7, 0.14, D + 0.9, 0x8a6a44);
  roof.position.y = 2.1;
  roof.rotation.x = 0.26;
  g.add(roof);
  const ridgeTrim = box(W + 0.8, 0.1, 0.18, P.woodDark);
  ridgeTrim.position.set(0, 2.42, -D / 2 - 0.28);
  g.add(ridgeTrim);
  // half-wall on the windward side
  const wall = box(W, 0.9, 0.12, P.wood);
  wall.position.set(0, 0.45, -D / 2);
  g.add(wall);
  // hay bedding + a feed pile
  const hay = ball(1.1, 0xd9b45c, 0.35, 8);
  hay.position.set(-0.4, 0.22, 0.2);
  hay.scale.x = 1.4;
  g.add(hay);
  const pile = ball(0.5, 0xe5c26e, 0.6, 7);
  pile.position.set(1.0, 0.3, -0.4);
  g.add(pile);
  return g;
}

// 🧰 Tool Rack — post-and-rail rack hung with the day's tools
function toolRack() {
  const g = new THREE.Group();
  for (const s of [-1, 1]) {
    const post = cyl(0.09, 0.12, 1.9, P.woodDark, 6);
    post.position.set(s * 1.1, 0.95, 0);
    g.add(post);
  }
  for (const y of [1.7, 0.9]) {
    const rail = box(2.5, 0.1, 0.1, P.wood);
    rail.position.y = y;
    g.add(rail);
  }
  // shovel
  const shovelStick = cyl(0.04, 0.04, 1.5, P.woodLight, 5);
  shovelStick.position.set(-0.7, 1.0, 0.1);
  shovelStick.rotation.z = 0.08;
  g.add(shovelStick);
  const blade = box(0.26, 0.36, 0.05, IRON);
  blade.position.set(-0.76, 0.28, 0.1);
  g.add(blade);
  // pitchfork
  const forkStick = cyl(0.04, 0.04, 1.5, P.woodLight, 5);
  forkStick.position.set(0, 1.0, 0.1);
  g.add(forkStick);
  for (let i = 0; i < 3; i++) {
    const tine = cyl(0.02, 0.02, 0.34, IRON, 4);
    tine.position.set(-0.08 + i * 0.08, 0.28, 0.1);
    g.add(tine);
  }
  const forkBar = box(0.24, 0.05, 0.05, IRON);
  forkBar.position.set(0, 0.44, 0.1);
  g.add(forkBar);
  // hoe
  const hoeStick = cyl(0.04, 0.04, 1.5, P.woodLight, 5);
  hoeStick.position.set(0.7, 1.0, 0.1);
  hoeStick.rotation.z = -0.08;
  g.add(hoeStick);
  const hoeHead = box(0.3, 0.08, 0.14, IRON);
  hoeHead.position.set(0.78, 0.28, 0.14);
  g.add(hoeHead);
  return g;
}

// 🛒 Hand Cart — two-wheeled slatted cart with a crate and sack aboard
function handCart() {
  const g = new THREE.Group();
  const bed = new THREE.Group();
  const floor = box(2.1, 0.1, 1.25, P.wood);
  bed.add(floor);
  for (const sz of [-0.62, 0.62]) {
    for (let i = 0; i < 4; i++) {
      const slat = box(0.1, 0.5, 0.08, P.woodLight);
      slat.position.set(-0.8 + i * 0.53, 0.28, sz);
      bed.add(slat);
    }
    const railTop = box(2.1, 0.08, 0.08, P.woodDark);
    railTop.position.set(0, 0.55, sz);
    bed.add(railTop);
  }
  const crate = box(0.65, 0.6, 0.65, 0xb08948);
  crate.position.set(-0.45, 0.38, -0.1);
  crate.rotation.y = 0.2;
  bed.add(crate);
  const sack = ball(0.32, 0xc9a25e, 0.8, 7);
  sack.position.set(0.5, 0.28, 0.15);
  bed.add(sack);
  bed.position.y = 0.75;
  bed.rotation.z = -0.06;
  g.add(bed);
  for (const sz of [-0.75, 0.75]) {
    const wheel = cyl(0.5, 0.5, 0.12, P.woodDark, 10);
    wheel.position.set(0.2, 0.5, sz);
    wheel.rotation.x = Math.PI / 2;
    g.add(wheel);
    const hub = cyl(0.1, 0.1, 0.2, IRON, 6);
    hub.position.set(0.2, 0.5, sz);
    hub.rotation.x = Math.PI / 2;
    g.add(hub);
  }
  for (const sz of [-0.45, 0.45]) {
    const handle = cyl(0.045, 0.055, 1.6, P.woodDark, 5);
    handle.position.set(-1.55, 0.62, sz);
    handle.rotation.z = Math.PI / 2 - 0.18;
    g.add(handle);
  }
  const legC = box(0.09, 0.55, 0.09, IRON);
  legC.position.set(-0.85, 0.3, 0);
  legC.rotation.z = 0.15;
  g.add(legC);
  return g;
}

// 👣 Dirt Path — trodden earth patch with pebbles and boot prints
function dirtPath() {
  const g = new THREE.Group();
  const patch = cyl(1.9, 2.05, 0.1, 0xb59a6b, 11);
  patch.position.y = 0.05;
  patch.scale.z = 0.62;
  g.add(patch);
  const inner = cyl(1.5, 1.6, 0.06, 0xa8895a, 10);
  inner.position.y = 0.11;
  inner.scale.z = 0.58;
  g.add(inner);
  for (let i = 0; i < 6; i++) {
    const pebble = ball(0.08 + (i % 3) * 0.03, P.stone, 0.7, 5);
    pebble.position.set(-1.4 + i * 0.55, 0.14, (i % 2 ? 0.5 : -0.45));
    g.add(pebble);
  }
  // pairs of boot prints wandering through
  for (let i = 0; i < 3; i++) {
    for (const s of [-1, 1]) {
      const print = box(0.16, 0.03, 0.3, 0x8a6f47);
      print.position.set(-1.0 + i * 0.9 + (s > 0 ? 0.22 : 0), 0.14, s * 0.14 - 0.05 + i * 0.12);
      print.rotation.y = 0.2 + i * 0.1;
      g.add(print);
    }
  }
  return g;
}

// 🔥 Campfire — stone ring, crossed logs, licking flames that flicker
function campfire() {
  const g = new THREE.Group();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const rock = ball(0.24 + (i % 2) * 0.06, i % 2 ? P.stone : 0x8a8177, 0.8, 6);
    rock.position.set(Math.cos(a) * 0.95, 0.18, Math.sin(a) * 0.95);
    g.add(rock);
  }
  const ash = cyl(0.75, 0.85, 0.08, 0x3a332c, 9);
  ash.position.y = 0.05;
  g.add(ash);
  for (let i = 0; i < 3; i++) {
    const log = cyl(0.11, 0.13, 1.3, 0x6b4423, 6);
    log.position.y = 0.24;
    log.rotation.z = Math.PI / 2 - 0.35;
    log.rotation.y = (i / 3) * Math.PI * 2;
    g.add(log);
  }
  const flameMat = new THREE.MeshStandardMaterial({
    color: 0xff9d2e, emissive: 0xff7a1a, emissiveIntensity: 1.3, roughness: 0.6, flatShading: true,
  });
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.95, 6), flameMat);
  flame.position.y = 0.75;
  g.add(flame);
  const flame2 = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.6, 5), new THREE.MeshStandardMaterial({
    color: 0xffd75a, emissive: 0xffc23a, emissiveIntensity: 1.5, roughness: 0.6, flatShading: true,
  }));
  flame2.position.set(0.14, 0.62, 0.08);
  g.add(flame2);
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.75, 8, 6), new THREE.MeshBasicMaterial({
    color: 0xffb03a, transparent: true, opacity: 0.22, depthWrite: false,
  }));
  glow.position.y = 0.7;
  g.add(glow);
  // log bench to sit on
  const bench = cyl(0.16, 0.18, 1.6, P.wood, 7);
  bench.position.set(0, 0.28, 1.65);
  bench.rotation.z = Math.PI / 2;
  g.add(bench);
  // wire into the shared lantern flicker
  g.userData.anim = { kind: 'lantern', glow, flame };
  return g;
}

export const INFRA_MODELS = {
  ...INFRA_MODELS_B,
  ...INFRA_MODELS_C,
  ...INFRA_MODELS_D,
  ...INFRA_MODELS_E,
  ...INFRA_MODELS_F,
  wat_well: well,
  wat_ditch: irrigationDitch,
  fld_netting: cropNetting,
  sto_rootcellar: rootCellar,
  liv_hutch: rabbitHutch,
  liv_shelter: livestockShelter,
  mac_toolrack: toolRack,
  mac_handcart: handCart,
  log_dirtpath: dirtPath,
  enr_campfire: campfire,
  wat_handpump: handPump,
  wat_barrel: waterBarrel,
  wat_rainbarrel: rainBarrel,
  fld_raisedbed: raisedBed,
  fld_herbgarden: herbGarden,
  sto_shed: storageShed,
  sto_feedbin: feedBin,
  liv_coop: chickenCoop,
  liv_watertrough: waterTrough,
  mac_wheelbarrow: wheelbarrow,
};
