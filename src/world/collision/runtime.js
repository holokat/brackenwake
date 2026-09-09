import {dungeonPhysical} from './dungeon.js';
import {actorsAllowMove} from './actors.js';
import {variantOf,VARIANTS,ROCK_VARIANTS} from '../flora.js';
import {treeFieldsFor} from '../../farm/tree_edit.js';
import {createCollisionIndex} from './shapes.js';
export function createPhysicalWorld(runtime){
 const actors=new Map(),providers=new Map();let providerVersion=0;
 let index=createCollisionIndex(),stamp='',treeStamp='',next=0;
 const rebuild=()=>{
  const bodies=runtime.siteMarkers.colliders();
  for(const get of providers.values())bodies.push(...get());
  for(const f of treeFieldsFor()){
   if(!f.meshes?.some(m=>m.parent&&m.visible&&m.parent.visible))continue;
   for(const t of f.trees){
    const rock=f.kind==='rock',k=t.s??1,v=f.variants?.[variantOf(t,rock?ROCK_VARIANTS:VARIANTS)%f.variants.length];
    bodies.push({kind:'circle',model:f.name,x:t.x,z:t.z,y:t.gy??runtime.heightAt(t.x,t.z),r:rock?Math.max(.3,k*(v?.geo?.boundingSphere?.radius??.55)):Math.max(.12,k*(v?.baseR??.32)),h:rock?Math.max(.4,k*(v?.height??1.1)):Math.max(2,k*(v?.height??8)),enabled:()=>!t.felledUntil});
   }
  }
  index=createCollisionIndex(bodies);
 };
 const current=()=>runtime.dungeonLayout?dungeonPhysical(runtime.dungeonLayout,runtime.dungeonScene):index;
 return{
  registerActors(id,get){actors.set(id,get);return()=>actors.delete(id);},
  register(id,get){providers.set(id,get);providerVersion++;return()=>{providers.delete(id);providerVersion++;};},
  changed(){providerVersion++;},
  update(dt=0){next-=dt;const key=runtime.siteMarkers.collisionVersion+':'+providerVersion; if(next>0&&key===stamp)return;next=.5;const trees=treeFieldsFor().map(f=>`${f.name}:${f.trees.length}:${f.meshes[0]?.uuid}`).join('|');if(key!==stamp||trees!==treeStamp){stamp=key;treeStamp=trees;rebuild();}},
  canMove(from,to,r=.32,h=1.75){if(!current().canMove(from,to,r,h))return false;for(const get of actors.values())if(!actorsAllowMove(from,to,get(),r,h))return false;return true;},
  at(x,y,z,r=.32,h=1.75){return current().at(x,y,z,r,h);},
  supportAt(x,z,below){return current().supportAt(x,z,below);},
  ceilingAt(x,z,feet){return current().ceilingAt(x,z,feet);},
  cameraDistance(from,to,radius){return current().cameraDistance(from,to,radius);},
  get bodies(){return index.bodies;},
  invalidate(){stamp='';next=0;},
 };
}
