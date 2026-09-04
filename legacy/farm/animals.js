// Animals for the Homestead game — stylized low-poly critters, procedurally
// sculpted from the shared primitive helpers. Every animal stands at the
// origin facing +x with its feet on y=0, and carries:
//   group.userData.body  — inner group holding all visual parts (bobbed while walking)
//   group.userData.parts — optional named parts { head, tail, earL, earR } for animation

import * as THREE from 'three';
import { mat, mesh, box, cyl, cone, ball } from './assets.js';
import { buildAnimalModel, animalModelReady } from './animal_models.js';

export const ANIMAL_TYPES = ['bunny', 'chicken', 'duck', 'cat', 'dog', 'rooster', 'sheep', 'goat', 'pig', 'cow', 'horse'];

// placement footprint radius
export const ANIMAL_RADIUS = {
  bunny: 0.9, chicken: 1.0, duck: 1.0, cat: 1.0, dog: 1.2, rooster: 1.0,
  sheep: 1.6, goat: 1.5, pig: 1.6, cow: 2.2, horse: 2.4,
};

// ---------- shared bits ----------

function legs(parent, pairs, r, h, color) {
  for (const [x, z] of pairs) {
    const leg = cyl(r, r * 1.15, h, color, 5);
    leg.position.set(x, h / 2, z);
    parent.add(leg);
  }
}

function shell() {
  const g = new THREE.Group();
  const body = new THREE.Group();
  g.add(body);
  g.userData.body = body;
  g.userData.parts = {};
  return [g, body, g.userData.parts];
}

// ---------- builders (8–20 primitives each, big heads, stubby legs) ----------

function buildBunny() {
  const [g, b, parts] = shell();
  const fur = 0xf1ede4;
  const torso = ball(0.3, fur, 0.85);
  torso.scale.x = 1.25;
  torso.position.set(-0.02, 0.34, 0);
  b.add(torso);
  const head = new THREE.Group();
  head.position.set(0.26, 0.56, 0);
  head.add(ball(0.22, fur));
  const nose = ball(0.05, 0xe8a5a5, 1, 6);
  nose.position.set(0.2, -0.02, 0);
  head.add(nose);
  const earL = ball(0.07, fur, 2.6, 6);
  earL.position.set(-0.05, 0.34, -0.1);
  earL.rotation.x = -0.16;
  const earR = ball(0.07, fur, 2.6, 6);
  earR.position.set(-0.05, 0.34, 0.1);
  earR.rotation.x = 0.16;
  head.add(earL, earR);
  b.add(head);
  const tail = ball(0.11, 0xfaf7f0, 1, 6);
  tail.position.set(-0.34, 0.32, 0);
  b.add(tail);
  for (const z of [-0.13, 0.13]) {
    const foot = box(0.24, 0.09, 0.11, fur);
    foot.position.set(0.06, 0.05, z);
    b.add(foot);
  }
  Object.assign(parts, { head, tail, earL, earR });
  return g;
}

function buildChickenLike(rooster) {
  const [g, b, parts] = shell();
  const feather = rooster ? 0xf3ead4 : 0xf6f2e8;
  const legH = rooster ? 0.5 : 0.32;
  const torso = ball(0.42, feather, 0.85);
  torso.scale.x = 1.15;
  torso.position.set(0, legH + 0.3, 0);
  b.add(torso);
  legs(b, [[0.05, -0.14], [0.05, 0.14]], 0.035, legH, 0xe8933c);
  for (const z of [-0.38, 0.38]) {
    const wing = ball(0.2, rooster ? 0xe0d3b4 : 0xe6e0d0, 0.7, 6);
    wing.scale.x = 1.4;
    wing.position.set(-0.05, legH + 0.32, z * 0.95);
    b.add(wing);
  }
  const head = new THREE.Group();
  head.position.set(0.34, legH + 0.72, 0);
  head.add(ball(0.26, feather));
  const comb = cone(rooster ? 0.14 : 0.09, rooster ? 0.34 : 0.22, 0xd8302a, 5);
  comb.position.set(0, rooster ? 0.36 : 0.28, 0);
  head.add(comb);
  if (rooster) {
    const comb2 = cone(0.1, 0.24, 0xd8302a, 5);
    comb2.position.set(-0.14, 0.3, 0);
    head.add(comb2);
  }
  const beak = cone(0.08, 0.22, 0xe8933c, 5);
  beak.position.set(0.3, -0.02, 0);
  beak.rotation.z = -Math.PI / 2;
  head.add(beak);
  const wattle = ball(rooster ? 0.09 : 0.05, 0xc22a22, 1.4, 5);
  wattle.position.set(0.18, -0.18, 0);
  head.add(wattle);
  b.add(head);
  if (rooster) {
    // arcing dark-green tail feathers
    for (let i = 0; i < 3; i++) {
      const plume = ball(0.08, i === 1 ? 0x1d5c3a : 0x276b45, 3.4, 5);
      plume.position.set(-0.5 - i * 0.06, legH + 0.62 + i * 0.05, (i - 1) * 0.12);
      plume.rotation.z = 0.8 + i * 0.18;
      b.add(plume);
    }
  } else {
    const tail = cone(0.2, 0.46, 0xd9d2c2, 6);
    tail.position.set(-0.5, legH + 0.5, 0);
    tail.rotation.z = 0.95;
    b.add(tail);
    parts.tail = tail;
  }
  parts.head = head;
  return g;
}

function buildDuck() {
  const [g, b, parts] = shell();
  const torso = ball(0.38, 0xf3efe4, 0.7); // boat-shaped hull
  torso.scale.x = 1.65;
  torso.position.set(0, 0.44, 0);
  b.add(torso);
  const tail = cone(0.12, 0.28, 0xe6e0d0, 5);
  tail.position.set(-0.6, 0.58, 0);
  tail.rotation.z = 1.1;
  b.add(tail);
  legs(b, [[0.05, -0.14], [0.05, 0.14]], 0.035, 0.24, 0xe8933c);
  const head = new THREE.Group();
  head.position.set(0.42, 0.86, 0);
  head.add(ball(0.21, 0x2e7d46)); // mallard-green head
  const collar = cyl(0.12, 0.12, 0.08, 0xf3efe4, 7);
  collar.position.set(-0.06, -0.22, 0);
  head.add(collar);
  const bill = box(0.26, 0.07, 0.18, 0xf2a03c);
  bill.position.set(0.26, -0.04, 0);
  head.add(bill);
  b.add(head);
  parts.head = head;
  parts.tail = tail;
  return g;
}

function buildCat() {
  const [g, b, parts] = shell();
  const fur = 0xe08b3e, stripe = 0xa85f22;
  const torso = ball(0.28, fur, 0.9);
  torso.scale.x = 1.55;
  torso.position.set(-0.02, 0.4, 0);
  b.add(torso);
  for (let i = 0; i < 3; i++) { // darker tabby stripes across the back
    const s = box(0.08, 0.1, 0.42, stripe);
    s.position.set(-0.2 + i * 0.17, 0.6, 0);
    s.rotation.x = 0.12 * (i - 1);
    b.add(s);
  }
  const head = new THREE.Group();
  head.position.set(0.42, 0.64, 0);
  head.add(ball(0.2, fur));
  const earL = cone(0.08, 0.16, fur, 4);
  earL.position.set(-0.02, 0.2, -0.11);
  const earR = cone(0.08, 0.16, fur, 4);
  earR.position.set(-0.02, 0.2, 0.11);
  head.add(earL, earR);
  const nose = ball(0.04, 0xd97b8a, 1, 5);
  nose.position.set(0.19, -0.03, 0);
  head.add(nose);
  b.add(head);
  const tail = new THREE.Group(); // upright curved tail from stacked spheres
  tail.position.set(-0.42, 0.52, 0);
  for (let i = 0; i < 4; i++) {
    const seg = ball(0.055, i === 3 ? stripe : fur, 1, 5);
    const t = i / 3;
    seg.position.set(-0.16 * Math.sin(t * 1.3), 0.32 * t, 0);
    tail.add(seg);
  }
  b.add(tail);
  legs(b, [[0.28, -0.12], [0.28, 0.12], [-0.24, -0.12], [-0.24, 0.12]], 0.05, 0.26, fur);
  Object.assign(parts, { head, tail, earL, earR });
  return g;
}

function buildDog() {
  const [g, b, parts] = shell();
  const fur = 0xb98a4f, dark = 0x74522f;
  const torso = box(0.85, 0.42, 0.4, fur);
  torso.position.set(-0.05, 0.56, 0);
  b.add(torso);
  const chest = ball(0.24, 0xcfa76a, 0.9, 7);
  chest.position.set(0.32, 0.52, 0);
  b.add(chest);
  const head = new THREE.Group();
  head.position.set(0.52, 0.9, 0);
  head.add(ball(0.24, fur));
  const snout = box(0.24, 0.15, 0.17, 0xcfa76a);
  snout.position.set(0.24, -0.05, 0);
  head.add(snout);
  const nose = ball(0.05, 0x33302c, 1, 5);
  nose.position.set(0.37, -0.02, 0);
  head.add(nose);
  const earL = box(0.09, 0.22, 0.11, dark);
  earL.position.set(-0.02, 0.18, -0.18);
  earL.rotation.x = -0.85; // floppy
  const earR = box(0.09, 0.22, 0.11, dark);
  earR.position.set(-0.02, 0.18, 0.18);
  earR.rotation.x = 0.85;
  head.add(earL, earR);
  b.add(head);
  const tail = new THREE.Group();
  tail.position.set(-0.48, 0.68, 0);
  const tailSeg = cyl(0.03, 0.06, 0.38, dark, 5);
  tailSeg.position.set(-0.12, 0.12, 0);
  tailSeg.rotation.z = 0.9;
  tail.add(tailSeg);
  b.add(tail);
  legs(b, [[0.3, -0.13], [0.3, 0.13], [-0.34, -0.13], [-0.34, 0.13]], 0.06, 0.36, fur);
  Object.assign(parts, { head, tail, earL, earR });
  return g;
}

function buildSheep() {
  const [g, b, parts] = shell();
  const wool = 0xefe7d3, dark = 0x4a4a4f;
  const puffs = [[0, 0.82, 0, 0.55, 1.2], [0.32, 0.98, 0, 0.38, 1], [-0.36, 0.92, 0, 0.36, 1]];
  for (const [x, y, z, r, sx] of puffs) {
    const p = ball(r, wool, 0.85);
    p.scale.x = sx;
    p.position.set(x, y, z);
    b.add(p);
  }
  const head = new THREE.Group();
  head.position.set(0.62, 0.9, 0);
  const face = ball(0.2, dark, 0.9);
  face.scale.x = 1.2;
  head.add(face);
  const cap = ball(0.16, wool, 0.8, 6);
  cap.position.set(-0.05, 0.15, 0);
  head.add(cap);
  const earL = ball(0.07, dark, 0.6, 5);
  earL.position.set(-0.04, 0.02, -0.2);
  const earR = ball(0.07, dark, 0.6, 5);
  earR.position.set(-0.04, 0.02, 0.2);
  head.add(earL, earR);
  b.add(head);
  const tail = ball(0.14, wool, 1, 6);
  tail.position.set(-0.66, 0.78, 0);
  b.add(tail);
  legs(b, [[0.32, -0.2], [0.32, 0.2], [-0.32, -0.2], [-0.32, 0.2]], 0.07, 0.45, dark);
  Object.assign(parts, { head, tail, earL, earR });
  return g;
}

function buildGoat() {
  const [g, b, parts] = shell();
  const coat = 0xe6e2da, gray = 0xb9b4ab;
  const torso = ball(0.4, coat, 0.85);
  torso.scale.x = 1.35;
  torso.position.set(0, 0.68, 0);
  b.add(torso);
  const head = new THREE.Group();
  head.position.set(0.56, 0.98, 0);
  head.add(ball(0.19, coat));
  const muzzle = ball(0.11, gray, 0.85, 6);
  muzzle.position.set(0.15, -0.05, 0);
  head.add(muzzle);
  for (const z of [-0.08, 0.08]) {
    const horn = cone(0.045, 0.2, 0x8a8177, 5);
    horn.position.set(-0.06, 0.22, z);
    horn.rotation.z = 0.55; // swept back
    head.add(horn);
  }
  const beard = cone(0.06, 0.18, gray, 5);
  beard.position.set(0.14, -0.24, 0);
  beard.rotation.z = Math.PI; // little beard pointing down
  head.add(beard);
  const earL = ball(0.08, coat, 0.5, 5);
  earL.position.set(-0.04, 0.06, -0.2);
  earL.rotation.x = -0.5;
  const earR = ball(0.08, coat, 0.5, 5);
  earR.position.set(-0.04, 0.06, 0.2);
  earR.rotation.x = 0.5;
  head.add(earL, earR);
  b.add(head);
  const tail = ball(0.09, coat, 1.6, 5);
  tail.position.set(-0.56, 0.86, 0);
  tail.rotation.z = -0.6;
  b.add(tail);
  legs(b, [[0.3, -0.16], [0.3, 0.16], [-0.3, -0.16], [-0.3, 0.16]], 0.06, 0.44, gray);
  Object.assign(parts, { head, tail, earL, earR });
  return g;
}

function buildPig() {
  const [g, b, parts] = shell();
  const pink = 0xf0a3a8, deep = 0xdf8b93;
  const torso = ball(0.48, pink, 0.85);
  torso.scale.x = 1.4;
  torso.position.set(0, 0.6, 0);
  b.add(torso);
  const head = new THREE.Group();
  head.position.set(0.62, 0.72, 0);
  head.add(ball(0.27, pink));
  const snout = cyl(0.11, 0.11, 0.12, deep, 8); // flat disc snout
  snout.position.set(0.28, -0.02, 0);
  snout.rotation.z = Math.PI / 2;
  head.add(snout);
  const earL = ball(0.09, deep, 0.55, 5);
  earL.position.set(-0.02, 0.22, -0.15);
  earL.rotation.set(-0.5, 0, 0.5); // flopped forward
  const earR = ball(0.09, deep, 0.55, 5);
  earR.position.set(-0.02, 0.22, 0.15);
  earR.rotation.set(0.5, 0, 0.5);
  head.add(earL, earR);
  b.add(head);
  const tail = mesh(new THREE.TorusGeometry(0.09, 0.028, 5, 9, Math.PI * 1.6), mat(pink)); // curly tail
  tail.position.set(-0.68, 0.68, 0);
  tail.rotation.y = Math.PI / 2 - 0.3;
  b.add(tail);
  legs(b, [[0.32, -0.2], [0.32, 0.2], [-0.32, -0.2], [-0.32, 0.2]], 0.08, 0.3, pink);
  Object.assign(parts, { head, tail, earL, earR });
  return g;
}

function buildCow() {
  const [g, b, parts] = shell();
  const hide = 0xf1ede4, patchC = 0x2f2c30, pink = 0xe8a5b0;
  const torso = ball(0.72, hide, 0.8);
  torso.scale.x = 1.5;
  torso.position.set(0, 1.05, 0);
  b.add(torso);
  // black patches — squashed dark balls sunk into the body surface
  const patchSpots = [[0.35, 1.5, 0.3, 0.3], [-0.5, 1.35, -0.35, 0.34], [0.1, 0.85, -0.5, 0.26]];
  for (const [x, y, z, r] of patchSpots) {
    const p = ball(r, patchC, 0.55, 6);
    p.position.set(x, y, z);
    p.rotation.set(x, z, y); // arbitrary tilt so they hug the hull
    b.add(p);
  }
  const head = new THREE.Group();
  head.position.set(1.0, 1.45, 0);
  head.add(ball(0.32, hide));
  const snout = ball(0.22, pink, 0.75, 7);
  snout.scale.x = 1.15;
  snout.position.set(0.24, -0.12, 0);
  head.add(snout);
  for (const z of [-0.2, 0.2]) {
    const horn = cone(0.06, 0.2, 0xd9cfb8, 5);
    horn.position.set(-0.02, 0.3, z);
    horn.rotation.x = z > 0 ? 0.7 : -0.7;
    head.add(horn);
  }
  const earL = ball(0.1, hide, 0.5, 5);
  earL.position.set(-0.08, 0.1, -0.3);
  earL.rotation.x = -0.9;
  const earR = ball(0.1, hide, 0.5, 5);
  earR.position.set(-0.08, 0.1, 0.3);
  earR.rotation.x = 0.9;
  head.add(earL, earR);
  b.add(head);
  const udder = ball(0.24, pink, 0.8, 7);
  udder.position.set(-0.3, 0.55, 0);
  b.add(udder);
  const tail = new THREE.Group();
  tail.position.set(-1.02, 1.3, 0);
  const cord = cyl(0.03, 0.04, 0.6, hide, 5);
  cord.position.set(-0.08, -0.28, 0);
  cord.rotation.z = -0.25;
  tail.add(cord);
  const tuft = ball(0.09, patchC, 1.3, 5);
  tuft.position.set(-0.15, -0.6, 0);
  tail.add(tuft);
  b.add(tail);
  legs(b, [[0.55, -0.3], [0.55, 0.3], [-0.55, -0.3], [-0.55, 0.3]], 0.11, 0.6, hide);
  Object.assign(parts, { head, tail, earL, earR });
  return g;
}

function buildHorse() {
  const [g, b, parts] = shell();
  const coat = 0x96613a, dark = 0x4a3320;
  const torso = ball(0.62, coat, 0.85);
  torso.scale.x = 1.6;
  torso.position.set(0, 1.32, 0);
  b.add(torso);
  const neck = cyl(0.16, 0.26, 0.85, coat, 6);
  neck.position.set(0.78, 1.85, 0);
  neck.rotation.z = -0.55; // leaning toward +x
  b.add(neck);
  for (let i = 0; i < 3; i++) { // dark mane plates along the neck
    const m = box(0.09, 0.3, 0.06, dark);
    m.position.set(0.62 + i * 0.14, 1.9 + i * 0.2, 0);
    m.rotation.z = -0.55;
    b.add(m);
  }
  const head = new THREE.Group();
  head.position.set(1.12, 2.28, 0);
  const skull = ball(0.2, coat);
  skull.scale.set(1.6, 0.95, 0.95);
  head.add(skull);
  const muzzle = ball(0.12, 0x6e4526, 0.85, 6);
  muzzle.position.set(0.3, -0.05, 0);
  head.add(muzzle);
  const earL = cone(0.06, 0.15, coat, 4);
  earL.position.set(-0.08, 0.2, -0.09);
  const earR = cone(0.06, 0.15, coat, 4);
  earR.position.set(-0.08, 0.2, 0.09);
  head.add(earL, earR);
  b.add(head);
  const tail = new THREE.Group();
  tail.position.set(-0.95, 1.5, 0);
  const hair = ball(0.13, dark, 2.5, 6); // long falling tail
  hair.position.set(-0.1, -0.28, 0);
  hair.rotation.z = 0.25;
  tail.add(hair);
  b.add(tail);
  legs(b, [[0.5, -0.26], [0.5, 0.26], [-0.5, -0.26], [-0.5, 0.26]], 0.09, 0.92, coat);
  Object.assign(parts, { head, tail, earL, earR });
  return g;
}

const BUILDERS = {
  bunny: buildBunny,
  chicken: () => buildChickenLike(false),
  rooster: () => buildChickenLike(true),
  duck: buildDuck,
  cat: buildCat,
  dog: buildDog,
  sheep: buildSheep,
  goat: buildGoat,
  pig: buildPig,
  cow: buildCow,
  horse: buildHorse,
};

export function buildAnimal(type) {
  // prefer the authored, procedurally-walked model; fall back to the primitive
  // critter if the glTF hasn't finished loading yet
  if (animalModelReady(type)) {
    const m = buildAnimalModel(type);
    if (m) return m;
  }
  return (BUILDERS[type] || buildChickenLike.bind(null, false))();
}

// ============================================================
// behavior — updateAnimal(rec, now)
// rec = { group, type, home:{x,z}, bounds:null|{minX,maxX,minZ,maxZ}, state:{}, rng }
// `now` in milliseconds (e.g. performance.now())
// ============================================================

const WANDER_RADIUS = 6;
const SPEED = {
  bunny: 2.4, chicken: 1.5, duck: 1.3, cat: 2.0, dog: 2.4, rooster: 1.6,
  sheep: 1.1, goat: 1.5, pig: 1.2, cow: 0.85, horse: 1.1,
};
const GRAZERS = { chicken: 1, duck: 1, sheep: 1, cow: 1, horse: 1, goat: 1, pig: 1, rooster: 1 };
const TWITCHERS = { bunny: 1, cat: 1 };
const STRUTTERS = { chicken: 1, rooster: 1, duck: 1 };

const QUIRK_MS = 700;

// module-level scratch (never allocate per frame)
const _d = { x: 0, z: 0 };

// ---- authored-model (glTF) procedural walk: swing each leg from its hip ----
const _swingAxis = new THREE.Vector3(0, 0, 1); // local axis the legs pivot about
const _q = new THREE.Quaternion();
const LEG_AMP = { // radians of fore-aft swing per species
  bunny: 0.5, chicken: 0.55, duck: 0.5, cat: 0.5, dog: 0.6, rooster: 0.55,
  sheep: 0.45, goat: 0.5, pig: 0.45, cow: 0.4, horse: 0.55,
};
function glbLegsSwing(parts, type, gait) {
  const amp = LEG_AMP[type] || 0.5;
  for (const leg of parts.legs) {
    _q.setFromAxisAngle(_swingAxis, Math.sin(gait + leg.phase) * amp);
    leg.node.quaternion.copy(leg.rest).multiply(_q);
  }
}
function glbLegsRest(parts, ease) {
  for (const leg of parts.legs) leg.node.quaternion.slerp(leg.rest, ease);
}

function pickIdle(s, now, rng) {
  s.mode = 'idle';
  s.until = now + 2000 + rng() * 4000;
  s.nextQuirk = now + 1200 + rng() * 3000;
  s.quirkEnd = 0;
}

function pickTarget(rec, s) {
  const a = rec.rng() * Math.PI * 2;
  const r = 1.5 + rec.rng() * (WANDER_RADIUS - 1.5);
  let tx = rec.home.x + Math.cos(a) * r;
  let tz = rec.home.z + Math.sin(a) * r;
  if (rec.bounds) {
    const m = ANIMAL_RADIUS[rec.type] || 1;
    tx = Math.min(rec.bounds.maxX - m, Math.max(rec.bounds.minX + m, tx));
    tz = Math.min(rec.bounds.maxZ - m, Math.max(rec.bounds.minZ + m, tz));
  }
  s.tx = tx;
  s.tz = tz;
  s.mode = 'wander';
}

export function updateAnimal(rec, now) {
  const s = rec.state;
  const g = rec.group;
  const body = g.userData.body;
  const parts = g.userData.parts || {};
  const isGLB = g.userData.glb;

  if (!s.init) {
    s.init = true;
    s.last = now;
    s.phase = rec.rng() * 10;
    s.gait = 0;
    s.hop = rec.rng() * Math.PI;
    s.earLBase = parts.earL ? parts.earL.rotation.z : 0;
    s.earRBase = parts.earR ? parts.earR.rotation.z : 0;
    pickIdle(s, now, rec.rng);
    s.until = now + rec.rng() * 4000; // desync the herd on spawn
  }
  let dt = (now - s.last) / 1000;
  s.last = now;
  if (dt < 0) dt = 0;
  if (dt > 0.1) dt = 0.1; // tab-away safety
  const ease = Math.min(1, dt * 8);

  // being petted/played with — a burst of tail-wag + a happy hop, pausing wander
  if (s.react && now < s.react.until) {
    const env = Math.sin(((s.react.until - now) / 1500) * Math.PI); // ease 0→1→0
    body.position.y = Math.abs(Math.sin(now / 110)) * 0.2 * env;
    if (parts.tail) {
      if (isGLB) parts.tail.rotation.y = Math.sin(now / 55) * 0.6 * env;
      else parts.tail.rotation.x = Math.sin(now / 55) * 0.7 * env;
    }
    if (parts.head) parts.head.rotation[isGLB ? 'x' : 'z'] = (isGLB ? -0.18 : 0.18) * env;
    return;
  }
  if (s.react && now >= s.react.until) s.react = null;

  if (s.mode === 'idle') {
    // subtle breathe bob
    body.position.y = Math.sin(now * 0.0025 + s.phase) * 0.025;
    body.rotation.x += (0 - body.rotation.x) * ease;

    // schedule the occasional quirk (peck / graze / ear twitch / tail wag)
    if (now >= s.nextQuirk && now >= s.quirkEnd) {
      s.quirkEnd = now + QUIRK_MS;
      s.nextQuirk = now + 2500 + rec.rng() * 4500;
    }
    if (isGLB) glbLegsRest(parts, ease); // settle the legs while standing
    if (now < s.quirkEnd) {
      const u = 1 - (s.quirkEnd - now) / QUIRK_MS; // 0..1 through the quirk
      const env = Math.sin(u * Math.PI); // smooth in-out envelope
      if (isGLB) {
        // graze / peck: dip the head+neck forward-down (pitch about local x)
        const dip = -(rec.type === 'chicken' || rec.type === 'rooster' || rec.type === 'duck' ? 0.7 : 0.5) * env;
        if (parts.head) parts.head.rotation.x = dip;
        if (parts.neck) parts.neck.rotation.x = dip * 0.5;
        if (parts.tail) parts.tail.rotation.y = Math.sin(now * 0.02) * 0.35 * env; // idle tail flick
      } else {
        if (GRAZERS[rec.type] && parts.head) {
          // graze / peck: pitch the nose down (model faces +x, so -z rotation dips it)
          parts.head.rotation.z = -(rec.type === 'chicken' || rec.type === 'rooster' ? 0.9 : 0.55) * env;
        }
        if (TWITCHERS[rec.type]) {
          if (parts.earL) parts.earL.rotation.z = s.earLBase + Math.sin(now * 0.06) * 0.3 * env;
          if (parts.earR) parts.earR.rotation.z = s.earRBase - Math.sin(now * 0.06 + 1) * 0.3 * env;
        }
        if (rec.type === 'dog' && parts.tail) {
          parts.tail.rotation.x = Math.sin(now * 0.025) * 0.6 * env;
        }
      }
    } else if (isGLB) {
      if (parts.head) parts.head.rotation.x += (0 - parts.head.rotation.x) * ease;
      if (parts.neck) parts.neck.rotation.x += (0 - parts.neck.rotation.x) * ease;
      if (parts.tail) parts.tail.rotation.y += (0 - parts.tail.rotation.y) * ease;
    } else {
      if (parts.head) parts.head.rotation.z += (0 - parts.head.rotation.z) * ease;
      if (parts.earL) parts.earL.rotation.z += (s.earLBase - parts.earL.rotation.z) * ease;
      if (parts.earR) parts.earR.rotation.z += (s.earRBase - parts.earR.rotation.z) * ease;
      if (parts.tail && rec.type === 'dog') parts.tail.rotation.x += (0 - parts.tail.rotation.x) * ease;
    }
    if (now >= s.until) pickTarget(rec, s);
    return;
  }

  // --- wander ---
  _d.x = s.tx - g.position.x;
  _d.z = s.tz - g.position.z;
  const dist = Math.sqrt(_d.x * _d.x + _d.z * _d.z);
  if (dist < 0.2) {
    body.position.y = 0;
    pickIdle(s, now, rec.rng);
    return;
  }
  const speed = SPEED[rec.type] || 1.2;
  const step = Math.min(dist, speed * dt);
  g.position.x += (_d.x / dist) * step;
  g.position.z += (_d.z / dist) * step;
  // a closed pen truly CONTAINS its residents — hard-clamp the position, not just
  // the target, so a penned animal can never drift out through the fence
  if (rec.bounds) {
    const m = ANIMAL_RADIUS[rec.type] || 1;
    g.position.x = Math.min(rec.bounds.maxX - m, Math.max(rec.bounds.minX + m, g.position.x));
    g.position.z = Math.min(rec.bounds.maxZ - m, Math.max(rec.bounds.minZ + m, g.position.z));
  }

  // Face travel direction. A yaw of θ about +y maps the model's +x nose to
  // (cosθ, 0, −sinθ) in world XZ, so to point the nose along (dx, dz) we need
  // cosθ = dx, −sinθ = dz  →  θ = atan2(−dz, dx).
  const want = Math.atan2(-_d.z, _d.x);
  let da = want - g.rotation.y;
  da = Math.atan2(Math.sin(da), Math.cos(da)); // shortest arc
  g.rotation.y += da * ease;

  // gait
  if (isGLB) {
    // authored model: swing the legs from the hips + a light body bob & tail sway
    const rate = rec.type === 'bunny' ? 9 : (4.5 + speed * 3);
    s.gait += dt * rate;
    glbLegsSwing(parts, rec.type, s.gait);
    if (rec.type === 'bunny') {
      s.hop += dt * 9;
      body.position.y = Math.abs(Math.sin(s.hop)) * 0.24; // hops still arc
    } else {
      body.position.y = Math.abs(Math.sin(s.gait)) * 0.05;
    }
    if (parts.head) parts.head.rotation.x = Math.sin(s.gait) * 0.06; // gentle head bob
    if (parts.tail) parts.tail.rotation.y = Math.sin(s.gait * 0.6) * 0.18; // tail sway
  } else if (rec.type === 'bunny') {
    s.hop += dt * 9; // hop in arcs
    body.position.y = Math.abs(Math.sin(s.hop)) * 0.28;
  } else if (STRUTTERS[rec.type]) {
    s.gait += dt * 11;
    body.position.y = Math.abs(Math.sin(s.gait)) * 0.055; // strut bob
    if (parts.head) parts.head.rotation.z = Math.sin(s.gait) * 0.14; // head bob
    if (rec.type === 'duck') body.rotation.x = Math.sin(s.gait * 0.5) * 0.12; // waddle roll
  } else {
    s.gait += dt * (4 + speed * 2.5); // amble, slower for cow/horse
    body.position.y = Math.abs(Math.sin(s.gait)) * 0.04;
    if (rec.type === 'dog' && parts.tail) parts.tail.rotation.x = Math.sin(s.gait * 1.5) * 0.3;
  }
}

// suggested [minMs, maxMs] between idle sounds
export function soundIntervalMs(type) {
  switch (type) {
    case 'bunny': return [25000, 70000];
    case 'chicken': return [8000, 25000];
    case 'duck': return [9000, 26000];
    case 'cat': return [15000, 40000];
    case 'dog': return [10000, 30000];
    case 'rooster': return [20000, 60000];
    case 'sheep': return [12000, 35000];
    case 'goat': return [12000, 35000];
    case 'pig': return [10000, 28000];
    case 'cow': return [15000, 45000];
    case 'horse': return [18000, 50000];
    default: return [15000, 45000];
  }
}
