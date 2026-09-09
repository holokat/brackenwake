import * as T from 'three';
import {inDescentRoom} from './cellar_descent_layout.js';
import {cutCellarGeologyStaged} from './cellar_geometry_jobs.js';
import {createCellarRoomProxy} from './cellar_room_proxy.js';
import {createRoomArtwork} from '../game/streaming/room_artwork.js';
import {CELLAR_ASSETS} from './cellar_asset_catalog.js';
import {enableSpellBloom} from '../game/vfx/bloom.js';

export function furnishCellarDescent(built,L,{load=null,stream,sc}={}){
 const rooms=[],anchors=[];let disposed=false;
 for(const room of L.descent||[]){
  const {spec}=room,group=new T.Group();group.name='Blender: '+spec.name;group.position.set(room.x,room.y,room.z);built.group.add(group);
  built.physicalBodies.push(...spec.colliders.map(c=>({...c,x:c.x+room.x,y:c.y+room.y,z:c.z+room.z})));
  const proxy=createCellarRoomProxy(spec.colliders,[{polygon:spec.polygon,rx:spec.rx,rz:spec.rz,ceiling:spec.ceiling}]);group.add(proxy.group);
  const clock={value:0};let cut=false;
  const state={group,room,active:false};rooms.push(state);
  anchors.push(...spec.anchors.map(a=>({...a,x:a.x+room.x,y:a.y+room.y,z:a.z+room.z})));
  const art=createRoomArtwork({id:`descent-${room.roomId}`,url:CELLAR_ASSETS[spec.id],stream,sc,
   bounds:{x:room.x,z:room.z,rx:spec.rx,rz:spec.rz},load:load?()=>load(spec.id):typeof window==='undefined'?async()=>null:null,
   configure:m=>{
    if(m.emissive?.getHex()){enableSpellBloom(m);m.userData.streamGlow=m.emissiveIntensity;}
    if(/Descent (water|cloth)/.test(m.name)){
     const water=m.name.includes('water'),top=Math.min(spec.ceiling*.58,19).toFixed(2);
     m.onBeforeCompile=s=>{s.uniforms.cellarTime=clock;s.vertexShader='uniform float cellarTime;\n'+s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n'+(water?'transformed.y += sin(position.x*.8+cellarTime*.4)*sin(position.z*.6+cellarTime*.3)*.012;':`transformed.z += sin(position.x+position.y*.6+cellarTime*.65)*.09*clamp((${top}-position.y)/7.0,0.0,1.0);`));};
     m.customProgramCacheKey=()=>`descent-${water?'water':top}-v1`;
    }
   },
   beforeAttach:async(instance,signal)=>{if(!cut)cut=await cutCellarGeologyStaged(built,(x,z)=>inDescentRoom(room,x,z,1),{signal});return cut;},
   attach:instance=>{group.add(instance.group);proxy.group.removeFromParent();},detach:()=>{if(!disposed)group.add(proxy.group);},
  });
  Object.defineProperties(state,{ready:{get:()=>art.ready},loaded:{get:()=>art.loaded}});
  state.update=(time,pos)=>{clock.value=time;state.active=!pos||Math.hypot(pos.x-room.x,pos.z-room.z)<110;group.visible=state.active;for(const m of art.materials)if(m.userData.streamGlow)m.emissiveIntensity=m.userData.streamGlow*(.95+.05*Math.sin(time*2.3));};
  state.dispose=()=>{art.dispose();group.removeFromParent();proxy.dispose();};
 }
 return{rooms,anchors,get ready(){return Promise.all(rooms.map(r=>r.ready)).then(a=>a.every(Boolean));},get loaded(){return rooms.length>0&&rooms.every(r=>r.loaded);},get active(){return rooms.some(r=>r.loaded&&r.active);},update(time,pos){for(const r of rooms)r.update(time,pos);},dispose(){if(disposed)return;disposed=true;for(const r of rooms)r.dispose();}};
}
