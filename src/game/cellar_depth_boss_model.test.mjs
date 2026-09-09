import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as T from 'three';
import { CELLAR_BOSSES } from '../mmo/cellar_bosses.js';
import { buildCellarDepthBoss, CELLAR_BOSS_MODEL_IDS } from './cellar_depth_boss_model.js';
import { buildMonsterModel, monsterModelPlan, monsterModelIds } from './monster_models.js';
import { loadModel, urlFor } from './models.js';
import { installNodeImages } from '../../tools/blender/cellars/depth-bosses/load-asset.mjs';
installNodeImages();
const originalFetch=globalThis.fetch;
let rejected=null,delay=null;
globalThis.fetch=async (request,options)=>{
  const url=typeof request==='string'?request:request.url;
  if(!url.startsWith('file:'))return originalFetch(request,options);
  if(url===rejected)throw new Error('Expected asset failure control');
  if(delay&&url===delay.url)await delay.promise;
  return new Response(await readFile(new URL(url)),{headers:{'content-type':'model/gltf-binary'}});
};
function fallback(){
  const group=new T.Group(),mesh=new T.Mesh(new T.BoxGeometry(1,2,1),new T.MeshBasicMaterial());mesh.position.y=1;group.add(mesh);
  const ref={group,parts:{root:group},height:2,silhouette:2,disposeCount:0,setAnim(){},update(){},dispose(){ref.disposeCount++;mesh.geometry.dispose();mesh.material.dispose();group.removeFromParent();}};return ref;
}
assert.equal(buildCellarDepthBoss('giantRat',()=>{throw Error('Must not construct unrelated fallback');}),null);
let resume;const waiting=fallback();delay={url:urlFor(CELLAR_BOSS_MODEL_IDS.morvaOssuaryMother),promise:new Promise(resolve=>{resume=resolve;})};
const cancelled=buildCellarDepthBoss('morvaOssuaryMother',()=>waiting);let hitDisposals=0;cancelled.parts.hit.geometry.addEventListener('dispose',()=>hitDisposals++);
cancelled.dispose();cancelled.dispose();assert.equal(waiting.disposeCount,1);assert.equal(hitDisposals,1);
resume();await cancelled.ready;assert.equal(cancelled.loaded,false);assert.equal(cancelled.group.children.length,0);delay=null;
const failedFallback=fallback();rejected=urlFor(CELLAR_BOSS_MODEL_IDS.sextonBellkeeper);
const originalWarn=console.warn;let expectedWarnings=0;console.warn=()=>expectedWarnings++;
const failed=buildCellarDepthBoss('sextonBellkeeper',()=>failedFallback);await failed.ready;console.warn=originalWarn;assert(expectedWarnings>0);assert.equal(failed.loaded,false);assert(failed.group.children.includes(failedFallback.group));failed.dispose();assert.equal(failedFallback.disposeCount,1);rejected=null;
for(const boss of CELLAR_BOSSES){
  const id=CELLAR_BOSS_MODEL_IDS[boss.id];await loadModel(id);
  assert(monsterModelIds().includes(id));assert.equal(monsterModelPlan().find(row=>row.id===boss.id).model,id);
  const rig=buildMonsterModel(boss.id);await rig.ready;assert(rig.loaded);assert.equal(rig.monster,boss.id);assert.equal(rig.height,boss.height);assert.equal(rig.silhouette,boss.height);
  assert(rig.radius>0&&rig.clickRadius>=rig.radius);assert.equal(rig.clickHeight,boss.height);assert.equal(rig.parts.hit.geometry.parameters.height,boss.height);assert.equal(rig.parts.hit.position.y,boss.height/2);
  const materialEvents=[],skeletons=new Set();let meshCount=0,ownedDispose=0,sharedDispose=0;
  rig.group.traverse(o=>{if(o.isSkinnedMesh){meshCount++;assert(o.material.map);materialEvents.push(o.material);o.material.addEventListener('dispose',()=>ownedDispose++);o.geometry.addEventListener('dispose',()=>sharedDispose++);skeletons.add(o.skeleton);}});
  assert(meshCount>=5&&meshCount<=10);
  const head=rig.group.getObjectByName('head');assert(head?.isBone);
  for(const anim of ['walk','run','swing','cast','hurt','air']){
    rig.setAnim('idle');for(let i=0;i<30;i++)rig.update(.05,0);const before=head.quaternion.clone();rig.setAnim(anim);for(let i=0;i<5;i++)rig.update(.05,3);
    assert.equal(rig.anim,anim);assert(head.quaternion.angleTo(before)>1e-5,`${boss.id}/${anim} moves the actual loaded skeleton`);
  }
  rig.setAnim('die');for(let i=0;i<70;i++)rig.update(.05,0);assert(rig.dieDone);rig.setAnim('walk');assert.equal(rig.anim,'die');
  let envelopeDisposals=0;rig.parts.hit.geometry.addEventListener('dispose',()=>envelopeDisposals++);
  for(const sk of skeletons){sk.computeBoneTexture();sk.boneTexture.addEventListener('dispose',()=>{sk.__disposedTexture=true;});}
  rig.dispose();rig.dispose();assert.equal(envelopeDisposals,1);assert.equal(ownedDispose,materialEvents.length);assert.equal(sharedDispose,0);assert.equal(rig.group.children.length,0);for(const sk of skeletons)assert(sk.__disposedTexture);
  const sibling=buildCellarDepthBoss(boss.id,()=>{throw Error('Cached model must avoid fallback allocation');});assert(sibling.loaded);sibling.dispose();
}
globalThis.fetch=originalFetch;
console.log('CELLAR_BOSS_MODELS_VERIFIED');
