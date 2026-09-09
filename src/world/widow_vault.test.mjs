import assert from 'node:assert/strict';
import fs from 'node:fs';
import {bindMineSceneEffects} from '../game/mine_scene_effects.js';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createShoulderWorking,mineHeight} from './shoulder_working.js';
import {createDungeonScene,setDungeonCanvasFactory,stubCanvasFactory} from './dungeon.js';
import {furnishShoulder} from './shoulder_scene.js';
import {widowOrigin} from './widow_vault.js';
import {dungeonPhysical} from './collision/dungeon.js';
import {worldOf,gridOf,walkable} from './dungeon_gen.js';
import {rampHeight,createCollisionIndex} from './collision/shapes.js';
globalThis.window ||= {addEventListener(){},removeEventListener(){}};
globalThis.localStorage ||= {getItem(){return null},setItem(){}};
setDungeonCanvasFactory(stubCanvasFactory);
// Node checks the real exported mesh and loader. GPU texture upload is checked
// separately in the browser capture harness; this does not fabricate geometry.
const loader=new GLTFLoader();loader.register(()=>({name:'TEST_NODE_TEXTURES',loadTexture(){return Promise.resolve(new T.Texture());}}));
const bytes=fs.readFileSync(new URL('../../assets/models/widow-vault/widow-vault.glb',import.meta.url));
const asset=await loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
const make=(load=async()=>asset)=>{const L=createShoulderWorking(42,{id:'s:island_mine_east'}),built=furnishShoulder(createDungeonScene(T,L),L,{loadWidow:load});return {L,built};};
const {L,built}=make(),origin=widowOrigin(L);assert(!built.widow.loaded);assert(await built.ready);assert(built.widow.loaded);
const art=built.widow.group;art.updateMatrixWorld(true);const index=dungeonPhysical(L,built);
let steps=0;
function walk(points){let previous=null;for(let k=0;k<points.length-1;k++){
 const a=points[k],b=points[k+1],count=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.05);
 for(let i=0;i<=count;i++){
  const t=i/count,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t,expectedY=a.y+(b.y-a.y)*t;
  const y=Math.max(mineHeight(z),index.supportAt(x,z,(previous?.y??expectedY)+.09));
  assert(Math.abs(y-expectedY)<.11,`Support mismatch ${JSON.stringify({x,z,y,expectedY})}`);
  const next={x,y:y+.015,z};const grid=gridOf(L,x,z);assert(walkable(L,grid.gx,grid.gz),'Path leaves carved floor');
  if(previous)assert(index.canMove(previous,next),`Blocked ${JSON.stringify({previous,next,body:index.at(x,y+.015,z)})}`);
  previous=next;steps++;
 }
}}
// Verify every silk attachment against the exported rock, not its metadata alone.
for(const a of built.widow.spec.anchors.filter(a=>/^(webAnchor|cocoonAnchor)$/.test(a.kind))){
 const n=new T.Vector3(...a.normal),p=new T.Vector3(origin.x+a.x,origin.y+a.y,origin.z+a.z);
 const ray=new T.Raycaster(p.clone().addScaledVector(n,.08),n.clone().negate(),0,.17);
 assert(ray.intersectObjects(built.widow.surfaces).some(h=>h.point.distanceTo(p)<.01),'Detached silk '+JSON.stringify(a));
}
const stairs=built.widow.colliders.filter(c=>c.kind==='ramp');
for(const b of stairs){
 const lo=b.z-b.direction*b.d/2,hi=b.z+b.direction*b.d/2;
 walk([{x:b.x,y:b.y,z:lo},{x:b.x,y:b.y+b.h,z:hi},{x:b.x,y:b.y+b.h,z:hi+b.direction},{x:origin.x-27,y:b.y+b.h,z:hi+b.direction}]);
 // Rendering has physical treads beneath the support ramp, not empty space.
 const ray=new T.Raycaster(new T.Vector3(b.x,b.y+20,b.z),new T.Vector3(0,-1,0));
 const hits=ray.intersectObject(art,true);assert(hits.some(h=>h.object.name==='timber'&&Math.abs(h.point.y-rampHeight(b,b.x,b.z))<.3));
}
const p=(x,z,y=0)=>({x:origin.x+x,y:origin.y+y,z:origin.z+z});
for(const path of [[p(-6,32),p(-6,20),p(-5,6),p(-3,-30),p(-3,-39)],[p(-43,12),p(-35,12)],[p(35,12),p(43,12)],[p(-27,-14),p(-27,8)]])walk(path);
assert(!index.canMove(p(37,0),p(44,0)), 'New rock walls must block movement');
assert(!index.canMove(p(-27,0,12),p(-21,0,12)), 'Gallery rails must block falls through timber');
for(const item of [...L.authoredSpawns,...L.chests].filter(s=>s.room===7||s.gx===L.rooms[7].cx&&s.gz===L.rooms[7].cz-3)){
 const pos=worldOf(L,item.gx,item.gz);assert(!createCollisionIndex(built.widow.colliders).at(pos.x,mineHeight(pos.z)+.04,pos.z,.4,2),'Spawn/treasure in a fixture '+JSON.stringify({item,body:index.at(pos.x,mineHeight(pos.z)+.04,pos.z,.4,2)}));
}
// The real mine picker includes the new visible stone, but excludes wood/iron.
for(const [start,dir]of [[p(0,0,2),[0,-1,0]],[p(0,0,3),[0,1,0]],[p(0,0,3),[1,0,0]]]){
 const ray=new T.Raycaster(new T.Vector3(start.x,start.y,start.z),new T.Vector3(...dir));
 const hit=built.mine.pick(ray);assert(hit?.kind==='mineSurface',JSON.stringify({start,dir}));assert(Number.isFinite(hit.claim.point.x));assert(Math.abs(hit.normal.length()-1)<.001);
 assert(built.widow.surfaces.some(m=>ray.intersectObject(m).length));
}
assert(built.widow.surfaces.every(m=>m.name==='ground'||m.name.startsWith('stone_')));
const cage=art.getObjectByName('cage_iron'),y=cage.position.y;built.update(.1,p(0,0));assert.notEqual(cage.position.y,y);
let predicate,unregistered=false;const runtime={inDungeon:false,dungeonScene:built};
const release=bindMineSceneEffects({addEffectSource(fn){predicate=fn;return()=>unregistered=true;}},runtime);
assert.equal(predicate(),false);runtime.inDungeon=true;assert.equal(predicate(),true);built.update(.1,{x:1000,z:1000});assert.equal(predicate(),false);built.update(.1,p(0,0));assert.equal(predicate(),true);release();assert(unregistered);
const second=make();assert(await second.built.ready);const other=second.built.widow.group.getObjectByName('timber');assert.notEqual(other.material,art.getObjectByName('timber').material);
let geometryDisposals=0;asset.scene.traverse(o=>o.geometry?.addEventListener('dispose',()=>geometryDisposals++));
built.dispose();built.dispose();assert.equal(geometryDisposals,0);assert.equal(second.built.widow.group.getObjectByName('timber'),other);second.built.dispose();assert.equal(geometryDisposals,0);
const warn=console.warn;console.warn=()=>{};const failed=make(async()=>{throw Error('offline control');});assert.equal(await failed.built.ready,false);console.warn=warn;
assert(failed.built.widow.group.children.some(g=>g.children.length>=6),'Stair fallback survives failed asset');failed.built.dispose();
let finish;const late=make(()=>new Promise(r=>finish=r));await Promise.resolve();late.built.dispose();finish(asset);assert.equal(await late.built.ready,false);assert(!late.built.widow.loaded);
asset.scene.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
console.log('WIDOW_RUNTIME_VERIFIED',JSON.stringify({steps,flights:stairs.length,checks:'full stairs/landings, ground routes, mining, cage, independent materials, offline and late-load cleanup'}));
