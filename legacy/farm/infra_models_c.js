// Hand-built models, batch C — protection barriers, soil-care stations, and
// the gravel road. Same flat-shaded low-poly language as infra_models.js:
// P palette, chunky silhouettes, warm trims.

import * as THREE from 'three';
import { P, mat, box, cyl, cone, ball } from './assets.js';

const IRON = 0x4e5257;
const WATER = 0x4fa8d8;
const GRAVEL = 0x8d8578;
const GRAVEL_LIGHT = 0xa39a8b;
const SAND = 0xdcc389;
const SNOW = 0xeef3f6;
const COMPOST = 0x3f2d1a;
const MULCH = 0x8a4a2c;
const LIME = 0xf2f0e8;
const BURLAP = 0xc9a25e;

// 🌳 Hedge — a neat trimmed rectangular hedge run on stubby trunk feet
function hedge() {
  const g = new THREE.Group();
  const L = 2.1, H = 1.0;
  // stubby trunk feet peeking out under the foliage
  for (let i = 0; i < 4; i++) {
    const foot = cyl(0.07, 0.1, 0.3, P.woodDark, 5);
    foot.position.set(-L / 2 + 0.35 + i * ((L - 0.7) / 3), 0.15, (i % 2 ? 0.1 : -0.08));
    g.add(foot);
  }
  // merged green blocks forming the trimmed body
  const blockCols = [P.leafDark, P.leaf, P.leafDark, P.leaf];
  for (let i = 0; i < 4; i++) {
    const block = box(0.66, H - 0.25, 0.72, blockCols[i]);
    block.position.set(-L / 2 + 0.32 + i * ((L - 0.64) / 3), 0.55, 0);
    g.add(block);
  }
  // clipped flat top
  const top = box(L, 0.2, 0.66, P.leaf);
  top.position.y = H - 0.05;
  g.add(top);
  // soft tufts where the shears missed
  for (let i = 0; i < 5; i++) {
    const tuft = ball(0.14 + (i % 2) * 0.04, i % 2 ? P.leafLight : P.leaf, 0.75, 5);
    tuft.position.set(-L / 2 + 0.2 + i * ((L - 0.4) / 4), H + 0.05, (i % 2 ? 0.2 : -0.2));
    g.add(tuft);
  }
  // a couple of side sprigs
  for (const s of [-1, 1]) {
    const sprig = ball(0.12, P.leafLight, 0.8, 5);
    sprig.position.set(s * (L / 2 - 0.05), 0.6, s * 0.28);
    g.add(sprig);
  }
  return g;
}

// 🧱 Stone Wall — dry-stacked fieldstone segment, capstones on top
function stoneWall() {
  const g = new THREE.Group();
  const L = 3.2;
  const courseCols = [P.stone, 0x8a8177, 0xa39a8b];
  // three courses of irregular stones
  for (let c = 0; c < 3; c++) {
    const n = 7 - c;
    const y = 0.22 + c * 0.36;
    for (let i = 0; i < n; i++) {
      const x = -L / 2 + 0.3 + i * ((L - 0.6) / (n - 1)) + (c % 2 ? 0.12 : 0);
      const rock = ball(0.26 + ((i + c) % 3) * 0.05, courseCols[(i + c) % 3], 0.72, 6);
      rock.position.set(x, y, ((i + c) % 2 ? 0.07 : -0.07));
      rock.scale.x = 1.25;
      g.add(rock);
    }
  }
  // squared fill stones plugging the gaps
  for (let i = 0; i < 4; i++) {
    const fill = box(0.34, 0.24, 0.3, 0x8a8177);
    fill.position.set(-L / 2 + 0.55 + i * ((L - 1.1) / 3), 0.52, (i % 2 ? -0.12 : 0.12));
    fill.rotation.y = 0.2 + i * 0.15;
    g.add(fill);
  }
  // flat capstones laid along the top
  for (let i = 0; i < 5; i++) {
    const cap = box(0.6, 0.14, 0.55, i % 2 ? P.stone : 0xa39a8b);
    cap.position.set(-L / 2 + 0.35 + i * ((L - 0.7) / 4), 1.12, 0);
    cap.rotation.y = (i % 2 ? -1 : 1) * 0.08;
    g.add(cap);
  }
  // tumbled stones at the foot
  for (const [x, z] of [[-L / 2 + 0.2, 0.42], [L / 2 - 0.3, -0.4], [0.4, 0.45]]) {
    const stray = ball(0.13, P.stone, 0.7, 5);
    stray.position.set(x, 0.1, z);
    g.add(stray);
  }
  return g;
}

// 💧 Drainage Ditch — gravel-bedded trench with a trickle and a culvert pipe
function drainageDitch() {
  const g = new THREE.Group();
  const L = 3.4;
  // banked earth on either side
  for (const s of [-1, 1]) {
    const bank = box(L, 0.3, 0.45, 0x6b4a2e);
    bank.position.set(0, 0.15, s * 0.58);
    g.add(bank);
    const bankTop = box(L, 0.1, 0.3, 0x7d583a);
    bankTop.position.set(0, 0.35, s * 0.62);
    g.add(bankTop);
  }
  // gravel bed lining the trench
  const bed = box(L, 0.08, 0.75, GRAVEL);
  bed.position.y = 0.04;
  g.add(bed);
  for (let i = 0; i < 7; i++) {
    const pebble = ball(0.07 + (i % 3) * 0.03, i % 2 ? GRAVEL_LIGHT : P.stone, 0.7, 5);
    pebble.position.set(-L / 2 + 0.3 + i * ((L - 0.6) / 6), 0.1, (i % 2 ? 0.2 : -0.18));
    g.add(pebble);
  }
  // thin trickle of water down the middle
  const trickle = box(L - 0.3, 0.05, 0.28, WATER);
  trickle.position.y = 0.1;
  g.add(trickle);
  // culvert pipe set into one end
  const pipe = cyl(0.24, 0.24, 0.7, IRON, 8);
  pipe.position.set(L / 2 - 0.3, 0.28, 0);
  pipe.rotation.z = Math.PI / 2;
  g.add(pipe);
  const pipeRim = cyl(0.28, 0.28, 0.1, 0x3a3e42, 8);
  pipeRim.position.set(L / 2 - 0.62, 0.28, 0);
  pipeRim.rotation.z = Math.PI / 2;
  g.add(pipeRim);
  const mouth = cyl(0.19, 0.19, 0.04, 0x1e2a33, 8);
  mouth.position.set(L / 2 - 0.66, 0.28, 0);
  mouth.rotation.z = Math.PI / 2;
  g.add(mouth);
  // dribble spilling out of the pipe
  const dribble = ball(0.09, WATER, 1.3, 5);
  dribble.position.set(L / 2 - 0.78, 0.16, 0);
  g.add(dribble);
  // grassy clumps on the banks
  for (let i = 0; i < 4; i++) {
    const clump = cone(0.12, 0.3, i % 2 ? P.leaf : P.leafLight, 5);
    clump.position.set(-L / 2 + 0.5 + i * 0.85, 0.5, (i % 2 ? 0.62 : -0.62));
    g.add(clump);
  }
  return g;
}

// 🏜️ Sand Barrier — woven slat fence leaning slightly, sand drifted at its base
function sandBarrier() {
  const g = new THREE.Group();
  const L = 3.0, H = 1.3, LEAN = 0.16;
  const fence = new THREE.Group();
  // posts
  for (const sx of [-L / 2, 0, L / 2]) {
    const post = cyl(0.06, 0.08, H, P.woodDark, 5);
    post.position.set(sx, H / 2, 0);
    fence.add(post);
  }
  // woven horizontal slats, alternating tones like wattle
  const slatCols = [P.woodLight, P.wood, P.woodLight, P.wood, P.woodLight];
  for (let i = 0; i < 5; i++) {
    const slat = box(L + 0.15, 0.13, 0.06, slatCols[i]);
    slat.position.set(0, 0.22 + i * 0.24, (i % 2 ? 0.05 : -0.05));
    slat.rotation.x = (i % 2 ? -1 : 1) * 0.1;
    fence.add(slat);
  }
  fence.rotation.x = LEAN;
  g.add(fence);
  // sand drifted against the windward base
  const drift = ball(0.9, SAND, 0.4, 8);
  drift.position.set(0, 0.14, 0.42);
  drift.scale.x = 1.8;
  g.add(drift);
  for (let i = 0; i < 4; i++) {
    const heap = ball(0.28 + (i % 2) * 0.08, i % 2 ? 0xe6cf98 : SAND, 0.45, 6);
    heap.position.set(-L / 2 + 0.4 + i * ((L - 0.8) / 3), 0.12, 0.55 + (i % 2) * 0.2);
    g.add(heap);
  }
  // a little sand sifted through to the lee side
  for (const [x, z] of [[-0.8, -0.35], [0.6, -0.4]]) {
    const sift = ball(0.2, SAND, 0.35, 5);
    sift.position.set(x, 0.06, z);
    g.add(sift);
  }
  return g;
}

// ❄️ Snow Fence — red-slatted fence on angled posts, drift banked behind
function snowFence() {
  const g = new THREE.Group();
  const L = 3.2, H = 1.4;
  // angled support posts
  for (const sx of [-L / 2, 0, L / 2]) {
    const post = cyl(0.07, 0.09, H + 0.25, P.woodDark, 5);
    post.position.set(sx, (H + 0.25) / 2, -0.1);
    post.rotation.x = -0.22;
    g.add(post);
    const brace = cyl(0.05, 0.06, 0.9, P.wood, 5);
    brace.position.set(sx, 0.4, -0.45);
    brace.rotation.x = 0.75;
    g.add(brace);
  }
  // top and bottom stringers
  for (const y of [0.35, H - 0.15]) {
    const rail = box(L + 0.2, 0.08, 0.06, P.woodDark);
    rail.position.set(0, y, 0.03);
    rail.rotation.x = -0.22;
    g.add(rail);
  }
  // red vertical slats with gaps
  for (let i = 0; i < 8; i++) {
    const slat = box(0.18, H - 0.35, 0.05, i % 3 === 2 ? 0xa8322a : 0xc4463a);
    slat.position.set(-L / 2 + 0.25 + i * ((L - 0.5) / 7), H / 2 + 0.05, 0.06);
    slat.rotation.x = -0.22;
    g.add(slat);
  }
  // snowdrift tapering off behind the fence
  const drift = ball(1.05, SNOW, 0.42, 8);
  drift.position.set(0, 0.16, -0.7);
  drift.scale.x = 1.7;
  g.add(drift);
  for (let i = 0; i < 3; i++) {
    const bank = ball(0.4 - i * 0.08, 0xdfe8ee, 0.4, 6);
    bank.position.set(-1.0 + i * 1.0, 0.1, -1.15 - i * 0.1);
    g.add(bank);
  }
  // stray clumps caught on the slats
  for (const [x, y] of [[-0.9, 0.42], [0.7, 0.5]]) {
    const clump = ball(0.11, SNOW, 0.6, 5);
    clump.position.set(x, y, 0.02);
    g.add(clump);
  }
  return g;
}

// 🍂 Compost Pile — steaming dark heap, scattered scraps, pitchfork stuck in
function compostPile() {
  const g = new THREE.Group();
  // the heap itself, mounded from overlapping balls
  const heap = ball(0.95, COMPOST, 0.62, 8);
  heap.position.y = 0.3;
  g.add(heap);
  const crest = ball(0.6, 0x4c3820, 0.7, 7);
  crest.position.set(-0.15, 0.62, 0.1);
  g.add(crest);
  const shoulder = ball(0.5, 0x352414, 0.6, 6);
  shoulder.position.set(0.45, 0.35, -0.3);
  g.add(shoulder);
  // scattered scraps — orange peel curls and fallen leaves
  for (const [x, z] of [[0.4, 0.55], [-0.6, 0.35], [0.1, -0.7]]) {
    const peel = ball(0.09, 0xe8912e, 0.6, 5);
    peel.position.set(x, 0.62, z);
    g.add(peel);
  }
  for (let i = 0; i < 4; i++) {
    const leaf = box(0.18, 0.03, 0.14, i % 2 ? 0xb0782e : 0x8a5a24);
    leaf.position.set(-0.55 + i * 0.38, 0.55 + (i % 2) * 0.18, 0.3 - (i % 3) * 0.3);
    leaf.rotation.y = i * 0.7;
    g.add(leaf);
  }
  // pitchfork stuck in at an angle
  const forkStick = cyl(0.04, 0.04, 1.5, P.woodLight, 5);
  forkStick.position.set(0.55, 1.1, 0.35);
  forkStick.rotation.z = -0.35;
  forkStick.rotation.x = 0.15;
  g.add(forkStick);
  const forkBar = box(0.26, 0.05, 0.05, IRON);
  forkBar.position.set(0.32, 0.62, 0.28);
  forkBar.rotation.z = -0.35;
  g.add(forkBar);
  for (let i = 0; i < 3; i++) {
    const tine = cyl(0.02, 0.02, 0.3, IRON, 4);
    tine.position.set(0.24 + i * 0.09, 0.5, 0.28);
    tine.rotation.z = -0.35;
    g.add(tine);
  }
  // faint steam wisps rising off the crest
  const steamMat = { transparent: true, opacity: 0.4 };
  for (const [x, z, h] of [[-0.15, 0.1, 0.6], [0.2, -0.15, 0.45], [-0.4, -0.2, 0.35]]) {
    const wisp = cone(0.09, h, 0xe8e4da, 5, steamMat);
    wisp.position.set(x, 0.95 + h / 2, z);
    wisp.rotation.z = 0.12;
    g.add(wisp);
  }
  return g;
}

// 🗑️ Compost Bin — slatted three-sided bin, dark compost heaped inside, one slat missing
function compostBin() {
  const g = new THREE.Group();
  const W = 2.4, D = 1.8, H = 1.1;
  // corner posts
  for (const [sx, sz] of [[-W / 2, -D / 2], [W / 2, -D / 2], [-W / 2, D / 2], [W / 2, D / 2]]) {
    const post = box(0.16, H + 0.15, 0.16, P.woodDark);
    post.position.set(sx, (H + 0.15) / 2, sz);
    g.add(post);
  }
  // back wall — four slats
  for (let i = 0; i < 4; i++) {
    const slat = box(W - 0.1, 0.2, 0.07, i % 2 ? P.wood : P.woodLight);
    slat.position.set(0, 0.18 + i * 0.27, -D / 2);
    g.add(slat);
  }
  // side walls — one slat missing on the right side (top row skipped)
  for (const s of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      if (s === 1 && i === 3) continue; // the missing slat
      const slat = box(0.07, 0.2, D - 0.1, i % 2 ? P.woodLight : P.wood);
      slat.position.set(s * W / 2, 0.18 + i * 0.27, 0);
      g.add(slat);
    }
  }
  // the missing slat lies fallen in the grass
  const fallen = box(0.07, 0.2, D - 0.1, P.woodLight);
  fallen.position.set(W / 2 + 0.45, 0.1, 0.25);
  fallen.rotation.y = 0.5;
  fallen.rotation.z = Math.PI / 2;
  g.add(fallen);
  // dark compost heaped inside, proud of the walls
  const load = ball(0.95, COMPOST, 0.55, 8);
  load.position.set(0, 0.75, 0.1);
  load.scale.x = 1.15;
  g.add(load);
  const loadCrest = ball(0.5, 0x4c3820, 0.65, 6);
  loadCrest.position.set(-0.25, 1.05, 0);
  g.add(loadCrest);
  // scraps on top
  const peel = ball(0.09, 0xe8912e, 0.6, 5);
  peel.position.set(0.3, 1.2, 0.2);
  g.add(peel);
  const leaf = box(0.18, 0.03, 0.14, 0xb0782e);
  leaf.position.set(-0.4, 1.28, 0.3);
  leaf.rotation.y = 0.6;
  g.add(leaf);
  return g;
}

// 🍁 Mulch Station — open bay of shredded mulch, shovel leaning, burlap sack beside
function mulchStation() {
  const g = new THREE.Group();
  const W = 2.6, D = 2.0, H = 0.75;
  // low plank walls: back + two sides
  const back = box(W, H, 0.14, P.wood);
  back.position.set(0, H / 2, -D / 2);
  g.add(back);
  for (const s of [-1, 1]) {
    const side = box(0.14, H, D, P.wood);
    side.position.set(s * W / 2, H / 2, 0);
    g.add(side);
  }
  // corner posts
  for (const [sx, sz] of [[-W / 2, -D / 2], [W / 2, -D / 2], [-W / 2, D / 2], [W / 2, D / 2]]) {
    const post = box(0.18, H + 0.2, 0.18, P.woodDark);
    post.position.set(sx, (H + 0.2) / 2, sz);
    g.add(post);
  }
  // shredded red-brown mulch heaped in the bay, spilling out the open front
  const heap = ball(0.95, MULCH, 0.5, 8);
  heap.position.set(0, 0.42, -0.2);
  heap.scale.x = 1.2;
  g.add(heap);
  const spill = ball(0.6, 0x9c5a36, 0.4, 7);
  spill.position.set(0.2, 0.18, 0.85);
  spill.scale.x = 1.4;
  g.add(spill);
  // shredded texture — little slivers strewn over the heap
  for (let i = 0; i < 6; i++) {
    const sliver = box(0.22, 0.04, 0.07, i % 2 ? 0xa8663e : 0x7a3e24);
    sliver.position.set(-0.7 + i * 0.28, 0.72 - (i % 3) * 0.12, -0.4 + (i % 2) * 0.5);
    sliver.rotation.y = i * 0.8;
    g.add(sliver);
  }
  // shovel leaning against the side wall
  const shovelStick = cyl(0.04, 0.04, 1.5, P.woodLight, 5);
  shovelStick.position.set(-W / 2 - 0.12, 0.8, 0.3);
  shovelStick.rotation.z = -0.28;
  g.add(shovelStick);
  const blade = box(0.26, 0.36, 0.05, IRON);
  blade.position.set(-W / 2 - 0.32, 0.18, 0.3);
  blade.rotation.z = -0.28;
  g.add(blade);
  // burlap sack sagging beside the bay
  const sack = ball(0.36, BURLAP, 0.85, 7);
  sack.position.set(W / 2 + 0.5, 0.32, 0.55);
  g.add(sack);
  const sackTie = cyl(0.09, 0.12, 0.16, 0xa87f42, 6);
  sackTie.position.set(W / 2 + 0.5, 0.66, 0.55);
  g.add(sackTie);
  return g;
}

// ⚪ Lime Storage — small lean-to over stacked white sacks, one torn open
function limeStorage() {
  const g = new THREE.Group();
  const W = 2.6, D = 1.9;
  // lean-to posts: tall at the front, short at the back
  const hs = [1.9, 1.9, 1.3, 1.3];
  const spots = [[-W / 2, D / 2], [W / 2, D / 2], [-W / 2, -D / 2], [W / 2, -D / 2]];
  spots.forEach(([sx, sz], i) => {
    const post = cyl(0.09, 0.12, hs[i], P.woodDark, 6);
    post.position.set(sx, hs[i] / 2, sz);
    g.add(post);
  });
  // slanted plank roof
  const roof = box(W + 0.6, 0.12, D + 0.7, 0x8a6a44);
  roof.position.y = 1.72;
  roof.rotation.x = 0.3;
  g.add(roof);
  const roofTrim = box(W + 0.7, 0.09, 0.16, P.woodDark);
  roofTrim.position.set(0, 2.0, D / 2 + 0.22);
  g.add(roofTrim);
  // pallet floor keeping the sacks dry
  const pallet = box(W - 0.3, 0.12, D - 0.3, P.wood);
  pallet.position.y = 0.06;
  g.add(pallet);
  // stacked white lime sacks — bottom course of three, two on top
  for (let i = 0; i < 3; i++) {
    const sack = ball(0.4, LIME, 0.68, 7);
    sack.position.set(-0.7 + i * 0.7, 0.36, -0.15);
    sack.scale.x = 1.15;
    g.add(sack);
  }
  for (let i = 0; i < 2; i++) {
    const sack = ball(0.38, 0xe6e3d8, 0.68, 7);
    sack.position.set(-0.35 + i * 0.7, 0.82, -0.15);
    sack.scale.x = 1.15;
    g.add(sack);
  }
  // the torn sack slumped at the front, white spill fanning out
  const torn = ball(0.36, LIME, 0.55, 7);
  torn.position.set(0.65, 0.24, 0.75);
  torn.rotation.y = 0.5;
  torn.scale.x = 1.25;
  g.add(torn);
  const spill = cyl(0.5, 0.58, 0.07, 0xfafaf4, 9);
  spill.position.set(0.95, 0.035, 1.15);
  g.add(spill);
  for (let i = 0; i < 3; i++) {
    const dust = ball(0.1 - i * 0.02, 0xfafaf4, 0.5, 5);
    dust.position.set(1.15 + i * 0.22, 0.06, 1.3 + i * 0.12);
    g.add(dust);
  }
  // scoop resting on the stack
  const scoop = ball(0.13, IRON, 0.6, 6);
  scoop.position.set(-0.35, 1.1, -0.1);
  g.add(scoop);
  return g;
}

// 🪨 Gravel Road — wide gravel bed, edge stones, wheel ruts, roadside marker
function gravelRoad() {
  const g = new THREE.Group();
  const L = 5.5, W = 2.9;
  // packed gravel bed with a lighter crown
  const bed = box(L, 0.14, W, GRAVEL);
  bed.position.y = 0.07;
  g.add(bed);
  const crown = box(L - 0.2, 0.06, W - 0.7, GRAVEL_LIGHT);
  crown.position.y = 0.17;
  g.add(crown);
  // wheel ruts pressed into the crown
  for (const s of [-1, 1]) {
    const rut = box(L - 0.4, 0.05, 0.34, 0x776f63);
    rut.position.set(0, 0.19, s * 0.62);
    g.add(rut);
  }
  // edge stones shouldering both sides
  for (let i = 0; i < 7; i++) {
    for (const s of [-1, 1]) {
      const edge = ball(0.16 + ((i + (s > 0 ? 1 : 0)) % 3) * 0.05, (i + s) % 2 ? P.stone : 0x8a8177, 0.72, 5);
      edge.position.set(-L / 2 + 0.45 + i * ((L - 0.9) / 6), 0.14, s * (W / 2 + 0.12));
      g.add(edge);
    }
  }
  // loose gravel scattered over the surface
  for (let i = 0; i < 6; i++) {
    const loose = ball(0.06 + (i % 2) * 0.03, i % 2 ? 0xb5aa97 : GRAVEL_LIGHT, 0.7, 4);
    loose.position.set(-L / 2 + 0.7 + i * ((L - 1.4) / 5), 0.22, (i % 2 ? 0.25 : -0.3));
    g.add(loose);
  }
  // roadside marker post with a painted cap
  const marker = cyl(0.08, 0.1, 1.1, P.woodDark, 6);
  marker.position.set(L / 2 - 0.5, 0.55, W / 2 + 0.5);
  g.add(marker);
  const markerCap = cyl(0.1, 0.1, 0.16, P.trim, 6);
  markerCap.position.set(L / 2 - 0.5, 1.12, W / 2 + 0.5);
  g.add(markerCap);
  const markerTip = ball(0.09, P.capRed, 0.8, 5);
  markerTip.position.set(L / 2 - 0.5, 1.24, W / 2 + 0.5);
  g.add(markerTip);
  // a tuft of grass at the marker's foot
  const tuftA = cone(0.12, 0.3, P.leaf, 5);
  tuftA.position.set(L / 2 - 0.75, 0.15, W / 2 + 0.42);
  g.add(tuftA);
  const tuftB = cone(0.09, 0.24, P.leafLight, 5);
  tuftB.position.set(L / 2 - 0.35, 0.12, W / 2 + 0.68);
  g.add(tuftB);
  return g;
}

export const INFRA_MODELS_C = {
  prot_hedge: hedge,
  prot_stone_wall: stoneWall,
  prot_drainage_ditch: drainageDitch,
  prot_sand_barrier: sandBarrier,
  prot_snow_fence: snowFence,
  soil_compost_pile: compostPile,
  soil_compost_bin: compostBin,
  soil_mulch_station: mulchStation,
  soil_lime_storage: limeStorage,
  log_gravelroad: gravelRoad,
};
