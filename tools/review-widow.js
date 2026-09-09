import * as T from 'three';
import {bindMineSceneEffects} from '../src/game/mine_scene_effects.js';
import {createScene} from '../src/game/scene.js';
import {createShoulderWorking,mineHeight} from '../src/world/shoulder_working.js';
import {createDungeonScene} from '../src/world/dungeon.js';
import {furnishShoulder} from '../src/world/shoulder_scene.js';
import {worldOf} from '../src/world/dungeon_gen.js';
import {buildMonsterModel} from '../src/game/monster_models.js';

const status=document.querySelector('#status');
const savedImages=[];
const sc=createScene(document.querySelector('#scene'));
sc.renderer.setPixelRatio(1);sc.renderer.toneMappingExposure=.92;
sc.sky.visible=false;for(const light of Object.values(sc.lights))light.visible=false;

const L=createShoulderWorking(42,{id:'s:island_mine_east',space:'island_mine_east'});
const built=furnishShoulder(createDungeonScene(T,L),L);
if(!await built.ready)throw Error('Widow GLB did not load');
const release=bindMineSceneEffects(sc,{inDungeon:true,dungeonScene:built});
sc.scene.add(built.group);sc.scene.background=new T.Color(built.palette.bg);
sc.setFog(built.palette.fogNear,built.palette.fogFar,built.palette.fog);
const cam=sc.camera;cam.fov=68;cam.aspect=1.6;cam.far=500;cam.updateProjectionMatrix();
const actors=[];
for(const s of L.authoredSpawns){
 const actor=buildMonsterModel(s.id);if(!actor)continue;
 if(actor.ready)await actor.ready;
 const p=worldOf(L,s.gx,s.gz);actor.group.position.set(p.x,mineHeight(p.z),p.z);
 sc.scene.add(actor.group);actors.push(actor);
}
const views=[
 {name:'widow-hero-final',room:7,offset:[-1,5,29],target:[-3,13,-10]},
 {name:'widow-before-angle-final',room:7,offset:[17,6,24],target:[0,8,-4]},
 {name:'widow-reverse-final',room:7,offset:[-3,7,-30],target:[-8,9,9]},
 {name:'widow-gallery-final',room:7,offset:[-27,13.8,6],target:[-16,14,-15]},
];
try{
 await new Promise(resolve=>setTimeout(resolve,1500));
 for(const v of views){
  status.textContent='Capturing '+v.name;
  const room=L.rooms[v.room],p=worldOf(L,room.cx,room.cz),y=mineHeight(p.z);
  cam.position.set(p.x+v.offset[0],y+v.offset[1],p.z+v.offset[2]);
  cam.lookAt(p.x+v.target[0],y+v.target[1],p.z+v.target[2]);
  for(let frame=0;frame<120;frame++){built.update(1/60,cam.position);for(const actor of actors)actor.update(1/60,0);}
  await sc.renderer.compileAsync(sc.scene,cam);sc.render(.016);
  const blob=await new Promise(resolve=>sc.renderer.domElement.toBlob(resolve));
  savedImages.push({name:v.name,url:URL.createObjectURL(blob)});
  const response=await fetch('/__art_capture/'+v.name,{method:'POST',body:blob});
  if(!response.ok)throw Error('Capture failed: '+response.status);
 }
 const measurements=[];
 for(const [width,height]of [[1440,900],[430,800]]){
  const el=document.querySelector('#scene');el.style.width=width+'px';el.style.height=height+'px';sc.resize();
  const v=views[0],p=worldOf(L,L.rooms[7].cx,L.rooms[7].cz),y=mineHeight(p.z);
  cam.position.set(p.x+v.offset[0],y+v.offset[1],p.z+v.offset[2]);cam.lookAt(p.x+v.target[0],y+v.target[1],p.z+v.target[2]);
  const times=[];sc.renderer.info.autoReset=false;
  for(let i=0;i<150;i++){
   await new Promise(requestAnimationFrame);const start=performance.now();sc.renderer.info.reset();
   built.update(1/60,cam.position);for(const actor of actors)actor.update(1/60,0);sc.render(1/60);sc.renderer.getContext().finish();
   if(i>=30)times.push(performance.now()-start);
  }
  times.sort((a,b)=>a-b);measurements.push({width,height,frames:times.length,medianMs:times[60],p95Ms:times[114],render:{...sc.renderer.info.render},memory:{...sc.renderer.info.memory},webglError:sc.renderer.getContext().getError()});
  if(width===430){const blob=await new Promise(r=>sc.renderer.domElement.toBlob(r));await fetch('/__art_capture/widow-mobile-final',{method:'POST',body:blob});}
 }
 const before={...sc.renderer.info.memory};built.dispose();for(const actor of actors)actor.dispose?.();release();sc.render(.016);const after={...sc.renderer.info.memory};
 const record={userAgent:navigator.userAgent,devicePixelRatio:sc.renderer.getPixelRatio(),measurements,disposal:{before,after}};
 await fetch('/__art_capture/widow-performance',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(record,null,2)});
 sc.dispose();
 const el=document.querySelector('#scene');el.replaceChildren();el.style.cssText='width:100%;height:auto';
 for(const item of savedImages){const img=document.createElement('img');img.src=item.url;img.alt=item.name.replaceAll('-',' ');img.style.cssText='display:block;width:100%;margin-bottom:24px';el.append(img);}
 status.textContent='Four views saved. Frame measurements and cleanup verified.';
}catch(error){status.textContent=String(error.stack||error);console.error(error);}
