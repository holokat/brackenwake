import {headRecipes} from '../head-spec.js';
import {applyHairstyle} from '../hairstyles.js';
import {skull} from '../items/skull.js';

const looks={
 bandit:{coat:'#684c37',trim:'#a17c50',skin:'#b4825c',weapon:'dagger',body:'medium',head:'angular',hair:'part'},
 banditArcher:{coat:'#4d6040',trim:'#a39666',skin:'#c4946e',weapon:'bow',body:'slim',head:'gaunt',hair:'crop'},
 highwayman:{coat:'#242f37',trim:'#716351',skin:'#b68d70',weapon:'rapier',body:'slim',head:'hooked',hair:'knot'},
 raider:{coat:'#80492f',trim:'#af8659',skin:'#a97550',weapon:'axe',body:'heavy',head:'broad',hair:'knot'},
 legionSoldier:{coat:'#252d2e',trim:'#7e8780',skin:'#b88866',weapon:'shield',body:'heavy',head:'broad',hair:'crop',metal:true},
 legionArcher:{coat:'#303c3c',trim:'#8b8e7f',skin:'#a57655',weapon:'bow',body:'slim',head:'angular',hair:'bald',metal:true},
 oramBlackhand:{coat:'#21272b',trim:'#a68b4f',skin:'#9e7352',weapon:'longsword',body:'heavy',head:'scarred',hair:'bald',metal:true},
 scarecrow:{coat:'#78674b',trim:'#b2a078',skin:'#897e5a',weapon:'none',body:'slim',head:'gaunt',hair:'bald'},
 zombie:{coat:'#615c45',trim:'#858065',skin:'#81866b',weapon:'claws',body:'medium',head:'gaunt',hair:'crop'},
 drowned:{coat:'#354e50',trim:'#799086',skin:'#768e85',weapon:'claws',body:'heavy',head:'round',hair:'part'},
 wraith:{coat:'#263139',trim:'#466264',skin:'#718988',weapon:'claws',body:'slim',head:'gaunt',hair:'bald'},
 skeleton:{coat:'#66513d',trim:'#8b7a52',skin:'#bdad8e',weapon:'buckler',body:'medium',head:'gaunt',hair:'bald'},
};
export function humanLook(id,options){const look={...looks[id],...options};if(!look.coat)throw new Error(`Missing human look ${id}`);return look;}

function face(s,look,id){
 s.bone='head';const start=s.root.children.length;
 for(const[method,args,opts]of headRecipes){if(/hair|Hair|Sideburn/.test(args[0]))continue;s.own(s.h[method](...args,opts));}
 const faces=s.root.children.slice(start),profile=look.head;
 for(const mesh of faces){const p=mesh.geometry.attributes.position;for(let i=0;i<p.count;i++){
  let x=p.getX(i),y=p.getY(i),z=p.getZ(i),jaw=Math.exp(-1*((z-7.13)/.31)**2);
  if(profile==='broad'){x*=1.15;y-=jaw*.025;}
  if(profile==='gaunt'){x*=.84;z=7+(z-7)*1.06;}
  if(profile==='round'){x*=1.08;z=7+(z-7)*.94;}
  if(profile==='hooked'&&/nose/i.test(mesh.name)){y-=.085;z-=.03;}
  if(profile==='scarred'){x*=1.07;if(x>0)y+=.025*jaw;}
  p.setXYZ(i,x,y,z);
 }mesh.geometry.computeVertexNormals();if(mesh.material.name.includes('skin'))mesh.material.color.set(look.skin);}
 if(profile==='scarred')s.tube('Healed cheek scar',[[.24,-.355,7.57],[.23,-.367,7.45],[.29,-.329,7.31]],[.017,.02,.009],'#795b48',5);
 const hairStyles={crop:'close_crop',part:'side_part',knot:'top_knot'};
 if(look.hair!=='bald'){
  const before=new Set(s.root.children);applyHairstyle(s.root,{bodyType:'male',style:hairStyles[look.hair],headwear:'none'});
  for(const o of s.root.children)if(o.isMesh&&!before.has(o))s.own(o,'head');
 }
 if(['legionSoldier','legionArcher','oramBlackhand'].includes(id)){
  s.loft('Riveted Legion helmet',[[0,.04,7.64,.43,.40],[0,.05,7.89,.45,.42],[0,.06,8.04,.30,.31],[0,.06,8.11,.09,.16]],'steel_dark');
  s.tube('Helmet lower rolled rim',[[-.4,-.17,7.64],[-.27,-.36,7.65],[0,-.41,7.66],[.27,-.36,7.65],[.4,-.17,7.64]],.026,look.trim);
  for(const side of[-1,1])s.mesh('Helmet cheek guard '+side,[[side*.40,-.11,7.73],[side*.41,-.23,7.58],[side*.29,-.27,7.21],[side*.28,-.14,7.25],[side*.40,.01,7.55]],[[0,1,2,3,4]],'steel_dark');
  if(id==='oramBlackhand')s.loft('Sergeant helmet crown ridge',[[0,.03,8.04,.08,.40],[0,.02,8.29,.04,.25]],look.trim,6);
 }
 if(id==='highwayman'){
  s.loft('Highwayman broad hat brim',[[0,.025,7.85,.73,.61],[0,.025,7.91,.73,.61]],'#252923',12);
  s.loft('Highwayman pinched crown',[[0,.05,7.9,.4,.37],[0,.06,8.23,.3,.30],[0,.08,8.31,.20,.24]],'#30332b',8);
  s.loft('Hat leather band',[[0,.05,7.94,.405,.375],[0,.05,8.04,.385,.36]],'#69513b',10);
 }
 if(id==='drowned')s.tube('Waterlogged sailor headcloth',[[-.42,.08,7.83],[0,.17,8.0],[.42,.08,7.83]],.10,'#526d6b');
}

export function buildHumanBody(s,id,look){
 const undead=['zombie','drowned'].includes(id),shade=id==='wraith',straw=id==='scarecrow';
 if(id==='skeleton'){buildSkeleton(s,look);return;}
 const broad=look.body==='heavy'?1.1:look.body==='slim'?.89:1;
 s.bone='hips';
 if(!shade)s.loft('Trouser pelvis',[[0,.02,3.55,.56*broad,.35],[0,.03,3.96,.73*broad,.43],[0,.03,4.18,.7*broad,.40]],undead?'#505549':'#353a32');
 s.bone='spine';s.loft('Coat fitted waist',[[0,0,3.97,.71*broad,.44],[0,0,4.35,.67*broad,.42],[0,0,4.94,.72*broad,.43],[0,0,5.15,.79*broad,.43]],look.coat);
 s.bone='chest';s.loft('Coat tailored chest',[[0,0,4.9,.74*broad,.44],[0,0,5.53,.9*broad,.47],[0,0,6.05,1.02*broad,.48],[0,0,6.32,.9*broad,.40],[0,.02,6.49,.38,.29]],look.coat);
 s.bone='neck';s.loft('Exposed neck',[[0,.03,6.42,.29,.25],[0,.04,6.75,.24,.24],[0,.05,7.05,.25,.26]],look.skin,10);
 if(!straw&&!shade)face(s,look,id);
 for(const side of[-1,1]){
  const label=side<0?'L':'R';
  if(!shade){
   s.bone='thigh'+label;s.tube('Trouser thigh '+label,[[side*.48,.04,3.94],[side*.55,.045,3.3],[side*.66,-.05,2.3]],[[.37*broad,.39],[.34*broad,.35],[.245,.25]],undead?'#4f584e':'#3a3b32',10);
   s.bone='shin'+label;s.tube('Boot shaft '+label,[[side*.67,-.06,2.30],[side*.77,.04,1.62],[side*.87,0,.52]],[[.27,.27],[.26,.28],[.21,.23]],straw?'wood':undead?'#47514a':'#3b3027',10);
   s.tube('Boot cuff '+label,[[side*.69,-.045,2.16],[side*.70,-.03,2.00]],.285,look.trim);
   s.bone='foot'+label;s.loft('Boot sole '+label,[[side*.90,-.18,0,.29,.48],[side*.90,-.18,.13,.3,.49],[side*.88,-.12,.4,.24,.38],[side*.87,0,.62,.20,.22]],straw?'wood':undead?'#39453e':'#2e2822',10);
  }
  s.bone='upperArm'+label;s.tube('Coat upper sleeve '+label,[[side*1.01,0,6.15],[side*1.2,0,5.72],[side*1.45,-.015,5.05]],[[.35*broad,.35],[.31,.31],[.225,.23]],id==='zombie'&&side===1?look.skin:look.coat,10);
  s.bone='forearm'+label;s.tube('Sleeve forearm '+label,[[side*1.45,-.015,5.05],[side*1.53,-.13,4.58],[side*1.61,-.22,4.08]],[[.24,.24],[.25,.24],[.16,.15]],undead?look.skin:look.coat,10);
  s.tube('Bound wrist wrap '+label,[[side*1.58,-.19,4.36],[side*1.61,-.22,4.12]],.19,look.trim);
  s.bone='hand'+label;
  s.cube('Palm '+label,[side*1.62,-.24,3.89],[.28,.27,.33],look.skin,.04);
  for(let finger=0;finger<4;finger++){const x=side*1.62+(finger-1.5)*.075;s.tube('Finger '+label+' '+finger,[[x,-.32,3.93],[x,-.40,3.73],[x,-.31,3.69]],[.042,.041,.034],look.skin,6);if(undead||shade)s.tube('Claw '+label+' '+finger,[[x,-.31,3.69],[x,-.39,3.58]],[.033,0],'#b7bb9d',5);}
  s.tube('Thumb '+label,[[side*1.45,-.22,4.0],[side*1.42,-.36,3.86],[side*1.50,-.41,3.82]],[.065,.065,.05],look.skin,6);
 }
 buildCoatDetails(s,id,look,broad);
}

function buildCoatDetails(s,id,look,broad){
 const shade=id==='wraith',straw=id==='scarecrow',undead=['zombie','drowned'].includes(id);
 s.bone='hips';s.loft('Leather waist belt',[[0,0,3.98,.76*broad,.46],[0,0,4.18,.74*broad,.45]],'#3f3328');
 s.cube('Belt rectangular buckle',[.06,-.475,4.085],[.25,.07,.19],look.trim,.018);s.cube('Buckle inner shadow',[.06,-.516,4.085],[.13,.012,.085],'#312e25');
 if(!shade){
  for(const side of[-1,1]){
   const x=side*.48*broad;if(undead){
    s.mesh('Ragged undead shirt hem '+side,[[side*.06,-.46,4.1],[side*.76*broad,-.31,4.1],[side*.85*broad,-.3,3.25],[side*.62,-.41,3.49],[side*.50,-.49,2.99],[side*.35,-.5,3.45],[side*.18,-.51,3.16]],[[0,1,2,3,4,5,6]],look.coat);
   }else s.mesh('Split coat skirt '+side,[[side*.08,-.448,4],[side*.7*broad,-.3,4],[side*.82*broad,-.28,3.0],[side*.23,-.50,2.90]],[[0,1,2,3]],look.coat);
   s.cube('Stitched utility pouch '+side,[side*.71*broad,-.10,3.86],[.28,.27,.43],'#66513a',.05);s.cube('Pouch flap '+side,[side*.71*broad,-.245,4.02],[.3,.04,.17],'#8a6d48',.015);
  }
 }
 s.bone='chest';
 if(!shade&&!undead){
  for(const side of[-1,1])s.mesh('Coat folded lapel '+side,[[side*.12,-.48,5.06],[side*.35,-.51,5.74],[side*.36,-.29,6.44],[side*.59,-.41,6.23]],[[0,1,2,3]],look.trim);
  for(let i=0;i<5;i++)s.ico('Coat button '+i,[.08,-.49,5.22+i*.21],[.035,.027,.035],look.trim,1);
 }
 if(['bandit','banditArcher','raider'].includes(id)){
  s.tube('Diagonal leather bandolier',[[-.91,-.23,6.26],[-.55,-.46,5.78],[0,-.5,5.25],[.65,-.4,4.64]],[[.095,.043],[.095,.043],[.095,.043],[.095,.043]],'#493628',6);
  for(let i=0;i<4;i++)s.cube('Bandolier stitch '+i,[-.60+i*.26,-.506,5.90-i*.27],[.06,.019,.026],'#b69b68');
 }
 if(look.metal){
  s.loft('Black Legion breastplate',[[0,-.06,4.7,.70*broad,.45],[0,-.06,5.18,.8*broad,.49],[0,-.02,5.88,1.03*broad,.53],[0,-.01,6.20,.91*broad,.44]],'steel_dark',10);
  s.tube('Breastplate raised central rib',[[0,-.57,4.78],[0,-.61,5.36],[0,-.55,6.15]],.028,look.trim,6);
  for(const side of[-1,1]){
   s.bone='upperArm'+(side<0?'L':'R');s.ico('Legion layered pauldron '+side,[side*1.11,-.015,6.17],[.47,.4,.32],'steel_dark');s.tube('Pauldron rolled edge '+side,[[side*.92,-.29,6.24],[side*1.17,-.37,6.17],[side*1.45,-.23,6.02]],.03,look.trim);
   s.bone='forearm'+(side<0?'L':'R');s.tube('Legion vambrace '+side,[[side*1.50,-.10,4.85],[side*1.60,-.21,4.26]],[[.26,.27],[.19,.18]],'steel_dark');
  }
  s.bone='hips';for(let i=0;i<5;i++){const x=(i-2)*.29;s.cube('Legion hanging tasset '+i,[x,-.47,3.73],[.26,.13,.61],'steel_dark',.04);s.ico('Tasset rivet '+i,[x,-.55,3.93],[.035,.015,.035],look.trim,1);}
  if(id==='oramBlackhand'){
   s.bone='chest';s.loft('Oram overlaid gorget and breastplate',[[0,-.16,5.38,.88,.53],[0,-.10,5.98,1.12,.52],[0,-.05,6.38,.62,.40]],'#3d4546',10);
   for(const side of[-1,1])s.ico('Oram brass fastening '+side,[side*.7,-.57,5.94],[.11,.033,.10],look.trim,1);
   cloak(s,'Sergeant short mantle','#543a30',2.5);
  }
 }
 if(id==='highwayman')cloak(s,'Highwayman long cloak','#27332f',1.3);
 if(undead){
  s.bone='head';
  s.mesh('Sunken torn cheek',[[-.32,-.32,7.31],[-.16,-.38,7.22],[-.21,-.36,7.05],[-.31,-.28,7.15]],[[0,1,2,3]],'#39483b');
  for(let i=0;i<3;i++)s.cube('Exposed undead tooth '+i,[-.22+i*.055,-.385,7.17],[.035,.027,.08],'#adae8e',.006);
  s.bone='chest';
  s.mesh('Torn shirt exposed ribs',[[.15,-.49,5.18],[.63,-.41,5.39],[.76,-.37,5.85],[.34,-.47,5.65]],[[0,1,2,3]],look.skin);
  for(let i=0;i<3;i++)s.tube('Gaunt rib shadow '+i,[[.31,-.493,5.36+i*.13],[.62,-.438,5.45+i*.13]],.019,'#55604b',5);
  for(const side of[-1,1]){
   s.bone='upperArm'+(side<0?'L':'R');
   for(let i=0;i<5;i++)s.mesh('Torn sleeve edge '+side+' '+i,[[side*(1.15+i*.04),-.26,5.61],[side*(1.19+i*.04),-.29,5.52],[side*(1.27+i*.04),-.23,5.16+(i%2)*.18]],[[0,1,2]],look.coat);
   s.bone='forearm'+(side<0?'L':'R');s.mesh('Undead forearm skin lesion '+side,[[side*1.40,-.31,4.85],[side*1.56,-.36,4.92],[side*1.60,-.40,4.59],[side*1.51,-.38,4.50]],[[0,1,2,3]],'#4c6050');
  }
  s.bone='chest';for(let i=0;i<4;i++)s.mesh('Torn coat opening '+i,[[.27-i*.2,-.491,5.0+i*.2],[.45-i*.2,-.495,5.20+i*.2],[.18-i*.2,-.502,5.14+i*.2]],[[0,1,2]],'#303e32');
  if(id==='drowned'){
   for(const side of[-1,1])s.mesh('Waterlogged broad sailor collar '+side,[[side*.31,-.33,6.42],[side*.83,-.31,6.10],[side*.63,-.51,5.57],[side*.12,-.51,5.92]],[[0,1,2,3]],'#243e44');
   for(let i=0;i<3;i++)s.tube('Faded sailor collar stripe '+i,[[-.70+i*.025,-.42,6.07-i*.06],[-.54+i*.025,-.523,5.74-i*.05],[-.13,-.529,5.96-i*.015]],.015,'#b0b49b',5);
   s.tube('Sailor rope collar',[[-.6,-.25,6.22],[-.36,-.5,5.93],[0,-.52,5.78],[.36,-.5,5.93],[.6,-.25,6.22]],.075,'#858b66');
   for(let i=0;i<7;i++)s.tube('Trailing waterweed '+i,[[Math.sin(i)*.83,.25,5.9-i*.16],[Math.sin(i)*.95,.35,5.4-i*.16],[Math.sin(i)*.85,.42,5.0-i*.17]],[.055,.039,0],'#3f5d45',5);
  }
 }
 if(straw){
  s.bone='head';s.loft('Stitched sacking head',[[0,.03,6.87,.29,.25],[0,.03,7.12,.44,.39],[0,.04,7.63,.44,.39],[0,.03,7.94,.26,.25]],'#a49166',8);
  for(const side of[-1,1])s.tube('Sacking cross eye '+side,[[side*.25-.08,-.396,7.6],[side*.25+.08,-.397,7.44]],.027,'#322d22',5);
  s.tube('Sewn crooked mouth',[[-.24,-.401,7.25],[0,-.426,7.19],[.23,-.400,7.3]],.018,'#383226',5);
  for(let i=0;i<6;i++)s.tube('Mouth cross stitch '+i,[[-.23+i*.09,-.426,7.13],[-.21+i*.09,-.429,7.29]],.011,'#383226',5);
  s.loft('Scarecrow floppy hat brim',[[0,.04,7.88,.76,.59],[0,.04,7.95,.74,.58]],'#625137');s.loft('Scarecrow hat',[[0,.04,7.93,.39,.36],[.14,.08,8.39,.29,.29],[.31,.1,8.49,.07,.13]],'#6f5f41',8);
  for(const side of[-1,1]){s.bone='hand'+(side<0?'L':'R');for(let i=0;i<10;i++)s.tube('Wrist straw '+side+' '+i,[[side*1.6+(i%3-.8)*.1,-.2+(i%4)*.07,4.1],[side*(1.68+(i%3)*.12),-.3+(i%4)*.08,3.53-(i%3)*.1]],[.025,.008],'#c4b16e',5);}
  s.bone='chest';s.tube('Scarecrow cross pole',[[-2.15,.3,5.96],[2.15,.3,5.96]],.09,'wood',6);
 }
 if(shade){
  s.bone='hips';s.loft('Wraith tapering empty robe',[[0,.1,.65,.38,.32],[0,.08,1.2,.79,.6],[0,.04,2.2,.89,.57],[0,0,3.4,.78,.49],[0,0,4.2,.75,.45]],look.coat,12);
  for(let i=0;i<9;i++){const a=i*Math.PI*2/9,x=Math.sin(a),y=Math.cos(a);s.mesh('Wraith ragged hem '+i,[[x*.76,y*.55,1.5],[x*.56-y*.14,y*.41+x*.14,1.2],[x*.45,y*.36,.4+(i%3)*.13],[x*.56+y*.14,y*.41-x*.14,1.2]],[[0,1,2,3]],look.coat);}
  s.bone='head';s.loft('Wraith deep hood',[[0,.13,6.63,.47,.42],[0,.12,7.13,.59,.52],[0,.15,7.7,.54,.5],[0,.19,8.11,.24,.29],[0,.2,8.24,.07,.12]],look.coat,10);
  s.ico('Wraith recessed hood void',[0,-.352,7.30],[.38,.16,.48],'#101b20');
  for(const side of[-1,1])s.ico('Wraith faint eye '+side,[side*.12,-.49,7.38],[.045,.024,.033],'#82afa5',1);
  s.bone='chest';cloak(s,'Wraith trailing mantle',look.coat,.7);
 }
}
function cloak(s,name,color,bottom){s.bone='chest';s.loft(name,[[0,.42,bottom,.8,.20],[0,.46,3.6,1.03,.28],[0,.34,5.30,1.12,.27],[0,.16,6.35,.72,.28]],color,12);}

function buildSkeleton(s,look){
 const bone='#c5b798',dark='#9b8b6d';s.bone='hips';
 for(const side of[-1,1])s.tube('Pelvic iliac arch '+side,[[side*.07,0,4.2],[side*.5,.03,4.13],[side*.61,.02,3.77],[side*.26,-.10,3.56],[side*.10,-.09,3.9]],[.12,.15,.13,.09,.1],bone);
 for(let i=0;i<7;i++){s.bone=i<3?'spine':'chest';s.ico('Spinal vertebra '+i,[0,.20,4.24+i*.26],[.14,.16,.12],bone,1);}
 s.bone='chest';s.tube('Sternum',[[0,-.35,4.88],[0,-.41,5.51],[0,-.29,6.1]],[.08,.12,.08],bone);
 for(const side of[-1,1]){
  for(let i=0;i<6;i++){const z=5.03+i*.18,rx=.55+Math.sin(i/5*Math.PI)*.21;s.tube('Rib '+side+' '+i,[[0,.23,z+.12],[side*rx,.10,z+.11],[side*(rx+.035),-.18,z],[side*.35,-.4,z-.09],[side*.05,-.36,z-.05]],[.061,.064,.061,.055,.04],bone,6);}
  s.tube('Clavicle '+side,[[0,-.18,6.15],[side*.5,-.10,6.30],[side*1.01,0,6.13]],[.065,.075,.09],bone,6);
  const label=side<0?'L':'R';
  for(const[joint,a,b,r]of[['upperArm',[side*1.03,0,6.13],[side*1.45,-.015,5.05],.10],['forearm',[side*1.45,-.015,5.05],[side*1.61,-.22,4.03],.075],['thigh',[side*.48,.04,3.9],[side*.67,-.06,2.23],.13],['shin',[side*.67,-.06,2.23],[side*.87,0,.48],.095]]){
   s.bone=joint+label;s.tube(joint+' bone '+label,[a,b],[r,r*.78],bone,7);s.ico(joint+' joint '+label,a,[r*1.5,r*1.35,r*1.4],dark,1);
   if(joint==='forearm'||joint==='shin')s.tube(joint+' paired bone '+label,[[a[0]+side*.12,a[1]+.07,a[2]-.07],[b[0]+side*.09,b[1]+.06,b[2]+.07]],[r*.53,r*.45],bone,6);
  }
  s.bone='foot'+label;for(let i=0;i<5;i++)s.tube('Foot metatarsal '+label+' '+i,[[side*.87+(i-2)*.07,0,.46],[side*.89+(i-2)*.08,-.28,.13],[side*.90+(i-2)*.075,-.52,.07]],[.046,.04,.036],bone,5);
  s.bone='hand'+label;for(let i=0;i<5;i++)s.tube('Hand phalange '+label+' '+i,[[side*1.61+(i-2)*.069,-.22,4.04],[side*1.62+(i-2)*.075,-.27,3.78],[side*1.60+(i-2)*.07,-.38,3.66]],[.035,.03,.022],bone,5);
 }
 s.bone='neck';s.tube('Cervical spine',[[0,.04,6.13],[0,.03,7.02]],.13,bone,7);
 s.bone='head';const before=new Set(s.root.children);skull(s.h,{center:[0,.06,7.04],scale:1.13,prefix:'Skeleton skull',decoration:false});for(const mesh of s.root.children)if(mesh.isMesh&&!before.has(mesh))s.own(mesh,'head');
 if(look.armor==='warrior'){s.loft('Rusted skeleton helm',[[0,.05,7.81,.43,.40],[0,.07,8.00,.4,.4],[0,.1,8.15,.15,.20]],'#625342',10);s.bone='chest';s.mesh('Torn skeleton tabard',[[-.53,-.43,6.12],[.53,-.43,6.12],[.39,-.39,4.21],[.13,-.42,4.39],[-.22,-.41,4.03],[-.5,-.4,4.4]],[[0,1,2,3,4,5]],'#62543e');}
}
