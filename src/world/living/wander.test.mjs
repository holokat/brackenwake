import assert from 'node:assert/strict';
import {createWander} from './wander.js';
import {createCollisionIndex} from '../collision/shapes.js';
const field={sampleAt:(x,z)=>({h:0,water:z>3}),heightAt:()=>0},physical=createCollisionIndex([{kind:'box',x:2,z:0,y:0,w:.2,d:12,h:4,c:1,s:0}]);
const w=createWander({id:'sheep-at-fold',x:0,z:0,range:7,attention:2});
for(let i=0;i<3600;i++){w.update(1/60,{field,physical,observer:{x:30,z:30}});assert.ok(w.pos.z<=3);assert.ok(w.pos.x<1.6);assert.ok(Math.hypot(w.pos.x,w.pos.z)<=7);}
assert.ok(w.distance>3,'the animal covers ground within a minute');
const before={...w.pos};for(let i=0;i<300;i++)w.update(1/60,{field,physical,observer:before});assert.deepEqual(w.pos,before,'nearby observers hold the animal still');
for(let i=0;i<300;i++)w.update(1/60,{field,physical,held:true});assert.deepEqual(w.pos,before,'conversation holds position');
console.log('Wandering: '+w.distance.toFixed(2)+' m in a minute, dry ground, solid wall, home range and observer hold passed.');
