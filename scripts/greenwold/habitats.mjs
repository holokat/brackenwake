import {HABITATS} from '../../src/mmo/greenwold/habitats.js';
import {FOOTPRINT} from '../../src/mmo/plans/footprints.js';
import {pointInRect,rectOf} from '../../src/mmo/plans/plan_schema.js';
// Tiny working pads only under the two huts. Their approaches stay in the
// surrounding landform; the countryside is never flattened around a prop.
export function gradeHabitats(field,add){
 for(const h of HABITATS){
  if(!h.pad&&!h.approach)continue;
  let height=field.heightAt(h.at.x,h.at.z);
  if(h.approach){
   const [x,z]=h.approach,distance=Math.hypot(x-h.at.x,z-h.at.z),start=field.heightAt(x,z);
   // Small clearings share the road's height; longer spurs rise at most 1:6.
   const rise=distance<25?0:Math.max(-distance*.16,Math.min(distance*.16,height-start));height=start+rise;
   add({kind:'plateau',x,z,x2:h.at.x,z2:h.at.z,r:7,height:start,height2:height,skirt:.5,label:h.id+'-approach'});
   add({kind:'plateau',x:h.at.x,z:h.at.z,r:h.pad||24,height,skirt:.45,label:h.id+'-shelf'});
   add({kind:'ground',x,z,x2:h.at.x,z2:h.at.z,r:1.8,word:'path',hardness:.4,label:h.id+'-approach'});
  }else add({kind:'plateau',x:h.at.x,z:h.at.z,r:h.pad,height,skirt:.45,label:h.id});
 }
 // The survey shelf includes the original cache and the new beacon. Its
 // shared elevation preserves the last bend of the chalk switchback.
 const height=field.heightAt(-547,-1159);
 add({kind:'plateau',x:-547,z:-1159,x2:-565,z2:-1152,r:23,height,skirt:.4,label:'chalk-survey-shelf'});
}
export function authorHabitats(spaces){
 for(const h of HABITATS){
  spaces[h.id]={...h,pieces:h.pieces.map(p=>({...p,tag:'greenwold-craft'})),runs:[],areas:[],people:[],trees:[],rocks:[],markers:[],spawns:h.spawns||[],forage:h.forage||[],stations:[]};
 }
 // A clearing cannot also have an unrelated generated trunk through its hut.
 // Retain all surrounding trees, including the deliberately concealed approach.
 let cleared=0;
 for(const s of Object.values(spaces))if(s.id.startsWith('greenwold_grove_'))s.trees=s.trees.filter(t=>{
  const x=s.at.x+t.x,z=s.at.z+t.z;
  const hit=HABITATS.some(h=>h.pieces.some(p=>{const f=FOOTPRINT[p.model];return f&&pointInRect(x-h.at.x,z-h.at.z,{...rectOf(p),hw:f[0]*(p.scale||1)/2+2,hd:f[1]*(p.scale||1)/2+2});}));
  if(hit)cleared++;return !hit;
 });
 return {habitats:HABITATS.length,cleared};
}
