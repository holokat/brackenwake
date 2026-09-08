import * as T from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { enableSpellBloom } from '../game/vfx/bloom.js';
import { createCellarStreamingFloor } from './cellar_streaming_floor.js';
import { inCellarLandmark } from './cellar_landmark_layout.js';
const urls = [
    new URL('../../assets/models/cellars/rooms/cellar-room-01.glb', import.meta.url).href,
    new URL('../../assets/models/cellars/rooms/cellar-room-02.glb', import.meta.url).href,
    new URL('../../assets/models/cellars/rooms/cellar-room-03.glb', import.meta.url).href,
    new URL('../../assets/models/cellars/rooms/cellar-room-04.glb', import.meta.url).href,
    new URL('../../assets/models/cellars/rooms/cellar-room-05.glb', import.meta.url).href,
    new URL('../../assets/models/cellars/rooms/cellar-room-06.glb', import.meta.url).href,
    new URL('../../assets/models/cellars/rooms/cellar-room-07.glb', import.meta.url).href,
    new URL('../../assets/models/cellars/rooms/cellar-room-08.glb', import.meta.url).href,
];
const cache = new Map();
function releaseUnused() {
    const unused = [...cache].filter(([, e]) => e.refs === 0 && e.asset);
    while (unused.length > 1) {
        const [id, e] = unused.shift();
        cache.delete(id);
        e.asset.scene.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); });
    }
}
function acquire(level) {
    let entry = cache.get(level);
    if (!entry) {
        entry = { refs: 0, asset: null };
        cache.set(level, entry);
        entry.promise = new GLTFLoader().loadAsync(urls[level - 1]).then(a => { entry.asset = a; releaseUnused(); return a; }).catch(e => { cache.delete(level); throw e; });
    }
    entry.refs++;
    return { promise: entry.promise, release() { entry.refs--; releaseUnused(); } };
}
/** Fit the retained cave geology around the authored room and its undercroft. */
function fitGeology(built, L) {
    const a = L.landmark, { holes } = a.spec.ground;
    for (const mesh of [built.parts.floor, built.parts.ceiling, ...built.parts.walls]) {
        const pos = mesh?.geometry.attributes.position;
        if (!pos)
            continue;
        for (let i = 0; i < pos.count; i++)
            if (inCellarLandmark(L, pos.getX(i), pos.getZ(i))) {
                const x = pos.getX(i) - a.x, z = pos.getZ(i) - a.z;
                if (mesh === built.parts.floor)
                    pos.setY(i, a.y - .35);
                else if (mesh === built.parts.ceiling && holes.some(h => Math.abs(x - h.x) < h.w / 2 && Math.abs(z - h.z) < h.d / 2))
                    pos.setY(i, L.theme.ceiling + a.y);
            }
        pos.needsUpdate = true;
        mesh.geometry.computeVertexNormals();
        mesh.geometry.computeBoundingSphere();
    }
}
function openPit(built, L) {
    const holes = L.landmark.spec.ground.holes;
    if (!holes.length)
        return;
    const geo = built.parts.floor.geometry, keep = [], p = geo.attributes.position;
    // Non-indexed geology is built as two triangles per grid cell. Remove whole cells.
    for (let i = 0; i < p.count; i += 6) {
        let x = 0, z = 0;
        for (let j = 0; j < 6; j++) {
            x += p.getX(i + j) / 6;
            z += p.getZ(i + j) / 6;
        }
        x -= L.landmark.x;
        z -= L.landmark.z;
        if (holes.some(h => Math.abs(x - h.x) < h.w / 2 + 1 && Math.abs(z - h.z) < h.d / 2 + 1))
            continue;
        for (let j = 0; j < 6; j++)
            keep.push(i + j);
    }
    for (const [name, attr] of Object.entries(geo.attributes)) {
        const array = new attr.array.constructor(keep.length * attr.itemSize);
        keep.forEach((idx, n) => { for (let j = 0; j < attr.itemSize; j++)
            array[n * attr.itemSize + j] = attr.array[idx * attr.itemSize + j]; });
        geo.setAttribute(name, new T.BufferAttribute(array, attr.itemSize, attr.normalized));
    }
    geo.computeBoundingSphere();
}
export function furnishBlenderCellar(built, L, { load = null } = {}) {
    const a = L.landmark, group = new T.Group();
    group.name = 'Blender: ' + L.theme.room;
    group.position.set(a.x, a.y, a.z);
    built.group.add(group);
    built.physicalBodies.push(...a.spec.colliders.map(c => ({ ...c, ...(c.kind === 'ramp' ? { thickness: .4 } : {}), x: c.x + a.x, y: c.y + a.y, z: c.z + a.z })));
    fitGeology(built, L);
    openPit(built, L);
    const streaming = createCellarStreamingFloor(a.spec);
    group.add(streaming.group);
    const clock = { value: 0 }, materials = [], emission = [];
    let disposed = false, loaded = false;
    const lease = load ? { promise: load(L.level), release() { } } : typeof window !== 'undefined' && window.document ? acquire(L.level) : { promise: Promise.resolve(null), release() { } };
    const ready = lease.promise.then(asset => {
        if (!asset || disposed)
            return false;
        const model = asset.scene.clone(true);
        model.traverse(o => {
            if (!o.isMesh)
                return;
            o.castShadow = true;
            o.receiveShadow = true;
            const mat = o.material.clone();
            materials.push(mat);
            o.material = mat;
            if (mat.emissive?.getHex() && mat.emissiveIntensity > 0) {
                // Broad furnace grates need a lower bloom contribution than small flames.
                if (L.level === 4) mat.emissiveIntensity *= .18;
                enableSpellBloom(mat);
                emission.push({ mat, base: mat.emissiveIntensity });
            }
            if (/purple|red|water/.test(mat.name)) {
                const water = /water/.test(mat.name);
                mat.onBeforeCompile = shader => { shader.uniforms.cellarTime = clock; shader.vertexShader = 'uniform float cellarTime;\n' + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + (water ? 'transformed.y += sin(position.x*.8+cellarTime*.35)*sin(position.z*.65+cellarTime*.22)*.025;' : 'transformed.z += sin(position.x*.7+position.y*.5+cellarTime*.5)*.06;')); };
                mat.customProgramCacheKey = () => water ? 'cellar-water-v1' : 'cellar-banner-v1';
            }
        });
        group.add(model);
        streaming.dispose();
        loaded = true;
        return true;
    }).catch(error => { if (!disposed)
        console.warn('Cellar artwork could not load', L.level, error.message); return false; });
    const anchors = a.spec.anchors.map(p => ({ ...p, x: p.x + a.x, y: p.y + a.y, z: p.z + a.z }));
    return { group, ready, anchors, get loaded() { return loaded; }, stats: a.spec.metrics,
        update(time) { clock.value = time; for (let i = 0; i < emission.length; i++) {
            const e = emission[i];
            e.mat.emissiveIntensity = e.base * (.93 + .07 * Math.sin(time * 3.7 + i));
        } },
        dispose() { if (disposed)
            return; disposed = true; streaming.dispose(); group.removeFromParent(); for (const m of materials)
            m.dispose(); lease.release(); },
    };
}
