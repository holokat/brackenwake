import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createWorldField} from '../field.js';
import {createTerrainEdits} from '../terrain_edits.js';
import {authoredDeckAt} from '../authored_traversal.js';
import {HABITATS} from '../../mmo/greenwold/habitats.js';
import {stepPlayer,WALK_SPEED,RUN_SPEED} from '../../game/player.js';
const f=createWorldField(20260904),e=createTerrainEdits();e.load(JSON.parse(readFileSync('public/terrain/greenwold.json')));f.setTerrainEdits(e);
const height=(x,z)=>authoredDeckAt(f,x,z)??f.heightAt(x,z);
let traversals=0,frames=0;
for(const h of HABITATS.filter(h=>h.approach))for(const sprint of [false,true])for(const reverse of [false,true]){
 let start=h.approach,end=[h.at.x,h.at.z];if(reverse)[start,end]=[end,start];
 const distance=Math.hypot(end[0]-start[0],end[1]-start[1]),limit=Math.ceil((distance/(sprint?RUN_SPEED:WALK_SPEED)*2+10)*60);
 const s={x:start[0],z:start[1],y:height(...start),yaw:0};let count=0;
 while(count++<limit){const dx=end[0]-s.x,dz=end[1]-s.z,d=Math.hypot(dx,dz);if(d<.35)break;
  stepPlayer(s,1/60,{z:Math.min(1,d/(sprint?8:1.5)),yaw:Math.atan2(dx,dz),sprint},height);
  assert.equal(!!s.blocked,false,h.id+': approach blocked');assert.ok(!(s.landed?.fallMetres>.6),h.id+': approach fall');
  const sample=f.sampleAt(s.x,s.z);assert.ok(!sample.water||s.y>=sample.waterLevel,h.id+': wet approach');
 }
 assert.ok(count<limit,h.id+': stalled');frames+=count;traversals++;
}
// Both sides of the designed reveal: a full-height tent is concealed on the
// lookout track, then clears the landform near the camp entrance.
function screen(x,z){const tx=497.87,tz=-1017.39,y=height(x,z)+1.65,ty=height(tx,tz)+4,n=150;let max=-Infinity;for(let i=2;i<n-1;i++){const t=i/n;max=Math.max(max,height(x+(tx-x)*t,z+(tz-z)*t)-(y+(ty-y)*t));}return max;}
assert.ok(screen(630.43,-977.29)>1);assert.ok(screen(517.5,-1034.75)<-.2);
console.log(JSON.stringify({sidePathTraversals:traversals,frames,campHidden:screen(630.43,-977.29),campRevealed:screen(517.5,-1034.75)}));
