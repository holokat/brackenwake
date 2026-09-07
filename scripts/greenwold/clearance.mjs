import {FOOTPRINT,STANDIN} from '../../src/mmo/plans/footprints.js';
import {routeDistance} from '../../src/mmo/greenwold/routes.js';

// Gatehouses and open pavilions intentionally admit the road. Solid building
// footprints do not, even while the character controller lacks wall collision.
const SOLID_BODIES=new Set(['house','towered','stable','mill','granary','openShed','tent']);
function crosses(a,b,w,d,padding){
 let lo=0,hi=1;
 for(let k=0;k<2;k++){
  const delta=b[k]-a[k],r=(k?d:w)/2+padding;
  if(Math.abs(delta)<1e-8){if(Math.abs(a[k])>r)return false;}
  else{
   let t0=(-r-a[k])/delta,t1=(r-a[k])/delta;if(t0>t1)[t0,t1]=[t1,t0];
   lo=Math.max(lo,t0);hi=Math.min(hi,t1);if(lo>hi)return false;
  }
 }
 return true;
}

export function buildingsOnRoutes(spaces,routes,padding=.6){
 const out=[];
 for(const space of Object.values(spaces).filter(s=>s.id.startsWith('greenwold_')))for(const p of space.pieces){
  if(!SOLID_BODIES.has(STANDIN[p.model]?.body))continue;
  const [w,d]=FOOTPRINT[p.model],yaw=(p.yaw||0)*Math.PI/180,c=Math.cos(yaw),s=Math.sin(yaw);
  const x=space.at.x+p.x,z=space.at.z+p.z,k=p.scale??1;
  const local=a=>[c*(a[0]-x)-s*(a[1]-z),s*(a[0]-x)+c*(a[1]-z)];
  for(const route of routes)if(route.points.slice(1).some((b,i)=>crosses(local(route.points[i]),local(b),w*k,d*k,padding))){
   out.push({space:space.id,model:p.model,x:p.x,z:p.z,route:route.id});
  }
 }
 return out;
}

const BOUNDARIES=new Set(['mound_fence','flint_wall_4m','hedge_4m','camp_fence','fence_rail_3m','palisade_stake_3m']);
const band=(p,v,min,max)=>Math.abs(v)<1e-10?(p>=min&&p<=max?[0,1]:null):[Math.max(0,Math.min((min-p)/v,(max-p)/v)),Math.min(1,Math.max((min-p)/v,(max-p)/v))];
function roadCuts(a,b,routes,padding){
 const cuts=[],vx=b[0]-a[0],vz=b[1]-a[1],length2=vx*vx+vz*vz;
 if(!length2)return cuts;
 const add=(lo,hi)=>{lo=Math.max(0,lo);hi=Math.min(1,hi);if(hi-lo>1e-6)cuts.push([lo,hi]);};
 for(const route of routes)for(let i=1;i<route.points.length;i++){
  const c=route.points[i-1],d=route.points[i],dx=d[0]-c[0],dz=d[1]-c[1],len=Math.hypot(dx,dz),r=route.width/2+padding;
  if(!len)continue;
  const along=band(((a[0]-c[0])*dx+(a[1]-c[1])*dz)/len,(vx*dx+vz*dz)/len,0,len);
  const across=band(((a[0]-c[0])*dz-(a[1]-c[1])*dx)/len,(vx*dz-vz*dx)/len,-r,r);
  if(along&&across)add(Math.max(along[0],across[0]),Math.min(along[1],across[1]));
  for(const end of[c,d]){
   const x=a[0]-end[0],z=a[1]-end[1],dot=x*vx+z*vz,disc=dot*dot-length2*(x*x+z*z-r*r);
   if(disc>=0){const root=Math.sqrt(disc);add((-dot-root)/length2,(-dot+root)/length2);}
  }
 }
 return cuts.sort((a,b)=>a[0]-b[0]);
}

// Subtract the authored road corridor from a boundary. Analytic intervals avoid
// sampling jitter and prevent repeated authoring from steadily widening gates.
export function clearBoundaryRuns(space,routes){
 const out=[],round=n=>Math.round(n*1000)/1000;
 for(const run of space.runs){
  if(!BOUNDARIES.has(run.model)){out.push(run);continue;}
  const a=[space.at.x+run.from.x,space.at.z+run.from.z],b=[space.at.x+run.to.x,space.at.z+run.to.z];
  const length=Math.hypot(b[0]-a[0],b[1]-a[1]);let start=0;
  const keep=end=>{
   if((end-start)*length<2)return;
   const at=t=>({x:round(run.from.x+(run.to.x-run.from.x)*t),z:round(run.from.z+(run.to.z-run.from.z)*t)});
   out.push({...run,from:at(start),to:at(end)});
  };
  for(const [lo,hi]of roadCuts(a,b,routes,2.5)){if(lo>start)keep(lo);start=Math.max(start,hi);}
  keep(1);
 }
 return out;
}

export function boundariesOnRoutes(spaces,routes){
 const out=[];
 for(const space of Object.values(spaces).filter(s=>s.id.startsWith('greenwold_')))for(const run of space.runs){
  if(!BOUNDARIES.has(run.model))continue;
  const steps=Math.ceil(Math.hypot(run.to.x-run.from.x,run.to.z-run.from.z)*2);
  for(let i=0;i<=steps;i++){
   const t=i/(steps||1),x=space.at.x+run.from.x+(run.to.x-run.from.x)*t,z=space.at.z+run.from.z+(run.to.z-run.from.z)*t;
   if(routeDistance(x,z,routes)<1){out.push({space:space.id,model:run.model});break;}
  }
 }
 return out;
}
