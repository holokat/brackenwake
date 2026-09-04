// Hand-built models for the eco/decor tier — garden comforts and wildlife
// friends. Same flat-shaded low-poly language as assets.js: P palette,
// chunky silhouettes, warm trims.

import * as THREE from 'three';
import { P, mat, box, cyl, cone, ball } from './assets.js';

const IRON = 0x4e5257;

// 🐦 Birdhouse — pole-mounted little house, round door, perch, a bluebird on the roof
function birdhouse() {
  const g = new THREE.Group();
  const base = cyl(0.32, 0.4, 0.16, P.stone, 7);
  base.position.y = 0.08;
  g.add(base);
  const pole = cyl(0.07, 0.09, 1.35, P.woodDark, 6);
  pole.position.y = 0.75;
  g.add(pole);
  // the little house
  const house = box(0.62, 0.6, 0.55, P.woodLight);
  house.position.y = 1.65;
  g.add(house);
  for (const s of [-1, 1]) {
    const slab = box(0.78, 0.07, 0.42, P.capRed);
    slab.position.set(0, 2.05, s * 0.16);
    slab.rotation.x = -s * 0.55;
    g.add(slab);
  }
  const ridge = box(0.82, 0.08, 0.1, P.woodDark);
  ridge.position.y = 2.16;
  g.add(ridge);
  // round door hole + tiny perch
  const hole = cyl(0.11, 0.11, 0.05, 0x2c1d10, 8);
  hole.position.set(0, 1.7, 0.29);
  hole.rotation.x = Math.PI / 2;
  g.add(hole);
  const perch = cyl(0.03, 0.03, 0.26, P.woodDark, 5);
  perch.position.set(0, 1.5, 0.36);
  perch.rotation.x = Math.PI / 2;
  g.add(perch);
  // resident bluebird up top
  const bird = ball(0.13, 0x5a8fd4, 0.9, 6);
  bird.position.set(0.12, 2.3, 0);
  g.add(bird);
  const birdHead = ball(0.09, 0x5a8fd4, 1, 6);
  birdHead.position.set(0.24, 2.4, 0);
  g.add(birdHead);
  const belly = ball(0.09, 0xf0c26a, 0.8, 5);
  belly.position.set(0.18, 2.26, 0);
  g.add(belly);
  const beak = cone(0.035, 0.09, 0xe8a53a, 4);
  beak.position.set(0.34, 2.4, 0);
  beak.rotation.z = -Math.PI / 2;
  g.add(beak);
  const tail = box(0.18, 0.03, 0.07, 0x46709e);
  tail.position.set(-0.03, 2.34, 0);
  tail.rotation.z = 0.35;
  g.add(tail);
  return g;
}

// 🪑 Bench — rustic plank seat and back on stout legs, a daisy by one foot
function bench() {
  const g = new THREE.Group();
  const W = 1.9;
  for (const sx of [-0.75, 0.75]) {
    const legF = box(0.14, 0.55, 0.16, P.woodDark);
    legF.position.set(sx, 0.28, 0.22);
    g.add(legF);
    const legB = box(0.14, 1.25, 0.16, P.woodDark);
    legB.position.set(sx, 0.62, -0.24);
    g.add(legB);
    const stretcher = box(0.1, 0.09, 0.5, P.wood);
    stretcher.position.set(sx, 0.24, 0);
    g.add(stretcher);
  }
  // two seat planks
  for (const dz of [-0.13, 0.13]) {
    const seat = box(W, 0.09, 0.24, P.wood);
    seat.position.set(0, 0.58, dz);
    g.add(seat);
  }
  // two back rails
  for (const y of [0.95, 1.18]) {
    const rail = box(W, 0.16, 0.08, P.woodLight);
    rail.position.set(0, y, -0.28);
    rail.rotation.x = -0.12;
    g.add(rail);
  }
  const capRail = box(W + 0.1, 0.07, 0.1, P.woodDark);
  capRail.position.set(0, 1.32, -0.3);
  g.add(capRail);
  // daisy sprouting by a front leg
  const stem = cyl(0.02, 0.025, 0.32, P.stem, 4);
  stem.position.set(1.0, 0.16, 0.35);
  g.add(stem);
  const bloom = ball(0.08, 0xf7efdd, 0.7, 5);
  bloom.position.set(1.0, 0.34, 0.35);
  g.add(bloom);
  const eye = ball(0.04, 0xe8b93a, 0.8, 4);
  eye.position.set(1.0, 0.4, 0.35);
  g.add(eye);
  const leaf = cone(0.06, 0.16, P.leaf, 4);
  leaf.position.set(1.08, 0.12, 0.38);
  leaf.rotation.z = -0.9;
  g.add(leaf);
  return g;
}

// 🌷 Flower Bed — plank-bordered bed bursting with mixed bright blooms
function flowerBed() {
  const g = new THREE.Group();
  const W = 1.9, D = 1.4, H = 0.32;
  for (const [dx, dz, w, r] of [[0, D / 2, W, 0], [0, -D / 2, W, 0], [W / 2, 0, D, 1], [-W / 2, 0, D, 1]]) {
    const plank = box(w + 0.14, H, 0.12, P.wood);
    plank.position.set(dx, H / 2, dz);
    if (r) plank.rotation.y = Math.PI / 2;
    g.add(plank);
  }
  for (const [sx, sz] of [[-W / 2, -D / 2], [W / 2, -D / 2], [-W / 2, D / 2], [W / 2, D / 2]]) {
    const post = box(0.15, H + 0.12, 0.15, P.woodDark);
    post.position.set(sx, (H + 0.12) / 2, sz);
    g.add(post);
  }
  const soil = box(W - 0.1, 0.1, D - 0.1, 0x4c3320);
  soil.position.y = H - 0.05;
  g.add(soil);
  const petals = [0xe85a6a, 0xf2a6c8, 0xe8b93a, 0xb89be6, 0xf7efdd, 0xe87a3a];
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 4; i++) {
      const px = -W / 2 + 0.35 + i * ((W - 0.7) / 3);
      const pz = -D / 2 + 0.32 + row * ((D - 0.64) / 2);
      const h = 0.35 + ((i + row) % 3) * 0.12;
      const stem = cyl(0.02, 0.025, h, P.stem, 4);
      stem.position.set(px, H + h / 2 - 0.05, pz);
      g.add(stem);
      const bloom = ball(0.1 + ((i + row) % 2) * 0.03, petals[(i + row * 2) % 6], 0.8, 5);
      bloom.position.set(px, H + h + 0.02, pz);
      g.add(bloom);
      if ((i + row) % 2 === 0) {
        const tuft = cone(0.09, 0.2, P.leafLight, 4);
        tuft.position.set(px + 0.1, H + 0.1, pz + 0.06);
        tuft.rotation.z = -0.5;
        g.add(tuft);
      }
    }
  }
  return g;
}

// 🛤️ Garden Path — gravel run with edging stones and flat stepping flags
function gardenPath() {
  const g = new THREE.Group();
  const L = 2.2, W = 1.0;
  const gravel = box(L, 0.1, W, 0xb5a88f);
  gravel.position.y = 0.05;
  g.add(gravel);
  const gravelTop = box(L - 0.12, 0.05, W - 0.14, 0xc4b89e);
  gravelTop.position.y = 0.12;
  g.add(gravelTop);
  // stepping flags wandering down the middle
  for (let i = 0; i < 3; i++) {
    const flag = cyl(0.26, 0.3, 0.08, i % 2 ? P.stone : 0x8a8177, 6);
    flag.position.set(-L / 2 + 0.45 + i * 0.65, 0.16, (i % 2 ? 0.12 : -0.1));
    flag.rotation.y = i * 0.5;
    g.add(flag);
  }
  // edging stones along both sides
  for (let i = 0; i < 5; i++) {
    for (const s of [-1, 1]) {
      const stone = ball(0.11 + ((i + (s > 0 ? 1 : 0)) % 3) * 0.03, i % 2 ? P.stone : 0x8a8177, 0.75, 5);
      stone.position.set(-L / 2 + 0.25 + i * 0.42, 0.12, s * (W / 2 + 0.02));
      g.add(stone);
    }
  }
  // a tuft of grass squeezing through at one end
  const tuft = cone(0.09, 0.24, P.leafLight, 4);
  tuft.position.set(L / 2 - 0.15, 0.12, W / 2 - 0.1);
  tuft.rotation.z = -0.2;
  g.add(tuft);
  const tuft2 = cone(0.07, 0.18, P.leaf, 4);
  tuft2.position.set(-L / 2 + 0.12, 0.1, -W / 2 + 0.12);
  g.add(tuft2);
  return g;
}

// 🦇 Bat House — tall flat box high on a pole, landing slot below, a bat circling
function batHouse() {
  const g = new THREE.Group();
  const base = cyl(0.3, 0.38, 0.14, P.stone, 7);
  base.position.y = 0.07;
  g.add(base);
  const pole = cyl(0.06, 0.08, 1.7, P.woodDark, 6);
  pole.position.y = 0.9;
  g.add(pole);
  // tall flat-fronted box
  const house = box(0.72, 0.95, 0.24, 0x5c4630);
  house.position.y = 2.1;
  g.add(house);
  for (const y of [1.85, 2.1, 2.35]) {
    const groove = box(0.74, 0.05, 0.26, 0x4a3826);
    groove.position.y = y;
    g.add(groove);
  }
  const roofB = box(0.86, 0.08, 0.4, 0x3d2e1f);
  roofB.position.y = 2.62;
  roofB.rotation.x = -0.18;
  g.add(roofB);
  // dark entry slot at the bottom
  const slot = box(0.6, 0.1, 0.06, 0x1a120c);
  slot.position.set(0, 1.58, 0.11);
  g.add(slot);
  // tiny bat swooping past
  const bat = ball(0.08, 0x2c2c34, 0.85, 5);
  bat.position.set(0.5, 1.4, 0.25);
  g.add(bat);
  const batHead = ball(0.05, 0x2c2c34, 1, 4);
  batHead.position.set(0.58, 1.47, 0.25);
  g.add(batHead);
  for (const s of [-1, 1]) {
    const ear = cone(0.02, 0.06, 0x2c2c34, 3);
    ear.position.set(0.58, 1.53, 0.25 + s * 0.03);
    g.add(ear);
    const wing = box(0.28, 0.02, 0.12, 0x232329);
    wing.position.set(0.48, 1.42, 0.25 + s * 0.16);
    wing.rotation.x = s * 0.5;
    wing.rotation.y = s * 0.25;
    g.add(wing);
  }
  return g;
}

// 🐝 Bee Hotel — A-frame box on a post packed with nesting tubes, bees inbound
function beeHotel() {
  const g = new THREE.Group();
  const post = box(0.16, 1.0, 0.16, P.woodDark);
  post.position.y = 0.5;
  g.add(post);
  const foot = box(0.5, 0.12, 0.5, P.wood);
  foot.position.y = 0.06;
  g.add(foot);
  // the hotel box
  const body = box(0.95, 0.75, 0.4, P.wood);
  body.position.y = 1.35;
  g.add(body);
  for (const s of [-1, 1]) {
    const slab = box(0.68, 0.07, 0.5, P.capRed);
    slab.position.set(s * 0.28, 1.85, 0);
    slab.rotation.z = -s * 0.65;
    g.add(slab);
  }
  const ridge = box(0.14, 0.1, 0.52, P.woodDark);
  ridge.position.y = 2.02;
  g.add(ridge);
  // honeycomb of nesting tubes on the face
  const tubeCols = [0xc9a25e, 0xa87f42, 0x8a6a44];
  for (let row = 0; row < 3; row++) {
    for (let i = 0; i < 4; i++) {
      const tube = cyl(0.07, 0.07, 0.1, tubeCols[(i + row) % 3], 6);
      tube.position.set(-0.33 + i * 0.22 + (row % 2) * 0.09, 1.13 + row * 0.22, 0.2);
      tube.rotation.x = Math.PI / 2;
      g.add(tube);
      const hole = cyl(0.035, 0.035, 0.04, 0x2c1d10, 5);
      hole.position.set(tube.position.x, tube.position.y, 0.26);
      hole.rotation.x = Math.PI / 2;
      g.add(hole);
    }
  }
  // two bees on approach
  for (const [bx, by, bz] of [[0.6, 1.5, 0.45], [-0.55, 1.1, 0.55]]) {
    const bee = ball(0.07, 0xe8b93a, 0.8, 5);
    bee.position.set(bx, by, bz);
    g.add(bee);
    const stripe = box(0.03, 0.1, 0.1, 0x2c2c2a);
    stripe.position.set(bx, by, bz);
    g.add(stripe);
    const wings = box(0.09, 0.02, 0.16, 0xf2ede0);
    wings.position.set(bx, by + 0.07, bz);
    g.add(wings);
  }
  return g;
}

// 🎐 Wind Chimes — shepherd's hook with a rank of hanging tubes, mid-chime
function windChimes() {
  const g = new THREE.Group();
  const base = cyl(0.26, 0.34, 0.14, P.stone, 7);
  base.position.y = 0.07;
  g.add(base);
  const post = cyl(0.05, 0.07, 1.9, IRON, 6);
  post.position.y = 0.95;
  g.add(post);
  // curved hook approximated in three bends
  const bend1 = cyl(0.045, 0.045, 0.45, IRON, 5);
  bend1.position.set(0.14, 2.0, 0);
  bend1.rotation.z = -0.7;
  g.add(bend1);
  const bend2 = cyl(0.04, 0.04, 0.4, IRON, 5);
  bend2.position.set(0.42, 2.08, 0);
  bend2.rotation.z = -1.6;
  g.add(bend2);
  const bend3 = cyl(0.035, 0.035, 0.3, IRON, 5);
  bend3.position.set(0.62, 1.96, 0);
  bend3.rotation.z = -2.4;
  g.add(bend3);
  const tipBall = ball(0.05, 0xd8b13a, 1, 5);
  tipBall.position.set(0.7, 1.85, 0);
  g.add(tipBall);
  // crown plate the tubes hang from
  const string0 = cyl(0.015, 0.015, 0.22, 0xc9b17e, 4);
  string0.position.set(0.56, 1.72, 0);
  g.add(string0);
  const crown = cyl(0.22, 0.22, 0.05, P.woodLight, 7);
  crown.position.set(0.56, 1.6, 0);
  g.add(crown);
  // five tubes of different lengths around the crown
  const lens = [0.55, 0.42, 0.68, 0.48, 0.6];
  const tubeShades = [0xd8b13a, 0xc9a25e, 0xd8b13a, 0xb9b4a8, 0xc9a25e];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const tx = 0.56 + Math.cos(a) * 0.15;
    const tz = Math.sin(a) * 0.15;
    const str = cyl(0.012, 0.012, 0.12, 0xc9b17e, 4);
    str.position.set(tx, 1.52, tz);
    g.add(str);
    const tube = cyl(0.035, 0.035, lens[i], tubeShades[i], 6);
    tube.position.set(tx, 1.46 - lens[i] / 2, tz);
    tube.rotation.z = (i === 2 ? 0.12 : 0);
    g.add(tube);
  }
  // center striker + wind-catcher tag swinging out
  const striker = ball(0.06, P.woodDark, 0.9, 5);
  striker.position.set(0.56, 1.15, 0);
  g.add(striker);
  const tagStr = cyl(0.012, 0.012, 0.3, 0xc9b17e, 4);
  tagStr.position.set(0.62, 0.98, 0.04);
  tagStr.rotation.z = -0.25;
  g.add(tagStr);
  const tag = box(0.16, 0.22, 0.03, P.woodLight);
  tag.position.set(0.68, 0.8, 0.06);
  tag.rotation.y = 0.4;
  g.add(tag);
  return g;
}

// 🔥 Campfire Area — stone ring ablaze, three log benches, marshmallow at the ready
function campfireArea() {
  const g = new THREE.Group();
  // fire ring
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const rock = ball(0.22 + (i % 2) * 0.06, i % 2 ? P.stone : 0x8a8177, 0.8, 6);
    rock.position.set(Math.cos(a) * 0.85, 0.16, Math.sin(a) * 0.85);
    g.add(rock);
  }
  const ash = cyl(0.68, 0.78, 0.08, 0x3a332c, 9);
  ash.position.y = 0.05;
  g.add(ash);
  for (let i = 0; i < 3; i++) {
    const log = cyl(0.1, 0.12, 1.15, 0x6b4423, 6);
    log.position.y = 0.22;
    log.rotation.z = Math.PI / 2 - 0.35;
    log.rotation.y = (i / 3) * Math.PI * 2 + 0.5;
    g.add(log);
  }
  // flames + glow, wired into the shared flicker
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.9, 6), new THREE.MeshStandardMaterial({
    color: 0xff9d2e, emissive: 0xff7a1a, emissiveIntensity: 1.3, roughness: 0.6, flatShading: true,
  }));
  flame.position.y = 0.72;
  g.add(flame);
  const flame2 = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.55, 5), new THREE.MeshStandardMaterial({
    color: 0xffd75a, emissive: 0xffc23a, emissiveIntensity: 1.5, roughness: 0.6, flatShading: true,
  }));
  flame2.position.set(0.13, 0.58, 0.08);
  g.add(flame2);
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), new THREE.MeshBasicMaterial({
    color: 0xffb03a, transparent: true, opacity: 0.22, depthWrite: false,
  }));
  glow.position.y = 0.68;
  g.add(glow);
  // three log benches ringed around the fire
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.35;
    const bx = Math.cos(a) * 1.85, bz = Math.sin(a) * 1.85;
    const seat = cyl(0.17, 0.19, 1.5, P.wood, 7);
    seat.position.set(bx, 0.3, bz);
    seat.rotation.z = Math.PI / 2;
    seat.rotation.y = -a + Math.PI / 2;
    g.add(seat);
    for (const s of [-0.5, 0.5]) {
      const foot = cyl(0.1, 0.12, 0.24, P.woodDark, 6);
      foot.position.set(bx - Math.sin(a) * s, 0.1, bz + Math.cos(a) * s);
      g.add(foot);
    }
  }
  // marshmallow stick leaning on a bench
  const stick = cyl(0.025, 0.03, 1.3, P.woodDark, 5);
  stick.position.set(0.95, 0.55, 1.15);
  stick.rotation.z = 0.7;
  stick.rotation.y = 0.5;
  g.add(stick);
  const mallow = ball(0.09, 0xf7efdd, 0.85, 5);
  mallow.position.set(0.5, 0.95, 0.9);
  g.add(mallow);
  const toasted = ball(0.05, 0xc98d4e, 0.8, 4);
  toasted.position.set(0.45, 1.0, 0.87);
  g.add(toasted);
  g.userData.anim = { kind: 'lantern', glow, flame };
  return g;
}

// 🎃 Seasonal Decorations — pumpkin pile, bunting between poles, a wrapped gift
function seasonalDecorations() {
  const g = new THREE.Group();
  // two short poles carrying the bunting
  for (const s of [-1, 1]) {
    const pole = cyl(0.05, 0.07, 1.3, P.woodDark, 5);
    pole.position.set(s * 1.0, 0.65, -0.3);
    g.add(pole);
    const knob = ball(0.06, 0xd8b13a, 1, 5);
    knob.position.set(s * 1.0, 1.32, -0.3);
    g.add(knob);
  }
  // sagging string + pennant flags
  const flagCols = [0xe85a6a, 0xe8b93a, 0x5a8fd4, 0x7ec850, 0xf2a6c8];
  for (let i = 0; i < 5; i++) {
    const t = (i + 0.5) / 5;
    const fx = -1.0 + t * 2.0;
    const sag = Math.sin(t * Math.PI) * 0.22;
    const seg = cyl(0.012, 0.012, 0.42, 0xc9b17e, 4);
    seg.position.set(fx, 1.26 - sag * 0.8, -0.3);
    seg.rotation.z = Math.PI / 2 + Math.cos(t * Math.PI) * 0.35;
    g.add(seg);
    const flag = cone(0.09, 0.22, flagCols[i], 4);
    flag.position.set(fx, 1.1 - sag, -0.3);
    flag.rotation.x = Math.PI;
    g.add(flag);
  }
  // pumpkin pile up front
  const pumpkinSpots = [[-0.55, 0.24, 0.35, 0.3], [0.15, 0.2, 0.5, 0.26], [-0.2, 0.55, 0.42, 0.2]];
  for (const [px, py, pz, pr] of pumpkinSpots) {
    const pk = ball(pr, 0xe07b28, 0.72, 8);
    pk.position.set(px, py, pz);
    g.add(pk);
    const crease = ball(pr * 0.96, 0xc9661f, 0.74, 6);
    crease.position.set(px, py, pz);
    crease.scale.x = 0.6;
    g.add(crease);
    const stem = cyl(0.035, 0.05, 0.14, P.stem, 5);
    stem.position.set(px, py + pr * 0.72 + 0.05, pz);
    stem.rotation.z = 0.2;
    g.add(stem);
  }
  // wrapped gift beside the pile
  const gift = box(0.42, 0.38, 0.42, 0xb03a4a);
  gift.position.set(0.85, 0.19, 0.4);
  gift.rotation.y = 0.35;
  g.add(gift);
  const ribbonA = box(0.44, 0.4, 0.09, 0xf2d24a);
  ribbonA.position.set(0.85, 0.19, 0.4);
  ribbonA.rotation.y = 0.35;
  g.add(ribbonA);
  const ribbonB = box(0.09, 0.4, 0.44, 0xf2d24a);
  ribbonB.position.set(0.85, 0.19, 0.4);
  ribbonB.rotation.y = 0.35;
  g.add(ribbonB);
  const bow = ball(0.09, 0xf2d24a, 0.6, 5);
  bow.position.set(0.85, 0.42, 0.4);
  g.add(bow);
  // stray gourd rolled loose
  const gourd = ball(0.14, 0xd9b45c, 0.85, 6);
  gourd.position.set(0.45, 0.13, 0.85);
  gourd.scale.x = 1.35;
  g.add(gourd);
  return g;
}

// 🦋 Butterfly Garden — trellis arch over a riot of blooms, butterflies aloft
function butterflyGarden() {
  const g = new THREE.Group();
  const AW = 1.4, AH = 2.3;
  // trellis arch: two lattice posts + arched top
  for (const s of [-1, 1]) {
    const post = box(0.12, AH, 0.12, P.woodLight);
    post.position.set(s * AW, AH / 2, 0);
    g.add(post);
    for (let i = 0; i < 3; i++) {
      const rung = box(0.34, 0.06, 0.06, P.wood);
      rung.position.set(s * AW, 0.5 + i * 0.6, 0);
      g.add(rung);
    }
    // climbing vine on each post
    const vine = cyl(0.04, 0.05, AH * 0.8, P.stem, 5);
    vine.position.set(s * (AW - 0.1), AH * 0.4, 0.08);
    vine.rotation.z = s * 0.08;
    g.add(vine);
    for (let i = 0; i < 3; i++) {
      const leafBall = ball(0.13, i % 2 ? P.leaf : P.leafLight, 0.85, 5);
      leafBall.position.set(s * (AW - 0.08 - i * 0.06), 0.7 + i * 0.55, 0.12);
      g.add(leafBall);
    }
  }
  // arched top from three angled segments
  const archSegs = [[-0.85, 2.5, 0.55], [0, 2.72, 0], [0.85, 2.5, -0.55]];
  for (const [ax, ay, rz] of archSegs) {
    const seg = box(0.95, 0.11, 0.12, P.woodLight);
    seg.position.set(ax, ay, 0);
    seg.rotation.z = rz;
    g.add(seg);
  }
  const crownBloom = ball(0.12, 0xf2a6c8, 0.8, 5);
  crownBloom.position.set(0, 2.8, 0);
  g.add(crownBloom);
  // flower riot flanking the arch
  const petals = [0xe85a6a, 0xe8b93a, 0xb89be6, 0xf2a6c8, 0xf7efdd];
  const spots = [[-1.0, 0.75], [-0.5, 0.55], [0.55, 0.6], [1.05, 0.8], [0, 0.5], [-1.35, 0.4], [1.35, 0.45]];
  spots.forEach(([fx, fz], i) => {
    const bush = ball(0.24 + (i % 2) * 0.07, i % 2 ? P.leaf : P.leafDark, 0.85, 6);
    bush.position.set(fx, 0.22, fz);
    g.add(bush);
    const stem = cyl(0.02, 0.025, 0.35, P.stem, 4);
    stem.position.set(fx, 0.45, fz);
    g.add(stem);
    const bloom = ball(0.1, petals[i % 5], 0.8, 5);
    bloom.position.set(fx, 0.64, fz);
    g.add(bloom);
  });
  // butterflies: chunky body + two angled wing slabs each
  const flutter = [
    [0.5, 1.6, 0.4, 0xe8763a, 0.35],
    [-0.7, 1.1, 0.6, 0x5a8fd4, -0.5],
    [0.1, 2.15, 0.3, 0xf2d24a, 0.9],
  ];
  for (const [bx, by, bz, col, ry] of flutter) {
    const body = cyl(0.025, 0.035, 0.16, 0x2c2c2a, 5);
    body.position.set(bx, by, bz);
    body.rotation.x = Math.PI / 2;
    body.rotation.z = ry;
    g.add(body);
    for (const s of [-1, 1]) {
      const wing = box(0.16, 0.015, 0.13, col);
      wing.position.set(bx + Math.cos(ry) * s * 0.09, by + 0.04, bz - Math.sin(ry) * s * 0.09);
      wing.rotation.y = ry;
      wing.rotation.x = s * 0.55;
      g.add(wing);
      const spot = box(0.06, 0.02, 0.05, 0xf7efdd);
      spot.position.set(bx + Math.cos(ry) * s * 0.12, by + 0.06, bz - Math.sin(ry) * s * 0.12);
      spot.rotation.y = ry;
      spot.rotation.x = s * 0.55;
      g.add(spot);
    }
  }
  return g;
}

export const INFRA_MODELS_B = {
  eco_birdhouse: birdhouse,
  eco_bench: bench,
  eco_flower_bed: flowerBed,
  eco_garden_path: gardenPath,
  eco_bat_house: batHouse,
  eco_bee_hotel: beeHotel,
  eco_wind_chimes: windChimes,
  eco_campfire_area: campfireArea,
  eco_seasonal_decorations: seasonalDecorations,
  eco_butterfly_garden: butterflyGarden,
};
