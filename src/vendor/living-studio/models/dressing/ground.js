import {THREE,kit,TAU,random,disk,leaf,grass,tube} from './shared.js';
import {stoneWall} from './construction.js';

export const groundIds=new Set('molehills puddle cart_ruts rabbit_warren cairn leaf_litter boar_wallow fox_earth birds_nest chalk_figure chalk_boulder flint_nodules sheep_track drowned_wall'.split(' '));

function patch(k,name,points,mat='earth') {
 const shape=new THREE.Shape();points.forEach(([x,z],i)=>i?shape.lineTo(x,-z):shape.moveTo(x,-z));shape.closePath();const mesh=k.mesh(name,new THREE.ShapeGeometry(shape),mat);mesh.rotation.x=-Math.PI/2;mesh.material.side=THREE.DoubleSide;return mesh;
}
function stroke(k,name,points,width,mat) {
 for(let i=0;i<points.length-1;i++){
  const [ax,az]=points[i],[bx,bz]=points[i+1],len=Math.hypot(bx-ax,bz-az),nx=-(bz-az)/len*width/2,nz=(bx-ax)/len*width/2;
  patch(k,`${name} segment ${i}`,[[ax+nx,az+nz],[bx+nx,bz+nz],[bx-nx,bz-nz],[ax-nx,az-nz]],mat);
 }
 for(const [i,p] of points.entries())disk(k,`${name} rounded joint ${i}`,[p[0],0,p[1]],width/2,mat,10);
}
function unevenDisk(k,name,x,z,r,color,rng){const points=[];for(let i=0;i<18;i++){const a=i/18*TAU,rr=r*(.85+rng()*.15);points.push([x+Math.cos(a)*rr,z+Math.sin(a)*rr]);}return patch(k,name,points,color);}

export function buildGround(id){
 const root=new THREE.Group();root.name=`${id} terrain master`;const k=kit(root),rng=random(id);
 if(id==='molehills'){
  for(let i=0;i<6;i++){const a=i*2.4,x=Math.cos(a)*(i%2?.9:.5),z=Math.sin(a)*.9;k.rock(`Molehill ${i+1}`,[x,.07,z],[.3,.14,.27],'earth',1);for(let j=0;j<5;j++){const b=j*1.4;k.rock(`Molehill loose clod ${i} ${j}`,[x+Math.cos(b)*.28,.015,z+Math.sin(b)*.24],[.06,.025,.05],'woodDark',0);}}
 }else if(id==='puddle'){
  unevenDisk(k,'Wet muddy puddle margin',0,0,.7,'#655b49',rng).scale.z=.56;
  const water=unevenDisk(k,'Reflective lane puddle',0,0,.61,'#77918a',rng);water.scale.z=.55;water.material.roughness=.10;water.material.metalness=.2;water.material.polygonOffset=true;water.material.polygonOffsetFactor=-1;
  for(let i=0;i<6;i++){const a=i*2.4;const p=disk(k,`Puddle pebble ${i}`,[Math.cos(a)*.54,0,Math.sin(a)*.28],.018,'stone',6);p.material.polygonOffset=true;p.material.polygonOffsetFactor=-2;}
 }else if(id==='cart_ruts'){
  for(const z of [-.58,.58]){
   stroke(k,`Compressed wheel rut ${z}`,[[-2,z+.07],[-1,z-.02],[0,z],[1,z+.05],[2,z-.025]],.17,'#5e523f');
   for(let i=0;i<22;i++)patch(k,`Wheel rut tread ${z} ${i}`,[[i*.18-2,z-.07],[i*.18-1.95,z-.085],[i*.18-1.92,z+.073],[i*.18-1.97,z+.08]],'#827156');
  }
  for(let i=0;i<22;i++)unevenDisk(k,`Rut grass island ${i}`,(rng()-.5)*4,(rng()-.5)*1.8,.035+rng()*.07,'#8c8c5c',rng);
 }else if(id==='leaf_litter'){
  for(let i=0;i<150;i++){
   const x=(rng()-.5)*4,z=(rng()-.5)*4,r=.045+rng()*.10,a=rng()*TAU;
   const pts=[[0,-r],[-r*.4,-r*.4],[-r*.45,r*.3],[0,r],[r*.45,r*.3],[r*.4,-r*.4]].map(([xx,zz])=>[x+xx*Math.cos(a)-zz*Math.sin(a),z+xx*Math.sin(a)+zz*Math.cos(a)]);
   patch(k,`Fallen beech leaf ${i}`,pts,['#9b7647','#b39860','#735b3c','#c0a56f'][i%4]);
   if(i%4===0)patch(k,`Beech mast ${i}`,[[x,z],[x+.023,z+.04],[x-.025,z+.033]],'#6d4d2c');
  }
 }else if(id==='sheep_track'){
  stroke(k,'Worn hillside sheep track',[[-5,-.02],[-3,.1],[-1,-.03],[1,.05],[3,-.06],[5,.01]],.40,'#a69772');
  for(let i=0;i<38;i++){const x=i/37*10-5,z=Math.sin(i*.8)*.10;for(const zz of [-.025,.025])patch(k,`Cloven hoofprint ${i} ${zz}`,[[x-.045,z+zz],[x+.033,z+zz],[x+.04,z+zz+.014],[x-.04,z+zz+.014]],'#7b6e52');}
 }else if(id==='chalk_figure'){
  // Ground-space chalk giant, with outlined torso, bent arms and separated legs.
  const turf=patch(k,'Chalk hillside turf contrast',[[-15,-20],[15,-20],[15,20],[-15,20]],'#68765b');
  const head=[];for(let i=0;i<=16;i++){const a=i/16*TAU;head.push([Math.cos(a)*2.7,-14+Math.sin(a)*3.2]);}stroke(k,'Chalk giant head',head,.7,'chalk');
  stroke(k,'Chalk giant torso outline',[[-3,-10],[-4,2],[0,5],[4,2],[3,-10],[-3,-10]],.8,'chalk');
  stroke(k,'Chalk giant left arm',[[-3,-8],[-9,-5],[-12,-12]],.85,'chalk');stroke(k,'Chalk giant right arm',[[3,-8],[9,-4],[12,-10]],.85,'chalk');
  stroke(k,'Chalk giant left leg',[[-2,4],[-5,11],[-6,18],[-10,18]],.95,'chalk');stroke(k,'Chalk giant right leg',[[2,4],[5,11],[7,18],[11,18]],.95,'chalk');
  stroke(k,'Chalk giant staff',[[13,-18],[13,9]],.65,'chalk');stroke(k,'Chalk giant facial marks',[[-1,-14],[1,-14]],.35,'chalk');stroke(k,'Chalk giant mouth',[[-1,-12.5],[1,-12.5]],.25,'chalk');
  k.root.traverse(o=>{if(o.isMesh&&o!==turf){o.material.color.set('#f2f1de');o.material.polygonOffset=true;o.material.polygonOffsetFactor=-1;}});
 }else if(id==='cairn'){
  for(let row=0;row<5;row++)for(let i=0;i<7-row;i++){const a=i/(7-row)*TAU,r=.32*(1-row*.18);k.rock(`Stacked chalk cairn stone ${row} ${i}`,[Math.cos(a)*r,.10+row*.17,Math.sin(a)*r],[.22-row*.023,.13,.19-row*.024],i%3?'chalk':'stoneLight',0);}
  k.rock('Cairn top marker',[0,.99,0],[.08,.19,.075],'chalk',0);
 }else if(id==='chalk_boulder'){
  k.rock('Rounded chalk boulder',[0,.43,0],[.7,.5,.58],'chalk',1);
  for(let i=0;i<10;i++){const a=i*2.4,yy=.25+rng()*.5;k.rock(`Embedded black flint ${i}`,[Math.cos(a)*.59,yy,Math.sin(a)*.48],[.11,.08,.07],'flint',0);}
 }else if(id==='flint_nodules'){
  for(let i=0;i<19;i++){const x=(rng()-.5)*1.8,z=(rng()-.5)*1.8,r=.05+rng()*.1;k.rock(`Black flint nodule ${i}`,[x,r*.4,z],[r,r*.7,r*.8],'#384444',0);k.rock(`Chalk cortex on flint ${i}`,[x,r*.76,z],[r*.65,r*.2,r*.50],'chalk',0);}
 }else if(id==='rabbit_warren'||id==='fox_earth'){
  const holes=id==='rabbit_warren'?4:1;k.rock('Rooted sandy earth bank',[0,.31,0],[1.3,.48,.79],'earth',1);
  for(let i=0;i<holes;i++){
   const x=holes===1?0:(i-1.5)*.54;k.sphere(`${id} dark burrow mouth ${i+1}`,[x,.22,.68],[.20,.15,.07],'#292922',1);
   k.torus(`${id} eroded hole rim ${i+1}`,[x,.22,.73],.18,.023,'woodDark',[0,0,0],12).scale.y=.8;
   const fan=unevenDisk(k,`${id} bare sand fan ${i+1}`,x,.92,.37,'#ad9564',rng);fan.scale.z=.65;
  }
  if(id==='fox_earth')for(let i=0;i<8;i++){const a=i/8*TAU;tube(k,`Burrow exposed root ${i}`,[[Math.cos(a)*.4,.55,Math.sin(a)*.5],[Math.cos(a)*.65,.35,Math.sin(a)*.65],[Math.cos(a)*.8,.05,Math.sin(a)*.8]],.045,'woodDark',6);leaf(k,`Scattered bird feather ${i}`,[(rng()-.5),.01,.8+rng()*.25],.15,.035,i%2?'plaster':'black',[Math.PI/2,0,rng()*TAU]);}
 }else if(id==='boar_wallow'){
  k.rock('Churned wallow mud',[0,.04,0],[1.35,.12,1.08],'#5d4c37',1);
  for(let i=0;i<18;i++){const a=i/18*TAU;k.rock(`Wallow displaced rim clod ${i}`,[Math.cos(a)*1.25,.12,Math.sin(a)*1],[.20,.16,.14],'earth',0);}
  const wet=disk(k,'Wet wallow hollow',[0,.105,0],.85,'#4f4c3b',18);wet.scale.z=.75;wet.material.roughness=.22;
  for(let i=0;i<10;i++)for(const side of [-1,1])k.sphere(`Boar cloven hoof impression ${i} ${side}`,[(rng()-.5)*1.5,.11,(rng()-.5)*1.1+side*.025],[.07,.007,.03],'#3c3429',0);
 }else if(id==='birds_nest'){
  for(const side of [-1,1])k.beam(`Nest supporting fork ${side}`,[0,0,0],[side*.16,.13,.04],.035,.03,'wood');
  for(let i=0;i<30;i++){const a=i*2.4,r=.105+(i%3)*.006,y=.06+i%5*.017;k.beam(`Woven nest twig ${i}`,[Math.cos(a)*r,y,Math.sin(a)*r],[Math.cos(a+.8)*r,y+.006,Math.sin(a+.8)*r],.008,.007,i%2?'wood':'rope');}
  k.sphere('Dark nest hollow',[0,.097,0],[.08,.014,.08],'woodDark',1);
  for(let i=0;i<3;i++){const a=i/3*TAU;k.sphere(`Spring egg ${i+1}`,[Math.cos(a)*.035,.12,Math.sin(a)*.035],[.022,.033,.024],'#b8c8b4',1);}
 }else if(id==='drowned_wall'){
  for(let i=0;i<5;i++)stoneWall(k,`Drowned wall section ${i}`,[-1.6+i*.8,0,0],.80,1-i*.15,.43);
  for(let i=0;i<16;i++){const x=(rng()-.5)*3.5;leaf(k,`Trailing river weed ${i}`,[x,.18+rng()*.45,.24],.44,.055,'#506c48',[0,.2,Math.PI*.78]);}
 }
 return root;
}
