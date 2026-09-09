import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {inDescentRoom} from './cellar_descent_layout.js';
import {cutCellarGeology} from './cellar_mesh_cut.js';
import {createCellarLoadingGeometry} from './cellar_loading_geometry.js';
import {enableSpellBloom} from '../game/vfx/bloom.js';
const urls={
 'boss-01':new URL('../../assets/models/cellars/descent/boss-01.glb',import.meta.url).href,
 'boss-02':new URL('../../assets/models/cellars/descent/boss-02.glb',import.meta.url).href,
 'boss-03':new URL('../../assets/models/cellars/descent/boss-03.glb',import.meta.url).href,
 'boss-04':new URL('../../assets/models/cellars/descent/boss-04.glb',import.meta.url).href,
 'boss-05':new URL('../../assets/models/cellars/descent/boss-05.glb',import.meta.url).href,
 'boss-06':new URL('../../assets/models/cellars/descent/boss-06.glb',import.meta.url).href,
 'boss-07':new URL('../../assets/models/cellars/descent/boss-07.glb',import.meta.url).href,
 'regular-crypt':new URL('../../assets/models/cellars/descent/regular-crypt.glb',import.meta.url).href,
 'regular-store':new URL('../../assets/models/cellars/descent/regular-store.glb',import.meta.url).href,
 'regular-chapel':new URL('../../assets/models/cellars/descent/regular-chapel.glb',import.meta.url).href,
};
const cache=new Map();
function disposeAsset(asset){const resources=new Set();asset.scene.traverse(o=>{if(o.geometry)resources.add(o.geometry);for(const m of [].concat(o.material||[])){resources.add(m);for(const v of Object.values(m))if(v?.isTexture)resources.add(v);}});for(const r of resources)r.dispose();}
function acquire(id){
 let entry=cache.get(id);
 if(!entry){entry={refs:0};cache.set(id,entry);entry.promise=new GLTFLoader().loadAsync(urls[id]).catch(e=>{if(cache.get(id)===entry)cache.delete(id);throw e;});}
 entry.refs++;return{promise:entry.promise,release(){entry.refs--;if(!entry.refs)entry.promise.then(a=>{if(entry.refs)return;disposeAsset(a);if(cache.get(id)===entry)cache.delete(id);}).catch(()=>{});}};
}
export function furnishCellarDescent(built,L,{load=null}={}){
 const rooms=[],anchors=[];let disposed=false;
 for(const room of L.descent||[]){
  const {spec}=room,group=new T.Group();group.name='Blender: '+spec.name;group.position.set(room.x,room.y,room.z);built.group.add(group);
  built.physicalBodies.push(...spec.colliders.map(c=>({...c,x:c.x+room.x,y:c.y+room.y,z:c.z+room.z})));
  const proxy=createCellarLoadingGeometry(spec.colliders);group.add(proxy.group);
  const materials=[],glows=[],clock={value:0},state={group,room,loaded:false,active:false};rooms.push(state);
  anchors.push(...spec.anchors.map(a=>({...a,x:a.x+room.x,y:a.y+room.y,z:a.z+room.z})));
  const lease=load?{promise:load(spec.id),release(){}}:typeof window!=='undefined'&&window.document?acquire(spec.id):{promise:Promise.resolve(null),release(){}};
  state.ready=lease.promise.then(asset=>{
   if(!asset||disposed)return false;const model=asset.scene.clone(true);
   model.traverse(o=>{if(!o.isMesh)return;o.castShadow=true;o.receiveShadow=true;const m=o.material.clone();o.material=m;materials.push(m);
    if(m.emissive?.getHex()){enableSpellBloom(m);glows.push({m,base:m.emissiveIntensity});}
    if(/Descent (water|cloth)/.test(m.name)){
     const water=m.name.includes('water'),top=Math.min(spec.ceiling*.58,19).toFixed(2);
     m.onBeforeCompile=s=>{s.uniforms.cellarTime=clock;s.vertexShader='uniform float cellarTime;\n'+s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n'+(water?'transformed.y += sin(position.x*.8+cellarTime*.4)*sin(position.z*.6+cellarTime*.3)*.012;':`transformed.z += sin(position.x+position.y*.6+cellarTime*.65)*.09*clamp((${top}-position.y)/7.0,0.0,1.0);`));};
     m.customProgramCacheKey=()=>`descent-${water?'water':top}-v1`;
    }
   });
   group.add(model);proxy.dispose();cutCellarGeology(built,(x,z)=>inDescentRoom(room,x,z,1));state.loaded=true;return true;
  }).catch(e=>{if(!disposed)console.warn('Cellar chamber artwork',spec.id,e.message);return false;});
  state.update=(time,pos)=>{clock.value=time;state.active=!pos||Math.hypot(pos.x-room.x,pos.z-room.z)<110;group.visible=state.active;for(const {m,base}of glows)m.emissiveIntensity=base*(.95+.05*Math.sin(time*2.3));};
  state.dispose=()=>{group.removeFromParent();proxy.dispose();for(const m of materials)m.dispose();lease.release();};
 }
 return{rooms,anchors,ready:Promise.all(rooms.map(r=>r.ready)).then(a=>a.every(Boolean)),get loaded(){return rooms.length>0&&rooms.every(r=>r.loaded);},get active(){return rooms.some(r=>r.loaded&&r.active);},update(time,pos){for(const r of rooms)r.update(time,pos);},dispose(){if(disposed)return;disposed=true;for(const r of rooms)r.dispose();}};
}
