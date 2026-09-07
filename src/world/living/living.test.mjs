import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from 'three';
import {HABITATS} from '../../mmo/greenwold/habitats.js';
import {SPACES} from '../../mmo/spaces/index.js';
import {livingErrors} from '../../mmo/living_schema.js';
import {createWorldField} from '../field.js';
import {createTerrainEdits} from '../terrain_edits.js';
import {createLivingWorld} from './runtime.js';
import {livingRows,selectLiving,canopyAt,LIVING_LIMITS} from './selection.js';
import {buildLivingProp} from './models.js';
import {instancePropMesh} from '../prop_lod.js';
import {LIVING_DRESSING} from '../../mmo/living_catalog.js';
import {FOOTPRINT} from '../../mmo/plans/footprints.js';
import {cornersOf,rectOf} from '../../mmo/plans/plan_schema.js';
import {routeDistance} from '../../mmo/greenwold/routes.js';
import {createForageField,FORAGE_BY_ID,REGROW_MS} from '../forage.js';
import {blankCharacter} from '../../game/state.js';
import {playerActor} from '../../game/actor.js';
import {createInventory} from '../../game/inventory.js';
import {createForaging} from '../../game/foraging.js';
import {createChests} from '../../game/chests.js';
import {spaceSiteRow} from '../sites.js';
import {authoredPick} from '../../mmo/greenwold/interactions.js';
import {plannedSpawnsForChunk} from '../../game/monsters.js';
const field=createWorldField(20260904),edits=createTerrainEdits();edits.load(JSON.parse(readFileSync('public/terrain/greenwold.json')));field.setTerrainEdits(edits);
const manifest=JSON.parse(readFileSync('docs/mmo/greenwold/living-import.json'));
for(const [path,row]of Object.entries(manifest.files))assert.equal(createHash('sha256').update(readFileSync('src/vendor/living-studio/'+path)).digest('hex'),row.sha256);
let triangles=0,largest=0;
for(const row of LIVING_DRESSING){const mesh=buildLivingProp('lw_'+row.id);assert.ok(mesh.geometry.userData.maxDistance<=150);const n=mesh.geometry.attributes.position.count/3;triangles+=n;largest=Math.max(largest,n);assert.equal(mesh.children.length,0);mesh.geometry.dispose();mesh.material.dispose();}
const rows=livingRows(SPACES),scene=new THREE.Scene(),sc={scene,lights:{hemi:{intensity:1},ambient:{intensity:1},sun:{intensity:1}}},world=createLivingWorld(sc,field);
const tick=async(eye,day=1,hidden=false,t=1)=>{for(const l of Object.values(sc.lights))l.intensity=1;world.update(.5,t,eye,day,{rain:0,snow:0},hidden);await new Promise(r=>setImmediate(r));};
let props=0,nightSpawns=0,gathered=0,caches=0,animated=0;
const hud={log(){},toast(){}},character=blankCharacter(),actor=playerActor(character,{pos:{x:0,y:0,z:0}}),inventory=createInventory({character,actor,hud});
const forage=createForageField(new THREE.Scene(),{field,now:()=>0}),gathering=createForaging({field:forage,character,actor,inventory,hud,rng:()=>0,now:()=>0});
for(const h of HABITATS){
 assert.deepEqual(livingErrors(h),[]);assert.deepEqual(SPACES[h.id].pieces.map(p=>{const{tag,...rest}=p;return rest;}),h.pieces);
 for(const p of h.pieces){const x=h.at.x+p.x,z=h.at.z+p.z;assert.equal(field.sampleAt(x,z).water,false,h.id+': prop under water');assert.ok(routeDistance(x,z)>2,h.id+': prop in road');
  const hs=cornersOf(rectOf(p)).map(([x,z])=>field.heightAt(h.at.x+x,h.at.z+z));assert.ok(Math.max(...hs)-Math.min(...hs)<1,h.id+'.'+p.model+': buried footing');props++;
 }
 for(const a of h.animals||[])assert.equal(field.sampleAt(h.at.x+a.x,h.at.z+a.z).water,false,h.id+': animal on river bed');
 const site=spaceSiteRow(SPACES[h.id],field);
 for(const spawn of h.spawns||[]){const x=h.at.x+spawn.x,z=h.at.z+spawn.z,chunk=[Math.floor(x/64),Math.floor(z/64)];const matches=night=>plannedSpawnsForChunk(field,...chunk,[site],night).some(r=>r.id===spawn.id&&Math.hypot(r.x-x,r.z-z)<.01);assert.equal(matches(true),true);assert.equal(matches(false),!spawn.night);nightSpawns++;}
 for(const row of h.forage||[]){const x=h.at.x+row.x,z=h.at.z+row.z,season=FORAGE_BY_ID[row.id].seasons[0];forage.update(x,z,season,REGROW_MS);const rec=forage.records().find(p=>p.authored===`${h.id}:${row.id}:${row.x}:${row.z}`);assert.ok(rec,h.id+': forage streams');Object.assign(actor.pos,{x:x+100,z});assert.equal(gathering.harvest(rec,0).reason,'too_far');Object.assign(actor.pos,{x,z});assert.equal(gathering.harvest(rec,0).ok,true);assert.equal(gathering.harvest(rec,1).reason,'picked');assert.ok(inventory.pack.items.some(i=>i?.base===row.id));gathered++;}
 for(const p of h.pieces.filter(p=>p.model==='loot_sack')){const cache=authoredPick(site,p.model,{x:h.at.x+p.x,z:h.at.z+p.z}).chest;const chests=createChests({character,inventory,actor,hud,rng:()=>0});assert.equal(chests.open(cache,{at:{x:cache.x+100,z:cache.z}}).reason,'too_far');assert.equal(chests.open(cache,{at:cache}).ok,true);assert.equal(chests.open(cache,{at:cache}).reason,'already');caches++;}
 for(const day of [1,0]){await tick(h.at,day);const stats=world.stats;assert.ok(stats.effects.length<=6&&stats.animals.length<=6&&stats.lights<=4);assert.deepEqual(stats.errors,[]);assert.equal(stats.effects.length,selectLiving(rows.effects,'effects',h.at,day,{rain:0,snow:0}).length);if(day===1)assert.equal(stats.lights,0);}
 if(h.animals?.length){await tick(h.at,1,false,1);world.root.updateMatrixWorld(true);const first=[];world.root.traverse(o=>{if(o.userData.motion)first.push(o.matrixWorld.toArray());});await tick(h.at,1,false,2);world.root.updateMatrixWorld(true);const second=[];world.root.traverse(o=>{if(o.userData.motion)second.push(o.matrixWorld.toArray());});assert.notDeepEqual(first,second,h.id+': studio animal actually moves');animated+=h.animals.length;}
}
assert.equal(canopyAt(-1095,30),1);assert.equal(canopyAt(450,-145),0);
await tick({x:-1095,z:30});assert.ok(sc.lights.hemi.intensity<1);
await tick({x:450,z:-145},0,true);assert.equal(world.root.visible,false);assert.equal(world.stats.effects.length+world.stats.animals.length+world.stats.lights,0);
await tick(HABITATS[0].at);assert.equal(world.root.visible,true);await tick({x:5000,z:5000});assert.equal(world.stats.effects.length+world.stats.animals.length,0);
const bad={...HABITATS[0],effects:[{id:'no-effect',x:0,z:0,gate:'never'}]};assert.equal(livingErrors(bad).length,2);
const dense=Array.from({length:30},(_,i)=>({key:String(i),x:i,z:0,gate:'night'}));assert.equal(selectLiving(dense,'effects',{x:0,z:0},0,{}).length,LIVING_LIMITS.effects);assert.equal(selectLiving(dense,'effects',{x:0,z:0},1,{}).length,0);assert.equal(selectLiving(dense,'effects',{x:0,z:0},0,{},true).length,0);
// A terrain edit moves active emitters with their authored ground next tick.
const smoke=HABITATS.find(h=>h.id.endsWith('_charcoal'));await tick(smoke.at);
const oldY=world.root.getObjectByName('chimney_smoke').position.y;
edits.stroke({kind:'plateau',x:smoke.at.x,z:smoke.at.z,r:8,height:field.heightAt(smoke.at.x,smoke.at.z)+2});await tick(smoke.at);
assert.ok(Math.abs(world.root.getObjectByName('chimney_smoke').position.y-oldY-2)<.01);
world.dispose();assert.equal(scene.children.length,0);forage.dispose();
const unloaded=createLivingWorld(sc,createWorldField(20260904));unloaded.update(.5,1,HABITATS[0].at,1,{});await new Promise(r=>setImmediate(r));assert.equal(unloaded.stats.effects.length+unloaded.stats.animals.length,0);unloaded.dispose();
// The real instancing seam culls small dressing, and restores it on return.
const mesh=buildLivingProp('lw_lantern_post'),lod=instancePropMesh(mesh,[new THREE.Matrix4().makeTranslation(200,0,200)]),camera=new THREE.PerspectiveCamera();lod.updateMatrixWorld(true);
const level=x=>{camera.position.set(x,2,200);camera.updateMatrixWorld();lod.update(camera);return lod.getCurrentLevel();};assert.equal(level(205),0);assert.equal(level(400),1);assert.equal(level(205),0);lod.traverse(o=>{if(o.isInstancedMesh)o.dispose();});mesh.geometry.dispose();mesh.material.dispose();
console.log(JSON.stringify({habitats:HABITATS.length,props,animated,gathered,caches,nightSpawns,library:LIVING_DRESSING.length,triangles,largest}));
