import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import manifest from '../../assets/models/cellars/descent/manifest.json' with {type:'json'};
import {createCollisionIndex,rampHeight} from './collision/shapes.js';
import {stepPlayer} from '../game/player.js';
let flights=0;
// An unobstructed 0.8-rise ramp is within the controller's slope limit and
// must remain smooth at normal walking speed, without alternating blocks.
{
 const index=createCollisionIndex([{kind:'ramp',x:0,z:5,y:0,w:4,d:10,h:8,c:1,s:0,direction:1,thickness:.3}]);
 const h=()=>0;h.supportAt=index.supportAt;h.canMove=index.canMove;
 const s={x:0,y:0,z:0,vx:0,vz:0,vy:0};
 for(let i=0;i<60;i++){stepPlayer(s,1/60,{z:1},h);assert(!s.blocked,'Unobstructed steep gallery stair stutters');}
 assert(s.z>6&&s.y>4.8,'Supported stairs should use normal walking speed');
}
for(const [height,roof,pass]of [[.25,false,true],[.25,true,false],[1,false,false]]){
 const bodies=[{kind:'box',model:'Landing',x:0,z:3,y:0,w:4,d:2,h:height,c:1,s:0}];
 if(roof)bodies.push({kind:'box',model:'Low ceiling',x:0,z:2,y:1.9,w:4,d:6,h:1,c:1,s:0});
 const index=createCollisionIndex(bodies),h=()=>0;h.supportAt=index.supportAt;h.canMove=index.canMove;h.ceilingAt=index.ceilingAt;
 const s={x:0,y:0,z:0,vx:0,vz:0,vy:0};for(let i=0;i<100;i++)stepPlayer(s,1/60,{z:1},h);
 assert.equal(s.z>2,pass,`Physical step ${height}, roof ${roof}: ${JSON.stringify(s)}`);
}
for(const summary of manifest.rooms){
 const room=JSON.parse(await readFile(new URL(`../../assets/models/cellars/descent/${summary.id}.json`,import.meta.url),'utf8'));
 const index=createCollisionIndex(room.colliders),h=()=>0;
 h.supportAt=(x,z,y)=>index.supportAt(x,z,y);h.canMove=(a,b)=>index.canMove(a,b,.32,1.75);h.ceilingAt=(x,z,y)=>index.ceilingAt(x,z,y);
 for(const ramp of room.colliders.filter(c=>c.model==='Supported gallery stair')){
  const direction=ramp.direction<0?-1:1,start=ramp.z-direction*ramp.d/2,end=ramp.z+direction*ramp.d/2;
  const s={x:ramp.x,z:start,y:ramp.y,vx:0,vz:0,vy:0,yaw:0,phase:0,t:0,airborne:false};
  let moved=0;
  while(direction*(end-s.z)>.1&&moved<600){stepPlayer(s,1/60,{z:1,yaw:direction<0?Math.PI:0},h);moved++;}
  assert(Math.abs(s.z-end)<.2,`${room.id} gallery stair blocked at ${JSON.stringify({ramp,s,hit:index.at(s.x,s.y,s.z,.32,1.75)})}`);
  assert(Math.abs(s.y-(ramp.y+ramp.h))<.15,`${room.id} gallery landing elevation`);
  // Walk back down the same flight, retaining the reached platform elevation.
  s.vx=0;s.vz=0;moved=0;
  while(direction*(s.z-start)>.1&&moved<600){stepPlayer(s,1/60,{z:1,yaw:direction>0?Math.PI:0},h);moved++;}
  assert(Math.abs(s.z-start)<.2,`${room.id} returning down gallery failed`);flights++;
 }
 if(['boss-01','boss-05'].includes(room.id))for(const side of [-1,1]){
  const archive=room.id==='boss-05',first=archive?18.3:16.8,s={x:side*first,y:0,z:-6.8,vx:0,vz:0,vy:0};
  const walk=(x,z)=>{let frames=0;while(Math.hypot(x-s.x,z-s.z)>.13&&frames++<700)stepPlayer(s,1/60,{z:1,yaw:Math.atan2(x-s.x,z-s.z)},h);
   assert(Math.hypot(x-s.x,z-s.z)<=.13,`${room.id} landing turn blocked toward ${x},${z}`);s.vx=0;s.vz=0;};
  walk(side*first,-19.3);
  if(archive){
   walk(side*14.7,-19.3);walk(side*14.7,-6.05);walk(side*17.8,-6.05);walk(side*17.8,-19.3);assert(Math.abs(s.y-16.8)<.15);
   walk(side*17.8,-6.05);walk(side*14.7,-6.05);walk(side*14.7,-19.3);walk(side*first,-19.3);
  }else{walk(side*20.5,-19.3);walk(side*first,-19.3);}
  walk(side*first,-6.8);assert(s.y<.15);
 }
}
assert.equal(flights,6,'Expected command and two-tier archive galleries');
console.log('CELLAR_GALLERIES_VERIFIED',JSON.stringify({flights}));
