import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
const root=new URL('../../../',import.meta.url),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const r=JSON.parse(fs.readFileSync(new URL('docs/art/widow-vault/captures/widow-performance.json',root)));
assert.equal(hash(fs.readFileSync(new URL('assets/models/widow-vault/widow-vault.glb',root))),r.assetSHA256);
for(const [file,expected]of Object.entries(r.sourceHashes))assert.equal(hash(fs.readFileSync(new URL(file,root))),expected,'Stale runtime measurement '+file);
assert.equal(r.measurements.length,2);
for(const m of r.measurements){assert.equal(m.frames,120);assert.equal(m.webglError,0);assert(m.medianMs>0&&m.p95Ms<16.67);assert(m.render.triangles>250000);assert(m.memory.textures>2);}
assert(r.disposal.before.geometries-r.disposal.after.geometries>=20);assert(r.disposal.before.textures-r.disposal.after.textures>=2);
console.log('WIDOW_PERFORMANCE_VERIFIED',JSON.stringify(r.measurements.map(m=>({viewport:[m.width,m.height],medianMs:m.medianMs,p95Ms:m.p95Ms}))));
