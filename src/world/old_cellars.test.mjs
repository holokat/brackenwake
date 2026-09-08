import assert from 'node:assert/strict';
import * as T from 'three';
globalThis.window = { addEventListener() { }, removeEventListener() { } };
globalThis.localStorage = { getItem() { return null; }, setItem() { } };
globalThis.requestAnimationFrame = () => 0;
const { createOldCellars, cellarHeight } = await import('./old_cellars.js');
const { worldOf, walkable, floorAt } = await import('./dungeon_gen.js');
const { createDungeonScene, setDungeonCanvasFactory, stubCanvasFactory, ceilingAt } = await import('./dungeon.js');
const { furnishOldCellars } = await import('./old_cellars_scene.js');
const { normalizeDungeonLayout, dungeonSpawns } = await import('../game/monster_ai.js');
const { buildMonsterModel } = await import('../game/monster_models.js');
const { CELLAR_CREATURES } = await import('../mmo/cellar_monsters.js');
const { specOfSite } = await import('../game/world_runtime.js');
setDungeonCanvasFactory(stubCanvasFactory);
let total = 0, priorCeiling = 0;
for (let level = 1; level <= 8; level++) {
    const L = createOldCellars(22, { id: 'old', sub: 'oldcellars', name: 'The Old Cellars' }, level), seen = new Set(), queue = [L.entrance.gz * L.w + L.entrance.gx];
    while (queue.length) {
        const i = queue.pop();
        if (seen.has(i) || L.cells[i] !== 1)
            continue;
        seen.add(i);
        const x = i % L.w, z = Math.floor(i / L.w);
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]])
            if (walkable(L, x + dx, z + dz))
                queue.push((z + dz) * L.w + x + dx);
    }
    assert.equal(seen.size, L.cells.filter(x => x === 1).length, 'all walkable regions connect');
    for (const a of [...L.rooms.map(r => ({ gx: r.cx, gz: r.cz })), ...L.chests, ...L.authoredSpawns, ...(L.stair ? [L.stair] : [])])
        assert(seen.has(a.gz * L.w + a.gx));
    assert.equal(L.level, level);
    assert.equal(L.top, 8);
    assert.equal(!!L.stair, level < 8);
    assert(L.theme.ceiling > priorCeiling);
    priorCeiling = L.theme.ceiling;
    const norm = normalizeDungeonLayout(L), spawns = dungeonSpawns(norm);
    assert.equal(spawns.length, L.authoredSpawns.length);
    assert(spawns.every(s => s.underground));
    assert(spawns.some(s => s.power >= 1));
    if (level < 8) {
        const heights = [...seen].map(i => L.heights[i]);
        assert(Math.max(...heights) - Math.min(...heights) > 6);
    }
    const built = furnishOldCellars(createDungeonScene(T, L), L);
    built.group.updateMatrixWorld(true);
    const r = L.rooms[level === 8 ? 2 : 4], p = worldOf(L, r.cx, r.cz), y = cellarHeight(level, p.z);
    const ray = new T.Raycaster(new T.Vector3(p.x, y + 2, p.z), new T.Vector3(0, 1, 0));
    const hits = ray.intersectObject(built.parts.ceiling, false);
    assert(hits.length);
    assert(hits[0].distance > 15);
    for (const e of built.exits) {
        const floor = cellarHeight(level, e.position.z);
        assert(Math.abs(e.position.y - 1.4 - floor) < 1e-6);
    }
    if (level === 8) {
        assert(built.raid);
        assert(built.raid.model.height >= 35);
        assert(hits[0].distance > 70);
    }
    built.update(.016, p);
    total += seen.size;
    built.dispose();
}
for (const c of CELLAR_CREATURES) {
    const m = buildMonsterModel(c.id);
    assert(m);
    assert(m.height > 0);
    m.update(.016, 1);
    m.dispose();
}
assert.equal(specOfSite({ sub: 'oldcellars' }).levels, 8);
console.log(JSON.stringify({ depths: 8, totalFloorSquareMetres: total * 4, newCreatures: CELLAR_CREATURES.length, finalCeiling: priorCeiling, connected: true }));
// Exercise the same entrance/stair route used by the running game.
function fakeCanvas() {
    const noop = () => { };
    const ctx = {
        fillStyle: '', strokeStyle: '', globalAlpha: 1, lineWidth: 1,
        createLinearGradient: () => ({ addColorStop: noop }),
        createRadialGradient: () => ({ addColorStop: noop }),
        fillRect: noop, clearRect: noop, strokeRect: noop, beginPath: noop, closePath: noop,
        moveTo: noop, lineTo: noop, arc: noop, ellipse: noop, rect: noop,
        quadraticCurveTo: noop, bezierCurveTo: noop, fill: noop, stroke: noop,
        save: noop, restore: noop, translate: noop, rotate: noop, scale: noop,
        drawImage: noop, putImageData: noop, getImageData: () => ({ data: new Uint8ClampedArray(4) }),
        fillText: noop, measureText: () => ({ width: 0 }),
    };
    return { width: 0, height: 0, style: {}, getContext: () => ctx, addEventListener: noop, remove: noop };
}
globalThis.document ||= {
    createElement: (tag) => (tag === 'canvas' ? fakeCanvas() : { style: {}, appendChild() { }, addEventListener() { }, remove() { } }),
    addEventListener() { }, head: { appendChild() { } }, body: { appendChild() { } },
    getElementById: () => null,
};
const { createWorldRuntime } = await import('../game/world_runtime.js');
const scene = new T.Scene();
scene.background = new T.Color(0);
scene.fog = new T.Fog(0, 1, 200);
const sc = { scene, setFog(near, far, color) { scene.fog.near = near; scene.fog.far = far; if (color !== undefined)
        scene.fog.color.set(color); } };
const runtime = createWorldRuntime(sc, { terrainFile: false, homeBiome: 'meadow' });
runtime.enterDungeon({ id: 'cellar-runtime-test', sub: 'oldcellars', kind: 'dungeon', cx: 0, cz: 0, x: 0, z: 0, name: 'The Old Cellars' });
for (let depth = 1; depth <= 8; depth++) {
    assert.equal(runtime.dungeonLevel, depth);
    assert.equal(runtime.dungeonTop, 8);
    assert.equal(runtime.dungeonLayout().siteId, 'oldcellars');
    assert(Number.isFinite(runtime.heightAt(1, 150)));
    if (depth < 8)
        assert(runtime.dungeonGo('down'));
}
assert(runtime.dungeonScene.raid);
assert.equal(runtime.dungeonGo('down'), null);
for (let depth = 8; depth >= 1; depth--) {
    assert.equal(runtime.dungeonLevel, depth);
    runtime.dungeonGo('up');
}
assert.equal(runtime.inDungeon, false);
runtime.dispose();
console.log('Runtime passed: mill entrance, all seven descending stairs, final raid scene, all eight returning stairs.');
