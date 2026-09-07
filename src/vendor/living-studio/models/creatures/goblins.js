import * as THREE from 'three';
import {Sculpt,createRig,skinSculpt,bakeClips,finishActor,pulse,ease} from './shared.js';
import {rigMotions} from './motions.js';

export function createGoblin(entry){
 const native=new THREE.Group();native.name='Goblin rig';native.userData.rig='goblin';
 const defs=[['root',[0,0,0]],['hips',[0,.53,0],'root'],['spine',[0,.70,0],'hips'],['chest',[0,.88,.035],'spine'],['neck',[0,1,.08],'chest'],['head',[0,1.08,.12],'neck'],['jaw',[0,1.005,.24],'head']];
 for(const side of[-1,1]){const label=side<0?'L':'R';defs.push(['upperArm'+label,[side*.235,.91,0],'chest'],['forearm'+label,[side*.36,.67,.025],'upperArm'+label],['hand'+label,[side*.42,.43,.12],'forearm'+label],['thigh'+label,[side*.10,.53,0],'hips'],['shin'+label,[side*.16,.28,.045],'thigh'+label],['foot'+label,[side*.18,.07,.055],'shin'+label]);}
 const rig=createRig(native,defs),s=new Sculpt(native),warrior=entry.id==='goblinWarrior',skin=warrior?'#697650':'#84915d',cloth=warrior?'#4b493c':'#65513a',width=warrior?1.15:1;
 s.bone='hips';s.ico('Goblin pelvis',[0,.52,0],[.17,.14,.12],cloth);s.loftY('Leather skirt',[[0,.40,.0,.20,.15],[0,.66,.0,.17,.13]],cloth,10);
 s.bone='spine';s.ico('Goblin hunched belly',[0,.70,.03],[.18*width,.22,.145],skin,2);
 s.bone='chest';s.ico('Goblin shoulder girdle',[0,.88,.0],[.24*width,.16,.14],skin,2);s.loftY('Scout leather jerkin',[[0,.68,.01,.18*width,.15],[0,.85,.01,.21*width,.16],[0,.96,.02,.17,.13]],cloth,10);
 s.bone='neck';s.tube('Goblin short neck',[[0,.96,.045],[0,1.07,.12]],.10,skin);
 s.bone='head';s.ico('Goblin large skull',[0,1.12,.13],[.205,.225,.16],skin,2);s.ico('Goblin broad cheeks',[0,1.055,.22],[.19,.12,.105],skin,2);
 s.tube('Goblin hooked nose',[[0,1.13,.27],[0,1.06,.365],[0,1.005,.37]],[[.065,.055],[.055,.045],[.036,.029]],skin,6);
 for(const side of[-1,1]){
  s.mesh('Goblin pointed ear '+side,[[side*.15,1.19,.09],[side*.42,1.29,.025],[side*.26,1.08,.105],[side*.14,1.055,.11],[side*.23,1.145,.02]],[[0,1,2,3],[0,4,1],[1,4,2],[2,4,3]],skin);
  s.mesh('Goblin inner ear '+side,[[side*.20,1.16,.114],[side*.355,1.235,.063],[side*.255,1.10,.126]],[[0,1,2]],'#a79a70');
  s.ico('Goblin recessed eye '+side,[side*.102,1.13,.277],[.066,.050,.038],'#303c29',2);
  s.ico('Goblin amber eye '+side,[side*.106,1.13,.306],[.038,.027,.019],'#bdac65',2);s.ico('Goblin pupil '+side,[side*.107,1.13,.323],[.012,.023,.010],'#161e15',1);
  s.tube('Goblin stern brow '+side,[[side*.046,1.17,.29],[side*.15,1.19,.255]],[.031,.04],skin,6);
 }
 s.bone='jaw';s.ico('Goblin articulated chin',[0,.99,.24],[.13,.073,.086],skin,2);s.tube('Goblin crooked mouth',[[-.115,1.021,.30],[0,1.012,.33],[.115,1.021,.30]],.009,'#3b3528',5);
 for(const side of[-1,1])s.tube('Goblin lower tusk '+side,[[side*.083,.999,.315],[side*.082,1.06,.329]],[.019,0],'#d5c99c',5);
 for(const side of[-1,1]){
  const label=side<0?'L':'R';
  s.bone='upperArm'+label;s.tube('Goblin long upper arm '+label,[[side*.235,.91,0],[side*.36,.67,.025]],[[.080,.085],[.067,.063]],skin,8);
  s.bone='forearm'+label;s.tube('Goblin long forearm '+label,[[side*.36,.67,.025],[side*.42,.43,.12]],[[.065,.069],[.043,.045]],skin,8);s.tube('Goblin wrist binding '+label,[[side*.40,.51,.092],[side*.42,.44,.117]],.059,'#776548');
  s.bone='hand'+label;s.ico('Goblin broad hand '+label,[side*.428,.393,.132],[.072,.069,.043],skin,2);
  for(let i=0;i<4;i++){const x=side*.43+(i-1.5)*.03;s.tube('Goblin long finger '+label+' '+i,[[x,.397,.154],[x,.32,.18],[x,.31,.155]],[.019,.016,.011],skin,5);}
  s.bone='thigh'+label;s.tube('Goblin bent thigh '+label,[[side*.10,.53,0],[side*.16,.28,.045]],[[.084,.085],[.06,.06]],cloth,8);
  s.bone='shin'+label;s.tube('Goblin shin '+label,[[side*.16,.28,.045],[side*.18,.07,.055]],[[.055,.051],[.042,.04]],skin,8);
  s.bone='foot'+label;s.ico('Goblin flat foot '+label,[side*.18,.047,.105],[.076,.047,.117],skin,2);for(let i=0;i<3;i++)s.tube('Goblin toenail '+label+' '+i,[[side*.18+(i-1)*.039,.035,.185],[side*.18+(i-1)*.039,.022,.239]],[.013,0],'#c0b78d',5);
 }
 s.bone='chest';s.tube('Throwing knife bandolier',[[-.18,.95,.113],[0,.80,.178],[.15,.64,.155]],[[.04,.016],[.04,.016],[.04,.016]],'#3c3225',6);
 for(let i=0;i<(warrior?2:4);i++){const x=-.12+i*.065,y=.91-i*.074;s.tube('Bandolier knife handle '+i,[[x,y,.168],[x+.024,y+.074,.17]],.012,'#998157',5);s.tube('Bandolier knife sheath '+i,[[x,y,.17],[x-.025,y-.083,.17]],.023,'#7d6544',5);}
 if(warrior){
  s.bone='head';s.loftY('Scrap iron cap',[[0,1.18,.13,.208,.17],[0,1.34,.115,.16,.145],[.035,1.39,.11,.07,.085]],'#5c5d4c',8);s.tube('Scrap helm brow', [[-.185,1.2,.20],[0,1.218,.3],[.185,1.2,.20]],.022,'#92917a',6);
  s.bone='upperArmR';s.ico('Scrap shoulder plate',[.24,.96,0],[.12,.067,.13],'#5c5d4c',1);
  s.bone='handL';s.ico('Goblin wooden buckler',[-.43,.46,.225],[.19,.19,.035],'#756348',2);s.ring('Goblin buckler rim',[-.43,.46,.257],.184,.016,'#626556','z');s.ico('Goblin buckler boss',[-.43,.46,.277],[.063,.063,.025],'#9a967e',1);
 }
 s.bone='handR';s.tube('Goblin weapon handle',[[.435,.32,.16],[.435,.44,.16]],.026,'#5c4930');s.tube('Goblin weapon guard',[[.37,.445,.16],[.50,.445,.16]],.016,'#959582',5);
 const length=warrior?.44:.23;s.mesh('Goblin steel blade',[[.398,.46,.16],[.435,.46,.145],[.473,.46,.16],[.435,.46,.175],[.435,.46+length,.16]],[[0,1,4],[1,2,4],[2,3,4],[3,0,4],[0,3,2,1]],'#aaa995');
 skinSculpt(s,rig);
 const pose=(name,t)=>{
  const j=rig.joints,rot=(n,x=0,y=0,z=0)=>j[n].rotation.set(x,y,z),sn=Math.sin(t*Math.PI*2),a=pulse(t);
  rot('chest',.1,0,.015*sn);rot('head',-.08,Math.sin(t*Math.PI*2)*.045);rot('upperArmR',warrior?-.06:-.25,0,-.07);rot('forearmR',warrior?-.15:-.5);
  if(['walk','run'].includes(name)){const fast=name==='run';for(const side of[-1,1]){const l=side<0?'L':'R',v=sn*side;rot('thigh'+l,v*(fast?.8:.45));rot('shin'+l,Math.max(0,-v)*(fast?1.0:.58));rot('upperArm'+l,-v*.48);rot('forearm'+l,-.35);}j.root.position.y=Math.abs(sn)*.015;}
  if(name==='swing'){rot('chest',.1,-.4*pulse(t,0,.5)+.7*pulse(t,.35,1));rot('upperArmR',-1.5*pulse(t,0,.6)+.5*pulse(t,.4,1));rot('forearmR',-.7*a);}
  if(['cast','throw'].includes(name)){const wind=pulse(t,0,.60),throwing=pulse(t,.32,.95);rot('upperArmR',-2.25*wind+.70*throwing,0,-.10);rot('forearmR',-1.05*wind);rot('chest',.1,-.32*wind+.4*throwing);rot('head',-.07*wind);}
  if(name==='hurt'){rot('chest',-.35*a,0,.15*a);rot('head',-.3*a);}
  if(name==='die'){const v=ease(t);j.root.position.y=-.28*v;rot('hips',1.4*v,0,.3*v);rot('chest',.3*v);rot('thighL',-.6*v);rot('thighR',-.7*v);rot('shinL',1.1*v);rot('shinR',1.2*v);rot('upperArmL',.2*v,0,-.6*v);rot('upperArmR',.2*v,0,.6*v);}
 };
 const clips=bakeClips(rig,rigMotions.goblin,pose),group=new THREE.Group();group.add(native);native.scale.setScalar(warrior?1:.93);group.userData.features=s.features;
 return finishActor(group,rig,clips,entry);
}
