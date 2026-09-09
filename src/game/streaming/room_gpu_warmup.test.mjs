import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {compileRoomPrograms, prepareRoomShadows} from './room_gpu_warmup.js';
const work={run:fn=>Promise.resolve().then(fn)};
test('precompile uses final lights and HDR target without exposing either during async compilation',async()=>{
 const scene=new T.Scene(),light=new T.PointLight(),root=new T.Mesh(new T.BoxGeometry(),new T.MeshStandardMaterial());
 light.visible=false;scene.add(light);root.material.userData.spellBloom=true;
 const hdr={},original={};let target=original;const calls=[];
 const visible=root.clone(false);visible.userData.owner=visible;scene.add(visible);
 const hidden=root.clone(false);hidden.visible=false;hidden.material=new T.MeshBasicMaterial();scene.add(hidden);
 const sc={scene,camera:{},prepareEffects:()=>({composer:{renderTarget2:hdr}}),renderer:{
  getRenderTarget:()=>target,setRenderTarget:t=>target=t,
  compileAsync:(object,camera,destination)=>{calls.push({object,target,lit:light.visible,destination});return Promise.resolve().then(()=>{assert.equal(light.visible,false);assert.equal(target,original);});},
 }};
 await compileRoomPrograms(root,sc,{lights:[light],work});
 assert.equal(calls.length,4);assert(calls.every(c=>c.lit&&c.destination===scene));
 assert.deepEqual(calls.map(c=>c.target),[null,null,hdr,hdr]);
 assert.equal(calls[0].object,root);assert.equal(calls[2].object,root);
 for(const i of [1,3]){assert.equal(calls[i].object.children.length,1);assert.equal(calls[i].object.children[0].material,root.material);}
 assert.equal(visible.parent,scene);assert.equal(visible.userData.owner,visible);
 hidden.material.dispose();
 root.geometry.dispose();root.material.dispose();
});
test('failed compilation restores live lights and render target',async()=>{
 const light=new T.PointLight();light.visible=false;const original={};let target=original;
 await assert.rejects(compileRoomPrograms(new T.Group(),{scene:new T.Scene(),camera:{},renderer:{getRenderTarget:()=>target,setRenderTarget:t=>target=t,compileAsync:()=>{throw Error('shader');}}},{lights:[light],work}),/shader/);
 assert.equal(light.visible,false);assert.equal(target,original);
});
function fixture(cancel=false){
 const parent=new T.Group(),root=new T.Group(),lights=[new T.PointLight(),new T.PointLight()];
 parent.position.set(9,2,13);lights.forEach((l,i)=>{l.position.set(i,4,-3);l.visible=false;l.castShadow=true;parent.add(l);});
 const original={},controller=new AbortController();let target=original,draws=0,disposed=0;
 const renderer={shadowMap:{enabled:true,autoUpdate:false},getRenderTarget:()=>target,setRenderTarget:t=>target=t,render:(stage,camera)=>{
  draws++;assert.notEqual(target,original);assert(renderer.shadowMap.autoUpdate);assert.equal(camera.layers.mask,2**31);
  stage.updateMatrixWorld(true);const copy=stage.children.find(o=>o.isLight);assert(copy);
  assert.equal(copy.position.x,9+draws-1);assert.equal(root.matrixWorld.elements[12],9);assert(lights.every(l=>!l.visible));
  copy.shadow.map={dispose(){disposed++;}};copy.shadow.camera.far=123;
  if(cancel)controller.abort();
 }};
 return {root,parent,lights,controller,renderer,original,get target(){return target;},get draws(){return draws;},get disposed(){return disposed;}};
}
test('static shadow maps are built separately, positioned correctly and retained by the room',async()=>{
 const f=fixture();assert(await prepareRoomShadows(f.root,f.parent,f.lights,{sc:{renderer:f.renderer},work,signal:f.controller.signal}));
 assert.equal(f.draws,2);assert.equal(f.target,f.original);assert.equal(f.root.parent,null);assert.equal(f.renderer.shadowMap.autoUpdate,false);
 assert(f.lights.every(l=>l.shadow.map&&l.shadow.camera.far===123&&!l.shadow.needsUpdate));assert.equal(f.disposed,0);
});
test('cancelled warm-up releases partial maps and never installs them on live lights',async()=>{
 const f=fixture(true);assert.equal(await prepareRoomShadows(f.root,f.parent,f.lights,{sc:{renderer:f.renderer},work,signal:f.controller.signal}),false);
 assert.equal(f.draws,1);assert.equal(f.disposed,1);assert(f.lights.every(l=>!l.shadow.map));assert.equal(f.root.parent,null);assert.equal(f.target,f.original);
});

test('non-glowing rooms also warm the HDR variant when ambient effects already use the composer',async()=>{
 const targets=[],hdr={},root=new T.Group();let target=null;
 await compileRoomPrograms(root,{scene:new T.Scene(),camera:{},spellPass:{composer:{renderTarget2:hdr}},renderer:{getRenderTarget:()=>target,setRenderTarget:t=>target=t,compileAsync:async()=>targets.push(target)}},{work});
 assert.deepEqual(targets,[null,hdr]);assert.equal(target,null);
});
