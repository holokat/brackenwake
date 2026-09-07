import * as THREE from 'three';
import {Geometry} from '../geometry.js';

export const outfitStyles=[['warrior','Plate'],['mage','Mage robes'],['wizard','Wizard robes'],['ranger','Ranger leather']];
export const equipmentSlots=['armor','headwear','boots','gloves','belt','cape','quiver'];
export function defaults(kind){return {armor:kind,headwear:kind,boots:kind,gloves:kind,belt:kind,cape:kind==='warrior'?'none':kind,quiver:kind==='ranger'?'ranger':'none'};}
export function classifyGear(mesh){
 const n=mesh.name.toLowerCase(),slot=mesh.userData.slot;
 if(slot==='facialhair'||slot==='facialHair'||/beard|moustache/.test(n))return 'facialHair';
 if(/quiver|arrow|fletch/.test(n))return 'quiver';
 if(slot==='weapon'||/staff|crystal|orb|bow|sword|sheath/.test(n))return 'weapon';
 if(slot==='headwear'||/helmet|visor|hood|mask|hat |hat$/.test(n))return 'headwear';
 if(slot==='boots'||/boot|sabatons?|greave|knee|ankle|shin/.test(n))return 'boots';
 if(slot==='gloves'||/bracer|vambrace|gauntlet|wrist/.test(n))return 'gloves';
 if(slot==='belt'||/belt|buckle|pouch|satchel|waist fastening/.test(n))return 'belt';
 if(slot==='cape'||/cape|mantle|wizard high.*collar/.test(n))return 'cape';
 return 'armor';
}
export async function buildWardrobe(root,kind,equipment,bodyType){
 const {buildWarrior}=await import('../warrior.js');
 const {buildMage,buildWizard,buildRanger}=await import('../mage-ranger.js');
 const builders={warrior:buildWarrior,mage:buildMage,wizard:buildWizard,ranger:buildRanger};
 const styles=new Set([...Object.values(equipment),kind].filter(s=>s!=='none'));
 for(const style of styles){
  const source=new THREE.Group(),h=new Geometry(source);builders[style](h);
  for(const mesh of [...source.children]){
   if(!mesh.isMesh)continue;
   const slot=classifyGear(mesh),individualHand=/finger|thumb|palm|knuckle/.test(mesh.name.toLowerCase());
   const selected=slot==='weapon'?style===kind:slot==='facialHair'?style===equipment.headwear&&bodyType==='male':equipment[slot]===style;
   if(selected&&!individualHand){
    mesh.userData.slot=slot;mesh.userData.sourceStyle=style;
    adaptArms(mesh,style,equipment.armor);
    root.add(mesh);
   }else mesh.geometry.dispose();
  }
 }
}
function adaptArms(mesh,from,to){
 const raised=s=>s==='mage'||s==='wizard';
 if(raised(from)===raised(to))return;
 const slot=mesh.userData.slot,p=mesh.geometry.attributes.position;
 if(slot==='weapon'&&/staff|crystal|orb/.test(mesh.name.toLowerCase())){
  const gripFrom=raised(from)?[-2.82,-.37,4.92]:[-1.82,-.34,3.98];
  const gripTo=raised(to)?[-2.82,-.37,4.92]:[-1.82,-.34,3.98],scale=raised(to)?1.25:.8;
  mesh.userData.weaponAnchor=gripTo;
  for(let i=0;i<p.count;i++){p.setXYZ(i,gripTo[0]+(p.getX(i)-gripFrom[0])*scale,gripTo[1]+(p.getY(i)-gripFrom[1])*scale,gripTo[2]+(p.getZ(i)-gripFrom[2])*scale);}
 }else if(slot==='gloves'){
  const lower={elbow:new THREE.Vector3(-1.45,-.015,5.05),wrist:new THREE.Vector3(-1.61,-.22,4.03)};
  const upper={elbow:new THREE.Vector3(-1.56,0,4.9),wrist:new THREE.Vector3(-2.56,-.35,4.93)};
  const source=raised(from)?upper:lower,target=raised(to)?upper:lower;
  const sourceAxis=source.wrist.clone().sub(source.elbow),targetAxis=target.wrist.clone().sub(target.elbow);
  const scale=targetAxis.length()/sourceAxis.length(),rotation=new THREE.Quaternion().setFromUnitVectors(sourceAxis.normalize(),targetAxis.normalize());
  const point=new THREE.Vector3();
  for(let i=0;i<p.count;i++)if(p.getX(i)<0){point.fromBufferAttribute(p,i).sub(source.elbow).applyQuaternion(rotation).multiplyScalar(scale).add(target.elbow);p.setXYZ(i,...point.toArray());}
 }
 p.needsUpdate=true;mesh.geometry.computeVertexNormals();mesh.geometry.computeBoundingBox();
}
