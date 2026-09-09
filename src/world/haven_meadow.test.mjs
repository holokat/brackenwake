import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';
import {loadProp,buildPlan,drawCallsOf} from './plan_models.js';
import {MEADOW_FOOTPRINTS,isMeadowFoliage} from '../mmo/haven_meadow_assets.js';
import {SPACES} from '../mmo/spaces/index.js';
import {auditSpaces} from '../mmo/plans/plan_schema.js';
import {propColliders,createCollisionIndex} from './collision/shapes.js';
import {createTerrainEdits} from './terrain_edits.js';
import {createWorldField} from './field.js';
import {settleMeadowFoliage} from './prop_motion.js';
import {roofEnvelope,roofHeightAt} from './weather_shelter.js';
import {createForageClearance} from './forage_clearance.js';
const root=new URL('../../',import.meta.url),space=SPACES.island_kite_meadow;
const forageAllowed=createForageClearance({meadow:space});
assert.equal(forageAllowed({members:[{x:-25,z:386}]}),false,'Wild bushes stay out of the picnic table');
assert.equal(forageAllowed({members:[{x:-20,z:401}]}),true,'Wild resources remain in the meadow');
assert.equal(forageAllowed({members:[{x:-25,z:386}],onTrunk:true}),true,'Tree-attached resources retain their support');
const changingField={},scopedClearance=createForageClearance({meadow:space},changingField);
const beneathShelter={members:[{x:-25,z:386}]};
assert.equal(scopedClearance(beneathShelter),true,'An island shelter cannot clear the generated world');
changingField.sculpt={world:'island'};
assert.equal(scopedClearance(beneathShelter),false,'Clearance follows the terrain when it finishes loading');
changingField.sculpt={world:'greenwold'};
assert.equal(scopedClearance(beneathShelter),true,'Island clearance cannot remove Greenwold resources');
const terrain=JSON.parse(fs.readFileSync(new URL('public/terrain/island.json',root)));
const f=createWorldField(20260908,{homeBiome:'meadow',homeY:-.3});
const edits=createTerrainEdits({baseHeight:(x,z)=>f.heightAt(x,z)});edits.load(terrain);f.setTerrainEdits(edits);
for(const id of Object.keys(MEADOW_FOOTPRINTS))assert.equal(await loadProp(id,new URL(`public/models/props/${id}.glb`,root).pathname),true,`${id} loads through production GLTF parser`);
const group=buildPlan(space,{id:'s:'+space.id,name:space.name,realm:'greenwold',x:space.at.x,z:space.at.z},(x,z)=>f.heightAt(x,z));
let triangles=0,meshes=0;
group.traverse(o=>{if(!o.isMesh)return;meshes++;const g=o.geometry;triangles+=(g.index?.count||g.attributes.position.count)/3*(o.isInstancedMesh?o.count:1);if(o.userData.plan?.source==='glb')assert.ok(g.attributes.color,'Vertex colours survive the game loader');for(const a of Object.values(g.attributes))assert.ok([...a.array].every(Number.isFinite),'Finite vertex attributes');});
assert.ok(drawCallsOf(group)<=22,'Bounded meadow draw calls');assert.ok(triangles<320000,'Bounded complete meadow triangle count');
const physical=createCollisionIndex(group.userData.colliders);
const routes=JSON.parse(fs.readFileSync(new URL('assets/models/haven-meadow/routes.json',root))).paths;
for(const path of routes)for(const[x,z]of path){
 const y=f.heightAt(x,z);assert.equal(physical.at(x,y+.05,z,.35,1.75),null,`Clear path at ${x},${z}`);
 assert.equal(f.sampleAt(x,z).ground,'sand','Walking route is painted into the actual terrain');
}
// The authored harvestable oak is streamed by the flora system, outside this plan.
for(const[x,z]of routes[0])assert.ok(Math.hypot(x+.39,z-358.29)>2.1,'Trail leaves room around the existing oak');
for(const id of['meadow_arbor','meadow_fishing_awning']){
 const idx=createCollisionIndex(propColliders(id,0,0,0,...MEADOW_FOOTPRINTS[id]));
 assert.equal(idx.at(2,0,0),null,'Shelter side aisle is walkable');assert.ok(idx.at(0,0,0),'Table remains solid');
 assert.ok(idx.at(MEADOW_FOOTPRINTS[id][0]/2-.3,0,2.25),'Shelter post is solid');
 const roof=roofEnvelope(id,0,0,0,...MEADOW_FOOTPRINTS[id],Math.PI/4);
 assert.ok(roofHeightAt([roof],0,0,0)>3,'Canopy shelters occupants from rain');
 assert.equal(roofHeightAt([roof],8,8,0),-Infinity,'Rain remains outside the canopy');
}
for(const id of Object.keys(MEADOW_FOOTPRINTS).filter(isMeadowFoliage))assert.equal(propColliders(id,0,0,0,...MEADOW_FOOTPRINTS[id]).length,0,'Foliage does not block players');
const sloped=new THREE.Group();settleMeadowFoliage('meadow_daisies',sloped,10,20,.8,(x,z)=>x*.2-z*.1);
assert.equal(sloped.position.y,-.02);const up=new THREE.Vector3(0,1,0).applyQuaternion(sloped.quaternion);assert.ok(up.distanceTo(new THREE.Vector3(-.2,1,.1).normalize())<1e-6,'Patch follows the terrain slope');
const animated=[];group.traverse(o=>{if(o.userData.bwMotion)animated.push(o);});assert.equal(animated.length,3,'One rotor and two kites survive scene composition');
const old=animated.map(o=>o.quaternion.clone());group.userData.update(.1);assert.ok(animated.every((o,i)=>!o.quaternion.equals(old[i])),'Animated nodes advance through the site update');
const testSpace={...space,id:'test',pieces:[{model:'meadow_daisies',x:0,z:0},{model:'meadow_lavender',x:0,z:0}],trees:[],rocks:[]};auditSpaces({test:testSpace});
assert.throws(()=>auditSpaces({test:{...testSpace,pieces:[{model:'meadow_windmill',x:0,z:0},{model:'meadow_wall',x:0,z:0}]}}),/stands in/,'Solid overlap checks stay enforced');
console.log(JSON.stringify({meadow:'verified',meshes,triangles,routeSamples:routes.flat().length,animatedNodes:animated.length,collisionBodies:physical.bodies.length}));
