import {planCharacter}from'../../src/game/creation.js';
import {playerActor,spawnMonster}from'../../src/game/actor.js';
import {resolveMelee,swingSeconds}from'../../src/mmo/combat_rules.js';
import {MONSTERS}from'../../src/mmo/monsters.js';
const roll=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
const planned=planCharacter({opening:'warrior',name:'Pace review'});if(!planned.ok)throw Error(planned.errors.join(';'));
const rows=[];
for(const id of ['giantRat','skeleton','wolf','boar','bandit'])for(const mode of ['original','brisk','brisk-hp150']){
 let seconds=0,hits=0,swings=0;
 for(let i=1;i<=1000;i++){
  const player=playerActor(structuredClone(planned.character)),enemy=spawnMonster(id),rng=roll(i);
  if(mode==='original')player.kind='unpaced';enemy.health=mode==='brisk-hp150'?enemy.health:MONSTERS[id].baseHp;
  let count=0,landed=0;
  while(enemy.health>0&&count<200){const result=resolveMelee({attacker:player,defender:enemy,now:count*1000,rng});enemy.health-=result.damage;if(result.damage>0)landed++;count++;}
  seconds+=.3+(count-1)*swingSeconds(player);hits+=landed;swings+=count;
 }
 rows.push({monster:id,mode,fights:1000,seconds:+(seconds/1000).toFixed(2),hits:+(hits/1000).toFixed(2),swings:+(swings/1000).toFixed(2)});
}
console.log(JSON.stringify({method:'Seeded player-only melee timing against full-health targets; excludes enemy retaliation, movement, stamina depletion and spells.',rows},null,2));
