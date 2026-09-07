import * as THREE from 'three';
import {Sculpt,createRig,skinSculpt,bakeClips,finishActor,pulse,ease} from './shared.js';
import {rigMotions} from './motions.js';

export function createBird(entry){
 const id=entry.id,goose=id==='goose',hawk=id==='hawk',native=new THREE.Group();native.name='Bird rig';native.userData.rig='bird';
 const h=goose?.70:hawk?.44:.34,bodyY=h*.38,headY=goose?h*.84:h*.77,headZ=goose?.17:.145,bodyLen=goose?.28:.22;
 const defs=[['root',[0,0,0]],['body',[0,bodyY,0],'root'],['neck',[0,bodyY+.06,.12],'body'],['head',[0,headY,headZ],'neck'],['beak',[0,headY-.016,headZ+.05],'head'],['tail',[0,bodyY,-bodyLen*.74],'body']];
 for(const side of[-1,1]){const label=side<0?'L':'R';defs.push(['wing'+label,[side*.09,bodyY+.035,0],'body'],['wingTip'+label,[side*.155,bodyY+.015,-.11],'wing'+label],['leg'+label,[side*.055,bodyY-.02,0],'body'],['foot'+label,[side*.065,.025,.015],'leg'+label]);}
 const rig=createRig(native,defs),s=new Sculpt(native),coat=goose?'#d4d2bc':hawk?'#74634d':'#303d3b',light=goose?'#ece6d0':hawk?'#c4b18c':'#465551',dark=goose?'#a5a899':hawk?'#433f33':'#1e2a29',beak=goose?'#b18445':hawk?'#9f8b52':'#464d3e';
 s.bone='body';s.ico('Bird rounded body',[0,bodyY,0],[goose?.135:.105,goose?.14:.095,bodyLen],coat,3);s.ico('Bird pale breast',[0,bodyY+.007,.10],[goose?.114:.085,goose?.125:.092,.13],light,2);
 s.bone='neck';s.tube('Bird curved neck',[[0,bodyY+.065,.13],[0,(bodyY+headY)*.5,headZ-.035],[0,headY,headZ]],[[goose?.073:.060,goose?.079:.059],[goose?.040:.047,goose?.044:.05],[.046,.048]],coat,10);
 s.bone='head';s.ico('Bird head',[0,headY,headZ],[goose?.064:.058,goose?.067:.053,goose?.075:.063],coat,2);
 for(const side of[-1,1]){
  s.ico('Bird eye socket '+side,[side*.049,headY+.015,headZ+.027],[.014,.014,.015],dark,2);
  s.ico('Bird glossy eye '+side,[side*.055,headY+.017,headZ+.033],[.008,.009,.009],hawk?'#b69c5b':'#171f1d',2);
  s.ico('Bird eye catchlight '+side,[side*.060,headY+.020,headZ+.037],[.0025,.0025,.0025],'#dddcc5',1);
  if(hawk)s.tube('Raptor brow '+side,[[side*.031,headY+.034,headZ+.056],[side*.065,headY+.032,headZ+.015]],.009,dark,5);
 }
 s.bone='beak';
 if(goose){s.ico('Goose broad beak',[0,headY-.014,headZ+.105],[.038,.022,.060],beak,2);s.ico('Goose bill nail',[0,headY-.019,headZ+.156],[.021,.012,.013],dark,1);}
 else s.tube('Pointed hooked beak',[[0,headY-.008,headZ+.043],[0,headY-.008,headZ+.098],[0,headY-(hawk?.044:.018),headZ+.111]],[[.026,.027],[.013,.016],[0,0]],beak,7);
 s.tube('Beak seam',[[-.021,headY-.028,headZ+.060],[0,headY-.030,headZ+.117],[.021,headY-.028,headZ+.060]],.0025,dark,4);
 for(const side of[-1,1]){
  const label=side<0?'L':'R';s.bone='wing'+label;
  // Folded coverts overlap into the primary fan; flight rotates the same bones.
  s.ico('Layered wing shoulder '+label,[side*.13,bodyY+.012,-.07],[.065,.076,bodyLen*.75],coat,2);
  for(let i=0;i<7;i++)s.tube('Wing covert feather '+label+' '+i,[[side*(.10+i*.012),bodyY+.058-i*.008,.055-i*.026],[side*(.16+i*.009),bodyY-.002-i*.006,-.145-i*.018]],[[.017,.013],[.010,0]],i%3?coat:light,6);
  s.bone='wingTip'+label;
  s.ico('Overlapping primary wing fan '+label,[side*.159,bodyY-.012,-.185],[.054,.041,.12],coat,2);
  for(let i=0;i<8;i++){
   const root=[side*(.136+i*.006),bodyY+.007-i*.003,-.122],tip=[side*(.134+i*.011),bodyY-.031-i*.005,-.31+i*.009];
   s.tube('Wing primary feather '+label+' '+i,[root,tip],[[.016,.011],[.007,.003]],i%2?dark:coat,6);
   if(hawk)for(let band=0;band<2;band++){const t=.38+band*.24,center=root.map((v,k)=>v+(tip[k]-v)*t);s.tube('Hawk barred primary '+label+' '+i+' '+band,[[center[0]-.015,center[1]+.002,center[2]],[center[0]+.015,center[1]+.002,center[2]]],.006,light,4);}
  }
  s.bone='leg'+label;s.tube('Bird scaled leg '+label,[[side*.055,bodyY-.02,0],[side*.060,.07,-.016],[side*.065,.025,.015]],[.013,.009,.008],beak,6);
  for(let i=0;i<3;i++)s.ring('Leg scale ring '+label+' '+i,[side*.063,.035+i*.012,.007-i*.003],.009,.0018,dark);
  s.bone='foot'+label;
  for(let i=0;i<3;i++)s.tube('Bird grounded toe '+label+' '+i,[[side*.065,.020,.015],[side*.065+(i-1)*.025,.009,.081-(Math.abs(i-1))*.010]],[.008,.004],beak,5);
  if(goose)s.mesh('Goose webbed foot '+label,[[side*.065,.018,.014],[side*.065-.033,.007,.07],[side*.065,.008,.09],[side*.065+.033,.007,.07]],[[0,1,2,3]],beak);
  else for(let i=0;i<3;i++)s.tube('Raptor curved talon '+label+' '+i,[[side*.065+(i-1)*.025,.012,.077],[side*.065+(i-1)*.024,.002,.091]],[.004,0],dark,4);
 }
 s.bone='tail';for(let i=0;i<7;i++)s.tube('Tail feather '+i,[[(i-3)*.015,bodyY,-bodyLen*.70],[(i-3)*.025,bodyY+.02,-bodyLen- (hawk?.17:.085)]],[[.015,.012],[.01,.005]],i%2?dark:coat,6);
 if(hawk){
  s.bone='body';
  const breast=s.root.getObjectByName('Bird pale breast'),ray=new THREE.Raycaster();breast.updateMatrixWorld(true);
  const breastSurface=(x,y)=>{
   const envelope=.10+.13*Math.sqrt(Math.max(0,1-(x/.085)**2-((y-bodyY-.007)/.092)**2));
   ray.set(new THREE.Vector3(x,y,envelope+.03),new THREE.Vector3(0,0,-1));
   const hit=ray.intersectObject(breast,false)[0];if(!hit)throw new Error('Hawk breast marking missed its surface');
   return [x,y,hit.point.z+.0015];
  };
  for(let i=0;i<13;i++){
   const x=Math.sin(i*2.4)*.055,y=bodyY-.025+(i%5)*.020;
   s.tube('Hawk breast barring '+i,[breastSurface(x-.005,y),breastSurface(x,y-.007),breastSurface(x+.005,y-.014)],[.0025,.0028,.0016],dark,5);
  }
 }
 skinSculpt(s,rig);
 const pose=(name,t)=>{
  const j=rig.joints,rot=(n,x=0,y=0,z=0)=>j[n].rotation.set(x,y,z),sn=Math.sin(t*Math.PI*2),a=pulse(t);rot('head',sn*.025,Math.sin(t*Math.PI*2)*.07);j.body.scale.y=1+sn*.015;
  if(['walk','run','swim'].includes(name)){const swim=name==='swim';for(const side of[-1,1]){const l=side<0?'L':'R';rot('leg'+l,sn*side*(swim?.55:.50));rot('foot'+l,-sn*side*.35);}rot('body',0,0,sn*(goose?.07:.035));if(!swim)j.root.position.y=Math.abs(sn)*.008;else j.root.position.y=-bodyY*.32;}
  const flying=['fly','takeOff','land','stoop'].includes(name),threat=name==='threat';
  if(flying||threat){
   const envelope=name==='takeOff'?ease(t*2):name==='land'?1-ease((t-.4)/.6):1,flap=name==='stoop'?.15:Math.sin(t*Math.PI*4),spread=(name==='stoop'?.30:1)*envelope;
   for(const side of[-1,1]){const l=side<0?'L':'R';rot('wing'+l,.08,side*.20*spread,side*(.90+flap*.42)*spread);rot('wingTip'+l,.02,side*.10,side*(.7+flap*.16)*spread);rot('leg'+l,1.05*spread);}
   j.root.position.y=threat?.015*a:name==='takeOff'?.50*ease(t):name==='land'?.50*(1-ease(t)):name==='stoop'?.55-.30*a:.50+sn*.03;
   if(name==='stoop'){rot('body',.55*a);rot('head',-.25*a);}if(threat)rot('beak',-.2*a);
  }
  if(name==='hurt')rot('body',-.20*a,0,.16*a);
  if(name==='die'){const v=ease(t);j.root.position.y=-bodyY*.5*v;rot('body',0,0,1.45*v);rot('neck',.4*v);rot('wingL',0,0,-.35*v);rot('wingR',0,0,.3*v);}
 };
 const clips=bakeClips(rig,rigMotions.bird,pose),group=new THREE.Group();group.add(native);group.userData.features=s.features;return finishActor(group,rig,clips,entry);
}
