import * as THREE from 'three';
import {baseFor} from '../../mmo/items.js';
import {itemById} from '../../vendor/living-studio/data/item-catalog.js';
import {createItemModel} from '../../vendor/living-studio/models/item-model.js';
import {disposeItem} from '../../vendor/living-studio/models/item-materials.js';
import {bakeLivingGeometry} from '../../world/living/models.js';
import {studioMaterial} from './equipment.js';
export function studioItemId(item){
 const base=baseFor(item);if(!base)return null;
 if(itemById.has(base.id))return base.id;
 const material='material:'+(item.material||base.material||base.id);
 return itemById.has(material)?material:null;
}
export function attachStudioDrop(parent,item,replace){
 const id=studioItemId(item);let closed=false,mesh=null;
 const ready=(async()=>{
  if(!id)return false;const source=await createItemModel(id,{selection:studioMaterial(item)});let geometry;
  try{geometry=bakeLivingGeometry(source);}finally{disposeItem(source);}
  geometry.scale(1.8/7.9,1.8/7.9,1.8/7.9);geometry.computeBoundingBox();const box=geometry.boundingBox,c=box.getCenter(new THREE.Vector3());geometry.translate(-c.x,-box.min.y+.035,-c.z);
  if(closed){geometry.dispose();return false;}
  mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.7,metalness:.12,side:THREE.DoubleSide}));mesh.name='Dropped studio item: '+id;mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData.studioItem=id;
  parent.add(mesh);if(replace)replace.visible=false;return true;
 })();
 ready.catch(error=>console.warn('Studio drop:',error));
 return{ready,dispose(){closed=true;if(mesh){mesh.removeFromParent();mesh.geometry.dispose();mesh.material.dispose();}}};
}
