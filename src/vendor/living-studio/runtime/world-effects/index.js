import * as THREE from 'three';
import {effectById} from '../../data/effect-catalog.js';
import {ambientEffect} from './ambient.js';
import {environmentEffect} from './environment.js';
import {disposeEffect} from './shapes.js';

export async function createEffectModel(id,{intensity=1}={}){
 const entry=effectById.get(id);if(!entry)throw new Error(`Unknown effect: ${id}`);
 const root=new THREE.Group();root.name=id;root.userData={effectId:id,units:'metres',upAxis:'Y',duration:entry.duration,source:entry.source,authored:entry.authored,previewRadius:entry.radius,particleRuntime:true};
 let disposed=false;
 try{
  const updates=await (['butterfly','motes','smoke','pollen','mist','crows','rain','leaves','spray'].includes(entry.style)?ambientEffect(root,entry):environmentEffect(root,entry));
  const api={group:root,clips:[],entry,update(time){if(disposed)return;const t=Math.max(0,Number.isFinite(time)?time:0);for(const update of updates)update(t);root.updateMatrixWorld(true);},setIntensity(value){const v=Math.max(0,Math.min(2,Number(value)||0));root.traverse(o=>{if(o.material?.uniforms?.intensity)o.material.uniforms.intensity.value=v;});},dispose(){if(disposed)return;disposed=true;disposeEffect(root);updates.length=0;}};
  api.setIntensity(intensity);api.update(0);return api;
 }catch(error){disposeEffect(root);throw error;}
}
export function effectPreset(id){const entry=effectById.get(id);if(!entry)throw new Error(`Unknown effect: ${id}`);return {format:'kaldera-effect',version:1,id,units:'metres',upAxis:'Y',duration:entry.duration,loop:entry.loop,radius:entry.radius,color:entry.color,intensity:1,runtime:'runtime/world-effects/index.js',factory:'createEffectModel',source:entry.source,authored:entry.authored};}
