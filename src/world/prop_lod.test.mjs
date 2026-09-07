import assert from 'node:assert/strict';
import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {instancePropMesh,preparePropLods} from './prop_lod.js';
import {parseGLB} from '../../tools/validate-glb.mjs';
import {validatePropBuffer} from '../../tools/validate-props.mjs';
import {structures,entryFor} from '../game/editor/palette.js';
import {auditSpaces} from '../mmo/plans/plan_schema.js';

const report=JSON.parse(readFileSync(new URL('../../docs/mmo/greenwold/structure-import.json',import.meta.url)));
const manifest=JSON.parse(readFileSync(new URL('../../public/models/props/manifest.json',import.meta.url)));
let total=0,mid=0,far=0;
for(const row of report.records){
 const file=readFileSync(new URL(`../../public/models/props/${row.id}.glb`,import.meta.url));
 const {json,bin}=parseGLB(file),checks=validatePropBuffer(file,row.id);
 assert.deepEqual(checks.checks.filter(c=>!c.ok&&c.name!=='triangles inside the budget'),[],row.id);
 assert(manifest.ids.includes(row.id));
 const palette=structures(id=>manifest.ids.includes(id));assert(palette.some(p=>p.id===row.id&&p.real&&p.placeable));
 const placed=entryFor('structures',row.id,0,0);
 auditSpaces({review:{id:'review',name:'Review',at:{x:0,z:0},radius:100,pieces:[placed.entry],runs:[],areas:[],trees:[],rocks:[],spawns:[],people:[],markers:[]}});
 for(const mesh of json.meshes){
  const p=mesh.primitives[0],n=json.accessors[p.attributes.POSITION].count;
  for(const ai of[p.indices,mesh.extras.kalderaLod.mid,mesh.extras.kalderaLod.far]){
   const a=json.accessors[ai],v=json.bufferViews[a.bufferView];assert.equal(a.componentType,5125);assert.equal(a.count%3,0);
   for(let i=0;i<a.count;i++)assert(bin.readUInt32LE(v.byteOffset+i*4)<n,`${row.id}: invalid distant index`);
  }
  assert(json.accessors[mesh.extras.kalderaLod.mid].count<=json.accessors[p.indices].count);
  assert(json.accessors[mesh.extras.kalderaLod.far].count<=json.accessors[p.indices].count);
 }
 total+=row.triangles;mid+=row.midTriangles;far+=row.farTriangles;
}
assert(far<total*.15);assert(mid<total*.4);
// The actual loader seam shares vertex storage; the actual instancer selects
// one level, preserves placements, and returns to full detail on approach.
const geometry=new THREE.BoxGeometry(2,4,2),material=new THREE.MeshStandardMaterial();
const source=new THREE.Mesh(geometry,material);source.userData.kalderaLod={mid:10,far:11};
const scene=new THREE.Group();scene.add(source);
await preparePropLods({scene,parser:{getDependency:async()=>new THREE.Uint32BufferAttribute([0,1,2],1)}});
const group=instancePropMesh(source,[new THREE.Matrix4().makeTranslation(1000,0,-900)]);
assert(group.isLOD);assert.equal(group.levels[1].object.geometry.attributes.position,geometry.attributes.position);
const camera=new THREE.PerspectiveCamera();group.updateMatrixWorld(true);
const current=(x,z)=>{camera.position.set(x,3,z);camera.updateMatrixWorld();group.update(camera);return group.getCurrentLevel();};
assert.equal(current(1005,-900),0);assert.equal(current(1080,-900),1);assert.equal(current(1400,-900),2);assert.equal(current(1005,-900),0);
assert.equal(group.levels.filter(l=>l.object.visible).length,1);
const matrix=new THREE.Matrix4();group.levels[0].object.getMatrixAt(0,matrix);matrix.premultiply(group.levels[0].object.matrixWorld);
assert.deepEqual(new THREE.Vector3().setFromMatrixPosition(matrix).toArray(),[1000,0,-900]);
console.log(JSON.stringify({models:report.records.length,nearTriangles:total,midTriangles:mid,farTriangles:far,nearOverOriginalBudget:report.records.filter(r=>r.nearOverBudget).length,lodDirections:'near to far and back passed'}));
