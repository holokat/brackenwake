// Theme library for the Homestead game — six island biomes, each with its own
// sky, palette, fog/light colors, and low-poly set-dressing built from assets.js.

import * as THREE from 'three';
import { mat, mesh, box, cyl, cone, ball, leafMesh, tube, glowTexture, P, tagFoliage } from './assets.js';

const MUSIC = '/audio/farm-theme.mp3';

// ---------- shared helpers ----------

// Try to place `count` scenery pieces via ctx.scatterPoint (which already
// avoids the gameplay area and the island edge band).
function scatter(ctx, count, place) {
  let placed = 0;
  for (let tries = 0; tries < count * 6 && placed < count; tries++) {
    const p = ctx.scatterPoint();
    if (!p) continue;
    place(p[0], p[1], placed);
    placed++;
  }
}

// A pool of small glow sprites that drift downward forever (snow / petals / leaves).
function fallingSprites(ctx, group, rgb, count, { size = 0.4, height = 12, speed = 1.4, sway = 0.9, opacity = 0.9 } = {}) {
  const tex = glowTexture(rgb);
  const parts = [];
  const w = ctx.islandW;
  const depth = ctx.zFront - ctx.zBack;
  for (let i = 0; i < count; i++) {
    const sMat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity, depthWrite: false });
    const s = new THREE.Sprite(sMat);
    s.scale.setScalar(size * (0.6 + ctx.rng() * 0.8));
    parts.push({
      s,
      x: (ctx.rng() - 0.5) * w,
      z: ctx.zBack + ctx.rng() * depth,
      phase: ctx.rng() * 100,
      rate: speed * (0.7 + ctx.rng() * 0.7),
    });
    group.add(s);
  }
  ctx.addAnimated((now) => {
    const t = now * 0.001;
    for (const p of parts) {
      const y = height - ((t * p.rate + p.phase) % height);
      p.s.position.set(p.x + Math.sin(t * 0.7 + p.phase) * sway, y, p.z + Math.cos(t * 0.5 + p.phase) * sway * 0.5);
      p.s.material.opacity = Math.min(1, y * 0.8) * opacity;
    }
  });
}

function flatDisc(r, color, y = 0.04, seg = 12) {
  const d = new THREE.Mesh(new THREE.CircleGeometry(r, seg), mat(color, { side: THREE.DoubleSide }));
  d.rotation.x = -Math.PI / 2;
  d.position.y = y;
  return d;
}

function placeAt(group, piece, x, z, rotY = 0, scale = 1) {
  piece.position.set(x, 0, z);
  piece.rotation.y = rotY;
  if (scale !== 1) piece.scale.setScalar(scale);
  group.add(piece);
  return piece;
}

// ---------- element builders (shared across themes) ----------

function buildBush(rng, c1, c2) {
  const g = new THREE.Group();
  const a = ball(0.7 + rng() * 0.3, c1, 0.8);
  a.position.y = 0.5;
  g.add(a);
  const b = ball(0.5 + rng() * 0.2, c2, 0.85);
  b.position.set(0.55, 0.4, 0.2);
  g.add(b);
  return g;
}

function buildBoulder(rng, color) {
  const g = new THREE.Group();
  const a = ball(0.7 + rng() * 0.5, color, 0.65, 7);
  a.position.y = 0.3;
  a.rotation.y = rng() * Math.PI;
  g.add(a);
  const b = ball(0.4 + rng() * 0.3, color, 0.6, 6);
  b.position.set(0.6, 0.18, 0.3);
  g.add(b);
  return g;
}

function buildPalm(rng, sway) {
  const g = new THREE.Group();
  const lean = 0.5 + rng() * 0.7;
  const top = new THREE.Vector3(lean, 3.4 + rng() * 0.6, lean * 0.2);
  g.add(tube([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(lean * 0.35, top.y * 0.4, lean * 0.06),
    new THREE.Vector3(lean * 0.75, top.y * 0.75, lean * 0.14),
    top,
  ], 0.22, P.woodDark));
  const crown = new THREE.Group();
  crown.position.copy(top);
  const n = 6;
  for (let i = 0; i < n; i++) {
    const pivot = new THREE.Group();
    pivot.rotation.y = (i / n) * Math.PI * 2 + rng() * 0.4;
    const frond = leafMesh(2.1 + rng() * 0.5, 0.55, i % 2 ? 0x3f9e4e : 0x358a44);
    frond.rotation.z = -(1.0 + rng() * 0.5);
    pivot.add(frond);
    crown.add(pivot);
  }
  for (let i = 0; i < 3; i++) {
    const nut = ball(0.2, 0x6d4a2c, 1, 6);
    nut.position.set(Math.cos(i * 2.1) * 0.3, -0.25, Math.sin(i * 2.1) * 0.3);
    crown.add(nut);
  }
  g.add(crown);
  if (sway) sway.push({ node: crown, base: crown.rotation.z, phase: rng() * 6 });
  return g;
}

// ============================================================
// MEADOW
// ============================================================

function meadowScenery(ctx) {
  const g = new THREE.Group();
  ctx.scene.add(g);
  const rng = ctx.rng;
  const canopies = [];

  const buildBirch = () => {
    const t = new THREE.Group();
    const trunk = cyl(0.16, 0.24, 3.0, 0xece9e0, 6);
    trunk.position.y = 1.5;
    t.add(trunk);
    for (let i = 0; i < 3; i++) {
      const band = box(0.4, 0.12, 0.26, 0x3c3a34);
      band.position.set(0.03, 0.7 + i * 0.85, 0);
      band.rotation.y = rng() * Math.PI;
      t.add(band);
    }
    const crown = new THREE.Group();
    crown.position.y = 3.3;
    const c1 = tagFoliage(ball(1.15, 0x8cc860, 0.85));
    crown.add(c1);
    const c2 = tagFoliage(ball(0.8, 0xa2d474, 0.9));
    c2.position.set(0.7, 0.35, 0.3);
    crown.add(c2);
    t.add(crown);
    canopies.push({ node: crown, phase: rng() * 6 });
    return t;
  };

  scatter(ctx, 6, (x, z) => placeAt(g, buildBirch(), x, z, rng() * Math.PI * 2, 1.6 + rng() * 0.6));
  scatter(ctx, 6, (x, z) => placeAt(g, buildBush(rng, P.leaf, P.leafLight), x, z, rng() * Math.PI * 2, 1.1 + rng() * 0.6));
  scatter(ctx, 3, (x, z) => {
    const cl = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const stem = cyl(0.08, 0.11, 0.4, 0xf0e6d2, 5);
      const cx = (rng() - 0.5) * 1.2, cz = (rng() - 0.5) * 1.2;
      stem.position.set(cx, 0.2, cz);
      cl.add(stem);
      const cap = ball(0.28 + rng() * 0.1, 0xd8433a, 0.6, 7);
      cap.position.set(cx, 0.44, cz);
      cl.add(cap);
    }
    placeAt(g, cl, x, z, rng() * Math.PI * 2);
  });
  scatter(ctx, 4, (x, z) => placeAt(g, buildBoulder(rng, P.stone), x, z, rng() * Math.PI * 2, 0.7 + rng() * 0.4));

  ctx.addAnimated((now) => {
    const t = now * 0.001;
    for (const c of canopies) {
      c.node.rotation.z = Math.sin(t * 0.8 + c.phase) * 0.05;
      c.node.rotation.x = Math.cos(t * 0.6 + c.phase) * 0.04;
    }
  });
}

// ============================================================
// OCEANSIDE
// ============================================================

function oceansideScenery(ctx) {
  const g = new THREE.Group();
  ctx.scene.add(g);
  const rng = ctx.rng;
  const sway = [];

  scatter(ctx, 5, (x, z) => placeAt(g, buildPalm(rng, sway), x, z, rng() * Math.PI * 2, 0.85 + rng() * 0.35));
  // sandy patches
  scatter(ctx, 5, (x, z) => placeAt(g, flatDisc(1.4 + rng() * 1.0, 0xe4cf98, 0.04, 9), x, z));
  // driftwood
  scatter(ctx, 3, (x, z) => {
    const d = new THREE.Group();
    const log = cyl(0.12, 0.22, 2.4, 0xbcab90, 6);
    log.rotation.z = Math.PI / 2;
    log.position.y = 0.2;
    d.add(log);
    const stub = cyl(0.07, 0.1, 0.7, 0xbcab90, 5);
    stub.position.set(0.5, 0.4, 0);
    stub.rotation.z = 0.7;
    d.add(stub);
    placeAt(g, d, x, z, rng() * Math.PI * 2);
  });
  // rowboat
  scatter(ctx, 1, (x, z) => {
    const b = new THREE.Group();
    const hull = box(2.6, 0.55, 1.15, P.wood);
    hull.position.y = 0.3;
    b.add(hull);
    for (const s of [-0.62, 0.62]) {
      const rail = box(2.8, 0.22, 0.16, P.woodDark);
      rail.position.set(0, 0.62, s);
      b.add(rail);
    }
    for (const e of [-1.38, 1.38]) {
      const cap = box(0.24, 0.5, 1.2, P.woodDark);
      cap.position.set(e, 0.42, 0);
      cap.rotation.z = e > 0 ? -0.25 : 0.25;
      b.add(cap);
    }
    const bench = box(0.45, 0.1, 1.05, P.woodLight);
    bench.position.y = 0.5;
    b.add(bench);
    b.rotation.z = 0.06;
    placeAt(g, b, x, z, rng() * Math.PI * 2);
  });
  // seashells
  scatter(ctx, 6, (x, z) => {
    const shell = cone(0.16 + rng() * 0.08, 0.24, rng() > 0.5 ? 0xf4e6d8 : 0xf0c8c0, 6);
    shell.rotation.x = Math.PI / 2 + (rng() - 0.5);
    shell.position.y = 0.12;
    placeAt(g, shell, x, z, rng() * Math.PI * 2);
  });

  // wave rings pulsing just off the island edges
  const waveMat = () => new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false,
  });
  const waves = [];
  const hw = ctx.islandW / 2;
  const zMid = (ctx.zFront + ctx.zBack) / 2;
  const spots = [
    [hw + 3.5, zMid], [-hw - 3.5, zMid],
    [0, ctx.zFront + 3.5], [0, ctx.zBack - 3.5],
  ];
  for (let i = 0; i < spots.length; i++) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.6, 2.1, 22), waveMat());
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(spots[i][0], -2.2, spots[i][1]);
    g.add(ring);
    waves.push({ ring, phase: i * 1.7 });
  }
  ctx.addAnimated((now) => {
    const t = now * 0.001;
    for (const s of sway) s.node.rotation.z = Math.sin(t * 0.9 + s.phase) * 0.06;
    for (const w of waves) {
      const cyc = (t * 0.35 + w.phase) % 1;
      const sc = 0.8 + cyc * 0.9;
      w.ring.scale.set(sc, sc, 1);
      w.ring.material.opacity = 0.55 * (1 - cyc);
    }
  });
}

// ============================================================
// BOREAL
// ============================================================

function borealScenery(ctx) {
  const g = new THREE.Group();
  ctx.scene.add(g);
  const rng = ctx.rng;

  const buildSpruce = (snowy) => {
    const t = new THREE.Group();
    const trunk = cyl(0.16, 0.26, 1.2, P.woodDark, 6);
    trunk.position.y = 0.6;
    t.add(trunk);
    const tiers = [[1.4, 1.7, 1.7], [1.05, 1.5, 2.75], [0.7, 1.3, 3.75]];
    for (const [r, h, y] of tiers) {
      const c = cone(r, h, 0x2e6b46, 7);
      c.position.y = y;
      t.add(c);
      if (snowy) {
        const cap = cone(r * 0.62, h * 0.5, 0xf2f6f8, 7);
        cap.position.y = y + h * 0.32;
        t.add(cap);
      }
    }
    return t;
  };

  scatter(ctx, 8, (x, z, i) => placeAt(g, buildSpruce(i % 2 === 0), x, z, rng() * Math.PI * 2, 0.8 + rng() * 0.5));
  scatter(ctx, 4, (x, z) => placeAt(g, buildBoulder(rng, 0x8a9096), x, z, rng() * Math.PI * 2, 0.8 + rng() * 0.5));
  scatter(ctx, 6, (x, z) => placeAt(g, flatDisc(1.0 + rng() * 0.9, 0xf2f6f8, 0.05, 9), x, z));
  // log pile
  scatter(ctx, 1, (x, z) => {
    const pile = new THREE.Group();
    const rows = [[3, 0.28], [2, 0.75], [1, 1.2]];
    for (const [n, y] of rows) {
      for (let i = 0; i < n; i++) {
        const log = cyl(0.26, 0.26, 2.2, i % 2 ? P.wood : P.woodDark, 7);
        log.rotation.z = Math.PI / 2;
        log.position.set(0, y, (i - (n - 1) / 2) * 0.56);
        pile.add(log);
      }
    }
    pile.rotation.y = Math.PI / 2; // logs lie along z visually varied by placement rotation
    placeAt(g, pile, x, z, rng() * Math.PI * 2);
  });

  fallingSprites(ctx, g, '255,255,255', 34, { size: 0.3, height: 13, speed: 1.1, sway: 0.7, opacity: 0.8 });
}

// ============================================================
// DESERT
// ============================================================

function desertScenery(ctx) {
  const g = new THREE.Group();
  ctx.scene.add(g);
  const rng = ctx.rng;
  const cactusGreen = 0x3e7d46;

  const buildSaguaro = () => {
    const c = new THREE.Group();
    const h = 3.2 + rng() * 0.8;
    const trunk = cyl(0.3, 0.38, h, cactusGreen, 8);
    trunk.position.y = h / 2;
    c.add(trunk);
    const cap = ball(0.3, cactusGreen, 0.8, 7);
    cap.position.y = h;
    c.add(cap);
    for (const side of [-1, 1]) {
      if (rng() < 0.25 && side > 0) continue;
      const ay = h * (0.35 + rng() * 0.2);
      const elbow = cyl(0.17, 0.17, 0.6, cactusGreen, 6);
      elbow.rotation.z = Math.PI / 2;
      elbow.position.set(side * 0.5, ay, 0);
      c.add(elbow);
      const arm = cyl(0.17, 0.2, 1.2 + rng() * 0.5, cactusGreen, 6);
      arm.position.set(side * 0.78, ay + 0.6, 0);
      c.add(arm);
      const tip = ball(0.18, cactusGreen, 0.8, 6);
      tip.position.set(side * 0.78, ay + 1.25, 0);
      c.add(tip);
    }
    return c;
  };

  scatter(ctx, 5, (x, z) => placeAt(g, buildSaguaro(), x, z, rng() * Math.PI * 2, 0.85 + rng() * 0.4));
  // barrel cacti
  scatter(ctx, 4, (x, z) => {
    const b = new THREE.Group();
    const body = ball(0.5 + rng() * 0.2, 0x4e8c4a, 0.85, 8);
    body.position.y = 0.4;
    b.add(body);
    const flower = cone(0.14, 0.22, 0xe064a8, 6);
    flower.position.y = 0.86;
    b.add(flower);
    placeAt(g, b, x, z);
  });
  // red rock formations
  scatter(ctx, 4, (x, z) => {
    const r = new THREE.Group();
    const sizes = [[1.5, 0.9, 1.2, 0.45], [1.1, 0.8, 0.9, 1.25], [0.7, 0.7, 0.6, 2.0]];
    for (const [w, h, d, y] of sizes) {
      const slab = box(w, h, d, 0xb5643c);
      slab.position.y = y;
      slab.rotation.y = rng() * 0.5;
      r.add(slab);
    }
    placeAt(g, r, x, z, rng() * Math.PI * 2, 0.7 + rng() * 0.6);
  });
  // tiny oasis
  scatter(ctx, 1, (x, z) => {
    const o = new THREE.Group();
    o.add(flatDisc(2.4, 0xe4cf98, 0.03, 12));
    o.add(flatDisc(1.7, 0x3fb8d4, 0.08, 12));
    const p1 = buildPalm(rng, null);
    p1.position.set(1.9, 0, 0.4);
    p1.scale.setScalar(0.6);
    o.add(p1);
    const p2 = buildPalm(rng, null);
    p2.position.set(-1.7, 0, -0.8);
    p2.scale.setScalar(0.5);
    p2.rotation.y = 2.4;
    o.add(p2);
    placeAt(g, o, x, z, rng() * Math.PI * 2);
  });
  // bleached cow skull
  scatter(ctx, 1, (x, z) => {
    const s = new THREE.Group();
    const skull = ball(0.4, 0xf2ede0, 0.7, 7);
    skull.position.y = 0.25;
    s.add(skull);
    for (const side of [-1, 1]) {
      const horn = cone(0.09, 0.7, 0xe8e0cc, 5);
      horn.position.set(side * 0.55, 0.42, 0);
      horn.rotation.z = side * -1.9;
      s.add(horn);
    }
    placeAt(g, s, x, z, rng() * Math.PI * 2);
  });

  // rolling tumbleweed drifting across the front band, wrapping
  const weed = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const ring = mesh(new THREE.TorusGeometry(0.5, 0.045, 4, 10), mat(0xb09858));
    ring.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
    weed.add(ring);
  }
  const half = ctx.islandW / 2 - 2.5;
  const weedZ = (ctx.fence.zFront + ctx.zFront) / 2;
  weed.position.set(-half, 0.55, weedZ);
  g.add(weed);
  ctx.addAnimated((now) => {
    const t = now * 0.001;
    const span = half * 2;
    const x = -half + ((t * 2.2) % span);
    weed.position.set(x, 0.55 + Math.abs(Math.sin(t * 5)) * 0.18, weedZ);
    weed.rotation.z = -t * 3.5;
  });
}

// ============================================================
// SAKURA
// ============================================================

function sakuraScenery(ctx) {
  const g = new THREE.Group();
  ctx.scene.add(g);
  const rng = ctx.rng;

  const buildBlossom = () => {
    const t = new THREE.Group();
    const trunk = cyl(0.24, 0.36, 2.4, 0x5a4032, 7);
    trunk.position.y = 1.2;
    t.add(trunk);
    const branch = cyl(0.1, 0.15, 1.2, 0x5a4032, 5);
    branch.position.set(0.55, 2.2, 0.15);
    branch.rotation.z = -0.9;
    t.add(branch);
    const blobs = [[0, 3.1, 0, 1.35], [0.95, 2.8, 0.3, 0.95], [-0.85, 2.75, -0.3, 0.9], [0.15, 2.5, 0.9, 0.8]];
    for (let i = 0; i < blobs.length; i++) {
      const [x, y, z, r] = blobs[i];
      const b = ball(r, i % 2 ? 0xf2aac8 : 0xf7c2d8, 0.9);
      b.position.set(x, y, z);
      t.add(b);
    }
    return t;
  };

  scatter(ctx, 6, (x, z) => placeAt(g, buildBlossom(), x, z, rng() * Math.PI * 2, 0.8 + rng() * 0.4));
  // stone lanterns
  scatter(ctx, 3, (x, z) => {
    const l = new THREE.Group();
    const base = cyl(0.5, 0.6, 0.3, 0x8f8a88, 8);
    base.position.y = 0.15;
    l.add(base);
    const pillar = cyl(0.16, 0.2, 0.9, 0x9a9694, 7);
    pillar.position.y = 0.75;
    l.add(pillar);
    const platform = box(0.7, 0.14, 0.7, 0x8f8a88);
    platform.position.y = 1.27;
    l.add(platform);
    const chamber = box(0.5, 0.42, 0.5, 0xa5a19e);
    chamber.position.y = 1.55;
    l.add(chamber);
    const light = box(0.28, 0.24, 0.52, 0xffd98c, { emissive: 0xffb84a, emissiveIntensity: 0.9 });
    light.position.y = 1.55;
    l.add(light);
    const roof = cone(0.58, 0.42, 0x827e7c, 8);
    roof.position.y = 1.95;
    l.add(roof);
    placeAt(g, l, x, z, rng() * Math.PI * 2);
  });
  // moss rocks
  scatter(ctx, 4, (x, z) => {
    const m = new THREE.Group();
    const rock = ball(0.55 + rng() * 0.3, 0x8f8a88, 0.7, 7);
    rock.position.y = 0.28;
    m.add(rock);
    const moss = ball(0.4, 0x5da33e, 0.4, 7);
    moss.position.y = 0.55;
    m.add(moss);
    placeAt(g, m, x, z, rng() * Math.PI * 2);
  });

  // torii-style gate near the front edge
  const torii = new THREE.Group();
  const red = 0xc23b30;
  for (const side of [-1.6, 1.6]) {
    const pillar = cyl(0.17, 0.22, 3.1, red, 8);
    pillar.position.set(side, 1.55, 0);
    torii.add(pillar);
  }
  const beam2 = box(3.5, 0.24, 0.28, red);
  beam2.position.y = 2.5;
  torii.add(beam2);
  const beam1 = box(4.5, 0.32, 0.38, red);
  beam1.position.y = 3.2;
  torii.add(beam1);
  const capBeam = box(4.8, 0.16, 0.44, 0x2e2a28);
  capBeam.position.y = 3.44;
  torii.add(capBeam);
  torii.position.set(0, 0, ctx.zFront - 2.4);
  g.add(torii);

  fallingSprites(ctx, g, '255,170,200', 30, { size: 0.32, height: 11, speed: 0.9, sway: 1.1, opacity: 0.85 });
}

// ============================================================
// AUTUMN
// ============================================================

function autumnScenery(ctx) {
  const g = new THREE.Group();
  ctx.scene.add(g);
  const rng = ctx.rng;
  const fallColors = [0xd8632a, 0xc23b2e, 0xe8a02e, 0xd88a2a];

  const buildMaple = () => {
    const t = new THREE.Group();
    const trunk = cyl(0.26, 0.4, 2.6, P.woodDark, 7);
    trunk.position.y = 1.3;
    t.add(trunk);
    const main = fallColors[Math.floor(rng() * fallColors.length)];
    const blobs = [[0, 3.4, 0, 1.5], [1.0, 2.9, 0.35, 1.0], [-0.95, 2.95, -0.3, 0.95]];
    for (let i = 0; i < blobs.length; i++) {
      const [x, y, z, r] = blobs[i];
      const c = i === 0 ? main : fallColors[Math.floor(rng() * fallColors.length)];
      const b = ball(r, c, 0.88);
      b.position.set(x, y, z);
      t.add(b);
    }
    return t;
  };

  scatter(ctx, 6, (x, z) => placeAt(g, buildMaple(), x, z, rng() * Math.PI * 2, 0.8 + rng() * 0.45));
  // leaf piles
  scatter(ctx, 4, (x, z) => {
    const pile = ball(0.9 + rng() * 0.4, 0xd8742a, 0.32, 8);
    pile.position.y = 0.12;
    placeAt(g, pile, x, z);
  });
  // pumpkins
  scatter(ctx, 5, (x, z) => {
    const p = new THREE.Group();
    const body = ball(0.45 + rng() * 0.2, 0xe8781e, 0.75, 8);
    body.position.y = 0.3;
    p.add(body);
    const stem = cyl(0.05, 0.08, 0.28, 0x5d7a2a, 5);
    stem.position.y = 0.62;
    stem.rotation.z = 0.3;
    p.add(stem);
    placeAt(g, p, x, z, rng() * Math.PI * 2);
  });
  // wooden cart
  scatter(ctx, 1, (x, z) => {
    const cart = new THREE.Group();
    const bed = box(2.2, 0.2, 1.3, P.wood);
    bed.position.y = 0.85;
    cart.add(bed);
    for (const s of [-0.62, 0.62]) {
      const side = box(2.2, 0.5, 0.12, P.woodLight);
      side.position.set(0, 1.15, s);
      cart.add(side);
    }
    for (const e of [-1.08, 1.08]) {
      const end = box(0.12, 0.5, 1.24, P.woodLight);
      end.position.set(e, 1.15, 0);
      cart.add(end);
    }
    for (const s of [-0.75, 0.75]) {
      const wheel = cyl(0.65, 0.65, 0.16, P.woodDark, 10);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(0.2, 0.65, s);
      cart.add(wheel);
    }
    const handle = cyl(0.06, 0.06, 1.6, P.woodDark, 5);
    handle.position.set(-1.7, 0.6, 0);
    handle.rotation.z = 1.0;
    cart.add(handle);
    placeAt(g, cart, x, z, rng() * Math.PI * 2);
  });
  // crows on a stump
  scatter(ctx, 1, (x, z) => {
    const s = new THREE.Group();
    const stump = cyl(0.5, 0.62, 0.8, P.woodDark, 8);
    stump.position.y = 0.4;
    s.add(stump);
    const top = cyl(0.5, 0.5, 0.06, P.woodLight, 8);
    top.position.y = 0.82;
    s.add(top);
    for (const cx of [-0.2, 0.22]) {
      const crowBody = ball(0.18, 0x26262e, 0.9, 6);
      crowBody.position.set(cx, 0.98, 0);
      s.add(crowBody);
      const head = ball(0.1, 0x26262e, 1, 6);
      head.position.set(cx + 0.12, 1.14, 0);
      s.add(head);
      const beak = cone(0.04, 0.12, 0xe8a02e, 4);
      beak.position.set(cx + 0.24, 1.13, 0);
      beak.rotation.z = -Math.PI / 2;
      s.add(beak);
    }
    placeAt(g, s, x, z, rng() * Math.PI * 2);
  });

  fallingSprites(ctx, g, '255,140,40', 22, { size: 0.3, height: 10, speed: 1.0, sway: 1.3, opacity: 0.8 });
}

// ============================================================
// OUTER ZONES — each farm mesa rises from a much larger biome
// landmass built here (surface at ctx.topY, own rocky underside).
// ============================================================

const OUTER_TOP_Y = -20;

function outerRng(ctx) {
  return typeof ctx.rng === 'function' ? ctx.rng : Math.random;
}

function outerAnimate(ctx) {
  return typeof ctx.addAnimated === 'function' ? ctx.addAnimated : () => {};
}

function outerSize(ctx, k) {
  return k * Math.max(ctx.islandW || 30, ctx.islandD || 30);
}

// distance from (x, z) to the farm island's rectangular footprint
function distToIsland(ctx, x, z) {
  const ox = Math.max(Math.abs(x) - (ctx.islandW || 30) / 2, 0);
  const oz = Math.max(Math.abs(z - (ctx.zCenter || 0)) - (ctx.islandD || 30) / 2, 0);
  return Math.hypot(ox, oz);
}

// rejection-sample a world-space point on the outer landmass,
// at least minDist away from the island footprint
function outerPoint(ctx, rng, R, minDist) {
  for (let i = 0; i < 40; i++) {
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * R * 0.82;
    const x = Math.cos(a) * r;
    const z = (ctx.zCenter || 0) + Math.sin(a) * r;
    if (distToIsland(ctx, x, z) >= minDist) return [x, z];
  }
  return null;
}

function outerPoints(ctx, rng, R, minDist, count) {
  const pts = [];
  for (let i = 0; i < count; i++) {
    const p = outerPoint(ctx, rng, R, minDist);
    if (p) pts.push(p);
  }
  return pts;
}

// smooth pseudo-noise height field, flattened near the island
// so the mesa base reads clean where it meets the land
function outerHeightField(ctx, rng, amp) {
  const p0 = rng() * 10, p1 = rng() * 10, p2 = rng() * 10;
  const clear = Math.max(ctx.clearRadius || 8, 1);
  return (x, z) => {
    const n = 0.55 * Math.sin(x * 0.08 + p0) * Math.cos(z * 0.07 + p1)
      + 0.3 * Math.sin(x * 0.045 + z * 0.055 + p2)
      + 0.15 * Math.cos(x * 0.12 - z * 0.1 + p0);
    const f = Math.min(1, distToIsland(ctx, x, z) / clear);
    return amp * n * f * f;
  };
}

// The big organic landmass slab: irregular flat-shaded top disc plus
// a thick rocky underside skirt with a jagged bottom (the world floats).
// Returns { group, R, topY, zC, heightAt } — group sits at (0, topY, zC),
// so children use local coords: y relative to topY, z relative to zC.
function outerLandmass(ctx, { color = 0x74bf58, under = 0x54443a, radiusK = 1.6, amp = 2.0 } = {}) {
  if (!ctx || !ctx.scene || typeof ctx.scene.add !== 'function') return null;
  const rng = outerRng(ctx);
  const topY = typeof ctx.topY === 'number' ? ctx.topY : OUTER_TOP_Y;
  const zC = ctx.zCenter || 0;
  // the terrain around the farm is a FIXED-WIDTH border, not a multiple of the
  // farm size — so expanding the farm grows only the farm, the land ring stays
  // the same width (tier 1 matches the original look, higher tiers don't balloon)
  const R = Math.max(ctx.islandW || 30, ctx.islandD || 30) * 0.5 + (radiusK - 0.5) * 90;
  const heightAt = outerHeightField(ctx, rng, Math.min(amp, 2.5));
  const g = new THREE.Group();

  // irregular top disc built ring by ring so the interior can undulate
  const segs = 48, rings = 6;
  const edgeJit = [];
  for (let s = 0; s < segs; s++) edgeJit.push(0.86 + rng() * 0.2);
  const verts = [];
  for (let ri = 0; ri <= rings; ri++) {
    const row = [];
    for (let si = 0; si < segs; si++) {
      const a = (si / segs) * Math.PI * 2;
      let r = (ri / rings) * R;
      if (ri === rings) r *= edgeJit[si];
      else if (ri > 0) r *= 1 + (rng() - 0.5) * 0.05;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const y = ri === rings ? -0.5 : heightAt(x, z + zC);
      row.push([x, y, z]);
    }
    verts.push(row);
  }
  const pos = [];
  const push = (v) => pos.push(v[0], v[1], v[2]);
  for (let ri = 0; ri < rings; ri++) {
    for (let si = 0; si < segs; si++) {
      const s2 = (si + 1) % segs;
      const a = verts[ri][si], b = verts[ri + 1][si], c = verts[ri + 1][s2], d = verts[ri][s2];
      push(a); push(b); push(c);
      if (ri > 0) { push(a); push(c); push(d); }
    }
  }
  const topGeo = new THREE.BufferGeometry();
  topGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  topGeo.computeVertexNormals();
  const top = new THREE.Mesh(topGeo, mat(color, { side: THREE.DoubleSide }));
  top.receiveShadow = true;
  top.userData.ground = color; // seasonal ground tint (golden fall / snowy winter)
  g.add(top);

  // rocky underside skirt, ~8 deep, jagged bottom; deterministic jitter
  // (a function of angle) so the UV seam never cracks open
  const skirtGeo = new THREE.CylinderGeometry(R * 0.97, R * 0.55, 8, segs, 3);
  const sp = skirtGeo.attributes.position;
  const v = new THREE.Vector3();
  const ph = rng() * 10;
  for (let i = 0; i < sp.count; i++) {
    v.fromBufferAttribute(sp, i);
    const ang = Math.atan2(v.z, v.x);
    const j = 1 + 0.08 * Math.sin(ang * 5 + ph) + 0.05 * Math.cos(ang * 9 + v.y * 0.5 + ph);
    v.x *= j; v.z *= j;
    if (v.y < -3.9) v.y -= 1.2 + 2.2 * (0.5 + 0.5 * Math.sin(ang * 7 + ph * 2));
    sp.setXYZ(i, v.x, v.y, v.z);
  }
  skirtGeo.computeVertexNormals();
  const skirt = new THREE.Mesh(skirtGeo, mat(under));
  skirt.position.y = -4.1;
  g.add(skirt);

  g.position.set(0, topY, zC);
  ctx.scene.add(g);
  return { group: g, R, topY, zC, heightAt };
}

// compose an InstancedMesh from placement records
// { x, y, z (local), s, sy, rx, ry, rz }
function outerInstanced(parent, geo, material, places) {
  if (!places || !places.length) return null;
  const im = new THREE.InstancedMesh(geo, material, places.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const p = new THREE.Vector3(), s = new THREE.Vector3();
  for (let i = 0; i < places.length; i++) {
    const t = places[i];
    e.set(t.rx || 0, t.ry || 0, t.rz || 0);
    q.setFromEuler(e);
    p.set(t.x, t.y, t.z);
    const sc = t.s == null ? 1 : t.s;
    s.set(sc, (t.sy == null ? 1 : t.sy) * sc, sc);
    m4.compose(p, q, s);
    im.setMatrixAt(i, m4);
  }
  im.castShadow = true;
  parent.add(im);
  return im;
}

// wide falling-sprite pool over the whole outer zone (snow / petals / leaves)
function outerFalling(ctx, land, rgb, count, { size = 0.35, height = 16, speed = 1.1, sway = 0.9, opacity = 0.8 } = {}) {
  const rng = outerRng(ctx);
  const tex = glowTexture(rgb);
  const parts = [];
  for (let i = 0; i < count; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity, depthWrite: false }));
    s.scale.setScalar(size * (0.6 + rng() * 0.8));
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * land.R * 0.88;
    parts.push({ s, x: Math.cos(a) * r, z: Math.sin(a) * r, phase: rng() * 100, rate: speed * (0.7 + rng() * 0.7) });
    land.group.add(s);
  }
  outerAnimate(ctx)((now) => {
    const t = now * 0.001;
    for (const p of parts) {
      const y = height - ((t * p.rate + p.phase) % height);
      p.s.position.set(p.x + Math.sin(t * 0.7 + p.phase) * sway, y, p.z + Math.cos(t * 0.5 + p.phase) * sway * 0.5);
      p.s.material.opacity = Math.min(1, y * 0.6) * opacity;
    }
  });
}

// dark bird silhouettes circling a point (vultures / crow flock);
// cx/cz are local to the landmass group
function circlingBirds(ctx, land, { count = 2, color = 0x26262e, cx = 0, cz = 0, radius = 16, height = 15, speed = 0.25, size = 1 } = {}) {
  const rng = outerRng(ctx);
  const birds = [];
  for (let i = 0; i < count; i++) {
    const b = new THREE.Group();
    b.add(ball(0.32, color, 0.55, 6));
    const wings = [];
    for (const side of [-1, 1]) {
      const w = box(1.5, 0.06, 0.4, color);
      w.position.x = side * 0.8;
      b.add(w);
      wings.push({ w, side });
    }
    b.scale.setScalar(size);
    land.group.add(b);
    birds.push({ b, wings, phase: rng() * Math.PI * 2, wob: 2.5 + rng() * 2 });
  }
  outerAnimate(ctx)((now) => {
    const t = now * 0.001;
    for (const bd of birds) {
      const a = t * speed + bd.phase;
      bd.b.position.set(cx + Math.cos(a) * radius, height + Math.sin(t * 0.7 + bd.phase) * 1.2, cz + Math.sin(a) * radius);
      bd.b.rotation.y = -a - Math.PI / 2;
      for (const wg of bd.wings) wg.w.rotation.z = wg.side * Math.sin(t * bd.wob) * 0.45;
    }
  });
}

// a winding strip of overlapping discs radiating outward (path / riverbed)
function windingStrip(land, rng, { color = 0x8a5a33, width = 1.2, startR = 8, endK = 0.78, steps = 15, y = 0.12, angle = 0 } = {}) {
  const strip = new THREE.Group();
  const bend = (rng() - 0.5) * 1.2;
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const r = startR + t * (land.R * endK - startR);
    const a = angle + Math.sin(t * 2.8) * 0.25 + bend * t * 0.5;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const d = flatDisc(width * (0.75 + rng() * 0.5), color, 0, 8);
    d.position.set(x, land.heightAt(x, z + land.zC) + y, z);
    strip.add(d);
  }
  land.group.add(strip);
  return strip;
}

// never let a broken outer zone take down the farm scene
function safeOuter(build) {
  return function buildOuterZone(ctx) {
    try {
      if (!ctx || !ctx.scene) return;
      build(ctx);
    } catch (err) {
      if (typeof console !== 'undefined' && console.warn) console.warn('[themes] outer zone skipped:', err);
    }
  };
}

// ---------- meadow outer — grand alpine valley ----------

// faceted unit peak cone (radius 1, height 1, base at y = 0); displacement is
// a pure function of angle/height so the wrap seam stays sealed
function meadowPeakGeo(rng, seg = 8) {
  const geo = new THREE.ConeGeometry(1, 1, seg, 4);
  geo.translate(0, 0.5, 0);
  const pos = geo.attributes.position;
  const v = new THREE.Vector3();
  const p1 = rng() * 10, p2 = rng() * 10;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const ang = Math.atan2(v.z, v.x);
    const t = Math.min(1, Math.max(0, 1 - v.y) * 1.6); // 0 at the apex
    const j = 1 + t * (0.12 * Math.sin(ang * 3 + p1) + 0.09 * Math.cos(ang * 7 + v.y * 8 + p2));
    v.x *= j; v.z *= j;
    if (v.y > 0.03 && v.y < 0.97) v.y += 0.04 * Math.sin(ang * 5 + v.y * 11 + p1);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

// valley height field: perfectly flat within clearRadius + 30 of the island
// footprint (the fenced farm clearing sits flush on the floor), then gentle
// rolling noise (<= 3 units) swelling toward the rim, damped level again
// around the lake so the water reads dead calm
function meadowHeightField(ctx, rng, R, lake) {
  const p0 = rng() * 10, p1 = rng() * 10, p2 = rng() * 10;
  const zC = ctx.zCenter || 0;
  const flatR = (ctx.clearRadius || 10) + 30;
  return (x, z) => {
    const d = distToIsland(ctx, x, z);
    if (d <= flatR) return 0;
    const n = 0.5 * Math.sin(x * 0.045 + p0) * Math.cos(z * 0.04 + p1)
      + 0.3 * Math.sin(x * 0.026 + z * 0.031 + p2)
      + 0.2 * Math.cos(x * 0.085 - z * 0.07 + p0);
    const rr = Math.min(1, Math.hypot(x, z - zC) / R);
    const ramp = Math.min(1, (d - flatR) / 45);
    // flatten again near the mountain ring — rolling ground grazing the cone
    // flanks is what caused the fringed brown "glitch" patches
    let rimFade = 1;
    if (rr > 0.72) rimFade = Math.max(0, 1 - (rr - 0.72) / 0.13);
    let h = 3 * (0.3 + 0.7 * rr) * n * ramp * ramp * rimFade;
    const dl = Math.hypot(x - lake.x, z - lake.z) - (lake.r + 5);
    if (dl < 12) h *= Math.max(0, dl / 12);
    return h;
  };
}

// the vast valley-floor slab: irregular flat-shaded disc over a rocky
// underside skirt ~10 deep (the world is still a floating diorama)
function meadowValleyFloor(ctx, rng, R, heightAt, opts = {}) {
  const topY = typeof ctx.topY === 'number' ? ctx.topY : OUTER_TOP_Y;
  const zC = ctx.zCenter || 0;
  const g = new THREE.Group();

  // terraced themes pass a finer grid so cliff steps read crisp, not smeared
  const segs = opts.segs || 64, rings = opts.rings || 10;
  // edge always OUTSIDE the skirt's maximum radius (1.03R) — overlap between the
  // two jittered silhouettes was the source of the brown "glitch collar"
  const edgeJit = [];
  for (let s = 0; s < segs; s++) edgeJit.push(1.05 + rng() * 0.11);
  const verts = [];
  for (let ri = 0; ri <= rings; ri++) {
    const row = [];
    for (let si = 0; si < segs; si++) {
      const a = (si / segs) * Math.PI * 2;
      let r = (ri / rings) * R;
      if (ri === rings) r *= edgeJit[si];
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const y = ri === rings ? -0.6 : heightAt(x, z + zC);
      row.push([x, y, z]);
    }
    verts.push(row);
  }
  const pos = [];
  const push = (v) => pos.push(v[0], v[1], v[2]);
  for (let ri = 0; ri < rings; ri++) {
    for (let si = 0; si < segs; si++) {
      const s2 = (si + 1) % segs;
      const a = verts[ri][si], b = verts[ri + 1][si], c = verts[ri + 1][s2], d = verts[ri][s2];
      push(a); push(b); push(c);
      if (ri > 0) { push(a); push(c); push(d); }
    }
  }
  const topGeo = new THREE.BufferGeometry();
  topGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  topGeo.computeVertexNormals();
  // smooth-shaded: flat shading turns the big triangles into ugly dark facets
  const top = new THREE.Mesh(topGeo, mat(opts.top ?? 0x6db554, { side: THREE.DoubleSide, flatShading: false }));
  top.receiveShadow = true;
  top.userData.ground = opts.top ?? 0x6db554; // seasonal ground tint
  g.add(top);

  // rocky underside skirt with a jagged bottom; deterministic angle-based
  // jitter so the wrap seam never cracks open
  const skirtGeo = new THREE.CylinderGeometry(R * 0.99, R * 0.5, 10, segs, 3);
  const sp = skirtGeo.attributes.position;
  const v = new THREE.Vector3();
  const ph = rng() * 10;
  for (let i = 0; i < sp.count; i++) {
    v.fromBufferAttribute(sp, i);
    const ang = Math.atan2(v.z, v.x);
    // jitter capped at 1.03 so the skirt can never poke past the floor edge
    const j = 0.97 + 0.04 * Math.sin(ang * 5 + ph) + 0.02 * Math.cos(ang * 9 + v.y * 0.5 + ph);
    v.x *= j; v.z *= j;
    if (v.y < -4.9) v.y -= 1.4 + 2.4 * (0.5 + 0.5 * Math.sin(ang * 7 + ph * 2));
    sp.setXYZ(i, v.x, v.y, v.z);
  }
  skirtGeo.computeVertexNormals();
  const skirt = new THREE.Mesh(skirtGeo, mat(opts.skirt ?? 0x6a5744));
  // top sits below even the floor's edge dip; terraced themes push it further
  // down so it can't poke up through a carved canyon floor
  skirt.position.y = opts.skirtY ?? -5.9;
  g.add(skirt);

  g.position.set(0, topY, zC);
  ctx.scene.add(g);
  return { group: g, R, topY, zC, heightAt };
}

// shared procedural water: layered wave streaks on deep blue, tileable,
// scrolled slowly by the themes that use it
let _waterTex = null;
export function waterTexture() {
  if (_waterTex) return _waterTex;
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g2 = c.getContext('2d');
  g2.fillStyle = '#3070b8';
  g2.fillRect(0, 0, 256, 256);
  let seed = 7;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  // broad darker swells first, bright crests on top — bolder for a lively
  // flowing surface that reads as moving water, not a flat sheet
  for (const [col, alpha, n, wmin, wadd] of [
    ['#1f5296', 0.6, 34, 40, 70],
    ['#3f82c8', 0.6, 34, 30, 55],
    ['#7fb6e2', 0.5, 40, 16, 34],
    ['#cfe6f6', 0.55, 46, 10, 26],
    ['#f4fbff', 0.5, 30, 6, 16],
  ]) {
    g2.strokeStyle = col;
    g2.globalAlpha = alpha;
    for (let i = 0; i < n; i++) {
      const y = rnd() * 256;
      const x = rnd() * 256;
      const w = wmin + rnd() * wadd;
      g2.lineWidth = 1.2 + rnd() * 2.2;
      g2.beginPath();
      g2.moveTo(x, y);
      g2.quadraticCurveTo(x + w / 2, y + (rnd() - 0.5) * 7, x + w, y + (rnd() - 0.5) * 3);
      g2.stroke();
      // wrap horizontally so the tile seam never shows
      if (x + w > 256) {
        g2.beginPath();
        g2.moveTo(x - 256, y);
        g2.quadraticCurveTo(x - 256 + w / 2, y + (rnd() - 0.5) * 7, x - 256 + w, y + (rnd() - 0.5) * 3);
        g2.stroke();
      }
    }
  }
  g2.globalAlpha = 1;
  _waterTex = new THREE.CanvasTexture(c);
  _waterTex.wrapS = _waterTex.wrapT = THREE.RepeatWrapping;
  return _waterTex;
}

// the whole game's water flows off one shared texture — driven every frame by
// the render loop so it animates in every theme, not just one
// give a plain circle/plane water mesh the shared flowing texture, tiled so
// the waves read the same scale as the lake (~9 world units per tile)
function textureCircleWater(mesh, worldRadius) {
  const uv = mesh.geometry.attributes.uv;
  if (uv) {
    const k = (worldRadius * 2) / 9;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) - 0.5) * k + 0.5, (uv.getY(i) - 0.5) * k + 0.5);
    uv.needsUpdate = true;
  }
  mesh.material.map = waterTexture();
  mesh.material.color.set(0xffffff);
  mesh.material.needsUpdate = true;
  return mesh;
}

export function tickWater(t) {
  const w = _waterTex;
  if (!w) return;
  w.center.set(0.5, 0.5);
  w.offset.x = t * 0.03 + Math.sin(t * 0.25) * 0.02;
  w.offset.y = t * 0.014 + Math.cos(t * 0.2) * 0.015;
  w.rotation = Math.sin(t * 0.15) * 0.06;
}

// organic disc with a jittered, lightly smoothed edge (lake water and rim)
function meadowBlobDisc(rng, r, color, opts) {
  const seg = 26;
  const rs = [];
  for (let i = 0; i < seg; i++) rs.push(r * (0.76 + rng() * 0.44));
  const pos = [0, 0, 0];
  const uv = [0, 0];
  for (let i = 0; i <= seg; i++) {
    const k = i % seg;
    const rr = (rs[(k + seg - 1) % seg] + rs[k] + rs[(k + 1) % seg]) / 3;
    const a = (k / seg) * Math.PI * 2;
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    pos.push(x, 0, z);
    uv.push(x / 9, z / 9); // world-scaled so the wave tile reads the same everywhere
  }
  const idx = [];
  for (let i = 1; i <= seg; i++) idx.push(0, i, i + 1);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat(color, { side: THREE.DoubleSide, ...(opts || {}) }));
}

// terrain-hugging flat ribbon through world-space [x, z] waypoints
// (rivers and dirt paths); lift keeps it just above the ground
function meadowRibbon(land, pts, width, color, lift, opts) {
  const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0, z)));
  const n = 40;
  const approxLen = curve.getLength();
  const pos = [];
  const uvs = [];
  const idx = [];
  const p = new THREE.Vector3(), tan = new THREE.Vector3();
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    curve.getPoint(u, p);
    curve.getTangent(u, tan);
    const len = Math.hypot(tan.x, tan.z) || 1;
    const px = (-tan.z / len) * (width / 2), pz = (tan.x / len) * (width / 2);
    const y = land.heightAt(p.x, p.z) + lift;
    pos.push(p.x - px, y, p.z - pz - land.zC, p.x + px, y, p.z + pz - land.zC);
    uvs.push((u * approxLen) / 16, 0, (u * approxLen) / 16, width / 16);
    if (i < n) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat(color, { side: THREE.DoubleSide, ...(opts || {}) }));
  m.receiveShadow = true;
  land.group.add(m);
  return m;
}

// a river/stream that reads like a slice of the lake: a pale shallow shore
// underneath (soft banks instead of a hard-edged stripe) and animated wave
// water on top, UV-matched to the lakes so the ripple density is identical.
function waterRibbon(land, pts, width, lift = 0.3) {
  // shallow shoreline, wider and a hair lower — hides the ribbon's hard edge
  meadowRibbon(land, pts, width * 1.9, 0x9ec7e0, lift - 0.04, { roughness: 0.3 });
  meadowRibbon(land, pts, width * 1.4, 0xbfe0ef, lift - 0.02, { roughness: 0.28 });
  // the flowing water, UVs rescaled from the ribbon's /16 to the lake's /9
  const m = meadowRibbon(land, pts, width, 0xffffff, lift, { map: waterTexture(), roughness: 0.18 });
  const uv = m.geometry.attributes.uv;
  const k = 16 / 9;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * k, uv.getY(i) * k);
  uv.needsUpdate = true;
  return m;
}

// rocky bluff + white-blue falling sheet + foam pool at the base; the
// group's local +z face points at faceTo; returns foam records for the
// shared pulse animation
function meadowWaterfall(land, rng, x, z, fh, faceTo) {
  const w = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const rock = ball(2.6 - i * 0.6, i % 2 ? 0x82766a : 0x776a5e, 0.8, 6);
    rock.position.set((rng() - 0.5) * 0.9, fh * (0.18 + i * 0.32), (rng() - 0.5) * 0.6 - 0.4);
    rock.rotation.y = rng() * Math.PI;
    rock.scale.x *= 1.35;
    w.add(rock);
  }
  const fall = new THREE.Mesh(
    new THREE.PlaneGeometry(1.8, fh),
    new THREE.MeshStandardMaterial({
      color: 0xd6edf8, roughness: 0.25, flatShading: true,
      transparent: true, opacity: 0.92, side: THREE.DoubleSide,
    })
  );
  fall.position.set(0, fh / 2, 1.55);
  w.add(fall);
  const pool = flatDisc(2.4, 0x5aa4d6, 0.14, 10);
  pool.position.z = 2.3;
  w.add(pool);
  const foams = [];
  for (let i = 0; i < 3; i++) {
    const f = ball(0.4 + rng() * 0.22, 0xf2fafd, 0.62, 6);
    f.position.set((i - 1) * 0.75 + (rng() - 0.5) * 0.3, 0.3, 1.9 + rng() * 0.7);
    w.add(f);
    foams.push({ f, ph: rng() * 6 });
  }
  w.position.set(x, land.heightAt(x, z), z - land.zC);
  w.rotation.y = Math.atan2(faceTo.x - x, faceTo.z - z);
  land.group.add(w);
  return foams;
}

function meadowOuter(ctx) {
  if (!ctx || !ctx.scene || typeof ctx.scene.add !== 'function') return;
  const rng = outerRng(ctx);
  const zC = ctx.zCenter || 0;
  const clear = ctx.clearRadius || 10;
  const flatR = clear + 30;
  const iHalf = Math.max(ctx.islandW || 30, ctx.islandD || 30) / 2;
  const R = outerSize(ctx, 3.1);

  // the big organic lake sits behind-left of the farm
  const lakeA = Math.PI + (rng() - 0.5) * 0.7;
  const lake = { x: Math.cos(lakeA) * R * 0.45, z: zC + Math.sin(lakeA) * R * 0.45, r: R * 0.17 };

  const heightAt = meadowHeightField(ctx, rng, R, lake);
  const land = meadowValleyFloor(ctx, rng, R, heightAt);
  if (!land) return;
  const g = land.group;

  // ---- mountain ring: overlapping faceted massifs, snow on the tallest ----
  const rockGeos = [meadowPeakGeo(rng, 8), meadowPeakGeo(rng, 7), meadowPeakGeo(rng, 9)];
  const rockCols = [0x7a6a58, 0x847260, 0x6f6252];
  const rockPl = [[], [], []];
  const snowGeo = meadowPeakGeo(rng, 8);
  const snowPl = [];
  const peaks = [];
  const addPeak = (x, z, baseR, H, snowy) => {
    // sink the cone deep so the terrain intersection happens on a steep part
    // of the slope — a shallow graze paints huge fringed brown patches
    const gy = heightAt(x, z) - 6;
    const HH = H + 6;
    rockPl[Math.floor(rng() * 3)].push({ x, y: gy, z: z - zC, s: baseR, sy: HH / baseR, ry: rng() * Math.PI * 2 });
    if (snowy) {
      // irregular white cap over the upper ~35% of the peak
      const capR = baseR * 0.48, capH = HH * 0.42;
      snowPl.push({ x, y: gy + HH * 0.58, z: z - zC, s: capR, sy: capH / capR, ry: rng() * Math.PI * 2 });
    }
    peaks.push({ x, z, baseR, H });
  };
  // massifs read wide through OVERLAP of several peaks, not one huge base —
  // individual bases stay capped so their flanks never crawl into the valley
  const nMtn = 12 + Math.floor(rng() * 4);
  for (let i = 0; i < nMtn; i++) {
    const a = (i / nMtn) * Math.PI * 2 + (rng() - 0.5) * 0.28;
    const rr = R * (0.88 + rng() * 0.11);
    const x = Math.cos(a) * rr, z = zC + Math.sin(a) * rr;
    const H = 38 + rng() * 34;
    const baseR = Math.min(H * (0.8 + rng() * 0.35), 62);
    addPeak(x, z, baseR, H, H > 50);
    // 1-2 shoulder peaks so each massif reads as an overlapping ridgeline
    const nSide = 1 + (rng() < 0.55 ? 1 : 0);
    for (let s = 0; s < nSide; s++) {
      const side = rng() < 0.5 ? 1 : -1;
      const off = baseR * (0.8 + rng() * 0.35);
      const sh = H * (0.55 + rng() * 0.3);
      addPeak(x - Math.sin(a) * off * side, z + Math.cos(a) * off * side, Math.min(sh * (0.85 + rng() * 0.3), 55), sh, sh > 50);
    }
  }
  // grassy low foothills inside the ring (green, like the reference — not rock)
  const hillPl = [];
  for (let i = 0; i < 8; i++) {
    const a = rng() * Math.PI * 2;
    const rr = R * (0.56 + rng() * 0.18);
    const x = Math.cos(a) * rr, z = zC + Math.sin(a) * rr;
    if (distToIsland(ctx, x, z) < flatR + 6) continue;
    if (Math.hypot(x - lake.x, z - lake.z) < lake.r + 14) continue;
    const H = 9 + rng() * 13;
    const hillBase = H * (1.8 + rng() * 0.9);
    hillPl.push({ x, y: heightAt(x, z) - 1.5, z: z - zC, s: hillBase, sy: H / hillBase, ry: rng() * Math.PI * 2 });
  }
  // mountains/hills don't cast shadows — their giant shadow blobs muddy the valley
  for (let i = 0; i < 3; i++) {
    const m = outerInstanced(g, rockGeos[i], mat(rockCols[i]), rockPl[i]);
    if (m) m.castShadow = false;
  }
  const hillsM = outerInstanced(g, rockGeos[1], mat(0x63ab4e), hillPl);
  if (hillsM) { hillsM.castShadow = false; hillsM.userData.ground = 0x63ab4e; } // foothills tint golden in fall, snowy in winter
  const snowM = outerInstanced(g, snowGeo, mat(0xf4f8fb), snowPl);
  if (snowM) snowM.castShadow = false;

  // ---- the lake: calm blue water over a lighter shoreline rim ----
  // the fishing dock moves to the lake shore, pointing out over the water
  if (typeof ctx.setDockSpot === 'function') {
    const dl = Math.hypot(lake.x, lake.z - zC) || 1;
    const tx = lake.x / dl, tz = (lake.z - zC) / dl; // farm → lake direction
    const sx = lake.x - tx * lake.r * 1.02;
    const sz = lake.z - tz * lake.r * 1.02;
    ctx.setDockSpot(sx, sz, Math.atan2(-tz, tx), 0.42);
  }

  const lakeRim = meadowBlobDisc(rng, lake.r * 1.08, 0x9ec7e0);
  lakeRim.position.set(lake.x, 0.16, lake.z - zC);
  lakeRim.userData.water = 0x9ec7e0;
  g.add(lakeRim);
  const lakeWater = meadowBlobDisc(rng, lake.r, 0xffffff, { map: waterTexture(), roughness: 0.18 });
  lakeWater.position.set(lake.x, 0.3, lake.z - zC);
  lakeWater.userData.water = 0xffffff; // whole lake freezes over in winter
  g.add(lakeWater);

  // ---- two rivers winding from the ring to the lake, waterfall sources ----
  const foams = [];
  for (const s of [1, -1]) {
    const ra = lakeA + s * (0.85 + rng() * 0.5);
    const sx = Math.cos(ra) * R * 0.7, sz = zC + Math.sin(ra) * R * 0.7;
    foams.push(...meadowWaterfall(land, rng, sx, sz, 4.5 + rng() * 3, lake));
    const dx = lake.x - sx, dz = lake.z - sz;
    const dl = Math.hypot(dx, dz) || 1;
    const x0 = sx + (dx / dl) * 3.2, z0 = sz + (dz / dl) * 3.2;
    const ex = lake.x - (dx / dl) * lake.r * 0.5, ez = lake.z - (dz / dl) * lake.r * 0.5;
    const pts = [];
    for (let i = 0; i <= 4; i++) {
      const t = i / 4;
      const wob = Math.sin(t * Math.PI) * Math.sin(t * 6.5 + ra * 3) * R * 0.05;
      pts.push([x0 + (ex - x0) * t + (-dz / dl) * wob, z0 + (ez - z0) * t + (dx / dl) * wob]);
    }
    waterRibbon(land, pts, 2.1, 0.34);
  }
  // a third small fall on its own hillside across the valley
  const wa = lakeA + Math.PI * (0.85 + rng() * 0.3);
  const wr = Math.max(R * 0.62, flatR + iHalf + 8);
  foams.push(...meadowWaterfall(land, rng, Math.cos(wa) * wr, zC + Math.sin(wa) * wr, 4 + rng() * 2.5, { x: 0, z: zC }));

  // ---- winding tan dirt paths ----
  const dirt = 0xc2a165;
  const pathMinR = flatR + iHalf + 4; // free paths stay out of the flat clear zone
  // the approach: out from the farm's front fence gate into the valley
  const gz0 = zC + (ctx.islandD || 30) / 2 + 2;
  const apts = [[0, gz0]];
  for (let i = 1; i <= 4; i++) {
    const t = i / 4;
    apts.push([Math.sin(t * 5.2) * R * 0.07 * t + (rng() - 0.5) * 4, gz0 + (zC + R * 0.72 - gz0) * t]);
  }
  meadowRibbon(land, apts, 2.5, dirt, 0.28);
  // a branch curling from the approach's far end around to the lake shore
  const bpts = [apts[4]];
  const sweep = lakeA + 0.25 - Math.PI / 2;
  const br = Math.max(R * 0.7, pathMinR);
  for (let i = 1; i <= 4; i++) {
    const t = i / 4;
    const a = Math.PI / 2 + sweep * t;
    const r = br - t * (br - (R * 0.45 + lake.r * 1.15));
    bpts.push([Math.cos(a) * r, zC + Math.sin(a) * r]);
  }
  meadowRibbon(land, bpts, 2.3, dirt, 0.28);
  // two more free-roaming valley paths
  for (const pa of [lakeA + 2.5 + (rng() - 0.5) * 0.4, lakeA - 2.5 + (rng() - 0.5) * 0.4]) {
    const ppts = [];
    for (let i = 0; i <= 4; i++) {
      const t = i / 4;
      const r = pathMinR + t * (R * 0.88 - pathMinR);
      const a = pa + Math.sin(t * 3.1 + pa) * 0.22;
      ppts.push([Math.cos(a) * r, zC + Math.sin(a) * r]);
    }
    meadowRibbon(land, ppts, 2.5, dirt, 0.28);
  }

  // ---- forests: dense instanced spruce clumps, thinning near the farm ----
  const sTrunk = [], sT1 = [], sT2 = [];
  const treeMin = clear + 8;
  const addSpruce = (x, z, y) => {
    const s = 2.0 + rng() * 1.3;
    const lz = z - zC;
    const ry = rng() * Math.PI;
    sTrunk.push({ x, y: y + 0.7 * s, z: lz, s, ry });
    sT1.push({ x, y: y + 1.9 * s, z: lz, s, ry });
    sT2.push({ x, y: y + 3.1 * s, z: lz, s, ry });
  };
  let clumps = 0;
  for (let tries = 0; tries < 60 && clumps < 10; tries++) {
    const a = rng() * Math.PI * 2;
    const cr = R * (0.3 + rng() * 0.55);
    const cx = Math.cos(a) * cr, cz = zC + Math.sin(a) * cr;
    if (distToIsland(ctx, cx, cz) < treeMin + 10) continue;
    if (Math.hypot(cx - lake.x, cz - lake.z) < lake.r + 8) continue;
    clumps++;
    const spread = 15 + rng() * 14;
    const count = Math.round(18 + 34 * (cr / R)); // sparse near, dense far
    for (let i = 0; i < count; i++) {
      const x = cx + (rng() - 0.5) * 2 * spread;
      const z = cz + (rng() - 0.5) * 2 * spread;
      if (distToIsland(ctx, x, z) < treeMin) continue;
      if (Math.hypot(x - lake.x, z - lake.z) < lake.r + 3) continue;
      if (Math.hypot(x, z - zC) > R * 0.95) continue;
      addSpruce(x, z, heightAt(x, z));
    }
  }
  // a few spruces climbing the lower mountain slopes
  for (let m = 0; m < 3 && peaks.length; m++) {
    const pk = peaks[Math.floor(rng() * peaks.length)];
    for (let i = 0; i < 14; i++) {
      const a = rng() * Math.PI * 2;
      const d = pk.baseR * (0.6 + rng() * 0.35);
      const x = pk.x + Math.cos(a) * d, z = pk.z + Math.sin(a) * d;
      if (Math.hypot(x, z - zC) > R * 0.98) continue;
      if (distToIsland(ctx, x, z) < treeMin) continue;
      const slope = Math.min(pk.H * Math.max(0, 1 - d / pk.baseR) * 0.7, pk.H * 0.3);
      addSpruce(x, z, heightAt(x, z) + slope - 0.6);
    }
  }
  outerInstanced(g, new THREE.CylinderGeometry(0.16, 0.28, 1.4, 6), mat(P.woodDark), sTrunk);
  { const a = outerInstanced(g, new THREE.ConeGeometry(1.35, 2.4, 7), mat(0x2c6a40), sT1); if (a) tagFoliage(a, { autumn: false }); }
  { const b = outerInstanced(g, new THREE.ConeGeometry(0.9, 2.0, 7), mat(0x33774a), sT2); if (b) tagFoliage(b, { autumn: false }); }

  // scattered round-canopy deciduous trees in mixed greens
  const dTrunk = [];
  const dCan = [[], [], []];
  const dShades = [0x4e9a3f, 0x60ae4b, 0x71bd57];
  for (let i = 0; i < 260 && dTrunk.length < 100; i++) {
    const a = rng() * Math.PI * 2;
    const r = R * (0.25 + Math.sqrt(rng()) * 0.6);
    const x = Math.cos(a) * r, z = zC + Math.sin(a) * r;
    if (distToIsland(ctx, x, z) < treeMin) continue;
    if (Math.hypot(x - lake.x, z - lake.z) < lake.r + 3) continue;
    const s = 1.7 + rng() * 1.2;
    const h = heightAt(x, z);
    dTrunk.push({ x, y: h + 1.2 * s, z: z - zC, s, ry: rng() * Math.PI });
    dCan[Math.floor(rng() * 3)].push({ x, y: h + 3.0 * s, z: z - zC, s, sy: 0.85, ry: rng() * Math.PI });
  }
  outerInstanced(g, new THREE.CylinderGeometry(0.2, 0.32, 2.4, 6), mat(P.wood), dTrunk);
  const canGeo = new THREE.SphereGeometry(1.5, 8, 7);
  for (let i = 0; i < 3; i++) { const im = outerInstanced(g, canGeo, mat(dShades[i]), dCan[i]); if (im) tagFoliage(im); }

  // ---- fall-only ground dressing (carried from the retired Autumn Hollow):
  // leaf piles and pumpkins that appear out in the meadow when autumn arrives ----
  const fallDecor = new THREE.Group();
  fallDecor.visible = false;
  fallDecor.userData.fallOnly = true;
  const leafCols = [0xd8742a, 0xc23b2e, 0xe8a02e, 0xd88a2a];
  for (const [x, z] of outerPoints(ctx, rng, R * 0.9, clear + 4, 12)) {
    const pile = ball(0.85 + rng() * 0.5, leafCols[Math.floor(rng() * leafCols.length)], 0.3, 8);
    pile.position.set(x, heightAt(x, z) + 0.12, z - zC);
    fallDecor.add(pile);
  }
  for (const [x, z] of outerPoints(ctx, rng, R * 0.9, clear + 6, 8)) {
    const p = new THREE.Group();
    const body = ball(0.42 + rng() * 0.22, 0xe8781e, 0.75, 8); body.position.y = 0.3; p.add(body);
    const stem = cyl(0.05, 0.08, 0.28, 0x5d7a2a, 5); stem.position.set(0, 0.62, 0); stem.rotation.z = 0.3; p.add(stem);
    p.position.set(x, heightAt(x, z), z - zC);
    p.rotation.y = rng() * Math.PI;
    fallDecor.add(p);
  }
  g.add(fallDecor);

  // ---- open-ground details: rocks, bushes, grass near the clearing ----
  const rocks = outerPoints(ctx, rng, R * 0.97, clear + 2, 80).map(([x, z]) => ({
    x, y: heightAt(x, z) + 0.3, z: z - zC, s: 0.5 + rng() * 1.1, sy: 0.8, ry: rng() * Math.PI * 2,
  }));
  outerInstanced(g, new THREE.DodecahedronGeometry(0.75, 0), mat(0x8b8478), rocks);
  const bushes = outerPoints(ctx, rng, R * 0.97, clear + 2, 40).map(([x, z]) => ({
    x, y: heightAt(x, z) + 0.35, z: z - zC, s: 0.6 + rng() * 0.8, sy: 0.7, ry: rng() * Math.PI * 2,
  }));
  outerInstanced(g, new THREE.SphereGeometry(0.8, 7, 6), mat(0x3f8a36), bushes);
  const tufts = [];
  for (let i = 0; i < 260 && tufts.length < 90; i++) {
    const a = rng() * Math.PI * 2;
    const r = iHalf + 2 + rng() * (flatR + 2);
    const x = Math.cos(a) * r, z = zC + Math.sin(a) * r;
    const d = distToIsland(ctx, x, z);
    if (d < 2 || d > flatR + 4) continue;
    tufts.push({ x, y: heightAt(x, z) + 0.26, z: z - zC, ry: rng() * Math.PI, s: 0.7 + rng() * 0.8 });
  }
  outerInstanced(g, new THREE.ConeGeometry(0.15, 0.55, 5), mat(0x54a03e), tufts);

  // ---- gentle foam pulse at every waterfall ----
  outerAnimate(ctx)((now) => {
    const t = now * 0.001;
    for (const fm of foams) {
      const k = 1 + Math.sin(t * 3.1 + fm.ph) * 0.16;
      fm.f.scale.set(k, 0.62 * k, k);
    }
  });
}

// ---------- oceanside outer ----------

function oceansideOuter(ctx) {
  const rng = outerRng(ctx);
  // a bigger, more expansive island of warm sand
  const land = outerLandmass(ctx, { color: 0xf0dca8, under: 0xc79a5e, radiusK: 1.45, amp: 1.4 });
  if (!land) return;
  const g = land.group;
  const clear = ctx.clearRadius || 10;
  const oceanR = outerSize(ctx, 3.4);

  // the ocean — a huge, vivid tropical plane over its own deep slab
  const ocean = new THREE.Mesh(
    new THREE.CircleGeometry(oceanR, 48),
    new THREE.MeshStandardMaterial({ color: 0x1fb6d6, roughness: 0.1, transparent: true, opacity: 0.9, flatShading: true })
  );
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.y = -0.5;
  textureCircleWater(ocean, oceanR);
  g.add(ocean);
  const slab = new THREE.Mesh(new THREE.CylinderGeometry(oceanR * 0.995, oceanR * 0.8, 7, 40), mat(0x25607e));
  slab.position.y = -4.1;
  g.add(slab);

  // the fishing pier reaches out FROM the western shore OVER the ocean (not
  // stranded on the sand) — base near the shoreline, deck extending to water
  if (typeof ctx.setDockSpot === 'function') {
    ctx.setDockSpot(-land.R * 0.98, land.zC, Math.PI, -0.5);
  }

  // white wave rings drifting toward shore
  const waves = [];
  const waveGeo = new THREE.RingGeometry(1.0, 1.16, 26);
  for (let i = 0; i < 8; i++) {
    const ring = new THREE.Mesh(waveGeo, new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.5, side: THREE.DoubleSide, depthWrite: false,
    }));
    ring.rotation.x = -Math.PI / 2;
    waves.push({ ring, a: rng() * Math.PI * 2, r0: land.R * (1.15 + rng() * 0.5), phase: rng() });
    g.add(ring);
  }

  // tiny sail boats bobbing out on the water
  const boats = [];
  for (let i = 0; i < 3; i++) {
    const b = new THREE.Group();
    const hull = box(2.2, 0.5, 1.0, i % 2 ? 0xc23b2e : 0x3a6ea8);
    hull.position.y = 0.25;
    b.add(hull);
    const mast = cyl(0.06, 0.08, 2.6, P.woodDark, 5);
    mast.position.y = 1.7;
    b.add(mast);
    const sail = leafMesh(1.9, 0.75, 0xf6f2e8);
    sail.position.set(0.08, 0.75, 0);
    b.add(sail);
    const a = rng() * Math.PI * 2;
    const r = land.R * (1.25 + rng() * 0.6);
    b.position.set(Math.cos(a) * r, -0.4, Math.sin(a) * r);
    b.rotation.y = rng() * Math.PI * 2;
    g.add(b);
    boats.push({ b, phase: rng() * 6 });
  }

  // LOTS of big, lush palm clusters all over the sand — the hero greenery
  for (const [x, z] of outerPoints(ctx, rng, land.R, clear + 3, 26)) {
    const n = 1 + Math.floor(rng() * 3);
    for (let k = 0; k < n; k++) {
      const p = buildPalm(rng, null);
      const jx = (rng() - 0.5) * 5, jz = (rng() - 0.5) * 5;
      p.position.set(x + jx, land.heightAt(x + jx, z + jz), z + jz - land.zC);
      p.rotation.y = rng() * Math.PI * 2;
      p.scale.setScalar(1.4 + rng() * 1.1); // large, amazing palms
      g.add(p);
    }
  }

  // ---- a striped lighthouse standing on a rocky headland ----
  {
    const la = Math.PI * 0.62 + rng() * 0.5;
    const lr = land.R * (1.02 + rng() * 0.1);
    const lx = Math.cos(la) * lr, lz = Math.sin(la) * lr;
    const light = new THREE.Group();
    // rocky base mound
    for (let i = 0; i < 5; i++) {
      const rock = ball(1.6 + rng() * 1.2, i % 2 ? 0x8a7d70 : 0x76685c, 0.8, 6);
      rock.position.set((rng() - 0.5) * 3.4, rng() * 0.6, (rng() - 0.5) * 3.4);
      light.add(rock);
    }
    const H = 13;
    const tower = cyl(1.05, 1.7, H, 0xf6f1e6, 12);
    tower.position.y = H / 2 + 0.6;
    light.add(tower);
    // red bands
    for (let i = 0; i < 3; i++) {
      const band = cyl(1.18 - i * 0.2, 1.5 - i * 0.2, 1.5, 0xd9463a, 12);
      band.position.y = 1.4 + i * (H / 3.2) + 1.2;
      light.add(band);
    }
    const gallery = cyl(1.6, 1.6, 0.5, 0x6b5c50, 12);
    gallery.position.y = H + 0.6;
    light.add(gallery);
    const lantern = cyl(1.15, 1.15, 1.7, 0xfff2b0, 10, { emissive: 0xffcc55, emissiveIntensity: 0.6 });
    lantern.position.y = H + 1.6;
    light.add(lantern);
    const cap = cone(1.5, 1.5, 0xc0392b, 10);
    cap.position.y = H + 3.1;
    light.add(cap);
    light.position.set(lx, land.heightAt(lx, lz + land.zC), lz);
    light.rotation.y = rng() * Math.PI * 2;
    g.add(light);
  }

  // ---- a big anchored sailboat out on the water ----
  {
    const ba = Math.PI * 1.35 + rng() * 0.4;
    const br = land.R * (1.35 + rng() * 0.2);
    const boat = new THREE.Group();
    const hull = box(8.5, 2.1, 3.2, 0xded4c4);
    hull.position.y = 0.6;
    boat.add(hull);
    const hullBot = box(6.5, 1.3, 2.6, 0x9c3f34);
    hullBot.position.y = -0.4;
    boat.add(hullBot);
    const cabin = box(2.6, 1.3, 2.2, 0xf0e7d4);
    cabin.position.set(-1.2, 1.85, 0);
    boat.add(cabin);
    const mast = cyl(0.14, 0.18, 11, 0x8a6a44, 6);
    mast.position.set(1.2, 6, 0);
    boat.add(mast);
    const sail1 = leafMesh(6.2, 2.6, 0xffffff);
    sail1.position.set(1.2, 6.4, 0.1);
    sail1.rotation.y = Math.PI / 2;
    boat.add(sail1);
    const sail2 = leafMesh(4.2, 1.9, 0xe8563e);
    sail2.position.set(2.6, 4.8, 0.1);
    sail2.rotation.y = Math.PI / 2;
    boat.add(sail2);
    boat.position.set(Math.cos(ba) * br, -0.3, Math.sin(ba) * br);
    boat.rotation.y = ba + Math.PI / 2 + (rng() - 0.5) * 0.5;
    boat.scale.setScalar(1.2);
    g.add(boat);
    boats.push({ b: boat, phase: rng() * 6 });
  }

  // ---- rocky cliff headlands rising from the beach on one flank ----
  for (let i = 0; i < 3; i++) {
    const ca = Math.PI * 1.75 + (i - 1) * 0.28 + rng() * 0.12;
    const cr = land.R * (0.95 + rng() * 0.22);
    const cx = Math.cos(ca) * cr, cz = Math.sin(ca) * cr;
    const cliff = new THREE.Group();
    const hgt = 7 + rng() * 6;
    for (const [k, hh] of [[1.0, hgt * 0.5], [0.74, hgt * 0.32], [0.5, hgt * 0.24]]) {
      const base = 3.4 + rng() * 2.2;
      let yAcc = 0;
      const layer = cyl(base * k * 0.82, base * k, hh, i % 2 ? 0x8f7f6f : 0x7d6d5e, 7);
      layer.position.y = yAcc + hh / 2;
      cliff.add(layer);
      yAcc += hh;
    }
    // green scrub on top
    const scrub = ball(1.6, 0x4f9e57, 0.7, 6);
    scrub.position.y = hgt * 0.55;
    cliff.add(scrub);
    cliff.position.set(cx, land.heightAt(cx, cz + land.zC) - 0.5, cz);
    cliff.rotation.y = rng() * Math.PI;
    g.add(cliff);
  }

  // ---- colorful surfboards planted upright in the sand ----
  const surfCols = [0xe8563e, 0x2fb3c8, 0xf2b134, 0x8e5bd0, 0x4caf50];
  for (let i = 0; i < 5; i++) {
    const p = outerPoint(ctx, rng, land.R, clear + 2);
    if (!p) continue;
    const board = new THREE.Group();
    const b = new THREE.Mesh(new THREE.CapsuleGeometry(0.5, 2.6, 3, 8), mat(surfCols[i % surfCols.length]));
    b.scale.set(1, 1, 0.22);
    b.position.y = 1.8;
    board.add(b);
    const stripe = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 2.5, 3, 6), mat(0xffffff));
    stripe.scale.set(1, 1, 0.3);
    stripe.position.set(0, 1.8, 0.06);
    board.add(stripe);
    board.position.set(p[0], land.heightAt(p[0], p[1]), p[1] - land.zC);
    board.rotation.set((rng() - 0.5) * 0.18, rng() * Math.PI, (rng() - 0.5) * 0.35);
    g.add(board);
  }

  // ---- sun loungers near the shoreline ----
  for (let i = 0; i < 3; i++) {
    const p = outerPoint(ctx, rng, land.R, clear + 2);
    if (!p) continue;
    const set = new THREE.Group();
    const seat = box(1.0, 0.14, 2.2, i % 2 ? 0xece4d4 : 0xdfe9f0);
    seat.position.y = 0.5;
    seat.rotation.x = -0.18;
    set.add(seat);
    for (const sx of [-0.42, 0.42]) for (const sz of [-0.9, 0.9]) {
      const leg = cyl(0.05, 0.05, 0.5, 0x9a806a, 4);
      leg.position.set(sx, 0.25, sz);
      set.add(leg);
    }
    set.position.set(p[0], land.heightAt(p[0], p[1]), p[1] - land.zC);
    set.rotation.y = rng() * Math.PI * 2;
    g.add(set);
  }

  // beach umbrellas
  for (let i = 0; i < 3; i++) {
    const p = outerPoint(ctx, rng, land.R, clear + 2);
    if (!p) continue;
    const u = new THREE.Group();
    const pole = cyl(0.06, 0.08, 2.6, 0xf1e6cf, 5);
    pole.position.y = 1.3;
    u.add(pole);
    const top = cone(1.7, 0.75, i % 2 ? 0xe0563e : 0x3a86c8, 8);
    top.position.y = 2.6;
    u.add(top);
    u.position.set(p[0], land.heightAt(p[0], p[1]), p[1] - land.zC);
    u.rotation.z = (rng() - 0.5) * 0.2;
    g.add(u);
  }

  // starfish on the sand (low)
  const stars = outerPoints(ctx, rng, land.R, 2, 7).map(([x, z]) => ({
    x, y: land.heightAt(x, z) + 0.1, z: z - land.zC, ry: rng() * Math.PI, s: 0.6 + rng() * 0.7,
  }));
  outerInstanced(g, new THREE.ConeGeometry(0.5, 0.18, 5), mat(0xe86a5a), stars);

  // rocks poking from the water
  const rocks = [];
  for (let i = 0; i < 6; i++) {
    const a = rng() * Math.PI * 2;
    const r = land.R * (1.1 + rng() * 0.7);
    rocks.push({ x: Math.cos(a) * r, y: -0.6 + rng() * 0.3, z: Math.sin(a) * r, s: 0.8 + rng() * 1.4, sy: 0.7, ry: rng() * Math.PI });
  }
  outerInstanced(g, new THREE.SphereGeometry(0.9, 6, 5), mat(0x76655a), rocks);

  outerAnimate(ctx)((now) => {
    const t = now * 0.001;
    for (const w of waves) {
      const cyc = (t * 0.14 + w.phase) % 1;
      const r = w.r0 - cyc * (w.r0 - land.R * 0.98);
      w.ring.position.set(Math.cos(w.a) * r, -0.32, Math.sin(w.a) * r);
      const sc = 3.2 + cyc * 2.2;
      w.ring.scale.set(sc, sc, 1);
      w.ring.material.opacity = 0.5 * Math.sin(Math.PI * cyc);
    }
    for (const bt of boats) {
      bt.b.position.y = -0.35 + Math.sin(t * 0.9 + bt.phase) * 0.16;
      bt.b.rotation.z = Math.sin(t * 0.7 + bt.phase) * 0.05;
    }
  });
}

// ---------- boreal outer ----------

// Boreal wilderness valley, after the redwood-country reference: colossal
// redwoods over a dense spruce forest, a big lake with pine islets, a tiered
// waterfall breathing mist, a boulder-lined river with a plank bridge, and a
// rock mesa carrying a fire watchtower. Same glitch-proof floor machinery as
// the meadow valley, recolored for mossy forest ground.
function borealOuter(ctx) {
  if (!ctx || !ctx.scene || typeof ctx.scene.add !== 'function') return;
  const rng = outerRng(ctx);
  const zC = ctx.zCenter || 0;
  const clear = ctx.clearRadius || 10;
  const flatR = clear + 30;
  const iHalf = Math.max(ctx.islandW || 30, ctx.islandD || 30) / 2;
  const R = outerSize(ctx, 3.1);

  // the big lake sits behind the farm, like the reference
  const lakeA = -Math.PI / 2 + (rng() - 0.5) * 0.4;
  const lake = { x: Math.cos(lakeA) * R * 0.42, z: zC + Math.sin(lakeA) * R * 0.42, r: R * 0.19 };

  const heightAt = meadowHeightField(ctx, rng, R, lake);
  const land = meadowValleyFloor(ctx, rng, R, heightAt, { top: 0x5c9459, skirt: 0x54483c });
  if (!land) return;
  const g = land.group;

  // ---- snowy mountain ring (colder rock, more caps than the meadow) ----
  // every peak stays at >= 0.9R where the height field is fully flattened —
  // a cone base grazing partially-rolled ground paints dark glitch patches
  const rockGeos = [meadowPeakGeo(rng, 8), meadowPeakGeo(rng, 7), meadowPeakGeo(rng, 9)];
  const rockCols = [0x746a60, 0x7d7268, 0x6b6158];
  const rockPl = [[], [], []];
  const snowGeo = meadowPeakGeo(rng, 8);
  const snowPl = [];
  const addPeak = (x, z, baseR, H, snowy) => {
    const gy = heightAt(x, z) - 6;
    const HH = H + 6;
    rockPl[Math.floor(rng() * 3)].push({ x, y: gy, z: z - zC, s: baseR, sy: HH / baseR, ry: rng() * Math.PI * 2 });
    if (snowy) {
      const capR = baseR * 0.48, capH = HH * 0.42;
      snowPl.push({ x, y: gy + HH * 0.58, z: z - zC, s: capR, sy: capH / capR, ry: rng() * Math.PI * 2 });
    }
  };
  const nMtn = 13 + Math.floor(rng() * 3);
  for (let i = 0; i < nMtn; i++) {
    const a = (i / nMtn) * Math.PI * 2 + (rng() - 0.5) * 0.26;
    const rr = R * (0.9 + rng() * 0.09);
    const H = 40 + rng() * 34;
    addPeak(Math.cos(a) * rr, zC + Math.sin(a) * rr, Math.min(H * (0.8 + rng() * 0.35), 62), H, H > 46);
    if (rng() < 0.6) {
      const side = rng() < 0.5 ? 1 : -1;
      const off = 40 + rng() * 20;
      const sh = H * (0.55 + rng() * 0.3);
      addPeak(Math.cos(a) * rr - Math.sin(a) * off * side, zC + Math.sin(a) * rr + Math.cos(a) * off * side,
        Math.min(sh * (0.9 + rng() * 0.3), 55), sh, sh > 46);
    }
  }
  // the falls mountain: a dedicated massif west-behind the lake that the
  // big cascade pours out of
  const wfA = lakeA - 0.62;
  const wfMtn = { x: Math.cos(wfA) * R * 0.92, z: zC + Math.sin(wfA) * R * 0.92, H: 64, baseR: 60 };
  addPeak(wfMtn.x, wfMtn.z, wfMtn.baseR, wfMtn.H, true);
  for (let i = 0; i < 3; i++) {
    const m = outerInstanced(g, rockGeos[i], mat(rockCols[i]), rockPl[i]);
    if (m) m.castShadow = false;
  }
  const snowM = outerInstanced(g, snowGeo, mat(0xf4f8fb), snowPl);
  if (snowM) snowM.castShadow = false;

  // ---- the lake, its rocky pine islets, and the fishing dock ----
  if (typeof ctx.setDockSpot === 'function') {
    const dl = Math.hypot(lake.x, lake.z - zC) || 1;
    const tx = lake.x / dl, tz = (lake.z - zC) / dl;
    ctx.setDockSpot(lake.x - tx * lake.r * 1.02, lake.z - tz * lake.r * 1.02, Math.atan2(-tz, tx), 0.42);
  }
  const wtex = waterTexture();
  const lakeRim = meadowBlobDisc(rng, lake.r * 1.08, 0x8fb4c8);
  lakeRim.position.set(lake.x, 0.16, lake.z - zC);
  g.add(lakeRim);
  const lakeWater = meadowBlobDisc(rng, lake.r, 0xffffff, { map: wtex, roughness: 0.16 });
  lakeWater.position.set(lake.x, 0.3, lake.z - zC);
  g.add(lakeWater);
  for (let i = 0; i < 4; i++) {
    const ia = rng() * Math.PI * 2;
    const ir = lake.r * (0.25 + rng() * 0.42);
    const islet = new THREE.Group();
    const rock = ball(2.2 + rng() * 1.6, 0x767b7d, 0.5, 7);
    islet.add(rock);
    const nPine = 1 + Math.floor(rng() * 3);
    for (let p = 0; p < nPine; p++) {
      // proper trees, not shrubs — the reference islets carry full pines
      const ps = 1.6 + rng() * 1.1;
      const px = (rng() - 0.5) * 2.4, pz = (rng() - 0.5) * 2.4;
      const tr = cyl(0.12 * ps, 0.2 * ps, 1.4 * ps, P.woodDark, 5);
      tr.position.set(px, 1.0 + 0.7 * ps, pz);
      islet.add(tr);
      for (let t = 0; t < 4; t++) {
        const cn = cone((1.5 - t * 0.32) * ps, 1.25 * ps, t % 2 ? 0x2c5e3e : 0x35704a, 7);
        cn.position.set(px, 1.0 + (1.7 + t * 0.9) * ps, pz);
        islet.add(cn);
      }
    }
    islet.position.set(lake.x + Math.cos(ia) * ir, 0.25, lake.z - zC + Math.sin(ia) * ir);
    g.add(islet);
  }

  // ---- the great waterfall: it pours out of the falls mountain itself ----
  const foams = [];
  const mists = [];
  // the cascade base sits on the mountain's flank, facing the lake
  const toLakeX = lake.x - wfMtn.x, toLakeZ = lake.z - wfMtn.z;
  const toLakeL = Math.hypot(toLakeX, toLakeZ) || 1;
  const wfx = wfMtn.x + (toLakeX / toLakeL) * wfMtn.baseR * 0.72;
  const wfz = wfMtn.z + (toLakeZ / toLakeL) * wfMtn.baseR * 0.72;
  {
    const wf = new THREE.Group();
    const FH = 34; // total drop — reads as part of the mountain, not a prop
    // dark gorge walls flanking the chute, carved into the flank
    for (const side of [-1, 1]) {
      const wall = box(4.5, FH * 1.02, 9, 0x5d564f);
      wall.position.set(side * 7.2, FH * 0.48, -3.5);
      wall.rotation.y = side * 0.18;
      wall.rotation.z = side * 0.05;
      wall.castShadow = false;
      wf.add(wall);
      const mossW = ball(3.2, 0x4c7f4a, 0.45, 7);
      mossW.position.set(side * 7.0, FH * 0.98, -3.2);
      wf.add(mossW);
    }
    // three stacked sheets stepping down the flank, widening as they fall
    const sheet = (w, h, y, z, tilt) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({
        color: 0xd9eef9, roughness: 0.2, flatShading: true, transparent: true, opacity: 0.93, side: THREE.DoubleSide,
      }));
      m.position.set(0, y, z);
      m.rotation.x = tilt;
      wf.add(m);
      return m;
    };
    sheet(6.5, FH * 0.4, FH * 0.8, -2.2, -0.1);
    sheet(8.2, FH * 0.42, FH * 0.44, 0.2, -0.14);
    sheet(9.8, FH * 0.4, FH * 0.1, 2.8, -0.16);
    // ledge pools where the tiers break
    const ledge1 = flatDisc(4.4, 0x5aa4d6, 0.14, 10);
    ledge1.position.set(0, FH * 0.615, -0.8);
    wf.add(ledge1);
    const ledge2 = flatDisc(5.2, 0x5aa4d6, 0.14, 10);
    ledge2.position.set(0, FH * 0.28, 1.8);
    wf.add(ledge2);
    // the plunge pool
    const pool = meadowBlobDisc(rng, 8.5, 0xffffff, { map: wtex, roughness: 0.2 });
    pool.position.set(0, 0.14, 7.5);
    wf.add(pool);
    for (let i = 0; i < 7; i++) {
      const f = ball(0.7 + rng() * 0.5, 0xf2fafd, 0.6, 6);
      f.position.set((i - 3) * 1.4 + (rng() - 0.5) * 0.6, 0.4, 5.2 + rng() * 2.4);
      wf.add(f);
      foams.push({ f, ph: rng() * 6 });
    }
    // spray boulders at the base
    for (let i = 0; i < 6; i++) {
      const b = ball(1.0 + rng() * 1.2, 0x6e6862, 0.7, 6);
      b.position.set((rng() - 0.5) * 14, 0.5, 3.5 + rng() * 6);
      wf.add(b);
    }
    // mist columns off every pool
    for (let i = 0; i < 10; i++) {
      const m = ball(1.6, 0xffffff, 0.65, 6);
      m.material.transparent = true;
      m.material.opacity = 0;
      const tier = i % 3;
      m.userData = {
        ph: rng(),
        baseY: tier === 0 ? 0.8 : tier === 1 ? FH * 0.28 + 0.6 : FH * 0.62 + 0.6,
        z: tier === 0 ? 7 : tier === 1 ? 1.8 : -0.8,
        x: (rng() - 0.5) * 5,
      };
      wf.add(m);
      mists.push(m);
    }
    wf.position.set(wfx, heightAt(wfx, wfz), wfz - zC);
    wf.rotation.y = Math.atan2(toLakeX, toLakeZ);
    g.add(wf);
    // the race: plunge pool down to the lake
    waterRibbon(land, [
      [wfx + (toLakeX / toLakeL) * 9, wfz + (toLakeZ / toLakeL) * 9],
      [wfx + (lake.x - wfx) * 0.45 + (rng() - 0.5) * 8, wfz + (lake.z - wfz) * 0.45],
      [lake.x - (toLakeX / toLakeL) * lake.r * 0.5, lake.z - (toLakeZ / toLakeL) * lake.r * 0.5],
    ], 3.4, 0.32);
  }

  // ---- the river: lake outflow winding past the farm's flank ----
  const riverPts = [];
  {
    const ex = R * 0.62, ez = zC + R * 0.7; // exits front-right
    const x0 = lake.x + lake.r * 0.55, z0 = lake.z + lake.r * 0.75;
    for (let i = 0; i <= 5; i++) {
      const t = i / 5;
      const wob = Math.sin(t * 7.2 + 1.7) * R * 0.055 * Math.sin(t * Math.PI);
      riverPts.push([x0 + (ex - x0) * t + wob, z0 + (ez - z0) * t - wob * 0.4]);
    }
    waterRibbon(land, riverPts, 2.6, 0.3);
    // boulder-lined banks
    const bankPl = [];
    for (let i = 0; i < 42; i++) {
      const t = rng();
      const k = Math.min(4, Math.floor(t * 5));
      const [ax, az] = riverPts[k], [bx, bz] = riverPts[k + 1];
      const u = t * 5 - k;
      const px = ax + (bx - ax) * u, pz = az + (bz - az) * u;
      const dx = bx - ax, dz = bz - az;
      const dl = Math.hypot(dx, dz) || 1;
      const side = rng() < 0.5 ? 1 : -1;
      const off = 1.9 + rng() * 1.6;
      const x = px + (-dz / dl) * off * side, z = pz + (dx / dl) * off * side;
      if (distToIsland(ctx, x, z) < clear + 2) continue;
      bankPl.push({ x, y: heightAt(x, z) + 0.25, z: z - zC, s: 0.4 + rng() * 0.85, sy: 0.75, ry: rng() * Math.PI * 2 });
    }
    outerInstanced(g, new THREE.DodecahedronGeometry(0.8, 0), mat(0x7d7a76), bankPl);
    // plank bridge over the river's mid-course
    const [ax, az] = riverPts[2], [bx, bz] = riverPts[3];
    const bxm = (ax + bx) / 2, bzm = (az + bz) / 2;
    const bridge = new THREE.Group();
    const deckB = box(5.6, 0.28, 2.5, P.wood);
    deckB.position.y = 0.85;
    bridge.add(deckB);
    for (const sx of [-2.3, 0, 2.3]) {
      for (const sz of [-1.05, 1.05]) {
        const post = cyl(0.11, 0.13, 1.15, P.woodDark, 5);
        post.position.set(sx, 1.35, sz);
        bridge.add(post);
      }
    }
    for (const sz of [-1.05, 1.05]) {
      const rail = box(5.4, 0.12, 0.12, P.woodDark);
      rail.position.set(0, 1.85, sz);
      bridge.add(rail);
    }
    bridge.position.set(bxm, heightAt(bxm, bzm), bzm - zC);
    // local +z along the flow → the deck's long axis spans ACROSS the river
    bridge.rotation.y = Math.atan2(bx - ax, bz - az);
    g.add(bridge);
  }

  // ---- rock mesa with the fire watchtower, east of the lake ----
  {
    const ma = lakeA + 1.05;
    const mr = R * 0.6;
    const mx = Math.cos(ma) * mr, mz = zC + Math.sin(ma) * mr;
    const mesaH = 15;
    const mesaGeo = new THREE.CylinderGeometry(9, 13.5, mesaH, 9, 2);
    const mp = mesaGeo.attributes.position;
    const mv = new THREE.Vector3();
    for (let i = 0; i < mp.count; i++) {
      mv.fromBufferAttribute(mp, i);
      const ang = Math.atan2(mv.z, mv.x);
      const j = 1 + 0.1 * Math.sin(ang * 4 + 1.3) + 0.06 * Math.cos(ang * 7 + mv.y);
      mp.setXYZ(i, mv.x * j, mv.y, mv.z * j);
    }
    mesaGeo.computeVertexNormals();
    const mesa = new THREE.Mesh(mesaGeo, mat(0x767069));
    mesa.position.set(mx, heightAt(mx, mz) + mesaH / 2 - 1.5, mz - zC);
    mesa.castShadow = false;
    g.add(mesa);
    const mossTop = flatDisc(8.6, 0x5c8f57, 0.1, 10);
    mossTop.position.set(mx, heightAt(mx, mz) + mesaH - 1.44, mz - zC);
    g.add(mossTop);

    // the fire watchtower: tall lattice legs, railed deck, lookout cab
    const tower = new THREE.Group();
    const th = 11;
    for (const [sx, sz] of [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]) {
      const leg = cyl(0.13, 0.2, th, P.woodDark, 5);
      leg.position.set(sx * (0.72 + 0.0), th / 2, sz * 0.72);
      leg.rotation.z = -sx * 0.055;
      leg.rotation.x = sz * 0.055;
      tower.add(leg);
    }
    for (let lvl = 0; lvl < 3; lvl++) {
      const y = th * (0.22 + lvl * 0.26);
      const w = 2.5 - lvl * 0.32;
      for (const [rz, dx, dz] of [[0, 0, w / 2], [0, 0, -w / 2], [Math.PI / 2, w / 2, 0], [Math.PI / 2, -w / 2, 0]]) {
        const braceA = box(w * 1.32, 0.09, 0.09, P.woodDark);
        braceA.position.set(dx, y, dz);
        braceA.rotation.y = rz;
        braceA.rotation.z = 0.42;
        tower.add(braceA);
        const braceB = braceA.clone();
        braceB.rotation.z = -0.42;
        tower.add(braceB);
      }
    }
    const deckT = box(3.5, 0.24, 3.5, P.wood);
    deckT.position.y = th;
    tower.add(deckT);
    for (const [sx, sz] of [[-1.6, 0], [1.6, 0], [0, -1.6], [0, 1.6], [-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]]) {
      const post = cyl(0.06, 0.06, 0.8, P.woodDark, 4);
      post.position.set(sx, th + 0.5, sz);
      tower.add(post);
    }
    const railT = box(3.4, 0.08, 0.08, P.woodDark);
    for (const [ry, dz] of [[0, 1.6], [0, -1.6]]) {
      const r1 = railT.clone();
      r1.position.set(0, th + 0.85, dz);
      r1.rotation.y = ry;
      tower.add(r1);
    }
    for (const dx of [1.6, -1.6]) {
      const r2 = railT.clone();
      r2.position.set(dx, th + 0.85, 0);
      r2.rotation.y = Math.PI / 2;
      tower.add(r2);
    }
    const cab = box(2.3, 1.5, 2.3, 0x8a6a48);
    cab.position.y = th + 1.0;
    tower.add(cab);
    for (const [wx, wz, wr] of [[0, 1.16, 0], [0, -1.16, 0], [1.16, 0, Math.PI / 2], [-1.16, 0, Math.PI / 2]]) {
      const win = box(1.7, 0.6, 0.06, 0xbfd8e2);
      win.position.set(wx, th + 1.15, wz);
      win.rotation.y = wr;
      tower.add(win);
    }
    const roofT = box(3.1, 0.2, 3.1, 0x4c4038);
    roofT.position.y = th + 1.9;
    tower.add(roofT);
    const roofT2 = cone(2.2, 1.1, 0x5a4c40, 4);
    roofT2.position.y = th + 2.5;
    roofT2.rotation.y = Math.PI / 4;
    tower.add(roofT2);
    tower.scale.setScalar(2); // twice the size — it read too small against the sequoias
    tower.position.set(mx, heightAt(mx, mz) + mesaH - 1.4, mz - zC);
    tower.rotation.y = rng() * Math.PI;
    g.add(tower);
  }

  // ---- colossal sequoias: thick rust trunks under FULL conical crowns ----
  // the crown is a dense stack of overlapping cones over the top ~65% of the
  // trunk — spacing is smaller than cone height, so no daylight between tiers
  const rwTrunk = [], rwTierA = [], rwTierB = [], rwTop = [];
  let placedRw = 0;
  for (let tries = 0; tries < 160 && placedRw < 24; tries++) {
    const a = rng() * Math.PI * 2;
    const r = R * (0.28 + rng() * 0.56);
    const x = Math.cos(a) * r, z = zC + Math.sin(a) * r;
    if (distToIsland(ctx, x, z) < clear + 14) continue;
    if (Math.hypot(x - lake.x, z - lake.z) < lake.r + 8) continue;
    if (Math.hypot(x - wfx, z - wfz) < 16) continue;
    placedRw++;
    const H = 46 + rng() * 28;
    const girth = 2.0 + rng() * 1.0;
    const h0 = heightAt(x, z);
    const lz = z - zC;
    rwTrunk.push({ x, y: h0 + H / 2, z: lz, s: girth, sy: H / girth, ry: rng() * Math.PI });
    const crown0 = 0.35; // crown starts at 35% of height
    const tiers = 13;
    const coneH = (H * (1 - crown0)) / tiers * 2.1; // >2x spacing = solid overlap
    for (let t = 0; t < tiers; t++) {
      const u = t / (tiers - 1);
      const ty = h0 + H * (crown0 + (1 - crown0) * u);
      const ts = (8.0 - u * 5.6) * (0.9 + rng() * 0.22);
      (t % 2 ? rwTierA : rwTierB).push({
        x: x + (rng() - 0.5) * 0.9, y: ty, z: lz + (rng() - 0.5) * 0.9,
        s: ts, sy: coneH / ts, ry: rng() * Math.PI,
      });
    }
    rwTop.push({ x, y: h0 + H + 1.6, z: lz, s: 2.6, sy: 1.9, ry: rng() * Math.PI });
  }
  const rwT = outerInstanced(g, new THREE.CylinderGeometry(0.42, 0.8, 1, 7), mat(0x94512d), rwTrunk);
  if (rwT) rwT.castShadow = false; // 60-unit shadow streaks would swallow the forest floor
  const rwA = outerInstanced(g, new THREE.ConeGeometry(1, 1, 8), mat(0x2d5c3c), rwTierA);
  const rwB = outerInstanced(g, new THREE.ConeGeometry(1, 1, 8), mat(0x386b46), rwTierB);
  if (rwA) rwA.castShadow = false;
  if (rwB) rwB.castShadow = false;
  outerInstanced(g, new THREE.ConeGeometry(0.9, 1.7, 7), mat(0x2d5c3c), rwTop);

  // ---- the spruce forest: dense clumps, a few snow-dusted tips ----
  const sTrunk = [], sT1 = [], sT2 = [], sT3 = [], sCap = [];
  const treeMin = clear + 7;
  const addSpruce = (x, z, y) => {
    const s = 1.5 + rng() * 1.5;
    const lz = z - zC;
    const ry = rng() * Math.PI;
    sTrunk.push({ x, y: y + 0.7 * s, z: lz, s, ry });
    sT1.push({ x, y: y + 1.9 * s, z: lz, s, ry });
    sT2.push({ x, y: y + 3.1 * s, z: lz, s, ry });
    sT3.push({ x, y: y + 4.0 * s, z: lz, s: s * 0.8, ry });
    if (rng() < 0.16) sCap.push({ x, y: y + 4.55 * s, z: lz, s: s * 0.62, ry });
  };
  const nearRiver = (x, z) => riverPts.some(([rx, rz2]) => Math.hypot(x - rx, z - rz2) < 4);
  let clumps = 0;
  for (let tries = 0; tries < 160 && clumps < 24; tries++) {
    const a = rng() * Math.PI * 2;
    const cr = R * (0.24 + rng() * 0.62);
    const cx = Math.cos(a) * cr, cz = zC + Math.sin(a) * cr;
    if (distToIsland(ctx, cx, cz) < treeMin + 8) continue;
    if (Math.hypot(cx - lake.x, cz - lake.z) < lake.r + 8) continue;
    clumps++;
    const spread = 15 + rng() * 16;
    const count = Math.round(24 + 30 * (cr / R));
    for (let i = 0; i < count; i++) {
      const x = cx + (rng() - 0.5) * 2 * spread;
      const z = cz + (rng() - 0.5) * 2 * spread;
      if (distToIsland(ctx, x, z) < treeMin) continue;
      if (Math.hypot(x - lake.x, z - lake.z) < lake.r + 3) continue;
      if (Math.hypot(x, z - zC) > R * 0.95) continue;
      if (nearRiver(x, z)) continue;
      addSpruce(x, z, heightAt(x, z));
    }
  }
  const spruceDark = mat(0x2c5e3e), spruceLight = mat(0x35704a);
  outerInstanced(g, new THREE.CylinderGeometry(0.16, 0.28, 1.4, 6), mat(P.woodDark), sTrunk);
  outerInstanced(g, new THREE.ConeGeometry(1.35, 2.4, 7), spruceDark, sT1);
  outerInstanced(g, new THREE.ConeGeometry(1.0, 2.1, 7), spruceLight, sT2);
  outerInstanced(g, new THREE.ConeGeometry(0.62, 1.7, 7), spruceDark, sT3);
  outerInstanced(g, new THREE.ConeGeometry(0.34, 0.7, 6), mat(0xf2f6f8), sCap);

  // ---- ground story: boulders, stumps, bushes, saplings, snow patches ----
  const boulders = outerPoints(ctx, rng, R * 0.95, clear + 2, 70).map(([x, z]) => ({
    x, y: heightAt(x, z) + 0.3, z: z - zC, s: 0.5 + rng() * 1.3, sy: 0.8, ry: rng() * Math.PI * 2,
  }));
  outerInstanced(g, new THREE.DodecahedronGeometry(0.75, 0), mat(0x7d7a76), boulders);
  const stumps = outerPoints(ctx, rng, R * 0.8, clear + 4, 9).map(([x, z]) => ({
    x, y: heightAt(x, z) + 0.3, z: z - zC, s: 0.8 + rng() * 0.5, sy: 0.7, ry: rng() * Math.PI,
  }));
  outerInstanced(g, new THREE.CylinderGeometry(0.5, 0.62, 0.8, 7), mat(0x7a5236), stumps);
  const bushes = outerPoints(ctx, rng, R * 0.95, clear + 2, 44).map(([x, z]) => ({
    x, y: heightAt(x, z) + 0.35, z: z - zC, s: 0.6 + rng() * 0.8, sy: 0.7, ry: rng() * Math.PI * 2,
  }));
  outerInstanced(g, new THREE.SphereGeometry(0.8, 7, 6), mat(0x35714a), bushes);
  const saplings = [];
  for (let i = 0; i < 300 && saplings.length < 120; i++) {
    const a = rng() * Math.PI * 2;
    const r = iHalf + 2 + rng() * (flatR + 6);
    const x = Math.cos(a) * r, z = zC + Math.sin(a) * r;
    const d = distToIsland(ctx, x, z);
    if (d < 2.5 || d > flatR + 8) continue;
    saplings.push({ x, y: heightAt(x, z) + 0.45, z: z - zC, ry: rng() * Math.PI, s: 0.5 + rng() * 0.7 });
  }
  outerInstanced(g, new THREE.ConeGeometry(0.42, 1.5, 6), spruceDark, saplings);
  const patches = outerPoints(ctx, rng, R * 0.9, clear + 6, 14).map(([x, z]) => ({
    x, y: heightAt(x, z) + 0.09, z: z - zC, rx: -Math.PI / 2, s: 0.7 + rng() * 1.0,
  }));
  outerInstanced(g, new THREE.CircleGeometry(1.3, 8), mat(0xeff4f6, { side: THREE.DoubleSide }), patches);

  // ---- the approach path from the farm gate into the valley ----
  const gz0 = zC + (ctx.islandD || 30) / 2 + 2;
  const apts = [[0, gz0]];
  for (let i = 1; i <= 4; i++) {
    const t = i / 4;
    apts.push([Math.sin(t * 4.6) * R * 0.06 * t + (rng() - 0.5) * 4, gz0 + (zC + R * 0.7 - gz0) * t]);
  }
  meadowRibbon(land, apts, 2.4, 0xb59a6b, 0.28);

  // ---- soft animation: foam pulse, rising mist, drifting low fog ----
  const fogPuffs = [];
  for (let i = 0; i < 8; i++) {
    const a = rng() * Math.PI * 2;
    const r = R * (0.62 + rng() * 0.3);
    // each puff is a soft cluster of overlapping translucent balls, not one blimp
    const puff = new THREE.Group();
    const fogMat = new THREE.MeshStandardMaterial({
      color: 0xffffff, roughness: 1, flatShading: true, transparent: true, opacity: 0.34,
    });
    const n = 3 + Math.floor(rng() * 2);
    for (let k = 0; k < n; k++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(2.2 + rng() * 1.8, 7, 6), fogMat);
      b.scale.y = 0.55;
      // irregular clump, not a row — a row of spheres reads as an airship
      const ca = rng() * Math.PI * 2;
      const cr = rng() * 2.8;
      b.position.set(Math.cos(ca) * cr, (rng() - 0.5) * 1.6, Math.sin(ca) * cr * 0.7);
      b.castShadow = false;
      puff.add(b);
    }
    puff.position.set(Math.cos(a) * r, 17 + rng() * 14, Math.sin(a) * r);
    puff.userData = { bx: puff.position.x, ph: rng() * 10, amp: 5 + rng() * 5 };
    g.add(puff);
    fogPuffs.push(puff);
  }
  outerAnimate(ctx)((now) => {
    const t = now * 0.001;
    // water flow is driven globally by tickWater() in the render loop
    for (const fm of foams) {
      const k = 1 + Math.sin(t * 3.1 + fm.ph) * 0.16;
      fm.f.scale.set(k, 0.6 * k, k);
    }
    for (const m of mists) {
      const u = (t * 0.14 + m.userData.ph) % 1;
      m.position.set(m.userData.x + Math.sin(u * 5 + m.userData.ph * 9) * 0.5, m.userData.baseY + u * 7, m.userData.z);
      const k = 0.7 + u * 1.5;
      m.scale.set(k, k * 0.65, k);
      m.material.opacity = 0.4 * Math.sin(u * Math.PI);
    }
    for (const p of fogPuffs) {
      p.position.x = p.userData.bx + Math.sin(t * 0.07 + p.userData.ph) * p.userData.amp;
      p.position.y += Math.sin(t * 0.23 + p.userData.ph * 2) * 0.004;
    }
  });
}

// ---------- desert outer ----------

// rounded-rectangle outline as a Shape (or Path when used as a hole)
function roundedRectShape(halfW, halfD, rad, asHole = false) {
  const s = asHole ? new THREE.Path() : new THREE.Shape();
  const w = halfW, d = halfD, r = Math.min(rad, w, d);
  s.moveTo(-w + r, -d);
  s.lineTo(w - r, -d);
  s.absarc(w - r, -d + r, r, -Math.PI / 2, 0, false);
  s.lineTo(w, d - r);
  s.absarc(w - r, d - r, r, 0, Math.PI / 2, false);
  s.lineTo(-w + r, d);
  s.absarc(-w + r, d - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(-w, -d + r);
  s.absarc(-w + r, -d + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}

// a flat rounded-rect ring band (inner hole cut out) lying in the XZ plane,
// world-scaled UVs so waterTexture() tiles at the lakes' ~9u wave density
function ringBand(innerHalfW, innerHalfD, innerR, band, color, opts) {
  const outer = roundedRectShape(innerHalfW + band, innerHalfD + band, innerR + band, false);
  outer.holes.push(roundedRectShape(innerHalfW, innerHalfD, innerR, true));
  const geo = new THREE.ShapeGeometry(outer, 12);
  geo.rotateX(-Math.PI / 2); // shape's +Y → world +Z
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 9, uv.getY(i) / 9);
  uv.needsUpdate = true;
  return new THREE.Mesh(geo, mat(color, { side: THREE.DoubleSide, ...(opts || {}) }));
}

function desertOuter(ctx) {
  const rng = outerRng(ctx);
  const land = outerLandmass(ctx, { color: 0xddb372, under: 0x8a5638, amp: 2.5, radiusK: 1.95 });
  if (!land) return;
  const g = land.group;
  const clear = ctx.clearRadius || 10;

  // ===== OASIS MOAT: a turquoise water ring hugging the green plateau =====
  const hw = (ctx.islandW || 30) / 2;
  const hd = (ctx.islandD || 30) / 2;
  const corner = 9;        // matches the plateau's rounded-corner radius
  const bank = 3;          // dry sand strip between fence and water
  const moatW = 8;         // width of the water band
  const innerHW = hw + bank, innerHD = hd + bank, innerR = corner + bank;

  // pale seafoam shoreline underneath softens the water's edge
  const shore = ringBand(innerHW - 0.8, innerHD - 0.8, innerR - 0.8, moatW + 1.8, 0xbfeae0);
  shore.position.y = 0.16;
  g.add(shore);
  // bright turquoise base
  const moat = ringBand(innerHW, innerHD, innerR, moatW, 0x2fc4c2, { roughness: 0.3 });
  moat.position.y = 0.28;
  g.add(moat);
  // animated ripple overlay (free via the global tickWater)
  const ripple = ringBand(innerHW, innerHD, innerR, moatW, 0xffffff, {
    map: waterTexture(), transparent: true, opacity: 0.4, roughness: 0.16, depthWrite: false,
  });
  ripple.position.y = 0.31;
  g.add(ripple);

  // ===== OASIS LAGOON: open water off the west shore, so the pier fishes a real
  // lake instead of the desert. It overlaps the moat so the two read as one body. =====
  const lakeR = 26;
  const lake = { x: -(innerHW + moatW + lakeR * 0.75), z: 0, r: lakeR };
  {
    const disc = (r, color, y, opts, seg = 34) => {
      const m = new THREE.Mesh(new THREE.CircleGeometry(r, seg), mat(color, { side: THREE.DoubleSide, ...(opts || {}) }));
      m.rotation.x = -Math.PI / 2; m.position.set(lake.x, y, lake.z); g.add(m); return m;
    };
    disc(lakeR + 5, 0xe6c58a, 0.10);                                     // sandy beach
    disc(lakeR + 1.4, 0xbfeae0, 0.20);                                   // pale shallows
    disc(lakeR, 0x2fc4c2, 0.26, { roughness: 0.3 });                     // turquoise water
    disc(lakeR, 0xffffff, 0.30, { map: waterTexture(), transparent: true, opacity: 0.4, roughness: 0.16, depthWrite: false }); // ripple
    // a fringe of palms, reeds and rocks around the shore
    for (let i = 0; i < 18; i++) {
      const a = rng() * Math.PI * 2, rr = lakeR + 1.5 + rng() * 4;
      const rx = lake.x + Math.cos(a) * rr, rz = lake.z + Math.sin(a) * rr;
      if (rx > -innerHW) continue; // keep clear of the farm side
      const gy = land.heightAt(rx, rz + land.zC);
      if (rng() > 0.45) {
        const p = buildPalm(rng, null);
        p.position.set(rx, gy, rz); p.rotation.y = rng() * Math.PI * 2; p.scale.setScalar(0.7 + rng() * 0.5); g.add(p);
      } else {
        const rk = ball(0.5 + rng() * 0.9, 0xb08a5e, 0.7, 6); rk.position.set(rx, gy + 0.1, rz); g.add(rk);
      }
    }
    // lily pads dotting the lake
    for (let i = 0; i < 10; i++) {
      const a = rng() * Math.PI * 2, rr = rng() * (lakeR - 3);
      const pad = flatDisc(0.5 + rng() * 0.5, rng() > 0.5 ? 0x3f9e4e : 0x4fae5a, 0.33, 7);
      pad.position.set(lake.x + Math.cos(a) * rr, 0.33, lake.z + Math.sin(a) * rr);
      pad.rotation.z = rng() * Math.PI; g.add(pad);
    }
    // pier stands at the NEAR shore (just off the farm's west bank) and reaches
    // WEST out over the water — base grounded on the sand, not stranded mid-lake
    if (typeof ctx.setDockSpot === 'function') {
      ctx.setDockSpot(-(innerHW - 2), land.zC + lake.z, Math.PI, land.topY + 0.28, land.topY);
    }
  }
  const inLake = (wx, wz) => Math.hypot(wx - lake.x, (wz - land.zC) - lake.z) < lake.r + 4;

  // sink the terrain under BOTH water bodies — the moat ring and the lake — below
  // the flat water discs. Out here in the dunes the ground undulates ABOVE the
  // water and pokes sand up through it (the moat's far edge especially), so we
  // carve a shallow basin around the whole farm and under the lake.
  {
    const topMesh = land.group.children.find((c) => c.isMesh && c.geometry && c.geometry.type === 'BufferGeometry');
    if (topMesh) {
      const pos = topMesh.geometry.attributes.position, vv = new THREE.Vector3();
      const floor = -0.7;
      for (let i = 0; i < pos.count; i++) {
        vv.fromBufferAttribute(pos, i);
        // distance out from the farm rectangle, and to the lake centre
        const dFarm = Math.hypot(Math.max(Math.abs(vv.x) - hw, 0), Math.max(Math.abs(vv.z) - hd, 0));
        const dLake = Math.hypot(vv.x - lake.x, vv.z - lake.z);
        let sink, has = false;
        // moat apron: full depth out to the moat's outer edge, ramp back over ~18u
        if (dFarm < moatW + bank + 18) { const s = dFarm <= moatW + bank ? floor : floor * (1 - (dFarm - (moatW + bank)) / 18); sink = s; has = true; }
        // lake basin: full depth inside, ramp over 7u shore
        if (dLake < lakeR + 7) { const s = dLake <= lakeR ? floor : floor * (1 - (dLake - lakeR) / 7); sink = has ? Math.min(sink, s) : s; has = true; }
        if (has && sink < vv.y) pos.setY(i, sink); // only ever lower the ground
      }
      pos.needsUpdate = true;
      topMesh.geometry.computeVertexNormals();
    }
  }

  // ---- dense palms clustered along the OUTER bank ----
  const outerPath = roundedRectShape(innerHW + moatW, innerHD + moatW, innerR + moatW);
  const bankPts = outerPath.getSpacedPoints(48);
  for (let i = 0; i < bankPts.length; i++) {
    if (rng() > 0.6) continue;
    const n = 1 + Math.floor(rng() * 3);
    for (let k = 0; k < n; k++) {
      const nx = bankPts[i].x, nz = bankPts[i].y;
      const nl = Math.hypot(nx, nz) || 1;
      const out = 1.0 + rng() * 2.2;
      const lx = nx + (nx / nl) * out + (rng() - 0.5) * 2.4;
      const lz = nz + (nz / nl) * out + (rng() - 0.5) * 2.4;
      const p = buildPalm(rng, null);
      p.position.set(lx, land.heightAt(lx, lz + land.zC), lz);
      p.rotation.y = rng() * Math.PI * 2;
      p.scale.setScalar(0.85 + rng() * 0.55);
      g.add(p);
    }
  }
  // ---- a scattering of palms on the INNER bank (skip the +z entrance) ----
  const innerPath = roundedRectShape(innerHW - 0.5, innerHD - 0.5, innerR - 0.5);
  for (const pt of innerPath.getSpacedPoints(30)) {
    const lx = pt.x, lz = pt.y;
    if (Math.abs(lx) < 6 && lz > 0) continue; // keep the front gate clear
    if (rng() > 0.32) continue;
    const p = buildPalm(rng, null);
    p.position.set(lx, land.heightAt(lx, lz + land.zC), lz);
    p.rotation.y = rng() * Math.PI * 2;
    p.scale.setScalar(0.7 + rng() * 0.4);
    g.add(p);
  }

  // ---- stone-footed plank bridge across the moat at the front (+z) gate ----
  {
    const spanZ = moatW + bank + 5;
    const czl = hd + bank + moatW / 2; // local z at the moat's front middle
    const bridge = new THREE.Group();
    const deck = box(3.4, 0.32, spanZ, P.wood);
    deck.position.y = 1.35;
    bridge.add(deck);
    for (let i = -3; i <= 3; i++) {
      const plank = box(3.5, 0.08, 0.5, P.woodLight);
      plank.position.set(0, 1.55, i * (spanZ / 8));
      bridge.add(plank);
    }
    for (const sz of [-spanZ / 2 + 1.2, 0, spanZ / 2 - 1.2]) {
      for (const sx of [-1.55, 1.55]) {
        const post = cyl(0.13, 0.15, 2.6, P.woodDark, 5);
        post.position.set(sx, 0.5, sz);
        bridge.add(post);
      }
    }
    for (const sx of [-1.55, 1.55]) {
      const rail = box(0.14, 0.14, spanZ - 1.4, P.woodDark);
      rail.position.set(sx, 1.95, 0);
      bridge.add(rail);
    }
    // stone abutments where the deck meets each bank
    for (const sz of [-spanZ / 2 + 0.6, spanZ / 2 - 0.6]) {
      const ab = box(3.9, 1.4, 1.8, P.stone);
      ab.position.set(0, 0.7, sz);
      bridge.add(ab);
    }
    bridge.position.set(0, 0, czl);
    g.add(bridge);
  }

  // ---- lily pads + the odd lotus dotting the moat ----
  for (let i = 0; i < 18; i++) {
    const bp = bankPts[Math.floor(rng() * bankPts.length)];
    const nl = Math.hypot(bp.x, bp.y) || 1;
    const inward = -(1.5 + rng() * (moatW - 2.5));
    const lx = bp.x + (bp.x / nl) * inward + (rng() - 0.5) * 1.6;
    const lz = bp.y + (bp.y / nl) * inward + (rng() - 0.5) * 1.6;
    const pad = flatDisc(0.5 + rng() * 0.4, rng() > 0.5 ? 0x3f9e4e : 0x4fae5a, 0.34, 7);
    pad.position.set(lx, 0.34, lz);
    pad.rotation.z = rng() * Math.PI;
    g.add(pad);
    if (rng() > 0.62) {
      const lotus = cone(0.16, 0.24, 0xf2a6c8, 6);
      lotus.position.set(lx, 0.5, lz);
      g.add(lotus);
    }
  }

  // ---- sandstone rocks along both banks ----
  const rockPl = [];
  for (const path of [outerPath, roundedRectShape(innerHW, innerHD, innerR)]) {
    const isOuter = path === outerPath;
    for (const pt of path.getSpacedPoints(28)) {
      if (rng() > 0.32) continue;
      const nl = Math.hypot(pt.x, pt.y) || 1;
      const off = (isOuter ? 1 : -1) * (0.5 + rng() * 0.9);
      const lx = pt.x + (pt.x / nl) * off, lz = pt.y + (pt.y / nl) * off;
      rockPl.push({ x: lx, y: land.heightAt(lx, lz + land.zC) + 0.12, z: lz, s: 0.4 + rng() * 0.7, sy: 0.72, ry: rng() * Math.PI * 2 });
    }
  }
  outerInstanced(g, new THREE.DodecahedronGeometry(0.8, 0), mat(0xb08a5e), rockPl);

  // rolling sand dunes — big, smooth, low swells filling the desert floor
  const duneCols = [0xead0a0, 0xe6c184, 0xdcb576, 0xd8ae68, 0xe3c088];
  for (let i = 0; i < 46; i++) {
    const p = outerPoint(ctx, rng, land.R, clear + 6);
    if (!p || inLake(p[0], p[1])) continue;
    const rad = 10 + rng() * 16;
    const dune = ball(rad, duneCols[i % duneCols.length], 0.16, 12);
    dune.rotation.y = rng() * Math.PI;
    const sy = 0.26 + rng() * 0.12;
    dune.scale.set(1.4 + rng() * 0.9, sy, 1 + rng() * 0.6);
    // sink so ~half the crest shows → rolling swell, never fully buried
    dune.position.set(p[0], land.heightAt(p[0], p[1]) - rad * 0.16 * sy * 3.2, p[1] - land.zC);
    g.add(dune);
  }

  // ---- CONTAINMENT RING: big flat-topped sandstone mesas wall in the zone ----
  // grounded on the land edge (like the valley's mountain ring), overlapping so
  // they read as a continuous rocky rim rather than spaced, floating pillars
  const rockCols = [0xcf9a5f, 0xc98a58, 0xd8a86a, 0xbb7d4c, 0xc78a52];
  const strataCol = 0xa9713f; // darker ledge band between layers
  const buildMesa = (base, H, layerN) => {
    const m = new THREE.Group();
    // buried sandy talus so the base blends into the dunes — no floating seam
    const talus = ball(base * 1.35, 0xe0b878, 0.22, 11);
    talus.position.y = -1.2; talus.scale.set(1.2, 0.5, 1.2);
    m.add(talus);
    let y = 0;
    for (let l = 0; l < layerN; l++) {
      const k = 1 - l * (0.13 + rng() * 0.07);        // barely tapers → flat top
      const hh = (H / layerN) * (0.8 + rng() * 0.4);
      const seg = 7 + Math.floor(rng() * 3);
      const layer = cyl(base * k * 0.9, base * k, hh, rockCols[l % rockCols.length], seg);
      // jitter the rim for a craggy, non-perfect silhouette
      const pos = layer.geometry.attributes.position, v = new THREE.Vector3();
      for (let vi = 0; vi < pos.count; vi++) { v.fromBufferAttribute(pos, vi); const j = 1 + (rng() - 0.5) * 0.16; pos.setXYZ(vi, v.x * j, v.y, v.z * j); }
      layer.geometry.computeVertexNormals();
      layer.position.y = y + hh / 2; layer.rotation.y = rng() * Math.PI;
      m.add(layer);
      const band = cyl(base * k * 0.93, base * k * 0.93, hh * 0.12, strataCol, seg);
      band.position.y = y + hh * 0.42; m.add(band);
      y += hh * 0.92;
    }
    // a flat rock cap (deliberately not a spike)
    const cap = cyl(base * 0.55, base * 0.7, H * 0.09, rockCols[0], 8);
    cap.position.y = y + H * 0.03; m.add(cap);
    return m;
  };
  const place = (m, x, z) => {
    m.position.set(x, land.heightAt(x, z + land.zC) - 1.2, z);
    m.rotation.y = rng() * Math.PI;
    g.add(m);
  };
  const nMesa = 15;
  for (let i = 0; i < nMesa; i++) {
    const a = (i / nMesa) * Math.PI * 2 + (rng() - 0.5) * 0.18;
    const rr = land.R * (0.84 + rng() * 0.11);
    const mx = Math.cos(a) * rr, mz = Math.sin(a) * rr;
    const tall = rng() > 0.4;
    const base = tall ? 13 + rng() * 9 : 8 + rng() * 5;
    const H = tall ? 26 + rng() * 16 : 12 + rng() * 8;
    place(buildMesa(base, H, tall ? 3 + Math.floor(rng() * 2) : 2 + Math.floor(rng() * 2)), mx, mz);
    // an overlapping shoulder butte so the rim reads continuous
    if (rng() > 0.35) {
      const off = base * (0.9 + rng() * 0.4), side = rng() < 0.5 ? 1 : -1;
      const sx = mx - Math.sin(a) * off * side, sz = mz + Math.cos(a) * off * side;
      place(buildMesa(base * (0.55 + rng() * 0.25), H * (0.5 + rng() * 0.3), 2 + Math.floor(rng() * 2)), sx, sz);
    }
  }
  // a few smaller buttes scattered on the dune field for depth
  for (let i = 0; i < 5; i++) {
    const p = outerPoint(ctx, rng, land.R * 0.72, clear + 24);
    if (!p || inLake(p[0], p[1])) continue;
    place(buildMesa(5 + rng() * 4, 6 + rng() * 7, 2), p[0], p[1] - land.zC);
  }

  // instanced saguaros (trunk + cap) beyond the clear band
  const sagTrunk = [], sagCap = [];
  for (const [x, z] of outerPoints(ctx, rng, land.R, clear + 3, 22)) {
    if (inLake(x, z)) continue;
    const s = 0.8 + rng() * 0.6;
    const h = land.heightAt(x, z);
    const lz = z - land.zC;
    sagTrunk.push({ x, y: h + 1.7 * s, z: lz, s, ry: rng() * Math.PI });
    sagCap.push({ x, y: h + 3.4 * s, z: lz, s });
  }
  const cactusMat = mat(0x3e7d46);
  outerInstanced(g, new THREE.CylinderGeometry(0.3, 0.38, 3.4, 8), cactusMat, sagTrunk);
  outerInstanced(g, new THREE.SphereGeometry(0.3, 7, 6), cactusMat, sagCap);

  // a few hero saguaros with arms
  for (let i = 0; i < 3; i++) {
    const p = outerPoint(ctx, rng, land.R, clear + 4);
    if (!p || inLake(p[0], p[1])) continue;
    const c = new THREE.Group();
    const h = 3.6 + rng();
    const trunk = cyl(0.32, 0.4, h, 0x3e7d46, 8);
    trunk.position.y = h / 2;
    c.add(trunk);
    for (const side of [-1, 1]) {
      const ay = h * (0.35 + rng() * 0.2);
      const elbow = cyl(0.17, 0.17, 0.6, 0x3e7d46, 6);
      elbow.rotation.z = Math.PI / 2;
      elbow.position.set(side * 0.5, ay, 0);
      c.add(elbow);
      const arm = cyl(0.17, 0.2, 1.2 + rng() * 0.5, 0x3e7d46, 6);
      arm.position.set(side * 0.78, ay + 0.6, 0);
      c.add(arm);
    }
    c.position.set(p[0], land.heightAt(p[0], p[1]), p[1] - land.zC);
    c.rotation.y = rng() * Math.PI * 2;
    c.scale.setScalar(1.1 + rng() * 0.4);
    g.add(c);
  }

  // barrel cacti
  const barrels = outerPoints(ctx, rng, land.R, clear + 2, 16).filter(([x, z]) => !inLake(x, z)).map(([x, z]) => ({
    x, y: land.heightAt(x, z) + 0.35, z: z - land.zC, s: 0.7 + rng() * 0.6, sy: 0.8, ry: rng() * Math.PI,
  }));
  outerInstanced(g, new THREE.SphereGeometry(0.55, 8, 7), mat(0x4e8c4a), barrels);

  // layered red-rock mesas near the rim (hero features)
  let lastMesa = [land.R * 0.7, 0];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + rng() * 1.5;
    const r = land.R * (0.66 + rng() * 0.12);
    const x = Math.cos(a) * r, lz = Math.sin(a) * r;
    const m = new THREE.Group();
    const base = 5 + rng() * 4;
    let y = 0;
    for (const [k, hh] of [[1.0, 3.2], [0.82, 2.6], [0.62, 2.2]]) {
      const layer = cyl(base * k * 0.9, base * k, hh, 0xb5643c, 9);
      layer.position.y = y + hh / 2;
      m.add(layer);
      y += hh;
    }
    const cap = cyl(base * 0.5, base * 0.56, 0.7, 0xc97a4a, 9);
    cap.position.y = y + 0.35;
    m.add(cap);
    m.position.set(x, land.heightAt(x, lz + land.zC) - 0.3, lz);
    m.rotation.y = rng() * Math.PI;
    g.add(m);
    lastMesa = [x, lz];
  }

  // sun-bleached bones
  for (let i = 0; i < 2; i++) {
    const p = outerPoint(ctx, rng, land.R, clear + 2);
    if (!p || inLake(p[0], p[1])) continue;
    const s = new THREE.Group();
    const skull = ball(0.4, 0xf2ede0, 0.7, 7);
    skull.position.y = 0.25;
    s.add(skull);
    for (const side of [-1, 1]) {
      const horn = cone(0.09, 0.7, 0xe8e0cc, 5);
      horn.position.set(side * 0.55, 0.42, 0);
      horn.rotation.z = side * -1.9;
      s.add(horn);
    }
    const rib = cyl(0.05, 0.05, 1.2, 0xf2ede0, 4);
    rib.position.set(1.1, 0.1, 0.4);
    rib.rotation.z = Math.PI / 2.2;
    s.add(rib);
    s.position.set(p[0], land.heightAt(p[0], p[1]), p[1] - land.zC);
    s.rotation.y = rng() * Math.PI * 2;
    g.add(s);
  }

  // dried riverbed — darker winding strip, pushed out beyond the oasis moat
  windingStrip(land, rng, { color: 0xb08a55, width: 1.7, startR: outerSize(ctx, 1.1), steps: 18, angle: rng() * Math.PI * 2, y: 0.08 });

  // two vultures circling the far mesa
  circlingBirds(ctx, land, { count: 2, cx: lastMesa[0], cz: lastMesa[1], radius: 13, height: 17, speed: 0.22, size: 1.1, color: 0x2a2226 });
}

// ---------- sakura outer ----------

// ---- reusable Japanese set pieces ----

// multi-tier pagoda / castle keep — plaster walls with dark under-eaves and
// upturned 4-sided hip roofs, a gold finial on top
function buildJPagoda(rng, tiers, baseW, roofC) {
  const grp = new THREE.Group();
  let py = 0;
  for (let t = 0; t < tiers; t++) {
    const w = baseW - t * (baseW * 0.16);
    const wall = box(w, 1.4, w, t === 0 ? P.plaster : 0xe9dcc2);
    wall.position.y = py + 0.7;
    grp.add(wall);
    const eave = box(w + 1.5, 0.18, w + 1.5, 0x33241c); // dark eave shadow line
    eave.position.y = py + 1.42;
    grp.add(eave);
    const roof = cone((w * 0.5 + 0.9) * 1.42, 1.0, roofC, 4); // upturned hip roof
    roof.rotation.y = Math.PI / 4;
    roof.position.y = py + 2.0;
    grp.add(roof);
    py += 1.82;
  }
  const finial = cyl(0.06, 0.1, 0.9, P.gold, 6);
  finial.position.y = py + 0.2;
  grp.add(finial);
  return grp;
}

// vermilion torii gate — two pillars, curved lintel with a black cap
function buildTorii(rng) {
  const grp = new THREE.Group();
  const red = 0xc8402f;
  for (const side of [-1.6, 1.6]) {
    const p = cyl(0.18, 0.24, 3.2, red, 8);
    p.position.set(side, 1.6, 0);
    grp.add(p);
  }
  const tie = box(3.4, 0.2, 0.24, red); tie.position.y = 2.35; grp.add(tie);
  const lintel = box(3.9, 0.26, 0.32, red); lintel.position.y = 3.02; grp.add(lintel);
  const cap = box(4.9, 0.32, 0.44, 0x2e2a28); cap.position.y = 3.4; grp.add(cap);
  for (const end of [-2.35, 2.35]) { // little upswept ends
    const up = box(0.5, 0.34, 0.46, 0x2e2a28); up.position.set(end, 3.5, 0); up.rotation.z = -Math.sign(end) * 0.22; grp.add(up);
  }
  return grp;
}

// traditional farmhouse — plaster body on a dark timber sill under a broad
// dark hip roof
function buildJHouse(rng) {
  const grp = new THREE.Group();
  const w = 3.6 + rng() * 1.8, d = 3.0 + rng() * 1.3, wh = 2.0;
  const sill = box(w + 0.1, 0.5, d + 0.1, P.woodDark); sill.position.y = 0.25; grp.add(sill);
  const body = box(w, wh, d, rng() < 0.5 ? 0xece2d0 : P.plaster);
  body.position.y = 0.5 + wh / 2; grp.add(body);
  const roofC = [0x37474a, 0x2f4a40, 0x463f38][Math.floor(rng() * 3)];
  const roof = cone((Math.max(w, d) * 0.5 + 1.05) * 1.42, 1.7, roofC, 4);
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 0.5 + wh + 0.55;
  grp.add(roof);
  return grp;
}

// carved stone lantern with a warm glowing chamber
function buildStoneLantern() {
  const l = new THREE.Group();
  const base = cyl(0.42, 0.5, 0.28, 0x8f8a88, 8); base.position.y = 0.14; l.add(base);
  const pillar = cyl(0.14, 0.18, 0.8, 0x9a9694, 7); pillar.position.y = 0.66; l.add(pillar);
  const plat = box(0.6, 0.12, 0.6, 0x8f8a88); plat.position.y = 1.1; l.add(plat);
  const cham = box(0.44, 0.36, 0.44, 0xa5a19e); cham.position.y = 1.36; l.add(cham);
  const light = box(0.24, 0.2, 0.46, 0xffd98c, { emissive: 0xffb84a, emissiveIntensity: 0.9 }); light.position.y = 1.36; l.add(light);
  const roof = cone(0.5, 0.36, 0x827e7c, 6); roof.position.y = 1.72; l.add(roof);
  return l;
}

// humped wooden foot-bridge (local x spans the gap, arch peaks at center)
function buildArchBridge(rng, span, color) {
  const bridge = new THREE.Group();
  const archH = span * 0.28;
  const deckY = (t) => 0.2 + archH * (1 - 4 * t * t);
  for (let i = 0; i < 9; i++) {
    const t = i / 8 - 0.5;
    const slat = box(span / 8 + 0.12, 0.1, 1.7, color);
    slat.position.set(t * span, deckY(t), 0);
    slat.rotation.z = 8 * archH * t / span; // follow the arch slope
    bridge.add(slat);
  }
  for (const side of [-0.8, 0.8]) {
    const pts = [];
    for (let i = 0; i <= 8; i++) { const t = i / 8 - 0.5; pts.push(new THREE.Vector3(t * span, deckY(t) + 0.6, side)); }
    bridge.add(tube(pts, 0.06, color));
    for (let i = 0; i <= 8; i += 2) {
      const t = i / 8 - 0.5;
      const post = cyl(0.05, 0.06, 0.62, color, 5);
      post.position.set(t * span, deckY(t) + 0.3, side);
      bridge.add(post);
    }
  }
  return bridge;
}

// a broad rock cliff with a wide sheet of falling water and a churning foam
// pool; the group's local +z face points at faceTo. returns foam records.
function sakuraFalls(land, rng, x, z, fh, faceTo, baseY) {
  const w = new THREE.Group();
  const cw = fh * 0.42;      // overall falls width
  const ww = cw * 0.82;      // the water sheet itself — the hero of the piece
  // boulders framing the sides and piled at the plunge base (the terrain cliff
  // supplies the rock face itself, so no slab is needed behind the water)
  for (let i = 0; i < 5; i++) {
    const rock = ball(1.3 + rng() * 1.0, i % 2 ? 0xa79881 : 0x8d7f6d, 0.9, 6);
    rock.position.set((i < 2 ? -1 : 1) * (ww * 0.62 + rng() * 0.9), fh * (0.1 + (i % 3) * 0.34), (rng() - 0.5) * 0.8);
    rock.scale.x *= 1.3;
    w.add(rock);
  }
  // The falling water is UNLIT: a vertical plane under an overhead sun shades
  // to near-black, so basic materials keep the sheet reading bright and cel-like.
  const sheet = new THREE.Mesh(new THREE.PlaneGeometry(ww, fh * 0.98), new THREE.MeshBasicMaterial({
    color: 0xdcf0fb, transparent: true, opacity: 0.95, side: THREE.DoubleSide,
  }));
  sheet.position.set(0, fh * 0.49, 0.45);
  w.add(sheet);
  for (const ox of [-0.28, 0.06, 0.32]) {
    const streak = new THREE.Mesh(new THREE.PlaneGeometry(ww * 0.2, fh * 0.94), new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.6, side: THREE.DoubleSide,
    }));
    streak.position.set(ox * ww, fh * 0.48, 0.62);
    w.add(streak);
  }
  // bright lip where the water pours over the top
  const lip = new THREE.Mesh(new THREE.BoxGeometry(ww * 1.04, 0.6, 1.3), new THREE.MeshBasicMaterial({ color: 0xf4fbff }));
  lip.position.set(0, fh * 0.97, 0.2); w.add(lip);
  const pool = flatDisc(cw * 0.9, 0x6fb6de, 0.14, 14); pool.position.set(0, 0.05, 2.2); w.add(pool);
  const foams = [];
  for (let i = 0; i < 7; i++) {
    const f = ball(0.6 + rng() * 0.45, 0xf2fafd, 0.6, 6);
    f.position.set((rng() - 0.5) * ww, 0.35 + rng() * 0.7, 1.1 + rng() * 1.9);
    w.add(f);
    foams.push({ f, ph: rng() * 6 });
  }
  w.position.set(x, baseY != null ? baseY : land.heightAt(x, z), z - land.zC);
  w.rotation.y = Math.atan2(faceTo.x - x, faceTo.z - z);
  land.group.add(w);
  return foams;
}

// small grassy islet drifting in the sky, rock spike beneath, a blossom on top
function buildSkyIsland(rng, r) {
  const grp = new THREE.Group();
  const top = new THREE.Mesh(new THREE.CircleGeometry(r, 12), mat(0x8cc06d, { side: THREE.DoubleSide }));
  top.rotation.x = -Math.PI / 2; grp.add(top);
  const rim = new THREE.Mesh(new THREE.CircleGeometry(r * 1.06, 12), mat(0x74a95a, { side: THREE.DoubleSide }));
  rim.rotation.x = -Math.PI / 2; rim.position.y = -0.08; grp.add(rim);
  const spike = cone(r * 0.9, r * 1.9, 0x7a6a5c, 7); spike.rotation.x = Math.PI; spike.position.y = -r * 0.95; grp.add(spike);
  // a lone blossom
  const trunk = cyl(0.16, 0.24, 1.4, 0x5a4032, 6); trunk.position.y = 0.7; grp.add(trunk);
  for (const [bx, by, bz, br] of [[0, 1.9, 0, 1.1], [0.7, 1.7, 0.2, 0.7], [-0.6, 1.7, -0.2, 0.65]]) {
    const b = ball(br, rng() < 0.5 ? 0xf2aac8 : 0xf7c2d8, 0.9, 7); b.position.set(bx, by, bz); grp.add(b);
  }
  return grp;
}

// ---- terraced valley: a flat farm plateau, a rock-cliff drop into a lower
// canyon that carries the river, then a bench rising back to the mountains ----
const SAK_CANYON = 17; // plateau -> canyon floor drop
const SAK_BENCH = 5;   // canyon floor -> outer bench rise
const smoothstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// the canyon rim + outer bench edge as organic (angle-varying) radii, shared
// by the height field and the cliff walls so rock and ground always line up
function sakuraTerraces(ctx, rng, R) {
  const p1 = rng() * 10, p2 = rng() * 10, p3 = rng() * 10;
  // the cliff hugs the farm as in the reference, but never bites into the flat
  // clearing: keep the narrowest point clear of the island + its flat apron
  const flatR = (ctx.clearRadius || 10) + 30;
  const minRim = (ctx.islandW || 30) / 2 + flatR + 10;
  const rimBase = Math.max(R * 0.46, minRim / 0.90);
  const rimR = (a) => rimBase * (1 + 0.06 * Math.sin(a * 3 + p1) + 0.04 * Math.cos(a * 5 + p2));
  const benchR = (a) => Math.max(R * 0.74, rimBase + 60) * (1 + 0.06 * Math.sin(a * 2 + p3) + 0.04 * Math.cos(a * 4 + p1));
  // a narrow transition band makes the ground drop almost vertically, so the
  // rock wall reads as a crisp ledge instead of a long muddy ramp
  return { rimR, benchR, band: 2.5 };
}

function sakuraHeightField(ctx, rng, R, lake, terr) {
  const zC = ctx.zCenter || 0;
  const flatR = (ctx.clearRadius || 10) + 30;
  const { rimR, benchR, band } = terr;
  const n0 = rng() * 10, n1 = rng() * 10;
  return (x, z) => {
    const d = distToIsland(ctx, x, z);
    if (d <= flatR) return 0; // the farm clearing stays perfectly level
    const rr = Math.hypot(x, z - zC);
    const a = Math.atan2(z - zC, x);
    const cr = rimR(a), br = benchR(a);
    // keep the plateau intact around the lake so the water never hangs off a cliff
    const lakeMask = smoothstep(lake.r + 3, lake.r + 13, Math.hypot(x - lake.x, z - lake.z));
    const drop = smoothstep(cr - band, cr + band, rr) * lakeMask;
    const rise = smoothstep(br - band, br + band, rr);
    let h = -SAK_CANYON * drop + (SAK_CANYON - SAK_BENCH) * rise;
    // gentle rolling noise, faded out on the flat plateau and at the transitions
    const rough = Math.min(drop, 1 - drop) * 2 * (1 - rise) + rise * 0.6;
    const n = 0.6 * Math.sin(x * 0.04 + n0) * Math.cos(z * 0.035 + n1) + 0.4 * Math.sin(x * 0.022 + z * 0.027 + n0);
    h += n * 1.8 * (1 - rough) * smoothstep(flatR, flatR + 40, d);
    return h;
  };
}

// a jagged rock escarpment following one of the terrace radii; `facing` = 1 for
// a wall seen from inside (plateau rim), -1 for one seen from the canyon
function sakuraCliffWall(land, rng, radiusFn, topY, botY, colors, zC) {
  const segs = 160;
  const pos = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    // stand the face a touch proud of the terrain step so it always reads
    const r = radiusFn(a) * 1.012;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    // ragged top lip so the rock never reads as a machined cylinder
    const jit = 0.9 * Math.sin(a * 11 + 1.3) + 0.6 * Math.cos(a * 19 + 0.7);
    pos.push(x, topY + jit, z, x, botY - 1.5 - Math.abs(jit), z);
  }
  for (let i = 0; i < segs; i++) {
    const t = i * 2;
    idx.push(t, t + 1, t + 2, t + 1, t + 3, t + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const wall = new THREE.Mesh(geo, mat(colors[0], { side: THREE.DoubleSide, flatShading: true }));
  wall.position.z = -zC + zC; // geometry is already local to the land group
  wall.castShadow = false;
  land.group.add(wall);
  // strata: a couple of thinner bands in lighter rock stacked down the face
  const H = topY - botY;
  for (let b = 0; b < 2; b++) {
    const bt = topY - H * (0.34 + b * 0.33), bb = bt - H * 0.14;
    const bpos = [], bidx = [];
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const r = radiusFn(a) * 1.006;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      bpos.push(x, bt, z, x, bb, z);
    }
    for (let i = 0; i < segs; i++) { const t = i * 2; bidx.push(t, t + 1, t + 2, t + 1, t + 3, t + 2); }
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.Float32BufferAttribute(bpos, 3));
    bg.setIndex(bidx);
    bg.computeVertexNormals();
    const bm = new THREE.Mesh(bg, mat(colors[1 + b], { side: THREE.DoubleSide, flatShading: true }));
    bm.castShadow = false;
    land.group.add(bm);
  }
  return wall;
}

function sakuraOuter(ctx) {
  if (!ctx || !ctx.scene || typeof ctx.scene.add !== 'function') return;
  const rng = outerRng(ctx);
  const zC = ctx.zCenter || 0;
  const clear = ctx.clearRadius || 10;
  const flatR = clear + 30;
  const iHalf = Math.max(ctx.islandW || 30, ctx.islandD || 30) / 2;
  const R = outerSize(ctx, 3.1);

  // the lake sits on the raised farm plateau, inside the canyon rim, so its
  // water never hangs over a cliff edge — it spills over the rim as the falls
  const lakeA = Math.PI + (rng() - 0.5) * 0.5;
  const lake = { x: Math.cos(lakeA) * R * 0.24, z: zC + Math.sin(lakeA) * R * 0.24, r: R * 0.11 };

  const terr = sakuraTerraces(ctx, rng, R);
  const heightAt = sakuraHeightField(ctx, rng, R, lake, terr);
  // a finer floor grid so the terrace steps read as crisp ledges, not smears
  const land = meadowValleyFloor(ctx, rng, R, heightAt, {
    top: 0x8cc06d, skirt: 0x6a5744, segs: 128, rings: 34,
    skirtY: -5.9 - SAK_CANYON, // clear of the carved canyon floor
  });
  if (!land) return;
  const g = land.group;

  // ---- the rock escarpments: plateau rim dropping into the canyon, and the
  // canyon's outer wall rising to the bench that carries the mountains ----
  sakuraCliffWall(land, rng, terr.rimR, 1.2, -SAK_CANYON - 1, [0xb5a68e, 0xc9bba1, 0xa2937c], zC);
  sakuraCliffWall(land, rng, terr.benchR, -SAK_BENCH + 1.0, -SAK_CANYON - 1, [0xaf9f88, 0xc3b49a, 0x9c8d76], zC);
  // chunky boulders along both lips so the cliff edge has a blocky silhouette
  {
    const rimRocks = [], benchRocks = [];
    for (let i = 0; i < 130; i++) {
      const a = (i / 130) * Math.PI * 2 + rng() * 0.05;
      const rr = terr.rimR(a) * (0.985 + rng() * 0.03);
      rimRocks.push({ x: Math.cos(a) * rr, y: -0.4 - rng() * 1.2, z: Math.sin(a) * rr, s: 1.4 + rng() * 2.6, sy: 0.8 + rng() * 0.7, ry: rng() * Math.PI });
      const br = terr.benchR(a) * (0.985 + rng() * 0.03);
      benchRocks.push({ x: Math.cos(a) * br, y: -SAK_BENCH - 0.5 - rng(), z: Math.sin(a) * br, s: 1.2 + rng() * 2.2, sy: 0.8 + rng() * 0.6, ry: rng() * Math.PI });
    }
    const rockGeo = new THREE.DodecahedronGeometry(1, 0);
    const a1 = outerInstanced(g, rockGeo, mat(0xb5a68e), rimRocks); if (a1) a1.castShadow = false;
    const a2 = outerInstanced(g, rockGeo, mat(0xaf9f88), benchRocks); if (a2) a2.castShadow = false;
  }

  // ---- mountain ring: cool blue-grey Japanese ranges, snow on the tallest ----
  const rockGeos = [meadowPeakGeo(rng, 8), meadowPeakGeo(rng, 7), meadowPeakGeo(rng, 9)];
  const rockCols = [0x8a869a, 0x7d798e, 0x6f6b80];
  const rockPl = [[], [], []];
  const snowGeo = meadowPeakGeo(rng, 8);
  const snowPl = [];
  const peaks = [];
  const addPeak = (x, z, baseR, H, snowy, gi) => {
    const gy = heightAt(x, z) - 6, HH = H + 6;
    rockPl[gi ?? Math.floor(rng() * 3)].push({ x, y: gy, z: z - zC, s: baseR, sy: HH / baseR, ry: rng() * Math.PI * 2 });
    if (snowy) { const capR = baseR * 0.5, capH = HH * 0.44; snowPl.push({ x, y: gy + HH * 0.56, z: z - zC, s: capR, sy: capH / capR, ry: rng() * Math.PI * 2 }); }
    peaks.push({ x, z, baseR, H });
  };
  const nMtn = 13;
  for (let i = 0; i < nMtn; i++) {
    const a = (i / nMtn) * Math.PI * 2 + (rng() - 0.5) * 0.25;
    const rr = R * (0.88 + rng() * 0.11);
    const x = Math.cos(a) * rr, z = zC + Math.sin(a) * rr;
    const H = 34 + rng() * 30, baseR = Math.min(H * (0.8 + rng() * 0.3), 60);
    addPeak(x, z, baseR, H, H > 46);
    if (rng() < 0.6) {
      const side = rng() < 0.5 ? 1 : -1, off = baseR * (0.85 + rng() * 0.3), sh = H * (0.55 + rng() * 0.3);
      addPeak(x - Math.sin(a) * off * side, z + Math.cos(a) * off * side, Math.min(sh * (0.9 + rng() * 0.3), 52), sh, sh > 46);
    }
  }
  for (let i = 0; i < 3; i++) { const m = outerInstanced(g, rockGeos[i], mat(rockCols[i]), rockPl[i]); if (m) m.castShadow = false; }
  const snowM = outerInstanced(g, snowGeo, mat(0xf4f8fb), snowPl); if (snowM) snowM.castShadow = false;

  // ---- hero Mt. Fuji: a broad, near-symmetric snow-capped cone at the back,
  // towering over the ring so it reads as the valley's landmark ----
  {
    const fa = -Math.PI / 2 - 0.08, fr = R * 0.92;
    const fx = Math.cos(fa) * fr, fz = zC + Math.sin(fa) * fr;
    const FH = 150, fbase = 96, gy = heightAt(fx, fz) - 10;
    const fuji = new THREE.Mesh(new THREE.ConeGeometry(fbase, FH, 16), mat(0x8b8aa4, { flatShading: true }));
    fuji.position.set(fx, gy + FH / 2, fz - zC); fuji.castShadow = false; g.add(fuji);
    // a hazier blue lower band would over-complicate; the snow cap sells it
    const capH = FH * 0.4, capR = fbase * 0.44;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(capR, capH, 16), mat(0xf6fafd, { flatShading: true }));
    cap.position.set(fx, gy + FH - capH / 2, fz - zC); cap.castShadow = false; g.add(cap);
    // a couple of snowy fingers streaking down the flanks
    for (const off of [-0.5, 0.35, 0.9]) {
      const fng = new THREE.Mesh(new THREE.ConeGeometry(capR * 0.18, capH * 0.7, 5), mat(0xf6fafd));
      fng.position.set(fx + Math.sin(off) * capR * 0.8, gy + FH - capH * 0.85, fz - zC + Math.cos(off) * capR * 0.5);
      fng.castShadow = false; g.add(fng);
    }
  }

  // ---- the lake (freezes over in winter via the water tag) ----
  if (typeof ctx.setDockSpot === 'function') {
    const dl = Math.hypot(lake.x, lake.z - zC) || 1;
    const tx = lake.x / dl, tz = (lake.z - zC) / dl;
    ctx.setDockSpot(lake.x - tx * lake.r * 1.02, lake.z - tz * lake.r * 1.02, Math.atan2(-tz, tx), 0.42);
  }
  const lakeRim = meadowBlobDisc(rng, lake.r * 1.08, 0x9ec7e0);
  lakeRim.position.set(lake.x, 0.16, lake.z - zC); lakeRim.userData.water = 0x9ec7e0; g.add(lakeRim);
  const lakeWater = meadowBlobDisc(rng, lake.r, 0xffffff, { map: waterTexture(), roughness: 0.18 });
  lakeWater.position.set(lake.x, 0.3, lake.z - zC); lakeWater.userData.water = 0xffffff; g.add(lakeWater);

  // ---- water: the lake spills over the plateau rim as a tall waterfall into
  // the canyon, whose river winds along the gorge floor under arched bridges ----
  const foams = [];
  // an iconic vermilion torii standing out in the lake
  const outDir = Math.atan2(lake.z - zC, lake.x) || Math.PI;
  {
    const lt = buildTorii(rng); lt.scale.setScalar(1.7);
    lt.position.set(lake.x - Math.cos(outDir) * lake.r * 0.35, 0.2, lake.z - zC - Math.sin(outDir) * lake.r * 0.35);
    lt.rotation.y = outDir + Math.PI / 2;
    g.add(lt);
  }
  // a short stream running from the lake out to the lip of the cliff
  const rimAt = (a) => terr.rimR(a);
  const spillA = outDir;
  const spillR = rimAt(spillA);
  {
    const sx0 = lake.x + Math.cos(spillA) * lake.r * 0.9, sz0 = lake.z + Math.sin(spillA) * lake.r * 0.9;
    const sx1 = Math.cos(spillA) * (spillR - 3), sz1 = zC + Math.sin(spillA) * (spillR - 3);
    const pts = [];
    for (let i = 0; i <= 4; i++) {
      const t = i / 4, k = Math.sin(t * Math.PI) * 5;
      pts.push([sx0 + (sx1 - sx0) * t - Math.sin(spillA) * k, sz0 + (sz1 - sz0) * t + Math.cos(spillA) * k]);
    }
    waterRibbon(land, pts, 2.4, 0.32);
  }
  // the hero fall: built up from the canyon floor so its lip meets the plateau
  foams.push(...sakuraFalls(land, rng, Math.cos(spillA) * (spillR + 5), zC + Math.sin(spillA) * (spillR + 5),
    SAK_CANYON + 1.5, { x: Math.cos(spillA) * (spillR + 40), z: zC + Math.sin(spillA) * (spillR + 40) }, -SAK_CANYON));
  // a second fall pouring over the rim on the far side of the valley
  {
    const a2 = spillA + Math.PI * (0.75 + rng() * 0.4), r2 = rimAt(a2);
    foams.push(...sakuraFalls(land, rng, Math.cos(a2) * (r2 + 5), zC + Math.sin(a2) * (r2 + 5),
      SAK_CANYON + 1.5, { x: Math.cos(a2) * (r2 + 40), z: zC + Math.sin(a2) * (r2 + 40) }, -SAK_CANYON));
  }
  // the canyon river: a long arc winding down the middle of the gorge
  const canyonPts = [];
  {
    const a0 = spillA - 0.15;
    for (let i = 0; i <= 9; i++) {
      const t = i / 9, a = a0 + t * 2.5;
      const mid = (rimAt(a) + terr.benchR(a)) / 2;
      const r = mid + Math.sin(t * 5.5 + a0) * 9;
      canyonPts.push([Math.cos(a) * r, zC + Math.sin(a) * r]);
    }
    waterRibbon(land, canyonPts, 4.2, 0.3);
  }
  // arched foot-bridges spanning the gorge river
  for (const fi of [2, 5, 8]) {
    const a = canyonPts[fi - 1], b = canyonPts[fi];
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    const br = buildArchBridge(rng, 12, 0xc8402f);
    br.position.set(mx, land.heightAt(mx, mz) + 0.2, mz - zC);
    br.rotation.y = Math.atan2(b[1] - a[1], b[0] - a[0]) + Math.PI / 2;
    g.add(br);
  }

  // ---- fallen-petal ground patches ----
  const petals = outerPoints(ctx, rng, R * 0.92, clear + 2, 14).map(([x, z]) => ({
    x, y: heightAt(x, z) + 0.08, z: z - zC, rx: -Math.PI / 2, s: 0.7 + rng() * 1.0, ry: rng() * Math.PI,
  }));
  outerInstanced(g, new THREE.CircleGeometry(1.4, 8), mat(0xf7d6e2, { side: THREE.DoubleSide }), petals);

  // ---- dense cherry-blossom forest beyond the clearing (the hero greenery) ----
  const trunkPl = [], canA = [], canB = [], side = [];
  const pinkA = 0xf2aac8, pinkB = 0xf6b8d2;
  const addBlossom = (x, z) => {
    if (distToIsland(ctx, x, z) < clear + 3) return;
    if (Math.hypot(x - lake.x, z - lake.z) < lake.r + 3) return;
    if (Math.hypot(x, z - zC) > R * 0.98) return;
    const s = 1.0 + rng() * 0.95, h = heightAt(x, z), lz = z - zC, ry = rng() * Math.PI;
    trunkPl.push({ x, y: h + 1.4 * s, z: lz, s, ry });
    (rng() < 0.5 ? canA : canB).push({ x, y: h + 3.4 * s, z: lz, s, sy: 0.82, ry });
    const oa = rng() * Math.PI * 2;
    side.push({ x: x + Math.cos(oa) * 1.2 * s, y: h + 3.0 * s, z: lz + Math.sin(oa) * 1.2 * s, s: s * 0.72, ry });
  };
  // an even carpet across the whole valley...
  for (const [x, z] of outerPoints(ctx, rng, R * 0.97, clear + 4, 240)) addBlossom(x, z);
  // ...thickened into groves that hug the property and blanket the near hills
  for (let c = 0; c < 7; c++) {
    const a = rng() * Math.PI * 2, cr = (flatR + iHalf + 6) + rng() * R * 0.4;
    const cx = Math.cos(a) * cr, cz = zC + Math.sin(a) * cr, spread = 9 + rng() * 12;
    for (let i = 0; i < 22; i++) addBlossom(cx + (rng() - 0.5) * 2 * spread, cz + (rng() - 0.5) * 2 * spread);
  }
  outerInstanced(g, new THREE.CylinderGeometry(0.22, 0.36, 2.8, 6), mat(0x5a4032), trunkPl);
  outerInstanced(g, new THREE.SphereGeometry(1.75, 8, 7), mat(pinkA), canA);
  outerInstanced(g, new THREE.SphereGeometry(1.75, 8, 7), mat(pinkB), canB);
  outerInstanced(g, new THREE.SphereGeometry(1.15, 7, 6), mat(0xf7c2d8), side);

  // ---- a scatter of deep-green conifers among the blossoms ----
  const cfTrunk = [], cfCan = [];
  for (const [x, z] of outerPoints(ctx, rng, R * 0.95, clear + 6, 46)) {
    const s = 1.4 + rng() * 1.0, h = heightAt(x, z), lz = z - zC, ry = rng() * Math.PI;
    cfTrunk.push({ x, y: h + 0.6 * s, z: lz, s, ry });
    cfCan.push({ x, y: h + 2.0 * s, z: lz, s, ry });
  }
  outerInstanced(g, new THREE.CylinderGeometry(0.14, 0.24, 1.2, 6), mat(P.woodDark), cfTrunk);
  { const im = outerInstanced(g, new THREE.ConeGeometry(1.1, 3.0, 7), mat(0x2f6b46), cfCan); if (im) tagFoliage(im, { autumn: false }); }

  // ---- Japanese structures scattered through the valley ----
  // hero castle keep on a rise near the back-right rim
  {
    const ca = -Math.PI / 2 + 1.05, cr = R * 0.64;
    const cx = Math.cos(ca) * cr, cz = zC + Math.sin(ca) * cr;
    const castle = buildJPagoda(rng, 5, 5.4, 0x2f4a55);
    castle.scale.setScalar(1.5);
    castle.position.set(cx, heightAt(cx, cz), cz - zC);
    castle.rotation.y = rng() * Math.PI;
    g.add(castle);
  }
  for (let i = 0; i < 2; i++) {
    const p = outerPoint(ctx, rng, R * 0.8, clear + 8); if (!p) continue;
    const pg = buildJPagoda(rng, 3, 3.4, rng() < 0.5 ? 0xc8402f : 0x3a4a55);
    pg.position.set(p[0], heightAt(p[0], p[1]), p[1] - zC); pg.rotation.y = rng() * Math.PI; g.add(pg);
  }
  for (let i = 0; i < 4; i++) {
    const p = outerPoint(ctx, rng, R * 0.85, clear + 6); if (!p) continue;
    const h = buildJHouse(rng);
    h.position.set(p[0], heightAt(p[0], p[1]), p[1] - zC); h.rotation.y = rng() * Math.PI * 2; g.add(h);
  }
  for (let i = 0; i < 3; i++) {
    const p = outerPoint(ctx, rng, R * 0.82, clear + 5); if (!p) continue;
    const t = buildTorii(rng);
    t.position.set(p[0], heightAt(p[0], p[1]), p[1] - zC); t.rotation.y = rng() * Math.PI; g.add(t);
  }
  for (const [x, z] of outerPoints(ctx, rng, R * 0.9, clear + 4, 9)) {
    const l = buildStoneLantern();
    l.position.set(x, heightAt(x, z), z - zC); l.rotation.y = rng() * Math.PI; g.add(l);
  }

  // ---- floating sky islets drifting above the valley ----
  const skyIsles = [];
  for (let i = 0; i < 3; i++) {
    const a = rng() * Math.PI * 2, r = R * (0.62 + rng() * 0.28);
    const isl = buildSkyIsland(rng, 3.5 + rng() * 2.2);
    isl.position.set(Math.cos(a) * r, 32 + rng() * 22, zC + Math.sin(a) * r);
    g.add(isl);
    skyIsles.push({ isl, baseY: isl.position.y, ph: rng() * 6 });
  }

  // ---- stone paths + open-ground rocks/bushes near the clearing ----
  windingStrip(land, rng, { color: 0x9a9694, width: 1.0, startR: outerSize(ctx, 0.55), angle: rng() * Math.PI * 2 });
  windingStrip(land, rng, { color: 0x9a9694, width: 0.9, startR: outerSize(ctx, 0.5), angle: rng() * Math.PI * 2 });
  const rocks = outerPoints(ctx, rng, R * 0.96, clear + 2, 70).map(([x, z]) => ({
    x, y: heightAt(x, z) + 0.3, z: z - zC, s: 0.5 + rng() * 1.1, sy: 0.8, ry: rng() * Math.PI * 2,
  }));
  outerInstanced(g, new THREE.DodecahedronGeometry(0.75, 0), mat(0x8f8a88), rocks);
  const bushes = outerPoints(ctx, rng, R * 0.96, clear + 2, 36).map(([x, z]) => ({
    x, y: heightAt(x, z) + 0.35, z: z - zC, s: 0.6 + rng() * 0.8, sy: 0.7, ry: rng() * Math.PI * 2,
  }));
  outerInstanced(g, new THREE.SphereGeometry(0.8, 7, 6), mat(0x4f9a44), bushes);

  // ---- drifting petals + a couple of cranes gliding over the valley ----
  outerFalling(ctx, land, '255,180,205', 40, { size: 0.34, height: 16, speed: 0.8, sway: 1.3, opacity: 0.85 });
  circlingBirds(ctx, land, { count: 3, color: 0xf4f4ee, cx: 0, cz: R * 0.2, radius: 14, height: 20, speed: 0.32, size: 0.7 });

  // ---- animate waterfall foam + gently bob the sky islands ----
  outerAnimate(ctx)((now) => {
    const t = now * 0.001;
    for (const fm of foams) { const k = 1 + Math.sin(t * 3.1 + fm.ph) * 0.16; fm.f.scale.set(k, 0.62 * k, k); }
    for (const si of skyIsles) { si.isl.position.y = si.baseY + Math.sin(t * 0.5 + si.ph) * 1.1; si.isl.rotation.y = t * 0.05 + si.ph; }
  });
}

function sakuraOuter_legacy(ctx) {
  const rng = outerRng(ctx);
  const land = outerLandmass(ctx, { color: 0x8cc06d, under: 0x6b5a4c, amp: 2.0 });
  if (!land) return;
  const g = land.group;
  const clear = ctx.clearRadius || 10;

  // fallen-petal ground patches (low)
  const petals = outerPoints(ctx, rng, land.R, 2, 12).map(([x, z]) => ({
    x, y: land.heightAt(x, z) + 0.08, z: z - land.zC, rx: -Math.PI / 2, s: 0.6 + rng() * 0.9,
  }));
  outerInstanced(g, new THREE.CircleGeometry(1.3, 8), mat(0xf7d6e2, { side: THREE.DoubleSide }), petals);

  // instanced cherry forest beyond the clear band
  const trunkPl = [], mainPl = [], sidePl = [];
  for (const [x, z] of outerPoints(ctx, rng, land.R, clear + 2, 75)) {
    const s = 0.75 + rng() * 0.65;
    const h = land.heightAt(x, z);
    const lz = z - land.zC;
    trunkPl.push({ x, y: h + 1.1 * s, z: lz, s, ry: rng() * Math.PI });
    mainPl.push({ x, y: h + 2.9 * s, z: lz, s, sy: 0.9, ry: rng() * Math.PI });
    const oa = rng() * Math.PI * 2;
    sidePl.push({ x: x + Math.cos(oa) * 0.9 * s, y: h + 2.6 * s, z: lz + Math.sin(oa) * 0.9 * s, s: s * 0.7 });
  }
  outerInstanced(g, new THREE.CylinderGeometry(0.2, 0.3, 2.2, 6), mat(0x5a4032), trunkPl);
  outerInstanced(g, new THREE.SphereGeometry(1.5, 8, 7), mat(0xf2aac8), mainPl);
  outerInstanced(g, new THREE.SphereGeometry(0.95, 7, 6), mat(0xf7c2d8), sidePl);

  // koi pond with a red arched bridge (hero)
  const pp = outerPoint(ctx, rng, land.R * 0.85, clear + 6) || [land.R * 0.5, land.zC];
  const pond = new THREE.Group();
  const water = new THREE.Mesh(new THREE.CircleGeometry(3.2, 16), new THREE.MeshStandardMaterial({
    color: 0x55b8d8, roughness: 0.15, transparent: true, opacity: 0.85, flatShading: true,
  }));
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.08;
  textureCircleWater(water, 3.2);
  pond.add(water);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const stone = ball(0.4 + (i % 3) * 0.12, 0x8f8a88, 0.7, 6);
    stone.position.set(Math.cos(a) * 3.3, 0.16, Math.sin(a) * 3.3);
    pond.add(stone);
  }
  for (const [kx, kz, kc] of [[0.8, 0.5, 0xe86830], [-0.9, -0.4, 0xf6f2e8]]) {
    const koi = ball(0.22, kc, 0.7, 6);
    koi.scale.x = 1.7;
    koi.position.set(kx, 0.1, kz);
    pond.add(koi);
  }
  const bridge = new THREE.Group();
  for (let i = 0; i < 7; i++) {
    const t = i / 6 - 0.5;
    const slat = box(0.85, 0.09, 1.5, 0xc23b30);
    slat.position.set(t * 6.2, 1.2 - t * t * 3.2, 0);
    slat.rotation.z = -t * 0.75;
    bridge.add(slat);
  }
  for (const side of [-0.72, 0.72]) {
    const railPts = [];
    for (let i = 0; i <= 6; i++) {
      const t = i / 6 - 0.5;
      railPts.push(new THREE.Vector3(t * 6.2, 1.78 - t * t * 3.2, side));
    }
    bridge.add(tube(railPts, 0.06, 0xc23b30));
  }
  bridge.rotation.y = rng() * Math.PI;
  pond.add(bridge);
  pond.position.set(pp[0], land.heightAt(pp[0], pp[1]) + 0.05, pp[1] - land.zC);
  g.add(pond);

  // stone path winding outward
  windingStrip(land, rng, { color: 0x9a9694, width: 0.9, startR: outerSize(ctx, 0.55), angle: rng() * Math.PI * 2 });

  // small pagoda near the rim (hero)
  const pa = rng() * Math.PI * 2;
  const pr = land.R * 0.7;
  const pagoda = new THREE.Group();
  let py = 0;
  for (let tier = 0; tier < 3; tier++) {
    const w = 3.6 - tier * 0.9;
    const wall = box(w, 1.5, w, P.plaster);
    wall.position.y = py + 0.75;
    pagoda.add(wall);
    const roofSlab = box(w + 1.3, 0.35, w + 1.3, 0xc23b30);
    roofSlab.position.y = py + 1.65;
    pagoda.add(roofSlab);
    py += 1.95;
  }
  const spire = cone(0.35, 1.0, 0xc23b30, 6);
  spire.position.y = py + 0.4;
  pagoda.add(spire);
  const px = Math.cos(pa) * pr, plz = Math.sin(pa) * pr;
  pagoda.position.set(px, land.heightAt(px, plz + land.zC), plz);
  pagoda.rotation.y = rng() * Math.PI;
  g.add(pagoda);

  // wide drifting petal fall
  outerFalling(ctx, land, '255,170,200', 34, { size: 0.32, height: 15, speed: 0.85, sway: 1.2, opacity: 0.85 });
}

// ---------- autumn outer ----------

function autumnOuter(ctx) {
  const rng = outerRng(ctx);
  const land = outerLandmass(ctx, { color: 0xa89a44, under: 0x54443a, amp: 2.2 });
  if (!land) return;
  const g = land.group;
  const clear = ctx.clearRadius || 10;
  const fallColors = [0xd8632a, 0xc23b2e, 0xe8a02e, 0xd88a2a];

  // instanced maples in mixed fall colors beyond the clear band
  const trunkPl = [];
  const canopyBuckets = [[], [], [], []];
  for (const [x, z] of outerPoints(ctx, rng, land.R, clear + 2, 65)) {
    const s = 0.75 + rng() * 0.7;
    const h = land.heightAt(x, z);
    const lz = z - land.zC;
    trunkPl.push({ x, y: h + 1.3 * s, z: lz, s, ry: rng() * Math.PI });
    canopyBuckets[Math.floor(rng() * 4)].push({ x, y: h + 3.3 * s, z: lz, s, sy: 0.9, ry: rng() * Math.PI });
  }
  outerInstanced(g, new THREE.CylinderGeometry(0.24, 0.38, 2.6, 6), mat(P.woodDark), trunkPl);
  const mapleGeo = new THREE.SphereGeometry(1.6, 8, 7);
  for (let i = 0; i < 4; i++) outerInstanced(g, mapleGeo, mat(fallColors[i]), canopyBuckets[i]);

  // pumpkin patches (low, may sit inside the clear band)
  const pumpPl = [];
  for (let p = 0; p < 3; p++) {
    const c = outerPoint(ctx, rng, land.R, 3);
    if (!c) continue;
    for (let i = 0; i < 8; i++) {
      const x = c[0] + (rng() - 0.5) * 6, z = c[1] + (rng() - 0.5) * 6;
      pumpPl.push({ x, y: land.heightAt(x, z) + 0.3, z: z - land.zC, s: 0.7 + rng() * 0.7, sy: 0.75, ry: rng() * Math.PI });
    }
  }
  outerInstanced(g, new THREE.SphereGeometry(0.5, 8, 6), mat(0xe8781e), pumpPl);

  // corn maze suggestion — rows of golden stalk boxes with carved paths (hero)
  const mc = outerPoint(ctx, rng, land.R * 0.85, clear + 8) || [0, land.zC + land.R * 0.6];
  const mazeH = land.heightAt(mc[0], mc[1]);
  const stalkPl = [];
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 11; c++) {
      if ((r === 3 && c > 1 && c < 9) || (c === 5 && r > 2) || rng() < 0.12) continue;
      const s = 0.85 + rng() * 0.3;
      stalkPl.push({
        x: mc[0] + (c - 5) * 1.5, y: mazeH + 1.1 * s, z: mc[1] - land.zC + (r - 3) * 1.5,
        s, ry: (rng() - 0.5) * 0.4,
      });
    }
  }
  outerInstanced(g, new THREE.BoxGeometry(0.8, 2.2, 0.8), mat(0xd9b552), stalkPl);

  // split-rail fence runs
  for (let f = 0; f < 3; f++) {
    const p = outerPoint(ctx, rng, land.R, clear + 3);
    if (!p) continue;
    const run = new THREE.Group();
    const segsN = 4;
    for (let i = 0; i <= segsN; i++) {
      const post = cyl(0.09, 0.11, 1.1, P.woodDark, 5);
      post.position.set(i * 2.4, 0.55, 0);
      run.add(post);
    }
    for (let i = 0; i < segsN; i++) {
      for (const railY of [0.45, 0.85]) {
        const rail = box(2.5, 0.1, 0.09, P.wood);
        rail.position.set(i * 2.4 + 1.2, railY, 0);
        rail.rotation.z = (rng() - 0.5) * 0.06;
        run.add(rail);
      }
    }
    run.position.set(p[0], land.heightAt(p[0], p[1]), p[1] - land.zC);
    run.rotation.y = rng() * Math.PI * 2;
    g.add(run);
  }

  // crow flock circling the maze + falling leaves over the zone
  circlingBirds(ctx, land, { count: 5, cx: mc[0], cz: mc[1] - land.zC, radius: 9, height: 12, speed: 0.4, size: 0.55 });
  outerFalling(ctx, land, '255,140,40', 26, { size: 0.3, height: 13, speed: 1.0, sway: 1.3 });
}

// ============================================================
// THEMES
// ============================================================

export const THEMES = [
  {
    id: 'meadow',
    name: 'Meadow Homestead',
    icon: '🌼',
    music: '/audio/farm-theme.mp3',
    outerTopY: -0.3,
    skyDay: ['#2b7fd4', '#5aa8e6', '#a9d6f2', '#dceffa'],
    skyNight: ['#0b1026', '#16204a', '#27355e', '#3a4a6b'],
    colors: {
      grass: 0x74bf58, grassEdge: 0x5da849, dirtTop: 0x8a5a33, dirtDeep: 0x64391f,
      rock: 0x76655a, water: 0x4fb2d9,
      fogDay: 0xcfe8f4, fogNight: 0x1a2238,
      sunDay: 0xfff2d8, sunNight: 0x9db8e8,
      tuftColorHSL: { h: 0.29, s: 0.55, l: 0.45 },
    },
    buildScenery: meadowScenery,
    buildOuterZone: safeOuter(meadowOuter),
  },
  {
    id: 'oceanside',
    name: 'Oceanside Farm',
    icon: '🏝️',
    music: '/audio/beach-theme.mp3',
    skyDay: ['#3d9bdc', '#6fc4ec', '#b8e6f5', '#ffe8c4'],
    skyNight: ['#081428', '#0f2547', '#1d3a63', '#2e5378'],
    colors: {
      grass: 0x6cc264, grassEdge: 0x55ab50, dirtTop: 0xc2a06a, dirtDeep: 0x9a7a4a,
      rock: 0x8a8078, water: 0x35b5cf,
      fogDay: 0xc4ecf4, fogNight: 0x122a42,
      sunDay: 0xfff6dc, sunNight: 0x9ec4e8,
      tuftColorHSL: { h: 0.22, s: 0.5, l: 0.5 },
    },
    buildScenery: oceansideScenery,
    buildOuterZone: safeOuter(oceansideOuter),
  },
  {
    id: 'boreal',
    name: 'Boreal Forest Farm',
    icon: '🌲',
    outerTopY: -0.3,
    skyDay: ['#7ab3d4', '#a8cfe4', '#d5e8ef', '#eef5f2'],
    skyNight: ['#060d1f', '#0d1a38', '#1a2c50', '#2c4266'],
    colors: {
      grass: 0x5a9e6a, grassEdge: 0x4a8a5c, dirtTop: 0x6b4a33, dirtDeep: 0x4a3222,
      rock: 0x8a9096, water: 0x5ac0d8,
      fogDay: 0xd8e8ec, fogNight: 0x142236,
      sunDay: 0xeef4ff, sunNight: 0xaacbe8,
      tuftColorHSL: { h: 0.42, s: 0.28, l: 0.55 },
    },
    buildScenery: borealScenery,
    buildOuterZone: safeOuter(borealOuter),
  },
  {
    id: 'desert',
    name: 'Desert Oasis',
    icon: '🌵',
    music: '/audio/desert-theme.mp3',
    skyDay: ['#4da2d8', '#8cc8e8', '#f2d9a8', '#f8c988'],
    skyNight: ['#0d0a20', '#231440', '#3c2258', '#552f60'],
    colors: {
      grass: 0x6cc264, grassEdge: 0x57a848, dirtTop: 0xc98d4e, dirtDeep: 0x9a6234,
      rock: 0xb5643c, water: 0x39c9c6,
      fogDay: 0xf0dcb4, fogNight: 0x241a38,
      sunDay: 0xfff0c8, sunNight: 0xb8a8d8,
      tuftColorHSL: { h: 0.29, s: 0.5, l: 0.5 },
    },
    buildScenery: desertScenery,
    buildOuterZone: safeOuter(desertOuter),
  },
  {
    id: 'sakura',
    name: 'Sakura Valley',
    icon: '🌸',
    music: '/audio/farm-theme.mp3',
    skyDay: ['#7fb8e6', '#aed4ef', '#f2d8e4', '#fbe9e2'],
    skyNight: ['#10122c', '#241a44', '#3a2650', '#4c3358'],
    colors: {
      grass: 0x7cc463, grassEdge: 0x64ad50, dirtTop: 0x8a5a3a, dirtDeep: 0x644026,
      rock: 0x8f8a88, water: 0x55b8d8,
      fogDay: 0xf0dee8, fogNight: 0x201a34,
      sunDay: 0xfff0e4, sunNight: 0xb0a8d8,
      tuftColorHSL: { h: 0.3, s: 0.5, l: 0.48 },
    },
    buildScenery: sakuraScenery,
    buildOuterZone: safeOuter(sakuraOuter),
  },
  // Autumn Hollow retired — its look now lives in the meadow homestead's fall
  // season (autumn foliage + fall-only leaf piles & pumpkins in the outer zone).
];

export function getTheme(id) {
  return THEMES.find((t) => t.id === id) || THEMES[0];
}
