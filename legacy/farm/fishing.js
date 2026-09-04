// Fishing minigame — dock, fish tables, and the FishingSession that runs one
// cast visually in the scene. Low-poly, flat-shaded, cheerful.

import * as THREE from 'three';
import { mat, mesh, box, cyl, cone, ball, P, mulberry32 } from './assets.js';
import { buildFish } from './fish_models.js';
import { buildJunk } from './junk_models.js';

// ============================================================
// FISH TABLES — per-theme catch lists
// ============================================================

export const FISH_TABLES = {
  meadow: [
    { id: 'carp', name: 'Carp', icon: '🐟', sell: 8, weight: 28 },
    { id: 'perch', name: 'Perch', icon: '🐟', sell: 10, weight: 24 },
    { id: 'bluegill', name: 'Bluegill', icon: '🐠', sell: 12, weight: 20 },
    { id: 'minnow', name: 'Minnow', icon: '🐟', sell: 5, weight: 30 },
    { id: 'catfish', name: 'Catfish', icon: '🐡', sell: 22, weight: 12 },
    { id: 'golden_koi', name: 'Golden Koi', icon: '🎏', sell: 150, weight: 1 },
  ],
  oceanside: [
    { id: 'sardine', name: 'Sardine', icon: '🐟', sell: 6, weight: 30 },
    { id: 'mackerel', name: 'Mackerel', icon: '🐟', sell: 10, weight: 24 },
    { id: 'sea_bass', name: 'Sea Bass', icon: '🐠', sell: 16, weight: 18 },
    { id: 'snapper', name: 'Snapper', icon: '🐠', sell: 20, weight: 14 },
    { id: 'tuna', name: 'Tuna', icon: '🐟', sell: 28, weight: 10 },
    { id: 'marlin', name: 'Marlin', icon: '🗡️', sell: 200, weight: 1 },
  ],
  boreal: [
    { id: 'trout', name: 'Trout', icon: '🐟', sell: 9, weight: 26 },
    { id: 'pike', name: 'Pike', icon: '🐊', sell: 18, weight: 14 },
    { id: 'grayling', name: 'Grayling', icon: '🐟', sell: 12, weight: 22 },
    { id: 'arctic_char', name: 'Arctic Char', icon: '🐠', sell: 20, weight: 12 },
    { id: 'whitefish', name: 'Whitefish', icon: '🐟', sell: 7, weight: 28 },
    { id: 'king_salmon', name: 'King Salmon', icon: '👑', sell: 180, weight: 1 },
  ],
  desert: [
    { id: 'mudskipper', name: 'Mudskipper', icon: '🐸', sell: 6, weight: 28 },
    { id: 'desert_catfish', name: 'Desert Catfish', icon: '🐡', sell: 16, weight: 16 },
    { id: 'tilapia', name: 'Tilapia', icon: '🐟', sell: 10, weight: 24 },
    { id: 'oasis_perch', name: 'Oasis Perch', icon: '🐠', sell: 14, weight: 20 },
    { id: 'lungfish', name: 'Lungfish', icon: '🦎', sell: 24, weight: 10 },
    { id: 'mirage_bass', name: 'Mirage Bass', icon: '✨', sell: 160, weight: 1 },
  ],
  sakura: [
    { id: 'koi', name: 'Koi', icon: '🐠', sell: 14, weight: 22 },
    { id: 'sweetfish', name: 'Sweetfish', icon: '🐟', sell: 10, weight: 24 },
    { id: 'loach', name: 'Loach', icon: '🐍', sell: 7, weight: 28 },
    { id: 'rice_eel', name: 'Rice Eel', icon: '🪱', sell: 16, weight: 16 },
    { id: 'crucian_carp', name: 'Crucian Carp', icon: '🐟', sell: 9, weight: 26 },
    { id: 'dragon_carp', name: 'Dragon Carp', icon: '🐉', sell: 190, weight: 1 },
  ],
  autumn: [
    { id: 'brown_trout', name: 'Brown Trout', icon: '🐟', sell: 11, weight: 24 },
    { id: 'eel', name: 'Eel', icon: '🪱', sell: 15, weight: 16 },
    { id: 'bullhead', name: 'Bullhead', icon: '🐡', sell: 8, weight: 26 },
    { id: 'fallfish', name: 'Fallfish', icon: '🍂', sell: 12, weight: 22 },
    { id: 'walleye', name: 'Walleye', icon: '🐠', sell: 24, weight: 11 },
    { id: 'ghost_pike', name: 'Ghost Pike', icon: '👻', sell: 170, weight: 1 },
  ],
};

// non-fish odds and ends you can also hook: junk (near-worthless flavor) and,
// rarely, a treasure chest opened for a coin cache. Shared across every biome.
export const JUNK = [
  { id: 'trash', name: 'Soggy Trash', icon: '🗑️', sell: 1, weight: 5, kind: 'junk' },
  { id: 'tin_can', name: 'Rusty Can', icon: '🥫', sell: 2, weight: 4, kind: 'junk' },
  { id: 'old_boot', name: 'Old Boot', icon: '🥾', sell: 2, weight: 3, kind: 'junk' },
  { id: 'seaweed', name: 'Tangled Seaweed', icon: '🌿', sell: 1, weight: 4, kind: 'junk' },
  { id: 'driftwood', name: 'Driftwood', icon: '🪵', sell: 3, weight: 2, kind: 'junk' },
];
export const TREASURES = [
  { id: 'chest_small', name: 'Small Chest', icon: '🧰', kind: 'treasure', coins: [40, 90], weight: 2.2 },
  { id: 'chest_iron', name: 'Iron Chest', icon: '🗃️', kind: 'treasure', coins: [120, 260], weight: 0.7 },
  { id: 'chest_gold', name: 'Golden Chest', icon: '🎁', kind: 'treasure', coins: [450, 1200], weight: 0.16 },
];

export function pickFish(themeId, rng) {
  // fish are common; junk is occasional; treasure is rare
  const table = (FISH_TABLES[themeId] || FISH_TABLES.meadow).concat(JUNK, TREASURES);
  const random = typeof rng === 'function' ? rng : Math.random;
  let total = 0;
  for (const f of table) total += f.weight;
  let roll = random() * total;
  for (const f of table) {
    roll -= f.weight;
    if (roll <= 0) return f;
  }
  return table[0];
}

// ============================================================
// DOCK — low-poly wooden fishing dock, origin at landward end,
// extending along +x about 9 units. Deck surface at y ≈ 0.9.
// ============================================================

export function buildDock() {
  const g = new THREE.Group();
  const rng = mulberry32(0xF15C);
  const DECK_Y = 0.9;
  const PLANK_T = 0.14;

  // support posts — two rows, angled slightly, reaching down below the deck
  for (let i = 0; i < 4; i++) {
    const x = 0.9 + i * 2.55;
    for (const side of [-1, 1]) {
      const post = cyl(0.16, 0.2, 3.4, P.woodDark, 6);
      post.position.set(x + (rng() - 0.5) * 0.12, DECK_Y - 1.75, side * 1.0);
      post.rotation.x = side * (0.05 + rng() * 0.05);
      post.rotation.z = (rng() - 0.5) * 0.08;
      g.add(post);
    }
  }

  // two stringers running under the planks
  for (const side of [-1, 1]) {
    const beam = box(9.2, 0.18, 0.22, P.woodDark);
    beam.position.set(4.5, DECK_Y - PLANK_T - 0.09, side * 0.95);
    g.add(beam);
  }

  // plank deck — individual planks with tiny rotation jitter
  const plankCount = 12;
  for (let i = 0; i < plankCount; i++) {
    const w = 0.68;
    const plank = box(w, PLANK_T, 2.3, i % 3 === 1 ? P.woodLight : P.wood);
    plank.position.set(0.45 + i * (w + 0.075), DECK_Y - PLANK_T / 2, (rng() - 0.5) * 0.05);
    plank.rotation.y = (rng() - 0.5) * 0.05;
    plank.receiveShadow = true;
    g.add(plank);
  }

  // mooring post at the end with a rope coil
  const mooring = cyl(0.17, 0.21, 1.35, P.woodDark, 7);
  mooring.position.set(8.55, DECK_Y + 0.55, -0.85);
  mooring.rotation.z = 0.08;
  g.add(mooring);
  const moorCap = ball(0.2, P.woodLight, 0.6, 7);
  moorCap.position.set(8.55, DECK_Y + 1.22, -0.85);
  g.add(moorCap);
  for (let i = 0; i < 3; i++) {
    const coil = mesh(new THREE.TorusGeometry(0.24, 0.05, 5, 10), mat(0xc9a86a));
    coil.position.set(8.55, DECK_Y + 0.35 + i * 0.13, -0.85);
    coil.rotation.x = Math.PI / 2;
    coil.rotation.z = rng();
    g.add(coil);
  }

  // bait bucket at the end
  const bucket = cyl(0.34, 0.27, 0.55, 0x5b7f9e, 9, { roughness: 0.55, metalness: 0.2 });
  bucket.position.set(8.35, DECK_Y + 0.275, 0.72);
  g.add(bucket);
  const bait = cyl(0.28, 0.28, 0.08, 0x7a5a38, 9);
  bait.position.set(8.35, DECK_Y + 0.5, 0.72);
  g.add(bait);
  const wiggler = ball(0.06, 0xd88a9a, 0.8, 5);
  wiggler.position.set(8.42, DECK_Y + 0.56, 0.66);
  g.add(wiggler);

  // small lantern stub on the mooring side
  const lampPost = cyl(0.06, 0.08, 0.9, P.woodDark, 5);
  lampPost.position.set(8.9, DECK_Y + 0.45, 0.05);
  g.add(lampPost);
  const lampHead = box(0.26, 0.3, 0.26, 0x4a4640, { metalness: 0.3 });
  lampHead.position.set(8.9, DECK_Y + 1.0, 0.05);
  g.add(lampHead);
  const lampGlow = box(0.17, 0.2, 0.17, 0xffd75a, { emissive: 0xffb43a, emissiveIntensity: 1.2 });
  lampGlow.position.copy(lampHead.position);
  g.add(lampGlow);

  // ---- the standing rod: a proper fishing rod resting in a forked stand
  // at the dock's end, line arcing down to a bobber on the water ----
  {
    const rodG = new THREE.Group();
    // forked stick stand
    const standLeg = cyl(0.05, 0.07, 1.0, P.woodDark, 5);
    standLeg.position.set(0, 0.5, 0);
    standLeg.rotation.x = -0.15;
    rodG.add(standLeg);
    for (const s of [-1, 1]) {
      const fork = cyl(0.035, 0.045, 0.3, P.woodDark, 4);
      fork.position.set(0, 1.05, s * 0.07);
      fork.rotation.x = s * 0.5;
      rodG.add(fork);
    }
    // the rod itself: cork grip, tapering blank in two segments with a bend
    const rod = new THREE.Group();
    const grip = cyl(0.055, 0.06, 0.45, 0xc9a86a, 6);
    grip.position.y = 0.22;
    rod.add(grip);
    const buttCap = ball(0.06, 0x4a4640, 0.8, 5);
    rod.add(buttCap);
    const blank1 = cyl(0.032, 0.045, 1.5, 0x8a5a30, 6);
    blank1.position.y = 1.18;
    rod.add(blank1);
    const blank2 = cyl(0.014, 0.03, 1.3, 0x9c6a3a, 5);
    blank2.position.y = 2.5;
    blank2.rotation.z = -0.12; // the tip bows under the line's weight
    rod.add(blank2);
    // an invisible marker at the very tip of the blank — we read its real
    // position after assembly so the fishing line anchors exactly on the rod
    const tipMarker = new THREE.Object3D();
    tipMarker.position.set(0, 0.65, 0); // top end of the 1.3-long blank2 cylinder
    blank2.add(tipMarker);
    // line guides
    for (const [gy, gr] of [[0.95, 0.05], [1.7, 0.04], [2.4, 0.032]]) {
      const guide = mesh(new THREE.TorusGeometry(gr, 0.012, 4, 8), mat(0x4a4640, { metalness: 0.4 }));
      guide.position.set(0.05, gy, 0);
      rod.add(guide);
    }
    // reel: side plate + spool + crank
    const reel = mesh(new THREE.TorusGeometry(0.09, 0.045, 6, 10), mat(0x5b7f9e, { metalness: 0.35, roughness: 0.4 }));
    reel.position.set(0.1, 0.55, 0);
    reel.rotation.y = Math.PI / 2;
    rod.add(reel);
    const crank = cyl(0.015, 0.015, 0.12, 0x4a4640, 4);
    crank.position.set(0.16, 0.62, 0.06);
    crank.rotation.x = Math.PI / 2;
    rod.add(crank);
    const knob = ball(0.03, 0xc9a86a, 1, 4);
    knob.position.set(0.16, 0.62, 0.13);
    rod.add(knob);
    // rest the rod in the fork, leaning up and out over the water
    rod.position.set(-0.55, 0.28, 0);
    rod.rotation.z = -0.62;
    rodG.add(rod);
    rodG.position.set(9.15, DECK_Y, 0.3);
    rodG.name = 'dockRod'; // themes can show the rod alone (e.g. stood on a bridge)
    g.add(rodG);
    // no bobber or line until the player actually casts
    g.userData.idleTackle = [];
    // read the marker's true position in dock-local space (the dock group is at
    // identity during build, so a world position here is already dock-local) —
    // this keeps the cast line anchored exactly on the rod tip at any facing
    g.updateWorldMatrix(true, true);
    g.userData.rodTip = tipMarker.getWorldPosition(new THREE.Vector3());
  }

  g.userData.castPoint = new THREE.Vector3(10.5, 0, 0);
  return g;
}

// ============================================================
// sprite helpers
// ============================================================

function emojiSprite(emoji, worldSize = 1) {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.font = '48px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, size / 2, size / 2 + 3);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, depthWrite: false,
  }));
  sprite.scale.setScalar(worldSize);
  return sprite;
}

function makeBobber() {
  const g = new THREE.Group();
  const bottom = ball(0.22, 0xf6f2e8, 0.85, 8, { roughness: 0.4 });
  bottom.position.y = 0;
  g.add(bottom);
  const top = ball(0.22, 0xe0263a, 0.85, 8, { roughness: 0.4 });
  top.position.y = 0.16;
  g.add(top);
  const stem = cyl(0.03, 0.03, 0.3, 0xf6f2e8, 5);
  stem.position.y = 0.42;
  g.add(stem);
  const tip = ball(0.06, 0xe0263a, 1, 5, { roughness: 0.4 });
  tip.position.y = 0.58;
  g.add(tip);
  return g;
}

// ============================================================
// FishingSession — one cast, driven by update(nowMs)
// ============================================================

const CAST_DUR = 700;       // ms, bobber flight
const BITE_WINDOW = 900;    // ms, click window
const CATCH_DUR = 700;      // ms, fish arcs up
const MAX_FALSE_CLICKS = 2; // spooked after this many early clicks
const MAX_MISSED_BITES = 3; // gone after this many expired bites

export class FishingSession {
  constructor({ scene, castFrom, rodTip, waterY, themeId, rng, luck, onState, onResult } = {}) {
    this.luck = luck || 1;
    this.scene = scene || null;
    this.castFrom = castFrom ? castFrom.clone() : new THREE.Vector3();
    // the line hangs from the rod tip; fall back to castFrom if not provided
    this.rodTip = rodTip ? rodTip.clone() : this.castFrom.clone();
    this.waterY = typeof waterY === 'number' ? waterY : 0;
    this.themeId = themeId || 'meadow';
    this.rng = typeof rng === 'function' ? rng : Math.random;
    this.onState = typeof onState === 'function' ? onState : null;
    this.onResult = typeof onResult === 'function' ? onResult : null;

    this.state = 'cast';       // 'cast' | 'waiting' | 'bite' | 'catch' | 'done'
    this.stateStart = null;    // set on first update
    this.waitDur = 0;
    this.falseClicks = 0;
    this.missedBites = 0;
    this.disposed = false;
    this.resultSent = false;
    this.ripples = [];
    this.catchSprite = null;
    this.catchFish = null;
    this.now = 0;

    try {
      // landing point: past the dock end, on the water surface — every cast
      // flies a different distance and fans left or right of straight out
      const dir = this.castFrom.clone();
      dir.y = 0;
      const len = dir.length();
      dir.set(len > 0.001 ? dir.x / len : 1, 0, len > 0.001 ? dir.z / len : 0);
      const spread = (this.rng() - 0.5) * 0.9; // ±~25° off the dock line
      const cs = Math.cos(spread), sn = Math.sin(spread);
      dir.set(dir.x * cs - dir.z * sn, 0, dir.x * sn + dir.z * cs);
      // random, far casts — 4 to 24 units out (up to ~5x the old range)
      const castDist = 4 + this.rng() * 20;
      this.castDur = 620 + castDist * 45; // longer throws hang in the air longer
      this.landPoint = new THREE.Vector3(
        this.castFrom.x + dir.x * castDist,
        this.waterY,
        this.castFrom.z + dir.z * castDist
      );

      this.group = new THREE.Group();

      // fishing line — 3 points arcing from castFrom down to the bobber
      this.lineGeo = new THREE.BufferGeometry();
      this.linePos = new Float32Array(9);
      this.lineGeo.setAttribute('position', new THREE.BufferAttribute(this.linePos, 3));
      this.line = new THREE.Line(this.lineGeo, new THREE.LineBasicMaterial({
        color: 0x3a3a40, transparent: true, opacity: 0.75,
      }));
      this.line.frustumCulled = false;
      this.group.add(this.line);

      this.bobber = makeBobber();
      this.bobber.position.copy(this.rodTip);
      this.group.add(this.bobber);

      this.alert = emojiSprite('❗', 1.3);
      this.alert.visible = false;
      this.group.add(this.alert);

      if (this.scene) this.scene.add(this.group);
      this._emitState('cast');
    } catch (e) {
      // construction failed partway; leave what exists for dispose to clean
      this.group = this.group || new THREE.Group();
    }
  }

  _emitState(s) {
    try { if (this.onState) this.onState(s); } catch (e) { /* host error, ignore */ }
  }

  _emitResult(fish) {
    if (this.resultSent) return;
    this.resultSent = true;
    try { if (this.onResult) this.onResult(fish); } catch (e) { /* host error, ignore */ }
  }

  _setState(state, now) {
    this.state = state;
    this.stateStart = now;
  }

  _rollWait() {
    // real suspense: 3-17s, weighted toward the middle so most casts make you
    // wait a good while, with the odd quick nibble or long patient stretch
    const a = this.rng(), b = this.rng();
    // "try again" after the one that got away shortens the wait for a spell
    const luck = this.luck || 1;
    return (3000 + ((a + b) / 2) * 14000) / luck;
  }

  _spawnRipple(x, z, maxScale = 2.2, dur = 650) {
    try {
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.32, 0.44, 20),
        new THREE.MeshBasicMaterial({
          color: 0xdff4ff, transparent: true, opacity: 0.8,
          side: THREE.DoubleSide, depthWrite: false,
        })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, this.waterY + 0.03, z);
      this.group.add(ring);
      this.ripples.push({ mesh: ring, start: this.now, dur, maxScale });
    } catch (e) { /* cosmetic only */ }
  }

  _updateRipples(now) {
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i];
      const t = (now - r.start) / r.dur;
      if (t >= 1) {
        this.group.remove(r.mesh);
        if (r.mesh.geometry) r.mesh.geometry.dispose();
        if (r.mesh.material) r.mesh.material.dispose();
        this.ripples.splice(i, 1);
      } else {
        const s = 1 + t * (r.maxScale - 1);
        r.mesh.scale.set(s, s, 1);
        r.mesh.material.opacity = 0.8 * (1 - t);
      }
    }
  }

  _updateLine() {
    const a = this.rodTip;
    const b = this.bobber.position;
    const midX = (a.x + b.x) / 2;
    const midZ = (a.z + b.z) / 2;
    const sag = Math.min(0.8, Math.abs(a.y - b.y) * 0.12 + 0.25);
    const midY = Math.min(a.y, b.y + Math.abs(a.y - b.y) * 0.5) - sag + Math.abs(a.y - b.y) * 0.45;
    const p = this.linePos;
    p[0] = a.x; p[1] = a.y; p[2] = a.z;
    p[3] = midX; p[4] = midY; p[5] = midZ;
    p[6] = b.x; p[7] = b.y + 0.55; p[8] = b.z;
    this.lineGeo.attributes.position.needsUpdate = true;
  }

  _finish(fish) {
    this._emitResult(fish);
    this.dispose();
  }

  update(nowMs) {
    try {
      if (this.disposed || this.state === 'done') return;
      const now = typeof nowMs === 'number' ? nowMs : performance.now();
      this.now = now;
      if (this.stateStart === null) this.stateStart = now;
      const t = now - this.stateStart;

      if (this.state === 'cast') {
        const k = Math.min(1, t / (this.castDur || CAST_DUR));
        const ease = k * k * (3 - 2 * k);
        this.bobber.position.lerpVectors(this.rodTip, this.landPoint, ease);
        // arc: lift above the straight lerp early in flight
        this.bobber.position.y += Math.sin(Math.min(1, k * 1.15) * Math.PI) * 1.4;
        if (k >= 1) {
          this.bobber.position.copy(this.landPoint);
          this._spawnRipple(this.landPoint.x, this.landPoint.z, 2.6, 700);
          this.waitDur = this._rollWait();
          this._setState('waiting', now);
          this._emitState('waiting');
        }
      } else if (this.state === 'waiting') {
        // gentle idle bobbing on the water
        this.bobber.position.set(
          this.landPoint.x + Math.sin(now * 0.0011) * 0.06,
          this.waterY + Math.sin(now * 0.0023) * 0.07,
          this.landPoint.z + Math.cos(now * 0.0009) * 0.06
        );
        this.bobber.rotation.z = Math.sin(now * 0.0017) * 0.1;
        if (t >= this.waitDur) {
          this._setState('bite', now);
          this._emitState('bite');
          this.alert.visible = true;
          this._spawnRipple(this.landPoint.x, this.landPoint.z, 3.2, 800);
        }
      } else if (this.state === 'bite') {
        // sharp dip + jitter
        const bt = t / BITE_WINDOW;
        this.bobber.position.set(
          this.landPoint.x + Math.sin(now * 0.03) * 0.05,
          this.waterY - 0.38 + Math.sin(now * 0.025) * 0.06,
          this.landPoint.z
        );
        this.alert.position.set(this.landPoint.x, this.waterY + 1.5 + Math.sin(now * 0.012) * 0.12, this.landPoint.z);
        const pop = Math.min(1, bt * 6);
        this.alert.scale.setScalar(1.3 * (0.4 + 0.6 * pop));
        if (t >= BITE_WINDOW) {
          // bite expired unclicked — bobber pops back up
          this.alert.visible = false;
          this.missedBites += 1;
          if (this.missedBites >= MAX_MISSED_BITES) {
            this._finish(null);
            return;
          }
          this._spawnRipple(this.landPoint.x, this.landPoint.z, 1.8, 500);
          this.waitDur = this._rollWait();
          this._setState('waiting', now);
          this._emitState('waiting');
        }
      } else if (this.state === 'catch') {
        const k = Math.min(1, t / CATCH_DUR);
        if (this.catchSprite) {
          // quadratic arc from water up toward castFrom
          const a = this.landPoint;
          const b = this.castFrom;
          const peakY = Math.max(a.y, b.y) + 2.2;
          const inv = 1 - k;
          this.catchSprite.position.set(
            inv * inv * a.x + 2 * inv * k * ((a.x + b.x) / 2) + k * k * b.x,
            inv * inv * a.y + 2 * inv * k * peakY + k * k * (b.y + 1.2),
            inv * inv * a.z + 2 * inv * k * ((a.z + b.z) / 2) + k * k * b.z
          );
          // sprite fallback spins via material.rotation; the 3D model flops/wiggles
          if (this.catchSprite.material) this.catchSprite.material.rotation = k * 2.5;
          else {
            this.catchSprite.rotation.z = 0.5 + Math.sin(k * Math.PI * 3) * 0.5; // flopping
            this.catchSprite.rotation.y = -0.6;
            if (this.catchSprite.userData.tail) this.catchSprite.userData.tail.rotation.y = Math.sin(k * Math.PI * 8) * 0.6;
          }
        }
        if (k >= 1) {
          this._finish(this.catchFish);
          return;
        }
      }

      this._updateRipples(now);
      if (this.state !== 'catch') this._updateLine();
      else this.line.visible = false;
    } catch (e) {
      // never let a frame error escape into the host loop
    }
  }

  clickNow() {
    try {
      if (this.disposed || this.state === 'done' || this.state === 'catch') return;
      if (this.state === 'bite') {
        // caught it
        const fish = pickFish(this.themeId, this.rng);
        this.catchFish = fish;
        this.alert.visible = false;
        this.bobber.visible = false;
        this._spawnRipple(this.landPoint.x, this.landPoint.z, 3.0, 700);
        // a treasure chest skips the leaping animation entirely — a big splash,
        // then the host pops a centered "you found a treasure chest!" reveal
        if (fish.kind === 'treasure') {
          this._spawnRipple(this.landPoint.x, this.landPoint.z, 5.0, 900);
          this._finish(fish);
          return;
        }
        // fish leap up as a 3D model; junk comes up as its own 3D model too
        try {
          if (fish.kind === 'junk') {
            this.catchSprite = buildJunk(fish.id);
            this.catchSprite.scale.setScalar(2.0);
          } else {
            this.catchSprite = buildFish(fish.id);
            this.catchSprite.scale.setScalar(2.4);
          }
        } catch (e) {
          this.catchSprite = emojiSprite(fish.icon || '🐟', 1.5);
        }
        this.catchSprite.position.copy(this.landPoint);
        this.group.add(this.catchSprite);
        this._setState('catch', this.now || (this.stateStart ?? 0));
        this._emitState('catch');
        this.stateStart = null; // re-anchor on next update for smooth timing
      } else if (this.state === 'waiting') {
        // reeled in before the bite — you spook the fish and lose the cast entirely.
        // that's the penalty: the bobber comes back and you have to re-cast.
        this._spawnRipple(this.landPoint.x, this.landPoint.z, 1.6, 450);
        this._finish({ tooSoon: true });
      }
      // during 'cast': ignore clicks (line still in flight)
    } catch (e) {
      // swallow — defensive by contract
    }
  }

  dispose() {
    try {
      if (this.disposed) return;
      this.disposed = true;
      this.state = 'done';
      if (this.group) {
        if (this.scene) this.scene.remove(this.group);
        this.group.traverse((obj) => {
          try {
            if (obj.geometry) obj.geometry.dispose();
            const m = obj.material;
            if (Array.isArray(m)) m.forEach((mm) => { if (mm.map) mm.map.dispose(); mm.dispose(); });
            else if (m) { if (m.map) m.map.dispose(); m.dispose(); }
          } catch (e) { /* keep tearing down */ }
        });
      }
      this.ripples.length = 0;
    } catch (e) {
      this.disposed = true;
      this.state = 'done';
    }
  }
}
