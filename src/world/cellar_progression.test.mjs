import assert from 'node:assert/strict';
import * as T from 'three';
import {createOldCellars} from './old_cellars.js';
import {cellarFloorAt} from './cellar_floor.js';
import {worldOf,walkable} from './dungeon_gen.js';
import {furnishOldCellars} from './old_cellars_scene.js';
import {createDungeonScene,setDungeonCanvasFactory,stubCanvasFactory} from './dungeon.js';
import {dungeonPhysical} from './collision/dungeon.js';
import {stepPlayer} from '../game/player.js';
import {CELLAR_BOSS_BY_DEPTH} from '../mmo/cellar_bosses.js';
setDungeonCanvasFactory(stubCanvasFactory);
// Positive control: the real controller must reject a discontinuous uphill
// cell edge. A grid-only flood fill would falsely accept this walkable route.
const control={x:0,y:0,z:0,vx:0,vz:0,vy:0,yaw:0,phase:0,t:0,airborne:false};
for(let i=0;i<120;i++)stepPlayer(control,1/60,{z:1},(x,z)=>z>=1?1:0);
assert(control.z<1&&control.blocked,'Movement oracle failed to detect an impassable floor step');
let frames=0,rooms=0,bosses=0;
for(let level=1;level<=8;level++){
 const L=createOldCellars(22,{id:'oldcellars'},level),built=furnishOldCellars(createDungeonScene(T,L),L),index=dungeonPhysical(L,built);
 const h=(x,z)=>cellarFloorAt(L,x,z);h.supportAt=(x,z,y)=>index.supportAt(x,z,y);h.canMove=(a,b)=>index.canMove(a,b,.32,1.75);h.ceilingAt=(x,z,y)=>index.ceilingAt(x,z,y);
 const state=(p)=>({...p,y:h(p.x,p.z),vx:0,vz:0,vy:0,yaw:0,phase:0,t:0,airborne:false});
 function travel(s,p,max=120){
  for(let i=0;i<max;i++){
   const dx=p.x-s.x,dz=p.z-s.z,d=Math.hypot(dx,dz);if(d<.12){s.vx=0;s.vz=0;return true;}
   // Same controller as the game. Ease speed near grid turns to prevent corner cutting.
   stepPlayer(s,1/60,{z:Math.min(1,d*2),yaw:Math.atan2(dx,dz)},h);frames++;
  }
  return false;
 }
 // Only accept graph edges the actual controller can traverse in both directions.
 const start=L.entrance.gz*L.w+L.entrance.gx,seen=new Set([start]),queue=[start],states=new Map([[start,state(worldOf(L,L.entrance.gx,L.entrance.gz))]]);
 const p=i=>worldOf(L,i%L.w,Math.floor(i/L.w));
 for(let k=0;k<queue.length;k++){
  const i=queue[k],x=i%L.w,z=Math.floor(i/L.w);
  for(const [dx,dz]of[[1,0],[-1,0],[0,1],[0,-1]]){
   const n=(z+dz)*L.w+x+dx;if(seen.has(n)||!walkable(L,x+dx,z+dz))continue;
   const a=p(i),b=p(n),sa={...states.get(i)};
   // Carry the reached elevation forward. Resetting it to bare terrain would
   // incorrectly place the actor beneath level 6's crossing bridge.
   if(!travel(sa,b,70)||!travel({...sa},a,70))continue;
   seen.add(n);states.set(n,sa);queue.push(n);
  }
 }
 for(const room of L.rooms){assert([...seen].some(i=>Math.hypot(i%L.w-room.cx,Math.floor(i/L.w)-room.cz)<6),`Controller cannot reach floor ${level} room ${room.id}`);rooms++;}
 if(L.stair)assert(seen.has(L.stair.gz*L.w+L.stair.gx),`Controller cannot descend floor ${level}`);
 const expected=CELLAR_BOSS_BY_DEPTH[level];if(expected){const spawns=L.authoredSpawns.filter(s=>s.id===expected.id);assert.equal(spawns.length,1);const spawn=spawns[0],pos=worldOf(L,spawn.gx,spawn.gz);assert.deepEqual(pos,{x:5,z:-153});assert.equal(h(pos.x,pos.z),0);bosses++;}
 built.dispose();
}
console.log('CELLAR_CONTROLLER_PROGRESSION_VERIFIED',JSON.stringify({floors:8,rooms,bosses,frames}));
