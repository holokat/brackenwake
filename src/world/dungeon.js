// What a level looks like from inside it.
//
// dungeon_gen.js says which cells are floor and which are rock. This turns that
// into geometry: one merged floor, two merged wall meshes, torch props, the way
// back up, the way further down, and (in a cave) real ore the pickaxe already
// knows how to break.
//
// THREE is passed in rather than imported so this module owes nothing to a
// bundler and the generator stays the only thing node has to load.
//
// ---- no ceiling, and why -------------------------------------------------
// The camera is OrbitControls looking down from six metres or more. A roof over
// the level would be the only thing it ever saw: every frame would be the
// underside of a slab, and hiding it per-cell means a visibility pass that has
// to be right at every angle. So there is no roof. What sells the underground
// is not a lid, it is that you cannot see far: the background goes to almost
// black and a short fog closes at 34 m in a dungeon and 28 m in a cave, which
// is a room and a half. Wall tops are capped so nothing shows its hollow side.
//
// ---- the light budget ----------------------------------------------------
// Eight point lights, never nine, because every one of them costs a shader
// branch on every lit fragment. Six are a pool that follows the player: torch
// props stand all over the level, and each frame the six nearest to the orbit
// target get the six lights. A torch light reaches 11 m and the swap happens
// outside that radius, so a torch never visibly winks. The other two are fixed
// on the entrance and on the stair down, so the two things you need to find are
// the two things always lit.

import { createTreeField, removeTreeField } from '../farm/tree_edit.js';
import { cellAt, walkable, worldOf, CELL } from './dungeon_gen.js';
import { mulberry32, hash2 } from './noise.js';

export const WALL_H = 3.2;
export const TORCH_POOL = 6;          // roaming lights
export const LIGHT_BUDGET = 8;        // pool + entrance + stair, and that is all
const TORCH_RANGE = 11;
const TORCH_SPACING = 5;              // cells between torch props

export const PALETTE = {
  dungeon: {
    floor: 0x3a3631, wallA: 0x4c463f, wallB: 0x3c3730, cap: 0x2c2823,
    bg: 0x06060a, fog: 0x07070b, fogNear: 5, fogFar: 34,
    ambient: 0x5a6478, ambientI: 0.17,
  },
  cave: {
    floor: 0x453b32, wallA: 0x574a3f, wallB: 0x433830, cap: 0x342c25,
    bg: 0x05060a, fog: 0x06070a, fogNear: 4, fogFar: 28,
    ambient: 0x4e5c6b, ambientI: 0.15,
  },
};

// ---------------------------------------------------------------------------
// A tiny mesh builder: quads straight into typed arrays. A level is a few
// thousand triangles of axis-aligned boxes, so making a THREE geometry per cell
// and merging them afterwards would allocate a thousand objects to throw away.
// ---------------------------------------------------------------------------
function bucket() { return { pos: [], nrm: [] }; }
function quad(b, a1, a2, a3, a4, n) {
  for (const v of [a1, a2, a3, a1, a3, a4]) { b.pos.push(v[0], v[1], v[2]); b.nrm.push(n[0], n[1], n[2]); }
}
function meshOf(THREE, b, mat) {
  if (!b.pos.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(b.pos), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(b.nrm), 3));
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, mat);
  m.receiveShadow = true;
  return m;
}

/**
 * Build a level. `layout` comes from generateDungeon.
 * Returns { group, entrancePos, stairPos, torches, update(target), dispose() }.
 */
export function createDungeonScene(THREE, layout, opts = {}) {
  const P = PALETTE[layout.kind] || PALETTE.dungeon;
  const rng = mulberry32(hash2(layout.cx, layout.cz, (layout.seed | 0) + layout.level * 101));
  const group = new THREE.Group();
  group.name = `dungeon:${layout.id}:${layout.level}`;

  const stone = (c, extra) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, flatShading: true, ...extra });
  const mats = {
    floor: stone(P.floor), wallA: stone(P.wallA), wallB: stone(P.wallB), cap: stone(P.cap),
    wood: stone(0x4a3524), iron: stone(0x2e2f33, { metalness: 0.4, roughness: 0.6 }),
    flame: new THREE.MeshBasicMaterial({ color: 0xffc46a, fog: false }),
    dark: new THREE.MeshBasicMaterial({ color: 0x000000, fog: false }),
    pale: stone(0x8b8378),
  };
  const owned = [];                                     // everything to dispose

  // ---- floor -------------------------------------------------------------
  const floorB = bucket(), wallB1 = bucket(), wallB2 = bucket(), capB = bucket();
  const H = CELL / 2;
  for (let gz = 0; gz < layout.h; gz++) for (let gx = 0; gx < layout.w; gx++) {
    const p = worldOf(layout, gx, gz);
    if (walkable(layout, gx, gz)) {
      quad(floorB, [p.x - H, 0, p.z - H], [p.x - H, 0, p.z + H], [p.x + H, 0, p.z + H], [p.x + H, 0, p.z - H], [0, 1, 0]);
      continue;
    }
    // rock: only the faces that look onto a floor cell are built, so the solid
    // interior of the map costs nothing at all
    const faces = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dz]) => walkable(layout, gx + dx, gz + dz));
    if (!faces.length) continue;
    const b = hash2(gx, gz, layout.level) % 3 ? wallB1 : wallB2;
    for (const [dx, dz] of faces) {
      const cxp = p.x + dx * H, czp = p.z + dz * H;
      // the face plane, spanned across the cell edge and up the wall
      const ux = dz === 0 ? 0 : H, uz = dz === 0 ? H : 0;
      quad(b,
        [cxp - ux, 0, czp - uz], [cxp - ux, WALL_H, czp - uz],
        [cxp + ux, WALL_H, czp + uz], [cxp + ux, 0, czp + uz],
        [dx, 0, dz]);
    }
    // a cap on top so a wall never shows a hollow edge from above
    quad(capB, [p.x - H, WALL_H, p.z - H], [p.x + H, WALL_H, p.z - H], [p.x + H, WALL_H, p.z + H], [p.x - H, WALL_H, p.z + H], [0, 1, 0]);
  }
  for (const [b, m] of [[floorB, mats.floor], [wallB1, mats.wallA], [wallB2, mats.wallB], [capB, mats.cap]]) {
    const mesh = meshOf(THREE, b, m);
    if (mesh) { group.add(mesh); owned.push(mesh); }
  }

  // ---- the way up and the way down --------------------------------------
  const ePos = worldOf(layout, layout.entrance.gx, layout.entrance.gz);
  const entrancePos = new THREE.Vector3(ePos.x, 0, ePos.z);
  const exits = [];

  // Hit boxes are invisible on purpose. three's raycaster does NOT skip
  // invisible objects, so an unlit, undrawn box is a free, generous target that
  // never has to be art-directed around the steps it wraps.
  const hitBox = (pos, tag) => {
    const hb = new THREE.Mesh(new THREE.BoxGeometry(2.6, 3.0, 2.6), mats.dark);
    hb.position.set(pos.x, 1.4, pos.z);
    hb.visible = false;
    hb.userData.exit = tag;
    group.add(hb); owned.push(hb); exits.push(hb);
    return hb;
  };

  // up: three steps climbing to a pale arch, so it reads as daylight-ward
  {
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.26, 0.5), mats.pale);
      s.position.set(entrancePos.x, 0.13 + i * 0.26, entrancePos.z + 0.4 - i * 0.42);
      s.userData.exit = 'up'; group.add(s); owned.push(s);
    }
    const arch = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.18, 5, 10, Math.PI), mats.pale);
    arch.position.set(entrancePos.x, 0.8, entrancePos.z - 0.75);
    arch.userData.exit = 'up'; group.add(arch); owned.push(arch);
    hitBox(entrancePos, 'up');
  }

  let stairPos = null;
  if (layout.stair) {
    const s = worldOf(layout, layout.stair.gx, layout.stair.gz);
    stairPos = new THREE.Vector3(s.x, 0, s.z);
    // a black square cut in the floor, four steps going into it
    const hole = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.9), mats.dark);
    hole.rotation.x = -Math.PI / 2; hole.position.set(s.x, 0.02, s.z);
    hole.userData.exit = 'down'; group.add(hole); owned.push(hole);
    for (let i = 0; i < 4; i++) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.22, 0.4), mats.wallA);
      st.position.set(s.x, -0.11 - i * 0.22, s.z - 0.7 + i * 0.4);
      st.userData.exit = 'down'; group.add(st); owned.push(st);
    }
    for (let i = 0; i < 2; i++) {                       // a kerb so the hole reads as a hole
      const k = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.3, 2.1), mats.cap);
      k.position.set(s.x + (i ? 1.0 : -1.0), 0.15, s.z);
      k.userData.exit = 'down'; group.add(k); owned.push(k);
    }
    hitBox(stairPos, 'down');
  }

  // ---- torch props -------------------------------------------------------
  // against a wall, spaced out, deterministic from the level's own rng
  const torches = [];
  const used = [];
  for (let gz = 1; gz < layout.h - 1; gz++) for (let gx = 1; gx < layout.w - 1; gx++) {
    if (!walkable(layout, gx, gz)) continue;
    const wall = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dz]) => !walkable(layout, gx + dx, gz + dz));
    if (!wall) continue;
    if (rng() < 0.55) continue;
    if (used.some(([ux, uz]) => Math.abs(ux - gx) < TORCH_SPACING && Math.abs(uz - gz) < TORCH_SPACING)) continue;
    used.push([gx, gz]);
    const p = worldOf(layout, gx, gz);
    torches.push(new THREE.Vector3(p.x + wall[0] * 0.7, 1.9, p.z + wall[1] * 0.7));
  }
  const bracketB = bucket(), flameGeos = [];
  for (const t of torches) {
    // a stub bracket, built as one quad box the cheap way: four side faces
    const r = 0.09;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const cxp = t.x + dx * r, czp = t.z + dz * r;
      const ux = dz === 0 ? 0 : r, uz = dz === 0 ? r : 0;
      quad(bracketB, [cxp - ux, 1.1, czp - uz], [cxp - ux, t.y, czp - uz], [cxp + ux, t.y, czp + uz], [cxp + ux, 1.1, czp + uz], [dx, 0, dz]);
    }
    const f = new THREE.SphereGeometry(0.17, 6, 5);
    f.translate(t.x, t.y + 0.16, t.z);
    flameGeos.push(f);
  }
  { const m = meshOf(THREE, bracketB, mats.iron); if (m) { group.add(m); owned.push(m); } }
  if (flameGeos.length) {
    // flames are unlit basic spheres: they glow without spending a light
    const fb = bucket();
    for (const g of flameGeos) {
      const pos = g.attributes.position.array, nrm = g.attributes.normal.array, ix = g.index.array;
      for (let i = 0; i < ix.length; i++) {
        const k = ix[i] * 3;
        fb.pos.push(pos[k], pos[k + 1], pos[k + 2]); fb.nrm.push(nrm[k], nrm[k + 1], nrm[k + 2]);
      }
      g.dispose();
    }
    const m = meshOf(THREE, fb, mats.flame);
    if (m) { group.add(m); owned.push(m); }
  }

  // ---- chests (dungeon) --------------------------------------------------
  for (const c of layout.chests) {
    const p = worldOf(layout, c.gx, c.gz);
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.5, 0.6), mats.wood);
    box.position.set(p.x, 0.25, p.z); box.rotation.y = rng() * Math.PI;
    const lid = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.14, 0.65), mats.iron);
    lid.position.set(p.x, 0.56, p.z); lid.rotation.y = box.rotation.y;
    group.add(box, lid); owned.push(box, lid);
  }

  // ---- ore (cave): the same field the surface uses, so the pickaxe that
  // works on a hillside boulder works on this without knowing where it is. It
  // declares `yield: 'ore'`, which is the name breakRock hands back and the
  // name main.js spends, exactly as world:ore does above ground ----
  let oreField = null;
  if (layout.kind === 'cave' && layout.ore.length) {
    oreField = createTreeField({
      name: `dungeon:${layout.id}:${layout.level}:ore`, kind: 'rock', hits: 5, yield: 'ore', parent: group,
      layers: [
        { geo: new THREE.DodecahedronGeometry(1, 0), mat: stone(0x4e5a63),
          of: (t) => ({ x: t.x, y: t.gy + 0.5 * t.s, z: t.z, s: t.s, sy: 0.9, ry: t.ry }) },
        { geo: new THREE.DodecahedronGeometry(0.4, 0), mat: stone(0xc47a3a, { metalness: 0.35, roughness: 0.5 }),
          of: (t) => ({ x: t.x + 0.5 * t.s, y: t.gy + 0.9 * t.s, z: t.z + 0.3 * t.s, s: t.s * 0.6, ry: -t.ry }) },
      ],
    });
    for (const o of layout.ore) {
      const p = worldOf(layout, o.gx, o.gz);
      oreField.trees.push({ x: p.x, z: p.z, gy: 0, s: 0.5 + rng() * 0.3, ry: rng() * Math.PI, alt: 0, oa: 0 });
    }
    oreField.hydrated = true;   // a level is never saved, so never load one either
    oreField.rebuild();
  }

  // ---- light -------------------------------------------------------------
  const ambient = new THREE.AmbientLight(P.ambient, P.ambientI);
  group.add(ambient);
  const pool = [];
  for (let i = 0; i < TORCH_POOL; i++) {
    const l = new THREE.PointLight(0xffb35a, 9, TORCH_RANGE, 1.4);
    l.visible = false;
    group.add(l); pool.push(l);
  }
  const entLight = new THREE.PointLight(0xffd9a8, 7, 13, 1.3);
  entLight.position.set(entrancePos.x, 2.3, entrancePos.z);
  group.add(entLight);
  const stairLight = new THREE.PointLight(0x7fc8ff, 6, 12, 1.3);
  if (stairPos) { stairLight.position.set(stairPos.x, 2.1, stairPos.z); group.add(stairLight); }

  let lastX = Infinity, lastZ = Infinity;
  const built = {
    group, entrancePos, stairPos, torches, exits, oreField,
    layout, palette: P,
    /** number of PointLights this level owns, ever. */
    get lightCount() { return pool.length + 1 + (stairPos ? 1 : 0); },
    /** Hand the six roaming lights to the six nearest torches. */
    update(pos) {
      if (Math.hypot(pos.x - lastX, pos.z - lastZ) < 1.0) return false;
      lastX = pos.x; lastZ = pos.z;
      const near = torches
        .map((t, i) => [i, (t.x - pos.x) ** 2 + (t.z - pos.z) ** 2])
        .sort((a, b) => a[1] - b[1])
        .slice(0, pool.length);
      for (let i = 0; i < pool.length; i++) {
        const n = near[i];
        if (!n) { pool[i].visible = false; continue; }
        pool[i].position.copy(torches[n[0]]);
        pool[i].visible = true;
      }
      return true;
    },
    dispose() {
      if (oreField) removeTreeField(oreField);
      group.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        const m = o.material;
        if (Array.isArray(m)) m.forEach((x) => x.dispose?.()); else m?.dispose?.();
        if (o !== group) o.dispose?.();     // InstancedMesh buffers, light shadow maps
      });
      for (const m of Object.values(mats)) m.dispose?.();
      group.parent?.remove(group);
      group.clear();
    },
  };
  built.update({ x: entrancePos.x, z: entrancePos.z });
  return built;
}
