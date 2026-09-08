import * as THREE from 'three';
import {Geometry} from '../geometry.js';
import {classProfile,outfitComponentById} from '../class-profiles.js';
import {bindCharacter} from '../rig.js';
import {applyCharacterColors} from '../character-colors.js';
import {buildChibiBody} from './body.js';
import {buildChibiHead} from './head.js';
import {buildChibiWardrobe} from './wardrobe.js';
import {buildNpcWardrobe} from './npc-wardrobe.js';
import {isStudioNpc} from '../../data/studio-npcs.js';
import {chibiJoints,chibiPoint,fitChibiGeometry} from './proportions.js';

export const isChibiClass=kind=>['wizard','warrior','rogue','ranger'].includes(kind)||isStudioNpc(kind);
/** A single procedural factory shared by the editor, spells, tests and GLB export. */
export async function createChibiCharacter(kind,options={}){return createChibiCharacterSync(kind,options);}
export function createChibiCharacterSync(kind,{rigged=true,bodyType='neutral',equipment={},equipmentMaterials={},customization={}}={}){
 if(!['neutral','male','female'].includes(bodyType))throw new RangeError(`Unknown body type: ${bodyType}`);
 const profile=classProfile(kind),slots={...profile.equipment,...equipment},group=new THREE.Group();
 for(const [slot,id] of Object.entries(slots)){
  if(id!=='none'&&outfitComponentById.get(id)?.slot!==slot)throw new RangeError(`Outfit component ${id} does not belong in ${slot}`);
 }
 group.name=kind;group.userData.classId=kind;
 group.userData.characterStyle='chibi';
 group.userData.characterCategory=isStudioNpc(kind)?'npc':'playable';
 group.userData.classLoadout={weapon:profile.weapon,shield:profile.shield};
 group.userData.sculptRuntime={style:'chibi',coordinateSystem:'Z-up, facing -Y',factory:'models/chibi/character.js'};
 const h=new Geometry(group);
 buildChibiBody(h,{slots,colors:profile.colors});
 const resolved=buildChibiHead(h,{bodyType,customization,headwear:slots.head});
 h.part='outfit';
 const buildOutfit=isStudioNpc(kind)?buildNpcWardrobe:buildChibiWardrobe;
 buildOutfit(h,{kind,slots,bodyType,equipmentMaterials,colors:profile.colors});
 // Own materials per actor while sharing them between identical surfaces in that actor.
 const materials=new Map();
 group.traverse(mesh=>{
  if(!mesh.isMesh)return;
  if(mesh.userData.armorBinding==='chest'&&(mesh.name==='Chibi fitted tunic'||mesh.userData.chibiMountedOn))mesh.userData.fittedTorso=true;
  const original=mesh.material,role=mesh.userData.materialRole||mesh.userData.part;
  const key=original.uuid+':'+role;
  if(['metal','cloth','leather'].includes(role))mesh.userData.colorChannel=role;
  if(!materials.has(key)){
   const material=original.clone();
   material.roughness=role==='metal'?.62:role==='trim'?.57:role==='leather'?.83:.93;
   material.metalness=role==='metal'?.52:role==='trim'?.40:0;
   material.userData={...material.userData,ownedByCharacter:true,itemOwned:true,originalColor:material.color.clone()};
   materials.set(key,material);
  }
  mesh.material=materials.get(key);
 });
 group.traverse(mesh=>{
  if(mesh.name==='Chibi inner torso')mesh.visible=slots.chest==='none';
  if(/^Chibi trouser leg /.test(mesh.name)&&!mesh.userData.chibiWardrobe)mesh.visible=slots.legs==='none';
 });
 fitChibiGeometry(group,bodyType);
 group.userData.customization={...resolved};
 applyCharacterColors(group,customization);
 const rig=rigged?bindCharacter(group,'chibi',bodyType,{jointPositions:chibiJoints,pointTransform:(x,y,z)=>chibiPoint(x,y,z,bodyType)}):null;
 if(rig)rig.style='chibi';
 return {group,rig,kind,bodyType,equipment:slots,equipmentMaterials,customization:{...group.userData.customization}};
}
