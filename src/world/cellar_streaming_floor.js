import * as T from 'three';
/** Visible support matches the collision manifest even before a room download finishes. */
export function createCellarStreamingFloor(spec) {
    const group = new T.Group();
    group.name = 'Cellar streaming support';
    const material = new T.MeshStandardMaterial({ color: 0x444850, roughness: 1 }), geometries = [];
    function box(x, y, z, w, h, d) { const geo = new T.BoxGeometry(w, h, d); geometries.push(geo); const mesh = new T.Mesh(geo, material); mesh.position.set(x, y + h / 2, z); group.add(mesh); return mesh; }
    for (const hole of spec.ground.holes) {
        box(hole.x, -hole.depth - .4, hole.z, hole.w, .4, hole.d);
        for (const side of [-1, 1]) {
            box(hole.x + side * (hole.w / 2 + .2), -hole.depth, hole.z, .4, hole.depth, hole.d);
            box(hole.x, -hole.depth, hole.z + side * (hole.d / 2 + .2), hole.w, hole.depth, .4);
        }
    }
    for (const c of spec.colliders) {
        if (c.kind === 'ramp') {
            const mesh = box(c.x, c.y + c.h / 2 - .2, c.z, c.w, .4, Math.hypot(c.d, c.h));
            mesh.rotation.set(-Math.atan2(c.h * (c.direction < 0 ? -1 : 1), c.d), Math.atan2(c.s, c.c), 0);
        }
        else if (spec.ground.holes.some(h => Math.abs(c.x - h.x) < h.w / 2 + c.w / 2 && Math.abs(c.z - h.z) < h.d / 2 + c.d / 2)) {
            const mesh = box(c.x, c.y, c.z, c.w, c.h, c.d);
            mesh.rotation.y = Math.atan2(c.s, c.c);
        }
    }
    let disposed = false;
    return { group, dispose() { if (disposed)
            return; disposed = true; group.removeFromParent(); for (const g of geometries)
            g.dispose(); material.dispose(); } };
}
