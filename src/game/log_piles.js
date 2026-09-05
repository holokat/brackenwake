// Cut logs and broken ore, lying on the ground where the tree came down.
//
//   const mesh = buildLogPile('oak', 4);     // four oak logs, stacked
//   const heap = buildOreHeap('copper', 2);  // two lumps of copper ore
//
// The user asked for two things at once: "log should say Oak Log or Sakura Log
// or Palm Log", and "when chopping down trees, we should see visible wood fall
// to the ground that we can pick up as loot". The first is `items.js`. This is
// the second: the thing that is actually lying there.
//
// It is built the way `gold_piles.js` builds a purse, and for the same reason:
// every log in a pile is merged into ONE geometry with ONE material, so a pile
// is one draw call however many logs are in it, and the bark, the sawn end and
// the species tint are a `color` attribute rather than a texture, so nothing
// has to be loaded, decoded or kept in a cache.
//
// TRIANGLES ARE COUNTED, NOT ESTIMATED. A log is an open cylinder of `LOG_SEG`
// segments (2 x seg triangles) with a disc of `LOG_SEG` triangles closing each
// end, so 4 x seg per log; at seg 12 and the six logs a pile can hold that is
// 288, well under the 1,500 budget. An ore chunk is a plain icosahedron, 20
// triangles, six of them 120. `auditLogPiles()` builds every species and every
// ore at every count at load and throws if any of that stops being true.
//
// WHAT IS AUTHORED HERE, and said so up front: the bark colours and the ore
// colours. `ores.js` gives each vein a colour as a WORD ("warm brown", "blue
// black", "grey with a white flash") and `flora.js` keeps its bark colours
// inside the Arbor recipes, which this file must not import because it has to
// run in node. So the hexes below are this file's own reading of those words,
// and `ORE_WORD` keeps each one next to the word it came from.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { LOG_BASES, ORE_BASES, BASES } from '../mmo/items.js';
import { ORES } from '../mmo/ores.js';

/** No pile may be heavier than this. Counted in `auditLogPiles`. */
export const MAX_TRIS = 1500;

/** A log, in metres. A cut length you could carry two of, and about a hand thick. */
export const LOG_R = 0.085;
export const LOG_LEN = 0.86;
export const LOG_SEG = 12;
/** An ore chunk: a fist of rock. */
export const CHUNK_R = 0.095;

/** Most logs a pile draws, however many are in the stack. Six is the whole pyramid. */
export const MAX_LOGS = 6;
/** Most chunks a heap draws. */
export const MAX_CHUNKS = 6;

/**
 * The bark of each wood, the colour of its sawn end, and how the grain reads.
 *
 * `style` is what makes a birch a birch from ten metres:
 *   plain    lengthwise grain, darker in the grooves
 *   birch    near white, with the short dark dashes birch bark has
 *   ringed   the stacked collars of a palm
 *   blossom  the grey with pink in it that a cherry trunk has
 *   succulent a cactus, which is ribbed and green and not really a log at all
 */
export const BARK = {
  oak: { bark: 0x6b5334, cut: 0xc9a877, style: 'plain' },
  birch: { bark: 0xe6e2d6, cut: 0xdfcfa6, style: 'birch' },
  beech: { bark: 0x8a7a5e, cut: 0xd6bb8c, style: 'plain' },
  fir: { bark: 0x5f4630, cut: 0xd3b183, style: 'plain' },
  spruce: { bark: 0x6a4c33, cut: 0xd8b98f, style: 'plain' },
  pine: { bark: 0x8c5a34, cut: 0xe0bb84, style: 'plain' },
  sakura: { bark: 0x8a6a72, cut: 0xd8ab9c, style: 'blossom' },
  willow: { bark: 0x7a6a4a, cut: 0xcdb98d, style: 'plain' },
  palm: { bark: 0x9c7d4e, cut: 0xd9c08a, style: 'ringed' },
  dead: { bark: 0x7d746a, cut: 0xa79b88, style: 'plain' },
  cactus: { bark: 0x4e7a46, cut: 0xbcd39a, style: 'succulent' },
  ash: { bark: 0x9a8d72, cut: 0xe2d0a6, style: 'plain' },
  heartwood: { bark: 0x5a3a24, cut: 0xa8703f, style: 'plain' },
  ironbark: { bark: 0x4a4a48, cut: 0x9a8f7c, style: 'plain' },
};

/**
 * Each vein's colour, and the word in `ores.js` it is a reading of. The word is
 * kept beside the hex so that the day somebody disagrees with one of these they
 * can see what it was supposed to say.
 */
export const ORE_WORD = {
  copper: ['warm brown', 0xb06a3a],
  tin: ['grey white', 0xcfd2cf],
  iron: ['dark grey', 0x6a6f75],
  silver: ['bright', 0xd8dde2],
  coldiron: ['blue black', 0x2f3a4a],
  emberite: ['red veined', 0xa83a2a],
  rimesteel: ['pale blue', 0xa9c8dc],
  verdite: ['green gold', 0x7d9b4a],
  voidrock: ['matte black, no shine', 0x26262a],
  starfall: ['grey with a white flash', 0x9aa0a8],
};
/** The stone the flecks sit in. Ore is mostly rock. */
export const HOST_ROCK = 0x6d6a63;

// A small deterministic generator, so a pile is the same pile every frame and
// two piles of four oak logs in one clearing are not identical twins.
function rng(seed) {
  let s = (seed | 0) || 1;
  return () => {
    s = (s * 1664525 + 1013904223) | 0;
    return ((s >>> 8) & 0xffffff) / 0x1000000;
  };
}

/** How many logs are drawn for a stack of `count`. Never more than the pyramid holds. */
export const logsDrawn = (count) => Math.max(1, Math.min(MAX_LOGS, Math.round(Number(count) || 0) || 1));
/** How many chunks are drawn for a heap of `count`. */
export const chunksDrawn = (count) => Math.max(1, Math.min(MAX_CHUNKS, Math.round(Number(count) || 0) || 1));

/**
 * Where every log in a pile lies. Split out from the mesh so a test can measure
 * the stack without a renderer.
 *
 * Six logs is a three-two-one pyramid, which is how cut timber is stacked and
 * how it stays stacked; four is three with one on top, and one is one on the
 * ground. Rows sit at the hexagonal packing height, so the top row rests in the
 * groove between the two under it rather than floating over them.
 */
export function logLayout(count, seed = 0) {
  const n = logsDrawn(count);
  const rows = n <= 3 ? [n] : n === 4 ? [3, 1] : n === 5 ? [3, 2] : [3, 2, 1];
  const rand = rng((seed | 0) * 2654435761 + n * 40503 + 11);
  const out = [];
  const step = LOG_R * 2.04;                 // side by side, a whisker apart
  const rise = LOG_R * 1.74;                 // hexagonal packing, not stacked square
  for (let r = 0; r < rows.length; r++) {
    const m = rows[r];
    for (let i = 0; i < m; i++) {
      out.push({
        x: (i - (m - 1) / 2) * step + (rand() * 2 - 1) * 0.012,
        y: LOG_R + r * rise,
        z: (rand() * 2 - 1) * 0.03,
        yaw: (rand() * 2 - 1) * 0.09,        // a log is never quite square to the pile
        roll: rand() * Math.PI * 2,          // which way the grain faces
        len: LOG_LEN * (0.88 + 0.24 * rand()),
        shade: 0.86 + 0.24 * rand(),
        row: r,
      });
    }
  }
  return out;
}

/**
 * Where every chunk in an ore heap lies. A heap is not a stack: broken rock
 * falls where it falls, so this is a small cluster with one or two pieces
 * kicked out to the side.
 */
export function chunkLayout(count, seed = 0) {
  const n = chunksDrawn(count);
  const rand = rng((seed | 0) * 2654435761 + n * 92821 + 3);
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = rand() * Math.PI * 2;
    const rr = (i === 0 ? 0 : 0.055 + 0.11 * rand()) * (i >= n - 1 && n > 3 ? 1.7 : 1);
    const s = 0.72 + 0.5 * rand();
    out.push({
      x: Math.cos(a) * rr, z: Math.sin(a) * rr,
      y: CHUNK_R * s * 0.82,
      s,
      rx: rand() * Math.PI, ry: rand() * Math.PI, rz: rand() * Math.PI,
      shade: 0.84 + 0.3 * rand(),
      fleck: rand(),
    });
  }
  return out;
}

// A cheap hash for the grain, so bark is not a flat colour and does not need a
// texture to stop being one.
const grain = (a, b) => {
  const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453;
  return s - Math.floor(s);
};

const _c = new THREE.Color(), _d = new THREE.Color();

/** Paint the barrel of one log. `style` is what tells a birch from an oak. */
function barkColours(geo, row, shade, seed) {
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    // the cylinder is built along Y before it is laid down, so Y is along the
    // log and the angle around XZ is the way round the trunk
    const theta = Math.atan2(z, x);
    const along = y;
    let k;
    if (row.style === 'ringed') {
      // a palm's collars: a band every 9 cm, dark in the crease
      const band = Math.abs(((along / 0.09) % 1) - 0.5) * 2;
      k = 0.72 + 0.5 * band;
    } else if (row.style === 'birch') {
      // near white, with the short dark dashes birch bark has
      const tick = grain(Math.round(theta * 4), Math.round(along * 9) + seed);
      k = tick > 0.86 ? 0.42 : 0.94 + 0.12 * grain(theta, along * 3 + seed);
    } else if (row.style === 'succulent') {
      // a cactus is ribbed, and the ribs run the whole length
      const rib = Math.abs(Math.cos(theta * 5));
      k = 0.78 + 0.42 * rib;
    } else if (row.style === 'blossom') {
      k = 0.84 + 0.3 * grain(Math.round(theta * 6), Math.round(along * 5) + seed);
    } else {
      // lengthwise grain: darker in the grooves, and the grooves run down
      const g = grain(Math.round(theta * 7), seed);
      k = 0.74 + 0.44 * g + 0.08 * Math.sin(along * 19 + g * 6);
    }
    _c.setHex(row.bark).multiplyScalar(k * shade);
    col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
}

/** Paint a sawn end: pale heartwood with growth rings in it. */
function cutColours(geo, row, shade) {
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const r = Math.hypot(x, y) / LOG_R;
    const ring = 0.86 + 0.2 * Math.abs(((r * 4) % 1) - 0.5) * 2;
    _d.setHex(row.cut).multiplyScalar(ring * shade);
    col[i * 3] = _d.r; col[i * 3 + 1] = _d.g; col[i * 3 + 2] = _d.b;
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
}

const woodMaterial = () => new THREE.MeshStandardMaterial({
  color: 0xffffff, vertexColors: true, roughness: 0.92, metalness: 0,
  // Transparent from the start at opacity 1, for the reason gold_piles gives:
  // the bag's last ten seconds fade it, and flipping `transparent` on the frame
  // the player is watching would recompile the shader.
  transparent: true, opacity: 1,
});

/**
 * The pile itself: one merged geometry, one material, one draw call.
 *
 * `species` is the material id an items.js log base carries (`oak`, `sakura`,
 * `dead`), not the base id. Null for a wood this file has no bark for, which
 * `auditLogPiles` makes impossible for anything items.js ships.
 */
export function buildLogPile(species, count = 1, opts = {}) {
  const row = BARK[species];
  if (!row) return null;
  const layout = logLayout(count, opts.seed ?? 0);
  const m4 = new THREE.Matrix4(), e = new THREE.Euler(), q = new THREE.Quaternion();
  const p = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);
  const parts = [];
  let i = 0;
  for (const l of layout) {
    // built standing, then laid down: rotate about Z so the log runs along X
    const barrel = new THREE.CylinderGeometry(LOG_R, LOG_R, l.len, LOG_SEG, 1, true);
    barkColours(barrel, row, l.shade, i);
    const ends = [];
    for (const sign of [1, -1]) {
      const cap = new THREE.CircleGeometry(LOG_R, LOG_SEG);
      cutColours(cap, row, l.shade);
      // a disc faces +Z; turn it to face along the log and push it to the end
      const cm = new THREE.Matrix4()
        .makeTranslation(0, sign * l.len / 2, 0)
        .multiply(new THREE.Matrix4().makeRotationX(sign > 0 ? -Math.PI / 2 : Math.PI / 2));
      cap.applyMatrix4(cm);
      ends.push(cap);
    }
    e.set(0, l.yaw, Math.PI / 2 + 0);
    // roll about the log's own axis, then lay it down, then place it
    const roll = new THREE.Matrix4().makeRotationY(l.roll);
    q.setFromEuler(e);
    p.set(l.x, l.y, l.z);
    m4.compose(p, q, s).multiply(roll);
    for (const g of [barrel, ...ends]) { g.applyMatrix4(m4); parts.push(g); }
    i++;
  }
  const geo = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  if (!geo) return null;
  geo.computeBoundingSphere();

  const mesh = new THREE.Mesh(geo, woodMaterial());
  mesh.name = `logs:${species}`;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.logs = { species, count: Math.round(count), drawn: layout.length };
  return mesh;
}

/**
 * A heap of broken ore. `oreId` is an `ores.js` id (`copper`, `starfall`), the
 * same word the ore base carries as its `material`.
 *
 * The rock is the host rock and the ore is flecks in it, which is what a seam
 * actually looks like and what makes a voidrock heap read as different from a
 * silver one without either of them being a solid lump of metal.
 */
export function buildOreHeap(oreId, count = 1, opts = {}) {
  const word = ORE_WORD[oreId];
  if (!word) return null;
  const hex = word[1];
  const layout = chunkLayout(count, opts.seed ?? 0);
  const m4 = new THREE.Matrix4(), e = new THREE.Euler(), q = new THREE.Quaternion();
  const p = new THREE.Vector3(), sv = new THREE.Vector3();
  const parts = [];
  let n = 0;
  for (const c of layout) {
    const g = new THREE.IcosahedronGeometry(CHUNK_R, 0);
    const pos = g.attributes.position;
    const col = new Float32Array(pos.count * 3);
    // an icosahedron is unindexed: three consecutive vertices are one face, so
    // a face either carries ore or it does not, which is what reads as a fleck
    for (let f = 0; f < pos.count / 3; f++) {
      const isOre = grain(f + 1, c.fleck * 97 + n) > 0.55;
      _c.setHex(isOre ? hex : HOST_ROCK).multiplyScalar((isOre ? 1.0 : 0.9) * c.shade);
      for (let v = 0; v < 3; v++) {
        const o = (f * 3 + v) * 3;
        col[o] = _c.r; col[o + 1] = _c.g; col[o + 2] = _c.b;
      }
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    e.set(c.rx, c.ry, c.rz);
    q.setFromEuler(e);
    p.set(c.x, c.y, c.z);
    sv.set(c.s, c.s * 0.78, c.s);            // a broken lump is flatter than a ball
    m4.compose(p, q, sv);
    g.applyMatrix4(m4);
    parts.push(g);
    n++;
  }
  const geo = mergeGeometries(parts, false);
  for (const g of parts) g.dispose();
  if (!geo) return null;
  geo.computeBoundingSphere();

  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    color: 0xffffff, vertexColors: true, roughness: 0.72, metalness: 0.18,
    flatShading: true, transparent: true, opacity: 1,
  }));
  mesh.name = `ore:${oreId}`;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.ore = { ore: oreId, count: Math.round(count), drawn: layout.length };
  return mesh;
}

/** Triangles in a mesh, indexed or not. */
export function trisOf(mesh) {
  const g = mesh.geometry;
  return g.index ? g.index.count / 3 : g.attributes.position.count / 3;
}

/**
 * Build every species and every ore at every count, at load. A pile that has
 * stopped merging, lost its colour attribute, sunk into the ground or grown
 * past the budget fails here rather than in front of the player.
 *
 * Driven BOTH ways: every wood items.js ships has bark here, and every bark
 * here belongs to a wood items.js ships, so neither list can grow alone.
 */
export function auditLogPiles() {
  const bad = [];
  const out = { logs: {}, ore: {} };

  const woods = new Set(LOG_BASES.map((id) => BASES[id].material));
  for (const w of woods) if (!BARK[w]) bad.push(`items.js ships a ${w} log and this file has no bark for it`);
  for (const w of Object.keys(BARK)) if (!woods.has(w)) bad.push(`there is bark for "${w}" and no ${w} log in items.js`);
  const ores = new Set(ORE_BASES.map((id) => BASES[id].material));
  for (const o of ores) if (!ORE_WORD[o]) bad.push(`items.js ships ${o} ore and this file has no colour for it`);
  for (const o of Object.keys(ORE_WORD)) if (!ores.has(o)) bad.push(`there is a colour for "${o}" and no ${o} ore in items.js`);
  for (const o of ORES) if (!ORE_WORD[o.id]) bad.push(`ores.js tiers ${o.id} and this file has no colour for it`);

  const measure = (mesh, label, tag) => {
    if (!mesh) { bad.push(`${label} built nothing`); return null; }
    const tris = trisOf(mesh);
    if (tris > MAX_TRIS) bad.push(`${label} is ${tris} triangles, over the ${MAX_TRIS} budget`);
    if (!!mesh.material.vertexColors !== !!mesh.geometry.attributes.color) {
      bad.push(`${label} claims vertex colours it does not carry`);
    }
    const pos = mesh.geometry.attributes.position;
    let lowest = Infinity, highest = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y < lowest) lowest = y;
      if (y > highest) highest = y;
    }
    // a pile half sunk in the turf is the bug nobody thinks to look for
    if (lowest < -0.02) bad.push(`${label} reaches ${lowest.toFixed(3)} m under the ground`);
    const r = { tris, low: +lowest.toFixed(3), high: +highest.toFixed(3), drawn: mesh.userData[tag].drawn };
    mesh.geometry.dispose();
    mesh.material.dispose();
    return r;
  };

  for (const w of woods) {
    for (let n = 1; n <= MAX_LOGS + 2; n++) {
      const r = measure(buildLogPile(w, n, { seed: n }), `a pile of ${n} ${w}`, 'logs');
      if (n === MAX_LOGS) out.logs[w] = r;
      // the pyramid never draws more than it holds, however many are in the stack
      if (r && r.drawn !== logsDrawn(n)) bad.push(`a pile of ${n} ${w} drew ${r.drawn} logs`);
      if (r && r.tris !== r.drawn * 4 * LOG_SEG) {
        bad.push(`a pile of ${n} ${w} is ${r.tris} triangles, not the ${r.drawn} x ${4 * LOG_SEG} its logs should be`);
      }
    }
  }
  for (const o of ores) {
    for (let n = 1; n <= MAX_CHUNKS + 2; n++) {
      const r = measure(buildOreHeap(o, n, { seed: n }), `a heap of ${n} ${o}`, 'ore');
      if (n === MAX_CHUNKS) out.ore[o] = r;
      if (r && r.drawn !== chunksDrawn(n)) bad.push(`a heap of ${n} ${o} drew ${r.drawn} chunks`);
      if (r && r.tris !== r.drawn * 20) bad.push(`a heap of ${n} ${o} is ${r.tris} triangles, not ${r.drawn} x 20`);
    }
  }

  // Both directions on the two shapes that are not built: a wood and an ore
  // this file has never heard of build nothing rather than a grey box.
  if (buildLogPile('mithril', 3) !== null) bad.push('a wood that does not exist built a pile anyway');
  if (buildOreHeap('cheese', 3) !== null) bad.push('an ore that does not exist built a heap anyway');

  if (bad.length) throw new Error(`log_piles: ${bad.length} problem(s)\n  ${bad.join('\n  ')}`);
  return out;
}
auditLogPiles();
