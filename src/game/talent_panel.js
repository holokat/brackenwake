import {ABILITIES_BY_ID, weaponCheck} from '../mmo/abilities.js';
import {TALENT_TREES, TALENT_NODES, COMMON_ABILITIES, STARTER_ABILITIES, talentRank, learnTalent, learnCheck, maxTalentRank, talentCooldown, progressionView} from '../mmo/talents.js';
import {dragSource, attachTip} from './windows.js';
import {theme} from './ui_theme.js';

const make=(tag,className,text)=>{const el=document.createElement(tag);if(className)el.className=className;if(text!=null)el.textContent=text;return el;};
function css(){
  if(document.getElementById('bw-talents-css'))return;
  const style=make('style');style.id='bw-talents-css';style.textContent=`
.bw-talents{--talent-gold:#dbb66b;color:#e8dfc8;font-family:${theme.fonts.body};font-variant-numeric:tabular-nums;-webkit-font-smoothing:antialiased;padding:0 2px 24px}
.bw-talents .talent-summary{display:flex;align-items:center;gap:16px;flex-wrap:wrap;margin:0 0 8px;font-size:19px}
.bw-talents .talent-points{color:var(--talent-gold);margin-left:auto}
.bw-talents .talent-progress{height:4px;background:#27252b;flex:1;min-width:60px;max-width:240px;overflow:hidden;border-radius:3px}
.bw-talents .talent-progress span{display:block;height:100%;background:linear-gradient(90deg,#806399,#d2b5f3)}
.bw-talents .talent-tabs{display:flex;gap:5px;flex-wrap:wrap;margin:0 0 12px;padding-bottom:12px;border-bottom:1px solid #675330}
.bw-talents button{font:inherit;color:inherit;border:1px solid #665536;border-radius:4px;background:#252421;cursor:pointer;min-height:40px;padding:7px 12px}
.bw-talents button:hover,.bw-talents button:focus-visible{border-color:#ecc977;background:#373125;outline:1px solid #ecc977;outline-offset:2px}
.bw-talents button[aria-selected=true]{background:#463821;color:#ffe4a2;border-color:#c89b49}
.bw-talents button:disabled{cursor:default;opacity:.55;outline:none}
.bw-talents .talent-help{font-size:13px;color:#b7b19f;margin:8px 0 16px;line-height:1.5}
.bw-talents .talent-branches{display:grid;grid-template-columns:repeat(3,minmax(220px,1fr));gap:20px;align-items:start}
.bw-talents .talent-branch h3{font:600 19px ${theme.fonts.display};text-transform:none;letter-spacing:.02em;margin:0 0 14px;color:#e4c784;text-align:center}
.bw-talents .talent-node{position:relative;padding:12px;background:linear-gradient(145deg,rgba(58,50,44,.75),rgba(20,23,25,.94));border:1px solid #554b3d;border-radius:6px;margin-bottom:20px;box-shadow:0 5px 14px #0003}
.bw-talents .talent-node+.talent-node:before{content:'';position:absolute;bottom:100%;left:50%;height:21px;width:2px;background:linear-gradient(#8b7147,#635943)}
.bw-talents .talent-node.learned{border-color:#ac8848;background:linear-gradient(145deg,rgba(77,63,37,.8),rgba(22,28,26,.96))}
.bw-talents .talent-node.available{border-color:#bea45e;box-shadow:0 0 16px #b3913b18}
.bw-talents .talent-head{display:flex;align-items:center;gap:10px;margin:0 86px 8px 0}
.bw-talents .talent-icon{width:52px;height:52px;min-width:52px;padding:0;overflow:hidden;background:#141b1e}
.bw-talents .talent-icon img,.bw-talents .talent-icon svg{width:100%;height:100%;display:block;object-fit:cover}
.bw-talents .talent-name{font:600 20px ${theme.fonts.display};line-height:1.2;margin-bottom:4px}
.bw-talents .talent-rank{font-size:15px;color:#bdab86}
.bw-talents .talent-desc{display:none}
.bw-talents .talent-rule{min-height:18px;font-size:14px;line-height:1.35;color:#dab775;margin:6px 0 0}
.bw-talents .talent-learn{position:absolute;right:12px;top:12px;width:78px;min-height:52px;padding:5px;font-size:14px;line-height:1.25}
.bw-talents .talent-basics{display:flex;align-items:center;flex-wrap:wrap;gap:8px;margin:10px 0;padding:8px 0;border-bottom:1px solid #454031}
.bw-talents .talent-basics .talent-icon{width:40px;height:40px;min-width:40px}
.bw-talents .talent-basics-label{font-size:12px;color:#aba48f;margin-right:5px}
.bw-talents .talent-status{font-size:14px;color:#e2c277;margin:6px 0}.bw-talents .talent-status:empty{display:none}
@media(max-width:850px){.bw-talents .talent-branches{grid-template-columns:repeat(3,minmax(180px,1fr));gap:12px;overflow-x:auto}.bw-talents .talent-name{font-size:17px}.bw-talents .talent-head{margin-right:64px;gap:7px}.bw-talents .talent-learn{width:60px;font-size:12px}}
`;document.head.appendChild(style);
}
export function buildTalentPanel(el,ctx,{artSvg,setBarSlot,pick}) {
  css();const c=ctx.character;let selected=TALENT_TREES.some(t=>t.id===c.opening)?c.opening:'warrior';
  const root=make('div','bw-talents');el.appendChild(root);
  const summary=make('div','talent-summary'),level=make('strong'),xp=make('span'),progress=make('div','talent-progress'),fill=make('span'),points=make('span','talent-points');
  progress.appendChild(fill);summary.append(level,progress,xp,points);root.appendChild(summary);
  const tabs=make('div','talent-tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Skill trees');root.appendChild(tabs);
  const buttons=new Map();
  for(const tree of TALENT_TREES){const b=make('button',null,tree.name);b.type='button';b.setAttribute('role','tab');b.addEventListener('click',()=>{selected=tree.id;build();refresh();});tabs.appendChild(b);buttons.set(tree.id,b);}
  root.appendChild(make('p','talent-help','Earn a talent point with each level after the first. Follow a branch, hover an ability for details, and drag learned abilities onto your action bar.'));
  const basics=make('div','talent-basics');basics.appendChild(make('span','talent-basics-label','Starting abilities'));root.appendChild(basics);
  const status=make('div','talent-status');status.setAttribute('role','status');root.appendChild(status);
  const branches=make('div','talent-branches');root.appendChild(branches);let cards=[];
  function say(text){status.textContent=text;ctx.hud?.log?.(text);}
  function bind(id){const ability=ABILITIES_BY_ID[id];if(!talentRank(c,id)){say(`Learn ${ability.name} first.`);return;}if(ability.passive){say(`${ability.name} is passive.`);return;}
    pick(id,slot=>{const result=setBarSlot(c,slot,id);if(result.ok){ctx.state?.touch?.('bar');ctx.onBarChange?.(c.bar,slot);}say(result.reason);return result;});say(`${ability.name} selected. Click an action-bar slot.`);}
  function icon(ability){const tile=make('button','talent-icon');tile.type='button';tile.innerHTML=artSvg(ability,48);tile.setAttribute('aria-label',`${ability.name}: place on action bar`);tile.addEventListener('click',()=>bind(ability.id));dragSource(tile,()=>talentRank(c,ability.id)&&!ability.passive?{ability:ability.id}:null);attachTip(tile,()=>({lines:[ability.name,ability.description,`${Number(talentCooldown(ability,c).toFixed(2))} s cooldown`]}));return tile;}
  for(const id of [...new Set([...COMMON_ABILITIES,...(STARTER_ABILITIES[c.opening] || [])])])if(ABILITIES_BY_ID[id])basics.appendChild(icon(ABILITIES_BY_ID[id]));
  function build(){branches.textContent='';cards=[];const tree=TALENT_TREES.find(t=>t.id===selected);
    for(const branch of tree.branches){const column=make('section','talent-branch');column.appendChild(make('h3',null,branch.name));branches.appendChild(column);
      for(const id of branch.ids){const a=ABILITIES_BY_ID[id];if(!a)continue;
        const card=make('article','talent-node'),head=make('div','talent-head'),copy=make('div'),name=make('div','talent-name',a.name),rank=make('div','talent-rank'),desc=make('p','talent-desc',a.description),rule=make('div','talent-rule'),learn=make('button','talent-learn');
        learn.type='button';copy.append(name,rank);head.append(icon(a),copy);card.append(head,desc,rule,learn);column.appendChild(card);
        learn.addEventListener('click',()=>{const result=learnTalent(c,a);if(!result.ok){say(result.reason);return;}
          ctx.abilities?.applyPassives?.();ctx.recompute?.();ctx.state?.touch?.('advancement');
          if(result.rank===1){if(!c.unlockedAbilities?.includes(id))(c.unlockedAbilities ||= []).push(id);ctx.hud?.unlock?.({id,name:a.name,key:'Drag onto your action bar'});}
          ctx.audio?.play?.('skill_up');say(`${a.name}, rank ${result.rank}. ${result.points} talent points remaining.`);refresh();
        });cards.push({a,card,rank,rule,learn});
      }
    }
  }
  function refresh(){const p=progressionView(c);level.textContent=`Level ${p.level}`;points.textContent=`${p.points} talent ${p.points===1?'point':'points'} available`;xp.textContent=p.needed?`${p.xp} / ${p.needed} XP`:'Maximum level';fill.style.width=`${p.fraction*100}%`;
    for(const [id,b] of buttons)b.setAttribute('aria-selected',String(id===selected));
    for(const rec of cards){const {a,card,rank,rule,learn}=rec;const n=talentRank(c,a.id),max=maxTalentRank(a),check=learnCheck(c,a),node=TALENT_NODES[a.id];
      rank.textContent=`Rank ${n} / ${max}${a.passive?' · Passive':''}`;card.classList.toggle('learned',n>0);card.classList.toggle('available',check.ok);
      const hands=weaponCheck(a,c.equipment,c.pack);const cooldown=n>1?`Cooldown ${Number(talentCooldown(a,c).toFixed(2))} s. `:'';
      rule.textContent=check.ok?(n?`${cooldown}Next rank: ${3*n}% shorter cooldown.`:`Level ${node.level} · ${node.requires?ABILITIES_BY_ID[node.requires].name:'Branch entry'}`):check.requires?`Requires ${ABILITIES_BY_ID[check.requires].name}.`:check.reason;
      if(n&&!hands.ok)rule.textContent+=` ${hands.reason}`;
      learn.disabled=!check.ok;learn.textContent=n>=max?'Fully learned':n?`Improve · 1 point`:'Learn · 1 point';
    }
  }
  build();refresh();return {refresh};
}
