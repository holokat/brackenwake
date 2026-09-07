import {itemById} from '../data/item-catalog.js';
import {materialById} from '../data/materials.js';
import {createArmorItem} from './armor/index.js';
import {createHandheldItem} from './weapons.js';
import {createMaterialSample} from './material-samples.js';
import {applyMaterialSelection} from './item-materials.js';
import {arrangeItemForInspection} from './item-presentation.js';

export async function createItemModel(id,{bodyType='male',selection={},presentation=false}={}){
 const item=itemById.get(id);if(!item)throw new Error(`Unknown item: ${id}`);
 const hide=selection.leather||(materialById.get(selection.finish)?.role==='leather'?selection.finish:undefined);
 const root=item.kind==='armor'?createArmorItem(id,{bodyType,materialId:hide}):item.kind==='material'?createMaterialSample(item.materialId):createHandheldItem(id);
 root.userData.itemId=id;root.userData.wikiSlot=item.slot;
 if(item.kind!=='material')applyMaterialSelection(root,selection);
 if(presentation)arrangeItemForInspection(root,item);
 return root;
}
