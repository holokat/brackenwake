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

  for (const lot of plan.lots) {
    // the water side is built by buildPort and the dressing by realmDressing,
    // both off the same list; building them here as well would put a house on
    // every standing stone in the ring round Hearthhome
    if (lot.kind === 'jetty' || lot.kind === 'hull' || lot.kind === 'mole') continue;
    if (lot.prop) continue;
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
        h: isInn ? (lot.style === 'hall' ? 7.6 : 8.4) : lot.kind === 'house' ? 4.6 + rng() * 1.4 : 6,
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
  const merged = mergeByMaterial(body);
  merged.traverse((o) => { if (o.isMesh) o.userData.site = site; });

  const wsGroup = new THREE.Group();
  const stone = waystoneBody(pal);
  stone.position.set(plan.waystone.x, probe(plan.waystone.x, plan.waystone.z) - 0.1, plan.waystone.z);
  stone.rotation.y = plan.waystone.yaw;
  wsGroup.add(stone);
  const wsMerged = mergeByMaterial(wsGroup);
  wsMerged.traverse((o) => { if (o.isMesh) { o.userData.site = site; o.userData.waystone = true; } });
  wsMerged.userData.waystone = true;
  wsMerged.userData.site = site;

  const out = new THREE.Group();
  out.name = `site:${site.id}`;
  out.add(merged, wsMerged);
  out.userData.site = site;
  out.userData.town = plan;
  return out;
}
