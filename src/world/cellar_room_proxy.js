import * as T from 'three';
import {createCellarLoadingGeometry} from './cellar_loading_geometry.js';

/** Detail eviction keeps a complete, inexpensive shell over the authoritative colliders. */
export function createCellarRoomProxy(colliders, floors = []) {
 const proxy=createCellarLoadingGeometry(colliders),material=new T.MeshStandardMaterial({color:0x565c62,roughness:.95}),geometries=[];
 for(const floor of floors){
  const polygon=floor.polygon||[[-floor.rx,-floor.rz],[floor.rx,-floor.rz],[floor.rx,floor.rz],[-floor.rx,floor.rz]];
  const shape=new T.Shape(polygon.map(([x,z])=>new T.Vector2(x,-z)));
  for(const hole of floor.holes||[]){
   const path=new T.Path();path.moveTo(hole.x-hole.w/2,-hole.z-hole.d/2);path.lineTo(hole.x+hole.w/2,-hole.z-hole.d/2);path.lineTo(hole.x+hole.w/2,-hole.z+hole.d/2);path.lineTo(hole.x-hole.w/2,-hole.z+hole.d/2);path.closePath();shape.holes.push(path);
  }
  const geometry=new T.ShapeGeometry(shape);geometries.push(geometry);
  const mesh=new T.Mesh(geometry,material);mesh.rotation.x=-Math.PI/2;mesh.position.set(floor.x||0,(floor.y||0)-.01,floor.z||0);proxy.group.add(mesh);
  if(floor.ceiling){
   let roofGeometry=geometry;
   if(floor.ceilingSolid&&shape.holes.length){const ceilingShape=shape.clone();ceilingShape.holes=[];roofGeometry=new T.ShapeGeometry(ceilingShape);geometries.push(roofGeometry);}
   const roof=new T.Mesh(roofGeometry,material);roof.rotation.x=Math.PI/2;roof.scale.y=-1;roof.material=material;roof.position.set(floor.x||0,(floor.y||0)+floor.ceiling,floor.z||0);proxy.group.add(roof);}
 }
 let disposed=false;
 return{group:proxy.group,dispose(){if(disposed)return;disposed=true;proxy.dispose();for(const g of geometries)g.dispose();material.dispose();}};
}
