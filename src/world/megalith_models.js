// The ten mega structures of the realms sheet and the seventeen landmarks
// beside them, built. `site_models.buildSiteMarker` hands every authored site
// of kind `megastructure` or `landmark` to `buildMegalith`, and what comes back
// is one merged group with `userData.site` on every mesh of it.
//
// WHAT A MEGALITH IS FOR.
//
//   You see it before you get to it. The sheet's word is that a realm's mega
//   structure is visible from the realm's edge, so these bodies are 40 to 120 m
//   across or tall and they are built out of very few colours, because a body
//   that costs thirty draw calls at a kilometre costs thirty draw calls the
//   whole time you are walking toward it. `mergeByMaterial` buckets by colour,
//   so the draw count of a megalith is very nearly the size of its palette:
//   measured in `megalith_models.test.mjs`, none of the twenty seven is over
//   MEGALITH_MAX_DRAWS draws or MEGALITH_MAX_TRIS triangles.
//
// WHAT IS CLIMBED, AND WHERE THE CLIMB LIVES.
//
//   Not here. Two of these are meant to be walked up, the Eyrie's landing steps
//   and the Ashen Gate's road onto the crater rim, and BOTH OF THEM ARE GROUND:
//   `field.js` carries the plateau and the rim as relief, and it carries the
//   one graded way up each of them as relief too. So `heightAt` is the whole of
//   the climb, no hook is needed anywhere, and `field.test.mjs` measures the
//   climb metre by metre. Everything in THIS file is a thing you look at and
//   walk around, and the bodies stand ON the ground rather than being it.
//
// WHERE THE GROUND IS.
//
//   `heightAt` comes in and is asked for every foot of everything, so a body on
//   a slope has its feet on the slope and not in the air. Four of these stand
//   in the sea on purpose (`zones.STANDS_IN_WATER`) and are footed on the sea
//   floor, which is where their own sentences put them.

import * as THREE from 'three';
import { mulberry32, hash2 } from './noise.js';
import { SEA_LEVEL } from './field.js';
import { mergeByMaterial } from './site_models.js';

/** A megalith may cost this many draw calls and no more. Measured in the test. */
export const MEGALITH_MAX_DRAWS = 14;
/** And this many triangles. A body at a kilometre is a silhouette, not a sculpture. */
export const MEGALITH_MAX_TRIS = 30000;
/** The smallest a thing of kind `megastructure` may be, in metres across or up. */
export const MEGALITH_MIN_SPAN = 40;

// ---------------------------------------------------------------- the kit --

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.92, flatShading: true, ...extra });

/**
 * Seventeen colours for twenty seven bodies. Shared on purpose: a palette this
 * small is the whole reason any one of these merges down to a handful of draw
 * calls, and a body that costs a draw call per piece would cost it at every
 * range from a kilometre in.
 */
export const M = {
  stone: mat(0x7d7873),
  stoneDark: mat(0x4a4744),
  stonePale: mat(0xa9a49c),
  rock: mat(0x6e6863),
  wood: mat(0x6b4a2e),
  thatch: mat(0x9a8149),
  bone: mat(0xd8d2c0),
  boneDark: mat(0x9c9482),
  brass: mat(0xa8813a, { metalness: 0.55, roughness: 0.42 }),
  iron: mat(0x3b3a38, { metalness: 0.5, roughness: 0.5 }),
  ice: mat(0xbfe0ee, { transparent: true, opacity: 0.82, roughness: 0.2 }),
  snow: mat(0xeef3f7),
  obsidian: mat(0x14121a, { roughness: 0.22, metalness: 0.2 }),
  ember: mat(0xd2521c, { emissive: 0x8a2c08, emissiveIntensity: 0.9 }),
  glow: mat(0x7fe6d6, { emissive: 0x2e9c8c, emissiveIntensity: 1.0, transparent: true, opacity: 0.8 }),
  water: mat(0x3f7fa6, { transparent: true, opacity: 0.7, roughness: 0.15 }),
  dark: mat(0x0b0a0c),
};

/** Every material this file can put in the world, for the test to count. */
export const MATERIALS = Object.freeze(Object.keys(M));

const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
const cyl = (rt, rb, h, m, seg = 8) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
const cone = (r, h, m, seg = 8) => new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), m);
const ball = (r, m, seg = 8) => new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(4, seg >> 1)), m);
const rock = (r, m) => new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), m);
const ringGeo = (r, tube, m, arc = Math.PI * 2, seg = 12) => new THREE.Mesh(new THREE.TorusGeometry(r, tube, 5, seg, arc), m);

const put = (g, mesh, x, y, z, yaw = 0) => { mesh.position.set(x, y, z); mesh.rotation.y = yaw; mesh.castShadow = true; g.add(mesh); return mesh; };

/**
 * A flight of steps from one point up to another, `n` of them, `w` wide.
 *
 * A BODY AND NOT A CLIMB. The two megaliths a player actually walks up, the
 * Eyrie and the Ashen Gate, are walked up the relief in `field.js`; these
 * treads are what a stair looks like and no promise is made about where a foot
 * lands on one. Where a stair here stands over a climb, the relief under it is
 * the thing the player is really standing on.
 */
function steps(g, m, x0, y0, z0, x1, y1, z1, n, w) {
  const dx = (x1 - x0) / n, dz = (z1 - z0) / n, dy = (y1 - y0) / n;
  const run = Math.hypot(dx, dz) * 1.35;
  const yaw = Math.atan2(dx, dz);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const h = Math.max(0.3, Math.abs(dy) * 1.6);
    const s = box(w, h, run, m);
    put(g, s, x0 + dx * n * t, y0 + dy * n * t - h * 0.4, z0 + dz * n * t, yaw);
  }
}

/** A standing stone: a leaning slab of whatever height, on the ground it finds. */
function menhir(g, m, x, y, z, h, w, rng) {
  const s = box(w, h, w * 0.55, m);
  put(g, s, x, y + h / 2, z, rng() * Math.PI);
  s.rotation.z = (rng() - 0.5) * 0.09;
  s.rotation.x = (rng() - 0.5) * 0.09;
  return s;
}

// ------------------------------------------------------------ the bodies --
//
// One function per place, keyed by the place id in `realms.js`. Each is handed:
//
//   x, z     the site's own centre, in world coordinates
//   y0       the height there
//   ground   (dx, dz) -> the world height that far from the centre
//   rng      seeded from the site's cell, so a body is the same body every
//            time its chunk comes back into range
//
// Everything is built in WORLD coordinates, because `ground` answers in them
// and a body that has to know which way the hill falls cannot be built at the
// origin and moved afterwards.

const BODIES = {

  // ---- the Greenwold ----------------------------------------------------

  /**
   * The Standing Hedge: nine stones on a ring a mile across, and the boundary
   * stones between them.
   *
   * The ring is 1610 m from side to side, which is the sheet's own measurement
   * and much wider than the radius the site marker system keeps a body alive
   * over. `userData.reach` says how far this body really goes; V1.md carries
   * the one line `site_models.createSiteMarkers` needs to read it.
   */
  waystones(g, { rng, x, z, ground }) {
    const R = 805;
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const sx = x + Math.cos(a) * R, sz = z + Math.sin(a) * R;
      const gy = ground(Math.cos(a) * R, Math.sin(a) * R);
      // one of the nine: three metres, with a cap on it, so it reads as made
      menhir(g, M.stonePale, sx, gy, sz, 3, 1.1, rng);
      put(g, box(1.5, 0.35, 1.0, M.stone), sx, gy + 3.1, sz, a);
      // and the boundary stones between this one and the next, low and unshaped
      for (let k = 1; k < 9; k++) {
        const b = a + (k / 9) * (Math.PI * 2 / 9);
        const bx = Math.cos(b) * R, bz = Math.sin(b) * R;
        menhir(g, M.stone, x + bx, ground(bx, bz), z + bz, 0.7 + rng() * 0.5, 0.6, rng);
      }
    }
    g.userData.reach = R + 6;
  },

  /** The Mill Run: the wheel, the mill house and the leat that feeds it. */
  millrun(g, { rng, x, z, y0, ground }) {
    const yaw = 0.4;
    put(g, box(9, 7, 12, M.stone), x, y0 + 3.5, z, yaw);
    put(g, box(9.6, 0.6, 12.6, M.thatch), x, y0 + 7.2, z, yaw);
    put(g, cone(7.2, 4.4, M.thatch, 4), x, y0 + 9.3, z, yaw + Math.PI / 4);
    put(g, box(1.4, 2.6, 0.3, M.wood), x + Math.cos(yaw) * 4.6, y0 + 1.3, z - Math.sin(yaw) * 4.6, yaw);
    // the wheel on the gable end, overshot, with the leat over it
    const wx = x - Math.sin(yaw) * 7.4, wz = z - Math.cos(yaw) * 7.4;
    const wy = ground(wx - x, wz - z) + 3.2;
    const wheel = ringGeo(3.2, 0.35, M.wood, Math.PI * 2, 14);
    put(g, wheel, wx, wy, wz, yaw + Math.PI / 2);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const p = box(0.9, 0.12, 1.6, M.wood);
      put(g, p, wx + Math.cos(a) * 2.9 * Math.cos(yaw), wy + Math.sin(a) * 2.9, wz - Math.cos(a) * 2.9 * Math.sin(yaw), yaw);
      p.rotation.x = a;
    }
    put(g, box(1.6, 0.5, 11, M.wood), wx - Math.cos(yaw) * 5, wy + 3.4, wz + Math.sin(yaw) * 5, yaw + Math.PI / 2);
    // sacks on the loading step, because a mill that grinds nothing is scenery
    for (let i = 0; i < 5; i++) {
      const a = rng() * Math.PI * 2, d = 6 + rng() * 4;
      put(g, ball(0.55, M.thatch, 6), x + Math.cos(a) * d, ground(Math.cos(a) * d, Math.sin(a) * d) + 0.5, z + Math.sin(a) * d);
    }
  },

  // ---- Verdant Deep -----------------------------------------------------

  /** The Temple of Faces: a cliff carved with faces, and a stair to the eyes. */
  templeoffaces(g, { rng, x, z, y0, ground }) {
    const W = 74, H = 46;
    // Verdant Deep carries no relief, so the carved cliff is the body: a wall
    // of stone with five faces cut into it and a way in through the largest
    put(g, box(W, H, 22, M.stone), x, y0 + H / 2 - 3, z + 12);
    put(g, box(W + 6, 4, 26, M.stoneDark), x, y0 + H - 2, z + 12);
    for (let i = 0; i < 5; i++) {
      const fx = x + (i - 2) * 15;
      const big = i === 2;
      const s = big ? 1.5 : 1;
      const fy = y0 + 12 * s;
      // brow, cheeks, eyes and mouth: five boxes read as a face at a kilometre
      put(g, box(11 * s, 3 * s, 3.4, M.stonePale), fx, fy + 6.5 * s, z + 1.2);
      put(g, box(9.4 * s, 9 * s, 2.6, M.stonePale), fx, fy, z + 1.6);
      put(g, box(3.0 * s, 2.2 * s, 1.4, M.stoneDark), fx - 2.4 * s, fy + 3.4 * s, z + 0.4);
      put(g, box(3.0 * s, 2.2 * s, 1.4, M.stoneDark), fx + 2.4 * s, fy + 3.4 * s, z + 0.4);
      put(g, box(7.4 * s, 5.2 * s, 1.2, M.stoneDark), fx, fy - 5.2 * s, z + 0.6);
      if (big) {
        put(g, box(7.0, 6.4, 3.2, M.dark), fx, fy - 5.0, z - 0.4);      // the way in
        steps(g, M.stone, fx + 17, ground(17, -6) + 0.2, z - 6, fx + 5.2, fy + 3.4 * s, z - 1.4, 26, 3.4);
      }
    }
    for (let i = 0; i < 7; i++) {
      const a = rng() * Math.PI * 2, d = 22 + rng() * 16;
      put(g, rock(1.2 + rng() * 1.4, M.rock), x + Math.cos(a) * d, ground(Math.cos(a) * d, Math.sin(a) * d) + 0.6, z + Math.sin(a) * d);
    }
  },

  /** The Hanging Gardens: terraces in the cliff face, roots and rope. */
  hanginggardens(g, { rng, x, z, y0 }) {
    const H = 32;
    put(g, box(30, H, 12, M.stone), x, y0 + H / 2 - 2, z + 7);
    for (let i = 0; i < 6; i++) {
      const ty = y0 + 3 + i * 5;
      const w = 24 - i * 2.2;
      put(g, box(w, 0.8, 5.4, M.stoneDark), x, ty, z + (i % 2 ? 1.6 : 0.4));
      put(g, box(w, 1.4, 0.8, M.thatch), x, ty + 1.1, z + (i % 2 ? -0.9 : -2.1));
      put(g, cyl(0.08, 0.08, 5.2, M.wood, 4), x - w / 2 + 1.5 + rng() * (w - 3), ty + 2.6, z - 2.4);
    }
    // the roots you climb, which give way after rain
    for (let i = 0; i < 9; i++) {
      const r = cyl(0.22, 0.34, 10 + rng() * 16, M.wood, 5);
      put(g, r, x - 13 + rng() * 26, y0 + 9 + rng() * 12, z - 2.6 - rng() * 1.6);
      r.rotation.z = (rng() - 0.5) * 0.5;
    }
  },

  /** The Moon Pool: a still pool under the canopy, and no reflection in it. */
  moonpool(g, { rng, x, z, y0, ground }) {
    const bed = new THREE.Mesh(new THREE.CircleGeometry(7.4, 20), M.dark);
    put(g, bed, x, y0 - 0.35, z); bed.rotation.x = -Math.PI / 2;
    const w = new THREE.Mesh(new THREE.CircleGeometry(7.2, 20), M.water);
    put(g, w, x, y0 - 0.28, z); w.rotation.x = -Math.PI / 2;
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 + rng() * 0.1, d = 8 + rng() * 0.8;
      put(g, rock(0.6 + rng() * 0.5, M.stonePale), x + Math.cos(a) * d, ground(Math.cos(a) * d, Math.sin(a) * d) + 0.3, z + Math.sin(a) * d);
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      menhir(g, M.stone, x + Math.cos(a) * 11, ground(Math.cos(a) * 11, Math.sin(a) * 11), z + Math.sin(a) * 11, 2.6, 0.7, rng);
    }
  },

  // ---- the Saltmarch ----------------------------------------------------
  //
  // Its mega structure is the Red Queen's Harbour, which is a town: `zones.js`
  // sends it to T1's `town_models` and this file is never asked for it. That is
  // why there are ten megaliths and not eleven.

  // ---- Ember Wastes -----------------------------------------------------

  /** The Brass City: the walking foundry, knelt at a well, its door open. */
  brasscity(g, { rng, x, z, y0, ground }) {
    const L = 62, W = 34, deck = y0 + 26;
    for (let i = 0; i < 6; i++) {
      const side = i % 2 ? 1 : -1;
      const along = (Math.floor(i / 2) - 1) * 20;
      const lz = side * (W / 2 - 3);
      const gy = ground(along, lz);
      const thigh = cyl(1.9, 2.4, deck - gy - 2, M.brass, 6);
      put(g, thigh, x + along, (gy + deck) / 2 - 1, z + lz);
      thigh.rotation.z = side * 0.16;
      put(g, box(7, 2.2, 5, M.iron), x + along, gy + 1.1, z + lz + side * 1.4);
    }
    put(g, box(L, 9, W, M.brass), x, deck + 4.5, z);
    put(g, box(L * 0.78, 8, W * 0.8, M.iron), x, deck + 13, z);
    put(g, box(L * 0.46, 7, W * 0.55, M.brass), x - 6, deck + 20.5, z);
    for (let i = 0; i < 4; i++) {
      const cx = x - 18 + i * 11, cz = z + (i % 2 ? 5 : -5);
      put(g, cyl(2.0, 2.6, 15, M.iron, 7), cx, deck + 27, cz);
      put(g, cyl(1.7, 1.7, 1.2, M.ember, 7), cx, deck + 34.6, cz);
    }
    // the door, which opens when it kneels, and the ramp down out of it
    put(g, box(8, 10, 1.4, M.dark), x + L / 2 - 0.6, deck + 5, z);
    steps(g, M.iron, x + L / 2 + 16, ground(L / 2 + 16, 0), z, x + L / 2 - 1, deck + 0.4, z, 22, 7);
    put(g, cyl(2.2, 2.4, 1.4, M.stone, 10), x + L / 2 + 22, ground(L / 2 + 22, 6) + 0.7, z + 6);
    for (let i = 0; i < 8; i++) {
      const a = rng() * Math.PI * 2, d = 40 + rng() * 18;
      put(g, rock(1 + rng() * 1.6, M.rock), x + Math.cos(a) * d, ground(Math.cos(a) * d, Math.sin(a) * d) + 0.5, z + Math.sin(a) * d);
    }
  },

  /** The Mirage Palace: the marked flagstone, and nothing else that is real. */
  miragepalace(g, { rng, x, z, y0, ground }) {
    put(g, box(2.4, 0.35, 2.4, M.stonePale), x, y0 + 0.18, z, 0.3);
    put(g, box(1.8, 0.06, 1.8, M.brass), x, y0 + 0.38, z, 0.3);
    // the path is a line of markers on the bearing you have to hold, and it
    // stops, because the palace has no foundation to reach
    for (let i = 1; i <= 14; i++) {
      const d = i * 11;
      const px = Math.cos(0.3) * d, pz = Math.sin(0.3) * d;
      menhir(g, M.stonePale, x + px, ground(px, pz), z + pz, 1.1 - i * 0.05, 0.4, rng);
    }
    for (let i = 0; i < 10; i++) {
      const a = rng() * Math.PI * 2, d = 5 + rng() * 12;
      put(g, rock(0.4 + rng() * 0.6, M.stonePale), x + Math.cos(a) * d, ground(Math.cos(a) * d, Math.sin(a) * d) + 0.25, z + Math.sin(a) * d);
    }
  },

  // ---- the Stormpeaks ---------------------------------------------------

  /**
   * The Eyrie: the riders' hall, the landing, nine perches and the nest.
   *
   * The plateau and the steps up it are GROUND (`zones.REALM_RELIEF`), and this
   * is what stands on top of them.
   */
  eyrie(g, { rng, x, z, y0, ground }) {
    put(g, box(30, 11, 15, M.stoneDark), x, y0 + 5.5, z);
    put(g, box(32, 1.2, 17, M.stone), x, y0 + 11.4, z);
    put(g, cone(17, 7, M.stoneDark, 4), x, y0 + 15, z, Math.PI / 4);
    put(g, box(4.4, 6.5, 0.6, M.dark), x, y0 + 3.2, z + 7.6);
    // the nest platform, out over the plateau's edge on one post
    const px = x + 26, py = ground(26, 0);
    put(g, cyl(0.9, 1.2, Math.max(6, y0 - py + 6), M.wood, 6), px, y0 - 2, z);
    put(g, cyl(14, 14, 1.2, M.wood, 12), px, y0 + 0.6, z);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const s = cyl(0.28, 0.34, 3.4, M.wood, 5);
      put(g, s, px + Math.cos(a) * 12.4, y0 + 2.4, z + Math.sin(a) * 12.4);
      s.rotation.z = Math.cos(a) * 0.28; s.rotation.x = -Math.sin(a) * 0.28;
    }
    // nine stone perches, one for each rider still keeping watch
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.35, d = 22;
      const sx = Math.cos(a) * d, sz = Math.sin(a) * d;
      const gy = ground(sx, sz);
      put(g, cyl(1.6, 2.2, 5.2 + rng() * 1.4, M.stone, 6), x + sx, gy + 2.8, z + sz);
      put(g, box(3.6, 0.5, 3.6, M.stonePale), x + sx, gy + 5.7, z + sz, a);
    }
  },

  /** The Sky Bridge: rope across a chasm a thousand feet deep. */
  skybridge(g, { rng, x, z, ground }) {
    const SPAN = 96, yaw = 0.5;
    const dx = Math.cos(yaw), dz = Math.sin(yaw);
    const ends = [-1, 1].map((s) => ({ s, ax: dx * s * SPAN / 2, az: dz * s * SPAN / 2 }));
    for (const e of ends) {
      const ay = ground(e.ax, e.az);
      put(g, box(7, 6, 7, M.rock), x + e.ax, ay + 2, z + e.az, yaw);
      for (const t of [-1, 1]) put(g, cyl(0.45, 0.55, 6.5, M.wood, 6), x + e.ax - dz * t * 2.4, ay + 6.2, z + e.az + dx * t * 2.4);
    }
    // the deck: planks on a sag, so the middle hangs where a rope hangs
    const ay = (ground(ends[0].ax, ends[0].az) + ground(ends[1].ax, ends[1].az)) / 2;
    const n = 40;
    for (let i = 0; i <= n; i++) {
      const t = i / n, u = (t - 0.5) * 2;
      const px = x + dx * (t - 0.5) * SPAN, pz = z + dz * (t - 0.5) * SPAN;
      const py = ay + 6.4 - (1 - u * u) * 3.4;
      put(g, box(1.9, 0.12, SPAN / n * 0.8, M.wood), px, py, pz, yaw);
      if (i % 4 === 0) for (const s of [-1, 1]) put(g, cyl(0.05, 0.05, 1.5, M.thatch, 4), px - dz * s * 0.95, py + 0.75, pz + dx * s * 0.95);
    }
  },

  /** The Storm Anvil: iron on bare rock, struck by every storm there is. */
  stormanvil(g, { rng, x, z, y0, ground }) {
    put(g, cyl(4.6, 5.6, 2.2, M.rock, 9), x, y0 + 1.1, z);
    put(g, box(1.2, 1.0, 3.2, M.iron), x, y0 + 2.7, z, 0.2);
    put(g, box(2.6, 0.9, 4.6, M.iron), x, y0 + 3.6, z, 0.2);
    put(g, box(0.9, 0.5, 1.6, M.iron), x - 1.7, y0 + 3.8, z + 0.4, 0.2);
    // the ground round it is fused: glass where the strikes landed
    for (let i = 0; i < 12; i++) {
      const a = rng() * Math.PI * 2, d = 6 + rng() * 9;
      put(g, box(0.7 + rng(), 0.2, 0.7 + rng(), M.obsidian), x + Math.cos(a) * d, ground(Math.cos(a) * d, Math.sin(a) * d) + 0.1, z + Math.sin(a) * d, rng() * 3);
    }
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      menhir(g, M.rock, x + Math.cos(a) * 12, ground(Math.cos(a) * 12, Math.sin(a) * 12), z + Math.sin(a) * 12, 3.4, 1.0, rng);
    }
  },

  // ---- the Boneyard -----------------------------------------------------

  /** Ninefall: nine skeletons in a rough ring, a name cut beside each. */
  ninefall(g, { rng, x, z, ground }) {
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + rng() * 0.2;
      const d = 26 + rng() * 12;
      const sx = Math.cos(a) * d, sz = Math.sin(a) * d;
      const gy = ground(sx, sz);
      const yaw = a + Math.PI / 2 + (rng() - 0.5) * 0.6;
      // a skull, a spine, and the ribs that are still standing
      put(g, box(4.4, 3.4, 6.2, M.bone), x + sx, gy + 1.5, z + sz, yaw);
      put(g, box(2.0, 1.6, 2.4, M.boneDark), x + sx + Math.sin(yaw) * 3.6, gy + 1.1, z + sz + Math.cos(yaw) * 3.6, yaw);
      for (let k = 0; k < 7; k++) {
        const t = -3 + k * 1.6;
        put(g, ringGeo(2.2 - Math.abs(t) * 0.16, 0.22, M.bone, Math.PI, 8), x + sx - Math.sin(yaw) * t, gy + 0.4, z + sz - Math.cos(yaw) * t, yaw);
      }
      for (let k = 0; k < 9; k++) {
        const t = -4 - k * 1.5;
        put(g, cyl(0.28, 0.34, 1.6, M.boneDark, 5), x + sx - Math.sin(yaw) * t, gy + 0.7, z + sz - Math.cos(yaw) * t);
      }
      const nx = sx + Math.cos(a) * 6, nz = sz + Math.sin(a) * 6;
      menhir(g, M.stoneDark, x + nx, ground(nx, nz), z + nz, 1.4, 0.7, rng);
    }
    g.userData.reach = 52;
  },

  /** The Skull Lodge: a hunting lodge inside a skull the size of a church. */
  skulllodge(g, { x, z, y0 }) {
    const S = 3.6;                       // the skull is a church, so everything scales
    const yaw = 0.6, sy = Math.sin(yaw), cy = Math.cos(yaw);
    put(g, box(11 * S, 7 * S, 14 * S, M.bone), x, y0 + 3.5 * S, z, yaw);
    put(g, box(6.4 * S, 4.6 * S, 7 * S, M.bone), x + sy * 9 * S, y0 + 2.4 * S, z + cy * 9 * S, yaw);
    // the eyes, with the lights in them
    for (const s of [-1, 1]) {
      const ex = x + sy * 5.6 * S + cy * s * 3.1 * S;
      const ez = z + cy * 5.6 * S - sy * s * 3.1 * S;
      put(g, box(2.6 * S, 2.2 * S, 2.0 * S, M.dark), ex, y0 + 4.6 * S, ez, yaw);
      put(g, box(1.7 * S, 1.4 * S, 0.6 * S, M.ember), ex + sy * 0.8 * S, y0 + 4.6 * S, ez + cy * 0.8 * S, yaw);
    }
    // the teeth, which are the doorway
    for (let i = 0; i < 9; i++) {
      const t = (i - 4) * 1.5 * S;
      const tooth = cone(0.5 * S, 1.8 * S, M.bone, 5);
      put(g, tooth, x + sy * 11.4 * S + cy * t, y0 + 0.9 * S, z + cy * 11.4 * S - sy * t, yaw);
      tooth.rotation.x = Math.PI;
    }
    put(g, box(5 * S, 3 * S, 1.2 * S, M.dark), x + sy * 10.6 * S, y0 + 2.4 * S, z + cy * 10.6 * S, yaw);
    // the chimney out of the crown, because somebody lives in it
    put(g, box(2.2, 6, 2.2, M.stone), x - sy * 8, y0 + 7.6 * S, z - cy * 8, yaw);
  },

  /** The Rib Cathedral: a nave sixty metres long, and the wind playing it. */
  ribcathedral(g, { x, z, y0, ground }) {
    const L = 62, yaw = 0.25;
    const dx = Math.sin(yaw), dz = Math.cos(yaw);
    for (let i = 0; i < 15; i++) {
      const t = (i / 14 - 0.5) * L;
      const h = 30 - Math.abs(t / (L / 2)) * 11;
      const gy = ground(dx * t, dz * t);
      // each rib is a quarter arch either side, meeting over the nave
      for (const s of [-1, 1]) {
        const r = ringGeo(h * 0.55, 0.85 + (1 - Math.abs(t) / (L / 2)) * 0.5, M.bone, Math.PI / 2, 7);
        put(g, r, x + dx * t - dz * s * h * 0.55, gy, z + dz * t + dx * s * h * 0.55, yaw);
        r.rotation.z = s > 0 ? 0 : Math.PI;
      }
      if (i % 3 === 0) put(g, cyl(0.5, 0.9, 2.4, M.boneDark, 6), x + dx * t, gy + 1.2, z + dz * t);
    }
    put(g, box(1.6, 1.6, L, M.boneDark), x, y0 + 29, z, yaw);
    put(g, box(4.4, 1.4, 2.6, M.stoneDark), x, y0 + 0.7, z, yaw);
  },

  // ---- Frostreach -------------------------------------------------------

  /** The Ice Vault: a door in a glacier wall thirty metres high. */
  icevault(g, { rng, x, z, y0 }) {
    const W = 78, H = 32;
    put(g, box(W, H, 20, M.ice), x, y0 + H / 2 - 2, z + 11);
    put(g, box(W * 0.7, 5, 24, M.snow), x, y0 + H - 1, z + 11);
    put(g, box(11, 15, 2.4, M.dark), x, y0 + 7.5, z + 1.4);
    put(g, ringGeo(6.2, 1.0, M.snow, Math.PI, 12), x, y0 + 14.6, z + 1.2);
    for (let i = 0; i < 5; i++) {
      const ic = cyl(0.5, 0.7, 5 + rng() * 3, M.ice, 5);
      put(g, ic, x - 18 + i * 9, y0 + 2.4, z - 3.5 - rng() * 2);
      ic.rotation.x = Math.PI;
    }
    // the Legion's cut: a ramp of spoil and a scaffold against the wall
    put(g, box(16, 3.2, 12, M.rock), x - 26, y0 + 1.4, z - 4, 0.2);
    for (let i = 0; i < 4; i++) put(g, cyl(0.3, 0.3, 12, M.wood, 5), x - 30 + i * 3.4, y0 + 6, z - 1.6);
    put(g, box(12, 0.4, 2.4, M.wood), x - 25, y0 + 11.4, z - 1.6);
  },

  /** The Aurora Shelf: a mile of blank ice, and cairns on the lit path. */
  aurorashelf(g, { rng, x, z, ground }) {
    for (let i = 0; i < 16; i++) {
      const d = -60 + i * 9;
      const px = Math.cos(0.9) * d, pz = Math.sin(0.9) * d;
      let up = ground(px, pz);
      for (let k = 0; k < 3; k++) {
        put(g, rock(0.7 - k * 0.16, M.snow), x + px + (rng() - 0.5) * 0.3, up + 0.5, z + pz + (rng() - 0.5) * 0.3, rng() * 3);
        up += 0.9;
      }
    }
    // and the crevasses that take you if you leave it
    for (let i = 0; i < 7; i++) {
      const a = rng() * Math.PI * 2, d = 22 + rng() * 40;
      const cx = Math.cos(a) * d, cz = Math.sin(a) * d;
      put(g, box(2.2 + rng() * 3, 3, 16 + rng() * 20, M.dark), x + cx, ground(cx, cz) - 1.3, z + cz, rng() * Math.PI);
    }
    g.userData.reach = 70;
  },

  /** The Hot Springs: steaming pools, the only warm ground in the realm. */
  hotsprings(g, { rng, x, z, ground }) {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + rng() * 0.5, d = i ? 8 + rng() * 12 : 0;
      const px = Math.cos(a) * d, pz = Math.sin(a) * d;
      const gy = ground(px, pz);
      const r = 3.2 + rng() * 3;
      const w = new THREE.Mesh(new THREE.CircleGeometry(r, 14), M.water);
      put(g, w, x + px, gy + 0.15, z + pz); w.rotation.x = -Math.PI / 2;
      for (let k = 0; k < 12; k++) {
        const b = (k / 12) * Math.PI * 2;
        put(g, rock(0.5 + rng() * 0.4, M.rock), x + px + Math.cos(b) * (r + 0.5), gy + 0.25, z + pz + Math.sin(b) * (r + 0.5), rng() * 3);
      }
      // the steam, which is what you see from under the pines
      for (let k = 0; k < 3; k++) {
        put(g, ball(1.4 + rng() * 1.2, M.snow, 6), x + px + (rng() - 0.5) * r, gy + 2.2 + k * 1.9, z + pz + (rng() - 0.5) * r);
      }
    }
  },

  // ---- the Sunken Kingdom -----------------------------------------------

  /** The Reef Stair: steps climbing out of the sea onto the reef. */
  reefstair(g, { rng, x, z, y0, ground }) {
    const yaw = 1.1, dx = Math.sin(yaw), dz = Math.cos(yaw);
    steps(g, M.stonePale, x - dx * 26, SEA_LEVEL - 5, z - dz * 26, x, y0 + 0.4, z, 30, 5.2);
    put(g, box(9, 0.9, 9, M.stonePale), x + dx * 3, y0 + 0.5, z + dz * 3, yaw);
    put(g, box(2.2, 3.2, 1.6, M.stone), x + dx * 5.4, y0 + 2.2, z + dz * 5.4, yaw);
    for (let i = 0; i < 8; i++) {
      const a = rng() * Math.PI * 2, d = 8 + rng() * 8;
      put(g, rock(0.8 + rng() * 0.9, M.rock), x + Math.cos(a) * d, ground(Math.cos(a) * d, Math.sin(a) * d) + 0.4, z + Math.sin(a) * d, rng() * 3);
    }
  },

  /** The Drowned Coliseum: a ring of tiers on the sea floor. */
  coliseum(g, { rng, x, z, y0 }) {
    const R = 46;
    for (let i = 0; i < 5; i++) {
      const t = ringGeo(R - i * 6.5, 2.6, M.stonePale, Math.PI * 2, 22);
      put(g, t, x, y0 + 2.4 + i * 3.6, z);
      t.rotation.x = Math.PI / 2;
    }
    const f = new THREE.Mesh(new THREE.CircleGeometry(R - 34, 24), M.stone);
    put(g, f, x, y0 + 0.3, z); f.rotation.x = -Math.PI / 2;
    for (const s of [-1, 1]) {
      put(g, box(7, 9, 3, M.stoneDark), x + s * (R - 3), y0 + 4.5, z);
      put(g, box(4.6, 6, 1.2, M.dark), x + s * (R - 5), y0 + 3, z);
    }
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      put(g, cyl(1.0, 1.2, 10 + rng() * 4, M.stonePale, 7), x + Math.cos(a) * (R + 3), y0 + 5, z + Math.sin(a) * (R + 3));
    }
  },

  /** The Glow: the egg chamber on the sea floor, empty, and still turning. */
  theglow(g, { x, z, y0 }) {
    put(g, ball(11, M.glow, 14), x, y0 + 8, z);
    put(g, ringGeo(16, 1.4, M.stoneDark, Math.PI * 2, 18), x, y0 + 8, z).rotation.x = Math.PI / 2;
    put(g, ringGeo(21, 1.0, M.stoneDark, Math.PI * 2, 18), x, y0 + 8, z).rotation.z = Math.PI / 2;
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      put(g, cyl(0.9, 1.4, 9, M.stone, 6), x + Math.cos(a) * 15, y0 + 4.5, z + Math.sin(a) * 15);
      put(g, ball(1.1, M.glow, 6), x + Math.cos(a) * 15, y0 + 10, z + Math.sin(a) * 15);
    }
  },

  /** The Air Gardens: glass domes on the palace terraces, air still in them. */
  airgardens(g, { rng, x, z, ground }) {
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + 0.3, d = i ? 16 + rng() * 8 : 0;
      const px = Math.cos(a) * d, pz = Math.sin(a) * d;
      const gy = ground(px, pz);
      const r = 5.5 + rng() * 3.5;
      put(g, cyl(r + 1.4, r + 1.8, 1.6, M.stonePale, 12), x + px, gy + 0.8, z + pz);
      put(g, new THREE.Mesh(new THREE.SphereGeometry(r, 12, 7, 0, Math.PI * 2, 0, Math.PI / 2), M.ice), x + px, gy + 1.6, z + pz);
      // the garden inside it, which is the reason to open one
      for (let k = 0; k < 5; k++) {
        const b = rng() * Math.PI * 2, e = rng() * (r - 1.5);
        put(g, cyl(0.14, 0.2, 1.4 + rng(), M.wood, 4), x + px + Math.cos(b) * e, gy + 2.4, z + pz + Math.sin(b) * e);
        put(g, ball(0.6, M.glow, 5), x + px + Math.cos(b) * e, gy + 3.5, z + pz + Math.sin(b) * e);
      }
    }
  },

  /** The Drowned Bell Tower: a tower out of the sea, a stair round it. */
  drownedbell(g, { x, z, y0 }) {
    const H = Math.max(34, SEA_LEVEL - y0 + 30);
    put(g, cyl(4.2, 6.4, H, M.stonePale, 10), x, y0 + H / 2, z);
    // the stair spiralling it, three turns from the floor to the chamber
    const n = 66;
    for (let i = 0; i < n; i++) {
      const t = i / n, a = t * Math.PI * 6, r = 6.2 - t * 1.9;
      put(g, box(3.0, 0.4, 1.7, M.stone), x + Math.cos(a) * r, y0 + 1 + t * (H - 6), z + Math.sin(a) * r, -a);
    }
    // the bell chamber, open on four sides, and the rope down to the water
    put(g, box(11, 0.8, 11, M.stonePale), x, y0 + H - 4.2, z);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      put(g, cyl(0.8, 0.9, 7, M.stonePale, 6), x + Math.cos(a) * 4.2, y0 + H - 0.4, z + Math.sin(a) * 4.2);
    }
    put(g, cone(7.4, 5, M.stoneDark, 4), x, y0 + H + 5.4, z, Math.PI / 4);
    put(g, cyl(1.4, 2.6, 3.4, M.brass, 10), x, y0 + H - 0.6, z);
    put(g, cyl(0.06, 0.06, 12, M.thatch, 4), x, y0 + H - 8, z);
  },

  // ---- the Ashen Throne --------------------------------------------------

  /** The Outer Works: the Legion's lines, earthworks, towers and tents. */
  outerworks(g, { rng, x, z, ground }) {
    const yaw = 0.8, dx = Math.sin(yaw), dz = Math.cos(yaw);
    for (let i = 0; i < 22; i++) {
      const t = (i / 21 - 0.5) * 110;
      const gy = ground(dx * t, dz * t);
      put(g, box(6, 2.6, 6.4, M.rock), x + dx * t, gy + 1.3, z + dz * t, yaw);
      put(g, box(0.4, 2.6, 6.2, M.wood), x + dx * t + Math.cos(yaw) * 3, gy + 3.6, z + dz * t - Math.sin(yaw) * 3, yaw);
    }
    for (let i = 0; i < 3; i++) {
      const t = (i - 1) * 34;
      const px = dx * t - Math.cos(yaw) * 14, pz = dz * t + Math.sin(yaw) * 14;
      const gy = ground(px, pz);
      put(g, box(7, 18, 7, M.wood), x + px, gy + 9, z + pz, yaw);
      put(g, box(8.4, 1, 8.4, M.wood), x + px, gy + 18.4, z + pz, yaw);
      put(g, box(8, 0.5, 1, M.iron), x + px + Math.cos(yaw) * 4.2, gy + 17.4, z + pz - Math.sin(yaw) * 4.2, yaw);
    }
    // ten thousand tents, which is thirty of them at this distance
    for (let i = 0; i < 30; i++) {
      const t = (rng() - 0.5) * 120, u = -22 - rng() * 40;
      const px = dx * t - Math.cos(yaw) * u, pz = dz * t + Math.sin(yaw) * u;
      put(g, cone(2.2, 2.8, M.thatch, 4), x + px, ground(px, pz) + 1.4, z + pz, rng() * 3);
    }
    g.userData.reach = 80;
  },

  /** The Ashen Gate: two towers and a lintel, on the crater rim. */
  ashengate(g, { x, z, y0, ground }) {
    const GAP = 26, H = 54;
    for (const s of [-1, 1]) {
      const off = s * (GAP / 2 + 7);
      const gy = ground(off, 0);
      put(g, box(15, H, 15, M.obsidian), x + off, gy + H / 2, z);
      put(g, box(18, 4, 18, M.iron), x + off, gy + H + 1.6, z);
      put(g, cone(11, 12, M.obsidian, 4), x + off, gy + H + 9, z, Math.PI / 4);
    }
    put(g, box(GAP + 32, 9, 13, M.obsidian), x, y0 + H - 5, z);
    for (let i = 0; i < 9; i++) {
      const t = (i - 4) * 5.2;
      put(g, ball(1.9, M.bone, 7), x + t, y0 + H + 1.6, z + 1.2);
      put(g, box(2.2, 1.2, 1.6, M.boneDark), x + t, y0 + H + 0.4, z + 1.9);
    }
    // the doors, opened from inside by Serle Vane or not at all
    put(g, box(GAP, H - 14, 2.6, M.iron), x, y0 + (H - 14) / 2, z);
    put(g, box(1.6, H - 14, 3.4, M.brass), x, y0 + (H - 14) / 2, z - 0.4);
    // and the fire behind them, which is why you see this from a kilometre
    put(g, box(GAP - 4, 3.4, 1.2, M.ember), x, y0 + 1.7, z - 2.2);
  },

  /** The Steaming Shore: a wall of steam where the lava meets the sea. */
  steamingshore(g, { rng, x, z, ground }) {
    const yaw = 0.35, dx = Math.sin(yaw), dz = Math.cos(yaw);
    for (let i = 0; i < 18; i++) {
      const t = (i / 17 - 0.5) * 130;
      const gy = ground(dx * t, dz * t);
      put(g, box(9, 3.4 + rng() * 2, 8, M.obsidian), x + dx * t, gy + 1.2, z + dz * t, rng() * 0.5);
      put(g, box(8, 0.6, 1.6, M.ember), x + dx * t, gy + 0.6, z + dz * t - 4.4, yaw);
      for (let k = 0; k < 3; k++) {
        put(g, ball(2.6 + rng() * 2.2, M.snow, 6), x + dx * t + (rng() - 0.5) * 8, gy + 4 + k * 4.4 + rng() * 2, z + dz * t - 4 - rng() * 4);
      }
    }
    g.userData.reach = 80;
  },

  /** The Lava Falls: three rivers of red dropping into the sea. */
  lavafalls(g, { rng, x, z, y0 }) {
    const H = 26;
    put(g, box(84, H, 26, M.obsidian), x, y0 + H / 2 - 3, z + 14);
    for (let i = 0; i < 3; i++) {
      const fx = x + (i - 1) * 26;
      put(g, box(7.4, H + 2, 3.4, M.ember), fx, y0 + H / 2 - 2, z + 1.6);
      put(g, box(9, 2.2, 9, M.ember), fx, y0 - 0.6, z - 4);
      // the crust that cools between them, which bears weight while it is dark
      for (let k = 0; k < 4; k++) {
        put(g, box(2.6 + rng() * 2, 0.4, 2.6 + rng() * 2, M.obsidian), fx + (rng() - 0.5) * 8, y0 + 0.6, z - 3 - rng() * 6, rng() * 3);
      }
    }
    put(g, box(90, 5, 5, M.ember), x, y0 + H - 3, z + 2.4);
  },

  /** The Obsidian Bridge: a natural arch of black glass, and no rail. */
  obsidianbridge(g, { x, z, y0, ground }) {
    const SPAN = 190, yaw = 0.7;
    const dx = Math.sin(yaw), dz = Math.cos(yaw);
    const n = 40;
    for (let i = 0; i <= n; i++) {
      const u = (i / n - 0.5) * 2, t = u * SPAN / 2;
      const rise = (1 - u * u) * 17;
      put(g, box(7.4, 1.1, SPAN / n * 1.1, M.obsidian), x + dx * t, y0 + 4 + rise, z + dz * t, yaw);
      if (i % 2 === 0) {
        const drop = Math.max(2, 4 + rise * 0.9);
        put(g, box(5.2 - Math.abs(u) * 1.4, drop, SPAN / n * 1.6, M.obsidian), x + dx * t, y0 + 4 + rise - drop / 2, z + dz * t, yaw);
      }
    }
    for (const s of [-1, 1]) {
      const t = s * SPAN / 2;
      put(g, box(15, 12, 15, M.obsidian), x + dx * t, ground(dx * t, dz * t) + 5, z + dz * t, yaw);
    }
    g.userData.reach = SPAN / 2 + 12;
  },

  /** The Heart Cages: the wall behind the throne, nine cages, nine hearts. */
  heartcages(g, { x, z, y0 }) {
    const W = 62, H = 24;
    put(g, box(W, H, 8, M.obsidian), x, y0 + H / 2, z + 4);
    for (let i = 0; i < 9; i++) {
      const cx = x + (i - 4) * 6.4;
      put(g, box(4.2, 6.0, 4.2, M.iron), cx, y0 + 9, z - 0.6);
      put(g, box(3.0, 4.6, 3.0, M.dark), cx, y0 + 9, z - 1.2);
      put(g, ball(1.0, M.ember, 7), cx, y0 + 9, z - 1.4);
      for (let k = 0; k < 4; k++) put(g, cyl(0.12, 0.12, 6.0, M.iron, 4), cx - 1.8 + k * 1.2, y0 + 9, z - 2.7);
      put(g, cyl(0.09, 0.09, 6.4, M.iron, 4), cx, y0 + 15.2, z - 0.6);
    }
    put(g, box(W + 4, 2.2, 11, M.iron), x, y0 + H + 0.8, z + 4);
  },
};

/** Every place this file builds a body for. */
export const MEGALITH_PLACES = Object.freeze(Object.keys(BODIES));

/**
 * The sheet and this file agree, both ways.
 *
 * Every place `zones.authoredSites()` hands to `buildMegalith` has a body here,
 * and every body here answers a place that exists and is of one of the two
 * kinds. `megalith_models.test.mjs` runs it against the real table, so a place
 * renamed in `realms.js` is a loud failure and not a grey marker somebody
 * notices in a screenshot six weeks later.
 *
 * The Red Queen's Harbour is deliberately absent: the sheet writes it down as a
 * mega structure and `zones.EXTRA_SITE` builds it as a town, so T1 makes it and
 * this file is never asked. That is why there are ten megaliths and not eleven.
 */
export function auditMegaliths(sites) {
  const bad = [];
  const want = new Set();
  for (const s of sites) {
    if (s.kind !== 'megastructure' && s.kind !== 'landmark') continue;
    want.add(s.sub);
    if (!BODIES[s.sub]) bad.push(`the ${s.kind} "${s.name}" (${s.sub}) has no body in megalith_models.js`);
  }
  for (const id of MEGALITH_PLACES) {
    if (!want.has(id)) bad.push(`megalith_models.js builds "${id}", which is no authored megastructure or landmark`);
  }
  if (bad.length) throw new Error(`auditMegaliths: ${bad.length} problem(s)\n  ${bad.join('\n  ')}`);
  return { bodies: MEGALITH_PLACES.length, wanted: want.size };
}

/**
 * The body of one megalith or landmark: merged, tagged, and standing on the
 * ground. Answers null for any other kind of site, so `site_models` falls back
 * to the marker it has always drawn.
 *
 * `heightAt` is the field's own, and every foot of every body reads it, which
 * is why nothing here has to be told which way the hill falls.
 */
export function buildMegalith(site, heightAt) {
  if (!site) return null;
  if (site.kind !== 'megastructure' && site.kind !== 'landmark') return null;
  const build = BODIES[site.sub];
  if (!build) return null;

  const g = new THREE.Group();
  g.name = `site:${site.id}`;
  const rng = mulberry32(hash2(site.cx | 0, site.cz | 0, 613));
  const ground = (dx, dz) => heightAt(site.x + dx, site.z + dz);
  const y0 = typeof site.y === 'number' ? site.y : ground(0, 0);
  build(g, { site, rng, x: site.x, z: site.z, y0, ground, heightAt });

  // what it cost before the merge, so the test can say what the merge saved
  let pieces = 0;
  g.traverse((o) => { if (o.isMesh) pieces++; });
  const merged = mergeByMaterial(g);
  merged.userData.pieces = pieces;
  merged.traverse((o) => { if (o.isMesh) o.userData.site = site; });
  // S2: the Standing Hedge's nine tall stones are the only thing in that body
  // built out of M.stonePale, so after the merge the pale mesh IS the nine, and
  // a ray onto one of them has to come back as a waystone. See S2.md.
  if (site.sub === 'waystones') merged.traverse((o) => { if (o.isMesh && o.material === M.stonePale) o.userData.waystone = true; });
  merged.userData.site = site;
  // How far from the site's centre this body actually reaches, so a caller can
  // keep it alive while the player is standing inside it. Most are small enough
  // for the site's own pad and say nothing; the Standing Hedge is 805 m across
  // and the Obsidian Bridge 107, and both say so. See V1.md, "Wiring".
  merged.userData.reach = g.userData.reach || Math.max(30, (site.flatR || 0) + 30);
  // and the two that reach past a marker radius say so on the site row too, in
  // `zones.BODY_R`, which is where `sites.sitesNear` will read it. The test
  // proves the two numbers are the same number.
  if (site.bodyR) merged.userData.reach = Math.max(merged.userData.reach, site.bodyR);
  return merged;
}
