import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {SPACES} from '../spaces/index.js';
import {ENCOUNTERS,authorEncounters} from './encounters.js';
import {auditSpaces} from '../plans/plan_schema.js';
import {MONSTERS} from '../monsters.js';
import {createWorldField} from '../../world/field.js';
import {createTerrainEdits} from '../../world/terrain_edits.js';
import {spaceSitesNear} from '../../world/sites.js';
import {routeDistance} from './routes.js';
import {greenwoldCollision} from '../../../scripts/studio/audit-collision.mjs';
import {createMonsters,ALIVE_CAP} from '../../game/monsters.js';
import {spawnMonster,playerActor} from '../../game/actor.js';
import {planCharacter} from '../../game/creation.js';
import {createCombat} from '../../game/combat.js';
import {createLootDrops} from '../../game/loot_drops.js';

const field=createWorldField(20260904),edits=createTerrainEdits();
edits.load(JSON.parse(readFileSync(new URL('../../../public/terrain/greenwold.json',import.meta.url))));field.setTerrainEdits(edits);
const draft=structuredClone(SPACES),counts=authorEncounters(draft);auditSpaces(draft);
assert.deepEqual(draft,SPACES,'rerunning the encounter author preserves the saved layout');
assert.ok(counts.day>=190&&counts.groups>=50,'the zone needs substantial authored daytime encounters');
const physical=greenwoldCollision((x,z)=>field.heightAt(x,z));
const towns=Object.values(SPACES).filter(s=>s.safeRadius),slots=new Set();
for(const e of ENCOUNTERS)for(const [i,p]of e.slots.entries()){
  const key=e.id+':'+i;assert.ok(!slots.has(key));slots.add(key);
  assert.ok(MONSTERS[p.id]?.tier>0,key+': a fightable enemy');
  assert.ok(towns.every(s=>Math.hypot(p.x-s.at.x,p.z-s.at.z)>=s.safeRadius+22),key+': village and wandering buffer');
  const sample=field.sampleAt(p.x,p.z);
  assert.equal(sample.water,false,key+': dry ground');
  assert.equal(physical.at(p.x,sample.h,p.z,.7,2),null,key+': clear of solid bodies');
  assert.ok(routeDistance(p.x,p.z)>=8,key+': open main lane');
  for(const[x,z]of[[1,0],[-1,0],[0,1],[0,-1]])assert.ok(Math.abs(field.heightAt(p.x+x,p.z+z)-sample.h)<=.5,key+': usable fighting slope');
}
const runtime={field,heightAt:(x,z)=>field.heightAt(x,z),sitesNear:(x,z,r)=>spaceSitesNear(x,z,r,field),physical};
const character=planCharacter({opening:'warrior',name:'Encounter audit'}).character,player=playerActor(character);
let streamedDay=0,streamedNight=0,maxLocal=0;
for(const e of ENCOUNTERS){
  const scene=new THREE.Scene(),monsters=createMonsters(scene,runtime,{actorFactory:(id,o)=>spawnMonster(id,o.pos),rng:()=>.5});
  player.pos={...e.slots[0],y:field.heightAt(e.slots[0].x,e.slots[0].z)};
  monsters.update(0,0,player,false);
  const belongs=m=>m.rec.groupKey==='s:'+e.space+':encounter:'+e.id;
  const day=monsters.all().filter(belongs),keys=day.map(m=>m.key);
  assert.equal(day.length,e.slots.filter(s=>!s.night).length,e.id+': daytime bodies stream through real runtime');
  for(const m of day){assert.ok(m.actor.health>0);assert.ok(m.model.group.parent===monsters.group);assert.ok(new THREE.Box3().setFromObject(m.model.group).getSize(new THREE.Vector3()).length()>.2);}
  monsters.update(0,1000,player,true);
  const night=monsters.all().filter(belongs);assert.equal(night.length,e.slots.length,e.id+': night reinforcements');
  assert.ok(keys.every(k=>night.some(m=>m.key===k)),e.id+': daytime identity survives dusk');
  maxLocal=Math.max(maxLocal,monsters.count);assert.ok(monsters.count<=ALIVE_CAP);
  monsters.update(0,2000,player,false);
  // Drop targets from the zero-time proximity probe, just as a finished fight does.
  for(const m of monsters.all())m.actor.ai.target=null;
  monsters.update(0,3000,player,false);
  assert.deepEqual(monsters.all().filter(belongs).map(m=>m.key).sort(),keys.sort(),e.id+': night-only bodies leave at dawn');
  streamedDay+=day.length;streamedNight+=night.length;monsters.dispose();
}

// A real starter fight, loot, saved death, dawn/dusk and delayed respawn.
const scene=new THREE.Scene(),combat=createCombat({rng:()=>0}),loot=createLootDrops(scene,{}),deadUntil=[];
let wall=1_000_000;
const monsters=createMonsters(scene,runtime,{actorFactory:(id,o)=>spawnMonster(id,o.pos),combat,loot,deadUntil,clock:()=>wall,rng:()=>.5});
const first=ENCOUNTERS[0].slots[0];player.pos={x:first.x+1,y:field.heightAt(first.x+1,first.z),z:first.z};player.health=player.maxHealth;
monsters.update(0,0,player,false);const victim=monsters.all().find(m=>m.rec.key.endsWith('wood-yard-vermin:0'));assert.ok(victim);
player.lastSwingAt=-Infinity;
const hp=victim.actor.health,hit=monsters.swingAt(player,victim.actor,{now:0});assert.equal(hit.queued,true,hit.reason);combat.update(.3,300);
assert.ok(victim.actor.health<hp,'the new authored body receives real starter weapon damage');
combat.kill(victim.actor,player);assert.ok(deadUntil.some(d=>d.key===victim.key));assert.equal(loot.count,1);
monsters.update(0,1000,player,true);assert.ok(!monsters.all().some(m=>m.key===victim.key),'dusk does not revive a cleared slot');
wall=deadUntil.find(d=>d.key===victim.key).until+1;monsters.update(0,2000,player,false);
assert.ok(!monsters.all().some(m=>m.key===victim.key),'no respawn while the player stands beside it');
player.pos.x+=70;monsters.update(0,3000,player,false);assert.ok(monsters.all().some(m=>m.key===victim.key),'expired slot returns after leaving');
monsters.dispose();loot.dispose();
console.log(JSON.stringify({groups:counts.groups,streamedDay,streamedNight,maxLocal,collisionBodies:physical.bodies.length,fightLootAndRespawn:true}));
