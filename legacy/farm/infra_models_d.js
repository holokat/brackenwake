// Hand-built models for the processing & workshop tier — same flat-shaded
// low-poly language as infra_models.js: P palette, chunky silhouettes, warm trims.

import * as THREE from 'three';
import { P, mat, box, cyl, cone, ball } from './assets.js';

const IRON = 0x4e5257;

// 🪵 Drying Rack — A-frame rack hung with herb bundles and fruit rings
function dryingRack() {
  const g = new THREE.Group();
  const W = 2.0, H = 1.7;
  for (const sx of [-W / 2, W / 2]) {
    for (const r of [0.3, -0.3]) {
      const leg = cyl(0.06, 0.075, 1.95, P.woodDark, 5);
      leg.position.set(sx, 0.9, 0);
      leg.rotation.x = r;
      g.add(leg);
    }
  }
  const ridge = cyl(0.06, 0.06, W + 0.5, P.wood, 6);
  ridge.position.y = H;
  ridge.rotation.z = Math.PI / 2;
  g.add(ridge);
  for (const [y, z] of [[1.12, 0.26], [0.62, 0.42]]) {
    for (const s of [-1, 1]) {
      const rail = box(W + 0.25, 0.07, 0.07, P.woodLight);
      rail.position.set(0, y, s * z);
      g.add(rail);
    }
  }
  // herb bundles hanging from the ridge
  const herbCols = [P.leaf, P.leafDark, 0x7a9e3f];
  for (let i = 0; i < 3; i++) {
    const x = -0.6 + i * 0.6;
    const str = cyl(0.015, 0.015, 0.18, 0xc9b17e, 4);
    str.position.set(x, H - 0.1, 0);
    g.add(str);
    const bundle = cone(0.15, 0.44, herbCols[i], 6);
    bundle.position.set(x, H - 0.42, 0);
    bundle.rotation.x = Math.PI;
    g.add(bundle);
  }
  // dried fruit rings strung on the front rail
  const fruitCols = [0xe0913f, 0xc4552f, 0xe0913f];
  for (let i = 0; i < 3; i++) {
    const x = -0.55 + i * 0.55;
    const str = cyl(0.015, 0.015, 0.14, 0xc9b17e, 4);
    str.position.set(x, 1.02, 0.26);
    g.add(str);
    const ring = cyl(0.11, 0.11, 0.045, fruitCols[i], 8);
    ring.position.set(x, 0.86, 0.26);
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
  }
  // basket of fresh cuttings waiting at the foot
  const basket = cyl(0.26, 0.2, 0.26, P.wood, 8);
  basket.position.set(0.85, 0.13, 0.5);
  g.add(basket);
  const cuttings = ball(0.18, P.leafLight, 0.6, 6);
  cuttings.position.set(0.85, 0.3, 0.5);
  g.add(cuttings);
  return g;
}

// 🫧 Washing Station — basin table with pump spigot, wet crates, drifting bubbles
function washingStation() {
  const g = new THREE.Group();
  const W = 2.4, D = 1.3, H = 0.95;
  for (const [sx, sz] of [[-W / 2 + 0.15, -D / 2 + 0.15], [W / 2 - 0.15, -D / 2 + 0.15], [-W / 2 + 0.15, D / 2 - 0.15], [W / 2 - 0.15, D / 2 - 0.15]]) {
    const leg = box(0.14, H, 0.14, P.woodDark);
    leg.position.set(sx, H / 2, sz);
    g.add(leg);
  }
  const top = box(W, 0.12, D, P.wood);
  top.position.y = H;
  g.add(top);
  // stone wash basin brimming with blue water
  const basin = box(1.3, 0.42, 1.0, 0x8a8177);
  basin.position.set(-0.4, H + 0.27, 0);
  g.add(basin);
  const water = box(1.14, 0.06, 0.84, P.water);
  water.position.set(-0.4, H + 0.46, 0);
  g.add(water);
  // pump spigot arched over the basin
  const pipe = cyl(0.07, 0.09, 1.0, IRON, 6);
  pipe.position.set(-1.05, H + 0.5, -0.45);
  g.add(pipe);
  const arm = cyl(0.06, 0.06, 0.6, IRON, 6);
  arm.position.set(-0.85, H + 0.98, -0.28);
  arm.rotation.x = Math.PI / 2.6;
  arm.rotation.y = 0.5;
  g.add(arm);
  const mouth = cyl(0.08, 0.06, 0.2, IRON, 6);
  mouth.position.set(-0.66, H + 0.88, -0.06);
  g.add(mouth);
  const handle = box(0.5, 0.07, 0.07, IRON);
  handle.position.set(-1.28, H + 1.02, -0.45);
  handle.rotation.z = 0.5;
  g.add(handle);
  const drip = ball(0.05, P.water, 1.4, 5);
  drip.position.set(-0.66, H + 0.68, -0.06);
  g.add(drip);
  // wet crates of rinsed produce
  const crateCols = [[0.9, 0.45, [0xd8433a, 0xe0913f, 0xd8433a]], [1.15, -0.5, [0x6fb14a, 0x5a9e4a, 0x6fb14a]]];
  for (const [cx, cz, cols] of crateCols) {
    const crate = box(0.62, 0.42, 0.62, P.woodDark);
    crate.position.set(cx, 0.21, cz);
    crate.rotation.y = cz > 0 ? 0.25 : -0.15;
    g.add(crate);
    cols.forEach((c, i) => {
      const veg = ball(0.11, c, 0.9, 6);
      veg.position.set(cx - 0.14 + i * 0.14, 0.46, cz + (i % 2 ? 0.1 : -0.08));
      g.add(veg);
    });
  }
  // soap bubbles drifting off the basin
  for (const [bx, by, bz, r] of [[-0.15, H + 0.62, 0.3, 0.055], [-0.65, H + 0.7, 0.15, 0.045], [-0.35, H + 0.85, -0.1, 0.06], [0.05, H + 0.75, 0.05, 0.04]]) {
    const bubble = ball(r, 0xf5f6fa, 1, 5);
    bubble.position.set(bx, by, bz);
    g.add(bubble);
  }
  return g;
}

// 🌾 Threshing Floor — packed-earth circle, stone rim, sheaves and a leaning flail
function threshingFloor() {
  const g = new THREE.Group();
  const R = 2.5;
  const floor = cyl(R, R + 0.15, 0.16, 0xb59a6b, 12);
  floor.position.y = 0.08;
  g.add(floor);
  const inner = cyl(R - 0.55, R - 0.45, 0.06, 0xa8895a, 11);
  inner.position.y = 0.17;
  g.add(inner);
  // low stone rim
  for (let i = 0; i < 13; i++) {
    const a = (i / 13) * Math.PI * 2;
    const rock = ball(0.22 + (i % 3) * 0.05, i % 2 ? P.stone : 0x8a8177, 0.75, 6);
    rock.position.set(Math.cos(a) * (R + 0.1), 0.2, Math.sin(a) * (R + 0.1));
    g.add(rock);
  }
  // standing wheat sheaves
  for (const [sx, sz, tilt] of [[-1.2, -0.7, 0.06], [-0.6, 0.9, -0.08], [0.9, -1.0, 0.1]]) {
    const body = cyl(0.24, 0.36, 0.9, 0xd9b45c, 7);
    body.position.set(sx, 0.6, sz);
    body.rotation.z = tilt;
    g.add(body);
    const tie = cyl(0.27, 0.27, 0.1, 0xa87f42, 7);
    tie.position.set(sx, 0.68, sz);
    tie.rotation.z = tilt;
    g.add(tie);
    const head = ball(0.26, 0xe5c26e, 0.8, 7);
    head.position.set(sx - tilt * 0.5, 1.1, sz);
    g.add(head);
  }
  // scattered straw across the floor
  for (let i = 0; i < 8; i++) {
    const straw = box(0.55 + (i % 3) * 0.12, 0.035, 0.06, 0xe0c078);
    straw.position.set(-1.3 + (i % 4) * 0.85, 0.21, -0.9 + Math.floor(i / 4) * 1.3 + (i % 2) * 0.3);
    straw.rotation.y = i * 0.85;
    g.add(straw);
  }
  // loose grain heap swept to the middle
  const heap = ball(0.42, 0xe8c26a, 0.45, 8);
  heap.position.set(0.2, 0.24, 0.3);
  g.add(heap);
  // flail leaning on the rim
  const staff = cyl(0.04, 0.045, 1.6, P.woodLight, 5);
  staff.position.set(1.9, 0.85, 1.3);
  staff.rotation.z = 0.4;
  staff.rotation.x = -0.15;
  g.add(staff);
  const link = cyl(0.02, 0.02, 0.16, 0xc9b17e, 4);
  link.position.set(2.24, 1.5, 1.35);
  link.rotation.z = -0.6;
  g.add(link);
  const swiple = cyl(0.05, 0.05, 0.6, P.woodDark, 5);
  swiple.position.set(2.42, 1.28, 1.38);
  swiple.rotation.z = -0.5;
  g.add(swiple);
  return g;
}

// 🪨 Millstone — grindstone turning on a stone base, push-pole riding around
function millstone() {
  const g = new THREE.Group();
  const base = cyl(1.15, 1.3, 0.55, P.stone, 9);
  base.position.y = 0.28;
  g.add(base);
  const lip = cyl(1.22, 1.18, 0.12, 0x8a8177, 9);
  lip.position.y = 0.58;
  g.add(lip);
  // the runner stone — geometry re-axed so its local z is the spin axis
  const stone = cyl(1.0, 1.0, 0.38, 0x9a938a, 12);
  stone.geometry.rotateX(Math.PI / 2);
  stone.rotation.x = -Math.PI / 2;
  stone.position.y = 0.83;
  g.add(stone);
  // hub, peg and push-pole ride on the stone (children spin with it)
  const hub = cyl(0.13, 0.13, 0.5, P.woodDark, 6);
  hub.rotation.x = Math.PI / 2;
  hub.position.set(0, 0, 0.34);
  stone.add(hub);
  const peg = cyl(0.07, 0.08, 0.6, P.woodDark, 5);
  peg.rotation.x = Math.PI / 2;
  peg.position.set(0.72, 0, 0.42);
  stone.add(peg);
  const pole = cyl(0.055, 0.065, 1.7, P.wood, 6);
  pole.rotation.z = Math.PI / 2;
  pole.position.set(1.35, 0, 0.55);
  stone.add(pole);
  const grip = cyl(0.075, 0.075, 0.28, P.woodLight, 6);
  grip.rotation.z = Math.PI / 2;
  grip.position.set(2.05, 0, 0.55);
  stone.add(grip);
  // flour dust drifting off the rim
  const pile = ball(0.42, 0xf0e8d8, 0.45, 8);
  pile.position.set(1.55, 0.18, 0.55);
  g.add(pile);
  const pileTop = ball(0.22, 0xf7f1e4, 0.55, 6);
  pileTop.position.set(1.62, 0.36, 0.5);
  g.add(pileTop);
  for (let i = 0; i < 3; i++) {
    const speck = ball(0.06, 0xf0e8d8, 0.6, 4);
    speck.position.set(1.2 + i * 0.28, 0.06, 0.95 + (i % 2) * 0.2);
    g.add(speck);
  }
  // a filled sack and scoop waiting beside
  const sack = ball(0.3, 0xc9a25e, 0.85, 7);
  sack.position.set(-1.5, 0.27, 0.5);
  g.add(sack);
  const sackTie = cyl(0.08, 0.11, 0.14, 0xa87f42, 6);
  sackTie.position.set(-1.5, 0.55, 0.5);
  g.add(sackTie);
  const scoop = ball(0.13, IRON, 0.6, 6);
  scoop.position.set(-1.1, 0.08, 0.85);
  g.add(scoop);
  // footing stones around the base
  for (let i = 0; i < 4; i++) {
    const a = 0.8 + i * 1.7;
    const rock = ball(0.18, i % 2 ? P.stone : 0x8a8177, 0.7, 5);
    rock.position.set(Math.cos(a) * 1.35, 0.12, Math.sin(a) * 1.35);
    g.add(rock);
  }
  g.userData.spin = stone;
  return g;
}

// 🥚 Egg Sorting Station — graded trays of eggs, a basket, a hanging scale
function eggSorting() {
  const g = new THREE.Group();
  const W = 2.3, D = 1.25, H = 0.9;
  for (const [sx, sz] of [[-W / 2 + 0.14, -D / 2 + 0.14], [W / 2 - 0.14, -D / 2 + 0.14], [-W / 2 + 0.14, D / 2 - 0.14], [W / 2 - 0.14, D / 2 - 0.14]]) {
    const leg = box(0.13, H, 0.13, P.woodDark);
    leg.position.set(sx, H / 2, sz);
    g.add(leg);
  }
  const top = box(W, 0.1, D, P.wood);
  top.position.y = H;
  g.add(top);
  const apron = box(W - 0.2, 0.14, D - 0.2, P.woodDark);
  apron.position.y = H - 0.12;
  g.add(apron);
  // three graded sorting trays, small to large eggs
  const trays = [[-0.72, 0.55, 0.075], [0, 0.62, 0.09], [0.72, 0.7, 0.105]];
  trays.forEach(([tx, tw, er], t) => {
    const tray = box(tw, 0.14, 0.9, 0xb08948);
    tray.position.set(tx, H + 0.12, 0);
    g.add(tray);
    for (let i = 0; i < 6; i++) {
      const egg = ball(er, (i + t) % 3 ? 0xf5f1e6 : 0xc98d5e, 1.2, 6);
      egg.position.set(tx - tw / 4 + (i % 2) * (tw / 2), H + 0.24, -0.28 + Math.floor(i / 2) * 0.28);
      g.add(egg);
    }
  });
  // gathering basket on the ground
  const basket = cyl(0.36, 0.28, 0.34, P.wood, 8);
  basket.position.set(1.5, 0.17, 0.35);
  g.add(basket);
  const bBand = cyl(0.375, 0.375, 0.07, P.woodDark, 8);
  bBand.position.set(1.5, 0.24, 0.35);
  g.add(bBand);
  for (let i = 0; i < 3; i++) {
    const egg = ball(0.09, i % 2 ? 0xc98d5e : 0xf5f1e6, 1.15, 6);
    egg.position.set(1.42 + (i % 2) * 0.17, 0.37, 0.28 + Math.floor(i / 2) * 0.15);
    g.add(egg);
  }
  // hanging scale on a corner post
  const post = cyl(0.05, 0.06, 1.0, P.woodDark, 5);
  post.position.set(-1.05, H + 0.5, -0.45);
  g.add(post);
  const armS = box(0.6, 0.06, 0.06, P.wood);
  armS.position.set(-0.8, H + 0.98, -0.45);
  g.add(armS);
  const chain = cyl(0.018, 0.018, 0.3, IRON, 4);
  chain.position.set(-0.55, H + 0.82, -0.45);
  g.add(chain);
  const dial = cyl(0.11, 0.11, 0.06, 0xd8b13a, 8);
  dial.position.set(-0.55, H + 0.94, -0.45);
  dial.rotation.x = Math.PI / 2;
  g.add(dial);
  const pan = cyl(0.17, 0.13, 0.08, IRON, 8);
  pan.position.set(-0.55, H + 0.62, -0.45);
  g.add(pan);
  const panEgg = ball(0.085, 0xf5f1e6, 1.2, 6);
  panEgg.position.set(-0.55, H + 0.72, -0.45);
  g.add(panEgg);
  return g;
}

// 🧰 Tool Shed — open-front mini shed, pegboard wall of tools
function toolShed() {
  const g = new THREE.Group();
  const W = 2.1, D = 1.5, H = 1.9;
  const floor = box(W, 0.12, D, P.woodDark);
  floor.position.y = 0.06;
  g.add(floor);
  const back = box(W, H, 0.1, P.wood);
  back.position.set(0, H / 2, -D / 2 + 0.05);
  g.add(back);
  for (const s of [-1, 1]) {
    const side = box(0.1, H, D, P.wood);
    side.position.set(s * (W / 2 - 0.05), H / 2, 0);
    g.add(side);
  }
  const roof = box(W + 0.5, 0.12, D + 0.55, 0x7a5236);
  roof.position.y = H + 0.14;
  roof.rotation.x = 0.16;
  g.add(roof);
  const fascia = box(W + 0.55, 0.1, 0.12, P.woodDark);
  fascia.position.set(0, H + 0.28, D / 2 + 0.22);
  g.add(fascia);
  // pegboard back wall
  const board = box(W - 0.4, H - 0.7, 0.06, P.woodLight);
  board.position.set(0, H / 2 + 0.15, -D / 2 + 0.12);
  g.add(board);
  for (let i = 0; i < 4; i++) {
    const peg = cyl(0.03, 0.03, 0.12, P.woodDark, 4);
    peg.position.set(-0.6 + i * 0.4, H - 0.45, -D / 2 + 0.2);
    peg.rotation.x = Math.PI / 2;
    g.add(peg);
  }
  // tools hanging and leaning inside
  const shovelStick = cyl(0.035, 0.035, 1.3, P.woodLight, 5);
  shovelStick.position.set(-0.6, 0.75, -D / 2 + 0.28);
  shovelStick.rotation.z = 0.1;
  g.add(shovelStick);
  const blade = box(0.22, 0.3, 0.05, IRON);
  blade.position.set(-0.66, 0.24, -D / 2 + 0.28);
  g.add(blade);
  const hoeStick = cyl(0.035, 0.035, 1.3, P.woodLight, 5);
  hoeStick.position.set(-0.2, 0.75, -D / 2 + 0.28);
  hoeStick.rotation.z = -0.08;
  g.add(hoeStick);
  const hoeHead = box(0.24, 0.07, 0.12, IRON);
  hoeHead.position.set(-0.14, 0.22, -D / 2 + 0.3);
  g.add(hoeHead);
  const hamHandle = cyl(0.03, 0.03, 0.45, P.wood, 5);
  hamHandle.position.set(0.6, H - 0.68, -D / 2 + 0.22);
  g.add(hamHandle);
  const hamHead = box(0.22, 0.1, 0.1, IRON);
  hamHead.position.set(0.6, H - 0.48, -D / 2 + 0.22);
  g.add(hamHead);
  // toolbox on the floor
  const kit = box(0.55, 0.28, 0.3, 0xc45c3a);
  kit.position.set(0.5, 0.26, 0.25);
  kit.rotation.y = -0.2;
  g.add(kit);
  const kitBar = cyl(0.025, 0.025, 0.5, IRON, 4);
  kitBar.position.set(0.5, 0.48, 0.25);
  kitBar.rotation.z = Math.PI / 2;
  kitBar.rotation.y = -0.2;
  g.add(kitBar);
  return g;
}

// 🪚 Sawbench — sawhorse with a plank mid-cut, handsaw in the kerf
function sawbench() {
  const g = new THREE.Group();
  const L = 1.7, H = 0.8;
  for (const sx of [-L / 2 + 0.2, L / 2 - 0.2]) {
    for (const r of [0.42, -0.42]) {
      const leg = box(0.11, 1.0, 0.11, P.woodDark);
      leg.position.set(sx, 0.44, 0);
      leg.rotation.x = r;
      g.add(leg);
    }
    const brace = box(0.09, 0.07, 0.8, P.wood);
    brace.position.set(sx, 0.42, 0);
    g.add(brace);
  }
  const beam = box(L, 0.16, 0.22, P.wood);
  beam.position.y = H;
  g.add(beam);
  // plank mid-cut: two halves with a kerf gap, off-half drooping
  const plankA = box(1.0, 0.09, 0.42, P.woodLight);
  plankA.position.set(-0.45, H + 0.13, 0.05);
  plankA.rotation.y = 0.12;
  g.add(plankA);
  const plankB = box(0.75, 0.09, 0.42, P.woodLight);
  plankB.position.set(0.5, H + 0.08, 0.14);
  plankB.rotation.y = 0.12;
  plankB.rotation.z = -0.14;
  g.add(plankB);
  // big handsaw standing in the kerf
  const sawBlade = box(0.72, 0.3, 0.03, 0xb9b4a8);
  sawBlade.position.set(0.12, H + 0.32, 0.1);
  sawBlade.rotation.z = -0.5;
  sawBlade.rotation.y = 0.12;
  g.add(sawBlade);
  const sawHandle = box(0.2, 0.24, 0.07, P.woodDark);
  sawHandle.position.set(0.48, H + 0.58, 0.1);
  sawHandle.rotation.z = -0.5;
  g.add(sawHandle);
  // sawdust pile drifting below the cut
  const dust = ball(0.3, 0xe0c078, 0.4, 7);
  dust.position.set(0.12, 0.11, 0.28);
  g.add(dust);
  const dust2 = ball(0.16, 0xe8d094, 0.5, 5);
  dust2.position.set(0.3, 0.08, 0.5);
  g.add(dust2);
  // offcuts tossed beside
  for (const [ox, oz, ry] of [[-0.75, 0.55, 0.5], [-0.55, 0.75, -0.3], [0.85, 0.5, 0.9]]) {
    const off = box(0.42, 0.08, 0.2, P.woodLight);
    off.position.set(ox, 0.05, oz);
    off.rotation.y = ry;
    g.add(off);
  }
  return g;
}

// 🧺 Basket Workshop — bench of banded baskets, willow rods leaning by
function basketWorkshop() {
  const g = new THREE.Group();
  const W = 2.5, D = 1.2, H = 0.55;
  for (const [sx, sz] of [[-W / 2 + 0.15, -D / 2 + 0.12], [W / 2 - 0.15, -D / 2 + 0.12], [-W / 2 + 0.15, D / 2 - 0.12], [W / 2 - 0.15, D / 2 - 0.12]]) {
    const leg = box(0.13, H, 0.13, P.woodDark);
    leg.position.set(sx, H / 2, sz);
    g.add(leg);
  }
  const top = box(W, 0.12, D, P.wood);
  top.position.y = H;
  g.add(top);
  // banded baskets in three sizes: one on the bench, two on the ground
  const baskets = [[-0.55, H + 0.06, 0.1, 0.34, 0.42], [1.65, 0, 0.3, 0.46, 0.6], [-1.6, 0, -0.2, 0.26, 0.34]];
  for (const [bx, by, bz, r, h] of baskets) {
    const body = cyl(r, r * 0.78, h, P.woodLight, 9);
    body.position.set(bx, by + h / 2, bz);
    g.add(body);
    const bandLo = cyl(r * 0.92, r * 0.92, 0.07, P.woodDark, 9);
    bandLo.position.set(bx, by + h * 0.3, bz);
    g.add(bandLo);
    const bandHi = cyl(r * 1.0, r * 1.0, 0.07, P.woodDark, 9);
    bandHi.position.set(bx, by + h * 0.72, bz);
    g.add(bandHi);
    const rim = cyl(r * 1.06, r * 1.02, 0.07, P.wood, 9);
    rim.position.set(bx, by + h, bz);
    g.add(rim);
  }
  // half-woven basket on the bench: base disc and bare uprights
  const wipBase = cyl(0.24, 0.24, 0.06, P.woodLight, 8);
  wipBase.position.set(0.55, H + 0.09, -0.1);
  g.add(wipBase);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const stake = cyl(0.02, 0.02, 0.34, P.woodDark, 4);
    stake.position.set(0.55 + Math.cos(a) * 0.21, H + 0.26, -0.1 + Math.sin(a) * 0.21);
    stake.rotation.x = Math.sin(a) * 0.18;
    stake.rotation.z = -Math.cos(a) * 0.18;
    g.add(stake);
  }
  // bundles of willow rods leaning on the bench end
  for (let i = 0; i < 5; i++) {
    const rod = cyl(0.025, 0.025, 1.5, [P.stem, 0xa8894f, P.woodLight][i % 3], 4);
    rod.position.set(1.15 + i * 0.07, 0.72, 0.62 + (i % 2) * 0.08);
    rod.rotation.z = -0.5;
    rod.rotation.x = 0.1 + (i % 3) * 0.06;
    g.add(rod);
  }
  const tie = cyl(0.09, 0.09, 0.1, 0xc9b17e, 6);
  tie.position.set(1.28, 0.62, 0.66);
  tie.rotation.z = -0.5;
  g.add(tie);
  return g;
}

// 🔧 Repair Shed — open-front shed, workbench, spare wheel and hung tools
function repairShed() {
  const g = new THREE.Group();
  const W = 3.2, D = 2.3, H = 2.2;
  const back = box(W, H, 0.12, P.wood);
  back.position.set(0, H / 2, -D / 2 + 0.06);
  g.add(back);
  const sideL = box(0.12, H, D, P.wood);
  sideL.position.set(-W / 2 + 0.06, H / 2, 0);
  g.add(sideL);
  const sideR = box(0.12, H * 0.55, D, P.wood);
  sideR.position.set(W / 2 - 0.06, H * 0.28, 0);
  g.add(sideR);
  for (const sx of [-W / 2 + 0.1, W / 2 - 0.1]) {
    const post = cyl(0.09, 0.11, H + 0.15, P.woodDark, 6);
    post.position.set(sx, (H + 0.15) / 2, D / 2 - 0.1);
    g.add(post);
  }
  const roof = box(W + 0.6, 0.14, D + 0.7, 0x8a6a44);
  roof.position.y = H + 0.2;
  roof.rotation.x = 0.2;
  g.add(roof);
  const fascia = box(W + 0.65, 0.12, 0.16, P.woodDark);
  fascia.position.set(0, H + 0.42, D / 2 + 0.3);
  g.add(fascia);
  // workbench along the back
  const bench = box(2.2, 0.14, 0.75, P.woodLight);
  bench.position.set(-0.3, 0.85, -D / 2 + 0.55);
  g.add(bench);
  for (const sx of [-1.25, 0.65]) {
    const bLeg = box(0.12, 0.8, 0.6, P.woodDark);
    bLeg.position.set(sx, 0.4, -D / 2 + 0.55);
    g.add(bLeg);
  }
  const vise = box(0.24, 0.22, 0.16, IRON);
  vise.position.set(0.5, 1.02, -D / 2 + 0.35);
  g.add(vise);
  // spare wheel leaning on the outside wall
  const wheel = cyl(0.55, 0.55, 0.12, P.woodDark, 10);
  wheel.position.set(-W / 2 - 0.12, 0.55, 0.3);
  wheel.rotation.z = Math.PI / 2 - 0.18;
  g.add(wheel);
  const hub = cyl(0.11, 0.11, 0.2, IRON, 6);
  hub.position.copy(wheel.position);
  hub.rotation.z = Math.PI / 2 - 0.18;
  g.add(hub);
  for (let i = 0; i < 3; i++) {
    const spoke = box(0.85, 0.07, 0.05, P.woodLight);
    spoke.position.copy(wheel.position);
    spoke.rotation.x = (i / 3) * Math.PI;
    spoke.rotation.z = Math.PI / 2 - 0.18;
    g.add(spoke);
  }
  // wrench and hammer hanging on the back wall
  const wrHandle = box(0.07, 0.42, 0.05, IRON);
  wrHandle.position.set(-0.9, 1.6, -D / 2 + 0.16);
  g.add(wrHandle);
  const wrJaw = box(0.18, 0.12, 0.06, IRON);
  wrJaw.position.set(-0.9, 1.84, -D / 2 + 0.16);
  g.add(wrJaw);
  const hmHandle = cyl(0.03, 0.03, 0.42, P.wood, 5);
  hmHandle.position.set(-0.45, 1.6, -D / 2 + 0.16);
  g.add(hmHandle);
  const hmHead = box(0.22, 0.1, 0.1, IRON);
  hmHead.position.set(-0.45, 1.82, -D / 2 + 0.16);
  g.add(hmHead);
  // oil can on the bench
  const canBody = cyl(0.11, 0.13, 0.22, 0x6a8290, 7);
  canBody.position.set(-1.0, 1.03, -D / 2 + 0.5);
  g.add(canBody);
  const canSpout = cone(0.05, 0.28, 0x6a8290, 5);
  canSpout.position.set(-0.88, 1.18, -D / 2 + 0.5);
  canSpout.rotation.z = -0.7;
  g.add(canSpout);
  const canKnob = ball(0.045, 0xd8b13a, 1, 4);
  canKnob.position.set(-1.0, 1.16, -D / 2 + 0.5);
  g.add(canKnob);
  // crate of spare parts by the open side
  const crate = box(0.6, 0.5, 0.6, 0xb08948);
  crate.position.set(1.15, 0.25, 0.55);
  crate.rotation.y = 0.3;
  g.add(crate);
  const part = cyl(0.12, 0.12, 0.3, IRON, 6);
  part.position.set(1.15, 0.56, 0.55);
  part.rotation.z = 0.5;
  g.add(part);
  return g;
}

// 🧼 Washhouse — hut with a flapping washline out to a pole, tub by the door
function washhouse() {
  const g = new THREE.Group();
  const HX = -0.75; // hut center x
  const W = 2.1, D = 1.8, H = 1.75;
  const walls = box(W, H, D, P.plaster);
  walls.position.set(HX, H / 2, 0);
  g.add(walls);
  for (const y of [0.5, 1.15]) {
    const band = box(W + 0.06, 0.09, D + 0.06, P.woodDark);
    band.position.set(HX, y, 0);
    g.add(band);
  }
  for (const s of [-1, 1]) {
    const slab = box(W + 0.6, 0.13, D * 0.72, P.capRed);
    slab.position.set(HX, H + 0.42, s * D * 0.25);
    slab.rotation.x = -s * 0.48;
    g.add(slab);
  }
  const ridge = box(W + 0.7, 0.13, 0.18, P.woodDark);
  ridge.position.set(HX, H + 0.68, 0);
  g.add(ridge);
  const door = box(0.7, 1.25, 0.08, P.woodDark);
  door.position.set(HX - 0.3, 0.64, D / 2 + 0.05);
  g.add(door);
  const knob = ball(0.05, 0xd8b13a, 1, 5);
  knob.position.set(HX - 0.05, 0.64, D / 2 + 0.11);
  g.add(knob);
  const steam = ball(0.14, 0xf2ede0, 0.8, 5);
  steam.position.set(HX + 0.55, H + 0.95, -0.2);
  g.add(steam);
  // washline pole out to the side
  const pole = cyl(0.06, 0.08, 1.9, P.woodDark, 6);
  pole.position.set(1.65, 0.95, 0.2);
  g.add(pole);
  const tip = ball(0.08, P.woodLight, 1, 5);
  tip.position.set(1.65, 1.9, 0.2);
  g.add(tip);
  // sagging line in two spans, hut gable to pole top
  const lineA = cyl(0.018, 0.018, 0.78, 0xf2ede0, 4);
  lineA.position.set(0.62, 1.87, 0.1);
  lineA.rotation.z = Math.PI / 2 - 0.22;
  lineA.rotation.y = 0.13;
  g.add(lineA);
  const lineB = cyl(0.018, 0.018, 0.78, 0xf2ede0, 4);
  lineB.position.set(1.32, 1.83, 0.17);
  lineB.rotation.z = Math.PI / 2 + 0.18;
  lineB.rotation.y = 0.13;
  g.add(lineB);
  // colorful wash flapping on the line
  const clothes = [[0.45, 0xc45c5c, 0.3], [0.78, 0x5f8fc9, -0.35], [1.12, 0xe0c04f, 0.4], [1.45, P.trim, -0.28]];
  for (const [cx, col, flap] of clothes) {
    const cloth = box(0.3, 0.42, 0.04, col);
    cloth.position.set(cx, 1.55, 0.12 + (cx - 0.45) * 0.07);
    cloth.rotation.x = flap;
    cloth.rotation.y = 0.13;
    g.add(cloth);
  }
  // washtub and washboard by the door
  const tub = cyl(0.44, 0.34, 0.4, P.wood, 9);
  tub.position.set(0.35, 0.2, 1.15);
  g.add(tub);
  const tubBand = cyl(0.43, 0.43, 0.07, IRON, 9);
  tubBand.position.set(0.35, 0.32, 1.15);
  g.add(tubBand);
  const tubWater = cyl(0.36, 0.36, 0.05, P.water, 9);
  tubWater.position.set(0.35, 0.38, 1.15);
  g.add(tubWater);
  const wboard = box(0.34, 0.6, 0.05, P.woodLight);
  wboard.position.set(0.62, 0.5, 1.0);
  wboard.rotation.x = -0.5;
  wboard.rotation.y = 0.4;
  g.add(wboard);
  const soap = box(0.16, 0.07, 0.1, 0xf5f6fa);
  soap.position.set(0.05, 0.42, 1.4);
  soap.rotation.y = 0.5;
  g.add(soap);
  const bubble = ball(0.05, 0xf5f6fa, 1, 5);
  bubble.position.set(0.35, 0.55, 1.15);
  g.add(bubble);
  return g;
}

export const INFRA_MODELS_D = {
  prc_drying_rack: dryingRack,
  prc_washing_station: washingStation,
  prc_threshing_floor: threshingFloor,
  prc_millstone: millstone,
  prc_egg_sorting: eggSorting,
  wrk_tool_shed: toolShed,
  wrk_sawbench: sawbench,
  wrk_basket_workshop: basketWorkshop,
  wrk_repair_shed: repairShed,
  wkr_washhouse: washhouse,
};
