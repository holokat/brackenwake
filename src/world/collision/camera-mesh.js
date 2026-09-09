import * as T from 'three';
import {triangleCameraDistance} from './camera-triangle.js';
const cache=new WeakMap(),pending=new WeakMap(),CELL=6;
const key=(x,y,z)=>x+','+y+','+z;
function isSolid(mesh){
 if(!mesh.isMesh||mesh.isSkinnedMesh||mesh.isInstancedMesh)return false;
 const materials=[].concat(mesh.material||[]);
 // Moving cloth, water and effects cannot make the camera bob with animation.
 return materials.some(m=>m.visible&&(!m.transparent||m.opacity>.95)&&!/\b(cloth|banner|water|flame|fire|glow|rune|smoke)\b|^(purple|red)$/i.test(m.name));
}
async function geometryIndex(geometry,work,signal){
 if(signal?.aborted)return null;
 if(cache.has(geometry))return cache.get(geometry);
 // Two nearby instances can request the same GLB in the same frame. Share
 // work in flight too. Room cancellation rejects its attachment, while this
 // bounded shared build can still finish for another active instance.
 if(!pending.has(geometry))pending.set(geometry,buildGeometryIndex(geometry,work)
  .then(index=>{cache.set(geometry,index);return index;}).finally(()=>pending.delete(geometry)));
 const result=await pending.get(geometry);return signal?.aborted?null:result;
}
async function buildGeometryIndex(geometry,work){
 const position=geometry.attributes.position,index=geometry.index,count=index?.count??position.count,cells=new Map();
 const p=new T.Vector3(),min=new T.Vector3(),max=new T.Vector3();
 // Build alongside existing upload jobs. Each chunk is bounded; cancelled or
 // evicted rooms never leave an index attached to the active world.
 for(let start=0;start<count;start+=3072){
  await work.run(()=>{
   for(let i=start;i<Math.min(count,start+3072);i+=3){
    min.set(Infinity,Infinity,Infinity);max.set(-Infinity,-Infinity,-Infinity);
    for(let j=0;j<3;j++){p.fromBufferAttribute(position,index?index.getX(i+j):i+j);min.min(p);max.max(p);}
    for(let x=Math.floor(min.x/CELL);x<=Math.floor(max.x/CELL);x++)for(let y=Math.floor(min.y/CELL);y<=Math.floor(max.y/CELL);y++)for(let z=Math.floor(min.z/CELL);z<=Math.floor(max.z/CELL);z++){
     const id=key(x,y,z);let list=cells.get(id);if(!list)cells.set(id,list=[]);list.push(i);
    }
   }
  },{priority:3});
 }
 return{position,index,cells};
}

/** Indexed mesh data is weakly cached with the GLB geometry. Room instances
 * keep only transforms, so repeated chambers share their triangle storage. */
export async function prepareCameraMesh(group,{work,signal}={}){
 const meshes=[];group.traverseVisible(o=>{if(isSolid(o))meshes.push(o);});
 const entries=[];
 for(const mesh of meshes){
  const index=await geometryIndex(mesh.geometry,work,signal);if(!index)return null;
  mesh.geometry.computeBoundingBox();entries.push({mesh,...index,inverse:new T.Matrix4(),box:new T.Box3(),scale:1});
 }
 const from=new T.Vector3(),to=new T.Vector3(),direction=new T.Vector3(),min=new T.Vector3(),max=new T.Vector3(),testBox=new T.Box3(),ray=new T.Ray(),hit=new T.Vector3(),seen=new Set();
 return{
  update(){group.updateWorldMatrix(true,true);for(const e of entries){e.inverse.copy(e.mesh.matrixWorld).invert();e.box.copy(e.mesh.geometry.boundingBox);const s=new T.Vector3().setFromMatrixScale(e.mesh.matrixWorld);e.scale=Math.min(Math.abs(s.x),Math.abs(s.y),Math.abs(s.z));}},
  distance(a,b,radius,maxDistance){
   let limit=maxDistance;
   const worldLength=Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z);if(worldLength<1e-9)return 0;
   for(const e of entries){
    from.set(a.x,a.y,a.z).applyMatrix4(e.inverse);to.set(b.x,b.y,b.z).applyMatrix4(e.inverse);
    direction.copy(to).sub(from);const length=direction.length();if(length<1e-9)continue;direction.divideScalar(length);
    const ratio=length/worldLength,r=radius/e.scale;let localLimit=limit*ratio;
    ray.set(from,direction);testBox.copy(e.box).expandByScalar(r);
    if(!testBox.containsPoint(from)&&(!ray.intersectBox(testBox,hit)||hit.distanceTo(from)>localLimit))continue;
    to.copy(from).addScaledVector(direction,localLimit);min.copy(from).min(to).addScalar(-r);max.copy(from).max(to).addScalar(r);seen.clear();
    for(let x=Math.floor(min.x/CELL);x<=Math.floor(max.x/CELL);x++)for(let y=Math.floor(min.y/CELL);y<=Math.floor(max.y/CELL);y++)for(let z=Math.floor(min.z/CELL);z<=Math.floor(max.z/CELL);z++){
     for(const i of e.cells.get(key(x,y,z))||[]){if(seen.has(i))continue;seen.add(i);localLimit=triangleCameraDistance(e.position,e.index,i,from,direction,r,localLimit);}
    }
    limit=Math.min(limit,localLimit/ratio);
   }
   return limit;
  },
 };
}
