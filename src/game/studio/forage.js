import * as THREE from 'three';
import {createForageModel} from '../../vendor/living-studio/models/forage/index.js';
import {forageById} from '../../vendor/living-studio/data/forage-catalog.js';
import {disposeLivingModel} from '../../vendor/living-studio/models/dressing/index.js';
import {bakeLivingGeometry} from '../../world/living/models.js';
// Source detail is bounded to eight nearby patches. Farther plants keep their
// cheap instances, and both levels share the exact harvest record and clock.
export function createStudioForage(field){
 const root=new THREE.Group();root.name='Nearby studio forage';field.group.add(root);
 const cache=new Map(),active=new Map(),matrix=new THREE.Matrix4(),hidden=new THREE.Matrix4().makeScale(0,0,0),saved=[];
 const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.9,side:THREE.DoubleSide});
 let left=0;
 function geometry(id){if(!cache.has(id)){const model=createForageModel(id),g=bakeLivingGeometry(model);disposeLivingModel(model);cache.set(id,g);}return cache.get(id);}
 function restore(){
  for(const s of saved){
   if(!s.mesh.parent)continue;
   const owners=s.mesh.userData.forageMap,members=s.mesh.userData.forageMembers;
   let index=s.index;if(owners[index]!==s.rec||members?.[index]!==s.member)index=members?members.indexOf(s.member):-1;
   if(index>=0&&owners[index]===s.rec){s.mesh.setMatrixAt(index,s.matrix);s.mesh.instanceMatrix.needsUpdate=true;}
  }
  saved.length=0;
 }
 return{root,
  update(dt,pos){
   // A harvested source model must disappear in the same frame as the record.
   for(const [rec,group]of active)if(rec.harvestedUntil||rec.supportMissing){group.removeFromParent();active.delete(rec);left=0;}
   left-=dt;if(left>0)return;left=.4;restore();
   const wanted=field.records().filter(r=>forageById.has(r.id)&&Math.hypot(r.x-pos.x,r.z-pos.z)<12).sort((a,b)=>Math.hypot(a.x-pos.x,a.z-pos.z)-Math.hypot(b.x-pos.x,b.z-pos.z)).slice(0,8),keep=new Set(wanted);
   for(const [rec,group]of active)if(!keep.has(rec)){group.removeFromParent();active.delete(rec);}
   for(const rec of wanted)if(!active.has(rec)){
    const group=new THREE.Group();for(const member of rec.members||[rec]){const mesh=new THREE.Mesh(geometry(rec.id),material);mesh.position.set(member.x,member.y,member.z);mesh.rotation.y=member.yaw||0;mesh.scale.setScalar(member.scale||1);mesh.userData.forage=rec;mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);}active.set(rec,group);root.add(group);
   }
   field.group.traverse(mesh=>{if(!mesh.isInstancedMesh||!mesh.userData.forageMap)return;for(let i=0;i<mesh.count;i++){const rec=mesh.userData.forageMap[i];if(!keep.has(rec))continue;mesh.getMatrixAt(i,matrix);saved.push({mesh,index:i,rec,member:mesh.userData.forageMembers?.[i],matrix:matrix.clone()});mesh.setMatrixAt(i,hidden);mesh.instanceMatrix.needsUpdate=true;}});
  },
  pick(ray){for(let p=root;p;p=p.parent)if(!p.visible)return null;for(const hit of ray.intersectObjects(root.children,true)){const rec=hit.object.userData.forage;if(rec&&!rec.harvestedUntil&&!rec.supportMissing)return{rec,id:rec.id,point:hit.point,distance:hit.distance};}return null;},
  get count(){return active.size;},
  dispose(){restore();root.removeFromParent();for(const g of cache.values())g.dispose();material.dispose();active.clear();cache.clear();},
 };
}
