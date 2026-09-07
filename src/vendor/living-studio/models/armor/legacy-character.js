import * as THREE from 'three';
import {Geometry} from '../geometry.js';
import {buildBody} from '../body.js';
import {bindCharacter} from '../rig.js';
import {buildWardrobe,defaults} from './legacy-wardrobe.js';
import {buildBlockHands} from '../hands.js';
import {fitBodyType} from '../morphology.js';
import {fitFemaleFace} from '../face-variants.js';
import {fitFaceConnections} from '../face-connections.js';
import {buildUnderlayers,fitBootClearance,buildHelmetLining} from '../underlayers.js';

export async function createLegacyCharacter(kind,{rigged=true,bodyType='male',equipment={}}={}){
 const group=new THREE.Group();group.name=kind;const slots={...defaults(kind),...equipment};
 const h=new Geometry(group);buildBody(h,slots.armor);
 if(bodyType==='female')fitFemaleFace(group,slots.headwear);
 group.traverse(o=>{if(o.isMesh&&/^Leg |^Bare foot /.test(o.name))o.visible=/^Bare foot /.test(o.name)&&slots.boots==='none';});
 group.traverse(o=>{
  if(!o.isMesh)return;const part=o.userData.part;
  if((['warrior','mage'].includes(slots.headwear)&&['head','hair'].includes(part))||(['ranger','wizard'].includes(slots.headwear)&&part==='hair'&&bodyType==='male')){o.visible=false;o.userData.underHeadwear=true;}
 });
 await buildWardrobe(group,kind,slots,bodyType);
 group.traverse(o=>{if(!o.isMesh||o.userData.part!=='skin')return;const coveredArm=['warrior','mage','wizard'].includes(slots.armor)&&/^Arm /.test(o.name);const coveredNeck=slots.armor==='warrior'||['warrior','mage','ranger'].includes(slots.headwear);if(coveredArm||(coveredNeck&&o.name==='Neck')){o.visible=false;o.userData.underArmor=true;}});
 buildUnderlayers(group,slots.armor);
 buildBlockHands(group,slots.armor,slots.gloves);
 buildHelmetLining(group,slots.headwear);
 fitBootClearance(group,slots.boots);
 fitBodyType(group,bodyType);
 fitFaceConnections(group);
 const rig=rigged?bindCharacter(group,slots.armor,bodyType):null;
 return {group,rig,kind,bodyType,equipment:slots};
}
export function disposeCharacter(actor){
 const materials=new Set();actor.group.traverse(o=>{o.geometry?.dispose();if(o.isMesh)for(const m of Array.isArray(o.material)?o.material:[o.material])if(m.userData.originalColor)materials.add(m);});
 for(const mat of materials)mat.dispose();actor.rig?.skeleton.dispose();actor.group.removeFromParent();
}
