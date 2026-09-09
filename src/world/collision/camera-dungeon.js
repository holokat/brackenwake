import {cellsCrossed,cornerCeil} from '../dungeon.js';
import {gridOf,floorAt,walkable} from '../dungeon_gen.js';
import {cellarFloorAt} from '../cellar_floor.js';
import {CELLAR_ENTRY_PLAN as entry,hasCellarEntry} from '../cellar_entry_layout.js';

// Camera bounds may be conservative around the vault's ribs, but never higher
// than the visible shell. These use the exported room dimensions, not the old
// procedural room grid that the Blender rooms replaced.
function vault(x,rx,ceiling,spring=.48) {
  return ceiling*(spring+(1-spring)*Math.sqrt(Math.max(0,1-(x/rx)**2)))-1.5;
}
function bounds(L,x,z) {
  const g=gridOf(L,x,z),floor=L.siteId==='oldcellars'?cellarFloorAt(L,x,z):floorAt(L,g.gx,g.gz);
  if(hasCellarEntry(L)) {
    for(const r of entry.rooms) {
      const xx=x-entry.origin.x-r.x,zz=z-entry.origin.z-r.z;
      if(Math.abs(xx)<=r.rx&&Math.abs(zz)<=r.rz)
        return [entry.origin.y+r.y,entry.origin.y+r.y+vault(xx,r.rx,r.ceiling,.47)];
    }
    if(Math.abs(x-entry.origin.x)<=6.4&&z>=125&&z<=147)
      return [floor,floor+4.5+Math.sqrt(Math.max(0,5.7**2-(x-entry.origin.x)**2))-.8];
  }
  for(const r of L.descent||[])if(Math.abs(x-r.x)<=r.spec.rx&&Math.abs(z-r.z)<=r.spec.rz)
    return [r.y,r.y+vault(x-r.x,r.spec.rx,r.spec.ceiling)];
  // The cave ceiling interpolates its corner minima. Using the lowest corner
  // stays on its inner side, including a low doorway next to a tall chamber.
  const roof=Math.min(...[[0,0],[1,0],[0,1],[1,1]].map(([a,b])=>cornerCeil(L,g.gx+a,g.gz+b)));
  return [floor,floor+roof];
}

export function dungeonCameraDistance(L,from,to,radius,maxDistance) {
  const distance=Math.hypot(to.x-from.x,to.y-from.y,to.z-from.z);
  if(distance<1e-9)return 0;
  let limit=Math.min(1,maxDistance/distance);
  const offsets=[[0,0],[radius,0],[-radius,0],[0,radius],[0,-radius]];
  for(const [ox,oz]of offsets) {
    const cells=cellsCrossed(L,from.x+ox,from.z+oz,to.x+ox,to.z+oz);
    for(let i=0;i<cells.length;i++) {
      const c=cells[i],start=c.t,end=Math.min(limit,cells[i+1]?.t??1);
      if(start>limit)break;
      if(!walkable(L,c.gx,c.gz)){limit=Math.min(limit,start);break;}
      // Evaluate each end of the cell interval. Floor transitions are sampled
      // from the continuous terrain function rather than rounded grid heights.
      let previous=start;
      const point=t=>({x:from.x+(to.x-from.x)*t+ox,y:from.y+(to.y-from.y)*t,z:from.z+(to.z-from.z)*t+oz});
      const clear=t=>{const p=point(t),[floor,roof]=bounds(L,p.x,p.z);return p.y>=floor+radius&&p.y<=roof-radius;};
      const n=Math.max(1,Math.ceil((end-start)*distance/.4));
      for(let j=0;j<=n;j++) {
        const t=start+(end-start)*j/n;
        if(!clear(t)) {
          let lo=previous,hi=t;
          for(let k=0;k<12;k++){const mid=(lo+hi)/2;if(clear(mid))lo=mid;else hi=mid;}
          limit=Math.min(limit,lo);break;
        }
        previous=t;
      }
    }
  }
  return limit*distance;
}
