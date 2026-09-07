import * as THREE from 'three';
import {RoundedBoxGeometry} from 'three/addons/geometries/RoundedBoxGeometry.js';

export const palette={skin:'#BB8964',skin_light:'#BF8953',skin_dark:'#8F5C32',hair:'#302315',eye_white:'#CBB997',iris:'#59452B',black:'#251C12',steel:'#525F69',steel_edge:'#B5C1C5',steel_dark:'#242F3B',leather:'#63432F',leather_dark:'#2C211C',leather_light:'#896342',red:'#7D3321',red_dark:'#54291D',gold:'#B48B3F',blue:'#28486F',blue_dark:'#1A3048',green:'#4C5230',green_dark:'#303922',cloth_dark:'#34342A',wood:'#584125',wood_light:'#89663A',crystal:'#279D9C',crystal_light:'#69D9D0',bowstring:'#514636',violet:'#483C62',violet_dark:'#302A44'};
const cache=new Map();
export function material(key){
 if(typeof key!=='string')return key;
 if(!cache.has(key)){const metal=/steel|gold/.test(key),crystal=/crystal/.test(key),leather=/leather|wood/.test(key);cache.set(key,new THREE.MeshStandardMaterial({name:key,color:palette[key]||key,roughness:crystal?.22:metal?(key==='steel_dark'?.43:.31):leather?.66:.91,metalness:metal?.8:crystal?.12:0,flatShading:true,vertexColors:true,side:THREE.DoubleSide,emissive:crystal?(palette[key]||key):'#000000',emissiveIntensity:crystal?.28:0}));}
 return cache.get(key);
}
function randomSeed(s){let v=1;for(const c of s)v=(v*31+c.charCodeAt(0))>>>0;return()=>{v=(1664525*v+1013904223)>>>0;return v/4294967296;};}
export class Geometry {
 constructor(root){this.root=root;this.part='outfit';}
 mat(key){return material(key);}
 mesh(name,verts,faces,mat,options={}){
  if(typeof options==='number')options={variation:options};
  const p=[],col=[],rng=randomSeed(name),variation=Math.min(options.variation??.04,.065);
  for(const face of faces){for(let j=1;j<face.length-1;j++){const f=1+(rng()-.5)*variation*2;for(const k of [face[0],face[j],face[j+1]]){p.push(...verts[k]);col.push(f,f,f);}}}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));g.computeVertexNormals();
  const m=new THREE.Mesh(g,this.mat(mat));m.name=name;m.userData.materialKey=typeof mat==='string'?mat:mat.name;m.userData.part=this.part;m.castShadow=true;m.receiveShadow=true;this.root.add(m);return m;
 }
 loft(name,rings,mat,{n=12,phase=0,variation=.08,caps=true}={}){
  const v=[],f=[];for(const[x,y,z,rx,ry]of rings)for(let k=0;k<n;k++){const a=k*Math.PI*2/n+phase;v.push([x+rx*Math.sin(a),y-ry*Math.cos(a),z]);}
  for(let j=0;j<rings.length-1;j++)for(let k=0;k<n;k++){const a=j*n+k,b=j*n+(k+1)%n,c=(j+1)*n+(k+1)%n,d=(j+1)*n+k;f.push(...((j+k)%2?[[a,b,d],[b,c,d]]:[[a,b,c],[a,c,d]]));}
  if(caps)f.push(Array.from({length:n},(_,k)=>n-1-k),Array.from({length:n},(_,k)=>(rings.length-1)*n+k));
  return this.mesh(name,v,f,mat,{variation});
 }
 tube(name,points,radii,mat,{sides=8,variation=.08}={}){
  if(typeof radii==='number')radii=points.map(()=>radii);
  const p=points.map(x=>new THREE.Vector3(...x)),v=[],f=[];
  for(let j=0;j<p.length;j++){
   const t=p[Math.min(j+1,p.length-1)].clone().sub(p[Math.max(0,j-1)]).normalize();
   let a=new THREE.Vector3(0,-1,0);a.addScaledVector(t,-a.dot(t)).normalize();if(a.length()<.01)a.set(1,0,0);
   const b=new THREE.Vector3().crossVectors(t,a).normalize(),r=Array.isArray(radii[j])?radii[j]:[radii[j],radii[j]];
   for(let k=0;k<sides;k++)v.push(p[j].clone().addScaledVector(a,Math.cos(k*Math.PI*2/sides)*r[1]).addScaledVector(b,Math.sin(k*Math.PI*2/sides)*r[0]).toArray());
  }
  for(let j=0;j<p.length-1;j++)for(let k=0;k<sides;k++){const a=j*sides+k,b=j*sides+(k+1)%sides,c=(j+1)*sides+(k+1)%sides,d=(j+1)*sides+k;f.push([a,b,c],[a,c,d]);}
  f.push(Array.from({length:sides},(_,k)=>sides-1-k),Array.from({length:sides},(_,k)=>(p.length-1)*sides+k));
  return this.mesh(name,v,f,mat,{variation});
 }
 ico(name,center,scale,mat,{sub=1,variation=.08}={}){
  const geo=new THREE.IcosahedronGeometry(1,Math.max(0,sub-1));geo.scale(...scale);geo.translate(...center);
  const p=geo.getAttribute('position'),v=Array.from({length:p.count},(_,i)=>[p.getX(i),p.getY(i),p.getZ(i)]),f=Array.from({length:p.count/3},(_,i)=>[i*3,i*3+1,i*3+2]);geo.dispose();return this.mesh(name,v,f,mat,{variation});
 }
 cube(name,center,scale,mat,{bevel=0}={}){
  const geo=bevel?new RoundedBoxGeometry(...scale,1,Math.min(bevel,Math.min(...scale)*.4)):new THREE.BoxGeometry(...scale);geo.translate(...center);const p=geo.getAttribute('position'),v=Array.from({length:p.count},(_,i)=>[p.getX(i),p.getY(i),p.getZ(i)]),idx=geo.index?.array||Array.from({length:p.count},(_,i)=>i),f=Array.from({length:idx.length/3},(_,i)=>[idx[i*3],idx[i*3+1],idx[i*3+2]]);geo.dispose();return this.mesh(name,v,f,mat,{variation:.03});
 }
 ribbon(name,points,width,mat){const p=points.map(x=>new THREE.Vector3(...x)),v=[],f=[];for(let j=0;j<p.length;j++){const t=p[Math.min(j+1,p.length-1)].clone().sub(p[Math.max(0,j-1)]),a=new THREE.Vector3(t.z,0,-t.x).normalize().multiplyScalar(width/2);v.push(p[j].clone().sub(a).toArray(),p[j].clone().add(a).toArray());}for(let j=0;j<p.length-1;j++)f.push([j*2,j*2+1,j*2+3,j*2+2]);return this.mesh(name,v,f,mat,{variation:0});}
}
