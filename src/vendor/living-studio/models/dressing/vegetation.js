import {THREE,kit,leaf,flower,tube,grass,random,TAU,motion} from './shared.js';
import {buildBush} from '../forage/bushes.js';
import {buildPlants} from '../forage/plants.js';
import {bird} from './animals.js';

export const vegetationIds=new Set('apple_tree pollard_willow dead_oak ivy_stump poppy_patch cowslip_patch cow_parsley thistle_clump gorse bramble_thicket hawthorn coppice_stool bluebell_patch bracken foxglove mushroom_ring deer_rub rushes yellow_iris'.split(' '));

function tree(id){
 const root=new THREE.Group();root.name=`${id} tree master`;const k=kit(root),rng=random(id),bare=id==='dead_oak',willow=id==='pollard_willow',rub=id==='deer_rub',coppice=id==='coppice_stool';
 const height=bare?8:willow?4:rub?2.8:coppice?2.6:3.6;
 if(coppice){
  k.rock('Coppice cut stool',[0,.18,0],[.46,.24,.42],'woodDark',1);
  for(let i=0;i<12;i++){
   const a=i/12*TAU,x=Math.cos(a)*.32,z=Math.sin(a)*.32,top=2.3+rng()*.4;
   k.beam(`Hazel coppice rod ${i+1}`,[x,.13,z],[x*2.7,top,z*2.7],.045,.04,'wood');
   for(let j=0;j<4;j++)leaf(k,`Hazel rod leaf ${i} ${j}`,[x*(1+j*.45),.9+j*.42,z*(1+j*.45)],.24,.15,'leaf',[.7,a,j*.5],true);
  }
 }else if(rub){
  k.cylinder('Rubbed sapling trunk',[0,1.3,0],.035,.07,2.6,'wood',7);
  k.cylinder('Exposed pale deer-rub wood',[0,.94,0],.055,.061,.47,'endgrain',7);
  for(let i=0;i<6;i++){const a=i*2.4;const x=Math.cos(a)*.15,z=Math.sin(a)*.15;k.beam(`Sapling twig ${i}`,[0,1.3+i*.17,0],[x,2.1+i*.13,z],.018,.016,'wood');leaf(k,`Sapling leaf ${i}`,[x,2.1+i*.13,z],.16,.1,'leaf',[.6,a,0]);}
 }else{
  tube(k,'Tapered twisting trunk',[[0,0,0],[.12,height*.25,-.05],[-.04,height*.48,.10],[.1,height*.64,0]],height*.06,'wood',9);
  for(let i=0;i<7;i++){const a=i/7*TAU;k.beam(`Exposed root ${i}`,[0,.28,0],[Math.cos(a)*height*.12,.035,Math.sin(a)*height*.12],height*.045,height*.035,'woodDark');}
  if(willow)k.sphere('Pollard knuckle head',[0,height*.57,0],[.47,.39,.44],'woodDark',1);
  for(let i=0;i<(willow?13:9);i++){
   const a=i*2.399,x=Math.cos(a)*height*(willow?.18:.38),z=Math.sin(a)*height*(willow?.18:.38),y=height*(.57+rng()*.25);
   const start=willow?[0,height*.58,0]:[.03,height*(.27+i*.035),0];
   tube(k,`${willow?'Pollard young rod':'Crown bough'} ${i}`,[start,[x*.45,y*.8,z*.45],[x,y,z],[x*1.12,y+height*.10,z*1.12]],height*(willow?.009:.02),'wood',6);
   if(bare){for(let j=0;j<3;j++)k.beam(`Dead fork ${i} ${j}`,[x*.7,y*.89,z*.7],[x*(1+j*.1),y+height*(.03+j*.09),z*(1-j*.08)],height*.014,height*.011,'woodDark');}
   else{
    const foliage=motion(k.group(`Crown foliage ${i}`,[x,y,z]),'sway',{amount:.012,phase:i}),q=kit(foliage);
    if(willow){for(let j=0;j<7;j++){const a2=j*2.4,px=Math.cos(a2)*.2,pz=Math.sin(a2)*.2;tube(q,`Willow hanging twig ${j}`,[[0,.25,0],[px,.12,pz],[px*1.2,-.55,pz*1.2]],.008,'wood',4);for(let n=0;n<5;n++)leaf(q,`Willow narrow leaf ${j} ${n}`,[px,.1-n*.12,pz],.18,.026,'#8a9b65',[0,a2,2.8]);}}
    else{
     q.rock(`Faceted leaf canopy ${i}`,[0,0,0],[height*.19,height*.12,height*.19],i%3?'leaf':'leafLight',1);
     for(let j=0;j<9;j++){const a2=j*2.4,r=height*.17,px=Math.cos(a2)*r,pz=Math.sin(a2)*r;leaf(q,`Crown silhouette leaf ${i} ${j}`,[px,.02,pz],height*.075,height*.04,'leafLight',[.9,a2,0],id==='hawthorn');
      if(id==='apple_tree'){q.sphere(`Orchard apple ${i} ${j}`,[px,-height*.08,pz],[height*.02,height*.022,height*.02],j%3?'red':'vegetable',0);}
      else if(id==='hawthorn')flower(q,`Hawthorn white blossom ${i} ${j}`,[px,height*.08,pz],'whitewash',height*.025,5);
     }
    }
   }
  }
  if(bare){const crow=bird('crow');crow.position.set(height*.18,height*.70,height*.15);crow.scale.setScalar(.8);root.add(crow);}
 }
 return root;
}

function flowers(id){
 const root=new THREE.Group();root.name=`${id} botanical patch`;const k=kit(root),rng=random(id);
 const tall=id==='cow_parsley'||id==='foxglove'||id==='rushes'||id==='yellow_iris';
 const count=id==='foxglove'?3:id==='thistle_clump'?7:id==='cow_parsley'?14:id==='rushes'?22:20;
 for(let i=0;i<count;i++){
  const x=id==='foxglove'?[-.20,.20,0][i]:(rng()-.5)*2,z=id==='foxglove'?[-.16,.03,.23][i]:(rng()-.5)*(id==='cow_parsley'?.38:2),h=id==='foxglove'?[1.10,.90,1.28][i]:(tall?.9:.4)*(.65+rng()*.4);
  k.beam(`${id} stalk ${i}`,[x,0,z],[x+.02,h,z],tall?.012:.007,tall?.01:.006,'leafDark');
  if(id==='rushes'){
   leaf(k,`Rush blade ${i}`,[x,0,z],h*1.05,.032,'#637a4e',[.13,rng()*TAU,.08]);
   if(i%3===0)k.cylinder(`Rush seed head ${i}`,[x,h*.91,z],.024,.023,.15,'#82613d',7);
  }else if(id==='foxglove'){
   for(let j=0;j<8;j++){
    const a=j*2.4,xx=x+Math.cos(a)*.044,zz=z+Math.sin(a)*.044,yy=h*.44+j*h*.072;
    const profile=[[.010,.046],[.026,.040],[.035,.016],[.044,-.031],[.037,-.036],[.027,.012],[.018,.034],[.010,.038]].map(p=>new THREE.Vector2(...p));
    const bell=k.mesh(`Foxglove open bell flower ${i} ${j}`,new THREE.LatheGeometry(profile,10),j%2?'#bb809e':'#a56691');bell.position.set(xx,yy,zz);bell.rotation.z=.60*Math.cos(a);bell.rotation.x=.45*Math.sin(a);
   }
   for(let j=0;j<6;j++)leaf(k,`Foxglove basal leaf ${i} ${j}`,[x,0,z],h*.29,.09,'leaf',[1.1,j/6*TAU,0]);
  }else if(id==='cow_parsley'){
   for(let j=0;j<7;j++){const a=j/7*TAU,p=[x+Math.cos(a)*.12,h+Math.sin(j)*.01,z+Math.sin(a)*.12];k.beam(`Parsley umbel spoke ${i} ${j}`,[x,h-.09,z],p,.005,.005,'leaf');flower(k,`Parsley white umbel ${i} ${j}`,p,'whitewash',.045,5);}
   for(let j=0;j<3;j++)leaf(k,`Parsley divided leaf ${i} ${j}`,[x,h*.35+j*.09,z],.17,.085,'leaf',[.8,j*2.1,0],true);
  }else if(id==='thistle_clump'){
   k.sphere(`Thistle spiny calyx ${i}`,[x,h,z],[.052,.065,.052],'leaf',0);
   for(let j=0;j<10;j++){const a=j/10*TAU;k.cone(`Thistle spine ${i} ${j}`,[x+Math.cos(a)*.06,h,z+Math.sin(a)*.06],.008,.07,'#9fa77a',4).rotation.z=Math.cos(a)*1.1;}
   for(let j=0;j<8;j++){const a=j*2.4;k.cylinder(`Thistle purple floret ${i} ${j}`,[x+Math.cos(a)*.029,h+.059,z+Math.sin(a)*.029],.005,.008,.08,'#95678a',5);}
   for(let j=1;j<4;j++)leaf(k,`Thistle jagged leaf ${i} ${j}`,[x,h*j/4,z],.18,.07,'#7b8a68',[.8,j*2.1,.4],true);
  }else if(id==='yellow_iris'){
   for(let j=0;j<5;j++)leaf(k,`Iris sword leaf ${i} ${j}`,[x,0,z],h*.95,.045,'#678a58',[.1,j*1.4,(j-2)*.12]);
   flower(k,`Yellow flag iris ${i}`,[x,h,z],'#d9b43f',.10,3);
   for(let j=0;j<3;j++)leaf(k,`Iris falling sepal ${i} ${j}`,[x,h,z],.12,.07,'#d0a63c',[.25,j/3*TAU,2.5]);
  }else if(id==='bluebell_patch'){
   for(let j=0;j<4;j++){const xx=x+.027*j,yy=h-.04*j;k.beam(`Bluebell drooping stem ${i} ${j}`,[x,h*.75,z],[xx,yy+.025,z],.003,.003,'leaf');k.cylinder(`Bluebell bell ${i} ${j}`,[xx,yy,z],.017,.028,.043,'#687bab',8);}
   for(let j=0;j<3;j++)leaf(k,`Bluebell narrow leaf ${i} ${j}`,[x,0,z],h*.74,.027,'leaf',[.7,j*2.1,0]);
  }else if(id==='cowslip_patch'){
   for(let j=0;j<5;j++){const a=j/5*TAU,p=[x+Math.cos(a)*.044,h-.015*Math.sin(j),z+Math.sin(a)*.044];k.beam(`Cowslip nodding stem ${i} ${j}`,[x,h-.045,z],p,.003,.003,'leaf');flower(k,`Cowslip yellow flower ${i} ${j}`,p,'#dec455',.03,5);}
   for(let j=0;j<4;j++)leaf(k,`Cowslip rosette leaf ${i} ${j}`,[x,0,z],h*.45,.07,'leaf',[1.1,j*1.57,0]);
  }else{
   flower(k,`Poppy red flower ${i}`,[x,h,z],'#c74f3f',.08,4);k.sphere(`Poppy dark eye ${i}`,[x,h+.006,z],[.025,.01,.025],'black',0);
   for(let j=0;j<3;j++)leaf(k,`Poppy lobed leaf ${i} ${j}`,[x,h*j/4,z],.10,.035,'leaf',[.8,j*2.1,.6],true);
  }
 }
 grass(k,`${id} ground grass`,2,12,.16);
 return root;
}

export function buildVegetation(id){
 if(['apple_tree','pollard_willow','dead_oak','hawthorn','coppice_stool','deer_rub'].includes(id))return tree(id);
 if(id==='bramble_thicket')return buildBush('blackberry');
 if(id==='bracken'){
  const root=new THREE.Group();for(let i=0;i<5;i++){const fern=buildPlants('fiddlehead');fern.position.set(Math.cos(i*2.4)*.4,0,Math.sin(i*2.4)*.4);root.add(fern);}return root;
 }
 const root=new THREE.Group(),k=kit(root),rng=random(id);
 if(id==='ivy_stump'){
  k.cylinder('Rotting stump',[0,.4,0],.52,.7,.8,'wood',9);k.cylinder('Hollow stump top',[0,.803,0],.40,.38,.013,'woodDark',9);
  for(let i=0;i<6;i++){const a=i/6*TAU;tube(k,`Ivy climbing vine ${i}`,[[Math.cos(a)*.66,0,Math.sin(a)*.66],[Math.cos(a+.3)*.55,.4,Math.sin(a+.3)*.55],[Math.cos(a+.7)*.5,.82,Math.sin(a+.7)*.5]],.013,'leafDark',5);for(let j=0;j<5;j++)leaf(k,`Ivy pointed leaf ${i} ${j}`,[Math.cos(a+j*.15)*.58,.14+j*.14,Math.sin(a+j*.15)*.58],.20,.19,'leaf',[0,a,Math.sin(j)],true);}
  return root;
 }
 if(id==='gorse'){
  for(let i=0;i<13;i++){const a=i*2.4,x=Math.cos(a)*.5,z=Math.sin(a)*.5,h=.7+rng()*.4;k.beam(`Gorse woody shoot ${i}`,[x*.4,0,z*.4],[x,h,z],.015,.013,'woodDark');k.rock(`Dense gorse foliage ${i}`,[x*.82,h*.66,z*.82],[.29,.30,.27],i%3?'#617442':'#7a874b',1);for(let j=0;j<11;j++){const yy=.18+j*.072;for(const side of [-1,1])k.beam(`Gorse green spine ${i} ${j} ${side}`,[x*.7,yy,z*.7],[x+side*.12,yy+.1,z],.004,.004,'leaf');const az=j*2.4;flower(k,`Gorse yellow blossom ${i} ${j}`,[x+Math.cos(az)*.16,yy+.08,z+Math.sin(az)*.16],'#e2c749',.07,5);}}
  return root;
 }
 if(id==='mushroom_ring'){
  for(let i=0;i<18;i++){const a=i/18*TAU,r=1.18+rng()*.09,x=Math.cos(a)*r,z=Math.sin(a)*r,h=.09+rng()*.05;k.cylinder(`Fairy ring white stem ${i}`,[x,h*.42,z],.015,.020,h*.84,'plaster',6);k.sphere(`Fairy ring white cap ${i}`,[x,h*.84,z],[.075,.028,.075],'whitewash',1);}
  grass(k,'Fairy ring',2.5,36,.06);return root;
 }
 return flowers(id);
}
