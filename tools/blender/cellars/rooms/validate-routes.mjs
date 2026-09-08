import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../..');
const rooms=JSON.parse(fs.readFileSync(path.join(root,'assets/models/cellars/rooms/manifest.json'))).rooms;
function supports(box,p,tolerance=.16) {
  const dx=p[0]-box.x,dz=p[2]-box.z;const x=dx*box.c-dz*box.s,z=dx*box.s+dz*box.c;
  return box.kind==='box'&&Math.abs(x)<=box.w/2+tolerance&&Math.abs(z)<=box.d/2+tolerance&&Math.abs(p[1]-(box.y+box.h))<tolerance;
}
assert.ok(supports({kind:'box',x:0,y:2,z:0,w:4,h:1,d:4,c:1,s:0},[0,3,0]));
assert.ok(!supports({kind:'box',x:0,y:2,z:0,w:4,h:1,d:4,c:1,s:0},[0,0,0]));
for(const r of rooms) {
  assert.equal(r.ground.height,0);assert.equal(r.ground.shape,'ellipse');assert.ok(r.features.portalWidth>=12);
  const ramps=r.colliders.filter(c=>c.kind==='ramp');assert.equal(ramps.length,r.routes.length);
  const reachable=new Set([0,...r.ground.holes.map(h=>-h.depth)]);let pending=[...r.routes];
  for(let pass=0;pass<10&&pending.length;pass++)pending=pending.filter(route=>{
    assert.ok(route.width>=5);assert.ok(route.rise/route.length<=.6);
    const ramp=ramps.find(c=>c.model===route.name&&Math.abs(c.x-route.start[0])<.001&&Math.abs(c.y-route.start[1])<.001);assert.ok(ramp);assert.equal(Math.abs(route.end[2]-route.start[2]),ramp.d);
    assert.ok(Math.abs(route.end[1]-route.start[1]-ramp.h)<1e-5);
    if(!reachable.has(route.start[1]))return true;
    assert.ok(route.start[1]===0||r.colliders.some(c=>supports(c,route.start)),`Room ${r.level}: unsupported ramp start ${route.name}`);
    assert.ok(r.colliders.some(c=>supports(c,route.end)),`Room ${r.level}: unsupported ramp end ${route.name}`);
    reachable.add(route.end[1]);return false;
  });
  assert.equal(pending.length,0,`Room ${r.level} disconnected stair flights`);
  for(const a of ramps)for(const b of ramps)if(a!==b&&Math.abs(a.y+a.h-b.y)<.01&&a.direction!==b.direction&&Math.abs(a.z-b.z)<.01) {
    assert.ok(Math.abs(a.x-b.x)>=(a.w+b.w)/2+.6,`Room ${r.level}: stacked switchbacks do not leave actor head clearance`);
  }
  const galleries=r.colliders.filter(c=>c.model==='Walkable side gallery');
  for(const gallery of galleries)assert.ok(reachable.has(gallery.y+gallery.h),`Room ${r.level}: inaccessible gallery`);
  assert.equal(new Set(galleries.map(c=>c.y+c.h)).size,r.features.galleryLevels);
  // Ground-level approach corridor remains open for the final eight metres at all four portals.
  for(const [axis,sign] of [[0,1],[0,-1],[2,1],[2,-1]]) {
    const radius=axis===0?r.ground.rx:r.ground.rz;
    for(let distance=radius-8;distance<=radius;distance+=1)for(let across=-7.5;across<=7.5;across+=1.5) {
      const p=[0,1,0];p[axis]=sign*distance;p[axis===0?2:0]=across;
      assert.ok(!r.colliders.some(c=>{
        const dx=p[0]-c.x,dz=p[2]-c.z,x=dx*c.c-dz*c.s,z=dx*c.s+dz*c.c;
        return c.kind==='box'&&c.y<1.8&&c.y+c.h>.6&&Math.abs(x)<c.w/2+.4&&Math.abs(z)<c.d/2+.4;
      }),`Room ${r.level}: blocked cardinal portal at ${p}`);
    }
  }
  if(r.level===6) {
    assert.equal(r.ground.holes.length,1);const hole=r.ground.holes[0];assert.equal(hole.depth,16);
    const crossing=r.colliders.filter(c=>c.model.startsWith('Pit ')&&c.model.endsWith(' bridge'));assert.equal(crossing.length,2);
    for(let x=-14;x<=14;x++)assert.ok(crossing.some(c=>supports(c,[x,0,0])),'Unsupported pit crossing');
    for(let z=-14;z<=14;z++)assert.ok(crossing.some(c=>supports(c,[0,0,z])),'Unsupported pit crossing');
    assert.ok(!crossing.some(c=>supports(c,[9,0,9])),'Pit is incorrectly covered');
  }
  if(r.level===7) {
    const bridge=r.colliders.find(c=>c.model==='Titan rib bridge'),landing=r.colliders.find(c=>c.model==='Titan rib bridge landing');
    assert.ok(bridge&&landing);assert.ok(supports(bridge,[0,18,-20]));assert.ok(supports(landing,[0,18,-22]));
    assert.ok(galleries.filter(c=>supports(c,[c.x,18,-22])).length===2,'Titan bridge must connect both upper galleries');
  }
  if(r.level===8)assert.ok(r.colliders.every(c=>Math.hypot(Math.max(0,Math.abs(c.x)-c.w/2),Math.max(0,Math.abs(c.z)-c.d/2))>35||c.y>44),'Boss arena clearance');
  console.log(`Room ${r.level}: ${r.routes.length} connected flights, ${r.features.galleryLevels} gallery levels, four clear portals`);
}
console.log('CELLAR_ROOM_ROUTES_VERIFIED');
