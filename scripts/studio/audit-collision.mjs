import {readFileSync}from'node:fs';
import {SPACES}from'../../src/mmo/spaces/index.js';
import {ROUTES,sampleRoute}from'../../src/mmo/greenwold/routes.js';
import {createWorldField}from'../../src/world/field.js';
import {createTerrainEdits}from'../../src/world/terrain_edits.js';
import {authoredDeckAt}from'../../src/world/authored_traversal.js';
import {buildPlan}from'../../src/world/plan_models.js';
import {createCollisionIndex}from'../../src/world/collision/shapes.js';
export function greenwoldCollision(height,spaces=SPACES){
 const bodies=[];
 for(const plan of Object.values(spaces).filter(p=>p.id.startsWith('greenwold_'))){const group=buildPlan(plan,{id:'s:'+plan.id,space:plan.id,x:plan.at.x,z:plan.at.z,realm:'greenwold',y:height(plan.at.x,plan.at.z)},height);if(!group)continue;for(const b of group.userData.colliders||[])bodies.push({...b,space:plan.id});}
 return createCollisionIndex(bodies);
}
export function auditCollision(){
const field=createWorldField(20260904),edits=createTerrainEdits();edits.load(JSON.parse(readFileSync('public/terrain/greenwold.json')));field.setTerrainEdits(edits);
const height=(x,z)=>authoredDeckAt(field,x,z)??field.heightAt(x,z);
const physical=greenwoldCollision(height),blocks=new Map();let samples=0;
for(const r of ROUTES)for(const p of sampleRoute(r,.5)){samples++;const b=physical.at(p.x,height(p.x,p.z),p.z);if(b){const key=r.id+':'+b.space+':'+b.model;if(!blocks.has(key))blocks.set(key,{route:r.id,space:b.space,model:b.model,x:b.x,z:b.z,w:b.w,d:b.d,r:b.r,path:p});}}
return {bodies:physical.bodies.length,samples,blocks:[...blocks.values()]};
}
if(process.argv[1]===new URL(import.meta.url).pathname){const report=auditCollision();console.log(JSON.stringify(report,null,2));if(report.blocks.length)process.exitCode=1;}
