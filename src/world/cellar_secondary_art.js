import { worldOf } from './dungeon_gen.js';
import { cellarHeight } from './old_cellars.js';
import { cellarGroundHeight } from './cellar_landmark_layout.js';
import { createCellarArtKit } from './cellar_art_kit.js';
/** Burial alcoves and fixtures in the surrounding rooms, outside the Blender landmark. */
export function furnishCellarSecondaryRooms(root, L, bodies) {
    const k = createCellarArtKit(root, bodies);
    const height = (x, z) => cellarGroundHeight(L, x, z, z => cellarHeight(L.level, z));
    for (const r of L.rooms) {
        if (r.id === L.landmark.roomId)
            continue;
        const p = worldOf(L, r.cx, r.cz), y = height(p.x, p.z), a = Math.min(r.w * .58, 28), span = Math.min(r.h * .55, 27);
        for (const side of [-1, 1])
            for (let i = 0; i < 3; i++) {
                const x = p.x + side * a, z = p.z - span + i * span, fy = height(x, z), yaw = side > 0 ? -Math.PI / 2 : Math.PI / 2;
                k.niche(x, fy, z, .9, yaw);
                k.coffin(x - side * 3, fy, z + 2, .65, side * Math.PI / 2);
                for (let n = 0; n < 8; n++)
                    k.add('rock', 'stone', x + Math.sin(n * 4) * 3, fy + .2 + n % 2 * .3, z + Math.cos(n * 3) * 2, .4 + n % 3 * .4, .4, .5);
                if (i === 1)
                    k.banner(x, fy + 10, z, 2.5, 5, yaw);
            }
        k.chandelier(p.x, y + Math.min(L.theme.ceiling * .6, 22), p.z, Math.min(4, r.w * .09), L.theme.ceiling * .25);
        if (r.id !== 0)
            for (const side of [-1, 1])
                k.brazier(p.x + side * 10, height(p.x + side * 10, p.z + 8), p.z + 8);
    }
    const result = k.finish();
    return { ...result, stats: result.counts };
}
