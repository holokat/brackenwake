import {grantExperience, progressionView} from '../mmo/talents.js';

export function defeatExperience(mon) {
  if(!mon || mon.friendly || mon.actor?.summoned || String(mon.key).startsWith('dev:') || mon.rec?.noLoot || mon.actor?.training || mon.training || mon.id==='trainingDummy') return 0;
  const row=mon.row || {};
  const health=Number(mon.actor?.maxHealth || row.health || 0);
  if(!Number.isFinite(health) || health<=0)return 0;
  const tier=Math.max(0,Math.min(8,Number(row.tier)||0));
  return Math.round((12+tier*12+Math.min(health,2000)*0.12)*(row.boss?2:1));
}

/** Uses actual death callbacks, never damage totals or a frame poll. */
export function createCharacterLevels({character,actor,state,hud,audio}={}) {
  const rewarded=new WeakSet();
  function award(amount) {
    const result=grantExperience(character,amount);
    if(!result.gained)return result;
    state?.touch?.('advancement');
    hud?.gain?.(`+${result.gained} XP`,'gain');
    if(result.levels){
      const points=progressionView(character).points;
      hud?.unlock?.({id:'level-up',name:`Level ${result.level}`,key:`${points} talent ${points===1?'point':'points'} available · Open Skill trees (P)`});
      hud?.log?.(`You reached level ${result.level}. Spend your talent points in Skill trees (P).`,'good');
      audio?.play?.('grandmaster');
    }
    return result;
  }
  function defeat(mon,killer) {
    // A friendly summon is credited only through its explicit caster reference.
    // Its AI target changes while fighting and is never evidence of ownership.
    const ownedSummon=!!killer && killer.summoned===true && killer.faction==='player' && killer.summonOwner===actor;
    if((killer!==actor && !ownedSummon) || !mon?.actor || rewarded.has(mon.actor))return {gained:0,levels:0};
    rewarded.add(mon.actor);
    return award(defeatExperience(mon));
  }
  return {award,defeat,get view(){return progressionView(character);}};
}

export function createLevelBadge(hud,character,state,open) {
  const host=hud?.el?.querySelector?.('#bw-pools');
  if(!host || typeof document==='undefined')return {dispose(){}};
  if(!document.getElementById('bw-level-style')){
    const style=document.createElement('style');style.id='bw-level-style';
    style.textContent=`#bw-level{position:relative;min-height:40px;padding:5px 8px 8px;display:flex;align-items:center;justify-content:space-between;gap:8px;color:#eee3c3;background:rgba(19,23,21,.94);border:1px solid #867041;border-radius:4px;font:12px Georgia,serif;cursor:pointer;overflow:hidden}#bw-level:hover,#bw-level:focus-visible{border-color:#e4be62;outline:1px solid #e4be62}#bw-level .xp-fill{position:absolute;left:0;bottom:0;height:3px;background:linear-gradient(90deg,#7c629b,#d2b5f3);transition:width .25s ease}#bw-level .points{color:#e4be62}#bw-auras{top:170px}@media(prefers-reduced-motion:reduce){#bw-level .xp-fill{transition:none}}`;
    document.head.appendChild(style);
  }
  const button=document.createElement('button');button.id='bw-level';button.type='button';
  const label=document.createElement('span'),points=document.createElement('span'),fill=document.createElement('span');
  points.className='points';fill.className='xp-fill';button.append(label,points,fill);host.appendChild(button);
  button.addEventListener('pointerdown',e=>e.stopPropagation());
  button.addEventListener('click',open);
  function refresh(){const p=progressionView(character);label.textContent=`Level ${p.level}`;points.textContent=p.points?`${p.points} talent ${p.points===1?'point':'points'}`:'Skill trees';fill.style.width=`${p.fraction*100}%`;button.title=p.needed?`${p.xp} / ${p.needed} XP · Skill trees (P)`:'Maximum level · Skill trees (P)';button.setAttribute('aria-label',button.title);}
  refresh();const off=state?.onChange?.(refresh);
  return {refresh,dispose(){off?.();button.remove();}};
}
