import * as THREE from 'three';
import {Sculpt,createRig,skinSculpt,bakeClips,finishActor,pulse,ease} from './shared.js';
import {rigMotions} from './motions.js';

export function createCrawler(entry){
 const spider=entry.rig==='spider',native=new THREE.Group();native.name=spider?'Spider rig':'Grub rig';native.userData.rig=entry.rig;
 const defs=[['root',[0,0,0]]];
 if(spider){
  defs.push(['thorax',[0,.45,.12],'root'],['abdomen',[0,.48,-.24],'thorax'],['head',[0,.42,.33],'thorax'],['fangL',[-.085,.36,.43],'head'],['fangR',[.085,.36,.43],'head']);
  for(const side of[-1,1])for(let i=0;i<4;i++){const z=.28-i*.17,x=side*(.57+Math.sin(i/3*Math.PI)*.12),name='leg'+(side<0?'L':'R')+i;defs.push([name,[side*.13,.45,z],'thorax'],[name+'Knee',[x,.66,z+(i<2?.18:-.18)],name],[name+'Tip',[side*(.68+Math.sin(i/3*Math.PI)*.07),.018,z+(i<2?.28:-.27)],name+'Knee']);}
 }else{
  for(let i=0;i<10;i++)defs.push(['segment'+i,[0,.14,-.43+i*.093],i===0?'root':'segment'+(i-1)]);
  defs.push(['head',[0,.145,.47],'segment9'],['jaw',[0,.09,.52],'head']);
 }
 const rig=createRig(native,defs),s=new Sculpt(native);
 if(spider)buildSpider(s,rig);else buildGrub(s,rig);
 skinSculpt(s,rig);
 const pose=(name,t)=>{
  const j=rig.joints,rot=(n,x=0,y=0,z=0)=>j[n].rotation.set(x,y,z),a=pulse(t),sn=Math.sin(t*Math.PI*2),moving=['walk','run','crawl'].includes(name);
  if(spider){
   rot('abdomen',Math.sin(t*Math.PI*2)*.025);j.thorax.position.y+=sn*.006;
   for(const side of[-1,1])for(let i=0;i<4;i++){const n='leg'+(side<0?'L':'R')+i,v=Math.sin(t*Math.PI*2+i*Math.PI*.9+(side<0?Math.PI:0));if(moving){rot(n,v*.09,v*.22,Math.max(0,v)*side*.18);rot(n+'Knee',0,0,-Math.max(0,v)*side*.24);}else rot(n,0,Math.sin(t*Math.PI*2+i)*.012,0);}
   if(['bite','lunge','cast','webSpit'].includes(name)){rot('head',-.25*a);rot('fangL',-.48*a,0,-.18*a);rot('fangR',-.48*a,0,.18*a);j.root.position.z=(['bite','lunge'].includes(name)?.20:.045)*a;j.root.position.y=.055*a;}
   if(name==='hurt'){rot('thorax',0,0,.17*a);j.root.position.y=.03*a;}
   if(name==='die'){const v=ease(t);j.root.position.y=-.26*v;rot('thorax',0,0,.28*v);for(const side of[-1,1])for(let i=0;i<4;i++){const n='leg'+(side<0?'L':'R')+i;rot(n,0,side*.18*v,side*.75*v);rot(n+'Knee',0,0,-side*1.25*v);}}
  }else{
   for(let i=0;i<10;i++){const v=Math.sin(t*Math.PI*2-i*.64);rot('segment'+i,0,v*(moving?.065:.012),0);j['segment'+i].scale.set(1+(moving?.06:.018)*v,1+(moving?.11:.027)*v,1-(moving?.035:.008)*v);j['segment'+i].position.y+=moving?Math.max(0,v)*.006:0;}
   if(['bite','lunge'].includes(name)){for(let i=4;i<10;i++)rot('segment'+i,-.065*a);rot('head',-.24*a);rot('jaw',.45*a);j.root.position.z=.12*a;}
   if(name==='hurt'){for(let i=0;i<10;i++)rot('segment'+i,0,.045*a);}
   if(name==='die'){const v=ease(t);for(let i=0;i<10;i++){rot('segment'+i,0,.095*v,.055*v);j['segment'+i].scale.y=1-.35*v;}j.root.position.y=-.03*v;}
  }
 };
 const clips=bakeClips(rig,rigMotions[entry.rig],pose),group=new THREE.Group();group.add(native);group.userData.features=s.features;return finishActor(group,rig,clips,entry);
}
function buildSpider(s,rig){
 const coat='#665342',dark='#383d32',light='#a18c61';
 s.bone='thorax';s.ico('Spider armored cephalothorax',[0,.45,.13],[.20,.155,.25],coat,3);
 s.bone='abdomen';s.ico('Spider large abdomen',[0,.48,-.24],[.30,.245,.365],coat,3);
 s.ico('Abdomen dark dorsal saddle',[0,.681,-.27],[.20,.053,.23],dark,2);
 for(let i=0;i<5;i++)s.mesh('Abdomen chevron '+i,[[-.11+i*.009,.692,-.41+i*.071],[0,.733,-.45+i*.071],[.11-i*.009,.692,-.41+i*.071],[0,.742,-.43+i*.071]],[[0,1,2,3]],light);
 s.bone='head';s.ico('Spider head plate',[0,.43,.32],[.17,.12,.145],coat,2);
 for(const side of[-1,1])for(let i=0;i<4;i++){
  const x=side*(.03+i*.033),y=.455+(i%2)*.028,z=.440-Math.abs(x)*.3;
  s.ico('Spider eye mound '+side+' '+i,[x,y,z],[.023,.024,.02],dark,2);s.ico('Spider glossy eye '+side+' '+i,[x,y+.003,z+.012],[.013,.014,.011],'#b09b55',2);
 }
 for(const side of[-1,1]){
  s.bone='fang'+(side<0?'L':'R');s.tube('Spider jointed fang '+side,[[side*.085,.36,.43],[side*.13,.30,.52],[side*.105,.20,.55],[side*.056,.18,.58]],[[.053,.049],[.048,.043],[.02,.019],[0,0]],dark,8);
  s.bone='head';s.tube('Spider pedipalp '+side,[[side*.14,.38,.35],[side*.20,.33,.46],[side*.18,.28,.52]],[.031,.023,.012],light,6);
  for(let i=0;i<4;i++){
   const n='leg'+(side<0?'L':'R')+i,a=rig.positions[n].toArray(),b=rig.positions[n+'Knee'].toArray(),c=rig.positions[n+'Tip'].toArray();
   s.bone=n;s.tube('Spider banded femur '+n,[a,b],[.045,.031],coat,8);s.ico('Spider high knee '+n,b,[.044,.044,.044],dark,2);
   for(let band=0;band<3;band++){const t=.23+band*.24,points=[t-.04,t+.04].map(v=>a.map((x,k)=>x+(b[k]-x)*v));s.tube('Spider femur band '+n+' '+band,points,.04-band*.002,light,8);}
   s.bone=n+'Knee';s.tube('Spider tapered tibia '+n,[b,c],[.032,.011],dark,8);
   for(let band=0;band<2;band++){const t=.20+band*.35,points=[t-.035,t+.035].map(v=>b.map((x,k)=>x+(c[k]-x)*v));s.tube('Spider tibia band '+n+' '+band,points,.029-band*.007,light,8);}
   s.bone=n+'Tip';s.tube('Spider contact claw '+n,[c,[c[0]+side*.021,0,c[2]+.025]],[.012,0],dark,5);
  }
 }
}
function buildGrub(s,rig){
 const pale='#c3bf8e',shade='#9c9d73',dark='#655d42';
 for(let i=0;i<10;i++){
  s.bone='segment'+i;const p=rig.positions[s.bone],r=.08+Math.sin((i+.8)/11*Math.PI)*.037;
  s.ico('Grub fleshy segment '+i,[p.x,p.y,p.z],[r,r,.080],i%3? pale:'#b5b586',2);
  s.ring('Grub segment fold '+i,[0,.14,p.z+.045],r*.81,.008,shade,'z');
  for(const side of[-1,1]){
   s.tube('Grub soft grounded proleg '+side+' '+i,[[side*r*.65,.10,p.z],[side*r*.90,.015,p.z+.012]],[.025,.014],shade,6);
   s.ico('Grub spiracle '+side+' '+i,[side*r*.96,.145,p.z+.005],[.006,.012,.014],dark,1);
  }
 }
 s.bone='head';s.ico('Grub thorned head shield',[0,.16,.47],[.11,.12,.103],shade,2);
 for(let i=0;i<9;i++){const a=i*Math.PI*2/9;const x=Math.cos(a),y=Math.sin(a);s.tube('Grub head thorn '+i,[[x*.083,.16+y*.085,.50],[x*.14,.16+y*.15,.57]],[.024,0],dark,6);}
 for(const side of[-1,1])s.ico('Grub small black eye '+side,[side*.059,.198,.555],[.013,.013,.009],'#222e24',2);
 s.bone='jaw';s.tube('Grub paired mandible L',[[-.055,.12,.54],[-.065,.07,.59],[-.023,.065,.61]],[.029,.025,0],dark,6);s.tube('Grub paired mandible R',[[.055,.12,.54],[.065,.07,.59],[.023,.065,.61]],[.029,.025,0],dark,6);
}
