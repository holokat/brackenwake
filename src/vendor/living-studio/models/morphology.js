import * as THREE from 'three';
const smooth=(a,b,t)=>a+(b-a)*t;
const rows=[[0,.93,.94],[2.2,.94,.94],[3.8,1.08,1.02],[4.35,1.02,.98],[4.85,.85,.92],[5.35,.90,1.0],[5.8,.92,1.06],[6.3,.84,.88],[6.7,.88,.88],[7.0,.87,.91],[7.4,.94,.95],[8.5,.97,.97]];
export function femalePoint(x,y,z){
 let k=0;while(k<rows.length-2&&z>rows[k+1][0])k++;
 const a=rows[k],b=rows[k+1],t=THREE.MathUtils.clamp((z-a[0])/(b[0]-a[0]),0,1);
 return [x*smooth(a[1],b[1],t),y*smooth(a[2],b[2],t),z*.965];
}
export function fitBodyType(group,bodyType){
 if(bodyType!=='female')return;
 group.traverse(o=>{
  if(!o.isMesh)return;const p=o.geometry.attributes.position;
  if(o.userData.slot==='weapon'){
   const n=o.name.toLowerCase(),staff=/staff|crystal|orb/.test(n),anchor=o.userData.weaponAnchor||(staff?[-2.82,-.37,4.92]:/bow/.test(n)?[1.71,-.39,3.71]:[.85,-.03,4.7]);
   const target=femalePoint(...anchor);
   for(let i=0;i<p.count;i++)p.setXYZ(i,target[0]+(p.getX(i)-anchor[0])*.965,target[1]+(p.getY(i)-anchor[1])*.965,target[2]+(p.getZ(i)-anchor[2])*.965);
  }else for(let i=0;i<p.count;i++)p.setXYZ(i,...femalePoint(p.getX(i),p.getY(i),p.getZ(i))); 
  p.needsUpdate=true;o.geometry.computeVertexNormals();o.geometry.computeBoundingBox();o.geometry.computeBoundingSphere();
 });
}
