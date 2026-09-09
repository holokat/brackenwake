/** Read and animate the actual Blender exports in Three.js, independently of bpy. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import * as T from 'three';
import { parseAsset, decodedImages } from './load-asset.mjs';
import { CELLAR_BOSSES } from '../../../../src/mmo/cellar_bosses.js';
const dir = new URL('../../../../assets/models/cellars/depth-bosses/', import.meta.url);
const art = new URL('../../../../docs/art/cellar-depth-bosses/', import.meta.url);
const clips = ['attack','cast','die','hurt','idle','run','special','walk'];
function clean(data) {
  assert.equal(data.cameras?.length ?? 0, 0);
  assert.equal(data.extensions?.KHR_lights_punctual, undefined);
  assert.ok(data.images.length >= 5 && data.images.length <= 10);
  assert.equal(data.textures.length,data.images.length);
  assert.equal(data.skins?.length, 1);
  assert.deepEqual(data.animations.map(a => a.name).sort(), clips);
}
function moving(clip) {
  return clip.tracks.some(t => t.name.endsWith('.quaternion') &&
    Array.from(t.values).some((v,i) => i >= 4 && Math.abs(v-t.values[i%4]) > 1e-4));
}
const results = [], hashes = new Set();
for (const boss of CELLAR_BOSSES) {
  const bytes = fs.readFileSync(new URL(`${boss.id}.glb`,dir));
  assert.equal(bytes.toString('ascii',0,4),'glTF');
  assert.equal(bytes.readUInt32LE(8),bytes.length);
  const data = JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)));
  clean(data);
  assert.throws(() => clean({...data,cameras:[{}]}));
  assert.throws(() => clean({...data,skins:[]}));
  assert.throws(() => clean({...data,animations:data.animations.slice(1)}));
  assert.ok(bytes.length < 8_000_000,'Each boss must remain within the geometry payload budget');
  assert.ok(data.meshes.length >= 5 && data.meshes.length <= 10,'Material batching limits draw calls');
  assert.ok(data.skins[0].joints.length >= 9);
  for (const mesh of data.meshes) for (const p of mesh.primitives) {
    for (const name of ['POSITION','NORMAL','JOINTS_0','WEIGHTS_0','TEXCOORD_0']) assert.ok(p.attributes[name]!==undefined,`${boss.id}: missing ${name}`);
  }
  const gltf = await parseAsset(bytes);
  const model=gltf.scene;let tris=0;
  model.traverse(o => { if (o.isMesh) {
    assert(o.isSkinnedMesh);tris+=(o.geometry.index?.count ?? o.geometry.attributes.position.count)/3;
    assert(o.material.map?.image?.width===512,'Actual packed texture decoded');
    const uv=o.geometry.attributes.uv;assert(Array.from(uv.array).every(Number.isFinite));
    const weights=o.geometry.attributes.skinWeight;
    for(let i=0;i<weights.count;i++) assert(Math.abs(weights.getX(i)+weights.getY(i)+weights.getZ(i)+weights.getW(i)-1)<1e-5);
  }});
  function box() {model.updateMatrixWorld(true);model.traverse(o=>{if(o.isSkinnedMesh)o.skeleton.update();});return new T.Box3().setFromObject(model,true);}
  const bind=box(),size=bind.getSize(new T.Vector3());
  assert(Math.abs(size.y-boss.height)<.002,`${boss.id}: authored height ${size.y}`);
  assert(Math.abs(bind.min.y)<.002,`${boss.id}: bind ground ${bind.min.y}`);
  assert(size.x>boss.height*.28&&size.x<boss.height*2,`${boss.id}: plausible width`);
  assert(size.z>boss.height*.13&&size.z<boss.height*2,`${boss.id}: plausible depth`);
  const weaponArm=model.getObjectByName('forearm_L');
  const bindWeaponZ=weaponArm?.getWorldPosition(new T.Vector3()).z;
  const mixer=new T.AnimationMixer(model),poses={};
  for (const clip of gltf.animations) {
    assert(clip.duration>.4&&clip.duration<2.5);
    assert(moving(clip),`${boss.id}/${clip.name}: static animation`);
    const frozen=clip.clone();for(const t of frozen.tracks) for(let i=t.getValueSize();i<t.values.length;i++)t.values[i]=t.values[i%t.getValueSize()];
    assert.equal(moving(frozen),false,'Motion detector rejects a frozen positive control');
    mixer.stopAllAction();const action=mixer.clipAction(clip);action.setLoop(T.LoopOnce,1);action.clampWhenFinished=true;action.play();
    let floor=Infinity,top=-Infinity;
    for(let i=0;i<=16;i++){mixer.setTime(clip.duration*i/16);const b=box();floor=Math.min(floor,b.min.y);top=Math.max(top,b.max.y);}
    const end=box();
    if(clip.name==='attack' && ['asterFirstKing','sextonBellkeeper'].includes(boss.id)){
      action.reset().play();mixer.setTime(.46);model.updateMatrixWorld(true);
      const windupZ=weaponArm.getWorldPosition(new T.Vector3()).z;
      assert(windupZ > bindWeaponZ + boss.height*.04,`${boss.id}: weapon windup must move forward into view`);
    }
    assert(floor>-.075,`${boss.id}/${clip.name}: floor penetration ${floor}`);
    if(clip.name==='die') assert(end.max.y < boss.height*(['morvaOssuaryMother','vossInvertedSaint'].includes(boss.id)?.91:.73),`${boss.id}: death must settle ${end.max.y}`);
    poses[clip.name]={seconds:clip.duration,minY:floor,maxY:top,endY:end.max.y};
  }
  mixer.stopAllAction();
  const hash=crypto.createHash('sha256').update(bytes).digest('hex');assert(!hashes.has(hash));hashes.add(hash);
  const report=JSON.parse(fs.readFileSync(new URL(`${boss.id}-build.json`,art)));
  assert.equal(report.glbSha256,hash,'Build provenance matches the actual exported bytes');
  assert.equal(report.triangles,tris);
  assert(fs.statSync(new URL(`${boss.id}.blend`,dir)).size>50_000,'Editable source retained');
  results.push({id:boss.id,sha256:hash,bytes:bytes.length,triangles:tris,drawCalls:data.meshes.length,bones:data.skins[0].joints.length,bounds:{min:bind.min.toArray(),max:bind.max.toArray(),size:size.toArray()},clips:poses});
}
if(process.argv.includes('--record'))fs.writeFileSync(new URL('runtime-validation.json',art),JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify(results.map(({id,bytes,triangles,drawCalls,bones,bounds})=>({id,bytes,triangles,drawCalls,bones,size:bounds.size}))));
console.log('CELLAR_BOSS_ASSETS_VERIFIED');
