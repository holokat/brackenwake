// Hand-built models, batch E — livestock comforts, worker quarters, roadside
// commerce, and hedgerow ecology. Same flat-shaded low-poly language as
// assets.js: P palette, chunky silhouettes, warm trims.

import * as THREE from 'three';
import { P, mat, box, cyl, cone, ball } from './assets.js';

const IRON = 0x4e5257;
const WATER = 0x4fa8d8;
const GRAIN = 0xe8c26a;
const HAY = 0xd9b45c;

// 🍽️ Feeding Trough — low wooden trough heaped with golden feed, spilled grain
function feedingTrough() {
  const g = new THREE.Group();
  const L = 1.9, W = 0.7, H = 0.5;
  // splayed cross-legs at each end
  for (const sx of [-L / 2 + 0.25, L / 2 - 0.25]) {
    for (const r of [0.45, -0.45]) {
      const leg = box(0.11, 0.55, 0.13, P.woodDark);
      leg.position.set(sx, 0.26, 0);
      leg.rotation.x = r;
      g.add(leg);
    }
  }
  const tub = box(L, H, W, P.wood);
  tub.position.y = 0.3 + H / 2 - 0.1;
  g.add(tub);
  for (const sz of [-W / 2, W / 2]) {
    const rim = box(L + 0.1, 0.09, 0.11, P.woodDark);
    rim.position.set(0, 0.3 + H - 0.1, sz);
    g.add(rim);
  }
  for (const sx of [-L / 2, L / 2]) {
    const cap = box(0.11, 0.09, W + 0.08, P.woodDark);
    cap.position.set(sx, 0.3 + H - 0.1, 0);
    g.add(cap);
  }
  // heaped golden feed cresting over the rim
  const heap = ball(0.5, GRAIN, 0.55, 8);
  heap.position.set(-0.25, 0.72, 0);
  heap.scale.x = 1.6;
  g.add(heap);
  const heap2 = ball(0.34, 0xf0cd7c, 0.6, 7);
  heap2.position.set(0.55, 0.7, 0.05);
  g.add(heap2);
  // scattering of spilled grain dots on the ground
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + 0.5;
    const grain = ball(0.05 + (i % 2) * 0.02, i % 2 ? GRAIN : 0xf0cd7c, 0.6, 4);
    grain.position.set(Math.cos(a) * (0.9 + (i % 3) * 0.25), 0.04, Math.sin(a) * (0.5 + (i % 2) * 0.2));
    g.add(grain);
  }
  return g;
}

// 🎋 Hay Rack — V-shaped slatted rack on legs stuffed with hay, tufts below
function hayRack() {
  const g = new THREE.Group();
  const L = 2.6, LIFT = 0.7;
  // A-frame legs at each end
  for (const sx of [-L / 2 + 0.25, L / 2 - 0.25]) {
    for (const r of [0.4, -0.4]) {
      const leg = box(0.13, 1.7, 0.13, P.woodDark);
      leg.position.set(sx, 0.85, 0);
      leg.rotation.x = r;
      g.add(leg);
    }
    const tie = box(0.11, 0.1, 1.0, P.wood);
    tie.position.set(sx, 0.55, 0);
    g.add(tie);
  }
  // V of slats
  for (const s of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const slat = box(L, 0.09, 0.09, i % 2 ? P.wood : P.woodLight);
      slat.position.set(0, LIFT + 0.12 + i * 0.28, s * (0.14 + i * 0.15));
      g.add(slat);
    }
  }
  // end rails tying the V together
  for (const sx of [-L / 2, L / 2]) {
    for (const s of [-1, 1]) {
      const brace = box(0.09, 1.05, 0.09, P.woodDark);
      brace.position.set(sx, LIFT + 0.5, s * 0.34);
      brace.rotation.x = s * 0.42;
      g.add(brace);
    }
  }
  // hay stuffed into the V, bulging over the top
  const hay = ball(0.55, HAY, 0.7, 8);
  hay.position.set(-0.55, LIFT + 0.95, 0);
  hay.scale.x = 1.6;
  g.add(hay);
  const hay2 = ball(0.5, 0xe5c26e, 0.7, 8);
  hay2.position.set(0.65, LIFT + 0.9, 0);
  hay2.scale.x = 1.5;
  g.add(hay2);
  const wisp = cone(0.14, 0.4, 0xe5c26e, 5);
  wisp.position.set(0.1, LIFT + 1.35, 0.1);
  wisp.rotation.z = 0.5;
  g.add(wisp);
  // loose tufts dropped underneath
  for (let i = 0; i < 4; i++) {
    const tuft = ball(0.16 + (i % 2) * 0.06, i % 2 ? HAY : 0xe5c26e, 0.5, 6);
    tuft.position.set(-1.0 + i * 0.65, 0.08, (i % 2 ? 0.35 : -0.3));
    g.add(tuft);
  }
  return g;
}

// 🦆 Duck House — little house on a pond edge: ramp into water, duck afloat
function duckHouse() {
  const g = new THREE.Group();
  // blue water disc with a mud rim
  const rim = cyl(1.55, 1.7, 0.12, 0x7d583a, 10);
  rim.position.set(0.75, 0.06, 0.65);
  g.add(rim);
  const pond = cyl(1.4, 1.4, 0.08, WATER, 10);
  pond.position.set(0.75, 0.13, 0.65);
  g.add(pond);
  // the house on a low platform at the pond edge
  const plat = box(1.5, 0.22, 1.3, P.woodDark);
  plat.position.set(-0.95, 0.11, -0.85);
  g.add(plat);
  const W = 1.25, D = 1.05, H = 0.95;
  const body = box(W, H, D, 0xc9a25e);
  body.position.set(-0.95, 0.22 + H / 2, -0.85);
  g.add(body);
  for (const s of [-1, 1]) {
    const slab = box(W + 0.4, 0.1, D * 0.72, P.capRed);
    slab.position.set(-0.95, 0.22 + H + 0.28, -0.85 + s * D * 0.25);
    slab.rotation.x = -s * 0.5;
    g.add(slab);
  }
  const ridge = box(W + 0.5, 0.1, 0.14, P.woodDark);
  ridge.position.set(-0.95, 0.22 + H + 0.5, -0.85);
  g.add(ridge);
  // arched pop-door
  const hole = cyl(0.26, 0.26, 0.06, 0x3a2416, 8);
  hole.position.set(-0.6, 0.62, -0.85 + D / 2 + 0.02);
  hole.rotation.x = Math.PI / 2;
  g.add(hole);
  // ramp from the door down into the water
  const ramp = box(0.45, 0.06, 1.5, P.woodLight);
  ramp.position.set(-0.35, 0.28, -0.05);
  ramp.rotation.x = 0.32;
  ramp.rotation.y = -0.5;
  g.add(ramp);
  for (let i = 0; i < 3; i++) {
    const cleat = box(0.4, 0.04, 0.06, P.woodDark);
    cleat.position.set(-0.53 + i * 0.18, 0.44 - i * 0.14, -0.42 + i * 0.36);
    cleat.rotation.y = -0.5;
    cleat.rotation.x = 0.32;
    g.add(cleat);
  }
  // white duck floating on the pond
  const duck = ball(0.2, 0xf5f1e6, 0.8, 7);
  duck.position.set(1.05, 0.24, 0.75);
  duck.scale.x = 1.3;
  g.add(duck);
  const duckHead = ball(0.11, 0xf5f1e6, 1, 6);
  duckHead.position.set(1.28, 0.44, 0.75);
  g.add(duckHead);
  const bill = box(0.12, 0.04, 0.08, 0xe8963a);
  bill.position.set(1.4, 0.42, 0.75);
  g.add(bill);
  const tail = cone(0.07, 0.16, 0xf5f1e6, 5);
  tail.position.set(0.82, 0.32, 0.75);
  tail.rotation.z = 1.1;
  g.add(tail);
  // reeds at the far bank
  for (let i = 0; i < 3; i++) {
    const reed = cyl(0.03, 0.04, 0.6 + (i % 2) * 0.2, P.stem, 4);
    reed.position.set(1.8 + (i % 2) * 0.2, 0.35, 1.3 - i * 0.3);
    reed.rotation.z = (i - 1) * 0.12;
    g.add(reed);
    const tip = ball(0.05, 0x74522f, 1.6, 4);
    tip.position.set(1.8 + (i % 2) * 0.2, 0.72 + (i % 2) * 0.2, 1.3 - i * 0.3);
    g.add(tip);
  }
  return g;
}

// 💩 Manure Pit — timber-edged pit with dark heap, flies on stalks, load beside
function manurePit() {
  const g = new THREE.Group();
  const W = 2.4, D = 2.0;
  // timber edging, two courses with staggered corners
  for (let c = 0; c < 2; c++) {
    for (const [dx, dz, len, r] of [[0, D / 2, W, 0], [0, -D / 2, W, 0], [W / 2, 0, D, 1], [-W / 2, 0, D, 1]]) {
      const beam = cyl(0.11, 0.11, len + 0.25, c ? P.woodDark : P.wood, 6);
      beam.position.set(dx, 0.12 + c * 0.2, dz);
      beam.rotation.z = Math.PI / 2;
      if (r) beam.rotation.y = Math.PI / 2;
      g.add(beam);
    }
  }
  // the dark heap, cresting above the edging
  const bed = box(W - 0.2, 0.14, D - 0.2, 0x3a2a18);
  bed.position.y = 0.12;
  g.add(bed);
  const heap = ball(0.85, 0x4c3320, 0.6, 8);
  heap.position.set(-0.15, 0.42, 0.1);
  heap.scale.x = 1.35;
  g.add(heap);
  const heap2 = ball(0.5, 0x5a3d24, 0.65, 7);
  heap2.position.set(0.6, 0.44, -0.45);
  g.add(heap2);
  const crown = ball(0.3, 0x3f2c1a, 0.8, 6);
  crown.position.set(-0.2, 0.82, 0.1);
  g.add(crown);
  // flies suggested by tiny dark dots on thin stalks
  for (const [fx, fz, fh] of [[-0.5, 0.5, 1.25], [0.35, -0.15, 1.45], [0.15, 0.55, 1.1]]) {
    const stalk = cyl(0.012, 0.012, fh - 0.4, 0x6b6558, 3);
    stalk.position.set(fx, (fh - 0.4) / 2 + 0.4, fz);
    g.add(stalk);
    const fly = ball(0.05, 0x24201a, 1, 4);
    fly.position.set(fx, fh, fz);
    g.add(fly);
  }
  // wheelbarrow-load dumped beside the pit
  const load = ball(0.42, 0x4c3320, 0.6, 7);
  load.position.set(W / 2 + 0.75, 0.2, -0.35);
  load.scale.x = 1.2;
  g.add(load);
  // pitchfork stuck in the heap
  const forkStick = cyl(0.04, 0.04, 1.4, P.woodLight, 5);
  forkStick.position.set(0.45, 1.1, 0.55);
  forkStick.rotation.z = -0.35;
  forkStick.rotation.x = 0.15;
  g.add(forkStick);
  for (let i = 0; i < 3; i++) {
    const tine = cyl(0.02, 0.02, 0.3, IRON, 4);
    tine.position.set(0.18 + i * 0.07, 0.52, 0.48 + i * 0.03);
    tine.rotation.z = -0.35;
    g.add(tine);
  }
  return g;
}

// 🚽 Outhouse — narrow hut, slanted roof, crescent-moon cutout, tiny vent pipe
function outhouse() {
  const g = new THREE.Group();
  const W = 1.1, D = 1.0, H = 2.0;
  const bodyO = box(W, H, D, P.wood);
  bodyO.position.y = H / 2;
  g.add(bodyO);
  // corner studs
  for (const [sx, sz] of [[-W / 2, -D / 2], [W / 2, -D / 2], [-W / 2, D / 2], [W / 2, D / 2]]) {
    const stud = box(0.12, H + 0.06, 0.12, P.woodDark);
    stud.position.set(sx, H / 2, sz);
    g.add(stud);
  }
  // slanted shed roof, high at the front
  const roof = box(W + 0.45, 0.12, D + 0.55, 0x7a5236);
  roof.position.y = H + 0.16;
  roof.rotation.x = 0.24;
  g.add(roof);
  const eave = box(W + 0.5, 0.08, 0.14, P.woodDark);
  eave.position.set(0, H + 0.32, D / 2 + 0.22);
  g.add(eave);
  // door with plank lines and the crescent-moon cutout
  const door = box(0.68, 1.55, 0.07, P.woodLight);
  door.position.set(0, 0.82, D / 2 + 0.04);
  g.add(door);
  for (const dx of [-0.16, 0.16]) {
    const seam = box(0.03, 1.5, 0.02, P.woodDark);
    seam.position.set(dx, 0.82, D / 2 + 0.08);
    g.add(seam);
  }
  // crescent: thin dark box, tilted
  const moon = box(0.09, 0.26, 0.03, 0x2c2419);
  moon.position.set(0, 1.38, D / 2 + 0.09);
  moon.rotation.z = 0.5;
  g.add(moon);
  const moonTip = box(0.07, 0.1, 0.03, 0x2c2419);
  moonTip.position.set(0.07, 1.5, D / 2 + 0.09);
  moonTip.rotation.z = 1.0;
  g.add(moonTip);
  const knobO = ball(0.05, 0xd8b13a, 1, 5);
  knobO.position.set(0.24, 0.8, D / 2 + 0.1);
  g.add(knobO);
  // tiny vent pipe out the back roof
  const vent = cyl(0.07, 0.07, 0.6, IRON, 6);
  vent.position.set(W / 2 - 0.2, H + 0.25, -D / 2 + 0.2);
  g.add(vent);
  const ventCap = ball(0.1, IRON, 0.5, 6);
  ventCap.position.set(W / 2 - 0.2, H + 0.56, -D / 2 + 0.2);
  g.add(ventCap);
  // stepping stone at the door
  const step = cyl(0.32, 0.38, 0.1, P.stone, 7);
  step.position.set(0, 0.05, D / 2 + 0.45);
  g.add(step);
  return g;
}

// 🛖 Worker Cabin — plank walls, porch with post, chimney stub, lit window
function workerCabin() {
  const g = new THREE.Group();
  const W = 3.0, D = 2.3, H = 1.9;
  const walls = box(W, H, D, P.wood);
  walls.position.y = H / 2;
  g.add(walls);
  // horizontal plank bands
  for (const y of [0.5, 1.0, 1.5]) {
    const band = box(W + 0.06, 0.09, D + 0.06, P.woodDark);
    band.position.y = y;
    g.add(band);
  }
  // gable roof
  for (const s of [-1, 1]) {
    const slab = box(W + 0.7, 0.14, D * 0.74, 0x7a5236);
    slab.position.set(0, H + 0.52, s * D * 0.26);
    slab.rotation.x = -s * 0.48;
    g.add(slab);
  }
  const ridge = box(W + 0.8, 0.13, 0.2, P.woodDark);
  ridge.position.y = H + 0.82;
  g.add(ridge);
  // stone chimney stub poking through the roof
  const chimney = box(0.5, 1.1, 0.5, P.stone);
  chimney.position.set(-W / 2 + 0.6, H + 0.65, -0.35);
  g.add(chimney);
  const chimCap = box(0.62, 0.12, 0.62, 0x8a8177);
  chimCap.position.set(-W / 2 + 0.6, H + 1.24, -0.35);
  g.add(chimCap);
  // porch: deck, post, and a little roof skirt
  const deck = box(1.5, 0.16, 0.9, P.woodDark);
  deck.position.set(0.55, 0.08, D / 2 + 0.45);
  g.add(deck);
  const post = cyl(0.08, 0.1, 1.5, P.woodDark, 6);
  post.position.set(1.15, 0.9, D / 2 + 0.72);
  g.add(post);
  const skirt = box(1.7, 0.1, 1.1, 0x8a6a44);
  skirt.position.set(0.55, 1.72, D / 2 + 0.42);
  skirt.rotation.x = 0.2;
  g.add(skirt);
  // door under the porch
  const door = box(0.72, 1.35, 0.07, P.woodDark);
  door.position.set(0.45, 0.84, D / 2 + 0.04);
  g.add(door);
  const knob = ball(0.05, 0xd8b13a, 1, 5);
  knob.position.set(0.7, 0.82, D / 2 + 0.1);
  g.add(knob);
  // lit window: warm emissive pane in a trim frame
  const frame = box(0.66, 0.66, 0.06, P.trim);
  frame.position.set(-0.85, 1.15, D / 2 + 0.03);
  g.add(frame);
  const pane = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.05), new THREE.MeshStandardMaterial({
    color: 0xffd98a, emissive: 0xffb845, emissiveIntensity: 0.9, roughness: 0.5, flatShading: true,
  }));
  pane.position.set(-0.85, 1.15, D / 2 + 0.06);
  g.add(pane);
  const mullionV = box(0.04, 0.5, 0.03, P.woodDark);
  mullionV.position.set(-0.85, 1.15, D / 2 + 0.1);
  g.add(mullionV);
  const mullionH = box(0.5, 0.04, 0.03, P.woodDark);
  mullionH.position.set(-0.85, 1.15, D / 2 + 0.1);
  g.add(mullionH);
  // chopped firewood stacked by the wall
  for (let i = 0; i < 3; i++) {
    const logW = cyl(0.09, 0.1, 0.6, 0x6b4423, 6);
    logW.position.set(-W / 2 - 0.25, 0.1 + (i === 2 ? 0.17 : 0), 0.3 - (i % 2) * 0.35 + (i === 2 ? -0.17 : 0));
    logW.rotation.x = Math.PI / 2;
    g.add(logW);
  }
  return g;
}

// 🧃 Roadside Stand — small table with a parasol, jugs and jars, price sign
function roadsideStand() {
  const g = new THREE.Group();
  // table
  const top = box(1.5, 0.1, 0.95, P.woodLight);
  top.position.y = 0.85;
  g.add(top);
  const apron = box(1.3, 0.14, 0.78, P.woodDark);
  apron.position.y = 0.74;
  g.add(apron);
  for (const [sx, sz] of [[-0.6, -0.35], [0.6, -0.35], [-0.6, 0.35], [0.6, 0.35]]) {
    const leg = box(0.1, 0.8, 0.1, P.wood);
    leg.position.set(sx, 0.4, sz);
    g.add(leg);
  }
  // parasol leaning through the tabletop
  const pole = cyl(0.05, 0.05, 2.0, P.woodDark, 5);
  pole.position.set(-0.35, 1.55, -0.1);
  pole.rotation.z = 0.12;
  g.add(pole);
  const canopy = cone(1.15, 0.55, P.capRed, 8);
  canopy.position.set(-0.5, 2.55, -0.1);
  canopy.rotation.z = 0.12;
  g.add(canopy);
  const canopyTip = ball(0.07, P.trim, 1, 5);
  canopyTip.position.set(-0.55, 2.87, -0.1);
  g.add(canopyTip);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const scallop = ball(0.14, P.trim, 0.6, 5);
    scallop.position.set(-0.5 + Math.cos(a) * 1.02, 2.3, -0.1 + Math.sin(a) * 1.02);
    g.add(scallop);
  }
  // jugs and jars on the tabletop
  const jug = cyl(0.13, 0.18, 0.42, 0xc9a25e, 7);
  jug.position.set(0.25, 1.11, -0.2);
  g.add(jug);
  const jugNeck = cyl(0.07, 0.1, 0.14, 0xc9a25e, 6);
  jugNeck.position.set(0.25, 1.39, -0.2);
  g.add(jugNeck);
  const jugCork = cyl(0.05, 0.05, 0.07, P.woodDark, 5);
  jugCork.position.set(0.25, 1.48, -0.2);
  g.add(jugCork);
  const jar1 = cyl(0.11, 0.11, 0.26, 0xe0955a, 7);
  jar1.position.set(0.58, 1.03, 0.15);
  g.add(jar1);
  const lid1 = cyl(0.12, 0.12, 0.05, 0xd8b13a, 7);
  lid1.position.set(0.58, 1.18, 0.15);
  g.add(lid1);
  const jar2 = cyl(0.1, 0.1, 0.22, 0xb03a30, 7);
  jar2.position.set(0.3, 1.01, 0.22);
  g.add(jar2);
  const lid2 = cyl(0.11, 0.11, 0.05, P.trim, 7);
  lid2.position.set(0.3, 1.14, 0.22);
  g.add(lid2);
  const bottle = cyl(0.07, 0.08, 0.34, 0x5a9e4a, 6);
  bottle.position.set(-0.15, 1.07, 0.25);
  g.add(bottle);
  // hand-painted price sign propped against a leg
  const sign = box(0.55, 0.42, 0.05, P.trim);
  sign.position.set(0.72, 0.32, 0.55);
  sign.rotation.x = -0.25;
  sign.rotation.y = -0.35;
  g.add(sign);
  const scrawl = box(0.34, 0.06, 0.02, 0xb03a30);
  scrawl.position.set(0.71, 0.38, 0.59);
  scrawl.rotation.x = -0.25;
  scrawl.rotation.y = -0.35;
  scrawl.rotation.z = 0.12;
  g.add(scrawl);
  const scrawl2 = box(0.24, 0.05, 0.02, 0x4c3320);
  scrawl2.position.set(0.74, 0.26, 0.56);
  scrawl2.rotation.x = -0.25;
  scrawl2.rotation.y = -0.35;
  g.add(scrawl2);
  return g;
}

// 🥕 Produce Stall — striped awning over tiered crates of colorful produce
function produceStall() {
  const g = new THREE.Group();
  const W = 2.8, D = 2.0;
  // counter
  const counter = box(W, 0.9, 1.0, P.wood);
  counter.position.set(0, 0.45, 0.35);
  g.add(counter);
  const counterTop = box(W + 0.15, 0.1, 1.15, P.woodLight);
  counterTop.position.set(0, 0.95, 0.35);
  g.add(counterTop);
  // four corner poles holding the awning
  for (const [sx, sz, h] of [[-W / 2, D / 2 - 0.15, 2.2], [W / 2, D / 2 - 0.15, 2.2], [-W / 2, -D / 2, 2.5], [W / 2, -D / 2, 2.5]]) {
    const pole = cyl(0.07, 0.09, h, P.woodDark, 6);
    pole.position.set(sx, h / 2, sz);
    g.add(pole);
  }
  // striped awning: alternating slabs on a forward slope
  for (let i = 0; i < 5; i++) {
    const strip = box((W + 0.5) / 5, 0.07, D + 0.5, i % 2 ? P.trim : P.capRed);
    strip.position.set(-(W + 0.5) / 2 + ((W + 0.5) / 5) * (i + 0.5), 2.32, 0.1);
    strip.rotation.x = 0.22;
    g.add(strip);
  }
  const valance = box(W + 0.55, 0.16, 0.06, P.capRed);
  valance.position.set(0, 2.05, 1.22);
  g.add(valance);
  // tiered crates on the counter
  const crateA = box(0.8, 0.3, 0.6, 0xb08948);
  crateA.position.set(-0.85, 1.15, 0.35);
  crateA.rotation.x = -0.18;
  g.add(crateA);
  const crateB = box(0.8, 0.3, 0.6, 0xb08948);
  crateB.position.set(0.05, 1.15, 0.35);
  crateB.rotation.x = -0.18;
  g.add(crateB);
  const crateC = box(0.8, 0.3, 0.6, 0xb08948);
  crateC.position.set(0.95, 1.15, 0.35);
  crateC.rotation.x = -0.18;
  g.add(crateC);
  // produce clusters: orange, red, green
  const spots = [[-0.18, 0.14], [0.18, 0.1], [0, -0.14], [-0.14, -0.06], [0.14, -0.1]];
  const stacks = [
    [-0.85, 0xe8963a], // oranges / carrots
    [0.05, 0xd8433a],  // tomatoes
    [0.95, 0x6fb14a],  // greens
  ];
  for (const [cx, col] of stacks) {
    for (let i = 0; i < 5; i++) {
      const fruit = ball(0.1 + (i % 2) * 0.02, col, 0.95, 6);
      fruit.position.set(cx + spots[i][0], 1.36 - spots[i][1] * 0.45, 0.42 + spots[i][1]);
      g.add(fruit);
    }
  }
  // a lower crate of pumpkin-ish squash on the ground out front
  const crateD = box(0.75, 0.4, 0.75, 0x9a7048);
  crateD.position.set(-1.1, 0.2, 1.3);
  crateD.rotation.y = 0.25;
  g.add(crateD);
  for (let i = 0; i < 3; i++) {
    const squash = ball(0.15, 0xe0a13a, 0.8, 6);
    squash.position.set(-1.25 + i * 0.2, 0.46, 1.28 + (i % 2) * 0.14);
    g.add(squash);
  }
  // dangling scale hook under the awning
  const hookRope = cyl(0.025, 0.025, 0.5, 0xc9b17e, 4);
  hookRope.position.set(1.1, 1.85, 0.9);
  g.add(hookRope);
  const scalePan = cyl(0.16, 0.12, 0.07, IRON, 7);
  scalePan.position.set(1.1, 1.57, 0.9);
  g.add(scalePan);
  return g;
}

// 🚪 Farm Gate — freestanding arch: posts, curved beam, name board, gate ajar
function farmGate() {
  const g = new THREE.Group();
  const SPAN = 2.2, H = 2.1;
  // two stout posts on stone footings
  for (const s of [-1, 1]) {
    const footing = cyl(0.24, 0.3, 0.22, P.stone, 7);
    footing.position.set(s * SPAN / 2, 0.11, 0);
    g.add(footing);
    const post = box(0.22, H, 0.22, P.woodDark);
    post.position.set(s * SPAN / 2, H / 2 + 0.1, 0);
    g.add(post);
    const cap = box(0.3, 0.09, 0.3, P.wood);
    cap.position.set(s * SPAN / 2, H + 0.16, 0);
    g.add(cap);
  }
  // curved top beam from three angled segments
  const beamMid = box(1.15, 0.16, 0.18, P.wood);
  beamMid.position.y = H + 0.48;
  g.add(beamMid);
  for (const s of [-1, 1]) {
    const beamEnd = box(0.75, 0.15, 0.18, P.wood);
    beamEnd.position.set(s * 0.82, H + 0.36, 0);
    beamEnd.rotation.z = s * 0.42;
    g.add(beamEnd);
  }
  // small name board hanging from the beam on two ropes
  for (const s of [-1, 1]) {
    const rope = cyl(0.025, 0.025, 0.3, 0xc9b17e, 4);
    rope.position.set(s * 0.4, H + 0.25, 0);
    g.add(rope);
  }
  const board = box(1.1, 0.34, 0.07, P.woodLight);
  board.position.y = H - 0.05;
  g.add(board);
  const lettering = box(0.7, 0.08, 0.03, P.woodDark);
  lettering.position.set(0, H - 0.03, 0.05);
  g.add(lettering);
  // swing gate leaf, ajar off the left post
  const gate = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const rail = box(1.5, 0.1, 0.08, P.woodLight);
    rail.position.set(0.75, 0.35 + i * 0.42, 0);
    gate.add(rail);
  }
  for (let i = 0; i < 3; i++) {
    const picket = box(0.09, 1.1, 0.09, P.wood);
    picket.position.set(0.2 + i * 0.55, 0.72, 0);
    gate.add(picket);
  }
  const diag = box(1.45, 0.09, 0.07, P.woodDark);
  diag.position.set(0.75, 0.72, 0.02);
  diag.rotation.z = 0.55;
  gate.add(diag);
  gate.position.set(-SPAN / 2 + 0.11, 0.1, 0.08);
  gate.rotation.y = -0.55; // swung ajar
  g.add(gate);
  // hinges on the post
  for (const y of [0.55, 1.35]) {
    const hinge = box(0.09, 0.09, 0.3, IRON);
    hinge.position.set(-SPAN / 2, y, 0.06);
    g.add(hinge);
  }
  return g;
}

// 🌿 Hedgerow — irregular green mounds dotted with berries, gap with a stile
function hedgerow() {
  const g = new THREE.Group();
  const L = 4.4;
  // two hedge runs with a walk-through gap between them
  const mounds = [
    // [x, z, r, squash, color] — left run
    [-1.9, 0.05, 0.62, 0.85, P.leafDark],
    [-1.35, -0.12, 0.55, 0.9, P.leaf],
    [-0.85, 0.1, 0.5, 0.8, P.leafLight],
    [-1.55, 0.15, 0.4, 0.9, P.leaf],
    // right run
    [0.85, -0.05, 0.52, 0.85, P.leaf],
    [1.4, 0.1, 0.6, 0.9, P.leafDark],
    [1.95, -0.08, 0.55, 0.82, P.leaf],
    [1.15, 0.12, 0.38, 0.95, P.leafLight],
  ];
  for (const [mx, mz, r, sq, col] of mounds) {
    const bush = ball(r, col, sq, 7);
    bush.position.set(mx, r * sq * 0.8, mz);
    g.add(bush);
  }
  // taller wild sprigs poking out of the run
  for (const [sx, sh] of [[-1.6, 1.35], [1.55, 1.5], [-1.0, 1.15]]) {
    const sprig = cone(0.2, 0.55, P.leafDark, 5);
    sprig.position.set(sx, sh - 0.25, 0);
    g.add(sprig);
  }
  // berries dotted red across the mounds
  const berrySpots = [
    [-2.05, 0.75, 0.35], [-1.5, 0.9, -0.25], [-0.95, 0.62, 0.4],
    [-1.25, 0.55, -0.35], [1.0, 0.7, 0.3], [1.5, 0.95, -0.3],
    [1.85, 0.6, 0.35], [1.25, 0.5, 0.4], [2.1, 0.4, -0.25],
  ];
  for (const [bx, by, bz] of berrySpots) {
    const berry = ball(0.06, 0xd8433a, 1, 4);
    berry.position.set(bx, by, bz);
    g.add(berry);
  }
  // scrubby trunk stubs visible under the gap edges
  for (const s of [-1, 1]) {
    const stub = cyl(0.07, 0.1, 0.4, P.woodDark, 5);
    stub.position.set(s * 0.55, 0.2, 0);
    stub.rotation.z = s * 0.25;
    g.add(stub);
  }
  // fence stile spanning the gap: two steps over a low rail
  const rail = box(1.15, 0.09, 0.09, P.wood);
  rail.position.set(0, 0.62, 0);
  g.add(rail);
  for (const s of [-1, 1]) {
    const railPost = box(0.1, 0.7, 0.1, P.woodDark);
    railPost.position.set(s * 0.52, 0.35, 0);
    g.add(railPost);
  }
  for (const s of [-1, 1]) {
    const step = box(0.55, 0.07, 0.3, P.woodLight);
    step.position.set(0, 0.32, s * 0.32);
    g.add(step);
    const stepLeg = box(0.08, 0.3, 0.08, P.woodDark);
    stepLeg.position.set(-0.18 * s, 0.15, s * 0.32);
    g.add(stepLeg);
  }
  // grass tufts at the hedge feet
  for (let i = 0; i < 4; i++) {
    const tuft = cone(0.1, 0.24, P.leafLight, 5);
    tuft.position.set(-L / 2 + 0.4 + i * 1.25, 0.12, (i % 2 ? 0.55 : -0.5));
    g.add(tuft);
  }
  return g;
}

export const INFRA_MODELS_E = {
  liv_feedtrough: feedingTrough,
  liv_hayrack: hayRack,
  liv_duckhouse: duckHouse,
  liv_manurepit: manurePit,
  wkr_outhouse: outhouse,
  wkr_worker_cabin: workerCabin,
  com_roadside_stand: roadsideStand,
  com_produce_stall: produceStall,
  prot_farm_gate: farmGate,
  eco_hedgerow: hedgerow,
};
