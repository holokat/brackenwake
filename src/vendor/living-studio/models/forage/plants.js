import {THREE,kit,leaf,flower,tube,TAU,random,motion} from '../dressing/shared.js';

export const plantIds=new Set(['dandelion','nettle','wild_garlic','wild_strawberry','fiddlehead','wild_ginger','nut']);

function rosette(k,name,x,z,radius,leaves=7,color='leaf',lobed=false) {
  for(let i=0;i<leaves;i++){
    const a=i/leaves*TAU;
    leaf(k,`${name} leaf ${i}`,[x,.005,z],radius,radius*.50,color,[.65,a,0],lobed);
  }
}

export function buildPlants(id){
 const root=new THREE.Group();root.name=`${id} botanical master`;const k=kit(root),rng=random(id);
 if(id==='nut'){
  for(let i=0;i<5;i++){
   const x=(rng()-.5)*.25,z=(rng()-.5)*.18;
   const split=i%2===0;
   k.sphere(`Chestnut ${i+1} green case`,[x,.028,z],[.033,.028,.031],'#76894d',0);
   for(let n=0;n<24;n++){
    const a=n*2.399,y=(n/24)*2-1,r=Math.sqrt(1-y*y),v=new THREE.Vector3(Math.cos(a)*r,y,Math.sin(a)*r);
    if(split&&v.z>.55)continue;
    const o=k.cone(`Chestnut ${i+1} spine ${n}`,[x+v.x*.031,.028+v.y*.025,z+v.z*.03],.002,.013,'#8c9b57',4);o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),v);
   }
   if(split){k.sphere(`Chestnut ${i+1} open shell`,[x,.029,z+.018],[.026,.023,.017],'#c4c486',0);k.sphere(`Chestnut ${i+1} polished nut`,[x,.029,z+.03],[.018,.019,.014],'#8f4c2b',1);}
  }
 } else if(id==='fiddlehead'){
  for(let i=0;i<7;i++){
   const a=i/7*TAU,h=.32+rng()*.13,group=k.group(`Fern frond ${i+1}`);group.rotation.y=a;const q=kit(group);
   if(i<4){
    tube(q,`Fern ${i+1} arching rachis`,[[0,0,0],[0,h*.5,.055],[0,h*.85,.17],[0,h,.32]],.0045,'#78934c',5);
    for(let j=1;j<11;j++)for(const side of [-1,1]){
     const t=j/11,z=.32*t*t,y=h*(1-(1-t)**1.5),len=.11*Math.sin(t*Math.PI)*(.8+t*.2);
     leaf(q,`Fern ${i+1} feathered pinna ${j} ${side}`,[0,y,z],len,.027,'#71884b',[.55,side*1.22,side*.93],true);
     q.beam(`Fern ${i+1} pinna vein ${j} ${side}`,[0,y,z],[side*len*.76,y+len*.32,z+len*.3],.0018,.0018,'#96a66a');
    }
   }else{
    tube(q,`Fern ${i+1} new shoot`,[[0,0,0],[0,h*.45,.008],[0,h*.81,.025],[0,h*.88,.032]],.007,'#83a052',6);
    const curl=[];for(let n=0;n<=28;n++){const t=n/28,ang=-Math.PI+t*Math.PI*2.15,r=.045*(1-t*.79);curl.push([Math.sin(ang)*r,h*.88+.045+Math.cos(ang)*r,.032]);}
    tube(q,`Fern ${i+1} spiral fiddlehead`,curl,.0068,'#88a357',6);
    for(let j=0;j<4;j++)leaf(q,`Fern ${i+1} unfurling leaflet ${j}`,[0,h*.30+j*.047,.013],.03,.013,'leaf',[.4,j*2.4,.6]);
   }
  }
 } else if(id==='wild_ginger'){
  for(let i=0;i<8;i++){
   const a=i/8*TAU,x=Math.cos(a)*.12,z=Math.sin(a)*.12,h=.11+rng()*.035;
   k.beam(`Ginger petiole ${i}`,[x*.6,0,z*.6],[x,h,z],.006,.006,'leafDark');
   const shape=new THREE.Shape();shape.moveTo(0,0);shape.bezierCurveTo(-.14,.02,-.095,.16,0,.08);shape.bezierCurveTo(.095,.16,.14,.02,0,0);
   const o=k.mesh(`Ginger heart shaped leaf ${i}`,new THREE.ShapeGeometry(shape,4),'#506941');o.position.set(x,h,z);o.rotation.set(-1.0,a,0);o.material.side=THREE.DoubleSide;
  }
  for(let i=0;i<3;i++)flower(k,`Ginger basal red flower ${i}`,[(i-1)*.032,.018,.02],'#7c3b35',.025,3);
 } else if(id==='nettle'){
  for(let i=0;i<6;i++){
   const x=(rng()-.5)*.28,z=(rng()-.5)*.24,h=.55+rng()*.25;
   k.beam(`Nettle ${i+1} square stem`,[x,0,z],[x+.015,h,z],.008,.008,'leafDark');
   for(let n=1;n<6;n++)for(const side of [-1,1])leaf(k,`Nettle ${i+1} toothed opposite leaf ${n} ${side}`,[x,n/6*h,z],.14*(1-n*.09),.082,'leaf',[.65,n*.9,side*.9],true);
   for(let j=0;j<3;j++)k.sphere(`Nettle ${i+1} pendant flower ${j}`,[x+.025,.35+j*.08,z+.01],[.01,.04,.01],'#8a9b61',0);
  }
 } else {
  const count=id==='dandelion'?5:id==='wild_garlic'?7:5;
  for(let i=0;i<count;i++){
   const x=(rng()-.5)*.33,z=(rng()-.5)*.3;
   rosette(k,`${id} rosette ${i}`,x,z,id==='wild_garlic'?.25:.13,id==='wild_strawberry'?3:6,id==='wild_garlic'?'#789449':'leaf',id==='dandelion');
   const h=(id==='dandelion'?.14:id==='wild_garlic'?.23:.15)*( .8+rng()*.25);
   if(id==='wild_strawberry'){
    for(let j=0;j<3;j++)leaf(k,`Strawberry ${i} trifoliate leaf ${j}`,[x,h*.7,z],.075,.075,'leaf',[.8,j/3*TAU,.2],true);
    const p=[x+.025,.045,z+.025];k.sphere(`Strawberry ${i} red fruit`,p,[.017,.024,.017],'#be4935',1);
    for(let j=0;j<5;j++){const a=j/5*TAU;k.sphere(`Strawberry ${i} seed ${j}`,[p[0]+Math.cos(a)*.016,p[1]+.006,p[2]+Math.sin(a)*.016],[.0018,.003,.0018],'straw',0);}
    flower(k,`Strawberry ${i} blossom`,[x-.02,h,z],'whitewash',.025,5);
   } else {
    k.cylinder(`${id} flower stem ${i}`,[x,h/2,z],.002,.003,h,'leafDark',5);
    if(id==='dandelion'&&i%3===0){
     k.sphere(`Dandelion clock receptacle ${i}`,[x,h,z],[.006,.006,.006],'#b8b293',0);
     for(let n=0;n<34;n++){
      const a=n*2.399,yy=1-2*(n+.5)/34,r=Math.sqrt(1-yy*yy),v=new THREE.Vector3(Math.cos(a)*r,yy,Math.sin(a)*r),p=new THREE.Vector3(x,h,z).addScaledVector(v,.031);
      k.beam(`Dandelion seed filament ${i} ${n}`,[x,h,z],p.toArray(),.0006,.0006,'#e0e2cd');
      const tangent=new THREE.Vector3().crossVectors(v,new THREE.Vector3(0,1,0)).normalize(),bitangent=new THREE.Vector3().crossVectors(v,tangent);
      for(let j=0;j<3;j++){const b=j/3*TAU,tip=p.clone().addScaledVector(tangent,Math.cos(b)*.006).addScaledVector(bitangent,Math.sin(b)*.006).addScaledVector(v,.002);k.beam(`Dandelion seed parachute ${i} ${n} ${j}`,p.toArray(),tip.toArray(),.0005,.0005,'whitewash');}
     }
    } else if(id==='dandelion')flower(k,`Dandelion yellow head ${i}`,[x,h,z],'#e6bb42',.032,11);
    else for(let n=0;n<5;n++){const a=n/5*TAU;flower(k,`Garlic white star ${i} ${n}`,[x+Math.cos(a)*.025,h,z+Math.sin(a)*.025],'whitewash',.018,6);}
   }
  }
 }
 motion(root,'sway',{amount:id==='nut'?0:.014,speed:1.2});
 return root;
}
