import {THREE,kit,leaf,flower,tube,TAU,random,motion} from '../dressing/shared.js';

export const bushIds=new Set(['blackberry','raspberry','rosehip','hazelnut','elderberry','blueberry','fig']);

function fruit(k,id,name,p,size=.035){
 const colors={blackberry:'#332e43',raspberry:'#a74553',rosehip:'#b94733',hazelnut:'#aa7c42',elderberry:'#332d43',blueberry:'#4e648d',fig:'#705071'};
 if(id==='blackberry'||id==='raspberry'){
  for(let i=0;i<8;i++){const a=i*2.399,y=(i/7-.5)*size*1.8;k.sphere(`${name} drupelet ${i}`,[p[0]+Math.cos(a)*size*.4,p[1]+y,p[2]+Math.sin(a)*size*.4],[size*.42,size*.42,size*.42],colors[id],0);}
 }else{
  k.sphere(name,p,[size,id==='fig'||id==='rosehip'?size*1.6:size,size],colors[id],1);
  if(id==='hazelnut'){for(let i=0;i<4;i++)leaf(k,`${name} green husk ${i}`,[p[0],p[1]-size,p[2]],size*1.7,size*.7,'leaf',[0,i/4*TAU,.4]);}
  if(id==='blueberry'||id==='rosehip')flower(k,`${name} calyx`,[p[0],p[1]+size*(id==='rosehip'?1.6:1),p[2]],'leafDark',size*.32,5);
  if(id==='fig')k.cylinder(`${name} neck`,[p[0],p[1]+size*1.5,p[2]],size*.3,size*.5,size*.6,'#716844',5);
 }
}

export function buildBush(id){
 const root=new THREE.Group();root.name=`${id} botanical master`;const k=kit(root),rng=random(id);
 const woody=['hazelnut','elderberry','fig'].includes(id),h={blackberry:1,raspberry:1,rosehip:1.5,hazelnut:2.5,elderberry:2.5,blueberry:.4,fig:3}[id];
 const branches=id==='blackberry'?7:woody?6:7;
 for(let i=0;i<branches;i++){
  const a=i/branches*TAU,x=Math.cos(a)*h*.3,z=Math.sin(a)*h*.3,top=h*(.67+rng()*.23);
  const points=[[Math.cos(a)*h*.055,0,Math.sin(a)*h*.055],[x*.3,top*.43,z*.3],[x*.85,top*.87,z*.85],[x,top*(id==='blackberry'?.74:1),z]];
  tube(k,`${id} ${woody?'woody branch':'cane'} ${i}`,points,h*(woody?.010:.005),'wood',5);
  for(let j=1;j<=4;j++){
   const t=j/4,p=[x*t,top*(t*.64+.22),z*t],size=h*(woody?.17:.14);
   for(const side of [-1,1]){
    const tip=[p[0]+Math.cos(a+side*.8)*h*.105,p[1]+h*.04,p[2]+Math.sin(a+side*.8)*h*.105];
    k.beam(`${id} branchlet ${i} ${j} ${side}`,p,tip,h*.0025,h*.0025,'wood');
    for(let n=0;n<3;n++)leaf(k,`${id} layered leaf ${i} ${j} ${side} ${n}`,[tip[0],tip[1]+n*h*.025,tip[2]],size*(.82+n*.1),id==='fig'?size*.95:size*(id==='hazelnut'?.76:.6),j%2?'#73894c':'#8c9d60',[.9,a+side*.75+n*.6,side*.23],id==='fig'||id==='hazelnut');
   }
   if(id==='blackberry'||id==='rosehip')k.cone(`${id} cane thorn ${i} ${j}`,[p[0]+.01,p[1]-.1*h,p[2]],h*.006,h*.026,'woodLight',4).rotation.z=1;
   if(id==='elderberry'&&j>=3){
    const py=p[1]+h*.09;
    for(let n=0;n<17;n++){const aa=n*2.4,r=h*.082*Math.sqrt(n/17),f=[p[0]+Math.cos(aa)*r,py,p[2]+Math.sin(aa)*r];k.beam(`Elderberry flat panicle ${i} ${j} ${n}`,p,f,h*.0015,h*.0015,'woodDark');fruit(k,id,`Elderberry black berry ${i} ${j} ${n}`,f,h*.013);}
   } else if(id!=='elderberry'&&(j%2||id==='blueberry'))fruit(k,id,`${id} fruit ${i} ${j}`,[p[0],p[1]-.045*h,p[2]+h*.055],h*(id==='fig'?.031:id==='hazelnut'?.021:id==='blueberry'?.031:.03));
  }
 }
 if(id==='rosehip')for(let i=0;i<2;i++)flower(k,`Dog rose blossom ${i}`,[(i-.5)*h*.4,h*.65,h*.15],'flowerPink',h*.045,5);
 motion(root,'sway',{speed:.9,amount:.012});return root;
}
