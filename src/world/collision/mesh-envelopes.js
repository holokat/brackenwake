import * as THREE from 'three';
import {propColliders} from './shapes.js';
/** Preserve physical parts before older site builders merge them by material. */
export function meshEnvelopes(root){
 const bodies=[],box=new THREE.Box3(),center=new THREE.Vector3(),size=new THREE.Vector3(),rotation=new THREE.Quaternion(),scale=new THREE.Vector3(),position=new THREE.Vector3(),euler=new THREE.Euler(0,0,0,'YXZ');
 root.updateWorldMatrix(true,true);
 root.traverse(mesh=>{
  if(!mesh.isMesh||mesh.isInstancedMesh||!mesh.geometry||mesh.userData.collision===false)return;
  for(let p=mesh;p;p=p.parent)if(!p.visible)return;
  const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
  if(materials.every(m=>m.transparent&&m.opacity<.6)||['PlaneGeometry','CircleGeometry','RingGeometry'].includes(mesh.geometry.type))return;
  if(/banner|flag|water|flame|smoke|ground|road|street|grass|leaf|flower/i.test(mesh.name))return;
  mesh.geometry.computeBoundingBox();box.copy(mesh.geometry.boundingBox);if(box.isEmpty())return;
  mesh.matrixWorld.decompose(position,rotation,scale);euler.setFromQuaternion(rotation);
  let yaw=euler.y;
  if(Math.abs(euler.x)+Math.abs(euler.z)>.01){box.applyMatrix4(mesh.matrixWorld);box.getCenter(center);box.getSize(size);yaw=0;}
  else{box.getCenter(center).applyMatrix4(mesh.matrixWorld);box.getSize(size).multiply(scale).set(Math.abs(size.x),Math.abs(size.y),Math.abs(size.z));}
  if(size.y<.28||Math.min(size.x,size.z)<.025)return;
  const model=mesh.geometry.type==='TorusGeometry'&&mesh.geometry.parameters.arc<=Math.PI+.01?'cellar_arch':mesh.name||mesh.geometry.type;
  bodies.push(...propColliders(model,center.x,center.z,center.y-size.y/2,size.x,size.z,size.y,yaw));
 });return bodies;
}
