import {THREE,kit,plank,leaf,flower,tube,lantern,log,motion,TAU} from './shared.js';
import {roof,barrel,basket,stoneWall,trough,rail} from './construction.js';
import {lettering} from './lettering.js';

export const villageBuilders={water_trough:waterTrough,washing_line:washingLine,woodpile:woodpile,chopping_block:choppingBlock,herb_bed:herbBed,chicken_coop:chickenCoop,rain_barrel:rainBarrel,notice_board:noticeBoard,inn_sign:innSign,dovecote:dovecote,pig_sty:pigSty,lychgate:lychgate,headstone_row:headstoneRow,village_stocks:stocks,market_produce:marketProduce,lantern_post:lanternPost};
function model(name,fn){const g=new THREE.Group();g.name=name;fn(kit(g));return g;}

function waterTrough(){return model('Stone village trough',k=>trough(k,'Mossed stone trough',[0,0,0]));}

function washingLine(){return model('Washing line',k=>{
 for(const x of [-2.4,2.4]){k.beam(`Laundry post ${x}`,[x,0,0],[x,2,0],.08,.09,'wood');k.cone(`Post cap ${x}`,[x,2.02,0],.064,.08,'woodLight',4);}
 tube(k,'Sagging clothes line',[[-2.4,1.92,0],[-1.2,1.79,0],[0,1.75,0],[1.2,1.79,0],[2.4,1.92,0]],.008,'rope',5);
 for(let i=0;i<6;i++){
  const group=motion(k.group(`Swaying laundry ${i}`,[-1.9+i*.77,1.8,0]),'swing',{amount:.075,speed:1.3,phase:i*.6}),q=kit(group),shirt=i%3!==0;
  const shape=new THREE.Shape();const outline=shirt?[[-.15,0],[-.31,-.10],[-.25,-.30],[-.16,-.25],[-.16,-.60],[.16,-.60],[.16,-.25],[.25,-.30],[.31,-.10],[.15,0],[.08,-.045],[-.08,-.045]]:[[-.32,0],[-.31,-.81],[.28,-.84],[.31,0]];
  outline.forEach(([x,y],n)=>n?shape.lineTo(x,y):shape.moveTo(x,y));shape.closePath();const cloth=q.mesh(`Pegged ${shirt?'shirt':'sheet'} ${i}`,new THREE.ShapeGeometry(shape),i%3===0?'whitewash':i%3===1?'cloth':'blue');cloth.material.side=THREE.DoubleSide;
  for(const x of [-.12,.12])q.box(`Wooden clothes peg ${i} ${x}`,[x,-.018,.015],[.022,.07,.025],'woodLight',.002);
 }
});}

export function axe(k,p=[0,0,0],size=.5){
 const g=k.group('Axe sunk into oak',p),q=kit(g);q.beam('Axe haft',[0,0,0],[size*.33,size,0],size*.055,size*.045,'woodLight');
 const s=new THREE.Shape();s.moveTo(-size*.08,size*.83);s.lineTo(size*.38,size*1.05);s.lineTo(size*.53,size*.79);s.lineTo(size*.01,size*.7);s.closePath();q.extrude('Forged axe head',s,size*.07,'steel');return g;
}
function choppingBlock(){return model('Oak chopping block',k=>{
 log(k,'Oak block',[0,.18,0],.36,.24,'y');axe(k,[0,.31,0],.35);
 for(let i=0;i<12;i++){const a=i*2.4;const c=k.box(`Split chip ${i}`,[Math.cos(a)*(.21+i*.006),.014,Math.sin(a)*.24],[.07,.015,.025],i%2?'woodLight':'endgrain',.002);c.rotation.y=a;}
});}
function woodpile(){return model('Covered split woodpile',k=>{
 for(let row=0;row<3;row++)for(let i=0;i<5-row;i++){
  const g=log(k,`Stacked split firewood ${row} ${i}`,[-.72+i*.3+row*.15,.13+row*.22,0],.7,.14,'y');g.rotation.x=Math.PI/2;
 }
 for(let i=0;i<5;i++)plank(k,`Protective cover plank ${i}`,[-.63+i*.31,.85,0],[.3,.04,.93]);
 log(k,'Side chopping block',[1,.19,0],.38,.22,'y');axe(k,[1,.32,0],.45);
});}
function herbBed(){return model('Rosemary sage and lavender bed',k=>{
 k.box('Raised earth',[0,.13,0],[1.75,.26,.8],'earth');for(const z of [-.46,.46])stoneWall(k,`Herb bed long edge ${z}`,[0,0,z],2,.26,.16);for(const x of [-.92,.92])for(let i=0;i<4;i++)k.rock(`Herb bed end stone ${x} ${i}`,[x,.14,-.3+i*.2],[.13,.14,.13],'stone',0);
 for(let i=0;i<15;i++){
  const x=(i%5-2)*.32,z=(Math.floor(i/5)-1)*.24,h=.23+i%3*.035;
  k.beam(`Herb stem ${i}`,[x,.26,z],[x,.26+h,z],.012,.01,'leafDark');
  for(let j=0;j<4;j++)for(const side of [-1,1])leaf(k,`${i<5?'Rosemary':i<10?'Sage':'Lavender'} leaf ${i} ${j} ${side}`,[x,.29+j*.045,z],i<5?.06:.075,i<5?.009:.03,i<10?'#788164':'#83966a',[.6,j*.7,side*.9]);
  if(i>=10)for(let j=0;j<4;j++)k.sphere(`Lavender flower whorl ${i} ${j}`,[x,.47+j*.025,z],[.021,.025,.021],'#8a799b',0);
 }
});}
function chickenCoop(){return model('Timber chicken coop and run',k=>{
 for(const x of [-.72,.02])for(const z of [-.42,.42])k.beam(`Coop raised leg ${x} ${z}`,[x,0,z],[x,.38,z],.07,.07,'woodDark');
 for(let i=0;i<7;i++)for(const z of [-.44,.44])plank(k,`Coop plank ${i} ${z}`,[-.71+i*.12,.67,z],[.113,.67,.045]);
 for(const x of [-.77,.08])k.box(`Coop end wall ${x}`,[x,.7,0],[.05,.64,.86],'wood');
 roof(k,'Coop shingle roof',[-.35,1.03,0],1.02,1.05,.33);
 k.box('Black chicken doorway',[.112,.53,0],[.01,.30,.23],'black');
 for(let i=0;i<7;i++){const x=.12+i*.10;plank(k,`Ramp board ${i}`,[x,.37-i*.045,0],[.115,.035,.26]);k.box(`Ramp cross cleat ${i}`,[x,.39-i*.045,0],[.025,.018,.26],'woodDark');}
 for(const z of [-.63,.63]){
  rail(k,`Run rails ${z}`,[.1,z],[1.12,z],.7,2);
  for(let i=0;i<13;i++)k.beam(`Wire run vertical ${z} ${i}`,[.1+i*.085,.05,z],[.1+i*.085,.69,z],.003,.003,'iron');
  for(let i=1;i<8;i++)k.beam(`Wire run horizontal ${z} ${i}`,[.1,i*.08,z],[1.12,i*.08,z],.003,.003,'iron');
 }
 rail(k,'Run end',[1.12,-.63],[1.12,.63],.7,2);
});}
function rainBarrel(){return model('Rain barrel with dipper',k=>{
 barrel(k,'Open rain barrel',[0,0,0],.32,.84,{open:true,water:true});
 tube(k,'Bent roof downpipe',[[-.27,1.1,-.22],[-.27,.95,-.22],[-.17,.8,-.08]],.034,'copper',8);
 k.torus('Dipper hook',[.3,.75,.02],.045,.009,'iron',[0,Math.PI/2,0],10);
 k.beam('Dipper handle',[.36,.32,.01],[.36,.79,.01],.026,.02,'woodLight');k.sphere('Dipper bowl',[.36,.28,.01],[.08,.05,.067],'wood',1);
});}
function noticeBoard(){return model('Roofed notice board',k=>{
 for(const x of [-.53,.53])k.beam(`Noticeboard post ${x}`,[x,0,0],[x,1.95,0],.1,.1,'woodDark');
 for(let i=0;i<7;i++)plank(k,`Notice board backing ${i}`,[-.51+i*.17,1.42,0],[.165,.83,.065]);roof(k,'Noticeboard canopy',[0,1.91,0],1.42,.38,.2);
 for(let i=0;i<5;i++){const x=(i%3-1)*.32,y=1.59-Math.floor(i/3)*.34;const paper=k.box(`Blank paintable notice ${i}`,[x,y,.04],[.25,.29,.004],i%2?'plaster':'whitewash',0);paper.rotation.z=(i-2)*.035;k.sphere(`Notice pin ${i}`,[x,y+.115,.049],[.012,.012,.004],'iron',0);}
});}
function innSign(){return model('Bracken Arms swinging sign',k=>{
 tube(k,'Wrought sign bracket',[[-.4,.87,0],[-.4,.77,0],[.38,.77,0],[.25,.91,0],[.12,.86,0]],.025,'iron',8);
 const g=motion(k.group('Swinging Bracken Arms sign',[.02,.71,0]),'sway',{amount:.075,speed:1.1}),q=kit(g);
 for(const x of [-.19,.19])q.torus(`Sign suspension link ${x}`,[x,-.015,0],.04,.009,'iron');
 q.cylinder('Round painted sign',[0,-.35,0],.31,.31,.06,'#45634b',24).rotation.x=Math.PI/2;
 q.torus('Gilt sign rim',[0,-.35,.034],.29,.014,'brass',[0,0,0],24);
 for(const side of [-1,1]){
  q.beam(`Painted bracken stem ${side}`,[0,-.48,.036],[side*.055,-.26,.036],.009,.004,'straw');
  for(let i=0;i<5;i++)for(const s of [-1,1])leaf(q,`Painted bracken leaflet ${side} ${i} ${s}`,[side*(.01+i*.009),-.43+i*.031,.04],.044-i*.004,.018,'straw',[0,0,s*.85]);
 }
 lettering(q,'Bracken',[0,-.195,.041],.39,'straw');lettering(q,'Arms',[0,-.54,.041],.22,'straw');
 g.userData.inscription='The Bracken Arms';
});}
function dovecote(){return model('Round dovecote with twelve entrances',k=>{
 k.cylinder('Stone dovecote plinth',[0,.35,0],.6,.7,.7,'stone',12);
 k.cylinder('Round whitewashed dovecote',[0,1.86,0],.62,.62,2.35,'plaster',16);
 for(let i=0;i<12;i++){
  const a=i%6/6*TAU,y=1.38+Math.floor(i/6)*.85,x=Math.sin(a)*.624,z=Math.cos(a)*.624;
  const g=k.group(`Pigeon doorway ${i}`,[x,y,z]);g.rotation.y=a;const q=kit(g);q.box(`Black pigeon hole ${i}`,[0,0,0],[.19,.25,.02],'black',.035);q.box(`Landing ledge ${i}`,[0,-.15,.07],[.28,.045,.21],'woodDark');
 }
 k.cone('Dovecote conical slate roof',[0,3.32,0],.8,.83,'slate',16);k.sphere('Roof finial',[0,3.81,0],[.05,.14,.05],'iron',0);
 for(let i=0;i<2;i++){k.sphere(`Pigeon ${i} body`,[.1+i*.27,1.24,.71],[.12,.1,.07],'#9b9e99',1);k.sphere(`Pigeon ${i} head`,[.15+i*.27,1.36,.72],[.055,.055,.05],'#788587',0);k.cone(`Pigeon ${i} beak`,[.20+i*.27,1.36,.72],.02,.05,'bone',4).rotation.z=-Math.PI/2;}
});}
function pigSty(){return model('Stone pig sty',k=>{
 for(const z of [-1.05,1.05])stoneWall(k,`Sty long wall ${z}`,[0,0,z],2.7,.72,.29);stoneWall(k,'Sty back wall',[-1.25,0,0],.3,.72,2);
 for(const x of [-1.1,.15])k.beam(`Lean-to support ${x}`,[x,0,-.86],[x,1.3,-.86],.12,.12,'woodDark');
 const r=k.box('Low lean-to roof',[-.55,1.19,-.12],[1.8,.09,2.05],'woodDark');r.rotation.z=-.12;
 for(let i=0;i<7;i++)plank(k,`Sty roof plank ${i}`,[-1.3+i*.25,1.2-(-1.3+i*.25+.55)*.12,-.12],[.24,.04,2.05]);
 trough(k,'Pig trough',[.75,0,.69],.9,.35,.26,false);k.rock('Corner mud wallow',[-.75,.02,.25],[.7,.03,.63],'#4b4134',1);
});}
function lychgate(){return model('Chapel lychgate',k=>{
 for(const x of [-1,1])for(const z of [-.4,.4]){k.box(`Gate stone foot ${x} ${z}`,[x,.14,z],[.26,.28,.26],'stone');k.beam(`Gate timber upright ${x} ${z}`,[x,.22,z],[x,2.35,z],.16,.16,'woodDark');k.beam(`Gate knee brace ${x} ${z}`,[x,1.72,z],[x*.5,2.28,z],.1,.10,'wood');}
 for(const z of [-.4,.4])k.beam(`Lychgate tie beam ${z}`,[-1.17,2.28,z],[1.17,2.28,z],.18,.17,'wood');roof(k,'Lychgate roof',[0,2.37,0],2.6,1.25,.55);
 rail(k,'Low chapel swing gate',[-.94,0],[.94,0],1.08,3);
});}
function headstoneRow({variant=0}={}){return model('Chapel headstone with five source shape variants',k=>{
 const i=((Math.trunc(variant)%5)+5)%5;
 {
  const g=k.group(`Headstone shape ${i+1}`);g.rotation.z=(i-2)*.035;const q=kit(g),s=new THREE.Shape();
  s.moveTo(-.17,0);s.lineTo(.17,0);s.lineTo(.17,.57);
  if(i===0){s.quadraticCurveTo(0,.82,-.17,.57);}else if(i===1){s.lineTo(0,.77);s.lineTo(-.17,.57);}else if(i===2){s.lineTo(.10,.57);s.lineTo(.1,.75);s.lineTo(-.1,.75);s.lineTo(-.1,.57);s.lineTo(-.17,.57);}else if(i===3){s.lineTo(.23,.64);s.lineTo(0,.73);s.lineTo(-.23,.64);s.lineTo(-.17,.57);}else{s.lineTo(.17,.67);s.lineTo(-.17,.67);}s.closePath();q.extrude(`Weathered stone silhouette ${i}`,s,.12,i%2?'stone':'stoneLight');
  q.box(`Recessed memorial tablet ${i}`,[0,.39,.125],[.18,.2,.004],'stoneDark',.03);
  q.rock(`Headstone moss ${i}`,[.1,.05,.1],[.13,.07,.12],'moss',0);
 }
 k.root.userData.variants=['Round arch','Gabled','Stepped','Shouldered','Flat'];k.root.userData.variant=i;k.root.userData.footprintInterpretation='The source footprint is per headstone. Use five shape variants when assembling the churchyard row.';
});}
function stocks(){return model('Village stocks and worn seat',k=>{
 for(const x of [-.68,.68])k.beam(`Stocks post ${x}`,[x,0,0],[x,1,0],.12,.12,'woodDark');
 // Shape holes are actual cut-outs, not dark discs painted over a solid plank.
 const s=new THREE.Shape();s.moveTo(-.72,.34);s.lineTo(.72,.34);s.lineTo(.72,.87);s.lineTo(-.72,.87);s.closePath();
 for(const x of [-.22,.22]){const hole=new THREE.Path();hole.absellipse(x,.57,.125,.145,0,TAU,true);s.holes.push(hole);}
 k.extrude('Stocks plank with two ankle apertures',s,.1,'woodLight');k.box('Stocks joining seam',[0,.57,.105],[1.42,.008,.009],'woodDark',0);
 for(const x of [-.55,.55])for(const z of [.3,.55])k.beam(`Seat leg ${x} ${z}`,[x,0,z],[x,.38,z],.065,.065,'wood');plank(k,'Worn stocks seat',[0,.39,.43],[1.24,.07,.38]);
 for(const x of [-.63,.63])k.box(`Stocks iron hinge ${x}`,[x,.79,.118],[.10,.15,.018],'iron');
});}
function marketProduce(){return model('Three market produce sets',k=>{
 for(let i=0;i<3;i++){
  const x=(i-1)*.44;basket(k,`Produce basket ${i}`,[x,0,0],.2,.19);
  if(i===0)for(let j=0;j<9;j++){const a=j*2.4,r=.12*Math.sqrt(j/9);k.sphere(`Market apple ${j}`,[x+Math.cos(a)*r,.21+Math.sin(j)*.016,Math.sin(a)*r],[.05,.05,.048],j%2?'red':'vegetable',0);}
  if(i===1)for(let j=0;j<4;j++){k.sphere(`Cabbage head ${j}`,[x+(j%2-.5)*.16,.23, (Math.floor(j/2)-.5)*.15],[.08,.076,.073],'vegetable',1);for(let n=0;n<3;n++)leaf(k,`Cabbage curled leaf ${j} ${n}`,[x+(j%2-.5)*.16,.2,(Math.floor(j/2)-.5)*.15],.12,.10,'leafLight',[.8,n*2.1,0]);}
  if(i===2){for(let j=0;j<2;j++){const loaf=k.sphere(`Bread loaf ${j}`,[x+(j-.5)*.15,.24,0],[.075,.07,.15],'bread',1);for(let n=0;n<3;n++)k.box(`Loaf score ${j} ${n}`,[loaf.position.x,.305,(n-1)*.075],[.09,.002,.008],'straw',.002);}k.cylinder('Cheese wheel',[x,.20,.19],.12,.12,.085,'#d5b969',12);}
 }
});}
function lanternPost(){return model('Timber lane lantern',k=>{
 k.beam('Short narrow timber post',[0,0,0],[0,2.11,0],.09,.09,'woodDark');k.box('Lantern support arm',[.05,2.12,0],[.29,.045,.045],'iron');lantern(k,'Dusk lantern',[.11,1.93,0],.30,true);
});}
