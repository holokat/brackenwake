import {createChicken,CHICKEN_CLIPS} from './chicken.js';
import {createWander} from './wander.js';
import {animalClips} from '../../vendor/living-studio/models/dressing/animals.js';
import * as THREE from 'three';
import {SPACES} from '../../mmo/spaces/index.js';
import {createEffectModel} from '../../vendor/living-studio/runtime/world-effects/index.js';
import {createDressingModel,updateDressingModel,disposeLivingModel} from '../../vendor/living-studio/models/dressing/index.js';
import {livingRows,selectLiving,habitatGate,LIVING_LIMITS,canopyAt} from './selection.js';

export function createLivingWorld(sc,field,{spaces=SPACES,physical=null}={}){
 const rows=livingRows(spaces),root=new THREE.Group();root.name='Greenwold living habitats';sc.scene.add(root);
 const active={effects:new Map(),animals:new Map()},errors=[],bodies=new Map();
 const unregisterBodies=physical?.registerActors('ambient',()=>bodies.values());
 // A fixed light count avoids shader recompilation when walking between camps.
 const lights=Array.from({length:LIVING_LIMITS.lights},()=>{const l=new THREE.PointLight(0xffffff,0,1,2);root.add(l);return l;});
 let checkIn=0,closed=false,canopy=0,terrainVersion=-1,lastSelected={effects:[],animals:[],lights:[]};
 const release=(type,key)=>{const item=active[type].get(key);if(!item)return;item.cancelled=true;item.api?.dispose();item.api?.group.removeFromParent();active[type].delete(key);if(type==='animals')bodies.delete(key);};
 async function acquire(type,row){
  const item={row,api:null,cancelled:false};active[type].set(row.key,item);
  try{
   const ground=field.sampleAt(row.x,row.z);
   // Land animals and emitters cannot be placed on the bed of a river.
   if(ground.water&&type==='animals'&&row.id!=='dragonfly'){release(type,row.key);return;}
   let api;
   if(type==='effects')api=await createEffectModel(row.id,{intensity:.65});
   else{
    const group=row.id==='chicken'?createChicken():createDressingModel(row.id);api={group,update:(t,clip)=>group.userData.updateChicken?group.userData.updateChicken(t,clip):updateDressingModel(group,t,clip||row.clip||'idle'),dispose:()=>disposeLivingModel(group)};
    if((row.id==='chicken'?CHICKEN_CLIPS:animalClips[row.id]||[]).includes('walk'))item.wander=createWander({id:row.key,x:row.x,y:ground.h,z:row.z,range:['duck','chicken'].includes(row.id)?3:7,speed:row.id==='horse'?.7:row.id==='chicken'?.3:.42,pause:row.id==='sheep'?7:10,radius:row.id==='chicken'?.18:.4,attention:['duck','chicken'].includes(row.id)?1.2:1.8});
   }
   if(closed||item.cancelled){api.dispose();return;}
   const base=ground.water?ground.waterLevel:ground.h;
   api.group.position.set(row.x,base+(row.y||0),row.z);api.group.scale.setScalar(row.scale||1);api.group.rotation.y=(row.yaw||0)*Math.PI/180;
   if(type==='animals')api.group.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
   item.api=api;root.add(api.group);
   if(type==='animals')bodies.set(row.key,{pos:api.group.position,group:api.group,radius:row.id==='chicken'?.18:row.id==='dragonfly'?.03:.4,height:row.id==='chicken'?.44:row.id==='dragonfly'?.08:1.2});
  }catch(error){errors.push(`${row.key}: ${error.message}`);release(type,row.key);}
 }
 const api={
  root,errors,
  update(dt,time,eye,day,weather={},hidden=false){
   if(closed)return;
   hidden=hidden||!field.sculpt;
   const version=field.terrainEdits?.version??0;
   if(version!==terrainVersion){terrainVersion=version;checkIn=0;for(const type of ['effects','animals'])for(const key of active[type].keys())release(type,key);}
   root.visible=!hidden;
   canopy+=(canopyAt(eye.x,eye.z)-canopy)*(1-Math.exp(-Math.max(0,dt)/1.4));
   if(!hidden){sc.lights.hemi.intensity*=1-canopy*.32;sc.lights.ambient.intensity*=1-canopy*.27;sc.lights.sun.intensity*=1-canopy*.22;}
   checkIn-=dt;
   if(checkIn<=0||hidden){
    checkIn=.4;
    for(const type of ['effects','animals','lights'])lastSelected[type]=selectLiving(rows[type],type,eye,day,weather,hidden);
    for(const type of ['effects','animals']){
     const keep=new Set(lastSelected[type].map(r=>r.key));
     for(const key of active[type].keys())if(!keep.has(key))release(type,key);
     for(const row of lastSelected[type])if(!active[type].has(row.key))void acquire(type,row);
    }
   }
   for(const type of ['effects','animals'])for(const item of active[type].values()){const {api:body,row}=item;if(body){
    body.group.visible=!hidden&&habitatGate(row.gate,day,weather);
    if(body.group.visible){
     let clip=row.clip;if(item.wander){const p=item.wander.update(dt,{field,physical,observer:eye,others:[...active.animals.values()].filter(other=>other!==item&&other.wander).map(other=>other.wander.pos)});body.group.position.set(p.x,p.y+(row.y||0),p.z);if(item.wander.mode==='walk'){body.group.rotation.y=item.wander.yaw-Math.PI/2;clip='walk';}else if(animalClips[row.id]?.includes('graze'))clip='graze';}
     body.update(time,clip);
    }
   }}
   for(let i=0;i<lights.length;i++){
    const light=lights[i],row=lastSelected.lights[i];
    if(!row||hidden||day>=.3){light.intensity=0;continue;}
    light.position.set(row.x,field.heightAt(row.x,row.z)+(row.y||1.5),row.z);light.color.set(row.color);light.distance=row.range;
    const night=Math.min(1,(.3-day)/.18),fade=Math.min(1,(LIVING_LIMITS.lightDistance-Math.hypot(row.x-eye.x,row.z-eye.z))/12);
    light.intensity=row.power*night*Math.max(0,fade)*(1+Math.sin(time*3.1+i)*.035);
   }
  },
  get stats(){return{effects:[...active.effects.values()].filter(i=>i.api).map(i=>i.row.key),animals:[...active.animals.values()].filter(i=>i.api).map(i=>i.row.key),lights:lights.filter(l=>l.intensity>0).length,canopy,behaviour:[...active.animals.values()].map(i=>({id:i.row.key,mode:i.wander?.mode||i.row.clip,distance:i.wander?.distance||0})),errors:[...errors]};},
  dispose(){closed=true;unregisterBodies?.();for(const type of ['effects','animals'])for(const key of active[type].keys())release(type,key);for(const l of lights)l.dispose();root.removeFromParent();},
 };
 return api;
}
