import * as THREE from 'three';
import {gripPoint} from './equipment-grips.js';

function orient(joint,world){
 joint.quaternion.copy(joint.parent.getWorldQuaternion(new THREE.Quaternion()).invert()).multiply(world).normalize();
 joint.updateWorldMatrix(true,true);
}
function aim(joint,child,target){
 const origin=joint.getWorldPosition(new THREE.Vector3()),current=joint.getWorldQuaternion(new THREE.Quaternion());
 const before=child.getWorldPosition(new THREE.Vector3()).sub(origin).normalize(),after=target.clone().sub(origin).normalize();
 orient(joint,new THREE.Quaternion().setFromUnitVectors(before,after).multiply(current));
}
export function armReach(rig,side){
 const upper=rig.joints['upperArm'+side],fore=rig.joints['forearm'+side],hand=rig.joints['hand'+side];
 return {shoulder:upper.getWorldPosition(new THREE.Vector3()),upper:fore.position.length(),lower:hand.position.length()};
}
/** Solve rotations only. Bone lengths and skinning bind transforms never change. */
export function solveArmToPalm(rig,side,palm,handRotation,handleAxis,poleFrame,poleDirection){
 const upper=rig.joints['upperArm'+side],fore=rig.joints['forearm'+side],hand=rig.joints['hand'+side];
 const {shoulder,upper:a,lower:b}=armReach(rig,side);
 const wrist=palm.clone().sub(gripPoint(rig,side).applyQuaternion(handRotation));
 const line=wrist.clone().sub(shoulder),distance=THREE.MathUtils.clamp(line.length(),Math.abs(a-b)+.015,a+b-.015);line.normalize();
 const pole=(poleDirection?.clone()||new THREE.Vector3(side==='R'?1:-1,.20,-.28)).applyQuaternion(poleFrame||rig.group.getWorldQuaternion(new THREE.Quaternion()));
 pole.addScaledVector(line,-pole.dot(line));if(pole.lengthSq()<1e-8)pole.set(0,1,0);pole.normalize();
 const along=(a*a-b*b+distance*distance)/(2*distance),height=Math.sqrt(Math.max(0,a*a-along*along));
 if(handleAxis&&height>.01){
  // Select an elbow on the analytic reach circle that makes the forearm
  // perpendicular to the held shaft. This avoids a bent wrist or a haft
  // running back through the sleeve, especially on the support hand.
  const axis=handleAxis.clone().addScaledVector(line,-handleAxis.dot(line)),size=axis.length();
  if(size>.01){
   axis.divideScalar(size);
   const amount=THREE.MathUtils.clamp((distance-along)*line.dot(handleAxis)/(height*size),-.97,.97);
   const tangent=new THREE.Vector3().crossVectors(line,axis).normalize();if(tangent.dot(pole)<0)tangent.negate();
   pole.copy(axis).multiplyScalar(amount).addScaledVector(tangent,Math.sqrt(1-amount*amount)).normalize();
  }
 }
 const elbow=shoulder.clone().addScaledVector(line,along).addScaledVector(pole,height);
 aim(upper,fore,elbow);aim(fore,hand,wrist);orient(hand,handRotation);
}

/** Turn the thumb along a handle and keep the wrist following the forearm. */
export function palmRotation(rig,side,palm,handleAxis){
 const elbow=rig.joints['forearm'+side].getWorldPosition(new THREE.Vector3());
 const finger=palm.clone().sub(elbow);finger.addScaledVector(handleAxis,-finger.dot(handleAxis));
 if(finger.lengthSq()<1e-7)finger.set(side==='R'?1:-1,0,-1).applyQuaternion(rig.group.getWorldQuaternion(new THREE.Quaternion())).addScaledVector(handleAxis,-finger.dot(handleAxis));
 finger.normalize();
 const x=handleAxis.clone().multiplyScalar(side==='R'?-1:1),z=finger.negate(),y=new THREE.Vector3().crossVectors(z,x).normalize();
 z.crossVectors(x,y).normalize();
 return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,z));
}
