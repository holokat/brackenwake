import assert from 'node:assert/strict';
import * as T from 'three';
import {CELLAR_BOSSES} from '../mmo/cellar_bosses.js';
import {MONSTERS,aggroRadius} from '../mmo/monsters.js';
import {createCellarBossState,stepCellarBoss,cellarShapeContains} from './cellar_boss_combat.js';
import {createCellarBossRuntime} from './monsters/cellar_boss_runtime.js';
import {stepToward,speedOf} from './monsters.js';
import {createCellarBossTelegraphs} from './monsters/cellar_boss_telegraphs.js';
for(const def of CELLAR_BOSSES){
 const home={x:0,y:0,z:0}, actor={health:100,maxHealth:100,pos:{...home},ai:{home},status:{}};
 const target={health:100,pos:{x:0,y:0,z:32}};
 const state=createCellarBossState(def.id);
 assert(stepCellarBoss(state,{now:0,actor,target}).some(e=>e.type==='engage'),`${def.id} engages at doorway`);
 const marks=stepCellarBoss(state,{now:650,actor,target}).filter(e=>e.type==='telegraph').map(e=>e.mark);
 assert(marks.some(m=>cellarShapeContains(m.shape,target.pos)),`${def.id} answers ranged players with a reachable attack`);
 const visual=createCellarBossTelegraphs(new T.Group());
 for(const mark of marks){visual.add(mark);visual.update(mark.impactAt-1);visual.remove(mark,true,mark.impactAt);visual.update(mark.impactAt+200);}
 visual.clear();assert.equal(visual.size,0);
 const far=createCellarBossState(def.id);target.pos.z=43;actor.health=90;
 assert(stepCellarBoss(far,{now:0,actor,target}).some(e=>e.type==='engage'),'damage provokes beyond passive aggro');
 target.pos.y=10;
 assert.equal(stepCellarBoss(createCellarBossState(def.id),{now:0,actor,target}).length,0,'another floor cannot engage');
}
const def=CELLAR_BOSSES[0],home={x:0,y:0,z:0},actor={health:100,maxHealth:100,run:5.4,pos:{...home},ai:{home},status:{}};
const mon={id:def.id,key:'morva',rec:{},actor,row:MONSTERS[def.id],model:{group:new T.Group(),setAnim(){},update(){}},phase:0};
const live=new Map([[mon.key,mon]]),shots=[];
const runtime=createCellarBossRuntime({group:new T.Group(),combat:{queueSpell(a,s,t){shots.push(s.id);return{queued:true};}},say(){},spawn(){},despawn(){},live,heightAt:()=>0,clampXZ:(x,z)=>[x,z],stats:{marks:0,phases:0},cap:32,stepToward,speedOf});
const target={health:100,pos:{x:0,y:0,z:32}};
for(let now=0;now<10000;now+=50)runtime.step(mon,.05,now,target);
assert(actor.pos.z>1,'boss follows between attacks');assert(shots.length>0,'standing at the doorway causes real queued damage');
actor.status.root={until:20000};const rooted={...actor.pos};
for(let now=10000;now<14000;now+=50)runtime.step(mon,.05,now,target);
assert.deepEqual(actor.pos,rooted,'pursuit respects crowd control');
runtime.clear(mon);
assert(aggroRadius(MONSTERS.oramBlackhand)>=30,'Oram also engages before maximum ranged attacks');
console.log('Boss pressure: six doorway attacks, six damage pulls, floor separation, pursuit, root and Oram range passed.');
