import * as THREE from 'three';
import {Sculpt,createRig,skinSculpt,bakeClips,finishActor,pulse,ease} from './shared.js';
import {rigMotions} from './motions.js';

const profiles={
 canine:{h:.80,len:1.20,w:.24,leg:.095,head:[0,.87,.80],snout:.27,tail:.72},
 boar:{h:1,len:1.4,w:.39,leg:.12,head:[0,.77,.85],snout:.34,tail:.3},
 rat:{h:.19,len:.5,w:.12,leg:.033,head:[0,.19,.30],snout:.10,tail:.55},
 deer:{h:1.4,len:1.5,w:.25,leg:.060,head:[0,1.98,.95],snout:.19,tail:.22},
};
function skeletonFor(p){
 const{h,len,w,head,tail}=p;
 const d=[['root',[0,0,0]],['spine',[0,h*.85,0],'root'],['chest',[0,h*.93,len*.25],'spine'],['neck',[0,h, len*.41],'chest'],['head',head,'neck'],['jaw',[0,head[1]-.08,head[2]+.07],'head']];
 for(const side of[-1,1])for(const end of[-1,1]){
  const name=(end===1?'front':'rear')+(side<0?'L':'R'),x=side*w*.82,z=end*len*.32;
  d.push([name,[x,h*.83,z],end===1?'chest':'spine'],[name+'Shin',[x,h*.43,z+(end===1?-.04:.10)],name],[name+'Foot',[x,.065,z+.03],name+'Shin']);
 }
 for(let i=0;i<5;i++)d.push(['tail'+i,[0,h*.80-i*tail*.045,-len*.43-i*tail/4],i===0?'spine':'tail'+(i-1)]);
 return d;
}
function pointedEar(s,name,x,y,z,w,h,color){s.mesh(name,[[x-w,y,z],[x+w,y,z],[x+(x<0?-.02:.02),y+h,z-.015],[x,y+.05,z-.075]],[[0,1,2],[0,2,3],[1,3,2],[0,3,1]],color);}
function coatColors(id){return{
 wolf:['#74776b','#a2a392','#454a41'],wildDog:['#8d7654','#c0b08a','#3f4134'],badger:['#4d5149','#d0cebb','#222b28'],fox:['#b46a36','#dbc398','#472f22'],boar:['#48443b','#615b4d','#292e29'],oldGrist:['#625f52','#a4a092','#393f38'],giantRat:['#76695b','#a58c79','#483e37'],fieldMouse:['#96846b','#c7b59a','#635044'],deer:['#a16a41','#d1b896','#573d2a']
}[id];}

export function createQuadruped(entry,options={}){
 const p=entry.id==='badger'?{...profiles.canine,w:.30,head:[0,.84,.68],snout:.12}:profiles[entry.rig],native=new THREE.Group();native.name='Quadruped rig';native.userData.rig=entry.rig;
 const rig=createRig(native,skeletonFor(p)),s=new Sculpt(native),colors=coatColors(entry.id),[coat,light,dark]=colors,{h,len,w,head,leg,tail}=p,id=entry.id;
 s.bone='spine';s.ico('Long ribcage',[0,h*.78,0],[w,h*.31,len*.55],coat,3);
 s.ico('Haunch muscle',[0,h*.72,-len*.33],[w*.99,h*.30,len*.27],coat,2);
 s.bone='chest';s.ico('Deep chest',[0,h*.79,len*.28],[w*1.02,h*.34,len*.26],coat,2);
 if(entry.rig!=='boar')s.ico('Belly underside',[0,h*.56,len*.13],[w*.78,h*.17,len*.29],light,2);
 s.bone='neck';s.tube('Carried neck',[[0,h*.91,len*.31],[0,(h+head[1])*.5,len*.44],head],[[w*.72,w*.74],[w*.6,w*.66],[w*.59,w*.59]],coat,10);
 s.bone='head';const hw=entry.rig==='rat'?.09:entry.rig==='deer'?.115:entry.rig==='boar'?.25:id==='badger'?.205:.18;
 s.ico('Cranium',[0,head[1],head[2]],[hw,hw*.90,hw*1.35],coat,2);
 s.ico('Cheek planes',[0,head[1]-.035,head[2]+hw*.48],[hw*.99,hw*.67,hw*.92],coat,2);
 const snoutZ=head[2]+hw+p.snout*.46,snoutY=head[1]-(entry.rig==='boar'?.09:.035);
 s.tube('Tapered muzzle',[[0,snoutY,head[2]+hw*.55],[0,snoutY-.025,snoutZ+p.snout*.42]],[[hw*.76,hw*.57],[hw*.45,hw*.37]],entry.rig==='boar'?coat:light,10);
 s.ico('Nose leather',[0,snoutY-.017,snoutZ+p.snout*.46],[hw*.46,hw*.33,hw*.25],entry.rig==='boar'?'#776153':'#252b27',2);
 if(entry.rig==='boar')for(const side of[-1,1])s.ico('Nostril '+side,[side*hw*.20,snoutY-.005,snoutZ+p.snout*.64],[hw*.07,hw*.09,.014],dark,1);
 for(const side of[-1,1]){
  s.ico('Dark eye socket '+side,[side*hw*.87,head[1]+hw*.21,head[2]+hw*.5],[hw*.20,hw*.22,hw*.22],dark,2);
  s.ico('Glossy eye '+side,[side*hw*.97,head[1]+hw*.22,head[2]+hw*.61],[hw*.085,hw*.11,hw*.11],id==='wolf'?'#b39c48':'#1d211b',2);
  s.ico('Eye glint '+side,[side*hw*1.03,head[1]+hw*.265,head[2]+hw*.65],[hw*.026,hw*.032,hw*.026],'#e4dfc7',1);
  if(entry.rig==='rat'){
   s.ico('Round ear '+side,[side*hw*.92,head[1]+hw*.87,head[2]-.015],[hw*.68,hw*.80,hw*.21],coat,2);
   s.ico('Pink inner ear '+side,[side*hw*.92,head[1]+hw*.87,head[2]+.007],[hw*.48,hw*.60,hw*.09],'#b08d7f',2);
   for(let i=0;i<4;i++)s.tube('Whisker '+side+' '+i,[[side*.04,snoutY-.01,snoutZ+.03],[side*(.18+i*.014),snoutY+(i-1.5)*.023,snoutZ-.01+i*.015]],[.0018,.0008],'#c4b397',4);
  }else if(entry.rig==='deer'){
   s.ico('Long deer ear '+side,[side*.16,head[1]+.14,head[2]-.03],[.16,.07,.072],coat,2);s.ico('Deer inner ear '+side,[side*.18,head[1]+.16,head[2]+.015],[.105,.033,.033],light,2);
  }else if(id==='badger'){
   s.ico('Badger small round ear '+side,[side*.155,head[1]+.135,head[2]-.055],[.06,.055,.035],dark,2);
   s.ico('Badger pale ear rim '+side,[side*.157,head[1]+.15,head[2]-.025],[.043,.035,.010],light,2);
  }else{
   const eh=entry.rig==='boar'?.15:id==='badger'?.08:.25;
   pointedEar(s,'Upright ear '+side,side*hw*.81,head[1]+hw*.56,head[2]-.04,hw*.46,eh,coat);
   pointedEar(s,'Inner ear plane '+side,side*hw*.81,head[1]+hw*.63,head[2]-.012,hw*.28,eh*.68,entry.rig==='boar'?'#8a7460':light);
   if(id==='wildDog'&&side===-1)s.ico('Torn folded mongrel ear',[-hw*.88,head[1]+hw*1.03,head[2]+.055],[hw*.39,.058,.078],dark,1);
  }
 }
 s.bone='jaw';s.tube('Articulated lower jaw',[[0,head[1]-hw*.43,head[2]+.01],[0,snoutY-hw*.33,snoutZ+p.snout*.38]],[[hw*.63,hw*.33],[hw*.34,hw*.18]],light,8);
 if(entry.rig!=='deer')for(const side of[-1,1]){
  s.tube('Lower fang '+side,[[side*hw*.31,snoutY-hw*.26,snoutZ+p.snout*.22],[side*hw*.30,snoutY+hw*.02,snoutZ+p.snout*.23]],[hw*.055,0],'#d5c6a4',5);
 }
 for(const side of[-1,1])for(const end of[-1,1]){
  const name=(end===1?'front':'rear')+(side<0?'L':'R'),x=side*w*.82,z=end*len*.32;
  s.bone=name;s.tube('Upper leg '+name,[[x,h*.82,z],[x,h*.48,z+(end===1?-.04:.10)]],[[leg*1.55,leg*1.5],[leg*.78,leg*.83]],coat,8);
  s.ico('Leg shoulder '+name,[x,h*.79,z],[leg*1.70,leg*1.9,leg*1.75],coat,2);
  s.bone=name+'Shin';s.tube('Lower leg '+name,[[x,h*.46,z+(end===1?-.04:.10)],[x,.075,z+.03]],[[leg*.78,leg*.80],[leg*.61,leg*.63]],entry.rig==='canine'&&id==='fox'?dark:coat,8);
  s.bone=name+'Foot';const hoof=entry.rig==='boar'||entry.rig==='deer',footWidth=leg*(entry.rig==='deer'?.94:hoof?1.10:1.16);
  s.loftY('Tapered grounded paw '+name,[[x,.008,z+leg*.54,footWidth*.80,leg*1.17],[x,.040,z+leg*.46,footWidth,leg*1.25],[x,.10,z+.025,leg*.67,leg*.72]],hoof?dark:coat,8);
  for(let toe=0;toe<(entry.rig==='deer'||entry.rig==='boar'?2:3);toe++){
   const tx=x+(toe-(entry.rig==='deer'||entry.rig==='boar'?.5:1))*leg*.64;
   s.ico('Toe '+name+' '+toe,[tx,.03,z+leg*1.39],[leg*.33,.025,leg*.42],dark,1);
   if(entry.rig!=='deer'&&entry.rig!=='boar')s.tube('Claw '+name+' '+toe,[[tx,.043,z+leg*1.7],[tx,.01,z+leg*1.98]],[leg*.13,0],'#9b9076',5);
  }
 }
 for(let i=0;i<4;i++){
  s.bone='tail'+i;const a=rig.positions['tail'+i].toArray(),b=rig.positions['tail'+(i+1)].toArray();if(id==='fox'){a[0]=i*.095;b[0]=(i+1)*.095;a[1]-=Math.sin(i/4*Math.PI)*.09;b[1]-=Math.sin((i+1)/4*Math.PI)*.09;}
  const brush=id==='fox'?.255:id==='wolf'?.13:id==='wildDog'?.075:id==='badger'?.08:entry.rig==='deer'?.08:entry.rig==='rat'?.018:.022;
  const radius=brush*(1-i*.19);s.tube('Segmented tail '+i,[a,b],[radius,radius*.82],id==='fox'&&i>1?light:entry.rig==='rat'?'#a78877':coat,8);
  if(id==='fox')s.ico('Fox full brush lobe '+i,a.map((v,k)=>(v+b[k])/2),[radius*.95,radius*.85,.205],i>1?light:coat,2);
  if(entry.rig==='rat')for(let k=0;k<3;k++){const t=(k+.2)/3,point=a.map((v,j)=>v+(b[j]-v)*t);s.ring('Tail scale ring '+i+' '+k,point,radius,.002,'#8c7264','z');}
 }
 if(id==='badger'){
  s.bone='head';s.ico('Badger white forehead',[0,head[1]+.069,head[2]+.048],[.15,.135,.21],light,2);
  for(const side of[-1,1]){
   s.ico('Badger black eye stripe '+side,[side*.133,head[1]+.030,head[2]+.142],[.061,.070,.142],dark,2);
   s.ico('Badger visible eye '+side,[side*.172,head[1]+.056,head[2]+.194],[.014,.016,.013],'#201f18',2);
  }
 }
 if(id==='wildDog'){s.bone='spine';s.ico('Mongrel saddle patch',[-.06,h*.94,-.15],[w*.89,.115,.29],dark,2);s.bone='chest';s.ico('Mongrel chest patch',[0,h*.70,len*.40],[.12,.15,.11],light,2);}
 if(id==='wolf'||id==='fox'){
  s.bone='neck';for(let i=0;i<8;i++){const x=(i%2?1:-1)*(.12+(i%3)*.03);s.tube('Angular neck fur '+i,[[x,h*.99,len*.39],[x*1.15,h*.75-(i%4)*.04,len*.22]],[.09,0],i%3===0?light:coat,5);}
 }
 if(entry.rig==='boar'){
  s.bone='spine';for(let i=0;i<17;i++){const z=-len*.42+i*len*.051;s.tube('Spine bristle '+i,[[0,h*1.02,z],[.016*Math.sin(i),h*1.20+Math.sin(i*.8)*.025,z-.045]],[.026,0],id==='oldGrist'?light:dark,5);}
  s.bone='head';for(const side of[-1,1]){
   const broken=id==='oldGrist'&&side===1;
   s.tube('Curved tusk '+side,[[side*.18,head[1]-.17,head[2]+.15],[side*.27,head[1]-.13,head[2]+.25],[side*.33,head[1]+(broken?-.03:.10),head[2]+.26],[side*.30,head[1]+(broken?.01:.21),head[2]+.20]],[.064,.052,.027,broken?.024:0],'#cabe9c',7);
  }
  if(id==='oldGrist'){s.bone='chest';for(let i=0;i<3;i++)s.tube('Old Grist healed shoulder scar '+i,[[.35,h*.95-i*.055,.33],[.40,h*.77-i*.055,.44]],[.012,.008],'#ac9980',5);}
 }
 if(entry.rig==='rat'){
  s.bone='spine';for(let i=0;i<8;i++)s.ico('Sparse mangy fur tuft '+i,[Math.sin(i*3)*w*.7,h*.98,-len*.34+i*len*.082],[.026,.041,.04],i%3?coat:light,1);
  if(id==='giantRat'){s.bone='jaw';s.tube('Wet mouth saliva',[[.025,snoutY-.036,snoutZ+.07],[.024,snoutY-.09,snoutZ+.075]],[.003,.001],'#b6c2ab',5);}
 }
 if(entry.rig==='deer'){
  s.bone='head';if(options.antlers!=='doe')for(const side of[-1,1]){
   const main=[[side*.06,head[1]+.12,head[2]-.06],[side*.13,head[1]+.33,head[2]-.13],[side*.29,head[1]+.54,head[2]-.22],[side*.38,head[1]+.73,head[2]-.32]];
   s.tube('Stag antler beam '+side,main,[.041,.034,.025,0],'#ad9e7b',7);
   for(let i=0;i<3;i++)s.tube('Stag antler tine '+side+' '+i,[main[i], [main[i][0]+side*.04,main[i][1]+.19,main[i][2]+.15]],[.024-i*.005,0],'#bdaf8c',6);
  }
  s.bone='spine';for(const side of[-1,1])s.ico('Pale rump patch '+side,[side*.13,h*.77,-len*.47],[.13,.18,.065],light,2);
 }
 skinSculpt(s,rig);
 const pose=(name,t)=>{
  const j=rig.joints,sn=Math.sin(t*Math.PI*2),gait=['walk','run','lope','scurry','charge','throwCharge','flee','bolt','approach'].includes(name),fast=['run','lope','scurry','charge','throwCharge','flee','bolt'].includes(name),a=pulse(t),rot=(n,x=0,y=0,z=0)=>j[n].rotation.set(x,y,z);
  j.chest.scale.y=1+Math.sin(t*Math.PI*2)*.017;rot('head',entry.rig==='boar'?.11+sn*.045:entry.rig==='deer'?.18+sn*.035:sn*.025,Math.sin(t*Math.PI*2)*.04);
  for(let i=0;i<5;i++)rot('tail'+i,0,Math.sin(t*Math.PI*2-i*.4)*.12);
  if(gait){
   const amplitude=fast?.72:.37;
   for(const side of[-1,1])for(const end of[-1,1]){const n=(end===1?'front':'rear')+(side<0?'L':'R');const phase=fast?(end===1?.15:Math.PI)+(side===1?.30:0):(side*end===1?0:Math.PI),v=Math.sin(t*Math.PI*2+phase);rot(n,v*amplitude);rot(n+'Shin',Math.max(0,-v)*(fast?.95:.48));rot(n+'Foot',-v*amplitude*.25);}
   j.root.position.y+=fast?Math.abs(Math.sin(t*Math.PI*2))*.035:Math.abs(Math.sin(t*Math.PI*2))*.007;
  }
  if(['bite','gore','throwCharge'].includes(name)){rot('neck',-.45*a);rot('head',-.28*a);rot('jaw',.5*a);j.root.position.z+=a*.10;}
  if(['charge','throwCharge'].includes(name)){rot('neck',.22);rot('head',.30-(name==='throwCharge'?.8*pulse(t,.5,.9):0));}
  if(name==='howl'){rot('neck',-.40*a);rot('head',-.52*a);rot('jaw',.32*a);}
  if(name==='circle'){j.root.rotation.y=sn*.22;rot('head',0,-sn*.18);}
  if(name==='flee')for(let i=0;i<5;i++)rot('tail'+i,-.18,0,0);
  if(name==='wake'){j.root.position.y=-h*.35*(1-ease(t));rot('head',.34*(1-ease(t)));}
  if(name==='freeze'){rot('head',-.06,0,0);j.chest.scale.y=1;}
  if(entry.rig==='deer'&&name==='idle'){rot('neck',.54+.05*sn);rot('head',.22);}
  if(name==='startle'){rot('neck',-.32*a);rot('head',-.21*a);j.root.position.y=.08*a;}
  if(name==='hurt'){rot('spine',0,0,-.12*a);rot('neck',-.2*a);}
  if(name==='die'){const v=ease(t);j.root.position.y=-h*.51*v;rot('spine',0,0,1.4*v);rot('head',.15*v);for(const side of[-1,1])for(const end of[-1,1]){const n=(end===1?'front':'rear')+(side<0?'L':'R');rot(n,.45*v,0,side*.4*v);rot(n+'Shin',.8*v);}}
 };
 const clips=bakeClips(rig,rigMotions[entry.rig],pose),group=new THREE.Group();group.add(native);
 const scale=id==='oldGrist'?1.6:id==='wildDog'?.75:id==='badger'?.5:id==='fox'?.66:id==='fieldMouse'?.1:1;native.scale.setScalar(scale);if(id==='badger')native.scale.set(scale*1.2,scale*.8,scale);if(id==='fox')native.scale.x*=.86;
 group.userData.features=s.features;group.userData.shoulderHeight=p.h*native.scale.y;group.userData.scaleRelativeToRig=scale;
 return finishActor(group,rig,clips,entry,{variants:entry.rig==='deer'?{antlers:options.antlers??'stag'}:{}});
}
