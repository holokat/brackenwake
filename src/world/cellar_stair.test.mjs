import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {installTextureStubs} from '../../tools/test-glb-env.mjs';
import {createOldCellars} from './old_cellars.js';
import {createDungeonScene,setDungeonCanvasFactory,stubCanvasFactory} from './dungeon.js';
import {furnishOldCellars} from './old_cellars_scene.js';
import {createCellarStairModel,CELLAR_STAIR,hasCommandStair} from './cellar_stair_model.js';
import {furnishCommandStair} from './cellar_stair.js';
import {dungeonPhysical} from './collision/dungeon.js';
import {disposeGltf} from '../game/streaming/gltf_assets.js';
installTextureStubs();setDungeonCanvasFactory(stubCanvasFactory);
const L=createOldCellars(22,{id:'oldcellars'},1),bytes=await readFile(new URL('../../assets/models/cellars/descent/boss-01.glb',import.meta.url));
const asset=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
const visible=o=>{for(let p=o;p;p=p.parent)if(!p.visible)return false;return true;};
let checks=0;
async function verify(built,phase){
 await built.commandStair.ready;built.group.updateMatrixWorld(true);
 const at=built.stairPos,cast=(x,z)=>new T.Raycaster(new T.Vector3(x,at.y+1.8,z),new T.Vector3(0,-1,0)).intersectObject(built.group,true).filter(h=>visible(h.object));
 for(let i=0;i<CELLAR_STAIR.steps;i++)for(const x of [-1.2,0,1.2]){
  const hit=cast(at.x+x,at.z-.375-i*.75)[0];assert(hit,`${phase}: tread ${i} exists`);
  assert(Math.abs(hit.point.y-(at.y-i*.28))<.025,`${phase}: tread ${i} was covered at height ${hit.point.y}`);checks++;
 }
 for(const x of [-4,0,4])for(let i=0;i<CELLAR_STAIR.steps;i++){
  const from=new T.Vector3(at.x+x,at.y+8,at.z+12),to=new T.Vector3(at.x,at.y-i*.28,at.z-(i+.85)*.75);
  const hit=new T.Raycaster(from,to.clone().sub(from).normalize()).intersectObject(built.group,true).filter(h=>visible(h.object))[0];
  assert(hit&&hit.point.distanceTo(to)<.05,`${phase}: tread ${i} is visible from the approach`);checks++;
 }
 const room=built.descent.rooms.find(r=>r.room.roomId===9);
 const roof=new T.Raycaster(new T.Vector3(at.x,at.y+10,at.z-3),new T.Vector3(0,1,0)).intersectObject(room.group,true)[0];
 assert(roof&&roof.point.y>=17.9,`${phase}: cutting the floor must preserve the ceiling`);checks++;
 // This oracle must actually catch the old opaque cover hiding the steps.
 const cover=new T.Mesh(new T.PlaneGeometry(3.5,5.9),new T.MeshBasicMaterial());cover.rotation.x=-Math.PI/2;cover.position.set(at.x,at.y+.03,at.z-3);built.group.add(cover);built.group.updateMatrixWorld(true);
 assert.equal(cast(at.x,at.z-3)[0].object,cover);cover.removeFromParent();cover.geometry.dispose();cover.material.dispose();checks++;
 for(const [x,z] of [[0,0],[0,-5.8],[-2.3,.1],[2.3,.1]]){
  const hit=new T.Raycaster(new T.Vector3(at.x+x,at.y+6,at.z+z),new T.Vector3(0,-1,0)).intersectObjects(built.exits,false)[0];assert.equal(hit?.object.userData.exit,'down');checks++;
 }
 const index=dungeonPhysical(built.layout,built),landing={x:at.x,y:at.y+.05,z:at.z},approach={...landing,z:at.z+3};
 assert(index.canMove(approach,landing,.32,1.75),'Threshold is reachable');
 assert(index.canMove(landing,approach,.32,1.75),'Returning player can leave the landing');
 assert(!index.canMove(landing,{...landing,z:at.z-2},.32,1.75),'Cannot walk across the open flight at flat floor height');checks+=3;
 return built;
}
// The detailed room can fail or still be downloading; the flight remains visible.
let built=furnishOldCellars(createDungeonScene(T,L),L);
await verify(built,'loading proxy');built.dispose();
// Drive the real room loader with the actual shipped GLB, including camera indexing.
const L2=createOldCellars(22,{id:'oldcellars'},1);built=furnishOldCellars(createDungeonScene(T,L2),L2,{artLoaders:{descent:async id=>id==='boss-01'?asset:null}});
assert(await built.descent.rooms.find(r=>r.room.roomId===9).ready);await verify(built,'loaded GLB');
const countLights=scene=>{let n=0;scene.traverse(o=>{if(o.isPointLight)n++;});return n;};
const baseline=createDungeonScene(T,createOldCellars(22,{id:'oldcellars'},1)),before=countLights(baseline.group);
const added=furnishCommandStair(baseline,baseline.layout);
assert.equal(countLights(baseline.group),before,'Reuse the existing exit light; no new point lights');added.dispose();baseline.dispose();
const lights=countLights(built.group);
const meshes=built.commandStair.group.children;assert.equal(meshes.length,3);assert(meshes.reduce((n,m)=>n+m.geometry.attributes.position.count/3,0)<1100);
let disposals=0;for(const mesh of meshes){mesh.geometry.addEventListener('dispose',()=>disposals++);mesh.material.addEventListener('dispose',()=>disposals++);}
built.dispose();built.dispose();assert.equal(disposals,6,'Every owned stair resource is disposed once');disposeGltf(asset);
for(let level=2;level<=8;level++)assert.equal(hasCommandStair(createOldCellars(22,{id:'oldcellars'},level)),false);
assert.equal(hasCommandStair({...L,siteId:'another-dungeon'}),false);
const standalone=createCellarStairModel();standalone.dispose();standalone.dispose();
console.log('CELLAR_STAIR_VERIFIED',JSON.stringify({surfaceAndInteractionChecks:checks,meshBatches:3,pointLights:lights,levelsUnchanged:7}));
