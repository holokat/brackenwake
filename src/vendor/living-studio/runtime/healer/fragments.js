import * as THREE from 'three';
import {seeded} from './resources.js';

export function fragments(resources,{color,count=36,mode='stone',seed=43}={}){
  const geometry=resources.geometry(mode==='stone'?'faceted-stones':'curse-shards',()=>mode==='stone'?new THREE.IcosahedronGeometry(1,0):new THREE.OctahedronGeometry(1,0));
  const material=resources.ownMaterial(new THREE.MeshStandardMaterial({color,roughness:mode==='stone'?.87:.34,metalness:mode==='stone'?.08:.22,emissive:mode==='stone'?'#716c61':'#4d1776',emissiveIntensity:mode==='stone'?.035:.26,transparent:true,opacity:0,depthWrite:false,flatShading:true}));
  const root=new THREE.InstancedMesh(geometry,material,count);root.name=mode==='stone'?'Orbiting faceted stone armor':'Dispersing violet curse shards';root.frustumCulled=false;
  const random=seeded(seed),entries=Array.from({length:count},(_,i)=>({angle:i/count*Math.PI*2,phase:random()*7,y:mode==='stone'?.28+Math.pow(random(),.62)*1.65:.16+random()*1.8,size:mode==='stone'?.047+random()*.085:.018+random()*.045,radius:mode==='stone'?.30+random()*.17:.55+random()*.2}));
  const dummy=new THREE.Object3D(),instanceColor=new THREE.Color();for(let i=0;i<count;i++){instanceColor.setScalar(.66+random()*.58);root.setColorAt(i,instanceColor);}
  return {root,material,sample(time,opacity,progress=0){root.visible=opacity>.0001;material.opacity=opacity*.97;for(let i=0;i<count;i++){const entry=entries[i],a=entry.angle+time*(mode==='stone'?.12:.5);const rise=mode==='stone'?Math.min(1,progress*2):1,scatter=mode==='stone'?1:1+progress*1.5;dummy.position.set(Math.cos(a)*entry.radius*scatter,(entry.y+Math.sin(time*.9+entry.phase)*.032)*rise,Math.sin(a)*entry.radius*scatter);if(mode==='stone'&&entry.y>1.53&&dummy.position.z>.08)dummy.position.z=-.13-Math.abs(dummy.position.z)*.45;dummy.rotation.set(entry.phase+time*.14,a,time*.1);const scale=entry.size*(mode==='stone'?.7+rise*.3:1-progress*.55);dummy.scale.set(scale*(mode==='stone'?1.2:1),scale*(mode==='stone'?1.7:3.6),scale*(mode==='stone'?.48:.7));dummy.updateMatrix();root.setMatrixAt(i,dummy.matrix);}root.instanceMatrix.needsUpdate=true;}};
}
