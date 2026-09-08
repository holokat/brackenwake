import {CELL,walkable,worldOf,gridOf,floorAt} from '../dungeon_gen.js';
import {ceilingAt} from '../dungeon.js';
import {createCollisionIndex} from './shapes.js';
import {meshEnvelopes} from './mesh-envelopes.js';
const cache=new WeakMap();
/** Reuse the actual carved grid and rendered chest parts for each level. */
export function dungeonPhysical(layout,scene){
 if(cache.has(layout))return cache.get(layout);
 const bodies=[...(scene?.physicalBodies || [])];
 for(let z=0;z<layout.h;z++)for(let x=0;x<layout.w;x++){
  if(walkable(layout,x,z))continue;
  if(![[1,0],[-1,0],[0,1],[0,-1]].some(([dx,dz])=>walkable(layout,x+dx,z+dz)))continue;
  const p=worldOf(layout,x,z);bodies.push({kind:'box',model:'dungeon rock',...p,y:-100,h:300,w:CELL,d:CELL,c:1,s:0});
 }
 for(const chest of scene?.chestMeshes||[])bodies.push(...meshEnvelopes(chest));
 const index=createCollisionIndex(bodies),canMove=index.canMove,fixtureCeiling=index.ceilingAt;
 index.canMove=(from,to,r,h)=>{const g=gridOf(layout,to.x,to.z);return walkable(layout,g.gx,g.gz)&&canMove(from,to,r,h);};
 index.ceilingAt=(x,z,feet=-100)=>{const g=gridOf(layout,x,z);return Math.min(fixtureCeiling(x,z,feet),floorAt(layout,g.gx,g.gz)+ceilingAt(layout,g.gx,g.gz));};
 cache.set(layout,index);return index;
}
