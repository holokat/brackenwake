import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SPACES} from '../../src/mmo/spaces/index.js';
import {spaceSiteRow} from '../../src/world/sites.js';
import {createWorldField} from '../../src/world/field.js';
import {createTerrainEdits} from '../../src/world/terrain_edits.js';
import {authoredDeckAt} from '../../src/world/authored_traversal.js';
import {stationsForSite} from '../../src/game/win_crafting.js';
import {greenwoldCollision} from './audit-collision.mjs';
import {createCollisionIndex,propColliders} from '../../src/world/collision/shapes.js';
const field=createWorldField(20260904),edits=createTerrainEdits();edits.load(JSON.parse(readFileSync('public/terrain/greenwold.json')));field.setTerrainEdits(edits);
const height=(x,z)=>authoredDeckAt(field,x,z)??field.heightAt(x,z),base=greenwoldCollision(height),report=[];
for(const s of Object.values(SPACES).filter(s=>s.id.startsWith('greenwold_')&&s.stations?.length)){
 const stations=stationsForSite(spaceSiteRow(s,field)),physical=createCollisionIndex([...base.bodies,...stations.flatMap(r=>propColliders('workshop',r.x,r.z,height(r.x,r.z),1.6,1.2,1.1,r.yaw))]);
 const start={x:s.at.x+(s.arrival?.x||0),z:s.at.z+(s.arrival?.z||0)};start.y=height(start.x,start.z);
 const todo=[{...start,i:0,j:0}],seen=new Set(['0:0']),found=new Map();
 for(let k=0;k<todo.length;k++){
  const p=todo[k];for(const station of stations)if(!found.has(station.id)&&Math.hypot(p.x-station.x,p.z-station.z)<3.5)found.set(station.id,p);
  if(found.size===stations.length)break;
  for(const [di,dj]of [[1,0],[-1,0],[0,1],[0,-1]]){
   const i=p.i+di,j=p.j+dj,key=i+':'+j;if(Math.abs(i)>80||Math.abs(j)>80||seen.has(key))continue;seen.add(key);
   const x=start.x+i,z=start.z+j,y=height(x,z),sample=field.sampleAt(x,z),q={x,y,z,i,j};
   if(sample.water&&y<sample.waterLevel||Math.abs(y-p.y)>.5||!physical.canMove(p,q))continue;todo.push(q);
  }
 }
 for(const station of stations){const approach=found.get(station.id);report.push({space:s.id,station:station.id,reachable:!!approach,approach:approach&&{x:approach.x,y:approach.y,z:approach.z}});}
}
console.log(JSON.stringify(report,null,2));assert.ok(report.length>0);assert.ok(report.every(s=>s.reachable),'Every workshop must have an open route from its arrival');
