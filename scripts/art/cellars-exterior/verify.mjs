import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

export async function inspectExterior(){
 const bytes=await readFile(new URL('../../../public/models/props/old_cellars_entrance.glb',import.meta.url));
 assert.equal(bytes.readUInt32LE(0),0x46546c67);assert.equal(bytes.readUInt32LE(4),2);assert.equal(bytes.readUInt32LE(8),bytes.length);
 const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
 assert.ok(bytes.length<800000,'One entrance must stay below 800 kB');
 assert.equal(json.materials.length,2);assert.equal(json.meshes.length,2);
 assert.equal(json.images?.length||0,0,'Colors are geometry attributes, with no texture downloads');
 let triangles=0;
 for(const m of json.meshes)for(const p of m.primitives){
  assert.ok(p.attributes.COLOR_0!==undefined);assert.equal(p.mode??4,4);
  triangles+=json.accessors[p.indices].count/3;
 }
 assert.ok(triangles>2500&&triangles<12000);
 const emission=json.materials.find(m=>m.emissiveFactor);
 assert.ok(emission.emissiveFactor[0]>emission.emissiveFactor[1]&&emission.emissiveFactor[1]>emission.emissiveFactor[2],'Lantern emission must be amber');
 const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 gltf.scene.updateMatrixWorld(true);
 const bounds=new THREE.Box3().setFromObject(gltf.scene);
 assert.ok(Math.abs(bounds.min.x+5)<.01&&Math.abs(bounds.max.x-5)<.01);
 assert.ok(bounds.max.y>4.8&&bounds.max.y<5.1&&bounds.min.y>-.5);
 const cast=(x,y,near=0,far=3)=>new THREE.Raycaster(new THREE.Vector3(x,y,2),new THREE.Vector3(0,0,-1),near,far).intersectObject(gltf.scene,true);
 assert.ok(cast(1.8,1.4).length>0,'Positive control: masonry blocks the ray');
 for(const x of [-1,0,1])for(const y of [.75,1.75,2.3])assert.equal(cast(x,y).length,0,`Door must be open at ${x}, ${y}`);
 assert.ok(cast(0,1.75,3,7).length>0,'The tunnel has a deep dark end, not a flat black door');
 gltf.scene.traverse(o=>{if(o.isMesh){for(const a of Object.values(o.geometry.attributes))for(const n of a.array)assert.ok(Number.isFinite(n));}});
 const blend=await readFile(new URL('../../../assets/models/cellars/exterior/old-cellars-entrance.blend',import.meta.url));
 assert.ok(blend.length>50000,'Editable source exists');
 assert.ok(blend.subarray(0,7).toString()==='BLENDER'||blend.readUInt32LE(0)===0xfd2fb528||blend.readUInt16LE(0)===0x8b1f,'Recognized native Blender file');
 return{bytes:bytes.length,triangles,meshes:json.meshes.length,materials:json.materials.length,bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},blendBytes:blend.length};
}
if(process.argv[1]&&new URL(import.meta.url).pathname===process.argv[1])console.log('Cellars exterior asset verified',JSON.stringify(await inspectExterior()));
