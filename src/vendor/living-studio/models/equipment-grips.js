import * as THREE from 'three';
import {wiki} from '../data/wiki.js';

export const oneHandedWeaponIds=Object.freeze(wiki.weapons.filter(item=>item.hands===1).map(item=>item.id));
const oneHanded=new Set([...oneHandedWeaponIds,'pickaxe','smith_hammer','tongs']);
export const isOneHandedWeapon=id=>oneHanded.has(id==='sword'?'longsword':id);

export function gripPoint(rig,side,target=new THREE.Vector3()){
 return rig.gripPoints?.[side]?target.copy(rig.gripPoints[side]):target.set(side==='R'?.005:-.005,-.08,-.25);
}

/** A handle crosses the fist toward its thumb; it does not follow the wrist. */
export function mountGrip(rig,item,side,kind='weapon'){
 const rotation=new THREE.Quaternion().setFromAxisAngle(
  new THREE.Vector3(0,1,0),
  kind==='shield'?Math.PI/2:side==='R'?-Math.PI/2:Math.PI/2,
 );
 // The rapier guard and axe edge are on item +X, which belongs on the
 // finger side of the fist, opposite the wrist.
 if(kind!=='shield'&&side==='R')rotation.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),Math.PI));
 const offset=item.userData.itemId==='throwing_knives'?[0,0,-.04]:[0,0,0];
 item.position.copy(gripPoint(rig,side)).add(new THREE.Vector3(...offset));
 item.quaternion.copy(rotation);
 item.userData.gripSocket={side,kind,quaternion:rotation.toArray(),offset};
 item.userData.mountedHand=side;
 rig.joints['hand'+side].add(item);
}

/** Preserve an authored item orientation while fitting the fist around its hilt. */
export function poseGrip(rig,item,worldQuaternion){
 const socket=item.userData.gripSocket;if(!socket)return;
 const hand=rig.joints['hand'+socket.side],local=new THREE.Quaternion().fromArray(socket.quaternion);
 const handWorld=worldQuaternion.clone().multiply(local.clone().invert());
 hand.quaternion.copy(hand.parent.getWorldQuaternion(new THREE.Quaternion()).invert()).multiply(handWorld).normalize();
 hand.updateWorldMatrix(false,true);
 item.position.copy(gripPoint(rig,socket.side)).add(new THREE.Vector3(...socket.offset));item.quaternion.copy(local);
 item.updateWorldMatrix(false,true);
}

function aimForearm(rig,side,direction){
 const forearm=rig.joints['forearm'+side],hand=rig.joints['hand'+side];
 const current=forearm.getWorldQuaternion(new THREE.Quaternion());
 const before=hand.position.clone().normalize().applyQuaternion(current);
 const target=new THREE.Vector3(...direction).normalize().applyQuaternion(rig.group.getWorldQuaternion(new THREE.Quaternion()));
 const after=new THREE.Quaternion().setFromUnitVectors(before,target).multiply(current);
 forearm.quaternion.copy(forearm.parent.getWorldQuaternion(new THREE.Quaternion()).invert()).multiply(after).normalize();
 forearm.updateWorldMatrix(false,true);
 return hand.getWorldPosition(new THREE.Vector3()).sub(forearm.getWorldPosition(new THREE.Vector3())).normalize();
}

function readyWeaponRotation(rig,alongArm){
 const root=rig.group.getWorldQuaternion(new THREE.Quaternion());
 const z=new THREE.Vector3(0,0,1).applyQuaternion(root);
 z.addScaledVector(alongArm,-z.dot(alongArm)).normalize();
 const x=alongArm.clone(),y=new THREE.Vector3().crossVectors(z,x).normalize();
 x.crossVectors(y,z).normalize();
 return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,z));
}

/** Reference/idle foundation. Motion clips can move the arms through their swings. */
export function applyReadyEquipmentPose(rig){
 const items=rig.group.userData.loadout||[];
 for(const item of items){
  const socket=item.userData.gripSocket;if(!socket||socket.kind==='shield')continue;
  if(rig.joints['hand'+socket.side]?.parent!==rig.joints['forearm'+socket.side])continue;
  const alongArm=aimForearm(rig,socket.side,[socket.side==='R'?.38:-.38,-.84,-.36]);
  poseGrip(rig,item,readyWeaponRotation(rig,alongArm));
 }
}
