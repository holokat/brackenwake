import {blade,cuttingBevel,gem,grip,plate,role,shaft} from './common.js';
import {skull} from './skull.js';

function axeHead(h,{z=1.55,double=false,wide=.75}={}){
 const inner=[[wide-.095,z+.58],[wide-.025,z+.17],[wide-.09,z-.3]],outer=[[wide,z+.66],[wide+.12,z+.18],[wide+.06,z-.38]];
 const shape=[[.055,z+.26],[.3,z+.34],...inner,[.32,z-.17],[.055,z-.15]];
 plate(h,'Bearded axe blade',shape,.15,'steel');
 cuttingBevel(h,'Honed axe edge',inner,outer);
 if(double){
  plate(h,'Counter blade',shape.map(([x,z])=>[-x,z]),.15,'steel');
  cuttingBevel(h,'Counter blade edge',inner.map(([x,z])=>[-x,z]),outer.map(([x,z])=>[-x,z]));
 }
 h.loft('Head socket',[[0,0,z-.2,.16,.15],[0,0,z+.4,.15,.14]],'steel_dark',{n:8,variation:0});
 gem(h,[0,-.15,z+.12],{size:.1});
}

export function buildHafted(h,id){
 if(['axe','battleaxe','halberd'].includes(id)){
  const z=id==='axe'?1.55:id==='battleaxe'?2.28:2.75;
  shaft(h,id==='halberd'?-1.8:-.42,z+.375);grip(h,{top:.35,bottom:-.27});
  shaft(h,id==='halberd'?-1.86:-.45,id==='halberd'?-1.67:-.31,{radius:.105,mat:'steel_dark',name:'Haft heel cap'});
  axeHead(h,{z,double:id==='battleaxe',wide:id==='axe'?.66:id==='halberd'?.6:.91});
  if(id==='halberd'){
   blade(h,{base:z+.34,length:1.12,width:.14,name:'Halberd spear point'});
   plate(h,'Rear armor hook',[[0,z+.3],[-.56,z+.1],[-.73,z-.2],[-.45,z-.045],[0,z-.08]],.11,'steel_edge');
   shaft(h,-1.9,-1.62,{radius:.108,mat:'steel_dark',name:'Pole butt cap'});
  }
  return true;
 }
 if(['mace','warhammer','maul'].includes(id)){
  const z=id==='mace'?1.53:2.1;
  shaft(h,-.48,z+(id==='warhammer'?.2:.3),{radius:id==='maul'?.13:.1});grip(h,{bottom:-.31,top:.3,radius:.115});
  shaft(h,-.5,-.35,{radius:id==='maul'?.145:.114,mat:'steel_dark',name:'Haft heel cap'});
  if(id==='mace'){
   h.loft('Flanged mace core',[[0,0,z-.32,.16,.16],[0,0,z+.27,.19,.19]],'steel_dark',{n:8,variation:0});
   for(let i=0;i<6;i++){
    const flange=plate(h,'Mace flange '+(i+1),[[.08,z-.34],[.32,z-.2],[.39,z+.11],[.26,z+.35],[.08,z+.29]],.066,'steel');
    flange.rotation.z=i*Math.PI/3;
   }
   h.ico('Mace crown',[0,0,z+.36],[.18,.18,.12],'steel_edge',{sub:1,variation:0});
   h.loft('Mace head lower collar',[[0,0,z-.49,.13,.13],[0,0,z-.26,.18,.18]],'steel_dark',{n:8,variation:0});
   gem(h,[0,-.17,z-.4],{size:.075});
  }else if(id==='warhammer'){
   h.cube('Hammer socket',[0,0,z],[.33,.28,.5],'steel_dark',{bevel:.035});
   h.cube('Hammer head neck',[.22,0,z],[.24,.27,.3],'steel_dark');
   h.cube('Square striking face',[.52,0,z],[.5,.4,.49],'steel',{bevel:.06});
   h.cube('Polished striking face',[.79,0,z],[.055,.42,.5],'steel_edge');
   plate(h,'Warhammer piercing beak',[[-.13,z+.18],[-.43,z+.18],[-.95,z-.03],[-.5,z-.06],[-.16,z-.16]],.18,'steel_edge');
   gem(h,[0,-.15,z],{size:.13});
  }else{
   h.cube('Broad maul head',[0,0,z],[1.34,.66,.67],'steel_dark',{bevel:.08});
   for(const side of[-1,1])h.cube('Maul face '+side,[side*.64,0,z],[.18,.73,.73],'steel',{bevel:.065});
   h.cube('Maul central band',[0,0,z],[.28,.69,.69],'gold',{bevel:.03});gem(h,[0,-.365,z],{size:.155});
  }
  return true;
 }
 if(['spear','glaive','quarterstaff'].includes(id)){
  const top=id==='spear'?2.63:id==='glaive'?2.1:2.55;
  shaft(h,id==='quarterstaff'?-2.55:-1.9,top,{radius:id==='quarterstaff'?.115:.09});
  grip(h,{bottom:-.5,top:.4,radius:id==='quarterstaff'?.13:.105});
  if(id!=='quarterstaff')shaft(h,-2.0,-1.73,{radius:.12,mat:'steel_dark',name:'Pole butt cap'});
  if(id==='spear'){
   h.loft('Spear socket',[[0,0,top-.25,.15,.15],[0,0,top+.09,.12,.12]],'steel_dark',{n:8,variation:0});
   blade(h,{base:top,length:1.14,width:.255,thickness:.08,name:'Leaf spear head'});gem(h,[0,-.14,top-.08],{size:.09});
  }else if(id==='glaive'){
   const inner=[[.01,top+1.25],[.21,top+.96],[.13,top+.28]],outer=[[.42,top+1.72],[.3,top+.91],[.24,top+.23]];
   plate(h,'Swept glaive blade',[[-.1,top-.1],[-.14,top+.75],...inner,[.1,top-.1]],.12,'steel');
   cuttingBevel(h,'Glaive cutting edge',inner,outer,{thickness:.12,edge:.008});
   h.loft('Glaive socket',[[0,0,top-.3,.16,.14],[0,0,top+.12,.14,.13]],'steel_dark',{n:8,variation:0});gem(h,[0,-.14,top-.11],{size:.09});
  }else for(const z of[-2.57,2.4])h.loft('Quarterstaff end cap',[[0,0,z,.132,.132],[0,0,z+.17,.132,.132]],'steel',{n:8,variation:0});
  return true;
 }
 return false;
}

export function buildArcane(h,id){
 if(!['wand','staff','bone_staff'].includes(id))return false;
 if(id==='wand'){
  shaft(h,-.28,1.45,{radius:.068,mat:'wood_light',name:'Tapered wand'});grip(h,{bottom:-.25,top:.22,radius:.08});
  h.loft('Wand gemstone crown',[[0,0,1.27,.079,.079],[0,0,1.46,.115,.084]],'gold',{n:8,variation:0});
  gem(h,[0,-.081,1.47],{size:.13});return true;
 }
 if(id==='staff'){
  shaft(h,-2.65,2.51,{radius:.105});grip(h,{bottom:-.42,top:.32,radius:.12});
  h.tube('Open staff crown',[[0,0,2.18],[-.36,0,2.53],[-.42,0,3.05],[-.19,0,3.4]],[.15,.125,.085,.025],'gold',{sides:6,variation:.015});
  h.tube('Open staff crown',[[0,0,2.18],[.36,0,2.53],[.42,0,3.05],[.19,0,3.4]],[.15,.125,.085,.025],'gold',{sides:6,variation:.015});
  role(h.mesh('Cradle seated staff crystal',[[0,0,3.52],[-.23,0,2.95],[0,-.19,2.95],[.23,0,2.95],[0,.19,2.95],[0,0,2.48]],[[0,1,2],[0,2,3],[0,3,4],[0,4,1],[5,2,1],[5,3,2],[5,4,3],[5,1,4]],'crystal',{variation:0}),'gem');
  h.loft('Crystal crown cradle',[[0,0,2.32,.145,.145],[0,0,2.57,.14,.13]],'gold',{n:8,variation:0});
  for(const side of[-1,1])h.tube('Crystal retaining prong '+side,[[side*.31,0,2.66],[side*.21,0,2.92],[side*.15,0,3.01]],.035,'gold',{sides:6,variation:0});
  shaft(h,-2.7,-2.44,{radius:.125,mat:'steel_dark',name:'Staff heel'});return true;
 }
 role(h.tube('Bone staff shaft',[[0,0,-2.55],[.035,0,-1.9],[-.025,0,.4],[.07,0,2.57]],[.115,.09,.11,.16],'#b9ac8c',{sides:7,variation:.02}),'bone');
 grip(h,{bottom:-.4,top:.44,radius:.13});
 // Two broad horns and a hollow-eyed skull make the silhouette distinct from the crystal staff.
 for(const s of[-1,1])role(h.tube('Bone crown horn '+s,[[s*.16,0,2.58],[s*.42,0,2.83],[s*.52,0,3.3],[s*.36,0,3.57]],[.16,.13,.08,.008],'#c9bda0',{sides:6,variation:.02}),'bone');
 skull(h,{center:[0,-.015,2.48],scale:.88,prefix:'Bone staff skull'});
 return true;
}
