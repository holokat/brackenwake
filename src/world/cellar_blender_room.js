import * as T from 'three';
import {createRoomArtwork} from '../game/streaming/room_artwork.js';
import {CELLAR_ASSETS} from './cellar_asset_catalog.js';
import {createCellarRoomProxy} from './cellar_room_proxy.js';
import { enableSpellBloom } from '../game/vfx/bloom.js';
import { inCellarLandmark } from './cellar_landmark_layout.js';
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
export function furnishBlenderCellar(built, L, { load = null, stream, sc } = {}) {
    const a = L.landmark, group = new T.Group();
    group.name = 'Blender: ' + L.theme.room;
    group.position.set(a.x, a.y, a.z);
    built.group.add(group);
    built.physicalBodies.push(...a.spec.colliders.map(c => ({ ...c, ...(c.kind === 'ramp' ? { thickness: .4 } : {}), x: c.x + a.x, y: c.y + a.y, z: c.z + a.z })));
    fitGeology(built, L);
    openPit(built, L);
    const ground = a.spec.ground;
    const streaming = createCellarRoomProxy(a.spec.colliders, [
        {rx:ground.rx,rz:ground.rz,holes:ground.holes,ceiling:L.theme.ceiling},
        ...ground.holes.map(h=>({x:h.x,z:h.z,y:-h.depth,rx:h.w/2,rz:h.d/2})),
    ]);
    streaming.group.name = 'Cellar streaming support'; group.add(streaming.group);
    const clock = {value:0}; let disposed = false;
    const art = createRoomArtwork({id:'landmark',url:CELLAR_ASSETS[`room-${L.level}`],stream,sc,cameraObstacles:built.cameraObstacles,
        bounds:{x:a.x,z:a.z,rx:ground.rx,rz:ground.rz},load:load?()=>load(L.level):typeof window==='undefined'?async()=>null:null,
        configure:mat=>{
            if(mat.emissive?.getHex()&&mat.emissiveIntensity>0){
                if(L.level===4)mat.emissiveIntensity*=.18;
                enableSpellBloom(mat);mat.userData.streamGlow=mat.emissiveIntensity;
            }
            if(/purple|red|water/.test(mat.name)){
                const water=/water/.test(mat.name);
                mat.onBeforeCompile=shader=>{shader.uniforms.cellarTime=clock;shader.vertexShader='uniform float cellarTime;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n'+(water?'transformed.y += sin(position.x*.8+cellarTime*.35)*sin(position.z*.65+cellarTime*.22)*.025;':'transformed.z += sin(position.x*.7+position.y*.5+cellarTime*.5)*.06;'));};
                mat.customProgramCacheKey=()=>water?'cellar-water-v1':'cellar-banner-v1';
            }
        },
        attach:instance=>{group.add(instance.group);streaming.group.removeFromParent();},
        detach:()=>{if(!disposed)group.add(streaming.group);},
    });
    const anchors = a.spec.anchors.map(p => ({ ...p, x: p.x + a.x, y: p.y + a.y, z: p.z + a.z }));
    return {group,anchors,get ready(){return art.ready;},get loaded(){return art.loaded;},stats:a.spec.metrics,
        update(time){clock.value=time;for(const [i,mat]of art.materials.entries())if(mat.userData.streamGlow)mat.emissiveIntensity=mat.userData.streamGlow*(.93+.07*Math.sin(time*3.7+i));},
        dispose(){if(disposed)return;disposed=true;art.dispose();streaming.dispose();group.removeFromParent();},
    };
}
