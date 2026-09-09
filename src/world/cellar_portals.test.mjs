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
import {stepPlayer} from '../game/player.js';
installTextureStubs();setDungeonCanvasFactory(stubCanvasFactory);
const assets=new Map(),errors=[];let portals=0,walks=0;
async function asset(path){
 if(!assets.has(path))assets.set(path,(async()=>{const b=await readFile(new URL('../../assets/models/cellars/'+path,import.meta.url));return new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');})());
 return assets.get(path);
}
function opaqueMeshes(group){const meshes=[];group.traverseVisible(o=>{if(o.isMesh&&[].concat(o.material).some(m=>m.visible&&(!m.transparent||m.opacity>.95))){o.geometry.computeBoundingBox();meshes.push(o);}});return meshes;}
function visualRoute(meshes,h,from,to,label){
 const n=Math.ceil(Math.hypot(to.x-from.x,to.z-from.z)*2);let prior;
 for(let i=0;i<=n;i++){
  const t=i/n,p=new T.Vector3(from.x+(to.x-from.x)*t,0,from.z+(to.z-from.z)*t);p.y=h(p.x,p.z)+1.3;
  if(prior){const delta=p.clone().sub(prior),hits=new T.Raycaster(prior,delta.clone().normalize(),0,delta.length()).intersectObjects(meshes,false);
   if(hits.length){errors.push(`${label}: opaque ${hits[0].object.name||'mesh'} at ${JSON.stringify(hits[0].point)}`);return;}}
  prior=p;
 }
}
function walk(h,from,to,label){
 const s={...from,y:h(from.x,from.z),vx:0,vz:0,vy:0,airborne:false};let frames=0;
 while(Math.hypot(to.x-s.x,to.z-s.z)>.14&&frames++<600){const d=Math.hypot(to.x-s.x,to.z-s.z);stepPlayer(s,1/60,{z:Math.min(1,d*2),yaw:Math.atan2(to.x-s.x,to.z-s.z)},h);}
 if(Math.hypot(to.x-s.x,to.z-s.z)>.14)errors.push(`${label}: walk blocked at ${JSON.stringify({x:s.x,y:s.y,z:s.z,target:to})}`);
 walks++;
}
// Both oracles must reject a real defect before their absence is trusted.
const wall=new T.Mesh(new T.BoxGeometry(4,4,1),new T.MeshBasicMaterial());wall.position.set(0,1.5,5);wall.updateMatrixWorld(true);
visualRoute([wall],()=>0,{x:0,z:0},{x:0,z:10},'wall control');
assert(errors.pop()?.includes('wall control: opaque'),'Visual oracle missed an opaque walk-through wall');wall.geometry.dispose();wall.material.dispose();
walk((x,z)=>z>=1?1:0,{x:0,z:0},{x:0,z:3},'slope control');
assert(errors.pop()?.includes('slope control: walk blocked'),'Movement oracle missed an impassable step');walks=0;
for(let level=1;level<=8;level++){
 const L=createOldCellars(20260904,{id:'s:island_cellars'},level),built=furnishOldCellars(createDungeonScene(T,L),L,{artLoaders:{
  entry:()=>asset('entry/cellar-entry.glb'),landmark:n=>asset(`rooms/cellar-room-${String(n).padStart(2,'0')}.glb`),descent:id=>asset(`descent/${id}.glb`),
 }});
 const index=dungeonPhysical(L,built),h=(x,z)=>cellarFloorAt(L,x,z);
 h.supportAt=index.supportAt;h.canMove=(a,b)=>index.canMove(a,b,.32,1.75);h.ceilingAt=index.ceilingAt;
 const paths=[];
 for(const room of L.descent||[])for(const door of room.spec.doors){
  const axis=door.axis,sign=Math.sign(door[axis]),p={x:room.x+door.x,z:room.z+door.z};
  paths.push({name:`floor ${level}, room ${room.roomId}, ${axis}${sign}`,a:{...p,[axis]:p[axis]-sign*5},b:{...p,[axis]:p[axis]+sign*6}});
 }
 const a=L.landmark;
 for(const axis of ['x','z'])for(const sign of [-1,1]){
  const p={x:a.x,z:a.z};p[axis]+=sign*(axis==='x'?a.spec.ground.rx:a.spec.ground.rz);
  paths.push({name:`floor ${level}, landmark ${axis}${sign}`,a:{...p,[axis]:p[axis]-sign*5},b:{...p,[axis]:p[axis]+sign*6}});
 }
 if(level===1)paths.push({name:'reported slope -90,10',a:{x:-90,z:30},b:{x:-90,z:-10}});
 // Inspect complete loading geometry, then the actual exports and retained
 // cave walls. Collision-only flood fills cannot detect a walk-through wall.
 for(const phase of ['loading','loaded']){
  if(phase==='loaded')assert(await built.ready,`Floor ${level} artwork failed to load`);
  built.group.updateMatrixWorld(true);const meshes=opaqueMeshes(built.group);
  for(const p of paths){visualRoute(meshes,h,p.a,p.b,`${phase} ${p.name}`);visualRoute(meshes,h,p.b,p.a,`${phase} ${p.name} reverse`);portals++;}
 }
 for(const p of paths){walk(h,p.a,p.b,p.name);walk(h,p.b,p.a,p.name+' reverse');}
 built.dispose();
 console.log(`Floor ${level}: loaded and loading doorway checks complete`);
}
for(const pending of assets.values()){const a=await pending;a.scene.traverse(o=>{o.geometry?.dispose();for(const m of [].concat(o.material||[]))m.dispose();});}
assert.deepEqual(errors,[],errors.slice(0,25).join('\n'));
console.log('CELLAR_PORTALS_VERIFIED',JSON.stringify({floors:8,portals,walks}));
