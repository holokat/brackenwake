// Gold on the ground, as coins.
//
//   const mesh = buildGoldPile(46);       // a low mound of forty coins
//   tierFor(46) === 'medium'
//
// A purse of gold used to be a brown sack with a yellow ring under it, which is
// a UI telling you there is money here rather than money being here. This is
// the other thing: real coins, thin cylinders with a gold PBR material, merged
// into ONE geometry so a pile is one draw call however many coins are in it,
// and lit by the scene's environment map so they catch the sky.
//
// Three sizes, because a hundred and eighty gold and eleven gold should not
// look the same:
//
//   small    1 to 30      six to twelve coins scattered flat, no heap at all
//   medium   31 to 150    a low mound of forty, three courses deep
//   large    over 150     a heap, with a few coins spilled off the side of it
//
// The layout is a pure function of the amount and a seed, so the same drop
// grows the same pile every frame and two bags of 46 gold in the same fight do
// not look like twins unless they were seeded the same.
//
// TRIANGLES ARE COUNTED, NOT ESTIMATED. A cylinder of n radial segments is 4n
// triangles: 2n around the rim and n in each face. The tiers use 12, 10 and 8
// segments, so the worst pile in the game is 58 coins of 32 triangles, which is
// 1,856, and `auditGoldPiles` throws if a change to any of those numbers takes
// a pile over MAX_TRIS.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Gold's own colour. For a metal the base colour IS the reflectance. */
export const GOLD_COLOUR = 0xffcb4d;
/** No pile may be heavier than this. Counted in `auditGoldPiles`. */
export const MAX_TRIS = 2000;

/** A coin, in metres. Big enough to read from a running camera, small enough to be a coin. */
export const COIN_R = 0.045;
export const COIN_H = 0.012;

/**
 * The three sizes, and what each one is made of. `coins` is the count at the
 * top of the band; a small pile at 1 gold has `coinsLow` of them and grows to
 * `coins` by the top of its band, so a purse you can see is a purse you can
 * count.
 */
export const GOLD_TIERS = [
  { id: 'small', min: 1, max: 30, seg: 12, coinsLow: 6, coins: 12, r: 0.13, h: 0.0, spill: 0 },
  { id: 'medium', min: 31, max: 150, seg: 10, coinsLow: 40, coins: 40, r: 0.15, h: 0.055, spill: 0 },
  { id: 'large', min: 151, max: Infinity, seg: 8, coinsLow: 58, coins: 58, r: 0.19, h: 0.135, spill: 6 },
];
export const TIER = Object.fromEntries(GOLD_TIERS.map((t) => [t.id, t]));

/**
 * Which pile an amount of gold makes. Pure, and the boundaries are the ones
 * written above: 30 is small, 31 is medium, 150 is medium, 151 is large.
 * Nothing at all is null, because a pile of no gold is not a thing to draw.
 */
export function tierFor(amount) {
  const n = Math.round(Number(amount) || 0);
  if (n < 1) return null;
  for (const t of GOLD_TIERS) if (n >= t.min && n <= t.max) return t.id;
  return 'large';
}

/** How many coins that amount is worth drawing. Pure, and never more than the tier's. */
export function coinsFor(amount) {
  const id = tierFor(amount);
  if (!id) return 0;
  const t = TIER[id];
  if (t.coinsLow === t.coins) return t.coins;
  const span = Math.max(1, t.max - t.min);
  const k = Math.min(1, Math.max(0, (Math.round(amount) - t.min) / span));
  return Math.round(t.coinsLow + (t.coins - t.coinsLow) * k);
}

// A small deterministic generator, so a pile is the same pile every frame and
// two piles of the same size in the same fight are not identical twins.
function rng(seed) {
  let s = (seed | 0) || 1;
  return () => {
    s = (s * 1664525 + 1013904223) | 0;
    return ((s >>> 8) & 0xffffff) / 0x1000000;
  };
}

/**
 * Where every coin in a pile lies. Split out from the mesh so a test can count
 * and measure the arrangement without a renderer: each entry is a position, a
 * yaw, a tilt and a shade.
 *
 * The heap profile is a paraboloid, which is what a poured pile of discs
 * actually settles into: full height in the middle, nothing at the rim. The
 * spilled coins of a large pile lie flat outside the heap, because a coin that
 * rolled off a pile is a coin lying on the ground.
 */
export function coinLayout(amount, seed = 0) {
  const id = tierFor(amount);
  if (!id) return [];
  const t = TIER[id];
  const n = coinsFor(amount);
  const rand = rng((seed | 0) * 2654435761 + Math.round(amount) * 40503 + 7);
  const out = [];
  const spill = Math.min(t.spill, Math.max(0, n - 1));
  for (let i = 0; i < n; i++) {
    const spilled = i >= n - spill;
    // a disc sample, biased to the middle so the heap has a shoulder
    const u = rand();
    const rr = spilled
      ? t.r * (1.25 + 0.95 * rand())
      : t.r * Math.sqrt(u) * (0.98 + 0.04 * rand());
    const a = rand() * Math.PI * 2;
    const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
    // the mound: full height in the middle, nothing at the rim, and never
    // below the ground however the random lands
    const k = Math.min(1, rr / Math.max(1e-6, t.r));
    const heap = spilled ? 0 : t.h * (1 - k * k);
    const y = COIN_H * 0.5 + heap * (0.35 + 0.65 * rand());
    // a coin lies flat, give or take. A heaped one leans more than a spilled one.
    const lean = spilled ? 0.06 : 0.10 + 0.34 * (heap / Math.max(1e-6, t.h || 1));
    out.push({
      x, y, z,
      yaw: rand() * Math.PI * 2,
      tiltX: (rand() * 2 - 1) * lean,
      tiltZ: (rand() * 2 - 1) * lean,
      shade: 0.82 + 0.28 * rand(),
      spilled,
    });
  }
  return out;
}

/** Triangles in one coin of a tier. A cylinder of n segments is 4n triangles. */
export const trisPerCoin = (seg) => seg * 4;

/**
 * The pile itself: one merged geometry, one material, one draw call.
 *
 * `vertexColors` is TRUE here and the geometry really does carry a `color`
 * attribute, one shade per coin. That is the whole reason a pile reads as
 * coins rather than as a gold blob, and it is also the trap grass.js documents
 * from the other side: a material claiming vertex colours over a geometry that
 * has none renders black. The audit checks the pair, not the flag.
 */
export function buildGoldPile(amount, opts = {}) {
  const id = tierFor(amount);
  if (!id) return null;
  const t = TIER[id];
  const layout = coinLayout(amount, opts.seed ?? 0);
  const coin = new THREE.CylinderGeometry(COIN_R, COIN_R, COIN_H, t.seg);
  const m4 = new THREE.Matrix4(), e = new THREE.Euler(), q = new THREE.Quaternion();
  const p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);
  const parts = [];
  for (const c of layout) {
    e.set(c.tiltX, c.yaw, c.tiltZ);
    q.setFromEuler(e);
    p.set(c.x, c.y, c.z);
    m4.compose(p, q, s);
    const g = coin.clone();
    g.applyMatrix4(m4);
    parts.push(g);
  }
  const geo = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  coin.dispose();
  if (!geo) return null;

  // one shade per coin, laid over the merged geometry in the order it merged
  const verts = geo.attributes.position.count;
  const per = verts / layout.length;
  const col = new Float32Array(verts * 3);
  const c3 = new THREE.Color();
  for (let i = 0; i < layout.length; i++) {
    c3.setHex(GOLD_COLOUR).multiplyScalar(layout[i].shade);
    for (let v = 0; v < per; v++) {
      const o = (i * per + v) * 3;
      col[o] = c3.r; col[o + 1] = c3.g; col[o + 2] = c3.b;
    }
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeBoundingSphere();

  // Transparent from the start, at opacity 1. The bag's last ten seconds fade
  // it out, and flipping `transparent` at that moment would recompile the
  // shader on the frame the player is watching it go.
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff, vertexColors: true,
    metalness: 0.85, roughness: 0.3, envMapIntensity: 1.2,
    transparent: true, opacity: 1,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'gold:' + id;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.gold = { amount: Math.round(amount), tier: id, coins: layout.length };
  return mesh;
}

/**
 * A handful of coins to lie beside a sack that has gold in it as well as gear.
 * Deliberately the small tier whatever the amount: the sack is the subject and
 * the coins are the note that there is money in it too.
 */
export function buildCoinScatter(amount, opts = {}) {
  const n = Math.max(1, Math.min(30, Math.round(Number(amount) || 0)));
  return buildGoldPile(n <= 0 ? 1 : Math.min(30, n), opts);
}

/**
 * Build all three at load, the way weapon_models audits its recipes. A pile
 * that has stopped merging, lost its colour attribute or grown past the
 * triangle budget fails here rather than in front of the player.
 */
export function auditGoldPiles() {
  const bad = [];
  const out = {};
  for (const t of GOLD_TIERS) {
    const amount = t.max === Infinity ? t.min + 500 : t.max;
    const mesh = buildGoldPile(amount);
    if (!mesh) { bad.push(`${t.id} built nothing at ${amount} gold`); continue; }
    const tris = mesh.geometry.index
      ? mesh.geometry.index.count / 3
      : mesh.geometry.attributes.position.count / 3;
    const coins = mesh.userData.gold.coins;
    if (tris > MAX_TRIS) bad.push(`${t.id} is ${tris} triangles, over the ${MAX_TRIS} budget`);
    if (tris !== coins * trisPerCoin(t.seg)) {
      bad.push(`${t.id} is ${tris} triangles, not the ${coins} x ${trisPerCoin(t.seg)} its coins should be`);
    }
    if (!!mesh.material.vertexColors !== !!mesh.geometry.attributes.color) {
      bad.push(`${t.id} claims vertex colours it does not carry`);
    }
    // every coin on or above the ground: a pile half sunk in the turf is the
    // one bug nobody would think to look for
    const pos = mesh.geometry.attributes.position;
    let lowest = Infinity;
    for (let i = 0; i < pos.count; i++) lowest = Math.min(lowest, pos.getY(i));
    if (lowest < -0.02) bad.push(`${t.id} has a coin ${lowest.toFixed(3)} m under the ground`);
    out[t.id] = { coins, tris, radius: mesh.geometry.boundingSphere.radius };
    mesh.geometry.dispose();
    mesh.material.dispose();
  }
  // the boundaries, both ways, at load rather than only in the test
  const edges = [[0, null], [1, 'small'], [30, 'small'], [31, 'medium'], [150, 'medium'], [151, 'large']];
  for (const [n, want] of edges) {
    if (tierFor(n) !== want) bad.push(`${n} gold is a ${tierFor(n)} pile and should be ${want}`);
  }
  if (bad.length) throw new Error(`gold_piles: ${bad.join('; ')}`);
  return out;
}
auditGoldPiles();
