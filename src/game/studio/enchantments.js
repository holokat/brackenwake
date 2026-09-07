import {createEnchantmentSession} from '../../vendor/living-studio/runtime/enchantment-session.js';
// Visuals describe real, currently active item properties. Preview-only combat
// promises from the studio never grant damage or status effects here.
export function enchantmentFor(actor,item,now=0){
 if(!item)return{id:'none',level:1};
 const type=actor?.enchant&&actor.enchant.until>now&&actor.enchant.hitsLeft>0?actor.enchant.damageType:null;
 if(type)return{id:({fire:'flame',cold:'frost',energy:'shock',poison:'venom',holy:'holy'})[type]||'force',level:2};
 if(item.identified===false)return{id:'none',level:1};
 const power=(item.affixes||[]).find(a=>a.power)?.id;
 if(['vampiric','stormcaller','everfrost'].includes(power))return{id:({vampiric:'vampiric',stormcaller:'shock',everfrost:'frost'})[power],level:3};
 const ids=new Set((item.affixes||[]).filter(a=>(a.value??a.amount??0)>0).map(a=>a.id||a.stat));
 for(const [affix,id]of [['hitFireball','flame'],['hitFrost','frost'],['hitLightning','shock'],['hitLifeDrain','vampiric'],['lifeLeech','vampiric'],['critChance','keen'],['damage','force']])if(ids.has(affix))return{id,level:item.rarity==='legendary'?3:item.rarity==='epic'?2:1};
 return{id:'none',level:1};
}
export function createGameEnchantments(scene,rig,actor){
 const session=createEnchantmentSession({scene});
 return{session,
  update(dt,now){const body=rig.studio?.actor,target=body?.group.userData.loadout?.find(p=>p.userData.slot==='weapon'),item=actor.weaponItem||actor.equipment?.mainHand||actor.equipment?.ranged;session.bind(target||null,enchantmentFor(actor,item,now));session.update(dt);},
  impact(info){if(info.kind==='melee'&&info.attacker===actor&&info.defender?.pos&&info.damage>0)session.triggerImpact(info.defender.pos);},
  dispose(){session.dispose();},
 };
}
