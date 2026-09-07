import {buildStudioCharacter} from './body.js';
import {PERSON} from '../../mmo/story.js';
import {classProfiles} from '../../vendor/living-studio/models/class-profiles.js';
const CLASS={blacksmith:'artisan',tailor:'artisan',bowyer:'ranger',alchemist:'mage',healer:'healer',mage:'mage',stablemaster:'ranger',weaponsmaster:'warrior',ranger:'ranger',bard:'bard',necromancer:'necromancer',thief:'rogue',officer:'warrior',outlaw:'rogue'};
export function buildStudioNpc(npc={}){
 const role=npc.role?.id||npc.role||'farmer',kind=CLASS[role]||'blank',name=npc.personName||npc.name||npc.id||role;
 let seed=0;for(const c of name)seed=(seed*31+c.charCodeAt(0))>>>0;
 const person=npc.person||PERSON[npc.at],namedGender=({wynn:'female',pip:'female',cobb:'male',alys:'female',ivy:'female',vane:'male',millersson:'male'})[person?.id];
 const body=buildStudioCharacter({gender:namedGender||(seed%2?'male':'female'),skin:['fair','sand','olive','tan','umber'][seed%5],hairColour:role==='elder'?'silver':['chestnut','black','auburn'][seed%3],hairStyle:seed%2?'cropped':'braid',height:role==='child'?1.28:1.72+(seed%7)*.02},{classId:kind,tunicColor:({farmer:0x6f5a30,elder:0x8c8578,child:0xb4784f,miller:0xa39a80,officer:0x241f26,outlaw:0x3f3a2c,sexton:0x545a55})[role]});
 const eq={};for(const[slot,base]of Object.entries(classProfiles[kind].equipment))if(base!=='none')eq[slot]={base};
 if(!eq.chest)eq.chest={base:'cloth_chest'};if(!eq.legs)eq.legs={base:'cloth_legs'};if(!eq.feet)eq.feet={base:'cloth_feet'};
 if(role==='blacksmith')eq.mainHand={base:'smith_hammer'};
 else if(['weaponsmaster','officer','outlaw','ranger','bard','healer'].includes(role)){const p=classProfiles[kind];if(p.weapon!=='fists')eq.mainHand={base:p.weapon};if(p.shield!=='none')eq.offHand={base:p.shield};}
 body.setEquipment(eq);return body;
}
