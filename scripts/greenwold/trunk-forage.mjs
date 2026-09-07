import {FORAGE_BY_ID} from '../../src/world/forage.js';
// Old authored mushroom patches predate explicit tree supports. Give each
// one a real harvestable beech; new woodland patches already name their tree.
export function authorTrunkForage(spaces){
  let added=0;
  for(const s of Object.values(spaces))if(s.id.startsWith('greenwold_'))for(const p of s.forage||[]){
    if(FORAGE_BY_ID[p.id]?.place!=='trunk')continue;
    if(s.id==='greenwold_beechhangar'&&p.x===-14){
      const prior=(s.trees||[]).find(t=>t.x===-14&&t.z===p.z);if(prior)prior.x=-19;
      if(!(s.trees||[]).some(t=>t.x===-19&&t.z===p.z)){(s.trees||=[]).push({species:'beech',x:-19,z:p.z,scale:.9,yaw:0,harvest:true});added++;}
      p.tree={x:-19,z:p.z,scale:.9};p.height=.9;p.yaw=90;continue;
    }
    if(p.tree)continue;
    const tree=(s.trees||[]).find(t=>Math.hypot(t.x-p.x,t.z-p.z)<.1);
    if(!tree){(s.trees||=[]).push({species:'beech',x:p.x,z:p.z,scale:.9,yaw:0,harvest:true});added++;}
    p.tree={x:p.x,z:p.z,scale:tree?.scale||.9};p.height=.9;p.yaw=90;
  }
  return added;
}
