import assert from 'node:assert/strict';
import * as T from 'three';
import {createFollowCamera,EYE_HEIGHT,orbitPosition} from './camera.js';
import {cameraClearance} from './camera_obstruction.js';
import {createCollisionIndex} from '../world/collision/shapes.js';
import {createCameraBodyVisibility} from './camera_body_visibility.js';
const fixture=(bodies=[])=>{
 const cam=new T.PerspectiveCamera(55,2,.1,1800),input={drag:{dx:0,dy:0},wheel:0};
 const follow=createFollowCamera(cam,input),index=createCollisionIndex(bodies),height=()=>0;
 height.cameraDistance=index.cameraDistance;
 return{cam,follow,height,input,index};
};
const wall={kind:'box',x:0,y:0,z:-3,w:12,d:.05,h:14,c:1,s:0};
const p={x:0,y:0,z:0},target={x:0,y:EYE_HEIGHT,z:0};
const f=fixture([wall]);f.follow.snap(p,f.height);
const safe=()=>assert(f.index.cameraDistance(target,f.cam.position,cameraClearance(f.cam))>=f.cam.position.distanceTo(new T.Vector3(0,EYE_HEIGHT,0))-1e-8,'Final smoothed camera crossed a wall');
safe();assert(f.cam.position.z>-2.7,'Snap failed to retract');
const points=[];
for(let i=0;i<300;i++){f.follow.update(1/60,p,f.height);safe();if(i>200)points.push(f.cam.position.clone());}
assert(Math.max(...points.map(v=>v.distanceTo(points[0])))<1e-8,'Stationary camera oscillates at wall');
assert.equal(f.follow.distance,9,'Collision must preserve the requested zoom');
// Turning quickly around a corner checks the interpolated point, not merely
// the requested destination. Every rendered frame must stay on the safe side.
for(let i=0;i<360;i++){f.follow.yaw=i*Math.PI/180;f.follow.update(1/60,p,f.height);safe();}
f.follow.yaw=0;f.follow.snap(p,f.height);
let enabled=true;const g=fixture([{...wall,enabled:()=>enabled}]);g.follow.snap(p,g.height);
for(let i=0;i<60;i++)g.follow.update(1/60,p,g.height);
const close=g.cam.position.clone();enabled=false;
g.follow.update(1/60,p,g.height);assert(g.cam.position.distanceTo(close)<.02,'Recovery must not pop outward');
const distances=[];for(let i=0;i<180;i++){g.follow.update(1/60,p,g.height);distances.push(g.cam.position.distanceTo(new T.Vector3(0,EYE_HEIGHT,0)));}
assert(distances.every((d,i)=>!i||d>=distances[i-1]-1e-9),'Recovery oscillates');
assert(Math.abs(distances.at(-1)-9)<.001,'Recovery failed to restore the selected zoom');
// A newly appearing fixture must clamp immediately, regardless of smoothing.
enabled=true;g.follow.update(1/60,p,g.height);assert(g.cam.position.z>-2.7);
// No obstruction means exactly the existing free orbit, without cumulative
// safety-margin drift or a slower chase in the open.
const open=fixture();open.follow.snap(p,open.height);
for(let i=0;i<300;i++)open.follow.update(1/60,p,open.height);
const want=orbitPosition(target,open.follow.yaw,open.follow.pitch,open.follow.distance);
assert(open.cam.position.distanceTo(new T.Vector3(want.x,want.y,want.z))<1e-8);
const wide=new T.PerspectiveCamera(80,4,.3,100);assert(cameraClearance(wide)>.9,'Wide near plane needs sufficient clearance');
const tight=fixture();tight.height.cameraDistance=()=>0;tight.follow.yaw=.9;tight.follow.pitch=.4;tight.follow.snap(p,tight.height);
const heading=new T.Vector3();tight.cam.getWorldDirection(heading);
assert(heading.dot(new T.Vector3(Math.sin(.9)*Math.cos(.4),-Math.sin(.4),Math.cos(.9)*Math.cos(.4)))>.99999,'A fully retracted camera reset its heading');
for(let i=0;i<60;i++){tight.follow.update(1/60,p,tight.height);const dir=new T.Vector3();tight.cam.getWorldDirection(dir);assert(dir.distanceTo(heading)<1e-8,'Tight camera aim jitters');}
const body=new T.Group(),mesh=new T.Mesh(),light=new T.PointLight();body.add(mesh,light);mesh.layers.enable(3);const mask=mesh.layers.mask,visibility=createCameraBodyVisibility(body);
visibility.update(.5);assert(!mesh.layers.isEnabled(0)&&mesh.layers.isEnabled(3));assert(light.visible&&light.layers.isEnabled(0));
visibility.update(.95);assert(!mesh.layers.isEnabled(0),'Body flickered back into a close camera');
const gear=new T.Mesh();body.add(gear);visibility.update(.7);assert(!gear.layers.isEnabled(0),'New gear covered the retracted camera');
visibility.update(1.2);assert.equal(mesh.layers.mask,mask);assert(gear.layers.isEnabled(0));
console.log('CAMERA_OBSTRUCTION_VERIFIED',JSON.stringify({stationaryFrames:300,cornerFrames:360,recoveryFrames:180}));
