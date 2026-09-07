import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createForageField,REGROW_MS} from '../../world/forage.js';
import {createStudioForage} from './forage.js';
import {createForaging} from '../foraging.js';
import {createInventory} from '../inventory.js';
import {blankCharacter} from '../state.js';
import {playerActor} from '../actor.js';
const scene=new THREE.Scene(),world={seed:4,sampleAt:()=>({biome:'meadow',moist:.3}),heightAt:()=>0};
let now=1000;
const field=createForageField(scene,{field:world,season:'Autumn',now:()=>now,treesFor:()=>[]});field.update(0,0,'Autumn',now);
const detail=createStudioForage(field),character=blankCharacter(),actor=playerActor(character),inventory=createInventory({character,actor});
const foraging=createForaging({field,character,actor,inventory,now:()=>now});
const meshes=[];field.group.traverse(o=>{if(o.isInstancedMesh)meshes.push(o);});
const mesh=meshes.find(m=>m.count>2);assert.ok(mesh,'the live field contains a cluster');
const records=[mesh.userData.forageMap[mesh.count-1],mesh.userData.forageMap[0]];
const matrix=new THREE.Matrix4();let picks=0;
for(const rec of records){
 Object.assign(actor.pos,rec.members[0]);detail.update(1,actor.pos);assert.ok(detail.count>0);
 const before=field.count;assert.equal(foraging.harvest(rec,now).ok,true);assert.equal(field.count,before-1);picks++;
 assert.equal(foraging.harvest(rec,now).ok,false,'a second click cannot award the patch twice');
 detail.update(1,actor.pos);assert.equal(detail.root.children.some(g=>g.children.some(m=>m.userData.forage===rec)),false);
 now+=REGROW_MS-1;field.regrow(now);assert.ok(rec.harvestedUntil);
 now++;field.regrow(now);assert.equal(rec.harvestedUntil,0);assert.equal(field.count,before);
 detail.update(1,{x:10000,z:10000});
 for(let i=0;i<mesh.count;i++)if(mesh.userData.forageMap[i]===rec){mesh.getMatrixAt(i,matrix);assert.ok(Math.abs(matrix.determinant())>1e-8,'regrown far instance is visible after last-slot or swapped-slot harvest');}
}
assert.ok(inventory.pack.items.some(Boolean),'harvest reached the real inventory');
detail.dispose();field.dispose();assert.equal(scene.children.length,0);
console.log(JSON.stringify({realHarvests:picks,doublePickRefusals:picks,regrowthBeforeAndAtDeadline:picks,restoredInstanceMatrices:true}));
