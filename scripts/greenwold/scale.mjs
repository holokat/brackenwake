// Presentation scale for the authored settlement buildings. Props and the
// metre-scale source library retain their dimensions; each placement records
// its enlargement so footprints, picking, shelter and editor controls agree.
import { attachmentFor } from '../../src/mmo/plans/attachments.js';
export const BUILDINGS = new Set('inn smithy manor chapel bank stable healer cottage_a cottage_b cottage_c gate_tower mill millers_house granary foremans_hut chapel_sunken'.split(' '));
const ANCHORS={innkeeper:'inn',blacksmith:'smithy',healer:'healer',stablemaster:'stable',banker:'bank',miller:'mill'};
const round=n=>Math.round(n*100)/100;
export function enlargeBuildings(spaces) {
 let changed=0;
 for(const space of Object.values(spaces)) {
  if(!space.id.startsWith('greenwold_'))continue;
  for(const p of space.pieces) {
   if(!BUILDINGS.has(p.model)||['greenwold-action','greenwold-population'].includes(p.tag))continue;
   const ratio=1.25/(p.scale??1);if(Math.abs(ratio-1)<1e-8)continue;
   for(const person of space.people||[])if(ANCHORS[person.role]===p.model){person.x=round(p.x+(person.x-p.x)*ratio);person.z=round(p.z+(person.z-p.z)*ratio);}
   for(const attachment of space.pieces)if(attachment.on===p.model){attachment.x=round(p.x+(attachment.x-p.x)*ratio);attachment.z=round(p.z+(attachment.z-p.z)*ratio);attachment.scale=round((attachment.scale??1)*ratio);}
   p.scale=1.25;changed++;
  }
 }
 return changed;
}

export function settlementClearances(spaces) {
 const h=spaces.greenwold_hearthhome,bank=h.pieces.find(p=>p.model==='bank');
 for(const p of h.people)if(p.role==='banker'){p.x=round(p.x-18.5-bank.x);p.z=round(p.z+9-bank.z);}
 bank.x=-18.5;bank.z=9;
 const pen=h.pieces.find(p=>p.model==='stable_pen');Object.assign(pen,{x:-39,z:29,yaw:90});
 // The stable yard opens through the west wall, away from the river channel.
 h.runs=h.runs.filter(r=>r.model!=='flint_wall_4m'||!((r.from.x+r.to.x)/2<-29&&(r.from.z+r.to.z)/2>15&&(r.from.z+r.to.z)/2<35));
 h.areas=h.areas.filter(a=>a.tag!=='greenwold-stable-yard');
 h.areas.push({kind:'lane',w:3,points:[[-26,29],[-31,29],[-35,29]],tag:'greenwold-stable-yard'});
 const c=spaces.greenwold_coldwake;
 for(const p of c.pieces){if(p.model==='cottage_a'&&p.x<0){p.x=-29;p.z=-10;}if(p.model==='cottage_c'&&p.x<0){p.x=-22;p.z=24;}}
 for(const s of h.stations||[]){if(s.id==='kitchen'){s.x=28;s.z=-7;}if(s.id==='inscriptionDesk'){s.x=-22;s.z=21;}}
 for(const s of spaces.greenwold_millrun.stations||[])if(s.id==='kitchen'){s.x=-17;s.z=-6;}
 const mill=spaces.greenwold_millrun;
 for(const p of mill.pieces){const a=attachmentFor(p,mill);if(a){p.x=round(a.x);p.z=round(a.z);p.yaw=a.yaw;}}
}
