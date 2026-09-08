import manifest from '../../assets/models/cellars/rooms/manifest.json' with { type: 'json' };
import { createCollisionIndex } from './collision/shapes.js';
import { worldOf, FLOOR, ROCK, gridOf } from './dungeon_gen.js';
export function cellarLandmarkSpec(level) { return manifest.rooms.find(room => room.level === level); }
/** The exported room's ground and four portals join the surrounding carved cave. */
export function configureCellarLandmark(L, baseHeight) {
    const spec = cellarLandmarkSpec(L.level), room = L.rooms[spec.roomIndex];
    const centre = worldOf(L, room.cx, room.cz), y = baseHeight(centre.z);
    L.landmark = { spec, roomId: room.id, ...centre, y };
    const { rx, rz } = spec.ground;
    // Main-room corridors always arrive through a real opening in the Blender shell.
    const carve = (x, z) => { if (x > 0 && x < L.w - 1 && z > 0 && z < L.h - 1)
        L.cells[z * L.w + x] = FLOOR; };
    const passage = (a, b) => {
        const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z));
        for (let i = 0; i <= n; i++) {
            const g = gridOf(L, a.x + (b.x - a.x) * i / n, a.z + (b.z - a.z) * i / n);
            for (let dx = -3; dx <= 3; dx++)
                for (let dz = -3; dz <= 3; dz++)
                    if (dx * dx + dz * dz <= 9)
                        carve(g.gx + dx, g.gz + dz);
        }
    };
    for (let gz = 0; gz < L.h; gz++)
        for (let gx = 0; gx < L.w; gx++) {
            const p = worldOf(L, gx, gz), dx = p.x - centre.x, dz = p.z - centre.z;
            if ((dx / (rx + 3)) ** 2 + (dz / (rz + 3)) ** 2 <= 1)
                carve(gx, gz);
        }
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
        passage(centre, { x: centre.x + dx * (rx + 12), z: centre.z + dz * (rz + 12) });
    for (const link of L.passages) {
        const other = link.from === room.id ? link.to : link.to === room.id ? link.from : null;
        if (other === null)
            continue;
        const target = worldOf(L, L.rooms[other].cx, L.rooms[other].cz), dx = target.x - centre.x, dz = target.z - centre.z;
        const axis = Math.abs(dx / rx) > Math.abs(dz / rz) ? 'x' : 'z';
        const door = { ...centre, [axis]: centre[axis] + Math.sign(axis === 'x' ? dx : dz) * ((axis === 'x' ? rx : rz) + 8) };
        passage(centre, door);
        passage(door, target);
    }
    for (let gz = 0; gz < L.h; gz++)
        for (let gx = 0; gx < L.w; gx++)
            if (L.cells[gz * L.w + gx] !== ROCK) {
                const p = worldOf(L, gx, gz);
                L.heights[gz * L.w + gx] = cellarGroundHeight(L, p.x, p.z, baseHeight);
            }
}
export function inCellarLandmark(L, x, z, margin = 0) {
    const a = L.landmark;
    if (!a)
        return false;
    return ((x - a.x) / (a.spec.ground.rx + margin)) ** 2 + ((z - a.z) / (a.spec.ground.rz + margin)) ** 2 <= 1;
}
export function cellarGroundHeight(L, x, z, baseHeight) {
    const a = L.landmark, original = baseHeight(z);
    if (!a)
        return original;
    const dx = x - a.x, dz = z - a.z, { rx, rz, holes } = a.spec.ground;
    const radial = Math.sqrt((dx / rx) ** 2 + (dz / rz) ** 2), blend = Math.max(12, a.spec.ground.blendMargin);
    if (radial > 1 + blend / Math.min(rx, rz))
        return original;
    if (radial <= 1) {
        // Crossing decks support actors separately, allowing a real undercroft beneath them.
        const hole = holes.find(h => Math.abs(dx - h.x) < h.w / 2 && Math.abs(dz - h.z) < h.d / 2);
        return a.y + (hole ? -hole.depth : a.spec.ground.height);
    }
    const t = Math.min(1, (radial - 1) * Math.min(rx, rz) / blend), smooth = t * t * (3 - 2 * t);
    return a.y * (1 - smooth) + original * smooth;
}
/** Keep ground spawns and loot clear of the authored fixtures and open pits. */
const placementIndexes = new WeakMap();
export function clearCellarPlacement(L, gx, gz) {
    const a = L.landmark, p = worldOf(L, gx, gz);
    if (!inCellarLandmark(L, p.x, p.z))
        return { gx, gz };
    let index = placementIndexes.get(a.spec);
    if (!index) {
        index = createCollisionIndex(a.spec.colliders.map(c => ({ ...c, ...(c.kind === 'ramp' ? { thickness: .4 } : {}) })));
        placementIndexes.set(a.spec, index);
    }
    const clear = (x, z) => {
        if (!inCellarLandmark(L, x, z, -4))
            return false;
        const dx = x - a.x, dz = z - a.z;
        if (L.authoredSpawns.some(s => { const p = worldOf(L, s.gx, s.gz); return Math.hypot(x - p.x, z - p.z) < 4; }))
            return false;
        if (a.spec.ground.holes.some(h => Math.abs(dx - h.x) < h.w / 2 + 3 && Math.abs(dz - h.z) < h.d / 2 + 3))
            return false;
        return !index.at(dx, .08, dz, 2, 8);
    };
    if (clear(p.x, p.z))
        return { gx, gz };
    for (let r = 2; r <= 40; r += 2)
        for (let i = 0; i < 32; i++) {
            const angle = i / 32 * Math.PI * 2, q = gridOf(L, p.x + Math.cos(angle) * r, p.z + Math.sin(angle) * r), w = worldOf(L, q.gx, q.gz);
            if (L.cells[q.gz * L.w + q.gx] === FLOOR && clear(w.x, w.z))
                return { gx: q.gx, gz: q.gz };
        }
    throw Error('No clear placement in cellar depth ' + L.level);
}
