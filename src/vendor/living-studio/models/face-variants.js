import {Geometry} from './geometry.js';

export function fitFemaleFace(group,headwear){
 const remove=[];
 group.traverse(o=>{
  if(!o.isMesh)return;
  if(o.userData.part==='hair'){remove.push(o);return;}
  if(o.userData.part!=='head')return;
  const p=o.geometry.attributes.position,n=o.name.toLowerCase();
  for(let i=0;i<p.count;i++){
   let x=p.getX(i),y=p.getY(i),z=p.getZ(i);
   if(n.includes('head facial')){const jaw=Math.max(0,1-Math.abs(z-7.10)/.43);x*=1-jaw*.13;y+=jaw*.015;}
   if(n.includes('nose')){x*=.82;y+=(Math.max(0,-y-.35))*.30;}
   if(n.includes('brow'))z=7.64+(z-7.64)*.64;
   p.setXYZ(i,x,y,z);
  }
  o.geometry.computeVertexNormals();
 });
 for(const o of remove){o.removeFromParent();o.geometry.dispose();}
 if(['warrior','mage'].includes(headwear))return;
 const h=new Geometry(group);h.part='hair';
 // Broad swept locks, no fine strands or image maps.
 h.loft('Female swept hair cap',[[0,.08,7.56,.37,.33],[0,.08,7.82,.40,.37],[0,.08,7.96,.29,.31],[0,.09,8.02,.09,.12]],'hair',{n:10,variation:.025});
 h.mesh('Female swept fringe',[[-.38,-.18,7.72],[-.27,-.32,7.96],[.20,-.33,7.98],[.39,-.16,7.75],[.16,-.37,7.77],[-.17,-.33,7.61],[-.39,-.14,7.61]],[[0,1,5],[1,2,4,5],[2,3,4],[0,5,6]],'hair',{variation:.02});
 if(headwear==='none'){
  h.loft('Female tied back hair',[[0,.30,7.57,.29,.20],[0,.41,7.25,.24,.21],[.06,.48,6.81,.17,.17],[.11,.49,6.52,.085,.10]],'hair',{n:7,variation:.025});
  h.loft('Hair leather tie',[[0,.37,7.39,.26,.21],[0,.38,7.32,.25,.21]],'leather_dark',{n:8});
 }
}
