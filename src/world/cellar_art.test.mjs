import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createOldCellars } from './old_cellars.js';
import { gridOf, walkable, worldOf } from './dungeon_gen.js';
import { createDungeonScene, setDungeonCanvasFactory, stubCanvasFactory } from './dungeon.js';
import { furnishBlenderCellar } from './cellar_blender_room.js';
import { dungeonPhysical } from './collision/dungeon.js';
import { rampHeight, createCollisionIndex } from './collision/shapes.js';
setDungeonCanvasFactory(stubCanvasFactory);
let steps = 0, triangles = 0, doors = 0;
for (let level = 1; level <= 8; level++) {
    const L = createOldCellars(42, { id: 'oldcellars' }, level), a = L.landmark;
    const bytes = await readFile(new URL('../../assets/models/cellars/rooms/' + a.spec.glb, import.meta.url));
    const asset = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
    const built = createDungeonScene(T, L), art = furnishBlenderCellar(built, L, { load: async () => asset });
    assert(art.group.getObjectByName('Cellar streaming support'));
    assert(await art.ready);
    assert(art.loaded);
    assert(!art.group.getObjectByName('Cellar streaming support'));
    const fixtures = createCollisionIndex(a.spec.colliders.map(c => ({ ...c, ...(c.kind === 'ramp' ? { thickness: .4 } : {}) })));
    for (const s of [...L.authoredSpawns, ...L.chests]) {
        if (s.room !== a.roomId && s.gx !== L.rooms[a.roomId].cx && !L.chests.includes(s))
            continue;
        const p = worldOf(L, s.gx, s.gz), dx = p.x - a.x, dz = p.z - a.z;
        if ((dx / a.spec.ground.rx) ** 2 + (dz / a.spec.ground.rz) ** 2 > 1)
            continue;
        assert(!fixtures.at(dx, .08, dz, 2, 8), 'Spawn or treasure overlaps a fixture at depth ' + level);
        assert(!a.spec.ground.holes.some(h => Math.abs(dx - h.x) < h.w / 2 + 2 && Math.abs(dz - h.z) < h.d / 2 + 2), 'Spawn or treasure begins in a pit');
    }
    const index = dungeonPhysical(L, built);
    for (const b of built.physicalBodies.filter(b => b.kind === 'ramp')) {
        let previous = null;
        for (let i = 0; i <= 100; i++) {
            const z = b.z + b.direction * (i / 100 - .5) * b.d, y = rampHeight(b, b.x, z), g = gridOf(L, b.x, z);
            assert(walkable(L, g.gx, g.gz), `Depth ${level} stair leaves carved room`);
            assert(Math.abs(index.supportAt(b.x, z, y + .03) - y) < .05, `Depth ${level} support mismatch: ${b.model} sample ${i}`);
            const next = { x: b.x, y: y + .05, z };
            if (previous)
                assert(index.canMove(previous, next, .3, 1.8), `Depth ${level} stair blocked: ${b.model} sample ${i}`);
            previous = next;
            steps++;
        }
    }
    for (const [dx, dz, radius] of [[1, 0, a.spec.ground.rx], [-1, 0, a.spec.ground.rx], [0, 1, a.spec.ground.rz], [0, -1, a.spec.ground.rz]]) {
        let prev = null;
        for (let i = 0; i <= 50; i++) {
            const r = radius - 10 + i * .4, x = a.x + dx * r, z = a.z + dz * r, g = gridOf(L, x, z), floor = L.heights[g.gz * L.w + g.gx];
            const y = Math.max(floor, index.supportAt(x, z, (prev?.y ?? floor) + .4));
            assert(walkable(L, g.gx, g.gz), `Depth ${level} portal floor closes at ${dx},${dz},${r}`);
            const p = { x, y: y + .05, z };
            if (prev)
                assert(index.canMove(prev, p, .3, 1.8), `Depth ${level} portal blocked ${dx},${dz},${r}`);
            prev = p;
            doors++;
        }
    }
    let disposeCount = 0;
    asset.scene.traverse(o => { if (o.isMesh) {
        triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3;
        o.geometry.addEventListener('dispose', () => disposeCount++);
    } });
    art.update(1);
    art.dispose();
    built.dispose();
    assert.equal(disposeCount, 0, 'Dungeon teardown preserves the shared asset buffers');
    asset.scene.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
}
{
    const L = createOldCellars(42, { id: 'oldcellars' }, 6), built = createDungeonScene(T, L), warn = console.warn;
    console.warn = () => { };
    const art = furnishBlenderCellar(built, L, { load: async () => { throw Error('Offline control'); } });
    assert.equal(await art.ready, false);
    console.warn = warn;
    const support = art.group.getObjectByName('Cellar streaming support');
    assert(support?.children.length > 4, 'Pit, bridges and stairs stay visible after a failed download');
    const bounds = new T.Box3().setFromObject(support);
    assert(bounds.min.y < L.landmark.y - 15, 'Fallback exposes the undercroft floor');
    art.dispose();
    built.dispose();
}
console.log(`Cellar art passed: ${triangles} Blender triangles, ${steps} gallery/escape collision steps, ${doors} portal traversal samples across eight depths.`);
