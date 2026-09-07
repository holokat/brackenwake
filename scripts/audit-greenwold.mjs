// This audit walks the saved landscape with the game's real controller.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createWorldField} from '../src/world/field.js';
import {createTerrainEdits} from '../src/world/terrain_edits.js';
import {ROUTES,sampleRoute,nearestOnSegment} from '../src/mmo/greenwold/routes.js';
import {authoredDeckAt} from '../src/world/authored_traversal.js';
import {stepPlayer, WALK_SPEED, MAX_SLOPE} from '../src/game/player.js';

export function reviewGreenwold() {
 const field=createWorldField(20260904),edits=createTerrainEdits();
 edits.load(JSON.parse(readFileSync(new URL('../public/terrain/greenwold.json',import.meta.url))));field.setTerrainEdits(edits);
 const height=(x,z)=>authoredDeckAt(field,x,z)??field.heightAt(x,z);
 const report={routes:[],samples:0,frames:0,distance:0};
 for(const r of ROUTES){
  const samples=sampleRoute(r,.25);let previous=null,maxGrade=0,wet=0;
  for(const p of samples){const s=field.sampleAt(p.x,p.z),h=height(p.x,p.z);report.samples++;
   if(s.water&&h<s.waterLevel-.05)wet++;
   if(previous)maxGrade=Math.max(maxGrade,Math.abs(h-previous.h)/Math.hypot(p.x-previous.x,p.z-previous.z));previous={...p,h};
  }
  assert.equal(wet,0,`${r.id}: ${wet} samples below water`);
  assert.ok(maxGrade<MAX_SLOPE,`${r.id}: grade ${maxGrade.toFixed(2)} exceeds ${MAX_SLOPE}`);
  const row={id:r.id,grade:+maxGrade.toFixed(3),walks:[]};
  for(const reverse of[false,true]){
   const points=reverse?[...r.points].reverse():r.points;
   const length=points.slice(1).reduce((n,p,i)=>n+Math.hypot(p[0]-points[i][0],p[1]-points[i][1]),0);
   const s={x:points[0][0],z:points[0][1],y:height(...points[0]),yaw:0};
   let leg=1,frames=0,blocked=0,falls=0;
   const limit=Math.ceil((length/WALK_SPEED*1.5+10)*60);
   while(frames++<limit){
    const target=points[leg],dx=target[0]-s.x,dz=target[1]-s.z,d=Math.hypot(dx,dz);
    if(d<.35){if(leg===points.length-1)break;leg++;continue;}
    stepPlayer(s,1/60,{z:Math.min(1,d/1.5),yaw:Math.atan2(dx,dz)},height);
    if(s.blocked){blocked++;if(blocked<3)console.error(r.id,reverse,s.x,s.z);}if(s.landed?.fallMetres>.6)falls++;
   }
   assert.ok(frames<limit,`${r.id} ${reverse?'reverse':'forward'} stalled at ${s.x.toFixed(1)},${s.z.toFixed(1)} (leg ${leg})`);
   assert.equal(blocked,0,`${r.id} ${reverse?'reverse':'forward'}: ${blocked} refused steps`);
   assert.equal(falls,0,`${r.id}: ${falls} route falls`);
   row.walks.push({direction:reverse?'reverse':'forward',seconds:+(frames/60).toFixed(1),blocked});report.frames+=frames;report.distance+=length;
  }
  report.routes.push(row);
 }
 report.distance=Math.round(report.distance);return report;
}
if(process.argv[1]&&new URL(import.meta.url).pathname===process.argv[1])console.log(JSON.stringify(reviewGreenwold(),null,2));
