import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {Sculpt,skinSculpt} from './shared.js';
import {buildWeapons} from './weapons.js';
import {gripPoint,mountGrip} from '../equipment-grips.js';
import {buildShieldFittings} from '../items/shield-fittings.js';

const scale=.76;
const weaponAnchor=new THREE.Vector3(1.64,-.36,3.83);
const shieldAnchor=new THREE.Vector3(-1.66,-.52,4);
const chestAnchor=new THREE.Vector3(0,0,5.8);

/** Retain the creature weapons, fitted around the same rigid palms as the NPC base. */
export function addChibiCreatureWeapons(rig,look){
 const root=new THREE.Group(),sculpt=new Sculpt(root);
 buildWeapons(sculpt,look);
 const grips=[];
 if(look.weapon!=='bow'){
  const marker=new THREE.Group();marker.name='Creature weapon socket';marker.userData.itemId=['shield','buckler'].includes(look.weapon)?'shortsword':look.weapon;
  marker.userData.slot='weapon';mountGrip(rig,marker,'R');grips.push(marker);
 }
 if(['shield','buckler'].includes(look.weapon)){
  const parts=new Set(root.children),offset=buildShieldFittings(sculpt.h,look.weapon==='buckler'?'buckler':'tower');
  for(const mesh of root.children){
   if(parts.has(mesh)){if(mesh.userData.creatureBone==='handL')mesh.geometry.translate(...offset);}
   else{mesh.geometry.translate(shieldAnchor.x+offset[0],shieldAnchor.y+offset[1],shieldAnchor.z+offset[2]);sculpt.own(mesh,'handL');}
  }
  const marker=new THREE.Group();marker.name='Creature shield socket';marker.userData.itemId=look.weapon==='buckler'?'buckler':'tower';marker.userData.slot='offhand';
  mountGrip(rig,marker,'L','shield');grips.push(marker);
 }
 rig.group.userData.loadout=grips;
 if(look.weapon==='bow')for(const mesh of root.children){
  // The arrow and the string meet at the same nock height.
  if(mesh.name.startsWith('Nocked arrow'))mesh.geometry.translate(0,0,-.10);
 }
 const skin=skinSculpt(sculpt,rig),p=skin.geometry.attributes.position,indices=skin.geometry.attributes.skinIndex;
 const anchors={handR:weaponAnchor,handL:shieldAnchor,chest:chestAnchor};
 for(let i=0;i<p.count;i++){
  const sourceBone=rig.bones[indices.getX(i)].name,origin=anchors[sourceBone];
  const bone=look.weapon==='bow'&&sourceBone==='handR'?'handL':sourceBone;
  if(bone!==sourceBone)indices.setX(i,rig.bones.indexOf(rig.joints[bone]));
  if(!origin)throw new Error(`Missing chibi weapon anchor ${bone}`);
  const destination=rig.positions[bone].clone();
  if(bone.startsWith('hand'))destination.add(gripPoint(rig,bone.at(-1)));
  const point=new THREE.Vector3().fromBufferAttribute(p,i).sub(origin).multiplyScalar(scale);
  const socket=grips.find(marker=>marker.userData.mountedHand===bone.at(-1));
  if(socket)point.applyQuaternion(socket.quaternion);
  point.add(destination);
  p.setXYZ(i,...point);
 }
 for(const morph of skin.geometry.morphAttributes.position||[])for(let i=0;i<morph.count;i++)morph.setXYZ(i,morph.getX(i)*scale,morph.getY(i)*scale,morph.getZ(i)*scale);
 skin.geometry.computeVertexNormals();skin.geometry.computeBoundingBox();skin.geometry.computeBoundingSphere();
 rig.group.add(skin);
 return {features:sculpt.features,grips,bow:look.weapon==='bow'?{center:gripPoint(rig,'L').add(new THREE.Vector3(0,.64*scale,0)),distance:.84*scale}:null};
}

/** One owned skin with material buckets, preserving bow morphs and the shared skeleton. */
export function mergeChibiCreatureSkin(rig){
 const meshes=[];rig.group.traverse(mesh=>{if(mesh.isSkinnedMesh)meshes.push(mesh);});
 const hasMorph=meshes.some(mesh=>mesh.geometry.morphAttributes.position?.length),buckets=new Map(),features=[];
 for(const mesh of meshes){
  mesh.removeFromParent();
  if(!mesh.visible){mesh.geometry.dispose();continue;}
  const g=mesh.geometry.index?mesh.geometry.toNonIndexed():mesh.geometry.clone();
  for(const attribute of Object.keys(g.attributes))if(!['position','normal','color','skinIndex','skinWeight'].includes(attribute))g.deleteAttribute(attribute);
  if(!g.attributes.color)g.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count*3).fill(1),3));
  if(hasMorph&&!g.morphAttributes.position?.length)g.morphAttributes.position=[new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count*3),3)];
  g.morphTargetsRelative=hasMorph;
  const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
  const groups=g.groups.length?g.groups:[{start:0,count:g.attributes.position.count,materialIndex:0}];
  for(const group of groups){
   const piece=new THREE.BufferGeometry();
   for(const[key,a]of Object.entries(g.attributes))piece.setAttribute(key,new THREE.BufferAttribute(a.array.slice(group.start*a.itemSize,(group.start+group.count)*a.itemSize),a.itemSize,a.normalized));
   if(hasMorph)piece.morphAttributes.position=g.morphAttributes.position.map(a=>new THREE.Float32BufferAttribute(a.array.slice(group.start*3,(group.start+group.count)*3),3));
   piece.morphTargetsRelative=hasMorph;
   const material=materials[group.materialIndex];if(!buckets.has(material))buckets.set(material,[]);buckets.get(material).push(piece);
  }
  features.push(...(mesh.userData.features||[mesh.name]));g.dispose();mesh.geometry.dispose();
 }
 const batches=[...buckets.values()].map(parts=>{
  const batch=mergeGeometries(parts,false);batch.morphTargetsRelative=hasMorph;return batch;
 }),geometry=mergeGeometries(batches,true);
 if(!geometry)throw new Error('Chibi creature skin merge failed');
 // The bundled merge utility does not retain this flag. Zero deltas must
 // preserve the body, rather than collapse it to absolute zero during draw.
 geometry.morphTargetsRelative=hasMorph;
 for(const parts of buckets.values())for(const part of parts)part.dispose();for(const batch of batches)batch.dispose();
 const originals=new Set(meshes.flatMap(mesh=>Array.isArray(mesh.material)?mesh.material:[mesh.material]));
 for(const material of originals)if(!buckets.has(material))material.dispose();
 geometry.computeBoundingBox();geometry.computeBoundingSphere();
 const skin=new THREE.SkinnedMesh(geometry,[...buckets.keys()]);skin.name='Creature skin';skin.castShadow=true;skin.receiveShadow=true;skin.frustumCulled=false;
 rig.group.add(skin);skin.bind(rig.skeleton);skin.userData.features=features;
 return {skin,features};
}
