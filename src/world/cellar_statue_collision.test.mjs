import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {installTextureStubs} from '../../tools/test-glb-env.mjs';
import {createCollisionIndex} from './collision/shapes.js';
import {dungeonPhysical} from './collision/dungeon.js';
import {createOldCellars} from './old_cellars.js';
import {createDungeonScene,setDungeonCanvasFactory,stubCanvasFactory} from './dungeon.js';
import {furnishOldCellars} from './old_cellars_scene.js';
import {stepPlayer,STRIDE_WALK} from '../game/player.js';
import {disposeGltf} from '../game/streaming/gltf_assets.js';

installTextureStubs();setDungeonCanvasFactory(stubCanvasFactory);
const assets=new URL('../../assets/models/cellars/descent/',import.meta.url);
const manifest=JSON.parse(await readFile(new URL('manifest.json',assets),'utf8'));
const statue=c=>c.model==='Funeral statue';
// Extremities measured from the shipped statue builder, then independently
// located in each actual exported room mesh below. Both escaped the old box.
const extremities=[
 [1.3789275884628296,3.119610071182251,.30000001192092896],
 [.21149275405600212,5.772472481552891,-.04694633806775682],
];
let templates=0,statues=0,placements=0,frames=0,coveredExtremities=0;
const fresh=(x,y,z)=>({x,y,z,vx:0,vz:0,vy:0,speed:0,yaw:0,phase:0,stride:STRIDE_WALK,t:0,anim:'idle',idleMix:1,airborne:false,peakY:y,landed:null});
for(const room of manifest.rooms){
 const bodies=room.colliders.filter(statue);if(!bodies.length)continue;templates++;
 const sidecar=JSON.parse(await readFile(new URL(room.id+'.json',assets),'utf8'));
 assert.deepEqual(sidecar.colliders,room.colliders,'Standalone export and runtime manifest agree');
 const buffer=await readFile(new URL(room.id+'.glb',assets));
 const gltf=await new GLTFLoader().parseAsync(buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength),'');
 gltf.scene.updateMatrixWorld(true);
 for(const base of bodies.filter(b=>b.part==='plinth')){
  statues++;const k=base.w/2.5;
  const parts=bodies.filter(b=>Math.abs(b.x-base.x)<k&&Math.abs(b.z-base.z)<k);
  assert.equal(parts.length,14);assert(parts.every(b=>b.part&&b.h>0));
  const index=createCollisionIndex(parts),old=createCollisionIndex([{...base,h:5.6*k}]);
  assert(Math.abs(base.h-.8*k)<1e-6,'The pedestal retains its real support height');
  const rim={x:base.x-.35*k,y:base.h+.05,z:base.z+1.11*k},across={...rim,x:base.x+.35*k};
  assert.equal(old.canMove(rim,across),false,'Positive control: old box blocked clear space above the rim');
  assert(index.canMove(rim,across),'The plinth rim beside the robe is clear');
  assert(index.canMove(across,rim),'The rim stays clear in both directions');
  const cameraFrom={...rim,y:rim.y+.5},cameraTo={...across,y:rim.y+.5};
  assert(index.cameraDistance(cameraFrom,cameraTo,.28)>=across.x-rim.x-.001,'Camera passes through the clear space beside the robe');
  assert(old.cameraDistance(cameraFrom,cameraTo,.28)<.01,'Positive control: old box falsely shortened the camera arm');
  assert(!index.canMove({...rim,z:base.z+2.5*k},{...rim,z:base.z}),'The actual robe remains solid');
  for(const [dx,dz] of [[1,0],[-1,0],[0,1],[0,-1]]){
   const h=()=>0;h.canMove=index.canMove;h.supportAt=index.supportAt;h.ceilingAt=index.ceilingAt;
   const s=fresh(base.x+dx*(base.w/2+2),0,base.z+dz*(base.d/2+2));
   for(let i=0;i<120;i++){stepPlayer(s,1/60,{x:dx,z:-dz},h);frames++;}
   assert(s.blocked,'Walking into the pedestal is stopped by the actual player controller');
   assert(!index.at(s.x,s.y,s.z),'The stopped player is outside the masonry');
   const stopped={x:s.x,z:s.z};
   for(let i=0;i<45;i++){stepPlayer(s,1/60,{x:-dx,z:dz},h);frames++;}
   assert(Math.hypot(s.x-stopped.x,s.z-stopped.z)>1,'The player can back away without sticking');
  }
  // Saves made before this correction may overlap the newly covered sleeve.
  const inside={x:base.x+base.w/2-.1,y:.05,z:base.z};
  assert(index.canMove(inside,{...inside,x:base.x+base.w/2+1}),'Existing overlapping saves can escape');
  for(const [dx,dy,dz] of extremities){
   const p=new T.Vector3(base.x+dx*k,dy*k,base.z+dz*k);let nearest=Infinity;
   gltf.scene.traverse(o=>{
    if(!o.isMesh||!/^Descent (trim|limestone)$/.test(o.material.name))return;
    const attr=o.geometry.attributes.position,v=new T.Vector3();
    for(let i=0;i<attr.count;i++){v.fromBufferAttribute(attr,i).applyMatrix4(o.matrixWorld);nearest=Math.min(nearest,v.distanceToSquared(p));}
   });
   assert(nearest<1e-8,`${room.id}: measured extremity exists in the actual GLB`);
   assert(!old.at(p.x,p.y-.05,p.z,.025,.1),'Positive control: original box missed this stone');
   assert(index.at(p.x,p.y-.05,p.z,.025,.1),'The visible sleeve/hood is now solid');coveredExtremities++;
  }
 }
 disposeGltf(gltf);
}
// Prove these asset envelopes reach the live, cached dungeon collision index
// before detailed artwork arrives, including each room's elevation/translation.
for(let level=1;level<=8;level++){
 const L=createOldCellars(22,{id:'oldcellars'},level),built=furnishOldCellars(createDungeonScene(T,L),L);
 const index=dungeonPhysical(L,built),bases=built.physicalBodies.filter(b=>statue(b)&&b.part==='plinth');
 for(const base of bases){
  placements++;
  assert(index.at(base.x,base.y+.05,base.z));
  const k=base.w/2.5,p={x:base.x+extremities[0][0]*k,y:base.y+extremities[0][1]*k-.05,z:base.z+extremities[0][2]*k};
  assert(index.at(p.x,p.y,p.z,.025,.1),'Translated sleeve is present before artwork streams');
 }
 built.dispose();
}
assert.equal(templates,5);assert.equal(statues,20);assert.equal(placements,176);
console.log('CELLAR_STATUE_COLLISION_VERIFIED',JSON.stringify({templates,statues,placements,frames,coveredExtremities}));
