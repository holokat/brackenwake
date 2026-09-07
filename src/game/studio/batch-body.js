import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
// The source has one mesh per constructed detail. The game draws the visible
// skin and armour together, retaining skin weights and item geometry.
export function batchBody(actor){
 const geometries=[],source=[];actor.group.traverse(o=>{if(o.isSkinnedMesh&&o.visible&&!o.material.map&&!Array.isArray(o.material))source.push(o);});
 for(const mesh of source){
  const g=mesh.geometry.clone(),count=g.attributes.position.count,colors=new Float32Array(count*3),original=g.attributes.color,c=mesh.material.color;
  for(let i=0;i<count;i++){colors[i*3]=c.r*(original?original.getX(i):1);colors[i*3+1]=c.g*(original?original.getY(i):1);colors[i*3+2]=c.b*(original?original.getZ(i):1);}
  g.setAttribute('color',new THREE.BufferAttribute(colors,3));
  for(const key of Object.keys(g.attributes))if(!['position','normal','skinIndex','skinWeight','color'].includes(key))g.deleteAttribute(key);
  geometries.push(g.index?g.toNonIndexed():g);if(g.index)g.dispose();
 }
 if(!geometries.length)return;
 const geometry=mergeGeometries(geometries);for(const g of geometries)g.dispose();if(!geometry)throw new Error('Studio body attributes cannot be batched');
 const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.72,metalness:.08,flatShading:true});material.userData.ownedByCharacter=true;
 const mesh=new THREE.SkinnedMesh(geometry,material);mesh.name='Studio body and worn armour';mesh.userData.studioItems=[...new Set(source.map(m=>m.userData.itemId).filter(Boolean))];mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=false;
 actor.group.add(mesh);mesh.bind(actor.rig.skeleton);
 for(const old of source){old.removeFromParent();old.geometry.dispose();if(old.material.userData.ownedByCharacter||old.material.userData.itemOwned)old.material.dispose();}
 actor.group.userData.batchedSourceMeshes=source.length;
}
