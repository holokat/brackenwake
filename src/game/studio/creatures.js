import * as THREE from 'three';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {finishActor} from '../../vendor/living-studio/models/creatures/shared.js';
import {createCreatureModel} from '../../vendor/living-studio/models/creatures/index.js';
import {creatureById} from '../../vendor/living-studio/data/creature-catalog.js';
import {batchCreature} from './batch-creature.js';
const masters=new Map();
function creature(id,options){
 const key=id+':'+JSON.stringify(options);if(!masters.has(key)){const master=createCreatureModel(id,options);batchCreature(master);masters.set(key,master);}
 const master=masters.get(key),group=clone(master.group),joints={},bones=[],rest={};
 for(const [name,bone]of Object.entries(master.rig?.joints||{})){const copy=group.getObjectByName(bone.name);joints[name]=copy;bones.push(copy);rest[name]={p:copy.position.clone(),q:copy.quaternion.clone(),s:copy.scale.clone()};}
 const skeletons=new Set();group.traverse(o=>{if(o.isSkinnedMesh)skeletons.add(o.skeleton);});
 const rig={joints,bones,rest,group,skeleton:[...skeletons][0],reset(){for(const [name,b]of Object.entries(joints)){b.position.copy(rest[name].p);b.quaternion.copy(rest[name].q);b.scale.copy(rest[name].s);}}};
 const actor=finishActor(group,master.rig?rig:null,master.clips,creatureById.get(id),{variants:master.variants});
 actor.dispose=()=>{for(const s of skeletons)s.dispose();group.removeFromParent();group.clear();};return actor;
}
export function studioCreatureCache(){return{masters:masters.size};}
const DEATH_SECONDS=1.1;
const ALIAS={skeletonWarrior:'skeleton',skeletonSexton:'skeleton'};
export function hasStudioCreature(id){return creatureById.has(ALIAS[id]||id);}
export function buildStudioCreature(id){
 const key=ALIAS[id]||id;if(!creatureById.has(key))return null;
 const actor=creature(key,{...(id==='skeletonWarrior'?{armor:'warrior'}:{})}),group=actor.group;
 group.name='monster:'+id;group.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(group),size=bounds.getSize(new THREE.Vector3());
 const radius=Math.max(.13,Math.min(size.x,size.z)*.48),height=Math.max(.2,size.y),parts={};
 const hit=new THREE.Mesh(new THREE.CylinderGeometry(Math.max(.34,radius*1.12),Math.max(.34,radius*1.12),Math.max(.95,height),8),new THREE.MeshBasicMaterial({visible:false}));hit.position.y=Math.max(.95,height)/2;group.add(hit);parts.hit=hit;
 let anim='idle',age=0,phase=0,altitude=0;const names=new Set(actor.clips.map(c=>c.name)),duration=n=>actor.clips.find(c=>c.name===n)?.duration||1;
 const select=n=>names.has(n)?n:n==='swing'?(names.has('bite')?'bite':names.has('gore')?'gore':names.has('threat')?'threat':'idle'):n==='cast'?(names.has('webSpit')?'webSpit':'idle'):n==='hurt'?(names.has('startle')?'startle':'idle'):'idle';
 const oneShot={swing:.65,hurt:.35};
 return{group,parts,radius,height,silhouette:height,clickRadius:Math.max(.34,radius),clickHeight:Math.max(.95,height),shape:'studio:'+key,monster:id,studioActor:actor,
  setAnim(name){if(anim==='die')return;if(name!==anim){anim=name;age=0;}},get anim(){return anim;},get dieDone(){return anim==='die'&&age>=DEATH_SECONDS;},
  setAltitude(metres){altitude=metres;},
  update(dt,speed=0){
   age+=Math.max(0,dt);phase+=Math.max(0,speed)*Math.max(0,dt)/Math.max(.35,height*.7);
   if(oneShot[anim]&&age>oneShot[anim]){anim=speed>.15?'walk':'idle';age=0;}
   const flying=altitude>.12&&names.has('fly')&&['idle','walk','run'].includes(anim),clip=flying?'fly':select(anim);
   const moving=['walk','run','flee'].includes(anim),seconds=anim==='die'?DEATH_SECONDS:oneShot[anim];
   const time=seconds?Math.min(age/seconds,1)*duration(clip):flying?age:moving?phase:age;
   actor.update(time,clip);
  },
  dispose(){hit.geometry.dispose();hit.material.dispose();actor.dispose();},
 };
}
