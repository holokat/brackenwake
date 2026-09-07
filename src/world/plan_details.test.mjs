import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {buildPlan,registerProp,forgetProp,FOOTPRINT} from './plan_models.js';
import {parseGLB} from '../../tools/validate-glb.mjs';
import {MILL_SOCKET,attachmentFor} from '../mmo/plans/attachments.js';

const site={id:'details',x:100,z:200,y:50,kind:'landmark',name:'Details'};
const plan={id:'details',radius:20,pieces:[],runs:[],areas:[],people:[],spawns:[]};
const ground=()=>50;
// Thin geometry used to disappear entirely under a fixed 18 cm bedding depth.
// Exercise both placements and runs through the actual plan builder.
for(const model of['road_slab_2m','rail_2m']){
 const [w,d,h]=FOOTPRINT[model];
 registerProp(model,new THREE.Mesh(new THREE.BoxGeometry(w,h,d),new THREE.MeshStandardMaterial()));
 for(const run of[false,true]){
  const data=run?{runs:[{model,from:{x:-3,z:0},to:{x:3,z:0}}]}:{pieces:[{model,x:0,z:0}]};
  const built=buildPlan({...plan,...data},site,ground);
  const box=new THREE.Box3().setFromObject(built);
  assert.ok(box.max.y>50+h*.9,`${model}: top remains above the ground`);
  assert.ok(box.min.y<50&&box.min.y>50-h*.1,`${model}: base is still bedded`);
 }
 forgetProp(model);
}

// Check the imported asset's animation contract, then the runtime that consumes
// it. Static instancing must not swallow the wheel's moving child.
const {json}=parseGLB(readFileSync(new URL('../../public/models/props/mill_wheel.glb',import.meta.url)));
assert.ok(json.nodes.some(n=>n.name==='mill_wheel_pivot'));
const source=new THREE.Group(),pivot=new THREE.Group();pivot.name='mill_wheel_pivot';
pivot.add(new THREE.Mesh(new THREE.BoxGeometry(1,4,4),new THREE.MeshStandardMaterial()));source.add(pivot);
registerProp('mill_wheel',source);
const mill=buildPlan({...plan,pieces:[{model:'mill_wheel',x:0,z:0}]},site,ground);
const wheel=mill.getObjectByName('mill_wheel_pivot');assert.ok(wheel);
assert.equal(Math.abs(wheel.rotation.x),0);mill.userData.update(2);assert.equal(wheel.rotation.x,1.1);
assert.equal(pivot.rotation.x,0); // One mill must not animate its cached prototype.
forgetProp('mill_wheel');
assert.equal(buildPlan(plan,site,ground).userData.update,undefined);
const roofed=buildPlan({...plan,pieces:[{model:'inn',x:2,z:3,yaw:90,scale:2},{model:'chapel_sunken',x:20,z:0}]},site,ground);
assert.equal(roofed.userData.weatherRoofs.length,1);
const roof=roofed.userData.weatherRoofs[0];
assert.equal(roof.x,102);assert.equal(roof.z,203);assert.equal(roof.w,28);assert.equal(roof.d,18);
assert.ok(Math.abs(roof.y-67.82)<.001);assert.ok(Math.abs(roof.s-1)<.001);
registerProp('mill_wheel',source);
const attachedPlan={...plan,pieces:[{model:'mill',x:0,z:0,yaw:81.22,scale:1.25},{model:'mill_wheel',x:99,z:99,yaw:0,scale:1.25,on:'mill'}]};
const attached=buildPlan(attachedPlan,site,ground),axle=attached.getObjectByName('mill_wheel_pivot');
const socket=attachmentFor(attachedPlan.pieces[1],attachedPlan),centre=axle.getWorldPosition(new THREE.Vector3());
assert.ok(Math.abs(centre.x-site.x-socket.x)<1e-6&&Math.abs(centre.z-site.z-socket.z)<1e-6);
assert.ok(Math.abs(centre.y-(50-.18+MILL_SOCKET[1]*1.25))<1e-6);
forgetProp('mill_wheel');
console.log('Thin pieces and runs remain visible; the imported wheel pivot animates only its placed copy.');
