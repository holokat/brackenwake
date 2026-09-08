import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { verifyCathedralStructure } from './structural-check.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../..');
const dir=path.join(root,'assets/models/cellars/rooms');
export function parseGlb(bytes) {
  assert.equal(bytes.toString('utf8',0,4),'glTF');assert.equal(bytes.readUInt32LE(4),2);assert.equal(bytes.readUInt32LE(8),bytes.length);
  const length=bytes.readUInt32LE(12);assert.equal(bytes.readUInt32LE(16),0x4e4f534a);
  const json=JSON.parse(bytes.subarray(20,20+length).toString());assert.equal(json.asset.version,'2.0');return json;
}
assert.throws(()=>parseGlb(Buffer.from('invalid room asset')),/glTF|bounds|range/i);
const combined=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json')));assert.equal(combined.rooms.length,8);
let total=0;
for(let level=1;level<=8;level++) {
  const name=`cellar-room-${String(level).padStart(2,'0')}`;
  const m=JSON.parse(fs.readFileSync(path.join(dir,`${name}.json`)));const bytes=fs.readFileSync(path.join(dir,`${name}.glb`));const gltf=parseGlb(bytes);
  const binStart=28+bytes.readUInt32LE(12);
  assert.equal(m.level,level);assert.equal(m.assetSha256,crypto.createHash('sha256').update(bytes).digest('hex'));
  assert.equal(m.metrics.glbBytes,bytes.length);assert.ok(!gltf.cameras?.length);assert.ok(!gltf.extensions?.KHR_lights_punctual);
  let triangles=0;const bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
  for(const mesh of gltf.meshes) for(const primitive of mesh.primitives) {
    assert.equal(primitive.mode??4,4);const indices=gltf.accessors[primitive.indices];assert.equal(indices.count%3,0);triangles+=indices.count/3;
    const positions=gltf.accessors[primitive.attributes.POSITION];assert.equal(positions.type,'VEC3');assert.ok(positions.count>0);
    const pv=gltf.bufferViews[positions.bufferView];assert.equal(positions.componentType,5126);
    for(let vertex=0;vertex<positions.count;vertex++)for(let axis=0;axis<3;axis++)assert.ok(Number.isFinite(bytes.readFloatLE(binStart+(pv.byteOffset??0)+(positions.byteOffset??0)+vertex*(pv.byteStride??12)+axis*4)),'Nonfinite exported vertex');
    const iv=gltf.bufferViews[indices.bufferView];const indexBytes=indices.componentType===5125?4:2;assert.ok([5123,5125].includes(indices.componentType));
    for(let index=0;index<indices.count;index++){const at=binStart+(iv.byteOffset??0)+(indices.byteOffset??0)+index*indexBytes;assert.ok((indexBytes===4?bytes.readUInt32LE(at):bytes.readUInt16LE(at))<positions.count,'Out-of-bounds triangle index');}
    for(let axis=0;axis<3;axis++){assert.ok(Number.isFinite(positions.min[axis]));assert.ok(Number.isFinite(positions.max[axis]));bounds.min[axis]=Math.min(bounds.min[axis],positions.min[axis]);bounds.max[axis]=Math.max(bounds.max[axis],positions.max[axis]);}
  }
  assert.equal(triangles,m.metrics.triangles);assert.ok(triangles>40000&&triangles<=200000,`Room ${level}: ${triangles} triangles`);
  assert.ok(gltf.meshes.length<=24);assert.ok(gltf.materials.length>=8);assert.equal(gltf.meshes.length,m.metrics.meshCount);
  for(let axis=0;axis<3;axis++) for(const side of ['min','max'])assert.ok(Math.abs(bounds[side][axis]-m.bounds[side][axis])<.01,`Room ${level} axis ${axis}: exported coordinates`);
  const span=m.bounds.max[0]-m.bounds.min[0];assert.ok(span>(level===8?150:88)&&span<(level===8?176:108));
  assert.ok(m.anchors.length>=14);assert.ok(m.routes.length>=2);assert.ok(m.landmarks.length>=4);
  assert.equal(m.features.caveVault.irregularRings,7);assert.ok(m.features.caveVault.smallStalactites>=42);
  const ceilingMesh=gltf.meshes.find(mesh=>mesh.primitives.some(p=>gltf.materials[p.material].name==='Cellar ceiling'));
  assert.ok(ceilingMesh,'Missing separate cave ceiling');assert.ok(gltf.accessors[ceilingMesh.primitives[0].indices].count/3>1200,'Collapsed cave relief');
  const ceilingPosition=gltf.accessors[ceilingMesh.primitives[0].attributes.POSITION];
  const highestRoute=Math.max(...m.routes.flatMap(route=>[route.start[1],route.end[1]]));
  assert.ok(ceilingPosition.min[1]>highestRoute+1.8,`Room ${level}: ceiling or stalactite breaches route headroom`);
  for(const c of m.collision){assert.ok(['box','ramp'].includes(c.kind));for(const key of ['x','y','z','w','h','d','c','s'])assert.ok(Number.isFinite(c[key]));assert.ok(c.w>0&&c.h>0&&c.d>0);assert.ok(Math.abs(c.c*c.c+c.s*c.s-1)<1e-6);}
  for(const a of m.anchors){assert.ok(gltf.nodes.some(n=>n.name===a.name),`Missing exported anchor ${a.name}`);for(const k of ['x','y','z','intensity','radius'])assert.ok(Number.isFinite(a[k]));}
  const c=combined.rooms.find(r=>r.level===level);assert.equal(c.glb,`${name}.glb`);assert.deepEqual(c.colliders,m.collision);assert.deepEqual(c.anchors,m.anchors);
  if(level===8)console.log('Cathedral structure:',JSON.stringify(verifyCathedralStructure(bytes,gltf)));
  total+=triangles;console.log(`Room ${level}: ${triangles} triangles; ${gltf.meshes.length} material batches; ${bytes.length} bytes; ${m.collision.length} colliders`);
}
console.log(`CELLAR_ROOMS_VERIFIED ${total} total triangles`);
