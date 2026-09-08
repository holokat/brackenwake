import * as THREE from 'three';
import {Animator} from '../../runtime/animation.js';
import {gripPoint} from '../equipment-grips.js';
import {solveArmToPalm} from '../arm-ik.js';
import {applyShieldEquipmentPose} from '../shield-grips.js';
import {pulse,ease} from './shared.js';

export const creatureBowDraw=t=>ease(t/.44)*(1-ease((t-.59)/.045));

function poseBow(rig,bow,t){
 const frame=rig.joints.chest.getWorldQuaternion(new THREE.Quaternion()),origin=rig.joints.chest.getWorldPosition(new THREE.Vector3());
 const raise=ease(t/.18)*(1-ease((t-.70)/.30));
 const left=rig.joints.handL.localToWorld(gripPoint(rig,'L'));
 const aim=frame.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,0,1),-Math.PI*65/180));
 const draw=creatureBowDraw(t),nock=1-draw;
 const target=new THREE.Vector3(-.95+1.05*nock,-1.35+.65*nock,.83-.25*nock).applyQuaternion(frame).add(origin);
 const palm=left.lerp(target,raise),rotation=rig.joints.handL.getWorldQuaternion(new THREE.Quaternion()).slerp(aim,raise);
 const head=rig.joints.head,headWorld=head.getWorldQuaternion(new THREE.Quaternion()).slerp(aim,raise);
 head.quaternion.copy(head.parent.getWorldQuaternion(new THREE.Quaternion()).invert()).multiply(headWorld);head.updateWorldMatrix(true,true);
 solveArmToPalm(rig,'L',palm,rotation,null,frame,new THREE.Vector3(-1,.3,-.2));
 const string=rig.joints.handL.localToWorld(bow.center.clone().add(new THREE.Vector3(0,bow.distance*creatureBowDraw(t),0)));
 const right=rig.joints.handR.localToWorld(gripPoint(rig,'R')).lerp(string,raise);
 solveArmToPalm(rig,'R',right,frame,null,frame,new THREE.Vector3(1,.2,.4));
}

export function createChibiHumanPose(rig,look,bow){
 const animator=new Animator(rig);
 return (name,t,duration)=>{
  const player={swing:look.weapon==='rapier'?'thrust':'slash',hurt:'hit',shieldRaise:'block-high',charge:'run',hover:'idle',reach:'cast',wait:'idle',wake:'idle',shout:'victory',whistle:'idle',die:'reference',throw:'cast'};
  animator.motion=player[name]??name;animator.duration=duration;animator.time=t*duration;animator.applyBody();
  const j=rig.joints,rot=(n,x=0,y=0,z=0)=>j[n].rotation.set(x,y,z),a=pulse(t);
  if(name==='cast'&&bow)poseBow(rig,bow,t);
  if(name==='wait'){j.hips.position.z-=.20;rot('thighL',-.36);rot('thighR',-.28);rot('shinL',.6);rot('shinR',.5);rot('chest',-.10);}
  if(name==='wake'){const v=1-ease(t);rot('head',.55*v);rot('chest',.35*v);rot('upperArmL',0,0,.6*v);rot('upperArmR',0,0,-.6*v);}
  if(name==='charge'){rot('chest',-.25);rot('upperArmR',-.8);rot('forearmR',-.7);}
  if(name==='shout'){rot('head',-.17*a);rot('upperArmL',-.35*a,0,.45*a);rot('upperArmR',-1.0*a,0,-.3*a);}
  if(name==='whistle'){rot('upperArmR',-.70*a,0,.26*a);rot('forearmR',-2.15*a);rot('handR',0,.3*a,0);}
  if(name==='throw'){const wind=pulse(t,0,.60),release=pulse(t,.32,.95);rot('upperArmR',-2.25*wind+.70*release,0,-.10);rot('forearmR',-1.05*wind);rot('chest',.1,-.32*wind+.4*release);}
  if(name==='die'){const v=ease(t);j.hips.position.z-=1.6*v;rot('hips',1.48*v,0,.12*v);rot('chest',.3*v);rot('head',.4*v);rot('thighL',-.5*v);rot('thighR',-.68*v);rot('shinL',1.1*v);rot('shinR',.9*v);rot('upperArmL',.4*v,0,-.65*v);rot('upperArmR',.32*v,0,.55*v);}
  else applyShieldEquipmentPose(rig,{move:player[name]??name,phase:t});
 };
}
