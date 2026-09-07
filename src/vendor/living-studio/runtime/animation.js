import * as THREE from 'three';
import {BOW_RELEASE_PHASE} from '../models/bow-poses.js';
import {applyReadyEquipmentPose} from '../models/equipment-grips.js';
import {applyTwoHandedEquipmentPose} from '../models/two-handed-grips.js';
import {applyShieldEquipmentPose} from '../models/shield-grips.js';
import {applyShieldBashBody} from '../models/shield-motion.js';
import {applyLocomotion} from './locomotion.js';
export const motions=[['reference','Reference pose',0],['idle','Idle',4],['walk','Walk',1.2],['run','Run',.7],['slash','Sword slash',1.4],['heavy','Heavy strike',2.0],['thrust','Thrust',1.3],['block','Shield block',1.7],['block-high','High shield block',1.7],['block-low','Low shield block',1.7],['shield-bash','Shield bash',1.5],['shoot','Bow shot',2.2],['cast','Cast spell',2.0],['spin','Whirlwind',2.2],['jump','Jump',1.6],['hit','Hit reaction',1.1],['victory','Victory',3.0]];
const ease=t=>t*t*(3-2*t),pulse=(t,a,b)=>t<a||t>b?0:Math.sin(Math.PI*(t-a)/(b-a));
export class Animator{
 constructor(rig){this.rig=rig;this.motion='reference';this.time=0;this.duration=0;this.playing=false;this.loop=true;this.speed=2.5;this.events=[];this.triggered=false;}
 set(name){this.motion=name;this.time=0;this.duration=motions.find(m=>m[0]===name)?.[2]||0;this.playing=this.duration>0;this.triggered=false;this.apply();}
 update(dt){if(this.playing&&this.duration){const old=this.time,contact=this.duration*(this.motion==='shoot'?BOW_RELEASE_PHASE:.48);this.time+=dt*this.speed;if(this.time>this.duration){if(this.loop){this.time%=this.duration;this.triggered=false;}else{this.time=this.duration;this.playing=false;}}if(!this.triggered&&old<contact&&this.time>=contact){this.triggered=true;for(const fn of this.events)fn(this.motion);}}this.apply();}
 apply(){this.applyBody();const pose={move:this.motion,phase:this.duration?this.time/this.duration:0};applyTwoHandedEquipmentPose(this.rig,pose);applyShieldEquipmentPose(this.rig,pose);}
 applyBody(){const r=this.rig,j=r.joints;r.reset();applyReadyEquipmentPose(r);const t=this.duration?this.time/this.duration:0,p=Math.sin(t*Math.PI),rot=(n,x=0,y=0,z=0)=>j[n].rotation.set(x,y,z);
  if(this.motion==='reference')return;
  if(applyLocomotion(r,this.motion,t))return;
  const breath=Math.sin(this.time*2)*.014;j.chest.scale.set(1+breath*.4,1+breath,1+breath*.2);
  rot('head',0,0,-.045+Math.sin(this.time*.8)*.025);rot('upperArmL',-.03,0,.025);rot('upperArmR',-.03,0,-.025);
  if(this.motion==='idle'){j.hips.position.z+=Math.sin(this.time*2)*.018;rot('chest',0,.016*Math.sin(this.time),.02*Math.sin(this.time*.6));return;}
  if(this.motion==='slash'){const wind=pulse(t,0,.5),strike=pulse(t,.32,.95);rot('chest',0,0,-.5*wind+.65*strike);rot('upperArmR',-.4-1.3*wind-.5*strike,-.25*wind,-.7*wind+1.7*strike);rot('forearmR',-.8*wind-.2*strike);rot('upperArmL',-.45*strike,0,.3*strike);rot('thighL',-.18*strike);j.hips.position.y-=.15*strike;}
  if(this.motion==='heavy'){const w=pulse(t,0,.7),a=pulse(t,.45,.95);rot('upperArmR',-2.65*w+.5*a,0,.15);rot('forearmR',-.75*w);rot('upperArmL',-1.3*w,0,.7*w);rot('chest',-.15*w+.4*a,0,.12*a);j.hips.position.z-=.23*a;rot('shinL',.3*a);rot('shinR',.3*a);}
  if(this.motion==='thrust'){const w=pulse(t,0,.55),a=pulse(t,.27,1);rot('upperArmR',-1.35*a,0,-.35*w);rot('forearmR',-1.3*w);rot('chest',-.12*a,0,-.22*a);j.hips.position.y-=.45*a;rot('thighL',-.28*a);rot('shinR',.3*a);}
  if(['block','block-high','block-low'].includes(this.motion)){const a=Math.min(1,p*2),low=this.motion==='block-low';rot('upperArmL',-1.1*a,0,.48*a);rot('forearmL',-1.1*a);rot('upperArmR',-.35*a,0,-.6*a);rot('chest',.08*a,0,.15*a);j.hips.position.z-=(low?.40:.13)*a;if(low){rot('thighL',-.48*a);rot('thighR',-.48*a);}rot('shinL',(low?.92:.2)*a);rot('shinR',(low?.92:.2)*a);}
  if(this.motion==='shield-bash')applyShieldBashBody(r,t);
  if(this.motion==='shoot'){const draw=Math.min(1,t/.48),relax=t<.6?1:1-ease((t-.6)/.4),a=draw*relax;rot('chest',0,0,-.34*a);rot('upperArmR',-1.55*a,0,-.15*a);rot('forearmR',-.15*a);rot('upperArmL',-1.3*a,0,1.2*a);rot('forearmL',-1.6*a);rot('head',0,0,-.32*a);}
  if(this.motion==='cast'){const a=pulse(t,0,1),rise=pulse(t,0,.6),release=pulse(t,.32,1);rot('upperArmR',-1.55*release,0,-.3*a);rot('forearmR',-1.1*rise);rot('upperArmL',-.30*a,0,.22*a);rot('chest',-.12*release,0,-.14*a);rot('head',-.08*a,0,-.1*a);j.hips.position.z+=.05*a;}
  if(this.motion==='spin'){const a=pulse(t,0,1);j.hips.rotation.z=-Math.PI*4*ease(t);rot('upperArmR',-.25*a,-1.15*a,0);rot('upperArmL',-.15*a,1.1*a,0);j.hips.position.z-=.15*a;}
  if(this.motion==='jump'){const a=Math.max(0,Math.sin(Math.PI*t));j.hips.position.z+=a*1.35;rot('thighL',-.7*a);rot('thighR',-.35*a);rot('shinL',1.0*a);rot('shinR',.7*a);rot('upperArmL',-1.4*a);rot('upperArmR',-1.4*a);}
  if(this.motion==='hit'){const a=pulse(t,0,1);rot('chest',.35*a,0,.2*a);rot('head',.28*a);j.hips.position.y+=.25*a;}
  if(this.motion==='victory'){const a=pulse(t,0,1);rot('upperArmR',-2.7*a,0,-.1*a);rot('upperArmL',-.6*a,0,.6*a);rot('head',-.18*a);j.hips.position.z+=.08*a;}
 }
}
