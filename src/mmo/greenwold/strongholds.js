// Action destinations, separate from wildlife habitats and construction spaces.
// Defenders are split into gate, yard, flank and command groups. Clearing a
// place and opening its supply chest use the existing combat and save paths.
const p=(model,x,z,yaw=0,scale=1)=>({model,x,z,yaw,scale});
const run=(model,x,z,x2,z2)=>({model,from:{x,z},to:{x:x2,z:z2}});
const guards=(id,points,squad)=>points.map(([x,z])=>({id,x,z,squad}));
const leader=(id,x,z,title)=>({id,x,z,squad:'command',elite:true,title});
const fire=(x,z)=>({id:'watch_fire',x,z,y:.5,scale:1,gate:'always'});
const lamp=(x,z,color=0xffaa66)=>({x,z,y:2.5,color,power:25,range:20});
const tents=[p('tent_ragged',-23,-12,55,1.4),p('tent_ragged',24,-9,305,1.3),p('tent_ragged',-20,14,120,1.3),p('tent_ragged',23,16,235,1.4)];
const supply=[p('lw_stolen_goods',-12,-21),p('weapons_rack',10,-19,90),p('crate',14,-23),p('barrel',17,-21),p('lw_woodpile',-26,4),p('campfire',0,0)];
const campWall=[run('palisade_stake_3m',-30,-34,28,-31),run('palisade_stake_3m',-30,-34,-39,-8),run('palisade_stake_3m',-39,4,-34,27),run('palisade_stake_3m',28,-31,39,-5),run('palisade_stake_3m',39,-5,34,28),run('camp_fence',-34,27,-9,33),run('camp_fence',9,33,34,28)];
export const STRONGHOLDS=[
  {id:'outlaw_tollcamp',name:'The outlaw toll camp',district:'longmeadow',at:{x:306,z:-294},radius:74,approach:[347,-211],back:[224,-204],tier:2,
    note:'Outlaws have barricaded a camp above the mill lane. Scouts hold the gate, archers watch the flanks, and the captain keeps the stolen supplies at the back.',
    pieces:[...tents,...supply,p('tarp_cart',-11,18,65,1.7),p('lw_water_trough',28,4,90,1.3),p('bench',-6,3,75,1.3),p('bench',5,4,280,1.3),p('target_dummy',-27,-25,0,1.2),p('target_dummy',-21,-27,0,1.2),p('lookout_platform',29,28,0,1.25),p('lw_wanted_poster',-10,38),p('lw_gibbet_cage',-27,26),p('loot_sack',0,-23)],runs:campWall,
    spawns:[...guards('goblinScout',[[-8,39],[8,39],[-14,46],[14,46]],'gate'),...guards('bandit',[[-16,0],[16,0],[-8,-10],[8,-10]],'yard'),...guards('banditArcher',[[-28,18],[30,7]],'flanks'),...guards('wildDog',[[-43,5],[-44,13],[44,4],[46,12]],'dogs'),...guards('raider',[[-5,-27],[10,-22]],'command'),leader('highwayman',0,-14,'Outlaw captain')],effects:[fire(0,0)],lights:[lamp(0,0)]},
  {id:'occult_tower',name:'The occult tower',district:'kingsroad',at:{x:662,z:-363},radius:94,approach:[553,-401],back:[716,-289],tier:3,
    note:'A dark tower rises behind the Kingsroad bank. Cultists channel in the forecourt while armed dead hold the walls. The adept commands the inner circle.',
    pieces:[p('occult_tower',0,-27),p('cellar_arch',0,34,0,1.4),p('brazier',-12,6),p('brazier',12,6),p('ritual_altar',0,-3),p('lw_drowned_wall',-24,13,90),p('lw_drowned_wall',24,13,90),p('lw_dead_oak',-32,-3),p('lw_dead_oak',32,-7),p('headstone_a',-30,24,25),p('headstone_b',-24,30,340),p('headstone_c',30,23,10),p('headstone_d',25,31,340),p('loot_sack',10,-12),p('lw_drowned_wall',-19,22,0,2),p('lw_drowned_wall',19,22,0,2),p('ritual_altar',-24,-15,30,.65),p('ritual_altar',24,-15,330,.65),p('lw_cairn',-29,-28,0,2.2),p('lw_cairn',29,-28,0,2.2)],
    runs:[run('flint_wall_4m',-41,-44,41,-44),run('flint_wall_4m',-41,-44,-41,31),run('flint_wall_4m',41,-44,41,31),run('flint_wall_4m',-41,39,-12,39),run('flint_wall_4m',12,39,41,39)],
    spawns:[...guards('skeleton',[[-9,46],[9,46],[-18,50],[18,50]],'gate'),...guards('zombie',[[-29,14],[-30,5],[29,16],[30,7]],'graveyard'),...guards('cultist',[[-14,-3],[14,-3],[-18,-17],[18,-17]],'circle'),...guards('skeletonWarrior',[[-9,-15],[9,-15]],'command'),...guards('wisp',[[-23,-7],[23,-7]],'spirits'),leader('cultistAdept',0,-12,'Tower adept')],
    effects:[{id:'mist_bank',x:0,z:14,scale:2,gate:'always'},{id:'mushroom_spores',x:0,z:-3,scale:1.8,gate:'always'}],lights:[lamp(-12,6,0x8e6ad9),lamp(12,6,0x79aec4)]},
  {id:'beech_raiders',name:'The raiders stockade',district:'beechhangar',at:{x:-1190,z:142},radius:82,approach:[-1095,140],back:[-1128,230],tier:3,
    note:'Goblins have fortified a timber clearing in the Beech Hangar. Two entrances lead between the log barricades to the hobgoblin commanding the camp.',
    pieces:[p('lw_woodcutters_hut',0,-22,0,1.4),p('tent_ragged',-22,-14,60,1.5),p('tent_ragged',22,-10,300,1.5),p('lw_log_pile',-25,12),p('lw_log_pile',25,14),p('lw_saw_pit',-18,0,90),p('weapons_rack',12,-21),p('campfire',0,5),p('loot_sack',0,-12),p('lw_gibbet_cage',26,29),p('lw_tripwire',-6,39,90)],
    runs:[run('palisade_stake_3m',-38,-35,38,-35),run('palisade_stake_3m',-38,-35,-38,4),run('palisade_stake_3m',-38,17,-38,35),run('palisade_stake_3m',38,-35,38,35),run('camp_fence',-38,35,-12,35),run('camp_fence',12,35,38,35)],
    spawns:[...guards('goblinScout',[[-8,43],[8,43],[-17,47],[17,47]],'gate'),...guards('goblinWarrior',[[-13,8],[13,8],[-13,-8],[13,-8]],'yard'),...guards('wildDog',[[-29,-5],[-29,3],[29,-2],[28,6]],'dogs'),...guards('goblinScout',[[-46,7],[-48,15],[34,42],[40,46]],'flanks'),leader('hobgoblin',0,-8,'Raider chieftain')],effects:[fire(0,5)],lights:[lamp(0,5)]},
  {id:'quarry_barracks',name:'The quarry barricade',district:'chalkpits',at:{x:-704,z:-957},radius:82,approach:[-654,-851],back:[-643,-1055],tier:2,
    note:'Raiders have seized a quarry bench and its ore carts. The timber barriers divide the workyard into two fighting courts, with a captain guarding the pay chest.',
    pieces:[p('foremans_hut',0,-24,0,1.3),p('legion_tent',-22,-15,60,1.3),p('legion_tent',23,-13,300,1.3),p('ore_cart',-16,10,90),p('ore_cart',19,9,60),p('lw_timber_prop',-26,25),p('lw_timber_prop',26,25),p('spear_rack',10,-22),p('lw_log_pile',-26,1),p('brazier',0,7),p('loot_sack',0,-13)],
    runs:[run('camp_fence',-35,-34,35,-34),run('camp_fence',-35,-34,-35,31),run('camp_fence',35,-34,35,31),run('camp_fence',-35,31,-10,31),run('camp_fence',10,31,35,31)],
    spawns:[...guards('raider',[[-9,40],[9,40],[-14,47],[14,47]],'gate'),...guards('banditArcher',[[-28,14],[28,15],[-22,-32],[22,-32]],'flanks'),...guards('bandit',[[-12,-5],[12,-5],[-8,-16],[8,-16]],'yard'),...guards('wildDog',[[-42,-6],[-43,3],[43,-7],[45,2]],'dogs'),leader('highwayman',0,-4,'Quarry captain')],effects:[fire(0,7),{id:'dust_gust',x:-20,z:20,scale:1,gate:'fair'}],lights:[lamp(0,7)]},
  {id:'eastern_watchfort',name:'The eastern watchfort',district:'kingsroad',at:{x:1175,z:-701},radius:101,approach:[1094,-781],back:[1193,-576],tier:3,
    note:'The Legion has built a defended watchfort among the eastern trees. The gatehouse opens into a drill yard, flanked by tents and supply wagons.',
    pieces:[p('gate_tower',0,37,0,1.5),p('legion_tent',-27,-24,30,1.5),p('legion_tent',27,-24,330,1.5),p('legion_tent',-27,5,90,1.5),p('legion_tent',27,5,270,1.5),p('legion_standard',0,-25,0,1.5),p('lw_tithe_wagon',-14,-36,90),p('legion_crate',15,-34),p('weapons_rack',20,20,90),p('spear_rack',-20,20,90),p('brazier',-13,32),p('brazier',13,32),p('loot_sack',0,-35)],
    runs:[run('palisade_stake_3m',-44,-46,44,-46),run('palisade_stake_3m',-44,-46,-44,38),run('palisade_stake_3m',44,-46,44,38),run('palisade_stake_3m',-44,38,-8,38),run('palisade_stake_3m',8,38,44,38)],
    spawns:[...guards('legionSoldier',[[-9,50],[9,50],[-17,57],[17,57]],'gate'),...guards('legionSoldier',[[-13,9],[13,9],[-13,-3],[13,-3],[-10,-17],[10,-17]],'yard'),...guards('legionArcher',[[-35,23],[35,23],[-35,-7],[35,-7]],'flanks'),...guards('legionSoldier',[[-55,3],[-55,12],[55,4],[55,14]],'patrol'),leader('legionSoldier',0,-21,'Watchfort commander')],effects:[fire(-13,32),fire(13,32)],lights:[lamp(-13,32),lamp(13,32)]},
  {id:'southern_reavers',name:'The southern raider camp',district:'coldwake',at:{x:-253,z:703},radius:82,approach:[-235,625],back:[-330,690],tier:2,
    note:'Raiders shelter stolen wagons behind the southern field bank. Scouts guard the two gaps in the fence while the captain holds the camp stores.',
    pieces:[...tents,...supply,p('tarp_cart',0,-31,90,1.4),p('cart_laden',-27,29,40),p('lw_hay_wain',24,30,310),p('lw_wanted_poster',-10,40),p('loot_sack',0,-20)],runs:campWall,
    spawns:[...guards('goblinScout',[[-8,43],[8,43],[-15,49],[15,49]],'gate'),...guards('raider',[[-13,0],[13,0],[-11,-13],[11,-13]],'yard'),...guards('banditArcher',[[-28,17],[30,7]],'flanks'),...guards('wildDog',[[-45,-7],[-45,2],[45,-7],[45,3]],'dogs'),...guards('bandit',[[-8,-22],[8,-22]],'command'),leader('highwayman',0,-9,'Raider captain')],effects:[fire(0,0)],lights:[lamp(0,0)]},
];

// The fighting courts stay close enough to read from the player's camera.
// Models keep their physical scale; only the spacing of the plan contracts.
for(const h of STRONGHOLDS){
  for(const key of ['pieces','spawns','effects','lights','runs'])h[key]=structuredClone(h[key]);
  const spacing=h.id==='eastern_watchfort'?.8:.7;
  for(const p of [...h.pieces,...h.spawns,...h.effects,...h.lights]){p.x=+(p.x*spacing).toFixed(2);p.z=+(p.z*spacing).toFixed(2);}
  for(const p of h.pieces)if(['tent_ragged','legion_tent'].includes(p.model))p.scale*=1.4;
  for(const r of h.runs)for(const p of [r.from,r.to]){p.x=+(p.x*spacing).toFixed(2);p.z=+(p.z*spacing).toFixed(2);}
}

export const strongholdSpace=id=>'greenwold_'+id;
export const strongholdKey=(hub,index)=>`s:${strongholdSpace(hub.id)}:plan:${hub.id}:${index}`;
export function strongholdRemaining(hub,character){
  const dead=new Set((character.deadUntil||[]).map(d=>d.key));
  return hub.spawns.filter((s,i)=>!dead.has(strongholdKey(hub,i))).length;
}
export function authorStrongholds(spaces){
  for(const h of STRONGHOLDS){
    const id=strongholdSpace(h.id);
    spaces[id]={id,name:h.name,note:h.note,at:h.at,radius:h.radius,landmark:true,district:h.district,
      pieces:h.pieces.map(p=>({...p,tag:'greenwold-action'})),runs:h.runs,areas:[],trees:[],rocks:[],people:[],markers:[],effects:h.effects,lights:h.lights,
      spawns:h.spawns.map((s,i)=>({...s,encounter:h.id+':'+s.squad,slot:h.id+':'+i,rallyRadius:14})),forage:[],stations:[]};
  }
}
