import {SPACES} from '../mmo/spaces/index.js';
import {FOOTPRINT} from '../mmo/plans/footprints.js';
import {spaceInWorld} from './sites.js';

/** Authored shelters can reserve their ground before their streamed mesh arrives. */
export function createForageClearance(spaces=SPACES,field){
 const rectangles=[];
 for(const space of Object.values(spaces))for(const p of space.pieces||[]){
  const size=FOOTPRINT[p.model];
  if(!space.at||!p.clearForage||!size)continue;
  const yaw=(p.yaw||0)*Math.PI/180,k=p.scale??1;
  rectangles.push({space,x:space.at.x+p.x,z:space.at.z+p.z,w:size[0]*k/2+.5,d:size[1]*k/2+.5,c:Math.cos(yaw),s:Math.sin(yaw)});
 }
 return record=>record.onTrunk||!record.members.some(p=>rectangles.some(r=>{
  if(field&&!spaceInWorld(r.space,field))return false;
  const dx=p.x-r.x,dz=p.z-r.z;
  return Math.abs(dx*r.c-dz*r.s)<r.w&&Math.abs(dx*r.s+dz*r.c)<r.d;
 }));
}
