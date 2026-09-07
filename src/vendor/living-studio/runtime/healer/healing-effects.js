import * as THREE from 'three';
import {colors} from './resources.js';
import {groundSeal,symbol,halo,pillar,helix,softDome} from './primitives.js';
import {motes} from './motes.js';

const group=(name,parts)=>{const root=new THREE.Group();root.name=name;parts.forEach(part=>root.add(part.root));return root;};
const sample=(parts,time,opacity)=>parts.forEach(part=>part.sample(time,opacity));
const ease=THREE.MathUtils.smoothstep;

export function heal(resources){
  const color=colors.green,seal=groundSeal(resources,color,{radius:.84}),ribbon=helix(resources,color,{radius:.73,height:2.62,width:.11,turns:2.15}),fine=helix(resources,color,{radius:.7,height:2.65,width:.033,phase:Math.PI,turns:2.15,speed:.8}),compass=symbol(resources,color,{kind:'compass',size:.31}),sparks=motes(resources,color,{count:84,radius:.72,height:2.75,size:.023});
  compass.root.position.y=2.66;const parts=[seal,ribbon,fine,compass,sparks],root=group('Heal: emerald ascension and compass',parts);
  return {root,sample(state){const power=state.envelope*(.2+state.released*.8);sample(parts,state.time,power);seal.sample(state.time,state.envelope*(.35+state.charge*.35));compass.root.position.y=2.6+Math.sin(state.time*.9)*.055;}};
}

export function greaterHeal(resources){
  const color=colors.gold,seal=groundSeal(resources,color,{radius:1.05,complexity:1}),beam=pillar(resources,color,{radius:.57,height:3.13}),ribbons=[helix(resources,color,{radius:.88,height:2.95,width:.115,turns:2.35}),helix(resources,color,{radius:.85,height:2.95,width:.035,turns:2.35,phase:Math.PI})],sun=symbol(resources,color,{kind:'sun',size:.41}),corona=halo(resources,color,{radius:.6}),sparks=motes(resources,color,{count:140,radius:.9,height:3.1,size:.025});
  sun.root.position.y=2.78;corona.root.position.y=2.5;
  const crosses=[[-.8,2.25,.12],[.86,1.8,.1],[-.65,2.7,-.2],[.8,2.65,-.12]].map(position=>{const part=symbol(resources,color,{kind:'cross',size:.23});part.root.position.set(...position);return part;});
  const parts=[seal,beam,...ribbons,sun,corona,sparks,...crosses],root=group('Greater heal: radiant shafts and holy crosses',parts);
  return {root,sample(state){const power=state.envelope*(.1+.9*state.released);sample(parts,state.time,power);beam.sample(state.time,power*.72);crosses.forEach((part,i)=>{part.sample(state.time,power*ease(state.age,.08+i*.08,.3+i*.08));part.root.position.y=[2.25,1.8,2.7,2.65][i]+Math.sin(state.time*.7+i)*.045;});seal.sample(state.time,state.envelope*(.25+state.charge*.55));}};
}

export function bless(resources){
  const color=colors.gold,seal=groundSeal(resources,color,{radius:1.0,complexity:1}),beam=pillar(resources,color,{radius:.46,height:2.9}),corona=halo(resources,color,{radius:.74}),sun=symbol(resources,color,{kind:'sun',size:.36}),sparks=motes(resources,color,{count:100,radius:.95,height:2.8,size:.021});
  const crosses=Array.from({length:6},()=>symbol(resources,color,{kind:'cross',size:.17}));sun.root.position.y=2.51;corona.root.position.y=2.5;
  const parts=[seal,beam,corona,sun,sparks,...crosses],root=group('Bless: floating solar corona',parts);
  return {root,sample(state){const power=state.envelope*(.1+.9*state.released);sample(parts,state.time,power);beam.sample(state.time,power*.43);corona.root.rotation.set(Math.PI/2,Math.sin(state.time*.6)*.09,state.time*.1);crosses.forEach((part,i)=>{const angle=i/6*Math.PI*2+state.time*.14;part.root.position.set(Math.cos(angle)*.93,1.7+(i%3)*.27+Math.sin(angle)*.05,Math.sin(angle)*.93);part.sample(state.time,power*.72);});seal.sample(state.time,state.envelope*.6);}};
}

export function sanctuary(resources){
  const color=colors.gold,seal=groundSeal(resources,color,{radius:1.34,complexity:1}),dome=softDome(resources,color,{radius:1.19}),cross=symbol(resources,color,{kind:'cross',size:.29}),sparks=motes(resources,color,{count:44,radius:1.03,height:2.08,size:.013});
  const runes=Array.from({length:4},()=>symbol(resources,color,{kind:'diamond',size:.18}));cross.root.position.y=2.5;
  const parts=[seal,dome,cross,sparks,...runes],root=group('Sanctuary: transparent ribbed protection dome',parts);
  return {root,sample(state){const power=state.envelope*(.06+.94*state.released);sample(parts,state.time,power);const size=.6+.4*ease(state.age,0,.4);dome.root.scale.set(1.19*size,2.2*size,1.19*size);runes.forEach((part,i)=>{const a=i*Math.PI/2+state.time*.07;part.root.position.set(Math.cos(a)*1.06,1.13,Math.sin(a)*1.06);part.sample(state.time,power*.65);});seal.sample(state.time,state.envelope*(.25+state.charge*.55));}};
}

export function layOnHands(resources){
  const color=colors.gold,seal=groundSeal(resources,color,{radius:.58}),focus=new THREE.Group(),sun=symbol(resources,color,{kind:'sun',size:.24}),sparks=motes(resources,color,{count:56,radius:.19,height:.5,mode:3,size:.026}),shaft=pillar(resources,color,{radius:.14,height:.8}),ribbon=helix(resources,color,{radius:.17,height:.5,width:.044,turns:1.7,speed:1.1});
  focus.name='Warm palm healing focus';focus.add(sun.root,sparks.root,shaft.root,ribbon.root);shaft.root.position.y=.45;const root=group('Lay on hands: concentrated palm healing',[seal]);root.add(focus);
  return {root,sample(state){const power=state.envelope*(.15+.85*state.released);focus.position.copy(state.anchors.hand);sample([sun,sparks,shaft,ribbon],state.time,power);shaft.sample(state.time,power*.52);seal.sample(state.time,state.envelope*.32);}};
}
