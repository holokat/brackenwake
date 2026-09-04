// Hand-built models, batch F — forestry, aquaculture, and field-edge kit.
// Same flat-shaded low-poly language as assets.js: P palette, chunky
// silhouettes, warm trims. Base at y=0, centered, nothing floating.

import * as THREE from 'three';
import { P, mat, box, cyl, cone, ball } from './assets.js';

const IRON = 0x4e5257;
const WATER = 0x4fa8d8;

// 🪵 Wood Pile — neat stack of cut rounds between stakes, axe in a block
function woodPile() {
  const g = new THREE.Group();
  // two upright stakes bracketing the stack
  for (const sx of [-0.85, 0.85]) {
    const stake = cyl(0.07, 0.09, 1.15, P.woodDark, 5);
    stake.position.set(sx, 0.57, 0);
    g.add(stake);
  }
  // stacked log rounds, axis along x, pyramid courses
  const rows = [[4, 0.19], [3, 0.52], [2, 0.85]];
  rows.forEach(([n, y], r) => {
    for (let i = 0; i < n; i++) {
      const z = (i - (n - 1) / 2) * 0.36;
      const log = cyl(0.17, 0.17, 1.35, r % 2 ? 0x8a6a44 : P.wood, 7);
      log.position.set(0, y, z);
      log.rotation.z = Math.PI / 2;
      g.add(log);
      const end = cyl(0.12, 0.12, 1.4, P.woodLight, 7);
      end.position.set(0, y, z);
      end.rotation.z = Math.PI / 2;
      g.add(end);
    }
  });
  // chopping block beside, with a buried axe
  const block = cyl(0.32, 0.36, 0.55, P.woodDark, 8);
  block.position.set(1.35, 0.27, 0.55);
  g.add(block);
  const blockTop = cyl(0.27, 0.27, 0.05, P.woodLight, 8);
  blockTop.position.set(1.35, 0.57, 0.55);
  g.add(blockTop);
  const axeHandle = cyl(0.04, 0.05, 0.85, P.woodLight, 5);
  axeHandle.position.set(1.55, 0.95, 0.7);
  axeHandle.rotation.z = -0.55;
  axeHandle.rotation.x = 0.15;
  g.add(axeHandle);
  const axeHead = box(0.3, 0.16, 0.07, IRON);
  axeHead.position.set(1.35, 0.68, 0.58);
  axeHead.rotation.z = -0.35;
  g.add(axeHead);
  // a stray split piece on the ground
  const chip = box(0.32, 0.12, 0.14, P.woodLight);
  chip.position.set(-1.2, 0.06, 0.6);
  chip.rotation.y = 0.5;
  g.add(chip);
  return g;
}

// 🪓 Logging Camp — stumps, felled log, two-man saw on a rack, sawdust
function loggingCamp() {
  const g = new THREE.Group();
  // chopping stumps
  for (const [x, z, r] of [[-1.7, 1.0, 0.42], [-0.4, 1.5, 0.34]]) {
    const stump = cyl(r, r * 1.15, 0.6, P.woodDark, 8);
    stump.position.set(x, 0.3, z);
    g.add(stump);
    const face = cyl(r * 0.82, r * 0.82, 0.05, P.woodLight, 8);
    face.position.set(x, 0.63, z);
    g.add(face);
  }
  // felled log with bark ridges, lying across the yard
  const felled = cyl(0.34, 0.38, 3.4, 0x6b4423, 8);
  felled.position.set(0.4, 0.36, -1.1);
  felled.rotation.z = Math.PI / 2;
  felled.rotation.y = 0.25;
  g.add(felled);
  for (const t of [-1.1, 0, 1.1]) {
    const bark = cyl(0.4, 0.4, 0.22, 0x5a3a1e, 8);
    bark.position.set(0.4 + Math.cos(0.25) * t, 0.36, -1.1 - Math.sin(0.25) * t);
    bark.rotation.z = Math.PI / 2;
    bark.rotation.y = 0.25;
    g.add(bark);
  }
  const cut = cyl(0.3, 0.3, 0.06, P.woodLight, 8);
  cut.position.set(0.4 + Math.cos(0.25) * 1.72, 0.36, -1.1 - Math.sin(0.25) * 1.72);
  cut.rotation.z = Math.PI / 2;
  cut.rotation.y = 0.25;
  g.add(cut);
  // saw rack: two crossed-leg trestles and the big two-man saw leaning
  for (const x of [1.5, 2.5]) {
    for (const r of [0.45, -0.45]) {
      const leg = cyl(0.06, 0.07, 1.1, P.woodDark, 5);
      leg.position.set(x, 0.5, 0.9);
      leg.rotation.x = r;
      g.add(leg);
    }
  }
  const rail = cyl(0.06, 0.06, 1.6, P.wood, 5);
  rail.position.set(2.0, 0.95, 0.9);
  rail.rotation.z = Math.PI / 2;
  g.add(rail);
  const blade = box(1.9, 0.22, 0.03, 0xb9b4a8);
  blade.position.set(2.0, 0.85, 1.0);
  blade.rotation.z = 0.12;
  blade.rotation.x = -0.3;
  g.add(blade);
  for (let i = 0; i < 6; i++) {
    const tooth = cone(0.045, 0.09, 0x9aa0a4, 4);
    tooth.position.set(1.25 + i * 0.3, 0.7 + i * 0.036, 1.05);
    tooth.rotation.x = Math.PI;
    g.add(tooth);
  }
  for (const s of [-1, 1]) {
    const grip = cyl(0.05, 0.05, 0.3, P.woodDark, 5);
    grip.position.set(2.0 + s * 1.0, 0.85 + s * 0.12, 1.0);
    g.add(grip);
  }
  // log pile at the back
  const pileRows = [[3, 0.24], [2, 0.63]];
  pileRows.forEach(([n, y]) => {
    for (let i = 0; i < n; i++) {
      const log = cyl(0.22, 0.22, 1.9, i % 2 ? P.wood : 0x8a6a44, 7);
      log.position.set(-1.7, y, -0.7 + (i - (n - 1) / 2) * 0.46);
      log.rotation.z = Math.PI / 2;
      g.add(log);
    }
  });
  // sawdust drifts
  for (const [x, z, r] of [[-1.0, 1.3, 0.5], [0.6, 0.4, 0.38], [2.0, 0.3, 0.3]]) {
    const dust = ball(r, 0xd9c48e, 0.28, 7);
    dust.position.set(x, 0.08, z);
    g.add(dust);
  }
  // an upright axe waiting in the near stump
  const axeH = cyl(0.045, 0.05, 0.9, P.woodLight, 5);
  axeH.position.set(-1.55, 1.0, 1.15);
  axeH.rotation.z = -0.4;
  g.add(axeH);
  const axeB = box(0.3, 0.16, 0.07, IRON);
  axeB.position.set(-1.72, 0.72, 1.05);
  axeB.rotation.z = -0.3;
  g.add(axeB);
  return g;
}

// 🍯 Resin Collector — tapped pine trunk, cups catching amber drips
function resinCollector() {
  const g = new THREE.Group();
  const trunk = cyl(0.3, 0.4, 1.9, 0x6b4423, 8);
  trunk.position.y = 0.95;
  g.add(trunk);
  const topCut = cyl(0.28, 0.3, 0.07, P.woodLight, 8);
  topCut.position.y = 1.9;
  g.add(topCut);
  // a tuft of pine left on top
  const tuft = cone(0.42, 0.7, P.leafDark, 7);
  tuft.position.y = 2.25;
  g.add(tuft);
  // bark scoring above each tap (pale herringbone patch)
  const taps = [[0.4, 1.15, 0], [-0.15, 0.95, 0.38], [-0.28, 1.3, -0.28]];
  taps.forEach(([x, y, z], i) => {
    const a = Math.atan2(x, z);
    const patch = box(0.22, 0.34, 0.05, 0xd8b78a);
    patch.position.set(x * 0.92, y + 0.3, z * 0.92);
    patch.rotation.y = a;
    g.add(patch);
    // spout
    const spout = cyl(0.035, 0.045, 0.28, IRON, 5);
    spout.position.set(x * 1.15, y, z * 1.15);
    spout.rotation.z = Math.PI / 2;
    spout.rotation.y = a + Math.PI / 2;
    g.add(spout);
    // hanging cup
    const cup = cyl(0.11, 0.08, 0.18, i % 2 ? P.wood : 0x8a6a44, 7);
    cup.position.set(x * 1.35, y - 0.2, z * 1.35);
    g.add(cup);
    const resin = cyl(0.085, 0.085, 0.04, 0xe8952e, 7);
    resin.position.set(x * 1.35, y - 0.12, z * 1.35);
    g.add(resin);
    // amber drip between spout and cup
    const drip = ball(0.045, 0xf2a63a, 1.5, 5);
    drip.position.set(x * 1.3, y - 0.05, z * 1.3);
    g.add(drip);
  });
  // a slow run of resin down the bark
  const run = ball(0.06, 0xe8952e, 2.2, 5);
  run.position.set(0.36, 0.85, 0.14);
  g.add(run);
  // ground roots flare
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const root = ball(0.16, 0x5a3a1e, 0.55, 5);
    root.position.set(Math.cos(a) * 0.38, 0.07, Math.sin(a) * 0.38);
    g.add(root);
  }
  return g;
}

// 🥤 Sap Collector — maple trunk with two hung buckets, a lid leaning
function sapCollector() {
  const g = new THREE.Group();
  const trunk = cyl(0.34, 0.46, 2.0, 0x7a5236, 8);
  trunk.position.y = 1.0;
  g.add(trunk);
  const topCut = cyl(0.32, 0.34, 0.07, P.woodLight, 8);
  topCut.position.y = 2.0;
  g.add(topCut);
  // a couple of stub branches
  for (const [y, ay, rz] of [[1.55, 0.6, 0.9], [1.75, 2.6, 1.1]]) {
    const stub = cyl(0.06, 0.09, 0.5, 0x6b4423, 5);
    stub.position.set(Math.cos(ay) * 0.45, y, Math.sin(ay) * 0.45);
    stub.rotation.z = rz;
    stub.rotation.y = -ay;
    g.add(stub);
  }
  // two taps with metal buckets hanging
  const taps = [[1.1, 0.5], [1.3, -1.1]];
  taps.forEach(([y, a]) => {
    const x = Math.sin(a), z = Math.cos(a);
    const spile = cyl(0.035, 0.045, 0.3, IRON, 5);
    spile.position.set(x * 0.48, y, z * 0.48);
    spile.rotation.z = Math.PI / 2;
    spile.rotation.y = a + Math.PI / 2;
    g.add(spile);
    const hook = cyl(0.02, 0.02, 0.16, IRON, 4);
    hook.position.set(x * 0.58, y - 0.09, z * 0.58);
    g.add(hook);
    const bucket = cyl(0.16, 0.13, 0.34, 0xb9b4a8, 8);
    bucket.position.set(x * 0.62, y - 0.34, z * 0.62);
    g.add(bucket);
    const rim = cyl(0.17, 0.17, 0.04, 0x9aa0a4, 8);
    rim.position.set(x * 0.62, y - 0.18, z * 0.62);
    g.add(rim);
    const sap = cyl(0.13, 0.13, 0.03, 0xf2e8c8, 8);
    sap.position.set(x * 0.62, y - 0.22, z * 0.62);
    g.add(sap);
    const drop = ball(0.04, 0xf2e8c8, 1.4, 4);
    drop.position.set(x * 0.66, y - 0.06, z * 0.66);
    g.add(drop);
  });
  // spare lid leaning at the base
  const lid = cyl(0.19, 0.19, 0.04, 0xb9b4a8, 8);
  lid.position.set(0.62, 0.2, -0.35);
  lid.rotation.x = Math.PI / 2 - 0.5;
  g.add(lid);
  const knobL = ball(0.04, 0x9aa0a4, 1, 4);
  knobL.position.set(0.62, 0.22, -0.32);
  g.add(knobL);
  // roots
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const root = ball(0.18, 0x6b4423, 0.5, 5);
    root.position.set(Math.cos(a) * 0.44, 0.07, Math.sin(a) * 0.44);
    g.add(root);
  }
  return g;
}

// 🪤 Fish Trap — woven basket funnel on a rope coil, fish tail poking out
function fishTrap() {
  const g = new THREE.Group();
  // trap lies on its side, axis along x; banded tapering body
  const bands = [
    [0.42, 0.4, 0.3, P.wood],
    [0.4, 0.36, 0.3, 0x8a6a44],
    [0.36, 0.3, 0.3, P.wood],
    [0.3, 0.22, 0.3, 0x8a6a44],
    [0.22, 0.13, 0.28, P.wood],
  ];
  let x = -0.72;
  bands.forEach(([r1, r2, len, col]) => {
    const seg = cyl(r2, r1, len, col, 9);
    seg.position.set(x + len / 2, 0.42, 0);
    seg.rotation.z = -Math.PI / 2;
    g.add(seg);
    x += len;
  });
  // funnel mouth ring and inward cone
  const mouth = cyl(0.44, 0.44, 0.08, P.woodDark, 9);
  mouth.position.set(-0.74, 0.42, 0);
  mouth.rotation.z = Math.PI / 2;
  g.add(mouth);
  const throat = cone(0.34, 0.4, 0x54381f, 9);
  throat.position.set(-0.58, 0.42, 0);
  throat.rotation.z = -Math.PI / 2;
  g.add(throat);
  // long withies running the length
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const withy = cyl(0.025, 0.025, 1.42, P.woodLight, 4);
    withy.position.set(-0.02, 0.42 + Math.sin(a) * 0.3, Math.cos(a) * 0.3);
    withy.rotation.z = Math.PI / 2;
    withy.rotation.y = 0.12;
    g.add(withy);
  }
  // fish tail poking from the small end
  const tailBody = ball(0.09, 0x7fa8b8, 0.8, 6);
  tailBody.position.set(0.78, 0.42, 0.02);
  g.add(tailBody);
  for (const s of [-1, 1]) {
    const fin = cone(0.09, 0.2, 0x6a94a5, 4);
    fin.position.set(0.92, 0.42 + s * 0.07, 0.02);
    fin.rotation.z = -Math.PI / 2 + s * 0.5;
    g.add(fin);
  }
  // rope coil the trap rests against
  for (let i = 0; i < 3; i++) {
    const loop = cyl(0.3 - i * 0.03, 0.3 - i * 0.03, 0.06, 0xc9b17e, 9);
    loop.position.set(0.55, 0.03 + i * 0.055, 0.62);
    g.add(loop);
  }
  const ropeEnd = cyl(0.03, 0.03, 0.5, 0xc9b17e, 4);
  ropeEnd.position.set(0.2, 0.05, 0.5);
  ropeEnd.rotation.z = Math.PI / 2;
  ropeEnd.rotation.y = 0.5;
  g.add(ropeEnd);
  // a stray pebble
  const peb = ball(0.09, P.stone, 0.7, 5);
  peb.position.set(-0.85, 0.07, 0.5);
  g.add(peb);
  return g;
}

// 🎣 Fishing Pier — plank pier on posts over water, rod set and waiting
function fishingPier() {
  const g = new THREE.Group();
  // blue water patch beneath
  const water = box(3.4, 0.08, 2.4, WATER);
  water.position.y = 0.04;
  g.add(water);
  const shore = box(1.0, 0.14, 2.4, 0xb59a6b);
  shore.position.set(-1.55, 0.07, 0);
  g.add(shore);
  // posts
  for (const [x, z] of [[-0.9, -0.45], [-0.9, 0.45], [0.1, -0.45], [0.1, 0.45], [1.05, -0.45], [1.05, 0.45]]) {
    const post = cyl(0.08, 0.1, 0.85, P.woodDark, 6);
    post.position.set(x, 0.42, z);
    g.add(post);
  }
  // deck planks
  for (let i = 0; i < 6; i++) {
    const plank = box(0.42, 0.08, 1.15, i % 2 ? P.wood : P.woodLight);
    plank.position.set(-1.1 + i * 0.46, 0.86, 0);
    g.add(plank);
  }
  // end cap board
  const cap = box(0.1, 0.12, 1.2, P.woodDark);
  cap.position.set(1.28, 0.88, 0);
  g.add(cap);
  // rod holder: forked stick with rod angled over the water
  const fork = cyl(0.04, 0.05, 0.5, P.woodDark, 5);
  fork.position.set(0.85, 1.1, -0.35);
  g.add(fork);
  for (const s of [-1, 1]) {
    const prong = cyl(0.025, 0.025, 0.18, P.woodDark, 4);
    prong.position.set(0.85, 1.38, -0.35 + s * 0.04);
    prong.rotation.x = s * 0.5;
    g.add(prong);
  }
  const rod = cyl(0.025, 0.035, 1.7, P.woodLight, 5);
  rod.position.set(1.35, 1.5, -0.35);
  rod.rotation.z = -1.0;
  g.add(rod);
  const line = cyl(0.008, 0.008, 0.95, 0xe8e0cc, 3);
  line.position.set(2.05, 0.75, -0.35);
  g.add(line);
  const bobber = ball(0.06, 0xd8433a, 1, 5);
  bobber.position.set(2.05, 0.14, -0.35);
  g.add(bobber);
  // bait bucket on the deck
  const bucket = cyl(0.17, 0.14, 0.3, IRON, 8);
  bucket.position.set(0.35, 1.05, 0.35);
  g.add(bucket);
  const bait = cyl(0.14, 0.14, 0.04, 0x6b4a2e, 8);
  bait.position.set(0.35, 1.19, 0.35);
  g.add(bait);
  const worm = ball(0.035, 0xc98a7a, 1.6, 4);
  worm.position.set(0.4, 1.23, 0.32);
  g.add(worm);
  // ripples around the far posts
  for (const [x, z] of [[1.05, -0.45], [1.05, 0.45]]) {
    const ripple = cyl(0.16, 0.16, 0.02, 0x8fd0ea, 8);
    ripple.position.set(x, 0.09, z);
    g.add(ripple);
  }
  return g;
}

// 🕸️ Net Station — drying net draped on a frame, floats along the edge
function netStation() {
  const g = new THREE.Group();
  const W = 2.9, H = 1.9;
  // frame: two posts and a top beam, plus angled brace legs
  for (const s of [-1, 1]) {
    const post = cyl(0.09, 0.12, H, P.woodDark, 6);
    post.position.set(s * W / 2, H / 2, 0);
    g.add(post);
    const brace = cyl(0.06, 0.07, 1.0, P.wood, 5);
    brace.position.set(s * W / 2, 0.42, -0.38);
    brace.rotation.x = 0.75;
    g.add(brace);
    const tip = ball(0.1, P.woodLight, 1, 5);
    tip.position.set(s * W / 2, H, 0);
    g.add(tip);
  }
  const beam = cyl(0.07, 0.07, W + 0.5, P.wood, 6);
  beam.position.y = H - 0.05;
  beam.rotation.z = Math.PI / 2;
  g.add(beam);
  // draped net: semi-transparent plane hanging with a gentle belly
  const netMat = new THREE.MeshStandardMaterial({
    color: 0xe8dfc8, roughness: 0.9, flatShading: true, transparent: true, opacity: 0.38, side: THREE.DoubleSide,
  });
  const drape = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.3, H - 0.55, 6, 5), netMat);
  const dp = drape.geometry.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < dp.count; i++) {
    v.fromBufferAttribute(dp, i);
    const hang = (v.y + (H - 0.55) / 2) / (H - 0.55); // 1 at top, 0 at hem
    const belly = (1 - Math.abs(v.x) / ((W - 0.3) / 2)) * (1 - hang);
    dp.setZ(i, belly * 0.3);
  }
  drape.geometry.computeVertexNormals();
  drape.position.y = H - 0.1 - (H - 0.55) / 2;
  g.add(drape);
  // cross strands over the net face
  for (let i = 0; i < 4; i++) {
    const strand = box(W - 0.25, 0.025, 0.025, 0xd8ccae);
    strand.position.set(0, 0.55 + i * 0.34, 0.06);
    g.add(strand);
  }
  for (let i = 0; i < 5; i++) {
    const strand = box(0.025, H - 0.55, 0.025, 0xd8ccae);
    strand.position.set(-W / 2 + 0.35 + i * ((W - 0.7) / 4), H / 2 - 0.06, 0.06);
    g.add(strand);
  }
  // cork floats strung along the hem
  const floatCols = [0xd8433a, 0xe8952e, 0xf2e8c8, 0xd8433a, 0xe8952e];
  for (let i = 0; i < 5; i++) {
    const f = ball(0.09, floatCols[i], 0.85, 6);
    f.position.set(-W / 2 + 0.45 + i * ((W - 0.9) / 4), 0.42, 0.14);
    g.add(f);
  }
  // spare float pile and a rope coil at the foot
  for (let i = 0; i < 3; i++) {
    const loop = cyl(0.22 - i * 0.02, 0.22 - i * 0.02, 0.05, 0xc9b17e, 8);
    loop.position.set(1.05, 0.03 + i * 0.05, 0.6);
    g.add(loop);
  }
  const spare = ball(0.1, 0x4f7ab8, 0.85, 6);
  spare.position.set(-1.1, 0.09, 0.55);
  g.add(spare);
  const spare2 = ball(0.08, 0xd8433a, 0.85, 6);
  spare2.position.set(-0.88, 0.08, 0.68);
  g.add(spare2);
  return g;
}

// 🔱 Plow — single-furrow walking plow over a strip of turned earth
function plow() {
  const g = new THREE.Group();
  // furrow of turned earth beneath
  const furrow = box(2.9, 0.16, 0.55, 0x54381f);
  furrow.position.y = 0.08;
  g.add(furrow);
  for (let i = 0; i < 5; i++) {
    const clod = ball(0.12 + (i % 2) * 0.04, 0x6b4a2e, 0.7, 5);
    clod.position.set(-1.2 + i * 0.6, 0.18, (i % 2 ? 0.28 : -0.26));
    g.add(clod);
  }
  // main wooden beam sloping up toward the handles
  const beam = box(2.3, 0.13, 0.13, P.wood);
  beam.position.set(-0.1, 0.78, 0);
  beam.rotation.z = 0.22;
  g.add(beam);
  // curved iron share built from three angled slabs
  const share = box(0.55, 0.34, 0.09, IRON);
  share.position.set(0.85, 0.28, 0.05);
  share.rotation.z = -0.5;
  share.rotation.y = 0.25;
  g.add(share);
  const moldboard = box(0.5, 0.34, 0.08, 0x5e646a);
  moldboard.position.set(0.55, 0.5, 0.13);
  moldboard.rotation.z = -0.15;
  moldboard.rotation.y = 0.45;
  moldboard.rotation.x = 0.25;
  g.add(moldboard);
  const point = cone(0.12, 0.3, IRON, 4);
  point.position.set(1.15, 0.14, 0);
  point.rotation.z = -Math.PI / 2;
  g.add(point);
  // coulter blade ahead of the share
  const coulter = box(0.05, 0.45, 0.16, IRON);
  coulter.position.set(0.45, 0.55, 0);
  coulter.rotation.z = 0.2;
  g.add(coulter);
  // upright strut tying share to beam
  const strut = box(0.1, 0.55, 0.1, P.woodDark);
  strut.position.set(0.7, 0.62, 0);
  g.add(strut);
  // hitch ring at the nose
  const hitch = cyl(0.09, 0.09, 0.05, IRON, 7);
  hitch.position.set(1.02, 0.98, 0);
  hitch.rotation.x = Math.PI / 2;
  g.add(hitch);
  // two long handles sweeping back
  for (const s of [-1, 1]) {
    const handle = cyl(0.045, 0.06, 1.7, P.woodLight, 5);
    handle.position.set(-1.15, 1.05, s * 0.22);
    handle.rotation.z = -0.65;
    handle.rotation.y = s * 0.08;
    g.add(handle);
    const grip = cyl(0.05, 0.05, 0.26, P.woodDark, 5);
    grip.position.set(-1.78, 1.55, s * 0.26);
    grip.rotation.z = -0.65;
    g.add(grip);
  }
  // crossbar between the handles
  const cross = cyl(0.04, 0.04, 0.5, P.woodDark, 5);
  cross.position.set(-1.35, 1.2, 0);
  cross.rotation.x = Math.PI / 2;
  g.add(cross);
  return g;
}

// 🌉 Footbridge — arched planks and rail sides over a blue stream strip
function footbridge() {
  const g = new THREE.Group();
  // stream strip beneath
  const stream = box(1.4, 0.08, 3.4, WATER);
  stream.position.y = 0.04;
  g.add(stream);
  for (const s of [-1, 1]) {
    const bank = box(0.5, 0.16, 3.4, 0x6b4a2e);
    bank.position.set(s * 0.95, 0.08, 0);
    g.add(bank);
  }
  // arched plank walkway spanning the stream (bridge runs along x)
  const N = 7;
  for (let i = 0; i < N; i++) {
    const t = (i - (N - 1) / 2) / ((N - 1) / 2); // -1..1
    const y = 0.42 + (1 - t * t) * 0.34;
    const plank = box(0.42, 0.09, 1.1, i % 2 ? P.wood : P.woodLight);
    plank.position.set(t * 1.32, y, 0);
    plank.rotation.z = -t * 0.42;
    g.add(plank);
  }
  // rail posts following the arch
  for (const sz of [-1, 1]) {
    for (const t of [-0.85, 0, 0.85]) {
      const y = 0.42 + (1 - t * t) * 0.34;
      const post = cyl(0.05, 0.06, 0.55, P.woodDark, 5);
      post.position.set(t * 1.32, y + 0.28, sz * 0.52);
      g.add(post);
    }
    // rail in two sloped halves meeting at the crown
    for (const s of [-1, 1]) {
      const rail = cyl(0.04, 0.04, 1.28, P.wood, 5);
      rail.position.set(s * 0.58, 0.98, sz * 0.52);
      rail.rotation.z = Math.PI / 2 + s * 0.28;
      g.add(rail);
    }
    const knob1 = ball(0.06, P.woodLight, 1, 5);
    knob1.position.set(-1.12, 0.85, sz * 0.52);
    g.add(knob1);
    const knob2 = ball(0.06, P.woodLight, 1, 5);
    knob2.position.set(1.12, 0.85, sz * 0.52);
    g.add(knob2);
  }
  // footing stones at each end
  for (const s of [-1, 1]) {
    const foot = box(0.5, 0.3, 1.2, P.stone);
    foot.position.set(s * 1.6, 0.15, 0);
    g.add(foot);
  }
  // ripple where the water passes under
  const ripple = cyl(0.2, 0.2, 0.02, 0x8fd0ea, 8);
  ripple.position.set(0.15, 0.09, 0.9);
  g.add(ripple);
  const reed = cyl(0.025, 0.03, 0.55, P.stem, 4);
  reed.position.set(-0.55, 0.3, -1.35);
  g.add(reed);
  const reedTip = ball(0.05, 0x8a6a44, 1.6, 4);
  reedTip.position.set(-0.55, 0.6, -1.35);
  g.add(reedTip);
  return g;
}

// 🌲 Windbreak — a line of varied conifers on a low earth berm
function windbreak() {
  const g = new THREE.Group();
  const L = 7.6;
  // low earth berm
  const berm = box(L, 0.35, 1.7, 0x6b4a2e);
  berm.position.y = 0.17;
  g.add(berm);
  const bermTop = box(L - 0.3, 0.14, 1.3, 0x7d583a);
  bermTop.position.y = 0.4;
  g.add(bermTop);
  // five conifers, varied heights and greens
  const trees = [
    [-3.0, 2.6, 3, P.leafDark, 0.15],
    [-1.5, 3.4, 4, P.leaf, -0.2],
    [0.1, 2.9, 3, 0x3c7a3a, 0.25],
    [1.6, 3.7, 4, P.leafDark, -0.1],
    [3.1, 2.4, 3, P.leaf, 0.2],
  ];
  trees.forEach(([x, h, tiers, col, zoff]) => {
    const z = zoff;
    const trunk = cyl(0.1, 0.16, h * 0.3, 0x6b4423, 6);
    trunk.position.set(x, 0.4 + h * 0.15, z);
    g.add(trunk);
    for (let t = 0; t < tiers; t++) {
      const f = 1 - t / tiers;
      const r = 0.55 + f * 0.55;
      const tier = cone(r, h * 0.34, t % 2 ? col : P.leafDark, 7);
      tier.position.set(x, 0.4 + h * 0.28 + t * h * 0.2, z);
      g.add(tier);
    }
    const tip = cone(0.16, 0.35, col, 5);
    tip.position.set(x, 0.4 + h * 0.28 + tiers * h * 0.2 + 0.05, z);
    g.add(tip);
  });
  // scattered rocks and a sapling filling the gap
  for (const [x, z, r] of [[-2.2, 0.6, 0.14], [0.9, -0.55, 0.18], [2.4, 0.5, 0.12]]) {
    const rock = ball(r, P.stone, 0.7, 5);
    rock.position.set(x, 0.44, z);
    g.add(rock);
  }
  const sapling = cone(0.3, 0.8, P.leafLight, 6);
  sapling.position.set(-0.7, 0.85, -0.45);
  g.add(sapling);
  const sapTrunk = cyl(0.04, 0.05, 0.25, 0x6b4423, 5);
  sapTrunk.position.set(-0.7, 0.55, -0.45);
  g.add(sapTrunk);
  return g;
}

export const INFRA_MODELS_F = {
  for_wood_pile: woodPile,
  for_logging_camp: loggingCamp,
  for_resin_collector: resinCollector,
  for_sap_collector: sapCollector,
  aqua_fish_trap: fishTrap,
  aqua_fishing_pier: fishingPier,
  aqua_net_station: netStation,
  mac_plow: plow,
  eco_footbridge: footbridge,
  fld_windbreak: windbreak,
};
