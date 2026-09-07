import * as THREE from 'three';
import {twoHandedProfiles} from './two-handed-profiles.js';
import {armReach,palmRotation,solveArmToPalm} from './arm-ik.js';
import {gripPoint,mountGrip} from './equipment-grips.js';
import {twoHandedMotion} from './two-handed-motion.js';
import {poseArchery} from './bow-poses.js';
import {crossbowFrame,solveCasterGrip} from './caster-ranged-grips.js';

export function mountTwoHandedGrip(rig,item){
 const profile=twoHandedProfiles[item.userData.itemId];if(!profile)return false;
 item.userData.twoHandedGrip=structuredClone(profile);
 if(profile.kind==='staff'){mountGrip(rig,item,'R');return true;}
 rig.group.add(item);item.userData.mountedHand=null;item.userData.mountedHands=['R','L'];
 return true;
}

function place(item,position,rotation){
 item.position.copy(item.parent.worldToLocal(position.clone()));
 item.quaternion.copy(item.parent.getWorldQuaternion(new THREE.Quaternion()).invert()).multiply(rotation);
 item.updateWorldMatrix(true,true);
}

function fitHands(rig,item,profile,position,rotation){
 const poleFrame=profile.kind==='crossbow'?rig.joints.chest.getWorldQuaternion(new THREE.Quaternion()):undefined;
 // A common translation keeps the rigid handle intact while bringing both
 // wrists into the intersection of the two arms' reach spheres.
 for(let iteration=0;iteration<8;iteration++){
  place(item,position,rotation);
  for(const side of['R','L']){
   const contact=side==='R'?profile.right:profile.left,palm=item.localToWorld(new THREE.Vector3(...contact));
   const axis=new THREE.Vector3(...(profile[side==='R'?'rightAxis':'leftAxis']||[0,0,1])).applyQuaternion(rotation).normalize();
   const q=palmRotation(rig,side,palm,axis),wrist=palm.clone().sub(gripPoint(rig,side).applyQuaternion(q));
   const reach=armReach(rig,side),delta=wrist.clone().sub(reach.shoulder),length=delta.length(),limit=reach.upper+reach.lower-.07;
   if(length>limit){position.addScaledVector(delta,(limit-length)/length);place(item,position,rotation);}
   if(profile.kind==='melee'){
    // A straight wrist requires an elbow that can reach the plane through
    // the palm, perpendicular to the haft. Total arm reach alone misses this.
    const axial=delta.dot(axis),available=reach.upper-.12;
    if(Math.abs(axial)>available){position.addScaledVector(axis,Math.sign(axial)*available-axial);place(item,position,rotation);}
   }
   solveArmToPalm(rig,side,item.localToWorld(new THREE.Vector3(...contact)),q,axis,poleFrame);
  }
 }
 place(item,position,rotation);
 for(let iteration=0;iteration<4;iteration++)for(const side of['R','L']){
  const contact=side==='R'?profile.right:profile.left,palm=item.localToWorld(new THREE.Vector3(...contact));
  const axis=new THREE.Vector3(...(profile[side==='R'?'rightAxis':'leftAxis']||[0,0,1])).applyQuaternion(rotation).normalize();
  solveArmToPalm(rig,side,palm,palmRotation(rig,side,palm,axis),axis,poleFrame);
 }
}

export function poseTwoHandedGrip(rig,item,{move='reference',phase=0,abilityId,abilityFamily}={}){
 const profile=item.userData.twoHandedGrip;if(!profile)return;
 if(!rig.joints.upperArmR||!rig.joints.upperArmL)return;
 if(profile.kind==='staff'){solveCasterGrip(rig,item,{move,phase,abilityId,abilityFamily});return;}
 if(profile.kind==='bow'){poseArchery(rig,item,{move,phase});return;}
 const chestRotation=rig.joints.chest.getWorldQuaternion(new THREE.Quaternion());
 const chest=rig.joints.chest.getWorldPosition(new THREE.Vector3());
 let rotation,position;
 if(profile.kind==='melee'){
  const pose=twoHandedMotion(profile.family,move,phase);
  rotation=chestRotation.clone().multiply(pose.rotation);
  position=pose.position.applyQuaternion(chestRotation).add(chest);
  const center=new THREE.Vector3(...profile.right).add(new THREE.Vector3(...profile.left)).multiplyScalar(.5).applyQuaternion(rotation);
  position.sub(center);
 }else if(profile.kind==='crossbow'){
  ({position,rotation}=crossbowFrame(rig,{move,phase}));
 }

 fitHands(rig,item,profile,position,rotation);
 if(item.userData.itemId==='greatsword'){
  // Keep the quillons across the fist instead of projecting into the wrist.
  // Rolling about the shaft preserves both contact points and the blade path.
  const axis=new THREE.Vector3(0,0,1).applyQuaternion(rotation);
  const forearm=rig.joints.handR.getWorldPosition(new THREE.Vector3()).sub(rig.joints.forearmR.getWorldPosition(new THREE.Vector3())).normalize();
  const across=new THREE.Vector3().crossVectors(axis,forearm).normalize();
  const normal=new THREE.Vector3().crossVectors(axis,across).normalize();
  rotation.setFromRotationMatrix(new THREE.Matrix4().makeBasis(across,normal,axis));
  place(item,position,rotation);
 }
}
export function applyTwoHandedEquipmentPose(rig,options){
 for(const item of rig.group.userData.loadout||[])poseTwoHandedGrip(rig,item,options);
}
