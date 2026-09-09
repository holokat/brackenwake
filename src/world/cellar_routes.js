import {worldOf, walkable, gridOf, CELL} from './dungeon_gen.js';

const cache = new WeakMap();
/** Reserve actual carved routes for artwork, including the alternate loops. */
export function cellarRoutes(L) {
    if (cache.has(L)) return cache.get(L);
    const paths = [], trees = new Map();
    const route = (from, to) => {
        const start = from.gz * L.w + from.gx, end = to.gz * L.w + to.gx;
        if (!trees.has(start)) {
            const previous = new Int32Array(L.cells.length).fill(-1), queue = [start];
            previous[start] = start;
            for (let k = 0; k < queue.length; k++) {
                const i = queue[k], x = i % L.w, z = Math.floor(i / L.w);
                for (const [dx, dz] of [[0, -1], [1, 0], [-1, 0], [0, 1]]) {
                    const n = (z + dz) * L.w + x + dx;
                    if (walkable(L, x + dx, z + dz) && previous[n] === -1) {
                        previous[n] = i; queue.push(n);
                    }
                }
            }
            trees.set(start, previous);
        }
        const previous = trees.get(start);
        if (previous[end] === -1) throw Error('Disconnected cellar passage');
        const points = [];
        for (let i = end; ; i = previous[i]) {
            points.push(worldOf(L, i % L.w, Math.floor(i / L.w)));
            if (i === start) break;
        }
        paths.push(points.reverse());
    };
    for (const r of L.rooms.slice(1)) route(L.entrance, {gx:r.cx, gz:r.cz});
    if (L.stair) route(L.entrance, L.stair);
    for (const {from, to} of L.passages) route(
        {gx:L.rooms[from].cx, gz:L.rooms[from].cz},
        {gx:L.rooms[to].cx, gz:L.rooms[to].cz});
    const mask = new Uint8Array(L.cells.length);
    for (const path of paths) for (const p of path) {
        const g = gridOf(L, p.x, p.z); mask[g.gz * L.w + g.gx] = 1;
    }
    const result = {paths, overlaps(x, z, radius = 0) {
        const g = gridOf(L, x, z), n = Math.ceil((radius + 4) / CELL);
        for (let dz = -n; dz <= n; dz++) for (let dx = -n; dx <= n; dx++) {
            const gx = g.gx + dx, gz = g.gz + dz;
            if (gx < 0 || gz < 0 || gx >= L.w || gz >= L.h || !mask[gz * L.w + gx]) continue;
            const p = worldOf(L, gx, gz);
            if (Math.hypot(p.x-x, p.z-z) < radius + 4) return true;
        }
        return false;
    }};
    cache.set(L, result); return result;
}
