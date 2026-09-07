import {THREE,kit,leaf,tube,motion,TAU} from './shared.js';
import {wagon} from './construction.js';

export const animalIds=new Set(['cat','sheep','cow','horse','crow_on_post','duck','heron','dragonfly','kestrel','mill_cart_horse']);
export const animalClips={cat:['idle','stretch'],sheep:['idle','graze','walk','startle'],cow:['idle','graze','walk','low'],horse:['idle','graze','walk'],crow_on_post:['idle','flap'],duck:['idle','walk','flap'],heron:['idle','flap'],dragonfly:['hover','dart'],kestrel:['hover','flap'],mill_cart_horse:['idle']};

function bone(parent,name,p=[0,0,0],kind=null,opts={}) {
 const b=new THREE.Bone();b.name=name;b.position.set(...p);parent.add(b);if(kind)motion(b,kind,opts);return b;
}

export function quadruped(id){
 const root=new THREE.Group();root.name=`${id} articulated rig`;
 const coat=id==='sheep'?'#d3ccb1':id==='cow'?'#9b523c':id==='cat'?'#9b8265':'#755038';
 const bodyBone=bone(root,'Body',[0,id==='cat'?.14:.63,0],'breath',{amount:.012,speed:1.6});const k=kit(bodyBone);
 k.sphere(`${id} torso`,[0,0,0],id==='cat'?[.32,.12,.13]:[.64,.32,.25],coat,1);
 if(id==='sheep')for(let i=0;i<20;i++){const a=i*2.4,x=(i%5-2)*.23;k.sphere(`Faceted wool lock ${i}`,[x,Math.cos(a)*.22,Math.sin(a)*.21],[.18,.16,.15],i%3?'#d5cdb6':'#bbb59e',0);}
 if(id==='cow')for(let i=0;i<5;i++)k.sphere(`Red cow lighter coat patch ${i}`,[(i%3-1)*.3,Math.sin(i)*.17,(i%2?1:-1)*.21],[.19,.14,.045],'#b97954',0);
 const head=bone(bodyBone,'Head',[id==='cat'?.24:.56,id==='cat'?.02:.11,0],'head',{amount:.025});const q=kit(head);
 if(id==='cat'){
  q.sphere('Sleeping cat head',[.035,0,0],[.13,.105,.115],coat,1);
  for(const z of [-1,1]){q.cone(`Cat pointed ear ${z}`,[.02,.105,z*.072],.048,.095,coat,4);q.box(`Closed cat eye ${z}`,[.13,.01,z*.055],[.005,.014,.037],'black',0);q.sphere(`Cat muzzle ${z}`,[.139,-.04,z*.032],[.025,.028,.04],'plaster',0);}
  q.sphere('Cat nose',[.167,-.02,0],[.007,.01,.011],'#7c5751',0);
 } else {
  const neck=id==='horse'?.63:.16;q.sphere(`${id} neck`,[-.005,neck*.37,0],id==='horse'?[.18,.44,.17]:[.22,.23,.2],coat,1);
  const skull=q.sphere(`${id} head`,[id==='horse'?.20:.13,neck,0],id==='horse'?[.32,.14,.125]:[.24,.18,.18],id==='sheep'?'#6c675d':coat,1);if(id==='horse')skull.rotation.z=-.23;
  q.sphere(`${id} muzzle`,[id==='horse'?.46:.31,neck-(id==='horse'?.12:.07),0],id==='horse'?[.10,.088,.114]:[.10,.1,.15],id==='cow'?'#c4a58c':'#514438',0);
  for(const z of [-1,1]){
   const e=q.sphere(`${id} ear ${z}`,[.04,neck+(id==='horse'?.17:.105),z*(id==='horse'?.08:.15)],id==='horse'?[.04,.12,.040]:[.09,.055,.09],coat,0);e.rotation.x=z*.45;
   q.sphere(`${id} eye ${z}`,[.23,neck+.05,z*.148],[.026,.025,.012],'black',1);q.sphere(`${id} eye catchlight ${z}`,[.238,neck+.058,z*.157],[.008,.007,.004],'whitewash',0);
   if(id==='cow')tube(q,`Cow horn ${z}`,[[.01,neck+.10,z*.11],[-.05,neck+.19,z*.17],[-.01,neck+.28,z*.23]],.030,'bone',6);
   q.sphere(`${id} nostril ${z}`,[id==='horse'?.43:.39,neck-.07,z*.075],[.01,.025,.02],'black',0);
  }
  if(id==='horse')for(let i=0;i<10;i++)q.box(`Horse mane lock ${i}`,[-.19+i*.009,.04+i*.077,0],[.11,.13,.09],'woodDark',.01);
 }
 for(const x of [-1,1])for(const z of [-1,1]){
  const l=bone(bodyBone,`${x>0?'Front':'Rear'} leg ${z}`,[x*(id==='cat'?.16:.42),id==='cat'?-.045:-.12,z*(id==='cat'?.075:.17)],'leg',{phase:(x===z?0:Math.PI)}),a=kit(l);
  if(id==='cat'){a.sphere(`Curled cat paw ${x} ${z}`,[.09,-.018,z*.015],[.10,.045,.05],coat,0);}
  else{a.cylinder(`${id} upper leg ${x} ${z}`,[0,-.12,0],.075,.045,.28,coat,7);a.cylinder(`${id} lower leg ${x} ${z}`,[.025,-.33,0],.038,.03,.24,id==='sheep'?'#6c675d':coat,6);a.box(`${id} hoof ${x} ${z}`,[.065,-.46,0],[.15,.09,.10],'#3a3832',.014);}
 }
 const tail=bone(bodyBone,'Tail',[-.59,0,0],'tail',{amount:id==='cat'?.05:.18,speed:1.2}),t=kit(tail);
 if(id==='cat'){tail.position.x=-.27;tube(t,'Curled sleeping cat tail',[[0,0,0],[-.07,-.04,.10],[.02,-.09,.18],[.20,-.09,.12]],.035,coat,7);}
 else if(id==='sheep')t.sphere('Short sheep tail',[0,-.06,0],[.10,.15,.10],coat,0);
 else{tube(t,`${id} tail`,[[0,0,0],[-.08,-.22,0],[-.11,-.48,.02]],id==='horse'?.055:.017,'woodDark',6);if(id==='cow')t.sphere('Cow tail tuft',[-.11,-.47,.02],[.04,.09,.037],'woodDark',0);}
 root.userData.rig='Quadruped';return root;
}

export function bird(id,{perched=false}={}) {
 const root=new THREE.Group();root.name=`${id} shared bird rig`;const tall=id==='heron',flying=id==='kestrel',crow=id==='crow';
 const color=tall?'#929e9c':crow?'#303940':flying?'#a8794d':'#87664a';
 const rigRoot=bone(root,'root'),body=bone(rigRoot,'body',[0,tall?.67:.22,0],'breath',{amount:.01}),k=kit(body);
 k.sphere(`${id} feathered body`,[0,0,0],[tall?.18:.22,tall?.18:.14,.13],color,1);
 const neck=bone(body,'neck',[.14,.05,0],'head',{amount:.018}),q=kit(neck);
 if(tall)tube(q,'Heron folded S neck',[[0,0,0],[.09,.12,0],[0,.27,0],[.04,.43,0],[.17,.46,0]],.047,'#c1c6b9',7);
 else q.sphere(`${id} neck`,[.025,.085,0],[.077,.105,.077],crow?'#303940':color,1);
 const hp=tall?[.19,.46,0]:[.08,.16,0],head=bone(neck,'head',hp),h=kit(head);
 h.sphere(`${id} head`,[0,0,0],[.085,.077,.075],tall?'#d0d0bd':crow?'#303940':color,1);
 const beakJoint=bone(head,'beak',[.10,-.016,0]),bk=kit(beakJoint);
 const beak=bk.cone(`${id} ${id==='duck'?'broad bill':'pointed beak'}`,[tall?.045:.01,0,0],id==='duck'?.044:.024,tall?.25:.14,crow?'black':'#b69a55',id==='duck'?4:6);beak.rotation.z=-Math.PI/2;if(id==='duck')beak.scale.z=1.3;
 for(const z of [-1,1])h.sphere(`${id} eye ${z}`,[.043,.012,z*.064],[.015,.015,.007],'black',0);
 if(tall){h.beam('Heron black crown stripe',[-.10,.078,-.033],[.05,.068,-.033],.018,.018,'black');h.beam('Heron crest plume',[-.08,.078,0],[-.24,.058,0],.012,.012,'black');}
 for(const side of [-1,1]){
  const suffix=side<0?'L':'R',wing=bone(body,`wing${suffix}`,[0,.03,side*.09],'flap',{axis:'x',amount:.7,phase:side<0?Math.PI:0}),a=kit(wing);
  if(flying)a.sphere(`${id} wing ${side}`,[-.03,0,side*.18],[.21,.045,.25],color,0);
  else a.sphere(`${id} folded wing ${side}`,[-.025,-.005,side*.044],[.22,.115,.060],crow?'#242d33':tall?'#647c83':'#6e5239',1);
  const wingTip=bone(wing,`wingTip${suffix}`,flying?[-.02,0,side*.31]:[-.14,-.03,side*.055]),tip=kit(wingTip);
  for(let i=0;i<5;i++){
   const feather=tip.sphere(`${id} ${flying?'flight':'folded'} feather ${side} ${i}`,flying?[-.15+i*.064,0,side*.065]:[-.028-i*.007,.026-i*.011,side*i*.004],flying?[.048,.018,.14]:[.12,.022,.025],crow?'black':flying?(i%2?'#6d5845':color):'#8d8164',0);
   feather.rotation.y=flying?side*(.2+i*.1):side*.1;
  }
  const len=tall?.54:.12,leg=bone(body,`leg${suffix}`,[.02,-.1,side*.075],'leg',{phase:side<0?0:Math.PI}),l=kit(leg);
  l.beam(`${id} shin ${side}`,[0,0,0],[.012,-len,0],tall?.014:.018,.018,tall?'#776b4b':'#bc9251');
  const foot=bone(leg,`foot${suffix}`,[.012,-len,0]),f=kit(foot);
  for(let i=-1;i<=1;i++)f.beam(`${id} toe ${side} ${i}`,[0,0,0],[.09,0,i*.035],.013,.013,'#ad8b4a');
  if(id==='duck')f.sphere(`Duck webbed foot ${side}`,[.043,0,.003],[.09,.009,.046],'#bc9251',0);
 }
 const tail=bone(body,'tail',[-.16,-.015,0],'tail',{amount:.035}),r=kit(tail);
 for(let i=-2;i<=2;i++){const feather=r.sphere(`${id} attached tail feather ${i}`,[-.085,-.004,i*.019],[.14,.026,.027],crow?'black':color,0);feather.rotation.y=i*.065;}
 root.userData.rig='Bird';root.userData.rigSignature='root/body/neck/head/beak/tail/wingL/wingTipL/legL/footL/wingR/wingTipR/legR/footR';return root;
}

function dragonfly(){
 const root=new THREE.Group();root.name='Dragonfly articulated hover';const body=bone(root,'Body',[0,.025,0],'hover',{amount:.008,speed:2.5}),k=kit(body);
 k.sphere('Dragonfly thorax',[0,0,0],[.012,.01,.009],'#4b8c91',1);k.sphere('Dragonfly abdomen',[-.025,0,0],[.03,.004,.004],'#3f727c',1);
 for(let i=0;i<7;i++)k.torus(`Abdomen segment ring ${i}`,[-.012-i*.006,0,0],.004,.0007,'#b1bf8b',[0,Math.PI/2,0],6);
 for(const z of [-1,1]){k.sphere(`Dragonfly compound eye ${z}`,[.013,.002,z*.005],[.006,.006,.004],'#6c9875',1);for(const x of [-1,1]){const wing=bone(body,`Wing ${x} ${z}`,[x*.007,0,0],'flap',{amount:.5,phase:z>0?0:Math.PI,speed:18}),q=kit(wing);q.sphere(`Translucent wing ${x} ${z}`,[x*.009,0,z*.025],[.009,.001,.029],'#b9d4c6',0);q.beam(`Wing leading vein ${x} ${z}`,[0,0,0],[x*.015,0,z*.054],.0008,.0008,'#6d9184');}}
 return root;
}

export function buildAnimal(id){
 if(['cat','sheep','cow','horse'].includes(id))return quadruped(id);
 if(['duck','heron','kestrel'].includes(id))return bird(id);
 if(id==='dragonfly')return dragonfly();
 const root=new THREE.Group(),k=kit(root);
 if(id==='crow_on_post'){
  k.beam('Weathered fence post',[0,0,0],[0,1.16,0],.11,.11,'woodDark');const crow=bird('crow',{perched:true});crow.scale.setScalar(.45);crow.position.y=1.15;root.add(crow);
 } else if(id==='mill_cart_horse'){
  wagon(k,'Mill cart',[-1.4,0,0]);const horse=quadruped('horse');horse.position.set(2.2,0,0);root.add(horse);
  for(const z of [-.3,.3])k.beam(`Mill cart trace ${z}`,[.25,.8,z],[2.27,.84,z],.018,.018,'woodDark');
  k.torus('Horse padded collar',[2.65,.77,0],.26,.04,'woodDark',[0,Math.PI/2,0],14).scale.y=1.3;
 }
 return root;
}
