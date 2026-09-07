import * as THREE from 'three';

import {clipProjectedPolygon as clip} from '../surface-polygon.js';

/** Clip the entire facing to support facets, including all bends between its endpoints. */
export function mountedSurface(h,name,footprints,support,mat,{side=-1,thickness=.027}={}){
 const positions=support.geometry.attributes.position,vertices=[],faces=[],unique=new Map();
 const add=p=>{const key=p.map(n=>Math.round(n*1e7)).join(':');if(!unique.has(key)){unique.set(key,vertices.length);vertices.push(p);}return unique.get(key);};
 const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),normal=new THREE.Vector3();
 for(let i=0;i<positions.count;i+=3){
  a.fromBufferAttribute(positions,i);b.fromBufferAttribute(positions,i+1);c.fromBufferAttribute(positions,i+2);
  normal.copy(b).sub(a).cross(c.clone().sub(a));if(Math.abs(normal.y)<1e-9)continue;
  const triangle=[[a.x,a.z],[b.x,b.z],[c.x,c.z]];
  const yAt=(x,z)=>a.y-(normal.x*(x-a.x)+normal.z*(z-a.z))/normal.y;
  for(const footprint of footprints){
   const polygon=clip(footprint,triangle);if(polygon.length<3)continue;
   const center=polygon.reduce((p,v)=>[p[0]+v[0]/polygon.length,p[1]+v[1]/polygon.length],[0,0]);
   const outer=h.surface(support,center[0],center[1],side);
   if(Math.abs(outer[1]-yAt(...center))>.0001)continue;
   const face=polygon.map(([x,z])=>add([x,yAt(x,z)+side*thickness,z]));
   if(new Set(face).size>=3)faces.push(face);
  }
 }
 if(!faces.length)throw new Error(`${h.profile.id}: ${name} has no exposed mounting area`);
 const mesh=h.attached(h.thicken(name,vertices,faces,-side*(thickness+.013),mat),support);
 // The first faces are the visible skin. Tests check their interiors for buried strips.
 let frontVertices=0;
 for(const face of faces)for(let i=1;i<face.length-1;i++){
  a.fromArray(vertices[face[0]]);b.fromArray(vertices[face[i]]);c.fromArray(vertices[face[i+1]]);
  if(b.sub(a).cross(c.sub(a)).lengthSq()>1e-12)frontVertices+=3;
 }
 mesh.userData.armorSurfaceLayer={side,thickness,frontVertices};return mesh;
}

export function panelFootprint(outline){
 const contour=outline.map(p=>new THREE.Vector2(...p));
 return THREE.ShapeUtils.triangulateShape(contour,[]).map(face=>face.map(i=>outline[i]));
}
export function stripFootprints(path,width){
 const edges=path.map(([x,z],i)=>{
  const a=path[Math.max(0,i-1)],b=path[Math.min(path.length-1,i+1)],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
  return [-1,1].map(sign=>[x+sign*(b[1]-a[1])/length*width/2,z-sign*(b[0]-a[0])/length*width/2]);
 });
 return edges.slice(1).map((edge,i)=>[edges[i][0],edges[i][1],edge[1],edge[0]]);
}
