import * as THREE from 'three';
import {palmRotation,solveArmToPalm} from './arm-ik.js';
import {poseGrip} from './equipment-grips.js';
import {staffMotion} from './staff-motion.js';

/** Carry and aim with the torso, including native chest turns during shooting. */
export function crossbowFrame(rig,{move='reference'}={}){
 const chest=rig.joints.chest,rotation=chest.getWorldQuaternion(new THREE.Quaternion());
 const position=new THREE.Vector3(.05,-1.46,-.10).applyQuaternion(rotation).add(chest.getWorldPosition(new THREE.Vector3()));
 if(/shoot|bow|aim/.test(move)){
  const head=rig.joints.head;
  head.quaternion.copy(head.parent.getWorldQuaternion(new THREE.Quaternion()).invert()).multiply(rotation);
  head.updateWorldMatrix(true,true);
 }
 return {position,rotation};
}

/** Keep a casting staff beside the body while the left arm retains its clip. */
export function solveCasterGrip(rig,item,options={}){
 const chest=rig.joints.chest,frame=chest.getWorldQuaternion(new THREE.Quaternion());
 const pose=staffMotion(options);
 const palm=pose.position.applyQuaternion(frame).add(chest.getWorldPosition(new THREE.Vector3()));
 const axis=pose.axis.applyQuaternion(frame);
 let handRotation;
 for(let iteration=0;iteration<10;iteration++){
  handRotation=palmRotation(rig,'R',palm,axis);
  solveArmToPalm(rig,'R',palm,handRotation,axis,frame);
 }
 const local=new THREE.Quaternion().fromArray(item.userData.gripSocket.quaternion);
 poseGrip(rig,item,handRotation.multiply(local));
 item.userData.staffPose=pose.kind;
}
