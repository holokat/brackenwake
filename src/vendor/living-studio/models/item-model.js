import {itemById} from '../data/item-catalog.js';
import {createHandheldItem} from './weapons.js';
import {createMaterialSample} from './material-samples.js';
import {applyMaterialSelection} from './item-materials.js';

export async function createItemModel(id,{selection={}}={}){
 const item=itemById.get(id);if(!item)throw new Error(`Unknown item: ${id}`);
 const root=item.kind==='material'?createMaterialSample(item.materialId):createHandheldItem(id);
 root.userData.itemId=id;root.userData.wikiSlot=item.slot;
 if(item.kind!=='material')applyMaterialSelection(root,selection);
 return root;
}
