// A town precinct, built. The seven the programme names get a wall, a square,
// named buildings with doors and a waystone; every other settlement in the
// world goes on being the village `site_models.settlement()` has always made.
//
// HOW THIS STAYS CHEAP.
//
//   `mergeByMaterial` buckets meshes by colour, so a town's draw count is very
//   nearly its palette's size and not its building count. That is why every
//   body here is built from the thirteen colours in `town_layout.PALETTES` plus
//   the four every realm shares, and why nothing here reaches into the farm
//   kit for a piece with a colour of its own unless the piece is worth a draw.
//   `TOWN_MAX_DRAWS` is the promise; `town_layout.test.mjs` measures it and the
//   seven come out at 32 or 33 draws and 14,400 to 21,400 triangles each.
//
// THE ONE THING THE MERGE WOULD HAVE EATEN.
//
//   A waystone is a mesh a raycast has to be able to recognise, and the whole
//   point of merging is that meshes stop being separate. So the waystone is
//   built, merged and tagged ON ITS OWN and joined to the town afterwards,
//   exactly as `mine_models` does for a cut. Merge it with the town and
//   `userData.waystone` would survive on paper and never reach a click.
//
// WHERE THE WATER IS.
//
//   Neither harbour has a pad with sea on it: `field.js` levels 120 m of
//   ground and the sea is outside that. So `seawardOf` walks the real height
//   field, finds the bearing whose ground crosses SEA_LEVEL soonest and how far
//   out that is, and the plan puts the quay inside it. Measured at seed
//   20260904: Cinderport faces 307 degrees with the water at 86 m, deep enough
//   for barges; the Red Queen's Harbour faces 112 degrees with the water at
//   114 m, so its jetties cross a tidal flat first and its hulls sit aground on
//   it, which is what a town built out of wrecks looks like. A hull is never
//   floated above its own ground: see `waterlineAt`.

import * as THREE from 'three';
import { mulberry32, hash2 } from './noise.js';
import { SEA_LEVEL } from './field.js';
import { mergeByMaterial } from './site_models.js';
import { buildEnclosure } from '../farm/buildings.js';
import { buildCamp } from '../farm/camp_models.js';
import {
  layoutTown, lotOf, lotsOfKind, lotCorners, COMMON, WAYSTONE_H, doorOf, TOWN_SPECS,
  angDiff,
} from './town_layout.js';

/** A town may cost this many draw calls and no more. Measured in the test. */
export const TOWN_MAX_DRAWS = 60;
/** How far out `seawardOf` looks for the water, metres. */
export const SEAWARD_REACH = 118;
/** Metres of water a hull's keel wants under it before it floats rather than sits. */
export const HULL_DRAFT = 0.55;
/** Ground fall across a footprint, in metres, that earns a levelling plinth. */
export const PLINTH_AT = 0.35;

/**
 * The footing of one lot: the floor it stands on, and the plinth that gets it
 * there. The floor is the LOWEST ground under the footprint, so no corner of
 * anything is ever floating; where the ground falls across the footprint by
 * more than PLINTH_AT the difference is made up in stone, which is what a
 * building on a hillside really has under it.
 *
 * The pad is flat inside the wall, so `plinth` is 0 for every building in every
 * town. It is the dressing out on the graded shoulder, the ring of stones round
 * Hearthhome and the cairns above Cairnfoot, that this exists for: the ground
 * there falls by up to 5.6 m across two metres.
 */
export function footingFor(lot, heightAt) {
  const hs = [[lot.x, lot.z], ...lotCorners(lot)].map(([x, z]) => heightAt(x, z));
  const lo = Math.min(...hs), hi = Math.max(...hs);
  const spread = hi - lo;
  return { y: lo, hi, lo, spread, plinth: spread > PLINTH_AT ? spread + 0.25 : 0 };
}

// ------------------------------------------------------------- how tall ----
//
// One place says how tall a body is, and the builder and the measuring both
// read it. A house's eaves height is carried on the lot by `town_layout` for
// the same reason: two numbers for one roof is how a test comes to pass while
// the thing it tests is wrong.

/** The eaves height of a body: where its walls stop and its roof starts. */
export function bodyHeightOf(lot) {
  if (lot.kind === 'inn') return lot.style === 'hall' ? 7.6 : 8.4;
  return lot.h ?? 6;
}

/**
 * The top of a lot's body, in metres above its own floor. Chimneys, spires,
 * masts and mast lights count, because the question this answers is what a
 * sight line has to clear. Where a body's shape is awkward this rounds UP, so
 * the roofline it reports is never lower than the roofline that was drawn.
 */
export function bodyTopOf(lot, plan) {
  switch (lot.kind) {
    case 'keeptower': return plan.keep ? keepTopOf(plan.keep) : lot.h;
    case 'keeptowerlet': return lot.h + 3.2;
    case 'greathall': return bodyHeightOf(lot) + lot.d * 0.575 + 1.4;
    case 'stall': return 2.5 + lot.w * 0.2;
    case 'forge': return 4.7;
    case 'gallows': return 5.2;
    case 'cairn': return 2.7;
    case 'block': return 4.3;
    case 'pens': case 'fold': return 2.8;
    case 'palmyard': return 7.4;
    case 'butts': return 2.4;
    case 'jetty': case 'mole': return 3.0;
    case 'hull': return 13.0;
    default: break;
  }
  if (lot.prop) return 3.2;                    // the dressing has its own bodies
  const h = bodyHeightOf(lot);
  const flat = (lot.style === 'hall' ? 'gable' : ROOF_STYLE[plan.realm]) === 'flat';
  const pitch = lot.style === 'hall' ? 1.25 : 0.8;
  let top = flat ? h + 0.95 : h + lot.d * 0.5 * pitch + 0.2;
  const chimney = lot.kind === 'inn' || lot.kind === 'house' || lot.kind === 'brewhouse' || lot.kind === 'forgehouse';
  if (chimney) top = Math.max(top, h * 1.475);
  if (lot.kind === 'church') top = Math.max(top, h + 13.5);
  if (lot.kind === 'granary' || lot.kind === 'cistern' || lot.kind === 'icehouse') top = Math.max(top, h + 2.1);
  if (lot.kind === 'warehouse' || lot.kind === 'salvage') top = Math.max(top, h + 4.4);
  if (lot.kind === 'drying') top = Math.max(top, h + 1.3);
  return top;
}

// ---------------------------------------------------------------- material --
//
// One material per colour for the whole world, so two towns of the same realm
// share them and `mergeByMaterial` has the smallest number of buckets it can.
// A lit material takes a colour nothing else in the palette uses, because the
// merge buckets on colour alone and would otherwise fuse a cold wall into a
// glowing window and light the wall.
const MATS = new Map();
function mat(hex, kind = 'solid') {
  const key = hex + ':' + kind;
  let m = MATS.get(key);
  if (m) return m;
  if (kind === 'glass') {
    m = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.25, metalness: 0.1, transparent: true, opacity: 0.6, flatShading: true });
  } else if (kind === 'lit') {
    m = new THREE.MeshStandardMaterial({ color: hex, emissive: hex, emissiveIntensity: 0.85, roughness: 0.5, flatShading: true });
  } else if (kind === 'water') {
    m = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.15, metalness: 0.25, transparent: true, opacity: 0.85 });
  } else {
    m = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.92, flatShading: true });
  }
  MATS.set(key, m);
  return m;
}

// ------------------------------------------------------------- primitives --

const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
const cyl = (rt, rb, h, m, seg = 7) => new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
const cone = (r, h, m, seg = 6) => new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), m);
const ball = (r, m, seg = 6) => new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(3, seg - 2)), m);

/** Put a mesh in a group at a local offset, and hand it back. */
function put(g, mesh, x, y, z, ry = 0, rx = 0, rz = 0) {
  mesh.position.set(x, y, z);
  mesh.rotation.set(rx, ry, rz);
  mesh.castShadow = true; mesh.receiveShadow = true;
  g.add(mesh);
  return mesh;
}

/**
 * A gable roof: two slabs leaning on each other, and the ridge over the joint.
 * Cheaper and squarer than a real prism, and at a town's scale it reads right.
 */
function gableRoof(g, w, d, wallH, pitch, roofM, ridgeM) {
  const rise = d * 0.5 * pitch;
  const slope = Math.hypot(d / 2, rise);
  const ang = Math.atan2(rise, d / 2);
  for (const s of [1, -1]) {
    const slab = box(w + 0.7, 0.26, slope + 0.35, roofM);
    put(g, slab, 0, wallH + rise / 2 - 0.05, s * d / 4, 0, s * ang, 0);
  }
  put(g, box(w + 0.8, 0.22, 0.34, ridgeM), 0, wallH + rise + 0.06, 0);
  return rise;
}

/** A flat roof with a parapet round it, which is what a hot country builds. */
function flatRoof(g, w, d, wallH, roofM, trimM) {
  put(g, box(w + 0.5, 0.24, d + 0.5, roofM), 0, wallH + 0.12, 0);
  for (const [dx, dz, bw, bd] of [[0, d / 2, w + 0.5, 0.3], [0, -d / 2, w + 0.5, 0.3], [w / 2, 0, 0.3, d + 0.5], [-w / 2, 0, 0.3, d + 0.5]]) {
    put(g, box(bw, 0.7, bd, trimM), dx, wallH + 0.6, dz);
  }
}

/** A door in the middle of the front wall, and the step up to it. */
function doorway(g, d, pal, wide = 1.5, high = 2.3) {
  put(g, box(wide, high, 0.16, mat(pal.timber)), 0, high / 2, d / 2 + 0.06);
  put(g, box(wide + 0.7, 0.16, 0.9, mat(pal.stone)), 0, 0.08, d / 2 + 0.45);
}

/** Windows down both long sides, lit at night by the material and not a light. */
function windows(g, w, d, wallH, pal, n = 2) {
  for (const s of [1, -1]) {
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * (w / (n + 0.4));
      put(g, box(0.9, 1.0, 0.12, mat(pal.glow, 'glass')), x, wallH * 0.55, s * (d / 2 + 0.03));
      put(g, box(1.1, 0.14, 0.2, mat(pal.trim)), x, wallH * 0.55 + 0.6, s * (d / 2 + 0.05));
    }
  }
}

// ------------------------------------------------------------- buildings ---

const ROOF_STYLE = {
  greenwold: 'gable', verdant: 'gable', saltmarch: 'gable', stormpeaks: 'gable',
  frostreach: 'gable', emberwastes: 'flat', ashenthrone: 'flat',
  boneyard: 'gable', sunkenkingdom: 'flat',
};

/**
 * The body of one building, in its own frame: the front faces +z and the floor
 * is at y 0, which is the convention the farm kit uses and the one
 * `town_layout` writes its yaws in.
 */
function building(lot, pal, realm, o = {}) {
  const g = new THREE.Group();
  const w = lot.w, d = lot.d;
  const h = o.h ?? (5 + Math.min(2.6, (w * d) / 90));
  const style = o.style || ROOF_STYLE[realm] || 'gable';
  const wallM = mat(o.wallHex ?? pal.wall);
  const darkM = mat(o.darkHex ?? pal.wallDark);

  put(g, box(w, h, d, wallM), 0, h / 2, 0);
  // a plinth, so nothing looks like it was dropped on the grass
  put(g, box(w + 0.5, 0.5, d + 0.5, mat(pal.stone)), 0, 0.25, 0);
  // corner posts, which is what makes a box read as a building
  for (const sx of [1, -1]) for (const sz of [1, -1]) {
    put(g, box(0.34, h, 0.34, mat(pal.timber)), sx * (w / 2 - 0.1), h / 2, sz * (d / 2 - 0.1));
  }
  if (style === 'flat') flatRoof(g, w, d, h, mat(pal.roof), mat(pal.roofDark));
  else gableRoof(g, w, d, h, o.pitch ?? 0.8, mat(pal.roof), mat(pal.roofDark));
  doorway(g, d, pal, o.doorW ?? 1.5, o.doorH ?? 2.3);
  windows(g, w, d, h, pal, o.windows ?? Math.max(1, Math.round(w / 5)));
  if (o.band !== false) put(g, box(w + 0.3, 0.3, d + 0.3, darkM), 0, h * 0.62, 0);
  if (o.chimney) put(g, box(0.9, h * 0.55, 0.9, mat(pal.stoneDark)), w / 2 - 1.2, h + h * 0.2, -d / 4);
  return { g, h };
}

/** A sign on a bracket over the door, which is how an inn says it is one. */
function sign(g, d, pal, h) {
  put(g, box(0.14, 0.14, 1.5, mat(pal.metal)), 0, h * 0.8, d / 2 + 0.75);
  put(g, box(1.6, 1.0, 0.1, mat(pal.banner)), 0, h * 0.8 - 0.7, d / 2 + 1.4);
  put(g, box(1.7, 0.14, 0.16, mat(pal.trim)), 0, h * 0.8 - 0.16, d / 2 + 1.4);
}

/** A banner hanging down a wall, in the realm's own colour. */
function banner(g, d, pal, h, w = 1.1) {
  put(g, box(w, h * 0.62, 0.08, mat(pal.banner)), 0, h * 0.55, d / 2 + 0.09);
  put(g, box(w + 0.3, 0.14, 0.14, mat(pal.metal)), 0, h * 0.86, d / 2 + 0.12);
}

/** The smith's forge: a stone hearth, a hood, an anvil, and coal that glows. */
function forgeBody(pal) {
  const g = new THREE.Group();
  put(g, box(3.4, 1.1, 3.0, mat(pal.stoneDark)), 0, 0.55, 0);
  put(g, box(2.4, 0.24, 2.2, mat(COMMON.coal)), 0, 1.16, 0);
  put(g, box(1.5, 0.16, 1.4, mat(pal.glow, 'lit')), 0, 1.3, 0);
  put(g, cyl(0.55, 0.75, 3.2, mat(pal.stoneDark), 6), 0, 3.0, -1.0);
  // the anvil on its stump, out in front where the hammering happens
  put(g, cyl(0.42, 0.5, 0.7, mat(pal.timber), 7), 1.6, 0.35, 1.5);
  put(g, box(1.0, 0.34, 0.42, mat(pal.metal)), 1.6, 0.87, 1.5);
  put(g, box(0.4, 0.2, 0.42, mat(pal.metal)), 2.2, 1.1, 1.5);
  for (let i = 0; i < 3; i++) put(g, box(0.1, 1.6, 0.1, mat(pal.metal)), -1.3 + i * 0.3, 0.9, 1.4, 0, 0, 0.25);
  return g;
}

/** A market stall: four posts, a board, and an awning in the realm's colour. */
function stallBody(lot, pal, awning) {
  const g = new THREE.Group();
  const w = lot.w, d = lot.d;
  for (const sx of [1, -1]) for (const sz of [1, -1]) {
    put(g, box(0.13, 2.2, 0.13, mat(pal.timber)), sx * (w / 2 - 0.15), 1.1, sz * (d / 2 - 0.15));
  }
  put(g, box(w, 0.16, d * 0.7, mat(pal.timber)), 0, 1.0, 0.1);
  put(g, box(w + 0.6, 0.12, d + 0.9, awning), 0, 2.35, 0.2, 0, -0.16, 0);
  for (let i = 0; i < 3; i++) put(g, ball(0.24, mat(i === 1 ? pal.trim : pal.roofDark), 5), (i - 1) * w * 0.28, 1.24, 0.1);
  return g;
}

/** A ship, from the keel up: hull, deck, gunwale, mast, yard, furled sail. */
function hullBody(lot, pal, heel) {
  const g = new THREE.Group();
  const L = lot.d, B = lot.w;
  const hullM = mat(pal.timber), deckM = mat(pal.wallDark), tarM = mat(pal.roof);
  put(g, box(B, 2.6, L * 0.52, hullM), 0, -0.5, -L * 0.12);
  put(g, box(B * 0.78, 2.4, L * 0.3, hullM), 0, -0.5, L * 0.26);
  put(g, box(B * 0.4, 2.2, L * 0.18, hullM), 0, -0.45, L * 0.44);
  put(g, box(B * 0.9, 1.6, L * 0.16, hullM), 0, -0.2, -L * 0.44);     // the transom
  put(g, box(B + 0.2, 0.22, L * 0.86, deckM), 0, 0.82, 0);
  for (const s of [1, -1]) put(g, box(0.22, 0.7, L * 0.86, tarM), s * (B / 2 + 0.05), 1.2, 0);
  put(g, cyl(0.2, 0.28, 13, hullM, 6), 0, 7.2, 0);
  put(g, box(0.24, 0.24, 9, hullM), 0, 10.4, 0, Math.PI / 2);
  put(g, box(0.7, 0.7, 8.4, mat(pal.trim)), 0, 10.0, 0, Math.PI / 2);
  put(g, box(1.4, 1.0, 0.08, mat(pal.banner)), 0, 12.6, 0.4);
  put(g, ball(0.28, mat(pal.glow, 'lit'), 5), 0, 1.9, -L * 0.44);      // the stern lantern
  g.rotation.z = heel;
  return g;
}

/** A gallows: two posts, a beam, a rope, and the stair up to the drop. */
function gallowsBody(pal) {
  const g = new THREE.Group();
  put(g, box(4.2, 0.5, 4.2, mat(pal.stone)), 0, 0.25, 0);
  for (const s of [1, -1]) put(g, box(0.3, 4.6, 0.3, mat(pal.timber)), s * 1.5, 2.8, 0);
  put(g, box(3.9, 0.34, 0.34, mat(pal.timber)), 0, 5.0, 0);
  put(g, box(0.09, 1.9, 0.09, mat(pal.trim)), 0.6, 3.9, 0);
  put(g, box(0.28, 0.28, 0.28, mat(pal.trim)), 0.6, 2.95, 0);
  for (let i = 0; i < 3; i++) put(g, box(2.0, 0.16, 0.5, mat(pal.timber)), 0, 0.62 + i * 0.3, 2.1 + i * 0.5);
  return g;
}

// ------------------------------------------------------------------ keep ---
//
// THE CASTLE AT THE BACK OF THE TOWN.
//
//   `town_layout` decides the precinct, its wall line, its gate and where its
//   four bodies stand. This builds them. The one number everything else hangs
//   off is `plan.keep.tower.h`, the height of the great tower's shaft, which is
//   between 18 and 30 m in every town and is what puts the tower over the
//   roofs; `KEEP_TOP_EXTRA` is what each realm's tower carries above its shaft,
//   and it is read BOTH by the builder, which puts the roof there, and by
//   `keepTopOf`, which is what the visibility test measures against. One
//   number, two readers, so the test cannot be measuring a tower nobody drew.
//
//   The gate is built, merged and tagged on its own, exactly as the waystone
//   is: `mergeByMaterial` buckets by colour, so a `userData.keep` flag set on a
//   mesh before the merge would end up on every wall of the same stone in the
//   town, and a click on a house would open the castle.

/** The keep's own wall: lower than a town wall, thicker than a garden one. */
export const KEEP_WALL_H = 6.0;
const KEEP_WALL_T = 1.8;
/** The water gate in a sea wall, metres across: one hull's beam and a margin. */
const WATER_GATE_W = 12;
/** Metres each realm's tower carries above its shaft: roof, dome, crown, mast. */
// Each of these is at or a little under the real top of the body below, never
// over it: the tower is the thing a sight line is measured TO, so rounding this
// down makes the measurement harder and never flatters it.
export const KEEP_TOP_EXTRA = {
  manor: 3.0, greattree: 17.0, seafort: 10.4, wellkeep: 3.0,
  cragkeep: 2.4, icehall: 3.9, citadel: 4.4,
};
/** Which of the palette's colours the keep's walls are faced in, per style. */
const KEEP_FACE = {
  manor: 'stone', greattree: 'timber', seafort: 'stone', wellkeep: 'wallDark',
  cragkeep: 'stone', icehall: 'timber', citadel: 'stoneDark',
};

/** How high above its own floor the great tower reaches, roof and all. */
export const keepTopOf = (keep) => keep.tower.h + (KEEP_TOP_EXTRA[keep.style] ?? 3);

/** Crenellations along a wall segment: the thing that says a wall is defended. */
function merlons(g, len, yaw, x, y, z, m, t = KEEP_WALL_T) {
  const n = Math.max(2, Math.round(len / 2.0));
  for (let k = 0; k < n; k++) {
    const o = (k + 0.5) / n - 0.5;
    put(g, box(1.1, 0.85, t + 0.3, m), x + Math.cos(yaw) * o * len, y, z - Math.sin(yaw) * o * len, yaw);
  }
}

/**
 * The keep's wall: an arc across the town side with the gate in it, a radial
 * wall down each flank to the town wall, and, where the town wall is a harbour
 * mouth instead of a wall, the castle's own sea wall closing it.
 */
function buildKeepWall(g, plan, heightAt) {
  const keep = plan.keep, pal = plan.palette;
  const { x: cx, z: cz } = plan;
  const faceM = mat(pal[KEEP_FACE[keep.style]] ?? pal.stone);
  const capM = mat(pal.stoneDark);
  const H = KEEP_WALL_H;
  const gateHalf = keep.gate.half + 0.03;

  const run = (r, from, to, gapAt = null, gapHalf = 0) => {
    const step = 3.2;
    const n = Math.max(2, Math.round(((to - from) * r) / step));
    for (let i = 0; i < n; i++) {
      const a = from + ((i + 0.5) / n) * (to - from);
      if (gapAt !== null && Math.abs(angDiff(a, gapAt)) <= gapHalf) continue;
      const x = cx + Math.sin(a) * r, z = cz + Math.cos(a) * r;
      const y = heightAt(x, z);
      put(g, box(((to - from) * r) / n + 0.3, H, KEEP_WALL_T, faceM), x, y + H / 2 - 0.3, z, a);
      put(g, box(((to - from) * r) / n + 0.4, 0.5, KEEP_WALL_T + 0.4, capM), x, y + H - 0.15, z, a);
      merlons(g, ((to - from) * r) / n, a, x, y + H + 0.5, z, capM);
    }
  };

  // the town side, with the gate's gap left in it
  run(keep.rIn, keep.bearing - keep.half, keep.bearing + keep.half, keep.axis, gateHalf);

  // the two flanks, running out to the town wall
  for (const s of [-1, 1]) {
    const a = keep.bearing + s * keep.half;
    const step = 3.2;
    const n = Math.max(2, Math.round((keep.rOut - keep.rIn) / step));
    for (let i = 0; i < n; i++) {
      const r = keep.rIn + ((i + 0.5) / n) * (keep.rOut - keep.rIn);
      const x = cx + Math.sin(a) * r, z = cz + Math.cos(a) * r;
      const y = heightAt(x, z);
      const len = (keep.rOut - keep.rIn) / n + 0.3;
      put(g, box(KEEP_WALL_T, H, len, faceM), x, y + H / 2 - 0.3, z, a);
      put(g, box(KEEP_WALL_T + 0.4, 0.5, len, capM), x, y + H - 0.15, z, a);
    }
  }

  // where the outer arc is open water, the castle closes it itself, with a
  // water gate on its own axis: this is what makes the Red Queen's a sea fort
  if (keep.sea) {
    const inAxis = Math.abs(angDiff(keep.axis, keep.bearing)) <= keep.half
      && angDiff(keep.bearing, keep.axis) >= keep.sea.lo && angDiff(keep.bearing, keep.axis) <= keep.sea.hi;
    // The water gate is WATER_GATE_W metres of arc, wide enough for a hull and
    // no wider. Reusing the land gate's half ANGLE here would have opened it to
    // 36 m at this radius, which is a harbour mouth and not a gate: measured.
    const wg = Math.asin(Math.min(0.9, (WATER_GATE_W / 2) / (keep.rOut - 1.2)));
    run(keep.rOut - 1.2, keep.sea.from, keep.sea.from + (keep.sea.hi - keep.sea.lo),
      inAxis ? keep.axis : null, wg);
  }
}

/** The keep's gate, built alone so the merge cannot spread its flag. */
function keepGateBody(plan, heightAt) {
  const keep = plan.keep, pal = plan.palette;
  const g = new THREE.Group();
  const gate = keep.gate;
  const a = gate.bearing;
  const across = a + Math.PI / 2;
  const hw = gate.w / 2;
  const th = KEEP_WALL_H + 4.2;
  for (const s of [-1, 1]) {
    const px = gate.x + Math.sin(across) * (hw + 1.6) * s, pz = gate.z + Math.cos(across) * (hw + 1.6) * s;
    const py = heightAt(px, pz);
    put(g, box(3.0, th, KEEP_WALL_T + 1.8, mat(pal.stone)), px, py + th / 2 - 0.3, pz, a);
    put(g, box(3.5, 0.6, KEEP_WALL_T + 2.3, mat(pal.stoneDark)), px, py + th - 0.2, pz, a);
    for (let k = 0; k < 3; k++) {
      put(g, box(0.85, 0.9, 0.85, mat(pal.stoneDark)), px + Math.sin(across) * (k - 1) * 1.05, py + th + 0.6, pz + Math.cos(across) * (k - 1) * 1.05, a);
    }
    // a banner in the realm's colour down each tower's face
    put(g, box(1.2, 3.4, 0.1, mat(pal.banner)), px + Math.sin(a) * (KEEP_WALL_T / 2 + 1.0), py + th * 0.55, pz + Math.cos(a) * (KEEP_WALL_T / 2 + 1.0), a);
  }
  const y = heightAt(gate.x, gate.z);
  put(g, box(gate.w + 3.4, 1.8, KEEP_WALL_T + 1.4, mat(pal.stone)), gate.x, y + KEEP_WALL_H + 0.9, gate.z, a);
  put(g, box(gate.w + 3.8, 0.7, KEEP_WALL_T + 1.9, mat(pal.stoneDark)), gate.x, y + KEEP_WALL_H + 2.1, gate.z, a);
  // the portcullis, up in its housing
  for (let k = 0; k < 7; k++) {
    put(g, box(0.18, KEEP_WALL_H - 1.4, 0.18, mat(pal.metal)),
      gate.x + Math.sin(across) * (k - 3) * 0.55, y + (KEEP_WALL_H - 1.4) / 2 + 1.2, gate.z + Math.cos(across) * (k - 3) * 0.55, a);
  }
  put(g, box(gate.w - 0.4, 0.3, 0.3, mat(pal.metal)), gate.x, y + 1.3, gate.z, a);
  // nine skulls over the Legion's gate, one for every dragon
  if (plan.sub === 'cinderport') {
    for (let k = 0; k < 9; k++) {
      const o = (k - 4) * 1.05;
      put(g, ball(0.34, mat(pal.trim), 6), gate.x + Math.sin(across) * o, y + KEEP_WALL_H + 2.9, gate.z + Math.cos(across) * o, a);
    }
  }
  // two lamps at the arch, because a castle whose gate is dark reads as a ruin
  for (const s of [-1, 1]) {
    const px = gate.x + Math.sin(across) * hw * s + Math.sin(a) * 0.9;
    const pz = gate.z + Math.cos(across) * hw * s + Math.cos(a) * 0.9;
    put(g, ball(0.3, mat(pal.glow, 'lit'), 5), px, heightAt(px, pz) + 3.4, pz);
  }
  return g;
}

/** The great tower, in its own frame: floor at y 0, front at +z, facing the town. */
function keepTowerBody(lot, plan, rng) {
  const g = new THREE.Group();
  const pal = plan.palette, style = plan.keep.style;
  const w = lot.w, d = lot.d, h = lot.h;
  const faceM = mat(pal[KEEP_FACE[style]] ?? pal.stone);
  const capM = mat(pal.stoneDark);

  if (style === 'greattree') {
    // the Court's seat is a tree: the bole of the oldest giant, a hall built
    // round its foot and platforms up it to the crown
    put(g, cyl(1.5, 3.1, h, mat(pal.timber), 9), 0, h / 2, 0);
    put(g, cyl(w * 0.5, w * 0.56, 4.6, mat(pal.wall), 9), 0, 2.3, 0);
    put(g, cyl(w * 0.56, w * 0.5, 0.5, mat(pal.roof), 9), 0, 4.8, 0);
    for (let k = 0; k < 3; k++) {
      const py = 9 + k * 5.5, pr = 4.4 - k * 0.5;
      put(g, cyl(pr, pr, 0.3, mat(pal.timber), 9), 0, py, 0);
      put(g, cyl(pr + 0.2, pr + 0.2, 0.16, mat(pal.trim), 9), 0, py + 0.9, 0);
      put(g, ball(0.3, mat(pal.glow, 'lit'), 5), pr - 0.5, py + 1.2, 0);
    }
    for (let k = 0; k < 3; k++) put(g, cyl(6.2 - k * 1.2, 0.7, 3.0, mat(k % 2 ? pal.roof : pal.roofDark), 9), 0, h * 0.68 + k * 3.4, 0);
    // and the tree goes on above the hall. Measured: the Court's own trunks
    // stand 34 to 50 m, so a seat that stopped at the top of its hall would
    // have been a stump among giants. The hall is 28 m; the bole is 45.
    put(g, cyl(0.85, 1.5, 15.6, mat(pal.timber), 8), 0, h + 7.2, 0);
    for (let k = 0; k < 3; k++) put(g, cyl(4.6 - k * 1.0, 0.6, 2.6, mat(k % 2 ? pal.roof : pal.roofDark), 8), 0, h + 4.4 + k * 4.2, 0);
    put(g, cyl(4.4, 0.6, 3.6, mat(pal.roof), 9), 0, h + 15.8, 0);
    put(g, box(1.2, 2.6, 0.09, mat(pal.banner)), 0, h * 0.5, w * 0.5 + 0.1);
    return g;
  }

  if (style === 'wellkeep') {
    // the tower stands ON the well: a shaft to the same sweet water, kerbed in
    // stone, four piers over it and the keep on top of them, so whoever holds
    // the keep can close the well
    const kerb = Math.min(w, d) * 0.34;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      put(g, box(kerb * 0.7, 1.1, 0.6, mat(pal.stone)), Math.sin(a) * kerb, 0.55, Math.cos(a) * kerb, a);
    }
    const water = new THREE.Mesh(new THREE.CircleGeometry(kerb * 0.86, 14), mat(COMMON.water, 'water'));
    put(g, water, 0, 0.36, 0, 0, -Math.PI / 2);
    const pier = 5.6;
    for (const sx of [1, -1]) for (const sz of [1, -1]) {
      put(g, box(1.9, pier, 1.9, faceM), sx * (w / 2 - 1.2), pier / 2, sz * (d / 2 - 1.2));
    }
    put(g, box(w, h - pier, d, faceM), 0, pier + (h - pier) / 2, 0);
    put(g, box(w + 0.8, 0.7, d + 0.8, capM), 0, pier + 0.35, 0);
    put(g, box(w + 0.6, 0.5, d + 0.6, capM), 0, h + 0.25, 0);
    put(g, cone(w * 0.56, 2.6, mat(pal.roof), 8), 0, h + 1.6, 0);
    put(g, ball(0.5, mat(COMMON.gold), 6), 0, h + 3.0, 0);
    put(g, box(1.2, 3.0, 0.09, mat(pal.banner)), 0, h * 0.72, d / 2 + 0.1);
    return g;
  }

  // every other keep is a shaft, and what it is made of and wears on top is
  // what tells one realm's castle from another's
  const base = style === 'seafort' ? 3.4 : style === 'cragkeep' ? 2.2 : 1.0;
  put(g, box(w + 1.6, base, d + 1.6, capM), 0, base / 2, 0);
  put(g, box(w, h, d, faceM), 0, h / 2, 0);
  for (const sx of [1, -1]) for (const sz of [1, -1]) {
    put(g, box(1.0, h, 1.0, capM), sx * (w / 2 - 0.4), h / 2, sz * (d / 2 - 0.4));
  }
  // lit windows up the front, so the tower is a lantern at night
  for (let k = 0; k < Math.max(2, Math.floor(h / 6)); k++) {
    put(g, box(0.9, 1.3, 0.14, mat(pal.glow, 'glass')), 0, 4.5 + k * 5.2, d / 2 + 0.05);
    put(g, box(1.2, 0.16, 0.24, mat(pal.trim)), 0, 5.4 + k * 5.2, d / 2 + 0.07);
  }
  put(g, box(w + 1.2, 0.7, d + 1.2, capM), 0, h + 0.35, 0);
  merlons(g, w + 1.2, 0, 0, h + 1.15, d / 2 + 0.3, capM, 1.0);
  merlons(g, w + 1.2, 0, 0, h + 1.15, -d / 2 - 0.3, capM, 1.0);
  merlons(g, d + 1.2, Math.PI / 2, w / 2 + 0.3, h + 1.15, 0, capM, 1.0);
  merlons(g, d + 1.2, Math.PI / 2, -w / 2 - 0.3, h + 1.15, 0, capM, 1.0);
  put(g, box(1.3, 3.2, 0.09, mat(pal.banner)), 0, h * 0.66, d / 2 + 0.1);

  if (style === 'manor') {
    put(g, cone(w * 0.62, 2.2, mat(pal.roof), 4), 0, h + 1.9, 0, Math.PI / 4);
    put(g, cyl(0.09, 0.09, 1.6, mat(pal.metal), 5), 0, h + 3.4, 0);
    put(g, box(0.9, 0.5, 0.06, mat(pal.trim)), 0.4, h + 3.9, 0);
  } else if (style === 'seafort') {
    // the lighthouse: a ship's mast with a fire in the crow's nest, which is
    // what the sheet says the Harbour steers by
    put(g, cyl(0.24, 0.4, 9.2, mat(pal.timber), 7), 0, h + 4.6, 0);
    put(g, box(0.22, 0.22, 6.4, mat(pal.timber)), 0, h + 7.2, 0, Math.PI / 2);
    put(g, cyl(0.95, 0.75, 1.1, mat(pal.metal), 8), 0, h + 9.4, 0);
    put(g, ball(0.72, mat(pal.glow, 'lit'), 6), 0, h + 9.9, 0);
    for (const s of [1, -1]) put(g, box(0.06, 2.6, 0.06, mat(pal.trim)), s * 2.6, h + 3.0, 0, 0, 0, s * 0.7);
  } else if (style === 'cragkeep') {
    // half a tower and half a cliff: the crag comes up behind it and the keep
    // is cut into the rock, which is what the sheet says Cairnfoot is built on
    // Measured: the tower stands 17.8 m in front of the town wall, so the crag
    // is four slabs reaching 14.3 m back and stops 3.5 m short of it. A crag
    // that reached the wall would swallow thirteen metres of it.
    for (let k = 0; k < 4; k++) {
      const kw = w + 5.5 - k * 0.9, kh = 4.2 + k * 3.0;
      put(g, box(kw, kh, 3.8 + k * 0.35, mat(k % 2 ? pal.stoneDark : pal.stone)),
        (k % 2 ? 0.7 : -0.7), kh / 2, -d / 2 - 2.0 - k * 1.3, (k % 2 ? 0.06 : -0.05));
    }
    for (let k = 0; k < 6; k++) put(g, box(2.2, 0.4, 1.1, mat(pal.stone)), w / 2 + 1.2, 1.2 + k * 1.6, -d / 2 - 0.4 - k * 1.2);
    put(g, cone(w * 0.5, 2.0, mat(pal.roof), 6), 0, h + 1.7, 0);
  } else if (style === 'icehall') {
    // timber and ice: blocks cut out of the glacier stacked into the walls, and
    // a rib arch over the roof, the way the town's own hall is roofed
    for (let k = 0; k < 4; k++) {
      put(g, box(2.2, 1.6, 2.2, mat(pal.roof)), (k % 2 ? 1 : -1) * (w / 2 - 1.1), 2.2 + Math.floor(k / 2) * 6.0, (k < 2 ? 1 : -1) * (d / 2 - 1.1));
    }
    put(g, box(w + 2.4, 0.5, 2.0, mat(pal.roofDark)), 0, h + 2.6, 0);
    for (const s of [1, -1]) put(g, cyl(0.24, 0.44, 9.0, mat(pal.trim), 6), s * (w / 2 + 0.6), h + 1.2, 0, 0, 0, s * 0.5);
    put(g, cone(w * 0.58, 3.0, mat(pal.roofDark), 6), 0, h + 2.4, 0);
  } else if (style === 'citadel') {
    // black stone and brass: the Legion builds flat and puts metal on it
    put(g, box(w + 0.6, 0.5, d + 0.6, mat(pal.roof)), 0, h + 1.9, 0);
    for (const sx of [1, -1]) for (const sz of [1, -1]) {
      put(g, cyl(1.0, 1.2, 4.0, faceM, 7), sx * (w / 2 - 1.0), h + 2.9, sz * (d / 2 - 1.0));
      put(g, cyl(1.1, 0.4, 1.2, mat(pal.roof), 7), sx * (w / 2 - 1.0), h + 5.3, sz * (d / 2 - 1.0));
    }
    put(g, cyl(0.14, 0.14, 3.4, mat(pal.metal), 6), 0, h + 3.4, 0);
    put(g, box(1.6, 2.2, 0.08, mat(pal.banner)), 0.9, h + 3.6, 0);
    put(g, ball(0.4, mat(pal.glow, 'lit'), 5), 0, h + 5.2, 0);
  }
  return g;
}

/** A flanking tower on the keep's outer corner, round and roofed. */
function keepCornerBody(lot, plan) {
  const g = new THREE.Group();
  const pal = plan.palette;
  const r = Math.min(lot.w, lot.d) / 2 + 0.4;
  const h = lot.h;
  put(g, cyl(r, r + 0.4, h, mat(pal[KEEP_FACE[plan.keep.style]] ?? pal.stone), 9), 0, h / 2, 0);
  put(g, cyl(r + 0.6, r + 0.6, 0.6, mat(pal.stoneDark), 9), 0, h - 0.1, 0);
  put(g, cone(r + 0.8, 3.0, mat(pal.roof), 9), 0, h + 1.7, 0);
  put(g, box(0.7, 1.0, 0.14, mat(pal.glow, 'glass')), 0, h * 0.66, r + 0.05);
  return g;
}

/** The great hall: one long room, a high roof, a big door and banners on it. */
function keepHallBody(lot, plan) {
  const built = building(lot, plan.palette, plan.realm, {
    h: lot.h, pitch: 1.15, doorW: 2.6, doorH: 3.0,
    windows: Math.max(2, Math.round(lot.w / 4)),
    wallHex: plan.palette[KEEP_FACE[plan.keep.style]] ?? plan.palette.stone,
    darkHex: plan.palette.stoneDark,
  });
  const pal = plan.palette;
  for (let k = -1; k <= 1; k++) {
    put(built.g, box(0.9, 2.4, 0.07, mat(pal.banner)), k * (lot.w / 3), built.h * 0.6, lot.d / 2 + 0.12);
  }
  // the louvre over the hearth, which is how a hall lets its smoke out
  put(built.g, box(lot.w * 0.22, 1.0, 1.8, mat(pal.roofDark)), 0, built.h + lot.d * 0.575 + 0.5, 0);
  put(built.g, ball(0.28, mat(pal.glow, 'lit'), 5), 0, built.h + lot.d * 0.575 + 1.1, 0);
  return built.g;
}

/**
 * The whole castle. Answers where the top of its great tower is, in world
 * space, which is the point the visibility test casts at.
 */
function buildKeep(g, plan, heightAt) {
  const keep = plan.keep;
  if (!keep) return null;
  const pal = plan.palette;
  buildKeepWall(g, plan, heightAt);

  // the court: paved, with braziers on it and the realm's colours on poles
  const court = keep.courtyard;
  const cy = heightAt(court.x, court.z);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(court.r, 20), mat(pal.stone));
  put(g, disc, court.x, cy + 0.06, court.z, 0, -Math.PI / 2);
  for (let i = 0; i < 4; i++) {
    const a = keep.axis + Math.PI + (i - 1.5) * 0.7;
    const x = court.x + Math.sin(a) * (court.r - 1.4), z = court.z + Math.cos(a) * (court.r - 1.4);
    const y = heightAt(x, z);
    if (i % 2 === 0) {
      put(g, cyl(0.14, 0.2, 2.8, mat(pal.metal), 6), x, y + 1.4, z);
      put(g, cyl(0.44, 0.3, 0.5, mat(pal.metal), 7), x, y + 2.9, z);
      put(g, ball(0.36, mat(pal.glow, 'lit'), 5), x, y + 3.1, z);
    } else {
      put(g, cyl(0.11, 0.11, 6.4, mat(pal.timber), 6), x, y + 3.2, z);
      put(g, box(1.1, 2.6, 0.07, mat(pal.banner)), x, y + 4.8, z, keep.axis + Math.PI);
    }
  }

  let top = null;
  for (const lot of plan.keepLots) {
    const foot = footingFor(lot, heightAt);
    const y = foot.y - 0.12 + foot.plinth;
    let piece;
    if (lot.kind === 'keeptower') piece = keepTowerBody(lot, plan);
    else if (lot.kind === 'greathall') piece = keepHallBody(lot, plan);
    else piece = keepCornerBody(lot, plan);
    if (foot.plinth > 0) {
      put(g, box(lot.w + 0.9, foot.plinth + 0.4, lot.d + 0.9, mat(pal.stone)), lot.x, foot.y - 0.12 + foot.plinth / 2, lot.z, lot.yaw);
    }
    piece.position.set(lot.x, y, lot.z);
    piece.rotation.y = lot.yaw;
    g.add(piece);
    if (lot.kind === 'keeptower') top = { x: lot.x, y: y + keepTopOf(keep), z: lot.z };
  }
  return top;
}

/** A standing stone with a face cut in it, four metres of it. */
function waystoneBody(pal) {
  const g = new THREE.Group();
  const H = WAYSTONE_H;
  put(g, box(1.5, H, 0.85, mat(pal.stoneDark)), 0, H / 2, 0, 0, 0, 0.03);
  put(g, box(1.9, 0.4, 1.3, mat(pal.stone)), 0, 0.2, 0);
  // the face: an oval cut into the front, two eyes and a mouth that hold light
  put(g, box(1.05, 1.7, 0.1, mat(pal.dark)), 0, H * 0.66, 0.44);
  for (const s of [1, -1]) put(g, ball(0.15, mat(pal.glow, 'lit'), 5), s * 0.26, H * 0.74, 0.5);
  put(g, box(0.5, 0.12, 0.1, mat(pal.glow, 'lit')), 0, H * 0.53, 0.5);
  return g;
}

// ------------------------------------------------------------------ water --

/**
 * Where a hull's waterline sits at (x, z): the sea, or the ground plus a little
 * where the ground stands above the sea. A hull is therefore never floating in
 * the air and never buried in a mudflat. On a flat that is not under water it
 * sits aground and heeled, which is what the Saltmarch has to offer.
 */
export function waterlineAt(x, z, heightAt) {
  const gy = heightAt(x, z);
  return { y: Math.max(SEA_LEVEL, gy + 0.55), afloat: gy + HULL_DRAFT <= SEA_LEVEL };
}

/**
 * Which way the water is, and how far out. Walks 48 bearings to SEAWARD_REACH
 * and takes the one whose ground drops below SEA_LEVEL soonest, ties broken on
 * the lowest average ground, so a town on a bay faces the bay.
 */
export function seawardOf(site, heightAt, reach = SEAWARD_REACH) {
  let best = null;
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const sx = Math.sin(a), sz = Math.cos(a);
    let shore = Infinity, sum = 0, n = 0;
    for (let r = 70; r <= reach; r += 2) {
      const h = heightAt(site.x + sx * r, site.z + sz * r);
      sum += h; n++;
      if (h < SEA_LEVEL && shore === Infinity) shore = r;
    }
    const row = { bearing: a, shoreR: Math.min(shore, reach), mean: sum / n, wet: shore !== Infinity };
    if (!best || row.shoreR < best.shoreR || (row.shoreR === best.shoreR && row.mean < best.mean)) best = row;
  }
  return best;
}

// ------------------------------------------------------------------- wall --

function buildWall(g, plan, heightAt) {
  const { wall, palette: pal, x: cx, z: cz } = plan;
  const R = wall.r, H = wall.height, T = wall.thickness;
  const timber = wall.kind === 'palisade' || wall.kind === 'thorn';
  const faceM = mat(wall.kind === 'thorn' ? pal.roofDark : wall.kind === 'mudbrick' ? pal.wallDark : pal.stone);
  const capM = mat(wall.kind === 'thorn' ? pal.roof : pal.stoneDark);
  const openAt = (a, slack = 0) => wall.gaps.some((gap) => {
    let d = Math.abs(a - gap.bearing);
    while (d > Math.PI) d = Math.abs(d - Math.PI * 2);
    return d <= gap.half + slack;
  });
  const step = 3.2;
  const n = Math.round((Math.PI * 2 * R) / step);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    if (openAt(a)) continue;
    const x = cx + Math.sin(a) * R, z = cz + Math.cos(a) * R;
    const y = heightAt(x, z);
    const h = H * (timber ? 0.9 + 0.18 * ((i % 3) / 2) : 1);
    put(g, box(step + 0.3, h, T, faceM), x, y + h / 2 - 0.3, z, a);
    if (timber) {
      for (let k = -1; k <= 1; k++) {
        put(g, cyl(0.24, 0.28, 1.1, capM, 5), x + Math.cos(a) * k * 1.0, y + h + 0.2, z - Math.sin(a) * k * 1.0, a);
      }
    } else {
      put(g, box(step + 0.4, 0.42, T + 0.4, capM), x, y + h - 0.1, z, a);
      if (i % 2 === 0 && wall.kind === 'blackstone') put(g, box(1.0, 0.9, T + 0.3, capM), x, y + h + 0.5, z, a);
    }
  }
  // towers, which is what makes a ring of wall read as defended
  const towers = wall.kind === 'blackstone' ? 6 : wall.kind === 'drystone' ? 0 : 4;
  for (let i = 0; i < towers; i++) {
    const a = (i / towers) * Math.PI * 2 + 0.4;
    if (openAt(a, 0.1)) continue;
    const x = cx + Math.sin(a) * R, z = cz + Math.cos(a) * R;
    const y = heightAt(x, z);
    const th = H + 3.4;
    put(g, cyl(2.0, 2.4, th, faceM, 8), x, y + th / 2 - 0.3, z);
    put(g, cyl(2.5, 2.5, 0.5, capM, 8), x, y + th - 0.4, z);
    put(g, cone(2.6, 2.6, mat(pal.roof), 8), x, y + th + 1.1, z);
  }
}

function buildGates(g, plan, heightAt) {
  const { palette: pal, wall } = plan;
  for (const gate of plan.gates) {
    if (gate.kind === 'harbour') continue;      // a harbour mouth has no doors
    const y = heightAt(gate.x, gate.z);
    const a = gate.bearing;
    const hw = gate.w / 2;
    for (const s of [1, -1]) {
      const px = gate.x + Math.cos(a) * s * (hw + 1.1), pz = gate.z - Math.sin(a) * s * (hw + 1.1);
      const py = heightAt(px, pz);
      const th = wall.height + 2.6;
      put(g, box(2.4, th, wall.thickness + 1.4, mat(pal.stone)), px, py + th / 2 - 0.3, pz, a);
      put(g, box(2.9, 0.5, wall.thickness + 1.9, mat(pal.stoneDark)), px, py + th - 0.2, pz, a);
    }
    put(g, box(gate.w + 2.6, 1.1, wall.thickness + 1.2, mat(pal.stoneDark)), gate.x, y + wall.height + 1.2, gate.z, a);
    for (const s of [1, -1]) {
      put(g, box(hw - 0.15, wall.height, 0.3, mat(pal.timber)),
        gate.x + Math.cos(a) * s * (hw / 2 + 0.1), y + wall.height / 2 - 0.2, gate.z - Math.sin(a) * s * (hw / 2 + 0.1), a - s * 0.5);
    }
    put(g, box(1.5, 0.9, 0.1, mat(pal.banner)), gate.x, y + wall.height + 0.4, gate.z, a);
  }
}

// ----------------------------------------------------------- the ground ----

function buildStreets(g, plan, heightAt) {
  const { palette: pal, x: cx, z: cz } = plan;
  const paveM = mat(pal.stone);
  const streetM = mat(pal.stoneDark);
  const trackM = mat(pal.ground);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(plan.square.r, 24), paveM);
  put(g, disc, cx, heightAt(cx, cz) + 0.06, cz, 0, -Math.PI / 2);
  const ring = new THREE.Mesh(new THREE.RingGeometry(plan.square.r, plan.square.r + 6.5, 28), streetM);
  put(g, ring, cx, heightAt(cx, cz) + 0.05, cz, 0, -Math.PI / 2);
  // the avenues, in short strips so each one lies on its own ground
  for (const s of plan.streets) {
    if (s.kind === 'ring') continue;
    const len = Math.hypot(s.x2 - s.x1, s.z2 - s.z1);
    const n = Math.max(3, Math.round(len / 9));
    const yaw = Math.atan2(s.x2 - s.x1, s.z2 - s.z1);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const x = s.x1 + (s.x2 - s.x1) * t, z = s.z1 + (s.z2 - s.z1) * t;
      // paved inside the wall, a beaten track outside it: the road out of town
      const outside = Math.hypot(x - cx, z - cz) > plan.wall.r;
      put(g, box(s.w, 0.16, len / n + 0.2, outside ? trackM : streetM), x, heightAt(x, z) + 0.02, z, yaw);
    }
  }
}

function buildSquare(g, plan, heightAt) {
  const { palette: pal, square } = plan;
  const y = heightAt(square.x, square.z);
  const kind = square.centre.kind;
  const r = square.centre.r;
  if (kind === 'fountain') {
    put(g, cyl(r + 0.5, r + 0.7, 0.9, mat(pal.stone), 12), square.x, y + 0.45, square.z);
    const water = new THREE.Mesh(new THREE.CircleGeometry(r + 0.2, 16), mat(COMMON.water, 'water'));
    put(g, water, square.x, y + 0.86, square.z, 0, -Math.PI / 2);
    put(g, cyl(0.35, 0.5, 2.2, mat(pal.stoneDark), 8), square.x, y + 1.9, square.z);
    put(g, ball(0.7, mat(pal.trim), 7), square.x, y + 3.2, square.z);
  } else {
    put(g, cyl(r * 0.7, r * 0.78, 1.2, mat(pal.stone), 12), square.x, y + 0.6, square.z);
    const water = new THREE.Mesh(new THREE.CircleGeometry(r * 0.62, 14), mat(COMMON.water, 'water'));
    put(g, water, square.x, y + 1.1, square.z, 0, -Math.PI / 2);
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4;
      put(g, box(0.2, 2.6, 0.2, mat(pal.timber)), square.x + Math.cos(a) * r * 0.8, y + 1.9, square.z + Math.sin(a) * r * 0.8);
    }
    put(g, cone(r * 1.35, 1.4, mat(pal.roof), 8), square.x, y + 3.8, square.z);
    put(g, cyl(0.14, 0.14, r * 1.6, mat(pal.timber), 6), square.x, y + 3.0, square.z, 0, 0, Math.PI / 2);
    put(g, cyl(0.3, 0.26, 0.5, mat(pal.metal), 8), square.x + 0.5, y + 2.1, square.z);
    if (kind === 'sweetwell') {
      // the Last Well is the reason the town is there, so it is walled and kept
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        put(g, box(1.4, 1.0, 0.5, mat(pal.stoneDark)), square.x + Math.sin(a) * (r + 2.2), y + 0.5, square.z + Math.cos(a) * (r + 2.2), a);
      }
    }
  }
  // fire baskets round the square, which is what lights a town at night
  const lamps = 6;
  for (let i = 0; i < lamps; i++) {
    const a = (i / lamps) * Math.PI * 2 + 0.3;
    const x = square.x + Math.sin(a) * (square.r - 1.6), z = square.z + Math.cos(a) * (square.r - 1.6);
    const ly = heightAt(x, z);
    put(g, cyl(0.13, 0.18, 2.6, mat(pal.metal), 6), x, ly + 1.3, z);
    put(g, cyl(0.42, 0.3, 0.5, mat(pal.metal), 7), x, ly + 2.7, z);
    put(g, ball(0.34, mat(pal.glow, 'lit'), 5), x, ly + 2.9, z);
  }
}

// ------------------------------------------------------------ the realms ---
//
// What each of the seven has that none of the others does, read off the sheet's
// own geography line for that place and nothing else.

/** One piece of the dressing, in its own frame, floor at y 0, front at +z. */
function propBody(lot, pal, rng) {
  const g = new THREE.Group();
  switch (lot.kind) {
    case 'ringstone':
      // the ring of stones Hearthhome stands inside, one of nine
      put(g, box(lot.w, 3.0, lot.d, mat(pal.stoneDark)), 0, 1.4, 0, 0, 0, (rng() - 0.5) * 0.1);
      put(g, box(lot.w + 0.6, 0.3, lot.d + 0.6, mat(pal.stone)), 0, 0.15, 0);
      break;
    case 'haystack':
      put(g, cyl(0.3, 1.5, 2.6, mat(pal.roof), 8), 0, 1.3, 0);
      put(g, cone(1.1, 1.0, mat(pal.roofDark), 8), 0, 3.0, 0);
      break;
    case 'trunk': {
      // the Canopy Court's giants: the crown is two hundred feet up and the
      // rope walk between them is thirteen metres, which is as much height as a
      // town people have to walk in can carry
      const h = 34 + rng() * 16;
      put(g, cyl(1.0, 2.1, h, mat(pal.timber), 8), 0, h / 2, 0);
      put(g, cyl(4.2, 0.6, 3.0, mat(pal.roof), 8), 0, h + 1.0, 0);
      for (let i = 0; i < 3; i++) put(g, cyl(2.6, 0.5, 2.0, mat(pal.roofDark), 7), 0, h * 0.62 + i * 3.2, 0);
      put(g, ball(0.4, mat(pal.glow, 'lit'), 5), 1.6, 5.2, 0);
      g.userData.trunkTop = h;
      break;
    }
    case 'palm': {
      const h = 6 + rng() * 3;
      put(g, cyl(0.28, 0.42, h, mat(pal.timber), 6), 0, h / 2, 0, 0, 0, (rng() - 0.5) * 0.18);
      for (let k = 0; k < 6; k++) {
        const fa = (k / 6) * Math.PI * 2;
        put(g, box(0.5, 0.1, 3.2, mat(pal.roofDark)), Math.sin(fa) * 1.4, h + 0.2, Math.cos(fa) * 1.4, fa, -0.42);
      }
      break;
    }
    case 'icecut':
      // blocks cut out of the glacier and stacked where the giants left them
      put(g, box(lot.w, 1.0, lot.d, mat(pal.roof)), 0, 0.5, 0);
      put(g, box(lot.w * 0.8, 0.9, lot.d * 0.8, mat(pal.roofDark)), 0.2, 1.45, -0.1, 0.4);
      break;
    case 'ridgecairn':
      for (let k = 0; k < 5; k++) {
        put(g, box(1.5 - k * 0.24, 0.4, 1.3 - k * 0.2, mat(k % 2 ? pal.stone : pal.stoneDark)), 0, 0.2 + k * 0.42, 0, k * 0.6);
      }
      break;
    case 'stack': {
      // the Legion's foundry stacks, and the fire in them
      const h = 12 + rng() * 8;
      put(g, cyl(0.8, 1.2, h, mat(pal.stoneDark), 7), 0, h / 2, 0);
      put(g, cyl(1.1, 1.0, 0.7, mat(pal.metal), 7), 0, h + 0.2, 0);
      put(g, ball(0.5, mat(pal.glow, 'lit'), 5), 0, h + 0.8, 0);
      break;
    }
    case 'netrack':
      for (const sx of [1, -1]) put(g, box(0.16, 2.4, 0.16, mat(pal.timber)), sx * (lot.w / 2 - 0.2), 1.2, 0);
      put(g, box(lot.w, 0.14, 0.14, mat(pal.timber)), 0, 2.3, 0);
      put(g, box(lot.w - 0.4, 1.5, 0.1, mat(pal.wallDark)), 0, 1.4, 0);
      break;
    case 'tarbarrels':
      for (let k = 0; k < 3; k++) {
        put(g, cyl(0.5, 0.5, 1.1, mat(pal.roof), 8), (k - 1) * 0.75, 0.55, (k % 2) * 0.6 - 0.3);
        put(g, cyl(0.53, 0.53, 0.12, mat(pal.metal), 8), (k - 1) * 0.75, 0.9, (k % 2) * 0.6 - 0.3);
      }
      break;
    default:
      put(g, box(lot.w * 0.7, 1.0, lot.d * 0.7, mat(pal.stone)), 0, 0.5, 0);
  }
  return g;
}

/**
 * The dressing, and the one piece of it that is not a single prop: the rope
 * walks the Canopy Court hangs between its trunks, thirteen metres up, which
 * need two trunks to exist before either end of one is known.
 */
function realmDressing(g, plan, heightAt, rng) {
  const pal = plan.palette;
  const tops = [];
  for (const lot of plan.props) {
    const piece = propBody(lot, pal, rng);
    const foot = footingFor(lot, heightAt);
    const y = foot.y - 0.08 + foot.plinth;
    if (foot.plinth > 0) {
      put(g, box(lot.w + 0.7, foot.plinth + 0.35, lot.d + 0.7, mat(pal.stoneDark)),
        lot.x, foot.y - 0.08 + foot.plinth / 2, lot.z, lot.yaw);
    }
    piece.position.set(lot.x, y, lot.z);
    piece.rotation.y = lot.yaw;
    g.add(piece);
    if (lot.kind === 'trunk') tops.push([lot.x, y, lot.z]);
  }
  if (plan.sub !== 'canopycourt' || tops.length < 2) return;
  // Sort round the town so a walk joins a trunk to the next trunk along, not to
  // whichever one the packer happened to place after it.
  tops.sort((a, b) => Math.atan2(a[0] - plan.x, a[2] - plan.z) - Math.atan2(b[0] - plan.x, b[2] - plan.z));
  for (let i = 0; i < tops.length; i++) {
    const [ax, ay, az] = tops[i], [bx, by, bz] = tops[(i + 1) % tops.length];
    const len = Math.hypot(bx - ax, bz - az);
    if (len > 46 || len < 4) continue;
    const yaw = Math.atan2(bx - ax, bz - az);
    const y = (ay + by) / 2 + 13;
    put(g, box(1.6, 0.16, len, mat(pal.timber)), (ax + bx) / 2, y, (az + bz) / 2, yaw);
    for (const s of [1, -1]) {
      put(g, box(0.09, 0.09, len, mat(pal.trim)), (ax + bx) / 2 + Math.cos(yaw) * s * 0.85, y + 0.9, (az + bz) / 2 - Math.sin(yaw) * s * 0.85, yaw);
    }
  }
}

// --------------------------------------------------------------- the port --

function buildPort(g, plan, heightAt, rng) {
  const port = plan.port;
  if (!port) return;
  const pal = plan.palette;
  const { x: cx, z: cz } = plan;

  // the quay: a stone face along the arc, with bollards along it
  const arcN = 16;
  for (let i = 0; i <= arcN; i++) {
    const a = port.bearing + (i / arcN - 0.5) * port.half * 2;
    const x = cx + Math.sin(a) * port.quayR, z = cz + Math.cos(a) * port.quayR;
    const y = heightAt(x, z);
    put(g, box(6.2, 2.0, 3.0, mat(pal.stone)), x, y + 0.4, z, a);
    if (i % 3 === 0) put(g, cyl(0.3, 0.36, 1.0, mat(pal.metal), 7), x, y + 1.6, z);
  }

  // the water, over the seaward arc at the sea's own level, so a jetty has
  // something under it even where the terrain has not been dug out for it
  // The ring starts where the ground is actually near the sea. Drawn from the
  // quay it would be a plane buried under four metres of tidal flat at the Red
  // Queen's Harbour, which is a water surface nobody would ever see.
  const waterR0 = Math.max(port.quayR, port.shoreR - 8);
  const waterGeo = new THREE.RingGeometry(waterR0, Math.max(waterR0 + 4, plan.precinctR - 2), 26, 1,
    Math.PI / 2 - port.bearing - port.half, port.half * 2);
  put(g, new THREE.Mesh(waterGeo, mat(COMMON.water, 'water')), cx, SEA_LEVEL + 0.12, cz, 0, -Math.PI / 2);

  for (const jetty of lotsOfKind(plan, 'jetty')) {
    const yaw = jetty.yaw;
    const n = Math.max(4, Math.round(jetty.d / 4));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n - 0.5;
      const x = jetty.x + Math.sin(yaw) * t * jetty.d, z = jetty.z + Math.cos(yaw) * t * jetty.d;
      const deck = Math.max(SEA_LEVEL + 1.1, heightAt(x, z) + 0.7);
      put(g, box(jetty.w, 0.24, jetty.d / n + 0.2, mat(pal.timber)), x, deck, z, yaw);
      for (const s of [1, -1]) {
        const px = x + Math.cos(yaw) * s * (jetty.w / 2 - 0.3), pz = z - Math.sin(yaw) * s * (jetty.w / 2 - 0.3);
        const h = Math.max(1.2, deck - heightAt(px, pz) + 0.6);
        put(g, cyl(0.2, 0.26, h, mat(pal.roof), 6), px, deck - h / 2, pz);
      }
    }
    const hx = jetty.x - Math.sin(yaw) * jetty.d / 2, hz = jetty.z - Math.cos(yaw) * jetty.d / 2;
    const hy = Math.max(SEA_LEVEL + 1.1, heightAt(hx, hz) + 0.7);
    put(g, cyl(0.14, 0.18, 2.4, mat(pal.metal), 6), hx, hy + 1.2, hz);
    put(g, ball(0.32, mat(pal.glow, 'lit'), 5), hx, hy + 2.5, hz);
  }

  for (const hull of lotsOfKind(plan, 'hull')) {
    const { y, afloat } = waterlineAt(hull.x, hull.z, heightAt);
    const bodyG = hullBody(hull, pal, afloat ? 0 : (rng() < 0.5 ? -0.16 : 0.16));
    bodyG.position.set(hull.x, y, hull.z);
    bodyG.rotation.y = hull.yaw;
    g.add(bodyG);
  }

  for (const mole of lotsOfKind(plan, 'mole')) {
    const n = Math.max(4, Math.round(mole.d / 4));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n - 0.5;
      const x = mole.x + Math.sin(mole.yaw) * t * mole.d, z = mole.z + Math.cos(mole.yaw) * t * mole.d;
      const gy = heightAt(x, z);
      const h = Math.max(2.0, SEA_LEVEL + 2.4 - gy);
      put(g, box(mole.w, h, mole.d / n + 0.3, mat(pal.stoneDark)), x, gy + h / 2, z, mole.yaw);
      if (i % 2 === 0) put(g, box(mole.w * 0.5, 0.7, 1.0, mat(pal.stone)), x, gy + h + 0.3, z, mole.yaw);
    }
  }
}

// ------------------------------------------------------------------ build --

/**
 * The town at an authored precinct site, or null for anything else, which is
 * what makes `site_models.buildSiteMarker` fall back to the village it has
 * always built for a rolled town.
 *
 * @param opts.seed      the layout seed; 0 by default, so an authored town is
 *                       the same town in every world, which is the point of an
 *                       authored town
 * @param opts.bearings  gate bearings, if the caller can read the roads
 * @param opts.port      { bearing, shoreR }, if the caller has already measured
 */
export function buildTown(site, heightAt, opts = {}) {
  if (!site || site.kind !== 'town' || !site.authored) return null;
  const spec = TOWN_SPECS[site.sub];
  if (!spec) return null;
  const seed = opts.seed ?? 0;
  const probe = heightAt || (() => site.y || 0);
  const port = spec.port ? (opts.port ?? seawardOf(site, probe)) : undefined;
  const plan = layoutTown(site, seed, { ...opts, port });
  if (!plan) return null;

  const pal = plan.palette;
  const rng = mulberry32(hash2(site.cx | 0, site.cz | 0, 0x704b));
  const body = new THREE.Group();
  body.name = `town:${site.id}`;

  buildStreets(body, plan, probe);
  buildSquare(body, plan, probe);
  buildWall(body, plan, probe);
  buildGates(body, plan, probe);
  const keepTop = buildKeep(body, plan, probe);

  for (const lot of plan.lots) {
    // the water side is built by buildPort and the dressing by realmDressing,
    // both off the same list; building them here as well would put a house on
    // every standing stone in the ring round Hearthhome
    if (lot.kind === 'jetty' || lot.kind === 'hull' || lot.kind === 'mole') continue;
    if (lot.prop || lot.keep) continue;
    const foot = footingFor(lot, probe);
    const y = foot.y - 0.12 + foot.plinth;
    let piece;

    if (lot.kind === 'stall') {
      piece = stallBody(lot, pal, mat(pal.banner));
    } else if (lot.kind === 'forge') {
      piece = forgeBody(pal);
    } else if (lot.kind === 'gallows') {
      piece = gallowsBody(pal);
    } else if (lot.kind === 'cairn') {
      piece = new THREE.Group();
      for (let k = 0; k < 6; k++) {
        put(piece, box(2.0 - k * 0.28, 0.42, 1.8 - k * 0.24, mat(k % 2 ? pal.stone : pal.stoneDark)), 0, 0.22 + k * 0.44, 0, k * 0.7);
      }
    } else if (lot.kind === 'block') {
      // the Legion's muster block, which is a slave market and is not called one
      piece = new THREE.Group();
      put(piece, box(lot.w, 1.1, lot.d, mat(pal.stoneDark)), 0, 0.55, 0);
      put(piece, box(lot.w - 1.2, 0.4, lot.d - 1.2, mat(pal.stone)), 0, 1.3, 0);
      for (const s of [1, -1]) put(piece, box(0.24, 3.2, 0.24, mat(pal.metal)), s * (lot.w / 2 - 0.4), 2.6, 0);
      put(piece, box(lot.w - 0.6, 0.2, 0.2, mat(pal.metal)), 0, 4.1, 0);
    } else if (lot.kind === 'pens' || lot.kind === 'fold') {
      piece = buildEnclosure(lot.w > 14 ? 'large' : 'small');
      put(piece, box(3.2, 0.7, 1.0, mat(pal.timber)), 0, 0.35, -lot.d / 2 + 2.2);
      put(piece, cone(1.6, 2.6, mat(pal.roof), 7), lot.w / 2 - 2.6, 1.3, -lot.d / 2 + 2.4);
    } else if (lot.kind === 'palmyard') {
      piece = new THREE.Group();
      for (let k = 0; k < 4; k++) {
        const px = (k % 2 ? 1 : -1) * 2.6, pz = (k < 2 ? 1 : -1) * 2.6;
        put(piece, cyl(0.26, 0.4, 7, mat(pal.timber), 6), px, 3.5, pz);
        for (let q = 0; q < 5; q++) put(piece, box(0.5, 0.1, 3.0, mat(pal.roofDark)), px + Math.sin(q) * 1.3, 7.1, pz + Math.cos(q) * 1.3, q * 1.25, -0.4);
      }
      put(piece, box(lot.w - 1, 0.2, lot.d - 1, mat(COMMON.sand)), 0, 0.1, 0);
    } else if (lot.kind === 'butts') {
      piece = new THREE.Group();
      for (let k = 0; k < 3; k++) {
        put(piece, cyl(1.1, 1.1, 0.4, mat(COMMON.sand), 10), (k - 1) * 3.4, 1.6, 0, 0, Math.PI / 2);
        put(piece, cyl(0.35, 0.35, 0.44, mat(pal.banner), 8), (k - 1) * 3.4, 1.6, 0.03, 0, Math.PI / 2);
        put(piece, box(0.2, 1.6, 0.2, mat(pal.timber)), (k - 1) * 3.4, 0.8, -0.4);
      }
    } else {
      const isInn = lot.kind === 'inn';
      const civic = lot.kind === 'bank' || lot.kind === 'church' || lot.kind === 'court';
      const built = building(lot, pal, plan.realm, {
        h: bodyHeightOf(lot),
        style: lot.style === 'hall' ? 'gable' : undefined,
        pitch: lot.style === 'hall' ? 1.25 : 0.8,
        chimney: isInn || lot.kind === 'house' || lot.kind === 'brewhouse' || lot.kind === 'forgehouse',
        wallHex: civic ? pal.stone : undefined,
        darkHex: civic ? pal.stoneDark : undefined,
        doorW: lot.kind === 'bank' ? 1.4 : isInn ? 2.2 : 1.5,
        windows: lot.kind === 'bank' ? 1 : undefined,
      });
      piece = built.g;
      if (isInn) sign(piece, lot.d, pal, built.h);
      if (lot.kind === 'bank' || lot.kind === 'barracks' || lot.kind === 'court') banner(piece, lot.d, pal, built.h);
      if (lot.kind === 'church') {
        // a tower with a spire, because a church is the thing you steer by
        put(piece, box(4.2, built.h + 6, 4.2, mat(pal.stone)), 0, (built.h + 6) / 2, -lot.d / 2 - 1.6);
        put(piece, cone(3.2, 6.5, mat(pal.roofDark), 6), 0, built.h + 9.4, -lot.d / 2 - 1.6);
        put(piece, ball(0.5, mat(COMMON.gold), 6), 0, built.h + 13.0, -lot.d / 2 - 1.6);
      }
      if (lot.kind === 'granary' || lot.kind === 'cistern' || lot.kind === 'icehouse') {
        put(piece, cyl(lot.w * 0.42, lot.w * 0.45, 2.0, mat(pal.stoneDark), 10), 0, built.h + 1.1, 0);
      }
      if (lot.kind === 'warehouse' || lot.kind === 'salvage') {
        put(piece, box(0.3, 3.4, 0.3, mat(pal.timber)), lot.w / 2 - 0.6, built.h + 1.6, lot.d / 2 - 0.6);
        put(piece, box(0.24, 0.24, 2.6, mat(pal.timber)), lot.w / 2 - 0.6, built.h + 3.1, lot.d / 2 + 0.5);
        for (let k = 0; k < 3; k++) put(piece, box(1.3, 1.3, 1.3, mat(pal.roofDark)), -lot.w / 2 + 1.2 + k * 1.6, 0.9, lot.d / 2 + 1.6, k * 0.5);
      }
      if (lot.kind === 'drying') {
        for (let k = 0; k < 4; k++) put(piece, box(0.14, 0.14, lot.d + 2, mat(pal.timber)), (k - 1.5) * 2.2, built.h + 1.2, 0);
      }
    }

    // the plinth, where the ground falls away under a footprint
    if (foot.plinth > 0) {
      put(body, box(lot.w + 0.9, foot.plinth + 0.4, lot.d + 0.9, mat(pal.stone)),
        lot.x, foot.y - 0.12 + foot.plinth / 2, lot.z, lot.yaw);
    }
    piece.position.set(lot.x, y, lot.z);
    piece.rotation.y = lot.yaw;
    body.add(piece);
  }

  buildPort(body, plan, probe, rng);
  realmDressing(body, plan, probe, rng);

  // Whale ribs over the hall at Coldseat, which the sheet names as the roof and
  // which belongs to the inn rather than to any lot of its own.
  if (plan.sub === 'coldseat') {
    const inn = lotOf(plan, 'inn');
    if (inn) {
      const y = probe(inn.x, inn.z);
      for (let i = 0; i < 6; i++) {
        const t = (i / 5 - 0.5) * inn.d * 0.9;
        const px = inn.x + Math.sin(inn.yaw) * t, pz = inn.z + Math.cos(inn.yaw) * t;
        for (const s of [1, -1]) {
          put(body, cyl(0.22, 0.4, 11, mat(pal.trim), 6),
            px + Math.cos(inn.yaw) * s * (inn.w / 2 + 0.8), y + 5.4, pz - Math.sin(inn.yaw) * s * (inn.w / 2 + 0.8),
            inn.yaw, 0, s * 0.42);
        }
      }
    }
  }

  // lanterns from the camp kit at the doors people walk to after dark
  for (const kind of ['inn', 'healer', 'bank']) {
    const lot = lotOf(plan, kind);
    if (!lot) continue;
    const at = doorOf(lot, 0.35);
    const lantern = buildCamp('lantern');
    lantern.position.set(at.x, probe(at.x, at.z) + 2.2, at.z);
    lantern.rotation.y = lot.yaw;
    body.add(lantern);
  }

  // ---- merge, then hang the waystone on the side --------------------------
  const merged = mergeByMaterial(body,{physical:true});
  merged.traverse((o) => { if (o.isMesh) o.userData.site = site; });

  const wsGroup = new THREE.Group();
  const stone = waystoneBody(pal);
  stone.position.set(plan.waystone.x, probe(plan.waystone.x, plan.waystone.z) - 0.1, plan.waystone.z);
  stone.rotation.y = plan.waystone.yaw;
  wsGroup.add(stone);
  const wsMerged = mergeByMaterial(wsGroup,{physical:true});
  wsMerged.traverse((o) => { if (o.isMesh) { o.userData.site = site; o.userData.waystone = true; } });
  wsMerged.userData.waystone = true;
  wsMerged.userData.site = site;

  // ---- and the castle's gate, for the same reason ------------------------
  // A raycast has to be able to tell the castle's gate from the wall beside it,
  // and the merge buckets by colour, so the gate is built and merged alone and
  // its flag is set after. Merged with the town, `userData.keep` would have sat
  // on every stone body in the place.
  let keepMerged = null;
  if (plan.keep) {
    const kg = new THREE.Group();
    kg.add(keepGateBody(plan, probe));
    keepMerged = mergeByMaterial(kg,{physical:true});
    keepMerged.traverse((o) => { if (o.isMesh) { o.userData.site = site; o.userData.keep = true; } });
    keepMerged.userData.keep = true;
    keepMerged.userData.site = site;
  }

  const out = new THREE.Group();
  out.name = `site:${site.id}`;
  out.add(merged, wsMerged);
  if (keepMerged) out.add(keepMerged);
  out.userData.site = site;
  out.userData.town = plan;
  // where the castle is, and where the top of its tower is, so a caller does
  // not have to work either out from the plan a second time
  out.userData.keep = plan.keep ? { ...plan.keep, top: keepTop } : null;
  out.userData.keepNote = plan.keepNote;
  return out;
}
