// What a cavern looks like from inside it.
//
// cavern_gen.js says which cells are floor, how high each one is, where the
// gorges and the spans and the pools are, and which boxes stand where. This
// turns that into geometry: floors at their own heights, risers where one ledge
// meets the next, walls where rock meets floor, a roof that follows the ledges,
// pits under the bridges, planked spans across them, still water, the way up
// and the way down, chests you can click, and a light budget that never grows.
//
// THREE is passed in rather than imported, exactly as dungeon.js does it, so
// the generator stays the only thing node has to load.
//
// ---- what is shared with dungeon.js, and what is not ---------------------
//
// The stone sheets, the camera clamp, the torch constants and the light budget
// are dungeon.js's and are imported from it: two files drawing underground with
// two different ideas of how far a torch reaches would be two bugs waiting.
// The mesh builder is small and is here, because every quad in a cavern is
// written at a height and the one in dungeon.js is written at zero.
//
// ---- the roof, and why it takes the HIGHEST ceiling ----------------------
//
// dungeon.js builds its roof from corner heights and takes the LOWEST ceiling
// of the cells touching each corner, which is right on one flat floor. Here the
// floors are not flat: a ledge six metres up beside a hall would pull the
// corner between them down to the hall's roof, and the roof would come down
// through the ledge. So a corner takes the HIGHEST absolute ceiling of the
// cells touching it, and the roof of a cavern rises over its high ground. The
// wall faces read the same corners, so wall and roof still meet exactly.
//
// ---- the light budget ----------------------------------------------------
//
// Eight point lights, the same eight dungeon.js allows: six that follow the
// player around the level's torch stands, one on the way up and one on the way
// down. The arena's stands are marked warm, and a light that lands on one burns
// oranger and brighter, which is how the boss's hall is lit differently without
// costing a ninth light.

import { createTreeField, removeTreeField } from '../farm/tree_edit.js';
import { cellAt, walkable, worldOf, roomAt, floorAt, CELL } from './dungeon_gen.js';
import { isGorge } from './cavern_gen.js';
import { stoneSheets, ceilingAt, CEIL, TORCH_POOL, TORCH_RANGE, TORCH_SPACING, TEX_M } from './dungeon.js';
import { mulberry32, hash2 } from './noise.js';

/**
 * Ceiling height above the floor, by what the cell belongs to. The table lives
 * in dungeon.js beside the other two, because `cameraClamp` reads it and a
 * second table here would be a roof the camera did not know about.
 */
export const CAVERN_CEIL = CEIL.cavern;

/** The nine stones a realm's underground is cut out of. dungeons.js names them. */
export const THEME_PALETTE = {
  brick: {
    floor: 0x6b6154, wallA: 0x7b5f4c, wallB: 0x64493a, cap: 0x4a3a2e, ceiling: 0x51443a,
    bg: 0x07060a, fog: 0x08070b, fogNear: 6, fogFar: 44,
    ambient: 0x5a6478, ambientI: 0.20, fill: 0x3c4a63, fillGround: 0x241d16, fillI: 0.16,
    water: 0x0a1418, wallTex: 'blocks', floorTex: 'flags', ceilTex: 'blocks',
  },
  root: {
    floor: 0x4f4633, wallA: 0x5c4b33, wallB: 0x453a29, cap: 0x352c1f, ceiling: 0x3b3323,
    bg: 0x050705, fog: 0x060806, fogNear: 5, fogFar: 38,
    ambient: 0x4e6a4a, ambientI: 0.20, fill: 0x3a5a3a, fillGround: 0x1d1a10, fillI: 0.16,
    water: 0x0d1a12, wallTex: 'rock', floorTex: 'gravel', ceilTex: 'rock',
  },
  coral: {
    floor: 0x5d6a6b, wallA: 0x6f7f80, wallB: 0x4f5d5f, cap: 0x3c4749, ceiling: 0x44514f,
    bg: 0x03080c, fog: 0x04090d, fogNear: 5, fogFar: 36,
    ambient: 0x4a7a8c, ambientI: 0.22, fill: 0x2f6076, fillGround: 0x16242a, fillI: 0.18,
    water: 0x08202a, wallTex: 'rock', floorTex: 'gravel', ceilTex: 'rock',
  },
  brass: {
    floor: 0x6b5b42, wallA: 0x7d6636, wallB: 0x5d4c2c, cap: 0x453723, ceiling: 0x4a3d28,
    bg: 0x0a0603, fog: 0x0c0804, fogNear: 6, fogFar: 40,
    ambient: 0x8a5a2a, ambientI: 0.22, fill: 0x7a4418, fillGround: 0x2a1a0a, fillI: 0.18,
    water: 0x1a1006, wallTex: 'blocks', floorTex: 'flags', ceilTex: 'blocks',
  },
  granite: {
    floor: 0x6d6b68, wallA: 0x7a7873, wallB: 0x5c5a57, cap: 0x454340, ceiling: 0x4d4b48,
    bg: 0x06070a, fog: 0x07080b, fogNear: 6, fogFar: 44,
    ambient: 0x5f6a7a, ambientI: 0.19, fill: 0x40506a, fillGround: 0x1f2126, fillI: 0.16,
    water: 0x0a1218, wallTex: 'rock', floorTex: 'gravel', ceilTex: 'rock',
  },
  bone: {
    floor: 0x7d7767, wallA: 0xa39c88, wallB: 0x837c6a, cap: 0x5e594c, ceiling: 0x6a6456,
    bg: 0x07070a, fog: 0x09090c, fogNear: 6, fogFar: 42,
    ambient: 0x6a6a72, ambientI: 0.20, fill: 0x4a4a58, fillGround: 0x26251f, fillI: 0.17,
    water: 0x101008, wallTex: 'rock', floorTex: 'gravel', ceilTex: 'rock',
  },
  ice: {
    floor: 0x8fa7b6, wallA: 0x9fbccd, wallB: 0x7793a5, cap: 0x5d7686, ceiling: 0x6b8798,
    bg: 0x040810, fog: 0x061020, fogNear: 7, fogFar: 48,
    ambient: 0x6f9ec8, ambientI: 0.26, fill: 0x4a7fb8, fillGround: 0x1c2a38, fillI: 0.22,
    water: 0x0c2434, wallTex: 'rock', floorTex: 'flags', ceilTex: 'rock',
  },
  marble: {
    floor: 0x9a978e, wallA: 0xb0ada2, wallB: 0x8b887f, cap: 0x67655e, ceiling: 0x77746c,
    bg: 0x03070c, fog: 0x050c14, fogNear: 6, fogFar: 46,
    ambient: 0x5f8ca8, ambientI: 0.24, fill: 0x3d7ea0, fillGround: 0x1d262c, fillI: 0.20,
    water: 0x07202c, wallTex: 'blocks', floorTex: 'flags', ceilTex: 'flags',
  },
  obsidian: {
    floor: 0x2e2b2e, wallA: 0x3a3338, wallB: 0x272328, cap: 0x1c191d, ceiling: 0x232025,
    bg: 0x0a0403, fog: 0x0d0604, fogNear: 5, fogFar: 36,
    ambient: 0x8c3a1a, ambientI: 0.22, fill: 0x8a2c10, fillGround: 0x2a0e06, fillI: 0.20,
    water: 0x200806, wallTex: 'rock', floorTex: 'flags', ceilTex: 'rock',
  },
};

/** The light on an ordinary stand, and the one in the boss's hall. */
export const TORCH_COLOUR = 0xffb35a;
export const ARENA_COLOUR = 0xff8a3a;
export const TORCH_I = 11;
export const ARENA_I = 15;

const ADJ = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// ---------------------------------------------------------------------------
// The mesh builder. Quads straight into arrays, merged once per material.
// ---------------------------------------------------------------------------

function bucket() { return { pos: [], nrm: [], uv: [] }; }

/** One quad, wound so the geometry agrees with the normal it was asked for. */
function quad(b, a1, a2, a3, a4, n, mode) {
  const e1 = [a2[0] - a1[0], a2[1] - a1[1], a2[2] - a1[2]];
  const e2 = [a3[0] - a1[0], a3[1] - a1[1], a3[2] - a1[2]];
  const dot = (e1[1] * e2[2] - e1[2] * e2[1]) * n[0]
    + (e1[2] * e2[0] - e1[0] * e2[2]) * n[1]
    + (e1[0] * e2[1] - e1[1] * e2[0]) * n[2];
  const q = dot < 0 ? [a1, a4, a3, a1, a3, a2] : [a1, a2, a3, a1, a3, a4];
  for (const v of q) {
    b.pos.push(v[0], v[1], v[2]);
    b.nrm.push(n[0], n[1], n[2]);
    if (mode === 'xy') b.uv.push(v[0] / TEX_M, v[1] / TEX_M);
    else if (mode === 'zy') b.uv.push(v[2] / TEX_M, v[1] / TEX_M);
    else b.uv.push(v[0] / TEX_M, v[2] / TEX_M);
  }
}

/** A box, rotated about y, as six quads. */
function box(b, cx, cy, cz, sx, sy, sz, ry = 0) {
  const c = Math.cos(ry), s = Math.sin(ry);
  const p = (dx, dy, dz) => [cx + dx * c + dz * s, cy + dy, cz - dx * s + dz * c];
  const hx = sx / 2, hy = sy / 2, hz = sz / 2;
  const v = [
    p(-hx, -hy, -hz), p(hx, -hy, -hz), p(hx, -hy, hz), p(-hx, -hy, hz),
    p(-hx, hy, -hz), p(hx, hy, -hz), p(hx, hy, hz), p(-hx, hy, hz),
  ];
  quad(b, v[4], v[5], v[6], v[7], [0, 1, 0], 'xz');
  quad(b, v[3], v[2], v[1], v[0], [0, -1, 0], 'xz');
  quad(b, v[0], v[1], v[5], v[4], [-s, 0, -c], 'xy');
  quad(b, v[2], v[3], v[7], v[6], [s, 0, c], 'xy');
  quad(b, v[1], v[2], v[6], v[5], [c, 0, -s], 'zy');
  quad(b, v[3], v[0], v[4], v[7], [-c, 0, s], 'zy');
}

/** An n-sided prism standing between two heights. */
function prism(b, cx, cz, r, y0, y1, sides = 8, taper = 1) {
  for (let i = 0; i < sides; i++) {
    const a0 = (i / sides) * 6.2832, a1 = ((i + 1) / sides) * 6.2832;
    const c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1);
    const nx = Math.cos((a0 + a1) / 2), nz = Math.sin((a0 + a1) / 2);
    quad(b,
      [cx + c0 * r, y0, cz + s0 * r],
      [cx + c0 * r * taper, y1, cz + s0 * r * taper],
      [cx + c1 * r * taper, y1, cz + s1 * r * taper],
      [cx + c1 * r, y0, cz + s1 * r],
      [nx, 0, nz], Math.abs(nx) > Math.abs(nz) ? 'zy' : 'xy');
  }
}

function meshOf(THREE, b, mat, shadow = true) {
  if (!b.pos.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(b.pos), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(b.nrm), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(b.uv), 2));
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, mat);
  m.receiveShadow = shadow;
  return m;
}

// ---------------------------------------------------------------------------
// The roof
// ---------------------------------------------------------------------------

/**
 * The absolute roof height over a cell: its own floor plus its own headroom.
 * The headroom is dungeon.js's `ceilingAt`, which reads the cavern table and
 * domes a chamber, so the camera clamp and the geometry cannot disagree.
 */
export const ceilAbs = (layout, gx, gz) => floorAt(layout, gx, gz) + ceilingAt(layout, gx, gz);

/**
 * The roof at a grid corner: the HIGHEST of the cells touching it, so a ledge
 * never comes up through it. See the header.
 */
export function cornerRoof(layout, i, j) {
  let best = 0, any = false;
  for (const [dx, dz] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) {
    const x = i + dx, z = j + dz;
    if (!walkable(layout, x, z)) continue;
    const y = ceilAbs(layout, x, z);
    if (!any || y > best) { best = y; any = true; }
  }
  return any ? best : 0;
}

// ---------------------------------------------------------------------------
// The level
// ---------------------------------------------------------------------------

/**
 * Build a cavern. `layout` comes from generateCavern.
 * Returns the same surface createDungeonScene returns, plus `chestMeshes`,
 * `bridges` and `openChest`.
 */
export function createCavernScene(THREE, layout, opts = {}) {
  const P = THEME_PALETTE[layout.theme] || THEME_PALETTE.granite;
  const rng = mulberry32(hash2(layout.cx | 0, layout.cz | 0, (layout.seed | 0) + layout.level * 131));
  const group = new THREE.Group();
  group.name = `cavern:${layout.id}:${layout.level}`;
  const H = CELL / 2;
  const owned = [];

  const plain = (c, extra) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, ...extra });
  const stone = (c, family, extra) => {
    const t = stoneSheets(THREE, family);
    const m = new THREE.MeshStandardMaterial({
      color: c, map: t.map, normalMap: t.normalMap, roughnessMap: t.roughnessMap,
      roughness: 1, metalness: 0, side: THREE.DoubleSide, ...extra,
    });
    m.normalScale = new THREE.Vector2(1.1, 1.1);
    return m;
  };
  const mats = {
    floor: stone(P.floor, P.floorTex),
    wallA: stone(P.wallA, P.wallTex),
    wallB: stone(P.wallB, P.wallTex),
    riser: stone(P.cap, P.wallTex),
    ceiling: stone(P.ceiling, P.ceilTex, { side: THREE.FrontSide }),
    pit: stone(P.cap, P.wallTex, { side: THREE.DoubleSide }),
    wood: plain(0x4a3524, { roughness: 0.9 }),
    iron: plain(0x35373d, { metalness: 0.55, roughness: 0.5 }),
    rope: plain(0x8a7346, { roughness: 1 }),
    flame: new THREE.MeshBasicMaterial({ color: 0xffc46a, fog: false }),
    dark: new THREE.MeshBasicMaterial({ color: 0x000000, fog: false }),
    water: new THREE.MeshStandardMaterial({ color: P.water, roughness: 0.08, metalness: 0.6, transparent: true, opacity: 0.88 }),
    pale: plain(0x8b8378),
  };

  const floorB = bucket(), riserB = bucket(), wallB1 = bucket(), wallB2 = bucket();
  const ceilB = bucket(), pitB = bucket(), plankB = bucket(), ironB = bucket(), flameB = bucket();

  const corner = (i, j) => cornerRoof(layout, i, j);
  let floorCells = 0, wallFaces = 0, risers = 0, pitCells = 0;

  // ---- floors, risers, walls and roof ------------------------------------
  for (let gz = 0; gz < layout.h; gz++) for (let gx = 0; gx < layout.w; gx++) {
    const p = worldOf(layout, gx, gz);
    const gorge = isGorge(layout, gx, gz);
    if (walkable(layout, gx, gz)) {
      const y = floorAt(layout, gx, gz);
      floorCells++;
      quad(floorB, [p.x - H, y, p.z - H], [p.x - H, y, p.z + H], [p.x + H, y, p.z + H], [p.x + H, y, p.z - H], [0, 1, 0], 'xz');
      // the riser where this cell stands above the one beside it, so a ledge is
      // a face and not a gap you can see the dark through
      for (const [dx, dz] of [[1, 0], [0, 1]]) {
        const nx = gx + dx, nz = gz + dz;
        if (!walkable(layout, nx, nz)) continue;
        const ny = floorAt(layout, nx, nz);
        if (Math.abs(ny - y) < 1e-6) continue;
        const lo = Math.min(y, ny), hi = Math.max(y, ny);
        const cxp = p.x + dx * H, czp = p.z + dz * H;
        const ux = dz === 0 ? 0 : H, uz = dz === 0 ? H : 0;
        quad(riserB,
          [cxp - ux, lo, czp - uz], [cxp - ux, hi, czp - uz],
          [cxp + ux, hi, czp + uz], [cxp + ux, lo, czp + uz],
          [ny > y ? dx : -dx, 0, ny > y ? dz : -dz], dz === 0 ? 'zy' : 'xy');
        risers++;
      }
    }
    // the roof goes over floor AND over a gorge, so a pit is not a hole in the sky
    if (walkable(layout, gx, gz) || gorge) {
      const c00 = corner(gx, gz), c10 = corner(gx + 1, gz);
      const c11 = corner(gx + 1, gz + 1), c01 = corner(gx, gz + 1);
      if (c00 || c10 || c11 || c01) {
        quad(ceilB,
          [p.x - H, c00, p.z - H], [p.x + H, c10, p.z - H],
          [p.x + H, c11, p.z + H], [p.x - H, c01, p.z + H], [0, -1, 0], 'xz');
      }
    }
    if (walkable(layout, gx, gz)) continue;

    if (gorge) {
      // a hole: a floor a long way down, and the sides of it
      const near = ADJ.map(([dx, dz]) => (walkable(layout, gx + dx, gz + dz) ? floorAt(layout, gx + dx, gz + dz) : null))
        .filter((v) => v != null);
      const lip = near.length ? Math.max(...near) : 0;
      const bottom = lip - (layout.bridges[0]?.depth ?? 7);
      pitCells++;
      quad(pitB, [p.x - H, bottom, p.z - H], [p.x - H, bottom, p.z + H],
        [p.x + H, bottom, p.z + H], [p.x + H, bottom, p.z - H], [0, 1, 0], 'xz');
      for (const [dx, dz] of ADJ) {
        const nx = gx + dx, nz = gz + dz;
        // a side is built where the hole meets solid rock or a deck
        if (isGorge(layout, nx, nz)) continue;
        const top = walkable(layout, nx, nz) ? floorAt(layout, nx, nz) : lip + 1.2;
        const cxp = p.x + dx * H, czp = p.z + dz * H;
        const ux = dz === 0 ? 0 : H, uz = dz === 0 ? H : 0;
        quad(pitB,
          [cxp - ux, bottom, czp - uz], [cxp - ux, top, czp - uz],
          [cxp + ux, top, czp + uz], [cxp + ux, bottom, czp + uz],
          [-dx, 0, -dz], dz === 0 ? 'zy' : 'xy');
      }
      continue;
    }

    // rock: only the faces that look onto a floor cell are built
    const faces = ADJ.filter(([dx, dz]) => walkable(layout, gx + dx, gz + dz));
    if (!faces.length) continue;
    const b = hash2(gx, gz, layout.level) % 3 ? wallB1 : wallB2;
    for (const [dx, dz] of faces) {
      const cxp = p.x + dx * H, czp = p.z + dz * H;
      const ux = dz === 0 ? 0 : H, uz = dz === 0 ? H : 0;
      let iA, jA, iB, jB;
      if (dx === 1) { iA = gx + 1; jA = gz; iB = gx + 1; jB = gz + 1; }
      else if (dx === -1) { iA = gx; jA = gz; iB = gx; jB = gz + 1; }
      else if (dz === 1) { iA = gx; jA = gz + 1; iB = gx + 1; jB = gz + 1; }
      else { iA = gx; jA = gz; iB = gx + 1; jB = gz; }
      // the foot of the wall is the floor of the cell it faces, so a wall beside
      // a ledge starts on the ledge and not six metres under it
      const foot = floorAt(layout, gx + dx, gz + dz);
      quad(b,
        [cxp - ux, foot, czp - uz], [cxp - ux, corner(iA, jA), czp - uz],
        [cxp + ux, corner(iB, jB), czp + uz], [cxp + ux, foot, czp + uz],
        [dx, 0, dz], dz === 0 ? 'zy' : 'xy');
      wallFaces++;
    }
  }

  // ---- the spans ---------------------------------------------------------
  // Planks across the deck, a kerb either side, and a rope at hand height.
  for (const b of layout.bridges) {
    for (const c of b.cells) {
      const p = worldOf(layout, c.gx, c.gz);
      const y = floorAt(layout, c.gx, c.gz);
      box(plankB, p.x, y + 0.06, p.z, CELL * 0.98, 0.12, CELL * 0.98, 0);
    }
    const along = b.dir === 'h' ? [1, 0] : [0, 1];
    const side = b.dir === 'h' ? [0, 1] : [1, 0];
    for (const c of b.cells) {
      const p = worldOf(layout, c.gx, c.gz);
      const y = floorAt(layout, c.gx, c.gz);
      for (const s of [-1, 1]) {
        box(plankB, p.x + side[0] * s * (H - 0.1), y + 0.30, p.z + side[1] * s * (H - 0.1),
          along[0] ? CELL : 0.16, 0.16, along[0] ? 0.16 : CELL, 0);
      }
    }
  }

  // ---- the water ---------------------------------------------------------
  const pools = [];
  {
    const waterB = bucket();
    for (const c of layout.water) {
      const p = worldOf(layout, c.gx, c.gz);
      const y = floorAt(layout, c.gx, c.gz) + 0.10;
      quad(waterB, [p.x - H, y, p.z - H], [p.x - H, y, p.z + H],
        [p.x + H, y, p.z + H], [p.x + H, y, p.z - H], [0, 1, 0], 'xz');
      pools.push({ gx: c.gx, gz: c.gz, y });
    }
    const m = meshOf(THREE, waterB, mats.water, false);
    if (m) { m.name = 'cavern:water'; m.renderOrder = 1; group.add(m); owned.push(m); }
  }

  // ---- the way up and the way down --------------------------------------
  const eP = worldOf(layout, layout.entrance.gx, layout.entrance.gz);
  const eY = floorAt(layout, layout.entrance.gx, layout.entrance.gz);
  const entrancePos = new THREE.Vector3(eP.x, eY, eP.z);
  const exits = [];

  const hitBox = (pos, tag) => {
    const hb = new THREE.Mesh(new THREE.BoxGeometry(2.6, 3.0, 2.6), mats.dark);
    hb.position.set(pos.x, pos.y + 1.4, pos.z);
    hb.visible = false;
    hb.userData.exit = tag;
    group.add(hb); owned.push(hb); exits.push(hb);
    return hb;
  };
  {
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.26, 0.5), mats.pale);
      s.position.set(entrancePos.x, eY + 0.13 + i * 0.26, entrancePos.z + 0.4 - i * 0.42);
      s.userData.exit = 'up'; group.add(s); owned.push(s);
    }
    const arch = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.18, 6, 14, Math.PI), mats.pale);
    arch.position.set(entrancePos.x, eY + 0.8, entrancePos.z - 0.75);
    arch.userData.exit = 'up'; group.add(arch); owned.push(arch);
    hitBox(entrancePos, 'up');
  }

  let stairPos = null;
  if (layout.stair) {
    const s = worldOf(layout, layout.stair.gx, layout.stair.gz);
    const sy = floorAt(layout, layout.stair.gx, layout.stair.gz);
    stairPos = new THREE.Vector3(s.x, sy, s.z);
    const hole = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.9), mats.dark);
    hole.rotation.x = -Math.PI / 2; hole.position.set(s.x, sy + 0.02, s.z);
    hole.userData.exit = 'down'; group.add(hole); owned.push(hole);
    for (let i = 0; i < 4; i++) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.22, 0.4), mats.wallA);
      st.position.set(s.x, sy - 0.11 - i * 0.22, s.z - 0.7 + i * 0.4);
      st.userData.exit = 'down'; group.add(st); owned.push(st);
    }
    hitBox(stairPos, 'down');
  }

  // ---- the flames --------------------------------------------------------
  const torches = [];
  const used = [];
  const far = (gx, gz) => !used.some(([ux, uz]) => Math.abs(ux - gx) < TORCH_SPACING && Math.abs(uz - gz) < TORCH_SPACING);
  const busy = (gx, gz) => {
    const c = cellAt(layout, gx, gz);
    return c === 'entrance' || c === 'stair' || c === 'ore' || c === 'chest';
  };
  const wet = new Set(layout.water.map((c) => c.gz * layout.w + c.gx));
  for (let gz = 1; gz < layout.h - 1; gz++) for (let gx = 1; gx < layout.w - 1; gx++) {
    if (!walkable(layout, gx, gz) || busy(gx, gz)) continue;
    if (wet.has(gz * layout.w + gx)) continue;              // a torch does not stand in a pool
    const wall = ADJ.find(([dx, dz]) => !walkable(layout, gx + dx, gz + dz) && !isGorge(layout, gx + dx, gz + dz));
    const r = roomAt(layout, gx, gz);
    const arena = !!r && r.i === layout.arena;
    const brazier = !wall && !!r && (r.kind === 'hall' || r.kind === 'boss');
    if (!wall && !brazier) continue;
    if (rng() < (arena ? 0.4 : brazier ? 0.86 : 0.5)) continue;
    if (!far(gx, gz)) continue;
    used.push([gx, gz]);
    const p = worldOf(layout, gx, gz);
    const y = floorAt(layout, gx, gz);
    if (brazier) {
      for (let k = 0; k < 3; k++) {
        const a = (k / 3) * 6.2832 + 0.4;
        box(ironB, p.x + Math.cos(a) * 0.20, y + 0.42, p.z + Math.sin(a) * 0.20, 0.09, 0.86, 0.09, -a);
      }
      prism(ironB, p.x, p.z, 0.46, y + 0.82, y + 1.06, 10, 1.28);
      const t = new THREE.Vector3(p.x, y + 1.16, p.z);
      t.userData = { arena };
      torches.push(t);
    } else {
      const t = new THREE.Vector3(p.x + wall[0] * 0.72, y + 1.95, p.z + wall[1] * 0.72);
      t.userData = { arena };
      box(ironB, (t.x + p.x + wall[0] * 0.95) / 2, y + 1.62, (t.z + p.z + wall[1] * 0.95) / 2, 0.11, 0.11, 0.11);
      prism(ironB, t.x, t.z, 0.10, y + 1.55, t.y, 6, 1.6);
      torches.push(t);
    }
  }
  for (const t of torches) {
    prism(flameB, t.x, t.z, 0.20, t.y + 0.02, t.y + 0.30, 6, 0.25);
    prism(flameB, t.x, t.z, 0.12, t.y + 0.30, t.y + 0.52, 6, 0.1);
  }

  // ---- the boxes ---------------------------------------------------------
  // Each is its own small group, because a chest is clicked, and its lid turns
  // when it opens: a merged mesh could do neither.
  const chestMeshes = [];
  for (const c of layout.chests) {
    const g = new THREE.Group();
    g.name = `chest:${c.key}`;
    g.position.set(c.x, c.y, c.z);
    g.rotation.y = rng() * Math.PI * 2;
    const cache = c.kind === 'cache';
    const bodyB = bucket(), bandB = bucket();
    const w = cache ? 0.74 : 1.02, d = cache ? 0.54 : 0.66, hgt = cache ? 0.40 : 0.52;
    box(bodyB, 0, hgt / 2, 0, w, hgt, d, 0);
    for (const dx of [-w * 0.31, w * 0.31]) box(bandB, dx, hgt * 0.58, 0, 0.10, hgt * 1.2, d * 1.06, 0);
    if (!cache) box(bandB, 0, hgt * 0.58, d / 2 + 0.02, 0.22, 0.20, 0.06, 0);   // the lock plate
    const body = meshOf(THREE, bodyB, mats.wood);
    const bands = meshOf(THREE, bandB, mats.iron);
    for (const m of [body, bands]) if (m) g.add(m);

    // the lid, on a hinge at the back, as a fan of staves
    const lid = new THREE.Group();
    lid.position.set(0, hgt, -d / 2);
    const lidB = bucket();
    for (let i = 0; i < 7; i++) {
      const a = Math.PI * (i / 7) + Math.PI / 14;
      box(lidB, 0, Math.sin(a) * (d * 0.4), d / 2 + Math.cos(a) * (d * 0.47), w, 0.09, 0.16, 0);
    }
    const lidMesh = meshOf(THREE, lidB, mats.wood);
    if (lidMesh) lid.add(lidMesh);
    g.add(lid);

    // A generous, invisible target, so a click lands on the box and not on the
    // floor beside it. three raycasts an invisible mesh, which is the point.
    const hit = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), mats.dark);
    hit.position.set(0, 0.7, 0);
    hit.visible = false;
    g.add(hit);
    for (const o of [g, hit, body, bands, lidMesh]) if (o) o.userData.chest = c;
    g.userData.lid = lid;
    group.add(g); owned.push(g);
    chestMeshes.push(g);
  }

  // ---- the seams, in a cave ---------------------------------------------
  let oreField = null;
  if (layout.kind === 'cave' && layout.ore.length) {
    oreField = createTreeField({
      name: `cavern:${layout.id}:${layout.level}:ore`, kind: 'rock', hits: 5, yield: 'ore', parent: group,
      layers: [
        { geo: new THREE.DodecahedronGeometry(1, 0), mat: stone(0x6d7a84, P.wallTex, { side: THREE.FrontSide }),
          of: (t) => ({ x: t.x, y: t.gy + 0.5 * t.s, z: t.z, s: t.s, sy: 0.9, ry: t.ry }) },
        { geo: new THREE.DodecahedronGeometry(0.4, 0), mat: plain(0xc47a3a, { metalness: 0.45, roughness: 0.4, emissive: 0x2a1206 }),
          of: (t) => ({ x: t.x + 0.5 * t.s, y: t.gy + 0.9 * t.s, z: t.z + 0.3 * t.s, s: t.s * 0.6, ry: -t.ry }) },
      ],
    });
    for (const o of layout.ore) {
      const p = worldOf(layout, o.gx, o.gz);
      oreField.trees.push({ x: p.x, z: p.z, gy: floorAt(layout, o.gx, o.gz), s: 0.5 + rng() * 0.3, ry: rng() * Math.PI, alt: 0, oa: 0 });
    }
    oreField.oreId = layout.oreTier || null;
    oreField.hydrated = true;
    oreField.rebuild();
  }

  // ---- one mesh per material --------------------------------------------
  const parts = {};
  for (const [name, b, m] of [['floor', floorB, mats.floor], ['risers', riserB, mats.riser],
    ['ceiling', ceilB, mats.ceiling], ['wallA', wallB1, mats.wallA], ['wallB', wallB2, mats.wallB],
    ['pit', pitB, mats.pit], ['planks', plankB, mats.wood],
    ['iron', ironB, mats.iron], ['flames', flameB, mats.flame]]) {
    const mesh = meshOf(THREE, b, m);
    if (!mesh) continue;
    mesh.name = `cavern:${name}`;
    parts[name] = mesh;
    group.add(mesh); owned.push(mesh);
  }
  parts.walls = [parts.wallA, parts.wallB].filter(Boolean);

  // ---- light -------------------------------------------------------------
  const ambient = new THREE.AmbientLight(P.ambient, P.ambientI);
  group.add(ambient);
  const fill = new THREE.HemisphereLight(P.fill, P.fillGround, P.fillI);
  group.add(fill);
  const pool = [];
  for (let i = 0; i < TORCH_POOL; i++) {
    const l = new THREE.PointLight(TORCH_COLOUR, TORCH_I, TORCH_RANGE, 1.4);
    l.visible = false;
    group.add(l); pool.push(l);
  }
  const entLight = new THREE.PointLight(0xffd9a8, 8, 14, 1.3);
  entLight.position.set(entrancePos.x, entrancePos.y + 2.3, entrancePos.z);
  group.add(entLight);
  const stairLight = new THREE.PointLight(0x7fc8ff, 7, 13, 1.3);
  if (stairPos) { stairLight.position.set(stairPos.x, stairPos.y + 2.1, stairPos.z); group.add(stairLight); }

  const phase = pool.map((_, i) => i * 1.7 + rng() * 6.28);
  let clock = 0, lastX = Infinity, lastZ = Infinity, lastMs = null;
  const warm = pool.map(() => false);

  const built = {
    group, entrancePos, stairPos, torches, exits, oreField, pools, parts,
    chestMeshes, bridges: layout.bridges, layout, palette: P,
    stats: {
      floorCells, wallFaces, risers, pitCells, pools: pools.length,
      torches: torches.length, chests: layout.chests.length, ore: layout.ore.length,
      bridges: layout.bridges.length,
      get triangles() {
        let t = 0;
        group.traverse((o) => { if (o.isMesh && o.geometry?.attributes?.position) t += o.geometry.attributes.position.count / 3; });
        return t;
      },
      get draws() {
        let d = 0;
        group.traverse((o) => { if (o.isMesh && o.visible) d++; });
        return d;
      },
    },
    get lightCount() { return pool.length + 1 + (stairPos ? 1 : 0); },

    /** Swing a box's lid open, and leave it open. */
    openChest(rec) {
      const g = chestMeshes.find((m) => m.userData.chest === rec || m.userData.chest?.key === rec?.key);
      if (!g || !g.userData.lid) return false;
      g.userData.lid.rotation.x = -1.9;
      g.userData.opened = true;
      return true;
    },

    update(a, b) {
      let dt, pos;
      if (typeof a === 'number') { dt = a; pos = b; } else { pos = a; dt = null; }
      if (!pos) return false;
      if (dt == null) {
        const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
        dt = lastMs == null ? 0 : Math.min(0.1, (now - lastMs) / 1000);
        lastMs = now;
      }
      clock += dt;
      let moved = false;
      if (Math.hypot(pos.x - lastX, pos.z - lastZ) >= 1.0) {
        lastX = pos.x; lastZ = pos.z;
        const near = torches
          .map((t, i) => [i, (t.x - pos.x) ** 2 + (t.z - pos.z) ** 2])
          .sort((x, y) => x[1] - y[1])
          .slice(0, pool.length);
        for (let i = 0; i < pool.length; i++) {
          const n = near[i];
          if (!n) { pool[i].visible = false; warm[i] = false; continue; }
          const t = torches[n[0]];
          pool[i].position.copy(t);
          pool[i].visible = true;
          // the boss's hall burns oranger, and it costs no extra light
          warm[i] = !!t.userData?.arena;
          pool[i].color.setHex(warm[i] ? ARENA_COLOUR : TORCH_COLOUR);
        }
        moved = true;
      }
      for (let i = 0; i < pool.length; i++) {
        if (!pool[i].visible) continue;
        const t = clock * 7 + phase[i];
        const base = warm[i] ? ARENA_I : TORCH_I;
        pool[i].intensity = base * (0.86 + 0.09 * Math.sin(t) + 0.05 * Math.sin(t * 2.7 + 1.3));
      }
      entLight.intensity = 8 * (0.93 + 0.07 * Math.sin(clock * 5.1));
      return moved;
    },

    dispose() {
      if (oreField) removeTreeField(oreField);
      group.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        const m = o.material;
        if (Array.isArray(m)) m.forEach((x) => x.dispose?.()); else m?.dispose?.();
        if (o !== group) o.dispose?.();
      });
      for (const m of Object.values(mats)) m.dispose?.();
      group.parent?.remove(group);
      group.clear();
    },
  };
  built.update(0, { x: entrancePos.x, z: entrancePos.z });
  return built;
}
