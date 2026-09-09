import { CELL, walkable, gridOf } from '../../world/dungeon_gen.js';

export const REVEAL_METRES = 18;
const MAX_CELLS = 262144, MAX_MAPS = 128, MAX_SAVED_CHARS = 1000000;
const fingerprints = new WeakMap();

export function validLayout(layout) {
  return !!layout && Number.isInteger(layout.w) && Number.isInteger(layout.h)
    && layout.w > 0 && layout.h > 0 && layout.w * layout.h <= MAX_CELLS
    && layout.cells?.length === layout.w * layout.h;
}

/** Include topology so an authored rebuild never inherits an obsolete chart. */
export function dungeonMapKey(layout) {
  let hash = fingerprints.get(layout.cells);
  if (!hash) {
    let n = 2166136261;
    for (const cell of layout.cells) n = Math.imul(n ^ cell, 16777619) >>> 0;
    hash = n.toString(36);
    fingerprints.set(layout.cells, hash);
  }
  return 'd1:' + JSON.stringify([layout.id, layout.siteId, layout.seed, layout.cx,
    layout.cz, layout.level, layout.w, layout.h, hash]);
}

/** Packed exploration is ordinary character data and follows the normal save. */
export function hydrateDungeonMaps(raw) {
  const result = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return result;
  let budget = MAX_SAVED_CHARS;
  for (const [key, value] of Object.entries(raw).slice(-MAX_MAPS).reverse()) {
    if (!key.startsWith('d1:') || key.length > 512 || !value
      || !Number.isInteger(value.w) || !Number.isInteger(value.h)
      || value.w < 1 || value.h < 1 || value.w * value.h > MAX_CELLS) continue;
    const length = Math.ceil(value.w * value.h / 4);
    if (typeof value.seen !== 'string' || value.seen.length !== length
      || length > budget || !/^[0-9a-f]+$/.test(value.seen)) continue;
    result[key] = { w: value.w, h: value.h, seen: value.seen };
    budget -= length;
  }
  return Object.fromEntries(Object.entries(result).reverse());
}

function pack(bits) {
  const out = [];
  for (let i = 0; i < bits.length; i += 4)
    out.push((bits[i] | (bits[i + 1] || 0) << 1 | (bits[i + 2] || 0) << 2
      | (bits[i + 3] || 0) << 3).toString(16));
  return out.join('');
}

/** Supercover sight lines stop at rock and cannot peek between touching walls. */
function canSee(layout, x0, z0, x1, z1) {
  const dx = x1 - x0, dz = z1 - z0, nx = Math.abs(dx), nz = Math.abs(dz);
  const sx = Math.sign(dx), sz = Math.sign(dz);
  let x = x0, z = z0, ix = 0, iz = 0;
  while (ix < nx || iz < nz) {
    const step = (1 + 2 * ix) * nz - (1 + 2 * iz) * nx;
    if (step === 0) {
      if (!walkable(layout, x + sx, z) || !walkable(layout, x, z + sz)) return false;
      x += sx; z += sz; ix++; iz++;
    } else if (step < 0) { x += sx; ix++; }
    else { z += sz; iz++; }
    if (x === x1 && z === z1) return true; // The first wall is visible.
    if (!walkable(layout, x, z)) return false;
  }
  return true;
}

export function createExploration(layout, character = {}) {
  if (!validLayout(layout)) throw new Error('Dungeon map requires a floor grid');
  const key = dungeonMapKey(layout), count = layout.cells.length;
  const seen = new Uint8Array(count), visible = new Uint8Array(count);
  character.dungeonMaps = hydrateDungeonMaps(character.dungeonMaps);
  const saved = character.dungeonMaps[key];
  if (saved && saved.w === layout.w && saved.h === layout.h)
    for (let i = 0; i < count; i++) seen[i] = (parseInt(saved.seen[i >> 2], 16) >> (i % 4)) & 1;
  let cell = -1, revision = 0;

  return {
    key, layout, seen, visible,
    get revision() { return revision; },
    /** Only the destination is revealed after a warp, never the path through rock. */
    reveal(x, z) {
      if (!Number.isFinite(x) || !Number.isFinite(z)) return 0;
      const { gx, gz } = gridOf(layout, x, z), at = gz * layout.w + gx;
      if (!walkable(layout, gx, gz)) {
        if (cell !== -1) { visible.fill(0); cell = -1; revision++; }
        return 0;
      }
      if (at === cell) return 0;
      cell = at; visible.fill(0); revision++;
      const radius = Math.ceil(REVEAL_METRES / CELL);
      let added = 0;
      for (let z1 = Math.max(0, gz - radius); z1 <= Math.min(layout.h - 1, gz + radius); z1++)
        for (let x1 = Math.max(0, gx - radius); x1 <= Math.min(layout.w - 1, gx + radius); x1++) {
          if ((x1 - gx) ** 2 + (z1 - gz) ** 2 > radius ** 2
            || !canSee(layout, gx, gz, x1, z1)) continue;
          const i = z1 * layout.w + x1;
          visible[i] = 1;
          if (!seen[i]) { seen[i] = 1; added++; }
        }
      if (added) {
        // Touch the record last, retaining the most recently visited charts at the cap.
        delete character.dungeonMaps[key];
        character.dungeonMaps[key] = { w: layout.w, h: layout.h, seen: pack(seen) };
        character.dungeonMaps = hydrateDungeonMaps(character.dungeonMaps);
      }
      return added;
    },
  };
}

/** Edges of mapped floor that continue into floor the character has not seen. */
export function unexploredEdges(exploration, gx, gz) {
  const { layout, seen } = exploration;
  if (!walkable(layout, gx, gz) || !seen[gz * layout.w + gx]) return [];
  return [[0, -1], [1, 0], [0, 1], [-1, 0]].filter(([dx, dz]) =>
    walkable(layout, gx + dx, gz + dz) && !seen[(gz + dz) * layout.w + gx + dx]);
}
