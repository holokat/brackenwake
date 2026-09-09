import {descentRoom} from './cellar_descent_layout.js';
import * as T from 'three';
import { worldOf, walkable } from './dungeon_gen.js';
import { cellarHeight } from './old_cellars.js';
import { createCellarArtKit } from './cellar_art_kit.js';
import {cellarRoutes} from './cellar_routes.js';
import {hasCellarEntry} from './cellar_entry_layout.js';
// Rock shell and supporting masonry. Landmark furniture is owned by room art.
export function furnishCellarVaults(root, L, bodies) {
    const k = createCellarArtKit(root, bodies);
    const routes = cellarRoutes(L);
    for (const r of L.rooms) {
        if (descentRoom(L,r.id) || r.id === L.landmark?.roomId || (hasCellarEntry(L) && r.id < 2))
            continue;
        const p = worldOf(L, r.cx, r.cz), height = L.theme.ceiling;
        for (let i = 0; i < 40; i++) {
            const a = i * Math.PI / 20, gx = Math.round(r.cx + Math.cos(a) * r.w * .47), gz = Math.round(r.cz + Math.sin(a) * r.h * .47);
            if (!walkable(L, gx, gz))
                continue;
            const q = worldOf(L, gx, gz), y = cellarHeight(L.level, q.z);
            if (routes.overlaps(q.x + Math.cos(a) * 4, q.z + Math.sin(a) * 4, 7)) continue;
            // Craggy volumes sit behind the floor perimeter, preserving navigable routes.
            for (let j = 0; j < 3; j++)
                k.add('rock', 'stone', q.x + Math.cos(a) * 4, y + height * (.16 + j * .32), q.z + Math.sin(a) * 4, 3 + i % 3, height * .29, 3 + (i * 7 % 4), 0, a, .06 * Math.sin(i));
        }
    }
    if (L.level === 8 && !L.landmark) {
        const r = L.rooms[2], p = worldOf(L, r.cx, r.cz);
        for (const side of [-1, 1])
            for (const dz of [-36, 0, 36]) {
                const x = p.x + side * 53, z = p.z + dz;
                for (let y = 0; y < 38; y += 3)
                    k.box('stone', x, y + 1.48, z, 5, 2.96, 5);
                for (const y of [.5, 12, 25, 38])
                    k.box('edge', x, y, z, 6.3, y === .5 ? 1 : .6, 6.3);
                for (const xoff of [-1.8, 1.8])
                    k.box('edge', x + xoff, 19, z + 2.6, .32, 36, .35);
                bodies.push({ kind: 'box', model: 'cathedral vault pier', x, y: 0, z, w: 5, d: 5, h: 39, c: 1, s: 0 });
            }
        for (let x = -44; x <= 44; x += 4)
            for (let z = -48; z <= 48; z += 4) {
                if (x * x + z * z > 2300)
                    continue;
                const turn = ((x * 7 + z * 3) % 11) * .002;
                k.box((x + z) % 12 === 0 ? 'edge' : 'stone', p.x + x, -.055, p.z + z, 3.93, .12, 3.93, turn);
            }
        const light = new T.DirectionalLight(0x7faaff, 1.15);
        light.position.set(p.x - 20, 75, p.z - 30);
        light.target.position.set(p.x, 8, p.z);
        root.add(light, light.target);
    }
    return k.finish();
}
