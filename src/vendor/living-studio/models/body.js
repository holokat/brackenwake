import * as THREE from 'three';
import {headRecipes} from './head-spec.js';

export function buildBody(h,variant='base'){
 h.part='skin';
 if(variant==='base'){
  const rows=[[3.57,.25,.26,.04],[3.84,.58,.39,.025],[4.07,.73,.43,.02],[4.33,.71,.37,0],[4.57,.66,.34,0],[4.8,.68,.36,0],[5.04,.75,.40,0],[5.27,.82,.43,0],[5.50,.91,.46,0],[5.73,1.0,.48,0],[5.97,1.04,.48,0],[6.18,1.08,.43,0],[6.35,.99,.34,0],[6.53,.58,.28,.01],[6.68,.28,.24,.025]],n=20,v=[],f=[];
  for(const[z,rx,ry,cy]of rows)for(let k=0;k<n;k++){
   const a=k*Math.PI*2/n,x=rx*Math.sin(a),front=Math.max(0,Math.cos(a))**3;
   const pec=.085*Math.exp(-1*(((Math.abs(x)-.47)/.36)**2+((z-5.99)/.3)**2)),ab=.07*Math.exp(-1*((Math.abs(x)-.25)/.20)**2)*[4.8,5.10,5.43].reduce((s,zz)=>s+Math.exp(-1*((z-zz)/.13)**2),0),st=.06*Math.exp(-1*((x/.12)**2+((z-5.9)/.8)**2));
   v.push([x,cy-ry*Math.cos(a)-front*(pec+ab-st),z]);
  }
  for(let j=0;j<rows.length-1;j++)for(let k=0;k<n;k++){const a=j*n+k,b=j*n+(k+1)%n,c=(j+1)*n+(k+1)%n,d=(j+1)*n+k;f.push(...((j+k)%2?[[a,b,c],[a,c,d]]:[[a,b,d],[b,c,d]]));}
  h.mesh('Anatomy torso and pelvis',v,f,'skin',{variation:.13});
 }
 h.loft('Neck',[[0,.025,6.36,.34,.27],[0,.05,6.62,.28,.24],[0,.06,6.9,.255,.25],[0,.05,7.12,.26,.27]],'skin',{n:10});
 for(const[method,args,opts]of headRecipes){

  h.part=/hair|Hair|Sideburn/.test(args[0])?'hair':'head';h[method](...args,opts);
 }
 h.part='skin';
 for(const s of[-1,1]){
  {
   h.loft(`Leg ${s}`,[[s*.87,0,.40,.195,.195],[s*.85,.055,.74,.20,.235],[s*.83,.08,1.1,.27,.29],[s*.80,.10,1.5,.34,.34],[s*.72,.02,1.88,.28,.25],[s*.67,-.065,2.19,.255,.26],[s*.64,-.07,2.46,.31,.325],[s*.61,.035,2.83,.395,.39],[s*.53,.06,3.23,.415,.44],[s*.48,.055,3.65,.405,.44],[s*.43,.04,4.12,.30,.30],[s*.40,.04,4.3,.24,.24]],'skin',{n:10,variation:.13});
   h.loft(`Bare foot ${s}`,[[s*1.03,-.2,.035,.36,.48],[s*1.02,-.21,.19,.35,.48],[s*.94,-.13,.34,.28,.37],[s*.87,0,.55,.19,.22]],'skin',{n:10,phase:Math.PI/10,variation:.12});
  }
  let shoulder=[s*1.03,0,6.13],elbow=[s*1.45,-.015,5.05],wrist=[s*1.61,-.22,4.03];
  if(variant==='base'){shoulder=[s*1.10,0,6.30];elbow=[s*1.64,-.03,5.03];wrist=[s*2.03,-.07,4.14];}
  if((variant==='mage'||variant==='wizard')&&s===-1){elbow=[-1.56,0,4.9];wrist=[-2.56,-.35,4.93];}
  const a=new THREE.Vector3(...shoulder),b=new THREE.Vector3(...elbow),c=new THREE.Vector3(...wrist),p=[a.clone().add(new THREE.Vector3(-s*.33,0,.09)),a,a.clone().lerp(b,.28),a.clone().lerp(b,.59),a.clone().lerp(b,.82),b,b.clone().lerp(c,.25),b.clone().lerp(c,.55),b.clone().lerp(c,.8),c];
  h.tube(`Arm ${s}`,p.map(v=>v.toArray()),[[.23,.24],[.37,.36],[.34,.34],[.29,.32],[.25,.27],[.215,.225],[.27,.25],[.245,.22],[.175,.17],[.14,.13]],'skin',{sides:10,variation:.10});

 }
 h.part='outfit';
}
