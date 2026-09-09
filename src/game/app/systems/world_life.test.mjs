import assert from 'node:assert/strict';
import * as THREE from 'three';
import {updateSurfaceForage} from './world_life.js';
import {createForageField} from '../../../world/forage.js';
import {createStudioForage} from '../../studio/forage.js';
import {createOldCellars} from '../../../world/old_cellars.js';
import {worldOf} from '../../../world/dungeon_gen.js';
const calls=[],forage={group:{visible:true},update(...args){calls.push(['forage',...args]);}},studio={update(...args){calls.push(['studio',...args]);}},runtime={inDungeon:false},pos={x:1,z:2};
updateSurfaceForage(runtime,forage,studio,pos,.02,50);assert(forage.group.visible);assert.equal(calls.length,2);
runtime.inDungeon=true;updateSurfaceForage(runtime,forage,studio,pos,.02,60);assert.equal(forage.group.visible,false);assert.equal(calls.length,2,'Surface forage must not stream or draw underground');
runtime.inDungeon=false;updateSurfaceForage(runtime,forage,studio,pos,.02,70);assert(forage.group.visible);assert.equal(calls.length,4,'Forage resumes on returning to the surface');
// Traverse the real rendering hierarchy, including the detailed replacement
// plants, at every authored room instead of checking a mock visibility flag.
const scene=new THREE.Scene(),field=createForageField(scene,{field:{seed:4,sampleAt:()=>({biome:'meadow',moist:.3}),heightAt:()=>18},season:'Autumn',treesFor:()=>[]});
field.update(-2,35,'Autumn',0);
const detail=createStudioForage(field);detail.update(1,field.records()[0]);
const visibleMeshes=()=>{let n=0;field.group.traverseVisible(o=>{if(o.isMesh)n++;});return n;};
assert(visibleMeshes()>0&&detail.count>0,'Positive control: actual surface plants render above ground');
const records=field.count;let rooms=0;
runtime.inDungeon=true;
for(let depth=1;depth<=8;depth++){
 const L=createOldCellars(22,{id:'oldcellars'},depth);
 for(const room of L.rooms){
  updateSurfaceForage(runtime,field,detail,worldOf(L,room.cx,room.cz),.02,100+rooms);
  assert.equal(visibleMeshes(),0,`Surface vegetation leaked into floor ${depth}, room ${room.id}`);
  assert.equal(field.count,records,'Underground travel must not stream a new surface forage field');rooms++;
 }
}
assert.equal(rooms,76);
runtime.inDungeon=false;updateSurfaceForage(runtime,field,detail,{x:-2,z:35},.02,200);
assert(field.group.visible,'Surface forage is restored on returning above ground');
detail.dispose();field.dispose();
console.log('SURFACE_FORAGE_ROOM_HIERARCHY_VERIFIED',JSON.stringify({floors:8,rooms}));
console.log('SURFACE_FORAGE_DUNGEON_VISIBILITY_VERIFIED');
