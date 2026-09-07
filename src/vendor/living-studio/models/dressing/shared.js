import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {kit, random, disposeStructure} from '../structures/primitives.js';

export {THREE, kit, random};
export const TAU = Math.PI * 2;

export function leaf(k, name, position, length, width, color='leaf', rotation=[0,0,0], lobed=false) {
  // Folded, pointed botanical blade. The shallow ridge catches grazing light.
  const outline=lobed?[[0,0],[-.28,.18],[-.52,.28],[-.32,.48],[-.48,.65],[-.18,.72],[0,1],[.18,.72],[.48,.65],[.32,.48],[.52,.28],[.28,.18]]:[[0,0],[-.5,.3],[-.38,.7],[0,1],[.38,.7],[.5,.3]];
  const vertices=[];
  for(let i=0;i<outline.length;i++){
    const a=outline[i],b=outline[(i+1)%outline.length];
    vertices.push(0,length*.48,width*.10,a[0]*width,a[1]*length,0,b[0]*width,b[1]*length,0);
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  const o=k.mesh(name,g,color);o.position.set(...position);o.rotation.order='YXZ';o.rotation.set(...rotation);o.material.side=THREE.DoubleSide;return o;
}

export function tube(k,name,points,radius,material='wood',sides=6) {
  const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
  return k.mesh(name,new THREE.TubeGeometry(curve,Math.max(3,points.length*2),radius,sides,false),material);
}

export function flower(k,name,p,color='flower',radius=.05,petals=5) {
  k.sphere(`${name} pollen`,p,[radius*.23,radius*.18,radius*.23],'straw',0);
  for(let i=0;i<petals;i++){
    const a=i/ petals*TAU;
    const petal=leaf(k,`${name} petal ${i+1}`,[p[0],p[1],p[2]],radius,radius*.7,color,[Math.PI/2,a,0]);
    petal.rotation.set(Math.PI/2,0,-a);
  }
}

export function plank(k,name,p,s,color='woodLight') {
  const o=k.box(name,p,s,color,.012);
  if(s[0]>.3)for(const x of [-1,1])k.cylinder(`${name} peg ${x}`,[p[0]+x*(s[0]/2-.035),p[1]+s[1]/2+.003,p[2]],.008,.008,.006,'iron',6);
  return o;
}

export function disk(k,name,p,radius,material,segments=24) {
  const o=k.mesh(name,new THREE.CircleGeometry(radius,segments),material);o.rotation.x=-Math.PI/2;o.position.set(...p);o.material.side=THREE.DoubleSide;return o;
}

export function grass(k,seed,span=1,count=14,height=.25,color='leaf') {
  const rand=random(seed);
  for(let i=0;i<count;i++){
    const x=(rand()-.5)*span,z=(rand()-.5)*span;
    leaf(k,`${seed} grass ${i}`,[x,0,z],height*(.5+rand()*.5),height*.12,color,[.2*(rand()-.5),rand()*TAU,.4*(rand()-.5)]);
  }
}

export function log(k,name,p,length,radius=.15,axis='x') {
  const g=k.group(name,p),q=kit(g);
  const trunk=q.cylinder(`${name} bark`,[0,0,0],radius*.94,radius,length,'wood',9);
  trunk.rotation.z=axis==='x'?Math.PI/2:0;
  for(const side of [-1,1]){
    const end=q.cylinder(`${name} cut ${side}`,axis==='x'?[side*(length/2+.003),0,0]:[0,side*(length/2+.003),0],radius*.91,radius*.91,.008,'endgrain',9);
    end.rotation.z=trunk.rotation.z;
    for(const scale of [.42,.7]){
      const ring=q.torus(`${name} growth ring ${side} ${scale}`,axis==='x'?[side*(length/2+.009),0,0]:[0,side*(length/2+.009),0],radius*scale,.004,'woodDark',axis==='x'?[0,Math.PI/2,0]:[Math.PI/2,0,0],12);
      ring.userData.detail='End grain';
    }
  }
  return g;
}

export function ladder(k,name,from,to,width=.5,rungs=8) {
  for(const x of [-1,1])k.beam(`${name} rail ${x}`,[from[0]+x*width/2,from[1],from[2]],[to[0]+x*width/2,to[1],to[2]],.065,.065,'wood');
  for(let i=0;i<rungs;i++){
    const t=(i+.6)/rungs,p=from.map((n,j)=>n+(to[j]-n)*t);
    k.beam(`${name} rung ${i}`,[p[0]-width/2,p[1],p[2]],[p[0]+width/2,p[1],p[2]],.045,.05,'woodLight');
  }
}

export function lantern(k,name,p,scale=.3,lit=true) {
  const group=k.group(name,p),q=kit(group);
  q.box(`${name} light chamber`,[0,0,0],[scale*.55,scale*.75,scale*.55],lit?'glass':'black',.005);
  for(const y of [-.45,.45])q.box(`${name} iron rim ${y}`,[0,y*scale,0],[scale*.7,scale*.09,scale*.7],'iron');
  for(const x of [-1,1])for(const z of [-1,1])q.beam(`${name} corner ${x} ${z}`,[x*scale*.32,-scale*.43,z*scale*.32],[x*scale*.32,scale*.43,z*scale*.32],scale*.06,scale*.06,'iron');
  q.cone(`${name} rain cap`,[0,scale*.57,0],scale*.53,scale*.24,'iron',4).rotation.y=Math.PI/4;
  q.torus(`${name} hanging ring`,[0,scale*.84,0],scale*.15,scale*.035,'iron');
  if(lit)group.userData.effectSockets=[{effect:'warm_glow',position:[0,0,0]}];
  return group;
}

export function motion(group,kind,options={}) {
  group.userData.motion={kind,...options};return group;
}

function batchGroup(group) {
  for(const child of [...group.children])if(child.isGroup||child.isBone)batchGroup(child);
  const buckets=new Map();
  for(const mesh of [...group.children]){
    if(!mesh.isMesh||mesh.userData.motion)continue;
    const material=Array.isArray(mesh.material)?mesh.material[0]:mesh.material;
    const key=JSON.stringify([material.color.getHex(),material.roughness,material.metalness,material.side,material.transparent,material.opacity,material.emissive?.getHex(),material.emissiveIntensity,material.map?.uuid]);
    if(!buckets.has(key))buckets.set(key,{material,geometries:[],names:[],originals:[]});
    mesh.updateMatrix();const g=mesh.geometry.clone().applyMatrix4(mesh.matrix);
    if(!g.attributes.uv)g.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count*2),2));
    const bucket=buckets.get(key);bucket.geometries.push(g.index?g.toNonIndexed():g);if(g.index)g.dispose();bucket.names.push(mesh.name);bucket.originals.push(mesh);
  }
  for(const bucket of buckets.values()){
    if(bucket.originals.length<2){for(const g of bucket.geometries)g.dispose();continue;}
    const merged=mergeGeometries(bucket.geometries,false);for(const g of bucket.geometries)g.dispose();
    if(!merged)throw new Error(`Could not batch ${group.name}`);
    const output=new THREE.Mesh(merged,bucket.material);output.name=bucket.names[0];output.userData.partNames=bucket.names;output.castShadow=true;output.receiveShadow=true;group.add(output);
    for(const original of bucket.originals){original.geometry.dispose();original.removeFromParent();}
  }
}

/** Artist master bounds are fitted once. Metadata preserves source footprint separately. */
export function finishModel(content,entry,{batch=true,size=entry.size,sourceSize=null,clips=[]}={}) {
  content.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(content,true),span=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());
  if(!Number.isFinite(span.length())||span.x<=0||span.z<=0)throw new Error(`Empty model: ${entry.id}`);
  const factor=new THREE.Vector3(1,1,1);
  if(size)factor.set(size[0]/span.x,size[2]>0?size[2]/span.y:1,size[1]/span.z);
  else if(sourceSize){const native=sourceSize.axis==='width'?span.x:span.y;factor.setScalar(sourceSize.metres/native);}
  content.scale.multiply(factor);content.position.set(-center.x*factor.x,-bounds.min.y*factor.y,-center.z*factor.z);
  const root=new THREE.Group();root.name=entry.id;root.add(content);
  const parts=[];let triangles=0;
  content.traverse(o=>{
    if(o.isMesh){parts.push(o.name);triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;}
    if(o.userData.motion)o.userData.restPose={position:o.position.toArray(),rotation:o.rotation.toArray().slice(0,3),scale:o.scale.toArray()};
  });
  if(batch)batchGroup(content);
  let drawCalls=0;content.traverse(o=>{if(o.isMesh)drawCalls++;});
  root.updateMatrixWorld(true);const measured=new THREE.Box3().setFromObject(root,true).getSize(new THREE.Vector3());
  root.userData={assetId:entry.id,category:entry.category,sourceUrl:entry.sourceUrl,source:entry.source,sourceSize:entry.sourceSize??entry.size??null,dimensions:{width:measured.x,depth:measured.z,height:measured.y},units:'metres',upAxis:'Y',parts,triangles,drawCalls,clips,quality:'Studio master',runtimeTriangleBudget:entry.type==='forage'?800:null};
  return root;
}

export function updateLivingModel(root,time,clip='idle') {
  const t=Number.isFinite(time)?time:0;
  root.traverse(o=>{
    const m=o.userData.motion,p=o.userData.restPose;if(!m||!p)return;
    o.position.fromArray(p.position);o.rotation.set(...p.rotation);o.scale.fromArray(p.scale);
    const wave=Math.sin(t*(m.speed||1.5)+(m.phase||0)),amount=m.amount??.06;
    switch(m.kind){
      case 'sway':o.rotation.z+=wave*amount;break;
      case 'swing':o.rotation.x+=wave*amount;break;
      case 'flap':o.rotation[m.axis||'z']+=Math.sin(t*(clip==='flap'||clip==='hover'?(m.speed||5):1.1)+(m.phase||0))*amount*(clip==='flap'||clip==='hover'?1:.08);break;
      case 'breath':o.scale.y*=1+wave*amount;if(clip==='stretch')o.scale.x*=1+Math.max(0,Math.sin(t))* .13;break;
      case 'head':o.rotation.z+=(clip==='graze'?-.45:clip==='startle'?.2:clip==='low'?.12:0)+wave*amount*(clip==='low'?3:1);break;
      case 'leg':if(clip==='walk')o.rotation.z+=Math.sin(t*4+(m.phase||0))*.32;break;
      case 'tail':o.rotation.x+=wave*amount;break;
      case 'hover':o.position.y+=wave*amount;if(clip==='dart')o.position.x+=Math.sin(t*3.2)*amount*3;break;
    }
  });
}

export function disposeLivingModel(root){disposeStructure(root);}
