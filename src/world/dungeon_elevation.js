// Apply one continuous elevation function to shared geology vertices and the
// authored objects it carries. The grid remains the collision/navigation map.
export function raiseDungeon(built, height) {
    for (const mesh of [built.parts.floor, built.parts.ceiling, ...built.parts.walls]) {
        const a = mesh?.geometry.attributes.position;
        if (!a)
            continue;
        for (let i = 0; i < a.count; i++)
            a.setY(i, a.getY(i) + height(a.getZ(i), a.getX(i)));
        a.needsUpdate = true;
        mesh.geometry.computeVertexNormals();
        mesh.geometry.computeBoundingSphere();
    }
    for (const t of built.torches)
        t.y += height(t.z, t.x);
    for (const box of built.chestMeshes)
        box.position.y += height(box.position.z, box.position.x);
    for (const object of built.group.children)
        if (object.userData.exit || object.isPointLight)
            object.position.y += height(object.position.z, object.position.x);
    built.entrancePos.y = height(built.entrancePos.z, built.entrancePos.x);
    if (built.stairPos)
        built.stairPos.y = height(built.stairPos.z, built.stairPos.x);
}
