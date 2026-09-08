/** Independently loads and skins the delivered GLB in the game's Three.js engine. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../..');
const asset=path.join(root,'assets/models/cellars/oram/oram.glb');
const art=path.join(root,'docs/art/old-cellars/blender/oram');
const bytes=fs.readFileSync(asset);
assert.equal(bytes.toString('ascii',0,4),'glTF');
assert.equal(bytes.readUInt32LE(4),2);
assert.equal(bytes.readUInt32LE(8),bytes.length);
const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
assert.equal(json.skins.length,1);
assert.equal(json.skins[0].joints.length,19);
assert.equal(json.materials.length,14);
function assertNoSceneExtras(data){
  assert.equal(data.cameras?.length??0,0);
  assert.equal(data.textures?.length??0,0);
  assert.equal(data.extensions?.KHR_lights_punctual,undefined);
}
assertNoSceneExtras(json);
// Positive controls prove each negative assertion rejects a contaminated export.
assert.throws(()=>assertNoSceneExtras({...json,cameras:[{}]}));
assert.throws(()=>assertNoSceneExtras({...json,textures:[{}]}));
assert.throws(()=>assertNoSceneExtras({...json,extensions:{KHR_lights_punctual:{lights:[{}]}}}));
assert.ok(bytes.length<2_000_000,'Geometry and clips stay below the boss asset budget');
const expected=['attack','cast','die','hurt','idle','run','special','walk'];
assert.deepEqual(json.animations.map(a=>a.name).sort(),expected);
for(const m of json.meshes) for(const p of m.primitives){
  assert.ok(p.attributes.JOINTS_0!==undefined && p.attributes.WEIGHTS_0!==undefined,'Every primitive is skinned');
  assert.ok(p.attributes.NORMAL!==undefined,'Every primitive has normals');
}
const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
const scene=gltf.scene;
let triangles=0,meshes=0;
scene.traverse(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;assert.ok(o.isSkinnedMesh);}});
assert.equal(triangles,7536);assert.equal(meshes,14);
function box(){scene.updateMatrixWorld(true);scene.traverse(o=>{if(o.isSkinnedMesh)o.skeleton.update();});return new THREE.Box3().setFromObject(scene,true);}
const bind=box();const size=bind.getSize(new THREE.Vector3());
assert.ok(Math.abs(bind.min.y)<1e-5,'Bind feet must touch Y=0');
assert.ok(Math.abs(size.y-1.9)<.002,'Authored body height is 1.90 m');
assert.ok(size.x>.9&&size.x<1.05&&size.z>.35&&size.z<.5,'Width/depth verify the Y-up conversion');
const mixer=new THREE.AnimationMixer(scene),results={},violations=[];
for(const clip of gltf.animations){
  mixer.stopAllAction();const action=mixer.clipAction(clip);action.reset().setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();
  let minY=Infinity,maxY=-Infinity,maxRootXZ=0;
  const stepCount=Math.ceil(clip.duration*60);
  for(let i=0;i<=stepCount;i++){
    mixer.setTime(clip.duration*i/stepCount);const b=box();
    minY=Math.min(minY,b.min.y);maxY=Math.max(maxY,b.max.y);
    const hips=scene.getObjectByName('hips');
    assert.ok(hips,'Runtime torso anchor exists');
    maxRootXZ=Math.max(maxRootXZ,Math.hypot(hips.position.x,hips.position.z));
    assert.ok(Number.isFinite(b.min.x)&&Number.isFinite(b.max.z));
  }
  const end=box();
  if(minY<-.004)violations.push(`${clip.name} penetrates floor by ${minY} m`);
  assert.ok(clip.duration>.3&&clip.duration<3,`${clip.name} has an invalid duration`);
  const moves=clip.tracks.some(t=>t.name.endsWith('.quaternion')&&Array.from(t.values).some((v,i)=>i>=4&&Math.abs(v-t.values[i%4])>1e-4));
  assert.ok(moves,`${clip.name} must contain motion`);
  if(clip.name==='attack')assert.ok(maxY>2.3,'Sword must rise during windup');
  if(clip.name==='die')assert.ok(end.max.y<.46&&end.min.y>-.004,'Corpse settles on the floor');
  results[clip.name]={seconds:clip.duration,minY,maxY,endMinY:end.min.y,endMaxY:end.max.y,samples:stepCount+1};
}
assert.equal(violations.length,0,violations.join('; '));
mixer.stopAllAction();
const sha=crypto.createHash('sha256').update(bytes).digest('hex');
const build=JSON.parse(fs.readFileSync(path.join(art,'build-report.json')));
assert.equal(build.glbSha256,sha,'Build report matches the delivered asset');
const output={glbSha256:sha,engine:'Three.js GLTFLoader and AnimationMixer',fileBytes:bytes.length,triangles,meshes,joints:19,bindBounds:{min:bind.min.toArray(),max:bind.max.toArray(),size:size.toArray()},clips:results};
if(process.argv.includes('--record'))fs.writeFileSync(path.join(art,'runtime-validation.json'),JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify(output,null,2));
console.log('ORAM_ASSET_VERIFIED');
