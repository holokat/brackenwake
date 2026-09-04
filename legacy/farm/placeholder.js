// Placeholder builders for infrastructure assets that don't have real models yet.
// Every placeholder gets a category-shaped silhouette, deterministic per-asset
// variation, a tier trim band, and an emoji sign so 300 assets stay readable.

import * as THREE from 'three';
import { mat, mesh, box, cyl, cone, ball, tube, glowTexture, mulberry32, P } from './assets.js';

// ---------- deterministic seed ----------

function idHash(str) {
  let h = 0x811c9dc5;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// ---------- size + footprint tables ----------

const SIZE = { xs: 1.2, s: 2.5, m: 4.5, l: 7, xl: 10 };
const RADIUS = { xs: 0.9, s: 1.6, m: 2.8, l: 4.2, xl: 6 };

function catKey(asset) {
  return String(asset.cat || asset.id || '').split('_')[0];
}

// ---------- biome tint ----------

const _c = new THREE.Color();
const _t = new THREE.Color();

function tintFor(biome) {
  if (biome === 'desert') return (hex) => {
    _c.setHex(hex); _t.setHex(0xd9a05a);
    return _c.lerp(_t, 0.16).getHex();
  };
  if (biome === 'boreal') return (hex) => {
    _c.setHex(hex); _t.setHex(0x6f93b8);
    return _c.lerp(_t, 0.14).getHex();
  };
  return (hex) => hex;
}

// ---------- emoji sign ----------

function emojiSprite(icon) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.font = '48px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(icon || '❔', 32, 36);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sprite.scale.setScalar(1.4);
  return sprite;
}

function addIconSign(g, asset, S) {
  const x = Math.min(S * 0.5, 4.5) + 0.4;
  const z = Math.min(S * 0.5, 4.5) + 0.3;
  const post = cyl(0.07, 0.09, 0.9, P.woodDark, 5);
  post.position.set(x, 0.45, z);
  g.add(post);
  const board = box(0.85, 0.55, 0.1, P.wood);
  board.position.set(x, 1.0, z);
  g.add(board);
  const sprite = emojiSprite(asset.icon);
  sprite.position.set(x, 1.6, z);
  g.add(sprite);
}

// ---------- tier trim ----------

function addTierTrim(g, tier, S) {
  const colors = { 1: P.wood, 2: 0xb87333, 3: 0xc4c8ce, 4: P.gold, 5: 0x4fe3e0 };
  const opts = tier === 5
    ? { emissive: 0x2fd8d5, emissiveIntensity: 0.9 }
    : tier >= 2 ? { metalness: 0.45, roughness: 0.45 } : {};
  const band = mesh(
    new THREE.TorusGeometry(S * 0.42, 0.05 + S * 0.012, 4, 14),
    mat(colors[tier] || P.wood, opts)
  );
  band.rotation.x = Math.PI / 2;
  band.position.y = 0.14 + S * 0.02;
  g.add(band);
}

// ---------- category builders ----------
// Each builder receives (g, S, rng, T, asset) — group, size scale, seeded rng,
// biome tint fn — and must keep the base at y=0, facing +z.

function v(rng, base) { return base * (0.8 + rng() * 0.4); } // ±20%

const ACCENTS = [0xc23b2e, 0x3f7fc2, 0xd9a93b, 0x5fae43, 0x8c5b7a, 0xe07e1f];
function accent(rng) { return ACCENTS[Math.floor(rng() * ACCENTS.length)]; }

function bWater(g, S, rng, T) {
  const r = v(rng, S * 0.3), h = v(rng, S * 0.62);
  const tank = cyl(r, r * 1.05, h, T(0x7f97a8), 10);
  tank.position.y = h / 2;
  g.add(tank);
  const water = cyl(r * 0.86, r * 0.86, 0.08, P.water, 10, { roughness: 0.2 });
  water.position.y = h + 0.04;
  g.add(water);
  const pr = Math.max(0.06, S * 0.035);
  const pipeV = cyl(pr, pr, h * 0.7, T(0x5f707c), 6);
  pipeV.position.set(r * 0.9, h * 0.35, r * 0.5);
  g.add(pipeV);
  const pipeH = cyl(pr, pr, r * 0.9, T(0x5f707c), 6);
  pipeH.rotation.x = Math.PI / 2;
  pipeH.position.set(r * 0.9, h * 0.7, r * 0.5 + r * 0.45);
  g.add(pipeH);
  const trough = box(S * 0.5, S * 0.12, S * 0.2, T(P.wood));
  trough.position.set(-r * 0.9, S * 0.06, r * 0.8);
  g.add(trough);
}

function bField(g, S, rng, T, asset) {
  const w = v(rng, S * 0.9), d = v(rng, S * 0.8), fh = S * 0.09;
  for (const [x, z, bw, bd] of [
    [0, d / 2, w, fh * 1.2], [0, -d / 2, w, fh * 1.2],
    [w / 2, 0, fh * 1.2, d], [-w / 2, 0, fh * 1.2, d],
  ]) {
    const rail = box(bw, fh, bd, T(P.wood));
    rail.position.set(x, fh / 2, z);
    g.add(rail);
  }
  const soil = box(w * 0.92, fh * 0.6, d * 0.92, T(P.soil));
  soil.position.y = fh * 0.3;
  g.add(soil);
  const rows = 3;
  for (let i = 0; i < rows; i++) {
    const row = box(w * 0.8, fh * 0.9, d * 0.14, T(i % 2 ? P.leaf : P.leafLight));
    row.position.set(0, fh * 0.9, (i - (rows - 1) / 2) * d * 0.26);
    g.add(row);
  }
  if (/green|house|dome|tunnel|glass/i.test(asset.name || '')) {
    const arch = mesh(
      new THREE.CylinderGeometry(d * 0.55, d * 0.55, w * 0.95, 9, 1, true, 0, Math.PI),
      mat(0xf5f8fa, { transparent: true, opacity: 0.35, side: THREE.DoubleSide, roughness: 0.35 })
    );
    arch.rotation.z = Math.PI / 2;
    arch.position.y = fh;
    g.add(arch);
  }
}

function bStorage(g, S, rng, T) {
  const w = v(rng, S * 0.8), h = v(rng, S * 0.55), d = v(rng, S * 0.7);
  const body = box(w, h, d, T(rng() > 0.5 ? P.barnRed : P.plaster));
  body.position.y = h / 2;
  g.add(body);
  const roof = cone(w * 0.78, h * 0.5, T(rng() > 0.5 ? P.capRed : P.woodDark), 4);
  roof.rotation.y = Math.PI / 4;
  roof.scale.z = d / w;
  roof.position.y = h + h * 0.25;
  g.add(roof);
  const door = box(w * 0.42, h * 0.62, 0.08, T(P.woodDark));
  door.position.set(0, h * 0.31, d / 2 + 0.04);
  g.add(door);
}

function bLivestock(g, S, rng, T) {
  const w = v(rng, S * 0.6), h = v(rng, S * 0.45), d = v(rng, S * 0.55);
  const hut = box(w, h, d, T(accent(rng)));
  hut.position.y = h / 2 + S * 0.06;
  g.add(hut);
  const roof = cone(w * 0.8, h * 0.45, T(P.woodDark), 4);
  roof.rotation.y = Math.PI / 4;
  roof.scale.z = d / w;
  roof.position.y = h + S * 0.06 + h * 0.22;
  g.add(roof);
  const hole = cyl(w * 0.16, w * 0.16, 0.1, 0x3a2a12, 8);
  hole.rotation.x = Math.PI / 2;
  hole.position.set(0, h * 0.45 + S * 0.06, d / 2 + 0.04);
  g.add(hole);
  const ramp = box(w * 0.3, 0.06, d * 0.9, T(P.woodLight));
  ramp.position.set(0, S * 0.06, d / 2 + d * 0.35);
  ramp.rotation.x = 0.32;
  g.add(ramp);
  for (let i = 0; i < 3; i++) {
    const straw = ball(S * 0.08, 0xe8c86a, 0.5, 6);
    straw.position.set((rng() - 0.5) * w, S * 0.04, d / 2 + d * 0.55 + (rng() - 0.5) * d * 0.3);
    g.add(straw);
  }
}

function bProcessing(g, S, rng, T) {
  const w = v(rng, S * 0.75), h = v(rng, S * 0.5), d = v(rng, S * 0.65);
  const body = box(w, h, d, T(0x9a8f80));
  body.position.y = h / 2;
  g.add(body);
  const roof = box(w * 1.08, h * 0.14, d * 1.08, T(accent(rng)));
  roof.position.y = h + h * 0.07;
  g.add(roof);
  const chim = cyl(S * 0.06, S * 0.075, h * 0.8, T(0x5a5148), 7);
  chim.position.set(w * 0.3, h + h * 0.35, -d * 0.25);
  g.add(chim);
  const bench = box(w * 0.55, h * 0.28, d * 0.3, T(P.woodLight));
  bench.position.set(-w * 0.15, h * 0.14, d / 2 + d * 0.22);
  g.add(bench);
  const gear = mesh(new THREE.TorusGeometry(S * 0.1, S * 0.035, 4, 8), mat(0xb87333, { metalness: 0.5, roughness: 0.4 }));
  gear.position.set(w * 0.28, h * 0.32, d / 2 + d * 0.22);
  g.add(gear);
}

function bMachine(g, S, rng, T, asset) {
  if ((asset.tier || 1) <= 1) {
    // tool rack for tier 1
    for (const x of [-S * 0.35, S * 0.35]) {
      const post = cyl(S * 0.035, S * 0.045, S * 0.55, T(P.woodDark), 5);
      post.position.set(x, S * 0.275, 0);
      g.add(post);
    }
    for (let i = 0; i < 2; i++) {
      const shelf = box(S * 0.8, S * 0.05, S * 0.24, T(P.wood));
      shelf.position.y = S * (0.22 + i * 0.24);
      g.add(shelf);
    }
    const tool = box(S * 0.1, S * 0.3, S * 0.06, accent(rng));
    tool.position.set(0, S * 0.42, S * 0.06);
    tool.rotation.z = 0.3;
    g.add(tool);
    return;
  }
  const bw = v(rng, S * 0.75), bh = v(rng, S * 0.32), bd = v(rng, S * 0.45);
  const body = box(bw, bh, bd, T(accent(rng)), { roughness: 0.5, metalness: 0.15 });
  body.position.y = S * 0.18 + bh / 2;
  g.add(body);
  const cab = box(bw * 0.4, bh * 0.8, bd * 0.85, T(0x3a3a40), { roughness: 0.5 });
  cab.position.set(-bw * 0.22, S * 0.18 + bh + bh * 0.4, 0);
  g.add(cab);
  const wr = S * 0.12;
  for (const [x, z] of [[-bw * 0.3, -bd * 0.55], [-bw * 0.3, bd * 0.55], [bw * 0.3, -bd * 0.55], [bw * 0.3, bd * 0.55]]) {
    const wheel = cyl(wr, wr, wr * 0.6, 0x2b2b30, 10, { roughness: 0.8 });
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(x, wr, z);
    g.add(wheel);
  }
}

function bLogistics(g, S, rng, T) {
  const w = v(rng, S * 0.85), d = v(rng, S * 0.7), dh = S * 0.16;
  for (const [x, z] of [[-w * 0.4, -d * 0.4], [w * 0.4, -d * 0.4], [-w * 0.4, d * 0.4], [w * 0.4, d * 0.4]]) {
    const post = cyl(S * 0.04, S * 0.05, dh, T(P.woodDark), 5);
    post.position.set(x, dh / 2, z);
    g.add(post);
  }
  const deck = box(w, S * 0.05, d, T(P.woodLight));
  deck.position.y = dh;
  g.add(deck);
  const crate = box(S * 0.22, S * 0.22, S * 0.22, T(P.wood));
  crate.position.set(-w * 0.2, dh + S * 0.13, 0);
  g.add(crate);
  const pole = cyl(S * 0.03, S * 0.04, S * 0.6, T(P.woodDark), 5);
  pole.position.set(w * 0.32, dh + S * 0.3, d * 0.2);
  g.add(pole);
  const arrow = box(S * 0.3, S * 0.1, 0.05, accent(rng));
  arrow.position.set(w * 0.32 + S * 0.1, dh + S * 0.5, d * 0.2);
  arrow.rotation.y = (rng() - 0.5) * 0.8;
  g.add(arrow);
}

function bEnergy(g, S, rng, T, asset) {
  const name = asset.name || asset.id || '';
  if (/wind|turbine/i.test(name)) {
    // real wind turbines tower over houses & the windmill (~15.6u) — build tall,
    // at an absolute height rather than the small placeholder size
    const mh = 24;
    const mast = cyl(0.34, 0.62, mh, 0xe8e8ea, 8);
    mast.position.y = mh / 2;
    g.add(mast);
    const nacelle = box(1.5, 0.9, 0.9, 0xdedee2);
    nacelle.position.set(0, mh, 0.1);
    g.add(nacelle);
    const hub = ball(0.5, 0xd0d0d4, 1, 6);
    hub.position.set(0, mh, 0.72);
    g.add(hub);
    const blades = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      const blade = box(0.55, 10.5, 0.16, 0xf2f2f4);
      blade.position.set(-Math.sin(a) * 5.2, Math.cos(a) * 5.2, 0);
      blade.rotation.z = a;
      blades.add(blade);
    }
    blades.position.set(0, mh, 0.95);
    g.add(blades);
    g.userData.spin = blades;
  } else if (/solar|panel|photo/i.test(name)) {
    const pole = cyl(S * 0.04, S * 0.055, S * 0.4, 0x6a6a70, 6);
    pole.position.y = S * 0.2;
    g.add(pole);
    const panel = box(S * 0.8, 0.06, S * 0.55, 0x24344e, { roughness: 0.25, metalness: 0.3 });
    panel.position.y = S * 0.42;
    panel.rotation.x = -0.5;
    g.add(panel);
    const frame = box(S * 0.84, 0.04, S * 0.59, 0xc4c8ce, { metalness: 0.4, roughness: 0.4 });
    frame.position.y = S * 0.41;
    frame.rotation.x = -0.5;
    g.add(frame);
  } else {
    const base = box(S * 0.55, S * 0.35, S * 0.45, T(0x5a5148), { roughness: 0.6 });
    base.position.y = S * 0.175;
    g.add(base);
    for (let i = 0; i < 3; i++) {
      const coil = mesh(new THREE.TorusGeometry(S * 0.14, S * 0.035, 5, 10), mat(0xb87333, { metalness: 0.5, roughness: 0.45 }));
      coil.rotation.x = Math.PI / 2;
      coil.position.y = S * (0.4 + i * 0.09);
      g.add(coil);
    }
    const tip = ball(S * 0.06, 0xf2c318, 1, 6, { emissive: 0xc79a10, emissiveIntensity: 0.6 });
    tip.position.y = S * 0.68;
    g.add(tip);
  }
}

function bSoil(g, S, rng, T) {
  const w = v(rng, S * 0.75), fh = S * 0.18;
  for (const [x, z, bw, bd] of [
    [0, w / 2, w, 0.1], [0, -w / 2, w, 0.1], [w / 2, 0, 0.1, w], [-w / 2, 0, 0.1, w],
  ]) {
    const wall = box(bw, fh, bd, T(P.woodDark));
    wall.position.set(x, fh / 2, z);
    g.add(wall);
  }
  const mound = ball(w * 0.42, T(0x4a3320), 0.6, 8);
  mound.position.y = fh * 0.7;
  g.add(mound);
  const fleck = ball(w * 0.1, T(0x6b4629), 0.5, 5);
  fleck.position.set(w * 0.18, fh * 1.1, -w * 0.1);
  g.add(fleck);
  if (rng() > 0.45) {
    const steam = tube([
      new THREE.Vector3(0, fh + w * 0.25, 0),
      new THREE.Vector3(w * 0.08, fh + w * 0.45, w * 0.05),
      new THREE.Vector3(-w * 0.04, fh + w * 0.65, 0),
    ], w * 0.045, 0xd9d9d9);
    steam.material.transparent = true;
    steam.material.opacity = 0.5;
    g.add(steam);
  }
}

function bWorkshop(g, S, rng, T) {
  const w = v(rng, S * 0.8), d = v(rng, S * 0.7), ph = v(rng, S * 0.55);
  for (const [x, z] of [[-w * 0.42, -d * 0.42], [w * 0.42, -d * 0.42], [-w * 0.42, d * 0.42], [w * 0.42, d * 0.42]]) {
    const post = cyl(S * 0.035, S * 0.05, ph, T(P.woodDark), 6);
    post.position.set(x, ph / 2, z);
    g.add(post);
  }
  const roof = box(w, S * 0.06, d, T(accent(rng)));
  roof.position.y = ph + S * 0.03;
  roof.rotation.z = 0.06;
  g.add(roof);
  const block = box(w * 0.28, ph * 0.4, d * 0.3, T(P.woodLight));
  block.position.set(0, ph * 0.2, 0);
  g.add(block);
  const anvil = box(w * 0.22, ph * 0.12, d * 0.14, 0x4a4640, { metalness: 0.4, roughness: 0.5 });
  anvil.position.set(0, ph * 0.46, 0);
  g.add(anvil);
}

function bWorker(g, S, rng, T) {
  const w = v(rng, S * 0.65), h = v(rng, S * 0.5), d = v(rng, S * 0.6);
  const body = box(w, h, d, T(rng() > 0.5 ? P.plaster : 0xe0cdb0));
  body.position.y = h / 2;
  g.add(body);
  const roof = cone(w * 0.78, h * 0.55, T(rng() > 0.5 ? P.capRed : 0x7a6a50), 4);
  roof.rotation.y = Math.PI / 4;
  roof.scale.z = d / w;
  roof.position.y = h + h * 0.27;
  g.add(roof);
  const door = box(w * 0.24, h * 0.5, 0.07, T(P.woodDark));
  door.position.set(-w * 0.18, h * 0.25, d / 2 + 0.035);
  g.add(door);
  const win = box(w * 0.2, h * 0.2, 0.06, 0xbfe3f0, { roughness: 0.3 });
  win.position.set(w * 0.22, h * 0.6, d / 2 + 0.03);
  g.add(win);
  const chim = box(w * 0.14, h * 0.5, w * 0.14, T(0x8a8078));
  chim.position.set(w * 0.28, h + h * 0.3, -d * 0.2);
  g.add(chim);
}

function bCommerce(g, S, rng, T) {
  const w = v(rng, S * 0.8), d = v(rng, S * 0.55);
  const counter = box(w, S * 0.3, d * 0.5, T(P.wood));
  counter.position.set(0, S * 0.15, d * 0.25);
  g.add(counter);
  const ph = S * 0.62;
  for (const x of [-w * 0.45, w * 0.45]) {
    const post = cyl(S * 0.03, S * 0.04, ph, T(P.woodDark), 5);
    post.position.set(x, ph / 2, -d * 0.2);
    g.add(post);
  }
  const awning = box(w * 1.05, 0.06, d * 0.85, accent(rng));
  awning.position.set(0, ph, d * 0.1);
  awning.rotation.x = 0.24;
  g.add(awning);
  const goods = ball(S * 0.09, accent(rng), 0.9, 6);
  goods.position.set(-w * 0.2, S * 0.36, d * 0.25);
  g.add(goods);
  const goods2 = box(S * 0.14, S * 0.1, S * 0.14, T(P.woodLight));
  goods2.position.set(w * 0.2, S * 0.35, d * 0.25);
  g.add(goods2);
}

function bAqua(g, S, rng, T) {
  const w = v(rng, S * 0.85);
  for (const [x, z, bw, bd] of [
    [0, w / 2, w, 0.12], [0, -w / 2, w, 0.12], [w / 2, 0, 0.12, w], [-w / 2, 0, 0.12, w],
  ]) {
    const rail = box(bw, S * 0.1, bd, T(P.wood));
    rail.position.set(x, S * 0.05, z);
    g.add(rail);
  }
  const water = cyl(w * 0.44, w * 0.44, 0.06, P.water, 14, { roughness: 0.2, transparent: true, opacity: 0.85 });
  water.position.y = S * 0.05;
  g.add(water);
  for (const x of [-w * 0.3, w * 0.3]) {
    const post = cyl(S * 0.025, S * 0.035, S * 0.45, T(P.woodDark), 5);
    post.position.set(x, S * 0.225, 0);
    g.add(post);
  }
  const net = box(w * 0.6, 0.03, 0.03, 0xd9d2c2);
  net.position.y = S * 0.42;
  g.add(net);
  const buoy = ball(S * 0.06, 0xe0263a, 1, 6);
  buoy.position.set(w * 0.15, S * 0.1, w * 0.15);
  g.add(buoy);
}

function bForestry(g, S, rng, T) {
  const lr = S * 0.11, ll = v(rng, S * 0.7);
  const logY = [[0, lr], [-lr * 1.9, lr], [lr * 1.9, lr], [-lr * 0.95, lr * 2.6], [lr * 0.95, lr * 2.6]];
  for (let i = 0; i < Math.min(5, 3 + Math.floor(rng() * 3)); i++) {
    const [x, y] = logY[i];
    const log = cyl(lr, lr, ll, T(P.woodDark), 8);
    log.rotation.z = Math.PI / 2;
    log.position.set(0, y, x * 0.9 - S * 0.15);
    g.add(log);
  }
  const stump = cyl(S * 0.14, S * 0.17, S * 0.2, T(P.wood), 9);
  stump.position.set(S * 0.32, S * 0.1, S * 0.3);
  g.add(stump);
  const blade = cyl(S * 0.14, S * 0.14, 0.05, 0xc4c8ce, 12, { metalness: 0.55, roughness: 0.35 });
  blade.rotation.x = Math.PI / 2;
  blade.position.set(S * 0.32, S * 0.32, S * 0.3);
  g.add(blade);
}

function bProtection(g, S, rng, T) {
  const w = v(rng, S * 0.85), h = v(rng, S * 0.42);
  const wall = box(w, h, S * 0.12, T(0x8a8278));
  wall.position.set(0, h / 2, -S * 0.1);
  g.add(wall);
  for (const x of [-w * 0.45, w * 0.45]) {
    const post = cyl(S * 0.05, S * 0.06, h * 1.35, T(P.woodDark), 6);
    post.position.set(x, h * 0.675, -S * 0.1);
    g.add(post);
  }
  const bar = box(w, S * 0.06, S * 0.06, T(P.wood));
  bar.position.set(0, h * 1.15, -S * 0.1);
  g.add(bar);
  const shield = cyl(S * 0.16, S * 0.2, 0.07, accent(rng), 6);
  shield.rotation.x = Math.PI / 2 - 0.35;
  shield.position.set(0, h * 0.55, S * 0.18);
  g.add(shield);
  const boss = ball(S * 0.05, P.gold, 1, 6, { metalness: 0.4, roughness: 0.4 });
  boss.position.set(0, h * 0.57, S * 0.24);
  g.add(boss);
}

function bScience(g, S, rng, T) {
  const w = v(rng, S * 0.6), h = v(rng, S * 0.45);
  const body = box(w, h, w * 0.9, 0xf0f2f4, { roughness: 0.5, metalness: 0.15 });
  body.position.y = h / 2;
  g.add(body);
  const stripe = box(w * 1.02, h * 0.16, w * 0.92, 0xb9c2cc, { metalness: 0.3, roughness: 0.45 });
  stripe.position.y = h * 0.5;
  g.add(stripe);
  if (rng() > 0.5) {
    const dish = ball(w * 0.32, 0xe4e8ec, 0.42, 8, { side: THREE.DoubleSide });
    dish.position.set(-w * 0.15, h + w * 0.18, 0);
    dish.rotation.x = -0.7;
    g.add(dish);
  } else {
    const mast = cyl(0.04, 0.05, h * 0.8, 0x9aa2aa, 5);
    mast.position.set(-w * 0.15, h + h * 0.4, 0);
    g.add(mast);
    const tip = ball(0.09, 0xd0d4d8, 1, 5);
    tip.position.set(-w * 0.15, h + h * 0.82, 0);
    g.add(tip);
  }
  const blink = ball(Math.max(0.08, w * 0.07), 0xff4a3c, 1, 6, { emissive: 0xff2a1c, emissiveIntensity: 1.2 });
  blink.position.set(w * 0.3, h + 0.12, w * 0.25);
  g.add(blink);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture('255,90,70'), transparent: true, opacity: 0.6, depthWrite: false,
  }));
  glow.scale.setScalar(0.8);
  glow.position.copy(blink.position);
  g.add(glow);
  g.userData.blink = blink;
}

function bEco(g, S, rng, T) {
  const w = v(rng, S * 0.6);
  const planter = box(w, S * 0.16, w * 0.55, T(P.wood));
  planter.position.y = S * 0.08;
  g.add(planter);
  const soil = box(w * 0.92, S * 0.06, w * 0.48, T(P.soil));
  soil.position.y = S * 0.17;
  g.add(soil);
  const flowerColors = [0xe0263a, 0xf5c518, 0xd465b8, 0xf2f2f4];
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * w * 0.28;
    const stem = cyl(0.03, 0.04, S * 0.22, P.stem, 4);
    stem.position.set(x, S * 0.28, 0);
    g.add(stem);
    const bloom = ball(S * 0.06, flowerColors[Math.floor(rng() * flowerColors.length)], 0.85, 6);
    bloom.position.set(x, S * 0.4, 0);
    g.add(bloom);
  }
  const pole = cyl(0.04, 0.05, S * 0.6, T(P.woodDark), 5);
  pole.position.set(w * 0.62, S * 0.3, -w * 0.15);
  g.add(pole);
  const bugBox = box(S * 0.18, S * 0.2, S * 0.12, T(P.woodLight));
  bugBox.position.set(w * 0.62, S * 0.62, -w * 0.15);
  g.add(bugBox);
  const hole = cyl(S * 0.03, S * 0.03, 0.08, 0x3a2a12, 6);
  hole.rotation.x = Math.PI / 2;
  hole.position.set(w * 0.62, S * 0.62, -w * 0.15 + S * 0.07);
  g.add(hole);
}

function bCapstone(g, S, rng, T) {
  const pw = S * 0.7;
  const plinth = box(pw, S * 0.12, pw, T(0x9a938a));
  plinth.position.y = S * 0.06;
  g.add(plinth);
  const plinth2 = box(pw * 0.72, S * 0.1, pw * 0.72, T(0xb0a89e));
  plinth2.position.y = S * 0.17;
  g.add(plinth2);
  for (const [x, z] of [[-pw * 0.32, -pw * 0.32], [pw * 0.32, -pw * 0.32], [-pw * 0.32, pw * 0.32], [pw * 0.32, pw * 0.32]]) {
    const pillar = cyl(S * 0.035, S * 0.045, S * 0.3, T(0xd8d2c6), 7);
    pillar.position.set(x, S * 0.22 + S * 0.15, z);
    g.add(pillar);
  }
  const th = v(rng, S * 0.68);
  const tower = cyl(S * 0.1, S * 0.2, th, T(accent(rng)), 8);
  tower.position.y = S * 0.22 + th / 2;
  g.add(tower);
  const crown = cone(S * 0.16, S * 0.18, P.gold, 8, { metalness: 0.4, roughness: 0.4 });
  crown.position.y = S * 0.22 + th + S * 0.09;
  g.add(crown);
  const orb = ball(S * 0.07, 0xfff0c0, 1, 7, { emissive: 0xd9a93b, emissiveIntensity: 0.8 });
  orb.position.y = S * 0.22 + th + S * 0.24;
  g.add(orb);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture('255,225,150'), transparent: true, opacity: 0.55, depthWrite: false,
  }));
  glow.scale.setScalar(S * 0.35);
  glow.position.copy(orb.position);
  g.add(glow);
}

const BUILDERS = {
  wat: bWater, fld: bField, sto: bStorage, liv: bLivestock, prc: bProcessing,
  mac: bMachine, log: bLogistics, enr: bEnergy, soil: bSoil, wrk: bWorkshop,
  wkr: bWorker, com: bCommerce, aqua: bAqua, for: bForestry, prot: bProtection,
  sci: bScience, eco: bEco, cap: bCapstone,
};

// ---------- public API ----------

export function buildPlaceholder(asset) {
  const g = new THREE.Group();
  const key = catKey(asset);
  const rng = mulberry32(idHash(asset.id));
  const T = tintFor(asset.biome);
  let S = SIZE[asset.size] || SIZE.m;
  if (key === 'cap') S = Math.min(14, S * 1.4);

  if (asset.biome === 'oceanside') {
    const sand = cyl(S * 0.62, S * 0.66, 0.07, 0xe0cfa0, 16);
    sand.position.y = 0.035;
    g.add(sand);
  }

  (BUILDERS[key] || bStorage)(g, S, rng, T, asset);
  addTierTrim(g, asset.tier || 1, S);
  addIconSign(g, asset, S);

  g.userData.placeholder = true;
  return g;
}

export function placeholderRadius(asset) {
  if (catKey(asset) === 'cap' && asset.size === 'xl') return 7.5;
  return RADIUS[asset.size] || RADIUS.m;
}

// ---------- construction site ----------
// Shown in place of a building while its build timer runs: dirt pad, corner
// stakes with rope, a scaffold frame, material piles, and a 🚧 sign.
export function buildConstructionSite(radius) {
  const g = new THREE.Group();
  const R = Math.max(1.6, radius);

  const pad = cyl(R * 1.15, R * 1.22, 0.16, 0x9a7a4e, 12);
  pad.position.y = 0.08;
  pad.receiveShadow = true;
  g.add(pad);

  // corner stakes + sagging rope line
  const cs = R * 0.95;
  const corners = [[-cs, -cs], [cs, -cs], [cs, cs], [-cs, cs]];
  for (const [x, z] of corners) {
    const stake = cyl(0.07, 0.09, 1.15, 0xc9b17e, 5);
    stake.position.set(x, 0.68, z);
    g.add(stake);
  }
  for (let i = 0; i < 4; i++) {
    const [ax, az] = corners[i], [bx, bz] = corners[(i + 1) % 4];
    const seg = box(Math.hypot(bx - ax, bz - az), 0.05, 0.05, 0xd8433a);
    seg.position.set((ax + bx) / 2, 1.05, (az + bz) / 2);
    seg.rotation.y = Math.atan2(bx - ax, bz - az) + Math.PI / 2;
    g.add(seg);
  }

  // scaffold: two frames of poles + planks
  for (const sx of [-R * 0.45, R * 0.45]) {
    for (const sz of [-R * 0.4, R * 0.4]) {
      const pole = cyl(0.08, 0.1, R * 1.1, P.woodDark, 5);
      pole.position.set(sx, R * 0.55, sz);
      g.add(pole);
    }
    const plank = box(0.5, 0.08, R * 0.95, P.wood);
    plank.position.set(sx, R * 0.62, 0);
    g.add(plank);
  }
  const cross = box(R * 1.05, 0.09, 0.09, P.wood);
  cross.position.y = R * 0.98;
  cross.rotation.z = 0.06;
  g.add(cross);

  // material piles: crate, plank stack, sand heap
  const crate = box(0.9, 0.9, 0.9, 0xb08948);
  crate.position.set(R * 0.62, 0.55, -R * 0.55);
  crate.rotation.y = 0.4;
  g.add(crate);
  for (let i = 0; i < 3; i++) {
    const pl = box(1.7, 0.14, 0.5, P.wood);
    pl.position.set(-R * 0.55, 0.24 + i * 0.15, R * 0.5);
    pl.rotation.y = 0.15 * (i % 2 ? 1 : -1);
    g.add(pl);
  }
  const heap = ball(0.75, 0xcfb475, 0.5, 7);
  heap.position.set(R * 0.5, 0.35, R * 0.55);
  g.add(heap);

  // 🚧 sign on a post
  const post = cyl(0.07, 0.09, 1.7, P.woodDark, 5);
  post.position.set(0, 0.95, R * 1.05);
  g.add(post);
  const signC = document.createElement('canvas');
  signC.width = signC.height = 64;
  const sg = signC.getContext('2d');
  sg.font = '48px serif';
  sg.textAlign = 'center';
  sg.textBaseline = 'middle';
  sg.fillText('🚧', 32, 36);
  const signTex = new THREE.CanvasTexture(signC);
  const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map: signTex, transparent: true, depthWrite: false }));
  sign.scale.setScalar(1.5);
  sign.position.set(0, 2.1, R * 1.05);
  g.add(sign);

  g.userData.constructionSite = true;
  return g;
}
