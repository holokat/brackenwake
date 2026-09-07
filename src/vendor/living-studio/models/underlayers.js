import {Geometry} from './geometry.js';
export function buildUnderlayers(group,armor){
 const h=new Geometry(group);h.part='outfit';
 const mat={warrior:'cloth_dark',mage:'blue_dark',wizard:'violet_dark',ranger:'green_dark'}[armor];
 for(const side of[-1,1]){
  const leg=h.loft(`Inner trouser leg ${side}`,[[side*.87,.025,.47,.18,.18],[side*.84,.03,1.1,.205,.21],[side*.78,.04,1.7,.24,.235],[side*.67,-.04,2.24,.23,.225],[side*.58,.04,2.9,.295,.30],[side*.48,.04,3.75,.30,.31]],mat,{n:10,variation:.025});
  leg.userData.slot='armor';leg.userData.colorChannel='cloth';
 }
}
export function fitBootClearance(group,boots){
 if(boots==='none')return;
 const top=boots==='mage'?1.3:2.32;
 group.traverse(o=>{
  if(!o.isMesh||o.userData.slot!=='armor'||!/trouser|leg/i.test(o.name))return;
  const p=o.geometry.attributes.position;
  for(let i=0;i<p.count;i++){
   const z=p.getZ(i);if(z>=top)continue;
   const side=p.getX(i)<0?-1:1,cx=side*(.87-Math.max(0,z-.48)*.105),cy=.025;
   let dx=p.getX(i)-cx,dy=p.getY(i)-cy;const r=Math.hypot(dx,dy),limit=.172+Math.max(0,z)*.049;
   if(r>limit){dx*=limit/r;dy*=limit/r;p.setXYZ(i,cx+dx,cy+dy,z);}
  }
  o.geometry.computeVertexNormals();
 });
}
export function buildHelmetLining(group,headwear){
 if(headwear!=='warrior')return;
 const h=new Geometry(group);h.part='head';
 const mesh=h.loft('Helmet neck lining',[[0,.045,6.48,.35,.28],[0,.045,6.69,.29,.255],[0,.05,6.99,.28,.27]],'cloth_dark',{n:10,variation:.02});
 mesh.userData.slot='headwear';mesh.userData.tintRole='accent';
}
