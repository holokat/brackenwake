import assert from 'node:assert/strict';
import {updateSurfaceForage} from './world_life.js';
const calls=[],forage={group:{visible:true},update(...args){calls.push(['forage',...args]);}},studio={update(...args){calls.push(['studio',...args]);}},runtime={inDungeon:false},pos={x:1,z:2};
updateSurfaceForage(runtime,forage,studio,pos,.02,50);assert(forage.group.visible);assert.equal(calls.length,2);
runtime.inDungeon=true;updateSurfaceForage(runtime,forage,studio,pos,.02,60);assert.equal(forage.group.visible,false);assert.equal(calls.length,2,'Surface forage must not stream or draw underground');
runtime.inDungeon=false;updateSurfaceForage(runtime,forage,studio,pos,.02,70);assert(forage.group.visible);assert.equal(calls.length,4,'Forage resumes on returning to the surface');
console.log('SURFACE_FORAGE_DUNGEON_VISIBILITY_VERIFIED');
