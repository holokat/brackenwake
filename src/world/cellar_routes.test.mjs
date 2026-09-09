import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createOldCellars,cellarHeight} from './old_cellars.js';
import {worldOf,walkable,gridOf} from './dungeon_gen.js';
import {cellarRoutes} from './cellar_routes.js';
import {furnishCellarVaults} from './cellar_vaults.js';
import {createDungeonScene,setDungeonCanvasFactory,stubCanvasFactory} from './dungeon.js';
import {furnishOldCellars} from './old_cellars_scene.js';
import {furnishCellarEntry} from './cellar_entry.js';
import {CELLAR_ENTRY_PLAN as plan} from './cellar_entry_layout.js';
import {dungeonPhysical} from './collision/dungeon.js';
import {rampHeight} from './collision/shapes.js';
import {installTextureStubs} from '../../tools/test-glb-env.mjs';
installTextureStubs();
setDungeonCanvasFactory(stubCanvasFactory);
let testedSegments=0, reachableRooms=0, stairSamples=0;
for(let level=1;level<=8;level++){
 const L=createOldCellars(22,{id:'oldcellars'},level),root=new T.Group();
 furnishCellarVaults(root,L,[]);root.updateMatrixWorld(true);
 for(const path of cellarRoutes(L).paths)for(let i=1;i<path.length;i++){
  const a=path[i-1],b=path[i],va=new T.Vector3(a.x,cellarHeight(level,a.z)+1.5,a.z),vb=new T.Vector3(b.x,cellarHeight(level,b.z)+1.5,b.z),delta=vb.clone().sub(va);
  const ray=new T.Raycaster(va,delta.clone().normalize(),0,delta.length());
  assert.equal(ray.intersectObject(root,true).length,0,`Decorative wall crosses route at depth ${level}: ${JSON.stringify(a)}`);testedSegments++;
 }
 // Positive control: the render-ray assertion detects a wall deliberately put across a route.
 const control=new T.Mesh(new T.BoxGeometry(3,4,1),new T.MeshBasicMaterial({side:T.DoubleSide}));control.position.set(0,1.5,-2);control.updateMatrixWorld(true);
 assert(new T.Raycaster(new T.Vector3(0,1.5,0),new T.Vector3(0,0,-1),0,4).intersectObject(control).length);
 control.geometry.dispose();control.material.dispose();
 const built=furnishOldCellars(createDungeonScene(T,L),L),index=dungeonPhysical(L,built);
 const start=L.entrance.gz*L.w+L.entrance.gx,seen=new Set([start]),queue=[start];
 const pos=i=>{const p=worldOf(L,i%L.w,Math.floor(i/L.w)),floor=L.heights[i];return{...p,y:Math.max(floor,index.supportAt(p.x,p.z,floor+.35))+.05};};
 for(let k=0;k<queue.length;k++){
  const i=queue[k],x=i%L.w,z=Math.floor(i/L.w),from=pos(i);
  for(const [dx,dz]of[[1,0],[-1,0],[0,1],[0,-1]]){
   const n=(z+dz)*L.w+x+dx;if(seen.has(n)||!walkable(L,x+dx,z+dz))continue;
   const to=pos(n);if(index.canMove(from,to,.32,1.75)){seen.add(n);queue.push(n);}
  }
 }
 for(const r of L.rooms){
  assert([...seen].some(i=>Math.hypot(i%L.w-r.cx,Math.floor(i/L.w)-r.cz)<6),`Player cannot reach depth ${level} room ${r.id}`);reachableRooms++;
 }
 if(L.stair)assert(seen.has(L.stair.gz*L.w+L.stair.gx),`Descending stair unreachable at depth ${level}`);
 if(level===1){
  const bytes=await readFile(new URL('../../assets/models/cellars/entry/cellar-entry.glb',import.meta.url));
  const asset=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  // Replace the no-browser loader with the actual exported GLB in this test.
  const art=furnishCellarEntry(built,L,{load:async()=>asset});assert(await art.ready);art.group.updateMatrixWorld(true);
  let samples=0;
  for(const path of plan.routes.slice(0,4))for(let j=1;j<path.length;j++){
   const a=path[j-1],b=path[j],n=Math.ceil(Math.hypot(a[0]-b[0],a[1]-b[1]));let previous=null;
   for(let i=0;i<=n;i++){
    const t=i/n,x=plan.origin.x+a[0]+(b[0]-a[0])*t,z=plan.origin.z+a[1]+(b[1]-a[1])*t,p={x,y:cellarHeight(1,z)+.05,z};
    if(previous){assert(index.canMove(previous,p,.32,1.75),`Entry route blocked: ${x},${z}`);
     const va=new T.Vector3(previous.x,previous.y+1.25,previous.z),vb=new T.Vector3(p.x,p.y+1.25,p.z),delta=vb.clone().sub(va);
     assert.equal(new T.Raycaster(va,delta.clone().normalize(),0,delta.length()).intersectObjects([art.group,...built.parts.walls,built.parts.ceiling],true).filter(h=>h.object.isMesh).length,0,`Opaque entry geometry or retained cave wall crosses route: ${x},${z}`);}
    previous=p;samples++;
   }
  }
  for(const stair of built.physicalBodies.filter(b=>b.model==='Nave gallery stair')){
   let previous=null;
   for(let i=0;i<=150;i++){
    const z=stair.z+(i/150-.5)*stair.d*stair.direction,y=rampHeight(stair,stair.x,z),p={x:stair.x,y:y+.05,z};
    assert(Math.abs(index.supportAt(p.x,p.z,y+.1)-y)<.15);
    if(previous)assert(index.canMove(previous,p,.32,1.75),JSON.stringify({stair:stair.model,from:previous,to:p,hit:index.at(p.x,p.y,p.z,.32,1.75)}));previous=p;stairSamples++;
   }
   const target={x:Math.sign(stair.x-plan.origin.x)*27+plan.origin.x,y:previous.y,z:previous.z};
   assert(index.canMove(previous,target,.32,1.75),'Gallery stair must connect through an open railing gap');
  }
  art.update(1,{x:1,z:167});assert(art.active);art.dispose();asset.scene.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
  console.log('Actual entry GLB traversed:',samples,'samples');
 }
 built.dispose();root.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
}
console.log('CELLAR_ROUTES_VERIFIED',JSON.stringify({depths:8,reachableRooms,testedSegments,stairSamples}));
