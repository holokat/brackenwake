import {buildStudioCharacter} from './body.js';
import {PERSON} from '../../mmo/story.js';
import {classProfiles} from '../../vendor/living-studio/models/class-profiles.js';
import {studioNpcs} from '../../vendor/living-studio/data/studio-npcs.js';
const STUDIO_NPC_IDS=new Set(studioNpcs.map(n=>n.id));
export const NPC_STUDIO_LOOK={
 blacksmith:'blacksmith',provisioner:'provisioner',healer:'healer',weaponsmaster:'weaponsmaster',innkeeper:'innkeeper',
 alchemist:'alchemist',tailor:'tailor',banker:'banker',stablemaster:'stablemaster',bowyer:'bowyer',
 mage:'wizard',ranger:'ranger',bard:'provisioner',necromancer:'wizard',thief:'rogue',
 farmer:'provisioner',elder:'healer',child:'provisioner',miller:'provisioner',officer:'weaponsmaster',outlaw:'rogue',sexton:'healer',
};
export const NPC_STUDIO_NEAREST=Object.freeze(Object.fromEntries(Object.entries(NPC_STUDIO_LOOK).filter(([role,look])=>role!==look&&!STUDIO_NPC_IDS.has(role))));
export function auditStudioNpcLooks(roles){
 const bad=[];
 for(const role of roles){
  const look=NPC_STUDIO_LOOK[role.id];
  if(!look)bad.push(`${role.id} has no studio look`);
  else if(!Object.hasOwn(classProfiles,look))bad.push(`${role.id} maps to missing studio look ${look}`);
 }
 for(const [role,look] of Object.entries(NPC_STUDIO_LOOK)){
  if(!roles.some(r=>r.id===role))bad.push(`${role} maps to ${look} and is not a live role`);
 }
 if(bad.length)throw new Error(`studio npcs: ${bad.join('; ')}`);
 return Object.keys(NPC_STUDIO_LOOK).length;
}
export function buildStudioNpc(npc={}){
 const role=npc.role?.id||npc.role||'farmer',kind=NPC_STUDIO_LOOK[role]||'provisioner',name=npc.personName||npc.name||npc.id||role;
 let seed=0;for(const c of name)seed=(seed*31+c.charCodeAt(0))>>>0;
 const person=npc.person||PERSON[npc.at],namedGender=({wynn:'female',pip:'female',cobb:'male',alys:'female',ivy:'female',vane:'male',millersson:'male'})[person?.id];
 const body=buildStudioCharacter({gender:namedGender||(seed%2?'male':'female'),skin:['fair','sand','olive','tan','umber'][seed%5],hairColour:role==='elder'?'silver':['chestnut','black','auburn'][seed%3],hairStyle:seed%2?'cropped':'braid',height:role==='child'?1.28:1.72+(seed%7)*.02},{classId:kind,tunicColor:({farmer:0x6f5a30,elder:0x8c8578,child:0xb4784f,miller:0xa39a80,officer:0x241f26,outlaw:0x3f3a2c,sexton:0x545a55})[role]});
 const eq={};
 if(role==='blacksmith')eq.mainHand={base:'smith_hammer'};
 else if(['officer','outlaw','ranger','thief','mage','necromancer'].includes(role)){const p=classProfiles[kind];if(p.weapon!=='fists'&&p.weapon!=='none')eq.mainHand={base:p.weapon};if(p.shield!=='none')eq.offHand={base:p.shield};}
 body.setEquipment(eq);return body;
}
