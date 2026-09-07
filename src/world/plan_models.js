// A named place, built from a plan drawn off a concept image.
//
// The Greenwold's nine places are no longer rolled. Somebody painted each one,
// Fable measured the painting into `docs/concepts/greenwold/PLANS.md`, and
// `src/mmo/plans/*.json` is that measurement as data: what stands where, in
// metres from the place's centre. This file turns one of those plans into a
// group in the world.
//
// WHY THERE ARE STAND-INS AT ALL. The user will model the pieces
// (`docs/concepts/greenwold/MODELS.md` is the list, with the sizes). Until a
// `.glb` exists for a piece, the place still has to be walkable and readable at
// a glance, so every model id in the sheet has a body built out of boxes and
// cylinders at exactly the footprint and height the sheet gives it. When the
// glb lands, `loadProp(id)` puts it in the cache and `buildPlan` takes it
// instead, at the same spot, on the same ground, with the same tags. Nothing
// else in the plan changes and nothing else in the game notices.
//
// WHAT COMES OUT. One `THREE.Group`, merged by material the way a town is, with
// `userData.site` on every mesh so a raycast can name the place, and
// `userData.plan = { id, piece }` so it can name the building. The standing
// stone carries `userData.waystone` and the manor carries `userData.keep`,
// which are the two flags `world_runtime.pick()` already knows how to carry out
// (see `docs/mmo/wiring/T1.md` and `T2.md`).
//
// HOW THE MERGE KEEPS BOTH THE DRAW COUNT AND THE NAMES. `mergeByMaterial`
// bakes every mesh of one colour into one geometry and throws the rest of the
// userData away, so merging a whole village in one pass would leave nothing to
// click. Merging every piece on its own would cost a draw call per building per
// colour, which is over budget before the trees. So pieces are merged in TAG
// groups: every piece whose model id is in `SOLO` gets its own group and its
// own name, and everything else (fences, stalls, barrels, trees, lanes) shares
// one. Measured in `plan_models.test.mjs`: Hearthhome, the largest of the nine,
// and what the other eight cost.

import * as THREE from 'three';
import { mergeByMaterial } from './site_models.js';
import * as arbor from './arbor.js';
import { PALETTES } from './town_layout.js';
import { growBoulder } from './tree_gen.js';
import { KITS } from './dressing.js';
import { bodyFor as dressBody, materialFor as dressMaterial, BODIES as DRESS_BODIES } from './dressing_models.js';
import { SPACES } from '../mmo/spaces/index.js';
import { preparePropLods, instancePropMesh } from './prop_lod.js';
import {
  FOOTPRINT, RUN_SPAN, isRunKind, AREA_KINDS, STANDIN, hasStandIn, SOLO,
  WAYSTONE_MODEL, KEEP_MODEL, PLAN_MARGIN, footprintOf, stopsOf, insidePlan,
} from '../mmo/plans/footprints.js';

// The tables are declared in `src/mmo/plans/footprints.js`, which is pure, and
// are re-exported here so that `plan_models.FOOTPRINT` is the same object the
// plans are audited against and there is no second copy to drift.
export {
  FOOTPRINT, RUN_SPAN, isRunKind, AREA_KINDS, STANDIN, hasStandIn, SOLO,
  WAYSTONE_MODEL, KEEP_MODEL, PLAN_MARGIN, footprintOf, stopsOf, insidePlan,
};

/** No plan may cost more draw calls than this once merged. A town's budget. */
export const PLAN_MAX_DRAWS = 60;

/**
 * Nor more milliseconds to build, measured warm in node.
 *
 * `createSiteMarkers.update` builds ONE marker a frame on purpose, so this is
 * paid in a single frame when a place comes into range. Hearthhome is the
 * expensive one and `plan_models.test.mjs` prints what all nine cost.
 */
export const PLAN_MAX_MS = 40;

/** How far a foot is bedded into its own ground, metres. Structures.js's number. */
export const SINK = 0.18;

/** How far a ground treatment floats over the terrain under it, metres. */
export const DECAL_LIFT = 0.06;

/** Where a piece's glb lives once the user has made it. */
export const PROP_DIR = '/models/props/';
export const propUrlFor = (id) => PROP_DIR + id + '.glb';

// ------------------------------------------------------------------ palette --
//
// One material per colour per realm, cached, because `mergeByMaterial` buckets
// by colour and a colour is a draw call. The town palette is the realm's own
// (`town_layout.PALETTES`), so a plan and a town in the same realm are built out
// of the same limewash and the same thatch. The naturals below are shared by
// every realm because a beech trunk is a beech trunk in all of them.

const NATURAL = {
  leaf: 0x4e6b34,
  leafDark: 0x3a5127,
  bark: 0x4c3b2a,
  earth: 0x6b5a42,
  mud: 0x4a3f30,
  bare: 0x8a8172,
  wheat: 0xc9a94e,
  chalk: 0xd9d6cc,
  water: 0x2f6b7a,
  bone: 0xcabfa4,
  canvas: 0xbfa878,
  rust: 0x7a4a2e,
};

const matCache = new Map();     // realm:name -> material
function palette(realm) {
  const p = PALETTES[realm] || PALETTES.greenwold;
  const get = (name) => {
    const key = `${p.id}:${name}`;
    let m = matCache.get(key);
    if (m) return m;
    const hex = NATURAL[name] ?? p[name] ?? p.stone;
    const opts = { color: hex, roughness: 0.92, flatShading: true };
    if (name === 'metal' || name === 'glow') { opts.metalness = 0.4; opts.roughness = 0.45; }
    if (name === 'water') { opts.transparent = true; opts.opacity = 0.72; opts.roughness = 0.2; }
    m = new THREE.MeshStandardMaterial(opts);
    matCache.set(key, m);
    return m;
  };
  return get;
}

// ---------------------------------------------------------------- primitives

const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
const cyl = (rt, rb, h, m, seg = 8) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
const cone = (r, h, m, seg = 7) => new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), m);
const ball = (r, m, seg = 7) => new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(3, seg - 3)), m);

function put(g, mesh, x, y, z, ry = 0, rx = 0, rz = 0) {
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  mesh.castShadow = true; mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}

/** A gable roof over a w by d box whose walls stop at `wallH`. */
function gable(g, w, d, wallH, ridge, m) {
  const rise = Math.max(0.4, ridge - wallH);
  const pitch = Math.atan2(rise, d / 2);
  const slope = Math.hypot(d / 2, rise);
  for (const s of [1, -1]) {
    const p = box(w + 0.5, 0.22, slope + 0.2, m);
    put(g, p, 0, wallH + rise / 2, s * d / 4, 0, s * -pitch, 0);
  }
  // the two gable ends, so the roof is not a floating tent
  for (const s of [1, -1]) {
    const tri = new THREE.Mesh(new THREE.ConeGeometry(d / 2, rise, 3), m);
    put(g, tri, s * w / 2, wallH + rise / 2, 0, 0, 0, Math.PI / 2);
    tri.rotation.set(0, Math.PI / 2, Math.PI / 2);
  }
}

// ------------------------------------------------------------------- bodies --
//
// Every builder takes the footprint it must fill and the realm's colours, and
// returns a group standing on y = 0 with its front toward +z, which is the
// space `buildPlan` rotates and drops on the ground. The proportions are the
// sheet's; nothing here is meant to be pretty, only to be the right size, the
// right height and the right way round, so a player can read the place and a
// modeller can hold the glb up against it.

const BODY = {
  /** The last resort: a box exactly the footprint, in the realm's stone. */
  block(w, d, h, c) {
    const g = new THREE.Group();
    put(g, box(w, h, d, c('stone')), 0, h / 2, 0);
    return g;
  },

  /** Walls, a gable roof, and a dark door on the +z face. A cottage or an inn. */
  house(w, d, h, c, o = {}) {
    const g = new THREE.Group();
    const wallH = Math.max(2.2, h * (o.wallShare ?? 0.6));
    put(g, box(w, wallH, d, c(o.wall || 'wall')), 0, wallH / 2, 0);
    gable(g, w, d, wallH, h, c(o.roof || 'roof'));
    const dh = Math.min(2.2, wallH - 0.3), dw = Math.min(1.4, w * 0.3);
    put(g, box(dw, dh, 0.16, c('dark')), 0, dh / 2, d / 2 + 0.03);
    if (o.chimney) put(g, box(0.9, h * 0.35, 0.9, c('stoneDark')), w / 2 - 1.1, h - h * 0.35 / 2 + 0.2, 0);
    return g;
  },

  /**
   * A hall with a square tower on one end, and a door in the +z face.
   *
   * The tower stands at the +x end by default, which is the end the plan turns
   * west when it yaws the manor to 180. `front: true` puts it at the +z end
   * instead, which is what the Sunken Chapel wants: its belfry is over the
   * west door and its nave runs away behind it.
   */
  towered(w, d, h, c, o = {}) {
    const g = new THREE.Group();
    const hallH = o.hallH ?? Math.min(h * 0.55, 8);
    const wallH = hallH * 0.66;
    const front = !!o.front;
    const along = front ? d : w;                 // the axis the tower eats into
    const across = front ? w : d;
    const tw = o.towerW ?? Math.min(6, along * 0.35);
    const hall = along - tw;
    const place = (mesh, u, y, v) => put(g, mesh, front ? v : u, y, front ? u : v);
    place(box(front ? across : hall, wallH, front ? hall : across, c(o.wall || 'stone')), -tw / 2, wallH / 2, 0);
    const sub = new THREE.Group();
    gable(sub, front ? across : hall, front ? hall : across, wallH, hallH, c(o.roof || 'roofDark'));
    if (front) { sub.position.set(0, 0, -tw / 2); } else { sub.position.set(-tw / 2, 0, 0); }
    g.add(sub);
    const th = h - (o.spire ? h * 0.28 : 0);
    place(box(tw, th, tw, c(o.wall || 'stone')), along / 2 - tw / 2, th / 2, 0);
    if (o.spire) place(cone(tw * 0.75, h - th, c('roofDark'), 4), along / 2 - tw / 2, th + (h - th) / 2, 0);
    else place(box(tw + 0.5, 0.5, tw + 0.5, c('roofDark')), along / 2 - tw / 2, th + 0.25, 0);
    const dh = Math.min(2.4, wallH - 0.2);
    if (front) put(g, box(1.5, dh, 0.16, c('dark')), 0, dh / 2, d / 2 + 0.03);
    else put(g, box(1.5, dh, 0.16, c('dark')), -tw / 2, dh / 2, d / 2 + 0.03);
    if (o.steps) for (let i = 0; i < 3; i++) put(g, box(2.6, 0.22, 0.5, c('stoneDark')), -tw / 2, 0.11 + i * 0.22, d / 2 + 0.9 - i * 0.4);
    return g;
  },

  /** Open on the +z face, a stone chimney behind. The smithy. */
  openShed(w, d, h, c) {
    const g = new THREE.Group();
    const wallH = h * 0.62;
    put(g, box(w, wallH, 0.5, c('stone')), 0, wallH / 2, -d / 2 + 0.25);
    for (const s of [1, -1]) put(g, box(0.5, wallH, d, c('stone')), s * (w / 2 - 0.25), wallH / 2, 0);
    gable(g, w, d, wallH, h * 0.86, c('roof'));
    put(g, box(1.2, h, 1.2, c('stoneDark')), -w / 2 + 0.9, h / 2, -d / 2 + 0.6);
    put(g, box(1.1, 0.8, 1.1, c('glow')), 0.6, 0.4, -d / 2 + 1.2);      // the forge
    put(g, cyl(0.35, 0.45, 0.7, c('stoneDark'), 6), -0.9, 0.35, 0.6);    // the anvil
    return g;
  },

  /** Posts, an open front, a hay loft over it. The stable. */
  stable(w, d, h, c) {
    const g = new THREE.Group();
    const wallH = h * 0.6;
    put(g, box(w, wallH, 0.4, c('timber')), 0, wallH / 2, -d / 2 + 0.2);
    for (const s of [1, -1]) put(g, box(0.4, wallH, d, c('timber')), s * (w / 2 - 0.2), wallH / 2, 0);
    for (let i = -1; i <= 1; i++) put(g, cyl(0.16, 0.18, wallH, c('timber'), 6), i * w / 3, wallH / 2, d / 2 - 0.3);
    gable(g, w, d, wallH, h, c('roof'));
    return g;
  },

  /** Post and rail, no roof. A pen. */
  pen(w, d, h, c) {
    const g = new THREE.Group();
    const rail = (len, x, z, ry) => {
      for (const y of [h * 0.45, h * 0.85]) put(g, box(len, 0.1, 0.1, c('timber')), x, y, z, ry);
    };
    rail(w, 0, -d / 2, 0); rail(w, 0, d / 2, 0);
    rail(d, -w / 2, 0, Math.PI / 2); rail(d, w / 2, 0, Math.PI / 2);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(g, box(0.14, h, 0.14, c('timber')), sx * w / 2, h / 2, sz * d / 2);
    return g;
  },

  /** A roofed well on posts. The green's middle. */
  well(w, d, h, c) {
    const g = new THREE.Group();
    put(g, cyl(w * 0.3, w * 0.33, 1, c('stone'), 10), 0, 0.5, 0);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      put(g, cyl(0.09, 0.09, h - 1.1, c('timber'), 5), Math.cos(a) * w * 0.42, (h - 1.1) / 2 + 0.1, Math.sin(a) * w * 0.42);
    }
    put(g, cone(w * 0.6, h * 0.3, c('roofDark'), 8), 0, h - h * 0.15, 0);
    put(g, box(0.35, 0.4, 0.35, c('timber')), 0, 1.3, 0);
    return g;
  },

  /** Four posts, a counter and a striped awning. A market stall. */
  stall(w, d, h, c, o = {}) {
    const g = new THREE.Group();
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(g, cyl(0.06, 0.06, h, c('timber'), 4), sx * (w / 2 - 0.1), h / 2, sz * (d / 2 - 0.1));
    put(g, box(w, 0.12, d * 0.5, c('timber')), 0, h * 0.4, d * 0.2);
    put(g, box(w + 0.4, 0.1, d + 0.3, c(o.awning || 'banner')), 0, h, 0, 0, -0.18, 0);
    put(g, box(w * 0.6, 0.3, d * 0.3, c('trim')), 0, h * 0.4 + 0.2, d * 0.2);
    return g;
  },

  /** A carved sarsen. The waystone, a boundary stone, a milestone, a headstone. */
  stone(w, d, h, c, o = {}) {
    const g = new THREE.Group();
    const m = c(o.stone || 'stone');
    const s = put(g, box(w, h, d, m), 0, h / 2, 0, 0, 0, o.lean || 0);
    s.geometry.scale(1, 1, 1);
    if (h > 2) {
      put(g, box(w * 0.62, h * 0.16, 0.1, c('stoneDark')), 0, h * 0.66, d / 2 + 0.02);   // the face
      put(g, cyl(w * 1.4, w * 1.5, 0.2, c('stoneDark'), 9), 0, 0.1, 0);                  // the pebble ring
    }
    return g;
  },

  /** A post with something on top: a lamp, a fingerpost, a standard, a banner. */
  post(w, d, h, c, o = {}) {
    const g = new THREE.Group();
    put(g, cyl(w * 0.16, w * 0.2, h, c(o.pole || 'metal'), 6), 0, h / 2, 0);
    if (o.head === 'lamp') put(g, box(w * 0.9, w * 0.9, w * 0.9, c('glow')), 0, h - w * 0.5, 0);
    else if (o.head === 'boards') for (let i = 0; i < 3; i++) put(g, box(w, 0.24, 0.06, c('timber')), w * 0.4, h - 0.4 - i * 0.34, 0, i * 1.9);
    else if (o.head === 'sun') put(g, cyl(w * 1.6, w * 1.6, 0.12, c('glow'), 9), 0, h - 0.3, 0, 0, Math.PI / 2, 0);
    else if (o.head === 'banner') put(g, box(w * 1.1, h * 0.5, 0.06, c('dark')), 0, h * 0.62, 0.06);
    return g;
  },

  /** One segment of a wall, a hedge or a cliff face. Runs are made of these. */
  wallSeg(w, d, h, c, o = {}) {
    const g = new THREE.Group();
    put(g, box(w, h, d, c(o.stone || 'stone')), 0, h / 2, 0);
    if (o.cap) put(g, box(w, 0.2, d + 0.2, c('stoneDark')), 0, h + 0.08, 0);
    if (o.seams) for (const y of [h * 0.45, h * 0.7]) put(g, box(w, 0.5, d + 0.06, c(y > h * 0.6 ? 'metal' : 'leafDark')), 0, y, 0);
    return g;
  },

  hedgeSeg(w, d, h, c) {
    const g = new THREE.Group();
    put(g, box(w, h * 0.9, d, c('leafDark')), 0, h * 0.45, 0);
    put(g, box(w * 0.94, h * 0.3, d * 0.9, c('leaf')), 0, h * 0.85, 0);
    return g;
  },

  /** Posts and rails, or sharpened stakes. One segment of a fence. */
  fenceSeg(w, d, h, c, o = {}) {
    const g = new THREE.Group();
    if (o.stakes) {
      const n = Math.max(3, Math.round(w / 0.4));
      for (let i = 0; i < n; i++) {
        const x = -w / 2 + (i + 0.5) * (w / n);
        put(g, cyl(0.02, 0.16, h, c('timber'), 5), x, h / 2, 0);
      }
      return g;
    }
    for (const s of [-1, 1]) put(g, box(0.12, h, 0.12, c('timber')), s * w / 2, h / 2, 0);
    for (const y of [h * 0.45, h * 0.85]) put(g, box(w, 0.08, 0.08, c('timber')), 0, y, 0);
    return g;
  },

  /** Woven willow across the water. An eel weir. */
  weir(w, d, h, c) {
    const g = new THREE.Group();
    for (let i = 0; i < 5; i++) put(g, cyl(0.06, 0.07, h, c('timber'), 5), -w / 2 + (i + 0.5) * (w / 5), h / 2, 0);
    put(g, box(w, h * 0.7, d * 0.6, c('bark')), 0, h * 0.4, 0);
    return g;
  },

  /** Anything flat on the ground: a road slab, a rail, a lily drift, a rooting. */
  slab(w, d, h, c, o = {}) {
    const g = new THREE.Group();
    put(g, box(w, Math.max(0.06, h), d, c(o.stone || 'stone')), 0, Math.max(0.03, h / 2), 0);
    if (o.rails) for (const s of [-1, 1]) put(g, box(w, 0.12, 0.1, c('metal')), 0, h + 0.06, s * d * 0.3);
    return g;
  },

  /** A trunk and a crown. Every tree in the plans. */
  tree(w, d, h, c, o = {}) {
    const g = new THREE.Group();
    const trunkH = h * (o.trunkShare ?? 0.42);
    const r = o.trunkR ?? Math.max(0.3, w * 0.07);
    put(g, cyl(r * 0.75, r, trunkH, c('bark'), 7), 0, trunkH / 2, 0);
    const crownH = h - trunkH;
    if (o.weeping) {
      put(g, ball(w * 0.45, c('leaf'), 8), 0, trunkH + crownH * 0.4, 0).scale.set(1, 0.8, 1);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        put(g, box(0.5, crownH * 0.7, 0.5, c('leafDark')), Math.cos(a) * w * 0.36, trunkH + crownH * 0.25, Math.sin(a) * w * 0.36);
      }
    } else {
      put(g, ball(w * 0.5, c('leaf'), 8), 0, trunkH + crownH * 0.45, 0).scale.set(1, crownH / (w * 0.9), 1);
      put(g, ball(w * 0.3, c('leafDark'), 7), w * 0.2, trunkH + crownH * 0.7, -w * 0.15);
    }
    return g;
  },

  /** A trunk lying down, with fungus. The fallen beech. */
  fallen(w, d, h, c) {
    const g = new THREE.Group();
    const t = put(g, cyl(h * 0.42, h * 0.5, w, c('bark'), 8), 0, h * 0.45, 0);
    t.rotation.z = Math.PI / 2;
    for (let i = 0; i < 4; i++) put(g, cyl(0.32, 0.28, 0.1, c('bone'), 7), -w * 0.3 + i * w * 0.2, h * 0.7, d * 0.3, 0, 0, 0.4);
    return g;
  },

  /** A ridge tent on poles. Legion canvas or a bandit's rag. */
  tent(w, d, h, c, o = {}) {
    const g = new THREE.Group();
    const pitch = Math.atan2(h, w / 2);
    for (const s of [1, -1]) {
      const p = box(Math.hypot(w / 2, h) + 0.1, 0.12, d, c(o.canvas || 'canvas'));
      put(g, p, s * w / 4, h / 2, 0, 0, 0, s * pitch);
    }
    for (const s of [1, -1]) {
      const tri = new THREE.Mesh(new THREE.ConeGeometry(w / 2, h, 3), c(o.canvas || 'canvas'));
      put(g, tri, 0, h / 2, s * d / 2);
      tri.rotation.set(Math.PI / 2, 0, 0);
    }
    if (o.finial) put(g, ball(0.16, c('glow'), 6), 0, h + 0.2, 0);
    return g;
  },

  /** A body on two or four wheels. Every cart in the nine. */
  cart(w, d, h, c, o = {}) {
    const g = new THREE.Group();
    const bed = h * (o.broken ? 0.35 : 0.42);
    const b = put(g, box(w * 0.9, h * 0.3, d * 0.8, c('timber')), 0, bed, 0);
    if (o.broken) b.rotation.z = 0.28;
    if (o.load) put(g, box(w * 0.7, h * 0.35, d * 0.6, c(o.load)), 0, bed + h * 0.32, 0);
    const wr = Math.min(h * 0.42, d * 0.45);
    const wheels = o.wheels ?? 2;
    for (let i = 0; i < wheels; i++) {
      const sx = wheels === 2 ? 0 : (i < 2 ? -1 : 1) * w * 0.3;
      const sz = (i % 2 ? 1 : -1) * d / 2;
      const wh = put(g, cyl(wr, wr, 0.14, c('bark'), 9), sx, wr, sz);
      wh.rotation.set(0, 0, Math.PI / 2);
      if (o.broken && i === 0) { wh.rotation.set(Math.PI / 2, 0, 0); wh.position.set(sx - w * 0.6, 0.1, sz); }
    }
    if (o.shafts) for (const s of [-1, 1]) put(g, box(0.1, 0.1, d * 0.8, c('timber')), s * w * 0.3, bed, d * 0.8);
    return g;
  },

  /** A barrow: one wheel, two handles. */
  barrow(w, d, h, c) {
    const g = new THREE.Group();
    put(g, box(w * 0.7, h * 0.5, d * 0.8, c('timber')), 0, h * 0.5, 0);
    const wh = put(g, cyl(h * 0.3, h * 0.3, 0.1, c('bark'), 8), 0, h * 0.3, d * 0.5);
    wh.rotation.z = Math.PI / 2;
    for (const s of [-1, 1]) put(g, box(0.07, 0.07, d * 0.6, c('timber')), s * w * 0.3, h * 0.55, -d * 0.5);
    return g;
  },

  /** A heap: spoil, a hay rick, a sett, ash. */
  heap(w, d, h, c, o = {}) {
    const g = new THREE.Group();
    put(g, cone(w / 2, h, c(o.stone || 'stone'), 9), 0, h / 2, 0);
    if (o.hole) put(g, box(w * 0.3, h * 0.45, 0.3, c('dark')), 0, h * 0.22, d / 2 - 0.1);
    if (o.ore) put(g, ball(w * 0.16, c('leafDark'), 6), w * 0.22, h * 0.3, w * 0.1);
    return g;
  },

  /** A stone arch half sunk in a bank, with a dark stair behind it. */
  arch(w, d, h, c, o = {}) {
    const g = new THREE.Group();
    const t = Math.max(0.5, w * 0.16);
    for (const s of [-1, 1]) put(g, box(t, h, d, c(o.stone || 'stoneDark')), s * (w / 2 - t / 2), h / 2, 0);
    put(g, box(w, t, d, c(o.stone || 'stoneDark')), 0, h - t / 2, 0);
    put(g, box(w - t * 2, h - t, 0.2, c('dark')), 0, (h - t) / 2, d / 2 - 0.1);
    if (o.timber) for (const s of [-1, 1]) put(g, cyl(0.16, 0.18, h, c('timber'), 6), s * (w / 2 - t), h / 2, d / 2);
    return g;
  },

  /** Timber standing up: a headframe, a lookout, a rack, a dummy. */
  frame(w, d, h, c, o = {}) {
    const g = new THREE.Group();
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const p = put(g, cyl(0.11, 0.14, h, c('timber'), 5), sx * w * 0.4, h / 2, sz * d * 0.4);
      if (o.taper) p.position.set(sx * w * 0.4, h / 2, sz * d * 0.4);
    }
    if (o.wheel) { const wl = put(g, cyl(w * 0.35, w * 0.35, 0.16, c('bark'), 10), 0, h - w * 0.35, 0); wl.rotation.z = Math.PI / 2; }
    if (o.deck) put(g, box(w, 0.16, d, c('timber')), 0, o.deckAt ?? h * 0.8, 0);
    if (o.rail) for (const s of [-1, 1]) put(g, box(w, 0.5, 0.08, c('timber')), 0, (o.deckAt ?? h * 0.8) + 0.35, s * d / 2);
    if (o.ladder) for (let i = 0; i < 6; i++) put(g, box(0.6, 0.06, 0.06, c('timber')), 0, i * (h / 7) + 0.4, d * 0.45);
    if (o.arms) for (const s of [-1, 1]) put(g, box(0.08, 0.08, d, c('timber')), s * w * 0.4, h * 0.75, 0, Math.PI / 2);
    if (o.straw) { put(g, cyl(w * 0.3, w * 0.34, h * 0.55, c('roof'), 7), 0, h * 0.45, 0); put(g, ball(w * 0.3, c('roofDark'), 6), 0, h * 0.85, 0); }
    return g;
  },

  /** A deck on abutments. A footbridge, a road bridge. */
  bridge(w, d, h, c, o = {}) {
    const g = new THREE.Group();
    put(g, box(w, 0.35, d, c(o.deck || 'timber')), 0, h * 0.6, 0);
    for (const s of [-1, 1]) put(g, box(1, h * 0.6, d, c(o.stone || 'stone')), s * (w / 2 - 0.5), h * 0.3, 0);
    if (o.arch) { const a = put(g, cyl(h * 0.5, h * 0.5, d, c(o.stone || 'stone'), 9, true), 0, h * 0.55, 0); a.rotation.x = Math.PI / 2; }
    if (o.rails) for (const s of [-1, 1]) for (const y of [h * 0.85, h * 1.05]) put(g, box(w, 0.07, 0.07, c('timber')), 0, y, s * d / 2);
    if (o.parapet) for (const s of [-1, 1]) put(g, box(w, 0.7, 0.3, c(o.stone || 'stone')), 0, h * 0.95, s * (d / 2 - 0.15));
    return g;
  },

  /** Stone base, an arch through it, a hipped roof. The gate tower. */
  gateTower(w, d, h, c) {
    const g = new THREE.Group();
    const bodyH = h * 0.72;
    for (const s of [-1, 1]) put(g, box(w * 0.3, bodyH, d, c('stone')), s * (w / 2 - w * 0.15), bodyH / 2, 0);
    put(g, box(w, bodyH * 0.28, d, c('timber')), 0, bodyH - bodyH * 0.14, 0);
    put(g, cone(w * 0.72, h - bodyH, c('roofDark'), 4), 0, bodyH + (h - bodyH) / 2, 0, Math.PI / 4);
    put(g, box(w * 0.4, bodyH * 0.6, 0.14, c('dark')), 0, bodyH * 0.3, 0);
    return g;
  },

  /** A hull aground. The rotting boat. */
  boat(w, d, h, c) {
    const g = new THREE.Group();
    const b = put(g, cyl(d * 0.5, d * 0.42, w, c('bark'), 7, true), 0, h * 0.5, 0, 0, 0, Math.PI / 2);
    b.scale.set(1, 1, 0.7);
    put(g, box(w * 0.8, 0.08, d * 0.5, c('timber')), 0, h * 0.7, 0);
    return g;
  },

  /** A ring of stones and charred logs. */
  fire(w, d, h, c) {
    const g = new THREE.Group();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      put(g, ball(w * 0.11, c('stoneDark'), 5), Math.cos(a) * w * 0.42, w * 0.06, Math.sin(a) * w * 0.42);
    }
    for (let i = 0; i < 3; i++) put(g, cyl(0.09, 0.11, w * 0.5, c('dark'), 5), 0, h * 0.4, 0, i * 1.1, 0, Math.PI / 2 - 0.3);
    return g;
  },

  /** A brazier or a lantern: a bowl of light on legs, or on a chain. */
  light(w, d, h, c, o = {}) {
    const g = new THREE.Group();
    if (o.hung) {
      put(g, cyl(0.02, 0.02, h * 0.5, c('metal'), 4), 0, h * 0.75, 0);
      put(g, box(w * 0.7, h * 0.4, w * 0.7, c('glow')), 0, h * 0.3, 0);
      return g;
    }
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      put(g, cyl(0.04, 0.04, h * 0.7, c('metal'), 4), Math.cos(a) * w * 0.25, h * 0.35, Math.sin(a) * w * 0.25);
    }
    put(g, cyl(w * 0.45, w * 0.3, h * 0.3, c('metal'), 8), 0, h * 0.82, 0);
    put(g, cyl(w * 0.36, w * 0.36, 0.1, c('glow'), 8), 0, h * 0.95, 0);
    return g;
  },

  /** The mill: a house with a chimney and a sluice, the wheel is its own piece. */
  mill(w, d, h, c) {
    const g = BODY.house(w, d, h, c, { chimney: true, wall: 'stone' });
    put(g, box(w * 0.9, 0.3, d * 0.2, c('timber')), 0, h * 0.2, d / 2 + 0.4);
    return g;
  },

  /** A paddle wheel standing on its edge. */
  wheel(w, d, h, c) {
    const g = new THREE.Group();
    const r = Math.max(d, h) / 2;
    const hub = put(g, cyl(r, r, w, c('timber'), 12, true), 0, r, 0);
    hub.rotation.z = Math.PI / 2;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      put(g, box(w + 0.2, 0.5, 0.14, c('bark')), 0, r + Math.cos(a) * r * 0.82, Math.sin(a) * r * 0.82, 0, 0, a);
    }
    return g;
  },

  /** A shed on stilts with a ladder. The granary. */
  granary(w, d, h, c) {
    const g = new THREE.Group();
    const legH = h * 0.28;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(g, cyl(0.14, 0.16, legH, c('timber'), 5), sx * w * 0.35, legH / 2, sz * d * 0.35);
    const bodyH = h * 0.4;
    put(g, box(w, bodyH, d, c('wall')), 0, legH + bodyH / 2, 0);
    gable(g, w, d, legH + bodyH, h, c('roof'));
    for (let i = 0; i < 4; i++) put(g, box(0.5, 0.06, 0.06, c('timber')), 0, 0.2 + i * (legH / 4), d * 0.5 + 0.2);
    return g;
  },

  /** Flat stones across a ford. */
  stepping(w, d, h, c) {
    const g = new THREE.Group();
    for (let i = 0; i < 5; i++) put(g, cyl(0.42, 0.46, h, c('stone'), 7), -w / 2 + (i + 0.5) * (w / 5), h / 2, (i % 2 ? 0.18 : -0.18));
    return g;
  },

  /** Offerings at a stone's foot: bowls, a jug, a candle, flowers, pebbles. */
  offerings(w, d, h, c) {
    const g = new THREE.Group();
    put(g, cyl(w * 0.16, w * 0.13, h * 0.4, c('trim'), 7), -w * 0.25, h * 0.2, 0);
    put(g, cyl(w * 0.14, w * 0.11, h * 0.35, c('trim'), 7), w * 0.05, h * 0.18, w * 0.2);
    put(g, cyl(w * 0.1, w * 0.13, h * 0.8, c('bark'), 7), w * 0.28, h * 0.4, -w * 0.1);
    put(g, cyl(0.04, 0.04, h * 0.5, c('glow'), 5), 0, h * 0.25, -w * 0.28);
    put(g, ball(w * 0.12, c('leaf'), 6), -w * 0.05, h * 0.2, -w * 0.05);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; put(g, ball(0.07, c('stoneDark'), 4), Math.cos(a) * w * 0.45, 0.05, Math.sin(a) * w * 0.45); }
    return g;
  },

  /** A pile of bones. The sheep by the fire. */
  bones(w, d, h, c) {
    const g = new THREE.Group();
    put(g, cyl(h * 0.3, h * 0.34, w * 0.6, c('bone'), 7), 0, h * 0.4, 0, 0, 0, Math.PI / 2);
    for (let i = 0; i < 5; i++) put(g, cyl(0.05, 0.05, d * 0.8, c('bone'), 4), -w * 0.25 + i * w * 0.12, h * 0.5, 0, 0, 0.6, 0);
    put(g, ball(h * 0.32, c('bone'), 6), w * 0.42, h * 0.3, 0);
    return g;
  },

  /** A barrel, a crate, a sack, a box of flowers: the small dressing. */
  prop(w, d, h, c, o = {}) {
    const g = new THREE.Group();
    if (o.round) put(g, cyl(w * 0.5, w * 0.42, h, c(o.stone || 'bark'), 9), 0, h / 2, 0);
    else put(g, box(w, h, d, c(o.stone || 'timber')), 0, h / 2, 0);
    if (o.flowers) put(g, ball(w * 0.3, c('leaf'), 5), 0, h + w * 0.15, 0);
    if (o.tool) put(g, cyl(0.03, 0.03, w, c('timber'), 4), 0, h * 0.5, 0, 0, 0, Math.PI / 2.2);
    return g;
  },

  /** A bench: a plank on two legs. */
  bench(w, d, h, c) {
    const g = new THREE.Group();
    put(g, box(w, 0.1, d, c('timber')), 0, h * 0.5, 0);
    for (const s of [-1, 1]) put(g, box(0.1, h * 0.5, d, c('timber')), s * (w / 2 - 0.2), h * 0.25, 0);
    put(g, box(w, h * 0.45, 0.08, c('timber')), 0, h * 0.75, -d / 2);
    return g;
  },
};

// -------------------------------------------------------------- the glb path
//
// `buildPlan` is synchronous, because `site_models.buildSiteMarker` is. So a
// model is loaded ahead of the build and taken out of a cache here. Nothing has
// to change in a plan when a glb lands: `loadProp('inn', url)` once, and every
// Hearthhome built after it has the modelled inn where the box was.
//
// One code path for both places it runs. In the browser the url is
// `/models/props/inn.glb` and the bytes come from `fetch`; in node the url is a
// file on disk and they come from `fs`. Everything after the bytes, the parse,
// the prepare, the cache and the lookup in `buildPlan`, is the same in both, so
// the test path is the real path.

const props = new Map();        // model id -> THREE.Object3D, ready to clone
const pendingProps = new Map();
let gltfLoader = null;

/** Whether a piece has a real model behind it yet. */
export const hasProp = (id) => props.has(id);
/** How many models are loaded, for a report. */
export const propCount = () => props.size;
/**
 * Every copy of one glb model in a plan as instanced meshes: for each mesh in
 * the registered prototype, one InstancedMesh with a matrix per copy, so the
 * geometry, the uvs and the material are the prototype's own and the cost is
 * one draw call per material however many copies stand in the plan.
 *
 * `e.g` holds one group per copy (pieceBody's group, positioned by buildStop)
 * with the clone of the prototype inside it; the clone's world matrix is the
 * copy's placement, and each prototype mesh's own matrix under its wrapper is
 * where that mesh sits inside the model.
 */
export function instancedGlb(e, proto) {
  e.g.updateWorldMatrix(true, true);
  proto.updateMatrixWorld(true);
  const placements = [];
  for (const g of e.g.children) {
    const clone = g.children[0] || g;
    placements.push(clone.matrixWorld.clone());
  }
  const out = new THREE.Group();
  const m4 = new THREE.Matrix4();
  proto.traverse((mesh) => {
    if (!mesh.isMesh) return;
    out.add(instancePropMesh(mesh,placements));
  });
  // the clones are never drawn, and their geometry and materials are the
  // prototype's own, so there is nothing to dispose
  return out;
}

/** Put a model in by hand. The loader's own landing point. */
/**
 * A model's own yaw, in degrees, so a door faces +z the way the plans expect.
 * The AI mesh tools hand back a model facing whichever way the reference
 * image did; a row here turns it once at load and the plan never knows.
 */
export const PROP_YAW = {};

export function registerProp(id, object3D) {
  object3D.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true; o.receiveShadow = true;
    // The mesh tools bake a metalness map with the blue channel high on stone
    // and thatch, and this scene has no environment map to reflect, so a metal
    // renders black: the user's smithy and manor came in as silhouettes. A
    // building is not metal. Metalness goes to zero and the map stays for the
    // roughness in its green channel; base colour reads as sRGB.
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      if (!m) continue;
      if ('metalness' in m) m.metalness = 0;
      if (m.map && THREE.SRGBColorSpace) m.map.colorSpace = THREE.SRGBColorSpace;
      m.needsUpdate = true;
    }
  });
  // FIT TO THE FOOTPRINT. The tools that make these hand back a model
  // normalised to a metre (Tripo: every one of the user's six was 0.98 m tall,
  // the castle and the sack alike), so a model is scaled uniformly until its
  // height is the footprint's height, its base is put on y = 0 and its middle
  // on x = z = 0. A model without a footprint is kept as it came.
  const f = FOOTPRINT[id];
  const wrap = new THREE.Group();
  wrap.name = `prop:${id}`;
  if (PROP_YAW[id]) object3D.rotation.y = PROP_YAW[id] * Math.PI / 180;
  wrap.add(object3D);
  if (f) {
    wrap.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(wrap);
    const height = box.max.y - box.min.y;
    const k = height > 1e-6 ? f[2] / height : 1;
    object3D.scale.multiplyScalar(k);
    wrap.updateMatrixWorld(true);
    box.setFromObject(wrap);
    object3D.position.x -= (box.min.x + box.max.x) / 2;
    object3D.position.z -= (box.min.z + box.max.z) / 2;
    object3D.position.y -= box.min.y;
  }
  props.set(id, wrap);
  return wrap;
}
/** Forget a model, so a test can drive both directions on the same id. */
export const forgetProp = (id) => props.delete(id);

async function bytesOf(url) {
  // In a browser the url is `/models/props/inn.glb` and the bytes come over
  // the wire; in node it is a path and they come off the disk. That is the ONE
  // difference between the two, and everything after it is shared.
  if (typeof window !== 'undefined' && typeof fetch === 'function') {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`plan_models: ${url} answered ${res.status}`);
    return res.arrayBuffer();
  }
  const spec = 'node:fs/promises';
  const { readFile } = await import(/* @vite-ignore */ spec);
  const buf = await readFile(url);
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

/**
 * Load one piece's glb and keep it. Answers true when the model is in and false
 * when there is no file, which is the ordinary case until the user has made it,
 * and is not an error: the stand-in stands in.
 */
export async function loadProp(id, url = propUrlFor(id)) {
  if (props.has(id)) return true;
  if (pendingProps.has(id)) return pendingProps.get(id);
  const work=loadPropFile(id,url);pendingProps.set(id,work);
  try{return await work;}finally{pendingProps.delete(id);}
}
async function loadPropFile(id,url){
  let data;
  try { data = await bytesOf(url); } catch { return false; }
  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  if (!gltfLoader) gltfLoader = new GLTFLoader();
  const gltf = await new Promise((res, rej) => {
    try { gltfLoader.parse(data, '', res, rej); } catch (err) { rej(err); }
  });
  await preparePropLods(gltf);
  registerProp(id, gltf.scene);
  return true;
}

/** A bounded preload of the actual library, including unplaced builder assets. */
export async function loadPropLibrary(){
 const response=await fetch(PROP_DIR+'manifest.json');if(!response.ok)throw Error('Structure library manifest unavailable');
 const manifest=await response.json(),queue=[...(manifest.ids||[])],loaded=[];
 await Promise.all(Array.from({length:4},async()=>{while(queue.length){const id=queue.shift();if(await loadProp(id,propUrlFor(id)+(manifest.revision?'?v='+manifest.revision:'')))loaded.push(id);}}));
 return loaded;
}

/** Load every model a plan asks for. Missing ones simply stay stand-ins. */
export async function loadPropsFor(plan) {
  const ids = new Set();
  for (const p of plan.pieces || []) ids.add(p.model);
  for (const r of plan.runs || []) ids.add(r.model);
  const got = await Promise.all([...ids].map((id) => loadProp(id).catch(() => false)));
  return got.filter(Boolean).length;
}

// ------------------------------------------------------------------ building

const D2R = Math.PI / 180;

/**
 * The plan's tree models and the arbor species each is grown as. The plans
 * name three of a species so a wood has three silhouettes; each model id gets
 * its own seed, so beech_a and beech_b are two different beeches.
 */
export const TREE_SPECIES = {
  beech_a: 'beech', beech_b: 'beech', beech_c: 'beech',
  oak_a: 'oak', oak_b: 'oak', oak_c: 'oak',
  willow: 'willow',
};
const treeProtos = new Map();

/** A stable seed off a name, so the same name grows the same tree every run. */
function seedOf(name, salt = 0x51ed) {
  let seed = salt;
  for (const ch of String(name)) seed = (Math.imul(seed, 31) + ch.charCodeAt(0)) >>> 0;
  return seed;
}

/** One grown prototype per tree model, cached for the session. */
export function treeProto(model) {
  const species = TREE_SPECIES[model];
  if (!species) return null;
  let p = treeProtos.get(model);
  if (!p) {
    try { p = arbor.buildPrototype(species, seedOf(model), { maturity: 1 }); } catch { p = null; }
    if (p) treeProtos.set(model, p);
  }
  return p;
}

/**
 * One grown prototype per ARBOR SPECIES, for a space's `trees` list.
 *
 * A plan names a model (`beech_a`) and `treeProto` grows the species behind it.
 * A space names the species itself (`beech`), because the editor's Trees tab is
 * `arbor.SPECIES` and there is no reason to invent three model ids to say oak.
 * The two share the cache and the seed rule, so `beech` and `beech_a` are two
 * different beeches for the same reason `beech_a` and `beech_b` are.
 */
export function speciesProto(species) {
  if (!arbor.SPECIES[species]) return null;
  const key = `sp:${species}`;
  let p = treeProtos.get(key);
  if (!p) {
    try { p = arbor.buildPrototype(species, seedOf(key), { maturity: 1 }); } catch { p = null; }
    if (p) treeProtos.set(key, p);
  }
  return p;
}

// ------------------------------------------------------------------- rocks --
//
// What a space's `rocks` list may name, and what each one is built out of.
//
// TWO SOURCES, AND BOTH OF THEM ARE THE GAME'S OWN. `rock` and `ore` are the
// boulders `flora.js` scatters, grown by `tree_gen.growBoulder`, which is what
// a pickaxe is swung at in the open world. Everything else is one of
// `dressing.js`'s own kinds, built by `dressing_models.bodyFor`: the sarsen,
// the drystone wall, the hay rick, the cart, the wayside shrine, the rib cage,
// the reed bed, all ninety odd of them across the nine realms. Nothing here is
// a new body; this is the scatter's vocabulary, made placeable by hand.
//
// `size` is the metres the body's longest side is built to at scale 1, and it
// is the kit's own number, so a rick placed here is the size a rick is.

/** Every rock kind a space may name: the kit's own kinds, plus two boulders. */
export const ROCK_KINDS = (() => {
  const out = {
    rock: { kind: 'rock', build: 'boulder', size: 1.6, boulder: true, ore: false },
    ore: { kind: 'ore', build: 'boulder', size: 1.2, boulder: true, ore: true },
  };
  for (const [realm, list] of Object.entries(KITS)) {
    for (const k of list) {
      if (!out[k.kind]) out[k.kind] = { kind: k.kind, build: k.build, size: k.size, realm };
    }
  }
  return out;
})();
export const ROCK_KIND_IDS = Object.freeze(Object.keys(ROCK_KINDS));
export const isRockKind = (id) => Object.prototype.hasOwnProperty.call(ROCK_KINDS, id);

const rockGeos = new Map();
/**
 * The geometry of one rock kind, built once and kept. `realm` only matters for
 * a dressing body, whose colours are baked into its vertices.
 */
export function rockGeometry(kind, realm = 'greenwold') {
  const spec = ROCK_KINDS[kind];
  if (!spec) return null;
  const key = spec.boulder ? `b:${kind}` : `${realm}:${kind}`;
  let geo = rockGeos.get(key);
  if (geo) return geo;
  if (spec.boulder) {
    const b = growBoulder(seedOf(kind, 0xb0d1), { detail: 2, squash: spec.ore ? 0.7 : 0.62, lump: spec.ore ? 0.26 : 0.2 });
    geo = b.geo;
    const h = b.height || 1;
    if (h > 1e-6) geo.scale(spec.size / h, spec.size / h, spec.size / h);
  } else {
    try { geo = dressBody(realm, spec, 0); } catch { geo = null; }
  }
  if (geo) rockGeos.set(key, geo);
  return geo;
}

/** The material a rock kind is drawn with. A boulder is stone; a body is its own. */
export function rockMaterialFor(kind, c) {
  const spec = ROCK_KINDS[kind];
  if (!spec) return null;
  // A dressing body carries its colours in a vertex attribute, so it MUST keep
  // its own vertexColors material; the palette's flat stone would paint a
  // ninety piece rib cage one colour and a merge would throw the colours away
  // altogether. That is why rocks are instanced per kind and never merged.
  if (!spec.boulder) return dressMaterial(kind);
  return c(spec.ore ? 'metal' : 'stone');
}

// ----------------------------------------------------------------- markers --
//
// A marker is a note to ourselves standing in the world: "a watchtower goes
// here", "a boss spawns here", "we need a bridge". It is a post, a board and
// the words, and it is DEV ONLY: `markersVisible` starts false, so a player who
// walks into a half authored space sees the space and not the notes.
//
// `setMarkersVisible(on, scene)` is the switch. app/systems/dev.js throws it
// with dev mode, and the editor throws it when it opens, so the notes come up
// with the tools and go down with them.

/** How tall a marker post stands, in metres. */
export const MARKER_POST_H = 2.4;
/** The colour of a marker's board, by what it is a marker for. */
export const MARKER_COLOUR = {
  structure: 0xc9a44a, monster: 0xc4523a, creature: 0x6f9a4a, tree: 0x4a7a3a,
  rock: 0x8d887e, prop: 0x7a6a9a, other: 0x9c9c9c,
};

let markersVisible = false;
/** Whether marker posts are being drawn at all. */
export const markersAreVisible = () => markersVisible;
/**
 * Show or hide every marker in the world. The flag is what a marker built from
 * now on is born with, and the scene walk is what turns the ones already
 * standing, so a space that streamed in an hour ago answers the switch too.
 */
export function setMarkersVisible(on, scene = null) {
  markersVisible = !!on;
  let turned = 0;
  if (scene && typeof scene.traverse === 'function') {
    scene.traverse((o) => { if (o.userData && o.userData.marker) { o.visible = markersVisible; turned++; } });
  }
  return { visible: markersVisible, turned };
}

/**
 * The words over a marker, as a sprite.
 *
 * `model_town.labelSprite` does the same job for the model rows and is NOT
 * reused here, for one reason and not for taste: model_town.js imports this
 * file at its top and uses `PROP_DIR` at module level, so importing it back
 * reads that constant before it is initialised and the whole world fails to
 * load. Measured: the import throws "Cannot access 'PROP_DIR' before
 * initialization". A marker also says a different thing in a different colour,
 * a label over a note rather than a name over a model.
 */
export function markerLabel(marker) {
  if (typeof document === 'undefined') return null;   // node: the post still stands, unlabelled
  const lines = [marker.label, marker.kind + (marker.note ? ': ' + marker.note : '')];
  const canvas = document.createElement('canvas');
  canvas.width = 640; canvas.height = 64 * lines.length + 24;
  const g = canvas.getContext('2d');
  g.fillStyle = 'rgba(10, 8, 6, 0.82)';
  g.fillRect(0, 0, canvas.width, canvas.height);
  const colour = MARKER_COLOUR[marker.kind] || MARKER_COLOUR.other;
  g.strokeStyle = '#' + colour.toString(16).padStart(6, '0');
  g.lineWidth = 6;
  g.strokeRect(3, 3, canvas.width - 6, canvas.height - 6);
  g.textAlign = 'center';
  lines.forEach((line, i) => {
    g.fillStyle = i === 0 ? '#f2dc9c' : '#' + colour.toString(16).padStart(6, '0');
    g.font = `${i === 0 ? 'bold 42px' : '28px'} Georgia, serif`;
    g.fillText(String(line).slice(0, 44), canvas.width / 2, 48 + i * 64);
  });
  const tex = new THREE.CanvasTexture(canvas);
  if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  const aspect = canvas.width / canvas.height;
  sprite.scale.set(4, 4 / aspect, 1);
  sprite.renderOrder = 999;
  return sprite;
}

/**
 * One marker's body, standing on y = 0: a post, a board across the top of it in
 * the colour of what it marks, and the label floating over it.
 */
export function markerBody(marker, c) {
  const g = new THREE.Group();
  const colour = MARKER_COLOUR[marker.kind] || MARKER_COLOUR.other;
  const post = new THREE.MeshStandardMaterial({ color: 0x4c3b2a, roughness: 0.95, flatShading: true });
  const board = new THREE.MeshStandardMaterial({ color: colour, roughness: 0.8, flatShading: true });
  put(g, cyl(0.07, 0.09, MARKER_POST_H, post, 6), 0, MARKER_POST_H / 2, 0);
  put(g, box(1.1, 0.42, 0.08, board), 0, MARKER_POST_H - 0.3, 0);
  const label = markerLabel(marker);
  if (label) { label.position.set(0, MARKER_POST_H + 1.1, 0); g.add(label); }
  g.userData.marker = marker;
  g.visible = markersVisible;
  return g;
}

/**
 * The body of one piece, in its own local space, standing on y = 0 facing +z.
 * The glb when there is one, the stand-in when there is not, and it says which.
 */
export function pieceBody(model, scale = 1) {
  const f = FOOTPRINT[model];
  if (!f) return null;
  const [w, d, h] = [f[0] * scale, f[1] * scale, f[2] * scale];
  const loaded = props.get(model);
  if (loaded) {
    const g = new THREE.Group();
    const clone = loaded.clone(true);
    if (scale !== 1) clone.scale.setScalar(scale);
    g.add(clone);
    return { group: g, source: 'glb', w, d, h };
  }
  const row = STANDIN[model];
  if (!row) return null;
  const build = BODY[row.body] || BODY.block;
  const g = build(w, d, h, PALETTE_FOR, row.opts);
  return { group: g, source: 'stand-in', w, d, h };
}

// `pieceBody` needs a palette and takes it off the module while a plan builds,
// because threading a colour getter through twenty five builders would put the
// realm in every signature for the sake of one plan at a time. `buildPlan` sets
// it before it builds anything and every path through it goes through the same
// two lines, so it cannot be left pointing at the wrong realm.
let PALETTE_FOR = palette('greenwold');

/** The lowest ground under a footprint, so nothing floats over a slope. */
function footAt(heightAt, wx, wz, w, d, yawRad) {
  const c = Math.cos(yawRad), s = Math.sin(yawRad);
  let lo = heightAt(wx, wz);
  for (const [ox, oz] of [[-w / 2, -d / 2], [w / 2, -d / 2], [-w / 2, d / 2], [w / 2, d / 2]]) {
    // yaw turns local +z toward the bearing, so local (x, z) lands at
    // (x cos + z sin, z cos - x sin) in world.
    const y = heightAt(wx + ox * c + oz * s, wz + oz * c - ox * s);
    if (y < lo) lo = y;
  }
  return lo;
}

/** A strip of quads along a polyline, following the ground. One ground lane. */
function laneMesh(points, width, at, heightAt, m, lift) {
  const pos = [];
  const step = 3;
  const push = (x, z) => { const [wx, wz] = at(x, z); pos.push(wx, heightAt(wx, wz) + lift, wz); };
  for (let i = 0; i < points.length - 1; i++) {
    const [x0, z0] = points[i], [x1, z1] = points[i + 1];
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.round(len / step));
    const nx = -(z1 - z0) / (len || 1) * width / 2, nz = (x1 - x0) / (len || 1) * width / 2;
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1) / n;
      const ax = x0 + (x1 - x0) * t0, az = z0 + (z1 - z0) * t0;
      const bx = x0 + (x1 - x0) * t1, bz = z0 + (z1 - z0) * t1;
      // WOUND SO THE FACE LOOKS AT THE SKY. Three culls back faces on a
      // FrontSide material and the palette's are FrontSide, so a ground
      // treatment wound the other way is a lane nobody can see from standing
      // on it: measured, 19,487 of the flat triangles in the plans and spaces
      // faced DOWN, and a ray dropped onto the Old Cellars' mud passed through
      // all thirty of its triangles. Counter clockwise seen from +y is front.
      push(ax - nx, az - nz); push(bx + nx, bz + nz); push(bx - nx, bz - nz);
      push(ax - nx, az - nz); push(ax + nx, az + nz); push(bx + nx, bz + nz);
    }
  }
  if (!pos.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, m);
  mesh.receiveShadow = true;
  return mesh;
}

const inPoly = (px, pz, pts) => {
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i], [xj, zj] = pts[j];
    if ((zi > pz) !== (zj > pz) && px < ((xj - xi) * (pz - zi)) / (zj - zi) + xi) hit = !hit;
  }
  return hit;
};

/** A polygon of ground, rasterised into quads that follow the terrain. */
function areaMesh(points, at, heightAt, m, lift, flatY) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const [x, z] of points) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
  const span = Math.max(maxX - minX, maxZ - minZ);
  const cell = Math.max(1.5, span / 26);
  const pos = [];
  const y = (wx, wz) => (flatY === null ? heightAt(wx, wz) + lift : flatY);
  for (let z = minZ; z < maxZ; z += cell) {
    for (let x = minX; x < maxX; x += cell) {
      const cx = x + cell / 2, cz = z + cell / 2;
      if (!inPoly(cx, cz, points)) continue;
      const x1 = x + cell, z1 = z + cell;
      const P = (a, b) => { const [wx, wz] = at(a, b); pos.push(wx, y(wx, wz), wz); };
      // the same winding as laneMesh, and for the same reason: a quad of
      // ground has to face the sky or the material culls it away
      P(x, z); P(x1, z1); P(x1, z);
      P(x, z); P(x, z1); P(x1, z1);
    }
  }
  if (!pos.length) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, m);
  mesh.receiveShadow = true;
  return mesh;
}

const AREA_COLOUR = { lane: 'earth', water: 'water', mud: 'mud', bare: 'bare', wheat: 'wheat' };

/**
 * How many pieces a run of this length lays. Rounded, never fewer than one, so
 * a 30 m hedgerow of 4 m segments is eight and not seven and a half.
 */
export function runSegments(model, length) {
  const span = RUN_SPAN[model];
  if (!span) return 0;
  return Math.max(1, Math.round(length / span));
}

/**
 * Build a plan at a site.
 *
 * `site` is the row `zones.authoredSites()` hands over with `y`, `cx` and `cz`
 * on it, exactly as `buildSiteMarker` receives it. `heightAt(x, z)` is the world
 * height field. Answers a merged group, or null if the plan is not one.
 */
export function buildPlan(plan, site, heightAt) {
  // A plan is its pieces; a SPACE may be nothing but trees, or nothing but
  // markers, and refusing that would mean the first thing the editor ever puts
  // down does not appear. Anything with none of the five is not a layout.
  if (!plan || !(plan.pieces || plan.runs || plan.trees || plan.rocks || plan.markers)) return null;
  PALETTE_FOR = palette(site.realm || 'greenwold');
  const c = PALETTE_FOR;
  const groups = new Map();      // tag -> { g, piece, waystone, keep }
  const trees = new Map();       // key -> { proto, list } laid as real arbor trees, instanced
  const rocks = new Map();       // kind -> [{ x, y, z, yaw, k }] instanced per kind
  const markers = new THREE.Group();
  const sub = (tag, piece) => {
    let e = groups.get(tag);
    if (!e) { e = { g: new THREE.Group(), piece: piece ?? null }; groups.set(tag, e); }
    return e;
  };

  // WHERE THE COMPOSITION STANDS, and how many times.
  //
  // Eight of the nine plans are laid once, at the place's own centre. The
  // Standing Hedge is not: the sheet's ring is a mile across with nine sarsens
  // on it and the painting is of ONE of them, so `waystones.json` carries the
  // composition of one stop and a `repeat` that says the ring. Each copy is
  // turned so its own +z looks back at the ring's centre, which is where the
  // carved face is meant to look.
  const stops = stopsOf(plan, site);

  /** A plan point in the plan's frame, put into the world at one stop. */
  const world = (stop, px, pz) => {
    const c0 = Math.cos(stop.rot), s0 = Math.sin(stop.rot);
    return [stop.x + px * c0 + pz * s0, stop.z + pz * c0 - px * s0];
  };

  for (const stop of stops) buildStop(plan, site, heightAt, c, sub, stop, world, trees, rocks, markers);

  // ---- merge each tag on its own, so a name survives and the count stays low
  const out = new THREE.Group();
  out.name = `plan:${plan.id}`;
  // THE TREES ARE REAL TREES. A plan's beech or oak is grown by arbor.js, the
  // same generator the forests use, never a ball on a post, and every tree of
  // one model in the plan is one instanced bark mesh and one instanced leaf
  // mesh, so forty beeches cost two draw calls. The user said no low poly trees.
  for (const [key, entry] of trees) {
    const { proto, list } = entry;
    const model = entry.name || key;
    if (!proto || !list.length) continue;
    const n = list.length;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), scl = new THREE.Vector3();
    const bark = new THREE.InstancedMesh(proto.bark, proto.barkMat, n);
    const leaf = proto.hasLeaves ? new THREE.InstancedMesh(proto.leaf, proto.leafMat, n) : null;
    if (leaf && proto.depthMat) leaf.customDepthMaterial = proto.depthMat;
    list.forEach((t, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.yaw);
      pos.set(t.x, t.y, t.z); scl.setScalar(t.k);
      m4.compose(pos, q, scl);
      bark.setMatrixAt(i, m4); if (leaf) leaf.setMatrixAt(i, m4);
    });
    for (const im of [bark, leaf]) {
      if (!im) continue;
      im.instanceMatrix.needsUpdate = true;
      im.castShadow = true; im.receiveShadow = true;
      im.name = `plan:${plan.id}:trees:${model}`;
      im.userData.site = site;
      im.userData.plan = { id: plan.id, piece: model, source: 'arbor' };
      out.add(im);
    }
  }
  // THE ROCKS ARE THE WORLD'S OWN ROCKS. A boulder is `tree_gen.growBoulder`,
  // the one a pickaxe is swung at, and everything else is a `dressing.js` kind
  // built by `dressing_models.bodyFor`. Both are instanced per kind rather than
  // merged, because a dressing body's colours live in a vertex attribute and
  // `mergeByMaterial` throws every attribute but position and normal away.
  for (const [kind, list] of rocks) {
    if (!list.length) continue;
    const geo = rockGeometry(kind, site.realm || 'greenwold');
    const mat = rockMaterialFor(kind, c);
    if (!geo || !mat) continue;
    const im = new THREE.InstancedMesh(geo, mat, list.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), scl = new THREE.Vector3();
    list.forEach((r, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r.yaw);
      pos.set(r.x, r.y, r.z); scl.setScalar(r.k);
      m4.compose(pos, q, scl);
      im.setMatrixAt(i, m4);
    });
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = true; im.receiveShadow = true;
    im.name = `plan:${plan.id}:rocks:${kind}`;
    im.userData.site = site;
    im.userData.plan = { id: plan.id, piece: kind, source: 'rock' };
    out.add(im);
  }

  // The markers ride along unmerged, because each one carries its own words on
  // a sprite and a merge would eat both the sprite and the userData that says
  // what the note said.
  if (markers.children.length) {
    markers.name = `plan:${plan.id}:markers`;
    markers.userData.site = site;
    out.add(markers);
  }

  for (const [tag, e] of groups) {
    if (!e.g.children.length) continue;
    // A glb piece keeps its uvs and its textures. mergeByMaterial buckets by
    // colour and strips every attribute but position and normal, which is
    // right for a stand-in painted in flat colour and wrong for a model: the
    // user's barrel came through it as an untextured blob, or nothing at all
    // (its mesh was pulled out of the group and the wrapper left empty). So
    // every copy of one model in a plan becomes one InstancedMesh per mesh of
    // that model, textures intact, one draw call per material.
    if (e.source === 'glb' && props.has(e.piece)) {
      const inst = instancedGlb(e, props.get(e.piece));
      inst.traverse((o) => {
        if (!o.isMesh) return;
        o.userData.site = site;
        o.userData.plan = { id: plan.id, piece: e.piece, source: 'glb' };
        if (e.waystone) o.userData.waystone = true;
        if (e.keep) o.userData.keep = true;
      });
      inst.name = `plan:${plan.id}:${tag}`;
      out.add(inst);
      continue;
    }
    const merged = mergeByMaterial(e.g);
    merged.traverse((o) => {
      if (!o.isMesh) return;
      o.userData.site = site;
      o.userData.plan = { id: plan.id, piece: e.piece, source: e.source || 'stand-in' };
      if (e.waystone) o.userData.waystone = true;
      if (e.keep) o.userData.keep = true;
    });
    merged.name = `plan:${plan.id}:${tag}`;
    out.add(merged);
  }
  out.userData.site = site;
  out.userData.plan = {
    id: plan.id, place: plan.place || null, radius: plan.radius,
    arrival: plan.arrival || null, stops: stops.length,
    space: plan.at ? { x: plan.at.x, z: plan.at.z } : null,
    counts: {
      pieces: (plan.pieces || []).length, runs: (plan.runs || []).length, areas: (plan.areas || []).length,
      trees: (plan.trees || []).length, rocks: (plan.rocks || []).length, markers: (plan.markers || []).length,
      people: (plan.people || []).length, spawns: (plan.spawns || []).length,
    },
  };
  return out;
}

/** One laying of a plan's composition, at one stop. */
function buildStop(plan, site, heightAt, c, sub, stop, world, trees = new Map(), rocks = new Map(), markers = null) {
  const yawOf = (deg) => (deg || 0) * D2R + stop.rot;

  // ---- the pieces
  for (const p of plan.pieces || []) {
    if (TREE_SPECIES[p.model]) {
      // a real tree, batched per model and grown after the stops (see buildPlan)
      const f = FOOTPRINT[p.model];
      const proto = treeProto(p.model);
      if (!f || !proto) continue;
      const [wx, wz] = world(stop, p.x, p.z);
      const h = f[2] * (p.scale ?? 1);
      const k = proto.height > 0 ? h / proto.height : 1;
      const e = trees.get(p.model) || { proto, name: p.model, list: [] };
      e.list.push({ x: wx, y: heightAt(wx, wz) - 0.05, z: wz, yaw: yawOf(p.yaw), k });
      trees.set(p.model, e);
      continue;
    }
    const body = pieceBody(p.model, p.scale ?? 1);
    if (!body) continue;
    const yaw = yawOf(p.yaw);
    const [wx, wz] = world(stop, p.x, p.z);
    const foot = footAt(heightAt, wx, wz, body.w, body.d, yaw);
    body.group.position.set(wx, foot - SINK, wz);
    body.group.rotation.y = yaw;
    // A piece built from a glb ALWAYS gets its own merge group. It has its own
    // materials, so it could never have shared a bucket with a stand-in
    // anyway, and this is what lets one merged mesh answer honestly for where
    // its geometry came from.
    const own = body.source === 'glb' || SOLO.has(p.model);
    const e = sub(own ? p.model : 'plan', own ? p.model : null);
    if (p.model === WAYSTONE_MODEL) e.waystone = true;
    if (p.model === KEEP_MODEL) e.keep = true;
    e.g.add(body.group);
    e.source = body.source;
  }

  // ---- the runs, piece by piece along the line, each on its own ground
  for (const r of plan.runs || []) {
    const span = RUN_SPAN[r.model];
    if (!span) continue;
    const dx = r.to.x - r.from.x, dz = r.to.z - r.from.z;
    const len = Math.hypot(dx, dz);
    const n = runSegments(r.model, len);
    const yaw = Math.atan2(dx, dz) + Math.PI / 2 + stop.rot;   // the segment's width runs along the line
    const modelled = hasProp(r.model);
    const e = sub(modelled ? r.model : 'plan', modelled ? r.model : null);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const body = pieceBody(r.model, r.scale ?? 1);
      if (!body) break;
      const [wx, wz] = world(stop, r.from.x + dx * t, r.from.z + dz * t);
      const foot = footAt(heightAt, wx, wz, body.w, body.d, yaw);
      body.group.position.set(wx, foot - SINK, wz);
      body.group.rotation.y = yaw;
      e.source = body.source;
      e.g.add(body.group);
    }
  }

  // ---- the ground treatments, a few centimetres over the terrain
  const areas = sub('plan', null);
  const at = (px, pz) => world(stop, px, pz);
  for (const a of plan.areas || []) {
    const m = c(AREA_COLOUR[a.kind] || 'earth');
    const lift = a.lift ?? DECAL_LIFT;
    let mesh = null;
    if (a.kind === 'lane') mesh = laneMesh(a.points, a.w ?? 3, at, heightAt, m, lift);
    else if (a.kind === 'water') mesh = areaMesh(a.points, at, heightAt, m, lift, heightAt(stop.x, stop.z) + (a.y ?? 0));
    else mesh = areaMesh(a.points, at, heightAt, m, lift, null);
    if (mesh) areas.g.add(mesh);
  }

  // ---- a space's trees, by arbor species, grown and instanced with the rest
  for (const t of plan.trees || []) {
    if (t.harvest) continue;
    const proto = speciesProto(t.species);
    if (!proto) continue;
    const [wx, wz] = world(stop, t.x, t.z);
    const e = trees.get(`sp:${t.species}`) || { proto, name: t.species, list: [] };
    e.list.push({ x: wx, y: heightAt(wx, wz) - 0.05, z: wz, yaw: yawOf(t.yaw), k: t.scale ?? 1 });
    trees.set(`sp:${t.species}`, e);
  }

  // ---- a space's rocks. `SINK` beds a rock the way it beds a piece.
  for (const r of plan.rocks || []) {
    if (r.harvest) continue;
    if (!ROCK_KINDS[r.kind]) continue;
    const [wx, wz] = world(stop, r.x, r.z);
    const list = rocks.get(r.kind) || [];
    list.push({ x: wx, y: heightAt(wx, wz) - SINK * 0.5, z: wz, yaw: yawOf(r.yaw), k: r.scale ?? 1 });
    rocks.set(r.kind, list);
  }

  // ---- a space's markers, dev only, one post each
  if (markers) {
    for (const m of plan.markers || []) {
      const g = markerBody(m, c);
      const [wx, wz] = world(stop, m.x, m.z);
      g.position.set(wx, heightAt(wx, wz), wz);
      g.rotation.y = stop.rot;
      g.traverse((o) => { if (o.userData) o.userData.marker = m; });
      markers.add(g);
    }
  }
}

/** How many draw calls a built plan costs. One per merged mesh. */
export function drawCallsOf(group) {
  let n = 0;
  group.traverse((o) => { if (o.isMesh) n++; });
  return n;
}

/** How many triangles a built plan costs. */
export function trisOf(group) {
  let n = 0;
  group.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const g = o.geometry;
    n += g.index ? g.index.count / 3 : (g.attributes.position ? g.attributes.position.count / 3 : 0);
  });
  return Math.round(n);
}

/** Every claim this file makes about its own tables, checked by the test. */
export function auditPlanModels() {
  const bad = [];
  for (const id of Object.keys(STANDIN)) {
    if (!FOOTPRINT[id]) bad.push(`the model "${id}" has a stand-in and no footprint`);
    const row = STANDIN[id];
    if (!BODY[row.body]) bad.push(`the model "${id}" asks for the body "${row.body}", which is not one`);
  }
  for (const id of Object.keys(FOOTPRINT)) {
    if (!STANDIN[id]) bad.push(`the model "${id}" has a footprint and no stand-in`);
    const f = FOOTPRINT[id];
    if (!(f[0] > 0 && f[1] > 0 && f[2] > 0)) bad.push(`the model "${id}" has a footprint with a zero in it`);
  }
  for (const id of Object.keys(RUN_SPAN)) {
    if (!FOOTPRINT[id]) bad.push(`the run "${id}" has no footprint`);
    else if (RUN_SPAN[id] > FOOTPRINT[id][0] + 0.001) bad.push(`the run "${id}" spans ${RUN_SPAN[id]} m with a piece ${FOOTPRINT[id][0]} m wide, so it lays a fence with gaps in it`);
  }
  for (const id of SOLO) if (!FOOTPRINT[id]) bad.push(`"${id}" is named through the merge and is not a model`);
  if (!FOOTPRINT[WAYSTONE_MODEL]) bad.push('there is no waystone model');
  if (!FOOTPRINT[KEEP_MODEL]) bad.push('there is no keep model');
  if (bad.length) throw new Error('plan_models: ' + bad.join('; '));
  return { models: Object.keys(FOOTPRINT).length, bodies: Object.keys(BODY).length, runs: Object.keys(RUN_SPAN).length, solo: SOLO.size };
}

/**
 * The tree species and the rock kinds a space may name, checked against the two
 * tables they really come from.
 *
 * `plan_schema.js` is pure and cannot ask arbor.js what a species is or
 * dressing.js what a kind is, so it checks a space's shape and leaves the
 * vocabulary to this file, which already holds both. It runs at import, beside
 * `auditPlanModels`, so a space naming a species that does not exist is a load
 * error and not a hole in a wood.
 *
 * BOTH DIRECTIONS. A kind that has no body fails, and a `rock` or `ore` that
 * collided with a dressing kind of the same name would fail too, because the
 * boulder would silently shadow the kit's own body.
 */
export function auditSpaceKinds(spaces = {}) {
  const bad = [];
  for (const [realm, list] of Object.entries(KITS)) {
    for (const k of list) {
      if (k.kind === 'rock' || k.kind === 'ore') bad.push(`the ${realm} kit has a kind called "${k.kind}", which is the name of a boulder and would be shadowed by it`);
      if (!DRESS_BODIES[k.build]) bad.push(`the ${realm} kit's "${k.kind}" names a body "${k.build}" that does not exist`);
    }
  }
  for (const id of ROCK_KIND_IDS) {
    const spec = ROCK_KINDS[id];
    if (!spec.boulder && !DRESS_BODIES[spec.build]) bad.push(`the rock kind "${id}" names a body "${spec.build}" that does not exist`);
    if (!(spec.size > 0)) bad.push(`the rock kind "${id}" is built to ${spec.size} m`);
  }
  let trees = 0, rocks = 0;
  for (const [key, space] of Object.entries(spaces)) {
    for (const t of space.trees || []) {
      trees++;
      if (!arbor.SPECIES[t.species]) bad.push(`the space "${key}" plants a "${t.species}", which arbor.js does not grow`);
    }
    for (const r of space.rocks || []) {
      rocks++;
      if (!ROCK_KINDS[r.kind]) bad.push(`the space "${key}" lays a "${r.kind}", which is neither a boulder nor a dressing kind`);
    }
  }
  if (bad.length) throw new Error('spaces: ' + bad.join('; '));
  return { species: arbor.SPECIES_IDS.length, rockKinds: ROCK_KIND_IDS.length, trees, rocks };
}

auditPlanModels();
/** The one place a space's vocabulary is checked. See auditSpaceKinds. */
export const SPACE_KIND_STATS = auditSpaceKinds(SPACES);
