import * as THREE from 'three';
import {driftingFoliage} from './foliage.js';
import {createParticles} from './particles.js';
import {glow,ring} from './shapes.js';

export async function ambientEffect(root,entry){
 const updates=[],{style,radius,duration,color}=entry;
 if(style==='butterfly'){
  const wingGeometry=new THREE.SphereGeometry(1,6,3),bodies=new THREE.SphereGeometry(1,6,3);
  for(let i=0;i<18;i++){
   const butterfly=new THREE.Group();butterfly.name=`Butterfly ${i+1}`;root.add(butterfly);
   const mat=new THREE.MeshStandardMaterial({color:i%3?'#f0dbad':'#d28a3f',roughness:.8,flatShading:true});
   const body=new THREE.Mesh(bodies,new THREE.MeshStandardMaterial({color:'#4a3830',roughness:.9}));body.scale.set(.015,.016,.065);butterfly.add(body);
   const wings=[-1,1].map(side=>{const pivot=new THREE.Group();butterfly.add(pivot);const wing=new THREE.Mesh(wingGeometry,mat);wing.scale.set(.085,.009,.07);wing.position.x=side*.07;pivot.add(wing);return pivot;});
   updates.push(t=>{const a=i*2.399+t*(.13+i*.003);butterfly.position.set(Math.cos(a)*(.4+i*.09),.4+(i%5)*.17+Math.sin(t*1.7+i)*.13,Math.sin(a)*(.4+i*.07));butterfly.rotation.y=-a;wings[0].rotation.z=Math.sin(t*19+i)*.7;wings[1].rotation.z=-wings[0].rotation.z;});
  }
 }else if(style==='crows'){
  const {createCreatureModel}=await import('../../models/creatures/index.js');
  for(let i=0;i<6;i++){const actor=await createCreatureModel('crow');(root.__effectActors||=[]).push(actor);const carrier=new THREE.Group();carrier.name=`Flock bird ${i+1}`;carrier.add(actor.group);root.add(carrier);updates.push(t=>{const p=(t%duration)/duration;actor.update(t,'fly');carrier.position.set((i-2.5)*.45+Math.sin(p*2+i)*.3,.25+p*2.2+(i%2)*.18,-1+p*3.4-i*.2);carrier.rotation.y=Math.sin(p*2)*.35;});}
 }else if(style==='leaves'){updates.push(driftingFoliage(root,entry));
 }else{
  const modes={motes:0,pollen:0,smoke:1,mist:2,rain:3,leaves:4,spray:8};
  const particles=createParticles({count:style==='rain'?320:style==='mist'?40:style==='smoke'?44:100,color,mode:modes[style],radius,duration,size:style==='mist'?46:style==='smoke'?24:style==='pollen'?1.3:style==='leaves'?3.4:style==='rain'?3:2.3,seed:entry.id.length*117});root.add(particles.group);updates.push(particles.update);
  if(style==='rain'||style==='spray')for(let i=0;i<12;i++){const ripple=ring(root,`Water ripple ${i+1}`,.2,color,{width:.007,opacity:.3});ripple.position.x=Math.sin(i*7)*radius*.65;ripple.position.z=Math.cos(i*5)*radius*.6;updates.push(t=>{const p=(t*.6+i/12)%1;ripple.scale.setScalar(.2+p*2);ripple.material.opacity=(1-p)*.25;});}
  if(style==='pollen'){const ray=new THREE.Mesh(new THREE.ConeGeometry(.6,3,24,1,true),glow('#ead8ac',.025));ray.name='Shaft of woodland light';ray.position.y=1.6;root.add(ray);}
 }
 return updates;
}
