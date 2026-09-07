import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {SPACES} from '../spaces/index.js';
import {STRONGHOLDS,strongholdKey,strongholdRemaining} from './strongholds.js';
import {strongholdPaths} from '../../../scripts/greenwold/strongholds.mjs';
import {sampleRoute} from './routes.js';
import {createWorldField} from '../../world/field.js';
import {createTerrainEdits} from '../../world/terrain_edits.js';
import {spaceSitesNear,spaceSiteRow} from '../../world/sites.js';
import {greenwoldCollision} from '../../../scripts/studio/audit-collision.mjs';
import {createMonsters} from '../../game/monsters.js';
import {spawnMonster,playerActor} from '../../game/actor.js';
import {planCharacter} from '../../game/creation.js';
import {createCombat} from '../../game/combat.js';
import {createInventory} from '../../game/inventory.js';
import {createChests} from '../../game/chests.js';
import {createStrongholdEncounters,clearedStronghold} from '../../game/stronghold_encounters.js';
import {authoredPick} from './interactions.js';
import {isDestination,placeLabel} from './navigation.js';

const field=createWorldField(20260904),edits=createTerrainEdits();
edits.load(JSON.parse(readFileSync('public/terrain/greenwold.json')));field.setTerrainEdits(edits);
const physical=greenwoldCollision((x,z)=>field.heightAt(x,z));
const runtime={field,physical,heightAt:(x,z)=>field.heightAt(x,z),sitesNear:(x,z,r)=>spaceSitesNear(x,z,r,field)};
const failures=[],results=[];
function clear(x,z,label){
  const s=field.sampleAt(x,z),body=physical.at(x,s.h,z,.5,1.8);
  if(s.water||body)failures.push({label,x,z,water:s.water,solid:body?.model});
  for(const[dx,dz]of[[1,0],[-1,0],[0,1],[0,-1]])if(Math.abs(field.heightAt(x+dx,z+dz)-s.h)>.5){failures.push({label,x,z,slope:true});break;}
}
for(const h of STRONGHOLDS){
  const space=SPACES['greenwold_'+h.id];assert.ok(isDestination(space));assert.ok(h.spawns.length>=16);
  for(const [i,s]of h.spawns.entries())clear(h.at.x+s.x,h.at.z+s.z,h.id+':'+i);
  for(const p of sampleRoute({points:strongholdPaths(h)},1))clear(p.x,p.z,h.id+':approach');
  const character=planCharacter({opening:'warrior',name:'Camp audit'}).character;
  character.deadUntil=[];character.opened=[];
  const player=playerActor(character),scene=new THREE.Scene(),combat=createCombat({rng:()=>0}),said=[];
  const monsters=createMonsters(scene,runtime,{actorFactory:(id,o)=>spawnMonster(id,o.pos),combat,deadUntil:character.deadUntil,clock:()=>1e6,rng:()=>.5});
  const director=createStrongholdEncounters({character,combat,hud:{log:t=>said.push(t)}});
  player.pos={x:h.at.x,y:field.heightAt(h.at.x,h.at.z+36),z:h.at.z+36};
  monsters.update(0,0,player,false);
  const defenders=monsters.all().filter(m=>m.key.startsWith('s:'+space.id+':plan:'));
  assert.equal(defenders.length,h.spawns.length,h.id+': real runtime populates entire camp');
  const boss=defenders.find(m=>m.rec.elite);assert.ok(boss&&boss.actor.name===h.spawns.find(s=>s.elite).title);
  const sack=space.pieces.find(p=>p.model==='loot_sack'),point={x:space.at.x+sack.x,z:space.at.z+sack.z};
  clear(point.x,point.z+2,h.id+':reward');
  const chest=authoredPick(spaceSiteRow(space,field),'loot_sack',point).chest;
  const inventory=createInventory({character,actor:player}),chests=createChests({character,inventory,actor:player,rng:()=>.5});
  const gold=character.gold;
  assert.equal(chests.open(chest,{at:{x:point.x,z:point.z+2}}).reason,'guarded');assert.equal(character.gold,gold);
  // Killing a leader alone never opens the chest. Every squad has to be beaten.
  combat.kill(boss.actor,player);assert.equal(chests.open(chest,{at:{x:point.x,z:point.z+2}}).reason,'guarded');
  for(const m of defenders)if(m!==boss)combat.kill(m.actor,player);
  assert.equal(strongholdRemaining(h,character),0);assert.ok(character.opened.includes(clearedStronghold(h.id)));
  assert.equal(character.deadUntil.filter(d=>defenders.some(m=>m.key===d.key)).length,h.spawns.length);
  assert.ok(h.spawns.every((s,i)=>character.deadUntil.some(d=>d.key===strongholdKey(h,i))));
  assert.equal(said.filter(s=>s.includes('is cleared')).length,1);
  const result=chests.open(chest,{at:{x:point.x,z:point.z+2}});assert.equal(result.ok,true);assert.ok(result.took.length>0&&character.gold>gold);
  assert.equal(chests.open(chest,{at:{x:point.x,z:point.z+2}}).reason,'already');
  const reloaded=JSON.parse(JSON.stringify(character));
  assert.equal(createChests({character:reloaded}).open(chest,{at:{x:point.x,z:point.z+2}}).reason,'already');
  results.push({id:h.id,defenders:defenders.length,leader:boss.name,gold:result.gold,items:result.took.length});
  director.dispose();monsters.dispose();
}
// A reused arch at a stronghold is architecture, not a duplicate cellar entry.
assert.equal(authoredPick(spaceSiteRow(SPACES.greenwold_occult_tower,field),'cellar_arch',{x:662,z:-339}),null);
assert.equal(isDestination({id:'greenwold_habitat_fern_hollow'}),false);
assert.equal(isDestination({id:'tile_5_-2',name:'Scenery'}),false);
assert.equal(placeLabel({field,zoneNow:()=>({name:'Beech Hangar'}),sitesNear:()=>{throw Error('Scenery must not name the location');}},{x:0,z:0},'Meadow'),'Beech Hangar');
if(failures.length)console.error(JSON.stringify(failures));
assert.equal(failures.length,0,'every defender and entrance needs usable ground and physical clearance');
console.log(JSON.stringify({strongholds:results,terrainAndCollision:true,guardedRewardsAndReload:true}));
