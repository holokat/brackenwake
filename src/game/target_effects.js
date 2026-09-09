import {ABILITIES_BY_ID} from '../mmo/abilities.js';

const labels={slow:'Slowed',root:'Rooted',stun:'Stunned',sleep:'Asleep',fear:'Feared',pacify:'Pacified',silence:'Silenced',poison:'Poisoned',bleed:'Bleeding'};
const abilityName=id=>ABILITIES_BY_ID[id]?.name;

/** Controls use milliseconds; marks, damage over time and buffs use seconds. */
export function targetEffectLabels(target,nowS){
 if(!target||!(target.health>0)||target.dead||!Number.isFinite(nowS))return [];
 const effects=new Map();
 const add=(key,name,until)=>{
  if(!Number.isFinite(until)||until<=nowS)return;
  const previous=effects.get(key);
  if(!previous||until>previous.until)effects.set(key,{name,until});
 };
 for(const [kind,state] of Object.entries(target.status||{})){
  if(!state||!labels[kind])continue;
  const until=Number.isFinite(state.untilS)?state.untilS:state.until/1000;
  const fraction=Number.isFinite(state.factor)?state.factor:.3;
  const name=kind==='slow'?`Slowed ${Math.round(Math.max(0,Math.min(.9,fraction))*100)}%`:labels[kind];
  add(`control:${kind}`,name,until);
 }
 for(const dot of target.dots||[]){
  const name=dot.type==='fire'?'Burning':dot.type==='poison'?'Poisoned':dot.type==='physical'?'Bleeding':abilityName(dot.abilityId)||'Damage over time';
  add(`dot:${dot.type}`,name,dot.until);
 }
 for(const buff of target.buffs||[])if(buff.kind==='debuff')add(`buff:${buff.abilityId||buff.id}`,buff.name||abilityName(buff.abilityId)||'Weakened',buff.until);
 return [...effects.values()].map(e=>`${e.name} ${Math.ceil(e.until-nowS)} s`);
}
