import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {readFile} from 'node:fs/promises';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createOldCellars} from './old_cellars.js';
import {furnishCellarDescent} from './cellar_descent.js';
import {createCellarAssetStream} from './cellar_asset_stream.js';
import {createSpatialStream} from '../game/streaming/spatial_stream.js';
import {createAssetCache} from '../game/streaming/asset_cache.js';
import {createCellarRoomProxy} from './cellar_room_proxy.js';
import {cutCellarGeologyStaged} from './cellar_geometry_jobs.js';
import {CELLAR_ASSETS,cellarArrivalAsset} from './cellar_asset_catalog.js';
import {installTextureStubs} from '../../tools/test-glb-env.mjs';
installTextureStubs();
const immediate={run:fn=>Promise.resolve().then(fn)};
const turn=()=>new Promise(resolve=>setTimeout(resolve,0));

test('approaching stairs warms only the next arrival asset and cancels it when walking away',()=>{
 const prefetch=[],cancel=[];
 const pool={prefetch:url=>prefetch.push(url),cancelPrefetchExcept:urls=>cancel.push(urls),stats:{}};
 const stream=createCellarAssetStream({level:1},{entrancePos:{x:0,z:0},stairPos:{x:300,z:0}},{pool,canSpeculate:()=>true});
 stream.update(1,{x:0,z:0});assert.equal(prefetch.length,0);
 stream.update(1,{x:280,z:0});assert.deepEqual(prefetch,[CELLAR_ASSETS['regular-crypt']]);
 stream.update(1,{x:150,z:0});assert.deepEqual(cancel.at(-1),[]);
 assert.equal(cellarArrivalAsset(9),null);assert.equal(cellarArrivalAsset(8),CELLAR_ASSETS['room-8']);stream.dispose();
});
test('a floor handoff reuses completed and in-flight stair prefetch through old-scene disposal',async()=>{
 for(const completed of [false,true]){
  let finish,fetches=0,aborted=false,decoded=0;
  const pool=createAssetCache({work:immediate,fetchBytes:(url,signal)=>{fetches++;return new Promise((resolve,reject)=>{finish=()=>resolve(new ArrayBuffer(8));signal.addEventListener('abort',()=>{aborted=true;reject(Error('aborted'));});});},decode:async()=>{decoded++;return {};}});
  const source=createCellarAssetStream({level:1},{stairPos:{x:300,z:0}},{pool,canSpeculate:()=>true});
  source.update(1,{x:280,z:0});await turn();if(completed){finish();await turn();}assert.equal(decoded,0);
  // The runtime claims the destination before disposing the old scene.
  const handoff=source.claimArrival(2,'down');source.dispose();
  const destination=createCellarAssetStream({level:2},{},{pool,canSpeculate:()=>false});let live;
  destination.register({id:'arrival',url:CELLAR_ASSETS['regular-crypt'],bounds:{x:0,z:0,rx:10,rz:10},load:async()=>{live=pool.acquire(CELLAR_ASSETS['regular-crypt']);return !!await live.promise;},unload:()=>live?.release()});
  destination.update(.016,{x:0,z:0});if(!completed)finish();assert(await destination.ready());handoff.release();
  assert.equal(fetches,1);assert.equal(decoded,1);assert.equal(aborted,false);assert.equal(pool.stats.pinned,1);
  destination.dispose();assert.equal(pool.stats.pinned,0);pool.clearUnused();
 }
});
test('complete proxies keep the floor and ceiling visible after room detail unloads',()=>{
 const proxy=createCellarRoomProxy([],[{rx:10,rz:8,ceiling:12}]);proxy.group.updateMatrixWorld(true);
 assert(new T.Raycaster(new T.Vector3(0,1,0),new T.Vector3(0,-1,0)).intersectObject(proxy.group,true).length);
 assert(new T.Raycaster(new T.Vector3(0,1,0),new T.Vector3(0,1,0)).intersectObject(proxy.group,true).length);
 proxy.dispose();proxy.dispose();
});
test('geology cuts are serialized, replace all attributes atomically and release old GPU buffers',async()=>{
 const original=new T.PlaneGeometry(8,8,8,8).toNonIndexed();original.rotateX(-Math.PI/2);let disposed=0;original.addEventListener('dispose',()=>disposed++);
 const mesh=new T.Mesh(original),built={parts:{floor:mesh,walls:[]}};let slices=0;
 const work={run:fn=>{slices++;assert.equal(mesh.geometry.attributes.position.count,mesh.geometry.attributes.normal.count);return immediate.run(fn);}};
 await Promise.all([cutCellarGeologyStaged(built,(x,z)=>x<0,{work}),cutCellarGeologyStaged(built,(x,z)=>z<0,{work})]);
 const p=mesh.geometry.attributes.position;for(let i=0;i<p.count;i++)assert(p.getX(i)>=0&&p.getZ(i)>=0);
 assert.equal(disposed,1);assert(slices>4);mesh.geometry.dispose();
});
test('real descent GLB loads on approach, preserves collision and reinstates a floor on eviction',async()=>{
 const L=createOldCellars(7,{id:'oldcellars'},2);L.descent=L.descent.filter(r=>[0,9].includes(r.roomId));
 const built={group:new T.Group(),physicalBodies:[],parts:{walls:[]},exits:[]},calls=[];
 const stream=createSpatialStream({near:20,warmRadius:40,keepRadius:60,graceSeconds:0,maxResidents:1});
 const art=furnishCellarDescent(built,L,{stream,load:async id=>{
  calls.push(id);const bytes=await readFile(new URL(CELLAR_ASSETS[id]));return new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 }});
 assert(built.physicalBodies.length>0);assert.equal(calls.length,0);
 const first=L.descent[0];stream.update(.5,first);assert(await stream.ready());assert.equal(art.rooms[0].loaded,true);assert.deepEqual(calls,['regular-crypt']);
 stream.update(2,{x:1000,z:1000});assert.equal(art.rooms[0].loaded,false);
 built.group.updateMatrixWorld(true);const hits=new T.Raycaster(new T.Vector3(first.x,first.y+1,first.z),new T.Vector3(0,-1,0)).intersectObject(art.rooms[0].group,true);assert(hits.length,'visible floor remains after details leave');
 stream.dispose();art.dispose();assert.equal(built.group.children.length,0);
});

test('the real first-floor room registry requests only entry detail at the arrival point',async()=>{
 const {furnishCellarEntry}=await import('./cellar_entry.js');
 const {furnishBlenderCellar}=await import('./cellar_blender_room.js');
 const L=createOldCellars(1,{id:'oldcellars'},1),built={group:new T.Group(),physicalBodies:[],parts:{walls:[]},exits:[]};
 // Minimal geology for the landmark's existing synchronous pit fitter.
 built.parts.floor=new T.Mesh(new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute([],3)));
 const requested=[],stream=createSpatialStream({canSpeculate:()=>false});
 const load=id=>{requested.push(id);return Promise.resolve(null);};
 const entry=furnishCellarEntry(built,L,{stream,load:()=>load('entry')});
 const landmark=furnishBlenderCellar(built,L,{stream,load:()=>load('landmark')});
 const descent=furnishCellarDescent(built,L,{stream,load});
 assert.equal(stream.stats.registered,9);assert.equal(requested.length,0);
 stream.update(.016,{x:1,z:175});assert.equal(await stream.ready(),false,'the absent test asset is reported as absent');
 assert.deepEqual(requested,['entry']);assert.deepEqual(stream.stats.nearby,['entry']);
 stream.dispose();entry.dispose();landmark.dispose();descent.dispose();built.parts.floor.geometry.dispose();built.parts.floor.material.dispose();
});
