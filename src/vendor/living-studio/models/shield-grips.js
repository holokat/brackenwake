import * as THREE from 'three';
import {applyReadyEquipmentPose,gripPoint,isOneHandedWeapon,poseGrip} from './equipment-grips.js';
import {shieldMotion} from './shield-motion.js';
import {armReach,solveArmToPalm} from './arm-ik.js';

function poseScale(rig,side){
 if(rig.style!=='chibi')return 1;
 const reach=armReach(rig,side);return (reach.upper+reach.lower)/2.2;
}

function aim(joint,child,target){
 const origin=joint.getWorldPosition(new THREE.Vector3()),before=child.getWorldPosition(new THREE.Vector3()).sub(origin).normalize();
 const q=new THREE.Quaternion().setFromUnitVectors(before,target.clone().sub(origin).normalize()).multiply(joint.getWorldQuaternion(new THREE.Quaternion()));
 joint.quaternion.copy(joint.parent.getWorldQuaternion(new THREE.Quaternion()).invert()).multiply(q).normalize();joint.updateWorldMatrix(true,true);
}

function fitWeaponArm(rig,weapon,shield){
 const upper=rig.joints.upperArmR,fore=rig.joints.forearmR,hand=rig.joints.handR;
 const rotation=weapon.getWorldQuaternion(new THREE.Quaternion()),socket=new THREE.Quaternion().fromArray(weapon.userData.gripSocket.quaternion);
 const handRotation=rotation.clone().multiply(socket.invert()),axis=new THREE.Vector3(0,0,-1).applyQuaternion(handRotation);
 const shoulder=upper.getWorldPosition(new THREE.Vector3()),palm=weapon.getWorldPosition(new THREE.Vector3());
 // Keep the attacking fist on its side of the shield while preserving the
 // authored blade direction. Reach projection retains the original bone lengths.
 // The tower's broad field needs a little more room at the lunge guard.
 const clearance=(shield.userData.itemId==='tower'?.70:.45)*poseScale(rig,'R');
 palm.add(new THREE.Vector3(clearance,0,0).applyQuaternion(rig.group.getWorldQuaternion(new THREE.Quaternion())));
 const elbow=palm.sub(gripPoint(rig,'R').applyQuaternion(handRotation)).addScaledVector(axis,-hand.position.length());
 elbow.sub(shoulder).setLength(fore.position.length()).add(shoulder);aim(upper,fore,elbow);
 const foreRotation=handRotation.clone().multiply(new THREE.Quaternion().setFromUnitVectors(hand.position.clone().normalize(),new THREE.Vector3(0,0,-1)));
 fore.quaternion.copy(fore.parent.getWorldQuaternion(new THREE.Quaternion()).invert()).multiply(foreRotation).normalize();fore.updateWorldMatrix(true,true);
 poseGrip(rig,weapon,rotation);
}

/** Fit the left palm to the physical rear handle after each body animation. */
export function poseShieldGrip(rig,item,options={}){
 if(item.userData.gripSocket?.kind!=='shield')return;
 const chest=rig.joints.chest,frame=rig.group.getWorldQuaternion(new THREE.Quaternion());
 const up=new THREE.Vector3(0,0,1).applyQuaternion(frame),rear=new THREE.Vector3(0,1,0).applyQuaternion(frame);
 const followsHips=options.source||/whirlwind|spin|turn/.test(options.move||'');
 if(followsHips){
  rear.set(0,1,0).transformDirection(rig.joints.hips.matrixWorld);rear.addScaledVector(up,-rear.dot(up)).normalize();
  frame.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(rear,up).normalize(),rear,up));
 }
 if(options.source&&options.move==='light-attack'&&options.abilityId!=='shield-bash'){
  // Start beside the authored chest guard before transferring protection to
  // the hips as the sword crosses. Projecting onto the ground keeps it upright.
  const chestRear=new THREE.Vector3(0,1,0).transformDirection(chest.matrixWorld);
  chestRear.addScaledVector(up,-chestRear.dot(up)).normalize();
  const chestFrame=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3().crossVectors(chestRear,up).normalize(),chestRear,up));
  frame.copy(chestFrame.slerp(frame.clone(),THREE.MathUtils.smoothstep(options.phase||0,0,.12)));
  rear.set(0,1,0).applyQuaternion(frame);
 }
 // Face the opponent while the torso winds up, twists and leans into attacks.
 const pose=shieldMotion(options),palm=pose.position.multiplyScalar(poseScale(rig,'L')).applyQuaternion(frame).add(chest.getWorldPosition(new THREE.Vector3()));
 const rotation=frame.clone().multiply(pose.rotation);
 const socket=new THREE.Quaternion().fromArray(item.userData.gripSocket.quaternion);
 const handRotation=rotation.clone().multiply(socket.invert());
 const upper=rig.joints.upperArmL,fore=rig.joints.forearmL,hand=rig.joints.handL;
 const shoulder=upper.getWorldPosition(new THREE.Vector3()),axis=new THREE.Vector3(1,0,0).applyQuaternion(rotation);
 const wrist=palm.clone().sub(gripPoint(rig,'L').applyQuaternion(handRotation));
 if(rig.style==='chibi'){
  const reach=armReach(rig,'L'),delta=wrist.clone().sub(shoulder),limit=reach.upper+reach.lower-.04;
  // Project the desired wrist before solving so the short arm never stretches
  // toward an adult-sized bash or low-block target.
  if(delta.length()>limit)palm.addScaledVector(delta,(limit-delta.length())/delta.length());
  const solverPalm=palm.clone();
  for(let iteration=0;iteration<8;iteration++){
   solveArmToPalm(rig,'L',solverPalm,handRotation,null,frame);
   // Breathing scales the chest slightly; remove that inherited scale's
   // residual without changing the authored palm target or bone lengths.
   const actual=hand.localToWorld(gripPoint(rig,'L'));
   solverPalm.add(palm.clone().sub(actual));
  }
  poseGrip(rig,item,rotation);
  item.userData.shieldPose=pose.kind;item.userData.shieldHeading=followsHips?'hips':'actor';
  item.userData.shieldPalmTarget=palm.toArray();
  return;
 }
 const elbow=wrist.clone().addScaledVector(axis,-hand.position.length());
 // Keep the wrist straight behind the compact handhold. Bring the desired
 // elbow onto the upper-arm reach sphere instead of stretching either bone.
 const direction=elbow.sub(shoulder).normalize(),forward=rear.clone().negate(),advance=direction.dot(forward);
 if(advance<pose.advance){
  direction.addScaledVector(forward,-advance).normalize().multiplyScalar(Math.sqrt(1-pose.advance**2)).addScaledVector(forward,pose.advance);
 }
 elbow.copy(direction).multiplyScalar(fore.position.length()).add(shoulder);
 wrist.copy(elbow).addScaledVector(axis,hand.position.length());
 aim(upper,fore,elbow);
 const foreRotation=handRotation.clone().multiply(new THREE.Quaternion().setFromUnitVectors(hand.position.clone().normalize(),new THREE.Vector3(0,0,-1)));
 fore.quaternion.copy(fore.parent.getWorldQuaternion(new THREE.Quaternion()).invert()).multiply(foreRotation).normalize();fore.updateWorldMatrix(true,true);
 poseGrip(rig,item,rotation);
 item.userData.shieldPose=pose.kind;item.userData.shieldHeading=followsHips?'hips':'actor';
}

export function applyShieldEquipmentPose(rig,options={}){
 const items=rig.group.userData.loadout||[];
 const shield=items.find(item=>item.userData.gripSocket?.kind==='shield');if(!shield)return;
 const carry=options.source&&(/^(walk|run|jump|strafe|dodge|sidestep)(-|$)/.test(options.move||'')|| (options.abilityId?
  !['slash','impact'].includes(options.abilityFamily)&&options.abilityPose!=='thrust':
  /walk|run|strafe|dodge|sidestep|cast|fireball|healing|lightning|missile/.test(options.move||'')));
 if(((options.abilityId||options.move)==='shield-bash'||carry)&&items.some(item=>item.userData.slot==='weapon'&&isOneHandedWeapon(item.userData.itemId))){
  // The imported bash reuses a sword thrust. Keep the right weapon in guard
  // while the left arm delivers the shield strike. Locomotion and nonmelee
  // spells also retain this armed carry instead of an empty-hand gesture.
  for(const name of['upperArmR','forearmR','handR'])rig.joints[name].quaternion.copy(rig.rest[name].q);
  rig.group.updateMatrixWorld(true);applyReadyEquipmentPose(rig);
 }
 rig.group.updateMatrixWorld(true);
 if(options.source){
  const weapon=items.find(item=>item.userData.slot==='weapon'&&isOneHandedWeapon(item.userData.itemId));
  if(weapon)fitWeaponArm(rig,weapon,shield);
 }
 for(const item of items)poseShieldGrip(rig,item,options);
}
