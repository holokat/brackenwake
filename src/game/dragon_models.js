// The dragon's body, at four ages, built in code.
//
// docs/mmo/14-KALDERA.md section 2 gives the four ages as four bodies: a cat on
// your shoulder, a large dog at your heel, a horse you ride, and a house. This
// file is those four silhouettes and nothing else. It knows no rules: the sizes
// it is asked for come from `stageBody(age)` in dragon.js, so there is one
// table of metres in the tree and this file reads it.
//
//   const model = buildDragon('drake');
//   scene.add(model.group);
//   model.setAnim('walk');
//   model.update(dt, speed);        // speed in m/s, which drives the gait
//   model.flap(0.6); model.openJaw(1);
//
// THE CONTRACT is the monster rig's, from `monster_models.js`: a `group` with
// the feet at y = 0 facing +z, a `parts` map of the named pieces, `setAnim`,
// `update(dt, speed)` and `dispose()`. `parts.root` is the one thing the poser
// leans, dips, lunges and topples, so `group.rotation.y` stays free for facing.
//
// PROPORTION IS THE AGE. A hatchling is not a small dragon: it is a head with a
// body behind it and wings too short to matter. A dragon is a neck and a wing
// span wider than it is long. PROPORTIONS below is the whole of that argument,
// as fractions of the nose to tail length, and `auditDragonModels()` measures
// every one of the four bodies at load rather than trusting the table.
//
// MATERIALS. Nothing here is a flat colour. Four generated families, made the
// same way weapon_models.js makes its own (a height field into an albedo, a
// packed roughness/metalness map and a normal map, as DataTextures, which is
// the one way to get a texture that is identical in the browser and in node):
//
//   scale      overlapping rows of rounded scales, the back and the flanks
//   belly      broad transverse plates, the underside and the throat
//   horn       keratin, streaked along its length: horns, claws, the spines
//   membrane   thin, veined, stretched: the wings
//
// TRIANGLES. Under 1,500 at the hatchling and under 6,000 at the dragon, which
// the audit measures and prints rather than promises.

import * as THREE from 'three';
import { countTriangles, disposeModel } from './weapon_models.js';
import { AGES, stageBody } from './dragon.js';

// ---------------------------------------------------------------- the noise
// Value noise on an integer lattice with fbm over it, deterministic from the
// seed. The same three lines weapon_models.js runs on, kept here so a dragon
// texture is not a hostage to a change made for a sword.

function h2(x, y, s) {
  let n = (x | 0) * 374761393 + (y | 0) * 668265263 + (s | 0) * 1274126177;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}
const smooth = (t) => t * t * (3 - 2 * t);

function vnoise(x, y, s, period) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const w = (v) => ((v % period) + period) % period;
  const x0 = w(xi), x1 = w(xi + 1), y0 = w(yi), y1 = w(yi + 1);
  const a = h2(x0, y0, s), b = h2(x1, y0, s), c = h2(x0, y1, s), d = h2(x1, y1, s);
  const u = smooth(xf), v = smooth(yf);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

function fbm(x, y, s, period, octaves = 4, gain = 0.5) {
  let sum = 0, amp = 1, norm = 0, f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * vnoise(x * f, y * f, s + i * 977, period * f);
    norm += amp;
    amp *= gain;
    f *= 2;
  }
  return sum / norm;
}

// ------------------------------------------------------------- the textures

/** 128 squared, four families, three maps each: about 780 KB and 60 ms, once. */
export const TEX_SIZE = 128;

/**
 * A family is (u, v) -> { l, r, m, h, tintG, tintB }, exactly as
 * weapon_models.js's are: `l` is a luminance MULTIPLIER on material.color and
 * so is stored linear, `r` and `m` modulate the material's own scalars, and
 * `h` is the height the normal map is differenced out of.
 */
export const FAMILIES = {
  // Overlapping rows of rounded scales, offset row to row, each one a little
  // domed and a little darker at its edge.
  scale(u, v) {
    const rows = 24;
    const ry = v * rows, row = Math.floor(ry), fy = ry - row;
    const rx = u * rows * 0.8 + (row % 2) * 0.5, fx = rx - Math.floor(rx);
    // a teardrop: wide across, tapering to the tail of the scale
    const d = Math.hypot((fx - 0.5) * 1.9, (fy - 0.42) * 2.2 * (fy > 0.42 ? 0.8 : 1.25));
    const dome = Math.max(0, 1 - d);
    const edge = Math.max(0, 1 - Math.abs(d - 0.92) * 7);
    const mottle = fbm(u * 9, v * 9, 17, 9, 3);
    const grain = fbm(u * 70, v * 70, 53, 70, 2);
    const l = 0.40 + dome * 0.34 + mottle * 0.20 + grain * 0.06 - edge * 0.16;
    return { l, tintG: 0.97, tintB: 0.88, r: 0.62 + (1 - dome) * 0.28 + mottle * 0.08, m: 0.10 + dome * 0.14, h: dome * 1.8 - edge * 1.1 + grain * 0.2 };
  },
  // The underside: broad transverse plates, smoother and paler than the back.
  belly(u, v) {
    const plates = 13;
    const py = v * plates, band = py - Math.floor(py);
    const ridge = Math.max(0, 1 - Math.abs(band - 0.5) * 2.4);
    const seam = Math.max(0, 1 - Math.abs(band) * 12) + Math.max(0, 1 - Math.abs(band - 1) * 12);
    const wear = fbm(u * 30, v * 14, 91, 30, 3);
    const l = 0.58 + ridge * 0.22 + wear * 0.14 - seam * 0.20;
    return { l, tintG: 0.98, tintB: 0.92, r: 0.70 + wear * 0.18, m: 0.06, h: ridge * 1.2 - seam * 1.6 + wear * 0.3 };
  },
  // Keratin: long streaks down the length, with growth rings across it.
  horn(u, v) {
    const streak = fbm(u * 130, v * 6, 7, 130, 3, 0.55);
    const rings = Math.abs(Math.sin(v * Math.PI * 22 + fbm(u * 4, v * 4, 31, 4, 2) * 2));
    const l = 0.46 + streak * 0.26 + rings * 0.14;
    return { l, tintG: 0.95, tintB: 0.82, r: 0.52 + streak * 0.24 + rings * 0.10, m: 0.04, h: streak * 1.1 + rings * 0.5 };
  },
  // Wing skin: thin, with a vein tree branching through it and a fine crease.
  membrane(u, v) {
    const vein = Math.max(0, 0.42 - Math.abs(fbm(u * 7, v * 3, 23, 7, 3) - 0.5) * 5.5);
    const fine = Math.max(0, 0.30 - Math.abs(fbm(u * 26, v * 12, 67, 26, 2) - 0.5) * 7);
    const crease = fbm(u * 40, v * 6, 83, 40, 2);
    const l = 0.52 + crease * 0.16 - vein * 0.30 - fine * 0.16;
    return { l, tintG: 0.86, tintB: 0.84, r: 0.80 + crease * 0.14, m: 0, h: -vein * 1.7 - fine * 0.8 + crease * 0.4 };
  },
};
FAMILIES.scale.strength = 2.6;
FAMILIES.belly.strength = 1.6;
FAMILIES.horn.strength = 1.8;
FAMILIES.membrane.strength = 2.0;

const TEX_CACHE = new Map();

function dataTexture(size, bytes) {
  const t = new THREE.DataTexture(bytes, size, size, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

/** The three maps of one family, cached: every dragon shares one set. */
export function textureSet(name, repeat = 1) {
  const key = repeat === 1 ? name : `${name}@${repeat}`;
  const hit = TEX_CACHE.get(key);
  if (hit) return hit;
  if (repeat !== 1) {
    const base = textureSet(name, 1);
    const set = {};
    for (const k of Object.keys(base)) {
      const t = base[k].clone();
      t.repeat.set(repeat, repeat);
      t.needsUpdate = true;
      set[k] = t;
    }
    TEX_CACHE.set(key, set);
    return set;
  }
  const fn = FAMILIES[name];
  if (!fn) throw new Error(`dragon_models: no texture family "${name}"`);
  const n = TEX_SIZE;
  const alb = new Uint8Array(n * n * 4);
  const orm = new Uint8Array(n * n * 4);
  const hgt = new Float32Array(n * n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      const s = fn(x / n, y / n);
      const l = Math.max(0, Math.min(1, s.l));
      alb[i * 4] = (l * 255) | 0;
      alb[i * 4 + 1] = (l * (s.tintG == null ? 1 : s.tintG) * 255) | 0;
      alb[i * 4 + 2] = (l * (s.tintB == null ? 1 : s.tintB) * 255) | 0;
      alb[i * 4 + 3] = 255;
      orm[i * 4] = 255;
      orm[i * 4 + 1] = (Math.max(0, Math.min(1, s.r)) * 255) | 0;
      orm[i * 4 + 2] = (Math.max(0, Math.min(1, s.m || 0)) * 255) | 0;
      orm[i * 4 + 3] = 255;
      hgt[i] = s.h;
    }
  }
  const nrm = new Uint8Array(n * n * 4);
  const at = (x, y) => hgt[(((y % n) + n) % n) * n + (((x % n) + n) % n)];
  const strength = fn.strength == null ? 2.2 : fn.strength;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(-dx, -dy, 1);
      const i = (y * n + x) * 4;
      nrm[i] = (((-dx / len) * 0.5 + 0.5) * 255) | 0;
      nrm[i + 1] = (((-dy / len) * 0.5 + 0.5) * 255) | 0;
      nrm[i + 2] = (((1 / len) * 0.5 + 0.5) * 255) | 0;
      nrm[i + 3] = 255;
    }
  }
  const set = { map: dataTexture(n, alb), ormMap: dataTexture(n, orm), normalMap: dataTexture(n, nrm) };
  TEX_CACHE.set(key, set);
  return set;
}

const MAT_CACHE = new Map();

/** A physically based material over one of the four families. Cached by look. */
export function pbr(family, colour, o = {}) {
  const key = `${family}|${colour}|${o.rough ?? ''}|${o.metal ?? ''}|${o.repeat ?? ''}|${o.side ?? ''}`
    + `|${o.emissive ?? ''}|${o.emissiveIntensity ?? ''}|${o.opacity ?? ''}|${o.normalScale ?? ''}`;
  const hit = MAT_CACHE.get(key);
  if (hit) return hit;
  const t = textureSet(family, o.repeat || 1);
  const m = new THREE.MeshPhysicalMaterial({
    color: colour,
    map: t.map,
    roughnessMap: t.ormMap,
    metalnessMap: t.ormMap,
    normalMap: t.normalMap,
    roughness: o.rough == null ? 1 : o.rough,
    metalness: o.metal == null ? 1 : o.metal,
    side: o.side == null ? THREE.FrontSide : o.side,
  });
  m.normalScale = new THREE.Vector2(o.normalScale ?? 1, o.normalScale ?? 1);
  if (o.opacity != null && o.opacity < 1) { m.transparent = true; m.opacity = o.opacity; m.depthWrite = false; }
  if (o.emissive != null) { m.emissive = new THREE.Color(o.emissive); m.emissiveIntensity = o.emissiveIntensity ?? 1; }
  if (o.sheen) { m.sheen = o.sheen; m.sheenColor = new THREE.Color(0xffd27a); m.sheenRoughness = 0.5; }
  MAT_CACHE.set(key, m);
  return m;
}

// ------------------------------------------------------------- the palettes
//
// The colour is the age, and it darkens as it grows: a green bronze hatchling,
// a deeper bronze drake, a young dragon going to iron with gold under it, and a
// dragon almost black with the gold coming through. The eye is the same gold at
// every age, because the eye is what tells you it is the same animal.

export const PALETTE = {
  hatchling: { hide: 0x6f8f52, belly: 0xc9c089, horn: 0xbfae86, wing: 0x8f7a55 },
  drake: { hide: 0x5c7a48, belly: 0xb7ac7c, horn: 0xa89871, wing: 0x7d6a4a },
  young: { hide: 0x3f5540, belly: 0x9a8f66, horn: 0x8e7f5e, wing: 0x64553c },
  dragon: { hide: 0x27332c, belly: 0x7d7352, horn: 0x746848, wing: 0x4c4030 },
};
/** The eye, at every age. Emissive, so it is the one thing lit from inside. */
export const EYE_GOLD = 0xffc23a;

// ----------------------------------------------------------- the proportions
//
// Fractions of the nose to tail length, which is `stageBody(age).length`. The
// four rows are the four bodies of 14-KALDERA.md section 2, and each row's
// tail, body, neck and head sum to 1 (the audit checks that, so a proportion
// edited without its neighbour is caught rather than shipped as a stretched
// animal).
//
//   hatchling  a quarter of it is head, and the wings are shorter than it is
//   drake      a dog: even, low, the wings finally longer than the body
//   young      a horse: the neck arrives, the wings go past the body's length
//   dragon     a house: neck and tail are two thirds of it, and the wings are
//              wider than the whole animal is long
//
// There is no `shoulder` ratio: the shoulder is wherever the legs put it, so
// that the feet come out at y = 0 at every age. See buildDragon.

export const PROPORTIONS = {
  hatchling: { tail: 0.30, body: 0.36, neck: 0.10, head: 0.24, girth: 0.30, legs: 0.26, wingSpan: 0.80, spikes: 4, prof: 6, rings: { tail: 5, body: 6, neck: 4, head: 4 } },
  drake: { tail: 0.36, body: 0.36, neck: 0.14, head: 0.14, girth: 0.24, legs: 0.30, wingSpan: 1.25, spikes: 7, prof: 10, rings: { tail: 8, body: 7, neck: 6, head: 5 } },
  young: { tail: 0.40, body: 0.32, neck: 0.19, head: 0.09, girth: 0.21, legs: 0.34, wingSpan: 1.45, spikes: 9, prof: 14, rings: { tail: 10, body: 8, neck: 8, head: 5 } },
  dragon: { tail: 0.42, body: 0.28, neck: 0.23, head: 0.07, girth: 0.19, legs: 0.36, wingSpan: 1.30, spikes: 11, prof: 16, rings: { tail: 12, body: 9, neck: 10, head: 6 } },
};

// ---------------------------------------------------------------- the geometry
//
// One builder, `tube`, does the body, the tail, the neck, the skull, the jaw,
// every leg bone, every horn and every spine: a closed ring profile swept along
// a spine of { z, y, r } stations, with the ring squashed by `flat` so a belly
// can be wider than it is deep. It runs along +z because that is the way the
// rig faces, which saves every caller a rotation it would have to remember.

/** A closed ring of `n` points on the unit circle, wound counter clockwise. */
function ring(n) {
  const p = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    p.push([Math.cos(a), Math.sin(a)]);
    }
  return p;
}

/**
 * Sweep a ring along a spine.
 *
 * @param prof   how many points the ring has
 * @param spine  [{ z, y, r, flat?, dx? }, ...] nose last, tail first
 * @returns THREE.BufferGeometry with position, normal and uv
 */
export function tube(prof, spine, opts = {}) {
  const P = ring(prof);
  const n = P.length, m = spine.length;
  const pos = [], uv = [], idx = [];
  for (let j = 0; j < m; j++) {
    const s = spine[j];
    const flat = s.flat == null ? 1 : s.flat;
    for (let i = 0; i <= n; i++) {
      const p = P[i % n];
      pos.push(p[0] * s.r * flat + (s.dx || 0), p[1] * s.r + s.y, s.z);
      uv.push(i / n, j / (m - 1));
    }
  }
  for (let j = 0; j < m - 1; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i, b = a + 1, c = a + n + 1, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const cap = (j, front) => {
    const s = spine[j];
    const flat = s.flat == null ? 1 : s.flat;
    const centre = pos.length / 3;
    pos.push(s.dx || 0, s.y, s.z);
    uv.push(0.5, 0.5);
    const first = pos.length / 3;
    for (let i = 0; i < n; i++) {
      const p = P[i];
      pos.push(p[0] * s.r * flat + (s.dx || 0), p[1] * s.r + s.y, s.z);
      uv.push(0.5 + p[0] * 0.5, 0.5 + p[1] * 0.5);
    }
    for (let i = 0; i < n; i++) {
      const a = first + i, b = first + ((i + 1) % n);
      if (front) idx.push(centre, a, b); else idx.push(centre, b, a);
    }
  };
  if (opts.capBack !== false) cap(0, false);
  if (opts.capFront !== false) cap(m - 1, true);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** A mesh with shadows on, which is every mesh in this file. */
function mesh(geometry, material, name) {
  const o = new THREE.Mesh(geometry, material);
  o.castShadow = true;
  o.receiveShadow = true;
  if (name) o.name = name;
  return o;
}

/**
 * One wing: a membrane stretched over four fingers, with the fingers as struts.
 * The membrane is one double sided plane, built as a fan from the shoulder out,
 * so a wing costs eight triangles of skin and four thin bones.
 */
function buildWing(side, span, chord, mats) {
  const g = new THREE.Group();
  g.name = side < 0 ? 'wingL' : 'wingR';
  // finger tips, out along x and back along -z, longest in the middle
  const fingers = [
    { x: 0.40, z: 0.10, y: 0.10 },
    { x: 0.78, z: -0.06, y: 0.06 },
    { x: 1.00, z: -0.34, y: -0.02 },
    { x: 0.82, z: -0.68, y: -0.10 },
    { x: 0.44, z: -0.86, y: -0.16 },
  ].map((f) => ({ x: f.x * span * side, y: f.y * chord, z: f.z * span }));

  const pos = [], uv = [], idx = [];
  pos.push(0, 0, 0); uv.push(0.5, 0);
  fingers.forEach((f, i) => { pos.push(f.x, f.y, f.z); uv.push(i / (fingers.length - 1), 1); });
  for (let i = 1; i < fingers.length; i++) {
    if (side < 0) idx.push(0, i, i + 1); else idx.push(0, i + 1, i);
  }
  const mg = new THREE.BufferGeometry();
  mg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  mg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  mg.setIndex(idx);
  mg.computeVertexNormals();
  const membrane = mesh(mg, mats.membrane, 'membrane');
  membrane.castShadow = false;                 // a shadow off a one sided sheet reads as a hole
  g.add(membrane);

  // the bones: a thin tapered tube from the shoulder to each finger tip
  const bones = [];
  for (const f of fingers) {
    const len = Math.hypot(f.x, f.y, f.z);
    const b = mesh(tube(4, [
      { z: 0, y: 0, r: chord * 0.055 },
      { z: len * 0.55, y: 0, r: chord * 0.035 },
      { z: len, y: 0, r: chord * 0.012 },
    ]), mats.horn, 'strut');
    b.lookAt(f.x, f.y, f.z);
    g.add(b);
    bones.push(b);
  }
  g.userData.bones = bones;
  g.userData.membrane = membrane;
  return g;
}

/** One leg: thigh, shin and a foot, pivoting at the hip so a rotation is a stride. */
function buildLeg(name, len, girth, mats) {
  const g = new THREE.Group();
  g.name = name;
  const upper = mesh(tube(5, [
    { z: 0, y: 0, r: girth * 1.05 },
    { z: 0, y: -len * 0.28, r: girth * 0.80 },
    { z: 0, y: -len * 0.52, r: girth * 0.62 },
  ], { capFront: false }), mats.hide, 'upper');
  g.add(upper);
  const knee = new THREE.Group();
  knee.position.y = -len * 0.52;
  knee.name = `${name}Knee`;
  const lower = mesh(tube(5, [
    { z: 0, y: 0, r: girth * 0.60 },
    { z: 0, y: -len * 0.44, r: girth * 0.42 },
  ]), mats.hide, 'lower');
  knee.add(lower);
  const foot = mesh(tube(4, [
    { z: -girth * 0.5, y: 0, r: girth * 0.42, flat: 1.4 },
    { z: girth * 1.5, y: 0, r: girth * 0.30, flat: 1.6 },
  ]), mats.horn, 'foot');
  foot.position.y = -len * 0.46;
  knee.add(foot);
  g.add(knee);
  g.userData.knee = knee;
  return g;
}

/**
 * A dragon of the given age.
 *
 * The length is `stageBody(age).length`, in metres, and the built body really
 * measures it: `model.length` and `model.height` are taken off the bounding box
 * after the fact, not copied off the table.
 */
export function buildDragon(age = 'hatchling') {
  const stage = stageBody(age);
  const P = PROPORTIONS[stage.age] || PROPORTIONS.hatchling;
  const pal = PALETTE[stage.age] || PALETTE.hatchling;
  const L = stage.length;

  const mats = {
    hide: pbr('scale', pal.hide, { rough: 0.92, metal: 0.35, repeat: Math.max(1, Math.round(L)) }),
    belly: pbr('belly', pal.belly, { rough: 0.88, metal: 0.10, repeat: Math.max(1, Math.round(L * 0.8)) }),
    horn: pbr('horn', pal.horn, { rough: 0.70, metal: 0.10, repeat: 2 }),
    membrane: pbr('membrane', pal.wing, { rough: 0.86, metal: 0, side: THREE.DoubleSide, opacity: 0.78, normalScale: 0.6 }),
    eye: pbr('horn', EYE_GOLD, { rough: 0.25, metal: 0.2, emissive: EYE_GOLD, emissiveIntensity: 1.6 }),
  };

  const girth = L * P.girth * 0.5;            // half the body's depth at the chest
  const legLen = L * P.legs;
  const legGirth = girth * 0.38;
  // THE SHOULDER IS WHERE THE LEGS PUT IT. It was a ratio of its own at first,
  // and the two numbers disagreed: a hatchling floated three centimetres off
  // the ground and a dragon's feet were buried half a metre in it. The drop is
  // the hip's own offset, the thigh, the shin and the foot's thickness, which
  // is the same arithmetic buildLeg lays the bones out with.
  const shoulderY = girth * 0.34 + legLen * 0.98 + legGirth * 0.42;
  const tailL = L * P.tail, bodyL = L * P.body, neckL = L * P.neck, headL = L * P.head;

  const group = new THREE.Group();
  group.name = `dragon:${stage.age}`;
  const root = new THREE.Group();
  root.name = 'root';
  root.position.y = shoulderY;
  group.add(root);

  // ---- the barrel: hips at -bodyL/2, shoulders at +bodyL/2 -----------------
  const body = mesh(tube(P.prof, [
    { z: -bodyL * 0.5, y: 0, r: girth * 0.82, flat: 1.05 },
    { z: -bodyL * 0.18, y: girth * 0.05, r: girth * 1.00, flat: 1.10 },
    { z: bodyL * 0.16, y: girth * 0.04, r: girth * 0.98, flat: 1.12 },
    { z: bodyL * 0.5, y: 0, r: girth * 0.78, flat: 1.02 },
  ], { capBack: false, capFront: false }), mats.hide, 'body');
  root.add(body);

  // the belly is its own shell so the underside is plated rather than scaled
  const belly = mesh(tube(P.prof, [
    { z: -bodyL * 0.46, y: -girth * 0.30, r: girth * 0.58, flat: 1.25 },
    { z: 0, y: -girth * 0.34, r: girth * 0.70, flat: 1.30 },
    { z: bodyL * 0.46, y: -girth * 0.30, r: girth * 0.56, flat: 1.22 },
  ]), mats.belly, 'belly');
  root.add(belly);

  // ---- the tail ------------------------------------------------------------
  const tailPivot = new THREE.Group();
  tailPivot.name = 'tail';
  tailPivot.position.z = -bodyL * 0.5;
  const tailSpine = [];
  for (let i = 0; i <= P.rings.tail; i++) {
    const t = i / P.rings.tail;
    tailSpine.unshift({ z: -tailL * t, y: girth * 0.10 * t * t, r: girth * 0.80 * Math.pow(1 - t, 0.85) + girth * 0.03 });
  }
  const tail = mesh(tube(P.prof - 2, tailSpine), mats.hide, 'tailMesh');
  tailPivot.add(tail);
  root.add(tailPivot);

  // ---- the neck and the head ----------------------------------------------
  const neckPivot = new THREE.Group();
  neckPivot.name = 'neck';
  neckPivot.position.z = bodyL * 0.5;
  const neckSpine = [];
  for (let i = 0; i <= P.rings.neck; i++) {
    const t = i / P.rings.neck;
    neckSpine.push({ z: neckL * t, y: girth * 0.55 * Math.sin(t * Math.PI * 0.55), r: girth * (0.72 - 0.30 * t) });
  }
  const neck = mesh(tube(P.prof - 2, neckSpine), mats.hide, 'neckMesh');
  neckPivot.add(neck);

  const headPivot = new THREE.Group();
  headPivot.name = 'head';
  const last = neckSpine[neckSpine.length - 1];
  headPivot.position.set(0, last.y, last.z);
  neckPivot.add(headPivot);

  const headR = girth * (stage.age === 'hatchling' ? 0.78 : 0.52);
  const skull = mesh(tube(P.prof - 2, [
    { z: -headL * 0.22, y: 0, r: headR * 0.78, flat: 1.0 },
    { z: 0, y: headL * 0.04, r: headR, flat: 1.06 },
    { z: headL * 0.42, y: headL * 0.02, r: headR * 0.72, flat: 0.94 },
    { z: headL * 0.78, y: -headL * 0.04, r: headR * 0.40, flat: 0.90 },
  ]), mats.hide, 'skull');
  headPivot.add(skull);

  const jaw = new THREE.Group();
  jaw.name = 'jaw';
  jaw.position.set(0, -headR * 0.30, -headL * 0.10);
  const jawMesh = mesh(tube(4, [
    { z: 0, y: 0, r: headR * 0.50, flat: 1.1 },
    { z: headL * 0.50, y: -headL * 0.02, r: headR * 0.34, flat: 1.0 },
    { z: headL * 0.86, y: -headL * 0.06, r: headR * 0.16, flat: 0.9 },
  ]), mats.belly, 'jawMesh');
  jaw.add(jawMesh);
  headPivot.add(jaw);

  const horns = [];
  for (const s of [-1, 1]) {
    const h = mesh(tube(4, [
      { z: 0, y: 0, r: headR * 0.20 },
      { z: -headL * 0.34, y: headL * 0.30, r: headR * 0.12 },
      { z: -headL * 0.62, y: headL * 0.52, r: headR * 0.03 },
    ]), mats.horn, s < 0 ? 'hornL' : 'hornR');
    h.position.set(s * headR * 0.52, headR * 0.52, -headL * 0.02);
    headPivot.add(h);
    horns.push(h);
  }

  const eyes = [];
  for (const s of [-1, 1]) {
    const e = mesh(new THREE.SphereGeometry(headR * 0.19, 6, 4), mats.eye, s < 0 ? 'eyeL' : 'eyeR');
    e.castShadow = false;
    e.position.set(s * headR * 0.66, headR * 0.30, headL * 0.16);
    headPivot.add(e);
    eyes.push(e);
  }
  root.add(neckPivot);

  // ---- the spines down the back -------------------------------------------
  const spikes = [];
  for (let i = 0; i < P.spikes; i++) {
    const t = i / (P.spikes - 1 || 1);
    const k = Math.sin(Math.PI * (0.18 + t * 0.72));
    const sp = mesh(tube(3, [
      { z: 0, y: 0, r: girth * 0.10 * k },
      { z: -girth * 0.24 * k, y: girth * 0.42 * k, r: girth * 0.012 },
    ]), mats.horn, 'spike');
    sp.position.set(0, girth * 0.92, -bodyL * 0.46 + bodyL * 0.92 * t);
    root.add(sp);
    spikes.push(sp);
  }

  // ---- the wings, on the shoulders ----------------------------------------
  const wingSpan = L * P.wingSpan * 0.5;      // half span: one wing's reach
  const wings = [];
  for (const s of [-1, 1]) {
    const w = buildWing(s, wingSpan, girth, mats);
    w.position.set(s * girth * 0.72, girth * 0.52, bodyL * 0.22);
    root.add(w);
    wings.push(w);
  }

  // ---- four legs -----------------------------------------------------------
  const legs = [];
  const legNames = ['legFL', 'legFR', 'legBL', 'legBR'];
  let li = 0;
  for (const z of [bodyL * 0.34, -bodyL * 0.34]) {
    for (const s of [-1, 1]) {
      const leg = buildLeg(legNames[li++], legLen, legGirth, mats);
      leg.position.set(s * girth * 0.80, -girth * 0.34, z);
      root.add(leg);
      legs.push(leg);
    }
  }
  // legs[] is front left, front right, back left, back right, which is the
  // order the diagonal pairs in the gait below are written against
  const [legFL, legFR, legBL, legBR] = legs;

  const parts = {
    root, body, belly, tail: tailPivot, tailMesh: tail,
    neck: neckPivot, neckMesh: neck, head: headPivot, skull, jaw, jawMesh,
    hornL: horns[0], hornR: horns[1], horns,
    eyeL: eyes[0], eyeR: eyes[1], eyes,
    wingL: wings[0], wingR: wings[1], wings,
    legFL, legFR, legBL, legBR, legs, spikes,
  };

  // ---- the poser -----------------------------------------------------------
  //
  // Idle is a breath: the barrel swells and the wings sit folded. Walking is a
  // bob with the legs in diagonal pairs and the tail counterswinging, and the
  // gait's phase is advanced by DISTANCE TRAVELLED, as everything else in the
  // game does it, so a hungry dragon at half speed takes half as many strides
  // rather than moonwalking. A swing is a lunge: the whole root comes forward
  // and the jaw opens on it. A fall rolls it onto its side and leaves it there.

  const state = { t: 0, phase: 0, anim: 'idle', locomotion: 'idle', oneShot: null, oneShotT: 0, fallT: 0, speed: 0, flap: 0, jaw: 0 };
  const stride = Math.max(0.4, L * 0.55);
  const SWING_SECONDS = 0.5, HURT_SECONDS = 0.25, FALL_SECONDS = 0.9;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  function setAnim(name) {
    if (name === state.anim) return;
    if (name === 'fall') { state.anim = 'fall'; state.oneShot = null; state.fallT = 0; return; }
    if (state.anim === 'fall' && name !== 'wake') return;       // it is down until it is woken
    if (name === 'wake') { state.anim = state.locomotion; state.fallT = 0; return; }
    if (name === 'swing' || name === 'hurt') { state.oneShot = name; state.oneShotT = 0; state.anim = name; return; }
    state.locomotion = name;
    state.anim = name;
  }

  function pose() {
    if (state.anim === 'fall') {
      const p = clamp(state.fallT / FALL_SECONDS, 0, 1);
      const e = 1 - Math.pow(1 - p, 3);
      root.rotation.z = e * Math.PI * 0.5;
      root.rotation.x = 0;
      root.position.y = shoulderY - e * shoulderY * 0.62;
      for (const l of legs) { l.rotation.x = e * 0.5; l.userData.knee.rotation.x = -e * 0.9; }
      for (const w of wings) w.rotation.z = 0;
      neckPivot.rotation.x = e * 0.55;
      jaw.rotation.x = 0;
      return;
    }
    root.rotation.z = 0;
    root.position.y = shoulderY;

    const moving = state.speed > 0.15;
    const swing = Math.sin(state.phase);
    const amp = moving ? 0.5 : 0;
    // diagonal pairs: front left with back right
    const off = [0, Math.PI, Math.PI, 0];
    for (let i = 0; i < legs.length; i++) {
      const a = Math.sin(state.phase + off[i]) * amp;
      legs[i].rotation.x = a;
      legs[i].userData.knee.rotation.x = -Math.max(0, a) * 0.7;
    }

    // the breath: the barrel and the belly swell, and only when it is standing
    const breath = moving ? 0 : Math.sin(state.t * 1.25);
    const bs = 1 + breath * 0.035;
    body.scale.set(bs, bs, 1);
    belly.scale.set(1 + breath * 0.02, 1 + breath * 0.045, 1);

    root.position.y += (moving ? Math.abs(swing) * girth * 0.10 : breath * girth * 0.02);
    tailPivot.rotation.y = (moving ? -swing * 0.22 : Math.sin(state.t * 0.7) * 0.10);
    tailPivot.rotation.x = Math.sin(state.t * 0.5) * 0.05;
    neckPivot.rotation.x = (moving ? -0.06 : 0) + Math.sin(state.t * 0.8) * 0.035;
    headPivot.rotation.x = Math.sin(state.t * 0.9 + 1) * 0.05;
    headPivot.rotation.y = moving ? 0 : Math.sin(state.t * 0.42) * 0.16;

    // The wings. Folded they SWEEP BACK along the flanks, which is a rotation
    // about y, and they lift a little off the shoulder, which is a small one
    // about z. Getting those two the wrong way round stood a seven metre
    // dragon's wings straight up in the air and made it taller than it was
    // long: the bounding box in the audit is what caught it.
    const beat = state.flap + (moving ? 0.18 + Math.abs(Math.sin(state.t * 5)) * 0.22 : 0);
    const open = clamp(beat, 0, 1);
    const fold = 1 - open;
    wings[0].rotation.y = -1.35 * fold;
    wings[1].rotation.y = 1.35 * fold;
    wings[0].rotation.z = -0.12 - fold * 0.30 + open * 0.45;
    wings[1].rotation.z = 0.12 + fold * 0.30 - open * 0.45;

    jaw.rotation.x = state.jaw * 0.55;

    if (state.oneShot === 'swing') {
      const p = clamp(state.oneShotT / SWING_SECONDS, 0, 1);
      const lunge = Math.sin(p * Math.PI);
      root.position.z = lunge * L * 0.14;
      neckPivot.rotation.x = -lunge * 0.45;
      jaw.rotation.x = Math.max(state.jaw * 0.55, lunge * 0.8);
      root.rotation.x = -lunge * 0.12;
    } else if (state.oneShot === 'hurt') {
      const p = clamp(state.oneShotT / HURT_SECONDS, 0, 1);
      root.rotation.x = -Math.sin(p * Math.PI) * 0.22;
      root.position.z = 0;
    } else {
      root.rotation.x = 0;
      root.position.z = 0;
    }
  }

  const api = {
    group, parts,
    age: stage.age,
    /** Measured off the built body, not copied off the table. */
    length: 0, height: 0, width: 0,
    radius: Math.max(girth * 1.1, L * 0.12),
    setAnim,
    get anim() { return state.anim; },
    get down() { return state.anim === 'fall'; },
    /** 0 folded, 1 spread. The Bond and Wyrmsoul work will drive this. */
    flap(k) { state.flap = clamp(Number.isFinite(k) ? k : 0, 0, 1); },
    /** 0 shut, 1 wide. */
    openJaw(k) { state.jaw = clamp(Number.isFinite(k) ? k : 0, 0, 1); },
    update(dt, speed = 0) {
      const d = clamp(Number.isFinite(dt) ? dt : 0, 0, 0.1);
      state.t += d;
      state.speed = Math.max(0, Number.isFinite(speed) ? speed : 0);
      state.phase = (state.phase + (state.speed * d / stride) * Math.PI * 2) % (Math.PI * 2e6);
      if (state.anim === 'fall') { state.fallT += d; pose(); return; }
      if (state.oneShot) {
        state.oneShotT += d;
        if (state.oneShotT >= (state.oneShot === 'swing' ? SWING_SECONDS : HURT_SECONDS)) {
          state.oneShot = null;
          state.anim = state.locomotion;
        }
      }
      pose();
    },
    triangles: 0,
    dispose() { disposeModel(group); },
  };

  // ---- the measurements, taken off the built body --------------------------
  //
  // Nose to tail and standing height are measured with the WINGS OFF, because a
  // folded wing lies back past the tail and a spread one is half the animal
  // again: with them in, "how long is a dragon" answers "as long as its wings
  // are folded", which is not a size anybody means. The span is measured with
  // them spread, which is the only pose in which a span means anything.
  pose();
  for (const w of wings) root.remove(w);
  const bare = new THREE.Box3().setFromObject(group);
  api.length = bare.max.z - bare.min.z;
  api.height = bare.max.y - bare.min.y;
  for (const w of wings) root.add(w);
  api.flap(1);
  pose();
  const spread = new THREE.Box3().setFromObject(group);
  api.width = spread.max.x - spread.min.x;
  api.flap(0);
  pose();
  api.triangles = countTriangles(group);
  return api;
}

// ------------------------------------------------------------------- the audit

/** The budgets this file is held to. Measured at import, not promised. */
export const TRIANGLE_BUDGET = { hatchling: 1500, drake: 6000, young: 6000, dragon: 6000 };

/** Every part the system and the windows reach for by name. */
export const REQUIRED_PARTS = [
  'root', 'body', 'belly', 'tail', 'neck', 'head', 'skull', 'jaw',
  'hornL', 'hornR', 'eyeL', 'eyeR', 'wingL', 'wingR', 'wings',
  'legFL', 'legFR', 'legBL', 'legBR', 'legs',
];

/**
 * Builds all four bodies at load and measures them: the triangles against the
 * budget, the parts against the names the rest of the tree uses, the length
 * against `stageBody`, and the proportion rows against each other. A fifth age
 * added without a row here fails at import rather than shipping invisible.
 */
export function auditDragonModels() {
  const bad = [];
  const report = {};
  for (const age of AGES) {
    if (!PROPORTIONS[age]) { bad.push(`${age} has no proportion row`); continue; }
    if (!PALETTE[age]) { bad.push(`${age} has no palette`); continue; }
    const P = PROPORTIONS[age];
    const sum = P.tail + P.body + P.neck + P.head;
    if (Math.abs(sum - 1) > 1e-6) bad.push(`${age}'s tail, body, neck and head sum to ${sum.toFixed(3)} and not 1`);
  }
  for (const age of Object.keys(PROPORTIONS)) if (!AGES.includes(age)) bad.push(`a proportion row for "${age}", which is not an age`);
  if (bad.length) throw new Error(`dragon_models: ${bad.join('; ')}`);

  for (const age of AGES) {
    let m = null;
    try { m = buildDragon(age); } catch (e) { bad.push(`${age} threw while building: ${e.message}`); continue; }
    const stage = stageBody(age);
    const budget = TRIANGLE_BUDGET[age];
    if (m.triangles > budget) bad.push(`${age} is ${m.triangles} triangles, over the ${budget} budget`);
    for (const p of REQUIRED_PARTS) if (!m.parts[p]) bad.push(`${age} has no part called "${p}"`);
    if (Math.abs(m.length - stage.length) > stage.length * 0.08) {
      bad.push(`${age} measures ${m.length.toFixed(2)} m nose to tail and stageBody says ${stage.length} m`);
    }
    if (m.height <= 0 || m.width <= 0) bad.push(`${age} has no height or no width`);
    // stageBody's `height` is what the rest of the game sits the body at (the
    // hatchling rides at it). A table that drifts from the built animal is a
    // dragon standing in the ground or floating over it.
    if (Math.abs(m.height - stage.height) > stage.height * 0.15) {
      bad.push(`${age} stands ${m.height.toFixed(2)} m and stageBody says ${stage.height} m`);
    }
    report[age] = {
      triangles: m.triangles,
      length: Math.round(m.length * 100) / 100,
      height: Math.round(m.height * 100) / 100,
      span: Math.round(m.width * 100) / 100,
    };
    m.dispose();
  }
  // the shape of the ladder: each body is longer than the one before it, and
  // the dragon's wings really are wider than it is long
  for (let i = 1; i < AGES.length; i++) {
    const a = report[AGES[i - 1]], b = report[AGES[i]];
    if (a && b && b.length <= a.length) bad.push(`a ${AGES[i]} is not longer than a ${AGES[i - 1]}`);
  }
  if (report.dragon && report.dragon.span <= report.dragon.length) {
    bad.push(`the dragon's wings span ${report.dragon.span} m and it is ${report.dragon.length} m long; the wings are meant to be wider`);
  }
  if (bad.length) throw new Error(`auditDragonModels: ${bad.length} problem(s)\n  ${bad.join('\n  ')}`);
  return report;
}

auditDragonModels();
