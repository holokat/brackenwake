import {ABILITIES_BY_ID, weaponCheck} from '../mmo/abilities.js';
import {CLASS_TREES, CLASS_NODES} from '../mmo/class_trees.js';
import {COMMON_ABILITIES, STARTER_ABILITIES, talentRank, nodeRank, learnTalent, learnCheck, nodeMaxRank, treePoints, progressionView} from '../mmo/talents.js';
import {dragSource, attachTip} from './windows.js';
import {talentDescriptionLines, characterAbilityLines} from './talent_descriptions.js';
import {TALENT_STYLES} from './talent_styles.js';

const make=(tag,cls,text)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(text!=null)el.textContent=text;return el;};
const append=(el,...children)=>children.forEach(child=>el.appendChild(child));
const classId=c=>c.opening || c.advancement?.classId || 'warrior';
const COLORS={mage:'#a8b7eb',warrior:'#d5aa83',rogue:'#d6c876',ranger:'#9fc89e',paladin:'#e0b57b',priest:'#d4cfdf'};
const ROW=110;
const titleFor=node=>ABILITIES_BY_ID[node.abilityId]?.name || node.name;
const rankFor=(c,node)=>node.id==='camp'?nodeRank(c,'shared.fieldcraft.camp'):nodeRank(c,node);
const maximum=node=>nodeMaxRank(node,ABILITIES_BY_ID);
const camp={id:'shared.fieldcraft.camp',abilityId:'camp',kind:'ability',status:'live',name:'Camp',requires:[],level:2};

export function buildTalentPanel(el,ctx,{artSvg,setBarSlot,pick}) {
  if(!document.getElementById('bw-talents-css')){const style=make('style');style.id='bw-talents-css';style.textContent=TALENT_STYLES.replaceAll('.bw-talents','#bw-windows .bw-talents');document.head.appendChild(style);}
  const c=ctx.character;let selectedClass=classId(c),selectedNode=null,cards=[],edges=[],headers=[],detailsSignature=null;
  if(!CLASS_TREES.some(t=>t.id===selectedClass))selectedClass='warrior';
  const root=make('div','bw-talents');el.appendChild(root);
  const summary=make('div','talent-summary'),level=make('strong'),xp=make('span'),progress=make('div','talent-progress'),fill=make('span'),points=make('span','talent-points');
  progress.appendChild(fill);append(summary,level,progress,xp,points);root.appendChild(summary);
  const tabs=make('div','talent-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Class skill trees');root.appendChild(tabs);
  const tabButtons=new Map();
  for(const tree of CLASS_TREES){const button=make('button',null,tree.name);button.type='button';button.setAttribute('role','tab');button.addEventListener('click',()=>{selectedClass=tree.id;selectedNode=null;build();refresh();});tabs.appendChild(button);tabButtons.set(tree.id,button);}
  const tools=make('div','talent-tools'),help=make('p','talent-help'),reset=make('button','talent-reset','Reset talents');reset.type='button';
  reset.addEventListener('click',()=>{const result=ctx.abilities?.respecTalents?.() || {ok:false,reason:'Talents can only be reset from an active character outside combat.'};if(!result.ok){say(result.reason);return;}ctx.state?.touch?.('advancement');ctx.state?.touch?.('bar');ctx.onBarChange?.(c.bar);say(`Talents reset. ${result.points} points available.`);refresh();});
  append(tools,help,reset);root.appendChild(tools);
  const basics=make('div','talent-basics');basics.appendChild(make('span','talent-basics-label','Your starting kit'));root.appendChild(basics);
  const status=make('div','talent-status');status.setAttribute('role','status');root.appendChild(status);
  const details=make('aside','talent-details');details.setAttribute('aria-label','Selected talent');root.appendChild(details);
  const branches=make('div','talent-branches');root.appendChild(branches);
  const archive=make('details','talent-archive');root.appendChild(archive);
  function say(text){status.textContent=text;ctx.hud?.log?.(text);}
  function bind(id){const a=ABILITIES_BY_ID[id];if(!a || !talentRank(c,id)){say('Learn this ability first.');return;}if(a.passive){say(`${a.name} is passive.`);return;}
    pick(id,slot=>{const result=setBarSlot(c,slot,id);if(result.ok){ctx.state?.touch?.('bar');ctx.onBarChange?.(c.bar,slot);}say(result.reason);return result;});say(`${a.name} selected. Click an action-bar slot.`);
  }
  function basicIcon(id){const a=ABILITIES_BY_ID[id];if(!a)return null;const button=make('button','talent-basic');button.type='button';button.innerHTML=artSvg(a,40);button.title=a.name;button.setAttribute('aria-label',`${a.name}: place on action bar`);button.addEventListener('click',()=>bind(id));dragSource(button,()=>talentRank(c,id)&&!a.passive?{ability:id}:null);attachTip(button,()=>({lines:[a.name,...characterAbilityLines(c,a,ctx.actor)]}));return button;}
  for(const id of new Set([...COMMON_ABILITIES,...(STARTER_ABILITIES[classId(c)] || [])])){const icon=basicIcon(id);if(icon)basics.appendChild(icon);}
  const camping=make('button','talent-camp','Campcraft');camping.type='button';camping.addEventListener('click',()=>{selectedNode=camp;refreshDetails();});basics.appendChild(camping);
  function select(node){selectedNode=node;for(const rec of cards)rec.card.classList.toggle('selected',rec.node.id===node.id);refreshDetails();}
  function purchase(node){const result=learnTalent(c,node.id==='camp'?ABILITIES_BY_ID.camp:node.id,ABILITIES_BY_ID);if(!result.ok){say(result.reason);return;}
    const a=ABILITIES_BY_ID[node.abilityId];ctx.abilities?.applyPassives?.();ctx.recompute?.();ctx.state?.touch?.('advancement');
    if(a&&result.rank===1){if(!c.unlockedAbilities?.includes(a.id))(c.unlockedAbilities ||= []).push(a.id);ctx.hud?.unlock?.({id:a.id,name:a.name,key:'Drag onto your action bar'});}
    ctx.audio?.play?.('skill_up');say(`${titleFor(node)}, rank ${result.rank}. ${result.points} talent points remaining.`);selectedNode=node;refresh();
  }
  function checkFor(node){return learnCheck(c,node.id==='camp'?ABILITIES_BY_ID.camp:node.id,ABILITIES_BY_ID);}
  function refreshDetails(){if(!selectedNode){if(detailsSignature==='none')return;detailsSignature='none';details.textContent='';const copy=make('div');append(copy,make('h4',null,'Choose your path'),make('p',null,'Select a talent to see its effect and requirements. Drag learned abilities onto your action bar.'));details.appendChild(copy);return;}
    const node=selectedNode,a=ABILITIES_BY_ID[node.abilityId],rank=rankFor(c,node),max=maximum(node),check=checkFor(node);
    const hands=a&&rank?weaponCheck(a,c.equipment,c.pack):null;
    const lines=talentDescriptionLines(c,node,ctx.actor);
    const signature=JSON.stringify([node.id,rank,max,check.ok,check.reason,lines,hands?.ok,hands?.reason]);
    // Preserve focused controls between the window's periodic refreshes.
    if(signature===detailsSignature)return;detailsSignature=signature;details.textContent='';const copy=make('div');
    copy.appendChild(make('h4',null,titleFor(node)));for(const line of lines.slice(2))copy.appendChild(make('p',null,line));
    const prereqs=(node.requires || []).map(id=>titleFor(CLASS_NODES[id])).join(' + ');
    const requirement=`Rank ${rank} / ${max} · Level ${node.level}${node.requiredTreePoints?` · ${node.requiredTreePoints} points in this path`:''}${prereqs?` · Requires ${prereqs}`:''}`;
    copy.appendChild(make('p','talent-rule',requirement));
    if(!check.ok)copy.appendChild(make('p','talent-rule',check.reason));
    if(hands&&!hands.ok)copy.appendChild(make('p','talent-rule',hands.reason));
    const actions=make('div','talent-actions');
    {const learn=make('button','talent-detail-learn',rank>=max?'Fully trained':rank?'Train · 1 point':'Learn · 1 point');learn.type='button';learn.disabled=!check.ok;learn.addEventListener('click',()=>purchase(node));actions.appendChild(learn);
      if(a&&rank&&!a.passive){const place=make('button',null,'Place on action bar');place.type='button';place.addEventListener('click',()=>bind(a.id));actions.appendChild(place);}}
    append(details,copy,actions);
  }
  function build(){branches.textContent='';cards=[];edges=[];headers=[];const tree=CLASS_TREES.find(t=>t.id===selectedClass);root.style.setProperty?.('--tree-accent',COLORS[tree.id]);
    for(const branch of tree.branches){const section=make('section','talent-branch');section.dataset.spec=branch.id;const header=make('header'),heading=make('h3'),count=make('span','talent-spent');append(heading,make('span',null,branch.name),count);append(header,heading,make('p',null,branch.description));section.appendChild(header);headers.push({branch,count});
      const nodes=branch.nodes,height=(Math.max(...nodes.map(n=>n.row))+1)*ROW;
      const map=make('div','talent-map');map.style.height=`${height}px`;
      const lines=make('div','talent-connections');map.appendChild(lines);edges.push({nodes,lines,height,signature:''});
      for(const node of nodes){const a=ABILITIES_BY_ID[node.abilityId],art=ABILITIES_BY_ID[node.iconAbilityId || node.abilityId || node.effects?.find(e=>e.abilityIds?.length)?.abilityIds[0]] || ABILITIES_BY_ID[branch.nodes.find(n=>n.abilityId)?.abilityId],card=make('article','talent-node'),icon=make('button','talent-icon');card.dataset.nodeId=node.id;card.style.left=`${node.column*100/3}%`;card.style.top=`${node.row*ROW}px`;icon.type='button';
        icon.setAttribute('aria-label',titleFor(node));if(art)icon.innerHTML=artSvg(art,48);else icon.textContent='✦';icon.addEventListener('click',()=>select(node));icon.addEventListener('focus',()=>select(node));card.classList.toggle('modifier',node.kind==='modifier');card.classList.toggle('capstone',!!node.capstone);
        if(a)dragSource(icon,()=>talentRank(c,a.id)&&!a.passive?{ability:a.id}:null);
        attachTip(icon,()=>({lines:[...talentDescriptionLines(c,node,ctx.actor),checkFor(node).reason || 'A talent point is available.']}));
        append(card,icon,make('span','talent-name',titleFor(node)));
        const learn=make('span','talent-learn');card.appendChild(learn);
        map.appendChild(card);cards.push({node,card,learn,icon});
      }
      section.appendChild(map);branches.appendChild(section);
    }
    buildArchive();
  }
  function buildArchive(){archive.textContent='';const ownedIds=new Set(CLASS_TREES.find(t=>t.id===classId(c))?.branches.flatMap(b=>b.nodes.map(n=>n.abilityId)).filter(Boolean));
    const basicIds=new Set([...COMMON_ABILITIES,...(STARTER_ABILITIES[classId(c)]||[]),'camp']);
    const legacy=c.advancement?.legacy?.allocations || {};
    const retained=Object.keys(c.advancement?.ranks || {}).filter(id=>talentRank(c,id)&&(!ownedIds.has(id)||legacy[id])&&!basicIds.has(id)&&ABILITIES_BY_ID[id]);archive.hidden=!retained.length;
    archive.appendChild(make('summary',null,`Retained abilities · ${retained.length}`));archive.appendChild(make('p',null,'Abilities earned before class trees remain usable at their saved rank. New talent points follow your starting class.'));
    const list=make('div','talent-archive-items');for(const id of retained)list.appendChild(basicIcon(id));archive.appendChild(list);
  }
  function refresh(){const p=progressionView(c);level.textContent=`Level ${p.level}`;points.textContent=`${p.points} talent ${p.points===1?'point':'points'} available`;xp.textContent=p.needed?`${p.xp} / ${p.needed} XP`:'Maximum level';fill.style.width=`${p.fraction*100}%`;
    for(const [id,button] of tabButtons)button.setAttribute('aria-selected',String(id===selectedClass));
    help.textContent=selectedClass===classId(c)?'Spend points across your three paths. Hover for effects and current numbers. Gold is learned; green is available.':`Browsing ${CLASS_TREES.find(t=>t.id===selectedClass)?.name}. Your ${CLASS_TREES.find(t=>t.id===classId(c))?.name || 'existing'} character keeps its own class talents.`;
    reset.hidden=selectedClass!==classId(c);
    for(const {branch,count} of headers)count.textContent=`${selectedClass===classId(c)?treePoints(c,branch.id).spent:0} points`;
    for(const rec of cards){const {node,card,learn,icon}=rec,rank=rankFor(c,node),max=maximum(node),check=checkFor(node);card.classList.toggle('learned',rank>0);card.classList.toggle('available',check.ok);card.classList.toggle('locked',!rank&&!check.ok);card.classList.toggle('selected',selectedNode?.id===node.id);
      icon.title=`${titleFor(node)} · ${`Rank ${rank}/${max}`}`;if(learn){learn.textContent=`${rank}/${max}`;learn.title=check.reason || 'Select this talent to spend a point';}}
    for(const rec of edges){const signature=rec.nodes.map(n=>rankFor(c,n)).join(',');if(signature===rec.signature)continue;rec.signature=signature;const visible=new Map(rec.nodes.map(n=>[n.id,n]));
      const paths=rec.nodes.flatMap(node=>(node.requires||[]).filter(id=>visible.has(id)).map(id=>{const from=visible.get(id),x1=(from.column+.5)*100,x2=(node.column+.5)*100,y1=from.row*ROW+56,y2=node.row*ROW+4,mid=(y1+y2)/2;const cls=rankFor(c,from)>0?'earned':'';return `<path class="talent-edge ${cls}" d="M${x1} ${y1} V${mid} H${x2} V${y2}"/>`;})).join('');
      rec.lines.innerHTML=`<svg viewBox="0 0 300 ${rec.height}" preserveAspectRatio="none" width="100%" height="100%" aria-hidden="true">${paths}</svg>`;
    }
    refreshDetails();
  }
  build();refresh();return {refresh};
}
