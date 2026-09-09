import * as T from 'three';
/** Remove only triangles inside successfully loaded authored room shells. */
export function cutCellarGeology(built,inside){
 const meshes=[built.parts.floor,built.parts.ceiling,...built.parts.walls];
 for(const mesh of meshes){
  if(!mesh?.geometry)continue;const g=mesh.geometry,p=g.attributes.position,keep=[];
  for(let i=0;i<p.count;i+=3){const x=(p.getX(i)+p.getX(i+1)+p.getX(i+2))/3,z=(p.getZ(i)+p.getZ(i+1)+p.getZ(i+2))/3;
   if(!inside(x,z))keep.push(i,i+1,i+2);}
  for(const [key,a]of Object.entries(g.attributes)){
   const values=new a.array.constructor(keep.length*a.itemSize);keep.forEach((v,j)=>{for(let k=0;k<a.itemSize;k++)values[j*a.itemSize+k]=a.array[v*a.itemSize+k];});
   g.setAttribute(key,new T.BufferAttribute(values,a.itemSize,a.normalized));
  }
  g.computeBoundingSphere();
 }
}
