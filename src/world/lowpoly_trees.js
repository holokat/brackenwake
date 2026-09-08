// Low poly trees: the forest in facets.
//
// Arbor grows a tree out of tapered tubes and thousands of textured leaf quads.
// This module builds the same eleven species as a handful of faceted solids: a
// trunk with five to seven sides, a canopy of jittered icosahedra, cones for
// the conifers, frond strips for the palm, bare tubes for the snag. Every face
// carries its own colour, so a canopy reads as light on top and shade below
// without a texture, and nothing here needs a canvas. It runs in node.
//
//   import { buildLowPolyPrototype } from './lowpoly_trees.js';
//   const p = buildLowPolyPrototype('oak', 12345, { maturity: 1 });
//   p.bark / p.leaf      BufferGeometry, origin at the foot, +y up
//   p.barkMat / p.leafMat / p.depthMat
//   p.bands              [{ bark, leaf }] for near, mid and far, already built
//
// The prototype has the same shape arbor.buildPrototype returns, so flora.js
// instances it exactly as it instances a grown tree, and plan_models.js dresses
// an authored space with it the same way. arbor.prototypeFor picks this builder
// when the tree style is 'lowpoly' (the default since 2026-09-08, the user:
// "can we change trees to low poly style").
//
// Measured in lowpoly_trees.test.mjs: every species at every band, triangle
// budgets, heights off the vertices, determinism, the autumn and foliage
// options, and the seams with arbor and flora.

import * as THREE from 'three';
import { mulberry32 } from './noise.js';
import { SPECIES, PROTO_DEFAULTS, LEAF_GROUND_CLEARANCE, LOD_BANDS, windHook } from './arbor.js';

// ------------------------------------------------------------- the sinks ---

/** Where triangles go: positions, flat normals, colours, and a branch order per face. */
function sink() { return { P: [], N: [], C: [], ord: [], tris: 0 }; }

const tmp = { a: new THREE.Vector3(), b: new THREE.Vector3(), n: new THREE.Vector3() };

/** One flat shaded triangle. `col` is a THREE.Color; `order` is the bark order flora's far band may drop. */
function tri(s, a, b, c, col, order = 0) {
  tmp.a.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  tmp.b.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
  tmp.n.crossVectors(tmp.a, tmp.b);
  if (tmp.n.lengthSq() < 1e-12) return;           // a sliver; draw nothing
  tmp.n.normalize();
  s.P.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
  for (let i = 0; i < 3; i++) { s.N.push(tmp.n.x, tmp.n.y, tmp.n.z); s.C.push(col.r, col.g, col.b); }
  s.ord.push(order);
  s.tris++;
}

function geometryOf(s) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(s.P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(s.N, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(s.C, 3));
  // flora reads `index.count`; a flat shaded mesh is its own index
  const n = s.P.length / 3;
  const idx = new (n > 65535 ? Uint32Array : Uint16Array)(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  if (n) g.computeBoundingSphere();
  return g;
}

// ------------------------------------------------------------- colouring ---

const col = new THREE.Color();
/** A bark colour with a little per face grain. `k` in [0, 1) is the face's own draw. */
function barkColour(base, k) {
  col.copy(base).multiplyScalar(0.88 + k * 0.24);
  return col;
}
/**
 * A leaf face colour: `t` in [0, 1] is height through the crown (dark at the
 * bottom, light at the top), `up` is the normal's y (faces that look at the
 * sky are lit), `k` is the face's own grain.
 */
function leafColour(A, B, t, up, k) {
  col.copy(A).lerp(B, Math.max(0, Math.min(1, t * 0.7 + k * 0.3)));
  col.multiplyScalar(0.82 + 0.28 * Math.max(0, up) + (k - 0.5) * 0.08);
  return col;
}

// ---------------------------------------------------------------- solids ---

/**
 * A tube through `pts` with `radii` at each, `sides` around. Rings sit
 * perpendicular to the local axis, so a branch that leaves the trunk at an
 * angle is round along its own length. `cap` closes the top with a fan.
 */
function tube(s, pts, radii, sides, base, rng, order = 0, cap = true) {
  const rings = [];
  const up = new THREE.Vector3(), u = new THREE.Vector3(), v = new THREE.Vector3(), d = new THREE.Vector3();
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[Math.max(0, i - 1)], next = pts[Math.min(pts.length - 1, i + 1)];
    d.set(next[0] - prev[0], next[1] - prev[1], next[2] - prev[2]);
    if (d.lengthSq() < 1e-9) d.set(0, 1, 0);
    d.normalize();
    up.set(Math.abs(d.y) > 0.9 ? 1 : 0, Math.abs(d.y) > 0.9 ? 0 : 1, 0);
    u.crossVectors(d, up).normalize(); v.crossVectors(d, u).normalize();
    const ring = [];
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * Math.PI * 2 + (i * 0.17);   // a twist per ring, so the facets spiral
      const r = radii[i];
      ring.push([
        pts[i][0] + (u.x * Math.cos(a) + v.x * Math.sin(a)) * r,
        pts[i][1] + (u.y * Math.cos(a) + v.y * Math.sin(a)) * r,
        pts[i][2] + (u.z * Math.cos(a) + v.z * Math.sin(a)) * r,
      ]);
    }
    rings.push(ring);
  }
  for (let i = 0; i + 1 < rings.length; i++) {
    for (let k = 0; k < sides; k++) {
      const k2 = (k + 1) % sides;
      const c1 = barkColour(base, rng()).clone(), c2 = barkColour(base, rng()).clone();
      // Rings run counterclockwise seen from the tip, so the outward face is
      // a, then the next point around, then up: the other order faced inward
      // and every trunk was culled from the near side (the user, 2026-09-08:
      // "open geometry like its missing half of the trunk").
      tri(s, rings[i][k], rings[i + 1][k2], rings[i + 1][k], c1, order);
      tri(s, rings[i][k], rings[i][k2], rings[i + 1][k2], c2, order);
    }
  }
  if (cap) {
    const top = rings[rings.length - 1], p = pts[pts.length - 1];
    for (let k = 0; k < sides; k++) tri(s, top[k], top[(k + 1) % sides], p, barkColour(base, rng()), order);
  }
  return rings;
}

const ICO = [null, null, null].map((_, d) => new THREE.IcosahedronGeometry(1, d));
const hash3 = (x, y, z, seed) => {
  let h = (Math.round(x * 97) * 374761393 + Math.round(y * 97) * 668265263 + Math.round(z * 97) * 2147483647 + seed * 1013904223) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/**
 * A faceted blob: an icosahedron at `detail` with every vertex pushed in or out
 * along its own direction by up to `jitter` of the radius. The push comes from
 * a hash of the unit vertex, so the three copies of a shared corner move
 * together and the surface stays closed. `ry` squashes or stretches it.
 */
function blob(s, centre, r, ry, detail, jitter, seed, rng, paint) {
  const src = ICO[Math.max(0, Math.min(2, detail))].attributes.position;
  const pts = [];
  for (let i = 0; i < src.count; i++) {
    const x = src.getX(i), y = src.getY(i), z = src.getZ(i);
    const j = 1 + (hash3(x, y, z, seed) * 2 - 1) * jitter;
    pts.push([centre[0] + x * r * j, centre[1] + y * r * ry * j, centre[2] + z * r * j]);
  }
  for (let i = 0; i + 2 < pts.length; i += 3) {
    const a = pts[i], b = pts[i + 1], c = pts[i + 2];
    const cy = (a[1] + b[1] + c[1]) / 3;
    tri(s, a, b, c, paint(cy, rng()), 0);
  }
}

/** A cone with its apex up: `sides` fans to the tip and a shallow fan closes the bottom. */
function cone(s, cx, cy, cz, r, h, sides, twist, paint, rng) {
  const ring = [];
  for (let k = 0; k < sides; k++) {
    const a = (k / sides) * Math.PI * 2 + twist;
    const rr = r * (0.92 + hash3(k, twist, r, sides) * 0.16);
    ring.push([cx + Math.cos(a) * rr, cy, cz + Math.sin(a) * rr]);
  }
  const apex = [cx, cy + h, cz], under = [cx, cy - h * 0.08, cz];
  for (let k = 0; k < sides; k++) {
    const k2 = (k + 1) % sides;
    tri(s, ring[k], ring[k2], apex, paint(cy + h * 0.5, rng()), 0);
    tri(s, ring[k2], ring[k], under, paint(cy - h * 0.2, rng()).multiplyScalar(0.7), 0);
  }
}

/**
 * A palm frond: a strip of `segs` quads along an arc that rises then droops,
 * tapering to a point. Double sided by the material, so one strip is a leaf.
 */
function frond(s, origin, angle, len, width, droop, segs, paint, rng) {
  const dx = Math.cos(angle), dz = Math.sin(angle);
  const px = -dz, pz = dx;
  const spine = [], half = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const y = origin[1] + len * (0.42 * t - droop * t * t);
    spine.push([origin[0] + dx * len * t, y, origin[2] + dz * len * t]);
    half.push(width * 0.5 * Math.sin(Math.PI * Math.min(1, 0.15 + t * 0.85)) * (1 - t * 0.35));
  }
  for (let i = 0; i < segs; i++) {
    const a = spine[i], b = spine[i + 1];
    const la = [a[0] - px * half[i], a[1], a[2] - pz * half[i]], ra = [a[0] + px * half[i], a[1], a[2] + pz * half[i]];
    const lb = [b[0] - px * half[i + 1], b[1], b[2] - pz * half[i + 1]], rb = [b[0] + px * half[i + 1], b[1], b[2] + pz * half[i + 1]];
    const c1 = paint(a[1], rng()).clone(), c2 = paint(b[1], rng()).clone();
    tri(s, la, ra, rb, c1, 0);
    tri(s, la, rb, lb, c2, 0);
  }
}

// ------------------------------------------------------------- the trees ---

/** The three bands, coarser as they go: what a tree is made of at each. */
const BAND = [
  { sides: 6, blobDetail: 1, jitter: 0.14, branches: true, tiers: 1, frondSegs: 4, fronds: 1, whips: true },
  { sides: 5, blobDetail: 0, jitter: 0.1, branches: false, tiers: 1, frondSegs: 2, fronds: 0.7, whips: false },
  { sides: 4, blobDetail: 0, jitter: 0.06, branches: false, tiers: 0, frondSegs: 1, fronds: 0, whips: false },
];

/**
 * Build one band of one tree. `plan` is the tree's frame (heights, radii,
 * crown), drawn once so every band is the same tree at a different cost.
 */
function buildBand(plan, band, sp, opts) {
  const L = BAND[band];
  const bark = sink(), leaf = sink();
  const rng = mulberry32((plan.seed + band * 7919) >>> 0);
  const barkBase = new THREE.Color(sp.bark);
  const A = new THREE.Color(plan.leafA), B = new THREE.Color(plan.leafB);
  const paint = (lo, hi) => (y, k, up = 0.6) => leafColour(A, B, hi > lo ? (y - lo) / (hi - lo) : 0.5, up, k);
  const far = band === 2;
  const leaves = plan.hasLeaves;

  // The trunk. Every habit has one; the palm's arcs.
  const pts = [], radii = [];
  const segs = far ? 2 : 3;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const lean = plan.lean * t * t;
    pts.push([plan.leanX * lean, -0.05 + plan.trunkH * t, plan.leanZ * lean]);
    radii.push(plan.radius * (i === 0 ? 1.3 : 1 - t * 0.6));
  }
  tube(bark, pts, radii, L.sides, barkBase, rng, 0, plan.habit !== 'conical');
  const top = pts[pts.length - 1];

  if (plan.habit === 'palm') {
    // the crown sits on the trunk's end; the fronds leave it in a ring
    if (leaves) {
      const count = far ? 0 : Math.max(4, Math.round(plan.fronds * L.fronds));
      const p = paint(top[1] - plan.frondLen * 0.5, top[1] + plan.frondLen * 0.3);
      for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2 + rng() * 0.5;
        frond(leaf, top, a, plan.frondLen * (0.85 + rng() * 0.3), plan.frondW, 0.75 + rng() * 0.3, L.frondSegs, p, rng);
      }
      if (far) blob(leaf, [top[0], top[1] - plan.frondLen * 0.15, top[2]], plan.frondLen * 0.75, 0.3, 0, 0.1, plan.seed, rng, p);
    }
    blob(bark, top, plan.radius * 1.8, 0.9, 0, 0.1, plan.seed + 3, rng, (y, k) => barkColour(barkBase, k).multiplyScalar(0.8));
  } else if (plan.habit === 'conical') {
    if (leaves) {
      const tiers = far ? 1 : plan.tiers;
      const p = paint(plan.crownBottom, plan.crownTop);
      for (let i = 0; i < tiers; i++) {
        const t = i / tiers;
        const y = far ? plan.crownBottom : plan.crownBottom + (plan.crownTop - plan.crownBottom) * t * 0.82;
        const h = far ? plan.crownTop - plan.crownBottom : (plan.crownTop - plan.crownBottom) / tiers * 1.7;
        const r = plan.crownR * (far ? 1 : 1 - t * 0.72);
        cone(leaf, 0, y, 0, r, h, far ? 5 : L.sides + 1, i * 0.37, p, rng);
      }
    }
  } else if (plan.habit === 'dead') {
    // bare branches, two orders of them, and no leaves at all
    const count = far ? 0 : band === 1 ? Math.min(3, plan.branches) : plan.branches;
    for (let i = 0; i < count; i++) {
      const a = (i / plan.branches) * Math.PI * 2 + rng() * 0.8;
      const y0 = plan.trunkH * (0.45 + rng() * 0.4);
      const len = plan.height * (0.25 + rng() * 0.2);
      const end = [Math.cos(a) * len * 0.8, y0 + len * 0.7, Math.sin(a) * len * 0.8];
      tube(bark, [[0, y0, 0], [end[0] * 0.5, y0 + len * 0.45, end[2] * 0.5], end], [plan.radius * 0.45, plan.radius * 0.3, plan.radius * 0.1], 4, barkBase, rng, 1, true);
      if (band === 0) {
        const a2 = a + (rng() - 0.5) * 1.6, l2 = len * 0.5;
        const from = [end[0] * 0.6, y0 + len * 0.5, end[2] * 0.6];
        tube(bark, [from, [from[0] + Math.cos(a2) * l2, from[1] + l2 * 0.8, from[2] + Math.sin(a2) * l2]], [plan.radius * 0.22, plan.radius * 0.06], 4, barkBase, rng, 2, true);
      }
    }
  } else {
    // round and umbrella: blobs of canopy, and branches out to them near to
    const p = paint(plan.crownBottom, plan.crownTop);
    if (leaves) {
      if (far) {
        blob(leaf, [0, plan.crownY, 0], plan.crownR, plan.crownRy, 0, L.jitter, plan.seed, rng, p);
      } else {
        for (const b of plan.blobs) blob(leaf, b.c, b.r, b.ry, L.blobDetail, L.jitter, plan.seed + b.i, rng, p);
        if (L.whips && plan.whips) {
          for (const b of plan.blobs) {
            for (let w = 0; w < 2; w++) {
              const a = rng() * Math.PI * 2, rr = b.r * (0.5 + rng() * 0.4);
              const x = b.c[0] + Math.cos(a) * rr, z = b.c[2] + Math.sin(a) * rr;
              const y0 = b.c[1] - b.r * b.ry * 0.5;
              const h = Math.max(0.6, y0 - LEAF_GROUND_CLEARANCE - 0.4) * (0.5 + rng() * 0.4);
              // a whip hangs: a cone pointing down
              const ring = [], n = 4;
              for (let k = 0; k < n; k++) ring.push([x + Math.cos(k / n * Math.PI * 2) * b.r * 0.16, y0, z + Math.sin(k / n * Math.PI * 2) * b.r * 0.16]);
              const tip = [x + (rng() - 0.5) * 0.4, y0 - h, z + (rng() - 0.5) * 0.4];
              for (let k = 0; k < n; k++) tri(leaf, ring[(k + 1) % n], ring[k], tip, p(y0 - h * 0.5, rng(), 0.2), 0);
            }
          }
        }
      }
    }
    if (L.branches && plan.branches) {
      for (const b of plan.blobs) {
        if (b.i === 0) continue;
        const y0 = plan.trunkH * (0.55 + rng() * 0.3);
        const endX = b.c[0] * 0.8, endZ = b.c[2] * 0.8, endY = b.c[1] - b.r * 0.2;
        tube(bark, [[0, y0, 0], [endX * 0.5, y0 + (endY - y0) * 0.55, endZ * 0.5], [endX, endY, endZ]],
          [plan.radius * 0.42, plan.radius * 0.26, plan.radius * 0.1], 4, barkBase, rng, 1, false);
      }
    }
  }
  return { bark: geometryOf(bark), leaf: geometryOf(leaf), barkOrder: Uint8Array.from(bark.ord), tris: bark.tris + leaf.tris, leafTris: leaf.tris };
}

/** The frame of one tree from the species table and the options, drawn once. */
function planTree(speciesId, sp, seed, opt) {
  const rng = mulberry32(seed >>> 0);
  const maturity = Math.max(0, Math.min(1, opt.maturity));
  const h = (sp.h[0] + rng() * (sp.h[1] - sp.h[0])) * opt.heightScale * (0.5 + 0.5 * maturity);
  const radius = h * sp.trunk * opt.trunkRadius * (0.7 + 0.5 * maturity);   // arbor's own rule; the axe collides with it
  const habit = speciesId === 'dead' ? 'dead' : sp.habit;
  const spread = (sp.spread / 80) * (opt.crownSpread / 50);
  const [autA, autB] = sp.autumnTo || ['#a8742c', '#d9a33a'];
  const leafA = new THREE.Color(sp.leafA).lerp(new THREE.Color(autA), opt.autumn).getStyle();
  const leafB = new THREE.Color(sp.leafB).lerp(new THREE.Color(autB), opt.autumn).getStyle();
  const plan = {
    seed: seed >>> 0, habit, height: h, radius, leafA, leafB,
    hasLeaves: !!sp.leaf && opt.foliage > 0,
    lean: h * 0.04 * rng(), leanX: 0, leanZ: 0, branches: 0, blobs: [], whips: false,
    crownBottom: 0, crownTop: h, crownR: 0, crownRy: 1, crownY: h * 0.6, trunkH: h * 0.62,
    tiers: 3, fronds: 7, frondLen: 0, frondW: 0,
  };
  const la = rng() * Math.PI * 2; plan.leanX = Math.cos(la); plan.leanZ = Math.sin(la);
  const willow = speciesId === 'willow';
  if (habit === 'palm') {
    plan.trunkH = h * 0.92; plan.lean = h * 0.18 * (0.3 + rng() * 0.7);
    plan.fronds = 6 + Math.round(rng() * 3);
    plan.frondLen = h * 0.42; plan.frondW = h * 0.09;
    plan.crownR = plan.frondLen * 0.85; plan.crownBottom = plan.trunkH - plan.frondLen * 0.5; plan.crownTop = plan.trunkH + plan.frondLen * 0.3;
  } else if (habit === 'conical') {
    plan.trunkH = h * 0.96; plan.tiers = 3 + Math.round(maturity * 2 * rng() + rng());
    plan.crownBottom = h * Math.max(0.1, sp.crownBase); plan.crownTop = h;
    plan.crownR = h * (0.14 + 0.1 * spread) * (0.8 + 0.4 * opt.foliage);
  } else if (habit === 'dead') {
    plan.trunkH = h * 0.72; plan.branches = 3 + Math.round(rng() * 2 + maturity);
    plan.crownR = h * 0.3; plan.crownBottom = h * 0.4;
  } else {
    const umbrella = habit === 'umbrella';
    plan.crownBottom = h * Math.max(umbrella ? 0.5 : 0.2, sp.crownBase);
    plan.crownTop = h;
    plan.trunkH = umbrella ? h * 0.66 : (plan.crownBottom + (h - plan.crownBottom) * 0.35);
    plan.crownR = h * (0.16 + 0.34 * spread) * (0.55 + 0.6 * sp.latRatio) * (0.75 + 0.25 * opt.foliage);
    if (umbrella) plan.crownR *= 1.1;
    const span = plan.crownTop - plan.crownBottom;
    // the main blob and its satellites together reach crownR: the farthest
    // satellite sits at 0.9 R and is 0.72 R across, so R is crownR over 1.62
    const R = Math.min(plan.crownR / 1.62, span * (umbrella ? 0.9 : 0.55));
    plan.crownY = plan.crownBottom + span * (umbrella ? 0.5 : 0.55);
    plan.crownRy = Math.max(0.35, Math.min(1.4, (span * 0.5) / plan.crownR));
    const ry = umbrella ? 0.5 : willow ? 1.25 : speciesId === 'sakura' ? 0.75 : 0.85;
    const count = 2 + Math.round(rng() * 1.5 + maturity * 1.5);   // 2 to 5 satellites
    plan.blobs.push({ i: 0, c: [0, plan.crownY, 0], r: R, ry });
    for (let i = 1; i <= count; i++) {
      const a = i * 2.39996 + rng() * 0.6;
      const d = R * (0.55 + rng() * 0.35);
      const dy = willow ? -R * (0.2 + rng() * 0.4) : umbrella ? (rng() - 0.5) * R * 0.3 : (rng() - 0.35) * R * 0.7;
      plan.blobs.push({ i, c: [Math.cos(a) * d, plan.crownY + dy, Math.sin(a) * d], r: R * (0.45 + rng() * 0.27), ry });
    }
    plan.branches = plan.blobs.length - 1;
    plan.whips = willow;
  }
  return plan;
}

// ------------------------------------------------------------- materials ---

const materialCache = new Map();
/** One bark, one leaf and one depth material per species, shared by every prototype of it. */
export function lowPolyMaterials(speciesId) {
  let m = materialCache.get(speciesId);
  if (m) return m;
  const sp = SPECIES[speciesId];
  const barkMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, name: `lowpoly bark ${speciesId}` });
  const leafMat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.85, metalness: 0, name: `lowpoly leaf ${speciesId}`,
    side: sp.habit === 'palm' ? THREE.DoubleSide : THREE.FrontSide,
    emissive: new THREE.Color(sp.leafA).multiplyScalar(0.1),
  });
  leafMat.onBeforeCompile = (sh) => windHook(sh, sp.habit === 'palm' ? 0.08 : 0.045, false);
  const depthMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  m = { barkMat, leafMat, depthMat };
  materialCache.set(speciesId, m);
  return m;
}
export function disposeLowPolyMaterials() {
  for (const m of materialCache.values()) { m.barkMat.dispose(); m.leafMat.dispose(); m.depthMat.dispose(); }
  materialCache.clear();
}

// ------------------------------------------------------------ prototypes ---

const xzRadius = (P) => { let r = 0; for (let i = 0; i < P.length; i += 3) { const d = P[i] * P[i] + P[i + 2] * P[i + 2]; if (d > r) r = d; } return Math.sqrt(r); };

/**
 * Grow one low poly tree. Returns what arbor.buildPrototype returns, plus
 * `bands` (near, mid, far, each `{ bark, leaf }`) and `style: 'lowpoly'`.
 * `bark` and `leaf` ARE the near band's geometries.
 */
export function buildLowPolyPrototype(speciesId, seed, opts = {}) {
  const sp = SPECIES[speciesId];
  if (!sp) throw new Error(`lowpoly_trees: no species '${speciesId}'`);
  const opt = { ...PROTO_DEFAULTS, ...opts };
  const plan = planTree(speciesId, sp, seed, opt);
  const bands = LOD_BANDS.map((_, i) => buildBand(plan, i, sp, opt));
  const near = bands[0];
  const mats = lowPolyMaterials(speciesId);
  let top = 0;
  const P = near.bark.attributes.position.array, LP = near.leaf.attributes.position.array;
  for (let i = 1; i < P.length; i += 3) if (P[i] > top) top = P[i];
  for (let i = 1; i < LP.length; i += 3) if (LP[i] > top) top = LP[i];
  const hasLeaves = near.leafTris > 0;
  return {
    bark: near.bark, leaf: near.leaf, barkMat: mats.barkMat, leafMat: mats.leafMat, depthMat: mats.depthMat,
    barkOrder: near.barkOrder,
    bands: bands.map((b) => ({ bark: b.bark, leaf: b.leafTris > 0 ? b.leaf : null })),
    bandTris: bands.map((b) => b.tris),
    height: top, grownHeight: plan.height, radius: plan.radius, detail: opt.detail,
    crownRadius: Math.max(xzRadius(P), xzRadius(LP)),
    hasLeaves,
    species: speciesId, seed: seed >>> 0,
    triangles: near.tris,
    axes: 1 + plan.branches,
    crownBaseY: plan.crownBottom, leavesDropped: 0, cappedAxes: false,
    style: 'lowpoly',
  };
}

/** Free a prototype's geometry. The materials are shared per species; see disposeLowPolyMaterials. */
export function disposeLowPolyPrototype(p) {
  for (const b of p.bands || []) { b.bark?.dispose(); b.leaf?.dispose(); }
}
