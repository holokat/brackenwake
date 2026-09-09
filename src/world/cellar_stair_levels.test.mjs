import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {installTextureStubs} from '../../tools/test-glb-env.mjs';
import {createOldCellars} from './old_cellars.js';
import {createDungeonScene,setDungeonCanvasFactory,stubCanvasFactory} from './dungeon.js';
import {furnishOldCellars} from './old_cellars_scene.js';
import {furnishCellarEntry} from './cellar_entry.js';
import {dungeonPhysical} from './collision/dungeon.js';
import {disposeGltf} from '../game/streaming/gltf_assets.js';
installTextureStubs();setDungeonCanvasFactory(stubCanvasFactory);
const loader=new GLTFLoader();
async function load(name){const b=await readFile(new URL(`../../assets/models/cellars/descent/${name}.glb`,import.meta.url));return loader.parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');}
const crypt=await load('regular-crypt');let directions=0,treads=0,picks=0;
const visible=o=>{for(let p=o;p;p=p.parent)if(!p.visible)return false;return true;};
function verify(built,phase){
 built.group.updateMatrixWorld(true);const {up,down}=built.stairs;
 assert(up&&up.group.visible,`${phase}: up stair remains visible`);directions++;
 const at=built.entrancePos;
 for(let i=0;i<7;i++){
  const p=new T.Vector3(at.x,at.y+.28*(i+1),at.z+.5+.43+i*.78),from=new T.Vector3(at.x+3,at.y+10,at.z-10);
  const hit=new T.Raycaster(from,p.clone().sub(from).normalize()).intersectObject(built.group,true).filter(h=>visible(h.object))[0];
  assert(hit&&hit.point.distanceTo(p)<.07,`${phase}: ascending tread ${i} is exposed`);treads++;
 }
 const crown=new T.Vector3(at.x,at.y+12,at.z+6.35);
 assert.equal(new T.Raycaster(crown,new T.Vector3(0,-1,0)).intersectObjects(built.exits,false)[0]?.object.userData.exit,'up','The upper arch is clickable too');picks++;
 const index=dungeonPhysical(built.layout,built),landing={x:at.x,y:at.y+.05,z:at.z},ahead={...landing,z:at.z-4};
 assert(index.canMove(landing,ahead,.32,1.75),`${phase}: arriving player can walk forward`);
 assert(index.canMove(ahead,landing,.32,1.75),`${phase}: returning exit remains reachable`);
 for(const dir of ['up',...(down?['down']:[])]){
  const target=built.exits.find(e=>e.userData.exit===dir);
  for(const dx of [-2.3,0,2.3]){
   const from=new T.Vector3(target.position.x+dx,target.position.y+10,target.position.z);
   assert.equal(new T.Raycaster(from,new T.Vector3(0,-1,0)).intersectObjects(built.exits,false)[0]?.object.userData.exit,dir);picks++;
  }
 }
 for(const child of built.group.children)if(child.userData.exit&&!child.userData.stairVisual&&!built.exits.includes(child))assert(!child.visible,'Old hoop and blocks stay hidden');
 if(down){
  directions++;const at=built.stairPos;
  for(let i=0;i<8;i++)for(const dx of [-1.2,0,1.2]){
   const ray=new T.Raycaster(new T.Vector3(at.x+dx,at.y+1.8,at.z-.375-i*.75),new T.Vector3(0,-1,0));
   const hit=ray.intersectObject(built.group,true).filter(h=>visible(h.object))[0];
   assert(hit&&Math.abs(hit.point.y-(at.y-i*.28))<.025,`${phase}: descending tread ${i} is exposed`);treads++;
  }
 }
 for(const model of [up,down].filter(Boolean)){
  assert.equal(model.group.children.length,3);assert(model.group.children.every(m=>m.isMesh));
  assert(model.group.children.reduce((n,m)=>n+m.geometry.attributes.position.count/3,0)<=1500);
 }
}
for(let level=1;level<=8;level++){
 let L=createOldCellars(22,{id:'oldcellars'},level),built=furnishOldCellars(createDungeonScene(T,L),L);
 await built.stairs.down?.ready;verify(built,`floor ${level} proxy`);built.dispose();
 // The actual room asset must leave the same stair surfaces and hit areas exposed.
 if(level<8){
  const boss=await load(`boss-0${level}`);L=createOldCellars(22,{id:'oldcellars'},level);
  built=furnishOldCellars(createDungeonScene(T,L),L,{artLoaders:{descent:async id=>id===`boss-0${level}`?boss:id==='regular-crypt'?crypt:null}});
  await built.descent.ready;verify(built,`floor ${level} GLB`);
  let disposed=0;for(const model of [built.stairs.up,built.stairs.down])for(const mesh of model.group.children)for(const resource of [mesh.geometry,mesh.material])resource.addEventListener('dispose',()=>disposed++);
  built.dispose();built.dispose();assert.equal(disposed,12);disposeGltf(boss);
 }
}
disposeGltf(crypt);
// First-floor artwork temporarily replaces its styled fallback, then restores
// that fallback if the detailed entry is evicted. Never restore the old hoop.
const L=createOldCellars(22,{id:'oldcellars'},1),built=furnishOldCellars(createDungeonScene(T,L),L);
built.entry.dispose();let job;const fake=new T.Group(),material=new T.MeshStandardMaterial(),geometry=new T.BoxGeometry();fake.add(new T.Mesh(geometry,material));
const entry=furnishCellarEntry(built,L,{stream:{register(value){job=value;}},load:async()=>({scene:fake})});
assert(await job.load());assert.equal(built.stairs.up.group.visible,false);job.unload();assert.equal(built.stairs.up.group.visible,true);
entry.dispose();built.dispose();geometry.dispose();material.dispose();
console.log('CELLAR_STAIR_LEVELS_VERIFIED',JSON.stringify({floors:8,directions,treads,picks,streamedEntryFallback:true}));
