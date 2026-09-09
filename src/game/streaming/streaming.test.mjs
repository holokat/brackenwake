import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorkQueue} from './work_queue.js';
import {createAssetCache} from './asset_cache.js';
import {createSpatialStream} from './spatial_stream.js';
import {prepareRoom, disposeGltf} from './gltf_assets.js';
import * as T from 'three';
const turn = () => new Promise(resolve=>setTimeout(resolve,0));
const immediate = {run: fn => Promise.resolve().then(fn)};

test('main-thread work respects priority, cancellation and slice limits', async()=>{
  const frames=[],calls=[];let time=0;
  const queue=createWorkQueue({schedule:fn=>frames.push(fn),now:()=>time,budgetMs:2,maxJobs:2});
  const controller=new AbortController();
  const cancelled=queue.run(()=>calls.push('cancelled'),{signal:controller.signal,priority:9});controller.abort();
  const a=queue.run(()=>{calls.push('background');time+=1;},{priority:0});
  const b=queue.run(()=>{calls.push('visible');time+=3;},{priority:3});
  assert.deepEqual(calls,[]);frames.shift()();assert.deepEqual(calls,['visible']);assert.equal(frames.length,1);
  frames.shift()();await Promise.all([a,b,cancelled]);assert.deepEqual(calls,['visible','background']);
  assert.equal(queue.stats.overruns,1);assert.equal(queue.stats.cancelled,1);
});
test('prefetch downloads bytes without decoding; arrival reuses them and concurrent leases',async()=>{
  const fetched=[],decoded=[],disposed=[];
  const pool=createAssetCache({fetchBytes:async url=>{fetched.push(url);return new ArrayBuffer(8);},decode:async(_,url)=>{decoded.push(url);return {url};},dispose:a=>disposed.push(a.url),work:immediate});
  pool.prefetch('next');await turn();assert.deepEqual(fetched,['next']);assert.deepEqual(decoded,[]);
  const a=pool.acquire('next'),b=pool.acquire('next');assert.equal(await a.promise,await b.promise);assert.deepEqual(decoded,['next']);
  a.release();a.release();pool.clearUnused();assert.deepEqual(disposed,[]);b.release();pool.clearUnused();assert.deepEqual(disposed,['next']);
});
test('visible requests retain a network slot, abandoned prefetch cancels, and decoding is serialized',async()=>{
  const downloads=new Map(),decodeDone=[];let decoding=0,peak=0;
  const pool=createAssetCache({fetchBytes:(url,signal)=>new Promise((resolve,reject)=>{downloads.set(url,resolve);signal.addEventListener('abort',()=>reject(Error('cancelled')));}),
    decode:(_,url)=>new Promise(resolve=>{decoding++;peak=Math.max(peak,decoding);decodeDone.push(()=>{decoding--;resolve({url});});}),work:immediate});
  pool.prefetch('far');pool.prefetch('later');const visible=pool.acquire('visible');await turn();assert.deepEqual([...downloads.keys()],['far','visible']);
  downloads.get('visible')(new ArrayBuffer(8));await turn();assert.equal(peak,1);
  const next=pool.acquire('later');downloads.get('far')(new ArrayBuffer(8));await turn();downloads.get('later')(new ArrayBuffer(8));await turn();assert.equal(decodeDone.length,1);
  decodeDone.shift()();await visible.promise;await turn();assert.equal(decodeDone.length,1);decodeDone.shift()();await next.promise;assert.equal(peak,1);
  pool.cancelPrefetchExcept([]);assert.equal(pool.stats.warmBytes,8,'completed bytes survive direction changes within the cache budget');visible.release();next.release();pool.clearUnused();
});
test('warm byte and parsed asset budgets evict only unpinned resources',async()=>{
  const disposed=[];
  const pool=createAssetCache({fetchBytes:async()=>new ArrayBuffer(8),decode:async(_,url)=>({url}),dispose:a=>disposed.push(a.url),sizeOf:()=>12,work:immediate,maxWarmBytes:10,maxWarmAssets:1,maxWarmAssetBytes:12});
  pool.prefetch('a');await turn();pool.prefetch('b');await turn();assert(pool.stats.warmBytes<=10);
  const a=pool.acquire('a'),b=pool.acquire('b');await Promise.all([a.promise,b.promise]);a.release();assert.deepEqual(disposed,[]);b.release();assert.equal(disposed.length,1);assert.equal(pool.stats.warmAssets,1);
});
test('late releases, failed loads and retries cannot poison the asset cache',async()=>{
  let failures=1;
  const pool=createAssetCache({fetchBytes:async()=>{if(failures--)throw Error('offline');return new ArrayBuffer(2);},decode:async()=>({ok:true}),work:immediate});
  const a=pool.acquire('a');await assert.rejects(a.promise,/offline/);a.release();
  const b=pool.acquire('a');assert.deepEqual(await b.promise,{ok:true});b.release();pool.clearUnused();
});
test('spatial lookahead loads the approached room, keeps nearby detail and never loads a whole floor',async()=>{
  const loaded=[],unloaded=[],warm=[];
  const stream=createSpatialStream({prefetch:url=>warm.push(url),near:20,warmRadius:70,keepRadius:90,maxResidents:2,graceSeconds:1});
  for(let i=0;i<8;i++)stream.register({id:String(i),url:String(i),bounds:{x:i*100,z:0,rx:20,rz:20},load:async()=>{loaded.push(String(i));return true;},unload:()=>unloaded.push(String(i))});
  stream.update(.5,{x:0,z:0});await stream.ready();assert.deepEqual(loaded,['0']);
  stream.update(.5,{x:5,z:0});await turn();assert.deepEqual(loaded,['0','1']);assert(warm.includes('1'));
  stream.update(2,{x:220,z:0});await stream.ready();assert(loaded.includes('2'));assert(!loaded.includes('7'));assert(unloaded.includes('0'));assert(stream.stats.residents<=2);
  stream.dispose();const count=loaded.length;stream.update(1,{x:700,z:0});assert.equal(loaded.length,count);
});
test('slow/data-saving policy skips speculative requests and failed rooms retry',async()=>{
  const warm=[];let attempts=0;
  const stream=createSpatialStream({prefetch:url=>warm.push(url),canSpeculate:()=>false});
  stream.register({id:'near',url:'near',bounds:{x:0,z:0,rx:10,rz:10},load:async()=>++attempts>1});
  stream.register({id:'far',url:'far',bounds:{x:100,z:0,rx:10,rz:10},load:async()=>true});
  stream.update(1,{x:0,z:0});assert.equal(await stream.ready(),false);assert.deepEqual(warm,[]);
  stream.update(11,{x:0,z:0});assert.equal(await stream.ready(),true);stream.dispose();
});
test('staged instances reuse per-room materials, warm shaders and dispose without hurting templates',async()=>{
  const asset={scene:new T.Group()},g=new T.BoxGeometry(),m=new T.MeshStandardMaterial();
  for(let i=0;i<30;i++)asset.scene.add(new T.Mesh(g,m));
  let stages=0,compiles=0,materialDisposals=0;m.addEventListener('dispose',()=>materialDisposals++);
  const model=await prepareRoom(asset,mat=>{mat.roughness=.4;},{work:{run:fn=>{stages++;return immediate.run(fn);}},sc:{camera:{},scene:{},renderer:{compileAsync:async()=>compiles++}}});
  assert(stages>=5);assert.equal(compiles,1);assert.equal(model.materials.length,1);assert.notEqual(model.materials[0],m);assert.equal(m.roughness,1);
  model.dispose();assert.equal(materialDisposals,0);disposeGltf(asset);assert.equal(materialDisposals,1);
});

test('a slow render reduces background work to one job per frame',async()=>{
 const frames=[],calls=[];const work=createWorkQueue({schedule:fn=>frames.push(fn),now:()=>0});
 work.reportFrame(30);const a=work.run(()=>calls.push(1)),b=work.run(()=>calls.push(2));
 frames.shift()();assert.deepEqual(calls,[1]);frames.shift()();await Promise.all([a,b]);assert.deepEqual(calls,[1,2]);
});
test('disposing a room cancels its outstanding network request before any geometry can attach',async()=>{
 const {createRoomArtwork}=await import('./room_artwork.js');let aborted=false,attached=false;
 const pool=createAssetCache({work:immediate,fetchBytes:(url,signal)=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(Error('aborted'));})),decode:async()=>({})});
 const art=createRoomArtwork({id:'cancel',url:'cancel',pool,work:immediate,attach:()=>attached=true});await turn();art.dispose();
 assert.equal(await art.ready,false);assert(aborted);assert(!attached);assert.equal(pool.stats.pinned,0);
});
test('nearby effects are scheduled on approach and disposed when no longer needed',async()=>{
 const {createNearbyEffects}=await import('./nearby_effects.js');let made=0,disposed=0;
 const effects=createNearbyEffects(new T.Group(),{work:immediate,load:async()=>{made++;return{group:new T.Group(),update(){},dispose(){disposed++;this.group.removeFromParent();}};}});
 effects.add('dust',{x:300,y:0,z:0});effects.update(0,{x:0,z:0});await turn();assert.equal(made,0);
 effects.update(1,{x:250,z:0});await turn();assert.equal(made,1);effects.update(10,{x:0,z:0});assert.equal(disposed,1);effects.dispose();assert.equal(disposed,1);
});

test('abandoned queued and in-flight prefetch cancels without discarding completed warm bytes',async()=>{
 const calls=[],aborts=[];
 const pool=createAssetCache({work:immediate,fetchBytes:(url,signal)=>{
  calls.push(url);if(url==='warm')return Promise.resolve(new ArrayBuffer(8));
  return new Promise((resolve,reject)=>signal.addEventListener('abort',()=>{aborts.push(url);reject(Error('cancelled'));}));
 },decode:async()=>({})});
 pool.prefetch('warm');await turn();pool.prefetch('pending');pool.prefetch('queued');await turn();pool.cancelPrefetchExcept([]);await turn();
 assert.deepEqual(calls,['warm','pending']);assert.deepEqual(aborts,['pending']);assert.equal(pool.stats.warmBytes,8);assert.equal(pool.stats.queued,0);pool.clearUnused();
});
test('cancelling a room before its decode slice settles immediately and lets a later arrival reuse bytes',async()=>{
 const {createRoomArtwork}=await import('./room_artwork.js');const jobs=[];let fetched=0,decoded=0;
 const work={run:fn=>new Promise((resolve,reject)=>jobs.push(()=>Promise.resolve().then(fn).then(resolve,reject)))};
 const pool=createAssetCache({work,fetchBytes:async()=>{fetched++;return new ArrayBuffer(8);},decode:async()=>{decoded++;return {};}});
 const art=createRoomArtwork({id:'queued-decode',url:'room',pool,work,attach:()=>assert.fail('cancelled room attached')});
 await turn();assert.equal(jobs.length,1);art.dispose();assert.equal(await art.ready,false);assert.equal(decoded,0);assert.equal(pool.stats.pinned,0);
 await jobs.shift()();await turn();assert.equal(pool.stats.warmBytes,8);
 const arrival=pool.acquire('room');await jobs.shift()();assert(await arrival.promise);assert.equal(fetched,1);assert.equal(decoded,1);arrival.release();pool.clearUnused();
});
