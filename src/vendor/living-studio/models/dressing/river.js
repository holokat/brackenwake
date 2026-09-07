import {THREE,kit,plank,tube,TAU,motion,lantern} from './shared.js';
import {rail,wheel} from './construction.js';
import {bird} from './animals.js';

export const riverBuilders={mooring_post:mooringPost,rowing_boat:rowingBoat,eel_trap:eelTrap,millstones,sluice_gate:sluiceGate,plank_walk:plankWalk,flour_sacks:flourSacks,bell_buoy:bellBuoy,duck_pond:duckPond};
function model(name,fn){const g=new THREE.Group();g.name=name;fn(kit(g));return g;}

function mooringPost(){return model('Mooring post rope and iron ring',k=>{
 k.cylinder('Mooring timber post',[0,.52,0],.105,.12,1.04,'woodDark',8);k.cylinder('Post cut top',[0,1.047,0],.102,.102,.012,'endgrain',8);
 k.torus('Mooring iron ring',[0,.75,.13],.105,.015,'iron');for(let i=0;i<4;i++)k.torus(`Rope wrap ${i}`,[0,.3+i*.03,0],.122,.012,'rope',[Math.PI/2,0,0],16);
 tube(k,'Loose mooring rope',[[.09,.29,.04],[.16,.15,.10],[.13,.02,.13],[-.09,.02,.09],[-.13,.02,-.1],[.04,.02,-.14],[.13,.02,-.05]],.012,'rope',6);
});}
function rowingBoat(){return model('Sound rowing boat with oars',k=>{
 const sections=[[-1.85,.035,.55],[-1.35,.48,.62],[-.55,.69,.67],[.55,.69,.67],[1.35,.47,.62],[1.85,.035,.57]];
 for(const side of [-1,1])for(let row=0;row<4;row++){
  const v=[];for(let i=0;i<sections.length-1;i++){
   const a=sections[i],b=sections[i+1],p=t=>[a[0],.10+(a[2]-.10)*t,side*a[1]*(.36+.64*t)],q=t=>[b[0],.10+(b[2]-.10)*t,side*b[1]*(.36+.64*t)],lo=row/4,hi=(row+1)/4;
   v.push(...p(lo),...q(lo),...q(hi),...p(lo),...q(hi),...p(hi));
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(v,3));k.mesh(`Clinker hull strake ${side} ${row}`,geo,row%2?'wood':'woodLight').material.side=THREE.DoubleSide;
  tube(k,`Hull strake overlap ${side} ${row}`,sections.map(a=>[a[0],.10+(a[2]-.1)*(row+1)/4,side*a[1]*(.36+.64*(row+1)/4)]),.016,'woodDark',5);
 }
 k.beam('Boat keel',[-1.84,.085,0],[1.84,.085,0],.1,.08,'woodDark');
 for(let i=0;i<9;i++){const x=(i-4)*.34,z=.22+Math.sqrt(Math.max(0,1-(x/1.8)**2))*.28;k.box(`Boat floor board ${i}`,[x,.13,0],[.33,.045,z*1.3],'wood');}
 for(const x of [-.8,.15,.92]){plank(k,`Rowing thwart ${x}`,[x,.54,0],[.22,.05,1.12]);tube(k,`Boat hull rib ${x}`,[[x,.55,-.56],[x,.23,-.32],[x,.15,0],[x,.23,.32],[x,.55,.56]],.027,'woodDark',6);}
 for(const z of [-.26,.26]){
  k.beam(`Stowed oar shaft ${z}`,[-1.30,.61,z],[1.26,.65,z],.031,.028,'woodLight');const blade=k.sphere(`Oar broad blade ${z}`,[1.36,.653,z],[.35,.035,.10],'woodLight',0);blade.rotation.y=.08;
  k.torus(`Iron rowlock ${z}`,[0,.7,z>0?.65:-.65],.039,.008,'iron',[0,0,0],10);
 }
 tube(k,'Bow painter rope',[[1.77,.54,0],[1.92,.38,.1],[1.78,.13,.32]],.013,'rope',6);
});}
function eelTrap(){return model('Willow funnel eel basket',k=>{
 const profile=[[0,.12],[.13,.20],[.48,.18],[.74,.09],[.82,.025]];
 for(let i=0;i<16;i++){const a=i/16*TAU;tube(k,`Longitudinal willow weave ${i}`,profile.map(([x,r])=>[x,r*Math.sin(a)+.20,r*Math.cos(a)]),.006,'woodLight',5);}
 for(let i=0;i<16;i++){const x=i/15*.80,r=x<.13?.12+x/.13*.08:x<.48?.20-(x-.13)*.057:x<.74?.18-(x-.48)*.346:.09-(x-.74)*.81;k.torus(`Eel trap woven hoop ${i}`,[x,.20,0],r,.0055,'rope',[0,Math.PI/2,0],20);}
 for(let i=0;i<12;i++){const a=i/12*TAU;k.beam(`Inward funnel reed ${i}`,[0,.20+Math.sin(a)*.12,Math.cos(a)*.12],[.23,.20+Math.sin(a)*.034,Math.cos(a)*.034],.005,.005,'woodDark');}
 k.torus('Funnel throat',[.23,.20,0],.033,.005,'woodDark',[0,Math.PI/2,0],14);
});}
function millstones(){return model('Two spare grooved millstones',k=>{
 for(let n=0;n<2;n++){
  // A smaller foreground spare fits inside the rear stone's footprint. Their
  // combined width and height stay equal, preserving circular stone faces.
  const g=k.group(`Millstone ${n+1}`,[n?-.42:0,n?.221:.65,n?.26:0]),q=kit(g);g.rotation.y=0;g.rotation.x=n?-.25:-.12;g.scale.setScalar(n?.34:1);
  const shape=new THREE.Shape();shape.absarc(0,0,.65,0,TAU,false);const hole=new THREE.Path();hole.absarc(0,0,.11,0,TAU,true);shape.holes.push(hole);q.extrude('Millstone with central eye',shape,.16,'stoneLight');
  for(let i=0;i<12;i++){const a=i/12*TAU;q.beam(`Dressing furrow ${n} ${i}`,[Math.cos(a)*.16,Math.sin(a)*.16,.168],[Math.cos(a+.23)*.59,Math.sin(a+.23)*.59,.168],.018,.006,'stoneDark');q.beam(`Fine stone groove ${n} ${i}`,[Math.cos(a+.10)*.25,Math.sin(a+.10)*.25,.169],[Math.cos(a+.25)*.60,Math.sin(a+.25)*.60,.169],.005,.004,'stoneDark');}
 }
});}
function sluiceGate(){return model('Rack operated timber sluice',k=>{
 for(const x of [-.86,.86]){k.beam(`Sluice upright ${x}`,[x,0,0],[x,1.89,0],.16,.18,'woodDark');k.box(`Sluice guide groove ${x}`,[x*.84,.61,.01],[.03,1.2,.20],'iron');}
 for(let i=0;i<7;i++)plank(k,`Sluice gate plank ${i}`,[0,.12+i*.15,0],[1.56,.14,.12]);
 for(const x of [-.56,.56])k.box(`Gate iron strap ${x}`,[x,.61,.07],[.06,1.07,.022],'iron');
 k.beam('Sluice upper crossbeam',[-1,1.69,0],[1,1.69,0],.18,.18,'wood');k.box('Rising toothed rack',[0,1.43,.11],[.065,1.0,.07],'iron');
 for(let i=0;i<13;i++)k.box(`Rack tooth ${i}`,[.046,.98+i*.067,.11],[.038,.033,.08],'steel');
 const crank=wheel(k,'Sluice handwheel',[0,1.72,.30],.27,true);crank.rotation.y=.0;k.beam('Sluice crank handle',[.25,1.72,.31],[.25,1.72,.49],.035,.035,'woodLight');
});}
function plankWalk(){return model('Wet ground plank walk',k=>{
 for(const x of [-2.5,-1.5,-.5,.5,1.5,2.5])for(const z of [-.28,.28])k.beam(`Walkway support post ${x} ${z}`,[x,0,z],[x,.34,z],.11,.11,'woodDark');
 for(const z of [-.28,.28])k.beam(`Walkway longitudinal bearer ${z}`,[-3,.29,z],[3,.29,z],.12,.10,'woodDark');
 for(let i=0;i<24;i++)plank(k,`Walkway tread ${i}`,[-2.875+i*.25,.37,0],[.24,.055,.80],i%3?'woodLight':'wood');
});}
function flourSacks(){return model('Stacked flour sacks',k=>{
 for(let row=0;row<2;row++)for(let i=0;i<3-row;i++){
  const x=(i-(2-row)/2)*.42,z=row*.08,s=k.sphere(`Flour sack ${row} ${i}`,[x,.23+row*.34,z],[.26,.26,.30],'cloth',1);s.rotation.z=(i-1)*.15;
  k.sphere(`Gathered sack neck ${row} ${i}`,[x,.48+row*.34,z],[.085,.07,.085],'plaster',0);k.torus(`Tied sack cord ${row} ${i}`,[x,.47+row*.34,z],.06,.009,'rope',[Math.PI/2,0,0],10);
  for(let j=0;j<4;j++)k.box(`Sack stitch ${row} ${i} ${j}`,[x-.19,.11+row*.34+j*.07,z+.21],[.014,.03,.01],'rope');
 }
 for(let i=0;i<10;i++)k.sphere(`Flour dust ${i}`,[(i%5-2)*.23,.008,(Math.floor(i/5)-.5)*.6],[.14,.008,.13],'whitewash',0);
});}

export function bell(k,name,p,scale=.3){
 const g=k.group(name,p),q=kit(g),profile=[[.0,.75],[.23,.75],[.27,.52],[.35,.20],[.48,0],[.41,-.03],[.31,.13],[.23,.50],[.16,.68],[0,.68]].map(([x,y])=>new THREE.Vector2(x*scale,y*scale));
 q.mesh(`${name} cast bell`,new THREE.LatheGeometry(profile,16),'brass');q.sphere(`${name} clapper`,[0,scale*.12,0],[scale*.06,scale*.18,scale*.06],'iron',0);return g;
}
function bellBuoy(){return model('Bell buoy floating marker',k=>{
 k.sphere('Buoy floating wooden body',[0,.23,0],[.29,.23,.29],'woodDark',1);for(const y of [.18,.30])k.torus(`Buoy iron binding ${y}`,[0,y,0],.29,.018,'iron',[Math.PI/2,0,0],16);
 for(const x of [-.15,.15])k.beam(`Buoy bell support ${x}`,[x,.38,0],[x,1.04,0],.027,.027,'iron');k.beam('Buoy bell crossbar',[-.17,1.05,0],[.17,1.05,0],.032,.032,'iron');
 const g=motion(k.group('Wind swung buoy bell',[0,.94,0]),'swing',{amount:.09,speed:1.4});bell(kit(g),'Small buoy bell',[0,-.27,0],.33);k.cone('Buoy marker cap',[0,1.13,0],.12,.16,'red',6);
});}
function duckPond(){return model('Coldwake pond rail and duck ramp',k=>{
 for(let i=0;i<18;i++){
  const a=i/20*TAU,b=(i+1)/20*TAU;rail(k,`Pond perimeter rail ${i}`,[Math.cos(a)*3.7,Math.sin(a)*3.7],[Math.cos(b)*3.7,Math.sin(b)*3.7],.55,2);
 }
 for(let i=0;i<8;i++)plank(k,`Duck ramp tread ${i}`,[3.0-i*.14,.06+i*.045,-1.23],[.155,.035,.60]);
 for(let i=0;i<2;i++){const duck=bird('duck');duck.position.set(2.8-i*.6,0,-1.9);duck.scale.setScalar(.7);rootAdd(k,duck);}
});}
function rootAdd(k,o){k.root.add(o);}
