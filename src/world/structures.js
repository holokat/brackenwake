// The eleven things worth crossing open country for.
//
// Between the ninety five named places of `realms.js` the world rolled hamlets,
// towns, ruins, shrines, holes and cold campfires and nothing else, out of a kit
// of about a dozen shapes. This file is the other half: a wizard's tower with
// one window lit, a temple with its braziers going, a keep above a town, a
// bandit camp with men round a fire, a graveyard, a barrow with a door in it, an
// arena with sand in it, a fountain, a gate on the road, a farm that burned, and
// a watchtower. `sitegrid.js` rolls them, `field.js` levels the ground under
// them from the pad in the same table, and `site_models.js` stands them up.
//
// These are built from code and they are meant to be replaced. Every one of them
// is a few dozen boxes and cylinders in a handful of colours, chosen so that
// `mergeByMaterial` can bake a whole structure into ten or twenty draw calls.
// When the user's own art arrives, the builder is the thing to swap; the roll,
// the pad, the habitat and the words all stay.
//
// FOUR RULES, each of which has already caught a bug in this project:
//
//   THE GROUND IS SAMPLED, NEVER ASSUMED. A pad is dead level only out to
//   `flatR * 0.55` (field.js line 613) and grades to the hillside by `flatR + 4`.
//   So every foot of every piece asks `heightAt` where it stands and sinks a
//   little into it. `structures.test.mjs` measures the widest reach of every
//   body against its own pad and fails if a body has outgrown the ground under
//   it.
//
//   THE MERGE WOULD EAT ANYTHING THAT MOVES. `site_models.mergeByMaterial` bakes
//   every mesh into one geometry per colour, in world space, and throws every uv
//   away. So a flame, a lit window, a lettered board and a door that has to
//   carry its own site are NOT meshes of the group: they are handed back beside
//   it, as `fires`, `glows` and `extras`, and hung on the merged marker after.
//
//   A DOOR IS A SITE OF ITS OWN. A tomb is a rolled kind called 'tomb', and the
//   thing you click on it is a derived site of kind 'dungeon', exactly as a
//   mine's cut is a derived site of kind 'cave'. `interact.decide` and
//   `world_runtime.enterDungeon` take it with no change at all, and the dungeon
//   roll is untouched because the door owns no cell and is never rolled.
//
//   ONE CASE IS NEVER THE CASE. Every kind in `WILD_KINDS` is built here, every
//   one is built in the node test, and `auditStructures()` throws at import if
//   the table and this file ever disagree about how many there are.

import * as THREE from 'three';
import { mulberry32, hash2 } from './noise.js';
import { WILD_KINDS, WILD_KIND_IDS, TOMB_DOOR_CELL, gateWord } from './sitegrid.js';
import { zoneAt } from './zones.js';
import { buildFarmhouse, buildBarn } from '../farm/buildings.js';
import { buildCamp } from '../farm/camp_models.js';
import { probeHostCanvas, stubCanvasFactory } from './arbor_textures.js';
import { theme } from '../game/ui_theme.js';

// ------------------------------------------------------------------ budgets --

/**
 * How much of a pad is dead level, from `field.js`. A body wider than
 * `flatR * PAD_FLAT` stands partly on the shoulder of its own pad, which is
 * where a colonnade starts to lean. Measured per kind in the test.
 */
export const PAD_FLAT = 0.55;
/** No structure may cost more draw calls than this once merged. */
export const MAX_DRAWS = 40;
/** Nor more triangles than this, which is about a third of a kit town. */
export const MAX_TRIS = 26000;
/** How far a foot is bedded into its own ground, metres. */
export const SINK = 0.22;

// ------------------------------------------------------------------ palette --
//
// Few colours on purpose: `mergeByMaterial` buckets by colour, so every colour
// added here is a draw call added to every structure that uses it.

const std = (color, extra) => new THREE.MeshStandardMaterial({ color, roughness: 0.92, flatShading: true, ...extra });

export const M = {
  stone: std(0x8d8880),
  stoneDark: std(0x5f5b56),
  stonePale: std(0xa9a49b),
  slate: std(0x4a4d52),
  wood: std(0x6b4a2e),
  woodDark: std(0x3c2b1c),
  charred: std(0x231f1e),
  ash: std(0x4a4340),
  iron: std(0x474b51, { metalness: 0.6, roughness: 0.5 }),
  gold: std(0xc9a243, { metalness: 0.45, roughness: 0.4 }),
  canvas: std(0xbfa878),
  banner: std(0xa8402f),
  sand: std(0xd6c191),
  water: std(0x2f9c98, { transparent: true, opacity: 0.82, roughness: 0.25 }),
  soil: std(0x4d4034),
  moss: std(0x53663f),
  dark: std(0x0b0a0c),
  bone: std(0xcabfa4),
  // Two near duplicates of `stone` and `stonePale`, double sided, for the open
  // drums an arena tier and a fountain basin are. The hex differs by one step
  // ON PURPOSE: `mergeByMaterial` buckets by colour, so a double sided piece
  // sharing a hex with a single sided one would be merged into it and take
  // whichever material happened to be found first, and half an arena would be
  // invisible from the sand. Setting `.side` on the shared material instead
  // would turn every wall in the world double sided, which is worse.
  stoneShell: std(0x8e8981, { side: THREE.DoubleSide }),
  paleShell: std(0xaaa59c, { side: THREE.DoubleSide }),
};

/**
 * A temple is the one body that wears its realm. The stone is the realm's own,
 * which is why the Temple of the Long Rain in the Ashen Throne is black and the
 * one in Frostreach is white, and why they read as the same building.
 */
export const REALM_STONE = {
  greenwold: 0xc6bfa8,
  verdant: 0x93a279,
  saltmarch: 0xb3b7a8,
  emberwastes: 0xc59a63,
  stormpeaks: 0x7c838b,
  boneyard: 0xc9c0a6,
  frostreach: 0xd3dde5,
  sunkenkingdom: 0xa98a86,
  ashenthrone: 0x35322f,
};
export const DEFAULT_STONE = 0xa9a49b;

const realmMats = new Map();
/** The stone this point's realm builds in, as a cached material. */
function realmStone(x, z) {
  const hit = zoneAt(x, z);
  const realm = hit && hit.zone ? (hit.zone.parent || hit.zone.id) : null;
  const hex = REALM_STONE[realm] ?? DEFAULT_STONE;
  let m = realmMats.get(hex);
  if (!m) { m = std(hex); realmMats.set(hex, m); }
  return m;
}
/** And a darker course of the same, for steps and shadowed courses. */
const darkMats = new Map();
function darker(mat, f = 0.72) {
  const hex = mat.color.getHex();
  let m = darkMats.get(hex);
  if (!m) {
    const c = new THREE.Color(hex).multiplyScalar(f);
    m = std(c.getHex());
    darkMats.set(hex, m);
  }
  return m;
}

// -------------------------------------------------------------- primitives --
//
// Everything is placed in WORLD metres, because that is the space
// `site_models.buildSiteMarker` has always built in and the space
// `mergeByMaterial` bakes into.

/**
 * The yaw that turns a thing standing at bearing `a` on a ring outward.
 *
 * The ring bodies here place a piece at (cos a, sin a). `rotY(ry)` sends local
 * +Z to (sin ry, cos ry), so facing outward wants `ry = PI/2 - a`, and local +X
 * then runs along the ring, which is the side a merlon or a tier is wide on.
 */
export const faceOut = (a) => Math.PI / 2 - a;

function put(g, mesh, x, y, z, ry = 0) {
  mesh.position.set(x, y, z);
  mesh.rotation.y = ry;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}
const box = (g, mat, w, h, d, x, y, z, ry = 0) =>
  put(g, new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat), x, y, z, ry);
const cyl = (g, mat, rt, rb, h, seg, x, y, z, ry = 0) =>
  put(g, new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat), x, y, z, ry);
const cone = (g, mat, r, h, seg, x, y, z, ry = 0) =>
  put(g, new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), mat), x, y, z, ry);
const ball = (g, mat, r, seg, x, y, z) =>
  put(g, new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(3, seg >> 1)), mat), x, y, z);
const ring = (g, mat, ri, ro, x, y, z) => {
  const m = new THREE.Mesh(new THREE.RingGeometry(ri, ro, 24), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, z);
  m.receiveShadow = true;
  g.add(m);
  return m;
};

/**
 * A post that reaches the ground wherever the ground is.
 *
 * `topY` is where the top of it has to be, in world metres. The post is made
 * long enough to reach from there down past the ground under its own foot and
 * SINK metres into it, so nothing here can float on a shoulder or stand on air.
 */
function post(g, mat, r, x, z, topY, groundY, seg = 6) {
  const h = Math.max(0.2, topY - (groundY - SINK));
  return cyl(g, mat, r, r * 1.08, h, seg, x, topY - h / 2, z);
}
/** The same for a square-footed thing. */
function pier(g, mat, w, d, x, z, topY, groundY, ry = 0) {
  const h = Math.max(0.2, topY - (groundY - SINK));
  return box(g, mat, w, h, d, x, topY - h / 2, z, ry);
}

// ------------------------------------------------------------------ lettering --
//
// A gate has a word on it and a word needs a canvas, which node does not have.
// The stub records what was drawn instead of drawing it, exactly as
// `mine_models.js` does for a mine's sign board, so `structures.test.mjs` can
// read the word off the texture without a browser.

/** The arbor stub plus the two text calls a lintel needs, recording each. */
export function textCanvas(w, h) {
  const c = stubCanvasFactory(w, h);
  const ctx = c.getContext('2d');
  c.__texts = [];
  ctx.font = '10px serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText = (t, x, y) => { c.__texts.push({ text: String(t), x, y, font: ctx.font }); };
  ctx.measureText = (t) => ({ width: String(t).length * 0.52 * (parseFloat(ctx.font) || 10) });
  return c;
}

let canvasFactory = null;
/** Inject a canvas maker. Pass null to go back to the host's, or the stub. */
export function setStructureCanvas(fn) { canvasFactory = fn || null; }

function canvasOf(w, h) {
  if (canvasFactory) return canvasFactory(w, h);
  if (probeHostCanvas()) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  return textCanvas(w, h);
}

/** A word cut into stone, as a texture. Pale letters, a shadow behind them. */
export function wordTexture(word) {
  const W = 256, H = 64;
  const c = canvasOf(W, H);
  const x = c.getContext('2d');
  x.fillStyle = '#00000000';
  x.clearRect?.(0, 0, W, H);
  const size = Math.min(40, Math.floor(W / Math.max(3, word.length) * 1.5));
  x.font = `600 ${size}px ${theme.fonts.display}`;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillStyle = 'rgba(0,0,0,0.55)';
  x.fillText(word, W / 2, H / 2 + 2);
  x.fillStyle = '#efe6d2';
  x.fillText(word, W / 2, H / 2);
  const t = new THREE.CanvasTexture(c);
  if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
  t.userData = { word, canvas: c };
  return t;
}

// ------------------------------------------------------------------ the kinds --

/**
 * Every builder takes the same three things and hands back the same four.
 *
 *   site      the rolled site, with x, y, z, facing, name, flatR, cx, cz
 *   ground    heightAt, already the flattened ground
 *   rng       the site's own generator, so a place is the same every visit
 *
 * and puts into `out`:
 *
 *   g         the static meshes, which the caller merges
 *   fires     [{ x, y, z, kind, scale }] for fire.js, in world metres
 *   glows     [{ x, y, z, ry, w, h, colour }] windows that come up at dusk
 *   extras    Object3D added AFTER the merge: doors that carry their own site,
 *             lettered boards whose uvs the merge would throw away
 */

// ---- 1. the wizard's tower --------------------------------------------------

const TOWER_H = [18, 26];      // metres, three storeys and a roof

function buildTower(site, ground, rng, out) {
  const { g } = out;
  const x0 = site.x, z0 = site.z, y0 = site.y;
  const h = TOWER_H[0] + rng() * (TOWER_H[1] - TOWER_H[0]);
  const storey = h / 3;
  const R = 3.4;

  // three drums, each a little narrower than the one under it, with a string
  // course between them so the storeys read from the ground
  for (let i = 0; i < 3; i++) {
    const rb = R - i * 0.22, rt = R - (i + 1) * 0.22;
    cyl(g, i % 2 ? M.stone : M.stonePale, rt, rb, storey, 12, x0, y0 + storey * (i + 0.5) - SINK, z0);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(rt + 0.16, rt + 0.16, 0.34, 12), M.stoneDark);
    band.position.set(x0, y0 + storey * (i + 1), z0);
    band.castShadow = true;
    g.add(band);
  }
  // the parapet: a ring wall with merlons on it
  cyl(g, M.stoneDark, R - 0.5, R - 0.5, 0.5, 12, x0, y0 + h + 0.25, z0);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    box(g, M.stone, 0.8, 0.9, 0.5, x0 + Math.cos(a) * (R - 0.6), y0 + h + 0.95, z0 + Math.sin(a) * (R - 0.6), faceOut(a));
  }
  // a slate cone over the middle of the roof, so the tower has a silhouette
  cone(g, M.slate, R - 1.1, 3.0, 10, x0, y0 + h + 2.1, z0);

  // the door, on the facing side, with two steps up to it
  const fx = Math.sin(site.facing), fz = Math.cos(site.facing);
  const dx = x0 + fx * (R - 0.1), dz = z0 + fz * (R - 0.1);
  box(g, M.woodDark, 1.5, 2.5, 0.34, dx, y0 + 1.25, dz, site.facing);
  box(g, M.stoneDark, 2.3, 0.28, 1.4, x0 + fx * (R + 0.5), y0 + 0.14, z0 + fz * (R + 0.5), site.facing);
  box(g, M.stoneDark, 2.9, 0.28, 1.9, x0 + fx * (R + 1.2), y0 - 0.14, z0 + fz * (R + 1.2), site.facing);

  // an outside stair winding a quarter of the way up to a first floor door,
  // which is what makes the tower read as lived in rather than sealed
  for (let i = 0; i < 9; i++) {
    const a = site.facing + 0.34 + i * 0.30;
    const r = R + 0.9;
    const sx = x0 + Math.sin(a) * r, sz = z0 + Math.cos(a) * r;
    const top = y0 + 0.35 + i * 0.62;
    pier(g, M.stone, 1.5, 1.0, sx, sz, top, Math.min(ground(sx, sz), top - 0.3), a + Math.PI / 2);
  }

  // the lit window, high on the facing side, and two dark ones below it
  const wy = y0 + storey * 2 + storey * 0.45;
  out.glows.push({ x: x0 + fx * (R - 0.42), y: wy, z: z0 + fz * (R - 0.42), ry: site.facing, w: 0.85, h: 1.25, colour: 0xffcf78 });
  for (const [ang, sy] of [[site.facing + 2.2, storey * 1.5], [site.facing - 2.2, storey * 0.6]]) {
    const wx = x0 + Math.sin(ang) * (R - 0.3), wz = z0 + Math.cos(ang) * (R - 0.3);
    box(g, M.dark, 0.8, 1.2, 0.24, wx, y0 + sy, wz, ang);
  }
  out.bodyR = R + 2.2;
  out.tall = h + 5;
}

// ---- 2. the temple ----------------------------------------------------------

const TEMPLE_W = 34;           // metres along the colonnade
const TEMPLE_D = 20;           // metres across it
const TEMPLE_COL_H = 7.2;

function buildTemple(site, ground, rng, out) {
  const { g } = out;
  const stone = realmStone(site.x, site.z);
  const dark = darker(stone);
  const x0 = site.x, z0 = site.z, y0 = site.y;
  const c = Math.cos(site.facing), s = Math.sin(site.facing);
  // local (u along the front, v out from the front) to world
  const P = (u, v) => [x0 + c * u + s * v, z0 - s * u + c * v];

  // the stylobate: three courses, each one wider than the one above
  for (let i = 0; i < 3; i++) {
    const w = TEMPLE_W + 4 - i * 1.4, d = TEMPLE_D + 4 - i * 1.4;
    const [bx, bz] = P(0, 0);
    box(g, i === 2 ? stone : dark, w, 0.55, d, bx, y0 - SINK + 0.28 + i * 0.5, bz, site.facing);
  }
  const deck = y0 + 1.28;

  // the colonnade: eight columns down each side, four across each end
  const halfU = TEMPLE_W / 2 - 1.6, halfV = TEMPLE_D / 2 - 1.6;
  const cols = [];
  for (let i = 0; i < 8; i++) {
    const u = -halfU + (i / 7) * halfU * 2;
    cols.push([u, -halfV], [u, halfV]);
  }
  for (let i = 1; i < 3; i++) {
    const v = -halfV + (i / 3) * halfV * 2;
    cols.push([-halfU, v], [halfU, v]);
  }
  for (const [u, v] of cols) {
    const [px, pz] = P(u, v);
    cyl(g, stone, 0.62, 0.74, TEMPLE_COL_H, 10, px, deck + TEMPLE_COL_H / 2, pz);
    box(g, dark, 1.7, 0.32, 1.7, px, deck + TEMPLE_COL_H + 0.16, pz, site.facing);   // the capital
    box(g, dark, 1.8, 0.2, 1.8, px, deck + 0.1, pz, site.facing);                     // the base
  }
  // the entablature, a band all the way round on top of the capitals
  const entY = deck + TEMPLE_COL_H + 0.7;
  for (const [w, d, off] of [[TEMPLE_W, 1.2, -halfV], [TEMPLE_W, 1.2, halfV]]) {
    const [bx, bz] = P(0, off);
    box(g, stone, w, 0.9, d, bx, entY, bz, site.facing);
  }
  for (const u of [-halfU, halfU]) {
    const [bx, bz] = P(u, 0);
    box(g, stone, 1.2, 0.9, halfV * 2, bx, entY, bz, site.facing);
  }

  // the cella: a walled room inside the colonnade, open at the front
  const cw = TEMPLE_W - 9, cd = TEMPLE_D - 9;
  for (const [u, v, w, d] of [
    [0, -cd / 2, cw, 0.7], [-cw / 2, 0, 0.7, cd], [cw / 2, 0, 0.7, cd],
    [-cw / 2 + 2.4, cd / 2, 4.8, 0.7], [cw / 2 - 2.4, cd / 2, 4.8, 0.7],
  ]) {
    const [bx, bz] = P(u, v);
    box(g, stone, w, TEMPLE_COL_H - 0.6, d, bx, deck + (TEMPLE_COL_H - 0.6) / 2, bz, site.facing);
  }

  // a roof: either a low hip over the whole thing, or a dome over the cella
  const domed = hash2(site.cx, site.cz, 91) % 2 === 0;
  if (domed) {
    const [bx, bz] = P(0, 0);
    box(g, dark, TEMPLE_W + 1, 0.5, TEMPLE_D + 1, bx, entY + 0.7, bz, site.facing);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(cd * 0.62, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), stone);
    dome.position.set(bx, entY + 0.9, bz);
    dome.castShadow = true;
    g.add(dome);
    ball(g, M.gold, 0.6, 8, bx, entY + 0.9 + cd * 0.62, bz);
  } else {
    const [bx, bz] = P(0, 0);
    box(g, dark, TEMPLE_W + 1.6, 0.5, TEMPLE_D + 1.6, bx, entY + 0.7, bz, site.facing);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(TEMPLE_W * 0.62, 4.2, 4), M.slate);
    roof.rotation.y = site.facing + Math.PI / 4;
    roof.position.set(bx, entY + 3.0, bz);
    roof.scale.z = TEMPLE_D / TEMPLE_W;
    roof.castShadow = true;
    g.add(roof);
  }

  // the steps up to the front, and the altar inside
  for (let i = 0; i < 4; i++) {
    const [bx, bz] = P(0, halfV + 1.6 + i * 0.9);
    box(g, dark, TEMPLE_W * 0.5, 0.34, 0.95, bx, y0 + 1.1 - i * 0.34, bz, site.facing);
  }
  const [ax, az] = P(0, -cd * 0.15);
  box(g, dark, 3.4, 1.1, 1.8, ax, deck + 0.55, az, site.facing);
  box(g, stone, 3.9, 0.22, 2.3, ax, deck + 1.2, az, site.facing);
  // and whatever it was raised to, standing behind the altar
  const [sx2, sz2] = P(0, -cd * 0.38);
  cyl(g, dark, 1.1, 1.3, 0.6, 8, sx2, deck + 0.3, sz2);
  statue(g, stone, sx2, deck + 0.6, sz2, site.facing, 2.6);

  // four braziers, on the corners of the top step, burning
  for (const [u, v] of [[-halfU - 1.2, halfV + 1.0], [halfU + 1.2, halfV + 1.0], [-halfU - 1.2, -halfV - 1.0], [halfU + 1.2, -halfV - 1.0]]) {
    const [bx, bz] = P(u, v);
    brazier(g, dark, bx, deck, bz, 1);
    out.fires.push({ x: bx, y: deck + 1.35, z: bz, kind: 'brazier', scale: 1 });
  }
  out.bodyR = Math.hypot(TEMPLE_W / 2 + 2, TEMPLE_D / 2 + 2);
  out.tall = entY - y0 + 6;
}

/** A bowl on three legs, the thing a brazier is. The fire goes on top of it. */
function brazier(g, mat, x, y, z, scale = 1) {
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    cyl(g, M.iron, 0.09 * scale, 0.11 * scale, 1.1 * scale, 5,
      x + Math.cos(a) * 0.32 * scale, y + 0.55 * scale, z + Math.sin(a) * 0.32 * scale);
  }
  cyl(g, M.iron, 0.62 * scale, 0.34 * scale, 0.46 * scale, 10, x, y + 1.32 * scale, z);
  cyl(g, mat, 0.5 * scale, 0.5 * scale, 0.12 * scale, 10, x, y + 1.5 * scale, z);
}

/** A figure in stone. Not a person: a shape a person reads as a statue. */
function statue(g, mat, x, y, z, ry, h = 2.4) {
  const s = h / 2.4;
  cyl(g, mat, 0.34 * s, 0.46 * s, 1.5 * s, 8, x, y + 0.75 * s, z);
  box(g, mat, 0.72 * s, 0.62 * s, 0.42 * s, x, y + 1.75 * s, z, ry);
  ball(g, mat, 0.24 * s, 8, x, y + 2.22 * s, z);
  for (const side of [-1, 1]) {
    box(g, mat, 0.17 * s, 0.95 * s, 0.19 * s,
      x + Math.cos(ry) * 0.44 * s * side, y + 1.6 * s, z - Math.sin(ry) * 0.44 * s * side, ry);
  }
}

// ---- 3. the castle ----------------------------------------------------------

const CURTAIN_R = 24;          // metres to the middle of the curtain wall
const CURTAIN_H = 6.5;

function buildCastle(site, ground, rng, out) {
  const { g } = out;
  const x0 = site.x, z0 = site.z, y0 = site.y;
  // the gate looks at the town it holds when there is one, and at its facing
  // when the ground refused the town
  const gateA = site.townAt
    ? Math.atan2(site.townAt.x - x0, site.townAt.z - z0)
    : site.facing;

  const SIDES = 8;
  for (let i = 0; i < SIDES; i++) {
    const a0 = gateA + (i / SIDES) * Math.PI * 2 + Math.PI / SIDES;
    const a1 = gateA + ((i + 1) / SIDES) * Math.PI * 2 + Math.PI / SIDES;
    const ax = x0 + Math.sin(a0) * CURTAIN_R, az = z0 + Math.cos(a0) * CURTAIN_R;
    const bx = x0 + Math.sin(a1) * CURTAIN_R, bz = z0 + Math.cos(a1) * CURTAIN_R;
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    const len = Math.hypot(bx - ax, bz - az);
    // local +X has to run ALONG the segment: rotY(ry) sends it to
    // (cos ry, -sin ry), so the bearing of the segment needs a quarter turn
    const ry = Math.atan2(bx - ax, bz - az) + Math.PI / 2;
    const gy = ground(mx, mz);
    // the gatehouse takes the segment facing the town, so that one is left open
    const isGate = i === SIDES - 1;
    if (!isGate) {
      pier(g, M.stone, len + 0.4, 1.7, mx, mz, y0 + CURTAIN_H, gy, ry);
      // merlons along the top of it
      const n = Math.max(3, Math.round(len / 2.2));
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        const px = ax + (bx - ax) * t, pz = az + (bz - az) * t;
        box(g, M.stoneDark, 1.2, 0.85, 1.9, px, y0 + CURTAIN_H + 0.42, pz, ry);
      }
    }
    // a tower on every corner
    const ty = ground(ax, az);
    post(g, M.stone, 3.0, ax, az, y0 + CURTAIN_H + 3.2, ty, 10);
    cyl(g, M.stoneDark, 3.3, 3.3, 0.5, 10, ax, y0 + CURTAIN_H + 3.4, az);
    cone(g, M.slate, 3.5, 3.4, 10, ax, y0 + CURTAIN_H + 5.3, az);
  }

  // the gatehouse: two square towers, a dark arch between them, a portcullis
  const gx = x0 + Math.sin(gateA) * CURTAIN_R, gz = z0 + Math.cos(gateA) * CURTAIN_R;
  const across = gateA + Math.PI / 2;
  for (const side of [-1, 1]) {
    const px = gx + Math.sin(across) * 3.4 * side, pz = gz + Math.cos(across) * 3.4 * side;
    pier(g, M.stone, 3.2, 3.2, px, pz, y0 + CURTAIN_H + 3.6, ground(px, pz), gateA);
    for (let k = 0; k < 3; k++) {
      const o = (k - 1) * 1.05;
      box(g, M.stoneDark, 0.9, 0.85, 0.9,
        px + Math.sin(across) * o, y0 + CURTAIN_H + 4.0, pz + Math.cos(across) * o, gateA);
    }
  }
  box(g, M.stone, 8.6, 2.0, 2.4, gx, y0 + CURTAIN_H + 1.2, gz, gateA);
  box(g, M.dark, 4.2, CURTAIN_H, 0.5, gx, y0 + CURTAIN_H / 2, gz, gateA);
  for (let k = 0; k < 7; k++) {
    box(g, M.iron, 0.16, CURTAIN_H - 1.2, 0.16,
      gx + Math.sin(across) * (k - 3) * 0.6, y0 + (CURTAIN_H - 1.2) / 2 + 0.5,
      gz + Math.cos(across) * (k - 3) * 0.6, gateA);
  }
  // banners either side of the gate and on the keep
  for (const side of [-1, 1]) {
    const px = gx + Math.sin(across) * 5.6 * side, pz = gz + Math.cos(across) * 5.6 * side;
    banner(g, px, y0 + CURTAIN_H + 1.6, pz, gateA);
  }

  // the keep in the middle: a square tower with four turrets and a roof
  const KW = 12, KH = 15;
  pier(g, M.stone, KW, KW, x0, z0, y0 + KH, ground(x0, z0), gateA);
  box(g, M.stoneDark, KW + 1.2, 0.7, KW + 1.2, x0, y0 + KH + 0.35, z0, gateA);
  for (let i = 0; i < 4; i++) {
    const a = gateA + Math.PI / 4 + (i / 4) * Math.PI * 2;
    const tx = x0 + Math.sin(a) * KW * 0.66, tz = z0 + Math.cos(a) * KW * 0.66;
    cyl(g, M.stone, 1.5, 1.6, 4.4, 8, tx, y0 + KH + 2.2, tz);
    cone(g, M.slate, 1.9, 2.4, 8, tx, y0 + KH + 5.6, tz);
  }
  banner(g, x0, y0 + KH + 3.0, z0, gateA);
  // two braziers inside the gate, because a castle whose gate is dark at night
  // reads as another ruin, and this one is held
  for (const side of [-1, 1]) {
    const px = gx - Math.sin(gateA) * 4.0 + Math.sin(across) * 3.0 * side;
    const pz = gz - Math.cos(gateA) * 4.0 + Math.cos(across) * 3.0 * side;
    const gy = ground(px, pz);
    brazier(g, M.stoneDark, px, gy, pz, 1.1);
    out.fires.push({ x: px, y: gy + 1.5 * 1.1, z: pz, kind: 'brazier', scale: 1.1 });
  }
  // a dark door into the keep, and steps up to it
  const kx = x0 + Math.sin(gateA) * (KW / 2 + 0.05), kz = z0 + Math.cos(gateA) * (KW / 2 + 0.05);
  box(g, M.woodDark, 2.2, 3.0, 0.3, kx, y0 + 1.5, kz, gateA);
  box(g, M.stoneDark, 3.4, 0.3, 1.6, x0 + Math.sin(gateA) * (KW / 2 + 0.9), y0 + 0.15, z0 + Math.cos(gateA) * (KW / 2 + 0.9), gateA);

  out.bodyR = CURTAIN_R + 3.5;
  out.tall = KH + 8;
}

/** A pole with a cloth on it, the only soft thing a castle has. */
function banner(g, x, y, z, ry) {
  cyl(g, M.woodDark, 0.09, 0.09, 3.2, 5, x, y + 1.6, z);
  box(g, M.banner, 0.06, 2.1, 1.3, x, y + 1.9, z, ry);
}

// ---- 4. the bandit camp -----------------------------------------------------

function buildBanditCamp(site, ground, rng, out) {
  const { g } = out;
  const x0 = site.x, z0 = site.z, y0 = site.y;

  // the fire in the middle: a ring of stones and logs across it
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    ball(g, i % 2 ? M.stone : M.stoneDark, 0.26 + rng() * 0.1, 6,
      x0 + Math.cos(a) * 0.95, y0 + 0.13, z0 + Math.sin(a) * 0.95);
  }
  cyl(g, M.ash, 0.8, 0.86, 0.12, 10, x0, y0 + 0.06, z0);
  for (let i = 0; i < 4; i++) {
    const a = rng() * Math.PI;
    const log = cyl(g, M.charred, 0.11, 0.13, 1.5, 6, x0, y0 + 0.28 + i * 0.05, z0, 0);
    log.rotation.set(0, a, Math.PI / 2);
  }
  out.fires.push({ x: x0, y: y0 + 0.32, z: z0, kind: 'campfire', scale: 1 });

  // three tents from the camp kit, round the fire, each on its own ground
  for (let i = 0; i < 3; i++) {
    const a = site.facing + 0.7 + (i / 3) * Math.PI * 2;
    const d = 4.6 + rng() * 1.2;
    const tx = x0 + Math.cos(a) * d, tz = z0 + Math.sin(a) * d;
    const tent = buildCamp('tent');
    tent.position.set(tx, ground(tx, tz) - 0.05, tz);
    tent.rotation.y = -a;
    tent.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    g.add(tent);
  }
  // and a chair somebody left by the fire
  {
    const cx = x0 + Math.cos(site.facing + 2.4) * 2.2, cz = z0 + Math.sin(site.facing + 2.4) * 2.2;
    const chair = buildCamp('camp_chair');
    chair.position.set(cx, ground(cx, cz) - 0.05, cz);
    chair.rotation.y = site.facing;
    g.add(chair);
  }

  // the lookout post: four legs, a platform, a ladder
  const la = site.facing - 1.9, ld = 7.0;
  const lx = x0 + Math.cos(la) * ld, lz = z0 + Math.sin(la) * ld;
  const deck = y0 + 4.6;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const px = lx + Math.cos(a) * 1.15, pz = lz + Math.sin(a) * 1.15;
    post(g, M.wood, 0.15, px, pz, deck, ground(px, pz), 5);
  }
  box(g, M.wood, 3.0, 0.22, 3.0, lx, deck + 0.11, lz, la);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    box(g, M.wood, 0.14, 0.9, 0.14, lx + Math.cos(a) * 1.3, deck + 0.6, lz + Math.sin(a) * 1.3);
  }
  box(g, M.wood, 3.2, 0.12, 0.12, lx, deck + 1.05, lz, la);
  for (let i = 0; i < 6; i++) {
    box(g, M.wood, 0.9, 0.09, 0.09, lx + Math.cos(la) * 1.4, y0 + 0.6 + i * 0.7, lz + Math.sin(la) * 1.4, la + Math.PI / 2);
  }

  // sacks and crates of what they took
  for (let i = 0; i < 5; i++) {
    const a = site.facing + 2.0 + rng() * 2.4, d = 2.6 + rng() * 3.0;
    const sx = x0 + Math.cos(a) * d, sz = z0 + Math.sin(a) * d;
    const gy = ground(sx, sz);
    if (rng() < 0.55) {
      const sack = ball(g, M.canvas, 0.38 + rng() * 0.12, 7, sx, gy + 0.32, sz);
      sack.scale.y = 1.25;
    } else {
      box(g, M.wood, 0.75, 0.6, 0.65, sx, gy + 0.3, sz, rng() * 3);
    }
  }

  // sharpened stakes across the way in
  for (let i = 0; i < 7; i++) {
    const a = site.facing - 0.8 + (i / 6) * 1.6, d = 8.0;
    const sx = x0 + Math.cos(a) * d, sz = z0 + Math.sin(a) * d;
    const gy = ground(sx, sz);
    const stake = cyl(g, M.wood, 0.05, 0.13, 2.3, 5, sx, gy + 1.0, sz);
    stake.rotation.z = 0.35 * (i % 2 ? 1 : -1);
  }
  out.bodyR = 8.5;
  out.tall = 7;
}

// ---- 5. the graveyard -------------------------------------------------------

const GRAVE_HALF = 13;         // metres from the middle to the iron fence

function buildGraveyard(site, ground, rng, out) {
  const { g } = out;
  const x0 = site.x, z0 = site.z, y0 = site.y;
  const c = Math.cos(site.facing), s = Math.sin(site.facing);
  const P = (u, v) => [x0 + c * u + s * v, z0 - s * u + c * v];

  // the iron fence, four runs of it, with a gate in the middle of the front
  for (const [du, dv, along] of [[0, -1, true], [0, 1, true], [-1, 0, false], [1, 0, false]]) {
    const n = 16;
    for (let i = 0; i <= n; i++) {
      const t = -1 + (i / n) * 2;
      const u = along ? t * GRAVE_HALF : du * GRAVE_HALF;
      const v = along ? dv * GRAVE_HALF : t * GRAVE_HALF;
      // the gateway is the middle of the front run
      if (along && dv === 1 && Math.abs(t) < 0.14) continue;
      const [px, pz] = P(u, v);
      const gy = ground(px, pz);
      post(g, M.iron, 0.06, px, pz, gy + 1.5, gy, 4);
      if (i < n) {
        const [qx, qz] = P(along ? (-1 + ((i + 1) / n) * 2) * GRAVE_HALF : u,
          along ? v : (-1 + ((i + 1) / n) * 2) * GRAVE_HALF);
        const mx = (px + qx) / 2, mz = (pz + qz) / 2;
        if (along && dv === 1 && Math.abs(t) < 0.2) continue;
        box(g, M.iron, Math.hypot(qx - px, qz - pz), 0.07, 0.07, mx, ground(mx, mz) + 1.15, mz,
          Math.atan2(qx - px, qz - pz) + Math.PI / 2);
      }
    }
  }
  // the gate itself: two piers and an arch of iron over them
  for (const side of [-1, 1]) {
    const [px, pz] = P(side * 2.0, GRAVE_HALF);
    pier(g, M.stoneDark, 0.7, 0.7, px, pz, y0 + 2.6, ground(px, pz), site.facing);
    ball(g, M.iron, 0.22, 6, px, y0 + 2.8, pz);
  }
  {
    const [px, pz] = P(0, GRAVE_HALF);
    box(g, M.iron, 4.4, 0.12, 0.12, px, y0 + 2.75, pz, site.facing);
  }

  // rows of headstones, five by six, each leaning its own way
  for (let r = 0; r < 5; r++) {
    for (let k = 0; k < 6; k++) {
      const u = -8.5 + k * 3.4 + (rng() - 0.5) * 0.5;
      const v = 8.0 - r * 3.2 + (rng() - 0.5) * 0.5;
      const [px, pz] = P(u, v);
      const gy = ground(px, pz);
      const h = 0.8 + rng() * 0.7;
      const st = box(g, rng() < 0.3 ? M.stoneDark : M.stone, 0.62, h, 0.16, px, gy + h / 2 - 0.1, pz, site.facing + (rng() - 0.5) * 0.6);
      st.rotation.z = (rng() - 0.5) * 0.22;
      if (rng() < 0.25) box(g, M.moss, 0.5, 0.1, 0.2, px, gy + h - 0.12, pz, site.facing);
    }
  }

  // the chapel with no roof: three broken walls and a doorway
  {
    const [bx, bz] = P(-7.5, -8.5);
    const gy = ground(bx, bz);
    const ry = site.facing + 0.2;
    const wall = (w, h, d, ou, ov) => {
      const [px, pz] = [bx + Math.cos(ry) * ou + Math.sin(ry) * ov, bz - Math.sin(ry) * ou + Math.cos(ry) * ov];
      pier(g, M.stone, w, d, px, pz, gy + h, ground(px, pz), ry);
    };
    wall(6.0, 3.6, 0.6, 0, -2.4);
    wall(0.6, 4.2, 4.8, -3.0, 0);
    wall(0.6, 2.4, 3.0, 3.0, -0.9);
    wall(2.0, 3.0, 0.6, -2.0, 2.4);
    // the doorway arch that is still standing
    const [dx, dz] = [bx + Math.sin(ry) * 2.4, bz + Math.cos(ry) * 2.4];
    const arch = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.3, 5, 10, Math.PI), M.stone);
    arch.position.set(dx, ground(dx, dz) + 2.2, dz);
    arch.rotation.y = ry;
    arch.castShadow = true;
    g.add(arch);
    for (const side of [-1, 1]) {
      const px = dx + Math.cos(ry) * 1.1 * side, pz = dz - Math.sin(ry) * 1.1 * side;
      pier(g, M.stone, 0.6, 0.6, px, pz, ground(px, pz) + 2.2, ground(px, pz), ry);
    }
  }

  // the mausoleum, the one whole building in the place
  {
    const [bx, bz] = P(8.0, -7.5);
    const gy = ground(bx, bz);
    const ry = site.facing - 0.15;
    pier(g, M.stonePale, 4.2, 4.2, bx, bz, gy + 3.2, gy, ry);
    box(g, M.stoneDark, 4.9, 0.4, 4.9, bx, gy + 3.4, bz, ry);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(3.2, 1.6, 4), M.slate);
    cap.rotation.y = ry + Math.PI / 4;
    cap.position.set(bx, gy + 4.4, bz);
    cap.castShadow = true;
    g.add(cap);
    const dx = bx + Math.sin(ry) * 2.12, dz = bz + Math.cos(ry) * 2.12;
    box(g, M.dark, 1.3, 2.2, 0.2, dx, gy + 1.1, dz, ry);
    for (const side of [-1, 1]) {
      box(g, M.stoneDark, 0.34, 2.6, 0.34, dx + Math.cos(ry) * 0.9 * side, gy + 1.3, dz - Math.sin(ry) * 0.9 * side, ry);
    }
  }

  // dead trees, which is the only planting anybody did here
  for (let i = 0; i < 3; i++) {
    const [px, pz] = P(-11 + i * 10.5, -1.5 + (rng() - 0.5) * 6);
    const gy = ground(px, pz);
    const h = 4.5 + rng() * 2.5;
    post(g, M.woodDark, 0.28, px, pz, gy + h, gy, 6);
    for (let b = 0; b < 4; b++) {
      const a = rng() * Math.PI * 2;
      const br = cyl(g, M.woodDark, 0.06, 0.11, 1.9, 4,
        px + Math.cos(a) * 0.7, gy + h * (0.6 + b * 0.1), pz + Math.sin(a) * 0.7);
      br.rotation.set(Math.cos(a) * 0.9, 0, -Math.sin(a) * 0.9);
    }
  }
  out.bodyR = GRAVE_HALF * Math.SQRT2 * 0.78;
  out.tall = 8;
}

// ---- 6. the tomb ------------------------------------------------------------

const BARROW_R = 7.0;

/**
 * The barrow, and the door in it.
 *
 * The door is an extra: a mesh added after the merge carrying its OWN site, of
 * kind 'dungeon', so `interact.decide` reads it as enterable and
 * `world_runtime.enterDungeon` opens a level behind it. `tombDoor` builds that
 * site and `sitegrid.TOMB_DOOR_CELL` explains why its generator cell is where
 * it is.
 */
export function tombDoor(site) {
  const fx = Math.sin(site.facing), fz = Math.cos(site.facing);
  return {
    id: `${site.id}#door`, tomb: site.id,
    kind: 'dungeon', authored: true,
    cx: site.cx + TOMB_DOOR_CELL, cz: site.cz,
    x: site.x + fx * (BARROW_R - 0.6), z: site.z + fz * (BARROW_R - 0.6),
    y: site.y, flatR: 6,
    facing: site.facing + Math.PI,
    name: site.name, article: 'a door into a tomb',
  };
}

function buildTomb(site, ground, rng, out) {
  const { g } = out;
  const x0 = site.x, z0 = site.z, y0 = site.y;
  const fx = Math.sin(site.facing), fz = Math.cos(site.facing);

  // the mound: half a squashed ball of turf over the chamber
  const mound = new THREE.Mesh(new THREE.SphereGeometry(BARROW_R, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.moss);
  mound.scale.y = 0.62;
  mound.position.set(x0, y0 - 0.3, z0);
  mound.castShadow = true; mound.receiveShadow = true;
  g.add(mound);
  // kerb stones round the foot of it, which is what says this was built
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const px = x0 + Math.sin(a) * (BARROW_R + 0.3), pz = z0 + Math.cos(a) * (BARROW_R + 0.3);
    const gy = ground(px, pz);
    const st = box(g, i % 3 ? M.stone : M.stoneDark, 0.9, 1.2, 0.5, px, gy + 0.42, pz, a);
    st.rotation.z = (rng() - 0.5) * 0.2;
  }

  // the facade, cut into the front of the mound: two jambs and a lintel
  const dx = x0 + fx * (BARROW_R - 0.6), dz = z0 + fz * (BARROW_R - 0.6);
  const gy = ground(dx, dz);
  for (const side of [-1, 1]) {
    const px = dx + fz * 1.5 * side, pz = dz - fx * 1.5 * side;
    pier(g, M.stonePale, 0.9, 1.4, px, pz, gy + 3.0, ground(px, pz), site.facing);
  }
  box(g, M.stonePale, 4.4, 0.9, 1.5, dx, gy + 3.45, dz, site.facing);
  box(g, M.stoneDark, 5.2, 0.5, 2.0, dx, gy + 4.1, dz, site.facing);
  // a levelled forecourt, so the door is not half in the hillside
  box(g, M.stoneDark, 5.2, 0.3, 3.2, dx + fx * 1.6, gy - 0.05, dz + fz * 1.6, site.facing);

  // the two statues that have been watching the door
  for (const side of [-1, 1]) {
    const px = dx + fx * 2.6 + fz * 2.7 * side, pz = dz + fz * 2.6 - fx * 2.7 * side;
    const sy = ground(px, pz);
    box(g, M.stoneDark, 1.2, 0.7, 1.2, px, sy + 0.3, pz, site.facing);
    statue(g, M.stonePale, px, sy + 0.65, pz, site.facing + Math.PI, 2.5);
  }

  // the door: an extra, because it carries its own site and the merge would
  // paint it with the barrow's
  const door = tombDoor(site);
  const slab = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.8, 0.35), M.dark);
  slab.position.set(dx + fx * 0.15, gy + 1.4, dz + fz * 0.15);
  slab.rotation.y = site.facing;
  slab.castShadow = true;
  slab.userData.site = door;
  const seal = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.11, 5, 10), M.iron);
  seal.position.set(dx + fx * 0.34, gy + 1.5, dz + fz * 0.34);
  seal.rotation.y = site.facing;
  seal.userData.site = door;
  out.extras.push(slab, seal);
  out.door = door;
  out.bodyR = BARROW_R + 0.9;
  out.tall = 6;
}

// ---- 7. the arena -----------------------------------------------------------

const ARENA_R = 11;            // metres of sand
const ARENA_TIERS = 4;

function buildArena(site, ground, rng, out) {
  const { g } = out;
  const x0 = site.x, z0 = site.z, y0 = site.y;

  // the floor, and the line scored round it
  cyl(g, M.sand, ARENA_R, ARENA_R, 0.3, 28, x0, y0 + 0.1, z0);
  ring(g, M.stoneDark, ARENA_R - 0.5, ARENA_R - 0.2, x0, y0 + 0.26, z0);

  // the tiers, each a riser and a tread, rising away from the sand
  for (let i = 0; i < ARENA_TIERS; i++) {
    const ri = ARENA_R + i * 1.35;
    const h = y0 + 0.4 + i * 0.85;
    const riser = new THREE.Mesh(new THREE.CylinderGeometry(ri + 1.35, ri, 0.9, 28, 1, true), i % 2 ? M.stoneShell : M.paleShell);
    riser.position.set(x0, h, z0);
    riser.castShadow = true; riser.receiveShadow = true;
    g.add(riser);
    ring(g, M.stone, ri + 0.05, ri + 1.4, x0, h + 0.45, z0);
  }
  // the outside wall, which is what you see from a distance
  const outer = ARENA_R + ARENA_TIERS * 1.35;
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    // the way in is a gap on the facing side
    if (Math.abs(Math.atan2(Math.sin(a - site.facing), Math.cos(a - site.facing))) < 0.22) continue;
    const px = x0 + Math.cos(a) * (outer + 0.6), pz = z0 + Math.sin(a) * (outer + 0.6);
    const gy = ground(px, pz);
    pier(g, M.stoneDark, 1.6, 1.1, px, pz, y0 + ARENA_TIERS * 0.85 + 1.6, gy, faceOut(a));
  }
  // the way in: two posts and a dark arch, and a ramp down to the sand
  {
    const px = x0 + Math.cos(site.facing) * (outer + 0.6), pz = z0 + Math.sin(site.facing) * (outer + 0.6);
    const gy = ground(px, pz);
    for (const side of [-1, 1]) {
      const qx = px - Math.sin(site.facing) * 1.6 * side, qz = pz + Math.cos(site.facing) * 1.6 * side;
      pier(g, M.stone, 1.0, 1.4, qx, qz, y0 + ARENA_TIERS * 0.85 + 2.4, ground(qx, qz), faceOut(site.facing));
    }
    box(g, M.stone, 4.6, 0.9, 1.6, px, y0 + ARENA_TIERS * 0.85 + 2.8, pz, faceOut(site.facing));
    box(g, M.dark, 3.0, 2.6, 0.4, px, gy + 1.3, pz, faceOut(site.facing));
  }
  // a rack of what the last one used, stood against the wall inside
  {
    const a = site.facing + Math.PI;
    const px = x0 + Math.cos(a) * (ARENA_R - 1.2), pz = z0 + Math.sin(a) * (ARENA_R - 1.2);
    box(g, M.wood, 1.8, 0.16, 0.4, px, y0 + 1.3, pz, faceOut(a));
    for (let i = 0; i < 4; i++) {
      const ox = px + Math.sin(a) * (i - 1.5) * 0.45, oz = pz + Math.cos(a) * (i - 1.5) * 0.45;
      cyl(g, M.iron, 0.05, 0.05, 1.7, 5, ox, y0 + 0.85, oz);
    }
    // and a post in the middle of the sand, cut about
    post(g, M.wood, 0.28, x0, z0, y0 + 2.2, y0, 7);
    box(g, M.iron, 0.9, 0.9, 0.1, x0, y0 + 1.7, z0, site.facing);
  }
  out.bodyR = outer + 1.4;
  out.tall = ARENA_TIERS * 0.85 + 4;
}

// ---- 8. the fountain --------------------------------------------------------

const BASIN_R = 3.0;

function buildFountain(site, ground, rng, out) {
  const { g } = out;
  const x0 = site.x, z0 = site.z, y0 = site.y;

  // the basin: an open wall of stone with a rim on it
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(BASIN_R, BASIN_R, 0.95, 20, 1, true), M.stoneShell);
  wall.position.set(x0, y0 + 0.4, z0);
  wall.castShadow = true;
  g.add(wall);
  ring(g, M.stonePale, BASIN_R - 0.05, BASIN_R + 0.32, x0, y0 + 0.88, z0);
  cyl(g, M.stoneDark, BASIN_R, BASIN_R, 0.3, 20, x0, y0 + 0.1, z0);

  // the water. `water.js`'s own material is a full screen refraction shader that
  // wants the scene colour and depth textures; it cannot be hung on a three
  // metre disc inside a site marker. So this is a flat plane in that shader's
  // own shallow colour (uShallow, 0x2f9c98), which is the nearest a still puddle
  // gets to the sea it was taken from.
  const w = new THREE.Mesh(new THREE.CircleGeometry(BASIN_R - 0.12, 20), M.water);
  w.rotation.x = -Math.PI / 2;
  w.position.set(x0, y0 + 0.72, z0);
  g.add(w);

  // the pedestal, the figure on it, and the spout it pours from
  cyl(g, M.stoneDark, 0.75, 0.95, 1.15, 10, x0, y0 + 0.75, z0);
  statue(g, M.stonePale, x0, y0 + 1.3, z0, site.facing, 2.3);
  cyl(g, M.water, 0.09, 0.13, 1.5, 6, x0 + Math.sin(site.facing) * 0.5, y0 + 1.4, z0 + Math.cos(site.facing) * 0.5);

  // a paved apron, so it reads as somewhere people stopped
  ring(g, M.stoneDark, BASIN_R + 0.35, BASIN_R + 1.3, x0, y0 + 0.02, z0);
  out.bodyR = BASIN_R + 1.4;
  out.tall = 4.5;
}

// ---- 9. the gate ------------------------------------------------------------

const GATE_SPAN = 9.0;         // metres between the pillars

function buildGate(site, ground, rng, out) {
  const { g } = out;
  const x0 = site.x, z0 = site.z, y0 = site.y;
  const across = site.facing + Math.PI / 2;
  const H = 6.4;

  for (const side of [-1, 1]) {
    const px = x0 + Math.sin(across) * (GATE_SPAN / 2) * side;
    const pz = z0 + Math.cos(across) * (GATE_SPAN / 2) * side;
    const gy = ground(px, pz);
    box(g, M.stoneDark, 2.6, 0.5, 2.6, px, gy + 0.05, pz, site.facing);      // the plinth
    pier(g, M.stone, 1.7, 1.7, px, pz, y0 + H, gy, site.facing);
    box(g, M.stonePale, 2.1, 0.36, 2.1, px, y0 + H + 0.18, pz, site.facing); // the cap
  }
  // the lintel across the top, and a cornice over it
  box(g, M.stone, GATE_SPAN + 2.6, 1.5, 1.5, x0, y0 + H + 1.1, z0, across + Math.PI / 2);
  box(g, M.stonePale, GATE_SPAN + 3.2, 0.4, 1.9, x0, y0 + H + 2.05, z0, across + Math.PI / 2);
  // two blocks on the cornice, because a gate with nothing on it reads as a bar
  for (const side of [-1, 1]) {
    box(g, M.stoneDark, 0.9, 0.9, 0.9,
      x0 + Math.sin(across) * (GATE_SPAN / 2 + 0.9) * side, y0 + H + 2.7,
      z0 + Math.cos(across) * (GATE_SPAN / 2 + 0.9) * side, site.facing);
  }

  // the word, cut into the lintel on both faces. An EXTRA, because the merge
  // deletes uvs and a lettered board without uvs is a blank board.
  const word = site.word || gateWord(site.name);
  const tex = wordTexture(word);
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, transparent: true, color: 0xffffff });
  for (const face of [-1, 1]) {
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(GATE_SPAN + 1.4, 1.0), mat);
    plate.position.set(x0 + Math.sin(site.facing) * 0.78 * face, y0 + H + 1.1, z0 + Math.cos(site.facing) * 0.78 * face);
    plate.rotation.y = site.facing + (face < 0 ? Math.PI : 0);
    out.extras.push(plate);
  }
  out.word = word;
  out.bodyR = GATE_SPAN / 2 + 1.8;
  out.tall = H + 4;
}

// ---- 10. the burned farm ----------------------------------------------------

/**
 * Blacken a kit building.
 *
 * The farm kit's houses and barns are dozens of small meshes in twenty odd
 * colours. Rather than a table mapping every one of them to a charred version,
 * each material is replaced by ONE of three shared charred materials chosen by
 * how bright the original was, which is both cheaper for the merge (three
 * buckets instead of twenty) and truer: fire does not keep a palette.
 */
function blacken(obj) {
  obj.traverse((o) => {
    if (!o.isMesh || !o.material || Array.isArray(o.material)) return;
    const c = o.material.color;
    const lum = c ? (c.r * 0.35 + c.g * 0.5 + c.b * 0.15) : 0.4;
    o.material = lum > 0.62 ? M.ash : lum > 0.3 ? M.charred : M.dark;
    o.castShadow = true; o.receiveShadow = true;
  });
  return obj;
}

function buildBurnedFarm(site, ground, rng, out) {
  const { g } = out;
  const x0 = site.x, z0 = site.z, y0 = site.y;
  const c = Math.cos(site.facing), s = Math.sin(site.facing);
  const P = (u, v) => [x0 + c * u + s * v, z0 - s * u + c * v];

  // the house, burned down to about two thirds of itself
  const [hx, hz] = P(-4.5, 1.5);
  const house = blacken(buildFarmhouse(2, {}));
  house.position.set(hx, ground(hx, hz) - 0.1, hz);
  house.rotation.y = site.facing + 0.15;
  house.scale.y = 0.68;
  g.add(house);
  // and the barn, further gone than the house
  const [bx, bz] = P(6.0, -2.0);
  const barn = blacken(buildBarn(1));
  barn.position.set(bx, ground(bx, bz) - 0.1, bz);
  barn.rotation.y = site.facing - 0.5;
  barn.scale.y = 0.52;
  g.add(barn);

  // the roof, where it went: charred beams leaning out of both of them
  for (const [cx2, cz2, n] of [[hx, hz, 5], [bx, bz, 4]]) {
    for (let i = 0; i < n; i++) {
      const a = rng() * Math.PI * 2, d = 1.4 + rng() * 2.4;
      const px = cx2 + Math.cos(a) * d, pz = cz2 + Math.sin(a) * d;
      const gy = ground(px, pz);
      const beam = box(g, M.charred, 0.24, 4.2, 0.24, px, gy + 1.5, pz, a);
      beam.rotation.z = 0.7 + rng() * 0.5;
      beam.rotation.x = (rng() - 0.5) * 0.4;
    }
  }
  // ash on the ground between them
  for (let i = 0; i < 9; i++) {
    const a = rng() * Math.PI * 2, d = rng() * 8;
    const px = x0 + Math.cos(a) * d, pz = z0 + Math.sin(a) * d;
    ring(g, M.ash, 0, 0.8 + rng() * 0.9, px, ground(px, pz) + 0.03, pz);
  }

  // the cart they took what they wanted out of, tipped on its side
  {
    const [cx2, cz2] = P(0.5, 6.0);
    const gy = ground(cx2, cz2);
    const bed = box(g, M.charred, 2.7, 0.35, 1.5, cx2, gy + 0.75, cz2, site.facing + 0.4);
    bed.rotation.z = 1.1;
    for (const side of [-1, 1]) {
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.13, 5, 12), M.charred);
      wheel.position.set(cx2 + Math.sin(site.facing) * 0.9 * side, gy + 0.55, cz2 + Math.cos(site.facing) * 0.9 * side);
      wheel.rotation.set(0.9, site.facing, 0);
      wheel.castShadow = true;
      g.add(wheel);
    }
    box(g, M.charred, 0.2, 2.4, 0.2, cx2 + Math.sin(site.facing + 1.2) * 1.6, gy + 0.4, cz2 + Math.cos(site.facing + 1.2) * 1.6, site.facing).rotation.z = 1.4;
    // a sack that split, which is why the raiders left it
    ball(g, M.canvas, 0.42, 7, cx2 + 1.3, gy + 0.35, cz2 - 0.6);
  }

  // and it is still going in two places: the house and the barn
  out.fires.push({ x: hx, y: ground(hx, hz) + 1.4, z: hz, kind: 'wreck', scale: 1.0 });
  out.fires.push({ x: bx, y: ground(bx, bz) + 1.0, z: bz, kind: 'wreck', scale: 0.8 });
  out.bodyR = 10.5;
  out.tall = 8;
}

// ---- 11. the watchtower -----------------------------------------------------

const WATCH_H = 12;

function buildWatchtower(site, ground, rng, out) {
  const { g } = out;
  const x0 = site.x, z0 = site.z, y0 = site.y;
  const deck = y0 + WATCH_H * 0.72;

  // four legs, splayed, each reaching its own ground
  const foot = 2.6, top = 1.5;
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4 + site.facing;
    const fxp = x0 + Math.cos(a) * foot, fzp = z0 + Math.sin(a) * foot;
    const txp = x0 + Math.cos(a) * top, tzp = z0 + Math.sin(a) * top;
    const gy = ground(fxp, fzp);
    const len = Math.hypot(txp - fxp, tzp - fzp, deck - (gy - SINK));
    const leg = cyl(g, M.wood, 0.17, 0.21, len, 6, (fxp + txp) / 2, (gy - SINK + deck) / 2, (fzp + tzp) / 2);
    leg.lookAt(new THREE.Vector3(txp, deck, tzp));
    leg.rotateX(Math.PI / 2);
  }
  // three levels of cross bracing, so it reads as built and not as sticks
  for (let lvl = 1; lvl <= 3; lvl++) {
    const y = y0 + (deck - y0) * (lvl / 4);
    const r = foot + (top - foot) * (lvl / 4);
    for (let i = 0; i < 4; i++) {
      const a0 = (i / 4) * Math.PI * 2 + Math.PI / 4 + site.facing;
      const a1 = ((i + 1) / 4) * Math.PI * 2 + Math.PI / 4 + site.facing;
      const ax = x0 + Math.cos(a0) * r, az = z0 + Math.sin(a0) * r;
      const bx2 = x0 + Math.cos(a1) * r, bz2 = z0 + Math.sin(a1) * r;
      box(g, M.wood, Math.hypot(bx2 - ax, bz2 - az), 0.14, 0.14, (ax + bx2) / 2, y, (az + bz2) / 2,
        Math.atan2(bx2 - ax, bz2 - az) + Math.PI / 2);
    }
  }
  // the platform, its rail and its ladder
  box(g, M.wood, 3.6, 0.24, 3.6, x0, deck + 0.12, z0, site.facing);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4 + site.facing;
    box(g, M.wood, 0.14, 1.0, 0.14, x0 + Math.cos(a) * 1.7, deck + 0.62, z0 + Math.sin(a) * 1.7);
    const a1 = ((i + 1) / 4) * Math.PI * 2 + Math.PI / 4 + site.facing;
    const ax = x0 + Math.cos(a) * 1.7, az = z0 + Math.sin(a) * 1.7;
    const bx2 = x0 + Math.cos(a1) * 1.7, bz2 = z0 + Math.sin(a1) * 1.7;
    box(g, M.wood, Math.hypot(bx2 - ax, bz2 - az), 0.12, 0.12, (ax + bx2) / 2, deck + 1.05, (az + bz2) / 2,
      Math.atan2(bx2 - ax, bz2 - az) + Math.PI / 2);
  }
  const lx = x0 + Math.sin(site.facing) * 2.0, lz = z0 + Math.cos(site.facing) * 2.0;
  for (let i = 0; i < 10; i++) {
    box(g, M.wood, 0.8, 0.08, 0.08, lx, y0 + 0.6 + i * 0.85, lz, site.facing + Math.PI / 2);
  }
  for (const side of [-1, 1]) {
    post(g, M.wood, 0.08, lx + Math.cos(site.facing) * 0.4 * side, lz - Math.sin(site.facing) * 0.4 * side,
      deck, ground(lx, lz), 5);
  }
  // a shingle canopy over half of it, and the brazier under the open half
  box(g, M.woodDark, 3.9, 0.18, 2.0, x0 - Math.sin(site.facing) * 0.9, deck + 2.3, z0 - Math.cos(site.facing) * 0.9, site.facing);
  for (const side of [-1, 1]) {
    box(g, M.wood, 0.12, 2.2, 0.12, x0 - Math.sin(site.facing) * 0.9 + Math.cos(site.facing) * 1.7 * side,
      deck + 1.2, z0 - Math.cos(site.facing) * 0.9 - Math.sin(site.facing) * 1.7 * side);
  }
  const bx3 = x0 + Math.sin(site.facing) * 0.8, bz3 = z0 + Math.cos(site.facing) * 0.8;
  brazier(g, M.stoneDark, bx3, deck + 0.24, bz3, 0.8);
  out.fires.push({ x: bx3, y: deck + 0.24 + 1.5 * 0.8, z: bz3, kind: 'brazier', scale: 0.8 });
  out.bodyR = 4.0;
  out.tall = WATCH_H;
}

// ------------------------------------------------------------------ dispatch --

export const BUILDERS = {
  tower: buildTower,
  temple: buildTemple,
  castle: buildCastle,
  bandit_camp: buildBanditCamp,
  graveyard: buildGraveyard,
  tomb: buildTomb,
  arena: buildArena,
  fountain: buildFountain,
  gate: buildGate,
  burned_farm: buildBurnedFarm,
  watchtower: buildWatchtower,
};

/**
 * One wild structure, ready to be merged.
 *
 * @param site      the rolled site
 * @param heightAt  the ground, already flattened by the site's own pad
 * @returns { kind, group, fires, glows, extras, door, word, bodyR, tall } or
 *          null for a kind this file does not build, so a caller can fall back
 */
export function buildStructure(site, heightAt) {
  const fn = BUILDERS[site.kind];
  if (!fn) return null;
  const ground = (x, z) => heightAt(x, z);
  const rng = mulberry32(hash2(site.cx, site.cz, 4211));
  const out = {
    kind: site.kind,
    g: new THREE.Group(),
    fires: [], glows: [], extras: [],
    door: null, word: null, bodyR: 0, tall: 0,
  };
  out.g.name = `structure:${site.kind}`;
  fn(site, ground, rng, out);
  return {
    kind: site.kind, group: out.g,
    fires: out.fires, glows: out.glows, extras: out.extras,
    door: out.door, word: out.word, bodyR: out.bodyR, tall: out.tall,
  };
}

/** Triangles under an object. Same count `mine_models.trisOf` makes. */
export function trisOf(obj) {
  let n = 0;
  obj.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const g = o.geometry;
    n += g.index ? g.index.count / 3 : g.attributes.position.count / 3;
  });
  return n;
}

/**
 * Every claim this file makes about itself, checked at import.
 *
 * One case is never the case: a twelfth row in WILD_KINDS with no builder here
 * would roll a site the world could not draw, and the first anybody would know
 * is an empty patch of levelled ground.
 */
export function auditStructures() {
  const bad = [];
  for (const [, kind] of WILD_KINDS) {
    if (typeof BUILDERS[kind] !== 'function') bad.push(`sitegrid rolls a "${kind}" and structures.js cannot build one`);
  }
  for (const kind of Object.keys(BUILDERS)) {
    if (!WILD_KIND_IDS.has(kind)) bad.push(`structures.js builds a "${kind}" that sitegrid never rolls`);
  }
  if (bad.length) throw new Error('structures.js:\n  ' + bad.join('\n  '));
  return { kinds: Object.keys(BUILDERS).length };
}

auditStructures();
