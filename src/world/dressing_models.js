// The bodies of the things lying on the ground, and the layer that streams them.
//
// `dressing.js` says what stands where. This says what it looks like and puts
// it in the scene. Every prop is built once, from primitives, into ONE merged
// geometry with its colours baked into a vertex colour attribute, so the whole
// world's dressing runs on four materials: stone, ice, brass, and a glowing one
// for the Ashen Throne's vents. A kind is one InstancedMesh, so a chunk full of
// rib cages costs one draw call and not one per rib.
//
// The layer is flora's, on purpose: records arrive by chunk through `onChunk`,
// leave through `offChunk`, and a kind's mesh is rebuilt at most once every
// REBUILD_MS when its records have changed. Nothing is built per chunk, so
// walking east rebuilds only the kinds whose records moved.
//
// Every mesh carries `userData.dressing = { kind, realm }`, so a later pass can
// name a rib cage on hover without asking this file anything.
//
// SIZE. A body is authored in whatever proportions look right and then scaled
// so its largest dimension is exactly the `size` its kit row asks for. One
// number in dressing.js controls how big a thing is in the world, and the two
// files cannot drift.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32 } from './noise.js';
import { dressingFor, kitFor, KITS, ALL_KINDS } from './dressing.js';

/** How long a kind's mesh may go stale before it is rebuilt, in ms. */
export const REBUILD_MS = 180;
/** Bodies grown per anchor kind, so no two rib cages in sight are the same. */
export const ANCHOR_VARIANTS = 2;
/** A scatter prop is small enough that one body and a random turn is variety. */
export const SCATTER_VARIANTS = 1;

// ------------------------------------------------------------- materials --

const stdMat = (o) => new THREE.MeshStandardMaterial({
  vertexColors: true, flatShading: true, roughness: 0.92, metalness: 0, ...o,
});

let MATS = null;
/** The four materials the whole world's dressing is drawn with. */
export function materials() {
  if (MATS) return MATS;
  MATS = {
    stone: stdMat({}),
    ice: stdMat({ roughness: 0.16, metalness: 0.02, transparent: true, opacity: 0.84 }),
    brass: stdMat({ roughness: 0.34, metalness: 0.72 }),
    glow: stdMat({ roughness: 0.6, emissive: new THREE.Color(0xff5a1e), emissiveIntensity: 1.5 }),
  };
  return MATS;
}

/** Which of the four a kind is drawn with. Anything not named here is stone. */
export const MATERIAL_OF = {
  ice_shard: 'ice', ice_splinter: 'ice', frozen_fall: 'ice', iced_standing_stone: 'ice',
  brass_pipe: 'brass', brass_wreck: 'brass',
  lava_vent: 'glow',
};

// ------------------------------------------------------------- the palettes --
//
// Nine colour rows, one a realm, in the semantic slots the bodies ask for. A
// cart in the Greenwold and a cart in the Ember Wastes are the same body and
// two different objects, because the wood of one is oak and of the other is
// sun bleached to grey.

const PAL = {
  greenwold: { stone: 0x8d887e, dark: 0x6a655e, wood: 0x7a5636, wooddark: 0x4e3722, cloth: 0xd9cdb2, metal: 0x6f6a63, bone: 0xd8d2c0, green: 0x466f31, accent: 0x8fae4a },
  verdant: { stone: 0x5f6a5a, dark: 0x3d463a, wood: 0x6b5334, wooddark: 0x413021, cloth: 0xd8c88f, metal: 0x7c7a5f, bone: 0xcfc9ae, green: 0x3f7a3a, accent: 0xe08fae },
  saltmarch: { stone: 0x8a8677, dark: 0x605d53, wood: 0x6d5a42, wooddark: 0x453728, cloth: 0xcfc4a6, metal: 0x5e5a52, bone: 0xcdc6b0, green: 0x7d8a4a, accent: 0xe8e2d2 },
  emberwastes: { stone: 0xb0724a, dark: 0x7c4c30, wood: 0x8a6a45, wooddark: 0x54402a, cloth: 0xe0c79a, metal: 0x7a6a55, bone: 0xe4dcc4, green: 0x8a8a55, accent: 0xf0d9a8 },
  stormpeaks: { stone: 0x6e7377, dark: 0x484d51, wood: 0x5e4a35, wooddark: 0x3a2e21, cloth: 0xb9c2c8, metal: 0x707a80, bone: 0xcbc8bd, green: 0x556b3f, accent: 0x8f5f4a },
  boneyard: { stone: 0x7a7570, dark: 0x4e4a46, wood: 0x5b5148, wooddark: 0x38312c, cloth: 0x9c968c, metal: 0x605c55, bone: 0xe6e1d2, green: 0x6e6a5c, accent: 0xb9b2a0 },
  frostreach: { stone: 0x8b929a, dark: 0x5c636b, wood: 0x584634, wooddark: 0x372c20, cloth: 0xdfe8ef, metal: 0x6e7880, bone: 0xe8ecef, green: 0x2f4a38, accent: 0xa8d8ea },
  sunkenkingdom: { stone: 0xd8d4c8, dark: 0xa39e90, wood: 0x6a5a44, wooddark: 0x40352a, cloth: 0xcfe0d6, metal: 0x7e8a7c, bone: 0xe8e4d6, green: 0x3f7f70, accent: 0xe08a6a },
  ashenthrone: { stone: 0x33302f, dark: 0x1a1718, wood: 0x453a33, wooddark: 0x271f1c, cloth: 0x8a2b22, metal: 0xb08a3c, green: 0x4a4238, bone: 0x8f8a80, accent: 0xff5a1e },
};

/** The handful of kinds whose colour is their own and not their realm's. */
const OVERRIDE = {
  hedgerow: { stone: 0x3f6b32, dark: 0x2b4a24 },
  reed_bed: { green: 0x9aa055, wood: 0x8a8552 },
  ash_drift: { stone: 0xb9b2a0, dark: 0x8e887a },
  snow_drift: { stone: 0xeaf1f6, dark: 0xc4d2dc },
  salt_pan: { stone: 0xeae4d4, dark: 0xc9c2ae },
  sea_glass: { stone: 0x8fd0c8, dark: 0x5f9a95 },
  coral_head: { stone: 0xe08a6a, dark: 0xb4614a, accent: 0xf0b49a },
  lava_vent: { stone: 0x3a2a22, dark: 0x1d1512, accent: 0xff7a2a },
  bleached_bones: { stone: 0xe4dcc4, dark: 0xbdb49a },
  charred_bones: { stone: 0x7a736a, dark: 0x4a443d },
  frozen_pine: { green: 0x2b4536, wood: 0x4a3b2c, stone: 0xdfe8ef },
  giant_mushroom: { stone: 0xd8a05a, dark: 0xa87038, accent: 0xf0e0c0 },
  mushroom_ring: { stone: 0xc88a4a, dark: 0x96602c, accent: 0xe8dcc0 },
  legion_banner: { cloth: 0x9a2b22 },
};

export function paletteFor(realm, kind) {
  const base = PAL[realm] || PAL.greenwold;
  const over = OVERRIDE[kind];
  return over ? { ...base, ...over } : base;
}

// ------------------------------------------------------------ primitives --

const _c = new THREE.Color();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();

/**
 * One part: a primitive, a colour, and where it goes. The colour is baked into
 * a vertex attribute here, which is what lets a rib cage of bone and shadow be
 * one draw call.
 */
function P(geo, hex, pos = [0, 0, 0], rot = [0, 0, 0], scl = null) {
  let g = geo;
  if (g.index) { const n = g.toNonIndexed(); g.dispose(); g = n; }
  for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
  if (!g.attributes.normal) g.computeVertexNormals();
  _e.set(rot[0], rot[1], rot[2]);
  _s.set(scl ? scl[0] : 1, scl ? scl[1] : 1, scl ? scl[2] : 1);
  _m.compose(_v.set(pos[0], pos[1], pos[2]), _q.setFromEuler(_e), _s);
  g.applyMatrix4(_m);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  _c.set(hex);
  for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt, rb, h, s = 7) => new THREE.CylinderGeometry(rt, rb, h, s);
const cone = (r, h, s = 7) => new THREE.ConeGeometry(r, h, s);
const sph = (r, w = 7, h = 5) => new THREE.SphereGeometry(r, w, h);

/** A lumpy stone: an icosahedron with its vertices pushed about by the seed. */
function rock(r, rng, squash = 0.72, lump = 0.28, detail = 1) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const k = 1 + (rng() - 0.5) * 2 * lump;
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * squash, p.getZ(i) * k);
  }
  p.needsUpdate = true;
  return g;
}

/**
 * A rib, a root, an arch: short cylinders laid along a circular arc in the xy
 * plane, thinning toward the far end. Angles are radians from straight up.
 */
function arc(out, hex, R, a0, a1, thick, seg, taper = 0.45, off = [0, 0, 0], flip = 1) {
  for (let i = 0; i < seg; i++) {
    const t0 = a0 + (a1 - a0) * (i / seg), t1 = a0 + (a1 - a0) * ((i + 1) / seg);
    const x0 = Math.sin(t0) * R * flip, y0 = Math.cos(t0) * R;
    const x1 = Math.sin(t1) * R * flip, y1 = Math.cos(t1) * R;
    const len = Math.hypot(x1 - x0, y1 - y0) * 1.12;
    const f = 1 - (i / seg) * taper;
    out.push(P(cyl(thick * f * 0.86, thick * f, len, 6), hex,
      [off[0] + (x0 + x1) / 2, off[1] + (y0 + y1) / 2, off[2]],
      [0, 0, Math.atan2(x0 - x1, y1 - y0)]));
  }
}

const jit = (rng, a) => (rng() - 0.5) * 2 * a;

// ------------------------------------------------------------- the bodies --
//
// Each takes a seeded rng and the realm's colours and returns a list of parts.
// Proportions are natural, not final: `bodyFor` scales the merged result so the
// largest dimension is exactly the kit's `size`.

export const BODIES = {
  // -- ground and stone ------------------------------------------------------
  boulder: (r, c) => [P(rock(1, r, 0.74, 0.3), c.stone, [0, 0.72, 0], [jit(r, 0.4), r() * 6.28, jit(r, 0.3)]),
    P(rock(0.36, r, 0.8, 0.34), c.dark, [0.9, 0.26, jit(r, 0.5)])],
  mound: (r, c) => [P(rock(1, r, 0.44, 0.24, 1), c.stone, [0, 0.36, 0], [0, r() * 6.28, 0], [1.6, 1, 1.25]),
    P(rock(0.42, r, 0.6, 0.3), c.dark, [1.0, 0.2, 0.5]),
    P(rock(0.3, r, 0.6, 0.3), c.dark, [-1.1, 0.16, -0.4])],
  drift: (r, c) => [P(rock(1, r, 0.26, 0.3), c.stone, [0, 0.2, 0], [0, r() * 6.28, 0], [1.8, 1, 1.2]),
    P(rock(0.55, r, 0.24, 0.3), c.dark, [0.8, 0.12, -0.5], [0, r() * 6.28, 0], [1.4, 1, 1])],
  flat: (r, c) => [P(cyl(1, 1.06, 0.16, 10), c.stone, [0, 0.08, 0]),
    P(cyl(0.62, 0.66, 0.05, 9), c.dark, [0.1, 0.18, -0.05]),
    P(rock(0.2, r, 0.5, 0.3), c.dark, [0.9, 0.08, 0.4])],
  slab: (r, c) => [P(box(1.15, 0.22, 2.0), c.stone, [0, 0.62, 0], [0, jit(r, 0.5), 0.34 + jit(r, 0.12)]),
    P(rock(0.42, r, 0.5, 0.3), c.dark, [0.55, 0.16, 0.5])],
  stele: (r, c) => [P(box(0.5, 2.2, 0.3), c.stone, [0, 1.14, 0], [jit(r, 0.05), jit(r, 0.4), jit(r, 0.06)]),
    P(box(0.62, 0.18, 0.42), c.dark, [0, 2.3, 0]),
    P(rock(0.42, r, 0.42, 0.3), c.dark, [0, 0.12, 0])],
  cairn: (r, c) => {
    const out = []; let y = 0;
    for (let i = 0; i < 7; i++) {
      const rr = 0.62 * (1 - i * 0.1);
      out.push(P(rock(rr, r, 0.62, 0.3, 0), i % 2 ? c.dark : c.stone, [jit(r, 0.12), y + rr * 0.5, jit(r, 0.12)], [0, r() * 6.28, 0]));
      y += rr * 0.86;
    }
    return out;
  },
  pillar: (r, c) => {
    const out = [P(cyl(0.62, 0.74, 0.36, 9), c.dark, [0, 0.18, 0]),
      P(cyl(0.48, 0.6, 4.2, 9), c.stone, [0, 2.46, 0])];
    // a column does not end tidily: the top is broken off at an angle
    out.push(P(cyl(0.44, 0.5, 0.5, 9), c.dark, [jit(r, 0.1), 4.72, jit(r, 0.1)], [jit(r, 0.3), 0, jit(r, 0.3)]));
    out.push(P(rock(0.36, r, 0.5, 0.32), c.dark, [0.95, 0.16, -0.5]));
    return out;
  },
  drums: (r, c) => [P(cyl(0.6, 0.62, 1.5, 9), c.stone, [0, 0.6, 0], [Math.PI / 2, jit(r, 0.5), 0]),
    P(cyl(0.64, 0.64, 0.1, 9), c.dark, [0, 0.6, 0.76], [Math.PI / 2, 0, 0])],
  obelisk: (r, c) => [P(cyl(0.3, 0.5, 4.4, 4), c.stone, [0, 2.2, 0], [0, Math.PI / 4, 0]),
    P(cone(0.44, 0.72, 4), c.dark, [0, 4.72, 0], [0, Math.PI / 4, 0]),
    P(box(1.3, 0.3, 1.3), c.dark, [0, 0.15, 0], [0, jit(r, 0.3), 0])],
  stack: (r, c) => [P(cyl(0.9, 1.4, 1.5, 9), c.dark, [0, 0.75, 0]),
    P(cyl(0.62, 0.88, 1.9, 9), c.stone, [jit(r, 0.15), 2.4, jit(r, 0.15)]),
    P(cyl(1.35, 0.66, 1.5, 9), c.dark, [jit(r, 0.2), 4.1, jit(r, 0.2)]),
    P(cyl(0.75, 1.3, 1.1, 9), c.stone, [jit(r, 0.2), 5.3, jit(r, 0.2)])],
  arch: (r, c) => {
    const out = [];
    for (const s of [-1, 1]) out.push(P(cyl(0.52, 0.72, 2.6, 8), c.stone, [s * 2.2, 1.3, 0]));
    arc(out, c.stone, 2.2, Math.PI / 2, 0, 0.5, 5, 0.1, [0, 2.6, 0], -1);
    arc(out, c.stone, 2.2, Math.PI / 2, 0, 0.5, 5, 0.1, [0, 2.6, 0], 1);
    out.push(P(rock(0.5, r, 0.5, 0.3), c.dark, [2.6, 0.2, 0.9]));
    return out;
  },
  shard: (r, c) => {
    const out = [P(cone(0.62, 3.4, 5), c.stone, [0, 1.6, 0], [jit(r, 0.22), r() * 6.28, jit(r, 0.22)])];
    out.push(P(cone(0.36, 1.8, 5), c.dark, [0.7, 0.8, jit(r, 0.4)], [jit(r, 0.4), r() * 6.28, jit(r, 0.4)]));
    out.push(P(cone(0.24, 1.0, 5), c.stone, [-0.6, 0.45, 0.4], [jit(r, 0.5), r() * 6.28, jit(r, 0.5)]));
    return out;
  },
  cone: (r, c) => [P(cone(1.5, 2.0, 10), c.stone, [0, 1.0, 0]),
    P(cone(0.7, 0.5, 10), c.dark, [0, 2.05, 0], [Math.PI, 0, 0]),
    P(rock(0.35, r, 0.5, 0.3), c.dark, [1.4, 0.14, 0.6])],
  icestone: (r, c) => [P(box(0.72, 3.0, 0.5), c.stone, [0, 1.5, 0], [jit(r, 0.06), jit(r, 0.4), jit(r, 0.06)]),
    P(cone(0.3, 1.6, 5), c.accent, [0.5, 0.8, 0.2], [0.3, 0, 0.22]),
    P(cone(0.24, 1.2, 5), c.accent, [-0.45, 0.6, -0.25], [-0.25, 0, -0.2])],
  fall: (r, c) => {
    const out = [];
    for (let i = 0; i < 4; i++) {
      out.push(P(cyl(0.28, 0.5, 4.4 - i * 0.4, 6), c.accent, [(i - 1.5) * 0.62, (4.4 - i * 0.4) / 2, jit(r, 0.2)], [0, 0, jit(r, 0.05)]));
    }
    out.push(P(rock(0.8, r, 0.4, 0.24), c.stone, [0, 0.28, 0.35], [0, 0, 0], [1.7, 1, 1]));
    return out;
  },
  vent: (r, c) => {
    const out = [];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * 6.283;
      out.push(P(rock(0.32, r, 0.7, 0.3), c.stone, [Math.cos(a) * 0.72, 0.24, Math.sin(a) * 0.72]));
    }
    out.push(P(cyl(0.5, 0.62, 0.36, 9), c.accent, [0, 0.2, 0]));
    return out;
  },

  // -- trees, roots, growth --------------------------------------------------
  deadtree: (r, c) => {
    const out = [P(cyl(0.13, 0.36, 3.4, 7), c.wood, [0, 1.7, 0], [jit(r, 0.05), 0, jit(r, 0.05)])];
    for (let i = 0; i < 5; i++) {
      const a = r() * 6.28, l = 1.0 + r() * 1.1, y = 1.7 + r() * 1.4;
      out.push(P(cyl(0.04, 0.11, l, 5), c.wooddark,
        [Math.cos(a) * l * 0.3, y, Math.sin(a) * l * 0.3], [0, -a, 0.8 + jit(r, 0.3)]));
    }
    return out;
  },
  pine: (r, c) => {
    const out = [P(cyl(0.12, 0.34, 4.6, 7), c.wood, [0, 2.3, 0])];
    for (let i = 0; i < 4; i++) {
      const y = 1.5 + i * 1.05, rr = 1.35 - i * 0.26;
      out.push(P(cone(rr, 1.5, 8), i % 2 ? c.green : c.dark, [0, y + 0.75, 0]));
      out.push(P(cone(rr * 0.7, 0.3, 8), c.stone, [0, y + 1.28, 0]));   // snow on the branch
    }
    return out;
  },
  log: (r, c) => {
    const out = [P(cyl(0.62, 0.92, 9.0, 9), c.wood, [0, 0.82, 0], [Math.PI / 2, jit(r, 0.4), 0])];
    out.push(P(rock(1.35, r, 0.32, 0.34), c.wooddark, [0, 1.0, -4.6], [Math.PI / 2, 0, 0]));
    out.push(P(cyl(0.16, 0.3, 2.2, 6), c.wooddark, [0.9, 1.5, 1.6], [0, 0.5, 1.0]));
    out.push(P(cyl(0.12, 0.24, 1.6, 6), c.wooddark, [-0.8, 1.4, -1.2], [0, -0.4, -1.1]));
    out.push(P(rock(0.5, r, 0.5, 0.3), c.green, [0.3, 1.5, 2.8], [0, 0, 0], [1.6, 0.5, 1.2]));
    return out;
  },
  roots: (r, c) => {
    const out = [];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * 6.283 + jit(r, 0.3);
      const parts = [];
      arc(parts, i % 2 ? c.wood : c.wooddark, 1.5 + r() * 0.5, Math.PI * 0.62, -Math.PI * 0.62, 0.24, 5, 0.3, [0, 0.1, 0], 1);
      for (const p of parts) { p.rotateY(a); out.push(p); }
    }
    out.push(P(cyl(0.45, 0.7, 1.2, 8), c.wood, [0, 0.6, 0]));
    return out;
  },
  buttress: (r, c) => {
    const out = [P(cyl(0.42, 0.62, 2.4, 8), c.wood, [0, 1.2, 0])];
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * 6.283 + jit(r, 0.4);
      out.push(P(cyl(0.06, 0.5, 2.2, 4), c.wooddark,
        [Math.cos(a) * 0.75, 0.6, Math.sin(a) * 0.75], [Math.sin(a) * 0.8, -a, -Math.cos(a) * 0.8], [1, 1, 0.4]));
    }
    return out;
  },
  vines: (r, c) => {
    const out = [P(cyl(0.14, 0.16, 2.6, 6), c.wood, [0, 3.0, 0], [0, 0, Math.PI / 2])];
    for (let i = 0; i < 9; i++) {
      const x = -1.2 + (i / 8) * 2.4, l = 1.4 + r() * 1.6;
      out.push(P(cyl(0.045, 0.06, l, 5), c.green, [x, 3.0 - l / 2, jit(r, 0.15)]));
      out.push(P(rock(0.18, r, 0.6, 0.4), c.green, [x, 3.0 - l, jit(r, 0.15)]));
    }
    return out;
  },
  mushroom: (r, c) => [P(cyl(0.26, 0.4, 2.0, 8), c.accent, [0, 1.0, 0], [jit(r, 0.08), 0, jit(r, 0.08)]),
    P(sph(1.15, 9, 5), c.stone, [0, 2.05, 0], [0, r() * 6.28, 0], [1, 0.5, 1]),
    P(cyl(1.0, 0.5, 0.16, 9), c.dark, [0, 1.92, 0]),
    P(cyl(0.14, 0.22, 0.9, 7), c.accent, [0.9, 0.45, 0.5]),
    P(sph(0.42, 7, 4), c.stone, [0.9, 0.92, 0.5], [0, 0, 0], [1, 0.55, 1])],
  hedge: (r, c) => {
    const out = [P(rock(1, r, 0.72, 0.24, 1), c.stone, [0, 0.85, 0], [0, 0, 0], [1.55, 1.1, 0.62])];
    out.push(P(rock(0.62, r, 0.7, 0.3), c.dark, [-0.9, 0.6, 0.1], [0, 0, 0], [1, 1, 0.7]));
    out.push(P(cyl(0.05, 0.09, 1.5, 5), c.wooddark, [0.5, 1.4, 0], [0, 0, 0.3]));
    return out;
  },
  reeds: (r, c) => {
    const out = [];
    for (let i = 0; i < 14; i++) {
      const a = r() * 6.28, d = r() * 0.7, h = 1.4 + r() * 0.9;
      out.push(P(cyl(0.012, 0.045, h, 4), i % 3 ? c.green : c.wood,
        [Math.cos(a) * d, h / 2, Math.sin(a) * d], [jit(r, 0.22), a, jit(r, 0.22)]));
    }
    out.push(P(rock(0.5, r, 0.3, 0.3), c.wooddark, [0, 0.1, 0]));
    return out;
  },
  coral: (r, c) => {
    const out = [P(rock(0.62, r, 0.6, 0.3), c.dark, [0, 0.4, 0])];
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * 6.283 + jit(r, 0.3), h = 0.8 + r() * 1.1;
      out.push(P(cyl(0.09, 0.17, h, 5), i % 2 ? c.stone : c.accent,
        [Math.cos(a) * 0.35, 0.55 + h / 2, Math.sin(a) * 0.35], [Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4]));
      out.push(P(sph(0.16, 6, 4), c.accent, [Math.cos(a) * 0.55, 0.6 + h, Math.sin(a) * 0.55]));
    }
    return out;
  },

  // -- built things ----------------------------------------------------------
  wall: (r, c) => {
    const out = [];
    for (let course = 0; course < 3; course++) {
      for (let i = 0; i < 4; i++) {
        const w = 0.62 + r() * 0.2;
        out.push(P(box(w, 0.3, 0.5), course % 2 ? c.dark : c.stone,
          [-1.2 + i * 0.8 + jit(r, 0.06), 0.18 + course * 0.3, jit(r, 0.05)], [0, jit(r, 0.12), jit(r, 0.05)]));
      }
    }
    out.push(P(box(2.9, 0.16, 0.34), c.dark, [0, 1.02, 0]));
    return out;
  },
  burywall: (r, c) => {
    const out = [];
    for (let i = 0; i < 6; i++) {
      out.push(P(box(0.85, 0.55, 0.7), i % 2 ? c.dark : c.stone,
        [-2.2 + i * 0.9, 0.28 - i * 0.02, jit(r, 0.08)], [0, jit(r, 0.1), jit(r, 0.06)]));
    }
    out.push(P(box(0.7, 1.1, 0.7), c.stone, [-2.4, 0.55, 0], [0, jit(r, 0.2), jit(r, 0.05)]));
    return out;
  },
  fence: (r, c) => [P(cyl(0.07, 0.09, 1.4, 6), c.wood, [-1.1, 0.7, 0], [jit(r, 0.06), 0, jit(r, 0.05)]),
    P(cyl(0.07, 0.09, 1.4, 6), c.wood, [1.1, 0.7, 0], [jit(r, 0.06), 0, jit(r, 0.05)]),
    P(box(2.3, 0.09, 0.07), c.wooddark, [0, 1.12, 0]),
    P(box(2.3, 0.08, 0.06), c.wooddark, [0, 0.68, 0])],
  gate: (r, c) => {
    const out = [P(cyl(0.09, 0.12, 1.7, 6), c.wood, [-1.2, 0.85, 0]),
      P(cyl(0.09, 0.12, 1.7, 6), c.wood, [1.2, 0.85, 0])];
    for (let i = 0; i < 4; i++) out.push(P(box(2.3, 0.09, 0.06), c.wooddark, [0, 0.35 + i * 0.36, 0]));
    out.push(P(box(2.5, 0.08, 0.05), c.wooddark, [0, 0.9, 0], [0, 0, 0.55]));
    return out;
  },
  stile: (r, c) => [P(cyl(0.08, 0.1, 1.3, 6), c.wood, [-0.45, 0.65, 0]),
    P(cyl(0.08, 0.1, 1.3, 6), c.wood, [0.45, 0.65, 0]),
    P(box(1.1, 0.1, 0.32), c.wooddark, [0, 0.42, 0]),
    P(box(1.1, 0.1, 0.32), c.wooddark, [0, 0.82, 0])],
  rick: (r, c) => [P(cyl(1.35, 1.5, 2.0, 10), c.cloth, [0, 1.0, 0]),
    P(cone(1.72, 1.3, 10), c.accent, [0, 2.6, 0]),
    P(cyl(0.05, 0.05, 0.5, 4), c.wooddark, [0, 3.4, 0]),
    P(rock(0.4, r, 0.4, 0.3), c.cloth, [1.5, 0.15, 0.5])],
  sheaf: (r, c) => {
    const out = [];
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * 6.283;
      out.push(P(cyl(0.02, 0.07, 1.5, 4), c.cloth,
        [Math.cos(a) * 0.16, 0.75, Math.sin(a) * 0.16], [Math.sin(a) * 0.22, 0, -Math.cos(a) * 0.22]));
    }
    out.push(P(cyl(0.23, 0.23, 0.12, 9), c.wooddark, [0, 0.85, 0]));
    return out;
  },
  shrine: (r, c) => [P(box(1.1, 0.3, 0.9), c.dark, [0, 0.15, 0]),
    P(box(0.85, 1.2, 0.65), c.stone, [0, 0.9, 0]),
    P(box(1.0, 0.14, 0.5), c.dark, [0, 1.62, 0.16], [0.5, 0, 0]),
    P(box(1.0, 0.14, 0.5), c.dark, [0, 1.62, -0.16], [-0.5, 0, 0]),
    P(sph(0.2, 6, 4), c.accent, [0, 1.0, 0.34])],
  signpost: (r, c) => [P(cyl(0.08, 0.11, 2.4, 6), c.wood, [0, 1.2, 0]),
    P(box(0.85, 0.22, 0.05), c.cloth, [0.45, 2.1, 0], [0, jit(r, 0.3), 0]),
    P(box(0.7, 0.2, 0.05), c.cloth, [-0.38, 1.75, 0], [0, jit(r, 0.3), 0]),
    P(cone(0.12, 0.24, 6), c.wooddark, [0, 2.5, 0])],
  cart: (r, c) => {
    const out = [P(box(1.9, 0.5, 1.0), c.wood, [0, 0.75, 0], [0, 0, jit(r, 0.06)])];
    for (const s of [-1, 1]) out.push(P(cyl(0.5, 0.5, 0.12, 9), c.wooddark, [0.2, 0.5, s * 0.62], [0, 0, Math.PI / 2]));
    out.push(P(box(1.6, 0.08, 0.08), c.wooddark, [-1.6, 0.7, 0.3]));
    out.push(P(box(1.6, 0.08, 0.08), c.wooddark, [-1.6, 0.7, -0.3]));
    out.push(P(rock(0.35, r, 0.6, 0.3), c.cloth, [0.2, 1.1, 0]));
    return out;
  },
  hive: (r, c) => {
    const out = [];
    for (let i = 0; i < 4; i++) out.push(P(cyl(0.3 - i * 0.055, 0.36 - i * 0.05, 0.2, 9), c.cloth, [0, 0.12 + i * 0.2, 0]));
    out.push(P(sph(0.16, 7, 4), c.accent, [0, 0.96, 0]));
    out.push(P(box(0.7, 0.06, 0.7), c.wooddark, [0, 0.03, 0]));
    return out;
  },
  lantern: (r, c) => [P(cyl(0.07, 0.1, 2.2, 6), c.wood, [0, 1.1, 0]),
    P(box(0.3, 0.36, 0.3), c.accent, [0, 2.3, 0]),
    P(cone(0.26, 0.2, 4), c.metal, [0, 2.58, 0]),
    P(box(0.34, 0.05, 0.05), c.wooddark, [0.14, 2.5, 0])],
  banner: (r, c) => [P(cyl(0.07, 0.09, 3.8, 6), c.wood, [0, 1.9, 0]),
    P(box(0.9, 0.06, 0.06), c.wooddark, [0.4, 3.6, 0]),
    P(box(0.8, 1.6, 0.03), c.cloth, [0.45, 2.8, 0], [0, jit(r, 0.2), 0]),
    P(cone(0.12, 0.3, 5), c.metal, [0, 3.9, 0])],
  statue: (r, c) => [P(box(1.1, 0.35, 1.1), c.dark, [0, 0.17, 0]),
    P(cyl(0.28, 0.36, 1.5, 7), c.stone, [0, 1.1, 0]),
    P(box(0.62, 0.9, 0.4), c.stone, [0, 2.2, 0], [0, jit(r, 0.3), jit(r, 0.06)]),
    P(sph(0.26, 7, 5), c.stone, [0, 2.82, 0]),
    P(cyl(0.1, 0.12, 0.9, 5), c.stone, [0.42, 2.4, 0], [0, 0, -0.7])],
  totem: (r, c) => {
    const out = [];
    for (let i = 0; i < 3; i++) {
      out.push(P(cyl(0.34, 0.4, 1.3, 8), i % 2 ? c.wooddark : c.wood, [0, 0.65 + i * 1.3, 0], [0, jit(r, 0.4), 0]));
      out.push(P(box(0.9, 0.1, 0.16), c.accent, [0, 1.2 + i * 1.3, 0], [0, jit(r, 0.5), 0]));
    }
    out.push(P(cone(0.34, 0.6, 6), c.accent, [0, 4.2, 0]));
    return out;
  },
  nest: (r, c) => {
    const out = [];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * 6.283;
      out.push(P(cyl(0.05, 0.07, 1.5, 4), c.wooddark,
        [Math.cos(a) * 0.85, 0.3 + jit(r, 0.1), Math.sin(a) * 0.85], [0, -a + 1.57, 1.57 + jit(r, 0.2)]));
    }
    out.push(P(sph(0.75, 8, 5), c.wood, [0, 0.2, 0], [0, 0, 0], [1, 0.4, 1]));
    for (let i = 0; i < 3; i++) out.push(P(sph(0.2, 7, 5), c.bone, [jit(r, 0.4), 0.42, jit(r, 0.4)], [0, 0, 0], [1, 1.25, 1]));
    return out;
  },
  bridgestub: (r, c) => {
    const out = [P(cyl(0.12, 0.16, 2.6, 6), c.wood, [-0.7, 1.3, 0]),
      P(cyl(0.12, 0.16, 2.6, 6), c.wood, [0.7, 1.3, 0]),
      P(box(1.9, 0.1, 0.1), c.wooddark, [0, 2.5, 0])];
    for (let i = 0; i < 4; i++) out.push(P(box(1.5, 0.07, 0.28), c.wooddark, [0, 1.5 - i * 0.06, 0.4 + i * 0.55], [jit(r, 0.05), 0, 0]));
    out.push(P(cyl(0.03, 0.04, 2.2, 4), c.cloth, [0.66, 2.2, 1.0], [1.2, 0, 0]));
    out.push(P(cyl(0.03, 0.04, 2.2, 4), c.cloth, [-0.66, 2.2, 1.0], [1.2, 0, 0]));
    return out;
  },
  jetty: (r, c) => {
    const out = [];
    for (let i = 0; i < 7; i++) out.push(P(box(1.4, 0.1, 0.5), c.wood, [0, 0.85, -2.4 + i * 0.8], [0, jit(r, 0.03), 0]));
    for (let i = 0; i < 4; i++) for (const s of [-1, 1]) {
      out.push(P(cyl(0.1, 0.13, 1.7, 6), c.wooddark, [s * 0.6, 0.42, -2.2 + i * 1.5]));
    }
    out.push(P(cyl(0.1, 0.12, 1.2, 6), c.wooddark, [0.6, 1.4, -2.2]));
    return out;
  },
  stake: (r, c) => [P(cyl(0.06, 0.09, 1.8, 6), c.wood, [0, 0.9, 0], [jit(r, 0.1), 0, jit(r, 0.1)]),
    P(box(0.7, 0.05, 0.05), c.wooddark, [0, 1.5, 0], [0, jit(r, 0.5), 0]),
    P(box(0.55, 0.5, 0.02), c.cloth, [0.1, 1.2, 0], [0, jit(r, 0.4), 0])],
  post: (r, c) => [P(cyl(0.13, 0.17, 1.5, 7), c.wood, [0, 0.75, 0], [jit(r, 0.08), 0, jit(r, 0.08)]),
    P(cyl(0.19, 0.19, 0.08, 9), c.metal, [0, 1.4, 0]),
    P(cyl(0.03, 0.03, 0.7, 4), c.cloth, [0.14, 1.1, 0], [0.4, 0, 0.5])],
  rack: (r, c) => {
    const out = [];
    for (const s of [-1, 1]) {
      out.push(P(cyl(0.06, 0.08, 2.0, 5), c.wood, [s * 1.1, 1.0, 0.3], [0.28, 0, 0]));
      out.push(P(cyl(0.06, 0.08, 2.0, 5), c.wood, [s * 1.1, 1.0, -0.3], [-0.28, 0, 0]));
    }
    out.push(P(box(2.4, 0.07, 0.07), c.wooddark, [0, 1.95, 0]));
    out.push(P(box(2.0, 1.0, 0.02), c.cloth, [0, 1.42, 0]));
    return out;
  },
  pot: (r, c) => [P(cyl(0.3, 0.24, 0.42, 8), c.wood, [0, 0.21, 0], [jit(r, 0.15), r() * 6.28, jit(r, 0.15)]),
    P(cyl(0.32, 0.32, 0.06, 8), c.wooddark, [0, 0.44, 0]),
    P(sph(0.13, 6, 4), c.accent, [0.34, 0.13, 0.2])],
  amphora: (r, c) => [P(sph(0.34, 8, 6), c.stone, [0, 0.42, 0], [0, 0, 0], [1, 1.25, 1]),
    P(cyl(0.11, 0.15, 0.4, 7), c.stone, [0, 0.94, 0]),
    P(cyl(0.16, 0.16, 0.06, 7), c.dark, [0, 1.14, 0]),
    P(cyl(0.04, 0.04, 0.4, 4), c.dark, [0.19, 0.86, 0], [0, 0, 0.5]),
    P(cyl(0.04, 0.04, 0.4, 4), c.dark, [-0.19, 0.86, 0], [0, 0, -0.5]),
    P(cyl(0.12, 0.08, 0.12, 7), c.dark, [0, 0.06, 0])],
  glass: (r, c) => {
    const out = [];
    for (let i = 0; i < 6; i++) {
      out.push(P(box(0.2 + r() * 0.16, 0.05, 0.14 + r() * 0.12), i % 2 ? c.stone : c.dark,
        [jit(r, 0.3), 0.03, jit(r, 0.3)], [jit(r, 0.2), r() * 6.28, jit(r, 0.2)]));
    }
    return out;
  },
  pipe: (r, c) => [P(cyl(0.34, 0.34, 4.4, 9), c.metal, [0, 0.5, 0], [Math.PI / 2, jit(r, 0.5), jit(r, 0.1)]),
    P(cyl(0.46, 0.46, 0.2, 9), c.dark, [0, 0.5, 2.1], [Math.PI / 2, 0, 0]),
    P(cyl(0.46, 0.46, 0.2, 9), c.dark, [0, 0.5, -2.1], [Math.PI / 2, 0, 0]),
    P(cyl(0.5, 0.5, 0.1, 10), c.metal, [0.5, 0.95, 0.4], [0, 0, 0.4]),
    P(rock(0.35, r, 0.5, 0.3), c.dark, [1.0, 0.16, -0.8])],
  brasswreck: (r, c) => {
    const out = [];
    for (let i = 0; i < 3; i++) {
      out.push(P(box(1.3, 0.09, 0.9), c.metal, [jit(r, 0.4), 0.2 + i * 0.16, jit(r, 0.4)], [jit(r, 0.4), r() * 6.28, jit(r, 0.4)]));
    }
    out.push(P(cyl(0.62, 0.62, 0.12, 10), c.dark, [0.6, 0.6, 0.2], [0.5, 0, 0.4]));
    out.push(P(cyl(0.08, 0.08, 1.4, 5), c.metal, [-0.5, 0.5, -0.3], [0.4, 0.6, 0.9]));
    return out;
  },
  boat: (r, c) => [P(sph(1.4, 9, 6), c.wood, [0, 0.5, 0], [0, jit(r, 0.6), 0], [1, 0.42, 0.52]),
    P(box(2.6, 0.1, 0.12), c.wooddark, [0, 1.06, 0], [0, jit(r, 0.6), 0]),
    P(cyl(0.06, 0.08, 1.6, 5), c.wooddark, [0.9, 0.2, 0.7], [0, 0.7, 1.5])],
  wreck: (r, c) => {
    // a keel with its ribs still on it, half in the sand, the mast snapped off
    const out = [P(box(7.0, 0.4, 0.6), c.wooddark, [0, 0.3, 0], [0, 0, jit(r, 0.06)])];
    for (let i = 0; i < 6; i++) {
      const x = -2.6 + i * 1.05, s = 1 - Math.abs(i - 2.5) / 6;
      for (const f of [-1, 1]) {
        const parts = [];
        arc(parts, i % 2 ? c.wood : c.wooddark, 1.4 * s + 0.6, 0.05, Math.PI * 0.54, 0.13, 4, 0.35, [0, 0.3, 0], f);
        for (const pt of parts) { pt.rotateY(Math.PI / 2); pt.translate(x, 0, 0); out.push(pt); }
      }
    }
    out.push(P(cyl(0.16, 0.26, 3.2, 7), c.wood, [-1.2, 1.5, 0], [jit(r, 0.2), 0, 0.28]));
    out.push(P(box(1.6, 0.08, 0.5), c.wooddark, [2.2, 0.7, 0.5], [jit(r, 0.2), jit(r, 0.4), jit(r, 0.2)]));
    return out;
  },
  /** A face cut into a boundary stone: brow, nose, two hollows, a straight mouth. */
  face: (r, c) => [P(box(1.8, 2.6, 1.1), c.stone, [0, 1.3, 0], [jit(r, 0.05), jit(r, 0.3), jit(r, 0.05)]),
    P(box(1.5, 0.22, 0.24), c.dark, [0, 1.95, 0.56]),
    P(box(0.28, 0.7, 0.34), c.stone, [0, 1.5, 0.62]),
    P(sph(0.28, 7, 5), c.dark, [-0.45, 1.72, 0.5], [0, 0, 0], [1, 0.7, 0.5]),
    P(sph(0.28, 7, 5), c.dark, [0.45, 1.72, 0.5], [0, 0, 0], [1, 0.7, 0.5]),
    P(box(0.9, 0.16, 0.2), c.dark, [0, 0.98, 0.56]),
    P(rock(0.5, r, 0.5, 0.3), c.green, [0.8, 0.2, 0.7])],

  // -- bone --------------------------------------------------------------
  bones: (r, c) => {
    const out = [];
    for (let i = 0; i < 5; i++) {
      const a = r() * 6.28, l = 0.5 + r() * 0.7;
      const x = jit(r, 0.7), z = jit(r, 0.7);
      out.push(P(cyl(0.06, 0.06, l, 5), c.stone, [x, 0.09, z], [Math.PI / 2, a, 0]));
      out.push(P(sph(0.1, 6, 4), c.dark, [x + Math.sin(a) * l / 2, 0.1, z + Math.cos(a) * l / 2]));
      out.push(P(sph(0.1, 6, 4), c.dark, [x - Math.sin(a) * l / 2, 0.1, z - Math.cos(a) * l / 2]));
    }
    return out;
  },
  skull: (r, c) => {
    const out = [P(sph(1.0, 9, 6), c.bone, [0, 1.1, -0.5], [0, 0, 0], [1, 0.9, 1.1])];
    out.push(P(cyl(0.42, 0.85, 2.2, 7), c.bone, [0, 0.95, 1.0], [Math.PI / 2 + 0.12, 0, 0]));
    out.push(P(box(0.9, 0.3, 2.0), c.dark, [0, 0.34, 0.85], [jit(r, 0.06), 0, 0]));   // the jaw, dropped
    for (const s of [-1, 1]) {
      out.push(P(cone(0.18, 1.5, 6), c.bone, [s * 0.7, 2.0, -0.9], [-0.5, 0, s * 0.5]));
      out.push(P(sph(0.3, 7, 5), c.dark, [s * 0.62, 1.35, 0.25], [0, 0, 0], [1, 0.85, 0.8]));   // the socket
      for (let i = 0; i < 4; i++) out.push(P(cone(0.07, 0.3, 4), c.bone, [s * 0.3, 0.6, 0.4 + i * 0.4], [Math.PI, 0, 0]));
    }
    return out;
  },
  ribcage: (r, c) => {
    const out = [P(cyl(0.3, 0.42, 9.5, 8), c.bone, [0, 4.0, 0], [Math.PI / 2, 0, 0])];
    for (let i = 0; i < 6; i++) {
      const z = -3.8 + i * 1.5, s = 1 - Math.abs(i - 2.5) / 9;
      for (const f of [-1, 1]) {
        const parts = [];
        arc(parts, i % 2 ? c.bone : c.dark, 3.6 * s, 0.1, Math.PI * 0.62, 0.22, 6, 0.3, [0, 4.0, 0], f);
        for (const p of parts) { p.translate(0, 0, z); out.push(p); }
      }
      out.push(P(cyl(0.4, 0.5, 0.5, 8), c.bone, [0, 4.0, z], [Math.PI / 2, 0, 0]));
    }
    out.push(P(rock(1.1, r, 0.6, 0.28), c.dark, [0, 0.7, -4.6]));
    return out;
  },
  ribarch: (r, c) => {
    const out = [];
    for (const f of [-1, 1]) arc(out, f > 0 ? c.bone : c.dark, 3.2, 0.12, Math.PI * 0.6, 0.24, 6, 0.32, [0, 0.1, 0], f);
    out.push(P(cyl(0.32, 0.42, 1.1, 8), c.bone, [0, 3.2, 0], [Math.PI / 2, 0, 0]));
    out.push(P(rock(0.7, r, 0.5, 0.3), c.dark, [2.6, 0.3, 0.4]));
    return out;
  },
  vertebra: (r, c) => [P(cyl(0.52, 0.58, 0.9, 9), c.bone, [0, 0.55, 0], [Math.PI / 2, jit(r, 0.2), 0]),
    P(box(0.26, 1.5, 0.34), c.bone, [0, 1.35, 0], [jit(r, 0.12), 0, jit(r, 0.1)]),
    P(box(1.5, 0.2, 0.24), c.dark, [0, 0.75, 0], [0, jit(r, 0.2), jit(r, 0.1)]),
    P(rock(0.3, r, 0.4, 0.3), c.dark, [0.8, 0.12, 0.4])],
  bonestake: (r, c) => [P(cyl(0.06, 0.1, 2.0, 6), c.wooddark, [0, 1.0, 0], [jit(r, 0.1), 0, jit(r, 0.1)]),
    P(sph(0.3, 8, 6), c.bone, [0, 2.15, 0], [0, r() * 6.28, 0], [1, 0.95, 1.15]),
    P(box(0.24, 0.12, 0.4), c.dark, [0, 2.0, 0.2]),
    P(cyl(0.02, 0.02, 0.5, 4), c.cloth, [0, 1.5, 0], [0.6, 0, 0.7])],
};

// -------------------------------------------------------------- the words --
//
// What a thing is called, for the hover pass that comes after this one. Most
// names fall straight out of the kind; the ones that would read badly are
// written down. No sentence, just the noun and its article, the way the rest
// of the game names a thing before it says anything about it.

export const DRESS_NAME = {
  rib_cage: 'a rib cage', rib_arch: 'a rib arch', dragon_skull: 'a dragon\'s skull',
  spine: 'a dragon\'s spine', half_giant: 'a half buried giant', bone_tree: 'a bone tree',
  bone_stake: 'a bone stake', ash_drift: 'a drift of ash', bone_shard: 'old bones',
  tomb_slab: 'a fallen slab', bone_cairn: 'a cairn of bones',
  hedgerow: 'a hedgerow', drystone_wall: 'a dry stone wall', hay_rick: 'a hay rick',
  wayside_shrine: 'a wayside shrine', field_gate: 'a field gate', milestone: 'a milestone',
  sheaf: 'a sheaf', sarsen: 'a boundary stone',
  fallen_giant: 'a fallen giant', root_arch: 'an arch of roots', carved_face: 'a carved face',
  rope_bridge_stub: 'the end of a rope bridge', buttress_root: 'a buttress root',
  vine_curtain: 'a curtain of vines', mushroom_ring: 'a ring of mushrooms',
  moss_boulder: 'a mossed boulder', court_lantern: 'a Court lantern',
  upturned_boat: 'an upturned boat', salt_pan: 'a salt pan', reed_bed: 'a reed bed',
  net_stake: 'a net stake', drying_rack: 'a drying rack', crab_pot: 'a crab pot',
  mooring_post: 'a mooring post', wreck: 'a wreck',
  wind_stack: 'a wind carved stack', sandstone_arch: 'a sandstone arch',
  sandstone_pillar: 'a sandstone pillar', buried_wall: 'a half buried wall',
  bleached_bones: 'sun bleached bones', sun_skull: 'a bleached skull',
  waste_cairn: 'a trail cairn', broken_cart: 'a broken cart',
  rider_cairn: 'a rider\'s cairn', broken_column: 'a broken column',
  eyrie_nest: 'an eyrie nest', post_fence: 'a post fence', prayer_stone: 'a prayer stone',
  slate_slab: 'a slate slab', scree_boulder: 'a boulder off the scree', banner_pole: 'a banner',
  ice_shard: 'a shard of ice', frozen_pine: 'a frozen pine', snowed_wreck: 'a wreck under snow',
  frozen_fall: 'a frozen waterfall', iced_standing_stone: 'a standing stone in its ice',
  mammoth_ribs: 'mammoth ribs', ice_splinter: 'a splinter of ice', snow_drift: 'a snow drift',
  frozen_stake: 'a frozen stake', rime_cairn: 'a rimed cairn',
  marble_column: 'a marble column', marble_arch: 'a marble arch', fallen_column: 'a fallen column',
  drowned_statue: 'a drowned statue', broken_pediment: 'a broken pediment',
  coral_head: 'a coral head', sea_glass: 'sea glass', mosaic_slab: 'a mosaic floor',
  anchor_stone: 'an anchor stone',
  obsidian_spire: 'an obsidian spire', black_pillar: 'a black pillar', brass_pipe: 'a brass pipe',
  legion_banner: 'a Legion banner', slag_heap: 'a slag heap', cinder_cone: 'a cinder cone',
  obsidian_shard: 'a shard of obsidian', lava_vent: 'a lava vent', brass_wreck: 'brass wreckage',
  charred_bones: 'charred bones',
};

/** What to call a kind. Anything not written down gets its own id, read aloud. */
export const nameOf = (kind) => DRESS_NAME[kind] || ('a ' + String(kind).replace(/_/g, ' '));

// ------------------------------------------------------------ one body --

const bodyCache = new Map();
const strHash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

/** How many bodies a kind is grown in. Anchors vary; scatter does not need to. */
export const variantsOf = (spec) => (spec.tier === 'anchor' ? ANCHOR_VARIANTS : SCATTER_VARIANTS);

/**
 * The geometry of one kind, in one of its variants, scaled so its largest
 * dimension is the `size` the kit asked for and its feet are at y 0.
 *
 * Built once and kept: a rib cage costs its triangles once for the life of the
 * process, however many chunks stand one up.
 */
export function bodyFor(realm, spec, variant = 0) {
  const key = `${realm}:${spec.kind}:${variant}`;
  const had = bodyCache.get(key);
  if (had) return had;
  const make = BODIES[spec.build];
  if (!make) throw new Error(`dressing: ${realm}:${spec.kind} names a body "${spec.build}" that does not exist`);
  const rng = mulberry32(strHash(key));
  const parts = make(rng, paletteFor(realm, spec.kind));
  const geo = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!geo) throw new Error(`dressing: ${realm}:${spec.kind} built nothing`);
  geo.computeBoundingBox();
  const b = geo.boundingBox;
  const span = Math.max(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z);
  const k = spec.size / span;
  geo.scale(k, k, k);
  geo.computeVertexNormals();
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  bodyCache.set(key, geo);
  return geo;
}

/** Which of the four materials a kind is drawn with. */
export const materialFor = (kind) => materials()[MATERIAL_OF[kind] || 'stone'];

/**
 * Every body in the world, built and measured.
 *
 * This is the check that closes the loop between the two files: a kind that
 * names a body nobody wrote, a body that comes out floating above the ground or
 * buried under it, a body that is a mile wide, or one so heavy it should not be
 * instanced a thousand times, all fail here rather than in the browser.
 */
export function auditBodies(kits = KITS) {
  const bad = [];
  let tris = 0, bodies = 0;
  for (const [realm, list] of Object.entries(kits)) {
    for (const spec of list) {
      for (let v = 0; v < variantsOf(spec); v++) {
        let geo;
        try { geo = bodyFor(realm, spec, v); } catch (e) { bad.push(e.message); continue; }
        bodies++;
        const b = geo.boundingBox;
        const span = Math.max(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z);
        if (Math.abs(span - spec.size) > spec.size * 0.01) bad.push(`${realm}:${spec.kind}: ${span.toFixed(2)} m built, ${spec.size} m asked`);
        const foot = Math.hypot(b.max.x - b.min.x, b.max.z - b.min.z);
        if (foot > spec.size * 2.0) bad.push(`${realm}:${spec.kind}: a footprint of ${foot.toFixed(1)} m under a ${spec.size} m thing`);
        if (b.min.y < -spec.size * 0.45) bad.push(`${realm}:${spec.kind}: ${(-b.min.y).toFixed(2)} m of it is under the ground it stands on`);
        if (b.min.y > spec.size * 0.12) bad.push(`${realm}:${spec.kind}: it floats ${b.min.y.toFixed(2)} m above the ground`);
        const t = geo.attributes.position.count / 3;
        if (t > 3000) bad.push(`${realm}:${spec.kind}: ${t} triangles, too heavy to instance`);
        tris += t;
      }
    }
  }
  if (bad.length) throw new Error(`dressing bodies: ${bad.length} problem(s)\n  ${bad.join('\n  ')}`);
  return { bodies, tris, kinds: ALL_KINDS.length };
}

// ----------------------------------------------------------- the layer --

/** Chunks at this many verts a side or more get dressed. 0 means every chunk. */
export const DRESS_TIER = 0;

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

/**
 * The dressing layer.
 *
 *   const dressing = createDressing(scene, field, { sitesNear });
 *   dressing.onChunk(cx, cz, verts);   // chunks.js built one
 *   dressing.offChunk(cx, cz);         // and threw one away
 *   dressing.update(nowMs, x, z);      // every frame
 *
 * One InstancedMesh per kind per variant, holding every record of that kind in
 * the streamed ring, rebuilt when its records change and never more often than
 * REBUILD_MS. Kinds with no records left are taken out of the scene, so a layer
 * standing in Frostreach draws nothing of the Boneyard.
 */
export function createDressing(scene, field, opts = {}) {
  const group = new THREE.Group();
  group.name = 'world-dressing';
  scene.add(group);

  const layers = new Map();       // realm:kind:variant -> layer
  const have = new Map();         // chunk key -> record count
  const dirty = new Set();
  const lastBuilt = new Map();
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  const stats = {
    chunks: 0, records: 0, layers: 0, drawCalls: 0, instances: 0, tris: 0,
    rebuilds: 0, lastRebuild: null, lastRebuildMs: 0, lastChunkMs: 0, worstChunkMs: 0,
  };

  const specOf = (realm, kind) => kitFor(realm).find((k) => k.kind === kind);

  function layerFor(realm, kind, variant) {
    const key = `${realm}:${kind}:${variant}`;
    let L = layers.get(key);
    if (L) return L;
    const spec = specOf(realm, kind);
    L = { key, realm, kind, variant, spec, recs: [], mesh: null };
    layers.set(key, L);
    return L;
  }

  /** Which body a record wears. Its own place decides, so it never changes. */
  const variantOf = (rec, n) => (n <= 1 ? 0 : strHash(`${Math.round(rec.x)},${Math.round(rec.z)}`) % n);

  function addChunk(cx, cz) {
    const key = cx + ',' + cz;
    if (have.has(key)) return;
    const t0 = now();
    const recs = dressingFor(field, cx, cz, opts);
    for (const rec of recs) {
      const spec = specOf(rec.realm, rec.kind);
      if (!spec) continue;
      const L = layerFor(rec.realm, rec.kind, variantOf(rec, variantsOf(spec)));
      L.recs.push(rec);
      dirty.add(L.key);
    }
    have.set(key, recs.length);
    stats.chunks++; stats.records += recs.length;
    stats.lastChunkMs = +(now() - t0).toFixed(2);
    if (stats.lastChunkMs > stats.worstChunkMs) stats.worstChunkMs = stats.lastChunkMs;
  }

  function removeChunk(cx, cz) {
    const key = cx + ',' + cz;
    if (!have.has(key)) return;
    for (const L of layers.values()) {
      const before = L.recs.length;
      if (!before) continue;
      L.recs = L.recs.filter((t) => t.chunk !== key);
      if (L.recs.length !== before) { dirty.add(L.key); stats.records -= before - L.recs.length; }
    }
    have.delete(key); stats.chunks--;
  }

  const _mat = new THREE.Matrix4(), _pos = new THREE.Vector3(), _rot = new THREE.Quaternion(), _eul = new THREE.Euler(), _scl = new THREE.Vector3();

  function rebuild(L) {
    if (L.mesh) { group.remove(L.mesh); L.mesh.dispose(); L.mesh = null; }
    if (!L.recs.length) return;
    const geo = bodyFor(L.realm, L.spec, L.variant);
    const mesh = new THREE.InstancedMesh(geo, materialFor(L.kind), L.recs.length);
    mesh.name = `dressing:${L.key}`;
    mesh.castShadow = true; mesh.receiveShadow = true;
    // the whole point of naming a thing: a later pass can put a word on hover
    mesh.userData.dressing = { kind: L.kind, realm: L.realm, name: nameOf(L.kind) };
    for (let i = 0; i < L.recs.length; i++) {
      const t = L.recs[i];
      _pos.set(t.x, t.y, t.z);
      _eul.set(t.tilt || 0, t.ry || 0, 0);
      _rot.setFromEuler(_eul);
      _scl.set(t.s, t.s, t.s);
      mesh.setMatrixAt(i, _mat.compose(_pos, _rot, _scl));
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere?.();
    group.add(mesh);
    L.mesh = mesh;
  }

  function count() {
    let draws = 0, inst = 0, tris = 0;
    for (const L of layers.values()) {
      if (!L.mesh) continue;
      draws++; inst += L.mesh.count;
      tris += (L.mesh.geometry.attributes.position.count / 3) * L.mesh.count;
    }
    stats.drawCalls = draws; stats.instances = inst; stats.tris = tris;
    stats.layers = layers.size;
  }

  return {
    group, stats, layers,

    /** chunks.js: a chunk was built, or rebuilt at another detail tier. */
    onChunk(cx, cz, verts = 99) { if (verts >= DRESS_TIER) addChunk(cx, cz); else removeChunk(cx, cz); },
    offChunk(cx, cz) { removeChunk(cx, cz); },

    /** Every frame. One kind's mesh is rebuilt at most, and never twice inside REBUILD_MS. */
    update(nowMs = 0) {
      for (const key of dirty) {
        if (nowMs - (lastBuilt.get(key) || -1e9) < REBUILD_MS) continue;
        const t0 = now();
        rebuild(layers.get(key));
        lastBuilt.set(key, nowMs); dirty.delete(key);
        stats.rebuilds++; stats.lastRebuild = key;
        stats.lastRebuildMs = +(now() - t0).toFixed(2);
        break;
      }
      count();
    },

    /** Build everything waiting, now. For a teleport, and for the tests. */
    flush() { for (const key of [...dirty]) { rebuild(layers.get(key)); dirty.delete(key); } count(); },

    get pending() { return dirty.size; },
    /** Every prop standing in the ring, for a test or a hover pass. */
    all() { const out = []; for (const L of layers.values()) for (const t of L.recs) out.push(t); return out; },

    dispose() {
      for (const L of layers.values()) if (L.mesh) { group.remove(L.mesh); L.mesh.dispose(); L.mesh = null; }
      layers.clear(); have.clear(); dirty.clear();
      scene.remove(group);
    },
  };
}

export { dressingFor, kitFor, KITS, auditKits } from './dressing.js';
