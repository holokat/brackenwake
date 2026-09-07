import {THREE,kit,TAU} from '../dressing/shared.js';

export function buildTrunkForage(id){
 const root=new THREE.Group();root.name=`${id} attachment master`;const k=kit(root);
 k.cylinder('Trunk bark sample',[0,.27,0],.15,.18,.54,'wood',9);
 for(let i=0;i<9;i++){const a=i/9*TAU;k.beam(`Raised bark ridge ${i}`,[Math.cos(a)*.17,.02,Math.sin(a)*.17],[Math.cos(a)*.15,.53,Math.sin(a)*.15],.026,.019,'woodDark');}
 if(id==='honey'){
  k.sphere('Dark hollow opening',[0,.29,.16],[.102,.143,.035],'#292522',1);
  for(let row=0;row<6;row++)for(let c=0;c<5;c++){
   const x=(c-2)*.028+(row%2)*.014,y=.20+row*.025;
   if(Math.abs(x)>.065&&row>3)continue;
   k.torus(`Visible honeycomb cell ${row} ${c}`,[x,y,.196],.017,.0034,'#d0a84e',[0,0,Math.PI/6],6);
  }
  for(let i=0;i<5;i++){
   const a=i*2.4,x=Math.cos(a)*.13,y=.26+Math.sin(a)*.12,z=.26+i*.01;
   k.sphere(`Bee ${i} gold abdomen`,[x,y,z],[.012,.007,.007],'#c39a3a',0);k.sphere(`Bee ${i} black head`,[x+.012,y,z],[.004,.006,.006],'black',0);
   for(const side of [-1,1])k.sphere(`Bee ${i} wing ${side}`,[x,y+.004,z+side*.008],[.008,.002,.009],'#cdd0b5',0);
  }
 } else if(id==='cacao'){
  for(let i=0;i<4;i++){
   const a=-.7+i*.48,x=Math.sin(a)*.17,y=.14+i*.07,z=Math.cos(a)*.17;
   k.sphere(`Cacao pod ${i+1}`,[x,y,z],[.041,.09,.045],i%2?'#ac7136':'#8b6137',1);
   for(let n=0;n<7;n++){const aa=n/7*TAU;k.beam(`Cacao pod ${i+1} rib ${n}`,[x+Math.cos(aa)*.025,y-.073,z+Math.sin(aa)*.025],[x+Math.cos(aa)*.04,y+.005,z+Math.sin(aa)*.04],.004,.004,'#cb9750');k.beam(`Cacao pod ${i+1} rib crown ${n}`,[x+Math.cos(aa)*.04,y+.005,z+Math.sin(aa)*.04],[x,y+.086,z],.003,.003,'#cb9750');}
  }
 }
 return root;
}
