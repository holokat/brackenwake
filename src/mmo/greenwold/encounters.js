// Every position is authored in world metres. These packs occupy existing
// field margins, banks and working clearings; they never scatter at runtime.
// Point order is persistent: append new slots so cleared enemies stay cleared.
const pack=(id,space,reason,monster,day,night=[],nightMonster=monster)=>({id,space:'greenwold_'+space,reason,
  slots:[...day.map(([x,z])=>({id:monster,x,z})),...night.map(([x,z])=>({id:nightMonster,x,z,night:true}))]});
export const ENCOUNTERS=[
  pack('wood-yard-vermin','habitat_west_gate_work','Rats feed along the log yard edge outside the safe village.','giantRat',[[365,-205],[368,-199],[356,-226],[364,-194]],[[358,-200]]),
  pack('east-lane-vermin','kingsroad_1','Thorn grubs occupy the grassy ditch below the east lane.','thornGrub',[[527,-230],[538,-232],[545,-224],[532,-244]],[[546,-240]]),
  pack('bridge-bank-vermin','grove_bridge_lane_grove','Rats work the dry upper bank beside the bridge lane.','giantRat',[[365,-46],[357,-51],[350,-45],[342,-52]],[[349,-61]]),
  pack('west-lane-dogs','grove_mill_lane_north_one','Dogs watch the lane from the field margin before the shepherds fold.','wildDog',[[250,-208],[241,-215],[259,-215]],[[246,-223]]),
  pack('east-stone-grubs','encounter_east_lane','Grubs feed beneath thorn on the approach to the eastern stones.','thornGrub',[[663,-170],[670,-171],[679,-168]],[[666,-177]]),
  pack('bridge-cut-dogs','grove_bridge_south_willows','A small pack watches the second bend of the bridge lane.','wildDog',[[235,-14],[228,-14],[243,-12]],[[248,-11]]),
  pack('cellar-cut-vermin','habitat_cellar_bank','Vermin gather beside the logs on the cellar approach.','giantRat',[[79,-131],[86,-127],[75,-134],[79,-122]],[[75,-126]]),
  pack('shepherds-vermin','habitat_mill_lane_fold','Rats feed beyond the shepherds hay, away from the sheep.','giantRat',[[118,-221],[121,-244],[126,-244],[130,-248]],[[109,-225]]),
  pack('mill-lane-boars','grove_mill_lane_north_two','Boar root the oak margin beside the long lane.','boar',[[62,-275],[53,-280],[66,-289]],[[49,-288]],'wildDog'),
  pack('meadow-lane-dogs','grove_mill_lane_north_three','Dogs use the sheltered bank overlooking the next bend.','wildDog',[[-133,-336],[-139,-330],[-142,-322],[-136,-324]],[[-159,-332],[-155,-343]]),
  pack('hay-cut-vermin','habitat_meadow_hay','Rats feed along the cut field beside the hay cart.','giantRat',[[-321,-399],[-326,-407],[-319,-391],[-330,-395]],[[-335,-402]]),
  pack('hay-lane-dogs','grove_hay_north_one','Dogs wait beyond the open haymakers lane.','wildDog',[[-492,-458],[-500,-453],[-510,-457],[-515,-447]],[[-507,-442],[-496,-441]],'wolf'),
  pack('warren-grubs','habitat_hay_lane_warren','Grubs occupy the bramble side of the rabbit bank.','thornGrub',[[-635,-499],[-639,-495],[-634,-527],[-617,-507]],[[-647,-500]]),
  pack('hay-bend-boars','grove_hay_bend','Boar turn over the bank beside the last bend into the mill.','boar',[[-836,-455],[-844,-449],[-850,-458]],[[-853,-450],[-845,-467]],'wildDog'),
  pack('mill-thicket-dogs','grove_mill_west_thicket','Dogs shelter behind the mill rather than beside its workshops.','wildDog',[[-1095,-332],[-1103,-325],[-1112,-330],[-1110,-341]],[[-1116,-338],[-1115,-345]],'wolf'),
  pack('wood-entrance-boars','habitat_wood_entrance','Boar forage beneath the coppiced trees beside the hollow way.','boar',[[-1127,-164],[-1135,-171],[-1128,-154]],[[-1137,-160]],'giantSpider'),
  pack('charcoal-dogs','habitat_charcoal','Dogs investigate the timber stacks beyond the charcoal clearing.','wildDog',[[-1148,-12],[-1149,-18],[-1144,-6]],[[-1173,-5],[-1140,1]],'wolf'),
  pack('fern-hollow-grubs','habitat_fern_hollow','Grubs feed in the damp fern bank beside the hollow way.','thornGrub',[[-1128,103],[-1126,111],[-1125,120],[-1124,128]],[[-1122,116],[-1122,135]],'giantSpider'),
  pack('beech-upper-boars','grove_hangar_upper_west','Boar occupy the wooded shoulder below the main clearing.','boar',[[-1100,213],[-1094,217],[-1102,227]],[[-1110,222],[-1111,233]],'wolf'),
  pack('beech-sett-dogs','grove_hangar_sett_back','Dogs range above the badger setts while the ridge path stays open.','wildDog',[[-1030,401],[-1022,408],[-1026,418],[-1036,417]],[[-1045,421],[-1042,432]],'wolf'),
  pack('beech-east-boars','grove_hangar_return_east','Boar root the outer beech shoulder on the return route.','boar',[[-931,319],[-938,325],[-942,315]],[[-944,335],[-951,329]],'wolf'),
  pack('beech-ridge-dogs','hangar_5','Dogs watch the narrow ridge below the overlook.','wildDog',[[-1038,30],[-1039,38],[-1037,47]],[[-1038,52]],'wolf'),
  pack('west-wood-dogs','hangar_2','A larger pack occupies the outer working woodland.','wildDog',[[-1346,-72],[-1355,-78],[-1349,-89],[-1338,-87]],[[-1363,-86],[-1360,-98]],'wolf'),
  pack('west-wood-boars','hangar_4','Boar forage on the outer slope above the timber route.','boar',[[-1321,126],[-1331,134],[-1326,144]],[[-1338,140],[-1340,151]],'wolf'),
  pack('quarry-lower-vermin','grove_quarry_lower_copse','Rats feed in the ditch below the pit timber route.','giantRat',[[-984,-469],[-980,-478],[-1001,-483],[-998,-492]],[[-975,-489]]),
  pack('quarry-layby-dogs','habitat_quarry_track','Dogs shelter behind the timber layby.','wildDog',[[-1012,-541],[-1020,-548],[-1017,-558],[-1010,-563]],[[-1027,-551]],'giantSpider'),
  pack('quarry-climb-grubs','grove_quarry_road_bank','Grubs infest the gorse bank on the chalk climb.','thornGrub',[[-932,-632],[-927,-641],[-924,-637],[-922,-649]],[[-917,-649]],'skeleton'),
  pack('white-spur-vermin','habitat_chalk_spur','Rats use the dry flint seams above the quarry road.','giantRat',[[-806,-830],[-810,-837],[-814,-829],[-824,-849]],[[-824,-843]],'giantSpider'),
  pack('pit-approach-dogs','grove_quarry_approach','Dogs guard the sheltered side of the pit approach.','wildDog',[[-692,-848],[-701,-843],[-707,-852]],[[-713,-844],[-720,-852]],'skeleton'),
  pack('chalk-rim-grubs','grove_chalk_shadow','Grubs infest the shaded chalk seams below the rim.','thornGrub',[[-687,-1030],[-694,-1042],[-705,-1045],[-700,-1048]],[[-710,-1044],[-712,-1053]],'skeleton'),
  pack('ridge-road-scouts','grove_chalk_east_fold','Goblin scouts overlook the exposed ridge road from its north bank.','goblinScout',[[-386,-966],[-375,-970],[-364,-965]],[[-377,-981],[-366,-978]]),
  pack('chapel-ridge-dogs','encounter_chapel_ridge','Dogs occupy the dry bank before the chapel landing.','wildDog',[[-240,-868],[-232,-871],[-224,-864]],[[-238,-880],[-228,-878]],'skeleton'),
  pack('pilgrim-grubs','habitat_pilgrims_rest','Grubs feed in the thorn below the pilgrims cairn.','thornGrub',[[75,-717],[64,-720],[73,-742]],[[55,-725],[80,-746]],'skeleton'),
  pack('mere-path-scouts','hollowwood_3','Scouts hold the wooded bend before the outlaw watch.','goblinScout',[[339,-967],[346,-962],[356,-967]],[[349,-953],[360,-957]]),
  pack('hollow-lookout-bandits','grove_hollow_lookout_screen','Outlaws guard the bank beside the lookout track.','bandit',[[591,-1021],[598,-1026],[607,-1025]],[[609,-1036]],'banditArcher'),
  pack('hollow-back-scouts','grove_hollow_back_throat','Scouts hold the last concealed turn above the stone lane.','goblinScout',[[444,-796],[438,-785],[445,-776],[431,-788]],[[429,-778],[439,-766]]),
  pack('kingsroad-lower-dogs','kingsroad_1','Dogs watch the first road bend beyond the village fields.','wildDog',[[516,-298],[522,-295],[505,-337]],[[544,-329]]),
  pack('kingsroad-middle-outlaws','grove_kingsroad_middle_east','Outlaws wait behind the fold beside the middle Kingsroad.','bandit',[[637,-564],[642,-563],[644,-556]],[[649,-560]],'banditArcher'),
  pack('kingsroad-watch','grove_kingsroad_upper_east','The Legion holds a shoulder above the road to its camp.','legionSoldier',[[763,-855],[771,-861],[777,-852]],[[784,-858]],'legionArcher'),
  pack('towpath-rats','grove_towpath_cellar_copse','Rats occupy the dry bank beneath the old cellar path.','giantRat',[[1,-87],[-7,-89],[-13,-83],[0,-97]],[[-17,-91]]),
  pack('towpath-grubs','grove_towpath_wetwood','Grubs feed below the willow roots alongside the towpath.','thornGrub',[[-274,-25],[-281,-31],[-288,-26],[-293,-36]],[[-282,-42]],'wisp'),
  pack('water-bank-dogs','grove_water_bank_lower','Dogs keep to the dry shelf above the meadow crossing.','wildDog',[[-460,39],[-468,43],[-475,36]],[[-478,46],[-464,47]],'wolf'),
  pack('water-lane-grubs','grove_water_bank_middle','Grubs feed in the rush margin beside the water meadow lane.','thornGrub',[[-772,-109],[-781,-116],[-777,-112]],[[-791,-121],[-789,-95]],'wisp'),
  pack('drovers-upper-dogs','grove_drovers_upper_east','Dogs wait above the dry bend on the drovers return.','wildDog',[[-558,192],[-551,185],[-546,195],[-555,204]],[[-540,203],[-548,211]],'wolf'),
  pack('drovers-halt-vermin','habitat_drovers_rest','Rats feed beyond the hay wagon at the drovers halt.','giantRat',[[-565,452],[-572,458],[-573,468],[-565,477]],[[-578,475]]),
  pack('drovers-lower-boars','grove_drovers_lower_east','Boar root the shoulder before the Coldwake descent.','boar',[[-501,602],[-495,611],[-505,617]],[[-493,622],[-484,615]],'wolf'),
  pack('bridle-bend-dogs','grove_bridle_north_bank','Dogs range the sheltered bank on the southern bridleway.','wildDog',[[-908,537],[-917,530],[-919,542]],[[-926,526],[-926,533]],'wolf'),
  pack('bridle-coppice-boars','habitat_south_wood','Boar forage beyond the saw pit in the working coppice.','boar',[[-863,692],[-870,683],[-861,700]],[[-872,697],[-869,708]],'wolf'),
  pack('coldwake-approach-vermin','grove_coldwake_north_bank','Rats feed in the bank beyond Coldwake pasture.','giantRat',[[-542,691],[-549,685],[-556,694],[-548,702]],[[-562,686]],'wildDog'),
  pack('south-fields-grubs','grove_south_fields_hollow','Grubs inhabit the thorn edge above the south fields lane.','thornGrub',[[-150,526],[-158,531],[-162,522],[-170,529]],[[-171,518]],'wildDog'),
  pack('south-stone-boars','grove_south_stone_back','Boar root the wooded shoulder below the southern stone.','boar',[[271,291],[279,296],[272,304]],[[285,306],[278,314]],'wolf'),
  pack('south-thorn-grubs','habitat_stone_south','Grubs feed behind the thorn bank on the stone circuit.','thornGrub',[[453,180],[445,186],[450,196],[460,202]],[[439,194]],'wildDog'),
  pack('east-hollow-dogs','habitat_stone_east','Dogs shelter in the fern hollow between the eastern stones.','wildDog',[[759,-357],[763,-347],[748,-330]],[[765,-353],[768,-332]],'wolf'),
  pack('north-stone-scouts','habitat_stone_north','Scouts watch the northern stone approach from the far bank.','goblinScout',[[488,-600],[492,-611],[497,-620]],[[501,-625]],'wolf'),
  pack('west-stone-dogs','habitat_stone_west','Dogs occupy the fern bank above the western stone lane.','wildDog',[[-172,-322],[-181,-282],[-175,-282]],[[-178,-323],[-186,-283]],'wolf'),
  pack('west-ring-grubs','grove_hedge_eight_south','Grubs inhabit the damp roots on the lower western bend.','thornGrub',[[-172,-49],[-179,-48],[-187,-47],[-183,-53]],[[-193,-51]],'wildDog'),
  pack('south-ring-dogs','grove_hedge_nine_east','Dogs use the sheltered bank beyond the southern ring bend.','wildDog',[[82,150],[91,155],[88,164]],[[98,164],[96,174]],'wolf'),
];

export function authorEncounters(spaces){
  for(const [id,name,x,z]of [['east_lane','The east lane',670,-170],['chapel_ridge','The ridge road',-235,-875]]){
    const key='greenwold_encounter_'+id;
    spaces[key]||={id:key,name,note:'',at:{x,z},radius:50,pieces:[],runs:[],areas:[],trees:[],rocks:[],people:[],markers:[],spawns:[]};
  }
  const owned=new Set(ENCOUNTERS.map(e=>e.id));
  for(const space of Object.values(spaces))space.spawns=(space.spawns||[]).filter(s=>!owned.has(s.encounter));
  for(const encounter of ENCOUNTERS){
    const space=spaces[encounter.space];
    if(!space)throw new Error('Missing encounter space: '+encounter.space);
    encounter.slots.forEach((p,i)=>space.spawns.push({...p,x:+(p.x-space.at.x).toFixed(2),z:+(p.z-space.at.z).toFixed(2),encounter:encounter.id,slot:encounter.id+':'+i}));
  }
  return {groups:ENCOUNTERS.length,day:ENCOUNTERS.reduce((n,e)=>n+e.slots.filter(s=>!s.night).length,0),night:ENCOUNTERS.reduce((n,e)=>n+e.slots.length,0)};
}
