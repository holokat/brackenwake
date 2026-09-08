import assert from 'node:assert/strict';
import {createCollisionIndex,propColliders,overlaps} from './shapes.js';
import {stepPlayer} from '../../game/player.js';
const box=(x,z,w,d,h=3,yaw=0,y=0)=>({kind:'box',x,z,w,d,h,y,c:Math.cos(yaw),s:Math.sin(yaw)});
const wall=box(0,0,8,.12),p=createCollisionIndex([wall]);
assert.equal(p.canMove({x:0,y:0,z:-4},{x:0,y:0,z:4}),false,'a fast step cannot tunnel through a thin wall');
assert.equal(p.canMove({x:5,y:0,z:-4},{x:5,y:0,z:4}),true,'walking around the wall works');
assert.equal(p.canMove({x:0,y:0,z:0},{x:0,y:0,z:-1}),true,'a saved position inside a new solid can leave');
assert.equal(createCollisionIndex([wall,box(0,-.5,8,.12)]).canMove({x:0,y:0,z:0},{x:0,y:0,z:-1}),false,'escaping one solid cannot cross another');
const rotated=box(0,0,4,.2,3,Math.PI/4);
assert.equal(overlaps(rotated,1,0,-1),true);assert.equal(overlaps(rotated,1,0,1),false);
const gate=createCollisionIndex(propColliders('cellar_arch',0,0,0,4,1,3));
assert.equal(gate.canMove({x:0,y:0,z:-2},{x:0,y:0,z:2}),true,'a human fits through the arch');
assert.equal(gate.canMove({x:1.6,y:0,z:-2},{x:1.6,y:0,z:2}),false,'the arch pillars are solid');
const ground=Object.assign(()=>0,{canMove:gate.canMove,supportAt:gate.supportAt,ceilingAt:gate.ceilingAt});
const jumper={x:0,y:0,z:0,yaw:0};let high=0;
for(let i=0;i<150;i++){stepPlayer(jumper,1/60,{jump:i===0},ground);high=Math.max(high,jumper.y);}
assert.ok(high<=.651,'jumping bumps the underside of the lintel');assert.equal(jumper.y,0);assert.equal(jumper.airborne,false);
const crate=createCollisionIndex([box(0,0,2,2,.7)]),platform=Object.assign(()=>0,{canMove:crate.canMove,supportAt:crate.supportAt,ceilingAt:crate.ceilingAt}),fall={x:0,y:2,z:0,airborne:true,vy:0,peakY:2,yaw:0};
for(let i=0;i<120;i++)stepPlayer(fall,1/60,{},platform);
assert.equal(fall.y,.7,'feet land on a crate rather than passing through it');assert.equal(fall.airborne,false);
let felled=false;const tree=createCollisionIndex([{kind:'circle',x:0,z:0,y:0,r:.4,h:8,enabled:()=>!felled}]);
assert.equal(tree.canMove({x:0,y:0,z:-1},{x:0,y:0,z:1}),false);felled=true;
assert.equal(tree.canMove({x:0,y:0,z:-1},{x:0,y:0,z:1}),true,'harvesting removes the obstruction immediately');
console.log('Collision: swept wall, rotated envelope, saved-position escape, arch clearance, head bump, platform landing and harvested trunk passed.');

// A suspended stair has a sloping underside. It leaves the lower flight traversable.
{
 const ramp={kind:'ramp',x:0,y:6,z:0,w:5,d:24,h:6,c:1,s:0,direction:-1,thickness:.4};
 const thin=createCollisionIndex([ramp]),solid=createCollisionIndex([{...ramp,thickness:undefined}]);
 const from={x:0,y:4.2,z:4.8},to={x:0,y:4.3,z:5};
 if(!thin.canMove(from,to,.3,1.8))throw Error('Suspended ramp blocks its lower flight');
 if(solid.canMove(from,to,.3,1.8))throw Error('Solid ramp control failed to block');
 const roof=thin.ceilingAt(0,4.8,4.2,1.8);if(Math.abs(roof-7.4)>.001)throw Error('Suspended ramp underside is not sloped');
 if(thin.at(0,7.5,4.8,.3,.1)===null)throw Error('Suspended stair surface became pass-through');
}
