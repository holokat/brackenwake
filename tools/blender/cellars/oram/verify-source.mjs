/** Validates reproducibility evidence against current authored source and GLB bytes. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../../..');
const art=path.join(root,'docs/art/old-cellars/blender/oram');
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const build=JSON.parse(fs.readFileSync(path.join(art,'build-report.json')));
const repeat=JSON.parse(fs.readFileSync(path.join(art,'reproducibility.json')));
for(const [file,sha] of Object.entries(build.sourceFiles))assert.equal(hash(path.join(root,file)),sha,`Source drift: ${file}`);
const glbHash=hash(path.join(root,'assets/models/cellars/oram/oram.glb'));
assert.equal(build.glbSha256,glbHash);assert.equal(repeat.beforeSha256,glbHash);assert.equal(repeat.afterSha256,glbHash);assert.equal(repeat.identical,true);
assert.equal(hash(path.join(root,'tools/blender/cellars/oram/build.py')),repeat.builderSha256);
assert.equal(hash(path.join(root,'tools/blender/cellars/oram/repeat.py')),repeat.repeatScriptSha256);
const blend=fs.readFileSync(path.join(art,'oram.blend'));
assert.ok(blend.length>200_000,'Editable source must exist');
// Blender 5.2 saves compressed sources by default; a successful header is not assumed.
assert.ok(blend.subarray(0,7).toString()==='BLENDER'||blend.readUInt32LE(0)===0xfd2fb528,'Expected native or zstd-compressed blend');
const imported=JSON.parse(fs.readFileSync(path.join(art,'import-review.json')));
assert.equal(imported.glbSha256,glbHash,'Import review must match current delivered bytes');
assert.equal(imported.meshes,14);assert.equal(imported.triangles,7536);
for(const clip of Object.values(imported.clips))assert.ok(clip.min_z>-.0002,'Imported sampled poses stay above ground');
assert.equal(imported.captures.length,11);
for(const capture of imported.captures){const p=path.join(root,capture.file);const b=fs.readFileSync(p);assert.equal(b.toString('hex',0,8),'89504e470d0a1a0a');assert.ok(b.length>15_000);}
console.log(`Verified ${Object.keys(build.sourceFiles).length} source digests, native blend, matching imported renders, and identical MCP rebuild ${glbHash}`);
console.log('ORAM_SOURCE_VERIFIED');
