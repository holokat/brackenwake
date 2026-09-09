import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
const root=new URL('../../../',import.meta.url),asset=new URL('assets/models/widow-vault/',root);
const buffer=fs.readFileSync(new URL('widow-vault.glb',asset));
assert.equal(buffer.readUInt32LE(0),0x46546c67);assert.equal(buffer.readUInt32LE(4),2);assert.equal(buffer.readUInt32LE(8),buffer.length);
assert(buffer.length<25*1024*1024,'Cloudflare individual asset limit');
const n=buffer.readUInt32LE(12),doc=JSON.parse(buffer.subarray(20,20+n)),binary=buffer.subarray(28+n);
assert.equal(doc.meshes.length,20);assert.equal(doc.materials.length,20);assert(!doc.cameras);assert(!doc.nodes.some(n=>n.name==='Cube'));
assert(doc.extensionsRequired.includes('KHR_mesh_quantization'));
const widths={5126:4,5125:4,5123:2,5122:2,5121:1},counts={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};
let triangles=0,positions=0;const bounds=[[Infinity,Infinity,Infinity],[-Infinity,-Infinity,-Infinity]];
for(const mesh of doc.meshes)for(const p of mesh.primitives){
 assert.equal(p.mode??4,4);triangles+=doc.accessors[p.indices].count/3;assert(!('COLOR_1' in p.attributes));
 for(const [semantic,id]of Object.entries(p.attributes)){
  const a=doc.accessors[id],v=doc.bufferViews[a.bufferView],width=widths[a.componentType],components=counts[a.type],stride=v.byteStride||width*components;
  assert(v.byteOffset+v.byteLength<=binary.length);assert(stride* a.count<=v.byteLength);assert.equal(v.byteOffset%4,0);
  if(semantic==='NORMAL'){assert.equal(a.componentType,5122);assert.equal(a.normalized,true);assert.equal(stride,8);}
  if(semantic==='POSITION')for(let i=0;i<a.count;i++){positions++;for(let k=0;k<3;k++){const value=binary.readFloatLE(v.byteOffset+i*stride+k*4);assert(Number.isFinite(value));bounds[0][k]=Math.min(bounds[0][k],value);bounds[1][k]=Math.max(bounds[1][k],value);}}
 }
}
const spec=JSON.parse(fs.readFileSync(new URL('manifest.json',asset)));
assert.equal(triangles,spec.metrics.triangles);assert(bounds[1][1]-bounds[0][1]>44);assert(bounds[1][0]-bounds[0][0]>84);
for(const m of doc.materials){assert(m.pbrMetallicRoughness.baseColorFactor);assert(!m.normalTexture,'Height is not a tangent-space normal map');}
assert.equal(doc.images.length,2);for(const im of doc.images){const v=doc.bufferViews[im.bufferView],png=binary.subarray(v.byteOffset,v.byteOffset+v.byteLength);assert.equal(png.readUInt32BE(16),512);assert.equal(png.readUInt32BE(20),512);}
assert.equal(spec.colliders.filter(c=>c.kind==='ramp').length,3);assert.equal(spec.anchors.filter(a=>a.kind==='cart').length,4);assert.equal(spec.anchors.filter(a=>a.kind==='webAnchor').length,20);
assert(fs.statSync(new URL('widow-vault.blend',asset)).size>1000000);
assert(fs.statSync(new URL('docs/art/widow-vault/concept.png',root)).size>100000);
const report=JSON.parse(fs.readFileSync(new URL('docs/art/widow-vault/build-report.json',root)));
assert.equal(report.assetSHA256,crypto.createHash('sha256').update(buffer).digest('hex'));
for(const [id,hash]of Object.entries(report.packing.sourceAccessorHashes)){const a=doc.accessors[id],v=doc.bufferViews[a.bufferView];assert.equal(crypto.createHash('sha256').update(binary.subarray(v.byteOffset,v.byteOffset+v.byteLength)).digest('hex'),hash,'Position/index bytes changed');}
assert(report.packing.maxNormalComponentError<.000016);assert.equal(report.profile.backend,'METAL');assert.equal(report.profile.metalrt,'AUTO');assert(report.profile.persistentData);assert(report.profile.gpuDenoising);
console.log('WIDOW_ASSET_VERIFIED',JSON.stringify({triangles,positions,bytes:buffer.length,bounds,materials:doc.materials.length}));
