import * as THREE from 'three';
import {fitBodyType} from '../morphology.js';
import {applyItemMaterial,disposeItem} from '../item-materials.js';
import {armorProfile} from './profiles.js';
import {ArmorShapes} from './shapes.js';
import {fitArmorSurfaces} from './surface-fit.js';
import {buildChest,buildBack} from './torso.js';
import {buildHead} from './head.js';
import {buildHands,buildWrists,buildWaist,buildLegs,buildFeet} from './extremities.js';
export {armorItems,armorById,tierProfiles} from './profiles.js';

const builders={head:buildHead,chest:buildChest,hands:buildHands,wrists:buildWrists,waist:buildWaist,legs:buildLegs,feet:buildFeet,back:buildBack};
export function createArmorItem(id,{bodyType='male',materialId}={}){
 if(!['male','female'].includes(bodyType))throw new Error(`Unknown body type: ${bodyType}`);
 const profile=armorProfile(id,materialId),group=new THREE.Group();
 group.name=id;group.userData={itemId:id,wikiSlot:profile.item.slot,bodyType,tier:profile.tier,hideGrade:profile.hideGrade};
 const shapes=new ArmorShapes(group,profile);builders[profile.item.slot](shapes);
 group.traverse(mesh=>{
  if(!mesh.isMesh)return;
  mesh.material=mesh.material.clone();mesh.material.userData={...mesh.material.userData,ownedByItem:true,itemOwned:true};
 });
 try{
  if(materialId)applyItemMaterial(group,materialId);
  fitArmorSurfaces(shapes,bodyType,()=>fitBodyType(group,bodyType));
 }catch(error){disposeItem(group);throw error;}
 return group;
}
