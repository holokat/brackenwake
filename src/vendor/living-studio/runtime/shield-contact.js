import * as THREE from 'three';

const contacts=new WeakMap();
/** Center of the solid striking face, measured from the equipped shield mesh. */
export function shieldContactWorld(item,out){
 if(item?.userData.gripSocket?.kind!=='shield'||!item.visible)return null;
 let mesh;
 item.traverse(object=>{if(!mesh&&object.isMesh&&object.visible&&object.userData.shieldContact)mesh=object;});
 if(!mesh)return null;
 let contact=contacts.get(mesh);
 if(!contact){
  const geometry=mesh.geometry;geometry.computeBoundingBox();
  const origin=geometry.boundingBox.getCenter(new THREE.Vector3());origin.y=geometry.boundingBox.min.y-1;
  const ray=new THREE.Ray(origin,new THREE.Vector3(0,1,0)),p=geometry.attributes.position,index=geometry.index;
  const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),hit=new THREE.Vector3();let nearest=Infinity;
  for(let i=0;i<(index?.count||p.count);i+=3){
   a.fromBufferAttribute(p,index?index.getX(i):i);b.fromBufferAttribute(p,index?index.getX(i+1):i+1);c.fromBufferAttribute(p,index?index.getX(i+2):i+2);
   if(ray.intersectTriangle(a,b,c,false,hit)&&hit.distanceToSquared(origin)<nearest){nearest=hit.distanceToSquared(origin);contact=hit.clone();}
  }
  if(!contact)return null;contacts.set(mesh,contact);
 }
 return mesh.localToWorld(out.copy(contact));
}
