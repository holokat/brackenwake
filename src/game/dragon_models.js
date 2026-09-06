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
//
// THE HATCHLING HAS A STUDIO BODY NOW. public/models/mmo/dragon-hatchling.glb
// is a textured, skinned hatchling with sixteen clips baked into it, and when
// that file is in the cache `buildDragon('hatchling')` hands back THAT body
// behind the same contract, through `buildGlbDragon` at the foot of this file.
// The other three ages are still built here in code, and so is the hatchling
// until the file lands. See docs/mmo/wiring/DR2-STUDIO-DRAGON.md.

import * as THREE from 'three';
import { countTriangles, disposeModel } from './weapon_models.js';
import { AGES, stageBody, LAND_MS, AIR_ANIMS, OVERLAY_ANIMS } from './dragon.js';
import {
  instantiate, isLoaded, loadModel, clipDuration, clipsFor, modelBounds, modelTriangles,
} from './models.js';

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
const num0 = (v) => (Number.isFinite(v) ? v : 0);

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
 * A hatchling is the studio body when `dragon-hatchling.glb` is in the cache
 * and the one built here when it is not. Everything else is built here. Both
 * answer the same contract, so no caller has to know which it got; `model.made`
 * says, for anyone reporting on it.
 *
 * The length is `stageBody(age).length`, in metres, and the built body really
 * measures it: `model.length` and `model.height` are taken off the bounding box
 * after the fact, not copied off the table.
 */
export function buildDragon(age = 'hatchling') {
  if (stageBody(age).age === GLB_AGE && isLoaded(DRAGON_MODEL_ID)) {
    try { return buildGlbDragon(age); } catch (err) {
      console.warn('dragon_models: the studio hatchling would not build, using the code body', err);
    }
  }
  return buildCodeDragon(age);
}

/**
 * A state the studio hatchling has a clip for, against the nearest thing a
 * code body can actually do. Perching, flying and gliding all read as standing
 * still on a body with no clip for any of them; a breath is a lunge with the
 * jaw open, which is what the code body's swing already is; resting is
 * standing, because `fall` is a latch and would leave it down for ever.
 */
export const CODE_ANIM_ALIAS = {
  perch: 'idle', fly: 'idle', glide: 'idle', land: 'idle', rest: 'idle', cast: 'swing',
};

/**
 * A dragon of the given age, built here in code. The four silhouettes.
 */
export function buildCodeDragon(age = 'hatchling') {
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

  function setAnim(want) {
    // The studio hatchling has states this body has no pose for. Rather than
    // let one through and stand there in a locomotion state called 'fly',
    // which would look exactly like standing still and be impossible to tell
    // from a bug, each of them is named against the nearest thing this body
    // really does. See CODE_ANIM_ALIAS.
    const name = CODE_ANIM_ALIAS[want] || want;
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
    /** Which of the two bodies this is, for anything reporting on it. */
    made: 'code',
    /** Measured off the built body, not copied off the table. */
    length: 0, height: 0, width: 0,
    radius: Math.max(girth * 1.1, L * 0.12),
    setAnim,
    /**
     * Seat the body on a carried anchor. This body has no perch socket of its
     * own, so it sits at the offset `stageBody` gives, which is where the ride
     * has always put it. The studio body overrides this and puts its own
     * socket_perch on the shoulder instead.
     * @returns the seat, in the anchor's own frame
     */
    mountOn(anchor, shoulder, offset) {
      const o = offset || { x: 0, y: 0, z: 0 };
      group.position.set(num0(o.x), num0(o.y), num0(o.z));
      return { x: group.position.x, y: group.position.y, z: group.position.z };
    },
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
 * Builds all four CODE bodies at load and measures them: the triangles against
 * the budget, the parts against the names the rest of the tree uses, the length
 * against `stageBody`, and the proportion rows against each other. A fifth age
 * added without a row here fails at import rather than shipping invisible.
 *
 * It builds `buildCodeDragon` and not `buildDragon` on purpose. This audit is
 * the four silhouettes holding themselves to their own table, and it runs at
 * import, when no glb has loaded; going through the dispatcher would mean the
 * same call audited a different thing depending on what happened to be in the
 * cache. The studio body has its own audit, `auditGlbDragon`, which needs the
 * file and so cannot run at import.
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
    try { m = buildCodeDragon(age); } catch (e) { bad.push(`${age} threw while building: ${e.message}`); continue; }
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

// ===========================================================================
// The studio hatchling
// ===========================================================================
//
// public/models/mmo/dragon-hatchling.glb: 17,342 triangles, one texture, 97
// joints, six attachment sockets, blink morphs, and sixteen clips baked in. It
// is a whole animal rather than four tubes, and when it is in the cache it is
// the hatchling the player gets.
//
// IT ANSWERS THE SAME CONTRACT as the code bodies and nothing outside this file
// changes shape because of it: a `group` with the feet on y = 0 facing +z, a
// `parts` map, `setAnim`, `update(dt, speed)`, `flap`, `openJaw` and
// `dispose()`. Two things are added, and both are optional everywhere they are
// used: `made`, which says which body this is, and `mountOn`, which is how the
// ride puts socket_perch on the shoulder instead of guessing an offset.
//
// THREE THINGS THAT ARE NOT OBVIOUS
//
// 1. THE FILE HAS NO BITE AND NO FLINCH. Sixteen clips and not one of them is
//    an attack or a hurt. `swing` and `hurt` are therefore driven here, over
//    whatever clip is running: the jaw opens and shuts on a swing and the body
//    pitches on a hurt. Both are written AFTER `mixer.update`, so the mixer
//    overwrites them next frame and nothing accumulates. GLB_STATES says which
//    states have a clip and which do not, and the test walks it.
//
// 2. THE BLINKS ARE ALREADY IN THE CLIPS. Every one of the sixteen carries
//    three morph tracks. Measured: over five seconds of `idle` the lids pass
//    0.5 closed for 8 frames of 300 and peak at 0.909, and `sleep` holds them
//    shut at 1.0 for its whole length. So nothing here drives a blink; a second
//    driver would only fight the first.
//
// 3. THE PERCH SOCKET IS THE MOUNT POINT, NOT THE ORIGIN. The manifest says the
//    perch clip is an unmounted pose and that the host has to calibrate. So
//    while it rides, `root` is offset by exactly minus socket_perch, which puts
//    that socket on the group's own origin; `place()` in dragon.js then only
//    has to put the group on the shoulder. Measured at 0.0 mm, and the test
//    holds it under 20 mm.

/** The file, and the one age that wears it. */
export const DRAGON_MODEL_ID = 'dragon-hatchling';
export const GLB_AGE = 'hatchling';

/** It is 17,342 triangles and it is allowed to be. The code budget is not its. */
export const GLB_TRIANGLE_BUDGET = 20000;

/**
 * The companion's states, and the clip each one plays.
 *
 * `loco`  idle and walk, blended by ground speed the way models.js blends any
 *         other body: both actions run at once and the walk changes rate.
 * `loop`  one clip, held, locomotion faded out. `intro` is a one shot that
 *         plays first and chains into it, which is how the manifest's loop
 *         flags read: lie_down then sleep, take_off then fly.
 * `shot`  one clip, once, and then back to whatever it was walking or standing
 *         at.
 * `over`  no clip in the file at all. Driven here, over the clip that is
 *         running. There are exactly two of these and they are the two the
 *         file has no clip for.
 */
export const GLB_STATES = {
  idle: { clip: 'idle', mode: 'loco' },
  walk: { clip: 'walk', mode: 'loco' },
  perch: { clip: 'shoulder_perch', mode: 'loop', perched: true },
  fly: { clip: 'fly', mode: 'loop', intro: 'take_off' },
  glide: { clip: 'glide', mode: 'loop' },
  land: { clip: 'land', mode: 'shot' },
  rest: { clip: 'sleep', mode: 'loop', intro: 'lie_down' },
  fall: { clip: 'sleep', mode: 'loop', intro: 'lie_down' },
  wake: { clip: 'wake_up', mode: 'shot' },
  cast: { clip: 'cast_spell', mode: 'shot' },
  swing: { clip: null, mode: 'over' },
  hurt: { clip: null, mode: 'over' },
};

/** Names the game already says that mean one of the states above. */
export const GLB_STATE_ALIAS = {
  sleep: 'rest', lie_down: 'rest', ride: 'perch', shoulder: 'perch',
  shoulder_perch: 'perch', take_off: 'fly', cast_spell: 'cast', wake_up: 'wake',
};

/** What it does with itself when it has been standing about. */
export const GLB_IDLE_VARIATIONS = ['look_around', 'tail_sway'];
export const GLB_IDLE_VARY_S = 11;

/** The wing clips, which `flap` drives. */
export const GLB_WING_CLIPS = { spread: 'wing_spread', fold: 'wing_fold', beat: 'wing_flex' };

/**
 * The contract's part names against the bones in the file.
 *
 * Every lookup goes through models.js `boneKey`, so these may be written
 * either as the file has them or as Blender would (`wing_upper.L`); the test
 * checks them against the joints really in the skin, so they are written as
 * the file has them today.
 *
 * The three that are null are null because the file has no such joint: this
 * hatchling wears no horns and its eyes are a pair of lid meshes with morph
 * targets rather than bones, and it has no dorsal spines. A part that has no
 * counterpart comes back null rather than as something that would move the
 * wrong piece, which is models.js's own rule about the same problem.
 */
export const GLB_PARTS = {
  body: 'spine_02', belly: 'spine_01',
  tail: 'tail_01', tailMesh: 'tail_06',
  neck: 'neck_01', neckMesh: 'neck_02',
  head: 'head', skull: 'head', jaw: 'jaw',
  wingL: 'wing_upperL', wingR: 'wing_upperR',
  legFL: 'front_upperL', legFR: 'front_upperR',
  legBL: 'hind_upperL', legBR: 'hind_upperR',
  hornL: null, hornR: null, spikes: null,
};

/** The sockets the file carries, by the name the game uses for each. */
export const GLB_SOCKETS = {
  perch: 'socket_perch', back: 'socket_back', mouth: 'socket_mouth',
  tailTip: 'socket_tail_tip', castL: 'socket_castL', castR: 'socket_castR',
};

/** The parts REQUIRED_PARTS names that this file genuinely has no joint for. */
export const GLB_PARTS_MISSING = ['hornL', 'hornR', 'spikes'];

/** How far the jaw swings open at openJaw(1), in radians. Measured: see below. */
export const GLB_JAW_OPEN = 0.6;
const GLB_SWING_SECONDS = 0.5;
const GLB_HURT_SECONDS = 0.25;

/** Fetch the studio hatchling. systems/dragon.js calls this at boot. */
export function preloadDragonModel() {
  return loadModel(DRAGON_MODEL_ID);
}

/** True when `buildDragon('hatchling')` will hand back the studio body. */
export function hasGlbDragon() {
  return isLoaded(DRAGON_MODEL_ID);
}

/** The state a name means, or null when it is not one. */
export function glbState(name) {
  const key = GLB_STATE_ALIAS[name] || name;
  return GLB_STATES[key] ? key : null;
}

/**
 * The studio hatchling, behind the contract.
 * Throws when the file is not in the cache; `buildDragon` is the door that
 * checks first.
 */
export function buildGlbDragon(age = GLB_AGE) {
  if (!isLoaded(DRAGON_MODEL_ID)) throw new Error(`dragon_models: ${DRAGON_MODEL_ID} is not loaded`);
  const stage = stageBody(age);

  // ---- the size, measured off the file and scaled to the table -------------
  //
  // The bind pose box is 1.088 wide by 0.582 tall by 0.913 nose to tail, in
  // metres, with its feet on y = 0. stageBody says a hatchling is 0.45 m nose
  // to tail, so the scale is the ratio of those two lengths and everything
  // else follows from it. `api.length`, `height` and `width` are then the
  // measurements taken back off the scaled body rather than the table read
  // twice.
  const box = modelBounds(DRAGON_MODEL_ID);
  const raw = {
    x: box.max.x - box.min.x,
    y: box.max.y - box.min.y,
    z: box.max.z - box.min.z,
    floor: box.min.y,
  };
  const scale = raw.z > 0 ? stage.length / raw.z : 1;

  const group = new THREE.Group();
  group.name = `dragon:${stage.age}:glb`;
  // `root` is the contract's posed thing: the mount offset, the lunge and the
  // flinch are written here and nowhere else, so `group.rotation.y` stays free
  // for facing exactly as it is on a code body.
  const root = new THREE.Group();
  root.name = 'root';
  group.add(root);
  const scaleNode = new THREE.Group();
  scaleNode.name = 'scale';
  scaleNode.scale.setScalar(scale);
  root.add(scaleNode);

  const inst = instantiate(DRAGON_MODEL_ID);
  scaleNode.add(inst.group);
  // The file is in the cache, so models.js builds it synchronously. If that
  // ever stops being true every lookup below would come back null and the body
  // would be an empty group, so it is said rather than assumed.
  if (!inst.loaded) throw new Error('dragon_models: the studio hatchling did not build synchronously');

  // ---- the parts ----------------------------------------------------------
  const meshes = [];
  inst.group.traverse((o) => { if (o.isMesh) meshes.push(o); });
  const meshNamed = (want) => meshes.find((m) => m.name === want || m.name === want.replace(/[.[\]:/]/g, '')) || null;

  const parts = { root };
  for (const [key, bone] of Object.entries(GLB_PARTS)) parts[key] = bone ? inst.bone(bone) : null;
  parts.eyeL = meshNamed('Dragon_eyelids.L');
  parts.eyeR = meshNamed('Dragon_eyelids.R');
  parts.wings = [parts.wingL, parts.wingR].filter(Boolean);
  parts.legs = [parts.legFL, parts.legFR, parts.legBL, parts.legBR].filter(Boolean);
  parts.eyes = [parts.eyeL, parts.eyeR].filter(Boolean);
  const sockets = {};
  for (const [key, bone] of Object.entries(GLB_SOCKETS)) sockets[key] = inst.bone(bone);
  parts.sockets = sockets;

  // A bone this file is meant to have and does not is a silent null every time
  // it is reached for. Say it once, loudly, at build.
  const lost = Object.entries(GLB_PARTS)
    .filter(([key, bone]) => bone && !parts[key]).map(([key, bone]) => `${key}=${bone}`);
  if (lost.length) console.warn(`dragon_models: ${DRAGON_MODEL_ID} has no bone for ${lost.join(', ')}`);
  if (!sockets.perch) console.warn(`dragon_models: ${DRAGON_MODEL_ID} has no ${GLB_SOCKETS.perch}; the ride will fall back to the offset`);

  // ---- the state ----------------------------------------------------------
  const state = {
    anim: 'idle',
    locomotion: 'idle',
    base: null,           // the clip the mixer is holding, or null for locomotion
    chain: null,          // { clip, left, then } for an intro or a one shot
    variation: null,      // { clip, left }
    idleFor: 0,
    varyAt: 0,
    speed: 0,
    flap: 0,
    jaw: 0,
    wingShot: null,       // { clip, left }
    over: null,           // 'swing' | 'hurt'
    overT: 0,
  };
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const dur = (clip) => clipDuration(DRAGON_MODEL_ID, clip) || 0;

  // ---- the layer, which is how a clip rides over another one --------------
  //
  // models.js owns one clip at a time: `play` is a base state and it ducks the
  // locomotion out under it. The wings are not a state, they are a thing the
  // body does WHILE standing, walking or perching, so they are their own
  // actions at their own weight over the top. `_actions` is models.js's map of
  // every clip in the file to its action; nothing else in the mixer is
  // touched, and the base state goes on going through `play` as normal.
  const actions = inst._actions || new Map();
  function layer(clip, weight) {
    const a = actions.get(clip);
    if (!a) return false;
    const w = clamp01(weight);
    if (w <= 0.001) {
      if (a.isRunning()) a.stop();
      a.setEffectiveWeight(0);
      return true;
    }
    if (!a.isRunning()) { a.reset(); a.setLoop(THREE.LoopRepeat, Infinity); a.play(); }
    a.setEffectiveWeight(w);
    return true;
  }

  function playBase(clip, opts) {
    state.base = clip;
    inst.play(clip, opts);
  }

  function toLocomotion() {
    state.base = null;
    state.chain = null;
    state.variation = null;
    inst.play(state.locomotion === 'walk' ? 'walk' : 'idle', { fade: 0.2 });
  }

  function enter(key) {
    const s = GLB_STATES[key];
    state.variation = null;
    state.idleFor = 0;
    if (s.mode === 'loco') {
      state.locomotion = key;
      state.chain = null;
      toLocomotion();
      return;
    }
    if (s.intro) {
      state.chain = { clip: s.clip, left: dur(s.intro), loop: true };
      playBase(s.intro, { fade: 0.2 });
      return;
    }
    if (s.mode === 'loop') {
      state.chain = null;
      playBase(s.clip, { loop: true, fade: 0.2 });
      return;
    }
    // a one shot, and then back to standing or walking
    state.chain = { clip: null, left: dur(s.clip), loop: false };
    playBase(s.clip, { fade: 0.15 });
  }

  function setAnim(name) {
    const key = glbState(name);
    if (!key) return;
    if (key === state.anim && GLB_STATES[key].mode !== 'over') return;
    if (GLB_STATES[key].mode === 'over') {
      // a swing or a flinch does not change what the body is doing, it happens
      // over it. The code body treats these the same way.
      state.over = key;
      state.overT = 0;
      return;
    }
    if (key === 'fall') { state.anim = 'fall'; state.over = null; enter('fall'); return; }
    // it is down until it is woken, exactly as the code body has it
    if (state.anim === 'fall' && key !== 'wake') return;
    if (key === 'wake') { state.anim = state.locomotion; enter('wake'); return; }
    state.anim = key;
    enter(key);
  }

  // ---- the mount ----------------------------------------------------------
  const perchLocal = new THREE.Vector3();
  const mountOffset = new THREE.Vector3();
  const seatWorld = new THREE.Vector3();
  const seatLocal = new THREE.Vector3();

  /** Where socket_perch is right now, in the group's own frame. */
  function perchIn(target) {
    if (!sockets.perch) return target.set(0, 0, 0);
    sockets.perch.updateWorldMatrix(true, false);
    group.updateWorldMatrix(true, false);
    target.setFromMatrixPosition(sockets.perch.matrixWorld);
    return group.worldToLocal(target);
  }

  /**
   * Seat the body on a carried anchor.
   *
   * When there is a shoulder to sit on, the group goes exactly where that
   * shoulder is and the perch compensation below has already put socket_perch
   * on the group's origin, so the socket lands on the shoulder and not the
   * dragon's feet. Without one it falls back to the offset `stageBody` gives,
   * which is what the code body has always used.
   *
   * @returns the seat in the anchor's own frame, so a caller can measure it
   */
  function mountOn(anchor, shoulder, offset) {
    if (anchor && shoulder) {
      anchor.updateWorldMatrix(true, false);
      shoulder.updateWorldMatrix(true, false);
      seatWorld.setFromMatrixPosition(shoulder.matrixWorld);
      seatLocal.copy(seatWorld);
      anchor.worldToLocal(seatLocal);
      group.position.copy(seatLocal);
    } else {
      const o = offset || { x: 0, y: 0, z: 0 };
      group.position.set(num0(o.x), num0(o.y), num0(o.z));
    }
    return { x: group.position.x, y: group.position.y, z: group.position.z };
  }

  // ---- the frame ----------------------------------------------------------
  function advance(d) {
    // the chain: an intro that becomes its loop, or a one shot that ends
    if (state.chain) {
      state.chain.left -= d;
      if (state.chain.left <= 0) {
        const next = state.chain.clip;
        state.chain = null;
        if (next) playBase(next, { loop: true, fade: 0.2 });
        else toLocomotion();
      }
    }
    if (state.wingShot) {
      state.wingShot.left -= d;
      if (state.wingShot.left <= 0) { layer(state.wingShot.clip, 0); state.wingShot = null; }
    }
    if (state.variation) {
      state.variation.left -= d;
      if (state.variation.left <= 0) { state.variation = null; toLocomotion(); }
    }
    if (state.over) {
      state.overT += d;
      const span = state.over === 'swing' ? GLB_SWING_SECONDS : GLB_HURT_SECONDS;
      if (state.overT >= span) state.over = null;
    }
  }

  /** Standing about long enough to look around or swing its tail. */
  function idleVariation(d) {
    const settled = (state.anim === 'idle' || state.anim === 'perch')
      && !state.chain && !state.variation && state.speed <= 0.15;
    if (!settled) { state.idleFor = 0; return; }
    state.idleFor += d;
    if (state.idleFor < GLB_IDLE_VARY_S) return;
    state.idleFor = 0;
    const clip = GLB_IDLE_VARIATIONS[state.varyAt % GLB_IDLE_VARIATIONS.length];
    state.varyAt++;
    state.variation = { clip, left: dur(clip) };
    playBase(clip, { fade: 0.4 });
  }

  /**
   * Everything written on top of the mixer, AFTER it has run.
   *
   * A mixer writes its bones absolutely every frame, so a rotation added here
   * is gone by the next `mixer.update` and can never wind up. That is the whole
   * reason the swing and the flinch can be layered on a body whose clips know
   * nothing about either.
   */
  function overlay() {
    // the bite the file has no clip for: the jaw opens, and on a swing it opens
    // further and the whole body goes forward with it. This runs FIRST because
    // the mount below solves against the pose, and the pitch is part of it.
    let jaw = state.jaw;
    let lunge = 0, pitch = 0;
    if (state.over === 'swing') {
      const p = clamp01(state.overT / GLB_SWING_SECONDS);
      lunge = Math.sin(p * Math.PI);
      jaw = Math.max(jaw, lunge);
      pitch = -lunge * 0.12;
    } else if (state.over === 'hurt') {
      const p = clamp01(state.overT / GLB_HURT_SECONDS);
      pitch = -Math.sin(p * Math.PI) * 0.22;
    }
    root.rotation.x = pitch;

    // The mount: socket_perch onto the group's own origin, so `mountOn` only
    // has to put the group where the shoulder is.
    //
    // ROOT'S POSITION IS ZEROED BEFORE THE SOCKET IS READ, and that is the
    // whole of it. `perchIn` measures the socket in the GROUP's frame, which
    // includes whatever root is already offset by, so solving against a root
    // that still carried last frame's answer gave `P(n+1) = -(P(n) + q)`: the
    // socket landed on the shoulder on even frames and 85 mm off it on odd
    // ones, for ever. Measured at 84.70 mm, alternating, over 600 frames of a
    // real rig. With root at the origin the read is exactly the socket's own
    // offset under the current pose, and minus it is the answer in one step.
    const perched = !!(GLB_STATES[state.anim] && GLB_STATES[state.anim].perched);
    root.position.set(0, 0, 0);
    let seated = false;
    if (perched && sockets.perch) { perchIn(perchLocal); seated = true; }
    mountOffset.set(
      seated ? -perchLocal.x : 0,
      (perched ? 0 : -raw.floor * scale) + (seated ? -perchLocal.y : 0),
      (seated ? -perchLocal.z : 0) + lunge * stage.length * 0.14,
    );
    root.position.copy(mountOffset);

    // negative x is open: measured on the tongue, which drops 17 mm at -0.6 rad
    // and rises 19 mm at +0.6
    if (parts.jaw) parts.jaw.rotation.x -= jaw * GLB_JAW_OPEN;
  }

  const api = {
    group, parts, sockets,
    age: stage.age,
    made: 'glb',
    modelId: DRAGON_MODEL_ID,
    /** Measured off the scaled body, not copied off the table. */
    length: raw.z * scale,
    height: raw.y * scale,
    width: raw.x * scale,
    scale,
    radius: Math.max(raw.x * scale * 0.5, stage.length * 0.12),
    triangles: modelTriangles(DRAGON_MODEL_ID),
    clips: clipsFor(DRAGON_MODEL_ID).slice(),
    setAnim,
    mountOn,
    get anim() { return state.anim; },
    get variation() { return state.variation ? state.variation.clip : null; },
    get clip() { return state.base || state.locomotion; },
    get down() { return state.anim === 'fall'; },
    /** 0 folded, 1 spread. Crossing either way plays the spread or the fold. */
    flap(k) {
      const v = clamp01(Number.isFinite(k) ? k : 0);
      const wasOut = state.flap > 0.02;
      const out = v > 0.02;
      state.flap = v;
      if (out === wasOut) return;
      const clip = out ? GLB_WING_CLIPS.spread : GLB_WING_CLIPS.fold;
      if (state.wingShot) layer(state.wingShot.clip, 0);
      state.wingShot = { clip, left: dur(clip) };
      layer(clip, 1);
    },
    /** 0 shut, 1 wide. */
    openJaw(k) { state.jaw = clamp01(Number.isFinite(k) ? k : 0); },
    update(dt, speed = 0) {
      const d = Math.max(0, Math.min(Number.isFinite(dt) ? dt : 0, 0.1));
      state.speed = Math.max(0, Number.isFinite(speed) ? speed : 0);
      advance(d);
      idleVariation(d);
      // the walk changes rate with the ground the way every other body does;
      // anything that is not locomotion is played at its own speed
      inst.setSpeed(state.base ? 0 : state.speed);
      // the beat, under whatever is playing, at the flap the caller asked for
      if (!state.wingShot) layer(GLB_WING_CLIPS.beat, state.flap);
      inst.update(d);
      overlay();
    },
    dispose() {
      if (group.parent) group.parent.remove(group);
      inst.dispose();
      group.clear();
    },
  };

  // put it in its first pose before anybody looks at it
  api.update(0, 0);
  return api;
}

/**
 * The studio body, measured. Needs the file, so it cannot run at import the way
 * `auditDragonModels` does; `dragon_models.test.mjs` loads the file and calls
 * it, and so can anything else that wants the numbers.
 */
export function auditGlbDragon() {
  if (!isLoaded(DRAGON_MODEL_ID)) return null;
  const bad = [];
  const have = clipsFor(DRAGON_MODEL_ID);
  for (const [key, s] of Object.entries(GLB_STATES)) {
    if (s.clip && !have.includes(s.clip)) bad.push(`state ${key} plays "${s.clip}", which the file has not got`);
    if (s.intro && !have.includes(s.intro)) bad.push(`state ${key} opens with "${s.intro}", which the file has not got`);
  }
  for (const clip of [...GLB_IDLE_VARIATIONS, ...Object.values(GLB_WING_CLIPS)]) {
    if (!have.includes(clip)) bad.push(`"${clip}" is asked for and the file has not got it`);
  }
  const m = buildGlbDragon(GLB_AGE);
  const stage = stageBody(GLB_AGE);
  if (m.triangles > GLB_TRIANGLE_BUDGET) bad.push(`${m.triangles} triangles, over the ${GLB_TRIANGLE_BUDGET} budget`);
  if (Math.abs(m.length - stage.length) > stage.length * 0.02) {
    bad.push(`it measures ${m.length.toFixed(3)} m nose to tail and stageBody says ${stage.length} m`);
  }
  for (const p of REQUIRED_PARTS) {
    if (!m.parts[p] && !GLB_PARTS_MISSING.includes(p)) bad.push(`no part called "${p}"`);
  }
  for (const p of GLB_PARTS_MISSING) if (m.parts[p]) bad.push(`"${p}" is listed as missing and is not`);
  if (!m.sockets.perch) bad.push('no socket_perch, so it cannot be seated on a shoulder');
  // The rules hold the body in the air for LAND_MS while it comes down, and
  // that number is dragon.js's because the rules have to run with no model. If
  // the file is re-exported with a longer landing the two would disagree in
  // silence and the dragon would hang above your shoulder for the difference.
  const landS = clipDuration(DRAGON_MODEL_ID, GLB_STATES.land.clip);
  if (Math.abs(landS * 1000 - LAND_MS) > LAND_MS * 0.1) {
    bad.push(`the land clip runs ${landS.toFixed(2)} s and dragon.js LAND_MS says ${(LAND_MS / 1000).toFixed(2)} s`);
  }
  // Every state the world asserts has to be one this body knows, or the
  // wiring in systems/dragon.js would be writing into nothing.
  for (const key of [...AIR_ANIMS, ...OVERLAY_ANIMS]) {
    if (!GLB_STATES[key]) bad.push(`the game asserts "${key}" and GLB_STATES has no row for it`);
  }
  const report = {
    made: m.made,
    land: Math.round(landS * 100) / 100,
    triangles: m.triangles,
    clips: m.clips.length,
    scale: Math.round(m.scale * 10000) / 10000,
    length: Math.round(m.length * 1000) / 1000,
    height: Math.round(m.height * 1000) / 1000,
    span: Math.round(m.width * 1000) / 1000,
    missing: GLB_PARTS_MISSING.slice(),
  };
  m.dispose();
  if (bad.length) throw new Error(`auditGlbDragon: ${bad.length} problem(s)\n  ${bad.join('\n  ')}`);
  return report;
}
