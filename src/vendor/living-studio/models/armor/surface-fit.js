import * as THREE from 'three';

/** A body morph is nonlinear across a facet. Refit relief to the final support surface. */
export function fitArmorSurfaces(h,bodyType,fit){
 if(bodyType!=='female'){fit();return;}
 const meshes=h.root.children.filter(mesh=>mesh.isMesh),names=new Map(meshes.map(mesh=>[mesh.name,mesh])),layers=[];
 const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),point=new THREE.Vector3(),closest=new THREE.Vector3(),bary=new THREE.Vector3(),triangle=new THREE.Triangle(a,b,c);
 const project=(support,x,z,side)=>{
  try{return h.surface(support,x,z,side);}catch{
   // A transformed point on an original edge can fall just beyond the new straight edge.
   // Move it onto the nearest projected triangle instead of leaving a hanging sliver.
   const p=support.geometry.attributes.position;let distance=Infinity,result;point.set(x,0,z);
   for(let i=0;i<p.count;i+=3){
    a.set(p.getX(i),0,p.getZ(i));b.set(p.getX(i+1),0,p.getZ(i+1));c.set(p.getX(i+2),0,p.getZ(i+2));
    if(triangle.getArea()<1e-10)continue;triangle.closestPointToPoint(point,closest);const d=point.distanceToSquared(closest);
    if(d>distance+1e-12)continue;triangle.getBarycoord(closest,bary);const y=p.getY(i)*bary.x+p.getY(i+1)*bary.y+p.getY(i+2)*bary.z;
    if(d<distance-1e-12||!result||y*side>result[1]*side){distance=d;result=[closest.x,y,closest.z];}
   }
   if(!result)throw new Error(`${support.name}: no fitted support surface`);return result;
  }
 };
 for(const mesh of meshes){
  const layer=mesh.userData.armorSurfaceLayer||mesh.userData.armorSurfaceWrap;if(!layer)continue;
  const support=names.get(mesh.userData.armorSupports[0]),positions=mesh.geometry.attributes.position,offsets=[];
  for(let i=0;i<positions.count;i++)offsets.push(positions.getY(i)-project(support,positions.getX(i),positions.getZ(i),layer.side)[1]);
  layers.push({mesh,support,side:layer.side,offsets});
 }
 fit();
 // Builders emit supporting shells before their dependent facings and relief.
 for(const{mesh,support,side,offsets}of layers){
  const positions=mesh.geometry.attributes.position;
  for(let i=0;i<positions.count;i++){
   const fitted=project(support,positions.getX(i),positions.getZ(i),side);positions.setXYZ(i,fitted[0],fitted[1]+offsets[i]*.965,fitted[2]);
  }
  positions.needsUpdate=true;mesh.geometry.computeVertexNormals();mesh.geometry.computeBoundingBox();mesh.geometry.computeBoundingSphere();
 }
}
