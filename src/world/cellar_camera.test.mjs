import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {installTextureStubs} from '../../tools/test-glb-env.mjs';
import {createOldCellars} from './old_cellars.js';
import {createDungeonScene,setDungeonCanvasFactory,stubCanvasFactory} from './dungeon.js';
import {furnishOldCellars} from './old_cellars_scene.js';
import {cellarFloorAt} from './cellar_floor.js';
import {dungeonPhysical} from './collision/dungeon.js';
import {createFollowCamera,EYE_HEIGHT,orbitPosition} from '../game/camera.js';
import {cameraClearance} from '../game/camera_obstruction.js';
installTextureStubs();setDungeonCanvasFactory(stubCanvasFactory);
let frames=0,blocked=0,open=0,rays=0,positiveHits=0,collapsed=0,minDistance=Infinity;const errors=[],collapsedAt=new Map();
const b=await readFile(new URL('../../assets/models/cellars/entry/cellar-entry.glb',import.meta.url));
const entry=await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');
for(let level=1;level<=8;level++) {
 const L=createOldCellars(20260904,{id:'s:island_cellars'},level);
 const built=furnishOldCellars(createDungeonScene(T,L),L,{artLoaders:{entry:()=>entry}});
 if(level===1)assert(await built.entry.ready);
 const index=dungeonPhysical(L,built),h=(x,z)=>cellarFloorAt(L,x,z);h.cameraDistance=index.cameraDistance;
 const cam=new T.PerspectiveCamera(55,2.05,.1,1800),follow=createFollowCamera(cam,{drag:{dx:0,dy:0},wheel:0});
 const positions=(L.descent||[]).map(r=>({x:r.x+14,y:r.y,z:r.z+10}));
 if(level===1)positions.push(...[[19,-3,124],[32,-3,110],[34,-3,97],[1,-3,120],[-18,-3,120],[-27,-3,98],[-27,4,98],[5,0,150],[1,-1.5,136],[20,0,175]].map(([x,y,z])=>({x,y,z})));
 const art=[];if(level===1){built.entry.group.updateWorldMatrix(true,true);built.entry.group.traverseVisible(o=>{if(o.isMesh&&/masonry|limestone|ceiling|trim|floor/i.test(o.material.name)){o.geometry.computeBoundingBox();art.push(o);}});}
 for(const p of positions){
  const target=new T.Vector3(p.x,p.y+EYE_HEIGHT,p.z);
  for(const pitch of [.15,.55,1.2]) {
   follow.pitch=pitch;follow.distance=32;follow.snap(p,h);
   for(let i=0;i<72;i++) {
    follow.yaw=i*Math.PI/36;follow.update(1/60,p,h);frames++;
    const actual=cam.position.distanceTo(target),limit=index.cameraDistance(target,cam.position,cameraClearance(cam));
    minDistance=Math.min(minDistance,actual);if(actual<.05){collapsed++;const k=JSON.stringify(p);collapsedAt.set(k,(collapsedAt.get(k)||0)+1);}
    if(actual>limit+1e-7)errors.push(`Floor ${level} camera inside collision at ${JSON.stringify(p)} yaw ${follow.yaw}`);
    if(actual<31)blocked++;else open++;
    if(!art.length||!positions.slice(-10).includes(p)||i%6)continue;
    // Independent oracle: rays against the real rendered Blender shell. The
    // uncorrected orbit must hit walls too, proving the fixture exercises them.
    const trace=to=>{const delta=new T.Vector3(to.x,to.y,to.z).sub(target);return new T.Raycaster(target,delta.clone().normalize(),.02,delta.length()).intersectObjects(art,false);};
    const want=orbitPosition(target,follow.yaw,pitch,32);if(trace(want).length)positiveHits++;
    const hits=trace(cam.position);rays++;
    if(hits.length)errors.push(`Blender ${hits[0].object.material.name} crosses camera at ${JSON.stringify(p)} yaw ${follow.yaw.toFixed(2)} pitch ${pitch}: ${JSON.stringify(hits[0].point)}`);
   }
  }
 }
 built.dispose();
}
assert(positiveHits>0,'The rendered-wall oracle never exercised an obstructed view');
assert(blocked>0&&open>0,'Both blocked and fully open orbits must be exercised');
assert.deepEqual(errors,[],errors.slice(0,15).join('\n'));
entry.scene.traverse(o=>{o.geometry?.dispose();for(const m of [].concat(o.material||[]))m.dispose();});
console.log('CELLAR_CAMERA_VERIFIED',JSON.stringify({floors:8,frames,blocked,open,renderedRays:rays,uncorrectedWallHits:positiveHits,minDistance,collapsed,collapsedAt:[...collapsedAt]}));
