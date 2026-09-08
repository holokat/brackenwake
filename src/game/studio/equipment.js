import {baseFor} from '../../mmo/items.js';
import {canonicalSlots} from '../../vendor/living-studio/models/class-profiles.js';
import {itemById} from '../../vendor/living-studio/data/item-catalog.js';
import {materialById} from '../../vendor/living-studio/data/materials.js';

export function studioArmourForOutfit(outfit){
 const b=baseFor(outfit);
 if(!b||b.slot!=='outfit')return null;
 const tier=b.material==='ring'?'ring':b.material;
 return Object.fromEntries(canonicalSlots.map(s=>[s,itemById.has(`${tier}_${s}`)?`${tier}_${s}`:'none']));
}

export function studioEquipment(equipment={},opts={}){
 const armor=studioArmourForOutfit(equipment.outfit)||Object.fromEntries(canonicalSlots.map(s=>[s,'none']));
 const main=equipment.mainHand,base=baseFor(main);
 const weapon=itemById.has(main?.base)?main.base:'none';
 const off=base?.hands===2?'none':(itemById.has(equipment.offHand?.base)?equipment.offHand.base:'none');
 return{armor,weapon,off,main,offItem:off==='none'?null:equipment.offHand};
}
export function studioMaterial(item){
 const material=materialById.get(item?.material),selection={};
 if(material){selection[material.role]=material.id;if(baseFor(item)?.kind==='shield')selection.construction=material.role==='metal'?'metal':'wood';}
 return selection;
}
export function equipmentSignature(equipment={},opts={}){return JSON.stringify([opts.ranged||false,Object.entries(equipment).map(([slot,item])=>[slot,item?.id,item?.base,item?.material,item?.rarity,item?.affixes])]);}
