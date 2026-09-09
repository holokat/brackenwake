import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {installTextureStubs} from '../../../test-glb-env.mjs';
import {createCollisionIndex} from '../../../../src/world/collision/shapes.js';
installTextureStubs();
const root=new URL('../../../../',import.meta.url),manifest=JSON.parse(await readFile(new URL('assets/models/cellars/descent/manifest.json',root),'utf8'));
assert.equal(manifest.rooms.length,10);let triangles=0,bytes=0,segments=0;
for(const spec of manifest.rooms){
 const buffer=await readFile(new URL(`assets/models/cellars/descent/${spec.id}.glb`,root)),report=JSON.parse(await readFile(new URL(`docs/art/cellars-descent/${spec.id}-build.json`,root),'utf8'));
 assert.equal(createHash('sha256').update(buffer).digest('hex'),report.sha256);assert(report.profile.gpuOnly&&report.profile.persistentData&&report.profile.gpuDenoising);
 for(const [name,hash]of Object.entries(report.sources))assert.equal(createHash('sha256').update(await readFile(new URL(name,import.meta.url))).digest('hex'),hash,`${spec.id} stale builder ${name}`);
 const asset=await new GLTFLoader().parseAsync(buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength),'');asset.scene.updateMatrixWorld(true);
 const bounds=new T.Box3().setFromObject(asset.scene);assert(bounds.max.y>spec.ceiling-.1);assert(bounds.min.y>-.5);assert(buffer.byteLength<25_000_000);
 let tri=0,meshes=0,textured=0;asset.scene.traverse(o=>{if(!o.isMesh)return;meshes++;tri+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;assert(o.geometry.attributes.normal);assert(o.material.side===T.DoubleSide);if(o.material.map){textured++;assert(o.geometry.attributes.uv);}});
 assert(tri>30000&&tri<400000);assert(meshes<24);assert(textured>=5);for(const key of ['limestone','trim','floor','ceiling','rubble']){let obj;asset.scene.traverse(o=>{if(o.material?.name==='Descent '+key)obj=o;});assert(obj?.material.map&&obj.geometry.attributes.uv,`${spec.id} ${key} texture missing`);}assert(spec.colliders.length>50);
 const index=createCollisionIndex(spec.colliders);
 for(const route of spec.routes)for(let j=1;j<route.length;j++){
  const a=route[j-1],b=route[j],n=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])*2);let previous={x:a[0],y:.05,z:a[1]};
  for(let i=1;i<=n;i++){
   const p={x:a[0]+(b[0]-a[0])*i/n,y:.05,z:a[1]+(b[1]-a[1])*i/n};
   assert(index.canMove(previous,p,.32,1.75),`${spec.id} physical path crosses ${JSON.stringify(index.at(p.x,p.y,p.z,.32,1.75))}`);
   const va=new T.Vector3(previous.x,1.4,previous.z),vb=new T.Vector3(p.x,1.4,p.z),delta=vb.clone().sub(va);
   const hits=new T.Raycaster(va,delta.clone().normalize(),0,delta.length()).intersectObject(asset.scene,true);assert.equal(hits.length,0,`${spec.id} opaque mesh crosses path at ${JSON.stringify(p)}: ${hits[0]?.object.name}`);
   previous=p;segments++;
  }
 }
 // Known solid wall must be detected by both the render and physical tests.
 const wall={x:spec.rx,y:1.4,z:spec.rz*.45};assert(index.at(wall.x,.05,wall.z,.32,1.75));assert(new T.Raycaster(new T.Vector3(wall.x-3,1.4,wall.z),new T.Vector3(1,0,0),0,5).intersectObject(asset.scene,true).length);
 console.log(spec.id,JSON.stringify({bytes:buffer.byteLength,triangles:tri,meshes,textured}));triangles+=tri;bytes+=buffer.byteLength;
 asset.scene.traverse(o=>{o.geometry?.dispose();o.material?.map?.dispose();o.material?.dispose();});
}
console.log('CELLAR_DESCENT_ASSETS_VERIFIED',JSON.stringify({assets:manifest.rooms.length,bytes,triangles,segments}));
