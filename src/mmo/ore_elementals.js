// Brackenwake's ore guardians. Behaviours use the existing combat note handlers.
export const ORE_ELEMENTALS=[
 ['iron',0x555966,0xf4a153,'The ironbreaker',['groundSlam','stun']],
 ['copper',0x9b5937,0x50dbbc,'The verdigris colossus',['groundSlam','poison2']],
 ['tin',0x9aa6ac,0xdce4ee,'The ringing sentinel',['knockback','stun']],
 ['silver',0xd4dfeb,0xf4f6ff,'The argent revenant',['groundSlam','manaDrain']],
 ['coldiron',0x344b66,0x79c5ff,'The blue anvil',['frostNova','stun']],
 ['emberite',0x5b2b23,0xff762b,'The furnace heart',['breath','fireImmune']],
 ['rimesteel',0x7fadc6,0xb4eeff,'The glacial titan',['frostNova','coldImmune']],
 ['verdite',0x416f48,0xb9f489,'The venom geode',['poisonBreath','breath','poison2']],
 ['voidrock',0x171b2b,0xb378ff,'The hollow giant',['manaDrain','incorporeal50']],
 ['starfall',0x858aa0,0xffe9ae,'The fallen star',['groundSlam','knockback','stun']],
].map(([ore,color,glow,title,notes],i)=>({id:ore+'Elemental',ore,color,glow,title,notes,reward:18+i*2,index:i}));
export const ORE_ELEMENTAL=Object.fromEntries(ORE_ELEMENTALS.map(r=>[r.id,r]));
export function registerOreElementals(rows){for(const e of ORE_ELEMENTALS){const base=rows.find(r=>r.id===(e.index<5?'ironGolem':'frostGiant'));rows.push({...base,id:e.id,name:e.ore[0].toUpperCase()+e.ore.slice(1)+' Elemental',kind:'elemental',family:'biped',boss:false,wave:'Shoulder',model:e.title+': faceted '+e.ore+' stone, an emissive mineral heart, shoulder crystals and orbiting shards.',notes:['immunePoison',...e.notes],lootTable:['ore','gem'],oreElemental:e.ore,oreReward:e.reward,tamable:undefined});}}
export function elementalAwakening(claim,record){return !record.awakened&&record.taken===2&&claim.hash%11===0;}
