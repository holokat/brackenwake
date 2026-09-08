import {fitChibiEquipment} from './chibi/equipment.js';
import {wiki} from '../data/wiki.js';
import {shieldCatalog,shieldById} from '../data/shield-catalog.js';
import {disposeItem,finishItem,itemBuilder} from './items/common.js';
import {buildBlade,buildThrowingKnives} from './items/blades.js';
import {buildArcane,buildHafted} from './items/hafted.js';
import {buildAmmunition,buildRanged} from './items/ranged.js';
import {buildProp} from './items/props.js';
import {buildShield} from './items/shields.js';
import {applyReadyEquipmentPose,isOneHandedWeapon,mountGrip} from './equipment-grips.js';
import {applyTwoHandedEquipmentPose,mountTwoHandedGrip} from './two-handed-grips.js';
import {twoHandedProfiles} from './two-handed-profiles.js';
import {applyShieldEquipmentPose} from './shield-grips.js';

const weaponIds=new Set(wiki.bases.filter(item=>item.kind==='weapon').map(item=>item.id));
const shieldIds=new Set(shieldCatalog.map(item=>item.id));
export const offhandWeaponIds=['dagger'];
export const offhandIds=['tome','torch','holy_book','skull','lute'];
export const toolIds=['pickaxe','smith_hammer','tongs'];
export const extraItemIds=['ring','amulet','arrow','bolt'];
const jewelleryIds=['ring','amulet'];
const otherIds=new Set([...offhandIds,...toolIds,...extraItemIds]);
const aliases={sword:'longsword',bow:'longbow',round:'buckler'};
const label=id=>{const name=shieldById.get(id)?.name||wiki.bases.find(item=>item.id===id)?.name||id;return name[0]+name.slice(1).toLowerCase();};
export const weapons=[['default','Class default'],['none','Unarmed'],...Array.from(weaponIds,id=>[id,label(id)]),...toolIds.map(id=>[id,label(id)])];
export const shields=[['default','Class default'],['none','No offhand'],...Array.from(shieldIds,id=>[id,label(id)]),...[...offhandWeaponIds,...offhandIds,...jewelleryIds].map(id=>[id,label(id)])];
export const handheldItemIds=[...weaponIds,...shieldIds,...otherIds];
export const resolveHandheldId=id=>aliases[id]||id;

/** Standalone preview, native Z up, with the hand grip at the local origin. */
export function createHandheldItem(requestedId){
 const id=resolveHandheldId(requestedId);
 const base=shieldById.get(id)||wiki.bases.find(item=>item.id===id);
 if(!handheldItemIds.includes(id))throw new RangeError('Unknown handheld item: '+requestedId);
 const {root,h}=itemBuilder(id,base?.kind||'weapon');
 root.name=requestedId;root.userData.sourceSlot=base?.slot??null;root.userData.hands=base?.hands??1;
 root.userData.slot=shieldIds.has(id)||offhandIds.includes(id)||jewelleryIds.includes(id)?'offhand':'weapon';
 if(shieldIds.has(id))buildShield(h,id);
 else if(id==='throwing_knives')buildThrowingKnives(h);
 else if(id==='arrow'||id==='bolt')buildAmmunition(h,id);
 else if(!(buildBlade(h,id)||buildHafted(h,id)||buildArcane(h,id)||buildRanged(h,id)||buildProp(h,id)))throw new Error('Missing handheld model: '+id);
 return finishItem(root);
}

export function createWeapon(id){
 if(id==='none'||id==='default')return itemBuilder(id).root;
 if(!weaponIds.has(resolveHandheldId(id))&&!toolIds.includes(id))throw new RangeError('Unknown weapon: '+id);
 return createHandheldItem(id);
}

export function createShield(id){
 if(id==='none'||id==='default')return itemBuilder(id,'shield').root;
 if(!shieldIds.has(resolveHandheldId(id))&&!offhandIds.includes(id)&&!jewelleryIds.includes(id)&&!offhandWeaponIds.includes(id))throw new RangeError('Unknown offhand: '+id);
 const item=createHandheldItem(id);
 if(shieldIds.has(resolveHandheldId(id)))item.name=id+' shield';
 return item;
}

/** Replace only mounted equipment; no item is merged into character skinning. */
export function mountLoadout(rig,weapon='default',shield='default'){
 const group=rig.group,defaults=group.userData.classLoadout||{weapon:'none',shield:'none'};
 const requestedWeapon=weapon==='default'?defaults.weapon||'none':weapon;
 const requestedShield=shield==='default'?defaults.shield||'none':shield;
 const weaponId=resolveHandheldId(requestedWeapon),twoHanded=twoHandedProfiles[weaponId];
 const shieldId=twoHanded&&twoHanded.kind!=='staff'?'none':resolveHandheldId(requestedShield);
 // Build before mutating the rig so invalid selections leave the current loadout intact.
 const mounted=[];
 try{
  if(!['none','fists'].includes(weaponId))mounted.push({item:createWeapon(requestedWeapon),slot:'weapon'});
  if(shieldId!=='none')mounted.push({item:createShield(requestedShield),slot:'offhand'});
 }catch(error){for(const {item} of mounted)disposeItem(item);throw error;}
 for(const old of group.userData.loadout||[])disposeItem(old);
 group.traverse(mesh=>{if(mesh.isSkinnedMesh&&mesh.userData.slot==='weapon')mesh.visible=false;});
 for(const {item,slot} of mounted){
  fitChibiEquipment(rig,item,slot);
  if(slot==='weapon'){
   const bow=['shortbow','longbow'].includes(weaponId);
   if(mountTwoHandedGrip(rig,item))continue;
   if(isOneHandedWeapon(weaponId))mountGrip(rig,item,'R');
   else{
    item.position.set(0,-.065,-.23);
    if(!bow&&!['staff','bone_staff','quarterstaff','wand','crossbow','spear','halberd','glaive'].includes(weaponId))item.rotation.x=Math.PI;
    rig.joints[bow?'handL':'handR'].add(item);
    item.userData.mountedHand=bow?'L':'R';
   }
  }else if(offhandWeaponIds.includes(shieldId)){
   item.userData.slot='offhand';item.traverse(mesh=>{if(mesh.isMesh)mesh.userData.slot='offhand';});mountGrip(rig,item,'L');
  }else if(shieldIds.has(shieldId)){
   mountGrip(rig,item,'L','shield');
  }else if(shieldId==='amulet'){
   item.scale.setScalar(.52);item.position.set(0,-.53,.16);
   rig.joints.chest.add(item);item.userData.mountedHand=null;
  }else if(shieldId==='ring'){
   item.scale.setScalar(.2);item.rotation.x=Math.PI/2;item.position.set(-.095,-.235,-.29);
   rig.joints.handL.add(item);item.userData.mountedHand='L';
  }else{
   item.position.set(0,-.12,-.22);
   rig.joints.handL.add(item);item.userData.mountedHand='L';
  }
 }
 const result=mounted.map(({item})=>item);group.userData.loadout=result;
 group.userData.resolvedLoadout={weapon:weaponId,shield:shieldId};
 applyReadyEquipmentPose(rig);
 applyTwoHandedEquipmentPose(rig);
 applyShieldEquipmentPose(rig);
 return result;
}

export {disposeItem};
