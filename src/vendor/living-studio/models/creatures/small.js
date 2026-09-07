import * as THREE from 'three';
import {Sculpt,createRig,skinSculpt,bakeClips,finishActor,pulse,ease} from './shared.js';
import {rigMotions} from './motions.js';

export function createSmall(entry){
 const id=entry.id,rabbit=id==='rabbit',frog=id==='frog',native=new THREE.Group();native.name=id+' individual rig';native.userData.rig='small';
 const h=frog?.075:rabbit?.19:.16,len=frog?.14:rabbit?.25:.22;
 const defs=[['root',[0,0,0]],['body',[0,h,-.015],'root'],['chest',[0,h*.95,len*.23],'body'],['head',[0,h*1.40,len*.35],'chest'],['jaw',[0,h*1.24,len*.50],'head']];
 for(const side of[-1,1]){const l=side<0?'L':'R';defs.push(['rear'+l,[side*(frog?.055:.07),h*.66,-len*.29],'body'],['rearFoot'+l,[side*(frog?.082:.075),.020,-len*.13],'rear'+l],['front'+l,[side*(frog?.048:.041),h*.71,len*.24],'chest'],['frontFoot'+l,[side*(frog?.06:.045),.014,len*.46],'front'+l]);if(!frog)defs.push(['ear'+l,[side*.042,h*1.56,len*.31],'head']);}
 if(!frog)for(let i=0;i<4;i++)defs.push(['tail'+i,[0,h*.85+i*(rabbit?.008:.072),-len*.47-i*(rabbit?.012:.025)],i===0?'body':'tail'+(i-1)]);
 const rig=createRig(native,defs),s=new Sculpt(native),coat=frog?'#718957':rabbit?'#ad9b7c':'#a67542',light=frog?'#c2c397':rabbit?'#d1c3a3':'#cfb587',dark=frog?'#394f38':rabbit?'#63594a':'#62492e';
 s.bone='body';s.ico('Rounded '+id+' body',[0,h,-.02],[frog?.075:rabbit?.09:.067,h*.66,len*.48],coat,3);
 s.bone='chest';s.ico('Pale '+id+' breast',[0,h*.89,len*.18],[frog?.060:.055,h*.45,len*.29],light,2);
 s.bone='head';const hy=h*1.40,hz=len*.35,hw=frog?.064:rabbit?.065:.048;
 s.ico(id+' head',[0,hy,hz],[hw,frog?.038:rabbit?.067:.051,frog?.061:rabbit?.073:.060],coat,2);
 if(frog){
  for(const side of[-1,1]){
   s.ico('Frog raised eye mound '+side,[side*.046,hy+.031,hz+.018],[.025,.031,.026],coat,2);s.ico('Frog gold iris '+side,[side*.050,hy+.038,hz+.040],[.018,.020,.013],'#ae9f54',2);s.ico('Frog horizontal pupil '+side,[side*.050,hy+.039,hz+.051],[.014,.006,.005],'#172a20',1);
  }
  s.tube('Frog broad mouth',[[-.061,hy-.011,hz+.041],[0,hy-.02,hz+.064],[.061,hy-.011,hz+.041]],.0025,dark,5);
  s.bone='jaw';s.ico('Frog pale throat pouch',[0,hy-.032,hz+.025],[.047,.025,.039],light,2);
  s.bone='body';for(let i=0;i<11;i++)s.ico('Frog dorsal marking '+i,[Math.sin(i*2.4)*.052,h+.040+(i%2)*.006,-.074+(i%5)*.028],[.011,.004,.014],dark,1);
 }else{
  s.ico('Small muzzle',[0,hy-.028,hz+.056],[hw*.68,.029,.037],light,2);s.ico('Small nose',[0,hy-.017,hz+.088],[.012,.009,.009],rabbit?'#9b7d70':dark,1);
  for(const side of[-1,1]){
   s.ico('Small dark eye '+side,[side*hw*.83,hy+.012,hz+.048],[.013,.015,.011],'#242b24',2);s.ico('Small eye catchlight '+side,[side*hw*.88,hy+.016,hz+.055],[.003,.003,.002],'#e6ddbd',1);
   for(let i=0;i<3;i++)s.tube('Small whisker '+side+' '+i,[[side*.015,hy-.025,hz+.077],[side*.097,hy-.018+(i-1)*.012,hz+.067-i*.010]],[.0013,.0004],light,4);
   s.bone='ear'+(side<0?'L':'R');const ex=side*.042,ey=h*1.56,ez=len*.31;
   if(rabbit){
    s.tube('Rabbit long ear '+side,[[ex,ey,ez],[ex+side*.016,ey+.105,ez-.013],[ex+side*.02,ey+.19,ez-.025]],[[.025,.027],[.027,.027],[.012,.012]],coat,8);
    s.tube('Rabbit inner ear '+side,[[ex,ey+.025,ez+.022],[ex+side*.014,ey+.111,ez+.010],[ex+side*.019,ey+.17,ez-.003]],[[.012,.005],[.014,.005],[.004,.003]],'#b79b8a',6);
   }else{
    s.ico('Squirrel tufted ear '+side,[ex,ey+.034,ez],[.028,.043,.022],coat,2);s.tube('Squirrel ear tuft '+side,[[ex,ey+.057,ez],[ex+side*.005,ey+.088,ez-.012]],[.016,0],dark,5);
   }
   s.bone='head';
  }
 }
 for(const side of[-1,1]){
  const label=side<0?'L':'R',rear=rig.positions['rear'+label],rearFoot=rig.positions['rearFoot'+label],front=rig.positions['front'+label],frontFoot=rig.positions['frontFoot'+label];
  s.bone='rear'+label;s.ico(id+' folded haunch '+label,[rear.x,h*.59,rear.z],[frog?.046:rabbit?.063:.043,h*.48,frog?.065:.08],coat,2);
  s.tube('Small bent rear leg '+label,[rear.toArray(),[rear.x+side*.027,.043,-len*.45],rearFoot.toArray()],[[.033,.033],[.022,.025],[.015,.015]],coat,7);
  s.bone='rearFoot'+label;s.ico('Long hind foot '+label,[rearFoot.x,.018,rearFoot.z+.045],[frog?.025:.023,.018,frog?.049:.067],frog?coat:light,2);
  s.bone='front'+label;s.tube('Small front leg '+label,[front.toArray(),[front.x+side*.014,.045,len*.24],frontFoot.toArray()],[[.022,.027],[.017,.018],[.012,.012]],coat,7);
  s.bone='frontFoot'+label;s.ico('Small front paw '+label,[frontFoot.x,.012,frontFoot.z+.017],[.022,.012,.029],light,2);
  for(const end of['front','rear']){
   s.bone=end+'Foot'+label;const foot=rig.positions[s.bone];for(let i=0;i<(frog?4:3);i++){
    const x=foot.x+(i-(frog?1.5:1))*.01,z=foot.z+(end==='rear'?.088:.039);
    s.tube('Small toe '+end+label+i,[[foot.x,.014,foot.z+.012],[x,.006,z]],[frog?.004:.003,frog?.003:.001],frog?coat:dark,5);
    if(frog)s.ico('Frog round toe pad '+end+label+i,[x,.006,z],[.006,.004,.006],light,1);
   }
  }
 }
 if(!frog)for(let i=0;i<3;i++){
  s.bone='tail'+i;const a=rig.positions['tail'+i],b=rig.positions['tail'+(i+1)];
  if(rabbit){s.ico('Rabbit cotton tail '+i,a.toArray(),[.029,.03,.026],light,2);}
  else {
   const ca=a.clone(),cb=b.clone();ca.z+=i*i*.018;cb.z+=(i+1)*(i+1)*.018;
   const r=i===0?.056:i===1?.079:.068;
   s.tube('Squirrel curved bush tail '+i,[ca.toArray(),cb.toArray()],[[r,r*.87],[r*.90,r*.84]],coat,12);
   const mid=ca.clone().lerp(cb,.5);s.ico('Squirrel rounded tail lobe '+i,mid.toArray(),[r*1.05,r*1.22,r*.94],coat,2);
   s.tube('Squirrel pale tail fringe '+i,[[ca.x-.008,ca.y,ca.z-r*.75],[cb.x-.008,cb.y,cb.z-r*.75]],[[r*.76,.014],[r*.68,.009]],light,8);
  }
 }
 skinSculpt(s,rig);
 const pose=(name,t)=>{
  const j=rig.joints,rot=(n,x=0,y=0,z=0)=>j[n].rotation.set(x,y,z),sn=Math.sin(t*Math.PI*2),a=pulse(t);
  rot('head',sn*.025,Math.sin(t*Math.PI*2)*.07);j.chest.scale.y=1+sn*.017;if(frog)j.jaw.scale.set(1+sn*.07,1+sn*.17,1+sn*.08);
  else{for(const side of[-1,1])rot('ear'+(side<0?'L':'R'),Math.sin(t*Math.PI*2+side)*.05,0,side*.015);for(let i=0;i<4;i++)rot('tail'+i,Math.sin(t*Math.PI*2-i*.45)*.025);}
  if(['walk','run','hop','startle'].includes(name)){
   const hop=Math.max(0,Math.sin(t*Math.PI*2)),crouch=Math.max(0,-Math.sin(t*Math.PI*2));j.root.position.y=hop*(frog?.10:rabbit?.14:.085);rot('body',-.17*hop+.12*crouch);
   for(const side of[-1,1]){const l=side<0?'L':'R';rot('rear'+l,-.70*hop+.45*crouch);rot('rearFoot'+l,.7*hop);rot('front'+l,.55*hop-.23*crouch);rot('frontFoot'+l,-.3*hop);}
  }
  if(name==='climb'){j.root.position.y=.06+.04*sn;rot('body',-.65);for(const side of[-1,1]){const l=side<0?'L':'R';rot('front'+l,-.7+sn*side*.3);rot('rear'+l,.4-sn*side*.3);}}
  if(name==='die'){const v=ease(t);j.root.position.y=-h*.30*v;rot('body',0,0,1.4*v);rot('head',.25*v);for(const side of[-1,1])rot('rear'+(side<0?'L':'R'),.5*v);}
 };
 const clips=bakeClips(rig,rigMotions.small,pose),group=new THREE.Group();group.add(native);if(rabbit)native.scale.setScalar(.82);group.userData.features=s.features;group.userData.individualSkeleton=id;
 return finishActor(group,rig,clips,entry);
}
