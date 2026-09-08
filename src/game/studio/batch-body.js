import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

export const HIDDEN_BODY_OPACITY = 0.25;

function ownMaterials(mesh){
 const material=mesh.material;
 if(!material)return[];
 const list=Array.isArray(material)?material:[material];
 if(list.every(m=>m?.userData?.opacityOwnedByCharacter))return list;
 const next=list.map(m=>{
  if(!m)return m;
  if(m.userData?.ownedByCharacter||m.userData?.itemOwned){
   m.userData.opacityOwnedByCharacter=true;
   return m;
  }
  const clone=m.clone();
  clone.userData={...(m.userData||{}),opacityOwnedByCharacter:true};
  return clone;
 });
 mesh.material=Array.isArray(material)?next:next[0];
 return next;
}

export function setStudioOpacity(root,hidden,opacity=HIDDEN_BODY_OPACITY){
 if(!root||typeof root.traverse!=='function')return 0;
 const target=hidden?opacity:1;
 let touched=0;
 root.traverse(o=>{
  if(!o.isMesh&&!o.isSkinnedMesh)return;
  for(const mat of ownMaterials(o)){
   if(!mat)continue;
   mat.opacity=target;
   mat.transparent=!!hidden;
   mat.depthWrite=true;
   mat.needsUpdate=true;
   touched++;
  }
 });
 root.userData.hiddenOpacity=target;
 return touched;
}

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
 // A hood or a cloak is a shell the studio draws from both sides; batched
 // under a front-side material its near faces were culled and the face showed
 // through the helmet (the user, 2026-09-08: "I can see through his helmet").
 // One double-sided piece makes the whole batch double-sided: cheaper than a
 // second mesh and invisible on the closed pieces.
 const twoSided=source.some(m=>m.material.side===THREE.DoubleSide);
 const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.72,metalness:.08,flatShading:true,side:twoSided?THREE.DoubleSide:THREE.FrontSide});material.userData.ownedByCharacter=true;material.userData.opacityOwnedByCharacter=true;
 const mesh=new THREE.SkinnedMesh(geometry,material);mesh.name='Studio body and worn armour';mesh.userData.studioItems=[...new Set(source.map(m=>m.userData.itemId).filter(Boolean))];mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=false;
 actor.group.add(mesh);mesh.bind(actor.rig.skeleton);
 for(const old of source){old.removeFromParent();old.geometry.dispose();if(old.material.userData.ownedByCharacter||old.material.userData.itemOwned)old.material.dispose();}
 actor.group.userData.batchedSourceMeshes=source.length;
}
