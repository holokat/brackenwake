import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {readFile} from 'node:fs/promises';
import {OLD_CELLARS_EXTERIOR as spec} from '../mmo/old_cellars_exterior.js';
import {loadProp,pieceBody,buildPlan,propUrlFor} from './plan_models.js';
import {propColliders,createCollisionIndex} from './collision/shapes.js';
import {decide,SITE_REACH} from '../game/interact.js';
import {inspectExterior} from '../../scripts/art/cellars-exterior/verify.mjs';

const plan=JSON.parse(await readFile(new URL('../mmo/spaces/island_cellars.json',import.meta.url)));
const path=new URL('../../public/models/props/old_cellars_entrance.glb',import.meta.url);
const site={id:'s:island_cellars',kind:'dungeon',sub:'oldcellars',realm:'greenwold',...plan.at};

test('Blender asset retains its open portal and a compact rendering budget',async()=>{await inspectExterior();});

test('the real loader and island plan preserve the authored doorway origin and interaction tags',async()=>{
 assert.equal(await loadProp(spec.id,path),true);
 const body=pieceBody(spec.id),bounds=new THREE.Box3().setFromObject(body.group);
 assert.equal(body.source,'glb');assert.ok(Math.abs(bounds.min.x+5)<.01);
 assert.ok(Math.abs(bounds.max.z-1.87)<.02,'The asymmetric mound was not recentered');
 assert.ok(bounds.min.y<0,'Buried lower edges stay below the terrain');
 assert.equal(plan.pieces.filter(p=>p.model===spec.id).length,1);assert.equal(plan.runs.length,0);assert.equal(plan.areas.length,0);
 const manifest=JSON.parse(await readFile(new URL('../../public/models/props/manifest.json',import.meta.url)));
 assert.ok(manifest.ids.includes(spec.id));assert.equal(propUrlFor(spec.id),'/models/props/old_cellars_entrance.glb');
 const g=buildPlan(plan,site,()=>0);g.updateMatrixWorld(true);
 const meshes=[];g.traverse(o=>{if(o.isMesh&&o.userData.plan?.piece===spec.id)meshes.push(o);});
 assert.equal(meshes.length,2);assert.ok(meshes.every(m=>m.userData.site.id===site.id));
 const pick={kind:'site',site:meshes[0].userData.site};
 assert.equal(decide(pick,{},site,0,0).action,'enter');
 assert.equal(decide(pick,{}, {...site,x:site.x+SITE_REACH+1},0,0).action,'blocked');
});

test('collision leaves a walkable throat at every placement angle and scale',()=>{
 for(const scale of [1,1.4])for(const yaw of [0,Math.PI/2,200*Math.PI/180]){
  const c=Math.cos(yaw),s=Math.sin(yaw),at=(x,z,y=.38)=>({x:120+scale*(x*c+z*s),z:-110+scale*(z*c-x*s),y:scale*y});
  const index=createCollisionIndex(propColliders(spec.id,120,-110,0,...spec.footprint.map(v=>v*scale),yaw));
  assert.equal(index.canMove(at(0,2),at(0,-1),.3,1.75),true);
  assert.equal(index.canMove(at(0,0),at(2,0),.3,1.75),false,'Positive control: cannot cross a jamb');
  const front=at(0,1.8,0),top=index.supportAt(front.x,front.z,1);
  assert.ok(top>=0&&top<.08*scale);
 }
});
