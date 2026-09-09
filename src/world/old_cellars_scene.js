import {createCellarAssetStream} from './cellar_asset_stream.js';
import {createNearbyEffects} from '../game/streaming/nearby_effects.js';
import {furnishCellarDescent} from './cellar_descent.js';
import {descentRoom} from './cellar_descent_layout.js';
import * as T from 'three';
import {furnishCellarSecondaryRooms} from './cellar_secondary_art.js';
import {furnishBlenderCellar} from './cellar_blender_room.js';
import {cellarGroundHeight} from './cellar_landmark_layout.js';
import {createCellarMagic} from './cellar_magic.js';
import {furnishCellarVaults} from './cellar_vaults.js';
import {furnishCellarEntry} from './cellar_entry.js';
import {hasCellarEntry} from './cellar_entry_layout.js';
import {worldOf,walkable} from './dungeon_gen.js';
import {ceilingAt} from './dungeon.js';
import {cellarHeight} from './old_cellars.js';
import {raiseDungeon} from './dungeon_elevation.js';
import {buildLivingProp} from './living/models.js';
import {buildSepulcher} from '../game/cellar_models.js';
// The compatibility export used by older authored layouts.
export function createCellarFurnishings(){return {group:new T.Group(),physicalBodies:[]};}
export function furnishOldCellars(built,L,{sc,artLoaders={}}={}){
 built.cameraObstacles=new Set();
 const streaming=sc?createCellarAssetStream(L,built):null;built.streaming=streaming;
 const root=new T.Group();root.name=L.name;built.group.add(root);const ground=(x,z)=>cellarGroundHeight(L,x,z,z=>cellarHeight(L.level,z));raiseDungeon(built,(z,x)=>ground(x,z));
 const lights=[],lamps=[],rings=[],batches=new Map();let time=0,disposed=false;
 const stone=new T.MeshStandardMaterial({color:L.theme.ore,roughness:.83});
 const rune=new T.MeshStandardMaterial({color:L.theme.color,emissive:L.theme.color,emissiveIntensity:.85,roughness:.4});
 const cone=new T.ConeGeometry(1,1,8),dummy=new T.Object3D();
 const add=(geo,mat,x,y,z,w,h,d,rz=0)=>{const key=geo.uuid+mat.uuid;if(!batches.has(key))batches.set(key,{geo,mat,list:[]});batches.get(key).list.push({x,y,z,w,h,d,rz});};
 const pAt=(gx,gz)=>{const p=worldOf(L,gx,gz);return {...p,y:ground(p.x,p.z)};};
 const effects=createNearbyEffects(root);
 const emit=(id,p,k=1)=>effects.add(id,p,k,id==='woodland_shafts'?fx=>{
  const shafts=[];fx.group.traverse(o=>{if(o.isMesh&&/^Light shaft /.test(o.name)){o.material.color.set(0xa1b7df);shafts.push(o.material);}});
  const update=fx.update.bind(fx);fx.update=t=>{update(t);for(const material of shafts)material.opacity*=.22;};
 }:null);
 for(const r of L.rooms){
  if(descentRoom(L,r.id)||r.id===L.landmark.roomId || (hasCellarEntry(L)&&r.id<2))continue;
  const p=pAt(r.cx,r.cz),roof=ceilingAt(L,r.cx,r.cz);
  for(let i=0;i<16;i++){
   const a=i/16*Math.PI*2,gx=Math.round(r.cx+Math.cos(a)*r.w*.36),gz=Math.round(r.cz+Math.sin(a)*r.h*.35);
   if(!walkable(L,gx,gz))continue;const p=pAt(gx,gz),h=ceilingAt(L,gx,gz),length=3+(i%5)*1.2;
   add(cone,stone,p.x,p.y+h-length*.4,p.z,1+length*.13,length,1+length*.13,Math.PI);
  }
  const lamp=pAt(r.cx+7,r.cz+6),brazier=buildLivingProp('lw_watch_fire');brazier.position.set(lamp.x+.35,lamp.y,lamp.z);brazier.scale.setScalar(1.8);root.add(brazier);lamps.push(new T.Vector3(lamp.x,lamp.y+3,lamp.z));
  emit('watch_fire',{...lamp,y:lamp.y+.7},L.level===8?3:1.8);emit('chimney_embers',{...lamp,y:lamp.y+1},1.5);
  emit(L.level%2?'cave_dust':'mist_bank',{...p,y:p.y+.2},L.level===8?5:3);
  if(r.id%3===0)emit('chimney_smoke',{...lamp,y:lamp.y+1},2);
  if(r.kind==='hall'||r.kind==='boss'){
   const ring=new T.Mesh(new T.TorusGeometry(Math.min(15,r.w*.3),.09,5,64),rune);ring.rotation.x=Math.PI/2;ring.position.set(p.x,p.y+.12,p.z);root.add(ring);rings.push(ring);
   // Cut shafts and hanging dust reveal the height of the roof.
   const shaft=new T.Mesh(new T.CylinderGeometry(.4,5,roof*.8,12,1,true),new T.MeshBasicMaterial({color:L.theme.color,transparent:true,opacity:.035,blending:T.AdditiveBlending,depthWrite:false,side:T.DoubleSide}));shaft.position.set(p.x+6,p.y+roof*.45,p.z-8);shaft.rotation.z=.1;root.add(shaft);
  }
 }
 for(const {geo,mat,list} of batches.values()){const mesh=new T.InstancedMesh(geo,mat,list.length);list.forEach((p,i)=>{dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(0,0,p.rz);dummy.scale.set(p.w,p.h,p.d);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});mesh.computeBoundingSphere();root.add(mesh);}
 for(let i=0;i<4;i++){const light=new T.PointLight(L.level===4?0xff773b:0xffb96c,80,42,1.3);root.add(light);lights.push(light);}
 root.add(new T.HemisphereLight(0xb1c2d9,0x343341,hasCellarEntry(L)?.28:.58));
 furnishCellarVaults(root,L,built.physicalBodies);
 const roomArt=furnishCellarSecondaryRooms(root,L,built.physicalBodies);lamps.push(...roomArt.lamps);
 const landmark=furnishBlenderCellar(built,L,{stream:streaming,sc,load:artLoaders.landmark});built.landmark=landmark;
 const entry=furnishCellarEntry(built,L,{stream:streaming,sc,load:artLoaders.entry});built.entry=entry;const descent=furnishCellarDescent(built,L,{stream:streaming,sc,load:artLoaders.descent});built.descent=descent;Object.defineProperty(built,'ready',{get:()=>streaming?streaming.ready():Promise.all([landmark.ready,entry?.ready??true,descent.ready]).then(results=>results.every(Boolean))});
 for(const anchor of [...landmark.anchors,...(entry?.anchors||[]),...descent.anchors]){
  if(anchor.kind==='lamp')lamps.push(Object.assign(new T.Vector3(anchor.x,anchor.y,anchor.z),{color:0xffb765}));
  if(['fire','soulFlame','candle','arcane'].includes(anchor.kind))lamps.push(Object.assign(new T.Vector3(anchor.x,anchor.y,anchor.z),{color:anchor.color}));
  if(anchor.kind==='fire'){emit('watch_fire',anchor,Math.max(.5,Math.min(2,anchor.intensity*.35)));emit('chimney_embers',anchor,.7);}
  if(anchor.kind==='dust')emit('cave_dust',anchor,2.4);
  if(anchor.kind==='water')emit('mist_bank',anchor,2);
 }
 const magic=createCellarMagic(root,[...landmark.anchors,...descent.anchors]);
 for(const side of [-1,1])emit('woodland_shafts',{x:L.landmark.x+side*14,y:L.landmark.y+2,z:L.landmark.z-10},Math.min(14,L.theme.ceiling/3.5));
 const key=new T.DirectionalLight(0xbdcde4,1.8);key.position.set(L.landmark.x-20,L.landmark.y+L.theme.ceiling*.85,L.landmark.z-15);key.target.position.set(L.landmark.x,L.landmark.y,L.landmark.z);root.add(key,key.target);
 const update=built.update.bind(built),dispose=built.dispose.bind(built);
 if(L.raid){const boss=buildSepulcher();boss.group.position.set(L.raid.x,0,L.raid.z);root.add(boss.group);built.raid={...L.raid,model:boss};}
 built.update=(dt,pos)=>{if(typeof dt!=='number'){pos=dt;dt=.016;}update(dt,pos);streaming?.update(dt,pos);time+=Math.min(.1,dt);roomArt.update(time);landmark.update(time);entry?.update(time,pos);descent.update(time,pos);magic.update(time,pos);if(pos){const nearest=lamps.map(p=>({p,d:Math.hypot(p.x-pos.x,p.z-pos.z)})).sort((a,b)=>a.d-b.d);lights.forEach((l,i)=>{const lamp=nearest[i%nearest.length].p;l.position.copy(lamp);l.color.set(lamp.color||0xffb96c);l.intensity=35+Math.sin(time*4+i)*4;});}
  effects.update(time,pos);
  for(const r of rings)r.material.emissiveIntensity=.8+Math.sin(time*.7)*.2;
 };
 built.dispose=()=>{if(disposed)return;disposed=true;streaming?.dispose();effects.dispose();magic.dispose();entry?.dispose();descent.dispose();landmark.dispose();built.raid?.model.dispose();dispose();};
 built.cellarStats={depth:L.level,rooms:L.rooms.length,ceiling:L.theme.ceiling,art:roomArt.stats,blender:landmark.stats};return built;
}
