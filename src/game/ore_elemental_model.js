import * as THREE from 'three';
import {ORE_ELEMENTAL} from '../mmo/ore_elementals.js';
export function buildOreElemental(id){
 const e=ORE_ELEMENTAL[id];if(!e)return null;
 const group=new THREE.Group(),root=new THREE.Group();group.add(root);group.name=id;
 const stone=new THREE.MeshStandardMaterial({color:e.color,roughness:e.ore==='voidrock'?.98:.52,metalness:e.ore==='voidrock'?.02:.7,flatShading:true});
 const core=new THREE.MeshStandardMaterial({color:e.glow,emissive:e.glow,emissiveIntensity:1.8,roughness:.25,metalness:.25});
 const geo=new THREE.IcosahedronGeometry(1,0),crystal=new THREE.ConeGeometry(.3,1,5),pieces=[],arms=[];let t=0,anim='idle',attack=0,death=0;
 const size=1+e.index*.025;
 const rock=(parent,x,y,z,sx,sy,sz,material=stone)=>{const m=new THREE.Mesh(geo,material);m.position.set(x,y,z);m.scale.set(sx,sy,sz);m.rotation.set(x*1.2,z+.2,y*.5);parent.add(m);pieces.push({m,base:m.position.clone()});return m;};
 rock(root,0,2.25,0,1.05,1.2,.7);rock(root,0,3.65,0,.57,.6,.52);
 rock(root,0,2.6,.66,.32,.47,.16,core);
 for(const x of [-.22,.22])rock(root,x,3.78,.48,.12,.06,.08,core);
 for(const sign of [-1,1]){
  rock(root,sign*.58,.68,0,.46,.72,.43);rock(root,sign*.59,.17,.2,.53,.25,.67);
  const arm=new THREE.Group();arm.position.set(sign*1.02,3.0,0);root.add(arm);arms.push(arm);
  rock(arm,sign*.2,-.15,0,.65,.72,.62);rock(arm,sign*.47,-1.02,.1,.48,.63,.48);rock(arm,sign*.52,-1.65,.1,.63,.48,.6);
  for(let i=0;i<3+(e.index%4);i++){const m=new THREE.Mesh(crystal,i%2?stone:core);m.position.set(sign*(.85+i*.12),3.3+i*.14,-.2);m.rotation.z=-sign*(.5+i*.12);m.scale.setScalar(.8+i*.14);root.add(m);}
 }
 const satellites=[];for(let i=0;i<4+e.index;i++){const m=rock(root,0,0,0,.13,.23,.16,i%3?stone:core);satellites.push(m);}
 root.scale.setScalar(size);
 const hit=new THREE.Mesh(new THREE.CylinderGeometry(1.15,1.15,4.4,8),new THREE.MeshBasicMaterial({visible:false}));hit.position.y=2.2;group.add(hit);
 return {group,parts:{root,hit,arms},radius:1.05,height:4.4*size,silhouette:4.4*size,shape:'biped',monster:id,
 setAnim(name){if(name==='swing'||name==='attack'){attack=.7;return;}anim=name;},get anim(){return anim;},get dieDone(){return anim==='die'&&death>2.5;},
 update(dt,speed=0){dt=Math.min(.1,Math.max(0,dt||0));t+=dt;attack=Math.max(0,attack-dt);
  if(anim==='die'){death+=dt;root.position.y=-Math.min(3,death*1.4);root.rotation.z=death*.17;for(let i=0;i<pieces.length;i++){const p=pieces[i];p.m.position.copy(p.base).add(new THREE.Vector3(Math.sin(i*9)*death*.4,-death*(i%3)*.15,Math.cos(i*7)*death*.4));}return;}
  root.position.y=-4*Math.max(0,1-t/1.5)+Math.sin(t*2)*.06;
  arms.forEach((arm,i)=>{arm.rotation.x=attack?-Math.sin((.7-attack)/.7*Math.PI)*1.8:Math.sin(t*Math.max(1,speed)*1.5+i*Math.PI)*Math.min(.25,speed*.08);});
  satellites.forEach((m,i)=>{const a=t*(.3+e.index*.02)+i*Math.PI*2/satellites.length;m.position.set(Math.cos(a)*1.45,1.5+Math.sin(a*2+i)*.6,Math.sin(a)*1.1);m.rotation.x=t+i;});core.emissiveIntensity=1.5+Math.sin(t*3)*.4;
 },dispose(){geo.dispose();crystal.dispose();hit.geometry.dispose();hit.material.dispose();stone.dispose();core.dispose();group.removeFromParent();}};
}
