import * as THREE from 'three';
import {poseCharacter,BODY} from '../player.js';
const MAP={hips:'hips',torso:'chest',head:'head',armL:'upperArmL',armR:'upperArmR',handL:'handL',handR:'handR',legL:'thighL',legR:'thighR',shinL:'shinL',shinR:'shinR',bootL:'footL',bootR:'footR'};
export function createStudioEmotes(){
 const parts=Object.fromEntries(Object.keys(MAP).map(k=>[k,new THREE.Object3D()])),q=new THREE.Quaternion();
 return(actor,pose)=>{
  poseCharacter(parts,{phase:0,stride:1.4,idleMix:1,...pose});actor.rig.reset();
  for(const [part,bone]of Object.entries(MAP)){const r=parts[part].quaternion;q.set(r.x,-r.z,r.y,r.w);actor.rig.joints[bone].quaternion.copy(actor.rig.rest[bone].q).multiply(q);}
  actor.rig.joints.hips.position.z=parts.hips.position.y*actor.rig.rest.hips.p.z/BODY.IDLE_HIP;
 };
}
