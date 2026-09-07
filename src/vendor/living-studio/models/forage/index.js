import {forageById} from '../../data/forage-catalog.js';
import {finishModel,updateLivingModel} from '../dressing/shared.js';
import {buildMushrooms,mushroomIds} from './mushrooms.js';
import {buildPlants,plantIds} from './plants.js';
import {buildBush,bushIds} from './bushes.js';
import {buildTrunkForage} from './trunk.js';

export function createForageModel(id,options={}) {
 const entry=forageById.get(id);if(!entry)throw new Error(`Unknown forage: ${id}`);
 const content=mushroomIds.has(id)?buildMushrooms(id):plantIds.has(id)?buildPlants(id):bushIds.has(id)?buildBush(id):buildTrunkForage(id);
 const root=finishModel(content,entry,{...options,size:null,sourceSize:entry.sourceSize,clips:['idle']});
 Object.assign(root.userData,{forageId:id,tag:entry.tag,difficulty:entry.difficulty,seasons:entry.seasons,regrowthDays:entry.regrowthDays,maxPerTree:entry.maxPerTree,placement:entry.grows,attachment:entry.grows.includes('trunk itself')?'Trunk at chest height':'Ground',sourceDimensionsSpecified:entry.sourceSize!==null});
 return root;
}
export {updateLivingModel as updateForageModel};
