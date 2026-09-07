import {STRONGHOLDS,strongholdRemaining,strongholdSpace} from '../mmo/greenwold/strongholds.js';
export const clearedStronghold=id=>'encounter-clear:'+id;
export const strongholdReward=id=>'encounter-reward:'+id;
export function strongholdChestAccess(chest,character){
  if(!chest?.encounter)return null;
  const hub=STRONGHOLDS.find(h=>h.id===chest.encounter);
  if(!hub)return 'These supplies are unavailable.';
  if(character.opened?.includes(clearedStronghold(hub.id)))return null;
  const remaining=strongholdRemaining(hub,character);
  return remaining?`${remaining} defenders still hold these supplies. Clear ${hub.name.toLowerCase()} first.`:null;
}
export function createStrongholdEncounters({character,combat,hud,root,state}){
  const announced=new Set();let current=null,lastText='',elapsed=0;
  const panel=root?.ownerDocument?.createElement('div');
  if(panel){
    panel.className='bw-stronghold-objective';panel.setAttribute('role','status');panel.setAttribute('aria-live','polite');
    Object.assign(panel.style,{position:'absolute',top:'90px',left:'50%',transform:'translateX(-50%)',padding:'12px 18px',background:'rgba(24,25,22,.9)',color:'#eee4d0',borderRadius:'8px',boxShadow:'0 5px 20px #0004',font:'13px/1.5 system-ui',minWidth:'250px',maxWidth:'340px',textAlign:'center',pointerEvents:'none',display:'none'});root.appendChild(panel);
  }
  function complete(h){
    const key=clearedStronghold(h.id);if(character.opened?.includes(key)||strongholdRemaining(h,character))return;
    (character.opened||=[]).push(key);state?.touch?.('opened');
    hud?.log?.(`${h.name} is cleared. The supply chest is unlocked.`,'good');hud?.zone?.(h.name,'Supplies unlocked');
  }
  const off=combat?.onDeath?.(()=>{
    // Combat's monster layer has already written the persistent dead slot.
    for(const h of STRONGHOLDS)if(character.deadUntil?.some(d=>d.key.startsWith('s:'+strongholdSpace(h.id)+':plan:')))complete(h);
  });
  return{
    update(dt,pos,{hidden=false,inDungeon=false,sculpt=true}={}){
      if(inDungeon||!sculpt){current=null;if(panel)panel.style.display='none';return;}
      elapsed-=dt;if(elapsed>0){if(panel)panel.style.display=hidden?'none':current?'block':'none';return;}elapsed=.3;
      const candidates=STRONGHOLDS.map(h=>({h,d:Math.hypot(pos.x-h.at.x,pos.z-h.at.z)})).filter(p=>p.d<76).sort((a,b)=>a.d-b.d);
      current=candidates[0]?.h||null;
      if(!current){if(panel)panel.style.display='none';return;}
      complete(current);
      if(!announced.has(current.id)){
        announced.add(current.id);hud?.log?.(`${current.name}: defeat the defenders and their leader to unlock the supplies.`);
      }
      const remaining=strongholdRemaining(current,character),claimed=character.opened?.includes(strongholdReward(current.id)),cleared=character.opened?.includes(clearedStronghold(current.id));
      const detail=claimed?'Supplies taken':cleared?'Supply chest unlocked':`${remaining} defenders remaining · Defeat their leader`;
      const text=current.name+'\n'+detail;
      if(panel){if(lastText!==text){panel.replaceChildren();const title=panel.ownerDocument.createElement('div');title.textContent=current.name;Object.assign(title.style,{fontSize:'16px',fontWeight:'600',marginBottom:'5px'});const body=panel.ownerDocument.createElement('div');body.textContent=detail;body.style.color='#cbbda4';panel.append(title,body);lastText=text;}panel.style.display=hidden?'none':'block';}
    },
    get current(){return current;},dispose(){off?.();panel?.remove();},
  };
}
