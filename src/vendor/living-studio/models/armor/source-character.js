import {disposeCharacter} from '../dispose-character.js';
import * as THREE from 'three';
import {Geometry} from '../geometry.js';
import {buildBody} from '../body.js';
import {bindCharacter} from '../rig.js';
import {buildWardrobe,defaults} from '../wardrobe.js';
import {classProfile} from '../class-profiles.js';
import {buildBlockHands} from '../hands.js';
import {fitBodyType} from '../morphology.js';
import {fitFemaleFace} from '../face-variants.js';
import {applyFacePreset} from '../face-presets.js';
import {fitFaceConnections} from '../face-connections.js';
import {buildUnderlayers} from '../underlayers.js';
import {createLegacyCharacter} from './legacy-character.js';
import {applyHairstyle} from '../hairstyles.js';
import {applyCharacterColors} from '../character-colors.js';
import {resolveHairstyle} from '../../data/hairstyles.js';

export async function createHistoricalCharacter(kind,{rigged=true,bodyType='neutral',equipment={},equipmentMaterials={},customization={}}={}){
 if(bodyType==='neutral')bodyType='male';
 if(Object.hasOwn(equipment,'armor'))return createLegacyCharacter(kind,{rigged,bodyType,equipment});
 if(!['male','female'].includes(bodyType))throw new Error(`Unknown body type: ${bodyType}`);
 const profile=classProfile(kind),group=new THREE.Group(),slots={...defaults(kind),...equipment};
 group.name=profile.id;group.userData.classId=profile.id;
 group.userData.classLoadout={weapon:profile.weapon,shield:profile.shield};
 const h=new Geometry(group);buildBody(h,'wiki');
 if(bodyType==='female')fitFemaleFace(group,slots.head==='none'?'none':'wiki');
 applyFacePreset(group,{bodyType,preset:customization.facePreset});
 applyHairstyle(group,{bodyType,style:customization.hairStyle,headwear:slots.head});
 group.userData.customization={...group.userData.customization,hairStyle:resolveHairstyle(bodyType,customization.hairStyle)};
 buildUnderlayers(group,'warrior');
 h.part='outfit';
 const torso=h.loft('Inner tunic torso and pelvis',[
  [0,.025,3.57,.54,.37],[0,.025,3.93,.76,.45],[0,0,4.65,.70,.38],
  [0,0,5.26,.83,.45],[0,0,5.96,1.00,.46],[0,0,6.23,1.01,.40],[0,.01,6.46,.45,.29],
 ],'cloth_dark',{n:12,caps:false,variation:.02});
 torso.userData.armorBinding='torso';torso.userData.materialRole='cloth';
 torso.visible=slots.chest==='none'||slots.chest==='leather_apron';
 buildBlockHands(group,'wiki','none');
 group.traverse(mesh=>{
  if(!mesh.isMesh)return;
  if(/^Leg /.test(mesh.name))mesh.visible=false;
  if(/^Bare foot /.test(mesh.name))mesh.visible=slots.feet==='none'||slots.feet==='cloth_feet';
  if(mesh.userData.part==='hair'&&slots.head!=='none')mesh.visible=false;
  if(/^Block hand |^Block thumb /.test(mesh.name))mesh.visible=slots.hands==='none';
  if(/^Arm /.test(mesh.name)&&(/^(cloth|chain)_chest$/.test(slots.chest)||slots.chest==='dark_robe'))mesh.visible=false;
  if(/Inner trouser/.test(mesh.name))mesh.userData.materialRole='cloth';
 });
 try{
  await buildWardrobe(group,profile.id,slots,bodyType,equipmentMaterials);
  group.traverse(mesh=>{
   if(!mesh.isMesh)return;
   if(!mesh.material.userData.ownedByItem)mesh.material=mesh.material.clone();
   mesh.material.userData={...mesh.material.userData,ownedByCharacter:true,itemOwned:true};
   const role=mesh.userData.materialRole;
   if(profile.colors[role]&&!equipmentMaterials[mesh.userData.wikiSlot]?.[role])mesh.material.color.set(profile.colors[role]);
   mesh.material.userData.originalColor=mesh.material.color.clone();
  });
  fitBodyType(group,bodyType);
  fitFaceConnections(group);
  applyCharacterColors(group,customization);
  const rig=rigged?bindCharacter(group,'wiki',bodyType):null;
  return {group,rig,kind:profile.id,bodyType,equipment:slots,equipmentMaterials,customization:{...group.userData.customization}};
 }catch(error){disposeCharacter({group});throw error;}
}

