import * as THREE from 'three';
import {armReach,palmRotation,solveArmToPalm} from './arm-ik.js';
import {gripPoint} from './equipment-grips.js';
import {poseBowDraw} from './bow-draw.js';
import {poseBowArrow} from './bow-arrow.js';

export const BOW_RELEASE_PHASE=.5;
const smooth=(t,a,b)=>THREE.MathUtils.smoothstep(t,a,b);
const up=new THREE.Vector3(0,0,1);

/** One clock for the native clip and normalized source ability action phase. */
export function bowMotion(move='reference',phase=0){
 const shooting=/shoot|bow|aim/.test(move),t=THREE.MathUtils.clamp(phase,0,1);
 if(!shooting)return {stage:'carry',raise:0,draw:0,load:0,engaged:false,recoil:0};
 const raise=smooth(t,.03,.22)*(1-smooth(t,.78,1));
 const draw=smooth(t,.20,.40)*(1-smooth(t,.5,.535));
 const load=smooth(t,.03,.20)*(1-smooth(t,.5,.535));
 const recoil=smooth(t,.5,.57)*(1-smooth(t,.72,.96));
 const stage=t<.03?'carry':t<.20?'nock':t<.40?'draw':t<.5?'anchor':t<.78?'follow-through':'recover';
 return {stage,raise,draw,load,engaged:t>=.20&&t<.5,recoil};
}
function place(rig,item,position,rotation){
 item.position.copy(rig.group.worldToLocal(position.clone()));
 item.quaternion.copy(rig.group.getWorldQuaternion(new THREE.Quaternion()).invert()).multiply(rotation);
 item.updateWorldMatrix(true,true);
}
function solve(rig,side,palm,axis,frame,pole){
 for(let i=0;i<18;i++){
  const hand=palmRotation(rig,side,palm,axis);
  solveArmToPalm(rig,side,palm,hand,axis,frame,pole);
 }
}
function palmWorld(rig,side){return rig.joints['hand'+side].localToWorld(gripPoint(rig,side));}

/** Bow carry releases the draw hand. Aiming uses an extended bow arm and facial anchor. */
export function poseArchery(rig,item,{move='reference',phase=0}={}){
 const state=bowMotion(move,phase),chest=rig.joints.chest,head=rig.joints.head;
 const frame=chest.getWorldQuaternion(new THREE.Quaternion()),origin=chest.getWorldPosition(new THREE.Vector3());
 const bodyScale=rig.bodyType==='female'?.92:1;
 const chibi=rig.style==='chibi',reach=chibi?armReach(rig,'L'):null;
 // The carry offsets were authored around an adult arm of about 2.2 units.
 const reachScale=chibi?(reach.upper+reach.lower)/2.2:1;
 const itemScale=chibi?item.getWorldScale(new THREE.Vector3()):new THREE.Vector3(1,1,1);
 const aimLocal=new THREE.Vector3(-.955,-.297,0).normalize();
 const aim=aimLocal.clone().applyQuaternion(frame),vertical=up.clone().applyQuaternion(frame);
 const aimRotation=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(aim,new THREE.Vector3().crossVectors(vertical,aim).normalize(),vertical));
 const headAim=frame.clone().multiply(new THREE.Quaternion().setFromAxisAngle(up,-1.269));
 const headWorld=head.getWorldQuaternion(new THREE.Quaternion()).slerp(headAim,state.raise);
 head.quaternion.copy(head.parent.getWorldQuaternion(new THREE.Quaternion()).invert()).multiply(headWorld);head.updateWorldMatrix(true,true);
 // Anchor at the chibi's lower cheek, which the short drawing arm can reach.
 const anchor=new THREE.Vector3(...(chibi?[.40,-.35,-.47]:[.50,-.30,.035])).multiplyScalar(bodyScale).applyQuaternion(headAim).add(head.getWorldPosition(new THREE.Vector3()));
 const fullDistance=chibi?(reach.upper+reach.lower)*1.18:rig.bodyType==='female'?2.71:2.84;
 const moving=/walk|run|jump/.test(move);
 const carry=new THREE.Vector3(moving?-1.9:-1.73*bodyScale,moving?-.75:-.94,moving?-1.55:-1.74).multiplyScalar(reachScale).applyQuaternion(frame).add(origin);
 const carryAxis=new THREE.Vector3(...(moving?[0,.98,.20]:[-.70,-.25,.668])).normalize().applyQuaternion(frame);
 const carryAim=new THREE.Vector3(...(moving?[1,0,0]:[0,1,0])).applyQuaternion(frame);carryAim.addScaledVector(carryAxis,-carryAim.dot(carryAxis)).normalize();
 const carryRotation=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(carryAim,new THREE.Vector3().crossVectors(carryAxis,carryAim).normalize(),carryAxis));
 const rotation=carryRotation.slerp(aimRotation,state.raise);
 const releaseTwist=state.stage==='follow-through'||state.stage==='recover'?smooth(phase,.5,.54)*state.raise*.68:0;
 rotation.multiply(new THREE.Quaternion().setFromAxisAngle(up,-releaseTwist));
 const extension=phase<BOW_RELEASE_PHASE?state.draw:1;
 const aimGrip=anchor.clone().addScaledVector(aim,fullDistance-1.45*reachScale*(1-extension)).addScaledVector(vertical,-.30*itemScale.z);
 const palm=carry.lerp(aimGrip,state.raise);
 palm.add(new THREE.Vector3(0,-.72*reachScale*Math.sin(Math.PI*state.raise)*(1-state.draw),0).applyQuaternion(frame));
 item.userData.twoHandedGrip.left=[0,0,-.30];
 // The grip is the fixed pivot. The drawn string travels toward the facial anchor.
 const position=palm.clone().sub(new THREE.Vector3(0,0,-.30).multiply(itemScale).applyQuaternion(rotation));
 const restBrace=-item.userData.bowConstruction.center[0],drawDistance=fullDistance/itemScale.x-restBrace;
 poseBowDraw(item,state.draw,{distance:drawDistance,loaded:state.load});
 place(rig,item,position,rotation);
 const shaft=up.clone().applyQuaternion(rotation);
 solve(rig,'L',palm,shaft,frame,new THREE.Vector3(-1,.05,-.35));
 // Correct tiny reach-limit residuals at the rigid palm, never scale the arm bones.
 const correction=palmWorld(rig,'L').sub(palm);position.add(correction);place(rig,item,position,rotation);
 const string=item.localToWorld(new THREE.Vector3(...item.userData.bowDraw.center));
 const restRight=palmWorld(rig,'R');
 const rightTarget=restRight.clone().lerp(string,state.load);
 if(state.stage==='follow-through'||state.stage==='recover'){
  const release=anchor.clone().add(new THREE.Vector3(0,.20,0).applyQuaternion(aimRotation)).addScaledVector(aim,-.28*state.recoil).addScaledVector(vertical,.035*state.recoil);
  rightTarget.copy(restRight).lerp(release,state.raise);
 }
 if(state.stage!=='carry')solve(rig,'R',rightTarget,shaft,frame,new THREE.Vector3(1,.22,.55));
 poseBowArrow(item,{visible:phase>=.09&&phase<BOW_RELEASE_PHASE&&state.stage!=='carry',load:state.load,length:(fullDistance+.48*reachScale)/itemScale.x});
 item.userData.bowPose={...state,releasePhase:BOW_RELEASE_PHASE};
 item.updateWorldMatrix(true,true);
}
