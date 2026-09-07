import {STRONGHOLDS,authorStrongholds} from '../../src/mmo/greenwold/strongholds.js';
import {ROUTES,routeDistance,sampleRoute} from '../../src/mmo/greenwold/routes.js';
import {FOOTPRINT} from '../../src/mmo/plans/footprints.js';
import {ARRANGEMENTS} from './landscape.mjs';
import {clearBoundaryRuns} from './clearance.mjs';

export function strongholdPaths(h){
  const [x,z]=h.approach,side=x<h.at.x?-1:1;
  return z>=h.at.z+50?[[x,z],[h.at.x,h.at.z+43],[h.at.x,h.at.z+32]]:[[x,z],[h.at.x+side*52,h.at.z+43],[h.at.x,h.at.z+43],[h.at.x,h.at.z+32]];
}
export function gradeStrongholds(field,add){
  const roads=ROUTES.map(r=>({r,points:sampleRoute(r,4).map(p=>({...p,h:field.heightAt(p.x,p.z)}))}));
  for(const h of STRONGHOLDS){
    const points=strongholdPaths(h),start=field.heightAt(...h.approach);
    const length=points.slice(1).reduce((d,p,i)=>d+Math.hypot(p[0]-points[i][0],p[1]-points[i][1]),0);
    const natural=field.heightAt(h.at.x,h.at.z),height=Math.max(start-length*.1,Math.min(start+length*.1,natural));
    add({kind:'plateau',x:h.at.x,z:h.at.z,r:75,height,skirt:.28,label:h.id+'-courtyard'});
    let walked=0;
    for(let i=1;i<points.length;i++){
      const[x,z]=points[i-1],[x2,z2]=points[i],distance=Math.hypot(x2-x,z2-z),from=start+(height-start)*walked/length;
      walked+=distance;const to=start+(height-start)*walked/length;
      add({kind:'plateau',x,z,x2,z2,r:9,height:from,height2:to,skirt:.4,label:h.id+'-approach'});
      add({kind:'ground',x,z,x2,z2,r:2.4,word:'path',hardness:.5,label:h.id+'-approach'});
    }
    // The gate meets the same level as the courtyard, without a last step.
    add({kind:'plateau',x:h.at.x,z:h.at.z,r:74,height,skirt:.14,label:h.id+'-floor'});
    add({kind:'ground',x:h.at.x,z:h.at.z,r:43,word:h.id==='occult_tower'?'gravel':'mud',hardness:.28,label:h.id+'-yard'});
  }
  // A camp shelf must never raise a lip across a road that was already graded.
  // Restore just the affected road sections to their original surveyed heights.
  for(const {r,points}of roads)for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i];
    if(Math.max(Math.abs(field.heightAt(a.x,a.z)-a.h),Math.abs(field.heightAt(b.x,b.z)-b.h))<.005)continue;
    add({kind:'plateau',x:a.x,z:a.z,x2:b.x,z2:b.z,r:r.width/2+8,height:a.h,height2:b.h,skirt:.3,label:'preserve-'+r.id});
  }
}

export function buildStrongholds(spaces,field){
  authorStrongholds(spaces);
  for(const h of STRONGHOLDS){
    const s=spaces['greenwold_'+h.id];
    // A broken line of trees screens the rear wall while leaving both flanks
    // and the approach visible. The tower keeps bare branches and stone.
    const species=h.district==='beechhangar'?'beech':'oak';
    if(h.id!=='occult_tower')for(const[x,z,scale]of ARRANGEMENTS.edge){
      const wx=h.at.x+x,wz=h.at.z+z-62;
      if(routeDistance(wx,wz)<5||field.sampleAt(wx,wz).water)continue;
      s.trees.push({species,x,z:z-62,scale,yaw:0,harvest:true});
    }
    s.radius=Math.max(s.radius,...s.trees.map(t=>Math.hypot(t.x,t.z)+1));
  }
  // Authored structures replace earlier tree and dressing compositions only
  // where their physical courtyards overlap. User-created tile spaces remain.
  for(const s of Object.values(spaces)){
    if(!s.id.startsWith('greenwold_')||STRONGHOLDS.some(h=>s.id==='greenwold_'+h.id))continue;
    const inside=(x,z,pad=0)=>STRONGHOLDS.some(h=>Math.hypot(x-h.at.x,z-h.at.z)<54+pad);
    s.trees=(s.trees||[]).filter(p=>!inside(s.at.x+p.x,s.at.z+p.z,2));
    s.pieces=(s.pieces||[]).filter(p=>!inside(s.at.x+p.x,s.at.z+p.z,Math.max(...(FOOTPRINT[p.model]||[0]).slice(0,2))/2));
    s.runs=clearBoundaryRuns(s,STRONGHOLDS.map(h=>({width:112,points:[[h.at.x,h.at.z],[h.at.x+.01,h.at.z]]})));
  }
}
