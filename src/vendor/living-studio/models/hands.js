import {Geometry} from './geometry.js';
export function buildBlockHands(group,pose,gloves){
 const h=new Geometry(group);h.part='hands';
 for(const side of[-1,1]){
  const raised=(pose==='mage'||pose==='wizard')&&side===-1;
  const [x,y,z]=raised?[-2.56,-.35,4.93]:[side*1.61,-.22,4.03];
  const mat=gloves==='none'?'skin':gloves==='warrior'?'steel_dark':gloves==='mage'?'blue_dark':gloves==='wizard'?'violet_dark':'leather_dark';
  // A closed six-sided fist has one broad knuckle plane and a single thumb wedge.
  const hand=h.loft(`Block hand ${side}`,[[x,y,z+.06,.145,.135],[x+side*.015,y-.045,z-.12,.205,.165],[x+side*.005,y-.105,z-.40,.19,.17],[x,y-.09,z-.46,.145,.145]],mat,{n:6,phase:Math.PI/6,variation:.02});
  hand.userData.slot='hands';
  if(gloves!=='none'){const cuff=h.loft(`Glove cuff ${side}`,[[x,y,z+.13,.17,.16],[x,y,z-.055,.175,.165]],mat,{n:8,variation:.02});cuff.userData.slot='gloves';cuff.userData.sourceStyle=gloves;}
  const thumb=h.cube(`Block thumb ${side}`,[x-side*.165,y-.145,z-.18],[.135,.18,.24],mat,{bevel:.035});thumb.userData.slot='hands';
 }
}
