import * as THREE from 'three';

// A constant X axis keeps the section from twisting when the loop turns from
// the shield's normal into its vertical grip bar.
function handhold(h,name,path){
 const points=path.map(p=>new THREE.Vector3(...p)),vertices=[],faces=[],n=8,radius=.042;
 for(let i=0;i<points.length;i++){
  const tangent=points[Math.min(i+1,points.length-1)].clone().sub(points[Math.max(0,i-1)]).normalize();
  const normal=new THREE.Vector3(0,tangent.z,-tangent.y);
  for(let j=0;j<n;j++){
   const angle=j*Math.PI*2/n;
   vertices.push(points[i].clone().add(new THREE.Vector3(Math.cos(angle)*radius,0,0)).addScaledVector(normal,Math.sin(angle)*radius).toArray());
  }
 }
 for(let row=0;row<points.length-1;row++)for(let j=0;j<n;j++){
  const a=row*n+j,b=row*n+(j+1)%n;faces.push([a,b,b+n,a+n]);
 }
 faces.push(Array.from({length:n},(_,i)=>n-1-i),Array.from({length:n},(_,i)=>(points.length-1)*n+i));
 return h.mesh(name,vertices,faces,'leather_dark',{variation:0});
}

/** Rear handholds share a shallow opening; the primary bar is the palm socket. */
export function buildShieldFittings(h,id){
 const centers=id==='buckler'?[0]:[-.20,.20],barY=.405;
 for(const[index,x]of centers.entries()){
  const prefix=index===0?'Rear shield hand grip':'Rear shield alternate hand grip';
  // The alternative handhold sits toward the fingers, clear of the forearm.
  const grip=handhold(h,prefix,[[x,.066,-.37],[x,.31,-.37],[x,barY,-.28],[x,barY,.28],[x,.31,.37],[x,.066,.37]]);
  grip.userData.shieldFitting=index===0?'primary-handhold':'alternate-handhold';
  for(const z of[-.37,.37]){
   h.cube(`Rear grip mounting plate ${index} ${z}`,[x,.070,z],[.135,.045,.15],'steel_dark',{bevel:.012});
   h.ico(`Rear grip mounting rivet ${index} ${z}`,[x,.097,z],[.027,.025,.027],'steel_edge',{sub:1,variation:0});
  }
 }
 // The field is centered between paired grips while the primary stays at zero.
 return [-centers[0],-barY,0];
}
