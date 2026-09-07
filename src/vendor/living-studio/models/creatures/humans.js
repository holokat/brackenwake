import * as THREE from 'three';
import {bindCharacter} from '../rig.js';
import {Animator} from '../../runtime/animation.js';
import {Sculpt,skinSculpt,bakeClips,finishActor,pulse,ease} from './shared.js';
import {humanLook,buildHumanBody} from './human-parts.js';
import {buildWeapons} from './weapons.js';
import {rigMotions} from './motions.js';

export function createHuman(entry,options={}){
 const native=new THREE.Group();native.name='Player compatible rig';native.userData.rig=entry.rig;
 // Preserve the studio player's exact bind positions and hierarchy.
 const rig=bindCharacter(native,'wiki'),s=new Sculpt(native),look=humanLook(entry.id,options);
 for(const[key,allowed]of Object.entries({head:['angular','broad','gaunt','round','hooked','scarred'],hair:['crop','part','knot','bald'],body:['slim','medium','heavy']}))if(!allowed.includes(look[key]))throw new Error(`Unknown creature ${key}: ${look[key]}`);
 buildHumanBody(s,entry.id,look);buildWeapons(s,look);skinSculpt(s,rig);
 const animator=new Animator(rig),id=entry.id;
 const pose=(name,t,duration)=>{
  const player={swing:look.weapon==='rapier'?'thrust':'slash',hurt:'hit',shieldRaise:'block-high',charge:'run',hover:'idle',reach:'cast',wait:'idle',wake:'idle',shout:'victory',whistle:'idle',die:'reference'};
  animator.motion=player[name]??name;animator.duration=duration;animator.time=t*duration;animator.applyBody();
  const j=rig.joints,rot=(n,x=0,y=0,z=0)=>j[n].rotation.set(x,y,z),a=pulse(t),swing=Math.sin(t*Math.PI*2);
  if(name==='cast'&&look.weapon==='bow'){
   const draw=ease(t/.44),release=1-ease((t-.61)/.28),v=draw*release;
   rot('chest',0,0,-.35*v);rot('upperArmR',-1.55*v,0,-.14*v);rot('forearmR',-.13*v);rot('upperArmL',-1.30*v,0,1.25*v);rot('forearmL',-1.67*v);rot('head',0,0,-.31*v);
  }
  if(['zombie','drowned','scarecrow'].includes(id)&&['idle','walk','run'].includes(name)){
   const moving=name!=='idle',v=moving?swing*.28:.015*swing;rot('chest',-.12,0,.06);rot('head',.12,0,-.10);rot('upperArmL',-.85+v,0,.10);rot('upperArmR',-.71-v,0,-.16);rot('forearmL',-.13);rot('forearmR',-.20);if(moving){rot('thighL',v);rot('thighR',-v*.8);rot('shinL',Math.max(0,-v)*1.1);rot('shinR',Math.max(0,v)*1.1);}
  }
  if(name==='wait'){j.hips.position.z-=.38;rot('thighL',-.36);rot('thighR',-.28);rot('shinL',.6);rot('shinR',.5);rot('chest',-.10);}
  if(name==='wake'){const v=1-ease(t);rot('head',.55*v);rot('chest',.35*v);rot('upperArmL',0,0,.6*v);rot('upperArmR',0,0,-.6*v);}
  if(name==='charge'){rot('chest',-.25);rot('upperArmR',-.8);rot('forearmR',-.7);}
  if(name==='shout'){rot('head',-.17*a);rot('upperArmL',-.35*a,0,.45*a);rot('upperArmR',-1.0*a,0,-.3*a);}
  if(name==='whistle'){rot('upperArmR',-.70*a,0,.26*a);rot('forearmR',-2.15*a);rot('handR',0,.3*a,0);}
  if(id==='wraith'){
   j.hips.position.z+=.22+Math.sin(t*Math.PI*2)*.12;rot('thighL',0);rot('thighR',0);rot('shinL',0);rot('shinR',0);
   if(['idle','walk','run','hover'].includes(name)){rot('upperArmL',-.26,0,.16+swing*.025);rot('upperArmR',-.26,0,-.16-swing*.025);rot('head',.1);}
  }
  if(name==='die'){
   rig.reset();const v=ease(t);j.hips.position.z-=id==='skeleton'?3.35*v:3.00*v;rot('hips',id==='skeleton'?.45*v:1.48*v,0,.12*v);rot('chest',.3*v);rot('head',.4*v);rot('thighL',-.5*v);rot('thighR',-.68*v);rot('shinL',1.1*v);rot('shinR',.9*v);rot('upperArmL',.4*v,0,-.65*v);rot('upperArmR',.32*v,0,.55*v);
   if(id==='skeleton'){for(let i=0;i<rig.bones.length;i++){const bone=rig.bones[i];if(bone.name==='hips')continue;bone.position.multiplyScalar(1-.35*v);bone.rotation.z+=(i%2?1:-1)*.52*v;}}
  }
 };
 const clips=bakeClips(rig,rigMotions[entry.rig],pose);
 if(look.weapon==='bow')for(const clip of clips){
  const times=Array.from(clip.tracks[0].times),values=times.map(time=>{
   if(clip.name!=='cast')return 0;const phase=time/clip.duration;
   return ease(phase/.44)*(1-ease((phase-.59)/.045));
  });
  clip.tracks.push(new THREE.NumberKeyframeTrack('Creature skin.morphTargetInfluences',times,values));
 }
 const group=new THREE.Group();group.add(native);native.rotation.x=-Math.PI/2;const height=id==='scarecrow'?1.9:1.8;native.scale.setScalar(height/8.18);
 group.userData.features=s.features;group.userData.playerRigCompatible=true;group.userData.boneSignature=rig.bones.map(b=>[b.name,b.parent?.isBone?b.parent.name:null,...rig.rest[b.name].p.toArray()]);
 return finishActor(group,rig,clips,entry,{variants:{head:look.head,hair:look.hair,body:look.body,armor:look.armor??'bare'}});
}
