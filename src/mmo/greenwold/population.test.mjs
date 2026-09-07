import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {SPACES} from '../spaces/index.js';
import {MONSTERS} from '../monsters.js';
import {ROUTES,sampleRoute} from './routes.js';
import {isDestination} from './navigation.js';
import {createWorldField} from '../../world/field.js';
import {createTerrainEdits} from '../../world/terrain_edits.js';
import {spaceSitesNear} from '../../world/sites.js';
import {greenwoldCollision} from '../../../scripts/studio/audit-collision.mjs';
import {createMonsters,ALIVE_CAP} from '../../game/monsters.js';
import {spawnMonster,playerActor} from '../../game/actor.js';
import {planCharacter} from '../../game/creation.js';
const field=createWorldField(20260904),edits=createTerrainEdits();edits.load(JSON.parse(readFileSync('public/terrain/greenwold.json')));field.setTerrainEdits(edits);
const physical=greenwoldCollision((x,z)=>field.heightAt(x,z)),runtime={field,physical,heightAt:(x,z)=>field.heightAt(x,z),sitesNear:(x,z,r)=>spaceSitesNear(x,z,r,field)};
const grounds=Object.values(SPACES).filter(s=>s.id.startsWith('greenwold_population_'));
const hostile=Object.values(SPACES).filter(s=>s.id.startsWith('greenwold_')).flatMap(s=>(s.spawns||[]).filter(p=>MONSTERS[p.id]?.tier>0&&!p.night).map(p=>({x:s.at.x+p.x,z:s.at.z+p.z})));
assert.ok(hostile.length>=23*50,'at least fifty times the original 23 daytime hostiles');
const player=playerActor(planCharacter({opening:'warrior',name:'Population audit'}).character),districts={};let maxLocal=0;
for(const s of grounds){
  assert.equal(isDestination(s),false,'wildlife grounds must not produce location announcements');
  assert.ok(s.spawns.length>=6,'no new one-animal encounter');
  districts[s.district]=(districts[s.district]||0)+s.spawns.length;
  for(const p of s.spawns){const x=s.at.x+p.x,z=s.at.z+p.z,sample=field.sampleAt(x,z);assert.equal(sample.water,false,s.id);assert.equal(physical.at(x,sample.h,z,.65,2),null,s.id+':'+p.slot);}
  const monsters=createMonsters(new THREE.Scene(),runtime,{actorFactory:(id,o)=>spawnMonster(id,o.pos),rng:()=>.5});
  player.pos={...s.at,y:field.heightAt(s.at.x,s.at.z)};monsters.update(0,0,player,false);
  assert.equal(monsters.all().filter(m=>m.key.startsWith('s:'+s.id+':plan:')).length,s.spawns.length,s.id+': saved population reaches live bodies');
  maxLocal=Math.max(maxLocal,monsters.count);assert.ok(monsters.count<=ALIVE_CAP);monsters.dispose();
}
const coverage=ROUTES.map(r=>{
  const distances=sampleRoute(r,10).map(p=>Math.min(...hostile.map(m=>Math.hypot(m.x-p.x,m.z-p.z))));
  return{id:r.id,within60:Math.round(100*distances.filter(d=>d<=60).length/distances.length),farthest:+Math.max(...distances).toFixed(1)};
});
console.log(JSON.stringify({grounds:grounds.length,daytimeHostiles:hostile.length,districts,maxLocal,routeCoverage:coverage}));
