import {THREE,kit,plank,tube,lantern,ladder,TAU,motion} from './shared.js';
import {wagon,barrel} from './construction.js';
import {bell} from './river.js';
import {lettering} from './lettering.js';

export const storyBuilders={crossroads_gibbet:crossroadsGibbet,beacon_brazier:beaconBrazier,lantern_hook:lanternHook,wanted_poster:wantedPoster,gibbet_cage:gibbetCage,tripwire,stolen_goods:stolenGoods,maypole,legion_barrier:legionBarrier,watch_fire:watchFire,road_sign:roadSign,tithe_wagon:titheWagon};
function model(name,fn){const g=new THREE.Group();g.name=name;fn(kit(g));return g;}

export function cage(k,name,p,r=.28,h=1.4){
 const g=k.group(name,p),q=kit(g);
 for(let i=0;i<12;i++){
  const a=i/12*TAU,x=Math.cos(a)*r,z=Math.sin(a)*r;
  tube(q,`${name} curved iron bar ${i}`,[[x*.5,0,z*.5],[x,.18,z],[x,h*.75,z],[x*.58,h*.95,z*.58],[0,h,0]],.013,'iron',6);
 }
 for(const y of [.15,h*.42,h*.73])q.torus(`${name} iron band ${y}`,[0,y,0],r,.02,'iron',[Math.PI/2,0,0],20);
 for(let i=-2;i<=2;i++)q.beam(`${name} empty floor grate ${i}`,[-r*.75,.10,i*r*.27],[r*.75,.10,i*r*.27],.019,.019,'iron');
 q.box(`${name} door latch`,[r*.06,h*.43,r+.014],[.09,.05,.03],'rust');
 for(let i=0;i<5;i++)q.torus(`${name} suspension chain ${i}`,[0,h+.035+i*.052,0],.033,.009,'iron',i%2?[0,Math.PI/2,0]:[0,0,0],10);
 return g;
}
function crossroadsGibbet(){return model('Kingsroad gibbet and notice',k=>{
 k.beam('Tall gibbet upright',[-.13,0,0],[-.13,4.38,0],.17,.17,'woodDark');k.beam('Gibbet projecting arm',[-.23,4.25,0],[.35,4.25,0],.17,.17,'wood');k.beam('Gibbet arm diagonal brace',[-.13,3.65,0],[.28,4.24,0],.08,.08,'wood');
 const hanging=motion(k.group('Empty swinging gibbet',[.20,2.52,0]),'sway',{amount:.03,speed:.7});cage(kit(hanging),'Crossroads iron cage',[0,0,0],.21,1.2);
 k.box('Legion notice parchment',[-.13,1.82,.094],[.23,.36,.004],'plaster',0);k.sphere('Notice nail',[-.13,1.96,.10],[.012,.012,.004],'iron',0);
});}
function brazier(k,name,p,scale=.65,lit=false){
 const g=k.group(name,p),q=kit(g);
 q.cylinder(`${name} basket floor`,[0,.07,0],scale*.33,scale*.24,.09,'iron',12);
 for(let i=0;i<12;i++){const a=i/12*TAU;q.beam(`${name} iron basket bar ${i}`,[Math.cos(a)*scale*.24,.06,Math.sin(a)*scale*.24],[Math.cos(a)*scale*.48,scale*.61,Math.sin(a)*scale*.48],scale*.035,scale*.035,'iron');}
 for(const [y,r] of [[.18,.29],[.58,.47]])q.torus(`${name} basket hoop ${y}`,[0,scale*y,0],scale*r,scale*.029,'iron',[Math.PI/2,0,0],20);
 if(lit){
  for(let i=0;i<6;i++){const a=i/6*TAU;q.beam(`${name} charred log ${i}`,[Math.cos(a)*scale*.20,.13,Math.sin(a)*scale*.20],[Math.cos(a+2.2)*scale*.22,.20,Math.sin(a+2.2)*scale*.22],scale*.10,scale*.08,'coal');}
  q.rock(`${name} glowing embers`,[0,.19,0],[scale*.23,.05,scale*.23],'ember',1);
  for(let i=0;i<5;i++)q.cone(`${name} fire tongue ${i}`,[(i%3-1)*scale*.09,scale*.42+(i%2)*.07,Math.sin(i)*scale*.12],scale*.085,scale*(.4+i*.04),i%2?'flame':'ember',5);
  g.userData.effectSockets=[{effect:'fire',position:[0,scale*.3,0]}];
 }
 return g;
}
function beaconBrazier(){return model('Unlit hilltop beacon',k=>{
 k.cylinder('Beacon support post',[0,2.1,0],.14,.2,4.2,'woodDark',9);k.box('Beacon stone footing',[0,.14,0],[.62,.28,.62],'stone');brazier(k,'Beacon basket',[0,4.08,0],1.16,false);
 ladder(k,'Beacon access ladder',[-.14,0,.63],[-.14,4.20,.23],.48,14);
 for(const z of [-1,1])k.beam(`Beacon basket support ${z}`,[0,3.78,0],[0,4.18,z*.40],.055,.055,'iron');
});}
function lanternHook(){return model('Miner lantern on iron hook',k=>{
 k.beam('Lantern timber stake',[0,0,0],[0,1.64,0],.07,.07,'woodDark');tube(k,'Curled iron lantern hook',[[0,1.55,0],[.05,1.76,0],[.17,1.76,0],[.20,1.66,0],[.16,1.63,0]],.013,'iron',8);lantern(k,'Lit miner lantern',[.15,1.40,0],.27,true);
});}
function wantedPoster(){return model('Paintable highwayman wanted poster',k=>{
 k.box('Weathered parchment sheet',[0,.29,0],[.4,.58,.004],'plaster',0);
 for(const x of [-.16,.16])k.sphere(`Poster iron nail ${x}`,[x,.54,.006],[.012,.012,.004],'iron',0);
 // The portrait is authored artwork. No bounty amount is supplied by the source.
 k.sphere('Printed highwayman face',[0,.35,.009],[.071,.084,.002],'#715c44',1);k.box('Printed broad hat brim',[0,.424,.011],[.22,.023,.002],'woodDark',0);k.box('Printed highwayman hat crown',[0,.455,.011],[.11,.065,.002],'woodDark',.012);
 const coat=new THREE.Shape();coat.moveTo(-.12,.21);coat.lineTo(-.08,.29);coat.lineTo(0,.27);coat.lineTo(.08,.29);coat.lineTo(.12,.21);coat.closePath();const portrait=k.mesh('Printed coat silhouette',new THREE.ShapeGeometry(coat),'woodDark');portrait.position.z=.01;
 for(const x of [-.025,.025])k.box(`Portrait eye ${x}`,[x,.366,.013],[.018,.006,.002],'black',0);
 k.box('Unresolved bounty inscription field',[0,.13,.007],[.29,.047,.002],'whitewash',0);
 k.root.userData.unresolvedContent=['The source requests a price but supplies no bounty amount. The price field is unpainted.'];
});}
function gibbetCage(){return model('Empty suspended iron cage',k=>{const g=motion(k.group('Suspended gibbet cage'),'sway',{amount:.02,speed:.6});cage(kit(g),'Gibbet cage',[0,0,0],.28,1.43);});}
function tripwire(){return model('Camp trip cord and bells',k=>{
 for(const x of [-1.96,1.96])k.beam(`Tripwire peg ${x}`,[x,0,0],[x,.27,0],.035,.035,'woodDark');tube(k,'Taut alarm cord',[[-1.96,.23,0],[0,.17,0],[1.96,.23,0]],.004,'rope',5);
 for(let i=0;i<5;i++){const x=(i-2)*.64;bell(k,`Tripwire bell ${i}`,[x,.085,0],.12);k.torus(`Tripwire bell loop ${i}`,[x,.184,0],.016,.004,'iron',[0,0,0],8);}
});}
function stolenGoods(){return model('Stolen chest cloth and clock under tarp',k=>{
 k.box('Wooden stolen chest',[0,.30,0],[1.0,.55,.63],'woodDark');k.box('Chest curved lid',[0,.61,0],[1.02,.16,.65],'wood',.06);for(const x of [-.35,.35])k.box(`Chest iron band ${x}`,[x,.64,.04],[.065,.13,.68],'iron');k.box('Chest lock plate',[0,.45,.335],[.11,.15,.018],'brass');
 for(let i=0;i<3;i++){const roll=k.cylinder(`Rolled cloth ${i}`,[-.45+i*.28,.83,-.05],.13,.13,.72,i%2?'blue':'red',10);roll.rotation.x=Math.PI/2;k.torus(`Cloth spiral end ${i}`,[-.45+i*.28,.83,.32],.07,.009,'cloth',[0,0,0],12);}
 k.box('Stolen mantel clock case',[.77,.36,.12],[.32,.61,.24],'wood',.055);const face=k.cylinder('Clock face',[.77,.43,.25],.13,.13,.01,'plaster',20);face.rotation.x=Math.PI/2;
 for(let i=0;i<12;i++){const a=i/12*TAU;k.sphere(`Clock hour mark ${i}`,[.77+Math.cos(a)*.104,.43+Math.sin(a)*.104,.259],[.009,.009,.003],'iron',0);}k.beam('Clock long hand',[.77,.43,.263],[.77,.525,.263],.01,.003,'iron');k.beam('Clock short hand',[.77,.43,.264],[.705,.45,.264],.012,.003,'iron');
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([-.8,.94,-.5,.65,.94,-.5,.58,.89,.20,-.8,.94,-.5,.58,.89,.20,-.76,.83,.27,-.8,.94,-.5,-.76,.83,.27,-.89,.12,.35,-.8,.94,-.5,-.89,.12,.35,-.91,.10,-.59],3));k.mesh('Draped tarp over stolen goods',g,'cloth').material.side=THREE.DoubleSide;
});}
function maypole(){return model('Ribboned village maypole',k=>{
 k.cylinder('Tall maypole',[0,3.9,0],.027,.045,7.8,'woodLight',10);k.sphere('Maypole finial',[0,7.91,0],[.055,.10,.055],'brass',1);
 for(let i=0;i<7;i++){
  const a=i/7*TAU,g=motion(k.group(`Maypole ribbon ${i}`,[Math.cos(a)*.07,7.72,Math.sin(a)*.07]),'sway',{amount:.013,speed:1,phase:i}),q=kit(g),v=[];
  for(let j=0;j<28;j++){const t=j/28,t2=(j+1)/28,y=-t*5.7,x=Math.sin(t*Math.PI*3+i)*.19,z=Math.cos(t*Math.PI*3+i)*.19,y2=-t2*5.7,x2=Math.sin(t2*Math.PI*3+i)*.19,z2=Math.cos(t2*Math.PI*3+i)*.19;v.push(x-.028,y,z,x+.028,y,z,x2+.028,y2,z2,x-.028,y,z,x2+.028,y2,z2,x2-.028,y2,z2);}
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(v,3));q.mesh(`Woven ribbon strip ${i}`,geo,['red','blue','green','straw'][i%4]).material.side=THREE.DoubleSide;
 }
});}
function legionBarrier(){return model('Striped Legion road barrier',k=>{
 for(const x of [-1.7,1.7]){for(const z of [-.26,.26])k.beam(`Barrier trestle leg ${x} ${z}`,[x,0,z],[x,1.0,0],.08,.08,'woodDark');k.beam(`Barrier trestle foot ${x}`,[x,.07,-.30],[x,.07,.30],.075,.075,'wood');}
 k.box('Legion barrier timber',[0,.89,0],[4.8,.27,.12],'whitewash');for(let i=0;i<12;i++){const stripe=k.box(`Legion red stripe ${i}`,[-2.18+i*.40,.89,.067],[.18,.27,.005],'red',0);stripe.rotation.z=-.18;}
 lantern(k,'Barrier warning lantern',[1.6,.86,.17],.30,true);
});}
function watchFire(){return model('Road watch fire and soldier stool',k=>{
 const b=brazier(k,'Lit watch basket',[-.2,.23,0],.72,true);for(const i of [-1,1])for(const z of [-1,1])k.beam(`Watch brazier leg ${i} ${z}`,[-.2+i*.12,.29,z*.12],[-.2+i*.2,0,z*.2],.026,.026,'iron');
 for(const x of [.36,.67])for(const z of [-.14,.14])k.beam(`Soldier stool leg ${x} ${z}`,[x,0,z],[x,.35,z],.045,.045,'wood');plank(k,'Soldier worn stool seat',[.515,.38,0],[.44,.07,.36]);
});}
function roadSign(){return model('Legion black road sign',k=>{
 k.beam('Road sign upright',[0,0,0],[0,2.35,0],.1,.1,'woodDark');k.box('Black Legion road board',[0,1.91,0],[1.2,.45,.07],'black');
 lettering(k,'Legion',[0,1.94,.041],.57,'brass');
 // Brass arrows carry direction without inventing any destination or distance.
 for(const side of [-1,1]){
  k.beam(`Brass direction shaft ${side}`,[side*.36,1.91,.041],[side*.51,1.91,.041],.019,.008,'brass');k.beam(`Brass arrow upper ${side}`,[side*.51,1.91,.041],[side*.44,1.98,.041],.018,.007,'brass');k.beam(`Brass arrow lower ${side}`,[side*.51,1.91,.041],[side*.44,1.84,.041],.018,.007,'brass');
 }
 k.root.userData.unresolvedContent=['Road destinations and distances are not specified by the source.'];
});}
function titheWagon(){return model('Covered tithe wagon with strongbox',k=>wagon(k,'Tithe wagon',[0,0,0],{covered:true}));}
