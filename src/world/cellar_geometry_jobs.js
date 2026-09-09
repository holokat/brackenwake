import * as T from 'three';
import {assetWork} from '../game/streaming/work_queue.js';
const chains=new WeakMap();
/** Build replacement buffers in slices; commit every attribute together to keep frames valid. */
export function cutCellarGeologyStaged(built,inside,{signal,work=assetWork}={}) {
 const run=async()=>{
  for(const mesh of [built.parts.floor,built.parts.ceiling,...built.parts.walls]){
   if(signal?.aborted)return false;
   const g=mesh?.geometry,p=g?.attributes.position;if(!p)continue;
   const keep=[];
   for(let from=0;from<p.count;from+=3072){
    if(signal?.aborted)return false;
    await work.run(()=>{for(let i=from;i<Math.min(p.count,from+3072);i+=3){
     const x=(p.getX(i)+p.getX(i+1)+p.getX(i+2))/3,z=(p.getZ(i)+p.getZ(i+1)+p.getZ(i+2))/3;
     if(!inside(x,z))keep.push(i,i+1,i+2);
    }},{signal,priority:2});
   }
   if(keep.length===p.count)continue;
   const attributes={};
   for(const [key,a]of Object.entries(g.attributes)){
    const values=new a.array.constructor(keep.length*a.itemSize);
    for(let from=0;from<keep.length;from+=3072){
     if(signal?.aborted)return false;
     await work.run(()=>{for(let j=from;j<Math.min(keep.length,from+3072);j++)for(let k=0;k<a.itemSize;k++)values[j*a.itemSize+k]=a.array[keep[j]*a.itemSize+k];},{signal,priority:2});
    }
    attributes[key]=new T.BufferAttribute(values,a.itemSize,a.normalized);
   }
   await work.run(()=>{const replacement=new T.BufferGeometry();for(const [key,a]of Object.entries(attributes))replacement.setAttribute(key,a);replacement.computeBoundingSphere();mesh.geometry=replacement;g.dispose();},{signal,priority:2});
  }
  return !signal?.aborted;
 };
 const next=(chains.get(built)||Promise.resolve()).then(run);
 // Failed/cancelled room work cannot poison the next room's geometry job.
 chains.set(built,next.catch(()=>false));return next;
}
