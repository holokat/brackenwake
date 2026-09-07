import { MONSTERS } from '../monsters.js';
import { placeAt } from './places.js';
import { BAG_SECONDS } from '../../game/loot_drops.js';

export const CHAPEL_TRUCE_MS=60_000;
const OFFERING='greenwold:chapel-offering';
const CONGREGATION=[[-8,4],[9,7],[-3,8]];

// One invitation and one warning. These are the combat runtime's bodies and
// the ordinary loot bags, so taking a gift and fighting use the existing paths.
export function createChapelEncounter({field,character,monsters,loot,hud,now=()=>performance.now()}) {
 const bodies=[];let until=0,hostile=false,bag=null;
 const say=t=>{hud?.log?.(t);hud?.toast?.(t);};
 const taken=()=>character.opened?.includes(OFFERING);
 function awaken(secondRing=false){
  if(hostile)return;hostile=true;until=0;
  for(const m of bodies)if(m.actor.health>0)monsters.releaseAlly(m);
  if(bag)bag.age=BAG_SECONDS;
  say(`${secondRing?'The second ring ends their patience.':'The minute is over.'} The congregation reaches for you. The causeway is behind you.`);
 }
 function ring(){
  if(!field?.sculpt)return {ok:false,reason:'outside'};
  if(bodies.length){if(!hostile){awaken(true);return {ok:true,reason:'second_ring'};}say('The bell rings again. The dead are already awake.');return {ok:true,reason:'awake'};}
  if(taken()){say('The rope moves, but nothing answers. You have already taken the chapel\'s offering.');return {ok:false,reason:'spent'};}
  const at=placeAt(field,'sunkenchapel');
  for(const[x,z]of CONGREGATION){const m=monsters.spawnAlly('skeleton',at.x+x,at.z+z);if(m)bodies.push(m);}
  if(!bodies.length)return {ok:false,reason:'unavailable'};
  bodies[2]&&(bodies[2].name=bodies[2].actor.name='The Skeleton Sexton');
  const contents=loot.rollFor(MONSTERS.skeleton,{seed:27183,character});
  const x=at.x+1,z=at.z+9;bag=loot.drop({x,y:field.heightAt(x,z)+.08,z},contents);
  if(bag)bag.age=Math.max(0,BAG_SECONDS-CHAPEL_TRUCE_MS/1000);
  (character.opened||=[]).push(OFFERING);until=now()+CHAPEL_TRUCE_MS;
  say('The dead hold out their burial goods. You have one minute. A second ring ends their patience.');
  return {ok:true,reason:'offering',bodies:bodies.length,until,bag};
 }
 return {ring,update(t=now()){if(until&&t>=until)awaken();},get bodies(){return bodies.slice();},get hostile(){return hostile;},get until(){return until;},
  dispose(){for(const m of bodies)monsters.despawn?.(m.key);bodies.length=0;if(bag)bag.age=BAG_SECONDS;}};
}
