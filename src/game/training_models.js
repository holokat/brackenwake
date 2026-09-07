import * as THREE from 'three';

// Starting Island training yard bodies. The combat system treats the
// trainingDummy and archeryTarget rows as monsters so swings and arrows land on them.

const TAU = Math.PI * 2;
const Y_AXIS = new THREE.Vector3(0, 1, 0);

const MATS = new Map();
function mat(hex, extra = {}) {
  const key = `${hex}:${extra.metalness ?? 0}:${extra.roughness ?? 0.92}`;
  if (!MATS.has(key)) {
    MATS.set(key, new THREE.MeshStandardMaterial({
      color: hex,
      roughness: extra.roughness ?? 0.92,
      metalness: extra.metalness ?? 0,
      flatShading: true,
    }));
  }
  return MATS.get(key);
}

function mulberry32(seed = 1) {
  let a = (Number.isFinite(seed) ? seed : 1) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function variantOf(value, count) {
  const n = Number.isFinite(value) ? Math.trunc(value) : 0;
  return ((n % count) + count) % count;
}

function mark(o, name = '') {
  if (name) o.name = name;
  o.castShadow = true;
  o.receiveShadow = true;
  return o;
}

function put(w, h, d, m, x = 0, y = 0, z = 0, name = '') {
  const o = mark(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m), name);
  o.position.set(x, y, z);
  return o;
}

function cyl(rt, rb, h, m, seg = 8, x = 0, y = 0, z = 0, name = '') {
  const o = mark(new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m), name);
  o.position.set(x, y, z);
  return o;
}

function cone(r, h, m, seg = 5, x = 0, y = 0, z = 0, name = '') {
  const o = mark(new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), m), name);
  o.position.set(x, y, z);
  return o;
}

function sphere(r, m, seg = 10, rings = 6, x = 0, y = 0, z = 0, name = '') {
  const o = mark(new THREE.Mesh(new THREE.SphereGeometry(r, seg, rings), m), name);
  o.position.set(x, y, z);
  return o;
}

function torus(r, tube, m, radial = 4, tubular = 14, x = 0, y = 0, z = 0, name = '') {
  const o = mark(new THREE.Mesh(new THREE.TorusGeometry(r, tube, radial, tubular), m), name);
  o.position.set(x, y, z);
  return o;
}

function lathe(points, m, seg = 12, x = 0, y = 0, z = 0, name = '') {
  const geo = new THREE.LatheGeometry(points.map((p) => new THREE.Vector2(p[0], p[1])), seg);
  const o = mark(new THREE.Mesh(geo, m), name);
  o.position.set(x, y, z);
  return o;
}

function beamBetween(a, b, radius, m, name = '', seg = 6) {
  const from = new THREE.Vector3(a[0], a[1], a[2]);
  const to = new THREE.Vector3(b[0], b[1], b[2]);
  const mid = from.clone().add(to).multiplyScalar(0.5);
  const dir = to.clone().sub(from);
  const o = cyl(radius, radius, dir.length(), m, seg, mid.x, mid.y, mid.z, name);
  o.quaternion.setFromUnitVectors(Y_AXIS, dir.normalize());
  return o;
}

function faceDisc(r, depth, m, seg, x, y, z, name) {
  const o = cyl(r, r, depth, m, seg, x, y, z, name);
  o.rotation.x = Math.PI / 2;
  return o;
}

const COLOURS = {
  oak: 0x4b2d18,
  oakLight: 0x6b4424,
  rope: 0x2f2117,
  sack: 0xb89a63,
  sackDark: 0x7f6440,
  sackLight: 0xd3b779,
  straw: 0xd2b35d,
  strawDark: 0xaf8d3d,
  leather: 0x4c2a18,
  rust: 0x6e4a32,
  iron: 0x777064,
  white: 0xe8e3d6,
  black: 0x1e2023,
  blue: 0x315e9f,
  red: 0xa7332e,
  gold: 0xd1a52d,
};

export function buildTrainingDummy(opts = {}) {
  const group = new THREE.Group();
  group.name = 'trainingDummy';
  const rng = mulberry32(opts.seed ?? 3107);
  const variant = variantOf(opts.variant, 3);

  const oak = mat(COLOURS.oak);
  const oakLight = mat(COLOURS.oakLight);
  const rope = mat(COLOURS.rope);
  const sack = mat(COLOURS.sack);
  const sackDark = mat(COLOURS.sackDark);
  const sackLight = mat(COLOURS.sackLight);
  const straw = mat(COLOURS.straw);
  const leather = mat(COLOURS.leather);
  const rust = mat(COLOURS.rust, { roughness: 0.98, metalness: 0.05 });
  const iron = mat(COLOURS.iron, { roughness: 0.86, metalness: 0.18 });

  group.add(put(1.15, 0.14, 0.18, oak, 0, 0.07, 0, 'trainingDummy:base-x'));
  group.add(put(0.18, 0.14, 1.05, oak, 0, 0.07, 0, 'trainingDummy:base-z'));
  for (const rot of [Math.PI / 4, -Math.PI / 4]) {
    const brace = put(0.9, 0.11, 0.12, oakLight, 0, 0.19, 0, 'trainingDummy:base-brace');
    brace.rotation.y = rot;
    group.add(brace);
  }

  group.add(cyl(0.12, 0.14, 1.42, oak, 8, 0, 0.73, -0.03, 'trainingDummy:post'));
  const cross = cyl(0.055, 0.065, 1.34, oakLight, 8, 0, 1.22, -0.03, 'trainingDummy:crossbar');
  cross.rotation.z = Math.PI / 2;
  group.add(cross);

  const torso = lathe([
    [0.10, -0.43],
    [0.28, -0.36],
    [0.34, -0.08],
    [0.32, 0.24],
    [0.12, 0.43],
  ], sack, 12, 0, 0.92, 0.02, 'trainingDummy:torso');
  torso.scale.z = 0.72;
  group.add(torso);

  for (const y of [0.73, 1.12]) {
    const band = torus(0.245, 0.014, rope, 4, 14, 0, y, 0.02, 'trainingDummy:rope-band');
    band.rotation.x = Math.PI / 2;
    band.scale.z = 0.72;
    group.add(band);
  }

  const head = sphere(0.205, sackLight, 12, 7, 0, 1.53, 0.02, 'trainingDummy:head');
  head.scale.set(0.96, 1.04, 0.9);
  group.add(head);

  if (variant === 1) {
    const cap = cyl(0.19, 0.205, 0.075, leather, 12, 0, 1.69, 0.025, 'trainingDummy:leather-cap');
    cap.scale.z = 0.86;
    group.add(cap);
    group.add(put(0.28, 0.026, 0.12, leather, 0, 1.665, 0.16, 'trainingDummy:cap-brim'));
  } else if (variant === 2) {
    const helm = cyl(0.155, 0.205, 0.12, rust, 12, 0, 1.685, 0.02, 'trainingDummy:kettle-helm');
    helm.scale.z = 0.9;
    group.add(helm);
    const brim = torus(0.205, 0.015, iron, 4, 14, 0, 1.63, 0.02, 'trainingDummy:helm-brim');
    brim.rotation.x = Math.PI / 2;
    brim.scale.z = 0.9;
    group.add(brim);
  }

  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + 0.25;
    const tuft = cone(0.022, 0.16, straw, 5, Math.cos(a) * 0.075, 1.34, 0.02 + Math.sin(a) * 0.05, 'trainingDummy:neck-straw');
    tuft.quaternion.setFromUnitVectors(Y_AXIS, new THREE.Vector3(Math.cos(a) * 0.45, 0.9, Math.sin(a) * 0.45).normalize());
    group.add(tuft);
  }
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const y = 1.205 + (i - 1) * 0.035;
      const z = -0.02 + (i - 1) * 0.025;
      const tuft = cone(0.017, 0.18, straw, 5, side * 0.7, y, z, 'trainingDummy:wrist-straw');
      tuft.quaternion.setFromUnitVectors(Y_AXIS, new THREE.Vector3(side, 0.12 * (i - 1), 0.15).normalize());
      group.add(tuft);
    }
  }

  for (let i = 0; i < 5; i++) {
    const w = 0.08 + rng() * 0.065;
    const h = 0.018 + rng() * 0.018;
    const x = (rng() - 0.5) * 0.35;
    const y = 0.8 + rng() * 0.35;
    const patch = put(w, h, 0.014, sackDark, x, y, 0.265, 'trainingDummy:hit-patch');
    patch.rotation.z = (rng() - 0.5) * 0.5;
    group.add(patch);
  }

  if (variant !== 0) {
    const buckler = faceDisc(0.175, 0.045, oakLight, 14, -0.53, 1.08, 0.13, 'trainingDummy:buckler');
    group.add(buckler);
    const rim = torus(0.176, 0.012, rope, 4, 14, -0.53, 1.08, 0.155, 'trainingDummy:buckler-rim');
    group.add(rim);
    group.add(sphere(0.045, oak, 8, 4, -0.53, 1.08, 0.185, 'trainingDummy:buckler-boss'));
  }

  group.userData = { kind: 'trainingDummy', height: 1.75, radius: 0.72, hitY: 1.06 };
  return group;
}

function addTargetArrow(parent, x, up, roll, mats) {
  const arrow = new THREE.Group();
  arrow.name = 'archeryTarget:arrow';
  arrow.position.set(x, 0, -up);
  arrow.rotation.y = roll;

  arrow.add(cyl(0.006, 0.006, 0.48, mats.shaft, 5, 0, 0.29, 0, 'archeryTarget:arrow-shaft'));
  const head = cone(0.018, 0.05, mats.head, 5, 0, 0.03, 0, 'archeryTarget:arrow-head');
  head.rotation.z = Math.PI;
  arrow.add(head);
  for (const side of [-1, 1]) {
    const fletch = put(0.045, 0.006, 0.02, mats.fletch, side * 0.02, 0.51, 0, 'archeryTarget:fletching');
    fletch.rotation.y = side * 0.35;
    arrow.add(fletch);
  }
  const top = put(0.006, 0.006, 0.05, mats.fletch, 0, 0.51, 0.025, 'archeryTarget:fletching-top');
  top.rotation.x = 0.35;
  arrow.add(top);
  parent.add(arrow);
}

export function buildArcheryTarget(opts = {}) {
  const group = new THREE.Group();
  group.name = 'archeryTarget';
  const rng = mulberry32(opts.seed ?? 9113);
  const variant = variantOf(opts.variant, 2);

  const straw = mat(COLOURS.straw);
  const strawDark = mat(COLOURS.strawDark);
  const oak = mat(COLOURS.oak);
  const oakLight = mat(COLOURS.oakLight);

  group.add(beamBetween([-0.28, 0.98, -0.08], [-0.58, 0.035, 0.42], 0.035, oak, 'archeryTarget:front-leg-l'));
  group.add(beamBetween([0.28, 0.98, -0.08], [0.58, 0.035, 0.42], 0.035, oak, 'archeryTarget:front-leg-r'));
  group.add(beamBetween([0, 1.0, -0.12], [0, 0.035, -0.65], 0.033, oak, 'archeryTarget:back-leg'));
  group.add(beamBetween([-0.48, 0.58, 0.16], [0.48, 0.58, 0.16], 0.028, oakLight, 'archeryTarget:crossbar'));

  const boss = new THREE.Group();
  boss.name = 'archeryTarget:boss-frame';
  boss.position.set(0, 1.15, 0);
  boss.rotation.x = Math.PI / 2 - (10 * Math.PI / 180);
  group.add(boss);

  boss.add(cyl(0.46, 0.46, 0.14, straw, 24, 0, 0, 0, 'archeryTarget:boss'));
  for (const y of [-0.05, 0, 0.05]) {
    const rim = torus(0.462, 0.011, strawDark, 4, 16, 0, y, 0, 'archeryTarget:straw-rim');
    rim.rotation.x = Math.PI / 2;
    boss.add(rim);
  }

  const rings = [
    ['white', 0.415, COLOURS.white],
    ['black', 0.335, COLOURS.black],
    ['blue', 0.255, COLOURS.blue],
    ['red', 0.175, COLOURS.red],
    ['gold', 0.095, COLOURS.gold],
  ];
  rings.forEach(([name, radius, colour], i) => {
    boss.add(cyl(radius, radius, 0.003, mat(colour), 24, 0, 0.073 + i * 0.001, 0, `archeryTarget:ring:${name}`));
  });

  if (variant === 1) {
    const mats = {
      shaft: mat(0x5f3b20),
      head: mat(0x5c5e61, { roughness: 0.82, metalness: 0.15 }),
      fletch: mat(0xe6dcc3),
    };
    addTargetArrow(boss, -0.12 + (rng() - 0.5) * 0.045, 0.1 + (rng() - 0.5) * 0.05, (rng() - 0.5) * 0.3, mats);
    addTargetArrow(boss, 0.14 + (rng() - 0.5) * 0.05, -0.12 + (rng() - 0.5) * 0.045, (rng() - 0.5) * 0.3, mats);
  }

  group.userData = { kind: 'archeryTarget', height: 1.6, radius: 0.7, hitY: 1.15 };
  return group;
}
