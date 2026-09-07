import {canonicalSlots,classProfile} from './class-profiles.js';
import {createArmorItem,armorById} from './armor/index.js';
import {buildWardrobe as buildLegacyWardrobe,defaults as legacyDefaults} from './armor/legacy-wardrobe.js';
export {outfitStyles,classifyGear} from './armor/legacy-wardrobe.js';

export const equipmentSlots=canonicalSlots;
export function defaults(kind){return {...classProfile(kind).equipment};}
export {legacyDefaults};

/** Flatten parts before binding; each mesh carries its item's independent slot metadata. */
export async function buildWardrobe(root,kind,equipment,bodyType='male',equipmentMaterials={}){
 if(Object.hasOwn(equipment,'armor'))return buildLegacyWardrobe(root,kind,equipment,bodyType);
 for(const slot of equipmentSlots){
  const id=equipment[slot]||'none';if(id==='none')continue;
  const item=armorById.get(id);
  if(!item||item.slot!==slot)throw new Error(`Armor ${id} does not belong in ${slot}`);
  // The whole character receives its body morph once after the wardrobe is built.
  const group=createArmorItem(id,{bodyType:'male',materialId:equipmentMaterials[slot]?.leather});
  for(const mesh of [...group.children])root.add(mesh);
 }
}
