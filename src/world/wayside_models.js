// The bodies of the road furniture: lamp posts, signposts, milestones,
// bridges, border gates, benches, hitching posts and wayside shrines.
//
// `wayside.js` says where every piece stands and what style it is; this file
// builds it, one group per chunk, and hands the runtime a layer that streams
// exactly the way flora does.
//
//   const wayside = createWayside(scene, field);
//   chunks.js onBuilt  -> wayside.onChunk(cx, cz, verts)
//   chunks.js onDisposed -> wayside.offChunk(cx, cz)
//   every frame        -> wayside.update(dt, nightFactor)
//
// ---- the light, and why there is almost none of it -------------------------
//
// A lit road at night is the point of the exercise, and a PointLight per lamp
// would be forty lights in the streamed ring, which no forward renderer will
// take. So a lamp lights itself: its glass is an emissive material that comes
// up at dusk, and the halo around it is one point of an additively blended
// THREE.Points cloud, one cloud for the whole chunk, one draw call. That is
// what you see from two hundred metres.
//
// ONE real light per chunk, at the lamp nearest the chunk's own centre, throws
// the only light that actually falls on the ground. In the streamed ring that
// is at most one per loaded chunk and in practice a handful within any sight
// line, which is the budget dungeon.js keeps underground (LIGHT_BUDGET) and
// the same reasoning: lights are the thing a scene runs out of first.
//
// `setNight(f)` drives all three from one number, 0 in full day and 1 at
// midnight, which is `1 - dayFactor` as `world_runtime.update` is handed it.
// Everything is switched off, not merely hidden, below NIGHT_ON: a hidden mesh
// that is still emissive comes back lit the moment anything else turns it on,
// which is a bug that has been written in this codebase before.
//
// ---- draw calls -----------------------------------------------------------
//
// Pieces are bucketed by kind and realm, each bucket merged by material
// (`site_models.mergeByMaterial`), and every mesh that comes out carries
// `userData.wayside = { kind, realm }`, which is why the merge is per bucket
// and not per chunk: a merge across kinds would fuse a bench into a lamp post
// and there would be no way left to say which triangle is which.
// `waysideDrawCalls` counts what that comes to and `wayside.test.mjs` measures
// it on the busiest chunk in the world.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mergeByMaterial } from './site_models.js';
import { CHUNK } from './field.js';
import { waysideFor, styleFor, WAYSIDE_STYLE, KIND_ORDER } from './wayside.js';

/** Night factor below which every light in the layer is off, not dim. */
export const NIGHT_ON = 0.02;
/** How bright a lamp's glass goes at full night. mine_models uses 2.2. */
export const LAMP_GLOW = 2.4;
/** How bright the one real light in a chunk goes, and how far it reaches. */
export const LAMP_LIGHT = 7;
export const LAMP_RANGE = 26;
/** How many flicker groups a chunk's glass is split into. */
export const FLICKER_GROUPS = 3;
/** Metres across, the halo drawn round a lit lamp. */
export const GLOW_SIZE = 2.2;
/** Chunks at fewer terrain vertices than this carry no furniture. */
export const WAYSIDE_TIER = 17;
/** A sign board, in metres: long enough to read a place name off at six. */
export const BOARD = { w: 1.35, h: 0.3, t: 0.05 };
/** The canvas a board's text is painted on. 512 over 1.35 m is 379 px a metre. */
export const BOARD_PX = [512, 128];

// ------------------------------------------------------------- the materials --
//
// Shared and never disposed: there are a few dozen of them for the whole
// world, they are keyed by what they are, and a chunk leaving the ring throws
// away its geometry and keeps its materials, which is what stops a walk across
// the map from allocating a material per lamp post.

const MATS = new Map();
function mat(hex, o = {}) {
  const key = hex + ':' + (o.rough ?? 0.9) + ':' + (o.metal ?? 0) + ':' + (o.opacity ?? 1);
  let m = MATS.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color: hex, roughness: o.rough ?? 0.9, metalness: o.metal ?? 0,
      flatShading: o.flat !== false,
      transparent: (o.opacity ?? 1) < 1, opacity: o.opacity ?? 1,
    });
    MATS.set(key, m);
  }
  return m;
}

/** A fresh emissive material for one flicker group. Disposed with its chunk. */
const glassMaterial = (hex) => new THREE.MeshStandardMaterial({
  color: hex, emissive: hex, emissiveIntensity: 0,
  roughness: 0.25, metalness: 0, transparent: true, opacity: 0.72,
});

// ---------------------------------------------------------------- the kit --

const box = (g, m, w, h, d, x, y, z, ry = 0) => {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  o.position.set(x, y, z); o.rotation.y = ry; g.add(o); return o;
};
const cyl = (g, m, rt, rb, h, seg, x, y, z) => {
  const o = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  o.position.set(x, y, z); g.add(o); return o;
};
const cone = (g, m, r, h, seg, x, y, z) => {
  const o = new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), m);
  o.position.set(x, y, z); g.add(o); return o;
};
const sph = (g, m, r, x, y, z) => {
  const o = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), m);
  o.position.set(x, y, z); g.add(o); return o;
};
/** A glass part: it lights at dusk and is merged apart from everything else. */
function glass(g, x, y, z, geo) {
  const o = new THREE.Mesh(geo, GLASS_STAND_IN);
  o.position.set(x, y, z);
  o.userData.glass = true;
  g.add(o);
  return o;
}
const GLASS_STAND_IN = new THREE.MeshBasicMaterial();

/** Where the halo hangs on this piece, in the piece's own frame. */
const glowAt = (g, x, y, z, k = 1) => { (g.userData.glows ||= []).push([x, y, z, k]); };

// ------------------------------------------------------------- the letters --
//
// A sign is only a sign if it can be read. The board is BOARD.w across and the
// canvas is BOARD_PX wide, so a capital at 62 px is 0.16 m tall on the board;
// at six metres, through a 60 degree camera on a 1080 line screen, that is
// about twenty six lines of pixels, which is a comfortable read. The test
// measures the arithmetic rather than trusting this paragraph.

const TEXTURES = new Map();
/** Painted boards, kept by their words: thirty signs in the world, no more. */
export const TEXTURE_CAP = 400;

export function boardTexture(text, sub, ink = '#2a2118', bg = '#b39566') {
  const key = `${text}|${sub}|${ink}|${bg}`;
  const had = TEXTURES.get(key);
  if (had) return had;
  if (TEXTURES.size > TEXTURE_CAP) {
    for (const [k, t] of TEXTURES) { t.dispose?.(); TEXTURES.delete(k); }
  }
  const [W, H] = BOARD_PX;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const c = canvas.getContext('2d');
  c.fillStyle = bg; c.fillRect(0, 0, W, H);
  c.fillStyle = 'rgba(0,0,0,0.18)';
  c.fillRect(0, 0, W, 6); c.fillRect(0, H - 6, W, 6);
  c.fillStyle = ink;
  c.textBaseline = 'middle';
  c.textAlign = 'center';
  c.font = 'bold 62px Georgia, "Times New Roman", serif';
  c.fillText(String(text), W * (sub ? 0.44 : 0.5), H * 0.5);
  if (sub) {
    c.font = '44px Georgia, "Times New Roman", serif';
    c.textAlign = 'right';
    c.fillText(String(sub), W - 18, H * 0.54);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  TEXTURES.set(key, tex);
  return tex;
}

/**
 * A finger board, hung on the post at height `y` and pointing along the local
 * bearing `phi`, with the words painted on both faces.
 *
 * `phi` is measured the way every bearing in this game is, `atan2(dx, dz)`, in
 * the SIGN'S OWN frame: the group is already turned to the road, so a finger
 * that points at a place bearing `b` in the world is at `b - rec.yaw` here.
 * The plank's long axis is its X, and three maps a mesh's +X to
 * `(cos ry, -sin ry)`, so the rotation that lays it along `(sin phi, cos phi)`
 * is `phi - PI/2`. The two painted faces look out along the plank's normal,
 * which is a quarter turn either side of that.
 */
function board(g, text, sub, phi, y, style) {
  const dx = Math.sin(phi), dz = Math.cos(phi);
  const cx = dx * (BOARD.w / 2), cz = dz * (BOARD.w / 2);
  const plank = box(g, mat(style.wood), BOARD.w, BOARD.h, BOARD.t, cx, y, cz, phi - Math.PI / 2);
  plank.userData.plank = true;
  const tex = boardTexture(text, sub, '#241c14', '#' + ('00000' + (style.stone & 0xffffff).toString(16)).slice(-6));
  const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 });
  for (const s of [1, -1]) {
    const psi = phi + s * (Math.PI / 2);
    const nx = Math.sin(psi), nz = Math.cos(psi);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(BOARD.w * 0.94, BOARD.h * 0.82), m);
    face.position.set(cx + nx * (BOARD.t / 2 + 0.006), y, cz + nz * (BOARD.t / 2 + 0.006));
    face.rotation.y = psi;
    face.userData.painted = true;
    g.add(face);
  }
  // the point of the finger, so a board reads as an arm and not a plank
  const tip = new THREE.Mesh(new THREE.ConeGeometry(BOARD.h * 0.62, 0.26, 3), mat(style.wood));
  tip.position.set(dx * (BOARD.w / 2 + 0.11), y, dz * (BOARD.w / 2 + 0.11));
  tip.rotation.order = 'YXZ';
  tip.rotation.set(Math.PI / 2, phi, 0);
  g.add(tip);
}

// ---------------------------------------------------------------- the lamps --
//
// Eight lamps, one per realm's own materials. Every one of them: a body that
// merges, a `glass` part that lights, and a glow point where the flame is.

const LAMPS = {
  iron(g, st) {                         // the Greenwold: iron, glass, an oak post
    const wood = mat(st.wood), iron = mat(st.metal, { rough: 0.6, metal: 0.5 });
    cyl(g, wood, 0.085, 0.11, 3.4, 6, 0, 1.7, 0);
    box(g, iron, 0.1, 0.08, 0.5, 0, 3.32, 0.22);
    cyl(g, iron, 0.03, 0.03, 0.2, 5, 0, 3.2, 0.44);
    cyl(g, iron, 0.15, 0.17, 0.05, 4, 0, 2.82, 0.44);
    glass(g, 0, 3.0, 0.44, new THREE.CylinderGeometry(0.14, 0.16, 0.34, 4));
    cone(g, iron, 0.22, 0.14, 4, 0, 3.24, 0.44);
    glowAt(g, 0, 3.0, 0.44);
  },
  paper(g, st) {                        // Verdant Deep: cane, rope and paper
    const cane = mat(st.wood), rope = mat(st.metal, { rough: 1 });
    cyl(g, cane, 0.06, 0.08, 3.1, 5, 0, 1.55, 0);
    cyl(g, cane, 0.05, 0.05, 0.7, 4, 0, 3.02, 0.3).rotation.x = Math.PI / 2;
    cyl(g, rope, 0.015, 0.015, 0.3, 4, 0, 2.86, 0.58);
    glass(g, 0, 2.55, 0.58, new THREE.SphereGeometry(0.24, 8, 6));
    cyl(g, cane, 0.06, 0.06, 0.05, 6, 0, 2.32, 0.58);
    glowAt(g, 0, 2.55, 0.58, 1.15);
  },
  whale(g, st) {                        // the Saltmarch: whale oil in driftwood
    const wood = mat(st.wood), brass = mat(st.metal, { rough: 0.5, metal: 0.55 });
    cyl(g, wood, 0.1, 0.14, 2.9, 5, 0, 1.45, 0);
    box(g, wood, 0.5, 0.1, 0.1, 0.18, 2.82, 0);
    cyl(g, brass, 0.19, 0.2, 0.06, 8, 0.38, 2.5, 0);
    glass(g, 0.38, 2.28, 0, new THREE.CylinderGeometry(0.19, 0.19, 0.36, 8));
    cone(g, brass, 0.25, 0.18, 8, 0.38, 2.16, 0);
    glowAt(g, 0.38, 2.28, 0);
  },
  brass(g, st) {                        // the wastes and the Throne: brass
    const brass = mat(st.metal, { rough: 0.35, metal: 0.7 }), dark = mat(st.wood);
    cyl(g, dark, 0.19, 0.24, 0.3, 8, 0, 0.15, 0);
    cyl(g, brass, 0.09, 0.13, 3.6, 8, 0, 1.9, 0);
    cyl(g, brass, 0.16, 0.1, 0.14, 8, 0, 3.72, 0);
    glass(g, 0, 3.98, 0, new THREE.SphereGeometry(0.25, 8, 6));
    cone(g, brass, 0.16, 0.22, 8, 0, 4.28, 0);
    glowAt(g, 0, 3.98, 0, 1.2);
  },
  cairn(g, st) {                        // the Stormpeaks: a cairn with a lamp in it
    const stone = mat(st.stone), slate = mat(st.wood);
    let y = 0;
    // eight courses, each a little smaller: a cairn a rider can see over the
    // snow, which a knee high pile of stones is not
    for (const [w, h] of [[1.05, 0.34], [0.95, 0.3], [0.86, 0.28], [0.78, 0.26],
      [0.7, 0.24], [0.62, 0.24], [0.54, 0.22], [0.46, 0.2]]) {
      box(g, stone, w, h, w * 0.9, 0, y + h / 2, 0, y * 2.3);
      y += h;
    }
    box(g, slate, 0.46, 0.07, 0.46, 0, y + 0.035, 0);
    glass(g, 0, y + 0.32, 0, new THREE.BoxGeometry(0.28, 0.46, 0.28));
    box(g, slate, 0.44, 0.08, 0.44, 0, y + 0.6, 0);
    cone(g, slate, 0.3, 0.24, 4, 0, y + 0.76, 0);
    glowAt(g, 0, y + 0.32, 0, 0.9);
  },
  bone(g, st) {                         // the Boneyard: a rib, and tallow burning
    const bone = mat(st.stone), dark = mat(st.wood);
    cyl(g, bone, 0.07, 0.13, 2.6, 6, 0, 1.3, 0);
    cyl(g, bone, 0.06, 0.07, 0.5, 5, 0.12, 2.6, 0).rotation.z = 0.5;
    sph(g, bone, 0.11, 0.24, 2.78, 0);
    cyl(g, dark, 0.16, 0.1, 0.12, 6, 0.24, 2.9, 0);
    glass(g, 0.24, 3.02, 0, new THREE.SphereGeometry(0.14, 6, 5));
    glowAt(g, 0.24, 3.02, 0, 0.95);
  },
  ice(g, st) {                          // Frostreach: a lantern cut out of ice
    const ice = mat(st.stone, { rough: 0.3, opacity: 0.85 }), wood = mat(st.wood);
    cyl(g, wood, 0.1, 0.13, 2.4, 5, 0, 1.2, 0);
    box(g, ice, 0.34, 0.12, 0.34, 0, 2.44, 0);
    glass(g, 0, 2.78, 0, new THREE.BoxGeometry(0.3, 0.56, 0.3));
    cone(g, ice, 0.3, 0.3, 4, 0, 3.2, 0);
    glowAt(g, 0, 2.78, 0, 1.1);
  },
  marble(g, st) {                       // the Sunken Kingdom: drowned marble
    const marble = mat(st.stone, { rough: 0.4 }), coral = mat(st.metal);
    cyl(g, marble, 0.2, 0.26, 0.22, 8, 0, 0.11, 0);
    cyl(g, marble, 0.1, 0.12, 3.1, 8, 0, 1.72, 0);
    for (let i = 0; i < 3; i++) {
      const a = i * 2.1;
      box(g, coral, 0.06, 0.5, 0.06, Math.cos(a) * 0.13, 0.7 + i * 0.2, Math.sin(a) * 0.13, a);
    }
    cyl(g, marble, 0.2, 0.13, 0.16, 8, 0, 3.36, 0);
    glass(g, 0, 3.62, 0, new THREE.SphereGeometry(0.23, 8, 6));
    glowAt(g, 0, 3.62, 0, 1.1);
  },
};

// -------------------------------------------------------------- the bridges --

function deckOf(g, rec, st, mDeck, mRail) {
  const len = Math.max(2, Math.hypot(rec.x1 - rec.x0, rec.z1 - rec.z0));
  const w = rec.width;
  const drop = rec.y1 - rec.y0;
  const pitch = Math.atan2(drop, len);
  const deck = box(g, mDeck, w, 0.34, len, 0, 0, 0);
  deck.rotation.x = -pitch;
  for (const s of [-1, 1]) {
    const rail = box(g, mRail, 0.16, 0.62, len, s * (w / 2 - 0.1), 0.48, 0);
    rail.rotation.x = -pitch;
    const n = Math.max(2, Math.round(len / 4));
    for (let i = 0; i <= n; i++) {
      const u = i / n;
      box(g, mRail, 0.14, 0.66, 0.14, s * (w / 2 - 0.1), 0.2 + drop * (u - 0.5) * 0, -len / 2 + u * len);
    }
  }
  return { len, pitch };
}

const BRIDGES = {
  stone(g, rec, st) {
    const stone = mat(st.stone), dark = mat(st.wood);
    const { len } = deckOf(g, rec, st, stone, stone);
    const arches = Math.max(1, Math.round(len / 26));
    const bay = len / arches;
    const rise = Math.min(3.2, Math.max(1.2, (rec.y0 + rec.y1) / 2 - rec.bed - 0.6));
    for (let a = 0; a < arches; a++) {
      const z0 = -len / 2 + bay * a + bay / 2;
      // the voussoirs of one arch, as a ring of stones under the deck
      const seg = 9;
      for (let i = 0; i < seg; i++) {
        const th = Math.PI * (i + 0.5) / seg;
        const x = Math.cos(th) * (bay / 2 - 0.2), y = -0.2 - rise + Math.sin(th) * rise;
        const v = box(g, stone, rec.width * 0.9, 0.5, bay / seg + 0.22, 0, y, z0 + x);
        v.rotation.x = th - Math.PI / 2;
      }
      if (a > 0) {
        const pierH = rise + Math.max(0.6, (rec.y0 + rec.y1) / 2 - rec.bed - rise);
        box(g, dark, rec.width * 0.7, pierH, 1.5, 0, -0.3 - pierH / 2, -len / 2 + bay * a);
      }
    }
    // the abutments, which is what makes it land on the bank
    for (const s of [-1, 1]) box(g, stone, rec.width + 0.6, 1.6, 1.6, 0, -0.9, s * (len / 2 - 0.4));
  },
  timber(g, rec, st) {
    const wood = mat(st.wood), dark = mat(st.metal, { rough: 1 });
    const { len } = deckOf(g, rec, st, wood, wood);
    const bays = Math.max(1, Math.round(len / 7));
    const depth = Math.max(1.2, (rec.y0 + rec.y1) / 2 - rec.bed);
    for (let i = 1; i < bays; i++) {
      const z = -len / 2 + (len / bays) * i;
      for (const s of [-1, 1]) {
        const pile = cyl(g, wood, 0.16, 0.2, depth, 5, s * (rec.width / 2 - 0.5), -depth / 2, z);
        pile.rotation.x = 0.05 * s;
      }
      box(g, dark, rec.width, 0.22, 0.3, 0, -0.28, z);
    }
    for (const s of [-1, 1]) box(g, wood, 1.2, 1.1, 1.2, 0, -0.65, s * (len / 2 - 0.3));
  },
  rope(g, rec, st) {
    const wood = mat(st.wood), rope = mat(st.metal, { rough: 1 });
    const len = Math.max(2, Math.hypot(rec.x1 - rec.x0, rec.z1 - rec.z0));
    const drop = rec.y1 - rec.y0;
    const pitch = Math.atan2(drop, len);
    // planks, laid flat on the line the deck runs, because the deck is what
    // the player walks on and a sagging one would drop him in the river
    const planks = Math.max(4, Math.round(len / 0.9));
    for (let i = 0; i < planks; i++) {
      const u = (i + 0.5) / planks;
      const p = box(g, wood, rec.width * 0.8, 0.12, 0.62, 0, 0, -len / 2 + u * len);
      p.rotation.x = -pitch;
      p.rotation.z = 0.02 * Math.sin(i * 1.7);
    }
    // two hand ropes and the hangers, which do sag
    const n = 14;
    for (const s of [-1, 1]) {
      for (let i = 0; i < n; i++) {
        const u = (i + 0.5) / n, z = -len / 2 + u * len;
        const sag = Math.sin(Math.PI * u) * Math.min(1.4, len * 0.03);
        const r = cyl(g, rope, 0.05, 0.05, len / n + 0.3, 4, s * (rec.width / 2 - 0.2), 1.0 - sag, z);
        r.rotation.x = Math.PI / 2;
        if (i % 3 === 0) cyl(g, rope, 0.03, 0.03, 1.0, 4, s * (rec.width / 2 - 0.2), 0.5 - sag / 2, z);
      }
      for (const e of [-1, 1]) box(g, wood, 0.3, 2.4, 0.3, s * (rec.width / 2 - 0.2), 0.9, e * (len / 2 + 0.2));
    }
  },
  bone(g, rec, st) {
    const bone = mat(st.stone), dark = mat(st.wood);
    const { len } = deckOf(g, rec, st, dark, bone);
    const ribs = Math.max(2, Math.round(len / 6));
    const rise = Math.min(4, Math.max(1.4, (rec.y0 + rec.y1) / 2 - rec.bed));
    for (let i = 0; i <= ribs; i++) {
      const z = -len / 2 + (len / ribs) * i;
      for (const s of [-1, 1]) {
        const seg = 5;
        for (let k = 0; k < seg; k++) {
          const th = (Math.PI / 2) * (k + 0.5) / seg;
          const rb = cyl(g, bone, 0.11, 0.13, rise / seg + 0.2, 5,
            s * Math.sin(th) * (rec.width / 2), -Math.cos(th) * rise - 0.2, z);
          rb.rotation.z = -s * th;
        }
      }
    }
  },
};

// ---------------------------------------------------------------- the gates --

const GATES = {
  stone(g, rec, st) {
    const stone = mat(st.stone), dark = mat(st.wood);
    const h = rec.height, w = rec.half;
    for (const s of [-1, 1]) {
      box(g, stone, 1.5, 0.5, 1.9, s * w, 0.25, 0);
      box(g, stone, 1.15, h - 1.2, 1.4, s * w, (h - 1.2) / 2 + 0.5, 0);
      box(g, stone, 1.4, 0.4, 1.7, s * w, h - 0.5, 0);
    }
    box(g, stone, w * 2 + 1.4, 1.15, 1.5, 0, h - 0.05, 0);
    box(g, dark, w * 2 + 0.6, 0.2, 1.7, 0, h - 0.72, 0);
  },
  timber(g, rec, st) {
    const wood = mat(st.wood), dark = mat(st.metal, { rough: 1 });
    const h = rec.height, w = rec.half;
    for (const s of [-1, 1]) {
      cyl(g, wood, 0.42, 0.55, h, 6, s * w, h / 2, 0);
      const brace = box(g, wood, 0.3, 2.6, 0.3, s * (w - 0.9), h - 1.9, 0);
      brace.rotation.z = s * 0.7;
    }
    box(g, wood, w * 2 + 1.6, 0.7, 0.9, 0, h - 0.35, 0);
    box(g, dark, w * 2 + 0.4, 0.16, 1.1, 0, h - 0.95, 0);
  },
  bone(g, rec, st) {
    const bone = mat(st.stone), dark = mat(st.wood);
    const h = rec.height, w = rec.half;
    for (const s of [-1, 1]) {
      cyl(g, bone, 0.34, 0.62, h * 0.92, 6, s * w, h * 0.46, 0);
      sph(g, bone, 0.5, s * w, h * 0.94, 0);
    }
    const lint = cyl(g, bone, 0.3, 0.3, w * 2 + 1.2, 6, 0, h - 0.4, 0);
    lint.rotation.z = Math.PI / 2;
    box(g, dark, w * 2 * 0.7, 0.14, 0.5, 0, h - 1.1, 0);
  },
};

// ------------------------------------------------------- everything smaller --

function buildSign(g, rec, st) {
  const wood = mat(st.wood), iron = mat(st.metal, { rough: 0.6, metal: 0.4 });
  cyl(g, wood, 0.09, 0.12, 3.0, 6, 0, 1.5, 0);
  cyl(g, iron, 0.13, 0.15, 0.1, 6, 0, 2.98, 0);
  cone(g, iron, 0.16, 0.22, 6, 0, 3.14, 0);
  const n = rec.fingers.length;
  rec.fingers.forEach((f, i) => {
    // the board is hung on the post and swung to the bearing it points at,
    // measured in the piece's own frame, which is already turned to rec.yaw
    board(g, f.name, `${f.dist} m`, f.bearing - rec.yaw, 2.62 - i * 0.42, st);
  });
  if (!n) box(g, wood, 0.5, 0.3, 0.06, 0, 2.5, 0);
}

function buildMilestone(g, rec, st) {
  const stone = mat(st.stone);
  const s = cyl(g, stone, 0.26, 0.34, 1.15, 6, 0, 0.5, 0);
  s.rotation.y = 0.4;
  cone(g, stone, 0.3, 0.26, 6, 0, 1.18, 0);
  const tex = boardTexture(`${Math.round(rec.metres / 100) / 10} km`, '', '#2a2118', '#a49a86');
  const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 1 });
  for (const side of [1, -1]) {
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.2), m);
    face.position.set(0, 0.72, side * 0.29);
    face.rotation.y = side > 0 ? 0 : Math.PI;
    face.userData.painted = true;
    g.add(face);
  }
}

function buildBench(g, rec, st) {
  const wood = mat(st.wood), stone = mat(st.stone);
  box(g, wood, 1.9, 0.12, 0.46, 0, 0.46, 0);
  box(g, wood, 1.9, 0.36, 0.1, 0, 0.72, -0.2);
  for (const s of [-1, 1]) {
    box(g, stone, 0.22, 0.44, 0.42, s * 0.75, 0.22, 0);
  }
}

function buildHitch(g, rec, st) {
  const wood = mat(st.wood);
  for (const s of [-1, 1]) cyl(g, wood, 0.09, 0.11, 1.3, 5, s * 0.9, 0.65, 0);
  const rail = cyl(g, wood, 0.07, 0.07, 2.0, 5, 0, 1.12, 0);
  rail.rotation.z = Math.PI / 2;
  const trough = box(g, wood, 0.9, 0.26, 0.4, 0, 0.14, 0.6);
  trough.rotation.y = 0.2;
}

function buildShrine(g, rec, st) {
  const stone = mat(st.stone), wood = mat(st.wood);
  box(g, stone, 1.0, 0.24, 0.9, 0, 0.12, 0);
  box(g, stone, 0.9, 1.1, 0.7, 0, 0.79, 0);
  box(g, stone, 0.42, 0.62, 0.4, 0, 0.86, 0.2);         // the niche's shadow
  const roof = cone(g, wood, 0.85, 0.5, 4, 0, 1.6, 0);
  roof.rotation.y = Math.PI / 4;
  glass(g, 0, 0.9, 0.34, new THREE.CylinderGeometry(0.08, 0.09, 0.22, 6));
  glowAt(g, 0, 0.9, 0.34, 0.55);
  box(g, wood, 0.5, 0.1, 0.34, 0, 0.32, 0.44);          // the step things are left on
}

// ----------------------------------------------------------- one piece each --

const BUILD = {
  lamp: (g, rec, st) => LAMPS[rec.style](g, st),
  bridge: (g, rec, st) => BRIDGES[rec.style](g, rec, st),
  gate: (g, rec, st) => {
    GATES[rec.style](g, rec, st);
    const tex = boardTexture(rec.label, '', '#efe6d2', '#39332c');
    const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 1 });
    for (const side of [1, -1]) {
      const face = new THREE.Mesh(new THREE.PlaneGeometry(Math.min(4.6, rec.half * 1.6), 0.62), m);
      face.position.set(0, rec.height - 0.72, side * (0.78));
      face.rotation.y = side > 0 ? 0 : Math.PI;
      face.userData.painted = true;
      g.add(face);
    }
  },
  sign: buildSign,
  milestone: buildMilestone,
  bench: buildBench,
  hitch: buildHitch,
  shrine: buildShrine,
};

/**
 * Every style word in `wayside.js` has a builder here and every builder is a
 * style word somewhere, and every kind the placement emits can be built. Run
 * at import, both directions, so a lamp nobody can build fails on the way in
 * rather than as a hole in the road at midnight.
 */
export function auditWaysideModels() {
  const bad = [];
  const lampWords = new Set(), bridgeWords = new Set(), gateWords = new Set();
  for (const [realm, st] of Object.entries(WAYSIDE_STYLE)) {
    lampWords.add(st.lamp); bridgeWords.add(st.bridge); gateWords.add(st.gate);
    if (!LAMPS[st.lamp]) bad.push(`${realm} asks for a "${st.lamp}" lamp and nothing builds one`);
    if (!BRIDGES[st.bridge]) bad.push(`${realm} asks for a "${st.bridge}" bridge and nothing builds one`);
    if (!GATES[st.gate]) bad.push(`${realm} asks for a "${st.gate}" gate and nothing builds one`);
  }
  for (const w of Object.keys(LAMPS)) if (!lampWords.has(w)) bad.push(`the "${w}" lamp belongs to no realm`);
  for (const w of Object.keys(BRIDGES)) if (!bridgeWords.has(w)) bad.push(`the "${w}" bridge belongs to no realm`);
  for (const w of Object.keys(GATES)) if (!gateWords.has(w)) bad.push(`the "${w}" gate belongs to no realm`);
  for (const k of KIND_ORDER) if (!BUILD[k]) bad.push(`nothing builds a "${k}"`);
  for (const k of Object.keys(BUILD)) if (!KIND_ORDER.includes(k)) bad.push(`"${k}" is built and never placed`);
  if (bad.length) throw new Error('wayside_models: ' + bad.join('; '));
  return { lamps: lampWords.size, bridges: bridgeWords.size, gates: gateWords.size };
}
auditWaysideModels();

// ------------------------------------------------------------ one chunk of it --

const glowTextureCache = { tex: null };
function glowTexture() {
  if (glowTextureCache.tex) return glowTextureCache.tex;
  const canvas = document.createElement('canvas');
  canvas.width = 64; canvas.height = 64;
  const c = canvas.getContext('2d');
  const grd = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.35, 'rgba(255,240,210,0.55)');
  grd.addColorStop(1, 'rgba(255,220,170,0)');
  c.fillStyle = grd; c.fillRect(0, 0, 64, 64);
  glowTextureCache.tex = new THREE.CanvasTexture(canvas);
  return glowTextureCache.tex;
}

/**
 * One chunk's furniture, as a group with a light in it and a `setNight`.
 *
 * `records` is what `waysideFor` returned; `centre` is the chunk's own middle,
 * which is where the one real light goes looking for a lamp.
 */
export function buildWaysideChunk(records, opts = {}) {
  const group = new THREE.Group();
  group.name = 'wayside:chunk';
  const glassMats = [], boardMats = [];
  const glowPos = [], glowCol = [], glowScale = [];
  const buckets = new Map();
  const disposables = [];

  for (const rec of records) {
    const st = styleFor(rec.realm);
    const build = BUILD[rec.kind];
    if (!build) continue;
    const g = new THREE.Group();
    g.position.set(rec.x, rec.y, rec.z);
    g.rotation.y = rec.yaw || 0;
    build(g, rec, st);
    g.updateWorldMatrix(true, true);
    // the halos, in world space, one point each
    const col = new THREE.Color(rec.glow ?? 0xffca7a);
    for (const [gx, gy, gz, k] of g.userData.glows || []) {
      const v = new THREE.Vector3(gx, gy, gz).applyMatrix4(g.matrixWorld);
      glowPos.push(v.x, v.y, v.z);
      glowCol.push(col.r, col.g, col.b);
      glowScale.push(k);
    }
    const key = rec.kind + '|' + rec.realm;
    let b = buckets.get(key);
    if (!b) { b = { kind: rec.kind, realm: rec.realm, glow: rec.glow, parts: [], glass: [], painted: [] }; buckets.set(key, b); }
    // The painted faces come out before the merge as well, and for a harder
    // reason than the glass: `mergeByMaterial` buckets by COLOUR, and every
    // board's material is a white standard material with a different texture
    // on it, so a merge would fuse four boards into one and paint all four
    // with whichever name came first. They are merged here instead, by the
    // material itself, which is one draw call a board.
    const painted = [];
    g.traverse((o) => { if (o.isMesh && o.userData.painted) painted.push(o); });
    for (const o of painted) {
      o.updateWorldMatrix(true, false);
      const geo = o.geometry.clone();
      geo.applyMatrix4(o.matrixWorld);
      b.painted.push({ geo, mat: o.material });
      o.parent.remove(o);
      o.geometry.dispose();
    }
    // the glass comes out before the merge: it is the one thing that changes
    const glassMeshes = [];
    g.traverse((o) => { if (o.isMesh && o.userData.glass) glassMeshes.push(o); });
    for (const o of glassMeshes) {
      o.updateWorldMatrix(true, false);
      const geo = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      for (const name of Object.keys(geo.attributes)) if (name !== 'position' && name !== 'normal') geo.deleteAttribute(name);
      if (!geo.attributes.normal) geo.computeVertexNormals();
      geo.applyMatrix4(o.matrixWorld);
      b.glass.push(geo);
      o.parent.remove(o);
      o.geometry.dispose();
    }
    b.parts.push(g);
  }

  let lights = 0;
  for (const b of buckets.values()) {
    const holder = new THREE.Group();
    holder.name = `wayside:${b.kind}`;
    for (const g of b.parts) holder.add(g);
    // mergeByMaterial builds new geometry out of these and drops the meshes,
    // but a dropped mesh's geometry is still a buffer on the card. A site
    // marker is built once; a chunk of lamp posts is built every time the
    // player walks back into it, so these are collected and thrown away.
    const spent = [];
    holder.traverse((o) => { if (o.isMesh && o.geometry) spent.push(o.geometry); });
    const merged = mergeByMaterial(holder);
    for (const geo of spent) geo.dispose();
    merged.traverse((o) => {
      if (!o.isMesh) return;
      o.userData.wayside = { kind: b.kind, realm: b.realm };
      o.castShadow = true; o.receiveShadow = true;
      if (o.geometry) disposables.push(o.geometry);
    });
    group.add(merged);
    // the boards, one mesh per painted texture: the two faces of one finger
    // share a material and merge into one draw call
    const byMat = new Map();
    for (const { geo, mat: m } of b.painted) {
      if (!byMat.has(m)) byMat.set(m, []);
      byMat.get(m).push(geo);
    }
    for (const [m, geos] of byMat) {
      const geo = mergeGeometries(geos, false);
      for (const q of geos) q.dispose();
      if (!geo) continue;
      const mesh = new THREE.Mesh(geo, m);
      mesh.name = 'wayside:board';
      mesh.userData.wayside = { kind: b.kind, realm: b.realm };
      group.add(mesh);
      disposables.push(geo);
      boardMats.push(m);
    }
    // the glass, in FLICKER_GROUPS so a chunk of lamps does not beat as one
    if (b.glass.length) {
      const groups = Math.min(FLICKER_GROUPS, b.glass.length);
      for (let k = 0; k < groups; k++) {
        const mine = b.glass.filter((_, i) => i % groups === k);
        if (!mine.length) continue;
        const geo = mergeGeometries(mine, false);
        if (!geo) continue;
        const m = glassMaterial(b.glow ?? 0xffca7a);
        const mesh = new THREE.Mesh(geo, m);
        mesh.name = 'wayside:glass';
        mesh.userData.wayside = { kind: b.kind, realm: b.realm };
        mesh.visible = false;
        group.add(mesh);
        glassMats.push({ m, mesh, phase: k * 2.1 });
        disposables.push(geo);
      }
      for (const g of b.glass) g.dispose();
    }
  }

  // the halos: one cloud, one draw call, always facing the camera
  let glow = null;
  if (glowPos.length) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(glowPos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(glowCol, 3));
    const m = new THREE.PointsMaterial({
      size: GLOW_SIZE, map: glowTexture(), vertexColors: true, transparent: true,
      opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    });
    glow = new THREE.Points(geo, m);
    glow.name = 'wayside:glow';
    glow.frustumCulled = false;
    glow.visible = false;
    glow.userData.wayside = { kind: 'lamp', realm: null };
    group.add(glow);
    disposables.push(geo);
  }

  // ONE real light, at the lamp nearest the middle of the chunk
  let light = null;
  const centre = opts.centre;
  if (centre && records.length) {
    let best = null, bd = Infinity;
    for (const rec of records) {
      if (rec.kind !== 'lamp') continue;
      const d = (rec.x - centre[0]) ** 2 + (rec.z - centre[1]) ** 2;
      if (d < bd) { bd = d; best = rec; }
    }
    if (best) {
      light = new THREE.PointLight(best.glow ?? 0xffca7a, 0, LAMP_RANGE, 1.5);
      light.position.set(best.x, best.y + 3.0, best.z);
      light.name = 'wayside:light';
      light.visible = false;
      group.add(light);
      lights = 1;
    }
  }

  let t = 0;
  group.userData.wayside = { count: records.length, lights };
  /** 0 in full day, 1 at midnight. The one number the whole layer reads. */
  group.userData.setNight = (nightFactor, dt = 0) => {
    t += dt;
    const k = nightFactor < 0 ? 0 : nightFactor > 1 ? 1 : nightFactor;
    const on = k > NIGHT_ON;
    for (const g of glassMats) {
      g.mesh.visible = on;
      // out, not merely hidden: a hidden thing that is still lit comes back lit
      g.m.emissiveIntensity = on ? k * LAMP_GLOW * (0.84 + 0.16 * Math.sin(t * 6.3 + g.phase) * Math.sin(t * 2.1 + g.phase)) : 0;
    }
    if (glow) {
      glow.visible = on;
      glow.material.opacity = on ? k * 0.85 : 0;
    }
    if (light) {
      light.visible = on;
      light.intensity = on ? k * LAMP_LIGHT : 0;
    }
  };
  group.userData.dispose = () => {
    for (const g of disposables) g.dispose();
    for (const g of glassMats) g.m.dispose();
    // the boards' materials are one per set of words; the TEXTURES behind them
    // are cached and shared, and are not disposed with a chunk
    for (const m of boardMats) m.dispose();
    if (glow) glow.material.dispose();
  };
  group.userData.setNight(0, 0);
  return group;
}

/** Draw calls one built chunk costs. */
export function waysideDrawCalls(group) {
  let n = 0;
  group.traverse((o) => { if (o.isMesh || o.isPoints) n++; });
  return n;
}

// ---------------------------------------------------------------- the layer --

/**
 * The streamed layer. One group per chunk, built when the chunk is meshed and
 * thrown away when it leaves the ring, exactly as flora's records are.
 *
 *   onChunk(cx, cz, verts)   a chunk was built at this detail
 *   offChunk(cx, cz)         it went away
 *   update(dt, nightFactor)  the whole layer's night, once a frame
 */
export function createWayside(scene, field, opts = {}) {
  const group = new THREE.Group();
  group.name = 'world-wayside';
  scene.add(group);
  const chunks = new Map();
  const stats = { chunks: 0, pieces: 0, lights: 0, drawCalls: 0, buildMs: 0, night: 0 };
  const tier = opts.tier ?? WAYSIDE_TIER;
  let night = 0;

  function addChunk(cx, cz) {
    const key = cx + ',' + cz;
    if (chunks.has(key)) return;
    const t0 = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const records = waysideFor(field, cx, cz);
    if (!records.length) { chunks.set(key, null); return; }
    const built = buildWaysideChunk(records, {
      centre: [cx * CHUNK + CHUNK / 2, cz * CHUNK + CHUNK / 2],
    });
    built.userData.setNight(night, 0);
    group.add(built);
    chunks.set(key, built);
    stats.chunks++;
    stats.pieces += records.length;
    stats.lights += built.userData.wayside.lights;
    stats.drawCalls += waysideDrawCalls(built);
    stats.buildMs = +((typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0).toFixed(2);
  }

  function removeChunk(cx, cz) {
    const key = cx + ',' + cz;
    if (!chunks.has(key)) return;
    const built = chunks.get(key);
    chunks.delete(key);
    if (!built) return;
    group.remove(built);
    stats.chunks--;
    stats.pieces -= built.userData.wayside.count;
    stats.lights -= built.userData.wayside.lights;
    stats.drawCalls -= waysideDrawCalls(built);
    built.userData.dispose();
  }

  return {
    group, stats, chunks,
    onChunk(cx, cz, verts) { if (verts >= tier) addChunk(cx, cz); else removeChunk(cx, cz); },
    offChunk(cx, cz) { removeChunk(cx, cz); },
    /** `nightFactor` is 0 in full day and 1 at midnight: `1 - dayFactor`. */
    update(dt, nightFactor) {
      night = nightFactor;
      stats.night = nightFactor;
      for (const built of chunks.values()) built?.userData.setNight(nightFactor, dt);
    },
    dispose() {
      for (const [key, built] of chunks) {
        if (built) { group.remove(built); built.userData.dispose(); }
        chunks.delete(key);
      }
      scene.remove(group);
      stats.chunks = 0; stats.pieces = 0; stats.lights = 0; stats.drawCalls = 0;
    },
  };
}
