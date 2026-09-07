import {wiki} from '../../data/wiki.js';

export const armorItems=Object.freeze(wiki.bases.filter(item=>item.kind==='armour'));
export const armorById=new Map(armorItems.map(item=>[item.id,item]));
export const tierProfiles=Object.freeze({
 cloth:{role:'cloth',material:'blue_dark',edge:'blue',bulk:.00,sides:12,hem:.96},
 leather:{role:'leather',material:'leather',edge:'leather_light',bulk:.035,sides:10,hem:3.88},
 studded:{role:'leather',material:'leather_dark',edge:'steel',bulk:.075,sides:8,hem:3.73},
 ring:{role:'metal',material:'steel_dark',edge:'steel',bulk:.10,sides:10,hem:3.55},
 chain:{role:'metal',material:'steel',edge:'steel',bulk:.065,sides:12,hem:3.10},
 plate:{role:'metal',material:'steel',edge:'steel_edge',bulk:.16,sides:8,hem:4.10},
});
export function armorProfile(id,materialId){
 const item=armorById.get(id);if(!item)throw new Error(`Unknown armor item: ${id}`);
 const tier=wiki.tiers.find(entry=>entry.tier===item.tier)?.id;
 const base=tierProfiles[tier],hideGrade=['hide','thickHide','scaledHide'].includes(materialId)?materialId:'hide';
 return {...base,id,item,tier,hideGrade,edgeRole:/steel|gold/.test(base.edge)?'metal':base.role==='leather'?'leather':'trim',
  bulk:base.bulk+(base.role==='leather'?(hideGrade==='thickHide'?.075:hideGrade==='scaledHide'?.045:0):0)};
}
