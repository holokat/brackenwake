import * as THREE from 'three';
import {palette} from './geometry.js';
import {skinToneById,hairColorById,defaultCharacterColors} from '../data/character-colors.js';

export function applyCharacterColors(group,selection={}){
 const skin=skinToneById.get(selection.skinTone)||skinToneById.get(defaultCharacterColors.skinTone);
 const hair=hairColorById.get(selection.hairColor)||hairColorById.get(defaultCharacterColors.hairColor);
 const base=new THREE.Color(skin.color),original=skin.id===defaultCharacterColors.skinTone;
 const colors={
  skin:base,
  skin_dark:original?new THREE.Color(palette.skin_dark):base.clone().multiplyScalar(.53),
  skin_light:original?new THREE.Color(palette.skin_light):base.clone().lerp(new THREE.Color('#d88e85'),.12),
  hair:new THREE.Color(hair.color),
 };
 group.traverse(mesh=>{
  if(!mesh.isMesh)return;
  const key=mesh.userData.materialKey;
  if(!Object.hasOwn(colors,key)||!['skin','head','hair','hands'].includes(mesh.userData.part))return;
  for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
   material.color.copy(colors[key]);
   // Appearance presets restore this value before applying equipment-only colors.
   material.userData.originalColor=material.color.clone();
   material.userData.characterColor=key==='hair'?hair.id:skin.id;
  }
 });
 group.userData.customization={...group.userData.customization,hairColor:hair.id,skinTone:skin.id};
}
