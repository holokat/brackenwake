import * as THREE from 'three';
import {clipProjectedPolygon} from './surface-polygon.js';

const v=(p,i)=>new THREE.Vector3().fromBufferAttribute(p,i);
const projected=p=>[p.x,p.z];
const faceArea=points=>Math.abs(points.reduce((area,p,i)=>{const q=points[(i+1)%points.length];return area+p[0]*q[1]-q[0]*p[1];},0));

/** Front-facing polygon support in final body space, independent of materials. */
export function faceSurfaceSampler(mesh){
 const p=mesh.geometry.attributes.position,triangles=[];
 for(let i=0;i<p.count;i+=3){
  const a=v(p,i),b=v(p,i+1),c=v(p,i+2),normal=b.clone().sub(a).cross(c.clone().sub(a));
  if(Math.abs(normal.y)<1e-10)continue;
  triangles.push({outline:[a,b,c].map(projected),yAt:(x,z)=>a.y-(normal.x*(x-a.x)+normal.z*(z-a.z))/normal.y});
 }
 const at=(x,z)=>{
  let y=Infinity;
  for(const t of triangles){
   const [a,b,c]=t.outline,cross=(p,q)=>(q[0]-p[0])*(z-p[1])-(q[1]-p[1])*(x-p[0]);
   const s=[cross(a,b),cross(b,c),cross(c,a)];
   if(s.every(n=>n>=-1e-8)||s.every(n=>n<=1e-8))y=Math.min(y,t.yAt(x,z));
  }
  if(!Number.isFinite(y))throw Error(`${mesh.name}: unsupported facial point ${x},${z}`);
  return y;
 };
 return {triangles,at};
}

function geometry(vertices){
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
 g.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array(vertices.length).fill(1),3));g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();return g;
}
function emit(output,...points){
 for(let i=0;i<points.length;i+=3){
  // Clip intersections can repeat a boundary point. Test in the same Float32
  // precision used by the GPU so collapsed facets never receive zero normals.
  const triangle=points.slice(i,i+3).map(p=>p.map(Math.fround));
  const [a,b,c]=triangle.map(p=>new THREE.Vector3(...p));
  if(b.sub(a).cross(c.sub(a)).lengthSq()>1e-22)triangle.forEach(p=>output.push(...p));
 }
}

function convexOutline(mesh){
 const p=mesh.geometry.attributes.position,unique=new Map();for(let i=0;i<p.count;i++){const point=[p.getX(i),p.getZ(i)];unique.set(point.join(','),point);}
 const points=[...unique.values()].sort((a,b)=>a[0]-b[0]||a[1]-b[1]),cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
 const half=list=>{const out=[];for(const p of list){while(out.length>1&&cross(out.at(-2),out.at(-1),p)<=0)out.pop();out.push(p);}return out.slice(0,-1);};
 return [...half(points),...half([...points].reverse())];
}

/** Clip each visible patch to support facets, then close its sides into them. */
export function fitFaceLayer(mesh,support,{relief=.002,embed=.006,silhouette=false}={}){
 const p=mesh.geometry.attributes.position,footprints=[];
 if(silhouette)footprints.push(convexOutline(mesh));
 else for(let i=0;i<p.count;i+=3)footprints.push([v(p,i),v(p,i+1),v(p,i+2)].map(projected));
 const sampler=faceSurfaceSampler(support),front=[],backs=[],walls=[];
 for(const t of sampler.triangles)for(const footprint of footprints){
  const clipped=clipProjectedPolygon(footprint,t.outline);if(clipped.length<3||faceArea(clipped)<1e-10)continue;
  const center=clipped.reduce((sum,p)=>[sum[0]+p[0]/clipped.length,sum[1]+p[1]/clipped.length],[0,0]);
  if(Math.abs(sampler.at(...center)-t.yAt(...center))>1e-5)continue;
  const outer=clipped.map(([x,z])=>[x,t.yAt(x,z)-relief,z]),inner=clipped.map(([x,z])=>[x,t.yAt(x,z)+embed,z]);
  for(let i=1;i<clipped.length-1;i++){emit(front,outer[0],outer[i],outer[i+1]);emit(backs,inner[0],inner[i+1],inner[i]);}
  for(let i=0;i<clipped.length;i++){const j=(i+1)%clipped.length;emit(walls,outer[i],inner[i],inner[j],outer[i],inner[j],outer[j]);}
 }
 if(!front.length)throw Error(mesh.name+': facial layer has no support');
 const old=mesh.geometry;mesh.geometry=geometry([...front,...backs,...walls]);old.dispose();
 mesh.userData.faceSurface={support:support.name,relief,embed,frontVertices:front.length/3,backVertices:backs.length/3};
}

/** Close the existing nose's open base with a skirt that penetrates the head. */
export function joinNoseToHead(nose,head){
 const old=nose.geometry,p=old.attributes.position,edges=new Map(),key=p=>p.toArray().map(n=>n.toFixed(7)).join(',');
 for(let i=0;i<p.count;i+=3)for(const [a,b]of [[i,i+1],[i+1,i+2],[i+2,i]]){
  const va=v(p,a),vb=v(p,b),id=[key(va),key(vb)].sort().join('|');
  if(edges.has(id))edges.delete(id);else edges.set(id,[va,vb]);
 }
 const sampler=faceSurfaceSampler(head),vertices=[...p.array],embedded=[];
 for(const [a,b]of edges.values())for(let i=0;i<8;i++){
  const u=a.clone().lerp(b,i/8),w=a.clone().lerp(b,(i+1)/8);
  const ua=[u.x,sampler.at(u.x,u.z)+.012,u.z],wa=[w.x,sampler.at(w.x,w.z)+.012,w.z];
  emit(vertices,u.toArray(),w.toArray(),wa,u.toArray(),wa,ua);embedded.push(ua,wa);
 }
 const center=embedded.reduce((p,v)=>p.add(new THREE.Vector3(...v)),new THREE.Vector3()).multiplyScalar(1/embedded.length);
 center.y=sampler.at(center.x,center.z)+.014;
 for(let i=0;i<embedded.length;i+=2)emit(vertices,embedded[i],embedded[i+1],center.toArray());
 nose.geometry=geometry(vertices);nose.userData.faceConnection={support:head.name,foundation:embedded,embed:.012};
 if(old.attributes.color)nose.geometry.attributes.color.array.set(old.attributes.color.array);
 old.dispose();
}
