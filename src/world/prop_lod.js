import * as THREE from 'three';

/** Index-only distant meshes share the close model's vertex buffers. */
export async function preparePropLods(gltf){
 const jobs=[];
 gltf.scene.traverse(mesh=>{
  const data=mesh.userData.kalderaLod;if(!mesh.isMesh||!data)return;
  jobs.push(Promise.all(['mid','far'].map(async level=>{
   const index=await gltf.parser.getDependency('accessor',data[level]);
   const geometry=new THREE.BufferGeometry();
   for(const[key,attribute]of Object.entries(mesh.geometry.attributes))geometry.setAttribute(key,attribute);
   geometry.setIndex(index);geometry.boundingBox=mesh.geometry.boundingBox;geometry.boundingSphere=mesh.geometry.boundingSphere;
   return geometry;
  })).then(levels=>{mesh.geometry.userData.lodGeometries=levels;}));
 });
 await Promise.all(jobs);
}

/** The placements are already in world coordinates. Move the LOD origin to
 * their center while cancelling that transform below each level. */
export function instancePropMesh(mesh,placements){
 const matrix=new THREE.Matrix4(),center=new THREE.Vector3();
 for(const p of placements)center.add(new THREE.Vector3().setFromMatrixPosition(p));center.divideScalar(placements.length);
 const create=geometry=>{const im=new THREE.InstancedMesh(geometry,mesh.material,placements.length);
  placements.forEach((p,i)=>{matrix.multiplyMatrices(p,mesh.matrixWorld);im.setMatrixAt(i,matrix);});
  im.instanceMatrix.needsUpdate=true;im.castShadow=true;im.receiveShadow=true;im.name=mesh.name||'model';return im;};
 const levels=mesh.geometry.userData.lodGeometries;
 if(!levels){
  const part=create(mesh.geometry),distance=mesh.geometry.userData.maxDistance;
  if(!distance)return part;
  const lod=new THREE.LOD();lod.position.copy(center);part.position.copy(center).negate();
  lod.addLevel(part,0);lod.addLevel(new THREE.Group(),distance,.12);return lod;
 }
 const size=new THREE.Box3().setFromBufferAttribute(mesh.geometry.attributes.position).getSize(new THREE.Vector3());
 const extent=Math.max(size.x,size.y,size.z),near=Math.max(40,extent*5),far=Math.max(120,extent*12);
 const lod=new THREE.LOD();lod.position.copy(center);
 [mesh.geometry,...levels].forEach((geometry,i)=>{const part=create(geometry);part.position.copy(center).negate();lod.addLevel(part,[0,near,far][i],.12);});
 return lod;
}
