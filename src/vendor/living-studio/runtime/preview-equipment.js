import * as THREE from 'three';
import {mountLoadout} from '../models/weapons.js';
import {poseGrip} from '../models/equipment-grips.js';
import {poseTwoHandedGrip} from '../models/two-handed-grips.js';
import {applyShieldEquipmentPose} from '../models/shield-grips.js';

export function previewLoadout(entry,type){
 if(type==='motion'){
  if(entry.id==='two-handed-strike')return {weapon:'greatsword',shield:'none'};
  if(['light-attack','heavy-attack','whirlwind','combat-idle'].includes(entry.id))return {weapon:'sword',shield:'kite'};
  return {weapon:'none',shield:'none'};
 }
 if(entry.visual.pose==='bow'||entry.id==='disengage')return {weapon:'bow',shield:'none'};
 if(entry.school==='Warrior')return {weapon:entry.id==='crushing-blow'?'greatsword':'sword',shield:entry.id==='shield-bash'?'tower':'kite'};
 if(entry.school==='Rogue'&&['backstab','shadowstep','poison-blade','expose-weakness'].includes(entry.id))return {weapon:'dagger',shield:'none'};
 return {weapon:'none',shield:'none'};
}

export function applyPreviewEquipment(actor,loadout){
 mountLoadout(actor.rig,loadout.weapon,loadout.shield);
 actor.previewEquipment=loadout.weapon==='greatsword'?'greatsword':['none','bow','staff'].includes(loadout.weapon)?'unarmed':'sword-shield';
 for(const prop of actor.group.userData.loadout||[])prop.userData.previewRest={position:prop.position.toArray(),quaternion:prop.quaternion.toArray()};
}

const rotation=new THREE.Quaternion(),parentRotation=new THREE.Quaternion();
export function previewEquipmentMode(weapon){
 if(['greatsword','battleaxe','warhammer','maul','halberd','glaive','spear','quarterstaff'].includes(weapon))return 'greatsword';
 if(['sword','longsword','shortsword','rapier','dagger','axe','mace','throwing_knives','pickaxe','smith_hammer'].includes(weapon))return 'sword-shield';
 return 'unarmed';
}
const forward=new THREE.Vector3(),up=new THREE.Vector3(),right=new THREE.Vector3(),matrix=new THREE.Matrix4();
export function posePreviewEquipment(actor,motion){
 for(const prop of actor.group.userData.loadout||[]){
  if(prop.userData.gripSocket?.kind==='shield')continue;
  if(prop.userData.twoHandedGrip){
   const sample=motion.currentSample;
   poseTwoHandedGrip(actor.rig,prop,{move:sample?.abilityPose==='bow'?'bow-shot':sample?.moveId,phase:sample?.abilityId?sample.actionPhase:sample?.phase,abilityId:sample?.abilityId,abilityFamily:sample?.abilityFamily});continue;
  }
  if(['bow','shortbow','longbow'].includes(prop.name)){
   actor.rig.joints.handL.getWorldPosition(forward);actor.rig.joints.handR.getWorldPosition(right);forward.sub(right).normalize();
   up.set(0,0,1);up.addScaledVector(forward,-up.dot(forward)).normalize();right.crossVectors(up,forward).normalize();
   matrix.makeBasis(forward,right,up);rotation.setFromRotationMatrix(matrix);
  }else if(['sword','longsword','shortsword','greatsword','dagger','rapier','axe','battleaxe','mace','maul','warhammer','spear','halberd','glaive','throwing_knives','wand'].includes(prop.name))motion.nativeWeaponQuaternion(rotation);
  else continue;
  if(prop.userData.gripSocket)poseGrip(actor.rig,prop,rotation);
  else{prop.parent.getWorldQuaternion(parentRotation).invert();prop.quaternion.copy(parentRotation).multiply(rotation);prop.updateWorldMatrix(false,true);}
 }
 const sample=motion.currentSample;
 applyShieldEquipmentPose(actor.rig,{source:true,move:sample?.moveId,phase:sample?.phase,actionPhase:sample?.actionPhase,abilityId:sample?.abilityId,abilityFamily:sample?.abilityFamily,abilityPose:sample?.abilityPose});
}
