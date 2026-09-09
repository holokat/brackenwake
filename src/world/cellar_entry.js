import {cutCellarGeologyStaged} from './cellar_geometry_jobs.js';
import {createCellarRoomProxy} from './cellar_room_proxy.js';
import {createRoomArtwork} from '../game/streaming/room_artwork.js';
import {prepareRoomShadows} from '../game/streaming/room_gpu_warmup.js';
import {assetWork} from '../game/streaming/work_queue.js';
import {CELLAR_ASSETS} from './cellar_asset_catalog.js';
import * as T from 'three';
import manifest from '../../assets/models/cellars/entry/manifest.json' with {type:'json'};
import {CELLAR_ENTRY_PLAN as plan, hasCellarEntry, inEntryRegion} from './cellar_entry_layout.js';
import {configureCellarGlow} from './cellar_fixture_lighting.js';

export function furnishCellarEntry(built,L,{load=null,stream,sc}={}){
 if(!hasCellarEntry(L))return null;
 const group=new T.Group();group.name='Blender: Arrival cellar and broken nave';group.position.set(plan.origin.x,plan.origin.y,plan.origin.z);built.group.add(group);
 built.physicalBodies.push(...manifest.colliders.map(c=>({...c,x:c.x+plan.origin.x,y:c.y+plan.origin.y,z:c.z+plan.origin.z})));
 const proxy=createCellarRoomProxy(manifest.colliders,plan.rooms);group.add(proxy.group);
 const clock={value:0},lights=[];let disposed=false,active=false,cut=false;
 // Static architectural shadows never capture moving actors or cloth.
 for(const [x,y,z,power,range]of[[-15,5,3,70,38],[15,5,-12,65,36],[-18,4,-54,110,46],[18,5,-87,115,50]]){
  const l=new T.PointLight(0xffb564,power,range,1.4);l.position.set(x,y,z);l.castShadow=true;l.visible=false;l.shadow.mapSize.set(512,512);l.shadow.bias=-.0005;l.shadow.normalBias=.035;l.shadow.camera.near=.2;l.shadow.camera.layers.set(3);l.shadow.autoUpdate=false;l.shadow.needsUpdate=true;group.add(l);lights.push(l);
 }
 const art=createRoomArtwork({id:'entry',url:CELLAR_ASSETS.entry,stream,sc,lights,cameraObstacles:built.cameraObstacles,
  bounds:{x:plan.origin.x,z:plan.origin.z-39,rx:35,rz:59},load:load||(typeof window==='undefined'?async()=>null:null),
  configureMesh:o=>{if(![].concat(o.material).some(m=>m.name==='Cellar cloth'))o.layers.enable(3);},
  configure:m=>{
   configureCellarGlow(m);
   if(m.name==='Cellar cloth'){
    m.onBeforeCompile=s=>{s.uniforms.entryTime=clock;s.vertexShader='uniform float entryTime;\n'+s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n transformed.z += sin(position.y*.8 + position.x + entryTime*.7)*.055*clamp((12.0-position.y)/6.0,0.0,1.0);');};
    m.customProgramCacheKey=()=> 'cellar-entry-cloth-v1';
   }
  },
  beforeAttach:async(instance,signal)=>{if(!cut)cut=await cutCellarGeologyStaged(built,(x,z)=>inEntryRegion(L,x,z,1.5),{signal});return cut && await prepareRoomShadows(instance.group,group,lights,{sc,work:assetWork,signal});},
  attach:instance=>{group.add(instance.group);proxy.group.removeFromParent();for(const o of built.group.children)if(o.userData.exit==='up'&&!built.exits.includes(o))o.visible=false;},
  detach:()=>{if(!disposed){group.add(proxy.group);for(const o of built.group.children)if(o.userData.exit==='up'&&o.userData.stairVisual)o.visible=true;}for(const light of lights){light.visible=false;light.shadow.needsUpdate=true;}},
 });
 const anchors=manifest.anchors.map(a=>({...a,x:a.x+plan.origin.x,y:a.y+plan.origin.y,z:a.z+plan.origin.z}));
 return{group,anchors,get ready(){return art.ready;},get loaded(){return art.loaded;},get active(){return active;},
  update(time,pos){clock.value=time;active=art.loaded&&(!pos||inEntryRegion(L,pos.x,pos.z,25));for(const l of lights)l.visible=active;for(const m of art.materials)if(m.userData.streamGlow)m.emissiveIntensity=m.userData.streamGlow*(.96+Math.sin(time*3.2)*.04);},
  dispose(){if(disposed)return;disposed=true;art.dispose();group.removeFromParent();proxy.dispose();for(const l of lights){l.shadow.map?.dispose();l.dispose();}},
 };
}
