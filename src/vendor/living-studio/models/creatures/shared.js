import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {Geometry} from '../geometry.js';

/** Per-actor material ownership; shared studio materials are never disposed. */
export class Sculpt {
 constructor(root){this.root=root;this.h=new Geometry(root);this.bone='root';this.materials=new Map();this.features=[];}
 own(mesh,bone=this.bone){
  const source=mesh.material;
  if(!this.materials.has(source)){
   const mat=source.clone();mat.name=`Creature ${source.name}`;mat.roughness=/steel|iron|metal/.test(source.name)?.42:/wet|eye/.test(mesh.name)?.3:.87;this.materials.set(source,mat);
  }
  mesh.material=this.materials.get(source);mesh.userData.creatureBone=bone;this.features.push(mesh.name);return mesh;
 }
 ico(name,p,s,m,detail=2){return this.own(this.h.ico(name,p,s,m,{sub:detail,variation:.035}));}
 cube(name,p,s,m,bevel=0){return this.own(this.h.cube(name,p,s,m,{bevel}));}
 tube(name,p,r,m,sides=8){return this.own(this.h.tube(name,p,r,m,{sides,variation:.04}));}
 mesh(name,v,f,m){return this.own(this.h.mesh(name,v,f,m,{variation:.035}));}
 loft(name,rings,m,n=12){return this.own(this.h.loft(name,rings,m,{n,variation:.03}));}
 loftY(name,rings,m,n=12){
  const vertices=[],faces=[];
  for(const[x,y,z,rx,rz]of rings)for(let k=0;k<n;k++){const a=k*Math.PI*2/n;vertices.push([x+Math.cos(a)*rx,y,z+Math.sin(a)*rz]);}
  for(let j=0;j<rings.length-1;j++)for(let k=0;k<n;k++){const a=j*n+k,b=j*n+(k+1)%n;faces.push([a,b,b+n,a+n]);}
  faces.push(Array.from({length:n},(_,k)=>n-1-k),Array.from({length:n},(_,k)=>(rings.length-1)*n+k));return this.mesh(name,vertices,faces,m);
 }
 ring(name,center,radius,tube,material,axis='y'){
  const geo=new THREE.TorusGeometry(radius,tube,5,20);if(axis==='y')geo.rotateX(Math.PI/2);if(axis==='x')geo.rotateY(Math.PI/2);geo.translate(...center);
  const mesh=new THREE.Mesh(geo,typeof material==='string'?this.h.mat(material):material);mesh.name=name;this.root.add(mesh);return this.own(mesh);
 }
}

export function createRig(root,definitions){
 const bones=[],joints={},positions={};
 for(const[name,p,parent]of definitions){const b=new THREE.Bone();b.name=name;b.position.fromArray(p);if(parent)b.position.sub(positions[parent]);(parent?joints[parent]:root).add(b);bones.push(b);joints[name]=b;positions[name]=new THREE.Vector3(...p);}
 root.updateMatrixWorld(true);const skeleton=new THREE.Skeleton(bones);skeleton.calculateInverses();
 const rest=Object.fromEntries(bones.map(b=>[b.name,{p:b.position.clone(),q:b.quaternion.clone(),s:b.scale.clone()}]));
 return {group:root,bones,joints,positions,skeleton,rest,reset(){for(const b of bones){b.position.copy(rest[b.name].p);b.quaternion.copy(rest[b.name].q);b.scale.copy(rest[b.name].s);}}};
}

/** Merge surface pieces into one weighted skin, with material groups preserved. */
export function skinSculpt(sculpt,rig){
 const geometries=[],materials=[],features=[],hasBow=sculpt.root.children.some(mesh=>mesh.name==='Bowstring');let meshCount=0;
 for(const mesh of [...sculpt.root.children]){
  if(!mesh.isMesh)continue;
  const geo=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone();const p=geo.attributes.position;
  const color=geo.attributes.color;if(!color)geo.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array(p.count*3).fill(1),3));
  for(const key of Object.keys(geo.attributes))if(!['position','normal','color'].includes(key))geo.deleteAttribute(key);
  const bone=rig.joints[mesh.userData.creatureBone];if(!bone)throw new Error(`Missing skin bone ${mesh.userData.creatureBone} for ${mesh.name}`);
  const index=rig.bones.indexOf(bone),indices=new Uint16Array(p.count*4),weights=new Float32Array(p.count*4);
  for(let i=0;i<p.count;i++){indices[i*4]=index;weights[i*4]=1;}
  geo.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(indices,4));geo.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
  if(hasBow){
   const deltas=new Float32Array(p.count*3),string=mesh.name==='Bowstring',arrow=mesh.name.startsWith('Nocked arrow');
   for(let i=0;i<p.count;i++){
    if(string){const z=p.getZ(i),weight=Math.max(0,1-Math.abs(z-3.83)/(z>3.83?1.54:1.48));deltas[i*3+1]=.84*weight;}
    if(arrow)deltas[i*3+1]=.84;
   }
   const morph=new THREE.Float32BufferAttribute(deltas,3);morph.name='Bow draw';geo.morphAttributes.position=[morph];geo.morphTargetsRelative=true;
  }
  geometries.push(geo);materials.push(mesh.material);features.push(mesh.name);mesh.removeFromParent();mesh.geometry.dispose();meshCount++;
 }
 const buckets=new Map();for(let i=0;i<geometries.length;i++){if(!buckets.has(materials[i]))buckets.set(materials[i],[]);buckets.get(materials[i]).push(geometries[i]);}
 const batches=[...buckets.values()].map(batch=>mergeGeometries(batch,false));
 const merged=mergeGeometries(batches,true);if(!merged)throw new Error('Creature geometry merge failed');for(const geo of [...geometries,...batches])geo.dispose();
 const skin=new THREE.SkinnedMesh(merged,[...buckets.keys()]);skin.name='Creature skin';skin.castShadow=true;skin.receiveShadow=true;skin.frustumCulled=false;sculpt.root.add(skin);skin.bind(rig.skeleton);
 skin.userData.features=features;skin.userData.sourcePieces=meshCount;return skin;
}

export const pulse=(t,a=0,b=1)=>t<a||t>b?0:Math.sin(Math.PI*(t-a)/(b-a));
export const ease=t=>{t=THREE.MathUtils.clamp(t,0,1);return t*t*(3-2*t);};
export const loopMotions=new Set(['idle','walk','run','lope','scurry','crawl','fly','hover','drift','circle','flee','swim','hop','climb']);

/** Conservative support bounds are baked into root tracks, so exported clips also stay above the floor. */
function supportSampler(rig){
 const boxes=rig.bones.map(()=>new THREE.Box3()),point=new THREE.Vector3();
 rig.group.updateMatrixWorld(true);rig.skeleton.update();
 rig.group.traverse(mesh=>{
  if(!mesh.isSkinnedMesh)return;const p=mesh.geometry.attributes.position,indices=mesh.geometry.attributes.skinIndex;
  for(let i=0;i<p.count;i++){const bone=indices.getX(i);point.fromBufferAttribute(p,i).applyMatrix4(rig.skeleton.boneInverses[bone]);boxes[bone].expandByPoint(point);}
 });
 const corners=boxes.map(box=>box.isEmpty()?[]:Array.from({length:8},(_,i)=>new THREE.Vector3(i&1?box.max.x:box.min.x,i&2?box.max.y:box.min.y,i&4?box.max.z:box.min.z)));
 const axis=rig.upAxis||(rig.joints.hips&&rig.rest.hips.p.z>3?'z':'y'),root=rig.joints.root??rig.joints.hips;
 return ()=>{
  rig.group.updateMatrixWorld(true);let floor=Infinity;
  for(let i=0;i<corners.length;i++)for(const corner of corners[i])floor=Math.min(floor,point.copy(corner).applyMatrix4(rig.bones[i].matrixWorld)[axis]);
  if(Number.isFinite(floor)&&floor<0)root.position[axis]-=floor;
 };
}

export function bakeClips(rig,definitions,pose){
 const clips=[],ground=supportSampler(rig);
 for(const[name,duration]of definitions){
  const count=Math.max(24,Math.ceil(duration*24)),times=[],values=rig.bones.map(()=>({position:[],quaternion:[],scale:[]}));
  for(let i=0;i<=count;i++){const t=i/count;times.push(t*duration);rig.reset();pose(name,t,duration);ground();for(let b=0;b<rig.bones.length;b++){const bone=rig.bones[b];values[b].position.push(...bone.position);values[b].quaternion.push(...bone.quaternion);values[b].scale.push(...bone.scale);}}
  const tracks=rig.bones.flatMap((bone,i)=>['position','quaternion','scale'].map(property=>new (property==='quaternion'?THREE.QuaternionKeyframeTrack:THREE.VectorKeyframeTrack)(`${bone.name}.${property}`,times,values[i][property])));
  const clip=new THREE.AnimationClip(name,duration,tracks);clip.userData={loop:loopMotions.has(name),authoredFor:rig.group.userData.rig};clips.push(clip);
 }
 rig.reset();return clips;
}

export function finishActor(group,rig,clips,entry,extra={}){
 const bindings=new Map(clips.map(clip=>[clip.name,{clip,tracks:clip.tracks.map(track=>{const parsed=THREE.PropertyBinding.parseTrackName(track.name),node=group.getObjectByName(parsed.nodeName);if(!node)throw new Error(`Missing animation node ${parsed.nodeName}`);return {target:node[parsed.propertyName],interpolant:track.createInterpolant()};})}]));
 group.name=entry.name;group.userData={...group.userData,creatureId:entry.id,rig:entry.rig,sourceUrl:entry.sourceUrl,units:'metres',upAxis:'Y',variants:extra.variants??{}};
 let disposed=false;
 const actor={group,rig,clips,...extra,update(time=0,name='idle'){
  if(disposed)throw new Error('Cannot update a disposed creature');if(!Number.isFinite(time))throw new Error('Creature time must be finite');
  const binding=bindings.get(name);if(!binding)throw new Error(`Unknown creature clip ${name}`);
  rig?.reset();let t=Math.max(0,time);if(loopMotions.has(name))t%=binding.clip.duration;else t=Math.min(t,binding.clip.duration);
  for(const{target,interpolant}of binding.tracks){const value=interpolant.evaluate(t);if(target.fromArray)target.fromArray(value);else for(let i=0;i<value.length;i++)target[i]=value[i];}
  group.updateMatrixWorld(true);rig?.skeleton.update();extra.onUpdate?.(t,name);return actor;
 },dispose(){if(disposed)return;disposed=true;const geometries=new Set(),materials=new Set();group.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);});for(const g of geometries)g.dispose();for(const m of materials)m.dispose();rig?.skeleton.dispose();group.removeFromParent();}};
 actor.update(0);return actor;
}
