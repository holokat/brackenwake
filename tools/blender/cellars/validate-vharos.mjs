import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
const base=new URL('../../../',import.meta.url),file=new URL('assets/models/cellars/vharos.glb',base);
const bytes=readFileSync(file);assert.equal(bytes.toString('utf8',0,4),'glTF');assert.equal(bytes.readUInt32LE(4),2);assert(bytes.length<5*1024*1024);
const doc=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)));
assert.equal(doc.skins.length,1);assert(!doc.cameras?.length);assert(!doc.images?.length);assert(!doc.extensionsUsed?.includes('KHR_lights_punctual'));
for(const b of doc.buffers)assert(!b.uri,'embedded GLB buffers only');
const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
gltf.scene.updateMatrixWorld(true);let triangles=0,skinned=0;
gltf.scene.traverse(o=>{if(!o.isMesh)return;assert(o.isSkinnedMesh,'all boss parts follow its rig');skinned++;triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;const w=o.geometry.attributes.skinWeight;for(let i=0;i<w.count;i++)assert(Math.abs(w.getX(i)+w.getY(i)+w.getZ(i)+w.getW(i)-1)<.001);});
assert(triangles>4000&&triangles<30000);assert(skinned<=10);
const bounds=new T.Box3().setFromObject(gltf.scene),size=bounds.getSize(new T.Vector3());assert(size.y>36&&size.y<40);assert(bounds.min.y>-.05&&bounds.min.y<.3);
const expected={idle:4,gravesurge:5.6,funeralcross:6.1,hollowstar:6.4,tombfall:5.4,hurt:.7,die:8};const mixer=new T.AnimationMixer(gltf.scene);const report={bytes:bytes.length,triangles,skinned,dimensions:size.toArray(),ground:bounds.min.y,clips:{}};
for(const [name,duration]of Object.entries(expected)){
 const clip=T.AnimationClip.findByName(gltf.animations,name);assert(clip,name+' is missing');assert(clip.tracks.length>=30);assert(Math.abs(clip.duration-duration)<.04);
 const a=mixer.clipAction(clip);a.setLoop(T.LoopOnce,1);a.clampWhenFinished=true;a.play();let floor=Infinity,max=0;
 for(let t=0;t<=duration+.001;t+=1/15){mixer.setTime(t);gltf.scene.updateMatrixWorld(true);gltf.scene.traverse(o=>{if(o.isSkinnedMesh){o.computeBoundingBox();const b=o.boundingBox.clone().applyMatrix4(o.matrixWorld);floor=Math.min(floor,b.min.y);max=Math.max(max,b.max.y);assert([...b.min.toArray(),...b.max.toArray()].every(Number.isFinite));}});}
 assert(floor>-.1,name+' sinks below floor: '+floor);report.clips[name]={duration:clip.duration,lowest:floor,highest:max};mixer.stopAllAction();
}
for(const f of ['tools/blender/cellars/build_vharos.py','tools/blender/cellars/vharos_animation.py','docs/art/old-cellars/blender/vharos.blend','docs/art/old-cellars/references/08-vharos-turnaround.png'])assert(existsSync(new URL(f,base)));
writeFileSync(new URL('docs/art/old-cellars/blender/vharos-export-validation.json',base),JSON.stringify(report,null,2));
console.log('VHAROS_ASSET_VERIFIED',JSON.stringify(report));
