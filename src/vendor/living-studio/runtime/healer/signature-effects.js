import * as THREE from 'three';
import {colors} from './resources.js';
import {groundSeal,symbol,pillar,helix} from './primitives.js';
import {motes} from './motes.js';
import {fragments} from './fragments.js';
import {heavenlyBolt} from './lightning.js';
import {resurrectedSoul} from './soul.js';

const ease=THREE.MathUtils.smoothstep;
const assemble=(name,parts)=>{const root=new THREE.Group();root.name=name;parts.forEach(part=>root.add(part.root));return root;};
const sample=(parts,time,opacity)=>parts.forEach(part=>part.sample(time,opacity));

export function consecrateWeapon(resources){
  const color=new THREE.Color(2.1,.38,.025),weapon=new THREE.Group(),seal=groundSeal(resources,colors.gold,{radius:.7}),bodyRibbon=helix(resources,colors.gold,{radius:.63,height:1.9,turns:1.2,width:.065,speed:.5});
  weapon.name='Consecrated weapon light';const fire=motes(resources,color,{count:128,radius:.064,height:1,mode:2,size:.038}),edge=helix(resources,color,{radius:.047,height:1,turns:3.2,width:.026,speed:1.45,taper:.35}),core=pillar(resources,colors.gold,{radius:.038,height:1});
  weapon.add(fire.root,edge.root,core.root);const root=assemble('Consecrate weapon: living blade-bound firelight',[seal,bodyRibbon]);root.add(weapon);const direction=new THREE.Vector3(),up=new THREE.Vector3(0,1,0);
  return {root,sample(state){const power=state.envelope*(.1+.9*state.released);direction.subVectors(state.anchors.weaponTip,state.anchors.weaponBase);const length=direction.length();weapon.position.copy(state.anchors.weaponBase);weapon.quaternion.setFromUnitVectors(up,length>1e-8?direction.multiplyScalar(1/length):up);weapon.scale.set(1,Math.max(.001,length),1);weapon.visible=length>.025;sample([fire,edge,core],state.time,power);core.sample(state.time,power*.7);seal.sample(state.time,state.envelope*.5);bodyRibbon.sample(state.time,power*.5);}};
}

export function smite(resources){
  const color=colors.gold,seal=groundSeal(resources,color,{radius:.94,complexity:1}),bolt=heavenlyBolt(resources,color),impact=groundSeal(resources,color,{radius:.42,complexity:1}),sparks=motes(resources,color,{count:96,radius:.8,height:2.05,mode:4,size:.035}),charge=symbol(resources,color,{kind:'sun',size:.22}),beam=pillar(resources,color,{radius:.2,height:3.12});
  const releaseGroup=new THREE.Group();releaseGroup.name='Smite release column';releaseGroup.add(seal.root,bolt.root,impact.root,sparks.root,beam.root);const root=assemble('Smite: jagged heavenly strike',[charge]);root.add(releaseGroup);
  return {root,sample(state){const age=Math.max(0,state.age),hit=state.age<0?0:Math.exp(-age*2.7)*ease(age,0,.025),after=state.envelope*state.released;releaseGroup.position.set(state.anchors.releaseHand.x,0,state.anchors.releaseHand.z);charge.root.position.copy(state.anchors.hand);charge.sample(state.time,state.age<0?state.envelope*state.charge*.6:Math.exp(-age*9)*.4);bolt.sample(state.time,hit*(.8+.2*Math.sin(state.time*67.)**2));beam.sample(state.time,hit*.6);sparks.material.uniforms.uAge.value=age;sparks.sample(state.time,after);sparks.root.scale.setScalar(1);seal.sample(state.time,after*.58);impact.sample(state.time,hit*.95);impact.root.scale.setScalar(.3+Math.sqrt(age)*1.45);}};
}

export function resurrect(resources,actor,parent){
  const color=colors.blue,seal=groundSeal(resources,color,{radius:.88,complexity:1}),shaft=pillar(resources,color,{radius:.46,height:3.12}),ribbon=helix(resources,color,{radius:.64,height:2.96,turns:2.45,width:.077,speed:.6}),sparks=motes(resources,color,{count:92,radius:.56,height:3.08,size:.018}),soul=resurrectedSoul(resources,actor,parent,color);
  const root=assemble('Resurrect: rising character soul',[seal,shaft,ribbon,sparks,soul]);
  return {root,capture:soul.capture,sample(state){const power=state.envelope*state.released;sample([seal,shaft,ribbon,sparks],state.time,power);seal.sample(state.time,state.envelope*(.3+.45*state.charge));shaft.sample(state.time,power*.7);soul.root.position.set(0,Math.min(1.12,.42+Math.max(0,state.age)*.55),0);soul.root.scale.set(1,1.12,1);soul.sample(state.time,power*ease(state.age,.02,.4)*.98);}};
}

export function cleanse(resources){
  const color=colors.white,seal=groundSeal(resources,color,{radius:.86,complexity:1}),shaft=pillar(resources,color,{radius:.44,height:3.12}),ribbons=[helix(resources,colors.blue,{radius:.69,height:2.85,turns:1.8,width:.085,speed:.85}),helix(resources,color,{radius:.64,height:2.9,turns:1.8,width:.035,speed:-.65,phase:Math.PI})],sun=symbol(resources,color,{kind:'compass',size:.32}),sparks=motes(resources,color,{count:86,radius:.6,height:3.1,size:.017}),curse=fragments(resources,{color:colors.violet,count:52,mode:'curse',seed:93});
  sun.root.position.y=2.86;const parts=[seal,shaft,...ribbons,sun,sparks],root=assemble('Cleanse: purifying beam and released curse',[...parts,curse]);
  return {root,sample(state){const power=state.envelope*(.05+.95*state.released);sample(parts,state.time,power);shaft.sample(state.time,power*.64);const scatter=ease(state.age,0,1.65);curse.sample(state.time,state.envelope*(.5+.5*state.charge)*(1-ease(state.age,.8,2.25)),scatter);seal.sample(state.time,state.envelope*(.3+.4*state.charge));}};
}

export function stoneSkin(resources){
  const color=colors.stone,seal=groundSeal(resources,colors.gold,{radius:.87}),stones=fragments(resources,{color,count:38,mode:'stone'}),shaft=pillar(resources,colors.gold,{radius:.4,height:2.2}),dust=motes(resources,colors.gold,{count:46,radius:.79,height:2.1,size:.011});
  const root=assemble('Stone skin: orbiting faceted armor',[seal,stones,shaft,dust]);
  return {root,sample(state){const power=state.envelope*(.05+.95*state.released);stones.sample(state.time,power,ease(state.age,-.12,.8));shaft.sample(state.time,power*.1);dust.sample(state.time,power*.55);seal.sample(state.time,state.envelope*.34);}};
}
