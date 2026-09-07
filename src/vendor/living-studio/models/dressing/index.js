import {dressingById} from '../../data/dressing-catalog.js';
import {finishModel,updateLivingModel,disposeLivingModel} from './shared.js';
import {villageBuilders} from './village.js';
import {farmingBuilders} from './farming.js';
import {riverBuilders} from './river.js';
import {storyBuilders} from './story.js';
import {animalIds,animalClips,buildAnimal} from './animals.js';
import {vegetationIds,buildVegetation} from './vegetation.js';
import {groundIds,buildGround} from './ground.js';

const builders={...villageBuilders,...farmingBuilders,...riverBuilders,...storyBuilders};
for(const id of animalIds)builders[id]=()=>buildAnimal(id);
for(const id of vegetationIds)builders[id]=()=>buildVegetation(id);
for(const id of groundIds)builders[id]=()=>buildGround(id);
export const dressingModelIds=Object.freeze(Object.keys(builders));

export function createDressingModel(id,options={}) {
 const entry=dressingById.get(id);if(!entry)throw new Error(`Unknown dressing: ${id}`);
 if(entry.type==='vfx')throw new Error(`Dressing ${id} is a VFX route; use the environmental effect builder.`);
 const build=builders[id];if(!build)throw new Error(`Missing dressing builder: ${id}`);
 const content=build(options),clips=animalClips[id]||(['washing_line','inn_sign','rope_swing','bell_buoy','gibbet_cage','maypole'].includes(id)?['idle','sway']:['idle']);
 const root=finishModel(content,entry,{...options,clips});
 Object.assign(root.userData,{dressingId:id,zone:entry.zone,count:entry.count,type:entry.type,sourceStatus:entry.status});
 const unresolved=[],sockets=[];root.traverse(o=>{
  if(o.userData.unresolvedContent)unresolved.push(...o.userData.unresolvedContent);
  for(const key of ['variants','variant','footprintInterpretation','rig','rigSignature','inscription'])if(o.userData[key]!==undefined)root.userData[key]=o.userData[key];
  if(o.userData.effect){const p=o.getWorldPosition(root.position.clone());sockets.push({effect:o.userData.effect,position:p.toArray()});}
 });
 if(unresolved.length)root.userData.unresolvedContent=unresolved;
 if(sockets.length)root.userData.effectSockets=sockets;
 if(id==='headstone_row')root.userData.variant={variant:String(root.userData.variant??0)};
 return root;
}
export {updateLivingModel as updateDressingModel,disposeLivingModel};
