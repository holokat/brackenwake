import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createCreatureModel} from '../../vendor/living-studio/models/creatures/index.js';
import {creatureById} from '../../vendor/living-studio/data/creature-catalog.js';
import {batchCreature} from './batch-creature.js';

const surfaceVertices=mesh=>{
  const out=[],g=mesh.geometry,p=g.attributes.position,skin=g.attributes.skinIndex,weights=g.attributes.skinWeight,color=g.attributes.color;
  for(const group of g.groups){
    const m=mesh.material[group.materialIndex];
    for(let i=group.start;i<group.start+group.count;i++){
      const c=new THREE.Color(m.color).multiply(new THREE.Color(m.vertexColors&&color?color.getX(i):1,m.vertexColors&&color?color.getY(i):1,m.vertexColors&&color?color.getZ(i):1));
      out.push(JSON.stringify([p.getX(i),p.getY(i),p.getZ(i),...Array.from({length:4},(_,j)=>skin.array[i*4+j]),...Array.from({length:4},(_,j)=>weights.array[i*4+j]),...c.toArray().map(Math.fround),...Object.values(g.morphAttributes).flatMap(attrs=>attrs.flatMap(a=>[a.getX(i),a.getY(i),a.getZ(i)])),m.roughness,m.metalness,m.opacity,m.emissive.getHex()]));
    }
  }
  return out.sort();
};
const result=[];
for(const id of creatureById.keys()){
  const actor=createCreatureModel(id,{}),skins=[];
  actor.group.traverse(o=>{if(o.isSkinnedMesh&&Array.isArray(o.material))skins.push({mesh:o,before:surfaceVertices(o),morphs:o.geometry.morphTargetsRelative});});
  const batches=batchCreature(actor);
  for(const s of skins){assert.deepEqual(surfaceVertices(s.mesh),s.before,id+': diffuse colours, surfaces, vertices, skin and morph weights survive batching');assert.equal(s.mesh.geometry.morphTargetsRelative,s.morphs);}
  for(const clip of actor.clips){actor.update(clip.duration*.45,clip.name);actor.group.updateMatrixWorld(true);assert.ok(new THREE.Box3().setFromObject(actor.group).getSize(new THREE.Vector3()).length()>.1);}
  assert.ok(batches.after<=batches.before,id+': does not increase draws');result.push({id,...batches});actor.dispose();
}
console.log(JSON.stringify(result));
